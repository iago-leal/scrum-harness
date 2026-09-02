/**
 * Artifact contracts (comp-48): the review gate with teeth. Written BEFORE
 * the implementation (TDD). `RequirementsContract` checks the requirements
 * artifact (frontmatter version + human `status: approved`, non-empty body);
 * `ReviewContract` checks the PAIR — the review must be structured (R1),
 * approved, and cover exactly this requirements text (version + digest).
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ArtifactContract, RequirementsContract, ReviewContract } from '../src/contracts.ts'
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
