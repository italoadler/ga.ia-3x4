import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { artifacts, browserSession, until } from './browser-session.mjs';

const session = await browserSession();
const report = { timestamp: new Date().toISOString(), browser: session.executable, checks: {}, glyphs: {}, captures: [] };

async function shot(name) { await session.screenshot(name); report.captures.push(name); }

async function lineRun(needle, expected) {
  const before = await session.evaluate(`(() => { const data=document.getElementById('living-portrait').toDataURL(); let h=2166136261; for(const c of data) h=Math.imul(h^c.charCodeAt(0),16777619)>>>0; return h.toString(16); })()`);
  const result = await session.evaluate(`(async()=>{
    const text=gaia.editor.getText(), at=text.indexOf(${JSON.stringify(needle)});
    if(at<0) throw new Error('linha não encontrada: '+${JSON.stringify(needle)});
    gaia.editor.select(at); const execution=await gaia.run('selection');
    const line=document.querySelector('.cm-consequence');
    const data=document.getElementById('living-portrait').toDataURL(); let h=2166136261; for(const c of data) h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;
    return {ok:execution.ok, diagnostic:execution.diagnostic, visual:gaia.visual(), hash:h.toString(16),
      marked:line?.getAttribute('data-operation'), palette:document.querySelector('#glyph-palette button.active')?.dataset.operation,
      explanation:document.getElementById('line-explanation').textContent};
  })()`);
  assert.equal(result.ok, true); assert.equal(result.visual.cue.id, expected);
  assert.equal(result.marked, expected); assert.equal(result.palette, expected); assert.notEqual(result.hash, before);
  assert.match(result.explanation, /Recebe/i); assert.match(result.explanation, /transforma/i);
  assert.match(result.explanation, /conserva/i); assert.match(result.explanation, /exclui/i);
  report.glyphs[expected] = result; return result;
}

