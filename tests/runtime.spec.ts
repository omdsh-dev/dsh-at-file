/**
 * Host composition behavior: the plugin module boots over a real cordis
 * Context, registers the atFile service with the Gateway-visible binding, and
 * its search @Remote answers over a fixture workspace. This is the
 * REAL-composition evidence for the host half — the filesystem seam is real,
 * the Agent and settings provider are structural stubs (the gateway's `agent`
 * lookup resolves the live Agent in the assembled host, not in this unit).
 */
import { Context, symbols } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as plugin from '../src/index.ts'
import type { AtFileRuntime } from '../src/runtime.ts'
import type { AtFileSettings } from '../src/contract.ts'
import { AtFileSettingsSchema } from '../src/settings.ts'

/** One structural Agent stub: only the session header the service reads. */
function agentWith(cwd: string | undefined): Agent {
  return { session: { header: { cwd } }, ctx: new Context() } as unknown as Agent
}

/** The unproxied service original (cordis caller-tracking may wrap instances). */
function originalOf(service: object): object {
  const original = Reflect.get(service, symbols.original) as object | undefined
  return original ?? service
}

/** A settings provider stub whose value is switchable per test. */
function settingsProvider(read: () => AtFileSettings) {
  let patch: Partial<AtFileSettings> = {}
  return {
    register: () => ({
      get: () => ({ ...read(), ...patch }),
      watch: () => () => {},
      update: async (next: Partial<AtFileSettings>) => { patch = { ...patch, ...next } },
      replace: async () => {},
    }),
  }
}

/** Mount the function-plugin module on a fresh context (harness test pattern). */
async function mount(
  ctx: Context,
  config?: plugin.Config,
  readSettings: () => AtFileSettings = () => ({
    enabled: true,
    ignoreFiles: [...plugin.DEFAULT_IGNORE_FILES],
    workspaceIgnoreFiles: [],
  }),
) {
  const registryFiber = ctx.plugin(TypertRegistry)
  await registryFiber
  ctx.provide('settings', settingsProvider(readSettings))
  ctx.provide('agents', { roots: () => [] })
  const fiber = ctx.plugin({ inject: plugin.inject, apply: plugin.apply }, config)
  await fiber
  return fiber
}

