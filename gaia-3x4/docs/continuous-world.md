# GA.IA/3x4 — Continuous World v0

## Diagnóstico e hipótese comprovada

Antes desta milestone, cada `apply` ou `step` recalculava as relações, o Canvas recebia uma observação discreta e `requestAnimationFrame` não alterava o mundo. `remember` consultava snapshots, `trace` consultava rastros transacionais e `observe` decidia quais nomes chegavam à projeção. `SituatedField`, `Relation` e `World` já tinham identidade suficiente para receber estado temporal sem mudar parser, gramática ou registro.

Agora uma execução válida instala `relation:aproximacao` no mesmo `World`. Enquanto o relógio está em `running`, um acumulador converte tempo de parede em passos fixos de 0,125 s. A cada passo, o runtime reavalia o programa válido, avança fase, interpolação e transições, cria um snapshot e publica somente os nomes de `observe`. O Canvas apenas desenha esses valores. Se o performer não digitar, o mundo continua trabalhando.

## Três tempos diferentes

| Camada | Responsabilidade |
| --- | --- |
| Tick lógico | Passo determinístico de 0,125 s. É a única origem do avanço semântico. |
| Frame visual | `requestAnimationFrame` mede o intervalo decorrido, pede passos inteiros ao runtime e desenha a observação resultante. FPS irregular não muda a quantidade lógica de passos para a mesma duração acumulada. |
| Transação | Uma execução de código é atômica e cria uma revisão. Uma edição inválida não muda tick, campos, relações, snapshots, rastros nem o programa válido. O relógio pode continuar usando o programa anterior. |

`PAUSE` interrompe a conversão de tempo de parede, sem perder o acumulador nem o mundo. `STEP` mantém o relógio pausado e executa exatamente um tick. `PLAY` retoma o mesmo processo. `stopped` é o estado inicial e também está disponível na API do `Interpreter`.

## Semântica temporal implementada

| Operador | Estado temporal observável |
| --- | --- |
| `⊙ situate` | Uma nova origem começa `emerging`, progride por 12 ticks e termina `present`. A fase mora no campo e controla a entrada visual. |
| `⇄ relate` | A relação situada tem ID estável, fase cíclica de 6 s, amplitude derivada dos valores capturados de precipitação, parâmetros atual/alvo e interpolação de 2 s. A inscrição mantém `causal: false`. |
| `⧉ frame` | O alvo da partição é transacional; âncora e geometria visuais percorrem 1,5 s. O runtime guarda início, alvo, posição corrente e até 24 pontos do percurso. Interior e exterior continuam cobrindo as 28 células. |
| `↶ remember` | Um snapshot anterior permanece como testemunho separado e respira em ciclo lógico de 4 s, sem substituir o presente. |
| `⋮ trace` | A vista conserva a origem semântica e uma janela de até 256 ticks lógicos reais, além do tick corrente e da última revisão material. |
| `⊘ discard` | A perda é registrada no primeiro instante. O retrato passa por `withdrawing` durante 12 ticks e termina `absent-record`; valor atual fica ausente desde a declaração, enquanto exterior, memória, créditos e rastro permanecem. |
| `◉ observe` | Projeção pura: seleciona nomes sem avançar relógio ou mutar o mundo. Uma foto calculada e não observada não entra no renderer. |

O playback da aproximação situada reutiliza os IDs dos eventos instalados. Assim, ticks comuns não criam cópias redundantes de `relate`, `frame`, `remember` e `trace`; trajetórias ficam em janelas limitadas. Snapshots continuam sendo preservados por tick e são um limite conhecido para sessões muito longas.

## Programa de prova

[`examples/proof-continuous.gaia`](../examples/proof-continuous.gaia) tem sete declarações executáveis:

```gaia
chuva = situate "NASA POWER / captured" "2025-01-15" "bbox -49,-17,-46.5,-14" "PRECTOTCORR mm/day" [4 7] nasa_power_brasilia
organismos = situate "iNaturalist / captured" "per-record observed dates" "bbox -49,-17,-46.5,-14" "selected iNaturalist observation records" [4 7] inaturalist_brasilia
aproximacao = relate blend [0.32 0] chuva organismos
retrato fora recorte = frame 3:4 0.5 0.5 aproximacao
memoria = remember 1 retrato
anterior = trace frame
observe [chuva organismos aproximacao retrato fora recorte memoria anterior]
```

A declaração `ausencia = discard …` permanece comentada entre `trace` e `observe` até o ato de retirada.

## Como alcançar as quatro observações

O segundo parâmetro de `blend` é um deslocamento inteiro e também resolve empates por uma ordem estável: distância ao centro, índice de célula e ID da observação. Não existe escolha aleatória.

| Organismo esperado | `relate blend` | `frame` |
| --- | --- | --- |
| *Cybistax antisyphilitica* | `[0.32 0]` | `3:4 0.5 0.5` |
| *Pterandra pyroidea* | `[0.32 0]` | `3:4 0.5 0` |
| *Aegopsis bolboceridus* | `[0.32 1]` | `3:4 0.5 0` |
| *Callicore sorana* | `[0.32 0]` | `3:4 0 0` |

Ao mudar o deslocamento, aguarde a interpolação de 2 s. O nome, ID iNaturalist, autoria e licença aparecem no rodapé do retrato.

## Controles

