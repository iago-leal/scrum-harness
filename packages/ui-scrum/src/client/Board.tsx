/**
 * Board section, Azure DevOps-style: one Kanban per backlog level. The
 * `Tarefas` level is the active sprint's board (HTML5 drag-and-drop between
 * columns, arrow buttons as the keyboard/precision fallback) with optional
 * swimlanes per component and soft WIP limits per column (`n/limite` turns
 * red past the limit; clicking the counter edits it); `Componentes` and
 * `Funções` are level boards whose columns are that level's workflow states
 * — dragging a card changes its status through `updateItem`. Card titles
 * open the global work item form modal.
 * @module @scrum-harness/ui/client/Board
 */

import { useState } from 'react'
import { COLUMN_LABELS, COLUMNS, COMPONENT_FLOW, FEATURE_FLOW } from './api.ts'
import type { ScrumState, WirePhase, WireTask, WireTaskKind } from './api.ts'
import type { BoardLevel } from './store.ts'
import { aggOf, KindChip, PhaseChip, Rollup, STATUS_META } from './meta.tsx'
import type { Agg } from './meta.tsx'

/** Callbacks the board drives. */
export interface BoardCallbacks {
  run: (action: Record<string, unknown>) => void
  /** Open one item in the work item form modal. */
  openItem: (id: string) => void
}

/** Store-backed viewing state of the board section. */
export interface BoardUi {
  level: BoardLevel
  setLevel: (level: BoardLevel) => void
  /** Swimlanes per component on the task board. */
  swimlanes: boolean
  setSwimlanes: (on: boolean) => void
}

/** WIP wiring of the task board columns (absent on parent-level boards). */
interface WipFace {
  limits: Partial<Record<string, number>>
  /** Persist one column's limit (0 removes it). */
  onSet: (column: string, value: number) => void
}

/** One card of any level board. */
interface BoardItem {
  id: string
  title: string
  status: string
  /** Ancestor path shown above the title. */
  crumb: string
  /** Optional estimate chip (tasks). */
  estimate?: number
  /** Task kind chip (tasks; `kind` here would collide with the level vocabulary — comp-45 L3). */
  taskKind?: WireTaskKind
  /** Optional descendant-task rollup (parent levels). */
  agg?: Agg
  /** Components only (comp-43 R7): the spiral phase and the Model's ready-for-done marker. */
  phase?: WirePhase
  readyForDone?: boolean
}

/** Level pivot labels. */
const LEVEL_LABELS: Record<BoardLevel, string> = {
  task: 'Tarefas',
  component: 'Componentes',
  feature: 'Funções',
}

/** Column label: sprint columns keep their labels, states use STATUS_META. */
function columnLabel(column: string): string {
  return (COLUMN_LABELS as Record<string, string>)[column]
    ?? STATUS_META[column]?.label
    ?? column
}

/** GitHub Projects-style colored dot marking a column's state. */
function ColumnDot(props: { column: string }) {
  const color = STATUS_META[props.column]?.color ?? 'var(--bgColor-neutral-emphasis, #8b93a7)'
  return <span className="scrum-state-dot" style={{ background: color }} />
}

/**
 * Column counter, optionally WIP-aware: shows `n` or `n/limite` (red once
 * over the limit) and, when editable, clicking it opens an inline input —
 * Enter saves (0 or empty removes the limit), Esc cancels.
 */
