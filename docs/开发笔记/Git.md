## Git操作

### 如何构建新分支

首先克隆仓库，创建自己的分支，修改代码后提交，提交时设置上游分支，之后在该分支开发。

```shell
git clone <repository_url>
git checkout -b mybranch
git status
git add .
git commit
git push -u origin mybranch
```

新分支合并到主分支，通常来说如果commit比较少，小于2可以直接rebase，多了就直接merge便于回滚。

### 多次重复提交如何合并
有时候需要一点一点修改代码测试，最终得到一个版本，之前的提交记录就可以合并，称为squash操作。如何想留下最新版本：
```shell
git rebase -i HEAD~n
```

执行 `git rebase -i HEAD~n` 后，Git 会显示一个提交列表，其中包含 `n` 个提交：

```
pick abc1234 Commit message 1
pick def5678 Commit message 2
pick ghi9012 Commit message 3
```

| **指令**                | **行为**                        | **结果**                   |
| ----------------------- | ------------------------------- | -------------------------- |
| **pick**                | 保留该提交                      | 记录和代码都留下。         |
| **squash (s)**          | 将该提交合并到**前一个**提交    | **代码留下**，记录合并。   |
| **fixup (f)**           | 同 squash，但不要这个提交的日志 | **代码留下**，日志被丢弃。 |
| **drop (d) / 直接删行** | 彻底删除该提交                  | **代码和记录全部丢失。**   |

所以如果想要合并，应该修改成

```
pick abc1234 Commit message 1
squash def5678 Commit message 2
squash ghi9012 Commit message 3
```

然后保存并退出编辑器。之后修改commit信息，最后需要强制推送（`--force` 或 `--force-with-lease`）到远程仓库。

```shell
git push --force-with-lease origin your-branch-name
```

## Git功能

### CI/CD

<details>
  <summary>什么是CI/CD</summary>
  <div>
<p><strong>CI/CD</strong> 是“持续集成”（Continuous Integration）和“持续交付/持续部署”（Continuous Delivery / Continuous Deployment）的缩写，是一种软件开发实践和方法，旨在提高开发效率、减少错误并加快软件交付的速度。</p>

<h3>1. <strong>持续集成 (CI - Continuous Integration)</strong></h3>

<p>持续集成的核心思想是：开发人员经常将代码集成到共享的代码库中，而不是长时间地保持分支独立。在每次提交代码时，自动化的构建和测试流程会被触发，从而确保代码在合并之前是有效的，避免了由于合并冲突或错误积累的问题。</p>

<p><strong>主要内容包括：</strong></p>
<ul>
  <li><strong>频繁提交：</strong> 开发人员每天多次将代码提交到共享代码库。</li>
  <li><strong>自动化构建：</strong> 每次代码提交后，自动触发构建过程，确保代码可以顺利编译。</li>
  <li><strong>自动化测试：</strong> 执行单元测试、集成测试等，以检查代码是否存在问题。</li>
</ul>

<h3>2. <strong>持续交付 (CD - Continuous Delivery)</strong></h3>

<p>持续交付的目标是确保每次代码更改都能自动化地通过测试，并准备好可以部署到生产环境。持续交付确保软件在任何时候都处于可发布的状态，但并不直接将其部署到生产环境，而是确保可以随时部署。</p>

<p><strong>主要内容包括：</strong></p>
<ul>
  <li><strong>自动化部署：</strong> 代码完成测试后，自动部署到一个预生产环境（如 staging 环境）进行进一步验证。</li>
  <li><strong>版本管理：</strong> 始终有一个可以发布到生产的版本，确保代码可以随时投入使用。</li>
</ul>
<h3>3. <strong>持续部署 (Continuous Deployment)</strong></h3>
<p>持续部署是持续交付的一个进一步发展，它意味着每次代码更改一旦通过测试，就会自动部署到生产环境，而无需人工干预。</p>

<p><strong>主要内容包括：</strong></p>
<ul>
  <li><strong>自动化到生产：</strong> 每次通过自动化测试的代码更改会被立即推送到生产环境，不需要人工操作。</li>
  <li><strong>快速发布：</strong> 用户可以快速地体验到最新的功能或修复。</li>
</ul>
  </div>
</details>
