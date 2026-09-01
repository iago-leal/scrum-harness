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
import {
  BOARD_COLUMNS,
  COMPONENT_STATUSES,
  FEATURE_STATUSES,
  INITIAL_COUNTERS,
  RELEASE_STATUSES,
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
  WipLimits,
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

/** Editable fields of any node, applied by {@link ScrumBoard.updateItem}. */
export interface UpdateItemInput {
  title?: string
  description?: string
  estimate?: number
  targetDate?: string
  status?: string
  goal?: string
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

/** The whole hierarchy as nested data, for tools and the web board. */
export interface ScrumTree {
  releases: (Release & {
    features: (Feature & {
      components: (Component & { tasks: Task[] })[]
    })[]
  })[]
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
  sprint: Sprint
  tasks: Task[]
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
  /** Serializes id allocation (global counter read-modify-write). */
  private idChain: Promise<unknown> = Promise.resolve()

  /**
   * @param domain - the opened SCRUM domain this board reads and writes.
   */
  constructor(private readonly domain: Domain<ScrumDomainSpec>) {}

  /** Close the underlying domain (service disposer calls this). */
  async close(): Promise<void> {
    await this.domain.close()
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
    this.mustGetLive('releases', input.releaseId)
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
    this.mustGetLive('features', input.featureId)
    const id = await this.nextId('component', 'comp')
    const now = this.now()
    const component: Component = {
      id,
      featureId: input.featureId,
      title: this.requireTitle(input.title),
      ...input.description === undefined ? {} : { description: input.description },
      status: 'proposed',
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
      // Trashed tasks leave the sprint views; archived DONE tasks stay: they
      // are history and keep counting in the totals of completed sprints.
      .filter(t => t.sprintId === sprint.id && t.deletedAt === undefined)
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
      this.mustGetLive('releases', id)
      return this.domain.table('releases').update(id, current => ({
        ...current,
        ...patch.title === undefined ? {} : { name: patch.title },
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
        ...patch.title === undefined ? {} : { title: this.requireTitle(patch.title) },
        ...patch.description === undefined ? {} : { description: patch.description },
        ...patch.status === undefined ? {} : { status: this.narrowStatus(patch.status, FEATURE_STATUSES, id) },
        ...stamp,
      }))
    }
    if (id.startsWith('comp-')) {
      this.mustGetLive('components', id)
      return this.domain.table('components').update(id, current => ({
        ...current,
        ...patch.title === undefined ? {} : { title: this.requireTitle(patch.title) },
        ...patch.description === undefined ? {} : { description: patch.description },
        ...patch.status === undefined ? {} : { status: this.narrowStatus(patch.status, COMPONENT_STATUSES, id) },
        ...stamp,
      }))
    }
    if (id.startsWith('task-')) {
      this.mustGetLive('tasks', id)
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
      const releaseIds = this.narrowReleaseLinks(patch)
      const wipLimits = patch.wipLimits === undefined ? undefined : this.narrowWipLimits(patch.wipLimits, id)
      return this.domain.table('sprints').update(id, (current) => {
        const next: Sprint = {
          ...current,
          ...patch.goal === undefined ? {} : { goal: this.requireTitle(patch.goal) },
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
    const id = await this.nextId('sprint', 'spr')
    const counters = this.domain.global.get() ?? INITIAL_COUNTERS
    const now = this.now()
    const sprint: Sprint = {
      id,
      number: counters.sprint,
      goal: this.requireTitle(input.goal),
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
