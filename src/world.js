import * as THREE from 'three';
import { mergeGeometries } from '../utils/BufferGeometryUtils.js';

// RIFTSYNC world builder.
//
// Four worlds, each assembled from a per-world "kit" of architectural
// templates plus shared machinery: sky dome, scrolling street, distant
// skyline, traffic, atmosphere. Worlds are built once and cached, so
// dimension changes and the portal preview never rebuild geometry at runtime.

export const LANES = [-3.1, 0, 3.1];
const ROAD_HALF = 5.6;
const STREET_DEPTH = 190;
const SEGMENT_LEN = 26;
const SEGMENT_COUNT = 8;

export const WORLDS = [
  {
    name: 'THE GRID',
    sky: { top: 0x04070e, horizon: 0x122433, glow: 0x2f6f8f },
    fog: { color: 0x0a141d, near: 22, far: 150 },
    light: { key: 0x9fc6e8, keyIntensity: 1.35, keyDir: [-0.45, 0.9, 0.25], hemi: 0x415d73, ground: 0x0a1016, hemiIntensity: 0.75, rim: 0x53e0ff, rimIntensity: 1.1 },
    neon: [0x39e0ff, 0xff4fa3, 0xffd166, 0x7cffb2, 0xb98bff],
    window: [0xbfe9ff, 0xffe6a8, 0x9fd0ff, 0xffc7e8],
    ground: { road: 0x10161c, side: 0x232d38, curb: 0x2f3b47, mark: 0x8fae9d, rail: 0x3b4855 },
    accent: 0x39e0ff,
    ambientParticle: { color: 0x8fd8ff, size: 0.05, count: 500, drift: 0.4 },
    motes: 'traffic'
  },
  {
    name: 'THE DOJO',
    sky: { top: 0x2b1b46, horizon: 0xff8a4c, glow: 0xffb066 },
    fog: { color: 0x3a2233, near: 24, far: 140 },
    light: { key: 0xffb066, keyIntensity: 1.5, keyDir: [-0.6, 0.55, 0.4], hemi: 0x6a4a72, ground: 0x2a1a20, hemiIntensity: 0.7, rim: 0xffd9a0, rimIntensity: 0.8 },
    neon: [0xffb45e, 0xff5b4a, 0xffe1a8, 0xd88bff],
    window: [0xffd9a0, 0xffb066, 0xfff0c8],
    ground: { road: 0x3a3128, side: 0x584a3a, curb: 0x6b5a45, mark: 0xd8c39a, rail: 0x6b5236 },
    accent: 0xffb45e,
    ambientParticle: { color: 0xffc2d8, size: 0.07, count: 420, drift: 0.6, fall: 0.5 },
    motes: 'lanterns'
  },
  {
    name: 'THE FORGE',
    sky: { top: 0x0d0906, horizon: 0x3d1c0a, glow: 0xff6a12 },
    fog: { color: 0x241610, near: 20, far: 130 },
    light: { key: 0xffb066, keyIntensity: 1.25, keyDir: [-0.4, 0.8, 0.35], hemi: 0x5a3a26, ground: 0x140c08, hemiIntensity: 0.6, rim: 0xff7a1a, rimIntensity: 1.2 },
    neon: [0xff7a1a, 0xffd08a, 0xff4d1a, 0xffe08a],
    window: [0xffb066, 0xffd08a, 0xff8040],
    ground: { road: 0x1b1712, side: 0x2a2622, curb: 0x38332c, mark: 0xd8a25e, rail: 0x4a4238 },
    accent: 0xff7a1a,
    ambientParticle: { color: 0xffb066, size: 0.045, count: 520, drift: 1.1, rise: 1.2 },
    motes: 'drones'
  },
  {
    name: 'THE VOID',
    sky: { top: 0x05030c, horizon: 0x1b1046, glow: 0x8a4fe0 },
    fog: { color: 0x0a0718, near: 26, far: 170 },
    light: { key: 0xb99cff, keyIntensity: 1.1, keyDir: [-0.3, 0.85, 0.4], hemi: 0x4a3a7a, ground: 0x0a0814, hemiIntensity: 0.65, rim: 0x4fd8ff, rimIntensity: 1.3 },
    neon: [0xb06cff, 0x4fd8ff, 0xff6ec7, 0x9affd8],
    window: [0xb99cff, 0x4fd8ff, 0xff9ae0],
    ground: { road: 0x141026, side: 0x1e1840, curb: 0x2a2258, mark: 0x9a8ad8, rail: 0x3a2f6a },
    accent: 0xb06cff,
    ambientParticle: { color: 0xb99cff, size: 0.05, count: 620, drift: 0.5 },
    motes: 'wisps'
  }
];

