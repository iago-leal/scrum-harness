/**
 * The work item form's pure logic (comp-43, R9): the spiral trail, the
 * primary action, the readiness checklist, dirtiness, the save patch, the
 * follow-the-server rule, the default-open artifacts and the phase log lines.
 * Written BEFORE the implementation (TDD). No React, no DOM: this is the
 * first suite of `ui-scrum`, and it runs under the root `vitest run` with no
 * config, importing the source by relative path like every other package.
 */
import { describe, expect, it } from 'vitest'
import type { WirePhase, WirePhaseReadiness } from '../src/client/api.ts'
import {
  ARTIFACT_FIELDS, ARTIFACT_LABELS, ARTIFACT_PLACEHOLDERS, PHASE_TITLES, PHASES,
  artifactPatch, checklist, followServer, isDirty, openByDefault, phaseLabel, phaseLogLines, phaseSteps, primaryAction,
} from '../src/client/form.ts'
import type { FormDrafts, FormServer, PhaseStep } from '../src/client/form.ts'

/** A readiness verdict as the Model would emit it for a component in `phase`. */
function readiness(
  phase: WirePhase,
  status: WirePhaseReadiness['status'] = 'in_progress',
  extra: Partial<WirePhaseReadiness> = {},
): WirePhaseReadiness {
  const nextOf: Record<WirePhase, WirePhase | 'done'> = {
    requirements: 'design', design: 'tdd', tdd: 'construction', construction: 'validation', validation: 'done',
  }
  const next = status === 'done' ? null : nextOf[phase]
  return { phase, status, next, ok: true, reasons: [], ...extra }
}

const FREE = { dirty: false, pending: false }

/** Compact view of the six steps: `id:state[:op]` with `!` when clickable. */
const shape = (steps: PhaseStep[]) => steps.map(s => `${s.id}:${s.state}${s.op === null ? '' : `:${s.op}`}${s.clickable ? '!' : ''}`)

describe('constants (R9)', () => {
  it('duplicates the domain order on purpose: PHASES and ARTIFACT_FIELDS', () => {
    expect(PHASES).toEqual(['requirements', 'design', 'tdd', 'construction', 'validation'])
    expect(ARTIFACT_FIELDS).toEqual(['requirements', 'requirementsReview', 'design', 'validation'])
  })

  it('labels every artifact in pt-BR and titles every step', () => {
    expect(ARTIFACT_LABELS).toEqual({
      requirements: 'Requisitos', requirementsReview: 'Revisão dos requisitos', design: 'Desenho', validation: 'Validação',
    })
    for (const field of ARTIFACT_FIELDS) expect(ARTIFACT_PLACEHOLDERS[field].startsWith('---\n')).toBe(true)
    // r2 M4: the suite budget is per board and the wire does not carry it — no number in the placeholder.
    expect(ARTIFACT_PLACEHOLDERS.validation).toContain('budget_seconds: <teto do quadro — scrum_suite_budget>')
    expect(ARTIFACT_PLACEHOLDERS.validation).not.toMatch(/budget_seconds: \d/)
    for (const step of [...PHASES, 'done'] as const) expect(PHASE_TITLES[step].length).toBeGreaterThan(0)
  })
})

