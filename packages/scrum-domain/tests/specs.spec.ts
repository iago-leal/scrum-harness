/**
 * The project spec set (v0.24, comp-59): the catalog of the fifteen SDD
 * files, the `SpecContract` over one file's text, the stable-id scanner and
 * `SpecSet.of` — the Model's classified reading of a probe of `specs/`.
 * Written BEFORE the code (TDD): every case maps to a requirement of comp-59.
 */
import { describe, expect, it } from 'vitest'
import { ArtifactContract } from '../src/contracts.ts'
import { ScrumError } from '../src/error.ts'
import {
  MINIMAL_TOTAL, SPEC_FILE_CAP, SPEC_ID, SPEC_OWNERS, SPEC_UNKNOWN_CAP,
  SpecCatalog, SpecContract, SpecSet, normalizeSpec,
} from '../src/specs.ts'
import type { SpecFile, SpecsProbe } from '../src/specs.ts'

/** A spec file of the given text (size = UTF-8 bytes unless overridden). */
function file(name: string, text: string, over: Partial<SpecFile> = {}): SpecFile {
  return { name, size: Buffer.byteLength(text, 'utf8'), text, ...over }
}

/** A frontmatter for `file` with overrides (`undefined` drops a key); body follows. */
function fm(fileName: string, over: Record<string, unknown> = {}, body = 'Body.'): string {
  const owner = SpecCatalog.entry(fileName)?.owner ?? 'product'
  const meta: Record<string, unknown> = {
    title: `"${fileName} of the thing"`, purpose: '"What this file is for."', version: 1, status: 'draft', owner, ...over,
  }
  const lines = Object.entries(meta).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${String(v)}`)
  return `---\n${lines.join('\n')}\n---\n${body}`
}

const RULES_BODY = 'R1 — every task has an id.\nR2 — text is not empty.\nS1 — every endpoint authenticates.'

describe('SpecCatalog (R1)', () => {
  it('lists the fifteen canonical files in owner-chain order, SECURITY third under architect', () => {
    expect(SpecCatalog.entries.map(e => e.file)).toEqual([
      'PRD.md', 'GLOSSARY.md', 'RULES.md',
      'ARCHITECTURE.md', 'TECH_STACK.md', 'SECURITY.md',
      'API_SPEC.md', 'DATABASE_SCHEMA.md', 'UI_UX_SPEC.md',
      'TESTS_SPEC.md',
      'AGENTS.md', 'WORKFLOW.md', 'PROMPTS.md',
      'TASKS.md', 'README.md',
    ])
    expect(SpecCatalog.entries.map(e => e.owner)).toEqual([
      'product', 'domain', 'domain',
      'architect', 'architect', 'architect',
      'api-data', 'api-data', 'api-data',
      'test',
      'agents', 'agents', 'agents',
      'ops', 'ops',
    ])
    expect(SPEC_OWNERS).toEqual(['product', 'domain', 'architect', 'api-data', 'test', 'agents', 'ops'])
    for (const entry of SpecCatalog.entries) expect(entry.purpose.trim().length).toBeGreaterThan(0)
  })

  it('the minimal set is PRD + RULES + API_SPEC (TASKS.md stays in the catalog, not minimal)', () => {
    expect(SpecCatalog.minimal().map(e => e.file)).toEqual(['PRD.md', 'RULES.md', 'API_SPEC.md'])
    expect(MINIMAL_TOTAL).toBe(3)
    expect(SpecCatalog.entry('TASKS.md')).toMatchObject({ owner: 'ops', minimal: false })
  })

  it('entry() is exact and case-sensitive; caseOf() finds the canonical name ignoring case', () => {
    expect(SpecCatalog.entry('PRD.md')).toMatchObject({ file: 'PRD.md', owner: 'product', minimal: true })
    expect(SpecCatalog.entry('prd.md')).toBeUndefined()
    expect(SpecCatalog.caseOf('prd.md')).toBe('PRD.md')
    expect(SpecCatalog.caseOf('Api_Spec.MD')).toBe('API_SPEC.md')
    expect(SpecCatalog.caseOf('NOTES.md')).toBeUndefined()
    expect(SpecCatalog.caseOf('PRD.md')).toBe('PRD.md')
  })

  it('is frozen: entries and every entry are immutable', () => {
    expect(Object.isFrozen(SpecCatalog.entries)).toBe(true)
    expect(Object.isFrozen(SpecCatalog.entries[0])).toBe(true)
    expect(SPEC_FILE_CAP).toBe(256 * 1024)
    expect(SPEC_UNKNOWN_CAP).toBe(20)
  })
})

describe('normalizeSpec (R2)', () => {
  it('strips one leading BOM and converts CRLF, never trims lines', () => {
    expect(normalizeSpec('\uFEFF---\r\nversion: 1\r\n---\r\nx')).toBe('---\nversion: 1\n---\nx')
    expect(normalizeSpec('\n\n---\nx')).toBe('\n\n---\nx')
    expect(normalizeSpec('\uFEFF\uFEFF---')).toBe('\uFEFF---')
  })
})

describe('SpecContract.check — reasons (a)–(g) in order (R2)', () => {
  const c = new SpecContract()

  it('accepts a complete draft and an approved file, with digest, version, status and ids', () => {
    const text = fm('RULES.md', {}, RULES_BODY)
    const check = c.check('RULES.md', file('RULES.md', text))
    expect(check).toEqual({
      reasons: [], version: 1, status: 'draft', digest: ArtifactContract.digestOf(RULES_BODY), ids: ['R1', 'R2', 'S1'],
    })
    const approved = c.check('PRD.md', file('PRD.md', fm('PRD.md', { status: 'approved', version: 3 })))
    expect(approved).toMatchObject({ reasons: [], version: 3, status: 'approved', ids: [] })
  })

  it('(a) over the cap by size — never by the absence of text — and unreadable stop everything', () => {
    const big = file('API_SPEC.md', fm('API_SPEC.md'), { size: SPEC_FILE_CAP + 1 })
    expect(c.check('API_SPEC.md', big)).toEqual({ reasons: ['exceeds 256 KiB (split it; small focused files)'], ids: [] })
    const atCap = file('API_SPEC.md', fm('API_SPEC.md'), { size: SPEC_FILE_CAP })
    expect(c.check('API_SPEC.md', atCap).reasons).toEqual([])
    const unreadable: SpecFile = { name: 'API_SPEC.md', size: 0, unreadable: true }
    expect(c.check('API_SPEC.md', unreadable)).toEqual({ reasons: ['could not be read'], ids: [] })
  })

  it('(b) an empty or blank file', () => {
    expect(c.check('PRD.md', file('PRD.md', ''))).toEqual({ reasons: ['is empty'], ids: [] })
    expect(c.check('PRD.md', file('PRD.md', '  \n\n'))).toEqual({ reasons: ['is empty'], ids: [] })
  })

  it('(c) frontmatter missing when line 1 is not ---, including a leading blank line; malformed when the fence is there but the subset fails', () => {
    const missing = 'frontmatter missing (must start on line 1 with ---)'
    expect(c.check('PRD.md', file('PRD.md', '# PRD\nno fence'))).toEqual({ reasons: [missing], ids: [] })
    expect(c.check('PRD.md', file('PRD.md', `\n${fm('PRD.md')}`))).toEqual({ reasons: [missing], ids: [] })
    const malformed = 'frontmatter malformed (house YAML subset: scalars, inline [lists] and { objects }, "- item" blocks, one level of nesting)'
    expect(c.check('PRD.md', file('PRD.md', '---\ntitle: [Draft PRD\nversion: 1\n---\nx'))).toEqual({ reasons: [malformed], ids: [] })
    expect(c.check('PRD.md', file('PRD.md', '---\nstakeholders:\n  - name: a\n    role: b\n---\nx'))).toEqual({ reasons: [malformed], ids: [] })
    // D3: an unterminated fence is indistinguishable from a parse failure — accepted wording.
    expect(c.check('PRD.md', file('PRD.md', '---\ntitle: "x"\nR1 — body without closing fence'))).toEqual({ reasons: [malformed], ids: [] })
    // A malformed frontmatter never leaks digest/version/status, and ids are not scanned from it.
    expect(c.check('RULES.md', file('RULES.md', 'R1 — not a fence\nR2 — nope'))).toEqual({ reasons: [missing], ids: [] })
    // BOM + CRLF are normalized before the fence test.
    expect(c.check('PRD.md', file('PRD.md', `\uFEFF${fm('PRD.md').replaceAll('\n', '\r\n')}`)).reasons).toEqual([])
  })

  it('(d) schema issues in key order with the final strings, mapped by the contract', () => {
    const t = (over: Record<string, unknown>) => c.check('PRD.md', file('PRD.md', fm('PRD.md', over))).reasons
    expect(t({ title: undefined })).toEqual(['title missing'])
    expect(t({ title: 2024 })).toEqual(['title must be a quoted string (bare digits are parsed as a number)'])
    expect(t({ title: '"   "' })).toEqual(['title must not be blank'])
    expect(t({ title: '~' })).toEqual(['title missing'])                               // D1: null → missing
    expect(t({ title: '' })).toEqual(['title missing'])                                // empty value parses as null
    expect(t({ title: '[a]' })).toEqual(['title invalid input: expected string, received array'])  // D1 fallback
    expect(t({ purpose: undefined })).toEqual(['purpose missing'])
    expect(t({ purpose: 7 })).toEqual(['purpose must be a quoted string (bare digits are parsed as a number)'])
    expect(t({ purpose: '""' })).toEqual(['purpose must not be blank'])
    expect(t({ version: undefined })).toEqual(['version missing'])
    expect(t({ version: '"2"' })).toEqual(['version must be a bare integer ≥ 1 (not quoted)'])
    expect(t({ version: 'two' })).toEqual(['version must be a bare integer ≥ 1 (not quoted)'])  // D4
    expect(t({ version: 2.5 })).toEqual(['version must be an integer ≥ 1'])
    expect(t({ version: 0 })).toEqual(['version must be an integer ≥ 1'])
    expect(t({ status: undefined })).toEqual(['status missing'])
    expect(t({ status: 'final' })).toEqual(['status must be one of draft, approved'])
    expect(t({ status: 1 })).toEqual(['status must be one of draft, approved'])
    expect(t({ owner: undefined })).toEqual(['owner missing'])
    expect(t({ owner: 'dev' })).toEqual(['owner must be one of product, domain, architect, api-data, test, agents, ops'])
    // All at once, in key order.
    expect(t({ title: undefined, purpose: 3, version: '"1"', status: 'x', owner: undefined })).toEqual([
      'title missing',
      'purpose must be a quoted string (bare digits are parsed as a number)',
      'version must be a bare integer ≥ 1 (not quoted)',
      'status must be one of draft, approved',
      'owner missing',
    ])
    // Extra keys the subset reads pass.
    expect(t({ tags: '[a, b]', meta: '{ k: v }', note: '"free: text"' })).toEqual([])
  })

  it('(e) owner mismatch against the catalog, (f) empty body, (g) duplicate ids — parsed fields still travel', () => {
    const mismatch = c.check('PRD.md', file('PRD.md', fm('PRD.md', { owner: 'architect' })))
    expect(mismatch).toMatchObject({ reasons: ['owner mismatch: PRD.md is owned by product (got architect)'], version: 1, status: 'draft' })
    const empty = c.check('PRD.md', file('PRD.md', fm('PRD.md', {}, '')))
    expect(empty).toMatchObject({ reasons: ['body is empty (only frontmatter)'], version: 1, status: 'draft', digest: ArtifactContract.digestOf(''), ids: [] })
    expect(c.check('PRD.md', file('PRD.md', fm('PRD.md', {}, '  \n'))).reasons).toEqual(['body is empty (only frontmatter)'])
    // Frontmatter of fm() takes 7 lines (fence, 5 keys, fence); the body starts on line 8.
    const dup = c.check('RULES.md', file('RULES.md', fm('RULES.md', {}, 'R1 — a\nR2 — b\n\nR1 — again\nCT-001: c\nCT-001 — d')))
    expect(dup).toMatchObject({
      reasons: ['duplicate id R1 (lines 8, 11)', 'duplicate id CT-001 (lines 12, 13)'],
      version: 1, status: 'draft', ids: ['R1', 'R2', 'CT-001'],
    })
    // Order (d) → (e) → (f)/(g) when several apply.
    const several = c.check('PRD.md', file('PRD.md', fm('PRD.md', { version: 0, owner: 'test' }, 'R1 — a\nR1 — b')))
    expect(several.reasons).toEqual([
      'version must be an integer ≥ 1',
      'owner mismatch: PRD.md is owned by product (got test)',
      'duplicate id R1 (lines 8, 9)',
    ])
    expect(several).toMatchObject({ status: 'draft', ids: ['R1'] })
    expect(several.version).toBeUndefined()
  })

  it('refuses a file outside the catalog with invalid-input (unknown never reaches the contract)', () => {
    expect(() => c.check('NOTES.md', file('NOTES.md', fm('PRD.md')))).toThrow(ScrumError)
    let code = ''
    try { c.check('prd.md', file('prd.md', fm('PRD.md'))) } catch (e) { code = (e as { code: string }).code }
    expect(code).toBe('invalid-input')
  })
})

describe('SPEC_ID and SpecContract.ids (R3)', () => {
  const c = new SpecContract()
  const idOf = (line: string): string | undefined => SPEC_ID.exec(line)?.[1]

  it('matches the five families at line start with the house markers and separators', () => {
    expect(idOf('R1 — text')).toBe('R1')
    expect(idOf('R7b: text')).toBe('R7b')
    expect(idOf('- S1 – text')).toBe('S1')
    expect(idOf('1. P2 - text')).toBe('P2')
    expect(idOf('1) C3 — text')).toBe('C3')
    expect(idOf('## CT-001 — text')).toBe('CT-001')
    expect(idOf('**P3**: text')).toBe('P3')
    expect(idOf('**R4** — text')).toBe('R4')
    expect(idOf('  R5 —')).toBe('R5')
  })

  it('table cells and the chapter\'s "R1. text" form match; R1. at end of line, ranges and glued text do not', () => {
    expect(idOf('| R1 | every task has an id |')).toBe('R1')
    expect(idOf('| **S2** | x |')).toBe('S2')
    expect(idOf('R1. Toda tarefa tem id unico.')).toBe('R1')
    expect(idOf('1. R1. text')).toBe('R1')
    expect(idOf('R1.')).toBeUndefined()
    expect(idOf('R1-R5 cover the domain')).toBeUndefined()
    expect(idOf('CT-1-x')).toBeUndefined()
    expect(idOf('| R1 |text')).toBeUndefined()
    expect(idOf('r1 — lowercase is not an id')).toBeUndefined()
    expect(idOf('REQ-1 — not a family')).toBeUndefined()
    expect(idOf('see R1 — mid-line')).toBeUndefined()
  })

  it('ids() scans only the body, unique in order of appearance; CT-001 and CT-1 are distinct', () => {
    const text = fm('TESTS_SPEC.md', {}, 'CT-001 — a (validates R2)\nCT-1 — b\n- R2 — c\nCT-001 — again\n| P1 | d |')
    expect(c.ids(text)).toEqual(['CT-001', 'CT-1', 'R2', 'P1'])
    expect(c.hits(text)).toEqual([
      { id: 'CT-001', line: 8 }, { id: 'CT-1', line: 9 }, { id: 'R2', line: 10 }, { id: 'CT-001', line: 11 }, { id: 'P1', line: 12 },
    ])
    // The frontmatter is never scanned, even when it carries id-looking lines; lines count from the file's line 1.
    expect(c.ids('---\ntitle: "R9 — not an id"\n---\nR1 — a')).toEqual(['R1'])
    expect(c.hits('---\ntitle: "x"\n---\n\nR1 — a')).toEqual([{ id: 'R1', line: 5 }])
    expect(c.hits('\uFEFF---\ntitle: "x"\n---\r\nR1 — a')).toEqual([{ id: 'R1', line: 4 }])
    expect(c.ids('no fence\nR1 — a')).toEqual([])
  })
})

describe('SpecSet.of (R5)', () => {
  const dir = (files: SpecFile[]): SpecsProbe => ({ kind: 'dir', files })
  const zero = { minimal: { approved: 0, total: 3 }, present: 0, invalid: 0, unknown: 0, complete: false, reviewed: 0 }

  it('absent and not-a-directory yield exists: false with fifteen missing entries and a zero summary', () => {
    const absent = SpecSet.of({ kind: 'absent' })
    expect(absent.exists).toBe(false)
    expect(absent.reason).toBe('absent')
    expect(absent.entries).toHaveLength(15)
    expect(absent.entries.every(e => e.state === 'missing' && e.ids.length === 0 && e.reasons.length === 0)).toBe(true)
    expect(absent.entries[0]).toEqual({ file: 'PRD.md', owner: 'product', minimal: true, state: 'missing', ids: [], reasons: [] })
    expect(absent.summary).toEqual(zero)
    expect(SpecSet.of({ kind: 'not-a-directory' })).toMatchObject({ exists: false, reason: 'not-a-directory', summary: zero })
    expect(SpecSet.of(dir([]))).toMatchObject({ exists: true, summary: zero })
    expect(SpecSet.of(dir([])).reason).toBeUndefined()
  })

  it('classifies every catalog file in catalog order, then unknown files in code-point order', () => {
    const set = SpecSet.of(dir([
      file('RULES.md', fm('RULES.md', { status: 'approved', version: 2 }, RULES_BODY)),
      file('zeta.md', 'anything'),
      file('PRD.md', fm('PRD.md', { status: 'approved' })),
      file('API_SPEC.md', fm('API_SPEC.md', { version: undefined, status: 'final' })),
      file('NOTES.md', '---\nno: contract\n---\nR1 — ids are not scanned on unknown files'),
      file('prd.md', 'lowercase twin'),
      file('TASKS.md', fm('TASKS.md')),
    ]))
    expect(set.exists).toBe(true)
    expect(set.entries.map(e => `${e.file}:${e.state}`)).toEqual([
      'PRD.md:approved', 'GLOSSARY.md:missing', 'RULES.md:approved',
      'ARCHITECTURE.md:missing', 'TECH_STACK.md:missing', 'SECURITY.md:missing',
      'API_SPEC.md:invalid', 'DATABASE_SCHEMA.md:missing', 'UI_UX_SPEC.md:missing',
      'TESTS_SPEC.md:missing',
      'AGENTS.md:missing', 'WORKFLOW.md:missing', 'PROMPTS.md:missing',
      'TASKS.md:draft', 'README.md:missing',
      'NOTES.md:unknown', 'prd.md:unknown', 'zeta.md:unknown',
    ])
    expect(set.entries[2]).toEqual({
      file: 'RULES.md', owner: 'domain', minimal: true, state: 'approved', version: 2, status: 'approved',
      digest: ArtifactContract.digestOf(RULES_BODY), ids: ['R1', 'R2', 'S1'], reasons: [],
    })
    expect(set.entries[6]).toMatchObject({
      file: 'API_SPEC.md', owner: 'api-data', minimal: true, state: 'invalid',
      reasons: ['version missing', 'status must be one of draft, approved'], ids: [],
    })
    expect(set.entries[6].version).toBeUndefined()
    expect(set.entries[6].status).toBeUndefined()
    const notes = set.entries.find(e => e.file === 'NOTES.md')!
    expect(notes).toEqual({ file: 'NOTES.md', minimal: false, state: 'unknown', ids: [], reasons: [] })
    expect(notes.owner).toBeUndefined()
    expect(set.entries.find(e => e.file === 'prd.md')).toEqual({ file: 'prd.md', minimal: false, state: 'unknown', ids: [], reasons: [], caseOf: 'PRD.md' })
    // present counts catalog files on disk; invalid counts catalog only; complete needs every minimal approved and no invalid.
    expect(set.summary).toEqual({ minimal: { approved: 2, total: 3 }, present: 4, invalid: 1, unknown: 3, complete: false, reviewed: 0 })
  })

  it('complete is true only when the three minimal files are approved and no catalog file is invalid', () => {
    const minimal = ['PRD.md', 'RULES.md', 'API_SPEC.md'].map(f => file(f, fm(f, { status: 'approved' })))
    expect(SpecSet.of(dir(minimal)).summary).toEqual({ minimal: { approved: 3, total: 3 }, present: 3, invalid: 0, unknown: 0, complete: true, reviewed: 0 })
    const withDraftReadme = [...minimal, file('README.md', fm('README.md'))]
    expect(SpecSet.of(dir(withDraftReadme)).summary).toMatchObject({ present: 4, complete: true })
    const withInvalidReadme = [...minimal, file('README.md', '# index without frontmatter')]
    expect(SpecSet.of(dir(withInvalidReadme)).summary).toMatchObject({ invalid: 1, complete: false })
    const withUnknown = [...minimal, file('x.md', 'whatever')]
    expect(SpecSet.of(dir(withUnknown)).summary).toMatchObject({ unknown: 1, complete: true })
    const oneDraft = [minimal[0]!, minimal[1]!, file('API_SPEC.md', fm('API_SPEC.md'))]
    expect(SpecSet.of(dir(oneDraft)).summary).toMatchObject({ minimal: { approved: 2, total: 3 }, complete: false })
  })

  it('carries unreadable and over-cap files as invalid with their own reason', () => {
    const set = SpecSet.of(dir([
      { name: 'PRD.md', size: 0, unreadable: true },
      { name: 'RULES.md', size: SPEC_FILE_CAP + 1 },
    ]))
    expect(set.entries[0]).toMatchObject({ state: 'invalid', reasons: ['could not be read'] })
    expect(set.entries[2]).toMatchObject({ state: 'invalid', reasons: ['exceeds 256 KiB (split it; small focused files)'] })
    expect(set.summary).toMatchObject({ present: 2, invalid: 2 })
  })

  it('refuses duplicate names with invalid-input and returns deep-frozen data', () => {
    expect(() => SpecSet.of(dir([file('PRD.md', 'a'), file('PRD.md', 'b')]))).toThrow(ScrumError)
    let code = ''
    try { SpecSet.of(dir([file('x.md', 'a'), file('x.md', 'b')])) } catch (e) { code = (e as { code: string }).code }
    expect(code).toBe('invalid-input')
    const set = SpecSet.of(dir([file('PRD.md', fm('PRD.md'))]))
    expect(Object.isFrozen(set)).toBe(true)
    expect(Object.isFrozen(set.entries)).toBe(true)
    expect(Object.isFrozen(set.entries[0])).toBe(true)
    expect(Object.isFrozen(set.entries[0].ids)).toBe(true)
    expect(Object.isFrozen(set.summary)).toBe(true)
  })
})

// ── comp-60: the pipeline of the agents — predecessors, reviews on disk, the order gate, the two briefs ──
// Written BEFORE the code (TDD): every case maps to a requirement of comp-60.
import { specReviewText, specText } from '@scrum-harness/test-support/src/fixtures.ts'
import {
  SPEC_PREDECESSORS, SpecBrief, SpecOrder, SpecReviewBrief, SpecReviewContract, reviewFileOf, specOfReview,
} from '../src/specs.ts'
import type { SpecReview } from '../src/specs.ts'

/** A probe of specs/ (+ reviews/) from texts. */
function probe(specs: Record<string, string>, reviews?: Record<string, string>): SpecsProbe {
  const files = Object.entries(specs).map(([name, text]) => file(name, text))
  return reviews === undefined
    ? { kind: 'dir', files }
    : { kind: 'dir', files, reviews: Object.entries(reviews).map(([name, text]) => file(name, text)) }
}
/** The digest of a spec text as the contract computes it. */
const digestOf = (text: string): string => new SpecContract().check('PRD.md', file('PRD.md', text)).digest!
/** An approved, currently-reviewed spec: the pair of files. */
function approved(fileName: string, body = 'Body.'): { spec: string; review: string } {
  const spec = specText(fileName, { status: 'approved', version: 2, body })
  const digest = new SpecContract().check(fileName, file(fileName, spec)).digest!
  return { spec, review: specReviewText(fileName, { version: 2, digest }) }
}

describe('SPEC_PREDECESSORS and SpecCatalog.predecessors / dependents (comp-60 R1)', () => {
  it('covers the fifteen files, PRD first with none, in the chapter chain', () => {
    expect(Object.keys(SPEC_PREDECESSORS).sort()).toEqual(SpecCatalog.entries.map(e => e.file).sort())
    expect(SpecCatalog.predecessors('PRD.md')).toEqual([])
    expect(SpecCatalog.predecessors('GLOSSARY.md')).toEqual(['PRD.md'])
    expect(SpecCatalog.predecessors('RULES.md')).toEqual(['PRD.md'])
    expect(SpecCatalog.predecessors('ARCHITECTURE.md')).toEqual(['RULES.md'])
    expect(SpecCatalog.predecessors('SECURITY.md')).toEqual(['RULES.md'])
    expect(SpecCatalog.predecessors('API_SPEC.md')).toEqual(['ARCHITECTURE.md'])
    expect(SpecCatalog.predecessors('UI_UX_SPEC.md')).toEqual(['ARCHITECTURE.md'])
    expect(SpecCatalog.predecessors('TESTS_SPEC.md')).toEqual(['RULES.md', 'API_SPEC.md'])
    expect(SpecCatalog.predecessors('AGENTS.md')).toEqual(['ARCHITECTURE.md'])
    expect(SpecCatalog.predecessors('README.md')).toEqual(['PRD.md'])
    expect(Object.isFrozen(SPEC_PREDECESSORS)).toBe(true)
  })

  it('is acyclic and every predecessor is a catalog file', () => {
    const visit = (node: string, path: string[]): void => {
      expect(path).not.toContain(node)
      for (const p of SPEC_PREDECESSORS[node]!) {
        expect(SpecCatalog.entry(p)).toBeDefined()
        visit(p, [...path, node])
      }
    }
    for (const node of Object.keys(SPEC_PREDECESSORS)) visit(node, [])
  })

  it('dependents is the inverse, in catalog order; both refuse a file outside the catalog', () => {
    expect(SpecCatalog.dependents('PRD.md')).toEqual(['GLOSSARY.md', 'RULES.md', 'TASKS.md', 'README.md'])
    expect(SpecCatalog.dependents('RULES.md')).toEqual(['ARCHITECTURE.md', 'TECH_STACK.md', 'SECURITY.md', 'TESTS_SPEC.md'])
    expect(SpecCatalog.dependents('TESTS_SPEC.md')).toEqual([])
    expect(() => SpecCatalog.predecessors('prd.md')).toThrow(ScrumError)
    expect(() => SpecCatalog.dependents('X.md')).toThrow(/not a catalog spec file/)
  })

  it('names the review file of a spec and back', () => {
    expect(reviewFileOf('PRD.md')).toBe('PRD.review.md')
    expect(reviewFileOf('API_SPEC.md')).toBe('API_SPEC.review.md')
    expect(specOfReview('PRD.review.md')).toBe('PRD.md')
    expect(specOfReview('notes.review.md')).toBeUndefined()
    expect(specOfReview('PRD.md')).toBeUndefined()
  })
})

describe('SpecReviewContract — one state rule (comp-60 R2)', () => {
  const contract = new SpecReviewContract()
  const prd = specText('PRD.md', { status: 'draft', version: 2 })
  const prdCheck = { state: 'draft' as const, version: 2, digest: digestOf(prd) }
  const review = (over: Parameters<typeof specReviewText>[1]) => file('PRD.review.md', specReviewText('PRD.md', over))

  it('none without a file', () => {
    expect(contract.check('PRD.md', undefined, prdCheck)).toEqual({ state: 'none', reasons: [] })
  })

  it('invalid (a)–(e) in order, with whatever parsed travelling', () => {
    expect(contract.check('PRD.md', { name: 'PRD.review.md', size: 0, unreadable: true }, prdCheck)).toMatchObject({ state: 'invalid', reasons: ['could not be read'] })
    expect(contract.check('PRD.md', { name: 'PRD.review.md', size: SPEC_FILE_CAP + 1 }, prdCheck).reasons).toEqual(['exceeds 256 KiB (split it; small focused files)'])
    expect(contract.check('PRD.md', file('PRD.review.md', '  \n'), prdCheck).reasons).toEqual(['is empty'])
    expect(contract.check('PRD.md', file('PRD.review.md', 'no fence'), prdCheck).reasons).toEqual(['frontmatter missing (must start on line 1 with ---)'])
    expect(contract.check('PRD.md', file('PRD.review.md', '---\nreviewer: [a\n---\nx'), prdCheck).reasons[0]).toMatch(/frontmatter malformed/)
    const bare = contract.check('PRD.md', file('PRD.review.md', `---\nreviewed_version: 2\nreviewed_digest: 00123456\nverdict: approved\nround: 1\nfindings: { high: 0, medium: 0, low: 0 }\n---\nbody`), prdCheck)
    expect(bare.state).toBe('invalid')
    expect(bare.reasons).toEqual(['reviewer missing', 'reviewed_digest must be a quoted string (write reviewed_digest: "…" — bare digits are parsed as a number)'])
    expect(bare.version).toBe(2)
    expect(bare.round).toBe(1)
    const noBody = contract.check('PRD.md', file('PRD.review.md', specReviewText('PRD.md', { version: 2, digest: prdCheck.digest, body: '' })), prdCheck)
    expect(noBody.reasons).toEqual(['body is empty (only frontmatter)'])
    expect(noBody).toMatchObject({ state: 'invalid', version: 2, digest: prdCheck.digest, verdict: 'approved', round: 1, high: 0 })
  })

  it('stale for a missing or invalid spec, without comparing version or digest', () => {
    const r = review({ version: 2, digest: prdCheck.digest })
    expect(contract.check('PRD.md', r, { state: 'missing' })).toMatchObject({ state: 'stale', reasons: ['PRD.md is missing (nothing to cover)'] })
    expect(contract.check('PRD.md', r, { state: 'invalid', version: 2, digest: prdCheck.digest })).toMatchObject({ state: 'stale', reasons: ['PRD.md is invalid (fix the contract first)'] })
  })

  it('stale when version or digest differ, accumulating both', () => {
    expect(contract.check('PRD.md', review({ version: 1, digest: prdCheck.digest }), prdCheck))
      .toMatchObject({ state: 'stale', reasons: ['review covers version 1 but PRD.md is at version 2'] })
    expect(contract.check('PRD.md', review({ version: 2, digest: 'deadbeef' }), prdCheck))
      .toMatchObject({ state: 'stale', reasons: [`PRD.md text changed since the review (digest deadbeef ≠ ${prdCheck.digest})`] })
    expect(contract.check('PRD.md', review({ version: 1, digest: 'deadbeef' }), prdCheck).reasons).toHaveLength(2)
  })

  it('needs-revision when it covers the text but the verdict or the high count says no; current otherwise', () => {
    expect(contract.check('PRD.md', review({ version: 2, digest: prdCheck.digest, verdict: 'needs-revision' }), prdCheck))
      .toMatchObject({ state: 'needs-revision', reasons: ['review verdict is needs-revision'] })
    expect(contract.check('PRD.md', review({ version: 2, digest: prdCheck.digest, high: 2 }), prdCheck))
      .toMatchObject({ state: 'needs-revision', reasons: ['review is approved with findings.high 2 (must be 0)'] })
    const current = contract.check('PRD.md', review({ version: 2, digest: prdCheck.digest, round: 3 }), prdCheck)
    expect(current).toMatchObject({ state: 'current', reasons: [], version: 2, digest: prdCheck.digest, verdict: 'approved', round: 3, high: 0 })
    expect(current.body).toBe('No blocking finding.')
  })
})

describe('SpecSet.of with reviews (comp-60 R3)', () => {
  it('attaches the review to each entry, omits it when none, counts reviewed, keeps complete unchanged', () => {
    const prd = approved('PRD.md')
    const rules = specText('RULES.md', { status: 'approved', body: RULES_BODY })
    const set = SpecSet.of(probe(
      { 'PRD.md': prd.spec, 'RULES.md': rules, 'API_SPEC.md': specText('API_SPEC.md', { status: 'approved' }) },
      { 'PRD.review.md': prd.review, 'RULES.review.md': specReviewText('RULES.md', { version: 9, digest: 'x' }) },
    ))
    const byFile = new Map(set.entries.map(e => [e.file, e]))
    expect(byFile.get('PRD.md')!.review).toMatchObject({ state: 'current' })
    expect(byFile.get('RULES.md')!.review).toMatchObject({ state: 'stale' })
    expect(byFile.get('API_SPEC.md')!.review).toBeUndefined()
    expect(byFile.get('GLOSSARY.md')!.review).toBeUndefined()
    expect(set.summary).toEqual({ minimal: { approved: 3, total: 3 }, present: 3, invalid: 0, unknown: 0, complete: true, reviewed: 1 })
    expect(set.unknownReviews).toEqual([])
    expect(Object.isFrozen(byFile.get('PRD.md')!.review)).toBe(true)
  })

  it('a review of a missing spec rides the missing entry as stale; unknown reviews are listed with caseOf; a stray review in specs/ gets a hint', () => {
    const set = SpecSet.of(probe(
      { 'PRD.review.md': 'stray' },
      { 'PRD.review.md': specReviewText('PRD.md', { version: 1, digest: 'abcd1234' }), 'notes.review.md': 'x', 'prd.review.md': 'y' },
    ))
    expect(set.entries.find(e => e.file === 'PRD.md')!.review).toMatchObject({ state: 'stale', reasons: ['PRD.md is missing (nothing to cover)'] })
    expect(set.unknownReviews).toEqual([{ file: 'notes.review.md' }, { file: 'prd.review.md', caseOf: 'PRD.review.md' }])
    expect(set.entries.find(e => e.file === 'PRD.review.md')).toMatchObject({ state: 'unknown', hint: 'reviews go in specs/reviews/' })
    expect(set.summary.reviewed).toBe(0)
  })

  it('a probe without reviews reads as no reviews; a duplicate review name is refused', () => {
    const set = SpecSet.of(probe({ 'PRD.md': specText('PRD.md') }))
    expect(set.entries[0]!.review).toBeUndefined()
    expect(set.unknownReviews).toEqual([])
    const dup: SpecsProbe = { kind: 'dir', files: [], reviews: [file('PRD.review.md', 'a'), file('PRD.review.md', 'b')] }
    expect(() => SpecSet.of(dup)).toThrow(/twice/)
  })
})

describe('SpecOrder.gate (comp-60 R4)', () => {
  it('PRD is never barred; a predecessor missing, draft or invalid names only its state', () => {
    expect(SpecOrder.gate('PRD.md', SpecSet.of({ kind: 'absent' }))).toEqual([])
    expect(SpecOrder.gate('RULES.md', SpecSet.of({ kind: 'absent' }))).toEqual(['PRD.md is missing (needs approved)'])
    // A draft predecessor names both what it lacks (R4: the review is checked for draft and approved).
    const draft = specText('PRD.md')
    expect(SpecOrder.gate('RULES.md', SpecSet.of(probe({ 'PRD.md': draft })))).toEqual([
      'PRD.md is draft (needs approved)',
      `PRD.md has no review (needs a current review: verdict approved, findings.high 0, covering version 1 and digest ${digestOf(draft)})`,
    ])
    const invalid = SpecOrder.gate('RULES.md', SpecSet.of(probe({ 'PRD.md': '---\ntitle: "x"\n---\nbody' })))
    expect(invalid).toEqual(['PRD.md is invalid (needs approved): purpose missing; version missing; status missing; owner missing'])
  })

  it('an approved predecessor still needs a current review', () => {
    const prd = approved('PRD.md')
    const set = (review?: string) => SpecSet.of(probe({ 'PRD.md': prd.spec }, review === undefined ? undefined : { 'PRD.review.md': review }))
    const digest = digestOf(prd.spec)
    expect(SpecOrder.gate('RULES.md', set())).toEqual([`PRD.md has no review (needs a current review: verdict approved, findings.high 0, covering version 2 and digest ${digest})`])
    expect(SpecOrder.gate('RULES.md', set(specReviewText('PRD.md', { version: 1, digest })))).toEqual(['PRD.md review is stale: review covers version 1 but PRD.md is at version 2'])
    expect(SpecOrder.gate('RULES.md', set(specReviewText('PRD.md', { version: 2, digest, high: 1 })))).toEqual(['PRD.md review needs-revision: review is approved with findings.high 1 (must be 0)'])
    expect(SpecOrder.gate('RULES.md', set('no fence'))).toEqual(['PRD.md review is invalid: frontmatter missing (must start on line 1 with ---)'])
    expect(SpecOrder.gate('RULES.md', set(prd.review))).toEqual([])
  })

  it('names every predecessor, in catalog order', () => {
    const rules = approved('RULES.md', RULES_BODY)
    const api = specText('API_SPEC.md')
    const reasons = SpecOrder.gate('TESTS_SPEC.md', SpecSet.of(probe({ 'RULES.md': rules.spec, 'API_SPEC.md': api })))
    expect(reasons).toEqual([
      `RULES.md has no review (needs a current review: verdict approved, findings.high 0, covering version 2 and digest ${digestOf(rules.spec)})`,
      'API_SPEC.md is draft (needs approved)',
      `API_SPEC.md has no review (needs a current review: verdict approved, findings.high 0, covering version 1 and digest ${digestOf(api)})`,
    ])
    expect(() => SpecOrder.gate('nope.md', SpecSet.of({ kind: 'absent' }))).toThrow(ScrumError)
  })
})

describe('SpecBrief.of (comp-60 R5)', () => {
  it('refuses with spec-order naming the requested file first and every reason', () => {
    let caught: unknown
    const rules = specText('RULES.md')
    try { SpecBrief.of('TESTS_SPEC.md', probe({ 'RULES.md': rules })) } catch (error) { caught = error }
    expect(caught).toBeInstanceOf(ScrumError)
    expect((caught as ScrumError).code).toBe('spec-order')
    expect((caught as ScrumError).message).toBe(`TESTS_SPEC.md: RULES.md is draft (needs approved); RULES.md has no review (needs a current review: verdict approved, findings.high 0, covering version 1 and digest ${digestOf(rules)}); API_SPEC.md is missing (needs approved) — write and approve the predecessors first`)
  })

  it('PRD with no specs/ at all: no predecessors, no current version, version 1, dependents', () => {
    const brief = SpecBrief.of('PRD.md', { kind: 'absent' })
    expect(brief).toMatchObject({ file: 'PRD.md', entry: { owner: 'product', minimal: true }, predecessors: [], nextVersion: 1, reviewPath: 'specs/reviews/PRD.review.md' })
    expect(brief.current).toBeUndefined()
    expect(brief.previousReview).toBeUndefined()
    expect(brief.dependents).toEqual(['GLOSSARY.md', 'RULES.md', 'TASKS.md', 'README.md'])
    expect(SpecBrief.of('PRD.md', { kind: 'not-a-directory' }).predecessors).toEqual([])
  })

  it('carries the predecessors whole, the current version (even invalid) and the previous review', () => {
    const prd = approved('PRD.md', 'Vision.')
    const rulesDraft = specText('RULES.md', { version: 3, body: RULES_BODY })
    const brief = SpecBrief.of('RULES.md', probe(
      { 'PRD.md': prd.spec, 'RULES.md': rulesDraft },
      { 'PRD.review.md': prd.review, 'RULES.review.md': specReviewText('RULES.md', { version: 3, digest: 'nope', verdict: 'needs-revision', high: 1, body: 'H1 — fix R2.' }) },
    ))
    expect(brief.predecessors).toEqual([{ file: 'PRD.md', version: 2, digest: digestOf(prd.spec), text: prd.spec }])
    expect(brief.current).toMatchObject({ state: 'draft', version: 3, status: 'draft', reasons: [], text: rulesDraft })
    expect(brief.nextVersion).toBe(4)
    expect(brief.previousReview).toMatchObject({ state: 'stale', body: 'H1 — fix R2.' })
    const invalid = SpecBrief.of('RULES.md', probe({ 'PRD.md': prd.spec, 'RULES.md': '---\ntitle: "r"\n---\nR1 — x' }, { 'PRD.review.md': prd.review }))
    expect(invalid.current).toMatchObject({ state: 'invalid', reasons: ['purpose missing', 'version missing', 'status missing', 'owner missing'] })
    expect(invalid.nextVersion).toBe(1)
    expect(Object.isFrozen(brief.predecessors)).toBe(true)
  })
})

describe('SpecReviewBrief.of (comp-60 R7)', () => {
  it('refuses a missing or invalid spec, never the order', () => {
    expect(() => SpecReviewBrief.of('PRD.md', { kind: 'absent' })).toThrow(/PRD\.md: write it first — scrum_spec_brief/)
    let caught: unknown
    try { SpecReviewBrief.of('PRD.md', probe({ 'PRD.md': '---\ntitle: "x"\n---\nbody' })) } catch (error) { caught = error }
    expect((caught as ScrumError).code).toBe('spec-review-brief')
    expect((caught as ScrumError).message).toBe('PRD.md: fix the contract before asking for a review (purpose missing; version missing; status missing; owner missing)')
    // RULES with a draft PRD: allowed, with the order warnings attached.
    const brief = SpecReviewBrief.of('RULES.md', probe({ 'PRD.md': specText('PRD.md'), 'RULES.md': specText('RULES.md', { body: RULES_BODY }) }))
    expect(brief.orderWarnings[0]).toBe('PRD.md is draft (needs approved)')
    expect(brief.orderWarnings).toHaveLength(2)
    expect(brief.spec).toMatchObject({ version: 1, status: 'draft', ids: ['R1', 'R2', 'S1'] })
    expect(brief.round).toBe(1)
    expect(brief.dependents).toEqual(['ARCHITECTURE.md', 'TECH_STACK.md', 'SECURITY.md', 'TESTS_SPEC.md'])
    expect(brief.reviewPath).toBe('specs/reviews/RULES.review.md')
  })

  it('round follows the parsed round even on an invalid review; 2 without a parseable round', () => {
    const prd = specText('PRD.md', { version: 2 })
    const digest = digestOf(prd)
    const withRound = SpecReviewBrief.of('PRD.md', probe({ 'PRD.md': prd }, { 'PRD.review.md': specReviewText('PRD.md', { version: 2, digest, round: 3, body: '' }) }))
    expect(withRound.previousReview).toMatchObject({ state: 'invalid', round: 3 })
    expect(withRound.round).toBe(4)
    const noRound = SpecReviewBrief.of('PRD.md', probe({ 'PRD.md': prd }, { 'PRD.review.md': 'free text' }))
    expect(noRound.round).toBe(2)
    const current = SpecReviewBrief.of('PRD.md', probe({ 'PRD.md': prd }, { 'PRD.review.md': specReviewText('PRD.md', { version: 2, digest }) }))
    expect(current.round).toBe(2)
    expect(current.previousReview).toMatchObject({ state: 'current' })
    expect(current.orderWarnings).toEqual([])
    const _typed: SpecReview | undefined = current.previousReview
    void _typed
  })
})
