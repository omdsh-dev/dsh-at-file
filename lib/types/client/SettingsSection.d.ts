/**
 * The settings page section for the `at-file` namespace: a clearly labeled
 * enable checkbox plus an exact-basename filter editor over the durable
 * settings scope. Product copy rides the `at-file` locale namespace.
 */
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { AtFileSettings } from '../contract.ts';
/** Injected business face: the live scope (bound to `useScope`) and the write verb. */
export interface AtFileSectionInjected {
    hooks: {
        scope: SettingsScope<AtFileSettings>;
    };
    setEnabled: (enabled: boolean) => Promise<void>;
    setIgnoreFiles: (ignoreFiles: readonly string[]) => Promise<void>;
}
/** Full section props: runtime share + injected face + the locale seat. */
export type AtFileSectionProps = PropsRuntime<'settings.section'> & InjectFace<AtFileSectionInjected> & PropsLocale<'at-file'>;
/**
 * Parse one-basename-per-line settings text into a normalized list.
 * @param value - textarea content.
 * @returns trimmed entries with blank and case-insensitive duplicates removed.
 */
export declare function parseIgnoreFiles(value: string): string[];
/**
 * Render the enable switch and exact-basename filter editor.
 * @param props - runtime share, the bound scope hook, the write verb, and `t`.
 * @returns the section element tree.
 */
export declare function AtFileSection({ useScope, setEnabled, setIgnoreFiles, t }: AtFileSectionProps): import("react").JSX.Element;
