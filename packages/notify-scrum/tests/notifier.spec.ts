/**
 * Unit tests of the effect (R4 argv, R6, R7, R10). The spawn function and the
 * platform are injected, so no process is ever created and no test in this
 * suite executes `osascript` — the promise R7 makes.
 */

import { describe, expect, it } from 'vitest'
import {
  MacNotifier,
  OSASCRIPT,
  PROGRAM,
  SilentNotifier,
  createNotifier,
  sanitize,
} from '../src/notifier.ts'
import type { SpawnFn } from '../src/notifier.ts'
import type { NotifyPlan } from '../src/model.ts'

/** One captured invocation. */
interface Call {
  file: string
  args: readonly string[]
  options: { detached: boolean; stdio: 'ignore' }
}

/** A spawn that records instead of forking, reporting what the child got. */
function capture() {
  const calls: Call[] = []
  let errorListener = false
  let unrefs = 0
  const spawnFn: SpawnFn = (file, args, options) => {
    calls.push({ file, args, options })
    return {
      on: (event: 'error') => {
        if (event === 'error') errorListener = true
        return undefined
      },
      unref: () => {
        unrefs += 1
        return undefined
      },
    }
  }
  return {
    spawnFn,
    calls,
    get errorListener() {
      return errorListener
    },
    get unrefs() {
      return unrefs
    },
  }
}

const plan = (over: Partial<NotifyPlan> = {}): NotifyPlan => ({
  reason: 'approval',
  title: 'SCRUM Harness',
  subtitle: 'aprovação pendente',
  body: 'scrum-harness',
  sound: 'Glass',
  ...over,
})

/** Fire one plan on a darwin notifier and return the capture. */
function fire(over: Partial<NotifyPlan> = {}) {
  const spy = capture()
  new MacNotifier({ spawnFn: spy.spawnFn, platform: 'darwin' }).notify(plan(over))
  return spy
}

describe('R6 — the notice text is inert in the shell', () => {
  it('invokes osascript by absolute path', () => {
    expect(fire().calls[0]?.file).toBe(OSASCRIPT)
  })

  it('passes -e with the constant program, then the separator', () => {
    const { args } = fire().calls[0]!
    expect(args[0]).toBe('-e')
    expect(args[1]).toBe(PROGRAM)
    expect(args[2]).toBe('--')
  })

  it('the program interpolates nothing: it is the same for every plan', () => {
    const first = fire({ body: 'um' }).calls[0]!.args[1]
    const second = fire({ body: 'outro totalmente diferente' }).calls[0]!.args[1]
    expect(first).toBe(second)
    expect(first).toBe(PROGRAM)
  })

  it('passes exactly four fields after the separator, in order', () => {
    const { args } = fire({
      title: 'TITULO',
      subtitle: 'SUBTITULO',
      body: 'MENSAGEM',
      sound: 'Glass',
    }).calls[0]!
    expect(args.slice(3)).toEqual(['TITULO', 'SUBTITULO', 'MENSAGEM', 'Glass'])
    expect(args).toHaveLength(7)
  })

  it('the program reads the four items the effect passes', () => {
    expect(PROGRAM).toContain('item 1 of argv')
    expect(PROGRAM).toContain('item 2 of argv')
    expect(PROGRAM).toContain('item 3 of argv')
    expect(PROGRAM).toContain('item 4 of argv')
  })

  it('hostile text arrives verbatim as an argument, not as code', () => {
    // No newline here: that is C0 and is stripped on purpose (covered below).
    const hostile = '$(touch /tmp/PWNED) `whoami` "; rm -rf /" \\ fim 🎉'
    const { args } = fire({ body: hostile }).calls[0]!
    expect(args[5]).toBe(hostile)
    // It rides as one single argument — never spliced into the command.
    expect(args).toHaveLength(7)
  })

  it('a field starting with a dash is still a field, thanks to the separator', () => {
    const { args } = fire({ title: '-x', body: '--help' }).calls[0]!
    expect(args[2]).toBe('--')
    expect(args[3]).toBe('-x')
    expect(args[5]).toBe('--help')
  })

  it('strips C0 control characters before invoking', () => {
    // Only the control characters go: the printable `[31m` that follows an
    // ESC is ordinary text and must survive.
    const { args } = fire({ body: 'a\u0000b\u0007c\u001bd\u007fe\nf' }).calls[0]!
    expect(args[5]).toBe('abcdef')
  })

  it('strips the NUL, which Node would otherwise reject before the child exists', () => {
    const { args } = fire({ body: 'antes\u0000depois' }).calls[0]!
    expect(args[5]).toBe('antesdepois')
    expect(args[5]).not.toContain('\u0000')
  })

  it('keeps ordinary text, accents and emoji intact', () => {
    const { args } = fire({ body: 'aprovação pendente 🎉' }).calls[0]!
    expect(args[5]).toBe('aprovação pendente 🎉')
  })

  it('sanitize removes exactly the control range', () => {
    expect(sanitize('a\u0000b')).toBe('ab')
    expect(sanitize('a\tb')).toBe('ab')
    expect(sanitize('açaí 🎉')).toBe('açaí 🎉')
  })

  it('never builds a shell command line', () => {
    const { file, args } = fire().calls[0]!
    expect(file).not.toContain('sh')
    expect(args).not.toContain('-c')
  })
})

