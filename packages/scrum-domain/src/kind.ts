/**
 * Task kind (v0.16, comp-45): `test | code | other` as domain data. The
 * `[test]`/`[code]` title convention the boards used by hand since spr-11
 * becomes a field — this module is the ONE place that interprets the prefix
 * (the schema migration and the service both call {@link splitKindPrefix})
 * and the one place that orders tasks by creation ({@link taskNumber}).
 * @module @scrum-harness/domain/kind
 */

/** The task kinds. `other` is the silent default (validation, spike, docs). */
export const TASK_KINDS = ['test', 'code', 'other'] as const
export type TaskKind = (typeof TASK_KINDS)[number]

/** The outcome of reading a kind prefix off a title. */
export interface SplitKind {
  /** The kind the title yields: the matched prefix, or `other`. */
  kind: TaskKind
  /** The title without the prefix, trimmed — never empty when the input has a non-blank character. */
  title: string
  /** True when the title is ONLY a prefix (`[test]`): kind falls back to `other`, the title stays as is. */
  prefixOnly: boolean
  /** The prefix the regex matched, when any — the base of conflict detection (R2d). */
  matched?: TaskKind
}

/** Leading `[test]` / `[code]` (case-insensitive), whitespace tolerant on both sides (P1). */
const PREFIX = /^\s*\[(test|code)\]\s*/i

/**
 * Read a kind prefix off a title. Total: it never yields an empty title for a
 * non-blank input — a prefix-only title comes back intact as `other` with
 * `prefixOnly: true`, so a legacy record can never migrate into an invalid
 * one (the parse is tolerant; the entry points of the service are not).
 * @param title - the raw title.
 * @returns the kind, the cleaned title and the split bookkeeping.
 */
export function splitKindPrefix(title: string): SplitKind {
  const trimmed = title.trim()
  const match = PREFIX.exec(trimmed)
  if (match === null) return { kind: 'other', title: trimmed, prefixOnly: false }
  const matched = match[1]!.toLowerCase() as TaskKind
  const rest = trimmed.slice(match[0].length).trim()
  if (rest.length === 0) return { kind: 'other', title: trimmed, prefixOnly: true, matched }
  return { kind: matched, title: rest, prefixOnly: false, matched }
}

/**
 * The creation order of a task: the number of its id (`task-N`, a monotonic
 * per-board counter). `createdAt` can tie within a millisecond and `order`
 * reuses values after purges — the id number is the only safe key, and it
 * must be compared numerically (`'task-9' > 'task-10'` as strings).
 * @param id - a task id.
 * @returns N.
 */
export function taskNumber(id: string): number {
  return Number(id.slice('task-'.length))
}
