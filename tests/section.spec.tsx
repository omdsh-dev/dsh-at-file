// @vitest-environment jsdom
/** Settings-section behavior for global and workspace-specific file filters. */
import { describe, expect, it, vi } from 'vitest'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import type { ReactElement } from 'react'
import { AtFileSection, parseIgnoreFile, type AtFileSectionProps } from '../src/client/SettingsSection.tsx'
import { fmt, zh } from '../src/client/locales.ts'
import { DEFAULT_IGNORE_FILES } from '../src/defaults.ts'
import type { AtFileSettings, FileIgnoreRuleInput, WorkspaceIgnoreFiles } from '../src/contract.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = false

const t = (key: string, params?: Record<string, string>): string => fmt(zh[key] ?? key, params)

interface WorkspaceStub {
  workspaceId: string
  path: string
  title: string
  sessionIds: string[]
  createdAt: string
  updatedAt: string
}

function workspace(workspaceId: string, path: string, title: string): WorkspaceStub {
  return { workspaceId, path, title, sessionIds: [], createdAt: '', updatedAt: '' }
}

function props(over: {
  unloaded?: boolean
  enabled?: boolean
  ignorePastedMentions?: boolean
  ignoreFiles?: readonly FileIgnoreRuleInput[]
  workspaceIgnoreFiles?: readonly WorkspaceIgnoreFiles[]
  workspaces?: readonly WorkspaceStub[]
  currentCwd?: string
  recentWorkspaceId?: string
  setEnabled?: (enabled: boolean) => Promise<void>
  setIgnorePastedMentions?: (ignore: boolean) => Promise<void>
  setIgnoreFiles?: (ignoreFiles: readonly FileIgnoreRuleInput[]) => Promise<void>
  setWorkspaceIgnoreFiles?: (workspace: string, ignoreFiles: readonly FileIgnoreRuleInput[]) => Promise<void>
} = {}): AtFileSectionProps {
  const value: AtFileSettings | undefined = over.unloaded === true
    ? undefined
    : {
        enabled: over.enabled ?? true,
        ignoreFiles: [...over.ignoreFiles ?? DEFAULT_IGNORE_FILES],
        workspaceIgnoreFiles: (over.workspaceIgnoreFiles ?? []).map(entry => ({
          workspace: entry.workspace,
          ignoreFiles: [...entry.ignoreFiles],
        })),
        ignorePastedMentions: over.ignorePastedMentions ?? true,
      }
  const items = [...over.workspaces ?? []]
  const sessionState = over.currentCwd === undefined
    ? { current: undefined, byId: {} }
    : { current: 'current', byId: { current: { cwd: over.currentCwd } } }
  const stub = {
    useScope: <T,>(selector: (snapshot: { value?: AtFileSettings }) => T): T => selector({ value }),
    useSessions: <T,>(selector: (snapshot: typeof sessionState) => T): T => selector(sessionState),
    useWorkspaces: <T,>(selector: (snapshot: {
      items: readonly WorkspaceStub[]
      recentWorkspaceId?: string
    }) => T): T => selector({ items, recentWorkspaceId: over.recentWorkspaceId }),
    setEnabled: over.setEnabled ?? (async () => {}),
    setIgnorePastedMentions: over.setIgnorePastedMentions ?? (async () => {}),
    setIgnoreFiles: over.setIgnoreFiles ?? (async () => {}),
    setWorkspaceIgnoreFiles: over.setWorkspaceIgnoreFiles ?? (async () => {}),
    close: () => {},
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

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(candidate => candidate.textContent === label)
  if (found === undefined) throw new Error(`missing button: ${label}`)
  return found
}

function setInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  flushSync(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function click(target: HTMLElement): void {
  flushSync(() => { target.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

function pressEnter(input: HTMLInputElement): void {
  flushSync(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
}

describe('AtFileSection', () => {
  it('renders a controlled enable checkbox and writes its next value', () => {
    const setEnabled = vi.fn(async () => {})
    const { root, container } = mount(<AtFileSection {...props({ enabled: true, setEnabled })} />)
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    click(checkbox)
    expect(setEnabled).toHaveBeenCalledWith(false)
    root.unmount()
  })

  it('defaults the pasted-mention filter on and writes its next value', () => {
    const setIgnorePastedMentions = vi.fn(async () => {})
    const { root, container } = mount(<AtFileSection {...props({ setIgnorePastedMentions })} />)
    const checkboxes = [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[]
    expect(checkboxes[1]!.checked).toBe(true)
    click(checkboxes[1]!)
    expect(setIgnorePastedMentions).toHaveBeenCalledWith(false)
    root.unmount()
  })

  it('uses schema defaults before the first settings read', () => {
    const { root, container } = mount(<AtFileSection {...props({ unloaded: true })} />)
    expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true)
    const names = [...container.querySelectorAll('.dsh_atFile_filterName')].map(node => node.textContent)
    expect(names).toEqual(DEFAULT_IGNORE_FILES)
    expect(container.querySelector('textarea')).toBeNull()
    root.unmount()
  })

  it('adds and removes individual global rules without serializing a text area', async () => {
    const setIgnoreFiles = vi.fn(async () => {})
    const { root, container } = mount(<AtFileSection {...props({
      ignoreFiles: ['desktop.ini'],
      setIgnoreFiles,
    })} />)
    const input = container.querySelector('.dsh_atFile_filterInput') as HTMLInputElement
    setInput(input, ' noise.log ')
    click(button(container, zh['settings.add']))
    expect(setIgnoreFiles).toHaveBeenCalledWith(['desktop.ini', 'noise.log'])
    await Promise.resolve()
    flushSync(() => {})

    const remove = container.querySelector('[aria-label="移除 desktop.ini"]') as HTMLButtonElement
    click(remove)
    expect(setIgnoreFiles).toHaveBeenLastCalledWith([])
    root.unmount()
  })

  it('shows workspace additions separately from inherited global rules', () => {
    const setWorkspaceIgnoreFiles = vi.fn(async () => {})
    const workspaces = [
      workspace('one', '/work/one', 'One'),
      workspace('two', '/work/two', 'Two'),
    ]
    const { root, container } = mount(<AtFileSection {...props({
      ignoreFiles: ['desktop.ini'],
      workspaceIgnoreFiles: [{ workspace: '/work/one', ignoreFiles: ['local.tmp'] }],
      workspaces,
      currentCwd: '/work/one',
      setWorkspaceIgnoreFiles,
    })} />)
    click(button(container, zh['settings.workspace']))
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('/work/one')
    expect(container.querySelector('.dsh_atFile_filterName')?.textContent).toBe('local.tmp')
    expect(container.querySelector('.dsh_atFile_inheritedList')?.textContent).toContain('desktop.ini')

    setInput(container.querySelector('.dsh_atFile_filterInput') as HTMLInputElement, 'project.cache')
    click(button(container, zh['settings.add']))
    expect(setWorkspaceIgnoreFiles).toHaveBeenCalledWith('/work/one', ['local.tmp', 'project.cache'])
    click(button(container, zh['settings.global']))
    expect(container.querySelector('select')).toBeNull()
    root.unmount()
  })

  it('switches the editable local list with the workspace selector', () => {
    const setWorkspaceIgnoreFiles = vi.fn(async () => {})
    const { root, container } = mount(<AtFileSection {...props({
      workspaceIgnoreFiles: [
        { workspace: '/work/one', ignoreFiles: ['one.tmp'] },
        { workspace: '/work/two', ignoreFiles: ['two.tmp'] },
      ],
      workspaces: [workspace('one', '/work/one', 'One'), workspace('two', '/work/two', 'Two')],
      currentCwd: '/work/one',
      setWorkspaceIgnoreFiles,
    })} />)
    click(button(container, zh['settings.workspace']))
    const select = container.querySelector('select') as HTMLSelectElement
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    flushSync(() => {
      setter?.call(select, '/work/two')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(container.querySelector('.dsh_atFile_filterName')?.textContent).toBe('two.tmp')
    click(button(container, zh['settings.clearWorkspace']))
    expect(setWorkspaceIgnoreFiles).toHaveBeenCalledWith('/work/two', [])
    root.unmount()
  })

  it('reselects an available workspace when the previous choice disappears', () => {
    const one = workspace('one', '/work/one', 'One')
    const two = workspace('two', '/work/two', 'Two')
    const initial = props({ workspaces: [one, two], currentCwd: '/work/one' })
    const { root, container } = mount(<AtFileSection {...initial} />)
    click(button(container, zh['settings.workspace']))
    const select = container.querySelector('select') as HTMLSelectElement
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    flushSync(() => {
      setter?.call(select, '/work/two')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    flushSync(() => { root.render(<AtFileSection {...props({ workspaces: [one], currentCwd: '/work/one' })} />) })
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('/work/one')
    root.unmount()
  })

  it('rejects paths, current-list duplicates, and inherited global duplicates', () => {
    const setIgnoreFiles = vi.fn(async () => {})
    const setWorkspaceIgnoreFiles = vi.fn(async () => {})
    const { root, container } = mount(<AtFileSection {...props({
      ignoreFiles: ['desktop.ini'],
      workspaces: [workspace('one', '/work/one', 'One')],
      currentCwd: '/work/one',
      setIgnoreFiles,
      setWorkspaceIgnoreFiles,
    })} />)
    const input = container.querySelector('.dsh_atFile_filterInput') as HTMLInputElement
    setInput(input, 'tmp/cache.db')
    expect(container.textContent).toContain(zh['settings.invalidName'])
    expect(button(container, zh['settings.add']).disabled).toBe(true)
    pressEnter(input)
    flushSync(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true })) })
    setInput(input, 'DESKTOP.INI')
    expect(container.textContent).toContain(zh['settings.duplicateName'])

    click(button(container, zh['settings.workspace']))
    setInput(container.querySelector('.dsh_atFile_filterInput') as HTMLInputElement, 'DESKTOP.INI')
    expect(container.textContent).toContain(zh['settings.inheritedName'])
    expect(setIgnoreFiles).not.toHaveBeenCalled()
    expect(setWorkspaceIgnoreFiles).not.toHaveBeenCalled()
    root.unmount()
  })

  it('adds a valid rule with Enter', () => {
    const setIgnoreFiles = vi.fn(async () => {})
    const { root, container } = mount(<AtFileSection {...props({ ignoreFiles: [], setIgnoreFiles })} />)
    const input = container.querySelector('.dsh_atFile_filterInput') as HTMLInputElement
    setInput(input, 'keyboard.tmp')
    pressEnter(input)
    expect(setIgnoreFiles).toHaveBeenCalledWith(['keyboard.tmp'])
    root.unmount()
  })

  it('adds a case-sensitive exact rule as a structured setting', () => {
    const setIgnoreFiles = vi.fn(async () => {})
    const { root, container } = mount(<AtFileSection {...props({ ignoreFiles: [], setIgnoreFiles })} />)
    const caseToggle = container.querySelector('.dsh_atFile_caseToggle input') as HTMLInputElement
    click(caseToggle)
    setInput(container.querySelector('.dsh_atFile_filterInput') as HTMLInputElement, 'Case.TMP')
    click(button(container, zh['settings.add']))
    expect(setIgnoreFiles).toHaveBeenCalledWith([
      { kind: 'exact', pattern: 'Case.TMP', caseSensitive: true },
    ])
    root.unmount()
  })

  it('validates and adds regular-expression rules', () => {
    const setIgnoreFiles = vi.fn(async () => {})
    const { root, container } = mount(<AtFileSection {...props({ ignoreFiles: [], setIgnoreFiles })} />)
    click(button(container, zh['settings.kind.regex']))
    const input = container.querySelector('.dsh_atFile_filterInput') as HTMLInputElement
    expect(input.placeholder).toBe(zh['settings.regexPlaceholder'])
    setInput(input, '[')
    expect(container.textContent).toContain(zh['settings.invalidRegex'])
    expect(button(container, zh['settings.add']).disabled).toBe(true)

    setInput(input, '\\.map$')
    click(container.querySelector('.dsh_atFile_caseToggle input') as HTMLInputElement)
    click(button(container, zh['settings.add']))
    expect(setIgnoreFiles).toHaveBeenCalledWith([
      { kind: 'regex', pattern: '\\.map$', caseSensitive: true },
    ])
    click(button(container, zh['settings.kind.exact']))
    expect((container.querySelector('.dsh_atFile_filterInput') as HTMLInputElement).placeholder)
      .toBe(zh['settings.namePlaceholder'])
    root.unmount()
  })

  it('renders and removes structured rules with matching badges', () => {
    const setIgnoreFiles = vi.fn(async () => {})
    const { root, container } = mount(<AtFileSection {...props({
      ignoreFiles: [{ kind: 'regex', pattern: '\\.log$', caseSensitive: true }],
      setIgnoreFiles,
    })} />)
    expect(container.querySelector('.dsh_atFile_filterRow')?.textContent).toContain(zh['settings.kind.regex'])
    expect(container.querySelector('.dsh_atFile_filterRow')?.textContent).toContain(zh['settings.caseSensitive'])
    click(container.querySelector('.dsh_atFile_filterRemove') as HTMLButtonElement)
    expect(setIgnoreFiles).toHaveBeenCalledWith([])
    root.unmount()
  })

  it('restores the built-in global rules', () => {
    const setIgnoreFiles = vi.fn(async () => {})
    const { root, container } = mount(<AtFileSection {...props({ ignoreFiles: [], setIgnoreFiles })} />)
    click(button(container, zh['settings.restoreDefaults']))
    expect(setIgnoreFiles).toHaveBeenCalledWith(DEFAULT_IGNORE_FILES)
    root.unmount()
  })

  it('disables workspace editing when the last workspace disappears', () => {
    const { root, container } = mount(<AtFileSection {...props({ currentCwd: '/work/one' })} />)
    click(button(container, zh['settings.workspace']))
    flushSync(() => { root.render(<AtFileSection {...props()} />) })
    expect((container.querySelector('select') as HTMLSelectElement).disabled).toBe(true)
    expect((container.querySelector('.dsh_atFile_filterInput') as HTMLInputElement).disabled).toBe(true)
    root.unmount()
  })

  it('normalizes one proposed file name', () => {
    expect(parseIgnoreFile(' Thumbs.db ')).toBe('Thumbs.db')
    expect(parseIgnoreFile('   ')).toBeUndefined()
  })

  it('labels a filesystem root used as the current workspace', () => {
    const { root, container } = mount(<AtFileSection {...props({ currentCwd: '/' })} />)
    click(button(container, zh['settings.workspace']))
    expect(container.querySelector('option')?.textContent).toBe('/ - /')
    root.unmount()
  })
})
