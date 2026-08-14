/** Built-in vector icons for workspace path candidates. */
import type { ReactElement, ReactNode } from 'react'
import type { FileEntry } from './remote.ts'

export type FileIconKind = 'folder' | 'code' | 'text' | 'pdf' | 'image' | 'data' | 'archive' | 'file'

const CODE_EXTENSIONS = new Set([
  'c', 'cc', 'cpp', 'cs', 'css', 'dart', 'go', 'h', 'hpp', 'html', 'java', 'js', 'jsx', 'kt', 'kts',
  'lua', 'mjs', 'php', 'py', 'rb', 'rs', 'scss', 'sh', 'sql', 'svelte', 'swift', 'ts', 'tsx', 'vue',
])
const TEXT_EXTENSIONS = new Set(['adoc', 'log', 'md', 'mdx', 'rst', 'text', 'txt'])
const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp'])
const DATA_EXTENSIONS = new Set(['conf', 'config', 'csv', 'ini', 'json', 'jsonl', 'toml', 'tsv', 'xml', 'yaml', 'yml'])
const ARCHIVE_EXTENSIONS = new Set(['7z', 'bz2', 'gz', 'jar', 'rar', 'tar', 'tgz', 'war', 'xz', 'zip'])
const TEXT_NAMES = new Set(['authors', 'changelog', 'copying', 'license', 'readme'])
const CODE_NAMES = new Set(['dockerfile', 'gemfile', 'makefile', 'rakefile'])

/** Classify one indexed path without reading it. */
export function fileIconKind(file: Pick<FileEntry, 'kind' | 'relative'>): FileIconKind {
  if (file.kind === 'dir') return 'folder'
  const basename = file.relative.slice(file.relative.lastIndexOf('/') + 1).toLowerCase()
  const dot = basename.lastIndexOf('.')
  const extension = dot > 0 ? basename.slice(dot + 1) : ''
  if (extension === 'pdf') return 'pdf'
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (ARCHIVE_EXTENSIONS.has(extension)) return 'archive'
  if (CODE_EXTENSIONS.has(extension) || CODE_NAMES.has(basename)) return 'code'
  if (DATA_EXTENSIONS.has(extension) || basename === '.env' || basename.startsWith('.env.')) return 'data'
  if (TEXT_EXTENSIONS.has(extension) || TEXT_NAMES.has(basename)) return 'text'
  return 'file'
}

function IconFrame({ kind, color, children }: { kind: FileIconKind; color: string; children: ReactNode }): ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      data-file-icon={kind}
      style={{ color }}
    >
      {children}
    </svg>
  )
}

const ICONS: Record<FileIconKind, ReactElement> = {
  folder: (
    <IconFrame kind="folder" color="#e8a23a">
      <path d="M1.75 4.25A1.25 1.25 0 0 1 3 3h3l1.25 1.5H13A1.25 1.25 0 0 1 14.25 5.75v6A1.25 1.25 0 0 1 13 13H3a1.25 1.25 0 0 1-1.25-1.25v-7.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </IconFrame>
  ),
  code: (
    <IconFrame kind="code" color="#4d9de0">
      <path d="m6.25 4.25-3 3.75 3 3.75M9.75 4.25l3 3.75-3 3.75" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </IconFrame>
  ),
  text: (
    <IconFrame kind="text" color="#8c98a5">
      <path d="M3 1.75h6l4 4v8.5H3V1.75Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9 1.75v4h4M5.25 8.25h5.5M5.25 10.75h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </IconFrame>
  ),
  pdf: (
    <IconFrame kind="pdf" color="#e15b64">
      <path d="M3 1.75h6l4 4v8.5H3V1.75Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9 1.75v4h4M5 10.75c1.25-2.5 2.25-3.75 3-3.75.9 0 .85 3 2.75 3" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" strokeLinejoin="round" />
    </IconFrame>
  ),
  image: (
    <IconFrame kind="image" color="#55a875">
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="5.25" cy="5.75" r="1" fill="currentColor" />
      <path d="m3.5 12 3.25-3.5 2 2 1.5-1.5 2.25 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </IconFrame>
  ),
  data: (
    <IconFrame kind="data" color="#9a78d1">
      <ellipse cx="8" cy="4" rx="5" ry="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 4v4c0 1.1 2.24 2 5 2s5-.9 5-2V4M3 8v4c0 1.1 2.24 2 5 2s5-.9 5-2V8" stroke="currentColor" strokeWidth="1.2" />
    </IconFrame>
  ),
  archive: (
    <IconFrame kind="archive" color="#c18752">
      <path d="M2.25 3h11.5v3H2.25V3ZM3.25 6h9.5v7.5h-9.5V6Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6.25 8.5h3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </IconFrame>
  ),
  file: (
    <IconFrame kind="file" color="#8c98a5">
      <path d="M3 1.75h6l4 4v8.5H3V1.75Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9 1.75v4h4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </IconFrame>
  ),
}

/** SVG element rendered by the shared input-trigger menu. */
export function fileIcon(file: Pick<FileEntry, 'kind' | 'relative'>): ReactElement {
  return ICONS[fileIconKind(file)]
}
