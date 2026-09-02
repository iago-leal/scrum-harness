/**
 * Artifact contracts (v0.13, comp-48): the objects that give the spiral's
 * artifacts a verifiable shape. An {@link ArtifactContract} owns one artifact
 * field of a component — its frontmatter schema (zod), the normalized body,
 * a short digest of that body — and a `check` that returns every violated
 * condition, named with its field path. {@link RequirementsContract} checks
 * the requirements artifact (versioned, human-stamped `status: approved`,
 * non-empty body); {@link ReviewContract} checks the PAIR: a structured,
 * approved review that covers exactly this requirements text (version AND
 * digest). The domain's phase gate delegates to these; a future
 * `ValidationContract` (comp-47) extends the same base.
 *
 * Contracts are stateless: instantiate freely, nothing is cached or persisted.
 * @module @scrum-harness/domain/contracts
 */

import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { ZodType } from 'zod'
import { parseFrontmatter } from './frontmatter.ts'
import type { Component } from './spec.ts'

/** The component fields that hold spiral artifacts. */
export type ArtifactField = 'requirements' | 'requirementsReview' | 'design' | 'validation'

/** Outcome of a contract check: ok, or every violated condition in a fixed order. */
export type ContractResult = { ok: true } | { ok: false; reasons: string[] }

/** Parsed frontmatter of one artifact: the typed meta or the issues that prevent it. */
export interface ArtifactMeta<M> {
  meta: M | null
  /** Human-readable issues, each naming its field path (empty when `meta` is set). */
  issues: string[]
}

/** Base of every artifact contract: parsing, digest, and the schema of the frontmatter. */
export abstract class ArtifactContract<M> {
  /**
   * @param field - the component field this contract governs.
   * @param schema - zod schema of the artifact's frontmatter.
   */
  protected constructor(readonly field: ArtifactField, readonly schema: ZodType<M>) {}

  /**
   * Short content digest used to pin a review to the exact text it covered.
   * @param body - artifact body (frontmatter excluded).
   * @returns the first 8 hex chars of the body's sha1, whitespace-trimmed.
   */
  static digestOf(body: string): string {
    return createHash('sha1').update(body.trim()).digest('hex').slice(0, 8)
  }

  /** Normalize line endings and leading blank lines so the fence is found on line 1. */
  normalize(text: string): string {
    return text.replaceAll('\r\n', '\n').trimStart()
  }

  /** The raw artifact text of this contract's field, or '' when absent. */
  protected raw(component: Component): string {
    return this.normalize(component[this.field] ?? '')
  }

  /**
   * Parse and validate the artifact's frontmatter.
   * @param component - the component holding the artifact.
   * @returns the typed meta, or the issues (artifact empty; fence missing or malformed; schema paths).
   */
  meta(component: Component): ArtifactMeta<M> {
    const text = this.raw(component)
    if (text.trim().length === 0) return { meta: null, issues: [`\`${this.field}\` is empty`] }
    const parsed = parseFrontmatter(text)
    if (parsed.meta === null) {
      return { meta: null, issues: [`\`${this.field}\` frontmatter missing or malformed (must start on line 1 with ---)`] }
    }
    const result = this.schema.safeParse(parsed.meta)
    if (result.success) return { meta: result.data, issues: [] }
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.map(String).join('.')
      const where = path.length === 0 ? 'frontmatter' : `frontmatter: ${path}`
      // H1 (round 2): the house YAML parser turns bare all-digit values into
      // numbers, so a digest like 00123456 must travel quoted.
      if (path === 'reviewed_digest' && issue.code === 'invalid_type' && issue.message.includes('received number')) {
        return `\`${this.field}\` ${where} must be a quoted string (write reviewed_digest: "…" — bare digits are parsed as a number)`
      }
      return `\`${this.field}\` ${where} ${describe(issue)}`
    })
    return { meta: null, issues }
  }

  /** The artifact body (text after the frontmatter), trimmed; '' when absent. */
  body(component: Component): string {
    const text = this.raw(component)
    return parseFrontmatter(text).body.trim()
  }

  /** Digest of the artifact body. */
  digest(component: Component): string {
    return ArtifactContract.digestOf(this.body(component))
  }

  /** Every violated condition of this contract, in a fixed order. */
  abstract check(component: Component): ContractResult
}

