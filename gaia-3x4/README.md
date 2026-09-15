# GA.IA/3x4

**Data-born Earth v0** é um único corte vertical: uma observação ambiental
pública entra na linguagem, atravessa o runtime transacional e constrói um
retrato territorial incompleto em proporção `3:4`.

A abertura padrão mostra CodeMirror 6 com cinco linhas executáveis e uma
moldura ainda sem dados. `RUN` executa a captura real offline da API regional
diária NASA POWER. Trocar `captured` por `live` consulta o mesmo endpoint no
navegador e identifica o resultado como `LIVE`. A fonte anterior, baseada em
dados sintéticos de trabalho, e o renderer Three.js/WebGPU continuam
preservados em [`legacy.html`](legacy.html).

## Executar

Requer Node.js 22.15 ou posterior.

```powershell
cd "C:\Users\italo\ga.ia-3x4\gaia-3x4"
npm ci
npm test
npm start
```

Abra `http://127.0.0.1:3034` e pressione **RUN**. O caminho offline não exige
conta, chave ou rede. Os comandos de verificação são:

```powershell
npm test
npm run verify:data-born
```

`npm run capture:power` renova deliberadamente a única captura. Ele faz uma
consulta real e sobrescreve somente os dois arquivos NASA POWER nomeados em
`data/`; não é executado por `npm test` nem pela demonstração offline.

## Programa inicial

[`examples/data-born-earth.gaia`](examples/data-born-earth.gaia) contém cinco
linhas executáveis:

```text
territorio_brasilia = source "NASA POWER / captured" "2025-01-15" "bbox -49,-17,-46.5,-14" "PRECTOTCORR mm/day" [4 7] nasa_power_brasilia
campo_precipitacao = relate blend [0.35 1] territorio_brasilia territorio_brasilia
retrato fora recorte = frame 3:4 0 0.5 campo_precipitacao
anterior = trace frame
observe [territorio_brasilia campo_precipitacao retrato fora recorte anterior]
```

`source` é apenas um alias textual adicional de `situate`/`⊙`. O registro
continua contendo exatamente os sete glifos `⊙ ⇄ ⧉ ↶ ⋮ ⊘ ◉`; nenhum operador
ou avaliador temático foi criado. `nasa_power_brasilia` é o único nome externo
autorizado para aquela transação.

Altere `0.35` ou o deslocamento inteiro `1` em `blend`, selecione a linha e use
Ctrl+Enter, ou pressione RUN. O mesmo objeto `World` e as mesmas identidades
compatíveis permanecem; `trace frame` passa a expor o recorte anterior. Para
remover o retrato, retire `#` da linha `ausencia = discard ...` já visível e
execute novamente. As doze células internas desaparecem; os dezesseis
fragmentos exteriores e o registro de perda permanecem.

## Uma fonte, um percurso

A resposta bruta legítima está em
[`data/nasa-power-brasilia-2025-01-15.raw.json`](data/nasa-power-brasilia-2025-01-15.raw.json).
O manifesto ao lado registra URL, horário de recuperação, status HTTP,
cabeçalhos, tamanho e SHA-256. A resposta declara `MERRA2`, `PRECTOTCORR`,
`mm/day`, UTC e `fill_value = -999`. O adaptador converte fill values e pontos
ausentes em `null` com razões distintas; não inventa estimativas.

O percurso inspecionável é:

```text
resposta bruta + manifesto
→ src/nasa-power.mjs
→ environmental-observation imutável
→ input externo da transação
→ SituatedField + provenance + sourceObservations
→ relate
→ frame (índices, normalização e exterior retido)
→ observe
→ surface/observation.mjs
→ surface/territory.mjs
```

O renderer não lê a resposta externa. Ele recebe somente a projeção já
comprometida pelo runtime. O valor normalizado controla luminância, quantidade
e altura dos traços; o índice de origem e as coordenadas retornadas controlam a
posição; `null` produz uma célula aberta; a partição `excluded` produz marcas
deslocadas; o frame anterior produz níveis tracejados; `discard` produz vazios
cruzados.

A janela `bbox -49,-17,-46.5,-14` é uma janela de observação declarada ao redor
de Brasília. Ela não é um limite administrativo, mapa municipal ou afirmação
de cobertura local precisa. A grade retornada tem `4 × 7` pontos, passos de
`0,625°` em longitude e `0,5°` em latitude. O frame seleciona `3 × 4` células
sem reamostrar.

Veja [`docs/data-born-earth.md`](docs/data-born-earth.md) para a seleção da
fonte, direitos, contrato do adaptador, mapeamento visual, limites e a partitura
de aproximadamente quatro minutos.

## Interface e compatibilidade

- **RUN** ou Ctrl+Shift+Enter executa a fonte visível.
- Ctrl+Enter executa a linha ou seleção contra o último programa válido.
- Alt+1…7 insere os sete glifos; a paleta, autocomplete e hover vêm do registro.
- **INSPECT PROVENANCE** mostra modo, fonte, variável, tempo, grade, URL e captura.
- `I`, fora do editor, abre a grade Canvas 2D anterior como Inspector.
- `T`, fora do editor, abre o registro completo.
- Um erro mantém mundo, observação, programa, fonte externa e imagem válidos.

O build padrão usa [`surface/data-app.mjs`](surface/data-app.mjs). A página
[`legacy.html`](legacy.html) carrega o instrumento anterior e o renderer
Three.js por [`dist/legacy-instrument.mjs`](dist/legacy-instrument.mjs). Nenhum
segundo provedor, conta, banco de dados, backend, GIS ou áudio foi adicionado.

## Evidência

`npm test` executa 57 testes: os 49 preservados e oito focados na NASA POWER,
normalização, atribuição, status live/captured, desconhecidos, fixture, alias,
persistência relacional, resíduo e rollback. `npm run verify:data-born` usa
Chrome real, faz também uma consulta live e grava:

- [`data-born-01-startup-blank.png`](artifacts/data-born-01-startup-blank.png)
- [`data-born-02-readable-editor.png`](artifacts/data-born-02-readable-editor.png)
- [`data-born-03-first-observation.png`](artifacts/data-born-03-first-observation.png)
- [`data-born-04-parameter-edit-trace.png`](artifacts/data-born-04-parameter-edit-trace.png)
- [`data-born-05-live-provenance.png`](artifacts/data-born-05-live-provenance.png)
- [`data-born-06-absence-residue.png`](artifacts/data-born-06-absence-residue.png)
- [`data-born-verification.json`](artifacts/data-born-verification.json)
