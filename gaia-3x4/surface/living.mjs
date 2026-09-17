import { portraitObservation } from './observation.mjs';

const FONT = '"Consolas", "DejaVu Sans Mono", "Segoe UI Symbol", monospace';

function canvasContext(canvas) {
  const box = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, box.width), height = Math.max(1, box.height);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  const context = canvas.getContext('2d');
  context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, width, height);
  return { context, width, height };
}

function line(context, x1, y1, x2, y2, color, width = 1, dash = []) {
  context.save(); context.strokeStyle = color; context.lineWidth = width; context.setLineDash(dash);
  context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke(); context.restore();
}

function corners(context, frame, color = '#d8e0d2', reach = 22) {
  const { x, y, width, height } = frame;
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + width, y, -1, 1], [x, y + height, 1, -1], [x + width, y + height, -1, -1]]) {
    line(context, cx, cy, cx + sx * reach, cy, color, .8);
    line(context, cx, cy, cx, cy + sy * reach, color, .8);
  }
}

function frameLayout(width, height) {
  const availableHeight = Math.max(280, height - 92);
  const portraitHeight = Math.min(availableHeight, Math.max(300, (width - 188) / .75));
  const portraitWidth = portraitHeight * .75;
  return { x: (width - portraitWidth) / 2, y: 24, width: portraitWidth, height: portraitHeight };
}

function livingObservation(sources) {
  return (sources ?? []).find(source => source.relationContext?.semantic === 'observed-organism-records') ?? null;
}

const recordByIdentity = (living, id) => living?.records?.find(record => record.id === id) ?? null;

function photoCrop(image, bounds, inputShape) {
  const [sourceWidth, sourceHeight] = inputShape;
  const anchorX = sourceWidth === bounds.width ? .5 : bounds.x / (sourceWidth - bounds.width);
  const anchorY = sourceHeight === bounds.height ? .5 : bounds.y / (sourceHeight - bounds.height);
  const imageAspect = image.naturalWidth / image.naturalHeight;
  let width, height;
  if (imageAspect > .75) { height = image.naturalHeight; width = height * .75; }
  else { width = image.naturalWidth; height = width / .75; }
  // A deliberate inner crop guarantees that the observation is never silently shown whole.
  width *= .86; height *= .86;
  return { x: (image.naturalWidth - width) * anchorX, y: (image.naturalHeight - height) * anchorY, width, height };
}

function drawPhoto(context, image, crop, frame, alpha, filter, offset = { x: 0, y: 0 }) {
  context.save(); context.globalAlpha = alpha; context.filter = filter;
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height,
    frame.x + offset.x, frame.y + offset.y, frame.width, frame.height);
  context.restore();
}

function drawWithdrawal(context, image, crop, frame, progress, alpha, filter) {
  const bands = 12, bandHeight = frame.height / bands;
  for (let band = 0; band < bands; band++) {
    const stagger = ((band % 3) - 1) * progress * 34;
    context.save();
    context.beginPath(); context.rect(frame.x - 48, frame.y + band * bandHeight, frame.width + 96, bandHeight + 1); context.clip();
    drawPhoto(context, image, crop, frame, alpha * (1 - progress * .78), filter, { x: stagger, y: progress * band * .7 });
    context.restore();
  }
}

function drawFrameTrail(context, frame, trail, inputShape) {
  if (!inputShape || trail.length < 2) return;
  const [sourceWidth, sourceHeight] = inputShape;
  trail.slice(0, -1).forEach((state, index, list) => {
    const bounds = state.currentBounds;
    if (!bounds) return;
    const age = (index + 1) / list.length;
    const dx = sourceWidth === bounds.width ? 0 : (bounds.x / (sourceWidth - bounds.width) - .5) * 42;
    const dy = sourceHeight === bounds.height ? 0 : (bounds.y / (sourceHeight - bounds.height) - .5) * 34;
    corners(context, { ...frame, x: frame.x + dx, y: frame.y + dy }, `rgba(157,174,154,${.025 + age * .075})`, 10 + age * 8);
  });
}

