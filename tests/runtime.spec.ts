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

/** One structural Agent stub: only the session header the service reads. */
function agentWith(cwd: string | undefined): Agent {
  return { session: { header: { cwd } }, ctx: new Context() } as unknown as Agent
}

/** The unproxied service original (cordis caller-tracking may wrap instances). */
function originalOf(service: object): object {
  const original = Reflect.get(service, symbols.original) as object | undefined
  return original ?? service
}

/** A settings provider stub whose `enabled` value is switchable per test. */
function settingsProvider(enabled: () => boolean) {
  return {
    register: () => ({
      get: () => ({ enabled: enabled() }),
      watch: () => () => {},
      update: async () => {},
      replace: async () => {},
    }),
  }
}

/** Mount the function-plugin module on a fresh context (harness test pattern). */
async function mount(ctx: Context, config?: plugin.Config, enabled: () => boolean = () => true) {
  const registryFiber = ctx.plugin(TypertRegistry)
  await registryFiber
  ctx.provide('settings', settingsProvider(enabled))
  ctx.provide('agents', { roots: () => [] })
  const fiber = ctx.plugin({ inject: plugin.inject, apply: plugin.apply }, config)
  await fiber
  return fiber
}

describe('dsh-at-file host composition', () => {
  it('boots the plugin and registers the atFile service under its own key', async () => {
    const ctx = new Context()
    const fiber = await mount(ctx)
    const runtime = ctx.get('atFile') as AtFileRuntime | undefined
    expect(runtime).toBeDefined()
    // The Gateway source-mode binding the wire dispatch relies on.
    expect(Reflect.get(originalOf(runtime as AtFileRuntime), 'typertRemote').namespace).toBe('atFile')
    await fiber.dispose()
  })

  it('registers the strict Typert manifest for the search endpoint', async () => {
    const ctx = new Context()
    const fiber = await mount(ctx)
    const registry = ctx.get('typert') as TypertRegistry
    expect(registry.local.get('atFile/search')).toMatchObject({ service: 'atFile', method: 'search' })
    await fiber.dispose()
    expect(registry.local.get('atFile/search')).toBeUndefined()
  })

  it('exports only search as a Remote method', async () => {
    const ctx = new Context()
    const fiber = await mount(ctx)
    const runtime = ctx.get('atFile') as AtFileRuntime
    expect(remoteMethods(originalOf(runtime)).map(marker => marker.method)).toEqual(['search'])
    await fiber.dispose()
  })

  it('disposes the service with its fiber', async () => {
    const ctx = new Context()
    const fiber = await mount(ctx)
    expect(ctx.get('atFile')).toBeDefined()
    await fiber.dispose()
    expect(ctx.get('atFile')).toBeUndefined()
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
    const fiber = await mount(ctx, undefined, () => false)
    try {
      const runtime = ctx.get('atFile') as AtFileRuntime
      await expect(runtime.search(agentWith(root), new AbortController().signal))
        .rejects.toThrow(/disabled in Settings/)
    } finally {
      await fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('validates configuration through the exported schema', () => {
    expect(plugin.Config({})).toEqual({
      maxIndexedFiles: 5000,
      maxFileBytes: 262144,
      maxTotalBytes: 1048576,
      directoryMode: 'manifest',
      ignoreDirs: ['.git', 'node_modules'],
    })
    expect(() => plugin.Config({ maxIndexedFiles: 0 })).toThrow()
    expect(() => plugin.Config({ maxFileBytes: 0 })).toThrow()
    expect(() => plugin.Config({ maxTotalBytes: 1023 })).toThrow()
    expect(() => plugin.Config({ directoryMode: 'eager' as never })).toThrow()
  })
})
