/**
 * The work item form, Azure DevOps-style: a modal dialog opened by clicking
 * any card (Board) or row title (Backlog) that shows the WHOLE item — title,
 * breadcrumb, state, description, estimate, target date, sprint — editable
 * and saved through `updateItem`. Drafts are local and re-seed only when the
 * selection changes, so the 4s state poll never clobbers in-progress typing.
 * @module @scrum-harness/ui/client/Details
 */

import { useEffect, useState } from 'react'
import type { ScrumState, WireTaskKind, WireTraceMatrix } from './api.ts'
import { COMPONENT_FLOW, FEATURE_FLOW } from './api.ts'
import { KIND_META, StateDot, TypeIcon } from './meta.tsx'

/** The three task kinds, in the order the form offers them. */
const TASK_KINDS: readonly WireTaskKind[] = ['test', 'code', 'other']

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
          return {
            id, kind: 'component', title: component.title, description: component.description,
            status: component.status, statusOptions: [...COMPONENT_FLOW],
            crumb: `${release.name} › ${feature.title}`,
            traces: component.traces,
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

/** The modal work item form. */
export function WorkItemForm(props: {
  node: DetailsNode
  run: (action: Record<string, unknown>) => void
  onClose: () => void
}) {
  const { node, onClose } = props
  const [title, setTitle] = useState(node.title)
  const [description, setDescription] = useState(node.description ?? '')
  const [estimate, setEstimate] = useState(node.estimate?.toString() ?? '')
  const [targetDate, setTargetDate] = useState(node.targetDate ?? '')

  // Re-seed drafts only when the selection changes (not on every poll).
  useEffect(() => {
    setTitle(node.title)
    setDescription(node.description ?? '')
    setEstimate(node.estimate?.toString() ?? '')
    setTargetDate(node.targetDate ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id])

  // Azure-style dialog: Escape closes from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onClose])

  const save = () => {
    const patch: Record<string, unknown> = {}
    if (title.trim().length > 0 && title.trim() !== node.title) patch.title = title.trim()
    if (description !== (node.description ?? '')) patch.description = description
    if (node.kind === 'task' && estimate !== (node.estimate?.toString() ?? '')) {
      const parsed = Number(estimate)
      if (estimate.trim().length > 0 && Number.isFinite(parsed) && parsed >= 0) patch.estimate = parsed
    }
    if (node.kind === 'release' && targetDate.trim() !== (node.targetDate ?? '')) {
      patch.targetDate = targetDate.trim()
    }
    if (Object.keys(patch).length === 0) return
    props.run({ action: 'updateItem', id: node.id, ...patch })
  }

  return (
    <div className="scrum-wi-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="scrum-wi" role="dialog" aria-modal="true">
        <div className="scrum-details-head">
          <TypeIcon kind={node.kind} />
          <span className="scrum-details-kind">{KIND_META[node.kind].label}</span>
          <span className="scrum-id">{node.id}</span>
          {node.status !== undefined && <StateDot status={node.status} />}
          <span style={{ flex: 1 }} />
          <button className="scrum-close dark" title="Fechar (Esc)" onClick={onClose}>✕</button>
        </div>
        {node.crumb !== undefined && <div className="scrum-details-crumb">{node.crumb}</div>}

        <label className="scrum-field">
          <span>Título</span>
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
          />
        </label>

        <label className="scrum-field">
          <span>Descrição</span>
          <textarea
            rows={9}
            placeholder="Sem descrição."
            value={description}
            onChange={(e) => { setDescription(e.target.value) }}
          />
        </label>

        <div className="scrum-wi-grid">
          {node.statusOptions !== undefined && node.status !== undefined && (
            <label className="scrum-field">
              <span>Estado</span>
              <select
                value={node.status}
                onChange={(e) => { props.run({ action: 'updateItem', id: node.id, status: e.target.value }) }}
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
                title="test = escreve/prova testes; code = faz os testes passarem; other = validação, spike, docs"
                onChange={(e) => { props.run({ action: 'updateItem', id: node.id, kind: e.target.value }) }}
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
                value={estimate}
                onChange={(e) => { setEstimate(e.target.value) }}
                onKeyDown={(e) => { if (e.key === 'Enter') save() }}
              />
            </label>
          )}

          {node.kind === 'release' && (
            <label className="scrum-field">
              <span>Data alvo</span>
              <input
                placeholder="AAAA-MM-DD"
                value={targetDate}
                onChange={(e) => { setTargetDate(e.target.value) }}
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

        {node.kind === 'component' && node.traces !== undefined && <TraceSection traces={node.traces} />}

        <div className="scrum-details-foot">
          <button className="scrum-btn" onClick={onClose}>Fechar</button>
          <button className="scrum-btn primary" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
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
