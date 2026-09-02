/**
 * Pure logic of the work item form (comp-43, R9): the spiral trail and its
 * primary action, the readiness checklist, dirtiness, the save patch, the
 * follow-the-server rule for drafts, the artifacts open by default and the
 * phase-log lines. No React, no DOM — `Details.tsx` only calls these, and
 * `tests/form.spec.ts` proves them in Node.
 *
 * The trail is an AFFORDANCE derived from the Model's readiness, never
 * enforcement: "retreat freely / one step / never skip / refuse when done"
 * is `setPhase`'s rule; the view mirrors it so it does not offer what would
 * be refused, and the domain keeps refusing whatever the view did not foresee.
 * @module @scrum-harness/ui/client/form
 */

import type { WirePhase, WirePhaseReadiness } from './api.ts'

/** The spiral phases in order — duplicated from the domain on purpose (the browser bundle does not import it). */
export const PHASES: readonly WirePhase[] = ['requirements', 'design', 'tdd', 'construction', 'validation']

/** The four artifacts, in form order — same deliberate duplication (order is a test invariant). */
export const ARTIFACT_FIELDS = ['requirements', 'requirementsReview', 'design', 'validation'] as const

/** One artifact field name. */
export type ArtifactField = (typeof ARTIFACT_FIELDS)[number]

/** pt-BR labels of the artifact blocks. */
export const ARTIFACT_LABELS: Record<ArtifactField, string> = {
  requirements: 'Requisitos',
  requirementsReview: 'Revisão dos requisitos',
  design: 'Desenho',
  validation: 'Validação',
}

/** Placeholders teaching the minimal frontmatter of each artifact (the budget has no number: it is per board). */
export const ARTIFACT_PLACEHOLDERS: Record<ArtifactField, string> = {
  requirements: '---\nversion: 1\n---\n## Requirements\nR1 — …',
  requirementsReview: '---\nreviewer: …\nreviewed_version: 1\nreviewed_digest: …\nverdict: needs-revision\nround: 1\nfindings: { high: 0, medium: 0, low: 0 }\n---',
  design: '---\ntraces:\n  - { req: [R1], files: [...], tests: [...] }\n---',
  validation: '---\nvalidated_at: "…"\nsuite: { tests: 0, passed: 0, wall_seconds: 0, budget_seconds: <teto do quadro — scrum_suite_budget> }\ntypecheck: clean\n---',
}

/** One step of the trail: a phase, or the terminal `done` (the status, not a phase). */
export type StepId = WirePhase | 'done'

/** pt-BR explanation of each step (the `title` of the trail buttons). */
export const PHASE_TITLES: Record<StepId, string> = {
  requirements: 'Requisitos com revisão adversarial aprovada e carimbo humano (status: approved)',
  design: 'Desenho com divisão M/V/C e a matriz de rastreabilidade (traces:) completa',
  tdd: 'Tasks [test] antes das [code]: os testes nascem primeiro',
  construction: 'Construção até todas as tasks ficarem done',
  validation: 'Validação: suite cronometrada, typecheck limpo, as-built',
  done: 'Estado done — passa pelo gate de validação',
}

/** The mask the form applies over the trail: a dirty artifact draft or an action in flight. */
export interface Mask {
  dirty: boolean
  pending: boolean
}

/** One rendered step of the trail. */
export interface PhaseStep {
  id: StepId
  state: 'past' | 'current' | 'next' | 'future'
  /** What clicking it would do; null when the step offers nothing. */
  op: 'set' | 'advance' | 'done' | null
  /** Has an op and the mask allows it. */
  clickable: boolean
}

/** The primary button of the spiral section. */
export interface PrimaryAction {
  op: 'advance' | 'done'
  label: string
  disabled: boolean
  /** Why it is disabled, shown next to the button; null when enabled. */
  reason: string | null
}

/** The readiness checklist, the Model verdict printed. */
export interface Checklist {
  head: string
  lines: string[]
  tone: 'ok' | 'block'
}

/** Dirtiness on two counts: anything at all, and the artifacts (what the gates read). */
export interface Dirty {
  any: boolean
  artifacts: boolean
}

/** The server side of the form: the item as last seen on the wire. */
export interface FormServer {
  kind: 'release' | 'feature' | 'component' | 'task'
  title: string
  description?: string
  estimate?: number
  targetDate?: string
  artifacts: Partial<Record<ArtifactField, string>>
}

/** The local drafts of the form (every field a string, as typed). */
export interface FormDrafts {
  title: string
  description: string
  estimate: string
  targetDate: string
  artifacts: Record<ArtifactField, string>
}

const DIRTY_REASON = 'Salve os rascunhos antes — o gate lê o que está no servidor'
const PENDING_REASON = 'Aguarde…'

/**
 * The six steps of the trail from the Model's readiness (R2).
 * @param readiness - the wire readiness (`phase`, `status`, `next`).
 * @param mask - the form mask.
 * @returns the steps, in order: the five phases then `done`.
 */
export function phaseSteps(readiness: WirePhaseReadiness, mask: Mask): PhaseStep[] {
  const done = readiness.status === 'done'
  const current = PHASES.indexOf(readiness.phase)
  const allowed = !mask.dirty && !mask.pending
  const step = (id: StepId, state: PhaseStep['state']): PhaseStep => {
    const op: PhaseStep['op'] = done ? null : state === 'past' ? 'set' : state === 'next' ? (id === 'done' ? 'done' : 'advance') : null
    return { id, state, op, clickable: op !== null && allowed }
  }
  const phases = PHASES.map((id, index) => {
    if (done) return step(id, 'past')
    const state: PhaseStep['state'] = index < current ? 'past' : index === current ? 'current' : id === readiness.next ? 'next' : 'future'
    return step(id, state)
  })
  const terminal = step('done', done ? 'current' : readiness.next === 'done' ? 'next' : 'future')
  return [...phases, terminal]
}

