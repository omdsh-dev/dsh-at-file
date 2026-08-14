/** Filter normalization shared by the Host and browser settings surface. */
import { describe, expect, it } from 'vitest'
import {
  compileIgnoreRules,
  effectiveIgnoreFiles,
  ignoreRuleKey,
  ignoreFilesSettingsKey,
  normalizeIgnoreFiles,
  normalizeIgnoreRule,
  normalizeWorkspaceIgnoreFiles,
  workspaceIgnoreFilesFor,
  workspacePathKey,
} from '../src/defaults.ts'
import type { AtFileSettings } from '../src/contract.ts'

function settings(over: Partial<AtFileSettings> = {}): AtFileSettings {
  return {
    enabled: true,
    ignoreFiles: [],
    workspaceIgnoreFiles: [],
    ...over,
  }
}

describe('workspace file filters', () => {
  it('normalizes legacy and structured rules while preserving their wire shape', () => {
    expect(normalizeIgnoreFiles([
      ' Legacy.tmp ',
      'legacy.TMP',
      { kind: 'exact', pattern: 'Case.tmp', caseSensitive: true },
      { kind: 'regex', pattern: ' \\.map$ ', caseSensitive: false },
      { kind: 'regex', pattern: '\\.map$', caseSensitive: false },
      '',
      { kind: 'exact', pattern: ' ', caseSensitive: false },
    ])).toEqual([
      'Legacy.tmp',
      { kind: 'exact', pattern: 'Case.tmp', caseSensitive: true },
      { kind: 'regex', pattern: '\\.map$', caseSensitive: false },
    ])
    expect(normalizeIgnoreRule('')).toBeUndefined()
    expect(ignoreRuleKey('')).toBe('')
    expect(compileIgnoreRules(['one.tmp'])).toEqual([
      { kind: 'exact', pattern: 'one.tmp', caseSensitive: false },
    ])
  })

  it('rejects invalid regular expressions during normalization', () => {
    expect(() => normalizeIgnoreFiles([{ kind: 'regex', pattern: '[', caseSensitive: false }]))
      .toThrow(/Invalid regular expression/)
  })

  it('normalizes Windows separators, drive casing, and trailing slashes', () => {
    expect(workspacePathKey('C:\\Users\\Liang\\Project\\')).toBe('c:/users/liang/project')
    expect(workspacePathKey('c:/users/liang/project')).toBe('c:/users/liang/project')
    expect(workspacePathKey('C:/')).toBe('c:/')
    expect(workspacePathKey('\\\\Server\\Share\\Project\\')).toBe('//server/share/project')
  })

  it('preserves POSIX case while removing trailing separators', () => {
    expect(workspacePathKey('/Users/Margoo/Project/')).toBe('/Users/Margoo/Project')
    expect(workspacePathKey('/users/margoo/project')).toBe('/users/margoo/project')
    expect(workspacePathKey('/')).toBe('/')
  })

  it('drops empty workspace rows and merges duplicate canonical paths', () => {
    expect(normalizeWorkspaceIgnoreFiles([
      { workspace: '', ignoreFiles: ['unused.tmp'] },
      { workspace: 'C:\\Work\\App', ignoreFiles: ['one.tmp', 'ONE.TMP'] },
      { workspace: 'c:/work/app/', ignoreFiles: ['two.tmp'] },
    ])).toEqual([
      { workspace: 'C:\\Work\\App', ignoreFiles: ['one.tmp', 'two.tmp'] },
    ])
  })

  it('returns only rules attached to the addressed workspace', () => {
    const entries = [
      { workspace: '/work/one', ignoreFiles: ['one.tmp'] },
      { workspace: '/work/two', ignoreFiles: ['two.tmp'] },
    ]
    expect(workspaceIgnoreFilesFor(entries, '/work/two/')).toEqual(['two.tmp'])
    expect(workspaceIgnoreFilesFor(entries, '/work/three')).toEqual([])
  })

  it('combines global and local rules without case-insensitive duplicates', () => {
    expect(effectiveIgnoreFiles(settings({
      ignoreFiles: ['global.tmp', 'shared.tmp'],
      workspaceIgnoreFiles: [{ workspace: '/work/one', ignoreFiles: ['SHARED.TMP', 'local.tmp'] }],
    }), '/work/one')).toEqual(['global.tmp', 'shared.tmp', 'local.tmp'])
    const legacy = { enabled: true, ignoreFiles: ['legacy.tmp'] } as AtFileSettings
    expect(effectiveIgnoreFiles(legacy, '/work/one')).toEqual(['legacy.tmp'])
  })

  it('builds an order-independent cache key covering every scope', () => {
    const first = settings({
      ignoreFiles: ['B.tmp', 'a.tmp'],
      workspaceIgnoreFiles: [
        { workspace: '/work/two', ignoreFiles: ['z.tmp'] },
        { workspace: '/work/one', ignoreFiles: ['B.tmp', 'a.tmp'] },
      ],
    })
    const reordered = settings({
      ignoreFiles: ['A.TMP', 'b.tmp'],
      workspaceIgnoreFiles: [
        { workspace: '/work/one', ignoreFiles: ['A.tmp', 'b.tmp'] },
        { workspace: '/work/two', ignoreFiles: ['Z.TMP'] },
      ],
    })
    expect(ignoreFilesSettingsKey(first)).toBe(ignoreFilesSettingsKey(reordered))
    expect(ignoreFilesSettingsKey(first)).not.toBe(ignoreFilesSettingsKey(settings({
      ...reordered,
      workspaceIgnoreFiles: [{ workspace: '/work/one', ignoreFiles: ['changed.tmp'] }],
    })))
    expect(ignoreFilesSettingsKey({ enabled: true, ignoreFiles: ['legacy.tmp'] } as AtFileSettings))
      .toBe(ignoreFilesSettingsKey(settings({ ignoreFiles: ['legacy.tmp'] })))
    expect(ignoreFilesSettingsKey(settings({
      ignoreFiles: [{ kind: 'regex', pattern: '\\.TS$', caseSensitive: true }],
    }))).not.toBe(ignoreFilesSettingsKey(settings({
      ignoreFiles: [{ kind: 'regex', pattern: '\\.TS$', caseSensitive: false }],
    })))
  })
})