try {
  await session.cdp('Page.navigate', { url: session.url });
  await until(() => session.evaluate('Boolean(window.gaia?.ready)'), 'LIVING PORTRAIT não iniciou');
  const startup = await session.evaluate(`({tick:gaia.inspect().tick, visual:gaia.visual(), mode:gaia.mode,
    registry:gaia.inspect ? document.querySelectorAll('#glyph-palette button').length : 0,
    editorHeight:document.querySelector('.cm-editor').getBoundingClientRect().height,
    logicalLines:gaia.editor.statements().length, text:gaia.editor.getText()})`);
  assert.equal(startup.tick, 0); assert.equal(startup.visual.state, 'blank'); assert.equal(startup.mode, 'living');
  assert.equal(startup.registry, 7); assert.ok(startup.editorHeight >= 400); assert.equal(startup.logicalLines, 7);
  assert.match(startup.text, /chuva = situate/); assert.match(startup.text, /organismos = situate/);
  assert.doesNotMatch(startup.text, /chuva = situate.*chuva chuva/);
  report.checks.startup = startup; await shot('living-01-before.png');

  const first = await session.evaluate(`(async()=>{const text=gaia.editor.getText(); gaia.editor.select(text.indexOf('organismos ='));
    const result=await gaia.run('selection'); return {ok:result.ok, visual:gaia.visual(), world:gaia.inspect()};})()`);
  assert.equal(first.ok, true); assert.equal(first.visual.state, 'observed'); assert.equal(first.visual.recordCount, 4);
  assert.equal(first.visual.fragmentCount, 4); assert.equal(first.visual.allMediaVerified, true);
  assert.equal(first.visual.sourceStatus, 'captured-real'); assert.equal(first.visual.imageStatus, 'CAPTURED-REAL');
  assert.equal(first.visual.cue.id, 'situate');
  assert.equal(first.visual.causalClaim, false); assert.equal(first.world.sourceObservations['inaturalist-observations-brasilia-v0'].records.length, 4);
  const relationTrace = first.world.traces.find(trace => trace.operation === 'relate');
  assert.equal(relationTrace.relationship.kind, 'situated-computational-approximation'); assert.equal(relationTrace.relationship.causal, false);
  report.checks.firstOrganism = first; await shot('living-02-first-organism.png');

  const views = await session.evaluate(`(async()=>{
    const text=gaia.editor.getText(), ids=Object.fromEntries(Object.entries(gaia.inspect().fields).map(([name,field])=>[name,field.id]));
    gaia.setSourceView('glyph');
    const glyphText=gaia.editor.getText(), glyphSize=getComputedStyle(document.querySelector('.cm-glyph-token')).fontSize;
    const execution=await gaia.run('all'); const glyphIds=Object.fromEntries(Object.entries(gaia.inspect().fields).map(([name,field])=>[name,field.id]));
    gaia.setSourceView('text');
    return {text, restored:gaia.editor.getText(), glyphText, glyphSize, ok:execution.ok, ids, glyphIds,
      operations:gaia.inspect().traces.filter(t=>t.tick===gaia.inspect().tick).map(t=>t.operation)};
  })()`);
  assert.equal(views.ok, true); assert.equal(views.restored, views.text); assert.match(views.glyphText, /chuva = ⊙/);
  assert.match(views.glyphText, /aproximacao = ⇄/); assert.equal(views.glyphSize, '27px'); assert.deepEqual(views.glyphIds, views.ids);
  report.checks.operationViews = views;

  await lineRun('organismos =', 'situate');
  await lineRun('aproximacao =', 'relate');
  await lineRun('retrato fora recorte =', 'frame');
  await shot('living-03-outside.png');
  await lineRun('memoria =', 'remember');
  await lineRun('anterior =', 'trace');
  await lineRun('observe [', 'observe');

  const changedFrame = await session.evaluate(`(async()=>{
    const before=gaia.visual(); const next=gaia.editor.getText().replace('frame 3:4 0.5 0.5','frame 3:4 0.5 0');
    gaia.editor.setText(next); gaia.editor.select(next.indexOf('retrato fora recorte ='));
    const result=await gaia.run('selection');
    return {ok:result.ok, before, after:gaia.visual(), memory:gaia.observation().entries.find(e=>e.name==='memoria').value,
      trace:gaia.observation().entries.find(e=>e.name==='anterior').value};
  })()`);
  assert.equal(changedFrame.ok, true); assert.notEqual(changedFrame.after.observationId, changedFrame.before.observationId);
  assert.deepEqual(changedFrame.after.frameBounds, { x: 1, y: 0, width: 3, height: 4 });
  assert.equal(changedFrame.after.ghostVisible, true); assert.equal(changedFrame.memory.available, true); assert.equal(changedFrame.trace.available, true);
  report.checks.liveFrameAndTrace = changedFrame; await shot('living-04-trace.png');

  const discarded = await session.evaluate(`(async()=>{
    const next=gaia.editor.getText().replace('# ausencia = discard','ausencia = discard');
    gaia.editor.setText(next); gaia.editor.select(next.indexOf('ausencia = discard'));
    const result=await gaia.run('selection');
    const living=gaia.inspect().sourceObservations['inaturalist-observations-brasilia-v0'];
    return {ok:result.ok, visual:gaia.visual(), recordCount:living.records.length,
      credits:living.records.map(r=>({id:r.id,author:r.image.author,license:r.image.license,sha256:r.image.localSha256})),
      loss:gaia.inspect().traces.findLast(t=>t.operation==='discard'),
      marked:document.querySelector('.cm-consequence')?.getAttribute('data-operation'),
      palette:document.querySelector('#glyph-palette button.active')?.dataset.operation,
      explanation:document.getElementById('line-explanation').textContent};
  })()`);
  assert.equal(discarded.ok, true); assert.equal(discarded.visual.state, 'absent'); assert.equal(discarded.visual.absentIndices.length, 12);
  assert.equal(discarded.visual.fragmentCount, 4); assert.equal(discarded.recordCount, 4); assert.equal(discarded.loss.loss.count, 2);
  assert.equal(discarded.visual.cue.id, 'discard'); assert.equal(discarded.marked, 'discard'); assert.equal(discarded.palette, 'discard');
  assert.match(discarded.explanation, /Recebe/i); assert.match(discarded.explanation, /conserva/i); assert.match(discarded.explanation, /exclui/i);
  report.glyphs.discard = discarded; report.checks.absence = discarded; await shot('living-05-absence.png');

  const rollback = await session.evaluate(`(async()=>{
    const before={tick:gaia.inspect().tick, source:gaia.source, observation:JSON.stringify(gaia.observation()), visual:gaia.visual()};
    gaia.editor.setText(gaia.editor.getText().replace('frame 3:4','frame 99:1')); const result=await gaia.run('all');
    return {ok:result.ok, diagnostic:gaia.diagnostic, lint:gaia.editor.diagnostics(), before,
      after:{tick:gaia.inspect().tick, source:gaia.source, observation:JSON.stringify(gaia.observation()), visual:gaia.visual()}};
  })()`);
  assert.equal(rollback.ok, false); assert.equal(rollback.diagnostic.code, 'E_FRAME_EMPTY'); assert.ok(rollback.lint > 0);
  assert.equal(rollback.after.tick, rollback.before.tick); assert.equal(rollback.after.source, rollback.before.source);
  assert.equal(rollback.after.observation, rollback.before.observation); assert.deepEqual(rollback.after.visual, rollback.before.visual);
  report.checks.rollback = rollback;

  const coexistence = await session.evaluate(`(()=>{
    const result={}; for(const mode of ['data','inspector','living']) { gaia.setMode(mode); result[mode]={active:gaia.mode,
      livingHidden:document.getElementById('living-space').hidden, dataHidden:document.getElementById('territory-space').hidden,
      inspectorHidden:document.getElementById('inspector-space').hidden}; } return result;
  })()`);
  assert.deepEqual(coexistence.data, { active:'data', livingHidden:true, dataHidden:false, inspectorHidden:true });
  assert.deepEqual(coexistence.inspector, { active:'inspector', livingHidden:true, dataHidden:true, inspectorHidden:false });
  assert.deepEqual(coexistence.living, { active:'living', livingHidden:false, dataHidden:true, inspectorHidden:true });
  report.checks.coexistence = coexistence;

  const provenance = await session.evaluate(`(()=>{document.getElementById('provenance-toggle').click(); return {text:document.getElementById('provenance').textContent,
    resources:performance.getEntriesByType('resource').map(entry=>entry.name), open:!document.getElementById('provenance').hidden};})()`);
  assert.equal(provenance.open, true); assert.match(provenance.text, /SITUATED COMPUTATIONAL APPROXIMATION \/ NO CAUSAL CLAIM/);
  assert.match(provenance.text, /Mario Barroso/); assert.match(provenance.text, /Libris Simas Ferraz/);
  assert.equal((provenance.text.match(/SHA-256/g) ?? []).length, 5);
  assert.ok(provenance.resources.every(url => new URL(url).origin === session.url));
  report.checks.offlineAndProvenance = provenance;
  assert.deepEqual(session.errors, []); report.console = { errors: session.errors, warnings: session.warnings };
  await writeFile(join(artifacts, 'living-verification.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, glyphs: Object.keys(report.glyphs), captures: report.captures,
    first: report.checks.firstOrganism.visual, changed: report.checks.liveFrameAndTrace.after,
    absence: report.checks.absence.visual, console: report.console }, null, 2));
} finally { await session.close(); }
