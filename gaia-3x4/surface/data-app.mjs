import { parse } from '../src/parser.mjs';
import { Interpreter } from '../src/runtime.mjs';
import { GLYPH_REGISTRY, operation } from '../src/registry.mjs';
import { POWER_EXTERNAL_NAME, loadPowerObservation } from '../src/nasa-power.mjs';
import { createEditor, createPalette } from './editor.mjs';
import { selectionPatch, statementRanges } from './selection.mjs';
import { renderField, renderHistory } from './render.mjs';
import { createTerritoryRenderer } from './territory.mjs';

const $ = id => document.getElementById(id);
const assetUrl = path => new URL(path.replace(/^\//, ''), document.baseURI).href;
const assetFetch = (resource, options) => fetch(typeof resource === 'string' && resource.startsWith('/') ? assetUrl(resource) : resource, options);
const example = await assetFetch('/examples/data-born-earth.gaia').then(response => {
  if (!response.ok) throw new Error('Exemplo data-born Earth não encontrado.');
  return response.text();
});
const interpreter = new Interpreter();
let draftError = null, running = false, inspector = false, provenanceOpen = false, lastSourceStatus = 'NO OBSERVATION';
const renderer = createTerritoryRenderer($('territory-field'));
const editor = createEditor($('source'), example, {
  execute, step: () => execute('all'), change: markDraft, palette: focusPalette, inspector: toggleInspector,
  externalNames: [POWER_EXTERNAL_NAME],
});
createPalette($('glyph-palette'), editor);

function sourceObservation() {
  return interpreter.world.sourceObservations.get('nasa-power-daily-regional-v0') ?? null;
}

function fullRecord() {
  return { work: 'GA.IA/3x4 — data-born Earth v0', glyphRegistry: GLYPH_REGISTRY,
    visualEncoding: { cells: 'runtime frame value → luminance, stem count and stem height',
      position: 'runtime source index → returned NASA POWER longitude/latitude grid position',
      outside: 'runtime excluded partition → displaced source-index witness',
      unknown: 'normalized null → open cell', history: 'observed prior frame trace → dashed level',
      absence: 'discarded included field → crossed empty cells; exterior remains' },
    execution: interpreter.execution, observation: interpreter.observation, visual: renderer.inspect(), world: interpreter.world.inspect() };
}

function provenanceText() {
  const observation = sourceObservation();
  if (!observation) return 'NO OBSERVATION\nRun the visible program to attach one source response.';
  const p = observation;
  return [
    `STATUS       ${p.status.toUpperCase()}`,
    `PROVIDER     ${p.source.provider}`,
    `REPORTED BY  ${p.source.reportedSources.join(', ') || 'UNKNOWN'}`,
    `VARIABLE     ${p.variable.id} — ${p.variable.longName} [${p.variable.unit}]`,
    `OBSERVED     ${p.time.start} / ${p.time.standard}`,
    `RETRIEVED    ${p.retrieval.retrievedAt}`,
    `GRID         ${p.shape.join(' × ')} / ${p.space.longitudeSteps.join(',')}° lon / ${p.space.latitudeSteps.join(',')}° lat`,
    `UNKNOWN      ${p.missing.length}`,
    `ORIGINAL     ${p.source.requestUrl}`,
    `ATTRIBUTION  ${p.source.attribution}`,
    `RIGHTS       ${p.source.rights}`,
    ...(p.retrieval.fixturePath ? [`FIXTURE      ${p.retrieval.fixturePath}`, `SHA-256      ${p.retrieval.sha256}`] : []),
  ].join('\n');
}

function readout() {
  const world = interpreter.world, values = interpreter.observation.entries.map(entry => entry.value);
  const inside = values.find(value => value?.partition?.role === 'included');
  const outside = values.find(value => value?.partition?.role === 'excluded');
  const frame = world.traces.findLast(trace => trace.operation === 'frame' && trace.tick === world.tick)
    ?? world.traces.findLast(trace => trace.operation === 'frame');
  const loss = world.traces.findLast(trace => trace.operation === 'discard');
  $('clock').textContent = `T ${String(world.tick).padStart(4, '0')}`;
  $('revision').textContent = `REV ${String(world.revisions.length).padStart(2, '0')}`;
  $('pulse').textContent = running ? 'QUERYING' : world.tick ? 'RUNNING' : 'WAITING';
  $('inside-count').textContent = `${inside?.discarded ? 0 : inside?.value?.filter(value => value !== null).length ?? 0} INSIDE`;
  $('outside-count').textContent = `${outside?.value?.filter(value => value !== null).length ?? 0} OUTSIDE`;
  $('frame-id').textContent = frame ? `${frame.id} / ${frame.normalization.knownCount ?? frame.retained.included.length} KNOWN` : 'NO FRAME TRACE';
  $('source-state').textContent = lastSourceStatus;
  $('diagnostic').textContent = draftError ? `${draftError.code} · L${draftError.line}:${draftError.column} · ${draftError.message}`
    : world.tick ? `COMMITTED · ${interpreter.execution.operations.length} OPERATIONS · WORLD OBJECT PRESERVED` : 'EDIT ONE VALUE, THEN USE RUN';
  $('diagnostic').classList.toggle('invalid', Boolean(draftError));
  $('loss-count').textContent = loss ? `${loss.id} / ${loss.loss.count} REMOVED VALUES` : 'NO DECLARED LOSS';
  $('history-readout').textContent = frame ? `${world.traces.filter(trace => trace.operation === 'frame').length} FRAME TRACE(S)` : 'NO PREVIOUS STATE';
  $('relation-readout').textContent = world.relations.size ? [...world.relations.values()].map(relation => `${relation.name}: ${relation.transformation} [${relation.parameters.join(' ')}]`).join(' · ') : 'RELATION NOT EXECUTED';
  $('provenance').textContent = provenanceText();
  $('provenance-toggle').textContent = provenanceOpen ? 'CLOSE PROVENANCE' : `INSPECT PROVENANCE${sourceObservation() ? ` / ${sourceObservation().status.toUpperCase()}` : ''}`;
}

function render() {
  renderer.update(interpreter.observation, interpreter.world.traces);
  if (inspector) {
    renderField($('field'), interpreter.observation);
    const history = renderHistory($('history'), interpreter.world.traces, interpreter.world.tick);
    $('history-count').textContent = `${history.visible} OF ${history.total}`;
  }
  readout();
}

function markDraft() {
  if (interpreter.world.tick) lastSourceStatus = `DRAFT / LAST ${sourceObservation()?.status.toUpperCase() ?? 'VALID WORLD'}`;
  readout();
}

function mapDiagnostic(error, patch) {
  const diagnostic = error?.toJSON ? error.toJSON() : error;
  return patch?.mapLocation && diagnostic?.line ? patch.mapLocation(diagnostic) : diagnostic;
}

function cue(result, patch) {
  const executed = result.execution.operations.at(-1);
  if (!executed) return;
  const location = patch?.mapLocation(executed.location) ?? executed.location;
  editor.cue({ id: executed.id, line: location.line, column: location.column,
    traceIds: executed.traceIds, tick: interpreter.world.tick });
  const entry = operation(executed.id);
  $('consequence').textContent = `${entry.glyph} ${entry.name.toUpperCase()} / ${executed.traceIds.join(' ') || 'OBSERVATION COMMITTED'} / T ${String(interpreter.world.tick).padStart(4, '0')}`;
  $('glyph-palette').querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.operation === executed.id));
}

