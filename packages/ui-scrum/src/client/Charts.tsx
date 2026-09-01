/**
 * Sprint charts in hand-rolled SVG (no chart library): the velocity bars of
 * completed sprints and the burndown line (real remaining points per day via
 * the doneAt stamp, against the ideal line). Pure presentation over wire
 * data; both degrade gracefully when there is nothing to plot.
 * @module @scrum-harness/ui/client/Charts
 */

import type { WireSprint, WireSprintStats } from './api.ts'

/** One day as a date-only UTC string (YYYY-MM-DD). */
function dayOf(iso: string): string {
  return iso.slice(0, 10)
}

/** Add `n` days to a date-only string. */
function addDays(day: string, n: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + n)
  return date.toISOString().slice(0, 10)
}

/** Whole days from `a` to `b` (date-only strings; 0 when equal). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** Short pt-BR day label (dd/mm). */
function dayLabel(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`
}

/**
 * Velocity: one bar of concluded points per completed sprint, plus the
 * average of the last three as a dashed reference line.
 */
export function Velocity(props: { sprints: WireSprint[]; stats: WireSprintStats[] }) {
  const completed = props.sprints
    .filter(s => s.status === 'completed')
    .sort((a, b) => a.number - b.number)
  const bars = completed.map((sprint) => {
    const stat = props.stats.find(s => s.sprintId === sprint.id)
    return { sprint, pts: stat?.totals.pointsDone ?? 0 }
  })
  if (bars.length === 0) return null

  const recent = bars.slice(-3)
  const average = recent.reduce((sum, b) => sum + b.pts, 0) / recent.length
  const max = Math.max(...bars.map(b => b.pts), average, 1)

  const barWidth = 34
  const gap = 18
  const chartHeight = 96
  const width = bars.length * (barWidth + gap) + gap
  const height = chartHeight + 34
  const yOf = (pts: number) => 14 + (chartHeight - 14) * (1 - pts / max)
  const avgY = yOf(average)

  return (
    <div className="scrum-chart">
      <div className="scrum-chart-title">
        Velocity
        <span className="scrum-muted"> — pontos concluídos por sprint · média (últimas {recent.length}): {Math.round(average * 10) / 10} pt</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: Math.min(width * 1.6, 560), maxWidth: '100%' }} role="img">
        {bars.map((bar, index) => {
          const x = gap + index * (barWidth + gap)
          const y = yOf(bar.pts)
          return (
            <g key={bar.sprint.id}>
              <rect x={x} y={y} width={barWidth} height={chartHeight - y} rx={3} fill="var(--bgColor-accent-emphasis, #2f6fed)" opacity={0.85} />
              <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" fontSize={10} fill="var(--fgColor-default, #3f4657)">{bar.pts}</text>
              <text x={x + barWidth / 2} y={chartHeight + 14} textAnchor="middle" fontSize={10} fill="var(--fgColor-muted, #6b7280)">#{bar.sprint.number}</text>
            </g>
          )
        })}
        <line x1={4} y1={avgY} x2={width - 4} y2={avgY} stroke="var(--bgColor-attention-emphasis, #d99a1b)" strokeDasharray="5 4" strokeWidth={1.5} />
        <line x1={4} y1={chartHeight} x2={width - 4} y2={chartHeight} stroke="var(--borderColor-default, #c9cedb)" strokeWidth={1} />
      </svg>
    </div>
  )
}

/**
 * Burndown of one sprint: remaining points per day (via doneAt) against the
 * ideal straight line from total to zero across the sprint window.
 */
export function Burndown(props: { sprint: WireSprint; stats?: WireSprintStats }) {
  const { sprint, stats } = props
  if (sprint.startDate === undefined || stats === undefined) {
    return <div className="scrum-muted">Sem janela de datas: inicie a sprint para acompanhar o burndown.</div>
  }
  const total = stats.totals.points
  if (total === 0) {
    return <div className="scrum-muted">Sem pontos estimados nesta sprint — nada para queimar.</div>
  }

  const today = dayOf(new Date().toISOString())
  const start = dayOf(sprint.startDate)
  const endPlanned = sprint.endDate !== undefined ? dayOf(sprint.endDate) : today
  const end = daysBetween(start, endPlanned) < 1 ? addDays(start, 1) : endPlanned
  const dayCount = Math.min(daysBetween(start, end), 60)
  const days = Array.from({ length: dayCount + 1 }, (_, index) => addDays(start, index))

  // Real line: remaining points at the END of each day, up to today.
  const doneStamps = stats.tasks
    .filter(task => task.status === 'done' && task.doneAt !== undefined)
    .map(task => ({ day: dayOf(task.doneAt ?? ''), pts: task.estimate ?? 0 }))
  const donePtsWithoutStamp = stats.tasks
    .filter(task => task.status === 'done' && task.doneAt === undefined)
    .reduce((sum, task) => sum + (task.estimate ?? 0), 0)
  const remainingAt = (day: string): number =>
    total - doneStamps.filter(stamp => stamp.day <= day).reduce((sum, stamp) => sum + stamp.pts, 0)
  const realDays = days.filter(day => day <= today)

  const width = 520
  const height = 150
  const pad = { left: 30, right: 10, top: 12, bottom: 20 }
  const xOf = (index: number) => pad.left + (width - pad.left - pad.right) * (dayCount === 0 ? 0 : index / dayCount)
  const yOf = (pts: number) => pad.top + (height - pad.top - pad.bottom) * (1 - pts / total)

  const idealPoints = `${xOf(0)},${yOf(total)} ${xOf(dayCount)},${yOf(0)}`
  const realPoints = realDays
    .map((day, index) => `${xOf(index)},${yOf(Math.max(0, remainingAt(day)))}`)
    .join(' ')

  return (
    <div className="scrum-chart">
      <div className="scrum-chart-title">
        Burndown
        <span className="scrum-muted"> — restante real × ideal ({dayLabel(days[0] ?? start)} → {dayLabel(days[dayCount] ?? end)})</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: 560, maxWidth: '100%' }} role="img">
        <text x={pad.left - 6} y={yOf(total) + 4} textAnchor="end" fontSize={10} fill="var(--fgColor-muted, #6b7280)">{total}</text>
        <text x={pad.left - 6} y={yOf(0) + 4} textAnchor="end" fontSize={10} fill="var(--fgColor-muted, #6b7280)">0</text>
        <line x1={pad.left} y1={yOf(0)} x2={width - pad.right} y2={yOf(0)} stroke="var(--borderColor-default, #c9cedb)" strokeWidth={1} />
        <polyline points={idealPoints} fill="none" stroke="var(--bgColor-neutral-emphasis, #8b93a7)" strokeWidth={1.5} strokeDasharray="6 4" />
        {realPoints.length > 0 && (
          <polyline points={realPoints} fill="none" stroke="var(--bgColor-accent-emphasis, #2f6fed)" strokeWidth={2} />
        )}
        {realDays.map((day, index) => (
          <circle key={day} cx={xOf(index)} cy={yOf(Math.max(0, remainingAt(day)))} r={2.5} fill="var(--bgColor-accent-emphasis, #2f6fed)" />
        ))}
        <text x={xOf(0)} y={height - 4} textAnchor="start" fontSize={10} fill="var(--fgColor-muted, #6b7280)">{dayLabel(days[0] ?? start)}</text>
        <text x={xOf(dayCount)} y={height - 4} textAnchor="end" fontSize={10} fill="var(--fgColor-muted, #6b7280)">{dayLabel(days[dayCount] ?? end)}</text>
      </svg>
      {donePtsWithoutStamp > 0 && (
        <div className="scrum-muted">
          {donePtsWithoutStamp} pt concluído(s) sem carimbo de data (anteriores ao v0.6) não aparecem na linha real.
        </div>
      )}
    </div>
  )
}
