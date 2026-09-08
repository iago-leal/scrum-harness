/**
 * Tests of the Controller (R3 resolution, R5 bridge, R7 resilience, R9
 * bookkeeping, R12 shape) plus the package wire. Stub registry, in-memory
 * notifier, manual clock: no process, no operating system, no noise.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import * as NotifyScrum from '../src/index.ts'
import {
  createSessionDisposedListener,
  createSessionEventListener,
  normalizeConfig,
} from '../src/plugin.ts'
import type { FiredWindow, ListenerDeps } from '../src/plugin.ts'
import type { NotifyPlan } from '../src/model.ts'

/** A notifier that records instead of rendering. */
function memoryNotifier() {
  const plans: NotifyPlan[] = []
  return { plans, notify: (plan: NotifyPlan) => void plans.push(plan) }
}

/** A stub session: the exact subset the listener reads. */
function sessionStub(over: { id?: string; cwd?: string; events?: unknown[] } = {}): Session {
  return {
    id: over.id ?? 'sessao-raiz-0001',
    header: { cwd: over.cwd },
    events: over.events ?? [],
  } as unknown as Session
}

/** A stub registry where `roots` holds the ids that count as runtime roots. */
function agentsStub(roots: string[], known: string[] = roots) {
  const agents = new Map(known.map((id) => [id, { id }]))
  return {
    get: (id: string) => agents.get(id),
    roots: () => roots.map((id) => agents.get(id)).filter((agent) => agent !== undefined),
  }
}

/**
 * A `session/title` event exactly as the log records it: `foldSessionTitle`
 * copies `messageSeqs` and the `source`, so a stub missing either would throw
 * rather than fold.
 */
function titleEvent(title: string, seq: number): unknown {
  return {
    type: 'session/title',
    seq,
    time: seq,
    data: { title, messageSeqs: [1], source: { kind: 'user' } },
  }
}

const approvalAsked = { type: 'approval/asked', seq: 1, time: 0, data: {} } as unknown as SessionEvent
const turnEnd = { type: 'turn/end', seq: 2, time: 0, data: { turn: 1, reason: { kind: 'completed' } } } as unknown as SessionEvent

/** Assemble a listener over stubs, exposing everything the test may inspect. */
function harness(over: Partial<ListenerDeps> & { roots?: string[]; known?: string[] } = {}) {
  const notifier = memoryNotifier()
  const window: FiredWindow = over.window ?? new Map()
  let now = 1_000_000
  const deps: ListenerDeps = {
    agents: over.agents ?? agentsStub(over.roots ?? ['sessao-raiz-0001'], over.known),
    notifier: over.notifier ?? notifier,
    clock: over.clock ?? (() => now),
    window,
    config: over.config ?? {},
  }
  return {
    listen: createSessionEventListener(deps),
    dispose: createSessionDisposedListener({ window }),
    notifier,
    window,
    advance: (ms: number) => {
      now += ms
    },
    setNow: (value: number) => {
      now = value
    },
  }
}

describe('R5 — the root bridge', () => {
  it('a live root session notifies', () => {
    const h = harness()
    h.listen(sessionStub(), approvalAsked)
    expect(h.notifier.plans).toHaveLength(1)
  })

  it('a subagent — live, but not a root — stays silent', () => {
    const h = harness({ roots: ['outra-sessao'], known: ['outra-sessao', 'sessao-raiz-0001'] })
    h.listen(sessionStub(), approvalAsked)
    expect(h.notifier.plans).toHaveLength(0)
  })

  it('a session the registry does not know stays silent and throws nothing', () => {
    const h = harness({ roots: [], known: [] })
    expect(() => h.listen(sessionStub(), turnEnd)).not.toThrow()
    expect(h.notifier.plans).toHaveLength(0)
  })

  it('survives the detach race: a turn/end arriving after the agent is gone', () => {
    const h = harness({ agents: { get: () => undefined, roots: () => [] } })
    expect(() => h.listen(sessionStub(), turnEnd)).not.toThrow()
    expect(h.notifier.plans).toHaveLength(0)
  })
})

describe('R3 — the plugin resolves the title', () => {
  it('uses the session title folded from its own events', () => {
    const h = harness()
    const events = [titleEvent('Consertar o parser', 1)]
    h.listen(sessionStub({ events, cwd: '/tmp/projeto' }), approvalAsked)
    expect(h.notifier.plans[0]?.body).toBe('Consertar o parser')
  })

  it('falls back to the cwd basename when no title event exists', () => {
    const h = harness()
    h.listen(sessionStub({ cwd: '/Users/ana/HARNESS/scrum-harness' }), approvalAsked)
    expect(h.notifier.plans[0]?.body).toBe('scrum-harness')
  })

  it('falls back to the head of the session id when neither exists', () => {
    const h = harness({ roots: ['abcdef0123456789'] })
    h.listen(sessionStub({ id: 'abcdef0123456789' }), approvalAsked)
    expect(h.notifier.plans[0]?.body).toBe('abcdef01')
  })

  it('takes the last title when the session was renamed', () => {
    const h = harness()
    const events = [titleEvent('Primeiro nome', 1), titleEvent('Nome atual', 2)]
    h.listen(sessionStub({ events }), approvalAsked)
    expect(h.notifier.plans[0]?.body).toBe('Nome atual')
  })
})