describe('dsh-at-file host composition', () => {
  it('upgrades the previous settings shape with an empty workspace rule list', () => {
    expect(AtFileSettingsSchema({ enabled: true, ignoreFiles: ['desktop.ini'] })).toEqual({
      enabled: true,
      ignoreFiles: ['desktop.ini'],
      workspaceIgnoreFiles: [],
    })
  })

  it('boots the plugin and registers the atFile service under its own key', async () => {
    const ctx = new Context()
    const fiber = await mount(ctx)
    const runtime = ctx.get('atFile') as AtFileRuntime | undefined
    expect(runtime).toBeDefined()
    // The Gateway source-mode binding the wire dispatch relies on.
    expect(Reflect.get(originalOf(runtime as AtFileRuntime), 'typertRemote').namespace).toBe('atFile')
    await fiber.dispose()
  })

  it('registers the strict Typert manifest for search and settings', async () => {
    const ctx = new Context()
    const fiber = await mount(ctx)
    const registry = ctx.get('typert') as TypertRegistry
    expect(registry.local.get('atFile/search')).toMatchObject({ service: 'atFile', method: 'search' })
    expect(registry.local.get('atFile/getSettings')).toMatchObject({ service: 'atFile', method: 'getSettings' })
    expect(registry.local.get('atFile/updateSettings')).toMatchObject({ service: 'atFile', method: 'updateSettings' })
    await fiber.dispose()
    expect(registry.local.get('atFile/search')).toBeUndefined()
  })

  it('exports search and settings as Remote methods', async () => {
    const ctx = new Context()
    const fiber = await mount(ctx)
    const runtime = ctx.get('atFile') as AtFileRuntime
    expect(remoteMethods(originalOf(runtime)).map(marker => marker.method)).toEqual([
      'getSettings',
      'updateSettings',
      'search',
    ])
    await fiber.dispose()
  })

  it('disposes the service with its fiber', async () => {
    const ctx = new Context()
    const fiber = await mount(ctx)
    expect(ctx.get('atFile')).toBeDefined()
    await fiber.dispose()
    expect(ctx.get('atFile')).toBeUndefined()
  })

  it('reads and normalizes durable settings through the plugin Remote', async () => {
    const ctx = new Context()
    const fiber = await mount(ctx)
    try {
      const runtime = ctx.get('atFile') as AtFileRuntime
      expect(runtime.getSettings()).toEqual({
        enabled: true,
        ignoreFiles: [...plugin.DEFAULT_IGNORE_FILES],
        workspaceIgnoreFiles: [],
      })
      expect(await runtime.updateSettings({
        field: 'ignoreFiles',
        value: [' noise.log ', 'NOISE.LOG', ''],
      })).toMatchObject({ ignoreFiles: ['noise.log'] })
      expect(await runtime.updateSettings({
        field: 'workspaceIgnoreFiles',
        value: [
          { workspace: 'C:\\Work', ignoreFiles: ['first.tmp'] },
          { workspace: 'c:/work/', ignoreFiles: [' SECOND.tmp ', 'FIRST.TMP'] },
          { workspace: '', ignoreFiles: ['empty.tmp'] },
        ],
      })).toMatchObject({
        workspaceIgnoreFiles: [{
          workspace: 'C:\\Work',
          ignoreFiles: ['first.tmp', 'SECOND.tmp'],
        }],
      })
      expect(await runtime.updateSettings({ field: 'enabled', value: false }))
        .toMatchObject({ enabled: false })
    } finally {
      await fiber.dispose()
    }
  })

  it('search indexes the addressed workspace, files and directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-runtime-'))
    await mkdir(join(root, 'nested'))
    await writeFile(join(root, 'a.ts'), 'a\n')
    await writeFile(join(root, 'nested', 'b.ts'), 'b\n')
    const ctx = new Context()
    const fiber = await mount(ctx)
    try {
      const runtime = ctx.get('atFile') as AtFileRuntime
      const files = await runtime.search(agentWith(root), new AbortController().signal)
      expect(files.map(file => `${file.kind}:${file.relative}`)).toEqual([
        'file:a.ts',
        'dir:nested',
        'file:nested/b.ts',
      ])
    } finally {
      await fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('search refuses a session without a workspace', async () => {
    const ctx = new Context()
    const fiber = await mount(ctx)
    try {
      const runtime = ctx.get('atFile') as AtFileRuntime
      await expect(runtime.search(agentWith(undefined), new AbortController().signal))
        .rejects.toThrow(/no workspace directory/)
    } finally {
      await fiber.dispose()
    }
  })

  it('search refuses while the settings switch is off', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-runtime-'))
    const ctx = new Context()
    const fiber = await mount(ctx, undefined, () => ({
      enabled: false,
      ignoreFiles: [...plugin.DEFAULT_IGNORE_FILES],
      workspaceIgnoreFiles: [],
    }))
    try {
      const runtime = ctx.get('atFile') as AtFileRuntime
      await expect(runtime.search(agentWith(root), new AbortController().signal))
        .rejects.toThrow(/disabled in Settings/)
    } finally {
      await fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('search applies the live case-insensitive file-name filters', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-runtime-'))
    await writeFile(join(root, 'desktop.ini'), 'metadata\n')
    await writeFile(join(root, 'keep.txt'), 'keep\n')
    let ignoreFiles: string[] = ['DESKTOP.INI']
    const ctx = new Context()
    const fiber = await mount(ctx, undefined, () => ({ enabled: true, ignoreFiles, workspaceIgnoreFiles: [] }))
    try {
      const runtime = ctx.get('atFile') as AtFileRuntime
      expect((await runtime.search(agentWith(root), new AbortController().signal)).map(file => file.relative)).toEqual(['keep.txt'])
      ignoreFiles = []
      expect((await runtime.search(agentWith(root), new AbortController().signal)).map(file => file.relative)).toEqual(['desktop.ini', 'keep.txt'])
    } finally {
      await fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('adds only the addressed workspace filters to the global list', async () => {
    const first = await mkdtemp(join(tmpdir(), 'dsh-at-file-runtime-first-'))
    const second = await mkdtemp(join(tmpdir(), 'dsh-at-file-runtime-second-'))
    for (const root of [first, second]) {
      await writeFile(join(root, 'global.tmp'), 'global\n')
      await writeFile(join(root, 'local.tmp'), 'local\n')
      await writeFile(join(root, 'keep.txt'), 'keep\n')
    }
    const ctx = new Context()
    const fiber = await mount(ctx, undefined, () => ({
      enabled: true,
      ignoreFiles: ['global.tmp'],
      workspaceIgnoreFiles: [{ workspace: first, ignoreFiles: ['LOCAL.TMP'] }],
    }))
    try {
      const runtime = ctx.get('atFile') as AtFileRuntime
      expect((await runtime.search(agentWith(first), new AbortController().signal)).map(file => file.relative))
        .toEqual(['keep.txt'])
      expect((await runtime.search(agentWith(second), new AbortController().signal)).map(file => file.relative))
        .toEqual(['keep.txt', 'local.tmp'])
    } finally {
      await fiber.dispose()
      await rm(first, { recursive: true, force: true })
      await rm(second, { recursive: true, force: true })
    }
  })

  it('validates configuration through the exported schema', () => {
    expect(plugin.Config({})).toEqual({
      maxIndexedFiles: 5000,
      ignoreDirs: [...plugin.DEFAULT_IGNORE_DIRS],
    })
    expect(plugin.DEFAULT_IGNORE_FILES).toEqual(['desktop.ini', 'Thumbs.db', '.DS_Store'])
    expect(plugin.Config({ ignoreDirs: [] }).ignoreDirs).toEqual([])
    expect(() => plugin.Config({ maxIndexedFiles: 0 })).toThrow()
  })
})
