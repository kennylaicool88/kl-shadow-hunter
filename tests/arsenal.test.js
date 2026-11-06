import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARSENAL, CATEGORIES, COMPAT, DEFAULT_ATTACHMENTS, isUnlocked } from '../src/weapons/arsenal.js';
import { WEAPONS, getWeaponConfig, weaponRatings } from '../src/weapons/weaponConfigs.js';
import { ATTACHMENTS, applyAttachments, sanitizeAttachments } from '../src/weapons/attachmentData.js';
import { THROWABLES, EQUIPMENT, DEFAULT_LOADOUT, sanitizeLoadout, GRENADE_CAPACITY, EQUIPMENT_CAPACITY } from '../src/weapons/equipmentData.js';
import { Weapon } from '../src/weapons/Weapon.js';
import { segmentPointDistance } from '../src/weapons/Throwables.js';

test('every category has multiple entries and ids are unique', () => {
  const ids = ARSENAL.map((w) => w.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of CATEGORIES) {
    const n = c.id === 'grenade' ? Object.keys(THROWABLES).length : c.id === 'equipment' ? Object.keys(EQUIPMENT).length : ARSENAL.filter((w) => w.category === c.id).length;
    assert.ok(n >= 2, `${c.id} has ${n}`);
  }
  assert.ok(ARSENAL.length >= 40);
});

test('every arsenal weapon has a complete gameplay config', () => {
  for (const e of ARSENAL) {
    const c = getWeaponConfig(e.id);
    assert.equal(c.category, e.category);
    assert.ok(c.modes && c.modes.length, `${e.id} modes`);
    assert.ok(c.magSize > 0 && c.reserveMax > 0 && c.fireInterval > 0 && c.damage > 0, e.id);
    assert.ok(c.ads && c.ads.zoom >= 1 && c.ads.time > 0, `${e.id} ads`);
    const r = weaponRatings(c);
    for (const k of ['damage', 'accuracy', 'recoil']) assert.ok(r[k] >= 0 && r[k] <= 100, `${e.id} ${k}=${r[k]}`);
  }
});

test('legacy weapons keep their original balance', () => {
  assert.equal(WEAPONS.rifle.magSize, 30);
  assert.equal(WEAPONS.rifle.damage, 32);
  assert.equal(WEAPONS.pistol.magSize, 12);
  assert.equal(WEAPONS.shotgun.pellets, 9);
  assert.equal(WEAPONS.sniper.damage, 115);
});

test('attachments apply balanced stat changes without mutating the base config', () => {
  const base = getWeaponConfig('ar_416');
  const before = JSON.stringify(base);
  const c = applyAttachments(base, { mag: 'extmag', muzzle: 'suppressor', under: 'foregrip', optic: 'x4', laser: 'laser' });
  assert.equal(JSON.stringify(base), before, 'base untouched');
  assert.equal(c.magSize, 45);
  assert.ok(c.reloadTime > base.reloadTime);
  assert.ok(c.suppressed && c.noiseMul < 1);
  assert.ok(c.recoil.pitch < base.recoil.pitch);
  assert.equal(c.ads.zoom, 4);
  assert.equal(c.ads.overlay, 'acog');
  assert.ok(c.hipSpreadMul < 1 && c.hasLaser);
  assert.ok(c.damage < base.damage, 'suppressor costs a little damage');
});

test('tube-fed shotguns get a +3 tube extension', () => {
  const c = applyAttachments(getWeaponConfig('shotgun'), { mag: 'extmag' });
  assert.equal(c.magSize, 10);
});

test('incompatible attachments are rejected', () => {
  assert.deepEqual(sanitizeAttachments(COMPAT.pistol, { optic: 'x8', muzzle: 'suppressor' }), { muzzle: 'suppressor' });
  assert.deepEqual(sanitizeAttachments(COMPAT.ar, { optic: 'suppressor' }), {});
  for (const [id, map] of Object.entries(DEFAULT_ATTACHMENTS)) {
    const cat = getWeaponConfig(id).category;
    assert.deepEqual(sanitizeAttachments(COMPAT[cat], map), map, `${id} defaults valid`);
  }
  for (const [cat, slots] of Object.entries(COMPAT)) for (const list of Object.values(slots)) for (const a of list) assert.ok(ATTACHMENTS[a], `${cat}: ${a}`);
});

test('fire modes cycle and burst/semi/auto are reported', () => {
  const w = new Weapon('ar_416');
  assert.equal(w.mode, 'auto');
  w.cycleMode();
  assert.equal(w.mode, 'burst');
  w.cycleMode();
  assert.equal(w.mode, 'semi');
  const p = new Weapon('pt_g17');
  assert.equal(p.cycleMode(), false);
  assert.equal(new Weapon('sn_axmc').mode, 'bolt');
});

test('energy weapon overheats and cools down', () => {
  const w = new Weapon('hv_energy');
  let shots = 0;
  while (!w.overheated && shots < 200) { w.cooldown = 0; if (w.tryFire()) shots++; }
  assert.ok(w.overheated && shots > 10 && shots < 40, `overheated after ${shots}`);
  assert.equal(w.tryFire(), false, 'cannot fire while overheated');
  let ev = null;
  for (let t = 0; t < 5 && ev !== 'cooled'; t += 1 / 60) ev = w.update(1 / 60);
  assert.equal(ev, 'cooled');
  w.cooldown = 0;
  assert.ok(w.tryFire());
});

test('ADS tightens spread', () => {
  const w = new Weapon('ar_416');
  const st = { speed: 0, runSpeed: 5.4, grounded: true, crouching: false, scoped: false };
  assert.ok(w.getSpread({ ...st, ads: 1 }) < w.getSpread(st) * 0.6);
});

test('loadouts are clamped to valid ids and pouch / gear capacity', () => {
  const isW = (id, slot) => !!WEAPONS[id] && WEAPONS[id].slot === slot;
  const l = sanitizeLoadout({ primary: 'pt_g17', secondary: 'nope', grenades: ['frag', 'frag', 'smoke', 'flash', 'stun', 'emp', 'x'], equipment: [...Object.keys(EQUIPMENT)] }, isW);
  assert.equal(l.primary, DEFAULT_LOADOUT.primary, 'pistol is not a primary');
  assert.equal(l.secondary, DEFAULT_LOADOUT.secondary);
  assert.equal(l.grenades.length, GRENADE_CAPACITY);
  assert.ok(!l.equipment.includes('knife') && l.equipment.length <= EQUIPMENT_CAPACITY);
});

test('unlock rules', () => {
  const spear = ARSENAL.find((w) => w.id === 'ar_spear');
  assert.equal(isUnlocked(spear, { kills: 3, missions: 0 }), false);
  assert.equal(isUnlocked(spear, { kills: 30, missions: 0 }), true);
  assert.equal(isUnlocked(spear, { kills: 0, missions: 0 }, true), true, 'sandbox');
  assert.equal(isUnlocked(ARSENAL.find((w) => w.id === 'hv_energy'), { kills: 99, missions: 1 }), true);
});

test('smoke line-of-sight geometry: segment to point distance', () => {
  const a = { x: 0, y: 0, z: 0 }, b = { x: 10, y: 0, z: 0 };
  assert.equal(segmentPointDistance(a, b, { x: 5, y: 3, z: 0 }), 3);
  assert.equal(segmentPointDistance(a, b, { x: -4, y: 3, z: 0 }), 5);
});
