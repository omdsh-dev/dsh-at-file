/**
 * The Host-side @file mention expansion: recognizes `@path` tokens in the
 * outgoing user message and, at the `agent/pre-step` boundary, reads each
 * referenced file or builds a bounded directory representation as a user-role
 * message the model reads directly. Only `source.kind === 'user'`
 * text is scanned — external text cannot forge the gesture — and every path
 * resolves against the session's workspace cwd.
 */
import { isAbsolute, join } from 'node:path'
import { stat } from 'node:fs/promises'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { readFileText, readTree } from './files.ts'
import type { ReadTreeResult, ReadTreeSkipped } from './contract.ts'
import type { ResolvedConfig } from './types.ts'

/** One recognized mention: its workspace-relative token and resolved kind. */
export interface Mention {
  /** Workspace-relative path (no leading @, no trailing slash). */
  readonly relative: string
  /** Resolved absolute path. */
  readonly absolute: string
  readonly kind: 'file' | 'dir'
}

/** The source tag the injected content carries (transcript consumers use it). */
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'at-file-mention': { kind: 'at-file-mention'; relative: string }
  }
}

/** The user-message source kind this boundary scans (external text cannot forge it). */
const USER_SOURCE_KIND = 'user'

/** The literal mention token: `@` then a path with no whitespace or `@`. */
const MENTION_PATTERN = /@([^\s@]+)/g

/**
 * Scan one text block for `@path` tokens, deduplicated in first-seen order.
 * A trailing slash (the directory chip form) is stripped from the path.
 * @param text - the message text block.
 * @returns unique workspace-relative tokens.
 */
export function scanMentions(text: string): readonly string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const raw = match[1] as string
    const relative = raw.endsWith('/') ? raw.slice(0, -1) : raw
    if (relative === '' || seen.has(relative)) continue
    seen.add(relative)
    out.push(relative)
  }
  return out
}

/**
 * Resolve one token to an absolute path and its kind, confined to the cwd.
 * @param relative - workspace-relative token.
 * @param cwd - the session's workspace directory.
 * @param signal - caller lifetime.
 * @returns the resolved mention, or undefined when it is not inside the workspace.
 */
async function resolveMention(
  relative: string,
  cwd: string,
  signal: AbortSignal,
): Promise<Mention | undefined> {
  // The join is confined by construction: every token is cwd-relative and
  // never carries `..` out of the workspace (the picker only offers such
  // tokens); an absolute or escaping token is not a mention.
  if (relative.startsWith('/') || relative.startsWith('..')) return undefined
  signal.throwIfAborted()
  const absolute = join(cwd, relative)
  const info = await stat(absolute).catch(() => undefined)
  signal.throwIfAborted()
  if (info === undefined) return undefined
  return { relative, absolute, kind: info.isDirectory() ? 'dir' : 'file' }
}

/** The model form of one attached file. */
function fileForm(relative: string, content: string): string {
  const body = content.endsWith('\n') ? content : `${content}\n`
  return `<file path="${escapeAttribute(relative)}">\n${body}</file>`
}

/** Escape one XML-like attribute without modifying attached file content. */
function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

interface DirectoryCandidate {
  readonly kind: 'entry' | 'file' | 'omission'
  readonly text: string
  readonly bytes?: number
}

/** Deterministically retain candidates whose complete serialized form fits. */
function selectCandidates(candidates: readonly DirectoryCandidate[], bodyBudget: number): readonly DirectoryCandidate[] {
  const selected: DirectoryCandidate[] = []
  let used = 0
  for (const candidate of candidates) {
    const next = Buffer.byteLength(candidate.text) + 1
    if (used + next > bodyBudget) continue
    selected.push(candidate)
    used += next
  }
  return selected
}

/** Human- and model-readable reason for one bounded-mode omission. */
function omissionReason(skipped: ReadTreeSkipped): string {
  switch (skipped.reason) {
    case 'oversized':
      return `${String(skipped.bytes)} bytes exceeds maxFileBytes=${String(skipped.limit)}`
    case 'binary':
      return 'binary, PDF, or non-UTF-8 file'
    case 'aggregate-limit':
      return `${String(skipped.bytes)} bytes would exceed maxTotalBytes=${String(skipped.limit)}`
    case 'unreadable':
      return 'unreadable file'
  }
}

