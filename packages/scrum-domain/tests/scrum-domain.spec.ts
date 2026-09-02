/**
 * Integration tests of the ScrumService business rules over the real storage
 * stack: cordis Context + storage hub + storage-json backend (temp dir) +
 * storage-domain facility. No mocks — writes reach real JSON files.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageMemory from '@scrum-harness/test-support/src/index.ts'
import { ScrumService, ScrumError } from '../src/service.ts'
import type { ScrumBoard } from '../src/service.ts'
import { boardNameOf, GLOBAL_BOARD_NAME } from '../src/boards.ts'
import { componentSchema, sprintSchema, taskSchema } from '../src/spec.ts'

// Test infrastructure (comp-50 R5): ONE Context per file over the in-memory
// backend (real hub + storage-domain + ScrumService; only the medium is a
// Map — the JSON backend's fsync per mutation was the suite's wall time),
// and one fresh board per test: the per-workspace boards of v0.5 give the
// isolation (own unit, own id counters), so tests never share state and
// never touch the global board unless they say so explicitly. Only the
// lifecycle suite (close/reopen) builds its own Context on the JSON backend —
// durability is what it proves.

/** Open the real storage stack + ScrumService on a JSON root (durable medium). */
async function openJsonStack(jsonRoot: string): Promise<Context> {
  const context = new Context()
  await context.plugin(Storage)
  await context.plugin(StorageJson, { root: jsonRoot })
  await context.plugin(StorageDomain, { backend: 'json' })
  await context.plugin(ScrumService)
  return context
}

/** Open the same stack over the in-memory backend. */
async function openMemoryStack(): Promise<Context> {
  const context = new Context()
  await context.plugin(Storage)
  await context.plugin(StorageMemory)
  await context.plugin(StorageDomain, { backend: StorageMemory.MEMORY_BACKEND })
  await context.plugin(ScrumService)
  return context
}

/** A path prefix for the boards of this file (never touches the disk). */
const root = join(tmpdir(), 'scrum-domain-boards')
let ctx: Context
/** The board of the CURRENT test — fresh for every `it`. */
let scrum: ScrumBoard
let boards = 0

/** A never-used workspace path → a brand-new board (canonicalized, need not exist). */
function freshBoard(): Promise<ScrumBoard> {
  return ctx.scrum.board(join(root, `ws-${++boards}`))
}

beforeAll(async () => {
  ctx = await openMemoryStack()
})

afterAll(async () => {
  await ctx.dispose?.()
})

beforeEach(async () => {
  scrum = await freshBoard()
})

/** Creates rel > feat > comp and returns the component id. */
async function seedComponent(): Promise<string> {
  const release = await scrum.createRelease({ name: 'v1.0' })
  const feature = await scrum.createFeature({ releaseId: release.id, title: 'Login' })
  const component = await scrum.createComponent({ featureId: feature.id, title: 'OAuth flow' })
  return component.id
}

describe('hierarchy', () => {
  it('creates the four levels with short sequential ids', async () => {
    const release = await scrum.createRelease({ name: 'v1.0', description: 'first' })
    expect(release.id).toBe('rel-1')
    const feature = await scrum.createFeature({ releaseId: release.id, title: 'Login' })
    expect(feature.id).toBe('feat-1')
    const component = await scrum.createComponent({ featureId: feature.id, title: 'OAuth' })
    expect(component.id).toBe('comp-1')
    const task = await scrum.createTask({ componentId: component.id, title: 'Token refresh', estimate: 3 })
    expect(task.id).toBe('task-1')
    expect(task.status).toBe('backlog')

    const tree = scrum.tree()
    expect(tree.releases).toHaveLength(1)
    expect(tree.releases[0]!.features[0]!.components[0]!.tasks[0]!.title).toBe('Token refresh')
  })

  it('rejects children of missing parents', async () => {
    await expect(scrum.createFeature({ releaseId: 'rel-9', title: 'x' }))
      .rejects.toThrow(ScrumError)
    await expect(scrum.createTask({ componentId: 'comp-9', title: 'x' }))
      .rejects.toMatchObject({ code: 'not-found' })
  })

  it('updates by id prefix and validates statuses', async () => {
    const componentId = await seedComponent()
    const task = await scrum.createTask({ componentId, title: 'a' })
    const updated = await scrum.updateItem(task.id, { title: 'renamed', estimate: 5 })
    expect(updated).toMatchObject({ title: 'renamed', estimate: 5 })
    await expect(scrum.updateItem('rel-1', { status: 'bogus' }))
      .rejects.toMatchObject({ code: 'invalid-status' })
    await expect(scrum.updateItem('zzz-1', {}))
      .rejects.toMatchObject({ code: 'invalid-id' })
  })

  it('refuses non-cascade deletion of a parent with children, cascades on request', async () => {
    const componentId = await seedComponent()
    await scrum.createTask({ componentId, title: 'a' })
    await expect(scrum.deleteItem('rel-1')).rejects.toMatchObject({ code: 'has-children' })
    const deleted = await scrum.deleteItem('rel-1', true)
    expect(deleted).toEqual(['rel-1', 'feat-1', 'comp-1', 'task-1'])
    expect(scrum.tree().releases).toHaveLength(0)
  })
})

