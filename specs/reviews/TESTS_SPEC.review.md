---
file: TESTS_SPEC.md
reviewer: subagent (revisor adversarial)
reviewed_version: 7
reviewed_digest: "fa744c9e"
verdict: approved
round: 7
findings: { high: 0, medium: 0, low: 2 }
---
# Revisão adversarial — specs/TESTS_SPEC.md (v7, digest fa744c9e) — rodada 7

## Método

Somente leitura: nenhum arquivo do projeto tocado além deste parecer, nenhum instalador, nenhum build, **suite não executada** (toda contagem abaixo vem do texto, do git e do código-fonte, nunca de uma execução minha).

**A armadilha de método foi respeitada.** `git status --porcelain specs/` → ` M specs/TESTS_SPEC.md` e ` M specs/reviews/TESTS_SPEC.review.md`; `git show HEAD:specs/TESTS_SPEC.md | sed -n '4,5p'` → `version: 5` / `status: approved`. Confirmado: **`HEAD` carrega a v5**, não a v6, e a v6 nunca foi commitada (`git log --oneline -1 -- specs/TESTS_SPEC.md` → `4ac6167`, o commit da comp-61 que entrou com a v5 carimbada). Logo `git diff` contra `HEAD` mistura hunks v5→v6 e v6→v7 e **não** serve para isolar esta rodada. Método adotado, o mesmo que a rodada 6 usou com o relatório da rodada 5: **reconstruí a v6 no lugar**, em memória, aplicando a cada linha a substituição inversa das duas mudanças declaradas (as duas citam o texto v6 *verbatim*, e o parecer da rodada 6 os transcreve nas linhas 97–103 como texto proposto), e medi bytes da reconstrução contra os números que a rodada 6 registrou (176 linhas / 46 583 bytes). A reconstrução **valida-se sozinha**: devolveu 885 e 928 bytes para as linhas 14 e 39, contra os 886 e 929 que a rodada 6 mediu com o `\n` incluído — diferença de exatamente 1 byte em cada, o terminador de linha, que `wc -c` sobre `sed -n 'Np'` conta e o meu `len(...encode())` sobre a string não. O acordo em duas linhas independentes, somado ao fecho exato da aritmética global, fixa a v6 sem ambiguidade.

Medido no disco: `wc -c -l specs/TESTS_SPEC.md` → **177 linhas / 48 698 bytes**. Lido inteiro: `packages/scrum-domain/tests/repo-specs.spec.ts` (40 linhas), o frontmatter (linhas 1–7), as linhas 13, 14 e 39 caractere a caractere, e as seções do template. Spot-checks de prova por `grep -n` no código. O parecer da rodada 6 foi lido integralmente antes de qualquer medição.

## Absorção da rodada anterior

A rodada 6 fechou `approved` com **0 HIGH / 1 MEDIUM / 1 LOW**. A v7 nasceu para absorver o M1.

### M1 — absorvido, nas duas afirmações, item a item

O M1 pedia duas edições pontuais e nomeava o texto exato. Confiro o **texto final**, não a intenção, e ponto a ponto contra as três razões concretas que o M1 deu para a ressalva existente ser insuficiente:

