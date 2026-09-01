/**
 * Shared viewing store of the SCRUM board: panel visibility, the active
 * section, and the last fetched wire state (shared by the sidebar button and
 * the overlay panel). Module exports the factory only; apply creates ONE
 * handle and passes it to both registrations.
 * @module @scrum-harness/ui/client/store
 */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { ScrumState } from './api.ts'

/** Panel sections. */
export type ScrumView = 'backlog' | 'board' | 'sprints'

/** Board viewing state. */
export interface ScrumViewState {
  /** Whether the overlay panel is open. */
  open: boolean
  /** Active panel section. */
  view: ScrumView
  /** Last fetched wire state; null before the first load. */
  data: ScrumState | null
  /** Last operation error, shown inline; null when clear. */
  error: string | null
  /** Whether a fetch/mutation is in flight. */
  busy: boolean
}

/**
 * Annotation twin of the actions literal (drift fails the defineStore call).
 * A `type`, not an `interface`: the ActionsDecl constraint is an index
 * signature, which only type literals satisfy implicitly.
 */
export type ScrumViewActions = {
  setOpen: (draft: ScrumViewState, open: boolean) => void
  setView: (draft: ScrumViewState, view: ScrumView) => void
  setData: (draft: ScrumViewState, data: ScrumState) => void
  setError: (draft: ScrumViewState, error: string | null) => void
  setBusy: (draft: ScrumViewState, busy: boolean) => void
}

/**
 * Create the board store handle.
 * @returns the store handle shared by the button and panel registrations.
 */
export function createScrumStore(): EngineStoreHandle<ScrumViewState, ScrumViewActions> {
  return defineStore({
    init: (): ScrumViewState => ({ open: false, view: 'backlog', data: null, error: null, busy: false }),
    actions: {
      setOpen: (d, open: boolean) => { d.open = open },
      setView: (d, view: ScrumView) => { d.view = view },
      setData: (d, data: ScrumState) => { d.data = data; d.error = null },
      setError: (d, error: string | null) => { d.error = error },
      setBusy: (d, busy: boolean) => { d.busy = busy },
    },
  })
}