describe('phaseSteps (R2) — an affordance derived from readiness, never enforcement', () => {
  it('requirements: current, design next (advance), the rest future', () => {
    expect(shape(phaseSteps(readiness('requirements'), FREE))).toEqual([
      'requirements:current', 'design:next:advance!', 'tdd:future', 'construction:future', 'validation:future', 'done:future',
    ])
  })

  it('design: requirements past (set), tdd next', () => {
    expect(shape(phaseSteps(readiness('design'), FREE))).toEqual([
      'requirements:past:set!', 'design:current', 'tdd:next:advance!', 'construction:future', 'validation:future', 'done:future',
    ])
  })

  it('tdd and construction: every earlier phase retreats, only the next advances', () => {
    expect(shape(phaseSteps(readiness('tdd'), FREE))).toEqual([
      'requirements:past:set!', 'design:past:set!', 'tdd:current', 'construction:next:advance!', 'validation:future', 'done:future',
    ])
    expect(shape(phaseSteps(readiness('construction'), FREE))).toEqual([
      'requirements:past:set!', 'design:past:set!', 'tdd:past:set!', 'construction:current', 'validation:next:advance!', 'done:future',
    ])
  })

  it('validation: the terminal done step is next with op done', () => {
    expect(shape(phaseSteps(readiness('validation'), FREE))).toEqual([
      'requirements:past:set!', 'design:past:set!', 'tdd:past:set!', 'construction:past:set!', 'validation:current', 'done:next:done!',
    ])
  })

  it('proposed in requirements behaves like in_progress', () => {
    expect(shape(phaseSteps(readiness('requirements', 'proposed'), FREE))).toEqual(shape(phaseSteps(readiness('requirements'), FREE)))
  })

  it('status done in validation: five past phases, done current, nothing clickable', () => {
    expect(shape(phaseSteps(readiness('validation', 'done'), FREE))).toEqual([
      'requirements:past', 'design:past', 'tdd:past', 'construction:past', 'validation:past', 'done:current',
    ])
  })

  it('r2 M7: status done with phase ≠ validation (closed by hand before v0.14) still reads as all past + done current', () => {
    expect(shape(phaseSteps(readiness('construction', 'done'), FREE))).toEqual([
      'requirements:past', 'design:past', 'tdd:past', 'construction:past', 'validation:past', 'done:current',
    ])
  })

  it('r2 M7: proposed outside requirements (updateItem status proposed) behaves like in_progress', () => {
    expect(shape(phaseSteps(readiness('design', 'proposed'), FREE))).toEqual(shape(phaseSteps(readiness('design'), FREE)))
  })

  it('mask: a dirty artifact draft or a pending action makes nothing clickable, ops untouched', () => {
    const dirty = phaseSteps(readiness('tdd'), { dirty: true, pending: false })
    expect(dirty.every(s => !s.clickable)).toBe(true)
    expect(dirty.map(s => s.op)).toEqual(['set', 'set', null, 'advance', null, null])
    const pending = phaseSteps(readiness('tdd'), { dirty: false, pending: true })
    expect(pending.every(s => !s.clickable)).toBe(true)
    expect(pending.map(s => s.state)).toEqual(phaseSteps(readiness('tdd'), FREE).map(s => s.state))
  })
})

describe('primaryAction (R2)', () => {
  it('advances with the next phase in the label', () => {
    expect(primaryAction(readiness('requirements'), FREE)).toEqual({ op: 'advance', label: 'Avançar → design', disabled: false, reason: null })
    expect(primaryAction(readiness('construction'), FREE)?.label).toBe('Avançar → validation')
  })

  it('concludes in validation and disappears once done', () => {
    expect(primaryAction(readiness('validation'), FREE)).toEqual({ op: 'done', label: 'Concluir (status done)', disabled: false, reason: null })
    expect(primaryAction(readiness('validation', 'done'), FREE)).toBeNull()
    expect(primaryAction(readiness('construction', 'done'), FREE)).toBeNull()
  })

  it('is disabled with a reason under the mask; pending wins over dirty', () => {
    expect(primaryAction(readiness('design'), { dirty: true, pending: false })).toEqual({
      op: 'advance', label: 'Avançar → tdd', disabled: true, reason: 'Salve os rascunhos antes — o gate lê o que está no servidor',
    })
    expect(primaryAction(readiness('design'), { dirty: false, pending: true })?.reason).toBe('Aguarde…')
    expect(primaryAction(readiness('design'), { dirty: true, pending: true })?.reason).toBe('Aguarde…')
  })
})

