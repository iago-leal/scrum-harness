---
file: PRD.md
reviewer: subagent adversarial reviewer (<modelo>)
reviewed_version: 5
reviewed_digest: "8099e2d5"
verdict: approved
round: 5
findings: { high: 0, medium: 0, low: 2 }
---
# Revisão adversarial — specs/PRD.md (v5, digest 8099e2d5) — rodada 5 (fechamento)

## Método
Rodada de fechamento, somente leitura. Fontes: leitura integral de `specs/PRD.md` v5 (60 linhas); `scrum_spec_status` (PRD.md `draft v5 · 8099e2d5`, owner `product`, sem ids; revisão anterior `stale` por versão e digest — como esperado); `specs/reviews/PRD.review.md` rodada 4 (v4/78228fa7, `approved`, `findings { 0, 2, 2 }`) para conferir a absorção item a item; `git diff -- specs/PRD.md` e `git diff --stat` (v3 commitada → v5 no working tree: 1 arquivo, 5 inserções, 5 remoções); template do PRD em `packages/scrum-domain/src/spec-brief.ts:31-40` para as seções. Não rodei suite, instalador nem build; não modifiquei nada além deste parecer.

## Absorção da rodada 4
| Achado | Onde (v5) | Citação | Estado |
|---|---|---|---|
| **M1** — condição «revisão `current` com 0 HIGH» ausente nas três frases | `specs/PRD.md:14` | «…a versão e o digest **de um texto cuja revisão `current` tem 0 HIGH**, caso em que o agente grava só o campo `status`» | absorvido, texto proposto |
| | `specs/PRD.md:45` | «…que nomeia arquivo, versão e digest **de um texto com revisão `current` sem HIGH**» | absorvido, texto proposto |
| | `specs/PRD.md:50` | «…versão e digest **de um texto já revisado**» | absorvido (a forma opcional proposta para o Risco; a condição forte fica em l.14/l.45, como a rodada 4 admitia) |
| **M2** — risco cala que a evidência da forma 2 fica só na conversa | `specs/PRD.md:50` | «**; a evidência da segunda forma (a pergunta e a resposta) fica na conversa, que o quadro não persiste — no git os dois carimbos são indistinguíveis**, salvo o que a mensagem de commit declarar.» | absorvido, texto proposto + qualificador «salvo o que a mensagem de commit declarar» (honesto e verdadeiro: a convenção de commit da casa escreve `human-stamped`) |
| **L1** — «os dois carimbos» ambíguo em l.14 | `specs/PRD.md:14` | «o quadro reflete **os carimbos de requisitos e de specs**, nunca os escreve por conta própria» | absorvido, texto proposto |
| **L2** — l.45/l.50 sem «arquivo/componente» | `specs/PRD.md:45` | «que nomeia **arquivo**, versão e digest» | absorvido, texto proposto |
| | `specs/PRD.md:50` | «que nomeia **arquivo ou componente**, versão e digest» | absorvido, texto proposto |

Os quatro achados foram absorvidos com os textos propostos, nas mesmas três frases, sem nada a mais. `version: 5` em `specs/PRD.md:4`.

## Diff v3→v5
`git diff --stat -- specs/PRD.md`: `1 file changed, 5 insertions(+), 5 deletions(-)`. As cinco linhas trocadas são exatamente:
1. `specs/PRD.md:4` — `version: 3 → 5`.
2. `specs/PRD.md:5` — `status: approved → draft` (correto: texto novo, carimbo cai).
3. `specs/PRD.md:14` — Persona alvo, bullet 1 (as duas formas de carimbo, M1 + L1).
4. `specs/PRD.md:45` — Não objetivos, bullet 5 (M1 + L2).
5. `specs/PRD.md:50` — Riscos conhecidos, bullet 2 (M2 + L2 + «já revisado»).

`title`, `purpose`, `owner`, Visão, Jobs, Objetivos, Critérios, os demais bullets de Persona/Não objetivos/Riscos e «Ver também» estão byte-idênticos à v3 commitada. Escopo confirmado: só frontmatter e as três frases.

### Releitura das três frases
- **Contradição interna**: nenhuma. As três dizem o mesmo modelo — decisão humana; duas formas (edição direta / «aprovar» a pergunta explícita com arquivo-ou-componente + versão + digest sobre texto com revisão `current` sem HIGH); o agente grava só `status`; pedido vago não vale; o quadro só lê. l.14 é a mais completa, l.45 e l.50 são compatíveis com ela e não a alargam.
- **Coerência com o resto do PRD**: Visão l.11 («persistido fora das conversas … sobreviva à conversa») não é contradita por l.50 — l.50 declara justamente, como risco, o pedaço do processo que **não** sobrevive à conversa, que é o papel da seção. Jobs l.21 («carimbo humano») continua verdadeiro: a decisão é humana nas duas formas. Objetivo 7 l.31 («o quadro lê, contrata e rastreia, nunca as escreve») ✓ — quem grava na forma 2 é o agente, não o quadro. Critério 3 l.36 (`approved` com revisão `current`) é indiferente à forma e agora é reforçado por l.14/l.45 (a forma 2 só cai sobre revisão `current` sem HIGH).
- **Peso**: l.14 (~620 caracteres) e l.50 (~560) são os dois bullets mais longos do PRD; l.50 encadeia cinco orações com dois travessões e três ponto-e-vírgulas. Legível, mas no limite para um bullet de PRD — ver L2 (estilo, opcional).

