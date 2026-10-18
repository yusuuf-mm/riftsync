import * as THREE from 'three';
import { DIMENSIONS, activatePulse, createRun, moveLane, performAction, updateRun } from './runner-core.js';
import { WORLDS, LANES, getWorld } from './world.js';
import { createCharacter } from './character.js';
import { createPortal } from './portal.js';
import { createAudio } from './audio.js';

const $ = id => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const runner = {
  mode: 'title', player: null, run: null, best: read('rs_best', 0),
  muted: read('rs_mute', false), runId: 0
};
const audio = createAudio();

const PORTAL_LEAD = 6.2;
const worldState = {
  index: 0, objects: new Map(), particles: [], rings: [], laneX: 0, roll: 0,
  action: '', actionTime: 0, landTimer: 0, hitFlash: 0, time: 0,
  cameraShake: 0, shakeDir: 1, cueTimer: 0, hudAt: 0, portalPhase: 'idle',
  instability: 0, lastAction: '', wasJumping: false, stepPhase: 0
};

let renderer, scene, camera;
let keyLight, hemiLight, rimLight;
let character, portal;
let activeWorld = null;
let raf = 0, lastFrame = 0, width = 0, height = 0, touchStart = null, framePromise = null;
let fpsAcc = 0, fpsFrames = 0, fps = 0, drawCalls = 0, triangles = 0;
const objMaterials = new Map();

function read(key, fallback) { try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); } catch { return fallback; } }
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private browsing */ } }

// ------------------------------------------------------------- rendering ---
function initScene() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true, powerPreference: 'high-performance', alpha: false });
  } catch {
    $('webgl-note').hidden = false;
    $('play').disabled = true;
    return false;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
  camera.position.set(0, 4.6, 8.8);

  hemiLight = new THREE.HemisphereLight(0x415d73, 0x0a1016, 0.75);
  keyLight = new THREE.DirectionalLight(0x9fc6e8, 1.35);
  keyLight.position.set(-8, 16, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1536, 1536);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 60;
  keyLight.shadow.camera.left = -16;
  keyLight.shadow.camera.right = 16;
  keyLight.shadow.camera.top = 18;
  keyLight.shadow.camera.bottom = -10;
  keyLight.shadow.bias = -0.0008;
  keyLight.shadow.normalBias = 0.03;
  rimLight = new THREE.DirectionalLight(0x53e0ff, 1.0);
  rimLight.position.set(6, 5, -14);
  scene.add(hemiLight, keyLight, rimLight, keyLight.target);

  character = createCharacter(null);
  scene.add(character.root, character.shadow);

  portal = createPortal(renderer);
  scene.add(portal.group);

  resize();
  addEventListener('resize', resize, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe($('game'));
  return true;
}

function resize() {
  if (!renderer) return;
  const rect = $('game').getBoundingClientRect();
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function applyTheme(index, immediate = false) {
  const theme = WORLDS[index];
  worldState.index = index;
  scene.background = new THREE.Color(theme.fog.color);
  scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far);
  hemiLight.color.setHex(theme.light.hemi);
  hemiLight.groundColor.setHex(theme.light.ground);
  hemiLight.intensity = theme.light.hemiIntensity;
  keyLight.color.setHex(theme.light.key);
  keyLight.intensity = theme.light.keyIntensity;
  keyLight.position.set(theme.light.keyDir[0] * 22, theme.light.keyDir[1] * 22, theme.light.keyDir[2] * 22);
  rimLight.color.setHex(theme.light.rim);
  rimLight.intensity = theme.light.rimIntensity;
  $('game').style.setProperty('--world-accent', `#${theme.accent.toString(16).padStart(6, '0')}`);
  $('title-world').textContent = DIMENSIONS[index].name;
  void immediate;
}

function setWorld(index, { instant = false } = {}) {
  if (activeWorld && activeWorld.index === index) {
    activeWorld.group.visible = true;
    return;
  }
  if (activeWorld) activeWorld.group.visible = false;
  activeWorld = getWorld(index);
  if (!activeWorld.group.parent) scene.add(activeWorld.group);
  activeWorld.group.visible = true;
  applyTheme(index, instant);
  if (!instant) {
    worldState.cameraShake = Math.max(worldState.cameraShake, reducedMotion ? 0 : 0.5);
    showCue(DIMENSIONS[index].name);
    audio.dimensionCue(index);
    audio.ambient(index);
  }
  updateHud(true);
}

// ------------------------------------------------------------- loading -----
async function boot() {
  const note = $('loading-note');
  const bar = $('loading-bar');
  const setProgress = (p, msg) => {
    if (bar) bar.style.transform = `scaleX(${clamp(p, 0, 1)})`;
    if (note && msg) note.textContent = msg;
  };
  setProgress(0.08, 'Calibrating reality');
  await frame();

  if (!initScene()) return;

  setProgress(0.3, 'Raising THE GRID');
  setWorld(0, { instant: true });
  await frame();

  setProgress(0.55, 'Waking the runner');
  character.setStyle(null);
  await frame();

  setProgress(0.72, 'Opening rifts');
  for (let i = 1; i < 4; i++) { portal.warm(i); await frame(); }
  await frame();

  setProgress(0.9, 'Syncing with start.ng');
  bindInput();
  document.addEventListener('visibilitychange', onVisibilityChange);
  addEventListener('focus', () => { if (!document.hidden) loadPlayer(); });
  loadPlayer();

  setProgress(1, 'Ready');
  await frame();
  $('loading').hidden = true;
  $('title-screen').hidden = false;
  if (!raf) raf = requestAnimationFrame(render);
}

function frame() { return new Promise(resolve => requestAnimationFrame(() => resolve())); }

// ------------------------------------------------------------- start.ng ----
function getConnectFrame() {
  framePromise ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = 'https://start.ng/connect';
    el.hidden = true;
    el.title = 'start.ng identity connection';
    el.onload = () => resolve(el);
    el.onerror = reject;
    document.body.append(el);
  });
  return framePromise;
}

