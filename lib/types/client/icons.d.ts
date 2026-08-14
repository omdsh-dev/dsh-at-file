/** Built-in vector icons for workspace path candidates. */
import type { ReactElement } from 'react';
import type { FileEntry } from './remote.ts';
export type FileIconKind = 'folder' | 'code' | 'text' | 'pdf' | 'image' | 'data' | 'archive' | 'file';
/** Classify one indexed path without reading it. */
export declare function fileIconKind(file: Pick<FileEntry, 'kind' | 'relative'>): FileIconKind;
/** SVG element rendered by the shared input-trigger menu. */
export declare function fileIcon(file: Pick<FileEntry, 'kind' | 'relative'>): ReactElement;
