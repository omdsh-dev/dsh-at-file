/**
 * Workspace file indexing and bounded text reads over node:fs. The index walk
 * streams directories one dirent at a time (memory stays O(one level) even
 * under a giant directory), never follows symlinked directories, skips the
 * configured ignore dirs by basename, and hard-stops at the configured file
 * cap with an honest `truncated` flag. Reads race every filesystem await
 * against the caller's signal. Direct reads refuse unsupported files;
 * bounded directory reads classify and report them without aborting siblings.
 */
import { opendir, readFile, stat } from 'node:fs/promises'
import type { Dir } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import type {
  DirectoryMode,
  FileContent,
  FileEntry,
  ReadTreeEntry,
  ReadTreeFile,
  ReadTreeResult,
  ReadTreeSkipped,
} from './contract.ts'

/** Options for one bounded index pass. */
export interface IndexOptions {
  /** Hard cap on collected files. */
  readonly maxFiles: number
  /** Directory basenames the walk skips (children never enqueue). */
  readonly ignoreDirs: readonly string[]
}

/** One index pass result: the sorted file list plus the honest truncation flag. */
export interface WorkspaceIndex {
  readonly files: readonly FileEntry[]
  /** True when the walk hit `maxFiles` before the tree was exhausted. */
  readonly truncated: boolean
}

/** Bounds and representation for one directory mention. */
export interface ReadTreeOptions extends IndexOptions {
  readonly maxFileBytes: number
  readonly maxTotalBytes: number
  readonly mode: DirectoryMode
}

/** First bytes probed for NUL to classify a file as binary. */
const BINARY_PROBE_BYTES = 8192
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true })

/** A classified expected failure that a directory read can report and skip. */
type TextFileFailure =
  | { readonly reason: 'oversized'; readonly bytes: number; readonly limit: number }
  | { readonly reason: 'binary'; readonly bytes?: number }
  | { readonly reason: 'unreadable' }

class TextFileError extends Error {
  constructor(
    readonly failure: TextFileFailure,
    message: string,
  ) {
    super(message)
    this.name = 'TextFileError'
  }
}

/** Await `operation`, rejecting with the signal's reason the moment it aborts. */
function raceAbort<T>(operation: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return operation
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      /* v8 ignore start -- the abandoned read's rejection lands only when the filesystem stalls mid-request. */
      operation.catch(() => {
        // Abandoned read: its handle is being closed by the aborting caller,
        // and the abort reason already carried the outcome.
      })
      /* v8 ignore stop */
      reject(asError(signal.reason))
    }
    if (signal.aborted) {
      onAbort()
      return
    }
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
  const ignore = new Set(options.ignoreDirs)
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
          if (ignore.has(dirent.name)) continue
          // Directories are indexed entries too, so the picker can list and
          // attach them as a manifest or bounded content set.
          files.push({ path: child, relative: displayRelative(root, child), kind: 'dir' })
          queue.push(child)
          continue
        }
        if (dirent.isFile()) files.push({ path: child, relative: displayRelative(root, child), kind: 'file' })
      }
    } finally {
      await closeOrSwallow(handle, signal)
    }
    if (truncated) break
  }
  files.sort((a, b) => a.relative < b.relative ? -1 : 1)
  return { files, truncated }
}

/**
 * Read one text file under the complete-result bounds.
 * @param path - absolute path (relative values are refused, never rebased).
 * @param maxBytes - hard cap; larger files are refused, never truncated.
 * @param signal - caller lifetime.
 * @returns the UTF-8 content with its byte length.
 * @throws for non-absolute paths, missing entries, directories, oversized, and binary files.
 */