// ---------------------------------------------------------------- helpers --
function makeRng(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function white(geo) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3).fill(1);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  return geo;
}

function box(list, w, h, d, x, y, z, rotY = 0, rotZ = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Matrix4().makeRotationY(rotY);
  if (rotZ) m.multiply(new THREE.Matrix4().makeRotationZ(rotZ));
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  white(g);
  list.push(g);
}

function cyl(list, rt, rb, h, x, y, z, seg = 12) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  white(g);
  list.push(g);
}

function tint(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  return geo;
}

function merge(list) {
  if (!list.length) return new THREE.BufferGeometry();
  const merged = mergeGeometries(list, false);
  list.forEach(g => g.dispose());
  return merged || new THREE.BufferGeometry();
}

// ------------------------------------------------------------- templates ---
function gridTower(rng, theme) {
  const facade = [];
  const windows = [];
  const w = 6 + rng() * 6;
  const d = 6 + rng() * 6;
  let y = 0;
  const tiers = 2 + Math.floor(rng() * 3);
  let cw = w;
  let cd = d;
  const neon = theme.neon;
  for (let t = 0; t < tiers; t++) {
    const h = 14 + rng() * 26;
    box(facade, cw, h, cd, 0, y + h / 2, 0);
    // ledges + structural bands
    box(facade, cw + 0.5, 0.5, cd + 0.5, 0, y + h, 0);
    box(facade, cw + 0.4, 0.3, cd + 0.4, 0, y + 0.4, 0);
    for (let b = 1; b < 4; b++) box(facade, cw + 0.18, 0.12, cd + 0.18, 0, y + (h * b) / 4, 0);
    // windows: rows of lit strips on each face
    const rows = Math.max(3, Math.floor(h / 3.1));
    for (let r = 0; r < rows; r++) {
      const wy = y + 1.6 + r * (h - 2.4) / rows;
      const lit = rng() < 0.78;
      if (!lit) continue;
      const col = theme.window[Math.floor(rng() * theme.window.length)];
      const cols = 3 + Math.floor(rng() * 3);
      for (let c = 0; c < cols; c++) {
        if (rng() < 0.25) continue;
        const cw2 = (cw - 1) / cols;
        const x = -cw / 2 + 0.6 + c * cw2 + cw2 * 0.5;
        const strip = new THREE.BoxGeometry(cw2 * 0.72, 1.1 + rng() * 0.9, 0.12);
        strip.translate(x, wy, -cd / 2 - 0.06);
        windows.push(tint(strip, col));
        const stripB = new THREE.BoxGeometry(cw2 * 0.72, 1.1 + rng() * 0.9, 0.12);
        stripB.translate(x, wy, cd / 2 + 0.06);
        windows.push(tint(stripB, col));
      }
      const dc = 2 + Math.floor(rng() * 3);
      for (let c = 0; c < dc; c++) {
        const dw = (cd - 1) / dc;
        const z = -cd / 2 + 0.6 + c * dw + dw * 0.5;
        const sL = new THREE.BoxGeometry(0.12, 1.1 + rng() * 0.9, dw * 0.7);
        sL.translate(-cw / 2 - 0.06, wy, z);
        windows.push(tint(sL, col));
        const sR = new THREE.BoxGeometry(0.12, 1.1 + rng() * 0.9, dw * 0.7);
        sR.translate(cw / 2 + 0.06, wy, z);
        windows.push(tint(sR, col));
      }
    }
    // neon crown line
    box(windows, cw + 0.3, 0.22, cd + 0.3, 0, y + h - 0.6, 0);
    const crown = new THREE.BoxGeometry(cw + 0.32, 0.24, cd + 0.32);
    crown.translate(0, y + h - 0.6, 0);
    tint(crown, neon[Math.floor(rng() * neon.length)]);
    windows.push(crown);
    y += h;
    cw *= 0.76 + rng() * 0.12;
    cd *= 0.76 + rng() * 0.12;
  }
  // rooftop equipment
  box(facade, cw * 0.5, 1.4, cd * 0.5, 0, y + 0.7, 0);
  box(facade, cw * 0.25, 2.2, cd * 0.25, cw * 0.15, y + 1.1, -cd * 0.1);
  cyl(facade, 0.6, 0.6, 1.6, -cw * 0.2, y + 0.8, cd * 0.15, 10);
  const antenna = 3 + rng() * 5;
  cyl(facade, 0.06, 0.1, antenna, cw * 0.1, y + antenna / 2, -cd * 0.2, 6);
  const beacon = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  beacon.translate(cw * 0.1, y + antenna, -cd * 0.2);
  windows.push(tint(beacon, 0xff4d5a));
  return { facade: merge(facade), windows: merge(windows), height: y };
}

