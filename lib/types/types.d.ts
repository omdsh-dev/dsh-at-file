/**
 * dsh-at-file host types: the plugin configuration face. The wire contract
 * types live in `contract.ts` and are re-exported here for the host entry.
 */
export type { AtFileSettings, DirectoryMode, FileEntry } from './contract.ts';
import type { DirectoryMode } from './contract.ts';
/** Resolved plugin configuration (schema defaults applied). */
export interface ResolvedConfig {
    /** Hard cap on indexed entries per workspace; the walk stops and reports truncation. */
    readonly maxIndexedFiles: number;
    /** Hard cap on one file read; larger files are refused, never truncated. */
    readonly maxFileBytes: number;
    /** Hard cap on one serialized directory attachment. */
    readonly maxTotalBytes: number;
    /** Metadata-only by default; bounded mode includes text within the aggregate cap. */
    readonly directoryMode: DirectoryMode;
    /** Directory basenames the index walk skips entirely. */
    readonly ignoreDirs: readonly string[];
}
