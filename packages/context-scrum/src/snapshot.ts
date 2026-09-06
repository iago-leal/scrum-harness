/**
 * The board snapshot injected into the agent's context: a compact,
 * deterministic rendering of the workspace's board. Two modes of one pure
 * function (v0.17, comp-46): with an ACTIVE sprint — columns with task ids
 * and points, the parents with their explicit states plus the phase and the
 * checklist of the spiral, and the components in progress that have no task
 * in the sprint yet; without one — a short idle snapshot (last or planned
 * sprint, what is in progress and what blocks it, the proposed backlog, the
 * next step), only on boards that use SCRUM. The exact text doubles as the
 * change key: the listener re-injects only when this string changes.
 * @module @scrum-harness/context-scrum/snapshot
 */

import { BOARD_COLUMNS, kindPrefix, TitleContract } from '@scrum-harness/domain'
import type { PhaseReadiness, ScrumBoard, ScrumTree, SprintView, TaskView, TitleLimits } from '@scrum-harness/domain'

/** Column captions used in the snapshot (short, id-first). */
const COLUMN_CAPTIONS: Record<(typeof BOARD_COLUMNS)[number], string> = {
  todo: 'todo',
  in_progress: 'in_progress',
  review: 'review',
  done: 'done',
}

/** One component as the tree hands it (with its Model-computed readiness). */
type TreeComponent = ScrumTree['releases'][number]['features'][number]['components'][number]

/**
 * Caps of the two modes (R2/R3/R5): reasons and list lengths. Titles and
 * goals are NOT cut here by numbers of their own: they are cut at the
 * Model's limits (comp-54 R2, `board.titleLimits()`), so a valid title is
 * never truncated and only legacy overflow gets the ellipsis.
 */
const ACTIVE_REASONS = 160
const IDLE_REASONS = 100
const MAX_IN_PROGRESS = 5
const MAX_BACKLOG = 6
/** Ids listed per part of the hygiene line before ` +N` (comp-54 R3). */
const HYGIENE_IDS = 3

/** The discipline the agent must follow with a live board, plus the spiral (R2). */
const DISCIPLINE =
  'Disciplina do board (ao vivo): ao COMEÇAR uma tarefa, mova-a para in_progress com scrum_task_move; '
  + 'ao TERMINAR, mova para done. Mantenha os estados dos PAIS em dia com scrum_item_update '
  + '(componente/função/release têm workflow próprio e manual). Registre cerimônias com scrum_ceremony_record. '
  + 'Espiral: quando o checklist de um componente zerar, avance com scrum_component_phase (action check lê sem mover); '
  + 'em tdd, crie as tasks [test] antes das [code]; de validation para done use scrum_item_update status done com o artefato validation.'

/** Cut one text to `max` chars, ellipsis included (token economy). */
function cut(text: string, max: number): string {
  // Code points, not UTF-16 units (comp-53 D4): the same measure the title contract uses.
  const points = [...text]
  return points.length <= max ? text : `${points.slice(0, max - 1).join('')}…`
}

/** Render one task entry: `task-7 [test] "Título" (3pt)` (the kind prefix is the View's, comp-45 R4). */
function taskEntry(task: TaskView, limit: number): string {
  const points = task.estimate === undefined ? '' : ` (${task.estimate}pt)`
  return `${task.id} ${kindPrefix(task)}"${cut(task.title, limit)}"${points}`
}

/**
 * The hygiene line (comp-54 R3): what the agent should fix about the sprint's
 * OPEN tasks and the sprint itself — (a) tasks without a description, (b)
 * titles in the warn band, (c) legacy titles/goal over the limit. Done tasks
 * are history and never count (D1). Each part lists up to three ids then
 * ` +N`. Null when there is nothing to say.
 * @param tasks - the sprint's tasks as `sprintStatus` hands them (marked).
 * @param sprint - the sprint (marked).
 * @param limits - the Model's ceilings.
 */
