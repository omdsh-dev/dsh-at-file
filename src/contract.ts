/**
 * The atFile wire contract, shared verbatim by the host manifest
 * (`ctx.typert.register` in typert.ts) and the client contribution
 * (`ctx.remote.$mount` in client/remote.ts). The only Remote endpoint is the
 * workspace index search; file content reaches the model through the Host's
 * `agent/pre-step` boundary, not through a wire read.
 */
import { z } from 'zod'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'

/** One indexed workspace entry (a file or a directory), with its display path. */
export interface FileEntry {
  readonly path: string
  readonly relative: string
  readonly kind: 'file' | 'dir'
}

/** One bounded text-file read (the Host mention expansion's file result). */
export interface FileContent {
  readonly content: string
  readonly bytes: number
}

/** One file read inside a directory attachment. */
export interface ReadTreeFile {
  readonly path: string
  readonly relative: string
  readonly content: string
  readonly bytes: number
}

/** How a directory mention is represented to the model. */
export type DirectoryMode = 'manifest' | 'bounded'

/** One metadata-only entry in a directory manifest. */
export interface ReadTreeEntry {
  readonly relative: string
  readonly kind: 'file' | 'dir'
  /** Undefined when the entry disappeared or could not be stated. */
  readonly bytes?: number
}

/** Why one file was omitted from a bounded directory attachment. */
export type ReadTreeSkipReason = 'oversized' | 'binary' | 'unreadable' | 'aggregate-limit'

/** Structured metadata for one omitted directory descendant. */
export type ReadTreeSkipped =
  | { readonly relative: string; readonly reason: 'oversized'; readonly bytes: number; readonly limit: number }
  | { readonly relative: string; readonly reason: 'binary'; readonly bytes?: number }
  | { readonly relative: string; readonly reason: 'unreadable' }
  | { readonly relative: string; readonly reason: 'aggregate-limit'; readonly bytes: number; readonly limit: number }

/** One bounded directory read (the Host mention expansion's directory result). */
export interface ReadTreeResult {
  readonly mode: DirectoryMode
  readonly entries: readonly ReadTreeEntry[]
  readonly files: readonly ReadTreeFile[]
  readonly skipped: readonly ReadTreeSkipped[]
  readonly includedBytes: number
  readonly truncated: boolean
}

/** The `at-file` settings namespace's durable shape (host and client share it). */
export interface AtFileSettings {
  /** Whether the @file surface is enabled; false hides picker, dock, and expansion. */
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
