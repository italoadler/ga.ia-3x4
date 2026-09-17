import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from '../src/parser.mjs';
import { Interpreter } from '../src/runtime.mjs';
import { POWER_EXTERNAL_NAME, POWER_FIXTURE_PATH, POWER_MANIFEST_PATH, loadPowerObservation } from '../src/nasa-power.mjs';
import { INATURALIST_EXTERNAL_NAME, INATURALIST_FIXTURE_PATH, INATURALIST_MANIFEST_PATH, loadInaturalistObservation } from '../src/inaturalist.mjs';
import { portraitObservation } from '../surface/observation.mjs';

const proof = await readFile(new URL('../examples/proof-continuous.gaia', import.meta.url), 'utf8');
const rendererSource = await readFile(new URL('../surface/living.mjs', import.meta.url), 'utf8');
const inatBytes = await readFile(new URL('../data/inaturalist/observations.raw.json', import.meta.url));
const inatManifest = JSON.parse(await readFile(new URL('../data/inaturalist/capture.json', import.meta.url), 'utf8'));
const powerText = await readFile(new URL('../data/nasa-power-brasilia-2025-01-15.raw.json', import.meta.url), 'utf8');
const powerManifest = JSON.parse(await readFile(new URL('../data/nasa-power-brasilia-2025-01-15.capture.json', import.meta.url), 'utf8'));
const externalNames = [POWER_EXTERNAL_NAME, INATURALIST_EXTERNAL_NAME];

async function fixtureFetch(input) {
  if (input === INATURALIST_FIXTURE_PATH) return new Response(inatBytes, { status: 200 });
  if (input === INATURALIST_MANIFEST_PATH) return new Response(JSON.stringify(inatManifest), { status: 200 });
  const media = inatManifest.records.find(record => record.localPath === input);
  if (media) return new Response(await readFile(new URL(`..${media.localPath}`, import.meta.url)), { status: 200 });
  if (input === POWER_FIXTURE_PATH) return new Response(powerText, { status: 200 });
  if (input === POWER_MANIFEST_PATH) return new Response(JSON.stringify(powerManifest), { status: 200 });
  throw new Error(`Unexpected fixture URL: ${input}`);
}

const parsedProof = parse(proof, { externalNames });
const [power, living] = await Promise.all([
  loadPowerObservation(parsedProof, { fetchImpl: fixtureFetch }),
  loadInaturalistObservation(parsedProof, { fetchImpl: fixtureFetch }),
]);
const inputs = { [POWER_EXTERNAL_NAME]: power, [INATURALIST_EXTERNAL_NAME]: living };

function start(source = proof, options = {}) {
  const interpreter = new Interpreter(options);
  const result = interpreter.apply(source, { inputs });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostic));
  return interpreter;
}

const relation = interpreter => interpreter.world.relations.get('relation:aproximacao');

test('continuous proof has seven executable lines and starts one persistent situated process', () => {
  assert.equal(parsedProof.statements.length, 7);
  const interpreter = start();
  assert.equal(interpreter.world.clock.state, 'running');
  assert.equal(relation(interpreter).active, true);
  assert.equal(relation(interpreter).temporal.continuous, true);
  assert.equal(relation(interpreter).temporal.state, 'active');
  assert.equal(interpreter.world.revisions.length, 1);
});

test('fixed timestep is deterministic across wall-time chunking and pause does not reset the world', () => {
  const a = start(undefined, { fixedTimestep: 0.125 });
  const b = start(undefined, { fixedTimestep: 0.125 });
  a.pause();
  const pausedTick = a.world.tick, pausedPhase = relation(a).temporal.phase;
  assert.equal(a.advance(4).steps, 0);
  assert.equal(a.world.tick, pausedTick);
  assert.equal(relation(a).temporal.phase, pausedPhase);
  assert.equal(a.step().ok, true);
  assert.equal(a.world.tick, pausedTick + 1);
  assert.equal(a.world.clock.logicalTime, 0.125);
  a.play(); b.play();
  a.advance(0.875);
  b.advance(0.25); b.advance(0.125); b.advance(0.5);
  assert.equal(a.world.clock.logicalTime, b.world.clock.logicalTime + 0.125);
  assert.equal(a.world.clock.temporalTick, b.world.clock.temporalTick + 1);
  assert.equal(relation(a).temporal.phase, relation(b).temporal.phase + 0.125 / 6);
  const c = start(), d = start();
  c.advance(1.625);
  d.advance(0.01); d.advance(0.24); d.advance(0.501); d.advance(0.874);
  assert.equal(c.world.clock.temporalTick, d.world.clock.temporalTick);
  assert.equal(c.world.clock.logicalTime, d.world.clock.logicalTime);
  assert.equal(c.world.clock.accumulator, d.world.clock.accumulator);
  assert.equal(relation(c).temporal.phase, relation(d).temporal.phase);
});

