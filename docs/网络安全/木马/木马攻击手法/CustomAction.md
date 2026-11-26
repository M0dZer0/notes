`CustomAction`（自定义操作）是 Windows Installer 为 MSI 安装包提供的扩展机制。标准 MSI 表可以描述复制文件、写注册表、创建快捷方式和注册服务等常规安装动作；遇到产品特有逻辑时，安装包可以登记一段额外代码，由 Windows Installer 在安装事务的特定阶段调用。

先说结论：

```text
CustomAction 是合法安装能力
恶意 MSI 可以滥用它执行任意安装外逻辑
当 DLL 型 CustomAction 被进程内加载时
行为主体在日志里可能直接显示为 msiexec.exe
```

这与“攻击者向 `msiexec.exe` 注入代码”不是一回事。

## 组成

MSI 本质上是一个带有关系表的安装数据库。和 CustomAction 分析最相关的对象包括：

- `CustomAction` 表：定义动作类型、代码来源、入口和参数。
- `InstallExecuteSequence` / `InstallUISequence`：决定动作在哪个阶段、满足什么条件时运行。
- `Binary` 表或已安装文件：可保存 DLL、脚本或其他动作内容。
- 安装属性：在前端、服务端和延迟执行阶段传递状态。

CustomAction 可以承载 DLL 导出函数、可执行文件、脚本、命令或其他安装扩展。具体能力、位数、上下文和回滚语义由动作类型与调度属性共同决定。

## msiexec 的客户端、服务端与 CustomAction 宿主

这里的“客户端 / 服务端”指**同一台机器上 Windows Installer 的分工**，不是下载 MSI 的网络客户端和远程服务器。一个安装过程可能同时存在多个 `msiexec.exe`，它们使用同一个程序文件，但承担不同职责。

### `/i`、`/V` 与 `-Embedding` 分别是什么

| 常见命令行形态 | 角色 | 主要工作 | 与 CustomAction 的关系 |
|---|---|---|---|
| `msiexec.exe /i example.msi` | 安装客户端 / 前端 | 接收安装请求、参数和属性，处理安装界面与用户选择，向安装服务提交请求并接收结果 | 可在 UI 或前期序列中调度立即动作；不只是一个完全不执行安装逻辑的启动器 |
| `msiexec.exe /V` | Windows Installer 服务端，服务名 `msiserver` | 接收客户端请求，处理执行序列、生成并执行安装操作记录，协调系统修改、回滚和提交 | 决定何时调用执行侧的动作，必要时交给独立 CustomAction 宿主 |
| `msiexec.exe -Embedding <内部标识> ...` | Custom Action Server，自定义操作宿主 | 接收安装引擎的动作调用，承载 DLL / 脚本等需要独立宿主的自定义代码，返回结果 | 是定位自定义代码实际执行进程的重要线索，但不是所有 CustomAction 都会产生这种进程 |

