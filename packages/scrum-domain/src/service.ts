/**
 * The `ctx.scrum` service: typed operations over the SCRUM domain with the
 * process rules enforced in one place — parents must exist, at most one
 * active sprint, ending a sprint returns unfinished tasks to the backlog,
 * board moves only inside the active sprint, ceremonies are append-only.
 * Every consumer (model tools, human commands, the web board API) calls
 * these methods; none touches the storage domain directly.
 * @module @scrum-harness/domain/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Domain, TableKeyOf, TableValueOf } from '@deepseek-ai/dsh-storage-domain'
import {
  BOARD_COLUMNS,
  INITIAL_COUNTERS,
  scrumDomainSpec,
} from './spec.ts'
import type {
  Ceremony,
  Component,
  Counters,
  Feature,
  Release,
  ScrumDomainSpec,
  Sprint,
  Task,
} from './spec.ts'

/** Stable machine-routable error for a rejected SCRUM operation. */
export class ScrumError extends Error {
  /**
   * @param code - stable kebab-case classification (e.g. `not-found`,
   * `sprint-already-active`, `task-not-in-active-sprint`).
   * @param message - human-readable explanation.
   */
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'ScrumError'
  }
}

/** Input to {@link ScrumService.createRelease}. */
export interface CreateReleaseInput {
  name: string
  description?: string
  targetDate?: string
}

/** Input to {@link ScrumService.createFeature}. */
export interface CreateFeatureInput {
  releaseId: string
  title: string
  description?: string
}

/** Input to {@link ScrumService.createComponent}. */
export interface CreateComponentInput {
  featureId: string
  title: string
  description?: string
}

/** Input to {@link ScrumService.createTask}. */
export interface CreateTaskInput {
  componentId: string
  title: string
  description?: string
  estimate?: number
}

/** Editable fields of any node, applied by {@link ScrumService.updateItem}. */
export interface UpdateItemInput {
  title?: string
  description?: string
  estimate?: number
  targetDate?: string
  status?: string
  goal?: string
  /** Sprints only: link to a release; the empty string removes the link. */
  releaseId?: string
}

/** Input to {@link ScrumService.planSprint}. */
export interface PlanSprintInput {
  goal: string
  startDate?: string
  endDate?: string
  /** Tasks selected into the sprint backlog (each must exist and be in `backlog`). */
  taskIds?: string[]
  /** Optional Release this sprint advances (must exist). */
  releaseId?: string
}

/** Input to {@link ScrumService.recordCeremony}. */
export interface RecordCeremonyInput {
  type: Ceremony['type']
  /** Defaults to the active sprint when omitted. */
  sprintId?: string
  author?: string
  notes: { category: string; text: string }[]
}

/** The whole hierarchy as nested data, for tools and the web board. */
export interface ScrumTree {
  releases: (Release & {
    features: (Feature & {
      components: (Component & { tasks: Task[] })[]
    })[]
  })[]
}

/** Sprint progress summary (simple burndown numbers). */
export interface SprintStatus {
  sprint: Sprint
  tasks: Task[]
  totals: { tasks: number; done: number; points: number; pointsDone: number }
  /** Whole days until `endDate`, when the sprint declares one. */
  daysRemaining?: number
}

/**
 * The SCRUM service. Opens the `scrum` storage domain on init and serves
 * synchronous reads from its in-memory state; writes await durability on the
 * domain's write chain. Registered as `ctx.scrum`.
 */
export class ScrumService extends Service {
  static inject = ['storageDomain']

  private domain!: Domain<ScrumDomainSpec>
  /** Serializes id allocation (global counter read-modify-write). */
  private idChain: Promise<unknown> = Promise.resolve()

  /**
   * @param ctx - owning Cordis context.
   */
  constructor(ctx: Context) {
    super(ctx, 'scrum')
  }

  /** Opens the domain; the effect disposer closes it with the plugin. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(scrumDomainSpec)
    this.domain = domain
    this.ctx.effect(() => () => domain.close(), 'scrum.domainClose')
  }

  /**
   * Allocate the next short id for one record kind (`rel-1`, `task-42`...).
   * @param kind - counter key.
   * @param prefix - id prefix.
   * @returns the fresh unique id.
   */
  private async nextId(kind: keyof Counters, prefix: string): Promise<string> {
    const allocation = this.idChain.then(async () => {
      const current = this.domain.global.get() ?? INITIAL_COUNTERS
      const next = { ...current, [kind]: current[kind] + 1 }
      await this.domain.global.set(next)
      return `${prefix}-${next[kind]}`
    })
    this.idChain = allocation.catch(() => undefined)
    return allocation
  }

