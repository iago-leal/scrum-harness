/**
 * The `ctx.scrum` service and the per-workspace `ScrumBoard` it manages.
 * Since v0.5 each workspace has its own board (own storage domain); the
 * service resolves `board(cwd)` lazily — canonical path → stable name →
 * open domain — with a global fallback board for sessions without a
 * workspace. The board owns the process rules in one place — parents must
 * exist, at most one active sprint, ending a sprint returns unfinished
 * tasks to the backlog, board moves only inside the active sprint,
 * ceremonies are append-only, deleting moves through the TRASH (restorable,
 * purgeable) and concluded work can rest in the ARCHIVE (hidden from the
 * main views, revivable). Every consumer (model tools, human commands, the
 * web board API) resolves a board and calls its methods; none touches the
 * storage domain directly.
 * @module @scrum-harness/domain/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Domain, TableKeyOf, TableValueOf } from '@deepseek-ai/dsh-storage-domain'
import { boardNameOf } from './boards.ts'
import { ScrumError } from './error.ts'
import { ReviewContract, SuiteBudget, TitleContract, ValidationContract } from './contracts.ts'
import type { ContractResult, Overflow, ReviewMeta, TitleKind, TitleLimits, ValidationResult } from './contracts.ts'
import { TraceContract, TraceMatrix, matchPath, normalizePath, pathIssue, traceGateFor } from './traces.ts'
import type { TraceField, TraceGate, TraceMatrixData } from './traces.ts'
import { TASK_KINDS, splitKindPrefix, taskNumber } from './kind.ts'
import type { TaskKind } from './kind.ts'
import {
  BOARD_COLUMNS,
  COMPONENT_PHASES,
  COMPONENT_STATUSES,
  FEATURE_STATUSES,
  INITIAL_GLOBAL,
  RELEASE_STATUSES,
  scrumDomainSpec,
} from './spec.ts'
import type {
  Ceremony,
  Component,
  BoardGlobal,
  ComponentPhase,
  CounterKind,
  Feature,
  Release,
  ScrumDomainSpec,
  Sprint,
  Task,
  WipLimits,
} from './spec.ts'

// ScrumError lives in error.ts (shared with the contracts); re-exported for importers.
export { ScrumError } from './error.ts'

/** The spiral artifact fields of a component (v0.12). */
const ARTIFACT_FIELDS = ['requirements', 'requirementsReview', 'design', 'validation'] as const

/** Whether an artifact counts as filled for a phase gate: whitespace-only does not. */
function filled(text: string | undefined): boolean {
  return text !== undefined && text.trim().length > 0
}

/**
 * What a reviewer needs to review one component's requirements (v0.13,
 * comp-48): produced by {@link ScrumBoard.reviewBrief} (Model), rendered by
 * `formatReviewBrief` (View), delivered by the tool (Controller).
 */
export interface ReviewBriefData {
  component: Component
  /** `ids` (comp-49 R2): the requirement ids the traceability matrix will key on. */
  requirements: { version: number; digest: string; status: string | undefined; body: string; ids: string[] }
  /** The previous review when one exists (typed meta when its frontmatter is valid). */
  previousReview?: { meta: ReviewMeta | null; body: string }
  /** The design artifact, only once the component is past requirements. */
  design?: string
  /** Non-trashed tasks under the component. */
  taskCount: number
  /** The board's suite budget ceiling in seconds (comp-50 R3), cited by the conventions. */
  suiteBudgetSeconds?: number
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
  /** A leading `[test]`/`[code]` sets the kind when `kind` is omitted; it never reaches the stored title. */
  title: string
  description?: string
  estimate?: number
  /** Task kind (v0.16): `test | code | other`; narrowed in the Model (`invalid-kind`). Default: inferred from the title, else `other`. */
  kind?: string
}

/** Editable fields of any node, applied by {@link ScrumBoard.updateItem}. */
export interface UpdateItemInput {
  title?: string
  description?: string
  estimate?: number
  /** Tasks only (v0.16): the kind; a title prefix that contradicts it is refused (`kind-conflict`). */
  kind?: string
  targetDate?: string
  status?: string
  goal?: string
  /**
   * Components only (v0.12): the spiral artifacts — markdown with an optional
   * YAML frontmatter. The empty string deletes the field.
   */
  requirements?: string
  requirementsReview?: string
  design?: string
  validation?: string
  /** Sprints only: link to ONE release (shortcut for `releaseIds: [id]`); the empty string removes every link. */
  releaseId?: string
  /** Sprints only: REPLACE the whole set of linked releases (empty array unlinks; wins over `releaseId`). */
  releaseIds?: string[]
  /**
   * Sprints only: REPLACE the per-column WIP limits of the board. Keys are
   * board columns; a value of 0 drops that column's limit; an empty object
   * removes them all.
   */
  wipLimits?: Record<string, number>
}

/** Input to {@link ScrumService.planSprint}. */
export interface PlanSprintInput {
  goal: string
  startDate?: string
  endDate?: string
  /** Tasks selected into the sprint backlog (each must exist and be in `backlog`). */
  taskIds?: string[]
  /** Optional single Release this sprint advances (shortcut for `releaseIds: [id]`). */
  releaseId?: string
  /** Optional Releases this sprint advances (each must exist; wins over `releaseId`). */
  releaseIds?: string[]
}

/** Input to {@link ScrumService.recordCeremony}. */
export interface RecordCeremonyInput {
  type: Ceremony['type']
  /** Defaults to the active sprint when omitted. */
  sprintId?: string
  author?: string
  notes: { category: string; text: string }[]
}

/**
 * What stands between a component and its next step of the spiral (v0.17,
 * comp-46): the gate to leave its phase (`reasons` are exactly what
 * `advancePhase` refuses with), or the done gate in `validation`
 * (`next: 'done'`). A done component short-circuits: `next: null`, `ok`
 * vacuously true — while `readyForDone` stays false; the two fields answer
 * different questions ("is anything blocking the next step" vs "could it
 * become done right now").
 */
export interface PhaseReadiness {
  phase: ComponentPhase
  status: Component['status']
  next: ComponentPhase | 'done' | null
  ok: boolean
  reasons: string[]
}

/** The whole hierarchy as nested data, for tools and the web board. */
export interface ScrumTree {
  releases: (Release & Overflowed & {
    features: (Feature & Overflowed & {
      /**
       * `readyForDone` (comp-47), `readiness` (comp-46), `traces`
       * (comp-49) and `titleOverflow` (comp-53): computed in the Model on
       * every read, never persisted.
       */
      components: (Component & Overflowed & { tasks: (Task & Overflowed)[]; readyForDone: boolean; readiness: PhaseReadiness; traces: TraceMatrixData })[]
    })[]
  })[]
}

/** Read-time mark of a stored title over the limit (comp-53 R4): present only when it overflows. */
export interface Overflowed { titleOverflow?: Overflow }

/** A sprint as read: the record plus the read-time mark of a goal over the limit (comp-53 R4). */
export type SprintView = Sprint & { goalOverflow?: Overflow }

/** A task as read: the record plus the read-time mark of a title over the limit (comp-54 R3). */
export type TaskView = Task & Overflowed

/** How many live titles and how many goals stand over their limit, with the limits (comp-53 D3). */
export interface OverflowSummary { titles: number; goals: number; limits: TitleLimits }

/** One entry of a component's matrix that answered an impact query (comp-49 R5). */
export interface ImpactHit {
  id: string
  title: string
  status: Component['status']
  phase: ComponentPhase
  /** Archived components answer too — they are the history that explains the code. */
  archived: boolean
  req: string[]
  /** Which side of the entry matched. */
  via: 'files' | 'tests' | 'both'
  /** The traced paths that answered, distinct and sorted. */
  matched: string[]
  files: string[]
  tests: string[]
}

