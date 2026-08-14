/**
 * The '@' input-trigger source: turns the ui-input-trigger pipeline into the
 * Codex-style file picker. `candidates` serves the smart-searched rows (the
 * workspace index is fetched once per session and filtered locally per
 * keystroke); `onPick` lands the plain-text `@path` reference — the draft
 * keeps a readable token (no chip), and the Host's pre-step boundary validates
 * it as an existence-only workspace reference. Pure factory over injected
 * deps: the browser bundle wires the real Remote and clock, tests wire stubs.
 */
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client';
import type { FileEntry } from './remote.ts';
declare module '@deepseek-ai/dsh-client-ui-input-trigger/client' {
    interface InputTriggerCandidate {
        /** Source-owned stable value when the visible name is only a display label. */
        readonly value?: string;
        /** Indexed path kind used by source-owned keyboard navigation. */
        readonly atFileKind?: FileEntry['kind'];
    }
}
/** Owner source name (the lexicon and decoration routing key). */
export declare const SOURCE_NAME = "at-file";
/** Design cap on visible picker rows (menu height mirrors the slash menu). */
export declare const MAX_CANDIDATES = 12;
/** How long one session's index stays hot before the next menu open refetches. */
export declare const INDEX_TTL_MS = 30000;
/** Everything the source needs that the browser bundle supplies (tests stub). */
export interface AtFileSourceDeps {
    /** Search the addressed session's workspace index (Remote wrapper). */
    search(sessionId: SessionId, signal: AbortSignal): Promise<readonly FileEntry[]>;
    /** Monotonic clock for index freshness (default Date.now). */
    now?: () => number;
}
/** The registered source plus the cache teardown the wiring layer owns. */
export interface AtFileSource {
    readonly source: InputTriggerSource;
    /** Drop every per-session cache and path map (connection reset). */
    invalidateAll(): void;
}
/**
 * Build the '@' trigger source over the injected deps. One source per plugin
 * fiber; per-session caches live in the returned closure and die with it.
 * @param deps - Remote, locale, and clock faces.
 * @returns the source to register with `inputTriggers.registerSource`, plus
 *   the cache invalidator.
 */
export declare function createAtFileSource(deps: AtFileSourceDeps): AtFileSource;
