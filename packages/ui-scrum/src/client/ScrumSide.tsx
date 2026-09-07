/**
 * The SCRUM board in the AppFrame `details` column (comp-55 R2): the
 * registration wrapper of ScrumPanel, registered at priority -1 while the
 * side switch is on (index.ts), shadowing ui-conversation's tool
 * DetailsPanel. The column never unmounts (closed = 0px), so the body polls
 * by observed width, not by mount (R4); the work item form stays a page-wide
 * modal. Since v0.23 this is the board's only seat.
 * @module @scrum-harness/ui/client/ScrumSide
 */

import { ScrumPanel } from './ScrumPanel.tsx'
import type { ScrumPanelProps } from './ScrumPanel.tsx'

/** Full composed props of the details registration. */
export type ScrumSideProps = ScrumPanelProps

/** The details-column occupant. */
export function ScrumSide(props: ScrumSideProps) {
  return <ScrumPanel {...props} />
}
