/**
 * View side of the review contract (comp-48, R4/R5): the reviewer's brief
 * rendered from `ReviewBriefData` in a fixed block order, and the
 * "review stale" marker on the tree. Written BEFORE the implementation.
 */
import { describe, expect, it } from 'vitest'
import { formatReviewBrief, formatTree } from '../src/format.ts'
import type { ReviewBriefData, ScrumTree } from '../src/service.ts'
import type { Component } from '../src/spec.ts'
import { ArtifactContract } from '../src/contracts.ts'

function component(fields: Partial<Component>): Component {
  return {
    id: 'comp-7', featureId: 'feat-1', title: 'Gate hard de done', description: 'Closes the spiral exit.',
    status: 'in_progress', phase: 'requirements', phaseLog: [], order: 0,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...fields,
  }
}

/** A neutral readiness for tree fixtures (comp-46 R1: the field is mandatory; formatTree never reads it). */
const NO_READINESS = { phase: 'requirements' as const, next: 'design' as const, ok: true, reasons: [] as string[], status: 'in_progress' as const }

const BODY = 'R1 — done needs validation.'
const DIGEST = ArtifactContract.digestOf(BODY)

function brief(over: Partial<ReviewBriefData> = {}): ReviewBriefData {
  return {
    component: component({}),
    requirements: { version: 2, digest: DIGEST, status: 'approved', body: BODY },
    taskCount: 3,
    ...over,
  }
}

/** Index of each heading, to assert the fixed order. */
function positions(text: string, headings: string[]): number[] {
  return headings.map(h => text.indexOf(h))
}

