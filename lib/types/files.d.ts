import type { DirectoryMode, FileContent, FileEntry, ReadTreeResult } from './contract.ts';
/** Options for one bounded index pass. */
export interface IndexOptions {
    /** Hard cap on collected files. */
    readonly maxFiles: number;
    /** Directory basenames the walk skips (children never enqueue). */
    readonly ignoreDirs: readonly string[];
}
/** One index pass result: the sorted file list plus the honest truncation flag. */
export interface WorkspaceIndex {
    readonly files: readonly FileEntry[];
    /** True when the walk hit `maxFiles` before the tree was exhausted. */
    readonly truncated: boolean;
}
/** Bounds and representation for one directory mention. */
export interface ReadTreeOptions extends IndexOptions {
    readonly maxFileBytes: number;
    readonly maxTotalBytes: number;
    readonly mode: DirectoryMode;
}
/**
 * Collect every regular file under `root` (bounded, name-sorted).
 * @param root - workspace root to walk.
 * @param options - cap and ignore list.
 * @param signal - caller lifetime; every filesystem await races it.
 * @returns the sorted file list and the truncation flag.
 */
export declare function indexWorkspace(root: string, options: IndexOptions, signal?: AbortSignal): Promise<WorkspaceIndex>;
/**
 * Read one text file under the complete-result bounds.
 * @param path - absolute path (relative values are refused, never rebased).
 * @param maxBytes - hard cap; larger files are refused, never truncated.
 * @param signal - caller lifetime.
 * @returns the UTF-8 content with its byte length.
 * @throws for non-absolute paths, missing entries, directories, oversized, and binary files.
 */
export declare function readFileText(path: string, maxBytes: number, signal?: AbortSignal): Promise<FileContent>;
/**
 * Represent one directory recursively as a metadata manifest or bounded text.
 * @param path - absolute directory path (files and missing entries are refused).
 * @param options - file-count, per-file, aggregate, ignore, and mode bounds.
 * @param signal - caller lifetime.
 * @returns deterministic metadata, accepted text, omissions, and truncation state.
 */
export declare function readTree(path: string, options: ReadTreeOptions, signal?: AbortSignal): Promise<ReadTreeResult>;
