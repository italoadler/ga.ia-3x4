import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parse } from '../src/parser.mjs';
import { Interpreter } from '../src/runtime.mjs';
import { POWER_EXTERNAL_NAME, POWER_FIXTURE_PATH, POWER_MANIFEST_PATH, loadPowerObservation } from '../src/nasa-power.mjs';
import { INATURALIST_EXTERNAL_NAME, INATURALIST_FIXTURE_PATH, INATURALIST_MANIFEST_PATH,
  INATURALIST_SOURCE, inaturalistRequestUrl, loadInaturalistObservation } from '../src/inaturalist.mjs';
import { portraitObservation } from '../surface/observation.mjs';
import { convertOperationView, operationView } from '../surface/source-view.mjs';

const source = await readFile(new URL('../examples/living-portraits.gaia', import.meta.url), 'utf8');
const inatBytes = await readFile(new URL('../data/inaturalist/observations.raw.json', import.meta.url));
const inatManifest = JSON.parse(await readFile(new URL('../data/inaturalist/capture.json', import.meta.url), 'utf8'));
const powerText = await readFile(new URL('../data/nasa-power-brasilia-2025-01-15.raw.json', import.meta.url), 'utf8');
const powerManifest = JSON.parse(await readFile(new URL('../data/nasa-power-brasilia-2025-01-15.capture.json', import.meta.url), 'utf8'));
const program = value => parse(value, { externalNames: [POWER_EXTERNAL_NAME, INATURALIST_EXTERNAL_NAME] });

