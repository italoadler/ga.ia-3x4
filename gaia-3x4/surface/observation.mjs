// A projection of already-computed runtime results. No framing, normalization,
// provenance merge or temporal lookup is performed by the renderer.
export function portraitObservation(observation, traces) {
  const records = new Map(traces.map(t => [t.id, t]));
  const values = observation.entries.map(e => e.value);
  const inside = values.find(v => v?.kind === 'field' && v.partition?.role === 'included');
  const outside = values.find(v => v?.kind === 'field' && v.partition?.role === 'excluded');
  const frame = values.find(v => v?.kind === 'trace' && v.operation === 'frame') ?? records.get(inside?.partition?.traceId ?? outside?.partition?.traceId);
  const memory = values.find(v => v?.kind === 'memory' && v.available && v.field?.partition?.role === 'included');
  const history = values.find(v => v?.kind === 'trace-view' && v.operation === 'frame' && v.available);
  const sourceObservations = new Map();
  for (const value of values) for (const source of value?.observations ?? (value?.environment ? [value.environment] : []))
    sourceObservations.set(source.adapter, source);
  for (const source of frame?.sourceObservations ?? []) sourceObservations.set(source.adapter, source);
  const observations = [...sourceObservations.values()];
  const environment = observations.find(source => source.relationContext?.semantic === 'environmental-precipitation-field')
    ?? inside?.environment ?? outside?.environment ?? values.find(v => v?.environment)?.environment ?? null;
  const living = observations.find(source => source.relationContext?.semantic === 'observed-organism-records') ?? null;
  const lossIds = new Set([
    ...values.filter(v => v?.operation === 'discard').map(v => v.id),
    ...values.filter(v => v?.discarded).map(v => v.lossId),
  ]);
  const included = inside?.value ? inside.partition.sourceIndices.map((index, k) => ({ index, value: inside.value[k] })) : [];
  const excluded = outside?.value ? outside.partition.sourceIndices.map(index => ({ index, value: outside.value[index] })) : [];
  const ghosts = memory?.field?.value ? memory.field.partition.sourceIndices.map((index, k) => ({ index, value: memory.field.value[k] })) : [];
  const temporalFrames = frame?.temporal?.timeline ?? inside?.partition?.motion?.timeline ?? outside?.partition?.motion?.timeline
    ?? traces.filter(trace => trace.operation === 'frame' && trace.temporal).slice(-24)
      .map(trace => ({ id: trace.id, tick: trace.tick, revision: trace.revision, ...trace.temporal }));
  return {
    tick: observation.tick, revision: observation.revision, frame: frame ?? null,
    inputShape: frame?.inputShape ?? null, included, excluded, ghosts,
    memoryTick: memory?.requestedTick ?? null, memoryTraceId: memory?.field?.partition?.traceId ?? null,
    historicalFrame: history?.latest ?? null,
    environment, living, observations,
    memoryField: memory?.field ?? null,
    relationTemporal: inside?.relationTemporal ?? outside?.relationTemporal ?? null,
    organismLifecycle: inside?.sourceLifecycle ?? outside?.sourceLifecycle ?? null,
    frameTemporal: frame?.temporal ?? inside?.partition?.motion ?? outside?.partition?.motion ?? null,
    frameTrail: temporalFrames,
    selectedRecordId: frame?.selectedRecordId ?? inside?.partition?.selectedRecordId ?? outside?.partition?.selectedRecordId ?? null,
    recordSelector: frame?.recordSelector ?? inside?.partition?.recordSelector ?? outside?.partition?.recordSelector ?? 0,
    memoryTemporal: memory?.temporal ?? null,
    lossTransition: inside?.lossLifecycle ?? null,
    absentIndices: inside?.discarded ? inside.partition.sourceIndices : [],
    losses: [...lossIds].map(id => records.get(id)).filter(Boolean),
    sources: values.filter(v => v?.kind === 'field' && v.origin === 'situate').map(v => ({ id: v.id, provenance: v.provenance, shape: v.shape, discarded: v.discarded })),
    selectedNames: observation.entries.map(e => e.name),
  };
}

// Labour states and identities have already been computed in the transaction.
// Selection is pure: no new frame, loss, temporal lookup or provenance decision.
export function labourObservation(observation, traces) {
  const values = observation.entries.map(e => e.value), byId = new Map(traces.map(t => [t.id, t]));
  const earth = values.find(v => v?.surface && !v.partition);
  const inside = values.find(v => v?.surface && v.partition?.role === 'included');
  const outside = values.find(v => v?.surface && v.partition?.role === 'excluded');
  const selectedSurface = earth?.surface ?? inside?.surface ?? outside?.surface;
  const frame = byId.get(inside?.partition?.traceId ?? outside?.partition?.traceId);
  const selected = [...(inside?.surface.fragments ?? []), ...(outside?.surface.fragments ?? [])];
  const fragments = selected.length ? selected : earth?.surface.fragments ?? [];
  const memory = values.find(v => v?.kind === 'memory' && v.available && v.field?.surface);
  const opening = values.find(v => v?.kind === 'trace-view' && v.available && v.operation === 'relate' && v.latest?.surface);
  const priorFrame = values.find(v => v?.kind === 'trace-view' && v.available && v.operation === 'frame');
  const discourse = values.find(v => v?.domain === 'discurso');
  const situated = values.filter(v => v?.labour && !v.discarded);
  const losses = values.filter(v => v?.operation === 'discard');
  const allRecords = [...(selectedSurface?.records ?? []), ...(memory?.field.surface.records ?? []), ...situated.flatMap(v => v.labour.records), ...losses.flatMap(v => v.retainedRecords ?? [])];
  const records = [...new Map(allRecords.map(r => [r.id, r])).values()];
  return { tick: observation.tick, revision: observation.revision, earthId: selectedSurface?.earthId ?? null,
    fragments, records, situated, frame: frame ?? null, openingTraceId: opening?.latest.id ?? null,
    accessTraceId: opening?.accessTraceId ?? null, exposed: Boolean(opening),
    discourse: discourse && !discourse.discarded ? discourse.value : [], smoke: Boolean(discourse && !discourse.discarded),
    baseVisible: values.some(v => v?.domain === 'superficie-trabalho' && !v.discarded),
    ghosts: memory?.field.surface.fragments.filter(f => f.state !== 'discarded').map(f => ({ ...f, state: 'remembered' })) ?? [],
    memoryTick: memory?.requestedTick ?? null, historicalFrame: priorFrame?.latest ?? null,
    losses, projection: selectedSurface?.projection ?? null, derivation: selectedSurface?.derivation ?? null,
    selectedNames: observation.entries.map(e => e.name) };
}
