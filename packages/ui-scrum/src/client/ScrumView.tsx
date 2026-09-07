/**
 * The SCRUM conversation view: one entry in the `conversation.view` tab ring
 * (Chat · Trajectory · ▦ SCRUM). Since v0.22 (comp-55) the body lives in
 * ScrumPanel (shared with the details column); this is the `tab` wrapper —
 * inline in the conversation area, no backdrop, no close button, polling
 * while mounted (the ring renders only the active view).
 * @module @scrum-harness/ui/client/ScrumView
 */

import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the 'conversation.view' SlotMap row declared by ui-conversation.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { createScrumStore } from './store.ts'
import { ScrumPanel } from './ScrumPanel.tsx'
import type { ScrumViewInjected } from './ScrumPanel.tsx'

// The injected face is declared beside the body it feeds (ScrumPanel) and
// re-exported here with the mutation outcome (comp-43 R5) for index.ts.
export type { ScrumViewInjected } from './ScrumPanel.tsx'
export type { RunOutcome } from './settle.ts'

/** Full composed props of the view registration. */
export type ScrumViewProps =
  & PropsRuntime<'conversation.view'>
  & PropsStore<ReturnType<typeof createScrumStore>>
  & ScrumViewInjected

/** The SCRUM tab body. */
export function ScrumView(props: ScrumViewProps) {
  return <ScrumPanel {...props} mode="tab" />
}
