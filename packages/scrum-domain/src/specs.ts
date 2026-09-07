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
import { ArtifactContract, describeIssue } from './contracts.ts'
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
  | { kind: 'dir'; files: SpecFile[] }

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
}

/** The set as plain, deep-frozen data: what the tools, the `/scrum` command and the API read. */
export interface SpecSetData {
  exists: boolean
  reason?: 'absent' | 'not-a-directory'
  entries: SpecEntry[]
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
        summary: { minimal: { approved: 0, total: MINIMAL_TOTAL }, present: 0, invalid: 0, unknown: 0, complete: false },
      })
    }
    const byName = new Map<string, SpecFile>()
    for (const file of probe.files) {
      if (byName.has(file.name)) throw new ScrumError('invalid-input', `specs/ lists '${file.name}' twice`)
      byName.set(file.name, file)
    }
    const contract = new SpecContract()
    const entries: SpecEntry[] = []
    let approvedMinimal = 0
    let present = 0
    let invalid = 0
    for (const entry of SpecCatalog.entries) {
      const file = byName.get(entry.file)
      if (file === undefined) { entries.push(missingEntry(entry)); continue }
      present += 1
      const check = contract.check(entry.file, file)
      const state: SpecState = check.reasons.length > 0 ? 'invalid' : check.status!
      if (state === 'invalid') invalid += 1
      if (state === 'approved' && entry.minimal) approvedMinimal += 1
      entries.push({
        file: entry.file, owner: entry.owner, minimal: entry.minimal, state,
        ...check.version !== undefined ? { version: check.version } : {},
        ...check.status !== undefined ? { status: check.status } : {},
        ...check.digest !== undefined ? { digest: check.digest } : {},
        ids: check.ids, reasons: check.reasons,
      })
    }
    const unknown = [...byName.keys()].filter(name => SpecCatalog.entry(name) === undefined).sort(codePoint)
    for (const name of unknown) {
      const caseOf = SpecCatalog.caseOf(name)
      entries.push({ file: name, minimal: false, state: 'unknown', ids: [], reasons: [], ...caseOf !== undefined ? { caseOf } : {} })
    }
    const summary: SpecSummary = {
      minimal: { approved: approvedMinimal, total: MINIMAL_TOTAL },
      present,
      invalid,
      unknown: unknown.length,
      complete: approvedMinimal === MINIMAL_TOTAL && invalid === 0,
    }
    return deepFreeze({ exists: true, entries, summary })
  }
}

function missingEntry(entry: SpecCatalogEntry): SpecEntry {
  return { file: entry.file, owner: entry.owner, minimal: entry.minimal, state: 'missing', ids: [], reasons: [] }
}

function codePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
