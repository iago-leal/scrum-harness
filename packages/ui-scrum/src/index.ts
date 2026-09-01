/**
 * Node half of the SCRUM board UI plugin. The browser half (`./client`) owns
 * every surface; the host row exists so the Loader entry mounts and the
 * client-modules scan finds the `dsh.client` declaration.
 * @module @scrum-harness/ui
 */

import type { Context } from '@deepseek-ai/cordis'

export const name = 'ui-scrum'

/**
 * Intentionally empty: the package contributes browser surfaces only.
 * @param _ctx - host context (unused).
 */
export function apply(_ctx: Context): void {}
