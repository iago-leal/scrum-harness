/**
 * Backlog section, Azure DevOps-style: one hierarchical grid with aligned
 * columns (Item | Estado | Pontos | Sprint), colored type icons, chevron
 * expand/collapse (everything expanded by default), a "⋯" context menu per
 * row and ghost quick-add rows per level. Clicking a title opens the global
 * work item form modal (rendered by the panel). Pure presentation over
 * props; mutations funnel through the panel's `run`.
 * @module @scrum-harness/ui/client/Tree
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import type { ScrumState, WireComponent, WireFeature, WireRelease, WireSprint, WireTask } from './api.ts'
import { aggOf, KindChip, Rollup, StateDot, TypeIcon } from './meta.tsx'
import type { KIND_META } from './meta.tsx'

/** Callbacks the tree drives (mutations funnel through the panel). */
export interface TreeCallbacks {
  /** Run one wire action (panel wraps busy/error and refreshes the store). */
  run: (action: Record<string, unknown>) => void
  /** Navigate to the Sprints section (sprint chips). */
  goToSprints: () => void
}

/** Store-backed viewing state of the backlog grid. */
export interface TreeUi {
  /** Nodes explicitly collapsed (absent = expanded). */
  collapsed: Record<string, boolean>
  /** Item open in the details panel; null when closed. */
  selected: string | null
  /** Toggle one node's expansion. */
  toggle: (id: string) => void
  /** Replace the whole collapsed map (expand/collapse all). */
  setCollapsed: (collapsed: Record<string, boolean>) => void
  /** Open (id) or close (null) the details panel. */
  select: (id: string | null) => void
}

/** One "⋯" menu entry. */
interface MenuItem {
  label: string
  danger?: boolean
  onClick: () => void
}

/** Hover context menu of one row (closes on backdrop click or Escape). */
function RowMenu(props: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  return (
    <span className={`scrum-menu-wrap${open ? ' is-open' : ''}`}>
      <button className="scrum-btn ghost" title="Mais ações" onClick={() => { setOpen(o => !o) }}>⋯</button>
      {open && (
        <>
          <div className="scrum-menu-backdrop" onClick={() => { setOpen(false) }} />
          <div className="scrum-menu" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}>
            {props.items.map(item => (
              <button
                key={item.label}
                className={`scrum-menu-item${item.danger === true ? ' danger' : ''}`}
                onClick={() => { setOpen(false); item.onClick() }}
              >{item.label}</button>
            ))}
          </div>
        </>
      )}
    </span>
  )
}

/**
 * Ghost quick-add row (Azure's "+ New Work Item"): a button that turns into
 * an inline input; Enter creates and keeps the focus for the next entry.
 */
function QuickAdd(props: {
  depth: number
  label: string
  /** Optional second input (estimate, target date). */
  extraPlaceholder?: string
  onCreate: (title: string, extra: string) => void
}) {
  const [active, setActive] = useState(false)
  const [title, setTitle] = useState('')
  const [extra, setExtra] = useState('')
  const submit = () => {
    if (title.trim().length === 0) return
    props.onCreate(title.trim(), extra.trim())
    setTitle('')
    setExtra('')
  }
  const cancel = () => { setActive(false); setTitle(''); setExtra('') }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') cancel()
  }
  return (
    <div className="scrum-bl-row scrum-bl-add">
      <div className="scrum-bl-item" style={{ paddingLeft: 8 + props.depth * 18 }}>
        <span className="scrum-chev" />
        {active
          ? (
            <>
              <input className="scrum-bl-add-input" autoFocus placeholder={props.label} value={title} onChange={(e) => { setTitle(e.target.value) }} onKeyDown={keys} />
              {props.extraPlaceholder !== undefined && (
                <input className="scrum-bl-add-extra" placeholder={props.extraPlaceholder} value={extra} onChange={(e) => { setExtra(e.target.value) }} onKeyDown={keys} />
              )}
              <button className="scrum-btn primary" onClick={submit}>Criar</button>
              <button className="scrum-btn" title="Fechar (Esc)" onClick={cancel}>✕</button>
            </>
          )
          : <button className="scrum-bl-add-btn" onClick={() => { setActive(true) }}>＋ {props.label}</button>}
      </div>
      <div className="scrum-bl-cell" />
      <div className="scrum-bl-cell" />
      <div className="scrum-bl-cell" />
    </div>
  )
}

