---
file: RULES.md
reviewer: claude (subagent, revisor adversarial)
reviewed_version: 8
reviewed_digest: "08a6beca"
verdict: approved
round: 8
findings: { high: 0, medium: 0, low: 0 }
---
# Revisão adversarial — specs/RULES.md v8 (digest 08a6beca) — rodada 8, fechamento

## Método

**Digest.** Recalculado do disco, não aceito do mandato. Reli `packages/scrum-domain/src/contracts.ts:51-53` — `digestOf` = `createHash('sha1').update(body.trim()).digest('hex').slice(0, 8)`, sobre o corpo **sem** o frontmatter. Fronteira reconferida nesta rodada: `specs/RULES.md:7` é o `---` de fecho, `:8` é `# Regras invariantes`; o arquivo tem 79 linhas. `sed -n '8,79p' specs/RULES.md | perl -0777 -pe 's/\A\s+|\s+\z//g' | shasum | cut -c1-8` → **`08a6beca`**. Confere com o mandato. Frontmatter lido: `version: 8`, `status: draft`, `owner: domain` — o `draft` é o correto (R29/R30: toda versão nova nasce `draft` até o carimbo humano).

**Como isolei o diff v7→v8.** O HEAD é a v5 (`git show HEAD:specs/RULES.md` → `version: 5`, `status: approved`, 76 linhas), e nem a v6 nem a v7 foram commitadas, então `git diff` mostra v5→v8 somadas. Não reconstruí a v7 a partir do parecer da rodada 7 (o texto proposto num parecer não é necessariamente o gravado); repeti a **prova estrutural** que já usei na rodada 7, que não depende de ter a versão anterior em mãos:

1. Removi da v8 as três linhas que a v6 acrescentou (as que começam em `R36.`, `R37.`, `C6.`) e comparei o resto com o v5 do HEAD, linha a linha. Resultado: **76 linhas contra 76, e exatamente 2 diferenças** — linha 4 `version: 5→8` e linha 5 `status: approved→draft`. Nenhuma outra. Isso prova que v8 = v5 + {duas linhas de frontmatter} + {R36, R37, C6}, e **fecha as 51 linhas de R1–R35, S1–S5, P1–P5, C1–C5 como byte a byte idênticas à v5 já aprovada**.
2. Restam, por subtração, as três linhas de conteúdo. **R36** (`:48`) e **C6** (`:71`) são literalmente as que a rodada 7 transcreveu por inteiro em «Sections I would keep» e no corpo do parecer — conferi palavra a palavra, inclusive «precedente parcial» e o remate «(C5)» em R36, e em C6 «98 testes no fechamento, 100 depois dos dois testes de fiação da correção» com a marca «(convenção da casa, não gate)». **Nenhuma das duas foi tocada.** Sobra R37 como a única linha de conteúdo mudada, mais `version`: exatamente as duas mudanças que o mandato declara.
3. Dentro de R37, localizei a mudança por busca direta: `grep -n 'setup-profile\.sh:[0-9]' specs/RULES.md` **não casa em lugar nenhum do arquivo** (exit 1), e o fragmento `` o `if [ -d … ]` de `setup-profile.sh` pula em silêncio `` casa exatamente. O ponteiro numérico saiu, a âncora nominal entrou, e nenhum outro `arquivo:linha` de `setup-profile.sh` sobrou na spec.
4. Contagem de ids no início de linha: **53 ocorrências, 53 únicas** (R1–R37, S1–S5, P1–P5, C1–C6). Nenhuma duplicata, nenhum id renumerado.

**Fatos contra o disco.** `scripts/setup-profile.sh` inteiro, `packages/bundle-scrum/cordis.patch.yml`, `packages/bundle-scrum/package.json:19-27`.

**Suíte.** `node node_modules/vitest/vitest.mjs run packages/notify-scrum/` nesta máquina → **3 arquivos, 100 testes, 100 passed**, 601 ms (`notifier.spec.ts` 26, `model.spec.ts` 42, `plugin.spec.ts` 32). Bate com o número que C6 usa. Não rodei instalador nem build; nenhum arquivo foi modificado além deste parecer. Os 2 `it` vermelhos de `repo-specs.spec.ts` são o vermelho declarado de C4 e não os conto como achado, conforme o mandato.

## Absorção da rodada 7

### M1 — absorvido, com o texto proposto, à letra

A rodada 7 marcou MEDIUM que R37 localizava o mecanismo por `` (`setup-profile.sh:62`, `if [ -d … ]` pula em silêncio) ``, quando a linha 62 do script é `ui-scrum) name="ui" ;;` — um ramo do `case`, sem relação com a existência do diretório — e o `if` está na 65. A citação errava para uma linha real e errada, que é o que a fazia MEDIUM e não LOW.