async function askStartNg(message, replyType, timeout = 5000) {
  try {
    const el = await getConnectFrame();
    return await new Promise(resolve => {
      const requestId = Math.random().toString(36).slice(2);
      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        removeEventListener('message', onMessage);
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), timeout);
      function onMessage(event) {
        if (event.origin === 'https://start.ng' && event.source === el.contentWindow && event.data?.type === replyType && event.data.requestId === requestId) finish(event.data);
      }
      addEventListener('message', onMessage);
      el.contentWindow.postMessage({ ...message, requestId }, 'https://start.ng');
    });
  } catch {
    return null;
  }
}

async function loadPlayer() {
  const reply = await askStartNg({ type: 'startng:whoami' }, 'startng:user');
  runner.player = reply?.user ?? reply?.guest ?? null;
  updateIdentity();
  // Represent the player's start.ng character on the 3D runner.
  character?.setStyle(runner.player?.style || null);
}

function updateIdentity() {
  const player = runner.player;
  $('identity').hidden = false;
  $('player-name').textContent = player?.name || 'GUEST RUNNER';
  if (player?.face) {
    $('face').src = player.face;
    $('face').hidden = false;
  } else {
    $('face').hidden = true;
  }
  $('signin').hidden = !runner.player?.id;
}
$('signin').href = `https://start.ng/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;

// ------------------------------------------------------------- sound -------
function setMute() {
  runner.muted = !runner.muted;
  write('rs_mute', runner.muted);
  $('mute').textContent = runner.muted ? 'SOUND OFF' : 'SOUND ON';
  $('mute').setAttribute('aria-label', runner.muted ? 'Enable sound' : 'Mute sound');
  audio.setMuted(runner.muted);
  if (!runner.muted) {
    audio.resume();
    if (runner.mode === 'running') audio.ambient(worldState.index);
  }
}

// ------------------------------------------------------------- run flow ----
function startRun() {
  audio.resume();
  audio.setMuted(runner.muted);
  runner.runId++;
  runner.mode = 'running';
  runner.run = createRun();
  worldState.hudAt = 0;
  worldState.laneX = LANES[1];
  worldState.roll = 0;
  worldState.action = '';
  worldState.actionTime = 0;
  worldState.landTimer = 0;
  worldState.hitFlash = 0;
  worldState.cameraShake = 0;
  worldState.portalPhase = 'idle';
  worldState.instability = 0;
  portal.hide();
  portal.setProgress(0);
  character.root.position.set(0, 0, 0);
  setWorld(0, { instant: true });
  clearGameObjects();
  $('title-screen').hidden = true;
  $('results-screen').hidden = true;
  $('hud').hidden = false;
  audio.ambient(0);
  showCue('THE GRID');
  updateHud(true);
}

function goHome() {
  runner.mode = 'title';
  runner.run = null;
  portal.hide();
  setWorld(0, { instant: true });
  $('results-screen').hidden = true;
  $('title-screen').hidden = false;
  $('hud').hidden = true;
  clearGameObjects();
  $('best-label').textContent = runner.best ? `PERSONAL BEST ${Number(runner.best).toLocaleString()}` : 'FIRST RUN / BEST YOUR SIGNAL';
  audio.stopAmbient();
}

function clearGameObjects() {
  for (const view of worldState.objects.values()) removeObjectView(view);
  worldState.objects.clear();
  for (const burst of worldState.particles) disposeBurst(burst);
  worldState.particles.length = 0;
  for (const ring of worldState.rings) { scene.remove(ring.mesh); ring.mesh.geometry.dispose(); ring.mesh.material.dispose(); }
  worldState.rings.length = 0;
}

// ------------------------------------------------------------- input -------
function move(direction) {
  if (!runner.run) return;
  if (moveLane(runner.run, direction)) audio.laneMove(runner.run.lane);
}

function act(action) {
  if (!runner.run || !performAction(runner.run, action)) return;
  worldState.action = action;
  worldState.actionTime = action === 'jump' ? 0.72 : 0.66;
  if (action === 'jump') audio.jump();
  else audio.slide();
}

function pulse() {
  if (!runner.run || !runner.run.pulseCharge || !activatePulse(runner.run)) return;
  showCue('RIFT PULSE');
  pulseRing();
  audio.pulse();
  worldState.cameraShake = reducedMotion ? 0 : 0.22;
  updateHud(true);
}

function handleKey(event) {
  if (event.repeat) return;
  const handled = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyA', 'KeyD', 'KeyE', 'KeyQ'].includes(event.code);
  if (handled && runner.mode === 'running') event.preventDefault();
  if (event.code === 'ArrowLeft' || event.code === 'KeyA') move(-1);
  else if (event.code === 'ArrowRight' || event.code === 'KeyD') move(1);
  else if (event.code === 'ArrowUp' || event.code === 'Space') act('jump');
  else if (event.code === 'ArrowDown' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') act('slide');
  else if (event.code === 'KeyE' || event.code === 'KeyQ') pulse();
}

function handleTouchStart(event) {
  if (runner.mode !== 'running' || event.pointerType === 'mouse') return;
  touchStart = { x: event.clientX, y: event.clientY };
  $('scene').setPointerCapture?.(event.pointerId);
}

function handleTouchEnd(event) {
  if (runner.mode !== 'running' || event.pointerType === 'mouse' || !touchStart) return;
  const dx = event.clientX - touchStart.x;
  const dy = event.clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 27 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? -1 : 1);
  else if (Math.abs(dy) > 27) act(dy < 0 ? 'jump' : 'slide');
  else move(event.clientX < width / 2 ? -1 : 1);
}

function bindInput() {
  addEventListener('keydown', handleKey);
  const canvas = $('scene');
  canvas.addEventListener('pointerdown', handleTouchStart);
  canvas.addEventListener('pointerup', handleTouchEnd);
  canvas.addEventListener('pointercancel', () => { touchStart = null; });
  canvas.addEventListener('click', event => {
    if (runner.mode === 'running' && matchMedia('(pointer:fine)').matches) move(event.clientX < width / 2 ? -1 : 1);
  });
  $('touch-controls').addEventListener('pointerdown', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    event.preventDefault();
    if (action === 'left') move(-1);
    else if (action === 'right') move(1);
    else act(action);
  });
  $('play').addEventListener('click', startRun);
  $('retry').addEventListener('click', startRun);
  $('home').addEventListener('click', goHome);
  $('pulse').addEventListener('click', pulse);
  $('mute').addEventListener('click', setMute);
}

// ------------------------------------------------------------- objects -----
function worldMaterials(index) {
  if (objMaterials.has(index)) return objMaterials.get(index);
  const theme = WORLDS[index];
  const mats = {
    hazard: new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.6, metalness: 0.45 }),
    stripe: new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.45, metalness: 0.3, emissive: theme.accent, emissiveIntensity: 0.8 }),
    glow: new THREE.MeshBasicMaterial({ color: theme.accent }),
    dark: new THREE.MeshStandardMaterial({ color: 0x171b21, roughness: 0.7, metalness: 0.4 }),
    metal: new THREE.MeshStandardMaterial({ color: theme.ground.rail, roughness: 0.45, metalness: 0.7 }),
    shard: new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.2, metalness: 0.3, emissive: theme.accent, emissiveIntensity: 1.1 }),
    shardRing: new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
  };
  objMaterials.set(index, mats);
  return mats;
}

function part(group, kind, material, opts = {}) {
  let geo;
  if (kind === 'box') geo = new THREE.BoxGeometry(opts.w || 1, opts.h || 1, opts.d || 1);
  else if (kind === 'cyl') geo = new THREE.CylinderGeometry(opts.rt ?? 0.5, opts.rb ?? 0.5, opts.h || 1, opts.seg || 12);
  else if (kind === 'cone') geo = new THREE.ConeGeometry(opts.r || 0.5, opts.h || 1, opts.seg || 12);
  else if (kind === 'oct') geo = new THREE.OctahedronGeometry(opts.r || 0.5, 0);
  else if (kind === 'dodec') geo = new THREE.DodecahedronGeometry(opts.r || 0.5, 0);
  else geo = new THREE.TorusGeometry(opts.r || 0.5, opts.t || 0.05, 8, 24);
  const m = new THREE.Mesh(geo, material);
  if (opts.pos) m.position.set(opts.pos[0], opts.pos[1], opts.pos[2]);
  if (opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  if (opts.scale) m.scale.set(opts.scale[0], opts.scale[1], opts.scale[2]);
  m.castShadow = !!opts.cast;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

// Obstacles belong to their world: barriers, gates, machinery, corrupted stone.
function makeObjectView(object, index) {
  const group = new THREE.Group();
  const M = worldMaterials(index);
  if (object.type === 'shard') {
    const core = part(group, 'oct', M.shard, { r: 0.3, cast: true });
    core.userData.spin = true;
    const halo = part(group, 'torus', M.shardRing, { r: 0.46, t: 0.02 });
    halo.rotation.x = Math.PI / 2;
    group.userData.halo = halo;
    group.userData.spin = true;
  } else if (index === 0) {
    if (object.type === 'slide') {
      part(group, 'box', M.metal, { w: 0.18, h: 1.7, d: 0.22, pos: [-0.78, 0.85, 0], cast: true });
      part(group, 'box', M.metal, { w: 0.18, h: 1.7, d: 0.22, pos: [0.78, 0.85, 0], cast: true });
      part(group, 'box', M.hazard, { w: 1.9, h: 0.42, d: 0.5, pos: [0, 1.6, 0], cast: true });
      part(group, 'box', M.stripe, { w: 1.9, h: 0.08, d: 0.52, pos: [0, 1.4, 0] });
      part(group, 'box', M.glow, { w: 0.22, h: 0.1, d: 0.06, pos: [-0.5, 1.62, -0.28] });
      part(group, 'box', M.glow, { w: 0.22, h: 0.1, d: 0.06, pos: [0.5, 1.62, -0.28] });
    } else if (object.type === 'jump') {
      part(group, 'box', M.hazard, { w: 1.7, h: 0.5, d: 0.44, pos: [0, 0.28, 0], cast: true });
      for (let i = 0; i < 3; i++) part(group, 'box', M.stripe, { w: 1.7, h: 0.12, d: 0.46, pos: [0, 0.12 + i * 0.14, 0], rot: [0, 0, 0.5] });
      part(group, 'box', M.glow, { w: 1.7, h: 0.06, d: 0.06, pos: [0, 0.55, -0.23] });
      part(group, 'cyl', M.metal, { rt: 0.06, rb: 0.06, h: 0.5, pos: [-0.8, 0.25, 0] });
      part(group, 'cyl', M.metal, { rt: 0.06, rb: 0.06, h: 0.5, pos: [0.8, 0.25, 0] });
    } else {
      part(group, 'dodec', M.hazard, { r: 0.62, pos: [0, 0.72, 0], cast: true, rot: [0.3, 0.4, 0] });
      part(group, 'box', M.stripe, { w: 0.1, h: 1.5, d: 0.14, pos: [0.2, 0.8, 0.5], rot: [0, 0, 0.3] });
      part(group, 'cyl', M.dark, { rt: 0.55, rb: 0.7, h: 0.16, pos: [0, 0.09, 0], seg: 6 });
      part(group, 'box', M.glow, { w: 0.7, h: 0.06, d: 0.7, pos: [0, 0.02, 0] });
    }
  } else if (index === 1) {
    if (object.type === 'slide') {
      part(group, 'cyl', M.dark, { rt: 0.22, rb: 0.26, h: 1.9, pos: [-0.85, 0.95, 0], seg: 8 });
      part(group, 'cyl', M.dark, { rt: 0.22, rb: 0.26, h: 1.9, pos: [0.85, 0.95, 0], seg: 8 });
      part(group, 'box', M.hazard, { w: 2.1, h: 0.36, d: 0.4, pos: [0, 1.85, 0], cast: true });
      part(group, 'box', M.dark, { w: 2.4, h: 0.22, d: 0.6, pos: [0, 2.1, 0] });
      part(group, 'box', M.glow, { w: 0.3, h: 0.4, d: 0.3, pos: [-0.5, 1.4, 0] });
      part(group, 'box', M.glow, { w: 0.3, h: 0.4, d: 0.3, pos: [0.5, 1.4, 0] });
    } else if (object.type === 'jump') {
      part(group, 'box', M.hazard, { w: 1.8, h: 0.5, d: 0.5, pos: [0, 0.28, 0], cast: true });
      part(group, 'box', M.dark, { w: 1.9, h: 0.1, d: 0.6, pos: [0, 0.55, 0] });
      part(group, 'box', M.glow, { w: 1.4, h: 0.08, d: 0.06, pos: [0, 0.5, -0.25] });
    } else {
      part(group, 'cyl', M.dark, { rt: 0.4, rb: 0.5, h: 1.2, pos: [0, 0.6, 0], cast: true });
      part(group, 'box', M.hazard, { w: 0.9, h: 0.5, d: 0.9, pos: [0, 1.4, 0] });
      part(group, 'cone', M.hazard, { r: 0.7, h: 0.5, pos: [0, 1.85, 0], seg: 4 });
      part(group, 'box', M.glow, { w: 0.5, h: 0.3, d: 0.06, pos: [0, 1.4, -0.46] });
    }
  } else if (index === 2) {
    if (object.type === 'slide') {
      part(group, 'cyl', M.metal, { rt: 0.16, rb: 0.16, h: 1.8, pos: [-0.8, 0.9, 0], seg: 10 });
      part(group, 'cyl', M.metal, { rt: 0.16, rb: 0.16, h: 1.8, pos: [0.8, 0.9, 0], seg: 10 });
      part(group, 'cyl', M.hazard, { rt: 0.2, rb: 0.2, h: 1.9, pos: [0, 1.7, 0], rot: [0, 0, Math.PI / 2], seg: 10 });
      part(group, 'box', M.stripe, { w: 1.6, h: 0.1, d: 0.44, pos: [0, 1.7, 0] });
    } else if (object.type === 'jump') {
      part(group, 'cyl', M.metal, { rt: 0.3, rb: 0.3, h: 1.7, pos: [0, 0.28, 0], rot: [0, 0, Math.PI / 2], seg: 10, cast: true });
      part(group, 'box', M.hazard, { w: 1.8, h: 0.3, d: 0.3, pos: [0, 0.28, 0] });
      part(group, 'box', M.glow, { w: 0.3, h: 0.3, d: 0.3, pos: [-0.6, 0.45, 0] });
      part(group, 'box', M.glow, { w: 0.3, h: 0.3, d: 0.3, pos: [0.6, 0.45, 0] });
    } else {
      part(group, 'box', M.hazard, { w: 1.3, h: 0.7, d: 1.0, pos: [0, 0.35, 0], cast: true });
      part(group, 'box', M.hazard, { w: 1.1, h: 0.7, d: 0.9, pos: [0.1, 1.0, 0], rot: [0, 0.3, 0] });
      part(group, 'box', M.metal, { w: 1.35, h: 0.12, d: 1.05, pos: [0, 0.72, 0] });
      part(group, 'cyl', M.stripe, { rt: 0.16, rb: 0.16, h: 0.5, pos: [-0.4, 1.5, 0], seg: 8 });
    }
  } else {
    if (object.type === 'slide') {
      part(group, 'box', M.dark, { w: 2.2, h: 1.4, d: 0.24, pos: [0, 2.0, 0], rot: [0, 0, 0.06], cast: true });
      part(group, 'box', M.stripe, { w: 2.2, h: 0.1, d: 0.28, pos: [0, 1.4, 0] });
      part(group, 'box', M.dark, { w: 1.6, h: 0.5, d: 0.5, pos: [-0.6, 1.35, 0], rot: [0, 0, -0.09] });
      part(group, 'box', M.dark, { w: 1.2, h: 0.5, d: 0.5, pos: [0.7, 1.35, 0], rot: [0, 0, 0.12] });
    } else if (object.type === 'jump') {
      part(group, 'box', M.dark, { w: 1.9, h: 0.55, d: 0.5, pos: [0, 0.3, 0], cast: true });
      part(group, 'box', M.stripe, { w: 1.9, h: 0.08, d: 0.54, pos: [0, 0.6, 0] });
      part(group, 'oct', M.shard, { r: 0.3, pos: [-0.5, 0.7, 0] });
      part(group, 'oct', M.shard, { r: 0.22, pos: [0.55, 0.62, 0] });
    } else {
      part(group, 'oct', M.shard, { r: 0.8, pos: [0, 0.9, 0], cast: true, rot: [0.2, 0.5, 0.1] });
      part(group, 'box', M.dark, { w: 0.16, h: 1.6, d: 0.16, pos: [0.3, 1.0, 0.3], rot: [0.2, 0, 0.4] });
      part(group, 'oct', M.shard, { r: 0.3, pos: [-0.4, 1.4, -0.2], rot: [0.5, 0.2, 0] });
    }
  }
  group.userData.type = object.type;
  scene.add(group);
  return group;
}

function removeObjectView(view) {
  scene.remove(view);
  view.traverse(child => { if (child.isMesh) child.geometry.dispose(); });
}

function syncObjects() {
  const run = runner.run;
  if (!run) return;
  const active = new Set();
  for (const object of run.objects) {
    if (object.resolved) continue;
    active.add(object.id);
    let view = worldState.objects.get(object.id);
    if (!view) { view = makeObjectView(object, run.world); worldState.objects.set(object.id, view); }
    view.position.x = LANES[object.lane];
    view.position.z = object.z;
    if (object.type === 'shard') {
      view.rotation.y += 0.045;
      view.position.y = 1.0 + Math.sin(run.elapsed * 5 + object.phase) * 0.12;
      const halo = view.userData.halo;
      if (halo) halo.rotation.z += 0.05;
    }
    const scale = clamp(0.72 + (object.z + 34) / 68, 0.66, 1.35);
    view.scale.setScalar(scale);
  }
  for (const [id, view] of worldState.objects) {
    if (active.has(id)) continue;
    removeObjectView(view);
    worldState.objects.delete(id);
  }
}

// ------------------------------------------------------------- effects -----
const particleGeo = new THREE.SphereGeometry(0.06, 6, 5);
function createBurst(position, color, count = 18, spread = 3.4) {
  if (reducedMotion) return;
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const point = new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.1, Math.random() - 0.5).normalize();
    point.position.copy(position);
    group.add(point);
    point.userData.velocity = dir.multiplyScalar(2 + Math.random() * spread);
    point.userData.life = 0.45 + Math.random() * 0.36;
  }
  scene.add(group);
  worldState.particles.push({ points: group, age: 0 });
  if (worldState.particles.length > 6) disposeBurst(worldState.particles.shift());
}

function disposeBurst(burst) {
  scene.remove(burst.points);
  burst.points.children.forEach(point => point.material.dispose());
  burst.points.clear();
}

function updateBursts(dt) {
  for (let i = worldState.particles.length - 1; i >= 0; i--) {
    const burst = worldState.particles[i];
    burst.age += dt;
    for (const point of burst.points.children) {
      point.position.addScaledVector(point.userData.velocity, dt);
      point.userData.velocity.y -= dt * 2.6;
      point.material.opacity = Math.max(0, 1 - burst.age / point.userData.life);
      point.scale.setScalar(Math.max(0.05, 1 - burst.age));
    }
    if (burst.age > 0.85) { worldState.particles.splice(i, 1); disposeBurst(burst); }
  }
  for (let i = worldState.rings.length - 1; i >= 0; i--) {
    const ring = worldState.rings[i];
    ring.age += dt;
    const progress = Math.min(1, ring.age / 0.62);
    ring.mesh.scale.setScalar(1 + progress * 9);
    ring.mesh.material.opacity = 0.85 * (1 - progress);
    if (progress >= 1) { scene.remove(ring.mesh); ring.mesh.geometry.dispose(); ring.mesh.material.dispose(); worldState.rings.splice(i, 1); }
  }
}

function pulseRing() {
  if (reducedMotion) return;
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 64), new THREE.MeshBasicMaterial({ color: WORLDS[worldState.index].accent, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(LANES[runner.run.lane], 0.06, 0.3);
  scene.add(mesh);
  worldState.rings.push({ mesh, age: 0 });
}

function flashScreen(kind) {
  const el = $('rift-flash');
  if (!el) return;
  el.className = '';
  void el.offsetWidth;
  el.className = kind;
}

// ------------------------------------------------------------- events ------
function handleEvents(events) {
  for (const event of events) {
    if (event.type === 'collect') {
      createBurst(new THREE.Vector3(LANES[event.object.lane], 0.95, event.object.z), WORLDS[worldState.index].accent, 16, 2.6);
      audio.collect(runner.run.combo);
    } else if (event.type === 'clear') {
      createBurst(new THREE.Vector3(LANES[event.object.lane], 0.8, event.object.z), WORLDS[worldState.index].accent, 9, 2);
      audio.clear();
    } else if (event.type === 'hit') {
      $('damage').classList.remove('flash');
      void $('damage').offsetWidth;
      $('damage').classList.add('flash');
      worldState.cameraShake = reducedMotion ? 0 : 0.42;
      worldState.hitFlash = 0.5;
      createBurst(new THREE.Vector3(LANES[event.object.lane], 0.9, event.object.z), 0xc46d5d, 22, 3.6);
      audio.hit();
    } else if (event.type === 'dimension') {
      // travelled through the rift
      flashScreen('traverse');
      worldState.cameraShake = reducedMotion ? 0 : 0.7;
      audio.portalTraverse();
      portal.hide();
      portal.setProgress(0);
      worldState.portalPhase = 'idle';
      worldState.instability = 1;
      setWorld(event.world);
      createBurst(new THREE.Vector3(0, 4.5, -3), WORLDS[event.world].accent, 40, 5);
    } else if (event.type === 'finish') {
      finishRun(event.won);
    }
  }
  syncObjects();
}

// ------------------------------------------------------------- portal ------
function updatePortal(run, dt) {
  if (!run || runner.mode !== 'running') { return; }
  const finalGate = run.world === 3 && run.elapsed >= 60 - PORTAL_LEAD;
  const boundary = run.world < 3 && run.elapsed >= (run.world + 1) * 15 - PORTAL_LEAD;
  if (!finalGate && !boundary) {
    if (worldState.portalPhase !== 'idle') { portal.hide(); portal.setProgress(0); worldState.portalPhase = 'idle'; }
    return;
  }
  const dest = run.world < 3 ? run.world + 1 : 3;
  const endAt = run.world < 3 ? (run.world + 1) * 15 : 60;
  const remaining = Math.max(0, endAt - run.elapsed);
  const progress = clamp(1 - remaining / PORTAL_LEAD, 0, 1);
  if (worldState.portalPhase !== 'open' || portal.destination !== dest) {
    portal.setDestination(dest);
    portal.show();
    worldState.portalPhase = 'open';
    worldState.instability = 0;
    audio.portalOpen();
  }
  portal.setProgress(progress);
  portal.group.position.z = lerp(-78, -1.5, progress);
  worldState.instability = progress;
  if (progress > 0.35) worldState.cameraShake = Math.max(worldState.cameraShake, reducedMotion ? 0 : 0.05 + progress * 0.05);
}

// ------------------------------------------------------------- update ------
function updatePlayer(dt) {
  const run = runner.run;
  const targetLane = run ? LANES[run.lane] : LANES[1];
  worldState.laneX += (targetLane - worldState.laneX) * Math.min(1, dt * 14);
  worldState.roll = lerp(worldState.roll, run ? (worldState.laneX - targetLane) * 0.9 : 0, Math.min(1, dt * 8));
  character.root.position.x = worldState.laneX;

  const action = run?.action || '';
  const actionTimer = run?.actionTimer || 0;
  let mode = 'idle';
  let actionU = 0;
  if (runner.mode === 'running') {
    if (action === 'jump') { mode = 'jump'; actionU = 1 - actionTimer / 0.72; }
    else if (action === 'slide') { mode = 'slide'; actionU = 1 - actionTimer / 0.66; }
    else if (worldState.landTimer > 0) { mode = 'land'; actionU = 1 - worldState.landTimer / 0.2; }
    else mode = 'run';
  }
  if (worldState.wasJumping && mode !== 'jump' && worldState.landTimer <= 0) worldState.landTimer = 0.2;
  else if (worldState.landTimer > 0) worldState.landTimer = Math.max(0, worldState.landTimer - dt);
  worldState.wasJumping = mode === 'jump';

  const jumpHeight = action === 'jump' ? Math.sin(clamp(1 - actionTimer / 0.72, 0, 1) * Math.PI) * 1.35 : 0;
  const speed = run ? run.speed : 4.5;
  character.root.position.y = jumpHeight;
  character.root.position.z = 0;

  character.update(dt, {
    mode, speed: runner.mode === 'running' ? speed : 4.5, time: worldState.time,
    actionU, roll: worldState.roll, hit: worldState.hitFlash
  });
  worldState.hitFlash = Math.max(0, worldState.hitFlash - dt * 3.2);

  // footsteps tied to run cadence
  if (mode === 'run') {
    const cadence = 2 * Math.max(1, speed * 0.62) / (2 * Math.PI);
    worldState.stepPhase += dt * cadence;
    if (worldState.stepPhase >= 1) { worldState.stepPhase -= 1; audio.footstep(Math.random() < 0.5); }
  } else {
    worldState.stepPhase = 0.5;
  }

  // shadow blob
  if (character.shadow) {
    character.shadow.position.set(worldState.laneX, 0.02, 0);
    const s = clamp(1 - jumpHeight * 0.28, 0.5, 1);
    character.shadow.scale.set(s, s, s);
    character.shadow.material.opacity = 0.5 * s;
  }
}

function updateCamera(dt, time) {
  const run = runner.run;
  const speed = run ? run.speed : 4.5;
  const targetFov = runner.mode === 'running' ? clamp(50 + (speed - 8.4) * 1.0 + worldState.instability * 5, 50, 68) : 51;
  camera.fov = lerp(camera.fov, targetFov, Math.min(1, dt * 3));
  camera.updateProjectionMatrix();

  const laneOffset = worldState.laneX * 0.5;
  const baseY = 3.15 + (run?.action === 'jump' ? 0.45 : 0) + (run?.action === 'slide' ? -0.35 : 0);
  const bob = runner.mode === 'running' ? Math.sin(time * 8.4) * 0.028 + Math.sin(time * 2.1) * 0.016 : Math.sin(time * 0.9) * 0.04;
  const targetX = laneOffset + (worldState.cameraShake > 0 ? (Math.random() - 0.5) * worldState.cameraShake : 0);
  const targetY = baseY + bob + (worldState.cameraShake > 0 ? (Math.random() - 0.5) * worldState.cameraShake * 0.5 : 0);
  const targetZ = 6.4 - (speed - 8.4) * 0.05;
  camera.position.x += (targetX - camera.position.x) * Math.min(1, dt * 6);
  camera.position.y += (targetY - camera.position.y) * Math.min(1, dt * 6);
  camera.position.z += (targetZ - camera.position.z) * Math.min(1, dt * 4);

  const lookX = worldState.laneX * 0.4 + (run?.action === 'slide' ? 0 : 0);
  const lookY = 1.25 + (run?.action === 'jump' ? 0.55 : 0) + (run?.action === 'slide' ? -0.3 : 0);
  camera.lookAt(lookX, lookY, -9);
  if (worldState.cameraShake > 0) worldState.cameraShake = Math.max(0, worldState.cameraShake - dt * 2.2);
}

function updateHud(force = false) {
  if (!runner.run || (!force && runner.run.elapsed - worldState.hudAt < 0.1)) return;
  const run = runner.run;
  worldState.hudAt = run.elapsed;
  const dimension = DIMENSIONS[run.world];
  $('score').textContent = String(Math.floor(run.score)).padStart(5, '0');
  $('time').textContent = String(Math.ceil(Math.max(0, 60 - run.elapsed))).padStart(2, '0');
  $('world-name').textContent = dimension.name;
  $('world-index').textContent = dimension.tag;
  $('health').textContent = [0, 1, 2].map(index => index < run.health ? '●' : '○').join(' ');
  $('pulse').disabled = run.pulseCharge < 3;
  $('pulse-hint').textContent = run.pulseCharge >= 3 ? 'READY / E' : `${run.pulseCharge} / 3`;
  for (const [id, on] of [['m-plan', true], ['m-code', run.shards > 0], ['m-test', run.elapsed >= 30], ['m-ship', run.worldsCleared >= 4]]) $(id).classList.toggle('on', on);
}

function showCue(message) {
  clearTimeout(worldState.cueTimer);
  $('cue').textContent = message;
  $('cue').classList.add('on');
  worldState.cueTimer = setTimeout(() => $('cue').classList.remove('on'), 1100);
}

function finishRun(won) {
  if (runner.mode === 'results') return;
  runner.mode = 'results';
  const run = runner.run;
  const score = Math.floor(run.score);
  if (score > runner.best) { runner.best = score; write('rs_best', score); }
  flashScreen(won ? 'stabilize' : 'lost');
  audio.finish(won);
  audio.stopAmbient();
  $('hud').hidden = true;
  $('results-screen').hidden = false;
  $('result-kicker').textContent = won ? 'SIGNAL RESTORED' : 'SIGNAL LOST';
  $('result-title').textContent = won ? 'RIFT STABILIZED' : 'RUN ENDED';
  $('result-score').textContent = score.toLocaleString();
  $('result-shards').textContent = run.shards;
  $('result-combo').textContent = run.bestCombo;
  $('result-worlds').textContent = `${run.worldsCleared} / 4`;
  $('result-message').textContent = runner.player?.id ? 'Saving your signal…' : 'Run complete. Connect a start.ng account to save a shared score.';
  $('lb-list').className = 'lb-empty';
  $('lb-list').textContent = 'Loading shared scores…';
  const stats = { score: clamp(score, 0, 1e9), best_combo: clamp(run.bestCombo, 0, 1e9), ships: clamp(run.worldsCleared, 0, 1e9) };
  saveAndLoadBoard(runner.runId, stats);
}

async function saveAndLoadBoard(runId, stats) {
  if (runner.player?.id) {
    const saved = await askStartNg({ type: 'startng:score', stats }, 'startng:scoreSaved');
    if (runId !== runner.runId) return;
    $('result-message').textContent = saved?.ok
      ? (saved.result?.improved ? `New personal best — rank #${saved.result.rank || '—'}.` : `Signal saved — rank #${saved.result?.rank || '—'}.`)
      : (saved?.error || 'Shared score could not be saved.');
  }
  const board = await askStartNg({ type: 'startng:leaderboard', limit: 10 }, 'startng:leaderboardData');
  if (runId !== runner.runId) return;
  const list = $('lb-list');
  list.replaceChildren();
  const entries = board?.entries || [];
  if (!entries.length) {
    list.className = 'lb-empty';
    list.textContent = 'No shared scores available yet.';
    return;
  }
  list.className = '';
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'lb-row' + (runner.player && entry.player_id === runner.player.id ? ' me' : '');
    const name = document.createElement('span');
    const value = document.createElement('span');
    name.textContent = `#${entry.rank}  ${entry.name || 'Rift Runner'}`;
    value.textContent = Number(entry.stats?.score ?? entry.score ?? 0).toLocaleString();
    row.append(name, value);
    list.append(row);
  }
}

