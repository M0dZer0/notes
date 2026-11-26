## 概念

进程空洞化（Process Hollowing）是一种典型的高级进程注入技术。它不是简单地把一段 shellcode 写入已有进程，而是：

```text
创建一个合法进程
  → 以挂起状态启动
  → 移除或覆盖原始映像
  → 写入恶意 PE 映像
  → 修改线程入口
  → 恢复线程执行
```

最终结果通常是：

```text
进程名、父子关系和初始命令行看起来正常
但进程地址空间中实际运行的是另一份映像
```

因此，进程空洞化的关键不只是“跨进程写内存”，而是**利用一个正常进程的外壳承载并执行另一份 PE 映像**。它可以降低陌生恶意进程直接出现在进程列表中的可见性，是比普通内存写入更完整、更复杂的一类注入手法。

## 基本原理

Windows 进程启动后，系统会为它创建地址空间并映射原始 PE 文件。进程空洞化会在目标进程尚未真正执行前，破坏这份原始映像，再将攻击者准备好的映像放入目标进程地址空间。

典型流程如下：

```text
CreateProcessW(CREATE_SUSPENDED)
  → NtUnmapViewOfSection / ZwUnmapViewOfSection
  → VirtualAllocEx / NtAllocateVirtualMemory
  → WriteProcessMemory / NtWriteVirtualMemory
  → 写入 PE 头、节区和重定位信息
  → SetThreadContext / NtSetContextThread
  → ResumeThread
```

不同实现可能不完全调用同一组 API。有的实现不会完整卸载原映像，而是直接覆盖原有区域；有的实现使用 `NtMapViewOfSection` 映射恶意映像；也有的实现通过 `CreateProcessAsUserW` 或令牌创建目标进程。判断重点是行为关系，而不是是否出现某个固定 API。

## 典型执行阶段

### 1. 创建挂起进程

攻击者先创建一个看起来正常的目标进程，并使用挂起标志阻止其主线程立即执行：

```text
CreateProcessW
  + CREATE_SUSPENDED
```

常见目标通常是系统目录下的常见可执行文件，例如：

- `svchost.exe`：常见系统服务宿主；
- `explorer.exe`：桌面和用户会话相关进程；
- `RuntimeBroker.exe`：常见用户会话宿主；
- `dllhost.exe`：COM 代理宿主；
- `taskhostw.exe`：任务和组件宿主。

目标选择的核心不是进程名本身，而是进程是否常见、是否长期运行、是否具备合适的用户会话或权限，以及其启动是否容易与正常系统活动混淆。

检测时应关注：

```text
可疑进程
  → CreateProcess(系统目录中的常见进程)
  → CREATE_SUSPENDED
```

单独创建挂起进程并不等于进程空洞化，调试器、安装程序和兼容性组件也可能正常使用该标志。需要继续观察后续是否存在卸载映像、跨进程写入和线程上下文修改。

### 2. 移除或覆盖原始映像

目标进程创建后，攻击者可能先查询其原始映像基址，再将原始映像从进程地址空间中卸载：

```text
NtQueryInformationProcess
  → 获取 PEB 或映像基址
  → NtUnmapViewOfSection
```

也可能不调用 `NtUnmapViewOfSection`，而是直接在目标地址空间分配区域并覆盖原有内容。这个阶段的意义是清除或破坏目标进程原本应运行的代码，为后续映射恶意映像腾出空间。

高价值信号是：

```text
CREATE_SUSPENDED
  + NtUnmapViewOfSection
  + 目标进程后续出现大量内存写入
```

### 3. 分配内存并写入恶意 PE

攻击者随后把恶意 PE 的内容写入目标进程，通常包括 PE 头、节区、导入表修复所需数据以及重定位后的代码：

```text
VirtualAllocEx / NtAllocateVirtualMemory
  → WriteProcessMemory / NtWriteVirtualMemory
  → 写入 PE Header 和各个 Section
```

与普通 shellcode 注入相比，这里写入的不是一小段独立机器码，而可能是一份完整的 PE 映像。常见后续操作包括：

