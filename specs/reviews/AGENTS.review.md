---
file: AGENTS.md
reviewer: subagent (revisor adversarial)
reviewed_version: 8
reviewed_digest: "7caf7dd4"
verdict: approved
round: 8
findings: { high: 0, medium: 0, low: 0 }
---
# Revisão adversarial — specs/AGENTS.md v8 (digest 7caf7dd4) — rodada 8

## Método

- Li inteiro o parecer da rodada 7 (`specs/reviews/AGENTS.review.md`, v7/`5f8e2506`, `needs-revision` 0/0/1) antes de abrir a v8, e depois a `specs/AGENTS.md` v8 inteira. Medida de disco: `wc -l -c specs/AGENTS.md` = **126 linhas / 42 635 bytes** — bate com o declarado na pauta.
- **Confirmei a leitura do código que o agente principal pediu que eu conferisse, e ele está certo.** `packages/scrum-domain/src/specs.ts:572` é `if (out.verdict !== 'approved') return { ...out, state: 'needs-revision', reasons: [`review verdict is ${out.verdict}`] }` — a checagem do veredito vem **antes** da de findings (`:573`) e antes do único `return { ...out, state: 'current', reasons: [] }` do método (`:574`). Logo um parecer `verdict: needs-revision` com `findings: { high: 0 }` produz estado `needs-revision`, **jamais** `current`: o `high: 0` nem chega a ser lido, porque `:572` já retornou. E `specs/RULES.md:41` (R29) exige, para o carimbo, «um texto com revisão `current` a 0 HIGH». As duas peças juntas fecham: **enquanto o parecer da rodada 7 estivesse no disco, o carimbo da v8 era impossível por código, não por etiqueta**. A rodada 8 não é discricionária. (Cadeia completa: `specs.ts:601` mostra a mesma exigência do lado do `spec-order`, «needs a current review: verdict approved, findings.high 0».) O agente principal não está errado.
- **Reconstrução da v7 (ela não existe no disco).** `HEAD` (`4ac6167`) carrega a **v4** (`git show HEAD:specs/AGENTS.md` → `version: 4`, **121 linhas / 32 337 bytes**), então nem `git diff` nem `git show` alcançam a v7. Reconstruí-a revertendo **exatamente** as quatro mudanças declaradas: removi a linha 13, repus `version: 7` na 4, devolvi os três números ao fecho da 15 e devolvi à 14 a frase «… «(14)» → «(15)» — números da v6, coerentes com as demais daquela entrada.». **A reconstrução devolve 125 linhas / 40 661 bytes** — os dois números que a rodada 7 mediu de forma independente, ao byte. E as medidas por linha coincidem com as daquele parecer: linha 13 (v7) = **2 036**, linha 14 (v6) = **2 693**, bullet 75 = **1 047**. Cinco coincidências independentes: a reconstrução é a v7.
- **Aritmética fechada por bytes**, medindo cada linha com o `\n` (`awk 'NR==N {print length($0)+1}'`, o mesmo comando que o autor declara ter usado). A soma está em «Diff v7→v8» e fecha com **diferença 0**.
- **Verificação de todo SHA do arquivo.** `grep -noE '\b[0-9a-f]{7,40}\b'` devolve **14 ocorrências de 7 hashes distintos**, nas linhas 15 (nove), 76 (uma) e 113 (quatro). `git cat-file -t` em cada um: `4bd927d`, `093a166`, `b7c0d72` → `fatal: Not a valid object name` (mortos, e **só** na linha 15, onde o texto afirma que morreram); `88ce9ea`, `bb4ec4a`, `b9ad684`, `b183f23` → `commit`. **A entrada da v8 (linha 13) não cita hash algum** — registro porque a pauta pede «todo SHA do arquivo»: o conjunto da entrada nova é vazio, e isso é a favor da versão.
- **6 spot-checks de citação que nem a rodada 6 nem a 7 verificaram** (a pauta pede ao menos 4): `snapshot.ts:85` → `` return `Higiene: ${parts.join(' · ')} — o título é o QUÊ; o COMO vai na descrição.` `` (a linha 28 e a 82 citam-na como «linha `Higiene:`» e como a repetição do QUÊ/COMO — as duas afirmações estão na **mesma** linha, ambas corretas); `snapshot.ts:134-135` → `[SCRUM · sprint ativa ${sprint.id} #${sprint.number}]` e `Progresso: … tarefas · … pontos.`, exatamente o par «sprint ativa»/«Progresso:» que a linha 28 nomeia; `command-scrum/src/index.ts:26` → `'Uso: /scrum [tree|sprints|status [spr-N]|ceremonies [spr-N]|trash|archive]'` e `:49` → `description: 'Estado do processo SCRUM deste workspace: … (somente leitura)'` — os dois em português, como a linha 28 exige; `repo-specs.spec.ts:24` → `it('exists and is complete: the minimal set approved, nothing invalid, nothing unknown', …)` e `:32` → `it('the seven files of the pipeline are approved, each with a current review', …)` — os dois `it` da linha 109, com o texto que ela abrevia; `spec-brief.ts:256-258` → o bloco `'## Response format (mandatory)'` seguido de `'You are READ-ONLY on the project: do not modify files other than the report, do not run installers or builds.'`, que sustenta tanto a linha 80 («Pareceres no formato que os briefs pedem», `spec-brief.ts:256-272`) quanto a 48 (`spec-brief.ts:258`, o READ-ONLY); `specs.ts:129-145` → `SPEC_PREDECESSORS` com `'PRD.md': []`, `'AGENTS.md': ['ARCHITECTURE.md']` e `'TESTS_SPEC.md': ['RULES.md','API_SPEC.md']` — o DAG que a linha 105 transcreve, inclusive a afirmação «AGENTS.md só depende de ARCHITECTURE.md». Todos resolvem para o que o texto afirma.
- **Não rodei a suite, nem instalador, nem build**; `git` só para leitura (`show`, `cat-file`). Nenhum arquivo além deste parecer foi escrito.

