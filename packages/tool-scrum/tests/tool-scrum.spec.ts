/**
 * Integration tests of the SCRUM tool family: real tool registry + real
 * storage stack; calls go through ctx.tools.execute exactly as the agent
 * loop dispatches them.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { CallId } from '@deepseek-ai/dsh-tools'
import { ScrumService } from '@scrum-harness/domain'
import * as ToolScrum from '../src/index.ts'

let root: string
let ctx: Context
let calls = 0

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'tool-scrum-'))
  ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(ScrumService)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(ToolRuntime, {})
  await ctx.plugin(ToolScrum)
})

afterEach(async () => {
  await ctx.dispose?.()
  rmSync(root, { recursive: true, force: true })
})

/**
 * Run one tool through the registry; returns the text of the first block.
 * `cwd` simulates the calling session's workspace (agent → session header),
 * exactly the field the tools route boards by; absent = global board.
 */
async function run(name: string, args: unknown, cwd?: string): Promise<{ isError: boolean; text: string }> {
  const result = await ctx.tools.execute({
    callId: `call-${++calls}` as CallId,
    name,
    arguments: args,
    ...cwd === undefined ? {} : { agent: { session: { header: { cwd } } } as never },
    signal: new AbortController().signal,
  })
  const first = result.content[0]
  return { isError: result.isError, text: first?.type === 'text' ? first.text : '' }
}