test('the world continues without performer input and normal playback does not duplicate semantic traces', () => {
  const interpreter = start(), world = interpreter.world;
  const before = { tick: world.tick, revision: world.revisions.length, phase: relation(interpreter).temporal.phase, traces: world.traces.length };
  const advanced = interpreter.advance(12.5);
  assert.equal(advanced.steps, 100);
  assert.equal(interpreter.world, world);
  assert.equal(world.tick, before.tick + 100);
  assert.equal(world.revisions.length, before.revision);
  assert.notEqual(relation(interpreter).temporal.phase, before.phase);
  assert.equal(world.traces.length, before.traces);
  assert.ok(world.fields.get('retrato').partition.motion.timeline.length <= 24);
});

test('a compatible relation edit interpolates inside the same identities and revision', () => {
  const interpreter = start(), world = interpreter.world;
  const fieldId = world.fields.get('aproximacao').id, relationId = relation(interpreter).id;
  const edited = proof.replace('[0.32 0]', '[0.82 1]');
  assert.equal(interpreter.apply(edited, { inputs }).ok, true);
  assert.equal(interpreter.world, world);
  assert.equal(world.fields.get('aproximacao').id, fieldId);
  assert.equal(relation(interpreter).id, relationId);
  assert.deepEqual(relation(interpreter).temporal.currentParameters, [0.32, 0]);
  assert.deepEqual(relation(interpreter).temporal.targetParameters, [0.82, 1]);
  assert.equal(relation(interpreter).temporal.interpolationProgress, 0);
  interpreter.pause(); interpreter.advance(8);
  assert.equal(relation(interpreter).temporal.interpolationProgress, 0);
  interpreter.play();
  interpreter.advance(1);
  assert.equal(relation(interpreter).temporal.interpolationProgress, 0.5);
  assert.deepEqual(relation(interpreter).temporal.currentParameters, [0.57, 0.5]);
  interpreter.advance(1);
  assert.equal(relation(interpreter).temporal.state, 'active');
  assert.deepEqual(relation(interpreter).temporal.currentParameters, [0.82, 1]);
  assert.equal(world.revisions.length, 2);
});

test('an invalid edit rolls back while the last valid process remains resumable', () => {
  const interpreter = start(), validSource = interpreter.source, beforeTick = interpreter.world.tick;
  const invalid = proof.replace('[0.32 0]', '[1.2 0]');
  const rejected = interpreter.apply(invalid, { inputs });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.diagnostic.code, 'E_PARAMETERS');
  assert.equal(interpreter.source, validSource);
  assert.equal(interpreter.world.tick, beforeTick);
  assert.equal(interpreter.world.clock.state, 'running');
  assert.equal(interpreter.advance(0.25).steps, 2);
  assert.equal(interpreter.world.tick, beforeTick + 2);
});

test('frame edits move over logical time, retain a bounded trail and change runtime-selected identity', () => {
  const interpreter = start(), initial = portraitObservation(interpreter.observation, interpreter.world.traces);
  const edited = proof.replace('frame 3:4 0.5 0.5', 'frame 3:4 0 0');
  assert.equal(interpreter.apply(edited, { inputs }).ok, true);
  let projection = portraitObservation(interpreter.observation, interpreter.world.traces);
  assert.equal(projection.frameTemporal.state, 'moving');
  assert.deepEqual(projection.frameTemporal.currentAnchor, [0.5, 0.5]);
  assert.notEqual(projection.selectedRecordId, initial.selectedRecordId);
  assert.equal(projection.included.length + projection.excluded.length, 28);
  interpreter.advance(0.75);
  projection = portraitObservation(interpreter.observation, interpreter.world.traces);
  assert.ok(Math.abs(projection.frameTemporal.progress - 0.5) < 1e-12);
  assert.deepEqual(projection.frameTemporal.currentAnchor, [0.25, 0.25]);
  assert.ok(projection.frameTrail.length > 1);
  interpreter.advance(0.75);
  projection = portraitObservation(interpreter.observation, interpreter.world.traces);
  assert.equal(projection.frameTemporal.state, 'settled');
  assert.deepEqual(projection.frameTemporal.currentAnchor, [0, 0]);
  assert.notEqual(projection.selectedRecordId, initial.selectedRecordId);
});

test('a compatible ratio edit interpolates crop geometry while target partitions stay conserved', () => {
  const interpreter = start();
  const edited = proof.replace('frame 3:4 0.5 0.5', 'frame 1:1 0.5 0.5');
  assert.equal(interpreter.apply(edited, { inputs }).ok, true);
  let projection = portraitObservation(interpreter.observation, interpreter.world.traces);
  assert.equal(projection.frameTemporal.state, 'moving');
  assert.equal(projection.frameTemporal.currentBounds.width, 3);
  assert.equal(projection.included.length + projection.excluded.length, 28);
  interpreter.advance(0.75);
  projection = portraitObservation(interpreter.observation, interpreter.world.traces);
  assert.ok(Math.abs(projection.frameTemporal.currentBounds.width - 3.5) < 1e-12);
  interpreter.advance(0.75);
  projection = portraitObservation(interpreter.observation, interpreter.world.traces);
  assert.equal(projection.frameTemporal.currentBounds.width, 4);
  assert.equal(projection.frameTemporal.currentBounds.height, 4);
});

