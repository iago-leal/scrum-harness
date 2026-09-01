/**
 * Shared visual vocabulary of the board, Azure DevOps-inspired: colored
 * work-item type icons (monogram squares) and state dots (● + label). Used by
 * the Backlog grid, the Sprints section and the Archive/Trash shelves so the
 * same kind/status always looks the same everywhere.
 * @module @scrum-harness/ui/client/meta
 */

/** One work-item kind's visual identity. */
export interface KindMeta {
  /** Monogram glyph inside the colored square. */
  glyph: string
  /** Human label (pt-BR). */
  label: string
  /** Solid icon color. */
  color: string
}

/** Work-item kinds → icon identity (palette in Azure DevOps spirit). */
export const KIND_META: Record<'release' | 'feature' | 'component' | 'task', KindMeta> = {
  release: { glyph: 'R', label: 'Release', color: '#8250df' },
  feature: { glyph: 'F', label: 'Função', color: '#0969da' },
  component: { glyph: 'C', label: 'Componente', color: '#1a7f37' },
  task: { glyph: 'T', label: 'Tarefa', color: '#b58814' },
}

/** One status' dot color and human label. */
export interface StatusMeta {
  label: string
  color: string
}

/** Status catalog across items, sprints and board columns. */
export const STATUS_META: Record<string, StatusMeta> = {
  backlog: { label: 'Backlog', color: '#8b93a7' },
  todo: { label: 'A fazer', color: '#8b93a7' },
  in_progress: { label: 'Em andamento', color: '#2f6fed' },
  review: { label: 'Revisão', color: '#d99a1b' },
  done: { label: 'Concluído', color: '#2da44e' },
  proposed: { label: 'Proposta', color: '#8b93a7' },
  committed: { label: 'Comprometida', color: '#2f6fed' },
  planned: { label: 'Planejada', color: '#8b93a7' },
  active: { label: 'Ativa', color: '#2f6fed' },
  released: { label: 'Liberada', color: '#2da44e' },
  completed: { label: 'Concluída', color: '#2da44e' },
}

/** Colored work-item type icon (small monogram square). */
export function TypeIcon(props: { kind: keyof typeof KIND_META }) {
  const meta = KIND_META[props.kind]
  return (
    <span className="scrum-kind-icon" style={{ background: meta.color }} title={meta.label}>
      {meta.glyph}
    </span>
  )
}

/** Colored state dot + label (unknown statuses degrade to a grey dot). */
export function StateDot(props: { status: string }) {
  const meta = STATUS_META[props.status] ?? { label: props.status, color: '#8b93a7' }
  return (
    <span className="scrum-state">
      <span className="scrum-state-dot" style={{ background: meta.color }} />
      {meta.label}
    </span>
  )
}

/** Descendant-task aggregate of one parent item. */
export interface Agg {
  tasks: number
  done: number
  pts: number
  ptsDone: number
}

/** Aggregate a task list into rollup numbers. */
export function aggOf(tasks: { status: string; estimate?: number }[]): Agg {
  const done = tasks.filter(t => t.status === 'done')
  const sum = (list: { estimate?: number }[]) => list.reduce((total, t) => total + (t.estimate ?? 0), 0)
  return { tasks: tasks.length, done: done.length, pts: sum(tasks), ptsDone: sum(done) }
}

/** Rollup cell: mini progress bar + points (or task count) done/total. */
export function Rollup(props: { agg: Agg }) {
  const { agg } = props
  if (agg.tasks === 0) return <span className="scrum-dash">—</span>
  const ratio = agg.pts > 0 ? agg.ptsDone / agg.pts : agg.done / agg.tasks
  return (
    <span className="scrum-rollup" title={`${agg.done}/${agg.tasks} tarefas · ${agg.ptsDone}/${agg.pts} pontos`}>
      <span className="scrum-rollup-bar"><span style={{ width: `${Math.round(ratio * 100)}%` }} /></span>
      <span className="scrum-rollup-txt">{agg.pts > 0 ? `${agg.ptsDone}/${agg.pts} pt` : `${agg.done}/${agg.tasks}`}</span>
    </span>
  )
}
