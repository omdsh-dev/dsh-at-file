/**
 * The '@' trigger source over stubbed deps: candidate search via the
 * cached session index (per-keystroke filtering stays local), plain-text path
 * picks, lexicon rolls, and invalidation.
 */
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientSessionContext } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { createAtFileSource, INDEX_TTL_MS, MAX_CANDIDATES, SOURCE_NAME } from '../src/client/source.ts'
import type { FileEntry } from '../src/client/remote.ts'
import { fileIconKind } from '../src/client/icons.tsx'
import { fmt } from '../src/client/locales.ts'
import { protectPastedMentions } from '../src/paste.ts'

const sid = (value: string): SessionId => value as SessionId
const session = (id: string): ClientSessionContext => ({ sessionId: sid(id) })

const FILES: readonly FileEntry[] = [
  { path: '/ws/README.md', relative: 'README.md', kind: 'file' },
  { path: '/ws/src', relative: 'src', kind: 'dir' },
  { path: '/ws/src/index.ts', relative: 'src/index.ts', kind: 'file' },
  { path: '/ws/src/client/view.ts', relative: 'src/client/view.ts', kind: 'file' },
]

function harness(overrides: Partial<ConstructorParameters<typeof createAtFileSource>[0]> = {}) {
  const search = vi.fn(async (_id: SessionId) => FILES)
  let clock = 0
  const { source, invalidateAll } = createAtFileSource({ search, now: () => clock, ...overrides })
  return { source, invalidateAll, search, tick: (ms: number) => { clock += ms } }
}