describe('workflows (multi-level states)', () => {
  it('components start proposed and walk their own workflow', async () => {
    const componentId = await seedComponent()
    expect(scrum.tree().releases[0]!.features[0]!.components[0]!.status).toBe('proposed')

    const started = await scrum.updateItem(componentId, { status: 'in_progress' })
    expect(started).toMatchObject({ status: 'in_progress' })
    // Since comp-47, `done` only through the spiral's exit gate (see 'done gate').
    await toValidation(componentId)
    const finished = await scrum.updateItem(componentId, { status: 'done', validation: VALID_VALIDATION })
    expect(finished).toMatchObject({ status: 'done' })

    await expect(scrum.updateItem(componentId, { status: 'committed' }))
      .rejects.toMatchObject({ code: 'invalid-status' })
  })

  it('features accept the in_progress state', async () => {
    await seedComponent()
    const updated = await scrum.updateItem('feat-1', { status: 'in_progress' })
    expect(updated).toMatchObject({ status: 'in_progress' })
    await expect(scrum.updateItem('feat-1', { status: 'active' }))
      .rejects.toMatchObject({ code: 'invalid-status' })
  })

  it('v0.3 media without component status parses as proposed (no version bump)', () => {
    const legacy = {
      id: 'comp-9',
      featureId: 'feat-9',
      title: 'written before v0.4',
      order: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(componentSchema.parse(legacy).status).toBe('proposed')
  })
})

describe('sprints', () => {
  it('plans, starts, moves on the board, and ends returning unfinished tasks', async () => {
    const componentId = await seedComponent()
    const a = await scrum.createTask({ componentId, title: 'a', estimate: 2 })
    const b = await scrum.createTask({ componentId, title: 'b', estimate: 3 })

    const sprint = await scrum.planSprint({ goal: 'Ship login', taskIds: [a.id, b.id] })
    expect(sprint.status).toBe('planned')
    expect(sprint.number).toBe(1)

    await scrum.startSprint(sprint.id)
    expect(scrum.activeSprint()?.id).toBe(sprint.id)

    await scrum.moveTask(a.id, 'in_progress')
    await scrum.moveTask(a.id, 'done')
    const status = scrum.sprintStatus()
    expect(status.totals).toMatchObject({ tasks: 2, done: 1, points: 5, pointsDone: 2 })

    const { returnedToBacklog } = await scrum.endSprint()
    expect(returnedToBacklog).toEqual([b.id])
    const tree = scrum.tree()
    const tasks = tree.releases[0]!.features[0]!.components[0]!.tasks
    expect(tasks.find(t => t.id === a.id)).toMatchObject({ status: 'done', sprintId: sprint.id })
    expect(tasks.find(t => t.id === b.id)!.status).toBe('backlog')
    expect(tasks.find(t => t.id === b.id)!.sprintId).toBeUndefined()
  })

  it('allows at most one active sprint', async () => {
    const s1 = await scrum.planSprint({ goal: 'one' })
    const s2 = await scrum.planSprint({ goal: 'two' })
    await scrum.startSprint(s1.id)
    await expect(scrum.startSprint(s2.id)).rejects.toMatchObject({ code: 'sprint-already-active' })
  })

  it('rejects board moves for tasks outside the active sprint', async () => {
    const componentId = await seedComponent()
    const task = await scrum.createTask({ componentId, title: 'loose' })
    await expect(scrum.moveTask(task.id, 'done'))
      .rejects.toMatchObject({ code: 'task-not-in-active-sprint' })
    await expect(scrum.moveTask(task.id, 'sideways'))
      .rejects.toMatchObject({ code: 'invalid-column' })
  })

  it('links sprints to releases at planning, relinks and unlinks later', async () => {
    const release = await scrum.createRelease({ name: 'v1.0' })
    const other = await scrum.createRelease({ name: 'v2.0' })

    await expect(scrum.planSprint({ goal: 'g', releaseId: 'rel-9' }))
      .rejects.toMatchObject({ code: 'not-found' })

    const sprint = await scrum.planSprint({ goal: 'Ship v1', releaseId: release.id })
    expect(sprint.releaseIds).toEqual([release.id])
    expect(scrum.sprintsOfRelease(release.id).map(s => s.id)).toEqual([sprint.id])
    expect(scrum.releaseNames().get(release.id)).toBe('v1.0')

    const relinked = await scrum.updateItem(sprint.id, { releaseId: other.id })
    expect(relinked).toMatchObject({ releaseIds: [other.id] })
    await expect(scrum.updateItem(sprint.id, { releaseId: 'rel-9' }))
      .rejects.toMatchObject({ code: 'not-found' })

    const unlinked = await scrum.updateItem(sprint.id, { releaseId: '' })
    expect((unlinked as { releaseIds: string[] }).releaseIds).toEqual([])
  })

  it('links one sprint to MANY releases, replacing and validating the whole set', async () => {
    const v1 = await scrum.createRelease({ name: 'v1.0' })
    const v2 = await scrum.createRelease({ name: 'v2.0' })
    const v3 = await scrum.createRelease({ name: 'v3.0' })

    // Plan with the whole set (deduplicated) and read it back from both ends.
    const sprint = await scrum.planSprint({ goal: 'dupla', releaseIds: [v1.id, v2.id, v1.id] })
    expect(sprint.releaseIds).toEqual([v1.id, v2.id])
    expect(scrum.sprintsOfRelease(v1.id).map(s => s.id)).toEqual([sprint.id])
    expect(scrum.sprintsOfRelease(v2.id).map(s => s.id)).toEqual([sprint.id])

    // releaseIds REPLACES the set and wins over the single-link shortcut.
    const replaced = await scrum.updateItem(sprint.id, { releaseIds: [v3.id], releaseId: v1.id })
    expect(replaced).toMatchObject({ releaseIds: [v3.id] })

    // Every id of the set is validated against live releases.
    await expect(scrum.planSprint({ goal: 'x', releaseIds: [v1.id, 'rel-9'] }))
      .rejects.toMatchObject({ code: 'not-found' })
    await expect(scrum.updateItem(sprint.id, { releaseIds: ['rel-9'] }))
      .rejects.toMatchObject({ code: 'not-found' })

    // Empty array unlinks everything.
    const cleared = await scrum.updateItem(sprint.id, { releaseIds: [] })
    expect((cleared as { releaseIds: string[] }).releaseIds).toEqual([])
  })

  it('folds legacy single-link media into releaseIds on parse (no version bump)', () => {
    const legacy = {
      id: 'spr-1', number: 1, goal: 'old media', releaseId: 'rel-7',
      status: 'completed', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(sprintSchema.parse(legacy)).toMatchObject({ releaseIds: ['rel-7'] })
    expect('releaseId' in sprintSchema.parse(legacy)).toBe(false)
    // Media with neither field loads as unlinked; canonical form passes through.
    const { releaseId: _dropped, ...unlinked } = legacy
    expect(sprintSchema.parse(unlinked).releaseIds).toEqual([])
    expect(sprintSchema.parse({ ...unlinked, releaseIds: ['rel-1', 'rel-2'] }).releaseIds)
      .toEqual(['rel-1', 'rel-2'])
  })

  it('trashing a release keeps sprint links; only purge unlinks them', async () => {
    const release = await scrum.createRelease({ name: 'v1.0' })
    const keeper = await scrum.createRelease({ name: 'keeper' })
    const sprint = await scrum.planSprint({ goal: 'g', releaseIds: [release.id, keeper.id] })
    await scrum.deleteItem(release.id, true)
    // Soft delete is reversible, so the link survives with it.
    expect(scrum.sprints().find(s => s.id === sprint.id)!.releaseIds).toContain(release.id)
    await scrum.purgeItem(release.id)
    const survivor = scrum.sprints().find(s => s.id === sprint.id)
    expect(survivor).toBeDefined()
    // Only the purged id leaves the set; remaining links survive.
    expect(survivor!.releaseIds).toEqual([keeper.id])
  })

  it('assigns and removes tasks from a planned sprint', async () => {
    const componentId = await seedComponent()
    const task = await scrum.createTask({ componentId, title: 'a' })
    const sprint = await scrum.planSprint({ goal: 'g' })
    const added = await scrum.assignTask(sprint.id, task.id, 'add')
    expect(added).toMatchObject({ sprintId: sprint.id, status: 'todo' })
    await expect(scrum.assignTask(sprint.id, task.id, 'add'))
      .rejects.toMatchObject({ code: 'task-already-in-sprint' })
    const removed = await scrum.assignTask(sprint.id, task.id, 'remove')
    expect(removed.status).toBe('backlog')
    expect(removed.sprintId).toBeUndefined()
  })
})

describe('trash', () => {
  it('soft deletes: the item leaves the tree but sits in the trash, restorable', async () => {
    const componentId = await seedComponent()
    const task = await scrum.createTask({ componentId, title: 'oops', estimate: 3 })
    const trashed = await scrum.deleteItem(task.id)
    expect(trashed).toEqual([task.id])

    expect(scrum.tree().releases[0]!.features[0]!.components[0]!.tasks).toHaveLength(0)
    expect(scrum.trash().tasks.map(t => t.id)).toEqual([task.id])

    const restored = await scrum.restoreItem(task.id)
    expect(restored).toEqual([task.id])
    expect(scrum.trash().tasks).toHaveLength(0)
    expect(scrum.tree().releases[0]!.features[0]!.components[0]!.tasks[0]).toMatchObject({ id: task.id, estimate: 3 })
  })

  it('restores a cascade as one unit and revives shelved ancestors', async () => {
    const componentId = await seedComponent()
    const early = await scrum.createTask({ componentId, title: 'deleted earlier' })
    await scrum.deleteItem(early.id)
    const late = await scrum.createTask({ componentId, title: 'deleted with the release' })

    await scrum.deleteItem('rel-1', true)
    expect(scrum.tree().releases).toHaveLength(0)

    // Restoring the task revives its component/feature/release chain and the
    // same-operation cascade — but NOT the independently deleted sibling.
    const revived = await scrum.restoreItem(late.id)
    expect(revived).toEqual(expect.arrayContaining(['rel-1', 'feat-1', componentId, late.id]))
    expect(scrum.tree().releases).toHaveLength(1)
    expect(scrum.trash().tasks.map(t => t.id)).toEqual([early.id])
  })

  it('purges only from the trash, physically and with the trashed subtree', async () => {
    const componentId = await seedComponent()
    const task = await scrum.createTask({ componentId, title: 'a' })
    await expect(scrum.purgeItem(task.id)).rejects.toMatchObject({ code: 'not-in-trash' })

    await scrum.deleteItem('rel-1', true)
    const purged = await scrum.purgeItem('rel-1')
    expect(purged).toEqual(['rel-1', 'feat-1', componentId, task.id])
    expect(scrum.trash().releases).toHaveLength(0)
    await expect(scrum.restoreItem(task.id)).rejects.toMatchObject({ code: 'not-found' })
  })

  it('empties the whole trash at once', async () => {
    const componentId = await seedComponent()
    const a = await scrum.createTask({ componentId, title: 'a' })
    const b = await scrum.createTask({ componentId, title: 'b' })
    await scrum.deleteItem(a.id)
    await scrum.deleteItem(b.id)
    const purged = await scrum.emptyTrash()
    expect(purged.sort()).toEqual([a.id, b.id].sort())
    expect(scrum.trash().tasks).toHaveLength(0)
  })

  it('guards: active-sprint tasks stay, trashed items refuse edits and re-selection', async () => {
    const componentId = await seedComponent()
    const task = await scrum.createTask({ componentId, title: 'a' })
    const sprint = await scrum.planSprint({ goal: 'g', taskIds: [task.id] })
    await scrum.startSprint(sprint.id)
    await expect(scrum.deleteItem(task.id)).rejects.toMatchObject({ code: 'task-in-active-sprint' })
    await expect(scrum.deleteItem(componentId, true)).rejects.toMatchObject({ code: 'task-in-active-sprint' })
    await scrum.endSprint()

    await scrum.deleteItem(task.id)
    await expect(scrum.deleteItem(task.id)).rejects.toMatchObject({ code: 'in-trash' })
    await expect(scrum.updateItem(task.id, { title: 'x' })).rejects.toMatchObject({ code: 'in-trash' })
    await expect(scrum.planSprint({ goal: 'h', taskIds: [task.id] })).rejects.toMatchObject({ code: 'in-trash' })
    await expect(scrum.createTask({ componentId: 'comp-9', title: 'x' })).rejects.toMatchObject({ code: 'not-found' })
  })

  it('trashing a not-yet-done task drops it from its planned sprint first', async () => {
    const componentId = await seedComponent()
    const task = await scrum.createTask({ componentId, title: 'a' })
    const sprint = await scrum.planSprint({ goal: 'g', taskIds: [task.id] })
    await scrum.deleteItem(task.id)
    const trashed = scrum.trash().tasks[0]!
    expect(trashed.sprintId).toBeUndefined()
    expect(trashed.status).toBe('backlog')
    expect(scrum.sprintStatus(sprint.id).totals.tasks).toBe(0)
  })
})

describe('archive', () => {
  it('archives concluded work out of the tree and unarchives it back', async () => {
    const componentId = await seedComponent()
    const task = await scrum.createTask({ componentId, title: 'shipped' })
    const archived = await scrum.archiveItem(task.id)
    expect(archived).toEqual([task.id])
    expect(scrum.tree().releases[0]!.features[0]!.components[0]!.tasks).toHaveLength(0)
    expect(scrum.archive().tasks.map(t => t.id)).toEqual([task.id])
    await expect(scrum.archiveItem(task.id)).rejects.toMatchObject({ code: 'already-archived' })

    const revived = await scrum.unarchiveItem(task.id)
    expect(revived).toEqual([task.id])
    expect(scrum.archive().tasks).toHaveLength(0)
    expect(scrum.tree().releases[0]!.features[0]!.components[0]!.tasks).toHaveLength(1)
  })

  it('archived done tasks keep counting in completed-sprint totals', async () => {
    const componentId = await seedComponent()
    const task = await scrum.createTask({ componentId, title: 'a', estimate: 5 })
    const sprint = await scrum.planSprint({ goal: 'g', taskIds: [task.id] })
    await scrum.startSprint(sprint.id)
    await scrum.moveTask(task.id, 'done')
    await expect(scrum.archiveItem(task.id)).rejects.toMatchObject({ code: 'task-in-active-sprint' })
    await scrum.endSprint()

    const archived = await scrum.archiveCompleted()
    expect(archived).toEqual([task.id])
    expect(scrum.sprintStatus(sprint.id).totals).toMatchObject({ tasks: 1, done: 1, pointsDone: 5 })
    expect(scrum.tree().releases[0]!.features[0]!.components[0]!.tasks).toHaveLength(0)
  })

  it('trash wins over archive, and delete clears the archive flag', async () => {
    const componentId = await seedComponent()
    const task = await scrum.createTask({ componentId, title: 'a' })
    await scrum.archiveItem(task.id)
    await scrum.deleteItem(task.id)
    expect(scrum.archive().tasks).toHaveLength(0)
    expect(scrum.trash().tasks.map(t => t.id)).toEqual([task.id])
    const restored = await scrum.restoreItem(task.id)
    expect(restored).toEqual([task.id])
    // Restore lands LIVE (not back in the archive).
    expect(scrum.tree().releases[0]!.features[0]!.components[0]!.tasks).toHaveLength(1)
  })
})

describe('ceremonies', () => {
  it('records against the active sprint by default and lists in order', async () => {
    const sprint = await scrum.planSprint({ goal: 'g' })
    await scrum.startSprint(sprint.id)
    await scrum.recordCeremony({
      type: 'standup',
      author: 'ana',
      notes: [{ category: 'progress', text: 'auth done' }, { category: 'impediment', text: 'flaky CI' }],
    })
    await scrum.recordCeremony({
      type: 'retrospective',
      notes: [{ category: 'went-well', text: 'pairing' }],
    })
    const all = scrum.ceremonies(sprint.id)
    expect(all).toHaveLength(2)
    expect(all[0]!.type).toBe('standup')
    expect(all[1]!.notes[0]!.category).toBe('went-well')
  })

  it('requires an explicit sprint when none is active and at least one note', async () => {
    await expect(scrum.recordCeremony({ type: 'standup', notes: [{ category: 'x', text: 'y' }] }))
      .rejects.toMatchObject({ code: 'not-found' })
    const sprint = await scrum.planSprint({ goal: 'g' })
    await expect(scrum.recordCeremony({ type: 'review', sprintId: sprint.id, notes: [] }))
      .rejects.toMatchObject({ code: 'invalid-input' })
  })
})

// Lifecycle suites own their Context (they dispose and reopen it) on a
// separate JSON root; the module-level ctx/scrum are never reassigned (R5 c).
describe('persistence', () => {
  let lifeRoot: string
  let life: Context

  beforeEach(async () => {
    lifeRoot = mkdtempSync(join(tmpdir(), 'scrum-domain-life-'))
    life = await openJsonStack(lifeRoot)
  })

  afterEach(async () => {
    await life.dispose?.()
    rmSync(lifeRoot, { recursive: true, force: true })
  })

  it('survives a full close/reopen cycle on the same JSON medium', async () => {
    const board = await life.scrum.board()
    const release = await board.createRelease({ name: 'v1.0' })
    const feature = await board.createFeature({ releaseId: release.id, title: 'Login' })
    const component = await board.createComponent({ featureId: feature.id, title: 'OAuth flow' })
    await board.createTask({ componentId: component.id, title: 'durable' })
    await life.dispose?.()

    life = await openJsonStack(lifeRoot)
    const reopened = await life.scrum.board()
    const tree = reopened.tree()
    expect(tree.releases[0]!.features[0]!.components[0]!.tasks[0]!.title).toBe('durable')
    // Counters survive too: the next task id continues the sequence.
    const next = await reopened.createTask({ componentId: component.id, title: 'second' })
    expect(next.id).toBe('task-2')
  })

  it('per-workspace boards survive close/reopen on their own media', async () => {
    const cwd = join(lifeRoot, 'projeto-a')
    const boardA = await life.scrum.board(cwd)
    const release = await boardA.createRelease({ name: 'durável' })
    await life.dispose?.()

    life = await openJsonStack(lifeRoot)
    const reopened = await life.scrum.board(cwd)
    expect(reopened.tree().releases.map(r => r.id)).toEqual([release.id])
    expect((await life.scrum.board()).tree().releases).toHaveLength(0)
  })
})

describe('burndown & wip (v0.6)', () => {
  it('stamps doneAt entering done, clears it leaving done or the sprint', async () => {
    const componentId = await seedComponent()
    const task = await scrum.createTask({ componentId, title: 'a', estimate: 3 })
    const sprint = await scrum.planSprint({ goal: 'g', taskIds: [task.id] })
    await scrum.startSprint(sprint.id)

    const done = await scrum.moveTask(task.id, 'done')
    expect(done.doneAt).toBeDefined()
    // Moving within done keeps the original stamp.
    expect((await scrum.moveTask(task.id, 'done')).doneAt).toBe(done.doneAt)

    const reopened = await scrum.moveTask(task.id, 'review')
    expect(reopened.doneAt).toBeUndefined()

    await scrum.moveTask(task.id, 'done')
    const removed = await scrum.assignTask(sprint.id, task.id, 'remove')
    expect(removed.doneAt).toBeUndefined()
    expect(removed.status).toBe('backlog')
  })

  it('validates and stores per-column WIP limits on sprints', async () => {
    const sprint = await scrum.planSprint({ goal: 'g' })
    const limited = await scrum.updateItem(sprint.id, { wipLimits: { in_progress: 3, review: 2 } })
    expect((limited as { wipLimits?: unknown }).wipLimits).toEqual({ in_progress: 3, review: 2 })

    // Zero drops one column; an empty map removes the field entirely.
    const dropped = await scrum.updateItem(sprint.id, { wipLimits: { in_progress: 3, review: 0 } })
    expect((dropped as { wipLimits?: unknown }).wipLimits).toEqual({ in_progress: 3 })
    const cleared = await scrum.updateItem(sprint.id, { wipLimits: {} })
    expect((cleared as { wipLimits?: unknown }).wipLimits).toBeUndefined()

    await expect(scrum.updateItem(sprint.id, { wipLimits: { sideways: 2 } }))
      .rejects.toMatchObject({ code: 'invalid-column' })
    await expect(scrum.updateItem(sprint.id, { wipLimits: { todo: 1.5 } }))
      .rejects.toMatchObject({ code: 'invalid-input' })
  })
})

describe('boards per workspace (v0.5)', () => {
  it('derives stable names: canonical path variants agree, workspaces differ, no cwd is global', () => {
    const base = join(root, 'ws-a')
    expect(boardNameOf(base)).toBe(boardNameOf(`${base}/`))
    expect(boardNameOf(base)).toBe(boardNameOf(join(root, 'ws-a', 'sub', '..')))
    expect(boardNameOf(base)).not.toBe(boardNameOf(join(root, 'ws-b')))
    expect(boardNameOf(undefined)).toBe(GLOBAL_BOARD_NAME)
    expect(boardNameOf('  ')).toBe(GLOBAL_BOARD_NAME)
    expect(boardNameOf(base)).toMatch(/^scrum_ws_[0-9a-f]{12}$/)
  })

  it('isolates boards: each workspace has its own hierarchy, ids and sprints', async () => {
    const boardA = await ctx.scrum.board(join(root, 'projeto-a'))
    const boardB = await ctx.scrum.board(join(root, 'projeto-b'))

    const releaseA = await boardA.createRelease({ name: 'A v1' })
    // Ids count per board: both first releases are rel-1.
    const releaseB = await boardB.createRelease({ name: 'B v1' })
    expect(releaseA.id).toBe('rel-1')
    expect(releaseB.id).toBe('rel-1')

    expect(boardA.tree().releases.map(r => r.name)).toEqual(['A v1'])
    expect(boardB.tree().releases.map(r => r.name)).toEqual(['B v1'])
    // The global board sees neither (no shared-Context test ever writes to it — R5 b).
    expect((await ctx.scrum.board()).tree().releases).toHaveLength(0)

    // Sprints are independent: both boards can have an active sprint at once.
    const sprintA = await boardA.planSprint({ goal: 'a' })
    const sprintB = await boardB.planSprint({ goal: 'b' })
    await boardA.startSprint(sprintA.id)
    await boardB.startSprint(sprintB.id)
    expect(boardA.activeSprint()?.id).toBe(sprintA.id)
    expect(boardB.activeSprint()?.id).toBe(sprintB.id)
  })

  it('caches: the same workspace resolves the same board handle', async () => {
    const first = await ctx.scrum.board(join(root, 'projeto-a'))
    const again = await ctx.scrum.board(`${join(root, 'projeto-a')}/`)
    expect(again).toBe(first)
    const global1 = await ctx.scrum.board()
    expect(await ctx.scrum.board()).toBe(global1)
    expect(global1).not.toBe(scrum)
  })
})

// ── v0.12: the spiral engine (comp-42) ────────────────────────────────────
//
// Written BEFORE the implementation (TDD): every case here maps to a
// requirement of comp-42 (R1–R9) and must fail until spec.ts/service.ts
// grow phase, artifacts, phaseLog and the gates.

/** The component record as the tree currently holds it. */
function componentOf(id: string) {
  for (const release of scrum.tree().releases) {
    for (const feature of release.features) {
      const found = feature.components.find(c => c.id === id)
      if (found !== undefined) return found
    }
  }
  throw new Error(`component ${id} not in tree`)
}

/** An approved v1 requirements artifact (the review contract of comp-48 needs the frontmatter). */
const CONTRACT_REQ = '---\nversion: 1\nstatus: approved\n---\nR1 — the component must work.'

/** An approved round-1 review covering CONTRACT_REQ (digest from the contract). */
function contractReview(digest: string): string {
  return `---\nreviewer: subagent\nreviewed_version: 1\nreviewed_digest: ${digest}\nverdict: approved\nround: 1\nfindings: { high: 0, medium: 0, low: 0 }\n---\nNo blocking finding.`
}

/** Fill the two artifacts the first gate needs (per the review contract) and advance to design. */
async function toDesign(id: string) {
  await scrum.updateItem(id, { requirements: CONTRACT_REQ })
  await scrum.updateItem(id, { requirementsReview: contractReview(scrum.reviewBrief(id).requirements.digest) })
  return scrum.advancePhase(id)
}

/**
 * Carry a component to `tdd` with one task under it. Since comp-45 the tdd
 * gate wants a test task first, so the fixture task is born `[test]`.
 */
async function toTdd(id: string) {
  await toDesign(id)
  await scrum.updateItem(id, { design: 'erDiagram …' })
  await scrum.advancePhase(id)
  return scrum.createTask({ componentId: id, title: '[test] first task' })
}

/** Plan+start a sprint with the tasks and move them all to done. */
async function finish(taskIds: string[]) {
  const sprint = await scrum.planSprint({ goal: 'g', taskIds })
  await scrum.startSprint(sprint.id)
  for (const taskId of taskIds) await scrum.moveTask(taskId, 'done')
  await scrum.endSprint()
}

describe('spiral phases (R1, R2, R7)', () => {
  it('new components start at requirements with an empty phaseLog', async () => {
    const id = await seedComponent()
    expect(componentOf(id)).toMatchObject({ phase: 'requirements', phaseLog: [] })
  })

  it('migrates legacy media on parse: done → validation, otherwise requirements (R1)', () => {
    const base = {
      id: 'comp-1', featureId: 'feat-1', title: 'old', order: 0,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(componentSchema.parse({ ...base, status: 'done' })).toMatchObject({ phase: 'validation', phaseLog: [] })
    expect(componentSchema.parse({ ...base, status: 'in_progress' })).toMatchObject({ phase: 'requirements' })
    expect(componentSchema.parse({ ...base })).toMatchObject({ status: 'proposed', phase: 'requirements' })
    // Canonical media passes through untouched.
    const log = [{ from: 'requirements', to: 'design', at: '2026-01-02T00:00:00.000Z' }]
    expect(componentSchema.parse({ ...base, status: 'in_progress', phase: 'design', phaseLog: log }))
      .toMatchObject({ phase: 'design', phaseLog: log })
  })

  it('stores the four artifacts through updateItem; the empty string deletes one (R2)', async () => {
    const id = await seedComponent()
    const set = await scrum.updateItem(id, {
      requirements: 'R1', requirementsReview: 'ok', design: 'D', validation: 'V',
    })
    expect(set).toMatchObject({ requirements: 'R1', requirementsReview: 'ok', design: 'D', validation: 'V' })
    const cleared = await scrum.updateItem(id, { design: '' })
    expect('design' in cleared).toBe(false)
    expect(cleared).toMatchObject({ requirements: 'R1' })
  })

  it('promotes a proposed component to in_progress on its first advance (R7)', async () => {
    const id = await seedComponent()
    expect(componentOf(id).status).toBe('proposed')
    const advanced = await toDesign(id)
    expect(advanced).toMatchObject({ status: 'in_progress', phase: 'design' })
  })

  it('refuses setPhase on a done component and on shelved ones (R7)', async () => {
    const id = await seedComponent()
    await toValidation(id)
    await scrum.updateItem(id, { status: 'done', validation: VALID_VALIDATION })
    await expect(scrum.setPhase(id, 'requirements')).rejects.toMatchObject({ code: 'phase-gate' })

    const trashed = await seedComponent()
    await scrum.deleteItem(trashed)
    // Shelved items refuse with the house codes (`in-trash` / `archived`).
    await expect(scrum.advancePhase(trashed)).rejects.toMatchObject({ code: 'in-trash' })
  })
})

describe('spiral gates (R3, R4, R5)', () => {
  it('requirements → design needs BOTH requirements and requirementsReview, named on failure', async () => {
    const id = await seedComponent()
    await expect(scrum.advancePhase(id)).rejects.toMatchObject({ code: 'phase-gate' })
    await scrum.updateItem(id, { requirements: CONTRACT_REQ })
    await expect(scrum.advancePhase(id)).rejects.toThrow(/`requirementsReview` is empty/)
    // Whitespace-only does not count as filled.
    await scrum.updateItem(id, { requirementsReview: '   ' })
    await expect(scrum.advancePhase(id)).rejects.toThrow(/`requirementsReview` is empty/)
    await scrum.updateItem(id, { requirementsReview: contractReview(scrum.reviewBrief(id).requirements.digest) })
    expect((await scrum.advancePhase(id)).phase).toBe('design')
  })

  it('design → tdd needs design; tdd → construction needs at least one TEST task (comp-45)', async () => {
    const id = await seedComponent()
    await toDesign(id)
    await expect(scrum.advancePhase(id)).rejects.toThrow(/design/)
    await scrum.updateItem(id, { design: 'erDiagram' })
    expect((await scrum.advancePhase(id)).phase).toBe('tdd')
    await expect(scrum.advancePhase(id)).rejects.toThrow(/no task under the component/)
    await scrum.createTask({ componentId: id, title: 't' })
    await expect(scrum.advancePhase(id)).rejects.toThrow(/no test task/)
    await scrum.createTask({ componentId: id, title: '[test] t' })
    expect((await scrum.advancePhase(id)).phase).toBe('construction')
  })

  it('construction → validation needs every non-trashed task done; archived done tasks COUNT', async () => {
    const id = await seedComponent()
    const first = await toTdd(id)
    const second = await scrum.createTask({ componentId: id, title: 'second' })
    await scrum.advancePhase(id)
    await expect(scrum.advancePhase(id)).rejects.toThrow(/done/)

    await finish([first.id, second.id])
    // Archive the finished tasks (the recommended flow) — they still count.
    await scrum.archiveCompleted()
    expect((await scrum.advancePhase(id)).phase).toBe('validation')
  })

  it('trashed tasks leave the denominator; a lone trashed task blocks tdd → construction', async () => {
    const id = await seedComponent()
    const task = await toTdd(id)
    await scrum.deleteItem(task.id)
    await expect(scrum.advancePhase(id)).rejects.toThrow(/task/)
  })

  it('never skips forward; retreats freely; delta 0 is a no-op; terminal advance errors (R4)', async () => {
    const id = await seedComponent()
    await expect(scrum.setPhase(id, 'tdd')).rejects.toThrow(/skip/)
    const design = await toDesign(id)
    expect(design.phase).toBe('design')
    // Retreat without any gate, even with artifacts cleared.
    await scrum.updateItem(id, { requirements: '' })
    expect((await scrum.setPhase(id, 'requirements')).phase).toBe('requirements')
    // Same phase: no-op, no log entry.
    const before = componentOf(id).phaseLog.length
    await scrum.setPhase(id, 'requirements')
    expect(componentOf(id).phaseLog).toHaveLength(before)
    // Terminal.
    const done = await seedComponent()
    const task = await toTdd(done)
    await scrum.advancePhase(done)
    await finish([task.id])
    await scrum.advancePhase(done)
    await expect(scrum.advancePhase(done)).rejects.toThrow(/last phase/)
  })

  it('appends one phaseLog entry per movement, retreats included (R4)', async () => {
    const id = await seedComponent()
    await toDesign(id)
    await scrum.setPhase(id, 'requirements')
    const log = componentOf(id).phaseLog
    expect(log.map(e => `${e.from}>${e.to}`)).toEqual(['requirements>design', 'design>requirements'])
    for (const entry of log) expect(entry.at).toMatch(/^\d{4}-/)
  })

  it('gate errors carry the ScrumError code and name both phases (R5)', async () => {
    const id = await seedComponent()
    await expect(scrum.advancePhase(id)).rejects.toMatchObject({ code: 'phase-gate' })
    await expect(scrum.advancePhase(id)).rejects.toThrow(/requirements to design/)
  })
})

// ── v0.13: the review contract behind the first gate (comp-48) ────────────
//
// Written BEFORE the implementation (TDD). The requirements → design gate
// stops accepting "any text" and demands the review contract: approved,
// versioned, human-stamped requirements and a structured review covering
// exactly that text.

const APPROVED_REQ = '---\nversion: 1\nstatus: approved\n---\nR1 — must work.'
/** An approved round-1 review of APPROVED_REQ, digest computed by the contract itself. */
function approvedReview(digest: string, over = ''): string {
  return `---\nreviewer: subagent\nreviewed_version: 1\nreviewed_digest: ${digest}\nverdict: approved\nround: 1\nfindings: { high: 0, medium: 0, low: 0 }\n${over}---\nNo blocking finding.`
}

describe('review contract gate (comp-48)', () => {
  it('requirements → design demands the contract and reports every reason', async () => {
    const id = await seedComponent()
    await scrum.updateItem(id, { requirements: 'R1 free text', requirementsReview: 'looks fine' })
    const error = await scrum.advancePhase(id).catch((e: unknown) => e as Error)
    expect(error).toMatchObject({ code: 'phase-gate' })
    expect(error.message).toMatch(/`requirements` frontmatter/)
    expect(error.message).toMatch(/`requirementsReview` frontmatter missing or malformed/)
    expect(error.message).toMatch(/; /)

    await scrum.updateItem(id, { requirements: APPROVED_REQ })
    const digest = scrum.reviewBrief(id).requirements.digest
    await scrum.updateItem(id, { requirementsReview: approvedReview(digest) })
    expect((await scrum.advancePhase(id)).phase).toBe('design')
  })

  it('a retreat to requirements followed by an edit is barred until re-reviewed (R6)', async () => {
    const id = await seedComponent()
    await scrum.updateItem(id, { requirements: APPROVED_REQ })
    await scrum.updateItem(id, { requirementsReview: approvedReview(scrum.reviewBrief(id).requirements.digest) })
    await scrum.advancePhase(id)
    await scrum.setPhase(id, 'requirements')
    await scrum.updateItem(id, { requirements: APPROVED_REQ.replace('version: 1', 'version: 2').replace('must work', 'must work fast') })
    await expect(scrum.advancePhase(id)).rejects.toThrow(/covers version 1 but `requirements` are at version 2/)
    await expect(scrum.advancePhase(id)).rejects.toThrow(/text changed since the review/)
  })

  it('reviewContract(id) exposes the same verdict the gate uses (feedback before the gate)', async () => {
    const id = await seedComponent()
    await scrum.updateItem(id, { requirements: APPROVED_REQ, requirementsReview: 'draft' })
    const early = scrum.reviewContract(id)
    expect(early.ok).toBe(false)
    await scrum.updateItem(id, { requirementsReview: approvedReview(scrum.reviewBrief(id).requirements.digest) })
    expect(scrum.reviewContract(id)).toEqual({ ok: true })
  })

  it('reviewBrief returns the state the reviewer needs, and refuses by name when unreviewable', async () => {
    const id = await seedComponent()
    await expect(() => scrum.reviewBrief(id)).toThrow(/`requirements` is empty/)
    await scrum.updateItem(id, { requirements: '---\nversion: 1\nstatus: approved\n---\n   ' })
    expect(() => scrum.reviewBrief(id)).toThrow(/`requirements` body is empty/)
    await scrum.updateItem(id, { requirements: '---\nversion: 1.5\n---\nbody' })
    expect(() => scrum.reviewBrief(id)).toThrow(/frontmatter invalid/)
    await scrum.updateItem(id, { requirements: 'no version here' })
    const noVersion = (() => { try { scrum.reviewBrief(id); return null } catch (e) { return e as Error & { code: string } } })()
    expect(noVersion).toMatchObject({ code: 'review-brief' })
    expect(noVersion!.message).toMatch(/version/)

    await scrum.updateItem(id, { requirements: APPROVED_REQ, design: 'erDiagram …' })
    await scrum.createTask({ componentId: id, title: 't1' })
    const first = scrum.reviewBrief(id)
    expect(first.component.id).toBe(id)
    expect(first.requirements).toMatchObject({ version: 1, status: 'approved', body: 'R1 — must work.' })
    expect(first.requirements.digest).toMatch(/^[0-9a-f]{8}$/)
    expect(first.previousReview).toBeUndefined()
    // Design rides along only once the component is past requirements.
    expect(first.design).toBeUndefined()
    expect(first.taskCount).toBe(1)

    await scrum.updateItem(id, { requirementsReview: approvedReview(first.requirements.digest) })
    await scrum.advancePhase(id)
    const second = scrum.reviewBrief(id)
    expect(second.previousReview).toMatchObject({ meta: { verdict: 'approved', round: 1, reviewed_version: 1 } })
    expect(second.design).toBe('erDiagram …')

    const trashed = await seedComponent()
    await scrum.deleteItem(trashed)
    expect(() => scrum.reviewBrief(trashed)).toThrow(/in the trash/)
  })
})

describe('review contract — the digest property (comp-48 R3, round-3 M-A)', () => {
  it('R3: stamping status: approved AFTER the review does not invalidate it — brief → review → stamp → advance', async () => {
    const id = await seedComponent()
    // Draft requirements: versioned, not yet stamped by the human.
    await scrum.updateItem(id, { requirements: '---\nversion: 1\nstatus: draft\n---\nR1 — must work.' })
    const brief = scrum.reviewBrief(id)
    expect(brief.requirements.status).toBe('draft')
    await scrum.updateItem(id, { requirementsReview: approvedReview(brief.requirements.digest) })
    // Still barred: only the stamp is missing (review is valid and current).
    await expect(scrum.advancePhase(id)).rejects.toThrow(/status is draft \(needs approved\)/)
    await expect(scrum.advancePhase(id)).rejects.not.toThrow(/text changed/)
    // The human stamps the frontmatter only: same body, same digest, review still covers it.
    await scrum.updateItem(id, { requirements: '---\nversion: 1\nstatus: approved\n---\nR1 — must work.' })
    expect(scrum.reviewBrief(id).requirements.digest).toBe(brief.requirements.digest)
    expect((await scrum.advancePhase(id)).phase).toBe('design')
  })
})

// ── comp-47: the done gate (R3, R4, R5) — written before the code ─────────

const VALID_VALIDATION = '---\nvalidated_at: 2026-09-02\nsuite: { tests: 97, passed: 97, wall_seconds: 12, budget_seconds: 15 }\ntypecheck: clean\n---\nSuite green, tsc clean.'

/** Carry a component to `validation` with one finished task (through every gate). */
async function toValidation(id: string) {
  const task = await toTdd(id)
  await scrum.advancePhase(id)
  await finish([task.id])
  await scrum.advancePhase(id)
  return task
}

describe('done gate (comp-47)', () => {
  it('R3: status done is refused outside validation, without finished tasks, or without the validation contract — all reasons named', async () => {
    const id = await seedComponent()
    const error = await scrum.updateItem(id, { status: 'done' }).catch((e: unknown) => e as Error & { code: string })
    expect(error).toMatchObject({ code: 'done-gate' })
    expect(error.message).toMatch(/phase is requirements \(needs validation\)/)
    expect(error.message).toMatch(/no task under the component/)
    expect(error.message).toMatch(/`validation` is empty/)
    expect(error.message).toMatch(/; /)
    expect(componentOf(id).status).toBe('proposed')
  })

  it('R3: accepts done in validation with every task done and a valid artifact; done → done is a no-op', async () => {
    const id = await seedComponent()
    await toValidation(id)
    await expect(scrum.updateItem(id, { status: 'done' })).rejects.toThrow(/`validation` is empty/)
    await scrum.updateItem(id, { validation: VALID_VALIDATION })
    const done = await scrum.updateItem(id, { status: 'done' })
    expect(done).toMatchObject({ status: 'done', phase: 'validation' })
    expect((await scrum.updateItem(id, { status: 'done' })).status).toBe('done')
  })

  it('R3: the gate sees the NEXT state — artifact and status in the same patch', async () => {
    const id = await seedComponent()
    await toValidation(id)
    const done = await scrum.updateItem(id, { status: 'done', validation: VALID_VALIDATION })
    expect(done.status).toBe('done')
    const other = await seedComponent()
    await toValidation(other)
    await expect(scrum.updateItem(other, { status: 'done', validation: VALID_VALIDATION.replace('passed: 97', 'passed: 90') }))
      .rejects.toThrow(/suite\.passed 90/)
  })

  it('R5: only the transition is gated — a done component stays done; retreating and coming back is gated again', async () => {
    const id = await seedComponent()
    await toValidation(id)
    await scrum.updateItem(id, { status: 'done', validation: VALID_VALIDATION })
    // Other edits on a done component never re-run the gate.
    expect((await scrum.updateItem(id, { title: 'renamed' })).status).toBe('done')
    // A new (not done) task after done does not undo done…
    await scrum.createTask({ componentId: id, title: 'follow-up' })
    expect(componentOf(id).status).toBe('done')
    // …but retreating to in_progress and coming back is barred by that open task.
    await scrum.updateItem(id, { status: 'in_progress' })
    await expect(scrum.updateItem(id, { status: 'done' })).rejects.toThrow(/1 task\(s\) not done/)
  })

  it('R4: doneReadiness(id) is the gate\'s own verdict; shelved components refuse', async () => {
    const id = await seedComponent()
    const early = scrum.doneReadiness(id)
    expect(early.ok).toBe(false)
    const message = await scrum.updateItem(id, { status: 'done' }).catch((e: Error) => e.message)
    for (const reason of (early as { reasons: string[] }).reasons) expect(message).toContain(reason)

    await toValidation(id)
    await scrum.updateItem(id, { validation: VALID_VALIDATION })
    expect(scrum.doneReadiness(id)).toEqual({ ok: true })
    expect(scrum.validationContract(id)).toEqual({ ok: true })

    const trashed = await seedComponent()
    await scrum.deleteItem(trashed)
    expect(() => scrum.doneReadiness(trashed)).toThrow(/in the trash/)
    expect(() => scrum.validationContract(trashed)).toThrow(/in the trash/)
  })

  it('R4: tree() annotates readyForDone in the Model — archived done tasks count, done components are never ready', async () => {
    const id = await seedComponent()
    await toValidation(id)
    await scrum.archiveCompleted()
    expect(componentOf(id).readyForDone).toBe(false)
    await scrum.updateItem(id, { validation: VALID_VALIDATION })
    // The tree hides the archived task, yet readiness (Model) still counts it.
    expect(componentOf(id).tasks).toHaveLength(0)
    expect(componentOf(id).readyForDone).toBe(true)
    await scrum.updateItem(id, { status: 'done' })
    expect(componentOf(id).readyForDone).toBe(false)
    expect(componentOf(await seedComponent()).readyForDone).toBe(false)
  })
})

// ── comp-50: the board's suite budget (R2) — written before the code ──────

describe('suite budget (comp-50 R2)', () => {
  it('R2: reads the default, sets a board budget, refuses a raise without a reason, and removes back to the default', async () => {
    expect(scrum.suiteBudget()).toEqual({ seconds: 15, source: 'default', aboveDefault: false })

    const twelve = await scrum.setSuiteBudget(12)
    expect(twelve).toMatchObject({ seconds: 12, source: 'board', aboveDefault: false })
    expect(scrum.suiteBudget()).toEqual(twelve)

    await expect(scrum.setSuiteBudget(20)).rejects.toMatchObject({ code: 'validation' })
    await expect(scrum.setSuiteBudget(0)).rejects.toMatchObject({ code: 'validation' })
    // The refused writes left the board untouched.
    expect(scrum.suiteBudget().seconds).toBe(12)

    const twenty = await scrum.setSuiteBudget(20, 'slow CI')
    expect(twenty).toMatchObject({ seconds: 20, source: 'board', aboveDefault: true, reason: 'slow CI' })
    // Re-setting the same value above default needs the reason again.
    await expect(scrum.setSuiteBudget(20)).rejects.toThrow(/requires a reason/)

    expect(await scrum.setSuiteBudget(undefined)).toEqual({ seconds: 15, source: 'default', aboveDefault: false })
    expect(scrum.suiteBudget().source).toBe('default')
  })

  it('R2: the budget shares the global with the id counters — both survive each other', async () => {
    const componentId = await seedComponent()
    await scrum.setSuiteBudget(12)
    // Counters continued from where they were: the next task is task-1, the next release rel-2.
    expect((await scrum.createTask({ componentId, title: 't' })).id).toBe('task-1')
    expect((await scrum.createRelease({ name: 'v2' })).id).toBe('rel-2')
    // …and allocating ids did not drop the budget.
    expect(scrum.suiteBudget().seconds).toBe(12)
    // Concurrent writes serialize on the same chain: no lost update either way.
    await Promise.all([scrum.setSuiteBudget(10), scrum.createRelease({ name: 'v3' }), scrum.setSuiteBudget(11)])
    expect(scrum.suiteBudget().seconds).toBe(11)
    expect(scrum.tree().releases.map(r => r.id)).toEqual(['rel-1', 'rel-2', 'rel-3'])
  })

  it('R2: the board budget is injected into the done gate — a wider board accepts a slower suite', async () => {
    const id = await seedComponent()
    await toValidation(id)
    const slow = VALID_VALIDATION.replace('wall_seconds: 12, budget_seconds: 15', 'wall_seconds: 18, budget_seconds: 20')
    await scrum.updateItem(id, { validation: slow })
    const refused = scrum.doneReadiness(id)
    expect(refused.ok).toBe(false)
    expect(!refused.ok && refused.reasons.join()).toMatch(/budget_seconds 20 > board budget 15/)
    expect(scrum.validationContract(id)).toMatchObject({ ok: false, overBudget: true })

    await scrum.setSuiteBudget(20, 'slow CI')
    expect(scrum.doneReadiness(id)).toEqual({ ok: true })
    expect(scrum.validationContract(id)).toEqual({ ok: true })
    expect((await scrum.updateItem(id, { status: 'done' })).status).toBe('done')
  })

  it('R2: lowering the budget never reopens a done component, but readyForDone reflects the new ceiling', async () => {
    const done = await seedComponent()
    await toValidation(done)
    await scrum.updateItem(done, { status: 'done', validation: VALID_VALIDATION })
    const pending = await scrum.createComponent({ featureId: 'feat-1', title: 'Pending' })
    await toValidation(pending.id)
    await scrum.updateItem(pending.id, { validation: VALID_VALIDATION })
    expect(componentOf(pending.id).readyForDone).toBe(true)

    await scrum.setSuiteBudget(10)
    expect(componentOf(done).status).toBe('done')
    expect(componentOf(done).readyForDone).toBe(false)
    expect(componentOf(pending.id).readyForDone).toBe(false)
    const readiness = scrum.doneReadiness(pending.id)
    expect(!readiness.ok && readiness.reasons.join()).toMatch(/budget_seconds 15 > board budget 10/)
  })
})

// ── comp-45: task kind + the tdd gate (R1–R3) — written before the code ───
//
// `kind` becomes domain data: the `[test]`/`[code]` title convention of the
// spr-11+ boards migrates on parse (prefix out of the title, back through
// the View), every title entry point interprets the prefix through ONE pure
// function, and the tdd → construction gate wants tests before code.

/** A raw pre-v0.16 task record (no `kind`) with the given title. */
function legacyTask(title: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'task-1', componentId: 'comp-1', title, status: 'backlog', order: 0,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  }
}

/** The task record as the tree currently holds it. */
function taskOf(id: string) {
  for (const release of scrum.tree().releases) {
    for (const feature of release.features) {
      for (const component of feature.components) {
        const found = component.tasks.find(t => t.id === id)
        if (found !== undefined) return found
      }
    }
  }
  throw new Error(`task ${id} not in tree`)
}

describe('task kind (comp-45)', () => {
  it('R1: migrates legacy titles on parse — prefix becomes kind, title loses it, no version bump', () => {
    expect(taskSchema.parse(legacyTask('[test] X'))).toMatchObject({ kind: 'test', title: 'X' })
    expect(taskSchema.parse(legacyTask('[CODE] X'))).toMatchObject({ kind: 'code', title: 'X' })
    expect(taskSchema.parse(legacyTask('plain title'))).toMatchObject({ kind: 'other', title: 'plain title' })
    // Whitespace: leading space before the prefix (P1) and doubled space after it.
    expect(taskSchema.parse(legacyTask('  [test] X'))).toMatchObject({ kind: 'test', title: 'X' })
    expect(taskSchema.parse(legacyTask('[test]  X'))).toMatchObject({ kind: 'test', title: 'X' })
    // A prefix in the middle is not a prefix.
    expect(taskSchema.parse(legacyTask('fix [test] X'))).toMatchObject({ kind: 'other', title: 'fix [test] X' })
  })

  it('R1: the split is total — a prefix-only legacy title stays a non-empty title of kind other', () => {
    expect(taskSchema.parse(legacyTask('[test]'))).toMatchObject({ kind: 'other', title: '[test]' })
    expect(taskSchema.parse(legacyTask('[code]   '))).toMatchObject({ kind: 'other', title: '[code]' })
  })

  it('R1: a record that already carries kind is kept as is; the parse is idempotent', () => {
    const explicit = legacyTask('[test] keep me', { kind: 'code' })
    expect(taskSchema.parse(explicit)).toMatchObject({ kind: 'code', title: '[test] keep me' })
    for (const title of ['[test] X', '[test]', 'plain']) {
      const once = taskSchema.parse(legacyTask(title))
      expect(taskSchema.parse(once)).toEqual(once)
    }
    // The migration never leaks its bookkeeping into the record.
    expect('prefixOnly' in taskSchema.parse(legacyTask('[test]'))).toBe(false)
    expect('matched' in taskSchema.parse(legacyTask('[test] X'))).toBe(false)
  })

  it('R2a: createTask — explicit kind, inferred kind, default other; the stored title never carries the prefix', async () => {
    const componentId = await seedComponent()
    const explicit = await scrum.createTask({ componentId, title: 'explicit', kind: 'test' })
    expect(explicit).toMatchObject({ kind: 'test', title: 'explicit' })
    const inferred = await scrum.createTask({ componentId, title: '[code] inferred' })
    expect(inferred).toMatchObject({ kind: 'code', title: 'inferred' })
    const plain = await scrum.createTask({ componentId, title: 'plain' })
    expect(plain).toMatchObject({ kind: 'other', title: 'plain' })
    // Same prefix and explicit kind: accepted, prefix removed.
    const agreeing = await scrum.createTask({ componentId, title: '[test] agreeing', kind: 'test' })
    expect(agreeing).toMatchObject({ kind: 'test', title: 'agreeing' })
    // Leading whitespace does not defeat the inference (P1).
    const padded = await scrum.createTask({ componentId, title: '  [test]  padded ' })
    expect(padded).toMatchObject({ kind: 'test', title: 'padded' })
    expect(taskOf(inferred.id).title).toBe('inferred')
  })

  it('R2a/R2d: createTask refuses invalid kinds, prefix-only titles and contradicting prefixes — without consuming an id (P2)', async () => {
    const componentId = await seedComponent()
    const before = await scrum.createTask({ componentId, title: 'anchor' })
    await expect(scrum.createTask({ componentId, title: 'x', kind: 'spike' }))
      .rejects.toMatchObject({ code: 'invalid-kind' })
    await expect(scrum.createTask({ componentId, title: 'x', kind: '' }))
      .rejects.toMatchObject({ code: 'invalid-kind' })
    await expect(scrum.createTask({ componentId, title: '[test]' }))
      .rejects.toMatchObject({ code: 'invalid-input' })
    await expect(scrum.createTask({ componentId, title: '[test]   ' }))
      .rejects.toThrow(/only a kind prefix/)
    // Prefix-only is refused before any conflict check (matched test vs explicit other).
    await expect(scrum.createTask({ componentId, title: '[test]', kind: 'other' }))
      .rejects.toMatchObject({ code: 'invalid-input' })
    await expect(scrum.createTask({ componentId, title: '   ' }))
      .rejects.toMatchObject({ code: 'invalid-input' })
    const conflict = await scrum.createTask({ componentId, title: '[test] X', kind: 'code' })
      .catch((e: unknown) => e as Error & { code: string })
    expect(conflict).toMatchObject({ code: 'kind-conflict' })
    expect(conflict.message).toMatch(/title prefix \[test\] contradicts kind code/)
    // The invalid-kind message names the parent (no task id exists yet).
    await expect(scrum.createTask({ componentId, title: 'x', kind: 'spike' }))
      .rejects.toThrow(new RegExp(`under ${componentId}`))
    // None of the refusals burned a counter value.
    const after = await scrum.createTask({ componentId, title: 'next' })
    expect(Number(after.id.slice(5))).toBe(Number(before.id.slice(5)) + 1)
  })

  it('R2b/R2e: updateItem changes kind through narrowKind and never touches id/createdAt/order', async () => {
    const componentId = await seedComponent()
    const task = await scrum.createTask({ componentId, title: '[code] early' })
    const changed = await scrum.updateItem(task.id, { kind: 'other' })
    expect(changed).toMatchObject({ id: task.id, kind: 'other', title: 'early', createdAt: task.createdAt, order: task.order })
    await expect(scrum.updateItem(task.id, { kind: 'bogus' })).rejects.toMatchObject({ code: 'invalid-kind' })
    await expect(scrum.updateItem(task.id, { kind: '' })).rejects.toMatchObject({ code: 'invalid-kind' })
    await expect(scrum.updateItem(task.id, { kind: 'bogus' })).rejects.toThrow(new RegExp(task.id))
    expect(taskOf(task.id).kind).toBe('other')
    // On non-task ids the field is ignored, like estimate.
    const component = await scrum.updateItem(componentId, { kind: 'bogus' })
    expect('kind' in component).toBe(false)
  })

  it('R2c/R2d: updateItem title — a prefix moves the kind, no prefix leaves it, conflicts and prefix-only are refused', async () => {
    const componentId = await seedComponent()
    const task = await scrum.createTask({ componentId, title: 'plain' })
    expect(task.kind).toBe('other')
    const renamed = await scrum.updateItem(task.id, { title: '[code] renamed' })
    expect(renamed).toMatchObject({ kind: 'code', title: 'renamed' })
    const kept = await scrum.updateItem(task.id, { title: 'no prefix' })
    expect(kept).toMatchObject({ kind: 'code', title: 'no prefix' })
    // Explicit kind agreeing with the prefix wins the same way; a different one is a conflict.
    expect(await scrum.updateItem(task.id, { title: '[test] both', kind: 'test' })).toMatchObject({ kind: 'test', title: 'both' })
    await expect(scrum.updateItem(task.id, { title: '[code] both', kind: 'test' }))
      .rejects.toMatchObject({ code: 'kind-conflict' })
    // Prefix-only title: refused, kind intact.
    await expect(scrum.updateItem(task.id, { title: '[code]' })).rejects.toMatchObject({ code: 'invalid-input' })
    expect(taskOf(task.id)).toMatchObject({ kind: 'test', title: 'both' })
    // Explicit kind without a title still applies alongside other fields.
    expect(await scrum.updateItem(task.id, { kind: 'code', estimate: 2 })).toMatchObject({ kind: 'code', estimate: 2, title: 'both' })
  })
})

/** Carry a component to `tdd` with NO task (the gate scenarios add their own). */
async function toEmptyTdd(id: string) {
  await toDesign(id)
  await scrum.updateItem(id, { design: 'erDiagram …' })
  await scrum.advancePhase(id)
}

/** The gate's refusal message for advancing out of tdd. */
async function tddRefusal(id: string): Promise<string> {
  const error = await scrum.advancePhase(id).then(() => null, (e: unknown) => e as Error & { code: string })
  if (error === null) throw new Error('expected the tdd gate to refuse')
  expect(error).toMatchObject({ code: 'phase-gate' })
  return error.message
}

describe('tdd gate (comp-45 R3)', () => {
  it('R3: names (a) alone without tasks, (b) alone with only other tasks', async () => {
    const id = await seedComponent()
    await toEmptyTdd(id)
    const none = await tddRefusal(id)
    expect(none).toMatch(/no task under the component \(decompose first\)/)
    expect(none).not.toMatch(/test task/)
    await scrum.createTask({ componentId: id, title: 'docs' })
    await scrum.createTask({ componentId: id, title: 'spike' })
    const onlyOther = await tddRefusal(id)
    expect(onlyOther).toMatch(/no test task \(kind test\) — write the tests first/)
    expect(onlyOther).not.toMatch(/created before/)
    expect(onlyOther).toMatch(/cannot advance from tdd to construction/)
  })

  it('R3: without any test task every code task counts as early — (b) and (c) together, ids ascending', async () => {
    const id = await seedComponent()
    await toEmptyTdd(id)
    const a = await scrum.createTask({ componentId: id, title: '[code] a' })
    await scrum.createTask({ componentId: id, title: 'other in between' })
    const b = await scrum.createTask({ componentId: id, title: '[code] b' })
    const message = await tddRefusal(id)
    expect(message).toMatch(/no test task/)
    expect(message).toMatch(new RegExp(`code task\\(s\\) created before the first test task \\(${a.id}, ${b.id}\\) — change their kind or trash them`))
    expect(message).toMatch(/; /)
  })

  it('R3: a code task born before the first test task is named; tests first passes', async () => {
    const id = await seedComponent()
    await toEmptyTdd(id)
    const early = await scrum.createTask({ componentId: id, title: '[code] too early' })
    await scrum.createTask({ componentId: id, title: '[test] first test' })
    await scrum.createTask({ componentId: id, title: '[code] fine' })
    const message = await tddRefusal(id)
    expect(message).not.toMatch(/no test task/)
    expect(message).toMatch(new RegExp(`created before the first test task \\(${early.id}\\)`))
    // The legitimate way out: change the early task's kind (its id stays).
    await scrum.updateItem(early.id, { kind: 'other' })
    expect((await scrum.advancePhase(id)).phase).toBe('construction')

    const clean = await scrum.createComponent({ featureId: 'feat-1', title: 'clean' })
    await toEmptyTdd(clean.id)
    await scrum.createTask({ componentId: clean.id, title: '[test] t' })
    await scrum.createTask({ componentId: clean.id, title: '[code] c' })
    expect((await scrum.advancePhase(clean.id)).phase).toBe('construction')
  })

  it('R3: creation order is the id NUMBER — task-9 code before task-10 test violates; the reverse passes (M4)', async () => {
    const id = await seedComponent()
    await toEmptyTdd(id)
    for (let i = 1; i <= 8; i += 1) await scrum.createTask({ componentId: id, title: `filler ${i}` })
    const nine = await scrum.createTask({ componentId: id, title: '[code] nine' })
    const ten = await scrum.createTask({ componentId: id, title: '[test] ten' })
    expect([nine.id, ten.id]).toEqual(['task-9', 'task-10'])
    expect(await tddRefusal(id)).toMatch(/\(task-9\)/)

    // The reverse (9 test / 10 code) on a fresh board: a string comparison
    // would call task-10 "earlier" than task-9 and refuse it.
    const fresh = await freshBoard()
    const rel = await fresh.createRelease({ name: 'r' })
    const feat = await fresh.createFeature({ releaseId: rel.id, title: 'f' })
    const comp = await fresh.createComponent({ featureId: feat.id, title: 'c' })
    await fresh.updateItem(comp.id, { requirements: CONTRACT_REQ })
    await fresh.updateItem(comp.id, { requirementsReview: contractReview(fresh.reviewBrief(comp.id).requirements.digest) })
    await fresh.advancePhase(comp.id)
    await fresh.updateItem(comp.id, { design: 'd' })
    await fresh.advancePhase(comp.id)
    for (let i = 1; i <= 8; i += 1) await fresh.createTask({ componentId: comp.id, title: `filler ${i}` })
    const test9 = await fresh.createTask({ componentId: comp.id, title: '[test] nine' })
    const code10 = await fresh.createTask({ componentId: comp.id, title: '[code] ten' })
    expect([test9.id, code10.id]).toEqual(['task-9', 'task-10'])
    expect((await fresh.advancePhase(comp.id)).phase).toBe('construction')
  })

  it('R3: trashed code tasks do not count; archived test tasks do', async () => {
    const id = await seedComponent()
    await toEmptyTdd(id)
    const early = await scrum.createTask({ componentId: id, title: '[code] early' })
    const test = await scrum.createTask({ componentId: id, title: '[test] t' })
    await expect(scrum.advancePhase(id)).rejects.toThrow(/created before/)
    await scrum.deleteItem(early.id)
    expect((await scrum.advancePhase(id)).phase).toBe('construction')

    // Archived (done) test task still satisfies (b).
    await scrum.setPhase(id, 'tdd')
    await finish([test.id])
    await scrum.archiveCompleted()
    expect((await scrum.advancePhase(id)).phase).toBe('construction')
  })

  it('R3: a legacy component with only other tasks that retreats to tdd cannot re-advance without a test task (L5)', async () => {
    const id = await seedComponent()
    await toEmptyTdd(id)
    // Born before comp-45: plain titles, kind other.
    await scrum.createTask({ componentId: id, title: '[test] placeholder' })
    await scrum.advancePhase(id)
    await scrum.updateItem('task-1', { kind: 'other' })
    expect(componentOf(id).phase).toBe('construction')
    await scrum.setPhase(id, 'tdd')
    await expect(scrum.advancePhase(id)).rejects.toThrow(/no test task/)
    await scrum.updateItem('task-1', { kind: 'test' })
    expect((await scrum.advancePhase(id)).phase).toBe('construction')
  })
})

describe('persistence — task kind migration (comp-45 R1)', () => {
  let lifeRoot: string
  let life: Context

  beforeEach(async () => {
    lifeRoot = mkdtempSync(join(tmpdir(), 'scrum-domain-kind-'))
    life = await openJsonStack(lifeRoot)
  })

  afterEach(async () => {
    await life.dispose?.()
    rmSync(lifeRoot, { recursive: true, force: true })
  })

  it('migrates a legacy prefixed title on open and persists it normalized on the next write', async () => {
    const board = await life.scrum.board()
    const release = await board.createRelease({ name: 'v1.0' })
    const feature = await board.createFeature({ releaseId: release.id, title: 'Login' })
    const component = await board.createComponent({ featureId: feature.id, title: 'OAuth flow' })
    const task = await board.createTask({ componentId: component.id, title: 'durable' })
    await life.dispose?.()

    // Plant a pre-v0.16 record: no `kind`, prefix inside the title (unit.version untouched).
    const medium = join(lifeRoot, `${GLOBAL_BOARD_NAME}.json`)
    const raw = JSON.parse(readFileSync(medium, 'utf8')) as { tables: { tasks: Record<string, Record<string, unknown>> } }
    const record = raw.tables.tasks[task.id]!
    delete record['kind']
    record['title'] = '[test] X'
    writeFileSync(medium, JSON.stringify(raw))

    life = await openJsonStack(lifeRoot)
    let reopened = await life.scrum.board()
    expect(reopened.tree().releases[0]!.features[0]!.components[0]!.tasks[0]).toMatchObject({ kind: 'test', title: 'X' })
    // A write of another field persists the normalized record.
    await reopened.updateItem(task.id, { estimate: 1 })
    await life.dispose?.()
    const written = JSON.parse(readFileSync(medium, 'utf8')) as { tables: { tasks: Record<string, Record<string, unknown>> } }
    expect(written.tables.tasks[task.id]).toMatchObject({ kind: 'test', title: 'X', estimate: 1 })

    life = await openJsonStack(lifeRoot)
    reopened = await life.scrum.board()
    expect(reopened.tree().releases[0]!.features[0]!.components[0]!.tasks[0]).toMatchObject({ kind: 'test', title: 'X' })
  })
})
