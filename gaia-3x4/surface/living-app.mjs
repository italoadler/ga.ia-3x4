import { parse } from '../src/parser.mjs';
import { Interpreter } from '../src/runtime.mjs';
import { GLYPH_REGISTRY, operation } from '../src/registry.mjs';
import { POWER_EXTERNAL_NAME, loadPowerObservation } from '../src/nasa-power.mjs';
import { INATURALIST_EXTERNAL_NAME, INATURALIST_SOURCE, loadInaturalistObservation } from '../src/inaturalist.mjs';
import { createEditor, createPalette } from './editor.mjs';
import { selectionPatch, statementRanges } from './selection.mjs';
import { convertOperationView } from './source-view.mjs';
import { renderField, renderHistory } from './render.mjs';
import { createTerritoryRenderer } from './territory.mjs';
import { createLivingRenderer } from './living.mjs';

const $ = id => document.getElementById(id);
const externalNames = [POWER_EXTERNAL_NAME, INATURALIST_EXTERNAL_NAME];
const example = await fetch('/examples/proof-continuous.gaia').then(response => {
  if (!response.ok) throw new Error('Partitura living portraits não encontrada.');
  return response.text();
});
const interpreter = new Interpreter();
let draftError = null, running = false, visualMode = 'living', sourceView = 'text';
let provenanceOpen = false, lastSourceStatus = 'NO OBSERVATION';
const livingRenderer = createLivingRenderer($('living-portrait'));
const territoryRenderer = createTerritoryRenderer($('territory-field'));
const editor = createEditor($('source'), example, {
  execute, step: () => execute('all'), change: markDraft, palette: focusPalette,
  inspector: () => setVisualMode('inspector'), externalNames,
  operationToken: entry => sourceView === 'glyph' ? entry.glyph : entry.id,
  selection: describeLine,
});
createPalette($('glyph-palette'), editor);

function sourceObservation(adapter) { return interpreter.world.sourceObservations.get(adapter) ?? null; }
const powerObservation = () => sourceObservation('nasa-power-daily-regional-v0');
const organismObservation = () => sourceObservation(INATURALIST_SOURCE.id);

function fullRecord() {
  return { work: 'GA.IA/3x4 — living portraits v0', glyphRegistry: GLYPH_REGISTRY,
    epistemicPosition: { relationship: 'situated computational approximation', causalClaim: false,
      imageRole: 'observation, not texture', nullMeaning: 'no selected record; not biological absence' },
    visualEncoding: { portrait: 'verified local observation photo → deliberate inner 3:4 crop',
      outside: 'the same photo bytes outside that crop → displaced spectral fragments',
      rain: 'NASA POWER field → restrained line witnesses over the portrait',
      ghost: 'runtime remember output → previous crop at low opacity',
      absence: 'runtime discard → open frame; source record and credits remain' },
    execution: interpreter.execution, observation: interpreter.observation,
    visual: livingRenderer.inspect(), dataVisual: territoryRenderer.inspect(), world: interpreter.world.inspect() };
}

function provenanceText() {
  const living = organismObservation(), power = powerObservation();
  if (!living) return 'NO OBSERVATION\nRUN attaches the captured response and verifies every local image.';
  const active = livingRenderer.inspect().observationId;
  const lines = [
    'RELATIONSHIP  SITUATED COMPUTATIONAL APPROXIMATION / NO CAUSAL CLAIM',
    `IMAGE ROLE    OBSERVATION / ${living.status.toUpperCase()} / ${living.records.length} RECORDS`,
    `SOURCE        ${living.source.provider} / ${living.source.requestUrl}`,
    `CAPTURED      ${living.retrieval.capturedAt}`,
    `RAW SHA-256   ${living.retrieval.sha256}`,
    `FIELD         ${power?.variable.id ?? 'NOT EXECUTED'} / ${power?.status.toUpperCase() ?? 'UNKNOWN'}`,
    '',
  ];
  for (const record of living.records) lines.push(
    `${record.observationId === active ? '▶' : ' '} ${record.id}`,
    `  TAXON       ${record.speciesOrTaxon} / ${record.taxon.iconicTaxon}`,
    `  PLACE/DATE  ${record.locality} / ${record.observedOn}`,
    `  OBSERVER    ${record.observer.name} (@${record.observer.login})`,
    `  PLATFORM    ${record.platform} / ${record.institution}`,
    `  ORIGINAL    ${record.originalUrl}`,
    `  PHOTO       ${record.image.photoId} / ${record.image.author} / ${record.image.license}`,
    `  CAPTURE     ${record.image.captureDate} / ${record.status}`,
    `  LOCAL       ${record.image.localPath}`,
    `  SHA-256     ${record.image.localSha256}`,
    '',
  );
  return lines.join('\n');
}

