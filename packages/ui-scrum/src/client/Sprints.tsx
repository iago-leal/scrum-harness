/**
 * Sprints section: plan/start/end sprints, burndown numbers, and the
 * ceremony log with an inline recording form.
 * @module @scrum-harness/ui/client/Sprints
 */

import { useState } from 'react'
import type { ScrumState, WireCeremony, WireRelease, WireSprint, WireSprintStats, WireTask } from './api.ts'
import { Burndown, Velocity } from './Charts.tsx'
import { Counter, OverflowChip, StateDot } from './meta.tsx'
import type { RunOutcome } from './settle.ts'

/** Minimal release option for the link selectors. */
type ReleaseOption = Pick<WireRelease, 'id' | 'name'>

/** Callbacks the sprint section drives. */
export interface SprintsCallbacks {
  /** The outcome lets the plan form keep its draft on a refusal (comp-53 D1). */
  run: (action: Record<string, unknown>) => Promise<RunOutcome>
}

const CEREMONY_LABELS: Record<WireCeremony['type'], string> = {
  planning: 'Planning',
  standup: 'Daily Standup',
  review: 'Review',
  retrospective: 'Retrospectiva',
}

/** Parse "categoria: texto" lines into ceremony notes. */
function parseNotes(raw: string): { category: string; text: string }[] {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map((line) => {
      const at = line.indexOf(':')
      if (at === -1) return { category: 'nota', text: line }
      return { category: line.slice(0, at).trim() || 'nota', text: line.slice(at + 1).trim() }
    })
    .filter(note => note.text.length > 0)
}

/** Inline ceremony-recording form. */
function CeremonyForm(props: { sprintId: string; onRun: (action: Record<string, unknown>) => void; onClose: () => void }) {
  const [type, setType] = useState<WireCeremony['type']>('standup')
  const [author, setAuthor] = useState('')
  const [notes, setNotes] = useState('')
  return (
    <div className="scrum-form" style={{ marginLeft: 0 }}>
      <select value={type} onChange={(e) => { setType(e.target.value as WireCeremony['type']) }}>
        <option value="planning">Planning</option>
        <option value="standup">Daily Standup</option>
        <option value="review">Review</option>
        <option value="retrospective">Retrospectiva</option>
      </select>
      <input placeholder="Autor (opcional)" value={author} onChange={(e) => { setAuthor(e.target.value) }} />
      <textarea
        placeholder={'Uma nota por linha, "categoria: texto". Ex.:\nprogress: autenticação pronta\nimpediment: CI instável'}
        value={notes}
        onChange={(e) => { setNotes(e.target.value) }}
      />
      <button
        className="scrum-btn primary"
        onClick={() => {
          const parsed = parseNotes(notes)
          if (parsed.length === 0) return
          props.onRun({
            action: 'recordCeremony',
            type,
            sprintId: props.sprintId,
            notes: parsed,
            ...author.trim().length > 0 ? { author: author.trim() } : {},
          })
          props.onClose()
        }}
      >Registrar</button>
      <button className="scrum-btn" onClick={props.onClose}>Cancelar</button>
    </div>
  )
}

/** Linked-release chips (each removable) + link selector on every sprint. */
function ReleaseLink(props: {
  sprint: WireSprint
  releases: ReleaseOption[]
  onRun: (action: Record<string, unknown>) => void
}) {
  const { sprint } = props
  const editable = sprint.status !== 'completed'
  const unlinked = props.releases.filter(r => !sprint.releaseIds.includes(r.id))
  return (
    <>
      {sprint.releaseIds.map((id) => {
        const linked = props.releases.find(r => r.id === id)
        return (
          <span key={id} className="scrum-rel-chip" title="Release vinculada">
            🎯 {id}{linked !== undefined ? ` ${linked.name}` : ''}
            {editable && (
              <button
                className="scrum-rel-chip-x"
                title="Desvincular release"
                onClick={() => {
                  props.onRun({ action: 'updateItem', id: sprint.id, releaseIds: sprint.releaseIds.filter(r => r !== id) })
                }}
              >×</button>
            )}
          </span>
        )
      })}
      {editable && unlinked.length > 0 && (
        <select
          title="Vincular release"
          value=""
          onChange={(e) => {
            if (e.target.value.length === 0) return
            props.onRun({ action: 'updateItem', id: sprint.id, releaseIds: [...sprint.releaseIds, e.target.value] })
          }}
        >
          <option value="">＋ vincular release…</option>
          {unlinked.map(release => (
            <option key={release.id} value={release.id}>🎯 {release.id} {release.name}</option>
          ))}
        </select>
      )}
    </>
  )
}

