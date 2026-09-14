import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Interpreter, SituatedField, Relation, World } from '../src/runtime.mjs';
import { parse } from '../src/parser.mjs';
import { GLYPH_REGISTRY, normalizeOperation } from '../src/registry.mjs';

const canonical = await readFile(new URL('../examples/canonical.gaia', import.meta.url), 'utf8');
const start = (source = canonical) => {
  const interpreter = new Interpreter();
  const result = interpreter.apply(source);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostic));
  return interpreter;
};
const state = i => JSON.stringify(i.world.inspect());
const textual = source => GLYPH_REGISTRY.reduce((s, op) => s.replaceAll(op.glyph, op.id), source);

test('all seven glyphs and textual aliases normalize to ASCII semantic IDs', () => {
  assert.equal(GLYPH_REGISTRY.length, 7);
  for (const op of GLYPH_REGISTRY) {
    assert.match(op.id, /^[a-z]+$/);
    assert.equal(normalizeOperation(op.glyph), op.id);
    assert.equal(normalizeOperation(op.id), op.id);
    assert.equal(op.status, 'TESTING');
  }
  const glyph = start(), text = start(textual(canonical));
  assert.deepEqual(glyph.world.fields, text.world.fields);
  assert.deepEqual(glyph.world.relations, text.world.relations);
  assert.deepEqual(glyph.world.traces, text.world.traces);
});

test('runtime structures are first class; equal values do not collapse provenance', () => {
  const { world } = start();
  assert.ok(world instanceof World);
  const a = world.fields.get('a'), b = world.fields.get('b');
  assert.ok(a instanceof SituatedField);
  assert.ok(world.relations.get('relation:vinculo') instanceof Relation);
  assert.deepEqual(a.value, b.value);
  assert.notEqual(a.id, b.id);
  assert.notDeepEqual(a.provenance, b.provenance);
  assert.deepEqual(world.fields.get('vinculo').provenance.map(p => p.fieldId), [a.id, b.id]);
});

test('frame returns included, excluded and trace with linked identities and conserved cells', () => {
  const { world } = start();
  const input = world.fields.get('vinculo'), inside = world.fields.get('retrato'), outside = world.fields.get('fora'), trace = world.bindings.get('corte');
  assert.deepEqual(inside.shape, [9, 12]);
  assert.equal(inside.shape[0] / inside.shape[1], 3 / 4);
  assert.deepEqual(outside.shape, input.shape);
  assert.equal(inside.value.length, 108);
  assert.equal(outside.value.filter(v => v !== null).length, 36);
  assert.equal(inside.partition.counterpartId, outside.id);
  assert.equal(outside.partition.counterpartId, inside.id);
  assert.equal(inside.partition.traceId, trace.id);
  assert.equal(outside.partition.traceId, trace.id);
  assert.equal(trace.scale, input.scale);
  assert.deepEqual(trace.sourceIds, [input.id]);
  assert.deepEqual(trace.parameters.bounds, { x: 2, y: 0, width: 9, height: 12 });
  assert.equal(trace.consequence.resampled, false);
  assert.equal(trace.includedIndices.length + trace.excludedIndices.length, input.value.length);
  for (const index of trace.excludedIndices) assert.equal(outside.value[index], input.value[index]);
  const { minimum, maximum } = trace.normalization;
  trace.includedIndices.forEach((index, k) => assert.equal(inside.value[k], (input.value[index] - minimum) / (maximum - minimum)));
  assert.deepEqual(trace.retained.included, inside.value);
});

test('constant-field normalization is accountable, rather than NaN or a silent choice', () => {
  const i = start('a = situate "s" "t0" "cell" "grid" [3 4] [5 5 5 5 5 5 5 5 5 5 5 5]\nin out cut = frame 3:4 0 0 a\nobserve [in out cut]');
  assert.deepEqual(i.world.fields.get('in').value, Array(12).fill(0));
  assert.equal(i.world.bindings.get('cut').normalization.constant, true);
  assert.equal(i.world.bindings.get('cut').normalization.constantResult, 0);
});

