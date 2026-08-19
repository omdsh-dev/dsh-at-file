/** Settings section for global and workspace-specific file filter rules. */
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { FileIgnoreRuleInput } from '../contract.ts';
import type { AtFileSettingsSource } from './FilesDock.tsx';
export type AtFileFilterScope = 'global' | 'workspace';
/** Ephemeral settings navigation retained while the plugin stays mounted. */
export interface AtFileSectionViewState {
    filterScope: AtFileFilterScope;
    selectedWorkspace: string;
}
/** Injected business face: the live scope, retained view, and durable write verbs. */
export interface AtFileSectionInjected {
    hooks: {
        scope: AtFileSettingsSource;
    };
    viewState: AtFileSectionViewState;
    setEnabled: (enabled: boolean) => Promise<void>;
    setIgnorePastedMentions: (ignore: boolean) => Promise<void>;
    setIgnoreFiles: (ignoreFiles: readonly FileIgnoreRuleInput[]) => Promise<void>;
    setWorkspaceIgnoreFiles: (workspace: string, ignoreFiles: readonly FileIgnoreRuleInput[]) => Promise<void>;
}
/** Full section props: runtime share + injected face + locale seat. */
export type AtFileSectionProps = PropsRuntime<'settings.section'> & InjectFace<AtFileSectionInjected> & PropsLocale<'at-file'>;
/** Trim one legacy exact basename; retained for callers using the old helper. */
export declare function parseIgnoreFile(value: string): string | undefined;
/** Render the enable switch and scoped file-filter manager. */
export declare function AtFileSection({ useScope, useSessions, useWorkspaces, viewState, setEnabled, setIgnorePastedMentions, setIgnoreFiles, setWorkspaceIgnoreFiles, t, }: AtFileSectionProps): import("react").JSX.Element;
