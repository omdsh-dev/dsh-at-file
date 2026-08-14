/**
 * The atFile wire contract, shared verbatim by the host manifest
 * (`ctx.typert.register` in typert.ts) and the client contribution
 * (`ctx.remote.$mount` in client/remote.ts). The service exposes workspace
 * index search and plugin-owned settings access. File bytes never cross this
 * boundary; the Host only marks validated paths at `agent/pre-step`.
 */
import { z } from 'zod';
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol';
/** One indexed workspace entry (a file or a directory), with its display path. */
export interface FileEntry {
    readonly path: string;
    readonly relative: string;
    readonly kind: 'file' | 'dir';
}
/** One file filter. Legacy string values remain accepted as exact, insensitive rules. */
export interface FileIgnoreRule {
    readonly kind: 'exact' | 'regex';
    readonly pattern: string;
    readonly caseSensitive: boolean;
}
/** Durable and wire-compatible input for one file filter. */
export type FileIgnoreRuleInput = string | FileIgnoreRule;
/** File-name filters attached to one canonical workspace path. */
export interface WorkspaceIgnoreFiles {
    /** Canonical workspace directory path supplied by the Harness. */
    readonly workspace: string;
    /** Additional basenames ignored only inside this workspace. */
    readonly ignoreFiles: FileIgnoreRuleInput[];
}
/** The `at-file` settings namespace's durable shape (host and client share it). */
export interface AtFileSettings {
    /** Whether the @file surface is enabled; false hides picker, dock, and reference injection. */
    readonly enabled: boolean;
    /** Global Exact and Regex basename filters; legacy strings are insensitive Exact rules. */
    readonly ignoreFiles: FileIgnoreRuleInput[];
    /** Workspace-specific filters added to the global filters. */
    readonly workspaceIgnoreFiles: WorkspaceIgnoreFiles[];
}
/** One field update sent through the plugin-owned settings Remote. */
export type AtFileSettingsUpdate = {
    readonly field: 'enabled';
    readonly value: boolean;
} | {
    readonly field: 'ignoreFiles';
    readonly value: FileIgnoreRuleInput[];
} | {
    readonly field: 'workspaceIgnoreFiles';
    readonly value: WorkspaceIgnoreFiles[];
};
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
/** Strict wire codec for one structured file filter. */
export declare const fileIgnoreRuleSchema: z.ZodReadonly<z.ZodObject<{
    kind: z.ZodEnum<{
        exact: "exact";
        regex: "regex";
    }>;
    pattern: z.ZodString;
    caseSensitive: z.ZodBoolean;
}, z.core.$strip>>;
/** Strict wire codec accepting both legacy strings and structured filters. */
export declare const fileIgnoreRuleInputSchema: z.ZodUnion<readonly [z.ZodString, z.ZodReadonly<z.ZodObject<{
    kind: z.ZodEnum<{
        exact: "exact";
        regex: "regex";
    }>;
    pattern: z.ZodString;
    caseSensitive: z.ZodBoolean;
}, z.core.$strip>>]>;
/** Strict wire codec for one workspace-specific filter row. */
export declare const workspaceIgnoreFilesSchema: z.ZodReadonly<z.ZodObject<{
    workspace: z.ZodString;
    ignoreFiles: z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodEnum<{
            exact: "exact";
            regex: "regex";
        }>;
        pattern: z.ZodString;
        caseSensitive: z.ZodBoolean;
    }, z.core.$strip>>]>>;
}, z.core.$strip>>;
/** Strict wire codec for the resolved at-file settings section. */
export declare const atFileSettingsSchema: z.ZodReadonly<z.ZodObject<{
    enabled: z.ZodBoolean;
    ignoreFiles: z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodEnum<{
            exact: "exact";
            regex: "regex";
        }>;
        pattern: z.ZodString;
        caseSensitive: z.ZodBoolean;
    }, z.core.$strip>>]>>;
    workspaceIgnoreFiles: z.ZodArray<z.ZodReadonly<z.ZodObject<{
        workspace: z.ZodString;
        ignoreFiles: z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodReadonly<z.ZodObject<{
            kind: z.ZodEnum<{
                exact: "exact";
                regex: "regex";
            }>;
            pattern: z.ZodString;
            caseSensitive: z.ZodBoolean;
        }, z.core.$strip>>]>>;
    }, z.core.$strip>>>;
}, z.core.$strip>>;
/** Strict wire codec for one field update. */
export declare const atFileSettingsUpdateSchema: z.ZodDiscriminatedUnion<[z.ZodReadonly<z.ZodObject<{
    field: z.ZodLiteral<"enabled">;
    value: z.ZodBoolean;
}, z.core.$strip>>, z.ZodReadonly<z.ZodObject<{
    field: z.ZodLiteral<"ignoreFiles">;
    value: z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodReadonly<z.ZodObject<{
        kind: z.ZodEnum<{
            exact: "exact";
            regex: "regex";
        }>;
        pattern: z.ZodString;
        caseSensitive: z.ZodBoolean;
    }, z.core.$strip>>]>>;
}, z.core.$strip>>, z.ZodReadonly<z.ZodObject<{
    field: z.ZodLiteral<"workspaceIgnoreFiles">;
    value: z.ZodArray<z.ZodReadonly<z.ZodObject<{
        workspace: z.ZodString;
        ignoreFiles: z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodReadonly<z.ZodObject<{
            kind: z.ZodEnum<{
                exact: "exact";
                regex: "regex";
            }>;
            pattern: z.ZodString;
            caseSensitive: z.ZodBoolean;
        }, z.core.$strip>>]>>;
    }, z.core.$strip>>>;
}, z.core.$strip>>], "field">;
/** The atFile Remote namespace's strict invocation descriptors. */
export declare const AT_FILE_INVOCATIONS: readonly InvocationDescriptor[];