test('all four captured organisms are deterministically reachable through documented parameters', () => {
  const reached = new Map();
  for (const shift of [0, 1]) for (const x of [0, 0.5, 1]) for (const y of [0, 0.5, 1]) {
    const source = proof.replace('[0.32 0]', `[0.32 ${shift}]`).replace('frame 3:4 0.5 0.5', `frame 3:4 ${x} ${y}`);
    const interpreter = start(source);
    const selected = portraitObservation(interpreter.observation, interpreter.world.traces).selectedRecordId;
    if (selected && !reached.has(selected)) reached.set(selected, { shift, x, y });
  }
  assert.deepEqual([...reached.keys()].sort(), living.records.map(record => record.id).sort());
  for (const parameters of reached.values()) assert.deepEqual(parameters, { ...parameters });
});

test('emergence, memory, trace and progressive discard remain inspectable through time', () => {
  const interpreter = start();
  const initialLifecycle = interpreter.world.fields.get('organismos').lifecycle;
  assert.equal(initialLifecycle.state, 'emerging');
  interpreter.advance(1.5);
  assert.equal(interpreter.world.fields.get('organismos').lifecycle.state, 'present');
  const memory = interpreter.world.bindings.get('memoria');
  const history = interpreter.world.bindings.get('anterior');
  assert.equal(memory.temporal.state, 'present');
  assert.equal(history.temporal.observedAtTick, interpreter.world.tick);
  assert.ok(history.temporal.originTick < history.temporal.observedAtTick);
  assert.ok(history.ticks.includes(interpreter.world.tick));

  const discardedSource = interpreter.source.replace('# ausencia = discard', 'ausencia = discard');
  assert.equal(interpreter.apply(discardedSource, { inputs }).ok, true);
  const lossId = interpreter.world.fields.get('retrato').lossId;
  assert.equal(interpreter.world.fields.get('retrato').lossLifecycle.progress, 0);
  assert.equal(interpreter.world.bindings.get('ausencia').id, lossId);
  interpreter.advance(0.75);
  assert.ok(Math.abs(interpreter.world.fields.get('retrato').lossLifecycle.progress - 0.5) < 1e-12);
  assert.equal(interpreter.world.fields.get('retrato').value, null);
  assert.equal(interpreter.world.bindings.get('ausencia').id, lossId);
  interpreter.advance(0.75);
  assert.equal(interpreter.world.fields.get('retrato').lossLifecycle.state, 'absent-record');
  assert.equal(interpreter.world.traces.filter(trace => trace.operation === 'discard').length, 1);
  assert.ok(interpreter.world.snapshots.get(interpreter.world.fields.get('retrato').lossLifecycle.startedTick - 1));
  const lossTick = interpreter.world.fields.get('retrato').lossLifecycle.startedTick;
  const restoredDraft = discardedSource.replace('ausencia = discard', '# ausencia = discard');
  assert.equal(interpreter.apply(restoredDraft, { inputs }).ok, true);
  assert.equal(interpreter.world.fields.get('retrato').discarded, true);
  assert.equal(interpreter.world.fields.get('retrato').lossId, lossId);
  assert.equal(interpreter.world.traces.find(trace => trace.id === lossId).tick, lossTick);
});

test('observe remains a pure projection and does not advance logical time', () => {
  const interpreter = start(), tick = interpreter.world.tick, logicalTime = interpreter.world.clock.logicalTime;
  const first = interpreter.world.observe(['retrato', 'fora']);
  const second = interpreter.world.observe(['retrato', 'fora']);
  assert.deepEqual(first, second);
  assert.equal(interpreter.world.tick, tick);
  assert.equal(interpreter.world.clock.logicalTime, logicalTime);
  assert.throws(() => { first.entries.push(null); }, TypeError);
});

test('unobserved photos stay outside the projection and the renderer consumes runtime selection', () => {
  const withoutObserve = proof.replace(/observe \[[^\n]+\]/, '# observe withheld');
  const interpreter = start(withoutObserve);
  const projection = portraitObservation(interpreter.observation, interpreter.world.traces);
  assert.equal(interpreter.observation.entries.length, 0);
  assert.equal(projection.living, null);
  assert.equal(projection.selectedRecordId, null);
  assert.doesNotMatch(rendererSource, /function selectSituatedRecord|function selectRecord/);
  assert.match(rendererSource, /recordByIdentity\(living, projection\.selectedRecordId\)/);
  assert.match(rendererSource, /semanticSource: 'runtime-projection'/);
});

test('clock rejects invalid advances and fixed-step configuration', () => {
  assert.throws(() => new Interpreter({ fixedTimestep: 0 }), /positivo/);
  const interpreter = start();
  assert.throws(() => interpreter.advance(-1), /não negativa/);
  assert.throws(() => interpreter.advance(Number.NaN), /finita/);
});