## Absorção da rodada anterior

**L1 (as três âncoras com os números da v5 rotulados como da v6) — ABSORVIDO, na forma preferida que o parecer da rodada 7 recomendou.**

O fecho da entrada da v6 (linha 15) lê hoje, à letra:

> «Intactas por decisão do revisor: «TDD» (o «vermelho» do teste antes do código), «Suite» (18 arquivos, 510 testes, ~2,4 s) e o Histórico da v3.»

Os três números saíram; restam as três âncoras por nome. É **exatamente** a opção «Preferida» do L1 da rodada 7 (`specs/reviews/AGENTS.review.md:129` na versão daquela rodada), não a «Alternativa mínima» de repor 89/54/16 — e adiante explico por que a escolha foi a certa.

**Os números 88/53/15 sobrevivem uma vez, e o uso é legítimo.** `grep -no '(88)\|(53)\|(15)'` casa **só na linha 13**, a entrada da v8, dentro da frase que descreve o que foi apagado: «os números que acompanhavam as três âncoras saem: «"TDD" (88)» → «"TDD"», «"Suite" (53)» → «"Suite"», «o Histórico da v3 (15)» → «o Histórico da v3»». Isto é **menção, não uso**: o texto não pede ao leitor que resolva `(88)` como posição de nada — exibe o token que deixou de existir, para que o Histórico consiga dizer o que a versão corrigiu. É a mesma figura que a rodada 6 julgou correta para os três SHAs mortos (`4bd927d`, `093a166`, `b7c0d72`, que continuam só na linha 15, onde o texto afirma que morreram) e que a rodada 7 julgou correta para `TESTS_SPEC.md:14`. Mais: a frase seguinte **desarma** o token no ato de exibi-lo — «Eram posições da v5 rotuladas como da v6 (lá são 89/54/16)» —, de modo que ninguém sai dali achando que 88 é uma linha desta versão. Suprimir a menção tornaria a entrada incapaz de declarar a própria mudança, que é o requisito de «Histórico» com a absorção item a item (linha 107). **Legítimo; não é achado.**

**Confirmação de que L4 da rodada 3 segue dívida declarada, não absorvida.** A entrada da v8 a declara: «Não absorvido: L4 da rodada 3 segue dívida declarada pela mesma razão da v4 a v7.» Conferido no disco: as quatro cópias do procedimento do carimbo continuam coerentes entre si e com a canônica «Humano» — linha 49 («Humano», o procedimento (a)–(e) completo), 54 («`scrum_item_update` … e a linha `status:` dos requisitos na forma 2 do carimbo»), 61 («Perguntas ao humano», carimbo com arquivo/componente, versão e digest), 65 («Decidir um `approved`») e 90 («Espiral › Requisitos», forma 1/forma 2). Nenhuma contradiz outra; a redação da v8 («da v4 a v7») é a compressão correta do que a v7 escrevia como «da v4, v5 e v6», e ficou um token mais curta. Não reaberto, não contado.

## Diff v7→v8 (aritmética de bytes)

A v7 não está no disco e `HEAD` traz a v4, então reconstruí (ver «Método»). Medi cada linha em bytes UTF-8 **com o `\n`**:

| Linha v7 → v8 | O quê | Δ bytes |
|---|---|---|
| 4 → 4 | `version: 7` → `8` | 11 → 11 = **+0** |
| 5 → 5 | `status: draft` mantido | 14 → 14 = **+0** |
| — → 13 | linha nova do Histórico v8 (+ `\n`) | **+1 962** |
| 13 → 14 | entrada da v7: a frase perde os números e o rótulo «números da v6» | 2 036 → 2 061 = **+25** |
| 14 → 15 | fecho da entrada da v6: saem os três números | 2 693 → 2 680 = **−13** |
| 108 → 109 | «Specs › `it` 2», «carimbo da v7» → «da v8» | 699 → 699 = **+0** |
| | **soma** | **+1 974** |