test('numeric overflow during normalization is diagnosed and leaves the world intact', () => {
  const i = start(), before = state(i);
  const source = 'extreme = situate "s" "t0" "cell" "grid" [1 2] [-1e308 1e308]\nin out cut = frame 1:2 0 0 extreme\nobserve [in out cut]';
  assert.equal(i.apply(source).diagnostic.code, 'E_NORMALIZATION_RANGE');
  assert.equal(state(i), before);
});

test('discard removes a current value, records loss and does not resurrect on replay', () => {
  const i = start();
  const field = i.world.fields.get('amostra'), loss = i.world.bindings.get('perda');
  assert.equal(field.value, null);
  assert.equal(field.discarded, true);
  assert.equal(loss.operation, 'discard');
  assert.deepEqual(loss.sourceIds, [field.id]);
  assert.equal(loss.loss.count, 1);
  assert.equal(loss.loss.recoverableFromLossRecord, false);
  assert.equal(loss.parameters.reason, 'retirada explícita da amostra');
  assert.equal(i.step().ok, true);
  assert.equal(i.world.fields.get('amostra').value, null);
  assert.equal(i.world.bindings.get('perda').id, loss.id);
  assert.equal(i.world.traces.filter(t => t.operation === 'discard').length, 1);
  assert.equal(i.world.fields.get('fora').value.filter(v => v !== null).length, 36);
});

test('discard retains historical snapshots without changing an earlier field', () => {
  const beforeDiscard = canonical.replace('perda = ⊘ "retirada explícita da amostra" amostra', 'perda = amostra');
  const i = start(beforeDiscard), previous = i.world.fields.get('amostra');
  assert.equal(i.apply(canonical).ok, true);
  assert.deepEqual(previous.value, [9]);
  assert.equal(i.world.snapshots.get(1).fields.get('amostra'), previous);
  assert.equal(i.world.fields.get('amostra').value, null);
});

test('remember crosses exactly the requested tick boundary; absence is explicit', () => {
  const i = start();
  const missing = i.world.bindings.get('antes');
  assert.equal(missing.available, false);
  assert.equal(missing.requestedTick, 0);
  const first = i.world.fields.get('retrato');
  assert.equal(i.apply(canonical.replace('[0.35 2]', '[0.75 3]')).ok, true);
  const memory = i.world.bindings.get('antes');
  assert.equal(memory.available, true);
  assert.equal(memory.requestedTick, 1);
  assert.equal(memory.field, first);
  assert.notDeepEqual(memory.field.value, i.world.fields.get('retrato').value);
  assert.deepEqual(i.world.traces.find(t => t.id === memory.traceId).boundary, { from: 2, to: 1 });
});

test('remember cannot silently access the present', () => {
  const i = start(), before = state(i);
  assert.equal(i.apply(canonical.replace('↶ 1', '↶ 0')).diagnostic.code, 'E_TEMPORAL_BOUNDARY');
  assert.equal(state(i), before);
});

test('previous frame trace is accessible after a changed live revision', () => {
  const i = start(), first = i.world.bindings.get('corte');
  assert.equal(i.world.bindings.get('anterior').available, false);
  assert.equal(i.apply(canonical.replace('[0.35 2]', '[0.75 3]')).ok, true);
  const view = i.world.bindings.get('anterior');
  assert.equal(view.latest, first);
  assert.deepEqual(view.ids, [first.id]);
  assert.equal(view.latest.tick, 1);
  assert.equal(i.world.bindings.get('corte').tick, 2);
});

test('instantaneous causal cycles are rejected before any world mutation', () => {
  const i = start(), before = state(i);
  const cycle = 'a = relate blend [0.5 0] b b\nb = relate blend [0.5 0] a a';
  assert.equal(i.apply(cycle).diagnostic.code, 'E_CAUSAL_CYCLE');
  assert.equal(state(i), before);
  assert.throws(() => parse('a = relate blend [0.5 0] a a'), { code: 'E_CAUSAL_CYCLE' });
});

