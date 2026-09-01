/**
 * Backlog section: the Release > Feature > Component > Task tree with inline
 * creation/edit forms and per-node actions. Pure presentation over props.
 * @module @scrum-harness/ui/client/Tree
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import type { ScrumState, WireComponent, WireFeature, WireRelease, WireSprint, WireTask } from './api.ts'

/** Callbacks the tree drives (mutations funnel through the panel). */
export interface TreeCallbacks {
  /** Run one wire action (panel wraps busy/error and refreshes the store). */
  run: (action: Record<string, unknown>) => void
  /** Navigate to the Sprints section (release→sprint chips). */
  goToSprints: () => void
}

/** Status badge. */
function Badge(props: { value: string }) {
  return <span className={`scrum-badge st-${props.value}`}>{props.value}</span>
}

/** One inline form: named text inputs + confirm/cancel. */
function InlineForm(props: {
  fields: { key: string; placeholder: string; grow?: boolean }[]
  confirmLabel: string
  onConfirm: (values: Record<string, string>) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  return (
    <div className="scrum-form">
      {props.fields.map(field => (
        <input
          key={field.key}
          className={field.grow === true ? 'grow' : undefined}
          placeholder={field.placeholder}
          value={values[field.key] ?? ''}
          autoFocus={field === props.fields[0]}
          onChange={(e) => { setValues(v => ({ ...v, [field.key]: e.target.value })) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') props.onConfirm(values)
            if (e.key === 'Escape') props.onCancel()
          }}
        />
      ))}
      <button className="scrum-btn primary" onClick={() => { props.onConfirm(values) }}>{props.confirmLabel}</button>
      <button className="scrum-btn" onClick={props.onCancel}>Cancelar</button>
    </div>
  )
}

/** Shared row scaffolding: id chip, title, badges, hover actions, children. */
function Node(props: {
  level: 'release' | 'feature' | 'component' | 'task'
  id: string
  title: string
  badges?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="scrum-node">
      <div className={`scrum-row lvl-${props.level}`}>
        <span className="scrum-id">{props.id}</span>
        <span className="scrum-title">{props.title}</span>
        {props.badges}
        <span className="scrum-actions">{props.actions}</span>
      </div>
      {props.children !== undefined && <div className="scrum-children">{props.children}</div>}
    </div>
  )
}

/** Which inline form is open, keyed by parent node and kind. */
type OpenForm = { kind: string; parentId: string } | null

/** The Backlog tree section. */
export function Tree(props: { state: ScrumState; callbacks: TreeCallbacks }) {
  const [form, setForm] = useState<OpenForm>(null)
  const { run } = props.callbacks
  const releases = props.state.tree.releases
  /** The sprint that can currently receive tasks, when one exists. */
  const receivingSprint: WireSprint | undefined = props.state.sprints.find(s => s.status === 'active')
    ?? props.state.sprints.find(s => s.status === 'planned')

  const closeForm = () => { setForm(null) }
  const openForm = (kind: string, parentId: string) => { setForm({ kind, parentId }) }
  const isOpen = (kind: string, parentId: string) => form !== null && form.kind === kind && form.parentId === parentId

  const editForm = (id: string, currentTitle: string) => isOpen('edit', id) && (
    <InlineForm
      fields={[{ key: 'title', placeholder: currentTitle, grow: true }]}
      confirmLabel="Renomear"
      onConfirm={(v) => {
        if ((v.title ?? '').trim().length > 0) run({ action: 'updateItem', id, title: v.title })
        closeForm()
      }}
      onCancel={closeForm}
    />
  )

  const taskNode = (task: WireTask) => (
    <Node
      key={task.id}
      level="task"
      id={task.id}
      title={task.title}
      badges={(
        <>
          <Badge value={task.status} />
          {task.sprintId !== undefined && <span className="scrum-pts">{task.sprintId}</span>}
          {task.estimate !== undefined && <span className="scrum-pts">{task.estimate}pt</span>}
        </>
      )}
      actions={(
        <>
          {task.status === 'backlog' && receivingSprint !== undefined && (
            <button
              className="scrum-btn ghost"
              title={`Adicionar à sprint ${receivingSprint.id}`}
              onClick={() => { run({ action: 'assignTask', sprintId: receivingSprint.id, taskId: task.id, direction: 'add' }) }}
            >→ {receivingSprint.id}</button>
          )}
          {task.status !== 'backlog' && task.sprintId !== undefined && props.state.sprints.find(s => s.id === task.sprintId)?.status !== 'completed' && (
            <button
              className="scrum-btn ghost"
              title="Devolver ao backlog"
              onClick={() => { run({ action: 'assignTask', sprintId: task.sprintId, taskId: task.id, direction: 'remove' }) }}
            >↩ backlog</button>
          )}
          <button className="scrum-btn ghost" title="Renomear" onClick={() => { openForm('edit', task.id) }}>✎</button>
          <button className="scrum-btn ghost danger" title="Excluir" onClick={() => { run({ action: 'deleteItem', id: task.id }) }}>✕</button>
        </>
      )}
    >
      {editForm(task.id, task.title)}
    </Node>
  )

  const componentNode = (component: WireComponent) => (
    <Node
      key={component.id}
      level="component"
      id={component.id}
      title={component.title}
      actions={(
        <>
          <button className="scrum-btn ghost" onClick={() => { openForm('task', component.id) }}>+ tarefa</button>
          <button className="scrum-btn ghost" title="Renomear" onClick={() => { openForm('edit', component.id) }}>✎</button>
          <button className="scrum-btn ghost danger" title="Excluir (cascata)" onClick={() => { run({ action: 'deleteItem', id: component.id, cascade: true }) }}>✕</button>
        </>
      )}
    >
      {editForm(component.id, component.title)}
      {component.tasks.map(taskNode)}
      {isOpen('task', component.id) && (
        <InlineForm
          fields={[
            { key: 'title', placeholder: 'Título da tarefa', grow: true },
            { key: 'estimate', placeholder: 'pts' },
          ]}
          confirmLabel="Criar tarefa"
          onConfirm={(v) => {
            if ((v.title ?? '').trim().length === 0) return
            const estimate = Number(v.estimate)
            run({
              action: 'createTask',
              componentId: component.id,
              title: v.title,
              ...Number.isFinite(estimate) && estimate > 0 ? { estimate } : {},
            })
            closeForm()
          }}
          onCancel={closeForm}
        />
      )}
    </Node>
  )

  const featureNode = (feature: WireFeature) => (
    <Node
      key={feature.id}
      level="feature"
      id={feature.id}
      title={feature.title}
      badges={<Badge value={feature.status} />}
      actions={(
        <>
          <button className="scrum-btn ghost" onClick={() => { openForm('component', feature.id) }}>+ componente</button>
          <button className="scrum-btn ghost" title="Renomear" onClick={() => { openForm('edit', feature.id) }}>✎</button>
          <button className="scrum-btn ghost danger" title="Excluir (cascata)" onClick={() => { run({ action: 'deleteItem', id: feature.id, cascade: true }) }}>✕</button>
        </>
      )}
    >
      {editForm(feature.id, feature.title)}
      {feature.components.map(componentNode)}
      {isOpen('component', feature.id) && (
        <InlineForm
          fields={[{ key: 'title', placeholder: 'Título do componente (item de backlog)', grow: true }]}
          confirmLabel="Criar componente"
          onConfirm={(v) => {
            if ((v.title ?? '').trim().length > 0) run({ action: 'createComponent', featureId: feature.id, title: v.title })
            closeForm()
          }}
          onCancel={closeForm}
        />
      )}
    </Node>
  )

  const releaseNode = (release: WireRelease) => (
    <Node
      key={release.id}
      level="release"
      id={release.id}
      title={release.name}
      badges={(
        <>
          <Badge value={release.status} />
          {release.targetDate !== undefined && <span className="scrum-pts">🎯 {release.targetDate}</span>}
          {props.state.sprints
            .filter(sprint => sprint.releaseId === release.id)
            .map(sprint => (
              <button
                key={sprint.id}
                className={`scrum-chip st-${sprint.status}`}
                title={`Sprint #${sprint.number} "${sprint.goal}" (${sprint.status}) — abrir aba Sprints`}
                onClick={props.callbacks.goToSprints}
              >{sprint.id} · {sprint.status}</button>
            ))}
        </>
      )}
      actions={(
        <>
          <button className="scrum-btn ghost" onClick={() => { openForm('feature', release.id) }}>+ função</button>
          <button className="scrum-btn ghost" title="Renomear" onClick={() => { openForm('edit', release.id) }}>✎</button>
          <button className="scrum-btn ghost danger" title="Excluir (cascata)" onClick={() => { run({ action: 'deleteItem', id: release.id, cascade: true }) }}>✕</button>
        </>
      )}
    >
      {editForm(release.id, release.name)}
      {release.features.map(featureNode)}
      {isOpen('feature', release.id) && (
        <InlineForm
          fields={[{ key: 'title', placeholder: 'Título da função (feature)', grow: true }]}
          confirmLabel="Criar função"
          onConfirm={(v) => {
            if ((v.title ?? '').trim().length > 0) run({ action: 'createFeature', releaseId: release.id, title: v.title })
            closeForm()
          }}
          onCancel={closeForm}
        />
      )}
    </Node>
  )

  return (
    <div>
      <div className="scrum-section-head">
        <h2>Backlog do produto</h2>
        <span className="scrum-muted">Release → Função → Componente → Tarefa</span>
        <span style={{ flex: 1 }} />
        <button className="scrum-btn primary" onClick={() => { openForm('release', 'root') }}>+ Release</button>
      </div>
      {isOpen('release', 'root') && (
        <InlineForm
          fields={[
            { key: 'name', placeholder: 'Nome da release (ex.: v1.0)', grow: true },
            { key: 'targetDate', placeholder: 'Data alvo (AAAA-MM-DD)' },
          ]}
          confirmLabel="Criar release"
          onConfirm={(v) => {
            if ((v.name ?? '').trim().length === 0) return
            run({
              action: 'createRelease',
              name: v.name,
              ...(v.targetDate ?? '').trim().length > 0 ? { targetDate: v.targetDate } : {},
            })
            closeForm()
          }}
          onCancel={closeForm}
        />
      )}
      {releases.length === 0
        ? <div className="scrum-empty">Backlog vazio. Crie a primeira release para começar.</div>
        : releases.map(releaseNode)}
    </div>
  )
}
