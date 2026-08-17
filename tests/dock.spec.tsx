// @vitest-environment jsdom
/**
 * Attached-files dock presentation behavior: rows render for the @path
 * tokens parsed from the draft, the path button opens the file on the host,
 * the × removes exactly one token, and the settings switch hides the strip.
 */
import { describe, expect, it, vi } from 'vitest'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import type { ReactElement } from 'react'
import { draftMentions, FilesDock, withoutToken, type AtFileDockProps } from '../src/client/FilesDock.tsx'
import { fmt, zh } from '../src/client/locales.ts'
import { protectPastedMentions } from '../src/paste.ts'

// jsdom + React 18 without the act harness: flushSync commits renders, and
// plain clicks dispatch real handlers.
globalThis.IS_REACT_ACT_ENVIRONMENT = false

const t = (key: string, params?: Record<string, string>): string => fmt(zh[key] ?? key, params)

/** Minimal runtime stub cast onto the derived dock props. */
function props(over: {
  draft?: string
  onOpen?: (relative: string) => void
  setDraft?: (text: string) => void
  enabled?: boolean
} = {}): AtFileDockProps {
  const stub = {
    session: {},
    input: {
      draft: over.draft ?? 'fix @src/client/view.ts please',
      imageIds: [],
      draftRev: 0,
      phase: 'plain',
      occurrences: [],
      queue: [],
    },
    inputActions: {
      setDraft: over.setDraft ?? (() => {}),
      addImages: () => false,
      removeImage: () => {},
      pruneImages: () => {},
      submit: () => {},
    },
    onOpen: over.onOpen ?? (() => {}),
    useScope: (selector: (snapshot: { value?: { enabled?: boolean } }) => boolean) =>
      selector(over.enabled === undefined ? {} : { value: { enabled: over.enabled } }),
    t,
  }
  return stub as unknown as AtFileDockProps
}

function mount(element: ReactElement): { root: Root; container: HTMLDivElement } {
  const container = document.createElement('div')
  const root = createRoot(container)
  flushSync(() => { root.render(element) })
  return { root, container }
}

function click(element: Element | null): void {
  expect(element).not.toBeNull()
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('draftMentions', () => {
  it('parses @path tokens with their spans, stripping the directory slash', () => {
    expect(draftMentions('a @x.ts and @dir/ end')).toEqual([
      { relative: 'x.ts', start: 2, end: 7 },
      { relative: 'dir', start: 12, end: 17 },
    ])
  })

  it('deduplicates repeated tokens', () => {
    expect(draftMentions('@a.ts @a.ts')).toEqual([{ relative: 'a.ts', start: 0, end: 5 }])
  })

  it('computes the token-free draft', () => {
    expect(withoutToken('@a.ts rest', 0, 5)).toBe(' rest')
  })
})

describe('FilesDock', () => {
  it('renders one row per @path token in the draft', () => {
    const { root, container } = mount(<FilesDock {...props({ draft: '@a.ts and @src/b.ts' })} />)
    expect(container.querySelectorAll('[data-at-file-row]')).toHaveLength(2)
    expect(container.textContent).toContain('a.ts')
    expect(container.textContent).toContain('src/b.ts')
    root.unmount()
  })

  it('renders nothing when the draft has no @path tokens', () => {
    const { root, container } = mount(<FilesDock {...props({ draft: 'plain text' })} />)
    expect(container.querySelectorAll('[data-at-file-row]')).toHaveLength(0)
    root.unmount()
  })

  it('does not render protected pasted tokens', () => {
    const { root, container } = mount(<FilesDock {...props({ draft: protectPastedMentions('@a.ts') })} />)
    expect(container.querySelectorAll('[data-at-file-row]')).toHaveLength(0)
    root.unmount()
  })

  it('hides the strip while the settings switch is off', () => {
    const { root, container } = mount(<FilesDock {...props({ draft: '@a.ts', enabled: false })} />)
    expect(container.querySelectorAll('[data-at-file-row]')).toHaveLength(0)
    root.unmount()
  })

  it('defaults to enabled before the first settings read', () => {
    const { root, container } = mount(<FilesDock {...props({ draft: '@a.ts', enabled: undefined })} />)
    expect(container.querySelectorAll('[data-at-file-row]')).toHaveLength(1)
    root.unmount()
  })

  it('opens the file through the host opener when the path is clicked', () => {
    const onOpen = vi.fn()
    const { root, container } = mount(<FilesDock {...props({ onOpen })} />)
    click(container.querySelector('[data-at-file-row] button'))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith('src/client/view.ts')
    root.unmount()
  })

  it('removes exactly one token from the draft', () => {
    const setDraft = vi.fn()
    const { root, container } = mount(<FilesDock {...props({ draft: '@a.ts @b.ts', setDraft })} />)
    const rows = container.querySelectorAll('[data-at-file-row]')
    click(rows[1]!.querySelectorAll('button')[1]!)
    expect(setDraft).toHaveBeenCalledWith('@a.ts ')
    root.unmount()
  })
})
