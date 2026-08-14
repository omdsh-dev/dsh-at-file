/** Settings section for global and workspace-specific file filter rules. */
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { AtFileSettings, FileIgnoreRule, FileIgnoreRuleInput } from '../contract.ts'
import type { AtFileSettingsSource } from './FilesDock.tsx'
import type { AtFileKey } from './locales.ts'
import {
  DEFAULT_IGNORE_FILES,
  ignoreRuleKey,
  normalizeIgnoreFiles,
  normalizeIgnoreRule,
  workspaceIgnoreFilesFor,
  workspacePathKey,
} from '../defaults.ts'

/** Injected business face: the live scope and durable write verbs. */
export interface AtFileSectionInjected {
  hooks: { scope: AtFileSettingsSource }
  setEnabled: (enabled: boolean) => Promise<void>
  setIgnoreFiles: (ignoreFiles: readonly FileIgnoreRuleInput[]) => Promise<void>
  setWorkspaceIgnoreFiles: (workspace: string, ignoreFiles: readonly FileIgnoreRuleInput[]) => Promise<void>
}

/** Full section props: runtime share + injected face + locale seat. */
export type AtFileSectionProps = PropsRuntime<'settings.section'> & InjectFace<AtFileSectionInjected> & PropsLocale<'at-file'>

type FilterScope = 'global' | 'workspace'
type RuleKind = FileIgnoreRule['kind']

interface WorkspaceOption {
  path: string
  title: string
}

/** Trim one legacy exact basename; retained for callers using the old helper. */
export function parseIgnoreFile(value: string): string | undefined {
  const normalized = normalizeIgnoreRule(value)
  return normalized?.kind === 'exact' ? normalized.pattern : undefined
}

function workspaceTitle(path: string): string {
  const trimmed = path.replace(/[\\/]+$/u, '')
  return trimmed.split(/[\\/]/u).pop() || path
}

function rulePattern(value: FileIgnoreRuleInput): string {
  return typeof value === 'string' ? value : value.pattern
}

function ruleKind(value: FileIgnoreRuleInput): RuleKind {
  return typeof value === 'string' ? 'exact' : value.kind
}

function ruleCaseSensitive(value: FileIgnoreRuleInput): boolean {
  return typeof value === 'string' ? false : value.caseSensitive
}

function ruleLabel(value: FileIgnoreRuleInput): string {
  return rulePattern(value)
}

function validateDraft(kind: RuleKind, pattern: string, caseSensitive: boolean): AtFileKey | undefined {
  const trimmed = pattern.trim()
  if (kind === 'exact' && /[\\/]/u.test(trimmed)) return 'settings.invalidName'
  if (kind === 'regex') {
    try { new RegExp(trimmed, caseSensitive ? '' : 'i') } catch { return 'settings.invalidRegex' }
  }
  return undefined
}

function candidateValue(kind: RuleKind, pattern: string, caseSensitive: boolean): FileIgnoreRuleInput | undefined {
  const trimmed = pattern.trim()
  if (trimmed === '' || validateDraft(kind, trimmed, caseSensitive) !== undefined) return undefined
  if (kind === 'exact' && !caseSensitive) return trimmed
  return { kind, pattern: trimmed, caseSensitive }
}

function fileListKey(values: readonly FileIgnoreRuleInput[]): string {
  return normalizeIgnoreFiles(values).map(ignoreRuleKey).join('\n')
}

function PlusIcon(): ReactElement {
  return <svg viewBox="0 0 16 16" aria-hidden><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
}

function RemoveIcon(): ReactElement {
  return <svg viewBox="0 0 16 16" aria-hidden><path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
}