function dojoPagoda(rng, theme) {
  const facade = [];
  const windows = [];
  const base = 8 + rng() * 4;
  let y = 0.6;
  const tiers = 2 + Math.floor(rng() * 3);
  let w = base;
  for (let t = 0; t < tiers; t++) {
    const h = 6 + rng() * 6;
    box(facade, w, h, w, 0, y + h / 2, 0);
    // posts
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(facade, 0.5, h, 0.5, sx * (w / 2 - 0.3), y + h / 2, sz * (w / 2 - 0.3));
    // shoji glow panels
    for (const sz of [-1, 1]) {
      const lit = new THREE.BoxGeometry(w * 0.6, h * 0.5, 0.12);
      lit.translate(0, y + h * 0.45, sz * (w / 2 + 0.05));
      windows.push(tint(lit, theme.window[0]));
    }
    // hip roof (4-sided pyramid, flattened, overhanging eaves)
    const roof = new THREE.ConeGeometry(w * 0.92, 2.4, 4, 1);
    roof.rotateY(Math.PI / 4);
    roof.translate(0, y + h + 1.2, 0);
    facade.push(white(roof));
    box(facade, w + 1.6, 0.28, w + 1.6, 0, y + h + 0.1, 0);
    y += h + 2.4;
    w *= 0.78;
  }
  cyl(facade, 0.12, 0.12, 2.6, 0, y + 1.3, 0, 6);
  const finial = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  finial.translate(0, y + 2.5, 0);
  windows.push(tint(finial, theme.accent));
  return { facade: merge(facade), windows: merge(windows), height: y + 2.6 };
}

function toriiGate(rng, theme) {
  const facade = [];
  const windows = [];
  const w = 6 + rng() * 2;
  for (const sx of [-1, 1]) cyl(facade, 0.28, 0.34, 6.4, sx * w / 2, 3.2, 0, 8);
  box(facade, w + 2.4, 0.5, 0.7, 0, 6.5, 0);
  box(facade, w + 1.4, 0.4, 0.55, 0, 5.6, 0);
  box(facade, w - 0.6, 0.34, 0.4, 0, 4.4, 0);
  const lamp = new THREE.BoxGeometry(0.4, 0.6, 0.4);
  lamp.translate(0, 5.9, 0);
  windows.push(tint(lamp, theme.neon[0]));
  return { facade: merge(facade), windows: merge(windows), height: 7 };
}

function forgeBlock(rng, theme) {
  const facade = [];
  const windows = [];
  const w = 8 + rng() * 8;
  const d = 8 + rng() * 8;
  let y = 0;
  const h = 18 + rng() * 34;
  box(facade, w, h, d, 0, y + h / 2, 0);
  // ribbed structure bands
  for (let b = 1; b < 8; b++) box(facade, w + 0.3, 0.4, d + 0.3, 0, y + (h * b) / 8, 0);
  // external pipes
  for (let p = 0; p < 3; p++) {
    const px = (rng() - 0.5) * w;
    cyl(facade, 0.3, 0.3, h * 0.9, px, y + h * 0.5, d / 2 + 0.4, 8);
  }
  // chimney
  if (rng() < 0.6) cyl(facade, 1, 1.4, 8 + rng() * 8, w * 0.2, y + h + 4, -d * 0.2, 10);
  // furnace vents
  for (let v = 0; v < 4; v++) {
    const vy = y + 3 + v * (h / 5);
    const vent = new THREE.BoxGeometry(w * 0.9, 0.9, 0.16);
    vent.translate(0, vy, -d / 2 - 0.08);
    windows.push(tint(vent, theme.neon[Math.floor(rng() * theme.neon.length)]));
  }
  box(facade, w * 0.4, 2, d * 0.4, 0, y + h + 1, 0);
  const beacon = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  beacon.translate(0, y + h + 2.4, 0);
  windows.push(tint(beacon, theme.neon[0]));
  return { facade: merge(facade), windows: merge(windows), height: h + 4 };
}

