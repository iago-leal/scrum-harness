/**
 * The work item form, Azure DevOps-style: a modal dialog opened by clicking
 * any card (Board) or row title (Backlog) that shows the WHOLE item — title,
 * breadcrumb, state, description, estimate, target date, sprint — editable
 * and saved through `updateItem`. Since v0.19 (comp-43) a component's form
 * also carries the spiral: the trail of phases with advance / retreat, the
 * readiness checklist (the Model's verdict, printed), the four artifacts as
 * editable text with their frontmatter, the phase log, and the outcome of
 * every action rendered inline (the gate refusal never hides behind the
 * overlay). Drafts are local: they re-seed when the selection changes, a
 * clean field follows the server (the agent edited through a tool while the
 * form is open) and a dirty one keeps the draft. Every rule lives in
 * `form.ts`; this module only calls it.
 * @module @scrum-harness/ui/client/Details
 */

import { Fragment, useEffect, useRef, useState } from 'react'
import type { ScrumState, WirePhase, WirePhaseReadiness, WireTaskKind, WireTraceMatrix } from './api.ts'
import { COMPONENT_FLOW, FEATURE_FLOW } from './api.ts'
import {
  ARTIFACT_FIELDS, ARTIFACT_LABELS, ARTIFACT_PLACEHOLDERS, PHASE_TITLES,
  artifactPatch, checklist, followServer, isDirty, openByDefault, phaseLogLines, phaseSteps, primaryAction,
} from './form.ts'
import type { ArtifactField, FormDrafts, FormServer, PhaseStep } from './form.ts'
import { KIND_META, StateDot, TypeIcon } from './meta.tsx'
import type { RunOutcome } from './settle.ts'

/** The three task kinds, in the order the form offers them. */
const TASK_KINDS: readonly WireTaskKind[] = ['test', 'code', 'other']

/** One phase-log entry on the wire. */
type PhaseLogEntry = { from: WirePhase; to: WirePhase; at: string }

/** The selected item, normalized across the four kinds. */
export interface DetailsNode {
  id: string
  kind: keyof typeof KIND_META
  title: string
  description?: string
  /** Current status, for kinds that have one. */
  status?: string
  /** Editable status choices; absent when status is not editable here. */
  statusOptions?: string[]
  estimate?: number
  /** Tasks only: the task kind (named apart from `kind`, the level — comp-45 L3). */
  taskKind?: WireTaskKind
  targetDate?: string
  sprintId?: string
  /** Ancestor path, e.g. "v0.3 › Grade do backlog". */
  crumb?: string
  /** Components only (comp-49 R7): the Model's traceability matrix, rendered read-only. */
  traces?: WireTraceMatrix
  /** Components only (comp-43 R1): the spiral as the wire carries it. */
  phase?: WirePhase
  phaseLog?: PhaseLogEntry[]
  readiness?: WirePhaseReadiness
  readyForDone?: boolean
  /** Components only (comp-43 R1): the four artifacts, absent when empty. */
  artifacts?: Partial<Record<ArtifactField, string>>
}

/**
 * Locate one item in the wire tree by id.
 * @param state - the wire state.
 * @param id - item id (rel-/feat-/comp-/task-).
 * @returns the normalized node, or null when it is not in the live tree.
 */
export function resolveNode(state: ScrumState, id: string): DetailsNode | null {
  for (const release of state.tree.releases) {
    if (release.id === id) {
      return {
        id, kind: 'release', title: release.name, description: release.description,
        status: release.status, statusOptions: ['planned', 'active', 'released'],
        targetDate: release.targetDate,
      }
    }
    for (const feature of release.features) {
      if (feature.id === id) {
        return {
          id, kind: 'feature', title: feature.title, description: feature.description,
          status: feature.status, statusOptions: [...FEATURE_FLOW],
          crumb: release.name,
        }
      }
      for (const component of feature.components) {
        if (component.id === id) {
          const artifacts: Partial<Record<ArtifactField, string>> = {}
          for (const field of ARTIFACT_FIELDS) {
            const value = component[field]
            if (value !== undefined) artifacts[field] = value
          }
          return {
            id, kind: 'component', title: component.title, description: component.description,
            status: component.status, statusOptions: [...COMPONENT_FLOW],
            crumb: `${release.name} › ${feature.title}`,
            traces: component.traces,
            phase: component.phase, phaseLog: component.phaseLog, readiness: component.readiness,
            readyForDone: component.readyForDone, artifacts,
          }
        }
        for (const task of component.tasks) {
          if (task.id === id) {
            return {
              id, kind: 'task', title: task.title, description: task.description,
              status: task.status, estimate: task.estimate, taskKind: task.kind, sprintId: task.sprintId,
              crumb: `${feature.title} › ${component.title}`,
            }
          }
        }
      }
    }
  }
  return null
}

