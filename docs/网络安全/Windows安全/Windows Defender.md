Windows Defender（现通常显示为 **Microsoft Defender Antivirus**）是 Windows 内置的终端防护组件，负责对文件、进程、脚本、下载内容及部分运行时行为进行恶意软件检测和拦截。它通常与 Windows 安全中心、云保护、实时保护、篡改防护等能力配合使用。

从主机排查视角看，Defender 不只是“杀毒软件”，也是攻击者可能试图削弱或规避的安全边界。实时保护被关闭、云保护失效、检测历史被清理，以及防护排除项被异常扩大，均值得纳入调查范围。

## 排除项的作用

Defender 的排除项（Exclusions）用于指定不参与某些扫描或检测的对象，例如文件、目录、扩展名或进程。它有明确的正常用途：

- 开发、编译或数据库等高频读写场景可能需要降低扫描开销。
- 某些企业软件会为自身的缓存、数据或安装目录申请排除。
- 安全产品或运维工具可能需要避免与其他防护组件重复扫描。

但排除项会缩小 Defender 的可见范围。若某个目录被排除，攻击者一旦能向该目录写入文件，恶意载荷就可能试图借此降低被扫描发现的概率。

:::warning
排除项不是关闭 Defender，也不能保证文件一定不会被其他安全能力、EDR 或云端检测发现；但它会削弱一道重要防线。排查时应尽快确认异常排除项的来源和影响范围。
:::

## 常见的规避思路

部分木马或入侵脚本会滥用 PowerShell 的 Defender 管理命令，或直接修改 Defender 排除项相关注册表键，在投放或执行载荷前后尝试新增或覆盖排除路径。其意图通常不是让所有安全防护完全失效，而是为后续文件落地、解压、运行或更新选择一个较少被扫描的目录。

可以将这类链路概括为：

```text
获得命令执行
↓
扩大 Defender 排除范围
↓
将文件写入被排除的位置
↓
执行、持久化或继续下载其他组件
```

特别需要关注将排除范围扩展到系统盘根目录、常见用户目录、`ProgramData`、Windows 目录或整个盘符的行为。这些位置覆盖面很大，通常难以用“仅服务于某个软件”的目的解释。

### 滥用计划任务直写排除项

除了直接运行 `powershell.exe Add-MpPreference`，攻击者也可能把“创建计划任务”和“LOLBin 直写注册表”组合起来，尝试降低命令行和进程链上的暴露度。这类链条通常长这样：

```text
恶意安装器或已取得高权限的进程
↓
创建名称伪装的计划任务，并配置为高权限或 SYSTEM 身份运行
↓
Task Scheduler 服务在任务触发时启动任务动作
↓
cmd.exe /c reg.exe add ...\Windows Defender\Exclusions\...
↓
直接尝试修改 Defender 排除项注册表键
↓
若配置被系统接受，在排除位置投放、解压或执行载荷
```

这条链路中每个环节都有明确意图：

| 环节 | 攻击在做什么 | 排查要点 |
| --- | --- | --- |
| `schtasks.exe` | 创建长期存在或延迟触发的任务；在具备相应权限时配置为 `SYSTEM` 运行；用 `MicrosoftEdgeUpdateTask*` 等名称伪装成微软更新任务 | 关注任务创建时间、创建者、`/ru SYSTEM`、任务 XML、TaskCache、Security `4698/4702` 和 Task Scheduler Operational 日志 |
| Task Scheduler 服务 | 任务触发时由系统服务启动动作，使运行期父链看起来像 `svchost.exe` 派生 `cmd.exe` | 不要只看运行期父进程，还要回溯任务创建证据和任务动作内容 |
| `cmd.exe` | 作为计划任务动作的命令包装器，承接后续 `reg.exe` 调用 | 关注 `cmd.exe /c` 后跟随的完整命令，尤其是 Defender 排除项路径 |
| `reg.exe` | 直接调用注册表接口写入 `Exclusions` 相关键，不启动 PowerShell 引擎 | 关注 `reg add`、注册表写事件、调用者权限，以及是否为批准的管理动作 |

常见目标键包括：

```text
HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths
HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Extensions
HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Processes
```

这种做法绕开的是 PowerShell 引擎及其脚本内容的 AMSI 检查，不等于绕过所有防护。进程创建、命令行、计划任务、注册表写入、Defender 日志和 EDR 遥测仍然可以留下证据。开启防篡改、存在企业策略所有权、系统版本较新或权限不足时，直接写入注册表还可能被拒绝、忽略、还原或被 GPO/MDM 覆盖；注册表里出现值，也不必然说明排除项已经实际生效。

