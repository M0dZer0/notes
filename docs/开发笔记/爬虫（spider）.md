## Scrapy

### 安装

推荐使用虚拟环境安装，避免污染全局 Python。

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
pip install scrapy
```

Windows（PowerShell）激活虚拟环境：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
pip install scrapy
```

验证安装：

```bash
scrapy version
```

### 创建项目

```bash
scrapy startproject demo_spider
cd demo_spider
```

生成一个爬虫文件：

```bash
scrapy genspider example example.com
```

### 运行方法

在 Scrapy 项目根目录执行：

```bash
scrapy crawl example
```

将结果导出为 JSON：

```bash
scrapy crawl example -O result.json
```

常用调试命令：

```bash
scrapy list
scrapy shell "https://example.com"
```