describe('@file candidates', () => {
  it('does not search for a token that came from pasted text', async () => {
    const { source, search } = harness()
    const rows = await source.candidates(session('s1'), {
      query: protectPastedMentions('@README.md').slice(1),
      position: 'inline',
      signal: new AbortController().signal,
    })
    expect(rows).toEqual([])
    expect(search).not.toHaveBeenCalled()
  })
  it('fetches the session index once and filters per keystroke locally', async () => {
    const { source, search } = harness()
    const first = await source.candidates(session('s1'), { query: 'view', position: 'inline', signal: new AbortController().signal })
    expect(first.map(item => item.name)).toEqual(['view.ts'])
    const second = await source.candidates(session('s1'), { query: 'README', position: 'inline', signal: new AbortController().signal })
    expect(second.map(item => item.name)).toEqual(['README.md'])
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('shows the basename first while retaining the full relative path as its value', async () => {
    const { source } = harness()
    const rows = await source.candidates(session('s1'), { query: 'view', position: 'inline', signal: new AbortController().signal })
    expect(rows[0]).toMatchObject({ name: 'view.ts', value: 'src/client/view.ts', atFileKind: 'file', description: 'src/client' })
    expect(fileIconKind(FILES[3]!)).toBe('code')
  })

  it('keeps a directory value and omits a root-level description', async () => {
    const { source } = harness()
    const rows = await source.candidates(session('s1'), { query: 'src', position: 'inline', signal: new AbortController().signal })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'src', value: 'src', atFileKind: 'dir' })
    expect(rows[0]!.description).toBeUndefined()
  })

  it('omits the directory description for root-level files', async () => {
    const { source } = harness()
    const rows = await source.candidates(session('s1'), { query: 'README', position: 'inline', signal: new AbortController().signal })
    expect(rows[0]).toMatchObject({ name: 'README.md', value: 'README.md' })
    expect(rows[0]!.description).toBeUndefined()
  })

  it('adds the parent directory to duplicate basename labels', async () => {
    const duplicates: readonly FileEntry[] = [
      { path: '/ws/src/view.ts', relative: 'src/view.ts', kind: 'file' },
      { path: '/ws/tests/view.ts', relative: 'tests/view.ts', kind: 'file' },
    ]
    const { source } = harness({ search: vi.fn(async () => duplicates) })
    const rows = await source.candidates(session('s1'), { query: 'view', position: 'inline', signal: new AbortController().signal })
    expect(rows.map(row => ({ name: row.name, value: row.value, description: row.description }))).toEqual([
      { name: 'view.ts - src', value: 'src/view.ts', description: 'src' },
      { name: 'view.ts - tests', value: 'tests/view.ts', description: 'tests' },
    ])
  })

  it('keeps a root-level duplicate label concise', async () => {
    const duplicates: readonly FileEntry[] = [
      { path: '/ws/view.ts', relative: 'view.ts', kind: 'file' },
      { path: '/ws/src/view.ts', relative: 'src/view.ts', kind: 'file' },
    ]
    const { source } = harness({ search: vi.fn(async () => duplicates) })
    const rows = await source.candidates(session('s1'), { query: 'view', position: 'inline', signal: new AbortController().signal })
    expect(rows.map(row => row.name)).toEqual(['view.ts', 'view.ts - src'])
  })

  it('joins an in-flight fresh fetch instead of refetching', async () => {
    let resolveSearch: (files: readonly FileEntry[]) => void = () => {}
    const search = vi.fn(() => new Promise<readonly FileEntry[]>(resolve => { resolveSearch = resolve }))
    const { source } = harness({ search })
    const first = source.candidates(session('s1'), { query: '', position: 'leading', signal: new AbortController().signal })
    const second = source.candidates(session('s1'), { query: '', position: 'leading', signal: new AbortController().signal })
    resolveSearch(FILES)
    await expect(first).resolves.toHaveLength(4)
    await expect(second).resolves.toHaveLength(4)
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('caps the visible rows at the design limit', async () => {
    const many: FileEntry[] = Array.from({ length: MAX_CANDIDATES + 5 }, (_, index) => ({
      path: `/ws/f${String(index).padStart(2, '0')}.ts`,
      relative: `f${String(index).padStart(2, '0')}.ts`,
      kind: 'file',
    }))
    const { source } = harness({ search: vi.fn(async () => many) })
    const rows = await source.candidates(session('s1'), { query: '', position: 'leading', signal: new AbortController().signal })
    expect(rows).toHaveLength(MAX_CANDIDATES)
  })

  it('yields nothing when a superseded keystroke aborts the caller', async () => {
    const { source } = harness()
    const controller = new AbortController()
    const pending = source.candidates(session('s1'), { query: '', position: 'leading', signal: controller.signal })
    controller.abort()
    await expect(pending).resolves.toEqual([])
  })

  it('refetches once the index grows stale beyond the TTL', async () => {
    const { source, search, tick } = harness()
    await source.candidates(session('s1'), { query: '', position: 'leading', signal: new AbortController().signal })
    tick(INDEX_TTL_MS + 1)
    await source.candidates(session('s1'), { query: '', position: 'leading', signal: new AbortController().signal })
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('drops a failed fetch so the next consumer retries', async () => {
    const search = vi.fn(async () => {
      if (search.mock.calls.length === 1) throw new Error('down')
      return FILES
    })
    const { source } = harness({ search })
    await expect(source.candidates(session('s1'), { query: '', position: 'leading', signal: new AbortController().signal }))
      .rejects.toThrow('down')
    const retried = await source.candidates(session('s1'), { query: '', position: 'leading', signal: new AbortController().signal })
    expect(retried).toHaveLength(4)
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('prewarms through the signal-less fetch path and contains a warm failure', async () => {
    const search = vi.fn(async () => { throw new Error('down') })
    const { source } = harness({ search })
    source.warm!(session('s1'))
    // The fire-and-forget warmup must not surface as a rejection.
    await Promise.resolve()
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('a failed fetch whose slot was replaced leaves the newer entry in place', async () => {
    let rejectFirst: (error: Error) => void = () => {}
    let resolveSecond: (files: readonly FileEntry[]) => void = () => {}
    const search = vi.fn(() => (search.mock.calls.length === 1
      ? new Promise<readonly FileEntry[]>((_resolve, reject) => { rejectFirst = reject })
      : new Promise<readonly FileEntry[]>(resolve => { resolveSecond = resolve })))
    const { source, invalidateAll } = harness({ search })
    const first = source.candidates(session('s1'), { query: '', position: 'leading', signal: new AbortController().signal })
    invalidateAll()
    // The failure handler runs after the key already points at a newer entry,
    // so it must not delete that entry (its stale-entry guard).
    rejectFirst(new Error('down'))
    const second = source.candidates(session('s1'), { query: '', position: 'leading', signal: new AbortController().signal })
    resolveSecond(FILES)
    await expect(first).rejects.toThrow('down')
    await expect(second).resolves.toHaveLength(4)
  })
})

describe('@file picks', () => {
  it('lands the plain-text @path reference for a file', async () => {
    const { source } = harness()
    await source.candidates(session('s1'), { query: 'view', position: 'inline', signal: new AbortController().signal })
    const outcome = source.onPick({
      candidate: { name: 'view.ts', value: 'src/client/view.ts', description: 'src/client' },
      session: session('s1'),
      position: 'inline',
      via: 'menu',
      span: { start: 0, end: 1, draftRev: 4 },
    })
    expect(outcome).toEqual({ text: '@src/client/view.ts ' })
  })

  it('lands a trailing-slash @path for a directory', async () => {
    const { source } = harness()
    await source.candidates(session('s1'), { query: 'src', position: 'inline', signal: new AbortController().signal })
    const outcome = source.onPick({
      candidate: { name: 'src', value: 'src' },
      session: session('s1'),
      position: 'inline',
      via: 'menu',
      span: { start: 0, end: 1, draftRev: 4 },
    })
    expect(outcome).toEqual({ text: '@src/ ' })
  })

  it('misses cleanly when the candidate no longer resolves', () => {
    const { source } = harness()
    expect(source.onPick({
      candidate: { name: 'gone.ts', value: 'gone.ts' },
      session: session('s1'),
      position: 'inline',
      via: 'menu',
      span: { start: 0, end: 1, draftRev: 1 },
    })).toBeUndefined()
  })

  it('misses cleanly when a candidate has no source-owned value', () => {
    const { source } = harness()
    expect(source.onPick({
      candidate: { name: 'view.ts' },
      session: session('s1'),
      position: 'inline',
      via: 'menu',
      span: { start: 0, end: 1, draftRev: 1 },
    })).toBeUndefined()
  })
})

describe('@file lexicon and teardown', () => {
  it('serves the settled index as the @ decoration roll and notifies subscribers', async () => {
    const { source } = harness()
    const notified = vi.fn()
    const off = source.subscribeLexicon!(session('s1'), notified)
    expect(source.lexicon!(session('s1'))).toBeUndefined()
    await source.candidates(session('s1'), { query: '', position: 'leading', signal: new AbortController().signal })
    expect(source.lexicon!(session('s1'))).toEqual(['README.md', 'src', 'src/index.ts', 'src/client/view.ts'])
    expect(notified).toHaveBeenCalled()
    off()
    expect(notified).toHaveBeenCalledTimes(1)
  })

  it('contains a throwing lexicon listener and still notifies the rest', async () => {
    const { source } = harness()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const notified = vi.fn()
    source.subscribeLexicon!(session('s1'), () => { throw new Error('boom') })
    source.subscribeLexicon!(session('s1'), notified)
    await source.candidates(session('s1'), { query: '', position: 'leading', signal: new AbortController().signal })
    expect(notified).toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('[dsh-at-file] lexicon listener failed:', expect.any(Error))
    errorSpy.mockRestore()
  })

  it('unsubscribing one of several listeners keeps the rest registered', async () => {
    const { source } = harness()
    const first = vi.fn()
    const second = vi.fn()
    const offFirst = source.subscribeLexicon!(session('s1'), first)
    source.subscribeLexicon!(session('s1'), second)
    offFirst()
    await source.candidates(session('s1'), { query: '', position: 'leading', signal: new AbortController().signal })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalled()
  })

  it('invalidateAll aborts in-flight fetches, clears caches, and notifies listeners', async () => {
    const { source, invalidateAll, search } = harness()
    const notified = vi.fn()
    source.subscribeLexicon!(session('s1'), notified)
    const pending = source.candidates(session('s1'), { query: '', position: 'leading', signal: new AbortController().signal })
    await pending
    invalidateAll()
    expect(search).toHaveBeenCalledTimes(1)
    // The cache is cold again: a fresh candidates pass refetches.
    await source.candidates(session('s1'), { query: '', position: 'leading', signal: new AbortController().signal })
    expect(search).toHaveBeenCalledTimes(2)
  })
})

describe('locale templates', () => {
  it('leaves unknown placeholders verbatim', () => {
    expect(fmt('x {a} {b}', { a: '1' })).toBe('x 1 {b}')
  })
})
