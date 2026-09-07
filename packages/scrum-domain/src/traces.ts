/**
 * The traceability matrix as domain data (v0.18, comp-49): requirement ids
 * ↔ the files that implement them ↔ the tests that prove them. Nothing new
 * is persisted — the matrix lives in the frontmatter the design already
 * carries (`traces:` — the plan) and, optionally, in the validation's (the
 * as-built, which then wins). {@link TraceContract} is the fourth member of
 * the artifact-contract family: it names every violated condition the
 * design → tdd and done gates refuse with. {@link TraceMatrix} is the
 * lenient reading of the same data — the derived sets the tree, the tool
 * and the GUI show (holes included) without ever blocking anything.
 * {@link matchPath}, {@link gitignoreNames} and {@link traceGateFor} are
 * the pure rules the impact query and the tool notes rest on: the
 * Controller only probes the disk and prints.
 * @module @scrum-harness/domain/traces
 */

import { z } from 'zod'
import { ArtifactContract, RequirementsContract } from './contracts.ts'
import type { ArtifactMeta, ContractResult } from './contracts.ts'
import type { Component, ComponentPhase } from './spec.ts'

// The id regex lives beside `RequirementsContract.ids` (contracts.ts) and is re-exported here.
export { REQUIREMENT_ID } from './contracts.ts'

/** The two artifact fields a matrix may live in. */
export type TraceField = 'design' | 'validation'

/** Where the effective matrix of a component comes from (R1): the as-built wins, else the plan, else nothing. */
export type TraceSource = TraceField | null

/** One normalized entry of the matrix. */
export interface TraceEntry {
  req: string[]
  files: string[]
  tests: string[]
}

/** The most files the tool's disk probe lists under one query (R6). */
export const TRACE_PROBE_CAP = 500

/**
 * Normalize a workspace-relative path (R1): `\` → `/`, doubled slashes
 * collapsed, `.` segments dropped, trailing slash dropped. `''`, `.` and
 * `./` all yield `''` — the root, accepted only as a query.
 * @param text - the raw path.
 * @returns the normalized path.
 */
export function normalizePath(text: string): string {
  const slashed = text.trim().replaceAll('\\', '/').replace(/\/{2,}/g, '/')
  const segments = slashed.split('/').filter((segment, index) => !(segment === '.' || (segment === '' && index > 0)))
  // A leading '' segment is the absolute-path marker: keep it so pathIssue can name it.
  const joined = segments.join('/')
  return joined === '' && slashed.startsWith('/') ? '/' : joined
}

/** Why a normalized value is not a workspace-relative path (R1), or null when it is one. */
export type PathIssue = 'empty' | 'absolute' | '.. segment' | 'whitespace'

/**
 * Name the reason a normalized path cannot be a trace entry.
 * @param path - a value already passed through {@link normalizePath}.
 * @returns the issue, or null for a valid workspace-relative path.
 */
