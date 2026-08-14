import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { MenuState, TriggerGuard } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
/** Controller surface required by the navigation bridge. */
export interface FolderNavigationController {
    readonly menu: SnapshotStore<MenuState>;
    track(draft: string, caret: number, guard: TriggerGuard, draftRev: number): void;
}
/** Injected controller for the current session. */
export interface FolderNavigatorInjected {
    readonly controller: FolderNavigationController;
}
/** Overlay entry props: session input state/actions plus the trigger controller. */
export type FolderNavigatorProps = PropsRuntime<'conversation.input.overlay'> & InjectFace<FolderNavigatorInjected>;
/** Input facts needed to validate a menu-time directory navigation. */
export interface FolderNavigationInput {
    readonly draft: string;
    readonly draftRev: number;
    readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting';
}
/** Textarea selection at the moment ArrowRight is pressed. */
export interface FolderNavigationSelection {
    readonly start: number;
    readonly end: number;
}
/** Accepted directory navigation and the follow-up trigger tracking data. */
export interface FolderNavigationTarget {
    readonly draft: string;
    readonly caret: number;
    readonly tier: 'plain' | 'claimed';
}
/** A plain ArrowRight gesture, with no IME or modifier ownership. */
export declare function isFolderNavigationKey(event: Pick<KeyboardEvent, 'key' | 'keyCode' | 'defaultPrevented' | 'isComposing' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): boolean;
/** Resolve the highlighted directory into an exact @path/ replacement. */
export declare function folderNavigationTarget(menu: MenuState, input: FolderNavigationInput, selection: FolderNavigationSelection): FolderNavigationTarget | undefined;
/** Invisible overlay entry that consumes ArrowRight only for highlighted directories. */
export declare function FolderNavigator({ controller, useInput, inputActions }: FolderNavigatorProps): null;