- **Edição 1 (linha 39, era 38).** Pedido: trocar «Os dois **passam hoje**» por «Os dois **passam com as specs carimbadas**» e acrescentar a transitoriedade. Entregue **literalmente o texto proposto**, com uma só divergência — «carimbo da v6» → «carimbo da v7» —, que é a correção necessária (a spec em revisão agora é a v7, não a v6): «Os dois **passam com as specs carimbadas**: … Esse é o estado de repouso do repositório — e é dele que o arquivo fala; enquanto uma spec está em revisão (esta inclusive, `draft` até o carimbo da v7), o `it` 2 fica vermelho e a suite mede 509/510, pelo desenho descrito no fim deste bullet.» (`specs/TESTS_SPEC.md:39`) ✓
- **Edição 2 (linha 14, era 13).** Pedido: ancorar «a suite está 510/510 verde» no estado carimbado. Entregue: «a suite fecha 510/510 verde no estado carimbado (medida: `npm test` ×3, 2,35 s / 2,15 s / 2,51 s — pior 2,51 s — com esta spec de novo `draft`, o `it` 2 volta a 509/510 até o carimbo, como o próprio bullet explica)» (`:14`). Equivalente ao proposto, com a medida das três rodadas preservada intacta dentro do parêntese ✓
- **Razão (a) do M1 — «a ressalva descreve o caso oposto (editada *sem* bump)».** Resolvida na raiz: a nova frase da linha 39 nomeia a condição **desta** versão, «enquanto uma spec está em revisão (esta inclusive, `draft` até o carimbo da v7)», e o Histórico registra o argumento explicitamente (ver achado L1 da rodada 6 sobre rigor, abaixo) ✓
- **Razão (b) do M1 — «~600 bytes depois da afirmação».** Resolvida: a qualificação agora é a **frase imediatamente seguinte** à afirmação, distância zero. A ressalva antiga permanece no fim do bullet, onde cumpre a outra função (detector de deriva), e a nova frase a referencia por «pelo desenho descrito no fim deste bullet» — as duas passaram a se apoiar em vez de competir ✓ (o número «~600» em si estava errado: ver L2)
- **Razão (c) do M1 — «a casa tem marca própria para o não provado»**: nenhuma marca «a escrever» foi removida nem nenhuma prova inventada (19 no corpo, invariantes desde a v5 — ver «Nenhuma prova inventada») ✓

**Verdicto sobre o M1: absorvido de fato, não meia-boca.** O teste decisivo é o leitor externo do repositório público que clona, roda `npm test`, vê `509/510` com uma falha e procura a spec de testes: ele agora encontra `509/510` **escrito na própria spec**, nos dois lugares onde antes lia uma cor no presente, com a condição que o produz e a condição que o desfaz. A afirmação deixou de ser desmentível pela execução.

### L1 — confirmado como NÃO absorvido, com a razão certa

O L1 era sobre `specs/AGENTS.md:104` (owner `agents`), não sobre este arquivo. Confirmado:

- **O autor não tocou `specs/AGENTS.md`**: `git status --porcelain specs/AGENTS.md` → **vazio** (nenhuma modificação não-commitada); o último commit que o tocou é `4ac6167`, o da comp-61, anterior a esta rodada. Se tivesse editado, seria HIGH — não é o caso ✓
- **Registrou L1 como proposta ao owner**, no Histórico: «L1 (a mesma deriva em `specs/AGENTS.md:104`, `approved v4`) **não** é absorvida aqui: aquele arquivo tem owner `agents` e muda só pelo pipeline dele (task-189) — é proposta ao owner, não edição desta spec.» (`:13`) ✓ — a razão é exatamente a regra da casa (AGENTS.md «Specs»: lacuna em outra spec vira proposta ao owner, registrada no Histórico de quem a achou, nunca edição direta), e cita o id do quadro que a carrega.

**Resultado: M1 absorvido; L1 corretamente não-absorvido e registrado; 0 regressões no que a rodada 6 mandou manter** (CT-035 na linha 86, «Textos de artefato inline» na 168 e o Histórico v6 na 14 seguem com o texto anterior, este último só acrescido do trecho do M1 e empurrado uma linha).

## Diff v6→v7

Declarado: 3 mudanças. **Fecha exatamente, medido por mim.**

```
+1717  (linha 13, nova, entrada v7 do Histórico — `sed -n '13p' | wc -c` = 1717, com o \n)
 +127  (linha 14: 1012 − 885 bytes, sem \n; v6 reconstruída no lugar)
 +271  (linha 39: 1199 − 928 bytes, sem \n; v6 reconstruída no lugar)
-----
+2115 = 48 698 − 46 583 ✓
```

