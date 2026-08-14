# dsh-at-file

Codex-style workspace path references for the DeepSeek Harness web GUI. Type `@` in the composer, search files and directories, and insert a readable `@path` into the prompt.

![@file mention in action](assets/screenshots/show-case.png)

```
composer:  inspect this  @README.     <- floating workspace path picker
            +----------------------------+
            | README.md                  |
            | docs/                      |
            +----------------------------+
draft:     inspect this @README.md    <- plain-text path reference
dock:      README.md  x               <- open/remove controls
model:     <workspace-reference path="README.md" kind="file" />
```

`@` expresses that the user intentionally referenced an existing workspace path. It does not mean "copy this file into the prompt." At the agent pre-step boundary, the Host validates the path and adds only its relative path and kind. It never reads file bytes or walks a referenced directory.

The agent decides whether and how to inspect the path using the tools available in that session. Text, images, PDFs, archives, large files, and directories all have the same reference semantics; support for interpreting a format belongs to the agent's tools, not this plugin.

## Install

```sh
dsh plugin --profile web add https://github.com/omdsh-dev/dsh-at-file/archive/refs/tags/v0.3.0.tar.gz
```

Restart the web server so the Host and client bundle load the new version. The plugin expects the standard `dsh web` composition, including the `@` input-trigger pipeline, API gateway, conversation slots, settings, and agent registry.

The enable switch lives in **Settings -> File mentions**.

## Configuration

These options control only the user-facing workspace search index. They do not limit referenced file size because the plugin never reads file content.

To override them, add the complete config to the selected profile's `cordis.patch.yml`, for example `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- id: dsh-at-file
  config:
    maxIndexedFiles: 5000
    ignoreDirs: ['.git', 'node_modules']
```

A profile patch replaces the complete `config` object, so keep both fields when changing either one.

## Model Experience

| Aspect | Effect |
| --- | --- |
| Meaning | One marker says that the user referenced an existing workspace path. |
| Token cost | Constant and small per reference; no file content or directory manifest is injected. |
| Tool calls | The agent chooses whether to search, read, render, or otherwise inspect the path. |
| Message format | `<workspace-reference path="<workspace-relative-path>" kind="file|directory" />` in a user-role message with source `at-file-mention`. |
| File types | Format-agnostic. A reference can point to text, binary, PDF, image, archive, or any other regular file. |

## Permission Boundary

- The picker indexes the session workspace and skips configured directory basenames plus symlinks.
- The Host resolves only relative tokens and rejects absolute paths and lexical `..` escapes.
- Only `source.kind === 'user'` text can create a model-visible reference.
- Clicking a path uses the Harness `host.openPath` endpoint.

## Development

```sh
pnpm install
pnpm run check          # typecheck + tests + build
pnpm run test
pnpm run build
```

The repo expects the Harness checkout at `../dsh` for development links and test aliases. Built `lib/` artifacts are committed so profile installs do not need lifecycle build scripts.

## Known Limitations

- Referencing a path does not guarantee that the active agent has a tool capable of interpreting its format. DSH's standard `read` tool handles UTF-8 text and `read_image` handles supported images; PDF handling is currently tool-dependent.
- The workspace picker index is cached per session for 30 seconds.
- `@path` tokens cannot contain whitespace or `@` (`@[^\s@]+`).
- `maxIndexedFiles` limits picker discovery only. A manually typed existing relative path can still be referenced.

## License

MIT
