/**
 * Tests of the `/scrum` command (Controller): the handler registered by the
 * plugin, driven with a stub invocation over a real ScrumService on the
 * in-memory backend. The command registry itself is host-owned; here a
 * capturing `commands.register` stands in for it.
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageMemory from '@scrum-harness/test-support/src/index.ts'
import type { CommandDefinition, CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { ScrumService } from '@scrum-harness/domain'
import * as CommandScrum from '../src/index.ts'

const root = join(tmpdir(), 'command-scrum-boards')
let ctx: Context
let definition: CommandDefinition
let boards = 0
let currentWs: string

beforeAll(async () => {
  ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(StorageMemory)
  await ctx.plugin(StorageDomain, { backend: StorageMemory.MEMORY_BACKEND })
  await ctx.plugin(ScrumService)
  // The plugin only touches `commands.register` and `scrum`: capture the definition.
  const registrant = { commands: { register: (d: CommandDefinition) => { definition = d; return () => {} } }, scrum: ctx.scrum }
  CommandScrum.apply(registrant as unknown as Context)
})

afterAll(async () => {
  await ctx.dispose?.()
})

beforeEach(() => {
  currentWs = join(root, `ws-${++boards}`)
})

/** Invoke `/scrum <rawInput>` for the current test's workspace. */
async function slash(rawInput: string, cwd: string | null = currentWs): Promise<CommandResult> {
  const invocation = {
    commandId: 'cmd-1', rawInput, attachments: [], signal: new AbortController().signal,
    agent: { session: { header: cwd === null ? {} : { cwd } } },
  } as unknown as CommandInvocation
  return definition.handler(invocation)
}

describe('/scrum (command-scrum)', () => {
  it('registers under the name scrum and answers the calling workspace', async () => {
    expect(definition.name).toBe('scrum')
    const board = await ctx.scrum.board(currentWs)
    await board.createRelease({ name: 'v1.0' })
    const tree = await slash('tree')
    expect(tree.kind).toBe('success')
    expect(tree.text).toContain('rel-1 v1.0')
    // No cwd → the global board, which nobody wrote to.
    expect((await slash('tree', null)).text).toContain('Empty backlog')
  })

  it('R3: prefixes the suite budget header on `/scrum` and `/scrum tree` when the board set one — even empty', async () => {
    expect((await slash('')).text).not.toMatch(/Suite budget/)
    const board = await ctx.scrum.board(currentWs)
    await board.setSuiteBudget(10)
    expect((await slash('')).text).toMatch(/^Suite budget: 10s \(board\)\n\n/)
    expect((await slash('tree')).text).toMatch(/^Suite budget: 10s \(board\)\n\n/)
    expect((await slash('tree')).text).toContain('Empty backlog')
    // Other verbs stay as they are.
    expect((await slash('sprints')).text).not.toMatch(/Suite budget/)
  })
})
