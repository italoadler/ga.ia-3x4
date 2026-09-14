import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Interpreter } from '../src/runtime.mjs';

const source = await readFile(new URL('../examples/canonical.gaia', import.meta.url), 'utf8');
const interpreter = new Interpreter();
assert.equal(interpreter.apply(source).ok, true);
const world = interpreter.world;
const sourceId = world.fields.get('a').id;
const relationId = world.fields.get('vinculo').relationId;
const firstFrame = world.bindings.get('corte');
const firstPortrait = world.fields.get('retrato').value;
assert.deepEqual(world.fields.get('a').value, world.fields.get('b').value);
assert.notDeepEqual(world.fields.get('a').provenance, world.fields.get('b').provenance);
assert.equal(interpreter.apply(source.replace('[0.35 2]', '[0.75 3]')).ok, true);
assert.equal(world.fields.get('a').id, sourceId);
assert.equal(world.fields.get('vinculo').relationId, relationId);
assert.notDeepEqual(world.fields.get('retrato').value, firstPortrait);
assert.equal(world.bindings.get('anterior').latest.id, firstFrame.id);
assert.equal(world.bindings.get('antes').requestedTick, 1);
const before = JSON.stringify(world.inspect());
assert.equal(interpreter.apply('retrato = ⧉').ok, false);
assert.equal(JSON.stringify(world.inspect()), before);
assert.equal(interpreter.step().ok, true);
assert.equal(world.tick, 3);
console.log(JSON.stringify({
  tick: world.tick, revisions: world.revisions.length, sourceIds: [sourceId, world.fields.get('b').id],
  equalDataDistinctProvenance: true, relationId,
  relationRevisions: world.relations.get(relationId).revisionHistory.length,
  included: world.fields.get('retrato').shape,
  excludedCount: world.fields.get('fora').partition.sourceIndices.length,
  previousFrame: world.bindings.get('anterior').latest.id,
  discarded: world.fields.get('amostra').discarded,
  loss: world.bindings.get('perda').loss,
  invalidEditPreservedWorld: true, continuedAfterInvalidEdit: true,
  retainedTraces: world.traces.length,
}, null, 2));
