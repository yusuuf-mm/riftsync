import test from 'node:test';
import assert from 'node:assert/strict';
import { activatePulse, createRun, moveLane, performAction, updateRun } from '../src/runner-core.js';

const noSpawn = state => { state.spawnIn = 10000; };

test('lane movement clamps immediately and actions have bounded windows', () => {
  const state = createRun();
  assert.equal(moveLane(state, -1), true);
  assert.equal(state.lane, 0);
  assert.equal(moveLane(state, -1), false);
  assert.equal(state.lane, 0);
  assert.equal(performAction(state, 'jump'), true);
  assert.equal(state.action, 'jump');
  assert.ok(state.actionTimer > 0.7);
});

test('collecting a shard increments signal, chain, and pulse charge', () => {
  const state = createRun();
  noSpawn(state);
  state.objects.push({ id: 1, type: 'shard', lane: 1, z: -0.5 });
  const events = updateRun(state, 0.05);
  assert.equal(state.shards, 1);
  assert.equal(state.combo, 1);
  assert.equal(state.pulseCharge, 1);
  assert.ok(state.score >= 104);
  assert.equal(events[0].type, 'collect');
});

test('jumping and sliding clear their matching obstacle; a missed action costs integrity', () => {
  const state = createRun();
  noSpawn(state);
  performAction(state, 'jump');
  state.objects.push({ id: 1, type: 'jump', lane: 1, z: -0.5 });
  assert.equal(updateRun(state, 0.05)[0].type, 'clear');
  assert.equal(state.health, 3);

  state.action = '';
  state.actionTimer = 0;
  state.objects.push({ id: 2, type: 'slide', lane: 1, z: -0.5 });
  assert.equal(updateRun(state, 0.05)[0].type, 'hit');
  assert.equal(state.health, 2);
});

test('damage is recoverable, and the third unprotected hit ends the run', () => {
  const state = createRun();
  noSpawn(state);
  for (let id = 1; id <= 3; id++) {
    state.invulnerable = 0;
    state.objects.push({ id, type: 'block', lane: 1, z: -0.5 });
    const events = updateRun(state, 0.05);
    assert.equal(state.health, 3 - id);
    if (id === 3) assert.deepEqual(events.map(event => event.type), ['hit', 'finish']);
  }
  assert.equal(state.mode, 'results');
});

test('pulse spends three shards, protects the player, and clears nearby hazards only', () => {
  const state = createRun();
  state.pulseCharge = 3;
  state.objects = [
    { id: 1, type: 'jump', z: -3 },
    { id: 2, type: 'slide', z: -4 },
    { id: 3, type: 'block', z: -12 },
    { id: 4, type: 'shard', z: -1 }
  ];
  assert.equal(activatePulse(state), true);
  assert.equal(state.pulseCharge, 0);
  assert.equal(state.invulnerable, 0.85);
  assert.deepEqual(state.objects.map(object => object.id), [3, 4]);
});

test('the run crosses all four dimensions and completes at 60 seconds', () => {
  const state = createRun();
  noSpawn(state);
  const dimensions = [];
  let finish;
  for (let i = 0; i < 1205 && state.mode === 'running'; i++) {
    for (const event of updateRun(state, 0.05)) {
      if (event.type === 'dimension') dimensions.push(event.world);
      if (event.type === 'finish') finish = event;
    }
  }
  assert.deepEqual(dimensions, [1, 2, 3]);
  assert.equal(state.elapsed, 60);
  assert.equal(state.worldsCleared, 4);
  assert.equal(state.mode, 'results');
  assert.deepEqual(finish, { type: 'finish', won: true });
});
