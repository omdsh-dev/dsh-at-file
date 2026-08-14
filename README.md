# dsh-at-file

Codex-style `@file` mentions for the DeepSeek Harness web GUI. Type `@` in the composer, search the workspace files (and directories) as you type, press Enter to attach, and the referenced content ships to the model when the message is sent.

![@file mention in action](assets/screenshots/show-case.png)

```
composer:  fix the README  @README.  ← floating picker over the token
            ┌────────────────────────────┐
            │ 📄 README.md               │
            │ 📁 docs/                   │
            └────────────────────────────┘
draft:     fix the README @README.md     ← a readable plain-text token
dock:      📄 README.md  ×               ← clickable link above the input
model:     <file path="README.md">…content…</file>   ← injected at send time
```

The draft keeps the plain-text `@path` token (no chip, no overflow). At each agent's pre-step boundary, the Host expands a file mention into text and a directory mention into a bounded metadata manifest by default. The model can inspect only the relevant files with its normal workspace tools instead of receiving an entire subtree eagerly.

## Install

```sh
dsh plugin --profile web add https://github.com/omdsh-dev/dsh-at-file/archive/refs/heads/main.tar.gz
```

Restart the web server so the host half and the served client bundle pick up the plugin. The plugin needs the standard web bundle composition (the `ui-input-trigger` `@` pipeline, `api-gateway` client Remote, and the conversation slots) — the default `dsh web` profile has all of them.

The enable switch lives in **Settings → File mentions** (`at-file` settings namespace, exposed by a one-line harness allowlist entry).

## Configuration

Host-side tunables belong in the selected profile's patch, for example `~/.dsh/profiles/web/cordis.patch.yml`. A profile patch replaces the complete `config` object, so keep every field when changing one:

```yaml
- id: dsh-at-file
  config:
    maxIndexedFiles: 5000      # hard cap on indexed entries per workspace (walk stops, reports truncation)
    maxFileBytes: 262144       # hard cap on a direct text file or one bounded-mode file
    maxTotalBytes: 1048576     # hard cap on the complete serialized directory attachment
    directoryMode: manifest    # manifest (recommended) or bounded
    ignoreDirs: ['.git', 'node_modules']   # directory basenames the walk skips
```

`manifest` sends deterministic path/type/size metadata only. `bounded` includes readable UTF-8 file contents until `maxTotalBytes` is reached and reports every oversized, binary, unreadable, or aggregate-budget omission it can fit. Cancellation still aborts immediately.

`maxFileBytes` is configurable for text files, but increasing it does not add PDF support. Convert PDFs and other binary documents to `.txt` or `.md` first; the plugin now reports that fallback explicitly.

## Model experience

| Aspect | Effect |
| --- | --- |
| Token cost | A direct file adds its complete text up to `maxFileBytes`. A directory defaults to a compact manifest capped by `maxTotalBytes`. |
| Tool calls | Direct files need no read call. For directory manifests, the model searches and reads only the files it needs with its normal workspace tools. |
| Message format | A file uses `<file path="…">`; a manifest uses `<entry path="…" type="…" size="…" />`; bounded mode uses `<file>` plus structured `<omitted>` rows and count/byte attributes. |
| Limits | Direct oversized/PDF/binary mentions fail with actionable guidance. Bounded directories skip unsupported descendants individually and report truncation rather than aborting the whole turn. |

## Permission boundary

- The picker only offers entries under the session's workspace (`.git`/`node_modules` skipped by default). The Host resolves `@path` tokens against the session's cwd and never follows `..` out of the workspace. Content expansion happens Host-side at the `agent/pre-step` boundary, only for `source.kind === 'user'` messages.
- `host.openPath` (the click-to-open action) is the harness's own loopback-pinned endpoint.

## Development

```sh
pnpm install            # links the sibling dsh checkout for build and tests
pnpm run check          # typecheck + tests + build
pnpm run test           # vitest (host fs/mention/runtime, client source/dock/section/apply)
pnpm run build          # esbuild host/client/invariant bundles + tsc declarations
```

The repo expects the harness checkout at `../dsh` for the dev-time `link:` resolutions and the test aliases.

## Known limitations

- The workspace index is cached per session for 30 seconds; files created later appear on the next menu open after that window.
- `@path` tokens may not contain whitespace or `@` (the token grammar is `@[^\s@]+`); a filename with spaces cannot be mentioned by typing.
- The picker group title renders the source name (`at-file`) because the slash menu's title dictionary is owned by the harness.

## License

MIT