async function fixtureFetch(input) {
  if (input === INATURALIST_FIXTURE_PATH) return new Response(inatBytes, { status: 200, headers: { 'content-type': 'application/json' } });
  if (input === INATURALIST_MANIFEST_PATH) return new Response(JSON.stringify(inatManifest), { status: 200, headers: { 'content-type': 'application/json' } });
  const media = inatManifest.records.find(record => record.localPath === input);
  if (media) return new Response(await readFile(new URL(`..${media.localPath}`, import.meta.url)), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  if (input === POWER_FIXTURE_PATH) return new Response(powerText, { status: 200, headers: { 'content-type': 'application/json' } });
  if (input === POWER_MANIFEST_PATH) return new Response(JSON.stringify(powerManifest), { status: 200, headers: { 'content-type': 'application/json' } });
  throw new Error(`Unexpected fixture URL: ${input}`);
}

async function sources(value = source) {
  const parsed = program(value);
  const [power, living] = await Promise.all([
    loadPowerObservation(parsed, { fetchImpl: fixtureFetch }),
    loadInaturalistObservation(parsed, { fetchImpl: fixtureFetch }),
  ]);
  return { power, living };
}

test('iNaturalist capture keeps one exact response, four licensed media files and independent SHA-256 checks', async () => {
  assert.equal(inatManifest.requestUrl, inaturalistRequestUrl());
  assert.equal(createHash('sha256').update(inatBytes).digest('hex'), inatManifest.response.sha256);
  assert.equal(inatBytes.length, inatManifest.response.bytes);
  assert.equal(inatManifest.records.length, 4);
  for (const record of inatManifest.records) {
    const bytes = await readFile(new URL(`..${record.localPath}`, import.meta.url));
    assert.equal(bytes.length, record.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
    assert.ok(['cc0', 'cc-by'].includes(record.license));
    assert.ok(record.attribution);
  }
});

test('offline organism observation exposes complete per-image provenance without treating unselected cells as absence', async () => {
  const { living } = await sources();
  assert.equal(living.status, 'captured-real');
  assert.equal(living.records.length, 4);
  assert.deepEqual(living.records.map(record => record.taxon.iconicTaxon).sort(), ['Insecta', 'Insecta', 'Plantae', 'Plantae']);
  assert.equal(living.epistemic.causalClaim, false);
  assert.match(living.epistemic.absenceMeaning, /does not mean organism absence/);
  for (const record of living.records) {
    assert.match(record.id, /^inaturalist:observation:\d+$/);
    assert.equal(record.status, 'CAPTURED-REAL');
    assert.ok(record.speciesOrTaxon && record.locality && record.observedOn);
    assert.ok(record.observer.login && record.platform && record.institution && record.originalUrl);
    assert.ok(record.image.author && record.image.license);
    assert.equal(record.image.captureDate, inatManifest.capturedAt);
    assert.equal(record.image.license, 'CC-BY');
    assert.equal(record.image.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
    assert.equal(record.image.observedDate, record.observedOn);
    assert.match(record.image.localSha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(living.values.filter(Number.isFinite).reduce((sum, value) => sum + value, 0), 4);
  assert.equal(living.missing.length, 25);
});

test('media corruption is rejected before the organism observation enters the runtime', async () => {
  const first = inatManifest.records[0];
  await assert.rejects(loadInaturalistObservation(program(source), { fetchImpl: async input => {
    if (input === first.localPath) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    return fixtureFetch(input);
  } }), error => error.code === 'E_INAT_MEDIA_INTEGRITY');
});

test('rain and observed organisms remain semantically distinct through the non-causal situated relation', async () => {
  const { power, living } = await sources();
  const interpreter = new Interpreter();
  const result = interpreter.apply(source, { inputs: { [POWER_EXTERNAL_NAME]: power, [INATURALIST_EXTERNAL_NAME]: living } });
  assert.equal(result.ok, true);
  assert.notEqual(interpreter.world.fields.get('chuva').domain, interpreter.world.fields.get('organismos').domain);
  const relationTrace = interpreter.world.traces.find(trace => trace.operation === 'relate');
  assert.deepEqual(relationTrace.relationship, { kind: 'situated-computational-approximation', causal: false,
    context: 'bbox -49,-17,-46.5,-14', semantics: ['observed-organism-records', 'environmental-precipitation-field'] });
  assert.equal(interpreter.world.fields.get('aproximacao').observations.length, 2);
  assert.equal(interpreter.world.fields.get('retrato').observations.length, 2);
  const projected = portraitObservation(interpreter.observation, interpreter.world.traces);
  assert.equal(projected.environment, power); assert.equal(projected.living, living);
  assert.equal(projected.frame.normalization.knownCount, 2);
});

test('live framing exposes a previous-photo memory and discard leaves provenance while removing the current portrait', async () => {
  const { power, living } = await sources();
  const interpreter = new Interpreter(), inputs = { [POWER_EXTERNAL_NAME]: power, [INATURALIST_EXTERNAL_NAME]: living };
  assert.equal(interpreter.apply(source, { inputs }).ok, true);
  const edited = source.replace('frame 3:4 0.5 0.5', 'frame 3:4 0 0.5');
  assert.equal(interpreter.apply(edited, { inputs }).ok, true);
  let projected = portraitObservation(interpreter.observation, interpreter.world.traces);
  assert.ok(projected.memoryField); assert.equal(projected.memoryField.observations.length, 2);
  assert.ok(projected.historicalFrame); assert.equal(projected.historicalFrame.sourceObservations.length, 2);
  const removed = edited.replace('# ausencia = discard', 'ausencia = discard');
  assert.equal(interpreter.apply(removed, { inputs }).ok, true);
  projected = portraitObservation(interpreter.observation, interpreter.world.traces);
  assert.equal(projected.absentIndices.length, 12);
  assert.equal(projected.living.records.length, 4);
  assert.equal(interpreter.world.sourceObservations.get(INATURALIST_SOURCE.id), living);
});

test('textual and glyphic views keep one semantic program and do not rewrite strings or comments', () => {
  const glyphic = convertOperationView(source, 'glyph');
  assert.equal(operationView(source), 'text'); assert.equal(operationView(glyphic), 'glyph');
  assert.match(glyphic, /chuva = ⊙/); assert.match(glyphic, /aproximacao = ⇄/); assert.match(glyphic, /retrato fora recorte = ⧉/);
  assert.match(glyphic, /anterior = ⋮ ⧉/); assert.match(glyphic, /# ausencia = discard/);
  assert.match(glyphic, /"selected iNaturalist observation records"/);
  const restored = convertOperationView(glyphic, 'text');
  assert.equal(restored, source);
  assert.deepEqual(program(glyphic).statements.map(statement => statement.expressions[0].id),
    program(restored).statements.map(statement => statement.expressions[0].id));
});
