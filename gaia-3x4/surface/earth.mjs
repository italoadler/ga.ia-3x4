import * as THREE from 'three/webgpu';
import { attribute, uniform, float, vec3, positionLocal, normalLocal, mx_noise_float, mix, smoothstep } from 'three/tsl';
import { portraitObservation } from './observation.mjs';
import { createLabourScene } from './labour-scene.mjs';

const RADIUS = 1.72;
const SEGMENTS = 16;
export const VISUAL_ENCODING = Object.freeze({
  projection: 'cada índice da entrada ocupa uma célula latitude/longitude da esfera; não é cartografia terrestre',
  included: 'seleção e valores normalizados vêm de frame; relevo e luminância são observações desses valores',
  excluded: 'índices e valores brutos preservados; brilho bruto/9, deslocamento radial e lateral, opacidade espectral',
  detail: 'tesselação 16×16 por célula e ruído procedural TSL de coordenadas; detalhe visual, sem dataset ou novo campo',
  surfaceTransfer: 'smoothstep(0.40, 0.54, ruído_de_coordenadas × 0.78 + valor_observado × 0.22); material monocromático, sem cartografia',
  memory: 'geometria espectral usa os índices e valores do snapshot retornado por remember',
  trace: 'malha pontilhada e contorno recuado usam material retido no rastro acessado por trace',
  discard: 'células descartadas deixam de desenhar superfície; só testemunhos e registros permanecem',
});

function line(points, color, opacity = 1) {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p))),
    new THREE.LineBasicNodeMaterial({ color, transparent: true, opacity, depthWrite: false }));
}

function fillAttribute(geometry, name, value) {
  const attribute = geometry.getAttribute(name);
  attribute.array.fill(value); attribute.needsUpdate = true;
}