/** What the caller knows about the disk (comp-49 R5): the Model never probes it. */
export interface ImpactOptions {
  /** Workspace-relative paths that exist under the query (normalized by the Model). */
  onDisk?: string[]
  /** True when the listing hit the probe cap: `missing` becomes unknowable and is omitted. */
  onDiskTruncated?: boolean
}

/** The answer to "what does this path affect" (comp-49 R5). */
export interface ImpactReport {
  /** The normalized query ('' = the workspace root). */
  path: string
  /** Derived in the Model: a directory when the root, a match or an on-disk entry differs from the query. */
  form: 'file' | 'directory'
  hits: ImpactHit[]
  traced: boolean
  /** Traced paths under the query that are neither on disk nor a directory prefix of an on-disk entry. */
  missing?: string[]
  /** On-disk paths under the query no component traces (the coverage hole). */
  untracedOnDisk?: string[]
  onDiskTruncated?: boolean
}

/**
 * Flat per-kind lists of shelved records (the trash or the archive), newest
 * shelf stamp first inside each list.
 */
export interface ShelfLists {
  releases: Release[]
  features: Feature[]
  components: Component[]
  tasks: Task[]
}

/** Any record of the four-level hierarchy (the shelvable kinds). */
type HierRecord = Release | Feature | Component | Task

/** Sprint progress summary (simple burndown numbers). */
export interface SprintStatus {
  sprint: SprintView
  /** The sprint's tasks, marked when a title is over the limit (comp-54 R3: the snapshot reads these, not the tree). */
  tasks: TaskView[]
  totals: { tasks: number; done: number; points: number; pointsDone: number }
  /** Whole days until `endDate`, when the sprint declares one. */
  daysRemaining?: number
}

/**
 * One SCRUM board over one opened storage domain (one workspace's — or the
 * global — medium). Serves synchronous reads from the domain's in-memory
 * state; writes await durability on the domain's write chain. Resolved
 * through {@link ScrumService.board}; the service owns open/close.
 */
export class ScrumBoard {
  /** Serializes every read-modify-write of the board's global (id counters, suite budget). */
  private globalChain: Promise<unknown> = Promise.resolve()

  /**
   * @param domain - the opened SCRUM domain this board reads and writes.
   */
  constructor(private readonly domain: Domain<ScrumDomainSpec>) {}

  /** Close the underlying domain (service disposer calls this). */
  async close(): Promise<void> {
    await this.domain.close()
  }

  /** The board's global as it stands (initial value before any write). */
  private global(): BoardGlobal {
    return this.domain.global.get() ?? INITIAL_GLOBAL
  }

  /**
   * Read-modify-write the board's global on one serialized chain, so id
   * allocation and the suite budget never lose each other's update.
   * @param mutate - pure function from the current global to the next.
   * @returns the global as written.
   */
  private async mutateGlobal(mutate: (current: BoardGlobal) => BoardGlobal): Promise<BoardGlobal> {
    const write = this.globalChain.then(async () => {
      const next = mutate(this.global())
      await this.domain.global.set(next)
      return next
    })
    this.globalChain = write.catch(() => undefined)
    return write
  }

  /**
   * Allocate the next short id for one record kind (`rel-1`, `task-42`...).
   * @param kind - counter key.
   * @param prefix - id prefix.
   * @returns the fresh unique id.
   */
  private async nextId(kind: CounterKind, prefix: string): Promise<string> {
    const next = await this.mutateGlobal(current => ({ ...current, [kind]: current[kind] + 1 }))
    return `${prefix}-${next[kind]}`
  }

  /**
   * The board's suite budget (comp-50 R2): the ceiling the validation
   * contract compares `budget_seconds` against.
   * @returns the default when the board never set one, else the board's record.
   */
  suiteBudget(): SuiteBudget {
    return SuiteBudget.fromGlobal(this.global())
  }

  /**
   * Set or remove the board's suite budget (comp-50 R2).
   * @param seconds - the new ceiling (> 0); `undefined` removes the record (back to the default).
   * @param reason - required when `seconds` stands above the default (also when re-setting it).
   * @returns the budget as it stands after the write.
   * @throws ScrumError `validation` when the value or the missing reason is refused — the board is untouched.
   */
  async setSuiteBudget(seconds: number | undefined, reason?: string): Promise<SuiteBudget> {
    const record = seconds === undefined ? undefined : SuiteBudget.validate(seconds, reason)
    const next = await this.mutateGlobal(({ suiteBudget: _dropped, ...rest }) => (
      record === undefined ? rest : { ...rest, suiteBudget: record }
    ))
    return SuiteBudget.fromGlobal(next)
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
    // Validated BEFORE the id is allocated (comp-53 R2): a refusal never burns a counter value.
    const name = this.checkTitle('title', this.requireName(input.name), 'release')
    const id = await this.nextId('release', 'rel')
    const now = this.now()
    const release: Release = {
      id,
      name,
      ...input.description === undefined ? {} : { description: input.description },
      ...input.targetDate === undefined ? {} : { targetDate: input.targetDate },
      status: 'planned',
      order: this.domain.table('releases').size,
      createdAt: now,
      updatedAt: now,
    }
    await this.domain.table('releases').put(id, release)
    return release
  }

