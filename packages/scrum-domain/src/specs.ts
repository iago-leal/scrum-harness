/**
 * The project spec set (v0.24, comp-59): the Model side of Spec-Driven
 * Development as the book chapter prescribes it — the project's spec is a
 * modular set of markdown files in `<workspace>/specs/`, versioned with the
 * code, with stable ids (`R1`, `S1`, `P1`, `C1`, `CT-001`) and one owner
 * agent per file. The board never writes them: a Controller-side probe
 * (`@scrum-harness/probe`) hands in what is on disk and this module
 * classifies it. {@link SpecCatalog} is the frozen catalog of the fifteen
 * canonical files in owner-chain order; {@link SpecContract} checks one
 * file's text (frontmatter, owner, body, duplicate ids); {@link SpecSet}
 * builds the deep-frozen `SpecSetData` the tools, the `/scrum` command and
 * the HTTP API print or serve. Nothing here touches the environment.
 * @module @scrum-harness/domain/specs
 */

import { z } from 'zod'
import { ArtifactContract, describeIssue, reviewMetaSchema } from './contracts.ts'
import type { ReviewMeta } from './contracts.ts'
import { ScrumError } from './error.ts'
import { parseFrontmatter } from './frontmatter.ts'
import { deepFreeze } from './traces.ts'

// ── Catalog (R1) ──

/** The owner agents, in the order of the chapter's chain (`agents` and `ops` are house additions). */
export const SPEC_OWNERS = ['product', 'domain', 'architect', 'api-data', 'test', 'agents', 'ops'] as const
export type SpecOwner = (typeof SPEC_OWNERS)[number]

/** One canonical spec file. */
export interface SpecCatalogEntry {
  /** Exact, case-sensitive file name. */
  file: string
  owner: SpecOwner
  /** Its function in the project (Table 6.3), one sentence. */
  purpose: string
  /** Part of the minimal set (PRD + RULES + API_SPEC). */
  minimal: boolean
}

/** Per-file byte cap: the chapter wants small, focused files. */
export const SPEC_FILE_CAP = 256 * 1024
/** How many unknown files the status view lists before ` +N`. */
export const SPEC_UNKNOWN_CAP = 20
/** Size of the minimal set. */
export const MINIMAL_TOTAL = 3

const CATALOG: readonly SpecCatalogEntry[] = deepFreeze([
  { file: 'PRD.md', owner: 'product', purpose: 'Product Requirements Document: why the product exists, for whom, and how success is measured.', minimal: true },
  { file: 'GLOSSARY.md', owner: 'domain', purpose: 'Domain terms defined once, so no name is ambiguous.', minimal: false },
  { file: 'RULES.md', owner: 'domain', purpose: 'Invariant rules the code may never violate: domain, security, performance, compliance.', minimal: true },
  { file: 'ARCHITECTURE.md', owner: 'architect', purpose: 'Structural decisions and system topology, with ADRs and accepted trade-offs.', minimal: false },
  { file: 'TECH_STACK.md', owner: 'architect', purpose: 'Chosen languages, frameworks and libraries, each with its justification.', minimal: false },
  { file: 'SECURITY.md', owner: 'architect', purpose: 'Threat model, authentication, authorization and handling of sensitive data.', minimal: false },
  { file: 'API_SPEC.md', owner: 'api-data', purpose: 'Contracts of internal and external APIs: inputs, outputs, formats, error codes.', minimal: true },
  { file: 'DATABASE_SCHEMA.md', owner: 'api-data', purpose: 'Data model: entities, relations, indexes and constraints.', minimal: false },
  { file: 'UI_UX_SPEC.md', owner: 'api-data', purpose: 'Screens, states, transitions and interface behaviour.', minimal: false },
  { file: 'TESTS_SPEC.md', owner: 'test', purpose: 'Test strategy and the critical cases, written before any test exists.', minimal: false },
  { file: 'AGENTS.md', owner: 'agents', purpose: 'How AI agents act in the project: persona, allowed tools, output rules, hard constraints.', minimal: false },
  { file: 'WORKFLOW.md', owner: 'agents', purpose: 'The operational pipeline between agents: who calls whom, when, in what order.', minimal: false },
  { file: 'PROMPTS.md', owner: 'agents', purpose: 'Reusable, versioned prompts invoked by agents or humans.', minimal: false },
  { file: 'TASKS.md', owner: 'ops', purpose: 'The operational backlog: what is in progress and what comes next (on this board, the board itself).', minimal: false },
  { file: 'README.md', owner: 'ops', purpose: 'Entry point of the spec set: overview, links to the other files, onboarding.', minimal: false },
])