describe('checklist (R3) — the Model verdict printed, never reinterpreted', () => {
  it('ready: head names the next step, no lines', () => {
    expect(checklist(readiness('requirements'))).toEqual({ head: 'Pronto para design', lines: [], tone: 'ok' })
    expect(checklist(readiness('validation'))).toEqual({ head: 'Pronto para done', lines: [], tone: 'ok' })
  })

  it('done: next null reads Concluído', () => {
    expect(checklist(readiness('validation', 'done'))).toEqual({ head: 'Concluído', lines: [], tone: 'ok' })
  })

  it('blocked: the reasons in the Model order, verbatim', () => {
    const reasons = ['`requirements` frontmatter status is missing (needs approved)', '`requirementsReview` is empty']
    expect(checklist(readiness('requirements', 'in_progress', { ok: false, reasons }))).toEqual({
      head: 'Para design:', lines: reasons, tone: 'block',
    })
  })
})

describe('phaseLabel (R7)', () => {
  it('done wins over the phase; otherwise the raw phase id', () => {
    expect(phaseLabel('done', 'construction')).toBe('done')
    expect(phaseLabel('done', 'validation')).toBe('done')
    expect(phaseLabel('in_progress', 'tdd')).toBe('tdd')
    expect(phaseLabel('proposed', 'requirements')).toBe('requirements')
  })
})

const server = (over: Partial<FormServer> = {}): FormServer => ({
  kind: 'component', title: 'Form', description: 'desc', artifacts: { requirements: '---\nversion: 1\n---\nR1 — a' }, ...over,
})
const drafts = (over: Partial<FormDrafts> = {}, artifacts: Partial<FormDrafts['artifacts']> = {}): FormDrafts => ({
  title: 'Form', description: 'desc', estimate: '', targetDate: '',
  artifacts: { requirements: '---\nversion: 1\n---\nR1 — a', requirementsReview: '', design: '', validation: '', ...artifacts },
  ...over,
})

describe('isDirty (R4) — one definition: { any, artifacts }', () => {
  it('clean drafts are clean; a server without an artifact vs an empty draft is clean', () => {
    expect(isDirty(server(), drafts())).toEqual({ any: false, artifacts: false })
    expect(isDirty(server({ artifacts: {} }), drafts({}, { requirements: '' }))).toEqual({ any: false, artifacts: false })
  })

  it('an artifact draft that differs is dirty on both counts', () => {
    expect(isDirty(server(), drafts({}, { design: '---\ntraces: []\n---' }))).toEqual({ any: true, artifacts: true })
    expect(isDirty(server(), drafts({}, { requirements: '' }))).toEqual({ any: true, artifacts: true })
  })

  it('r2 M2: a dirty description or title counts for any, not for artifacts (the trail stays enabled)', () => {
    expect(isDirty(server(), drafts({ description: 'desc ' }))).toEqual({ any: true, artifacts: false })
    expect(isDirty(server(), drafts({ title: 'Other' }))).toEqual({ any: true, artifacts: false })
  })

  it('title compares trimmed; r2 L1: an empty title is not dirty (the save ignores it)', () => {
    expect(isDirty(server(), drafts({ title: 'Form ' }))).toEqual({ any: false, artifacts: false })
    expect(isDirty(server(), drafts({ title: '' }))).toEqual({ any: false, artifacts: false })
    expect(isDirty(server(), drafts({ title: '   ' }))).toEqual({ any: false, artifacts: false })
  })
})

