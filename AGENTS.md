# AGENTS.md

Out-of-tree DeepSeek Harness plugin (host + Web client bundle). Read [dsh-plugin-create](../../dsh/.agents/skills/dsh-plugin-create/SKILL.md) for the recipe this repo follows; the harness checkout sits at `../dsh`.

## Layout

```
src/index.ts        host entry: function plugin (name/inject/Config/apply, no default export)
src/runtime.ts      AtFileRuntime (TypertRemoteService, @Remote search) — wire namespace `atFile`
src/mention.ts      Host pre-step path marker (scan @path, validate existence, inject path/kind only) + mentionPreStep
src/contract.ts     one shared descriptor set + zod codecs + FileEntry/settings types
src/typert.ts       strict host Typert manifest, registered via ctx.typert.register
src/settings.ts     the `at-file` settings namespace (enable switch)
src/files.ts        bounded workspace path index walk over node:fs
src/defaults.ts     built-in ignored directory names for IDE metadata, caches, dependencies, and build output
src/invariant.ts    ./invariant companion (real `No runtime invariant:` reason)
src/client/         browser half, served as the single file /plugins/dsh-at-file/client.js
  index.ts          apply: $mount the Remote contribution, register the @ source + dock + section + locale + styles
  remote.ts         hand-written TypertRemoteContribution + ctx.remote.atFile type merges
  source.ts         InputTriggerSource factory (per-session index cache, plain-text @path picks)
  search.ts         filename ranking, ordered path-segment queries, and dirs-first default browsing
  icons.tsx         built-in SVG icons selected from the indexed path type and extension
  FolderNavigator.tsx  ArrowRight directory traversal that keeps the @ candidate menu active
  FilesDock.tsx     input.dock rows parsed from the draft's @path tokens (open/remove)
  SettingsSection.tsx  one labeled native enable checkbox over the settings scope
tests/              node-env specs; jsdom pragma on the browser specs
```

## Contracts with the harness (do not drift)

- The only wire endpoint is `atFile/search` (agent lookup → workspace index). File content NEVER crosses the wire or the Host mention boundary: `agent/pre-step` validates each `@path` and injects only `<workspace-reference path="…" kind="file|directory" />` with source `at-file-mention`. The agent decides whether and how to inspect it with available tools.
- The Host Gateway resolves the endpoint through the **strict Typert manifest** (`src/typert.ts`, registered via `ctx.typert.register`) — never through `@Remote` marker tables, because the harness's source-launch dev environment loads the gateway from protocol `src` while a profile-loaded plugin bundle loads protocol `lib` (two marker tables). The `@Remote` decorator stays for documentation and lib-consistent deployments.
- The descriptor set lives in `src/contract.ts` and is shared verbatim by the host manifest and the client contribution; the agent lookup codec's `typeSymbol` must stay `@deepseek-ai/dsh-session/types#SessionId`.
- The client composes only through the standing seams (`ctx.remote.$mount`, `inputTriggers.registerSource`, `ctx.slots.register`, `ctx.locale.register`, `ctx.settingsScope.bind`). The mounted Remote namespace is resolved through `ctx.reflect.get('remote.atFile')` — NOT the dotted `ctx.remote.atFile` read, which walks the fiber chain and stops at the Loader's runtime-less forks (verified live; the store path resolves by isolation label).
- The `@path` token grammar is `@[^\s@]+` and must stay identical between the client's dock/lexicon, the source's plain-text pick, and the Host's `scanMentions` (they are the recognition contract, not one copy).
- The `at-file` settings namespace is exposed to the Web by a one-line entry in the harness `WEB_SETTINGS_NAMESPACES` allowlist (harness-side commit); the plugin registers it via `ctx.settings.register` and the client reads/writes it through `ctx.settingsScope.bind`.
- The web server serves exactly one file per client plugin: keep the client bundle single-file; styles are the injected `styles.ts` string (no CSS artifacts).

## Check ladder

`pnpm run check` (typecheck + tests + build) must be green before every commit; `lib/` is committed (file: profile installs run without a build). Coverage: statements/branches/lines 100% per source file (`src/types.ts` is type-only and excluded); defensive arms take a `/* v8 ignore -- reason */` comment.

## Copy

Product copy is Chinese (locale dictionary in `src/client/locales.ts`); code comments, JSDoc, and the English README are English.