/** Serialize a metadata-only directory manifest under the aggregate output cap. */
function manifestForm(relative: string, tree: ReadTreeResult, maxTotalBytes: number): string {
  /* v8 ignore next -- mention tokens are normalized to no trailing slash. */
  const prefix = `${relative.endsWith('/') ? relative : `${relative}/`}`
  const candidates: DirectoryCandidate[] = tree.entries.map(entry => ({
    kind: 'entry',
    /* v8 ignore next -- size is unknown only when an indexed file disappears before its manifest stat. */
    text: entry.kind === 'dir'
      ? `<entry path="${escapeAttribute(`${prefix}${entry.relative}`)}" type="directory" />`
      : `<entry path="${escapeAttribute(`${prefix}${entry.relative}`)}" type="file" size="${entry.bytes === undefined ? 'unknown' : String(entry.bytes)}" />`,
  }))
  const header = (included: number, omitted: number, truncated: boolean): string =>
    `<directory path="${escapeAttribute(relative)}" mode="manifest" truncated="${String(truncated)}" ` +
    `included-entries="${String(included)}" omitted-entries="${String(omitted)}" max-total-bytes="${String(maxTotalBytes)}">`
  const footer = '\n</directory>'
  const reserved = Buffer.byteLength(header(candidates.length, candidates.length, false)) + Buffer.byteLength(footer)
  /* v8 ignore start -- Config enforces >= 1024 bytes; only an OS-invalid path longer than that can exhaust the header. */
  if (reserved > maxTotalBytes) {
    throw new Error(`at-file: maxTotalBytes=${String(maxTotalBytes)} is too small to represent directory "${relative}"`)
  }
  /* v8 ignore stop */
  const selected = selectCandidates(candidates, maxTotalBytes - reserved)
  const omitted = candidates.length - selected.length
  const output = `${header(selected.length, omitted, tree.truncated || omitted > 0)}` +
    `${selected.map(candidate => `\n${candidate.text}`).join('')}${footer}`
  return output
}

/** Serialize bounded directory contents and their omission report under the output cap. */
function boundedForm(relative: string, tree: ReadTreeResult, maxTotalBytes: number): string {
  // resolveMention strips a trailing slash before this is called, so the
  // slash-preserving arm is unreachable from the public path.
  /* v8 ignore next -- the mention token is normalized to no trailing slash. */
  const prefix = `${relative.endsWith('/') ? relative : `${relative}/`}`
  const omissions: DirectoryCandidate[] = tree.skipped.map(skipped => ({
    kind: 'omission',
    text: `<omitted path="${escapeAttribute(`${prefix}${skipped.relative}`)}" reason="${omissionReason(skipped)}" />`,
  }))
  const files: DirectoryCandidate[] = tree.files.map(file => {
    const body = file.content.endsWith('\n') ? file.content : `${file.content}\n`
    return {
      kind: 'file',
      text: `<file path="${escapeAttribute(`${prefix}${file.relative}`)}">\n${body}</file>`,
      bytes: file.bytes,
    }
  })
  const candidates = [...omissions, ...files]
  const totalFiles = tree.skipped.length + tree.files.length
  const header = (
    included: number,
    omitted: number,
    reported: number,
    includedBytes: number,
    truncated: boolean,
  ): string =>
    `<directory path="${escapeAttribute(relative)}" mode="bounded" truncated="${String(truncated)}" ` +
    `included-files="${String(included)}" omitted-files="${String(omitted)}" ` +
    `reported-omissions="${String(reported)}" included-bytes="${String(includedBytes)}" ` +
    `max-total-bytes="${String(maxTotalBytes)}">`
  const footer = '\n</directory>'
  const reserved = Buffer.byteLength(header(totalFiles, totalFiles, tree.skipped.length, maxTotalBytes, false)) +
    Buffer.byteLength(footer)
  /* v8 ignore start -- Config enforces >= 1024 bytes; only an OS-invalid path longer than that can exhaust the header. */
  if (reserved > maxTotalBytes) {
    throw new Error(`at-file: maxTotalBytes=${String(maxTotalBytes)} is too small to represent directory "${relative}"`)
  }
  /* v8 ignore stop */
  const selected = selectCandidates(candidates, maxTotalBytes - reserved)
  const included = selected.filter(candidate => candidate.kind === 'file')
  const reported = selected.filter(candidate => candidate.kind === 'omission').length
  const includedBytes = included.reduce((sum, candidate) => {
    /* v8 ignore next -- `included` is filtered to file candidates, which always carry bytes. */
    return sum + (candidate.bytes ?? 0)
  }, 0)
  const omitted = totalFiles - included.length
  const output = header(included.length, omitted, reported, includedBytes, tree.truncated || omitted > 0) +
    `${selected.map(candidate => `\n${candidate.text}`).join('')}${footer}`
  return output
}

