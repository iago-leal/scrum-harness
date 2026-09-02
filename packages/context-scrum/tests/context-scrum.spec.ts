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
import { CONTRACT_DESIGN, CONTRACT_REQ, contractReview } from '@scrum-harness/test-support/src/fixtures.ts'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { ScrumService } from '@scrum-harness/domain'
import type { ScrumBoard } from '@scrum-harness/domain'
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
    // Since comp-46 the parents carry their phase and checklist.
    expect(first).toContain('comp-1 [proposed · requirements → design: ')
    expect(first).toContain('Disciplina do board')
  })

  it('R4 (comp-45): prints the task kind as a prefix before the quoted title, nothing for other', async () => {
    const cwd = join(root, 'kinds')
    const board = await ctx.scrum.board(cwd)
    const release = await board.createRelease({ name: 'v1.0' })
    const feature = await board.createFeature({ releaseId: release.id, title: 'Login' })
    const component = await board.createComponent({ featureId: feature.id, title: 'OAuth' })
    const test = await board.createTask({ componentId: component.id, title: '[test] Gate red', estimate: 2 })
    const code = await board.createTask({ componentId: component.id, title: 'Gate green', kind: 'code' })
    const other = await board.createTask({ componentId: component.id, title: 'Docs' })
    const sprint = await board.planSprint({ goal: 'g', taskIds: [test.id, code.id, other.id] })
    await board.startSprint(sprint.id)
    const text = renderSprintContext(board)!
    expect(text).toContain('task-1 [test] "Gate red" (2pt)')
    expect(text).toContain('task-2 [code] "Gate green"')
    expect(text).toContain('task-3 "Docs"')
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

// ── comp-46: the snapshot knows the spiral (R2) and speaks between sprints (R3/R5) ──
//
// Written BEFORE the code. Two modes of the same pure function: with an
// active sprint, the parents carry phase + checklist and components in
// progress WITHOUT a task in the sprint get their own line; without one, a
// short idle snapshot (last/planned sprint, in progress, backlog, next step)
// — only on boards that use SCRUM (≥ 1 live component).

/** rel > feat > comp on one board; returns the board and the component id. */
async function seed(cwd: string, title = 'OAuth'): Promise<{ board: ScrumBoard; componentId: string }> {
  const board = await ctx.scrum.board(cwd)
  const release = await board.createRelease({ name: 'v1.0' })
  const feature = await board.createFeature({ releaseId: release.id, title: 'Login' })
  const component = await board.createComponent({ featureId: feature.id, title })
  return { board, componentId: component.id }
}

/** Requirements + review through the contract, design, then advance twice: the component lands in tdd. */
async function toTdd(board: ScrumBoard, id: string): Promise<void> {
  await board.updateItem(id, { requirements: CONTRACT_REQ })
  await board.updateItem(id, { requirementsReview: contractReview(board.reviewBrief(id).requirements.digest) })
  await board.advancePhase(id)
  await board.updateItem(id, { design: CONTRACT_DESIGN })
  await board.advancePhase(id)
}

/** The line of the snapshot starting with `label`, or undefined. */
function lineOf(text: string | null, label: string): string | undefined {
  return (text ?? '').split('\n').find(line => line.startsWith(label))
}

describe('snapshot with a sprint (comp-46 R2)', () => {
  it('R2: parents carry phase and checklist; releases and features keep their status only', async () => {
    const { board, componentId } = await seed(join(root, 'p'))
    await toTdd(board, componentId)
    const test = await board.createTask({ componentId, title: '[test] first', estimate: 2 })
    await board.advancePhase(componentId)
    const sprint = await board.planSprint({ goal: 'g', taskIds: [test.id] })
    await board.startSprint(sprint.id)
    const pais = lineOf(renderSprintContext(board), 'Pais:')
    expect(pais).toBe(`Pais: rel-1 [planned] · feat-1 [proposed] · comp-1 [in_progress · construction → validation: 1 task(s) not done (${test.id})]`)
    // Nothing in progress without a task in the sprint → no extra line.
    expect(lineOf(renderSprintContext(board), 'Em andamento')).toBeUndefined()
  })

  it('R2: a done component with a task in the sprint prints [done]; an ok checklist prints ok', async () => {
    const { board, componentId } = await seed(join(root, 'p'))
    await toTdd(board, componentId)
    const test = await board.createTask({ componentId, title: '[test] first' })
    await board.advancePhase(componentId)
    const sprint = await board.planSprint({ goal: 'g', taskIds: [test.id] })
    await board.startSprint(sprint.id)
    await board.moveTask(test.id, 'done')
    expect(lineOf(renderSprintContext(board), 'Pais:')).toContain('comp-1 [in_progress · construction → validation: ok]')
    await board.advancePhase(componentId)
    expect(lineOf(renderSprintContext(board), 'Pais:')).toContain('comp-1 [in_progress · validation → done: `validation` is empty')
    await board.updateItem(componentId, {
      status: 'done',
      validation: '---\nvalidated_at: 2026-09-02\nsuite: { tests: 1, passed: 1, wall_seconds: 1, budget_seconds: 10 }\ntypecheck: clean\n---\nok',
    })
    expect(lineOf(renderSprintContext(board), 'Pais:')).toContain('comp-1 [done]')
  })

  it('R2: reasons are cut at 160 chars with an ellipsis', async () => {
    const { board, componentId } = await seed(join(root, 'p'))
    await toTdd(board, componentId)
    const ids: string[] = []
    for (let i = 0; i < 30; i += 1) ids.push((await board.createTask({ componentId, title: `[test] t${i}` })).id)
    await board.advancePhase(componentId)
    const sprint = await board.planSprint({ goal: 'g', taskIds: ids })
    await board.startSprint(sprint.id)
    const pais = lineOf(renderSprintContext(board), 'Pais:')!
    const entry = /comp-1 \[in_progress · construction → validation: ([^\]]*)\]/.exec(pais)![1]!
    expect(entry.length).toBe(160)
    expect(entry.endsWith('…')).toBe(true)
    expect(entry).toMatch(/^30 task\(s\) not done \(task-1, task-2/)
  })

  it('R2: components in progress WITHOUT a task in the sprint get their own line — ≤ 5 with +N — and move to Pais: once they have one', async () => {
    const { board, componentId } = await seed(join(root, 'p'))
    // A sprint with no task at all (the state of the spr-16 dogfood).
    const sprint = await board.planSprint({ goal: 'g' })
    await board.startSprint(sprint.id)
    await board.updateItem(componentId, { status: 'in_progress' })
    let text = renderSprintContext(board)!
    expect(lineOf(text, 'Pais:')).toBeUndefined()
    const line = lineOf(text, 'Em andamento (sem task na sprint):')!
    expect(line).toMatch(/^Em andamento \(sem task na sprint\): comp-1 \[in_progress · requirements → design: `requirements` is empty/)
    // The line sits right after the columns when Pais: is absent.
    const lines = text.split('\n')
    expect(lines[lines.indexOf(line) - 1]).toMatch(/^done: /)

    // Six more in progress: five listed, +2 (comp-1 included in the count).
    for (let i = 0; i < 6; i += 1) {
      const c = await board.createComponent({ featureId: 'feat-1', title: `extra ${i}` })
      await board.updateItem(c.id, { status: 'in_progress' })
    }
    text = renderSprintContext(board)!
    const capped = lineOf(text, 'Em andamento (sem task na sprint):')!
    expect(capped.match(/comp-\d+ \[/g)).toHaveLength(5)
    expect(capped.endsWith(' +2')).toBe(true)
    expect(capped).toMatch(/comp-1 \[.*comp-5 \[/)

    // A task in the sprint moves the component to Pais:.
    const task = await board.createTask({ componentId, title: 'in sprint' })
    await board.assignTask(sprint.id, task.id, 'add')
    text = renderSprintContext(board)!
    expect(lineOf(text, 'Pais:')).toContain('comp-1 [in_progress · requirements → design: ')
    expect(lineOf(text, 'Em andamento (sem task na sprint):')).not.toContain('comp-1 [')
    const after = text.split('\n')
    expect(after.indexOf(lineOf(text, 'Em andamento (sem task na sprint):')!)).toBe(after.indexOf(lineOf(text, 'Pais:')!) + 1)
  })

  it('R2: the discipline sentence teaches the spiral, including the last step through status done', async () => {
    const { board, componentId } = await seed(join(root, 'p'))
    const task = await board.createTask({ componentId, title: 't' })
    const sprint = await board.planSprint({ goal: 'g', taskIds: [task.id] })
    await board.startSprint(sprint.id)
    const text = renderSprintContext(board)!
    expect(text).toMatch(/Espiral: quando o checklist de um componente zerar, avance com scrum_component_phase \(action check lê sem mover\); em tdd, crie as tasks \[test\] antes das \[code\]; de validation para done use scrum_item_update status done com o artefato validation\./)
  })
})

describe('snapshot without a sprint (comp-46 R3/R5)', () => {
  it('R3: nothing on an empty board; a live component turns the idle mode on', async () => {
    const board = await ctx.scrum.board(join(root, 'empty'))
    expect(renderSprintContext(board)).toBeNull()
    await board.createRelease({ name: 'v1.0' })
    await board.createFeature({ releaseId: 'rel-1', title: 'F' })
    expect(renderSprintContext(board)).toBeNull()

    const { board: used } = await seed(join(root, 'used'))
    const text = renderSprintContext(used)!
    expect(text.split('\n')).toEqual([
      '[SCRUM · sem sprint ativa] nenhuma sprint ainda',
      'Em andamento: —',
      'Backlog: comp-1 "OAuth" [requirements]',
      'Próximo passo: planeje a sprint (scrum_sprint_plan) com as tasks do componente escolhido; abra-o pela espiral (requisitos → brief → revisão → design → tdd).',
    ])
  })

  it('R3: the highest-numbered sprint heads the snapshot — última after endSprint (delivered totals), planejada when planned; only active returns to the sprint mode', async () => {
    const { board, componentId } = await seed(join(root, 'p'))
    const done = await board.createTask({ componentId, title: 'done one', estimate: 3 })
    const open = await board.createTask({ componentId, title: 'left open', estimate: 5 })
    const goal = 'x'.repeat(200)
    const sprint = await board.planSprint({ goal, taskIds: [done.id, open.id] })
    await board.startSprint(sprint.id)
    expect(renderSprintContext(board)).toMatch(/^\[SCRUM · sprint ativa spr-1/)
    await board.moveTask(done.id, 'done')
    await board.endSprint()
    let text = renderSprintContext(board)!
    // Delivered = what stayed done in the sprint (the open task went back to the backlog).
    expect(lineOf(text, '[SCRUM')).toBe(`[SCRUM · sem sprint ativa] última: spr-1 #1 [completed] 1 tasks · 3 pts entregues — "${'x'.repeat(119)}…"`)
    expect(lineOf(text, 'Próximo passo:')).toMatch(/^Próximo passo: planeje a sprint/)

    const planned = await board.planSprint({ goal: 'g2', taskIds: [open.id] })
    text = renderSprintContext(board)!
    expect(lineOf(text, '[SCRUM')).toBe('[SCRUM · sem sprint ativa] planejada: spr-2 #2 [planned] 1 tasks · 5 pts — "g2"')
    expect(lineOf(text, 'Próximo passo:')).toBe('Próximo passo: inicie a sprint (scrum_sprint_start spr-2)')
    // Two planned sprints: the highest number wins.
    await board.planSprint({ goal: 'g3' })
    expect(lineOf(renderSprintContext(board), 'Próximo passo:')).toBe('Próximo passo: inicie a sprint (scrum_sprint_start spr-3)')
    expect(lineOf(renderSprintContext(board), '[SCRUM')).toMatch(/planejada: spr-3 #3 \[planned\] 0 tasks · 0 pts/)

    await board.startSprint(planned.id)
    expect(renderSprintContext(board)).toMatch(/^\[SCRUM · sprint ativa spr-2/)
  })

  it('R3: Em andamento lists ≤ 5 in progress with reasons cut at 100; Backlog lists ≤ 6 proposed with titles cut at 48; +N beyond', async () => {
    const { board, componentId } = await seed(join(root, 'p'))
    await board.updateItem(componentId, { status: 'in_progress', requirements: 'free text', requirementsReview: 'free text' })
    for (let i = 0; i < 6; i += 1) {
      const c = await board.createComponent({ featureId: 'feat-1', title: `progress ${i}` })
      await board.updateItem(c.id, { status: 'in_progress' })
    }
    for (let i = 0; i < 8; i += 1) await board.createComponent({ featureId: 'feat-1', title: `a proposed component with a title longer than forty-eight chars ${i}` })
    const text = renderSprintContext(board)!
    const progress = lineOf(text, 'Em andamento:')!
    expect(progress.match(/comp-\d+ \[/g)).toHaveLength(5)
    expect(progress.endsWith(' +2')).toBe(true)
    const first = /comp-1 \[in_progress · requirements → design: ([^\]]*)\]/.exec(progress)![1]!
    expect(first.length).toBe(100)
    expect(first.endsWith('…')).toBe(true)
    const backlog = lineOf(text, 'Backlog:')!
    expect(backlog.match(/comp-\d+ "/g)).toHaveLength(6)
    expect(backlog.endsWith(' +2')).toBe(true)
    expect(backlog).toContain(`comp-8 "${'a proposed component with a title longer than forty-eight chars 0'.slice(0, 47)}…" [requirements]`)
  })

  it('R3: a board with only done components points to creating or archiving', async () => {
    const { board, componentId } = await seed(join(root, 'p'))
    await toTdd(board, componentId)
    const test = await board.createTask({ componentId, title: '[test] t' })
    await board.advancePhase(componentId)
    const sprint = await board.planSprint({ goal: 'g', taskIds: [test.id] })
    await board.startSprint(sprint.id)
    await board.moveTask(test.id, 'done')
    await board.endSprint()
    await board.advancePhase(componentId)
    await board.updateItem(componentId, {
      status: 'done',
      validation: '---\nvalidated_at: 2026-09-02\nsuite: { tests: 1, passed: 1, wall_seconds: 1, budget_seconds: 10 }\ntypecheck: clean\n---\nok',
    })
    const text = renderSprintContext(board)!
    expect(lineOf(text, 'Em andamento:')).toBe('Em andamento: —')
    expect(lineOf(text, 'Backlog:')).toBe('Backlog: —')
    expect(lineOf(text, 'Próximo passo:')).toBe('Próximo passo: crie o próximo componente (scrum_component_create) ou arquive os concluídos (scrum_item_archive)')
  })

  it('R5: the worst case stays ≤ 1800 chars — 20 proposed with long titles and 10 in progress with long reasons', async () => {
    const { board, componentId } = await seed(join(root, 'p'), 'a proposed component with a title longer than forty-eight characters 0')
    const sprint = await board.planSprint({ goal: 'g'.repeat(300), taskIds: [] })
    await board.startSprint(sprint.id)
    await board.endSprint()
    for (let i = 1; i < 20; i += 1) await board.createComponent({ featureId: 'feat-1', title: `a proposed component with a title longer than forty-eight characters ${i}` })
    for (let i = 0; i < 10; i += 1) {
      const c = await board.createComponent({ featureId: 'feat-1', title: `in progress ${i}` })
      await board.updateItem(c.id, { status: 'in_progress', requirements: 'x', requirementsReview: 'x' })
      expect(board.phaseReadiness(c.id).reasons.join('; ').length).toBeGreaterThan(100)
    }
    expect(componentId).toBe('comp-1')
    const text = renderSprintContext(board)!
    expect(text.split('\n')).toHaveLength(4)
    expect(text.length).toBeLessThanOrEqual(1800)
    expect(lineOf(text, 'Em andamento:')!.endsWith(' +5')).toBe(true)
    expect(lineOf(text, 'Backlog:')!.endsWith(' +14')).toBe(true)
  })

  it('R5: deterministic — two renders are identical and daysRemaining never leaks, with or without a sprint', async () => {
    const { board, componentId } = await seed(join(root, 'p'))
    const task = await board.createTask({ componentId, title: 't' })
    const sprint = await board.planSprint({ goal: 'g', taskIds: [task.id], endDate: '2099-01-01' })
    expect(renderSprintContext(board)).toBe(renderSprintContext(board))
    expect(renderSprintContext(board)).not.toMatch(/day/)
    await board.startSprint(sprint.id)
    expect(renderSprintContext(board)).toBe(renderSprintContext(board))
    expect(renderSprintContext(board)).not.toMatch(/day/)
  })
})

describe('pre-step listener between sprints (comp-46 R3/R5)', () => {
  it('R3: ending the sprint changes the key — the next turn gets the idle snapshot; planning and starting change it again', async () => {
    const cwd = join(root, 'projeto')
    const { board, componentId } = await seed(cwd)
    const task = await board.createTask({ componentId, title: 't' })
    const sprint = await board.planSprint({ goal: 'g', taskIds: [task.id] })
    await board.startSprint(sprint.id)
    const agent = agentFor(cwd)

    const a = injectedTexts(await run(agent))
    expect(a[0]).toMatch(/^\[SCRUM · sprint ativa/)
    await board.moveTask(task.id, 'done')
    await board.endSprint()
    expect(injectedTexts(await run(agent, 2))).toEqual([])
    const b = injectedTexts(await run(agent))
    expect(b).toHaveLength(1)
    expect(b[0]).toMatch(/^\[SCRUM · sem sprint ativa\] última: spr-1/)
    expect(injectedTexts(await run(agent))).toEqual([])

    const planned = await board.planSprint({ goal: 'g2' })
    const c = injectedTexts(await run(agent))
    expect(c[0]).toMatch(/planejada: spr-2/)
    await board.startSprint(planned.id)
    const d = injectedTexts(await run(agent))
    expect(d[0]).toMatch(/^\[SCRUM · sprint ativa spr-2/)
  })

  it('R5: every agent instance pays the idle snapshot once — two agents on the same workspace', async () => {
    const cwd = join(root, 'projeto')
    await seed(cwd)
    const one = injectedTexts(await run(agentFor(cwd)))
    const two = injectedTexts(await run(agentFor(cwd)))
    expect(one).toHaveLength(1)
    expect(two).toEqual(one)
    expect(one[0]).toMatch(/^\[SCRUM · sem sprint ativa\] nenhuma sprint ainda/)
    // A workspace without SCRUM stays silent.
    expect(injectedTexts(await run(agentFor(join(root, 'sem-scrum'))))).toEqual([])
  })
})
