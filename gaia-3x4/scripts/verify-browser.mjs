import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifactDir = join(root, 'artifacts');
await mkdir(artifactDir, { recursive: true });
const port = Number(process.env.VERIFY_PORT || 3134);
const debugPort = Number(process.env.CDP_PORT || 9334);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(task, message, timeout = 15000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    try { const value = await task(); if (value) return value; } catch (error) { last = error; }
    await sleep(100);
  }
  throw new Error(`${message}${last ? `: ${last.message}` : ''}`);
}

const browsers = [process.env.GAIA_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
let browserPath;
for (const candidate of browsers) { try { await access(candidate); browserPath = candidate; break; } catch {} }
if (!browserPath) throw new Error('Chrome/Chromium/Edge não encontrado. Defina GAIA_BROWSER com o caminho do executável.');

const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = '';
server.stdout.on('data', data => { serverOutput += data; });
server.stderr.on('data', data => { serverOutput += data; });
let chrome, socket, profile, chromeOutput = '';
try {
  await until(async () => (await fetch(`http://127.0.0.1:${port}/`)).ok, 'O servidor local não iniciou');
  profile = await mkdtemp(join(artifactDir, 'browser-profile-'));
  chrome = spawn(browserPath, [
    '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`, '--window-size=1600,1040', 'about:blank',
  ], { cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.on('data', data => { chromeOutput += data; });
  const target = await until(async () => {
    const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json());
    return targets.find(t => t.type === 'page');
  }, 'O navegador não disponibilizou o protocolo local');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const callback = pending.get(message.id);
      if (!callback) return;
      pending.delete(message.id);
      if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
      else callback.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 12000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const key = async (key, code, modifiers = 0) => {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers });
  };
  const edit = async source => {
    await evaluate(`window.gaia.editor.setText(${JSON.stringify(source)}); window.gaia.editor.select(0);`);
    await key('Enter', 'Enter', 10);
  };
  const screenshot = async name => {
    const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(join(artifactDir, name), Buffer.from(result.data, 'base64'));
  };
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Log.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1040, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/?score=legacy` });
  await until(() => evaluate('Boolean(window.gaia)'), 'A superfície não inicializou');
  await key('p', 'KeyP');
  assert.equal(await evaluate('window.gaia.paused'), true);
  await key('Enter', 'Enter', 1);
  await key('i', 'KeyI');
  const initial = await evaluate('window.gaia.inspect()');
  assert.deepEqual(initial.fields.a.value, initial.fields.b.value);
  assert.notDeepEqual(initial.fields.a.provenance, initial.fields.b.provenance);
  assert.equal(initial.fields.retrato.value.length, 108);
  assert.equal(initial.fields.fora.partition.sourceIndices.length, 36);
  assert.equal(initial.fields.amostra.value, null);
  const canvas = await evaluate(`(() => { const c = document.getElementById('field'); const pixels = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let painted = 0; for(let i=3;i<pixels.length;i+=4) if(pixels[i]) painted++; return { painted, width: c.width, height: c.height, label: c.getAttribute('aria-label') }; })()`);
  assert.ok(canvas.painted > 10000, 'O Canvas deve conter a observação real');
  await screenshot('initial.png');
  const canonical = await readFile(join(root, 'examples/canonical.gaia'), 'utf8');
  const changed = canonical.replace('[0.35 2]', '[0.75 3]');
  await edit(changed);
  const live = await evaluate('window.gaia.inspect()');
  assert.equal(live.tick, initial.tick + 1);
  assert.equal(live.fields.a.id, initial.fields.a.id);
  assert.equal(live.fields.b.id, initial.fields.b.id);
  assert.deepEqual(live.fields.a.value, initial.fields.a.value);
  assert.equal(live.fields.vinculo.relationId, initial.fields.vinculo.relationId);
  assert.notDeepEqual(live.fields.retrato.value, initial.fields.retrato.value);
  assert.equal(live.bindings.anterior.latest.id, initial.bindings.corte.id);
  assert.equal(live.bindings.antes.requestedTick, initial.tick);
  assert.equal(live.relations['relation:vinculo'].revisionHistory.length, 2);
  await screenshot('performance.png');
  const beforeInvalid = await evaluate('JSON.stringify(window.gaia.inspect())');
  await edit('retrato = ⧉');
  assert.equal(await evaluate('window.gaia.diagnostic.code'), 'E_ARITY');
  assert.equal(await evaluate('JSON.stringify(window.gaia.inspect())'), beforeInvalid);
  assert.equal(await evaluate('window.gaia.source'), changed);
  await screenshot('invalid-edit.png');
  await key('Escape', 'Escape'); await key('p', 'KeyP');
  await until(() => evaluate(`window.gaia.inspect().tick > ${live.tick}`), 'O mundo não continuou após a revisão inválida', 5000);
  await key('p', 'KeyP');
  assert.equal(await evaluate('window.gaia.paused'), true);
  assert.equal(await evaluate('window.gaia.diagnostic.code'), 'E_ARITY');
  const continued = await evaluate('window.gaia.inspect()');
  assert.equal(continued.revisions.length, live.revisions.length);
  await edit(changed);
  assert.equal(await evaluate('window.gaia.diagnostic'), null);
  await key('Escape', 'Escape'); await key('t', 'KeyT');
  assert.equal(await evaluate('document.getElementById("trace-reader").open'), true);
  const record = await evaluate('JSON.parse(document.getElementById("trace-json").textContent)');
  assert.ok(record.world.traces.length >= continued.traces.length);
  assert.equal(record.inspectorEncoding.excluded.includes('número bruto'), true);
  await key('Escape', 'Escape');
  assert.equal(await evaluate('document.getElementById("trace-reader").open'), false);
  const worldBeforeResize = await evaluate('JSON.stringify(window.gaia.inspect())');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 760, height: 1100, deviceScaleFactor: 1, mobile: false });
  await sleep(150);
  assert.equal(await evaluate('JSON.stringify(window.gaia.inspect())'), worldBeforeResize);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  await screenshot('performance-narrow.png');
  assert.deepEqual(errors, [], 'A superfície deve rodar sem erros do navegador');
  const report = {
    ok: true, browser: browserPath, initialTick: initial.tick, liveEditTick: live.tick,
    continuedTickAfterInvalidEdit: continued.tick,
    checks: ['actual Canvas observation', 'equal data, different provenance', 'included and excluded visible',
      'keyboard live edit', 'stable field and relation IDs', 'portrait changed', 'historical frame retained',
      'explicit tick memory', 'loss record and tombstone', 'syntax error rollback', 'clock continued after invalid edit',
      'diagnostic persisted while clock ran', 'trace reader', 'responsive resize preserves world', 'no browser errors'],
    screenshots: ['initial.png', 'performance.png', 'invalid-edit.png', 'performance-narrow.png'],
    canvas, server: serverOutput.trim(),
  };
  await writeFile(join(artifactDir, 'browser-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  await cdp('Browser.close').catch(() => {});
} catch (error) {
  console.error(chromeOutput.slice(-3000));
  throw error;
} finally {
  socket?.close();
  chrome?.kill();
  server.kill();
  if (chrome && chrome.exitCode === null) await Promise.race([new Promise(done => chrome.once('exit', done)), sleep(1500)]);
  if (profile) {
    const target = resolve(profile), allowed = resolve(artifactDir) + sep;
    if (!target.startsWith(allowed) || !basename(target).startsWith('browser-profile-')) throw new Error('Perfil fora da pasta de artefatos; limpeza recusada.');
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(error => console.warn(`Perfil temporário retido: ${error.code}`));
  }
}
