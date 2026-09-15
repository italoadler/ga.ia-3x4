import { operation, normalizeOperation } from './registry.mjs';

export class Diagnostic extends Error {
  constructor(code, message, location = {}) {
    super(message);
    this.name = 'Diagnostic';
    this.code = code;
    this.line = location.line ?? 1;
    this.column = location.column ?? 1;
  }
  toJSON() { return { code: this.code, message: this.message, line: this.line, column: this.column }; }
}

const identifier = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const numeric = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i;

export function tokenize(source) {
  if (typeof source !== 'string') throw new Diagnostic('E_SOURCE', 'O programa deve ser texto.');
  const tokens = [];
  let i = 0, line = 1, column = 1, depth = 0;
  const take = () => {
    const c = source[i++];
    if (c === '\n') { line++; column = 1; } else column++;
    return c;
  };
  const push = (type, value, location) => tokens.push({ type, value, ...location });
  while (i < source.length) {
    const c = source[i], location = { line, column };
    if (c === '\n') { take(); if (!depth) push('newline', '\n', location); continue; }
    if (/\s/.test(c)) { take(); continue; }
    if (c === '#') { while (i < source.length && source[i] !== '\n') take(); continue; }
    if (c === '"') {
      take();
      let value = '', closed = false;
      while (i < source.length) {
        const ch = take();
        if (ch === '"') { closed = true; break; }
        if (ch === '\n') throw new Diagnostic('E_STRING', 'A string deve terminar na mesma linha.', location);
        if (ch === '\\') {
          const escaped = take();
          const escapeMap = { '"': '"', '\\': '\\', n: '\n', t: '\t' };
          if (!(escaped in escapeMap)) throw new Diagnostic('E_ESCAPE', 'Escape de string desconhecido.', location);
          value += escapeMap[escaped];
        } else value += ch;
      }
      if (!closed) throw new Diagnostic('E_STRING', 'String sem aspas finais.', location);
      push('string', value, location); continue;
    }
    if ('[]='.includes(c)) {
      take();
      if (c === '[') depth++;
      if (c === ']' && --depth < 0) throw new Diagnostic('E_VECTOR', 'Fechamento de vetor sem abertura.', location);
      push(c, c, location); continue;
    }
    if (operation(c)) { take(); push('word', c, location); continue; }
    let value = '';
    while (i < source.length && !/[\s\[\]="#]/.test(source[i]) && !operation(source[i])) value += take();
    if (!value) throw new Diagnostic('E_TOKEN', `Caractere desconhecido: ${c}.`, location);
    if (numeric.test(value)) {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new Diagnostic('E_NUMBER', 'Número fora do intervalo finito.', location);
      push('number', number, location);
    } else if (/^\d+:\d+$/.test(value)) {
      const [width, height] = value.split(':').map(Number);
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1)
        throw new Diagnostic('E_RATIO', 'A proporção exige dois inteiros positivos.', location);
      push('ratio', { kind: 'ratio', width, height }, location);
    } else if (identifier.test(value) || operation(value)) push('word', value, location);
    else throw new Diagnostic('E_TOKEN', `Termo inválido: ${value}.`, location);
  }
  if (depth) throw new Diagnostic('E_VECTOR', 'Vetor sem fechamento.', { line, column });
  return tokens;
}

export function parse(source, { externalNames = [] } = {}) {
  const tokens = tokenize(source), lines = [];
  const externals = new Set(externalNames);
  let row = [];
  for (const token of [...tokens, { type: 'newline' }]) {
    if (token.type === 'newline') { if (row.length) lines.push(row); row = []; }
    else row.push(token);
  }
  const statements = lines.map(parts => {
    const separators = parts.filter(t => t.type === '=');
    if (separators.length > 1) throw new Diagnostic('E_BINDING', 'Use uma única atribuição por linha.', separators[1]);
    const at = parts.findIndex(t => t.type === '=');
    const names = at < 0 ? [] : parts.slice(0, at).map(t => {
      if (t.type !== 'word' || !identifier.test(t.value) || operation(t.value))
        throw new Diagnostic('E_NAME', 'Nome de vínculo inválido ou reservado.', t);
      return t.value;
    });
    if (at === 0) throw new Diagnostic('E_NAME', 'Falta um nome antes de =.', parts[0]);
    const terms = at < 0 ? parts : parts.slice(at + 1);
    let cursor = 0;
    const term = (literalOperation = false, config = false) => {
      const token = terms[cursor++];
      if (!token) throw new Diagnostic('E_ARITY', 'Faltam argumentos ou valores.', parts[0]);
      if (literalOperation) {
        const id = normalizeOperation(token.value);
        if (!id) throw new Diagnostic('E_TRACE_ID', 'trace exige o ID ou alias de uma operação.', token);
        return { kind: 'literal', value: id, location: token };
      }
      if (token.type === '[') {
        const items = [];
        while (terms[cursor]?.type !== ']') {
          if (!terms[cursor]) throw new Diagnostic('E_VECTOR', 'Vetor incompleto.', token);
          const item = term(false, true);
          if (item.kind === 'operation') throw new Diagnostic('E_VECTOR', 'Vetores não executam operações.', token);
          items.push(item);
        }
        cursor++;
        return { kind: 'vector', items, location: token };
      }
      if (['number', 'string', 'ratio'].includes(token.type)) return { kind: 'literal', value: token.value, location: token };
      if (token.type !== 'word') throw new Diagnostic('E_TERM', 'Esperado um valor ou uma operação.', token);
      const op = operation(token.value);
      if (op && !config) {
        const args = [];
        for (let n = 0; n < op.inputs; n++) {
          const argument = term(op.id === 'trace', op.id === 'relate' && n === 0);
          if (argument.kind === 'operation' && argument.outputs !== 1)
            throw new Diagnostic('E_STACK', 'Uma operação com vários resultados precisa de seus próprios nomes.', argument.location);
          args.push(argument);
        }
        return { kind: 'operation', id: op.id, outputs: op.outputs, args, location: token };
      }
      if (config && ['blend', 'transfer'].includes(token.value)) return { kind: 'literal', value: token.value, location: token };
      return { kind: 'reference', name: token.value, location: token };
    };
    const expressions = [];
    while (cursor < terms.length) expressions.push(term());
    const outputs = expressions.reduce((count, e) => count + (e.kind === 'operation' ? e.outputs : 1), 0);
    if (outputs !== names.length || (!names.length && (expressions.length !== 1 || expressions[0]?.id !== 'observe')))
      throw new Diagnostic('E_STACK', `A linha produz ${outputs} resultado(s), mas declara ${names.length} nome(s).`, parts[0]);
    return { names, expressions, location: parts[0] };
  });
  if (!statements.length) throw new Diagnostic('E_EMPTY', 'O programa está vazio.');
  const definitions = new Map();
  statements.forEach((s, index) => s.names.forEach(name => {
    if (definitions.has(name)) throw new Diagnostic('E_DUPLICATE', `Nome repetido: ${name}.`, s.location);
    if (externals.has(name)) throw new Diagnostic('E_EXTERNAL_SHADOW', `O nome externo ${name} não pode ser redeclarado.`, s.location);
    definitions.set(name, index);
  }));
  const dependencies = statements.map(() => new Set());
  const visit = (node, index, delayed = false) => {
    if (node.kind === 'reference') {
      if (!definitions.has(node.name) && !externals.has(node.name)) throw new Diagnostic('E_UNKNOWN', `Nome não declarado: ${node.name}.`, node.location);
      if (externals.has(node.name)) return;
      if (!delayed) dependencies[index].add(definitions.get(node.name));
    }
    if (node.kind === 'vector') node.items.forEach(n => visit(n, index, delayed));
    if (node.kind === 'operation') node.args.forEach((n, i) => visit(n, index, delayed || (node.id === 'remember' && i === 1)));
  };
  statements.forEach((s, i) => s.expressions.forEach(n => visit(n, i)));
  const colors = new Map();
  const detect = index => {
    if (colors.get(index) === 1) throw new Diagnostic('E_CAUSAL_CYCLE', 'Ciclo causal instantâneo: introduza uma fronteira temporal explícita.', statements[index].location);
    if (colors.get(index) === 2) return;
    colors.set(index, 1);
    dependencies[index].forEach(detect);
    colors.set(index, 2);
  };
  statements.forEach((_, i) => detect(i));
  return { statements, names: [...definitions.keys()] };
}
