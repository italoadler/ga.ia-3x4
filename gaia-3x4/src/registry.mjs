// The parser, interpreter, editor, palette and documentation consume this single registry.
// Implementations delegate to the preserved transaction methods: there is no second evaluator.
const entries = [
  ['situate', '⊙', 'Situar', 6, 1, 'source time scale domain shape values → field',
    'Anexa origem, tempo, escala e domínio. Em superficie-trabalho, IDs simbólicos resolvem registros autorizados com evidência, regime e proveniência. Valores iguais não tornam situações intercambiáveis.', 'situate',
    'Recebe fonte, tempo, escala, domínio, forma e valores; transforma-os em campo situado; conserva a proveniência; não exclui nada.'],
  ['relate', '⇄', 'Relacionar', 4, 1, 'transformation parameters right left → field',
    'Edita uma relação persistente. blend [peso deslocamento] combina campos; transfer [] transfere valores. Trabalho relacionado sustenta fragmentos identificáveis; correspondência e derivação ficam no rastro.', 'relate',
    'Recebe dois campos e parâmetros; transforma correspondências em um campo relacionado; conserva as duas origens; exclui apenas valores desconhecidos da combinação.'],
  ['frame', '⧉', 'Enquadrar', 4, 3, 'ratio anchor_x anchor_y field → included excluded trace',
    'Divide células em interior e exterior vinculados. Superfícies de trabalho devolvem IDs de fragmentos, registros, ponto de vista e projeção. O interior normaliza; o exterior permanece. 3:4 não é CSS.', 'frame',
    'Recebe proporção, centro e campo; transforma-o em interior, exterior e rastro; conserva ambos; exclui da moldura sem apagar do mundo.'],
  ['remember', '↶', 'Lembrar', 2, 1, 'ticks field → memory',
    'Consulta um snapshot real a pelo menos um tick. Em superfície de trabalho, captura um testemunho persistente; editar a distância captura outro. Memórias v0 continuam relativas ao tick. O fantasma não restaura o presente.', 'remember',
    'Recebe distância e campo; transforma um snapshot anterior em memória; conserva o estado histórico; exclui a restauração automática do presente.'],
  ['trace', '⋮', 'Ler rastros', 1, 1, 'operation_id → historical_trace',
    'Acessa o último rastro anterior ao tick atual. Um rastro observado de relate abre a superfície para expor os registros que a sustentam. frame ou ⧉ acessa o recorte anterior.', 'history',
    'Recebe uma operação; transforma seu histórico em leitura; conserva IDs e consequências; não altera nem exclui o mundo.'],
  ['discard', '⊘', 'Descartar', 2, 1, 'reason field → loss',
    'Remove o valor atual, mantendo origem e razão. Descartar um registro de trabalho remove todos os fragmentos que ele sustenta, inclusive sob a cortina. Reexecutar a fonte não ressuscita o valor ou o suporte.', 'discard',
    'Recebe razão e campo; transforma a retirada em perda visível; conserva origem, razão e registro; exclui o valor atual.'],
  ['observe', '◉', 'Observar', 1, 0, '[names…] → observation',
    'Seleciona uma projeção imutável do mundo. Mudar a observação não muda valores, relações nem rastros.', 'observe',
    'Recebe nomes; transforma a seleção em projeção imutável; conserva o mundo; exclui da vista apenas nomes não escolhidos.'],
];
export const GLYPH_REGISTRY = Object.freeze(entries.map(([id, glyph, name, inputs, outputs, signature, documentation, method, plain], index) => Object.freeze({
  id, alias: id, aliases: Object.freeze([id, glyph, ...(id === 'situate' ? ['source'] : [])]), glyph, name, inputs, outputs,
  arity: Object.freeze({ inputs, outputs }), signature, shortcut: `Alt-${index + 1}`,
  documentation, plain, status: 'TESTING',
  implementation: (transaction, args, names, location) => transaction[method](args, names, location),
})));

export const GLYPH_STATUSES = Object.freeze(['PROPOSED', 'TESTING', 'STABLE', 'REJECTED']);
const aliases = new Map(GLYPH_REGISTRY.flatMap(op => op.aliases.map(alias => [alias, op])));
export const operation = alias => aliases.get(alias);
export const normalizeOperation = alias => operation(alias)?.id ?? null;
