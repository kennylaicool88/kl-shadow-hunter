// Pure-data description of the "Depot" training map.
// Every solid is an axis-aligned box: { min:[x,y,z], max:[x,y,z], mat }.
// Kept free of Three.js/DOM so collision and hit detection can be unit-tested in Node.
//
// Orientation: +X east, +Y up, -Z north.
//   South (z > 26)  : Team A (player) spawn
//   North (z < -26) : Team B (enemy) spawn
//   Middle band     : west alley | west yard | warehouse | east yard | east platform

export const MAP_HALF = 40;
const WALL_H = 5;

export function box(x0, y0, z0, x1, y1, z1, mat) {
  return {
    min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
    max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
    mat,
  };
}

// Wall running along X at z = zc with gaps [[gx0,gx1], ...].
export function wallX(x0, x1, zc, h, t, gaps, mat, lintel = null) {
  const out = [];
  let cur = x0;
  const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
  for (const [g0, g1] of sorted) {
    if (g0 > cur) out.push(box(cur, 0, zc - t / 2, g0, h, zc + t / 2, mat));
    if (lintel !== null) out.push(box(g0, lintel, zc - t / 2, g1, h, zc + t / 2, mat));
    cur = g1;
  }
  if (cur < x1) out.push(box(cur, 0, zc - t / 2, x1, h, zc + t / 2, mat));
  return out;
}

// Wall running along Z at x = xc with gaps.
export function wallZ(z0, z1, xc, h, t, gaps, mat, lintel = null) {
  const out = [];
  let cur = z0;
  const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
  for (const [g0, g1] of sorted) {
    if (g0 > cur) out.push(box(xc - t / 2, 0, cur, xc + t / 2, h, g0, mat));
    if (lintel !== null) out.push(box(xc - t / 2, lintel, g0, xc + t / 2, h, g1, mat));
    cur = g1;
  }
  if (cur < z1) out.push(box(xc - t / 2, 0, cur, xc + t / 2, h, z1, mat));
  return out;
}

// Staircase rising toward a platform. dir = +1 rises toward +z, -1 rises toward -z.
// Starts at zStart (bottom) and climbs `steps` steps to `topY`.
export function stairsZ(x0, x1, zStart, dir, steps, topY, depth, mat) {
  const out = [];
  const rise = topY / (steps + 1);
  for (let i = 0; i < steps; i++) {
    const za = zStart + dir * depth * i;
    const zb = zStart + dir * depth * (i + 1);
    out.push(box(x0, 0, za, x1, rise * (i + 1), zb, mat));
  }
  return out;
}

export function stairsX(z0, z1, xStart, dir, steps, topY, depth, mat) {
  const out = [];
  const rise = topY / (steps + 1);
  for (let i = 0; i < steps; i++) {
    const xa = xStart + dir * depth * i;
    const xb = xStart + dir * depth * (i + 1);
    out.push(box(xa, 0, z0, xb, rise * (i + 1), z1, mat));
  }
  return out;
}

export function crate(x, z, s = 1.2, y = 0, mat = 'crate') {
  return box(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, mat);
}

