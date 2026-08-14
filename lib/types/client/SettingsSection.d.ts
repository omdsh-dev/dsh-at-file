/** Settings section for global and workspace-specific file-name filters. */
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { AtFileSettings } from '../contract.ts';
/** Injected business face: the live scope and durable write verbs. */
export interface AtFileSectionInjected {
    hooks: {
        scope: SettingsScope<AtFileSettings>;
    };
    setEnabled: (enabled: boolean) => Promise<void>;
    setIgnoreFiles: (ignoreFiles: readonly string[]) => Promise<void>;
    setWorkspaceIgnoreFiles: (workspace: string, ignoreFiles: readonly string[]) => Promise<void>;
}
/** Full section props: runtime share + injected face + locale seat. */
export type AtFileSectionProps = PropsRuntime<'settings.section'> & InjectFace<AtFileSectionInjected> & PropsLocale<'at-file'>;
/** Trim one proposed basename; an empty result means there is nothing to add. */
export declare function parseIgnoreFile(value: string): string | undefined;
/** Render the enable switch and scoped file-name filter manager. */
export declare function AtFileSection({ useScope, useSessions, useWorkspaces, setEnabled, setIgnoreFiles, setWorkspaceIgnoreFiles, t, }: AtFileSectionProps): import("react").JSX.Element;