## HIGH
Nenhum.

## MEDIUM
Nenhum.

## LOW

### L1 — «no git os dois carimbos são indistinguíveis» (`:50`) só cobre specs; o bullet fala de «arquivo ou componente»
- **Problema.** A frase de M2 foi absorvida com «no git», mas o mesmo bullet acaba de dizer que a pergunta nomeia «arquivo **ou componente**». Requisitos de componente não vivem no git: vivem no storage do quadro, onde as duas formas também são indistinguíveis (o artefato guarda o texto, não quem o gravou) — e ali nem a mensagem de commit socorre.
- **Por que importa.** Pequena: o risco continua verdadeiro e completo para specs; para requisitos fica implícito. Quem citar só o Risco (GLOSSARY «Carimbo humano», RULES R29) pode ler que o problema de rastro é do git.
- **Mudança concreta (opcional).** «— no git (specs) e no storage do quadro (requisitos) os dois carimbos são indistinguíveis, salvo o que a mensagem de commit declarar.»
- **Evidência.** `specs/PRD.md:50`; `specs/PRD.md:14` («work item form para requisitos, `specs/` no git para specs»); `specs/PRD.md:22` («o quadro em storage próprio, as specs e revisões no git»).

### L2 — `:50` ficou pesado para um bullet de PRD (estilo)
- **Problema.** Cinco orações, dois travessões aninhados e três ponto-e-vírgulas num único bullet; o parêntese «— edição direta do humano, ou resposta explícita … de um texto já revisado —» repete o que l.14 e l.45 já definem.
- **Por que importa.** Só legibilidade; não há erro nem ambiguidade.
- **Mudança concreta (opcional).** Cortar o parêntese e apontar: «o carimbo é decisão humana por convenção de tool e brief (as duas formas da Persona), não por verificação de identidade; um pedido vago («pode seguir») não é carimbo, e nada impede um agente desobediente de gravar o campo; a evidência da segunda forma …».
- **Evidência.** `specs/PRD.md:50` vs `:14`, `:45`.

Ambos os LOW são não-bloqueantes; o autor pode decidir **não** absorvê-los e levar a v5 ao carimbo como está (evita uma rodada 6 sobre estilo).

## Observações fora do escopo do PRD (sem achado; para os owners seguintes)
- `specs/AGENTS.md` v2 (`draft`, revisão `current`) fixa o modelo **estrito** («o agente nunca carimba, nem quando o humano … responde «Aprovar» a uma pergunta»; «Desvio a corrigir a partir de agora») — contradiz o PRD v5, que é a raiz da cadeia e diz o modelo de duas formas. Não é achado do PRD: é o AGENTS.md (task-186, em andamento) que deve alinhar-se numa v3, junto com GLOSSARY.md `:66`/`:98`, RULES.md R29 e a convenção do brief em `spec-brief.ts:168` («never yours»), como a rodada 4 já apontou.

## Sections I would keep
- **Persona alvo** (`:14-15`) — bullet 1 agora enuncia as cinco condições da forma 2 e desfaz a ambiguidade de «os dois carimbos»; é a frase de referência para GLOSSARY e RULES. Bullet 2 intocado e continua a melhor justificativa do produto.
- **Não objetivos** (`:41-46`) — bullet 5 mantém «o quadro só lê» como cláusula final e agora cita arquivo, versão, digest e revisão `current` sem HIGH.
- **Riscos conhecidos** (`:49-54`) — bullet 2 é honesto em três camadas: desobediência, ausência de verificação de identidade, e agora a evidência que não sobrevive à conversa; o qualificador da mensagem de commit é verdadeiro e útil.
- **Visão, Jobs, Objetivos, Critérios, Ver também** — byte-idênticos à v3 aprovada; nada a rever.

## Veredito
**approved** — 0 HIGH, 0 MEDIUM, 2 LOW. Os quatro achados da rodada 4 (M1, M2, L1, L2) foram absorvidos item a item com os textos propostos; o diff v3→v5 está confinado ao frontmatter (`version: 5`, `status: draft`) e às três frases (`:14`, `:45`, `:50`); as três frases não se contradizem entre si nem com Visão, Jobs l.21, Objetivo 7 e Critério 3; o contrato do arquivo está íntegro (frontmatter na linha 1 com `title`/`purpose` entre aspas, `owner: product`, sem ids, as sete seções do template de `spec-brief.ts:31-40` presentes, «Ver também» explícito). Os dois LOW são precisão de alcance («no git» vs requisitos no storage) e estilo; não bloqueiam o carimbo humano.