describe('R4 — the sound travels as an argument', () => {
  it('places the plan sound in the fourth field', () => {
    expect(fire({ sound: 'Tink' }).calls[0]?.args[6]).toBe('Tink')
  })

  it('the program asks for the sound by name, never by path', () => {
    expect(PROGRAM).toContain('sound name')
    expect(PROGRAM).not.toContain('/System/Library/Sounds')
  })

  it('fires exactly one process per notice: sound and banner together', () => {
    expect(fire().calls).toHaveLength(1)
  })

  it('never invokes afplay', () => {
    expect(fire().calls[0]?.file).not.toContain('afplay')
    expect(PROGRAM).not.toContain('afplay')
  })
})

describe('R7 — the effect is injectable and never brings the session down', () => {
  it('detaches the child and gives it no pipes', () => {
    expect(fire().calls[0]?.options).toEqual({ detached: true, stdio: 'ignore' })
  })

  it('unreferences the child so nothing holds the event loop', () => {
    expect(fire().unrefs).toBe(1)
  })

  it('registers an error listener so a missing binary is not an uncaught throw', () => {
    expect(fire().errorListener).toBe(true)
  })

  it('swallows a spawn that throws', () => {
    const notifier = new MacNotifier({
      spawnFn: () => {
        throw new Error('ENOENT')
      },
      platform: 'darwin',
    })
    expect(() => notifier.notify(plan())).not.toThrow()
  })

  it('returns synchronously, with no promise to await', () => {
    const spy = capture()
    const notifier = new MacNotifier({ spawnFn: spy.spawnFn, platform: 'darwin' })
    expect(notifier.notify(plan())).toBeUndefined()
  })
})

describe('R10 — outside macOS the plugin loads and stays quiet', () => {
  it('never spawns on another platform', () => {
    for (const platform of ['linux', 'win32', 'freebsd']) {
      const spy = capture()
      new MacNotifier({ spawnFn: spy.spawnFn, platform }).notify(plan())
      expect(spy.calls).toHaveLength(0)
    }
  })

  it('does not throw off macOS', () => {
    const notifier = new MacNotifier({ spawnFn: capture().spawnFn, platform: 'linux' })
    expect(() => notifier.notify(plan())).not.toThrow()
  })

  it('the silent notifier accepts any plan', () => {
    expect(() => new SilentNotifier().notify()).not.toThrow()
  })
})

describe('createNotifier — construction never blocks the load', () => {
  it('builds a working notifier on darwin', () => {
    const spy = capture()
    createNotifier({ spawnFn: spy.spawnFn, platform: 'darwin' }).notify(plan())
    expect(spy.calls).toHaveLength(1)
  })

  it('is safe to call with no options at all', () => {
    expect(() => createNotifier()).not.toThrow()
  })
})