describe('tool-scrum', () => {
  it('registers the whole family in the model-facing catalog', () => {
    const names = ctx.tools.schemas().map(schema => schema.name)
    for (const expected of [
      'scrum_tree', 'scrum_release_create', 'scrum_feature_create', 'scrum_component_create',
      'scrum_task_create', 'scrum_item_update', 'scrum_item_delete', 'scrum_sprint_plan',
      'scrum_sprint_assign', 'scrum_sprint_start', 'scrum_sprint_end', 'scrum_sprint_status',
      'scrum_task_move', 'scrum_ceremony_record', 'scrum_ceremony_list',
      'scrum_trash_list', 'scrum_item_restore', 'scrum_item_purge', 'scrum_trash_empty',
      'scrum_archive_list', 'scrum_item_archive', 'scrum_item_unarchive', 'scrum_archive_completed',
    ]) {
      expect(names).toContain(expected)
    }
  })

  it('drives the full SCRUM cycle through tool calls', async () => {
    expect((await run('scrum_tree', {})).text).toContain('Empty backlog')

    expect((await run('scrum_release_create', { name: 'v1.0' })).text).toContain('rel-1')
    expect((await run('scrum_feature_create', { releaseId: 'rel-1', title: 'Login' })).text).toContain('feat-1')
    expect((await run('scrum_component_create', { featureId: 'feat-1', title: 'OAuth' })).text).toContain('comp-1')
    expect((await run('scrum_task_create', { componentId: 'comp-1', title: 'Tokens', estimate: 3 })).text).toContain('task-1')

    const planned = await run('scrum_sprint_plan', { goal: 'Ship login', taskIds: ['task-1'] })
    expect(planned.text).toContain('spr-1')
    expect((await run('scrum_sprint_start', { sprintId: 'spr-1' })).text).toContain('active')
    expect((await run('scrum_task_move', { taskId: 'task-1', column: 'done' })).text).toContain('done')

    const status = await run('scrum_sprint_status', {})
    expect(status.text).toContain('1/1 tasks done')

    const ceremony = await run('scrum_ceremony_record', {
      type: 'standup',
      notes: [{ category: 'progress', text: 'tokens working' }],
    })
    expect(ceremony.text).toContain('cer-1')

    expect((await run('scrum_sprint_end', {})).text).toContain('all tasks were done')

    const tree = await run('scrum_tree', {})
    expect(tree.text).toContain('task-1 Tokens [done @spr-1] (3pt)')
  })

  it('renders release links in plan, tree and status outputs', async () => {
    await run('scrum_release_create', { name: 'v1.0' })
    const planned = await run('scrum_sprint_plan', { goal: 'Ship v1', releaseId: 'rel-1' })
    expect(planned.text).toContain('for rel-1')

    const tree = await run('scrum_tree', {})
    expect(tree.text).toContain('(sprints: spr-1 planned)')
    expect(tree.text).toContain('→ rel-1 v1.0')

    const status = await run('scrum_sprint_status', { sprintId: 'spr-1' })
    expect(status.text).toContain('→ rel-1 v1.0')
  })

  it('links one sprint to multiple releases via releaseIds (v0.11)', async () => {
    await run('scrum_release_create', { name: 'v1.0' })
    await run('scrum_release_create', { name: 'v2.0' })

    const planned = await run('scrum_sprint_plan', { goal: 'Dual', releaseIds: ['rel-1', 'rel-2'] })
    expect(planned.text).toContain('for rel-1, rel-2')

    const tree = await run('scrum_tree', {})
    expect(tree.text).toContain('→ rel-1 v1.0, rel-2 v2.0')
  })

  it('replaces the linked-release set through scrum_item_update releaseIds', async () => {
    await run('scrum_release_create', { name: 'v1.0' })
    await run('scrum_release_create', { name: 'v2.0' })
    await run('scrum_sprint_plan', { goal: 'Swap', releaseId: 'rel-1' })

    expect((await run('scrum_item_update', { id: 'spr-1', releaseIds: ['rel-2'] })).text).toContain('Updated spr-1')
    const tree = await run('scrum_tree', {})
    expect(tree.text).toContain('→ rel-2 v2.0')
    expect(tree.text).not.toContain('→ rel-1 v1.0')

    // An unknown release id in the array is a business rejection.
    const bad = await run('scrum_item_update', { id: 'spr-1', releaseIds: ['rel-2', 'rel-9'] })
    expect(bad.isError).toBe(true)
    expect(bad.text).toContain('rel-9')
  })

  it('drives the trash and the archive through tool calls', async () => {
    await run('scrum_release_create', { name: 'v1.0' })
    await run('scrum_feature_create', { releaseId: 'rel-1', title: 'F' })
    await run('scrum_component_create', { featureId: 'feat-1', title: 'C' })
    await run('scrum_task_create', { componentId: 'comp-1', title: 'T' })

    expect((await run('scrum_trash_list', {})).text).toContain('empty')
    expect((await run('scrum_item_delete', { id: 'task-1' })).text).toContain('Moved to trash: task-1')
    expect((await run('scrum_trash_list', {})).text).toContain('task-1 T')
    expect((await run('scrum_tree', {})).text).not.toContain('task-1')
    expect((await run('scrum_item_restore', { id: 'task-1' })).text).toContain('Restored: task-1')

    expect((await run('scrum_item_archive', { id: 'task-1' })).text).toContain('Archived: task-1')
    expect((await run('scrum_archive_list', {})).text).toContain('task-1 T')
    expect((await run('scrum_item_unarchive', { id: 'task-1' })).text).toContain('Unarchived: task-1')

    await run('scrum_item_delete', { id: 'task-1' })
    expect((await run('scrum_item_purge', { id: 'task-1' })).text).toContain('Purged forever: task-1')
    const gone = await run('scrum_item_restore', { id: 'task-1' })
    expect(gone.isError).toBe(true)
    expect((await run('scrum_trash_empty', {})).text).toContain('already empty')
    expect((await run('scrum_archive_completed', {})).text).toContain('Nothing to archive')
  })

  it('routes each call to the calling session workspace board (v0.5)', async () => {
    const cwd = join(root, 'projeto-x')
    expect((await run('scrum_release_create', { name: 'X v1' }, cwd)).text).toContain('rel-1')

    // The global board (no cwd) stays empty; the workspace board sees it.
    expect((await run('scrum_tree', {})).text).toContain('Empty backlog')
    expect((await run('scrum_tree', {}, cwd)).text).toContain('X v1')

    // A sibling workspace is a different board with its own id sequence.
    const other = join(root, 'projeto-y')
    expect((await run('scrum_release_create', { name: 'Y v1' }, other)).text).toContain('rel-1')
    expect((await run('scrum_tree', {}, other)).text).not.toContain('X v1')
  })

  it('materializes business rejections as tool errors', async () => {
    const bad = await run('scrum_feature_create', { releaseId: 'rel-9', title: 'x' })
    expect(bad.isError).toBe(true)
    expect(bad.text).toContain('does not exist')

    const badColumn = await run('scrum_task_move', { taskId: 'task-1', column: 'sideways' })
    expect(badColumn.isError).toBe(true)
  })

  // ── v0.12: the spiral engine through the tool (comp-42, R6) — written before the code ──

  it('walks a component through the spiral with scrum_component_phase', async () => {
    await run('scrum_release_create', { name: 'v1.0' })
    await run('scrum_feature_create', { releaseId: 'rel-1', title: 'Login' })
    await run('scrum_component_create', { featureId: 'feat-1', title: 'OAuth' })
    expect(ctx.tools.schemas().map(s => s.name)).toContain('scrum_component_phase')

    // Gate refused: the tool reports the named condition as an error.
    const blocked = await run('scrum_component_phase', { id: 'comp-1', action: 'advance' })
    expect(blocked.isError).toBe(true)
    expect(blocked.text).toMatch(/requirements/)

    // Artifacts flow through scrum_item_update; the tree shows [status · phase].
    await run('scrum_item_update', { id: 'comp-1', requirements: 'R1 …', requirementsReview: 'reviewed' })
    const advanced = await run('scrum_component_phase', { id: 'comp-1', action: 'advance' })
    expect(advanced.isError).toBe(false)
    expect(advanced.text).toContain('comp-1 → design')
    expect((await run('scrum_tree', {})).text).toContain('comp-1 OAuth [in_progress · design]')

    // set: retreat freely, skip refused.
    const back = await run('scrum_component_phase', { id: 'comp-1', action: 'set', phase: 'requirements' })
    expect(back.text).toContain('comp-1 → requirements')
    const skip = await run('scrum_component_phase', { id: 'comp-1', action: 'set', phase: 'tdd' })
    expect(skip.isError).toBe(true)
    expect(skip.text).toMatch(/skip/)
  })

  it('validates scrum_component_phase arguments: set needs a phase, advance refuses one', async () => {
    await run('scrum_release_create', { name: 'v1.0' })
    await run('scrum_feature_create', { releaseId: 'rel-1', title: 'F' })
    await run('scrum_component_create', { featureId: 'feat-1', title: 'C' })
    const noPhase = await run('scrum_component_phase', { id: 'comp-1', action: 'set' })
    expect(noPhase.isError).toBe(true)
    expect(noPhase.text).toMatch(/phase/)
    const withPhase = await run('scrum_component_phase', { id: 'comp-1', action: 'advance', phase: 'design' })
    expect(withPhase.isError).toBe(true)
    expect(withPhase.text).toMatch(/advance/)
  })
})
