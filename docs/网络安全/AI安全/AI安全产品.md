> 本文调研 AI Agent 运行时安全产品，主要依据 Microsoft Defender for Endpoint 官方文档和 CrowdStrike 2026 年 3 月 23 日官方新闻稿。重点不是罗列营销词，而是拆解产品在什么位置观察 Agent、能看到什么、检测什么、如何处置，以及公开资料没有说明什么。
>
> 资料检索时间：2026-08-07。Microsoft AI agent runtime protection 标注为 Preview；CrowdStrike 材料带有 Future Product Disclaimer，文中提到的部分服务或功能可能仍未发布、仍在开发或发生变化。因此，本文只把官方材料明确描述的能力写成产品事实。

## 一、AI 安全产品究竟在保护什么

AI Agent 不只是向模型发送一个问题。它通常会读取本地文件、网页和工具返回值，形成计划，再调用 Shell、浏览器、代码仓库、云服务或 MCP 工具执行动作。一次任务可能形成如下闭环：

~~~text
用户提示
  ↓
模型推理 ← 文件 / 网页 / RAG / 工具返回值
  ↓
工具请求 → 命令、脚本、文件、网络、SaaS、云 API
  ↓
工具响应重新进入模型上下文
  ↓
下一轮决策
~~~

传统安全产品通常只覆盖其中一部分：DLP 看敏感数据，EDR 看进程和文件行为，网络安全产品看连接，API 网关看接口调用。Agent 安全产品要解决的新增问题是：**如何把 prompt、Agent 身份、工具调用和最终系统行为关联成一条可检测、可阻断、可调查的链路。**

从检测位置看，当前产品能力大致可以分为四层：

| 层次 | 观察对象 | 典型问题 | 传统安全类比 |
| --- | --- | --- | --- |
| 资产与暴露面 | AI 应用、Agent、LLM runtime、MCP server、权限 | 企业里有哪些 AI，运行在哪里，权限有多大 | 资产管理、ASM、CAASM |
| Prompt 与 Agent loop | 用户提示、工具请求、工具响应 | 提示注入、数据泄露、策略违规 | WAF / IPS + DLP，但对象变成自然语言和 Agent 上下文 |
| 执行行为 | 命令、脚本、文件、进程、网络连接 | Agent 是否执行恶意命令、改文件、连接异常地址 | EDR / XDR |
| 运营与响应 | 告警、事件、实体关系、终端隔离 | 如何还原攻击链并控制影响范围 | SIEM、SOAR、EDR 响应 |

Microsoft 和 CrowdStrike 的共同点是都把端点视为关键控制位置，但二者公开材料中的实现重点不同：Microsoft 重点描述 Agent loop 的内容检查和执行前阻断；CrowdStrike 同时描述资产发现、Prompt 层 AIDR 和端点执行行为 EDR。比较时必须把这些层次拆开。

## 二、Microsoft Defender for Endpoint AI agent runtime protection

### 1. 产品定位与状态

Microsoft 将 AI agent runtime protection 作为 Defender for Endpoint 的端点能力，用于保护在用户终端上运行的本地 AI Agent，包括编码助手、CLI 工具、桌面 AI 应用和自治 Agent 平台。

官方文档给出的核心威胁是 Prompt Injection：Agent 会同时读取用户提示、文件、网页和工具输出，模型无法可靠地区分可信数据与隐藏指令。一条藏在正常内容中的恶意指令可能借用当前用户权限读取数据、修改代码或运行命令。

这项能力在官方概览中明确标记为 **Preview**。它不是一个保护所有模型和所有 Agent 的通用承诺，而是针对受支持终端、受支持 Agent event interface 和受支持网络路径的运行时检查。

### 2. 防护思想：控制 Agent loop 的关键关口

Microsoft 的思路不是持续抓取 Agent 进程中的所有内部推理，而是在内容进入或离开 Agent 决策环的关键位置插入快速检查：

~~~text
用户输入 ──[User prompt 检查]──→ Agent
                                  ↓
Agent ──[Pre-tool call 检查]──→ 工具执行
                                  ↓
Agent ←─[Post-tool response 检查]─ 工具返回
~~~

这三个点分别回答：

- **User prompt**：用户提交给 Agent 的提示中是否包含 Prompt Injection 或高风险内容；
- **Pre-tool call**：Agent 即将调用什么工具、带什么请求，是否应在执行之前阻止；
- **Post-tool response**：文件、网页、仓库或工具返回给 Agent 的内容中是否藏有恶意指令，是否应阻止它继续进入 Agent loop。

