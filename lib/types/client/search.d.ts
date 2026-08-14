/**
 * Pure file-search ranking for the @file menu. A plain query matches basenames
 * only, so letters spread across a long generated path cannot create false
 * positives. Queries containing a slash match path segments in order. The
 * empty query remains a directory-first alphabetical browse view.
 */
import type { FileEntry } from './remote.ts';
/** Ranked top-N paths matching `query` (ties break by kind, length, then path). */
export declare function rankFiles(files: readonly FileEntry[], query: string, limit: number): readonly FileEntry[];
