/**
 * SCRUM domain declaration: the zod record schemas and the `defineDomain` spec
 * for the storage-domain backend. Hierarchy: Release > Feature > Component
 * (product backlog) > Task, plus Sprints as time windows selecting Tasks and
 * append-only Ceremony records (planning / standup / review / retrospective).
 * @module @scrum-harness/domain/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { TASK_KINDS, splitKindPrefix } from './kind.ts'

/** Lifecycle of a Release. */
export const RELEASE_STATUSES = ['planned', 'active', 'released'] as const
/**
 * Workflow of a Feature (função), à la Azure DevOps state categories:
 * proposed → committed (selected for the release) → in_progress → done.
 */
export const FEATURE_STATUSES = ['proposed', 'committed', 'in_progress', 'done'] as const
/**
 * Workflow of a Component (product-backlog entry): its own explicit state,
 * so components progress visibly on multi-level boards (Azure DevOps style).
 */
export const COMPONENT_STATUSES = ['proposed', 'in_progress', 'done'] as const
/**
 * The spiral phases a Component walks (v0.12, comp-42): requirements →
 * design → tdd → construction → validation. Ordered: the service advances
 * one step at a time through gates and retreats freely.
 */
export const COMPONENT_PHASES = ['requirements', 'design', 'tdd', 'construction', 'validation'] as const
export type ComponentPhase = (typeof COMPONENT_PHASES)[number]
/**
 * Task workflow. `backlog` means not selected into any sprint; the four other
 * statuses are the Kanban columns of the sprint the task belongs to.
 */
export const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done'] as const
/** Kanban columns (the Task statuses valid while a task is inside a sprint). */
export const BOARD_COLUMNS = ['todo', 'in_progress', 'review', 'done'] as const
/** Lifecycle of a Sprint. */
export const SPRINT_STATUSES = ['planned', 'active', 'completed'] as const
/** The SCRUM ceremonies recorded against a sprint. */
export const CEREMONY_TYPES = ['planning', 'standup', 'review', 'retrospective'] as const

/** ISO-8601 timestamp string. */
const isoDate = z.string().min(1)

/**
 * Lifecycle shelf fields shared by every hierarchy record. The three states
 * are mutually exclusive: live (neither field), archived (`archivedAt` —
 * concluded and stowed away, restorable) or trashed (`deletedAt` — soft
 * deleted, restorable or purgeable). A cascade stamps the same timestamp on
 * the whole subtree, so restore/unarchive can revive exactly that operation.
 * Optional fields: media written before v0.2 still validates unchanged.
 */
const shelfFields = {
  /** Set while the record sits in the trash (soft-deleted). */
  deletedAt: isoDate.optional(),
  /** Set while the record is archived (concluded, out of the main views). */
  archivedAt: isoDate.optional(),
}

/** Top level: one product Release (a shippable version). */
export const releaseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  targetDate: z.string().optional(),
  status: z.enum(RELEASE_STATUSES),
  order: z.number().int().nonnegative(),
  createdAt: isoDate,
  updatedAt: isoDate,
  ...shelfFields,
})
export type Release = z.infer<typeof releaseSchema>

/** Second level: a Feature (função) delivered by a Release. */
export const featureSchema = z.object({
  id: z.string(),
  releaseId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(FEATURE_STATUSES),
  order: z.number().int().nonnegative(),
  createdAt: isoDate,
  updatedAt: isoDate,
  ...shelfFields,
})
export type Feature = z.infer<typeof featureSchema>