export async function createEarth(container, { onCuePainted = () => {}, labour = false, onSelect = () => {} } = {}) {
  const forceWebGL = new URLSearchParams(location.search).get('backend') === 'webgl';
  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x090909, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  await renderer.init();
  renderer.domElement.id = 'earth-canvas';
  renderer.domElement.setAttribute('aria-label', 'Terra computacional tridimensional: retrato, fragmentos excluídos e memória espectral');
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5, 5, 3.35, -3.35, .1, 50);
  camera.position.set(0, 0, 12); camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x191919, .75));
  const light = new THREE.DirectionalLight(0xffffff, 2.2); light.position.set(-3, 3, 5); scene.add(light);
  const edge = new THREE.DirectionalLight(0xcccccc, 1.8); edge.position.set(4, -.5, -2); scene.add(edge);

  const planet = new THREE.Group(); planet.name = 'persistent-situated-earth';
  planet.rotation.set(.04, .52, .13); planet.position.x = -.15; scene.add(planet);
  const focus = uniform(0), ghostFocus = uniform(0), traceFocus = uniform(0);
  const fieldValue = attribute('fieldValue', 'float'), role = attribute('role', 'float');
  const coarse = mx_noise_float(positionLocal.mul(1.95)).mul(.5).add(.5);
  const detail = mx_noise_float(positionLocal.mul(27)).mul(.5).add(.5);
  const grain = mx_noise_float(positionLocal.mul(115)).mul(.5).add(.5);
  // This is an explicit observation encoding. It does not create or classify runtime fields.
  const surface = smoothstep(float(.40), float(.54), coarse.mul(.78).add(fieldValue.mul(.22)));
  const relief = surface.mul(detail.pow(3)).mul(.052).add(grain.mul(.004));
  const material = new THREE.MeshStandardNodeMaterial({ transparent: true, roughness: .87, metalness: .02 });
  material.positionNode = positionLocal.add(normalLocal.mul(relief));
  material.colorNode = vec3(mix(float(.024), float(.46), surface).mul(grain.mul(.2).add(.8)));
  material.roughnessNode = mix(float(.28), float(.93), surface);
  material.opacityNode = mix(float(.19), float(1), role);
  material.emissiveNode = vec3(focus.mul(.042).add(role.oneMinus().mul(.026)));
  material.depthWrite = true;

  const ghostMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, wireframe: true, depthWrite: false, color: 0xb5b5b5 });
  ghostMaterial.opacityNode = float(.018).add(ghostFocus.mul(.07));
  const ghost = new THREE.Mesh(new THREE.BufferGeometry(), ghostMaterial); ghost.name = 'remember-snapshot';
  ghost.position.set(-.11, .085, -.12); ghost.scale.setScalar(1.025); ghost.visible = false; planet.add(ghost);
  const traceMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, wireframe: true, depthWrite: false, color: 0x7a7a7a });
  traceMaterial.opacityNode = float(.007).add(traceFocus.mul(.035));
  const retained = new THREE.Mesh(new THREE.BufferGeometry(), traceMaterial); retained.name = 'retained-frame-trace';
  retained.position.set(.17, -.07, -.3); retained.scale.setScalar(1.055); retained.visible = false; planet.add(retained);

  const portrait = new THREE.Group(); portrait.name = '3-by-4-identification'; scene.add(portrait);
  const portraitWidth = 3.64, portraitHeight = portraitWidth * 4 / 3;
  const px = -.15, z = 2.2;
  portrait.add(line([[px - portraitWidth / 2, -portraitHeight / 2, z], [px + portraitWidth / 2, -portraitHeight / 2, z],
    [px + portraitWidth / 2, portraitHeight / 2, z], [px - portraitWidth / 2, portraitHeight / 2, z], [px - portraitWidth / 2, -portraitHeight / 2, z]], 0xbdbdbd, .7));
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    const cx = px + x * portraitWidth / 2, cy = y * portraitHeight / 2;
    portrait.add(line([[cx + x * .055, cy, z], [cx + x * .16, cy, z]], 0xdddddd));
    portrait.add(line([[cx, cy + y * .055, z], [cx, cy + y * .16, z]], 0xdddddd));
  }
  const oldPortrait = portrait.clone(); oldPortrait.name = 'previous-frame-outline';
  oldPortrait.position.set(.12, -.08, -.25); oldPortrait.visible = false;
  oldPortrait.children.forEach(object => { object.material = object.material.clone(); object.material.opacity = .12; });
  scene.add(oldPortrait);

  // Two distinct provenance witnesses. Their identities come from the observation,
  // even when their numerical fields are equal.
  const sourceRings = [];
  for (let i = 0; i < 2; i++) {
    const points = Array.from({ length: 241 }, (_, k) => {
      const a = k * Math.PI * 2 / 240;
      return [Math.cos(a) * (RADIUS + .12 + i * .065), Math.sin(a) * (RADIUS + .12 + i * .065), -.4];
    });
    const ring = line(points, i ? 0x686868 : 0x9a9a9a, .25); ring.rotation.set(.64 + i * .14, .12, .1);
    planet.add(ring); sourceRings.push(ring);
  }
  const witnesses = new THREE.Group(); witnesses.name = 'discard-witnesses'; scene.add(witnesses);
  let shape = null, tiles = [], projection = null, cue = null, previousMemory = '', previousTrace = '';
  let renders = 0, lastUpdate = 0, lastTime = performance.now(), suspended = false;
  let paintedCue = null;
  const witnessKeys = new Set();
  const labourScene = labour ? createLabourScene(scene, camera, renderer.domElement, { onSelect }) : null;

  function rebuild(nextShape) {
    tiles.forEach(tile => { planet.remove(tile.mesh); tile.mesh.geometry.dispose(); });
    shape = [...nextShape]; tiles = [];
    const [width, height] = shape;
    for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
      const geometry = new THREE.SphereGeometry(RADIUS, SEGMENTS, SEGMENTS,
        col * Math.PI * 2 / width + .0012, Math.PI * 2 / width - .0024,
        row * Math.PI / height + .0012, Math.PI / height - .0024);
      const count = geometry.getAttribute('position').count;
      geometry.setAttribute('fieldValue', new THREE.Float32BufferAttribute(new Float32Array(count), 1));
      geometry.setAttribute('role', new THREE.Float32BufferAttribute(new Float32Array(count), 1));
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `source-cell:${row * width + col}`;
      mesh.visible = false; planet.add(mesh);
      const angle = (col + .5) * Math.PI * 2 / width, theta = (row + .5) * Math.PI / height;
      const normal = new THREE.Vector3(-Math.cos(angle) * Math.sin(theta), Math.cos(theta), Math.sin(angle) * Math.sin(theta));
      const side = normal.x < 0 ? -1 : 1;
      tiles.push({ index: row * width + col, mesh, target: new THREE.Vector3(), excluded: false,
        fragment: normal.clone().multiplyScalar(.58).add(new THREE.Vector3(side * .67, ((row % 3) - 1) * .075, -.06)) });
    }
  }

  function historicalGeometry(records) {
    const positions = [], indices = [];
    for (const record of records) {
      const tile = tiles[record.index];
      if (!tile) continue;
      const source = tile.mesh.geometry, p = source.getAttribute('position'), offset = positions.length / 3;
      const scale = 1 + record.value * .012;
      for (let k = 0; k < p.count; k++) positions.push(p.getX(k) * scale, p.getY(k) * scale, p.getZ(k) * scale);
      for (const index of source.index.array) indices.push(offset + index);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); return geometry;
  }

  function update(observation, traces) {
    if (labourScene) {
      planet.visible = false; witnesses.visible = false;
      labourScene.update(observation, traces);
      const current = labourScene.inspect();
      portrait.visible = Boolean(current.frame); oldPortrait.visible = Boolean(current.historicalTraceId);
      lastUpdate = performance.now(); return;
    }
    projection = portraitObservation(observation, traces);
    if (projection.inputShape && (!shape || shape.join(':') !== projection.inputShape.join(':'))) rebuild(projection.inputShape);
    const included = new Map(projection.included.map(r => [r.index, r.value]));
    const excluded = new Map(projection.excluded.map(r => [r.index, r.value]));
    tiles.forEach(tile => {
      const enters = included.has(tile.index), leaves = excluded.has(tile.index);
      tile.mesh.visible = enters || leaves;
      tile.excluded = leaves;
      tile.target.copy(leaves ? tile.fragment : new THREE.Vector3());
      fillAttribute(tile.mesh.geometry, 'fieldValue', enters ? included.get(tile.index) : leaves ? excluded.get(tile.index) / 9 : 0);
      fillAttribute(tile.mesh.geometry, 'role', enters ? 1 : 0);
    });
    portrait.visible = Boolean(projection.frame);
    ghost.visible = projection.ghosts.length > 0;
    const memoryKey = `${projection.memoryTraceId}:${projection.memoryTick}`;
    if (memoryKey !== previousMemory) { ghost.geometry.dispose(); ghost.geometry = historicalGeometry(projection.ghosts); previousMemory = memoryKey; }
    retained.visible = Boolean(projection.historicalFrame);
    oldPortrait.visible = retained.visible;
    if (projection.historicalFrame?.id !== previousTrace) {
      retained.geometry.dispose();
      const trace = projection.historicalFrame;
      retained.geometry = historicalGeometry(trace ? trace.includedIndices.map((index, k) => ({ index, value: trace.retained.included[k] })) : []);
      previousTrace = trace?.id ?? '';
    }
    sourceRings.forEach((ring, i) => {
      const source = projection.sources[i]; ring.visible = Boolean(source);
      ring.userData.sourceId = source?.id ?? null;
    });
    for (const loss of projection.losses) if (!witnessKeys.has(loss.id)) {
      witnessKeys.add(loss.id);
      // A loss outside the displayed input does not punch a fictitious hole in Earth.
      // It receives an empty archival slot keyed to its real source and loss record.
      const n = witnesses.children.length, x = 2.5 + (n % 2) * .31, y = -1.75 + Math.floor(n / 2) * .32;
      const slot = line([[x, y, 2.2], [x + .22, y, 2.2], [x + .22, y + .22, 2.2], [x, y + .22, 2.2], [x, y, 2.2]], 0x898989, .7);
      slot.userData = { lossId: loss.id, sourceIds: loss.sourceIds, count: loss.loss.count };
      witnesses.add(slot);
    }
    lastUpdate = performance.now();
  }

  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    const aspect = width / height;
    // Keep the complete frame visible on narrow screens.
    const vertical = aspect < 1 ? 8.2 : 6.7;
    camera.left = -vertical * aspect / 2; camera.right = vertical * aspect / 2;
    camera.top = vertical / 2; camera.bottom = -vertical / 2; camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container); resize();

  renderer.setAnimationLoop(() => {
    const now = performance.now(), delta = Math.min((now - lastTime) / 1000, .05); lastTime = now;
    if (suspended) return;
    labourScene?.animate(delta);
    const progress = 1 - Math.exp(-delta * 7);
    tiles.forEach(tile => { tile.mesh.position.lerp(tile.target, progress); tile.mesh.rotation.z = tile.excluded ? tile.mesh.position.length() * .027 : 0; });
    const active = Boolean(cue);
    focus.value += ((active && ['frame', 'relate', 'situate', 'observe'].includes(cue.id) ? 1 : 0) - focus.value) * progress;
    ghostFocus.value += ((active && cue.id === 'remember' ? 1 : 0) - ghostFocus.value) * progress;
    traceFocus.value += ((active && cue.id === 'trace' ? 1 : 0) - traceFocus.value) * progress;
    sourceRings.forEach(ring => { ring.material.opacity = active && cue.id === 'situate' ? .65 : .25; });
    witnesses.children.forEach(slot => { slot.material.opacity = active && cue.id === 'discard' ? 1 : .5; });
    renderer.render(scene, camera); renders++;
    if (cue && paintedCue !== cue) { paintedCue = cue; onCuePainted(cue); }
  });

  return {
    update, setCue(next) { cue = { ...next, time: performance.now() }; labourScene?.setCue(cue); },
    inspectFragment: id => labourScene?.inspectFragment(id), selectNext: direction => labourScene?.selectNext(direction),
    suspend(value) { suspended = value; },
    inspect: () => ({ backend: renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2',
      renderer: 'WebGPURenderer', shading: 'TSL', planetId: planet.uuid, cellCount: tiles.length,
      includedIndices: projection?.included.map(r => r.index) ?? [], excludedIndices: projection?.excluded.map(r => r.index) ?? [],
      absentIndices: projection?.absentIndices ?? [], ghostIndices: projection?.ghosts.map(r => r.index) ?? [],
      memoryTick: projection?.memoryTick, historicalTraceId: projection?.historicalFrame?.id ?? null,
      lossRecords: [...witnessKeys], witnessCount: witnesses.children.length,
      sources: sourceRings.filter(ring => ring.visible).map(ring => ring.userData.sourceId),
      visibleMeshes: tiles.filter(tile => tile.mesh.visible).length, frameAspect: portraitWidth / portraitHeight,
      selectedNames: projection?.selectedNames ?? [], cue: cue?.id ?? null, renders, lastUpdate,
      paintedCue: paintedCue?.id ?? null, paintedTick: paintedCue?.tick ?? null,
      includedValues: projection?.included.map(r => r.value) ?? [],
      cueStrength: { surface: focus.value, memory: ghostFocus.value, trace: traceFocus.value },
      sourceWitnessOpacity: sourceRings.map(r => r.material.opacity),
      geometryVertices: tiles.reduce((n, tile) => n + tile.mesh.geometry.getAttribute('position').count, 0),
      ...(labourScene?.inspect() ?? {}),
    }),
    destroy() { labourScene?.destroy(); resizeObserver.disconnect(); renderer.setAnimationLoop(null); scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); renderer.dispose(); },
  };
}
