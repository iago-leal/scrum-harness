---
file: API_SPEC.md
reviewer: claude (subagente revisor adversarial)
reviewed_version: 2
reviewed_digest: "b720677f"
verdict: approved
round: 2
findings: { high: 0, medium: 0, low: 1 }
---
# Revisão adversarial — specs/API_SPEC.md v2 (digest b720677f) · rodada 2

Método: digest recomputado do corpo (sha1 do texto sem frontmatter, trimado → `b720677f`) ✓; frontmatter `version: 2`, `status: draft`, `owner: api-data` ✓; nenhum id `R/S/P/C/CT` no início de linha ✓. Cada achado da rodada 1 foi conferido item a item contra o texto v2 e a linha tocada foi reconferida contra `packages/scrum-api/src/index.ts`, `packages/scrum-domain/src/{service,traces,format}.ts` e `packages/tool-scrum/src/index.ts`. Depois, cinco tools sorteadas (`scrum_suite_budget`, `scrum_component_phase`, `scrum_trace`, `scrum_sprint_plan`, `scrum_ceremony_record`) mais `scrum_item_update` (a mais tocada) foram comparadas parâmetro a parâmetro com `tool-scrum`.

## Absorção da rodada 1

- **H1 (`invalid-column` alcançável via `updateItem.wipLimits`) — absorvido.** v2 linha 231: «`wipLimits?: Record<string, number>` (chaves validadas pelo Model — 409 `invalid-column` —, não pelo envelope)»; linha 238: «`invalid-column` só é inalcançável em `moveTask` (`column` é enum) — em `updateItem.wipLimits` (`Record<string, number>`) uma chave fora das colunas chega ao Model e volta 409 `invalid-column`». Código: `scrum-api/src/index.ts:38` `wipLimits: z.record(z.string(), z.number())`; `:46` `column: z.enum(BOARD_COLUMNS)`; `service.ts:1766-1771` `narrowWipLimits` lança `ScrumError('invalid-column')`; `:207` `not-found` → 404, resto 409 ✓.
- **M1 (`no task under the component` no gate construction → validation) — absorvido.** v2 linha 123: «construction → validation = `no task under the component` / `N task(s) not done (ids)` (R25)». Código: `service.ts:865-869` ✓ (e as três razões do tdd — `no task under the component (decompose first)`, `no test task`, `code task(s) created before the first test task (ids)` — também batem com `:852-861`).
- **M2 (delegação do ADR-016) — absorvido.** v2 linha 202 (`scrum_task_move`): «Nenhum efeito nos pais: fase e estado de componente/função/release são manuais (R6, ADR-016); com todas as tarefas `done` o componente continua em `construction` até `scrum_component_phase advance` e `scrum_item_update status: done`»; repetido na linha 122 (`scrum_component_phase`: «Nenhum movimento é automático (ADR-016)…») e na linha 113 (`invalid-status`). Código: `moveTask` (`service.ts:1591-1607`) só toca a tarefa (`status`, `doneAt`, `updatedAt`) ✓.
- **M3 (`""` vs só-espaços) — absorvido.** v2 linha 238: 400 `bad-action` para «`title`/`name`/`goal` iguais a `""`» e 409 `invalid-input` «inclusive `title`/`name`/`goal` só-espaços, que passam o `min(1)` do envelope e o Model trima». Código: `z.string().min(1)` (`scrum-api:33-35,37,42`); `requireTitle`/`requireName` trimam e lançam `invalid-input` (`service.ts:1683-1694`) ✓.
- **M4 (`nocode` não sai no texto de `scrum_trace`) — absorvido.** v2 linha 127: «buracos `without trace` / `unproven` / `unknown` (o `nocode` da matriz só viaja no `state` da API — `tree[].traces` —, não no texto)». Código: `format.ts:309-314` imprime só os três; `traces.ts:223,297` carrega `nocode` no dado ✓.
- **L1 («prateleira» fora do GLOSSARY) — absorvido quase por inteiro.** As ocorrências nas linhas 63, 142, 167 e 279 viraram «lixeira ou arquivo» / «lixeira ou no arquivo»; o «Ver também» do GLOSSARY agora lista «vivo, lixeira, arquivo». Resta um adjetivo (ver L1 abaixo).
- **L2 (`scrum_trace` e o prefixo) — absorvido.** v2 linha 23: «(`scrum_trace` consulta sempre `components`: um `task-1` responde `not-found`, não `invalid-id`)» ✓ (`traceMatrix` → `mustGetNotTrashed('components', id)`).
- **L3 (corpo > 256 KiB) — absorvido.** v2 linha 229: «o handler ainda tenta um 400 `bad-json` com `message: "body too large"`, que normalmente não chega ao cliente». Código: `readBody` rejeita com `Error('body too large')` e `req.destroy()` (`scrum-api:157-160`); o `catch` de `:188-190` escreve 400 `bad-json` com `error.message` ✓.
- **L4 (`invalid-column` barrado pelo envelope da tool) — absorvido.** v2 linha 113: «(R14; o envelope da tool já barra com `additionalProperties: false`; alcançável pela API, cujo `wipLimits` é `Record<string, number>`)». Código: `tool-scrum:307-317` ✓.
- **L5 (assimetria de `estimate`) — absorvido.** v2 linha 106: «a tool aceita qualquer `number` e o Model não valida: um `-3` é gravado; só a API recusa negativo, 400»; linha 111 idem para `scrum_item_update`. Código: `service.ts:449,734` copiam `estimate` sem checar; `scrum-api:37-38` `nonnegative()` ✓.
- **L6 (detalhes de saída) — absorvido.** v2 linha 127: «no máximo 40 impressos antes de `+N more`», «≤ 60 nomes antes de ` +N`», «sonda parou em 500 arquivos» (`format.ts:275,277,356,362-364`; `traces.ts:39` `TRACE_PROBE_CAP = 500`); linha 72: «linha final `Unknown reviews: <file> (did you mean <stem>?), …`» (`format.ts:496`); linha 67: «sufixo ` · review stale` … nunca em `done`» (`format.ts:31,42,162`) ✓.

