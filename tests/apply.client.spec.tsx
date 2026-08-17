// @vitest-environment jsdom
/**
 * Client plugin wiring over stubbed services: mounting the atFile Remote
 * contribution, registering the '@' source with the trigger pipeline and the
 * settings gate, the dock entry with its inject face, the settings section,
 * the locale dictionaries, and the one-shot stylesheet injection.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { AT_FILE_REMOTE } from '../src/client/remote.ts'
import { NS, en, zh } from '../src/client/locales.ts'
import { SOURCE_NAME } from '../src/client/source.ts'
import { STYLE_ID } from '../src/client/styles.ts'
import { DEFAULT_IGNORE_FILES } from '../src/defaults.ts'
import type { AtFileSettings, AtFileSettingsUpdate, WorkspaceIgnoreFiles } from '../src/contract.ts'

type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string; details: object } }

interface BootOptions {
  atFileSearch?: (sessionId: SessionId, signal: AbortSignal) => Promise<RemoteResult<readonly { path: string; relative: string; kind: 'file' | 'dir' }[]>>
  atFileGetSettings?: () => Promise<RemoteResult<AtFileSettings>>
  atFileUpdateSettings?: (update: AtFileSettingsUpdate) => Promise<RemoteResult<AtFileSettings>>
  openPath?: () => Promise<{ result: { ok: true } | { ok: false; error: { message: string } } }>
  enabled?: boolean
  ignorePastedMentions?: boolean
  ignoreFiles?: readonly string[]
  workspaceIgnoreFiles?: readonly WorkspaceIgnoreFiles[]
  withoutNamespace?: boolean
  remoteMount?: () => Promise<() => void>
}

/** Boot the plugin body over a stub-service context and return the recorded surfaces. */
async function boot(options: BootOptions = {}) {
  const ctx = new Context()
  const sourceDispose = vi.fn()
  const registerSource = vi.fn(() => sourceDispose)
  const controller = { menu: { getSnapshot: vi.fn(), subscribe: vi.fn() }, track: vi.fn() }
  const sessionOf = vi.fn(() => controller)
  const sessionScope = {}
  const scopeSession = vi.fn(() => sessionScope)
  const mount = vi.fn(options.remoteMount ?? (async () => () => {}))
  const localeRegister = vi.fn(() => () => {})
  const bind = vi.fn(() => (key: string, params?: Record<string, string>) => (params?.message ? `${key}: ${params.message}` : key))
  const slotsRegister = vi.fn()
  const slotsInject = vi.fn((_name: string, factory: () => void) => { factory() })
  const openPath = vi.fn(options.openPath ?? (async () => ({ result: { ok: true as const } })))
  let settings: AtFileSettings = {
    enabled: options.enabled ?? true,
    ignoreFiles: [...options.ignoreFiles ?? DEFAULT_IGNORE_FILES],
    workspaceIgnoreFiles: (options.workspaceIgnoreFiles ?? []).map(entry => ({
      workspace: entry.workspace,
      ignoreFiles: [...entry.ignoreFiles],
    })),
    ignorePastedMentions: options.ignorePastedMentions ?? true,
  }
  const getSettings = vi.fn(options.atFileGetSettings ?? (async () => ({ ok: true as const, value: settings })))
  const updateSettings = vi.fn(options.atFileUpdateSettings ?? (async (update: AtFileSettingsUpdate) => {
    settings = { ...settings, [update.field]: update.value }
    return { ok: true as const, value: settings }
  }))
  ctx.provide('inputTriggers', { registerSource, sessionOf })
  ctx.provide('connection', { api: { host: { openPath } } })
  ctx.provide('remote', { $mount: mount })
  if (options.withoutNamespace !== true) {
    ctx.provide('remote.atFile', {
      search: options.atFileSearch ?? (async () => ({ ok: true as const, value: [] })),
      getSettings,
      updateSettings,
    })
  }
  ctx.provide('slots', { inject: slotsInject, register: slotsRegister })
  ctx.provide('locale', { register: localeRegister, bind })
  ctx.provide('sessions', { scope: scopeSession })
  apply(ctx as unknown as Parameters<typeof apply>[0])
  // The Remote mount effect is asynchronous; settle one tick.
  await Promise.resolve()
  await Promise.resolve()
  return {
    ctx, registerSource, sessionOf, sessionScope, scopeSession, mount, localeRegister, bind,
    slotsRegister, slotsInject, openPath, getSettings, updateSettings, sourceDispose,
    setRemoteSettings: (next: AtFileSettings) => { settings = next },
  }
}