/**
 * The catalog of canonical spec files (R1): static and frozen, the only
 * source of file names, owners and the minimal set for tools, View and API.
 */
export class SpecCatalog {
  private constructor() {}

  /** The fifteen entries, in owner-chain order. */
  static readonly entries: readonly SpecCatalogEntry[] = CATALOG

  /**
   * The entry of one file, matched exactly (case-sensitive).
   * @param file - a file name.
   */
  static entry(file: string): SpecCatalogEntry | undefined {
    return CATALOG.find(e => e.file === file)
  }

  /**
   * The canonical name a file name matches ignoring case, if any.
   * @param name - a file name as found on disk.
   */
  static caseOf(name: string): string | undefined {
    const lower = name.toLowerCase()
    return CATALOG.find(e => e.file.toLowerCase() === lower)?.file
  }

  /** The minimal set, in catalog order. */
  static minimal(): SpecCatalogEntry[] {
    return CATALOG.filter(e => e.minimal)
  }

  /**
   * The direct predecessors of one file in the chain of the agents (comp-60 R1).
   * @param file - a catalog file name.
   * @throws {ScrumError} `invalid-input` outside the catalog.
   */
  static predecessors(file: string): readonly string[] {
    const list = SPEC_PREDECESSORS[file]
    if (list === undefined) throw new ScrumError('invalid-input', `'${file}' is not a catalog spec file`)
    return list
  }

  /**
   * The files that name `file` as a direct predecessor, in catalog order (comp-60 R5/R7).
   * @param file - a catalog file name.
   * @throws {ScrumError} `invalid-input` outside the catalog.
   */
  static dependents(file: string): string[] {
    SpecCatalog.predecessors(file)
    return CATALOG.filter(e => SPEC_PREDECESSORS[e.file]!.includes(file)).map(e => e.file)
  }
}

// ── The chain of the agents (comp-60 R1) ──

/**
 * Direct predecessors of each spec file, derived from Table 6.4 and the
 * content dependencies: the PRD first; the domain files, the backlog and the
 * entry point after the PRD; the architect's files after the RULES; the
 * API/data files and the agent files after the ARCHITECTURE; the test
 * strategy after the RULES and the API. Only direct edges — transitivity is
 * each predecessor having passed its own gate when it was written.
 */
export const SPEC_PREDECESSORS: Readonly<Record<string, readonly string[]>> = deepFreeze({
  'PRD.md': [],
  'GLOSSARY.md': ['PRD.md'],
  'RULES.md': ['PRD.md'],
  'ARCHITECTURE.md': ['RULES.md'],
  'TECH_STACK.md': ['RULES.md'],
  'SECURITY.md': ['RULES.md'],
  'API_SPEC.md': ['ARCHITECTURE.md'],
  'DATABASE_SCHEMA.md': ['ARCHITECTURE.md'],
  'UI_UX_SPEC.md': ['ARCHITECTURE.md'],
  'TESTS_SPEC.md': ['RULES.md', 'API_SPEC.md'],
  'AGENTS.md': ['ARCHITECTURE.md'],
  'WORKFLOW.md': ['ARCHITECTURE.md'],
  'PROMPTS.md': ['ARCHITECTURE.md'],
  'TASKS.md': ['PRD.md'],
  'README.md': ['PRD.md'],
})

/** The review file of a spec: `PRD.md` → `PRD.review.md` (lives in `specs/reviews/`). */
export function reviewFileOf(file: string): string {
  return `${file.replace(/\.md$/, '')}.review.md`
}

/** The catalog spec a review file name covers, or undefined when the stem is not a catalog file. */
export function specOfReview(name: string): string | undefined {
  if (!name.endsWith('.review.md')) return undefined
  const spec = `${name.slice(0, -'.review.md'.length)}.md`
  return SpecCatalog.entry(spec) === undefined ? undefined : spec
}

