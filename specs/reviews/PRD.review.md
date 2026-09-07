---
file: PRD.md
reviewer: subagent adversarial reviewer (<modelo>)
reviewed_version: 3
reviewed_digest: "560207d2"
verdict: approved
round: 3
findings: { high: 0, medium: 0, low: 0 }
---
# Revisão adversarial — specs/PRD.md (v3, digest 560207d2) — rodada 3

Rodada de fechamento, como combinado na rodada 2: absorção item a item dos 4 achados (H1, L1, L2, L3), confirmação de que nada mais mudou materialmente, e leitura completa da v3 à procura de fato falso novo. Fontes: `specs/PRD.md` (v3), `specs/reviews/PRD.review.md` (rodada 2, com as citações da v2), `scrum_spec_status` (PRD.md `draft v3 · 560207d2`, owner `product`, sem ids — o template do PRD não os exige). A tabulação de cerimônias da rodada 2 (spr-21: só review + retrospectiva; spr-22 a spr-25 com as três) foi tomada como fonte, não refeita.

## Absorção da rodada 2 (item a item)

| Achado | Absorvido? | Onde (citação da v3) |
|---|---|---|
| H1 — spr-21 sem Planning (critério 2) | **Sim**, opção (a) adotada literalmente | «Toda sprint encerrada a partir da spr-11 (rel-17) tem Planning, Review e Retrospectiva registradas como cerimônias, **com uma exceção declarada: a spr-21 não tem Planning registrada (aberta a partir dos action-items da retrospectiva da spr-20)**; spr-1 a spr-10 são legado anterior à disciplina …» |
| L1 — parêntese do legado não era exaustivo | **Sim**, texto proposto adotado | «(a spr-1 não tem cerimônia; spr-2 a spr-7 não têm retrospectiva; spr-8 a spr-10 já têm as três, mas ficam no legado por serem anteriores à espiral)» |
| L2 — TASKS/README fora da rel-21 | **Sim**, nas duas linhas do «Ver também» | «TASKS.md — … **Fora da rel-21: a escrever em release posterior.**» / «`specs/README.md` — … **Fora da rel-21: a escrever em release posterior.**» |
| L3 — o que `repo-specs.spec.ts` confere | **Sim**, texto proposto adotado | «— o teste de aceitação (`repo-specs.spec.ts`) confere esses sete **e ainda que nada em `specs/` esteja inválido, desconhecido ou sem revisão `current`**.» |

## Nada mais mudou materialmente

Conferi cada citação da v2 registrada na tabela da rodada 2 (H1, H2, M2, M3, M4, L1–L6 da rodada 1) contra a v3: todas continuam presentes, palavra por palavra, nas mesmas seções. Visão, Persona alvo, Jobs to be done, os sete Objetivos do produto, critérios 1, 4 e 5, os seis Não objetivos e os seis Riscos conhecidos estão inalterados. As únicas diferenças da v2 para a v3 são as quatro frases acima e o `version: 3`. Frontmatter íntegro: `version: 3`, `status: draft` (o carimbo `approved` é humano), `owner: product`, `title`/`purpose` presentes.

Fato novo introduzido pela v3 — só um, e verdadeiro: «a spr-21 não tem Planning registrada (aberta a partir dos action-items da retrospectiva da spr-20)» — bate com a tabulação da rodada 2 (cer-114 review + cer-115 retrospective, nascida dos action-items da cer-113). Os demais números seguem os já conferidos (80/120; 10 s hoje / default 15 s; ≤ 1 800; comp-47 = v0.14; comp-42/comp-48 à mão; spr-11 = primeira sprint da rel-17; os sete arquivos do `PIPELINE`).

## HIGH

Nenhum.

## MEDIUM

Nenhum.

## LOW

Nenhum.

## Sections I would keep

- **Visão** e **Persona alvo**: inalteradas desde a v2 — as duas personas dizem quem carimba o quê e por onde, e «disciplina que não dependa de obediência ao prompt» continua a melhor frase do documento.
- **Jobs to be done**: os cinco jobs mapeiam 1:1 para o que existe, com os sete papéis do catálogo no item 4.
- **Objetivos do produto**: todos os sete, cada número conferido nas rodadas anteriores; o objetivo 1 qualificado sem perder a força.
- **Critérios de sucesso**, agora os cinco: o critério 2 diz a verdade sobre o furo da spr-21 e sobre o legado spr-1 a spr-10; o critério 3 descreve o gate inteiro do `repo-specs.spec.ts`, não só a contagem.
- **Não objetivos**: os seis, corretos.
- **Riscos conhecidos**: o item 1 honesto (hotfix fora da espiral); os outros cinco, hipóteses verificáveis.
- **Ver também**: as quatro linhas agora distinguem o que a rel-21 entrega (GLOSSARY, RULES) do que é referência da cadeia para release posterior (TASKS, `specs/README.md`), sem promessa que derrubaria o teste de aceitação.

## Verdict

**approved** — a v3 absorveu integralmente o HIGH e os três LOW da rodada 2 com os textos propostos, não alterou nenhuma outra seção, e o único fato novo (a exceção da spr-21) é verdadeiro pela tabulação do quadro. Não há mais nenhuma afirmação histórica no PRD que o próprio quadro desminta. Pronto para o carimbo humano (`status: approved` no frontmatter).
