## Python
### IDE与Terminal解释器和包管理控制

最近发现用terminal跑的python是homebrew的解释器，但是pip包却是装给了anaconda的解释器，搞了一个晚上把引导做好了。

*容易出问题的地方：anaconda在Mac系统上会自动添加进环境变量所以会自动把一些东西的路径改了*

使用`pip -- version`可以查看pip的包会安装到哪个路径下，这里可以确定会装给哪个解释器，例如我的pip指向的是anaconda里面的python解释器的系统库，这样我在IDE中常用的python@homebrew就会出现装了包但还是报错的情况。目前尝试了以下方法解决。

##### 1. 找到解释器对应的pip可执行程序

例如我的python@homebrew解释器的路径在`/opt/homebrew/opt/python3/bin`，注意这里是符号链接，真正的python装在Cellar目录下，同路径下也有pip包管理器，这里就可以使用命令将pip链接到指定的pip程序下。

```shell
ln -sf /opt/homebrew/opt/python3/bin/pip3 $(which pip)
```

这样就可以在终端用pip给python@homebrew解释器安装想要的包了。可能有些多此一举，主要是以前懵懂的时候被这个情况搞过，然后也想整合好电脑上的3个python解释器让他们各司其职。

- python3.9@Xcode	Mac原生安装好的python解释器，装了一些比较难找的小众库，做一些小程序用
- python3.11@homebrew	brew安装的python解释器，可以配合brew配置GTK、SQL等，项目开发用
- python3.11@anaconda	内置好了很多深度学习库，炼丹用

##### 2. 在当前目录下运行python pip

##### 3. 创建虚拟环境

目前给python3加了软链接，使用conda创建虚拟环境后进入虚拟环境，使用python调用虚拟环境解释器。

```shell
conda create -n myenv python=3.12
conda activate myenv
conda deactivate
conda env remove -n myenv
```

注意同时使用pip，pip3也加上了软链接。