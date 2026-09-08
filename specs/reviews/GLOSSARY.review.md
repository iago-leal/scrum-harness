---
file: GLOSSARY.md
reviewer: <modelo> (subagente revisor adversarial)
reviewed_version: 3
reviewed_digest: "cb29937a"
verdict: approved
round: 3
findings: { high: 0, medium: 0, low: 0 }
---
# Revisão adversarial — specs/GLOSSARY.md v3 (digest cb29937a) — rodada 3 (focada)

## Método
Somente leitura. Lidos na íntegra `specs/GLOSSARY.md` (107 linhas) e `git diff -- specs/GLOSSARY.md` (v2 commitada em 4bd927d → v3 no working tree). Confrontadas as duas entradas alteradas com o modelo do carimbo do PRD v5 (`specs/PRD.md:14` «Persona alvo» bullet 1, `:45` «Não objetivos» bullet 5, `:50` «Riscos conhecidos» bullet 2, `status: approved`) e com RULES.md v4 `R29` (`specs/RULES.md:41`, draft em revisão paralela). Coerência interna verificada contra «RequirementsContract» (l.58), «ReviewContract» (l.59), «Spec» (l.72), «Revisão de spec» (l.78), «Predecessor» (l.76), «Gate de ordem» (l.79), «Tool» (l.85) e a regra de uma frase por termo (l.10). Digest recalculado (sha1 do corpo trimado, 8 hex) = `cb29937a`, igual ao do brief. Nomes das seções cross-referenciadas conferidos em `specs/PRD.md:13` e `:48`.

## Absorção da rodada 2
Nada a absorver: a rodada 2 (v2, digest d4d9f35c) foi `approved` com 0 HIGH / 0 MEDIUM / 0 LOW.

## Diff v2→v3
O diff contém exatamente quatro linhas alteradas, todas esperadas:
- `specs/GLOSSARY.md:4-5` — `version: 2 → 3`, `status: approved → draft` (o brief pré-preenche draft; o carimbo é do humano).
- `specs/GLOSSARY.md:66` — «**Carimbo humano (stamp)**» reescrita para as duas formas do carimbo.
- `specs/GLOSSARY.md:98` — «**"aprovar" pelo agente**» reescrita para o mesmo modelo.
Nenhuma outra entrada, seção ou id mudou (o glossário não declara ids). Confirmado.

### Fidelidade ao PRD v5, condição a condição
| Condição no PRD v5 | «Carimbo humano» (l.66) | «"aprovar" pelo agente» (l.98) |
|---|---|---|
| Forma 1: o humano edita o campo (work item form / git) — `PRD.md:14`, `:45` | «ele mesmo edita o campo (work item form ou git)» ✔ | implícita via «(ver «Carimbo humano»)» ✔ |
| Forma 2: resposta «aprovar» a pergunta **explícita** do agente — `PRD.md:14`, `:45`, `:50` | «responde «aprovar» a uma pergunta explícita do agente» ✔ | «resposta explícita do humano a essa pergunta» ✔ |
| A pergunta nomeia arquivo **ou componente**, versão e digest — `PRD.md:14`, `:50` | «que nomeia o arquivo ou componente, a versão e o digest» ✔ | «que nomeia arquivo ou componente, versão e digest» ✔ |
| Texto com revisão `current` a 0 HIGH — `PRD.md:14`, `:45` | «cuja revisão `current` tem 0 HIGH» ✔ | «nem sobre texto sem revisão `current` a 0 HIGH» ✔ |
| O agente grava **só** o campo `status` — `PRD.md:14` | «o agente grava só esse campo» ✔ | «só grava `status: approved` depois da resposta…» ✔ |
| Pedido vago («pode seguir») não é carimbo — `PRD.md:50` | «um pedido vago não é carimbo» ✔ | «nunca … por pedido vago («pode seguir»)» ✔ |
| Nunca por iniciativa própria — `PRD.md:50` | (decorre de «decidido pelo humano») ✔ | «nunca por iniciativa própria» ✔ |
| O quadro lê, nunca escreve — `PRD.md:14`, `:45` | «o quadro o lê, nunca o escreve» ✔ | n/a (entrada sobre o agente) |

Nada inventado: a única condição do R29 que o glossário não repete literalmente («pergunta sem versão e digest não é carimbo», `RULES.md:41`) está contida em «pergunta … que nomeia … a versão e o digest», e a evidência-na-conversa do `PRD.md:50` é risco, não definição — a cross-ref «Riscos conhecidos» a alcança. Nada omitido.

### Coerência com o resto do glossário
- «Tool» (l.85): a escrita do agente no disco é `specs/` e `specs/reviews/` — gravar `status` numa spec é escrita em `specs/`; gravar `status` em `requirements` de componente passa pela tool, «a única superfície de escrita do agente no quadro». Coerente.
- «RequirementsContract» (l.58) segue dizendo «carimbo humano `status: approved`» — o nome do termo não mudou; a definição nova continua a chamá-lo de decisão do humano. Coerente.
- «Spec» (l.72) «o quadro … nunca escreve» ≡ l.66 «o quadro o lê, nunca o escreve». Coerente.
- «Revisão de spec» (l.78) define `current`; «ReviewContract» (l.59) define o equivalente para requisitos (mesma versão e mesmo digest, `verdict: approved`, `findings.high 0`). A l.66 usa «revisão `current` tem 0 HIGH» para ambos os casos — mesma leitura que o PRD v5 faz na `PRD.md:14`; não introduz termo novo.
- «Predecessor» (l.76) e «Gate de ordem» (l.79) não dependem do carimbo em si, só do estado `approved` + revisão `current`; intactos.
- As duas entradas apontam uma para a outra (l.98 «ver «Carimbo humano»») e para PRD/RULES (l.66) — cross-refs explícitas resolvem (`PRD.md:13` «Persona alvo», `:48` «Riscos conhecidos», `RULES.md:41` R29).
- Uma frase por termo (l.10): as duas entradas são uma frase cada (529 e 402 chars, encadeadas por «:», «—» e «;»), no mesmo formato de «Frontmatter» (l.55), «Predecessor» (l.76) e «Snapshot» (l.88); não viraram parágrafo. Sem achado.

### Contrato
- Frontmatter na linha 1, cercas `---`; `title` e `purpose` entre aspas duplas; `version: 3` inteiro nu; `status: draft`; `owner: domain` (dono de GLOSSARY.md no catálogo). ✔
- Nenhum id declarado no início de linha (glossário não os tem; nada a colidir). ✔
- Seções presentes: `## Termos` (l.12, com os cinco subgrupos), `## Sinônimos proibidos` (l.94), `## Ver também` (l.105). ✔

## HIGH
Nenhum.

## MEDIUM
Nenhum.

## LOW
Nenhum.

## Sections I would keep
- l.66 «Carimbo humano (stamp)» exatamente como está: cobre as duas formas, a tríade arquivo-ou-componente/versão/digest, o 0 HIGH, o «só esse campo», o pedido vago e o «quadro nunca escreve», com cross-ref às três fontes.
- l.98 «"aprovar" pelo agente»: é a face negativa da l.66 e enumera as três recusas (iniciativa própria, pedido vago, texto sem revisão `current` a 0 HIGH) sem repetir a definição.
- Tudo o mais, inalterado desde a v2 aprovada.

## Veredito
**approved** — 0 HIGH, 0 MEDIUM, 0 LOW. A v3 muda só o que o brief anunciou e as duas entradas espelham o PRD v5 condição a condição, coerentes com RULES.md R29 e com o restante do glossário. Pronta para o carimbo humano (`status: approved`) sobre a versão 3, digest `cb29937a`.
