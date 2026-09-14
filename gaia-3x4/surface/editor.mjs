import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine, highlightActiveLineGutter, Decoration, hoverTooltip } from '@codemirror/view';
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
import { StreamLanguage, syntaxHighlighting, HighlightStyle, bracketMatching, foldGutter, foldKeymap, foldService } from '@codemirror/language';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { lintGutter, setDiagnostics, diagnosticCount } from '@codemirror/lint';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { GLYPH_REGISTRY, operation } from '../src/registry.mjs';
import { parse } from '../src/parser.mjs';

export const consequenceEffect = StateEffect.define();
const consequenceField = StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const effect of tr.effects) if (effect.is(consequenceEffect)) {
      const cue = effect.value;
      if (!cue) { value = Decoration.none; continue; }
      const line = tr.state.doc.line(Math.min(tr.state.doc.lines, Math.max(1, cue.line)));
      value = Decoration.set([Decoration.line({ class: 'cm-consequence', attributes: {
        'data-operation': cue.id, 'data-trace': cue.traceIds.join(' '), 'data-tick': String(cue.tick),
      } }).range(line.from)]);
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});

const language = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/#.*/)) return 'comment';
    if (stream.match(/"(?:[^"\\]|\\.)*"?/)) return 'string';
    if (stream.match(/-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?/i)) return 'number';
    const glyph = GLYPH_REGISTRY.find(op => stream.match(op.glyph, false));
    if (glyph) { stream.match(glyph.glyph); return 'keyword'; }
    const word = stream.match(/[\p{L}_][\p{L}\p{N}_]*/u);
    if (word) return operation(word[0]) ? 'keyword' : ['blend', 'transfer'].includes(word[0]) ? 'atom' : 'variableName';
    stream.next(); return 'punctuation';
  },
  languageData: { commentTokens: { line: '#' }, closeBrackets: { brackets: ['[', '"'] } },
});

function inCommentOrString(text) {
  let quoted = false, escaped = false;
  for (const c of text) {
    if (escaped) { escaped = false; continue; }
    if (quoted && c === '\\') escaped = true;
    else if (c === '"') quoted = !quoted;
    else if (c === '#' && !quoted) return true;
  }
  return quoted;
}

export function glyphAt(view, pos) {
  const line = view.state.doc.lineAt(pos), local = pos - line.from;
  if (inCommentOrString(line.text.slice(0, local))) return null;
  for (const op of GLYPH_REGISTRY) for (const alias of op.aliases) {
    let at = line.text.indexOf(alias);
    while (at !== -1) {
      const left = line.text[at - 1] ?? '', right = line.text[at + alias.length] ?? '';
      if (local >= at && local <= at + alias.length && (alias === op.glyph || (!/[\p{L}\p{N}_]/u.test(left) && !/[\p{L}\p{N}_]/u.test(right))))
        return { op, from: line.from + at, to: line.from + at + alias.length };
      at = line.text.indexOf(alias, at + 1);
    }
  }
  return null;
}

function documentation(op) {
  const dom = document.createElement('div'); dom.className = 'glyph-documentation';
  const title = document.createElement('strong'); title.textContent = `${op.glyph}  ${op.name} / ${op.alias}`;
  const signature = document.createElement('code'); signature.textContent = op.signature;
  const detail = document.createElement('p'); detail.textContent = op.documentation;
  const shortcut = document.createElement('small'); shortcut.textContent = `${op.shortcut} · ${op.inputs} entradas / ${op.outputs} saídas · ${op.status}`;
  dom.append(title, signature, detail, shortcut); return dom;
}

function completion(context) {
  const line = context.state.doc.lineAt(context.pos);
  if (inCommentOrString(line.text.slice(0, context.pos - line.from))) return null;
  const match = context.matchBefore(/[\p{L}\p{N}_⊙⇄⧉↶⋮⊘◉]*/u);
  if (!context.explicit && (!match || match.from === match.to)) return null;
  const options = GLYPH_REGISTRY.flatMap(op => op.aliases.map(alias => ({
    label: alias, displayLabel: `${op.glyph}  ${op.alias}`, type: 'keyword',
    detail: `${op.inputs} → ${op.outputs}`, info: () => documentation(op), boost: 2,
    apply: op.glyph,
  })));
  const names = [...context.state.doc.toString().matchAll(/^\s*([\p{L}\p{N}_ ]+)\s*=/gmu)].flatMap(m => m[1].trim().split(/\s+/));
  options.push(...[...new Set(names)].map(label => ({ label, type: 'variable' })));
  return { from: match?.from ?? context.pos, options, validFor: /^[\p{L}\p{N}_⊙⇄⧉↶⋮⊘◉]*$/u };
}