// ── Probe data (R4; structurally identical to `@scrum-harness/probe`, D5) ──

/** One file of `specs/` as the probe saw it. */
export interface SpecFile {
  name: string
  /** Bytes (0 when unreadable). */
  size: number
  /** Present only when `size ≤ cap` and the read succeeded. */
  text?: string
  unreadable?: true
}

/** What the probe found at `<workspace>/specs`. */
export type SpecsProbe =
  | { kind: 'absent' }
  | { kind: 'not-a-directory' }
  /** `reviews` is present only when `specs/reviews` is a readable directory (comp-60 R2). */
  | { kind: 'dir'; files: SpecFile[]; reviews?: SpecFile[] }

// ── Contract (R2, R3) ──

/** Frontmatter of a spec file. `title`/`purpose` are what the chapter's semantic router reads. */
export const specMetaSchema = z.object({
  title: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
  version: z.number().int().min(1),
  status: z.enum(['draft', 'approved']),
  owner: z.enum(SPEC_OWNERS),
})
export type SpecMeta = z.infer<typeof specMetaSchema>

/** The keys of the frontmatter, in the order reasons are reported. */
const META_KEYS = ['title', 'purpose', 'version', 'status', 'owner'] as const
type MetaKey = (typeof META_KEYS)[number]

/**
 * Normalize one spec text for the contract: one leading BOM off, CRLF → LF.
 * Never trims — line numbers of the file are what {@link SpecContract.hits}
 * reports (rounds 2/3: a leading blank line is a missing frontmatter).
 * @param text - the raw file text.
 */
export function normalizeSpec(text: string): string {
  const noBom = text.startsWith('\uFEFF') ? text.slice(1) : text
  return noBom.replaceAll('\r\n', '\n')
}

/**
 * The stable-id shape at line start (R3): optional table-cell bar, optional
 * list/number marker, optional heading, bold on either side, one of the five
 * families, then a separator (`—`, `–`, `:`, `|`, `-` followed by whitespace,
 * bold or end of line) or `.` followed by whitespace. No flags: apply per line.
 */