export async function readFileText(
  path: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<FileContent> {
  if (!isAbsolute(path)) {
    throw new Error(`at-file: "${path}" is not an absolute path`)
  }
  const info = await raceAbort(stat(path), signal).catch((error: unknown) => {
    signal?.throwIfAborted()
    throw new TextFileError({ reason: 'unreadable' }, `at-file: cannot read "${path}": ${messageOf(error)}`)
  })
  if (info.isDirectory()) {
    throw new Error(`at-file: "${path}" is a directory`)
  }
  if (path.toLowerCase().endsWith('.pdf')) {
    throw new TextFileError(
      { reason: 'binary', bytes: info.size },
      `at-file: "${path}" is a PDF; PDF extraction is not supported. Convert it to .txt or .md before attaching it`,
    )
  }
  if (info.size > maxBytes) {
    throw new TextFileError(
      { reason: 'oversized', bytes: info.size, limit: maxBytes },
      `at-file: "${path}" is ${String(info.size)} bytes; maxFileBytes is ${String(maxBytes)}. ` +
      'For text files, override the complete dsh-at-file config in the profile cordis.patch.yml',
    )
  }
  const buffer = await raceAbort(readFile(path), signal).catch((error: unknown) => {
    /* v8 ignore start -- an abort or failure landing between stat and read needs a stalled or racing filesystem. */
    signal?.throwIfAborted()
    throw new TextFileError({ reason: 'unreadable' }, `at-file: cannot read "${path}": ${messageOf(error)}`)
    /* v8 ignore stop */
  })
  if (buffer.subarray(0, BINARY_PROBE_BYTES).includes(0)) {
    throw new TextFileError({ reason: 'binary', bytes: buffer.byteLength }, `at-file: "${path}" is a binary file`)
  }
  try {
    UTF8_DECODER.decode(buffer)
  } catch {
    throw new TextFileError(
      { reason: 'binary', bytes: buffer.byteLength },
      `at-file: "${path}" is not valid UTF-8 text`,
    )
  }
  return { content: buffer.toString('utf8'), bytes: buffer.byteLength }
}

/**
 * Represent one directory recursively as a metadata manifest or bounded text.
 * @param path - absolute directory path (files and missing entries are refused).
 * @param options - file-count, per-file, aggregate, ignore, and mode bounds.
 * @param signal - caller lifetime.
 * @returns deterministic metadata, accepted text, omissions, and truncation state.
 */
export async function readTree(
  path: string,
  options: ReadTreeOptions,
  signal?: AbortSignal,
): Promise<ReadTreeResult> {
  if (!isAbsolute(path)) {
    throw new Error(`at-file: "${path}" is not an absolute path`)
  }
  const info = await raceAbort(stat(path), signal).catch((error: unknown) => {
    /* v8 ignore start -- an abort or failure landing during the stat needs a stalled or racing filesystem. */
    signal?.throwIfAborted()
    throw new Error(`at-file: cannot read "${path}": ${messageOf(error)}`)
    /* v8 ignore stop */
  })
  if (!info.isDirectory()) {
    throw new Error(`at-file: "${path}" is not a directory`)
  }
  const index = await indexWorkspace(path, options, signal)
  if (options.mode === 'manifest') {
    const entries: ReadTreeEntry[] = []
    for (const entry of index.files) {
      signal?.throwIfAborted()
      if (entry.kind === 'dir') {
        entries.push({ relative: entry.relative, kind: 'dir' })
        continue
      }
      const entryInfo = await raceAbort(stat(entry.path), signal).catch(
        /* v8 ignore next -- only an index/stat race where this file disappears makes its size unknown. */
        () => undefined,
      )
      signal?.throwIfAborted()
      entries.push({
        relative: entry.relative,
        kind: 'file',
        /* v8 ignore next -- only an index/stat race where this file disappears makes its size unknown. */
        ...(entryInfo === undefined ? {} : { bytes: entryInfo.size }),
      })
    }
    return { mode: 'manifest', entries, files: [], skipped: [], includedBytes: 0, truncated: index.truncated }
  }
  const files: ReadTreeFile[] = []
  const skipped: ReadTreeSkipped[] = []
  let includedBytes = 0
  for (const entry of index.files) {
    if (entry.kind !== 'file') continue
    signal?.throwIfAborted()
    let content: FileContent
    try {
      content = await readFileText(entry.path, options.maxFileBytes, signal)
    } catch (error: unknown) {
      signal?.throwIfAborted()
      /* v8 ignore start -- indexed absolute regular files make every readFileText failure classified unless their type races. */
      if (!(error instanceof TextFileError)) {
        skipped.push({ relative: entry.relative, reason: 'unreadable' })
        continue
      }
      /* v8 ignore stop */
      skipped.push({ relative: entry.relative, ...error.failure })
      continue
    }
    if (includedBytes + content.bytes > options.maxTotalBytes) {
      skipped.push({
        relative: entry.relative,
        reason: 'aggregate-limit',
        bytes: content.bytes,
        limit: options.maxTotalBytes,
      })
      continue
    }
    includedBytes += content.bytes
    files.push({ path: entry.path, relative: entry.relative, content: content.content, bytes: content.bytes })
  }
  return { mode: 'bounded', entries: [], files, skipped, includedBytes, truncated: index.truncated }
}
