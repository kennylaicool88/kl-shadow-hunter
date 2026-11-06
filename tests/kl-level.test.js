import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionSystem } from '../src/physics/CollisionSystem.js';
import { buildKLData, TUNNEL_Y } from '../src/city/klLevelData.js';
import { NavGraph } from '../src/enemies/NavGraph.js';

const data = buildKLData();
const col = new CollisionSystem(data.solids);
const t0 = performance.now();
const nav = new NavGraph(col, data, data.navSpacing);
const navMs = performance.now() - t0;
const start = { x: data.playerStart[0], y: 0, z: data.playerStart[2] };

test('city nav graph builds in reasonable time and spans street + tunnel levels', () => {
  assert.ok(navMs < 8000, `nav build ${navMs.toFixed(0)}ms`);
  const street = nav.nodes.filter((n) => n.y > -0.5).length;
  const tunnel = nav.nodes.filter((n) => Math.abs(n.y - TUNNEL_Y) < 0.1).length;
  assert.ok(street > 1500, `street nodes ${street}`);
  assert.ok(tunnel > 60, `tunnel nodes ${tunnel}`);
});

test('player start and hostile spawns are clear of geometry', () => {
  assert.equal(col.bodyOverlaps(start, 0.4, 1.8), false);
  for (const h of data.hostiles) {
    const p = { x: h.pos[0], y: h.pos[1], z: h.pos[2] };
    assert.equal(col.bodyOverlaps(p, 0.38, 1.8), false, `hostile at ${h.pos} overlaps`);
  }
});

test('every hostile zone and intel point is reachable on foot from the start', () => {
  for (const h of data.hostiles) {
    const path = nav.findPath(start, { x: h.pos[0], y: h.pos[1], z: h.pos[2] });
    assert.ok(path, `no path to hostile ${h.zone} ${h.pos}`);
  }
  for (const it of data.intel) {
    const floorY = it.pos[1] < -2 ? TUNNEL_Y : 0;
    const n = nav.nearestNode(it.pos[0], floorY, it.pos[2], false);
    const d = Math.hypot(n.x - it.pos[0], n.z - it.pos[2]);
    assert.ok(d < 3.5 && Math.abs(n.y - floorY) < 0.5, `intel ${it.id} nearest walkable node ${d.toFixed(1)}m away`);
    assert.ok(nav.findPath(start, n), `no path to intel ${it.id}`);
  }
});

test('tunnel is reachable through both the public and the hidden stairwell', () => {
  // Paths must route through real nav nodes on the stairs (not just the appended goal point).
  const viaPublic = nav.findPath({ x: 28, y: 0, z: 24 }, { x: 0, y: TUNNEL_Y, z: 46 });
  const viaHidden = nav.findPath({ x: -36, y: 0, z: 78 }, { x: -36, y: TUNNEL_Y, z: 52 });
  const midStairs = (p) => p.y < -1 && p.y > TUNNEL_Y + 0.5;
  assert.ok(viaPublic && viaPublic.slice(0, -1).some((p) => p.y < -1), 'public entrance path');
  assert.ok(viaHidden && viaHidden.slice(0, -1).some((p) => p.y < -1), 'hidden entrance path');
  assert.ok(nav.nodes.some((n) => midStairs(n) && n.x > 26 && n.x < 30), 'nodes on E1 stairs');
  assert.ok(nav.nodes.some((n) => midStairs(n) && n.x > -38 && n.x < -34), 'nodes on E2 stairs');
});

test('garage rooftop (y = 12) is reachable by the exterior staircase', () => {
  // Walk the stair column north from its foot using the character controller.
  const b = { pos: { x: -74.5, y: 0, z: 1 }, radius: 0.4, height: 1.8, grounded: true };
  for (let i = 0; i < 900 && b.pos.z > -21.3; i++) col.moveBody(b, 0, -0.02, -0.03);
  assert.ok(b.pos.y > 11.5, `reached y=${b.pos.y.toFixed(2)} z=${b.pos.z.toFixed(1)}`);
  for (let i = 0; i < 120; i++) col.moveBody(b, -0.04, -0.02, 0); // step west onto the roof
  assert.ok(b.pos.x < -77 && Math.abs(b.pos.y - 12) < 0.01, `on roof: x=${b.pos.x.toFixed(1)} y=${b.pos.y.toFixed(2)}`);
});

test('landmarks are not obstructed and bunkers sit away from them', () => {
  // Nothing except the towers/podium may rise into the air space around the Twin Towers.
  for (const s of data.solids) {
    if (s.mat === 'tower') continue;
    const inX = s.max[0] > -40 && s.min[0] < 40;
    const inZ = s.max[2] > -70 && s.min[2] < -32;
    if (inX && inZ) assert.ok(s.max[1] <= data.podiumRoof + 0.01, `solid ${s.mat} rises to ${s.max[1]} near the towers`);
  }
  for (const b of data.bunkers) {
    for (const t of data.towers) {
      assert.ok(Math.hypot(b.surface[0] - t.x, b.surface[1] - t.z) > 100, `${b.id} too close to a tower`);
    }
  }
});

test('mission has hostile, protected surveillance and decoy bunkers, all within 300 ft', () => {
  const types = data.bunkers.map((b) => b.type);
  assert.ok(types.includes('HOSTILE_BUNKER'));
  assert.ok(types.includes('SURVEILLANCE_BUNKER'));
  assert.ok(types.includes('DECOY_BUNKER'));
  assert.equal(new Set(data.bunkers.map((b) => b.id)).size, data.bunkers.length, 'unique ids');
  for (const b of data.bunkers) assert.ok(b.depthFt > 0 && b.depthFt <= 300);
  assert.ok(data.bunkers.some((b) => b.depthFt === 300));
});