/** The node as the form's server side (what the drafts compare against). */
function serverOf(node: DetailsNode): FormServer {
  return {
    kind: node.kind, title: node.title, description: node.description,
    estimate: node.estimate, targetDate: node.targetDate, artifacts: node.artifacts ?? {},
  }
}

/** Fresh drafts from the server. */
function seedDrafts(server: FormServer): FormDrafts {
  const artifacts = {} as Record<ArtifactField, string>
  for (const field of ARTIFACT_FIELDS) artifacts[field] = server.artifacts[field] ?? ''
  return {
    title: server.title, description: server.description ?? '',
    estimate: server.estimate?.toString() ?? '', targetDate: server.targetDate ?? '', artifacts,
  }
}

/** Every draft following the server where it is clean; the same object when nothing moves. */
function followAll(drafts: FormDrafts, prev: FormServer, next: FormServer): FormDrafts {
  const artifacts = {} as Record<ArtifactField, string>
  let moved = false
  for (const field of ARTIFACT_FIELDS) {
    artifacts[field] = followServer(drafts.artifacts[field], prev.artifacts[field], next.artifacts[field])
    if (artifacts[field] !== drafts.artifacts[field]) moved = true
  }
  const followed: FormDrafts = {
    title: followServer(drafts.title, prev.title, next.title, { trim: true }),
    description: followServer(drafts.description, prev.description, next.description),
    estimate: followServer(drafts.estimate, prev.estimate?.toString(), next.estimate?.toString()),
    targetDate: followServer(drafts.targetDate, prev.targetDate, next.targetDate),
    artifacts,
  }
  if (!moved && followed.title === drafts.title && followed.description === drafts.description
    && followed.estimate === drafts.estimate && followed.targetDate === drafts.targetDate) return drafts
  return followed
}

/** The open map seeded by the phase (the artifacts the current gate reads). */
function openMap(phase: WirePhase | undefined): Record<ArtifactField, boolean> {
  const open = phase === undefined ? [] : openByDefault(phase)
  const map = {} as Record<ArtifactField, boolean>
  for (const field of ARTIFACT_FIELDS) map[field] = open.includes(field)
  return map
}

/** The inline outcome of the last form action. */
interface Notice {
  tone: 'ok' | 'error'
  text: string
}

