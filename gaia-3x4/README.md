# GA.IA/3x4

**Continuous World v0** transforma o retrato situado em um processo persistente. Depois de `RUN`, um relógio lógico de passo fixo mantém relações, emergência, enquadramento, memória e retirada em atividade no mesmo `World`; uma edição compatível perturba o processo existente e uma edição inválida deixa o último processo válido vivo.

**Novo na linguagem?** Comece por [Aprender GA.IA/3x4](docs/learn-gaia.md) e use o [índice completo da documentação](docs/README.md). O guia cobre instalação, sintaxe, os sete operadores, tempo, edição ao vivo, diagnósticos, proveniência, API e exercícios.

A precipitação NASA POWER permanece no programa. `relate` liga o campo ambiental aos registros iNaturalist como **situated computational approximation**, sempre marcada `causal: false`. O programa não usa o campo contra ele mesmo e não afirma causalidade biológica.

## Executar

Requer Node.js 22.15 ou posterior.

```powershell
cd "C:\Users\italo\ga.ia-3x4\gaia-3x4"
npm ci
npm test
npm run verify:docs
npm start
```

Abra `http://127.0.0.1:3034`. A apresentação padrão é integralmente offline: a resposta iNaturalist, as quatro fotos e a captura NASA POWER estão locais e são verificadas por SHA-256 antes da transação.

```powershell
npm run verify:living
npm run verify:continuous
npm run verify:data-born
npm run verify:browser
npm run verify:performance
npm run verify:labour
```

`npm run capture:living` e `npm run capture:power` consultam a rede e renovam deliberadamente as capturas. Eles não fazem parte da inicialização, dos testes unitários ou da apresentação offline.

## Programa performável atual

[`examples/proof-continuous.gaia`](examples/proof-continuous.gaia) contém sete declarações executáveis e é carregado pela superfície principal. [`examples/living-portraits.gaia`](examples/living-portraits.gaia) permanece preservado como programa canônico da milestone anterior.

```text
chuva = situate "NASA POWER / captured" "2025-01-15" "bbox -49,-17,-46.5,-14" "PRECTOTCORR mm/day" [4 7] nasa_power_brasilia
organismos = situate "iNaturalist / captured" "per-record observed dates" "bbox -49,-17,-46.5,-14" "selected iNaturalist observation records" [4 7] inaturalist_brasilia
aproximacao = relate blend [0.32 0] chuva organismos
retrato fora recorte = frame 3:4 0.5 0.5 aproximacao
memoria = remember 1 retrato
anterior = trace frame
observe [chuva organismos aproximacao retrato fora recorte memoria anterior]
```

Uma oitava declaração comentada ativa `discard` durante a performance. O vocabulário continua limitado aos sete glifos `⊙ ⇄ ⧉ ↶ ⋮ ⊘ ◉`. `TEXTUAL` e `GLYPHIC` alternam apenas a representação dos operadores; as duas vistas usam os mesmos IDs do registro, parser, transação e consequência visual.

## Interface

- `PLAY` ou `Espaço` retoma o tempo lógico; `PAUSE` ou `Espaço` congela; `STEP` ou `.` avança exatamente 0,125 s.
- `RUN` ou `Ctrl+Shift+Enter` executa toda a partitura.
- `Ctrl+Enter` aplica a linha ou bloco selecionado na mesma transação do programa.
- `Alt+1…7` insere operações pela paleta; autocomplete, hover, atalho, documentação, aridade e implementação vêm de [`src/registry.mjs`](src/registry.mjs).
- A linha selecionada descreve em português o que recebe, transforma, conserva e exclui.
- `L`, `D` e `I` alternam `LIVING PORTRAIT`, `DATA` e `INSPECTOR`.
- `F` alterna tela cheia; `T` abre o registro completo.
- `P` ativa o modo de apresentação para gravação.
- Uma edição inválida conserva o último mundo, a última observação e o último retrato válidos.

## Fontes e modos preservados

A nova fonte é exclusivamente o iNaturalist. A resposta bruta, o manifesto, os JPEGs e os créditos ficam separados em [`data/inaturalist`](data/inaturalist/ATTRIBUTION.md). São quatro observações `CAPTURED-REAL`, duas plantas e dois insetos, todas com atribuição explícita e foto CC BY 4.0.

NASA POWER continua em [`src/nasa-power.mjs`](src/nasa-power.mjs) e em sua captura regional. `DATA` reutiliza [`surface/territory.mjs`](surface/territory.mjs); `INSPECTOR` reutiliza [`surface/render.mjs`](surface/render.mjs). A versão verificada `data-born Earth v0` continua executável em [`data.html`](data.html), e a microperformance Three.js anterior permanece em [`legacy.html`](legacy.html).

O modelo temporal, os quatro enquadramentos determinísticos, a recuperação após perda e a partitura de gravação de 82 segundos estão em [`docs/continuous-world.md`](docs/continuous-world.md). O roteiro anterior continua em [`docs/living-portraits.md`](docs/living-portraits.md), e a documentação de dados em [`docs/data-born-earth.md`](docs/data-born-earth.md).

## Evidência

`npm run verify:continuous` prova em navegador real que o mundo segue após o performer parar, congela em pausa, avança um tick, interpola uma edição, desloca o frame, alcança as quatro observações, preserva a perda e continua após um rascunho inválido. Ele também verifica execução offline, resize, atalhos, reload e zero erros de console. As capturas `continuous-01-empty.png` a `continuous-09-presentation.png` e `continuous-verification.json` ficam em [`artifacts`](artifacts).

`npm run verify:living` usa um navegador real, percorre os sete glifos do CodeMirror até a consequência visual, testa hashes/licenças/atribuição, troca de enquadramento, memória, ausência, rollback, execução offline, modos e console. Ele grava:

- [`living-01-before.png`](artifacts/living-01-before.png)
- [`living-02-first-organism.png`](artifacts/living-02-first-organism.png)
- [`living-03-outside.png`](artifacts/living-03-outside.png)
- [`living-04-trace.png`](artifacts/living-04-trace.png)
- [`living-05-absence.png`](artifacts/living-05-absence.png)
- [`living-microperformance.gif`](artifacts/living-microperformance.gif) — percurso condensado pelos cinco estados.
- [`living-verification.json`](artifacts/living-verification.json)

As capturas `data-born`, `labour` e `microperformance` continuam no mesmo diretório para comparação e regressão visual.
