import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { POWER_SOURCE, powerRequestUrl } from '../src/nasa-power.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const request = { date: '2025-01-15' };
const requestUrl = powerRequestUrl(request);
const response = await fetch(requestUrl, { headers: { accept: 'application/json' } });
const retrievedAt = new Date().toISOString();
const body = await response.text();
if (!response.ok) throw new Error(`NASA POWER respondeu HTTP ${response.status}: ${body.slice(0, 300)}`);
JSON.parse(body);
const sha256 = createHash('sha256').update(body).digest('hex');
const rawName = 'nasa-power-brasilia-2025-01-15.raw.json';
await writeFile(new URL(`../data/${rawName}`, import.meta.url), body);
await writeFile(new URL('../data/nasa-power-brasilia-2025-01-15.capture.json', import.meta.url), `${JSON.stringify({
  schema: 'gaia-nasa-power-capture/v0',
  provider: POWER_SOURCE.provider,
  requestUrl,
  retrievedAt,
  httpStatus: response.status,
  responseHeaders: {
    contentType: response.headers.get('content-type'),
    contentLength: response.headers.get('content-length'),
    contentDisposition: response.headers.get('content-disposition'),
    apiName: response.headers.get('x-app-name'),
    apiVersion: response.headers.get('x-app-version'),
    dataSources: response.headers.get('x-data-sources'),
  },
  fixture: `data/${rawName}`,
  bytes: Buffer.byteLength(body),
  sha256,
}, null, 2)}\n`);
console.log(JSON.stringify({ requestUrl, retrievedAt, status: response.status, bytes: Buffer.byteLength(body), sha256, root }, null, 2));

