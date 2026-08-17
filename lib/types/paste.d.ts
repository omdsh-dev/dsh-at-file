/**
 * Internal marker used to distinguish pasted @ tokens from text the user
 * typed. It is removed at the Host boundary before the prompt reaches the
 * model. Word joiner has no visible glyph and keeps the displayed draft
 * unchanged while making the token unambiguous to the plugin.
 */
export declare const PASTED_MENTION_MARKER = "\u2060";
/** Add the internal marker after every @ that starts a pasted token. */
export declare function protectPastedMentions(text: string): string;
/** Whether a parsed token contains the internal pasted-text marker. */
export declare function isProtectedMentionToken(token: string): boolean;
/** Restore pasted text before it is shown to the model or another consumer. */
export declare function stripPastedMentionMarkers(text: string): string;
