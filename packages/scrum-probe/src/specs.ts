/**
 * The probe behind the project spec set (v0.24, comp-59 R4): the only
 * environment the spec reading touches. It lists `<cwd>/specs/*.md` FLAT —
 * regular files only, exact `.md` extension, dot names skipped, code-point
 * order — and hands back each file's size and (when within the cap) its
 * UTF-8 text. It knows no catalog and judges nothing: the Model
 * (`SpecSet.of` in the domain) classifies what it gets. Read errors are
 * swallowed into `unreadable` so a poll never throws (D2).
 * @module @scrum-harness/probe/specs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { join } from 'node:path'

/**
 * One file of `specs/` as the probe saw it. Structurally identical to the
 * domain's `SpecFile` (D5: neither package imports the other).
 */
export interface SpecFile {
  /** Basename, e.g. `PRD.md`. */
  name: string
  /** Size in bytes (0 when unreadable). */
  size: number
  /** The whole UTF-8 text — present only when `size ≤ cap` and the read succeeded. */
  text?: string
  /** Set when `statSync`/`readFileSync` failed after the listing (EACCES, removed in between, I/O). */
  unreadable?: true
}

/** What the probe found at `<cwd>/specs`. */
export type SpecsProbe =
  | { kind: 'absent' }
  | { kind: 'not-a-directory' }
  | { kind: 'dir'; files: SpecFile[] }

/**
 * List the spec files of one workspace.
 * @param cwd - the absolute workspace root.
 * @param cap - the per-file byte cap above which the text is not read (the domain's `SPEC_FILE_CAP`).
 * @returns `absent` (no `specs`, or a broken symlink), `not-a-directory`, or the flat listing.
 */
export function listSpecFiles(cwd: string, cap: number): SpecsProbe {
  const dir = join(cwd, 'specs')
  let stat: ReturnType<typeof statSync>
  try {
    stat = statSync(dir) // follows a symlink to a directory; throws on absent / broken symlink
  } catch {
    return { kind: 'absent' }
  }
  if (!stat.isDirectory()) return { kind: 'not-a-directory' }
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return { kind: 'dir', files: [] }
  }
  const files: SpecFile[] = []
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.') || !entry.name.endsWith('.md')) continue
    files.push(readSpec(join(dir, entry.name), entry.name, cap))
  }
  files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return { kind: 'dir', files }
}

/** Stat and (within the cap) read one spec file; any failure yields `unreadable`. */
function readSpec(path: string, name: string, cap: number): SpecFile {
  try {
    const size = statSync(path).size
    if (size > cap) return { name, size }
    return { name, size, text: readFileSync(path, 'utf8') }
  } catch {
    return { name, size: 0, unreadable: true }
  }
}
