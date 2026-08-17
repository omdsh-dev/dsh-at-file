/**
 * The '@' input-trigger source: turns the ui-input-trigger pipeline into the
 * Codex-style file picker. `candidates` serves the smart-searched rows (the
 * workspace index is fetched once per session and filtered locally per
 * keystroke); `onPick` lands the plain-text `@path` reference — the draft
 * keeps a readable token (no chip), and the Host's pre-step boundary validates
 * it as an existence-only workspace reference. Pure factory over injected
 * deps: the browser bundle wires the real Remote and clock, tests wire stubs.
 */
import type { InputTriggerCandidate, InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { basenameOf, dirnameOf } from './model.ts'
import { rankFiles } from './search.ts'
import { fileIcon } from './icons.tsx'
import type { FileEntry } from './remote.ts'
import { PASTED_MENTION_MARKER } from '../paste.ts'

declare module '@deepseek-ai/dsh-client-ui-input-trigger/client' {
  interface InputTriggerCandidate {
    /** Source-owned stable value when the visible name is only a display label. */
    readonly value?: string
    /** Indexed path kind used by source-owned keyboard navigation. */
    readonly atFileKind?: FileEntry['kind']
  }
}

/** Owner source name (the lexicon and decoration routing key). */
export const SOURCE_NAME = 'at-file'

/** Design cap on visible picker rows (menu height mirrors the slash menu). */
export const MAX_CANDIDATES = 12

/** How long one session's index stays hot before the next menu open refetches. */
export const INDEX_TTL_MS = 30_000

/** Per-session index fetch: the shared promise, its abort handle, and the settled snapshot. */
interface IndexCache {
  readonly promise: Promise<readonly FileEntry[]>
  readonly abort: AbortController
  /** Settled snapshot backing synchronous reads (lexicon); unset while in flight. */
  settled?: readonly FileEntry[]
  /** Monotonic clock reading at fetch start (TTL base). */
  readonly at: number
}

/** Everything the source needs that the browser bundle supplies (tests stub). */
export interface AtFileSourceDeps {
  /** Search the addressed session's workspace index (Remote wrapper). */
  search(sessionId: SessionId, signal: AbortSignal): Promise<readonly FileEntry[]>
  /** Monotonic clock for index freshness (default Date.now). */
  now?: () => number
}

/** The registered source plus the cache teardown the wiring layer owns. */
export interface AtFileSource {
  readonly source: InputTriggerSource
  /** Drop every per-session cache and path map (connection reset). */
  invalidateAll(): void
}

/** One picker row with a stable workspace-relative value. */
interface AtFileCandidate extends InputTriggerCandidate {
  readonly value: string
}

/** Project ranked entries into filename-first, duplicate-safe menu rows. */
function candidateRows(files: readonly FileEntry[]): readonly AtFileCandidate[] {
  const counts = new Map<string, number>()
  for (const file of files) {
    const basename = basenameOf(file.relative)
    counts.set(basename, (counts.get(basename) ?? 0) + 1)
  }
  return files.map(file => {
    const basename = basenameOf(file.relative)
    const directory = dirnameOf(file.relative)
    const duplicate = (counts.get(basename) as number) > 1
    return {
      name: duplicate && directory !== '' ? `${basename} - ${directory}` : basename,
      value: file.relative,
      atFileKind: file.kind,
      // The standing contract types icons as text. React renders this in-memory
      // element directly; no icon markup crosses the Host boundary.
      icon: fileIcon(file) as unknown as string,
      ...(directory === '' ? {} : { description: directory }),
    }
  })
}

/**
 * Build the '@' trigger source over the injected deps. One source per plugin
 * fiber; per-session caches live in the returned closure and die with it.
 * @param deps - Remote, locale, and clock faces.
 * @returns the source to register with `inputTriggers.registerSource`, plus
 *   the cache invalidator.
 */
export function createAtFileSource(deps: AtFileSourceDeps): AtFileSource {
  const now = deps.now ?? (() => Date.now())
  const fetches = new Map<SessionId, IndexCache>()
  const lexiconListeners = new Map<SessionId, Set<() => void>>()

  const notifyLexicon = (sessionId: SessionId): void => {
    for (const listener of [...(lexiconListeners.get(sessionId) ?? [])]) {
      try {
        listener()
      } catch (error) {
        // Contain listener failures: settlement notifies from an ignored
        // promise chain, and one faulty consumer must not starve the others.
        console.error('[dsh-at-file] lexicon listener failed:', error)
      }
    }
  }

  const fetchIndex = (sessionId: SessionId, signal?: AbortSignal): Promise<readonly FileEntry[]> => {
    const existing = fetches.get(sessionId)
    const fresh = existing !== undefined && now() - existing.at < INDEX_TTL_MS
    if (fresh) {
      if (existing.settled !== undefined) return Promise.resolve(existing.settled)
      // In flight and fresh: join it. The candidate caller's own signal is
      // superseded per keystroke; the shared fetch outlives the menu.
      return existing.promise
    }
    if (existing !== undefined) {
      fetches.delete(sessionId)
      existing.abort.abort()
    }
    const abort = new AbortController()
    const promise = deps.search(sessionId, abort.signal)
    const entry: IndexCache = { promise, abort, at: now() }
    fetches.set(sessionId, entry)
    promise.then(
      (files) => {
        entry.settled = files
        notifyLexicon(sessionId)
      },
      () => {
        // A failed fetch must not poison the key: the next consumer retries.
        if (fetches.get(sessionId) === entry) fetches.delete(sessionId)
      },
    )
    if (signal !== undefined) {
      // A superseded keystroke just yields early; the shared fetch stays warm
      // and its own handlers already contain its settlement.
      return promise.then(files => (signal.aborted ? [] : files))
    }
    return promise
  }

  const findEntry = (sessionId: SessionId, relative: string): FileEntry | undefined =>
    fetches.get(sessionId)?.settled?.find(file => file.relative === relative)

  const invalidateAll = (): void => {
    for (const [key, entry] of [...fetches]) {
      fetches.delete(key)
      entry.abort.abort()
    }
    for (const listeners of [...lexiconListeners.values()]) {
      for (const listener of listeners) listener()
    }
  }

  const source: InputTriggerSource = {
    trigger: '@',
    name: SOURCE_NAME,
    async candidates(session, { query, signal }) {
      // A protected query came from pasted text. Keep the menu closed from the
      // plugin's point of view instead of treating it as a file lookup.
      if (query.includes(PASTED_MENTION_MARKER)) return []
      const files = await fetchIndex(session.sessionId, signal)
      if (signal.aborted) return []
      return candidateRows(rankFiles(files, query, MAX_CANDIDATES))
    },
    warm(session) {
      // Fire-and-forget scope-birth prewarm; the shared fetch reports
      // through candidates.
      fetchIndex(session.sessionId).catch(() => {})
    },
    onPick({ candidate, session }) {
      const file = candidate.value === undefined ? undefined : findEntry(session.sessionId, candidate.value)
      if (file === undefined) return undefined
      // Plain-text reference: the draft gains the readable @path token. A
      // trailing slash marks a directory mention without reading descendants.
      const suffix = file.kind === 'dir' ? '/' : ''
      return { text: `@${file.relative}${suffix} ` }
    },
    lexicon(session) {
      return fetches.get(session.sessionId)?.settled?.map(file => file.relative)
    },
    subscribeLexicon(session, listener) {
      const key = session.sessionId
      const listeners = lexiconListeners.get(key) ?? new Set()
      listeners.add(listener)
      lexiconListeners.set(key, listeners)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) lexiconListeners.delete(key)
      }
    },
  }

  return { source, invalidateAll }
}
