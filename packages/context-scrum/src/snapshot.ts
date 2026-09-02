/**
 * The board snapshot injected into the agent's context: a compact,
 * deterministic rendering of the workspace's ACTIVE sprint — columns with
 * task ids and points, the involved parents with their explicit states, and
 * the live-board discipline the agent must follow. The exact text doubles as
 * the change key: the listener re-injects only when this string changes.
 * @module @scrum-harness/context-scrum/snapshot
 */

import { BOARD_COLUMNS, kindPrefix } from '@scrum-harness/domain'
import type { ScrumBoard, Task } from '@scrum-harness/domain'

/** Column captions used in the snapshot (short, id-first). */
const COLUMN_CAPTIONS: Record<(typeof BOARD_COLUMNS)[number], string> = {
  todo: 'todo',
  in_progress: 'in_progress',
  review: 'review',
  done: 'done',
}

/** Truncate one title for token economy (whole snapshot stays compact). */
function shorten(title: string, max = 64): string {
  return title.length <= max ? title : `${title.slice(0, max - 1)}…`
}

/** Render one task entry: `task-7 [test] "Título" (3pt)` (the kind prefix is the View's, comp-45 R4). */
function taskEntry(task: Task): string {
  const points = task.estimate === undefined ? '' : ` (${task.estimate}pt)`
  return `${task.id} ${kindPrefix(task)}"${shorten(task.title)}"${points}`
}

/**
 * Render the active-sprint context of one board, or null when the board has
 * no active sprint (nothing is injected then).
 * @param board - the workspace's board.
 * @returns the deterministic snapshot text, or null.
 */
export function renderSprintContext(board: ScrumBoard): string | null {
  const sprint = board.activeSprint()
  if (sprint === undefined) return null
  const status = board.sprintStatus(sprint.id)

  const lines: string[] = []
  lines.push(`[SCRUM · sprint ativa ${sprint.id} #${sprint.number}] ${sprint.goal}`)
  lines.push(`Progresso: ${status.totals.done}/${status.totals.tasks} tarefas · ${status.totals.pointsDone}/${status.totals.points} pontos.`)

  for (const column of BOARD_COLUMNS) {
    const inColumn = status.tasks.filter(task => task.status === column)
    const list = inColumn.length === 0 ? '—' : inColumn.map(taskEntry).join('; ')
    lines.push(`${COLUMN_CAPTIONS[column]}: ${list}`)
  }

  // Parents of the sprint's tasks, with their EXPLICIT states (manual by
  // product decision — the agent is the one keeping them honest).
  const componentIds = new Set(status.tasks.map(task => task.componentId))
  const parents: string[] = []
  const seen = new Set<string>()
  for (const release of board.tree().releases) {
    for (const feature of release.features) {
      for (const component of feature.components) {
        if (!componentIds.has(component.id)) continue
        if (!seen.has(release.id)) {
          seen.add(release.id)
          parents.push(`${release.id} [${release.status}]`)
        }
        if (!seen.has(feature.id)) {
          seen.add(feature.id)
          parents.push(`${feature.id} [${feature.status}]`)
        }
        parents.push(`${component.id} [${component.status}]`)
      }
    }
  }
  if (parents.length > 0) lines.push(`Pais: ${parents.join(' · ')}`)

  lines.push(
    'Disciplina do board (ao vivo): ao COMEÇAR uma tarefa, mova-a para in_progress com scrum_task_move; '
    + 'ao TERMINAR, mova para done. Mantenha os estados dos PAIS em dia com scrum_item_update '
    + '(componente/função/release têm workflow próprio e manual). Registre cerimônias com scrum_ceremony_record.',
  )
  return lines.join('\n')
}
