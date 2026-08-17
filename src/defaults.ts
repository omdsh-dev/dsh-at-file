import type { AtFileSettings, FileIgnoreRule, FileIgnoreRuleInput, WorkspaceIgnoreFiles } from './contract.ts'

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

/** Fresh settings defaults for Host and browser initialization. */
export function defaultAtFileSettings(): AtFileSettings {
  return {
    enabled: true,
    ignoreFiles: [...DEFAULT_IGNORE_FILES],
    workspaceIgnoreFiles: [],
    ignorePastedMentions: true,
  }
}

/** Trim rules and remove empty entries or duplicates with identical matching semantics. */
export function normalizeIgnoreFiles(values: readonly FileIgnoreRuleInput[]): FileIgnoreRuleInput[] {
  const seen = new Set<string>()
  const normalized: FileIgnoreRuleInput[] = []
  for (const value of values) {
    const rule = normalizeIgnoreRule(value)
    if (rule === undefined) continue
    const key = ignoreRuleKey(rule)
    if (seen.has(key)) continue
    seen.add(key)
    // Keep legacy strings as strings so existing settings documents and callers
    // remain stable. New structured rules retain their explicit shape.
    normalized.push(typeof value === 'string' && rule.kind === 'exact' && !rule.caseSensitive
      ? rule.pattern
      : rule)
  }
  return normalized
}

/** Convert one legacy or structured setting value into its canonical rule. */
export function normalizeIgnoreRule(value: FileIgnoreRuleInput): FileIgnoreRule | undefined {
  if (typeof value === 'string') {
    const pattern = value.trim()
    return pattern === '' ? undefined : { kind: 'exact', pattern, caseSensitive: false }
  }
  const pattern = value.pattern.trim()
  if (pattern === '') return undefined
  const rule: FileIgnoreRule = {
    kind: value.kind,
    pattern,
    caseSensitive: value.caseSensitive,
  }
  if (rule.kind === 'regex') {
    try {
      new RegExp(rule.pattern, rule.caseSensitive ? '' : 'i')
    } catch (error) {
      /* v8 ignore next -- RegExp construction throws an Error in supported runtimes. */
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Invalid regular expression "${rule.pattern}": ${message}`)
    }
  }
  return rule
}

/** Stable identity for one rule, including matching semantics. */
export function ignoreRuleKey(value: FileIgnoreRuleInput): string {
  const rule = normalizeIgnoreRule(value)
  if (rule === undefined) return ''
  const pattern = rule.kind === 'exact' && !rule.caseSensitive ? rule.pattern.toLowerCase() : rule.pattern
  return JSON.stringify([rule.kind, pattern, rule.caseSensitive])
}

/** Compile rules once for a bounded directory walk. */
export function compileIgnoreRules(values: readonly FileIgnoreRuleInput[]): readonly FileIgnoreRule[] {
  return normalizeIgnoreFiles(values).map(value => normalizeIgnoreRule(value) as FileIgnoreRule)
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
): FileIgnoreRuleInput[] {
  const key = workspacePathKey(workspace)
  const entry = normalizeWorkspaceIgnoreFiles(entries)
    .find(candidate => workspacePathKey(candidate.workspace) === key)
  return entry?.ignoreFiles ?? []
}

/** Effective file-name filters for one workspace: global rules plus local additions. */
export function effectiveIgnoreFiles(settings: AtFileSettings, workspace: string): FileIgnoreRuleInput[] {
  return normalizeIgnoreFiles([
    ...settings.ignoreFiles,
    ...workspaceIgnoreFilesFor(settings.workspaceIgnoreFiles ?? [], workspace),
  ])
}

/** Stable cache key covering every file-name filter setting. */
export function ignoreFilesSettingsKey(settings: AtFileSettings): string {
  const global = normalizeIgnoreFiles(settings.ignoreFiles).map(ignoreRuleKey).sort()
  const workspaces = normalizeWorkspaceIgnoreFiles(settings.workspaceIgnoreFiles ?? [])
    .map(entry => ({
      workspace: workspacePathKey(entry.workspace),
      ignoreFiles: entry.ignoreFiles.map(ignoreRuleKey).sort(),
    }))
    .sort((left, right) => left.workspace.localeCompare(right.workspace))
  return JSON.stringify({ global, workspaces })
}