这很像在 Agent 的控制流上部署 IPS：不是等恶意命令执行完成后再找痕迹，而是在模型接收内容、调用工具和消费工具结果的交界处检查。它又不同于普通 WAF，因为输入不只来自用户请求，还可能来自本地文件、网页、代码仓库和工具输出。

官方强调，每次扫描是在事件点进行的快速 inline check，而不是持续监控整个 Agent 进程，因此产品设计目标是以较低延迟插入 Agent 工作流。文档没有公开具体检测模型、规则组合、特征或评分阈值，不能据此推断其内部一定使用某种特定大模型或分类器。

### 3. 两种检查路径

#### Agent-native event inspection

Agent-native event inspection 使用 Agent 厂商公开支持的事件接口或 hook。由于事件本身是结构化的，Defender 可以知道当前 payload 是用户提示、工具执行前请求，还是工具执行后的返回值，并在该事件点执行 Audit 或 Block。

官方文档列出的原生事件检查支持对象包括：

- Claude Code；
- Codex CLI；
- GitHub Copilot CLI；
- GitHub Copilot app。

不同事件点的阻断语义不同：

- 在用户提示点阻断，可防止提示继续被 Agent 处理；
- 在工具调用前阻断，可防止请求的工具动作实际执行；
- 在工具响应后阻断，可防止该响应继续进入后续 Agent loop。

这种方式的优点是事件语义清楚，并且能够在工具执行前形成真正的 enforcement point。它的覆盖面取决于 Agent 是否暴露受支持的事件接口，以及对应事件是否支持阻断。

#### Network inspection

对于没有提供受支持事件接口的 Agent，Defender 可以检查受支持的 Agent 到 LLM 网络流量，在内容传输过程中检测 Prompt Injection。

网络路径扩大了覆盖面，但官方明确给出两个限制：

- 使用 certificate pinning 的 Agent 不受支持；
- 使用 HTTP/3 的 Agent 不受支持。

网络检查看到的是受支持网络流中的内容，不具备原生 hook 天然提供的完整结构化事件语义。官方资料没有公开其 TLS 处理细节、支持的 LLM 服务清单或所有网络拓扑，因此不应进一步声称它可以检查任意加密 AI 流量。

两种方式可以单独启用，也可以同时启用，且都支持 Disabled、Audit 和 Block 三种模式。

### 4. 官方明确描述的检测点

| 检测点 | 能看到什么 | 官方描述的安全目标 | 可执行动作 |
| --- | --- | --- | --- |
| User prompt | 用户提交的 Prompt | Prompt Injection、高风险 Agent 活动 | 受支持事件点可 Audit 或 Block |
| Pre-tool call | 工具调用请求及其 payload | 阻止受注入影响的工具动作实际运行 | 受支持时在执行前阻断 |
| Post-tool response | 工具执行完成后的返回内容 | 发现来自文件、网页、仓库或工具输出的间接注入 | 阻止返回内容继续进入 Agent loop |
| 受支持网络流 | Agent 与 LLM 通信中的内容 | 为无原生事件接口的 Agent 检测传输中的 Prompt Injection | Audit 或 Block，具体能力受网络路径限制 |

官方示例是一名编码 Agent 读取项目文档，网页中的隐藏文本要求 Agent 读取本地 `.env` 文件并将内容发送到外部 URL。Defender 在工具响应中检测到注入，并在数据离开设备前阻止后续动作。

需要注意的是，**Defender通常可以看到要调用的工具名称、调用参数和返回内容，但通常不能看到工具函数的具体实现和工具本身的逻辑漏洞**，如果工具本身存在 SQL 注入、命令执行、权限校验缺失等漏洞，但尚未表现为恶意 Prompt、异常工具调用、恶意进程、文件或网络行为，单靠 runtime hook 不一定能发现。工具代码本身仍然需要通过代码审计、SAST、SCA、单元测试和独立运行时防护检查。

### 5. 处置模式与告警链路

运行时保护有三种模式：

- **Disabled**：不检查 Agent 活动，也不检测或阻断 Prompt Injection；
- **Audit**：允许动作继续执行，但记录检测并产生安全告警；
- **Block**：阻止受支持的威胁动作，向用户和 SOC 提供通知与告警。