export const SPEC_ID = /^\s*\|?\s*(?:[-*+]\s+|\d+[.)]\s+)?(?:#{1,6}\s+)?(?:\*\*)?((?:R\d+[a-z]?|S\d+|P\d+|C\d+|CT-\d+))(?:\*\*)?\s*(?:[—–:|-](?=[\s*]|$)|\.(?=\s))/

/** One id occurrence: the id and its 1-based line in the normalized file. */
export interface SpecIdHit { id: string; line: number }

/** What `check` learned about one file: the reasons, plus every field that parsed. */
export interface SpecCheck {
  reasons: string[]
  version?: number
  status?: 'draft' | 'approved'
  digest?: string
  /** Unique ids of the body, in order of appearance (empty without a parsed frontmatter). */
  ids: string[]
}

const MISSING_FM = 'frontmatter missing (must start on line 1 with ---)'
const MALFORMED_FM = 'frontmatter malformed (house YAML subset: scalars, inline [lists] and { objects }, "- item" blocks, one level of nesting)'

/**
 * Map one zod issue of the frontmatter to the contract's final wording
 * (R2 d): the house parser turns bare digits into numbers and empty/`~`
 * values into null, so those get their own hints; anything else falls back
 * on the family's {@link describeIssue}.
 * @param key - the frontmatter key.
 * @param issue - the zod issue on that key.
 */
export function specIssue(key: MetaKey, issue: z.core.$ZodIssue): string {
  const received = (issue as { received?: unknown }).received
  const message = issue.message
  if (issue.code === 'invalid_type' && (message.includes('received undefined') || message.includes('received null'))) return `${key} missing`
  if (key === 'title' || key === 'purpose') {
    if (issue.code === 'invalid_type' && message.includes('received number')) return `${key} must be a quoted string (bare digits are parsed as a number)`
    if (issue.code === 'too_small') return `${key} must not be blank`
  }
  if (key === 'version') {
    if (issue.code === 'invalid_type' && message.includes('received string')) return 'version must be a bare integer ≥ 1 (not quoted)'
    return 'version must be an integer ≥ 1'
  }
  if (issue.code === 'invalid_value' || received !== undefined) {
    if (key === 'status') return 'status must be one of draft, approved'
    if (key === 'owner') return `owner must be one of ${SPEC_OWNERS.join(', ')}`
  }
  return `${key} ${describeIssue(issue)}`
}

/**
 * The contract over one spec file's text (R2): a sibling by technique of
 * the artifact contracts (same parser, same digest), over a `SpecFile`
 * rather than a component. Stateless.
 */
export class SpecContract {
  /**
   * Every violated condition in fixed order — (a) cap/unreadable, (b) empty,
   * (c) frontmatter, (d) schema by key, (e) owner mismatch, (f) empty body,
   * (g) duplicate ids — with whatever parsed alongside.
   * @param file - the catalog file name (a name outside the catalog is refused).
   * @param spec - the file as probed.
   */
  check(file: string, spec: SpecFile): SpecCheck {
    const entry = SpecCatalog.entry(file)
    if (entry === undefined) throw new ScrumError('invalid-input', `'${file}' is not a catalog spec file`)
    if (spec.unreadable === true) return { reasons: ['could not be read'], ids: [] }
    if (spec.size > SPEC_FILE_CAP) return { reasons: ['exceeds 256 KiB (split it; small focused files)'], ids: [] }
    const text = normalizeSpec(spec.text ?? '')
    if (text.trim().length === 0) return { reasons: ['is empty'], ids: [] }
    if (!text.startsWith('---\n') && text !== '---') return { reasons: [MISSING_FM], ids: [] }
    const parsed = parseFrontmatter(text)
    if (parsed.meta === null) return { reasons: [MALFORMED_FM], ids: [] }

    const reasons: string[] = []
    const out: SpecCheck = { reasons, ids: [] }
    const meta = parsed.meta
    for (const key of META_KEYS) {
      // D1: an absent key, an empty value, `~` and `null` all read as missing (zod reports an enum miss for them).
      if (meta[key] === undefined || meta[key] === null) { reasons.push(`${key} missing`); continue }
      const result = specMetaSchema.shape[key].safeParse(meta[key])
      if (result.success) {
        if (key === 'version') out.version = result.data as number
        if (key === 'status') out.status = result.data as 'draft' | 'approved'
      } else {
        reasons.push(specIssue(key, result.error.issues[0]!))
      }
    }
    const owner = meta['owner']
    if (typeof owner === 'string' && (SPEC_OWNERS as readonly string[]).includes(owner) && owner !== entry.owner) {
      reasons.push(`owner mismatch: ${file} is owned by ${entry.owner} (got ${owner})`)
    }
    const body = parsed.body.trim()
    out.digest = ArtifactContract.digestOf(body)
    if (body.length === 0) reasons.push('body is empty (only frontmatter)')
    const hits = this.hits(text)
    const seen = new Map<string, number[]>()
    for (const hit of hits) seen.set(hit.id, [...(seen.get(hit.id) ?? []), hit.line])
    out.ids = [...seen.keys()]
    for (const [id, lines] of seen) {
      if (lines.length > 1) reasons.push(`duplicate id ${id} (lines ${lines.join(', ')})`)
    }
    return out
  }

  /**
   * Every id occurrence in the body, with its 1-based line in the normalized
   * file (D6: the frontmatter lines count but are never scanned).
   * @param text - the raw or normalized file text.
   */
  hits(text: string): SpecIdHit[] {
    const normalized = normalizeSpec(text)
    const lines = normalized.split('\n')
    let start = 0
    if (normalized.startsWith('---\n')) {
      const close = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
      if (close === -1) return []
      start = close + 1
    } else {
      return []
    }
    const out: SpecIdHit[] = []
    for (let i = start; i < lines.length; i += 1) {
      const id = SPEC_ID.exec(lines[i]!)?.[1]
      if (id !== undefined) out.push({ id, line: i + 1 })
    }
    return out
  }

  /**
   * The unique ids of the body, in order of appearance.
   * @param text - the raw or normalized file text.
   */
  ids(text: string): string[] {
    const found: string[] = []
    for (const hit of this.hits(text)) if (!found.includes(hit.id)) found.push(hit.id)
    return found
  }
}

// ── The set (R5) ──

export type SpecState = 'missing' | 'draft' | 'approved' | 'invalid' | 'unknown'

/** One entry of the set: a catalog file (in catalog order) or an unknown file after them. */
export interface SpecEntry {
  file: string
  /** Absent on unknown files. */
  owner?: SpecOwner
  minimal: boolean
  state: SpecState
  version?: number
  status?: 'draft' | 'approved'
  digest?: string
  ids: string[]
  /** Bare reasons, field path first (the View prefixes the file only out of context). */
  reasons: string[]
  /** On an unknown file: the catalog name it matches ignoring case. */
  caseOf?: string
  /** On an unknown file named like a review: where reviews go (comp-60 R3). */
  hint?: string
  /** The review of this spec (comp-60 R2/R3); absent when there is no review file. */
  review?: SpecReview
}

export interface SpecSummary {
  minimal: { approved: number; total: number }
  /** Catalog files on disk (any state but missing). */
  present: number
  /** Catalog files whose contract is violated. */
  invalid: number
  unknown: number
  /** Every minimal file approved and no catalog file invalid. */
  complete: boolean
  /** Present catalog files whose review is `current` (comp-60 R3). */
  reviewed: number
}

/** The set as plain, deep-frozen data: what the tools, the `/scrum` command and the API read. */
export interface SpecSetData {
  exists: boolean
  reason?: 'absent' | 'not-a-directory'
  entries: SpecEntry[]
  /** Files of `specs/reviews/` whose stem is not a catalog file (comp-60 R3). */
  unknownReviews: { file: string; caseOf?: string }[]
  summary: SpecSummary
}

/** The classified reading of a probe (R5). Only static members; the value is frozen plain data. */
export class SpecSet {
  private constructor() {}

  /**
   * Build the set from what the probe found.
   * @param probe - the probe result.
   * @returns the deep-frozen set data.
   */
  static of(probe: SpecsProbe): SpecSetData {
    if (probe.kind !== 'dir') {
      return deepFreeze({
        exists: false,
        reason: probe.kind,
        entries: SpecCatalog.entries.map(e => missingEntry(e)),
        unknownReviews: [],
        summary: { minimal: { approved: 0, total: MINIMAL_TOTAL }, present: 0, invalid: 0, unknown: 0, complete: false, reviewed: 0 },
      })
    }
    const byName = new Map<string, SpecFile>()
    for (const file of probe.files) {
      if (byName.has(file.name)) throw new ScrumError('invalid-input', `specs/ lists '${file.name}' twice`)
      byName.set(file.name, file)
    }
    const byReview = new Map<string, SpecFile>()
    for (const review of probe.reviews ?? []) {
      if (byReview.has(review.name)) throw new ScrumError('invalid-input', `specs/reviews/ lists '${review.name}' twice`)
      byReview.set(review.name, review)
    }
    const contract = new SpecContract()
    const reviews = new SpecReviewContract()
    const entries: SpecEntry[] = []
    let approvedMinimal = 0
    let present = 0
    let invalid = 0
    let reviewed = 0
    /** Attach the review of one catalog entry (comp-60 R3): omitted when there is no review file. */
    const withReview = (entry: SpecEntry): SpecEntry => {
      const review = reviews.check(entry.file, byReview.get(reviewFileOf(entry.file)), entry)
      if (review.state === 'none') return entry
      if (review.state === 'current') reviewed += 1
      return { ...entry, review }
    }
    for (const entry of SpecCatalog.entries) {
      const file = byName.get(entry.file)
      if (file === undefined) { entries.push(withReview(missingEntry(entry))); continue }
      present += 1
      const check = contract.check(entry.file, file)
      const state: SpecState = check.reasons.length > 0 ? 'invalid' : check.status!
      if (state === 'invalid') invalid += 1
      if (state === 'approved' && entry.minimal) approvedMinimal += 1
      entries.push(withReview({
        file: entry.file, owner: entry.owner, minimal: entry.minimal, state,
        ...check.version !== undefined ? { version: check.version } : {},
        ...check.status !== undefined ? { status: check.status } : {},
        ...check.digest !== undefined ? { digest: check.digest } : {},
        ids: check.ids, reasons: check.reasons,
      }))
    }
    const unknown = [...byName.keys()].filter(name => SpecCatalog.entry(name) === undefined).sort(codePoint)
    for (const name of unknown) {
      const caseOf = SpecCatalog.caseOf(name)
      entries.push({
        file: name, minimal: false, state: 'unknown', ids: [], reasons: [],
        ...caseOf !== undefined ? { caseOf } : {},
        ...name.endsWith('.review.md') ? { hint: 'reviews go in specs/reviews/' } : {},
      })
    }
    const unknownReviews = [...byReview.keys()].filter(name => specOfReview(name) === undefined).sort(codePoint).map((name) => {
      const stem = name.endsWith('.review.md') ? name.slice(0, -'.review.md'.length) : name
      const caseOf = SpecCatalog.caseOf(`${stem}.md`)
      return { file: name, ...caseOf !== undefined ? { caseOf: reviewFileOf(caseOf) } : {} }
    })
    const summary: SpecSummary = {
      minimal: { approved: approvedMinimal, total: MINIMAL_TOTAL },
      present,
      invalid,
      unknown: unknown.length,
      complete: approvedMinimal === MINIMAL_TOTAL && invalid === 0,
      reviewed,
    }
    return deepFreeze({ exists: true, entries, unknownReviews, summary })
  }
}

function missingEntry(entry: SpecCatalogEntry): SpecEntry {
  return { file: entry.file, owner: entry.owner, minimal: entry.minimal, state: 'missing', ids: [], reasons: [] }
}

function codePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// ── Reviews on disk (comp-60 R2) ──

/** The review of one spec as the contract read it — every field that parsed travels, whatever the state. */
export interface SpecReview {
  state: 'none' | 'invalid' | 'stale' | 'needs-revision' | 'current'
  reasons: string[]
  version?: number
  digest?: string
  verdict?: 'approved' | 'needs-revision'
  round?: number
  high?: number
  /** The review body (trimmed), when the frontmatter parsed. */
  body?: string
}

/** What the review contract needs to know about the spec it covers. */
export interface SpecCoverage {
  state: SpecState
  version?: number
  digest?: string
}

const REVIEW_KEYS = ['reviewer', 'reviewed_version', 'reviewed_digest', 'verdict', 'round', 'findings'] as const
type ReviewKey = (typeof REVIEW_KEYS)[number]

/** Map one zod issue of the review frontmatter to the contract's wording (comp-60 R2 d). */
function reviewIssue(key: ReviewKey, issue: z.core.$ZodIssue): string {
  const message = issue.message
  if (issue.code === 'invalid_type' && (message.includes('received undefined') || message.includes('received null'))) return `${key} missing`
  if (key === 'reviewed_digest' && issue.code === 'invalid_type' && message.includes('received number')) {
    return 'reviewed_digest must be a quoted string (write reviewed_digest: "…" — bare digits are parsed as a number)'
  }
  if (key === 'verdict' && (issue.code === 'invalid_value' || (issue as { received?: unknown }).received !== undefined)) return 'verdict must be one of approved, needs-revision'
  if (key === 'reviewed_version' || key === 'round') return `${key} must be an integer ≥ 1`
  const path = issue.path.map(String).join('.')
  return `${path.length > 0 && path !== key ? path : key} ${describeIssue(issue)}`
}

/**
 * The contract over one spec review file (comp-60 R2): a sibling by
 * technique of {@link SpecContract}, over the review of one spec. The ONE
 * state rule: none > invalid > stale > needs-revision > current; a missing or
 * invalid spec makes any review stale without comparing version or digest.
 */
export class SpecReviewContract {
  /**
   * @param file - the spec file the review covers (catalog name).
   * @param review - the review file as probed, or undefined when there is none.
   * @param spec - the spec's state, version and digest as the set classified it.
   */
  check(file: string, review: SpecFile | undefined, spec: SpecCoverage): SpecReview {
    if (review === undefined) return { state: 'none', reasons: [] }
    if (review.unreadable === true) return { state: 'invalid', reasons: ['could not be read'] }
    if (review.size > SPEC_FILE_CAP) return { state: 'invalid', reasons: ['exceeds 256 KiB (split it; small focused files)'] }
    const text = normalizeSpec(review.text ?? '')
    if (text.trim().length === 0) return { state: 'invalid', reasons: ['is empty'] }
    if (!text.startsWith('---\n') && text !== '---') return { state: 'invalid', reasons: [MISSING_FM] }
    const parsed = parseFrontmatter(text)
    if (parsed.meta === null) return { state: 'invalid', reasons: [MALFORMED_FM] }
    const meta = parsed.meta
    const reasons: string[] = []
    const out: SpecReview = { state: 'invalid', reasons }
    const parts: Partial<ReviewMeta> = {}
    for (const key of REVIEW_KEYS) {
      if (meta[key] === undefined || meta[key] === null) { reasons.push(`${key} missing`); continue }
      const result = reviewMetaSchema.shape[key].safeParse(meta[key])
      if (result.success) (parts as Record<string, unknown>)[key] = result.data
      else reasons.push(reviewIssue(key, result.error.issues[0]!))
    }
    if (parts.reviewed_version !== undefined) out.version = parts.reviewed_version
    if (parts.reviewed_digest !== undefined) out.digest = parts.reviewed_digest
    if (parts.verdict !== undefined) out.verdict = parts.verdict
    if (parts.round !== undefined) out.round = parts.round
    if (parts.findings !== undefined) out.high = parts.findings.high
    const body = parsed.body.trim()
    out.body = body
    if (body.length === 0) reasons.push('body is empty (only frontmatter)')
    if (reasons.length > 0) return out
    // Coverage before verdict: a spec that is not (yet) valid has nothing to be covered.
    if (spec.state === 'missing') return { ...out, state: 'stale', reasons: [`${file} is missing (nothing to cover)`] }
    if (spec.state === 'invalid') return { ...out, state: 'stale', reasons: [`${file} is invalid (fix the contract first)`] }
    const stale: string[] = []
    if (out.version !== spec.version) stale.push(`review covers version ${out.version} but ${file} is at version ${spec.version}`)
    if (out.digest !== spec.digest) stale.push(`${file} text changed since the review (digest ${out.digest} ≠ ${spec.digest})`)
    if (stale.length > 0) return { ...out, state: 'stale', reasons: stale }
    if (out.verdict !== 'approved') return { ...out, state: 'needs-revision', reasons: [`review verdict is ${out.verdict}`] }
    if ((out.high ?? 0) > 0) return { ...out, state: 'needs-revision', reasons: [`review is approved with findings.high ${out.high} (must be 0)`] }
    return { ...out, state: 'current', reasons: [] }
  }
}

// ── The order gate (comp-60 R4) ──

/** The gate of the chain of the agents: every reason a brief of `file` is refused with. Static, stateless. */
export class SpecOrder {
  private constructor() {}

  /**
   * @param file - the requested catalog file.
   * @param set - the classified set.
   * @returns every violated condition of the DIRECT predecessors, in catalog order; empty when released.
   */
  static gate(file: string, set: SpecSetData): string[] {
    const reasons: string[] = []
    for (const p of SpecCatalog.predecessors(file)) {
      const entry = set.entries.find(e => e.file === p)!
      if (entry.state !== 'approved') {
        reasons.push(entry.state === 'invalid'
          ? `${p} is invalid (needs approved): ${entry.reasons.join('; ')}`
          : `${p} is ${entry.state} (needs approved)`)
        if (entry.state !== 'draft') continue
      }
      const review = entry.review
      if (review === undefined) {
        reasons.push(`${p} has no review (needs a current review: verdict approved, findings.high 0, covering version ${entry.version} and digest ${entry.digest})`)
      } else if (review.state === 'stale') reasons.push(`${p} review is stale: ${review.reasons.join('; ')}`)
      else if (review.state === 'needs-revision') reasons.push(`${p} review needs-revision: ${review.reasons.join('; ')}`)
      else if (review.state === 'invalid') reasons.push(`${p} review is invalid: ${review.reasons.join('; ')}`)
    }
    return reasons
  }
}

// ── The two briefs (comp-60 R5, R7) ──

/** One predecessor as the brief carries it: the whole file. */
export interface SpecBriefPredecessor { file: string; version?: number; digest?: string; text: string }

/** What the author's brief carries (Model side; `formatSpecBrief` renders it). */
export interface SpecBriefData {
  file: string
  entry: SpecCatalogEntry
  predecessors: SpecBriefPredecessor[]
  /** The file as it is on disk, when it exists (even invalid). */
  current?: { state: SpecState; version?: number; status?: 'draft' | 'approved'; digest?: string; reasons: string[]; text: string }
  previousReview?: SpecReview
  nextVersion: number
  reviewPath: string
  dependents: string[]
}

/** What the reviewer's brief carries. */
export interface SpecReviewBriefData {
  file: string
  entry: SpecCatalogEntry
  spec: { version: number; status: 'draft' | 'approved'; digest: string; ids: string[]; text: string }
  predecessors: SpecBriefPredecessor[]
  previousReview?: SpecReview
  round: number
  orderWarnings: string[]
  reviewPath: string
  dependents: string[]
}

function predecessorsOf(file: string, set: SpecSetData, texts: Map<string, string>): SpecBriefPredecessor[] {
  const out: SpecBriefPredecessor[] = []
  for (const p of SpecCatalog.predecessors(file)) {
    const entry = set.entries.find(e => e.file === p)!
    const text = texts.get(p)
    if (entry.state === 'missing' || text === undefined) continue
    out.push({ file: p, ...entry.version !== undefined ? { version: entry.version } : {}, ...entry.digest !== undefined ? { digest: entry.digest } : {}, text })
  }
  return out
}

function textsOf(probe: SpecsProbe): Map<string, string> {
  const texts = new Map<string, string>()
  if (probe.kind === 'dir') for (const f of probe.files) if (f.text !== undefined) texts.set(f.name, f.text)
  return texts
}

/** The author's brief (comp-60 R5): refused by the order gate; otherwise everything the responsible agent needs. */
export class SpecBrief {
  private constructor() {}

  static of(file: string, probe: SpecsProbe): SpecBriefData {
    const set = SpecSet.of(probe)
    const reasons = SpecOrder.gate(file, set)
    if (reasons.length > 0) throw new ScrumError('spec-order', `${file}: ${reasons.join('; ')} — write and approve the predecessors first`)
    const entry = SpecCatalog.entry(file)!
    const texts = textsOf(probe)
    const own = set.entries.find(e => e.file === file)!
    const text = texts.get(file)
    const current = own.state === 'missing' || text === undefined
      ? undefined
      : {
        state: own.state,
        ...own.version !== undefined ? { version: own.version } : {},
        ...own.status !== undefined ? { status: own.status } : {},
        ...own.digest !== undefined ? { digest: own.digest } : {},
        reasons: own.reasons, text,
      }
    return deepFreeze({
      file, entry,
      predecessors: predecessorsOf(file, set, texts),
      ...current !== undefined ? { current } : {},
      ...own.review !== undefined ? { previousReview: own.review } : {},
      nextVersion: (current?.version ?? 0) + 1,
      reviewPath: `specs/reviews/${reviewFileOf(file)}`,
      dependents: SpecCatalog.dependents(file),
    })
  }
}

/** The reviewer's brief (comp-60 R7): refused for a missing or invalid spec; never by the order (warnings instead). */
export class SpecReviewBrief {
  private constructor() {}

  static of(file: string, probe: SpecsProbe): SpecReviewBriefData {
    const entry = SpecCatalog.entry(file)
    if (entry === undefined) throw new ScrumError('invalid-input', `'${file}' is not a catalog spec file`)
    const set = SpecSet.of(probe)
    const own = set.entries.find(e => e.file === file)!
    if (own.state === 'missing') throw new ScrumError('spec-review-brief', `${file}: write it first — scrum_spec_brief`)
    if (own.state === 'invalid') throw new ScrumError('spec-review-brief', `${file}: fix the contract before asking for a review (${own.reasons.join('; ')})`)
    const texts = textsOf(probe)
    const previous = own.review
    const round = previous === undefined ? 1 : previous.round !== undefined ? previous.round + 1 : 2
    return deepFreeze({
      file, entry,
      spec: { version: own.version!, status: own.status!, digest: own.digest!, ids: own.ids, text: texts.get(file)! },
      predecessors: predecessorsOf(file, set, texts),
      ...previous !== undefined ? { previousReview: previous } : {},
      round,
      orderWarnings: SpecOrder.gate(file, set),
      reviewPath: `specs/reviews/${reviewFileOf(file)}`,
      dependents: SpecCatalog.dependents(file),
    })
  }
}