describe('R9 — the plugin keeps the window', () => {
  it('records the reason and the time before firing', () => {
    const h = harness()
    h.setNow(500_000)
    h.listen(sessionStub(), approvalAsked)
    expect(h.window.get('sessao-raiz-0001')).toEqual({ approval: 500_000 })
  })

  it('silences a repeat inside the window', () => {
    const h = harness()
    h.listen(sessionStub(), approvalAsked)
    h.advance(1999)
    h.listen(sessionStub(), approvalAsked)
    expect(h.notifier.plans).toHaveLength(1)
  })

  it('fires again once the window has passed', () => {
    const h = harness()
    h.listen(sessionStub(), approvalAsked)
    h.advance(2000)
    h.listen(sessionStub(), approvalAsked)
    expect(h.notifier.plans).toHaveLength(2)
  })

  it('keeps the window per reason', () => {
    const h = harness()
    h.listen(sessionStub(), approvalAsked)
    h.listen(sessionStub(), turnEnd)
    expect(h.notifier.plans.map((plan) => plan.reason)).toEqual(['approval', 'turn-end'])
  })

  it('two sessions do not share a window', () => {
    const h = harness({ roots: ['a-session', 'b-session'] })
    h.listen(sessionStub({ id: 'a-session' }), approvalAsked)
    h.listen(sessionStub({ id: 'b-session' }), approvalAsked)
    expect(h.notifier.plans).toHaveLength(2)
  })

  it('the same event redelivered inside the window notifies once', () => {
    const h = harness()
    h.listen(sessionStub(), approvalAsked)
    h.listen(sessionStub(), approvalAsked)
    h.listen(sessionStub(), approvalAsked)
    expect(h.notifier.plans).toHaveLength(1)
  })

  it('session/disposed prunes that session and leaves the others', () => {
    const h = harness({ roots: ['a-session', 'b-session'] })
    h.listen(sessionStub({ id: 'a-session' }), approvalAsked)
    h.listen(sessionStub({ id: 'b-session' }), approvalAsked)
    h.dispose(sessionStub({ id: 'a-session' }))
    expect(h.window.has('a-session')).toBe(false)
    expect(h.window.has('b-session')).toBe(true)
  })

  it('disposing an unknown session is harmless', () => {
    const h = harness()
    expect(() => h.dispose(sessionStub({ id: 'nunca-vista' }))).not.toThrow()
  })
})

describe('R7 — the listener never brings the turn down', () => {
  it('swallows a notifier that throws', () => {
    const h = harness({
      notifier: {
        notify: () => {
          throw new Error('osascript sumiu')
        },
      },
    })
    expect(() => h.listen(sessionStub(), approvalAsked)).not.toThrow()
  })

  it('swallows a registry that throws', () => {
    const h = harness({
      agents: {
        get: () => {
          throw new Error('registro caiu')
        },
        roots: () => [],
      },
    })
    expect(() => h.listen(sessionStub(), approvalAsked)).not.toThrow()
  })

  it('survives a malformed session with no header', () => {
    const h = harness()
    const broken = { id: 'sessao-raiz-0001', events: [] } as unknown as Session
    expect(() => h.listen(broken, approvalAsked)).not.toThrow()
  })

  it('returns synchronously, with no promise to await', () => {
    const h = harness()
    expect(h.listen(sessionStub(), approvalAsked)).toBeUndefined()
  })
})

describe('R8 — configuration reaches the decision', () => {
  it('enabled: false silences the listener', () => {
    const h = harness({ config: { enabled: false } })
    h.listen(sessionStub(), approvalAsked)
    expect(h.notifier.plans).toHaveLength(0)
  })

  it('an allowlist filters what the listener fires', () => {
    const h = harness({ config: { reasons: ['turn-end'] } })
    h.listen(sessionStub(), approvalAsked)
    h.listen(sessionStub(), turnEnd)
    expect(h.notifier.plans.map((plan) => plan.reason)).toEqual(['turn-end'])
  })

  it('normalizeConfig keeps what is usable and drops what is not', () => {
    expect(normalizeConfig({ enabled: false })).toEqual({ enabled: false })
    expect(normalizeConfig({ reasons: ['approval', 7, 'lixo'] })).toEqual({
      reasons: ['approval', 'lixo'],
    })
    expect(normalizeConfig({ enabled: 'sim' })).toEqual({})
    expect(normalizeConfig({ reasons: 'approval' })).toEqual({})
  })

  it('normalizeConfig never throws on junk', () => {
    for (const raw of [undefined, null, 42, 'texto', [], true]) {
      expect(() => normalizeConfig(raw)).not.toThrow()
      expect(normalizeConfig(raw)).toEqual({})
    }
  })
})

