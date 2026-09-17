import { Interpreter } from '../src/runtime.mjs';
import { GLYPH_REGISTRY, operation } from '../src/registry.mjs';
import { renderField, renderHistory } from './render.mjs';
import { createEditor, createPalette } from './editor.mjs';
import { selectionPatch, statementRanges } from './selection.mjs';
import { createEarth, VISUAL_ENCODING } from './earth.mjs';
import { createScore, scorePatch, scoreNodes } from './score.mjs';
import { LABOUR_VISUAL_ENCODING } from './labour-scene.mjs';

const $ = id => document.getElementById(id);
const assetUrl = path => new URL(path.replace(/^\//, ''), document.baseURI).href;
const assetFetch = (resource, options) => fetch(typeof resource === 'string' && resource.startsWith('/') ? assetUrl(resource) : resource, options);
const legacy = new URLSearchParams(location.search).get('score') === 'legacy';
const labourInput = legacy ? null : await assetFetch('/data/labour-demo.json').then(r => r.json());
const interpreter = new Interpreter({ labourInput });
let score, viewMode = 'SPLIT', viewBeforeInspector = 'SPLIT', fullEditor = legacy, selectedFragment = null;
let paused = false, inspector = false, draftError = null, visualCue = null, cueTimers = [];
const source = await assetFetch(legacy ? '/examples/canonical.gaia' : '/examples/labour-score.gaia').then(r => { if (!r.ok) throw new Error('Partitura não encontrada.'); return r.text(); });
const committed = legacy ? source : await assetFetch('/examples/labour-smoke.gaia').then(r => r.text());
const first = interpreter.apply(committed);
if (!first.ok) throw new Error(JSON.stringify(first.diagnostic));
const editor = createEditor($('source'), source, { execute, step, change: readout, palette: focusPalette, inspector: toggleInspector });
createPalette($('glyph-palette'), editor);
if (!legacy) { score = createScore($('score-mode'), editor, { execute: executeScore }); score.render(); }
$('synthetic-warning').hidden = !labourInput?.records.some(r => r.evidenceStatus === 'synthetic');
document.body.classList.toggle('labour-performance', !legacy);
setViewMode('SPLIT');
let earth;
try { earth = await createEarth($('earth-space'), { onCuePainted: paintCue, labour: !legacy, onSelect: inspectRecord }); }
catch (error) { $('stage-message').textContent = `Renderer indisponível: ${error.message}. I abre o Inspector.`; console.error(error); }

function fullRecord() {
  return { work: 'GA.IA/3x4: retratos computacionais de uma Terra em trabalho',
    glyphRegistry: GLYPH_REGISTRY, observationEncoding: legacy ? VISUAL_ENCODING : LABOUR_VISUAL_ENCODING,
    inspectorEncoding: { included: 'normalizado pelo runtime; luminância = round(valor × 255)',
      excluded: 'marca constante; número bruto, ≈ quando abreviado; posição original', history: 'últimas seis faixas; todos os rastros retidos' },
    execution: interpreter.execution, score: score?.inspect(), selectedFragment, visual: earth?.inspect() ?? null, world: interpreter.world.inspect() };
}

function readout() {
  const world = interpreter.world, entries = new Map(interpreter.observation.entries.map(e => [e.name, e.value]));
  $('clock').textContent = `T ${String(world.tick).padStart(4, '0')}`;
  $('revision').textContent = `REV ${String(world.revisions.length).padStart(2, '0')}`;
  $('pulse').textContent = paused ? 'SUSPENSO' : 'EM CURSO';
  $('mode').textContent = inspector ? 'INSPECTOR / CANVAS 2D' : legacy ? 'RETRATO / TERRA SINTÉTICA' : 'TERRA / RETRATOS DE TRABALHO';
  $('backend').textContent = earth?.inspect().backend.toUpperCase() ?? 'INICIALIZANDO';
  const inside = [...entries.values()].find(v => v?.partition?.role === 'included');
  const outside = [...entries.values()].find(v => v?.partition?.role === 'excluded');
  $('inside-count').textContent = `${inside?.value?.length ?? 0} DENTRO`;
  $('outside-count').textContent = `${outside?.value ? outside.partition.sourceIndices.length : 0} FORA`;
  $('frame-id').textContent = inside?.partition?.traceId ?? outside?.partition?.traceId ?? 'sem recorte';
  const a = entries.get('a'), b = entries.get('b');
  $('origin-readout').textContent = a && b ? `A ${JSON.stringify(a.value) === JSON.stringify(b.value) ? '=' : '≠'} B / dados    A ${JSON.stringify(a.provenance) !== JSON.stringify(b.provenance) ? '≠' : '='} B / origem` : 'T / ler as origens';
  const loss = world.traces.filter(t => t.operation === 'discard').at(-1);
  $('loss-count').textContent = loss ? `${String(loss.loss.count).padStart(2, '0')} VALORES / ${loss.id}` : 'SEM PERDA';
  $('loss-reason').textContent = loss ? `${loss.sourceIds.join(' ')} · ${loss.parameters.reason}` : 'A ausência também tem uma origem.';
  const relation = [...world.relations.values()].find(r => r.active);
  $('relation-readout').textContent = relation ? `${relation.id} / ${relation.transformation} [${relation.parameters.join(' ')}]` : 'nenhuma relação ativa';
  $('source-state').textContent = draftError ? 'REVISÃO RECUSADA' : editor.text === interpreter.source ? 'FONTE APLICADA' : 'PENDÊNCIAS NA PARTITURA';
  $('diagnostic').classList.toggle('invalid', Boolean(draftError));
  $('diagnostic').textContent = draftError ? `${draftError.code} · ${draftError.line}:${draftError.column} · ${draftError.message} Último mundo válido preservado.` : `${world.snapshots.size} fronteiras temporais / ${world.traces.length} rastros retidos`;
  $('retention').textContent = `${world.traces.length} RASTROS / T PARA LER`;
  $('memory-readout').textContent = entries.get('antes')?.available ? `↶ T ${String(entries.get('antes').requestedTick).padStart(4, '0')}` : '↶ MEMÓRIA AINDA AUSENTE';
  $('history-readout').textContent = entries.get('anterior')?.available ? `⋮ ${entries.get('anterior').latest.id}` : '⋮ PRIMEIRO RECORTE';
  if (!legacy) {
    const surface = [...entries.values()].find(v => v?.surface && !v.partition)?.surface;
    $('inside-count').textContent = `${inside?.surface?.fragments.filter(f => f.state !== 'discarded').length ?? 0} DENTRO`;
    $('outside-count').textContent = `${outside?.surface?.fragments.filter(f => f.state !== 'discarded').length ?? 0} FORA`;
    $('origin-readout').textContent = surface ? `${surface.derivation.distinctRecordCount} REGISTROS / ${surface.derivation.fragmentCount} DERIVAÇÕES · REPETIÇÃO ≠ MAIS TRABALHADORES` : 'SEM SUPORTE DE TRABALHO / CORTINA';
    $('memory-readout').textContent = entries.get('antes')?.available ? `↶ T ${entries.get('antes').requestedTick} / PRESENTE CONSERVADO` : '↶ SEM MEMÓRIA SELECIONADA';
    $('loss-count').textContent = loss?.loss?.supportedFragmentCount !== undefined ? `${loss.loss.distinctRecordCount} REGISTRO / ${loss.loss.supportedFragmentCount} FRAGMENTOS / ${loss.id}` : loss ? loss.id : 'SEM PERDA';
    $('stage-bottom').textContent = 'REGISTROS SINTÉTICOS / COORDENADAS RELACIONAIS, SEM CARTOGRAFIA';
    score?.refresh();
  }
  if ($('trace-reader').open) $('trace-json').textContent = JSON.stringify(fullRecord(), null, 2);
}

function render() {
  earth?.update(interpreter.observation, interpreter.world.traces);
  if (inspector) {
    renderField($('field'), interpreter.observation);
    const history = renderHistory($('history'), interpreter.world.traces, interpreter.world.tick);
    $('history-count').textContent = `${history.visible} DE ${history.total} / T: TODOS`;
  }
  readout();
}

function showCue(op, location) {
  const actual = statementRanges(interpreter.source).find(s => op.location.line >= s.line && op.location.line < s.line + s.text.split('\n').length);
  const cue = { id: op.id, line: location.line, column: location.column, statement: actual?.text.trimEnd(), traceIds: op.traceIds, tick: interpreter.world.tick };
  earth?.setCue(cue);
  if (inspector || !earth) paintCue(cue);
}
function paintCue(cue) {
  if (draftError || cue.tick !== interpreter.world.tick) return;
  const entry = operation(cue.id); visualCue = cue; editor.cue(cue);
  score?.cue(cue);
  $('consequence').textContent = `${entry.glyph} ${entry.name.toUpperCase()} / ${cue.traceIds.join(' ') || 'ESTADO PRESERVADO'} / T ${String(cue.tick).padStart(4, '0')}`;
  $('consequence').dataset.operation = cue.id;
  $('glyph-palette').querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.operation === cue.id));
}

