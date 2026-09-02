/**
 * Browser half of the SCRUM board plugin: injects the stylesheet and
 * registers the ▦ SCRUM tab into the conversation view ring (`Chat ·
 * Trajectory · ▦ SCRUM`). Mutations funnel through the injected `run`
 * callback so busy/error handling lives here, not in components. Until v0.8
 * the board was a sidebar button + full-screen overlay; since v0.9 the tab
 * is the only surface.
 * @module @scrum-harness/ui/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { act, fetchState } from './api.ts'
import { createScrumStore } from './store.ts'
import { PRIMER_CSS } from './primer.ts'
import { ScrumView } from './ScrumView.tsx'
import type { ScrumViewInjected } from './ScrumView.tsx'
import { createSettler } from './settle.ts'
import type { SettleSink } from './settle.ts'
import { SCRUM_CSS } from './styles.ts'

export const name = 'ui-scrum'

/** Services this plugin composes through. */
export const inject = ['slots']

/**
 * Register the SCRUM surfaces.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = '@scrum-harness/ui'
    // Tokens first, then our sheet: the board styles consume var(--…) freely.
    tag.textContent = `${PRIMER_CSS}\n${SCRUM_CSS}`
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'ui-scrum: stylesheet')

  // One store handle mounts under exactly one scope: this one lives in the
  // session scope of the view ring (an instance per session). Anything else
  // wanting the same data shares by DATA (the /scrum-api routes), never by
  // handle — see the 01/09 postmortem in the README.
  const viewStore = createScrumStore()

  /**
   * Wrap the wire calls with busy/error handling against one bound store.
   * Since v0.19 (comp-43 R5) the ordering lives in the pure settler: results
   * older than the last settled mutation are dropped, and `run` answers a
   * RunOutcome the work item form renders inline (it never rejects).
   * @param actions - bound actions of the store instance to settle into.
   */
  const wireFace = (actions: SettleSink): ScrumViewInjected => {
    const settler = createSettler(actions)
    return {
      refresh: (workspace) => { void settler.fetch(fetchState(workspace)) },
      run: (action, workspace) => settler.mutate(act(action, workspace)),
    }
  }

  // The SCRUM tab in the conversation view ring (chat: 0, trajectory: 10).
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'scrum',
    order: 20,
    label: () => '▦ SCRUM',
    store: viewStore,
    inject: (_sessionId, actions): ScrumViewInjected => wireFace(actions),
  }, ScrumView))
}