/** Render the enable switch and scoped file-filter manager. */
export function AtFileSection({
  useScope,
  useSessions,
  useWorkspaces,
  setEnabled,
  setIgnoreFiles,
  setWorkspaceIgnoreFiles,
  t,
}: AtFileSectionProps) {
  const settings = useScope(snapshot => snapshot.value)
  const enabled = settings?.enabled ?? true
  const globalFiles = normalizeIgnoreFiles(settings?.ignoreFiles ?? DEFAULT_IGNORE_FILES)
  const workspaceRules = settings?.workspaceIgnoreFiles ?? []
  const workspaces = useWorkspaces(snapshot => snapshot.items)
  const recentWorkspaceId = useWorkspaces(snapshot => snapshot.recentWorkspaceId)
  const currentCwd = useSessions(snapshot => {
    const current = snapshot.current
    return current === undefined ? undefined : snapshot.byId[current]?.cwd
  })
  const workspaceOptions = useMemo<WorkspaceOption[]>(() => {
    const rows = workspaces.map(workspace => ({ path: workspace.path, title: workspace.title }))
    if (currentCwd !== undefined && !rows.some(row => workspacePathKey(row.path) === workspacePathKey(currentCwd))) {
      rows.unshift({ path: currentCwd, title: workspaceTitle(currentCwd) })
    }
    return rows
  }, [currentCwd, workspaces])
  const preferredWorkspace = currentCwd
    ?? workspaces.find(workspace => workspace.workspaceId === recentWorkspaceId)?.path
    ?? workspaceOptions[0]?.path
    ?? ''

  const [filterScope, setFilterScope] = useState<FilterScope>('global')
  const [selectedWorkspace, setSelectedWorkspace] = useState(preferredWorkspace)
  const [draft, setDraft] = useState('')
  const [ruleKindChoice, setRuleKindChoice] = useState<RuleKind>('exact')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (workspaceOptions.length === 0) {
      if (selectedWorkspace !== '') setSelectedWorkspace('')
      return
    }
    if (!workspaceOptions.some(option => workspacePathKey(option.path) === workspacePathKey(selectedWorkspace))) {
      setSelectedWorkspace(preferredWorkspace)
    }
  }, [preferredWorkspace, selectedWorkspace, workspaceOptions])
  useEffect(() => { setDraft('') }, [filterScope, selectedWorkspace, ruleKindChoice])

  const selectedWorkspaceValue = workspaceOptions.some(
    option => workspacePathKey(option.path) === workspacePathKey(selectedWorkspace),
  ) ? selectedWorkspace : ''
  const workspaceFiles = selectedWorkspaceValue === ''
    ? []
    : workspaceIgnoreFilesFor(workspaceRules, selectedWorkspaceValue)
  const activeFiles = filterScope === 'global' ? globalFiles : workspaceFiles
  const candidate = candidateValue(ruleKindChoice, draft, caseSensitive)
  const draftErrorKey = draft.trim() === '' ? undefined : validateDraft(ruleKindChoice, draft, caseSensitive)
  const activeKeys = new Set(activeFiles.map(ignoreRuleKey))
  const globalKeys = new Set(globalFiles.map(ignoreRuleKey))
  const candidateErrorKey: AtFileKey | undefined = candidate === undefined
    ? draftErrorKey
    : activeKeys.has(ignoreRuleKey(candidate))
      ? 'settings.duplicateName'
      : filterScope === 'workspace' && globalKeys.has(ignoreRuleKey(candidate))
        ? 'settings.inheritedName'
        : undefined
  const candidateError = candidateErrorKey === undefined ? undefined : t(candidateErrorKey)
  const workspaceAvailable = selectedWorkspaceValue !== ''
  const canAdd = candidate !== undefined
    && candidateError === undefined
    && !saving
    && (filterScope === 'global' || workspaceAvailable)

  const commit = async (files: readonly FileIgnoreRuleInput[]): Promise<void> => {
    setSaving(true)
    try {
      if (filterScope === 'global') await setIgnoreFiles(normalizeIgnoreFiles(files))
      else await setWorkspaceIgnoreFiles(selectedWorkspaceValue, normalizeIgnoreFiles(files))
    } finally {
      setSaving(false)
    }
  }
  const add = async (): Promise<void> => {
    if (!canAdd || candidate === undefined) return
    await commit([...activeFiles, candidate])
    setDraft('')
  }
  const remove = async (value: FileIgnoreRuleInput): Promise<void> => {
    const key = ignoreRuleKey(value)
    await commit(activeFiles.filter(entry => ignoreRuleKey(entry) !== key))
  }

  return (
    <section className="dsh_atFile_section" aria-labelledby="dsh-at-file-settings-title">
      <h2 id="dsh-at-file-settings-title" className="dsh_atFile_title">{t('settings.title')}</h2>
      <label className="dsh_atFile_card">
        <input
          type="checkbox"
          className="dsh_atFile_checkbox"
          checked={enabled}
          onChange={event => { void setEnabled(event.target.checked) }}
        />
        <span className="dsh_atFile_cardText">
          <span className="dsh_atFile_cardTitle">{t('settings.enabled')}</span>
          <span className="dsh_atFile_cardDesc">{t('settings.enabledDesc')}</span>
        </span>
      </label>
      <div className="dsh_atFile_filter">
        <div className="dsh_atFile_filterHeading">
          <div className="dsh_atFile_filterHeadingText">
            <span className="dsh_atFile_filterTitle">{t('settings.ignoreFiles')}</span>
            <span className="dsh_atFile_filterDesc">{t('settings.ignoreFilesDesc')}</span>
          </div>
          <div className="dsh_atFile_scopeTabs" role="tablist" aria-label={t('settings.scope')}>
            <button
              type="button"
              role="tab"
              aria-selected={filterScope === 'global'}
              className="dsh_atFile_scopeTab"
              onClick={() => { setFilterScope('global') }}
            >
              {t('settings.global')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filterScope === 'workspace'}
              className="dsh_atFile_scopeTab"
              onClick={() => { setFilterScope('workspace') }}
            >
              {t('settings.workspace')}
            </button>
          </div>
        </div>
        {filterScope === 'workspace' && (
          <label className="dsh_atFile_workspaceField">
            <span>{t('settings.workspaceSelect')}</span>
            <select
              className="dsh_atFile_workspaceSelect"
              value={selectedWorkspaceValue}
              disabled={workspaceOptions.length === 0 || saving}
              onChange={event => { setSelectedWorkspace(event.target.value) }}
            >
              {workspaceOptions.length === 0 && <option value="">{t('settings.noWorkspace')}</option>}
              {workspaceOptions.map(option => (
                <option key={workspacePathKey(option.path)} value={option.path}>
                  {option.title} - {option.path}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="dsh_atFile_filterToolbar">
          <div>
            <div className="dsh_atFile_filterGroupTitle">
              {filterScope === 'global' ? t('settings.globalTitle') : t('settings.workspaceTitle')}
            </div>
            <div className="dsh_atFile_filterHint">
              {filterScope === 'global' ? t('settings.globalDesc') : t('settings.workspaceDesc')}
            </div>
          </div>
          <button
            type="button"
            className="dsh_atFile_secondaryButton"
            disabled={saving || (filterScope === 'global'
              ? fileListKey(globalFiles) === fileListKey(DEFAULT_IGNORE_FILES)
              : workspaceFiles.length === 0)}
            onClick={() => { void commit(filterScope === 'global' ? DEFAULT_IGNORE_FILES : []) }}
          >
            {filterScope === 'global' ? t('settings.restoreDefaults') : t('settings.clearWorkspace')}
          </button>
        </div>
        <div className="dsh_atFile_filterList" aria-live="polite">
          {activeFiles.length === 0 && (
            <div className="dsh_atFile_filterEmpty">
              {filterScope === 'global' ? t('settings.emptyGlobal') : t('settings.emptyWorkspace')}
            </div>
          )}
          {activeFiles.map(value => (
            <div className="dsh_atFile_filterRow" key={ignoreRuleKey(value)}>
              <div className="dsh_atFile_ruleMain">
                <code className="dsh_atFile_filterName">{ruleLabel(value)}</code>
                <span className="dsh_atFile_ruleBadge">{t(`settings.kind.${ruleKind(value)}`)}</span>
                <span className="dsh_atFile_ruleBadge">
                  {t(ruleCaseSensitive(value) ? 'settings.caseSensitive' : 'settings.caseInsensitive')}
                </span>
              </div>
              <button
                type="button"
                className="dsh_atFile_filterRemove"
                title={t('settings.remove', { name: ruleLabel(value) })}
                aria-label={t('settings.remove', { name: ruleLabel(value) })}
                disabled={saving}
                onClick={() => { void remove(value) }}
              >
                <RemoveIcon />
              </button>
            </div>
          ))}
        </div>
        <div className="dsh_atFile_ruleMode" role="group" aria-label={t('settings.ruleType')}>
          <button
            type="button"
            className="dsh_atFile_ruleModeButton"
            aria-pressed={ruleKindChoice === 'exact'}
            onClick={() => { setRuleKindChoice('exact') }}
          >
            {t('settings.kind.exact')}
          </button>
          <button
            type="button"
            className="dsh_atFile_ruleModeButton"
            aria-pressed={ruleKindChoice === 'regex'}
            onClick={() => { setRuleKindChoice('regex') }}
          >
            {t('settings.kind.regex')}
          </button>
        </div>
        <div className="dsh_atFile_filterAddRow">
          <input
            className="dsh_atFile_filterInput"
            value={draft}
            placeholder={t(ruleKindChoice === 'regex' ? 'settings.regexPlaceholder' : 'settings.namePlaceholder')}
            spellCheck={false}
            disabled={saving || (filterScope === 'workspace' && !workspaceAvailable)}
            aria-invalid={candidateError !== undefined}
            aria-describedby="dsh-at-file-filter-message"
            onChange={event => { setDraft(event.target.value) }}
            onKeyDown={event => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              void add()
            }}
          />
          <button
            type="button"
            className="dsh_atFile_addButton"
            disabled={!canAdd}
            onClick={() => { void add() }}
          >
            <PlusIcon />
            <span>{saving ? t('settings.saving') : t('settings.add')}</span>
          </button>
        </div>
        <label className="dsh_atFile_caseToggle">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={event => { setCaseSensitive(event.target.checked) }}
            disabled={saving}
          />
          <span>{t('settings.caseSensitiveOption')}</span>
        </label>
        <div
          id="dsh-at-file-filter-message"
          className={candidateError === undefined ? 'dsh_atFile_filterHint' : 'dsh_atFile_filterError'}
        >
          {candidateError ?? t(ruleKindChoice === 'regex' ? 'settings.regexHint' : 'settings.nameHint')}
        </div>
        {filterScope === 'workspace' && globalFiles.length > 0 && (
          <div className="dsh_atFile_inherited">
            <span className="dsh_atFile_inheritedTitle">{t('settings.inherited')}</span>
            <div className="dsh_atFile_inheritedList">
              {globalFiles.map(value => (
                <code key={ignoreRuleKey(value)}>{ruleLabel(value)}</code>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
