---
file: RULES.md
reviewer: claude (subagent, revisor adversarial)
reviewed_version: 5
reviewed_digest: "21433beb"
verdict: approved
round: 5
findings: { high: 0, medium: 0, low: 0 }
---
# Revisão adversarial — specs/RULES.md v5 (digest 21433beb) — rodada 5, de fechamento

## Método
Digest recalculado sobre o corpo trimado (sha1, 8 hex, `packages/scrum-domain/src/specs.ts:298-299` `digestOf(parsed.body.trim())`) = `21433beb` — confere com o brief. Frontmatter na linha 1: `title`/`purpose` entre aspas duplas, `version: 5` nu, `status: draft`, `owner: domain`; seções Domínio / Segurança / Performance / Compliance / Ver também presentes. Contagem mecânica dos ids no início de linha (`^(R|S|P|C)\d+\.`): **50 ocorrências, 50 únicos** (R1–R35, S1–S5, P1–P5, C1–C5), nenhum duplicado, nenhum renumerado. `git diff -- specs/RULES.md` (v3 commitada `4bd927d`, blob `711ae1c` → v5 no disco `5733f65`): 4 linhas removidas, 4 inseridas — frontmatter (`version`, `status`), R26 e R29; **nenhuma outra linha mudou**. Textos de M1 (R26) e de L1+L2 (R29) da rodada 4 comparados **byte a byte** com a v5 por script: ambos contidos literalmente. R26 conferido contra `packages/scrum-domain/src/contracts.ts:311` (`ISO_DATE`), `:322` (`z.string().refine(ISO_DATE && Date.parse finito)`; o brief cita `:310-311` — o arquivo deslocou, o conteúdo é o mesmo), `:82-88` (mensagem para número nu em `validated_at`), `packages/scrum-domain/src/frontmatter.ts:123-130` (`parseValue`) e a suite (`packages/scrum-domain/tests/contracts.spec.ts:229-234`, `scrum-domain.spec.ts:868`, `:1428`). R29 conferido contra `specs/PRD.md` v5 `approved` (l.14, l.45, l.50), `specs/GLOSSARY.md` v3 (l.66 «Carimbo humano», l.98 «"aprovar" pelo agente»), R30, R31 e R34 desta spec. Somente leitura; nenhum instalador, build ou suite rodados.

## Absorção da rodada 4
| Achado r4 | Absorvido? | Linha v5 / citação | Evidência |
|---|---|---|---|
| **M1** — R26 «aspas obrigatórias só quando só-dígitos» insinuava que só-dígitos entre aspas passa | **Sim, verbatim** | l.38: «`validated_at` string ISO-8601 estendida (`AAAA-MM-DD` ou data-hora), que o parser da casa lê como string com ou sem aspas; um valor só-dígitos é recusado de qualquer forma (nu, o parser o lê como número)» | `contracts.ts:311` exige `^\d{4}-\d{2}-\d{2}(T…)?$` (forma estendida, com hífens); `:322` `z.string().refine` — string, sem exigir aspas; `frontmatter.ts:123-125` aspas → string, `:129` só-dígitos nu → `Number`, `:130` resto → string. Logo `"2026"` (aspas) vira string e cai no `refine` (mesma mensagem, `:322`); `2026` nu vira número e cai em `:88`. Provas: `contracts.spec.ts:231` (`2026` nu recusado), `:232` (data-hora entre aspas ok), `:233` (data-hora nua ok), `scrum-domain.spec.ts:868` (`2026-09-02` nua ok). A frase v5 é exata nas três afirmações: forma estendida, aspas indiferentes para valor válido, só-dígitos recusado sempre. |
| **L1** — R29 não citava R30 como razão do «só `status`» | **Sim, verbatim** | l.41: «e o agente grava só `status` (fora do corpo: o digest de R30 não muda e a revisão segue `current`)» | `specs.ts:298-299`: digest = sha1 do `body` trimado, frontmatter fora; trocar `status: draft → approved` não altera o digest, a revisão com `reviewed_version`/`reviewed_digest` iguais continua `current` (R30, R33). |
| **L2** — R29 longa (parêntese final de três cláusulas), corte proposto | **Sim, verbatim + duas inserções** | l.41 = texto proposto em L2 + o parêntese de L1 + «, para specs,» antes de «a mensagem de commit» | A inserção «para specs» corrige a elipse que o próprio L2 apontou (requisitos de componente vivem no storage fora do git: a única evidência é a conversa) sem desviar do PRD l.50, que fala de git só para specs. **Nota honesta de medida**: o L2 anunciou «≈ 520 chars», mas o texto proposto tem 589; com L1 (+70) e «, para specs,» (+13) a v5 fica em **672** — não é mais curta que a v4 em caracteres. O ganho é estrutural: a decisão (duas formas) vem primeiro, a ação do agente e a razão (R30) logo em seguida, as exclusões (`;`) depois, a marca de convenção por último. Continua **uma frase**, cada cláusula verificável à mão. Não é achado: o owner absorveu exatamente o pedido. |