// ------------------------------------------------------------- loop --------
function render(timestamp) {
  raf = requestAnimationFrame(render);
  if (document.hidden || !renderer) return;
  const dt = lastFrame ? Math.min(0.05, Math.max(0, (timestamp - lastFrame) / 1000)) : 0;
  lastFrame = timestamp;
  worldState.time += dt;

  const running = runner.mode === 'running' && runner.run;
  if (running) {
    const events = updateRun(runner.run, dt);
    handleEvents(events);
    updateHud();
  }
  const speed = running ? runner.run.speed : 4.5;
  if (activeWorld) activeWorld.update(dt, speed, worldState.time);
  updatePortal(runner.run, dt);
  portal.update(dt, worldState.time, 1);
  updatePlayer(dt);
  updateCamera(dt, worldState.time);
  updateBursts(dt);

  // instability tint on the frame edges as the rift opens
  const shell = $('game');
  if (shell) shell.style.setProperty('--instability', String(worldState.instability));

  renderer.render(scene, camera);

  const info = renderer.info;
  drawCalls = info.render.calls;
  triangles = info.render.triangles;
  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 0.5) { fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0; }
}

function onVisibilityChange() {
  if (document.hidden) {
    lastFrame = 0;
    audio.suspend();
    return;
  }
  lastFrame = 0;
  if (!runner.muted) audio.resume();
  loadPlayer();
  if (runner.mode === 'running') showCue('RIFT RESUMED');
}

// Validation hook (used by the local browser harness; harmless in production).
window.__riftsync = () => ({
  mode: runner.mode,
  world: runner.run ? runner.run.world : worldState.index,
  elapsed: runner.run ? Number(runner.run.elapsed.toFixed(2)) : 0,
  health: runner.run ? runner.run.health : null,
  score: runner.run ? Math.floor(runner.run.score) : 0,
  portalPhase: worldState.portalPhase,
  portalDest: portal?.destination,
  fps: Number(fps.toFixed(1)),
  drawCalls, triangles,
  characterLoaded: !!character
});

$('best-label').textContent = runner.best ? `PERSONAL BEST ${Number(runner.best).toLocaleString()}` : 'FIRST RUN / BEST YOUR SIGNAL';
$('mute').textContent = runner.muted ? 'SOUND OFF' : 'SOUND ON';
$('mute').setAttribute('aria-label', runner.muted ? 'Enable sound' : 'Mute sound');
audio.setMuted(runner.muted);
updateIdentity();
boot();