42 635 − 40 661 = **+1 974**. **A aritmética fecha exatamente: diferença 0.** Linhas: 125 + 1 = **126** ✓. **Concordo com a pauta**: 1 962 + 25 − 13 = 1 974, e cada parcela é medida, não estimada.

Uma observação de rigor a favor do autor: a v7 declarara «2 115 / 1 096» onde o real era «2 036 / 128 / 1 047» (a rodada 7 apanhou a diluição). **Nesta versão a repartição declarada é a medida**: a entrada da v8 diz «a entrada da v7, 2 036 → 2 061 (+25); o fecho da v6, 2 693 → 2 680 (−13)» e os quatro números batem ao byte com o `awk`. O defeito de método que a rodada 7 nomeou foi corrigido no ato seguinte, e o autor cita o comando que usou.

Três conferências independentes que sustentam a tabela:
- **Contagem da reconstrução**: revertendo só as quatro mudanças declaradas sobram **125 linhas / 40 661 bytes** — os dois números exatos que a rodada 7 mediu.
- **Diferença de conjuntos contra a v4** (`HEAD`): as linhas da v8 ausentes da v4 são exatamente **{4, 5, 13, 14, 15, 16, 59, 60, 76, 109, 112, 113, 121}** — as duas do frontmatter, as quatro entradas novas de Histórico (v8, v7, v6, v5), o bullet novo da v7 (76), e as seis linhas que v5/v6/v7/v8 editaram. **Nenhuma linha fora dessa lista difere da v4**, logo nenhuma mudança escondida em quatro saltos de versão. É a mesma lista que a rodada 7 obteve, deslocada de um e acrescida da 13.
- **Medidas por linha coincidentes**: 2 036 (entrada v7 antes da edição) e 2 693 (entrada v6 antes da edição) reproduzem, sem eu as consultar durante a medição, os dois valores que o parecer da rodada 7 registrou.

## Sobre a recusa de repor 89/54/16 (a pergunta 3)

**O autor está certo, e o argumento dele é verificável — verifiquei.** Ele escreve: «Apagar em vez de corrigir é o que «Regras de output › Citação posicional envelhece» manda: a âncora estável é o nome entre aspas, e 89/54/16 já estariam errados nesta versão.»

Calculei as posições reais **na v8**: `grep -n` dá «TDD» na **92**, «Suite» na **56**, o Histórico da v3 na **18**. Ou seja, a «Alternativa mínima» que a rodada 7 ofereceu (88→89, 53→54, 15→16) teria gravado, no arquivo em que a v8 se tornou, um trio que não corresponde nem à v5 (88/53/15), nem à v6 (89/54/16), nem à v8 (92/56/18). Teria produzido a terceira geração do mesmo defeito no ato de consertar a segunda — e num arquivo cujo assunto declarado é que citação posicional envelhece. **A recusa não só é legítima: era a única saída que não reabre o achado.**

E a saída escolhida é a que o próprio arquivo prescreve. A linha 76 fecha com: «a âncora estável é o nome da seção ou do bullet entre aspas». O fecho da v6 hoje traz **só** as âncoras por nome, e cada uma delas ainda carrega o seu discriminante semântico — «o «vermelho» do teste antes do código» para «TDD», «18 arquivos, 510 testes, ~2,4 s» para «Suite» —, de modo que o leitor localiza os três bullets sem número e sem ambiguidade (`grep -n '^- \*\*TDD\*\*'` resolve em um comando). A regra pagou dividendo pela segunda versão consecutiva. Recusa bem fundamentada; a versão ficou melhor por ele não ter obedecido à letra.

## Sobre a correção da frase da entrada da v7 (a pergunta 2)

**Acerto, não escopo indevido.** O argumento do autor — apagar os números sem corrigir a frase «apagaria a evidência mas deixaria a mentira» — é literalmente verdadeiro, e a reconstrução mostra o que teria acontecido se ele não a tivesse corrigido: a entrada da v7 dizia «… «(14)» → «(15)» — **números da v6**, coerentes com as demais daquela entrada», enquanto a entrada da v6 já não teria número nenhum. O leitor encontraria uma frase declarando a proveniência de três números que não existem mais, com um rótulo que a rodada 7 provou falso. Seria pior que o estado da v7: lá a afirmação falsa ao menos tinha referente.

Formalmente, a correção também **não é escopo novo**: é o mesmo L1, na sua segunda metade. O L1 da rodada 7 pedia duas edições explícitas — «Na linha 14, trocar o fecho por: …» **e** «E, na entrada da v7 (linha 13), ajustar a frase que descreve a mudança: …». O autor executou as duas. Ele não foi além do pedido; foi até o fim dele. O que ele fez de próprio foi a **redação** do substituto — «(os números que acompanhavam essas âncoras saíram na v8, ver a entrada acima)» em vez do texto que a rodada 7 propunha —, e a escolha é melhor: transforma a frase num cross-ref para a entrada onde a mudança está declarada, em vez de reescrever a história da v7 como se ela já tivesse feito o que a v8 fez. A entrada da v7 continua dizendo o que a v7 fez (reancorar pelo nome), e delega à v8 o que a v8 fez (tirar os números). **Isso é a forma correta de um Histórico append-only se corrigir sem se falsificar.** +25 bytes por essa precisão é barato.

