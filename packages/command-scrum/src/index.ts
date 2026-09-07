/**
 * Human-facing `/scrum` command: quick read views over the SCRUM state
 * without sending anything to the model. Mutations belong to the model tools
 * and to the web board; the command stays read-only on purpose.
 * @module @scrum-harness/command-scrum
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import {
  formatCeremonies,
  formatShelf,
  formatSprints,
  formatSprintStatus,
  formatTree,
  withBoardHeader,
  ScrumError,
  SPEC_FILE_CAP,
} from '@scrum-harness/domain'
import { listSpecFiles } from '@scrum-harness/probe'

export const name = 'command-scrum'
export const inject = ['commands', 'scrum']

const USAGE = [
  'Uso: /scrum [tree|sprints|status [spr-N]|ceremonies [spr-N]|trash|archive]',
  '  /scrum            visão geral (hierarquia + sprints)',
  '  /scrum tree       hierarquia Release > Feature > Componente > Tarefa',
  '  /scrum sprints    lista de sprints',
  '  /scrum status     progresso da sprint ativa (ou de spr-N)',
  '  /scrum ceremonies cerimônias registradas (opcionalmente de spr-N)',
  '  /scrum trash      lixeira (itens apagados, restauráveis)',
  '  /scrum archive    arquivo (itens concluídos guardados)',
].join('\n')

/**
 * Structural view of the invocation's agent (session header cwd only),
 * dependency-free on purpose: the Agent type lives in a host-only package.
 */
interface AgentLike { session: { header: { cwd?: string } } }

/**
 * Register the `/scrum` command.
 * @param ctx - registrant context carrying the command registry and scrum service.
 */
export function apply(ctx: Context): void {
  ctx.commands.register({
    name: 'scrum',
    description: 'Estado do processo SCRUM deste workspace: hierarquia, sprints, board e cerimônias (somente leitura)',
    input: { hint: '[tree|sprints|status|ceremonies]' },
    handler: async (invocation): Promise<CommandResult> => {
      const [verb, argument] = invocation.rawInput.trim().split(/\s+/u, 2)
      // The command answers about the CALLING session's workspace board
      // (sessions without a cwd share the global fallback board).
      const cwd = (invocation.agent as unknown as AgentLike).session.header.cwd
      const board = await ctx.scrum.board(cwd)
      try {
        switch (verb ?? '') {
          case '':
          case 'tree': {
            const sprints = board.sprints()
            // comp-50 R3 / comp-53 R5 / comp-59 R7: the board's own suite budget, title-overflow count and spec-set line head the tree views
            // (the spec line only when the workspace has a specs/ directory; a session without cwd never probes a disk).
            const specs = cwd === undefined ? null : board.specs(listSpecFiles(cwd, SPEC_FILE_CAP))
            const tree = withBoardHeader(board.suiteBudget(), board.overflowSummary(), formatTree(board.tree(), sprints), specs)
            if ((verb ?? '') === 'tree') return { kind: 'success', text: tree }
            return { kind: 'success', text: `${tree}\n\nSprints:\n${formatSprints(sprints, board.releaseNames())}` }
          }
          case 'sprints':
            return { kind: 'success', text: formatSprints(board.sprints(), board.releaseNames()) }
          case 'status':
            return { kind: 'success', text: formatSprintStatus(board.sprintStatus(argument), board.releaseNames()) }
          case 'ceremonies':
            return { kind: 'success', text: formatCeremonies(board.ceremonies(argument)) }
          case 'trash':
            return { kind: 'success', text: formatShelf(board.trash(), 'trash') }
          case 'archive':
            return { kind: 'success', text: formatShelf(board.archive(), 'archive') }
          default:
            return { kind: 'error', text: `Subcomando desconhecido: "${verb}"\n${USAGE}` }
        }
      } catch (error) {
        if (error instanceof ScrumError) return { kind: 'error', text: `${error.code}: ${error.message}` }
        throw error
      }
    },
  })
}
