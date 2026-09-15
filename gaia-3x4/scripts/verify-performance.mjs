import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { GLYPH_REGISTRY } from '../src/registry.mjs';
import { browserSession, until, sleep, root, artifacts } from './browser-session.mjs';

const browser = await browserSession();
const { cdp, evaluate, key, screenshot } = browser;
const canonical = await readFile(join(root, 'examples/canonical.gaia'), 'utf8');
const results = [];
try {
  await cdp('Page.navigate', { url: browser.url + '/?score=legacy' });
  await until(() => evaluate('Boolean(window.gaia?.visual()?.renders > 3)'), 'A cena 3D não desenhou');
  await key('p', 'KeyP');
  assert.equal(await evaluate('window.gaia.paused'), true);
  await key('Enter', 'Enter', 1);
  await sleep(300);
  const initial = await evaluate('window.gaia.visual()');
  console.log(`Renderer observado: ${initial.backend} / ${initial.geometryVertices} vértices`);
  assert.equal(initial.renderer, 'WebGPURenderer'); assert.equal(initial.shading, 'TSL');
  assert.equal(initial.cellCount, 144); assert.ok(initial.geometryVertices > 30000);
  assert.equal(initial.frameAspect, 3 / 4); assert.equal(initial.includedIndices.length, 108);
  assert.equal(initial.excludedIndices.length, 36); assert.equal(initial.ghostIndices.length, 108);
  assert.equal(await evaluate('Boolean(document.querySelector(".cm-editor .cm-content[contenteditable=true]"))'), true);
  assert.equal(await evaluate('document.querySelectorAll("#glyph-palette button").length'), 7);

  const setSource = async text => { await evaluate(`window.gaia.editor.setText(${JSON.stringify(text)})`); };
  const select = async (text, fragment, offset = 0) => {
    const position = text.indexOf(fragment) + offset;
    assert.ok(position >= 0);
    await evaluate(`window.gaia.editor.select(${position})`); await sleep(50); return position;
  };
  const executeLine = async (text, fragment, id) => {
    await select(text, fragment);
    const beforeRenders = await evaluate('window.gaia.visual().renders');
    await key('Enter', 'Enter', 2);
    assert.equal(await evaluate('window.gaia.diagnostic'), null);
    await until(() => evaluate(`window.gaia.cue?.id === ${JSON.stringify(id)} && window.gaia.visual().cue === ${JSON.stringify(id)}`), `Sem consequência sincronizada para ${id}`);
    assert.equal(await evaluate(`Boolean(document.querySelector('.cm-consequence[data-operation="${id}"]'))`), true);
    assert.equal(await evaluate('window.gaia.visual().planetId'), initial.planetId);
    assert.equal(await evaluate('window.gaia.visual().paintedCue'), id);
    await until(() => evaluate(`window.gaia.visual().renders > ${beforeRenders}`), 'A consequência precisa chegar ao frame do renderer');
    await sleep(150);
  };
  const insertGlyph = async (text, prefix, op, method = 'shortcut') => {
    const placeholder = text.replace(`${prefix}${op.glyph}`, prefix);
    await setSource(placeholder);
    if (prefix) await select(placeholder, prefix, prefix.length);
    else { await evaluate(`window.gaia.editor.select(${text.lastIndexOf('\n' + op.glyph) + 1})`); await sleep(50); }
    if (method === 'palette') {
      const rect = await evaluate(`(() => { const r = document.querySelector('#glyph-palette [data-operation="${op.id}"]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...rect });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...rect });
    } else if (method === 'autocomplete') {
      await cdp('Input.insertText', { text: op.alias.slice(0, 2) });
      await key(' ', 'Space', 2);
      await until(() => evaluate('Boolean(document.querySelector(".cm-tooltip-autocomplete"))'), 'Autocomplete não abriu');
      assert.ok((await evaluate('document.querySelector(".cm-tooltip-autocomplete").textContent')).includes(op.alias));
      await sleep(150); // CodeMirror deliberately delays acceptance immediately after a list opens.
      await key('Enter', 'Enter');
    } else {
      const digit = op.shortcut.split('-')[1]; await key(digit, `Digit${digit}`, 1);
    }
    assert.equal(await evaluate('window.gaia.editor.getText()'), text, `Inserção de ${op.id} pelo editor`);
  };
  const stageHash = async () => {
    const clip = await evaluate(`(() => { const r = document.getElementById('earth-canvas').getBoundingClientRect(); return {x:r.x+100,y:r.y+70,width:r.width-200,height:r.height-140,scale:1}; })()`);
    const image = await cdp('Page.captureScreenshot', { format: 'png', clip });
    return createHash('sha256').update(Buffer.from(image.data, 'base64')).digest('hex');
  };
  let current = canonical;
  const situate = GLYPH_REGISTRY.find(op => op.id === 'situate');
  await insertGlyph(current, 'a = ', situate);
  await executeLine(current, 'a = ', 'situate');
  const situated = await evaluate('window.gaia.visual()'), situatedWorld = await evaluate('window.gaia.inspect()');
  assert.deepEqual(situatedWorld.fields.a.value, situatedWorld.fields.b.value);
  assert.notDeepEqual(situatedWorld.fields.a.provenance, situatedWorld.fields.b.provenance);
  assert.ok(situated.sources.includes('field:a') && situated.sources.includes('field:b'));
  assert.equal(situated.sourceWitnessOpacity[0], .65);
  results.push({ glyph: '⊙', id: 'situate', editor: 'Alt-1', consequence: 'duas testemunhas de origem distintas, mesmo vetor', tick: situatedWorld.tick, stageHash: await stageHash() });

  // Hover uses the actual CodeMirror tooltip extension and pointer coordinates.
  const hoverPosition = await select(current, 'a = ⊙', 'a = '.length);
  const coordinates = await evaluate(`window.gaia.editor.coordsAt(${hoverPosition})`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: coordinates.left + 4, y: coordinates.top + 10 });
  await until(() => evaluate('Boolean(document.querySelector(".cm-tooltip-hover .glyph-documentation"))'), 'Hover não abriu');
  const hover = await evaluate('document.querySelector(".cm-tooltip-hover").textContent');
  assert.ok(hover.includes(situate.signature) && hover.includes(situate.documentation));
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 20 });

  current = current.replace('[0.35 2]', '[0.75 3]');
  await insertGlyph(current, 'vinculo = ', GLYPH_REGISTRY.find(op => op.id === 'relate'));
  await executeLine(current, 'vinculo = ', 'relate');
  const related = await evaluate('window.gaia.visual()');
  assert.notDeepEqual(related.includedValues, situated.includedValues);
  assert.equal((await evaluate('window.gaia.inspect()')).relations['relation:vinculo'].revisionHistory.length, 2);
  results.push({ glyph: '⇄', id: 'relate', editor: 'Alt-2', consequence: 'superfície alterada, identidade persistente', tick: await evaluate('window.gaia.inspect().tick'), stageHash: await stageHash() });

  const previousCut = await evaluate('window.gaia.inspect().bindings.corte');
  current = current.replace('3:4 0.5 0.5', '3:4 0 0.5');
  await insertGlyph(current, 'retrato fora corte = ', GLYPH_REGISTRY.find(op => op.id === 'frame'), 'palette');
  await executeLine(current, 'retrato fora corte = ', 'frame');
  const framed = await evaluate('window.gaia.visual()');
  assert.notDeepEqual(framed.includedIndices, related.includedIndices);
  assert.deepEqual(framed.includedIndices, (await evaluate('window.gaia.inspect().bindings.corte')).includedIndices);
  assert.equal(framed.historicalTraceId, previousCut.id);
  assert.equal(framed.excludedIndices.length, 36);
  const changedStage = await stageHash();
  assert.notEqual(changedStage, results.at(-1).stageHash);
  await screenshot('microperformance-frame.png');
  results.push({ glyph: '⧉', id: 'frame', editor: 'paleta', consequence: 'centro alterado; células entram/saem; recorte anterior retido', tick: await evaluate('window.gaia.inspect().tick'), stageHash: changedStage });

  current = current.replace('antes = ↶ 1', 'antes = ↶ 2');
  await insertGlyph(current, 'antes = ', GLYPH_REGISTRY.find(op => op.id === 'remember'));
  await executeLine(current, 'antes = ', 'remember');
  const remembered = await evaluate('window.gaia.visual()'), rememberedWorld = await evaluate('window.gaia.inspect()');
  assert.equal(remembered.memoryTick, rememberedWorld.tick - 2);
  assert.deepEqual(remembered.ghostIndices, rememberedWorld.bindings.antes.field.partition.sourceIndices);
  assert.ok(remembered.cueStrength.memory > .1);
  await screenshot('microperformance-memory.png');
  results.push({ glyph: '↶', id: 'remember', editor: 'Alt-4', consequence: 'fantasma corresponde ao snapshot de dois ticks atrás', tick: rememberedWorld.tick, stageHash: await stageHash() });

  current = current.replace('anterior = ⋮ frame', 'anterior = ⋮ ⧉');
  await insertGlyph(current, 'anterior = ', GLYPH_REGISTRY.find(op => op.id === 'trace'), 'autocomplete');
  await executeLine(current, 'anterior = ', 'trace');
  const traced = await evaluate('window.gaia.visual()');
  assert.equal(traced.historicalTraceId, await evaluate('window.gaia.inspect().bindings.anterior.latest.id'));
  assert.ok(traced.cueStrength.trace > .1);
  results.push({ glyph: '⋮', id: 'trace', editor: 'autocomplete de tr', consequence: 'malha retida e contorno anterior associados ao ID histórico', tick: await evaluate('window.gaia.inspect().tick'), stageHash: await stageHash() });

  const discard = 'ausencia = ⊘ "retirada do retrato" retrato\n';
  current = current.replace('◉ [', discard + '◉ [');
  await insertGlyph(current, 'ausencia = ', GLYPH_REGISTRY.find(op => op.id === 'discard'));
  await executeLine(current, 'ausencia = ', 'discard');
  const absent = await evaluate('window.gaia.visual()'), absentWorld = await evaluate('window.gaia.inspect()');
  assert.equal(absentWorld.fields.retrato.value, null);
  assert.equal(absent.includedIndices.length, 0); assert.equal(absent.absentIndices.length, 108);
  assert.equal(absent.excludedIndices.length, 36); assert.equal(absent.ghostIndices.length, 108);
  assert.ok(absent.lossRecords.includes(absentWorld.bindings.ausencia.id));
  await screenshot('microperformance-discard.png');
  results.push({ glyph: '⊘', id: 'discard', editor: 'Alt-6', consequence: '108 superfícies ausentes, 36 fragmentos e fantasma permanecem, perda registrada', tick: absentWorld.tick, stageHash: await stageHash() });
  const discardedWorld = await evaluate('JSON.stringify(window.gaia.inspect())');
  await key('Escape', 'Escape'); await key('i', 'KeyI');
  assert.equal(await evaluate('window.gaia.inspector'), true);
  assert.ok((await evaluate('document.getElementById("field").getAttribute("aria-label")')).includes('0 células incluídas'));
  assert.equal(await evaluate('JSON.stringify(window.gaia.inspect())'), discardedWorld);
  await screenshot('microperformance-inspector-absence.png'); await key('i', 'KeyI');

  current = current.replace('◉ [retrato fora corte antes anterior perda a b vinculo]', '◉ [fora corte anterior a b]');
  await insertGlyph(current, '', GLYPH_REGISTRY.find(op => op.id === 'observe'));
  await executeLine(current, '◉ [', 'observe');
  const observed = await evaluate('window.gaia.visual()');
  assert.equal(observed.ghostIndices.length, 0);
  assert.deepEqual(observed.selectedNames, ['fora', 'corte', 'anterior', 'a', 'b']);
  assert.equal(observed.excludedIndices.length, 36);
  assert.equal(await evaluate('window.gaia.inspect().fields.retrato.discarded'), true);
  results.push({ glyph: '◉', id: 'observe', editor: 'Alt-7', consequence: 'observação deixa de selecionar memória; fantasma some, snapshot permanece', tick: await evaluate('window.gaia.inspect().tick'), stageHash: await stageHash() });
  assert.equal(results.length, 7);

  const beforeInvalid = await evaluate('JSON.stringify(window.gaia.inspect())');
  const visualBeforeInvalid = await evaluate('window.gaia.visual()');
  await setSource('retrato = ⧉'); await evaluate('window.gaia.editor.select(0)'); await key('Enter', 'Enter', 10);
  assert.equal(await evaluate('window.gaia.diagnostic.code'), 'E_ARITY');
  assert.ok(await evaluate('window.gaia.editor.diagnostics()') > 0);
  assert.equal(await evaluate('JSON.stringify(window.gaia.inspect())'), beforeInvalid);
  assert.deepEqual((await evaluate('window.gaia.visual()')).includedIndices, visualBeforeInvalid.includedIndices);
  await screenshot('microperformance-invalid.png');

  // A valid selected block remains executable with an invalid draft elsewhere.
  current = canonical.replace('[0.35 2]', '[0.55 1]').replace('3:4 0.5 0.5', '3:4 1 0.5');
  const invalidElsewhere = current + 'quebrada = ⧉\n';
  await setSource(invalidElsewhere);
  const from = invalidElsewhere.indexOf('vinculo = '), to = invalidElsewhere.indexOf('antes = ');
  await evaluate(`window.gaia.editor.select(${from},${to})`); await key('Enter', 'Enter', 2);
  assert.equal(await evaluate('window.gaia.diagnostic'), null);
  assert.equal((await evaluate('window.gaia.source')).includes('quebrada'), false);
  assert.equal(await evaluate('window.gaia.inspect().bindings.corte.parameters.anchor[0]'), 1);
  assert.equal(await evaluate('window.gaia.visual().planetId'), initial.planetId);
  // Discard was outside this selected block, so it remains committed.
  assert.equal(await evaluate('window.gaia.inspect().fields.retrato.discarded'), true);

  await setSource(current); await evaluate('window.gaia.editor.select(0)'); await key('Enter', 'Enter', 10);
  assert.equal(await evaluate('window.gaia.diagnostic'), null);
  assert.equal(await evaluate('window.gaia.visual().includedIndices.length'), 108);
  const beforeInspector = await evaluate('JSON.stringify(window.gaia.inspect())');
  await key('Escape', 'Escape'); await key('i', 'KeyI');
  assert.equal(await evaluate('window.gaia.inspector'), true);
  const pixels = await evaluate(`(() => { const c = document.getElementById('field'), p = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=3;i<p.length;i+=4) if(p[i])n++; return n; })()`);
  assert.ok(pixels > 10000); assert.equal(await evaluate('JSON.stringify(window.gaia.inspect())'), beforeInspector);
  await screenshot('microperformance-inspector.png'); await key('i', 'KeyI');
  assert.equal(await evaluate('window.gaia.inspector'), false);
  assert.equal(await evaluate('window.gaia.visual().planetId'), initial.planetId);

  // A separate page verifies Three's actual WebGL 2 backend using the same TSL graph.
  await cdp('Page.navigate', { url: browser.url + '/?score=legacy&backend=webgl' });
  await until(() => evaluate('Boolean(window.gaia?.visual()?.renders > 3)'), 'Fallback WebGL 2 não desenhou');
  await key('p', 'KeyP'); await key('Enter', 'Enter', 1); await sleep(300);
  const fallback = await evaluate('window.gaia.visual()');
  assert.equal(fallback.backend, 'webgl2'); assert.equal(fallback.cellCount, 144);
  assert.equal(fallback.includedIndices.length, 108); assert.equal(fallback.excludedIndices.length, 36);
  await screenshot('microperformance-webgl2.png');
  assert.deepEqual(browser.errors, [], 'Nenhum erro de execução ou shader no navegador');
  const report = { ok: true, browser: browser.executable, defaultBackend: initial.backend,
    fallbackBackend: fallback.backend, renderer: initial.renderer, shading: initial.shading,
    checks: ['seven glyphs from actual CodeMirror insertion to visual consequence', 'palette', 'autocomplete', 'hover from registry',
      'single line execution', 'selected block with invalid text elsewhere', 'transactional diagnostics', 'stable 3D scene identity',
      'frame centre changes membership', 'previous frame remains accessible', 'actual historical ghost', 'visible accountable discard',
      'observe changes selection', 'Inspector does not mutate world, including discarded portrait', 'highlight confirmed by rendered frame', 'WebGL 2 fallback uses same TSL graph', 'no browser/shader errors'],
    glyphs: results, vertices: initial.geometryVertices, warnings: browser.warnings,
    screenshots: ['microperformance-frame.png', 'microperformance-memory.png', 'microperformance-discard.png', 'microperformance-invalid.png',
      'microperformance-inspector.png', 'microperformance-inspector-absence.png', 'microperformance-webgl2.png'] };
  await writeFile(join(artifacts, 'performance-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error('Erros do navegador:', JSON.stringify(browser.errors));
  console.error('Warnings:', JSON.stringify(browser.warnings));
  console.error(browser.output.slice(-1800));
  await screenshot('microperformance-failure.png').catch(() => {}); throw error;
} finally { await browser.close(); }
