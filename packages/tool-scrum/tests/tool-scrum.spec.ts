/**
 * Integration tests of the SCRUM tool family: real tool registry + real
 * storage stack; calls go through ctx.tools.execute exactly as the agent
 * loop dispatches them.
 */

import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageMemory from '@scrum-harness/test-support/src/index.ts'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { CallId } from '@deepseek-ai/dsh-tools'
import { ScrumService } from '@scrum-harness/domain'
import * as ToolScrum from '../src/index.ts'


/** Approved v1 requirements + an approved review covering them (review contract of comp-48). */
const REQ_BODY = 'R1 — must work.'
const CONTRACT_REQ = `---\nversion: 1\nstatus: approved\n---\n${REQ_BODY}`
const CONTRACT_REVIEW = `---\nreviewer: subagent\nreviewed_version: 1\nreviewed_digest: ${createHash('sha1').update(REQ_BODY).digest('hex').slice(0, 8)}\nverdict: approved\nround: 1\nfindings: { high: 0, medium: 0, low: 0 }\n---\nNo blocking finding.`

// Test infrastructure (comp-50 R5): one Context per file over the in-memory
// backend; every test gets its own workspace board through the session cwd
// the tools route by. Nothing here writes to the global board except the
// routing test, which opts out explicitly with `{ cwd: null }`.

/** A path prefix for the boards of this file (never touches the disk). */
const root = join(tmpdir(), 'tool-scrum-boards')
let ctx: Context
let calls = 0
let boards = 0
/** The workspace of the CURRENT test — `run()` routes there by default. */
let currentWs: string

beforeAll(async () => {
  ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(StorageMemory)
  await ctx.plugin(StorageDomain, { backend: StorageMemory.MEMORY_BACKEND })
  await ctx.plugin(ScrumService)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(ToolRuntime, {})
  await ctx.plugin(ToolScrum)
})

afterAll(async () => {
  await ctx.dispose?.()
})

beforeEach(() => {
  currentWs = join(root, `ws-${++boards}`)
})

/**
 * Run one tool through the registry; returns the text of the first block.
 * `cwd` simulates the calling session's workspace (agent → session header),
 * exactly the field the tools route boards by. Defaults to the current
 * test's workspace; `null` calls WITHOUT a cwd (global board) — only the
 * routing test does that.
 */