function describeLine({ line, operation: entry }) {
  $('line-explanation').textContent = entry
    ? `L${line} · ${entry.glyph} ${entry.name.toUpperCase()} — ${entry.plain}`
    : `L${line} · comentário ou declaração sem operação selecionada.`;
}

function currentPartitions() {
  const values = interpreter.observation.entries.map(entry => entry.value);
  return {
    inside: values.find(value => value?.kind === 'field' && value.partition?.role === 'included'),
    outside: values.find(value => value?.kind === 'field' && value.partition?.role === 'excluded'),
  };
}

function readout() {
  const world = interpreter.world, { inside, outside } = currentPartitions();
  const frame = world.traces.findLast(trace => trace.operation === 'frame' && trace.tick === world.tick)
    ?? world.traces.findLast(trace => trace.operation === 'frame');
  const loss = world.traces.findLast(trace => trace.operation === 'discard');
  const visual = livingRenderer.inspect();
  $('clock').textContent = `T ${String(world.tick).padStart(4, '0')}`;
  $('logical-time').textContent = `LT ${world.clock.logicalTime.toFixed(3).padStart(7, '0')}`;
  $('revision').textContent = `REV ${String(world.revisions.length).padStart(2, '0')}`;
  $('pulse').textContent = running ? 'VERIFYING SOURCES' : world.clock.state.toUpperCase();
  $('time-state').textContent = `${world.clock.state.toUpperCase()} / Δ ${world.clock.fixedTimestep.toFixed(3)} S`;
  $('inside-count').textContent = `${inside?.discarded ? 0 : inside?.partition?.sourceIndices?.length ?? 0} INSIDE`;
  $('outside-count').textContent = `${outside?.partition?.sourceIndices?.length ?? 0} OUTSIDE`;
  $('frame-id').textContent = frame ? `${frame.id} / ${frame.parameters.bounds.width}×${frame.parameters.bounds.height}` : 'NO FRAME TRACE';
  $('source-state').textContent = lastSourceStatus;
  $('diagnostic').textContent = draftError ? `${draftError.code} · L${draftError.line}:${draftError.column} · ${draftError.message}`
    : world.tick ? `COMMITTED · ${interpreter.execution.operations.length} OPERATIONS · WORLD OBJECT PRESERVED` : 'EDIT ONE VALUE, THEN USE RUN';
  $('diagnostic').classList.toggle('invalid', Boolean(draftError));
  $('loss-count').textContent = loss ? `${loss.id} / ${loss.loss.count} REMOVED VALUES` : 'NO DECLARED LOSS';
  $('history-readout').textContent = visual.ghostVisible ? '↶ PREVIOUS PORTRAIT VISIBLE' : frame ? `${world.traces.filter(trace => trace.operation === 'frame').length} FRAME TRACE(S)` : 'NO PREVIOUS STATE';
  $('organism-readout').textContent = visual.speciesOrTaxon ? `${visual.speciesOrTaxon} / ${visual.imageStatus}` : 'NO OBSERVED ORGANISM';
  const relation = [...world.relations.values()].find(item => item.name === 'aproximacao');
  $('active-relation').textContent = relation?.active ? `⇄ ${relation.id} / ${relation.temporal?.state.toUpperCase() ?? 'ACTIVE'}` : 'NO ACTIVE RELATION';
  $('relation-readout').textContent = relation
    ? `${relation.name}: ${relation.transformation} target [${relation.parameters.join(' ')}] / current [${relation.temporal.currentParameters.map(value => value.toFixed(3)).join(' ')}] / phase ${relation.temporal.phase.toFixed(3)} · situated computational approximation · no causal claim`
    : 'RELATION NOT EXECUTED';
  $('play').setAttribute('aria-pressed', String(world.clock.state === 'running'));
  $('pause').setAttribute('aria-pressed', String(world.clock.state === 'paused'));
  $('provenance').textContent = provenanceText();
  $('provenance-toggle').textContent = provenanceOpen ? 'CLOSE PROVENANCE' : `INSPECT PROVENANCE${organismObservation() ? ' / 4 VERIFIED IMAGES' : ''}`;
}

async function render() {
  territoryRenderer.update(interpreter.observation, interpreter.world.traces);
  await livingRenderer.update(interpreter.observation, interpreter.world.traces);
  if (visualMode === 'inspector') {
    renderField($('field'), interpreter.observation);
    const history = renderHistory($('history'), interpreter.world.traces, interpreter.world.tick);
    $('history-count').textContent = `${history.visible} OF ${history.total}`;
  }
  readout();
}

