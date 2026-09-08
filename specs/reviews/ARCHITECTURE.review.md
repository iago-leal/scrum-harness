---
file: ARCHITECTURE.md
reviewer: claude (subagente revisor adversarial)
reviewed_version: 2
reviewed_digest: "5eaf1561"
verdict: approved
round: 2
findings: { high: 0, medium: 0, low: 2 }
---
# Revisão adversarial — specs/ARCHITECTURE.md v2 (digest 5eaf1561) — rodada 2

Método: reli a v2 inteira e a revisão da rodada 1 (v1, digest 489411e6: 0 HIGH / 5 MEDIUM / 3 LOW), conferi item a item se cada achado foi absorvido (citando a v2) e verifiquei as afirmações tocadas contra `packages/bundle-scrum/cordis.patch.yml`, `README.md` (parágrafos v0.3, v0.4, v0.6, v0.12, v0.13, comp-49/v0.17, seção «Arquitetura»), `specs/GLOSSARY.md` v2 («Sinônimos proibidos», «MVC da casa»), `specs/RULES.md` v3 (R6), `packages/tool-scrum/src/index.ts` (linhas 8, 30, 472), `packages/scrum-domain/src/traces.ts` (`gitignoreNames`), `packages/scrum-domain/src/spec.ts` (`RELEASE_STATUSES`), `packages/scrum-domain/src/service.ts` (`invalid-status`) e `packages/context-scrum/src/snapshot.ts` («Disciplina do board»). Digest recalculado pelo método da casa (`sha1(body.trim())[:8]`, `contracts.ts:51`) = `5eaf1561`, igual ao pedido. Nada foi instalado, buildado ou executado.

## Absorção da rodada 1 (item a item)

- **M1 — «sete plugins».** Absorvido. `purpose`: «A topologia dos seis plugins DSH e do pacote compartilhado (@scrum-harness/probe)»; bullet: «**Seis plugins e um pacote compartilhado** … — as seis linhas do patch. `@scrum-harness/probe` não é plugin: é um pacote plano, sem `apply` e fora do patch». Confere com o `cordis.patch.yml`: exatamente seis `insert` (scrum-domain, tool-scrum, command-scrum, context-scrum, scrum-api, ui-scrum), nenhum `probe`; o comentário do patch («Row order carries no load semantics») sustenta a frase da Topologia sobre ordem sem semântica de carga.
- **M2 — divisão MVC por pacote.** Absorvido. Camadas: «a unidade dessa divisão é o **módulo/classe, não o pacote**: um pacote pode hospedar Model e View texto (`scrum-domain` abriga `service.ts` e também `format.ts`/`spec-brief.ts`), ou Controller e View texto (`context-scrum` abriga o listener e `snapshot.ts`); o desenho de cada componente declara qual módulo é o quê, e a revisão confere (C5)». A tabela ganhou a coluna «Camada (por módulo)» — coerente com GLOSSARY «MVC da casa» (View = `format.ts` e a GUI) e com README «Arquitetura».
- **M3 — ADR-004 atribuído só a comp-48.** Absorvido. Título «(comp-42, comp-48)»; Contexto em (a) «v0.12, «Motor da espiral» (comp-42)» e (b) «v0.13 (comp-48)»; Escolha separa «no comp-42, quatro campos de texto … `parseFrontmatter` próprio (mini-parser sem dependência …)» de «no comp-48, a família `ArtifactContract` com digest sha1 curto». Bate com README v0.12 (quatro artefatos + mini-parser) e v0.13 (`ArtifactContract`, digest, `version` manual e `verdict: resolved`).
- **M4 — «painel».** Absorvido: `grep painel` na v2 devolve zero ocorrências; ADR-007 agora fala em «raízes do quadro (`.scrum-view`, `.scrum-wi-overlay`)» e «o quadro na GUI». Os usos de «aba» seguem históricos e rotulados (ADR-008, trade-offs), como GLOSSARY permite.
- **M5 — ADR para estados de pai manuais.** Absorvido como **ADR-016** «Estados de pai são workflow manual por nível, nunca propagados (v0.4, v0.6)», com as quatro partes. Confere: README v0.4 (workflow próprio por nível: componente `proposed → in_progress → done`, função `proposed → committed → in_progress → done`; boards por nível Tarefas | Componentes | Funções; rollup nos cards de pai), README v0.6 («Estados de pai seguem **manuais** por decisão de produto (estilo Azure): componente/função só mudam de coluna por arrasto, form ou tool»), R6 («workflow manual próprio … nunca se propaga aos pais e fora do conjunto é recusado (`invalid-status`)»), `RELEASE_STATUSES = ['planned','active','released']` (`spec.ts:14`), `ScrumError('invalid-status', …)` (`service.ts:1715`) e a linha «Disciplina do board (ao vivo)» em `snapshot.ts:43` pedindo ao agente manter os pais em dia com `scrum_item_update`.
- **L1 — ADR-002 «v0.1».** Absorvido: «(origem do projeto — seção «Arquitetura» do README, anterior à primeira seção datada; v0.15)». A seção «Arquitetura» existe (README linha 108) e a primeira seção datada é v0.2 (linha 16).
- **L2 — ADR-006 «todos os componentes done».** Absorvido: «os cinco componentes `done` que traziam `traces:` (comp-42, 45, 46, 47, 48)» — igual ao README comp-49 («cinco componentes done com `traces` tinham requisitos sem rastro (comp-42 …; comp-48 …)»).
- **L3 — leitura do `.gitignore` fora da sonda.** Absorvido nos dois lugares sugeridos: aresta `tools -. .gitignore raiz (S3) .-> disk` no diagrama e a frase «A única outra leitura de disco fora da sonda é a tool `scrum_trace`, que lê o `.gitignore` raiz do workspace (`existsSync`/`readFileSync` em `tool-scrum/src/index.ts`) e o reduz pelo Model (`gitignoreNames`, S3)». Confere com `tool-scrum/src/index.ts:8,30,472` e `traces.ts:320`.

