---
file: AGENTS.md
reviewer: subagent (revisor adversarial)
reviewed_version: 4
reviewed_digest: "b3bfef05"
verdict: approved
round: 4
findings: { high: 0, medium: 0, low: 0 }
---
# Revisão adversarial — specs/AGENTS.md v4 (digest b3bfef05) — rodada 4 (fechamento)

## Método
- Li `specs/AGENTS.md` v4 inteira (121 linhas, 32 334 bytes; v3 tinha 120 linhas, 31 407 bytes — +1 linha de Histórico, +927 bytes) e o parecer da rodada 3 (v3/1fbbed02, approved 0/0/4). Confirmei versão e digest pela tool: `AGENTS.md [draft v4 · b3bfef05] agents — no ids · review stale: … digest 1fbbed02 ≠ b3bfef05`. Rodada focada: absorção item a item de L1–L3, declaração de L4, diff v3→v4 por comparação com as citações literais do parecer da rodada 3 (a v3 não está no git — `specs/AGENTS.md` é `??` no `git status`), contrato.
- Evidência lida: `git log --oneline` (32 commits; `b7c0d72`…`7337ecd` = 18; `grep -cE 'SCRUM v0\.[0-9]+ - '` = 13; `e85fd1e SCRUM v0.3-v0.7: …`), `specs/TESTS_SPEC.md:4-5` (`version: 5`, `status: approved`), `:13` (v5 absorve 3 LOW), `scrum_spec_status` (TESTS_SPEC `approved v5 · review current`), `packages/scrum-domain/src/spec-brief.ts:108-115` (template de AGENTS.md). Nenhum instalador, build nem suite; nenhum arquivo além deste parecer foi escrito.

## Absorção da rodada 3
- **L1 («nunca no storage»; «`status`/`phase` … tool ou GUI») — absorvido com o texto proposto.** Linha 61 («Decidir um `approved`»): «só a linha `status:`, nada no corpo, e sempre pelo arquivo (spec) ou pela tool (requisitos) — nunca editando o storage». Linha 62 («Contornar um gate»): «nunca mudar `status`/`phase` **de um item do quadro** por caminho que não seja a tool ou a GUI». Agora a proibição e a permissão da linha 85 (`scrum_item_update requirements`) e da linha 63 (edição da linha `status:` no arquivo) não colidem. Histórico linha 13 registra ✓.
- **L2 (Histórico afirmava «seguiram a forma 2») — absorvido com o texto proposto.** Linha 14: «Os carimbos gravados até a v2 nasceram de perguntas explícitas do agente com resposta «Aprovar» — a substância da forma 2 antes de ela estar escrita; se cada pergunta nomeou versão e digest, só a conversa sabe (PRD.md «Riscos conhecidos»). PRD v5/GLOSSARY v3/RULES v5 a formalizaram e eles ficam como estão». Não afirma mais o que o repo não sustenta ✓.
- **L3 (13 + 1; TESTS_SPEC v5) — absorvido.** (a) Linha 108: «18 commits, 13 com o prefixo `SCRUM v0.NN - …` e um `SCRUM v0.3-v0.7: …`, até `b7c0d72` v0.20» — `git log`: 13 com `SCRUM v0.NN - ` (v0.8…v0.20) + `e85fd1e`; 18 de `b7c0d72` (15º) a `7337ecd` (32º) ✓. (b) Linha 14 (fim): «TESTS_SPEC.md v4 alinhou as linhas 32-33 aos scripts corrigidos (v5, `approved`, na escrita da v4 desta spec)» — `TESTS_SPEC.md:4-5` v5 approved, `:13` v5 = absorção de 3 LOW da rodada 4 (o alinhamento foi na v4) ✓; linha 116: «v4+ alinhada aos scripts do `package.json`, sem `--dry`» ✓.
- **L4 (procedimento repetido) — não absorvido, declarado.** Linha 13: «L4 … não absorvido: cada cópia é coerente e a canônica é «Humano»; corte fica para uma versão que mude o conteúdo». Aceitável: um LOW pode ficar como dívida registrada; as cópias (linhas 50, 57, 61, 85) continuam coerentes com a linha 45 na v4. Não reaberto, não contado.

