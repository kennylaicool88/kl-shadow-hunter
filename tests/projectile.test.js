import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectileStateMachine, FLIGHT_STATES, MAX_MACH } from '../src/weapons/ProjectileStateMachine.js';
import { TargetTracker, TRACK_MODES, LOCK_STATE } from '../src/tracking/TrackingModes.js';
import { DrillModel, MAX_DEPTH_FT, STRATA } from '../src/underground/DrillModel.js';

test('5. projectile passes through every flight state in order', () => {
  const sm = new ProjectileStateMachine();
  assert.equal(sm.state, 'READY');
  sm.selectTarget({ id: 'B-01' });
  sm.launch();
  for (let i = 0; i < 2000 && sm.state !== 'IMPACT_RESOLUTION'; i++) sm.update(1 / 60);
  sm.completeResolution();
  assert.deepEqual([...sm.history], [...FLIGHT_STATES, 'READY']);
});

test('illegal transitions are rejected', () => {
  const sm = new ProjectileStateMachine();
  assert.throws(() => sm.transition('IMPACT'));
  assert.throws(() => sm.launch(), 'cannot launch without a target');
  sm.selectTarget({ id: 'x' });
  sm.cancel();
  assert.equal(sm.state, 'READY');
});

test('6. the speed display reaches the fictional Mach 10 value during cruise', () => {
  const sm = new ProjectileStateMachine();
  sm.selectTarget({ id: 'B-01' });
  sm.launch();
  let max = 0;
  let cruiseMax = 0;
  for (let i = 0; i < 2000 && sm.state !== 'IMPACT'; i++) {
    sm.update(1 / 60);
    max = Math.max(max, sm.mach);
    if (sm.state === 'CRUISE') cruiseMax = Math.max(cruiseMax, sm.mach);
  }
  assert.equal(max, MAX_MACH);
  assert.equal(cruiseMax, MAX_MACH);
});

test('large time steps still visit every state (no skipped transitions)', () => {
  const sm = new ProjectileStateMachine();
  sm.selectTarget({ id: 'B-01' });
  sm.launch();
  sm.update(100);
  assert.equal(sm.state, 'IMPACT_RESOLUTION');
  assert.deepEqual(sm.history, FLIGHT_STATES);
});

// ---------------------------------------------------------------- tracking
const seekerAt = (x, y, z, tx, ty, tz) => {
  const d = Math.hypot(tx - x, ty - y, tz - z);
  return { pos: { x, y, z }, dir: { x: (tx - x) / d, y: (ty - y) / d, z: (tz - z) / d } };
};

test('8a. auto-trace acquires a lock over time and follows a moving target', () => {
  const tr = new TargetTracker(TRACK_MODES.AUTO_TRACE, 'npc-1');
  const target = { id: 'npc-1', pos: { x: 0, y: 0, z: 0 }, heat: 0.4 };
  let t = 0;
  for (; t < 3 && tr.state !== LOCK_STATE.LOCKED; t += 1 / 60) tr.update(1 / 60, seekerAt(0, 300, 50, 0, 0, 0), [target]);
  assert.equal(tr.state, LOCK_STATE.LOCKED);
  assert.ok(t >= 1.1, `acquisition takes time (${t.toFixed(2)}s)`);
  // Target moves; the lock's aim point follows it.
  for (let i = 0; i < 60; i++) {
    target.pos.x += 0.1;
    tr.update(1 / 60, seekerAt(0, 300, 50, target.pos.x, 0, 0), [target]);
  }
  assert.ok(Math.abs(tr.aimPoint.x - target.pos.x) < 1e-9, 'aim point tracks the moving target');
  assert.ok(tr.confidence > 0.8);
});

test('8b. heat-trace locks faster and can be pulled onto a hotter decoy', () => {
  const hostile = { id: 'B-04', pos: { x: 0, y: 0, z: 0 }, heat: 0.7 };
  const decoy = { id: 'B-03', pos: { x: 25, y: 0, z: 0 }, heat: 1.0, decoy: true };
  const tr = new TargetTracker(TRACK_MODES.HEAT_TRACE, 'B-04');
  let t = 0;
  const seeker = seekerAt(0, 200, 60, 12, 0, 0);
  for (; t < 3 && tr.state !== LOCK_STATE.LOCKED; t += 1 / 60) tr.update(1 / 60, seeker, [hostile, decoy]);
  assert.equal(tr.state, LOCK_STATE.LOCKED);
  assert.ok(t < 1.0, `heat-trace acquisition ${t.toFixed(2)}s`);
  assert.equal(tr.lockedId, 'B-03', 'hotter decoy wins');
  assert.ok(tr.decoyInterference);
  // Auto-trace ignores the decoy.
  const at = new TargetTracker(TRACK_MODES.AUTO_TRACE, 'B-04');
  for (let i = 0; i < 180; i++) at.update(1 / 60, seeker, [hostile, decoy]);
  assert.equal(at.lockedId, 'B-04');
});

test('signal interruption and loss of sight degrade and break the lock', () => {
  const tgt = { id: 'T', pos: { x: 0, y: 0, z: 0 }, heat: 0.5 };
  let blocked = false;
  const tr = new TargetTracker(TRACK_MODES.AUTO_TRACE, 'T', { lineOfSight: () => !blocked });
  const s = seekerAt(0, 250, 40, 0, 0, 0);
  for (let i = 0; i < 150; i++) tr.update(1 / 60, s, [tgt]);
  assert.equal(tr.state, LOCK_STATE.LOCKED);
  const conf = tr.confidence;
  for (let i = 0; i < 20; i++) tr.update(1 / 60, s, [tgt], 0.9);
  assert.ok(tr.signalInterrupted && tr.confidence < conf, 'interference lowers confidence');
  blocked = true;
  let lost = false;
  for (let i = 0; i < 120; i++) { tr.update(1 / 60, s, [tgt]); if (tr.events.some((e) => e.type === 'lock-lost')) lost = true; }
  assert.ok(lost && tr.state === LOCK_STATE.LOST);
  blocked = false;
  for (let i = 0; i < 200; i++) tr.update(1 / 60, s, [tgt]);
  assert.equal(tr.state, LOCK_STATE.LOCKED, 're-acquires after sight returns');
});

// ---------------------------------------------------------------- drilling
test('9. drilling model reaches the 300 ft display value, crossing every stratum', () => {
  const d = new DrillModel(300);
  const layers = new Set([d.layer.name]);
  let breach = false, done = false;
  for (let i = 0; i < 6000 && !done; i++) {
    for (const e of d.update(1 / 60)) {
      if (e.type === 'layer') layers.add(e.layer.name);
      if (e.type === 'breach') breach = true;
      if (e.type === 'done') done = true;
    }
  }
  assert.equal(d.depth, MAX_DEPTH_FT);
  assert.ok(breach && done);
  assert.equal(layers.size, STRATA.length);
});

test('drilling stops at the facility depth (shallower targets)', () => {
  const d = new DrillModel(120);
  for (let i = 0; i < 3000 && !d.done; i++) d.update(1 / 60);
  assert.equal(d.depth, 120);
});
