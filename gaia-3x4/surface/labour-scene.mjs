import * as THREE from 'three/webgpu';
import { uniform, float, vec3, positionLocal, normalLocal, mx_noise_float, mix } from 'three/tsl';
import { labourObservation } from './observation.mjs';

export const LABOUR_VISUAL_ENCODING = Object.freeze({
  material: 'relation-produced identities use the same record supports for polished sectors and exposed 3:4 portraits',
  projection: 'runtime-produced spherical positions and ranked orthographic chart; relational coordinates, not cartography',
  framing: 'included/excluded identities and states come from frame; margins are only appearance placement',
  evidence: 'CanvasTexture typography reads supplied records; synthetic data is explicitly marked; repetition is not a worker count',
  loss: 'discarded supports hide polished and portrait geometry; reexecution does not restore support',
  memory: 'spectral 3:4 outlines use the actual persistent situated snapshot returned by remember',
  trace: 'observed relate trace-view opens the skin, using accessTraceId and retained surface provenance',
});

// Appearance only. Runtime supplies positions, identities, supports and states.
export function createLabourScene(scene, camera, canvas, { onSelect = () => {} } = {}) {
  const root = new THREE.Group(); root.name = 'labour-supported-earth'; scene.add(root);
  const open = uniform(0);
  const assembly = uniform(1);
  const grain = mx_noise_float(positionLocal.mul(60)).mul(.5).add(.5);
  const skin = new THREE.MeshStandardNodeMaterial({ roughness: .82, metalness: .05, transparent: true, depthWrite: false });
  skin.opacityNode = assembly;
  skin.colorNode = vec3(mix(float(.07), float(.31), mx_noise_float(positionLocal.mul(2)).mul(.5).add(.5)).mul(grain.mul(.08).add(.92)));
  skin.positionNode = positionLocal.add(normalLocal.mul(grain.mul(.002)));
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(1.725, 96, 64), skin); root.add(smoke);
  const cards = new Map(), ghosts = new Map(), textures = new Map();
  const smoothParts = new Map();
  const cardMaterials = new Map();
  const ghostMaterial = new THREE.MeshBasicNodeMaterial({ color: 0x9bb3b2, transparent: true, opacity: .095, wireframe: true, depthWrite: false, side: THREE.DoubleSide });
  const letters = new THREE.Group(); root.add(letters);
  const sheets = new THREE.Group(); root.add(sheets);
  const retained = new THREE.Group(); root.add(retained);
  let state = null, cue = null, selectedId = null, assemblyStarted = -10000, currentFragments = new Set();
  const R = 1.72;

  function labelTexture(record) {
    if (textures.has(record.id)) return textures.get(record.id);
    const c = document.createElement('canvas'); c.width = 384; c.height = 512;
    const p = c.getContext('2d'); p.fillStyle = '#161616'; p.fillRect(0, 0, c.width, c.height);
    p.strokeStyle = '#777'; p.strokeRect(3, 3, 378, 506);
    p.fillStyle = '#eeeeee'; p.font = '24px Consolas, monospace'; p.fillText(record.id.toUpperCase(), 22, 49);
    p.font = '21px Consolas, monospace';
    const lines = [record.activity.toUpperCase(), record.observedAt.slice(11, 16) + ' UTC / ' + record.status.toUpperCase(),
      'DURAÇÃO / ' + record.durationSeconds + 's', record.compensation.value + ' ' + record.compensation.currency,
      ...record.paymentRegime.match(/.{1,25}(?:\s|$)|.{1,25}/g), record.location.label, record.provenance.reference, record.evidenceStatus.toUpperCase()];
    lines.forEach((s, i) => { p.fillStyle = i === lines.length - 1 ? '#fff' : '#bbbbbb'; p.fillText(s, 22, 108 + i * 36); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; textures.set(record.id, t); return t;
  }
  function textPlane(text, size, color = '#ccc') {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 100;
    const p = c.getContext('2d'); p.fillStyle = color; p.font = '42px Consolas, monospace'; p.fillText(text, 0, 65);
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(size, size * 100 / 1024), new THREE.MeshBasicNodeMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  }
  function makeCard(fragment, record, ghost = false) {
    const row = Math.floor(fragment.surfaceIndex / 12), theta = (row + .5) * Math.PI / 12;
    const area = R * R * (Math.PI * 2 / 12) * (Math.PI / 12) * Math.sin(theta);
    const width = Math.sqrt(area * .75) * 1.12, height = width * 4 / 3;
    const geometry = new THREE.PlaneGeometry(width, height, ghost ? 2 : 8, ghost ? 2 : 8);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) positions.setZ(i, -(positions.getX(i) ** 2 + positions.getY(i) ** 2) / (2 * R));
    geometry.computeVertexNormals();
    const material = ghost ? ghostMaterial : recordMaterial(record, false);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = fragment.id;
    mesh.userData.fragment = fragment;
    mesh.position.fromArray(fragment.position);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...fragment.normal));
    root.add(mesh);
    const target = mesh.position.clone(), normal = new THREE.Vector3(...fragment.normal);
    return { mesh, target, normal, fragment, homeQuaternion: mesh.quaternion.clone(), width, height };
  }
  function recordMaterial(record, excluded) {
    const key = record.id + ':' + excluded;
    if (!cardMaterials.has(key)) cardMaterials.set(key, excluded ?
      new THREE.MeshBasicNodeMaterial({ map: labelTexture(record), color: 0xdddddd, side: THREE.DoubleSide, transparent: true, opacity: .8 }) :
      new THREE.MeshStandardNodeMaterial({ map: labelTexture(record), color: 0xffffff, roughness: .92, side: THREE.DoubleSide }));
    return cardMaterials.get(key);
  }
  function clear(group) {
    while (group.children.length) { const o = group.children[0]; group.remove(o); o.geometry?.dispose(); if (![...textures.values()].includes(o.material?.map)) o.material?.map?.dispose(); o.material?.dispose(); }
  }
  function update(observation, traces) {
    const previousEarth = state?.earthId;
    state = labourObservation(observation, traces);
    const joins = !previousEarth && Boolean(state.earthId);
    if (joins) { assemblyStarted = performance.now(); assembly.value = 0; }
    const masked = state.baseVisible && state.smoke && !state.exposed;
    root.visible = true; smoke.visible = masked && !state.fragments.length;
    // A trace opens the skin; observing/discarding discourse removes that skin.
    if (state.exposed) smoke.visible = false;
    clear(letters);
    if (state.smoke && !state.exposed) state.discourse.forEach((text, i) => {
      const mesh = textPlane(text, 2.5, '#838383'); mesh.position.set(i % 2 ? .65 : -2.25, 2.55 - i * 1.6, 2.1); letters.add(mesh);
    });
    const byRecord = new Map(state.records.map(r => [r.id, r]));
    const active = new Set();
    for (const f of state.fragments) {
      const record = byRecord.get(f.recordIds[0]); if (!record) continue;
      active.add(f.id);
      let card = cards.get(f.id);
      if (!card) {
        card = makeCard(f, record); cards.set(f.id, card);
        if (joins) { card.mesh.position.set(-2.2 + state.records.findIndex(r => r.id === record.id) * .88, -2.5, 2.1); card.joinFrom = card.mesh.position.clone(); }
      }
      card.fragment = f; card.mesh.userData.fragment = f;
      card.mesh.visible = f.state !== 'discarded' && (!masked || assembly.value < 1);
      let polished = smoothParts.get(f.id);
      if (!polished) {
        const col = f.surfaceIndex % 12, row = Math.floor(f.surfaceIndex / 12);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 16, 16, col * Math.PI * 2 / 12, Math.PI * 2 / 12, row * Math.PI / 12, Math.PI / 12), skin);
        mesh.name = f.id; root.add(mesh); polished = { mesh, fragment: f }; smoothParts.set(f.id, polished);
      }
      polished.fragment = f; polished.mesh.userData.fragment = f;
      polished.mesh.visible = masked && f.state !== 'discarded';
      card.target.fromArray(f.position);
      if (f.state === 'excluded') {
        // Membership is runtime-produced. Appearance carries it to the margins.
        const side = f.projection[0] < 0 ? -1 : 1;
        const col = f.projectedIndex % 12, row = Math.floor(f.projectedIndex / 12);
        card.target.set(side * (2.2 + (col % 3) * .31), 2.4 - row * .43, .45 + (col % 3) * .04);
      } else if (state.exposed) card.target.addScaledVector(card.normal, .18);
      card.mesh.material = recordMaterial(record, f.state === 'excluded');
    }
    cards.forEach((card, id) => { if (!active.has(id)) card.mesh.visible = false; });
    currentFragments = active;
    smoothParts.forEach((part, id) => { if (!active.has(id)) part.mesh.visible = false; });
    const ghostSet = new Set();
    for (const f of state.ghosts) {
      const record = state.records.find(r => r.id === f.recordIds[0]); if (!record) continue;
      ghostSet.add(f.id);
      let card = ghosts.get(f.id); if (!card) { card = makeCard(f, record, true); ghosts.set(f.id, card); }
      card.fragment = f; card.mesh.userData.fragment = f; card.mesh.visible = true;
      card.target.fromArray(f.position).multiplyScalar(1.12).add(new THREE.Vector3(-.12, .08, -.03));
    }
    ghosts.forEach((card, id) => { card.mesh.visible = ghostSet.has(id); });
    clear(sheets);
    if (state.situated.length && (!state.fragments.length || cue?.id === 'situate')) {
      const records = [...new Map(state.situated.flatMap(f => f.labour.records).map(r => [r.id, r])).values()];
      records.forEach((r, i) => {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.39, .52), new THREE.MeshBasicNodeMaterial({ map: labelTexture(r), side: THREE.DoubleSide }));
        mesh.position.set(-2.65 + i * .88, -2.5, 2.1); sheets.add(mesh);
      });
    }
    clear(retained);
    if (state.historicalFrame) {
      const mesh = textPlane('⋮ ' + state.historicalFrame.id + ' / RECORTE RETIDO', 2.7, '#858585'); mesh.position.set(-1, -2.76, 2.1); retained.add(mesh);
    }
    if (selectedId && cards.has(selectedId)) inspectFragment(selectedId);
  }
  function animate(delta) {
    const progress = 1 - Math.exp(-delta * 5);
    assembly.value = Math.min(1, (performance.now() - assemblyStarted) / 2800);
    open.value += ((state?.exposed ? 1 : 0) - open.value) * progress;
    cards.forEach(card => {
      const masked = state?.smoke && !state?.exposed;
      card.mesh.visible = currentFragments.has(card.fragment.id) && card.fragment.state !== 'discarded' && (!masked || assembly.value < 1);
      if (card.joinFrom && assembly.value < 1) card.mesh.position.lerpVectors(card.joinFrom, card.target, assembly.value * assembly.value * (3 - 2 * assembly.value));
      else card.mesh.position.lerp(card.target, progress);
      const facing = new THREE.Quaternion();
      const turn = card.fragment.state === 'excluded' ? 1 : card.normal.z > .15 && state?.exposed ? .46 : 0;
      card.mesh.quaternion.slerpQuaternions(card.homeQuaternion, facing, turn * open.value);
    });
    ghosts.forEach(card => { card.mesh.position.lerp(card.target, progress); });
  }
  function inspectFragment(id, { remembered = false } = {}) {
    const card = remembered ? ghosts.get(id) : cards.get(id) ?? ghosts.get(id); if (!card) return null;
    selectedId = id; const record = state.records.find(r => r.id === card.fragment.recordIds[0]);
    const result = { ...card.fragment, record, tick: state.tick, revision: state.revision, memoryTick: remembered ? state.memoryTick : null }; onSelect(result); return result;
  }
  const raycaster = new THREE.Raycaster();
  function pick(event) {
    const rect = canvas.getBoundingClientRect(); raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    const hit = raycaster.intersectObjects([...cards.values(), ...ghosts.values(), ...smoothParts.values()].filter(c => c.mesh.visible).map(c => c.mesh), false)[0];
    if (hit) inspectFragment(hit.object.name, { remembered: hit.object.userData.fragment.state === 'remembered' });
  }
  canvas.addEventListener('pointerdown', pick);
  return { root, update, animate, setCue(value) { cue = value; }, inspectFragment,
    selectNext(direction = 1) { const ids = state?.fragments.map(f => f.id) ?? []; if (!ids.length) return null; return inspectFragment(ids[(ids.indexOf(selectedId) + direction + ids.length) % ids.length]); },
    inspect() { return { labour: true, planetId: root.uuid, earthId: state?.earthId, smoke: smoke.visible || [...smoothParts.values()].some(p => p.mesh.visible), exposed: state?.exposed,
      openingTraceId: state?.openingTraceId, accessTraceId: state?.accessTraceId, fragments: state?.fragments ?? [],
      includedFragmentIds: state?.fragments.filter(f => f.state === 'included').map(f => f.id) ?? [],
      excludedFragmentIds: state?.fragments.filter(f => f.state === 'excluded').map(f => f.id) ?? [],
      discardedFragmentIds: state?.fragments.filter(f => f.state === 'discarded').map(f => f.id) ?? [],
      rememberedFragmentIds: [...ghosts.values()].filter(c => c.mesh.visible).map(c => c.fragment.id),
      drawnFragmentIds: [...new Set([...cards.values(), ...smoothParts.values()].filter(c => c.mesh.visible).map(c => c.fragment.id))],
      polishedFragmentIds: [...smoothParts.values()].filter(c => c.mesh.visible).map(c => c.fragment.id),
      cardAspect: 3 / 4, assembly: assembly.value, selectedFragmentId: selectedId, uniqueRecordCount: state?.derivation?.distinctRecordCount ?? 0,
      fragmentCount: state?.fragments.length ?? 0, repeatIsNotWorkerCount: true,
      records: state?.records ?? [], memoryTick: state?.memoryTick, lossRecords: state?.losses.map(l => l.id) ?? [],
      historicalTraceId: state?.historicalFrame?.id ?? null, frame: state?.frame, projection: state?.projection,
      selectedNames: state?.selectedNames ?? [], visibleMeshes: [...cards.values(), ...smoothParts.values()].filter(c => c.mesh.visible).length,
      geometryVertices: [...cards.values()].reduce((n, c) => n + c.mesh.geometry.getAttribute('position').count, 0) }; },
    destroy() { canvas.removeEventListener('pointerdown', pick); } };
}
