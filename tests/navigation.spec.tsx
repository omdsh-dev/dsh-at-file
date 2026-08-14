// @vitest-environment jsdom
/** Arrow-right directory navigation behavior and DOM bridge coverage. */
import { useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { MenuState } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import {
  FolderNavigator, folderNavigationTarget, isFolderNavigationKey,
  type FolderNavigationInput, type FolderNavigatorProps,
} from '../src/client/FolderNavigator.tsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = false

const INPUT: FolderNavigationInput = { draft: '@src', draftRev: 4, phase: 'plain' }

function menu(candidate: { value?: string; atFileKind?: 'file' | 'dir' } = { value: 'src', atFileKind: 'dir' }): MenuState {
  return {
    open: true,
    hit: { trigger: '@', query: 'src', position: 'leading', span: { start: 0, end: 4, draftRev: 4 } },
    generation: 1,
    groups: [{ source: 'at-file', status: 'ready', items: [{ name: 'src', ...candidate }] }],
    highlight: { source: 'at-file', index: 0 },
  }
}

function mount(currentMenu = menu()): {
  root: Root
  textarea: HTMLTextAreaElement
  track: ReturnType<typeof vi.fn>
  setDraft: ReturnType<typeof vi.fn>
} {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const track = vi.fn()
  const setDraft = vi.fn()
  const controller = {
    menu: { getSnapshot: () => currentMenu, subscribe: () => () => {} },
    track,
  }
  function Harness() {
    const [input, setInput] = useState(INPUT)
    const props = {
      controller,
      useInput: (selector: (state: FolderNavigationInput) => unknown) => selector(input),
      inputActions: {
        setDraft: (draft: string) => {
          setDraft(draft)
          setInput(previous => ({ ...previous, draft, draftRev: previous.draftRev + 1 }))
        },
      },
    } as unknown as FolderNavigatorProps
    return (
      <>
        <textarea value={input.draft} readOnly />
        <FolderNavigator {...props} />
      </>
    )
  }
  flushSync(() => { root.render(<Harness />) })
  return { root, textarea: container.querySelector('textarea')!, track, setDraft }
}

function key(target: EventTarget, options: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true, ...options })
  flushSync(() => { target.dispatchEvent(event) })
  return event
}

describe('folder navigation decision', () => {
  it('builds an exact directory token and preserves surrounding draft text', () => {
    const current = menu()
    current.hit = { ...current.hit!, position: 'inline', span: { start: 5, end: 9, draftRev: 4 } }
    expect(folderNavigationTarget(current, { ...INPUT, draft: 'open @src later' }, { start: 9, end: 9 })).toEqual({
      draft: 'open @src/ later',
      caret: 10,
      tier: 'plain',
    })
    expect(folderNavigationTarget(current, { ...INPUT, draft: 'open @src later', phase: 'claimed' }, { start: 9, end: 9 })?.tier).toBe('claimed')
  })

  it('rejects stale, unrelated, incomplete, and non-directory menu states', () => {
    const cases: MenuState[] = [
      { ...menu(), open: false },
      { ...menu(), hit: null },
      { ...menu(), highlight: null },
      { ...menu(), hit: { ...menu().hit!, trigger: '/' } },
      { ...menu(), highlight: { source: 'other', index: 0 } },
      { ...menu(), hit: { ...menu().hit!, span: { start: 0, end: 4, draftRev: 3 } } },
      { ...menu(), groups: [] },
      { ...menu(), groups: [{ source: 'at-file', status: 'pending', items: [] }] },
      { ...menu(), highlight: { source: 'at-file', index: 2 } },
      menu({ value: 'src', atFileKind: 'file' }),
      menu({ atFileKind: 'dir' }),
    ]
    for (const state of cases) {
      expect(folderNavigationTarget(state, INPUT, { start: 4, end: 4 })).toBeUndefined()
    }
    expect(folderNavigationTarget(menu(), INPUT, { start: 3, end: 4 })).toBeUndefined()
    expect(folderNavigationTarget(menu(), INPUT, { start: 3, end: 3 })).toBeUndefined()
    expect(folderNavigationTarget(menu(), { ...INPUT, phase: 'adjudicating' }, { start: 4, end: 4 })).toBeUndefined()
    expect(folderNavigationTarget(menu(), { ...INPUT, phase: 'submitting' }, { start: 4, end: 4 })).toBeUndefined()
  })

  it('accepts only an unmodified, unclaimed ArrowRight key', () => {
    const base = {
      key: 'ArrowRight', keyCode: 39, defaultPrevented: false, isComposing: false,
      altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
    }
    expect(isFolderNavigationKey(base)).toBe(true)
    for (const changed of [
      { key: 'ArrowLeft' }, { defaultPrevented: true }, { isComposing: true }, { keyCode: 229 }, { altKey: true },
      { ctrlKey: true }, { metaKey: true }, { shiftKey: true },
    ]) {
      expect(isFolderNavigationKey({ ...base, ...changed })).toBe(false)
    }
  })
})

describe('FolderNavigator DOM bridge', () => {
  it('enters a highlighted directory, keeps the menu tracked, and restores the caret', () => {
    const mounted = mount()
    mounted.textarea.setSelectionRange(4, 4)
    const event = key(mounted.textarea, {})
    expect(event.defaultPrevented).toBe(true)
    expect(mounted.setDraft).toHaveBeenCalledWith('@src/')
    expect(mounted.textarea.value).toBe('@src/')
    expect(mounted.textarea.selectionStart).toBe(5)
    expect(mounted.track).toHaveBeenCalledWith('@src/', 5, { tier: 'plain' }, 5)
    mounted.root.unmount()
  })

  it('leaves file candidates, other keys, modified keys, and non-textarea targets alone', () => {
    const file = mount(menu({ value: 'src/index.ts', atFileKind: 'file' }))
    file.textarea.setSelectionRange(4, 4)
    expect(key(file.textarea, {}).defaultPrevented).toBe(false)
    expect(key(file.textarea, { shiftKey: true }).defaultPrevented).toBe(false)
    expect(key(file.textarea, { key: 'ArrowLeft' }).defaultPrevented).toBe(false)
    expect(key(document.body, {}).defaultPrevented).toBe(false)
    expect(file.setDraft).not.toHaveBeenCalled()
    expect(file.track).not.toHaveBeenCalled()
    file.root.unmount()
  })
})
