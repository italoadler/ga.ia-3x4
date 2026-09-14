# Uma identificação que não fecha — 4 minutos

Partitura executável de GA.IA/3x4. Usa somente os 144 valores de
[canonical.gaia](../examples/canonical.gaia), os campos existentes e os sete
glifos. Não requer áudio, textura cartográfica ou dados externos. A Terra
sintética emerge da observação esférica.

## Preparação

Execute `npm ci`, `npm start`; abra http://127.0.0.1:3034. Use tela cheia,
preferencialmente 1680×1080. Aguarde a cena. Fora do editor, pressione **P**
para suspender o relógio e **Alt+Enter** para formar uma memória anterior.
A performance usa ticks manuais: tempo de apresentação e tick não são
equivalentes. Não recarregue a aba durante a peça.

**Ctrl+Enter** aplica a linha lógica sob o cursor ou as declarações tocadas
pela seleção. Um vetor de várias linhas é uma declaração inteira.
**Ctrl+Shift+Enter** aplica toda a partitura. No macOS, use Cmd para Ctrl.
A execução parcial modifica só as declarações escolhidas no programa válido;
depois o programa e suas consequências executam no próximo tick. Outros
rascunhos permanecem pendentes no editor.

**Alt+1…7** insere `⊙ ⇄ ⧉ ↶ ⋮ ⊘ ◉`, na mesma ordem da paleta.
**Ctrl+Espaço** abre autocomplete; Enter aceita. Hover expõe nome, assinatura,
aridade, atalho e documentação. **Esc** sai da escrita; **I** alterna o
Inspector; **T** lê os rastros; **S**, no leitor, exporta JSON.

## Partitura

| Tempo | Gesto e fonte | Consequência e atenção |
| --- | --- | --- |
| 0:00–0:35 | Execute as linhas A/B de `⊙`, uma por vez, conservando todos os argumentos canônicos. Pause sobre cada glifo para ler a assinatura. | Dois campos, mesmos números, duas proveniências. Os arcos são testemunhas de identidade, não fronteiras territoriais. Observe sem mover a câmera. |
| 0:35–1:10 | Troque por `vinculo = ⇄ blend [0.75 3] b a` e execute essa linha. | A superfície muda. O deslocamento pertence à correspondência da relação. Mundo, fontes e cena conservam identidade. Sustente a imagem depois do destaque. |
| 1:10–1:55 | Execute `retrato fora corte = ⧉ 3:4 0 0.5 vinculo`; depois a mesma linha com âncora horizontal `0.5`, depois `1`. Sustente quinze segundos cada posição. | Continuam 108 células dentro e 36 fora, mas sua composição muda. Os setores excluídos se deslocam e permanecem espectrais. O recorte anterior continua retido. A grade oferece quatro posições horizontais discretas. |
| 1:55–2:30 | Troque por `antes = ↶ 2 retrato` e execute. | O fantasma corresponde ao campo real de dois ticks antes. Sua máscara e seus valores vêm do snapshot. O relevo espectral se destaca enquanto a linha fica marcada. |
| 2:30–2:55 | Escreva `anterior = ⋮ ⧉`, usando autocomplete de `tr` para inserir `⋮`, e execute. | O segundo ⧉ é o ID consultado, não outro frame. Malha tênue e contorno recuado testemunham o rastro anterior. T permite ler índices e parâmetros; Esc volta à cena. |
| 2:55–3:30 | Antes de ◉, acrescente `ausencia = ⊘ "retirada do retrato" retrato` e execute essa nova linha. | As 108 superfícies atuais deixam de desenhar. Os 36 fragmentos externos continuam; memória e rastro conservam o passado selecionado. O slot vazio referencia a perda real. A perda inicial de amostra pertence a arquivo/C e nunca abre um buraco fictício na esfera. |
| 3:30–4:00 | Substitua a última linha por `◉ [fora corte anterior a b]` e execute. Aos 3:45, abra T e deixe o registro da retirada legível até o fim. | A observação deixa de selecionar remember; seu fantasma desaparece. Exterior e malha retida por trace permanecem. A ausência atual não se resolve. Encerrar não restaura a figura. |

Não apague ausencia para voltar à figura inicial: essa seria outra revisão,
com aposentadoria explícita do vínculo e novo recorte, não um undo do mundo.
Undo/redo do CodeMirror altera o rascunho; nunca desfaz o mundo já executado.

Para três minutos, reduza as sustentações mantendo todos os gestos e sua ordem.
Para cinco minutos, prolongue os três recortes e a ausência final. Os atos
não avançam automaticamente: duração e ticks pertencem a quem performa.

## Ensaio do erro

Introduza `retrato = ⧉` e aplique a fonte inteira. O editor mostra E_ARITY,
enquanto o último mundo válido permanece. Esc e P retomam o programa válido.
Restaure a fonte e aplique; não recarregue a aba. Também ensaie um bloco válido
com um rascunho inválido em outra linha: Ctrl+Enter aplica apenas esse bloco.

## Implementado e verificado

Registro único para parser, intérprete, atalhos, paleta, autocomplete e hover.
O runtime e seus 26 testes foram preservados; foram acrescentados o despacho
pelo registro e um relatório imutável de localização/consequências após commit.
Nove testes novos cobrem execução parcial, compatibilidade, projeção e relatório.

Three.js WebGPURenderer e TSL são o renderer principal. A esfera retém identidade
e cada célula ocupa um setor geométrico com tesselação 16×16. Interior e exterior
usam exatamente os índices produzidos pelo runtime. O renderer não calcula
enquadramento, normalização, descarte ou acesso temporal. A janela 3:4 é
geometria da cena, acompanhada da divisão efetiva das superfícies.

O destaque percorre operações **depois do commit**, com ID, tick e rastros da
mesma transação. Uma linha enfatiza seu gesto; toda a fonte percorre a ordem
real de avaliação. A marcação só é confirmada pelo frame desenhado do renderer.
O Inspector mantém Canvas 2D, inclusive após um descarte, sem alterar o mundo.

[Relatório ponta a ponta](../artifacts/performance-verification.json):
atalhos, paleta, autocomplete, hover com ponteiro, cada glifo até um frame
desenhado, identidades preservadas, centro, memória, ausência, rascunho inválido,
Inspector e fallback WebGL 2. Sem exceções ou erros de shader.

## Limites presentes

É uma Terra sintética detalhada, sem reconstrução cartográfica. O ruído e sua
função de transferência pertencem à codificação visual documentada no JSON,
sem constituir dataset ou operação adicional. Latitude/longitude pertence à
grade conceitual, sem identificar populações ou lugares reais. A câmera é
situada e não oferece orbit controls.

O Chrome headless deste ambiente não forneceu adaptador WebGPU core,
compatibility ou fallback. A execução real usou WebGL 2, inclusive fallback
automático. Execução nativa WGSL/WebGPU não foi verificada aqui.
WebGPURenderer tenta WebGPU em um navegador com adaptador disponível.
Desempenho de projeção no hardware da apresentação exige ensaio local.

Sessão e rastros ficam em memória crescente. Há uma memória e um rastro
visualizados por vez; T expõe todo o registro. Recarregar começa outro mundo.
Não há persistência/reimportação, áudio ou novas primitivas temáticas.
