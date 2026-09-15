# Data-born Earth v0

## Decisão da fonte

A arquitetura existente já oferecia parser determinístico, um único registro
de glifos, `World` persistente, transações com rollback, `frame` com partição
real e uma projeção pura para renderers. O corte precisava, portanto, de uma
fonte pequena que produzisse um campo discreto e não de uma nova linguagem ou
de infraestrutura de dados.

Foram avaliadas três possibilidades antes da integração:

| Candidata | Acesso e direitos | Adequação ao corte | Decisão |
| --- | --- | --- | --- |
| NASA POWER Daily Regional API | API pública documentada, sem credencial no fluxo usado; dados NASA abertos, com reconhecimento e citação recomendados | Bounding box regional, JSON, uma variável por consulta regional, metadados de fonte/resolução/fill value, captura simples | selecionada |
| Open-Meteo Historical API | API documentada e CC BY 4.0; o free tier tem condições próprias | Resposta normalizada por coordenadas múltiplas e cadeia de atribuição mais ampla; menos direta para um único campo regional nativo | não integrada |
| INMET/BDMEP | Relevância institucional alta para Brasília | Nesta avaliação não foi encontrado um contrato público de API e redistribuição tão explícito e estável quanto o necessário para captura reproduzível deste corte | não integrada |

Referências oficiais usadas na decisão:

- NASA POWER Daily API: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- NASA POWER API overview: https://power.larc.nasa.gov/docs/services/api/
- NASA Earthdata Data Use and Citation Guidance: https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy
- Open-Meteo Historical Weather API: https://open-meteo.com/en/docs/historical-weather-api
- Open-Meteo pricing/licence: https://open-meteo.com/en/pricing

Somente NASA POWER possui adaptador ou é consultada pelo projeto.

## Consulta e captura

A consulta usa o endpoint regional diário, comunidade agroclimatológica, uma
única variável e UTC:

```text
https://power.larc.nasa.gov/api/temporal/daily/regional
  ?latitude-min=-17&latitude-max=-14
  &longitude-min=-49&longitude-max=-46.5
  &parameters=PRECTOTCORR&community=AG
  &start=20250115&end=20250115
  &format=JSON&time-standard=UTC
```

Em 2026-09-15 a consulta de captura respondeu HTTP 200. A resposta bruta é
guardada sem reformatação. O manifesto registra `retrievedAt`, URL original,
status, cabeçalhos relevantes, número de bytes e SHA-256. A captura informa:

- produto: `NASA/POWER Source Native Resolution Daily Data`;
- API: `POWER Daily API v2.9.7` no momento da captura;
- fonte reportada: `MERRA2`;
- variável: `PRECTOTCORR — Precipitation Corrected`;
- unidade: `mm/day`;
- tempo: `20250115`, UTC;
- fill value: `-999`;
- 28 pontos com valores entre `2,39` e `35,82`.

O modo `captured` lê esses dois arquivos locais. O modo `live` consulta a URL
produzida pelos mesmos parâmetros. Ambos atravessam exatamente a mesma função
de normalização. `captured-real` significa resposta real preservada, não dados
simulados. A interface e a proveniência nunca chamam uma captura de live.

O conteúdo NASA ESDIS é, em geral, não protegido por copyright nos Estados
Unidos; a orientação Earthdata declara CC0 para dados de missão NASA sem
restrição marcada e solicita fortemente a citação dos dados. GA.IA reconhece
NASA POWER, conserva as fontes reportadas pela própria resposta e liga a URL de
direitos. Esse reconhecimento não sugere endosso da NASA.

## Limite e normalização

`src/nasa-power.mjs` é um adaptador específico, pequeno. Ele aceita somente:

- o endpoint regional diário NASA POWER;
- `PRECTOTCORR`;
- a janela declarada em torno de Brasília;
- uma data ISO;
- forma declarada igual à forma realmente retornada.

As longitudes e latitudes são deduplicadas e ordenadas a partir das feições
retornadas. O produto cartesiano dessas coordenadas define a matriz. Um ponto
ausente recebe `null` com `status: missing`; `-999` recebe `null` com
`status: unknown`. Um valor ausente ou não numérico também vira `unknown`.
Nenhum deles é interpolado. Elevações só são conservadas quando numéricas na
resposta. Passos espaciais são diferenças calculadas entre coordenadas
adjacentes, não resolução inventada.

A janela é uma caixa de observação, não o Distrito Federal. Não há limites
administrativos, geocodificação, camadas cartográficas, sensores adicionais ou
segunda fonte.

## Linguagem e proveniência

