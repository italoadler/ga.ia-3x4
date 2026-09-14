// The parser, interpreter, editor, palette and documentation consume this single registry.
// Implementations delegate to the preserved transaction methods: there is no second evaluator.
const entries = [
  ['situate', '⊙', 'Situar', 6, 1, 'source time scale domain shape values → field',
    'Anexa origem, tempo, escala e domínio. Números iguais não tornam fontes intercambiáveis.', 'situate'],
  ['relate', '⇄', 'Relacionar', 4, 1, 'transformation parameters right left → field',
    'Edita uma relação persistente. blend [peso deslocamento] combina campos; transfer [] transfere valores. Correspondências ficam no rastro.', 'relate'],
  ['frame', '⧉', 'Enquadrar', 4, 3, 'ratio anchor_x anchor_y field → included excluded trace',
    'Divide células em interior e exterior vinculados. 3:4 é seleção inteira, não CSS. O interior normaliza; o exterior conserva valores e coordenadas.', 'frame'],
  ['remember', '↶', 'Lembrar', 2, 1, 'ticks field → memory',
    'Cruza uma fronteira explícita de pelo menos um tick. Consulta um snapshot real. Ausência de memória nunca usa o presente como substituto.', 'remember'],
  ['trace', '⋮', 'Ler rastros', 1, 1, 'operation_id → historical_trace',
    'Acessa o último rastro anterior ao tick atual. O argumento é um dos sete IDs ou aliases, por exemplo frame ou ⧉.', 'history'],
  ['discard', '⊘', 'Descartar', 2, 1, 'reason field → loss',
    'Remove o valor atual, mantendo origem, razão, contagem e impressão digital da perda. Reexecutar a fonte não ressuscita o valor.', 'discard'],
  ['observe', '◉', 'Observar', 1, 0, '[names…] → observation',
    'Seleciona uma projeção imutável do mundo. Mudar a observação não muda valores, relações nem rastros.', 'observe'],
];
export const GLYPH_REGISTRY = Object.freeze(entries.map(([id, glyph, name, inputs, outputs, signature, documentation, method], index) => Object.freeze({
  id, alias: id, aliases: Object.freeze([id, glyph]), glyph, name, inputs, outputs,
  arity: Object.freeze({ inputs, outputs }), signature, shortcut: `Alt-${index + 1}`,
  documentation, status: 'TESTING',
  implementation: (transaction, args, names, location) => transaction[method](args, names, location),
})));

export const GLYPH_STATUSES = Object.freeze(['PROPOSED', 'TESTING', 'STABLE', 'REJECTED']);
const aliases = new Map(GLYPH_REGISTRY.flatMap(op => [[op.id, op], [op.glyph, op]]));
export const operation = alias => aliases.get(alias);
export const normalizeOperation = alias => operation(alias)?.id ?? null;
