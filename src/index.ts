/**
 * dsh-at-file host plugin: mounts the `atFile` Typert Remote service
 * (workspace index search for the browser's @file picker), registers its
 * strict Typert manifest, registers the settings enable switch, and marks
 * validated `@path` references at each agent's pre-step boundary. The plugin
 * never reads mentioned file contents. The client half
 * ships in the same package (`./client`); the web server serves it under
 * /plugins/dsh-at-file/client.js.
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Type-only: brings the `ctx.typert` Context merge into this program.
import type {} from '@deepseek-ai/dsh-typert-registry'
// Type-only: brings the `ctx.settings` and `ctx.agents` Context merges in.
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-agent'
import { AtFileRuntime } from './runtime.ts'
import { TYPERT_MANIFEST } from './typert.ts'
import { registerAtFileSettings } from './settings.ts'
import { mentionPreStep } from './mention.ts'
import { DEFAULT_IGNORE_DIRS } from './defaults.ts'
import type { ResolvedConfig } from './types.ts'

/** Cordis plugin name (the Loader entry and client bundle id). */
export const name = 'dsh-at-file'

/** Services required before load: the Typert registry, the settings provider, and the agent registry. */
export const inject = ['typert', 'settings', 'agents']

export { DEFAULT_IGNORE_DIRS, DEFAULT_IGNORE_FILES } from './defaults.ts'

/** Host plugin configuration, validated at load by the Loader. */
export interface Config {
  /** Hard cap on indexed files per workspace; the walk stops and reports truncation. */
  maxIndexedFiles: number
  /** Directory basenames the index walk skips entirely. */
  ignoreDirs: string[]
}

/**
 * Configuration schema: deployment-varying bounds stay tunable from
 * the profile patch. The inferred schema type keeps the callable form accepting
 * partial input, so `Config({})` yields the defaults (what the Loader does
 * for Loader compositions).
 */
export const Config = z.object({
  maxIndexedFiles: z.natural().min(1).default(5000),
  ignoreDirs: z.array(z.string()).default([...DEFAULT_IGNORE_DIRS]),
})

/**
 * Mount the atFile service and the pre-step path-reference marker.
 * @param ctx - host cordis context.
 * @param config - validated plugin configuration (schema defaults applied).
 */
export function apply(ctx: Context, config?: Config): void {
  const resolved: ResolvedConfig = Config(config ?? {})
  // The durable enable switch: the runtime and the boundary read its live
  // value per call, so toggling it in the Web settings takes effect immediately.
  const settings = registerAtFileSettings(ctx)
  const getSettings = () => settings.get()
  const isEnabled = (): boolean => getSettings().enabled
  new AtFileRuntime(ctx, resolved, getSettings)
  // Strict endpoint registration: the gateway resolves atFile/search from
  // this manifest, independent of decorator marker state.
  ctx.effect(() => {
    const dispose = ctx.typert.register(TYPERT_MANIFEST)
    return () => { void dispose() }
  }, 'dsh-at-file: typert manifest')

  // Mark @path references for every agent, at its pre-step boundary. The
  // listener lives on the agent's scope (the event is agent-scoped), so it
  // registers per created agent and withdraws with it. The boundary logic is
  // `mentionPreStep` (unit-tested); this is the scoped lifecycle glue.
  /* v8 ignore start -- agent-scoped registration glue; the boundary behavior is mentionPreStep and the event plumbing is harness-owned. */
  ctx.on('agent/created', ({ agent }) => {
    agent.ctx.effect(() => {
      const stop = agent.ctx.on('agent/pre-step', async ({ messages, signal }, next) => {
        return mentionPreStep(agent, isEnabled, messages, signal, next)
      })
      return () => { stop() }
    }, 'dsh-at-file: pre-step path references')
  })
  /* v8 ignore stop */
}
