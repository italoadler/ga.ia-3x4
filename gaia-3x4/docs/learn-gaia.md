# Aprender GA.IA/3x4

Este guia ensina a linguagem pela superfície principal e explica o modelo suficiente para escrever, executar, depurar e apresentar uma partitura. Ele usa o programa real [`examples/proof-continuous.gaia`](../examples/proof-continuous.gaia), as capturas locais NASA POWER e quatro observações licenciadas do iNaturalist.

## 1. Iniciar em cinco minutos

Requisitos: Node.js 22.15 ou posterior e um Chrome, Edge ou Chromium para as verificações visuais.

```powershell
cd "C:\Users\italo\ga.ia-3x4\gaia-3x4"
npm ci
npm test
npm start
```

Abra `http://127.0.0.1:3034`. O editor já contém oito linhas: sete declarações executáveis e uma declaração de perda comentada. O mundo começa em `STOPPED`, tick 0 e tempo lógico 0.

Pressione `Ctrl+Shift+Enter`. A execução válida cria o primeiro tick transacional, instala a relação e inicia o relógio. Em seguida:

1. deixe o mundo trabalhar por alguns segundos;
2. pressione `Espaço` para pausar;
3. pressione `.` uma vez para avançar um tick;
4. pressione `Espaço` para retomar;
5. altere `0.32` para `0.75` na linha de `relate` e use `Ctrl+Enter`;
6. observe o valor atual aproximar-se do alvo durante dois segundos.

Esse percurso demonstra a regra central: executar código instala ou perturba processos; o renderer apenas mostra o estado produzido pelo runtime.

## 2. Ler a primeira partitura

O programa carregado é:

```gaia
chuva = situate "NASA POWER / captured" "2025-01-15" "bbox -49,-17,-46.5,-14" "PRECTOTCORR mm/day" [4 7] nasa_power_brasilia
organismos = situate "iNaturalist / captured" "per-record observed dates" "bbox -49,-17,-46.5,-14" "selected iNaturalist observation records" [4 7] inaturalist_brasilia
aproximacao = relate blend [0.32 0] chuva organismos
retrato fora recorte = frame 3:4 0.5 0.5 aproximacao
memoria = remember 1 retrato
anterior = trace frame
# ausencia = discard "retrato retirado; observação e crédito permanecem" retrato
observe [chuva organismos aproximacao retrato fora recorte memoria anterior]
```

Cada nome à esquerda recebe uma identidade produzida à direita. `frame` produz três resultados, por isso declara três nomes. `observe` é a única operação sem atribuição: ela escolhe a projeção pública do mundo.

O fluxo é:

```text
fontes situadas
→ relação persistente
→ interior + exterior + rastro do enquadramento
→ memória e leitura histórica
→ seleção explícita para a superfície
```

## 3. Sintaxe essencial

### Nomes

Um nome começa com letra Unicode ou `_` e pode continuar com letras, números ou `_`:

```gaia
campo
campo_2
retrato_novo
```

Cada nome pode ser declarado apenas uma vez no mesmo programa. Operações e aliases são palavras reservadas.

### Números, proporções, strings e vetores

```gaia
0.32
-1.5
2e3
3:4
"texto com \"aspas\""
[0.32 1]
[1 2 [3 4]]
```

Proporções exigem inteiros positivos. Strings terminam na mesma linha e admitem `\"`, `\\`, `\n` e `\t`. Vetores podem atravessar linhas, mas não executam operações dentro deles.

### Comentários

`#` ignora o restante da linha. A performance mantém `discard` comentado para que a perda seja uma decisão explícita do performer.

### Ordem

Declarações executam de cima para baixo. Uma referência precisa ter sido declarada e executada antes de ser usada. Argumentos de uma operação aparecem imediatamente depois dela:

```gaia
mistura = relate blend [0.25 1] campo_b campo_a
```

Aqui `campo_a` é a base esquerda e `campo_b` é o campo direito deslocado. Escrever uma operação por linha torna a partitura mais legível, embora a gramática permita composição aninhada quando cada operação interna produz uma única saída.

