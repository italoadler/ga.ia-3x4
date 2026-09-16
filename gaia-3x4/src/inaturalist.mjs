import { Diagnostic } from './parser.mjs';
import { freeze } from './runtime.mjs';
import { POWER_BOUNDS_LABEL } from './nasa-power.mjs';

export const INATURALIST_EXTERNAL_NAME = 'inaturalist_brasilia';
export const INATURALIST_FIXTURE_PATH = '/data/inaturalist/observations.raw.json';
export const INATURALIST_MANIFEST_PATH = '/data/inaturalist/capture.json';
export const INATURALIST_DOMAIN_LABEL = 'selected iNaturalist observation records';
export const INATURALIST_TIME_LABEL = 'per-record observed dates';
export const INATURALIST_SOURCE_LABEL = 'iNaturalist / captured';
export const INATURALIST_SOURCE = Object.freeze({
  id: 'inaturalist-observations-brasilia-v0',
  provider: 'iNaturalist',
  institution: 'iNaturalist',
  endpoint: 'https://api.inaturalist.org/v1/observations',
  documentation: 'https://api.inaturalist.org/v1/docs/',
  mediaHelp: 'https://help.inaturalist.org/en/support/solutions/articles/151000169918',
  selected: Object.freeze([
    Object.freeze({ observationId: 399498913, photoId: 732969051 }),
    Object.freeze({ observationId: 397768311, photoId: 729588883 }),
    Object.freeze({ observationId: 393600054, photoId: 721458676 }),
    Object.freeze({ observationId: 388807360, photoId: 712138947 }),
  ]),
  bounds: Object.freeze({ longitudeMin: -49, latitudeMin: -17, longitudeMax: -46.5, latitudeMax: -14 }),
  longitudes: Object.freeze([-48.75, -48.125, -47.5, -46.875]),
  latitudes: Object.freeze([-17, -16.5, -16, -15.5, -15, -14.5, -14]),
  shape: Object.freeze([4, 7]),
});

const allowedLicenses = new Set(['cc0', 'cc-by']);
const diagnostic = (code, message, location = {}) => new Diagnostic(code, message, location);

function literal(node, label) {
  if (node?.kind === 'literal') return node.value;
  if (node?.kind === 'vector') return node.items.map(item => literal(item, label));
  throw diagnostic('E_INAT_PROGRAM', `${label} deve ser literal na linha situate.`, node?.location);
}

function operations(node, found = []) {
  if (node?.kind === 'operation') {
    found.push(node);
    node.args.forEach(argument => operations(argument, found));
  } else if (node?.kind === 'vector') node.items.forEach(item => operations(item, found));
  return found;
}

export function inaturalistRequestFromProgram(program) {
  const candidates = program.statements.flatMap(statement => statement.expressions.flatMap(expression => operations(expression)))
    .filter(node => node.id === 'situate' && node.args[5]?.kind === 'reference' && node.args[5].name === INATURALIST_EXTERNAL_NAME);
  if (candidates.length !== 1)
    throw diagnostic('E_INAT_PROGRAM', `O programa deve conter exatamente uma linha situate ligada a ${INATURALIST_EXTERNAL_NAME}.`);
  const node = candidates[0];
  const sourceLabel = literal(node.args[0], 'A fonte');
  const timeLabel = literal(node.args[1], 'O tempo');
  const boundsLabel = literal(node.args[2], 'A janela');
  const domainLabel = literal(node.args[3], 'O domínio');
  const shape = literal(node.args[4], 'A forma');
  if (sourceLabel !== INATURALIST_SOURCE_LABEL)
    throw diagnostic('E_INAT_MODE', `A fatia v0 usa exatamente "${INATURALIST_SOURCE_LABEL}".`, node.args[0].location);
  if (timeLabel !== INATURALIST_TIME_LABEL)
    throw diagnostic('E_INAT_TIME', `As datas permanecem por registro; use "${INATURALIST_TIME_LABEL}".`, node.args[1].location);
  if (boundsLabel !== POWER_BOUNDS_LABEL)
    throw diagnostic('E_INAT_BOUNDS', `A fatia v0 usa exatamente "${POWER_BOUNDS_LABEL}".`, node.args[2].location);
  if (domainLabel !== INATURALIST_DOMAIN_LABEL)
    throw diagnostic('E_INAT_DOMAIN', `A fatia v0 usa exatamente "${INATURALIST_DOMAIN_LABEL}".`, node.args[3].location);
  if (JSON.stringify(shape) !== JSON.stringify(INATURALIST_SOURCE.shape))
    throw diagnostic('E_INAT_SHAPE', `A forma deve ser [${INATURALIST_SOURCE.shape.join(' ')}].`, node.args[4].location);
  return freeze({ sourceLabel, timeLabel, boundsLabel, domainLabel, shape, location: node.location });
}

