/**
 * Artifact contracts (v0.13, comp-48): the objects that give the spiral's
 * artifacts a verifiable shape. An {@link ArtifactContract} owns one artifact
 * field of a component — its frontmatter schema (zod), the normalized body,
 * a short digest of that body — and a `check` that returns every violated
 * condition, named with its field path. {@link RequirementsContract} checks
 * the requirements artifact (versioned, human-stamped `status: approved`,
 * non-empty body); {@link ReviewContract} checks the PAIR: a structured,
 * approved review that covers exactly this requirements text (version AND
 * digest); {@link ValidationContract} (comp-47) checks the evidence behind
 * `done` against the board's suite budget (comp-50). The domain's gates
 * delegate to these.
 *
 * Contracts are stateless: instantiate freely, nothing is cached or persisted.
 * @module @scrum-harness/domain/contracts
 */

import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { ZodType } from 'zod'
import { ScrumError } from './error.ts'
import { parseFrontmatter } from './frontmatter.ts'
import type { Component, SuiteBudgetRecord } from './spec.ts'

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
      if (issue.code === 'invalid_type' && issue.message.includes('received number')) {
        if (path === 'reviewed_digest') {
          return `\`${this.field}\` ${where} must be a quoted string (write reviewed_digest: "…" — bare digits are parsed as a number)`
        }
        if (path === 'validated_at') return `\`${this.field}\` ${where} must be a quoted ISO-8601 date (bare digits are parsed as a number)`
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
  // Refinement messages are ours: keep their casing.
  if (issue.code === 'custom') return issue.message
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

// ── comp-47: the validation artifact behind the done gate ─────────────────

/** The domain default for the board's suite budget ceiling (seconds); a board may set its own (comp-50 R2). */
export const DEFAULT_SUITE_BUDGET_SECONDS = 15

/**
 * The board's suite budget as the domain reads it (comp-50 R2): the
 * effective ceiling, where it comes from, and — when set on the board —
 * when and why. Immutable; built from the board's global by `fromGlobal`.
 */
export class SuiteBudget {
  /** The ceiling `budget_seconds` is compared against. */
  readonly seconds: number
  /** `default` = the domain constant; `board` = a record on the board's global. */
  readonly source: 'default' | 'board'
  /** Whether the ceiling stands above {@link DEFAULT_SUITE_BUDGET_SECONDS}. */
  readonly aboveDefault: boolean
  /** ISO timestamp of the board record, when set. */
  readonly setAt?: string
  /** The reason recorded when the budget stands above the default. */
  readonly reason?: string

  private constructor(seconds: number, source: 'default' | 'board', setAt?: string, reason?: string) {
    this.seconds = seconds
    this.source = source
    this.aboveDefault = seconds > DEFAULT_SUITE_BUDGET_SECONDS
    if (setAt !== undefined) this.setAt = setAt
    if (reason !== undefined) this.reason = reason
  }

  /**
   * Read the budget out of a board's global value.
   * @param global - the board's global (`suiteBudget` optional).
   * @returns the default budget without a record, else the board's.
   */
  static fromGlobal(global: { suiteBudget?: SuiteBudgetRecord }): SuiteBudget {
    const record = global.suiteBudget
    if (record === undefined) return new SuiteBudget(DEFAULT_SUITE_BUDGET_SECONDS, 'default')
    return new SuiteBudget(record.seconds, 'board', record.setAt, record.reason)
  }

  /**
   * Validate a budget about to be recorded on a board.
   * @param seconds - the new ceiling; must be a finite number > 0.
   * @param reason - required (non-blank) whenever `seconds` stands above the
   *   default — also when re-setting the same value; ignored, never stored,
   *   at or below the default.
   * @returns the record to persist, stamped now.
   * @throws ScrumError `validation` naming the rule.
   */
  static validate(seconds: number, reason?: string): SuiteBudgetRecord {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
      throw new ScrumError('validation', `suite budget must be a number > 0 (got ${String(seconds)})`)
    }
    const record: SuiteBudgetRecord = { seconds, setAt: new Date().toISOString() }
    if (seconds > DEFAULT_SUITE_BUDGET_SECONDS) {
      const why = reason?.trim() ?? ''
      if (why.length === 0) {
        throw new ScrumError('validation', `raising the suite budget above ${DEFAULT_SUITE_BUDGET_SECONDS}s requires a reason`)
      }
      record.reason = why
    }
    return record
  }
}

/** ISO-8601 date or date-time (the shapes `validated_at` may take). */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/

