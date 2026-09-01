/**
 * Pure text renderers of SCRUM state for tool results: compact, id-first
 * listings the model can read and reference back.
 * @module @scrum-harness/domain/format
 */

import type { Ceremony, Sprint } from './spec.ts'
import type { ScrumTree, ShelfLists, SprintStatus } from './service.ts'

/** Release-name lookup used to render sprint→release links. */
export type ReleaseNames = ReadonlyMap<string, string>

/** Render one sprint's release links (empty when unlinked; many since v0.11). */
function releaseSuffix(sprint: Sprint, names?: ReleaseNames): string {
  if (sprint.releaseIds.length === 0) return ''
  const links = sprint.releaseIds.map((id) => {
    const name = names?.get(id)
    return `${id}${name === undefined ? '' : ` ${name}`}`
  })
  return ` → ${links.join(', ')}`
}

/**
 * Render the whole hierarchy as an indented id-first listing. When `sprints`
 * is passed, each release line also lists the sprints linked to it.
 * @param tree - the nested hierarchy.
 * @param sprints - sprint roster used to render release→sprint links.
 * @returns the multi-line listing (or a hint when empty).
 */
export function formatTree(tree: ScrumTree, sprints?: Sprint[]): string {
  if (tree.releases.length === 0) {
    return 'Empty backlog: no releases yet. Create one with scrum_release_create.'
  }
  const lines: string[] = []
  for (const release of tree.releases) {
    const target = release.targetDate === undefined ? '' : ` (target: ${release.targetDate})`
    const linked = (sprints ?? []).filter(s => s.releaseIds.includes(release.id))
    const sprintSuffix = linked.length === 0
      ? ''
      : ` (sprints: ${linked.map(s => `${s.id} ${s.status}`).join(', ')})`
    lines.push(`${release.id} ${release.name} [${release.status}]${target}${sprintSuffix}`)
    for (const feature of release.features) {
      lines.push(`  ${feature.id} ${feature.title} [${feature.status}]`)
      for (const component of feature.components) {
        lines.push(`    ${component.id} ${component.title} [${component.status}]`)
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
 * Render the sprint roster, each line carrying its release link when set.
 * @param sprints - sprints newest first.
 * @param releaseNames - release-name lookup for the link rendering.
 * @returns one line per sprint.
 */
export function formatSprints(sprints: Sprint[], releaseNames?: ReleaseNames): string {
  if (sprints.length === 0) return 'No sprints yet.'
  return sprints
    .map((s) => {
      const window = [s.startDate, s.endDate].filter(Boolean).join(' → ')
      return `${s.id} #${s.number} "${s.goal}" [${s.status}]${window.length > 0 ? ` ${window}` : ''}${releaseSuffix(s, releaseNames)}`
    })
    .join('\n')
}

/**
 * Render one sprint's progress summary with its board grouped by column.
 * @param status - the sprint status snapshot.
 * @param releaseNames - release-name lookup for the link rendering.
 * @returns the multi-line summary.
 */
export function formatSprintStatus(status: SprintStatus, releaseNames?: ReleaseNames): string {
  const { sprint, tasks, totals } = status
  const head = `${sprint.id} #${sprint.number} "${sprint.goal}" [${sprint.status}]${releaseSuffix(sprint, releaseNames)}`
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
 * Render one shelf (the trash or the archive) as id-first lines grouped by
 * kind, newest stamp first (the service pre-sorts).
 * @param shelf - the per-kind lists.
 * @param kind - which shelf this is, for labels and the empty hint.
 * @returns the multi-line listing (or a hint when empty).
 */
export function formatShelf(shelf: ShelfLists, kind: 'trash' | 'archive'): string {
  const stampOf = (r: { deletedAt?: string; archivedAt?: string }): string =>
    (kind === 'trash' ? r.deletedAt : r.archivedAt) ?? ''
  const lines: string[] = []
  for (const release of shelf.releases) lines.push(`${release.id} ${release.name} [release] ${stampOf(release)}`)
  for (const feature of shelf.features) lines.push(`${feature.id} ${feature.title} [feature, of ${feature.releaseId}] ${stampOf(feature)}`)
  for (const component of shelf.components) lines.push(`${component.id} ${component.title} [component, of ${component.featureId}] ${stampOf(component)}`)
  for (const task of shelf.tasks) {
    const points = task.estimate === undefined ? '' : ` (${task.estimate}pt)`
    lines.push(`${task.id} ${task.title} [task ${task.status}, of ${task.componentId}]${points} ${stampOf(task)}`)
  }
  if (lines.length === 0) {
    return kind === 'trash'
      ? 'The trash is empty.'
      : 'The archive is empty.'
  }
  return lines.join('\n')
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
