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

let root: string
let ctx: Context
let scrum: ScrumService

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'scrum-domain-'))
  ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  const fiber = ctx.plugin(ScrumService)
  await fiber
  scrum = ctx.scrum
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
    scrum = ctx.scrum
    const tree = scrum.tree()
    expect(tree.releases[0]!.features[0]!.components[0]!.tasks[0]!.title).toBe('durable')
    // Counters survive too: the next task id continues the sequence.
    const next = await scrum.createTask({ componentId, title: 'second' })
    expect(next.id).toBe('task-2')
  })
})