## Verificações de forma
- Frontmatter: `title`/`purpose` entre aspas, `version: 2` nu, `status: draft`, `owner: architect`.
- Nenhum `R<n>`/`S<n>`/`P<n>`/`C<n>`/`CT-<n>` em início de linha (grep vazio); ids citados inline conferem com RULES.md v3 (R6 acrescido nesta versão; os demais já conferidos na rodada 1).
- ADR-001…ADR-015 mantiveram número e título; ADR-016 foi **anexado ao fim**, sem renumeração; sequência única e contígua.
- «Ver também» inalterado e coerente com `SPEC_PREDECESSORS` (os seis dependentes diretos + RULES/GLOSSARY/PRD).
- Nenhuma contradição nova com PRD v3, RULES v3 ou GLOSSARY v2.

## HIGH
Nenhum.

## MEDIUM
Nenhum.

## LOW

1. **ADR-016, Contexto: «desde a v0.4 cada nível tem workflow próprio (…, release `planned → active → released`)».** O README v0.4 introduz os workflows de componente e função; o de release (`planned | active | released`) é anterior e não é citado ali. A frase é verdadeira como estado («desde a v0.4 todos os níveis têm»), mas lê-se como se o workflow da release tivesse nascido na v0.4. Mudança opcional: «desde a v0.4 (quando componente e função ganharam workflow próprio, ao lado do que a release já tinha)».

2. **ADR-002: «seção «Arquitetura» do README, anterior à primeira seção datada».** No arquivo a seção «Arquitetura» (linha 108) vem *depois* das seções datadas; o «anterior» só faz sentido cronológico (a decisão precede a v0.2). Mudança opcional: «(origem do projeto, anterior à v0.2; fonte: seção «Arquitetura» do README; v0.15 para o backend de memória)».

## Sections I would keep
- **Topologia**: diagrama e bullets agora exatos até na única leitura de disco fora da sonda (aresta `.gitignore`); contagem seis plugins + um pacote bate com o patch.
- **Camadas** e **Componentes principais**: a coluna «Camada (por módulo)» torna a tabela a declaração canônica de onde vive cada módulo — é o que API_SPEC/AGENTS devem citar.
- **Padrões adotados**: inalterados e verificados na rodada 1.
- **ADR-004** (agora com a história em dois tempos) e **ADR-016** (a decisão que explica por que fechar todas as tarefas não fecha o componente; a consequência «fica em `construction → validation` até alguém avançar a fase e pedir `done`» é exatamente o que o snapshot deste repositório mostra hoje para o comp-61).
- **ADR-001, 002, 003, 005–015** e **Trade-offs aceitos**: estáveis entre v1 e v2.

## Veredito
**approved** — 0 HIGH, 0 MEDIUM, 2 LOW. Os cinco MEDIUM e os três LOW da rodada 1 foram absorvidos literalmente e as afirmações tocadas conferem com o patch, o README, o código e as specs predecessoras; ADR-016 foi anexado sem mexer na numeração; frontmatter e ids obedecem ao contrato. Os dois LOW são precisão de redação e não pedem nova rodada.
