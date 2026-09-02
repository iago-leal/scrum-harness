/**
 * Integration tests of the ScrumService business rules over the real storage
 * stack: cordis Context + storage hub + storage-json backend (temp dir) +
 * storage-domain facility. No mocks — writes reach real JSON files.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import { ScrumService, ScrumError } from '../src/service.ts'
import type { ScrumBoard } from '../src/service.ts'
import { boardNameOf, GLOBAL_BOARD_NAME } from '../src/boards.ts'
import { componentSchema, sprintSchema } from '../src/spec.ts'

let root: string
let ctx: Context
/** The global fallback board; workspace-agnostic suites run on it. */
let scrum: ScrumBoard

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'scrum-domain-'))
  ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  const fiber = ctx.plugin(ScrumService)
  await fiber
  scrum = await ctx.scrum.board()
})

afterEach(async () => {
  await ctx.dispose?.()
  rmSync(root, { recursive: true, force: true })
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
    const finished = await scrum.updateItem(componentId, { status: 'done' })
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

describe('persistence', () => {
  it('survives a full close/reopen cycle on the same JSON medium', async () => {
    const componentId = await seedComponent()
    await scrum.createTask({ componentId, title: 'durable' })
    await ctx.dispose?.()

    ctx = new Context()
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    await ctx.plugin(ScrumService)
    scrum = await ctx.scrum.board()
    const tree = scrum.tree()
    expect(tree.releases[0]!.features[0]!.components[0]!.tasks[0]!.title).toBe('durable')
    // Counters survive too: the next task id continues the sequence.
    const next = await scrum.createTask({ componentId, title: 'second' })
    expect(next.id).toBe('task-2')
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
    // The global board sees neither.
    expect(scrum.tree().releases).toHaveLength(0)

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
    expect(global1).toBe(scrum)
  })

  it('per-workspace boards survive close/reopen on their own media', async () => {
    const cwd = join(root, 'projeto-a')
    const boardA = await ctx.scrum.board(cwd)
    const release = await boardA.createRelease({ name: 'durável' })
    await ctx.dispose?.()

    ctx = new Context()
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    await ctx.plugin(ScrumService)
    const reopened = await ctx.scrum.board(cwd)
    expect(reopened.tree().releases.map(r => r.id)).toEqual([release.id])
    expect((await ctx.scrum.board()).tree().releases).toHaveLength(0)
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

/** Fill the two artifacts the first gate needs and advance to design. */
async function toDesign(id: string) {
  await scrum.updateItem(id, { requirements: 'R1 …', requirementsReview: 'reviewed' })
  return scrum.advancePhase(id)
}

/** Carry a component to `tdd` with one task under it. */
async function toTdd(id: string) {
  await toDesign(id)
  await scrum.updateItem(id, { design: 'erDiagram …' })
  await scrum.advancePhase(id)
  return scrum.createTask({ componentId: id, title: 'first task' })
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
    await scrum.updateItem(id, { status: 'done' })
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
    await scrum.updateItem(id, { requirements: 'R1' })
    await expect(scrum.advancePhase(id)).rejects.toThrow(/requirementsReview/)
    // Whitespace-only does not count as filled.
    await scrum.updateItem(id, { requirementsReview: '   ' })
    await expect(scrum.advancePhase(id)).rejects.toThrow(/requirementsReview/)
    await scrum.updateItem(id, { requirementsReview: 'reviewed' })
    expect((await scrum.advancePhase(id)).phase).toBe('design')
  })

  it('design → tdd needs design; tdd → construction needs at least one task', async () => {
    const id = await seedComponent()
    await toDesign(id)
    await expect(scrum.advancePhase(id)).rejects.toThrow(/design/)
    await scrum.updateItem(id, { design: 'erDiagram' })
    expect((await scrum.advancePhase(id)).phase).toBe('tdd')
    await expect(scrum.advancePhase(id)).rejects.toThrow(/task/)
    await scrum.createTask({ componentId: id, title: 't' })
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
