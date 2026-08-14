/**
 * The Host pre-step mention expansion: token recognition, workspace
 * confinement, file vs directory content injection, and the unknown-path /
 * non-user-source skips.
 */
import { chmod, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { expandMentions, mentionPreStep, scanMentions } from '../src/mention.ts'
import type { ResolvedConfig } from '../src/types.ts'

const CONFIG: ResolvedConfig = {
  maxIndexedFiles: 100,
  maxFileBytes: 1024,
  maxTotalBytes: 1024,
  directoryMode: 'manifest',
  ignoreDirs: ['.git', 'node_modules'],
}

function user(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

describe('scanMentions', () => {
  it('recognizes @path tokens, strips the directory slash, and deduplicates', () => {
    expect(scanMentions('fix @src/index.ts and @docs/ ')).toEqual(['src/index.ts', 'docs'])
    expect(scanMentions('@a.ts again @a.ts')).toEqual(['a.ts'])
  })
})

describe('expandMentions', () => {
  it('injects one file block per mentioned file, tagged with its source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-mention-'))
    await writeFile(join(root, 'a.ts'), 'content\n')
    try {
      const injections = await expandMentions([user('read @a.ts')], root, CONFIG, new AbortController().signal)
      expect(injections).toHaveLength(1)
      expect(injections[0]!.source).toEqual({ kind: 'at-file-mention', relative: 'a.ts' })
      expect(injections[0]!.content[0]).toEqual({ type: 'text', text: '<file path="a.ts">\ncontent\n</file>' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('escapes a mentioned path when it is serialized as an attribute', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-mention-'))
    await writeFile(join(root, 'a&b".txt'), 'content\n')
    try {
      const injections = await expandMentions([user('read @a&b".txt')], root, CONFIG, new AbortController().signal)
      expect(injections[0]!.content[0]).toEqual({
        type: 'text',
        text: '<file path="a&amp;b&quot;.txt">\ncontent\n</file>',
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('injects a bounded metadata manifest for a directory by default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-mention-'))
    await mkdir(join(root, 'src', 'nested'), { recursive: true })
    await writeFile(join(root, 'src', 'a.ts'), 'a\n')
    await writeFile(join(root, 'src', 'nested', 'b.ts'), 'b\n')
    try {
      const injections = await expandMentions([user('attach @src/')], root, CONFIG, new AbortController().signal)
      expect(injections).toHaveLength(1)
      expect(injections[0]!.content[0]).toEqual({
        type: 'text',
        text: '<directory path="src" mode="manifest" truncated="false" included-entries="3" omitted-entries="0" max-total-bytes="1024">\n' +
          '<entry path="src/a.ts" type="file" size="2" />\n' +
          '<entry path="src/nested" type="directory" />\n' +
          '<entry path="src/nested/b.ts" type="file" size="2" />\n' +
          '</directory>',
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('normalizes a missing trailing newline and marks directory truncation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-mention-'))
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'a.ts'), 'no-newline')
    await writeFile(join(root, 'src', 'a.ts'), 'a')
    await writeFile(join(root, 'src', 'b.ts'), 'b')
    try {
      const files = await expandMentions([user('read @a.ts')], root, CONFIG, new AbortController().signal)
      expect(files[0]!.content[0]).toEqual({ type: 'text', text: '<file path="a.ts">\nno-newline\n</file>' })
      // A directory cut by the cap folds in the truncation marker.
      const smallConfig: ResolvedConfig = { ...CONFIG, maxIndexedFiles: 1 }
      const dir = await expandMentions([user('attach @src/')], root, smallConfig, new AbortController().signal)
      expect((dir[0]!.content[0] as { text: string }).text).toContain('truncated="true"')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('bounded mode includes valid text and reports every unsupported descendant', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-mention-'))
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src', 'a.txt'), 'ok\n')
    await writeFile(join(root, 'src', 'b.txt'), 'too large\n')
    await writeFile(join(root, 'src', 'c.bin'), Buffer.from([0x00, 0x01]))
    try {
      const config: ResolvedConfig = { ...CONFIG, directoryMode: 'bounded', maxFileBytes: 4 }
      const injections = await expandMentions([user('attach @src/')], root, config, new AbortController().signal)
      const text = (injections[0]!.content[0] as { text: string }).text
      expect(text).toContain('mode="bounded"')
      expect(text).toContain('included-files="1" omitted-files="2" reported-omissions="2"')
      expect(text).toContain('<omitted path="src/b.txt" reason="10 bytes exceeds maxFileBytes=4" />')
      expect(text).toContain('<omitted path="src/c.bin" reason="binary, PDF, or non-UTF-8 file" />')
      expect(text).toContain('<file path="src/a.txt">\nok\n</file>')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('caps the complete serialized directory form and selects deterministically', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-mention-'))
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src', 'a.txt'), 'a'.repeat(180))
    await writeFile(join(root, 'src', 'b.txt'), 'b'.repeat(180))
    try {
      const config: ResolvedConfig = { ...CONFIG, directoryMode: 'bounded', maxTotalBytes: 360 }
      const first = await expandMentions([user('attach @src/')], root, config, new AbortController().signal)
      const second = await expandMentions([user('attach @src/')], root, config, new AbortController().signal)
      const firstText = (first[0]!.content[0] as { text: string }).text
      const secondText = (second[0]!.content[0] as { text: string }).text
      expect(firstText).toBe(secondText)
      expect(Buffer.byteLength(firstText)).toBeLessThanOrEqual(360)
      expect(firstText).toContain('truncated="true"')
      expect(firstText).toContain('included-files="0" omitted-files="2"')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reports aggregate-budget omissions in bounded mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-mention-'))
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src', 'a.txt'), 'a'.repeat(700))
    await writeFile(join(root, 'src', 'b.txt'), 'b'.repeat(700))
    try {
      const config: ResolvedConfig = {
        ...CONFIG,
        directoryMode: 'bounded',
        maxFileBytes: 1000,
        maxTotalBytes: 1024,
      }
      const injections = await expandMentions([user('attach @src/')], root, config, new AbortController().signal)
      const text = (injections[0]!.content[0] as { text: string }).text
      expect(text).toContain('reason="700 bytes would exceed maxTotalBytes=1024"')
      expect(Buffer.byteLength(text)).toBeLessThanOrEqual(1024)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reports unreadable files in bounded mode', async (context) => {
    if (process.platform === 'win32') return context.skip()
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-mention-'))
    await mkdir(join(root, 'src'))
    const blocked = join(root, 'src', 'blocked.txt')
    await writeFile(blocked, 'secret\n')
    await chmod(blocked, 0o000)
    try {
      const config: ResolvedConfig = { ...CONFIG, directoryMode: 'bounded' }
      const injections = await expandMentions([user('attach @src/')], root, config, new AbortController().signal)
      const text = (injections[0]!.content[0] as { text: string }).text
      expect(text).toContain('<omitted path="src/blocked.txt" reason="unreadable file" />')
    } finally {
      await chmod(blocked, 0o600)
      await rm(root, { recursive: true, force: true })
    }
  })

  it('truncates a large manifest within the aggregate output budget', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-mention-'))
    await mkdir(join(root, 'src'))
    for (let index = 0; index < 30; index += 1) {
      await writeFile(join(root, 'src', `file-${String(index).padStart(2, '0')}.txt`), 'x')
    }
    try {
      const injections = await expandMentions([user('attach @src/')], root, CONFIG, new AbortController().signal)
      const text = (injections[0]!.content[0] as { text: string }).text
      expect(Buffer.byteLength(text)).toBeLessThanOrEqual(CONFIG.maxTotalBytes)
      expect(text).toContain('mode="manifest" truncated="true"')
      expect(text).toMatch(/omitted-entries="[1-9][0-9]*"/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('skips non-text blocks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-mention-'))
    try {
      const message = createUserMessage({
        content: [{ type: 'text', text: 'no mention' }, { type: 'image', attachment: { attachmentId: 'x' } as never }],
        source: { kind: 'user' },
      })
      expect(await expandMentions([message], root, CONFIG, new AbortController().signal)).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('skips unknown paths and non-user message sources', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-mention-'))
    try {
      const injections = await expandMentions([user('read @missing.ts')], root, CONFIG, new AbortController().signal)
      expect(injections).toEqual([])
      const plugin = createUserMessage({ content: [{ type: 'text', text: '@a.ts' }], source: { kind: 'plugin', plugin: 'x' } })
      await writeFile(join(root, 'a.ts'), 'x\n')
      expect(await expandMentions([plugin], root, CONFIG, new AbortController().signal)).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses tokens that escape the workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-mention-'))
    try {
      const injections = await expandMentions([user('read @../secret.ts')], root, CONFIG, new AbortController().signal)
      expect(injections).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('treats a relative cwd as unavailable', async () => {
    expect(await expandMentions([user('read @a.ts')], 'relative/cwd', CONFIG, new AbortController().signal)).toEqual([])
  })
})

describe('mentionPreStep', () => {
  const agent = { session: { header: { cwd: '/ws' } } }

  it('appends injections to the downstream enter decision', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-mention-'))
    await writeFile(join(root, 'a.ts'), 'x\n')
    try {
      const decision = await mentionPreStep(
        { session: { header: { cwd: root } } },
        CONFIG,
        () => true,
        [user('read @a.ts')],
        new AbortController().signal,
        async () => ({ kind: 'enter', messages: [] }),
      )
      expect(decision.kind).toBe('enter')
      expect(decision.messages).toHaveLength(1)
      expect(decision.messages![0]!.source).toEqual({ kind: 'at-file-mention', relative: 'a.ts' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('returns the downstream decision when disabled or rejected', async () => {
    const decision = async () => ({ kind: 'enter', messages: [] })
    const disabled = await mentionPreStep(agent, CONFIG, () => false, [user('@a.ts')], new AbortController().signal, decision)
    expect(disabled.messages).toEqual([])
    const rejected = await mentionPreStep(agent, CONFIG, () => true, [user('@a.ts')], new AbortController().signal, async () => ({ kind: 'reject' }))
    expect(rejected.kind).toBe('reject')
    // An enabled run with no resolvable mention leaves the decision untouched.
    const unmatched = await mentionPreStep({ session: { header: { cwd: '/ws' } } }, CONFIG, () => true, [user('@missing.ts')], new AbortController().signal, decision)
    expect(unmatched.messages).toEqual([])
  })
})