A v8 adotou a **mudança concreta** que o parecer propôs, sem variação. R37 (`specs/RULES.md:49`) agora diz `` (o `if [ -d … ]` de `setup-profile.sh` pula em silêncio) ``. Confrontei com o proposto na rodada 7 (`RULES.review.md`, M1 «Mudança concreta»): é o mesmo texto, caractere por caractere. O número morreu; a âncora de conteúdo, que é imune a renumeração, ficou. É o remédio que `AGENTS.md` «Regras de output › Citação posicional envelhece» manda e que a v8 daquele arquivo aplicou à mesma classe de erro.

**A âncora é única e correta no disco** — o ponto 3 do mandato, verificado em três frentes:

- **Existe, e é única como comando.** `grep -nE '^[[:space:]]*if \[ -d' scripts/setup-profile.sh` → **uma só ocorrência**, `:65` — `if [ -d "$REPO/packages/$pkg" ]; then`. Um `grep` mais frouxo (`if \[ -d`) traz duas linhas, mas a outra é `:52`, dentro do bloco de comentário `:51-56`, que **descreve** esse mesmo `if` («the `if [ -d ]` below skips it without a word»). Não é um segundo `if`: é a prosa que aponta para ele. Logo não há ambiguidade — a âncora localiza um único mecanismo, e o comentário confirma qual.
- **É o `if` certo.** O teste é `-d "$REPO/packages/$pkg"`, isto é, a existência do diretório do pacote, exatamente o que R37 descreve com «o link do profile só nasce se o diretório existe na lista».
- **«Pula em silêncio» bate com o código.** O corpo é `:65-67` — `ln -sfn …` e `fi`, **sem `else`**. Varri o script inteiro: `grep -nE 'else|echo .*(warn|WARN|missing|skip)'` **não casa em lugar nenhum** (exit 1). Não há `else`, não há aviso, não há `set -u` que o pegue. Um pacote fora da lista, ou com diretório ausente, some sem uma palavra. O silêncio é do script, literalmente, como a regra diz.

Absorvido. O M1 está fechado, e a regra ficou mais robusta do que estava antes da rodada 6: já não há ponteiro nenhum em R37 que possa envelhecer com a próxima edição do script.

### Nada mais mudou — verificado, não aceito

O ponto 2 do mandato. A prova estrutural do «Método» é positiva, não uma ausência de suspeita: v8 menos {R36, R37, C6} **é** o v5 do HEAD, salvo `version` e `status`. Isso cobre R1–R35, S1–S5, P1–P5 e C1–C5 de uma vez, byte a byte, sem eu precisar relê-los um a um — e é a razão pela qual não os reabro. R36 e C6 saem por comparação literal com a transcrição integral da rodada 7. A mudança é a de dois tokens em R37, mais `version: 7 → 8`. **Exatamente as duas coisas declaradas, e nada além.**

## Contradição nova — procurada, não encontrada

O ponto 4. A v8 apagou um ponteiro; apagar não pode tornar verdadeira uma proposição falsa nem falsa uma verdadeira, mas conferi o que o apagamento poderia ter quebrado:

- **O resto de R37 continua verdadeiro no disco.** Reconferi as três afirmações que sobraram, porque a frase foi reescrita ao redor delas: os sete pacotes do patch (`cordis.patch.yml` → domain, tool-scrum, command-scrum, context-scrum, notify-scrum, scrum-api, ui) estão todos nas `dependencies` de `packages/bundle-scrum/package.json:19-27`; e o remate do superconjunto é exato — comparei os dois conjuntos ordenados por `comm`, e o `for pkg in` (`:57`) traduzido dá nove nomes, sendo a diferença **precisamente `{bundle, probe}`**, os dois que a regra nomeia, com **conjunto vazio** na direção contrária (nada no patch falta ao script). «Pode conter mais, nunca menos» é literalmente o estado do disco.
- **Comentário do script × regra.** O comentário `:51-56` continua dizendo a mesma mecânica que R37, com a mesma citação do harness (`assertEntriesLoaded: "plugin(s) failed to load: <name>"`) e ainda apontando para a regra pelo id. A v8 não tocou o script, e o comentário não usa número de linha para se referir ao `if` — diz «the `if [ -d ]` **below**». Regra e comentário convergiram na mesma solução de ancoragem; não divergem.
- **R30 e o digest.** A mudança é no corpo, então o digest mudou e a revisão anterior ficou `stale` — que é exatamente o que R30 manda e a razão desta rodada existir. Coerente, não contraditório.
- **R29/C4 e o `status: draft`.** A v8 nasce `draft`, como R29 exige, e é isso que mantém o `it` de `repo-specs.spec.ts` vermelho até o carimbo (C4, e o mandato o declara esperado). A spec está em conformidade com as próprias regras que ela escreve.
- **Vizinhas de R37.** R31/S3 (o quadro nunca escreve `specs/`; a sonda lê só `specs/`): R37 fala de `packages/` e `scripts/`, assuntos disjuntos. R23/R26 (matriz `traces:`): R37 não cria obrigação de trace, e os caminhos que nomeia são relativos ao workspace, no formato que R23 exige. R1 («nenhuma regra fora do Model»): R37 é regra de fiação de pacotes, não de decisão de domínio. R36 × R37: uma diz onde a regra de um plugin mora, a outra como o pacote chega ao profile — reforço, não colisão. C1 × C6 e R28/P1/R26 × C6: inalterados desde a rodada 7, e C6 não foi tocada.

