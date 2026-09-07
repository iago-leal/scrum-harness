/**
 * The «▦ SCRUM» capsule in the session header (comp-55 R6b): one entry of
 * `conversation.session.header.utilities`, after the «Session log» capsule,
 * reachable from the Chat tab without leaving it. It reads the page-level
 * side switch and dispatches the gesture `nextSideAction` decides; the
 * pressed state reflects the switch, not the column (under the layout's
 * concession the click is inert by contract, R9f). It lives outside the
 * panel's Primer wrapper, so it speaks the shell's own tokens
 * (`.scrum-capsule` in styles.ts).
 * @module @scrum-harness/ui/client/SideAction
 */

import { useSyncExternalStore } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the 'conversation.session.header.utilities' SlotMap row.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { nextSideAction, sideTitle } from './side.ts'
import type { SideAction as SideGesture, SideState, Switch } from './side.ts'

/** Injected face of the capsule: the switch to read and the executor to call. */
export interface SideActionInjected {
  side: Switch<SideState>
  runSide: (action: SideGesture) => void
}

/** Full composed props of the header-utility registration. */
export type SideActionProps = PropsRuntime<'conversation.session.header.utilities'> & SideActionInjected

/** The capsule. */
export function SideAction({ side, runSide }: SideActionProps) {
  const state = useSyncExternalStore(side.subscribe, side.get)
  return (
    <button
      type="button"
      className={`scrum-capsule${state.on ? ' is-on' : ''}`}
      aria-pressed={state.on}
      title={sideTitle(state)}
      onClick={() => { runSide(nextSideAction(side.get())) }}
    >▦ SCRUM</button>
  )
}
