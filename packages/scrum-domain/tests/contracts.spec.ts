/**
 * Artifact contracts (comp-48): the review gate with teeth. Written BEFORE
 * the implementation (TDD). `RequirementsContract` checks the requirements
 * artifact (frontmatter version + human `status: approved`, non-empty body);
 * `ReviewContract` checks the PAIR — the review must be structured (R1),
 * approved, and cover exactly this requirements text (version + digest).
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ArtifactContract, GOAL_MAX, RequirementsContract, ReviewContract, TITLE_MAX, TitleContract } from '../src/contracts.ts'
import type { Component } from '../src/spec.ts'

/** A minimal live component carrying the given artifacts. */
function comp(fields: Partial<Component>): Component {
  return {
    id: 'comp-1', featureId: 'feat-1', title: 'C', status: 'in_progress', phase: 'requirements',
    phaseLog: [], order: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...fields,
  }
}

const REQ_BODY = 'R1 — the thing must work.\nR2 — and be tested.'
const REQ = `---\nversion: 2\nstatus: approved\n---\n${REQ_BODY}`
const DIGEST = createHash('sha1').update(REQ_BODY.trim()).digest('hex').slice(0, 8)

/** A review frontmatter with overrides; body follows. */
function review(over: Record<string, unknown> = {}, body = 'A1 — fine.'): string {
  const meta: Record<string, unknown> = {
    reviewer: 'subagent', reviewed_version: 2, reviewed_digest: DIGEST, verdict: 'approved', round: 1,
    findings: '{ high: 0, medium: 1, low: 2 }', ...over,
  }
  const lines = Object.entries(meta).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${String(v)}`)
  return `---\n${lines.join('\n')}\n---\n${body}`
}

describe('ArtifactContract base', () => {
  it('digests the trimmed body with a short sha1 and normalizes CRLF / leading blank lines', () => {
    const c = new RequirementsContract()
    expect(c.digest(comp({ requirements: REQ }))).toBe(DIGEST)
    expect(c.digest(comp({ requirements: `---\nversion: 2\nstatus: approved\n---\n  ${REQ_BODY}\n\n` }))).toBe(DIGEST)
    const crlf = REQ.replaceAll('\n', '\r\n')
    expect(c.meta(comp({ requirements: crlf })).meta).toMatchObject({ version: 2 })
    expect(c.meta(comp({ requirements: `\n\n${REQ}` })).meta).toMatchObject({ version: 2 })
    expect(c.body(comp({ requirements: REQ }))).toBe(REQ_BODY)
    expect(ArtifactContract.digestOf(REQ_BODY)).toBe(DIGEST)
  })

  it('reports schema issues with the field path and distinguishes missing/malformed frontmatter', () => {
    const c = new RequirementsContract()
    expect(c.meta(comp({ requirements: 'no frontmatter' })).issues.join()).toMatch(/missing or malformed/)
    expect(c.meta(comp({ requirements: '---\nstatus: approved\n---\nx' })).issues.join()).toMatch(/version/)
    expect(c.meta(comp({})).issues.join()).toMatch(/empty/)
  })
})

describe('RequirementsContract (R2 a, b)', () => {
  const c = new RequirementsContract()

  it('accepts an approved, versioned artifact with a body', () => {
    expect(c.check(comp({ requirements: REQ }))).toEqual({ ok: true })
    // 1.0 parses as the integer 1 — accepted.
    expect(c.check(comp({ requirements: '---\nversion: 1.0\nstatus: approved\n---\nbody' }))).toEqual({ ok: true })
  })

  it('refuses a string or fractional version, a missing human stamp, and a frontmatter-only body', () => {
    const str = c.check(comp({ requirements: '---\nversion: "1"\nstatus: approved\n---\nbody' }))
    expect(str).toMatchObject({ ok: false })
    expect((str as { reasons: string[] }).reasons.join()).toMatch(/version/)
    const frac = c.check(comp({ requirements: '---\nversion: 1.5\nstatus: approved\n---\nbody' }))
    expect((frac as { reasons: string[] }).reasons.join()).toMatch(/version/)
    const draft = c.check(comp({ requirements: '---\nversion: 1\nstatus: draft\n---\nbody' }))
    expect((draft as { reasons: string[] }).reasons.join()).toMatch(/status is draft \(needs approved\)/)
    const only = c.check(comp({ requirements: '---\nversion: 1\nstatus: approved\n---\n   ' }))
    expect((only as { reasons: string[] }).reasons.join()).toMatch(/`requirements` body is empty/)
  })
})

describe('ReviewContract (R2 c–f, R5)', () => {
  const c = new ReviewContract()
  const reasons = (component: Component): string[] => {
    const result = c.check(component)
    return result.ok ? [] : result.reasons
  }

  it('accepts a structured, approved review covering exactly this requirements text', () => {
    expect(c.check(comp({ requirements: REQ, requirementsReview: review() }))).toEqual({ ok: true })
  })

  it('names every violated condition, in the fixed order a → f', () => {
    const all = reasons(comp({
      requirements: '---\nversion: 2\nstatus: draft\n---\n',
      requirementsReview: review({ verdict: 'needs-revision', reviewed_version: 1, reviewed_digest: 'deadbeef' }),
    }))
    const text = all.join(' | ')
    const order = [
      text.indexOf('status is draft'),
      text.indexOf('`requirements` body is empty'),
      text.indexOf('verdict is needs-revision'),
      text.indexOf('covers version 1'),
      text.indexOf('text changed since the review'),
    ]
    expect(order.every(i => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('c: requires the R1 frontmatter with a path on each missing/invalid field, and a body', () => {
    expect(reasons(comp({ requirements: REQ, requirementsReview: 'free text, no frontmatter' })).join())
      .toMatch(/`requirementsReview` frontmatter missing or malformed \(must start on line 1 with ---\)/)
    expect(reasons(comp({ requirements: REQ, requirementsReview: review({ findings: '{ high: 0, low: 2 }' }) })).join())
      .toMatch(/findings\.medium/)
    expect(reasons(comp({ requirements: REQ, requirementsReview: review({ findings: '{ high: -1, medium: 0, low: 0 }' }) })).join())
      .toMatch(/findings\.high/)
    expect(reasons(comp({ requirements: REQ, requirementsReview: review({ findings: '{ high: "2", medium: 0, low: 0 }' }) })).join())
      .toMatch(/findings\.high/)
    expect(reasons(comp({ requirements: REQ, requirementsReview: review({ findings: '3' }) })).join())
      .toMatch(/findings/)
    expect(reasons(comp({ requirements: REQ, requirementsReview: review({ reviewer: undefined }) })).join())
      .toMatch(/reviewer/)
    expect(reasons(comp({ requirements: REQ, requirementsReview: review({ round: 0 }) })).join())
      .toMatch(/round/)
    expect(reasons(comp({ requirements: REQ, requirementsReview: review({}, '   ') })).join())
      .toMatch(/`requirementsReview` body is empty/)
    // Extra keys are ignored.
    expect(c.check(comp({ requirements: REQ, requirementsReview: review({ extra: 'yes' }) }))).toEqual({ ok: true })
  })

  it('d: verdict must be approved, and approved means no high finding left', () => {
    expect(reasons(comp({ requirements: REQ, requirementsReview: review({ verdict: 'needs-revision' }) })).join())
      .toMatch(/verdict is needs-revision/)
    expect(reasons(comp({ requirements: REQ, requirementsReview: review({ verdict: 'resolved' }) })).join())
      .toMatch(/verdict/)
    expect(reasons(comp({ requirements: REQ, requirementsReview: review({ findings: '{ high: 1, medium: 0, low: 0 }' }) })).join())
      .toMatch(/approved with findings\.high 1/)
  })

  it('e/f: the review must cover this version AND this text', () => {
    expect(reasons(comp({ requirements: REQ, requirementsReview: review({ reviewed_version: 1 }) })).join())
      .toMatch(/covers version 1 but `requirements` are at version 2/)
    const edited = REQ.replace('R2 — and be tested.', 'R2 — and be tested twice.')
    expect(reasons(comp({ requirements: edited, requirementsReview: review() })).join())
      .toMatch(new RegExp(`text changed since the review \\(digest ${DIGEST} ≠ [0-9a-f]{8}\\)`))
  })

  it('stale: only when both versions parse as integers and differ, or the digest differs; never without a valid review frontmatter', () => {
    expect(c.stale(comp({ requirements: REQ, requirementsReview: review() }))).toBe(false)
    expect(c.stale(comp({ requirements: REQ, requirementsReview: review({ reviewed_version: 1 }) }))).toBe(true)
    expect(c.stale(comp({ requirements: REQ.replace('R1', 'R1b'), requirementsReview: review() }))).toBe(true)
    // Legacy: free-text review (comp-42 style) → no marker.
    expect(c.stale(comp({ requirements: REQ, requirementsReview: 'ALTA A1 …' }))).toBe(false)
    expect(c.stale(comp({ requirements: REQ }))).toBe(false)
  })

  it('R1/H1: an all-digit digest must be quoted — the YAML parser turns bare digits into a number', () => {
    // Find a body whose short digest is all digits (about 1 in 40).
    let n = 0
    let body = ''
    let digest = ''
    do {
      n += 1
      body = `R1 — must work. #${n}`
      digest = ArtifactContract.digestOf(body)
    } while (!/^\d{8}$/.test(digest))
    const requirements = `---\nversion: 2\nstatus: approved\n---\n${body}`
    const bare = review({ reviewed_digest: digest })
    expect(reasons(comp({ requirements, requirementsReview: bare })).join())
      .toMatch(/reviewed_digest must be a quoted string/)
    const quoted = review({ reviewed_digest: `"${digest}"` })
    expect(c.check(comp({ requirements, requirementsReview: quoted }))).toEqual({ ok: true })
  })
})

