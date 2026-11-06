import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionSystem } from '../src/physics/CollisionSystem.js';
import { buildMapData } from '../src/maps/mapData.js';
import { NavGraph } from '../src/enemies/NavGraph.js';

const map = buildMapData();
const col = new CollisionSystem(map.solids);
const t0 = performance.now();
const nav = new NavGraph(col, map);
const buildMs = performance.now() - t0;

test('nav graph builds quickly with a large connected walkable area', () => {
  assert.ok(nav.nodes.length > 600, `nodes: ${nav.nodes.length}`);
  assert.ok(buildMs < 3000, `build took ${buildMs.toFixed(0)}ms`);
});

test('every spawn point can reach the opposite spawn', () => {
  for (const a of map.spawns.A) {
    const b = map.spawns.B[0];
    const path = nav.findPath({ x: a[0], y: 0, z: a[2] }, { x: b[0], y: 0, z: b[2] });
    assert.ok(path && path.length > 0, `no path from ${a}`);
  }
});

test('elevated platform and sniper tower are reachable via stairs', () => {
  const plat = nav.findPath({ x: 0, y: 0, z: 33 }, { x: 36, y: 3, z: 0 });
  assert.ok(plat, 'no path to platform');
  assert.ok(Math.abs(plat[plat.length - 1].y - 3) < 0.01);
  const tower = nav.findPath({ x: 0, y: 0, z: -33 }, { x: -19.5, y: 2.4, z: 0 });
  assert.ok(tower, 'no path to tower');
});

test('path segments are walkable and never pass through walls', () => {
  const from = { x: -35, y: 0, z: 33 };
  const to = { x: 5, y: 0, z: -2 }; // inside the warehouse
  const path = nav.findPath(from, to);
  assert.ok(path);
  let prev = from;
  for (const p of path) {
    assert.ok(nav.walkable(prev.x, prev.y, prev.z, p.x, p.y, p.z), `segment ${JSON.stringify(prev)} -> ${JSON.stringify(p)}`);
    prev = p;
  }
});