  /** @returns the current ISO timestamp. */
  private now(): string {
    return new Date().toISOString()
  }

  // ── creation ──────────────────────────────────────────────────────────────

  /**
   * Create a Release.
   * @param input - name and optional description/target date.
   * @returns the stored release.
   */
  async createRelease(input: CreateReleaseInput): Promise<Release> {
    const id = await this.nextId('release', 'rel')
    const now = this.now()
    const release: Release = {
      id,
      name: input.name.trim(),
      ...input.description === undefined ? {} : { description: input.description },
      ...input.targetDate === undefined ? {} : { targetDate: input.targetDate },
      status: 'planned',
      order: this.domain.table('releases').size,
      createdAt: now,
      updatedAt: now,
    }
    if (release.name.length === 0) throw new ScrumError('invalid-input', 'release name must be non-empty')
    await this.domain.table('releases').put(id, release)
    return release
  }

  /**
   * Create a Feature under an existing Release.
   * @param input - parent release id, title, optional description.
   * @returns the stored feature.
   */
  async createFeature(input: CreateFeatureInput): Promise<Feature> {
    this.mustGet('releases', input.releaseId)
    const id = await this.nextId('feature', 'feat')
    const now = this.now()
    const feature: Feature = {
      id,
      releaseId: input.releaseId,
      title: this.requireTitle(input.title),
      ...input.description === undefined ? {} : { description: input.description },
      status: 'proposed',
      order: this.domain.table('features').size,
      createdAt: now,
      updatedAt: now,
    }
    await this.domain.table('features').put(id, feature)
    return feature
  }

  /**
   * Create a Component (product-backlog entry) under an existing Feature.
   * @param input - parent feature id, title, optional description.
   * @returns the stored component.
   */
  async createComponent(input: CreateComponentInput): Promise<Component> {
    this.mustGet('features', input.featureId)
    const id = await this.nextId('component', 'comp')
    const now = this.now()
    const component: Component = {
      id,
      featureId: input.featureId,
      title: this.requireTitle(input.title),
      ...input.description === undefined ? {} : { description: input.description },
      order: this.domain.table('components').size,
      createdAt: now,
      updatedAt: now,
    }
    await this.domain.table('components').put(id, component)
    return component
  }

  /**
   * Create a Task under an existing Component. Tasks start in `backlog`.
   * @param input - parent component id, title, optional description/estimate.
   * @returns the stored task.
   */
  async createTask(input: CreateTaskInput): Promise<Task> {
    this.mustGet('components', input.componentId)
    const id = await this.nextId('task', 'task')
    const now = this.now()
    const task: Task = {
      id,
      componentId: input.componentId,
      title: this.requireTitle(input.title),
      ...input.description === undefined ? {} : { description: input.description },
      ...input.estimate === undefined ? {} : { estimate: input.estimate },
      status: 'backlog',
      order: this.domain.table('tasks').size,
      createdAt: now,
      updatedAt: now,
    }
    await this.domain.table('tasks').put(id, task)
    return task
  }

  // ── reading ───────────────────────────────────────────────────────────────

  /** @returns the whole hierarchy as nested data, orders ascending. */
  tree(): ScrumTree {
    const byOrder = <T extends { order: number }>(a: T, b: T): number => a.order - b.order
    const features = [...this.domain.table('features').entries()].map(([, f]) => f)
    const components = [...this.domain.table('components').entries()].map(([, c]) => c)
    const tasks = [...this.domain.table('tasks').entries()].map(([, t]) => t)
    return {
      releases: [...this.domain.table('releases').entries()]
        .map(([, release]) => release)
        .sort(byOrder)
        .map(release => ({
          ...release,
          features: features
            .filter(f => f.releaseId === release.id)
            .sort(byOrder)
            .map(feature => ({
              ...feature,
              components: components
                .filter(c => c.featureId === feature.id)
                .sort(byOrder)
                .map(component => ({
                  ...component,
                  tasks: tasks.filter(t => t.componentId === component.id).sort(byOrder),
                })),
            })),
        })),
    }
  }

