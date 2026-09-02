/**
 * Ordering of wire results into the view store (comp-43 R5, review round 2
 * M1/M3). Every call gets a monotonic ticket AT DISPATCH; `applied` is the
 * highest MUTATION ticket whose state reached `setData`; any result — a
 * fetch or a mutation — with a ticket below `applied` is discarded (a newer
 * mutation already brought a fresher tree). A discarded mutation still
 * answers its caller. `mutate` resolves to a `RunOutcome` and never rejects;
 * `busy` is the count of calls in flight, so it only turns off when the last
 * one settles. Pure module (no React): `tests/settle.spec.ts` proves it.
 *
 * Known limit: responses that cross each other in the server's write chain
 * may carry residual state; the next poll (≤ 4s) corrects it. No merge.
 * @module @scrum-harness/ui/client/settle
 */

import type { ScrumState } from './api.ts'

/** What a mutation answers to the caller that wants to know (the form). */
export type RunOutcome = { ok: true } | { ok: false; message: string }

/** The store actions the settler feeds. */
export interface SettleSink {
  setData: (state: ScrumState) => void
  setError: (error: string | null) => void
  setBusy: (busy: boolean) => void
}

/** The two entry points wireFace exposes. */
export interface Settler {
  /** A read (poll / ⟳): applied only if no newer mutation has settled since it was dispatched. */
  fetch: (work: Promise<ScrumState>) => Promise<void>
  /** A mutation: applied unless a newer one already settled; always answers, never rejects. */
  mutate: (work: Promise<ScrumState>) => Promise<RunOutcome>
}

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

/**
 * Create one settler over one bound store.
 * @param sink - the store actions.
 * @returns fetch / mutate.
 */
export function createSettler(sink: SettleSink): Settler {
  let ticket = 0
  let applied = 0
  let inflight = 0

  const start = (): number => {
    inflight += 1
    sink.setBusy(true)
    return ++ticket
  }
  const finish = (): void => {
    inflight -= 1
    if (inflight === 0) sink.setBusy(false)
  }

  return {
    async fetch(work) {
      const mine = start()
      try {
        const state = await work
        if (mine > applied) sink.setData(state)
      } catch (error) {
        sink.setError(messageOf(error))
      } finally {
        finish()
      }
    },
    async mutate(work) {
      const mine = start()
      try {
        const state = await work
        if (mine > applied) {
          applied = mine
          sink.setData(state)
        }
        return { ok: true }
      } catch (error) {
        const message = messageOf(error)
        sink.setError(message)
        return { ok: false, message }
      } finally {
        finish()
      }
    },
  }
}