## Sobre a varredura declarada (a pergunta 4)

**A amostra que ele exibe está correta; a conclusão que ele tira dela é boa na substância, mas está declarada de forma larga demais.** Trato os dois planos.

**A amostra confere, um a um.** Abri cada uma das seis ocorrências no disco:
- v6 (linha 15) — «H1 → «Commits e segredos» (109)»: número **colado ao nome da seção** ✓. «M1 → «git» (56)»: colado a «git» ✓. «a correção que a v5 fez em «Specs» (105)»: colado a «Specs» ✓ (e ocorre duas vezes na entrada, ambas coladas).
- v5 (linha 16) — «Commits» (107) ✓; «Ver também › TESTS_SPEC.md» (116) ✓; «o «vermelho» de «TDD» (87)» ✓.

Nos seis casos a âncora por nome está presente e o número vem entre parênteses logo depois, como conveniência. **Nenhum deles pede troca**, exatamente como o autor conclui: pela regra da linha 76, o nome é a âncora e o número é acessório; e pela regra da mesma linha, «as posições de linha ali são as da versão descrita», o que torna 109/56/105/107/116/87 corretos **como posições históricas** — e são: reconstruí a v6 e a «Commits e segredos» estava mesmo na 109 quando a v6 a descreveu.

**Onde a declaração é larga demais.** O autor escreve «nenhum outro número de bullet deste arquivo pede a troca — os que restam (…) já vêm colados ao nome da seção que ancoram». Varri as oito entradas do Histórico por conta própria (linhas 13–20, com um extrator de `(\d+)` / `linha \d+`) em vez de aceitar a amostra, e **os que restam não são só esses seis**. Há três ocorrências que a amostra não menciona e que **não** vêm coladas a um nome:

- **linha 15 (v6): «— a linha 108 já a tratava como encerrada e a 56 dizia «in progress» sem marca.»** Aqui «108» e sobretudo «a 56» aparecem como números **nus**, sem nome de seção adjacente. (A 56 é, no contexto da v6, a «git»; a 108, a «Specs».)
- **linha 16 (v5): «logo a linha 52 (18 arquivos, 510 testes, ~2,4 s) bate e não foi tocada»** — número nu, com o discriminante entre parênteses mas sem o nome «Suite».
- Menores, no mesmo espírito: «(linha 102)» e «(linha 104)» vêm coladas a «o par «lacuna achada em outra spec → proposta ao owner»» e a «Specs», respectivamente — essas duas **estão** ancoradas e não conto.

Então a frase «os que restam já vêm colados ao nome da seção que ancoram» é **verdadeira para a amostra exibida e para a maioria, mas não é universal**: escapam-lhe pelo menos «a 56», «a linha 108» e «a linha 52».

**E mesmo assim não abro achado.** Por três razões, e explico-as porque a diferença entre «declaração larga» e «defeito» é o que decide este veredito.

Primeiro, **a conclusão operacional do autor continua correta**: ele conclui que *nenhum outro número pede troca*, e nenhum pede. Os três que escapam à sua caracterização são todos números **da versão que a entrada descreve**, usados dentro da frase que descreve aquela versão, e por isso a linha 76 os declara corretos por construção («as posições de linha ali são as da versão descrita, não as do arquivo atual»). Trocá-los seria o erro; deixá-los é o acerto. O autor chegou ao destino certo por um caminho que descreveu de forma imprecisa — o defeito, se algum, é da prosa da declaração, não do arquivo.

Segundo, **essas três ocorrências não são do tipo que o L1 corrigia**. O L1 era sobre números que acompanhavam âncoras **e traziam um rótulo de proveniência falso** («números da v6» quando eram da v5). Nenhuma das três traz rótulo de proveniência algum: são prosa histórica interna a uma entrada, e a linha 76 já lhes atribui a leitura certa sem que precisem repetir a convenção. Abrir achado sobre elas seria pedir que cada número de cada entrada antiga do Histórico ganhasse nome colado — uma reescrita de duas entradas fechadas, para zero ganho de precisão e com risco real de introduzir erro em texto que hoje está correto. Isso **contraria** o critério que este arquivo fixa para o revisor: achado é defeito, não preferência de redação.

Terceiro, e decisivo: a pauta me pergunta se «a conclusão se sustenta ou se ele deixou passar algum». **Ela se sustenta.** Ele não deixou passar nenhum número *que precisasse de troca* — que é o que a conclusão afirma. Registro a imprecisão da caracterização aqui, na seção de método, para que a rodada seguinte não a cite como se fosse um censo exaustivo; não a transformo em LOW porque não há mudança concreta que melhore o arquivo, e um achado sem mudança concreta é ruído.

## Sobre a omissão do próprio tamanho (a pergunta 5)

