/**
 * SCRUM domain declaration: the zod record schemas and the `defineDomain` spec
 * for the storage-domain backend. Hierarchy: Release > Feature > Component
 * (product backlog) > Task, plus Sprints as time windows selecting Tasks and
 * append-only Ceremony records (planning / standup / review / retrospective).
 * @module @scrum-harness/domain/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'

/** Lifecycle of a Release. */
export const RELEASE_STATUSES = ['planned', 'active', 'released'] as const
/** Lifecycle of a Feature. */
export const FEATURE_STATUSES = ['proposed', 'committed', 'done'] as const
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
})
export type Feature = z.infer<typeof featureSchema>

/** Third level: a product-backlog Component (componente) of a Feature. */
export const componentSchema = z.object({
  id: z.string(),
  featureId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  order: z.number().int().nonnegative(),
  createdAt: isoDate,
  updatedAt: isoDate,
})
export type Component = z.infer<typeof componentSchema>

/** Leaf level: a Task of a Component; the unit selected into sprints. */
export const taskSchema = z.object({
  id: z.string(),
  componentId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  /** Story points (or any relative estimation unit the team uses). */
  estimate: z.number().nonnegative().optional(),
  status: z.enum(TASK_STATUSES),
  /** Present while the task is selected into a sprint (its sprint backlog). */
  sprintId: z.string().optional(),
  order: z.number().int().nonnegative(),
  createdAt: isoDate,
  updatedAt: isoDate,
})
export type Task = z.infer<typeof taskSchema>

/** A Sprint: a time window whose backlog is the set of tasks carrying its id. */
export const sprintSchema = z.object({
  id: z.string(),
  /** Sequential sprint number, for humans ("Sprint 7"). */
  number: z.number().int().positive(),
  goal: z.string().min(1),
  /** Optional link to the Release this sprint advances (visibility only). */
  releaseId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(SPRINT_STATUSES),
  createdAt: isoDate,
  updatedAt: isoDate,
})
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

/** Monotonic id counters, one per record kind (short readable ids: rel-1, task-42...). */
export const countersSchema = z.object({
  release: z.number().int().nonnegative(),
  feature: z.number().int().nonnegative(),
  component: z.number().int().nonnegative(),
  task: z.number().int().nonnegative(),
  sprint: z.number().int().nonnegative(),
  ceremony: z.number().int().nonnegative(),
})
export type Counters = z.infer<typeof countersSchema>

/** The initial counters value (before any record exists). */
export const INITIAL_COUNTERS: Counters = {
  release: 0, feature: 0, component: 0, task: 0, sprint: 0, ceremony: 0,
}

/**
 * The SCRUM domain spec handed to `ctx.storageDomain.open`. Version bumps
 * reject older media at open (storage-domain contract), so structural schema
 * changes must increment `version`.
 */
export const scrumDomainSpec = defineDomain({
  name: 'scrum',
  version: 1,
  global: { schema: countersSchema, initial: INITIAL_COUNTERS },
  tables: {
    releases: domainTable<string, Release>(releaseSchema),
    features: domainTable<string, Feature>(featureSchema),
    components: domainTable<string, Component>(componentSchema),
    tasks: domainTable<string, Task>(taskSchema),
    sprints: domainTable<string, Sprint>(sprintSchema),
    ceremonies: domainTable<string, Ceremony>(ceremonySchema),
  },
})

/** The opened-domain type of {@link scrumDomainSpec}. */
export type ScrumDomainSpec = typeof scrumDomainSpec
