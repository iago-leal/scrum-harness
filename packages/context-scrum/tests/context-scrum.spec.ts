/**
 * Integration tests of the board-aware agent context: real storage stack +
 * real boards; the pre-step listener is exercised directly (exported factory)
 * with stub agents, exactly the subset it reads (session header cwd).
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageMemory from '@scrum-harness/test-support/src/index.ts'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { ScrumService } from '@scrum-harness/domain'
import { createPreStepListener, renderSprintContext } from '../src/index.ts'

// Test infrastructure (comp-50 R5): one Context per file over the in-memory
// backend; every test gets its own `root` prefix, so the workspaces it names
// (`join(root, 'projeto')`) are boards nobody else touches. Agents without a
// cwd read the global board, which no test ever writes to.

const filePrefix = join(tmpdir(), 'context-scrum-boards')
/** Per-test prefix: the workspaces of one test never collide with another's. */
let root: string
let ctx: Context
let listener: ReturnType<typeof createPreStepListener>
let tests = 0

beforeAll(async () => {
  ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(StorageMemory)
  await ctx.plugin(StorageDomain, { backend: StorageMemory.MEMORY_BACKEND })
  await ctx.plugin(ScrumService)
  listener = createPreStepListener(ctx)
})

afterAll(async () => {
  await ctx.dispose?.()
})

beforeEach(() => {
  root = join(filePrefix, `t-${++tests}`)
})

/** Stub agent carrying only the subset the listener reads. */
function agentFor(cwd?: string): Agent {
  return { session: { header: cwd === undefined ? {} : { cwd } } } as unknown as Agent
}

/** Run the listener as the waterfall would (empty upstream decision). */
async function run(agent: Agent, step = 1): Promise<PreStepDecision> {
  return listener(
    { agent, step, signal: new AbortController().signal },
    async () => ({ kind: 'enter', messages: [] }),
  )
}

/** The injected texts of one decision (empty when nothing was injected). */
function injectedTexts(decision: PreStepDecision): string[] {
  if (decision.kind !== 'enter') return []
  return decision.messages.map((message) => {
    const first = (message as { content: { type: string; text?: string }[] }).content[0]
    return first?.text ?? ''
  })
}

/** Seed one board with rel > feat > comp > task and an active sprint. */
async function seedActiveSprint(cwd: string): Promise<{ taskId: string }> {
  const board = await ctx.scrum.board(cwd)
  const release = await board.createRelease({ name: 'v1.0' })
  const feature = await board.createFeature({ releaseId: release.id, title: 'Login' })
  const component = await board.createComponent({ featureId: feature.id, title: 'OAuth' })
  const task = await board.createTask({ componentId: component.id, title: 'Tokens', estimate: 3 })
  const sprint = await board.planSprint({ goal: 'Entregar login', taskIds: [task.id] })
  await board.startSprint(sprint.id)
  return { taskId: task.id }
}

describe('renderSprintContext', () => {
  it('returns null without an active sprint and a deterministic snapshot with one', async () => {
    const cwd = join(root, 'projeto')
    const board = await ctx.scrum.board(cwd)
    expect(renderSprintContext(board)).toBeNull()

    await seedActiveSprint(cwd)
    const first = renderSprintContext(board)
    const again = renderSprintContext(board)
    expect(first).not.toBeNull()
    expect(again).toBe(first)
    expect(first).toContain('spr-1')
    expect(first).toContain('task-1 "Tokens" (3pt)')
    expect(first).toContain('comp-1 [proposed]')
    expect(first).toContain('Disciplina do board')
  })
})

describe('pre-step listener', () => {
  it('injects nothing without an active sprint', async () => {
    const decision = await run(agentFor(join(root, 'vazio')))
    expect(injectedTexts(decision)).toEqual([])
  })

  it('injects once, stays quiet while unchanged, re-injects on change, first step only', async () => {
    const cwd = join(root, 'projeto')
    const { taskId } = await seedActiveSprint(cwd)
    const agent = agentFor(cwd)

    const first = injectedTexts(await run(agent))
    expect(first).toHaveLength(1)
    expect(first[0]).toContain('todo: task-1')

    // Unchanged board → no repeat.
    expect(injectedTexts(await run(agent))).toEqual([])

    // Board changed → fresh snapshot at the next turn's first step…
    const board = await ctx.scrum.board(cwd)
    await board.moveTask(taskId, 'in_progress')
    // …but never at later steps of a turn.
    expect(injectedTexts(await run(agent, 2))).toEqual([])
    const after = injectedTexts(await run(agent))
    expect(after).toHaveLength(1)
    expect(after[0]).toContain('in_progress: task-1')
  })

  it('routes each agent to its own workspace board (global fallback included)', async () => {
    const cwd = join(root, 'projeto')
    await seedActiveSprint(cwd)

    // A sibling workspace and the global board have no active sprint.
    expect(injectedTexts(await run(agentFor(join(root, 'outro'))))).toEqual([])
    expect(injectedTexts(await run(agentFor()))).toEqual([])

    // Distinct agents on the same workspace each get their own first snapshot.
    const one = injectedTexts(await run(agentFor(cwd)))
    const two = injectedTexts(await run(agentFor(cwd)))
    expect(one).toHaveLength(1)
    expect(two).toHaveLength(1)
    expect(two[0]).toBe(one[0])
  })
})