**A omissão é honesta, bem justificada, e a justificativa é matematicamente correta — não uma desculpa.** O texto diz: «e esta linha nova, cujo tamanho o `wc` do arquivo dá (não o declaro aqui: declarar o próprio número mudaria a linha que ele mede)».

O problema é real e tem nome: é um ponto fixo. Se a linha declarar «esta linha tem N bytes», o ato de escrever os dígitos de N altera o comprimento da linha, que passa a ser N′ ≠ N. Existe **às vezes** um N que se autodescreve (quando a variação de dígitos casa com a variação de valor), mas encontrá-lo exige iterar, e nada garante que exista para um texto dado — pode oscilar entre dois valores sem nunca pousar. O autor diz ter medido, corrigido e re-medido três vezes «até o texto ser ponto fixo»: note que ele **não** afirma ter atingido o ponto fixo *do próprio tamanho declarado* (que é o que ele explicitamente recusa fazer); afirma ter estabilizado as **outras** declarações — 2 061, 2 680, 126 linhas —, que também mudam quando a linha 13 muda de tamanho, porque a linha 13 é o que desloca tudo. Essa é uma iteração real e necessária, e o resultado é verificável: **os quatro números que ele declara estão certos ao byte** (medi 2 061, 2 680, 699, 126). Se a iteração não tivesse convergido, algum deles estaria errado.

**A alternativa que ele adota é a correta.** «cujo tamanho o `wc` do arquivo dá» remete o leitor a uma medição de fora, que sempre existe e nunca é auto-referente: 42 635 − 40 661 − 25 + 13 = 1 962, e o `awk` na linha 13 devolve exatamente **1 962**. Ou seja, o número **é recuperável do que ele declarou**, por subtração, com uma única linha de aritmética — a informação não se perdeu, só deixou de ser afirmada de forma auto-referente. Isso é estritamente melhor que declarar um número que a própria declaração falsifica, e melhor também que o silêncio: ele nomeia a lacuna, dá a razão e aponta o instrumento.

Não vejo forma superior. As três que considerei são piores: (a) declarar «~1 962» com til abre a porta à estimativa que a rodada 7 justamente puniu; (b) declarar o tamanho *sem* os dígitos («esta linha, a maior do Histórico») perde a auditabilidade; (c) pôr o número numa nota fora da linha violaria o formato de bullet único do Histórico. **Honesta e bem justificada; não é achado.**

## Densidade (a pergunta 6)

**A tendência de queda continua, pela segunda versão consecutiva.** Medi as oito entradas (bytes sem o `\n` / palavras):

| Entrada | Bytes | Palavras |
|---|---|---|
| v8 | **1 961** | 348 |
| v7 | 2 060 | 352 |
| v6 | 2 679 | 441 |
| v5 | 1 661 | 280 |
| v4 | 622 | 104 |
| v3 | 1 370 | 207 |
| v2 | 663 | 99 |
| v1 | 26 | 5 |

A v8 mede **1 961 B contra 2 060 B da v7: 0,95×**, e contra os 2 679 da v6 é **0,73×**. A curva desce: 2 679 → 2 060 → 1 961. A rodada 6 temera que a v7 passasse de 3 800 B; duas versões depois a entrada está a **menos de metade** desse limiar.

**A admissão do autor é honesta e o excedente é justificado.** Ele diz que a entrada ficou «mais longa do que três tokens pedem» por absorver a varredura e a correção de rigor. É verdade: o L1 absorvido custaria talvez 300 B; os outros ~1 660 B são (i) a declaração byte a byte do diff com o comando de medição, que existe **porque a rodada 7 apanhou a diluição da v7** e é a prova de que o método mudou; (ii) a varredura das entradas antigas, que fecha a classe em vez de a deixar aberta para a rodada 9; (iii) a nota de método sobre a auto-medição. Nenhum desses três é enchimento — cada um respondeu a uma pergunta que este parecer teria feito se não estivesse respondida, e os três juntos foram o que me permitiu fechar a aritmética e a varredura em minutos em vez de reconstruir às cegas. **Uma entrada que encolhe 5 % enquanto aumenta a cobertura auditável não é um problema de densidade.** Não é achado.

## Contrato

- **Frontmatter na linha 1** ✓: `---` na 1; `title: "Agentes — scrum-harness"` e `purpose: "…"` **entre aspas duplas**; `version: 8` **inteiro nu** (linha 4, 11 bytes com o `\n`); `status: draft` (linha 5); `owner: agents` (linha 6); `---` na 7. Nenhuma chave extra, nenhuma faltando.
- **Zero ids** ✓: `grep -cnE '^(R|S|P|C)[0-9]+( — |\. )|^CT-[0-9]{3}|^ADR-[0-9]{3}( — |\. )'` → **0**.
- **Sete seções na ordem do template** ✓: `## Histórico` (12) → `## Persona` (22) → `## Ferramentas permitidas` (52) → `## Ferramentas proibidas` (63) → `## Regras de output` (73) → `## Restrições obrigatórias` (86) → `## Ver também` (118). Ordem exata, nenhuma extra, nenhuma faltando. (Todas deslocadas de +1 contra a v7, o que é a assinatura de uma única linha inserida no topo — coerente com o diff.)
- **Tamanho** ✓: 42 635 bytes = **41,6 KiB** ≪ 256 KiB.

