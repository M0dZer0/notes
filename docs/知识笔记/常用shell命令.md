## 下载

### 使用 `wget`

`wget` 的设计初衷就是为了下载，所以默认行为非常直接。

- **基本下载：**

  ```bash
wget https://example.com/file.zip
  ```
  
  *这会自动将文件保存为原名。*

- **指定保存的文件名 (`-O`)：**

  ```bash
  wget -O my_filename.zip https://example.com/file.zip
  ```

------

### 使用 `curl`

`curl` 是一个功能更强大的数据传输工具，但在下载文件时，默认会将内容**打印到终端**，所以你必须指定输出方式。

- **基本下载并保持原名 (`-O` 大写)：**

  ```bash
  curl -O https://example.com/file.zip
  ```
  
- **指定保存的文件名 (`-o` 小写)：**

  ```bash
  curl -o my_filename.zip https://example.com/file.zip
  ```

------

### 核心区别小贴士

| **功能**         | **wget 命令**         | **curl 命令**                |
| ---------------- | --------------------- | ---------------------------- |
| **断点续传**     | `wget -c [URL]`       | `curl -C - -O [URL]`         |
| **后台下载**     | `wget -b [URL]`       | 不直接支持（需配合系统命令） |
| **下载整个网站** | 支持（递归下载 `-r`） | 不支持                       |

**温馨提示：** 如果你在下载大文件时网络不稳定，建议优先使用 `wget -c`，它的自动重试机制通常比 curl 更省心。



