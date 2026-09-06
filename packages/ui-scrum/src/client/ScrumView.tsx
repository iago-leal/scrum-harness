/**
 * The SCRUM conversation view: one entry in the `conversation.view` tab ring
 * (Chat · Trajectory · ▦ SCRUM). Carries the whole board — section tabs
 * (Backlog / Board / Sprints / Arquivo / Lixeira) over the view store's
 * fetched state — inline in the conversation area: no backdrop, no close
 * button, polling while mounted (the ring renders only the active view).
 * The board shown is the tab's own session workspace (falling back to the
 * most recent workspace, then the global board).
 * @module @scrum-harness/ui/client/ScrumView
 */

import { useEffect } from 'react'
import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the 'conversation.view' SlotMap row declared by ui-conversation.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { createScrumStore } from './store.ts'
import type { BoardLevel, ScrumView as SectionView } from './store.ts'
import { THEME_KEY } from './store.ts'
import { Board } from './Board.tsx'
import { resolveNode, WorkItemForm } from './Details.tsx'
import type { MermaidEngine } from './mermaid-engine.ts'
import type { RunOutcome } from './settle.ts'
import { Shelf } from './Shelf.tsx'
import { Sprints } from './Sprints.tsx'
import { Tree } from './Tree.tsx'

// The mutation outcome the work item form renders inline (comp-43 R5); it is
// produced by the pure settler and re-exported here beside the injected face.
export type { RunOutcome } from './settle.ts'

/** Injected face: same-origin API calls wrapped by apply. */
export interface ScrumViewInjected {
  /** Fetch fresh state of one workspace's board into the view store. */
  refresh: (workspace: string | null) => void
  /**
   * Run one mutation on one workspace's board; apply updates the store and
   * the promise answers the outcome (never rejects). Callers that only fire
   * (board drag, inline creation) keep ignoring it.
   */
  run: (action: Record<string, unknown>, workspace: string | null) => Promise<RunOutcome>
  /** The page's mermaid engine (comp-44 R7): built once in index.ts, rendered by the work item form. */
  engine: MermaidEngine
}

/** Minimal structural view of one workspace row (the wire type lives host-side). */
interface WorkspaceLike {
  id: string
  path?: string
  title?: string
}

/** Full composed props of the view registration. */
export type ScrumViewProps =
  & PropsRuntime<'conversation.view'>
  & PropsStore<ReturnType<typeof createScrumStore>>
  & ScrumViewInjected

const TABS: { view: SectionView; label: string }[] = [
  { view: 'backlog', label: 'Backlog' },
  { view: 'board', label: 'Board' },
  { view: 'sprints', label: 'Sprints' },
  { view: 'archive', label: 'Arquivo' },
  { view: 'trash', label: 'Lixeira' },
]

/** Poll interval while the view is mounted (model/tool changes appear live). */
const POLL_MS = 4000

/** The SCRUM tab body. */
export function ScrumView(props: ScrumViewProps) {
  const view = props.useStore(s => s.view)
  const data = props.useStore(s => s.data)
  const error = props.useStore(s => s.error)
  const busy = props.useStore(s => s.busy)
  const collapsed = props.useStore(s => s.collapsed)
  const selected = props.useStore(s => s.selected)
  const boardLevel = props.useStore(s => s.boardLevel)
  const swimlanes = props.useStore(s => s.swimlanes)
  const theme = props.useStore(s => s.theme)
  const { refresh, sessionId } = props

  /** Flip the color theme and persist the choice (storage may be unavailable). */
  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    props.actions.setTheme(next)
    try { localStorage.setItem(THEME_KEY, next) } catch { /* keep the in-memory flip */ }
  }

  // The board this tab shows: its own session's workspace, then the most
  // recent workspace, then the global fallback board.
  const sessionCwd = props.useSessions(s => s.byId[sessionId]?.cwd)
  const workspaces = props.useWorkspaces(s => s.items as readonly WorkspaceLike[])
  const recentId = props.useWorkspaces(s => s.recentWorkspaceId as string | undefined)
  const recent = workspaces.find(w => w.id === recentId)
  const wsPath = sessionCwd ?? recent?.path ?? null
  const wsTitle = wsPath === null
    ? null
    : workspaces.find(w => w.path === wsPath)?.title
      ?? wsPath.split('/').filter(part => part.length > 0).pop()
      ?? wsPath

  // The ring mounts only the active view, so "mounted" is the poll gate.
  useEffect(() => {
    refresh(wsPath)
    const timer = window.setInterval(() => { refresh(wsPath) }, POLL_MS)
    return () => { window.clearInterval(timer) }
  }, [refresh, wsPath])

  /** Run one mutation against the board this tab is showing (the form awaits the outcome). */
  const run = (action: Record<string, unknown>): Promise<RunOutcome> => props.run(action, wsPath)
  const callbacks = {
    run,
    goToSprints: () => { props.actions.setView('sprints') },
    openItem: (id: string) => { props.actions.setSelected(id) },
  }
  /** Store-backed viewing state of the backlog grid. */
  const treeUi = {
    collapsed,
    selected,
    toggle: (id: string) => { props.actions.toggleNode(id) },
    setCollapsed: (map: Record<string, boolean>) => { props.actions.setCollapsed(map) },
    select: (id: string | null) => { props.actions.setSelected(id) },
  }
  /** Store-backed viewing state of the board section. */
  const boardUi = {
    level: boardLevel,
    setLevel: (level: BoardLevel) => { props.actions.setBoardLevel(level) },
    swimlanes,
    setSwimlanes: (on: boolean) => { props.actions.setSwimlanes(on) },
  }
  /** The item open in the work item form, resolved against fresh state. */
  const selectedNode = data === null || selected === null ? null : resolveNode(data, selected)

  return (
    <div
      className="scrum-view"
      // Activates (and scopes) the Primer color theme of primer.ts: both
      // theme attributes stay set; data-color-mode picks which one lights up.
      data-color-mode={theme}
      data-light-theme="light"
      data-dark-theme="dark"
    >
      <div className="scrum-panel">
        <div className="scrum-head">
          <h1>SCRUM</h1>
          <span
            className="scrum-ws"
            title={wsPath ?? 'Quadro global (sessões sem workspace)'}
          >📁 {wsTitle ?? 'Global'}</span>
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
          <button
            className="scrum-tab"
            title={theme === 'light' ? 'Tema escuro' : 'Tema claro'}
            onClick={toggleTheme}
          >{theme === 'light' ? '🌙' : '☀️'}</button>
          <button className="scrum-tab" title="Atualizar" onClick={() => { refresh(wsPath) }}>⟳</button>
        </div>
        {error !== null && <div className="scrum-error">{error}</div>}
        <div className={`scrum-body${busy ? ' scrum-busy' : ''}`}>
          {data === null
            ? <div className="scrum-empty">Carregando…</div>
            : view === 'backlog'
              ? <Tree state={data} callbacks={callbacks} ui={treeUi} />
              : view === 'board'
                ? <Board state={data} callbacks={callbacks} ui={boardUi} />
                : view === 'archive' || view === 'trash'
                  ? <Shelf mode={view} state={data} callbacks={callbacks} />
                  : <Sprints state={data} callbacks={callbacks} />}
        </div>
        {selectedNode !== null && (
          <WorkItemForm
            node={selectedNode}
            run={run}
            onClose={() => { props.actions.setSelected(null) }}
            engine={props.engine}
            theme={theme}
            limits={data?.limits}
          />
        )}
      </div>
    </div>
  )
}
