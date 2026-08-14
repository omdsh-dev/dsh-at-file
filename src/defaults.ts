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
