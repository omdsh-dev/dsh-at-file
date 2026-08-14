import type { AtFileSettings, WorkspaceIgnoreFiles } from './contract.ts'

/** Directory basenames omitted from the picker unless the profile supplies its own list. */
export const DEFAULT_IGNORE_DIRS = [
  '.git',
  '.hg',
  '.svn',
  '.idea',
  '.vs',
  '.vscode',
  '.fleet',
  '.history',
  '.metadata',
  '.settings',
  'node_modules',
  'bower_components',
  'vendor',
  'Pods',
  '.gradle',
  '.kotlin',
  '.cxx',
  '.externalNativeBuild',
  '.dart_tool',
  '.swiftpm',
  '.build',
  '.cache',
  '.parcel-cache',
  '.turbo',
  '.nx',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.tox',
  '.venv',
  'venv',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
  '.angular',
  'build',
  'bin',
  'dist',
  'out',
  'target',
  'obj',
  'coverage',
  'DerivedData',
  'xcuserdata',
  'CMakeFiles',
  'cmake-build-debug',
  'cmake-build-release',
  'cmake-build-relwithdebinfo',
  'cmake-build-minsizerel',
  '_deps',
  '.godot',
  'Library',
  'Temp',
  'Logs',
  'Binaries',
  'Intermediate',
  'Saved',
  'DerivedDataCache',
] as const

/** File basenames omitted from the picker unless the Web setting replaces the list. */
export const DEFAULT_IGNORE_FILES = [
  'desktop.ini',
  'Thumbs.db',
  '.DS_Store',
] as const

/** Trim file basenames and remove empty or case-insensitive duplicate entries. */
export function normalizeIgnoreFiles(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const value of values) {
    const name = value.trim()
    const key = name.toLowerCase()
    if (name === '' || seen.has(key)) continue
    seen.add(key)
    normalized.push(name)
  }
  return normalized
}

/** Stable comparison key for one canonical workspace path. */
export function workspacePathKey(value: string): string {
  const slashed = value.replace(/\\/gu, '/')
  const withoutTrailing = slashed === '/' || /^[a-z]:\/$/iu.test(slashed)
    ? slashed
    : slashed.replace(/\/+$/u, '')
  return /^[a-z]:\//iu.test(withoutTrailing) || withoutTrailing.startsWith('//')
    ? withoutTrailing.toLowerCase()
    : withoutTrailing
}

/** Merge duplicate workspace rows and normalize every file-name list. */
export function normalizeWorkspaceIgnoreFiles(
  entries: readonly WorkspaceIgnoreFiles[],
): WorkspaceIgnoreFiles[] {
  const order: string[] = []
  const byWorkspace = new Map<string, WorkspaceIgnoreFiles>()
  for (const entry of entries) {
    const key = workspacePathKey(entry.workspace)
    if (key === '') continue
    const current = byWorkspace.get(key)
    if (current === undefined) order.push(key)
    byWorkspace.set(key, {
      workspace: current?.workspace ?? entry.workspace,
      ignoreFiles: normalizeIgnoreFiles([
        ...(current?.ignoreFiles ?? []),
        ...entry.ignoreFiles,
      ]),
    })
  }
  return order.map(key => byWorkspace.get(key) as WorkspaceIgnoreFiles)
}

/** Workspace-local file-name filters for one canonical cwd. */
export function workspaceIgnoreFilesFor(
  entries: readonly WorkspaceIgnoreFiles[],
  workspace: string,
): string[] {
  const key = workspacePathKey(workspace)
  const entry = normalizeWorkspaceIgnoreFiles(entries)
    .find(candidate => workspacePathKey(candidate.workspace) === key)
  return entry?.ignoreFiles ?? []
}

/** Effective file-name filters for one workspace: global rules plus local additions. */
export function effectiveIgnoreFiles(settings: AtFileSettings, workspace: string): string[] {
  return normalizeIgnoreFiles([
    ...settings.ignoreFiles,
    ...workspaceIgnoreFilesFor(settings.workspaceIgnoreFiles ?? [], workspace),
  ])
}

/** Stable cache key covering every file-name filter setting. */
export function ignoreFilesSettingsKey(settings: AtFileSettings): string {
  const global = normalizeIgnoreFiles(settings.ignoreFiles).map(name => name.toLowerCase()).sort()
  const workspaces = normalizeWorkspaceIgnoreFiles(settings.workspaceIgnoreFiles ?? [])
    .map(entry => ({
      workspace: workspacePathKey(entry.workspace),
      ignoreFiles: entry.ignoreFiles.map(name => name.toLowerCase()).sort(),
    }))
    .sort((left, right) => left.workspace.localeCompare(right.workspace))
  return JSON.stringify({ global, workspaces })
}
