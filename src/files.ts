/**
 * Workspace path indexing over node:fs. The walk streams directories one
 * dirent at a time (memory stays O(one level) even under a giant directory),
 * never follows symlinks, skips configured ignore dirs by basename, and
 * hard-stops at the configured entry cap with an honest `truncated` flag.
 */
import { opendir } from 'node:fs/promises'
import type { Dir } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { FileEntry } from './contract.ts'
import { normalizeIgnoreFiles } from './defaults.ts'

/** Options for one bounded index pass. */
export interface IndexOptions {
  /** Hard cap on collected files. */
  readonly maxFiles: number
  /** Directory basenames the walk skips (children never enqueue). */
  readonly ignoreDirs: readonly string[]
  /** File basenames omitted from the index, matched case-insensitively. */
  readonly ignoreFiles: readonly string[]
}

/** One index pass result: the sorted file list plus the honest truncation flag. */
export interface WorkspaceIndex {
  readonly files: readonly FileEntry[]
  /** True when the walk hit `maxFiles` before the tree was exhausted. */
  readonly truncated: boolean
}

/** Await `operation`, rejecting with the signal's reason the moment it aborts. */
function raceAbort<T>(operation: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return operation
  return new Promise<T>((resolve, reject) => {
    /* v8 ignore start -- requires a filesystem await to stall exactly while abort lands; pre-aborted callers exit before raceAbort. */
    const onAbort = (): void => {
      operation.catch(() => {
        // Abandoned read: its handle is being closed by the aborting caller,
        // and the abort reason already carried the outcome.
      })
      reject(asError(signal.reason))
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    /* v8 ignore stop */
    signal.addEventListener('abort', onAbort, { once: true })
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (reason: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(asError(reason))
      },
    )
  })
}

/** The thrown value as an Error (wire/abort reasons may be anything). */
function asError(reason: unknown): Error {
  /* v8 ignore next -- the non-Error arm needs a non-Error abort reason fired mid-await; pre-aborted signals throw their reason directly. */
  return reason instanceof Error ? reason : new Error(String(reason))
}

/** Message text of an unknown thrown value. */
function messageOf(error: unknown): string {
  /* v8 ignore next -- node:fs rejects with Error instances; the String arm only satisfies the unknown narrowing. */
  return error instanceof Error ? error.message : String(error)
}

/** Forward-slash display path of `child` relative to `root` (stable across platforms). */
function displayRelative(root: string, child: string): string {
  return relative(root, child).split(sep).join('/')
}

/** Close a departed caller's abandoned directory handle without awaiting a queued read. */
function closeOrSwallow(handle: Dir, signal: AbortSignal | undefined): Promise<void> {
  const closing = handle.close()
  /* v8 ignore start -- an abort landing between a read and the close needs a filesystem stall; the abandoned-close arm has no observable outcome. */
  if (signal?.aborted) {
    closing.catch(() => {
      // The caller already departed; a close failure has no consumer.
    })
    return Promise.resolve()
  }
  /* v8 ignore stop */
  return closing
}

/**
 * Collect every regular file under `root` (bounded, name-sorted).
 * @param root - workspace root to walk.
 * @param options - cap and ignore list.
 * @param signal - caller lifetime; every filesystem await races it.
 * @returns the sorted file list and the truncation flag.
 */
export async function indexWorkspace(
  root: string,
  options: IndexOptions,
  signal?: AbortSignal,
): Promise<WorkspaceIndex> {
  const ignoreDirs = new Set(options.ignoreDirs)
  const ignoreFiles = new Set(normalizeIgnoreFiles(options.ignoreFiles).map(name => name.toLowerCase()))
  const files: FileEntry[] = []
  const queue: string[] = [root]
  let truncated = false
  while (queue.length > 0) {
    signal?.throwIfAborted()
    const dir = queue.shift() as string
    let handle: Dir
    try {
      handle = await raceAbort(opendir(dir), signal)
    } catch (error: unknown) {
      signal?.throwIfAborted()
      throw new Error(`at-file: cannot list "${dir}": ${messageOf(error)}`)
    }
    try {
      for (;;) {
        const dirent = await raceAbort(handle.read(), signal)
        if (dirent === null) break
        if (files.length >= options.maxFiles) {
          truncated = true
          break
        }
        // Symlinked directories are never entered (a link cycle cannot strand
        // the walk); symlinked files are followed only implicitly through the
        // dirent of their parent — a symlink dirent itself is skipped.
        if (dirent.isSymbolicLink()) continue
        const child = join(dir, dirent.name)
        if (dirent.isDirectory()) {
          if (ignoreDirs.has(dirent.name)) continue
          // Directories are indexed entries too, so the picker can reference
          // one path without inspecting its descendants at send time.
          files.push({ path: child, relative: displayRelative(root, child), kind: 'dir' })
          queue.push(child)
          continue
        }
        if (dirent.isFile() && !ignoreFiles.has(dirent.name.toLowerCase())) {
          files.push({ path: child, relative: displayRelative(root, child), kind: 'file' })
        }
      }
    } finally {
      await closeOrSwallow(handle, signal)
    }
    if (truncated) break
  }
  files.sort((a, b) => a.relative < b.relative ? -1 : 1)
  return { files, truncated }
}
