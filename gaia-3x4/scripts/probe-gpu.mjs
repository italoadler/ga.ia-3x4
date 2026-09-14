import { browserSession, until } from './browser-session.mjs';
const session = await browserSession();
try {
  await session.cdp('Page.navigate', { url: session.url });
  await until(() => session.evaluate('Boolean(window.gaia)'));
  console.log(JSON.stringify(await session.cdp('Browser.getVersion'), null, 2));
  console.log(JSON.stringify(await session.evaluate(`(async () => {
    const result = { api: Boolean(navigator.gpu), secure: isSecureContext, selected: window.gaia.visual()?.backend };
    if (!navigator.gpu) return result;
    for(const [name, options] of [['core', {}], ['compatibility', {featureLevel:'compatibility'}], ['fallback', {forceFallbackAdapter:true}]]) {
      try { const adapter = await navigator.gpu.requestAdapter(options); result[name] = adapter ? {info:adapter.info,features:[...adapter.features]} : null; }
      catch(error) {result[name] = error.message;}
    }
    return result;
  })()`), null, 2));
} finally { await session.close(); }