test('a delayed feedback edge uses a real prior snapshot', () => {
  const i = start(), old = i.world.fields.get('vinculo');
  const feedback = canonical.replace('⇄ blend [0.35 2] b a', '⇄ blend [0.5 0] b ↶ 1 vinculo');
  assert.equal(i.apply(feedback).ok, true);
  const relation = i.world.relations.get('relation:vinculo');
  assert.deepEqual(relation.temporalBehaviour, [{ mode: 'delayed', ticks: 1 }, { mode: 'instantaneous' }]);
  const b = i.world.fields.get('b');
  assert.deepEqual(i.world.fields.get('vinculo').value, old.value.map((v, j) => .5 * v + .5 * b.value[j]));
});

test('missing historical input cannot silently seed a numeric relation', () => {
  const i = new Interpreter();
  const feedback = canonical.replace('⇄ blend [0.35 2] b a', '⇄ blend [0.5 0] b ↶ 1 vinculo');
  assert.equal(i.apply(feedback).diagnostic.code, 'E_MEMORY_UNAVAILABLE');
  assert.equal(i.world.tick, 0);
  assert.equal(i.world.fields.size, 0);
});

test('compatible edits preserve world, field and relation identities and consequences', () => {
  const i = start(), world = i.world, a = world.fields.get('a'), relation = world.relations.get('relation:vinculo');
  assert.equal(i.apply(canonical.replace('[0.35 2]', '[0.75 3]')).ok, true);
  assert.equal(i.world, world);
  assert.equal(world.fields.get('a'), a);
  const edited = world.relations.get(relation.id);
  assert.equal(edited.id, relation.id);
  assert.equal(edited.revisionHistory.length, 2);
  assert.equal(edited.consequences.length, 2);
  assert.deepEqual(edited.consequences.slice(0, 1), relation.consequences);
  assert.equal(world.revisions.length, 2);
  assert.equal(world.snapshots.size, 3);
  assert.equal(world.fields.get('amostra').discarded, true);
});

test('ordinary ticks execute relations without creating program revisions', () => {
  const i = start();
  assert.equal(i.step().ok, true);
  assert.equal(i.world.tick, 2);
  assert.equal(i.world.revisions.length, 1);
  const relation = i.world.relations.get('relation:vinculo');
  assert.equal(relation.revisionHistory.length, 1);
  assert.equal(relation.consequences.length, 2);
});

test('incompatible provenance and shape edits produce diagnostics and rollback', () => {
  const i = start(), before = state(i);
  for (const source of [canonical.replace('registro/A', 'registro/outro'), canonical.replace('[12 12]', '[6 24]')]) {
    const result = i.apply(source);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.code, 'E_INCOMPATIBLE_FIELD');
    assert.match(result.diagnostic.message, /novo nome/);
    assert.equal(state(i), before);
  }
});