/** One sprint card with progress, burndown, actions and its ceremonies. */
function SprintCard(props: {
  sprint: WireSprint
  tasks: WireTask[]
  /** Chart data of this sprint (includes archived done tasks). */
  stats?: WireSprintStats
  ceremonies: WireCeremony[]
  releases: ReleaseOption[]
  hasActive: boolean
  onRun: (action: Record<string, unknown>) => void
}) {
  const [recording, setRecording] = useState(false)
  const [showCeremonies, setShowCeremonies] = useState(false)
  const [showBurndown, setShowBurndown] = useState(false)
  const { sprint, tasks } = props
  // Prefer server stats: they keep counting archived done tasks.
  const totals = props.stats?.totals ?? {
    tasks: tasks.length,
    done: tasks.filter(t => t.status === 'done').length,
    points: tasks.reduce((sum, t) => sum + (t.estimate ?? 0), 0),
    pointsDone: tasks.filter(t => t.status === 'done').reduce((sum, t) => sum + (t.estimate ?? 0), 0),
  }
  const percent = totals.tasks === 0 ? 0 : Math.round((totals.done / totals.tasks) * 100)
  const window = [sprint.startDate?.slice(0, 10), sprint.endDate?.slice(0, 10)].filter(Boolean).join(' → ')

  return (
    <div className="scrum-sprint">
      <div className="scrum-sprint-head">
        <span className="scrum-id">{sprint.id}</span>
        <span className="scrum-goal">#{sprint.number} {sprint.goal}</span>
        <OverflowChip over={sprint.goalOverflow} noun="meta longa" />
        <StateDot status={sprint.status} />
        <ReleaseLink sprint={sprint} releases={props.releases} onRun={props.onRun} />
        {window.length > 0 && <span className="scrum-muted">{window}</span>}
        <span style={{ flex: 1 }} />
        {sprint.startDate !== undefined && totals.points > 0 && (
          <button className="scrum-btn ghost" onClick={() => { setShowBurndown(s => !s) }}>
            {showBurndown ? '▾' : '▸'} 📉 Burndown
          </button>
        )}
        {sprint.status === 'planned' && !props.hasActive && (
          <button className="scrum-btn primary" onClick={() => { props.onRun({ action: 'startSprint', sprintId: sprint.id }) }}>Iniciar sprint</button>
        )}
        {sprint.status === 'active' && (
          <>
            <button className="scrum-btn" onClick={() => { setRecording(r => !r) }}>+ cerimônia</button>
            <button className="scrum-btn danger" onClick={() => { props.onRun({ action: 'endSprint', sprintId: sprint.id }) }}>Encerrar sprint</button>
          </>
        )}
      </div>
      {totals.tasks > 0 && (
        <>
          <div className="scrum-progress"><div style={{ width: `${percent}%` }} /></div>
          <div className="scrum-muted">
            {totals.done}/{totals.tasks} tarefas concluídas · {totals.pointsDone}/{totals.points} pontos
          </div>
        </>
      )}
      {showBurndown && <Burndown sprint={sprint} stats={props.stats} />}
      {sprint.status === 'planned' && totals.tasks === 0 && (
        <div className="scrum-muted">Sem tarefas: selecione tarefas do backlog (botão «→ {sprint.id}» na aba Backlog).</div>
      )}
      {recording && <CeremonyForm sprintId={sprint.id} onRun={props.onRun} onClose={() => { setRecording(false) }} />}
      {props.ceremonies.length > 0 && (
        <div className="scrum-cer">
          <button className="scrum-btn ghost" onClick={() => { setShowCeremonies(s => !s) }}>
            {showCeremonies ? '▾' : '▸'} {props.ceremonies.length} cerimônia(s)
          </button>
          {showCeremonies && props.ceremonies.map(ceremony => (
            <div key={ceremony.id} style={{ marginTop: 6 }}>
              <span className="scrum-id">{ceremony.id}</span>{' '}
              <strong>{CEREMONY_LABELS[ceremony.type]}</strong>{' '}
              <span className="scrum-muted">
                {ceremony.at.slice(0, 16).replace('T', ' ')}
                {ceremony.author !== undefined ? ` · ${ceremony.author}` : ''}
              </span>
              {ceremony.notes.map((note, index) => (
                <div key={index} className="scrum-cer-note">
                  <span className="scrum-cer-cat">{note.category}</span>{note.text}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** The Sprints section. */
export function Sprints(props: { state: ScrumState; callbacks: SprintsCallbacks }) {
  const [planning, setPlanning] = useState(false)
  const { run } = props.callbacks
  const allTasks: WireTask[] = props.state.tree.releases
    .flatMap(r => r.features)
    .flatMap(f => f.components)
    .flatMap(c => c.tasks)
  const hasActive = props.state.activeSprintId !== null
  const stats = props.state.stats ?? []

  return (
    <div>
      <div className="scrum-section-head">
        <h2>Sprints</h2>
        <span className="scrum-muted">planejar → iniciar → board → encerrar</span>
        <span style={{ flex: 1 }} />
        <button className="scrum-btn primary" onClick={() => { setPlanning(p => !p) }}>+ Planejar sprint</button>
      </div>
      <Velocity sprints={props.state.sprints} stats={stats} />
      {planning && (
        <div className="scrum-form" style={{ marginLeft: 0 }}>
          <PlanForm
            releases={props.state.tree.releases}
            limit={props.state.limits?.goal}
            onConfirm={async (goal, releaseId, startDate, endDate) => {
              // comp-53 D1: the form closes only on `ok`; a refusal keeps the draft and shows the reason.
              const outcome = await run({
                action: 'planSprint',
                goal,
                ...releaseId.length > 0 ? { releaseId } : {},
                ...startDate.length > 0 ? { startDate } : {},
                ...endDate.length > 0 ? { endDate } : {},
              })
              if (outcome.ok) setPlanning(false)
              return outcome
            }}
            onCancel={() => { setPlanning(false) }}
          />
        </div>
      )}
      {props.state.sprints.length === 0
        ? <div className="scrum-empty">Nenhuma sprint ainda. Planeje a primeira para começar o ciclo.</div>
        : props.state.sprints.map(sprint => (
          <SprintCard
            key={sprint.id}
            sprint={sprint}
            tasks={allTasks.filter(t => t.sprintId === sprint.id)}
            stats={stats.find(s => s.sprintId === sprint.id)}
            ceremonies={props.state.ceremonies.filter(c => c.sprintId === sprint.id)}
            releases={props.state.tree.releases}
            hasActive={hasActive}
            onRun={run}
          />
        ))}
    </div>
  )
}

/** Sprint-planning inputs (goal + optional release link + optional window). */
function PlanForm(props: {
  releases: ReleaseOption[]
  /** The goal ceiling for the counter (comp-53 R6c); absent → no counter. */
  limit?: number
  onConfirm: (goal: string, releaseId: string, start: string, end: string) => Promise<RunOutcome>
  onCancel: () => void
}) {
  const [goal, setGoal] = useState('')
  const [releaseId, setReleaseId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const confirm = async () => {
    if (goal.trim().length === 0) return
    const outcome = await props.onConfirm(goal.trim(), releaseId, start, end)
    setError(outcome.ok ? null : outcome.message)
  }
  return (
    <>
      <input
        className="grow"
        placeholder="Meta da sprint (sprint goal)"
        autoFocus
        value={goal}
        onChange={(e) => { setGoal(e.target.value); setError(null) }}
        onKeyDown={(e) => { if (e.key === 'Enter') void confirm() }}
      />
      <Counter text={goal} limit={props.limit} />
      <select title="Release vinculada" value={releaseId} onChange={(e) => { setReleaseId(e.target.value) }}>
        <option value="">— sem release —</option>
        {props.releases.map(release => (
          <option key={release.id} value={release.id}>🎯 {release.id} {release.name}</option>
        ))}
      </select>
      <input placeholder="Início (AAAA-MM-DD)" value={start} onChange={(e) => { setStart(e.target.value) }} />
      <input placeholder="Fim (AAAA-MM-DD)" value={end} onChange={(e) => { setEnd(e.target.value) }} />
      <button className="scrum-btn primary" onClick={() => { void confirm() }}>Planejar</button>
      {error !== null && <span className="scrum-inline-error" title={error}>{error}</span>}
      <button className="scrum-btn" onClick={props.onCancel}>Cancelar</button>
    </>
  )
}