## O que não devia mudar continua intacto

Conferido **byte a byte**: comparei cada linha da v8 contra o conjunto de linhas da v4 de `HEAD` (identidade exata, não semelhança) e medi cada bullet com o `\n`. Cito por **nome**, com o número entre parênteses só como conveniência — conforme a linha 76.

- **«TDD»** (v8 **92**) — **256 bytes**, e **byte-idêntica à v4** ✓ (pertence ao conjunto de linhas da v4). O «vermelho» segue no sentido do TDD («o teste é escrito e roda **vermelho** antes do código», «29 tests red-first»), não estado da suite.
- **«Suite»** (v8 **56**) — **658 bytes**, **byte-idêntica à v4** ✓. «18 arquivos, 510 testes, ~2,4 s» intacto; a decisão de não remedir continua correta pela razão que a v7 declarou (a linha não foi tocada e a validação da task-190 roda `npm test` ×3).
- **Histórico da v3** (v8 **18**) — **1 371 bytes**, **byte-idêntica à v4** ✓.
- **As quatro correções da v5**, com o tamanho exato que as rodadas 6 e 7 fixaram: **«Subagentes»** (60) = **304 B** ✓; **«Specs › o bullet do `it` 2»** (109) = **699 B** ✓ — única alteração interna «carimbo da v7» → «carimbo da v8», mudança de **zero byte** (699 = 699), confirmada no texto e coerente com `version: 8`; **«Commits e segredos › a exceção»** (112) = **384 B** ✓; **«Ver também › TESTS_SPEC.md»** (121) = **296 B** ✓, ainda apontando «v7» de `TESTS_SPEC.md`.
- **«Commits e segredos › Regra da casa»** (113) = **1 249 B** ✓, byte-idêntica à v7. Os três SHAs vivos com rótulo semântico (`88ce9ea` PRD/GLOSSARY/RULES, `bb4ec4a` ARCHITECTURE/API_SPEC, `b9ad684` v0.20) e a ressalva anti-repetição no fim, tudo no lugar; `git cat-file -t` → `commit` nos três, e as contagens que ilustram (13 e 18) não foram tocadas.
- **«Regras de output › Citação posicional envelhece»** (76) = **1 047 B** ✓, byte-idêntica à v7 — a peça que a rodada 7 mandou não tocar, e que esta versão **aplicou** em vez de editar. É o melhor sinal possível: a regra foi usada, não mexida.

**Contradições internas: nenhuma.** Varri as afirmações novas contra o resto do arquivo. A entrada da v8 diz que o fecho da v6 perde os três números: confere (linha 15, `grep` não casa nenhum ali). Diz «125 → 126 linhas»: confere (`wc -l` = 126; a reconstrução, 125). Diz que a entrada da v7 vai a 2 061 e o fecho da v6 a 2 680: confere ao byte. Diz que «Specs › `it` 2» passa a «carimbo da v8»: confere — `grep "carimbo da v[0-9]"` devolve a **109** com «v8», e as ocorrências das linhas 13–16 são históricas, cada uma na entrada certa. Diz que o bullet 75 fica intacto: o bullet mudou de **número** (75 → 76, deslocado pela linha inserida) mas não de **conteúdo** — e a entrada o chama de «o bullet 75», que é a sua posição **na v7**, a versão em que nasceu. Pela convenção que o próprio bullet institui («as posições de linha ali são as da versão descrita»), isso está **correto**, não errado; verifiquei que o bullet é byte-idêntico ao da v7 (1 047 B) e que o seu texto continua a ser a âncora nomeada «Regras de output › Citação posicional envelhece», citada por nome duas linhas antes na mesma entrada.

## HIGH

Nenhum. Nenhum SHA citado como evidência está morto (os sete conferidos com `git cat-file -t`); os três mortos aparecem só na linha 15, onde o texto afirma que morreram; a entrada da v8 não cita hash algum; os seis spot-checks novos resolvem para o que o texto afirma; a aritmética fecha com diferença 0 contra os 40 661 bytes que a rodada 7 mediu; nenhuma passagem mudou sem ser declarada (a diferença de conjuntos contra a v4 devolve exatamente as treze linhas esperadas e nenhuma outra); o contrato está íntegro.

## MEDIUM

Nenhum. O único achado da rodada 7 foi absorvido na forma preferida daquele parecer, e a única ocorrência remanescente de 88/53/15 é menção descritiva do que foi apagado, desarmada na frase seguinte pelo esclarecimento «Eram posições da v5 rotuladas como da v6 (lá são 89/54/16)» — uso legítimo pela mesma doutrina que as rodadas 6 e 7 aplicaram aos SHAs mortos e a `TESTS_SPEC.md:14`.

## LOW

Nenhum.