function drawFragments(context, image, crop, frame, emphasis = 1) {
  const left = Math.max(1, crop.x), right = Math.max(1, image.naturalWidth - crop.x - crop.width);
  const top = Math.max(1, crop.y), bottom = Math.max(1, image.naturalHeight - crop.y - crop.height);
  const margin = Math.max(34, Math.min(84, frame.width * .14));
  const pieces = [
    { source: [0, crop.y, left, crop.height], target: [frame.x - margin - 18, frame.y + frame.height * .13, margin, frame.height * .58] },
    { source: [crop.x + crop.width, crop.y, right, crop.height], target: [frame.x + frame.width + 18, frame.y + frame.height * .29, margin, frame.height * .58] },
    { source: [crop.x, 0, crop.width, top], target: [frame.x + frame.width * .09, frame.y - 18, frame.width * .68, 26] },
    { source: [crop.x, crop.y + crop.height, crop.width, bottom], target: [frame.x + frame.width * .23, frame.y + frame.height + 12, frame.width * .68, 26] },
  ];
  context.save(); context.globalCompositeOperation = 'screen'; context.filter = 'grayscale(1) contrast(1.28) brightness(.92)';
  pieces.forEach((piece, index) => {
    context.globalAlpha = (.22 + index * .025) * emphasis;
    context.drawImage(image, ...piece.source, ...piece.target);
    const [x, y, width, height] = piece.target;
    line(context, x, y + height + 3, x + width, y + height + 3, `rgba(201,211,197,${.22 * emphasis})`, .6, [2, 5]);
  });
  context.restore();
  return pieces.length;
}

function drawRainWitness(context, environment, frame, strength) {
  if (!environment?.values?.length) return;
  const known = environment.values.filter(Number.isFinite), maximum = Math.max(...known, 1);
  context.save(); context.globalCompositeOperation = 'screen';
  environment.values.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    const column = index % environment.shape[0], row = Math.floor(index / environment.shape[0]);
    const x = frame.x + (column + .5) / environment.shape[0] * frame.width;
    const y = frame.y + (row + .5) / environment.shape[1] * frame.height;
    const length = 5 + value / maximum * 29;
    line(context, x, y - length / 2, x - 3, y + length / 2, `rgba(180,214,209,${.08 + strength * .22})`, .7);
  });
  context.restore();
}

function drawBlank(context, frame) {
  corners(context, frame, '#586058', 26);
  line(context, frame.x + frame.width * .5, frame.y + frame.height * .34,
    frame.x + frame.width * .5, frame.y + frame.height * .66, '#303630', .7, [2, 7]);
  context.fillStyle = '#717971'; context.font = `10px ${FONT}`; context.textAlign = 'center';
  context.fillText('SEM OBSERVAÇÃO EXECUTADA', frame.x + frame.width / 2, frame.y + frame.height / 2);
  context.fillStyle = '#4f564f'; context.font = `9px ${FONT}`;
  context.fillText('RUN / ⊙', frame.x + frame.width / 2, frame.y + frame.height / 2 + 24);
  context.textAlign = 'left';
}

function drawMetadata(context, record, frame, width, relation, state) {
  const baseline = frame.y + frame.height - 22;
  context.save();
  context.fillStyle = 'rgba(5,8,6,.72)'; context.fillRect(frame.x, baseline - 42, frame.width, 64);
  context.fillStyle = '#eff4ea'; context.font = `17px/1 ${FONT}`;
  context.fillText(record.taxon.name, frame.x + 15, baseline - 19);
  context.fillStyle = '#bbc5b8'; context.font = `9px ${FONT}`;
  context.fillText(`${record.observedOn} · ${record.locality}`, frame.x + 15, baseline - 1);
  context.fillStyle = '#929d90';
  context.fillText(`${record.image.author} · ${record.image.license} · iNaturalist ${record.observationId}`, frame.x + 15, baseline + 15);
  context.textAlign = 'right'; context.fillStyle = '#738073';
  context.fillText(`${state.toUpperCase()} · ${(relation?.parameters?.[0] ?? 0).toFixed(2)} RELATION`, Math.min(width - 8, frame.x + frame.width - 15), baseline + 15);
  context.restore();
}