## 4. Os sete operadores

### `⊙ situate` — criar um campo situado

Assinatura:

```text
source time scale domain shape values → field
```

Exemplo sintético:

```gaia
campo = situate "ensaio" "t0" "célula" "grade" [2 2] [1 2 3 4]
```

Forma e valores devem concordar: `[2 2]` exige quatro valores. Origem, tempo, escala, domínio e proveniência fazem parte da identidade semântica. Valores iguais com proveniências diferentes continuam sendo campos diferentes.

Na superfície contínua, uma fonte recém-instalada passa por `emerging` e chega a `present` em 12 ticks. `source` e `⊙` são aliases da mesma operação.

### `⇄ relate` — instalar uma relação

Assinatura:

```text
transformation parameters right left → field
```

`blend` usa `[peso deslocamento]`:

```gaia
mistura = relate blend [0.25 1] campo_b campo_a
```

Para cada célula, o resultado é `(1 − peso) × campo_a + peso × campo_b_deslocado`. O peso fica entre 0 e 1; o deslocamento é um inteiro horizontal e toroidal. `transfer []` transfere os valores do campo direito preservando as duas proveniências.

Forma e escala precisam ser compatíveis. Domínios também precisam coincidir, exceto na aproximação situada explicitamente marcada entre precipitação e observações de organismos. Essa exceção conserva `causal: false` e não representa inferência ecológica.

Na prova contínua, editar parâmetros compatíveis preserva `relation:aproximacao` e interpola durante dois segundos.

### `⧉ frame` — dividir interior e exterior

Assinatura:

```text
ratio anchor_x anchor_y field → included excluded trace
```

```gaia
retrato fora recorte = frame 3:4 0.5 0.5 mistura
```

As âncoras variam de 0 a 1. O runtime escolhe o maior retângulo inteiro com a proporção solicitada, sem reamostrar. O interior é normalizado; o exterior mantém posição e valor, usando `null` nas células internas. Interior mais exterior conservam a partição da origem.

Editar centro ou proporção instala uma trajetória de 1,5 s com início, alvo, geometria corrente e rastro espacial limitado.

### `↶ remember` — atravessar uma fronteira temporal

Assinatura:

```text
ticks field → memory
```

```gaia
memoria = remember 1 retrato
```

A distância deve ser um inteiro maior ou igual a 1. A memória consulta um snapshot real e nunca usa silenciosamente o presente. Ela pode estar indisponível no primeiro tick. Quando observada, permanece separada do presente e não o restaura.

### `⋮ trace` — ler o passado de uma operação

Assinatura:

```text
operation_id → historical_trace
```

```gaia
anterior = trace frame
```

O argumento é um ID ou alias de operação, e não uma nova invocação. A vista histórica informa identidade, origem, última revisão material, tick corrente e uma janela de ticks lógicos.

### `⊘ discard` — declarar uma perda

Assinatura:

```text
reason field → loss
```

```gaia
ausencia = discard "retrato retirado; observação e crédito permanecem" retrato
```

A perda é registrada desde o início. O valor presente é removido, a retirada visual progride por 12 ticks e termina como `absent-record`. Procedência, crédito, exterior, memória, snapshots e `lossId` permanecem.

Comentar `discard` depois de executá-lo não ressuscita a identidade. Para criar outro presente, declare saídas novas:

```gaia
retrato_novo fora_novo recorte_novo = frame 3:4 0.5 0.5 aproximacao
observe [retrato_novo fora_novo recorte_novo memoria anterior]
```

### `◉ observe` — publicar uma projeção

Assinatura:

```text
[names…] → observation
```

```gaia
observe [chuva organismos retrato fora memoria]
```

`observe` não altera campos, relações, tempo ou rastros. Um campo calculado e não observado continua no mundo, mas não aparece na projeção.

## 5. Tempo, tick e revisão

GA.IA/3x4 separa três eventos:

- **revisão:** código válido é aplicado atomicamente;
- **tick do mundo:** uma transação ou passo válido cria um novo snapshot;
- **tick temporal:** um passo fixo de 0,125 s avança o tempo lógico.