function synchronize(result, patch = null) {
  cueTimers.forEach(clearTimeout); cueTimers = [];
  if (!legacy && !patch && score) {
    const current = score.inspect();
    const op = result.execution.operations.findLast(op => op.id === current.id && (!current.names.length || op.names.join(' ') === current.names.join(' ')));
    if (op) showCue(op, { line: current.astLine, column: current.astColumn }); return;
  }
  const candidates = result.execution.operations.map(op => ({ op, location: patch?.mapLocation(op.location) ?? op.location }))
    .filter(({ location }) => !patch || patch.selected.some(s => location.line >= s.line && location.line < s.line + s.text.split('\n').length));
  let delay = 0;
  for (const { op, location } of candidates) {
    if (!delay) showCue(op, location); else cueTimers.push(setTimeout(() => showCue(op, location), delay));
    delay += candidates.length === 1 ? 1200 : ['frame', 'remember', 'discard'].includes(op.id) ? 230 : 120;
  }
}

function execute(scope = 'all') {
  let patch = null, result;
  try {
    if (scope === 'selection') patch = selectionPatch(interpreter.source, editor.text, editor.selection.from, editor.selection.to);
    result = interpreter.apply(patch?.source ?? editor.text);
    draftError = result.ok ? null : patch ? patch.mapLocation(result.diagnostic) : result.diagnostic;
  } catch (error) {
    if (!error.code) throw error;
    draftError = error.toJSON(); result = { ok: false, diagnostic: draftError };
  }
  editor.showDiagnostic(draftError);
  if (result.ok) { render(); synchronize(result, patch); }
  else { cueTimers.forEach(clearTimeout); cueTimers = []; editor.cue(null); $('consequence').textContent = `REVISÃO RECUSADA / ÚLTIMA CONSEQUÊNCIA VÁLIDA EM T ${interpreter.world.tick}`; readout(); }
  return result;
}