async function execute(scope = 'all') {
  if (running) return { ok: false, diagnostic: { code: 'E_BUSY', message: 'Uma consulta já está em curso.', line: 1, column: 1 } };
  running = true; draftError = null; lastSourceStatus = 'QUERYING NASA POWER'; readout();
  let patch = null;
  try {
    if (scope === 'selection' && interpreter.source) patch = selectionPatch(interpreter.source, editor.text, editor.selection.from, editor.selection.to, { externalNames: [POWER_EXTERNAL_NAME] });
    const candidate = patch?.source ?? editor.text;
    const program = parse(candidate, { externalNames: [POWER_EXTERNAL_NAME] });
    const external = await loadPowerObservation(program, { fetchImpl: assetFetch });
    const result = interpreter.apply(candidate, { inputs: { [POWER_EXTERNAL_NAME]: external } });
    if (!result.ok) {
      draftError = mapDiagnostic(result.diagnostic, patch);
      lastSourceStatus = `REFUSED / LAST ${sourceObservation()?.status.toUpperCase() ?? 'BLANK WORLD'}`;
      editor.showDiagnostic(draftError); editor.cue(null); render(); return result;
    }
    lastSourceStatus = `${external.status.toUpperCase()} / ${external.variable.id} / ${external.time.start}`;
    editor.showDiagnostic(null); render(); cue(result, patch); return result;
  } catch (error) {
    if (!error?.code) throw error;
    draftError = mapDiagnostic(error, patch);
    lastSourceStatus = `REFUSED / LAST ${sourceObservation()?.status.toUpperCase() ?? 'BLANK WORLD'}`;
    editor.showDiagnostic(draftError); editor.cue(null); render();
    return { ok: false, diagnostic: draftError, world: interpreter.world };
  } finally { running = false; readout(); }
}

function focusPalette() { $('glyph-palette').querySelector('button')?.focus(); }

function toggleInspector() {
  inspector = !inspector;
  $('territory-space').hidden = inspector; $('inspector-space').hidden = !inspector;
  $('mode').textContent = inspector ? 'INSPECTOR / RUNTIME GRID' : 'DATA-BORN EARTH / 3:4 FIELD';
  if (inspector) render();
}

function toggleProvenance() {
  provenanceOpen = !provenanceOpen; $('provenance').hidden = !provenanceOpen; readout();
}

function traceReader() {
  if ($('trace-reader').open) $('trace-reader').close();
  else { $('trace-json').textContent = JSON.stringify(fullRecord(), null, 2); $('trace-reader').showModal(); }
}

$('run').addEventListener('click', () => execute('all'));
$('provenance-toggle').addEventListener('click', toggleProvenance);
document.addEventListener('keydown', event => {
  if ($('trace-reader').open) { if (event.key === 'Escape') { event.preventDefault(); $('trace-reader').close(); } return; }
  if (editor.view.hasFocus) return;
  if (event.key.toLowerCase() === 'i') { event.preventDefault(); toggleInspector(); }
  if (event.key.toLowerCase() === 't') { event.preventDefault(); traceReader(); }
});
window.addEventListener('resize', () => { if (inspector) render(); });
readout();

window.gaia = Object.freeze({
  ready: true, run: execute, inspect: () => interpreter.world.inspect(), observation: () => interpreter.observation,
  world: () => interpreter.world,
  visual: () => renderer.inspect(), sourceObservation, provenance: () => provenanceText(),
  editor: Object.freeze({ setText: text => editor.setText(text), getText: () => editor.text,
    select(from, to = from) { editor.view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true }); editor.view.focus(); },
    diagnostics: () => editor.diagnosticCount(), statements: () => statementRanges(editor.text) }),
  get source() { return interpreter.source; }, get diagnostic() { return draftError; }, get inspector() { return inspector; },
});