async function run(name: string, args: unknown, options: { cwd?: string | null } = {}): Promise<{ isError: boolean; text: string }> {
  const cwd = options.cwd === undefined ? currentWs : options.cwd
  const result = await ctx.tools.execute({
    callId: `call-${++calls}` as CallId,
    name,
    arguments: args,
    ...cwd === null ? {} : { agent: { session: { header: { cwd } } } as never },
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

  it('R5: routes each call to the calling session workspace board; no cwd → the global board (v0.5)', async () => {
    const cwd = join(root, 'projeto-x')
    expect((await run('scrum_release_create', { name: 'X v1' }, { cwd })).text).toContain('rel-1')

    // A call WITHOUT a cwd reaches the global board, which never saw that
    // release (the opt-out is explicit: every other call in this file carries a cwd).
    expect((await run('scrum_tree', {}, { cwd: null })).text).toContain('Empty backlog')
    expect((await run('scrum_tree', {}, { cwd })).text).toContain('X v1')

    // A sibling workspace is a different board with its own id sequence.
    const other = join(root, 'projeto-y')
    expect((await run('scrum_release_create', { name: 'Y v1' }, { cwd: other })).text).toContain('rel-1')
    expect((await run('scrum_tree', {}, { cwd: other })).text).not.toContain('X v1')
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
    await run('scrum_item_update', { id: 'comp-1', requirements: CONTRACT_REQ, requirementsReview: CONTRACT_REVIEW })
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

  // ── v0.13: the review brief tool and the early contract warning (comp-48, R4/R7) ──

  it('scrum_component_review_brief renders the brief from the component state, or refuses by name', async () => {
    await run('scrum_release_create', { name: 'v1.0' })
    await run('scrum_feature_create', { releaseId: 'rel-1', title: 'F' })
    await run('scrum_component_create', { featureId: 'feat-1', title: 'Gate' })
    expect(ctx.tools.schemas().map(s => s.name)).toContain('scrum_component_review_brief')

    const empty = await run('scrum_component_review_brief', { id: 'comp-1' })
    expect(empty.isError).toBe(true)
    expect(empty.text).toMatch(/`requirements` is empty/)

    await run('scrum_item_update', { id: 'comp-1', requirements: CONTRACT_REQ })
    const brief = await run('scrum_component_review_brief', { id: 'comp-1' })
    expect(brief.isError).toBe(false)
    expect(brief.text).toMatch(/comp-1/)
    expect(brief.text).toMatch(/House conventions/)
    expect(brief.text).toMatch(/MVC/)
    expect(brief.text).toMatch(/reviewed_version: 1/)
    expect(brief.text).toMatch(/reviewed_digest: "[0-9a-f]{8}"/)
    expect(brief.text).toMatch(new RegExp(REQ_BODY))
  })

  it('scrum_item_update warns about the review contract when it touches the artifacts (no blocking)', async () => {
    await run('scrum_release_create', { name: 'v1.0' })
    await run('scrum_feature_create', { releaseId: 'rel-1', title: 'F' })
    await run('scrum_component_create', { featureId: 'feat-1', title: 'Gate' })

    const draft = await run('scrum_item_update', { id: 'comp-1', requirements: CONTRACT_REQ, requirementsReview: 'draft notes' })
    expect(draft.isError).toBe(false)
    expect(draft.text).toMatch(/Updated comp-1/)
    expect(draft.text).toMatch(/review contract: .*`requirementsReview` frontmatter missing or malformed.*will block requirements → design/)

    const ok = await run('scrum_item_update', { id: 'comp-1', requirementsReview: CONTRACT_REVIEW })
    expect(ok.text).toMatch(/review contract: ok/)

    // Patches that do not touch the artifacts stay quiet.
    const title = await run('scrum_item_update', { id: 'comp-1', title: 'Gate hard' })
    expect(title.text).not.toMatch(/review contract/)
  })

  // ── comp-47: the done gate through the tool (R6) — written before the code ──

  it('R6: scrum_item_update warns about the validation contract and refuses done with every reason', async () => {
    await run('scrum_release_create', { name: 'v1.0' })
    await run('scrum_feature_create', { releaseId: 'rel-1', title: 'F' })
    await run('scrum_component_create', { featureId: 'feat-1', title: 'Gate' })

    const draft = await run('scrum_item_update', { id: 'comp-1', validation: 'evidence without frontmatter' })
    expect(draft.isError).toBe(false)
    expect(draft.text).toMatch(/validation contract: .*`validation` frontmatter missing or malformed/)

    // Both contracts touched in one patch → one line each.
    const both = await run('scrum_item_update', { id: 'comp-1', requirements: CONTRACT_REQ, validation: 'still no frontmatter' })
    expect(both.text).toMatch(/review contract: /)
    expect(both.text).toMatch(/validation contract: /)

    const done = await run('scrum_item_update', { id: 'comp-1', status: 'done' })
    expect(done.isError).toBe(true)
    expect(done.text).toMatch(/phase is requirements \(needs validation\)/)
    expect(done.text).toMatch(/no task under the component/)
    expect(done.text).toMatch(/cannot set status done/)
  })
})

// ── comp-50: the suite budget through the tools (R3, R4) — written before the code ──

describe('suite budget tools (comp-50)', () => {
  it('R3: scrum_suite_budget reads, sets, refuses a raise without a reason, and removes', async () => {
    expect(ctx.tools.schemas().map(s => s.name)).toContain('scrum_suite_budget')
    expect((await run('scrum_suite_budget', {})).text).toBe('suite budget: 15s (default)')

    expect((await run('scrum_suite_budget', { seconds: 12 })).text).toMatch(/^suite budget: 12s \(board, set \d{4}-/)
    expect((await run('scrum_suite_budget', {})).text).toMatch(/^suite budget: 12s \(board/)

    const refused = await run('scrum_suite_budget', { seconds: 20 })
    expect(refused.isError).toBe(true)
    expect(refused.text).toMatch(/requires a reason/)
    expect((await run('scrum_suite_budget', { seconds: 20, reason: 'slow CI' })).text).toMatch(/20s \(board, set .* — reason: slow CI\)$/)

    expect((await run('scrum_suite_budget', { seconds: 0 })).text).toBe('suite budget: 15s (default)')
    const bad = await run('scrum_suite_budget', { seconds: -3 })
    expect(bad.isError).toBe(true)
  })

  it('R3: scrum_tree carries the budget header only when the board set one — even on an empty tree', async () => {
    expect((await run('scrum_tree', {})).text).not.toMatch(/Suite budget/)
    await run('scrum_suite_budget', { seconds: 10 })
    const empty = await run('scrum_tree', {})
    expect(empty.text).toMatch(/^Suite budget: 10s \(board\)\n\n/)
    expect(empty.text).toContain('Empty backlog')

    await run('scrum_release_create', { name: 'v1.0' })
    await run('scrum_suite_budget', { seconds: 20, reason: 'slow CI' })
    const tree = await run('scrum_tree', {})
    expect(tree.text).toMatch(/^Suite budget: 20s \(board — above default 15s: slow CI\)\n\n/)
    expect(tree.text).toContain('rel-1 v1.0')
  })

  it('R4: scrum_item_update adds the over-budget advice and the above-default note from the Model, never otherwise', async () => {
    await run('scrum_release_create', { name: 'v1.0' })
    await run('scrum_feature_create', { releaseId: 'rel-1', title: 'F' })
    await run('scrum_component_create', { featureId: 'feat-1', title: 'C' })
    const evidence = (suite: string) => `---\nvalidated_at: 2026-09-02\nsuite: { tests: 1, passed: 1, ${suite} }\ntypecheck: clean\n---\nSuite green.`

    const slow = await run('scrum_item_update', { id: 'comp-1', validation: evidence('wall_seconds: 16, budget_seconds: 15') })
    expect(slow.text).toMatch(/validation contract: .*wall_seconds 16 > budget_seconds 15/)
    // comp-45 R4: the advice names the task kind.
    expect(slow.text).toMatch(/over budget: add a test task \(kind test\) refactoring the suite before done/)
    expect(slow.text).not.toMatch(/budget above default/)

    // A declaration error (budget above the board) is not a slow suite: no refactor advice.
    const declared = await run('scrum_item_update', { id: 'comp-1', validation: evidence('wall_seconds: 5, budget_seconds: 20') })
    expect(declared.text).toMatch(/validation contract: .*budget_seconds 20 > board budget 15/)
    expect(declared.text).not.toMatch(/over budget/)

    await run('scrum_suite_budget', { seconds: 20, reason: 'slow CI' })
    const fine = await run('scrum_item_update', { id: 'comp-1', validation: evidence('wall_seconds: 18, budget_seconds: 20') })
    expect(fine.text).toMatch(/validation contract: ok/)
    expect(fine.text).toMatch(/budget above default \(20s > 15s\)/)
    expect(fine.text).not.toMatch(/over budget/)

    // Patches that do not touch the validation stay quiet about budgets.
    const title = await run('scrum_item_update', { id: 'comp-1', title: 'C2' })
    expect(title.text).not.toMatch(/budget/)
  })
})

// ── comp-45 R4/R5: task kind through the tools — written before the code ──

describe('task kind tools (comp-45)', () => {
  async function seed(): Promise<void> {
    await run('scrum_release_create', { name: 'v1.0' })
    await run('scrum_feature_create', { releaseId: 'rel-1', title: 'F' })
    await run('scrum_component_create', { featureId: 'feat-1', title: 'C' })
  }

  it('R5: scrum_task_create and scrum_item_update expose kind as an enum; the descriptions state the rule', () => {
    const schemas = ctx.tools.schemas()
    const create = schemas.find(s => s.name === 'scrum_task_create')!
    const update = schemas.find(s => s.name === 'scrum_item_update')!
    const phase = schemas.find(s => s.name === 'scrum_component_phase')!
    const props = (schema: typeof create) => (schema.parameters as { properties: Record<string, { enum?: string[]; description?: string }> }).properties
    expect(props(create)['kind']?.enum).toEqual(['test', 'code', 'other'])
    expect(props(create)['kind']?.description).toMatch(/inferred from a leading \[test\]\/\[code\]/)
    expect(props(create)['kind']?.description).toMatch(/test tasks must be created before code tasks/)
    expect(props(update)['kind']?.enum).toEqual(['test', 'code', 'other'])
    expect(phase.description).toMatch(/tdd→construction needs at least one test task and no code task created before the first test task/)
  })

  it('R4/R5: creates with an explicit or inferred kind and answers in the family format with the View prefix', async () => {
    await seed()
    const explicit = await run('scrum_task_create', { componentId: 'comp-1', title: 'Gate tdd', kind: 'test', estimate: 2 })
    expect(explicit.text).toBe('Created task task-1 [test] "Gate tdd" (2pt) under comp-1.')
    const inferred = await run('scrum_task_create', { componentId: 'comp-1', title: '[code] Gate tdd' })
    expect(inferred.text).toBe('Created task task-2 [code] "Gate tdd" under comp-1.')
    const plain = await run('scrum_task_create', { componentId: 'comp-1', title: 'Docs' })
    expect(plain.text).toBe('Created task task-3 "Docs" under comp-1.')
    const tree = await run('scrum_tree', {})
    expect(tree.text).toMatch(/task-1 \[test\] Gate tdd \[backlog\] \(2pt\)/)
    expect(tree.text).toMatch(/task-2 \[code\] Gate tdd \[backlog\]/)
    expect(tree.text).toMatch(/task-3 Docs \[backlog\]/)
  })

  it('R5: kind-conflict and prefix-only titles come back as named tool errors; scrum_item_update changes the kind', async () => {
    await seed()
    const conflict = await run('scrum_task_create', { componentId: 'comp-1', title: '[test] X', kind: 'code' })
    expect(conflict.isError).toBe(true)
    expect(conflict.text).toMatch(/title prefix \[test\] contradicts kind code — drop one/)
    const prefixOnly = await run('scrum_task_create', { componentId: 'comp-1', title: '[test]' })
    expect(prefixOnly.isError).toBe(true)
    expect(prefixOnly.text).toMatch(/only a kind prefix/)

    await run('scrum_task_create', { componentId: 'comp-1', title: '[code] early' })
    const changed = await run('scrum_item_update', { id: 'task-1', kind: 'other' })
    expect(changed.isError).toBe(false)
    expect((await run('scrum_tree', {})).text).toMatch(/task-1 early \[backlog\]/)
    const renamed = await run('scrum_item_update', { id: 'task-1', title: '[test] early' })
    expect(renamed.isError).toBe(false)
    expect((await run('scrum_tree', {})).text).toMatch(/task-1 \[test\] early \[backlog\]/)
  })

  it('R3/R5: the tdd gate refusal names the tests-first rule through scrum_component_phase', async () => {
    await seed()
    await run('scrum_item_update', { id: 'comp-1', requirements: CONTRACT_REQ, requirementsReview: CONTRACT_REVIEW })
    await run('scrum_component_phase', { id: 'comp-1', action: 'advance' })
    await run('scrum_item_update', { id: 'comp-1', design: 'D' })
    await run('scrum_component_phase', { id: 'comp-1', action: 'advance' })
    await run('scrum_task_create', { componentId: 'comp-1', title: '[code] too early' })
    const refused = await run('scrum_component_phase', { id: 'comp-1', action: 'advance' })
    expect(refused.isError).toBe(true)
    expect(refused.text).toMatch(/no test task \(kind test\) — write the tests first; code task\(s\) created before the first test task \(task-1\)/)
    await run('scrum_item_update', { id: 'task-1', kind: 'test' })
    expect((await run('scrum_component_phase', { id: 'comp-1', action: 'advance' })).text).toContain('construction')
  })
})

// ── comp-46 R4: the checklist read through the tool — written before the code ──

describe('phase check (comp-46 R4)', () => {
  async function seed(): Promise<void> {
    await run('scrum_release_create', { name: 'v1.0' })
    await run('scrum_feature_create', { releaseId: 'rel-1', title: 'F' })
    await run('scrum_component_create', { featureId: 'feat-1', title: 'C' })
  }

  it('R4: check reads the checklist without moving, in its four forms', async () => {
    await seed()
    const schema = ctx.tools.schemas().find(s => s.name === 'scrum_component_phase')!
    const action = (schema.parameters as { properties: Record<string, { enum?: string[] }> }).properties['action']!
    expect(action.enum).toEqual(['advance', 'set', 'check'])
    expect(schema.description).toMatch(/action "check" reads the checklist without moving/)
    expect(schema.description).toMatch(/scrum_item_update status done/)

    // Blocked: the same reasons an advance would refuse with; nothing moved.
    const blocked = await run('scrum_component_phase', { id: 'comp-1', action: 'check' })
    expect(blocked.isError).toBe(false)
    expect(blocked.text).toMatch(/^comp-1 \[proposed · requirements\] → design: `requirements` is empty/)
    expect(blocked.text).toMatch(/; /)
    expect((await run('scrum_tree', {})).text).toContain('comp-1 C [proposed · requirements]')

    // Ready: advance when ready.
    await run('scrum_item_update', { id: 'comp-1', requirements: CONTRACT_REQ, requirementsReview: CONTRACT_REVIEW })
    expect((await run('scrum_component_phase', { id: 'comp-1', action: 'check' })).text)
      .toBe('comp-1 [proposed · requirements] → design: ok — advance when ready')

    // Validation: the last step is status done, not an advance.
    await run('scrum_component_phase', { id: 'comp-1', action: 'advance' })
    await run('scrum_item_update', { id: 'comp-1', design: 'D' })
    await run('scrum_component_phase', { id: 'comp-1', action: 'advance' })
    await run('scrum_task_create', { componentId: 'comp-1', title: 't', kind: 'test' })
    await run('scrum_component_phase', { id: 'comp-1', action: 'advance' })
    await run('scrum_sprint_plan', { goal: 'g', taskIds: ['task-1'] })
    await run('scrum_sprint_start', { sprintId: 'spr-1' })
    await run('scrum_task_move', { taskId: 'task-1', column: 'done' })
    await run('scrum_component_phase', { id: 'comp-1', action: 'advance' })
    expect((await run('scrum_component_phase', { id: 'comp-1', action: 'check' })).text)
      .toMatch(/^comp-1 \[in_progress · validation\] → done: `validation` is empty/)
    await run('scrum_item_update', { id: 'comp-1', validation: '---\nvalidated_at: 2026-09-02\nsuite: { tests: 1, passed: 1, wall_seconds: 1, budget_seconds: 10 }\ntypecheck: clean\n---\nok' })
    expect((await run('scrum_component_phase', { id: 'comp-1', action: 'check' })).text)
      .toBe('comp-1 [in_progress · validation] → done: ok — set status done with scrum_item_update')

    // Done: nothing to do.
    await run('scrum_item_update', { id: 'comp-1', status: 'done' })
    expect((await run('scrum_component_phase', { id: 'comp-1', action: 'check' })).text)
      .toBe('comp-1 [done · validation]: nothing to do')
  })

  it('R4: check refuses a phase argument like advance does, and a shelved component by name', async () => {
    await seed()
    const withPhase = await run('scrum_component_phase', { id: 'comp-1', action: 'check', phase: 'design' })
    expect(withPhase.isError).toBe(true)
    expect(withPhase.text).toMatch(/phase/)
    await run('scrum_item_delete', { id: 'comp-1' })
    const shelved = await run('scrum_component_phase', { id: 'comp-1', action: 'check' })
    expect(shelved.isError).toBe(true)
    expect(shelved.text).toMatch(/'comp-1' is in the trash; restore it first/)
  })
})