export function buildMapData() {
  const solids = [];
  const add = (b) => (Array.isArray(b) ? solids.push(...b) : solids.push(b));
  const H = MAP_HALF;

  // ---- Ground slab (covers whole playable area so nothing can fall through)
  add(box(-H - 2, -1, -H - 2, H + 2, 0, H + 2, 'ground'));

  // ---- Perimeter walls (tall)
  add(box(-H - 1, 0, -H - 1, H + 1, 9, -H, 'brick'));
  add(box(-H - 1, 0, H, H + 1, 9, H + 1, 'brick'));
  add(box(-H - 1, 0, -H, -H, 9, H, 'brick'));
  add(box(H, 0, -H, H + 1, 9, H, 'brick'));

  // ---- Spawn separator walls with chokepoint openings
  const spawnGaps = [[-37, -31], [-4, 4], [31, 37]];
  add(wallX(-H, H, -26, WALL_H, 1, spawnGaps, 'concrete', 3.4));
  add(wallX(-H, H, 26, WALL_H, 1, spawnGaps, 'concrete', 3.4));

  // ---- West alley wall (x = -28) with a doorway in the middle
  add(wallZ(-25.5, 25.5, -28, WALL_H, 1, [[-2, 2]], 'concrete', 3.0));
  // ---- East wall (x = 28) separating the platform courtyard
  add(wallZ(-25.5, 25.5, 28, WALL_H, 1, [[-14, -10], [10, 14]], 'concrete', 3.2));

  // ---- Warehouse (x -8..8, z -12..12), roofed, four doors
  const wt = 0.6;
  const wh = 6;
  add(wallX(-8, 8, -12, wh, wt, [[-1.5, 1.5]], 'metal', 3.2));
  add(wallX(-8, 8, 12, wh, wt, [[-1.5, 1.5]], 'metal', 3.2));
  add(wallZ(-12.3, 12.3, -8, wh, wt, [[-6, -3.5]], 'metal', 3.2));
  add(wallZ(-12.3, 12.3, 8, wh, wt, [[3.5, 6]], 'metal', 3.2));
  add(box(-8.6, wh, -12.6, 8.6, wh + 0.4, 12.6, 'roof'));
  // Interior cover
  add(crate(-4, -6, 1.6));
  add(crate(-4, -6, 1.0, 1.6));
  add(crate(4.5, 5, 1.6));
  add(crate(3, 6.3, 1.2));
  add(crate(-5.5, 7, 1.2));
  add(box(-0.6, 0, -0.6, 0.6, wh, 0.6, 'concrete')); // central pillar
  add(box(-3, 0, 1.5, -1, 1.1, 3.8, 'metal')); // low workbench
  add(crate(5.5, -7, 1.2));
  add(crate(6.2, -5.6, 1.0));

  // ---- East platform (x 31..40, z -8..8, top y=3) with stairs north & south
  const PT = 3;
  add(box(31, 0, -8, H, PT, 8, 'concrete'));
  add(stairsZ(32, 35.5, 14.5, -1, 9, PT, 0.72, 'stairs')); // from south, climbing north
  add(stairsZ(32, 35.5, -14.5, 1, 9, PT, 0.72, 'stairs')); // from north, climbing south
  // Low parapet along platform's west edge (cover), with gap
  add(box(31, PT, -8, 31.4, PT + 1.0, -2, 'concrete'));
  add(box(31, PT, 2, 31.4, PT + 1.0, 8, 'concrete'));
  add(crate(38.5, 0, 1.2, PT));

  // ---- West yard sniper tower (x -22..-17, z -4..4, top y=2.4) with stairs from east
  const TT = 2.4;
  add(box(-22, 0, -4, -17, TT, 4, 'concrete'));
  add(stairsX(-1.5, 1.5, -12.1, -1, 7, TT, 0.7, 'stairs'));
  add(box(-22, TT, -4, -19, TT + 1.0, -3.6, 'concrete')); // half-height parapets (north/south)
  add(box(-22, TT, 3.6, -19, TT + 1.0, 4, 'concrete'));

  // ---- Yard cover: crates & barriers (asymmetric for variety)
  // North yard
  add(crate(-12, -18, 1.6));
  add(crate(-10.5, -18.3, 1.2));
  add(crate(-12, -18, 1.2, 1.6));
  add(crate(12, -16, 1.6));
  add(crate(18, -21, 1.2));
  add(box(-4, 0, -20, 4, 1.1, -19.4, 'concrete')); // low barrier in front of north door
  add(crate(22, -6, 1.6));
  add(crate(22, -4.4, 1.6));
  add(crate(22, -5.2, 1.2, 1.6));
  // South yard
  add(crate(11, 18, 1.6));
  add(crate(12.6, 18, 1.2));
  add(crate(11, 18, 1.2, 1.6));
  add(crate(-13, 16, 1.6));
  add(crate(-18, 21, 1.2));
  add(box(-4, 0, 19.4, 4, 1.1, 20, 'concrete')); // low barrier in front of south door
  add(crate(17, 6, 1.6));
  add(crate(17, 7.6, 1.2));
  // West alley cover
  add(crate(-34, -12, 1.6));
  add(crate(-36.5, 8, 1.6));
  add(crate(-36.5, 8, 1.2, 1.6));
  add(crate(-31, 15, 1.2));
  add(box(-39, 0, -2, -36, 1.2, 2, 'metal')); // dumpster-like block
  // East courtyard (below platform)
  add(crate(30, 18, 1.6));
  add(crate(37, 20, 1.2));
  add(crate(30, -18, 1.6));
  add(crate(37, -21, 1.2));
  // Barrels (collide as boxes, rendered as cylinders)
  const barrel = (x, z) => box(x - 0.32, 0, z - 0.32, x + 0.32, 0.95, z + 0.32, 'barrel');
  add(barrel(-30, -22));
  add(barrel(-29.2, -21.6));
  add(barrel(9.5, -13.2));
  add(barrel(-9.6, 13.3));
  add(barrel(26.8, 2));
  add(barrel(39, 12));
  add(barrel(-39, -18));
  // Spawn-zone cover
  add(crate(-20, 32, 1.6));
  add(crate(20, 31, 1.6));
  add(crate(-20, -32, 1.6));
  add(crate(20, -31, 1.6));
  add(crate(0, -36.5, 1.2));
  add(crate(0, 36.5, 1.2));

  return {
    id: 'depot',
    solids,
    spawns: {
      A: [
        [0, 0, 33], [-3, 0, 34], [3, 0, 34], [-6, 0, 32], [6, 0, 32],
        [-9, 0, 34], [9, 0, 34], [-12, 0, 33], [12, 0, 33], [-15, 0, 35],
      ],
      B: [
        [0, 0, -33], [-3, 0, -34], [3, 0, -34], [-6, 0, -32], [6, 0, -32],
        [-9, 0, -34], [9, 0, -34], [-12, 0, -33], [12, 0, -33], [-15, 0, -35],
      ],
    },
    // Facing (yaw) for each team at spawn. Yaw 0 looks toward -Z.
    spawnYaw: { A: 0, B: Math.PI },
    // Extra nav seed points on elevated areas the grid sampler might miss.
    navExtra: [
      [35.5, PT, 0], [35.5, PT, 5], [35.5, PT, -5], [38, PT, 4], [38, PT, -4],
      [-19.5, TT, 0], [-19.5, TT, 2.5], [-19.5, TT, -2.5],
    ],
    bounds: { min: [-H, -1, -H], max: [H, 10, H] },
  };
}
