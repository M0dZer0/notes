## Git操作

### SSH 密钥

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
cat ~/.ssh/id_ed25519.pub
```

如果系统不支持 `ed25519`：

```bash
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
cat ~/.ssh/id_rsa.pub
```

### 新建分支

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

### 分支合并

- 如果主分支没有改动，仅新分支改动，则只需要在主分支执行`git merge newbranch`即可。
- 如果主分支有改动，但改动位置与新分支改动位置不一样，则只需要在新分支执行`git merge main`即可，这样就会把主分支改动内容增加到新分支且保留新分支改动内容，再到主分支中执行`git merge newbranch`即可。
- 如果主分支和新分支改动了相同位置，则需要在新分支执行`git merge main`并手动解决冲突，IDE有解决冲突的视图，终端操作需要手动处理冲突，再使用git add该文件并提交，解决冲突之后再到主分支中执行`git merge newbranch`即可。

### Git Rebase

`git rebase` 最核心的用途可以理解成：

> 把当前分支上的提交“重新接到”另一个提交后面，让 Git 历史变得更线性、更干净。

它最常见的场景是：开发功能的过程中，`main` 已经继续向前提交，希望把自己的 feature 分支更新到最新的 `main`。

#### 1. Rebase 的基本过程

假设从 `B` 创建了 `feature` 分支，并产生了两个提交：

```text
A---B---C        main
     \\
      D---E      feature
```

此时在 `main` 上执行了 `C`，希望将 `feature` 更新到最新的 `main`。可以使用 merge：

```shell
git switch feature
git merge main
```

结果会产生一个额外的合并提交：

```text
A---B---C---------M    feature
     \\             /
      D-----------E
```

也可以使用 rebase：

```shell
git switch feature
git rebase main
```

Git 会暂时取下 `D`、`E` 中的修改，将 `feature` 移到 `main` 的末端，然后按顺序重新应用这些修改：

```text
A---B---C---D'---E'    feature
```

这里的 `D'`、`E'` 不是原来的 `D`、`E`，而是重新生成的 commit。因为 commit 内容、父提交或提交信息发生了变化，它们通常会拥有新的 commit ID。因此，rebase 不是简单地移动分支指针，而是重新创建提交。

#### 2. 同步最新的主分支

准备提交 PR/MR 前，常见的操作流程是：

```shell
git switch feature-login
git fetch origin
git rebase origin/main
```

执行后，历史大致会从：

```text
main:    A---B---C---D---E
              \\
feature:       F---G
```

变成：

```text
A---B---C---D---E---F'---G'
```

这样 feature 分支就基于最新的 `origin/main`，提交历史看起来像是在最新主分支上直接开发的。`git fetch` 只更新远程跟踪分支，不会修改当前工作区；之后的 `git rebase origin/main` 才会重放 feature 分支的提交。

由于 rebase 改变了 `F`、`G` 的 commit ID，之前已经推送过的 feature 分支通常需要使用：

```shell
git push --force-with-lease origin feature-login
```

`--force-with-lease` 会先检查远程分支是否出现了自己不知道的新提交，比直接使用 `git push --force` 更安全，可以减少误覆盖他人提交的风险。

#### 3. 交互式 Rebase

`git rebase -i`（interactive rebase，交互式变基）常用于整理自己的 commit 历史。比如开发过程中产生了许多临时提交：

```text
B 实现登录
C 修一下
D 这里又错了
E 最终修复
```

希望将最近 4 个提交整理后，可以执行：

```shell
git rebase -i HEAD~4
```

编辑器中可能看到：

```text
pick B 实现登录
pick C 修一下
pick D 这里又错了
pick E 最终修复
```

可以改成：

```text
pick B 实现登录
squash C 修一下
squash D 这里又错了
squash E 最终修复
```

保存并退出后，`C`、`D`、`E` 会被合并到前一个提交中，最终得到一个更完整的提交，例如：

```text
A---B'
```

常见的交互式 rebase 指令：

| 指令 | 行为 |
| --- | --- |
| `pick`（`p`） | 保留该提交 |
| `reword`（`r`） | 保留代码，但修改提交信息 |
| `edit`（`e`） | 暂停在该提交，继续修改代码或提交 |
| `squash`（`s`） | 合并到前一个提交，并重新编辑提交信息 |
| `fixup`（`f`） | 合并到前一个提交，但丢弃当前提交信息 |
| `drop`（`d`）或删除该行 | 删除该提交 |

因此，rebase 常见的两个用途是：

1. 将 feature 分支同步到最新的主分支：`git fetch origin && git rebase origin/main`。
2. 整理自己的提交：`git rebase -i HEAD~n`，合并、删除、修改或调整提交。

#### 4. Rebase 冲突处理

如果主分支和 feature 分支修改了同一部分内容，rebase 过程中也可能发生冲突。处理流程如下：

```shell
# 1. 手动编辑冲突文件，保留正确内容
git add <resolved-file>