在 Block 模式下，用户可以在 Agent 终端中看到被阻断的内容、原因以及动作未执行的提示，同时收到 Windows toast notification。检测还会写入 Windows Security 的 Protection history。

SOC（Security Operations Center） 侧会收到 `Suspicious AI prompt injection` 告警。相关告警可在 Microsoft Defender 中关联成 incident；调查视图包括检测类型、严重性、受影响 Agent、进程树和建议动作，并复用终端时间线、实体关联和响应流程。

Block 模式下，告警根据风险评估标记为 Critical、High、Medium 或 Low；Audit 模式下，告警为 Informational，用于观察如果启用阻断会发生什么。

运行时保护设置受 tamper protection 保护，目的是防止未授权修改。官方推荐先 Audit、观察一到两周、处理误报，再逐步切换到 Block。

### 6. 部署条件和配置方式

官方配置文档列出的前提包括：

- 具有 Microsoft Defender for Endpoint Plan 2、Microsoft 365 E5、Microsoft Agent 365 或 Microsoft 365 E7 许可证之一；
- 终端已接入 Defender for Endpoint；
- Microsoft Defender Antivirus 以 active mode 运行并启用 real-time protection；
- 使用受支持版本的 Windows，并保持 Defender 平台、引擎和安全情报更新；
- 安装了与计划启用的检查方式相匹配的受支持本地 Agent。

单机上通过 Microsoft Defender PowerShell preference 配置：

~~~powershell
Set-MpPreference -AiAgentProtection Audit
Set-MpPreference -AiAgentNetworkInspection Audit
~~~

`AiAgentProtection` 对应原生事件检查，`AiAgentNetworkInspection` 对应网络检查。二者都可以配置为 Disabled、Audit 或 Block，并可通过 `Get-MpPreference` 查看状态。

官方当前没有提供原生 Intune policy，组织级部署方式是通过 Intune 下发 PowerShell script。配置后需要关闭用于运行 Agent 的终端窗口，再打开新的终端窗口。

推荐实施路径为：

1. 在少量实际使用受支持 Agent 的设备上启用 Audit；
2. 在 Defender portal 中观察一到两周，评估误报并提交误报样本；
3. 扩大 Audit 覆盖的设备组；
4. 在准确性和可操作性得到验证后，对目标设备组切换为 Block。

### 7. 能力边界

根据官方文档，以下结论不能扩大解释：

- 它当前是 Preview，未来接口、支持范围和许可条件可能变化；
- 原生事件检查只覆盖官方列出的受支持 Agent，不能自动等同于所有本地 AI 应用；
- 网络检查存在 certificate pinning 和 HTTP/3 限制，也没有公布任意网络流量覆盖承诺；
- inline scan 是事件点检查，不是对 Agent 进程全部行为的持续 EDR 监控；
- 公开资料重点描述 Prompt Injection，不应把它描述成完整 DLP、模型安全评测、AI 供应链扫描或全功能 MCP 安全产品；
- Defender 的本地 AI Agent 与 MCP 配置发现属于互补的 discovery 能力，不应与 runtime protection 本身混为一个检测机制。

## 三、CrowdStrike Falcon AI 安全能力

### 1. 材料性质与产品边界

CrowdStrike 官方材料的标题是 “CrowdStrike Establishes the Endpoint as the Epicenter for AI Security”，发布时间为 2026 年 3 月 23 日。它是一份产品新闻稿，介绍横跨 endpoint、SaaS、browser 和 cloud 的多项 Falcon 平台能力。

材料末尾有 Future Product Disclaimer：其中讨论的未发布服务或功能可能仍在开发并发生变化，客户应基于当前已经可用的功能作采购决定。因此，下面只能说明 CrowdStrike 已公开宣称的设计与能力，不能仅凭该材料确认每项功能已经 GA、具体许可包、支持操作系统、部署参数或全部响应动作。

CrowdStrike 的端点侧内容至少包含三个不同层次：

1. Shadow AI Discovery for Endpoint：发现和评估 AI 资产；
2. AIDR for Endpoint：检查 Prompt 层攻击、数据泄露和策略违规；
3. EDR AI Runtime Protection：观察 Agent 最终落到端点上的命令、脚本、文件和网络行为。

这三项能力不是同一个检测点，不能把其中任意一项单独描述成覆盖了另外两项的功能。

### 2. 防护思想：端点是 AI 动作发生的位置

