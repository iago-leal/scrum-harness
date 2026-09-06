/**
 * Same-origin fetch client of the /scrum-api routes plus the wire types the
 * panel renders. Types re-state the wire JSON (not the host classes): the
 * browser half owns no host imports.
 * @module @scrum-harness/ui/client/api
 */

/** Task kind (v0.16, comp-45): the domain's `test | code | other`. */
export type WireTaskKind = 'test' | 'code' | 'other'

/** One task on the wire. */
export interface WireTask {
  id: string
  componentId: string
  title: string
  description?: string
  estimate?: number
  /** Always present on the wire (the Model migrates legacy media on parse). */
  kind: WireTaskKind
  /** Legacy title over the limit (comp-53 R4); absent when it fits. */
  titleOverflow?: WireOverflow
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'
  /** When the task last entered done (burndown stamp, v0.6+). */
  doneAt?: string
  sprintId?: string
  order: number
}

/** One component (product-backlog entry) with its tasks. */
export interface WireComponent {
  id: string
  featureId: string
  title: string
  description?: string
  status: 'proposed' | 'in_progress' | 'done'
  /** Legacy title over the limit (comp-53 R4); absent when it fits. */
  titleOverflow?: WireOverflow
  /** Spiral phase (v0.12); always present on the wire. */
  phase: WirePhase
  /** Spiral artifacts: markdown with an optional YAML frontmatter. */
  requirements?: string
  requirementsReview?: string
  design?: string
  validation?: string
  /** Append-only trail of phase movements. */
  phaseLog: { from: WirePhase; to: WirePhase; at: string }[]
  /** Computed by the Model (comp-47): not done and the done gate satisfied. */
  readyForDone: boolean
  /**
   * Computed by the Model (comp-46): what blocks the next step of the spiral
   * (the phase gate, or the done gate in validation); `next: null` once done.
   * Typed only for now — the GUI renders it in the comp-43/44 sprint.
   */
  readiness: WirePhaseReadiness
  /** Computed by the Model (comp-49): the traceability matrix with its holes; the work item form renders it. */
  traces: WireTraceMatrix
  tasks: WireTask[]
}

/** One entry of the traceability matrix (comp-49 R1). */
export interface WireTraceEntry {
  req: string[]
  files: string[]
  tests: string[]
}

/** The Model's reading of a component's matrix (comp-49 R3): plain data, holes derived per requirement id. */
export interface WireTraceMatrix {
  /** `validation` = the as-built wins; `design` = the plan; null = no matrix. */
  source: 'design' | 'validation' | null
  entries: WireTraceEntry[]
  ids: string[]
  untraced: string[]
  unknown: string[]
  nocode: string[]
  unproven: string[]
  files: string[]
  tests: string[]
  issues: string[]
}

/** The spiral phases of a component (v0.12). */
export type WirePhase = 'requirements' | 'design' | 'tdd' | 'construction' | 'validation'

/** The Model's readiness verdict on the wire (comp-46). */
export interface WirePhaseReadiness {
  phase: WirePhase
  status: 'proposed' | 'in_progress' | 'done'
  next: WirePhase | 'done' | null
  ok: boolean
  reasons: string[]
}

/** One feature with its components. */
export interface WireFeature {
  id: string
  releaseId: string
  title: string
  description?: string
  status: 'proposed' | 'committed' | 'in_progress' | 'done'
  /** Legacy title over the limit (comp-53 R4); absent when it fits. */
  titleOverflow?: WireOverflow
  components: WireComponent[]
}

/** One release with its features. */
export interface WireRelease {
  id: string
  name: string
  description?: string
  targetDate?: string
  status: 'planned' | 'active' | 'released'
  /** Legacy name over the limit (comp-53 R4); absent when it fits. */
  titleOverflow?: WireOverflow
  features: WireFeature[]
}

/** One sprint. */
export interface WireSprint {
  id: string
  number: number
  goal: string
  /** Releases this sprint advances (possibly empty, v0.11+). */
  releaseIds: string[]
  startDate?: string
  endDate?: string
  status: 'planned' | 'active' | 'completed'
  /** Legacy goal over the limit (comp-53 R4); absent when it fits. */
  goalOverflow?: WireOverflow
  /** Per-column WIP limits of the task board (soft), when set. */
  wipLimits?: Partial<Record<'todo' | 'in_progress' | 'review' | 'done', number>>
}

