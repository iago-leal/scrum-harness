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

/** Run one tool through the registry; returns the text of the first block. */
async function run(name: string, args: unknown): Promise<{ isError: boolean; text: string }> {
  const result = await ctx.tools.execute({
    callId: `call-${++calls}` as CallId,
    name,
    arguments: args,
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

  it('materializes business rejections as tool errors', async () => {
    const bad = await run('scrum_feature_create', { releaseId: 'rel-9', title: 'x' })
    expect(bad.isError).toBe(true)
    expect(bad.text).toContain('does not exist')

    const badColumn = await run('scrum_task_move', { taskId: 'task-1', column: 'sideways' })
    expect(badColumn.isError).toBe(true)
  })
})