/** The modal work item form. */
export function WorkItemForm(props: {
  node: DetailsNode
  run: (action: Record<string, unknown>) => Promise<RunOutcome>
  onClose: () => void
}) {
  const { node, onClose } = props
  const server = serverOf(node)
  const [drafts, setDrafts] = useState<FormDrafts>(() => seedDrafts(server))
  const [open, setOpen] = useState<Record<ArtifactField, boolean>>(() => openMap(node.phase))
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const idRef = useRef(node.id)
  const phaseRef = useRef(node.phase)
  const serverRef = useRef(server)
  const mountedRef = useRef(true)
  const closeRef = useRef<() => void>(() => { onClose() })

  // Selection changed → re-seed everything; same item → clean fields follow
  // the server (R4), and the open blocks re-seed when the phase moved (r2 L4).
  useEffect(() => {
    const next = serverOf(node)
    if (idRef.current !== node.id) {
      idRef.current = node.id
      phaseRef.current = node.phase
      serverRef.current = next
      setDrafts(seedDrafts(next))
      setOpen(openMap(node.phase))
      setNotice(null)
      setPending(false)
      return
    }
    const prev = serverRef.current
    serverRef.current = next
    setDrafts(current => followAll(current, prev, next))
    if (phaseRef.current !== node.phase) {
      phaseRef.current = node.phase
      setOpen(openMap(node.phase))
    }
  }, [node])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Azure-style dialog: Escape closes from anywhere — through the discard guard, never mid-composition (r1 L7).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.isComposing) closeRef.current() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [])

  const dirty = isDirty(server, drafts)

  /** The only way out: Esc, backdrop and Fechar all come here (R4). */
  const requestClose = () => {
    if (dirty.any && !window.confirm('Há alterações não salvas. Descartar?')) return
    onClose()
  }
  closeRef.current = requestClose

  /** Every mutation fired from inside the form (R5): pending while in flight, outcome inline. */
  const runInForm = async (action: Record<string, unknown>, okText: string): Promise<void> => {
    setPending(true)
    setNotice(null)
    const outcome = await props.run(action)
    if (!mountedRef.current) return
    setPending(false)
    setNotice(outcome.ok ? { tone: 'ok', text: okText } : { tone: 'error', text: outcome.message })
  }

  const save = () => {
    if (pending) return
    const patch = artifactPatch(server, drafts)
    if (Object.keys(patch).length === 0) {
      setNotice({ tone: 'ok', text: 'Nada a salvar.' })
      return
    }
    void runInForm({ action: 'updateItem', id: node.id, ...patch }, 'Salvo.')
  }

  const setArtifact = (field: ArtifactField, value: string) => {
    setDrafts(current => ({ ...current, artifacts: { ...current.artifacts, [field]: value } }))
  }

  const noticeEl = notice === null ? null : <div className={`scrum-notice is-${notice.tone}`}>{notice.text}</div>
  const isComponent = node.kind === 'component' && node.readiness !== undefined
  const dirtyTitle = dirty.artifacts ? 'Salve os rascunhos antes — o gate lê o que está no servidor' : undefined

  return (
    <div className="scrum-wi-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose() }}>
      <div className={`scrum-wi${node.kind === 'component' ? ' is-component' : ''}`} role="dialog" aria-modal="true">
        <div className="scrum-details-head">
          <TypeIcon kind={node.kind} />
          <span className="scrum-details-kind">{KIND_META[node.kind].label}</span>
          <span className="scrum-id">{node.id}</span>
          {node.status !== undefined && <StateDot status={node.status} />}
          {node.readyForDone === true && <span className="scrum-phase scrum-phase-ready" title="O gate de done está satisfeito">ready for done</span>}
          <span style={{ flex: 1 }} />
          <button className="scrum-close dark" title="Fechar (Esc)" onClick={requestClose}>✕</button>
        </div>
        {node.crumb !== undefined && <div className="scrum-details-crumb">{node.crumb}</div>}

        <label className="scrum-field">
          <span>Título</span>
          <input
            value={drafts.title}
            onChange={(e) => { const title = e.target.value; setDrafts(current => ({ ...current, title })) }}
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
          />
        </label>

        <label className="scrum-field">
          <span>Descrição</span>
          <textarea
            rows={isComponent ? 5 : 9}
            placeholder="Sem descrição."
            value={drafts.description}
            onChange={(e) => { const description = e.target.value; setDrafts(current => ({ ...current, description })) }}
          />
        </label>

        <div className="scrum-wi-grid">
          {node.statusOptions !== undefined && node.status !== undefined && (
            <label className="scrum-field">
              <span>Estado</span>
              <select
                value={node.status}
                disabled={pending || (isComponent && dirty.artifacts)}
                title={isComponent ? dirtyTitle : undefined}
                onChange={(e) => {
                  const status = e.target.value
                  void runInForm({ action: 'updateItem', id: node.id, status }, status === 'done' ? 'Concluído.' : `Estado: ${status}.`)
                }}
              >
                {node.statusOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          )}

          {node.kind === 'task' && node.taskKind !== undefined && (
            <label className="scrum-field">
              <span>Tipo</span>
              <select
                value={node.taskKind}
                disabled={pending}
                title="test = escreve/prova testes; code = faz os testes passarem; other = validação, spike, docs"
                onChange={(e) => { const kind = e.target.value; void runInForm({ action: 'updateItem', id: node.id, kind }, `Tipo: ${kind}.`) }}
              >
                {TASK_KINDS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          )}

          {node.kind === 'task' && (
            <label className="scrum-field">
              <span>Estimativa (pontos)</span>
              <input
                inputMode="numeric"
                placeholder="—"
                value={drafts.estimate}
                onChange={(e) => { const estimate = e.target.value; setDrafts(current => ({ ...current, estimate })) }}
                onKeyDown={(e) => { if (e.key === 'Enter') save() }}
              />
            </label>
          )}

          {node.kind === 'release' && (
            <label className="scrum-field">
              <span>Data alvo</span>
              <input
                placeholder="AAAA-MM-DD"
                value={drafts.targetDate}
                onChange={(e) => { const targetDate = e.target.value; setDrafts(current => ({ ...current, targetDate })) }}
                onKeyDown={(e) => { if (e.key === 'Enter') save() }}
              />
            </label>
          )}
        </div>

        {node.kind === 'task' && node.status !== undefined && (
          <div className="scrum-details-meta">
            <StateDot status={node.status} />
            <span className="scrum-muted">O estado da tarefa é a coluna do board da sprint.</span>
            {node.sprintId !== undefined && <span className="scrum-pts">{node.sprintId}</span>}
          </div>
        )}

        {isComponent && node.readiness !== undefined && (
          <SpiralSection
            id={node.id}
            status={node.status ?? ''}
            readiness={node.readiness}
            mask={{ dirty: dirty.artifacts, pending }}
            notice={noticeEl}
            run={runInForm}
          />
        )}

        {isComponent && (
          <ArtifactsSection drafts={drafts} server={server} open={open} onOpen={(field, value) => { setOpen(current => ({ ...current, [field]: value })) }} onChange={setArtifact} />
        )}

        {isComponent && <PhaseLogSection log={node.phaseLog ?? []} />}

        {node.kind === 'component' && node.traces !== undefined && <TraceSection traces={node.traces} />}

        {!isComponent && noticeEl !== null && <div className="scrum-wi-notice">{noticeEl}</div>}

        <div className="scrum-details-foot">
          <button className="scrum-btn" onClick={requestClose}>Fechar</button>
          <button className="scrum-btn primary" disabled={pending} onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  )
}

/**
 * The spiral section of a component (comp-43 R2/R3/R5): the six-step trail,
 * the primary action with its reason, the readiness checklist and the inline
 * outcome. Every decision comes from `form.ts`; the click only dispatches.
 */
function SpiralSection(props: {
  id: string
  status: string
  readiness: WirePhaseReadiness
  mask: { dirty: boolean; pending: boolean }
  notice: JSX.Element | null
  run: (action: Record<string, unknown>, okText: string) => Promise<void>
}) {
  const { id, readiness, mask } = props
  const steps = phaseSteps(readiness, mask)
  const primary = primaryAction(readiness, mask)
  const list = checklist(readiness)

  const onStep = (step: PhaseStep) => {
    if (!step.clickable) return
    if (step.op === 'set') void props.run({ action: 'componentPhase', id, op: 'set', phase: step.id }, `Recuou para ${step.id}.`)
    else if (step.op === 'advance') void props.run({ action: 'componentPhase', id, op: 'advance' }, `Avançou para ${step.id}.`)
    else if (step.op === 'done') void props.run({ action: 'updateItem', id, status: 'done' }, 'Concluído.')
  }
  const onPrimary = () => {
    if (primary === null || primary.disabled) return
    if (primary.op === 'advance') void props.run({ action: 'componentPhase', id, op: 'advance' }, `Avançou para ${readiness.next}.`)
    else void props.run({ action: 'updateItem', id, status: 'done' }, 'Concluído.')
  }

  return (
    <div className="scrum-spiral-section">
      <div className="scrum-wi-section-head">Espiral</div>
      <div className="scrum-spiral">
        {steps.map((step, index) => (
          <Fragment key={step.id}>
            {index > 0 && <span className="scrum-spiral-arrow">→</span>}
            <button
              type="button"
              className="scrum-spiral-step"
              data-state={step.state}
              disabled={!step.clickable}
              title={PHASE_TITLES[step.id]}
              onClick={() => { onStep(step) }}
            >{step.id}</button>
          </Fragment>
        ))}
      </div>
      <div className="scrum-spiral-actions">
        {primary !== null
          ? (
            <>
              <button className="scrum-btn primary" disabled={primary.disabled} title={primary.reason ?? primary.label} onClick={onPrimary}>{primary.label}</button>
              {primary.reason !== null && <span className="scrum-spiral-reason">{primary.reason}</span>}
            </>
          )
          : props.status === 'done' && <span className="scrum-spiral-reason">volte o estado para reabrir a espiral</span>}
      </div>
      <div className={`scrum-checklist is-${list.tone}`}>
        <div className="scrum-checklist-head">{list.head}</div>
        {list.lines.length > 0 && <ul>{list.lines.map(line => <li key={line}>{line}</li>)}</ul>}
      </div>
      {props.notice}
    </div>
  )
}

/** The four artifacts as collapsible editable text (comp-43 R4). */
function ArtifactsSection(props: {
  drafts: FormDrafts
  server: FormServer
  open: Record<ArtifactField, boolean>
  onOpen: (field: ArtifactField, open: boolean) => void
  onChange: (field: ArtifactField, value: string) => void
}) {
  return (
    <div className="scrum-artifacts">
      <div className="scrum-wi-section-head">Artefatos</div>
      {ARTIFACT_FIELDS.map((field) => {
        const draft = props.drafts.artifacts[field]
        const dirty = draft !== (props.server.artifacts[field] ?? '')
        const size = draft === '' ? 'vazio' : `${draft.split('\n').length} linhas`
        return (
          <details
            key={field}
            className="scrum-artifact"
            open={props.open[field]}
            onToggle={(e) => { props.onOpen(field, e.currentTarget.open) }}
          >
            <summary>
              <span>{ARTIFACT_LABELS[field]}</span>
              <span className="scrum-artifact-size">· {size}</span>
              {dirty && <span className="scrum-artifact-dirty" title="Rascunho não salvo">•</span>}
            </summary>
            <textarea
              rows={14}
              spellCheck={false}
              placeholder={ARTIFACT_PLACEHOLDERS[field]}
              value={draft}
              onChange={(e) => { props.onChange(field, e.target.value) }}
            />
          </details>
        )
      })}
    </div>
  )
}

/** The phase log, collapsed by default (comp-43 R6). */
function PhaseLogSection(props: { log: PhaseLogEntry[] }) {
  const lines = phaseLogLines(props.log)
  return (
    <details className="scrum-artifact scrum-history">
      <summary><span>Histórico de fases</span><span className="scrum-artifact-size">· {props.log.length} movimento(s)</span></summary>
      {lines.length === 0
        ? <div className="scrum-muted scrum-history-empty">Nenhum movimento ainda.</div>
        : <ul className="scrum-history-list">{lines.map((line, index) => <li key={index}>{line}</li>)}</ul>}
    </details>
  )
}

/** A source label for the matrix (comp-49 R7). */
function traceSourceLabel(source: WireTraceMatrix['source']): string {
  if (source === 'design') return 'matriz do design'
  if (source === 'validation') return 'matriz da validação (as-built)'
  return 'sem matriz (source: none)'
}

/** Paths one per line, or a muted placeholder. */
function PathList(props: { paths: string[]; empty: string }) {
  if (props.paths.length === 0) return <span className="scrum-muted">{props.empty}</span>
  return (
    <div className="scrum-trace-paths">
      {props.paths.map(path => <code key={path}>{path}</code>)}
    </div>
  )
}

/**
 * The traceability section of a component's work item form (comp-49 R7):
 * read-only — the source line, one row per entry (Req | Arquivos | Testes),
 * the holes as warning chips only when there are some, and the issues.
 */
export function TraceSection(props: { traces: WireTraceMatrix }) {
  const { traces } = props
  const holes: { label: string; ids: string[] }[] = [
    { label: 'Sem rastro', ids: traces.untraced },
    { label: 'Sem prova', ids: traces.unproven },
    { label: 'Desconhecidos', ids: traces.unknown },
  ].filter(hole => hole.ids.length > 0)
  return (
    <div className="scrum-trace-section">
      <div className="scrum-trace-head">
        <span>Rastreabilidade</span>
        <span className="scrum-trace-source">{traceSourceLabel(traces.source)}</span>
      </div>
      {traces.entries.length > 0 && (
        <table className="scrum-trace">
          <thead>
            <tr><th>Req</th><th>Arquivos</th><th>Testes</th></tr>
          </thead>
          <tbody>
            {traces.entries.map((entry, index) => (
              <tr key={index}>
                <td>
                  <div className="scrum-trace-reqs">
                    {entry.req.map(id => <span key={id} className="scrum-chip">{id}</span>)}
                  </div>
                </td>
                <td><PathList paths={entry.files} empty="— (sem código)" /></td>
                <td><PathList paths={entry.tests} empty="— (sem prova)" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {holes.length > 0 && (
        <div className="scrum-trace-holes">
          {holes.map(hole => (
            <span key={hole.label} className="scrum-chip scrum-trace-hole">{hole.label}: {hole.ids.join(', ')}</span>
          ))}
        </div>
      )}
      {traces.issues.length > 0 && (
        <ul className="scrum-trace-issues scrum-muted">
          {traces.issues.map(issue => <li key={issue}>{issue}</li>)}
        </ul>
      )}
    </div>
  )
}
