/**
 * View side of the review contract (comp-48, R4/R5): the reviewer's brief
 * rendered from `ReviewBriefData` in a fixed block order, and the
 * "review stale" marker on the tree. Written BEFORE the implementation.
 */
import { describe, expect, it } from 'vitest'
import { formatReviewBrief, formatSprints, formatSprintStatus, formatTree, withBoardHeader, withBudgetHeader } from '../src/format.ts'
import type { ReviewBriefData, ScrumTree } from '../src/service.ts'
import type { Component } from '../src/spec.ts'
import { ArtifactContract, TitleContract } from '../src/contracts.ts'

function component(fields: Partial<Component>): Component {
  return {
    id: 'comp-7', featureId: 'feat-1', title: 'Gate hard de done', description: 'Closes the spiral exit.',
    status: 'in_progress', phase: 'requirements', phaseLog: [], order: 0,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...fields,
  }
}

/** A neutral readiness for tree fixtures (comp-46 R1: the field is mandatory; formatTree never reads it). */
const NO_READINESS = { phase: 'requirements' as const, next: 'design' as const, ok: true, reasons: [] as string[], status: 'in_progress' as const }
/** An empty matrix for tree fixtures (comp-49 R5: the field is mandatory; formatTree never reads it). */
const NO_TRACES = { source: null, entries: [], ids: [], untraced: [], unknown: [], nocode: [], unproven: [], files: [], tests: [], issues: [] }

const BODY = 'R1 — done needs validation.'
const DIGEST = ArtifactContract.digestOf(BODY)

