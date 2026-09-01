/**
 * Pure text renderers of SCRUM state for tool results: compact, id-first
 * listings the model can read and reference back.
 * @module @scrum-harness/domain/format
 */

import type { Ceremony, Sprint } from './spec.ts'
import type { ScrumTree, SprintStatus } from './service.ts'

/**
 * Render the whole hierarchy as an indented id-first listing.
 * @param tree - the nested hierarchy.
 * @returns the multi-line listing (or a hint when empty).
 */
export function formatTree(tree: ScrumTree): string {
  if (tree.releases.length === 0) {
    return 'Empty backlog: no releases yet. Create one with scrum_release_create.'
  }
  const lines: string[] = []
  for (const release of tree.releases) {
    const target = release.targetDate === undefined ? '' : ` (target: ${release.targetDate})`
    lines.push(`${release.id} ${release.name} [${release.status}]${target}`)
    for (const feature of release.features) {
      lines.push(`  ${feature.id} ${feature.title} [${feature.status}]`)
      for (const component of feature.components) {
        lines.push(`    ${component.id} ${component.title}`)
        for (const task of component.tasks) {
          const points = task.estimate === undefined ? '' : ` (${task.estimate}pt)`
          const sprint = task.sprintId === undefined ? '' : ` @${task.sprintId}`
          lines.push(`      ${task.id} ${task.title} [${task.status}${sprint}]${points}`)
        }
      }
    }
  }
  return lines.join('\n')
}

/**
 * Render the sprint roster.
 * @param sprints - sprints newest first.
 * @returns one line per sprint.
 */
export function formatSprints(sprints: Sprint[]): string {
  if (sprints.length === 0) return 'No sprints yet.'
  return sprints
    .map((s) => {
      const window = [s.startDate, s.endDate].filter(Boolean).join(' → ')
      return `${s.id} #${s.number} "${s.goal}" [${s.status}]${window.length > 0 ? ` ${window}` : ''}`
    })
    .join('\n')
}

/**
 * Render one sprint's progress summary with its board grouped by column.
 * @param status - the sprint status snapshot.
 * @returns the multi-line summary.
 */
export function formatSprintStatus(status: SprintStatus): string {
  const { sprint, tasks, totals } = status
  const head = `${sprint.id} #${sprint.number} "${sprint.goal}" [${sprint.status}]`
  const days = status.daysRemaining === undefined ? '' : `, ${status.daysRemaining} day(s) remaining`
  const progress = `${totals.done}/${totals.tasks} tasks done, ${totals.pointsDone}/${totals.points} points${days}`
  const columns = ['todo', 'in_progress', 'review', 'done'] as const
  const board = columns.map((column) => {
    const inColumn = tasks.filter(t => t.status === column)
    const list = inColumn.length === 0 ? '—' : inColumn.map(t => `${t.id} ${t.title}`).join(', ')
    return `  ${column}: ${list}`
  })
  return [head, progress, ...board].join('\n')
}

/**
 * Render ceremony records oldest first.
 * @param ceremonies - the records.
 * @returns the multi-line listing.
 */
export function formatCeremonies(ceremonies: Ceremony[]): string {
  if (ceremonies.length === 0) return 'No ceremonies recorded.'
  return ceremonies
    .map((c) => {
      const author = c.author === undefined ? '' : ` by ${c.author}`
      const notes = c.notes.map(n => `  [${n.category}] ${n.text}`).join('\n')
      return `${c.id} ${c.type} @${c.sprintId} ${c.at}${author}\n${notes}`
    })
    .join('\n')
}
