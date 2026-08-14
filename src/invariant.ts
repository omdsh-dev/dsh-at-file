/**
 * Package-owned invariant companion for `dsh-at-file`.
 * @module dsh-at-file/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = 'dsh-at-file'

/** Cordis companion plugin name. */
export const name = 'dsh-at-file-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: search results are derived per call from the live
 * filesystem, the strict Typert manifest and the settings namespace are
 * registry-owned registrations, and the pre-step marker validates paths and
 * injects existence-only references without cross-plugin mutable state. All
 * are proven by the composition spec's disposal assertions rather than by an
 * event-stream relationship.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
