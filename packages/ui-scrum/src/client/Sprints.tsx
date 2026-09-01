/**
 * Sprints section: plan/start/end sprints, burndown numbers, and the
 * ceremony log with an inline recording form.
 * @module @scrum-harness/ui/client/Sprints
 */

import { useState } from 'react'
import type { ScrumState, WireCeremony, WireRelease, WireSprint, WireTask } from './api.ts'

/** Minimal release option for the link selectors. */
type ReleaseOption = Pick<WireRelease, 'id' | 'name'>

/** Callbacks the sprint section drives. */
export interface SprintsCallbacks {
  run: (action: Record<string, unknown>) => void
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

/** Release link chip + relink selector shown on every non-completed sprint. */
function ReleaseLink(props: {
  sprint: WireSprint
  releases: ReleaseOption[]
  onRun: (action: Record<string, unknown>) => void
}) {
  const { sprint } = props
  const linked = props.releases.find(r => r.id === sprint.releaseId)
  if (sprint.status === 'completed') {
    return sprint.releaseId === undefined
      ? null
      : <span className="scrum-pts" title="Release vinculada">🎯 {sprint.releaseId}{linked !== undefined ? ` ${linked.name}` : ''}</span>
  }
  return (
    <select
      title="Release vinculada"
      value={sprint.releaseId ?? ''}
      onChange={(e) => { props.onRun({ action: 'updateItem', id: sprint.id, releaseId: e.target.value }) }}
    >
      <option value="">— sem release —</option>
      {props.releases.map(release => (
        <option key={release.id} value={release.id}>🎯 {release.id} {release.name}</option>
      ))}
    </select>
  )
}

/** One sprint card with progress, actions and its ceremonies. */
function SprintCard(props: {
  sprint: WireSprint
  tasks: WireTask[]
  ceremonies: WireCeremony[]
  releases: ReleaseOption[]
  hasActive: boolean
  onRun: (action: Record<string, unknown>) => void
}) {
  const [recording, setRecording] = useState(false)
  const [showCeremonies, setShowCeremonies] = useState(false)
  const { sprint, tasks } = props
  const done = tasks.filter(t => t.status === 'done').length
  const points = tasks.reduce((sum, t) => sum + (t.estimate ?? 0), 0)
  const pointsDone = tasks.filter(t => t.status === 'done').reduce((sum, t) => sum + (t.estimate ?? 0), 0)
  const percent = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100)
  const window = [sprint.startDate?.slice(0, 10), sprint.endDate?.slice(0, 10)].filter(Boolean).join(' → ')

  return (
    <div className="scrum-sprint">
      <div className="scrum-sprint-head">
        <span className="scrum-id">{sprint.id}</span>
        <span className="scrum-goal">#{sprint.number} {sprint.goal}</span>
        <span className={`scrum-badge st-${sprint.status}`}>{sprint.status}</span>
        <ReleaseLink sprint={sprint} releases={props.releases} onRun={props.onRun} />
        {window.length > 0 && <span className="scrum-muted">{window}</span>}
        <span style={{ flex: 1 }} />
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
      {tasks.length > 0 && (
        <>
          <div className="scrum-progress"><div style={{ width: `${percent}%` }} /></div>
          <div className="scrum-muted">
            {done}/{tasks.length} tarefas concluídas · {pointsDone}/{points} pontos
          </div>
        </>
      )}
      {sprint.status === 'planned' && tasks.length === 0 && (
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

  return (
    <div>
      <div className="scrum-section-head">
        <h2>Sprints</h2>
        <span className="scrum-muted">planejar → iniciar → board → encerrar</span>
        <span style={{ flex: 1 }} />
        <button className="scrum-btn primary" onClick={() => { setPlanning(p => !p) }}>+ Planejar sprint</button>
      </div>
      {planning && (
        <div className="scrum-form" style={{ marginLeft: 0 }}>
          <PlanForm
            releases={props.state.tree.releases}
            onConfirm={(goal, releaseId, startDate, endDate) => {
              run({
                action: 'planSprint',
                goal,
                ...releaseId.length > 0 ? { releaseId } : {},
                ...startDate.length > 0 ? { startDate } : {},
                ...endDate.length > 0 ? { endDate } : {},
              })
              setPlanning(false)
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
  onConfirm: (goal: string, releaseId: string, start: string, end: string) => void
  onCancel: () => void
}) {
  const [goal, setGoal] = useState('')
  const [releaseId, setReleaseId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const confirm = () => { if (goal.trim().length > 0) props.onConfirm(goal.trim(), releaseId, start, end) }
  return (
    <>
      <input
        className="grow"
        placeholder="Meta da sprint (sprint goal)"
        autoFocus
        value={goal}
        onChange={(e) => { setGoal(e.target.value) }}
        onKeyDown={(e) => { if (e.key === 'Enter') confirm() }}
      />
      <select title="Release vinculada" value={releaseId} onChange={(e) => { setReleaseId(e.target.value) }}>
        <option value="">— sem release —</option>
        {props.releases.map(release => (
          <option key={release.id} value={release.id}>🎯 {release.id} {release.name}</option>
        ))}
      </select>
      <input placeholder="Início (AAAA-MM-DD)" value={start} onChange={(e) => { setStart(e.target.value) }} />
      <input placeholder="Fim (AAAA-MM-DD)" value={end} onChange={(e) => { setEnd(e.target.value) }} />
      <button className="scrum-btn primary" onClick={confirm}>Planejar</button>
      <button className="scrum-btn" onClick={props.onCancel}>Cancelar</button>
    </>
  )
}