## Spot-check (cinco tools + `scrum_item_update`)

- `scrum_suite_budget`: `seconds` (number, opcional), `reason` (string, opcional); `0` → `undefined` no Model; resposta pelo `formatSuiteBudget(…, 'read')` — bate (`tool-scrum:178-200`).
- `scrum_component_phase`: `id` (required), `action` (required; enum `advance | set | check`), `phase` (opcional; enum `COMPONENT_PHASES`); erros de envelope `set` sem `phase` / `advance`|`check` com `phase` são `Error` simples; as quatro formas do `check` e o `→ <fase> [status]. Phase log: N movement(s).` são literais (`tool-scrum:389-435`) ✓.
- `scrum_trace`: `path` / `id` opcionais, exatamente um (`Error` de envelope, `:452`); absoluto sem cwd e absoluto fora do workspace são `Error` de envelope (`:463,465`); sem cwd só a parte do quadro (`:468`); `.gitignore` lido pela tool (`:471-472`) ✓.
- `scrum_sprint_plan`: `goal` (required), `releaseId`, `releaseIds` (array), `startDate`, `endDate`, `taskIds` (array); texto `Planned sprint spr-N #n "goal"[ for rel-…][ with N task(s)]. Start it with scrum_sprint_start.` ✓.
- `scrum_ceremony_record`: `type` (required; enum `CEREMONY_TYPES`), `sprintId`, `author`, `notes` (required; array de `{ category, text }` ambos required, `additionalProperties: false`); texto `Recorded <type> cer-N for spr-N (N note(s)).` ✓. (O «≥ 1» da spec é do Model — `invalid-input` —, não do envelope da tool, como a linha 208 já atribui.)
- `scrum_item_update`: 15 parâmetros, `kind` com enum `TASK_KINDS`, `wipLimits` com as quatro colunas e `additionalProperties: false`; as sete notas de aviso da linha 112 são as strings literais de `tool-scrum:329-362`, na ordem em que o código as emite ✓.

## HIGH

Nenhum.

## MEDIUM

Nenhum.

## LOW

**L1 — resíduo de «prateleira» (linha 35).** A entrada de `invalid-id` ainda diz «ou não-prateleável (`spr-`/`cer-` em delete/restore/purge/archive, R15)». O substantivo saiu do resto do texto, mas o adjetivo ficou e o GLOSSARY v2 continua sem o termo. Sugestão: «ou nível sem lixeira/arquivo (`spr-`/`cer-` …)». Cosmético; não bloqueia.

## Sections I would keep

- «Convenções» inteira — inclusive a nova ressalva de `scrum_trace` na regra do prefixo (linha 23), que agora é exata.
- «Erros padrão»: os 28 códigos do Model e os 4 de transporte permanecem corretos; a linha de `invalid-column` cita as duas origens (chave de `wipLimits` e destino de `moveTask`).
- `scrum_task_create` / `scrum_item_update` (linhas 106, 111, 113): a assimetria de `estimate`, o `invalid-column` barrado pela tool e alcançável pela API, e o `invalid-status` com a explicação do ADR-016 — três afirmações verificadas contra o código.
- `scrum_component_phase` (linhas 122-123): as razões de cada gate são as strings de `phaseGate`, e a frase «Nenhum movimento é automático» cumpre a delegação do ADR-016.
- `scrum_trace` (linhas 127-128): forma do texto (caps 40/60/500, `nocode` só no dado), e a separação envelope × Model dos erros.
- `scrum_task_move` (linha 202): o parágrafo «Nenhum efeito nos pais» é a resposta certa ao ADR-016 e bate com `moveTask`.
- `POST /scrum-api/action` (linhas 229-238): a nota do «body too large», o `""` vs só-espaços e o par `invalid-kind` inalcançável / `invalid-column` alcançável por `updateItem.wipLimits` — o mapeamento HTTP agora é fiel linha a linha ao `dispatch` e ao `catch` da rota.

## Veredito

**approved** — nenhum HIGH nem MEDIUM; o único LOW é um adjetivo residual. H1 e M1–M4 foram absorvidos com o texto sugerido e as linhas tocadas conferem com o código; os spot-checks não revelaram divergência de nome, `required` ou enum. Pronto para o carimbo humano (`status: approved`).
