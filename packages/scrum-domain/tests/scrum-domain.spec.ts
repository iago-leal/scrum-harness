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
import { componentSchema } from '../src/spec.ts'

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
    expect(sprint.releaseId).toBe(release.id)
    expect(scrum.sprintsOfRelease(release.id).map(s => s.id)).toEqual([sprint.id])
    expect(scrum.releaseNames().get(release.id)).toBe('v1.0')

    const relinked = await scrum.updateItem(sprint.id, { releaseId: other.id })
    expect(relinked).toMatchObject({ releaseId: other.id })
    await expect(scrum.updateItem(sprint.id, { releaseId: 'rel-9' }))
      .rejects.toMatchObject({ code: 'not-found' })

    const unlinked = await scrum.updateItem(sprint.id, { releaseId: '' })
    expect((unlinked as { releaseId?: string }).releaseId).toBeUndefined()
  })

  it('trashing a release keeps sprint links; only purge unlinks them', async () => {
    const release = await scrum.createRelease({ name: 'v1.0' })
    const sprint = await scrum.planSprint({ goal: 'g', releaseId: release.id })
    await scrum.deleteItem(release.id, true)
    // Soft delete is reversible, so the link survives with it.
    expect(scrum.sprints().find(s => s.id === sprint.id)!.releaseId).toBe(release.id)
    await scrum.purgeItem(release.id)
    const survivor = scrum.sprints().find(s => s.id === sprint.id)
    expect(survivor).toBeDefined()
    expect(survivor!.releaseId).toBeUndefined()
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
