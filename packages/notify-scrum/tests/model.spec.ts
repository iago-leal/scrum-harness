/**
 * Unit tests of the pure decision (R1, R2, R3, R4, R5, R8, R9, R11). No
 * storage, no Context, no clock, no operating system: `decide` is total over
 * hand-built events and contexts, so every case here is a plain function call.
 */

import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  ASKING_TOOLS,
  DEDUP_WINDOW_MS,
  FIELD_CAP,
  NON_NOTIFYING_TURN_END,
  REASON_SOUND,
  REASON_SUBTITLE,
  TITLE,
  decide,
} from '../src/model.ts'
import type { NotifyContext, NotifyReason } from '../src/model.ts'

/** A live-root context with nothing fired yet — the permissive baseline. */
function baseContext(over: Partial<NotifyContext> = {}): NotifyContext {
  return {
    now: 1_000_000,
    isRoot: true,
    sessionId: 'abcdef0123456789',
    config: {},
    lastFiredAt: {},
    ...over,
  }
}

/** Build a session event envelope; `data` is whatever that type carries. */
function event(type: string, data: unknown = {}): SessionEvent {
  return { type, seq: 1, time: 0, data } as unknown as SessionEvent
}

const approvalAsked = event('approval/asked', { callId: 'c1', tool: 'bash' })
const turnEnd = (kind: string) => event('turn/end', { turn: 1, reason: { kind } })
const toolCall = (name: string) =>
  event('tool/call', { turn: 1, step: 1, callId: 'c1', name, arguments: '{}' })

describe('R1 — three triggers, and only them', () => {
  it('approval/asked notifies with reason approval', () => {
    const plan = decide(approvalAsked, baseContext())
    expect(plan?.reason).toBe('approval')
  })

  it('every asking tool notifies with reason question', () => {
    for (const name of ASKING_TOOLS) {
      expect(decide(toolCall(name), baseContext())?.reason).toBe('question')
    }
  })

  it('names the two tools that block on the human', () => {
    expect([...ASKING_TOOLS].sort()).toEqual(['ask_user_question', 'exit_plan_mode'])
  })

  it('turn/end notifies with reason turn-end', () => {
    expect(decide(turnEnd('completed'), baseContext())?.reason).toBe('turn-end')
  })

  it('a tool/call outside the set is ignored', () => {
    for (const name of ['bash', 'read', 'write', 'subagent', 'ask_user', '']) {
      expect(decide(toolCall(name), baseContext())).toBeNull()
    }
  })

  it('every other event type is ignored', () => {
    const ignored = [
      'approval/decided',
      'approval/policy',
      'tool/result',
      'turn/start',
      'step/start',
      'step/end',
      'assistant/chunk',
      'assistant/message',
      'user/message',
      'session/title',
    ]
    for (const type of ignored) {
      expect(decide(event(type, { turn: 1, step: 1 }), baseContext())).toBeNull()
    }
  })
})

describe('R2 — the decision is pure and total', () => {
  it('the same pair always yields the same result', () => {
    const context = baseContext()
    const first = decide(approvalAsked, context)
    const second = decide(approvalAsked, context)
    expect(second).toEqual(first)
  })

  it('mutates neither the event nor the context', () => {
    const context = baseContext({ cwd: '/tmp/projeto' })
    const contextBefore = structuredClone(context)
    const eventBefore = structuredClone(approvalAsked)
    decide(approvalAsked, context)
    expect(context).toEqual(contextBefore)
    expect(approvalAsked).toEqual(eventBefore)
  })

  it('keeps no state between calls: a repeat with an unchanged clock still fires', () => {
    // Nothing was recorded in lastFiredAt, so the window cannot have closed —
    // proving the window lives in the caller's context, not in the Model.
    const context = baseContext()
    expect(decide(approvalAsked, context)).not.toBeNull()
    expect(decide(approvalAsked, context)).not.toBeNull()
  })
})

