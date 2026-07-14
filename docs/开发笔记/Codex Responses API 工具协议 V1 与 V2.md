## Codex / Responses API 工具协议：V1 与 V2

给本地代理或兼容层适配不同模型时，可能会遇到这样的现象：同样请求 `POST /v1/responses`，一个模型能正常调用工具，另一个模型似乎也看见了工具，却始终执行失败。

这通常不是模型“会不会用工具”的差异，而是客户端暴露给模型的**工具协议已经变化**。本文将两套常见形式暂称为：

- **V1**：传统 `function_call` 风格。
- **V2**：`additional_tools` + `custom_tool_call` 风格。

适用于以下场景：

- 编写 OpenAI Responses API 兼容代理。
- 将 Codex 或桌面客户端接入自定义后端。
- 调试工具调用的请求、响应转换。
- 排查“模型看见工具但执行失败”的问题。

## 核心结论

工具集主要由**客户端或编排层**决定；模型只会在已经暴露的工具中选择调用目标，并生成相应参数。

```text
客户端 / 编排层
↓ 决定工具集、工具协议与调用格式
模型
↓ 选择是否调用、调用哪个工具、填写什么输入
工具执行环境
```

因此，“某模型不能使用某工具”常见根因是：

- 客户端为不同模型暴露了不同工具集。
- 同一种能力切换到了新协议。
- 代理只兼容了旧协议。

## V1：传统 function_call

### 请求

V1 是传统的 function calling 形式。工具通常位于请求顶层的 `tools`，并使用标准 function schema：

```json
{
  "model": "gpt-5.4",
  "input": [...],
  "tools": [
    {
      "type": "function",
      "name": "exec_command",
      "description": "Runs a command in a PTY",
      "parameters": {
        "type": "object",
        "properties": {
          "cmd": { "type": "string" }
        },
        "required": ["cmd"]
      }
    }
  ]
}
```

在 Codex 语境中，V1 常见工具名比较直接，例如：

- `exec_command`
- `write_stdin`
- `apply_patch`
- `view_image`
- `update_plan`
- `request_user_input`

### 响应

模型决定调用工具后，通常返回 `function_call`：

```json
{
  "type": "function_call",
  "call_id": "call_xxx",
  "name": "exec_command",
  "arguments": "{\\"cmd\\":\\"pwd\\"}"
}
```

工具执行完成后，客户端或代理通过 `function_call_output` 将结果回送给模型：

```json
{
  "type": "function_call_output",
  "call_id": "call_xxx",
  "output": "...command output..."
}
```

### 特点

```text
工具 = 函数
参数 = JSON object
调用项 = function_call
输出项 = function_call_output
```

对于只面向传统 function calling 的系统，V1 接入成本通常最低，也最容易代理。

## V2：additional_tools 与 custom_tool_call

### 请求

V2 不只是字段换名，而是工具暴露方式与抽象层级的变化。最明显的特征是：工具不一定放在顶层 `tools`，还可能被放入 `input` 中的 `additional_tools` 容器。

```json
{
  "model": "gpt-5.6-terra",
  "input": [
    {
      "type": "additional_tools",
      "role": "developer",
      "tools": [
        {
          "type": "custom",
          "name": "exec",
          "description": "Run JavaScript code to orchestrate/compose tool calls"
        }
      ]
    }
  ]
}
```

这里有两个关键信号：

- 工具定义的位置变了。
- 工具类型不再全是 `function`，还可能是 `custom`。

#### 工具名称可能变化

V2 不只是包装方式变化，模型看到的工具名也可能不同。例如：

```text
V1：exec_command
V2：exec
```

这不表示新模型不支持执行命令，而是客户端不再直接暴露 `exec_command`，改为暴露一个更高层的编排工具。

### custom 工具

`exec` 看起来像普通工具名，却不是“传入一个 JSON object”的普通 function tool，而是一个 **custom tool**。

它的输入不是：

```json
{ "cmd": "pwd" }
```

而是未经 JSON 包装的 JavaScript 源码：

```js
const result = await tools.exec_command({ cmd: "pwd" });

if (typeof result === "string") {
  text(result);
} else {
  text(JSON.stringify(result, null, 2));
}
```

换言之，`exec` 的输入应当是：

- 原始 JavaScript source text。
- 不是 JSON。
- 不是 Markdown 代码围栏。
- 不是把 JavaScript 再字符串化后的 JSON 字段。

这说明 V2 的 `exec` 并非旧版 `exec_command` 的简单别名，而是一个可用于组合底层工具的高层编排运行时。

### 响应

普通 function 工具仍可能使用 `function_call`；但 `type: "custom"` 的工具应返回 `custom_tool_call`，并通过 `input` 承载原始输入。

如果代理将 `exec` 错误回放为下面的 V1 形式：

```json
{
  "type": "function_call",
  "name": "exec",
  "arguments": "{\\"cmd\\":\\"pwd\\"}"
}
```

客户端通常无法接受，并可能报出：

```text
tool exec invoked with incompatible payload
```

## V1 与 V2 的差异

| 维度 | V1 | V2 |
| --- | --- | --- |
| 工具位置 | 顶层 `tools` | 顶层 `tools` 或 `input[]` 的 `additional_tools` |
| 工具类型 | 主要是 `function` | 可能同时包含 `function` 与 `custom` |
| 调用项 | `function_call` | function 可用 `function_call`；custom 应用 `custom_tool_call` |
| 参数载荷 | `arguments`，通常为 JSON 字符串 | custom 使用 `input`，格式由工具协议决定 |
| 抽象层级 | 原子 RPC 工具 | 可暴露多工具编排运行时 |

### 工具位置

V1 的工具通常直接放在 `body.tools`。V2 还可能放在：

