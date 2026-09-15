import { Diagnostic } from './parser.mjs';
import { freeze } from './runtime.mjs';

export const POWER_EXTERNAL_NAME = 'nasa_power_brasilia';
export const POWER_FIXTURE_PATH = '/data/nasa-power-brasilia-2025-01-15.raw.json';
export const POWER_MANIFEST_PATH = '/data/nasa-power-brasilia-2025-01-15.capture.json';
export const POWER_BOUNDS_LABEL = 'bbox -49,-17,-46.5,-14';
export const POWER_DOMAIN_LABEL = 'PRECTOTCORR mm/day';
export const POWER_SOURCE = Object.freeze({
  id: 'nasa-power-daily-regional-v0',
  provider: 'NASA POWER',
  endpoint: 'https://power.larc.nasa.gov/api/temporal/daily/regional',
  documentation: 'https://power.larc.nasa.gov/docs/services/api/temporal/daily/',
  rights: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy',
  attribution: 'NASA POWER; underlying meteorological source reported by the response.',
  parameter: 'PRECTOTCORR',
  community: 'AG',
  bounds: Object.freeze({ longitudeMin: -49, latitudeMin: -17, longitudeMax: -46.5, latitudeMax: -14 }),
});

const sourceModes = new Map([
  ['NASA POWER / captured', 'captured'],
  ['NASA POWER / live', 'live'],
]);

function adapterDiagnostic(code, message, location = {}) {
  return new Diagnostic(code, message, location);
}

function literal(node, label) {
  if (node?.kind === 'literal') return node.value;
  if (node?.kind === 'vector') return node.items.map(item => literal(item, label));
  throw adapterDiagnostic('E_POWER_PROGRAM', `${label} deve ser literal na linha source.`, node?.location);
}

function operations(node, found = []) {
  if (node?.kind === 'operation') {
    found.push(node);
    node.args.forEach(argument => operations(argument, found));
  } else if (node?.kind === 'vector') node.items.forEach(item => operations(item, found));
  return found;
}

export function powerRequestFromProgram(program) {
  const candidates = program.statements.flatMap(statement => statement.expressions.flatMap(expression => operations(expression)))
    .filter(node => node.id === 'situate' && node.args[5]?.kind === 'reference' && node.args[5].name === POWER_EXTERNAL_NAME);
  if (candidates.length !== 1)
    throw adapterDiagnostic('E_POWER_PROGRAM', `O programa deve conter exatamente uma linha source ligada a ${POWER_EXTERNAL_NAME}.`);
  const node = candidates[0];
  const sourceLabel = literal(node.args[0], 'A fonte');
  const mode = sourceModes.get(sourceLabel);
  if (!mode) throw adapterDiagnostic('E_POWER_MODE', 'Use "NASA POWER / captured" ou "NASA POWER / live".', node.args[0].location);
  const date = literal(node.args[1], 'A data');
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))
    throw adapterDiagnostic('E_POWER_DATE', 'A data deve usar AAAA-MM-DD.', node.args[1].location);
  if (literal(node.args[2], 'A janela') !== POWER_BOUNDS_LABEL)
    throw adapterDiagnostic('E_POWER_BOUNDS', `A fatia v0 usa exatamente "${POWER_BOUNDS_LABEL}".`, node.args[2].location);
  if (literal(node.args[3], 'A variável') !== POWER_DOMAIN_LABEL)
    throw adapterDiagnostic('E_POWER_VARIABLE', `A fatia v0 usa exatamente "${POWER_DOMAIN_LABEL}".`, node.args[3].location);
  const shape = literal(node.args[4], 'A forma');
  if (!Array.isArray(shape) || shape.length !== 2 || shape.some(value => !Number.isSafeInteger(value) || value < 1))
    throw adapterDiagnostic('E_POWER_SHAPE', 'A forma da fonte deve ser [largura altura].', node.args[4].location);
  return freeze({ mode, date, sourceLabel, boundsLabel: POWER_BOUNDS_LABEL, domainLabel: POWER_DOMAIN_LABEL, shape, location: node.location });
}