Linhas: 176 + 1 = **177** ✓. Frontmatter: `version: 6` → `7` é delta 0 (mesmo comprimento), como declarado — e `status` já era `draft` na v6, logo não há o −3 que a rodada 6 contabilizou na transição anterior ✓.

**A aritmética bate no total e em cada parcela**, o que é mais forte do que o total fechar: cada delta declarado foi medido isoladamente contra a v6 reconstruída e reproduziu o número da tabela do autor (1 717 / 127 / 271). Como a soma das três parcelas esgota o delta total de 2 115 bytes, **nenhuma outra passagem mudou de tamanho**. Fica a ressalva de método que a v6-não-commitada impõe e que registro por honestidade, não como achado: uma substituição de **igual comprimento** em outra linha seria invisível à aritmética, e aqui não tenho `git diff` contra a v6 para excluí-la como a rodada 6 pôde fazer contra a v5. Mitigação do que pude verificar diretamente: as 76 linhas `CT-` estão todas presentes, íntegras e contíguas; o frontmatter, as sete seções do template e as contagens de marcas do corpo batem com a v5 do `HEAD`, que é texto assinado no git.

**Contagens de controle sobre o corpo (invariantes desde a v5 do `HEAD`, logo nenhuma edição silenciosa fora do Histórico):** 19 marcas «a escrever» no corpo (fora das entradas de Histórico), 76 ids `CT-`, 0 linhas `R/S/P/C`.

## Contrato da spec (conferido)

- **Frontmatter na linha 1** (`sed -n '1,7p'`): `---` na linha 1 ✓; `title` e `purpose` entre aspas duplas ✓; `version: 7` inteiro nu ✓; `status: draft` ✓ (obrigatório — `approved` é carimbo humano, R29); `owner: test` ✓, o dono de TESTS_SPEC.md no catálogo (R32).
- **76 ids** `CT-nnn` no início de linha: `grep -c '^CT-[0-9]'` = **76** ✓; **sem duplicata** (`grep -o '^CT-[0-9]*' | sort | uniq -d` → vazio) ✓; contíguos **CT-001 … CT-076**, verificados posição a posição ✓. Nenhum renumerado, removido ou criado — as três mudanças do diff não tocam linha `CT-` alguma (a última edição em CT-070 foi da v6, linha 131 aqui) ✓.
- **Nenhuma linha começa com `R<n>`/`S<n>`/`P<n>`/`C<n>`**: `grep -cE '^[RSPC][0-9]+'` = **0** ✓.
- **Seções do template** (`grep -n '^## '`), todas as sete na ordem: Histórico (l.12), Níveis (l.21), Casos críticos (l.41), Pyramid alvo (l.143), O que NÃO testar (l.152), Dados de teste (l.162), Ver também (l.171) ✓.
- **48 698 bytes < 256 KiB** (`SPEC_FILE_CAP` = 262 144) ✓ — 18,6 % do cap.

## Nenhuma prova inventada

19 marcas «a escrever» no corpo, **idênticas às da v5 do `HEAD`** (medido: v5 total 20 = 19 corpo + 1 Histórico; v7 total 21 = 19 corpo + 2 Histórico). Nenhuma marca honesta removida, nenhuma cláusula sem asserção promovida a provada. As três mudanças do diff não tocam nenhuma linha `prova:` ✓.

**Spot-checks de prova (6, incluindo CT-070).** Cada `arquivo › describe › it` citado existe no código:

- **CT-070** (`:131`) → `repo-specs › specs/ of this repository (comp-61 R4)`: `packages/scrum-domain/tests/repo-specs.spec.ts:21` ✓. Os dois `it` em `:24` («exists and is complete: the minimal set approved, nothing invalid, nothing unknown») e `:32` («the seven files of the pipeline are approved, each with a current review») ✓. As cinco asserções do `it` 1 (`:25-29`: `exists`, `invalid` 0, `unknown` 0, `unknownReviews` vazio, `complete`) e as três do `it` 2 (`:35`, `:36`, `:38`: `state` `approved`, `review.state` `current`, `summary.reviewed === summary.present`) batem uma a uma com o texto de CT-070, inclusive o `reviewed = present` ✓. **E sustentam o M1**: `PIPELINE` em `:19` inclui `TESTS_SPEC.md`, e `:35` é `expect(entry.state, …).toBe('approved')` com a mensagem `${file} is ${entry.state} — comp-61 em andamento` — é exatamente este `expect` que fica vermelho enquanto esta spec é `draft`, o fato que a v7 agora declara nas linhas 14 e 39 ✓.
- **CT-035** (`:86`) → `contracts › … «validated_at must be an ISO-8601 date; a bare all-digit value must be quoted»`: `packages/scrum-domain/tests/contracts.spec.ts:229` ✓.
- **CT-043** (`:96`) → `scrum-domain › suite budget «lowering the budget never reopens a done component…»`: `packages/scrum-domain/tests/scrum-domain.spec.ts:1013` ✓.
- **CT-032** (`:83`) → `tool-scrum «the tdd gate refusal names the tests-first rule…»`: `packages/tool-scrum/tests/tool-scrum.spec.ts:433` ✓.
- **CT-058** (`:117`) → `probe › «the probe is environment only»`: `packages/scrum-probe/tests/probe.spec.ts:134` ✓.
- **CT-076** (`:141`) → `clampPlacement`/`dragMove` nomeados e importados: `packages/ui-scrum/tests/drag.spec.ts:10` (import), `:15` (`describe('clampPlacement (R2 / R4)')`) ✓.

## Coerência do texto novo (as perguntas 1 e 2)

Li a linha 39 e a 14 inteiras, e as 21 ocorrências de `509`/`510`/`vermelh`/`draft` do arquivo, uma a uma:

- **Linha 39, coerência interna do bullet.** A sequência ficou bem ordenada em três tempos que não se cruzam: presente qualificado («passam com as specs carimbadas» + o estado de repouso) → parêntese da exceção corrente («enquanto uma spec está em revisão, esta inclusive») → passado («Enquanto ele esteve vermelho, a falha era esperada…») → presente durável («Ele segue sendo o detector de deriva… ninguém o pula, o silencia nem o marca `skip`»). **Nenhuma contradição**: o «vermelho» da frase nova é condicional-corrente e o da frase seguinte é explicitamente passado; os dois `509/510` do arquivo (linhas 14 e 39) concordam entre si e com os três `510` de contexto carimbado (linhas 10, 14, 145). O reenvio «pelo desenho descrito no fim deste bullet» resolve o que o M1 apontava como desconexão: a ressalva do fim deixou de ser a única chave e passou a ser a explicação de um fato já declarado ✓
- **Linha 14, coerência do Histórico.** A entrada v6 continua contando o que a v6 fez, no passado, e a ressalva nova entra **dentro** do parêntese da medida, marcada por «com esta spec de novo `draft`» — sem reescrever o que a v6 afirmou, e sem colidir com a entrada v7 acima, que é quem assume a mudança ✓
- **Peso do texto.** As duas linhas cresceram (928→1 199 e 885→1 012 bytes) e a linha 39 é longa, mas a leitura não confunde: cada acréscimo é uma frase única, com sujeito explícito e tempo verbal marcado, e a informação durável (o que cada `it` exige) continua à frente do que é circunstancial. Não é achado.
- **Regressões de cor no presente:** nenhuma. Não sobrou nenhuma afirmação no presente de que a suite está vermelha, nem de que está verde sem qualificação ✓

## HIGH

Nenhum.

## MEDIUM

Nenhum.

## LOW

### L1 — O Histórico da v7 diz «as 20 marcas "a escrever" seguem»; são 19 no corpo, e 21 no arquivo — nenhum dos dois é 20