- 按目标地址重新计算重定位；
- 修复导入地址表；
- 写入节区并设置不同的内存保护属性；
- 修改 PEB 中的映像相关信息；
- 准备新的进程参数或环境数据。

因此，遥测上可能看到多次、分区域、跨页面的内存写入，而不是单次写入一小段载荷。

### 4. 修改线程入口并恢复执行

恶意映像写入后，攻击者需要让挂起的主线程从新的入口点开始执行：

```text
GetThreadContext / NtGetContextThread
  → 修改 Instruction Pointer
  → SetThreadContext / NtSetContextThread
  → ResumeThread
```

在 x64 环境中通常关注 `RIP`，在 x86 环境中通常关注 `EIP`。有些实现会让线程先进入一个引导代码，再由引导代码完成导入解析、重定位或跳转到真正入口。

因此，下面的组合比单独的 `ResumeThread` 更值得关注：

```text
挂起线程
  + 修改线程上下文
  + 目标进程内存发生 PE 结构写入
  + 恢复线程后从非原始映像区域执行
```

## 与普通写内存、远程注入的区别

### 普通跨进程写内存

普通写内存通常是对一个已经运行的目标进程申请或寻找内存，然后写入数据：

```text
OpenProcess
  → VirtualAllocEx
  → WriteProcessMemory / NtWriteVirtualMemory
```

它可能用于写入配置、参数、DLL 路径或 shellcode。`WriteProcessMemory` 本身只代表发生了跨进程写入，后续是否执行还要看 APC、远程线程或线程上下文等行为。

### 传统远程线程注入

传统远程线程注入通常针对一个已经运行的目标进程：

```text
打开目标进程
  → 分配内存
  → 写入 shellcode 或 DLL 路径
  → CreateRemoteThread / NtCreateThreadEx
```

目标进程原本的映像一般仍然存在，攻击者只是额外在其中执行一段代码。检测上重点关注远程线程创建、可执行内存、跨进程写入和异常模块加载。

### APC 注入

APC 注入也是对已有目标进程进行操作，但执行触发方式不同：

```text
写入目标进程内存
  → QueueUserAPC
  → 目标线程进入 alertable 状态后执行
```

它通常借用目标进程已有线程，不一定创建新的远程线程，因此在基础进程树和线程事件中可能比传统远程线程注入更隐蔽。

### 进程空洞化

进程空洞化的关键特征是目标进程通常从一开始就以挂起状态创建，原始映像随后被卸载、覆盖或替换：

```text
创建挂起进程
  → 移除或覆盖原始映像
  → 写入完整 PE 映像
  → 修改主线程入口
  → 恢复执行
```

对比来看：

| 方式 | 目标进程状态 | 写入内容 | 主要执行方式 | 典型检测重点 |
| --- | --- | --- | --- | --- |
| 普通写内存 | 通常已运行 | 参数、数据或 shellcode | 不一定执行 | 跨进程写入和访问权限 |
| 远程线程注入 | 通常已运行 | shellcode、DLL 路径或载荷 | 创建远程线程 | `CreateRemoteThread`、可执行内存 |
| APC 注入 | 通常已运行 | APC 回调或载荷 | 借用已有线程 | `QueueUserAPC`、线程归属和后续执行 |
| 节区映射注入 | 通常已运行 | 共享节区中的 shellcode、加载器或 PE | 仍需远程线程、APC、线程劫持等触发 | `NtCreateSection`、本地/远程视图、异常可执行映射和执行入口 |
| 进程空洞化 | 通常先挂起创建 | 完整 PE 或主要映像内容 | 修改主线程入口后恢复 | 挂起创建、卸载映像、PE 写入、上下文修改 |

因此，进程空洞化不是简单的“把代码写进别的进程”，而是同时改变了目标进程的**映像内容、内存布局和初始执行路径**。这也是它被视为高级注入手法的原因。

## 节区映射注入（Section Mapping Injection）

### 核心原理

这里的“节区”指 Windows 内存管理器中的 **Section Object（节对象）**，不是 PE 文件中的 `.text`、`.data` 等节。攻击者可以创建一个由分页文件或文件支持的节对象，再把同一个节的视图分别映射到本地进程和目标进程：

