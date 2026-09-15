# Uma Terra sustentada — partitura de quatro minutos

Cinco movimentos, 240 segundos. Trabalho computacional terceirizado e mediado
por plataformas é o único eixo desta demonstração. Todos os seis registros são
inventados. Os 144 fragmentos são derivações desses seis registros; não são
144 trabalhadores ou tarefas. Nenhuma companhia, território ou pessoa real
é representada. Os quatro termos de discurso não são citações atribuídas.

## Preparar

`npm ci`, `npm test`, `npm start`; abra http://127.0.0.1:3034 em tela cheia.
Aguarde a cortina e o aviso **DADOS SINTÉTICOS**. A tela começa em SPLIT,
na instrução 03/19. Pressione **P** imediatamente: suspenda apenas os ticks
automáticos; a imagem e suas transições continuam sendo desenhadas.
O tempo de palco é separado do tick. Não use Alt+Enter durante o ensaio
canônico. Se estiver no editor, **F2** devolve o foco ao Score.

O editor contém [labour-score.gaia](../examples/labour-score.gaia), a partitura
completa. O mundo começa apenas com [labour-smoke.gaia](../examples/labour-smoke.gaia).
Nada da futura perda ou memória foi executado escondido no início.

**←/→** navega sem executar; **Enter** aplica a instrução atual. Quando a
próxima instrução é `◉`, as duas compõem um bloco transacional: a operação
e a seleção estão literalmente na fonte, e o Score mostra esse `+ ◉`.
O programa comprometido executa em ordem de dependência da partitura.
O Score não inventa operações nem substitui operandos. Cada ação reexecuta
o programa válido no próximo tick, como a execução parcial do editor.

## Sequência exata

Os tempos abaixo incluem as ações, a espera da transição e a leitura da imagem.
Comece a próxima sequência no limite do movimento. Os números são os exibidos
no Score; as instruções `◉` anexadas aos blocos são puladas na navegação.

| Tempo | Teclas e fonte executada | Imagem esperada |
| --- | --- | --- |
| 0:00–0:40 / cortina | Na 03, **Enter**: `◉ [solo discurso]`. Permanecer. | Esfera escura contínua, termos especulativos esparsos; nenhum trabalho ainda relacionado. |
| 0:40–1:25 / situação e relação | **→ Enter** (04, `trabalho = ⊙ …` + `◉`); **→ → Enter** (06, `alvo = ⊙ …`); **→ Enter** (07, `terra = ⇄ blend [1 0] trabalho solo` + `◉`). | Seis inscrições de situações distintas aparecem junto à esfera. A relação passa a sustentar 144 fragmentos; a cortina ainda esconde sua estrutura. |
| 1:25–2:10 / abertura | **→ → Enter** (09, `abertura = ⋮ relate` + `◉`). **] ]** inspeciona fragmentos, sem avançar o tick. | O rastro real abre a pele contínua em retratos 3×4. ID, atividade, tempo, status, valor/moeda, regime e origem ficam visíveis. Uma inscrição selecionada pode ser lida em escala maior. |
| 2:10–3:20 / enquadramento e retirada | **→ → Enter** (11, `cortina = ⊘ … discurso` + `◉`); **→ → Enter** (13, `retrato fora corte = ⧉ 3:4 0.5 0.5 terra` + `◉`). Faça a edição abaixo e **Enter** de novo na 13. Depois **→ → Enter** (15, `perda = ⊘ … alvo` + `◉`). | O recorte inclui 108 derivações e desloca 36 para a margem. O centro altera quais registros ficam legíveis. A retirada de work-demo03 elimina seus 24 fragmentos, inclusive resíduos: 96 presentes dentro, 24 fora, 24 ausentes. Uma lacuna real interrompe a Terra. |
| 3:20–4:00 / memória | **→ → Enter** (17, `anterior = ⋮ frame`); **→ Enter** (18, `antes = ↶ 3 terra` + `◉` final). Ao terminar, **P**. | A superfície anterior à perda reaparece como 144 contornos espectrais junto aos 120 fragmentos atuais. Perda, corte anterior e resíduos coexistem. O mundo segue rodando e o testemunho permanece; nada é restaurado. |

### Edição do enquadramento, só pelo teclado

Na instrução 13: **F2**, **Ctrl+F**, digite `3:4 0.5 0.5`, **→**, **Enter**,
**Escape**, digite `3:4 0 0.5`, **F2**, **Enter**.
A busca seleciona o trecho executável; a digitação o substitui no CodeMirror.
A fonte exata passa a:

```gaia
retrato fora corte = ⧉ 3:4 0 0.5 terra
```

O recorte anterior continua em `World.traces` e nos snapshots. `⋮ frame`
acessa o último corte do tick anterior, e não o corte recém-criado nesta transação.
Para repetir com outro centro, substitua `3:4 0 0.5` por `3:4 1 0.5`;
isso acrescenta um tick e exige recalcular a distância antes da primeira memória.

