/**
 * Integration tests of the /scrum-api HTTP surface: a real webserver on an
 * OS-assigned port over the real storage stack, driven with fetch.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { ScrumService } from '@scrum-harness/domain'
import * as ScrumApi from '../src/index.ts'

let root: string
let ctx: Context
let base: string

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'scrum-api-'))
  ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(ScrumService)
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await ctx.plugin(ScrumApi)
  base = `http://127.0.0.1:${ctx.webServer.port}`
})

afterEach(async () => {
  await ctx.dispose?.()
  rmSync(root, { recursive: true, force: true })
})

/** POST one action as JSON. */
async function act(body: unknown): Promise<{ status: number; json: any }> {
  const response = await fetch(`${base}/scrum-api/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, json: await response.json() }
}

describe('scrum-api', () => {
  it('serves empty state', async () => {
    const response = await fetch(`${base}/scrum-api/state`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.state.tree.releases).toEqual([])
    expect(body.state.activeSprintId).toBeNull()
  })

  it('runs a full flow through POST actions and answers fresh state each time', async () => {
    const release = await act({ action: 'createRelease', name: 'v1.0' })
    expect(release.status).toBe(200)
    expect(release.json.result.id).toBe('rel-1')

    const feature = await act({ action: 'createFeature', releaseId: 'rel-1', title: 'Login' })
    expect(feature.json.result.id).toBe('feat-1')
    const component = await act({ action: 'createComponent', featureId: 'feat-1', title: 'OAuth' })
    expect(component.json.result.id).toBe('comp-1')
    const task = await act({ action: 'createTask', componentId: 'comp-1', title: 'Refresh', estimate: 3 })
    expect(task.json.result.id).toBe('task-1')

    const sprint = await act({ action: 'planSprint', goal: 'Ship', taskIds: ['task-1'] })
    expect(sprint.json.result.id).toBe('spr-1')
    await act({ action: 'startSprint', sprintId: 'spr-1' })
    const moved = await act({ action: 'moveTask', taskId: 'task-1', column: 'done' })
    expect(moved.json.result.status).toBe('done')
    expect(moved.json.state.activeSprintId).toBe('spr-1')

    const ceremony = await act({
      action: 'recordCeremony', type: 'standup',
      notes: [{ category: 'progress', text: 'all good' }],
    })
    expect(ceremony.json.result.id).toBe('cer-1')

    const ended = await act({ action: 'endSprint' })
    expect(ended.json.result.sprint.status).toBe('completed')
    expect(ended.json.state.activeSprintId).toBeNull()
  })

  it('links sprints to releases through the wire', async () => {
    await act({ action: 'createRelease', name: 'v1.0' })
    const planned = await act({ action: 'planSprint', goal: 'Ship', releaseId: 'rel-1' })
    expect(planned.status).toBe(200)
    expect(planned.json.result.releaseId).toBe('rel-1')
    expect(planned.json.state.sprints[0].releaseId).toBe('rel-1')

    const unlinked = await act({ action: 'updateItem', id: 'spr-1', releaseId: '' })
    expect(unlinked.json.state.sprints[0].releaseId).toBeUndefined()

    const badLink = await act({ action: 'planSprint', goal: 'x', releaseId: 'rel-9' })
    expect(badLink.status).toBe(404)
  })

  it('maps business errors onto 404/409 and keeps codes', async () => {
    const missing = await act({ action: 'startSprint', sprintId: 'spr-9' })
    expect(missing.status).toBe(404)
    expect(missing.json.code).toBe('not-found')

    await act({ action: 'planSprint', goal: 'a' })
    await act({ action: 'planSprint', goal: 'b' })
    await act({ action: 'startSprint', sprintId: 'spr-1' })
    const conflict = await act({ action: 'startSprint', sprintId: 'spr-2' })
    expect(conflict.status).toBe(409)
    expect(conflict.json.code).toBe('sprint-already-active')
  })

  it('refuses non-JSON posts and malformed envelopes', async () => {
    const noType = await fetch(`${base}/scrum-api/action`, { method: 'POST', body: 'x' })
    expect(noType.status).toBe(415)

    const badAction = await act({ action: 'explode' })
    expect(badAction.status).toBe(400)
    expect(badAction.json.code).toBe('bad-action')

    const badRoute = await fetch(`${base}/scrum-api/nothing`)
    expect(badRoute.status).toBe(404)
  })
})
