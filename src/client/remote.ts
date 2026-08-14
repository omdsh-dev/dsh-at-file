/**
 * The client-side Typert Remote contribution for the dsh-at-file host
 * service: mounts the shared strict descriptors into `ctx.remote.atFile`.
 * The descriptors and codecs come from the shared contract module, so the
 * browser bundle and the host manifest stay on one wire definition.
 */
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { AT_FILE_INVOCATIONS } from '../contract.ts'
import type { AtFileSettings, AtFileSettingsUpdate } from '../contract.ts'

export type { FileEntry } from '../contract.ts'

/** The atFile Remote namespace's client contribution. */
export const AT_FILE_REMOTE: TypertRemoteContribution = {
  package: 'dsh-at-file',
  descriptors: AT_FILE_INVOCATIONS,
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  // Typed face of the mounted namespace. Note: the runtime access is NOT the
  // dotted `ctx.remote.atFile` read — that path walks the cordis fiber chain
  // and stops at the Loader's runtime-less internal forks between a plugin
  // entry and the root fiber. The plugin resolves the namespace service
  // through `ctx.reflect.get('remote.atFile')` instead (see client/index.ts).
  /** The `atFile` namespace face mounted under `ctx.remote.atFile`. */
  interface TypertRemoteNamespace$617446696c65 {
    search: (agentId: SessionId, signal?: AbortSignal) => Promise<RemoteResult<readonly import('../contract.ts').FileEntry[]>>
    getSettings: () => Promise<RemoteResult<AtFileSettings>>
    updateSettings: (update: AtFileSettingsUpdate) => Promise<RemoteResult<AtFileSettings>>
  }
  interface TypertRemoteMap {
    'atFile/search': (agentId: SessionId, signal?: AbortSignal) => Promise<RemoteResult<readonly import('../contract.ts').FileEntry[]>>
    'atFile/getSettings': () => Promise<RemoteResult<AtFileSettings>>
    'atFile/updateSettings': (update: AtFileSettingsUpdate) => Promise<RemoteResult<AtFileSettings>>
  }
  interface TypertRemoteNamespaceMap {
    atFile: TypertRemoteNamespace$617446696c65
  }
}
