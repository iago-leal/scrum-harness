/**
 * The disk probe behind `scrum_trace` (v0.18, comp-49 R6): the only
 * environment the trace query touches. It resolves an absolute candidate
 * against the session workspace LEXICALLY (no realpath on either side —
 * macOS's `/var` → `/private/var` symlink would otherwise put a temp
 * workspace "outside" itself) and lists what exists under a query, skipping
 * `node_modules`, `.git`, dot names and the plain names the Model reduced
 * the root `.gitignore` to. Every rule (matching, missing, untraced, the
 * `.gitignore` reduction) lives in the domain; this module only looks.
 * @module @scrum-harness/tool-scrum/probe
 */

import { readdirSync, statSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { join, resolve, sep } from 'node:path'

/** Names never listed, whatever the `.gitignore` says. */
const ALWAYS_SKIPPED = new Set(['node_modules', '.git'])

/**
 * Resolve an absolute candidate against the workspace root, lexically.
 * @param cwd - the session workspace.
 * @param candidate - an absolute path.
 * @returns the workspace-relative form (`''` for the root itself), or null when the candidate lies outside.
 */
export function resolveWorkspacePath(cwd: string, candidate: string): string | null {
  const root = resolve(cwd)
  const abs = resolve(candidate)
  if (abs === root) return ''
  if (!abs.startsWith(root + sep)) return null
  return abs.slice(root.length + 1).split(sep).join('/')
}

/**
 * List the files under one query of the workspace, workspace-relative and
 * in code-point order — up to `cap`, after which the walk stops and
 * `truncated` is raised. A file query lists itself; a missing path lists
 * nothing. Symlinks are ignored (neither files nor directories to the walk).
 * @param root - the absolute workspace root.
 * @param query - a workspace-relative path ('' = the root).
 * @param ignore - basenames to skip at any depth (from `gitignoreNames`).
 * @param cap - the most files to return.
 * @returns the listing and whether it hit the cap.
 */
export function listWorkspaceFiles(root: string, query: string, ignore: ReadonlySet<string>, cap: number): { files: string[]; truncated: boolean } {
  const target = query === '' ? root : join(root, ...query.split('/'))
  let stat: ReturnType<typeof statSync> | undefined
  try {
    stat = statSync(target)
  } catch {
    return { files: [], truncated: false }
  }
  if (stat.isFile()) return { files: [query], truncated: false }
  if (!stat.isDirectory()) return { files: [], truncated: false }
  const skip = (name: string): boolean => ALWAYS_SKIPPED.has(name) || name.startsWith('.') || ignore.has(name)
  const files: string[] = []
  let truncated = false
  const pending: string[] = [query]
  while (pending.length > 0 && !truncated) {
    const dir = pending.shift()!
    const abs = dir === '' ? root : join(root, ...dir.split('/'))
    let entries: Dirent[]
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (skip(entry.name)) continue
      const rel = dir === '' ? entry.name : `${dir}/${entry.name}`
      if (entry.isDirectory()) pending.push(rel)
      else if (entry.isFile()) {
        if (files.length >= cap) { truncated = true; break }
        files.push(rel)
      }
    }
  }
  files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return { files, truncated }
}