/** Turn a zod issue into a short reason fragment. */
function describe(issue: z.core.$ZodIssue): string {
  if (issue.code === 'invalid_type' && issue.message.includes('received undefined')) return 'missing'
  if (issue.code === 'invalid_value') return `must be one of ${(issue as { values: unknown[] }).values.map(String).join(', ')}`
  return issue.message.toLowerCase()
}

/** Frontmatter of the requirements artifact. */
export const requirementsMetaSchema = z.object({
  version: z.number().int().min(1),
  status: z.string().optional(),
})
export type RequirementsMeta = z.infer<typeof requirementsMetaSchema>

/** The requirements artifact: versioned, stamped by a human, with a body. */
export class RequirementsContract extends ArtifactContract<RequirementsMeta> {
  constructor() {
    super('requirements', requirementsMetaSchema)
  }

  /** (a) frontmatter with integer version ≥ 1 and `status: approved`; (b) non-empty body. */
  check(component: Component): ContractResult {
    const reasons: string[] = []
    const { meta, issues } = this.meta(component)
    if (meta === null) reasons.push(...issues)
    else if (meta.status !== 'approved') {
      reasons.push(`\`requirements\` frontmatter status is ${meta.status ?? 'missing'} (needs approved)`)
    }
    if (this.body(component).length === 0 && !issues.some(i => i.endsWith('is empty'))) {
      reasons.push('`requirements` body is empty (only frontmatter)')
    }
    return reasons.length === 0 ? { ok: true } : { ok: false, reasons }
  }
}

/** Frontmatter of the review artifact (R1). Extra keys are ignored. */
export const reviewMetaSchema = z.object({
  reviewer: z.string().min(1),
  reviewed_version: z.number().int().min(1),
  reviewed_digest: z.string().min(1),
  verdict: z.enum(['approved', 'needs-revision']),
  round: z.number().int().min(1),
  findings: z.object({
    high: z.number().int().min(0),
    medium: z.number().int().min(0),
    low: z.number().int().min(0),
  }),
})
export type ReviewMeta = z.infer<typeof reviewMetaSchema>

/**
 * The review artifact, checked as a PAIR with the requirements it covers:
 * structured (R1), approved with no high finding, same version, same text.
 */
export class ReviewContract extends ArtifactContract<ReviewMeta> {
  readonly requirements = new RequirementsContract()

  constructor() {
    super('requirementsReview', reviewMetaSchema)
  }

  /** Conditions a → f of R2, every violated one reported. */
  check(component: Component): ContractResult {
    const reasons: string[] = []
    // a, b — the requirements side.
    const requirements = this.requirements.check(component)
    if (!requirements.ok) reasons.push(...requirements.reasons)
    // c — the review's own shape.
    const { meta, issues } = this.meta(component)
    if (meta === null) reasons.push(...issues)
    if (meta !== null && this.body(component).length === 0) {
      reasons.push('`requirementsReview` body is empty (only frontmatter)')
    }
    if (meta !== null) {
      // d — verdict.
      if (meta.verdict !== 'approved') reasons.push(`review verdict is ${meta.verdict} (needs approved)`)
      else if (meta.findings.high > 0) reasons.push(`review is approved with findings.high ${meta.findings.high} (must be 0)`)
      // e, f — coverage of THIS text.
      const current = this.requirements.meta(component).meta
      if (current !== null && meta.reviewed_version !== current.version) {
        reasons.push(`review covers version ${meta.reviewed_version} but \`requirements\` are at version ${current.version}`)
      }
      const digest = this.requirements.digest(component)
      if (meta.reviewed_digest !== digest) {
        reasons.push(`requirements text changed since the review (digest ${meta.reviewed_digest} ≠ ${digest})`)
      }
    }
    return reasons.length === 0 ? { ok: true } : { ok: false, reasons }
  }

  /**
   * Whether a valid review no longer matches the requirements (R5): both
   * versions parse as integers and differ, or the digest differs. A review
   * without a valid frontmatter (legacy free text) is never "stale".
   */
  stale(component: Component): boolean {
    const review = this.meta(component).meta
    if (review === null) return false
    const current = this.requirements.meta(component).meta
    if (current !== null && review.reviewed_version !== current.version) return true
    return review.reviewed_digest !== this.requirements.digest(component)
  }
}