// ── comp-47: the validation artifact behind the done gate ─────────────────
import { DEFAULT_SUITE_BUDGET_SECONDS, ValidationContract } from '../src/contracts.ts'

/** A validation frontmatter with overrides; body follows. */
function validation(over: Record<string, unknown> = {}, body = 'Suite green, tsc clean, bundle served.'): string {
  const meta: Record<string, unknown> = {
    validated_at: '2026-09-02', suite: '{ tests: 97, passed: 97, wall_seconds: 12, budget_seconds: 15 }',
    typecheck: 'clean', ...over,
  }
  const lines = Object.entries(meta).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${String(v)}`)
  return `---\n${lines.join('\n')}\n---\n${body}`
}

describe('ValidationContract (comp-47 R1, R2)', () => {
  const c = new ValidationContract()
  const reasons = (text: string, contract = c): string[] => {
    const result = contract.check(comp({ validation: text }))
    return result.ok ? [] : result.reasons
  }

  it('R1: accepts a complete, consistent artifact; skipped defaults to 0; the default budget is 15s', () => {
    expect(DEFAULT_SUITE_BUDGET_SECONDS).toBe(15)
    expect(c.check(comp({ validation: validation() }))).toEqual({ ok: true })
    expect(c.check(comp({ validation: validation({ suite: '{ tests: 10, passed: 8, skipped: 2, wall_seconds: 1, budget_seconds: 15 }' }) })))
      .toEqual({ ok: true })
    expect(c.check(comp({ validation: validation().replaceAll('\n', '\r\n') }))).toEqual({ ok: true })
  })

  it('R1: names missing fields with their path; tests must be ≥ 1', () => {
    expect(reasons(validation({ suite: '{ tests: 97, passed: 97 }' })).join()).toMatch(/suite\.wall_seconds/)
    expect(reasons(validation({ suite: '{ tests: 97, passed: 97 }' })).join()).toMatch(/suite\.budget_seconds/)
    expect(reasons(validation({ typecheck: undefined })).join()).toMatch(/typecheck/)
    expect(reasons(validation({ suite: '{ tests: 0, passed: 0, wall_seconds: 0, budget_seconds: 15 }' })).join()).toMatch(/suite\.tests/)
    expect(reasons('no frontmatter at all').join()).toMatch(/`validation` frontmatter missing or malformed/)
  })

  it('R1: cross rules — passed + skipped = tests, typecheck clean, wall ≤ budget_seconds ≤ board budget', () => {
    expect(reasons(validation({ suite: '{ tests: 97, passed: 96, wall_seconds: 12, budget_seconds: 15 }' })).join())
      .toMatch(/suite\.passed 96 \+ skipped 0 ≠ tests 97/)
    expect(reasons(validation({ typecheck: 'failing' })).join()).toMatch(/typecheck is failing \(needs clean\)/)
    expect(reasons(validation({ suite: '{ tests: 97, passed: 97, wall_seconds: 16.2, budget_seconds: 15 }' })).join())
      .toMatch(/suite\.wall_seconds 16\.2 > budget_seconds 15/)
    expect(reasons(validation({ suite: '{ tests: 97, passed: 97, wall_seconds: 12, budget_seconds: 99999 }' })).join())
      .toMatch(/suite\.budget_seconds 99999 > board budget 15/)
    // Every violated rule at once.
    const all = reasons(validation({ suite: '{ tests: 97, passed: 90, wall_seconds: 30, budget_seconds: 20 }', typecheck: 'errors' }))
    expect(all.length).toBeGreaterThanOrEqual(4)
  })

  it('R2: the board budget is injectable (comp-50 will feed it per board)', () => {
    const wide = new ValidationContract({ budgetSeconds: 60 })
    expect(wide.check(comp({ validation: validation({ suite: '{ tests: 1, passed: 1, wall_seconds: 50, budget_seconds: 60 }' }) })))
      .toEqual({ ok: true })
    expect(reasons(validation({ suite: '{ tests: 1, passed: 1, wall_seconds: 50, budget_seconds: 60 }' }), c).join())
      .toMatch(/budget_seconds 60 > board budget 15/)
  })

  it('R1: validated_at must be an ISO-8601 date; a bare all-digit value must be quoted', () => {
    expect(reasons(validation({ validated_at: 'Jan 5' })).join()).toMatch(/validated_at must be a quoted ISO-8601 date/)
    expect(reasons(validation({ validated_at: '2026' })).join()).toMatch(/validated_at must be a quoted ISO-8601 date/)
    expect(c.check(comp({ validation: validation({ validated_at: '"2026-09-02T10:00:00Z"' }) }))).toEqual({ ok: true })
    expect(c.check(comp({ validation: validation({ validated_at: '2026-09-02T10:00:00.000Z' }) }))).toEqual({ ok: true })
  })

  it('R1: a frontmatter-only artifact is not evidence', () => {
    expect(reasons(validation({}, '   ')).join()).toMatch(/`validation` body is empty \(only frontmatter\)/)
  })
})

// ── comp-50: measurement convention (R1) and the over-budget flag (R4) ────
// Written BEFORE the code (TDD): every case maps to a requirement of comp-50.

describe('ValidationContract runs (comp-50 R1) and overBudget (R4)', () => {
  const c = new ValidationContract()
  const suite = (fields: string) => validation({ suite: `{ tests: 112, passed: 112, ${fields} }` })
  const check = (text: string, contract = c) => contract.check(comp({ validation: text }))
  const reasons = (text: string, contract = c): string[] => {
    const result = check(text, contract)
    return result.ok ? [] : result.reasons
  }
  const overBudget = (text: string, contract = c): boolean | undefined => {
    const result = check(text, contract)
    return result.ok ? undefined : result.overBudget
  }

  it('R1: without runs the declared wall_seconds counts, as before; the ok result stays exactly { ok: true }', () => {
    expect(check(suite('wall_seconds: 9.8, budget_seconds: 10'))).toEqual({ ok: true })
    expect(reasons(suite('wall_seconds: 10.2, budget_seconds: 10')).join()).toMatch(/suite\.wall_seconds 10\.2 > budget_seconds 10/)
  })

  it('R1: an inline runs list parses through the house frontmatter parser; the worst run counts', () => {
    expect(check(suite('wall_seconds: 9.8, budget_seconds: 10, runs: [9.1, 9.8, 9.4]'))).toEqual({ ok: true })
    // Worst run over the budget: ONE reason, worded on runs; no duplicate simple reason.
    const over = reasons(suite('wall_seconds: 10.4, budget_seconds: 10, runs: [9.1, 10.4, 9.4]'))
    expect(over).toEqual(['`validation` frontmatter: suite.runs worst 10.4 > budget_seconds 10'])
  })

  it('R1: wall_seconds must equal the worst run — lower (cherry-picking) and higher both refused with ≠', () => {
    expect(reasons(suite('wall_seconds: 9.1, budget_seconds: 10, runs: [9.1, 9.8, 9.4]')).join())
      .toMatch(/suite\.wall_seconds 9\.1 ≠ worst run 9\.8 \(report the worst\)/)
    expect(reasons(suite('wall_seconds: 9.9, budget_seconds: 10, runs: [9.1, 9.8, 9.4]')).join())
      .toMatch(/suite\.wall_seconds 9\.9 ≠ worst run 9\.8 \(report the worst\)/)
    // Both violations at once: the wrong wall AND the worst over budget.
    const both = reasons(suite('wall_seconds: 9.0, budget_seconds: 10, runs: [9.0, 10.5, 9.4]'))
    expect(both).toHaveLength(2)
    expect(both.join()).toMatch(/≠ worst run 10\.5/)
    expect(both.join()).toMatch(/suite\.runs worst 10\.5 > budget_seconds 10/)
  })

  it('R1: runs needs at least 3 values — a cross rule reported next to the others, [] counts as 0', () => {
    expect(reasons(suite('wall_seconds: 9.8, budget_seconds: 10, runs: [9.1, 9.8]')).join())
      .toMatch(/suite\.runs needs at least 3 runs \(got 2\)/)
    expect(reasons(suite('wall_seconds: 9.8, budget_seconds: 10, runs: []')).join())
      .toMatch(/suite\.runs needs at least 3 runs \(got 0\)/)
    // Not a schema failure: the other cross rules still speak (typecheck here).
    const withTypecheck = reasons(validation({ suite: '{ tests: 112, passed: 112, wall_seconds: 9.8, budget_seconds: 10, runs: [9.8] }', typecheck: 'errors' }))
    expect(withTypecheck.join()).toMatch(/needs at least 3 runs \(got 1\)/)
    expect(withTypecheck.join()).toMatch(/typecheck is errors/)
    // With too few runs the declared wall is the effective one (no worst to compare).
    expect(withTypecheck.join()).not.toMatch(/≠ worst run/)
  })

  it('R4: overBudget rides the refused result when the effective wall exceeds budget_seconds or the board budget', () => {
    expect(overBudget(suite('wall_seconds: 10.2, budget_seconds: 10'))).toBe(true)
    expect(overBudget(suite('wall_seconds: 10.4, budget_seconds: 10, runs: [9.1, 10.4, 9.4]'))).toBe(true)
    // Declared budget above the board's ceiling but a fast suite: a declaration error, not a slow suite.
    expect(overBudget(suite('wall_seconds: 5, budget_seconds: 20'))).toBe(false)
    // Effective wall above the BOARD budget even though inside the declared one.
    expect(overBudget(suite('wall_seconds: 18, budget_seconds: 20'))).toBe(true)
    // Refused for another reason only (typecheck): not over budget.
    expect(overBudget(validation({ typecheck: 'errors' }))).toBe(false)
    // A wider board budget clears it.
    expect(overBudget(suite('wall_seconds: 18, budget_seconds: 20'), new ValidationContract({ budgetSeconds: 20 }))).toBeUndefined()
  })
})

// ── comp-50 R2: the board's suite budget as a value object ────────────────
import { SuiteBudget } from '../src/contracts.ts'
import { INITIAL_GLOBAL, globalSchema } from '../src/spec.ts'
import { ScrumError } from '../src/service.ts'

describe('SuiteBudget (comp-50 R2)', () => {
  it('R2: fromGlobal — absent record means the default 15s; a record means the board, flagged when above default', () => {
    expect(SuiteBudget.fromGlobal(INITIAL_GLOBAL)).toEqual({ seconds: 15, source: 'default', aboveDefault: false })
    const twelve = SuiteBudget.fromGlobal({ ...INITIAL_GLOBAL, suiteBudget: { seconds: 12, setAt: '2026-09-02T10:00:00.000Z' } })
    expect(twelve).toMatchObject({ seconds: 12, source: 'board', setAt: '2026-09-02T10:00:00.000Z', aboveDefault: false })
    expect(twelve.reason).toBeUndefined()
    const twenty = SuiteBudget.fromGlobal({ ...INITIAL_GLOBAL, suiteBudget: { seconds: 20, setAt: '2026-09-02T10:00:00.000Z', reason: 'slow CI' } })
    expect(twenty).toMatchObject({ seconds: 20, source: 'board', aboveDefault: true, reason: 'slow CI' })
  })

  it('R2: validate — seconds must be a number > 0', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => SuiteBudget.validate(bad)).toThrow(ScrumError)
      expect(() => SuiteBudget.validate(bad)).toThrow(/suite budget must be a number > 0/)
    }
    expect(SuiteBudget.validate(10)).toMatchObject({ seconds: 10 })
    expect(SuiteBudget.validate(10).setAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('R2: validate — above the default a reason is required (also when re-setting the same value); at or below it is ignored', () => {
    expect(() => SuiteBudget.validate(20)).toThrow(/raising the suite budget above 15s requires a reason/)
    expect(() => SuiteBudget.validate(20, '   ')).toThrow(/requires a reason/)
    expect(SuiteBudget.validate(20, 'slow CI')).toMatchObject({ seconds: 20, reason: 'slow CI' })
    // 15 explicit and below: no reason needed, and a given one is never stored.
    expect(SuiteBudget.validate(15)).not.toHaveProperty('reason')
    expect(SuiteBudget.validate(12, 'ignored')).not.toHaveProperty('reason')
  })

  it('R2: the global schema accepts legacy media without the field and refuses a malformed record', () => {
    expect(globalSchema.parse(INITIAL_GLOBAL).suiteBudget).toBeUndefined()
    expect(globalSchema.parse({ ...INITIAL_GLOBAL, suiteBudget: { seconds: 12, setAt: 'x' } }).suiteBudget).toEqual({ seconds: 12, setAt: 'x' })
    expect(globalSchema.safeParse({ ...INITIAL_GLOBAL, suiteBudget: { seconds: 0, setAt: 'x' } }).success).toBe(false)
    expect(globalSchema.safeParse({ ...INITIAL_GLOBAL, suiteBudget: null }).success).toBe(false)
  })
})

// ── comp-49: the traceability matrix as domain data (R1, R2, R3) ──────────
// Written BEFORE the code (TDD): every case maps to a requirement of comp-49.
import {
  REQUIREMENT_ID, TRACE_PROBE_CAP, TraceContract, TraceMatrix,
  gitignoreNames, matchPath, normalizePath, pathIssue, traceGateFor,
} from '../src/traces.ts'

/** A design/validation artifact whose frontmatter is the given lines (already indented) and a body. */
function withTraces(lines: string, body = 'Design.'): string {
  return `---\n${lines}\n---\n${body}`
}
/** One inline trace entry line. */
function entry(req: string, files: string, tests: string): string {
  return `  - { req: ${req}, files: [${files}], tests: [${tests}] }`
}
const TWO_REQ = '---\nversion: 1\nstatus: approved\n---\nR1 — first.\nR2 — second.'
const FULL = withTraces(`traces:\n${entry('[R1]', 'src/a.ts', 'tests/a.spec.ts')}\n${entry('[R2]', '', '')}`)

describe('requirement ids (comp-49 R2)', () => {
  const c = new RequirementsContract()
  const ids = (body: string) => c.ids(comp({ requirements: `---\nversion: 1\n---\n${body}` }))

  it('R2: finds ids at line start in the six markdown shapes, with any of the four separators', () => {
    expect(ids([
      'R1 — plain.', '# R2 — heading.', '**R3** — bold id.', '**R4 —** bold with separator.',
      '- R5 — list item.', '1. R6 — numbered.', 'R7b: colon.', 'R8 - hyphen.', 'R9 – en dash.',
    ].join('\n'))).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7b', 'R8', 'R9'])
  })

  it('R2: ignores malformed ids, prose ranges and mid-line mentions; dedupes in order of appearance', () => {
    expect(ids('r1 — lower.\nREQ-1 — other scheme.\nR1and — glued.\nR2-R4 cover the Model.\nsee R5 — later\nR1.2 — dotted')).toEqual([])
    expect(ids('R2 — b.\nR1 — a.\nR2 — again.')).toEqual(['R2', 'R1'])
    expect(ids('nothing numbered here')).toEqual([])
    expect(c.ids(comp({}))).toEqual([])
  })

  it('R2: the regex is applied per line (no flags) and the frontmatter `ids:` key is ignored', () => {
    expect(REQUIREMENT_ID.flags).toBe('')
    expect(REQUIREMENT_ID.exec('R1 — x')?.[1]).toBe('R1')
    expect(c.ids(comp({ requirements: '---\nversion: 1\nids: [R1, R2, R3]\n---\nR9 — only this one.' }))).toEqual(['R9'])
  })
})

describe('normalizePath / pathIssue / matchPath (comp-49 R1, R5)', () => {
  it('R1: normalizes separators, dot segments, doubled and trailing slashes; the root is the empty string', () => {
    expect(normalizePath('a\\b\\c.ts')).toBe('a/b/c.ts')
    expect(normalizePath('./a/./b//c.ts/')).toBe('a/b/c.ts')
    expect(normalizePath(' src/a.ts ')).toBe('src/a.ts')
    for (const root of ['', '.', './', ' . ']) expect(normalizePath(root)).toBe('')
  })

  it('R1: pathIssue names why a value is not a workspace-relative path', () => {
    expect(pathIssue('')).toBe('empty')
    expect(pathIssue('/abs/x.ts')).toBe('absolute')
    expect(pathIssue('C:/x/y.ts')).toBe('absolute')
    expect(pathIssue('a/../b.ts')).toBe('.. segment')
    expect(pathIssue('..')).toBe('.. segment')
    expect(pathIssue('a b.ts')).toBe('whitespace')
    expect(pathIssue('src/a(1).ts')).toBeNull()
    expect(pathIssue('a#b:c.ts')).toBeNull()
    expect(pathIssue('README')).toBeNull()
  })

  it('R5: matchPath — the root matches everything, else exact or directory prefix; case-sensitive', () => {
    expect(matchPath('a/b.ts', '')).toBe(true)
    expect(matchPath('a/b.ts', 'a')).toBe(true)
    expect(matchPath('a/b.ts', 'a/b.ts')).toBe(true)
    expect(matchPath('ab/c.ts', 'a')).toBe(false)
    expect(matchPath('a/b.ts', 'a/b')).toBe(false)
    expect(matchPath('A/b.ts', 'a')).toBe(false)
  })
})

describe('TraceContract (comp-49 R3)', () => {
  const c = new TraceContract('design')
  const reasons = (design: string | undefined, requirements = TWO_REQ): string[] => {
    const result = c.check(comp({ requirements, design }))
    return result.ok ? [] : result.reasons
  }

  it('R3: accepts a complete matrix; req as a string or a list; the ok result is exactly { ok: true }', () => {
    expect(c.check(comp({ requirements: TWO_REQ, design: FULL }))).toEqual({ ok: true })
    const scalar = withTraces(`traces:\n${entry('R1', 'src/a.ts', 'tests/a.spec.ts')}\n${entry('R2', '', '')}`)
    expect(c.check(comp({ requirements: TWO_REQ, design: scalar }))).toEqual({ ok: true })
    // Extra frontmatter keys and extra entry keys are ignored.
    const extra = withTraces(`version: 1\nmvc: { model: [a.ts] }\ntraces:\n  - { req: [R1, R2], files: [src/a.ts], tests: [tests/a.spec.ts], note: planned }`)
    expect(c.check(comp({ requirements: TWO_REQ, design: extra }))).toEqual({ ok: true })
  })

  it('R3 (a): empty, no frontmatter, malformed (with the traces hint), schema issues with paths, non-string members', () => {
    expect(reasons(undefined)).toEqual(['`design` is empty'])
    expect(reasons('D')).toEqual(['`design` frontmatter missing or malformed (must start on line 1 with ---)'])
    const multiline = '---\ntraces:\n  - req: [R1]\n    files: [src/a.ts]\n    tests: []\n---\nD'
    expect(reasons(multiline)).toEqual([
      '`design` frontmatter malformed — traces must be one indented inline object per line: `  - { req: [R1], files: [...], tests: [...] }` (no multi-line objects)',
    ])
    expect(reasons('---\nversion: 1\n  bad: indent\n---\nD').join()).toMatch(/frontmatter missing or malformed/)
    expect(reasons(withTraces('traces:\n  - { req: [R1], tests: [] }')).join()).toMatch(/`design` frontmatter: traces\.0\.files missing/)
    expect(reasons(withTraces('traces:\n  - { req: [R1], files: [2024], tests: [true] }')).join())
      .toMatch(/traces\.0\.files\.0 must be a quoted string \(bare digits\/true\/false\/null are parsed as scalars\)/)
    expect(reasons(withTraces('traces:\n  - { req: [R1], files: [2024], tests: [true] }')).join()).toMatch(/traces\.0\.tests\.0 must be a quoted string/)
    expect(reasons(withTraces('traces:\n  - { req: 1, files: [], tests: [] }')).join()).toMatch(/traces\.0\.req\.0 must be a quoted string/)
  })

  it('R3 (b)/(c): a missing or null traces key, and an empty list', () => {
    expect(reasons(withTraces('version: 1'))).toEqual(['`design` frontmatter: traces missing (one `- { req, files, tests }` per line)'])
    expect(reasons(withTraces('traces:'))).toEqual(['`design` frontmatter: traces missing (one `- { req, files, tests }` per line)'])
    expect(reasons(withTraces('traces: []'))).toEqual(['`design` frontmatter: traces is empty'])
  })

  it('R3 (d): every bad member named with its entry and member index', () => {
    const bad = withTraces([
      'traces:',
      entry('[]', 'src/a.ts', ''),
      entry('[R1]', '"", /abs/x.ts, C:/d/x.ts', 'a/../b.spec.ts'),
      entry('[R2]', '"a b.ts"', ''),
    ].join('\n'))
    expect(reasons(bad)).toEqual([
      'traces[0].req is empty',
      'traces[1].files[0] "" is empty',
      'traces[1].files[1] "/abs/x.ts" is not a workspace-relative path (absolute)',
      'traces[1].files[2] "C:/d/x.ts" is not a workspace-relative path (absolute)',
      'traces[1].tests[0] "a/../b.spec.ts" is not a workspace-relative path (.. segment)',
      'traces[2].files[0] "a b.ts" is not a workspace-relative path (whitespace)',
    ])
  })

  it('R3 (e)/(g): unknown ids list the ids found; untraced ids are named; files: [] covers a requirement', () => {
    const unknown = withTraces(`traces:\n${entry('[R1, R13, R12]', 'src/a.ts', '')}\n${entry('[R2]', '', '')}`)
    expect(reasons(unknown)).toEqual(['traces name unknown requirement(s) R12, R13 (ids found: R1, R2)'])
    const partial = withTraces(`traces:\n${entry('[R1]', 'src/a.ts', 'tests/a.spec.ts')}`)
    expect(reasons(partial)).toEqual(['requirement(s) without trace: R2 (add an entry; files: [] for a requirement without code)'])
    expect(c.check(comp({ requirements: TWO_REQ, design: FULL }))).toEqual({ ok: true })
  })

  it('R3 (f): requirements without any id yield only (f) — (e) and (g) are suppressed', () => {
    const noIds = '---\nversion: 1\nstatus: approved\n---\nprose only'
    expect(reasons(FULL, noIds)).toEqual(['`requirements` declare no R-ids (write R1 — … at line start)'])
    // No requirements at all: the same single reason.
    expect(c.check(comp({ design: FULL }))).toEqual({ ok: false, reasons: ['`requirements` declare no R-ids (write R1 — … at line start)'] })
  })

  it('R3: every violated condition at once, in the fixed order (d) → (e) → (g)', () => {
    const many = withTraces(`traces:\n${entry('[R1, R9]', '/abs.ts', '')}`)
    expect(reasons(many)).toEqual([
      'traces[0].files[0] "/abs.ts" is not a workspace-relative path (absolute)',
      'traces name unknown requirement(s) R9 (ids found: R1, R2)',
      'requirement(s) without trace: R2 (add an entry; files: [] for a requirement without code)',
    ])
  })

  it('R3: the validation field is governed by the same contract, naming its own field', () => {
    const v = new TraceContract('validation')
    expect(v.field).toBe('validation')
    const result = v.check(comp({ requirements: TWO_REQ, validation: withTraces('validated_at: "2026-09-02"') }))
    expect(result).toEqual({ ok: false, reasons: ['`validation` frontmatter: traces missing (one `- { req, files, tests }` per line)'] })
    expect(v.check(comp({ requirements: TWO_REQ, validation: FULL }))).toEqual({ ok: true })
  })

  it('R1: carries — an array (empty included) carries the matrix; null, malformed and no frontmatter do not', () => {
    expect(c.carries(comp({ design: FULL }))).toBe(true)
    expect(c.carries(comp({ design: withTraces('traces: []') }))).toBe(true)
    expect(c.carries(comp({ design: withTraces('traces:') }))).toBe(false)
    expect(c.carries(comp({ design: withTraces('version: 1') }))).toBe(false)
    expect(c.carries(comp({ design: '---\ntraces:\n  - req: [R1]\n---\nD' }))).toBe(false)
    expect(c.carries(comp({ design: 'D' }))).toBe(false)
    expect(c.carries(comp({}))).toBe(false)
  })

  it('R1: entries — req always a list, paths normalized, invalid strings kept as written; null when not carried', () => {
    const raw = withTraces(`traces:\n${entry('R1', './src//a.ts, "a b.ts"', 'tests\\a.spec.ts/')}`)
    expect(c.entries(comp({ design: raw }))).toEqual([{ req: ['R1'], files: ['src/a.ts', 'a b.ts'], tests: ['tests/a.spec.ts'] }])
    expect(c.entries(comp({ design: 'D' }))).toBeNull()
    expect(c.entries(comp({ design: withTraces('traces: []') }))).toEqual([])
  })
})

describe('TraceMatrix (comp-49 R3)', () => {
  const V = (lines: string) => `---\nvalidated_at: "2026-09-02"\n${lines}\n---\nValidated.`

  it('R1: the effective source — a validation carrying an array wins (empty included); null or malformed falls back to the design', () => {
    expect(TraceMatrix.sourceOf(comp({ design: FULL, validation: V(`traces:\n${entry('[R1, R2]', 'src/b.ts', '')}`) }))).toBe('validation')
    expect(TraceMatrix.sourceOf(comp({ design: FULL, validation: V('traces: []') }))).toBe('validation')
    expect(TraceMatrix.sourceOf(comp({ design: FULL, validation: V('traces:') }))).toBe('design')
    expect(TraceMatrix.sourceOf(comp({ design: FULL, validation: 'no frontmatter' }))).toBe('design')
    expect(TraceMatrix.sourceOf(comp({ design: FULL }))).toBe('design')
    expect(TraceMatrix.sourceOf(comp({ design: 'D' }))).toBeNull()
    expect(TraceMatrix.sourceOf(comp({}))).toBeNull()
    const m = TraceMatrix.of(comp({ requirements: TWO_REQ, design: FULL, validation: V('traces: []') }))
    expect(m).toMatchObject({ source: 'validation', entries: [], untraced: ['R1', 'R2'], issues: ['`validation` frontmatter: traces is empty'] })
  })

  it('R3: derived sets are keyed by requirement id and aggregated over every entry naming it; sorted by number then suffix', () => {
    const req = '---\nversion: 1\nstatus: approved\n---\nR1 — a.\nR2 — b.\nR3 — c.\nR7b — d.\nR7 — e.\nR10 — f.'
    const design = withTraces([
      'traces:',
      entry('[R1]', 'src/z.ts', ''),
      entry('[R1, R3]', '', 'tests/z.spec.ts, tests/a.spec.ts'),
      entry('[R2]', '', ''),
      entry('[R7]', 'src/a.ts, src/z.ts', ''),
      entry('[R12, R11]', 'src/x.ts', ''),
    ].join('\n'))
    const m = TraceMatrix.of(comp({ requirements: req, design }))
    expect(m.source).toBe('design')
    expect(m.ids).toEqual(['R1', 'R2', 'R3', 'R7b', 'R7', 'R10'])
    expect(m.entries).toHaveLength(5)
    expect(m.entries[0]).toEqual({ req: ['R1'], files: ['src/z.ts'], tests: [] })
    // R1: files from entry 0, tests from entry 1 → traced and proven. R3: tests only → not unproven, not nocode? files(R3) empty → nocode.
    expect(m.untraced).toEqual(['R7b', 'R10'])
    expect(m.unknown).toEqual(['R11', 'R12'])
    expect(m.nocode).toEqual(['R2', 'R3'])
    expect(m.unproven).toEqual(['R7'])
    expect(m.files).toEqual(['src/a.ts', 'src/x.ts', 'src/z.ts'])
    expect(m.tests).toEqual(['tests/a.spec.ts', 'tests/z.spec.ts'])
    expect(m.issues).toEqual([
      'traces name unknown requirement(s) R11, R12 (ids found: R1, R2, R3, R7, R7b, R10)',
      'requirement(s) without trace: R7b, R10 (add an entry; files: [] for a requirement without code)',
    ])
  })

  it('R3: files/tests are distinct and ordered by code point (not locale)', () => {
    const design = withTraces(`traces:\n${entry('[R1, R2]', 'b.ts, a.ts, B.ts, a.ts, _u.ts', 'z.spec.ts, Z.spec.ts')}`)
    const m = TraceMatrix.of(comp({ requirements: TWO_REQ, design }))
    expect(m.files).toEqual(['B.ts', '_u.ts', 'a.ts', 'b.ts'])
    expect(m.tests).toEqual(['Z.spec.ts', 'z.spec.ts'])
  })

  it('R3: lenient reading — a non-path string stays in the entries and shows up in issues (legacy designs never block)', () => {
    const legacy = withTraces(`traces:\n${entry('[R1, R2]', '"validação do comp-46"', 'processo')}`)
    const m = TraceMatrix.of(comp({ requirements: TWO_REQ, design: legacy, status: 'done', phase: 'validation' }))
    expect(m.entries[0]?.files).toEqual(['validação do comp-46'])
    expect(m.files).toEqual(['validação do comp-46'])
    expect(m.tests).toEqual(['processo'])
    expect(m.issues).toEqual(['traces[0].files[0] "validação do comp-46" is not a workspace-relative path (whitespace)'])
    expect(m.untraced).toEqual([])
  })

  it('R3: without a source, issues are empty for an empty design and explain a filled one', () => {
    expect(TraceMatrix.of(comp({ requirements: TWO_REQ }))).toMatchObject({ source: null, entries: [], ids: ['R1', 'R2'], untraced: ['R1', 'R2'], issues: [] })
    expect(TraceMatrix.of(comp({ requirements: TWO_REQ, design: 'D' })).issues)
      .toEqual(['`design` frontmatter missing or malformed (must start on line 1 with ---)'])
    expect(TraceMatrix.of(comp({ requirements: TWO_REQ, design: withTraces('version: 1') })).issues)
      .toEqual(['`design` frontmatter: traces missing (one `- { req, files, tests }` per line)'])
  })

  it('R3: the matrix is a deep-frozen plain object', () => {
    const m = TraceMatrix.of(comp({ requirements: TWO_REQ, design: FULL }))
    expect(Object.isFrozen(m)).toBe(true)
    expect(Object.isFrozen(m.entries)).toBe(true)
    expect(Object.isFrozen(m.entries[0])).toBe(true)
    expect(Object.isFrozen(m.entries[0]?.files)).toBe(true)
    expect(Object.isFrozen(m.untraced)).toBe(true)
    expect(Object.getPrototypeOf(m)).toBe(Object.prototype)
    expect(JSON.parse(JSON.stringify(m))).toEqual(m)
  })
})

describe('gitignoreNames / traceGateFor / TRACE_PROBE_CAP (comp-49 R6, R8)', () => {
  it('R6: gitignoreNames reduces a .gitignore to plain basenames — no globs, no negations, no inner slashes', () => {
    const text = '# build output\n\nnode_modules/\n/lib\n*.log\n!keep\ndist/\na/b\n[abc]\nx?\n  coverage  \nlib/\n'
    expect(gitignoreNames(text)).toEqual(['node_modules', 'lib', 'dist', 'coverage'])
    expect(gitignoreNames('')).toEqual([])
    expect(TRACE_PROBE_CAP).toBe(500)
  })

  it('R8: traceGateFor names the gate that will read a field, or null when the field is not the effective source', () => {
    const inDesign = comp({ requirements: TWO_REQ, design: FULL, phase: 'design' })
    expect(traceGateFor(inDesign, 'design')).toBe('design → tdd')
    expect(traceGateFor(comp({ phase: 'requirements' }), 'design')).toBe('design → tdd')
    expect(traceGateFor(comp({ requirements: TWO_REQ, design: FULL, phase: 'tdd' }), 'design')).toBe('done')
    expect(traceGateFor(comp({ requirements: TWO_REQ, design: FULL, phase: 'construction' }), 'design')).toBe('done')
    const asBuilt = comp({ requirements: TWO_REQ, design: FULL, phase: 'validation', validation: `---\nvalidated_at: "2026-09-02"\ntraces: []\n---\nV` })
    expect(traceGateFor(asBuilt, 'design')).toBeNull()
    expect(traceGateFor(asBuilt, 'validation')).toBe('done')
    expect(traceGateFor(comp({ requirements: TWO_REQ, design: FULL, phase: 'validation' }), 'validation')).toBeNull()
    expect(traceGateFor(comp({ phase: 'design' }), 'validation')).toBeNull()
  })
})

// ── comp-53: TitleContract — a title is a title ────────────────────────────

describe('TitleContract (comp-53 R1, D7)', () => {
  it('limits(): 80 for titles, 120 for sprint goals — the constants Controllers and the View never read directly (D9)', () => {
    expect(TITLE_MAX).toBe(80)
    expect(GOAL_MAX).toBe(120)
    expect(TitleContract.limits()).toEqual({ title: 80, goal: 120 })
  })

  it('length() counts code points: an astral emoji is 1, a ZWJ family is 5, a flag is 2', () => {
    expect(TitleContract.length('a')).toBe(1)
    expect(TitleContract.length('😀')).toBe(1)
    expect(TitleContract.length('👨‍👩‍👧')).toBe(5)
    expect(TitleContract.length('🇧🇷')).toBe(2)
  })

  it('80 code points pass, 81 are refused with the literal reason (title)', () => {
    expect(TitleContract.check('title', 'x'.repeat(80))).toEqual({ ok: true })
    expect(TitleContract.check('title', 'x'.repeat(81))).toEqual({
      ok: false, reasons: ['title too long: 81 > 80 chars — move the detail to description'],
    })
    // 80 astral emoji are 160 UTF-16 units and still 80 code points.
    expect(TitleContract.check('title', '😀'.repeat(80))).toEqual({ ok: true })
  })

  it('120 code points pass, 121 are refused with the literal reason (goal)', () => {
    expect(TitleContract.check('goal', 'g'.repeat(120))).toEqual({ ok: true })
    expect(TitleContract.check('goal', 'g'.repeat(121))).toEqual({
      ok: false, reasons: ['sprint goal too long: 121 > 120 chars — move the detail to the planning ceremony'],
    })
  })

  it('a line break or control character is refused: \\n, \\r, \\t, U+007F, U+0085 (C1), U+2028 — with the literal reason', () => {
    for (const bad of ['a\nb', 'a\rb', 'a\tb', 'a\u007Fb', 'a\u0085b', 'a\u2028b', 'a\u2029b', 'a\u0000b']) {
      expect(TitleContract.check('title', bad)).toEqual({
        ok: false, reasons: ['title contains a line break or control character — titles are one line'],
      })
    }
    expect(TitleContract.check('goal', 'a\nb')).toEqual({
      ok: false, reasons: ['sprint goal contains a line break or control character — a sprint goal is one line'],
    })
    // Ordinary spaces and non-ASCII letters are fine.
    expect(TitleContract.check('title', 'título com acentuação e espaços')).toEqual({ ok: true })
  })

  it('both violations come back together, control first, then length', () => {
    const text = `${'x'.repeat(40)}\n${'x'.repeat(40)}`
    expect(TitleContract.check('title', text)).toEqual({
      ok: false,
      reasons: [
        'title contains a line break or control character — titles are one line',
        'title too long: 81 > 80 chars — move the detail to description',
      ],
    })
  })

  it('overflow(): { length, limit } only when the text is over the limit, undefined otherwise', () => {
    expect(TitleContract.overflow('title', 'x'.repeat(80))).toBeUndefined()
    expect(TitleContract.overflow('title', 'x'.repeat(300))).toEqual({ length: 300, limit: 80 })
    expect(TitleContract.overflow('goal', 'g'.repeat(200))).toEqual({ length: 200, limit: 120 })
    expect(TitleContract.overflow('goal', 'g'.repeat(120))).toBeUndefined()
  })
})