function WipCount(props: { count: number; limit?: number; onSet?: (value: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const over = props.limit !== undefined && props.count > props.limit
  if (editing && props.onSet !== undefined) {
    return (
      <input
        className="scrum-wip-input"
        autoFocus
        inputMode="numeric"
        placeholder="limite"
        value={value}
        onChange={(e) => { setValue(e.target.value) }}
        onBlur={() => { setEditing(false) }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditing(false)
          if (e.key === 'Enter') {
            const parsed = value.trim().length === 0 ? 0 : Number(value)
            if (Number.isInteger(parsed) && parsed >= 0) {
              props.onSet?.(parsed)
              setEditing(false)
            }
          }
        }}
      />
    )
  }
  const label = props.limit === undefined ? `${props.count}` : `${props.count}/${props.limit}`
  if (props.onSet === undefined) return <span className={`scrum-count${over ? ' over' : ''}`}>{label}</span>
  return (
    <button
      className={`scrum-count editable${over ? ' over' : ''}`}
      title={props.limit === undefined
        ? 'Definir limite de WIP desta coluna'
        : `WIP ${props.count}/${props.limit}${over ? ' — limite estourado!' : ''} (clique para editar; 0 remove)`}
      onClick={() => { setValue(props.limit?.toString() ?? ''); setEditing(true) }}
    >{label}</button>
  )
}

/**
 * One generic Kanban: columns + draggable cards. Pure over props; the level
 * decides what a "move" means. `heads: false` renders the drop columns only
 * (swimlanes draw one shared heads row above the lanes); `wip` makes the
 * column counters limit-aware.
 */
function Kanban(props: {
  columns: readonly string[]
  items: BoardItem[]
  onMove: (id: string, column: string) => void
  openItem: (id: string) => void
  /** Render the column heads row (default true). */
  heads?: boolean
  /** WIP limits face (task board only). */
  wip?: WipFace
  /** Column counts shown in the heads (defaults to this Kanban's items). */
  headCounts?: Record<string, number>
}) {
  const [dragOver, setDragOver] = useState<string | null>(null)
  const { columns, items } = props
  return (
    <div className="scrum-board" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
      {columns.map((column) => {
        const inColumn = items.filter(item => item.status === column)
        const at = columns.indexOf(column)
        return (
          <div
            key={column}
            className={`scrum-col${props.heads === false ? ' slim' : ''}${dragOver === column ? ' drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(column) }}
            onDragLeave={() => { setDragOver(current => current === column ? null : current) }}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(null)
              const id = e.dataTransfer.getData('text/plain')
              if (id.length > 0) props.onMove(id, column)
            }}
          >
            {props.heads !== false && (
              <div className="scrum-col-head">
                <ColumnDot column={column} />
                {columnLabel(column)}
                <WipCount
                  count={props.headCounts?.[column] ?? inColumn.length}
                  limit={props.wip?.limits[column]}
                  onSet={props.wip === undefined ? undefined : (v) => { props.wip?.onSet(column, v) }}
                />
              </div>
            )}
            {inColumn.map(item => (
              <div
                key={item.id}
                className="scrum-card"
                draggable
                onDragStart={(e) => { e.dataTransfer.setData('text/plain', item.id) }}
              >
                <div className="scrum-card-crumb">{item.crumb}</div>
                <button
                  className="scrum-card-title"
                  title="Abrir o item completo"
                  onClick={() => { props.openItem(item.id) }}
                >{item.title}</button>
                <div className="scrum-card-meta">
                  <span className="scrum-id">{item.id}</span>
                  <KindChip kind={item.taskKind} />
                  {item.phase !== undefined && <PhaseChip status={item.status} phase={item.phase} readyForDone={item.readyForDone} />}
                  {item.estimate !== undefined && <span className="scrum-pts">{item.estimate}pt</span>}
                  {item.agg !== undefined && <Rollup agg={item.agg} />}
                  <span style={{ flex: 1 }} />
                  {at > 0 && (
                    <button className="scrum-btn ghost" title="Coluna anterior" onClick={() => { props.onMove(item.id, columns[at - 1]!) }}>‹</button>
                  )}
                  {at < columns.length - 1 && (
                    <button className="scrum-btn ghost" title="Próxima coluna" onClick={() => { props.onMove(item.id, columns[at + 1]!) }}>›</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Shared heads row of the swimlaned task board: column labels + WIP-aware
 * totals across every lane.
 */
function BoardHeads(props: { columns: readonly string[]; items: BoardItem[]; wip?: WipFace }) {
  return (
    <div className="scrum-board" style={{ gridTemplateColumns: `repeat(${props.columns.length}, 1fr)` }}>
      {props.columns.map((column) => {
        const count = props.items.filter(item => item.status === column).length
        return (
          <div key={column} className="scrum-col heads-only">
            <div className="scrum-col-head">
              <ColumnDot column={column} />
              {columnLabel(column)}
              <WipCount
                count={count}
                limit={props.wip?.limits[column]}
                onSet={props.wip === undefined ? undefined : (v) => { props.wip?.onSet(column, v) }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** The Board section (level pivot + the level's Kanban). */
export function Board(props: { state: ScrumState; callbacks: BoardCallbacks; ui: BoardUi }) {
  const { run, openItem } = props.callbacks
  const { ui } = props
  const { level, setLevel } = ui
  const releases = props.state.tree.releases
  const active = props.state.sprints.find(s => s.id === props.state.activeSprintId)

  const pivot = (
    <div className="scrum-pivot">
      {(Object.keys(LEVEL_LABELS) as BoardLevel[]).map(option => (
        <button
          key={option}
          className={`scrum-pivot-btn${level === option ? ' is-active' : ''}`}
          onClick={() => { setLevel(option) }}
        >{LEVEL_LABELS[option]}</button>
      ))}
    </div>
  )

  if (level === 'component') {
    const items: BoardItem[] = releases.flatMap(release => release.features.flatMap(feature =>
      feature.components.map(component => ({
        id: component.id,
        title: component.title,
        status: component.status,
        crumb: `${release.name} › ${feature.title}`,
        agg: aggOf(component.tasks),
        phase: component.phase,
        readyForDone: component.readyForDone,
      })),
    ))
    return (
      <div>
        <div className="scrum-section-head">
          <h2>Board — Componentes</h2>
          <span className="scrum-muted">arraste para mudar o estado do componente</span>
          <span style={{ flex: 1 }} />
          {pivot}
        </div>
        {items.length === 0
          ? <div className="scrum-empty">Nenhum componente no backlog ainda.</div>
          : (
            <Kanban
              columns={COMPONENT_FLOW}
              items={items}
              onMove={(id, column) => { run({ action: 'updateItem', id, status: column }) }}
              openItem={openItem}
            />
          )}
      </div>
    )
  }

  if (level === 'feature') {
    const items: BoardItem[] = releases.flatMap(release => release.features.map(feature => ({
      id: feature.id,
      title: feature.title,
      status: feature.status,
      crumb: release.name,
      agg: aggOf(feature.components.flatMap(c => c.tasks)),
    })))
    return (
      <div>
        <div className="scrum-section-head">
          <h2>Board — Funções</h2>
          <span className="scrum-muted">arraste para mudar o estado da função</span>
          <span style={{ flex: 1 }} />
          {pivot}
        </div>
        {items.length === 0
          ? <div className="scrum-empty">Nenhuma função no backlog ainda.</div>
          : (
            <Kanban
              columns={FEATURE_FLOW}
              items={items}
              onMove={(id, column) => { run({ action: 'updateItem', id, status: column }) }}
              openItem={openItem}
            />
          )}
      </div>
    )
  }

  // Tasks level: the active sprint's board.
  if (active === undefined) {
    return (
      <div>
        <div className="scrum-section-head">
          <h2>Board — Tarefas</h2>
          <span style={{ flex: 1 }} />
          {pivot}
        </div>
        <div className="scrum-empty">
          Nenhuma sprint ativa. Planeje e inicie uma sprint na aba «Sprints» para abrir o board de tarefas.
        </div>
      </div>
    )
  }
  const crumbs = new Map<string, string>()
  for (const release of releases) {
    for (const feature of release.features) {
      for (const component of feature.components) {
        crumbs.set(component.id, `${feature.title} › ${component.title}`)
      }
    }
  }
  const tasks: WireTask[] = releases
    .flatMap(r => r.features)
    .flatMap(f => f.components)
    .flatMap(c => c.tasks)
    .filter(t => t.sprintId === active.id)
  const items: BoardItem[] = tasks.map(task => ({
    id: task.id,
    title: task.title,
    status: task.status,
    crumb: crumbs.get(task.componentId) ?? task.componentId,
    estimate: task.estimate,
    taskKind: task.kind,
  }))
  /** Linked releases of the active sprint (id + name when still live). */
  const linkedReleases = active.releaseIds.map((id) => {
    const release = releases.find(r => r.id === id)
    return { id, name: release?.name }
  })

  /** Soft WIP limits of the active sprint, edited straight on the counters. */
  const wip: WipFace = {
    limits: active.wipLimits ?? {},
    onSet: (column, value) => {
      const merged: Record<string, number> = { ...active.wipLimits, [column]: value }
      run({ action: 'updateItem', id: active.id, wipLimits: merged })
    },
  }
  const moveTask = (taskId: string, column: string) => { run({ action: 'moveTask', taskId, column }) }

  /** Swimlanes: one lane per component, in first-appearance (tree) order. */
  const lanes: { key: string; label: string; tasks: WireTask[]; items: BoardItem[] }[] = []
  if (ui.swimlanes) {
    const byComponent = new Map<string, { label: string; tasks: WireTask[]; items: BoardItem[] }>()
    for (const task of tasks) {
      let lane = byComponent.get(task.componentId)
      if (lane === undefined) {
        lane = { label: crumbs.get(task.componentId) ?? task.componentId, tasks: [], items: [] }
        byComponent.set(task.componentId, lane)
      }
      lane.tasks.push(task)
      lane.items.push(items.find(item => item.id === task.id) ?? {
        id: task.id, title: task.title, status: task.status, crumb: '',
      })
    }
    for (const [key, lane] of byComponent) lanes.push({ key, ...lane })
  }

  return (
    <div>
      <div className="scrum-section-head">
        <h2>Board — {active.id} #{active.number}</h2>
        <span className="scrum-muted">{active.goal}</span>
        {linkedReleases.map(release => (
          <span key={release.id} className="scrum-pts" title="Release vinculada">
            🎯 {release.id}{release.name !== undefined ? ` ${release.name}` : ''}
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <button
          className={`scrum-btn ghost${ui.swimlanes ? ' is-on' : ''}`}
          title={ui.swimlanes ? 'Desligar raias por componente' : 'Agrupar em raias por componente'}
          onClick={() => { ui.setSwimlanes(!ui.swimlanes) }}
        >☰ Raias</button>
        {pivot}
      </div>
      {ui.swimlanes && lanes.length > 0
        ? (
          <>
            <BoardHeads columns={COLUMNS} items={items} wip={wip} />
            {lanes.map(lane => (
              <div key={lane.key} className="scrum-lane">
                <div className="scrum-lane-head">
                  <span className="scrum-lane-title">{lane.label}</span>
                  <span className="scrum-id">{lane.key}</span>
                  <Rollup agg={aggOf(lane.tasks)} />
                </div>
                <Kanban
                  columns={COLUMNS}
                  items={lane.items}
                  heads={false}
                  onMove={moveTask}
                  openItem={openItem}
                />
              </div>
            ))}
          </>
        )
        : (
          <Kanban
            columns={COLUMNS}
            items={items}
            wip={wip}
            onMove={moveTask}
            openItem={openItem}
          />
        )}
    </div>
  )
}
