/**
 * Same-origin fetch client of the /scrum-api routes plus the wire types the
 * panel renders. Types re-state the wire JSON (not the host classes): the
 * browser half owns no host imports.
 * @module @scrum-harness/ui/client/api
 */

/** One task on the wire. */
export interface WireTask {
  id: string
  componentId: string
  title: string
  description?: string
  estimate?: number
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'
  sprintId?: string
  order: number
}

/** One component (product-backlog entry) with its tasks. */
export interface WireComponent {
  id: string
  featureId: string
  title: string
  description?: string
  tasks: WireTask[]
}

/** One feature with its components. */
export interface WireFeature {
  id: string
  releaseId: string
  title: string
  description?: string
  status: 'proposed' | 'committed' | 'done'
  components: WireComponent[]
}

/** One release with its features. */
export interface WireRelease {
  id: string
  name: string
  description?: string
  targetDate?: string
  status: 'planned' | 'active' | 'released'
  features: WireFeature[]
}

/** One sprint. */
export interface WireSprint {
  id: string
  number: number
  goal: string
  /** Release this sprint advances, when linked. */
  releaseId?: string
  startDate?: string
  endDate?: string
  status: 'planned' | 'active' | 'completed'
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

/** The whole board state served by GET /scrum-api/state. */
export interface ScrumState {
  tree: { releases: WireRelease[] }
  sprints: WireSprint[]
  ceremonies: WireCeremony[]
  activeSprintId: string | null
}

/** Kanban columns, in board order. */
export const COLUMNS = ['todo', 'in_progress', 'review', 'done'] as const

/** Human labels of the Kanban columns. */
export const COLUMN_LABELS: Record<(typeof COLUMNS)[number], string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  review: 'Revisão',
  done: 'Concluído',
}

/**
 * Read the whole state.
 * @returns the current board state.
 */
export async function fetchState(): Promise<ScrumState> {
  const response = await fetch('/scrum-api/state')
  const body = await response.json() as { ok: boolean; state?: ScrumState; message?: string }
  if (!body.ok || body.state === undefined) throw new Error(body.message ?? `GET state failed (${response.status})`)
  return body.state
}

/**
 * Run one mutation; the response carries the fresh state.
 * @param action - the action envelope ({ action, ...payload }).
 * @returns the state after the mutation.
 */
export async function act(action: Record<string, unknown>): Promise<ScrumState> {
  const response = await fetch('/scrum-api/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(action),
  })
  const body = await response.json() as { ok: boolean; state?: ScrumState; code?: string; message?: string }
  if (!body.ok || body.state === undefined) {
    throw new Error(body.message ?? body.code ?? `action failed (${response.status})`)
  }
  return body.state
}
