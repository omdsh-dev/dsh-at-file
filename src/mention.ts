/**
 * The Host-side @file reference marker: recognizes `@path` tokens in the
 * outgoing user message, validates that each selected workspace path exists,
 * and injects only its path and kind. File bytes and directory descendants are
 * never read here; the agent chooses if and how to inspect a reference with its
 * available tools. Only `source.kind === 'user'` text is scanned, so external
 * text cannot forge the gesture.
 */
import { isAbsolute, relative as pathRelative, resolve, sep } from 'node:path'
import { stat } from 'node:fs/promises'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { isProtectedMentionToken, PASTED_MENTION_MARKER, stripPastedMentionMarkers } from './paste.ts'

/** One recognized mention: its workspace-relative token and resolved kind. */
export interface Mention {
  /** Workspace-relative path (no leading @, no trailing slash). */
  readonly relative: string
  readonly kind: 'file' | 'dir'
}

/** The source tag the injected reference carries (transcript consumers use it). */
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
export function scanMentions(text: string, ignorePastedMentions = true): readonly string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const raw = match[1] as string
    if (ignorePastedMentions && isProtectedMentionToken(raw)) continue
    const unmarked = ignorePastedMentions ? raw : stripPastedMentionMarkers(raw)
    const relative = unmarked.endsWith('/') ? unmarked.slice(0, -1) : unmarked
    if (relative === '' || seen.has(relative)) continue
    seen.add(relative)
    out.push(relative)
  }
  return out
}

/**
 * Resolve one token to an absolute path and its kind, confined to the cwd.
 * @param token - workspace-relative token.
 * @param cwd - the session's workspace directory.
 * @param signal - caller lifetime.
 * @returns the resolved mention, or undefined when it is not inside the workspace.
 */
async function resolveMention(
  token: string,
  cwd: string,
  signal: AbortSignal,
): Promise<Mention | undefined> {
  if (isAbsolute(token)) return undefined
  const absolute = resolve(cwd, token)
  const confined = pathRelative(cwd, absolute)
  if (confined === '..' || confined.startsWith(`..${sep}`) || isAbsolute(confined)) {
    return undefined
  }
  signal.throwIfAborted()
  const info = await stat(absolute).catch(() => undefined)
  signal.throwIfAborted()
  if (info === undefined) return undefined
  const relative = confined.split(sep).join('/') || '.'
  return { relative, kind: info.isDirectory() ? 'dir' : 'file' }
}

/** Escape one XML-like attribute without modifying the referenced path. */
function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/** One validated existence-only reference for the model. */
function referenceForm(mention: Mention): string {
  const kind = mention.kind === 'dir' ? 'directory' : 'file'
  return `<workspace-reference path="${escapeAttribute(mention.relative)}" kind="${kind}" />`
}

/**
 * Expand every `@path` mention into a validated existence-only reference, in
 * first-seen order. Unknown paths stay plain prose.
 * @param messages - the assembled step messages.
 * @param cwd - the session's workspace directory.
 * @param signal - caller lifetime.
 * @returns the injected user messages (empty when nothing matched or disabled).
 */
export async function expandMentions(
  messages: readonly UserMessage[],
  cwd: string | undefined,
  signal: AbortSignal,
  ignorePastedMentions = true,
): Promise<UserMessage[]> {
  if (cwd === undefined || !isAbsolute(cwd)) return []
  const tokens: string[] = []
  for (const message of messages) {
    if (message.source.kind !== USER_SOURCE_KIND) continue
    for (const block of message.content) {
      if (block.type !== 'text') continue
      const text = ignorePastedMentions ? block.text : stripPastedMentionMarkers(block.text)
      tokens.push(...scanMentions(text, ignorePastedMentions))
    }
  }
  const injections: UserMessage[] = []
  for (const token of tokens) {
    signal.throwIfAborted()
    const mention = await resolveMention(token, cwd, signal)
    if (mention === undefined) continue
    injections.push(createUserMessage({
      content: [{ type: 'text', text: referenceForm(mention) }],
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
 * @param isEnabled - live settings read.
 * @param messages - the claimed messages (the user's own words).
 * @param signal - caller lifetime.
 * @param next - the downstream waterfall.
 * @returns the decision with injections appended, or the downstream decision.
 */
export async function mentionPreStep(
  agent: MentionAgent,
  isEnabled: () => boolean,
  messages: readonly UserMessage[],
  signal: AbortSignal,
  next: () => Promise<PreStepDecision>,
  ignorePastedMentions: () => boolean = () => true,
): Promise<PreStepDecision> {
  const decision = await next()
  if (decision.kind === 'reject') return decision
  const pastedSetting = ignorePastedMentions()
  const cleanMessages = pastedSetting
    ? decision.messages.map(message => {
      if (message.source.kind !== USER_SOURCE_KIND) return message
      let changed = false
      const content = message.content.map(block => {
        if (block.type !== 'text' || !block.text.includes(PASTED_MENTION_MARKER)) return block
        changed = true
        return { ...block, text: stripPastedMentionMarkers(block.text) }
      })
      return changed ? { ...message, content } : message
    })
    : decision.messages
  if (!isEnabled()) {
    return cleanMessages === decision.messages ? decision : { kind: 'enter', messages: cleanMessages }
  }
  const injections = await expandMentions(messages, agent.session.header.cwd, signal, pastedSetting)
  if (injections.length === 0) {
    return cleanMessages === decision.messages ? decision : { kind: 'enter', messages: cleanMessages }
  }
  return { kind: 'enter', messages: [...cleanMessages, ...injections] }
}
