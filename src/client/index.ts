/**
 * dsh-at-file client plugin: the browser half of the Codex-style @file
 * mention. Mounts the atFile Remote namespace, registers the '@' trigger
 * source (floating picker landing a plain-text @path token), the
 * referenced-path dock above the composer (open/remove, gated by settings),
 * the settings section, and locale dictionaries. The Host only validates and
 * marks the chosen path; neither half reads mentioned file content.
 */
// Type-only: the ctx.remote merge and the forwarded Host-event face.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ConnectionHandle, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type { InputTriggerServiceContract } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
// Type-only: the conversation SlotMap / standard-kit merges for the dock seat.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: the ctx.locale Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.settingsScope Context merge and the scope contract.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { AtFileSettings, FileEntry } from '../contract.ts'
import { AT_FILE_REMOTE } from './remote.ts'
import { createAtFileSource } from './source.ts'
import { FilesDock, type AtFileDockInjected } from './FilesDock.tsx'
import { AtFileSection, type AtFileSectionInjected } from './SettingsSection.tsx'
import { NS, en, zh } from './locales.ts'
import { adoptStyles } from './styles.ts'
import { FolderNavigator, type FolderNavigatorInjected } from './FolderNavigator.tsx'
import {
  DEFAULT_IGNORE_FILES,
  ignoreFilesSettingsKey,
  normalizeIgnoreFiles,
  normalizeWorkspaceIgnoreFiles,
  workspacePathKey,
} from '../defaults.ts'

/** Required services: picker pipeline, session projection, carrier, Remote face, slots, locale, settings scope. */
export const inject = ['inputTriggers', 'sessions', 'connection', 'remote', 'slots', 'locale', 'settingsScope']

/** The mounted atFile namespace service's callable face. */
interface AtFileNamespaceFace {
  search(sessionId: SessionId, signal?: AbortSignal): Promise<{ ok: true; value: readonly FileEntry[] } | { ok: false; error: { code: string; message: string; details: object } }>
}