export function inaturalistRequestUrl() {
  const url = new URL(INATURALIST_SOURCE.endpoint);
  url.searchParams.set('id', INATURALIST_SOURCE.selected.map(item => item.observationId).join(','));
  url.searchParams.set('photos', 'true');
  url.searchParams.set('per_page', String(INATURALIST_SOURCE.selected.length));
  url.searchParams.set('order_by', 'id');
  url.searchParams.set('order', 'desc');
  return String(url);
}

const nearestIndex = (values, target) => values.reduce((best, value, index) =>
  Math.abs(value - target) < Math.abs(values[best] - target) ? index : best, 0);

function authorFromAttribution(attribution, photoId) {
  const match = /^\(c\)\s+(.+?),\s+some rights reserved\s+\(CC BY\)$/i.exec(attribution);
  if (!match?.[1]) throw diagnostic('E_INAT_ATTRIBUTION', `A foto ${photoId} não expõe autoria CC BY inequívoca.`);
  return match[1];
}

export function normalizeInaturalistResponse(raw, context) {
  if (!raw || !Array.isArray(raw.results) || raw.total_results !== INATURALIST_SOURCE.selected.length || raw.results.length !== INATURALIST_SOURCE.selected.length)
    throw diagnostic('E_INAT_RESPONSE', 'A resposta deve conter exatamente as quatro observações selecionadas.');
  const manifestRecords = new Map((context.manifest?.records ?? []).map(item => [item.observationId, item]));
  const values = Array(INATURALIST_SOURCE.shape[0] * INATURALIST_SOURCE.shape[1]).fill(null);
  const records = [];
  for (const expected of INATURALIST_SOURCE.selected) {
    const observation = raw.results.find(item => item.id === expected.observationId);
    const manifest = manifestRecords.get(expected.observationId);
    if (!observation || !manifest) throw diagnostic('E_INAT_SELECTION', `O registro ${expected.observationId} não corresponde ao manifesto.`);
    if (observation.quality_grade !== 'research') throw diagnostic('E_INAT_QUALITY', `O registro ${observation.id} deixou de ser research grade.`);
    const iconicTaxon = observation.taxon?.iconic_taxon_name;
    if (!['Plantae', 'Insecta'].includes(iconicTaxon)) throw diagnostic('E_INAT_TAXON', `O registro ${observation.id} não é planta ou inseto.`);
    const coordinates = observation.geojson?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(Number.isFinite))
      throw diagnostic('E_INAT_LOCATION', `O registro ${observation.id} não expõe coordenadas públicas válidas.`);
    const [longitude, latitude] = coordinates, bounds = INATURALIST_SOURCE.bounds;
    if (longitude < bounds.longitudeMin || longitude > bounds.longitudeMax || latitude < bounds.latitudeMin || latitude > bounds.latitudeMax)
      throw diagnostic('E_INAT_LOCATION', `O registro ${observation.id} saiu da janela regional declarada.`);
    const photo = observation.photos?.find(item => item.id === expected.photoId);
    if (!photo || !allowedLicenses.has(photo.license_code) || !photo.attribution)
      throw diagnostic('E_INAT_LICENSE', `A foto ${expected.photoId} não preserva licença e crédito reutilizáveis.`);
    if (manifest.photoId !== photo.id || manifest.license !== photo.license_code || manifest.attribution !== photo.attribution)
      throw diagnostic('E_INAT_CAPTURE_MISMATCH', `Foto, licença ou atribuição do registro ${observation.id} divergem do manifesto.`);
    if (typeof manifest.licenseUrl !== 'string' || !manifest.licenseUrl.startsWith('https://creativecommons.org/'))
      throw diagnostic('E_INAT_LICENSE', `A foto ${photo.id} não preserva o endereço da licença.`);
    if (context.mediaDigests?.get(observation.id) !== manifest.sha256)
      throw diagnostic('E_INAT_MEDIA_INTEGRITY', `O arquivo local do registro ${observation.id} diverge do SHA-256 registrado.`);
    if (typeof observation.observed_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(observation.observed_on))
      throw diagnostic('E_INAT_DATE', `O registro ${observation.id} não contém data observada completa.`);
    if (!observation.taxon?.name || !observation.taxon?.rank || !observation.place_guess || !observation.user?.login)
      throw diagnostic('E_INAT_METADATA', `O registro ${observation.id} não contém taxon, localidade ou observador suficientes.`);
    const column = nearestIndex(INATURALIST_SOURCE.longitudes, longitude);
    const row = nearestIndex(INATURALIST_SOURCE.latitudes, latitude);
    const gridIndex = row * INATURALIST_SOURCE.shape[0] + column;
    values[gridIndex] = (values[gridIndex] ?? 0) + 1;
    records.push({
      id: `inaturalist:observation:${observation.id}`,
      observationId: observation.id,
      status: 'CAPTURED-REAL',
      speciesOrTaxon: observation.taxon.name,
      taxon: { id: observation.taxon.id, name: observation.taxon.name, rank: observation.taxon.rank,
        iconicTaxon, preferredCommonName: observation.taxon.preferred_common_name ?? null },
      locality: observation.place_guess,
      coordinates: [longitude, latitude],
      observedOn: observation.observed_on,
      observer: { id: observation.user.id, login: observation.user.login, name: observation.user.name || observation.user.login },
      platform: 'iNaturalist', institution: INATURALIST_SOURCE.institution,
      originalUrl: observation.uri,
      gridIndex,
      image: {
        photoId: photo.id,
        author: authorFromAttribution(photo.attribution, photo.id),
        attribution: photo.attribution,
        license: photo.license_code.toUpperCase(),
        licenseUrl: manifest.licenseUrl,
        originalUrl: manifest.mediaOriginalUrl,
        dimensions: { ...photo.original_dimensions },
        observedDate: observation.observed_on,
        captureDate: context.manifest.capturedAt,
        localPath: manifest.localPath,
        localSha256: manifest.sha256,
      },
    });
  }
  const categories = records.reduce((counts, record) => {
    const key = record.taxon.iconicTaxon; counts[key] = (counts[key] ?? 0) + 1; return counts;
  }, {});
  if (categories.Plantae !== 2 || categories.Insecta !== 2)
    throw diagnostic('E_INAT_SELECTION', 'A captura deve conservar duas plantas e dois insetos.');
  const missing = values.flatMap((value, index) => value === null ? [{ index, status: 'unknown', reason: 'no-selected-record; not biological absence' }] : []);
  return freeze({
    kind: 'environmental-observation', adapter: INATURALIST_SOURCE.id, mode: 'captured', status: 'captured-real',
    declaration: { source: context.request.sourceLabel, time: context.request.timeLabel,
      scale: context.request.boundsLabel, domain: context.request.domainLabel, shape: [...INATURALIST_SOURCE.shape] },
    relationContext: { id: POWER_BOUNDS_LABEL, semantic: 'observed-organism-records',
      relationship: 'situated-computational-approximation', causal: false },
    source: { provider: INATURALIST_SOURCE.provider, institution: INATURALIST_SOURCE.institution,
      endpoint: INATURALIST_SOURCE.endpoint, requestUrl: context.requestUrl,
      documentation: INATURALIST_SOURCE.documentation, mediaHelp: INATURALIST_SOURCE.mediaHelp,
      attribution: 'Individual image credits and licenses are preserved per record.', reportedSources: ['iNaturalist community observations'] },
    retrieval: { retrievedAt: context.manifest.capturedAt, capturedAt: context.manifest.capturedAt,
      httpStatus: context.manifest.response.httpStatus, fixturePath: context.fixturePath,
      sha256: context.manifest.response.sha256, manifestPath: context.manifestPath },
    variable: { id: 'SELECTED_RECORD_COUNT', longName: 'Count of selected observation records mapped to a regional cell', unit: 'selected records' },
    time: { label: INATURALIST_TIME_LABEL, dates: records.map(record => ({ id: record.id, observedOn: record.observedOn })) },
    space: { requestedBounds: { ...INATURALIST_SOURCE.bounds }, longitudes: [...INATURALIST_SOURCE.longitudes],
      latitudes: [...INATURALIST_SOURCE.latitudes], mapping: 'nearest NASA POWER grid point for situated comparison; not a biological distribution' },
    shape: [...INATURALIST_SOURCE.shape], values, missing, records,
    epistemic: { statement: 'situated computational approximation', causalClaim: false,
      absenceMeaning: 'null means no selected record in this four-record capture; it does not mean organism absence' },
  });
}

