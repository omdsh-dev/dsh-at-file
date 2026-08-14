# dsh-at-file

Workspace path references for the DeepSeek Harness web interface. Type `@` in the composer to search the current workspace and insert a file or directory path.

![@ path picker](assets/screenshots/show-case.png)

## Usage

Choose a result from the `@` menu. The selected path remains visible in the draft and can be opened or removed from the reference bar.

```text
Review @docs/spec.pdf
```

Before the agent starts a step, the plugin confirms that the path exists inside the active workspace. It then adds a short reference message:

```xml
<workspace-reference path="docs/spec.pdf" kind="file" />
```

The reference contains the workspace-relative path and its kind. The plugin does not open the referenced file or list the contents of a referenced directory. The agent can inspect the path with the tools available in the current session when the task requires it.

File format and file size do not change this behavior. A PDF follows the same path-reference flow as any other workspace file.

This mechanism applies to version `0.3.0` and later. Earlier releases read file content during submission and enforced file-size limits.

## Install or Update

```sh
dsh plugin --profile web add https://github.com/omdsh-dev/dsh-at-file/archive/refs/tags/v0.3.0.tar.gz
```

Use the same command to update an existing installation. Restart `dsh web` after installation so the Host and browser client load version `0.3.0`.

The plugin can be enabled or disabled under **Settings -> File mentions**.

## Configuration

The available options apply to the path picker index:

- `maxIndexedFiles` sets the maximum number of indexed workspace entries.
- `ignoreDirs` lists directory names excluded from the picker.

Add the complete configuration to the selected profile's `cordis.patch.yml`. The usual path is `~/.dsh/profiles/web/cordis.patch.yml`.

```yaml
- id: dsh-at-file
  config:
    maxIndexedFiles: 5000
    ignoreDirs: ['.git', 'node_modules']
```

A profile patch replaces the complete `config` object. Keep both fields when changing either value.

## Path Handling

- The picker indexes regular files and directories in the active workspace. Configured directory names and symbolic links are skipped.
- The Host accepts workspace-relative paths. Absolute paths and paths that escape the workspace are ignored.
- Reference markers are created only from user-authored text.
- Clicking a referenced path uses the Harness `host.openPath` endpoint.
- The picker index is cached per session for 30 seconds.
- An `@path` token cannot contain whitespace or another `@` character.
- `maxIndexedFiles` limits picker results. A manually entered path can still be referenced when it exists inside the workspace.

The active agent may lack a tool for a particular file format. DSH provides `read` for UTF-8 text and `read_image` for supported images. PDF support depends on the tools available in the session.

## Development

```sh
pnpm install
pnpm run check
pnpm run test
pnpm run build
```

The development setup expects the Harness checkout at `../dsh`. Built files under `lib/` are committed so profile installation does not require package build scripts.

## License

MIT