/** One recorded ceremony. */
export interface WireCeremony {
  id: string
  type: 'planning' | 'standup' | 'review' | 'retrospective'
  sprintId: string
  at: string
  author?: string
  notes: { category: string; text: string }[]
}

/** One shelved (trashed or archived) item, flattened for listing. */
export interface WireShelfItem {
  id: string
  /** The LEVEL of the item (not the task kind — that is `taskKind`). */
  kind: 'release' | 'feature' | 'component' | 'task'
  /** Task rows only: the task kind (comp-45). */
  taskKind?: WireTaskKind
  title: string
  /** Parent id, absent for releases. */
  parentId?: string
  /** When it was shelved (ISO-8601). */
  at: string
  status?: string
  estimate?: number
}

/**
 * Per-sprint chart data. Unlike the live tree, it keeps counting archived
 * done tasks of historical sprints (the server sources it from sprintStatus).
 */
export interface WireSprintStats {
  sprintId: string
  totals: { tasks: number; done: number; points: number; pointsDone: number }
  tasks: { status: string; estimate?: number; doneAt?: string }[]
}

/** The whole board state served by GET /scrum-api/state. */
export interface ScrumState {
  tree: { releases: WireRelease[] }
  sprints: WireSprint[]
  ceremonies: WireCeremony[]
  activeSprintId: string | null
  /** Soft-deleted items, newest deletion first. */
  trash: WireShelfItem[]
  /** Archived (concluded) items, newest first. */
  archive: WireShelfItem[]
  /** Chart data per sprint (velocity, burndown). Absent on pre-v0.6 servers. */
  stats?: WireSprintStats[]
  /** The title ceilings (comp-53 R4), read from the Model. Absent on pre-v0.21 servers: no counter then. */
  limits?: WireTitleLimits
}

/** The two title ceilings (comp-53). */
export interface WireTitleLimits { title: number; goal: number }

/** Read-time mark of a stored title/goal over its limit (comp-53 R4): present only on legacy items that overflow. */
export interface WireOverflow { length: number; limit: number }

/** Kanban columns, in board order. */
export const COLUMNS = ['todo', 'in_progress', 'review', 'done'] as const

/** Human labels of the Kanban columns. */
export const COLUMN_LABELS: Record<(typeof COLUMNS)[number], string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  review: 'Revisão',
  done: 'Concluído',
}

/** Component workflow, in board-column order (Azure-style level board). */
export const COMPONENT_FLOW = ['proposed', 'in_progress', 'done'] as const

/** Feature workflow, in board-column order (Azure-style level board). */
export const FEATURE_FLOW = ['proposed', 'committed', 'in_progress', 'done'] as const

/**
 * Read the whole state of one workspace's board.
 * @param workspace - workspace path; null selects the global fallback board.
 * @returns the current board state.
 */
export async function fetchState(workspace: string | null): Promise<ScrumState> {
  const query = workspace === null ? '' : `?workspace=${encodeURIComponent(workspace)}`
  const response = await fetch(`/scrum-api/state${query}`)
  const body = await response.json() as { ok: boolean; state?: ScrumState; message?: string }
  if (!body.ok || body.state === undefined) throw new Error(body.message ?? `GET state failed (${response.status})`)
  return body.state
}

/**
 * Run one mutation on one workspace's board; the response carries the fresh
 * state of that board.
 * @param action - the action envelope ({ action, ...payload }).
 * @param workspace - workspace path; null selects the global fallback board.
 * @returns the state after the mutation.
 */
export async function act(action: Record<string, unknown>, workspace: string | null): Promise<ScrumState> {
  const response = await fetch('/scrum-api/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...action, ...workspace === null ? {} : { workspace } }),
  })
  const body = await response.json() as { ok: boolean; state?: ScrumState; code?: string; message?: string }
  if (!body.ok || body.state === undefined) {
    throw new Error(body.message ?? body.code ?? `action failed (${response.status})`)
  }
  return body.state
}