O parser recebeu apenas a possibilidade de validar nomes externos fornecidos
por uma execução. Eles não são globais e continuam falhando como `E_UNKNOWN`
quando o host não os autoriza. `source` foi adicionado ao registro como alias
de `situate`; `⊙` e `situate` permanecem equivalentes.

O adaptador produz um `environmental-observation` imutável. A transação confere
fonte declarada, data, janela, variável e forma antes de aceitar seus valores.
No commit, o campo guarda a observação e uma proveniência com URL original,
tempo observado, tempo recuperado, status live/captured, atribuição, fonte
reportada e variável. `World.sourceObservations` torna a entrada inspecionável.
Falhas anteriores ao commit não alteram esse mapa nem qualquer outro estado.

`relate blend` propaga `null` como desconhecido. `frame` normaliza somente
valores conhecidos; seu rastro registra mínimo, máximo, contagem conhecida e
contagem ausente. Se todos forem desconhecidos, o resultado permanece aberto,
sem inventar uma constante.

## Mapeamento visual

`surface/territory.mjs` recebe `portraitObservation`, que por sua vez lê somente
a observação e os rastros do runtime.

| Estado do runtime | Consequência visual |
| --- | --- |
| tick 0, sem frame | quatro cantos incompletos; nenhuma célula |
| valor conhecido incluído | placa cuja luminância, quantidade e altura de hastes vêm do valor normalizado; valor bruto e coordenada retornada ficam inscritos |
| valor `null` incluído | placa aberta com marca `?` |
| índice `excluded` | fragmento espectral deslocado para a margem, sem renormalização |
| `trace frame` disponível | nível anterior tracejado dentro da célula correspondente |
| campo incluído descartado | placa removida e cruz no vazio; exterior continua presente |

As cores são monocromáticas e não codificam categorias ambientais. Não há
ruído, partículas, contorno geográfico, ícone climático ou leitura independente
do JSON pelo renderer.

## Partitura — aproximadamente quatro minutos

### 0:00–0:35 — lançamento

Abra a raiz. Deixe visíveis a moldura incompleta, as cinco linhas e `T 0000`.
Leia apenas: “um território declarado; uma fonte; uma variável; um quadro; um
rastro”. Não use atalhos de modo.

### 0:35–1:20 — a captura entra

Pressione **RUN**. A captura real local produz doze placas internas e dezesseis
fragmentos exteriores. Abra **INSPECT PROVENANCE** e mostre `CAPTURED-REAL`,
NASA POWER, MERRA2, PRECTOTCORR, UTC, URL, horário e SHA-256. Feche a leitura.

### 1:20–2:15 — relação ao vivo

Na linha `relate`, troque `[0.35 1]` por `[0.72 2]`. Selecione a linha e use
Ctrl+Enter. As placas mudam, o tick avança, a identidade do mundo permanece e
os níveis anteriores aparecem tracejados. Paire o cursor sobre `relate` ou `⇄`
para mostrar a mesma documentação do registro.

### 2:15–3:05 — consulta live

Troque `NASA POWER / captured` por `NASA POWER / live` e pressione RUN. A
interface mostra `QUERYING` e depois `LIVE`; a proveniência ganha outro horário
de recuperação e não contém caminho de fixture. Se a rede falhar, a revisão é
recusada e o estado capturado anterior continua visível.

### 3:05–3:50 — ausência com registro

Retire o `#` da linha já preparada `ausencia = discard ...` e pressione RUN.
As doze placas saem. As cruzes, o frame tracejado, os fragmentos exteriores e
`trace:… / 12 REMOVED VALUES` permanecem. Abra `T` somente se houver tempo para
mostrar a razão textual e a proveniência conservada.

### 3:50–4:10 — rollback opcional

Troque temporariamente `3:4` por `99:1` e execute. O diagnóstico aparece na
linha; tick, programa comprometido, observação e imagem de ausência continuam
iguais. Restaure o rascunho sem executar.

## Verificação e limites

`npm test` cobre adaptador, hash da captura, normalização, atribuição,
live/captured, desconhecidos, execução offline, aliases, edição relacional,
remoção e rollback, além da suíte preservada. `npm run verify:data-born` testa
o gesto completo em Chrome, incluindo consulta real live, CodeMirror visível,
mesmo objeto `World`, Inspector e seis screenshots.

Limites atuais: a captura representa um dia e uma variável; POWER é uma fonte
modelada/reanalisada e reporta MERRA2; a caixa excede Brasília e não é um limite
político; o renderer é 2D e discreto; o estado vive apenas na sessão; a consulta
live depende da rede e da disponibilidade do serviço. Nenhuma afirmação local
de chuva observada em solo deve ser inferida desta microperformance.

