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
  const zero = { minimal: { approved: 0, total: 3 }, present: 0, invalid: 0, unknown: 0, complete: false }

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
    expect(set.summary).toEqual({ minimal: { approved: 2, total: 3 }, present: 4, invalid: 1, unknown: 3, complete: false })
  })

  it('complete is true only when the three minimal files are approved and no catalog file is invalid', () => {
    const minimal = ['PRD.md', 'RULES.md', 'API_SPEC.md'].map(f => file(f, fm(f, { status: 'approved' })))
    expect(SpecSet.of(dir(minimal)).summary).toEqual({ minimal: { approved: 3, total: 3 }, present: 3, invalid: 0, unknown: 0, complete: true })
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
