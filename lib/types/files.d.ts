import type { Dir } from 'node:fs';
import type { FileEntry, FileIgnoreRuleInput } from './contract.ts';
/** Options for one bounded index pass. */
export interface IndexOptions {
    /** Hard cap on collected files. */
    readonly maxFiles: number;
    /** Directory basenames the walk skips (children never enqueue). */
    readonly ignoreDirs: readonly string[];
    /** Exact and Regex basename filters applied before files enter the index. */
    readonly ignoreFiles: readonly FileIgnoreRuleInput[];
}
/** One index pass result: the sorted file list plus the honest truncation flag. */
export interface WorkspaceIndex {
    readonly files: readonly FileEntry[];
    /** True when the walk hit `maxFiles` before the tree was exhausted. */
    readonly truncated: boolean;
}
/** Directory opener seam used by the real filesystem and deterministic tests. */
export type OpenWorkspaceDirectory = (path: string) => Promise<Dir>;
/**
 * Collect every regular file under `root` (bounded, name-sorted).
 * @param root - workspace root to walk.
 * @param options - cap and ignore list.
 * @param signal - caller lifetime; every filesystem await races it.
 * @param openDirectory - directory opener; defaults to node:fs.
 * @returns the sorted file list and the truncation flag.
 */
export declare function indexWorkspace(root: string, options: IndexOptions, signal?: AbortSignal, openDirectory?: OpenWorkspaceDirectory): Promise<WorkspaceIndex>;