describe('formatReviewBrief', () => {
  it('renders the blocks in the fixed order with the requirements, conventions and the pre-filled frontmatter', () => {
    const text = formatReviewBrief(brief())
    const order = positions(text, [
      'comp-7', 'version 2', DIGEST, BODY, 'Tasks', 'House conventions', 'Guiding questions', 'Response format',
    ])
    expect(order.every(i => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    // The conventions travel with the brief to any workspace.
    expect(text).toMatch(/MVC/)
    expect(text).toMatch(/object-oriented/i)
    expect(text).toMatch(/Model.*View.*Controller|M\/V\/C/)
    expect(text).toMatch(/frontmatter/)
    // Pre-filled frontmatter: the reviewer only fills reviewer/verdict/findings.
    expect(text).toMatch(/reviewed_version: 2/)
    // H1: the digest is emitted QUOTED so an all-digit value survives the YAML parser.
    expect(text).toMatch(new RegExp(`reviewed_digest: "${DIGEST}"`))
    expect(text).toMatch(/round: 1/)
    expect(text).toMatch(/verdict: <approved \| needs-revision>/)
    expect(text).toMatch(/findings: \{ high: <n>, medium: <n>, low: <n> \}/)
    // No previous review, no design: those blocks are absent.
    expect(text).not.toMatch(/Previous review/)
    expect(text).not.toMatch(/## Design/)
    // Static blocks stay small (R4 ceiling ~1500 tokens ≈ 6000 chars).
    expect(formatReviewBrief(brief({ requirements: { version: 1, digest: DIGEST, status: 'approved', body: 'x' } })).length)
      .toBeLessThan(6000)
  })

  it('labels the previous review and bumps the round; includes the design or says why it was omitted', () => {
    const previous = {
      meta: { reviewer: 'sub', reviewed_version: 1, reviewed_digest: 'aaaaaaaa', verdict: 'needs-revision' as const, round: 1, findings: { high: 2, medium: 0, low: 1 } },
      body: 'A1 — the gate was bypassable.',
    }
    const withPrevious = formatReviewBrief(brief({ previousReview: previous, design: 'erDiagram …' }))
    expect(withPrevious).toMatch(/Previous review — covered version 1, digest aaaaaaaa, verdict needs-revision, round 1/)
    expect(withPrevious).toMatch(/A1 — the gate was bypassable\./)
    expect(withPrevious).toMatch(/round: 2/)
    expect(withPrevious).toMatch(/## Design\n+erDiagram/)
    const order = positions(withPrevious, [BODY, 'Previous review', '## Design', 'Tasks', 'House conventions'])
    expect([...order].sort((a, b) => a - b)).toEqual(order)

    const huge = formatReviewBrief(brief({ design: 'x'.repeat(6001) }))
    expect(huge).toMatch(/Design omitted \(6001 chars > 6000\)/)
    expect(huge).not.toMatch(/x{100}/)

    const legacy = formatReviewBrief(brief({ previousReview: { meta: null, body: 'free text review' } }))
    expect(legacy).toMatch(/Previous review \(no valid frontmatter\)/)
    expect(legacy).toMatch(/free text review/)
    // M3: a legacy review means one round already happened.
    expect(legacy).toMatch(/round: 2/)
  })
})

describe('formatTree review-stale marker (R5)', () => {
  const tree = (comp: Component, ready = false): ScrumTree => ({
    releases: [{
      id: 'rel-1', name: 'R', status: 'active', order: 0, createdAt: '', updatedAt: '',
      features: [{
        id: 'feat-1', releaseId: 'rel-1', title: 'F', status: 'in_progress', order: 0, createdAt: '', updatedAt: '',
        components: [{ ...comp, tasks: [], readyForDone: ready, readiness: NO_READINESS }],
      }],
    }],
  })
  const req = `---\nversion: 2\nstatus: approved\n---\n${BODY}`
  const review = (version: number, digest: string) =>
    `---\nreviewer: s\nreviewed_version: ${version}\nreviewed_digest: ${digest}\nverdict: approved\nround: 1\nfindings: { high: 0, medium: 0, low: 0 }\n---\nok`

  it('marks a component whose valid review no longer covers its requirements', () => {
    expect(formatTree(tree(component({ requirements: req, requirementsReview: review(1, DIGEST) }))))
      .toMatch(/comp-7 Gate hard de done \[in_progress · requirements · review stale\]/)
    expect(formatTree(tree(component({ requirements: req, requirementsReview: review(2, 'deadbeef') }))))
      .toMatch(/review stale/)
  })

  it('does not mark a matching review, a legacy free-text review, or a done component', () => {
    expect(formatTree(tree(component({ requirements: req, requirementsReview: review(2, DIGEST) })))).not.toMatch(/stale/)
    expect(formatTree(tree(component({ requirements: req, requirementsReview: 'ALTA A1 …' })))).not.toMatch(/stale/)
    expect(formatTree(tree(component({ status: 'done', phase: 'validation', requirements: req, requirementsReview: review(1, DIGEST) }))))
      .not.toMatch(/stale/)
  })
})

describe('formatTree ready-for-done marker (comp-47 R7)', () => {
  const tree = (comp: Component, ready: boolean): ScrumTree => ({
    releases: [{
      id: 'rel-1', name: 'R', status: 'active', order: 0, createdAt: '', updatedAt: '',
      features: [{
        id: 'feat-1', releaseId: 'rel-1', title: 'F', status: 'in_progress', order: 0, createdAt: '', updatedAt: '',
        components: [{ ...comp, tasks: [], readyForDone: ready, readiness: NO_READINESS }],
      }],
    }],
  })

  it('R7: renders the Model\'s boolean and nothing else', () => {
    expect(formatTree(tree(component({ phase: 'validation' }), true)))
      .toMatch(/comp-7 Gate hard de done \[in_progress · validation · ready for done\]/)
    expect(formatTree(tree(component({ phase: 'validation' }), false))).not.toMatch(/ready for done/)
    // The Model never marks done components ready; the View would print whatever it got.
    expect(formatTree(tree(component({ status: 'done', phase: 'validation' }), false))).not.toMatch(/ready/)
  })
})

// ── comp-50 R3: the suite budget as text (View) — written before the code ──
import { formatSuiteBudget } from '../src/format.ts'
import { SuiteBudget } from '../src/contracts.ts'
import { INITIAL_GLOBAL } from '../src/spec.ts'

describe('formatSuiteBudget (comp-50 R3)', () => {
  const at = '2026-09-02T10:00:00.000Z'
  const def = SuiteBudget.fromGlobal(INITIAL_GLOBAL)
  const ten = SuiteBudget.fromGlobal({ ...INITIAL_GLOBAL, suiteBudget: { seconds: 10, setAt: at } })
  const fifteen = SuiteBudget.fromGlobal({ ...INITIAL_GLOBAL, suiteBudget: { seconds: 15, setAt: at } })
  const twenty = SuiteBudget.fromGlobal({ ...INITIAL_GLOBAL, suiteBudget: { seconds: 20, setAt: at, reason: 'slow CI' } })

  it('R3: read mode — default, board, and board with its reason', () => {
    expect(formatSuiteBudget(def, 'read')).toBe('suite budget: 15s (default)')
    expect(formatSuiteBudget(ten, 'read')).toBe(`suite budget: 10s (board, set ${at})`)
    expect(formatSuiteBudget(twenty, 'read')).toBe(`suite budget: 20s (board, set ${at} — reason: slow CI)`)
  })

  it('R3: header mode — nothing on the default; the three board forms', () => {
    expect(formatSuiteBudget(def, 'header')).toBeNull()
    expect(formatSuiteBudget(ten, 'header')).toBe('Suite budget: 10s (board)')
    expect(formatSuiteBudget(fifteen, 'header')).toBe('Suite budget: 15s (board)')
    expect(formatSuiteBudget(twenty, 'header')).toBe('Suite budget: 20s (board — above default 15s: slow CI)')
  })
})

// ── comp-45 R4: the kind prefix as a View concern — written before the code ──
import { formatShelf, formatSprintStatus, kindPrefix } from '../src/format.ts'
import type { Task } from '../src/spec.ts'

function task(fields: Partial<Task>): Task {
  return {
    id: 'task-1', componentId: 'comp-7', title: 'Testes do gate', kind: 'other', status: 'backlog', order: 0,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...fields,
  }
}

describe('kind prefix (comp-45 R4)', () => {
  it('R4: kindPrefix renders [test] / [code] with a trailing space and nothing for other', () => {
    expect(kindPrefix({ kind: 'test' })).toBe('[test] ')
    expect(kindPrefix({ kind: 'code' })).toBe('[code] ')
    expect(kindPrefix({ kind: 'other' })).toBe('')
  })

  it('R4: the tree line puts the prefix back in front of the title — identical to the pre-v0.16 rendering', () => {
    const tree: ScrumTree = {
      releases: [{
        id: 'rel-1', name: 'R', status: 'active', order: 0, createdAt: '', updatedAt: '',
        features: [{
          id: 'feat-1', releaseId: 'rel-1', title: 'F', status: 'in_progress', order: 0, createdAt: '', updatedAt: '',
          components: [{
            ...component({}),
            readyForDone: false,
            readiness: NO_READINESS,
            tasks: [
              task({ id: 'task-75', kind: 'test', title: 'Testes de domínio do motor (R8)', status: 'done', sprintId: 'spr-11', estimate: 3 }),
              task({ id: 'task-76', kind: 'code', title: 'spec.ts + service.ts', status: 'done', sprintId: 'spr-11', estimate: 3 }),
              task({ id: 'task-79', kind: 'other', title: 'Validação: suite cronometrada', status: 'done', sprintId: 'spr-11', estimate: 1 }),
            ],
          }],
        }],
      }],
    }
    const text = formatTree(tree)
    expect(text).toMatch(/^      task-75 \[test\] Testes de domínio do motor \(R8\) \[done @spr-11\] \(3pt\)$/m)
    expect(text).toMatch(/^      task-76 \[code\] spec\.ts \+ service\.ts \[done @spr-11\] \(3pt\)$/m)
    expect(text).toMatch(/^      task-79 Validação: suite cronometrada \[done @spr-11\] \(1pt\)$/m)
  })

  it('R4: the sprint board and the shelves carry the prefix too', () => {
    const sprint = {
      id: 'spr-1', number: 1, goal: 'g', status: 'active' as const, releaseIds: [], createdAt: '', updatedAt: '',
    }
    const status = {
      sprint,
      tasks: [task({ id: 'task-1', kind: 'test', title: 'red first', status: 'in_progress' }), task({ id: 'task-2', kind: 'other', title: 'docs', status: 'todo' })],
      totals: { tasks: 2, done: 0, points: 0, pointsDone: 0 },
    }
    const board = formatSprintStatus(status)
    expect(board).toMatch(/in_progress: task-1 \[test\] red first/)
    expect(board).toMatch(/todo: task-2 docs/)

    const shelf = formatShelf({
      releases: [], features: [], components: [],
      tasks: [task({ id: 'task-3', kind: 'code', title: 'gone', status: 'backlog', deletedAt: '2026-01-02T00:00:00.000Z', estimate: 2 })],
    }, 'trash')
    expect(shelf).toMatch(/^task-3 \[code\] gone \[task backlog, of comp-7\] \(2pt\) 2026-01-02T00:00:00\.000Z$/m)
  })
})
