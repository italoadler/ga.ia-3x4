import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Interpreter } from '../src/runtime.mjs';
import { GLYPH_REGISTRY } from '../src/registry.mjs';
import { selectionPatch, statementRanges } from '../surface/selection.mjs';
import { portraitObservation } from '../surface/observation.mjs';

const source = await readFile(new URL('../examples/canonical.gaia', import.meta.url), 'utf8');
const start = () => { const i = new Interpreter(); assert.equal(i.apply(source).ok, true); return i; };
const project = i => portraitObservation(i.observation, i.world.traces);

test('one registry serves aliases, arity, documentation, shortcuts and interpreter implementations', () => {
  assert.equal(GLYPH_REGISTRY.length, 7);
  assert.deepEqual(GLYPH_REGISTRY.map(op => op.glyph), ['⊙', '⇄', '⧉', '↶', '⋮', '⊘', '◉']);
  for (const op of GLYPH_REGISTRY) {
    assert.equal(op.alias, op.id); assert.deepEqual(op.aliases, [op.id, op.glyph, ...(op.id === 'situate' ? ['source'] : [])]);
    assert.deepEqual(op.arity, { inputs: op.inputs, outputs: op.outputs });
    assert.ok(op.name && op.signature.includes('→') && op.documentation);
    assert.equal(typeof op.implementation, 'function'); assert.ok(Object.isFrozen(op));
  }
  assert.equal(new Set(GLYPH_REGISTRY.map(op => op.shortcut)).size, 7);
});

test('selected line patches the relation and propagates consequences in the same world', () => {
  const i = start(), world = i.world, a = world.fields.get('a'), relation = world.fields.get('vinculo').relationId;
  const draft = source.replace('[0.35 2]', '[0.75 3]');
  const patch = selectionPatch(i.source, draft, draft.indexOf('vinculo = '));
  assert.equal(patch.source, draft, 'Comments and unselected formatting survive a line execution.');
  assert.equal(i.apply(patch.source).ok, true);
  assert.equal(i.world, world); assert.equal(world.fields.get('a'), a);
  assert.equal(world.fields.get('vinculo').relationId, relation);
  assert.deepEqual(world.relations.get(relation).parameters, [.75, 3]);
  assert.equal(world.bindings.get('anterior').latest.tick, 1);
  assert.ok(i.execution.operations.some(op => op.id === 'frame'));
});

test('valid selected block excludes an unrelated invalid pending draft', () => {
  const i = start();
  const draft = source.replace('[0.35 2]', '[0.75 3]').replace('3:4 0.5 0.5', '3:4 0 0.5') + 'broken = ⧉\n';
  const patch = selectionPatch(i.source, draft, draft.indexOf('vinculo = '), draft.indexOf('antes = '));
  assert.equal(i.apply(patch.source).ok, true);
  assert.equal(i.source.includes('broken'), false);
  assert.equal(i.world.bindings.get('corte').parameters.bounds.x, 0);
  const frameOp = i.execution.operations.find(op => op.id === 'frame');
  assert.equal(patch.mapLocation(frameOp.location).line, statementRanges(draft).find(s => s.names.includes('corte')).line);
});

test('a cursor inside a multiline vector executes the whole declaration', () => {
  const i = start(), draft = source.replace('6 8 8 8', '7 8 8 8');
  const patch = selectionPatch(i.source, draft, draft.indexOf('7 8 8 8'));
  assert.equal(patch.selected.length, 1); assert.deepEqual(patch.selected[0].names, ['dados']);
  assert.equal(i.apply(patch.source).ok, true);
  assert.equal(i.world.fields.get('a').value[0], 7);
  assert.ok(i.world.traces.some(t => t.operation === 'situate' && t.action === 'value-edit'));
});

test('partial incompatible edits remain transactional, including execution focus', () => {
  const i = start(), before = JSON.stringify(i.world.inspect()), execution = i.execution;
  const draft = source.replace('registro/A', 'outro-registro');
  const patch = selectionPatch(i.source, draft, draft.indexOf('a = '));
  const result = i.apply(patch.source);
  assert.equal(result.diagnostic.code, 'E_INCOMPATIBLE_FIELD');
  assert.equal(JSON.stringify(i.world.inspect()), before);
  assert.equal(i.execution, execution);
});

test('partial execution cannot silently replace one output of a multi-output binding', () => {
  const draft = source.replace('retrato fora corte =', 'retrato residue corte =');
  assert.throws(() => selectionPatch(source, draft, draft.indexOf('retrato residue')), { code: 'E_PATCH_BINDING' });
});

test('a selected new discard is inserted before observe and removes the actual portrait', () => {
  const i = start(); i.step();
  const draft = source.replace('◉ [', 'ausencia = ⊘ "retirada do retrato" retrato\n◉ [');
  const patch = selectionPatch(i.source, draft, draft.indexOf('ausencia ='));
  assert.equal(i.apply(patch.source).ok, true);
  const view = project(i);
  assert.equal(view.included.length, 0); assert.equal(view.absentIndices.length, 108);
  assert.equal(view.excluded.length, 36); assert.equal(view.ghosts.length, 108);
  assert.ok(view.losses.some(loss => loss.sourceIds.includes('field:retrato')));
  assert.equal(i.world.snapshots.get(2).fields.get('retrato').discarded, false);
});

test('projection uses actual framing indices, historical states and selected observations without mutations', () => {
  const i = start(), before = JSON.stringify(i.world.inspect());
  const first = project(i);
  assert.equal(JSON.stringify(i.world.inspect()), before);
  assert.deepEqual(first.included.map(v => v.index), i.world.bindings.get('corte').includedIndices);
  assert.deepEqual(first.excluded.map(v => v.value), i.world.bindings.get('corte').retained.excluded.map(v => v.value));
  assert.equal(first.ghosts.length, 0);
  i.apply(source.replace('3:4 0.5 0.5', '3:4 0 0.5'));
  const next = project(i), memory = i.world.bindings.get('antes');
  assert.deepEqual(next.ghosts.map(v => v.index), memory.field.partition.sourceIndices);
  assert.deepEqual(next.ghosts.map(v => v.value), memory.field.value);
  assert.equal(next.historicalFrame, i.world.bindings.get('anterior').latest);
  const onlyOutside = portraitObservation(i.world.observe(['fora', 'corte']), i.world.traces);
  assert.equal(onlyOutside.included.length, 0); assert.equal(onlyOutside.ghosts.length, 0);
  assert.equal(onlyOutside.excluded.length, 36);
});

test('committed execution reports identify the semantic operation, source and consequences', () => {
  const i = start(), frame = i.execution.operations.find(op => op.id === 'frame');
  assert.deepEqual(frame.names, ['retrato', 'fora', 'corte']);
  assert.equal(frame.location.line, 13);
  assert.deepEqual(frame.traceIds, [i.world.bindings.get('corte').id]);
  assert.deepEqual(i.world.bindings.get('corte').sourceLocation, frame.location);
  assert.ok(Object.isFrozen(i.execution) && Object.isFrozen(frame));
  assert.equal(i.execution.operations.at(-1).id, 'observe');
});
