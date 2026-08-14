/**
 * The hand-written host Typert manifest for the atFile Remote. Registered
 * through `ctx.typert.register` in the plugin body, it claims the wire
 * endpoints through the strict registry — the same path generated `./typert`
 * artifacts use — so the Host Gateway resolves search and plugin-owned
 * settings calls without consulting the `@Remote` marker table. That
 * marker independence matters in the harness's source-launch development
 * environment, where the tsx-loaded gateway and a profile-loaded plugin
 * bundle can hold separate copies of the decorator module state.
 */
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import { AT_FILE_INVOCATIONS } from './contract.ts'

/** The atFile namespace's host manifest (strict codecs shared with the client). */
export const TYPERT_MANIFEST: TypertContribution = {
  package: 'dsh-at-file',
  face: 'host',
  schemas: [],
  model: {
    services: [
      {
        key: 'atFile',
        exportName: 'AtFileRuntime',
        description: 'Workspace path search and durable settings for the @file picker.',
        tags: [],
        members: [
          {
            kind: 'method',
            name: 'search',
            signature: 'search(agent: Agent, signal: AbortSignal): Promise<readonly FileEntry[]>',
          },
          {
            kind: 'method',
            name: 'getSettings',
            signature: 'getSettings(): AtFileSettings',
          },
          {
            kind: 'method',
            name: 'updateSettings',
            signature: 'updateSettings(update: AtFileSettingsUpdate): Promise<AtFileSettings>',
          },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
  invocations: AT_FILE_INVOCATIONS,
}