从 ATT&CK 角度看，这类行为通常可映射为：

| 行为 | Technique |
| --- | --- |
| 创建或滥用计划任务 | T1053.005 Scheduled Task/Job: Scheduled Task |
| 任务名仿冒微软或软件更新任务 | T1036.004 Masquerade Task or Service |
| 修改 Defender 排除项注册表键 | T1112 Modify Registry |
| 削弱 Defender 对后续载荷的扫描与拦截 | T1562.001 Impair Defenses: Disable or Modify Tools |

### 通过 WMI/CIM 修改排除路径

WMI（Windows Management Instrumentation）是 Windows 的管理基础设施，通过命名空间、类、属性和方法提供统一的系统管理入口。CIM（Common Information Model）是通用信息模型；PowerShell 的 CIM cmdlet 可以访问 Windows 的 WMI Provider。分析这类行为时，应同时记录目标命名空间、类、方法和参数，而不能只看命令名称。

Defender 暴露了 `root\Microsoft\Windows\Defender` 命名空间下的 `MSFT_MpPreference` 管理类，`Add` 方法接受 `ExclusionPath` 等参数，可用于追加排除项。攻击者可能滥用这一入口，尝试扩大排除范围。接口及参数定义见 [Microsoft：MSFT_MpPreference.Add](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/defender/add-msft-mppreference)。

```text
powershell.exe 执行脚本
↓
Invoke-CimMethod / icim
↓
本机 WMI → root\Microsoft\Windows\Defender
↓
MSFT_MpPreference.Add(ExclusionPath, Force)
↓
Defender 管理提供程序处理配置请求
↓
若请求被接受且配置生效，指定路径进入排除范围
```

#### 示例命令与逐段解释

以下为待分析样本按“外层转义表示普通引号和路径分隔符”的假设整理后的可读形式，用于解释行为：

```powershell
powershell -Command "try {$null = icim MSFT_MpPreference @{ExclusionPath = @('C:\'); Force = $True} Add -Namespace root/Microsoft/Windows/Defender -EA 1} catch {$host.SetShouldExit($_.Exception.HResult)}"
```