  /** @returns every sprint, newest number first. */
  sprints(): Sprint[] {
    return [...this.domain.table('sprints').entries()]
      .map(([, sprint]) => sprint)
      .sort((a, b) => b.number - a.number)
  }

  /** @returns the single active sprint, or undefined. */
  activeSprint(): Sprint | undefined {
    return this.sprints().find(s => s.status === 'active')
  }

  /**
   * Sprints linked to one release, newest number first.
   * @param releaseId - the release id.
   * @returns the linked sprints.
   */
  sprintsOfRelease(releaseId: string): Sprint[] {
    return this.sprints().filter(s => s.releaseId === releaseId)
  }

  /** @returns release-name lookup (id → name) for link rendering. */
  releaseNames(): Map<string, string> {
    return new Map([...this.domain.table('releases').entries()].map(([id, release]) => [id, release.name]))
  }

  /**
   * List ceremonies, optionally for one sprint, oldest first.
   * @param sprintId - restrict to one sprint when present.
   * @returns the matching ceremony records.
   */
  ceremonies(sprintId?: string): Ceremony[] {
    return [...this.domain.table('ceremonies').entries()]
      .map(([, ceremony]) => ceremony)
      .filter(c => sprintId === undefined || c.sprintId === sprintId)
      .sort((a, b) => a.at.localeCompare(b.at))
  }

  /**
   * Sprint progress summary.
   * @param sprintId - defaults to the active sprint.
   * @returns sprint, its tasks, and burndown totals.
   */
  sprintStatus(sprintId?: string): SprintStatus {
    const sprint = sprintId === undefined
      ? this.activeSprint()
      : this.domain.table('sprints').get(sprintId)
    if (sprint === undefined) {
      throw new ScrumError('not-found', sprintId === undefined
        ? 'no active sprint'
        : `sprint '${sprintId}' does not exist`)
    }
    const tasks = [...this.domain.table('tasks').entries()]
      .map(([, t]) => t)
      .filter(t => t.sprintId === sprint.id)
      .sort((a, b) => a.order - b.order)
    const done = tasks.filter(t => t.status === 'done')
    const points = (list: Task[]): number => list.reduce((sum, t) => sum + (t.estimate ?? 0), 0)
    const status: SprintStatus = {
      sprint,
      tasks,
      totals: { tasks: tasks.length, done: done.length, points: points(tasks), pointsDone: points(done) },
    }
    if (sprint.endDate !== undefined) {
      const remaining = Math.ceil((Date.parse(sprint.endDate) - Date.now()) / 86_400_000)
      if (Number.isFinite(remaining)) status.daysRemaining = Math.max(0, remaining)
    }
    return status
  }

  // ── editing ───────────────────────────────────────────────────────────────