export function hygiene(tasks: readonly TaskView[], sprint: SprintView, limits: TitleLimits): string | null {
  const open = tasks.filter(t => t.status !== 'done')
  const part = (n: number, label: string, ids: string[]): string =>
    `${n} ${label} (${ids.slice(0, HYGIENE_IDS).join(', ')}${n > HYGIENE_IDS ? ` +${n - HYGIENE_IDS}` : ''})`
  const parts: string[] = []
  const blank = open.filter(t => (t.description ?? '').trim().length === 0)
  if (blank.length > 0) parts.push(part(blank.length, 'task(s) da sprint sem descrição', blank.map(t => t.id)))
  const near = open.filter(t => TitleContract.tone('title', t.title) === 'warn')
  if (near.length > 0) parts.push(part(near.length, 'título(s) perto do limite', near.map(t => `${t.id} ${TitleContract.length(t.title)}/${limits.title}`)))
  const legacy = open.filter(t => t.titleOverflow !== undefined).map(t => `${t.id} ${t.titleOverflow!.length}/${t.titleOverflow!.limit}`)
  if (sprint.goalOverflow !== undefined) legacy.push(`${sprint.id} meta ${sprint.goalOverflow.length}/${sprint.goalOverflow.limit}`)
  if (legacy.length > 0) parts.push(part(legacy.length, 'legado(s) acima do limite', legacy))
  if (parts.length === 0) return null
  return `Higiene: ${parts.join(' · ')} — o título é o QUÊ; o COMO vai na descrição.`
}

/** ` · tdd → construction: <reasons | ok>` — empty once the component is done (`next: null`). */
function checklist(readiness: PhaseReadiness, max: number): string {
  if (readiness.next === null) return ''
  const verdict = readiness.ok ? 'ok' : cut(readiness.reasons.join('; '), max)
  return ` · ${readiness.phase} → ${readiness.next}: ${verdict}`
}

/** `comp-45 [in_progress · tdd → construction: …]`, or `comp-42 [done]`. */
function componentEntry(component: TreeComponent, max: number): string {
  return `${component.id} [${component.status}${component.status === 'done' ? '' : checklist(component.readiness, max)}]`
}

/** At most `max` entries, the rest as ` +N`. */
function capped(entries: string[], max: number): string {
  const shown = entries.slice(0, max).join(' · ')
  const rest = entries.length - max
  return rest > 0 ? `${shown} +${rest}` : shown
}

/** Every live component in tree order (releases → features → components). */
function liveComponents(tree: ScrumTree): TreeComponent[] {
  return tree.releases.flatMap(release => release.features.flatMap(feature => feature.components))
}

/**
 * Render the snapshot of one board: the active-sprint mode, the idle mode
 * on a board with at least one live component, or null (nothing injected)
 * on boards that do not use SCRUM.
 * @param board - the workspace's board.
 * @returns the deterministic snapshot text, or null.
 */
export function renderSprintContext(board: ScrumBoard): string | null {
  const tree = board.tree()
  const sprint = board.activeSprint()
  const limits = board.titleLimits()
  if (sprint !== undefined) return renderActive(board, tree, sprint, limits)
  const components = liveComponents(tree)
  if (components.length === 0) return null
  return renderIdle(board, components, limits)
}

