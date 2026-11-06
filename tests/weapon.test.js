import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Weapon } from '../src/weapons/Weapon.js';
import { WEAPONS } from '../src/weapons/weaponConfigs.js';
import { computeDamage, hitTestCharacter, HIT_MULTIPLIER } from '../src/game/combat.js';

function tick(w, seconds, step = 1 / 60) {
  const events = [];
  for (let t = 0; t < seconds; t += step) {
    const e = w.update(step);
    if (e) events.push(e);
  }
  return events;
}

test('every weapon defines its own core stats', () => {
  for (const [id, c] of Object.entries(WEAPONS)) {
    if (c.special) continue; // the mission uplink designates targets, it doesn't shoot
    assert.ok(c.damage > 0, `${id} damage`);
    assert.ok(c.fireInterval > 0, `${id} fire rate`);
    assert.ok(c.range > 0, `${id} range`);
    assert.ok(c.sound, `${id} sound`);
    if (!c.melee) {
      assert.ok(c.magSize > 0 && c.reserveMax > 0, `${id} ammo`);
      assert.ok(c.reloadTime > 0, `${id} reload`);
      assert.ok(c.recoil && c.recoil.pitch > 0, `${id} recoil`);
      assert.ok(c.spread && c.spread.base >= 0, `${id} spread`);
    }
  }
});

test('firing consumes ammunition and respects fire rate', () => {
  const w = new Weapon('rifle');
  assert.equal(w.mag, 30);
  assert.ok(w.tryFire());
  assert.equal(w.mag, 29);
  assert.equal(w.tryFire(), false, 'cannot fire again before cooldown');
  tick(w, 0.11);
  assert.ok(w.tryFire());
  assert.equal(w.mag, 28);
});

test('reload restores the magazine and draws from reserve', () => {
  const w = new Weapon('rifle');
  for (let i = 0; i < 12; i++) { w.cooldown = 0; w.tryFire(); }
  assert.equal(w.mag, 18);
  assert.ok(w.startReload());
  assert.equal(w.tryFire(), false, 'cannot fire while reloading');
  const ev = tick(w, 2.5);
  assert.deepEqual(ev, ['reloaded']);
  assert.equal(w.mag, 30);
  assert.equal(w.reserve, 90 - 12);
});

test('reload with low reserve only loads what is available', () => {
  const w = new Weapon('pistol', { mag: 2, reserve: 5 });
  w.startReload();
  tick(w, 2.1);
  assert.equal(w.mag, 7);
  assert.equal(w.reserve, 0);
  assert.equal(w.startReload(), false, 'no reserve -> no reload');
});

test('cannot reload a full magazine', () => {
  const w = new Weapon('pistol');
  assert.equal(w.startReload(), false);
});

test('empty magazine cannot fire', () => {
  const w = new Weapon('sniper', { mag: 0, reserve: 5 });
  assert.equal(w.tryFire(), false);
});

test('shotgun reloads shell by shell and can interrupt to fire', () => {
  const w = new Weapon('shotgun', { mag: 3, reserve: 10 });
  assert.ok(w.startReload());
  tick(w, 0.35 + 0.5 * 2 + 0.01); // start + two shells
  assert.equal(w.mag, 5);
  assert.equal(w.reserve, 8);
  assert.ok(w.reloading);
  w.cooldown = 0;
  assert.ok(w.tryFire(), 'firing interrupts shell reload');
  assert.equal(w.reloading, false);
  assert.equal(w.mag, 4);
});

test('sustained fire increases spread, which recovers when idle', () => {
  const w = new Weapon('rifle');
  const still = { speed: 0, runSpeed: 5.4, grounded: true, crouching: false, scoped: false };
  const s0 = w.getSpread(still);
  for (let i = 0; i < 8; i++) { w.cooldown = 0; w.tryFire(); w.update(0.1); }
  const s1 = w.getSpread(still);
  assert.ok(s1 > s0 * 2, `spread ${s0} -> ${s1}`);
  tick(w, 2);
  assert.ok(Math.abs(w.getSpread(still) - s0) < 1e-9);
  const moving = { ...still, speed: 5.4 };
  assert.ok(w.getSpread(moving) > s0 * 5, 'running is inaccurate');
  const air = { ...still, grounded: false };
  assert.ok(w.getSpread(air) > w.getSpread(moving), 'jumping is very inaccurate');
});

test('sniper is inaccurate unless scoped', () => {
  const w = new Weapon('sniper');
  const st = { speed: 0, runSpeed: 5.4, grounded: true, crouching: false, scoped: false };
  assert.ok(w.getSpread(st) > w.getSpread({ ...st, scoped: true }) * 50);
});

test('armor absorbs damage; legs bypass armor', () => {
  const noArmor = computeDamage(40, 0, 0.5, 'body');
  assert.equal(noArmor.health, 40);
  const armored = computeDamage(40, 100, 0.5, 'body');
  assert.equal(armored.health, 20);
  assert.equal(armored.armor, 10);
  const legs = computeDamage(40, 100, 0.5, 'legs');
  assert.equal(legs.health, 40);
  assert.equal(legs.armor, 0);
});

test('character hitboxes distinguish head, body and legs', () => {
  const pos = { x: 0, y: 0, z: 0 };
  // Ray travelling along -Z at different heights from z=10
  const at = (y) => hitTestCharacter(pos, 1.8, 0, y, 10, 0, 0, -1, 50);
  assert.equal(at(1.7).part, 'head');
  assert.equal(at(1.2).part, 'body');
  assert.equal(at(0.4).part, 'legs');
  assert.equal(at(2.0), null);
  assert.equal(hitTestCharacter(pos, 1.8, 1, 1.2, 10, 0, 0, -1, 50), null, 'miss to the side');
  assert.ok(HIT_MULTIPLIER.head > HIT_MULTIPLIER.body && HIT_MULTIPLIER.body > HIT_MULTIPLIER.legs);
});
