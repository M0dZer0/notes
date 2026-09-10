Lambda 表达式用于创建匿名函数，即没有通过普通 `def` 语句声明名称的函数。它适合表达短小、只使用一次的计算逻辑，并经常作为参数传给排序、过滤、映射等高阶函数。

“匿名”描述的是函数的创建方式，不代表函数对象永远不能拥有变量名：

```python
add = lambda left, right: left + right
print(add(2, 3))  # 5
```

虽然上面的写法可以运行，但如果函数会被多次调用，通常更推荐使用 `def` 并给函数取一个能够表达用途的名称。

## Python 中的基本语法

Lambda 的语法形式为：

```python
lambda 参数列表: 表达式
```

表达式的计算结果会被自动返回，不需要也不能在其中编写 `return`：

```python
square = lambda number: number ** 2
is_even = lambda number: number % 2 == 0

print(square(4))   # 16
print(is_even(6))  # True
```

Lambda 可以没有参数，也可以使用默认参数、可变位置参数和关键字参数：

```python
get_version = lambda: "1.0.0"
power = lambda number, exponent=2: number ** exponent
total = lambda *numbers: sum(numbers)
format_user = lambda **user: f"{user['name']} ({user['age']})"
```

Lambda 的主体只能是一个表达式，不能直接包含赋值语句、`for` 语句、`while` 语句、`try` 语句或多条普通语句。

## 常见用法

### 自定义排序规则

Lambda 最常见的用途之一是提供排序键：

```python
users = [
    {"name": "Charlie", "age": 20},
    {"name": "Alice", "age": 22},
    {"name": "Bob", "age": 20},
]

by_age = sorted(users, key=lambda user: user["age"])
by_age_and_name = sorted(
    users,
    key=lambda user: (user["age"], user["name"]),
)
```

第二个例子返回元组作为排序键：先按年龄排序，年龄相同时再按姓名排序。

### map 与 filter

`map()` 把函数应用到每个元素，`filter()` 根据函数返回值筛选元素：

```python
numbers = [1, 2, 3, 4, 5]

squares = list(map(lambda number: number ** 2, numbers))
even_numbers = list(filter(lambda number: number % 2 == 0, numbers))
```

在 Python 中，这两种操作也经常使用推导式表达：

```python
squares = [number ** 2 for number in numbers]
even_numbers = [number for number in numbers if number % 2 == 0]
```

简单转换通常使用推导式更易读；如果已有一个可复用函数，直接把该函数传给 `map()` 或 `filter()` 也很自然。

### 作为回调函数

只使用一次的简单回调可以直接使用 Lambda：

```python
def apply_operation(left, right, operation):
    return operation(left, right)

result = apply_operation(10, 3, lambda left, right: left - right)
print(result)  # 7
```

GUI 事件处理和异步任务完成回调中也常见这种写法，但复杂回调仍应提取为普通函数。

### 闭包与捕获外部变量

Lambda 和普通嵌套函数一样，可以读取外围作用域中的变量：

```python
def create_multiplier(factor):
    return lambda number: number * factor

double = create_multiplier(2)
triple = create_multiplier(3)

print(double(5))  # 10
print(triple(5))  # 15
```

需要注意循环变量的延迟绑定：

```python
functions = [lambda: number for number in range(3)]
print([function() for function in functions])  # [2, 2, 2]
```

这些函数执行时才查找 `number`，循环结束后它的值已经是 `2`。可以使用默认参数在创建函数时保存当前值：

```python
functions = [lambda number=number: number for number in range(3)]
print([function() for function in functions])  # [0, 1, 2]
```

## Lambda 与普通函数的区别

```python
multiply_lambda = lambda left, right: left * right

def multiply_function(left, right):
    return left * right
```

| 对比项 | Lambda | `def` 函数 |
| --- | --- | --- |
| 函数名 | 通常匿名 | 必须声明名称 |
| 函数主体 | 只能是单个表达式 | 可以包含任意语句和多个分支 |
| 返回值 | 自动返回表达式结果 | 使用 `return` 显式返回 |
| 文档字符串 | 不适合 | 支持 |
| 类型注解 | 参数位置不便直接标注 | 完整支持参数与返回值注解 |
| 调试信息 | 常显示为 `<lambda>` | 显示明确函数名 |
| 典型用途 | 短小的一次性函数 | 复用逻辑或复杂业务逻辑 |

## 优势

- 写法紧凑，适合一眼即可理解的简单操作；
- 可以直接放在函数调用位置，减少无关的临时函数名称；
- 适合配合 `sorted()`、`min()`、`max()` 等接收函数参数的 API；
- 能够形成闭包，保存外围作用域中的状态。

## 劣势

- 只能包含一个表达式，不适合复杂控制流；
- 多层嵌套或表达式过长时，可读性明显下降；
- 调试栈通常只显示 `<lambda>`，定位问题不如命名函数直观；
- 难以书写清晰的文档字符串和完整类型注解；
- 循环中捕获变量时容易遇到延迟绑定问题；
- 为追求简短而堆叠条件表达式，往往会让代码更难维护。

## 使用建议

适合使用 Lambda 的例子：

```python
youngest = min(users, key=lambda user: user["age"])
```

不适合继续压缩成 Lambda 的逻辑：

```python
def calculate_discount(user, amount):
    if not user.is_active:
        return 0
    if user.is_vip:
        return amount * 0.2
    return amount * 0.05
```

判断标准不是代码能否写成一行，而是读者能否立即看懂其意图。Lambda 超过一个简单操作、需要注释、需要复用或需要单元测试时，通常应改用 `def`。