## Diff v3→v4
Comparação de cada citação literal do parecer da rodada 3 com a v4 (deslocamento uniforme de +1 linha a partir do Histórico):
- **Frontmatter**: só `version: 3` → `version: 4`; `title`, `purpose`, `status: draft`, `owner: agents` iguais ✓.
- **Histórico**: linha v4 nova (13); linha v3 (14) muda só a frase de L2 e o parêntese de TESTS_SPEC (L3b); linhas v2 e v1 (15-16) iguais ✓.
- **«Decidir um `approved`»** (61): só a frase de L1; as quatro recusas, «o autor nunca o troca», «o quadro (tools, API, GUI) nunca escreve o carimbo», «fica como está … ratificá-lo à mão é decisão do humano» — iguais ✓.
- **«Contornar um gate»** (62): só «de um item do quadro»; o resto igual ✓.
- **«Commits»** (108): só «13 … e um `SCRUM v0.3-v0.7: …`»; «human-stamped (explicit answer)/(edited by hand)», `4bd927d`/`093a166`, comp-53/54, hotfix v0.23 iguais ✓.
- **«Ver também › TESTS_SPEC»** (116): só «v4+ alinhada» ✓.
- **Inalterados, conferidos contra as citações da rodada 3**: «Humano» (45, procedimento (a)–(e) e as quatro recusas), «Sequência fixa» (46), «30 tools» (50), «Perguntas ao humano» (57), «Escrever specs fora do pipeline» (63), «Espiral › Requisitos» (85), «Specs» (100-105, incl. «509/510», `specs.ts:129-145`, `repo-specs.spec.ts:24`/`:32`), «Build do browser» (54), «Suite» (52, «18 arquivos, 510 testes, ~2,4 s»), «Artefato `validation`» (76), «Ver também» RULES/GLOSSARY/PRD (115, 118, 119) ✓. Nenhum resíduo do modelo estrito; nenhuma frase nova fora das seis áreas listadas.

## Contrato
- Frontmatter na linha 1: `title`/`purpose` entre aspas duplas, `version: 4`, `status: draft`, `owner: agents` ✓ (`scrum_spec_status` parseia e mostra `draft v4 · b3bfef05`).
- Ids: `grep -E '^(R|S|P|C)[0-9]+( — |\. )|^CT-[0-9]{3}( — |\. )'` → 0 linhas; tool: «no ids» ✓.
- Seções na ordem do template (`spec-brief.ts:108-115`): `## Persona` → `## Ferramentas permitidas` → `## Ferramentas proibidas` → `## Regras de output` → `## Restrições obrigatórias`, com `## Histórico` antes e `## Ver também` no fim ✓; 32 334 bytes ≪ 256 KiB.

## HIGH
Nenhum.

## MEDIUM
Nenhum.

## LOW
Nenhum. (L4 da rodada 3 fica como dívida declarada no Histórico, por decisão do autor; não é achado novo.)

## Sections I would keep
- **Persona › Humano** (45) — as duas formas de R29 e o procedimento (a)–(e), inalterados desde a v3 aprovada.
- **Ferramentas proibidas › Decidir um `approved` / Contornar um gate** (61-62) — com L1 absorvido, permissão (arquivo ou tool) e proibição (editar o storage; `status`/`phase` de item do quadro) fecham sem ambiguidade.
- **Histórico** (13-16) — absorção item a item, L4 declarado não absorvido com razão, e a frase sobre os carimbos anteriores agora diz só o que o repo sustenta.
- **Commits e segredos** (108) — a contagem 13 + 1 bate à letra com o `git log`; a forma do carimbo na mensagem segue como única evidência no git.
- **Restrições › Specs** (100-105) — inalterada e ainda correta (DAG direto, `review current` depois do carimbo, dois `it`).

## Veredito
**approved** — 0 HIGH, 0 MEDIUM, 0 LOW. L1, L2 e L3 da rodada 3 estão absorvidos com os textos propostos e evidência viva (`git log`: 13 + `e85fd1e`; `TESTS_SPEC.md:4-5` v5 approved); L4 fica declarado como não absorvido, com razão, no Histórico. O diff v3→v4 limita-se ao frontmatter, ao Histórico e às quatro frases de L1/L3; todo o resto bate com as citações da rodada 3. Contrato íntegro (`draft v4 · b3bfef05`, sem ids, seções na ordem do template). A v4 pode ir ao carimbo humano como está — pergunta nomeando `specs/AGENTS.md`, v4, digest `b3bfef05`, rodada 4, 0/0/0.