/** Third level: a product-backlog Component (componente) of a Feature. */
export const componentSchema = z.object({
  id: z.string(),
  featureId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  /**
   * Explicit workflow state. Defaulted on parse so v0.3 media (written
   * before components had a status) loads as `proposed` without a version
   * bump — the domain parses every record on open and keeps the parsed value.
   */
  status: z.enum(COMPONENT_STATUSES).default('proposed'),
  /**
   * Spiral phase (v0.12). Optional on input so pre-v0.12 media loads; the
   * transform below derives it — `done` components land on `validation`,
   * everything else starts at `requirements` (no version bump).
   */
  phase: z.enum(COMPONENT_PHASES).optional(),
  /** Phase artifacts: markdown with an optional YAML frontmatter (R9). */
  requirements: z.string().optional(),
  requirementsReview: z.string().optional(),
  design: z.string().optional(),
  validation: z.string().optional(),
  /** Append-only trail of phase movements, retreats included. */
  phaseLog: z.array(z.object({
    from: z.enum(COMPONENT_PHASES),
    to: z.enum(COMPONENT_PHASES),
    at: isoDate,
  })).optional(),
  order: z.number().int().nonnegative(),
  createdAt: isoDate,
  updatedAt: isoDate,
  ...shelfFields,
}).transform(({ phase, phaseLog, ...rest }) => ({
  ...rest,
  phase: phase ?? (rest.status === 'done' ? 'validation' : 'requirements'),
  phaseLog: phaseLog ?? [],
}))
export type Component = z.infer<typeof componentSchema>

/** Leaf level: a Task of a Component; the unit selected into sprints. */
export const taskSchema = z.object({
  id: z.string(),
  componentId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  /**
   * Task kind (v0.16, comp-45). Optional on input so pre-v0.16 media loads;
   * the transform below derives it from a `[test]`/`[code]` title prefix
   * (and strips the prefix — the View renders it back). No version bump.
   */
  kind: z.enum(TASK_KINDS).optional(),
  /** Story points (or any relative estimation unit the team uses). */
  estimate: z.number().nonnegative().optional(),
  status: z.enum(TASK_STATUSES),
  /**
   * When the task last entered `done` (the board move stamps it and clears
   * it on the way out; leaving the sprint clears it too). Optional: pre-v0.6
   * media and unfinished tasks carry none. Feeds the burndown chart.
   */
  doneAt: isoDate.optional(),
  /** Present while the task is selected into a sprint (its sprint backlog). */
  sprintId: z.string().optional(),
  order: z.number().int().nonnegative(),
  createdAt: isoDate,
  updatedAt: isoDate,
  ...shelfFields,
}).transform(({ kind, title, ...rest }) => {
  // Canonical media carries `kind`; a legacy record derives it from the title
  // prefix through the same total function the service uses (idempotent: the
  // second parse finds `kind` and keeps the title as is).
  if (kind !== undefined) return { ...rest, title, kind }
  const split = splitKindPrefix(title)
  return { ...rest, title: split.title, kind: split.kind }
})
export type Task = z.infer<typeof taskSchema>

/**
 * Per-column WIP limits of one sprint's task board (soft, Azure-style: the
 * GUI warns when a column exceeds its limit; nothing is blocked). Absent
 * columns carry no limit.
 */
export const wipLimitsSchema = z.object({
  todo: z.number().int().positive().optional(),
  in_progress: z.number().int().positive().optional(),
  review: z.number().int().positive().optional(),
  done: z.number().int().positive().optional(),
})
export type WipLimits = z.infer<typeof wipLimitsSchema>

