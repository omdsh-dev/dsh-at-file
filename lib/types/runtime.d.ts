/**
 * The dsh-at-file host Remote service (`ctx.atFile`, wire namespace `atFile`).
 * Registered as a TypertRemoteService so the Host Gateway's source-mode
 * discovery exports its @Remote methods to the Web client under
 * `/api/atFile/<method>` with zero generated artifacts: `search` takes the
 * resolved live Agent (the `agent` Typert lookup) and indexes its workspace.
 * File content never crosses this wire or the Host mention boundary; the
 * plugin only indexes and marks user-selected paths.
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { AtFileSettings, AtFileSettingsUpdate, FileEntry } from './contract.ts';
import type { ResolvedConfig } from './types.ts';
/** At-file workspace service: search the cwd index for the browser picker. */
export declare class AtFileRuntime extends TypertRemoteService {
    private readonly config;
    private readonly readSettings;
    private readonly writeSettings;
    /**
     * Register the service under the `atFile` key (the wire namespace).
     * @param ctx - owning cordis context.
     * @param config - resolved plugin configuration.
     * @param isEnabled - live settings read; false refuses the endpoint.
     */
    constructor(ctx: Context, config: ResolvedConfig, readSettings: () => AtFileSettings, writeSettings: (update: AtFileSettingsUpdate) => Promise<AtFileSettings>);
    /** Read the resolved durable settings through the plugin-owned wire. */
    getSettings(): AtFileSettings;
    /** Persist one settings field and return the resolved section. */
    updateSettings(update: AtFileSettingsUpdate): Promise<AtFileSettings>;
    /**
     * Index the addressed agent's workspace and return the bounded entry list.
     * The client caches the list per session and filters per keystroke.
     * @param agent - the live agent resolved from the `agentId` wire field; its
     *   session header owns the workspace cwd.
     * @param signal - caller lifetime; the walk races it.
     * @returns workspace-root-relative entries with their absolute paths.
     */
    search(agent: Agent, signal: AbortSignal): Promise<readonly FileEntry[]>;
}