O navegador mede tempo de parede e o converte em passos inteiros por um acumulador. O renderer não incrementa fases por conta própria. Assim, duas sequências de frames com intervalos diferentes produzem o mesmo mundo quando acumulam a mesma duração.

Estados do relógio:

- `stopped`: estado inicial, sem programa temporal em andamento;
- `running`: tempo de parede pode gerar ticks fixos;
- `paused`: mundo e imagem permanecem congelados;
- `STEP`: executa um tick temporal e continua pausado.

## 6. Transações e edição ao vivo

Uma revisão só entra no mundo se todas as declarações passarem por parser, tipos, compatibilidade e execução. Em caso de erro, `World`, programa válido, observação, snapshots e rastros permanecem como estavam.

| Edição | Resultado |
| --- | --- |
| Peso ou deslocamento de `blend` | Compatível; preserva relação e interpola na prova situada. |
| Âncora ou proporção de `frame` | Compatível; preserva campos e cria percurso. |
| Valores de uma fonte com mesma situação | Compatível; registra antes/depois. |
| Origem, tempo, escala, domínio ou forma de um nome existente | Incompatível; use um nome novo. |
| Reutilizar um campo descartado | Recusado; use um nome novo. |
| Sintaxe ou aridade inválida | Rollback completo; último processo válido pode continuar. |
| Remover uma declaração | Aposenta o vínculo e registra `program-omission`. |

`Ctrl+Enter` aplica a linha ou seleção ao programa válido. Texto inválido fora da seleção não entra nesse patch. `Ctrl+Shift+Enter` aplica o documento inteiro e pode aposentar declarações omitidas.

## 7. Editor e performance

O CodeMirror oferece:

- paleta com os sete glifos;
- `Alt+1` a `Alt+7` para inserção;
- autocomplete de aliases e nomes declarados;
- hover com assinatura, documentação e aridade;
- diagnóstico com código, linha e coluna;
- destaque da operação executada e consequência sincronizada;
- `Ctrl+Enter` para linha/seleção;
- `Ctrl+Shift+Enter` para o programa inteiro;
- `Escape` para tirar o foco do editor.

Atalhos globais simples não disparam enquanto o editor tem foco. Fora dele, `Espaço`, `.`, `P`, `L`, `D`, `I`, `F` e `T` controlam tempo e apresentação.

Modos visuais:

- `LIVING PORTRAIT`: resultado artístico principal;
- `DATA`: campo territorial derivado da mesma observação;
- `INSPECTOR`: grade Canvas 2D e histórico técnico;
- `PRESENT`: mantém mundo, editor, controles temporais, glifos e créditos, removendo painéis administrativos.

## 8. Proveniência e leitura responsável

Um campo situado transporta origem, tempo observado, tempo de captura, escala, domínio, forma, fonte original e histórico. Os registros iNaturalist acrescentam observação, táxon, observador, localidade pública, foto, autoria, licença, URL e SHA-256 local.

Na relação entre chuva e organismos:

- precipitação e observações continuam semanticamente distintas;
- `null` significa valor desconhecido, não ausência biológica;
- a modulação visual é comportamento computacional;
- `causal: false` permanece em runtime, relatório e interface;
- não existe alegação de que precipitação causou presença, forma ou movimento do organismo.

## 9. Diagnósticos frequentes