**O problema.** A entrada v7 afirma: «Nenhum CT renumerado, removido ou novo; nenhuma prova nova (as **20** marcas «a escrever» seguem)» (`specs/TESTS_SPEC.md:13`). Medido: `grep -o 'a escrever' | wc -l` = **21** no arquivo inteiro. Decompondo por origem — 19 em cláusulas do corpo (as marcas honestas de fato, nas linhas 43, 47, 48, 58, 59, 60, 62, 64, 86, 106, 108, 109, 110, 117, 129 ×2, 176, mais a definição na 10 e a 15) e **2** dentro de entradas do Histórico (a da linha 13, que é esta própria afirmação, e a da linha 15). O número «20» era o **total bruto da v6** (19 de corpo + 1 de Histórico): ao escrever a frase, a entrada v7 acrescentou uma 21ª ocorrência e invalidou o número que ela mesma declarava. A rodada 6, pelo mesmo mecanismo, reportou «19 na v5 e 19 na v6» — o que estava certo para o corpo mas não para os totais brutos (v5 tem 20 no arquivo).

**Por que importa.** Baixo por três razões: a substância da afirmação é **verdadeira e é o que importa** (nenhuma marca foi removida e nenhuma prova foi inventada — confirmei contra a v5 do `HEAD`, as 19 do corpo são invariantes), o número não é um id estável nem entra em gate algum, e o erro é de uma unidade. Mas é uma métrica auto-referente num arquivo cujo valor declarado é «medir antes de afirmar»: o número se move a cada versão que menciona a expressão, então quem o confira com um `grep` ingênuo encontrará sempre um desacordo e desconfiará da frase inteira. A correção também torna o número estável para sempre, em vez de exigir um novo ajuste a cada rodada.

**A mudança concreta.** Contar o que é invariante — as marcas do corpo — e dizer qual é o universo, numa edição de três palavras na linha 13. Substituir «(as 20 marcas «a escrever» seguem)» por:

> (as 19 marcas «a escrever» do corpo seguem, as mesmas da v5)

**Evidência.** `specs/TESTS_SPEC.md:13` («as 20 marcas»); contagem: 21 no arquivo, 19 fora das entradas de Histórico (linhas `- v…`), contra 20/19 na v5 de `git show HEAD:specs/TESTS_SPEC.md`; `specs/reviews/TESTS_SPEC.review.md` rodada 6, linha 25 (o «19 e 19» anterior, pelo mesmo mecanismo).

### L2 — Confirmado: o «~600 bytes» da rodada 6 estava inflado, e o Histórico da v7 acertou em não repeti-lo — mas a medição correta é ~233–340, não 315

Este é o item 3 da pauta desta rodada, e a resposta tem três partes. **(a) e (b) estão corretos; em (c) discordo do orquestrador, com medição.**

**(a) O Histórico da v7 não repete «~600».** `grep -n '600' specs/TESTS_SPEC.md` → **nenhuma ocorrência** no arquivo ✓. A instrução foi cumprida à letra.

**(b) O argumento registrado é o correto.** A entrada v7 registra a razão substantiva, não a distância: «A ressalva do fim da linha 38 não bastava porque descreve o caso oposto ao desta versão — «uma spec editada **sem** bump de versão» —, e quem aplicar a regra à letra conclui que esta spec não está nesse caso» (`:13`). É exatamente a razão (a) do M1, que é a razão **suficiente** — a ressalva falhava por descrever a condição oposta, e falharia ainda que estivesse na frase vizinha. Registrar essa e omitir a distância é a escolha certa ✓

**(c) Discordo da medição de 315 bytes.** Medi na v6 reconstruída, que é onde a distância existia (na v7 ela é zero, pois a qualificação passou a ser a frase seguinte). O resultado depende da ancoragem, e **nenhuma ancoragem plausível dá 315**:

| De | Até | bytes | chars |
|---|---|---|---|
| fim de «passam hoje**» | início de «uma spec editada sem bump» | **340** | 336 |
| fim de «passam hoje**» | início de «Ele segue sendo o detector» | 302 | 298 |
| início de «Os dois **passam hoje» | início de «uma spec editada sem bump» | 363 | 359 |
| fim da frase «…pôde ir a `done`.» | início de «uma spec editada sem bump» | **233** | 231 |
| fim da frase «…pôde ir a `done`.» | início de «Ele segue sendo o detector» | 195 | 193 |

A faixa defensável é **233–363 bytes**, e a leitura mais natural do que o M1 escreveu («~600 bytes depois da afirmação "passam hoje"», ancorando na afirmação nomeada e medindo até a ressalva citada) é a primeira linha: **340 bytes / 336 caracteres**. O texto interposto é uma frase e a abertura da seguinte: « Enquanto ele esteve vermelho, a falha era esperada e ficava nesse `it` e em nenhum outro arquivo — nenhum artefato `validation` da release fechava `passed + skipped = tests` antes do carimbo. Ele segue sendo o detector de deriva: » (233 bytes), mais os 107 bytes do fim da afirmação até ali.

**Conclusão dos três pontos.** O orquestrador está certo no essencial e a instrução ao autor foi acertada: **«~600» era inflado por um fator de ~1,8** (contra 340) e não devia ser propagado. Mas **315 não é a medição correta** — é baixa demais para a ancoragem que o M1 usou (340) e alta demais para a mais conservadora (233); 315 bytes / 311 caracteres não corresponde a nenhum par de âncoras que eu consiga reproduzir no texto da v6. Suspeito de medição sobre um recorte ligeiramente diferente (talvez a partir de «: o segundo ficou verde…», ou até a vírgula anterior a «uma spec editada»). **Por que é LOW e não mais:** nada disto está no arquivo revisado — a v7 não cita número algum, que é precisamente o comportamento certo —, logo é higiene do registro da revisão, não defeito da spec. Fica consignado aqui para que a cadeia de pareceres não herde nem o 600 nem o 315.

**Evidência.** `specs/TESTS_SPEC.md:13` (sem «600»; o argumento do caso oposto); `specs/reviews/TESTS_SPEC.review.md` rodada 6, linha 93 (o «~600 bytes» original) e linha 136 («fica 600 bytes depois da afirmação»); medições acima sobre a linha 38 da v6 reconstruída, cuja fidelidade está estabelecida em «Método» (885/928 bytes contra os 886/929 da rodada 6).

## Sections I would keep

- **«Como cada nível é medido» › «vermelho por desenho» (linha 39)** — a v7 fez o que era difícil sem perder o que era bom: manteve **o que cada `it` exige** (a informação durável, que sobrevive a qualquer mudança de cor), manteve o vermelho como fase narrada em vez de apagada, manteve o papel de detector de deriva com a condição exata que o reacende (`stale`) e a proibição de silenciá-lo — e agora ancora a cor no estado que a produz, nos dois sentidos. É o bullet que carrega o valor de cap. 7 desde a v1 e ficou mais honesto, não mais defensivo.
- **A entrada v7 do Histórico (linha 13)** — 1 717 bytes que registram a absorção no padrão da casa: o achado absorvido com sua contagem de origem, as duas edições com o texto de antes e de depois, a **razão** pela qual a ressalva anterior não bastava (o caso oposto), o que ficou intacto, o que **não** foi absorvido e por quê (L1, com o id `task-189` e o owner), e — isto é raro e vale preservar — a autocorreção de rigor sobre a própria v6 (o `it` 1 também havia perdido «, verde hoje»). Salvo o número do L1 acima, é um registro auditável linha a linha.
- **CT-070 (linha 131)** — segue reproduzindo cláusula a cláusula o C4 de `RULES.md` e as oito asserções reais dos dois `it` (`repo-specs.spec.ts:25-29`, `:35-38`), com a condição de retorno ao vermelho embutida no próprio caso crítico: quem lê o CT sabe o que o mantém verde sem sair do arquivo. Intocado pela v7, e é a âncora que torna as linhas 14 e 39 verificáveis.
- **As 19 marcas «a escrever» do corpo, inalteradas desde a v5** — a v7 mexeu nas duas passagens que mais convidavam a afrouxar a honestidade sobre a cor da suite e não promoveu nenhuma cláusula a provada, não removeu nenhuma marca e não inventou nenhum `describe`/`it`. A disciplina que a linha 10 declara está cumprida no corpo inteiro.