/** One grid row: indent + chevron + type icon + title, then the fixed cells. */
function Row(props: {
  kind: keyof typeof KIND_META
  depth: number
  id: string
  title: string
  /** Chevron for parent rows; null renders the alignment spacer. */
  chevron: { open: boolean; onToggle: () => void } | null
  selected: boolean
  onOpen: () => void
  menu: MenuItem[]
  state?: ReactNode
  points?: ReactNode
  sprint?: ReactNode
  /** Chip rendered before the title (the task kind, comp-45). */
  chip?: ReactNode
}) {
  return (
    <div className={`scrum-bl-row lvl-${props.kind}${props.selected ? ' is-selected' : ''}`}>
      <div className="scrum-bl-item" style={{ paddingLeft: 8 + props.depth * 18 }}>
        {props.chevron !== null
          ? (
            <button
              className="scrum-chev"
              title={props.chevron.open ? 'Recolher' : 'Expandir'}
              onClick={props.chevron.onToggle}
            >{props.chevron.open ? '▾' : '▸'}</button>
          )
          : <span className="scrum-chev" />}
        <TypeIcon kind={props.kind} />
        {props.chip}
        <button className="scrum-bl-title" title="Abrir detalhes" onClick={props.onOpen}>{props.title}</button>
        <span className="scrum-id">{props.id}</span>
        <span className="scrum-bl-hover"><RowMenu items={props.menu} /></span>
      </div>
      <div className="scrum-bl-cell">{props.state ?? <span className="scrum-dash">—</span>}</div>
      <div className="scrum-bl-cell">{props.points ?? <span className="scrum-dash">—</span>}</div>
      <div className="scrum-bl-cell">{props.sprint ?? <span className="scrum-dash">—</span>}</div>
    </div>
  )
}