```text
NtCreateSection
  → NtMapViewOfSection（映射到本进程，可写）
  → 在本地视图中复制载荷
  → NtMapViewOfSection（映射到目标进程，可执行）
  → 通过远程线程、APC、线程上下文劫持等方式触发执行
```

两个视图引用同一个底层节对象，因此攻击者在本地视图写入的数据会出现在远程视图中。它可能不需要对主体载荷调用 `WriteProcessMemory`，也不一定出现 `VirtualAllocEx`。这正是节区映射注入与经典“远程分配 → 跨进程写入”的重要区别。

`NtMapViewOfSection` 只负责把视图放入目标地址空间，**映射本身不会自动执行载荷**。完整判断还要寻找执行衔接，例如：

- 新建远程线程，入口落在异常映射区；
- 把 APC 排入目标线程；
- 修改已有线程的 `RIP` / `EIP` 或相关上下文；
- 覆盖回调、函数指针等控制数据，让目标原有执行流进入映射区。

在安全产品遥测中，这类区域可能被标记为 `MEM_MAPPED`、匿名映射、非模块映射或 `Unbacked`。其中 `Unbacked` 通常表示它不对应传感器能够识别的磁盘映像或合法模块，不能据此理解为“没有 Section Object 作为内存后端”。

### 与进程空洞化的本质区别

两种手法都可能出现 `NtMapViewOfSection`、可执行内存和线程上下文修改，但应按**目标状态、原映像是否被替换、载荷落点和执行方式**综合判断，而不是看到单个 API 就下结论。

| 判断维度 | 经典进程空洞化 | 节区映射注入 |
| --- | --- | --- |
| 目标进程 | 通常由攻击者以 `CREATE_SUSPENDED` 新建 | 通常是已经运行的现有进程，也可以是正常启动后再注入的子进程 |
| 原始主映像 | 被卸载、覆盖或在启动阶段被另一映像取代 | 通常保持不变，只在地址空间中增加一个映射视图 |
| 典型载荷 | 完整 PE 或足以替代主映像的主要内容 | shellcode、加载器、数据或额外 PE 映像 |
| 典型落点 | 原 `ImageBase` 或用于承载替代映像的区域 | 与原主映像无关的新映射地址 |
| 数据进入目标的方式 | 常见为多次 `WriteProcessMemory`，也存在映射式变体 | 常通过共享节的本地视图写入，远程侧可不出现主体载荷写入 |
| 执行衔接 | 修改挂起主线程入口，再恢复该线程 | 远程线程、APC、线程劫持、回调覆盖等均可 |
| 高价值证据链 | 挂起创建 → 原映像卸载/覆盖 → PE 替换 → 主线程恢复 | 创建/获得节 → 本地与远程双视图 → 异常可执行映射 → 执行流进入该区域 |

因此，`NtMapViewOfSection` 并不天然代表进程空洞化。只有当映射行为服务于“替换新建挂起进程的主映像和初始执行路径”时，才可能属于空洞化变体；如果只是给已运行进程增加一块可执行映射，再另行劫持执行流，更符合 **Section Mapping Injection（MITRE ATT&CK `T1055`）**。如果执行阶段修改已有线程上下文，还可同时表现为 **Thread Execution Hijacking（`T1055.003`）**。

### 案例：两跳节区映射与线程劫持

这条链路不能归为经典 **Process Hollowing（`T1055.012`）**。其结构是：

```text
dropper
  → 正常启动第一阶段进程 a.exe
  → a.exe 中的本地 shellcode 线程
  → 对已运行的服务进程 b.exe 做远程节区映射
  → b.exe 内的驻留载荷
  → 启动第二阶段目标 c.exe
  → 远程节区映射 + 少量写内存 + WOW64 线程上下文劫持
```

#### 1. 本地 shellcode 线程

