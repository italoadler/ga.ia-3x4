import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { artifacts, browserSession, until } from './browser-session.mjs';

const session = await browserSession();
const report = { timestamp: new Date().toISOString(), browser: session.executable, checks: {}, captures: [] };

async function viewportShot(name) {
  const result = await session.cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(artifacts, name), Buffer.from(result.data, 'base64'));
  report.captures.push(name);
}

async function fullShot(name) { await session.screenshot(name); report.captures.push(name); }

try {
  await session.cdp('Page.navigate', { url: session.url });
  await until(() => session.evaluate('Boolean(window.gaia?.ready)'), 'GA.IA não iniciou');
  const startup = await session.evaluate(`({
    tick: gaia.inspect().tick, visual: gaia.visual(), earthCanvas: Boolean(document.querySelector('#earth-canvas')),
    editor: { visible: document.querySelector('.cm-editor').getBoundingClientRect().height > 300,
      text: gaia.editor.getText(), aria: document.querySelector('.cm-editor').getAttribute('aria-label') },
    runVisible: document.getElementById('run').getBoundingClientRect().width > 0,
  })`);
  assert.equal(startup.tick, 0); assert.equal(startup.visual.state, 'blank'); assert.equal(startup.visual.dataDerived, false);
  assert.equal(startup.earthCanvas, false); assert.equal(startup.editor.visible, true); assert.match(startup.editor.text, /territorio_brasilia = source/);
  assert.match(startup.editor.text, /frame 3:4/); assert.equal(startup.runVisible, true);
  report.checks.startup = startup;
  await fullShot('data-born-01-startup-blank.png');
  await session.evaluate(`document.querySelector('.score-space').scrollIntoView({block:'start'}); const text = gaia.editor.getText(); gaia.editor.select(text.indexOf('territorio_brasilia'))`);
  await viewportShot('data-born-02-readable-editor.png');
  await session.evaluate('scrollTo(0,0)');

  const first = await session.evaluate('gaia.run("all").then(result => ({ok: result.ok, diagnostic: result.diagnostic}))');
  assert.equal(first.ok, true);
  await until(() => session.evaluate('gaia.visual().state === "observed" && gaia.inspect().tick === 1'), 'Primeira observação não apareceu');
  const observed = await session.evaluate(`({ visual: gaia.visual(), source: gaia.sourceObservation(),
    provenance: gaia.inspect().fields.territorio_brasilia.provenance[0], sourceState: document.getElementById('source-state').textContent })`);
  assert.equal(observed.visual.drawnCells, 12); assert.equal(observed.visual.excludedIndices.length, 16);
  assert.equal(observed.source.status, 'captured-real'); assert.equal(observed.provenance.originalSource, observed.source.source.requestUrl);
  report.checks.firstObservation = observed;
  await fullShot('data-born-03-first-observation.png');

  const edited = await session.evaluate(`(async () => {
    window.__gaiaWorld = gaia.world();
    const next = gaia.editor.getText().replace('[0.35 1]', '[0.72 2]');
    gaia.editor.setText(next); const at = next.indexOf('campo_precipitacao'); gaia.editor.select(at + 4);
    const result = await gaia.run('selection');
    return { ok: result.ok, sameWorld: window.__gaiaWorld === gaia.world(), tick: gaia.inspect().tick,
      relation: gaia.inspect().relations['relation:campo_precipitacao'].parameters,
      visual: gaia.visual(), trace: gaia.observation().entries.find(entry => entry.name === 'anterior').value };
  })()`);
  assert.equal(edited.ok, true); assert.equal(edited.sameWorld, true); assert.equal(edited.tick, 2);
  assert.deepEqual(edited.relation, [.72, 2]); assert.ok(edited.visual.historicalTraceId); assert.equal(edited.trace.available, true);
  report.checks.parameterEdit = edited;
  await fullShot('data-born-04-parameter-edit-trace.png');

  const live = await session.evaluate(`(async () => {
    gaia.editor.setText(gaia.editor.getText().replace('NASA POWER / captured', 'NASA POWER / live'));
    const result = await gaia.run('all');
    return { ok: result.ok, diagnostic: result.diagnostic, status: gaia.sourceObservation()?.status,
      retrievedAt: gaia.sourceObservation()?.retrieval.retrievedAt, tick: gaia.inspect().tick };
  })()`);
  assert.equal(live.ok, true); assert.equal(live.status, 'live'); assert.equal(live.tick, 3);
  report.checks.liveQuery = live;
  await session.evaluate(`document.getElementById('provenance-toggle').click()`);
  const provenance = await session.evaluate(`({open: !document.getElementById('provenance').hidden,
    text: document.getElementById('provenance').textContent, status: document.getElementById('source-state').textContent})`);
  assert.equal(provenance.open, true); assert.match(provenance.text, /STATUS       LIVE/); assert.match(provenance.text, /ORIGINAL     https:\/\/power\.larc\.nasa\.gov/);
  report.checks.provenance = provenance;
  await fullShot('data-born-05-live-provenance.png');

  const removed = await session.evaluate(`(async () => {
    gaia.editor.setText(gaia.editor.getText().replace('# ausencia = discard', 'ausencia = discard'));
    const result = await gaia.run('all');
    return { ok: result.ok, tick: gaia.inspect().tick, visual: gaia.visual(), losses: gaia.visual().absentIndices.length,
      exterior: gaia.visual().excludedIndices.length, lossRecord: gaia.inspect().traces.findLast(trace => trace.operation === 'discard') };
  })()`);
  assert.equal(removed.ok, true); assert.equal(removed.visual.state, 'absent'); assert.equal(removed.losses, 12);
  assert.equal(removed.exterior, 16); assert.equal(removed.lossRecord.parameters.reason, 'resultado explicitamente excluído');
  report.checks.removal = removed;
  await fullShot('data-born-06-absence-residue.png');

  const rollback = await session.evaluate(`(async () => {
    const before = { tick: gaia.inspect().tick, source: gaia.source, visual: gaia.visual(), observation: JSON.stringify(gaia.observation()) };
    gaia.editor.setText(gaia.editor.getText().replace('frame 3:4', 'frame 99:1'));
    const result = await gaia.run('all');
    return { ok: result.ok, diagnostic: gaia.diagnostic, before,
      after: { tick: gaia.inspect().tick, source: gaia.source, visual: gaia.visual(), observation: JSON.stringify(gaia.observation()) },
      lint: gaia.editor.diagnostics() };
  })()`);
  assert.equal(rollback.ok, false); assert.equal(rollback.diagnostic.code, 'E_FRAME_EMPTY');
  assert.equal(rollback.after.tick, rollback.before.tick); assert.equal(rollback.after.source, rollback.before.source);
  assert.equal(rollback.after.observation, rollback.before.observation); assert.deepEqual(rollback.after.visual, rollback.before.visual);
  assert.ok(rollback.lint > 0); report.checks.rollback = rollback;

  await session.evaluate(`document.activeElement?.blur()`); await session.key('i', 'KeyI');
  const inspector = await session.evaluate(`({active: gaia.inspector, mainHidden: document.getElementById('territory-space').hidden,
    inspectorHidden: document.getElementById('inspector-space').hidden, canvasHeight: document.getElementById('field').height})`);
  assert.deepEqual(inspector, { active: true, mainHidden: true, inspectorHidden: false, canvasHeight: 520 });
  report.checks.inspector = inspector;
  assert.deepEqual(session.errors, []);
  report.console = { errors: session.errors, warnings: session.warnings };
  await writeFile(join(artifacts, 'data-born-verification.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally { await session.close(); }
