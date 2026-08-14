# dsh-at-file

DeepSeek Harness Web GUI 的 Codex 风格工作区路径引用插件。在输入框输入 `@`，搜索文件或目录，并把可读的 `@路径` 插入提示词。

![@ 文件提及效果演示](assets/screenshots/show-case.png)

```
输入框:   看一下这个  @README.       <- 浮动工作区路径选择器
            +----------------------------+
            | README.md                  |
            | docs/                      |
            +----------------------------+
草稿:     看一下这个 @README.md      <- 纯文本路径引用
引用条:   README.md  x               <- 打开/移除操作
模型:     <workspace-reference path="README.md" kind="file" />
```

`@` 表达的是“用户明确引用了工作区里的这个路径”，不是“把这个文件复制进提示词”。Host 在 agent pre-step 边界只验证路径仍然存在，并传递相对路径与类型；它不会读取文件字节，也不会遍历被引用目录的后代。

是否读取、如何读取，由 agent 根据当前会话可用的工具自行决定。文本、图片、PDF、压缩包、大文件和目录在本插件里具有完全相同的引用语义；具体格式能否解析属于 agent 工具的能力，不属于本插件。

## 安装

```sh
dsh plugin --profile web add https://github.com/omdsh-dev/dsh-at-file/archive/refs/tags/v0.3.0.tar.gz
```

随后重启 web 服务，让 Host 和 client bundle 加载新版本。插件依赖标准 `dsh web` 组合中的 `@` 输入触发管线、API gateway、会话插槽、设置与 agent registry。

启用开关位于 **设置 -> 文件提及**。

## 配置

以下参数只控制用户侧的工作区搜索索引。插件不会读取文件内容，因此没有文件大小或上下文注入预算配置。

如需覆盖默认值，把完整 config 写入所选 profile 的 `cordis.patch.yml`，例如 `~/.dsh/profiles/web/cordis.patch.yml`：

```yaml
- id: dsh-at-file
  config:
    maxIndexedFiles: 5000
    ignoreDirs: ['.git', 'node_modules']
```

profile patch 会整体替换 `config`，因此修改任一字段时都要保留这两个字段。

## 对模型的影响

| 方面 | 效果 |
| --- | --- |
| 含义 | 一个小标记表示用户引用了某个确实存在的工作区路径。 |
| Token 开销 | 每个引用固定且很小；不注入文件内容，也不注入目录清单。 |
| 工具调用 | agent 自行决定是否搜索、读取、渲染或以其他方式检查该路径。 |
| 消息格式 | `<workspace-reference path="<工作区相对路径>" kind="file|directory" />`，以来源 `at-file-mention` 的用户消息注入。 |
| 文件类型 | 与格式无关；文本、二进制、PDF、图片、压缩包等普通文件都可以被引用。 |

## 权限边界

- 选择器索引会话工作区，并跳过配置的目录名和符号链接。
- Host 只解析相对 token，拒绝绝对路径和词法上的 `..` 越界。
- 只有 `source.kind === 'user'` 的文本可以创建模型可见引用。
- 点击路径使用 Harness 的 `host.openPath` 端点。

## 开发

```sh
pnpm install
pnpm run check          # 类型检查 + 测试 + 构建
pnpm run test
pnpm run build
```

本仓库假设 Harness 位于 `../dsh`，用于开发期链接和测试别名。构建后的 `lib/` 会提交进仓库，因此 profile 安装不需要执行生命周期构建脚本。

## 已知限制

- 引用路径不保证当前 agent 拥有可解析该格式的工具。DSH 标准 `read` 工具读取 UTF-8 文本，`read_image` 读取支持的图片；PDF 能否读取取决于当前可用工具。
- 工作区选择器索引按会话缓存 30 秒。
- `@路径` token 不能包含空白或 `@`（语法为 `@[^\s@]+`）。
- `maxIndexedFiles` 只限制选择器发现范围；手动输入的、确实存在的相对路径仍可被引用。

## License

MIT
