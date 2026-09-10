数据结构决定了数据如何组织、访问和修改。Python 内置了多种常用容器，其中最核心的是列表（`list`）、元组（`tuple`）、集合（`set`）和字典（`dict`）。

选择数据结构时，通常需要考虑：

- 元素是否需要保持顺序；
- 是否允许重复元素；
- 是否需要通过下标或键访问；
- 容器本身是否需要修改；
- 是否需要快速判断某个元素是否存在。

## 列表 list

列表是有序、可变的序列，可以保存重复元素，也可以混合保存不同类型的对象。

### 创建与访问

```python
numbers = [10, 20, 30, 20]
mixed = [1, "Python", True]

print(numbers[0])    # 10
print(numbers[-1])   # 20
print(numbers[1:3])  # [20, 30]
```

下标从 `0` 开始；负数下标从末尾开始计算。切片通常会创建一个新的列表。

### 增加、修改与删除

```python
numbers = [10, 20, 30]

numbers.append(40)          # [10, 20, 30, 40]
numbers.extend([50, 60])    # [10, 20, 30, 40, 50, 60]
numbers.insert(1, 15)       # 在下标 1 插入 15
numbers[0] = 5              # 修改元素

numbers.remove(30)          # 删除第一个值为 30 的元素
last = numbers.pop()        # 删除并返回最后一个元素
del numbers[0]              # 按下标删除
```

`append()` 把一个对象作为单个元素加入列表，`extend()` 则把另一个可迭代对象中的元素逐个加入。

### 排序与推导式

```python
numbers = [3, 1, 4, 2]

numbers.sort()                    # 原地排序
descending = sorted(numbers, reverse=True)  # 返回新列表
squares = [number ** 2 for number in numbers]
```

列表适合需要保持插入顺序、按位置访问、允许重复值并且经常修改元素的场景。

## 元组 tuple

元组是有序、不可变的序列。创建后不能增加、删除或替换其中的元素。

### 创建与访问

```python
point = (10, 20)
empty = ()
single = (42,)  # 单元素元组必须保留逗号

print(point[0])   # 10
x, y = point      # 元组解包
```

圆括号并不是创建元组的关键，逗号才是：

```python
value = 1, 2, 3
print(type(value))  # <class 'tuple'>
```

### 不可变性的边界

元组不可变是指不能替换元组保存的引用；如果元组内部引用了可变对象，该对象本身仍然可以修改：

```python
record = ("Alice", [90, 95])
record[1].append(100)

print(record)  # ('Alice', [90, 95, 100])
```

因此，“元组不可变”不等于其内部所有对象都不可变。

### 常见用途

元组常用于：

- 表示坐标、尺寸等结构固定的数据；
- 从函数返回多个值；
- 进行序列解包；
- 在所有成员都可哈希（列表、字典、集合等元组可变元素不可哈希）时作为字典键或集合元素。

```python
locations = {
    (31.2304, 121.4737): "Shanghai",
    (39.9042, 116.4074): "Beijing",
}
```

## 集合 set

集合是无重复元素的可变容器，主要用于成员判断、去重和集合运算。集合不支持通过位置下标访问。

### 创建与基本操作

```python
tags = {"python", "backend", "python"}
print(tags)  # 重复的 python 只保留一个

empty_set = set()  # {} 创建的是空字典，不是空集合

tags.add("api")
tags.update(["web", "database"])
tags.discard("backend")  # 元素不存在时不会报错
```

`remove()` 和 `discard()` 都可以删除元素，但 `remove()` 在元素不存在时会抛出 `KeyError`。

### 集合运算

```python
backend = {"Python", "Go", "Java"}
frontend = {"JavaScript", "TypeScript", "Java"}

print(backend | frontend)  # 并集
print(backend & frontend)  # 交集：{'Java'}
print(backend - frontend)  # 差集：{'Python', 'Go'}
print(backend ^ frontend)  # 对称差集
```