/** The active-sprint mode (v0.7 + the spiral of comp-46 R2). */
function renderActive(board: ScrumBoard, tree: ScrumTree, sprint: SprintView, limits: TitleLimits): string {
  const status = board.sprintStatus(sprint.id)

  const lines: string[] = []
  lines.push(`[SCRUM · sprint ativa ${sprint.id} #${sprint.number}] ${cut(sprint.goal, limits.goal)}`)
  lines.push(`Progresso: ${status.totals.done}/${status.totals.tasks} tarefas · ${status.totals.pointsDone}/${status.totals.points} pontos.`)

  for (const column of BOARD_COLUMNS) {
    const inColumn = status.tasks.filter(task => task.status === column)
    const list = inColumn.length === 0 ? '—' : inColumn.map(t => taskEntry(t, limits.title)).join('; ')
    lines.push(`${COLUMN_CAPTIONS[column]}: ${list}`)
  }

  // Parents of the sprint's tasks, with their EXPLICIT states (manual by
  // product decision — the agent is the one keeping them honest) and, for
  // components, the phase and what blocks the next step.
  const componentIds = new Set(status.tasks.map(task => task.componentId))
  const parents: string[] = []
  const seen = new Set<string>()
  for (const release of tree.releases) {
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
        parents.push(componentEntry(component, ACTIVE_REASONS))
      }
    }
  }
  if (parents.length > 0) lines.push(`Pais: ${parents.join(' · ')}`)

  // Components in progress WITHOUT a task in the sprint (requirements,
  // design, tdd before the tasks): the checklist matters most there.
  const others = liveComponents(tree).filter(c => c.status === 'in_progress' && !componentIds.has(c.id))
  if (others.length > 0) {
    lines.push(`Em andamento (sem task na sprint): ${capped(others.map(c => componentEntry(c, ACTIVE_REASONS)), MAX_IN_PROGRESS)}`)
  }

  // comp-54 R3: what to fix about the sprint's open tasks — before the discipline it enforces.
  const care = hygiene(status.tasks, status.sprint, limits)
  if (care !== null) lines.push(care)

  lines.push(DISCIPLINE)
  return lines.join('\n')
}

/** The idle mode (comp-46 R3): between sprints, on a board that uses SCRUM. */
function renderIdle(board: ScrumBoard, components: TreeComponent[], limits: TitleLimits): string {
  const lines: string[] = []

  // The highest-numbered sprint heads the snapshot (never its daysRemaining: R5).
  const latest = board.sprints()[0]
  let care: string | null = null
  if (latest === undefined) {
    lines.push('[SCRUM · sem sprint ativa] nenhuma sprint ainda')
  } else {
    const status = board.sprintStatus(latest.id)
    const { totals } = status
    // comp-54 R3/D1: between sprints only the latest goal (and the todo of a planned one) can be flagged.
    care = hygiene(status.tasks, status.sprint, limits)
    const goal = `"${cut(latest.goal, limits.goal)}"`
    lines.push(latest.status === 'planned'
      ? `[SCRUM · sem sprint ativa] planejada: ${latest.id} #${latest.number} [planned] ${totals.tasks} tasks · ${totals.points} pts — ${goal}`
      : `[SCRUM · sem sprint ativa] última: ${latest.id} #${latest.number} [${latest.status}] ${totals.done} tasks · ${totals.pointsDone} pts entregues — ${goal}`)
  }

  const inProgress = components.filter(c => c.status === 'in_progress')
  const proposed = components.filter(c => c.status === 'proposed')
  lines.push(`Em andamento: ${inProgress.length === 0 ? '—' : capped(inProgress.map(c => componentEntry(c, IDLE_REASONS)), MAX_IN_PROGRESS)}`)
  lines.push(`Backlog: ${proposed.length === 0 ? '—' : capped(proposed.map(c => `${c.id} "${cut(c.title, limits.title)}" [${c.phase}]`), MAX_BACKLOG)}`)
  if (care !== null) lines.push(care)

  // Next step by precedence: a planned sprint waits to start; work waits for
  // a sprint; a finished board waits for the next component or the archive.
  const planned = board.sprints().find(s => s.status === 'planned')
  if (planned !== undefined) {
    lines.push(`Próximo passo: inicie a sprint (scrum_sprint_start ${planned.id})`)
  } else if (inProgress.length + proposed.length > 0) {
    lines.push('Próximo passo: planeje a sprint (scrum_sprint_plan) com as tasks do componente escolhido; abra-o pela espiral (requisitos → brief → revisão → design → tdd).')
  } else {
    lines.push('Próximo passo: crie o próximo componente (scrum_component_create) ou arquive os concluídos (scrum_item_archive)')
  }
  return lines.join('\n')
}