/** A Sprint: a time window whose backlog is the set of tasks carrying its id. */
export const sprintSchema = z.object({
  id: z.string(),
  /** Sequential sprint number, for humans ("Sprint 7"). */
  number: z.number().int().positive(),
  goal: z.string().min(1),
  /**
   * Legacy single release link (pre-v0.11 media). Folded into `releaseIds`
   * by the transform below, so old boards load without a version bump — the
   * domain parses every record on open and keeps the parsed value.
   */
  releaseId: z.string().optional(),
  /** Releases this sprint advances (visibility only; many since v0.11). */
  releaseIds: z.array(z.string()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(SPRINT_STATUSES),
  /** Optional per-column WIP limits of this sprint's board. */
  wipLimits: wipLimitsSchema.optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
}).transform(({ releaseId, releaseIds, ...rest }) => ({
  ...rest,
  // Canonical form: always the array; a legacy single link becomes [link].
  releaseIds: releaseIds ?? (releaseId === undefined ? [] : [releaseId]),
}))
export type Sprint = z.infer<typeof sprintSchema>

/** One recorded ceremony. Append-only: records are never edited or deleted. */
export const ceremonySchema = z.object({
  id: z.string(),
  type: z.enum(CEREMONY_TYPES),
  sprintId: z.string(),
  /** When the ceremony happened (ISO-8601). */
  at: isoDate,
  /** Who recorded it (free-form: person or agent name). */
  author: z.string().optional(),
  /**
   * Structured notes. For retrospectives use categories `went-well`,
   * `to-improve` and `action-item`; other ceremonies use free categories
   * (e.g. standup: `progress`, `impediment`, `next`).
   */
  notes: z.array(z.object({
    category: z.string().min(1),
    text: z.string().min(1),
  })),
})
export type Ceremony = z.infer<typeof ceremonySchema>

/**
 * The board's suite budget as persisted (comp-50 R2): the ceiling the
 * validation contract compares `budget_seconds` against, when it was set,
 * and the reason when it stands above the domain default.
 */
export const suiteBudgetRecordSchema = z.object({
  seconds: z.number().gt(0),
  setAt: z.string(),
  reason: z.string().optional(),
})
export type SuiteBudgetRecord = z.infer<typeof suiteBudgetRecordSchema>

/**
 * The board's global value: monotonic id counters, one per record kind
 * (short readable ids: rel-1, task-42...), plus the optional suite budget.
 * `suiteBudget` is `.optional()` and never nullable on purpose — legacy
 * media without the key parse as-is, no version bump.
 */
export const globalSchema = z.object({
  release: z.number().int().nonnegative(),
  feature: z.number().int().nonnegative(),
  component: z.number().int().nonnegative(),
  task: z.number().int().nonnegative(),
  sprint: z.number().int().nonnegative(),
  ceremony: z.number().int().nonnegative(),
  suiteBudget: suiteBudgetRecordSchema.optional(),
})
export type BoardGlobal = z.infer<typeof globalSchema>

/** The id-counter keys of the global (the record kinds). */
export type CounterKind = 'release' | 'feature' | 'component' | 'task' | 'sprint' | 'ceremony'

/** The initial global value (before any record exists; default budget). */
export const INITIAL_GLOBAL: BoardGlobal = {
  release: 0, feature: 0, component: 0, task: 0, sprint: 0, ceremony: 0,
}

/**
 * Build one SCRUM domain spec under a given storage name. Since v0.5 every
 * workspace gets its own domain (one JSON medium per board), so the spec is
 * a factory parameterized by the board name — see `boardNameOf` in
 * `boards.ts`. Version bumps reject older media at open (storage-domain
 * contract), so structural schema changes must increment `version`.
 * @param name - the storage-domain name (e.g. `scrum_ws_1a2b3c4d5e6f`).
 * @returns the domain spec for `ctx.storageDomain.open`.
 */
export function scrumDomainSpec(name: string) {
  return defineDomain({
    name,
    version: 1,
    global: { schema: globalSchema, initial: INITIAL_GLOBAL },
    tables: {
      releases: domainTable<string, Release>(releaseSchema),
      features: domainTable<string, Feature>(featureSchema),
      components: domainTable<string, Component>(componentSchema),
      tasks: domainTable<string, Task>(taskSchema),
      sprints: domainTable<string, Sprint>(sprintSchema),
      ceremonies: domainTable<string, Ceremony>(ceremonySchema),
    },
  })
}

/** The opened-domain type of {@link scrumDomainSpec}. */
export type ScrumDomainSpec = ReturnType<typeof scrumDomainSpec>