describe('R12 — the package is a house plugin', () => {
  it('exports the plugin surface a bundle row needs', () => {
    expect(NotifyScrum.name).toBe('notify-scrum')
    expect(NotifyScrum.inject).toEqual(['agents'])
    expect(typeof NotifyScrum.apply).toBe('function')
  })

  it('reexports the Model and the effect through the facade', () => {
    expect(typeof NotifyScrum.decide).toBe('function')
    expect(typeof NotifyScrum.createNotifier).toBe('function')
    expect(NotifyScrum.ASKING_TOOLS.has('ask_user_question')).toBe(true)
    expect(NotifyScrum.NON_NOTIFYING_TURN_END.has('interrupted')).toBe(true)
    expect(NotifyScrum.REASON_SOUND['turn-end']).toBe('Tink')
  })

  it('exports both listeners as factories the tests can drive', () => {
    expect(typeof NotifyScrum.createSessionEventListener).toBe('function')
    expect(typeof NotifyScrum.createSessionDisposedListener).toBe('function')
  })

  it('apply registers both listeners on a real Context without throwing', async () => {
    const ctx = new Context()
    const registered: string[] = []
    const on = ctx.on.bind(ctx)
    ;(ctx as unknown as { on: unknown }).on = (event: string, listener: unknown) => {
      registered.push(event)
      return on(event as never, listener as never)
    }
    ;(ctx as unknown as { agents: unknown }).agents = agentsStub([])
    expect(() => NotifyScrum.apply(ctx, { notifier: memoryNotifier() })).not.toThrow()
    expect(registered).toContain('session/event')
    expect(registered).toContain('session/disposed')
    await ctx.dispose?.()
  })

  it('the bundle patch carries the plugin row', () => {
    const patch = readFileSync(
      fileURLToPath(new URL('../../bundle-scrum/cordis.patch.yml', import.meta.url)),
      'utf8',
    )
    expect(patch).toContain('id: notify-scrum')
    expect(patch).toContain("name: '@scrum-harness/notify-scrum'")
  })

  // A row in the patch only loads if the package is resolvable from the
  // bundle AND from the profile. Both were missing when the plugin shipped:
  // it was registered, silent, and every unit test still passed.
  it('every package the patch names is a dependency of the bundle', () => {
    const patch = readFileSync(
      fileURLToPath(new URL('../../bundle-scrum/cordis.patch.yml', import.meta.url)),
      'utf8',
    )
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../bundle-scrum/package.json', import.meta.url)), 'utf8'),
    ) as { dependencies: Record<string, string> }
    const named = [...patch.matchAll(/name:\s*'(@scrum-harness\/[^']+)'/g)].map((match) => match[1]!)
    expect(named).toContain('@scrum-harness/notify-scrum')
    for (const packageName of named) {
      expect(Object.keys(manifest.dependencies)).toContain(packageName)
    }
  })

  it('the profile setup links every package the patch names', () => {
    const patch = readFileSync(
      fileURLToPath(new URL('../../bundle-scrum/cordis.patch.yml', import.meta.url)),
      'utf8',
    )
    const script = readFileSync(
      fileURLToPath(new URL('../../../scripts/setup-profile.sh', import.meta.url)),
      'utf8',
    )
    const linked = script.match(/^for pkg in (.+); do$/m)?.[1]?.split(/\s+/) ?? []
    expect(linked).toContain('notify-scrum')
    // The patch names packages by npm name; the script links directory names.
    const directoryOf: Record<string, string> = {
      '@scrum-harness/domain': 'scrum-domain',
      '@scrum-harness/ui': 'ui-scrum',
      '@scrum-harness/probe': 'scrum-probe',
    }
    for (const packageName of [...patch.matchAll(/name:\s*'(@scrum-harness\/[^']+)'/g)].map((m) => m[1]!)) {
      const directory = directoryOf[packageName] ?? packageName.replace('@scrum-harness/', '')
      expect(linked).toContain(directory)
    }
  })

  it('the manifest declares the harness deps as peers, not dependencies', () => {
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    ) as { dependencies?: unknown; peerDependencies: Record<string, string> }
    expect(manifest.dependencies).toBeUndefined()
    expect(Object.keys(manifest.peerDependencies)).toContain('@deepseek-ai/dsh-session-title')
    expect(Object.keys(manifest.peerDependencies)).toContain('@deepseek-ai/dsh-user-approval')
  })
})
