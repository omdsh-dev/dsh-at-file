/**
 * Host filesystem behaviors: bounded index walks (ignore dirs, symlinked
 * directories skipped, cap truncation, forward-slash relative paths) and
 * complete-result-bounded reads (absolute-path fence, missing/directory/
 * oversized/binary refusals, abort racing).
 */
import { chmod, mkdtemp, mkdir, symlink, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { indexWorkspace, readFileText, readTree } from '../src/files.ts'
import type { ReadTreeOptions } from '../src/files.ts'

const TREE_OPTIONS: ReadTreeOptions = {
  maxFiles: 100,
  maxFileBytes: 1024,
  maxTotalBytes: 1024 * 1024,
  mode: 'bounded',
  ignoreDirs: [],
}

/** Build a fresh fixture tree and hand back its root (caller removes it). */
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-'))
  await mkdir(join(root, 'src', 'client'), { recursive: true })
  await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true })
  await mkdir(join(root, '.git', 'objects'), { recursive: true })
  await mkdir(join(root, 'empty'), { recursive: true })
  await writeFile(join(root, 'README.md'), '# root\n')
  await writeFile(join(root, 'src', 'index.ts'), 'export {}\n')
  await writeFile(join(root, 'src', 'client', 'view.ts'), 'export {}\n')
  await writeFile(join(root, 'node_modules', 'pkg', 'ignored.ts'), 'ignored\n')
  await writeFile(join(root, '.git', 'config'), '[core]\n')
  await symlink(join(root, 'src'), join(root, 'linked-src'), 'dir')
  await writeFile(join(root, 'data.bin'), Buffer.from([0x00, 0x01, 0x02]))
  return root
}

