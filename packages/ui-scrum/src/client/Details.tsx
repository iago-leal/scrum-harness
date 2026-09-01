/**
 * The work item form, Azure DevOps-style: a modal dialog opened by clicking
 * any card (Board) or row title (Backlog) that shows the WHOLE item — title,
 * breadcrumb, state, description, estimate, target date, sprint — editable
 * and saved through `updateItem`. Drafts are local and re-seed only when the
 * selection changes, so the 4s state poll never clobbers in-progress typing.
 * @module @scrum-harness/ui/client/Details
 */

import { useEffect, useState } from 'react'
import type { ScrumState } from './api.ts'
import { COMPONENT_FLOW, FEATURE_FLOW } from './api.ts'
import { KIND_META, StateDot, TypeIcon } from './meta.tsx'

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
  targetDate?: string
  sprintId?: string
  /** Ancestor path, e.g. "v0.3 › Grade do backlog". */
  crumb?: string
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
          }
        }
        for (const task of component.tasks) {
          if (task.id === id) {
            return {
              id, kind: 'task', title: task.title, description: task.description,
              status: task.status, estimate: task.estimate, sprintId: task.sprintId,
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

        <div className="scrum-details-foot">
          <button className="scrum-btn" onClick={onClose}>Fechar</button>
          <button className="scrum-btn primary" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
