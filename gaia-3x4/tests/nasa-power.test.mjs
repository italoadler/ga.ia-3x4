import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parse } from '../src/parser.mjs';
import { Interpreter } from '../src/runtime.mjs';
import { portraitObservation } from '../surface/observation.mjs';
import { POWER_EXTERNAL_NAME, POWER_FIXTURE_PATH, POWER_MANIFEST_PATH, loadPowerObservation,
  normalizePowerResponse, powerRequestFromProgram, powerRequestUrl } from '../src/nasa-power.mjs';

const source = await readFile(new URL('../examples/data-born-earth.gaia', import.meta.url), 'utf8');
const rawText = await readFile(new URL('../data/nasa-power-brasilia-2025-01-15.raw.json', import.meta.url), 'utf8');
const raw = JSON.parse(rawText);
const manifest = JSON.parse(await readFile(new URL('../data/nasa-power-brasilia-2025-01-15.capture.json', import.meta.url), 'utf8'));
const program = () => parse(source, { externalNames: [POWER_EXTERNAL_NAME] });
const request = () => powerRequestFromProgram(program());
const normalized = (response = raw, mode = 'captured') => normalizePowerResponse(response, {
  mode, request: request(), requestUrl: powerRequestUrl(request()), retrievedAt: manifest.retrievedAt,
  httpStatus: 200, ...(mode === 'captured' ? { fixturePath: POWER_FIXTURE_PATH, capturedAt: manifest.retrievedAt, sha256: manifest.sha256 } : {}),
});

function fixtureFetch(input) {
  if (input === POWER_FIXTURE_PATH) return Promise.resolve(new Response(rawText, { status: 200, headers: { 'content-type': 'application/json' } }));
  if (input === POWER_MANIFEST_PATH) return Promise.resolve(new Response(JSON.stringify(manifest), { status: 200, headers: { 'content-type': 'application/json' } }));
  throw new Error(`Unexpected fixture URL: ${input}`);
}

test('NASA POWER capture is legitimate, checksummed and normalized from returned metadata', () => {
  assert.equal(manifest.httpStatus, 200);
  assert.equal(createHash('sha256').update(rawText).digest('hex'), manifest.sha256);
  assert.equal(manifest.requestUrl, powerRequestUrl(request()));
  const observation = normalized();
  assert.deepEqual(observation.shape, [4, 7]);
  assert.deepEqual(observation.space.longitudes, [-48.75, -48.125, -47.5, -46.875]);
  assert.deepEqual(observation.space.latitudes, [-17, -16.5, -16, -15.5, -15, -14.5, -14]);
  assert.deepEqual(observation.space.longitudeSteps, [.625, .625, .625]);
  assert.deepEqual(observation.space.latitudeSteps, [.5, .5, .5, .5, .5, .5]);
  assert.equal(Math.min(...observation.values), 2.39);
  assert.equal(Math.max(...observation.values), 35.82);
  assert.equal(observation.missing.length, 0);
  assert.deepEqual(observation.source.reportedSources, ['MERRA2']);
});

test('normalization preserves attribution and never invents unknown or missing values', () => {
  const changed = structuredClone(raw);
  changed.features[1].properties.parameter.PRECTOTCORR['20250115'] = changed.header.fill_value;
  changed.features.splice(0, 1);
  const observation = normalized(changed);
  assert.equal(observation.values[0], null);
  assert.equal(observation.values[1], null);
  assert.deepEqual(observation.missing, [
    { index: 0, status: 'missing', reason: 'grid-point-absent' },
    { index: 1, status: 'unknown', reason: 'source-fill-value', raw: -999 },
  ]);
  assert.equal(observation.source.provider, 'NASA POWER');
  assert.match(observation.source.requestUrl, /power\.larc\.nasa\.gov/);
  assert.match(observation.source.rights, /earthdata\.nasa\.gov/);
  assert.equal(observation.variable.unit, raw.parameters.PRECTOTCORR.units);
});

test('adapter distinguishes live transport from the captured-real fixture', async () => {
  const captured = await loadPowerObservation(program(), { fetchImpl: fixtureFetch });
  assert.equal(captured.mode, 'captured');
  assert.equal(captured.status, 'captured-real');
  assert.equal(captured.retrieval.sha256, manifest.sha256);
  let requested;
  const liveSource = source.replace('NASA POWER / captured', 'NASA POWER / live');
  const live = await loadPowerObservation(parse(liveSource, { externalNames: [POWER_EXTERNAL_NAME] }), {
    fetchImpl: async input => { requested = input; return new Response(rawText, { status: 200, headers: { 'content-type': 'application/json' } }); },
  });
  assert.equal(requested, manifest.requestUrl);
  assert.equal(live.mode, 'live');
  assert.equal(live.status, 'live');
  assert.equal('fixturePath' in live.retrieval, false);
  await assert.rejects(loadPowerObservation(program(), {
    fetchImpl: input => input === POWER_FIXTURE_PATH
      ? Promise.resolve(new Response(`${rawText} `, { status: 200 }))
      : Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 })),
  }), error => error.code === 'E_POWER_CAPTURE_INTEGRITY');
});