原文中的 `\"`、重复反斜杠和 `MSFT\_MpPreference` 可能来自 JSON、日志或 Markdown 转义。取证时应保留原始字符串，按其实际封装层解码；不能机械地删除全部反斜杠。PowerShell 单引号字符串里的反斜杠是普通字符，因此 `'C:\\'` 与 `'C:\'` 的字面值不同。上例展示的是预期目标为 `C:\` 的命令语义，并不能证明原始文本可直接执行。外层若由另一个 PowerShell 解释，双引号中的 `$` 变量还可能先被外层展开。

| 片段 | 含义 |
| --- | --- |
| `powershell -Command "..."` | 启动 Windows PowerShell，解释后续命令文本。 |
| `try { ... } catch { ... }` | 执行修改请求；发生可捕获的终止错误时进入异常处理。 |
| `$null = ...` | 丢弃成功输出流中的结果对象，不代表命令未执行，也不负责关闭日志。 |
| `icim` | `Invoke-CimMethod` 的内置别名，用于调用 CIM 类或实例的方法。 |
| `MSFT_MpPreference` | 位置参数 `-ClassName`，指定 Defender 配置类。 |
| `@{ ... }` | 位置参数 `-Arguments`，以哈希表提供方法参数。 |
| `ExclusionPath = @('C:\')` | 创建包含一个路径的数组，要求将 C 盘根目录加入排除路径，覆盖范围很大。 |
| `Force = $True` | 传给 `Add` 方法的布尔参数；文档语义为不请求默认用户确认，不提供提权或绕过防篡改的能力。 |
| `Add` | 位置参数 `-MethodName`，调用追加方法。 |
| `-Namespace root/Microsoft/Windows/Defender` | 选择 Defender 管理命名空间。 |
| `-EA 1` | `-ErrorAction Stop`：`EA` 是别名，枚举值 `1` 表示 `Stop`，使该调用的非终止错误升级为可捕获的终止错误。 |
| `$_.Exception.HResult` | 在 `catch` 中取当前错误记录的异常 HRESULT。 |
| `$host.SetShouldExit(...)` | 请求 PowerShell 宿主退出，并传入该错误码作为退出码；它本身不撤销已经发生的配置变化。 |

位置参数顺序、别名及本机访问方式见 [Invoke-CimMethod 文档](https://learn.microsoft.com/en-us/powershell/module/cimcmdlets/invoke-cimmethod?view=powershell-5.1)；错误处理与退出请求分别见 [PowerShell 通用参数](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_commonparameters?view=powershell-7.5) 和 [PSHost.SetShouldExit](https://learn.microsoft.com/en-us/dotnet/api/system.management.automation.host.pshost.setshouldexit?view=powershellsdk-7.4.0)。

这条命令没有指定 `-ComputerName` 或 `-CimSession`，按默认行为通过 COM 会话访问本机 WMI。因此可定性为 **“PowerShell 通过 CIM/WMI 调用 Defender 管理类，尝试新增 C 盘根目录排除项”**；不能由此推断远程 WMI 执行或 WMI 持久化。

`$null =` 也会丢弃方法返回对象中的 `ReturnValue`。如果失败仅体现在返回码中而没有产生 PowerShell 错误，`catch` 不一定触发。因此，无输出、未进入 `catch` 或进程退出码为零，都不足以单独证明排除项生效；仍需核对实际配置及变更记录。此操作通常需要相应管理权限，并受防篡改、企业策略及版本配置影响。

#### 与 AMSI 的关系

AMSI（Antimalware Scan Interface，反恶意软件扫描接口）允许 PowerShell 等宿主将内容提交给安全产品检查。它是扫描接口，不是某一条关键字规则；PowerShell Script Block 日志与 AMSI 扫描也属于不同的观测机制。参见 [Microsoft：AMSI 概述](https://learn.microsoft.com/en-us/windows/win32/amsi/antimalware-scan-interface-portal)。

这条样本仍然启动 PowerShell，其脚本内容仍可能经 AMSI 扫描。它没有出现 `Add-MpPreference`，所以**仅依赖该字符串的规则可能漏报**；这是根据命令内容作出的检测覆盖分析，不能表述为已关闭、破坏或完全绕过 AMSI，也不能证明实际安全产品一定漏检。

#### 检测与结果核实

- 结合 `Invoke-CimMethod` / `icim`、`MSFT_MpPreference`、Defender 命名空间、`Add` 和 `ExclusionPath` 识别修改意图，兼容参数重排、别名、换行及命名空间分隔符差异。
- 区分读取配置与调用修改方法；单独出现类名或 `ExclusionPath` 可能只是正常查询。
- 关联发起账户、父进程、脚本来源及排除范围。`Force`、`try/catch` 和丢弃输出也常见于管理脚本，不能单独作为恶意依据。
- 核对 Defender 有效配置、配置变更记录和被排除目录内后续文件落地、执行行为。把“尝试调用”“配置发生变化”和“变化实际生效”分别记录。
- WMI/CIM 是接口分类，不能要求进程链一定出现 `wmic.exe`，也不应仅凭命令认定注册表写入者必然是 `powershell.exe` 或某个固定服务进程。

## WDAC

WDAC（Windows Defender Application Control，现称 **App Control for Business**）是 Windows 的应用控制能力。它由代码完整性组件在程序、脚本、DLL 或驱动加载时应用策略，决定哪些代码允许运行。虽然名称中带有 Defender，但 WDAC 并不是 Defender Antivirus 的病毒扫描功能；它是独立的应用白名单和代码完整性控制边界。

传统的单策略部署通常使用：

```text
C:\Windows\System32\CodeIntegrity\SiPolicy.p7b
```

支持多策略的系统还会将活动策略保存为：

```text
C:\Windows\System32\CodeIntegrity\CiPolicies\Active\{PolicyId}.cip
```

因此，排查时不能只检查 `SiPolicy.p7b`。还应核对活动的 `.cip` 策略、企业管理平台下发记录，以及设备实际加载的策略列表。

### 滥用 WDAC 阻断安全工具

#### **攻击在做什么**

攻击者在获得管理员或 `SYSTEM` 权限后，可能生成、替换或下发一份恶意 WDAC 策略，将 EDR、杀毒软件、监控 Agent、更新程序或相关驱动加入拒绝规则。策略生效后，阻断动作由 Windows 代码完整性机制完成，看起来像是“系统不允许安全产品运行”，而不是恶意进程直接删除或修改安全产品。

这类攻击通常属于 **防御规避（Impair Defenses / Disable or Modify Tools，MITRE ATT&CK T1562.001）**。它的目标是制造监控盲区，为后续载荷执行、凭据访问、横向移动或持久化争取时间。

```text
获得管理员或 SYSTEM 权限
↓
制作或取得包含恶意拒绝规则的 WDAC 策略
↓
通过本地策略文件、系统策略工具或企业管理通道部署
↓
策略刷新、服务重启或系统重启后生效
↓
EDR/Agent 的进程、DLL、脚本或驱动被代码完整性机制拒绝加载
↓
安全遥测中断，攻击者继续执行后续操作
```

常见的滥用方式包括：

- 替换传统策略文件 `SiPolicy.p7b`，或向 `CiPolicies\Active` 写入新的活动策略。
- 滥用 `CiTool.exe`、WDAC/ConfigCI PowerShell 模块、组策略、MDM 或其他受信任管理通道部署策略。
- 按路径、文件名、哈希、签名者或发布者构造拒绝规则，定向阻断安全产品及其更新组件。
- 同时限制用户态程序和内核驱动，使 Agent 服务即使仍被配置为自动启动，也因核心模块无法加载而失效。
- 在策略落地后主动停止安全服务、触发服务重启，或等待设备重启，使阻断效果暴露出来。

:::warning
写入或激活 WDAC 策略通常需要高权限，因此发现这类行为时，不应只视为一次安全产品故障，而应假设主机可能已经发生高权限入侵。部分策略可以动态刷新，另一些规则要在进程、服务或系统重启后才完全体现；“文件刚被修改但 Agent 仍在线”不能排除攻击正在进行。
:::

#### 识别与调查要点

优先关注以下证据之间的时间关联：

- `SiPolicy.p7b` 或 `CiPolicies\Active\*.cip` 的创建、替换、重命名、时间戳变化和权限变化。
- `CiTool.exe` 以及包含 `New-CIPolicy`、`ConvertFrom-CIPolicy`、`Merge-CIPolicy`、`Set-RuleOption` 等关键字的异常 PowerShell 活动。
- 组策略、Intune/MDM 或其他配置管理平台的 WDAC 策略变更，特别是来源不明、未经审批或只针对少量终端的下发。
- `Microsoft-Windows-CodeIntegrity/Operational` 日志中的策略加载、刷新和代码阻断事件。常见的 `3076` 表示审计模式下本应阻断，`3077` 表示强制模式下已阻断，`3089` 可提供相关签名信息；事件含义可能随系统版本变化，应结合事件正文确认。
- EDR/Agent 服务启动失败、驱动加载失败、心跳或遥测突然中断，并且同一时间出现代码完整性拒绝事件。
- 策略部署前后的高权限进程树、远程登录、服务控制、计划任务、下载和后续载荷执行。

拿到可疑策略后，应保留原文件并计算哈希，在隔离环境中转换或解析策略内容，重点检查：

1. 策略 ID、基础策略与补充策略的关系，以及策略处于审计模式还是强制模式。
2. 是否存在针对安全产品目录、可执行文件、服务程序、DLL、脚本宿主或驱动的拒绝规则。
3. 策略的签名者、创建来源和部署时间是否与企业批准的基线一致。
4. 同一策略是否已被下发到其他资产，以及其他终端是否出现相同的安全工具离线现象。

#### 响应注意事项

不要在不了解策略类型和签名状态时直接删除 `SiPolicy.p7b` 或活动 `.cip` 文件。签名策略、UEFI 中保留的策略或由管理平台持续下发的策略可能无法通过简单删文件解除；错误操作还可能导致合法程序无法运行，严重时影响启动和远程处置。

建议先隔离终端并保全策略文件、代码完整性日志、进程树和管理平台审计记录，再通过企业批准的 WDAC 恢复流程撤销恶意策略。恢复后应验证 Defender、EDR 服务、驱动、更新组件和遥测链路均已正常，并继续调查攻击者取得高权限的入口及策略生效期间发生的其他行为。

## 可疑命令行特征

以下模式可用于在进程创建、PowerShell Script Block、EDR 命令行或 SIEM 日志中检索 Defender 排除路径相关行为：

```regex
.*Add-MpPreference -ExclusionPath.*\\Users\\Public\\.*
.*Add-MpPreference -ExclusionPath 'C:\\'.*
.*Set-MpPreference -ExclusionPath C:\\, D:\\, E:\\.*
.*Add-MpPreference -ExclusionPath.*\\ProgramData.*
(?i).*Set-MpPreference -ExclusionPath '?[A-Za-z]:\\(\*|(Program Files \(x86\)|Program Files|Users|Windows)\?\*?|)'
```

这些特征的关注点在于排除目标过宽，而不是 `Add-MpPreference` 或 `Set-MpPreference` 本身：

- `C:\`、多个盘符或盘符根目录：可能让大范围文件避开扫描，风险很高。
- `C:\Users`、`C:\Windows`、`C:\Program Files` 等顶级目录：覆盖大量系统和用户文件，通常不符合最小化排除原则。
- `C:\Users\Public`：该目录对多用户可写，常被滥用于共享或落地，应结合文件创建和执行行为重点核查。
- `C:\ProgramData`：许多软件在此存储数据，因此并非天然恶意；但它也是常见的持久化和载荷落地位置。
- `Set-MpPreference -ExclusionPath`：应注意其可能以新的路径列表覆盖现有配置，影响面可能大于追加单一路径的操作。

:::note
正则表达式需要按日志平台的字段、转义规则和大小写设置调整。建议先在测试数据上验证，避免因为反斜杠或引号转义差异漏报。
:::

还应补充 `reg.exe` 直写排除项及其计划任务包装形态。下面示例用于检测和排查，不应作为正常配置方式：

```cmd
schtasks.exe /create /tn "MicrosoftEdgeUpdateTaskUA ..." /ru SYSTEM /sc ... /tr "cmd.exe /c reg.exe add \"HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths\" /v \"C:\...\" /t REG_DWORD /d 0 /f"
reg.exe add "HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths" ...
reg.exe add "HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Extensions" ...
reg.exe add "HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Processes" ...
```

可作为候选规则锚点的模式包括：

```regex
(?i)\breg(?:\.exe)?\s+add\b.*\\Microsoft\\Windows Defender\\Exclusions\\(?:Paths|Extensions|Processes)\b
(?i)\bschtasks(?:\.exe)?\b.*\s/create\b.*\breg(?:\.exe)?\s+add\b.*\\Windows Defender\\Exclusions\\
(?i)\bMicrosoftEdgeUpdateTask[^"\s]*\b
```

第二条规则的价值在于把任务创建和排除项修改关联起来。上线时不要只硬编码 `svchost -k Schedule`，不同 Windows 版本和配置中 Task Scheduler 服务的宿主命令行可能存在差异，例如 `svchost.exe -k netsvcs -p -s Schedule`。更稳的做法是同时关联任务动作、任务名、父子进程、注册表目标键和创建者账户。

### 与 PowerShell 管理接口的对比

两条路线的目标相似，都是尝试扩大 Defender 排除范围；差异在于它们使用的接口、可观测面和策略约束不同。

| 维度 | PowerShell 管理接口 | `reg.exe` 直接写入 |
| --- | --- | --- |
| 常见形式 | `Add-MpPreference -ExclusionPath ...`、`Set-MpPreference -ExclusionPath ...` | `reg.exe add ...\Exclusions\Paths` |
| 接口路径 | 通过 Defender 支持的管理提供程序或服务语义提交配置变更 | 由调用进程直接访问注册表接口 |
| PowerShell/AMSI | PowerShell 内容可能进入命令行、Script Block 和 AMSI 相关遥测 | 不启动 PowerShell，因此没有 PowerShell 脚本内容的 AMSI 检查 |
| 进程信号 | `powershell.exe` 或 `pwsh.exe` 携带 `MpPreference` 关键字 | `reg.exe` 命令行、父进程、计划任务链和注册表事件 |
| 注册表事件归属 | PowerShell 提交配置请求后，常见遥测中可能显示由 Defender 服务进程 `MsMpEng.exe` 或相关管理通道完成写入，而不是 `powershell.exe` 直接写键 | 支持进程归属的注册表遥测中通常可见 `reg.exe` 或其父链 |
| 策略约束 | 仍受权限、防篡改、企业策略、GPO/MDM 和版本差异影响 | 更容易被防篡改、策略所有权或权限限制拒绝、忽略、还原或覆盖 |
| 检测重点 | `MpPreference` 命令、脚本内容、发起账户、配置变更事件 | 非批准进程写入 `Windows Defender\Exclusions`、可疑任务动作、`cmd.exe /c reg add` |
| 结果判断 | 尝试更改有效排除配置 | 尝试更改底层值，不保证实际成为有效排除项 |

这个差异会带来一个很实用的检测提示：`Add-MpPreference` 通常不是由 `powershell.exe` 直接 `RegSetValue` 写入排除项键，而是通过 Defender 的管理接口提交配置变更，再由 Defender 服务或相关组件落地。因此，`MsMpEng.exe` 或批准管理通道之外的进程，尤其是 `reg.exe`、`cmd.exe` 派生的 `reg.exe`、脚本宿主或用户目录程序，直接写入 `Windows Defender\Exclusions\` 本身就是强异常。

也因此，检测上不能只盯 `powershell.exe`。`reg.exe` 或其他未批准进程写入 `Windows Defender\Exclusions\` 是高信号行为，但仍需排除少量经过批准的部署、迁移或管理工具行为，并结合不同 EDR 对注册表 actor 的归因方式验证规则。

## 正常行为与异常行为的区别

正常软件通常仅为自身实际使用的、边界清晰的目录添加排除项，例如其专用缓存目录、数据库数据目录或受管理的安装目录。即使如此，也应存在可核验的软件来源、变更单、安装时间或管理策略。

相比之下，下面的情况更可疑：

| 观察项 | 相对正常的画像 | 需要优先调查的画像 |
| --- | --- | --- |
| 排除范围 | 单一软件的专用目录 | 系统盘、多个盘符、`Users`、`Windows` 等大范围目录 |
| 发起进程 | 可信安装程序、受管运维工具 | 非预期的 `powershell.exe`、脚本宿主、`reg.exe`、用户目录程序或计划任务动作 |
| 执行身份 | 管理员按变更流程执行 | 异常高权限账户、被入侵用户或远程会话账号 |
| 时间关系 | 与软件安装、升级或明确维护窗口一致 | 紧跟钓鱼、漏洞利用、可疑下载或横向移动之后 |
| 后续活动 | 对应软件在目录中写入预期文件 | 被排除目录出现脚本、可执行文件、服务、计划任务或外联 |

单个排除路径不构成恶意结论。企业管理策略、开发环境、备份软件和部分安全产品都可能进行合法配置。可靠研判应结合发起进程、完整命令行、账户、设备角色、变更记录及后续行为。

## 检测与调查

建议优先保留并关联以下数据：

- PowerShell 命令行和 Script Block 日志，尤其是 `Add-MpPreference`、`Set-MpPreference`、`Remove-MpPreference`，以及 `Invoke-CimMethod` / `icim` 调用 `MSFT_MpPreference` 修改方法的行为。
- `reg.exe`、`schtasks.exe`、`cmd.exe /c` 相关进程创建记录，尤其是命令行中包含 `Windows Defender\Exclusions` 的行为。
- 计划任务创建与修改记录，包括任务 XML、TaskCache、Security `4698/4702`、Task Scheduler Operational 日志，以及任务动作中是否包含 `reg add`。
- 注册表写事件，重点关注 `MsMpEng.exe`、Defender 相关组件或批准管理工具之外的进程，直接写入 `HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\`。
- Defender 运营日志、Windows 安全中心事件及 EDR 的防护配置变更记录。
- 对应时间窗内的进程树、脚本来源、网络连接、下载文件和被排除目录内的文件创建事件。
- 管理员登录、远程会话、软件安装和企业配置管理（如 Intune、组策略）变更记录。

调查一个命中告警时，可按以下顺序收敛：

1. 确认变更的是新增、删除还是覆盖排除路径，以及变更前后的完整配置。
2. 确认发起进程、父进程、命令行、用户、权限和执行来源。
3. 若涉及计划任务，核对任务创建者、任务名、任务动作、触发条件、运行账户，以及任务名是否伪装成浏览器、微软更新或系统维护组件。
4. 检查被排除目录在前后时间窗内新增的文件、启动项、计划任务、服务和网络连接。
5. 对照资产负责人、软件清单、维护窗口和变更工单，验证是否存在合理业务背景。
6. 若缺乏业务解释或同时存在可疑落地、执行、外联行为，按高优先级事件隔离和处置。

## 响应建议

对于未经授权且范围过宽的排除项，应先保留证据，再由具备权限的安全或系统管理员恢复到批准的配置。不要只删除一条排除记录就结束调查：还应检查该目录中是否已留下可执行文件、脚本、持久化机制或凭据访问痕迹。

如果确认发生入侵，处置重点应包括：隔离受影响终端、终止相关恶意进程、保全日志与可疑文件、清理持久化、重置可能暴露的凭据，并在恢复配置后复核 Defender 与其他终端防护的健康状态。