export function createEditor(parent, source, callbacks) {
  let syntaxTimer;
  const view = new EditorView({ parent, state: EditorState.create({ doc: source, extensions: [
    EditorView.theme({
      '&': { color: '#dddddd', backgroundColor: '#090909' },
      '.cm-gutters': { backgroundColor: '#090909', color: '#555555', border: 'none' },
      '.cm-activeLineGutter': { backgroundColor: '#171717', color: '#aaaaaa' },
      '.cm-activeLine': { backgroundColor: '#131313' },
      '.cm-tooltip': { backgroundColor: '#151515', color: '#eeeeee', border: '1px solid #555555' },
      '.cm-selectionBackground': { backgroundColor: '#404040' },
      '&.cm-focused .cm-selectionBackground': { backgroundColor: '#404040' },
      '.cm-cursor': { borderLeftColor: '#eeeeee' },
      '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: '#444444', color: '#ffffff' },
      '&.cm-focused .cm-matchingBracket': { backgroundColor: '#343434' },
      '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: '#444444' },
      '.cm-searchMatch': { backgroundColor: '#3a3a3a' },
      '.cm-searchMatch-selected': { backgroundColor: '#606060' },
      '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy #bcbcbc', textUnderlineOffset: '4px' },
      '.cm-lintRange-active': { backgroundColor: '#3a3a3a' },
    }, { dark: true }),
    lineNumbers(), history(), drawSelection(), highlightActiveLine(), highlightActiveLineGutter(),
    EditorView.lineWrapping, highlightSelectionMatches(), bracketMatching(), closeBrackets(), foldGutter(),
    lintGutter(), consequenceField, language,
    foldService.of((state, lineStart, lineEnd) => {
      const text = state.doc.toString(), opening = text.indexOf('[', lineStart);
      if (opening < 0 || opening > lineEnd) return null;
      let depth = 1, i = opening + 1;
      for (; i < text.length && depth; i++) { if (text[i] === '[') depth++; if (text[i] === ']') depth--; }
      return !depth && i - 1 > lineEnd ? { from: opening + 1, to: i - 1 } : null;
    }),
    syntaxHighlighting(HighlightStyle.define([
      { tag: tags.keyword, color: '#f5f5f5', fontWeight: '600' },
      { tag: tags.comment, color: '#777777' }, { tag: tags.string, color: '#ababab' },
      { tag: tags.number, color: '#d7d7d7' }, { tag: tags.variableName, color: '#dedede' },
      { tag: tags.atom, color: '#bfbfbf' },
    ])),
    autocompletion({ override: [completion], activateOnTyping: true }),
    hoverTooltip((editor, pos) => {
      const found = glyphAt(editor, pos);
      return found ? { pos: found.from, end: found.to, above: true, create: () => ({ dom: documentation(found.op) }) } : null;
    }, { hoverTime: 240 }),
    keymap.of([
      { key: 'Mod-Shift-Enter', run: () => { callbacks.execute('all'); return true; } },
      { key: 'Mod-Enter', run: () => { callbacks.execute('selection'); return true; } },
      { key: 'Alt-Enter', run: () => { callbacks.step(); return true; } },
      { key: 'Mod-Shift-p', run: () => { callbacks.palette(); return true; } },
      { key: 'Mod-Shift-i', run: () => { callbacks.inspector(); return true; } },
      ...GLYPH_REGISTRY.map(op => ({ key: op.shortcut, run: () => { insert(op); return true; } })),
      ...completionKeymap, ...closeBracketsKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap,
      indentWithTab, ...defaultKeymap,
      { key: 'Escape', run: editor => { editor.contentDOM.blur(); return true; } },
    ]),
    EditorView.contentAttributes.of({ 'aria-label': 'Partitura GA.IA/3x4, editor CodeMirror 6', spellcheck: 'false' }),
    EditorView.updateListener.of(update => {
      if (!update.docChanged) return;
      callbacks.change();
      clearTimeout(syntaxTimer);
      syntaxTimer = setTimeout(() => {
        try { parse(view.state.doc.toString()); showDiagnostic(null); }
        catch (error) { if (error.code) showDiagnostic(error.toJSON()); }
      }, 250);
    }),
  ] }) });
  const insert = op => {
    const range = view.state.selection.main;
    view.dispatch({ changes: { from: range.from, to: range.to, insert: op.glyph }, selection: { anchor: range.from + op.glyph.length } });
    view.focus();
  };
  function showDiagnostic(error) {
    const diagnostics = [];
    if (error) {
      const line = view.state.doc.line(Math.min(view.state.doc.lines, Math.max(1, error.line)));
      const from = Math.min(line.to, line.from + Math.max(0, error.column - 1));
      diagnostics.push({ from, to: Math.min(line.to, from + 1), severity: 'error', source: error.code, message: error.message });
    }
    view.dispatch(setDiagnostics(view.state, diagnostics));
  }
  return {
    view, insert, showDiagnostic,
    get text() { return view.state.doc.toString(); },
    get selection() { return view.state.selection.main; },
    setText(text) { clearTimeout(syntaxTimer); view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); },
    cue(cue) { view.dispatch({ effects: consequenceEffect.of(cue) }); },
    diagnosticCount: () => diagnosticCount(view.state),
    destroy() { clearTimeout(syntaxTimer); view.destroy(); },
  };
}

export function createPalette(parent, editor) {
  for (const op of GLYPH_REGISTRY) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.operation = op.id;
    button.textContent = op.glyph;
    button.setAttribute('aria-label', `${op.name}, ${op.alias}, ${op.shortcut}`);
    button.title = `${op.name} / ${op.alias}\n${op.signature}\n${op.shortcut}\n${op.documentation}`;
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => editor.insert(op));
    parent.append(button);
  }
}