CrowdStrike 的核心判断是：Agent 最终要在端点上执行命令、修改文件、访问敏感数据并触发下游工作流，而且这些动作常常使用合法用户权限，看起来与正常用户行为相似。因此，端点既是攻击目标，也是发现和处置 Agent 风险的重要 enforcement point。

这套思路将 AI 风险拆成两条相互补充的证据链：

~~~text
Prompt / Agent 语义链
提示 → 注入或数据泄露 → 策略违规

端点执行链
Agent 进程 → 命令 / 脚本 → 文件活动 → 网络连接 → 最终影响
~~~

Prompt 层有助于回答“Agent 为什么这样做”，端点行为层有助于回答“它实际上做了什么”。单看 Prompt 可能看不到最终子进程和文件落地；单看 EDR 行为则可能难以判断一个看似合法的命令是否源自被注入的 Agent。CrowdStrike 的官方材料表达了两层覆盖，但没有公开说明两类检测在产品内部如何关联、共享哪些事件字段或采用何种关联算法。

### 3. Shadow AI Discovery for Endpoint

该能力用于自动发现终端上运行的：

- AI applications；
- AI agents；
- LLM runtimes；
- MCP servers；
- AI development tools。

发现结果会与资产上下文和 privilege exposure 关联，用于判断关键系统上的风险与潜在 blast radius。这里的重点不是检测一次 Prompt Injection，而是回答：企业有哪些 AI 组件、运行在哪些资产上、关联什么权限，以及某个组件被攻陷后可能影响多大范围。

CrowdStrike 在新闻稿中称，其传感器在客户环境中检测到超过 1,800 种不同 AI 应用和约 1.6 亿个独立应用实例。该数据引用 FY26 Earnings，属于厂商披露的规模数据，不等同于独立第三方测试，也不能直接代表单个客户的覆盖率。

#### Shadow SaaS

Shadow SaaS 指企业内部未经正式批准、登记或安全治理的 SaaS 使用。

例如员工直接注册并使用：

- 外部 AI 对话平台；
- SaaS 内置的 AI 助手；
- 在线代码生成平台；
- 未经企业采购和数据评估的自动化服务。

典型特征是：

```
员工或团队自行使用 SaaS
    ↓
没有进入企业资产清单
    ↓
安全团队不知道谁在使用、传输了什么数据、具有什么权限
```

风险包括：

- 企业数据被上传到外部平台；
- 使用个人账号，离职后仍可能保留访问权；
- SaaS 平台配置不符合企业要求；
- AI Agent 连接了过多 API 或数据源；
- 缺少明确的业务 owner；
- 无法及时撤销 token、连接器和权限。

CrowdStrike 官方材料中提到的发现对象包括 Microsoft Copilot、Salesforce Agentforce、ChatGPT Enterprise、OpenAI Enterprise GPT 和 Nexos.ai 等平台。

#### Shadow Agent

Shadow Agent 可以理解为“未经企业纳管的 AI Agent”。

它比普通 Shadow SaaS 更强调自主执行能力。普通 Shadow SaaS 可能只是员工打开网页提问，而 Shadow Agent 可能拥有自己的工具、身份和权限，可以自动完成一系列操作。

例如：

```
一个员工私自创建的自动化 Agent
    ↓
绑定个人 API Token
    ↓
连接企业邮箱、代码仓库、工单系统
    ↓
能够自动读取、修改或发送数据
```

它的风险不只是“使用了什么 SaaS”，还包括：

- Agent 的 owner 是谁；
- 使用什么身份运行；
- 拥有哪些 API 权限；
- 连接了哪些数据源；
- 能调用哪些工具；
- 是否可以跨系统执行操作；
- 是否长期后台运行；
- 是否存在过度授权或无法撤销的凭据。

因此可以粗略理解为：

```
Shadow SaaS：未经治理的 SaaS 使用
Shadow Agent：未经治理、并且具有自动执行能力的 Agent
```

Shadow Agent 可以运行在本地终端、云环境或 SaaS 平台中，不一定只指某一种部署位置。

### 4. AIDR for Endpoint

AIDR for Endpoint 是 Prompt 层能力。官方材料明确描述它对桌面 AI 应用执行实时 Prompt inspection，并检测：

- Injection attacks；
- Data leaks；
- Access policy violations；
- Content policy violations。

材料列举的桌面 AI 应用包括：

- ChatGPT；
- Gemini；
- Claude；
- DeepSeek；
- Microsoft Copilot；
- O365 Copilot；
- GitHub Copilot；
- Cursor。

