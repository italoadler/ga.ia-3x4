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
  const lossIds = new Set([
    ...values.filter(v => v?.operation === 'discard').map(v => v.id),
    ...values.filter(v => v?.discarded).map(v => v.lossId),
  ]);
  const included = inside?.value ? inside.partition.sourceIndices.map((index, k) => ({ index, value: inside.value[k] })) : [];
  const excluded = outside?.value ? outside.partition.sourceIndices.map(index => ({ index, value: outside.value[index] })) : [];
  const ghosts = memory?.field?.value ? memory.field.partition.sourceIndices.map((index, k) => ({ index, value: memory.field.value[k] })) : [];
  return {
    tick: observation.tick, revision: observation.revision, frame: frame ?? null,
    inputShape: frame?.inputShape ?? null, included, excluded, ghosts,
    memoryTick: memory?.requestedTick ?? null, memoryTraceId: memory?.field?.partition?.traceId ?? null,
    historicalFrame: history?.latest ?? null,
    absentIndices: inside?.discarded ? inside.partition.sourceIndices : [],
    losses: [...lossIds].map(id => records.get(id)).filter(Boolean),
    sources: values.filter(v => v?.kind === 'field' && v.origin === 'situate').map(v => ({ id: v.id, provenance: v.provenance, shape: v.shape, discarded: v.discarded })),
    selectedNames: observation.entries.map(e => e.name),
  };
}