第一阶段进程 `a.exe` 加载 `a.dll` 后，通过 `NtCreateThreadEx` 在**本进程**创建线程 `tid 3384`。线程起始地址 `0x1805b8234` 位于该 DLL 内，但创建调用栈表现为 `ntdll!NtCreateThreadEx ← Unbacked`，并带有 `shellcode_caller` 特征。

这个线程是后续注入动作的调用者，但它不是“目标进程以挂起状态创建出来的主线程”，因此不能作为进程空洞化的挂起主线程证据。

#### 2. 第一跳：对已运行服务做远程节区映射

```text
第一阶段进程 a.exe（tid 3384）
  → OpenProcess(服务进程 b.exe, pid 2752, DesiredAccess=0x478)
  → NtMapViewOfSection / MapViewOfSection_Remote
  → 远程新地址 0x191cba40000
  → PAGE_EXECUTE_READWRITE / Unbacked
```

`0x478` 包含 `VM_OPERATION`、`VM_READ`、`VM_WRITE`、`DUP_HANDLE` 和查询权限，足以支持远程内存与节对象操作。服务进程 `b.exe` 已经由服务控制管理器（SCM）拉起并处于运行状态。映射基址 `0x191cba40000` 是新增区域，不是该服务的主映像基址；当前事件中也没有原映像卸载证据。调用还带有 `indirect_syscall`、`sensitive_api` 标签，调用栈为 `ntdll!NtMapViewOfSection ← Unbacked`。

因此，这一步是对活进程增加远程可执行映射，而不是把服务进程“掏空”后替换主映像。

随后服务进程中出现 `tid 6004` 的 `Unbacked` shellcode 线程，起始地址为 `0x1f1790`，调用栈表现为 `ntdll | KERNELBASE | advapi32 | Unbacked`。这说明执行已经进入异常内存。由于当前动作类型中没有 `CreateRemoteThread`、APC 等完整事件，**只能确认映射和后续异常执行已经发生，不能仅凭现有日志还原第一跳的具体触发机制**。

#### 3. 第二跳：映射后劫持 WOW64 线程上下文

被注入的服务进程 `b.exe` 随后创建 32 位第二阶段目标 `c.exe`。其 `create_flag=16`，不是 `CREATE_SUSPENDED(0x4)`；目标先正常运行，约 4 秒后才在同一时间窗出现：

```text
服务进程 b.exe（tid 6004）
  → WriteProcessMemory_Remote（8 字节，地址 0x2a8c2d8）
  → MapViewOfSection_Remote（新地址 0x2c00000，RWX / Unbacked）
  → Wow64SetThreadContext / SetThreadContext_Remote
```

8 字节写入更像指针、跳板参数或控制数据的修补，写入规模不足以单独支持“完整 PE 替换”的判断。随后对 WOW64 线程设置上下文，说明执行阶段更符合线程执行劫持：把已有线程的执行位置或相关寄存器引向映射载荷。

该上下文事件的调用链表现为 `ntdll!NtSetInformationThread ← KERNELBASE!Wow64SetThreadContext ← Unbacked`。它能够支持“由异常内存发起 WOW64 线程上下文修改”的判断，但仍需结合修改后的寄存器值和目标地址，才能精确确认最终跳转点。

当前采集事件未出现 `ResumeThread` / `NtResumeThread`，因此没有证据支持经典的“创建挂起主线程 → 替换映像 → 修改入口 → 恢复主线程”链路。不过，**未采集到挂起或恢复事件不等于可以证明线程从未被短暂挂起**；它只能说明现有遥测无法闭合经典空洞化所需的这部分证据。

#### 4. 为什么不是进程空洞化

| 经典空洞化步骤 | 本案例证据 | 判断 |
| --- | --- | --- |
| `CreateProcess(CREATE_SUSPENDED)` 创建目标 | 服务进程 `b.exe` 已经在运行；第二阶段目标 `c.exe` 的 `create_flag=16` | 不满足 |
| `NtUnmapViewOfSection` 卸载原主映像 | 当前采集事件中未见，且映射落在新地址 | 不支持映像替换 |
| 向目标写入完整 PE | 第二跳仅见 8 字节远程写入；主体通过节区映射进入 | 不符合完整映像写入特征 |
| 修改挂起主线程入口 | 只在第二跳看到 `Wow64SetThreadContext` | 支持线程劫持，但不能单独证明空洞化 |
| `ResumeThread` 启动替代映像 | 当前采集事件中未见 | 空洞化链不闭合 |

