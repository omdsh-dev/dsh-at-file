/**
 * The atFile wire contract, shared verbatim by the host manifest
 * (`ctx.typert.register` in typert.ts) and the client contribution
 * (`ctx.remote.$mount` in client/remote.ts). The only Remote endpoint is the
 * workspace index search. File bytes never cross this plugin boundary; the
 * Host only marks validated user-selected paths at `agent/pre-step`.
 */
import { z } from 'zod';
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol';
/** One indexed workspace entry (a file or a directory), with its display path. */
export interface FileEntry {
    readonly path: string;
    readonly relative: string;
    readonly kind: 'file' | 'dir';
}
/** File-name filters attached to one canonical workspace path. */
export interface WorkspaceIgnoreFiles {
    /** Canonical workspace directory path supplied by the Harness. */
    readonly workspace: string;
    /** Additional basenames ignored only inside this workspace. */
    readonly ignoreFiles: string[];
}
/** The `at-file` settings namespace's durable shape (host and client share it). */
export interface AtFileSettings {
    /** Whether the @file surface is enabled; false hides picker, dock, and reference injection. */
    readonly enabled: boolean;
    /** File basenames excluded from every workspace index, matched case-insensitively. */
    readonly ignoreFiles: string[];
    /** Workspace-specific basenames added to the global filters. */
    readonly workspaceIgnoreFiles: WorkspaceIgnoreFiles[];
}
/** Wire codec: one session identity (branded string on the wire). */
export declare const sessionIdSchema: z.ZodString;
/** Wire codec: one workspace entry (file or directory). */
export declare const fileEntrySchema: z.ZodReadonly<z.ZodObject<{
    path: z.ZodString;
    relative: z.ZodString;
    kind: z.ZodEnum<{
        file: "file";
        dir: "dir";
    }>;
}, z.core.$strip>>;
/** The atFile Remote namespace's strict invocation descriptors. */
export declare const AT_FILE_INVOCATIONS: readonly InvocationDescriptor[];