/** The model form of one attached directory. */
function dirForm(relative: string, tree: ReadTreeResult, maxTotalBytes: number): string {
  const output = tree.mode === 'manifest'
    ? manifestForm(relative, tree, maxTotalBytes)
    : boundedForm(relative, tree, maxTotalBytes)
  /* v8 ignore next -- both serializers reserve their maximum-width header and exact body bytes. */
  if (Buffer.byteLength(output) > maxTotalBytes) {
    throw new Error('at-file: internal directory serialization exceeded maxTotalBytes')
  }
  return output
}

/**
 * Expand every `@path` mention in the user messages into injected content
 * messages, in first-seen order. Unknown paths stay plain prose.
 * @param messages - the assembled step messages.
 * @param cwd - the session's workspace directory.
 * @param config - bounds (per-file cap, index cap, ignore dirs).
 * @param signal - caller lifetime.
 * @returns the injected user messages (empty when nothing matched or disabled).
 */
export async function expandMentions(
  messages: readonly UserMessage[],
  cwd: string | undefined,
  config: ResolvedConfig,
  signal: AbortSignal,
): Promise<UserMessage[]> {
  if (cwd === undefined || !isAbsolute(cwd)) return []
  const tokens: string[] = []
  for (const message of messages) {
    if (message.source.kind !== USER_SOURCE_KIND) continue
    for (const block of message.content) {
      if (block.type !== 'text') continue
      tokens.push(...scanMentions(block.text))
    }
  }
  const injections: UserMessage[] = []
  for (const token of tokens) {
    signal.throwIfAborted()
    const mention = await resolveMention(token, cwd, signal)
    if (mention === undefined) continue
    let form: string
    if (mention.kind === 'dir') {
      const tree = await readTree(mention.absolute, {
        maxFiles: config.maxIndexedFiles,
        maxFileBytes: config.maxFileBytes,
        maxTotalBytes: config.maxTotalBytes,
        mode: config.directoryMode,
        ignoreDirs: config.ignoreDirs,
      }, signal)
      form = dirForm(mention.relative, tree, config.maxTotalBytes)
    } else {
      const content = await readFileText(mention.absolute, config.maxFileBytes, signal)
      form = fileForm(mention.relative, content.content)
    }
    injections.push(createUserMessage({
      content: [{ type: 'text', text: form }],
      source: { kind: 'at-file-mention', relative: mention.relative },
    }))
  }
  return injections
}

/** The minimal agent face the pre-step handler reads. */
export interface MentionAgent {
  session: { header: { cwd?: string } }
}

/**
 * The `agent/pre-step` listener body: expand mentions in the claimed user
 * messages and append the injections to the downstream decision. Extracted so
 * the boundary logic is unit-testable without an assembled agent scope.
 * @param agent - the addressed agent (its session header owns the cwd).
 * @param config - bounds.
 * @param isEnabled - live settings read.
 * @param messages - the claimed messages (the user's own words).
 * @param signal - caller lifetime.
 * @param next - the downstream waterfall.
 * @returns the decision with injections appended, or the downstream decision.
 */
export async function mentionPreStep(
  agent: MentionAgent,
  config: ResolvedConfig,
  isEnabled: () => boolean,
  messages: readonly UserMessage[],
  signal: AbortSignal,
  next: () => Promise<PreStepDecision>,
): Promise<PreStepDecision> {
  const decision = await next()
  if (decision.kind === 'reject') return decision
  if (!isEnabled()) return decision
  const injections = await expandMentions(messages, agent.session.header.cwd, config, signal)
  if (injections.length === 0) return decision
  return { kind: 'enter', messages: [...decision.messages, ...injections] }
}