本案例更准确的定性是：

- **第一跳 `a.exe → b.exe`**：对已运行进程实施远程节区映射注入，归入 `T1055` 更合适；
- **第二跳 `b.exe → c.exe`**：远程节区映射配合少量控制数据写入，再通过 WOW64 线程上下文完成执行劫持，同时具有 `T1055` 与 `T1055.003` 特征；
- **不是 `T1055.012`**：现有证据没有显示目标以挂起方式创建、原始主映像被替换并由恢复后的主线程执行新映像；
- `injection_type_id=99` 是产品内部的自定义分类值，不能直接对应为标准 ATT&CK 子技术。

此后服务进程 `b.exe` 每隔约 20～30 秒继续创建一批第二阶段目标 `c.exe`，且创建调用栈带有 `shellcode_caller`。这更支持载荷已在服务进程内驻留并把它作为第二阶段注入器，而不是每次对服务本身重复执行空洞化。

### 检测节区映射注入

应优先关联以下证据：

```text
可疑调用进程
  → NtCreateSection / CreateFileMapping
  → 本地 NtMapViewOfSection / MapViewOfFile
  → 同一 Section 被映射进另一进程
  → 远程视图具有 RX 或 RWX 权限
  → 线程入口、上下文、APC 或间接控制流进入该视图
```

分析时重点检查：

- 调用者为何需要目标进程的 `PROCESS_VM_OPERATION`、`PROCESS_VM_WRITE`、`PROCESS_DUP_HANDLE` 等权限；
- 本地视图和远程视图是否属于同一个 Section Object；
- 远程视图是否没有对应的合法文件、签名模块或加载记录；
- 页面是否直接以 `RWX` 映射，或短时间内从 `RW` 变为 `RX`；
- 新线程起始地址、修改后的 `RIP` / `EIP`、APC 回调地址是否落入该映射；
- 是否存在间接系统调用、`Unbacked` 调用栈、WOW64 上下文切换和周期性子进程注入；
- 原主映像是否仍然存在且未被替换，以避免把普通节区映射注入误报为进程空洞化。

如果采集库只提供 `ThreadCreate`、`MapViewOfSection_Remote`、`WriteProcessMemory_Remote` 和 `SetThreadContext_Remote`，应根据可见动作给出“节区映射 + 执行劫持”的最小充分结论，并明确哪些前置创建、挂起、恢复或触发动作超出了当前遥测范围。

## 为什么更隐蔽

### 进程名和进程树借用

进程列表中看到的可能是一个签名正常、路径正常的系统进程。恶意代码并不一定以自身文件名长期运行，初步排查如果只看进程名和父子关系，可能无法发现异常。

### 磁盘映像与内存映像不一致

进程启动时的文件路径可能指向正常系统文件，但进程内存中的 PE 头、模块列表、入口地址或节区内容已经发生变化。

这会形成：

```text
磁盘上看到的是合法映像
内存中执行的是另一份映像
```

因此，进程空洞化通常需要结合磁盘映像和内存映像进行判断。

### 避免直接暴露恶意进程

传统注入也能借用目标进程，但进程空洞化从进程创建早期就替换了原始执行内容，目标进程可能从一开始就没有运行过其文件中原本的入口代码。这种方式更适合隐藏加载器身份、保持进程树外观以及承载多阶段载荷。

需要注意，隐蔽性不是绝对的。进程空洞化往往会留下更完整的行为链，尤其是挂起创建、卸载映像、批量写入和入口修改的连续组合。

## 检测方法

### 1. 关联进程创建与挂起行为

建立进程创建事件与线程状态的关联，重点关注：

```text
可疑父进程
  → 创建常见系统进程
  → CREATE_SUSPENDED
  → 短时间内跨进程内存操作
```

高风险调用者包括用户目录、临时目录、下载目录中的程序，以及 Office、脚本解释器、压缩软件或异常安装程序派生的进程。