async function responseJson(response, label) {
  if (!response.ok) throw diagnostic('E_INAT_FETCH', `${label} respondeu HTTP ${response.status}.`);
  try { return await response.json(); }
  catch { throw diagnostic('E_INAT_FETCH', `${label} não retornou JSON válido.`); }
}

async function sha256(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function loadInaturalistObservation(program, {
  fetchImpl = fetch, fixturePath = INATURALIST_FIXTURE_PATH, manifestPath = INATURALIST_MANIFEST_PATH,
} = {}) {
  const request = inaturalistRequestFromProgram(program);
  const requestUrl = inaturalistRequestUrl();
  const [fixtureResponse, manifestResponse] = await Promise.all([fetchImpl(fixturePath), fetchImpl(manifestPath)]);
  if (!fixtureResponse.ok) throw diagnostic('E_INAT_FETCH', `A captura iNaturalist respondeu HTTP ${fixtureResponse.status}.`);
  const [fixtureBytes, manifest] = await Promise.all([fixtureResponse.arrayBuffer(), responseJson(manifestResponse, 'O manifesto iNaturalist')]);
  const fixtureDigest = await sha256(fixtureBytes);
  if (manifest.requestUrl !== requestUrl || manifest.response.sha256 !== fixtureDigest || manifest.response.bytes !== fixtureBytes.byteLength)
    throw diagnostic('E_INAT_CAPTURE_INTEGRITY', 'A resposta iNaturalist local não corresponde ao manifesto, consulta, tamanho e SHA-256.');
  let raw;
  try { raw = JSON.parse(new TextDecoder().decode(fixtureBytes)); }
  catch { throw diagnostic('E_INAT_FETCH', 'A captura iNaturalist não contém JSON válido.'); }
  const mediaDigests = new Map();
  await Promise.all(manifest.records.map(async record => {
    const response = await fetchImpl(record.localPath);
    if (!response.ok) throw diagnostic('E_INAT_FETCH', `A foto local da observação ${record.observationId} respondeu HTTP ${response.status}.`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== record.bytes) throw diagnostic('E_INAT_MEDIA_INTEGRITY', `O tamanho da foto ${record.photoId} diverge do manifesto.`);
    mediaDigests.set(record.observationId, await sha256(bytes));
  }));
  return normalizeInaturalistResponse(raw, { request, requestUrl, manifest, mediaDigests, fixturePath, manifestPath });
}
