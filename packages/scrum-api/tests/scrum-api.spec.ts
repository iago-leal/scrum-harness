/**
 * Integration tests of the /scrum-api HTTP surface: a real webserver on an
 * OS-assigned port over the real storage stack, driven with fetch.
 */

import { createHash } from 'node:crypto'
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


/** Approved v1 requirements + an approved review covering them (review contract of comp-48). */
const REQ_BODY = 'R1 — must work.'
const CONTRACT_REQ = `---\nversion: 1\nstatus: approved\n---\n${REQ_BODY}`
const CONTRACT_REVIEW = `---\nreviewer: subagent\nreviewed_version: 1\nreviewed_digest: ${createHash('sha1').update(REQ_BODY).digest('hex').slice(0, 8)}\nverdict: approved\nround: 1\nfindings: { high: 0, medium: 0, low: 0 }\n---\nNo blocking finding.`

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
    expect(planned.json.result.releaseIds).toEqual(['rel-1'])
    expect(planned.json.state.sprints[0].releaseIds).toEqual(['rel-1'])

    const unlinked = await act({ action: 'updateItem', id: 'spr-1', releaseId: '' })
    expect(unlinked.json.state.sprints[0].releaseIds).toEqual([])

    const badLink = await act({ action: 'planSprint', goal: 'x', releaseId: 'rel-9' })
    expect(badLink.status).toBe(404)
  })

  it('links one sprint to multiple releases through the wire (v0.11)', async () => {
    await act({ action: 'createRelease', name: 'v1.0' })
    await act({ action: 'createRelease', name: 'v2.0' })

    const planned = await act({ action: 'planSprint', goal: 'Dual', releaseIds: ['rel-1', 'rel-2'] })
    expect(planned.status).toBe(200)
    expect(planned.json.result.releaseIds).toEqual(['rel-1', 'rel-2'])
    expect(planned.json.state.sprints[0].releaseIds).toEqual(['rel-1', 'rel-2'])

    // updateItem with releaseIds REPLACES the whole linked set…
    const swapped = await act({ action: 'updateItem', id: 'spr-1', releaseIds: ['rel-2'] })
    expect(swapped.status).toBe(200)
    expect(swapped.json.state.sprints[0].releaseIds).toEqual(['rel-2'])

    // …and an empty array unlinks everything.
    const unlinked = await act({ action: 'updateItem', id: 'spr-1', releaseIds: [] })
    expect(unlinked.status).toBe(200)
    expect(unlinked.json.state.sprints[0].releaseIds).toEqual([])

    const badLink = await act({ action: 'planSprint', goal: 'x', releaseIds: ['rel-1', 'rel-9'] })
    expect(badLink.status).toBe(404)
  })

  it('round-trips the trash and the archive over the wire', async () => {
    await act({ action: 'createRelease', name: 'v1.0' })
    await act({ action: 'createFeature', releaseId: 'rel-1', title: 'F' })
    await act({ action: 'createComponent', featureId: 'feat-1', title: 'C' })
    await act({ action: 'createTask', componentId: 'comp-1', title: 'T', estimate: 2 })

    const trashed = await act({ action: 'deleteItem', id: 'task-1' })
    expect(trashed.status).toBe(200)
    expect(trashed.json.state.trash).toMatchObject([{ id: 'task-1', kind: 'task', title: 'T', estimate: 2 }])
    expect(trashed.json.state.tree.releases[0].features[0].components[0].tasks).toEqual([])

    const restored = await act({ action: 'restoreItem', id: 'task-1' })
    expect(restored.json.state.trash).toEqual([])
    expect(restored.json.state.tree.releases[0].features[0].components[0].tasks).toHaveLength(1)

    const archived = await act({ action: 'archiveItem', id: 'task-1' })
    expect(archived.json.state.archive).toMatchObject([{ id: 'task-1', kind: 'task' }])
    const unarchived = await act({ action: 'unarchiveItem', id: 'task-1' })
    expect(unarchived.json.state.archive).toEqual([])

    await act({ action: 'deleteItem', id: 'task-1' })
    const purged = await act({ action: 'purgeItem', id: 'task-1' })
    expect(purged.json.result).toEqual(['task-1'])
    const empty = await act({ action: 'emptyTrash' })
    expect(empty.json.result).toEqual([])
    const notInTrash = await act({ action: 'purgeItem', id: 'rel-1' })
    expect(notInTrash.status).toBe(409)
    expect(notInTrash.json.code).toBe('not-in-trash')
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

  it('isolates boards per workspace on both routes (v0.5)', async () => {
    const workspace = join(root, 'projeto-x')
    const created = await act({ action: 'createRelease', name: 'Só do X', workspace })
    expect(created.status).toBe(200)
    expect(created.json.state.tree.releases).toHaveLength(1)

    // Without workspace both routes answer the (empty) global board.
    const globalState = await (await fetch(`${base}/scrum-api/state`)).json()
    expect(globalState.state.tree.releases).toEqual([])

    // With the workspace the state carries that board.
    const wsState = await (await fetch(`${base}/scrum-api/state?workspace=${encodeURIComponent(workspace)}`)).json()
    expect(wsState.state.tree.releases[0].name).toBe('Só do X')
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

  // ── v0.12: the spiral engine over the wire (comp-42, R6) — written before the code ──

  it('drives phases and artifacts through componentPhase and updateItem', async () => {
    await act({ action: 'createRelease', name: 'v1.0' })
    await act({ action: 'createFeature', releaseId: 'rel-1', title: 'F' })
    const created = await act({ action: 'createComponent', featureId: 'feat-1', title: 'C' })
    expect(created.json.result).toMatchObject({ phase: 'requirements', phaseLog: [] })

    // Gate refused over the wire: 409 with the domain code and the named condition.
    const blocked = await act({ action: 'componentPhase', id: 'comp-1', op: 'advance' })
    expect(blocked.status).toBe(409)
    expect(blocked.json.code).toBe('phase-gate')
    expect(blocked.json.message).toMatch(/requirementsReview/)

    // The four artifacts through updateItem; '' deletes.
    const filled = await act({
      action: 'updateItem', id: 'comp-1',
      requirements: CONTRACT_REQ, requirementsReview: CONTRACT_REVIEW, design: 'D', validation: 'V',
    })
    expect(filled.status).toBe(200)
    expect(filled.json.result).toMatchObject({ requirements: CONTRACT_REQ, design: 'D' })
    const cleared = await act({ action: 'updateItem', id: 'comp-1', validation: '' })
    expect('validation' in cleared.json.result).toBe(false)

    const advanced = await act({ action: 'componentPhase', id: 'comp-1', op: 'advance' })
    expect(advanced.status).toBe(200)
    expect(advanced.json.result).toMatchObject({ phase: 'design', status: 'in_progress' })
    expect(advanced.json.result.phaseLog).toHaveLength(1)
    const component = advanced.json.state.tree.releases[0].features[0].components[0]
    expect(component).toMatchObject({ phase: 'design', requirementsReview: CONTRACT_REVIEW })

    const back = await act({ action: 'componentPhase', id: 'comp-1', op: 'set', phase: 'requirements' })
    expect(back.json.result.phase).toBe('requirements')
    const bad = await act({ action: 'componentPhase', id: 'comp-1', op: 'set', phase: 'nowhere' })
    expect(bad.status).toBe(400)
  })

  // ── comp-47: the done gate over the wire ──

  it('refuses status done with 409 done-gate and the reasons; readyForDone rides the tree', async () => {
    await act({ action: 'createRelease', name: 'v1.0' })
    await act({ action: 'createFeature', releaseId: 'rel-1', title: 'F' })
    await act({ action: 'createComponent', featureId: 'feat-1', title: 'C' })
    const refused = await act({ action: 'updateItem', id: 'comp-1', status: 'done' })
    expect(refused.status).toBe(409)
    expect(refused.json.code).toBe('done-gate')
    expect(refused.json.message).toMatch(/needs validation/)
    const state = await (await fetch(`${base}/scrum-api/state`)).json()
    expect(state.state.tree.releases[0].features[0].components[0].readyForDone).toBe(false)
  })
})