- `PLAY` ou `Espaço`: inicia ou retoma o relógio.
- `PAUSE` ou `Espaço`: congela tempo lógico e imagem.
- `STEP` ou `.`: avança um tick de 0,125 s enquanto permanece pausado.
- `Ctrl+Enter`: executa a linha ou seleção atual.
- `Ctrl+Shift+Enter`: executa as sete linhas.
- `P`: modo de apresentação; mantém mundo, editor, glifos, créditos e a inscrição não causal.
- `L`, `D`, `I`: `LIVING PORTRAIT`, `DATA` e `INSPECTOR`.
- `F`: tela cheia. `T`: registro integral.

Os atalhos simples são ignorados quando o CodeMirror tem foco. Os atalhos explícitos com modificadores continuam pertencendo ao editor.

## Partitura de gravação — 82 segundos

Recarregue `/` antes da tomada. O mundo estará vazio, as linhas estarão carregadas e o relógio mostrará `STOPPED`. Ative `P` se quiser retirar cabeçalho, rodapé e painéis administrativos; editor, mundo e créditos continuam visíveis.

| Tempo | Ação exata | Espera / organismo | Consequência e fala opcional |
| --- | --- | --- | --- |
| 0–6 s | Nenhuma | Mundo vazio | “A partitura está presente; o mundo ainda não foi instalado.” |
| 6 s | `Ctrl+Shift+Enter` | 12 s; *Cybistax* | O organismo emerge em 1,5 s; chuva modula exposição; fase e memória continuam trabalhando. Retire as mãos. “Agora o código continua sem mim.” |
| 18 s | `Espaço` | 4 s | Tick, LT e imagem congelam. “Pausa preserva o processo.” |
| 22 s | `.` uma vez | 3 s | Um único tick de 0,125 s. |
| 25 s | `Espaço` | 3 s | Retoma o mesmo mundo. |
| 28 s | Na linha `relate`, troque `0.32` por `0.75`; `Ctrl+Enter` | 5 s; *Cybistax* | Força percorre 2 s até o alvo, sem trocar IDs ou reconstruir fontes. |
| 33 s | Na linha `frame`, troque o último `0.5` por `0`; `Ctrl+Enter` | 6 s; *Pterandra* | Enquadramento percorre 1,5 s; fragmentos cruzam a borda e o retrato anterior permanece como fantasma. |
| 39 s | Na linha `relate`, troque o deslocamento final `0` por `1`; `Ctrl+Enter` | 6 s; *Aegopsis* | O empate resolve para o besouro após a interpolação, de modo determinístico. |
| 45 s | Linha `memoria`; `Ctrl+Enter`. Depois linha `anterior`; `Ctrl+Enter` | 7 s | `↶` sustenta a presença anterior e `⋮` expõe origem, ticks e revisão. |
| 52 s | Retire `# ` da linha `ausencia`; `Ctrl+Enter` | 7 s | A imagem se desfaz em 12 bandas durante 1,5 s. Crédito, exterior e fantasma permanecem. “Ausência também deixa registro.” |
| 59 s | Troque temporariamente `frame 3:4` por `frame 99:1`; `Ctrl+Shift+Enter` | 8 s | O diagnóstico aparece, mas o último processo válido continua. |
| 67 s | `Ctrl+Z`; `Ctrl+Shift+Enter` | 7 s | Limpa o rascunho inválido sem apagar a perda já registrada. |
| 74 s | `T`, observe o registro; `Esc` | 5 s | Mostra procedência, perda e tempos. |
| 79 s | `Espaço` | 3 s | Congela o estado final em `PAUSED`. |

Se uma tecla for executada na linha errada, pressione `Ctrl+Z`, posicione o cursor na declaração desejada e use `Ctrl+Enter`. O mundo válido não precisa ser recarregado. Se o relógio parecer parado, tire o foco do editor e pressione `Espaço`, ou clique em `PLAY`.

## Recuperar um novo presente depois da perda

Comentar `discard` não ressuscita `retrato`: isso apagaria retrospectivamente o fato material. Declare um novo resultado de `frame` com nomes novos e observe esse resultado, por exemplo:

```gaia
retrato_novo fora_novo recorte_novo = frame 3:4 0.5 0.5 aproximacao
memoria_nova = remember 1 retrato_novo
observe [chuva organismos aproximacao retrato_novo fora_novo recorte_novo memoria memoria_nova anterior]
```

O novo presente recebe novas identidades; o `lossId`, os snapshots e a memória do retrato anterior permanecem.

## Verificação

```powershell
npm test
npm run verify:continuous
npm run verify:living
npm run verify:data-born
npm run verify:browser
npm run verify:performance
npm run verify:labour
```

`verify:continuous` testa o relógio, a continuidade autônoma, interpolação, rollback durante movimento, enquadramento, os quatro organismos, retirada, atalhos, modos, apresentação, resize, recursos locais, reload e console. O relatório é `artifacts/continuous-verification.json`; as nove imagens `artifacts/continuous-01-empty.png` a `continuous-09-presentation.png` registram os momentos principais.

## Limites desta vertical slice

- O renderer principal continua Canvas 2D; não há Three.js, WebGPU, shader, áudio, backend, plugin, IA generativa ou dataset novo.
- A relação situada interpola `blend`; relações genéricas preservam a semântica imediata anterior por compatibilidade.
- A identidade fotográfica alvo é resolvida na transação, enquanto recorte, fragmentos e rastro geométrico fazem o percurso de 1,5 s.
- O histórico visual e os ticks mostrados por `trace` têm janelas limitadas; snapshots transacionais ainda crescem durante sessões longas.
- A precipitação controla somente uma modulação computacional declarada. A obra não mede resposta biológica e não afirma causalidade.
