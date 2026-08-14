/**
 * Pure file-search ranking for the @file menu. A plain query matches basenames
 * only, so letters spread across a long generated path cannot create false
 * positives. Queries containing a slash match path segments in order. The
 * empty query remains a directory-first alphabetical browse view.
 */
import type { FileEntry } from './remote.ts'

/** Ranked top-N paths matching `query` (ties break by kind, length, then path). */
export function rankFiles(
  files: readonly FileEntry[],
  query: string,
  limit: number,
): readonly FileEntry[] {
  const q = query.trim().toLowerCase()
  if (q === '') {
    return [...files].sort(byDefault).slice(0, limit)
  }
  return files
    .map(file => ({ file, score: scorePath(file.relative, q) }))
    .filter(entry => entry.score >= 0)
    .sort((a, b) => b.score - a.score
      || (a.file.kind === 'dir' ? 1 : 0) - (b.file.kind === 'dir' ? 1 : 0)
      || a.file.relative.length - b.file.relative.length
      || (a.file.relative < b.file.relative ? -1 : 1))
    .slice(0, limit)
    .map(entry => entry.file)
}

/** Default order: directories first (alphabetical), then files (alphabetical). */
function byDefault(a: FileEntry, b: FileEntry): number {
  if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
  // Unique relative paths make the equality arm unreachable.
  /* v8 ignore next -- identical paths cannot both exist in one index. */
  return a.relative < b.relative ? -1 : 1
}

/** Match one normalized query against a basename or an ordered path segment list. */
function scorePath(path: string, q: string): number {
  const lowerPath = path.toLowerCase()
  const pathSegments = lowerPath.split('/')
  const normalizedQuery = q.replaceAll('\\', '/')
  const querySegments = normalizedQuery.split('/').filter(Boolean)
  if (!normalizedQuery.includes('/')) return scoreName(pathSegments.at(-1) as string, querySegments[0] as string)
  if (querySegments.length === 0) return -1
  if (normalizedQuery.endsWith('/')) {
    const prefix = normalizedQuery.slice(0, -1)
    if (!lowerPath.startsWith(`${prefix}/`)) return -1
    const depth = lowerPath.slice(prefix.length + 1).split('/').length
    return 6000 - (depth - 1) * 100 - path.length
  }

  let cursor = 0
  let total = 0
  let lastMatch = -1
  for (const querySegment of querySegments) {
    let matchedIndex = -1
    let matchedScore = -1
    for (let index = cursor; index < pathSegments.length; index++) {
      const score = scoreName(pathSegments[index] as string, querySegment)
      if (score < 0) continue
      matchedScore = score
      matchedIndex = index
      break
    }
    if (matchedIndex < 0) return -1
    total += matchedScore
    lastMatch = matchedIndex
    cursor = matchedIndex + 1
  }
  const basenameBonus = lastMatch === pathSegments.length - 1 ? 1000 : 0
  return total + basenameBonus - path.length
}

/** Exact, prefix, substring, then compact subsequence scoring for one name. */
function scoreName(name: string, query: string): number {
  if (name === query) return 5000
  if (name.startsWith(query)) return 4500 - name.length
  const contained = name.indexOf(query)
  if (contained >= 0) return 4000 - contained * 10 - name.length
  let first = -1
  let previous = -1
  let gaps = 0
  let at = 0
  for (const ch of query) {
    const found = name.indexOf(ch, at)
    if (found < 0) return -1
    if (first < 0) first = found
    if (previous >= 0) gaps += found - previous - 1
    previous = found
    at = found + 1
  }
  return 3000 - first * 10 - gaps * 5 - name.length
}
