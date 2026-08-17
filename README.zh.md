# dsh-at-file

DeepSeek Harness Web 界面的工作区路径引用插件。在输入框输入 `@`，可以搜索当前工作区并插入文件或目录路径。

![@ 路径选择器](assets/screenshots/workspace-path-picker.png)

![输入框中的文件引用](assets/screenshots/file-mention-composer.png)

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

默认情况下，粘贴的文字会保持普通文本。用户从其他应用复制的 `@路径` 不会打开选择器、出现在引用栏中，也不会生成工作区引用标记。在 **设置 -> 文件提及** 中关闭 **忽略粘贴文本中的 @**，即可恢复旧行为。

文件格式和文件大小不会改变处理流程。PDF 与其他工作区文件使用相同的路径引用机制。

以上机制适用于 `0.3.0` 及后续版本。早期版本会在提交时读取文件内容，并受文件大小限制。

## 路径选择器

普通关键词只匹配文件名。完整名称、前缀和紧凑匹配会排在前面，长目录路径中分散的字符不会产生无关结果。

关键词中包含 `/` 时，选择器会依次匹配路径片段。例如，`src/view` 可以找到 `src/client/view.ts`。输入 `src/` 也可以搜索该路径下的条目。

高亮目录候选后，按右方向键可以进入该目录。输入内容会推进到 `@路径/`，末尾不添加空格，候选菜单会继续显示。按回车或使用鼠标选择目录时，仍会完成该目录引用。

候选项优先显示文件名，下方显示父目录。遇到重名文件时，父目录也会写入主标题。内置 SVG 图标可区分目录、源代码、文本、PDF、图片、数据与配置、压缩包以及其他文件。

默认索引会跳过常见的版本控制目录、IDE 元数据、依赖目录、缓存和构建产物。目前涵盖 VS Code、Visual Studio、JetBrains IDE、Fleet、Eclipse、Android 与 Gradle、Xcode、CMake、Flutter、.NET、Unity、Unreal，以及常见的 JavaScript 和 Python 输出目录。`desktop.ini`、`Thumbs.db` 和 `.DS_Store` 这类系统元数据文件也会默认排除。

## 安装或更新

```sh
dsh plugin --profile web add https://github.com/omdsh-dev/dsh-at-file/archive/refs/tags/v0.6.3.tar.gz
```

已有安装也使用这条命令更新。安装完成后重启 `dsh web`，确保 Host 和浏览器客户端加载 `0.6.3`。

## 文件过滤

在 **设置 -> 文件提及** 中管理文件名过滤规则。

![包含 Exact 和 Regex 规则的文件提及设置](assets/screenshots/file-mention-settings.png)

- **全局** 保存所有工作区共用的规则。
- **工作区** 保存当前所选工作区路径的附加规则。每个工作区都有独立列表，面板中会同时显示该工作区继承的全局规则。

每条规则可以单独选择匹配方式和大小写设置：

- **Exact** 匹配一个完整文件名，不接受路径分隔符。
- **Regex** 使用 JavaScript 正则表达式匹配完整文件名。匹配内容不包含父目录或工作区路径。
- **区分大小写** 可以用于任何 Exact 或 Regex 规则，默认关闭。

规则可以逐项添加和删除。无效正则会在保存前显示错误，Host 也会拒绝无效规则。**恢复默认值** 会重置全局列表，**清空工作区规则** 只会移除当前工作区的附加项。

设置通过插件自己的 Host 接口保存到 DSH web profile。已有的字符串规则会继续作为不区分大小写的 Exact 规则使用，包括全局列表和工作区列表。修改规则时会清除相关索引缓存，下一次输入 `@` 即可使用新规则。

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
- Host 遍历工作区时会合并全局和当前工作区的文件名规则。被过滤的条目不会占用 `maxIndexedFiles`，也不会发送到浏览器。
- Host 接受工作区相对路径。绝对路径以及越出工作区的路径会被忽略。
- 手动输入的文本和选择器中的选择可以生成引用消息。默认设置开启时，粘贴文本中的 `@` 会被忽略。
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

开发环境默认官方 `deepseek-ai/deepseek-harness` 仓库位于 `../deepseek-harness`，与该仓库的默认克隆目录一致。`lib/` 中的构建产物会提交到仓库，因此 profile 安装过程无需运行包构建脚本。

## License

MIT
