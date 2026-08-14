/** Built-in file icon classification and SVG rendering. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fileIcon, fileIconKind, type FileIconKind } from '../src/client/icons.tsx'
import type { FileEntry } from '../src/client/remote.ts'

function entry(relative: string, kind: 'file' | 'dir' = 'file'): FileEntry {
  return { path: `/ws/${relative}`, relative, kind }
}

describe('file icons', () => {
  it('classifies common workspace path types without reading them', () => {
    const cases: readonly [FileEntry, FileIconKind][] = [
      [entry('src', 'dir'), 'folder'],
      [entry('src/index.ts'), 'code'],
      [entry('Makefile'), 'code'],
      [entry('README.md'), 'text'],
      [entry('LICENSE'), 'text'],
      [entry('docs/spec.pdf'), 'pdf'],
      [entry('assets/logo.png'), 'image'],
      [entry('data/config.json'), 'data'],
      [entry('.env'), 'data'],
      [entry('.env.local'), 'data'],
      [entry('release.tar.gz'), 'archive'],
      [entry('payload.bin'), 'file'],
    ]
    expect(cases.map(([file]) => fileIconKind(file))).toEqual(cases.map(([, kind]) => kind))
  })

  it('renders every built-in icon as a fixed-size inline SVG', () => {
    const cases: readonly [FileEntry, FileIconKind][] = [
      [entry('src', 'dir'), 'folder'],
      [entry('index.ts'), 'code'],
      [entry('notes.txt'), 'text'],
      [entry('spec.pdf'), 'pdf'],
      [entry('logo.svg'), 'image'],
      [entry('data.yaml'), 'data'],
      [entry('release.zip'), 'archive'],
      [entry('payload.bin'), 'file'],
    ]
    for (const [file, kind] of cases) {
      const markup = renderToStaticMarkup(fileIcon(file))
      expect(markup).toContain('<svg')
      expect(markup).toContain('width="16"')
      expect(markup).toContain(`data-file-icon="${kind}"`)
    }
  })
})