  /**
   * Update editable fields of any node; the table is derived from the id
   * prefix (`rel-`, `feat-`, `comp-`, `task-`, `spr-`).
   * @param id - node id.
   * @param patch - fields to change.
   * @returns the updated record.
   */
  async updateItem(id: string, patch: UpdateItemInput): Promise<Release | Feature | Component | Task | Sprint> {
    const stamp = { updatedAt: this.now() }
    if (id.startsWith('rel-')) {
      this.mustGet('releases', id)
      return this.domain.table('releases').update(id, current => ({
        ...current,
        ...patch.title === undefined ? {} : { name: patch.title },
        ...patch.description === undefined ? {} : { description: patch.description },
        ...patch.targetDate === undefined ? {} : { targetDate: patch.targetDate },
        ...patch.status === undefined ? {} : { status: this.narrowStatus(patch.status, ['planned', 'active', 'released'], id) },
        ...stamp,
      }))
    }
    if (id.startsWith('feat-')) {
      this.mustGet('features', id)
      return this.domain.table('features').update(id, current => ({
        ...current,
        ...patch.title === undefined ? {} : { title: this.requireTitle(patch.title) },
        ...patch.description === undefined ? {} : { description: patch.description },
        ...patch.status === undefined ? {} : { status: this.narrowStatus(patch.status, ['proposed', 'committed', 'done'], id) },
        ...stamp,
      }))
    }
    if (id.startsWith('comp-')) {
      this.mustGet('components', id)
      return this.domain.table('components').update(id, current => ({
        ...current,
        ...patch.title === undefined ? {} : { title: this.requireTitle(patch.title) },
        ...patch.description === undefined ? {} : { description: patch.description },
        ...stamp,
      }))
    }
    if (id.startsWith('task-')) {
      this.mustGet('tasks', id)
      return this.domain.table('tasks').update(id, current => ({
        ...current,
        ...patch.title === undefined ? {} : { title: this.requireTitle(patch.title) },
        ...patch.description === undefined ? {} : { description: patch.description },
        ...patch.estimate === undefined ? {} : { estimate: patch.estimate },
        ...stamp,
      }))
    }
    if (id.startsWith('spr-')) {
      this.mustGet('sprints', id)
      if (patch.releaseId !== undefined && patch.releaseId !== '') this.mustGet('releases', patch.releaseId)
      return this.domain.table('sprints').update(id, (current) => {
        const next: Sprint = {
          ...current,
          ...patch.goal === undefined ? {} : { goal: this.requireTitle(patch.goal) },
          ...patch.releaseId === undefined || patch.releaseId === '' ? {} : { releaseId: patch.releaseId },
          ...stamp,
        }
        if (patch.releaseId === '') delete next.releaseId
        return next
      })
    }
    throw new ScrumError('invalid-id', `id '${id}' carries no known prefix (rel-, feat-, comp-, task-, spr-)`)
  }

  /**
   * Delete one node. A parent with children is refused unless `cascade`;
   * cascade removes the whole subtree. Sprints and ceremonies are never
   * deleted (history), and a task inside a sprint must leave it first.
   * @param id - node id (release/feature/component/task).
   * @param cascade - also delete every descendant.
   * @returns ids actually deleted, parents first.
   */
  async deleteItem(id: string, cascade = false): Promise<string[]> {
    if (id.startsWith('task-')) {
      const task = this.mustGet('tasks', id)
      if (task.sprintId !== undefined && this.domain.table('sprints').get(task.sprintId)?.status === 'active') {
        throw new ScrumError('task-in-active-sprint', `task '${id}' is in the active sprint; move it out before deleting`)
      }
      await this.domain.table('tasks').delete(id)
      return [id]
    }
    const plan = this.deletionPlan(id)
    if (!cascade && plan.length > 1) {
      throw new ScrumError('has-children', `'${id}' has ${plan.length - 1} descendant(s); pass cascade to delete the subtree`)
    }
    for (const victim of [...plan].reverse()) {
      if (victim.startsWith('rel-')) await this.domain.table('releases').delete(victim)
      else if (victim.startsWith('feat-')) await this.domain.table('features').delete(victim)
      else if (victim.startsWith('comp-')) await this.domain.table('components').delete(victim)
      else await this.domain.table('tasks').delete(victim)
    }
    if (id.startsWith('rel-')) {
      // Sprints are history and survive their release: they only lose the link.
      for (const [sprintId, sprint] of this.domain.table('sprints').entries()) {
        if (sprint.releaseId !== id) continue
        await this.domain.table('sprints').update(sprintId, (current) => {
          const next: Sprint = { ...current, updatedAt: this.now() }
          delete next.releaseId
          return next
        })
      }
    }
    return plan
  }

  /** @returns the subtree ids rooted at `id` (parents first); validates existence. */
  private deletionPlan(id: string): string[] {
    if (id.startsWith('rel-')) {
      this.mustGet('releases', id)
      const features = [...this.domain.table('features').entries()].filter(([, f]) => f.releaseId === id)
      return [id, ...features.flatMap(([featureId]) => this.deletionPlan(featureId))]
    }
    if (id.startsWith('feat-')) {
      this.mustGet('features', id)
      const components = [...this.domain.table('components').entries()].filter(([, c]) => c.featureId === id)
      return [id, ...components.flatMap(([componentId]) => this.deletionPlan(componentId))]
    }
    if (id.startsWith('comp-')) {
      this.mustGet('components', id)
      const tasks = [...this.domain.table('tasks').entries()].filter(([, t]) => t.componentId === id)
      for (const [, task] of tasks) {
        if (task.sprintId !== undefined && this.domain.table('sprints').get(task.sprintId)?.status === 'active') {
          throw new ScrumError('task-in-active-sprint', `task '${task.id}' is in the active sprint; end the sprint or move it out first`)
        }
      }
      return [id, ...tasks.map(([taskId]) => taskId)]
    }
    throw new ScrumError('invalid-id', `cannot delete '${id}': unknown or non-deletable id prefix`)
  }

