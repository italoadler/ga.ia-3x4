import { Diagnostic } from './parser.mjs';

export const LABOUR_DOMAIN = 'superficie-trabalho';
const statuses = ['waiting', 'active', 'approved', 'rejected', 'expired', 'unpaid'];
const evidence = ['synthetic', 'anonymized', 'documented'];
const keys = ['id', 'activity', 'observedAt', 'durationSeconds', 'location', 'compensation', 'paymentRegime', 'status', 'provenance', 'note', 'evidenceStatus'];
const fail = message => { throw new Diagnostic('E_LABOUR_INPUT', message); };
const text = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 500;

// Artist-supplied input, never a hidden renderer dataset. No personal identifiers
// are accepted by this schema; coarse location is explicit, not geocoded.
export function validateLabourInput(input) {
  if (input?.schema !== 'gaia.labour/1' || Object.keys(input).some(k => !['schema', 'title', 'records'].includes(k)) || !text(input.title) || !Array.isArray(input.records) || !input.records.length || input.records.length > 1000)
    fail('Esperado gaia.labour/1, título e 1–1000 registros.');
  const ids = new Set();
  for (const r of input.records) {
    if (!r || Object.keys(r).some(k => !keys.includes(k))) fail('Campo desconhecido; identificadores pessoais não pertencem a este formato.');
    if (!/^work-[a-z0-9-]{2,40}$/.test(r.id) || ids.has(r.id)) fail('ID anônimo work-* deve ser estável e único.');
    ids.add(r.id);
    if (![r.activity, r.observedAt, r.paymentRegime].every(text) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(r.observedAt) || !Number.isFinite(Date.parse(r.observedAt))) fail(`${r.id}: atividade, tempo ISO e regime são obrigatórios.`);
    if (!Number.isFinite(r.durationSeconds) || r.durationSeconds < 0) fail(`${r.id}: duração inválida.`);
    if (!text(r.location?.label) || !['synthetic-region', 'region', 'country'].includes(r.location?.scale) || Object.keys(r.location).some(k => !['label', 'scale'].includes(k))) fail(`${r.id}: use localização ampla, sem coordenadas.`);
    if (!Number.isFinite(r.compensation?.value) || r.compensation.value < 0 || !/^[A-Z]{3}$/.test(r.compensation.currency) || Object.keys(r.compensation).some(k => !['value', 'currency'].includes(k))) fail(`${r.id}: valor/moeda inválidos.`);
    if (!statuses.includes(r.status) || !evidence.includes(r.evidenceStatus)) fail(`${r.id}: status/evidência inválidos.`);
    if (!text(r.provenance?.source) || !text(r.provenance?.reference) || Object.keys(r.provenance).some(k => !['source', 'reference'].includes(k))) fail(`${r.id}: origem e referência explícitas são obrigatórias.`);
    if (r.note !== undefined && !text(r.note)) fail(`${r.id}: nota inválida.`);
    if (r.evidenceStatus === 'synthetic' && r.location.scale !== 'synthetic-region') fail(`${r.id}: situação sintética deve usar região sintética.`);
  }
  // Defensive copy: the caller cannot silently rewrite provenance after loading.
  return JSON.parse(JSON.stringify(input));
}

export function labourSituation(ids, input, location) {
  const records = new Map(input?.records.map(r => [r.id, r]) ?? []);
  if (!ids.every(id => records.has(id))) throw new Diagnostic('E_LABOUR_RECORD', 'Todo ID simbólico deve existir na entrada de trabalho autorizada.', location);
  const selected = [...new Set(ids)].map(id => records.get(id));
  return { recordIds: [...ids], records: selected, evidenceStatuses: [...new Set(selected.map(r => r.evidenceStatus))],
    derivation: { distinctRecordCount: selected.length, fragmentCount: ids.length, repeatedFragmentsAreNotAdditionalRecords: true } };
}

export const LABOUR_PROJECTION = Object.freeze({
  kind: 'ranked-orthographic-relational', radius: 1.72,
  viewpoint: { position: [0, 0, 12], target: [0, 0, 0], rotation: [0, 0, 0] },
  chart: 'orthographic y rank, then x rank in rows; front/back retained; not geographical coordinates',
  fragmentRatio: [3, 4],
});

// This projection belongs to the runtime. frame consumes this ordered field;
// the renderer receives identities, positions and the resulting partition.
export function constructLabourSurface(name, shape, left, right, correspondence, contributions, losses, traceId) {
  if (!left.labour && !right.labour && !left.surface && !right.surface) return null;
  const [width, height] = shape, radius = LABOUR_PROJECTION.radius;
  const fragments = Array.from({ length: width * height }, (_, index) => {
    const row = Math.floor(index / width), col = index % width;
    const theta = (row + .5) * Math.PI / height, phi = (col + .5) * Math.PI * 2 / width;
    const normal = [-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)];
    const supports = [];
    const take = (field, k, weight) => {
      if (!weight) return;
      const old = field.surface?.fragments[k];
      if (old) supports.push(...old.supports);
      else if (field.labour) supports.push({ recordId: field.labour.recordIds[k], sourceFieldId: field.id, weight });
    };
    take(left, index, contributions.leftWeight); take(right, correspondence[index], contributions.rightWeight);
    const recordIds = [...new Set(supports.map(s => s.recordId))];
    return { id: `fragment:field:${name}:${index}`, earthId: `field:${name}`, surfaceIndex: index,
      recordIds, supports, relationId: `relation:${name}`, derivationTraceId: traceId,
      position: normal.map(v => v * radius), normal, projection: [normal[0], normal[1]],
      state: recordIds.some(id => losses.has(id)) ? 'discarded' : 'included',
      lossIds: [...new Set(recordIds.map(id => losses.get(id)).filter(Boolean))] };
  });
  // A bijective ranked screen chart avoids colliding/disappearing records.
  fragments.sort((a, b) => b.projection[1] - a.projection[1] || a.surfaceIndex - b.surfaceIndex);
  for (let start = 0; start < fragments.length; start += width) {
    const row = fragments.slice(start, start + width).sort((a, b) => a.projection[0] - b.projection[0] || a.surfaceIndex - b.surfaceIndex);
    fragments.splice(start, width, ...row);
  }
  fragments.forEach((f, index) => { f.projectedIndex = index; });
  const allRecords = [...(left.labour?.records ?? left.surface?.records ?? []), ...(right.labour?.records ?? right.surface?.records ?? [])];
  const records = [...new Map(allRecords.map(r => [r.id, r])).values()];
  return { earthId: `field:${name}`, relationId: `relation:${name}`, projection: LABOUR_PROJECTION, fragments, records,
    derivation: { distinctRecordCount: new Set(fragments.flatMap(f => f.recordIds)).size, fragmentCount: fragments.length, repeatedFragmentsAreNotAdditionalRecords: true } };
}
