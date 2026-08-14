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
import {
  createSnapshotStore,
  type ClientContext,
  type ISessions,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { InputTriggerServiceContract } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
// Type-only: the conversation SlotMap / standard-kit merges for the dock seat.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: the ctx.locale Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: brings the settings.section SlotMap declaration into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { AtFileSettings, AtFileSettingsUpdate, FileEntry, FileIgnoreRuleInput } from '../contract.ts'
import { AT_FILE_REMOTE } from './remote.ts'
import { createAtFileSource } from './source.ts'
import { FilesDock, type AtFileDockInjected } from './FilesDock.tsx'
import { AtFileSection, type AtFileSectionInjected } from './SettingsSection.tsx'
import { NS, en, zh } from './locales.ts'
import { adoptStyles } from './styles.ts'
import { FolderNavigator, type FolderNavigatorInjected } from './FolderNavigator.tsx'
import {
  defaultAtFileSettings,
  ignoreFilesSettingsKey,
  normalizeIgnoreFiles,
  normalizeWorkspaceIgnoreFiles,
  workspacePathKey,
} from '../defaults.ts'

/** Required services: picker pipeline, session projection, carrier, Remote face, slots, and locale. */
export const inject = ['inputTriggers', 'sessions', 'connection', 'remote', 'slots', 'locale']

/** The mounted atFile namespace service's callable face. */
interface AtFileNamespaceFace {
  search(sessionId: SessionId, signal?: AbortSignal): Promise<{ ok: true; value: readonly FileEntry[] } | { ok: false; error: { code: string; message: string; details: object } }>
  getSettings(): Promise<{ ok: true; value: AtFileSettings } | { ok: false; error: { code: string; message: string; details: object } }>
  updateSettings(update: AtFileSettingsUpdate): Promise<{ ok: true; value: AtFileSettings } | { ok: false; error: { code: string; message: string; details: object } }>
}

/**
 * Compose the @file surface.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  adoptStyles()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-at-file: dictionaries')

  const scope = createSnapshotStore({ value: defaultAtFileSettings() })
  let settingsGeneration = 0
  let settingsTail: Promise<void> = Promise.resolve()

  const reportSettingsError = (
    operation: 'read' | 'update',
    error: { code: string; message: string } | unknown,
  ): void => {
    if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
      const remoteError = error as { code: string; message: string }
      console.error(`[dsh-at-file] settings ${operation} failed: ${remoteError.code}: ${remoteError.message}`)
      return
    }
    console.error(`[dsh-at-file] settings ${operation} failed:`, error)
  }

  // The mounted namespace handle resolves through the service store
  // (`ctx.reflect.get`), not through `ctx.remote.atFile`: the generated-style
  // dotted read walks the cordis fiber chain, which stops at the Loader's
  // runtime-less internal forks between a plugin entry and the root fiber —
  // the namespace service mounted under the gateway entry is unreachable
  // that way (the store path resolves it by isolation label instead).
  let atFile: AtFileNamespaceFace | undefined
  const loadSettings = async (): Promise<void> => {
    const remote = atFile
    if (remote === undefined) return
    const generation = ++settingsGeneration
    try {
      const result = await remote.getSettings()
      if (atFile !== remote || generation !== settingsGeneration) return
      if (!result.ok) {
        reportSettingsError('read', result.error)
        return
      }
      scope.set({ value: result.value })
    } catch (error) {
      if (atFile === remote && generation === settingsGeneration) reportSettingsError('read', error)
    }
  }

  const updateSettings = (update: AtFileSettingsUpdate): Promise<void> => {
    const operation = settingsTail.then(async () => {
      const remote = atFile
      if (remote === undefined) {
        reportSettingsError('update', new Error('the atFile Remote is not mounted'))
        return
      }
      const generation = ++settingsGeneration
      try {
        const result = await remote.updateSettings(update)
        if (atFile !== remote || generation !== settingsGeneration) return
        if (!result.ok) {
          reportSettingsError('update', result.error)
          return
        }
        scope.set({ value: result.value })
      } catch (error) {
        if (atFile === remote && generation === settingsGeneration) reportSettingsError('update', error)
      }
    })
    settingsTail = operation.catch(
      /* v8 ignore next -- every Remote and publication failure is contained inside operation. */
      () => {},
    )
    return operation
  }

  ctx.effect(async () => {
    const dispose = await ctx.remote.$mount(AT_FILE_REMOTE)
    atFile = (ctx.reflect as unknown as { get(name: string): unknown }).get('remote.atFile') as AtFileNamespaceFace | undefined
    if (atFile === undefined) {
      throw new Error('dsh-at-file: the atFile Remote namespace did not mount')
    }
    await loadSettings()
    return () => {
      settingsGeneration += 1
      atFile = undefined
      void dispose()
    }
  }, 'dsh-at-file: remote')

  const connection = ctx.get('connection') as ConnectionHandle
  const inputTriggers = ctx.get('inputTriggers') as InputTriggerServiceContract
  const sessions = ctx.get('sessions') as unknown as ISessions
  const t = ctx.locale.bind(NS)

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
    void loadSettings()
  })
  // The settings switch gates the picker live. The schema default applies
  // until the first Host read, then every returned update replaces the snapshot.
  let sourceRegistered = false
  /* v8 ignore next -- replaced before use whenever a source is registered. */
  let sourceDispose = (): void => {}
  let ignoreFilesKey: string | undefined
  const syncSource = (): void => {
    const value = scope.getSnapshot().value
    const enabled = value.enabled
    const nextIgnoreFilesKey = ignoreFilesSettingsKey(value)
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
      /* v8 ignore next -- keeps teardown callable after the live registration is removed. */
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
      setEnabled: async (enabled: boolean) => { await updateSettings({ field: 'enabled', value: enabled }) },
      setIgnoreFiles: async (ignoreFiles: readonly FileIgnoreRuleInput[]) => {
        await updateSettings({ field: 'ignoreFiles', value: [...ignoreFiles] })
      },
      setWorkspaceIgnoreFiles: async (workspace: string, ignoreFiles: readonly FileIgnoreRuleInput[]) => {
        const current = normalizeWorkspaceIgnoreFiles(scope.getSnapshot().value.workspaceIgnoreFiles)
        const target = workspacePathKey(workspace)
        const next = current.filter(entry => workspacePathKey(entry.workspace) !== target)
        const normalized = normalizeIgnoreFiles(ignoreFiles)
        if (normalized.length > 0) next.push({ workspace, ignoreFiles: normalized })
        await updateSettings({ field: 'workspaceIgnoreFiles', value: next })
      },
    }),
  }, AtFileSection))
}