  /**
   * Create a Feature under an existing Release.
   * @param input - parent release id, title, optional description.
   * @returns the stored feature.
   */
  async createFeature(input: CreateFeatureInput): Promise<Feature> {
    this.mustGetLive('releases', input.releaseId)
    const title = this.checkTitle('title', this.requireTitle(input.title), 'feature')
    const id = await this.nextId('feature', 'feat')
    const now = this.now()
    const feature: Feature = {
      id,
      releaseId: input.releaseId,
      title,
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
    this.mustGetLive('features', input.featureId)
    const title = this.checkTitle('title', this.requireTitle(input.title), 'component')
    const id = await this.nextId('component', 'comp')
    const now = this.now()
    const component: Component = {
      id,
      featureId: input.featureId,
      title,
      ...input.description === undefined ? {} : { description: input.description },
      status: 'proposed',
      phase: 'requirements',
      phaseLog: [],
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
    this.mustGetLive('components', input.componentId)
    // Kind and title are resolved BEFORE the id is allocated (comp-45 P2):
    // a refused input never burns a counter value.
    const resolved = this.resolveTaskKind(input.title, input.kind, undefined, input.componentId)
    this.checkTitle('title', resolved.title, input.componentId)
    const id = await this.nextId('task', 'task')
    const now = this.now()
    const task: Task = {
      id,
      componentId: input.componentId,
      title: resolved.title,
      kind: resolved.kind,
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

  /**
   * @returns the whole LIVE hierarchy as nested data, orders ascending.
   * Shelved records (trashed or archived) are left out at every level; read
   * them through {@link trash} and {@link archive} instead.
   */
  tree(): ScrumTree {
    const byOrder = <T extends { order: number }>(a: T, b: T): number => a.order - b.order
    const live = <T extends { deletedAt?: string; archivedAt?: string }>(r: T): boolean =>
      r.deletedAt === undefined && r.archivedAt === undefined
    const features = [...this.domain.table('features').entries()].map(([, f]) => f).filter(live)
    const components = [...this.domain.table('components').entries()].map(([, c]) => c).filter(live)
    const tasks = [...this.domain.table('tasks').entries()].map(([, t]) => t).filter(live)
    return {
      releases: [...this.domain.table('releases').entries()]
        .map(([, release]) => release)
        .filter(live)
        .sort(byOrder)
        .map(release => ({
          ...release,
          ...this.marked(release.name),
          features: features
            .filter(f => f.releaseId === release.id)
            .sort(byOrder)
            .map(feature => ({
              ...feature,
              ...this.marked(feature.title),
              components: components
                .filter(c => c.featureId === feature.id)
                .sort(byOrder)
                .map(component => ({
                  ...component,
                  ...this.marked(component.title),
                  tasks: tasks.filter(t => t.componentId === component.id).sort(byOrder).map(t => ({ ...t, ...this.marked(t.title) })),
                  readyForDone: component.status !== 'done' && this.doneGate(component).length === 0,
                  readiness: this.readinessOf(component),
                  // comp-49 R5: the matrix as data, done components included (the GUI shows history too).
                  traces: TraceMatrix.of(component),
                })),
            })),
        })),
    }
  }

  /** @returns every sprint, newest number first, each marked when its goal is over the limit (comp-53 R4). */
  sprints(): SprintView[] {
    return [...this.domain.table('sprints').entries()]
      .map(([, sprint]) => this.sprintView(sprint))
      .sort((a, b) => b.number - a.number)
  }

  /** @returns the single active sprint, or undefined. */
  activeSprint(): SprintView | undefined {
    return this.sprints().find(s => s.status === 'active')
  }

  /** The two title ceilings, as Controllers and the View read them (comp-53 R1/D9). */
  titleLimits(): TitleLimits {
    return TitleContract.limits()
  }

  /**
   * How many live titles (the four levels of the tree) and how many goals
   * (every sprint) stand over their limit (comp-53 D3) — feeds the header line.
   */
  overflowSummary(): OverflowSummary {
    let titles = 0
    for (const release of this.tree().releases) {
      if (release.titleOverflow !== undefined) titles += 1
      for (const feature of release.features) {
        if (feature.titleOverflow !== undefined) titles += 1
        for (const component of feature.components) {
          if (component.titleOverflow !== undefined) titles += 1
          for (const task of component.tasks) if (task.titleOverflow !== undefined) titles += 1
        }
      }
    }
    const goals = this.sprints().filter(s => s.goalOverflow !== undefined).length
    return { titles, goals, limits: this.titleLimits() }
  }

  /** The read-time title mark of one stored text (comp-53 R4): an object to spread, empty when it fits. */
  private marked(text: string): Overflowed {
    const over = TitleContract.overflow('title', text)
    return over === undefined ? {} : { titleOverflow: over }
  }

  /** A sprint record as read, marked when its goal is over the limit (comp-53 R4). */
  private sprintView(sprint: Sprint): SprintView {
    const over = TitleContract.overflow('goal', sprint.goal)
    return over === undefined ? sprint : { ...sprint, goalOverflow: over }
  }

  /**
   * Sprints linked to one release, newest number first.
   * @param releaseId - the release id.
   * @returns the linked sprints.
   */
  sprintsOfRelease(releaseId: string): SprintView[] {
    return this.sprints().filter(s => s.releaseIds.includes(releaseId))
  }

  /**
   * Normalize the two release-link fields of a sprint patch/plan into one
   * replacement array, validating every id against the live releases.
   * @param link - the single-link shortcut and/or the whole-set field.
   * @returns the deduplicated replacement set; undefined leaves links untouched.
   */
  private narrowReleaseLinks(link: { releaseId?: string; releaseIds?: string[] }): string[] | undefined {
    if (link.releaseIds !== undefined) {
      const ids = [...new Set(link.releaseIds)]
      for (const id of ids) this.mustGetLive('releases', id)
      return ids
    }
    if (link.releaseId === undefined) return undefined
    if (link.releaseId === '') return []
    this.mustGetLive('releases', link.releaseId)
    return [link.releaseId]
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
    const stored = sprintId === undefined
      ? this.activeSprint()
      : this.domain.table('sprints').get(sprintId)
    const sprint = stored === undefined ? undefined : this.sprintView(stored)
    if (sprint === undefined) {
      throw new ScrumError('not-found', sprintId === undefined
        ? 'no active sprint'
        : `sprint '${sprintId}' does not exist`)
    }
    const tasks = [...this.domain.table('tasks').entries()]
      .map(([, t]) => t)
      // Trashed tasks leave the sprint views; archived DONE tasks stay: they
      // are history and keep counting in the totals of completed sprints.
      .filter(t => t.sprintId === sprint.id && t.deletedAt === undefined)
      .sort((a, b) => a.order - b.order)
      .map(t => ({ ...t, ...this.marked(t.title) }))
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
      this.mustGetLive('releases', id)
      return this.domain.table('releases').update(id, current => ({
        ...current,
        ...patch.title === undefined ? {} : { name: this.checkTitle('title', this.requireName(patch.title), id) },
        ...patch.description === undefined ? {} : { description: patch.description },
        ...patch.targetDate === undefined ? {} : { targetDate: patch.targetDate },
        ...patch.status === undefined ? {} : { status: this.narrowStatus(patch.status, RELEASE_STATUSES, id) },
        ...stamp,
      }))
    }
    if (id.startsWith('feat-')) {
      this.mustGetLive('features', id)
      return this.domain.table('features').update(id, current => ({
        ...current,
        ...patch.title === undefined ? {} : { title: this.checkTitle('title', this.requireTitle(patch.title), id) },
        ...patch.description === undefined ? {} : { description: patch.description },
        ...patch.status === undefined ? {} : { status: this.narrowStatus(patch.status, FEATURE_STATUSES, id) },
        ...stamp,
      }))
    }
    if (id.startsWith('comp-')) {
      this.mustGetLive('components', id)
      return this.domain.table('components').update(id, (current) => {
        const next: Component = {
          ...current,
          ...patch.title === undefined ? {} : { title: this.checkTitle('title', this.requireTitle(patch.title), id) },
          ...patch.description === undefined ? {} : { description: patch.description },
          ...patch.status === undefined ? {} : { status: this.narrowStatus(patch.status, COMPONENT_STATUSES, id) },
          ...stamp,
        }
        // Spiral artifacts: set when given, deleted on the empty string.
        for (const field of ARTIFACT_FIELDS) {
          const value = patch[field]
          if (value === undefined) continue
          if (value === '') delete next[field]
          else next[field] = value
        }
        // The done gate (comp-47): only the transition INTO done, evaluated on
        // the next state (artifacts of this very patch already applied).
        if (current.status !== 'done' && next.status === 'done') {
          const reasons = this.doneGate(next)
          if (reasons.length > 0) {
            throw new ScrumError('done-gate', `${id}: ${reasons.join('; ')} — cannot set status done`)
          }
        }
        return next
      })
    }
    if (id.startsWith('task-')) {
      const live = this.mustGetLive('tasks', id)
      // Title and kind go through the one precedence rule (comp-45 R2); a
      // refusal throws here, before the mutator, and leaves the record intact.
      const resolved = this.resolveTaskKind(patch.title, patch.kind, live.kind, id)
      if (resolved.title !== undefined) this.checkTitle('title', resolved.title, id)
      return this.domain.table('tasks').update(id, current => ({
        ...current,
        ...resolved.title === undefined ? {} : { title: resolved.title },
        kind: resolved.kind,
        ...patch.description === undefined ? {} : { description: patch.description },
        ...patch.estimate === undefined ? {} : { estimate: patch.estimate },
        ...stamp,
      }))
    }
    if (id.startsWith('spr-')) {
      this.mustGet('sprints', id)
      const releaseIds = this.narrowReleaseLinks(patch)
      const wipLimits = patch.wipLimits === undefined ? undefined : this.narrowWipLimits(patch.wipLimits, id)
      return this.domain.table('sprints').update(id, (current) => {
        const next: Sprint = {
          ...current,
          ...patch.goal === undefined ? {} : { goal: this.checkTitle('goal', this.requireTitle(patch.goal), id) },
          ...releaseIds === undefined ? {} : { releaseIds },
          ...stamp,
        }
        if (wipLimits !== undefined) {
          if (Object.keys(wipLimits).length === 0) delete next.wipLimits
          else next.wipLimits = wipLimits
        }
        return next
      })
    }
    throw new ScrumError('invalid-id', `id '${id}' carries no known prefix (rel-, feat-, comp-, task-, spr-)`)
  }

  // ── the spiral (v0.12, comp-42) ───────────────────────────────────────────
  //
  // A component walks requirements → design → tdd → construction →
  // validation one step at a time. Each forward step has a gate — the
  // artifact of the phase being left, or the state of the component's tasks
  // — evaluated INSIDE the table mutator so every caller (tools, API, GUI)
  // meets the same rule with no read/check/write window. Retreats are free:
  // the spiral revisits. Every movement lands in the append-only phaseLog.

  /**
   * Move one component to the next phase, through its gate.
   * @param id - component id.
   * @returns the updated component.
   */
  async advancePhase(id: string): Promise<Component> {
    const current = this.mustGetLive('components', id)
    const index = COMPONENT_PHASES.indexOf(current.phase)
    const next = COMPONENT_PHASES[index + 1]
    if (next === undefined) {
      throw new ScrumError('phase-gate', `${id}: already at the last phase (${current.phase})`)
    }
    return this.setPhase(id, next)
  }

  /**
   * Set one component's phase: backwards freely, one step forward through
   * the gate, never skipping; the same phase is a no-op.
   * @param id - component id.
   * @param target - the phase to land on.
   * @returns the updated component.
   */
  async setPhase(id: string, target: string): Promise<Component> {
    const live = this.mustGetLive('components', id)
    if (!(COMPONENT_PHASES as readonly string[]).includes(target)) {
      throw new ScrumError('invalid-phase', `phase '${target}' is not one of ${COMPONENT_PHASES.join(', ')}`)
    }
    const to = target as ComponentPhase
    if (live.status === 'done') {
      throw new ScrumError('phase-gate', `${id}: component is done — set its status back before moving its phase`)
    }
    if (live.phase === to) return live
    return this.domain.table('components').update(id, (current) => {
      const fromIndex = COMPONENT_PHASES.indexOf(current.phase)
      const toIndex = COMPONENT_PHASES.indexOf(to)
      if (toIndex > fromIndex + 1) {
        throw new ScrumError('phase-gate', `${id}: cannot skip from ${current.phase} to ${to}`)
      }
      if (toIndex === fromIndex + 1) {
        const reasons = this.phaseGate(current)
        if (reasons.length > 0) {
          throw new ScrumError('phase-gate', `${id}: ${reasons.join('; ')} — cannot advance from ${current.phase} to ${to}`)
        }
      }
      const now = this.now()
      return {
        ...current,
        phase: to,
        // The first advance of a proposed component starts it.
        ...current.status === 'proposed' && toIndex > fromIndex ? { status: 'in_progress' as const } : {},
        phaseLog: [...current.phaseLog, { from: current.phase, to, at: now }],
        updatedAt: now,
      }
    })
  }

  /**
   * The conditions to LEAVE a component's current phase — every violated
   * one, named; empty when met (v0.17: a list, so `phaseReadiness` and the
   * refusal share it; `setPhase` joins with `; `, messages unchanged).
   * Task gates count the component's non-trashed tasks — archived done tasks
   * still count (archiving finished work is the recommended flow).
   * @param component - the component as the mutator sees it.
   * @returns the missing conditions, in order.
   */
  private phaseGate(component: Component): string[] {
    switch (component.phase) {
      case 'requirements': {
        // v0.13 (comp-48): the review contract — every violated condition, named.
        const result = new ReviewContract().check(component)
        return result.ok ? [] : result.reasons
      }
      case 'design': {
        // comp-49 R4: an empty design keeps its one exact reason; a filled one
        // must carry the traceability matrix (the contract is consulted only then).
        if (!filled(component.design)) return ['design is empty']
        const result = new TraceContract('design').check(component)
        return result.ok ? [] : result.reasons
      }
      case 'tdd': {
        // comp-45 R3: tests before code. (a) alone excludes (b)/(c); without
        // any test task every code task counts as early, so (b) and (c) come
        // together. Creation order is the id NUMBER (createdAt can tie).
        const tasks = this.tasksOf(component.id)
        if (tasks.length === 0) return ['no task under the component (decompose first)']
        const reasons: string[] = []
        const tests = tasks.filter(t => t.kind === 'test')
        const firstTest = tests.length === 0 ? Infinity : Math.min(...tests.map(t => taskNumber(t.id)))
        if (tests.length === 0) reasons.push('no test task (kind test) — write the tests first')
        const early = tasks
          .filter(t => t.kind === 'code' && taskNumber(t.id) < firstTest)
          .sort((a, b) => taskNumber(a.id) - taskNumber(b.id))
        if (early.length > 0) {
          reasons.push(`code task(s) created before the first test task (${early.map(t => t.id).join(', ')}) — change their kind or trash them`)
        }
        return reasons
      }
      case 'construction': {
        const tasks = this.tasksOf(component.id)
        if (tasks.length === 0) return ['no task under the component']
        const open = tasks.filter(t => t.status !== 'done')
        return open.length === 0 ? [] : [`${open.length} task(s) not done (${open.map(t => t.id).join(', ')})`]
      }
      case 'validation':
        return []
    }
  }

  /**
   * What stands between one component and its next step (comp-46 R1): the
   * phase gate, or the done gate in `validation`; a done component
   * short-circuits without evaluating any gate. One source of truth for
   * `phaseReadiness`, the tree annotation, the `check` tool and the context
   * snapshot.
   * @param component - the live component.
   * @returns the readiness.
   */
  private readinessOf(component: Component): PhaseReadiness {
    const base = { phase: component.phase, status: component.status }
    if (component.status === 'done') return { ...base, next: null, ok: true, reasons: [] }
    if (component.phase === 'validation') {
      const reasons = this.doneGate(component)
      return { ...base, next: 'done', ok: reasons.length === 0, reasons }
    }
    const next = COMPONENT_PHASES[COMPONENT_PHASES.indexOf(component.phase) + 1]!
    const reasons = this.phaseGate(component)
    return { ...base, next, ok: reasons.length === 0, reasons }
  }

  /**
   * The spiral's gates read without moving anything (comp-46 R1).
   * @param id - component id (shelved ones refuse with the house codes).
   * @returns phase, next step, and exactly the reasons a move would be refused with.
   */
  phaseReadiness(id: string): PhaseReadiness {
    return this.readinessOf(this.mustGetLive('components', id))
  }

  /**
   * The review contract's verdict on one component, as the gate will see it
   * (v0.13, comp-48): lets callers warn before the gate refuses.
   * @param id - component id.
   * @returns ok, or every violated condition.
   */
  reviewContract(id: string): ContractResult {
    return new ReviewContract().check(this.mustGetLive('components', id))
  }

  /**
   * Everything a reviewer needs to review one component's requirements
   * (v0.13, comp-48). Model side only — `formatReviewBrief` renders it.
   * @param id - component id.
   * @returns the brief data.
   */
  reviewBrief(id: string): ReviewBriefData {
    const component = this.mustGetLive('components', id)
    const contract = new ReviewContract()
    const requirements = contract.requirements
    if (!filled(component.requirements)) {
      throw new ScrumError('review-brief', `${id}: \`requirements\` is empty — write them before asking for a review`)
    }
    const { meta, issues } = requirements.meta(component)
    if (meta === null) {
      const hint = issues.some(i => i.includes('missing or malformed'))
        ? '`requirements` has no frontmatter version — add `---`, `version: 1`, `---` on top'
        : '`requirements` frontmatter invalid'
      throw new ScrumError('review-brief', `${id}: ${hint} (${issues.join('; ')})`)
    }
    if (requirements.body(component).length === 0) {
      throw new ScrumError('review-brief', `${id}: \`requirements\` body is empty (only frontmatter) — nothing to review`)
    }
    const pastRequirements = COMPONENT_PHASES.indexOf(component.phase) > 0
    return {
      component,
      requirements: {
        version: meta.version,
        digest: requirements.digest(component),
        status: meta.status,
        body: requirements.body(component),
        ids: requirements.ids(component),
      },
      ...filled(component.requirementsReview)
        ? { previousReview: { meta: contract.meta(component).meta, body: contract.body(component) } }
        : {},
      ...pastRequirements && filled(component.design) ? { design: component.design } : {},
      taskCount: this.tasksOf(id).length,
      suiteBudgetSeconds: this.suiteBudget().seconds,
    }
  }

  /**
   * The conditions for a component to become `done` (comp-47): phase
   * validation, at least one non-trashed task and all of them done, and a
   * validation artifact honoring its contract. One source of truth — the
   * gate in `updateItem`, `doneReadiness` and the tree's `readyForDone` all
   * read this.
   * @param component - the component as the caller sees it (next state inside the mutator).
   * @returns every violated condition, in order; empty when ready.
   */
  private doneGate(component: Component): string[] {
    const reasons: string[] = []
    if (component.phase !== 'validation') reasons.push(`phase is ${component.phase} (needs validation)`)
    const tasks = this.tasksOf(component.id)
    if (tasks.length === 0) reasons.push('no task under the component')
    else {
      const open = tasks.filter(t => t.status !== 'done')
      if (open.length > 0) reasons.push(`${open.length} task(s) not done (${open.map(t => t.id).join(', ')})`)
    }
    const contract = this.validationContractFor().check(component)
    if (!contract.ok) reasons.push(...contract.reasons)
    // comp-49 R4: the matrix closes against the CURRENT requirement ids —
    // read from the effective source (the validation's as-built when it
    // carries an array, else the design; with no source the design's reasons speak).
    const traces = new TraceContract(TraceMatrix.sourceOf(component) ?? 'design').check(component)
    if (!traces.ok) reasons.push(...traces.reasons)
    return reasons
  }

  /**
   * Whether a component could become `done` right now — the gate's own
   * verdict, exposed so callers can warn before the gate refuses.
   * @param id - component id.
   * @returns ok, or every violated condition.
   */
  doneReadiness(id: string): ContractResult {
    const reasons = this.doneGate(this.mustGetLive('components', id))
    return reasons.length === 0 ? { ok: true } : { ok: false, reasons }
  }

  /**
   * The validation contract's verdict on one component's artifact.
   * @param id - component id.
   * @returns ok, or every violated condition plus the over-budget flag (comp-50 R4).
   */
  validationContract(id: string): ValidationResult {
    return this.validationContractFor().check(this.mustGetLive('components', id))
  }

  /** The validation contract bound to THIS board's suite budget (comp-50 R2). */
  private validationContractFor(): ValidationContract {
    return new ValidationContract({ budgetSeconds: this.suiteBudget().seconds })
  }

  // ── the traceability matrix (v0.18, comp-49) ───────────────────────────────

  /** Every component outside the trash — archived included — by id number. */
  private tracedComponents(): Component[] {
    return [...this.domain.table('components').entries()]
      .map(([, component]) => component)
      .filter(c => c.deletedAt === undefined)
      .sort((a, b) => Number(a.id.slice(5)) - Number(b.id.slice(5)))
  }

  /**
   * What one path affects (comp-49 R5): every matrix entry — of every
   * component outside the trash — that names the path or something under
   * it. Pure over the board; the caller may hand in what exists on disk and
   * gets the coverage holes back.
   * @param path - a workspace-relative file or directory ('' / '.' = the root).
   * @param options - the disk listing under the query, when the caller probed it.
   * @returns the report.
   * @throws ScrumError `invalid-input` for an absolute or parent-escaping query.
   */
  impact(path: string, options: ImpactOptions = {}): ImpactReport {
    const q = normalizePath(path)
    const issue = pathIssue(q)
    if (issue === 'absolute' || issue === '.. segment') {
      throw new ScrumError('invalid-input', `impact path must be workspace-relative (got '${path}': ${issue})`)
    }
    const codePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
    const hits: ImpactHit[] = []
    for (const component of this.tracedComponents()) {
      for (const entry of TraceMatrix.of(component).entries) {
        const files = entry.files.filter(p => matchPath(p, q))
        const tests = entry.tests.filter(p => matchPath(p, q))
        if (files.length + tests.length === 0) continue
        hits.push({
          id: component.id,
          title: component.title,
          status: component.status,
          phase: component.phase,
          archived: component.archivedAt !== undefined,
          req: [...entry.req],
          via: files.length > 0 && tests.length > 0 ? 'both' : files.length > 0 ? 'files' : 'tests',
          matched: [...new Set([...files, ...tests])].sort(codePoint),
          files: [...entry.files],
          tests: [...entry.tests],
        })
      }
    }
    const matched = [...new Set(hits.flatMap(h => h.matched))]
    const report: ImpactReport = { path: q, form: 'file', hits, traced: hits.length > 0 }
    let disk: string[] | undefined
    if (options.onDisk !== undefined) {
      disk = [...new Set(options.onDisk.map(normalizePath))]
      const traced = new Set(this.tracedFiles())
      report.untracedOnDisk = disk.filter(p => !traced.has(p)).sort(codePoint)
      if (options.onDiskTruncated === true) report.onDiskTruncated = true
      else {
        const present = new Set(disk)
        report.missing = matched
          .filter(m => !present.has(m) && !disk!.some(d => d.startsWith(`${m}/`)))
          .sort(codePoint)
      }
    }
    if (q === '' || matched.some(m => m !== q) || (disk ?? []).some(d => d !== q)) report.form = 'directory'
    return report
  }

  /** Every traced file or test over the components outside the trash, distinct, code-point order (comp-49 R5). */
  tracedFiles(): string[] {
    const all = new Set<string>()
    for (const component of this.tracedComponents()) {
      const matrix = TraceMatrix.of(component)
      for (const p of matrix.files) all.add(p)
      for (const p of matrix.tests) all.add(p)
    }
    return [...all].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  }

  /**
   * The matrix of one component as data (comp-49 R5) — archived ones
   * included (read-only history); trashed and unknown ids refuse.
   * @param id - component id.
   * @returns the deep-frozen matrix.
   */
  traceMatrix(id: string): TraceMatrixData {
    return TraceMatrix.of(this.mustGetNotTrashed('components', id))
  }

  /**
   * The trace contract's verdict on one field of a component (comp-49 R8),
   * as the gates will see it — the effective source by default.
   * @param id - component id.
   * @param field - `design` or `validation`; defaults to the effective source (the design when there is none).
   * @returns ok, or every violated condition.
   */
  traceContract(id: string, field?: TraceField): ContractResult {
    const component = this.mustGetNotTrashed('components', id)
    return new TraceContract(field ?? TraceMatrix.sourceOf(component) ?? 'design').check(component)
  }

  /**
   * Which gate will read the matrix of one field (comp-49 R8): what the
   * tool's early note names. See `traceGateFor`.
   * @param id - component id.
   * @param field - the field just written.
   * @returns the gate, or null when the field is not the effective source.
   */
  traceGate(id: string, field: TraceField): TraceGate | null {
    return traceGateFor(this.mustGetNotTrashed('components', id), field)
  }

  /** The component's tasks that count for phase gates: everything not in the trash. */
  private tasksOf(componentId: string): Task[] {
    return [...this.domain.table('tasks').entries()]
      .map(([, task]) => task)
      .filter(t => t.componentId === componentId && t.deletedAt === undefined)
  }

  // ── lifecycle: trash & archive ────────────────────────────────────────────
  //
  // Every hierarchy record is in exactly one of three states: LIVE (in the
  // main views), ARCHIVED (`archivedAt` — concluded and stowed away) or
  // TRASHED (`deletedAt` — soft deleted). Deleting always goes through the
  // trash; only `purgeItem`/`emptyTrash` remove records physically. A
  // cascade stamps one shared timestamp on the whole subtree so restore and
  // unarchive can revive exactly the records shelved together.

  /**
   * Move one node (and, with `cascade`, its live subtree) to the TRASH.
   * A parent with live descendants is refused unless `cascade`. Sprints and
   * ceremonies are history and are never trashed; a task inside the active
   * sprint must be moved out first. Archived victims lose their archive flag
   * (the states are exclusive); tasks not yet done leave their sprint so a
   * later restore lands them in the backlog.
   * @param id - node id (release/feature/component/task).
   * @param cascade - also trash every live descendant.
   * @returns ids actually trashed, parents first.
   */
  async deleteItem(id: string, cascade = false): Promise<string[]> {
    const record = this.hierMustGet(id, 'delete')
    if (record.deletedAt !== undefined) {
      throw new ScrumError('in-trash', `'${id}' is already in the trash`)
    }
    const victims = this.subtree(id, r => r.deletedAt === undefined)
    this.guardActiveSprintTasks(victims, 'move it out before deleting')
    if (!cascade && victims.length > 1) {
      throw new ScrumError('has-children', `'${id}' has ${victims.length - 1} descendant(s); pass cascade to trash the subtree`)
    }
    const stamp = this.now()
    for (const victimId of [...victims].reverse()) {
      if (victimId.startsWith('task-')) {
        await this.domain.table('tasks').update(victimId, (current) => {
          const next: Task = { ...current, deletedAt: stamp, updatedAt: this.now() }
          delete next.archivedAt
          if (next.status !== 'done' && next.sprintId !== undefined) {
            delete next.sprintId
            next.status = 'backlog'
          }
          return next
        })
        continue
      }
      await this.patchShelf(victimId, (r) => {
        r.deletedAt = stamp
        delete r.archivedAt
      })
    }
    return victims
  }

  /**
   * Restore one node from the TRASH back to the live views. Shelved
   * ancestors are revived too (so the node is reachable again), and so are
   * the descendants trashed by the same delete operation (same stamp).
   * @param id - node id currently in the trash.
   * @returns ids revived, parents first.
   */
  async restoreItem(id: string): Promise<string[]> {
    const record = this.hierMustGet(id, 'restore')
    if (record.deletedAt === undefined) {
      throw new ScrumError('not-in-trash', `'${id}' is not in the trash`)
    }
    const stamp = record.deletedAt
    const ancestors: string[] = []
    for (let parent = this.parentId(id); parent !== undefined; parent = this.parentId(parent)) {
      const ancestor = this.hierMustGet(parent, 'restore')
      if (ancestor.deletedAt !== undefined || ancestor.archivedAt !== undefined) ancestors.push(parent)
    }
    for (const ancestorId of ancestors) {
      await this.patchShelf(ancestorId, (r) => {
        delete r.deletedAt
        delete r.archivedAt
      })
    }
    const together = this.subtree(id, r => r.deletedAt === stamp)
    for (const memberId of together) {
      await this.patchShelf(memberId, (r) => { delete r.deletedAt })
    }
    return [...ancestors.reverse(), ...together]
  }

  /**
   * PURGE one trashed node: physical, definitive removal of it and of its
   * trashed subtree. Only reachable from the trash — a live or archived node
   * must be deleted first. Sprints survive a purged release; they only lose
   * the link.
   * @param id - node id currently in the trash.
   * @returns ids removed forever, parents first.
   */
  async purgeItem(id: string): Promise<string[]> {
    const record = this.hierMustGet(id, 'purge')
    if (record.deletedAt === undefined) {
      throw new ScrumError('not-in-trash', `'${id}' is not in the trash; only trashed items can be purged`)
    }
    const victims = this.subtree(id, r => r.deletedAt !== undefined)
    for (const victimId of [...victims].reverse()) await this.hierDelete(victimId)
    await this.unlinkSprints(victims.filter(v => v.startsWith('rel-')))
    return victims
  }

  /**
   * Empty the whole TRASH: physically remove every trashed record.
   * @returns ids removed forever, parents first.
   */
  async emptyTrash(): Promise<string[]> {
    const shelved = this.shelf('deletedAt')
    const purged = [
      ...shelved.releases.map(r => r.id),
      ...shelved.features.map(f => f.id),
      ...shelved.components.map(c => c.id),
      ...shelved.tasks.map(t => t.id),
    ]
    for (const victimId of [...purged].reverse()) await this.hierDelete(victimId)
    await this.unlinkSprints(purged.filter(v => v.startsWith('rel-')))
    return purged
  }

  /** @returns the trash content, per kind, newest deletion first. */
  trash(): ShelfLists {
    return this.shelf('deletedAt')
  }

  /** @returns the archive content, per kind, newest archiving first. */
  archive(): ShelfLists {
    return this.shelf('archivedAt')
  }

  /**
   * ARCHIVE one live node and its live subtree (concluded work leaves the
   * main views but stays restorable and keeps counting in sprint history).
   * Tasks in the active sprint refuse to be archived; tasks not yet done
   * leave their sprint so a later unarchive lands them in the backlog.
   * @param id - live node id.
   * @returns ids archived, parents first.
   */
  async archiveItem(id: string): Promise<string[]> {
    const record = this.hierMustGet(id, 'archive')
    if (record.deletedAt !== undefined) {
      throw new ScrumError('in-trash', `'${id}' is in the trash; restore it before archiving`)
    }
    if (record.archivedAt !== undefined) {
      throw new ScrumError('already-archived', `'${id}' is already archived`)
    }
    const members = this.subtree(id, r => r.deletedAt === undefined && r.archivedAt === undefined)
    this.guardActiveSprintTasks(members, 'archiving would hide it from the board')
    const stamp = this.now()
    for (const memberId of [...members].reverse()) {
      if (memberId.startsWith('task-')) {
        await this.domain.table('tasks').update(memberId, (current) => {
          const next: Task = { ...current, archivedAt: stamp, updatedAt: this.now() }
          if (next.status !== 'done' && next.sprintId !== undefined) {
            delete next.sprintId
            next.status = 'backlog'
          }
          return next
        })
        continue
      }
      await this.patchShelf(memberId, (r) => { r.archivedAt = stamp })
    }
    return members
  }

  /**
   * Bring one node back from the ARCHIVE. Shelved ancestors are revived and
   * the descendants archived by the same operation (same stamp) return too.
   * @param id - node id currently archived.
   * @returns ids revived, parents first.
   */
  async unarchiveItem(id: string): Promise<string[]> {
    const record = this.hierMustGet(id, 'unarchive')
    if (record.archivedAt === undefined) {
      throw new ScrumError('not-archived', `'${id}' is not archived`)
    }
    const stamp = record.archivedAt
    const ancestors: string[] = []
    for (let parent = this.parentId(id); parent !== undefined; parent = this.parentId(parent)) {
      const ancestor = this.hierMustGet(parent, 'unarchive')
      if (ancestor.deletedAt !== undefined || ancestor.archivedAt !== undefined) ancestors.push(parent)
    }
    for (const ancestorId of ancestors) {
      await this.patchShelf(ancestorId, (r) => {
        delete r.deletedAt
        delete r.archivedAt
      })
    }
    const together = this.subtree(id, r => r.archivedAt === stamp && r.deletedAt === undefined)
    for (const memberId of together) {
      await this.patchShelf(memberId, (r) => { delete r.archivedAt })
    }
    return [...ancestors.reverse(), ...together]
  }

  /**
   * Batch shortcut: archive every live DONE task that is not on the active
   * board (its sprint is completed — or it has none). Features and releases
   * are archived explicitly through {@link archiveItem}, never in batch.
   * @returns ids archived, possibly empty.
   */
  async archiveCompleted(): Promise<string[]> {
    const active = this.activeSprint()
    const stamp = this.now()
    const archived: string[] = []
    for (const [taskId, task] of [...this.domain.table('tasks').entries()]) {
      if (task.status !== 'done' || task.deletedAt !== undefined || task.archivedAt !== undefined) continue
      if (task.sprintId !== undefined && active?.id === task.sprintId) continue
      await this.domain.table('tasks').update(taskId, current => ({
        ...current, archivedAt: stamp, updatedAt: this.now(),
      }))
      archived.push(taskId)
    }
    return archived
  }

  /** Throws when any task among `ids` belongs to the active sprint. */
  private guardActiveSprintTasks(ids: string[], hint: string): void {
    const active = this.activeSprint()
    if (active === undefined) return
    for (const id of ids) {
      if (!id.startsWith('task-')) continue
      const task = this.domain.table('tasks').get(id)
      if (task?.sprintId === active.id) {
        throw new ScrumError('task-in-active-sprint', `task '${id}' is in the active sprint; ${hint}`)
      }
    }
  }

  /** @returns per-kind lists of records carrying `field`, newest stamp first. */
  private shelf(field: 'deletedAt' | 'archivedAt'): ShelfLists {
    const pick = <T extends { deletedAt?: string; archivedAt?: string }>(entries: IterableIterator<[string, T]>): T[] =>
      [...entries]
        .map(([, r]) => r)
        .filter(r => r[field] !== undefined)
        .sort((a, b) => (b[field] ?? '').localeCompare(a[field] ?? ''))
    return {
      releases: pick(this.domain.table('releases').entries()),
      features: pick(this.domain.table('features').entries()),
      components: pick(this.domain.table('components').entries()),
      tasks: pick(this.domain.table('tasks').entries()),
    }
  }

  /** @returns subtree ids rooted at `id` (parents first) whose record passes `keep`. */
  private subtree(id: string, keep: (record: HierRecord) => boolean): string[] {
    const record = this.hierRecord(id)
    const self = record !== undefined && keep(record) ? [id] : []
    return [...self, ...this.childIds(id).flatMap(childId => this.subtree(childId, keep))]
  }

  /** @returns direct child ids of one hierarchy node (empty for tasks). */
  private childIds(id: string): string[] {
    if (id.startsWith('rel-')) {
      return [...this.domain.table('features').entries()].filter(([, f]) => f.releaseId === id).map(([fid]) => fid)
    }
    if (id.startsWith('feat-')) {
      return [...this.domain.table('components').entries()].filter(([, c]) => c.featureId === id).map(([cid]) => cid)
    }
    if (id.startsWith('comp-')) {
      return [...this.domain.table('tasks').entries()].filter(([, t]) => t.componentId === id).map(([tid]) => tid)
    }
    return []
  }

  /** @returns the parent id of one hierarchy node (undefined for releases). */
  private parentId(id: string): string | undefined {
    if (id.startsWith('feat-')) return this.domain.table('features').get(id)?.releaseId
    if (id.startsWith('comp-')) return this.domain.table('components').get(id)?.featureId
    if (id.startsWith('task-')) return this.domain.table('tasks').get(id)?.componentId
    return undefined
  }

  /** @returns the hierarchy record for `id` or undefined (any table). */
  private hierRecord(id: string): HierRecord | undefined {
    if (id.startsWith('rel-')) return this.domain.table('releases').get(id)
    if (id.startsWith('feat-')) return this.domain.table('features').get(id)
    if (id.startsWith('comp-')) return this.domain.table('components').get(id)
    if (id.startsWith('task-')) return this.domain.table('tasks').get(id)
    return undefined
  }

  /** @returns the hierarchy record or throws `invalid-id` / `not-found`. */
  private hierMustGet(id: string, verb: string): HierRecord {
    if (!id.startsWith('rel-') && !id.startsWith('feat-') && !id.startsWith('comp-') && !id.startsWith('task-')) {
      throw new ScrumError('invalid-id', `cannot ${verb} '${id}': unknown or non-shelvable id prefix`)
    }
    const record = this.hierRecord(id)
    if (record === undefined) throw new ScrumError('not-found', `'${id}' does not exist`)
    return record
  }

  /** Physically delete one hierarchy record (no checks; callers validate). */
  private async hierDelete(id: string): Promise<void> {
    if (id.startsWith('rel-')) await this.domain.table('releases').delete(id)
    else if (id.startsWith('feat-')) await this.domain.table('features').delete(id)
    else if (id.startsWith('comp-')) await this.domain.table('components').delete(id)
    else await this.domain.table('tasks').delete(id)
  }

  /** Rewrite one record's shelf fields through its own table. */
  private async patchShelf(
    id: string,
    mutate: (record: { deletedAt?: string; archivedAt?: string }) => void,
  ): Promise<void> {
    const apply = <T extends { deletedAt?: string; archivedAt?: string; updatedAt: string }>(current: T): T => {
      const next = { ...current }
      mutate(next)
      next.updatedAt = this.now()
      return next
    }
    if (id.startsWith('rel-')) await this.domain.table('releases').update(id, apply)
    else if (id.startsWith('feat-')) await this.domain.table('features').update(id, apply)
    else if (id.startsWith('comp-')) await this.domain.table('components').update(id, apply)
    else await this.domain.table('tasks').update(id, apply)
  }

  /** Sprints are history and survive purged releases: drop dangling links. */
  private async unlinkSprints(releaseIds: string[]): Promise<void> {
    if (releaseIds.length === 0) return
    for (const [sprintId, sprint] of [...this.domain.table('sprints').entries()]) {
      if (!sprint.releaseIds.some(id => releaseIds.includes(id))) continue
      await this.domain.table('sprints').update(sprintId, current => ({
        ...current,
        releaseIds: current.releaseIds.filter(id => !releaseIds.includes(id)),
        updatedAt: this.now(),
      }))
    }
  }

  // ── sprints ───────────────────────────────────────────────────────────────

  /**
   * Sprint Planning: create a `planned` sprint and select tasks into it.
   * @param input - goal, optional window, optional initial task selection.
   * @returns the stored sprint.
   */
  async planSprint(input: PlanSprintInput): Promise<Sprint> {
    const releaseIds = this.narrowReleaseLinks(input) ?? []
    for (const taskId of input.taskIds ?? []) {
      const task = this.mustGetLive('tasks', taskId)
      if (task.sprintId !== undefined) {
        throw new ScrumError('task-already-in-sprint', `task '${taskId}' already belongs to sprint '${task.sprintId}'`)
      }
    }
    // Validated BEFORE the id and the number are allocated (comp-53 R2).
    const goal = this.checkTitle('goal', this.requireTitle(input.goal), 'sprint')
    const id = await this.nextId('sprint', 'spr')
    const counters = this.global()
    const now = this.now()
    const sprint: Sprint = {
      id,
      number: counters.sprint,
      goal,
      releaseIds,
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
    const task = this.mustGetLive('tasks', taskId)
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
      delete next.doneAt
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
    return this.domain.table('tasks').update(taskId, (current) => {
      const next: Task = { ...current, status: column as Task['status'], updatedAt: this.now() }
      // Burndown stamp: entering done sets doneAt, leaving done clears it.
      if (column === 'done') next.doneAt = current.doneAt ?? this.now()
      else delete next.doneAt
      return next
    })
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

  /**
   * @returns the record, additionally required to be LIVE (neither trashed
   * nor archived); throws `not-found`, `in-trash` or `archived`.
   */
  private mustGetLive<N extends keyof ScrumDomainSpec['tables'] & string>(
    table: N, id: string,
  ): TableValueOf<ScrumDomainSpec, N> {
    const record = this.mustGet(table, id)
    const shelf = record as { deletedAt?: string; archivedAt?: string }
    if (shelf.deletedAt !== undefined) {
      throw new ScrumError('in-trash', `'${id}' is in the trash; restore it first`)
    }
    if (shelf.archivedAt !== undefined) {
      throw new ScrumError('archived', `'${id}' is archived; unarchive it first`)
    }
    return record
  }

  /**
   * @returns the record, required not to be in the trash — archived ones
   * pass (comp-49: read-only history); throws `not-found` or `in-trash`.
   */
  private mustGetNotTrashed<N extends keyof ScrumDomainSpec['tables'] & string>(
    table: N, id: string,
  ): TableValueOf<ScrumDomainSpec, N> {
    const record = this.mustGet(table, id)
    if ((record as { deletedAt?: string }).deletedAt !== undefined) {
      throw new ScrumError('in-trash', `'${id}' is in the trash; restore it first`)
    }
    return record
  }

  /** @returns the trimmed title or throws `invalid-input`. */
  private requireTitle(title: string): string {
    const trimmed = title.trim()
    if (trimmed.length === 0) throw new ScrumError('invalid-input', 'title must be non-empty')
    return trimmed
  }

  /** @returns the trimmed release name or throws `invalid-input` (comp-53 R3: now also on update). */
  private requireName(name: string): string {
    const trimmed = name.trim()
    if (trimmed.length === 0) throw new ScrumError('invalid-input', 'release name must be non-empty')
    return trimmed
  }

  /**
   * The title contract at every write of a title/goal (comp-53 R2): the text
   * is what will be stored (trimmed, prefix-free). Stateless — runs where
   * `requireTitle` runs, reads no current state.
   * @param kind - title or goal.
   * @param text - the text about to be stored.
   * @param where - what the refusal names: the item id on update, the level or the parent on create.
   * @returns `text` unchanged.
   * @throws ScrumError `title-contract` with every reason, `; `-joined.
   */
  private checkTitle(kind: TitleKind, text: string, where: string): string {
    const result = TitleContract.check(kind, text)
    if (!result.ok) throw new ScrumError('title-contract', `${where}: ${result.reasons.join('; ')}`)
    return text
  }

  /** @returns `value` narrowed to the allowed status set or throws. */
  private narrowStatus<S extends string>(value: string, allowed: readonly S[], id: string): S {
    if (!(allowed as readonly string[]).includes(value)) {
      throw new ScrumError('invalid-status', `'${value}' is not a valid status for '${id}' (${allowed.join(', ')})`)
    }
    return value as S
  }

  /**
   * @param value - a kind as the caller sent it (tools and the API hand strings).
   * @param where - what the message names: the parent component on creation, the task id on update.
   * @returns `value` narrowed to {@link TASK_KINDS} or throws `invalid-kind` (the empty string included).
   */
  private narrowKind(value: string, where: string): TaskKind {
    if (!(TASK_KINDS as readonly string[]).includes(value)) {
      const target = where.startsWith('task-') ? `'${where}'` : `a task under ${where}`
      throw new ScrumError('invalid-kind', `'${value}' is not a task kind for ${target} (${TASK_KINDS.join(', ')})`)
    }
    return value as TaskKind
  }

  /**
   * The ONE precedence rule for a task's title and kind (comp-45 R2), shared
   * by `createTask` (no current kind) and `updateItem` (the stored kind):
   * `narrowKind` → `splitKindPrefix` → prefix-only refused → contradicting
   * prefix refused → `requireTitle`. The prefix never reaches the stored
   * title; without an explicit kind it sets the kind; without either, the
   * current kind stays (or `other` on creation).
   * @param title - the incoming title, when any.
   * @param kind - the incoming kind, when any.
   * @param current - the stored kind (update) or undefined (creation).
   * @param where - what refusals name (component id on creation, task id on update).
   * @returns the resolved kind, plus the cleaned title whenever one came in.
   */
  private resolveTaskKind(title: string, kind: string | undefined, current: TaskKind | undefined, where: string): { title: string; kind: TaskKind }
  private resolveTaskKind(title: string | undefined, kind: string | undefined, current: TaskKind | undefined, where: string): { title?: string; kind: TaskKind }
  private resolveTaskKind(title: string | undefined, kind: string | undefined, current: TaskKind | undefined, where: string): { title?: string; kind: TaskKind } {
    const explicit = kind === undefined ? undefined : this.narrowKind(kind, where)
    if (title === undefined) return { kind: explicit ?? current ?? 'other' }
    const split = splitKindPrefix(title)
    if (split.prefixOnly) {
      throw new ScrumError('invalid-input', `title is only a kind prefix — add a title after [${split.matched}]`)
    }
    if (explicit !== undefined && split.matched !== undefined && split.matched !== explicit) {
      throw new ScrumError('kind-conflict', `title prefix [${split.matched}] contradicts kind ${explicit} — drop one`)
    }
    return { title: this.requireTitle(split.title), kind: explicit ?? split.matched ?? current ?? 'other' }
  }

  /**
   * Validate one WIP-limits patch: keys must be board columns, values
   * non-negative integers; zero entries are dropped (removing that limit).
   * @returns the cleaned limits map (possibly empty = remove all).
   */
  private narrowWipLimits(input: Record<string, number>, id: string): WipLimits {
    const limits: WipLimits = {}
    for (const [column, value] of Object.entries(input)) {
      if (!(BOARD_COLUMNS as readonly string[]).includes(column)) {
        throw new ScrumError('invalid-column', `'${column}' is not a board column of '${id}' (${BOARD_COLUMNS.join(', ')})`)
      }
      if (!Number.isInteger(value) || value < 0) {
        throw new ScrumError('invalid-input', `wip limit for '${column}' must be a non-negative integer`)
      }
      if (value > 0) limits[column as keyof WipLimits] = value
    }
    return limits
  }
}

/**
 * The `ctx.scrum` service: a lazy registry of per-workspace boards. Each
 * distinct workspace path maps (canonical path → stable hashed name) to its
 * own storage domain, opened on first use and cached; sessions or requests
 * without a workspace share the global fallback board. All open boards close
 * with the plugin.
 */
export class ScrumService extends Service {
  static inject = ['storageDomain']

  /** Open (or opening) boards by domain name; a failed open is retried. */
  private readonly boards = new Map<string, Promise<ScrumBoard>>()

  /**
   * @param ctx - owning Cordis context.
   */
  constructor(ctx: Context) {
    super(ctx, 'scrum')
  }

  /** Registers the disposer that closes every opened board with the plugin. */
  protected [Service.init](): void {
    this.ctx.effect(() => () => {
      const open = [...this.boards.values()]
      this.boards.clear()
      return Promise.all(open.map(async (entry) => {
        const board = await entry.catch(() => undefined)
        await board?.close()
      })).then(() => undefined)
    }, 'scrum.boardsClose')
  }

  /**
   * Resolve the SCRUM board of one workspace (or the global fallback board).
   * Boards open lazily and are cached per domain name; concurrent callers of
   * the same workspace share one open.
   * @param cwd - workspace directory; undefined/empty selects the global board.
   * @returns the board handle.
   */
  board(cwd?: string): Promise<ScrumBoard> {
    const name = boardNameOf(cwd)
    const cached = this.boards.get(name)
    if (cached !== undefined) return cached
    const opening = this.ctx.storageDomain
      .open(scrumDomainSpec(name))
      .then(domain => new ScrumBoard(domain))
    // A failed open leaves the map so the next call can retry cleanly.
    opening.catch(() => { this.boards.delete(name) })
    this.boards.set(name, opening)
    return opening
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The SCRUM board registry (one board per workspace + global fallback). */
    scrum: ScrumService
  }
}
