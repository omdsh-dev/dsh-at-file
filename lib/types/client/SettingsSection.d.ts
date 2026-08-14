/** Settings section for global and workspace-specific file filter rules. */
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { FileIgnoreRuleInput } from '../contract.ts';
import type { AtFileSettingsSource } from './FilesDock.tsx';
/** Injected business face: the live scope and durable write verbs. */
export interface AtFileSectionInjected {
    hooks: {
        scope: AtFileSettingsSource;
    };
    setEnabled: (enabled: boolean) => Promise<void>;
    setIgnoreFiles: (ignoreFiles: readonly FileIgnoreRuleInput[]) => Promise<void>;
    setWorkspaceIgnoreFiles: (workspace: string, ignoreFiles: readonly FileIgnoreRuleInput[]) => Promise<void>;
}
/** Full section props: runtime share + injected face + locale seat. */
export type AtFileSectionProps = PropsRuntime<'settings.section'> & InjectFace<AtFileSectionInjected> & PropsLocale<'at-file'>;
/** Trim one legacy exact basename; retained for callers using the old helper. */
export declare function parseIgnoreFile(value: string): string | undefined;
/** Render the enable switch and scoped file-filter manager. */
export declare function AtFileSection({ useScope, useSessions, useWorkspaces, setEnabled, setIgnoreFiles, setWorkspaceIgnoreFiles, t, }: AtFileSectionProps): import("react").JSX.Element;