| Código | Causa comum | Correção |
| --- | --- | --- |
| `E_EMPTY` | Documento sem declarações | Carregue ou escreva um programa. |
| `E_UNKNOWN` | Nome usado sem declaração | Declare-o antes ou confira a grafia. |
| `E_ORDER` | Linha depende de nome ainda não executado | Mova a declaração para cima ou execute o bloco correto. |
| `E_ARITY` / `E_STACK` | Faltam argumentos ou nomes de saída | Consulte a assinatura no hover. |
| `E_VECTOR` | `[` sem `]` ou operação dentro do vetor | Feche o vetor e deixe operações fora dele. |
| `E_PARAMETERS` | Peso, deslocamento ou configuração inválida | Use `blend [peso inteiro]` ou `transfer []`. |
| `E_RELATION_SCHEMA` | Forma, escala ou domínio incompatível | Corrija as situações ou declare uma conversão rastreável em outra etapa. |
| `E_FRAME_EMPTY` | Proporção não cabe na forma | Use uma proporção compatível, como `3:4`. |
| `E_MEMORY_UNAVAILABLE` | Snapshot solicitado ainda não existe | Avance ticks ou aumente a história antes de consumir a memória. |
| `E_DISCARDED` | Campo perdido usado como presente | Declare um novo resultado com outro nome. |
| `E_CAUSAL_CYCLE` | Dependência instantânea circular | Introduza uma fronteira real com `remember`. |

Quando houver erro, leia o código no painel, corrija somente a linha indicada e execute-a com `Ctrl+Enter`. Não recarregue a página antes de inspecionar o último mundo válido.

## 10. API do runtime

Um programa sem adapters externos pode ser executado diretamente em JavaScript:

```js
import { Interpreter } from './src/runtime.mjs';

const source = `
a = situate "A" "t0" "cell" "grid" [2 2] [1 2 3 4]
b = situate "B" "t0" "cell" "grid" [2 2] [4 3 2 1]
x = relate blend [0.25 1] b a
observe [a b x]
`;

const gaia = new Interpreter({ fixedTimestep: 0.125 });
const installed = gaia.apply(source);
gaia.pause();
gaia.step();
gaia.play();
gaia.advance(1);
console.log(installed.ok, gaia.world.inspect());
```

Para NASA POWER e iNaturalist, o chamador fornece os nomes externos e as observações validadas, como faz [`surface/living-app.mjs`](../surface/living-app.mjs). O parser nunca consulta a rede.

## 11. Exercícios

1. Pause e use `STEP` oito vezes. Confirme que LT cresce exatamente 1 segundo.
2. Troque o peso de `0.32` para `0.75`; acompanhe `current` e `target` no painel.
3. Alcance os quatro organismos usando a tabela em [Continuous World](continuous-world.md#como-alcançar-as-quatro-observações).
4. Mude `frame 3:4 0.5 0.5` para `frame 1:1 0.5 0.5` e observe largura, interior e exterior.
5. Remova `memoria` apenas de `observe`; confirme que o fantasma some sem apagar o binding.
6. Introduza `frame 99:1`, observe o rollback e corrija sem recarregar.
7. Execute `discard`, comente a linha e confirme que a perda permanece.
8. Crie `retrato_novo`, observe-o e compare seus IDs com os do retrato perdido.
9. Alterne `L`, `D` e `I` enquanto pausado e confirme que LT não muda.
10. Abra `T` e encontre `relation:aproximacao`, `lossId`, revisões e ticks.

## 12. Vocabulário

- **Campo situado:** valores mais forma, domínio, escala, tempo, origem, proveniência e história.
- **Relação:** processo identificado que liga campos e produz consequências rastreáveis.
- **Binding:** nome do programa ligado a um valor, campo, memória, rastro ou perda.
- **Revisão:** aplicação atômica de uma fonte válida.
- **Snapshot:** cópia histórica dos campos e bindings de um tick.
- **Rastro:** registro imutável de operação e consequência.
- **Projeção:** seleção imutável publicada por `observe`.
- **Perda:** evento que remove o valor atual sem remover sua história.
- **Tempo lógico:** duração computacional avançada somente por passos fixos.
- **Tempo de parede:** duração medida pelo navegador e acumulada antes de virar ticks.

## Próximos passos

- Para ensaiar uma gravação, siga a [partitura de 82 segundos](continuous-world.md#partitura-de-gravação--82-segundos).
- Para detalhes da gramática, leia [Gramática v0](language.md).
- Para auditar dados e licenças, leia [Living Portraits](living-portraits.md#observações-selecionadas).
- Para entender as decisões visuais anteriores, consulte [Microperformance 3D](microperformance.md).
