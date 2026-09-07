/**
 * The SCRUM board in the AppFrame `details` column (comp-55 R2): the `side`
 * wrapper of ScrumPanel, registered at priority -1 while the side switch is
 * on (index.ts), shadowing ui-conversation's tool DetailsPanel. The column
 * never unmounts (closed = 0px), so the body polls by observed width, not by
 * mount (R4); the work item form stays a page-wide modal.
 * @module @scrum-harness/ui/client/ScrumSide
 */

import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the 'details' SlotMap row declared by ui-layout.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { createScrumStore } from './store.ts'
import { ScrumPanel } from './ScrumPanel.tsx'
import type { ScrumViewInjected } from './ScrumPanel.tsx'

/** Full composed props of the details registration. */
export type ScrumSideProps =
  & PropsRuntime<'details'>
  & PropsStore<ReturnType<typeof createScrumStore>>
  & ScrumViewInjected

/** The details-column occupant. */
export function ScrumSide(props: ScrumSideProps) {
  return <ScrumPanel {...props} mode="side" />
}