# 2. 继续重放后续提交
git rebase --continue
```

如果发现当前 rebase 不符合预期，可以取消本次操作，恢复到 rebase 开始前的状态：

```shell
git rebase --abort
```

如果某个提交的修改已经不需要，确认后也可以跳过它：

```shell
git rebase --skip
```

#### 5. Rebase 和 Merge 怎么选？

| 场景 | 更常见的选择 |
| --- | --- |
| 自己的 feature 分支同步最新 `main` | `rebase` |
| 整理自己尚未公开的提交 | `rebase -i` |
| 合并已经公开、多人共同使用的分支 | `merge` |
| `main` / `master` 等公共主分支 | 通常不要自行 rebase |
| PR/MR 提交前整理历史 | 经常使用 `rebase` |

最重要的原则是：

> 不要随便 rebase 别人已经基于它开发的公共历史。

因为 rebase 会改变 commit ID。对已经推送且正在被别人使用的分支执行 rebase，可能导致其他人无法正常同步，甚至需要重新处理整个分支历史。通常只 rebase 自己负责、且没有被他人依赖的 feature 分支。

可以把 rebase 理解为“搬家”：原来 feature 是从 `B` 开始开发的；当 `main` 继续变成 `A---B---C---F` 后，执行 `git rebase main` 就是把原来 `D`、`E` 的修改拿出来，在 `F` 后面重新做一遍，得到 `D'`、`E'`。在 GitHub、Codex、Claude、Cursor 等多人或多 Agent 协作场景中，常见的流程就是：

```shell
git fetch origin
git rebase origin/main
git push --force-with-lease origin <feature-branch>
```

### 修改上次提交

如果提交后oci没有通过，或者发现了一些代码中的小错误，可以修改代码后

既然你不想增加新的提交（Commit），最优雅的办法就是**“原地修正”**。

你只需要把格式修复好，然后用 `git commit --amend` 把这些修改“塞进”上一个提交里。

1. **重新暂存（Stage）这些文件**：

   告诉 Git，你已经把这几个文件修好了。

   ```bash
   git add ./src/***
   ```
   
2. **合入上一个提交（核心步骤）**：

   执行以下命令，它会把刚才 `add` 的内容合并到你最新的那个提交中，且**不改变提交信息**：

   ```bash
   git commit --amend --no-edit
   ```
   
   - `--amend`：表示修改上一次提交。
   - `--no-edit`：表示沿用之前的提交信息，不弹出编辑器。
   
3. **强制推送（如果是第一次推送失败后）**：

   如果你之前已经尝试 `push` 过（虽然报错了），或者你想覆盖远程那个“坏”的提交：

   ```bash
   git push --force-with-lease
   ```
   
   > **注意**：`--force-with-lease` 比普通的 `-f` 更安全，它会检查远程是否有别人提交的代码，防止不小心覆盖掉同事的工作。

如果提交后感觉commit信息写的不好，这里分两种情况，取决于你要改的是哪一次提交：

#### 最后一次提交

这是最常见的场景。

1. **执行修改命令**：

   ```bash
   git commit --amend -m "这是你新的提交信息"
   ```
   
   *如果你不带 `-m` 参数，Git 会打开编辑器让你修改。*

2. **强制推送到远程**（因为提交 ID 改变了）：

   ```bash
   git push --force-with-lease
   ```

#### 更早的提交

如果你想修改的不是最近的那次，而是往回数第 2 次或第 3 次，就需要用到 **交互式变基 (Interactive Rebase)**。

1. **进入交互模式**（假设要修改最近 3 次内的某一个）：

   ```bash
   git rebase -i HEAD~3
   ```
   
2. **在编辑器中操作**：

   - 你会看到类似这样的列表：

     ```
     pick a1b2c3d 功能开发 1
     pick e4f5g6h 功能开发 2
     pick i7j8k9l 功能开发 3
     ```
     
   - 将你想修改的那一行前面的 `pick` 改为 `reword`（或者简写为 `r`）。

   - 保存并退出编辑器。

3. **修改内容**：

   - Git 会自动弹出新的编辑器，让你输入新的提交信息。改好后保存退出。

4. **强制推送**：

   ```bash
   git push --force-with-lease
   ```

#### 注意事项

- **不要修改已合并的代码**：如果你的分支已经合并到了 `master` 或者有其他同事正在基于你的这个分支开发，**千万不要**修改已经 push 的 Commit 信息。这会破坏他们的提交历史。
- **文件真的没变吗？**：执行 `git commit --amend` 时，Git 会把你当前**暂存区 (Staging Area)** 里的所有变动都塞进去。如果你想“只改信息”，请确保执行命令前 `git status` 显示没有待提交的文件修改。

### 合并重复提交
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

**CI/CD** 是“持续集成”（Continuous Integration）和“持续交付/持续部署”（Continuous Delivery / Continuous Deployment）的缩写，是一种软件开发实践和方法，旨在提高开发效率、减少错误并加快软件交付的速度。

#### 1. 持续集成 (CI - Continuous Integration)

持续集成的核心思想是：开发人员经常将代码集成到共享的代码库中，而不是长时间地保持分支独立。在每次提交代码时，自动化的构建和测试流程会被触发，从而确保代码在合并之前是有效的，避免了由于合并冲突或错误积累的问题。

主要内容包括：

- **频繁提交：** 开发人员每天多次将代码提交到共享代码库。
- **自动化构建：** 每次代码提交后，自动触发构建过程，确保代码可以顺利编译。
- **自动化测试：** 执行单元测试、集成测试等，以检查代码是否存在问题。

#### 2. 持续交付 (CD - Continuous Delivery)

持续交付的目标是确保每次代码更改都能自动化地通过测试，并准备好可以部署到生产环境。持续交付确保软件在任何时候都处于可发布的状态，但并不直接将其部署到生产环境，而是确保可以随时部署。

主要内容包括：

- **自动化部署：** 代码完成测试后，自动部署到一个预生产环境（如 staging 环境）进行进一步验证。
- **版本管理：** 始终有一个可以发布到生产的版本，确保代码可以随时投入使用。

#### 3. 持续部署 (Continuous Deployment)

持续部署是持续交付的一个进一步发展，它意味着每次代码更改一旦通过测试，就会自动部署到生产环境，而无需人工干预。

主要内容包括：

- **自动化到生产：** 每次通过自动化测试的代码更改会被立即推送到生产环境，不需要人工操作。
- **快速发布：** 用户可以快速地体验到最新的功能或修复。

</details>

### VS Code 集成

#### 抓取（Fetch）

- **作用**：从远程仓库获取最新的版本信息（分支名、新的提交记录），但**不会**更改你本地正在写的代码。
- **使用场景**：你想知道同事有没有交新作业，但你现在正忙着写自己的代码，不想让别人的东西立刻混进来。
- **结果**：本地会知道“远程有更新了”，你会看到 VS Code 左下角出现同步的小图标，提示你有几个待拉取的提交。

#### 拉取（Pull）

- **作用**：等同于 **抓取 (Fetch) + 合并 (Merge)**。它会把远程仓库的代码下载下来，并直接合并到你当前正在工作的本地分支中。
- **使用场景**：开始写代码前的第一件事。确保你是在最新版本的代码基础上开发的。
- **风险**：如果别人改了和你同一行代码，执行拉取时会触发**冲突 (Conflict)**，需要你手动去 VS Code 里选“保留谁的代码”。

#### 提交（Commit）

**提交** 是在你的**本地仓库**里为代码拍一张“快照”。

- **打包行为**：当你点“提交”时，Git 会把你在暂存区（Staged Changes）里的所有改动打包，给它一个独一无二的编号（Hash 值），并记录下是谁在什么时候改了什么。
- **存档性质**：提交仅仅发生在你的**本地电脑**上。就算你断了网，也可以疯狂提交。
- **撤销后悔药**：一旦提交了，你的代码就被安全地存入了 Git 的历史记录中。哪怕你后面把文件删了，也可以通过这个提交记录找回来。

##### Git Amend

**对应命令：** `git commit --amend`

- **作用：** 将当前的更改“合并”到**上一次**提交中，而不是创建一个新的提交。它会直接修改上一个提交的记录。
- **使用场景：**
  - **手残补救：** 你刚点完提交，突然发现代码里有个错别字，或者少保存了一个文件。
  - **合并零碎：** 你不想在记录里留下五个“修复 Bug”的提交，想把它们合成一个。
- **注意：** **千万不要在已经“推送（Push）”到远程仓库的提交上使用它！** 这会重写历史，导致你的同事无法同步代码。

##### Signed-off-by

**对应命令：** `git commit -s`

- **作用：** 在提交信息的末尾自动加上一行 `Signed-off-by: 你的名字 <你的邮箱>`。
- **使用场景：**
  - **开源贡献：** 很多大型开源项目（如 Linux 内核、Sigma 官方库）要求必须有这个签名，以证明你拥有该代码的版权并同意其开源协议。
  - **企业合规：** 某些公司为了追踪责任，要求每一行代码都有开发者的显式确认。
- **意义：** 这不是加密签名（那叫 GPG 签名），而是一份**数字声明**。

##### 让 Agent 成为共同贡献者

如果一次提交由开发者和 AI Agent 共同完成，可以在 Commit Message 末尾加入 `Co-authored-by` trailer，记录 Agent 参与了该提交。它不会改变提交的 Author 或 Committer，只是在提交元数据中补充共同贡献者。

常见 Agent 的写法如下：

| Agent | Commit trailer |
| --- | --- |
| Codex | `Co-authored-by: Codex <codex@openai.com>` |
| Claude | `Co-authored-by: Claude <noreply@anthropic.com>` |
| Cursor | `Co-authored-by: Cursor <cursoragent@cursor.com>` |

trailer 应放在提交信息的最后，并与前面的正文之间保留一个空行。例如，提交由 Codex 协助完成：

```text
补充 Git 使用笔记

Co-authored-by: Codex <codex@openai.com>
```

在命令行中，可以用两个 `-m` 参数保留正文与 trailer 之间的空行：

```bash
git commit -m "补充 Git 使用笔记" \
  -m "Co-authored-by: Codex <codex@openai.com>"
```

由 Claude 或 Cursor 协助时，替换最后一行即可：

```bash
git commit -m "补充 Git 使用笔记" \
  -m "Co-authored-by: Claude <noreply@anthropic.com>"

git commit -m "补充 Git 使用笔记" \
  -m "Co-authored-by: Cursor <cursoragent@cursor.com>"
```

如果多个 Agent 共同参与，可以连续加入多行 trailer：

```text
补充 Git 使用笔记

Co-authored-by: Codex <codex@openai.com>
Co-authored-by: Claude <noreply@anthropic.com>
Co-authored-by: Cursor <cursoragent@cursor.com>
```

提交后可使用以下命令检查完整的 Commit Message：

```bash
git show -s --format=full HEAD
```

如果提交尚未推送，可以通过 `--amend` 为最近一次提交补充共同贡献者：

```bash
git commit --amend
```

在编辑器中保留原提交信息，空一行，再把 `Co-authored-by` 放在最后。`--amend` 会生成新的 Commit ID；如果原提交已经推送，还需要重写远程历史，因此应先确认不会影响其他协作者。

:::note
`Co-authored-by` 是 Git 提交信息中的约定格式。GitHub 是否将其显示为可点击的账号和贡献者，还取决于该邮箱是否被对应平台账号验证或被平台识别；即使没有关联账号，trailer 仍会保留在 Git 历史中。
:::

#### 推送（Push）

- **作用**：把你本地已经 **Commit（提交）** 的记录上传到远程仓库。
- **使用场景**：你写完了一个功能，并已经在本地提交了，现在要分享给团队或者备份到云端。
- **注意**：如果远程仓库有你没拉取的代码，Git 会拒绝你的推送，要求你先“拉取”再“推送”。

#### 签出（Checkout）

- **作用**：在不同的**分支**之间跳转，或者回滚到某个特定的历史版本。
- **使用场景**：
  - **切分支**：从 `main` 分支跳到 `feature-login` 分支去开发登录功能。
  - **新分支**：以当前代码为基础，创建一个全新的实验性分支。
- **结果**：VS Code 左侧的文件列表会瞬间发生变化，显示该分支下的代码样子。

### Cherry-pick
<details>
<summary>什么是 Git Cherry-pick</summary>

**Git Cherry-pick** 是一个强大的版本控制命令，它允许开发人员从一个分支中挑选特定的提交（Commit），并将这些更改应用到当前所在的分支。与合并整个分支（Merge）不同，Cherry-pick 提供了一种更精确的代码搬运方式。

#### 核心概念

Cherry-pick 的字面意思是“摘樱桃”。在 Git 中，这意味着你不是把整棵树（整个分支的历史）挪过来，而只是摘取其中一颗或几颗最好的“樱桃”（具体的代码提交）。

主要使用场景包括：

- **修复 Bug 的同步：** 在开发分支修复了一个紧急 Bug，需要立即将这个修复应用到生产分支，而不带走开发分支中尚未完成的其他功能。
- **功能迁移：** 某个分支中的一小部分功能代码是另一个分支急需的。
- **撤销后的恢复：** 如果之前的合并被意外回滚，可以用 cherry-pick 重新找回那些正确的提交。

#### 工作流程

当你执行 cherry-pick 时，Git 会提取该提交引入的更改，并在当前分支上创建一个全新的提交。这个新提交的内容与原提交相同，但会拥有一个新的哈希值（Hash）。

基本操作步骤：

- **获取 ID：** 首先找到你想要复制的提交 ID（可以通过 `git log` 查看）。
- **切换分支：** 切换到目标分支（例如 `production`）。
- **执行命令：** 使用 `git cherry-pick <commit-id>` 将更改应用过来。

#### 注意事项

虽然 Cherry-pick 非常灵活，但过度使用可能会导致一些维护上的挑战：

- **重复提交：** 同样的逻辑会出现在两个分支的不同提交中，这可能在未来的合并（Merge）时引发冲突。
- **依赖关系：** 如果你挑选的提交依赖于之前的其他提交（而你没有一起挑过来），可能会导致编译错误或运行时问题。
- **版本冲突：** 如果目标分支的代码与该提交修改的代码行存在差异，仍需要手动解决冲突。

</details>

通过 `cherry-pick` 将实验环境（Experimental）的功能搬运到正式环境（Production/Main）是一个非常经典且稳健的操作。它的精髓在于**“精准打击”**——只带走你需要的代码，留下实验分支里的杂乱测试或未完成逻辑。

以下是完整的操作指南：

#### 定位提交

首先，你需要去实验分支找到那个实现了新功能的提交。

1. 切换到实验分支：`git checkout experimental`
2. 查看提交历史：`git log --oneline`
3. **记录哈希值：** 找到对应的 Commit ID（例如 `a1b2c3d`）。

> **提示：** 如果功能是由多个提交组成的，记录下这一串 ID 的起始和结束。

#### 准备分支

为了保证正式环境的安全，建议先创建一个临时分支进行“试运行”。

1. 切换到正式环境：`git checkout main`（或者是你的 `production` 分支）。
2. 拉取最新代码：`git pull origin main`。
3. 创建并切换到搬运分支：`git checkout -b apply-new-feature`。

#### 执行 Cherry-pick

现在开始把代码“摘”过来。

- **搬运单个提交：**

  ```bash
  git cherry-pick a1b2c3d
  ```

- **连续搬运多个提交（从 A 到 B）：**

  ```bash
  git cherry-pick A^..B 
  ```

  *(注意：`^` 表示包含 A 本身)*

#### 处理冲突

如果正式环境和实验环境的代码在同一行有不同的修改，Git 会停下来要求你解决冲突。

1. **查看冲突文件：** `git status`。
2. **手动修改：** 打开冲突文件，选择保留正式环境逻辑、实验环境逻辑，还是两者合并。
3. **标记解决：** `git add <文件名>`。
4. **继续搬运：** `git cherry-pick --continue`。

> **意外处理：** 如果冲突太复杂你想反悔了，可以使用 `git cherry-pick --abort` 回到最初状态。

#### 验证与合并

1. **本地测试：** 在 `apply-new-feature` 分支上运行测试脚本，确保新功能在正式环境下不崩坏。
2. **推送到远程：** `git push origin apply-new-feature`。
3. **发起 PR/MR：** 在 GitHub/GitLab 上发起合并请求，让同事 Code Review 后合入 `main` 分支。