describe('R3 — the notice identifies the session and the reason', () => {
  it('carries the house title and the reason in human language', () => {
    const plan = decide(approvalAsked, baseContext())
    expect(plan?.title).toBe(TITLE)
    expect(plan?.subtitle).toBe(REASON_SUBTITLE.approval)
  })

  it('every reason has its own subtitle', () => {
    const subtitles = Object.values(REASON_SUBTITLE)
    expect(new Set(subtitles).size).toBe(subtitles.length)
  })

  it('prefers the session title', () => {
    const plan = decide(approvalAsked, baseContext({ sessionTitle: 'Ajustar o parser', cwd: '/tmp/projeto' }))
    expect(plan?.body).toBe('Ajustar o parser')
  })

  it('falls back to the basename of cwd when there is no title', () => {
    const plan = decide(approvalAsked, baseContext({ cwd: '/Users/ana/HARNESS/scrum-harness' }))
    expect(plan?.body).toBe('scrum-harness')
  })

  it('ignores a trailing slash on cwd', () => {
    const plan = decide(approvalAsked, baseContext({ cwd: '/tmp/projeto/' }))
    expect(plan?.body).toBe('projeto')
  })

  it('falls back to the head of the session id when both are absent', () => {
    const plan = decide(approvalAsked, baseContext({ sessionId: 'abcdef0123456789' }))
    expect(plan?.body).toBe('abcdef01')
  })

  it('treats a whitespace-only title as absent and cascades', () => {
    const plan = decide(approvalAsked, baseContext({ sessionTitle: '   ', cwd: '/tmp/projeto' }))
    expect(plan?.body).toBe('projeto')
  })

  it('treats a whitespace-only cwd as absent and cascades to the id', () => {
    const plan = decide(approvalAsked, baseContext({ sessionTitle: '  ', cwd: '  ' }))
    expect(plan?.body).toBe('abcdef01')
  })

  it('never produces an empty field', () => {
    const plan = decide(approvalAsked, baseContext({ sessionTitle: '', cwd: '' }))
    expect(plan?.title).not.toBe('')
    expect(plan?.subtitle).not.toBe('')
    expect(plan?.body).not.toBe('')
  })

  it('cuts an over-long field at the cap, counting code points', () => {
    const plan = decide(approvalAsked, baseContext({ sessionTitle: 'a'.repeat(500) }))
    expect(Array.from(plan?.body ?? '')).toHaveLength(FIELD_CAP)
    expect(plan?.body.endsWith('…')).toBe(true)
  })

  it('counts an emoji as one code point, not two', () => {
    // 120 emoji are exactly at the cap: no cut, and no surrogate is split.
    const title = '🎉'.repeat(FIELD_CAP)
    const plan = decide(approvalAsked, baseContext({ sessionTitle: title }))
    expect(plan?.body).toBe(title)
    expect(plan?.body.endsWith('…')).toBe(false)
  })

  it('cuts a long emoji run without splitting a surrogate pair', () => {
    const plan = decide(approvalAsked, baseContext({ sessionTitle: '🎉'.repeat(FIELD_CAP + 10) }))
    const points = Array.from(plan?.body ?? '')
    expect(points).toHaveLength(FIELD_CAP)
    expect(points.every((point) => point === '🎉' || point === '…')).toBe(true)
  })
})

describe('R4 — each reason has its sound', () => {
  it('uses Glass while the agent is blocked and Tink at the end of a turn', () => {
    expect(decide(approvalAsked, baseContext())?.sound).toBe('Glass')
    expect(decide(toolCall('ask_user_question'), baseContext())?.sound).toBe('Glass')
    expect(decide(turnEnd('completed'), baseContext())?.sound).toBe('Tink')
  })

  it('names only macOS system sounds', () => {
    for (const sound of Object.values(REASON_SOUND)) {
      expect(sound).toMatch(/^[A-Za-z]+$/)
    }
  })
})

describe('R5 — only the live root makes noise', () => {
  it('a non-root session never notifies, whatever the trigger', () => {
    const context = baseContext({ isRoot: false })
    expect(decide(approvalAsked, context)).toBeNull()
    expect(decide(toolCall('ask_user_question'), context)).toBeNull()
    expect(decide(turnEnd('completed'), context)).toBeNull()
  })
})