Registro, para que a ausência não pareça descuido, os dois pontos que examinei como candidatos e **conscientemente não abri**, com a razão:

1. **A caracterização larga na varredura** («os que restam já vêm colados ao nome da seção que ancoram», quando «a 56», «a linha 108» e «a linha 52» não vêm). Não é achado porque a **conclusão** que a frase sustenta — nenhum outro número pede troca — é verdadeira, e porque não existe mudança concreta que melhore o arquivo: os três números são posições da versão descrita, que a linha 76 já declara corretas por construção, e reescrevê-los introduziria risco em texto hoje correto. Documentado em «Sobre a varredura declarada» para a rodada seguinte não o citar como censo exaustivo.
2. **A citação «o bullet 75»** na entrada da v8, quando o bullet está hoje na 76. Não é achado porque é **exatamente** a convenção que o próprio bullet institui e que a v7 escreveu: posições no Histórico são as da versão descrita. Abrir achado aqui seria punir o autor por obedecer à regra do arquivo.

Nenhum dos dois tem mudança concreta a propor, e um achado sem mudança concreta é ruído — o que este arquivo proíbe ao revisor no formato que ele mesmo fixa (linha 80: «cada achado com **problema / por que importa / mudança concreta (texto proposto quando cabe) / evidência**»).

## Sections I would keep

- **«Regras de output › Citação posicional envelhece» (76)** — pela segunda rodada consecutiva, a peça que eu não deixaria ninguém tocar, e agora por uma razão mais forte que a da rodada 7: ela **decidiu** esta versão. Foi a regra que disse ao autor para apagar em vez de repor 89/54/16, e o cálculo mostra que a alternativa teria gerado a terceira geração do mesmo erro (as posições na v8 são 92/56/18). Uma regra que impede o revisor anterior de errar de novo já não é conselho: é mecanismo. Byte-idêntica à v7 (1 047 B). Não mexer.
- **A entrada da v8 no «Histórico» (13)** — 0,95× a v7 e 0,73× a v6, sem um único hash a envelhecer, com o diff declarado **ao byte** e o comando de medição nomeado (`awk 'NR==N {print length($0)+1}'`). É a resposta direta ao defeito de método que a rodada 7 apanhou na v7, e foi ela que me permitiu fechar a aritmética por conferência em vez de reconstrução às cegas. A nota sobre não declarar o próprio tamanho é o tipo de honestidade que eu quereria ver mais vezes: nomeia a lacuna, dá a razão e aponta o instrumento que a preenche.
- **O fecho da entrada da v6 (15)** — o resultado do L1: três âncoras por nome, cada uma com o seu discriminante semântico («o «vermelho» do teste antes do código»; «18 arquivos, 510 testes, ~2,4 s»), zero números. É a forma canônica que o bullet 76 prescreve, agora exemplificada no mesmo arquivo. Se alguma versão futura sentir a tentação de «repor os números para facilitar a navegação», este parecer registra o cálculo que a desaconselha.
- **«Commits e segredos › Regra da casa» (113)** — byte-idêntica desde a v6 (1 249 B), com os três SHAs vivos rotulados semanticamente e a ressalva de fragilidade no fim. Continua a ser o exemplo do que o bullet 76 prescreve, com cross-ref explícito nos dois sentidos. Não mexer.
- **«Restrições › Specs, o bullet do `it` 2» (109)** — 699 B, preservada byte a byte salvo o «v8», e ainda a peça mais bem construída do arquivo: mecânica dos dois `it` (conferida agora contra `repo-specs.spec.ts:24` e `:32`, que dizem à letra o que ela abrevia), estado de repouso (510/510), estado transitório (509/510) e auto-referência explícita («esta inclusive, `draft` até o carimbo da v8»). É o que torna correto não remedir a suite nesta rodada.
- **«Persona › Humano» (49) e «Sequência fixa» (50)** — inalteradas desde a v3, seis rodadas sem achado. Governam esta revisão: é a «Sequência fixa» que tornou esta rodada 8 obrigatória («versão nova → **nova rodada** obrigatória … porque o texto mudou e a revisão anterior ficou `stale`»), e é o procedimento (a)–(e) que impede que este parecer vire carimbo. Note-se que o mecanismo que verifiquei em `specs.ts:572` é a implementação exata desta frase.
- **«Regras de output › Pareceres» (80)** — o formato que este parecer segue, incluindo «`approved` exige `high: 0`; a contagem do frontmatter bate com as seções», e a exigência de mudança concreta por achado, que é a razão pela qual esta rodada fecha em zero.

## Veredito

**approved** — **0 HIGH, 0 MEDIUM, 0 LOW**.

**A leitura de código do agente principal está confirmada e esta rodada era obrigatória, não discricionária.** `packages/scrum-domain/src/specs.ts:572` testa o veredito **antes** da contagem de findings e antes do único retorno `current` (`:574`): um parecer `needs-revision` com `high: 0` produz estado `needs-revision`, e o `high: 0` sequer é lido. `specs/RULES.md:41` (R29) exige revisão `current` a 0 HIGH para o carimbo. Enquanto o parecer da rodada 7 estivesse no disco, o carimbo da v8 estava fechado por código. A v8 tinha de existir.