AIDR 与普通网络 DLP 的区别在于它把 Prompt 作为主要检查对象，并区分注入、数据泄露和策略违规。它又不能仅凭新闻稿被理解为完整 DLP：材料没有公布敏感信息识别方法、数据分类器、脱敏动作、策略语言、离线模式、支持的传输协议或阻断粒度。

官方使用的是 “real-time prompt inspection and detection” 和 “surfaces ... violations”。该材料没有明确说明 AIDR for Endpoint 是否在所有列举应用中都支持 Prompt 提交前阻断、响应内容阻断或工具执行前阻断，因此本文不将这些动作写成已确认功能。

### 5. EDR AI Runtime Protection

EDR AI Runtime Protection 复用 Falcon sensor 在端点执行位置获得的运行时可见性。官方材料明确列出的观察对象是所有终端应用的：

- Commands；
- Scripts；
- File activity；
- Network connections。

由于 Agentic application 也运行在端点上，这些遥测可以用来识别可疑 Agent 行为，并将活动追溯到 originating process。安全团队可以立即采取行动，官方给出的明确响应例子是隔离受影响终端，以在威胁扩散前进行控制。

这一层的价值在于行为不依赖 Prompt 是否可见。即使无法读取某个 Agent 的 Prompt，只要它在终端上启动命令、写文件或建立网络连接，Falcon sensor 仍可能从 EDR 行为侧获得证据。

但行为可见性不等于理解完整 Agent 语义。新闻稿没有公开 EDR AI Runtime Protection 的专用检测规则、AI 行为基线、阻断时机、支持平台或与 AIDR 的关联字段，也没有明确声称每次可疑工具调用都可以在执行之前被拦截。因此，不能把它直接等同于 Microsoft 的 Pre-tool call hook。

### 6. SaaS、浏览器和云侧能力

CrowdStrike 材料还介绍了端点以外的能力：

- **Shadow SaaS and AI Agent Discovery**：发现 Microsoft Copilot（Power Platform）、Salesforce Agentforce、ChatGPT Enterprise、OpenAI Enterprise GPT 和 Nexos.ai 等平台中的 Shadow SaaS、Agent 活动、权限及数据访问；
- **AIDR for Copilot Studio Agents**：实时监控 Prompt、数据交互和 Agent 行为，检测注入、数据泄露和策略违规；
- **Shadow AI Discovery for Cloud**：发现云基础设施和应用层的 Shadow AI、未治理 LLM / MCP 连接以及敏感数据暴露，并提供优先级化修复；
- **AIDR for Cloud**：保护容器环境中使用 OpenAI API specification 通信的 AI workload，检查 AI 服务运行时流量并检测 Prompt 攻击、数据泄露和策略违规；
- **AI Data Flow Discovery for Cloud**：观察敏感数据如何进入和流经 AI 服务，并通过统一 SOAR workflow 自动响应；
- **Browser runtime protection**：新闻稿表示 Seraphic 收购将运行时保护扩展到浏览器，但没有在该材料中提供更细的检测点和处置机制。

这些能力共同表达了跨 endpoint、SaaS、browser 和 cloud 的平台方向。由于来源是一份带未来产品声明的新闻稿，不能据此确认所有能力的正式可用日期、许可组合或技术实现细节。

### 7. CrowdStrike 公开资料中的检测链路

| 层次 | 产品能力 | 明确公开的观察对象 | 明确公开的检测 / 处置 |
| --- | --- | --- | --- |
| 资产发现 | Shadow AI Discovery for Endpoint | AI 应用、Agent、LLM runtime、MCP server、开发工具、资产与权限暴露 | 发现、关联资产上下文、评估潜在 blast radius |
| Prompt 层 | AIDR for Endpoint | 桌面 AI 应用的 Prompt | 检测注入、数据泄露、访问与内容策略违规 |
| 执行行为 | EDR AI Runtime Protection | 命令、脚本、文件活动、网络连接、originating process | 发现可疑行为、追溯来源进程、可隔离终端 |
| SaaS Agent | Shadow SaaS / AIDR for Copilot Studio | Agent 活动、权限、数据访问、Prompt、数据交互 | 发现 Shadow Agent；检测注入、数据泄露、策略违规 |
| 云 AI workload | Shadow AI Discovery / AIDR / Data Flow Discovery | LLM 与 MCP 连接、容器 AI 服务通信、敏感数据流 | 发现暴露、检测 Prompt 攻击和泄露、通过 SOAR 响应 |