```text
body.input[].type == "additional_tools"
```

因此代理如果只读取顶层 `tools`，会把 V2 错误判断为“没有工具”。

### 参数载荷

V1 的参数位于 `arguments`，通常是 JSON 字符串。V2 custom tool 的参数位于 `input`，具体格式取决于工具定义。

对 `exec` 来说：

```text
arguments: {"cmd":"pwd"}     ×
input: 原始 JavaScript 源码       ✓
```

### 工具抽象

V1 更接近底层 RPC：直接暴露 `exec_command` 等原子工具。

V2 更接近 agent runtime：例如 `exec` 允许模型编写一段 JavaScript，再由运行时组合调用底层工具。因此 V2 不只是协议升级，也代表工具设计的抽象层级发生了变化。

## 不同模型的工具集

客户端或编排层可能按照模型版本、能力评估、实验灰度策略，向不同模型下发不同工具协议。常见的渐进方式是：

```text
旧模型
↓
稳定的 V1 工具集

新模型
↓
V2 工具集与高层编排能力

兼容代理
↓
同时支持两套协议
```

#### 为什么会引入高层工具

像 `exec` 这种“写 JavaScript 再调工具”的模式，要求模型具备更强的多步规划、工具组合和上下文组织能力。因此客户端可能只对部分模型启用。

#### 为什么不能一刀切

现实系统不能立即废弃旧协议，否则既有代理、中间层和网关会大面积失效。V1 与 V2 并存，通常是协议演进中的兼容策略，而不是两个模型能力的简单高低之分。

## 兼容代理

### 问题根因

以“`gpt-5.4` 正常、`gpt-5.6-terra` 失败”为例，问题通常分为两层。

#### 工具位置变了

顶层 `tools` 为空时，很容易误以为新模型没有工具；实际上工具可能位于：

```text
input[].type == "additional_tools"
```

代理应同时从顶层 `tools` 和 `additional_tools` 收集工具。

#### 协议类型变了

即使代理已发现 `exec`，若仍把它翻译为普通 `function_call`，调用也会失败。原因是：

```text
原始工具：type: "custom"
客户端期待：custom_tool_call + input
错误回放：function_call + arguments
```

因此，问题不是模型没有调用工具，而是代理将 V2 custom tool 错翻成了 V1 function call。

### 请求侧适配

代理至少应完成以下工作：

1. 同时收集 `body.tools`、`body.input[].additional_tools` 和 `body.input[].tools`。
2. 普通 `function` 工具按原样转发。
3. 对 `custom` 工具保留其原始类型、名称和 namespace 等元信息。
4. 如果上游只接受函数 schema，可将 custom tool 临时包装成单字符串 `input` 参数的 function。

例如可将 `exec` 包装为：

```json
{
  "type": "function",
  "function": {
    "name": "exec",
    "parameters": {
      "type": "object",
      "properties": {
        "input": { "type": "string" }
      },
      "required": ["input"]
    }
  }
}
```

同时应在 description 中明确：`input` 必须是 raw JavaScript source text。

### 响应侧适配

响应转换时，应按工具的**原始类型**回放：

1. 查找被调用工具保存的元信息。
2. 原始类型为 `function` 时，沿用 `function_call`。
3. 原始类型为 `custom` 时，还原为 `custom_tool_call`。
4. 对 `exec`，将内容放入 `input`，不要放入 `arguments`。

#### 容错转换

如果上游模型为 `exec` 错误返回了旧式 JSON，例如：

```json
{ "cmd": "pwd" }
```

代理可在明确的兼容分支中将其改写为 JavaScript `input`。这样可以兼容尚未完全理解 V2 输入规则的上游模型，同时不破坏 V1 主路径。

## 排障

### 请求检查

排查时先确认工具究竟出现在哪里：

- 顶层 `tools`。
- `input[].type == "additional_tools"`。
- `input[].tools`。

顶层为空不代表请求没有工具。

### 协议检查

重点区分：

```text
type: "function"
type: "custom"
```

如果原始工具是 `custom`，就不能再使用纯 `function_call` 的心智模型处理它。需要同时确认客户端期望的是：

```text
function_call
还是
custom_tool_call
```

### 错误检查

以下报错往往不是“模型不会用工具”，而是协议转换或载荷形状错误：

- `tool exec invoked with incompatible payload`
- `Function call output is missing for call id: ...`

它们通常表示调用已经发生，但客户端无法解析代理返回的调用项或输出项。

## 设计建议

### 双协议并存

兼容层应从一开始按“双协议并存”设计：

- 不假设 Responses API 只有 function calling。
- 不假设工具永远位于顶层。
- 不假设所有 tool input 都是 JSON object。
- 不假设所有工具结果都只能通过 `function_call` 回传。

### 元信息保留

一个稳妥的架构是：

```text
请求侧：收集 + 归一化 + 保存原始工具元信息
↓
上游调用
↓
响应侧：按原始类型回放
```

中间层应尽量保留工具原始类型、名称、namespace 和输入协议。这样协议继续演进时，代理无需每次大规模重写。

## 小结

1. 工具集主要由客户端或编排层决定，而不是模型自行决定。
2. V1 与 V2 的区别不只是字段位置，还包括工具类型、调用项、输入协议与抽象层级。
3. `gpt-5.4` 能用而 `gpt-5.6-terra` 失败，常见原因是两者获得了不同工具协议，而代理只兼容 V1。
4. `exec` 容易出错，是因为它是要求 raw JavaScript source text 的 custom tool，而不是普通 function tool。
5. 最稳妥的代理策略是同时兼容 V1 与 V2，并在响应侧按原始工具类型回放。

> 不是模型不会调工具，而是代理把客户端的 V2 custom tool 协议错翻成了 V1 function call 协议。