Nenhuma contradição nova. Nenhuma regra anterior tornada falsa — a prova estrutural garante que nenhuma delas mudou, e a única linha que mudou perdeu uma afirmação errada sem ganhar nenhuma.

## Sections I would keep

- **R37 inteira** (`:49`), agora sem ressalva. A regra faz quatro coisas certas numa linha só: manda o invariante (os três lugares em sincronia), explica o mecanismo real pelo qual a violação escapa (o `if` que pula calado, e o boot que só reclama depois de o profile ser regerado), fecha a porta da leitura errada (superconjunto, nunca subconjunto) e exige a **forma** do teste — derivar a lista do próprio patch, nunca repetir à mão, que é o que faz um pacote novo quebrar o teste sem ninguém lembrar de nada. Tudo conferido no disco nesta rodada. Com o número fora, é a única citação da spec a um script vivo que não envelhece na próxima edição dele.
- **R36, intacta** (`:48`). Não tocada pela v8 — verificado por comparação literal — e já verificada afirmação por afirmação contra o código na rodada 6, aprovada sem ressalva. Não a reabro: o mandato a exclui e nada na v8 a torna falsa. Registro que o `100 passed` desta rodada continua cobrindo os testes que a sustentam.
- **C6 inteira** (`:71`). Não tocada. Os dois números continuam datados e corretos — «98 no fechamento» é histórico marcado como tal, e o 100 bate com a medida desta rodada. A marca «(convenção da casa, não gate)» continua necessária, porque o Model não tem como verificar carga no harness real.
- **Tudo o mais, R1–R35, S1–S5, P1–P5, C1–C5** (`:13-47`, `:52-70`). Não reaberto, conforme o mandato, e com base positiva para não reabrir: a prova estrutural mostra que a v8 não os tocou em um único byte, e que são os mesmos que a v5 carimbada já trazia.

## Veredito

**approved** — 0 HIGH, 0 MEDIUM, 0 LOW.

O único achado da rodada 7 foi absorvido com o texto que o parecer propôs, à letra: o `setup-profile.sh:62` saiu e ficou a âncora nominal `` o `if [ -d … ]` de `setup-profile.sh` ``. Não tomei a absorção da palavra do autor — verifiquei que **não existe mais nenhum `setup-profile.sh:<n>` na spec**, e que a âncora que ficou é única no script como comando (`:65`, uma só ocorrência; a segunda casa de `grep` é o comentário que a descreve), testa de fato a existência do diretório, e pula **sem `else` e sem aviso algum** — o script inteiro não tem um `else` sequer. «Pula em silêncio» é descrição literal do código.

O diff é as duas coisas declaradas e nada mais, e isso está provado, não assumido: a v8 menos as três linhas da v6 é o v5 do HEAD exceto por `version` e `status`, o que fecha R1–R35, S1–S5, P1–P5 e C1–C5 como intocados byte a byte; R36 e C6 são literalmente as que a rodada 7 transcreveu; sobra R37. 53 ids, 53 únicos, nenhum renumerado. Nenhuma contradição nova: apagar um ponteiro falso não podia criar uma, e conferi assim mesmo as vizinhas e o resto de R37 — os sete pacotes do patch estão nas `dependencies`, e o excedente do script é exatamente `{bundle-scrum, scrum-probe}`, com nada faltando na direção contrária.

Três rodadas trataram esta spec (6, 7, 8) e cada achado morreu no disco, não no papel: o HIGH da cláusula que invertia o sinal do harness, o MEDIUM do número de testes sem data, o LOW do superconjunto, o MEDIUM do ponteiro derivado. Não invento um quinto para justificar a rodada. **A v8 está pronta para o carimbo humano** — `status: draft` até lá, como R29 manda, e é esse `draft` que mantém o `it` de C4 no vermelho declarado que o mandato já dá por esperado.