## 四、两个产品体系的核心对比

### 1. 先明确比较对象

Microsoft 官方资料聚焦一项具体能力：Defender for Endpoint AI agent runtime protection。CrowdStrike 材料描述的是一组 Falcon AI 安全能力。因此更合理的对照关系是：

| Microsoft | CrowdStrike 中最接近的能力 |
| --- | --- |
| Agent-native User prompt / Post-tool response 检查 | AIDR for Endpoint 的实时 Prompt inspection |
| Agent-native Pre-tool call 阻断 | 新闻稿没有披露完全等价的 Agent hook 检查点 |
| Network inspection | AIDR for Endpoint / AIDR for Cloud 均涉及 Prompt 或 AI 服务通信检查，但材料没有说明与 Microsoft 相同的网络实现 |
| Defender 终端告警、进程树与 incident | Falcon EDR AI Runtime Protection 的 originating process 追溯和终端隔离 |
| 互补的本地 Agent / MCP discovery | Shadow AI Discovery for Endpoint |

不能用 Microsoft 的一个具体 runtime protection 功能去直接对比 CrowdStrike 整个平台后得出“谁覆盖更多”的结论；也不能只拿 CrowdStrike EDR 行为层去对比 Microsoft Prompt 层后得出“谁检测更深”的结论。

### 2. 架构与检测重点

| 对比项 | Microsoft Defender for Endpoint | CrowdStrike Falcon 官方材料 |
| --- | --- | --- |
| 核心思想 | 在 Agent loop 关键事件点检测 Prompt Injection，并在受支持点执行 inline Audit / Block | 以端点为 AI 执行与控制中心，同时覆盖资产发现、Prompt 层和端点行为层 |
| Prompt 检查 | 明确检查 User prompt、Pre-tool call、Post-tool response；另有受支持网络流检查 | AIDR for Endpoint 实时检查桌面 AI 应用 Prompt，检测注入、泄露和策略违规 |
| Agent 工具调用 | 原生事件接口明确提供 Pre-tool call 和 Post-tool response 检查点 | 新闻稿未公开与 Pre-tool call hook 完全等价的检查机制 |
| 执行行为 | 本文所依据的 runtime protection 文档不是持续 EDR 行为说明，但告警调查可见进程树 | EDR AI Runtime Protection 明确采集命令、脚本、文件和网络活动，并追溯 originating process |
| 资产发现 | 另有互补能力发现受支持本地 Agent 和 MCP 配置 | Shadow AI Discovery 明确发现 AI 应用、Agent、LLM runtime、MCP server 和开发工具 |
| 主要威胁 | 官方重点是 Prompt Injection 和 high-risk agent activity | Prompt 注入、数据泄露、访问 / 内容策略违规，以及端点可疑执行行为 |
| 阻断说明 | Disabled / Audit / Block；受支持 hook 可阻止 Prompt、工具动作或工具返回继续处理 | 明确说明可立即响应并隔离终端；新闻稿未详细说明每类 Prompt 或工具动作的 inline 阻断语义 |
| 覆盖方式 | Agent-native event inspection + supported network inspection | Falcon sensor 行为遥测 + AIDR Prompt inspection + Shadow AI discovery |
| 平台范围 | 当前配置文档要求受支持 Windows 和 Defender Antivirus active mode | 新闻稿描述 endpoint、SaaS、browser、cloud，但未给出各能力支持 OS 和部署矩阵 |
| 产品状态证据 | Microsoft Learn 详细技术和配置文档，产品标注 Preview | 官方两页新闻稿，带 Future Product Disclaimer，部分能力可能未发布 |

### 3. 检测语义的差异

Microsoft 的优势信息点在于**检查位置和阻断时机公开得更具体**。特别是 Pre-tool call 能够在工具实际运行之前阻断，Post-tool response 能阻止恶意内容继续进入下一轮推理，这是一种 Agent loop 原生控制。

CrowdStrike 的优势信息点在于**端点行为证据公开得更完整**。Commands、scripts、file activity 和 network connections 可以说明 Agent 最终执行了什么，并追溯 originating process。它还将 Prompt 层 AIDR 和资产发现单独列出，形成发现、语义检测和行为调查三个层次。

两种检测不能互相替代：