function voidMonolith(rng, theme) {
  const facade = [];
  const windows = [];
  const w = 5 + rng() * 7;
  const h = 22 + rng() * 40;
  const d = 4 + rng() * 6;
  const tilt = (rng() - 0.5) * 0.16;
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Matrix4().makeRotationZ(tilt);
  m.setPosition(0, h / 2, 0);
  g.applyMatrix4(m);
  facade.push(white(g));
  const shards = 2 + Math.floor(rng() * 3);
  for (let s = 0; s < shards; s++) {
    const sh = new THREE.BoxGeometry(w * (0.2 + rng() * 0.3), h * (0.2 + rng() * 0.4), d * 0.3);
    sh.rotateZ((rng() - 0.5) * 1.2);
    sh.translate((rng() - 0.5) * w * 2, h * rng(), (rng() - 0.5) * d * 2);
    facade.push(white(sh));
  }
  for (let i = 0; i < 5; i++) {
    const gx = new THREE.BoxGeometry(w * 0.5, 0.3 + rng() * 0.5, d * 0.12);
    gx.translate((rng() - 0.5) * w * 0.6, h * (0.15 + rng() * 0.7), d / 2 + 0.08);
    windows.push(tint(gx, theme.neon[Math.floor(rng() * theme.neon.length)]));
  }
  return { facade: merge(facade), windows: merge(windows), height: h };
}

const KITS = [gridTower, dojoPagoda, forgeBlock, voidMonolith];
const KIT_MIX = [
  [gridTower, gridTower, gridTower, gridTower],
  [dojoPagoda, dojoPagoda, toriiGate, dojoPagoda],
  [forgeBlock, forgeBlock, forgeBlock, forgeBlock],
  [voidMonolith, voidMonolith, voidMonolith, voidMonolith]
];