/** The Backlog grid section. */
export function Tree(props: { state: ScrumState; callbacks: TreeCallbacks; ui: TreeUi }) {
  const { run, goToSprints } = props.callbacks
  const { ui } = props
  const releases = props.state.tree.releases
  /** The sprint that can currently receive tasks, when one exists. */
  const receivingSprint: WireSprint | undefined = props.state.sprints.find(s => s.status === 'active')
    ?? props.state.sprints.find(s => s.status === 'planned')

  const isOpen = (id: string) => ui.collapsed[id] !== true
  const chevron = (id: string) => ({ open: isOpen(id), onToggle: () => { ui.toggle(id) } })

  const expandAll = () => { ui.setCollapsed({}) }
  const collapseAll = () => {
    const map: Record<string, boolean> = {}
    for (const release of releases) {
      map[release.id] = true
      for (const feature of release.features) {
        map[feature.id] = true
        for (const component of feature.components) map[component.id] = true
      }
    }
    ui.setCollapsed(map)
  }

  /** Shared tail of every row menu: details, archive, trash. */
  const menuFor = (id: string, cascade: boolean): MenuItem[] => [
    { label: 'Abrir detalhes', onClick: () => { ui.select(id) } },
    { label: '🗄 Arquivar', onClick: () => { run({ action: 'archiveItem', id }) } },
    {
      label: '✕ Mover para a lixeira',
      danger: true,
      onClick: () => { run({ action: 'deleteItem', id, ...cascade ? { cascade } : {} }) },
    },
  ]

  /** Sprint cell of one task: current chip (+ return) or the add shortcut. */
  const taskSprintCell = (task: WireTask): ReactNode => {
    if (task.sprintId !== undefined) {
      const sprint = props.state.sprints.find(s => s.id === task.sprintId)
      return (
        <>
          <button
            className={`scrum-chip st-${sprint?.status ?? 'completed'}`}
            title={sprint !== undefined ? `Sprint #${sprint.number} (${sprint.status}) — abrir aba Sprints` : task.sprintId}
            onClick={goToSprints}
          >{task.sprintId}</button>
          {sprint !== undefined && sprint.status !== 'completed' && (
            <button
              className="scrum-btn ghost"
              title="Devolver ao backlog"
              onClick={() => { run({ action: 'assignTask', sprintId: task.sprintId, taskId: task.id, direction: 'remove' }) }}
            >↩</button>
          )}
        </>
      )
    }
    if (receivingSprint !== undefined) {
      return (
        <button
          className="scrum-btn ghost"
          title={`Adicionar à sprint ${receivingSprint.id}`}
          onClick={() => { run({ action: 'assignTask', sprintId: receivingSprint.id, taskId: task.id, direction: 'add' }) }}
        >→ {receivingSprint.id}</button>
      )
    }
    return undefined
  }

  /** Sprint cell of one release: linked sprint chips + target date. */
  const releaseSprintCell = (release: WireRelease): ReactNode => {
    const linked = props.state.sprints.filter(s => s.releaseIds.includes(release.id))
    if (linked.length === 0 && release.targetDate === undefined) return undefined
    return (
      <>
        {linked.map(sprint => (
          <button
            key={sprint.id}
            className={`scrum-chip st-${sprint.status}`}
            title={`Sprint #${sprint.number} "${sprint.goal}" (${sprint.status}) — abrir aba Sprints`}
            onClick={goToSprints}
          >{sprint.id}</button>
        ))}
        {release.targetDate !== undefined && (
          <span className="scrum-pts" title="Data alvo">🎯 {release.targetDate.slice(0, 10)}</span>
        )}
      </>
    )
  }

  const rows: ReactNode[] = []

  const pushTask = (task: WireTask) => {
    rows.push(
      <Row
        key={task.id}
        kind="task"
        depth={3}
        id={task.id}
        title={task.title}
        chevron={null}
        selected={ui.selected === task.id}
        onOpen={() => { ui.select(task.id) }}
        menu={menuFor(task.id, false)}
        chip={<KindChip kind={task.kind} />}
        state={<StateDot status={task.status} />}
        points={task.estimate !== undefined ? <span className="scrum-pts">{task.estimate} pt</span> : undefined}
        sprint={taskSprintCell(task)}
      />,
    )
  }

  const pushComponent = (component: WireComponent) => {
    rows.push(
      <Row
        key={component.id}
        kind="component"
        depth={2}
        id={component.id}
        title={component.title}
        chevron={chevron(component.id)}
        selected={ui.selected === component.id}
        onOpen={() => { ui.select(component.id) }}
        menu={menuFor(component.id, true)}
        state={<StateDot status={component.status} />}
        points={<Rollup agg={aggOf(component.tasks)} />}
      />,
    )
    if (!isOpen(component.id)) return
    component.tasks.forEach(pushTask)
    rows.push(
      <QuickAdd
        key={`add-${component.id}`}
        depth={3}
        label="Nova tarefa"
        extraPlaceholder="pts"
        onCreate={(title, extra) => {
          const estimate = Number(extra)
          run({
            action: 'createTask',
            componentId: component.id,
            title,
            ...Number.isFinite(estimate) && estimate > 0 ? { estimate } : {},
          })
        }}
      />,
    )
  }

  const pushFeature = (feature: WireFeature) => {
    rows.push(
      <Row
        key={feature.id}
        kind="feature"
        depth={1}
        id={feature.id}
        title={feature.title}
        chevron={chevron(feature.id)}
        selected={ui.selected === feature.id}
        onOpen={() => { ui.select(feature.id) }}
        menu={menuFor(feature.id, true)}
        state={<StateDot status={feature.status} />}
        points={<Rollup agg={aggOf(feature.components.flatMap(c => c.tasks))} />}
      />,
    )
    if (!isOpen(feature.id)) return
    feature.components.forEach(pushComponent)
    rows.push(
      <QuickAdd
        key={`add-${feature.id}`}
        depth={2}
        label="Novo componente"
        onCreate={(title) => { run({ action: 'createComponent', featureId: feature.id, title }) }}
      />,
    )
  }

  for (const release of releases) {
    rows.push(
      <Row
        key={release.id}
        kind="release"
        depth={0}
        id={release.id}
        title={release.name}
        chevron={chevron(release.id)}
        selected={ui.selected === release.id}
        onOpen={() => { ui.select(release.id) }}
        menu={menuFor(release.id, true)}
        state={<StateDot status={release.status} />}
        points={<Rollup agg={aggOf(release.features.flatMap(f => f.components.flatMap(c => c.tasks)))} />}
        sprint={releaseSprintCell(release)}
      />,
    )
    if (!isOpen(release.id)) continue
    release.features.forEach(pushFeature)
    rows.push(
      <QuickAdd
        key={`add-${release.id}`}
        depth={1}
        label="Nova função"
        onCreate={(title) => { run({ action: 'createFeature', releaseId: release.id, title }) }}
      />,
    )
  }
  rows.push(
    <QuickAdd
      key="add-release"
      depth={0}
      label="Nova release"
      extraPlaceholder="Data alvo (AAAA-MM-DD)"
      onCreate={(name, extra) => {
        run({ action: 'createRelease', name, ...extra.length > 0 ? { targetDate: extra } : {} })
      }}
    />,
  )

  return (
    <div>
      <div className="scrum-section-head">
        <h2>Backlog do produto</h2>
        <span className="scrum-muted">Release → Função → Componente → Tarefa</span>
        <span style={{ flex: 1 }} />
        <button className="scrum-btn ghost" title="Expandir tudo" onClick={expandAll}>⊞ Expandir</button>
        <button className="scrum-btn ghost" title="Recolher tudo" onClick={collapseAll}>⊟ Recolher</button>
      </div>
      <div className="scrum-bl">
        <div className="scrum-bl-row scrum-bl-head">
          <div className="scrum-bl-item">Item</div>
          <div className="scrum-bl-cell">Estado</div>
          <div className="scrum-bl-cell">Pontos</div>
          <div className="scrum-bl-cell">Sprint</div>
        </div>
        {rows}
      </div>
      {releases.length === 0 && (
        <div className="scrum-empty">Backlog vazio. Crie a primeira release para começar.</div>
      )}
    </div>
  )
}