/** The minimum number of consecutive runs a `suite.runs` list must carry (comp-50 R1). */
export const MIN_SUITE_RUNS = 3

/**
 * Frontmatter of the validation artifact (R1). `suite.runs` (comp-50) is
 * the optional list of consecutive wall times; its length is a cross rule
 * of `check`, not a schema constraint, so the other reasons keep speaking.
 */
export const validationMetaSchema = z.object({
  validated_at: z.string().refine(v => ISO_DATE.test(v) && Number.isFinite(Date.parse(v)), 'must be a quoted ISO-8601 date'),
  suite: z.object({
    tests: z.number().int().min(1),
    passed: z.number().int().min(0),
    skipped: z.number().int().min(0).default(0),
    wall_seconds: z.number().min(0),
    budget_seconds: z.number().gt(0),
    runs: z.array(z.number().min(0)).optional(),
  }),
  typecheck: z.string(),
})
export type ValidationMeta = z.infer<typeof validationMetaSchema>

/**
 * Outcome of the validation contract: the shared shape plus, when refused,
 * whether the suite's effective wall time exceeds a budget (comp-50 R4) —
 * the signal behind the "add a test-refactor task" advice. A declared
 * `budget_seconds` above the board's ceiling alone is a declaration error,
 * not a slow suite, and does not raise it.
 */
export type ValidationResult = { ok: true } | { ok: false; reasons: string[]; overBudget: boolean }

/**
 * The validation artifact: the evidence a component's `done` rests on —
 * a green suite (skipped tolerated, counted), a clean typecheck, and a wall
 * time inside a declared budget that cannot exceed the board's ceiling.
 * With `suite.runs` (≥ {@link MIN_SUITE_RUNS} consecutive runs) the WORST
 * run is the effective wall time and `wall_seconds` must report it.
 */
export class ValidationContract extends ArtifactContract<ValidationMeta> {
  /** The board's budget ceiling, injected per board (defaults to the domain constant). */
  readonly budgetSeconds: number

  /**
   * @param options - `budgetSeconds` overrides {@link DEFAULT_SUITE_BUDGET_SECONDS}.
   */
  constructor(options: { budgetSeconds?: number } = {}) {
    super('validation', validationMetaSchema)
    this.budgetSeconds = options.budgetSeconds ?? DEFAULT_SUITE_BUDGET_SECONDS
  }

  /** Schema issues, then the cross rules of R1 in a fixed order, then the body — every violation at once. */
  check(component: Component): ValidationResult {
    const reasons: string[] = []
    let overBudget = false
    const { meta, issues } = this.meta(component)
    if (meta === null) reasons.push(...issues)
    else {
      const { suite } = meta
      const at = (text: string) => reasons.push(`\`validation\` frontmatter: ${text}`)
      if (suite.passed + suite.skipped !== suite.tests) {
        at(`suite.passed ${suite.passed} + skipped ${suite.skipped} ≠ tests ${suite.tests}`)
      }
      if (meta.typecheck !== 'clean') at(`typecheck is ${meta.typecheck} (needs clean)`)
      // The effective wall time: the worst of the runs when the list is usable, else the declared number.
      let effectiveWall = suite.wall_seconds
      if (suite.runs !== undefined) {
        if (suite.runs.length < MIN_SUITE_RUNS) at(`suite.runs needs at least ${MIN_SUITE_RUNS} runs (got ${suite.runs.length})`)
        else {
          const worst = Math.max(...suite.runs)
          effectiveWall = worst
          if (suite.wall_seconds !== worst) at(`suite.wall_seconds ${suite.wall_seconds} ≠ worst run ${worst} (report the worst)`)
          if (worst > suite.budget_seconds) at(`suite.runs worst ${worst} > budget_seconds ${suite.budget_seconds}`)
        }
      }
      if (suite.runs === undefined || suite.runs.length < MIN_SUITE_RUNS) {
        if (suite.wall_seconds > suite.budget_seconds) at(`suite.wall_seconds ${suite.wall_seconds} > budget_seconds ${suite.budget_seconds}`)
      }
      if (suite.budget_seconds > this.budgetSeconds) {
        at(`suite.budget_seconds ${suite.budget_seconds} > board budget ${this.budgetSeconds}`)
      }
      overBudget = effectiveWall > suite.budget_seconds || effectiveWall > this.budgetSeconds
      if (this.body(component).length === 0) reasons.push('`validation` body is empty (only frontmatter)')
    }
    return reasons.length === 0 ? { ok: true } : { ok: false, reasons, overBudget }
  }
}
