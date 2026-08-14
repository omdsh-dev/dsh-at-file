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
import type { AtFileSettings } from '../src/contract.ts'

type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string; details: object } }

/** A settings scope stub with switchable value + recorded writes. */
function scopeStub(initial: boolean, initialIgnoreFiles: readonly string[] = DEFAULT_IGNORE_FILES) {
  let value: AtFileSettings | undefined = { enabled: initial, ignoreFiles: [...initialIgnoreFiles] }
  const listeners = new Set<() => void>()
  return {
    scope: {
      getSnapshot: () => ({ status: value === undefined ? 'loading' : 'ready', value, revision: 0, writable: true }),
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      set: vi.fn(async (field: string, next: boolean | readonly string[]) => {
        const current = value ?? { enabled: true, ignoreFiles: [...DEFAULT_IGNORE_FILES] }
        value = field === 'enabled'
          ? { ...current, enabled: next as boolean }
          : { ...current, ignoreFiles: [...next as readonly string[]] }
        for (const listener of listeners) listener()
      }),
    },
    setValue: (next: boolean) => {
      value = { ...(value ?? { ignoreFiles: [...DEFAULT_IGNORE_FILES] }), enabled: next }
      for (const listener of listeners) listener()
    },
    setIgnoreFilesValue: (next: readonly string[]) => {
      value = { ...(value ?? { enabled: true }), ignoreFiles: [...next] }
      for (const listener of listeners) listener()
    },
    clearValue: () => {
      value = undefined
      for (const listener of listeners) listener()
    },
  }
}

interface BootOptions {
  atFileSearch?: (sessionId: SessionId, signal: AbortSignal) => Promise<RemoteResult<readonly { path: string; relative: string; kind: 'file' | 'dir' }[]>>
  openPath?: () => Promise<{ result: { ok: true } | { ok: false; error: { message: string } } }>
  enabled?: boolean
  ignoreFiles?: readonly string[]
  withoutNamespace?: boolean
}

/** Boot the plugin body over a stub-service context and return the recorded surfaces. */
async function boot(options: BootOptions = {}) {
  const ctx = new Context()
  const registerSource = vi.fn(() => () => {})
  const controller = { menu: { getSnapshot: vi.fn(), subscribe: vi.fn() }, track: vi.fn() }
  const sessionOf = vi.fn(() => controller)
  const sessionScope = {}
  const scopeSession = vi.fn(() => sessionScope)
  const mount = vi.fn(async () => () => {})
  const localeRegister = vi.fn(() => () => {})
  const bind = vi.fn(() => (key: string, params?: Record<string, string>) => (params?.message ? `${key}: ${params.message}` : key))
  const slotsRegister = vi.fn()
  const slotsInject = vi.fn((_name: string, factory: () => void) => { factory() })
  const openPath = vi.fn(options.openPath ?? (async () => ({ result: { ok: true as const } })))
  const { scope, setValue, setIgnoreFilesValue, clearValue } = scopeStub(options.enabled ?? true, options.ignoreFiles)
  ctx.provide('inputTriggers', { registerSource, sessionOf })
  ctx.provide('connection', { api: { host: { openPath } } })
  ctx.provide('remote', { $mount: mount })
  if (options.withoutNamespace !== true) {
    ctx.provide('remote.atFile', {
      search: options.atFileSearch ?? (async () => ({ ok: true as const, value: [] })),
    })
  }
  ctx.provide('settingsScope', { bind: () => scope })
  ctx.provide('slots', { inject: slotsInject, register: slotsRegister })
  ctx.provide('locale', { register: localeRegister, bind })
  ctx.provide('sessions', { scope: scopeSession })
  apply(ctx as unknown as Parameters<typeof apply>[0])
  // The Remote mount effect is asynchronous; settle one tick.
  await Promise.resolve()
  await Promise.resolve()
  return {
    ctx, registerSource, sessionOf, sessionScope, scopeSession, mount, localeRegister, bind,
    slotsRegister, slotsInject, openPath, setValue, setIgnoreFilesValue, clearValue, scope,
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

const s1 = { sessionId: 's1' as SessionId }
const signal = () => new AbortController().signal

describe('dsh-at-file client apply', () => {
  it('declares the picker and carrier services', () => {
    expect(inject).toEqual(['inputTriggers', 'sessions', 'connection', 'remote', 'slots', 'locale', 'settingsScope'])
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
    expect(booted.registerSource).not.toHaveBeenCalled()
    booted.setValue(true)
    await Promise.resolve()
    expect(booted.registerSource).toHaveBeenCalledTimes(1)
  })

  it('unregisters the source when the switch flips off after boot', async () => {
    const booted = await boot({ enabled: true })
    expect(booted.registerSource).toHaveBeenCalledTimes(1)
    booted.setValue(false)
    await Promise.resolve()
    // A flip-off disposes the source; a flip-on re-registers (new call).
    booted.setValue(true)
    await Promise.resolve()
    expect(booted.registerSource).toHaveBeenCalledTimes(2)
  })

  it('defaults to enabled before the first settings read, then follows the value', async () => {
    const booted = await boot({ enabled: true })
    expect(booted.registerSource).toHaveBeenCalledTimes(1)
    // The scope clears to an unloaded state: the source stays registered
    // (undefined value falls back to the schema default, enabled).
    booted.clearValue()
    await Promise.resolve()
    expect(booted.registerSource).toHaveBeenCalledTimes(1)
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

  it('registers the settings section whose toggle writes the scope', async () => {
    const { slotsRegister, scope } = await boot()
    const section = slotsRegister.mock.calls.find(call => call[0]?.name === 'settings.section')?.[0] as {
      id: string
      order: number
      label: () => string
      locale: string
      inject: () => {
        setEnabled: (enabled: boolean) => Promise<void>
        setIgnoreFiles: (ignoreFiles: readonly string[]) => Promise<void>
      }
    }
    expect(section).toMatchObject({ id: 'at-file', order: 55, locale: NS })
    expect(section.label()).toBe('nav')
    await section.inject().setEnabled(false)
    expect(scope.set).toHaveBeenCalledWith('enabled', false)
    await section.inject().setIgnoreFiles(['desktop.ini'])
    expect(scope.set).toHaveBeenCalledWith('ignoreFiles', ['desktop.ini'])
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
    booted.setIgnoreFilesValue(['desktop.ini'])
    await registered(booted).candidates(s1, { query: 'a', position: 'inline', signal: signal() })
    expect(atFileSearch).toHaveBeenCalledTimes(2)
  })

  it('disposes its registrations with the fiber', async () => {
    const ctx = new Context()
    const unmount = vi.fn(async () => {})
    const registerDispose = vi.fn()
    const { scope } = scopeStub(true)
    ctx.provide('inputTriggers', { registerSource: vi.fn(() => registerDispose) })
    ctx.provide('connection', { api: { host: { openPath: async () => ({ result: { ok: true as const } }) } } })
    ctx.provide('remote', { $mount: vi.fn(async () => unmount) })
    ctx.provide('remote.atFile', { search: async () => ({ ok: true as const, value: [] }) })
    ctx.provide('settingsScope', { bind: () => scope })
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
    await boot()
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1)
  })
})
