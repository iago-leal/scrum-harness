/**
 * Board addressing: every workspace directory maps to one stable storage
 * name, so each workspace gets its own SCRUM board (its own domain medium).
 * Sessions without a workspace share the global fallback board.
 * @module @scrum-harness/domain/boards
 */

import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Domain name of the fallback board (sessions/requests without a workspace).
 * Unit names must match the storage contract `/^[a-z][a-z0-9_]*$/` — no
 * hyphens — hence the underscores.
 */
export const GLOBAL_BOARD_NAME = 'scrum_global'

/** Prefix of every per-workspace domain name (see {@link GLOBAL_BOARD_NAME} on charset). */
export const BOARD_NAME_PREFIX = 'scrum_ws_'

/**
 * Canonicalize one workspace path the same way the harness does for
 * workspace identity: absolute, then `realpath` (symlinks, `..`, trailing
 * separators resolved). A path that does not exist (yet) keeps its resolved
 * absolute form, so the mapping stays deterministic.
 * @param cwd - workspace directory path.
 * @returns the canonical absolute path.
 */
export function canonicalWorkspacePath(cwd: string): string {
  const absolute = resolve(cwd.trim())
  try {
    return realpathSync.native(absolute)
  } catch {
    return absolute
  }
}

/**
 * Derive the storage-domain name of one workspace's board. The name embeds a
 * short stable content hash of the canonical path (paths are long, carry
 * separators and unicode — unusable as storage names directly).
 * @param cwd - workspace directory path; undefined/empty selects the global board.
 * @returns the domain name (`scrum_ws_<12 hex>` or `scrum_global`).
 */
export function boardNameOf(cwd: string | undefined): string {
  if (cwd === undefined || cwd.trim().length === 0) return GLOBAL_BOARD_NAME
  const canonical = canonicalWorkspacePath(cwd)
  const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 12)
  return `${BOARD_NAME_PREFIX}${hash}`
}
