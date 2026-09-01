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
  formatSprints,
  formatSprintStatus,
  formatTree,
  ScrumError,
} from '@scrum-harness/domain'

export const name = 'command-scrum'
export const inject = ['commands', 'scrum']

const USAGE = [
  'Uso: /scrum [tree|sprints|status [spr-N]|ceremonies [spr-N]]',
  '  /scrum            visão geral (hierarquia + sprints)',
  '  /scrum tree       hierarquia Release > Feature > Componente > Tarefa',
  '  /scrum sprints    lista de sprints',
  '  /scrum status     progresso da sprint ativa (ou de spr-N)',
  '  /scrum ceremonies cerimônias registradas (opcionalmente de spr-N)',
].join('\n')

/**
 * Register the `/scrum` command.
 * @param ctx - registrant context carrying the command registry and scrum service.
 */
export function apply(ctx: Context): void {
  ctx.commands.register({
    name: 'scrum',
    description: 'Estado do processo SCRUM: hierarquia, sprints, board e cerimônias (somente leitura)',
    input: { hint: '[tree|sprints|status|ceremonies]' },
    handler: (invocation): CommandResult => {
      const [verb, argument] = invocation.rawInput.trim().split(/\s+/u, 2)
      try {
        switch (verb ?? '') {
          case '':
          case 'tree': {
            const sprints = ctx.scrum.sprints()
            const tree = formatTree(ctx.scrum.tree(), sprints)
            if ((verb ?? '') === 'tree') return { kind: 'success', text: tree }
            return { kind: 'success', text: `${tree}\n\nSprints:\n${formatSprints(sprints, ctx.scrum.releaseNames())}` }
          }
          case 'sprints':
            return { kind: 'success', text: formatSprints(ctx.scrum.sprints(), ctx.scrum.releaseNames()) }
          case 'status':
            return { kind: 'success', text: formatSprintStatus(ctx.scrum.sprintStatus(argument), ctx.scrum.releaseNames()) }
          case 'ceremonies':
            return { kind: 'success', text: formatCeremonies(ctx.scrum.ceremonies(argument)) }
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
