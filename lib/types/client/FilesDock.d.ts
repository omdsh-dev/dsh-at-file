/**
 * Referenced-path dock: one row per @path token currently in the draft,
 * rendered above the composer (the 'conversation.input.dock' strip). The row
 * is the user's path link before and after send: clicking the path opens the
 * file on the host, the × removes the token from the draft. The draft holds
 * plain-text @path tokens (the plain-text-reference decision), so the dock
 * parses them directly; the plugin settings source's live enable value gates
 * the strip.
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client';
import type { AtFileSettings } from '../contract.ts';
export interface AtFileSettingsSnapshot {
    readonly value: AtFileSettings;
}
export type AtFileSettingsSource = ObservableSnapshot<AtFileSettingsSnapshot>;
/** Injected business face: open one relative path, and the live settings source. */
export interface AtFileDockInjected {
    onOpen: (relative: string) => void;
    hooks: {
        scope: AtFileSettingsSource;
    };
}
/** Full dock entry props: InputZone owner share + session standard kit + injected face + locale seat. */
export type AtFileDockProps = PropsRuntime<'conversation.input.dock'> & InjectFace<AtFileDockInjected> & PropsLocale<'at-file'>;
/** One parsed mention token in the draft, with its span for precise removal. */
interface DraftMention {
    readonly relative: string;
    readonly start: number;
    readonly end: number;
}
/** Parse the draft's @path tokens in order, deduplicating by relative path. */
export declare function draftMentions(draft: string): readonly DraftMention[];
/** Draft text with one token span removed. */
export declare function withoutToken(draft: string, start: number, end: number): string;
/**
 * Render the referenced-path rows; null while the draft has no @path tokens or
 * the settings switch is off.
 * @param props - runtime (input currency + actions), inject, and locale shares.
 * @returns the dock strip, or null.
 */
export declare function FilesDock({ input, inputActions, onOpen, useScope, t }: AtFileDockProps): import("react").JSX.Element | null;
export {};