也可以使用 `union()`、`intersection()`、`difference()` 等方法。

### 不可变集合

`frozenset` 是不可变集合，可以作为字典键或其他集合的元素：

```python
permissions = frozenset({"read", "write"})
cache = {permissions: "read-write role"}
```

集合适合去重、频繁判断成员是否存在，以及求交集、并集、差集等场景。

## 字典 dict

字典保存“键—值”映射。键必须是可哈希对象，并且不能重复；值可以是任意对象。现代 Python 中，字典会保持键的插入顺序。

### 创建与访问

```python
user = {
    "name": "Alice",
    "age": 20,
    "skills": ["Python", "SQL"],
}

print(user["name"])            # Alice
print(user.get("email"))       # None
print(user.get("email", "-"))  # -
```

使用 `user["email"]` 访问不存在的键会抛出 `KeyError`；`get()` 可以提供默认值。

### 增加、修改与删除

```python
user["email"] = "alice@example.com"  # 新增
user["age"] = 21                      # 修改
user.update({"city": "Shanghai"})

age = user.pop("age")
del user["email"]
```

### 遍历与字典推导式

```python
for key, value in user.items():
    print(key, value)

name_lengths = {
    name: len(name)
    for name in ["Alice", "Bob", "Charlie"]
}
```

常用视图方法包括：

- `keys()`：遍历所有键；
- `values()`：遍历所有值；
- `items()`：遍历所有键值对。

字典适合根据唯一标识快速查找对象、表达结构化记录、统计频次和建立索引。

## 其他常用数据结构

### 字符串 str

字符串是有序、不可变的字符序列，支持下标、切片和遍历：

```python
language = "Python"

print(language[0])      # P
print(language[1:4])    # yth
print(language.lower()) # python
```

字符串方法通常返回新字符串，不会修改原字符串。

### 双端队列 deque

`collections.deque` 支持在两端高效地添加和删除元素，适合实现队列：

```python
from collections import deque

queue = deque(["task-1", "task-2"])
queue.append("task-3")
current = queue.popleft()
```

列表从末尾 `append()` 和 `pop()` 很高效，但从开头插入或删除需要移动后续元素。需要频繁操作队首时应优先考虑 `deque`。

### 计数器 Counter

`collections.Counter` 是用于计数的字典子类：

```python
from collections import Counter

counts = Counter(["error", "info", "error", "warning"])
print(counts["error"])       # 2
print(counts.most_common(2)) # [('error', 2), ('info', 1)]
```

## 核心区别

| 数据结构 | 是否有序 | 是否可变 | 是否允许重复 | 访问方式 | 典型用途 |
| --- | --- | --- | --- | --- | --- |
| `list` | 是 | 是 | 是 | 整数下标 | 有序数据、动态增删、按位置访问 |
| `tuple` | 是 | 否 | 是 | 整数下标 | 固定记录、函数返回值、可哈希组合键 |
| `set` | 不应依赖位置顺序 | 是 | 否 | 成员判断 | 去重、交并差、快速判断存在性 |
| `frozenset` | 不应依赖位置顺序 | 否 | 否 | 成员判断 | 不可变集合、字典键、集合元素 |
| `dict` | 保持插入顺序 | 是 | 键不重复，值可重复 | 键 | 映射、索引、结构化记录 |

## 如何选择

- 需要按顺序保存一组可修改、可重复的数据：使用 `list`；
- 数据结构固定，希望表达“创建后不再替换元素”：使用 `tuple`；
- 需要去重、求交并差或频繁判断成员存在：使用 `set`；
- 需要通过名称、编号等唯一键查找对应值：使用 `dict`；
- 需要频繁从队首取出元素：使用 `collections.deque`。

从性能角度看，列表和元组的下标访问通常是常数时间；集合和字典基于哈希表，平均情况下成员判断或按键查询也是常数时间。列表中的成员查找通常需要从头扫描，因此是线性时间。实际选择仍应首先保证数据语义正确，再考虑性能。