describe('artifactPatch (R4) — the whole save patch, only what changed', () => {
  it('nothing changed → {}', () => {
    expect(artifactPatch(server(), drafts())).toEqual({})
    expect(artifactPatch(server(), drafts({ title: ' Form ' }))).toEqual({})
  })

  it('one artifact changed → only it; emptied with a server value → "" (deletes); emptied without → absent', () => {
    expect(artifactPatch(server(), drafts({}, { design: 'D' }))).toEqual({ design: 'D' })
    expect(artifactPatch(server(), drafts({}, { requirements: '' }))).toEqual({ requirements: '' })
    expect(artifactPatch(server(), drafts({}, { validation: '' }))).toEqual({})
  })

  it('title trimmed and an empty title ignored; description when different', () => {
    expect(artifactPatch(server(), drafts({ title: ' Novo ' }))).toEqual({ title: 'Novo' })
    expect(artifactPatch(server(), drafts({ title: '   ' }))).toEqual({})
    expect(artifactPatch(server(), drafts({ description: '' }))).toEqual({ description: '' })
    expect(artifactPatch(server({ description: undefined }), drafts({ description: '' }))).toEqual({})
  })

  it('estimate only for tasks (numeric, ≥ 0, different); targetDate only for releases (trimmed, different)', () => {
    const task = server({ kind: 'task', estimate: 2, artifacts: {} })
    const taskDrafts = (estimate: string) => drafts({ estimate }, { requirements: '' })
    expect(artifactPatch(task, taskDrafts('3'))).toEqual({ estimate: 3 })
    expect(artifactPatch(task, taskDrafts('2'))).toEqual({})
    expect(artifactPatch(task, taskDrafts('abc'))).toEqual({})
    expect(artifactPatch(task, taskDrafts('-1'))).toEqual({})
    expect(artifactPatch(server({ kind: 'component', artifacts: {} }), taskDrafts('3'))).toEqual({})
    const release = server({ kind: 'release', targetDate: '2026-09-02', artifacts: {} })
    expect(artifactPatch(release, drafts({ targetDate: ' 2026-10-01 ' }, { requirements: '' }))).toEqual({ targetDate: '2026-10-01' })
    expect(artifactPatch(release, drafts({ targetDate: '2026-09-02' }, { requirements: '' }))).toEqual({})
    expect(artifactPatch(server({ artifacts: {} }), drafts({ targetDate: '2027-01-01' }, { requirements: '' }))).toEqual({})
  })

  it('several fields change together → one patch', () => {
    expect(artifactPatch(server(), drafts({ title: 'X', description: 'y' }, { design: 'D', requirements: '' }))).toEqual({
      title: 'X', description: 'y', design: 'D', requirements: '',
    })
  })
})

describe('followServer (R4) — a clean draft follows the server, a dirty one keeps the draft', () => {
  it('clean follows; dirty keeps', () => {
    expect(followServer('A', 'A', 'B')).toBe('B')
    expect(followServer('mine', 'A', 'B')).toBe('mine')
  })

  it('server deleted with a clean draft → ""; undefined previous reads as ""', () => {
    expect(followServer('A', 'A', undefined)).toBe('')
    expect(followServer('', undefined, 'B')).toBe('B')
    expect(followServer('x', undefined, 'B')).toBe('x')
  })

  it('title compares trimmed under { trim: true }', () => {
    expect(followServer('A ', 'A', 'B', { trim: true })).toBe('B')
    expect(followServer('A ', 'A', 'B')).toBe('A ')
  })
})

describe('openByDefault (R4) — the artifacts the current gate reads', () => {
  it('per phase', () => {
    expect(openByDefault('requirements')).toEqual(['requirements', 'requirementsReview'])
    expect(openByDefault('design')).toEqual(['design'])
    expect(openByDefault('tdd')).toEqual([])
    expect(openByDefault('construction')).toEqual([])
    expect(openByDefault('validation')).toEqual(['validation'])
  })
})

describe('phaseLogLines (R6) — chronological, UTC, deterministic', () => {
  it('empty → []', () => {
    expect(phaseLogLines([])).toEqual([])
  })

  it('formats from → to · YYYY-MM-DD HH:MM in UTC, in the given order (retreats included)', () => {
    expect(phaseLogLines([
      { from: 'requirements', to: 'design', at: '2026-09-02T18:46:12.345Z' },
      { from: 'construction', to: 'design', at: '2026-09-02T19:39:00.000Z' },
      { from: 'design', to: 'tdd', at: '2026-09-02T23:59:59.999Z' },
    ])).toEqual([
      'requirements → design · 2026-09-02 18:46',
      'construction → design · 2026-09-02 19:39',
      'design → tdd · 2026-09-02 23:59',
    ])
  })

  it('r2 L4: an unparseable stamp is shown raw', () => {
    expect(phaseLogLines([{ from: 'tdd', to: 'construction', at: 'not-a-date' }])).toEqual(['tdd → construction · not-a-date'])
  })
})