export function createLivingRenderer(canvas) {
  let projection = portraitObservation({ tick: 0, revision: 0, entries: [] }, []);
  let traces = [], cue = null, generation = 0, state = 'blank', activeRecord = null;
  let fragmentCount = 0, ghostVisible = false, decodeError = null;
  const images = new Map(), pending = new Map();

  async function load(path) {
    if (images.has(path)) return images.get(path);
    if (!pending.has(path)) pending.set(path, new Promise((resolve, reject) => {
      const image = new Image(); image.decoding = 'async';
      image.onload = () => { images.set(path, image); pending.delete(path); resolve(image); };
      image.onerror = () => { pending.delete(path); reject(new Error(`Não foi possível decodificar ${path}.`)); };
      image.src = new URL(path.replace(/^\//, ''), document.baseURI).href;
    }));
    return pending.get(path);
  }

  function render() {
    const { context, width, height } = canvasContext(canvas), frame = frameLayout(width, height);
    context.fillStyle = '#060907'; context.fillRect(0, 0, width, height);
    fragmentCount = 0; ghostVisible = false; activeRecord = null;
    const living = projection.living, bounds = projection.frame?.parameters?.bounds;
    if (!projection.frame || !projection.inputShape || !living) {
      drawBlank(context, frame); state = decodeError ? 'missing' : 'blank'; canvas.dataset.state = state;
      canvas.setAttribute('aria-label', decodeError ? `Imagem indisponível: ${decodeError.message}` : 'Moldura 3 por 4 vazia; nenhuma observação foi executada.');
      return;
    }
    const absent = projection.absentIndices.length > 0;
    const lossProgress = projection.lossTransition?.progress ?? (absent ? 1 : 0);
    const withdrawing = absent && projection.lossTransition?.state === 'withdrawing' && lossProgress < 1;
    activeRecord = recordByIdentity(living, projection.selectedRecordId);
    const fallback = activeRecord ?? living.records[0];
    const image = images.get(fallback?.image.localPath);
    if (!image) {
      drawBlank(context, frame); state = decodeError ? 'missing' : 'loading'; canvas.dataset.state = state;
      canvas.setAttribute('aria-label', 'Observação situada; arquivo visual ainda está sendo decodificado.'); return;
    }
    const relation = projection.relationTemporal;
    const relationshipWeight = relation?.exposure ?? relation?.currentParameters?.[0] ?? 0;
    const visualBounds = projection.frameTemporal?.currentBounds ?? bounds;
    const crop = photoCrop(image, visualBounds, projection.inputShape);

    const rememberedLiving = livingObservation(projection.memoryField?.observations);
    const rememberedBounds = projection.memoryField?.partition?.bounds;
    const rememberedRecord = recordByIdentity(rememberedLiving, projection.memoryField?.partition?.selectedRecordId);
    const rememberedImage = images.get(rememberedRecord?.image.localPath);
    if (rememberedRecord && rememberedImage && rememberedBounds) {
      const rememberedCrop = photoCrop(rememberedImage, rememberedBounds, projection.inputShape);
      const memoryPresence = projection.memoryTemporal?.presence ?? 1;
      drawPhoto(context, rememberedImage, rememberedCrop, frame, (cue?.id === 'remember' ? .34 : .24) * memoryPresence,
        'grayscale(1) contrast(1.25) brightness(.86)', { x: -52, y: -16 });
      corners(context, { ...frame, x: frame.x - 52, y: frame.y - 16 }, 'rgba(190,202,186,.42)', 20);
      ghostVisible = true;
    }

    const emergence = projection.organismLifecycle?.progress ?? 1;
    if ((!absent || withdrawing) && activeRecord) {
      const contrast = 1.03 + relationshipWeight * .28;
      const brightness = .86 + relationshipWeight * .22;
      const filter = `saturate(.78) contrast(${contrast}) brightness(${brightness})`;
      if (withdrawing) drawWithdrawal(context, image, crop, frame, lossProgress, emergence, filter);
      else drawPhoto(context, image, crop, frame, emergence, filter);
    }
    drawFrameTrail(context, frame, projection.frameTrail ?? [], projection.inputShape);
    fragmentCount = drawFragments(context, image, crop, frame, cue?.id === 'frame' || absent ? 1.75 : 1);
    drawRainWitness(context, projection.environment, frame, cue?.id === 'relate' || cue?.names?.includes('chuva') ? 1 : relationshipWeight);
    corners(context, frame, absent ? '#7d847b' : '#e3eadf', cue?.id === 'frame' ? 34 : 24);
    if ((absent && !withdrawing) || !activeRecord) {
      line(context, frame.x + 19, frame.y + 19, frame.x + frame.width - 19, frame.y + frame.height - 19, '#5e655d', .7, [4, 9]);
      line(context, frame.x + frame.width - 19, frame.y + 19, frame.x + 19, frame.y + frame.height - 19, '#5e655d', .7, [4, 9]);
      context.fillStyle = '#9ba398'; context.font = `11px ${FONT}`; context.textAlign = 'center';
      context.fillText(absent ? 'AUSÊNCIA DECLARADA / REGISTRO RETIDO' : 'OBSERVAÇÕES FORA DO ENQUADRAMENTO', frame.x + frame.width / 2, frame.y + frame.height / 2);
      context.textAlign = 'left';
    }
    if (cue?.glyph) {
      context.fillStyle = 'rgba(232,239,227,.9)'; context.font = `32px ${FONT}`;
      context.fillText(cue.glyph, frame.x + 13, frame.y + 42);
    }
    drawMetadata(context, fallback, frame, width, { parameters: [relationshipWeight] }, withdrawing ? 'withdrawing' : absent ? 'absence' : activeRecord ? 'situated' : 'outside');
    state = absent ? 'absent' : activeRecord ? 'observed' : 'excluded'; canvas.dataset.state = state;
    canvas.setAttribute('aria-label', `${absent ? 'Ausência visível do retrato' : `Retrato enquadrado de ${fallback.taxon.name}`}; foto de ${fallback.image.author}, ${fallback.image.license}; ${fragmentCount} fragmentos externos; ${ghostVisible ? 'estado anterior fantasma visível; ' : ''}aproximação computacional situada sem alegação causal.`);
  }

  const resize = new ResizeObserver(render); resize.observe(canvas); render();
  return {
    async update(observation, nextTraces) {
      projection = portraitObservation(observation, nextTraces); traces = nextTraces; decodeError = null;
      const version = ++generation;
      try {
        await Promise.all((projection.living?.records ?? []).map(record => load(record.image.localPath)));
        const remembered = livingObservation(projection.memoryField?.observations);
        await Promise.all((remembered?.records ?? []).map(record => load(record.image.localPath)));
      } catch (error) { decodeError = error; }
      if (version === generation) render();
    },
    setCue(nextCue) { cue = nextCue; render(); },
    inspect: () => ({ renderer: 'Canvas2D living portrait', state, tick: projection.tick,
      recordId: activeRecord?.id ?? null, observationId: activeRecord?.observationId ?? null,
      speciesOrTaxon: activeRecord?.speciesOrTaxon ?? null, frameAspect: .75,
      frameBounds: projection.frame?.parameters?.bounds ?? null, fragmentCount, ghostVisible,
      frameCurrentBounds: projection.frameTemporal?.currentBounds ?? projection.frame?.parameters?.bounds ?? null,
      frameTransition: projection.frameTemporal ?? null, relationProcess: projection.relationTemporal ?? null,
      organismLifecycle: projection.organismLifecycle ?? null, lossTransition: projection.lossTransition ?? null,
      recordSelector: projection.recordSelector, semanticSource: 'runtime-projection',
      absentIndices: projection.absentIndices, historicalTraceId: projection.historicalFrame?.id ?? null,
      sourceStatus: projection.living?.status ?? null, imageStatus: activeRecord?.status ?? null,
      allMediaVerified: Boolean(projection.living?.records?.length && projection.living.records.every(record => /^[a-f0-9]{64}$/.test(record.image.localSha256))),
      recordCount: projection.living?.records?.length ?? 0, cue: cue ? { id: cue.id, line: cue.line, names: cue.names } : null,
      causalClaim: projection.living?.epistemic?.causalClaim ?? null,
      decodeError: decodeError?.message ?? null }),
    destroy() { generation++; resize.disconnect(); },
  };
}