- Prompt 层提前发现注入，不代表一定看到了所有子进程、文件落地和后续网络行为；
- EDR 看到了命令和网络连接，不代表一定知道哪一段网页隐藏文本诱导了 Agent；
- 资产发现知道 MCP server 存在，不代表该 server 的工具描述或返回内容已经被动态检查；
- 数据泄露检测知道敏感内容进入 Prompt，不代表已经建立最小权限和业务授权。

理想链路是把四种信息关联起来：

~~~text
Agent / MCP 资产与权限
        ↓
Prompt、工具请求与工具响应
        ↓
进程、命令、脚本、文件与网络行为
        ↓
告警、事件、终端隔离与业务响应
~~~

### 4. 各自更适合回答的问题

Microsoft 当前公开能力更擅长直接回答：

- 哪一段用户提示或工具返回触发了 Prompt Injection 检测？
- Agent 正要调用哪个工具，能否在执行前阻断？
- 工具返回的恶意内容能否被阻止进入下一轮 Agent loop？
- 在 Defender 终端与 incident 工作流中如何审计这次检测？

CrowdStrike 当前公开材料覆盖的问题更宽：

- 企业终端上运行了哪些 AI 应用、Agent、LLM runtime 和 MCP server？
- AI 组件关联哪些资产和权限，潜在 blast radius 是什么？
- 桌面 AI Prompt 中是否有注入、数据泄露或策略违规？
- Agent 最终执行了哪些命令和脚本，改了哪些文件，连了哪些网络地址？
- 能否追溯 originating process，并通过终端隔离控制威胁扩散？

这里的“更适合”只是依据公开资料的信息完整度，不代表第三方实测结果，也不代表另一家产品完全没有相关能力。

## 五、如何评估和选型

### 1. 不要只测试一句恶意 Prompt

真实的 Agent 风险经常来自间接内容和连续工具链。POC 至少应覆盖：

- 用户直接提交的 Prompt Injection；
- 文件、网页、代码仓库内容或工具返回值中的间接 Prompt Injection；
- 恶意内容诱导 Agent 读取 `.env`、密钥文件或敏感源码；
- Agent 尝试执行命令、修改文件和向外部地址建立连接；
- 合法安全研究、代码注释和文档中出现攻击词汇时的误报；
- Agent 多轮调用、子进程和脚本执行后的事件关联；
- 未提供原生 hook、使用 certificate pinning 或 HTTP/3 的覆盖缺口；
- 未登记 Agent、LLM runtime 和 MCP server 的发现能力；
- Audit 到 Block 切换后，对用户体验和任务成功率的影响。

测试时使用合成密钥和隔离环境，不使用真实生产凭据，也不要只记录“有没有告警”，还要记录告警发生在哪一个环节以及动作是否已经执行。

### 2. POC 应记录的指标

| 指标 | 要回答的问题 |
| --- | --- |
| 资产覆盖率 | 实际安装的 Agent、AI 应用、LLM runtime 和 MCP server 中发现了多少 |
| 检查点覆盖率 | User prompt、工具前、工具后、网络、命令、文件和连接分别能看到多少 |
| 执行前阻断率 | 告警产生时危险动作是否尚未执行 |
| 间接注入检出率 | 注入藏在网页、文件、仓库或工具输出时能否发现 |
| 行为关联完整度 | 能否从 Agent 追到子进程、脚本、文件、连接和最终影响 |
| 数据泄露识别能力 | 原文、编码、拆分、摘要或工具参数中的敏感数据是否可识别 |
| 误报与任务影响 | Audit 命中中有多少是正常工作，Block 后任务失败率和额外延迟是多少 |
| 旁路与降级 | Agent 更换协议、模型、hook、HTTP/3 或 certificate pinning 后是否失去覆盖 |
| SOC 可调查性 | 告警是否包含 Agent、用户、设备、进程树、Prompt / 工具上下文和处置证据 |
| 响应闭环 | 能否阻断动作、撤销凭据、隔离终端并保留取证信息 |

### 3. 根据现有安全体系判断部署价值

如果组织已经以 Microsoft Defender for Endpoint、Microsoft Defender portal、Intune 和 Windows 终端为主，Microsoft 的优势是把 Agent loop 检测接入既有终端告警与 incident 流程，并公开了具体的 hook、模式和 PowerShell 配置方式。但上线前需要核实 Preview 接受度、受支持 Agent 范围和网络检查限制。

