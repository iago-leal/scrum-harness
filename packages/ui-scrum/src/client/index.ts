/**
 * Browser half of the SCRUM board plugin: injects the stylesheet, creates the
 * ONE shared store handle, and registers the sidebar trigger plus the overlay
 * panel into their layout-owned list slots. Mutations funnel through the
 * injected `run` callback so busy/error handling lives here, not in
 * components.
 * @module @scrum-harness/ui/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the SlotMap merges for the target slots.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { act, fetchState } from './api.ts'
import { createScrumStore } from './store.ts'
import { Panel } from './Panel.tsx'
import type { PanelInjected } from './Panel.tsx'
import { PRIMER_CSS } from './primer.ts'
import { ScrumButton } from './ScrumButton.tsx'
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

  const store = createScrumStore()

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'scrum-board',
    store,
  }, ScrumButton))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'scrum-board',
    store,
    inject: (actions): PanelInjected => {
      /** Apply one settled wire result into the store. */
      const settle = (work: Promise<import('./api.ts').ScrumState>): void => {
        actions.setBusy(true)
        work
          .then((state) => { actions.setData(state) })
          .catch((error: unknown) => {
            actions.setError(error instanceof Error ? error.message : String(error))
          })
          .finally(() => { actions.setBusy(false) })
      }
      return {
        refresh: (workspace) => { settle(fetchState(workspace)) },
        run: (action, workspace) => { settle(act(action, workspace)) },
      }
    },
  }, Panel))
}