export function powerRequestUrl(request) {
  const date = request.date.replaceAll('-', '');
  const bounds = POWER_SOURCE.bounds;
  const query = new URLSearchParams({
    'latitude-min': String(bounds.latitudeMin),
    'latitude-max': String(bounds.latitudeMax),
    'longitude-min': String(bounds.longitudeMin),
    'longitude-max': String(bounds.longitudeMax),
    parameters: POWER_SOURCE.parameter,
    community: POWER_SOURCE.community,
    start: date,
    end: date,
    format: 'JSON',
    'time-standard': 'UTC',
  });
  return `${POWER_SOURCE.endpoint}?${query}`;
}

const coordinateKey = (longitude, latitude) => `${longitude}|${latitude}`;
const uniqueSorted = (values) => [...new Set(values)].sort((a, b) => a - b);
const steps = values => values.slice(1).map((value, index) => value - values[index]);

export function normalizePowerResponse(raw, context) {
  if (!raw || raw.type !== 'FeatureCollection' || !Array.isArray(raw.features))
    throw adapterDiagnostic('E_POWER_RESPONSE', 'A resposta NASA POWER não é uma FeatureCollection regional válida.');
  const header = raw.header;
  if (!header || typeof header.fill_value !== 'number' || !header.api || !Array.isArray(header.sources))
    throw adapterDiagnostic('E_POWER_RESPONSE', 'A resposta não contém o cabeçalho, fill value e fontes exigidos.');
  const parameter = raw.parameters?.[POWER_SOURCE.parameter];
  if (!parameter || typeof parameter.units !== 'string' || typeof parameter.longname !== 'string')
    throw adapterDiagnostic('E_POWER_RESPONSE', `A resposta não documenta ${POWER_SOURCE.parameter}.`);
  const dateKey = context.request.date.replaceAll('-', '');
  if (header.start !== dateKey || header.end !== dateKey)
    throw adapterDiagnostic('E_POWER_DATE_MISMATCH', 'A data retornada não corresponde à data pedida.');

  const points = new Map();
  for (const feature of raw.features) {
    const coordinates = feature?.geometry?.coordinates;
    if (feature?.geometry?.type !== 'Point' || !Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.slice(0, 2).every(Number.isFinite))
      throw adapterDiagnostic('E_POWER_COORDINATE', 'A resposta contém uma feição sem coordenadas de ponto válidas.');
    const [longitude, latitude, elevation = null] = coordinates;
    const key = coordinateKey(longitude, latitude);
    if (points.has(key)) throw adapterDiagnostic('E_POWER_DUPLICATE', `Coordenada repetida na resposta: ${key}.`);
    points.set(key, { longitude, latitude, elevation: Number.isFinite(elevation) ? elevation : null,
      rawValue: feature.properties?.parameter?.[POWER_SOURCE.parameter]?.[dateKey] });
  }
  const longitudes = uniqueSorted([...points.values()].map(point => point.longitude));
  const latitudes = uniqueSorted([...points.values()].map(point => point.latitude));
  if (!longitudes.length || !latitudes.length) throw adapterDiagnostic('E_POWER_EMPTY', 'A resposta regional não contém pontos.');

  const values = [], coordinates = [], elevations = [], missing = [];
  for (const latitude of latitudes) for (const longitude of longitudes) {
    const index = values.length, point = points.get(coordinateKey(longitude, latitude));
    coordinates.push([longitude, latitude]);
    elevations.push(point?.elevation ?? null);
    if (!point) {
      values.push(null); missing.push({ index, status: 'missing', reason: 'grid-point-absent' }); continue;
    }
    if (point.rawValue === header.fill_value) {
      values.push(null); missing.push({ index, status: 'unknown', reason: 'source-fill-value', raw: header.fill_value }); continue;
    }
    if (typeof point.rawValue !== 'number' || !Number.isFinite(point.rawValue)) {
      values.push(null); missing.push({ index, status: 'unknown', reason: 'non-numeric-or-absent-value', raw: point.rawValue ?? null }); continue;
    }
    values.push(point.rawValue);
  }
  const shape = [longitudes.length, latitudes.length];
  if (JSON.stringify(shape) !== JSON.stringify(context.request.shape))
    throw adapterDiagnostic('E_POWER_SHAPE_MISMATCH', `A resposta forma ${shape.join('×')}; o programa declarou ${context.request.shape.join('×')}.`, context.request.location);

  return freeze({
    kind: 'environmental-observation', adapter: POWER_SOURCE.id, mode: context.mode,
    status: context.mode === 'live' ? 'live' : 'captured-real',
    declaration: { source: context.request.sourceLabel, time: context.request.date,
      scale: context.request.boundsLabel, domain: context.request.domainLabel, shape },
    source: { provider: POWER_SOURCE.provider, endpoint: POWER_SOURCE.endpoint, requestUrl: context.requestUrl,
      documentation: POWER_SOURCE.documentation, rights: POWER_SOURCE.rights, attribution: POWER_SOURCE.attribution,
      reportedSources: [...header.sources] },
    retrieval: { retrievedAt: context.retrievedAt, httpStatus: context.httpStatus,
      ...(context.fixturePath ? { fixturePath: context.fixturePath, capturedAt: context.capturedAt, sha256: context.sha256 } : {}) },
    variable: { id: POWER_SOURCE.parameter, longName: parameter.longname, unit: parameter.units },
    time: { start: header.start, end: header.end, standard: header.time_standard },
    space: { requestedBounds: { ...POWER_SOURCE.bounds }, longitudes, latitudes, coordinates, elevations,
      longitudeSteps: steps(longitudes), latitudeSteps: steps(latitudes) },
    shape, values, missing,
    sourceMetadata: { title: header.title, api: { ...header.api }, fillValue: header.fill_value,
      messages: Array.isArray(raw.messages) ? [...raw.messages] : [] },
  });
}