export function pathIssue(path: string): PathIssue | null {
  if (path.length === 0) return 'empty'
  if (path.startsWith('/') || /^[A-Za-z]:\//.test(path)) return 'absolute'
  if (path.split('/').includes('..')) return '.. segment'
  if (/\s/.test(path)) return 'whitespace'
  return null
}

/**
 * Whether a traced path answers a query (R5): the root matches everything,
 * else exact or under the query as a directory. Exact and case-sensitive.
 * @param p - a normalized traced path.
 * @param q - a normalized query.
 * @returns true when `p` is `q` or lives under it.
 */
export function matchPath(p: string, q: string): boolean {
  return q === '' || p === q || p.startsWith(`${q}/`)
}

/** Compare requirement ids by number, then suffix (`R1, R2, R7, R7b, R10`). */
function compareIds(a: string, b: string): number {
  const na = Number(/\d+/.exec(a)?.[0] ?? 0)
  const nb = Number(/\d+/.exec(b)?.[0] ?? 0)
  if (na !== nb) return na - nb
  return a < b ? -1 : a > b ? 1 : 0
}

/** Sort ids by number then suffix (a new array). */
export function sortIds(ids: Iterable<string>): string[] {
  return [...ids].sort(compareIds)
}

/** Code-point order (never locale-aware). */
function codePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Frontmatter of a traced artifact: only the `traces` key matters; every other key passes. */
const traceEntrySchema = z.object({
  req: z.preprocess(value => (Array.isArray(value) ? value : [value]), z.array(z.string().min(1))),
  files: z.array(z.string()),
  tests: z.array(z.string()),
})
export const traceMetaSchema = z.object({
  traces: z.array(traceEntrySchema).nullable().optional(),
})
export type TraceMeta = z.infer<typeof traceMetaSchema>

/** The reason texts the contract emits, shared with the matrix's `issues`. */
const MISSING_HINT = 'traces missing (one `- { req, files, tests }` per line)'
const MULTILINE_HINT = 'traces must be one indented inline object per line: `  - { req: [R1], files: [...], tests: [...] }` (no multi-line objects)'

/**
 * The trace contract (R3): governs the `traces` key of one artifact's
 * frontmatter. `check` reports every violated condition in a fixed order —
 * (a) artifact/frontmatter/schema, (b) key missing, (c) empty list, (d) bad
 * members, (f) requirements without ids (then stop), (e) unknown ids, (g)
 * untraced ids. Stateless, like the rest of the family.
 */
export class TraceContract extends ArtifactContract<TraceMeta> {
  readonly requirements = new RequirementsContract()

  /**
   * @param field - the artifact field the matrix is read from.
   */
  constructor(field: TraceField) {
    super(field, traceMetaSchema)
  }

  /** Parsed frontmatter with the house wording for a malformed traces block and for scalar members (r1 M4/M5). */
  override meta(component: Component): ArtifactMeta<TraceMeta> {
    const parsed = super.meta(component)
    if (parsed.meta !== null) return parsed
    const text = this.normalize(component[this.field] ?? '')
    const issues = parsed.issues.map((issue) => {
      if (issue.includes('missing or malformed') && /^traces:/m.test(text)) {
        return `\`${this.field}\` frontmatter malformed — ${MULTILINE_HINT}`
      }
      const scalar = /^`\w+` frontmatter: (traces\.\d+\.(?:req|files|tests)\.\d+) invalid input: expected string, received (?:number|boolean|null)$/i.exec(issue)
      if (scalar !== null) {
        return `\`${this.field}\` frontmatter: ${scalar[1]} must be a quoted string (bare digits/true/false/null are parsed as scalars)`
      }
      return issue
    })
    return { meta: null, issues }
  }

  /**
   * Whether this artifact carries a matrix (R1): the frontmatter parses and
   * `traces` is an array — empty included; null (`traces:` with nothing
   * under it), malformed or absent do not carry one.
   */
  carries(component: Component): boolean {
    const { meta } = this.meta(component)
    return meta !== null && Array.isArray(meta.traces)
  }

  /**
   * The entries as written, normalized: `req` always a list, paths through
   * {@link normalizePath} (invalid strings stay, normalized, for the lenient reading).
   * @returns the entries, or null when the artifact carries no matrix.
   */
  entries(component: Component): TraceEntry[] | null {
    const { meta } = this.meta(component)
    if (meta === null || !Array.isArray(meta.traces)) return null
    return meta.traces.map(entry => ({
      req: [...entry.req],
      files: entry.files.map(normalizePath),
      tests: entry.tests.map(normalizePath),
    }))
  }

  /** Conditions (a) → (g) of R3, every violated one reported. */
  check(component: Component): ContractResult {
    const reasons: string[] = []
    const { meta, issues } = this.meta(component)
    if (meta === null) reasons.push(...issues)
    else if (!Array.isArray(meta.traces)) reasons.push(`\`${this.field}\` frontmatter: ${MISSING_HINT}`)
    else if (meta.traces.length === 0) reasons.push(`\`${this.field}\` frontmatter: traces is empty`)
    else {
      // (d) members, by entry and member index; the raw text names the value as written.
      meta.traces.forEach((entry, i) => {
        if (entry.req.length === 0) reasons.push(`traces[${i}].req is empty`)
        for (const member of ['files', 'tests'] as const) {
          entry[member].forEach((raw, j) => {
            const issue = pathIssue(normalizePath(raw))
            if (issue === 'empty') reasons.push(`traces[${i}].${member}[${j}] "${raw}" is empty`)
            else if (issue !== null) reasons.push(`traces[${i}].${member}[${j}] "${raw}" is not a workspace-relative path (${issue})`)
          })
        }
      })
      const ids = this.requirements.ids(component)
      if (ids.length === 0) {
        // (f) — and stop: (e)/(g) would be vacuous.
        reasons.push('`requirements` declare no R-ids (write R1 — … at line start)')
      } else {
        const known = new Set(ids)
        const cited = new Set(meta.traces.flatMap(entry => entry.req))
        const unknown = sortIds([...cited].filter(id => !known.has(id)))
        if (unknown.length > 0) reasons.push(`traces name unknown requirement(s) ${unknown.join(', ')} (ids found: ${sortIds(ids).join(', ')})`)
        const untraced = sortIds(ids.filter(id => !cited.has(id)))
        if (untraced.length > 0) reasons.push(`requirement(s) without trace: ${untraced.join(', ')} (add an entry; files: [] for a requirement without code)`)
      }
    }
    return reasons.length === 0 ? { ok: true } : { ok: false, reasons }
  }
}

/** The matrix as plain, deep-frozen data (R3): what the tree, the API, the tool and the GUI read. */
export interface TraceMatrixData {
  source: TraceSource
  entries: TraceEntry[]
  /** Requirement ids found in the requirements body, in order of appearance. */
  ids: string[]
  /** Ids in no entry. */
  untraced: string[]
  /** Ids cited by entries that the requirements do not declare. */
  unknown: string[]
  /** Ids whose entries name no file at all (process / out of scope). */
  nocode: string[]
  /** Ids with files but no test anywhere. */
  unproven: string[]
  /** Every traced file, distinct, code-point order. */
  files: string[]
  /** Every traced test, distinct, code-point order. */
  tests: string[]
  /** The contract's reasons on the effective source (or on a filled design without one); informative. */
  issues: string[]
}

/** Freeze an object graph of plain objects and arrays in place (exported since v0.24 for `SpecSet.of`, comp-59 R5). */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const inner of Object.values(value as Record<string, unknown>)) deepFreeze(inner)
  }
  return value
}

