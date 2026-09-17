import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { artifacts, browserSession, until } from './browser-session.mjs';

const session = await browserSession();
const report = { timestamp: new Date().toISOString(), browser: session.executable, checks: {}, captures: [] };

async function shot(name) { await session.screenshot(name); report.captures.push(name); }
const hashExpression = `(()=>{const data=document.getElementById('living-portrait').toDataURL();let h=2166136261;for(const c of data)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h.toString(16)})()`;

async function state() {
  return session.evaluate(`({world:gaia.inspect(),visual:gaia.visual(),source:gaia.source,draft:gaia.editor.getText(),hash:${hashExpression}})`);
}

async function applyAndPause(source) {
  return session.evaluate(`(async()=>{gaia.editor.setText(${JSON.stringify(source)});const result=await gaia.run('all');gaia.pause();return {ok:result.ok,diagnostic:result.diagnostic,world:gaia.inspect(),visual:gaia.visual(),hash:${hashExpression}}})()`);
}

try {
  await session.cdp('Page.navigate', { url: session.url });
  await until(() => session.evaluate('Boolean(window.gaia?.ready)'), 'CONTINUOUS WORLD não iniciou');
  const startup = await state();
  assert.equal(startup.world.tick, 0);
  assert.equal(startup.world.clock.state, 'stopped');
  assert.equal(startup.visual.state, 'blank');
  assert.match(startup.draft, /chuva = situate/);
  assert.equal(documentedStatements(startup.draft), 7);
  report.checks.startup = startup;
  await shot('continuous-01-empty.png');

  const first = await session.evaluate(`(async()=>{const result=await gaia.run('all');gaia.pause();return {ok:result.ok,world:gaia.inspect(),visual:gaia.visual(),hash:${hashExpression}}})()`);
  assert.equal(first.ok, true);
  assert.equal(first.world.clock.state, 'paused');
  assert.equal(first.world.revisions.length, 1);
  assert.equal(first.world.relations['relation:aproximacao'].active, true);
  assert.equal(first.visual.organismLifecycle.state, 'emerging');
  assert.equal(first.visual.recordCount, 4);
  assert.equal(first.visual.causalClaim, false);
  report.checks.firstInstallation = first;
  await shot('continuous-02-emergence.png');

  const freeze = await session.evaluate(`(async()=>{const before={tick:gaia.inspect().tick,time:gaia.inspect().clock.logicalTime,hash:${hashExpression}};await new Promise(r=>setTimeout(r,350));return {before,after:{tick:gaia.inspect().tick,time:gaia.inspect().clock.logicalTime,hash:${hashExpression}}}})()`);
  assert.deepEqual(freeze.after, freeze.before);
  const stepped = await session.evaluate(`(async()=>{const before=gaia.inspect();await gaia.step();const after=gaia.inspect();return {beforeTick:before.tick,afterTick:after.tick,beforeTime:before.clock.logicalTime,afterTime:after.clock.logicalTime,state:after.clock.state}})()`);
  assert.equal(stepped.afterTick, stepped.beforeTick + 1);
  assert.equal(stepped.afterTime, stepped.beforeTime + 0.125);
  assert.equal(stepped.state, 'paused');
  report.checks.pauseAndStep = { freeze, stepped };

  const autonomous = await session.evaluate(`(async()=>{const before={tick:gaia.inspect().tick,revision:gaia.inspect().revisions.length,traces:gaia.inspect().traces.length,hash:${hashExpression}};gaia.play();const result=await gaia.advance(1.375);gaia.pause();const after=gaia.inspect();return {steps:result.steps,before,after:{tick:after.tick,revision:after.revisions.length,traces:after.traces.length,hash:${hashExpression}},visual:gaia.visual()}})()`);
  assert.equal(autonomous.steps, 11);
  assert.equal(autonomous.after.tick, autonomous.before.tick + 11);
  assert.equal(autonomous.after.revision, autonomous.before.revision);
  assert.equal(autonomous.after.traces, autonomous.before.traces);
  assert.notEqual(autonomous.after.hash, autonomous.before.hash);
  assert.equal(autonomous.visual.organismLifecycle.state, 'present');
  report.checks.autonomousContinuation = autonomous;
  await shot('continuous-03-running.png');

  const baseline = await session.evaluate('gaia.editor.getText()');
  const relationEdit = baseline.replace('[0.32 0]', '[0.82 1]');
  const beforeRelation = await state();
  const installed = await applyAndPause(relationEdit);
  const process = installed.world.relations['relation:aproximacao'];
  assert.equal(installed.ok, true);
  assert.equal(process.id, beforeRelation.world.relations['relation:aproximacao'].id);
  assert.equal(installed.world.fields.aproximacao.id, beforeRelation.world.fields.aproximacao.id);
  assert.deepEqual(process.temporal.currentParameters, [0.32, 0]);
  assert.deepEqual(process.temporal.targetParameters, [0.82, 1]);
  assert.equal(process.temporal.state, 'interpolating');
  const halfway = await session.evaluate(`(async()=>{gaia.play();const result=await gaia.advance(1);gaia.pause();return {steps:result.steps,world:gaia.inspect(),visual:gaia.visual(),hash:${hashExpression}}})()`);
  assert.equal(halfway.steps, 8);
  assert.ok(Math.abs(halfway.world.relations['relation:aproximacao'].temporal.interpolationProgress - 0.5) < 1e-12);
  assert.deepEqual(halfway.world.relations['relation:aproximacao'].temporal.currentParameters, [0.57, 0.5]);
  report.checks.compatiblePerturbation = { before: beforeRelation, installed, halfway };
  await shot('continuous-04-parameter-interpolation.png');

  const invalidDraft = relationEdit.replace('frame 3:4', 'frame 99:1');
  const invalid = await applyAndPause(invalidDraft);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.diagnostic.code, 'E_FRAME_EMPTY');
  assert.equal(invalid.world.tick, halfway.world.tick);
  const afterInvalid = await session.evaluate(`(async()=>{const valid=gaia.source,before=gaia.inspect();gaia.play();const advanced=await gaia.advance(.25);gaia.pause();return {valid,steps:advanced.steps,beforeTick:before.tick,after:gaia.inspect(),diagnostic:gaia.diagnostic}})()`);
  assert.equal(afterInvalid.steps, 2);
  assert.equal(afterInvalid.after.tick, afterInvalid.beforeTick + 2);
  assert.equal(afterInvalid.after.revisions.length, halfway.world.revisions.length);
  assert.equal(afterInvalid.diagnostic.code, 'E_FRAME_EMPTY');
  assert.equal(afterInvalid.valid, relationEdit);
  report.checks.invalidDraftContinuation = afterInvalid;

  const frameEdit = relationEdit.replace('frame 3:4 0.5 0.5', 'frame 3:4 0.5 0');
  const moved = await applyAndPause(frameEdit);
  assert.equal(moved.ok, true);
  assert.equal(moved.visual.frameTransition.state, 'moving');
  const moving = await session.evaluate(`(async()=>{gaia.play();await gaia.advance(.75);gaia.pause();return {world:gaia.inspect(),visual:gaia.visual(),hash:${hashExpression}}})()`);
  assert.ok(Math.abs(moving.visual.frameTransition.progress - 0.5) < 1e-12);
  assert.deepEqual(moving.visual.frameTransition.currentAnchor, [0.5, 0.25]);
  assert.ok(moving.visual.frameTransition.timeline.length > 1);
  report.checks.processualFrame = { installed: moved, moving };
  await shot('continuous-05-moving-frame.png');

  const variants = [
    { label: 'Aegopsis bolboceridus', shift: 1, x: 0.5, y: 0 },
    { label: 'Pterandra pyroidea', shift: 0, x: 0.5, y: 0 },
    { label: 'Callicore sorana', shift: 0, x: 0, y: 0 },
    { label: 'Cybistax antisyphilitica', shift: 0, x: 0.5, y: 0.5 },
  ];
  const reached = {};
  for (const variant of variants) {
    const source = baseline.replace('[0.32 0]', `[0.32 ${variant.shift}]`)
      .replace('frame 3:4 0.5 0.5', `frame 3:4 ${variant.x} ${variant.y}`);
    const result = await applyAndPause(source);
    assert.equal(result.ok, true);
    await session.evaluate(`(async()=>{gaia.play();await gaia.advance(2);gaia.pause()})()`);
    const visual = await session.evaluate('gaia.visual()');
    assert.equal(visual.speciesOrTaxon, variant.label);
    reached[variant.label] = { observationId: visual.observationId, shift: variant.shift, frame: [variant.x, variant.y] };
  }
  assert.equal(new Set(Object.values(reached).map(item => item.observationId)).size, 4);
  report.checks.fourReachableOrganisms = reached;

  const current = await session.evaluate('gaia.editor.getText()');
  const discardedSource = current.replace('# ausencia = discard', 'ausencia = discard');
  const discarded = await applyAndPause(discardedSource);
  assert.equal(discarded.ok, true);
  assert.equal(discarded.visual.state, 'absent');
  assert.equal(discarded.visual.lossTransition.state, 'withdrawing');
  assert.equal(discarded.visual.lossTransition.progress, 0);
  const lossId = discarded.world.fields.retrato.lossId;
  await shot('continuous-06-withdrawal-start.png');
  const withdrawing = await session.evaluate(`(async()=>{gaia.play();await gaia.advance(.75);gaia.pause();return {world:gaia.inspect(),visual:gaia.visual(),hash:${hashExpression}}})()`);
  assert.ok(Math.abs(withdrawing.visual.lossTransition.progress - 0.5) < 1e-12);
  assert.equal(withdrawing.world.fields.retrato.value, null);
  assert.equal(withdrawing.world.fields.retrato.lossId, lossId);
  await shot('continuous-07-withdrawal-half.png');
  const absent = await session.evaluate(`(async()=>{gaia.play();await gaia.advance(.75);gaia.pause();return {world:gaia.inspect(),visual:gaia.visual(),hash:${hashExpression}}})()`);
  assert.equal(absent.visual.lossTransition.state, 'absent-record');
  assert.equal(absent.world.traces.filter(trace=>trace.operation==='discard').length, 1);
  assert.equal(absent.world.sourceObservations['inaturalist-observations-brasilia-v0'].records.length, 4);
  report.checks.progressiveAbsence = { discarded, withdrawing, absent };
  await shot('continuous-08-absence-record.png');

  const modes = await session.evaluate(`(()=>{const before=gaia.inspect(),result={};for(const mode of ['data','inspector','living']){gaia.setMode(mode);result[mode]=gaia.mode}const after=gaia.inspect();return {result,before:{tick:before.tick,time:before.clock.logicalTime},after:{tick:after.tick,time:after.clock.logicalTime}}})()`);
  assert.deepEqual(modes.result, { data: 'data', inspector: 'inspector', living: 'living' });
  assert.deepEqual(modes.after, modes.before);
  const presentation = await session.evaluate(`(()=>{document.getElementById('present').click();return {enabled:document.body.classList.contains('presentation'),header:getComputedStyle(document.querySelector('header')).display,editor:getComputedStyle(document.querySelector('.score-space')).display,world:getComputedStyle(document.querySelector('.field-space')).display}})()`);
  assert.equal(presentation.enabled, true);
  assert.equal(presentation.header, 'none');
  assert.notEqual(presentation.editor, 'none');
  assert.notEqual(presentation.world, 'none');
  report.checks.modesAndPresentation = { modes, presentation };
  await shot('continuous-09-presentation.png');

  await session.evaluate(`(()=>{gaia.pause();gaia.editor.select(0);document.querySelector('.cm-content').focus()})()`);
  await session.key(' ', 'Space');
  const editorShortcut = await session.evaluate('gaia.inspect().clock.state');
  assert.equal(editorShortcut, 'paused');
  await session.evaluate(`document.getElementById('play').focus()`);
  await session.key(' ', 'Space');
  const globalShortcut = await session.evaluate(`(()=>{const state=gaia.inspect().clock.state;gaia.pause();return state})()`);
  assert.equal(globalShortcut, 'running');
  report.checks.shortcuts = { editorShortcut, globalShortcut };

  const beforeResize = await state();
  await session.cdp('Emulation.setDeviceMetricsOverride', { width: 1180, height: 900, deviceScaleFactor: 1, mobile: false });
  await until(() => session.evaluate("document.getElementById('living-portrait').width > 0"), 'canvas não respondeu ao resize');
  const afterResize = await state();
  assert.equal(afterResize.world.tick, beforeResize.world.tick);
  assert.equal(afterResize.world.clock.logicalTime, beforeResize.world.clock.logicalTime);
  const resources = await session.evaluate(`performance.getEntriesByType('resource').map(entry=>entry.name)`);
  assert.ok(resources.every(url => new URL(url).origin === session.url));
  report.checks.resizeAndOffline = { tick: afterResize.world.tick, resources: resources.length };

  await session.cdp('Page.navigate', { url: session.url });
  await until(() => session.evaluate('Boolean(window.gaia?.ready)'), 'recarregamento não reiniciou a aplicação');
  const reloaded = await state();
  assert.equal(reloaded.world.tick, 0);
  assert.equal(reloaded.world.clock.logicalTime, 0);
  assert.equal(reloaded.world.clock.state, 'stopped');
  assert.equal(reloaded.visual.state, 'blank');
  report.checks.reloadStartsEmpty = { tick: reloaded.world.tick, clock: reloaded.world.clock, visual: reloaded.visual.state };

  assert.deepEqual(session.errors, []);
  report.console = { errors: session.errors, warnings: session.warnings };
  report.checks = {
    startup: { tick: startup.world.tick, clock: startup.world.clock, visual: startup.visual.state, executableLines: 7 },
    firstInstallation: { tick: first.world.tick, revision: first.world.revisions.length,
      relationId: first.world.relations['relation:aproximacao'].id, organism: first.visual.speciesOrTaxon,
      lifecycle: first.visual.organismLifecycle, recordCount: first.visual.recordCount },
    pauseAndStep: report.checks.pauseAndStep,
    autonomousContinuation: { steps: autonomous.steps, before: autonomous.before, after: autonomous.after,
      lifecycle: autonomous.visual.organismLifecycle },
    compatiblePerturbation: { fieldId: installed.world.fields.aproximacao.id, relationId: process.id,
      start: process.temporal.startParameters, target: process.temporal.targetParameters,
      halfway: halfway.world.relations['relation:aproximacao'].temporal },
    invalidDraftContinuation: { code: afterInvalid.diagnostic.code, steps: afterInvalid.steps,
      beforeTick: afterInvalid.beforeTick, afterTick: afterInvalid.after.tick, revision: afterInvalid.after.revisions.length },
    processualFrame: { start: moved.visual.frameTransition, halfway: moving.visual.frameTransition,
      selected: moving.visual.speciesOrTaxon },
    fourReachableOrganisms: reached,
    progressiveAbsence: { lossId, start: discarded.visual.lossTransition,
      halfway: withdrawing.visual.lossTransition, end: absent.visual.lossTransition,
      retainedRecords: absent.world.sourceObservations['inaturalist-observations-brasilia-v0'].records.length },
    modesAndPresentation: { modes, presentation }, shortcuts: { editorShortcut, globalShortcut },
    resizeAndOffline: { beforeTick: beforeResize.world.tick, afterTick: afterResize.world.tick, resources: resources.length },
    reloadStartsEmpty: report.checks.reloadStartsEmpty,
  };
  await writeFile(join(artifacts, 'continuous-verification.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, captures: report.captures, clock: absent.world.clock,
    organisms: report.checks.fourReachableOrganisms, console: report.console }, null, 2));
} finally {
  await session.close();
}

function documentedStatements(source) {
  return source.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#')).length;
}