**A aritmética fecha exatamente.** 1 962 + 25 − 13 = **1 974**; 40 661 + 1 974 = **42 635** = o tamanho medido no disco; 125 + 1 = **126** linhas. **Concordo com a conferência da pauta.** Verifiquei por três caminhos independentes: a reconstrução da v7 devolve 125 linhas **e** 40 661 bytes — os dois números que a rodada 7 mediu sem me consultar —, e reproduz as suas medidas por linha (2 036 e 2 693); a diferença de conjuntos contra a v4 de `HEAD` devolve exatamente as treze linhas esperadas e nenhuma outra, logo nenhuma passagem mudou sem ser declarada em quatro saltos de versão; e cada uma das quatro parcelas declaradas pelo autor bate ao byte com o `awk`. **A repartição declarada é, desta vez, a medida** — o defeito de método que a rodada 7 apanhou na v7 (2 115/1 096 em vez de 2 036/128/1 047) foi corrigido no ato seguinte, com o comando nomeado no texto.

**O LOW da rodada 7 foi absorvido na forma preferida daquele parecer.** Os três números saíram do fecho da entrada da v6; restam «TDD», «Suite» e «o Histórico da v3», cada um com o seu discriminante semântico. A ocorrência remanescente de 88/53/15 vive só na entrada da v8, que descreve o que apagou e desarma os tokens na frase seguinte — menção, não uso, pela mesma doutrina que as rodadas 6 e 7 aplicaram aos SHAs mortos e a `TESTS_SPEC.md:14`.

**As três decisões de julgamento do autor estão certas, e verifiquei cada uma.** (1) **Recusar repor 89/54/16 era a única saída que não reabre o achado**: as posições reais na v8 são **92/56/18**, de modo que a «Alternativa mínima» da rodada 7 teria gravado um trio errado numa terceira geração — apagar é o que o bullet 76 manda, e é o que ele fez. (2) **Corrigir a frase «números da v6» não foi escopo indevido**: era a segunda metade do mesmo L1, explicitamente pedida pela rodada 7, e a redação escolhida (um cross-ref para a entrada da v8) é melhor que a proposta, porque corrige sem reescrever o que a v7 fez. (3) **A omissão do próprio tamanho é honesta e bem justificada**: é um ponto fixo genuíno, a alternativa adotada remete a uma medição externa, e o número **é recuperável por subtração do que ele declarou** (42 635 − 40 661 − 25 + 13 = 1 962, que é o valor exato). A iteração que ele descreve deixou marca verificável: os quatro números declarados estão certos ao byte.

**A varredura sustenta-se.** A amostra exibida confere uma a uma, e a conclusão — nenhum outro número pede troca — é verdadeira. Registrei em «Sobre a varredura declarada» que a *caracterização* («os que restam já vêm colados ao nome») é larga demais, porque «a 56», «a linha 108» e «a linha 52» escapam-lhe; não a converto em achado porque os três são posições da versão descrita, que a linha 76 declara corretas por construção, e porque não há mudança concreta que melhore o arquivo — só risco de estragar texto correto.

**O que não devia mudar está intacto byte a byte** — «TDD» (256 B), «Suite» (658 B), Histórico da v3 (1 371 B), as quatro correções da v5 (304 / 699 / 384 / 296 B), «Commits e segredos › Regra da casa» (1 249 B) e o bullet «Citação posicional envelhece» (1 047 B), este último **aplicado e não editado**, que é o melhor destino possível para uma regra. Contrato íntegro: frontmatter na linha 1 com `version: 8` inteiro nu, `status: draft`, `owner: agents`, `title`/`purpose` entre aspas; zero ids; sete seções na ordem; 41,6 KiB ≪ 256 KiB. **A densidade continua a cair**: 2 679 → 2 060 → **1 961**, com cobertura auditável maior, não menor.

**Não encontrei defeito real, e digo-o sem cansaço e sem pressa.** Fui procurá-lo onde ele estaria: recalculei as posições na v8 em vez de aceitar o argumento da recusa; varri as oito entradas do Histórico com extrator próprio em vez de conferir só a amostra do autor; reconstruí a v7 e exigi que ela batesse em **duas** métricas independentes; conferi os sete SHAs e seis citações que ninguém tinha aberto; e testei eu mesmo a afirmação de código que motivou esta rodada. Os dois candidatos a LOW que sobraram estão nomeados acima com a razão de não os abrir — nenhum tem mudança concreta a propor, e inventar um terceiro para justificar uma rodada 9 seria o defeito que este arquivo me proíbe. **A v8 corrigiu o que a rodada 7 apontou, corrigiu-o pela via que o próprio arquivo prescreve, e o resto está correto.** Vai ao carimbo humano como está: `specs/AGENTS.md` v8, digest `7caf7dd4`, rodada 8, 0/0/0.
