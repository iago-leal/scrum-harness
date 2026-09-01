/**
 * The full-screen SCRUM panel, registered into the layout's `shell.overlay`
 * list slot. Renders nothing while closed; while open it shows the section
 * tabs (Backlog / Board / Sprints) over the shared store's fetched state and
 * polls for fresh state so model-made changes appear without a manual reload.
 * Since v0.5 the panel is per-workspace: it follows the current session's
 * workspace (falling back to the most recent workspace, then to the global
 * board), shows it in the header, and sends it with every API call.
 * @module @scrum-harness/ui/client/Panel
 */

import { useEffect } from 'react'
import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createScrumStore } from './store.ts'
import type { BoardLevel, ScrumView } from './store.ts'
import { Board } from './Board.tsx'
import { resolveNode, WorkItemForm } from './Details.tsx'
import { Shelf } from './Shelf.tsx'
import { Sprints } from './Sprints.tsx'
import { Tree } from './Tree.tsx'

/** Injected face: same-origin API calls wrapped by apply. */
export interface PanelInjected {
  /** Fetch fresh state of one workspace's board into the store. */
  refresh: (workspace: string | null) => void
  /** Run one mutation on one workspace's board; apply updates the store. */
  run: (action: Record<string, unknown>, workspace: string | null) => void
}

/** Minimal structural view of one workspace row (the wire type lives host-side). */
interface WorkspaceLike {
  id: string
  path?: string
  title?: string
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
  { view: 'archive', label: 'Arquivo' },
  { view: 'trash', label: 'Lixeira' },
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
  const collapsed = props.useStore(s => s.collapsed)
  const selected = props.useStore(s => s.selected)
  const boardLevel = props.useStore(s => s.boardLevel)
  const swimlanes = props.useStore(s => s.swimlanes)
  const { refresh } = props

  // The board this panel shows: the current session's workspace, then the
  // most recent workspace, then the global fallback board.
  const sessionCwd = props.useSessions(s => (s.current !== undefined ? s.byId[s.current]?.cwd : undefined))
  const workspaces = props.useWorkspaces(s => s.items as readonly WorkspaceLike[])
  const recentId = props.useWorkspaces(s => s.recentWorkspaceId as string | undefined)
  const recent = workspaces.find(w => w.id === recentId)
  const wsPath = sessionCwd ?? recent?.path ?? null
  const wsTitle = wsPath === null
    ? null
    : workspaces.find(w => w.path === wsPath)?.title
      ?? wsPath.split('/').filter(part => part.length > 0).pop()
      ?? wsPath

  useEffect(() => {
    if (!open) return
    refresh(wsPath)
    const timer = window.setInterval(() => { refresh(wsPath) }, POLL_MS)
    return () => { window.clearInterval(timer) }
  }, [open, refresh, wsPath])

  if (!open) return null

  const close = () => { props.actions.setOpen(false) }
  /** Run one mutation against the board this panel is showing. */
  const run = (action: Record<string, unknown>) => { props.run(action, wsPath) }
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
      className="scrum-overlay"
      // Activates (and scopes) the Primer color theme of primer.ts.
      data-color-mode="light"
      data-light-theme="light"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
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
          <button className="scrum-tab" title="Atualizar" onClick={() => { refresh(wsPath) }}>⟳</button>
          <button className="scrum-close" title="Fechar" onClick={close}>✕</button>
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
          />
        )}
      </div>
    </div>
  )
}
