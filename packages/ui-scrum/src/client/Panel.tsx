/**
 * The full-screen SCRUM panel, registered into the layout's `shell.overlay`
 * list slot. Renders nothing while closed; while open it shows the section
 * tabs (Backlog / Board / Sprints) over the shared store's fetched state and
 * polls for fresh state so model-made changes appear without a manual reload.
 * @module @scrum-harness/ui/client/Panel
 */

import { useEffect } from 'react'
import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createScrumStore } from './store.ts'
import type { ScrumView } from './store.ts'
import { Board } from './Board.tsx'
import { Sprints } from './Sprints.tsx'
import { Tree } from './Tree.tsx'

/** Injected face: same-origin API calls wrapped by apply. */
export interface PanelInjected {
  /** Fetch fresh state into the store. */
  refresh: () => void
  /** Run one mutation; apply updates the store (busy/error/state). */
  run: (action: Record<string, unknown>) => void
}

/** Full composed props of the panel registration. */
export type PanelProps =
  & PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createScrumStore>>
  & PanelInjected

const TABS: { view: ScrumView; label: string }[] = [
  { view: 'backlog', label: 'Backlog' },
  { view: 'board', label: 'Board' },
  { view: 'sprints', label: 'Sprints' },
]

/** Poll interval while the panel is open (model/tool changes appear live). */
const POLL_MS = 4000

/** The overlay panel. */
export function Panel(props: PanelProps) {
  const open = props.useStore(s => s.open)
  const view = props.useStore(s => s.view)
  const data = props.useStore(s => s.data)
  const error = props.useStore(s => s.error)
  const busy = props.useStore(s => s.busy)
  const { refresh } = props

  useEffect(() => {
    if (!open) return
    refresh()
    const timer = window.setInterval(refresh, POLL_MS)
    return () => { window.clearInterval(timer) }
  }, [open, refresh])

  if (!open) return null

  const close = () => { props.actions.setOpen(false) }
  const callbacks = { run: props.run, goToSprints: () => { props.actions.setView('sprints') } }

  return (
    <div
      className="scrum-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div className="scrum-panel">
        <div className="scrum-head">
          <h1>SCRUM</h1>
          <span className="scrum-sub">Release › Função › Componente › Tarefa</span>
          <div className="scrum-tabs">
            {TABS.map(tab => (
              <button
                key={tab.view}
                className={`scrum-tab${view === tab.view ? ' is-active' : ''}`}
                onClick={() => { props.actions.setView(tab.view) }}
              >{tab.label}</button>
            ))}
          </div>
          <span className="scrum-spacer" />
          <button className="scrum-tab" title="Atualizar" onClick={refresh}>⟳</button>
          <button className="scrum-close" title="Fechar" onClick={close}>✕</button>
        </div>
        {error !== null && <div className="scrum-error">{error}</div>}
        <div className={`scrum-body${busy ? ' scrum-busy' : ''}`}>
          {data === null
            ? <div className="scrum-empty">Carregando…</div>
            : view === 'backlog'
              ? <Tree state={data} callbacks={callbacks} />
              : view === 'board'
                ? <Board state={data} callbacks={callbacks} />
                : <Sprints state={data} callbacks={callbacks} />}
        </div>
      </div>
    </div>
  )
}
