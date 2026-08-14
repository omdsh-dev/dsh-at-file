// @vitest-environment jsdom
/**
 * The settings section presentation: enable switch, file-name filter editor,
 * normalization, and writes routed through the durable scope.
 */
import { describe, expect, it, vi } from 'vitest'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import type { ReactElement } from 'react'
import { AtFileSection, parseIgnoreFiles, type AtFileSectionProps } from '../src/client/SettingsSection.tsx'
import { fmt, zh } from '../src/client/locales.ts'
import { DEFAULT_IGNORE_FILES } from '../src/defaults.ts'
import type { AtFileSettings } from '../src/contract.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = false

const t = (key: string, params?: Record<string, string>): string => fmt(zh[key] ?? key, params)

function props(over: {
  enabled?: boolean
  ignoreFiles?: readonly string[]
  setEnabled?: (enabled: boolean) => Promise<void>
  setIgnoreFiles?: (ignoreFiles: readonly string[]) => Promise<void>
} = {}): AtFileSectionProps {
  const value: AtFileSettings | undefined = over.enabled === undefined && over.ignoreFiles === undefined
    ? undefined
    : { enabled: over.enabled ?? true, ignoreFiles: [...over.ignoreFiles ?? DEFAULT_IGNORE_FILES] }
  const stub = {
    useScope: <T,>(selector: (snapshot: { value?: AtFileSettings }) => T): T => selector({ value }),
    setEnabled: over.setEnabled ?? (async () => {}),
    setIgnoreFiles: over.setIgnoreFiles ?? (async () => {}),
    t,
  }
  return stub as unknown as AtFileSectionProps
}

function mount(element: ReactElement): { root: Root; container: HTMLDivElement } {
  const container = document.createElement('div')
  const root = createRoot(container)
  flushSync(() => { root.render(element) })
  return { root, container }
}

describe('AtFileSection', () => {
  it('renders one labeled checkbox reflecting the scope value', () => {
    const { root, container } = mount(<AtFileSection {...props({ enabled: true })} />)
    expect(container.textContent).toContain(zh['settings.enabled'])
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    root.unmount()
  })

  it('defaults the checkbox to checked before the first settings read', () => {
    const { root, container } = mount(<AtFileSection {...props({ enabled: undefined })} />)
    expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true)
    root.unmount()
  })

  it('writes the flipped value through the scope on change', () => {
    const setEnabled = vi.fn(async () => {})
    const { root, container } = mount(<AtFileSection {...props({ enabled: true, setEnabled })} />)
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(setEnabled).toHaveBeenCalledWith(false)
    root.unmount()
  })

  it('shows the default file filters before the first settings read', () => {
    const { root, container } = mount(<AtFileSection {...props()} />)
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea.value).toBe(DEFAULT_IGNORE_FILES.join('\n'))
    expect((container.querySelector('button') as HTMLButtonElement).disabled).toBe(true)
    root.unmount()
  })

  it('normalizes file-filter lines and shows the pending save state', async () => {
    let finishSave = (): void => {}
    const setIgnoreFiles = vi.fn(() => new Promise<void>(resolve => { finishSave = resolve }))
    const { root, container } = mount(<AtFileSection {...props({ enabled: true, ignoreFiles: ['desktop.ini'], setIgnoreFiles })} />)
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    flushSync(() => {
      valueSetter?.call(textarea, ' noise.log \nNOISE.LOG\nkeep.tmp\n')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const save = container.querySelector('button') as HTMLButtonElement
    expect(save.disabled).toBe(false)
    flushSync(() => { save.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(setIgnoreFiles).toHaveBeenCalledWith(['noise.log', 'keep.tmp'])
    expect(save.textContent).toBe(zh['settings.saving'])
    finishSave()
    await Promise.resolve()
    flushSync(() => {})
    expect(save.textContent).toBe(zh['settings.save'])
    root.unmount()
  })

  it('parses CRLF input, removes blanks, and preserves the first casing', () => {
    expect(parseIgnoreFiles('Thumbs.db\r\n\r\nTHUMBS.DB\r\ncustom.tmp')).toEqual(['Thumbs.db', 'custom.tmp'])
  })
})
