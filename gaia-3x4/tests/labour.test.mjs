import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Interpreter } from '../src/runtime.mjs';
import { validateLabourInput } from '../src/labour.mjs';
import { scoreNodes, scorePatch, activeScoreNode } from '../surface/score.mjs';
import { labourObservation } from '../surface/observation.mjs';

const input = JSON.parse(readFileSync(new URL('../data/labour-demo.json', import.meta.url)));
const smoke = readFileSync(new URL('../examples/labour-smoke.gaia', import.meta.url), 'utf8');
const score = readFileSync(new URL('../examples/labour-score.gaia', import.meta.url), 'utf8');
function instrument() { const i = new Interpreter({ labourInput: input }); assert.equal(i.apply(smoke).ok, true); return i; }
function perform(i, name, source = score) {
  const index = scoreNodes(source).findIndex(n => n.statement.names.includes(name));
  const patch = scorePatch(i.source, source, index), result = i.apply(patch.source);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostic)); return result;
}
function open(i) { for (const name of ['trabalho', 'alvo', 'terra', 'abertura', 'cortina', 'retrato']) perform(i, name); }

test('labour input preserves explicit evidence, compensation regimes and provenance defensively', () => {
  const copy = structuredClone(input), i = new Interpreter({ labourInput: copy }); copy.records[0].status = 'rejected';
  assert.deepEqual(i.world.labourInput, input); assert.ok(Object.isFrozen(i.world.labourInput.records[0]));
  perform(instrument(), 'trabalho');
  const situated = instrument(); perform(situated, 'trabalho');
  const field = situated.world.fields.get('trabalho');
  assert.equal(field.labour.records.length, 6); assert.deepEqual(field.labour.evidenceStatuses, ['synthetic']);
  assert.equal(field.provenance.filter(p => p.recordId).length, 6);
  assert.deepEqual(field.labour.records.map(r => r.paymentRegime), input.records.map(r => r.paymentRegime));
  assert.deepEqual(field.value, Array(144).fill(1));
});
test('input rejects unknown personal fields, duplicate IDs, precise locations and invalid evidence', () => {
  for (const edit of [r => { r.email = 'private@example.test'; }, r => { r.location.scale = 'address'; }, r => { r.evidenceStatus = 'factual'; }, r => { r.compensation.value = -1; }]) {
    const copy = structuredClone(input); edit(copy.records[0]); assert.throws(() => validateLabourInput(copy), { code: 'E_LABOUR_INPUT' });
  }
  const copy = structuredClone(input); copy.records[1].id = copy.records[0].id; assert.throws(() => validateLabourInput(copy));
});
test('synthetic provenance remains synthetic through relation, frame, trace and loss', () => {
  const i = instrument(); open(i); perform(i, 'perda');
  assert.ok(i.world.fields.get('terra').surface.records.every(r => r.evidenceStatus === 'synthetic'));
  assert.ok(i.world.bindings.get('corte').sourceProvenance.filter(p => p.recordId).every(p => p.evidenceStatus === 'synthetic'));
  assert.ok(i.world.bindings.get('perda').retainedRecords.every(r => r.evidenceStatus === 'synthetic'));
});
test('relate creates record-to-Earth support and every fragment has inspectable derivation', () => {
  const i = instrument(); assert.equal(i.world.fields.get('terra').surface, undefined);
  for (const name of ['trabalho', 'alvo', 'terra']) perform(i, name);
  const surface = i.world.fields.get('terra').surface;
  assert.equal(surface.fragments.length, 144); assert.equal(new Set(surface.fragments.map(f => f.id)).size, 144);
  assert.equal(surface.derivation.distinctRecordCount, 6); assert.equal(surface.derivation.repeatedFragmentsAreNotAdditionalRecords, true);
  for (const f of surface.fragments) {
    assert.equal(f.earthId, 'field:terra'); assert.equal(f.relationId, 'relation:terra');
    assert.ok(f.supports.some(s => s.sourceFieldId === 'field:trabalho'));
    assert.ok(input.records.some(r => r.id === f.recordIds[0]));
    assert.ok(i.world.traces.some(t => t.id === f.derivationTraceId && t.operation === 'relate'));
  }
});
test('changing relation parameters redistributes supported record identities and retains the old mapping', () => {
  const i = instrument(); open(i); const before = i.world.fields.get('terra').surface;
  perform(i, 'terra', score.replace('blend [1 0] trabalho', 'blend [1 2] trabalho'));
  const after = i.world.fields.get('terra').surface;
  assert.deepEqual(after.fragments.map(f => f.id), before.fragments.map(f => f.id));
  assert.notDeepEqual(after.fragments.map(f => f.recordIds), before.fragments.map(f => f.recordIds));
  assert.ok(i.world.traces.some(t => t.surface === before));
});
test('trace opening requires an observed real historical relate trace', () => {
  const i = instrument(); for (const name of ['trabalho', 'terra']) perform(i, name);
  assert.equal(labourObservation(i.observation, i.world.traces).exposed, false);
  perform(i, 'abertura'); const view = i.world.bindings.get('abertura'), image = labourObservation(i.observation, i.world.traces);
  assert.equal(image.exposed, true); assert.equal(image.openingTraceId, view.latest.id);
  assert.ok(view.latest.surface.fragments.length === 144); assert.ok(i.world.traces.some(t => t.id === view.accessTraceId && t.operation === 'trace'));
});
test('frame returns included/excluded fragment identities, viewpoint, source records and causal chain', () => {
  const i = instrument(); open(i); const cut = i.world.bindings.get('corte');
  assert.equal(cut.includedFragmentIds.length, 108); assert.equal(cut.excludedFragmentIds.length, 36);
  assert.equal(new Set([...cut.includedFragmentIds, ...cut.excludedFragmentIds]).size, 144);
  assert.equal(cut.sourceRecordIds.length, 6); assert.equal(cut.projection.kind, 'ranked-orthographic-relational');
  assert.deepEqual(cut.viewpoint.position, [0, 0, 12]); assert.equal(cut.tick, i.world.tick); assert.equal(cut.revision, i.world.revisions.length);
  assert.deepEqual(i.world.fields.get('retrato').surface.fragments.map(f => f.id), cut.includedFragmentIds);
  assert.ok(cut.chain.includes('ranked-orthographic-projection'));
});
test('live framing changes legible work, retains prior partition and historical trace', () => {
  const i = instrument(); open(i); const before = i.world.bindings.get('corte');
  perform(i, 'retrato', score.replace('3:4 0.5 0.5', '3:4 0 0.5')); const edited = i.world.bindings.get('corte'); perform(i, 'anterior');
  const after = i.world.bindings.get('corte'); assert.notDeepEqual(before.includedFragmentIds, after.includedFragmentIds);
  assert.ok(i.world.traces.includes(before)); assert.equal(i.world.bindings.get('anterior').latest.id, edited.id);
  assert.deepEqual(before.retainedSurface.fragments.map(f => f.id), i.world.snapshots.get(before.tick).fields.get('terra').surface.fragments.map(f => f.id));
});
test('discard propagates to all supported fragments, preserves snapshots and never silently restores', () => {
  const i = instrument(); open(i); const before = i.world.fields.get('terra'), tick = i.world.tick;
  const supported = before.surface.fragments.filter(f => f.recordIds.includes('work-demo03')).map(f => f.id);
  perform(i, 'perda'); const after = i.world.fields.get('terra'), loss = i.world.bindings.get('perda');
  assert.equal(supported.length, 24); assert.deepEqual(after.surface.fragments.filter(f => f.state === 'discarded').map(f => f.id), supported);
  assert.equal(loss.loss.supportedFragmentCount, 24); assert.equal(loss.loss.distinctRecordCount, 1);
  assert.deepEqual([...loss.fragmentIds].sort(), [...supported].sort()); assert.equal(i.world.fields.get('alvo').value, null);
  for (const field of [i.world.fields.get('retrato'), i.world.fields.get('fora')]) assert.ok(field.surface.fragments.filter(f => f.recordIds.includes('work-demo03')).every(f => f.state === 'discarded'));
  assert.equal(i.world.snapshots.get(tick).fields.get('terra'), before);
  assert.equal(before.surface.fragments.filter(f => f.state === 'discarded').length, 0);
  assert.equal(i.step().ok, true); assert.equal(i.world.fields.get('terra').surface.fragments.filter(f => f.state === 'discarded').length, 24);
});
test('remember brings pre-loss fragments as a ghost alongside the damaged current Earth', () => {
  const i = instrument(); open(i); const completeTick = i.world.tick;
  perform(i, 'perda'); perform(i, 'anterior'); perform(i, 'antes');
  assert.equal(i.world.bindings.get('antes').requestedTick, completeTick);
  const before = JSON.stringify(i.world.inspect()), image = labourObservation(i.observation, i.world.traces);
  assert.equal(image.ghosts.length, 144); assert.equal(image.fragments.filter(f => f.state === 'discarded').length, 24);
  assert.ok(image.ghosts.every(f => f.state === 'remembered')); assert.equal(JSON.stringify(i.world.inspect()), before);
  const ghostOnly = labourObservation(i.world.observe(['antes', 'perda']), i.world.traces);
  assert.equal(ghostOnly.ghosts.length, 144); assert.equal(ghostOnly.fragments.length, 0); assert.equal(ghostOnly.records.length, 6);
  for (let k = 0; k < 5; k++) assert.equal(i.step().ok, true);
  assert.equal(i.world.bindings.get('antes').requestedTick, completeTick);
  assert.equal(labourObservation(i.observation, i.world.traces).ghosts.length, 144);
  assert.equal(i.world.fields.get('terra').surface.fragments.filter(f => f.state === 'discarded').length, 24);
});
test('observation changes visible layers without mutating the persistent world or loss ledger', () => {
  const i = instrument(); open(i); perform(i, 'perda'); const before = JSON.stringify(i.world.inspect());
  const selected = i.world.observe(['terra', 'fora', 'perda']), image = labourObservation(selected, i.world.traces);
  assert.equal(image.ghosts.length, 0); assert.equal(JSON.stringify(i.world.inspect()), before); assert.ok(Object.isFrozen(selected));
});
test('Score executes the same parsed operation/block and transaction as full-source editor execution', () => {
  const a = instrument(), b = instrument();
  const index = scoreNodes(score).findIndex(n => n.statement.names.includes('trabalho'));
  const patch = scorePatch(a.source, score, index), result = a.apply(patch.source), full = b.apply(patch.source);
  assert.equal(result.ok, true); assert.equal(full.ok, true); assert.deepEqual(a.world.inspect(), b.world.inspect());
  assert.ok(result.execution.operations.some(op => op.id === 'situate' && op.names.includes('trabalho')));
  assert.deepEqual(a.observation.entries.map(e => e.name), ['solo', 'trabalho', 'discurso']);
  const execution = result.execution.operations.find(op => op.names.includes('trabalho'));
  assert.equal(patch.mapLocation(execution.location).line, scoreNodes(score)[index].node.location.line);
});
test('invalid labour edit rolls back causal supports, provenance, loss ledger and program; last valid program advances', () => {
  const i = instrument(); open(i); const before = JSON.stringify(i.world.inspect()), source = i.source;
  assert.equal(i.apply(source.replace('"work-demo01"', '"work-unknown"')).ok, false);
  assert.equal(JSON.stringify(i.world.inspect()), before); assert.equal(i.source, source); assert.equal(i.step().ok, true);
});

test('Score highlights the actual nested AST address and refuses to mark unexecuted edited operands as drawn', () => {
  const source = 'a = ⊙ "s" "t" "c" "d" [1 1] [1]\nb = ⇄ transfer [] a ⊙ "s2" "t" "c" "d" [1 1] [1]\n◉ [b]\n';
  const i = new Interpreter(), result = i.apply(source); assert.equal(result.ok, true);
  const current = scoreNodes(source)[1], nested = result.execution.operations.find(op => op.id === 'situate' && op.location.line === 2);
  const cue = { ...nested, line: nested.location.line, column: nested.location.column, statement: current.range.text.trimEnd() };
  assert.equal(activeScoreNode(current, cue).id, 'situate');
  assert.equal(activeScoreNode(current, cue).location.column, nested.location.column);
  assert.equal(activeScoreNode(scoreNodes(source.replace('"s2"', '"s3"'))[1], cue), null);
  assert.equal(activeScoreNode(current, { ...cue, column: 1 }), null);
});