## Diff v3→v5
- **Frontmatter**: `version: 3 → 5`, `status: approved → draft`. Correto — nova versão nasce `draft` (R29, R32); o carimbo é humano.
- **R26** (l.38): só a cláusula de `validated_at` mudou (v3 «ISO-8601 entre aspas», exigência falsa; v5 texto de M1). Aritmética da suite, `typecheck: clean`, orçamento, pior rodada, as-built vence — idênticos à v3 e ainda provados por `contracts.spec.ts` (suite, budget, runs) e `scrum-domain.spec.ts`.
- **R29** (l.41): de «é humano: o quadro o lê e nunca o escreve» (v3) para o modelo em duas formas do PRD v5. **Fiel ao PRD v5** cláusula a cláusula: duas formas (l.14), pergunta explícita nomeando arquivo ou componente + versão + digest (l.14, l.45), revisão `current` a 0 HIGH (l.14, l.45 «sem HIGH»), «grava só o campo `status`» (l.14), pedido vago não é carimbo (l.50), sem verificação de identidade (l.50), evidência na conversa e na mensagem de commit (l.50), quadro lê e nunca escreve (l.14, l.45). **Idêntico em substância ao GLOSSARY v3** (l.66, l.98). **Coerente com R30** (agora citado explicitamente), **R31** (quem grava é o agente com ferramenta de arquivo ou `scrum_item_update`, nunca o quadro; `specs.ts` só lê), **R34** (revisão preservada → o brief do sucessor abre sem nova rodada). Marca «convenção da casa, não gate» mantida; nada no Model muda.
- **Tudo o mais**: 48 regras, preâmbulo e «Ver também» byte-idênticos à v3 aprovada (diff confirma). 50 ids intactos, nenhum renumerado.

## HIGH
Nenhum.

## MEDIUM
Nenhum.

## LOW
Nenhum.

## Sections I would keep
- **R26 v5** — descreve exatamente o que `validationMetaSchema` lê (`contracts.ts:311`, `:322`) e como `parseValue` chega lá (`frontmatter.ts:123-130`); não afirma exigência que o código não faz nem esconde recusa que faz. Pronta para o CT «`validated_at: "2026"` é recusado» que a TESTS_SPEC pode acrescentar sem contradizer a regra.
- **R29 v5** — transcreve PRD v5 e GLOSSARY v3 sem afrouxar nem inventar condição; a citação de R30 fecha a única lacuna de raciocínio da v4; «para specs» é mais preciso que o PRD sem contrariá-lo.
- **R30–R34, S1–S5, P1–P5, C1–C5 e o preâmbulo** — inalterados desde a v3 carimbada; nada nesta rodada os afeta.

## Observações fora do escopo (para os owners; não são achados desta spec)
1. **`specs/AGENTS.md` v2** (draft, task-186 em andamento) ainda diz «O agente nunca carimba, nem quando o humano … responde «Aprovar»» e classifica a segunda forma como «desvio a corrigir» — contradiz PRD v5, GLOSSARY v3 e R29 v5. Precisa de v3 pelo Agents Steward antes do carimbo (C4 exige AGENTS `approved`). Repetido da r4; permanece.
2. **`contracts.ts:322`** — a mensagem «must be a quoted ISO-8601 date» sai para qualquer string inválida (`Jan 5`, `contracts.spec.ts:230`); «quoted» ali é a origem histórica da frase falsa da v3. Ajuste de texto opcional no Model.
3. **`specs/TESTS_SPEC.md` CT-035 e «Dados de teste»** carregam a imprecisão que M1 corrigiu aqui; proposta ao Test Agent na próxima versão. Repetido da r4.
4. O brief desta rodada cita `contracts.ts:310-311`; no disco `ISO_DATE` está em `:311` e o `refine` em `:322`. Só deslocamento de linhas, sem mudança de conteúdo.

## Veredito
**approved** — 0 HIGH, 0 MEDIUM, 0 LOW. A v5 muda exatamente o que o brief diz (frontmatter, R26, R29), absorve M1, L1 e L2 com os textos propostos, preserva os 50 ids, é exata contra o código em R26 e fiel ao PRD v5 / GLOSSARY v3 em R29. Revisão `current` sobre v5/21433beb: pronta para a pergunta de carimbo ao humano.