### Tempo e memória

Depois da última edição do quadro, anote seu tick completo **C**. A perda
executa no tick C+1, `anterior` no C+2, e `antes` no C+3. Portanto `↶ 3`
captura exatamente C. Não execute separadamente os `◉` anexados aos blocos.
Se houver um tick extra entre perda e memória, a primeira distância deve ser
`tick_atual + 1 − C`. Edite esse número no CodeMirror antes de executar.

Para campos que contêm uma superfície de trabalho, essa memória é um
**testemunho situado persistente no runtime**: sua primeira consulta disponível
fixa o snapshot enquanto nome e distância permanecerem iguais. Reexecutar a
partitura ou deixar o relógio rodar preserva esse testemunho. Editar a distância
captura outro snapshot. Isso não é cache de geometria no renderer.
As memórias dos campos v0 continuam deslizando relativamente ao tick; seus
testes originais foram preservados. O comportamento distinto está documentado
na memória, no rastro e no registro dos glifos.

## Modos e inspeção

**1** SCORE (um bloco e glifo de 64px), **2** WORLD, **3** SPLIT.
**F2** alterna Score e fonte completa. **I** alterna o Canvas Inspector;
**Ctrl+Shift+I** funciona dentro do editor. **[ / ]** percorre fragmentos
por suas identidades reais; clique também permite seleção na cena 3D.
**T** lê JSON integral, incluindo o registro selecionado, derivação, snapshots
e perdas; **S** no leitor salva localmente; **Escape** fecha. Inspeção,
navegação e modos não alteram o World. **Alt+Enter** continua disponível
como tick manual fora do ensaio estrito.

## Recuperar uma revisão inválida

A revisão recusada não compromete campos, relações, suporte, perdas ou snapshots.
A última cena continua sendo desenhada; o relógio executa a última fonte válida.
Use **F2**, corrija o trecho indicado e **F2 Enter** na instrução afetada.
Se tiver substituído toda a fonte por um rascunho inválido, restaure a última
partitura válida (Ctrl+A e colar), volte com F2 e execute a instrução corrigida.
Não recarregue a página para tentar desfazer uma perda. Não crie novamente o
mesmo registro esperando ressuscitar seu suporte: a perda persiste no runtime.

## Fallback para apresentação

Ensaie no equipamento e projetor finais. Se WebGPU estiver indisponível,
WebGPURenderer seleciona WebGL 2 automaticamente. Pode-se escolher explicitamente
http://127.0.0.1:3034/?backend=webgl **antes** do início; é a mesma partitura,
o mesmo runtime e os mesmos estados materiais. Trocar a URL durante a peça
recarrega o mundo, portanto não é recuperação ao vivo.
Se ambos falharem, I mantém acesso técnico ao Inspector e T ao registro;
a grade não equivale ao resultado artístico. As capturas verificadas servem
como registro de ensaio, sem serem apresentadas como execução ao vivo.

## Ensaio automático e manual

`npm run verify:labour` percorre deterministicamente os mesmos operadores,
blocos, teclas de navegação e edição real do CodeMirror. O modo padrão comprime
as esperas de palco; não afirma ter apresentado quatro minutos em tempo real.
Em PowerShell, `$env:GAIA_REHEARSAL_REALTIME='1'; npm run verify:labour`
mantém os cinco intervalos do primeiro percurso por 240 segundos, incluindo
ações e capturas. Depois realiza verificações adicionais do fallback e da
perda sob a cortina. Remova a variável com `Remove-Item Env:GAIA_REHEARSAL_REALTIME`.

Ensaio manual conciso: abra, P, execute 03 → 04 → 06 → 07 → 09 → 11 → 13,
edite o centro e execute 13 novamente, execute 15 → 17 → 18, P. Confira uma
lacuna antes da memória e sua persistência depois de três ticks automáticos.
Confira I/T sem alterar o tick e o aviso sintético legível no projetor.

## Limites desta realização

A projeção é um chart ortográfico **relacional por ranking**, com posições
esféricas e ponto de vista explícitos. Ordena os fragmentos por y projetado
e por x dentro das linhas, preservando frente/verso sem colisões de células.
O quadro inteiro do runtime age nesse chart, não em pixels ou CSS. Não é
projeção cartográfica, localização real do trabalho ou distribuição planetária.
Os retratos são planos 3:4 curvos tangentes à esfera; a fase polida usa outra
representação geométrica dos mesmos suportes e também recebe lacunas por perda.
A configuração visual canônica usa 12×12 derivações; a capacidade maior do
schema de entrada não anuncia uma nova resolução visual implementada.

Não foram implementadas relações com empresas, guerra, mineração, energia ou
infraestrutura. Não há áudio, rede de notícias, estatísticas reais ou mapas
novos. A duração é uma partitura para performance; o instrumento não impõe
um cronômetro ao artista. O runtime mantém estado em RAM, com histórico crescente.
