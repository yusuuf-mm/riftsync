export const DIMENSIONS = [
  { name: 'THE GRID', tag: 'DIMENSION 01 / 04', color: 0x8fcbb6, fog: 0x101a1a, motif: 'grid' },
  { name: 'THE DOJO', tag: 'DIMENSION 02 / 04', color: 0xd39a73, fog: 0x211817, motif: 'dojo' },
  { name: 'THE FORGE', tag: 'DIMENSION 03 / 04', color: 0xd8a45e, fog: 0x211b16, motif: 'forge' },
  { name: 'THE VOID', tag: 'DIMENSION 04 / 04', color: 0x9eb6c2, fog: 0x111719, motif: 'void' }
];

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export function createRun() {
  return {
    mode: 'running', elapsed: 0, lane: 1, score: 0, shards: 0, health: 3,
    combo: 0, bestCombo: 0, world: 0, worldsCleared: 0, objects: [],
    spawnIn: 1.2, nextId: 0, speed: 8.4, action: '', actionTimer: 0,
    invulnerable: 0, pulseCharge: 0, pulseFlash: 0
  };
}

export function moveLane(state, direction) {
  if (state.mode !== 'running') return false;
  const next = clamp(state.lane + Math.sign(direction), 0, 2);
  const moved = next !== state.lane;
  state.lane = next;
  return moved;
}

export function performAction(state, action) {
  if (state.mode !== 'running' || !['jump', 'slide'].includes(action)) return false;
  state.action = action;
  state.actionTimer = action === 'jump' ? 0.72 : 0.66;
  return true;
}

export function activatePulse(state) {
  if (state.mode !== 'running' || state.pulseCharge < 3) return false;
  state.pulseCharge = 0;
  state.pulseFlash = 0.7;
  state.invulnerable = Math.max(state.invulnerable, 0.85);
  state.objects = state.objects.filter(object => object.type === 'shard' || object.z < -8 || object.z > 0.7);
  state.score += 75;
  return true;
}

function spawnWave(state, random) {
  const double = random() < 0.22 + state.elapsed / 150;
  const blocked = new Set();
  const count = double ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const lanes = [0, 1, 2].filter(lane => !blocked.has(lane));
    const lane = lanes[Math.floor(random() * lanes.length)];
    blocked.add(lane);
    const roll = random();
    const type = roll < 0.18 ? 'jump' : roll < 0.36 ? 'slide' : 'block';
    state.objects.push({ id: state.nextId++, lane, type, z: -34, phase: random() * Math.PI * 2 });
  }
  const safe = [0, 1, 2].filter(lane => !blocked.has(lane));
  if (random() < 0.8) {
    const lane = safe.length ? safe[Math.floor(random() * safe.length)] : Math.floor(random() * 3);
    state.objects.push({ id: state.nextId++, lane, type: 'shard', z: -34.5, phase: random() * Math.PI * 2 });
  }
  state.spawnIn = Math.max(0.84, 1.3 - state.elapsed * 0.006) + random() * 0.2;
}

export function updateRun(state, dt, random = Math.random) {
  const events = [];
  if (state.mode !== 'running') return events;
  dt = clamp(dt, 0, 0.05);
  state.elapsed = Math.min(60, state.elapsed + dt);
  state.speed = 8.4 + state.elapsed * 0.07;
  state.score += dt * 12;
  state.actionTimer = Math.max(0, state.actionTimer - dt);
  if (!state.actionTimer) state.action = '';
  state.invulnerable = Math.max(0, state.invulnerable - dt);
  state.pulseFlash = Math.max(0, state.pulseFlash - dt * 1.5);

  const nextWorld = Math.min(3, Math.floor(state.elapsed / 15));
  if (nextWorld !== state.world) {
    state.world = nextWorld;
    state.worldsCleared = Math.max(state.worldsCleared, nextWorld);
    events.push({ type: 'dimension', world: nextWorld });
  }

  state.spawnIn -= dt;
  if (state.spawnIn <= 0) spawnWave(state, random);
  for (const object of state.objects) {
    object.z += state.speed * dt;
    if (object.resolved || object.z < -0.62 || object.z > 0.7 || object.lane !== state.lane) continue;
    object.resolved = true;
    if (object.type === 'shard') {
      state.shards++;
      state.combo++;
      state.bestCombo = Math.max(state.combo, state.bestCombo);
      state.pulseCharge = Math.min(3, state.pulseCharge + 1);
      state.score += 100 + Math.min(100, state.combo * 4);
      events.push({ type: 'collect', object });
      continue;
    }
    const actionRequired = object.type === 'jump' ? 'jump' : object.type === 'slide' ? 'slide' : '';
    if (actionRequired && state.action === actionRequired && state.actionTimer > 0.08) {
      state.score += 30;
      events.push({ type: 'clear', object });
    } else if (state.invulnerable <= 0) {
      state.health--;
      state.combo = 0;
      state.invulnerable = 1.15;
      events.push({ type: 'hit', object });
      if (state.health <= 0) {
        state.mode = 'results';
        events.push({ type: 'finish', won: false });
      }
    }
  }
  state.objects = state.objects.filter(object => object.z <= 1.15 && !(object.resolved && object.type === 'shard'));

  if (state.elapsed >= 60 && state.mode === 'running') {
    state.elapsed = 60;
    state.worldsCleared = 4;
    state.score += 1500;
    state.mode = 'results';
    events.push({ type: 'finish', won: true });
  }
  return events;
}