describe('indexWorkspace', () => {
  it('collects files and directories as forward-slash relative entries, sorted by path', async () => {
    const root = await fixture()
    try {
      const { files, truncated } = await indexWorkspace(root, { maxFiles: 100, ignoreDirs: ['.git', 'node_modules'] })
      expect(truncated).toBe(false)
      expect(files.map(file => `${file.kind}:${file.relative}`)).toEqual([
        'file:README.md',
        'file:data.bin',
        'dir:empty',
        'dir:src',
        'dir:src/client',
        'file:src/client/view.ts',
        'file:src/index.ts',
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('skips ignore dirs and symlinked directories, includes every remaining file', async () => {
    const root = await fixture()
    try {
      const { files } = await indexWorkspace(root, { maxFiles: 100, ignoreDirs: ['.git', 'node_modules'] })
      const relatives = files.map(file => file.relative)
      expect(relatives).toContain('src/index.ts')
      expect(relatives).toContain('src/client/view.ts')
      expect(relatives).toContain('data.bin')
      expect(files.find(file => file.relative === 'src')?.kind).toBe('dir')
      expect(relatives.some(rel => rel.includes('node_modules'))).toBe(false)
      expect(relatives.some(rel => rel.includes('.git'))).toBe(false)
      expect(relatives.some(rel => rel.startsWith('linked-src'))).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('carries the absolute path on every entry', async () => {
    const root = await fixture()
    try {
      const { files } = await indexWorkspace(root, { maxFiles: 100, ignoreDirs: [] })
      const readme = files.find(file => file.relative === 'README.md')
      expect(readme?.path).toBe(join(root, 'README.md'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('stops at the file cap and reports truncation honestly', async () => {
    const root = await fixture()
    try {
      const { files, truncated } = await indexWorkspace(root, { maxFiles: 2, ignoreDirs: ['.git', 'node_modules'] })
      expect(files).toHaveLength(2)
      expect(truncated).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a missing root with a readable error', async () => {
    await expect(indexWorkspace(
      join(tmpdir(), 'dsh-at-file-missing-root'),
      { maxFiles: 10, ignoreDirs: [] },
      new AbortController().signal,
    )).rejects.toThrow(/cannot list/)
  })

  it('races the walk against an already-aborted signal', async () => {
    const root = await fixture()
    try {
      const controller = new AbortController()
      controller.abort(new Error('gone'))
      await expect(indexWorkspace(root, { maxFiles: 10, ignoreDirs: [] }, controller.signal))
        .rejects.toThrow('gone')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('wraps a non-Error abort reason into an Error', async () => {
    const root = await fixture()
    try {
      const controller = new AbortController()
      controller.abort('plain reason')
      await expect(indexWorkspace(root, { maxFiles: 10, ignoreDirs: [] }, controller.signal))
        .rejects.toThrow('plain reason')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('skips non-file dirents such as named pipes', async (context) => {
    if (process.platform === 'win32') return context.skip()
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-fifo-'))
    const { execFileSync } = await import('node:child_process')
    execFileSync('mkfifo', [join(root, 'pipe')])
    try {
      const { files } = await indexWorkspace(root, { maxFiles: 10, ignoreDirs: [] })
      expect(files).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('readFileText', () => {
  it('reads a text file with its exact byte length', async () => {
    const root = await fixture()
    try {
      const result = await readFileText(join(root, 'README.md'), 1024)
      expect(result.content).toBe('# root\n')
      expect(result.bytes).toBe(7)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses relative paths instead of rebasing them', async () => {
    await expect(readFileText('README.md', 1024)).rejects.toThrow(/not an absolute path/)
  })

  it('refuses missing files', async () => {
    await expect(readFileText(join(tmpdir(), 'dsh-at-file-never.md'), 1024, new AbortController().signal))
      .rejects.toThrow(/cannot read/)
  })

  it('refuses directories', async () => {
    const root = await fixture()
    try {
      await expect(readFileText(join(root, 'src'), 1024)).rejects.toThrow(/is a directory/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses files over the byte cap without truncating', async () => {
    const root = await fixture()
    try {
      await expect(readFileText(join(root, 'README.md'), 3)).rejects.toThrow(/maxFileBytes is 3.*cordis\.patch\.yml/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses binary files', async () => {
    const root = await fixture()
    try {
      await expect(readFileText(join(root, 'data.bin'), 1024)).rejects.toThrow(/binary/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('explains that PDF files need text extraction instead of a larger byte limit', async () => {
    const root = await fixture()
    try {
      const path = join(root, 'brief.pdf')
      await writeFile(path, '%PDF-1.7\nexample')
      await expect(readFileText(path, 1024)).rejects.toThrow(/PDF extraction is not supported.*\.txt or \.md/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses non-UTF-8 data even when it has no NUL byte', async () => {
    const root = await fixture()
    try {
      const path = join(root, 'invalid.txt')
      await writeFile(path, Buffer.from([0xff, 0xfe, 0xfd]))
      await expect(readFileText(path, 1024)).rejects.toThrow(/not valid UTF-8/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('races the read against an already-aborted signal', async () => {
    const root = await fixture()
    try {
      const controller = new AbortController()
      controller.abort(new Error('gone'))
      await expect(readFileText(join(root, 'README.md'), 1024, controller.signal)).rejects.toThrow('gone')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('readTree', () => {
  it('reads every file under a directory, relative to that directory root', async () => {
    const root = await fixture()
    try {
      const result = await readTree(join(root, 'src'), TREE_OPTIONS)
      expect(result.truncated).toBe(false)
      expect(result.files.map(file => file.relative)).toEqual(['client/view.ts', 'index.ts'])
      expect(result.files.find(file => file.relative === 'index.ts')?.content).toBe('export {}\n')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses non-directory and relative paths', async () => {
    const root = await fixture()
    try {
      await expect(readTree(join(root, 'README.md'), TREE_OPTIONS)).rejects.toThrow(/not a directory/)
      await expect(readTree('src', TREE_OPTIONS)).rejects.toThrow(/not an absolute path/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reports truncation when the file cap cuts the subtree', async () => {
    const root = await fixture()
    try {
      const result = await readTree(join(root, 'src'), { ...TREE_OPTIONS, maxFiles: 1 })
      expect(result.files).toHaveLength(1)
      expect(result.truncated).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('builds a deterministic metadata manifest without reading file contents', async () => {
    const root = await fixture()
    try {
      const result = await readTree(join(root, 'src'), { ...TREE_OPTIONS, mode: 'manifest' })
      expect(result).toMatchObject({ mode: 'manifest', files: [], skipped: [], includedBytes: 0, truncated: false })
      expect(result.entries).toEqual([
        { relative: 'client', kind: 'dir' },
        { relative: 'client/view.ts', kind: 'file', bytes: 10 },
        { relative: 'index.ts', kind: 'file', bytes: 10 },
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps valid text and reports oversized and binary descendants together', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-tree-'))
    await writeFile(join(root, 'a.txt'), 'ok\n')
    await writeFile(join(root, 'b.txt'), 'too large\n')
    await writeFile(join(root, 'c.bin'), Buffer.from([0x00, 0x01]))
    try {
      const result = await readTree(root, { ...TREE_OPTIONS, maxFileBytes: 4 })
      expect(result.files.map(file => file.relative)).toEqual(['a.txt'])
      expect(result.skipped).toEqual([
        { relative: 'b.txt', reason: 'oversized', bytes: 10, limit: 4 },
        { relative: 'c.bin', reason: 'binary', bytes: 2 },
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('enforces the aggregate content budget in deterministic path order', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-tree-'))
    await writeFile(join(root, 'a.txt'), 'aaaa')
    await writeFile(join(root, 'b.txt'), 'bbbb')
    try {
      const result = await readTree(root, { ...TREE_OPTIONS, maxTotalBytes: 5 })
      expect(result.files.map(file => file.relative)).toEqual(['a.txt'])
      expect(result.includedBytes).toBe(4)
      expect(result.skipped).toEqual([
        { relative: 'b.txt', reason: 'aggregate-limit', bytes: 4, limit: 5 },
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reports an unreadable descendant without aborting the directory', async (context) => {
    if (process.platform === 'win32') return context.skip()
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-tree-'))
    const blocked = join(root, 'blocked.txt')
    await writeFile(join(root, 'a.txt'), 'ok\n')
    await writeFile(blocked, 'secret\n')
    await chmod(blocked, 0o000)
    try {
      const result = await readTree(root, TREE_OPTIONS)
      expect(result.files.map(file => file.relative)).toEqual(['a.txt'])
      expect(result.skipped).toEqual([{ relative: 'blocked.txt', reason: 'unreadable' }])
    } finally {
      await chmod(blocked, 0o600)
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps cancellation fatal instead of turning it into an omission', async () => {
    const root = await fixture()
    const controller = new AbortController()
    controller.abort(new Error('cancel directory'))
    try {
      await expect(readTree(root, TREE_OPTIONS, controller.signal)).rejects.toThrow('cancel directory')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
