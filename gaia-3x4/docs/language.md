# Gramática v0, escrita antes do interpretador

```ebnf
program     = { statement, newline } ;
statement   = [ names, "=" ], expression ;
names       = name, { name } ;
expression  = term, { term } ;
term        = operation | name | number | string | ratio | vector ;
vector      = "[", { number | string | name | vector }, "]" ;
ratio       = positive_integer, ":", positive_integer ;
name        = letter_or_underscore, { letter_or_digit_or_underscore } ;
comment     = "#", { character_except_newline } ;
```

Vetores podem atravessar linhas. Strings usam aspas duplas; escapes permitidos:
`\"`, `\\`, `\n`, `\t`. Não há avaliação de JavaScript. Os sete glifos são
aliases de IDs ASCII. `blend` e `transfer` são configurações de `relate`,
não operações adicionais. `frame` como argumento de `trace` é um ID, não uma
invocação. Essa posição é resolvida pela aridade, deterministicamente.

As linhas executam de cima para baixo. Em cada expressão, a pilha recebe
termos da direita para a esquerda. Uma operação retira argumentos na ordem
em que aparecem à sua direita. O primeiro resultado fica no topo: os nomes
à esquerda de `=` recebem resultados da esquerda para a direita. A pilha
deve terminar com exatamente a quantidade de nomes declarada. Somente
`observe` admite uma linha sem atribuição.

## Efeitos de pilha

Notação: argumentos e resultados aparecem na ordem textual, topo à esquerda.

```text
situate   : source time scale domain shape values → field
relate    : transformation parameters right left → field
remember  : ticks field → memory
frame     : ratio anchor_x anchor_y field → included excluded framing_trace
discard   : reason field → loss
trace     : operation_id → historical_trace
observe   : [names…] → observation (fora do estado do mundo)
```

`relate blend [weight column_shift] b a` combina `a` com `b` deslocado
horizontalmente: `(1 − weight) × a[x,y] + weight × b[(x+shift) mod w,y]`.
O deslocamento é inteiro e toroidal; cada correspondência e peso fica no
rastro. `relate transfer [] b a` transfere o valor de `b` ao alvo, preservando
`a` como relação de destino e ambas as proveniências. As duas formas exigem
domínios, escalas e formas compatíveis; `blend` exige números.

`frame 3:4 0.5 0.5 field` escolhe o maior retângulo de células inteiras de
proporção exata 3:4. Âncoras variam de 0 a 1. O interior é normalizado pelo
mínimo e máximo selecionados; o exterior conserva coordenadas e valores
originais, com `null` nas posições incluídas. Não há reamostragem. Dados
constantes viram zero, com uma consequência explícita no rastro.

## Tempo e revisão

O mundo começa em tick 0. Uma revisão válida ou um passo avança exatamente
um tick. `remember n field` consulta o snapshot de `tick − n`; `n ≥ 1`.
Uma memória ausente é um resultado marcado como indisponível e deixa um
rastro. Não existe fallback silencioso para o presente. `trace frame`
consulta o último recorte anterior ao tick atual. A primeira consulta
também pode ser explicitamente indisponível.

Os nomes vinculam identidades estáveis. Reexecutar `situate` sem alteração
preserva o estado, inclusive um descarte. Alterar valores de uma fonte ativa
gera um rastro; alterar forma, domínio, origem, tempo ou escala do mesmo nome
é incompatível e exige um novo nome. Relações retêm identidade, revisões e
consequências. Remover uma declaração aposenta seu vínculo/campo/relação e
registra a omissão; não apaga seu passado.

Referências instantâneas cíclicas são rejeitadas antes da execução. Arestas
sob `remember` cruzam uma fronteira temporal e não são arestas instantâneas.
Memória ausente pode ser observada, mas não alimenta uma relação numérica.
Toda revisão é transacional: erro de sintaxe, tipo ou compatibilidade deixa
o último mundo e programa válidos intactos. `observe` retorna uma projeção
imutável; o renderizador não executa operações nem modifica o mundo.

Esses metadados descrevem operações computacionais. Não constituem uma
representação total de território.

## Milestone de microperformance

A gramática e os sete IDs acima continuam iguais. O registro único em
`src/registry.mjs` fornece alias, nome, aridade, assinatura, atalho,
documentação e implementação, delegando aos métodos transacionais existentes.
Rastros também identificam a linha/coluna da operação; um relatório imutável
de execução liga operações, nomes de saída e consequências depois do commit.

No CodeMirror, Ctrl+Enter aplica declarações selecionadas ao programa válido,
conservando comentários e formatação não selecionados. Dependências executam
no próximo tick, como na revisão completa. Texto inválido em outro rascunho
não entra na execução parcial. Ctrl+Shift+Enter aplica a fonte inteira.
Omissões só ocorrem quando a revisão completa realmente omite declarações.

As regras visuais da esfera são observações documentadas no registro JSON.
Não são novos operadores ou datasets. A grade Canvas 2D continua como Inspector.
Ver [a partitura de quatro minutos](microperformance.md).

## Superfície sustentada por trabalho

Extensão aditiva, com os mesmos sete IDs e aridades. O domínio explícito
`superficie-trabalho` aceita IDs simbólicos da entrada validada gaia.labour/1.
`⊙` conserva registros, evidência, proveniência e derivação no campo situado.
Valores materiais constantes não simulam produtividade ou valor humano.
`⇄` produz a correspondência causal registro → fragmento → Terra, posições
esféricas e um chart ortográfico relacional ordenado no runtime. `⧉` age
nesse campo e devolve IDs incluídos/excluídos, registros, projection, viewpoint,
tick/revision e o rastro com superfície retida.

`⊘` de um campo de registros remove seu valor atual e marca como descartados
todos os fragmentos apoiados nesses recordIds, em cada superfície e partição.
O ledger persistente de perdas participa das relações seguintes: reexecutar
o programa não reativa suportes descartados. Rastros e snapshots conservam
proveniência, derivação e o estado anterior para inspeção.

Uma memória de superfície de trabalho conserva o primeiro snapshot disponível
como testemunho situado no runtime enquanto nome e distância permanecem iguais.
Editar a distância captura outro testemunho. O modo e o tick de captura constam
do rastro e da memória. Campos v0 sem surface mantêm a semântica original de
distância relativa a cada tick; todos os testes antigos permanecem compatíveis.
O renderer não faz consultas temporais próprias nem conserva um estado inventado.

Um `trace-view` real de relate, selecionado por `◉`, abre a pele da Terra.
O renderer usa apenas estados, suportes e identidades já comprometidos.
Na fase polida e na fase de retratos, os mesmos suportes produzem lacunas
quando perdidos. Observar continua puro; executar o programa ainda avança
o tick e suas demais operações, sem atribuir essas mutações ao próprio observe.

Score é uma apresentação de ASTs reais, com patches de fonte, CodeMirror e
o mesmo Interpreter. Uma operação seguida imediatamente por `◉` pode ser
executada como bloco literal da partitura. Não há comandos semânticos novos.
Ver [dados e privacidade](labour-data.md) e [partitura principal](labour-performance.md).
