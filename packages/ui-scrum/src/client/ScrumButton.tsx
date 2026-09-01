/**
 * Sidebar foot action: the button that opens the SCRUM panel. Follows the
 * sidebar's wide/rail geometry through the owner share.
 * @module @scrum-harness/ui/client/ScrumButton
 */

import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge ('sidebar.footer.action').
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { createScrumStore } from './store.ts'

/** Full composed props of the button registration. */
export type ScrumButtonProps =
  & PropsRuntime<'sidebar.footer.action'>
  & PropsStore<ReturnType<typeof createScrumStore>>

/** The sidebar trigger. */
export function ScrumButton(props: ScrumButtonProps) {
  const open = props.useStore(s => s.open)
  return (
    <button
      className="scrum-fab"
      title="Quadro SCRUM"
      onClick={() => { props.actions.setOpen(!open) }}
    >
      <span className="scrum-fab-glyph">▦</span>
      {props.wide && <span>SCRUM</span>}
    </button>
  )
}
