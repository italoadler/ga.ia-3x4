import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { browserSession, until, sleep, root, artifacts } from './browser-session.mjs';

const browser = await browserSession(), { cdp, evaluate, key, screenshot } = browser;
const canonical = await readFile(join(root, 'examples/labour-score.gaia'), 'utf8');
const stages = [], glyphs = new Set(), realtime = process.env.GAIA_REHEARSAL_REALTIME === '1';
let movementStart = Date.now();
const waitMovement = async seconds => { if (realtime) while (Date.now() < movementStart + seconds * 1000) await sleep(Math.min(500, movementStart + seconds * 1000 - Date.now())); movementStart = Date.now(); };
async function navigate(name, id = null) {
  const nodes = await evaluate('window.gaia.score.nodes()');
  const target = name ? nodes.find(n => n.names.includes(name)) : nodes.find(n => n.id === id);
  assert.ok(target, name ?? id);
  let current = await evaluate('window.gaia.score.inspect().index');
  while (current !== target.index) { await key(current < target.index ? 'ArrowRight' : 'ArrowLeft', current < target.index ? 'ArrowRight' : 'ArrowLeft'); current += current < target.index ? 1 : -1; }
  return target;
}
async function execute(name, id = null) {
  const node = await navigate(name, id), tick = await evaluate('window.gaia.inspect().tick');
  await key('Enter', 'Enter');
  assert.equal(await evaluate('window.gaia.diagnostic'), null);
  assert.equal(await evaluate('window.gaia.inspect().tick'), tick + 1);
  await until(() => evaluate(`window.gaia.visual().paintedTick === ${tick + 1} && window.gaia.cue?.id === ${JSON.stringify(node.id)}`), 'Operação não chegou ao frame desenhado');
  assert.equal(await evaluate('window.gaia.score.inspect().id'), node.id);
  assert.equal(await evaluate('document.getElementById("score-mode").dataset.astLine'), String(node.line));
  assert.equal(await evaluate('document.getElementById("score-mode").dataset.operation'), node.id);
  glyphs.add(node.id); await sleep(400); return await evaluate('window.gaia.visual()');
}
async function capture(name) {
  await sleep(900); await screenshot(name);
  const image = await cdp('Page.captureScreenshot', { format: 'png', clip: await evaluate(`(() => { const r=document.getElementById('earth-canvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}; })()`) });
  const visual = await evaluate('window.gaia.visual()');
  stages.push({ name, tick: await evaluate('window.gaia.inspect().tick'), included: visual.includedFragmentIds.length,
    excluded: visual.excludedFragmentIds.length, discarded: visual.discardedFragmentIds.length, remembered: visual.rememberedFragmentIds.length,
    imageHash: createHash('sha256').update(Buffer.from(image.data, 'base64')).digest('hex') });
}
async function walk(fallback = false) {
  await cdp('Page.navigate', { url: browser.url + (fallback ? '/legacy.html?backend=webgl' : '/legacy.html') });
  await until(() => evaluate('Boolean(window.gaia?.visual()?.renders > 3)'), 'Cena não inicializou');
  await key('p', 'KeyP'); assert.equal(await evaluate('window.gaia.paused'), true);
  movementStart = Date.now();
  const initial = await evaluate('window.gaia.visual()');
  assert.equal(initial.renderer, 'WebGPURenderer'); assert.equal(initial.shading, 'TSL');
  assert.equal(initial.smoke, true); assert.equal(initial.fragmentCount, 0);
  assert.equal(await evaluate('document.getElementById("synthetic-warning").hidden'), false);
  assert.ok((await evaluate('document.getElementById("synthetic-warning").textContent')).includes('NÃO DOCUMENTAM TRABALHADORES REAIS'));
  const glyphSize = await evaluate('parseFloat(getComputedStyle(document.querySelector(".score-operator")).fontSize)');
  assert.ok(glyphSize >= 42 && glyphSize <= 64);
  await execute(null, 'observe');
  if (!fallback) { await capture('labour-01-smoke.png'); await waitMovement(40); }
  await execute('trabalho'); await execute('alvo');
  const situated = await evaluate('window.gaia.inspect().fields.trabalho');
  assert.equal(situated.labour.derivation.distinctRecordCount, 6); assert.equal(situated.labour.records.length, 6);
  assert.ok(situated.labour.records.every(r => r.evidenceStatus === 'synthetic'));
  const related = await execute('terra');
  assert.equal(related.fragmentCount, 144); assert.equal(related.uniqueRecordCount, 6);
  assert.equal(related.repeatIsNotWorkerCount, true); assert.equal(related.planetId, initial.planetId);
  assert.ok(related.fragments.every(f => f.supports.some(s => s.sourceFieldId === 'field:trabalho')));
  if (!fallback) { await capture('labour-02-situation-relation.png'); await waitMovement(45); }
  const opened = await execute('abertura');
  assert.equal(opened.exposed, true); assert.equal(opened.smoke, false);
  assert.equal(opened.drawnFragmentIds.length, 144);
  const traceView = await evaluate('window.gaia.inspect().bindings.abertura');
  assert.equal(opened.openingTraceId, traceView.latest.id); assert.ok(traceView.latest.surface);
  assert.equal(opened.accessTraceId, traceView.accessTraceId); assert.equal(opened.cardAspect, .75);
  await key(']', 'BracketRight');
  const inspectedWorld = await evaluate('JSON.stringify(window.gaia.inspect())');
  assert.ok(await evaluate('window.gaia.selectedFragment.record.evidenceStatus === "synthetic"'));
  assert.equal(await evaluate('document.getElementById("record-inscription").hidden'), false);
  await key(']', 'BracketRight'); assert.equal(await evaluate('JSON.stringify(window.gaia.inspect())'), inspectedWorld);
  if (!fallback) { await capture('labour-03-open-portraits.png'); await waitMovement(45); }
  await key('Escape', 'Escape'); await execute('cortina');
  const framed = await execute('retrato');
  assert.equal(framed.includedFragmentIds.length, 108); assert.equal(framed.excludedFragmentIds.length, 36);
  assert.deepEqual(framed.includedFragmentIds, framed.frame.includedFragmentIds);
  assert.deepEqual(framed.excludedFragmentIds, framed.frame.excludedFragmentIds);
  const previousCut = framed.frame.id;
  // A live edit goes through the real CodeMirror document, then Score's AST.
  await key('F2', 'F2'); assert.equal(await evaluate('document.getElementById("source").hidden'), false);
  const changed = canonical.replace('3:4 0.5 0.5', '3:4 0 0.5');
  await key('f', 'KeyF', 2); await cdp('Input.insertText', { text: '3:4 0.5 0.5' });
  await key('ArrowRight', 'ArrowRight'); // Commit CM search's keyup-driven query after bulk text insertion.
  await key('Enter', 'Enter'); await key('Escape', 'Escape');
  await cdp('Input.insertText', { text: '3:4 0 0.5' });
  assert.equal(await evaluate('window.gaia.editor.getText()'), changed);
  await key('F2', 'F2');
  assert.equal(await evaluate('document.getElementById("score-mode").classList.contains("executed")'), false, 'Operandos editados ainda não foram desenhados');
  const shifted = await execute('retrato');
  assert.notDeepEqual(shifted.includedFragmentIds, framed.includedFragmentIds);
  assert.ok(await evaluate(`window.gaia.inspect().traces.some(t=>t.id===${JSON.stringify(previousCut)})`));
  if (!fallback) await capture('labour-04-frame-residue.png');
  const preLossTick = await evaluate('window.gaia.inspect().tick');
  const supported = shifted.fragments.filter(f => f.recordIds.includes('work-demo03')).map(f => f.id);
  const absent = await execute('perda');
  assert.equal(absent.discardedFragmentIds.length, 24); assert.equal(absent.drawnFragmentIds.length, 120);
  assert.ok(supported.every(id => !absent.drawnFragmentIds.includes(id)));
  const loss = await evaluate('window.gaia.inspect().bindings.perda');
  assert.equal(loss.loss.distinctRecordCount, 1); assert.equal(loss.loss.supportedFragmentCount, 24);
  assert.ok(loss.retainedRecords[0].evidenceStatus === 'synthetic');
  assert.equal(await evaluate('window.gaia.inspect().fields.alvo.value'), null);
  if (!fallback) { await capture('labour-05-material-absence.png'); await waitMovement(70); }
  await execute('anterior'); const remembered = await execute('antes');
  assert.equal(remembered.memoryTick, preLossTick);
  assert.equal(remembered.rememberedFragmentIds.length, 144); assert.equal(remembered.discardedFragmentIds.length, 24);
  assert.equal(remembered.drawnFragmentIds.length, 120); assert.ok(remembered.historicalTraceId);
  assert.ok(remembered.lossRecords.includes(loss.id));
  const finalWorld = await evaluate('JSON.stringify(window.gaia.inspect())');
  await key('i', 'KeyI'); assert.equal(await evaluate('window.gaia.inspector'), true);
  assert.equal(await evaluate('JSON.stringify(window.gaia.inspect())'), finalWorld);
  await key('i', 'KeyI'); assert.equal(await evaluate('window.gaia.visual().planetId'), initial.planetId);
  if (!fallback) {
    await capture('labour-06-memory-damaged-present.png'); await waitMovement(40);
    await key('1', 'Digit1'); await screenshot('labour-07-score-large-glyph.png');
    await key('i', 'KeyI'); assert.equal(await evaluate('document.body.dataset.view'), 'INSPECTOR');
    assert.ok(await evaluate('document.getElementById("field").getBoundingClientRect().width > 0'));
    assert.ok((await evaluate('document.getElementById("field").getAttribute("aria-label")')).includes('24 fragmentos descartados'));
    await key('i', 'KeyI'); assert.equal(await evaluate('document.body.dataset.view'), 'SCORE');
    await key('3', 'Digit3');
    // Invalid edit: renderer and last valid program continue. Both syntax and
    // diagnostics are exercised through CodeMirror and actual execution keys.
    await key('F2', 'F2'); await key('a', 'KeyA', 2); await cdp('Input.insertText', { text: 'retrato = ⧉' });
    await key('Enter', 'Enter', 10);
    assert.equal(await evaluate('window.gaia.diagnostic.code'), 'E_ARITY');
    assert.equal(await evaluate('JSON.stringify(window.gaia.inspect())'), finalWorld);
    const beforeRender = await evaluate('window.gaia.visual().renders');
    await until(() => evaluate(`window.gaia.visual().renders > ${beforeRender}`), 'Última cena válida deixou de desenhar');
    await key('Enter', 'Enter', 1); // step the last valid program despite the invalid draft
    assert.equal(await evaluate('window.gaia.inspect().tick'), remembered.paintedTick + 1);
    assert.equal(await evaluate('window.gaia.visual().discardedFragmentIds.length'), 24);
    await screenshot('labour-08-invalid-running.png');
    await key('a', 'KeyA', 2); await cdp('Input.insertText', { text: changed }); await key('F2', 'F2');
    await execute('antes');
  }
  await key('p', 'KeyP'); assert.equal(await evaluate('window.gaia.paused'), false);
  const tick = await evaluate('window.gaia.inspect().tick');
  await until(() => evaluate(`window.gaia.inspect().tick > ${tick}`), 'Mundo não continuou após a memória');
  assert.equal(await evaluate('window.gaia.visual().discardedFragmentIds.length'), 24);
  assert.equal(await evaluate('window.gaia.visual().rememberedFragmentIds.length'), 144);
  if (fallback) { assert.equal(remembered.backend, 'webgl2'); await capture('labour-09-webgl2-complete.png'); }
  return { backend: initial.backend, preLossTick, currentTick: await evaluate('window.gaia.inspect().tick'),
    finalFragments: remembered.fragmentCount, lossFragments: remembered.discardedFragmentIds.length, ghostFragments: remembered.rememberedFragmentIds.length };
}
try {
  const main = await walk(), fallback = await walk(true);
  // The polished image must depend on the same supports, even before ⋮ opens
  // it. Discard through the full editor while discourse is still observed.
  await cdp('Page.navigate', { url: browser.url + '/legacy.html?backend=webgl' });
  await until(() => evaluate('Boolean(window.gaia?.visual()?.renders > 3)'));
  await key('p', 'KeyP'); await execute(null, 'observe');
  await execute('trabalho'); await execute('alvo'); const polished = await execute('terra');
  assert.equal(polished.polishedFragmentIds.length, 144);
  await key('F2', 'F2');
  await evaluate(`window.gaia.editor.select(${canonical.indexOf('perda = ')})`); await key('Enter', 'Enter', 2);
  await until(() => evaluate('window.gaia.visual().paintedCue === "discard"'));
  const openedHole = await evaluate('window.gaia.visual()');
  assert.equal(openedHole.smoke, true); assert.equal(openedHole.exposed, false);
  assert.equal(openedHole.polishedFragmentIds.length, 120); assert.equal(openedHole.discardedFragmentIds.length, 24);
  assert.ok(await evaluate('Boolean(document.querySelector(".cm-ast-operation[data-operation=discard]"))'));
  await key('F2', 'F2'); await navigate('perda'); await screenshot('labour-10-smoke-material-absence.png');
  assert.equal(glyphs.size, 7); assert.deepEqual(browser.errors, []);
  const report = { ok: true, main, fallback, glyphs: [...glyphs], synthetic: true,
    movementSeconds: [40, 45, 45, 70, 40], durationSeconds: 240, realtime,
    checks: ['real CodeMirror + Score AST execution', '42–64px glyph', 'synthetic warning', 'six records sustain 144 fragments',
      'every fragment has causal record support', 'real trace opens surface', 'runtime framing identities', 'live centre preserves previous cut',
      'one record removes all 24 fragments', 'loss provenance retained', 'pre-loss ghosts coexist with damaged current state',
      'polished smoke surface also loses supported geometry', 'full editor highlights the actual AST glyph',
      'inspection and Inspector do not mutate world', 'invalid edit preserves visual and running program', 'keyboard-only score',
      'all seven glyphs', 'complete WebGL 2 fallback', 'world continues without reset', 'no shader/browser errors'], stages, warnings: browser.warnings };
  await writeFile(join(artifacts, 'labour-verification.json'), JSON.stringify(report, null, 2) + '\n');
  if (realtime) await writeFile(join(artifacts, 'labour-realtime-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(JSON.stringify(browser.errors)); console.error(browser.output.slice(-1000));
  await screenshot('labour-failure.png').catch(() => {}); throw error;
} finally { await browser.close(); }
