import { Diagnostic, parse } from './parser.mjs';
import { normalizeOperation, operation } from './registry.mjs';
import { LABOUR_DOMAIN, validateLabourInput, labourSituation, constructLabourSurface } from './labour.mjs';

export function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const unique = list => [...new Set(list)];
const provenanceUnion = fields => {
  const result = new Map();
  fields.forEach(f => f.provenance.forEach(p => result.set(JSON.stringify(p), p)));
  return [...result.values()];
};
const historyUnion = fields => unique(fields.flatMap(f => f.history));
const observationUnion = fields => {
  const result = new Map();
  for (const field of fields) for (const observed of field.observations ?? (field.environment ? [field.environment] : []))
    result.set(observed.adapter, observed);
  return [...result.values()];
};

// A small deterministic fingerprint identifies a loss. It is not a cryptographic hash.
function fingerprint(value) {
  let hash = 2166136261;
  for (const c of JSON.stringify(value)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

export class SituatedField {
  constructor(properties) {
    Object.assign(this, { kind: 'field', active: true, discarded: false, history: [] }, properties);
    freeze(this);
  }
}

export class Relation {
  constructor(properties) {
    Object.assign(this, { kind: 'relation', active: true, revisionHistory: [], consequences: [] }, properties);
    freeze(this);
  }
}

export class World {
  constructor({ labourInput = null } = {}) {
    this.labourInput = labourInput ? freeze(validateLabourInput(labourInput)) : null;
    this.recordLosses = new Map();
    this.tick = 0;
    this.fields = new Map();
    this.bindings = new Map();
    this.relations = new Map();
    this.sourceObservations = new Map();
    this.traces = [];
    this.revisions = [];
    this.snapshots = new Map([[0, { fields: new Map(), bindings: new Map() }]]);
  }
  observe(names = [...this.bindings.keys()]) {
    return freeze({
      kind: 'observation', tick: this.tick, revision: this.revisions.length,
      entries: names.map(name => ({ name, value: this.bindings.get(name) ?? null })),
    });
  }
  inspect() {
    return {
      tick: this.tick, fields: Object.fromEntries(this.fields), bindings: Object.fromEntries(this.bindings),
      relations: Object.fromEntries(this.relations), traces: this.traces,
      sourceObservations: Object.fromEntries(this.sourceObservations),
      revisions: this.revisions, snapshotTicks: [...this.snapshots.keys()],
      ...(this.labourInput ? { labourInput: this.labourInput, recordLosses: Object.fromEntries(this.recordLosses) } : {}),
    };
  }
}

class Transaction {
  constructor(world, program, source, patch, inputs = {}) {
    this.base = world;
    this.tick = world.tick + 1;
    this.fields = new Map(world.fields);
    this.bindings = new Map(world.bindings);
    this.relations = new Map(world.relations);
    this.sourceObservations = new Map(world.sourceObservations);
    this.traces = [...world.traces];
    this.revisions = [...world.revisions];
    this.snapshots = new Map(world.snapshots);
    this.recordLosses = new Map(world.recordLosses);
    this.program = program;
    this.source = source;
    this.patch = patch;
    this.revision = patch ? world.revisions.length + 1 : world.revisions.length;
    this.usedFields = new Set();
    this.usedRelations = new Set();
    this.assigned = new Set();
    this.observedNames = [];
    this.effects = [];
    this.operations = [];
    this.executionLocation = null;
    this.inputs = new Map(Object.entries(inputs).map(([name, value]) => [name, freeze(value)]));
  }

  fail(code, message, location) { throw new Diagnostic(code, message, location); }
  trace(operation, properties) {
    const record = freeze({
      kind: 'trace', id: `trace:${this.traces.length + 1}`, operation,
      tick: this.tick, revision: this.revision, ...properties,
      sourceLocation: this.executionLocation,
    });
    this.traces.push(record);
    this.effects.push(record.id);
    return record;
  }

  resolve(value, location) {
    if (value?.kind !== 'reference') return value;
    if (this.inputs.has(value.name)) return this.inputs.get(value.name);
    if (!this.assigned.has(value.name))
      this.fail('E_ORDER', `${value.name} ainda não foi executado nesta revisão; as linhas seguem de cima para baixo.`, location);
    return this.bindings.get(value.name);
  }

  field(value, location) {
    const resolved = this.resolve(value, location);
    if (resolved?.kind === 'memory') {
      if (!resolved.available) this.fail('E_MEMORY_UNAVAILABLE', `Não há ${resolved.name} no tick ${resolved.requestedTick}.`, location);
      if (resolved.field.discarded) this.fail('E_DISCARDED', `A memória de ${resolved.name} já perdeu seu valor.`, location);
      return resolved.field;
    }
    if (resolved?.kind !== 'field') this.fail('E_TYPE_FIELD', 'A operação exige um campo situado.', location);
    if (resolved.discarded) this.fail('E_DISCARDED', `${resolved.name} foi descartado; declare uma nova origem com outro nome.`, location);
    return resolved;
  }

  literal(value, location) {
    const resolved = this.resolve(value, location);
    if (Array.isArray(resolved)) return resolved.map(v => this.literal(v, location));
    if (resolved?.kind === 'field' || resolved?.kind === 'memory') this.fail('E_TYPE_VALUE', 'Esperado um valor literal, não um campo.', location);
    return resolved;
  }

  putField(name, properties) {
    const previous = this.fields.get(name);
    const field = new SituatedField({ id: previous?.id ?? `field:${name}`, name, ...properties });
    this.fields.set(name, field);
    // Existing aliases to the same identity must see a discard or update too.
    for (const [key, value] of this.bindings) if (value?.kind === 'field' && value.id === field.id) this.bindings.set(key, field);
    this.usedFields.add(name);
    return field;
  }

  situate(args, names, location) {
    const [declaredSource, time, scale, domain, shape, suppliedValues] = args.map(a => this.literal(a, location));
    const environmental = suppliedValues?.kind === 'environmental-observation' ? suppliedValues : null;
    const values = environmental ? environmental.values : suppliedValues;
    const source = environmental?.source?.provider ?? declaredSource;
    if (![declaredSource, time, scale, domain].every(v => typeof v === 'string' && v.length))
      this.fail('E_SITUATION', 'Origem, tempo, escala e domínio devem ser strings explícitas.', location);
    if (!Array.isArray(shape) || shape.length !== 2 || !shape.every(n => Number.isSafeInteger(n) && n > 0) || shape[0] * shape[1] > 1_000_000)
      this.fail('E_SHAPE', 'A forma exige [largura altura], positiva, com no máximo 1.000.000 de células.', location);
    if (!Array.isArray(values) || values.length !== shape[0] * shape[1] || !values.every(v => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)) || (environmental && v === null)))
      this.fail('E_VALUES', 'Os valores numéricos ou simbólicos devem preencher exatamente a forma.', location);
    if (environmental && !same(environmental.declaration, { source: declaredSource, time, scale, domain, shape }))
      this.fail('E_OBSERVATION_MISMATCH', 'A observação externa não corresponde à fonte, data, janela, variável e forma declaradas.', location);
    const name = names[0], existing = this.fields.get(name);
    const labour = domain === LABOUR_DOMAIN && values.every(v => typeof v === 'string') ? labourSituation(values, this.base.labourInput, location) : null;
    const seed = freeze({ source, time, scale, domain, shape, values, ...(environmental ? { declaredSource } : {}) });
    if (existing) {
      if (existing.origin !== 'situate') this.fail('E_INCOMPATIBLE_FIELD', `${name} já é um campo derivado. Use outro nome para esta origem.`, location);
      const old = existing.seed;
      if (!same([old.source, old.time, old.scale, old.domain, old.shape], [source, time, scale, domain, shape]))
        this.fail('E_INCOMPATIBLE_FIELD', `Mudança incompatível em ${name}: origem, tempo, escala, domínio ou forma. Declare um novo nome.`, location);
      const observationChanged = environmental && !same(existing.environment, environmental);
      if (same(old.values, values) && !observationChanged) {
        this.usedFields.add(name);
        if (!existing.active) {
          const event = this.trace('situate', { action: 'reactivate', sourceIds: [existing.id], parameters: seed });
          return [this.putField(name, { ...existing, active: true, history: [...existing.history, event.id] })];
        }
        return [existing];
      }
      if (existing.discarded) this.fail('E_DISCARDED_FIELD_RESEED', `${name} foi descartado e não pode receber novos valores silenciosamente. Use outro nome.`, location);
    }
    const event = this.trace('situate', {
      action: existing ? same(existing.seed.values, values) ? 'observation-refresh' : 'value-edit' : 'attach', sourceIds: [existing?.id ?? `field:${name}`],
      parameters: { source, declaredSource, time, scale, domain, shape, ...(environmental ? { observationStatus: environmental.status, adapter: environmental.adapter } : {}) },
      beforeFingerprint: existing ? fingerprint(existing.value) : null, afterFingerprint: fingerprint(values),
    });
    return [this.putField(name, {
      value: labour ? values.map(() => 1) : [...values], shape: [...shape], domain, scale, time, origin: 'situate', seed,
      ...(labour ? { labour } : {}), ...(environmental ? { environment: environmental, observations: [environmental] } : {}),
      provenance: [environmental ? { source, originalSource: environmental.source.requestUrl, observedAt: time,
        retrievedAt: environmental.retrieval.retrievedAt, status: environmental.status, attribution: environmental.source.attribution,
        reportedSources: environmental.source.reportedSources, variable: environmental.variable, fieldId: existing?.id ?? `field:${name}` }
        : { source, observedAt: time, fieldId: existing?.id ?? `field:${name}` },
        ...(labour ? labour.records.map(r => ({ recordId: r.id, evidenceStatus: r.evidenceStatus, ...r.provenance, observedAt: r.observedAt })) : [])],
      history: [...(existing?.history ?? []), event.id],
    })].map(field => {
      if (environmental) this.sourceObservations.set(environmental.adapter, environmental);
      return field;
    });
  }

  relate(args, names, location) {
    const transformation = this.literal(args[0], location), parameters = this.literal(args[1], location);
    const right = this.field(args[2], location), left = this.field(args[3], location);
    const sourceObservations = observationUnion([left, right]);
    const relationContexts = [left, right].map(field => (field.observations ?? (field.environment ? [field.environment] : []))[0]?.relationContext ?? null);
    const situatedApproximation = left.domain !== right.domain && relationContexts.every(Boolean)
      && relationContexts[0].id === relationContexts[1].id
      && relationContexts.every(context => context.relationship === 'situated-computational-approximation' && context.causal === false)
      && relationContexts[0].semantic !== relationContexts[1].semantic;
    if (!same(right.shape, left.shape) || right.scale !== left.scale || (right.domain !== left.domain && !situatedApproximation))
      this.fail('E_RELATION_SCHEMA', 'A relação exige formas, domínios e escalas compatíveis; uma conversão precisaria de rastro próprio.', location);
    const name = names[0], oldField = this.fields.get(name);
    if (oldField && oldField.origin !== 'relate') this.fail('E_INCOMPATIBLE_FIELD', `${name} não era o alvo de uma relação. Use outro nome.`, location);
    let value, correspondence;
    if (transformation === 'blend') {
      if (!Array.isArray(parameters) || parameters.length !== 2 || !Number.isFinite(parameters[0]) || parameters[0] < 0 || parameters[0] > 1 || !Number.isSafeInteger(parameters[1]))
        this.fail('E_PARAMETERS', 'blend exige [peso deslocamento_inteiro], com peso entre 0 e 1.', location);
      const environmental = Boolean(sourceObservations.length);
      if (![left, right].every(f => f.value.every(v => (typeof v === 'number' && Number.isFinite(v)) || (environmental && v === null))))
        this.fail('E_NUMERIC', 'blend exige campos numéricos completos.', location);
      const [weight, shift] = parameters, [width] = left.shape;
      const modulo = x => ((x % width) + width) % width;
      correspondence = left.value.map((_, index) => Math.floor(index / width) * width + modulo(index % width + shift));
      value = left.value.map((v, index) => v === null || right.value[correspondence[index]] === null ? null : (1 - weight) * v + weight * right.value[correspondence[index]]);
    } else if (transformation === 'transfer') {
      if (!Array.isArray(parameters) || parameters.length) this.fail('E_PARAMETERS', 'transfer exige um vetor de parâmetros vazio: [].', location);
      value = [...right.value];
      correspondence = value.map((_, i) => i);
    } else this.fail('E_TRANSFORM', 'Transformação desconhecida. v0 admite blend e transfer.', location);
    if (value.some(v => typeof v === 'number' && !Number.isFinite(v))) this.fail('E_NUMERIC_OVERFLOW', 'A relação produziu um valor não finito.', location);
    const temporalBehaviour = [args[3], args[2]].map(a => {
      const v = this.resolve(a, location);
      return v?.kind === 'memory' ? { mode: 'delayed', ticks: this.tick - v.requestedTick, sourceTick: v.requestedTick } : { mode: 'instantaneous' };
    });
    const sources = [left.id, right.id], relationId = `relation:${name}`;
    const previous = this.relations.get(relationId);
    // sourceTick is an execution fact, not a revision to temporal behaviour.
    const config = { sourceFields: sources, targetFields: [oldField?.id ?? `field:${name}`], transformation, parameters,
      temporalBehaviour: temporalBehaviour.map(({ mode, ticks }) => ({ mode, ...(ticks ? { ticks } : {}) })) };
    const changed = !previous || !same(previous.configuration, config) || !previous.active;
    const event = this.trace('relate', {
      relationId, sourceIds: sources, targetIds: config.targetFields, scale: left.scale,
      parameters, transformation, correspondence, temporalBehaviour,
      contributions: transformation === 'blend' ? { leftWeight: 1 - parameters[0], rightWeight: parameters[0] } : { leftWeight: 0, rightWeight: 1 },
      consequence: transformation === 'blend' ? 'weighted-combination-with-toroidal-column-shift' : 'transfer-with-retained-source-distinction',
      ...(situatedApproximation ? { relationship: { kind: 'situated-computational-approximation', causal: false,
        context: relationContexts[0].id, semantics: relationContexts.map(context => context.semantic) } } : {}),
    });
    const surface = constructLabourSurface(name, left.shape, left, right, correspondence, event.contributions, this.recordLosses, event.id);
    if (surface) {
      // Replace only this newly-created immutable event, retaining its ID.
      this.traces[this.traces.length - 1] = freeze({ ...event, surface, causalRecordIds: surface.records.map(r => r.id) });
      value = surface.fragments.map(f => value[f.surfaceIndex]);
    }
    const field = this.putField(name, {
      origin: 'relate', value, shape: left.shape, domain: left.domain, scale: left.scale,
      time: { tick: this.tick, observations: unique([left.time, right.time].map(t => JSON.stringify(t))).map(t => JSON.parse(t)) },
      provenance: provenanceUnion([left, right]), history: unique([...historyUnion([left, right]), ...(oldField?.history ?? []), event.id]),
      relationId,
      ...(sourceObservations.length ? { observations: sourceObservations } : {}),
      ...(left.environment && right.environment && left.environment.adapter === right.environment.adapter ? { environment: left.environment } : {}),
      ...(surface ? { surface } : {}),
    });
    this.relations.set(relationId, new Relation({
      id: relationId, name, ...config, configuration: freeze(config),
      revisionHistory: [...(previous?.revisionHistory ?? []), ...(changed ? [{ revision: this.revision, tick: this.tick, before: previous?.configuration ?? null, after: config }] : [])],
      consequences: [...(previous?.consequences ?? []), event.id],
      ...(surface ? { causalRecordIds: surface.records.map(r => r.id), fragmentIds: surface.fragments.map(f => f.id), projection: surface.projection } : {}),
    }));
    this.usedRelations.add(relationId);
    return [field];
  }

  frame(args, names, location) {
    const ratio = this.literal(args[0], location), anchorX = this.literal(args[1], location), anchorY = this.literal(args[2], location);
    const input = this.field(args[3], location);
    if (ratio?.kind !== 'ratio') this.fail('E_RATIO', 'frame exige uma proporção como 3:4.', location);
    if (![anchorX, anchorY].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1))
      this.fail('E_ANCHOR', 'As âncoras do recorte devem estar entre 0 e 1.', location);
    const environmental = Boolean(input.environment || input.observations?.length);
    if (!input.value.every(v => (typeof v === 'number' && Number.isFinite(v)) || (environmental && v === null))) this.fail('E_NUMERIC_FRAME', 'A normalização de frame v0 exige números completos.', location);
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const divisor = gcd(ratio.width, ratio.height), rw = ratio.width / divisor, rh = ratio.height / divisor;
    const [width, height] = input.shape, factor = Math.floor(Math.min(width / rw, height / rh));
    if (!factor) this.fail('E_FRAME_EMPTY', 'Não cabe um retângulo inteiro desta proporção no campo.', location);
    const cropWidth = rw * factor, cropHeight = rh * factor;
    const x = Math.round((width - cropWidth) * anchorX), y = Math.round((height - cropHeight) * anchorY);
    const indices = [], outside = [], mask = input.value.map(() => false);
    for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
      const index = row * width + col;
      if (col >= x && col < x + cropWidth && row >= y && row < y + cropHeight) { indices.push(index); mask[index] = true; }
      else outside.push(index);
    }
    const selected = indices.map(i => input.value[i]), known = selected.filter(v => v !== null);
    let min = known.length ? Infinity : null, max = known.length ? -Infinity : null;
    for (const v of known) { min = Math.min(min, v); max = Math.max(max, v); }
    if (known.length && max !== min && !Number.isFinite(max - min)) this.fail('E_NORMALIZATION_RANGE', 'A amplitude excede a normalização numérica de v0; nenhum recorte foi aplicado.', location);
    const normalized = selected.map(v => v === null ? null : max === min ? 0 : (v - min) / (max - min));
    const [includedName, excludedName] = names;
    for (const name of [includedName, excludedName]) {
      const old = this.fields.get(name);
      if (old && old.origin !== 'frame') this.fail('E_INCOMPATIBLE_FIELD', `${name} não era um resultado de frame. Use outro nome.`, location);
    }
    const includedId = this.fields.get(includedName)?.id ?? `field:${includedName}`;
    const excludedId = this.fields.get(excludedName)?.id ?? `field:${excludedName}`;
    const event = this.trace('frame', {
      sourceIds: [input.id], sourceProvenance: input.provenance, sourceTime: input.time,
      ...(input.observations?.length ? { sourceObservations: input.observations } : {}),
      scale: input.scale, domain: input.domain, inputShape: input.shape,
      transformation: ['integer-rectangular-selection', 'min-max-normalization'],
      parameters: { ratio: [ratio.width, ratio.height], anchor: [anchorX, anchorY], bounds: { x, y, width: cropWidth, height: cropHeight } },
      includedId, excludedId, includedIndices: indices, excludedIndices: outside,
      ...(input.surface ? {
        includedFragmentIds: indices.map(i => input.surface.fragments[i].id), excludedFragmentIds: outside.map(i => input.surface.fragments[i].id),
        projection: input.surface.projection, viewpoint: input.surface.projection.viewpoint,
        sourceRecordIds: input.surface.records.map(r => r.id),
        chain: ['situated-records', input.relationId, input.id, 'viewpoint', 'ranked-orthographic-projection', '3:4-frame'],
        retainedSurface: input.surface,
      } : {}),
      normalization: { method: 'min-max-known-values', minimum: min, maximum: max, constant: known.length > 0 && min === max,
        constantResult: known.length > 0 && min === max ? 0 : null, knownCount: known.length, missingCount: selected.length - known.length },
      consequence: { includedCount: indices.length, excludedCount: outside.length, resampled: false, excludedValuesRetained: true },
      // Enough retained material to inspect a prior portrait without recomputing it.
      retained: { included: normalized, includedShape: [cropWidth, cropHeight], excluded: outside.map(i => ({ index: i, value: input.value[i] })) },
    });
    const common = { origin: 'frame', domain: input.domain, scale: input.scale, time: { tick: this.tick, sourceTime: input.time }, provenance: input.provenance,
      ...(input.observations?.length ? { observations: input.observations } : {}),
      ...(input.environment ? { environment: input.environment } : {}) };
    const included = this.putField(includedName, {
      ...common, value: normalized, shape: [cropWidth, cropHeight],
      history: unique([...input.history, ...(this.fields.get(includedName)?.history ?? []), event.id]),
      partition: { traceId: event.id, sourceId: input.id, role: 'included', counterpartId: excludedId, sourceIndices: indices, bounds: event.parameters.bounds },
      ...(input.surface ? { surface: { ...input.surface, fragments: indices.map(i => ({ ...input.surface.fragments[i], state: input.surface.fragments[i].state === 'discarded' ? 'discarded' : 'included' })) } } : {}),
    });
    const excluded = this.putField(excludedName, {
      ...common, value: input.value.map((v, i) => mask[i] ? null : v), shape: input.shape,
      history: unique([...input.history, ...(this.fields.get(excludedName)?.history ?? []), event.id]),
      partition: { traceId: event.id, sourceId: input.id, role: 'excluded', counterpartId: includedId, sourceIndices: outside, bounds: event.parameters.bounds },
      ...(input.surface ? { surface: { ...input.surface, fragments: outside.map(i => ({ ...input.surface.fragments[i], state: input.surface.fragments[i].state === 'discarded' ? 'discarded' : 'excluded' })) } } : {}),
    });
    return [included, excluded, event];
  }

  remember(args, names, location) {
    const ticks = this.literal(args[0], location), reference = args[1];
    if (!Number.isSafeInteger(ticks) || ticks < 1) this.fail('E_TEMPORAL_BOUNDARY', 'remember exige um número inteiro de ticks ≥ 1.', location);
    if (reference?.kind !== 'reference') this.fail('E_MEMORY_REFERENCE', 'remember exige o nome explícito de um campo.', location);
    const previous = this.bindings.get(names[0]);
    const retainedWitness = previous?.kind === 'memory' && previous.field?.surface && previous.witness?.ticks === ticks && previous.name === reference.name;
    // A situated surface witness is persistent, like an unchanged situated seed.
    // Generic v0 memories retain their original sliding-tick semantics.
    // Editing the literal distance explicitly captures a different witness.
    const requestedTick = retainedWitness ? previous.requestedTick : this.tick - ticks;
    const state = this.snapshots.get(requestedTick)?.bindings.get(reference.name);
    const available = state?.kind === 'field';
    const event = this.trace('remember', {
      sourceIds: available ? [state.id] : [], parameters: { ticks, name: reference.name },
      boundary: { from: this.tick, to: requestedTick }, available,
      consequence: available ? 'historical-state-accessed' : 'historical-state-unavailable',
      ...(state?.surface ? { witnessMode: 'persistent-situated-snapshot', capturedAtTick: retainedWitness ? previous.witness.capturedAtTick : this.tick } : {}),
    });
    return [freeze({ kind: 'memory', name: reference.name, requestedTick, available, field: available ? state : null, traceId: event.id,
      ...(state?.surface ? { witness: { mode: 'persistent-situated-snapshot', ticks, capturedAtTick: retainedWitness ? previous.witness.capturedAtTick : this.tick } } : {}) })];
  }

  history(args, _names, location) {
    const id = normalizeOperation(this.literal(args[0], location));
    if (!id) this.fail('E_TRACE_ID', 'ID de operação desconhecido.', location);
    const previous = this.base.traces.filter(t => t.operation === id && t.tick < this.tick);
    const latest = previous.at(-1) ?? null;
    const event = this.trace('trace', {
      sourceIds: latest?.sourceIds ?? [], parameters: { operation: id, beforeTick: this.tick },
      accessedTraceId: latest?.id ?? null, available: Boolean(latest), consequence: 'explicit-historical-trace-access',
    });
    return [freeze({ kind: 'trace-view', operation: id, available: Boolean(latest), latest, ids: previous.map(t => t.id), accessTraceId: event.id })];
  }

  discard(args, _names, location) {
    const reason = this.literal(args[0], location), resolved = this.resolve(args[1], location);
    if (typeof reason !== 'string' || !reason.length) this.fail('E_LOSS_REASON', 'discard exige uma razão explícita entre aspas.', location);
    if (resolved?.kind !== 'field') this.fail('E_TYPE_FIELD', 'discard exige um campo atual; memórias permanecem testemunhos históricos.', location);
    if (resolved.discarded) return [this.traces.find(t => t.id === resolved.lossId)];
    const event = this.trace('discard', {
      sourceIds: [resolved.id], sourceProvenance: resolved.provenance, sourceTime: resolved.time,
      scale: resolved.scale, domain: resolved.domain, shape: resolved.shape,
      parameters: { reason }, loss: { count: resolved.value.filter(v => v !== null).length, fingerprint: fingerprint(resolved.value), recoverableFromLossRecord: false },
      consequence: 'current-value-removed-historical-snapshots-retained',
    });
    this.putField(resolved.name, { ...resolved, value: null, discarded: true, lossId: event.id, history: [...resolved.history, event.id] });
    if (resolved.labour) {
      const recordIds = [...new Set(resolved.labour.recordIds)];
      recordIds.forEach(id => this.recordLosses.set(id, event.id));
      const fragmentIds = new Set();
      for (const [name, field] of this.fields) if (field.surface) {
        const fragments = field.surface.fragments.map(f => {
          if (!f.recordIds.some(id => recordIds.includes(id))) return f;
          fragmentIds.add(f.id);
          return { ...f, state: 'discarded', lossIds: unique([...f.lossIds, event.id]) };
        });
        if (fragments.some((f, i) => f !== field.surface.fragments[i])) this.putField(name, { ...field, surface: { ...field.surface, fragments }, history: unique([...field.history, event.id]) });
      }
      const loss = freeze({ ...event, recordIds, fragmentIds: [...fragmentIds], loss: { ...event.loss, distinctRecordCount: recordIds.length, supportedFragmentCount: fragmentIds.size }, retainedRecords: resolved.labour.records });
      this.traces[this.traces.length - 1] = loss;
      return [loss];
    }
    return [event];
  }

  observe(args, _names, location) {
    if (!Array.isArray(args[0]) || !args[0].every(v => v?.kind === 'reference'))
      this.fail('E_OBSERVE', 'observe exige um vetor de nomes: [retrato fora anterior].', location);
    args[0].forEach(v => this.resolve(v, location));
    this.observedNames = args[0].map(v => v.name);
    return [];
  }

  evaluate(node, names, path) {
    if (node.kind === 'literal') return [node.value];
    if (node.kind === 'reference') return [{ kind: 'reference', name: node.name }];
    if (node.kind === 'vector') return [node.items.map((n, i) => this.evaluate(n, [`@${path}.${i}`], `${path}.${i}`)[0])];
    // Argument evaluation is deliberately right-to-left, including nested operations.
    const args = [];
    for (let i = node.args.length - 1; i >= 0; i--) args[i] = this.evaluate(node.args[i], [`@${path}.${i}`], `${path}.${i}`)[0];
    this.executionLocation = freeze({ line: node.location.line, column: node.location.column });
    const before = this.traces.length;
    const result = operation(node.id).implementation(this, args, names, node.location);
    this.operations.push(freeze({ id: node.id, location: this.executionLocation, names,
      traceIds: this.traces.slice(before).map(t => t.id), outputIds: result.map(v => v?.id).filter(Boolean) }));
    return result;
  }

  execute() {
    this.program.statements.forEach((statement, lineIndex) => {
      let offset = 0;
      const chunks = statement.expressions.map(node => {
        const count = node.kind === 'operation' ? node.outputs : 1;
        const names = statement.names.slice(offset, offset + count);
        offset += count;
        return { node, names };
      });
      const results = [];
      for (let i = chunks.length - 1; i >= 0; i--) {
        const { node, names } = chunks[i];
        results.unshift(...this.evaluate(node, names, `${statement.names[0] ?? 'observe'}.${i}`));
      }
      statement.names.forEach((name, i) => {
        const value = freeze(this.resolve(results[i], statement.location));
        this.bindings.set(name, value);
        this.assigned.add(name);
        if (value?.kind === 'field') this.usedFields.add(value.name);
      });
    });
    if (this.patch) {
      for (const [name, value] of this.base.bindings) if (!this.assigned.has(name)) {
        this.trace('program-omission', { parameters: { name, type: value?.kind ?? 'literal' }, sourceIds: value?.id ? [value.id] : [], consequence: 'binding-retired-history-retained' });
        this.bindings.delete(name);
      }
      for (const [name, field] of this.fields) if (field.active && !this.usedFields.has(name)) {
        const event = this.trace('program-omission', { sourceIds: [field.id], parameters: { name }, consequence: 'field-retired-history-retained' });
        this.fields.set(name, new SituatedField({ ...field, active: false, history: [...field.history, event.id] }));
      }
      for (const [id, relation] of this.relations) if (relation.active && !this.usedRelations.has(id)) {
        const event = this.trace('program-omission', { sourceIds: relation.sourceFields, relationId: id, consequence: 'relation-deactivated-history-retained' });
        this.relations.set(id, new Relation({ ...relation, active: false, consequences: [...relation.consequences, event.id] }));
      }
      this.revisions.push(freeze({ id: `revision:${this.revision}`, tick: this.tick, source: this.source, effects: this.effects }));
    }
    this.snapshots.set(this.tick, { fields: new Map(this.fields), bindings: new Map(this.bindings) });
    // No mutation of the live World happens until every statement and check succeeds.
    Object.assign(this.base, {
      tick: this.tick, fields: this.fields, bindings: this.bindings, relations: this.relations,
      traces: this.traces, revisions: this.revisions, snapshots: this.snapshots,
      recordLosses: this.recordLosses, sourceObservations: this.sourceObservations,
    });
    return this.base.observe(this.observedNames);
  }
}

