import type { UserMessage } from '@deepseek-ai/dsh-llm';
import type { PreStepDecision } from '@deepseek-ai/dsh-agent';
/** One recognized mention: its workspace-relative token and resolved kind. */
export interface Mention {
    /** Workspace-relative path (no leading @, no trailing slash). */
    readonly relative: string;
    readonly kind: 'file' | 'dir';
}
/** The source tag the injected reference carries (transcript consumers use it). */
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'at-file-mention': {
            kind: 'at-file-mention';
            relative: string;
        };
    }
}
/**
 * Scan one text block for `@path` tokens, deduplicated in first-seen order.
 * A trailing slash (the directory chip form) is stripped from the path.
 * @param text - the message text block.
 * @returns unique workspace-relative tokens.
 */
export declare function scanMentions(text: string): readonly string[];
/**
 * Expand every `@path` mention into a validated existence-only reference, in
 * first-seen order. Unknown paths stay plain prose.
 * @param messages - the assembled step messages.
 * @param cwd - the session's workspace directory.
 * @param signal - caller lifetime.
 * @returns the injected user messages (empty when nothing matched or disabled).
 */
export declare function expandMentions(messages: readonly UserMessage[], cwd: string | undefined, signal: AbortSignal): Promise<UserMessage[]>;
/** The minimal agent face the pre-step handler reads. */
export interface MentionAgent {
    session: {
        header: {
            cwd?: string;
        };
    };
}
/**
 * The `agent/pre-step` listener body: expand mentions in the claimed user
 * messages and append the injections to the downstream decision. Extracted so
 * the boundary logic is unit-testable without an assembled agent scope.
 * @param agent - the addressed agent (its session header owns the cwd).
 * @param isEnabled - live settings read.
 * @param messages - the claimed messages (the user's own words).
 * @param signal - caller lifetime.
 * @param next - the downstream waterfall.
 * @returns the decision with injections appended, or the downstream decision.
 */
export declare function mentionPreStep(agent: MentionAgent, isEnabled: () => boolean, messages: readonly UserMessage[], signal: AbortSignal, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>;
