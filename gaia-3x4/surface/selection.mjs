import { Diagnostic, parse } from '../src/parser.mjs';

// Tolerant statement boundaries, not an evaluator. Invalid text outside a selected
// statement can remain in the editor without entering the committed program.
export function statementRanges(source) {
  const ranges = [];
  let start = 0, depth = 0, quoted = false, escaped = false, comment = false;
  const add = end => {
    const text = source.slice(start, end);
    if (text.trim() && !text.trimStart().startsWith('#')) {
      const header = text.match(/^\s*([\p{L}\p{N}_\s]+)=/u);
      ranges.push({ from: start, to: end, text, names: header ? header[1].trim().split(/\s+/u) : [],
        line: source.slice(0, start).split('\n').length });
    }
    start = end + 1;
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '\n') {
      comment = false;
      // Unterminated strings cannot consume unrelated following statements.
      quoted = false; escaped = false;
      if (depth === 0) add(i);
      continue;
    }
    if (comment) continue;
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '#') comment = true;
    else if (c === '"') quoted = true;
    else if (c === '[') depth++;
    else if (c === ']') depth = Math.max(0, depth - 1);
  }
  if (start < source.length) add(source.length);
  return ranges;
}

export function selectionPatch(committed, draft, from, to = from, parseOptions = {}) {
  const selected = statementRanges(draft).filter(s => from === to ? from >= s.from && from <= s.to : s.from < to && s.to > from);
  if (!selected.length) throw new Diagnostic('E_SELECTION', 'Selecione uma declaração ou posicione o cursor em uma linha executável.');
  const old = statementRanges(committed).map(s => ({ ...s, origin: null, insertion: false }));
  for (const statement of selected) {
    const overlapping = old.findIndex(s => statement.names.length ? s.names.some(n => statement.names.includes(n)) : !s.names.length);
    if (overlapping >= 0) {
      if (old[overlapping].names.join(' ') !== statement.names.join(' '))
        throw new Diagnostic('E_PATCH_BINDING', 'Uma execução parcial deve conservar todos os nomes de saída da declaração; use Ctrl+Shift+Enter para mudar a estrutura.', { line: statement.line });
      old[overlapping] = { ...old[overlapping], text: statement.text, origin: statement };
    } else {
      const observe = old.findIndex(s => !s.names.length);
      const position = observe < 0 ? committed.length : old[observe].from;
      old.splice(observe < 0 ? old.length : observe, 0, { ...statement, from: position, to: position, origin: statement, insertion: true });
    }
  }
  let source = '', cursor = 0;
  const mappings = [];
  for (const statement of old) {
    source += committed.slice(cursor, statement.from);
    mappings.push({ patchedLine: source.split('\n').length, lines: statement.text.split('\n').length, origin: statement.origin,
      committedNames: statement.names });
    source += statement.text + (statement.insertion ? '\n' : '');
    cursor = statement.to;
  }
  source += committed.slice(cursor);
  const mapLocation = location => {
    const mapping = mappings.find(m => location.line >= m.patchedLine && location.line < m.patchedLine + m.lines);
    const origin = mapping?.origin ?? statementRanges(draft).find(s => s.names.join(' ') === mapping?.committedNames.join(' '));
    return origin ? { ...location, line: origin.line + location.line - mapping.patchedLine } : location;
  };
  try { parse(source, parseOptions); } catch (error) {
    if (error instanceof Diagnostic) Object.assign(error, mapLocation(error.toJSON()));
    throw error;
  }
  return { source, selected, mapLocation };
}
