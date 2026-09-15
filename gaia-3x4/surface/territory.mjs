import { portraitObservation } from './observation.mjs';

const FONT = '"Consolas", "DejaVu Sans Mono", monospace';

function canvasContext(canvas) {
  const box = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(box.width * dpr));
  canvas.height = Math.max(1, Math.round(box.height * dpr));
  const context = canvas.getContext('2d');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, box.width, box.height);
  return { context, width: box.width, height: box.height };
}

function line(context, x1, y1, x2, y2, color = '#747a72', width = 1, dash = []) {
  context.save(); context.strokeStyle = color; context.lineWidth = width; context.setLineDash(dash);
  context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke(); context.restore();
}

function corners(context, x, y, width, height, color, extent = 28) {
  line(context, x, y, x + extent, y, color); line(context, x, y, x, y + extent, color);
  line(context, x + width, y, x + width - extent, y, color); line(context, x + width, y, x + width, y + extent, color);
  line(context, x, y + height, x + extent, y + height, color); line(context, x, y + height, x, y + height - extent, color);
  line(context, x + width, y + height, x + width - extent, y + height, color); line(context, x + width, y + height, x + width, y + height - extent, color);
}

function dimensions(width, height) {
  const portraitHeight = Math.min(height - 94, 590), portraitWidth = portraitHeight * .75;
  return { x: Math.round((width - portraitWidth) / 2), y: 42, width: portraitWidth, height: portraitHeight };
}

function drawBlank(context, frame) {
  corners(context, frame.x, frame.y, frame.width, frame.height, '#5e645d', 34);
  line(context, frame.x + frame.width * .5, frame.y - 9, frame.x + frame.width * .5, frame.y + 14, '#3d423d');
  line(context, frame.x - 9, frame.y + frame.height * .5, frame.x + 14, frame.y + frame.height * .5, '#3d423d');
  context.fillStyle = '#666c65'; context.font = `10px ${FONT}`;
  context.fillText('3:4 / WAITING FOR AN OBSERVATION', frame.x, frame.y + frame.height + 28);
}

function cellPosition(index, bounds, sourceWidth, frame) {
  const col = index % sourceWidth, row = Math.floor(index / sourceWidth);
  return { col, row, x: frame.x + (col - bounds.x) * frame.width / bounds.width,
    y: frame.y + (row - bounds.y) * frame.height / bounds.height,
    width: frame.width / bounds.width, height: frame.height / bounds.height };
}

function drawKnownCell(context, cell, normalized, raw, coordinate, index) {
  const padding = 7, x = cell.x + padding, y = cell.y + padding;
  const width = cell.width - padding * 2, height = cell.height - padding * 2;
  const tone = Math.round(42 + normalized * 160);
  context.fillStyle = `rgb(${Math.round(tone * .88)},${tone},${Math.round(tone * .9)})`;
  context.fillRect(x, y, width, height);
  const count = 2 + Math.round(normalized * 6), rise = Math.max(8, height * (.14 + normalized * .78));
  for (let n = 0; n < count; n++) {
    const at = x + width * (n + 1) / (count + 1);
    line(context, at, y + height - 5, at, y + height - rise, normalized > .56 ? '#111510' : '#b6bbb3', .55);
  }
  line(context, x, y + height - 4, x + width, y + height - 4, '#161a16', .65);
  context.fillStyle = normalized > .53 ? '#151915' : '#c3c8c0'; context.font = `8px ${FONT}`;
  context.fillText(String(raw), x + 4, y + 12);
  context.fillStyle = normalized > .53 ? '#283029' : '#90988f';
  context.fillText(`${coordinate?.[0] ?? '?'} / ${coordinate?.[1] ?? '?'}`, x + 4, y + height - 9);
  context.fillStyle = '#687067'; context.fillText(String(index).padStart(2, '0'), x + width - 17, y + 12);
}

function drawMissingCell(context, cell, index) {
  const x = cell.x + 7, y = cell.y + 7, width = cell.width - 14, height = cell.height - 14;
  corners(context, x, y, width, height, '#525852', 10);
  line(context, x + width * .28, y + height * .5, x + width * .72, y + height * .5, '#525852', .7, [2, 5]);
  context.fillStyle = '#626862'; context.font = `8px ${FONT}`; context.fillText(`? ${String(index).padStart(2, '0')}`, x + 4, y + 13);
}

function drawOutside(context, item, projection, frame, maximum) {
  const [sourceWidth, sourceHeight] = projection.inputShape;
  const bounds = projection.frame.parameters.bounds;
  const col = item.index % sourceWidth, row = Math.floor(item.index / sourceWidth);
  const sourceX = frame.x + (col + .5) / sourceWidth * frame.width;
  const sourceY = frame.y + (row + .5) / sourceHeight * frame.height;
  let x = sourceX, y = sourceY;
  if (col < bounds.x) x = frame.x - 29 - (bounds.x - col - 1) * 16;
  else if (col >= bounds.x + bounds.width) x = frame.x + frame.width + 29 + (col - bounds.x - bounds.width) * 16;
  if (row < bounds.y) y = frame.y - 10 - (bounds.y - row - 1) * 18;
  else if (row >= bounds.y + bounds.height) y = frame.y + frame.height + 17 + (row - bounds.y - bounds.height) * 16;
  const known = typeof item.value === 'number', strength = known && maximum > 0 ? Math.min(1, item.value / maximum) : 0;
  const length = known ? 8 + strength * 27 : 7;
  const color = known ? `rgba(174,185,172,${.42 + strength * .48})` : '#596059';
  const vertical = col < bounds.x || col >= bounds.x + bounds.width;
  if (vertical) {
    line(context, x, y - length / 2, x, y + length / 2, color, .8);
    line(context, x + 4, y - length / 2, x + 4, y + length / 2, color, .45, [2, 3]);
    line(context, x - 3, y - length / 2, x + 7, y - length / 2, color, .55);
  } else {
    line(context, x - length / 2, y, x + length / 2, y, color, .8);
    line(context, x - length / 2, y + 4, x + length / 2, y + 4, color, .45, [2, 3]);
    line(context, x - length / 2, y - 3, x - length / 2, y + 7, color, .55);
  }
  context.fillStyle = '#5f675f'; context.font = `7px ${FONT}`; context.fillText(String(item.index).padStart(2, '0'), x + 7, y - 5);
}

