/**
 * The SCRUM board body, shared by its two mount points (comp-55 R2): the
 * ▦ SCRUM tab of the conversation view ring (`mode: 'tab'`) and the AppFrame
 * details column beside the chat (`mode: 'side'`). Section tabs (Backlog /
 * Board / Sprints / Arquivo / Lixeira) over the store's fetched state, the
 * work item form modal (page-wide from either mount point), and the poll:
 * "while mounted" in the tab (the ring mounts only the active view), "while
 * visible" in the column, which never unmounts (closed = 0px) — a
 * ResizeObserver on the root decides (R4). The board shown is the session's
 * own workspace (falling back to the most recent workspace, then the global
 * board). Props are typed by the intersection of the two runtime kits: the
 * owner props of the two slots differ, the session kit does not.
 * @module @scrum-harness/ui/client/ScrumPanel
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { GlobalStandardProps, PropsStore, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { createScrumStore } from './store.ts'
import type { BoardLevel, ScrumView as SectionView } from './store.ts'
import { Board } from './Board.tsx'
import { resolveNode, WorkItemForm } from './Details.tsx'
import type { MermaidEngine } from './mermaid-engine.ts'
import type { RunOutcome } from './settle.ts'
import { Shelf } from './Shelf.tsx'
import { nextSideAction, pollGate, sideTitle } from './side.ts'
import type { PanelMode, SideAction, SideState, Switch } from './side.ts'
import type { ScrumTheme } from './store.ts'
import { Sprints } from './Sprints.tsx'
import { Tree } from './Tree.tsx'

/** Injected face: same-origin API calls wrapped by apply, plus the page switches. */
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
  /** The side-column switch (comp-55 R1): page-level, transient. */
  side: Switch<SideState>
  /** The color theme (comp-55 R3): page-level, persisted. */
  theme: Switch<ScrumTheme>
  /** The one executor of the side gestures (comp-55 R5/R6). */
  runSide: (action: SideAction) => void
}

/** Minimal structural view of one workspace row (the wire type lives host-side). */
interface WorkspaceLike {
  id: string
  path?: string
  title?: string
}

/** Props of the shared body: the session + global kits, the store share, the face, and the mount mode. */
export type ScrumPanelProps =
  & SessionStandardProps
  & GlobalStandardProps
  & PropsStore<ReturnType<typeof createScrumStore>>
  & ScrumViewInjected
  & { mode: PanelMode }

const TABS: { view: SectionView; label: string }[] = [
  { view: 'backlog', label: 'Backlog' },
  { view: 'board', label: 'Board' },
  { view: 'sprints', label: 'Sprints' },
  { view: 'archive', label: 'Arquivo' },
  { view: 'trash', label: 'Lixeira' },
]

/** Poll interval while the gate is open (model/tool changes appear live). */
const POLL_MS = 4000

/** The board body at one mount point. */
export function ScrumPanel(props: ScrumPanelProps) {
  const { mode, refresh, sessionId, side } = props
  const view = props.useStore(s => s.view)
  const data = props.useStore(s => s.data)
  const error = props.useStore(s => s.error)
  const busy = props.useStore(s => s.busy)
  const collapsed = props.useStore(s => s.collapsed)
  const selected = props.useStore(s => s.selected)
  const boardLevel = props.useStore(s => s.boardLevel)
  const swimlanes = props.useStore(s => s.swimlanes)
  const theme = useSyncExternalStore(props.theme.subscribe, props.theme.get)
  const sideState = useSyncExternalStore(side.subscribe, side.get)

  /** Flip the color theme (the switch persists it; both mount points follow). */
  const toggleTheme = () => { props.theme.set(theme === 'light' ? 'dark' : 'light') }

  // The board this panel shows: its own session's workspace, then the most
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

  // R4: in the column the rendered width is the only truth about "open"
  // (ctx.layout exposes no read). The observer reports contentRect.width —
  // the root has neither padding nor border — and the tab has no observer.
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = rootRef.current
    if (el === null || mode !== 'side') return
    const observer = new ResizeObserver((entries) => { setWidth(entries[0]?.contentRect.width ?? 0) })
    observer.observe(el)
    return () => { observer.disconnect(); setWidth(0) }
  }, [mode])
  const gate = pollGate(mode, width)

  // Publish `visible` from the boolean gate only (the closing transition
  // fires dozens of observer callbacks); the cleanup zeroes it, so no orphan
  // `visible: true` survives an unmount or a session remount.
  useEffect(() => {
    if (mode !== 'side') return
    const current = side.get()
    if (current.visible !== gate) side.set({ on: current.on, visible: gate })
    return () => {
      const last = side.get()
      if (last.visible) side.set({ on: last.on, visible: false })
    }
  }, [gate, mode, side])

  // Fetch immediately when the gate opens, then poll while it stays open.
  useEffect(() => {
    if (!gate) return
    refresh(wsPath)
    const timer = window.setInterval(() => { refresh(wsPath) }, POLL_MS)
    return () => { window.clearInterval(timer) }
  }, [gate, refresh, wsPath])

  /** Run one mutation against the board this panel is showing (the form awaits the outcome). */
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
  /** Store-backed viewing state of the board section; the column stacks columns, so no lanes (R7). */
  const boardUi = {
    level: boardLevel,
    setLevel: (level: BoardLevel) => { props.actions.setBoardLevel(level) },
    swimlanes: mode === 'side' ? false : swimlanes,
    setSwimlanes: (on: boolean) => { props.actions.setSwimlanes(on) },
    lanesToggle: mode !== 'side',
  }
  /** The item open in the work item form, resolved against fresh state. */
  const selectedNode = data === null || selected === null ? null : resolveNode(data, selected)

  return (
    <div
      ref={rootRef}
      className={`scrum-view is-${mode}`}
      // Activates (and scopes) the Primer color theme of primer.ts: both
      // theme attributes stay set; data-color-mode picks which one lights up.
      data-color-mode={theme}
      data-light-theme="light"
      data-dark-theme="dark"
    >
      <div className="scrum-panel">
        <div className="scrum-head">
          {mode === 'tab' && <h1>SCRUM</h1>}
          <span
            className="scrum-ws"
            title={wsPath ?? 'Quadro global (sessões sem workspace)'}
          >📁 {wsTitle ?? 'Global'}</span>
          {mode === 'tab' && <span className="scrum-sub">Release › Função › Componente › Tarefa</span>}
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
          {mode === 'tab'
            ? (
              <button
                className={`scrum-tab${sideState.on ? ' is-on' : ''}`}
                title={sideTitle(sideState)}
                onClick={() => { props.runSide(nextSideAction(side.get())) }}
              >⇥ Ao lado</button>
            )
            : (
              // The × is "close", not "toggle": during the closing transition
              // nextSideAction would answer 'open' and a double click would
              // reopen (review r3 M1).
              <button
                className="scrum-tab"
                title="Fechar e devolver os detalhes de tool"
                onClick={() => { props.runSide('close') }}
              >×</button>
            )}
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