function markDraft() {
  if (interpreter.world.tick) lastSourceStatus = `DRAFT / LAST ${organismObservation()?.status.toUpperCase() ?? 'VALID WORLD'}`;
  readout();
}

function mapDiagnostic(error, patch) {
  const value = error?.toJSON ? error.toJSON() : error;
  return patch?.mapLocation && value?.line ? patch.mapLocation(value) : value;
}

function cue(result, patch) {
  const executed = patch ? result.execution.operations.findLast(item => {
    const mapped = patch.mapLocation(item.location);
    return patch.selected.some(statement => mapped.line >= statement.line && mapped.line < statement.line + statement.text.split('\n').length);
  }) : result.execution.operations.at(-1);
  if (!executed) return;
  const location = patch?.mapLocation(executed.location) ?? executed.location;
  const entry = operation(executed.id);
  const visualCue = { id: executed.id, glyph: entry.glyph, names: executed.names, line: location.line,
    column: location.column, traceIds: executed.traceIds, tick: interpreter.world.tick };
  editor.cue(visualCue); livingRenderer.setCue(visualCue);
  $('line-explanation').textContent = `L${location.line} · ${entry.glyph} ${entry.name.toUpperCase()} — ${entry.plain}`;
  $('consequence').textContent = `${entry.glyph} ${entry.name.toUpperCase()} / ${executed.names.join(' ') || 'OBSERVATION'} / ${executed.traceIds.join(' ') || `T ${interpreter.world.tick}`}`;
  $('glyph-palette').querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.operation === executed.id));
  readout();
}

async function execute(scope = 'all') {
  if (running) return { ok: false, diagnostic: { code: 'E_BUSY', message: 'Uma verificação já está em curso.', line: 1, column: 1 } };
  running = true; draftError = null; lastSourceStatus = 'VERIFYING NASA + iNATURALIST CAPTURES'; readout();
  let patch = null;
  try {
    if (scope === 'selection') {
      if (interpreter.source) patch = selectionPatch(interpreter.source, editor.text, editor.selection.from, editor.selection.to, { externalNames });
      else {
        const selected = statementRanges(editor.text).filter(statement => editor.selection.from === editor.selection.to
          ? editor.selection.from >= statement.from && editor.selection.from <= statement.to
          : statement.from < editor.selection.to && statement.to > editor.selection.from);
        if (selected.length) patch = { source: editor.text, selected, mapLocation: location => location };
      }
    }
    const candidate = patch?.source ?? editor.text;
    const program = parse(candidate, { externalNames });
    const [power, living] = await Promise.all([loadPowerObservation(program), loadInaturalistObservation(program)]);
    const result = interpreter.apply(candidate, { inputs: { [POWER_EXTERNAL_NAME]: power, [INATURALIST_EXTERNAL_NAME]: living } });
    if (!result.ok) {
      draftError = mapDiagnostic(result.diagnostic, patch);
      lastSourceStatus = `REFUSED / LAST ${organismObservation()?.status.toUpperCase() ?? 'BLANK WORLD'}`;
      editor.showDiagnostic(draftError); editor.cue(null); await render(); return result;
    }
    lastSourceStatus = `${power.status.toUpperCase()} NASA + ${living.status.toUpperCase()} IMAGES`;
    editor.showDiagnostic(null); await render(); cue(result, patch); return result;
  } catch (error) {
    if (!error?.code) throw error;
    draftError = mapDiagnostic(error, patch);
    lastSourceStatus = `REFUSED / LAST ${organismObservation()?.status.toUpperCase() ?? 'BLANK WORLD'}`;
    editor.showDiagnostic(draftError); editor.cue(null); await render();
    return { ok: false, diagnostic: draftError, world: interpreter.world };
  } finally { running = false; readout(); }
}

function focusPalette() { $('glyph-palette').querySelector('button')?.focus(); }

function setVisualMode(mode) {
  if (!['living', 'data', 'inspector'].includes(mode)) return;
  visualMode = mode;
  $('living-space').hidden = mode !== 'living'; $('territory-space').hidden = mode !== 'data'; $('inspector-space').hidden = mode !== 'inspector';
  $('mode').textContent = { living: 'LIVING PORTRAIT / 3:4', data: 'DATA / SITUATED FIELD', inspector: 'INSPECTOR / RUNTIME GRID' }[mode];
  $('backend').textContent = mode === 'living' ? 'CANVAS 2D / VERIFIED MEDIA' : 'CANVAS 2D / RUNTIME';
  $('mode-switch').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  if (mode === 'inspector') render();
}

