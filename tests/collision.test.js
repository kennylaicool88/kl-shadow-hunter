import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionSystem } from '../src/physics/CollisionSystem.js';
import { buildMapData } from '../src/maps/mapData.js';

const map = buildMapData();
const col = new CollisionSystem(map.solids);

function body(x, y, z) {
  return { pos: { x, y, z }, radius: 0.4, height: 1.8, grounded: true };
}

// Simulate a character falling under gravity until grounded.
function settle(b, frames = 120) {
  let vy = 0;
  for (let i = 0; i < frames; i++) {
    vy -= 20 / 60;
    col.moveBody(b, 0, vy / 60, 0);
    if (b.grounded) vy = 0;
  }
}

test('every spawn point stands on the floor and is not inside a solid', () => {
  for (const team of ['A', 'B']) {
    for (const s of map.spawns[team]) {
      const b = body(s[0], 0.5, s[2]);
      b.grounded = false;
      assert.equal(col.bodyOverlaps(b.pos, b.radius, b.height), false, `spawn ${s} overlaps a solid`);
      settle(b);
      assert.ok(b.grounded, `spawn ${s} did not land`);
      assert.ok(Math.abs(b.pos.y) < 1e-3, `spawn ${s} landed at y=${b.pos.y}`);
    }
  }
});

test('player cannot walk through a solid wall (spawn separator wall)', () => {
  // Wall at z=-26 spans x -31..-4 (between openings). Walk north into it from z=-22 at x=-15.
  const b = body(-15, 0, -22);
  for (let i = 0; i < 600; i++) col.moveBody(b, 0, -0.01, -0.05);
  assert.ok(b.pos.z > -25.5, `walked into wall: z=${b.pos.z}`);
  assert.ok(Math.abs(b.pos.z - (-25.5 + 0.4)) < 0.01);
});

test('fast movement does not tunnel through thin walls', () => {
  const b = body(-15, 0, -22);
  col.moveBody(b, 0, 0, -12); // one huge step across the 1m wall
  assert.ok(b.pos.z > -25.5, `tunneled: z=${b.pos.z}`);
});

test('player can walk through an opening (center chokepoint)', () => {
  const b = body(0, 0, -22);
  for (let i = 0; i < 300; i++) col.moveBody(b, 0, -0.01, -0.05);
  assert.ok(b.pos.z < -27, `blocked in open doorway: z=${b.pos.z}`);
});

test('jump arc lands back on the ground', () => {
  const b = body(0, 0, 33);
  settle(b);
  let vy = 6.4;
  b.grounded = false;
  let maxY = 0;
  for (let i = 0; i < 120; i++) {
    vy -= 20 / 60;
    col.moveBody(b, 0, vy / 60, 0);
    maxY = Math.max(maxY, b.pos.y);
    if (b.grounded) break;
  }
  assert.ok(b.grounded);
  assert.ok(maxY > 0.9 && maxY < 1.2, `apex ${maxY}`);
  assert.ok(Math.abs(b.pos.y) < 1e-3);
});

test('stairs can be climbed onto the east platform (y = 3)', () => {
  // South stairs: x 32..35.5, bottom at z=14.5, rising toward z=8.
  const b = body(33.75, 0, 16);
  settle(b);
  for (let i = 0; i < 400; i++) {
    col.moveBody(b, 0, -0.02, -0.04);
  }
  assert.ok(Math.abs(b.pos.y - 3) < 0.01, `ended at y=${b.pos.y}, z=${b.pos.z}`);
  assert.ok(b.pos.z < 7);
});

test('cannot step up onto a tall crate', () => {
  // Crate stack at (11,18): 1.6m tall. Walk east into it at z=18 from x=8.
  const b = body(8, 0, 18);
  settle(b);
  for (let i = 0; i < 200; i++) col.moveBody(b, 0.05, -0.01, 0);
  assert.ok(b.pos.x < 11 - 0.8, `x=${b.pos.x}`);
  assert.ok(b.pos.y < 0.01);
});

test('raycast is stopped by a wall and reports the correct face', () => {
  // From the south yard aiming north at the warehouse south wall (z=12, x=5 is solid).
  const hit = col.raycast(5, 1.5, 20, 0, 0, -1, 100);
  assert.ok(hit);
  assert.ok(Math.abs(hit.point.z - 12.3) < 1e-6, `hit z=${hit.point.z}`);
  assert.equal(hit.normal.z, 1);
});

test('raycast passes through an open doorway', () => {
  const hit = col.raycast(0.9, 1.5, 20, 0, 0, -1, 7.5);
  // Doorway x -1.5..1.5 lets the ray reach inside the warehouse (z < 12).
  assert.equal(hit, null);
});

test('lineClear detects occlusion', () => {
  assert.equal(col.lineClear(5, 1.5, 20, 5, 1.5, 5), false);
  assert.equal(col.lineClear(0, 1.5, 33, 0, 1.5, 25), true);
});
