/**
 * Workspace path indexing over node:fs. The walk streams directories one
 * dirent at a time (memory stays O(one level) even under a giant directory),
 * follows file and directory symlinks without re-entering an ancestor target,
 * skips configured ignore dirs by basename, and hard-stops at the configured
 * entry cap with an honest `truncated` flag.
 */
import { opendir, realpath, stat } from 'node:fs/promises'
import type { Dir, Dirent } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { FileEntry, FileIgnoreRuleInput } from './contract.ts'
import { compileIgnoreRules } from './defaults.ts'

/** Options for one bounded index pass. */
export interface IndexOptions {
  /** Hard cap on collected files. */
  readonly maxFiles: number
  /** Directory basenames the walk skips (children never enqueue). */
  readonly ignoreDirs: readonly string[]
  /** Exact and Regex basename filters applied before files enter the index. */
  readonly ignoreFiles: readonly FileIgnoreRuleInput[]
}

/** One index pass result: the sorted file list plus the honest truncation flag. */
export interface WorkspaceIndex {
  readonly files: readonly FileEntry[]
  /** True when the walk hit `maxFiles` before the tree was exhausted. */
  readonly truncated: boolean
}

/** Directory opener seam used by the real filesystem and deterministic tests. */
export type OpenWorkspaceDirectory = (path: string) => Promise<Dir>

/** One queued directory plus the real targets already present above it. */
interface DirectoryTask {
  readonly path: string
  readonly canonical: string
  readonly ancestors: ReadonlySet<string>
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
 * @param openDirectory - directory opener; defaults to node:fs.
 * @returns the sorted file list and the truncation flag.
 */
export async function indexWorkspace(
  root: string,
  options: IndexOptions,
  signal?: AbortSignal,
  openDirectory: OpenWorkspaceDirectory = opendir,
): Promise<WorkspaceIndex> {
  const ignoreDirs = new Set(options.ignoreDirs)
  const ignoreRules = compileIgnoreRules(options.ignoreFiles)
  const compiledRegex = new Map(ignoreRules
    .filter(rule => rule.kind === 'regex')
    .map(rule => [rule, new RegExp(rule.pattern, rule.caseSensitive ? '' : 'i')]))
  const isIgnoredFile = (name: string): boolean => ignoreRules.some(rule => {
    if (rule.kind === 'exact') {
      return rule.caseSensitive ? name === rule.pattern : name.toLowerCase() === rule.pattern.toLowerCase()
    }
    return (compiledRegex.get(rule) as RegExp).test(name)
  })
  const files: FileEntry[] = []
  let rootCanonical: string
  try {
    rootCanonical = await raceAbort(realpath(root), signal)
  } catch (error: unknown) {
    signal?.throwIfAborted()
    throw new Error(`at-file: cannot list "${root}": ${messageOf(error)}`)
  }
  const queue: DirectoryTask[] = [{ path: root, canonical: rootCanonical, ancestors: new Set() }]
  let truncated = false
  while (queue.length > 0) {
    signal?.throwIfAborted()
    const task = queue.shift() as DirectoryTask
    const dir = task.path
    // Directory links may point to themselves or any parent. Keep the alias as
    // an indexed entry, but never descend into a target already on this path.
    if (task.ancestors.has(task.canonical)) continue
    const childAncestors = new Set(task.ancestors)
    childAncestors.add(task.canonical)
    let handle: Dir
    try {
      handle = await raceAbort(openDirectory(dir), signal)
    } catch (error: unknown) {
      signal?.throwIfAborted()
      if (dir === root) throw new Error(`at-file: cannot list "${dir}": ${messageOf(error)}`)
      console.warn(`[dsh-at-file] skipping unreadable directory "${dir}": ${messageOf(error)}`)
      continue
    }
    try {
      for (;;) {
        let dirent: Dirent | null
        try {
          dirent = await raceAbort(handle.read(), signal)
        } catch (error: unknown) {
          signal?.throwIfAborted()
          console.warn(`[dsh-at-file] stopped reading directory "${dir}": ${messageOf(error)}`)
          break
        }
        if (dirent === null) break
        if (files.length >= options.maxFiles) {
          truncated = true
          break
        }
        const child = join(dir, dirent.name)
        if (dirent.isSymbolicLink()) {
          let targetPath: string
          let target: Awaited<ReturnType<typeof stat>>
          try {
            targetPath = await raceAbort(realpath(child), signal)
            target = await raceAbort(stat(targetPath), signal)
          } catch {
            signal?.throwIfAborted()
            // Broken, inaccessible, and transient links do not invalidate the
            // rest of the workspace index.
            continue
          }
          if (target.isDirectory()) {
            if (ignoreDirs.has(dirent.name)) continue
            files.push({ path: child, relative: displayRelative(root, child), kind: 'dir' })
            queue.push({ path: child, canonical: targetPath, ancestors: childAncestors })
            continue
          }
          if (target.isFile() && !isIgnoredFile(dirent.name)) {
            files.push({ path: child, relative: displayRelative(root, child), kind: 'file' })
          }
          continue
        }
        if (dirent.isDirectory()) {
          if (ignoreDirs.has(dirent.name)) continue
          // Directories are indexed entries too, so the picker can reference
          // one path without inspecting its descendants at send time.
          files.push({ path: child, relative: displayRelative(root, child), kind: 'dir' })
          queue.push({
            path: child,
            canonical: join(task.canonical, dirent.name),
            ancestors: childAncestors,
          })
          continue
        }
        if (dirent.isFile() && !isIgnoredFile(dirent.name)) {
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
