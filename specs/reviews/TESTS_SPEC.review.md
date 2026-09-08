---
file: TESTS_SPEC.md
reviewer: subagent (revisor adversarial)
reviewed_version: 5
reviewed_digest: "d47ea203"
verdict: approved
round: 5
findings: { high: 0, medium: 0, low: 0 }
---
# Revisão adversarial — specs/TESTS_SPEC.md (v5, digest d47ea203) — rodada 5 (fechamento)

## Método
Rodada de fechamento, somente leitura, restrita à confirmação dos 3 LOW da rodada 4. `specs/TESTS_SPEC.md` segue untracked (`git status` → `??`), logo sem `git diff`: comparei a v5 contra as citações literais do relatório da rodada 4 (linhas 10, 83 e 165 da v4, e os três textos propostos em L1/L2/L3) e fechei o diff por aritmética de bytes (v4: 174 linhas, 44 973 bytes, do relatório anterior; v5: 175 linhas, 45 437 bytes, `wc`). Evidência no disco: `specs/RULES.md:4-5` (`version: 5`, `status: approved`); `packages/scrum-domain/tests/contracts.spec.ts:229-233` (o `it` «validated_at must be an ISO-8601 date; a bare all-digit value must be quoted»); `packages/test-support/src/fixtures.ts:20` (`contractReview`, `reviewed_digest: ${digest}` sem aspas) e `:58` (`specReviewText`, `"${over.digest}"` entre aspas). `scrum_spec_status`: `TESTS_SPEC.md [draft v5 · d47ea203] test — 76 ids (CT-001 … CT-076) · review stale` (stale porque este relatório cobria a v4 — esperado; RULES.md `approved v5 · 21433beb · review current`, API_SPEC.md `approved v2 · b720677f · review current`). Sem instaladores, builds ou suite.

## Absorção da rodada 4

**L1 (linha 10 citava «RULES.md (v3)») — absorvido verbatim.** v5 linha 10: «Este documento diz como as regras de RULES.md (v5) e os contratos de API_SPEC.md (v2) são provados…» — o texto proposto. `grep 'RULES.md (v3)'` → 0 ocorrências. Evidência: `specs/RULES.md:4` `version: 5`, `:5` `status: approved`; `scrum_spec_status` RULES.md v5 ✓.

**L2 (CT-035: «entre aspas, `ISO_DATE` exige os hífens» sem asserção literal) — absorvido verbatim.** v5 CT-035 (linha 84): «…entre aspas, `ISO_DATE` exige os hífens (o `it` prova `'Jan 5'` e `2026` nu; `"2026"` entre aspas literal: a escrever) —, só-frontmatter não é evidência…» — o texto proposto, no lugar proposto. Evidência: `contracts.spec.ts:229-233` envia `'Jan 5'` (l.230), `'2026'` nu (l.231), `'"2026-09-02T10:00:00Z"'` entre aspas → `ok: true` (l.232) e `'2026-09-02T10:00:00.000Z'` nu → `ok: true` (l.233); nenhuma linha envia `"2026"` entre aspas — a marca «a escrever» é correta ✓. A prova citada («validated_at must be an ISO-8601 date») é o nome do `it` da l.229 ✓.

**L3 («Textos de artefato inline» omitia `contractReview` de `test-support`) — absorvido verbatim.** v5 linha 166: «(`VALID_VALIDATION` tem `validated_at: 2026-09-02`; `approvedReview`/`CONTRACT_REVIEW` e `contractReview` de `test-support` interpolam o digest hex sem aspas)» — o texto proposto. Evidência: `fixtures.ts:20` `reviewed_digest: ${digest}` (sem aspas) ✓; a frase seguinte, «`specReviewText` e os briefs pré-preenchidos sempre citam o digest entre aspas», segue verdadeira — `fixtures.ts:58` `reviewed_digest: "${over.digest}"` ✓.

**Resultado: 3/3 absorvidos.**

## Diff v4→v5
- Frontmatter: só `version: 4` → `version: 5`; `title`/`purpose`/`status: draft`/`owner: test` idênticos ao conferido na rodada 4 ✓.
- «Histórico»: uma linha nova (v5, linha 13, 348 bytes com o `\n`) nomeando L1/L2/L3 e o destino de cada um; as linhas v4/v3/v2/v1 idênticas ✓.
- Aritmética de bytes fecha **exatamente**: 45 437 − 44 973 = 464 = 348 (linha v5 do Histórico) + 79 (parêntese novo de CT-035) + 37 (« e `contractReview` de `test-support`»); L1 é substituição de mesmo comprimento (`v3` → `v5`). Linhas: 174 + 1 = 175 ✓. Logo nenhuma outra passagem mudou de tamanho — e, relidas «Níveis», os 76 CTs, «Pyramid alvo», «O que NÃO testar», «Dados de teste» e «Ver também» contra as citações das rodadas 2–4, nenhuma mudou de texto ✓.
- Nenhum CT renumerado, removido ou novo; a regra citada em CT-035 (R26) inalterada ✓.

## Contrato da spec (conferido)
- Frontmatter na linha 1: `version: 5`, `status: draft`, `owner: test`; `title`/`purpose` entre aspas ✓; 45 437 bytes < 256 KiB ✓.
- 76 ids `CT-nnn` no início de linha (`grep -o '^CT-[0-9]*' | wc -l` = 76), sem duplicata (`sort | uniq -d` vazio), CT-001 … CT-076; `scrum_spec_status` lê os mesmos 76 e o digest d47ea203 ✓.
- Nenhuma linha começa com `R<n>`, `S<n>`, `P<n>` ou `C<n>` (`grep -cE '^[RSPC][0-9]+'` = 0) ✓.
- Seções do template: Histórico, Níveis, Casos críticos, Pyramid alvo, O que NÃO testar, Dados de teste, Ver também ✓.

## HIGH
Nenhum.

## MEDIUM
Nenhum.

## LOW
Nenhum.

## Sections I would keep
- **CT-035 (linha 84)**: os três casos do parser (nu válido, só-dígitos nu, só-dígitos entre aspas) agora com a marca «a escrever» exatamente onde a suite não tem asserção — a regra da casa da linha 10 aplicada a si mesma.
- **«Textos de artefato inline» (linha 166)**: lista completa dos que interpolam o digest sem aspas, incluindo a fixture canônica de `test-support`, ao lado da única que cita entre aspas (`specReviewText`) e do porquê.
- **«Histórico» v5 (linha 13)**: absorção item a item, com o destino de cada LOW nomeado — verificável em três `grep`.

## Veredito
**approved** — 0 HIGH, 0 MEDIUM, 0 LOW. Os três LOW da rodada 4 estão absorvidos com os textos propostos (`RULES.md:4`, `contracts.spec.ts:229-233`, `fixtures.ts:20`/`:58`); o diff v4→v5 fecha por bytes (464 = 348 + 79 + 37) e por linhas (+1) sobre as quatro passagens declaradas; frontmatter, 76 ids únicos, ausência de ids R/S/P/C no início de linha e seções do template íntegros. Pronto para o carimbo humano (v5, digest `d47ea203`).
