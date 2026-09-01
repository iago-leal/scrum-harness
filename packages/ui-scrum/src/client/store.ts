/**
 * Viewing store of the SCRUM board: the active section, the last fetched
 * wire state, and the color theme. Module exports the factory only; apply
 * creates the handle of the view-ring registration.
 * @module @scrum-harness/ui/client/store
 */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { ScrumState } from './api.ts'

/** Panel sections. */
export type ScrumView = 'backlog' | 'board' | 'sprints' | 'archive' | 'trash'

/** Backlog levels the Board section can pivot to (Azure-style level boards). */
export type BoardLevel = 'task' | 'component' | 'feature'

/** Color themes of the panel (Primer light/dark token sets). */
export type ScrumTheme = 'light' | 'dark'

/** localStorage key persisting the chosen theme across sessions. */
export const THEME_KEY = 'scrum-theme'

/** Read the persisted theme (defaults to light; storage may be unavailable). */
function savedTheme(): ScrumTheme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Board viewing state. */
export interface ScrumViewState {
  /** Active panel section. */
  view: ScrumView
  /** Last fetched wire state; null before the first load. */
  data: ScrumState | null
  /** Last operation error, shown inline; null when clear. */
  error: string | null
  /** Whether a fetch/mutation is in flight. */
  busy: boolean
  /** Backlog nodes explicitly collapsed (default: everything expanded). */
  collapsed: Record<string, boolean>
  /** Item open in the work item form modal; null when closed. */
  selected: string | null
  /** Which backlog level the Board section shows. */
  boardLevel: BoardLevel
  /** Whether the task board groups cards into swimlanes per component. */
  swimlanes: boolean
  /** Active color theme (persisted in localStorage by the toggle). */
  theme: ScrumTheme
}

/**
 * Annotation twin of the actions literal (drift fails the defineStore call).
 * A `type`, not an `interface`: the ActionsDecl constraint is an index
 * signature, which only type literals satisfy implicitly.
 */
export type ScrumViewActions = {
  setView: (draft: ScrumViewState, view: ScrumView) => void
  setData: (draft: ScrumViewState, data: ScrumState) => void
  setError: (draft: ScrumViewState, error: string | null) => void
  setBusy: (draft: ScrumViewState, busy: boolean) => void
  toggleNode: (draft: ScrumViewState, id: string) => void
  setCollapsed: (draft: ScrumViewState, collapsed: Record<string, boolean>) => void
  setSelected: (draft: ScrumViewState, selected: string | null) => void
  setBoardLevel: (draft: ScrumViewState, level: BoardLevel) => void
  setSwimlanes: (draft: ScrumViewState, on: boolean) => void
  setTheme: (draft: ScrumViewState, theme: ScrumTheme) => void
}

/**
 * Create the board store handle.
 * @returns the store handle of the view-ring registration (one instance per session).
 */
export function createScrumStore(): EngineStoreHandle<ScrumViewState, ScrumViewActions> {
  return defineStore({
    init: (): ScrumViewState => ({
      view: 'backlog', data: null, error: null, busy: false,
      collapsed: {}, selected: null, boardLevel: 'task', swimlanes: true,
      theme: savedTheme(),
    }),
    actions: {
      setView: (d, view: ScrumView) => { d.view = view },
      setData: (d, data: ScrumState) => { d.data = data; d.error = null },
      setError: (d, error: string | null) => { d.error = error },
      setBusy: (d, busy: boolean) => { d.busy = busy },
      toggleNode: (d, id: string) => {
        if (d.collapsed[id] === true) delete d.collapsed[id]
        else d.collapsed[id] = true
      },
      setCollapsed: (d, collapsed: Record<string, boolean>) => { d.collapsed = collapsed },
      setSelected: (d, selected: string | null) => { d.selected = selected },
      setBoardLevel: (d, level: BoardLevel) => { d.boardLevel = level },
      setSwimlanes: (d, on: boolean) => { d.swimlanes = on },
      setTheme: (d, theme: ScrumTheme) => { d.theme = theme },
    },
  })
}
