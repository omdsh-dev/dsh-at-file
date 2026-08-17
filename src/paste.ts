/**
 * Internal marker used to distinguish pasted @ tokens from text the user
 * typed. It is removed at the Host boundary before the prompt reaches the
 * model. Word joiner has no visible glyph and keeps the displayed draft
 * unchanged while making the token unambiguous to the plugin.
 */
export const PASTED_MENTION_MARKER = '\u2060'

const MENTION_START = /@(?=[^\s@])/gu

/** Add the internal marker after every @ that starts a pasted token. */
export function protectPastedMentions(text: string): string {
  return text.replace(MENTION_START, `@${PASTED_MENTION_MARKER}`)
}

/** Whether a parsed token contains the internal pasted-text marker. */
export function isProtectedMentionToken(token: string): boolean {
  return token.includes(PASTED_MENTION_MARKER)
}

/** Restore pasted text before it is shown to the model or another consumer. */
export function stripPastedMentionMarkers(text: string): string {
  return text.replaceAll(PASTED_MENTION_MARKER, '')
}
