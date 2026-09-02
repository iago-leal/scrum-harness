/**
 * Ordering of wire results into the view store (comp-43 R5, review round 2
 * M1/M3): a settler hands out a monotonic ticket AT DISPATCH, keeps the
 * watermark `applied` (the highest MUTATION ticket that reached setData) and
 * drops any result — fetch or mutation — older than it. `mutate` resolves to
 * a RunOutcome and never rejects; `busy` is a count of calls in flight.
 * Written BEFORE the implementation (TDD); pure module, no React.
 */
import { describe, expect, it } from 'vitest'
import type { ScrumState } from '../src/client/api.ts'
import { createSettler } from '../src/client/settle.ts'
import type { RunOutcome, SettleSink } from '../src/client/settle.ts'

/** A promise whose settlement the test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** A distinguishable fake state (the settler never looks inside). */
const state = (tag: string): ScrumState => ({ tag } as unknown as ScrumState)

/** A recording sink. */
function sink() {
  const calls: string[] = []
  const face: SettleSink = {
    setData: (s) => { calls.push(`data:${(s as unknown as { tag: string }).tag}`) },
    setError: (e) => { calls.push(`error:${e ?? 'null'}`) },
    setBusy: (b) => { calls.push(`busy:${b}`) },
  }
  return { calls, face }
}

/** Let every settled microtask run. */
const flush = () => new Promise<void>(resolve => { setTimeout(resolve, 0) })

describe('createSettler (R5)', () => {
  it('applies a fetch and a mutation in the simple case, busy on then off', async () => {
    const { calls, face } = sink()
    const s = createSettler(face)
    const f = deferred<ScrumState>()
    void s.fetch(f.promise)
    f.resolve(state('a'))
    await flush()
    expect(calls).toEqual(['busy:true', 'data:a', 'busy:false'])
    const m = deferred<ScrumState>()
    const outcome = s.mutate(m.promise)
    m.resolve(state('b'))
    expect(await outcome).toEqual({ ok: true })
    expect(calls.slice(3)).toEqual(['busy:true', 'data:b', 'busy:false'])
  })

  it('r1 M1: a poll dispatched BEFORE a mutation and resolved AFTER it is discarded', async () => {
    const { calls, face } = sink()
    const s = createSettler(face)
    const poll = deferred<ScrumState>()
    void s.fetch(poll.promise)          // ticket 1
    const m = deferred<ScrumState>()
    const outcome = s.mutate(m.promise) // ticket 2
    m.resolve(state('fresh'))
    expect(await outcome).toEqual({ ok: true })
    poll.resolve(state('stale'))
    await flush()
    expect(calls.filter(c => c.startsWith('data:'))).toEqual(['data:fresh'])
  })

  it('a poll dispatched AFTER the mutation is applied even if it resolves later', async () => {
    const { calls, face } = sink()
    const s = createSettler(face)
    const m = deferred<ScrumState>()
    const outcome = s.mutate(m.promise) // ticket 1
    const poll = deferred<ScrumState>()
    void s.fetch(poll.promise)          // ticket 2
    m.resolve(state('m'))
    await outcome
    poll.resolve(state('p'))
    await flush()
    expect(calls.filter(c => c.startsWith('data:'))).toEqual(['data:m', 'data:p'])
  })

  it('r2 M1: an older mutation resolved after a newer one is discarded but still answers { ok: true }', async () => {
    const { calls, face } = sink()
    const s = createSettler(face)
    const old = deferred<ScrumState>()
    const oldOutcome = s.mutate(old.promise) // ticket 1 (e.g. the form's advance)
    const recent = deferred<ScrumState>()
    const recentOutcome = s.mutate(recent.promise) // ticket 2 (e.g. a board drag)
    recent.resolve(state('recent'))
    expect(await recentOutcome).toEqual({ ok: true })
    old.resolve(state('old'))
    expect(await oldOutcome).toEqual({ ok: true })
    expect(calls.filter(c => c.startsWith('data:'))).toEqual(['data:recent'])
  })

  it('a refusal answers { ok: false, message } with the literal message and sets the global error; never rejects', async () => {
    const { calls, face } = sink()
    const s = createSettler(face)
    const m = deferred<ScrumState>()
    const outcome = s.mutate(m.promise)
    const message = 'comp-43: `requirements` is empty; `requirementsReview` is empty — cannot advance from requirements to design'
    m.reject(new Error(message))
    const result: RunOutcome = await outcome
    expect(result).toEqual({ ok: false, message })
    expect(calls).toEqual(['busy:true', `error:${message}`, 'busy:false'])
  })

  it('a non-Error rejection is stringified; a failing fetch only sets the error', async () => {
    const { calls, face } = sink()
    const s = createSettler(face)
    const m = deferred<ScrumState>()
    const outcome = s.mutate(m.promise)
    m.reject('boom')
    expect(await outcome).toEqual({ ok: false, message: 'boom' })
    const f = deferred<ScrumState>()
    void s.fetch(f.promise)
    f.reject(new Error('GET state failed (500)'))
    await flush()
    expect(calls.filter(c => c.startsWith('error:'))).toEqual(['error:boom', 'error:GET state failed (500)'])
    expect(calls.filter(c => c.startsWith('data:'))).toEqual([])
  })

  it('busy is a count: it only turns off when the LAST call in flight settles', async () => {
    const { calls, face } = sink()
    const s = createSettler(face)
    const a = deferred<ScrumState>()
    const b = deferred<ScrumState>()
    void s.fetch(a.promise)
    const outcome = s.mutate(b.promise)
    expect(calls.filter(c => c.startsWith('busy:'))).toEqual(['busy:true', 'busy:true'])
    a.resolve(state('a'))
    await flush()
    expect(calls.filter(c => c.startsWith('busy:'))).toEqual(['busy:true', 'busy:true'])
    b.resolve(state('b'))
    await outcome
    await flush()
    expect(calls.filter(c => c.startsWith('busy:'))).toEqual(['busy:true', 'busy:true', 'busy:false'])
  })

  it('a discarded fetch never raises the watermark: a later mutation still applies', async () => {
    const { calls, face } = sink()
    const s = createSettler(face)
    const poll = deferred<ScrumState>()
    void s.fetch(poll.promise)          // 1
    const m1 = deferred<ScrumState>()
    const o1 = s.mutate(m1.promise)     // 2
    m1.resolve(state('m1'))
    await o1
    poll.resolve(state('poll'))          // discarded (1 < 2)
    await flush()
    const m2 = deferred<ScrumState>()
    const o2 = s.mutate(m2.promise)     // 3
    m2.resolve(state('m2'))
    await o2
    expect(calls.filter(c => c.startsWith('data:'))).toEqual(['data:m1', 'data:m2'])
  })
})
