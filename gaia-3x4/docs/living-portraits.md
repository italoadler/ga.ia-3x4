# GA.IA/3x4 — Living Portraits v0

## O que esta fatia prova

`LIVING PORTRAIT` transforma uma observação fotográfica real em retrato computacional situado sem tratar a imagem como textura genérica. O caminho executado é:

```text
campo de precipitação NASA POWER
→ registros de organismos observados no iNaturalist
→ aproximação computacional situada, sem alegação causal
→ recorte inteiro 3×4
→ partes externas espectrais
→ edição ao vivo
→ estado anterior fantasma
→ ausência declarada com registro preservado
```

A abertura permanece vazia até uma execução válida. A foto nunca aparece inteira silenciosamente: o renderer aplica um recorte interno 3×4 e desenha quatro regiões excluídas, extraídas dos mesmos bytes, nas margens. `discard` retira o valor atual do retrato, mas a fonte, os créditos, os hashes, os rastros e os fragmentos externos continuam acessíveis.

## Fonte externa escolhida

A única nova fonte é a API pública v1 do [iNaturalist](https://api.inaturalist.org/v1/docs/). Ela foi escolhida porque devolve IDs estáveis de observação e foto, taxon, observador, data, localidade pública, URL original, atribuição e licença por imagem. A avaliação geográfica usou a mesma janela regional da captura NASA POWER, `bbox -49,-17,-46.5,-14`, e filtrou candidatos de grau de pesquisa com fotos `CC0` ou `CC BY`.

A seleção final usa uma única consulta explícita por quatro IDs. O script rejeita antes da escrita qualquer mudança em ID da foto, categoria, grau de pesquisa, licença ou atribuição. Fotos sem licença reutilizável, “all rights reserved”, licenças com restrições adicionais e créditos vazios ficam fora. Não houve necessidade de combinar APIs.

Arquivos preservados separadamente:

- resposta bruta: `data/inaturalist/observations.raw.json`;
- manifesto da captura: `data/inaturalist/capture.json`;
- créditos legíveis: `data/inaturalist/ATTRIBUTION.md`;
- quatro JPEGs: `data/inaturalist/media/`;
- captura reproduzível e defensiva: `npm run capture:living`.

O comando de captura consulta a rede. A apresentação comum não consulta a rede e verifica localmente o SHA-256 da resposta e de cada JPEG antes de criar a observação do runtime.

## Observações selecionadas

| ID estável | Táxon | Grupo | Local e data observada | Observador / autor da foto | Licença | SHA-256 local |
| --- | --- | --- | --- | --- | --- | --- |
| `inaturalist:observation:399498913` | *Aegopsis bolboceridus* | Insecta | Cidade Ocidental, GO — 2026-09-12 | Mario Barroso | CC BY 4.0 | `605d205e136bfcdd83734b83e918efecb8d9a622a32b2af7dfb644d9e3a3a3f2` |
| `inaturalist:observation:397768311` | *Pterandra pyroidea* | Plantae | Cidade Ocidental, GO — 2026-09-06 | Mario Barroso | CC BY 4.0 | `55cd6cf63d6fb46ca2387cfc1c38c036d6da489599b52a00e72e1792563462cc` |
| `inaturalist:observation:393600054` | *Cybistax antisyphilitica* | Plantae | Brasília, DF — 2026-08-22 | André Ambrozio | CC BY 4.0 | `7959232220a518ce1f38df0667afed9c5d80c8ff49063d59633a2b1cbe4811b5` |
| `inaturalist:observation:388807360` | *Callicore sorana* | Insecta | Pirenópolis, GO — 2026-08-06 | Libris Simas Ferraz | CC BY 4.0 | `862b0d2d47b62a82da614d863ea27c25a7f908c4a00f410d0a8a3f2d9ecf8c83` |

O `observedOn` é a data da observação e da evidência fotográfica declarada no registro. `image.captureDate` e `capturedAt` são a data em que o projeto capturou os arquivos. Cada registro de runtime também traz `platform`, `institution`, URL da observação, URL da mídia, autoria, licença, caminho local, hash e estado `CAPTURED-REAL`.

## Relação com NASA POWER

O programa não relaciona o campo consigo mesmo. `chuva` tem domínio `PRECTOTCORR mm/day`; `organismos` tem domínio `selected iNaturalist observation records`. Ambos partilham apenas a janela e a forma regional 4×7 necessárias para o enquadramento. Cada registro iNaturalist é associado ao ponto NASA POWER mais próximo; uma célula conhecida contém a contagem dos quatro registros selecionados que caíram nela. As demais células são `null`, com a declaração explícita de que isso não significa ausência do organismo.

`relate blend [0.32 0] chuva organismos` produz um controle visual de exposição e contraste apenas onde há registro selecionado. Não é uma variável científica, correlação ecológica ou mecanismo causal. O rastro de `relate` registra:

```json
{
  "kind": "situated-computational-approximation",
  "causal": false,
  "semantics": ["observed-organism-records", "environmental-precipitation-field"]
}
```

## Programa canônico

```gaia
chuva = situate "NASA POWER / captured" "2025-01-15" "bbox -49,-17,-46.5,-14" "PRECTOTCORR mm/day" [4 7] nasa_power_brasilia
organismos = situate "iNaturalist / captured" "per-record observed dates" "bbox -49,-17,-46.5,-14" "selected iNaturalist observation records" [4 7] inaturalist_brasilia
aproximacao = relate blend [0.32 0] chuva organismos
retrato fora recorte = frame 3:4 0.5 0.5 aproximacao
memoria = remember 1 retrato
anterior = trace frame
observe [chuva organismos aproximacao retrato fora recorte memoria anterior]
```

São sete declarações executáveis. A linha comentada de `discard` vira a oitava quando a ausência é performada. A vista `TEXTUAL` usa somente nomes textuais; `GLYPHIC` converte todas as operações para `⊙ ⇄ ⧉ ↶ ⋮ ⊘ ◉`. Strings e comentários não mudam, e o parser normaliza ambas para os mesmos sete IDs semânticos.

Consequência de cada declaração:

1. `chuva = situate …` anexa a precipitação e habilita suas marcas lineares sobre a imagem.
2. `organismos = situate …` anexa quatro observações verificadas e revela foto e procedência.
3. `aproximacao = relate …` liga entidades semanticamente diferentes e altera exposição/contraste; o rastro diz que não há causalidade.
4. `retrato fora recorte = frame …` cria o interior 3×4, quatro resíduos marginais e um rastro de interior/exterior.
5. `memoria = remember …` fornece o recorte anterior usado como fantasma deslocado.
6. `anterior = trace frame` torna legível o ID e os limites do enquadramento anterior.
7. `observe […]` escolhe a projeção final sem mutar o mundo.
8. Quando ativada, `ausencia = discard …` abre o interior, mantém resíduos e conserva a perda, a fonte e os créditos.

## Microperformance ensaiável — aproximadamente 90 segundos

As linhas abaixo contam o comentário inicial do arquivo `examples/living-portraits.gaia`.

| Tempo | Tecla e linha | Alteração | Consequência esperada |
| --- | --- | --- | --- |
| 0–8 s | Abra `/`; nenhuma tecla de execução | Nenhuma | Moldura 3×4 incompleta, sem imagem nem dado inventado. |
| 8–20 s | Cursor na linha 3; `Ctrl+Enter` | Nenhuma | `⊙` executado: *Cybistax antisyphilitica* entra como observação `CAPTURED-REAL`; autoria, licença e ID aparecem subordinados. Dependências da partitura são recomputadas na mesma transação. |
| 20–30 s | Cursor na linha 4; `Ctrl+Enter` | Nenhuma | `⇄` executado: chuva aparece como testemunhos lineares e muda exposição/contraste; a tela nomeia a aproximação e nega causalidade. |
| 30–41 s | Cursor na linha 5; `Ctrl+Enter` | Nenhuma | `⧉` executado: a borda 3×4 e quatro partes excluídas ficam mais fortes nas margens. |
| 41–54 s | Linha 5; troque o último `0.5` por `0`; `Ctrl+Enter` | `frame 3:4 0.5 0.5` → `frame 3:4 0.5 0` | O centro sobe, *Pterandra pyroidea* entra no retrato e o recorte anterior de *Cybistax* permanece como fantasma. |
| 54–66 s | Linha 6; troque `remember 1` por `remember 2`; `Ctrl+Enter` | Distância `1` → `2` | `↶` recupera explicitamente o estado pré-edição e intensifica o fantasma sem restaurá-lo como presente. |
| 66–79 s | Linha 8; apague apenas `# `; `Ctrl+Enter` | Ativa `ausencia = discard …` | `⊘` retira o retrato atual: o interior abre e recebe um X descontínuo; fragmentos, fantasma, observação, crédito e perda permanecem. |
| 79–90 s | Cursor na linha 9; `Ctrl+Enter` | Nenhuma | `◉` escolhe o estado final ausente. A linha executada, o glifo, o canvas e o registro integral concordam. |

`Ctrl+Shift+Enter` executa a partitura inteira. `L`, `D` e `I` alternam `LIVING PORTRAIT`, `DATA` e `INSPECTOR`; `F` entra ou sai da tela cheia; `T` abre o registro integral.

## Partitura expandida — 3 a 5 minutos

Para uma apresentação mais lenta, use a mesma sequência em cerca de 3min20s: sustente a abertura por 20s; execute as duas fontes separadamente em 35s; permaneça 30s em `⇄`; mostre o exterior de `⧉` por 35s; faça a edição do centro em 30s; altere `remember` e abra o registro `T` por 30s; declare `⊘` em 25s; feche com `◉` e 15s de silêncio visual. Abra `DATA` por 20s antes do recorte e `INSPECTOR` por 15s depois dele para provar que as placas e a grade continuam disponíveis sem assumir o papel artístico principal.

## Modos preservados

- `LIVING PORTRAIT` é a abertura e o resultado artístico principal.
- `DATA` reutiliza o renderer territorial de células e placas na mesma página e no mesmo mundo.
- `INSPECTOR` reutiliza a grade Canvas 2D e o histórico de frames.
- `/data.html` conserva a experiência `data-born Earth v0` e sua partitura original, permitindo executar novamente `npm run verify:data-born` sem adaptar o resultado anterior.
- `/legacy.html` continua preservando a microperformance 3D anterior.

## Validação e capturas

`npm run verify:living` percorre os sete glifos desde uma seleção real no CodeMirror até a marca de consequência no canvas, testa as vistas textual/glífica, troca de organismo após edição, memória, ausência, rollback, hashes, créditos, execução offline, coexistência de modos e erros de console. O relatório fica em `artifacts/living-verification.json`.

Capturas de apresentação:

1. `artifacts/living-01-before.png` — abertura incompleta;
2. `artifacts/living-02-first-organism.png` — primeiro organismo e procedência;
3. `artifacts/living-03-outside.png` — interior e resíduos externos;
4. `artifacts/living-04-trace.png` — novo retrato com estado anterior fantasma;
5. `artifacts/living-05-absence.png` — ausência declarada, registro retido.

`artifacts/living-microperformance.gif` encadeia os cinco estados como prévia curta; a partitura acima continua sendo a referência precisa para a execução ao vivo.

Comparada às capturas `data-born`, a nova cena oferece escala corporal e leitura imediata do que o enquadramento aceita e deixa fora. Ela perde parte da visão sinóptica do campo regional: a geografia e os 28 valores são mais legíveis em `DATA` e `INSPECTOR`. Os resíduos espectrais ainda dependem do contraste da foto, e a coleção de quatro registros demonstra o mecanismo, não diversidade temporal ou inferência ecológica.