function brief(over: Partial<ReviewBriefData> = {}): ReviewBriefData {
  return {
    component: component({}),
    requirements: { version: 2, digest: DIGEST, status: 'approved', body: BODY, ids: ['R1'] },
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
    expect(formatReviewBrief(brief({ requirements: { version: 1, digest: DIGEST, status: 'approved', body: 'x', ids: [] } })).length)
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
        components: [{ ...comp, tasks: [], readyForDone: ready, readiness: NO_READINESS, traces: NO_TRACES }],
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
        components: [{ ...comp, tasks: [], readyForDone: ready, readiness: NO_READINESS, traces: NO_TRACES }],
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
            traces: NO_TRACES,
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

// ── comp-49: the matrix and the impact report as text (R6), the brief's ids and conventions (R2/R8) ──
// Written BEFORE the code (TDD).
import { formatImpact, formatTraceMatrix } from '../src/format.ts'
import type { ImpactReport } from '../src/service.ts'
import type { TraceMatrixData } from '../src/traces.ts'

function matrix(over: Partial<TraceMatrixData> = {}): TraceMatrixData {
  return { ...NO_TRACES, ...over }
}

describe('formatTraceMatrix (comp-49 R6)', () => {
  const done = component({ id: 'comp-46', title: 'Context-scrum ciente da fase', status: 'done', phase: 'validation' })

  it('R6: header with source and counts, one line per entry, holes only when there are some', () => {
    const text = formatTraceMatrix(done, matrix({
      source: 'design',
      entries: [
        { req: ['R1'], files: ['packages/a/src/x.ts', 'packages/a/src/y.ts'], tests: ['packages/a/tests/x.spec.ts'] },
        { req: ['R2', 'R3'], files: [], tests: [] },
        { req: ['R5'], files: ['packages/a/src/z.ts'], tests: [] },
      ],
      ids: ['R1', 'R2', 'R3', 'R4', 'R5'],
      untraced: ['R4'], unproven: ['R5'], unknown: [], nocode: ['R2', 'R3'],
      files: ['packages/a/src/x.ts', 'packages/a/src/y.ts', 'packages/a/src/z.ts'], tests: ['packages/a/tests/x.spec.ts'],
    }))
    expect(text).toBe([
      'comp-46 Context-scrum ciente da fase [done · validation] — matrix from design (3 entries, 5 ids)',
      '  R1 → packages/a/src/x.ts, packages/a/src/y.ts ⇐ packages/a/tests/x.spec.ts',
      '  R2, R3 → (no code) ⇐ (no test)',
      '  R5 → packages/a/src/z.ts ⇐ (no test)',
      '  holes: without trace R4 · unproven R5',
    ].join('\n'))
    // No holes at all: the line is omitted. Unknown ids show in the holes line.
    const clean = formatTraceMatrix(done, matrix({ source: 'validation', entries: [{ req: ['R1'], files: ['a.ts'], tests: ['a.spec.ts'] }], ids: ['R1'] }))
    expect(clean).toBe('comp-46 Context-scrum ciente da fase [done · validation] — matrix from validation (1 entries, 1 ids)\n  R1 → a.ts ⇐ a.spec.ts')
    expect(formatTraceMatrix(done, matrix({ source: 'design', entries: [{ req: ['R9'], files: [], tests: [] }], ids: ['R1'], untraced: ['R1'], unknown: ['R9'], nocode: [] })))
      .toContain('\n  holes: without trace R1 · unknown R9')
  })

  it('R6: no matrix, archived marker, and issues one per line', () => {
    const fresh = component({ id: 'comp-43', title: 'Requisitos no form e nas tools', status: 'proposed', phase: 'requirements' })
    expect(formatTraceMatrix(fresh, matrix())).toBe('comp-43 Requisitos no form e nas tools [proposed · requirements] — no matrix (source: none)')
    const archived = component({ id: 'comp-42', title: 'Motor', status: 'done', phase: 'validation', archivedAt: '2026-09-02T00:00:00.000Z' })
    const text = formatTraceMatrix(archived, matrix({
      source: 'design', entries: [{ req: ['R1'], files: ['processo'], tests: ['validação do comp'] }], ids: ['R1'],
      files: ['processo'], tests: ['validação do comp'],
      issues: ['traces[0].tests[0] "validação do comp" is not a workspace-relative path (whitespace)'],
    }))
    expect(text).toBe([
      'comp-42 Motor [done · validation (archived)] — matrix from design (1 entries, 1 ids)',
      '  R1 → processo ⇐ validação do comp',
      '  issues:',
      '    - traces[0].tests[0] "validação do comp" is not a workspace-relative path (whitespace)',
    ].join('\n'))
    // A filled design without a source still explains itself.
    expect(formatTraceMatrix(fresh, matrix({ issues: ['`design` frontmatter: traces missing (one `- { req, files, tests }` per line)'] })))
      .toBe('comp-43 Requisitos no form e nas tools [proposed · requirements] — no matrix (source: none)\n  issues:\n    - `design` frontmatter: traces missing (one `- { req, files, tests }` per line)')
  })
})

describe('formatImpact (comp-49 R6)', () => {
  const hit = (over: Partial<ImpactReport['hits'][number]> = {}): ImpactReport['hits'][number] => ({
    id: 'comp-1', title: 'OAuth flow', status: 'in_progress', phase: 'construction', archived: false,
    req: ['R1'], via: 'files', matched: ['packages/a/src/x.ts'], files: ['packages/a/src/x.ts'], tests: ['packages/a/tests/x.spec.ts'],
    ...over,
  })

  it('R6: a file with hits — the three via forms, (no test)/(no code), the archived marker', () => {
    const report: ImpactReport = {
      path: 'packages/a/src/x.ts', form: 'file', traced: true,
      hits: [
        hit(),
        hit({ id: 'comp-2', title: 'Second', via: 'tests', archived: true, status: 'done', phase: 'validation', files: [], tests: ['packages/a/src/x.ts'], matched: ['packages/a/src/x.ts'] }),
        hit({ id: 'comp-3', title: 'Third', via: 'both', req: ['R1', 'R2'], files: ['packages/a/src/x.ts'], tests: ['packages/a/src/x.ts'] }),
        hit({ id: 'comp-4', title: 'Fourth', tests: [] }),
      ],
    }
    expect(formatImpact(report)).toBe([
      'packages/a/src/x.ts — traced by 4 entry(ies) in 4 component(s)',
      '  comp-1 OAuth flow [in_progress · construction] R1 — proved by packages/a/tests/x.spec.ts',
      '  comp-2 Second [done · validation (archived)] R1 — this is the proof; code: (no code)',
      '  comp-3 Third [in_progress · construction] R1, R2 — proved by packages/a/src/x.ts; this is the proof; code: packages/a/src/x.ts',
      '  comp-4 Fourth [in_progress · construction] R1 — proved by (no test)',
    ].join('\n'))
    // Two entries of one component count one component.
    const twice: ImpactReport = { path: 'packages/a/src/x.ts', form: 'file', traced: true, hits: [hit(), hit({ req: ['R2'] })] }
    expect(formatImpact(twice)).toMatch(/^packages\/a\/src\/x\.ts — traced by 2 entry\(ies\) in 1 component\(s\)\n/)
  })

  it('R6: a file without hits is a coverage hole; a missing traced file says so', () => {
    expect(formatImpact({ path: 'packages/x.ts', form: 'file', traced: false, hits: [] })).toBe('packages/x.ts — no trace in any component (coverage hole)')
    expect(formatImpact({ path: 'packages/a/src/x.ts', form: 'file', traced: true, hits: [hit()], missing: ['packages/a/src/x.ts'], untracedOnDisk: [] }))
      .toBe('packages/a/src/x.ts — traced by 1 entry(ies) in 1 component(s)\n  comp-1 OAuth flow [in_progress · construction] R1 — proved by packages/a/tests/x.spec.ts\n  missing on disk: x.ts')
  })

  it('R6: a directory — counts of traced files, via relative to the query, missing/untraced lines, truncation, the root literal', () => {
    const report: ImpactReport = {
      path: 'packages/a/src', form: 'directory', traced: true,
      hits: [
        hit({ matched: ['packages/a/src/x.ts', 'packages/a/src/y.ts'], files: ['packages/a/src/x.ts', 'packages/a/src/y.ts'] }),
        hit({ id: 'comp-2', title: 'Second', req: ['R2'], matched: ['packages/a/src/x.ts'], tests: [] }),
      ],
      missing: ['packages/a/src/y.ts'],
      untracedOnDisk: ['packages/a/src/README.md', 'packages/a/src/new.ts'],
    }
    expect(formatImpact(report)).toBe([
      'packages/a/src/ — 2 traced file(s) in 2 component(s)',
      '  comp-1 OAuth flow [in_progress · construction] R1 — via x.ts, y.ts — proved by packages/a/tests/x.spec.ts',
      '  comp-2 Second [in_progress · construction] R2 — via x.ts — proved by (no test)',
      '  missing on disk: y.ts',
      '  untraced on disk: README.md, new.ts',
    ].join('\n'))
    const truncated: ImpactReport = { ...report, missing: undefined, untracedOnDisk: ['packages/a/src/new.ts'], onDiskTruncated: true }
    expect(formatImpact(truncated)).toContain('\n  untraced on disk: new.ts\n  disk listing truncated at 500 files — missing/untraced are partial')
    const root: ImpactReport = { path: '', form: 'directory', traced: true, hits: [hit()], untracedOnDisk: ['README.md'], missing: [] }
    expect(formatImpact(root)).toBe([
      '(workspace root) — 1 traced file(s) in 1 component(s)',
      '  comp-1 OAuth flow [in_progress · construction] R1 — via packages/a/src/x.ts — proved by packages/a/tests/x.spec.ts',
      '  untraced on disk: README.md',
    ].join('\n'))
    expect(formatImpact({ path: 'packages/empty', form: 'directory', traced: false, hits: [], untracedOnDisk: [], missing: [] }))
      .toBe('packages/empty/ — 0 traced file(s) in 0 component(s)')
  })

  it('R6: caps — 40 hits then +N more; 60 untraced names then +N', () => {
    const hits = Array.from({ length: 45 }, (_, i) => hit({ id: `comp-${i + 1}` }))
    const many: ImpactReport = { path: 'packages/a/src/x.ts', form: 'file', traced: true, hits }
    const text = formatImpact(many)
    expect(text.split('\n')).toHaveLength(42)
    expect(text).toMatch(/\n  comp-40 OAuth flow .*\n  \+5 more$/)
    const untraced = Array.from({ length: 70 }, (_, i) => `packages/a/src/f${String(i).padStart(2, '0')}.ts`)
    const dir: ImpactReport = { path: 'packages/a/src', form: 'directory', traced: false, hits: [], missing: [], untracedOnDisk: untraced }
    const line = formatImpact(dir).split('\n')[1]
    expect(line).toMatch(/^  untraced on disk: f00\.ts, f01\.ts, .*f59\.ts \+10$/)
  })
})

describe('formatReviewBrief ids and traceability conventions (comp-49 R2, R8)', () => {
  it('R2: the ids line follows the version header; none gets the hint', () => {
    const text = formatReviewBrief(brief())
    expect(text).toMatch(/## Requirements version 2 \(digest [0-9a-f]{8}\) — status: approved\n\nRequirement ids found: R1\n/)
    const none = formatReviewBrief(brief({ requirements: { version: 1, digest: DIGEST, status: 'approved', body: 'prose', ids: [] } }))
    expect(none).toContain('Requirement ids found: none — the matrix cannot key on this text (write "R1 — …" at line start)')
  })

  it('R8: the house conventions carry the traceability rule to any workspace', () => {
    const text = formatReviewBrief(brief())
    expect(text).toMatch(/- Traceability: the design frontmatter carries the matrix — traces: then one indented entry per line/)
    expect(text).toMatch(/every requirement id must appear \(files: \[\] for a requirement without code\)/)
    expect(text).toMatch(/Gates: design → tdd and status done\./)
  })
})

// ── comp-53: overflow suffixes and the board header (R5) — written before the code ──

describe('title overflow in the text views (comp-53 R5)', () => {
  const SPRINT = { id: 'spr-1', number: 1, goal: 'G', releaseIds: [], status: 'active' as const, createdAt: '', updatedAt: '' }
  const treeWith = (over: { release?: boolean; feature?: boolean; component?: boolean; task?: boolean }): ScrumTree => ({
    releases: [{
      id: 'rel-1', name: 'R', status: 'active', order: 0, createdAt: '', updatedAt: '',
      ...over.release ? { titleOverflow: { length: 90, limit: 80 } } : {},
      features: [{
        id: 'feat-1', releaseId: 'rel-1', title: 'F', status: 'in_progress', order: 0, createdAt: '', updatedAt: '',
        ...over.feature ? { titleOverflow: { length: 91, limit: 80 } } : {},
        components: [{
          ...component({ id: 'comp-1', title: 'C' }), tasks: [{
            id: 'task-1', componentId: 'comp-1', title: 'T', kind: 'other', status: 'backlog', order: 0, createdAt: '', updatedAt: '',
            ...over.task ? { titleOverflow: { length: 338, limit: 80 } } : {},
          }],
          readyForDone: false, readiness: NO_READINESS, traces: NO_TRACES,
          ...over.component ? { titleOverflow: { length: 92, limit: 80 } } : {},
        }],
      }],
    }],
  })

  it('formatTree appends [título longo N/80] only to the lines with titleOverflow', () => {
    const clean = formatTree(treeWith({}))
    expect(clean).not.toMatch(/título longo/)
    const all = formatTree(treeWith({ release: true, feature: true, component: true, task: true }))
    expect(all).toMatch(/^rel-1 R \[active\] \[título longo 90\/80\]$/m)
    expect(all).toMatch(/^  feat-1 F \[in_progress\] \[título longo 91\/80\]$/m)
    expect(all).toMatch(/^    comp-1 C \[in_progress · requirements\] \[título longo 92\/80\]$/m)
    expect(all).toMatch(/^      task-1 T \[backlog\] \[título longo 338\/80\]$/m)
    const one = formatTree(treeWith({ task: true }))
    expect(one.match(/título longo/g)).toHaveLength(1)
  })

  it('formatSprints and formatSprintStatus append [meta longa N/120] only with goalOverflow', () => {
    expect(formatSprints([SPRINT])).toBe('spr-1 #1 "G" [active]')
    expect(formatSprints([{ ...SPRINT, goalOverflow: { length: 810, limit: 120 } }])).toBe('spr-1 #1 "G" [active] [meta longa 810/120]')
    const status = { sprint: { ...SPRINT, goalOverflow: { length: 200, limit: 120 } }, tasks: [], totals: { tasks: 0, done: 0, points: 0, pointsDone: 0 } }
    expect(formatSprintStatus(status).split('\n')[0]).toBe('spr-1 #1 "G" [active] [meta longa 200/120]')
    expect(formatSprintStatus({ ...status, sprint: SPRINT }).split('\n')[0]).toBe('spr-1 #1 "G" [active]')
  })

  it('withBoardHeader: no line on a clean board; the title line after the budget block (and alone when the budget is default)', () => {
    const limits = { title: 80, goal: 120 }
    const defaultBudget = SuiteBudget.fromGlobal({})
    expect(withBoardHeader(defaultBudget, { titles: 0, goals: 0, limits }, 'body')).toBe('body')
    expect(withBoardHeader(defaultBudget, { titles: 58, goals: 19, limits }, 'body'))
      .toBe('Title limit: 80 chars (sprint goal 120) — 58 title(s) and 19 goal(s) over\n\nbody')
    const boardBudget = SuiteBudget.fromGlobal({ suiteBudget: { seconds: 10, setAt: '2026-09-02T00:00:00.000Z' } })
    expect(withBoardHeader(boardBudget, { titles: 0, goals: 0, limits }, 'body')).toBe('Suite budget: 10s (board)\n\nbody')
    expect(withBoardHeader(boardBudget, { titles: 1, goals: 0, limits }, 'body'))
      .toBe('Suite budget: 10s (board)\nTitle limit: 80 chars (sprint goal 120) — 1 title(s) and 0 goal(s) over\n\nbody')
    // The old helper stays as the clean-board case.
    expect(withBudgetHeader(boardBudget, 'body')).toBe('Suite budget: 10s (board)\n\nbody')
  })
})

describe('review brief conventions — the title rule (comp-54 R6)', () => {
  it('states the two ceilings from TitleContract.limits() in the House conventions block', () => {
    const limits = TitleContract.limits()
    const text = formatReviewBrief(brief())
    const line = `- Titles: release/feature/component/task titles ≤ ${limits.title} chars and sprint goals ≤ ${limits.goal} (one line; the domain refuses more — TitleContract); the paragraph goes to description or the planning ceremony.`
    expect(text).toContain(line)
    expect(text.indexOf(line)).toBeGreaterThan(text.indexOf('## House conventions'))
    expect(text.indexOf(line)).toBeLessThan(text.indexOf('## Guiding questions'))
  })
})