/** One registered trigger source, narrowed to the members the assertions read. */
interface RegisteredSource {
  trigger: string
  name: string
  candidates: (session: { sessionId: SessionId }, req: { query: string; position: 'leading' | 'inline'; signal: AbortSignal }) => Promise<readonly { name: string }[]>
}

/** The source the wiring registered, if any. */
function registered(booted: Awaited<ReturnType<typeof boot>>): RegisteredSource {
  expect(booted.registerSource).toHaveBeenCalled()
  return booted.registerSource.mock.calls[0]![0] as RegisteredSource
}

interface RegisteredSettingsSection {
  id: string
  order: number
  label: () => string
  locale: string
  inject: () => {
    hooks: { scope: { getSnapshot: () => { value: AtFileSettings } } }
    setEnabled: (enabled: boolean) => Promise<void>
    setIgnorePastedMentions: (ignore: boolean) => Promise<void>
    setIgnoreFiles: (ignoreFiles: readonly string[]) => Promise<void>
    setWorkspaceIgnoreFiles: (workspace: string, ignoreFiles: readonly string[]) => Promise<void>
  }
}

function settingsSection(booted: Awaited<ReturnType<typeof boot>>): RegisteredSettingsSection {
  const section = booted.slotsRegister.mock.calls
    .find(call => call[0]?.name === 'settings.section')?.[0] as RegisteredSettingsSection | undefined
  expect(section).toBeDefined()
  return section as RegisteredSettingsSection
}

const s1 = { sessionId: 's1' as SessionId }
const signal = () => new AbortController().signal