test('offline fixture executes end to end through textual source, runtime provenance and 3:4 frame', async () => {
  const observation = await loadPowerObservation(program(), { fetchImpl: fixtureFetch });
  const interpreter = new Interpreter();
  const result = interpreter.apply(source, { inputs: { [POWER_EXTERNAL_NAME]: observation } });
  assert.equal(result.ok, true);
  assert.equal(interpreter.world.sourceObservations.get(observation.adapter), observation);
  const territory = interpreter.world.fields.get('territorio_brasilia');
  assert.equal(territory.environment, observation);
  assert.equal(territory.provenance[0].status, 'captured-real');
  assert.equal(territory.provenance[0].originalSource, manifest.requestUrl);
  assert.deepEqual(interpreter.world.fields.get('retrato').shape, [3, 4]);
  assert.equal(interpreter.world.traces.find(trace => trace.operation === 'frame').normalization.knownCount, 12);
  assert.equal(portraitObservation(interpreter.observation, interpreter.world.traces).environment, observation);
});

test('source textual alias and the original situate glyph remain equivalent', () => {
  const observation = normalized();
  const textInterpreter = new Interpreter(), glyphInterpreter = new Interpreter();
  assert.equal(textInterpreter.apply(source, { inputs: { [POWER_EXTERNAL_NAME]: observation } }).ok, true);
  const glyphSource = source.replace(' = source ', ' = ⊙ ');
  assert.equal(glyphInterpreter.apply(glyphSource, { inputs: { [POWER_EXTERNAL_NAME]: observation } }).ok, true);
  assert.deepEqual(glyphInterpreter.world.fields.get('territorio_brasilia').value, textInterpreter.world.fields.get('territorio_brasilia').value);
  assert.deepEqual(glyphInterpreter.world.fields.get('retrato').value, textInterpreter.world.fields.get('retrato').value);
});

test('editing the data relation preserves world identity and exposes the previous frame trace', () => {
  const observation = normalized(), interpreter = new Interpreter();
  assert.equal(interpreter.apply(source, { inputs: { [POWER_EXTERNAL_NAME]: observation } }).ok, true);
  const world = interpreter.world, territoryId = world.fields.get('territorio_brasilia').id;
  const edited = source.replace('[0.35 1]', '[0.72 2]');
  assert.equal(interpreter.apply(edited, { inputs: { [POWER_EXTERNAL_NAME]: observation } }).ok, true);
  assert.equal(interpreter.world, world);
  assert.equal(world.fields.get('territorio_brasilia').id, territoryId);
  assert.deepEqual(world.relations.get('relation:campo_precipitacao').parameters, [.72, 2]);
  const history = interpreter.observation.entries.find(entry => entry.name === 'anterior').value;
  assert.equal(history.available, true);
  assert.equal(history.latest.operation, 'frame');
  assert.equal(portraitObservation(interpreter.observation, world.traces).historicalFrame.id, history.latest.id);
});

test('explicit result removal leaves a loss record, empty portrait and exterior residue', () => {
  const observation = normalized(), interpreter = new Interpreter();
  assert.equal(interpreter.apply(source, { inputs: { [POWER_EXTERNAL_NAME]: observation } }).ok, true);
  const removed = source.replace('# ausencia = discard', 'ausencia = discard');
  assert.equal(interpreter.apply(removed, { inputs: { [POWER_EXTERNAL_NAME]: observation } }).ok, true);
  const projection = portraitObservation(interpreter.observation, interpreter.world.traces);
  assert.equal(interpreter.world.fields.get('retrato').discarded, true);
  assert.equal(projection.included.length, 0);
  assert.equal(projection.absentIndices.length, 12);
  assert.equal(projection.excluded.length, 16);
  assert.ok(projection.excluded.every(item => typeof item.value === 'number'));
  assert.equal(projection.losses.at(-1).parameters.reason, 'resultado explicitamente excluído');
});

test('invalid environmental edit rolls back source observation, fields, tick and last source', () => {
  const observation = normalized(), interpreter = new Interpreter();
  assert.equal(interpreter.apply(source, { inputs: { [POWER_EXTERNAL_NAME]: observation } }).ok, true);
  const before = interpreter.world.inspect(), committedSource = interpreter.source;
  const result = interpreter.apply(source.replace('frame 3:4', 'frame 9:1'), { inputs: { [POWER_EXTERNAL_NAME]: observation } });
  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.code, 'E_FRAME_EMPTY');
  assert.deepEqual(interpreter.world.inspect(), before);
  assert.equal(interpreter.source, committedSource);
});
