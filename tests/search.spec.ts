/**
 * Pure projection behaviors: the @file smart-search ranking and the model-form
 * / path helpers. Deterministic fixtures only — the ranking must stay stable
 * per keystroke (ties break by kind, length, then lexicographically).
 */
import { describe, expect, it } from 'vitest'
import { rankFiles } from '../src/client/search.ts'
import { basenameOf, dirnameOf } from '../src/client/model.ts'
import type { FileEntry } from '../src/client/remote.ts'

function entry(relative: string, kind: 'file' | 'dir' = 'file'): FileEntry {
  return { path: `/ws/${relative}`, relative, kind }
}

const FILES: readonly FileEntry[] = [
  entry('README.md'),
  entry('src', 'dir'),
  entry('src/index.ts'),
  entry('src/lint/check.ts'),
  entry('src/lint/run.ts'),
  entry('tests/view.spec.ts'),
]

describe('rankFiles', () => {
  it('lists directories first, then files, each alphabetical, on an empty query', () => {
    expect(rankFiles(FILES, '', 3)).toEqual([
      entry('src', 'dir'),
      entry('README.md'),
      entry('src/index.ts'),
    ])
    expect(rankFiles([entry('src', 'dir'), entry('README.md')], '', 2)).toEqual([
      entry('src', 'dir'),
      entry('README.md'),
    ])
  })

  it('matches a case-insensitive compact subsequence in the basename', () => {
    expect(rankFiles(FILES, 'VST', 3)).toEqual([entry('tests/view.spec.ts')])
  })

  it('does not spread a plain query across directory segments', () => {
    const android = [
      entry('app/build/kspCaches/HugeOutput/Objects/Cache/online/result.bin'),
      entry('app/src/main/java/com/example/HooConfig.kt'),
    ]
    expect(rankFiles(android, 'HooCon', 12)).toEqual([
      entry('app/src/main/java/com/example/HooConfig.kt'),
    ])
  })

  it('matches slash-separated query segments in path order', () => {
    expect(rankFiles(FILES, 'src/in', 3)).toEqual([
      entry('src/index.ts'),
      entry('src/lint/run.ts'),
      entry('src/lint/check.ts'),
    ])
    expect(rankFiles(FILES, 'src\\in', 1)).toEqual([entry('src/index.ts')])
    expect(rankFiles(FILES, 'src/', 3)).toEqual([
      entry('src/index.ts'),
      entry('src/lint/run.ts'),
      entry('src/lint/check.ts'),
    ])
    expect(rankFiles(FILES, 'missing/', 3)).toEqual([])
  })

  it('returns only the files the query matches', () => {
    expect(rankFiles(FILES, 'view', 3)).toEqual([entry('tests/view.spec.ts')])
  })

  it('drops files the query does not match', () => {
    expect(rankFiles(FILES, 'zzz', 3)).toEqual([])
    expect(rankFiles(FILES, 'src/missing', 3)).toEqual([])
    expect(rankFiles(FILES, '/', 3)).toEqual([])
  })

  it('respects the limit and never reorders equal-score files', () => {
    expect(rankFiles(FILES, 'ts', 2)).toEqual([
      entry('src/lint/run.ts'),
      entry('src/index.ts'),
    ])
  })

  it('breaks equal scores by length, then lexicographically', () => {
    const tied = [
      entry('deep/nested/x.ts'),
      entry('x.ts'),
      entry('src/a/x.ts'),
      entry('src/b/x.ts'),
    ]
    expect(rankFiles(tied, 'x', 4)).toEqual([
      entry('x.ts'),
      entry('src/a/x.ts'),
      entry('src/b/x.ts'),
      entry('deep/nested/x.ts'),
    ])
    expect(rankFiles([entry('src/b/x.ts'), entry('src/a/x.ts')], 'x', 2)).toEqual([
      entry('src/a/x.ts'),
      entry('src/b/x.ts'),
    ])
  })

  it('places files before directories when query scores tie', () => {
    expect(rankFiles([entry('same', 'dir'), entry('same')], 'same', 2)).toEqual([
      entry('same'),
      entry('same', 'dir'),
    ])
  })

  it('orders exact, prefix, substring, and subsequence basename matches', () => {
    const ranked = [
      entry('a/h_x_o_x_o.txt'),
      entry('b/HooConfig.kt'),
      entry('c/MyHooConfig.kt'),
      entry('d/hoo'),
    ]
    expect(rankFiles(ranked, 'hoo', 4)).toEqual([
      entry('d/hoo'),
      entry('b/HooConfig.kt'),
      entry('c/MyHooConfig.kt'),
      entry('a/h_x_o_x_o.txt'),
    ])
  })

  it('treats whitespace-only queries as empty', () => {
    expect(rankFiles(FILES, '   ', 1)).toEqual([entry('src', 'dir')])
  })
})

describe('path projections', () => {
  it('splits basename and directory with forward slashes', () => {
    expect(basenameOf('src/client/view.ts')).toBe('view.ts')
    expect(dirnameOf('src/client/view.ts')).toBe('src/client')
  })

  it('treats root-level files as directory-less', () => {
    expect(basenameOf('README.md')).toBe('README.md')
    expect(dirnameOf('README.md')).toBe('')
  })
})
