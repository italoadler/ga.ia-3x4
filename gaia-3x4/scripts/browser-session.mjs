import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const artifacts = join(root, 'artifacts');
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function until(task, message = 'Condição não satisfeita', timeout = 20000) {
  let last;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const value = await task(); if (value) return value; } catch (error) { last = error; }
    await sleep(80);
  }
  throw new Error(`${message}${last ? `: ${last.message}` : ''}`);
}

export async function browserSession() {
  await mkdir(artifacts, { recursive: true });
  const browsers = [process.env.GAIA_BROWSER, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  let executable;
  for (const candidate of browsers) { try { await access(candidate); executable = candidate; break; } catch {} }
  if (!executable) throw new Error('Defina GAIA_BROWSER com um Chrome/Chromium/Edge instalado.');
  const port = Number(process.env.VERIFY_PORT || 3135), debugPort = Number(process.env.CDP_PORT || 9335);
  const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: 'ignore' });
  const profile = await mkdtemp(join(artifacts, 'browser-profile-'));
  let chrome, socket, output = '';
  const pending = new Map(), errors = [], warnings = [];
  async function close() {
    socket?.close(); chrome?.kill(); server.kill();
    for (const request of pending.values()) request.reject(new Error('Sessão fechada'));
    pending.clear();
    if (chrome && chrome.exitCode === null) await Promise.race([new Promise(done => chrome.once('exit', done)), sleep(1500)]);
    const target = resolve(profile);
    if (!target.startsWith(resolve(artifacts) + sep) || !basename(target).startsWith('browser-profile-')) throw new Error('Limpeza de perfil fora da pasta permitida recusada.');
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(e => console.warn(`Perfil retido: ${e.code}`));
  }
  try {
    await until(async () => (await fetch(`http://127.0.0.1:${port}/`)).ok, 'Servidor não iniciou');
    chrome = spawn(executable, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu',
      '--use-webgpu-adapter=swiftshader', '--use-vulkan=swiftshader', '--enable-features=Vulkan', '--disable-vulkan-surface',
      '--disable-lcd-text', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync',
      `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, '--remote-debugging-address=127.0.0.1', 'about:blank'],
    { cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    chrome.stderr.on('data', data => { output += data; });
    const target = await until(async () => (await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json())).find(t => t.type === 'page'));
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject; });
    let next = 0;
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const request = pending.get(message.id); pending.delete(message.id);
        message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
      }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry);
      if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
        const values = message.params.args.map(a => a.value ?? a.description).join(' ');
        (message.params.type === 'error' ? errors : warnings).push(values);
      }
    });
    const cdp = (method, params = {}) => new Promise((done, fail) => {
      const id = ++next, timer = setTimeout(() => { pending.delete(id); fail(new Error(`CDP: ${method} excedeu 20s`)); }, 20000);
      pending.set(id, { resolve: result => { clearTimeout(timer); done(result); }, reject: error => { clearTimeout(timer); fail(error); } });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value;
    };
    const key = async (key, code, modifiers = 0) => {
      const windowsVirtualKeyCode = { Enter: 13, Escape: 27, ' ': 32, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39 }[key] ?? (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, windowsVirtualKeyCode });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode });
    };
    const screenshot = async name => {
      const image = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      await writeFile(join(artifacts, name), Buffer.from(image.data, 'base64'));
    };
    await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Log.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1080, deviceScaleFactor: 1, mobile: false });
    return { cdp, evaluate, key, screenshot, close, errors, warnings, executable, url: `http://127.0.0.1:${port}`,
      get output() { return output; } };
  } catch (error) { console.error(output.slice(-3000)); await close(); throw error; }
}