/**
 * Compose the @file surface.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  adoptStyles()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-at-file: dictionaries')

  // The mounted namespace handle resolves through the service store
  // (`ctx.reflect.get`), not through `ctx.remote.atFile`: the generated-style
  // dotted read walks the cordis fiber chain, which stops at the Loader's
  // runtime-less internal forks between a plugin entry and the root fiber —
  // the namespace service mounted under the gateway entry is unreachable
  // that way (the store path resolves it by isolation label instead).
  let atFile: AtFileNamespaceFace | undefined
  ctx.effect(async () => {
    const dispose = await ctx.remote.$mount(AT_FILE_REMOTE)
    atFile = (ctx.reflect as unknown as { get(name: string): unknown }).get('remote.atFile') as AtFileNamespaceFace | undefined
    if (atFile === undefined) {
      throw new Error('dsh-at-file: the atFile Remote namespace did not mount')
    }
    return () => {
      atFile = undefined
      void dispose()
    }
  }, 'dsh-at-file: remote')

  const connection = ctx.get('connection') as ConnectionHandle
  const inputTriggers = ctx.get('inputTriggers') as InputTriggerServiceContract
  const sessions = ctx.get('sessions') as unknown as ISessions
  const t = ctx.locale.bind(NS)
  const scope = ctx.settingsScope.bind<AtFileSettings>({ namespace: 'at-file' })

  // Relative → entry map backing the dock's open action (resolves a draft
  // token to its absolute path from the last settled index).
  const entryByRel = new Map<string, FileEntry>()
  const search = async (sessionId: SessionId, signal: AbortSignal): Promise<readonly FileEntry[]> => {
    if (atFile === undefined) throw new Error('dsh-at-file: the atFile Remote is not mounted')
    const result = await atFile.search(sessionId, signal)
    if (!result.ok) throw new Error(`search failed: ${result.error.code}: ${result.error.message}`)
    for (const entry of result.value) entryByRel.set(entry.relative, entry)
    return result.value
  }

  const { source, invalidateAll } = createAtFileSource({ search })
  // Reconnect may have rebuilt the host: cached indexes and path maps die with it.
  ctx.on('connection/reset', () => {
    invalidateAll()
    entryByRel.clear()
  })
  // The settings switch gates the picker live: the source registers while the
  // namespace value is enabled (undefined before the first settings read —
  // the schema default is enabled) and unregisters the moment it flips off.
  let sourceRegistered = false
  let sourceDispose = (): void => {}
  let ignoreFilesKey: string | undefined
  const syncSource = (): void => {
    const value = scope.getSnapshot().value
    const enabled = value?.enabled ?? true
    const nextIgnoreFilesKey = ignoreFilesSettingsKey(value ?? {
      enabled: true,
      ignoreFiles: [...DEFAULT_IGNORE_FILES],
      workspaceIgnoreFiles: [],
    })
    if (ignoreFilesKey !== undefined && ignoreFilesKey !== nextIgnoreFilesKey) {
      invalidateAll()
      entryByRel.clear()
    }
    ignoreFilesKey = nextIgnoreFilesKey
    if (enabled && !sourceRegistered) {
      sourceDispose = inputTriggers.registerSource(source)
      sourceRegistered = true
    } else if (!enabled && sourceRegistered) {
      sourceDispose()
      sourceDispose = () => {}
      sourceRegistered = false
    }
  }
  ctx.effect(() => {
    syncSource()
    const off = scope.subscribe(syncSource)
    return () => {
      off()
      sourceDispose()
    }
  }, 'dsh-at-file: source (settings-gated)')

  // The wire face of host.openPath (typed structurally: the connection
  // handle's IApiClient type lives behind the apiproxy package this plugin
  // does not import).
  interface OpenPathResponse {
    result: { ok: true } | { ok: false; error: { message: string } }
  }

  const openPath = (path: string): void => {
    void connection.api.host.openPath({ path }).then((response: OpenPathResponse) => {
      if (!response.result.ok) console.error('[dsh-at-file] open failed:', response.result.error.message)
    }, (error: unknown) => {
      console.error('[dsh-at-file] open failed:', error)
    })
  }

  const openRelative = (relative: string): void => {
    const entry = entryByRel.get(relative)
    if (entry === undefined) {
      console.error('[dsh-at-file] open failed: no index entry for', relative)
      return
    }
    openPath(entry.path)
  }

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'at-file',
    order: 20,
    locale: NS,
    inject: (): AtFileDockInjected => ({
      onOpen: openRelative,
      hooks: { scope },
    }),
  }, FilesDock))

  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: 'at-file-folder-navigation',
    order: 1,
    inject: (sessionId): FolderNavigatorInjected => {
      const actx = sessions.scope(sessionId)
      if (actx === undefined) throw new Error(`dsh-at-file: session "${String(sessionId)}" has no client scope`)
      return { controller: inputTriggers.sessionOf(actx) }
    },
  }, FolderNavigator))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'at-file',
    order: 55,
    label: () => t('nav'),
    locale: NS,
    inject: (): AtFileSectionInjected => ({
      hooks: { scope },
      setEnabled: async (enabled: boolean) => { await scope.set('enabled', enabled) },
      setIgnoreFiles: async (ignoreFiles: readonly string[]) => { await scope.set('ignoreFiles', [...ignoreFiles]) },
      setWorkspaceIgnoreFiles: async (workspace: string, ignoreFiles: readonly string[]) => {
        const current = normalizeWorkspaceIgnoreFiles(scope.getSnapshot().value?.workspaceIgnoreFiles ?? [])
        const target = workspacePathKey(workspace)
        const next = current.filter(entry => workspacePathKey(entry.workspace) !== target)
        const normalized = normalizeIgnoreFiles(ignoreFiles)
        if (normalized.length > 0) next.push({ workspace, ignoreFiles: normalized })
        await scope.set('workspaceIgnoreFiles', next)
      },
    }),
  }, AtFileSection))
}
