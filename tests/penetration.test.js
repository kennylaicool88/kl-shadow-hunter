import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionSystem } from '../src/physics/CollisionSystem.js';
import { box } from '../src/maps/mapData.js';
import { traceBullet, exitDistance, penetrationPower, CATEGORY_POWER } from '../src/weapons/penetration.js';
import { buildKLData } from '../src/city/klLevelData.js';

const east = { x: 1, y: 0, z: 0 };
const o = { x: 0, y: 1, z: 0 };

test('exit distance and normal through an AABB', () => {
  const s = box(2, 0, -1, 2.3, 3, 1, 'shopwall');
  const e = exitDistance(s, 2, 1, 0, 1, 0, 0);
  assert.ok(Math.abs(e.dist - 0.3) < 1e-9);
  assert.deepEqual(e.normal, { x: 1, y: 0, z: 0 });
});

test('a rifle goes through a plaster partition with reduced damage; a pistol does not', () => {
  const col = new CollisionSystem([box(2, 0, -1, 2.3, 3, 1, 'shopwall')]);
  const rifle = traceBullet(col, o, east, 50, CATEGORY_POWER.ar);
  assert.equal(rifle.length, 2, 'two open segments');
  assert.ok(rifle[0].exit && Math.abs(rifle[0].exit.dist - 2.3) < 1e-6);
  assert.ok(rifle[1].mul < 1 && rifle[1].mul >= 0.35, `damage multiplier ${rifle[1].mul}`);
  assert.equal(rifle[1].wall, null);
  const pistol = traceBullet(col, o, east, 50, CATEGORY_POWER.pistol);
  assert.equal(pistol.length, 1);
  assert.equal(pistol[0].exit, null);
});

test('concrete and building cores always stop rounds', () => {
  const col = new CollisionSystem([box(2, 0, -1, 2.1, 3, 1, 'concrete'), box(5, 0, -1, 5.3, 3, 1, 'bld-glass')]);
  const s = traceBullet(col, o, east, 50, CATEGORY_POWER.sniper);
  assert.equal(s.length, 1);
  assert.equal(s[0].wall.solid.mat, 'concrete');
});

test('penetration is capped at two solids', () => {
  const col = new CollisionSystem([2, 4, 6].map((x) => box(x, 0, -1, x + 0.05, 3, 1, 'fence')));
  const s = traceBullet(col, o, east, 50, CATEGORY_POWER.sniper);
  assert.equal(s.length, 3);
  assert.equal(s[2].exit, null);
  assert.ok(Math.abs(s[2].end - 6) < 1e-6);
});

test('weapon configs resolve a penetration power', () => {
  assert.equal(penetrationPower({ category: 'sniper' }), CATEGORY_POWER.sniper);
  assert.equal(penetrationPower({ category: 'ar', penetration: 0.1 }), 0.1);
});

test('KL shophouse party walls can be shot through with a rifle', () => {
  const col = new CollisionSystem(buildKLData().solids);
  // From the kopitiam (middle unit) east through the x = -48 party wall into the laundry
  const s = traceBullet(col, { x: -51, y: 1.5, z: 70 }, east, 30, CATEGORY_POWER.ar);
  assert.ok(s[0].wall && s[0].wall.solid.mat === 'shopwall' && s[0].exit, 'passes the party wall');
});
