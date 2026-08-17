/** Arrow-right directory navigation for the at-file candidate menu. */
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  InputTriggerCandidate, MenuState, TriggerGuard,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { SOURCE_NAME } from './source.ts'
import { protectPastedMentions } from '../paste.ts'
import type { AtFileSettingsSource } from './FilesDock.tsx'

/** Controller surface required by the navigation bridge. */
export interface FolderNavigationController {
  readonly menu: SnapshotStore<MenuState>
  track(draft: string, caret: number, guard: TriggerGuard, draftRev: number): void
}

/** Injected controller for the current session. */
export interface FolderNavigatorInjected {
  readonly controller: FolderNavigationController
  readonly hooks: { scope: AtFileSettingsSource }
}

/** Overlay entry props: session input state/actions plus the trigger controller. */
export type FolderNavigatorProps = PropsRuntime<'conversation.input.overlay'> & InjectFace<FolderNavigatorInjected>

/** Input facts needed to validate a menu-time directory navigation. */
export interface FolderNavigationInput {
  readonly draft: string
  readonly draftRev: number
  readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting'
}

/** Textarea selection at the moment ArrowRight is pressed. */
export interface FolderNavigationSelection {
  readonly start: number
  readonly end: number
}

/** Accepted directory navigation and the follow-up trigger tracking data. */
export interface FolderNavigationTarget {
  readonly draft: string
  readonly caret: number
  readonly tier: 'plain' | 'claimed'
}

/** A plain ArrowRight gesture, with no IME or modifier ownership. */
export function isFolderNavigationKey(event: Pick<KeyboardEvent,
  'key' | 'keyCode' | 'defaultPrevented' | 'isComposing' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): boolean {
  return event.key === 'ArrowRight'
    && !event.defaultPrevented
    && !event.isComposing
    && event.keyCode !== 229
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
}

/** Resolve the highlighted directory into an exact @path/ replacement. */
export function folderNavigationTarget(
  menu: MenuState,
  input: FolderNavigationInput,
  selection: FolderNavigationSelection,
): FolderNavigationTarget | undefined {
  if (!menu.open || menu.hit === null || menu.highlight === null) return undefined
  const { hit, highlight } = menu
  if (hit.trigger !== '@' || highlight.source !== SOURCE_NAME || hit.span.draftRev !== input.draftRev) return undefined
  if (selection.start !== selection.end || selection.start !== hit.span.end) return undefined
  if (input.phase !== 'plain' && input.phase !== 'claimed') return undefined
  const group = menu.groups.find(candidate => candidate.source === SOURCE_NAME)
  if (group?.status !== 'ready') return undefined
  const candidate = group.items[highlight.index] as InputTriggerCandidate | undefined
  if (candidate?.atFileKind !== 'dir' || candidate.value === undefined) return undefined
  const token = `@${candidate.value}/`
  return {
    draft: input.draft.slice(0, hit.span.start) + token + input.draft.slice(hit.span.end),
    caret: hit.span.start + token.length,
    tier: input.phase,
  }
}

interface PendingNavigation extends FolderNavigationTarget {
  readonly textarea: HTMLTextAreaElement
}

/** Invisible overlay entry that consumes ArrowRight only for highlighted directories. */
export function FolderNavigator({ controller, useInput, inputActions, useScope }: FolderNavigatorProps) {
  const input = useInput(state => state)
  const ignorePastedMentions = useScope?.(snapshot => snapshot.value?.ignorePastedMentions ?? true) ?? true
  const pending = useRef<PendingNavigation | null>(null)

  useLayoutEffect(() => {
    const navigation = pending.current
    if (navigation === null) return
    pending.current = null
    controller.track(input.draft, navigation.caret, { tier: navigation.tier }, input.draftRev)
    navigation.textarea.setSelectionRange(navigation.caret, navigation.caret)
  }, [controller, input.draft, input.draftRev])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isFolderNavigationKey(event)) return
      if (!(event.target instanceof HTMLTextAreaElement)) return
      const target = folderNavigationTarget(controller.menu.getSnapshot(), input, {
        start: event.target.selectionStart,
        end: event.target.selectionEnd,
      })
      if (target === undefined) return
      event.preventDefault()
      event.stopPropagation()
      pending.current = { ...target, textarea: event.target }
      inputActions.setDraft(target.draft)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => { document.removeEventListener('keydown', onKeyDown, true) }
  }, [controller, input, inputActions])

  useEffect(() => {
    if (!ignorePastedMentions) return
    const onPaste = (event: ClipboardEvent): void => {
      if (!(event.target instanceof HTMLTextAreaElement)) return
      const clipboard = event.clipboardData
      if (clipboard === null) return
      const originalGetData = clipboard.getData.bind(clipboard)
      const text = originalGetData('text/plain')
      const protectedText = protectPastedMentions(text)
      if (protectedText === text) return
      // InputBar owns the actual paste transaction and reads getData during
      // the bubble phase. Patch only this event's DataTransfer so the visible
      // draft stays unchanged while the Host can identify pasted mentions.
      try {
        Object.defineProperty(clipboard, 'getData', {
          configurable: true,
          value: (format: string) => format === 'text/plain' ? protectedText : originalGetData(format),
        })
      } catch {
        // Some browsers expose a non-extensible DataTransfer. The normal
        // picker behavior remains available; the Host marker is best effort.
      }
    }
    document.addEventListener('paste', onPaste, true)
    return () => { document.removeEventListener('paste', onPaste, true) }
  }, [ignorePastedMentions])

  return null
}
