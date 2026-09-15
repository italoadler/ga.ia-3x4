const FONT = '"Consolas", "DejaVu Sans Mono", "Segoe UI Symbol", monospace';

function context(canvas) {
  const box = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, box.width, box.height);
  return { ctx, width: box.width, height: box.height };
}

function rule(ctx, x1, y1, x2, y2, color = '#666666') {
  ctx.strokeStyle = color; ctx.lineWidth = .6;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

export function renderField(canvas, observation) {
  const { ctx, width, height } = context(canvas);
  const values = observation.entries.map(e => e.value);
  const inside = values.find(v => v?.kind === 'field' && v.partition?.role === 'included');
  const outside = values.find(v => v?.kind === 'field' && v.partition?.role === 'excluded');
  const cut = values.find(v => v?.operation === 'frame' && v.kind === 'trace');
  if (!inside || !outside || !cut) {
    ctx.font = `12px ${FONT}`; ctx.fillStyle = '#a6a6a6';
    ctx.fillText('◉ nenhum par de frame selecionado nesta observação', 12, 45);
    return;
  }
  const [sourceWidth, sourceHeight] = outside.shape, bounds = cut.parameters.bounds;
  const exteriorStates = new Map(outside.surface?.fragments.map(f => [f.projectedIndex, f.state]) ?? []);
  const cell = Math.min((height - 70) / sourceHeight, (width - 85) / sourceWidth);
  const squareWidth = sourceWidth * cell, squareHeight = sourceHeight * cell;
  const originX = (width - squareWidth) / 2, originY = 35;
  const portraitX = originX + bounds.x * cell, portraitY = originY + bounds.y * cell;
  const portraitWidth = bounds.width * cell, portraitHeight = bounds.height * cell;
  ctx.font = `9px ${FONT}`;
  ctx.fillStyle = '#858585'; ctx.fillText('FORA', originX + 2, 18);
  ctx.fillStyle = '#d9d9d9'; ctx.fillText('DENTRO / NORMALIZADO', portraitX + 4, 18);
  for (let row = 0; row < sourceHeight; row++) for (let col = 0; col < sourceWidth; col++) {
    const index = row * sourceWidth + col, value = outside.value?.[index];
    if (value === null || value === undefined) continue;
    const x = originX + col * cell, y = originY + row * cell;
    if (exteriorStates.get(index) === 'discarded') { rule(ctx, x + 8, y + 8, x + cell - 8, y + cell - 8, '#898989'); rule(ctx, x + cell - 8, y + 8, x + 8, y + cell - 8, '#898989'); continue; }
    ctx.strokeStyle = '#434343'; ctx.lineWidth = .5; ctx.strokeRect(x + 3, y + 3, cell - 6, cell - 6);
    // Exterior is never renormalized: a constant witness mark plus the raw numeric label.
    rule(ctx, x + 8, y + 9, x + cell - 8, y + 9, '#a7a7a7');
    ctx.fillStyle = '#a7a7a7'; ctx.font = `9px ${FONT}`;
    const exact = String(value), label = exact.length <= 6 ? exact : `≈${value.toFixed(2)}`;
    ctx.fillText(label, x + 8, y + cell - 10);
  }
  const [iw, ih] = inside.shape;
  for (let row = 0; row < ih; row++) for (let col = 0; col < iw; col++) {
    const value = inside.value?.[row * iw + col];
    const x = portraitX + col * cell, y = portraitY + row * cell;
    if (inside.surface?.fragments[row * iw + col]?.state === 'discarded') { rule(ctx, x + 8, y + 8, x + cell - 8, y + cell - 8, '#898989'); rule(ctx, x + cell - 8, y + 8, x + 8, y + cell - 8, '#898989'); continue; }
    if (value === undefined) { ctx.strokeStyle = '#252525'; ctx.lineWidth = .5; ctx.strokeRect(x + .6, y + .6, cell - 1.2, cell - 1.2); continue; }
    // One declared observation encoding: normalized value → linear grayscale (0…255).
    const tone = Math.round(value * 255);
    ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
    ctx.fillRect(x + .6, y + .6, cell - 1.2, cell - 1.2);
    ctx.strokeStyle = value > .5 ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.18)';
    ctx.lineWidth = .5;
    ctx.beginPath(); ctx.moveTo(x + 5, y + cell - 5); ctx.lineTo(x + cell - 5, y + cell - 5); ctx.stroke();
    // Small coordinate witnesses are observational marks, not additional transformations.
    ctx.fillStyle = value > .5 ? '#222222' : '#969696'; ctx.font = `7px ${FONT}`;
    ctx.fillText(String(row * iw + col).padStart(3, '0'), x + 5, y + 10);
  }
  ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = .8;
  ctx.strokeRect(portraitX, portraitY, portraitWidth, portraitHeight);
  const d = 12;
  for (const [x, y, sx, sy] of [[portraitX, portraitY, -1, -1], [portraitX + portraitWidth, portraitY, 1, -1], [portraitX, portraitY + portraitHeight, -1, 1], [portraitX + portraitWidth, portraitY + portraitHeight, 1, 1]]) {
    rule(ctx, x + sx * 5, y, x + sx * d, y, '#d8d8d8');
    rule(ctx, x, y + sy * 5, x, y + sy * d, '#d8d8d8');
  }
  ctx.font = `9px ${FONT}`; ctx.fillStyle = '#777777';
  ctx.fillText(`${inside.shape.join(' × ')} / ${cut.id} / t ${cut.tick}`, portraitX, originY + squareHeight + 24);
  ctx.textAlign = 'right';
  ctx.fillText('fora: valores originais', originX + squareWidth, originY + squareHeight + 24);
  ctx.textAlign = 'left';
  const lostFragments = [...(inside.surface?.fragments ?? []), ...(outside.surface?.fragments ?? [])].filter(f => f.state === 'discarded').length;
  canvas.setAttribute('aria-label', `Retrato ${iw} por ${ih}, ${inside.value?.length ?? 0} células incluídas${inside.discarded ? '; valor descartado, perda registrada' : ''}; ${cut.excludedIndices.length} células externas preservadas.${lostFragments ? ` ${lostFragments} fragmentos descartados, sem suporte material; cruzes marcam ausência.` : ''} ${cut.id}, tick ${cut.tick}.`);
}

export function renderHistory(canvas, traces, currentTick) {
  const { ctx, width } = context(canvas);
  const frames = traces.filter(t => t.operation === 'frame' && t.tick < currentTick);
  const visible = frames.slice(-6).reverse();
  ctx.font = `9px ${FONT}`;
  if (!visible.length) {
    ctx.fillStyle = '#686868';
    ctx.fillText('tick 0 / nenhum recorte anterior disponível', 0, 18);
    rule(ctx, 0, 33, width, 33, '#303030');
  }
  visible.forEach((trace, row) => {
    const y = row * 21;
    ctx.fillStyle = row ? '#777777' : '#c4c4c4';
    ctx.fillText(`t ${String(trace.tick).padStart(4, '0')}`, 0, y + 11);
    ctx.fillStyle = '#777777'; ctx.fillText(trace.id, 67, y + 11);
    const left = 142, span = Math.max(1, width - left), values = trace.retained.included;
    values.forEach((value, i) => {
      const tone = Math.round(value * (row ? 150 : 220));
      ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
      ctx.fillRect(left + span * i / values.length, y + 1, Math.max(.4, span / values.length - .5), 12);
    });
    rule(ctx, 0, y + 17, width, y + 17, '#252525');
  });
  return { total: frames.length, visible: visible.length };
}