/**
 * The lenient reading of a component's matrix (R3). Only static members:
 * the value it builds is a frozen plain object, so it rides `tree()`, the
 * JSON API and `toEqual` unchanged.
 */
export class TraceMatrix {
  private constructor() {}

  /**
   * Which artifact carries the effective matrix (R1).
   * @param component - the component.
   * @returns `validation` when its frontmatter carries an array, else `design` under the same rule, else null.
   */
  static sourceOf(component: Component): TraceSource {
    if (new TraceContract('validation').carries(component)) return 'validation'
    if (new TraceContract('design').carries(component)) return 'design'
    return null
  }

  /**
   * Build the matrix of one component.
   * @param component - the component (live or archived; the caller decides).
   * @returns the deep-frozen matrix data.
   */
  static of(component: Component): TraceMatrixData {
    const source = TraceMatrix.sourceOf(component)
    const contract = new TraceContract(source ?? 'design')
    const entries = source === null ? [] : (contract.entries(component) ?? [])
    const ids = contract.requirements.ids(component)
    const known = new Set(ids)
    const filesOf = new Map<string, Set<string>>()
    const testsOf = new Map<string, Set<string>>()
    const cited = new Set<string>()
    for (const entry of entries) {
      for (const id of entry.req) {
        cited.add(id)
        const f = filesOf.get(id) ?? new Set<string>()
        const t = testsOf.get(id) ?? new Set<string>()
        for (const p of entry.files) f.add(p)
        for (const p of entry.tests) t.add(p)
        filesOf.set(id, f)
        testsOf.set(id, t)
      }
    }
    const traced = ids.filter(id => cited.has(id))
    const issues = source !== null
      ? reasonsOf(contract.check(component))
      : (component.design ?? '').trim().length > 0 ? reasonsOf(new TraceContract('design').check(component)) : []
    const data: TraceMatrixData = {
      source,
      entries,
      ids,
      untraced: sortIds(ids.filter(id => !cited.has(id))),
      unknown: sortIds([...cited].filter(id => !known.has(id))),
      nocode: sortIds(traced.filter(id => (filesOf.get(id)?.size ?? 0) === 0)),
      unproven: sortIds(traced.filter(id => (filesOf.get(id)?.size ?? 0) > 0 && (testsOf.get(id)?.size ?? 0) === 0)),
      files: [...new Set(entries.flatMap(e => e.files))].sort(codePoint),
      tests: [...new Set(entries.flatMap(e => e.tests))].sort(codePoint),
      issues,
    }
    return deepFreeze(data)
  }
}

/** The reasons of a contract result, or none. */
function reasonsOf(result: ContractResult): string[] {
  return result.ok ? [] : result.reasons
}

/**
 * Reduce a root `.gitignore` to the plain names the disk probe skips (R6,
 * r2 M8): comments, blank lines, globs (`*`, `?`, `[`), negations (`!`) and
 * paths with an inner `/` are dropped; one leading and one trailing `/` are
 * stripped; the remaining names match a basename at any depth, like git.
 * @param text - the file's content.
 * @returns the distinct names, in file order.
 */
export function gitignoreNames(text: string): string[] {
  const names: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.length === 0 || line.startsWith('#')) continue
    if (/[*?[!]/.test(line)) continue
    const name = line.replace(/^\//, '').replace(/\/$/, '')
    if (name.length === 0 || name.includes('/')) continue
    if (!names.includes(name)) names.push(name)
  }
  return names
}

/** The gate that reads a traced field (R8), or null when the field is not the effective source. */
export type TraceGate = 'design → tdd' | 'done'

/**
 * Which gate will read the matrix of one field (R8, r2 M2): the design is
 * read by design → tdd while the component has not left design, and by the
 * done gate afterwards — unless the validation carries the as-built; the
 * validation is read by the done gate only when it carries an array.
 * @param component - the component.
 * @param field - the field just written.
 * @returns the gate, or null.
 */
export function traceGateFor(component: Pick<Component, 'phase' | 'design' | 'validation' | 'requirements'>, field: TraceField): TraceGate | null {
  const source = TraceMatrix.sourceOf(component as Component)
  if (field === 'design') {
    const early: ComponentPhase[] = ['requirements', 'design']
    if (early.includes(component.phase)) return 'design → tdd'
    return source === 'design' ? 'done' : null
  }
  return source === 'validation' ? 'done' : null
}
