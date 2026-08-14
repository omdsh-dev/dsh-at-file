/**
 * The atFile wire contract, shared verbatim by the host manifest
 * (`ctx.typert.register` in typert.ts) and the client contribution
 * (`ctx.remote.$mount` in client/remote.ts). The only Remote endpoint is the
 * workspace index search. File bytes never cross this plugin boundary; the
 * Host only marks validated user-selected paths at `agent/pre-step`.
 */
import { z } from 'zod'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'

/** One indexed workspace entry (a file or a directory), with its display path. */
export interface FileEntry {
  readonly path: string
  readonly relative: string
  readonly kind: 'file' | 'dir'
}

/** The `at-file` settings namespace's durable shape (host and client share it). */
export interface AtFileSettings {
  /** Whether the @file surface is enabled; false hides picker, dock, and reference injection. */
  readonly enabled: boolean
}

/** Wire codec: one session identity (branded string on the wire). */
export const sessionIdSchema = z.string().min(1)

/** Wire codec: one workspace entry (file or directory). */
export const fileEntrySchema = z.object({
  path: z.string().min(1),
  relative: z.string().min(1),
  kind: z.enum(['file', 'dir']),
}).readonly()

/** The atFile Remote namespace's strict invocation descriptors. */
export const AT_FILE_INVOCATIONS: readonly InvocationDescriptor[] = [
  {
    id: 'dsh-at-file#atFile/search',
    service: 'atFile',
    namespace: 'atFile',
    method: 'search',
    invocation: { kind: 'direct' },
    parameters: [
      {
        name: 'agent',
        wire: 'agentId',
        source: 'lookup',
        lookup: 'agent',
        // The type symbol must equal the agent lookup provider's wire identity
        // exactly — the gateway's strict path rejects a mismatched symbol.
        codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', schema: sessionIdSchema },
      },
    ],
    cancellation: { parameter: 'signal' },
    result: {
      mode: 'strict',
      typeSymbol: 'dsh-at-file#FileEntry[]',
      schema: z.array(fileEntrySchema),
    },
  },
]