function executeScore(index) {
  let patch, result;
  try { patch = scorePatch(interpreter.source, editor.text, index); result = interpreter.apply(patch.source);
    draftError = result.ok ? null : patch.mapLocation(result.diagnostic);
  } catch (error) { if (!error.code) throw error; draftError = error.toJSON(); result = { ok: false, diagnostic: draftError }; }
  editor.showDiagnostic(draftError);
  if (result.ok) { render(); synchronize(result, patch); }
  else { cueTimers.forEach(clearTimeout); cueTimers = []; $('consequence').textContent = 'REVISÃO RECUSADA / ÚLTIMO MUNDO VÁLIDO EM CURSO'; readout(); }
  return result;
}

function step() {
  const result = interpreter.step();
  if (result.ok) { render(); synchronize(result); }
  else { if (!draftError) draftError = result.diagnostic; readout(); }
  return result;
}

function toggleInspector() {
  inspector = !inspector; document.body.classList.toggle('inspector-mode', inspector);
  if (!legacy) { if (inspector) { viewBeforeInspector = viewMode; setViewMode('INSPECTOR'); } else setViewMode(viewBeforeInspector); }
  $('inspector-space').hidden = !inspector; $('earth-space').hidden = inspector;
  earth?.suspend(inspector); render();
}
function setViewMode(mode) {
  viewMode = mode; document.body.dataset.view = mode;
  $('source').hidden = !fullEditor; $('score-mode').hidden = fullEditor || legacy;
  $('view-mode').textContent = `${mode} / ${fullEditor ? 'FONTE' : 'SCORE'}`;
}
function toggleEditor() { if (viewMode === 'WORLD') { fullEditor = false; setViewMode('SPLIT'); } fullEditor = !fullEditor; setViewMode(viewMode); if (fullEditor) { editor.view.requestMeasure(); editor.view.focus(); } else editor.view.contentDOM.blur(); }
function inspectRecord(fragment) {
  selectedFragment = fragment; const r = fragment.record;
  $('record-inscription').textContent = `${r.id} / ${r.evidenceStatus.toUpperCase()}\n${r.activity} / ${r.status} / ${r.observedAt}\n${r.compensation.value} ${r.compensation.currency} / ${r.paymentRegime}\n${r.provenance.reference}\n${fragment.id} / ${fragment.state} / ${fragment.derivationTraceId}`;
  $('record-inscription').hidden = false;
}
function focusPalette() { $('glyph-palette').querySelector('button').focus(); }
function reader() {
  if ($('trace-reader').open) { $('trace-reader').close(); return; }
  $('trace-json').textContent = JSON.stringify(fullRecord(), null, 2); $('trace-reader').showModal(); $('trace-json').focus();
}
function saveTraces() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(fullRecord(), null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `gaia-3x4-t${interpreter.world.tick}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.addEventListener('keydown', event => {
  if ($('trace-reader').open) {
    if (event.key === 'Escape') { event.preventDefault(); $('trace-reader').close(); }
    if (event.key.toLowerCase() === 's') { event.preventDefault(); saveTraces(); } return;
  }
  if (event.key === 'F2' && !legacy) { event.preventDefault(); toggleEditor(); return; }
  if (event.defaultPrevented || editor.view.hasFocus) return;
  if (!legacy && !event.altKey && !event.ctrlKey && !event.metaKey) {
    if (['ArrowRight', 'ArrowLeft'].includes(event.key)) { event.preventDefault(); score.navigate(event.key === 'ArrowRight' ? 1 : -1); return; }
    if (event.key === 'Enter') { event.preventDefault(); score.execute(); return; }
    if (['1', '2', '3'].includes(event.key)) { event.preventDefault(); if (inspector) toggleInspector(); setViewMode({ 1: 'SCORE', 2: 'WORLD', 3: 'SPLIT' }[event.key]); return; }
    if (['[', ']'].includes(event.key)) { event.preventDefault(); earth?.selectNext(event.key === ']' ? 1 : -1); return; }
    if (event.key === 'Escape') { $('record-inscription').hidden = true; return; }
  }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Enter') { event.preventDefault(); execute('all'); return; }
  if (event.altKey && event.key === 'Enter') { event.preventDefault(); step(); return; }
  if (event.key.toLowerCase() === 'p') { paused = !paused; readout(); }
  if (event.key.toLowerCase() === 't') { event.preventDefault(); reader(); }
  if (event.key.toLowerCase() === 'i') { event.preventDefault(); toggleInspector(); }
  if (event.code === 'Space') { event.preventDefault(); step(); }
  if (event.target.closest('#glyph-palette') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    const buttons = [...$('glyph-palette').children], index = buttons.indexOf(event.target);
    buttons[(index + (event.key === 'ArrowRight' ? 1 : 6)) % 7].focus(); event.preventDefault();
  }
});
window.addEventListener('resize', () => { if (inspector) render(); });
render(); synchronize(first);
setInterval(() => { if (!paused) step(); }, 1800);
window.gaia = Object.freeze({ inspect: () => interpreter.world.inspect(), observation: () => interpreter.observation,
  visual: () => earth?.inspect() ?? null,
  editor: Object.freeze({ setText: text => editor.setText(text), getText: () => editor.text,
    select(from, to = from) { editor.view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true }); editor.view.focus(); },
    coordsAt: pos => editor.view.coordsAtPos(pos), diagnostics: () => editor.diagnosticCount() }),
  get source() { return interpreter.source; }, get paused() { return paused; }, get diagnostic() { return draftError; },
  score: Object.freeze({ inspect: () => score?.inspect(), select: index => score?.select(index), nodes: () => scoreNodes(editor.text).map(n => ({ index: n.index, id: n.node.id, names: n.statement.names, line: n.statement.location.line })) }),
  get selectedFragment() { return selectedFragment; },
  get inspector() { return inspector; }, get cue() { return visualCue; } });