## Veredito

**approved** — 0 HIGH, 0 MEDIUM, 2 LOW.

**A aritmética fecha, e parcela por parcela:** 1 717 + 127 + 271 = **2 115 = 48 698 − 46 583**, com 176 → **177** linhas. Cada delta declarado foi medido isoladamente contra a v6 reconstruída no lugar e reproduziu o número da tabela do autor; a reconstrução validou-se devolvendo 885/928 bytes contra os 886/929 da rodada 6 (a diferença é o `\n`). Como as três parcelas esgotam o delta total, nenhuma outra passagem mudou de tamanho. A armadilha do `HEAD` foi evitada: confirmei `version: 5` em `HEAD` e não usei `git diff` contra ele como evidência do diff desta rodada.

**O M1 foi absorvido de fato**, nas duas afirmações, com o texto proposto pela rodada 6 aplicado quase literalmente (só «v6» → «v7», que é a correção necessária) e com as três razões que o M1 deu atendidas: a qualificação passou a ser a frase imediatamente seguinte à afirmação (razão b, distância zero), nomeia a condição desta versão em vez do caso oposto (razão a), e nenhuma marca de honestidade foi tocada (razão c). O teste que importa — o leitor do repositório público que roda `npm test` e vê `509/510` — agora encontra esse mesmo `509/510` escrito na spec, nos dois lugares, com a condição que o produz e a que o desfaz. A absorção **não** introduziu contradição: os três tempos verbais da linha 39 (presente qualificado, exceção corrente, passado, presente durável) não se cruzam, e as menções a `509`/`510` do arquivo concordam entre si.

**Nada regrediu.** Contrato íntegro: frontmatter na linha 1 com `version: 7` nu e `status: draft`, `owner: test`; 76 ids contíguos CT-001…CT-076 sem duplicata, nenhum renumerado, removido ou criado; zero linhas `R/S/P/C`; as sete seções do template; 48 698 bytes < 256 KiB. Seis spot-checks de prova (CT-070, CT-035, CT-043, CT-032, CT-058, CT-076) resolvem para `describe`/`it` existentes, e as oito asserções de CT-070 batem uma a uma — inclusive o `expect` de `repo-specs.spec.ts:35` que é a causa material do que as linhas 14 e 39 agora declaram. As 19 marcas «a escrever» do corpo são as mesmas da v5.

**L1 (da rodada 6) corretamente não absorvido:** `specs/AGENTS.md` está **intocado** (`git status` vazio; último commit `4ac6167`, anterior a esta rodada) e a v7 registra a deriva como proposta ao owner `agents` pela task-189 — a regra da casa cumprida, não contornada. Se o autor tivesse editado aquele arquivo seria HIGH; não é o caso.

Os dois LOW desta rodada não bloqueiam nada e nenhum deles é sobre a substância da absorção: **L1** é um número auto-referente no Histórico («20 marcas» onde são 19 no corpo e 21 no arquivo) cuja afirmação de fundo é verdadeira, corrigível em três palavras; **L2** consigna, a pedido, que o «~600 bytes» da rodada 6 estava inflado — confirmo que a v7 acertou em não repeti-lo e em registrar o argumento substantivo —, mas **discordo da medição de 315**: medi 340 bytes para a ancoragem que o M1 usou, com faixa defensável de 233–363, e não consigo reproduzir 315 em nenhum par de âncoras.

Pronto para o carimbo humano (v7, digest `fa744c9e`), com os dois LOW à disposição do autor para uma v8 — ou para ficarem registrados como não absorvidos, já que nenhum deles toca a correção que esta versão veio fazer.