function drawHistorical(context, trace, frame) {
  if (!trace?.retained?.included?.length) return;
  const bounds = trace.parameters.bounds, [sourceWidth] = trace.inputShape;
  trace.includedIndices.forEach((index, offset) => {
    const value = trace.retained.included[offset]; if (typeof value !== 'number') return;
    const cell = cellPosition(index, bounds, sourceWidth, frame);
    const y = cell.y + cell.height - 13 - value * Math.max(5, cell.height - 26);
    line(context, cell.x + 10, y, cell.x + cell.width - 10, y, 'rgba(224,228,218,.56)', .7, [2, 4]);
  });
}

function drawAbsence(context, projection, frame) {
  if (!projection.absentIndices.length) return;
  const bounds = projection.frame.parameters.bounds, [sourceWidth] = projection.inputShape;
  for (const index of projection.absentIndices) {
    const cell = cellPosition(index, bounds, sourceWidth, frame), inset = 11;
    line(context, cell.x + inset, cell.y + inset, cell.x + cell.width - inset, cell.y + cell.height - inset, '#777d76', .8);
    line(context, cell.x + cell.width - inset, cell.y + inset, cell.x + inset, cell.y + cell.height - inset, '#777d76', .8);
  }
}

export function createTerritoryRenderer(canvas) {
  let projection = portraitObservation({ tick: 0, revision: 0, entries: [] }, []), traces = [], drawnCells = 0;
  function render() {
    const { context, width, height } = canvasContext(canvas), frame = dimensions(width, height);
    context.fillStyle = '#080a08'; context.fillRect(0, 0, width, height);
    if (!projection.frame || !projection.inputShape) {
      drawBlank(context, frame); drawnCells = 0; canvas.dataset.state = 'blank';
      canvas.setAttribute('aria-label', 'Moldura territorial 3 por 4 incompleta; nenhuma observação foi executada.'); return;
    }
    const bounds = projection.frame.parameters.bounds, [sourceWidth] = projection.inputShape;
    const rawValues = projection.environment?.values ?? [];
    const maximum = Math.max(0, ...rawValues.filter(value => typeof value === 'number'));
    corners(context, frame.x, frame.y, frame.width, frame.height, '#aeb5aa', 26);
    projection.excluded.forEach(item => drawOutside(context, item, projection, frame, maximum));
    drawnCells = 0;
    for (const item of projection.included) {
      const cell = cellPosition(item.index, bounds, sourceWidth, frame), raw = rawValues[item.index];
      if (typeof item.value === 'number' && typeof raw === 'number') { drawKnownCell(context, cell, item.value, raw, projection.environment?.space.coordinates[item.index], item.index); drawnCells++; }
      else drawMissingCell(context, cell, item.index);
    }
    drawHistorical(context, projection.historicalFrame, frame);
    drawAbsence(context, projection, frame);
    context.fillStyle = '#8b9288'; context.font = `10px ${FONT}`;
    const label = projection.environment ? `${projection.environment.variable.id} / ${projection.environment.variable.unit} / ${projection.environment.time.start} / ${projection.environment.status.toUpperCase()}` : 'NO OBSERVATION';
    context.fillText(label, frame.x, frame.y + frame.height + 28);
    context.textAlign = 'right'; context.fillStyle = '#626961';
    context.fillText(`${projection.inputShape.join('×')} → ${bounds.width}×${bounds.height} / ${projection.environment?.missing.length ?? 0} UNKNOWN`, frame.x + frame.width, frame.y + frame.height + 28);
    context.textAlign = 'left';
    canvas.dataset.state = projection.absentIndices.length ? 'absent' : 'observed';
    canvas.setAttribute('aria-label', `Retrato territorial 3 por 4 derivado de ${drawnCells} valores conhecidos; ${projection.excluded.length} resíduos externos; ${projection.environment?.missing.length ?? 0} valores desconhecidos; status ${projection.environment?.status ?? 'sem fonte'}.${projection.historicalFrame ? ' Estado anterior tracejado.' : ''}${projection.absentIndices.length ? ` ${projection.absentIndices.length} células ausentes após remoção explícita.` : ''}`);
  }
  const resize = new ResizeObserver(render); resize.observe(canvas);
  render();
  return {
    update(observation, nextTraces) { traces = nextTraces; projection = portraitObservation(observation, traces); render(); },
    inspect: () => ({ renderer: 'Canvas2D territorial field', state: canvas.dataset.state, frameAspect: .75,
      tick: projection.tick, includedIndices: projection.included.map(item => item.index), excludedIndices: projection.excluded.map(item => item.index),
      absentIndices: projection.absentIndices, historicalTraceId: projection.historicalFrame?.id ?? null,
      sourceStatus: projection.environment?.status ?? null, adapter: projection.environment?.adapter ?? null,
      missingCount: projection.environment?.missing.length ?? 0, drawnCells,
      dataDerived: Boolean(projection.environment && (drawnCells || projection.excluded.length || projection.absentIndices.length)) }),
    destroy() { resize.disconnect(); },
  };
}