// ------------------------------------------------------------- sky dome ----
function buildSky(theme) {
  const group = new THREE.Group();
  const uniforms = {
    top: { value: new THREE.Color(theme.sky.top) },
    horizon: { value: new THREE.Color(theme.sky.horizon) },
    glow: { value: new THREE.Color(theme.sky.glow) }
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(520, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; varying vec3 vP;
        void main(){
          float h = clamp(normalize(vP).y*0.5+0.5, 0.0, 1.0);
          vec3 c = mix(horizon, top, pow(h, 0.62));
          float band = pow(1.0 - abs(normalize(vP).y), 6.0);
          c += glow * band * 0.55;
          gl_FragColor = vec4(c, 1.0);
        }`
    })
  );
  dome.frustumCulled = false;
  group.add(dome);
  if (theme.sky.top < 0x101010 || theme === WORLDS[3]) {
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(460);
      v.y = Math.abs(v.y) * 0.85 + 20;
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe9ff, size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
    group.add(stars);
  }
  return group;
}

// ------------------------------------------------------------- street -----
function buildStreet(theme, index) {
  const group = new THREE.Group();
  const matRoad = new THREE.MeshStandardMaterial({ color: theme.ground.road, roughness: 0.55, metalness: 0.35 });
  const matSide = new THREE.MeshStandardMaterial({ color: theme.ground.side, roughness: 0.85, metalness: 0.12 });
  const matCurb = new THREE.MeshStandardMaterial({ color: theme.ground.curb, roughness: 0.8, metalness: 0.15 });
  const matMark = new THREE.MeshStandardMaterial({ color: theme.ground.mark, roughness: 0.5, metalness: 0.2, emissive: theme.ground.mark, emissiveIntensity: 0.22 });
  const matRail = new THREE.MeshStandardMaterial({ color: theme.ground.rail, roughness: 0.5, metalness: 0.6 });
  const owned = [matRoad, matSide, matCurb, matMark, matRail];

  const segments = [];
  for (let s = 0; s < SEGMENT_COUNT; s++) {
    const seg = new THREE.Group();
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, SEGMENT_LEN), matRoad);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    seg.add(road);
    for (const x of [-ROAD_HALF - 1.3, ROAD_HALF + 1.3]) {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, SEGMENT_LEN), matSide);
      walk.position.set(x, 0.15, 0);
      walk.receiveShadow = true;
      seg.add(walk);
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, SEGMENT_LEN), matCurb);
      curb.position.set(x - Math.sign(x) * 1.3, 0.17, 0);
      seg.add(curb);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, SEGMENT_LEN), matRail);
      rail.position.set(x + Math.sign(x) * 1.2, 0.75, 0);
      rail.visible = index !== 1;
      seg.add(rail);
    }
    // lane dashes
    const dashGeo = new THREE.BoxGeometry(0.09, 0.02, 2.6);
    for (const x of [-1.72, 1.72]) for (let k = 0; k < 4; k++) {
      const dash = new THREE.Mesh(dashGeo, matMark);
      dash.position.set(x, 0.014, -SEGMENT_LEN / 2 + k * (SEGMENT_LEN / 4) + 2);
      seg.add(dash);
    }
    // edge lines
    for (const x of [-ROAD_HALF + 0.35, ROAD_HALF - 0.35]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, SEGMENT_LEN), matMark);
      edge.position.set(x, 0.014, 0);
      seg.add(edge);
    }
    // drains
    for (const x of [-ROAD_HALF + 0.55, ROAD_HALF - 0.55]) {
      const drain = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.9), matRail);
      drain.position.set(x, 0.02, -SEGMENT_LEN / 3);
      seg.add(drain);
    }
    seg.position.z = 12 - s * SEGMENT_LEN;
    seg.userData = { span: SEGMENT_LEN };
    segments.push(seg);
    group.add(seg);
  }

  // street furniture (lamp posts) pooled across two sides
  const lampGeo = merge([
    (() => { const g = new THREE.BoxGeometry(0.16, 5, 0.16); g.translate(0, 2.5, 0); return g; })(),
    (() => { const g = new THREE.BoxGeometry(0.12, 0.12, 1.6); g.translate(0, 4.9, -0.8); return g; })()
  ]);
  const lampMat = new THREE.MeshStandardMaterial({ color: theme.ground.rail, roughness: 0.5, metalness: 0.6 });
  const headGeo = new THREE.BoxGeometry(0.5, 0.16, 0.5);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: theme.accent, fog: true });
  owned.push(lampGeo, lampMat, lampHeadMat);
  const lamps = [];
  const lampCount = SEGMENT_COUNT * 2;
  const lamp = new THREE.InstancedMesh(lampGeo, lampMat, lampCount);
  const lampHead = new THREE.InstancedMesh(headGeo, lampHeadMat, lampCount);
  lamp.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  lampHead.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  lamp.castShadow = false;
  lamp.frustumCulled = false; lampHead.frustumCulled = false;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < lampCount; i++) {
    const side = i % 2 ? -1 : 1;
    const z = 12 - Math.floor(i / 2) * SEGMENT_LEN;
    lamps.push({ x: side * (ROAD_HALF + 1.7), z });
  }
  group.add(lamp, lampHead);

  return {
    group,
    update(dt, speed) {
      const dist = speed * dt;
      for (const seg of segments) {
        seg.position.z += dist;
        if (seg.position.z > 12 + SEGMENT_LEN) seg.position.z -= SEGMENT_LEN * SEGMENT_COUNT;
      }
      for (let i = 0; i < lamps.length; i++) {
        const p = lamps[i];
        p.z += dist;
        if (p.z > 12 + SEGMENT_LEN) p.z -= SEGMENT_LEN * SEGMENT_COUNT;
        dummy.position.set(p.x, 0.3, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        lamp.setMatrixAt(i, dummy.matrix);
        dummy.position.set(p.x - Math.sign(p.x) * 0.8, 5.1, p.z + 0.8);
        dummy.updateMatrix();
        lampHead.setMatrixAt(i, dummy.matrix);
      }
      lamp.instanceMatrix.needsUpdate = true;
      lampHead.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      group.traverse(o => { if (o.isMesh && o.geometry && !owned.includes(o.geometry)) o.geometry.dispose(); });
      owned.forEach(o => o.dispose?.());
      if (lampGeo) lampGeo.dispose();
    }
  };
}

// ---------------------------------------------------------- architecture ---
function buildSkyline(index, theme) {
  const group = new THREE.Group();
  const rng = makeRng(7 + index * 131);
  const mix = KIT_MIX[index];
  const templates = [];
  for (let i = 0; i < 12; i++) {
    const tpl = mix[i % mix.length](rng, theme);
    templates.push(tpl);
  }
  const facadeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.22, vertexColors: false });
  const windowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, toneMapped: true });

  const placements = templates.map(() => []);
  const perTpl = 5;
  const depth = 420;
  for (let i = 0; i < templates.length * perTpl; i++) {
    const t = i % templates.length;
    const side = rng() < 0.5 ? -1 : 1;
    const near = rng() < 0.55;
    const x = side * (ROAD_HALF + (near ? 6 + rng() * 10 : 26 + rng() * 46) + t * 0.4);
    const z = 40 - rng() * depth;
    const scale = 0.85 + rng() * 0.6;
    const rotY = (rng() - 0.5) * 0.5;
    const col = new THREE.Color(theme.neon[Math.floor(rng() * theme.neon.length)]).lerp(new THREE.Color(0xffffff), 0.55);
    placements[t].push({ x, z, scale, rotY, col });
  }

  const instanced = [];
  const dummy = new THREE.Object3D();
  const ownsGeo = [];
  templates.forEach((tpl, t) => {
    const list = placements[t];
    if (!list.length) return;
    ownsGeo.push(tpl.facade, tpl.windows);
    const f = new THREE.InstancedMesh(tpl.facade, facadeMat, list.length);
    const w = new THREE.InstancedMesh(tpl.windows, windowMat, list.length);
    f.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    w.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    f.castShadow = false; f.receiveShadow = false;
    f.frustumCulled = false; w.frustumCulled = false;
    list.forEach((p, i) => {
      f.setColorAt(i, p.col);
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, p.rotY, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      f.setMatrixAt(i, dummy.matrix);
      w.setMatrixAt(i, dummy.matrix);
    });
    group.add(f, w);
    instanced.push({ f, w, list });
  });

  function place(list, i, obj) {
    const p = list[i];
    obj.position.set(p.x, 0, p.z);
    obj.rotation.set(0, p.rotY, 0);
    obj.scale.setScalar(p.scale);
    obj.updateMatrix();
  }

  // distant skyline rings (no scroll churn, just fogged silhouettes)
  const distantMat = new THREE.MeshStandardMaterial({ color: theme.sky.horizon, roughness: 1, metalness: 0, transparent: true, opacity: 0.9, fog: true });
  const distGeo = merge([
    (() => { const g = new THREE.BoxGeometry(14, 80, 14); g.translate(0, 40, 0); return g; })(),
    (() => { const g = new THREE.BoxGeometry(10, 120, 10); g.translate(0, 60, 0); return g; })()
  ]);
  ownsGeo.push(distGeo);
  const distCount = 70;
  const distant = new THREE.InstancedMesh(distGeo, distantMat, distCount);
  distant.frustumCulled = false;
  distant.castShadow = false;
  const distRng = makeRng(99 + index);
  const distList = [];
  for (let i = 0; i < distCount; i++) {
    const side = distRng() < 0.5 ? -1 : 1;
    distList.push({ x: side * (70 + distRng() * 200), z: 40 - distRng() * 620, s: 0.8 + distRng() * 2.2 });
  }
  group.add(distant);

  return {
    group,
    update(dt, speed) {
      const d = speed * dt;
      for (const { f, w, list } of instanced) {
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          p.z += d;
          if (p.z > 60) p.z -= 460;
          place(list, i, dummy);
          f.setMatrixAt(i, dummy.matrix);
          w.setMatrixAt(i, dummy.matrix);
        }
        f.instanceMatrix.needsUpdate = true;
        w.instanceMatrix.needsUpdate = true;
      }
      for (let i = 0; i < distList.length; i++) {
        const p = distList[i];
        p.z += d;
        if (p.z > 60) p.z -= 680;
        dummy.position.set(p.x, 0, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(p.s);
        dummy.updateMatrix();
        distant.setMatrixAt(i, dummy.matrix);
      }
      distant.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      ownsGeo.forEach(g => g.dispose());
      facadeMat.dispose();
      windowMat.dispose();
      distantMat.dispose();
    }
  };
}

// ------------------------------------------------------------- movers -----
function buildMovers(index, theme) {
  const rng = makeRng(31 + index * 17);
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: theme.ground.rail, roughness: 0.5, metalness: 0.7 });
  const glowMat = new THREE.MeshBasicMaterial({ color: theme.accent });
  let bodyGeo;
  if (index === 0) {
    bodyGeo = merge([
      (() => { const g = new THREE.BoxGeometry(2.4, 0.5, 1.1); return g; })(),
      (() => { const g = new THREE.BoxGeometry(1.1, 0.5, 0.9); g.translate(-0.2, 0.4, 0); return g; })(),
      (() => { const g = new THREE.BoxGeometry(0.5, 0.16, 2.6); g.translate(0, 0, 0); return g; })()
    ]);
  } else if (index === 1) {
    bodyGeo = merge([
      (() => { const g = new THREE.CylinderGeometry(0.5, 0.5, 0.8, 8); return g; })(),
      (() => { const g = new THREE.BoxGeometry(0.12, 0.5, 0.12); g.translate(0, 0.5, 0); return g; })()
    ]);
  } else if (index === 2) {
    bodyGeo = merge([
      (() => { const g = new THREE.CylinderGeometry(0.6, 0.6, 0.3, 10); return g; })(),
      (() => { const g = new THREE.BoxGeometry(1.6, 0.14, 0.4); g.translate(0, 0, 0); return g; })(),
      (() => { const g = new THREE.BoxGeometry(1.6, 0.14, 0.4); g.translate(0, 0, 0); g.rotateY(Math.PI / 2); return g; })()
    ]);
  } else {
    bodyGeo = merge([
      (() => { const g = new THREE.IcosahedronGeometry(0.7, 0); return g; })(),
      (() => { const g = new THREE.TorusGeometry(1.1, 0.06, 6, 20); g.rotateX(Math.PI / 2); return g; })()
    ]);
  }
  const count = index === 3 ? 8 : 14;
  const meshes = new THREE.InstancedMesh(bodyGeo, mat, count);
  const glow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), glowMat, count);
  meshes.frustumCulled = false; glow.frustumCulled = false;
  meshes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(meshes, glow);
  const dummy = new THREE.Object3D();
  const movers = [];
  for (let i = 0; i < count; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    movers.push({
      x: side * (12 + rng() * 40),
      y: index === 1 ? 4 + rng() * 5 : index === 3 ? 8 + rng() * 30 : 14 + rng() * 34,
      z: 30 - rng() * 320,
      speed: (10 + rng() * 26) * (index === 1 ? 0.4 : index === 3 ? 0.3 : 1),
      bob: rng() * Math.PI * 2,
      dir: rng() < 0.5 ? -1 : 1,
      rot: index === 3 ? rng() * Math.PI : 0
    });
  }
  return {
    group,
    update(dt, speed, time) {
      for (let i = 0; i < movers.length; i++) {
        const m = movers[i];
        m.z += (speed + m.speed) * dt;
        if (m.z > 40) m.z -= 380;
        const by = m.y + Math.sin(time * 0.8 + m.bob) * 1.4;
        dummy.position.set(m.x, by, m.z);
        dummy.rotation.set(index === 3 ? time * 0.2 : 0, index === 3 ? m.rot + time * 0.3 : 0, 0);
        dummy.scale.setScalar(index === 1 ? 0.7 : 1);
        dummy.updateMatrix();
        meshes.setMatrixAt(i, dummy.matrix);
        dummy.position.set(m.x, by, m.z + (index === 0 ? 1.9 : 0));
        dummy.updateMatrix();
        glow.setMatrixAt(i, dummy.matrix);
      }
      meshes.instanceMatrix.needsUpdate = true;
      glow.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      bodyGeo.dispose();
      meshes.geometry.dispose();
      glow.geometry.dispose();
      mat.dispose();
      glowMat.dispose();
    }
  };
}

// --------------------------------------------------------- atmosphere -----
function buildAtmosphere(theme) {
  const cfg = theme.ambientParticle;
  const n = cfg.count;
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 70;
    pos[i * 3 + 1] = Math.random() * 42;
    pos[i * 3 + 2] = 30 - Math.random() * 220;
    vel[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: cfg.color, size: cfg.size, transparent: true, opacity: 1,
    depthWrite: false, sizeAttenuation: true, fog: true, blending: THREE.AdditiveBlending
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    update(dt, speed, time) {
      const arr = geo.attributes.position.array;
      for (let i = 0; i < n; i++) {
        const ix = i * 3;
        arr[ix + 2] += (speed * 0.55 + cfg.drift) * dt;
        arr[ix] += Math.sin(time * 0.3 + vel[i] * 6.28) * 0.05;
        if (cfg.fall) arr[ix + 1] -= cfg.fall * dt;
        if (cfg.rise) arr[ix + 1] += cfg.rise * dt;
        if (arr[ix + 2] > 32) { arr[ix + 2] -= 250; arr[ix] = (Math.random() - 0.5) * 70; }
        if (arr[ix + 1] < 0) arr[ix + 1] = 42;
        if (arr[ix + 1] > 44) arr[ix + 1] = 0.5;
      }
      geo.attributes.position.needsUpdate = true;
      void theme;
    },
    dispose() { geo.dispose(); mat.dispose(); }
  };
}

// ------------------------------------------------------------- assembly ----
const cache = new Map();

export function getWorld(index) {
  if (cache.has(index)) return cache.get(index);
  const theme = WORLDS[index];
  const group = new THREE.Group();
  const sky = buildSky(theme);
  const street = buildStreet(theme, index);
  const skyline = buildSkyline(index, theme);
  const movers = buildMovers(index, theme);
  const atmosphere = buildAtmosphere(theme);
  group.add(sky, street.group, skyline.group, movers.group);
  const world = {
    index, theme, group, street, skyline, movers, atmosphere,
    update(dt, speed, time) {
      street.update(dt, speed);
      skyline.update(dt, speed);
      movers.update(dt, speed, time);
      atmosphere.update(dt, speed, time);
    },
    dispose() {
      street.dispose(); skyline.dispose(); movers.dispose(); atmosphere.dispose();
      group.clear();
    }
  };
  cache.set(index, world);
  return world;
}

export function skyMesh(index) {
  return buildSky(WORLDS[index]);
}

// A lightweight, self-contained scene used only inside the rift opening so the
// player can recognise the destination world before travelling through it.
export function createPreviewScene(index) {
  const theme = WORLDS[index];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.fog.color);
  scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near * 0.7, theme.fog.far * 0.72);
  scene.add(buildSky(theme));
  const hemi = new THREE.HemisphereLight(theme.light.hemi, theme.light.ground, theme.light.hemiIntensity * 1.1);
  const key = new THREE.DirectionalLight(theme.light.key, theme.light.keyIntensity);
  key.position.set(...theme.light.keyDir).multiplyScalar(40);
  scene.add(hemi, key);

  const rng = makeRng(500 + index * 37);
  const mix = KIT_MIX[index];
  const groundMat = new THREE.MeshStandardMaterial({ color: theme.ground.road, roughness: 0.6, metalness: 0.3 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 220), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, -80);
  scene.add(ground);
  const walkMat = new THREE.MeshStandardMaterial({ color: theme.ground.side, roughness: 0.85 });
  for (const sx of [-1, 1]) {
    const walk = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 220), walkMat);
    walk.position.set(sx * 7.4, 0.2, -80);
    scene.add(walk);
  }

  const facadeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.22 });
  const windowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  const owners = [groundMat, walkMat, facadeMat, windowMat];
  for (let i = 0; i < 10; i++) {
    const tpl = mix[i % mix.length](rng, theme);
    owners.push(tpl.facade, tpl.windows);
    const side = i % 2 ? -1 : 1;
    const z = -14 - Math.floor(i / 2) * 22 - rng() * 6;
    const x = side * (11 + rng() * 8);
    const facade = new THREE.Mesh(tpl.facade, facadeMat);
    const win = new THREE.Mesh(tpl.windows, windowMat);
    for (const m of [facade, win]) {
      m.position.set(x, 0, z);
      m.rotation.y = (rng() - 0.5) * 0.4;
      m.scale.setScalar(0.9 + rng() * 0.35);
      scene.add(m);
    }
  }

  const camera = new THREE.PerspectiveCamera(60, 1.35, 0.1, 400);
  camera.position.set(0, 6.5, 10);
  camera.lookAt(0, 6, -50);

  function update(dt) {
    camera.position.x = Math.sin(Date.now() * 0.00013 + index) * 1.6;
    camera.position.y = 6.5 + Math.sin(Date.now() * 0.00021) * 0.6;
    camera.lookAt(Math.sin(Date.now() * 0.0001) * 1.2, 6 + Math.sin(Date.now() * 0.00017), -50);
    void dt;
  }

  return {
    scene, camera, update,
    dispose() { owners.forEach(o => o.dispose && o.dispose()); scene.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); }
  };
}
