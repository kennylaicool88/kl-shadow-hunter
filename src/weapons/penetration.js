// Bullet penetration (gameplay model, not ballistics): a round passes through a solid when the
// material-weighted thickness along its path is below the weapon's penetration power, losing damage
// on the way. Thick structure (concrete, building cores, vehicles) always stops it.

// Resistance per metre of solid. Materials not listed are impenetrable.
export const MATERIAL_RESIST = {
  // light partitions, glazing and fittings
  shopwall: 1.2, lobby: 0.6, shop: 0.5, mall: 1.6, hoarding: 0.5, fence: 0.2, rail: 0.6, glassrail: 0.3,
  // furniture and cover props
  crate: 0.7, desk: 0.6, kiosk: 0.6, shelf: 0.5, bench: 0.6, cabinet: 0.9, barrel: 1.4,
  // vegetation
  hedge: 0.25, trunk: 1.0,
};

// Penetration power in metres of resistance-1 material.
export const CATEGORY_POWER = { pistol: 0.15, smg: 0.18, shotgun: 0.08, ar: 0.42, dmr: 0.55, heavy: 0.6, sniper: 0.9 };

export function penetrationPower(cfg) {
  return cfg.penetration ?? CATEGORY_POWER[cfg.category] ?? 0.3;
}

// Distance from a point inside / on an AABB to where the ray leaves it, and the outward exit normal.
export function exitDistance(solid, ox, oy, oz, dx, dy, dz) {
  const o = [ox, oy, oz], d = [dx, dy, dz];
  let t = Infinity, axis = 0;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) continue;
    const ta = ((d[a] > 0 ? solid.max[a] : solid.min[a]) - o[a]) / d[a];
    if (ta < t) { t = ta; axis = a; }
  }
  const normal = { x: 0, y: 0, z: 0 };
  normal[['x', 'y', 'z'][axis]] = Math.sign(d[axis]);
  return { dist: Math.max(0, t), normal };
}

/**
 * Trace one bullet through the world. Returns the open segments it flies through, in order:
 * [{ start, end, mul, wall, exit }] – `mul` is the damage multiplier while in that segment,
 * `wall` the raycast hit that ends it (null if it ran out of range), `exit` set when it went through.
 */
export function traceBullet(collision, o, d, range, power, maxPens = 2) {
  const segs = [];
  let start = 0, mul = 1, pens = 0;
  for (;;) {
    const hit = collision.raycast(o.x + d.x * start, o.y + d.y * start, o.z + d.z * start, d.x, d.y, d.z, range - start);
    if (!hit) { segs.push({ start, end: range, mul, wall: null, exit: null }); break; }
    const seg = { start, end: start + hit.dist, mul, wall: hit, exit: null };
    segs.push(seg);
    const resist = MATERIAL_RESIST[hit.solid.mat];
    if (!resist || pens >= maxPens) break;
    const ex = exitDistance(hit.solid, hit.point.x, hit.point.y, hit.point.z, d.x, d.y, d.z);
    const eff = ex.dist * resist;
    if (eff >= power) break;
    seg.exit = { dist: seg.end + ex.dist, normal: ex.normal };
    mul *= 0.35 + 0.5 * (1 - eff / power);
    start = seg.end + ex.dist + 0.01;
    pens++;
    if (start >= range) break;
  }
  return segs;
}