这三类命令行与进程角色的对应关系见微软 Windows Installer 团队的[后台机制说明](https://learn.microsoft.com/en-us/archive/blogs/astebner/more-info-about-how-msi-custom-actions-work-behind-the-scenes)。`/V` 和 `-Embedding` 属于这里讨论的内部启动形态，不是建议用户手工调用的安装步骤。

注意几个容易混淆的点：

- **不是一条 `msiexec /v /i` 命令依次进入三个阶段。** 应分别识别 `/i` 客户端、`/V` 服务进程和 `-Embedding` 动作宿主；它们可以并存，服务也可能在本次安装之前就已经启动。
- 独立的 `/V` 不等于 `/L*v install.log` 中的 `v`；后者是详细日志选项，也不要与 `/fv` 的修复选项混淆。公开命令行选项不区分大小写，不能靠大小写判断语义，要看完整参数结构。参见[命令行选项](https://learn.microsoft.com/en-us/windows/win32/msi/command-line-options)。
- `-Embedding` 是一个完整参数，不是 `- embedding` 两个参数；后面的内部标识不能直接当成 MSI 的 ProductCode 或某个动作名称。
- `msiserver` 通常由服务控制管理器启动，常见父进程为 `services.exe`，**不必是 `/i` 客户端的直接子进程**。客户端通过进程间通信把工作交给服务端，进程树不是完整调用链。
- `/V` 服务通常以 LocalSystem 运行，但具体动作可能模拟用户；`-Embedding` 本身也不能证明动作拥有 SYSTEM 权限。要检查动作属性、实际令牌，以及线程是否正在模拟用户。

### 安装过程：每一步做什么

下面描述常见的服务端参与安装路径，是逻辑流程，不是固定的父子进程树，也不表示每次都会启动三个新进程。

1. **发起与交互**：`/i` 客户端接收包路径、安装属性和 UI 选项。完整 UI 模式下，安装器可以运行 `InstallUISequence` 中的检查、属性计算和立即 CustomAction；静默安装不会因此失去客户端角色，但不会运行这套完整 UI 序列。
2. **进入执行序列、制定计划**：安装引擎处理 `InstallExecuteSequence`，进行校验、计算组件状态等。使用安装服务时，执行侧工作交给服务端；某些前期动作可能在客户端和服务端各处理一次，因此“执行序列”不能简单等同于“只在一个 `/V` PID 中运行”。参见[自定义操作排序规则](https://learn.microsoft.com/en-us/windows/win32/msi/sequencing-custom-actions)。
3. **生成安装脚本**：`InstallInitialize` 开始事务相关处理。引擎把需要稍后实施的操作记入安装脚本；遇到 Immediate 动作就执行，遇到 Deferred 动作则先记入计划。这里的“脚本”是 Installer 的内部操作记录，不等于生成一个 PowerShell 或 VBS 文件。
4. **执行系统修改**：`InstallExecute` / `InstallExecuteAgain`（如果包中有安排）或 `InstallFinalize` 推进安装脚本执行，实施文件、注册表、服务等修改，并运行到相应位置的 Deferred CustomAction。需要独立动作宿主时，引擎启动或使用 `-Embedding` 进程，调用动作并取得结果。参见[延迟动作](https://learn.microsoft.com/en-us/windows/win32/msi/deferred-execution-custom-actions)与 [InstallFinalize](https://learn.microsoft.com/en-us/windows/win32/msi/installfinalize-action)。
5. **成功提交或失败回滚**：成功路径执行已安排的 Commit 动作；失败并触发回滚时执行已安排的 Rollback 动作，最后向客户端报告结果。并非每个 MSI 都定义了这两种 CustomAction，也不能假设所有自定义修改都能自动撤销。

因此，`-Embedding` 不是“整个安装完成后才进入的第三阶段”，而是安装过程中按需参与工作的宿主；它可能服务于不同调度时机的动作。

## 执行阶段：CustomAction 何时运行

**进程角色回答“谁执行”，调度类型回答“何时执行”，两者是不同维度。** 不能把 `/i = Immediate`、`/V = Deferred`、`-Embedding = 安装后执行` 当成固定对应关系。

### Immediate

立即动作在序列处理遇到它或被显式调用时执行，可以读取和修改部分 MSI 属性；它既可能在 UI 序列，也可能在执行序列中出现。它通常用于检查和准备后续操作，但“立即”不等于“一定在 `/i` 进程内”，也不意味着代码不能产生副作用。

### Deferred

延迟动作在生成计划时只被排入安装脚本，到脚本执行阶段才真正运行。它必须安排在执行序列的 `InstallInitialize` 之后、`InstallFinalize` 之前，不能放在 UI 序列。它能访问的安装会话信息更受限制，通常通过 `CustomActionData` 接收预先准备的数据。参见[延迟执行规则](https://learn.microsoft.com/en-us/windows/win32/msi/deferred-execution-custom-actions)与[延迟动作上下文](https://learn.microsoft.com/en-us/windows/win32/msi/obtaining-context-information-for-deferred-execution-custom-actions)。

### Rollback 与 Commit

回滚动作在安装失败时撤销变化，提交动作则在事务即将成功结束时执行。恶意包可能把行为分散到不同阶段，导致只观察一个时间点时漏掉关键动作。

### Impersonated 与 NoImpersonate

动作是否模拟发起安装的用户，决定了它以用户上下文还是安装服务的高权限上下文运行。高权限并不是 CustomAction 自动拥有的：它取决于安装方式、包策略、系统配置和动作调度。

`NoImpersonate` 必须与 in-script 类型组合使用，适用于 Deferred 及其 Rollback / Commit 变体；不能给 Immediate 随便加上这个标志，就认为它能绕过用户上下文。即使动作从服务端被调度，也不代表它没有模拟用户。参见[脚本内执行选项](https://learn.microsoft.com/en-us/windows/win32/msi/custom-action-in-script-execution-options)。

:::warning
不要看到 `msiexec.exe` 就直接写“以 SYSTEM 执行”。Windows Installer 存在前端、服务端和自定义操作宿主等不同角色，必须用进程树、令牌、命令行和事件日志确认实际上下文。
:::

## CustomAction 的代码究竟在哪里执行

先分清三个“位置”：**定义在 MSI 的 `CustomAction` 表中，调度由序列表或显式调用决定，实际代码则在选定的宿主或子进程中运行。** 仅在表中发现一行定义，不代表它实际被调用过。

| 动作形式 | 实际执行位置 | 调查时看什么 |
|---|---|---|
| DLL 型 | 在加载该 DLL 的动作宿主地址空间内；常见宿主是 `msiexec.exe -Embedding ...` | 宿主 PID、DLL 模块加载、导出入口与动作日志 |
| 脚本型 | 在安装器选用的脚本执行环境 / 动作宿主中 | 脚本内容、引擎与宿主；不能预设一定出现 `wscript.exe` / `cscript.exe` |
| EXE 型 | 在被启动的可执行文件进程中 | 子进程路径、命令行、令牌与后续行为，而不是只盯着 `msiexec.exe` |
| 设置属性等非载荷型 | 由安装引擎直接处理 | 属性变化和序列；不必出现独立宿主或额外 DLL |

动作可以由服务端调度，却在独立 `-Embedding` 进程内执行。日志中的 “remote custom action” 在这里通常表示跨进程调用，**不是把代码发到远程机器运行**。关于动作形式，参见[CustomAction 概述](https://learn.microsoft.com/en-us/windows/win32/msi/about-custom-actions)。

## in-process 寄生

DLL 型 CustomAction 可以由 Windows Installer 的宿主进程加载，然后调用包中登记的入口。对于防守方来说，最关键的现象是：

```text
MSI 提供 DLL 内容与调度信息
↓
Windows Installer 选择相应宿主
↓
宿主把 DLL 加载进自己的地址空间
↓
DLL 代码以宿主进程身份执行
```

不同版本、位数、动作类型和隔离策略可能让代码出现在某个 `msiexec.exe` 实例或专门的自定义操作宿主中。分析时不应先假设固定 PID 或固定父子关系，而要根据模块加载和安装日志定位。

这里的 in-process 是相对于**真正加载 DLL 的宿主**而言：DLL 可以与 `-Embedding` 宿主同进程，同时与 `/V` 安装服务进程分离。“相对安装服务是进程外调用”和“相对动作宿主是进程内执行”并不矛盾。

### 为什么不是注入

| 维度 | 跨进程注入 | DLL CustomAction in-process |
|---|---|---|
| 内容进入方式 | 外部进程向目标地址空间写入或映射 | 宿主按照 MSI 元数据主动加载 |
| 常见触发 | 远程线程、APC、线程劫持 | Windows Installer 调用登记入口 |
| 典型证据 | 跨进程句柄、写内存、异常线程起点 | MSI 表、安装日志、临时 DLL、模块加载 |
| 日志主体 | 注入者与目标可分开 | 恶意行为可能直接归到安装宿主 |

因此，“合法 `msiexec.exe` 在截屏或联网”不能自动推导出“`msiexec` 被注入”。在缺少跨进程原语时，应优先检查 CustomAction、脚本动作、子进程代理执行以及其他进程内加载机制。

## 恶意用法

恶意 MSI 可以把载荷嵌在包内，也可以只放一个下载或解码阶段。CustomAction 被调用后，可能完成主机侦察、持久化、外部通信、凭据访问或释放后续模块。

它的隐蔽性主要来自信任错配：

- `msiexec.exe` 是微软签名的系统程序。
- 安装行为天然会产生大量文件、注册表和服务变化。
- 企业环境中常见软件部署会使用 MSI，形成较高噪声。
- 进程内 CustomAction 不需要跨进程写入，因此传统注入规则可能没有事件。
- 如果检测产品把宿主签名继承为模块信誉，恶意 DLL 的行为可能被错误降权。

真正应该被信任的是“已批准的软件包 + 可验证发布者 + 合理来源 + 符合预期的安装行为”，而不是 `msiexec.exe` 这个进程名。

## 抽象案例

某个来自网络下载目录的 MSI 被用户启动。进程树只显示正常的 Windows Installer 前端和服务端实例，没有明显脚本解释器，也没有远程线程事件。但在安装期间，某个安装宿主出现了：

- 从安装临时目录加载随机名称 DLL。
- 访问输入设备或屏幕相关 API。
- 读取主机与用户信息。
- 连接与软件厂商无关的公网基础设施。
- 安装结束后仍留下自启动入口或额外载荷。

进一步检查 MSI 数据库发现，一个 DLL 型 CustomAction 在执行序列中被调度，内容来自包内二进制流。此时可以把机制写成“恶意 DLL 通过 MSI CustomAction 被安装宿主进程内加载”，而不是泛化成“注入 `msiexec`”。

## 分析方法

### 静态检查 MSI

在隔离环境中导出或查看 MSI 表，重点回答：

1. 存在哪些 CustomAction，类型、来源和目标是什么。
2. 它们出现在 UI 序列还是执行序列，条件是什么。
3. 是否为延迟、回滚、提交或高权限动作。
4. 内容来自 `Binary` 表、包内文件、已安装文件还是外部路径。
5. 动作名称、入口、厂商说明与实际功能是否一致。
6. 包签名、发布者、下载来源和产品元数据能否相互印证。

静态存在 CustomAction 不等于恶意。许多驱动、数据库、浏览器、办公和企业软件确实需要定制安装逻辑，关键是来源、动作内容和行为是否合理。

### 动态关联

以安装开始和结束时间为边界，同时收集：

- `msiexec.exe` 各实例的父子关系、命令行、用户、完整性级别和位数。
- Windows Installer 详细日志与相关事件日志。
- 安装临时目录中的 DLL、脚本和释放文件。
- 模块加载，尤其是用户可写或临时路径。
- 安装宿主的文件、注册表、服务、计划任务、网络和敏感 API 行为。
- 安装结束后的残留进程与持久化。

可以按“动作名 → 实际调用 → 宿主 PID → 模块 / 子进程 → 行为”串联证据：

- 详细日志中的 `MSI (c)` / `MSI (s)` 用于区分客户端与服务端日志上下文，不是 Immediate / Deferred 分类，也不足以直接确定载荷 PID。
- `Doing action` / `Action start` 帮助定位动作；对 Deferred 动作还要区分计划生成与实际执行，不能把排入计划当成代码已经运行。
- `Created Custom Action Server with PID`、`Invoking remote custom action` 等记录可提供宿主、DLL 路径或入口线索，再与进程创建和模块加载交叉确认。这些内部日志的具体格式可能随版本变化。
- 命令行只见 `-Embedding` 时，只能先标为“疑似 CustomAction 宿主”；只有结合动作类型、安装日志和实际行为，才能说明执行了哪个动作、处于哪个阶段，以及是否恶意。

如果安全执行环境允许，可对 MSI 做受控动态分析；不要在生产主机上为了验证而直接安装未知包。

## 检测

### 来源与身份

- MSI 来自浏览器下载、即时通信、邮件附件或用户可写共享。
- 包未签名、签名无效，或发布者与软件品牌、下载域名不一致。
- 临时目录中的 MSI 被静默安装，且缺少企业部署父进程。
- 产品名、厂商名和安装路径模仿常见软件，但哈希不在批准基线中。

### 进程与模块

- `msiexec.exe` 从临时目录加载未签名或低信誉 DLL。
- 安装宿主加载随机名 `.tmp` / `.dll`，随后马上执行敏感行为。
- 前端、服务端和自定义操作宿主之间的角色与企业常见基线不符。
- 安装期间派生脚本解释器、命令解释器或其他代理执行程序。

### “负向行为画像”

合法安装可以下载组件，也会写大量系统配置，所以单一网络或注册表事件误报较高。更强的信号是 `msiexec` 或其 CustomAction 宿主执行与安装职责明显无关的动作，例如：

- 键盘状态、剪贴板、屏幕或摄像头访问。
- 浏览器凭据、认证进程、敏感令牌或跨用户数据访问。
- 与产品更新基础设施无关的长期心跳通信。
- 安装完成后继续驻留并周期性联网。
- 主动削弱安全产品、审计、更新或防火墙。

### 证据分层

写分析结论时应区分：

- **行为证据**：`msiexec` 或相关宿主实际做了哪些异常操作。
- **机制证据**：MSI 表、安装日志或模块事件是否证明 CustomAction 被调用。
- **上下文证据**：包从哪里来、谁启动、以什么令牌执行、发布者是否可信。

只有异常行为、没有 MSI 结构和模块证据时，可以写“疑似进程内 CustomAction 或其他安装扩展”，不应把推断当成铁证。

## 缓解

- 企业软件部署只允许来自受管仓库、可信发布者和批准哈希的 MSI。
- 对来自互联网的 MSI 启用应用控制、信誉检查和受控安装流程。
- 记录 Windows Installer 详细日志，并将日志集中转发，避免只留在终端。
- 对 `msiexec` 保留模块加载、网络与敏感行为监控，不因微软签名自动放行。
- 将安装临时目录、用户可写目录和随机名 DLL 纳入模块扫描。
- 对高权限安装实施最小权限和变更审批，限制普通用户任意触发高权限安装。

## ATT&CK 对照

| Technique | 适用含义 |
|---|---|
| T1218.007 Msiexec | 利用 `msiexec` 代理执行恶意 MSI 或远程包 |
| T1204 User Execution | 诱导用户启动安装包 |
| T1547 / T1053 等 | CustomAction 后续建立的具体持久化，应按实际落点标注 |
| T1055 Process Injection | 只有存在真正跨进程注入证据时才使用；in-process CustomAction 本身不属于注入 |

## 小结

CustomAction 是 MSI 的合法扩展点。恶意包的关键滥用方式，是让 Windows Installer 按包内定义主动加载和执行攻击者控制的逻辑。DLL 型动作在进程内运行时，日志主体可能显示为合法签名的安装宿主，但这不代表微软签名替 DLL 或 MSI 背书。

分析时最重要的三句话是：

```text
msiexec 是执行宿主，不是行为信誉的来源
进程内 CustomAction 不等于跨进程注入
必须把 MSI 结构、模块加载和异常行为关联起来
```