test('source value edits are compatible and retain an explicit before/after trace', () => {
  const i = start(), id = i.world.fields.get('a').id;
  const revised = canonical.replace(/dados = \[\s*\d+/, 'dados = [\n  0');
  assert.equal(i.apply(revised).ok, true);
  assert.equal(i.world.fields.get('a').id, id);
  const events = i.world.traces.filter(t => t.operation === 'situate' && t.action === 'value-edit');
  assert.equal(events.length, 2);
  assert.notEqual(events[0].beforeFingerprint, events[0].afterFingerprint);
});

test('invalid syntax leaves the last valid program and running world intact', () => {
  const i = start(), before = state(i), source = i.source, observation = i.observation;
  assert.equal(i.apply('retrato = ⧉').diagnostic.code, 'E_ARITY');
  assert.equal(state(i), before);
  assert.equal(i.source, source);
  assert.equal(i.observation, observation);
  assert.equal(i.step().ok, true);
  assert.equal(i.world.tick, 2);
});

test('runtime errors also rollback the complete transaction, including partial traces', () => {
  const i = start(), before = state(i);
  const result = i.apply(canonical.replace('3:4 0.5 0.5', '3:4 1.5 0.5'));
  assert.equal(result.diagnostic.code, 'E_ANCHOR');
  assert.equal(state(i), before);
});

test('observe is pure and returns an immutable projection of actual runtime bindings', () => {
  const i = start(), before = state(i);
  const view = i.world.observe(['a', 'fora', 'anterior']);
  assert.equal(state(i), before);
  assert.equal(view.entries[0].value, i.world.fields.get('a'));
  assert.ok(Object.isFrozen(view));
  assert.ok(Object.isFrozen(view.entries));
  assert.throws(() => { view.entries[0].value.value[0] = 99; }, TypeError);
  assert.equal(state(i), before);
});

test('omitting declarations retires material and relations with inspectable traces', () => {
  const i = start(), relationId = i.world.fields.get('vinculo').relationId;
  const source = canonical.replace('vinculo = ⇄ blend [0.35 2] b a', 'vinculo = a');
  assert.equal(i.apply(source).ok, true);
  assert.equal(i.world.relations.get(relationId).active, false);
  assert.equal(i.world.fields.get('vinculo').active, false);
  assert.ok(i.world.traces.some(t => t.operation === 'program-omission' && t.relationId === relationId));
  assert.equal(i.world.snapshots.get(1).relations, undefined);
  assert.equal(i.world.snapshots.get(1).fields.get('vinculo').active, true);
});

test('symbolic fields preserve provenance and can be transferred; numeric frame diagnoses them', () => {
  const source = 'a = situate "a" "t0" "cell" "grid" [1 1] ["marca"]\nb = situate "b" "t0" "cell" "grid" [1 1] ["outra"]\nx = relate transfer [] b a\nobserve [a b x]';
  const i = start(source);
  assert.deepEqual(i.world.fields.get('x').value, ['outra']);
  assert.equal(i.world.fields.get('x').provenance.length, 2);
  const before = state(i);
  assert.equal(i.apply(source.replace('observe [a b x]', 'in out cut = frame 1:1 0 0 x\nobserve [in out cut]')).diagnostic.code, 'E_NUMERIC_FRAME');
  assert.equal(state(i), before);
});

test('relations do not silently combine incompatible situated domains', () => {
  const i = new Interpreter();
  const source = 'a = situate "a" "t0" "cell" "grid-a" [1 1] [1]\nb = situate "b" "t0" "cell" "grid-b" [1 1] [1]\nx = relate blend [0.5 0] b a';
  assert.equal(i.apply(source).diagnostic.code, 'E_RELATION_SCHEMA');
  assert.equal(i.world.tick, 0);
  assert.equal(i.world.traces.length, 0);
});

test('right-to-left nested execution and top-to-bottom line execution are real', () => {
  const i = start('x = relate transfer [] situate "right" "t0" "cell" "grid" [1 1] [2] situate "left" "t0" "cell" "grid" [1 1] [1]\nobserve [x]');
  assert.deepEqual(i.world.traces.filter(t => t.operation === 'situate').map(t => t.parameters.source), ['left', 'right']);
  const bad = new Interpreter().apply('b = a\na = situate "a" "t0" "cell" "grid" [1 1] [1]');
  assert.equal(bad.diagnostic.code, 'E_ORDER');
});

test('parsing and execution are deterministic over revisions, ticks and errors', () => {
  assert.deepEqual(parse(canonical), parse(canonical));
  const a = start(), b = start();
  for (const source of [canonical.replace('[0.35 2]', '[0.75 3]'), 'a = "unterminated']) {
    assert.equal(a.apply(source).ok, b.apply(source).ok);
    assert.deepEqual(a.diagnostic, b.diagnostic);
  }
  a.step(); b.step();
  assert.equal(state(a), state(b));
});

test('diagnostics retain line/column and reject malformed vectors, duplicate names and unknown IDs', () => {
  const cases = [
    ['a = [1 2', 'E_VECTOR'], ['a = [1]\na = [2]', 'E_DUPLICATE'],
    ['a = missing', 'E_UNKNOWN'], ['a = trace forest', 'E_TRACE_ID'],
    ['a = 0:4', 'E_RATIO'], ['a = "x\\q"', 'E_ESCAPE'],
  ];
  for (const [source, code] of cases) {
    const result = new Interpreter().apply(source);
    assert.equal(result.diagnostic.code, code);
    assert.ok(result.diagnostic.line > 0);
    assert.ok(result.diagnostic.column > 0);
  }
});
