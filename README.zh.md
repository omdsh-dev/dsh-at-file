# dsh-at-file

DeepSeek Harness Web 界面的工作区路径引用插件。在输入框输入 `@`，可以搜索当前工作区并插入文件或目录路径。

![@ 路径选择器](assets/screenshots/show-case.png)

## 使用方式

从 `@` 菜单选择结果后，路径会保留在输入内容中。输入框上方的引用栏可以打开路径或移除引用。

```text
请检查 @docs/spec.pdf
```

每次 agent 开始处理前，插件会确认该路径位于当前工作区且仍然存在。确认成功后，插件会补充一条简短的引用消息：

```xml
<workspace-reference path="docs/spec.pdf" kind="file" />
```

引用消息仅包含工作区相对路径和路径类型。插件不会打开引用文件，也不会列出引用目录中的内容。任务需要读取时，由 agent 使用当前会话中可用的工具处理该路径。

文件格式和文件大小不会改变处理流程。PDF 与其他工作区文件使用相同的路径引用机制。

以上机制适用于 `0.3.0` 及后续版本。早期版本会在提交时读取文件内容，并受文件大小限制。

## 路径选择器

普通关键词只匹配文件名。完整名称、前缀和紧凑匹配会排在前面，长目录路径中分散的字符不会产生无关结果。

关键词中包含 `/` 时，选择器会依次匹配路径片段。例如，`src/view` 可以找到 `src/client/view.ts`。输入 `src/` 也可以搜索该路径下的条目。

候选项优先显示文件名，下方显示父目录。遇到重名文件时，父目录也会写入主标题。内置 SVG 图标可区分目录、源代码、文本、PDF、图片、数据与配置、压缩包以及其他文件。

默认索引会跳过常见的版本控制目录、IDE 元数据、依赖目录、缓存和构建产物。目前涵盖 VS Code、Visual Studio、JetBrains IDE、Fleet、Eclipse、Android 与 Gradle、Xcode、CMake、Flutter、.NET、Unity、Unreal，以及常见的 JavaScript 和 Python 输出目录。

## 安装或更新

```sh
dsh plugin --profile web add https://github.com/omdsh-dev/dsh-at-file/archive/refs/tags/v0.3.1.tar.gz
```

已有安装也使用这条命令更新。安装完成后重启 `dsh web`，确保 Host 和浏览器客户端加载 `0.3.1`。

插件开关位于 **设置 -> 文件提及**。

## 配置

当前配置只影响路径选择器的索引：

- `maxIndexedFiles` 设置工作区索引条目的数量上限。
- `ignoreDirs` 替换内置的忽略目录列表。设置为 `[]` 时会索引所有目录。

请把完整配置写入所选 profile 的 `cordis.patch.yml`。常用路径为 `~/.dsh/profiles/web/cordis.patch.yml`。

```yaml
- id: dsh-at-file
  config:
    maxIndexedFiles: 10000
```

省略 `ignoreDirs` 会继续使用内置列表。填写该字段时，请列出所有需要排除的目录名。

## 路径处理

- 选择器索引当前工作区中的常规文件和目录，并跳过已配置的目录名与符号链接。
- Host 接受工作区相对路径。绝对路径以及越出工作区的路径会被忽略。
- 只有用户输入的文本可以生成引用消息。
- 点击引用路径时会调用 Harness 的 `host.openPath` 端点。
- 每个会话的路径索引缓存 30 秒。
- `@路径` 不能包含空白字符或另一个 `@` 字符。
- `maxIndexedFiles` 限制选择器显示的结果。手动输入的路径只要位于工作区且确实存在，仍然可以引用。

当前 agent 可能没有处理某种文件格式的工具。DSH 的 `read` 用于 UTF-8 文本，`read_image` 用于支持的图片格式。PDF 的处理能力取决于当前会话提供的工具。

## 开发

```sh
pnpm install
pnpm run check
pnpm run test
pnpm run build
```

开发环境默认 Harness 仓库位于 `../dsh`。`lib/` 中的构建产物会提交到仓库，因此 profile 安装过程无需运行包构建脚本。

## License

MIT
