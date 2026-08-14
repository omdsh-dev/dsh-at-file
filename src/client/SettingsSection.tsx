/**
 * The settings page section for the `at-file` namespace: a clearly labeled
 * enable checkbox plus an exact-basename filter editor over the durable
 * settings scope. Product copy rides the `at-file` locale namespace.
 */
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { useEffect, useMemo, useState } from 'react'
import type { AtFileSettings } from '../contract.ts'
import { DEFAULT_IGNORE_FILES, normalizeIgnoreFiles } from '../defaults.ts'

/** Injected business face: the live scope (bound to `useScope`) and the write verb. */
export interface AtFileSectionInjected {
  hooks: { scope: SettingsScope<AtFileSettings> }
  setEnabled: (enabled: boolean) => Promise<void>
  setIgnoreFiles: (ignoreFiles: readonly string[]) => Promise<void>
}

/** Full section props: runtime share + injected face + the locale seat. */
export type AtFileSectionProps = PropsRuntime<'settings.section'> & InjectFace<AtFileSectionInjected> & PropsLocale<'at-file'>

/**
 * Parse one-basename-per-line settings text into a normalized list.
 * @param value - textarea content.
 * @returns trimmed entries with blank and case-insensitive duplicates removed.
 */
export function parseIgnoreFiles(value: string): string[] {
  return normalizeIgnoreFiles(value.split(/\r?\n/u))
}

/**
 * Render the enable switch and exact-basename filter editor.
 * @param props - runtime share, the bound scope hook, the write verb, and `t`.
 * @returns the section element tree.
 */
export function AtFileSection({ useScope, setEnabled, setIgnoreFiles, t }: AtFileSectionProps) {
  const enabled = useScope(snapshot => snapshot.value?.enabled ?? true)
  const ignoreFiles = useScope(snapshot => snapshot.value?.ignoreFiles ?? DEFAULT_IGNORE_FILES)
  const storedText = ignoreFiles.join('\n')
  const [draft, setDraft] = useState(storedText)
  const [saving, setSaving] = useState(false)
  const parsed = useMemo(() => parseIgnoreFiles(draft), [draft])
  const dirty = parsed.join('\n') !== normalizeIgnoreFiles(ignoreFiles).join('\n')

  useEffect(() => { setDraft(storedText) }, [storedText])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await setIgnoreFiles(parsed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="dsh_atFile_section" aria-labelledby="dsh-at-file-settings-title">
      <h2 id="dsh-at-file-settings-title" className="dsh_atFile_title">{t('settings.title')}</h2>
      <label className="dsh_atFile_card">
        <input
          type="checkbox"
          className="dsh_atFile_checkbox"
          defaultChecked={enabled}
          onChange={(event) => { void setEnabled(event.target.checked) }}
        />
        <span className="dsh_atFile_cardText">
          <span className="dsh_atFile_cardTitle">{t('settings.enabled')}</span>
          <span className="dsh_atFile_cardDesc">{t('settings.enabledDesc')}</span>
        </span>
      </label>
      <div className="dsh_atFile_filter">
        <label htmlFor="dsh-at-file-ignore-files" className="dsh_atFile_filterTitle">
          {t('settings.ignoreFiles')}
        </label>
        <span id="dsh-at-file-ignore-files-desc" className="dsh_atFile_filterDesc">
          {t('settings.ignoreFilesDesc')}
        </span>
        <textarea
          id="dsh-at-file-ignore-files"
          className="dsh_atFile_filterInput"
          rows={4}
          value={draft}
          spellCheck={false}
          aria-describedby="dsh-at-file-ignore-files-desc"
          onChange={(event) => { setDraft(event.target.value) }}
        />
        <div className="dsh_atFile_filterActions">
          <span className="dsh_atFile_filterHint">{t('settings.ignoreFilesHint')}</span>
          <button
            type="button"
            className="dsh_atFile_filterSave"
            disabled={!dirty || saving}
            onClick={() => { void save() }}
          >
            {saving ? t('settings.saving') : t('settings.save')}
          </button>
        </div>
      </div>
    </section>
  )
}
