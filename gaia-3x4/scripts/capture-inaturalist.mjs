import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dataDirectory = fileURLToPath(new URL('../data/inaturalist/', import.meta.url));
const mediaDirectory = fileURLToPath(new URL('../data/inaturalist/media/', import.meta.url));
const rawPath = fileURLToPath(new URL('../data/inaturalist/observations.raw.json', import.meta.url));
const manifestPath = fileURLToPath(new URL('../data/inaturalist/capture.json', import.meta.url));
const selected = Object.freeze([
  { observationId: 399498913, photoId: 732969051 },
  { observationId: 397768311, photoId: 729588883 },
  { observationId: 393600054, photoId: 721458676 },
  { observationId: 388807360, photoId: 712138947 },
]);
const allowedLicenses = new Set(['cc0', 'cc-by']);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const requestUrl = new URL('https://api.inaturalist.org/v1/observations');
requestUrl.searchParams.set('id', selected.map(item => item.observationId).join(','));
requestUrl.searchParams.set('photos', 'true');
requestUrl.searchParams.set('per_page', String(selected.length));
requestUrl.searchParams.set('order_by', 'id');
requestUrl.searchParams.set('order', 'desc');

const headers = { 'User-Agent': 'gaia-3x4/0.1 source-capture (local research prototype)' };
const response = await fetch(requestUrl, { headers });
if (!response.ok) throw new Error(`iNaturalist respondeu HTTP ${response.status}.`);
const rawBytes = Buffer.from(await response.arrayBuffer());
const raw = JSON.parse(rawBytes.toString('utf8'));
if (raw.total_results !== selected.length || raw.results?.length !== selected.length)
  throw new Error(`A consulta deveria devolver exatamente ${selected.length} observações.`);

const downloads = [];
for (const expected of selected) {
  const observation = raw.results.find(item => item.id === expected.observationId);
  if (!observation) throw new Error(`Observação ${expected.observationId} ausente.`);
  if (observation.quality_grade !== 'research') throw new Error(`Observação ${expected.observationId} não é research grade.`);
  if (!['Plantae', 'Insecta'].includes(observation.taxon?.iconic_taxon_name))
    throw new Error(`Observação ${expected.observationId} não é planta ou inseto.`);
  const photo = observation.photos?.find(item => item.id === expected.photoId);
  if (!photo) throw new Error(`Foto ${expected.photoId} ausente da observação ${expected.observationId}.`);
  if (!allowedLicenses.has(photo.license_code) || !photo.attribution)
    throw new Error(`Foto ${expected.photoId} não tem licença e atribuição reutilizáveis.`);
  const remoteUrl = photo.url.replace('/square.', '/large.');
  const mediaResponse = await fetch(remoteUrl, { headers });
  if (!mediaResponse.ok) throw new Error(`Foto ${expected.photoId} respondeu HTTP ${mediaResponse.status}.`);
  const bytes = Buffer.from(await mediaResponse.arrayBuffer());
  const extension = new URL(remoteUrl).pathname.split('.').at(-1).toLowerCase();
  if (!['jpg', 'jpeg'].includes(extension) || !/^image\/jpeg\b/i.test(mediaResponse.headers.get('content-type') ?? ''))
    throw new Error(`Foto ${expected.photoId} não é JPEG como declarado.`);
  downloads.push({ observation, photo, remoteUrl, bytes,
    filename: `${expected.observationId}-${expected.photoId}.jpg`,
    contentType: mediaResponse.headers.get('content-type'), sha256: sha256(bytes) });
}

const categoryCount = downloads.reduce((counts, item) => {
  const key = item.observation.taxon.iconic_taxon_name;
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {});
if (categoryCount.Plantae !== 2 || categoryCount.Insecta !== 2)
  throw new Error('A seleção deve conter exatamente duas plantas e dois insetos.');

await mkdir(dataDirectory, { recursive: true });
await mkdir(mediaDirectory, { recursive: true });
await writeFile(rawPath, rawBytes);
for (const item of downloads) await writeFile(new URL(`../data/inaturalist/media/${item.filename}`, import.meta.url), item.bytes);

const capturedAt = new Date().toISOString();
const manifest = {
  schema: 'gaia-3x4/inaturalist-capture/v0',
  source: 'iNaturalist API v1',
  capturedAt,
  requestUrl: String(requestUrl),
  response: {
    httpStatus: response.status,
    contentType: response.headers.get('content-type'),
    rawPath: '/data/inaturalist/observations.raw.json',
    bytes: rawBytes.length,
    sha256: sha256(rawBytes),
  },
  selectionPolicy: {
    count: selected.length,
    categories: { Plantae: 2, Insecta: 2 },
    acceptedPhotoLicenses: ['cc0', 'cc-by'],
    qualityGrade: 'research',
    region: 'bbox -49,-17,-46.5,-14',
  },
  records: downloads.map(({ observation, photo, remoteUrl, bytes, filename, contentType, sha256: digest }) => ({
    observationId: observation.id,
    photoId: photo.id,
    status: 'CAPTURED-REAL',
    originalUrl: observation.uri,
    mediaOriginalUrl: remoteUrl,
    localPath: `/data/inaturalist/media/${filename}`,
    bytes: bytes.length,
    sha256: digest,
    contentType,
    license: photo.license_code,
    licenseUrl: photo.license_code === 'cc-by' ? 'https://creativecommons.org/licenses/by/4.0/' : 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: photo.attribution,
  })),
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ root, manifestPath, rawSha256: manifest.response.sha256,
  records: manifest.records.map(({ observationId, photoId, sha256: digest }) => ({ observationId, photoId, sha256: digest })) }, null, 2));