/**
 * The primary action of the spiral section (R2).
 * @param readiness - the wire readiness.
 * @param mask - the form mask.
 * @returns advance / conclude with label and disabled reason, or null once done.
 */
export function primaryAction(readiness: WirePhaseReadiness, mask: Mask): PrimaryAction | null {
  if (readiness.next === null || readiness.status === 'done') return null
  const reason = mask.pending ? PENDING_REASON : mask.dirty ? DIRTY_REASON : null
  const base = { disabled: reason !== null, reason }
  if (readiness.next === 'done') return { op: 'done', label: 'Concluir (status done)', ...base }
  return { op: 'advance', label: `Avançar → ${readiness.next}`, ...base }
}

/**
 * The readiness checklist (R3): the Model verdict, never reinterpreted.
 * @param readiness - the wire readiness.
 * @returns head, lines (the reasons in Model order) and tone.
 */
export function checklist(readiness: WirePhaseReadiness): Checklist {
  if (readiness.ok) {
    return { head: readiness.next === null ? 'Concluído' : `Pronto para ${readiness.next}`, lines: [], tone: 'ok' }
  }
  return { head: `Para ${readiness.next ?? 'done'}:`, lines: [...readiness.reasons], tone: 'block' }
}

/**
 * The chip label of a component (R7): `done` wins over the phase.
 * @param status - component status.
 * @param phase - component phase.
 * @returns the step id to print.
 */
export function phaseLabel(status: WirePhaseReadiness['status'] | string, phase: WirePhase): StepId {
  return status === 'done' ? 'done' : phase
}

/** A title draft that would be ignored by the save (empty after trim). */
const blankTitle = (title: string): boolean => title.trim().length === 0

/**
 * Dirtiness of the drafts against the server (R4, r2 M2/L1): `artifacts` is
 * what masks the trail (the gates read artifacts); `any` guards closing.
 * @param server - the item as last seen.
 * @param drafts - the local drafts.
 * @returns the two counts.
 */
export function isDirty(server: FormServer, drafts: FormDrafts): Dirty {
  const artifacts = ARTIFACT_FIELDS.some(field => drafts.artifacts[field] !== (server.artifacts[field] ?? ''))
  const title = !blankTitle(drafts.title) && drafts.title.trim() !== server.title
  const description = drafts.description !== (server.description ?? '')
  return { any: artifacts || title || description, artifacts }
}

/**
 * The whole save patch (R4): only what changed, with the pre-v0.19 rules for
 * title / description / estimate / target date kept as they were.
 * @param server - the item as last seen.
 * @param drafts - the local drafts.
 * @returns the `updateItem` payload without `action`/`id`; `{}` when nothing changed.
 */
export function artifactPatch(server: FormServer, drafts: FormDrafts): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const title = drafts.title.trim()
  if (title.length > 0 && title !== server.title) patch.title = title
  if (drafts.description !== (server.description ?? '')) patch.description = drafts.description
  if (server.kind === 'task' && drafts.estimate !== (server.estimate?.toString() ?? '')) {
    const parsed = Number(drafts.estimate)
    if (drafts.estimate.trim().length > 0 && Number.isFinite(parsed) && parsed >= 0) patch.estimate = parsed
  }
  if (server.kind === 'release' && drafts.targetDate.trim() !== (server.targetDate ?? '')) {
    patch.targetDate = drafts.targetDate.trim()
  }
  for (const field of ARTIFACT_FIELDS) {
    const draft = drafts.artifacts[field]
    const current = server.artifacts[field]
    if (draft === (current ?? '')) continue
    if (draft === '' && current === undefined) continue
    patch[field] = draft
  }
  return patch
}

/**
 * The follow-the-server rule (R4): a clean draft (equal to the previous
 * server value) takes the new server value; a dirty one keeps the draft.
 * @param draft - the local draft.
 * @param prev - the previous server value.
 * @param next - the new server value.
 * @param options - `trim` compares the draft trimmed (the title).
 * @returns the draft to keep.
 */
export function followServer(draft: string, prev: string | undefined, next: string | undefined, options: { trim?: boolean } = {}): string {
  const mine = options.trim === true ? draft.trim() : draft
  return mine === (prev ?? '') ? (next ?? '') : draft
}

/**
 * The artifacts open by default (R4): the ones the current gate reads.
 * @param phase - component phase.
 * @returns the fields to open.
 */
export function openByDefault(phase: WirePhase): ArtifactField[] {
  switch (phase) {
    case 'requirements': return ['requirements', 'requirementsReview']
    case 'design': return ['design']
    case 'validation': return ['validation']
    default: return []
  }
}

/**
 * Phase-log lines (R6): `from → to · YYYY-MM-DD HH:MM` in UTC, in the given
 * order; an unparseable stamp is shown raw.
 * @param log - the wire phaseLog.
 * @returns one line per movement.
 */
export function phaseLogLines(log: readonly { from: WirePhase; to: WirePhase; at: string }[]): string[] {
  return log.map((entry) => {
    const time = Date.parse(entry.at)
    const stamp = Number.isNaN(time) ? entry.at : new Date(time).toISOString().slice(0, 16).replace('T', ' ')
    return `${entry.from} → ${entry.to} · ${stamp}`
  })
}