  // ── sprints ───────────────────────────────────────────────────────────────

  /**
   * Sprint Planning: create a `planned` sprint and select tasks into it.
   * @param input - goal, optional window, optional initial task selection.
   * @returns the stored sprint.
   */
  async planSprint(input: PlanSprintInput): Promise<Sprint> {
    if (input.releaseId !== undefined) this.mustGet('releases', input.releaseId)
    for (const taskId of input.taskIds ?? []) {
      const task = this.mustGet('tasks', taskId)
      if (task.sprintId !== undefined) {
        throw new ScrumError('task-already-in-sprint', `task '${taskId}' already belongs to sprint '${task.sprintId}'`)
      }
    }
    const id = await this.nextId('sprint', 'spr')
    const counters = this.domain.global.get() ?? INITIAL_COUNTERS
    const now = this.now()
    const sprint: Sprint = {
      id,
      number: counters.sprint,
      goal: this.requireTitle(input.goal),
      ...input.releaseId === undefined ? {} : { releaseId: input.releaseId },
      ...input.startDate === undefined ? {} : { startDate: input.startDate },
      ...input.endDate === undefined ? {} : { endDate: input.endDate },
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    }
    await this.domain.table('sprints').put(id, sprint)
    for (const taskId of input.taskIds ?? []) {
      await this.domain.table('tasks').update(taskId, current => ({
        ...current, sprintId: id, status: 'todo', updatedAt: this.now(),
      }))
    }
    return sprint
  }

  /**
   * Add or remove one backlog task to/from a non-completed sprint.
   * @param sprintId - target sprint.
   * @param taskId - task to move.
   * @param direction - `add` selects into the sprint, `remove` returns to backlog.
   * @returns the updated task.
   */
  async assignTask(sprintId: string, taskId: string, direction: 'add' | 'remove'): Promise<Task> {
    const sprint = this.mustGet('sprints', sprintId)
    if (sprint.status === 'completed') {
      throw new ScrumError('sprint-completed', `sprint '${sprintId}' is completed`)
    }
    const task = this.mustGet('tasks', taskId)
    if (direction === 'add') {
      if (task.sprintId !== undefined) {
        throw new ScrumError('task-already-in-sprint', `task '${taskId}' already belongs to sprint '${task.sprintId}'`)
      }
      return this.domain.table('tasks').update(taskId, current => ({
        ...current, sprintId, status: 'todo', updatedAt: this.now(),
      }))
    }
    if (task.sprintId !== sprintId) {
      throw new ScrumError('task-not-in-sprint', `task '${taskId}' is not in sprint '${sprintId}'`)
    }
    return this.domain.table('tasks').update(taskId, (current) => {
      const next: Task = { ...current, status: 'backlog', updatedAt: this.now() }
      delete next.sprintId
      return next
    })
  }

  /**
   * Start a planned sprint. At most one sprint is active at a time.
   * @param sprintId - the sprint to activate.
   * @returns the updated sprint.
   */
  async startSprint(sprintId: string): Promise<Sprint> {
    const sprint = this.mustGet('sprints', sprintId)
    if (sprint.status !== 'planned') {
      throw new ScrumError('invalid-transition', `sprint '${sprintId}' is ${sprint.status}, only a planned sprint can start`)
    }
    const active = this.activeSprint()
    if (active !== undefined) {
      throw new ScrumError('sprint-already-active', `sprint '${active.id}' is already active; end it first`)
    }
    return this.domain.table('sprints').update(sprintId, current => ({
      ...current,
      status: 'active',
      startDate: current.startDate ?? this.now(),
      updatedAt: this.now(),
    }))
  }

