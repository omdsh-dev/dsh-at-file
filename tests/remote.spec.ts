/**
 * The hand-written Remote contribution's boundary discipline: the descriptor
 * is strict, its codecs accept the exact wire values the host emits, and
 * reject malformed ones. This mirrors what the Client Gateway's own
 * `requireStrictDescriptor` demands at mount time.
 */
import { describe, expect, it } from 'vitest'
import { AT_FILE_REMOTE } from '../src/client/remote.ts'

describe('AT_FILE_REMOTE', () => {
  it('owns search and the plugin settings endpoints', () => {
    expect(AT_FILE_REMOTE.package).toBe('dsh-at-file')
    expect(AT_FILE_REMOTE.descriptors.map(descriptor => `${descriptor.namespace}/${descriptor.method}`))
      .toEqual(['atFile/search', 'atFile/getSettings', 'atFile/updateSettings'])
  })

  it('declares strict codecs on every parameter and result', () => {
    for (const descriptor of AT_FILE_REMOTE.descriptors) {
      expect(descriptor.result.mode).toBe('strict')
      for (const parameter of descriptor.parameters) expect(parameter.codec.mode).toBe('strict')
    }
  })

  it('routes search through the agent lookup with a trailing signal', () => {
    const search = AT_FILE_REMOTE.descriptors[0]!
    expect(search.invocation).toEqual({ kind: 'direct' })
    expect(search.cancellation).toEqual({ parameter: 'signal' })
    expect(search.parameters).toHaveLength(1)
    expect(search.parameters[0]).toMatchObject({ name: 'agent', wire: 'agentId', source: 'lookup', lookup: 'agent' })
  })

  it('routes one strict JSON field update to the settings writer', () => {
    const update = AT_FILE_REMOTE.descriptors[2]!
    expect(update.invocation).toEqual({ kind: 'direct' })
    expect(update.parameters).toHaveLength(1)
    expect(update.parameters[0]).toMatchObject({ name: 'update', wire: 'update', source: 'json' })
    const schema = update.parameters[0]!.codec.schema as { parse(value: unknown): unknown }
    expect(schema.parse({ field: 'enabled', value: false })).toEqual({ field: 'enabled', value: false })
    expect(schema.parse({ field: 'workspaceIgnoreFiles', value: [{ workspace: '/ws', ignoreFiles: ['a.tmp'] }] }))
      .toEqual({ field: 'workspaceIgnoreFiles', value: [{ workspace: '/ws', ignoreFiles: ['a.tmp'] }] })
    expect(schema.parse({
      field: 'ignoreFiles',
      value: [
        { kind: 'exact', pattern: 'Case.tmp', caseSensitive: true },
        { kind: 'regex', pattern: '\\.map$', caseSensitive: false },
        { kind: 'regex', pattern: '\\.MAP$', caseSensitive: true },
      ],
    })).toEqual({
      field: 'ignoreFiles',
      value: [
        { kind: 'exact', pattern: 'Case.tmp', caseSensitive: true },
        { kind: 'regex', pattern: '\\.map$', caseSensitive: false },
        { kind: 'regex', pattern: '\\.MAP$', caseSensitive: true },
      ],
    })
    expect(() => schema.parse({ field: 'ignoreFiles', value: [{ kind: 'regex', pattern: '[', caseSensitive: false }] })).toThrow()
    expect(() => schema.parse({ field: 'enabled', value: 'false' })).toThrow()
  })

  it('search codecs accept host entries (files and directories) and reject malformed rows', () => {
    const schema = AT_FILE_REMOTE.descriptors[0]!.result.schema as { parse(value: unknown): unknown }
    expect(schema.parse([{ path: '/ws/a.ts', relative: 'a.ts', kind: 'file' }, { path: '/ws/src', relative: 'src', kind: 'dir' }]))
      .toEqual([{ path: '/ws/a.ts', relative: 'a.ts', kind: 'file' }, { path: '/ws/src', relative: 'src', kind: 'dir' }])
    expect(() => schema.parse([{ path: '/ws/a.ts', relative: 'a.ts' }])).toThrow()
    expect(() => schema.parse([{ path: '', relative: 'a.ts', kind: 'file' }])).toThrow()
    expect(() => schema.parse('nope')).toThrow()
  })

  it('settings codecs reject incomplete resolved sections', () => {
    const schema = AT_FILE_REMOTE.descriptors[1]!.result.schema as { parse(value: unknown): unknown }
    expect(schema.parse({ enabled: true, ignoreFiles: [], workspaceIgnoreFiles: [] }))
      .toEqual({ enabled: true, ignoreFiles: [], workspaceIgnoreFiles: [] })
    expect(() => schema.parse({ enabled: true, ignoreFiles: [] })).toThrow()
  })
})