async function jsonResponse(response, label) {
  if (!response.ok) throw adapterDiagnostic('E_POWER_FETCH', `${label} respondeu HTTP ${response.status}.`);
  try { return await response.json(); }
  catch { throw adapterDiagnostic('E_POWER_FETCH', `${label} não retornou JSON válido.`); }
}

async function sha256(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function loadPowerObservation(program, { fetchImpl = fetch, fixturePath = POWER_FIXTURE_PATH, manifestPath = POWER_MANIFEST_PATH } = {}) {
  const request = powerRequestFromProgram(program);
  const requestUrl = powerRequestUrl(request);
  if (request.mode === 'live') {
    const response = await fetchImpl(requestUrl, { headers: { accept: 'application/json' } });
    const retrievedAt = new Date().toISOString();
    const raw = await jsonResponse(response, 'NASA POWER');
    return normalizePowerResponse(raw, { mode: 'live', request, requestUrl, retrievedAt, httpStatus: response.status });
  }
  const [fixtureResponse, manifestResponse] = await Promise.all([fetchImpl(fixturePath), fetchImpl(manifestPath)]);
  if (!fixtureResponse.ok) throw adapterDiagnostic('E_POWER_FETCH', `A captura NASA POWER respondeu HTTP ${fixtureResponse.status}.`);
  const [fixtureText, manifest] = await Promise.all([fixtureResponse.text(), jsonResponse(manifestResponse, 'O manifesto da captura')]);
  let raw;
  try { raw = JSON.parse(fixtureText); }
  catch { throw adapterDiagnostic('E_POWER_FETCH', 'A captura NASA POWER não contém JSON válido.'); }
  if (manifest.requestUrl !== requestUrl)
    throw adapterDiagnostic('E_POWER_CAPTURE_MISMATCH', 'A captura offline não corresponde à data e consulta declaradas no editor.', request.location);
  const digest = await sha256(fixtureText);
  if (digest !== manifest.sha256 || new TextEncoder().encode(fixtureText).byteLength !== manifest.bytes)
    throw adapterDiagnostic('E_POWER_CAPTURE_INTEGRITY', 'A captura offline não corresponde ao SHA-256 e tamanho registrados.');
  return normalizePowerResponse(raw, { mode: 'captured', request, requestUrl, retrievedAt: manifest.retrievedAt,
    httpStatus: manifest.httpStatus, fixturePath, capturedAt: manifest.retrievedAt, sha256: manifest.sha256 });
}
