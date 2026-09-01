/**
 * Board section: the active sprint's Kanban with HTML5 drag-and-drop between
 * columns (arrow buttons as the keyboard/precision fallback).
 * @module @scrum-harness/ui/client/Board
 */

import { useState } from 'react'
import { COLUMN_LABELS, COLUMNS } from './api.ts'
import type { ScrumState, WireTask } from './api.ts'

/** Callbacks the board drives. */
export interface BoardCallbacks {
  run: (action: Record<string, unknown>) => void
}

/** Locate a task's Component/Feature crumb for card context. */
function crumbOf(state: ScrumState, task: WireTask): string {
  for (const release of state.tree.releases) {
    for (const feature of release.features) {
      for (const component of feature.components) {
        if (component.id === task.componentId) return `${feature.title} › ${component.title}`
      }
    }
  }
  return task.componentId
}

/** The Kanban board of the active sprint. */
export function Board(props: { state: ScrumState; callbacks: BoardCallbacks }) {
  const [dragOver, setDragOver] = useState<string | null>(null)
  const { run } = props.callbacks
  const active = props.state.sprints.find(s => s.id === props.state.activeSprintId)
  if (active === undefined) {
    return (
      <div className="scrum-empty">
        Nenhuma sprint ativa. Planeje e inicie uma sprint na aba «Sprints» para abrir o board.
      </div>
    )
  }
  const tasks: WireTask[] = props.state.tree.releases
    .flatMap(r => r.features)
    .flatMap(f => f.components)
    .flatMap(c => c.tasks)
    .filter(t => t.sprintId === active.id)

  const move = (taskId: string, column: string) => { run({ action: 'moveTask', taskId, column }) }

  return (
    <div>
      <div className="scrum-section-head">
        <h2>Board — {active.id} #{active.number}</h2>
        <span className="scrum-muted">{active.goal}</span>
      </div>
      <div className="scrum-board">
        {COLUMNS.map((column) => {
          const inColumn = tasks.filter(t => t.status === column)
          return (
            <div
              key={column}
              className={`scrum-col${dragOver === column ? ' drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(column) }}
              onDragLeave={() => { setDragOver(current => current === column ? null : current) }}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(null)
                const taskId = e.dataTransfer.getData('text/plain')
                if (taskId.length > 0) move(taskId, column)
              }}
            >
              <div className="scrum-col-head">
                {COLUMN_LABELS[column]}
                <span className="scrum-count">{inColumn.length}</span>
              </div>
              {inColumn.map((task) => {
                const at = COLUMNS.indexOf(column)
                return (
                  <div
                    key={task.id}
                    className="scrum-card"
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', task.id) }}
                  >
                    <div className="scrum-card-crumb">{crumbOf(props.state, task)}</div>
                    <div className="scrum-card-title">{task.title}</div>
                    <div className="scrum-card-meta">
                      <span className="scrum-id">{task.id}</span>
                      {task.estimate !== undefined && <span className="scrum-pts">{task.estimate}pt</span>}
                      <span style={{ flex: 1 }} />
                      {at > 0 && (
                        <button className="scrum-btn ghost" title="Coluna anterior" onClick={() => { move(task.id, COLUMNS[at - 1]!) }}>‹</button>
                      )}
                      {at < COLUMNS.length - 1 && (
                        <button className="scrum-btn ghost" title="Próxima coluna" onClick={() => { move(task.id, COLUMNS[at + 1]!) }}>›</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
