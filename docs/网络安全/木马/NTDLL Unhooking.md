---
title: NTDLL Unhooking（NTDLL 脱钩）
---

## 概念

**NTDLL Unhooking（NTDLL 脱钩）**是通过恢复进程内 `ntdll.dll` 被 Hook 修改的代码，移除用户态 API 拦截的一种技术。在木马场景中，它常被用于削弱依赖这些 Hook 的行为采集与拦截能力。

这里的“脱钩”主要指移除 **Inline Hook（内联钩子）**：安全产品在函数入口等位置修改机器指令，将执行流引向自己的处理逻辑；脱钩则将相关位置恢复为原始代码。

它修改的是**进程用户地址空间中的 NTDLL 代码**，不是删除磁盘上的 `ntdll.dll`，也不是卸载安全产品。NTDLL 脱钩本身不要求内核权限；在自己控制的进程内完成相关修改，仍取决于页面保护和进程缓解策略等条件。

## NTDLL 与用户态 Hook

### 系统调用入口

`ntdll.dll` 提供了许多 [Windows Native API（NT API）](../Windows安全/Windows%20Native%20API（NT%20API）.md) 的用户态入口，例如：

| 用户态入口（`ntdll.dll`） | 对应的内核系统服务（`ntoskrnl.exe`，符号前缀 `nt!`） | 内核态 Zw 入口名称 | 相关能力 |
|---|---|---|---|
| `ntdll!NtOpenProcess` | `nt!NtOpenProcess` | `nt!ZwOpenProcess` | 打开目标进程并申请句柄 |
| `ntdll!NtAllocateVirtualMemory` | `nt!NtAllocateVirtualMemory` | `nt!ZwAllocateVirtualMemory` | 分配虚拟内存 |
| `ntdll!NtWriteVirtualMemory` | `nt!NtWriteVirtualMemory` | `nt!ZwWriteVirtualMemory` | 向目标进程写入内存 |
| `ntdll!NtProtectVirtualMemory` | `nt!NtProtectVirtualMemory` | `nt!ZwProtectVirtualMemory` | 修改内存页保护属性 |
| `ntdll!NtCreateThreadEx` | `nt!NtCreateThreadEx` | `nt!ZwCreateThreadEx` | 创建线程 |

`ntdll!` 和 `nt!` 表示不同模块中的同名符号：前者是用户态系统调用入口，后者是内核中的系统服务。用户态调用经系统调用分派进入对应的 `nt!Nt*` 服务，不应理解成普通函数调用直接跳进内核，或固定经过 `nt!Zw*`。

内核驱动调用 `Nt*` 与 `Zw*` 时，两者对调用者模式、参数探测和信任来源的处理存在差异；用户态的 Nt/Zw 入口则不会因为名称不同而获得内核权限。具体语义见微软的 [Nt/Zw 调用说明](https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/using-nt-and-zw-versions-of-the-native-system-services-routines)。表格用于说明服务对应关系，不代表所有列出的入口在所有 Windows 版本中都属于已公开、受支持的驱动 DDI；尤其是写内存、改保护和创建线程相关接口，不能仅凭名称假定其内核导出和兼容性。

以上接口对应的请求最终进入内核，由内核完成实际操作和相应的安全检查。以跨进程内存写入为例，可抽象为：

```text
应用程序（用户态）
  ↓
ntdll!NtWriteVirtualMemory（用户态）
  ↓ 系统调用
nt!NtWriteVirtualMemory（内核态系统服务）
  ↓
目标进程内存
```

### Hook 如何采集行为

部分 EDR 会在 NTDLL 的关键 API 入口安装 Inline Hook，将调用转向产品的处理逻辑，以采集调用者、目标对象、参数等上下文，或执行拦截策略。

```text
应用程序调用 Native API
  ↓
NTDLL 中被修改的入口
  ↓ 跳转
EDR Hook 处理逻辑
  ↓ 采集上下文、执行策略；允许时继续
原始 API 逻辑
  ↓ 系统调用
Windows 内核
```

并非所有 EDR 都使用相同 Hook 方案，也不是所有 NTDLL 函数都会被 Hook。这里描述的是一种常见的用户态监控模型。

### EDR 如何安装 Hook

对于用户态 Inline Hook，常见模型是 EDR 将自己的监控 DLL 装载到目标进程，由其中的代码定位该进程内 NTDLL 的目标函数，并将入口处的部分指令替换为跳转。跳转目的地是同一进程地址空间内的 EDR 处理逻辑；它采集上下文后，可以阻止调用，或继续执行原来的函数。

