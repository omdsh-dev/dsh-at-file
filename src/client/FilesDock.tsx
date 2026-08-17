/**
 * Referenced-path dock: one row per @path token currently in the draft,
 * rendered above the composer (the 'conversation.input.dock' strip). The row
 * is the user's path link before and after send: clicking the path opens the
 * file on the host, the × removes the token from the draft. The draft holds
 * plain-text @path tokens (the plain-text-reference decision), so the dock
 * parses them directly; the plugin settings source's live enable value gates
 * the strip.
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { AtFileSettings } from '../contract.ts'
import { isProtectedMentionToken } from '../paste.ts'

export interface AtFileSettingsSnapshot { readonly value: AtFileSettings }
export type AtFileSettingsSource = ObservableSnapshot<AtFileSettingsSnapshot>

/** Injected business face: open one relative path, and the live settings source. */
export interface AtFileDockInjected {
  onOpen: (relative: string) => void
  hooks: { scope: AtFileSettingsSource }
}

/** Full dock entry props: InputZone owner share + session standard kit + injected face + locale seat. */
export type AtFileDockProps = PropsRuntime<'conversation.input.dock'> & InjectFace<AtFileDockInjected> & PropsLocale<'at-file'>

/** The same token grammar the Host's reference marker scans. */
const MENTION_PATTERN = /@([^\s@]+)/g

/** One parsed mention token in the draft, with its span for precise removal. */
interface DraftMention {
  readonly relative: string
  readonly start: number
  readonly end: number
}

/** Parse the draft's @path tokens in order, deduplicating by relative path. */
export function draftMentions(draft: string): readonly DraftMention[] {
  const seen = new Set<string>()
  const out: DraftMention[] = []
  for (const match of draft.matchAll(MENTION_PATTERN)) {
    const raw = match[1] as string
    if (isProtectedMentionToken(raw)) continue
    const relative = raw.endsWith('/') ? raw.slice(0, -1) : raw
    if (relative === '' || seen.has(relative)) continue
    seen.add(relative)
    out.push({ relative, start: match.index, end: match.index + match[0].length })
  }
  return out
}

/** Draft text with one token span removed. */
export function withoutToken(draft: string, start: number, end: number): string {
  return draft.slice(0, start) + draft.slice(end)
}

/**
 * Render the referenced-path rows; null while the draft has no @path tokens or
 * the settings switch is off.
 * @param props - runtime (input currency + actions), inject, and locale shares.
 * @returns the dock strip, or null.
 */
export function FilesDock({ input, inputActions, onOpen, useScope, t }: AtFileDockProps) {
  const enabled = useScope(snapshot => snapshot.value?.enabled ?? true)
  if (!enabled) return null
  const mentions = draftMentions(input.draft)
  if (mentions.length === 0) return null
  return (
    <div className="dsh_atFile_rail" role="group" aria-label={t('dock.aria')} data-at-file-dock>
      {mentions.map(mention => (
        <span key={`${mention.start}:${mention.relative}`} className="dsh_atFile_row" data-at-file-row>
          <button
            type="button"
            className="dsh_atFile_path"
            title={mention.relative}
            onClick={() => { onOpen(mention.relative) }}
          >
            <svg className="dsh_atFile_icon" viewBox="0 0 16 16" aria-hidden>
              <path d="M3 2.5A1.5 1.5 0 0 1 4.5 1h3l3 3v9.5A1.5 1.5 0 0 1 9 15H4.5A1.5 1.5 0 0 1 3 13.5v-11Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M7.5 1v3h3" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M13 4.5v8A1.5 1.5 0 0 1 11.5 14H5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            {mention.relative}
          </button>
          <button
            type="button"
            className="dsh_atFile_remove"
            aria-label={t('dock.remove', { name: mention.relative })}
            onClick={() => { inputActions.setDraft(withoutToken(input.draft, mention.start, mention.end)) }}
          >
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </span>
      ))}
    </div>
  )
}
