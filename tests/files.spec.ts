/**
 * Workspace indexing behavior: bounded traversal, ignored directories,
 * symlink exclusion, deterministic paths, and cancellation.
 */
import type { Dir } from 'node:fs'
import { mkdtemp, mkdir, opendir, symlink, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { indexWorkspace } from '../src/files.ts'
import { DEFAULT_IGNORE_DIRS, DEFAULT_IGNORE_FILES } from '../src/defaults.ts'

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
  it('collects file and directory paths without inspecting file content', async () => {
    const root = await fixture()
    try {
      const { files, truncated } = await indexWorkspace(root, { maxFiles: 100, ignoreDirs: ['.git', 'node_modules'], ignoreFiles: [] })
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

  it('skips ignore dirs and symlinks', async () => {
    const root = await fixture()
    try {
      const { files } = await indexWorkspace(root, { maxFiles: 100, ignoreDirs: ['.git', 'node_modules'], ignoreFiles: [] })
      const relatives = files.map(file => file.relative)
      expect(relatives).toContain('src/index.ts')
      expect(relatives).toContain('data.bin')
      expect(relatives.some(path => path.includes('node_modules'))).toBe(false)
      expect(relatives.some(path => path.includes('.git'))).toBe(false)
      expect(relatives.some(path => path.startsWith('linked-src'))).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('default ignores remove common IDE metadata, caches, dependencies, and build output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-default-ignore-'))
    const ignored = [
      '.idea', '.vs', '.vscode', '.settings', '.gradle', '.cxx', 'build', 'bin', 'target',
      'cmake-build-debug', '.pytest_cache', 'DerivedData', 'node_modules',
    ]
    try {
      for (const directory of ignored) {
        await mkdir(join(root, directory), { recursive: true })
        await writeFile(join(root, directory, 'noise.txt'), 'noise\n')
      }
      await mkdir(join(root, 'src'), { recursive: true })
      await writeFile(join(root, 'src', 'main.kt'), 'fun main() {}\n')

      const { files } = await indexWorkspace(root, { maxFiles: 100, ignoreDirs: DEFAULT_IGNORE_DIRS, ignoreFiles: [] })
      const relatives = files.map(file => file.relative)
      expect(relatives).toContain('src/main.kt')
      for (const directory of ignored) {
        expect(relatives.some(path => path === directory || path.startsWith(`${directory}/`))).toBe(false)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('carries the absolute path on every entry', async () => {
    const root = await fixture()
    try {
      const { files } = await indexWorkspace(root, { maxFiles: 100, ignoreDirs: [], ignoreFiles: [] })
      expect(files.find(file => file.relative === 'README.md')?.path).toBe(join(root, 'README.md'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('stops at the entry cap and reports truncation honestly', async () => {
    const root = await fixture()
    try {
      const { files, truncated } = await indexWorkspace(root, { maxFiles: 2, ignoreDirs: ['.git', 'node_modules'], ignoreFiles: [] })
      expect(files).toHaveLength(2)
      expect(truncated).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a missing root with a readable error', async () => {
    await expect(indexWorkspace(
      join(tmpdir(), 'dsh-at-file-missing-root'),
      { maxFiles: 10, ignoreDirs: [], ignoreFiles: [] },
      new AbortController().signal,
    )).rejects.toThrow(/cannot list/)
  })

  it('skips a child directory that cannot be opened', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-unreadable-open-'))
    const blocked = join(root, 'blocked')
    await mkdir(blocked)
    await writeFile(join(root, 'keep.txt'), 'keep\n')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { files } = await indexWorkspace(root, {
        maxFiles: 10,
        ignoreDirs: [],
        ignoreFiles: [],
      }, undefined, async (dir) => {
        if (dir === blocked) throw new Error('permission denied')
        return opendir(dir)
      })
      expect(files.map(file => file.relative)).toEqual(['blocked', 'keep.txt'])
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(`skipping unreadable directory "${blocked}"`))
    } finally {
      warn.mockRestore()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps the partial index when a directory read stops early', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-unreadable-read-'))
    const blocked = join(root, 'blocked')
    await mkdir(blocked)
    await writeFile(join(blocked, 'first.txt'), 'first\n')
    await writeFile(join(root, 'keep.txt'), 'keep\n')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { files } = await indexWorkspace(root, {
        maxFiles: 10,
        ignoreDirs: [],
        ignoreFiles: [],
      }, undefined, async (dir) => {
        const handle = await opendir(dir)
        if (dir !== blocked) return handle
        let first = true
        return {
          read: async () => {
            if (first) {
              first = false
              return handle.read()
            }
            throw new Error('read denied')
          },
          close: async () => handle.close(),
        } as Dir
      })
      expect(files.map(file => file.relative)).toEqual(['blocked', 'blocked/first.txt', 'keep.txt'])
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(`stopped reading directory "${blocked}"`))
    } finally {
      warn.mockRestore()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps cancellation fatal while a directory read is pending', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-abort-read-'))
    const controller = new AbortController()
    const handle = {
      read: () => new Promise<never>(() => {}),
      close: async () => {},
    } as unknown as Dir
    try {
      const indexing = indexWorkspace(root, {
        maxFiles: 10,
        ignoreDirs: [],
        ignoreFiles: [],
      }, controller.signal, async () => handle)
      await Promise.resolve()
      controller.abort(new Error('read cancelled'))
      await expect(indexing).rejects.toThrow('read cancelled')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('races the walk against an already-aborted signal', async () => {
    const root = await fixture()
    try {
      const controller = new AbortController()
      controller.abort(new Error('gone'))
      await expect(indexWorkspace(root, { maxFiles: 10, ignoreDirs: [], ignoreFiles: [] }, controller.signal)).rejects.toThrow('gone')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('wraps a non-Error abort reason into an Error', async () => {
    const root = await fixture()
    try {
      const controller = new AbortController()
      controller.abort('plain reason')
      await expect(indexWorkspace(root, { maxFiles: 10, ignoreDirs: [], ignoreFiles: [] }, controller.signal)).rejects.toThrow('plain reason')
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
      const { files } = await indexWorkspace(root, { maxFiles: 10, ignoreDirs: [], ignoreFiles: [] })
      expect(files).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('skips configured file basenames case-insensitively', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-file-ignore-'))
    try {
      await writeFile(join(root, 'desktop.ini'), 'metadata\n')
      await writeFile(join(root, 'THUMBS.DB'), 'metadata\n')
      await writeFile(join(root, '.DS_Store'), 'metadata\n')
      await writeFile(join(root, 'keep.ini'), 'keep\n')
      const { files } = await indexWorkspace(root, {
        maxFiles: 100,
        ignoreDirs: [],
        ignoreFiles: DEFAULT_IGNORE_FILES,
      })
      expect(files.map(file => file.relative)).toEqual(['keep.ini'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('normalizes empty and duplicate file filters without hiding other files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-file-ignore-'))
    try {
      await writeFile(join(root, 'noise.log'), 'noise\n')
      await writeFile(join(root, 'keep.log'), 'keep\n')
      const { files } = await indexWorkspace(root, {
        maxFiles: 100,
        ignoreDirs: [],
        ignoreFiles: [' noise.log ', 'NOISE.LOG', ''],
      })
      expect(files.map(file => file.relative)).toEqual(['keep.log'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('applies exact and regular-expression rules with independent case sensitivity', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-at-file-regex-ignore-'))
    try {
      for (const name of ['exact.tmp', 'bundle.map', 'BUNDLE.MAP', 'keep.ts']) {
        await writeFile(join(root, name), 'fixture\n')
      }
      const { files } = await indexWorkspace(root, {
        maxFiles: 100,
        ignoreDirs: [],
        ignoreFiles: [
          { kind: 'exact', pattern: 'Exact.TMP', caseSensitive: true },
          { kind: 'regex', pattern: '\\.map$', caseSensitive: false },
        ],
      })
      expect(files.map(file => file.relative)).toEqual(['exact.tmp', 'keep.ts'])

      const sensitive = await indexWorkspace(root, {
        maxFiles: 100,
        ignoreDirs: [],
        ignoreFiles: [
          { kind: 'exact', pattern: 'exact.tmp', caseSensitive: true },
          { kind: 'regex', pattern: '\\.MAP$', caseSensitive: true },
        ],
      })
      expect(sensitive.files.map(file => file.relative)).toContain('bundle.map')
      expect(sensitive.files.map(file => file.relative)).not.toContain('BUNDLE.MAP')
      expect(sensitive.files.map(file => file.relative)).not.toContain('exact.tmp')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