为了保留原始行为，Hook 实现通常会保存被覆盖的指令，并准备 **Trampoline（跳板）**：先执行被搬走的原始指令，再跳回目标函数未被覆盖的位置。

```text
ntdll!NtOpenProcess 的入口
  ↓ 被改成跳转
进程内的 EDR Hook 处理逻辑
  ↓ 允许调用时
Trampoline：被保存的原始指令
  ↓ 跳回
NtOpenProcess 后续代码
  ↓ 系统调用
nt!NtOpenProcess
```

安装 Hook 还需要处理代码页的写入权限、指令边界、线程并发和指令缓存一致性。微软 [Detours 的函数拦截说明](https://github.com/microsoft/Detours/wiki/OverviewInterception)展示了这种“改写入口 + 保存原始指令 + 跳板”的通用机制；它用于帮助理解 Inline Hook，不代表每家 EDR 都使用 Detours 或完全相同的实现。

### Hook 是在导入 NTDLL 之前加上的吗

**对进程内 NTDLL 的 Inline Hook，更准确的顺序是：NTDLL 已经映射到进程地址空间，随后安装 Hook，并尽量在应用的业务代码执行前完成。** 修改目标代码必须先有对应的内存映射。

这里容易混淆三个时间点：

| 阶段 | 发生的事情 | 与 Hook 的关系 |
|---|---|---|
| 创建进程、建立地址空间 | 系统映射可执行映像及早期需要的 NTDLL | NTDLL 已有进程内的代码地址，但应用入口尚未执行 |
| 早期用户态初始化 | NTDLL 的加载器逻辑处理 DLL 装载、导入解析和初始化等工作 | EDR 可安排监控组件尽早进入进程并安装 Hook，具体时机取决于产品 |
| 转交应用入口并执行业务代码 | 应用开始执行自身逻辑并调用 API | 若 Hook 已完成，调用会经过 EDR；运行中的进程也可能后来才被安装 Hook |

NTDLL 参与进程的早期初始化，因此不能把它简单理解成应用运行到某个 `LoadLibrary` 调用时才加载的普通插件。“导入表里引用了某个函数”“DLL 映像已映射”“DLL 初始化完成”和“应用入口开始执行”也不是同一件事。

可以把一种典型的早期安装模型抽象为：

```text
新进程建立，NTDLL 已映射
  ↓
EDR 安排进程内监控组件尽早装载或执行
  ↓
修改该进程 NTDLL 的目标函数入口
  ↓
应用业务代码开始执行
  ↓
调用被 Hook 的 Native API
```

[Elastic 对早期进程初始化的分析](https://www.elastic.co/security-labs/threat-command/call-stacks-no-more-free-passes-for-malware)也指出，依赖 Hook 的安全产品倾向于在早期初始化阶段介入。实际安装还可能由进程外的产品组件协调，不能仅凭上述模型认定某家 EDR 必须采用特定的注入方式，或已经覆盖所有初始化期间的调用。

通常被修改的是**目标进程内映射的 NTDLL 代码**，磁盘上的系统 DLL 保持原样；这也不是在一个全局 NTDLL 文件里加一次 Hook，就自动覆盖所有进程。产品需要确保各个受监控进程中都有相应的 Hook 和处理逻辑。

## 脱钩原理

### 恢复被修改的代码

核心思路是：取得未被 Hook 修改的 NTDLL 代码作为参考，再恢复当前进程内对应位置的指令。

```text
未被 Hook 修改的 NTDLL 参考代码
  ↓
对应函数或可执行代码区域的原始指令
  ↓ 恢复进程内相应位置
当前进程中的 ntdll.dll
  ↓
指向 EDR 处理逻辑的跳转被移除
  ↓
后续调用不再经过该 Hook
```

PE 文件的 `.text` 节通常存放可执行机器指令。脱钩可以针对部分被修改的函数代码，也可能涉及更大范围的代码区域。参考代码可能来自磁盘上的系统 DLL，但“来自系统目录”不能单独证明代码可信；分析时仍应核对参考映像的版本、架构和完整性。

理解这一机制时，要区分两个对象：

| 对象 | 脱钩涉及的变化 |
|---|---|
| 磁盘上的 `ntdll.dll` 文件 | 不一定发生任何修改 |
| 某个进程内映射的 NTDLL 代码 | 被恢复，原有 Hook 可能消失 |

因此，磁盘文件签名有效，并不能证明进程内的代码和 Hook 状态正常。某个进程完成脱钩，也不能据此推断其他进程里的 Hook 都已被移除。

### 脱钩动作也可能被观察

恢复代码涉及内存修改，并可能伴随代码页保护属性变化。若相关操作经过 EDR 已监控的 API，解除 Hook 的动作本身就可能触发检测。

```text
尝试恢复 NTDLL 代码
  ↓
修改代码页保护属性或写入代码
  ↓
仍有效的监控路径观察到系统 DLL 代码变化
  ↓
产生告警或阻止操作
```

所以，发现程序具备脱钩逻辑，不等于它已成功移除 Hook；还需要检查实际内存变化、Hook 状态及后续行为。

## 银狐案例

[CN-SEC：《让全球杀软集体失效！银狐木马2026年重磅升级：自编写驱动+Unhooking双链路攻击》](https://cn-sec.com/archives/5291146.html)的“3.1 Unhooking技术：用户态致盲EDR”一节介绍了用磁盘上的干净 NTDLL 代码覆盖当前进程内 `.text` 节，以移除 Inline Hook 的思路。

对应到本笔记，其机制是“取得参考代码 → 恢复进程内 NTDLL → 被覆盖的 Hook 不再触发”。文章中的示例应按原理示意理解，不能由此推断所有安全产品都会失效；其写内存接口名称 `NtWriteProcessMemory` 也应与通常使用的 Native API 名称 `NtWriteVirtualMemory` 区分，本文表格使用后者。

## 对 EDR 的影响

### 被移除的 Hook 不再触发

成功恢复某个 API 的原始代码后，经过该入口的调用不再跳转到原来的 Hook 处理逻辑。依赖这一路径的产品可能因此缺少部分参数、调用上下文或拦截机会。

但系统调用仍会进入内核，相关权限检查不会因用户态 Hook 消失而自动取消。脱钩也不意味着程序获得了任意操作其他进程的权限。

### 其他观测路径仍可能有效

**用户态 Hook 被移除，不等于 EDR 整体失效。** 其他数据来源是否能够观察到后续行为，取决于具体操作、系统环境和产品实现。

| 观测机制 | NTDLL 脱钩后的边界 |
|---|---|
| 被成功移除的 NTDLL Inline Hook | 经该入口的调用不再触发原 Hook |
| 其他位置的用户态 Hook | 不一定受影响 |
| [ETW-TI](../安全产品/ETW-TI.md) | 不因 NTDLL Hook 消失而必然失效；符合事件条件时仍可能产生遥测 |
| 内核进程、线程和映像加载通知 | 不因 NTDLL 脱钩而必然失效 |
| 内核对象访问回调 | 仍可能观察相应的句柄操作 |
| 文件系统 Minifilter | 不因 NTDLL 脱钩而必然失效 |

NTDLL 脱钩主要削弱的是**依赖被移除 Hook 的观测能力**，不能据此认定后续注入、线程创建或外连完全不可见。

## 检测与研判

### 代码与 Hook 状态

可关注以下线索：

- NTDLL 可执行代码页发生写入或异常保护属性变化。
- 已安装的关键 API Hook 消失，入口指令恢复为原始形态。
- 内存代码与产品预期的运行时状态不一致。
- 上述变化后紧接着出现可疑的[进程注入](./注入.md)、[内存执行](./内存执行.md)或外连。

完整性检查要区分**原始映像基线**和**产品安装 Hook 后的运行时基线**。因为脱钩可能恰好恢复原始字节，只比较“内存是否与磁盘一致”，未必能发现预期 Hook 被移除。

### 多源遥测关联

如果用户态 Hook 遥测明显减少，而内核侧仍持续观察到相应行为，可以将其作为采集路径异常的调查线索：

```text
NTDLL 代码或 Hook 状态变化
  +
用户态 API 遥测减少
  +
内核侧仍有相关行为记录
  +
后续可疑执行行为
```

单个 API 事件缺失不能证明脱钩，也可能来自调用路径差异、采集配置或产品故障。正常的软件插桩、调试和安全组件更新也可能影响代码或 Hook 状态，应结合修改主体、维护时段、产品状态和后续行为判断。

这类行为可结合[安全产品致盲](./安全产品致盲.md)笔记理解：安全组件仍在运行，但某条用户态采集或拦截路径可能已被削弱。