describe('R8 — configurable silence', () => {
  it('enabled: false silences every trigger', () => {
    const context = baseContext({ config: { enabled: false } })
    expect(decide(approvalAsked, context)).toBeNull()
    expect(decide(toolCall('exit_plan_mode'), context)).toBeNull()
    expect(decide(turnEnd('completed'), context)).toBeNull()
  })

  it('enabled: true is the same as absent', () => {
    expect(decide(approvalAsked, baseContext({ config: { enabled: true } }))).not.toBeNull()
  })

  it('an absent allowlist enables all three reasons', () => {
    const context = baseContext({ config: {} })
    expect(decide(approvalAsked, context)).not.toBeNull()
    expect(decide(toolCall('ask_user_question'), context)).not.toBeNull()
    expect(decide(turnEnd('completed'), context)).not.toBeNull()
  })

  it('an empty allowlist silences all three', () => {
    const context = baseContext({ config: { reasons: [] } })
    expect(decide(approvalAsked, context)).toBeNull()
    expect(decide(toolCall('ask_user_question'), context)).toBeNull()
    expect(decide(turnEnd('completed'), context)).toBeNull()
  })

  it('a partial allowlist keeps only what it names', () => {
    const context = baseContext({ config: { reasons: ['approval'] } })
    expect(decide(approvalAsked, context)).not.toBeNull()
    expect(decide(toolCall('ask_user_question'), context)).toBeNull()
    expect(decide(turnEnd('completed'), context)).toBeNull()
  })

  it('ignores an unknown entry without invalidating the list', () => {
    const context = baseContext({ config: { reasons: ['approval', 'banana', ''] } })
    expect(decide(approvalAsked, context)).not.toBeNull()
    expect(decide(turnEnd('completed'), context)).toBeNull()
  })

  it('a list of only unknown entries silences everything', () => {
    const context = baseContext({ config: { reasons: ['banana'] } })
    expect(decide(approvalAsked, context)).toBeNull()
  })
})

describe('R9 — no notification storm', () => {
  it('stays silent inside the window', () => {
    const context = baseContext({ now: 1000, lastFiredAt: { approval: 1000 - (DEDUP_WINDOW_MS - 1) } })
    expect(decide(approvalAsked, context)).toBeNull()
  })

  it('fires exactly at the edge of the window', () => {
    const context = baseContext({ now: 1_000_000, lastFiredAt: { approval: 1_000_000 - DEDUP_WINDOW_MS } })
    expect(decide(approvalAsked, context)).not.toBeNull()
  })

  it('fires beyond the window', () => {
    const context = baseContext({ now: 1_000_000, lastFiredAt: { approval: 1 } })
    expect(decide(approvalAsked, context)).not.toBeNull()
  })

  it('fires when nothing was recorded for that reason', () => {
    const context = baseContext({ now: 1_000_000, lastFiredAt: { 'turn-end': 1_000_000 } })
    expect(decide(approvalAsked, context)).not.toBeNull()
  })

  it('the window is per reason: a fresh approval does not silence a turn-end', () => {
    const context = baseContext({ now: 1_000_000, lastFiredAt: { approval: 999_999 } })
    expect(decide(approvalAsked, context)).toBeNull()
    expect(decide(turnEnd('completed'), context)).not.toBeNull()
  })
})

describe('R11 — turn/end reports a live turn, not a rebuilt dead one', () => {
  it('stays silent for every non-notifying kind', () => {
    for (const kind of NON_NOTIFYING_TURN_END) {
      expect(decide(turnEnd(kind), baseContext())).toBeNull()
    }
  })

  it('interrupted is the denied kind', () => {
    expect([...NON_NOTIFYING_TURN_END]).toEqual(['interrupted'])
  })

  it('every other documented kind notifies', () => {
    for (const kind of ['completed', 'aborted', 'blocked', 'error', 'max-tokens']) {
      expect(decide(turnEnd(kind), baseContext())?.reason).toBe('turn-end')
    }
  })

  it('a kind added later by a plugin notifies by default', () => {
    expect(decide(turnEnd('some-future-kind'), baseContext())?.reason).toBe('turn-end')
  })
})

describe('the cuts compose', () => {
  it('a disabled plugin outranks every other condition', () => {
    const context = baseContext({ isRoot: true, config: { enabled: false }, lastFiredAt: {} })
    expect(decide(approvalAsked, context)).toBeNull()
  })

  it('a plan is only built once every cut has passed', () => {
    const reasons: NotifyReason[] = ['approval', 'question', 'turn-end']
    const context = baseContext({ config: { reasons } })
    const plan = decide(approvalAsked, context)
    expect(plan).toEqual({
      reason: 'approval',
      title: TITLE,
      subtitle: REASON_SUBTITLE.approval,
      body: 'abcdef01',
      sound: REASON_SOUND.approval,
    })
  })
})
