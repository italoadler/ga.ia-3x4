import { parse, Diagnostic } from '../src/parser.mjs';
import { operation } from '../src/registry.mjs';
import { statementRanges } from './selection.mjs';

export function scoreNodes(source) {
  const program = parse(source), ranges = statementRanges(source);
  return program.statements.map((statement, index) => ({ index, statement, range: ranges[index],
    node: statement.expressions.find(n => n.kind === 'operation') ?? statement.expressions[0] }));
}

export function activeScoreNode(current, cue) {
  if (!cue || cue.statement !== current.range.text.trimEnd()) return null;
  const find = node => {
    if (node.kind === 'operation' && node.id === cue.id && node.location.line === cue.line && node.location.column === cue.column) return node;
    for (const child of node.args ?? node.items ?? []) { const match = find(child); if (match) return match; }
    return null;
  };
  for (const expression of current.statement.expressions) { const found = find(expression); if (found) return found; }
  return null;
}

// Same source, parser and transactional Interpreter as CodeMirror. Only the
// source patch is assembled here: keep committed statements, add/replace one,
// order them by the actual rehearsal source, and retain the selected observe.
export function scorePatch(committed, draft, index) {
  const nodes = scoreNodes(draft), selected = nodes[index];
  if (!selected) throw new Diagnostic('E_SCORE', 'Instrução ausente na partitura.');
  const key = s => s.names.length ? s.names.join(' ') : '@observe';
  const prior = scoreNodes(committed), saved = new Map(prior.map(n => [key(n.statement), n]));
  const selectedKey = key(selected.statement); saved.set(selectedKey, selected);
  const follow = nodes[index + 1]?.node.id === 'observe' ? nodes[index + 1] : null;
  if (follow) saved.set('@observe', follow);
  const ordered = [], seen = new Set();
  for (const n of nodes) {
    const k = key(n.statement); if (k === '@observe' || seen.has(k) || !saved.has(k)) continue;
    seen.add(k); ordered.push(saved.get(k));
  }
  for (const [k, n] of saved) if (k !== '@observe' && !seen.has(k)) ordered.push(n);
  if (saved.has('@observe')) ordered.push(saved.get('@observe'));
  let source = '', locations = [];
  for (const n of ordered) {
    const original = n === selected || n === follow ? draft : committed;
    const text = original.slice(n.range.from, n.range.to);
    const line = source.split('\n').length;
    locations.push({ from: line, to: line + text.split('\n').length, draftLine: n === selected || n === follow ? n.statement.location.line : nodes.find(v => key(v.statement) === key(n.statement))?.statement.location.line ?? n.statement.location.line });
    source += text.trimEnd() + '\n';
  }
  parse(source);
  return { source, selected: [{ line: selected.statement.location.line, text: draft.slice(selected.range.from, selected.range.to) }],
    mapLocation(location) { const match = locations.find(m => location.line >= m.from && location.line < m.to); return match ? { ...location, line: match.draftLine + location.line - match.from } : location; } };
}

const operand = n => n.kind === 'literal' ? typeof n.value === 'object' ? `${n.value.width}:${n.value.height}` : JSON.stringify(n.value) :
  n.kind === 'reference' ? n.name : n.kind === 'vector' ? n.items.length > 10 ? `[${n.items.length} posições / dados na fonte]` : `[${n.items.map(operand).join(' ')}]` : `${operation(n.id).glyph} ${n.args.map(operand).join(' ')}`;

export function createScore(parent, editor, callbacks) {
  parent.innerHTML = '<div class="score-progress"></div><div class="score-operator" aria-live="polite"></div><div class="score-name"></div><div class="score-signature"></div><div class="score-operands"></div><div class="score-binding"></div><div class="score-execution"></div><div class="score-navigation">← → / NAVEGAR &nbsp; ENTER / EXECUTAR &nbsp; F2 / FONTE</div>';
  let nodes = scoreNodes(editor.text), index = nodes.findIndex(n => n.node.id === 'observe'), painted = null;
  const $ = name => parent.querySelector('.score-' + name);
  function render() {
    const current = nodes[index];
    if (!current) return;
    const activeNode = activeScoreNode(current, painted), displayNode = activeNode ?? current.node;
    const op = operation(displayNode.id);
    $('progress').textContent = `${String(index + 1).padStart(2, '0')} / ${String(nodes.length).padStart(2, '0')} · LINHA ${current.statement.location.line}`;
    $('operator').textContent = op?.glyph ?? '·'; $('name').textContent = op?.name.toUpperCase() ?? 'VALOR';
    $('signature').textContent = op?.signature ?? '';
    $('operands').replaceChildren(...(displayNode.args ?? []).map(n => { const p = document.createElement('p'); p.textContent = operand(n); return p; }));
    $('binding').textContent = current.statement.names.length ? `→ ${current.statement.names.join(' / ')}` : '→ seleção de observação';
    const follow = nodes[index + 1]?.node.id === 'observe' ? nodes[index + 1] : null;
    if (follow) $('binding').textContent += ` · bloco + ◉ ${operand(follow.node.args[0])}`;
    const active = Boolean(activeNode);
    parent.classList.toggle('executed', active); parent.dataset.operation = displayNode.id ?? '';
    parent.dataset.astLine = displayNode.location.line; parent.dataset.astColumn = displayNode.location.column;
    $('execution').textContent = active ? `DESENHADO / T ${painted.tick} / ${painted.traceIds.join(' ') || 'MESMO ESTADO'}` : 'INSTRUÇÃO PRONTA';
  }
  return { render,
    refresh() { try { const next = scoreNodes(editor.text); const line = nodes[index]?.statement.location.line; nodes = next; index = Math.max(0, nodes.findIndex(n => n.statement.location.line === line)); render(); } catch { /* Keep last parsed score while diagnostics review the edit. */ } },
    navigate(delta) { index = Math.max(0, Math.min(nodes.length - 1, index + delta)); render(); },
    select(i) { index = Math.max(0, Math.min(nodes.length - 1, i)); render(); },
    execute() { return callbacks.execute(index); },
    cue(cue) { painted = cue; render(); },
    inspect: () => ({ index, length: nodes.length, astLine: nodes[index]?.node.location.line, astColumn: nodes[index]?.node.location.column, id: nodes[index]?.node.id,
      names: nodes[index]?.statement.names ?? [],
      glyph: operation(nodes[index]?.node.id)?.glyph, painted: painted?.id, source: editor.text }),
  };
}
