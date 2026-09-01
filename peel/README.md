# peel — descascando o perfil scrum em graus até a LLM nua

Propagação do experimento de `../deepseek-harness/peel/`: a escada descrita para o Claude Code (`--tools ""`, `--system-prompt`, `--strict-mcp-config`, `--safe-mode`, `--bare`, API direta), adaptada ao `dsh` — que não tem esses flags — como overlays `--patch` sobre o perfil `scrum` (base + web + SCRUM).

| Grau | Overlay | O que sai | Equivalente Claude Code |
|---|---|---|---|
| 0 | — | nada (perfil completo) | chamada normal |
| 1 | `grau-1-sem-ferramentas.yml` | todas as rows `tool-*`, incluindo as 23 tools SCRUM | `--tools ""` |
| 2 | `grau-2-sem-persona.yml` | persona do system prompt (vira `''`) | `--system-prompt` |
| 3 | `grau-3-sem-memoria-skills-comandos.yml` | `agent-instructions` (CLAUDE.md/AGENTS.md), skills, comandos — inclusive `/scrum` | `--strict-mcp-config` + parte do `--bare` |
| 4 | `grau-4-quase-nu.yml` | subagentes, workflow, goal, plan, compaction, títulos, telemetria, web search, pi-ai (Anthropic) e o SCRUM inteiro (`scrum-domain`, `scrum-api`, `ui-scrum`) | `--safe-mode` / `--bare` |
| 5 | — | o próprio harness: `curl` direto na API (o script só imprime o comando) | API direta (`/v1/messages` ou SDK) |

Diferença deliberada em relação ao gêmeo headless: aqui o grau 4 **preserva o casco web** (webserver, runtime, `ui-*`), para a GUI ainda abrir — descascada, sem o quadro SCRUM e com o agente mínimo por trás. Os graus são cumulativos (o grau N aplica os overlays 1..N).

## Uso

```sh
bash peel/peel.sh <grau 0..5>                  # valida com --dump-config (boot-free, sem chave)
PEEL_SERVE=1 bash peel/peel.sh <grau> [porta]  # sobe a GUI descascada (padrão 3090)
bash peel/peel.sh 5                            # imprime o curl da LLM pura (não executa)
```

Pré-requisitos: os mesmos do `scripts/serve.sh` — o checkout do DSH ao lado com `lib/` buildado e o perfil `scrum` criado por `scripts/setup-profile.sh` (`DSH_HOME` hermético em `.dsh-home/`). Nenhum grau exige chave de API: a validação é pela árvore composta.

## Validação registrada (sem chave, `--dump-config`)

```
grau 0: 142 rows, 25 desligadas   (o perfil web JÁ desliga as tool-rows de CLI:
                                   na GUI as tools chegam por presets de agente, por sessão)
grau 1: + tool-scrum, tool-subagent-report
grau 2: persona → '' (mudança de config, não de disabled)
grau 3: + skill, commands, command-feedback, command-goal, command-scrum
grau 4: + 20 rows (goal, subagentes, títulos LLM, telemetria, web search,
                   pi-ai/Anthropic, code-runtime e o SCRUM: scrum-domain, scrum-api, ui-scrum)
```

Consequência prática do grau 1 aqui: o que ele desliga de fato é o que é global ao host — a row `tool-scrum` (as 23 tools SCRUM) e o `tool-subagent-report`. Para descascar as tools que uma **sessão** da GUI recebe, o mecanismo por sessão é o preset de agente (ex.: `minimal`) no seletor da GUI.

Enquanto o desenvolvimento aqui estiver em andamento, o gêmeo hermético `../deepseek-harness/peel/scrum-testbed/` roda esta mesma escada sobre um snapshot dos pacotes (atualize-o com `sync.sh`), sem escrever nada neste checkout.