  /**
   * End the active sprint: tasks not `done` return to the backlog (sprint id
   * cleared); `done` tasks keep the sprint id as history.
   * @param sprintId - defaults to the active sprint.
   * @returns the completed sprint and the ids returned to backlog.
   */
  async endSprint(sprintId?: string): Promise<{ sprint: Sprint; returnedToBacklog: string[] }> {
    const target = sprintId === undefined ? this.activeSprint() : this.mustGet('sprints', sprintId)
    if (target === undefined) throw new ScrumError('not-found', 'no active sprint to end')
    if (target.status !== 'active') {
      throw new ScrumError('invalid-transition', `sprint '${target.id}' is ${target.status}, only an active sprint can end`)
    }
    const returned: string[] = []
    for (const [taskId, task] of this.domain.table('tasks').entries()) {
      if (task.sprintId !== target.id || task.status === 'done') continue
      await this.domain.table('tasks').update(taskId, (current) => {
        const next: Task = { ...current, status: 'backlog', updatedAt: this.now() }
        delete next.sprintId
        return next
      })
      returned.push(taskId)
    }
    const sprint = await this.domain.table('sprints').update(target.id, current => ({
      ...current,
      status: 'completed',
      endDate: current.endDate ?? this.now(),
      updatedAt: this.now(),
    }))
    return { sprint, returnedToBacklog: returned }
  }

  // ── board ─────────────────────────────────────────────────────────────────

  /**
   * Move a task across the Kanban board of the active sprint.
   * @param taskId - the task; must belong to the active sprint.
   * @param column - target column (`todo`, `in_progress`, `review`, `done`).
   * @returns the updated task.
   */
  async moveTask(taskId: string, column: string): Promise<Task> {
    if (!(BOARD_COLUMNS as readonly string[]).includes(column)) {
      throw new ScrumError('invalid-column', `'${column}' is not a board column (${BOARD_COLUMNS.join(', ')})`)
    }
    const task = this.mustGet('tasks', taskId)
    const active = this.activeSprint()
    if (active === undefined || task.sprintId !== active.id) {
      throw new ScrumError('task-not-in-active-sprint', `task '${taskId}' is not in the active sprint`)
    }
    return this.domain.table('tasks').update(taskId, current => ({
      ...current, status: column as Task['status'], updatedAt: this.now(),
    }))
  }

  // ── ceremonies ────────────────────────────────────────────────────────────

  /**
   * Record one ceremony (append-only).
   * @param input - type, notes, optional sprint (defaults to the active one).
   * @returns the stored ceremony record.
   */
  async recordCeremony(input: RecordCeremonyInput): Promise<Ceremony> {
    const sprint = input.sprintId === undefined
      ? this.activeSprint()
      : this.mustGet('sprints', input.sprintId)
    if (sprint === undefined) {
      throw new ScrumError('not-found', 'no active sprint; pass an explicit sprintId')
    }
    if (input.notes.length === 0) {
      throw new ScrumError('invalid-input', 'a ceremony needs at least one note')
    }
    const id = await this.nextId('ceremony', 'cer')
    const ceremony: Ceremony = {
      id,
      type: input.type,
      sprintId: sprint.id,
      at: this.now(),
      ...input.author === undefined ? {} : { author: input.author },
      notes: input.notes,
    }
    await this.domain.table('ceremonies').put(id, ceremony)
    return ceremony
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /** @returns the record or throws `not-found`. */
  private mustGet<N extends keyof ScrumDomainSpec['tables'] & string>(
    table: N, id: string,
  ): TableValueOf<ScrumDomainSpec, N> {
    const record = this.domain.table(table).get(id as TableKeyOf<ScrumDomainSpec, N>)
    if (record === undefined) throw new ScrumError('not-found', `'${id}' does not exist in ${table}`)
    return record
  }

  /** @returns the trimmed title or throws `invalid-input`. */
  private requireTitle(title: string): string {
    const trimmed = title.trim()
    if (trimmed.length === 0) throw new ScrumError('invalid-input', 'title must be non-empty')
    return trimmed
  }

  /** @returns `value` narrowed to the allowed status set or throws. */
  private narrowStatus<S extends string>(value: string, allowed: readonly S[], id: string): S {
    if (!(allowed as readonly string[]).includes(value)) {
      throw new ScrumError('invalid-status', `'${value}' is not a valid status for '${id}' (${allowed.join(', ')})`)
    }
    return value as S
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The SCRUM domain service (hierarchy, sprints, board, ceremonies). */
    scrum: ScrumService
  }
}
