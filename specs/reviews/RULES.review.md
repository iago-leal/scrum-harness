---
file: RULES.md
reviewer: claude (subagent, revisor adversarial)
reviewed_version: 3
reviewed_digest: "a4e01184"
verdict: approved
round: 3
findings: { high: 0, medium: 0, low: 1 }
---
# Revisão adversarial — specs/RULES.md v3 (digest a4e01184) — rodada 3

Método: digest recalculado sobre o corpo trimado (sha1, 8 hex) = `a4e01184` (confere); frontmatter na linha 1 com `version: 3` nu, `status: draft`, `owner: domain`, `title`/`purpose` entre aspas; **50 ids (R1–R35, S1–S5, P1–P5, C1–C5), cada um declarado exatamente uma vez** no início de linha (contagem mecânica: 50 ocorrências, 50 únicos, 0 duplicados). `specs/` não está versionado em git, então a comparação v2 → v3 foi feita linha a linha contra as citações verbatim da rodada 2 (preâmbulo, R7, R16, R23, R26, R34, R35, S2, S3, C4, P1, P2, P3) — todas idênticas na v3. As quatro linhas que a rodada 2 pediu (S5, R31, R28, S1) foram reconferidas contra `packages/scrum-probe/src/{specs,files}.ts`, `packages/scrum-api/src/index.ts` e o estado vivo do quadro (`scrum_suite_budget`).

## Rodada 2 — absorção item a item

| Achado r2 | Absorvido? | Evidência na v3 |
|---|---|---|
| **M1** S5 enumerava dois resultados de erro onde a sonda tem quatro | **Sim** | S5: "As sondas (`scrum-probe`) nunca lançam: erro de leitura vira `absent`, `not-a-directory`, listagem vazia ou `unreadable` (por arquivo), nunca exceção; `node_modules`, `.git`, nomes com ponto e os nomes simples do `.gitignore` raiz nunca são listados." Confere com `specs.ts`: `statSync(dir)` falho → `{ kind: 'absent' }` (l. 49–51); `!stat.isDirectory()` → `not-a-directory` (l. 53); `readdirSync` falho → `{ kind: 'dir', files: [] }` (l. 56–58); `statSync`/`readFileSync` de arquivo listado falho → `{ name, size: 0, unreadable: true }` (l. 89–93). Confere com `files.ts`: `stat` falho → `{ files: [], truncated: false }` (l. 51–53); `readdirSync` falho → `continue` (l. 66–68); `ALWAYS_SKIPPED = {node_modules, .git}`, `name.startsWith('.')`, `ignore.has(name)` (l. 20, 57). |
| **L1** R31 "ordem por code point" | **Sim** | R31: "ordem por comparação de string (`<`, unidade UTF-16 — igual a code point salvo entre um astral e um BMP acima de U+D7FF)". Confere: `specs.ts:72` `a.name < b.name`, `files.ts:80` `a < b`. |
| **L2** R28 "Este quadro está em 10 s" como invariante | **Sim** | R28: "Este quadro está em 10 s (hoje — estado do quadro, mutável por `scrum_suite_budget`, não invariante)." O quadro responde hoje `suite budget: 10s (board, set 2026-09-02)`. |
| **L3** S1 sem o `code` do 415 | **Sim** | S1: "415 `unsupported-media-type` antes do dispatch". Confere: `scrum-api/src/index.ts:182` `json(res, 415, { ok: false, code: 'unsupported-media-type', … })`; `MAX_BODY_BYTES = 262_144` (l. 29) e `req.destroy()` (l. 159). |

Nada além dessas quatro linhas mudou materialmente: as demais 46 regras, o preâmbulo, as marcas "(convenção da casa, não gate)" e o "Ver também" são os da v2 aprovada.

## HIGH
Nenhum. Nenhum fato novo falso; nenhuma regra apresentada como imposta que o código não imponha; nenhum id duplicado; números inalterados (80/120, 64/96, 15 s default/10 s no quadro, 262 144, 1 800, 3 855, 20, 500, 3 rodadas, `version: 1`, 7 arquivos do pipeline, 3 do conjunto mínimo).

## MEDIUM
Nenhum.

## LOW
- **L1 — S5 "listagem vazia" cobre dois casos com formas diferentes**: `readdirSync(specs)` falho dá `{ kind: 'dir', files: [] }` (lista vazia de fato), mas `specs/reviews` ilegível/ausente/não-diretório dá `reviews` **omitido** (`undefined`, `specs.ts:76–83`), não `reviews: []`. Para a regra, é o mesmo resultado (nada listado, nada lançado); para um CT do TESTS_SPEC, o assert é `reviews === undefined`, não `reviews.length === 0`. Texto proposto pela própria rodada 2; registro só para orientar o CT. Não bloqueia.

## Contradições com PRD/GLOSSARY
Nenhuma. As quatro linhas alteradas não tocam vocabulário nem números do PRD v3 / GLOSSARY v2.

## Seções que eu manteria
- **Preâmbulo** — inalterado desde a v2; continua verificável linha a linha: toda regra fora do Model nomeia sua superfície.
- **S5 v3** — agora enumera os quatro destinos reais do erro da sonda (`absent`, `not-a-directory`, listagem vazia, `unreadable` por arquivo) e a lista de nomes nunca listados, na ordem em que o código os testa.
- **R31 v3** — a ordem de listagem descrita pela operação real (`<` de string) com a única divergência de code point nomeada; imune a um CT com par astral/BMP.
- **R28 v3** — o "10 s" separado do invariante, marcado como estado do quadro; envelhece sem virar erro.
- **S1 v3** — simétrica a S2: código do 415 nomeado, corpo máximo em bytes e o destino da conexão.
- **R7, R16, R23, R26, R35, S2, S3, P2, P3, C4** — idênticas à v2, já conferidas contra `contracts.ts`, `service.ts`, `traces.ts`, `spec.ts`, `scrum-api`, `context-scrum` e `repo-specs.spec.ts`.
- **R1–R6, R8–R15, R17–R22, R24, R25, R27, R29, R30, R32–R34, S4, P1, P4, P5, C1–C3, C5** — inalteradas desde as rodadas 1–2.

## Veredito
**approved** — 0 HIGH, 0 MEDIUM, 1 LOW. Os quatro achados da rodada 2 (1 MEDIUM + 3 LOW) foram absorvidos com o texto proposto e reconferidos contra `scrum-probe/src/{specs,files}.ts`, `scrum-api/src/index.ts` e o quadro; nada mais mudou; 50 ids únicos; frontmatter `version: 3`, `status: draft`, `owner: domain`; digest `a4e01184`. Pronto para o carimbo humano (`status: approved`).