function setSourceView(mode) {
  if (!['text', 'glyph'].includes(mode) || mode === sourceView) return;
  const selection = editor.selection;
  sourceView = mode; document.body.dataset.operationView = mode;
  editor.setText(convertOperationView(editor.text, mode));
  editor.view.dispatch({ selection: { anchor: Math.min(selection.anchor, editor.view.state.doc.length), head: Math.min(selection.head, editor.view.state.doc.length) } });
  document.querySelectorAll('[data-source-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sourceView === mode)));
}

function toggleProvenance() { provenanceOpen = !provenanceOpen; $('provenance').hidden = !provenanceOpen; readout(); }
function togglePresentation() {
  const enabled = document.body.classList.toggle('presentation');
  $('present').setAttribute('aria-pressed', String(enabled));
  render();
}
async function temporalStep() { interpreter.pause(); const result = interpreter.step(); if (result.ok) await render(); return result; }
function traceReader() {
  if ($('trace-reader').open) $('trace-reader').close();
  else { $('trace-json').textContent = JSON.stringify(fullRecord(), null, 2); $('trace-reader').showModal(); }
}

$('run').addEventListener('click', () => execute('all'));
$('play').addEventListener('click', () => { interpreter.play(); readout(); });
$('pause').addEventListener('click', () => { interpreter.pause(); readout(); });
$('step').addEventListener('click', temporalStep);
$('present').addEventListener('click', togglePresentation);
$('provenance-toggle').addEventListener('click', toggleProvenance);
$('mode-switch').addEventListener('click', event => { const mode = event.target.closest('[data-mode]')?.dataset.mode; if (mode) setVisualMode(mode); });
document.querySelector('.source-tools').addEventListener('click', event => { const mode = event.target.closest('[data-source-view]')?.dataset.sourceView; if (mode) setSourceView(mode); });
document.addEventListener('keydown', event => {
  if ($('trace-reader').open) { if (event.key === 'Escape') { event.preventDefault(); $('trace-reader').close(); } return; }
  if (editor.view.hasFocus) return;
  const key = event.key.toLowerCase();
  if (event.key === ' ') { event.preventDefault(); interpreter.world.clock.state === 'running' ? interpreter.pause() : interpreter.play(); readout(); return; }
  if (event.key === '.') { event.preventDefault(); temporalStep(); return; }
  if (key === 'p') { event.preventDefault(); togglePresentation(); return; }
  if (key === 'i' || key === 'd' || key === 'l') { event.preventDefault(); setVisualMode({ i: 'inspector', d: 'data', l: 'living' }[key]); }
  if (key === 't') { event.preventDefault(); traceReader(); }
  if (key === 'f') { event.preventDefault(); document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
});
window.addEventListener('resize', () => { if (visualMode === 'inspector') render(); });
readout();

let lastWallTime = performance.now(), temporalRendering = false;
async function temporalLoop(now) {
  const elapsed = Math.min(.5, Math.max(0, (now - lastWallTime) / 1000));
  lastWallTime = now;
  if (!running) {
    const advanced = interpreter.advance(elapsed);
    if (advanced.steps && !temporalRendering) {
      temporalRendering = true;
      try { await render(); } finally { temporalRendering = false; }
    }
  }
  requestAnimationFrame(temporalLoop);
}
requestAnimationFrame(temporalLoop);

window.gaia = Object.freeze({
  ready: true, run: execute, inspect: () => interpreter.world.inspect(), observation: () => interpreter.observation,
  world: () => interpreter.world, visual: () => livingRenderer.inspect(), dataVisual: () => territoryRenderer.inspect(),
  sourceObservation, provenance: provenanceText, setMode: setVisualMode, setSourceView,
  play: () => { const state = interpreter.play(); readout(); return state; },
  pause: () => { const state = interpreter.pause(); readout(); return state; },
  step: temporalStep, advance: async seconds => { const result = interpreter.advance(seconds); if (result.steps) await render(); return result; },
  editor: Object.freeze({ setText: text => editor.setText(text), getText: () => editor.text,
    select(from, to = from) { editor.view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true }); editor.view.focus(); },
    diagnostics: () => editor.diagnosticCount(), statements: () => statementRanges(editor.text) }),
  get source() { return interpreter.source; }, get diagnostic() { return draftError; },
  get mode() { return visualMode; }, get operationView() { return sourceView; },
});
