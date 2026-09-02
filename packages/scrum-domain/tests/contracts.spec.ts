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
