/**
 * `at-file` locale namespace: referenced-path dock and settings copy.
 * Chinese is the product copy; English mirrors it.
 */
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: {
    'dock.aria': string;
    'dock.remove': string;
    nav: string;
    'settings.title': string;
    'settings.subtitle': string;
    'settings.enabled': string;
    'settings.enabledDesc': string;
    'settings.ignoreFiles': string;
    'settings.ignoreFilesDesc': string;
    'settings.ignoreFilesHint': string;
    'settings.save': string;
    'settings.saving': string;
};
/** The `at-file` namespace key union. */
export type AtFileKey = keyof typeof zh;
/** English dictionary, checked complete against the zh key set. */
export declare const en: {
    'dock.aria': string;
    'dock.remove': string;
    nav: string;
    'settings.title': string;
    'settings.subtitle': string;
    'settings.enabled': string;
    'settings.enabledDesc': string;
    'settings.ignoreFiles': string;
    'settings.ignoreFilesDesc': string;
    'settings.ignoreFilesHint': string;
    'settings.save': string;
    'settings.saving': string;
};
/** Locale namespace id registered under ctx.locale. */
export declare const NS = "at-file";
/**
 * Fill one dictionary template's `{name}`-style placeholders.
 * @param template - dictionary text.
 * @param params - placeholder values; absent params replace nothing.
 * @returns the filled text.
 */
export declare function fmt(template: string, params?: Record<string, string>): string;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The @file reference and settings copy. */
        [NS]: AtFileKey;
    }
}