describe('dsh-at-file client apply', () => {
  it('declares the picker and carrier services', () => {
    expect(inject).toEqual(['inputTriggers', 'sessions', 'connection', 'remote', 'slots', 'locale'])
  })

  it('mounts the atFile Remote contribution and registers the @ source', async () => {
    const { mount, registerSource } = await boot()
    expect(mount).toHaveBeenCalledWith(AT_FILE_REMOTE)
    expect(registerSource).toHaveBeenCalledTimes(1)
    const source = registerSource.mock.calls[0]![0] as RegisteredSource
    expect(source.trigger).toBe('@')
    expect(source.name).toBe(SOURCE_NAME)
  })

  it('routes candidate searches through the Remote namespace', async () => {
    const atFileSearch = vi.fn(async () => ({ ok: true as const, value: [{ path: '/ws/a.ts', relative: 'a.ts', kind: 'file' }] }))
    const booted = await boot({ atFileSearch })
    const rows = await registered(booted).candidates(s1, { query: 'a', position: 'inline', signal: signal() })
    expect(rows.map(row => row.name)).toEqual(['a.ts'])
    expect(atFileSearch).toHaveBeenCalledWith('s1', expect.any(AbortSignal))
  })

  it('turns a failed remote search into a rejection', async () => {
    const atFileSearch = vi.fn(async () => ({ ok: false as const, error: { code: 'search-down', message: 'boom', details: {} } }))
    const booted = await boot({ atFileSearch })
    await expect(registered(booted).candidates(s1, { query: 'a', position: 'inline', signal: signal() }))
      .rejects.toThrow(/search failed: search-down: boom/)
  })

  it('fails loud when the namespace service never mounted', async () => {
    const booted = await boot({ withoutNamespace: true })
    await expect(registered(booted).candidates(s1, { query: 'a', position: 'inline', signal: signal() }))
      .rejects.toThrow(/not mounted/)
  })

  it('does not register the source while the settings switch is off, then registers on flip', async () => {
    const booted = await boot({ enabled: false })
    expect(booted.registerSource).toHaveBeenCalledTimes(1)
    expect(booted.sourceDispose).toHaveBeenCalledTimes(1)
    await settingsSection(booted).inject().setEnabled(true)
    expect(booted.registerSource).toHaveBeenCalledTimes(2)
  })

  it('unregisters the source when the switch flips off after boot', async () => {
    const booted = await boot({ enabled: true })
    expect(booted.registerSource).toHaveBeenCalledTimes(1)
    await settingsSection(booted).inject().setEnabled(false)
    expect(booted.sourceDispose).toHaveBeenCalledTimes(1)
    // A flip-off disposes the source; a flip-on re-registers (new call).
    await settingsSection(booted).inject().setEnabled(true)
    expect(booted.registerSource).toHaveBeenCalledTimes(2)
  })

  it('defaults to enabled before the first settings read, then follows the value', async () => {
    let resolve: ((result: RemoteResult<AtFileSettings>) => void) | undefined
    const pending = new Promise<RemoteResult<AtFileSettings>>(done => { resolve = done })
    const booted = await boot({ atFileGetSettings: async () => pending })
    expect(booted.registerSource).toHaveBeenCalledTimes(1)
    resolve?.({
      ok: true,
      value: { enabled: false, ignoreFiles: [...DEFAULT_IGNORE_FILES], workspaceIgnoreFiles: [] },
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(booted.sourceDispose).toHaveBeenCalledTimes(1)
  })

  it('reloads settings after a connection reset', async () => {
    const booted = await boot()
    booted.setRemoteSettings({ enabled: false, ignoreFiles: ['reset.tmp'], workspaceIgnoreFiles: [] })
    booted.ctx.emit('connection/reset')
    await Promise.resolve()
    await Promise.resolve()
    expect(booted.getSettings).toHaveBeenCalledTimes(2)
    expect(settingsSection(booted).inject().hooks.scope.getSnapshot().value)
      .toMatchObject({ enabled: false, ignoreFiles: ['reset.tmp'] })
  })

  it('does not publish an older settings read after a reconnect', async () => {
    let resolveFirst: ((result: RemoteResult<AtFileSettings>) => void) | undefined
    const first = new Promise<RemoteResult<AtFileSettings>>(resolve => { resolveFirst = resolve })
    let calls = 0
    const booted = await boot({
      atFileGetSettings: async () => {
        calls += 1
        if (calls === 1) return first
        return {
          ok: true,
          value: { enabled: false, ignoreFiles: ['fresh.tmp'], workspaceIgnoreFiles: [] },
        }
      },
    })
    booted.ctx.emit('connection/reset')
    await Promise.resolve()
    await Promise.resolve()
    resolveFirst?.({
      ok: true,
      value: { enabled: true, ignoreFiles: ['stale.tmp'], workspaceIgnoreFiles: [] },
    })
    await Promise.resolve()
    expect(settingsSection(booted).inject().hooks.scope.getSnapshot().value)
      .toMatchObject({ enabled: false, ignoreFiles: ['fresh.tmp'] })
  })

  it('silences a stale settings read rejection after a reconnect', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let rejectFirst: ((error: Error) => void) | undefined
    const first = new Promise<RemoteResult<AtFileSettings>>((_resolve, reject) => { rejectFirst = reject })
    let calls = 0
    try {
      const booted = await boot({
        atFileGetSettings: async () => {
          calls += 1
          if (calls === 1) return first
          return {
            ok: true,
            value: { enabled: false, ignoreFiles: ['fresh.tmp'], workspaceIgnoreFiles: [] },
          }
        },
      })
      booted.ctx.emit('connection/reset')
      await Promise.resolve()
      await Promise.resolve()
      rejectFirst?.(new Error('stale read'))
      await Promise.resolve()
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('logs a structured settings read failure and keeps the last snapshot', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const booted = await boot({
        atFileGetSettings: async () => ({
          ok: false,
          error: { code: 'SETTINGS_DOWN', message: 'unavailable', details: {} },
        }),
      })
      expect(errorSpy).toHaveBeenCalledWith('[dsh-at-file] settings read failed: SETTINGS_DOWN: unavailable')
      expect(settingsSection(booted).inject().hooks.scope.getSnapshot().value.enabled).toBe(true)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('logs a rejecting settings read', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await boot({ atFileGetSettings: async () => { throw new Error('read transport down') } })
      expect(errorSpy).toHaveBeenCalledWith('[dsh-at-file] settings read failed:', expect.any(Error))
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('logs settings updates rejected by the Remote', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const booted = await boot({
        atFileUpdateSettings: async () => ({
          ok: false,
          error: { code: 'WRITE_REFUSED', message: 'read only', details: {} },
        }),
      })
      await settingsSection(booted).inject().setEnabled(false)
      expect(errorSpy).toHaveBeenCalledWith('[dsh-at-file] settings update failed: WRITE_REFUSED: read only')
      expect(settingsSection(booted).inject().hooks.scope.getSnapshot().value.enabled).toBe(true)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('logs a rejecting settings update', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const booted = await boot({
        atFileUpdateSettings: async () => { throw new Error('write transport down') },
      })
      await settingsSection(booted).inject().setEnabled(false)
      expect(errorSpy).toHaveBeenCalledWith('[dsh-at-file] settings update failed:', expect.any(Error))
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('does not publish an older settings update after a reconnect', async () => {
    let resolveUpdate: ((result: RemoteResult<AtFileSettings>) => void) | undefined
    const pending = new Promise<RemoteResult<AtFileSettings>>(resolve => { resolveUpdate = resolve })
    const booted = await boot({ atFileUpdateSettings: async () => pending })
    const write = settingsSection(booted).inject().setEnabled(false)
    await Promise.resolve()
    booted.ctx.emit('connection/reset')
    await Promise.resolve()
    await Promise.resolve()
    resolveUpdate?.({
      ok: true,
      value: { enabled: false, ignoreFiles: ['stale.tmp'], workspaceIgnoreFiles: [] },
    })
    await write
    expect(settingsSection(booted).inject().hooks.scope.getSnapshot().value)
      .toMatchObject({ enabled: true, ignoreFiles: DEFAULT_IGNORE_FILES })
  })

  it('silences a stale settings update rejection after a reconnect', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let rejectUpdate: ((error: Error) => void) | undefined
    const pending = new Promise<RemoteResult<AtFileSettings>>((_resolve, reject) => { rejectUpdate = reject })
    try {
      const booted = await boot({ atFileUpdateSettings: async () => pending })
      const write = settingsSection(booted).inject().setEnabled(false)
      await Promise.resolve()
      booted.ctx.emit('connection/reset')
      await Promise.resolve()
      await Promise.resolve()
      rejectUpdate?.(new Error('stale write'))
      await write
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('handles settings actions before the Remote mount settles', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let finishMount: (() => void) | undefined
    const waitForMount = new Promise<void>(resolve => { finishMount = resolve })
    try {
      const booted = await boot({
        remoteMount: async () => {
          await waitForMount
          return () => {}
        },
      })
      booted.ctx.emit('connection/reset')
      await settingsSection(booted).inject().setEnabled(false)
      expect(errorSpy).toHaveBeenCalledWith(
        '[dsh-at-file] settings update failed:',
        expect.objectContaining({ message: 'the atFile Remote is not mounted' }),
      )
    } finally {
      finishMount?.()
      errorSpy.mockRestore()
    }
  })

  it('registers the dock with its inject face routed to the host opener', async () => {
    const atFileSearch = vi.fn(async () => ({ ok: true as const, value: [{ path: '/ws/a.ts', relative: 'a.ts', kind: 'file' }] }))
    const booted = await boot({ atFileSearch })
    const dock = booted.slotsRegister.mock.calls.find(call => call[0]?.name === 'conversation.input.dock')?.[0] as {
      id: string
      order: number
      locale: string
      inject: (sessionId: string) => { onOpen: (relative: string) => void }
    }
    expect(dock).toMatchObject({ id: 'at-file', order: 20, locale: NS })
    // The open resolves the relative token through the index the search wrapper
    // populates; drive one search first.
    await registered(booted).candidates(s1, { query: 'a', position: 'inline', signal: signal() })
    dock.inject('s1').onOpen('a.ts')
    expect(booted.openPath).toHaveBeenCalledWith({ path: '/ws/a.ts' })
  })

  it('registers directory navigation against the current session controller', async () => {
    const booted = await boot()
    const navigator = booted.slotsRegister.mock.calls.find(call => call[0]?.id === 'at-file-folder-navigation')?.[0] as {
      name: string
      order: number
      inject: (sessionId: string) => { controller: unknown }
    }
    expect(navigator).toMatchObject({ name: 'conversation.input.overlay', order: 1 })
    expect(navigator.inject('s1').controller).toBeDefined()
    expect(booted.scopeSession).toHaveBeenCalledWith('s1')
    expect(booted.sessionOf).toHaveBeenCalledWith(booted.sessionScope)
  })

  it('fails loud when directory navigation cannot resolve the session scope', async () => {
    const booted = await boot()
    booted.scopeSession.mockReturnValueOnce(undefined)
    const navigator = booted.slotsRegister.mock.calls.find(call => call[0]?.id === 'at-file-folder-navigation')?.[0] as {
      inject: (sessionId: string) => unknown
    }
    expect(() => navigator.inject('missing')).toThrow(/session "missing" has no client scope/)
  })

  it('registers the settings section whose controls write through the plugin Remote', async () => {
    const booted = await boot({
      workspaceIgnoreFiles: [{ workspace: '/work/a', ignoreFiles: ['old.tmp'] }],
    })
    const section = settingsSection(booted)
    expect(section).toMatchObject({ id: 'at-file', order: 55, locale: NS })
    expect(section.label()).toBe('nav')
    await section.inject().setEnabled(false)
    expect(booted.updateSettings).toHaveBeenCalledWith({ field: 'enabled', value: false })
    await section.inject().setIgnorePastedMentions(false)
    expect(booted.updateSettings).toHaveBeenCalledWith({ field: 'ignorePastedMentions', value: false })
    await section.inject().setIgnoreFiles(['desktop.ini'])
    expect(booted.updateSettings).toHaveBeenCalledWith({ field: 'ignoreFiles', value: ['desktop.ini'] })
    await section.inject().setWorkspaceIgnoreFiles('/work/a', ['local.tmp'])
    expect(booted.updateSettings).toHaveBeenCalledWith({
      field: 'workspaceIgnoreFiles',
      value: [{ workspace: '/work/a', ignoreFiles: ['local.tmp'] }],
    })
    await section.inject().setWorkspaceIgnoreFiles('/work/a', [])
    expect(booted.updateSettings).toHaveBeenLastCalledWith({ field: 'workspaceIgnoreFiles', value: [] })
  })

  it('logs failed host opens', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const atFileSearch = vi.fn(async () => ({ ok: true as const, value: [{ path: '/ws/a.ts', relative: 'a.ts', kind: 'file' }] }))
      const booted = await boot({ atFileSearch, openPath: async () => ({ result: { ok: false, error: { message: 'nope' } } }) })
      await registered(booted).candidates(s1, { query: 'a', position: 'inline', signal: signal() })
      const dock = booted.slotsRegister.mock.calls.find(call => call[0]?.name === 'conversation.input.dock')?.[0] as { inject: (id: string) => { onOpen: (p: string) => void } }
      dock.inject('s1').onOpen('a.ts')
      await Promise.resolve()
      expect(errorSpy).toHaveBeenCalledWith('[dsh-at-file] open failed:', 'nope')
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('logs an open whose token has no index entry', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const booted = await boot()
      const dock = booted.slotsRegister.mock.calls.find(call => call[0]?.name === 'conversation.input.dock')?.[0] as { inject: (id: string) => { onOpen: (p: string) => void } }
      dock.inject('s1').onOpen('missing.ts')
      expect(errorSpy).toHaveBeenCalledWith('[dsh-at-file] open failed: no index entry for', 'missing.ts')
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('logs a rejecting host open', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const atFileSearch = vi.fn(async () => ({ ok: true as const, value: [{ path: '/ws/a.ts', relative: 'a.ts', kind: 'file' }] }))
      const booted = await boot({ atFileSearch, openPath: async () => { throw new Error('carrier down') } })
      await registered(booted).candidates(s1, { query: 'a', position: 'inline', signal: signal() })
      const dock = booted.slotsRegister.mock.calls.find(call => call[0]?.name === 'conversation.input.dock')?.[0] as { inject: (id: string) => { onOpen: (p: string) => void } }
      dock.inject('s1').onOpen('a.ts')
      await Promise.resolve()
      expect(errorSpy).toHaveBeenCalledWith('[dsh-at-file] open failed:', expect.any(Error))
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('clears the index on connection reset', async () => {
    const atFileSearch = vi.fn(async () => ({ ok: true as const, value: [{ path: '/ws/a.ts', relative: 'a.ts', kind: 'file' }] }))
    const booted = await boot({ atFileSearch })
    await registered(booted).candidates(s1, { query: 'a', position: 'inline', signal: signal() })
    expect(atFileSearch).toHaveBeenCalledTimes(1)
    booted.ctx.emit('connection/reset')
    await registered(booted).candidates(s1, { query: 'a', position: 'inline', signal: signal() })
    expect(atFileSearch).toHaveBeenCalledTimes(2)
  })

  it('clears cached indexes when the file filters change', async () => {
    const atFileSearch = vi.fn(async () => ({ ok: true as const, value: [{ path: '/ws/a.ts', relative: 'a.ts', kind: 'file' }] }))
    const booted = await boot({ atFileSearch })
    await registered(booted).candidates(s1, { query: 'a', position: 'inline', signal: signal() })
    expect(atFileSearch).toHaveBeenCalledTimes(1)
    await settingsSection(booted).inject().setIgnoreFiles(['desktop.ini'])
    await registered(booted).candidates(s1, { query: 'a', position: 'inline', signal: signal() })
    expect(atFileSearch).toHaveBeenCalledTimes(2)
  })

  it('clears cached indexes when a workspace file filter changes', async () => {
    const atFileSearch = vi.fn(async () => ({ ok: true as const, value: [{ path: '/ws/a.ts', relative: 'a.ts', kind: 'file' as const }] }))
    const booted = await boot({ atFileSearch })
    await registered(booted).candidates(s1, { query: 'a', position: 'inline', signal: signal() })
    expect(atFileSearch).toHaveBeenCalledTimes(1)
    await settingsSection(booted).inject().setWorkspaceIgnoreFiles('/ws', ['local.tmp'])
    await registered(booted).candidates(s1, { query: 'a', position: 'inline', signal: signal() })
    expect(atFileSearch).toHaveBeenCalledTimes(2)
  })

  it('disposes its registrations with the fiber', async () => {
    const ctx = new Context()
    const unmount = vi.fn(async () => {})
    const registerDispose = vi.fn()
    ctx.provide('inputTriggers', { registerSource: vi.fn(() => registerDispose) })
    ctx.provide('connection', { api: { host: { openPath: async () => ({ result: { ok: true as const } }) } } })
    ctx.provide('remote', { $mount: vi.fn(async () => unmount) })
    ctx.provide('remote.atFile', {
      search: async () => ({ ok: true as const, value: [] }),
      getSettings: async () => ({
        ok: true as const,
        value: { enabled: true, ignoreFiles: [...DEFAULT_IGNORE_FILES], workspaceIgnoreFiles: [] },
      }),
      updateSettings: async () => ({
        ok: true as const,
        value: { enabled: true, ignoreFiles: [...DEFAULT_IGNORE_FILES], workspaceIgnoreFiles: [] },
      }),
    })
    ctx.provide('slots', { inject: vi.fn(), register: vi.fn() })
    ctx.provide('locale', { register: vi.fn(() => () => {}), bind: vi.fn(() => (key: string) => key) })
    ctx.provide('sessions', {})
    const fiber = ctx.plugin({ inject, apply })
    await fiber
    await Promise.resolve()
    expect(registerDispose).toHaveBeenCalledTimes(0)
    await fiber.dispose()
    expect(unmount).toHaveBeenCalled()
    expect(registerDispose).toHaveBeenCalledTimes(1)
  })

  it('registers the bilingual dictionaries and binds the namespace', async () => {
    const { localeRegister, bind } = await boot()
    expect(localeRegister).toHaveBeenCalledWith(NS, { zh, en })
    expect(bind).toHaveBeenCalledWith(NS)
  })

  it('injects the dock stylesheet exactly once', async () => {
    await boot()
    const style = document.getElementById(STYLE_ID)
    expect(style).not.toBeNull()
    expect(style!.textContent).toContain('dsh_atFile_rail')
    expect(style!.textContent).toContain('var(--dsh-composer-side-clearance)')
    expect(style!.textContent).toContain('max-width: var(--dsh-composer-card-max-width)')
    await boot()
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1)
  })
})
