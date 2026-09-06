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
import { hygiene } from '../src/snapshot.ts'

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

  it('comp-53 D4 / comp-54 R2: cut() measures code points at the Model limit — an 80-code-point title with astral emoji is printed whole', async () => {
    const { board, componentId } = await seed(join(root, 'p'))
    const whole = `${'😀'.repeat(10)}${'x'.repeat(70)}` // 80 code points, 90 UTF-16 units — valid, printed whole
    const a = await board.createTask({ componentId, title: whole, description: 'd' })
    const sprint = await board.planSprint({ goal: 'g', taskIds: [a.id] })
    await board.startSprint(sprint.id)
    const todo = lineOf(renderSprintContext(board), 'todo:')!
    expect(todo).toContain(`${a.id} "${whole}"`)
  })

  it('comp-54 R2: a LEGACY task title over the limit is cut at 80 code points with …, and a legacy goal is cut at 120 in the active header (stub board)', () => {
    const text = renderSprintContext(stubBoard({
      goal: 'G'.repeat(850),
      tasks: [{ id: 'task-9', title: `${'😀'.repeat(10)}${'L'.repeat(290)}`, status: 'todo', description: 'd' }],
    }))!
    expect(lineOf(text, '[SCRUM')).toBe(`[SCRUM · sprint ativa spr-1 #1] ${'G'.repeat(119)}…`)
    expect(lineOf(text, 'todo:')).toContain(`task-9 "${'😀'.repeat(10)}${'L'.repeat(69)}…"`)
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
    // comp-53 D5: a valid goal is ≤ 120 code points and is printed whole (GOAL_CHARS = 120).
    const goal = 'x'.repeat(120)
    const sprint = await board.planSprint({ goal, taskIds: [done.id, open.id] })
    await board.startSprint(sprint.id)
    expect(renderSprintContext(board)).toMatch(/^\[SCRUM · sprint ativa spr-1/)
    await board.moveTask(done.id, 'done')
    await board.endSprint()
    let text = renderSprintContext(board)!
    // Delivered = what stayed done in the sprint (the open task went back to the backlog).
    expect(lineOf(text, '[SCRUM')).toBe(`[SCRUM · sem sprint ativa] última: spr-1 #1 [completed] 1 tasks · 3 pts entregues — "${'x'.repeat(120)}"`)
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

  it('R3: Em andamento lists ≤ 5 in progress with reasons cut at 100; Backlog lists ≤ 6 proposed with titles printed whole up to 80 (comp-54 R2); +N beyond', async () => {
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
    expect(backlog).toContain('comp-8 "a proposed component with a title longer than forty-eight chars 0" [requirements]')
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
    const sprint = await board.planSprint({ goal: 'g'.repeat(120), taskIds: [] })
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

// ── comp-54: the hygiene line and the Model's cut widths (R2, R3, R5) — written before the code ──

/** A duck-typed board: the four reads the snapshot makes, with legacy (over-limit) records the service would refuse to create. */
function stubBoard(input: {
  goal?: string
  status?: 'active' | 'completed' | 'planned'
  tasks?: { id: string; title: string; status: 'todo' | 'in_progress' | 'review' | 'done'; description?: string }[]
  components?: { id: string; title: string }[]
}): ScrumBoard {
  const limits = { title: 80, goal: 120 }
  const over = (kind: 'title' | 'goal', text: string) => {
    const length = [...text].length
    const limit = limits[kind]
    return length > limit ? { length, limit } : undefined
  }
  const goal = input.goal ?? 'g'
  const status = input.status ?? 'active'
  const sprint = { id: 'spr-1', number: 1, goal, releaseIds: [], status, createdAt: '', updatedAt: '', ...over('goal', goal) === undefined ? {} : { goalOverflow: over('goal', goal) } }
  const tasks = (input.tasks ?? []).map((t, i) => ({
    ...t, componentId: 'comp-1', kind: 'other' as const, sprintId: 'spr-1', order: i, createdAt: '', updatedAt: '',
    ...over('title', t.title) === undefined ? {} : { titleOverflow: over('title', t.title) },
  }))
  const components = (input.components ?? []).map((c, i) => ({
    ...c, featureId: 'feat-1', status: 'proposed' as const, phase: 'requirements' as const, phaseLog: [], order: i, createdAt: '', updatedAt: '',
    tasks: [], readyForDone: false, readiness: { phase: 'requirements', next: 'design', ok: false, reasons: ['x'], status: 'proposed' }, traces: { source: null, entries: [], ids: [], untraced: [], unknown: [], nocode: [], unproven: [], files: [], tests: [], issues: [] },
    ...over('title', c.title) === undefined ? {} : { titleOverflow: over('title', c.title) },
  }))
  const tree = { releases: [{ id: 'rel-1', name: 'R', status: 'active', order: 0, createdAt: '', updatedAt: '', features: [{ id: 'feat-1', releaseId: 'rel-1', title: 'F', status: 'in_progress', order: 0, createdAt: '', updatedAt: '', components }] }] }
  const done = tasks.filter(t => t.status === 'done')
  const totals = { tasks: tasks.length, done: done.length, points: 0, pointsDone: 0 }
  return {
    titleLimits: () => limits,
    tree: () => tree,
    sprints: () => [sprint],
    activeSprint: () => (status === 'active' ? sprint : undefined),
    sprintStatus: () => ({ sprint, tasks, totals }),
  } as unknown as ScrumBoard
}

describe('hygiene line (comp-54 R3)', () => {
  const limits = { title: 80, goal: 120 }
  const sprint = (goal = 'g') => ({ id: 'spr-1', number: 1, goal, releaseIds: [], status: 'active' as const, createdAt: '', updatedAt: '', ...[...goal].length > 120 ? { goalOverflow: { length: [...goal].length, limit: 120 } } : {} })
  const task = (id: string, title: string, description?: string, status: 'todo' | 'done' = 'todo', legacy = false) => ({
    id, componentId: 'comp-1', title, kind: 'other' as const, status, order: 0, createdAt: '', updatedAt: '',
    ...description === undefined ? {} : { description },
    ...legacy ? { titleOverflow: { length: [...title].length, limit: 80 } } : {},
  })

  it('is null when every open task has a description, no title is near the limit and nothing is legacy', () => {
    expect(hygiene([task('task-1', 'short', 'd')], sprint(), limits)).toBeNull()
    expect(hygiene([], sprint(), limits)).toBeNull()
  })

  it('(a) counts open tasks whose description is absent, empty or blank — capped at 3 ids with +N — and ends with the reminder', () => {
    const tasks = [task('task-1', 'a'), task('task-2', 'b', ''), task('task-3', 'c', '   '), task('task-4', 'd'), task('task-5', 'e', 'ok')]
    expect(hygiene(tasks, sprint(), limits)).toBe('Higiene: 4 task(s) da sprint sem descrição (task-1, task-2, task-3 +1) — o título é o QUÊ; o COMO vai na descrição.')
  })

  it('(b) counts open tasks in the warn band (64–80 code points) with their N/80', () => {
    const tasks = [task('task-1', 'x'.repeat(63), 'd'), task('task-2', 'x'.repeat(64), 'd'), task('task-3', '😀'.repeat(80), 'd')]
    expect(hygiene(tasks, sprint(), limits)).toBe('Higiene: 2 título(s) perto do limite (task-2 64/80, task-3 80/80) — o título é o QUÊ; o COMO vai na descrição.')
  })

  it('(c) counts open legacy tasks over the limit and the sprint goal itself', () => {
    const tasks = [task('task-9', 'L'.repeat(300), 'd', 'todo', true)]
    expect(hygiene(tasks, sprint('G'.repeat(850)), limits))
      .toBe('Higiene: 2 legado(s) acima do limite (task-9 300/80, spr-1 meta 850/120) — o título é o QUÊ; o COMO vai na descrição.')
    expect(hygiene([], sprint('G'.repeat(850)), limits)).toBe('Higiene: 1 legado(s) acima do limite (spr-1 meta 850/120) — o título é o QUÊ; o COMO vai na descrição.')
  })

  it('the three parts join with · in the order a · b · c', () => {
    const tasks = [task('task-1', 'a'), task('task-2', 'x'.repeat(70), 'd'), task('task-3', 'L'.repeat(90), 'd', 'todo', true)]
    expect(hygiene(tasks, sprint(), limits)).toBe('Higiene: 1 task(s) da sprint sem descrição (task-1) · 1 título(s) perto do limite (task-2 70/80) · 1 legado(s) acima do limite (task-3 90/80) — o título é o QUÊ; o COMO vai na descrição.')
  })

  it('done tasks are history and never count — in (a), (b) or (c) (D1)', () => {
    const tasks = [task('task-1', 'a', undefined, 'done'), task('task-2', 'x'.repeat(75), 'd', 'done'), task('task-3', 'L'.repeat(300), 'd', 'done', true)]
    expect(hygiene(tasks, sprint(), limits)).toBeNull()
  })
})

describe('hygiene line in the two modes (comp-54 R3/R5)', () => {
  it('active: the line sits after Pais:/Em andamento and before the discipline; absent when clean', async () => {
    const { board, componentId } = await seed(join(root, 'p'))
    const clean = await board.createTask({ componentId, title: 'with description', description: 'yes' })
    const dirty = await board.createTask({ componentId, title: 'no description' })
    const sprint = await board.planSprint({ goal: 'g', taskIds: [clean.id, dirty.id] })
    await board.startSprint(sprint.id)
    const lines = renderSprintContext(board)!.split('\n')
    const at = lines.findIndex(l => l.startsWith('Higiene:'))
    expect(lines[at]).toBe(`Higiene: 1 task(s) da sprint sem descrição (${dirty.id}) — o título é o QUÊ; o COMO vai na descrição.`)
    expect(lines[at - 1]!.startsWith('Pais:')).toBe(true)
    expect(lines[at + 1]!.startsWith('Disciplina do board')).toBe(true)
    await board.updateItem(dirty.id, { description: 'now yes' })
    expect(renderSprintContext(board)).not.toMatch(/Higiene:/)
  })

  it('idle: only the legacy goal of the latest sprint can show, after Backlog: and before Próximo passo: (D3) — via stub', () => {
    const text = renderSprintContext(stubBoard({ goal: 'G'.repeat(850), status: 'completed', components: [{ id: 'comp-1', title: 'C' }] }))!
    const lines = text.split('\n')
    expect(lines[0]).toBe(`[SCRUM · sem sprint ativa] última: spr-1 #1 [completed] 0 tasks · 0 pts entregues — "${'G'.repeat(119)}…"`)
    expect(lines[2]!.startsWith('Backlog:')).toBe(true)
    expect(lines[3]).toBe('Higiene: 1 legado(s) acima do limite (spr-1 meta 850/120) — o título é o QUÊ; o COMO vai na descrição.')
    expect(lines[4]!.startsWith('Próximo passo:')).toBe(true)
    // A legacy component title in the backlog is cut at 80 with … (R2).
    const wide = renderSprintContext(stubBoard({ status: 'completed', components: [{ id: 'comp-1', title: 'W'.repeat(100) }] }))!
    expect(lineOf(wide, 'Backlog:')).toContain(`comp-1 "${'W'.repeat(79)}…"`)
    expect(wide).not.toMatch(/Higiene:/)
  })

  it('R5 sentinel: 30 open tasks of 80 chars without description — the active snapshot measured 3855 chars (sentinel 3900, not a budget — D5) and Higiene caps at 3 ids', async () => {
    const { board, componentId } = await seed(join(root, 'p'))
    const ids: string[] = []
    for (let i = 0; i < 30; i += 1) ids.push((await board.createTask({ componentId, title: `${String(i).padStart(2, '0')}${'t'.repeat(78)}` })).id)
    const sprint = await board.planSprint({ goal: 'g'.repeat(120), taskIds: ids })
    await board.startSprint(sprint.id)
    const text = renderSprintContext(board)!
    expect(text.length).toBeLessThanOrEqual(3900)
    expect(lineOf(text, 'Higiene:')).toBe('Higiene: 30 task(s) da sprint sem descrição (task-1, task-2, task-3 +27) · 30 título(s) perto do limite (task-1 80/80, task-2 80/80, task-3 80/80 +27) — o título é o QUÊ; o COMO vai na descrição.')
  })
})