如果组织已经使用 Falcon sensor 和 Falcon 平台，CrowdStrike 的思路是复用现有端点行为遥测，将 AI 资产发现、Prompt 层 AIDR 和端点 EDR 行为放在同一平台方向下。采购或 POC 时必须要求厂商明确哪些新闻稿能力已经可用、对应许可、支持平台、检测点和阻断动作，不能把 future roadmap 当成当前交付能力。

如果核心诉求是工具执行前阻断，应重点验证产品是否真正拥有 Agent 原生 Pre-tool call enforcement point；如果核心诉求是发现 Agent 执行后的系统级影响，则要重点验证进程、命令、文件、网络和身份的关联能力；如果核心诉求是防数据泄露，还要确认其识别类型、策略粒度、目的地控制和脱敏 / 阻断动作，不能仅凭 “data leak detection” 一句话完成选型。

## 六、容易混淆的产品概念

### 1. Runtime protection 不一定是同一种 runtime

Microsoft 文档中的 runtime 重点是 Agent loop 事件点和网络内容；CrowdStrike EDR AI Runtime Protection 的 runtime 重点是端点执行行为。两者都叫 runtime protection，但观察对象、拦截时机和证据类型不同。

### 2. Discovery 不等于 Protection

发现一个 MCP server、Agent 或 LLM runtime，只能说明资产存在及其暴露面。要判断它是否被 Prompt Injection 操纵、是否执行危险命令，还需要 Prompt 层或行为层检测。

### 3. Prompt 检测不等于完整 DLP

产品能够发现 Prompt 中的数据泄露，不代表它已经具备传统 DLP 的全部数据指纹、分类分级、跨通道控制、审批、脱敏和合规能力。选型时要逐项确认数据类型与处置动作。

### 4. EDR 行为检测不等于 Agent 原生阻断

EDR 可以看到 Agent 启动命令、修改文件和建立连接，但如果告警发生在行为执行之后，它与 Agent Pre-tool call 的执行前阻断不是同一能力。必须通过 POC 验证具体时机。

### 5. 新闻稿不等于技术手册

新闻稿适合确认厂商方向和公开宣称的能力，不适合推断内部架构、支持矩阵和交付状态。带有 Preview 或 Future Product Disclaimer 的能力，应在采购、上线和风险接受流程中单独标记。

## 七、调研结论

Microsoft Defender for Endpoint AI agent runtime protection 走的是较清晰的 **Agent loop 原生检查** 路线：在 User prompt、Pre-tool call、Post-tool response 和受支持网络路径上检查 Prompt Injection，并通过 Audit / Block 接入现有 Defender 告警和 incident 流程。它的优点是检查点与阻断语义具体，边界则是 Preview、受支持 Agent 与网络路径有限，而且它不是对全部 Agent 行为的持续监控。

CrowdStrike 公布的是一个更宽的 **发现 + Prompt + EDR 行为 + 跨 SaaS / 浏览器 / 云** 平台方向。Shadow AI Discovery 负责知道 AI 在哪里，AIDR 负责 Prompt 层注入、泄露和策略违规，EDR AI Runtime Protection 负责命令、脚本、文件和网络行为以及 originating process 追溯。它公开的行为层更丰富，但当前依据主要是带 Future Product Disclaimer 的新闻稿，技术细节、交付状态和精确阻断点需要进一步向厂商核实。

两个体系真正的差异不是简单的“谁能检测 Prompt Injection”，而是安全控制放在哪里：**Agent loop 的结构化关口，还是 Agent 最终执行动作的端点行为层。** 成熟的 Agent 安全建设通常需要同时覆盖资产、Prompt、工具和执行行为，任何单一检测点都不足以单独证明一次 Agent 任务是安全的。

## 八、官方资料

- [Microsoft Learn：AI agent runtime protection with Microsoft Defender for Endpoint](https://learn.microsoft.com/en-us/defender-endpoint/ai-agent-runtime-protection-overview)
- [Microsoft Learn：Set up AI agent runtime protection with Microsoft Defender for Endpoint](https://learn.microsoft.com/en-us/defender-endpoint/configure-ai-agent-runtime-protection)
- [CrowdStrike Investor Relations：CrowdStrike Establishes the Endpoint as the Epicenter for AI Security（PDF）](https://ir.crowdstrike.com/node/16206/pdf)
- [CrowdStrike Investor Relations：同一新闻稿 HTML 版本](https://ir.crowdstrike.com/node/16206)
