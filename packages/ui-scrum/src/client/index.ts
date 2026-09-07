/**
 * Browser half of the SCRUM board plugin: injects the stylesheet and
 * registers the board at its mount points — the ▦ SCRUM tab in the
 * conversation view ring (`Chat · Trajectory · ▦ SCRUM`, v0.9) and, since
 * v0.22 (comp-55), the AppFrame `details` column beside the chat, toggled by
 * a page-level switch: while on (or still visible after a close), the plugin
 * shadows ui-conversation's tool DetailsPanel at priority -1; off, the
 * registration is disposed and the tool panel returns. Mutations funnel
 * through the injected `run` callback so busy/error handling lives here, not
 * in components.
 * @module @scrum-harness/ui/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only (the package is neither an external of build.mjs nor seeded by
// the shell): the `ctx.layout` merge on Context and the 'details' SlotMap row.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import mermaid from 'mermaid'
// The second synchronous act of comp-44 R7, on the statement right after the
// import: mermaid registers a `load` listener at import time that calls
// `run()` — a document-wide `.mermaid` sweep that REWRITES innerHTML — when
// `startOnLoad` is true (its default). Plugin bundles execute before `load`
// fires (async scripts delay it), so the flag must be off before the event,
// not at the deferred `initialize`. Plain writable property; no DOM, no chunk.
mermaid.startOnLoad = false
import { act, fetchState } from './api.ts'
import { createMermaidEngine } from './mermaid-engine.ts'
import { createScrumStore } from './store.ts'
import type { ScrumTheme } from './store.ts'
import { PRIMER_CSS } from './primer.ts'
import { ScrumView } from './ScrumView.tsx'
import type { ScrumViewInjected } from './ScrumView.tsx'
import { ScrumSide } from './ScrumSide.tsx'
import { SideAction } from './SideAction.tsx'
import { createSettler } from './settle.ts'
import type { SettleSink } from './settle.ts'
import { applySideAction, createSwitch, readTheme, shouldRegister, THEME_KEY } from './side.ts'
import type { SideAction as SideGesture, SideState, StorageLike } from './side.ts'
import type { Placement } from './drag.ts'
import { SCRUM_CSS } from './styles.ts'

export const name = 'ui-scrum'

/**
 * The one mermaid engine of the page (R7): `initialize` is deferred to the
 * first render, so constructing it here costs nothing and touches nothing.
 * `window.__scrumMermaid` exists only for the R11(8) sensor (the dogfood
 * reads `startOnLoad` and `mermaidAPI.getConfig()` from the console); no
 * code path uses it.
 */
const engine = createMermaidEngine({ document, mermaid })
;(window as unknown as { __scrumMermaid?: unknown }).__scrumMermaid = mermaid

/** localStorage, or null where it is unavailable (the switch stays in memory). */
function safeStorage(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Services this plugin composes through (`layout` opens/closes the details column). */
export const inject = ['slots', 'layout']

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

  // Page-level switches (comp-55 R1/R3): transient side state — reload =
  // off, mirroring the layout store — and the persisted color theme, shared
  // by every mount point so the tab and the column never disagree.
  const side = createSwitch<SideState>({ on: false, visible: false })
  const storage = safeStorage()
  const theme = createSwitch<ScrumTheme>(readTheme(storage), {
    persist: { key: THEME_KEY, storage, parse: raw => (raw === 'dark' ? 'dark' : 'light'), print: v => v },
  })
  // Where the user left the work item form (comp-56 R2): page-level, never
  // persisted (viewports differ across reloads), null = centered and modal.
  const placement = createSwitch<Placement | null>(null)

  /**
   * The one executor of the three gestures (R5/R6): state first (the
   * registration must exist before the column opens), then ctx.layout.
   * 'reopen' closes then opens so it is idempotent in both preference states.
   * @param action - the gesture decided by nextSideAction (or 'close' from the ×).
   */
  const runSide = (action: SideGesture): void => {
    side.set(applySideAction(side.get(), action))
    if (action === 'open') ctx.layout.openDetails()
    else if (action === 'reopen') { ctx.layout.closeDetails(); ctx.layout.openDetails() }
    else ctx.layout.closeDetails()
  }

  // One store handle mounts under exactly one scope, and two mount points
  // share by DATA (the /scrum-api routes), never by handle — see the 01/09
  // postmortem in the README. Both slots are session-scoped, so sharing one
  // handle would be allowed; the user chose two (independent section and
  // selection in the tab and in the column).
  const viewStore = createScrumStore()
  const sideStore = createScrumStore()

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
      // The engine rides the same seam as refresh/run (r6-M1). The renderer's
      // inject cache running this factory once per entry × session is exactly
      // right: the engine is a page singleton.
      engine,
      side,
      theme,
      runSide,
      placement,
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

  // The details column (comp-55 R1): the registration is an EFFECT of the
  // switch, never a step of the click. `sync` keeps at most one live
  // registration — present while on, or while the column is still visible
  // after a close (the tool panel must not flash through the 300ms closing
  // transition) — and the inject disposer tolerates a double dispose
  // (declaration collapse + sync).
  ctx.slots.inject('details', () => {
    let dispose: (() => void) | null = null
    const sync = () => {
      const want = shouldRegister(side.get())
      if (want && dispose === null) {
        dispose = ctx.slots.register({
          name: 'details',
          priority: -1,
          registrant: '@scrum-harness/ui (side)',
          store: sideStore,
          inject: (_sessionId, actions): ScrumViewInjected => wireFace(actions),
        }, ScrumSide)
      } else if (!want && dispose !== null) {
        dispose()
        dispose = null
      }
    }
    const off = side.subscribe(sync)
    sync()
    return () => {
      off()
      dispose?.()
      dispose = null
    }
  })

  // The «▦ SCRUM» capsule in the session header (comp-55 R6b): right-aligned
  // utilities, after the «Session log» capsule (order 0) — reachable from the
  // Chat tab, which is the point of the column.
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'scrum-side',
    order: 10,
    inject: () => ({ side, runSide }),
  }, SideAction))
}