export class Interpreter {
  constructor(options = {}) {
    this.world = new World(options);
    this.program = null;
    this.source = '';
    this.observation = this.world.observe([]);
    this.diagnostic = null;
    this.execution = null;
    this.inputs = {};
  }
  run(program, source, patch, inputs = this.inputs) {
    try {
      const tx = new Transaction(this.world, program, source, patch, inputs);
      const observation = tx.execute();
      if (patch) { this.program = program; this.source = source; this.inputs = inputs; }
      this.observation = observation;
      this.execution = freeze({ tick: this.world.tick, revision: this.world.revisions.length, operations: tx.operations });
      this.diagnostic = null;
      return { ok: true, world: this.world, observation, execution: this.execution };
    } catch (error) {
      if (!(error instanceof Diagnostic)) throw error;
      this.diagnostic = error.toJSON();
      return { ok: false, world: this.world, diagnostic: this.diagnostic };
    }
  }
  apply(source, { inputs = {} } = {}) {
    try { return this.run(parse(source, { externalNames: Object.keys(inputs) }), source, true, inputs); }
    catch (error) {
      if (!(error instanceof Diagnostic)) throw error;
      this.diagnostic = error.toJSON();
      return { ok: false, world: this.world, diagnostic: this.diagnostic };
    }
  }
  step() {
    if (!this.program) return { ok: false, world: this.world, diagnostic: { code: 'E_NO_PROGRAM', message: 'Ainda não há um programa válido.', line: 1, column: 1 } };
    return this.run(this.program, this.source, false);
  }
}
