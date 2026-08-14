/**
 * The atFile wire contract, shared verbatim by the host manifest
 * (`ctx.typert.register` in typert.ts) and the client contribution
 * (`ctx.remote.$mount` in client/remote.ts). The service exposes workspace
 * index search and plugin-owned settings access. File bytes never cross this
 * boundary; the Host only marks validated paths at `agent/pre-step`.
 */
import { z } from 'zod'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'

/** One indexed workspace entry (a file or a directory), with its display path. */
export interface FileEntry {
  readonly path: string
  readonly relative: string
  readonly kind: 'file' | 'dir'
}

/** One file filter. Legacy string values remain accepted as exact, insensitive rules. */
export interface FileIgnoreRule {
  readonly kind: 'exact' | 'regex'
  readonly pattern: string
  readonly caseSensitive: boolean
}

/** Durable and wire-compatible input for one file filter. */
export type FileIgnoreRuleInput = string | FileIgnoreRule

/** File-name filters attached to one canonical workspace path. */
export interface WorkspaceIgnoreFiles {
  /** Canonical workspace directory path supplied by the Harness. */
  readonly workspace: string
  /** Additional basenames ignored only inside this workspace. */
  readonly ignoreFiles: FileIgnoreRuleInput[]
}

/** The `at-file` settings namespace's durable shape (host and client share it). */
export interface AtFileSettings {
  /** Whether the @file surface is enabled; false hides picker, dock, and reference injection. */
  readonly enabled: boolean
  /** Global Exact and Regex basename filters; legacy strings are insensitive Exact rules. */
  readonly ignoreFiles: FileIgnoreRuleInput[]
  /** Workspace-specific filters added to the global filters. */
  readonly workspaceIgnoreFiles: WorkspaceIgnoreFiles[]
}

/** One field update sent through the plugin-owned settings Remote. */
export type AtFileSettingsUpdate =
  | { readonly field: 'enabled'; readonly value: boolean }
  | { readonly field: 'ignoreFiles'; readonly value: FileIgnoreRuleInput[] }
  | { readonly field: 'workspaceIgnoreFiles'; readonly value: WorkspaceIgnoreFiles[] }

/** Wire codec: one session identity (branded string on the wire). */
export const sessionIdSchema = z.string().min(1)

/** Wire codec: one workspace entry (file or directory). */
export const fileEntrySchema = z.object({
  path: z.string().min(1),
  relative: z.string().min(1),
  kind: z.enum(['file', 'dir']),
}).readonly()

/** Strict wire codec for one structured file filter. */
export const fileIgnoreRuleSchema = z.object({
  kind: z.enum(['exact', 'regex']),
  pattern: z.string().min(1),
  caseSensitive: z.boolean(),
}).readonly().superRefine((rule, context) => {
  if (rule.kind !== 'regex') return
  try {
    new RegExp(rule.pattern, rule.caseSensitive ? '' : 'i')
  } catch (error) {
    /* v8 ignore next -- RegExp construction throws an Error in supported runtimes. */
    const message = error instanceof Error ? error.message : 'Invalid regular expression'
    context.addIssue({ code: 'custom', message })
  }
})

/** Strict wire codec accepting both legacy strings and structured filters. */
export const fileIgnoreRuleInputSchema = z.union([z.string(), fileIgnoreRuleSchema])

/** Strict wire codec for one workspace-specific filter row. */
export const workspaceIgnoreFilesSchema = z.object({
  workspace: z.string().min(1),
  ignoreFiles: z.array(fileIgnoreRuleInputSchema),
}).readonly()

/** Strict wire codec for the resolved at-file settings section. */
export const atFileSettingsSchema = z.object({
  enabled: z.boolean(),
  ignoreFiles: z.array(fileIgnoreRuleInputSchema),
  workspaceIgnoreFiles: z.array(workspaceIgnoreFilesSchema),
}).readonly()

/** Strict wire codec for one field update. */
export const atFileSettingsUpdateSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('enabled'), value: z.boolean() }).readonly(),
  z.object({ field: z.literal('ignoreFiles'), value: z.array(fileIgnoreRuleInputSchema) }).readonly(),
  z.object({
    field: z.literal('workspaceIgnoreFiles'),
    value: z.array(workspaceIgnoreFilesSchema),
  }).readonly(),
])

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
  {
    id: 'dsh-at-file#atFile/getSettings',
    service: 'atFile',
    namespace: 'atFile',
    method: 'getSettings',
    invocation: { kind: 'direct' },
    parameters: [],
    result: {
      mode: 'strict',
      typeSymbol: 'dsh-at-file#AtFileSettings',
      schema: atFileSettingsSchema,
    },
  },
  {
    id: 'dsh-at-file#atFile/updateSettings',
    service: 'atFile',
    namespace: 'atFile',
    method: 'updateSettings',
    invocation: { kind: 'direct' },
    parameters: [
      {
        name: 'update',
        wire: 'update',
        source: 'json',
        codec: {
          mode: 'strict',
          typeSymbol: 'dsh-at-file#AtFileSettingsUpdate',
          schema: atFileSettingsUpdateSchema,
        },
      },
    ],
    result: {
      mode: 'strict',
      typeSymbol: 'dsh-at-file#AtFileSettings',
      schema: atFileSettingsSchema,
    },
  },
]