### 2. 监控原映像卸载

重点关注：

```text
NtUnmapViewOfSection / ZwUnmapViewOfSection
```

单独出现该调用可能来自调试器、兼容层或正常加载逻辑，但如果它作用于刚刚创建且处于挂起状态的子进程，随后又出现内存分配和写入，关联价值很高。

### 3. 检查跨进程内存写入与保护属性

关注以下组合：

```text
VirtualAllocEx / NtAllocateVirtualMemory
  + WriteProcessMemory / NtWriteVirtualMemory
  + VirtualProtectEx / NtProtectVirtualMemory
```

如果写入范围覆盖 PE 头和多个节区，或者出现从可写到可执行的内存保护变化，应检查这些区域是否属于目标进程的合法模块。

### 4. 检查线程上下文与入口地址

关注：

```text
GetThreadContext / NtGetContextThread
  → SetThreadContext / NtSetContextThread
  → ResumeThread
```

重点比较：

- 恢复线程前后的 `RIP` / `EIP`；
- 入口地址是否仍位于原始主模块的合法代码节；
- 入口地址是否位于匿名内存、私有提交内存或异常映射区域；
- 目标进程的 PEB、模块列表和实际内存映射是否一致。

### 5. 内存取证与映像一致性检查

这是识别进程空洞化的关键方法之一。可检查：

- 进程主模块路径与内存中主模块内容是否一致；
- PE 头是否存在于预期基址；
- 内存中的 `MZ` / `PE` 结构是否对应磁盘文件；
- 主模块节区是否被改写、缺失或映射属性异常；
- `MEM_PRIVATE` 区域是否包含完整 PE 映像；
- 线程入口是否指向未被正常模块覆盖的内存区域；
- VAD、模块列表和实际映射之间是否存在不一致。

常见异常表现是：

```text
进程路径正常
  + 主模块校验异常
  + 内存中出现另一份 PE 结构
  + 主线程入口不在原始模块范围内
```

### 6. 关联后续行为

进程空洞化完成后，应继续查看目标进程是否出现：

- 异常网络连接；
- 加载未签名或路径异常的模块；
- 创建服务、计划任务或其他持久化；
- 读取凭据、浏览器数据和其他用户目录；
- 连接 C2 或执行命令解释器；
- 创建子进程并继续注入其他目标。

目标进程后续行为可以帮助判断写入的是测试代码、合法插件，还是已经开始运行恶意载荷。

## 重点检测链

### 高置信度进程空洞化链

```text
可疑进程
  → CreateProcess(CREATE_SUSPENDED)
  → NtUnmapViewOfSection
  → VirtualAllocEx / NtAllocateVirtualMemory
  → WriteProcessMemory / NtWriteVirtualMemory
  → SetThreadContext / NtSetContextThread
  → ResumeThread
```

### 无明显卸载调用的变体

```text
CreateProcess(CREATE_SUSPENDED)
  → 目标进程大范围内存写入
  → PE 结构或节区出现于私有内存
  → 主线程入口被修改
  → ResumeThread
```

检测规则不应强制要求 `NtUnmapViewOfSection` 一定出现，否则容易漏掉直接覆盖原映像或使用节区映射的变体。

## 结论

普通写内存解决的是：

```text
如何把数据或代码放入另一个进程
```

远程线程、APC 和线程劫持解决的是：

```text
如何让目标进程执行这些代码
```

而进程空洞化进一步解决了：

```text
如何让一个看起来正常的进程，从启动阶段就承载并执行另一份完整映像
```

因此，进程空洞化的高级性主要体现在三个方面：

1. 借用正常进程的名称、路径和进程树外观；
2. 替换目标进程的原始映像和执行入口，而不只是追加一段代码；
3. 需要同时处理 PE 映像、内存布局、重定位、线程上下文和执行恢复。

检测时不应只搜索 `WriteProcessMemory` 或 `CreateRemoteThread`，而应把进程创建方式、目标进程初始状态、映像卸载、内存写入、线程入口和后续行为串成一条时间线。
