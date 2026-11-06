// Axis-aligned box collision for characters and exact ray casting against static solids.
// Pure math (no Three.js) so it can be tested in Node.

const EPS = 1e-4;
export const STEP_HEIGHT = 0.45;

export class CollisionSystem {
  constructor(solids, cellSize = 4) {
    this.solids = solids;
    this.cellSize = cellSize;
    this.cells = new Map();
    this._stamp = new Uint32Array(solids.length);
    this._stampId = 0;
    this._candidates = [];
    solids.forEach((s, i) => {
      const [cx0, cz0] = this._cell(s.min[0], s.min[2]);
      const [cx1, cz1] = this._cell(s.max[0], s.max[2]);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const k = this._key(cx, cz);
          let arr = this.cells.get(k);
          if (!arr) this.cells.set(k, (arr = []));
          arr.push(i);
        }
      }
    });
  }

  _cell(x, z) {
    return [Math.floor(x / this.cellSize), Math.floor(z / this.cellSize)];
  }

  _key(cx, cz) {
    return (cx + 1000) * 4096 + (cz + 1000);
  }

  // Collect solids whose XZ cell range overlaps the query rectangle. Reuses an internal array.
  query(minX, minZ, maxX, maxZ) {
    const out = this._candidates;
    out.length = 0;
    this._stampId++;
    if (this._stampId === 0xffffffff) {
      this._stamp.fill(0);
      this._stampId = 1;
    }
    const [cx0, cz0] = this._cell(minX, minZ);
    const [cx1, cz1] = this._cell(maxX, maxZ);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const arr = this.cells.get(this._key(cx, cz));
        if (!arr) continue;
        for (let j = 0; j < arr.length; j++) {
          const i = arr[j];
          if (this._stamp[i] !== this._stampId) {
            this._stamp[i] = this._stampId;
            out.push(this.solids[i]);
          }
        }
      }
    }
    return out;
  }

  // True when the given AABB intersects any solid (strict overlap).
  overlapsAny(minX, minY, minZ, maxX, maxY, maxZ) {
    const cands = this.query(minX, minZ, maxX, maxZ);
    for (let i = 0; i < cands.length; i++) {
      const s = cands[i];
      if (
        minX < s.max[0] - EPS && maxX > s.min[0] + EPS &&
        minY < s.max[1] - EPS && maxY > s.min[1] + EPS &&
        minZ < s.max[2] - EPS && maxZ > s.min[2] + EPS
      ) return true;
    }
    return false;
  }

  bodyOverlaps(pos, r, h) {
    return this.overlapsAny(pos.x - r, pos.y, pos.z - r, pos.x + r, pos.y + h, pos.z + r);
  }

  // Highest solid top under the footprint within [y - maxDrop, y + EPS]; returns null if none.
  floorBelow(x, z, r, y, maxDrop) {
    const cands = this.query(x - r, z - r, x + r, z + r);
    let best = null;
    for (let i = 0; i < cands.length; i++) {
      const s = cands[i];
      if (x - r >= s.max[0] - EPS || x + r <= s.min[0] + EPS) continue;
      if (z - r >= s.max[2] - EPS || z + r <= s.min[2] + EPS) continue;
      const top = s.max[1];
      if (top <= y + 0.01 && top >= y - maxDrop && (best === null || top > best)) best = top;
    }
    return best;
  }

  /**
   * Move a character body by (dx, dy, dz) with collision response.
   * body: { pos:{x,y,z} (feet), radius, height, grounded }
   * Returns flags describing contacts.
   */
  moveBody(body, dx, dy, dz, allowStep = true) {
    const result = { hitX: false, hitZ: false, landed: false, hitCeiling: false, stepped: false };
    // Sub-step so fast movement can never tunnel through thin geometry.
    const maxMove = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    const steps = Math.max(1, Math.ceil(maxMove / (body.radius * 0.5)));
    const sx = dx / steps, sy = dy / steps, sz = dz / steps;
    const wasGrounded = body.grounded;
    body.grounded = false;
    for (let i = 0; i < steps; i++) {
      if (sx !== 0 && this._moveAxis(body, 0, sx, allowStep && wasGrounded, result)) result.hitX = true;
      if (sz !== 0 && this._moveAxis(body, 2, sz, allowStep && wasGrounded, result)) result.hitZ = true;
      this._moveAxis(body, 1, sy, false, result);
    }
    // Snap down small ledges/stairs so walking downstairs doesn't turn into tiny falls.
    if (!body.grounded && wasGrounded && dy <= 0) {
      const floor = this.floorBelow(body.pos.x, body.pos.z, body.radius, body.pos.y, STEP_HEIGHT);
      if (floor !== null) {
        body.pos.y = floor;
        body.grounded = true;
      }
    }
    return result;
  }

  // Moves along one axis; returns true when blocked.
  _moveAxis(body, axis, delta, canStep, result) {
    const p = body.pos;
    const r = body.radius;
    const h = body.height;
    if (axis === 0) p.x += delta;
    else if (axis === 1) p.y += delta;
    else p.z += delta;

    let blocked = false;
    // Iterate a few times: resolving one overlap can reveal another.
    for (let iter = 0; iter < 4; iter++) {
      const cands = this.query(p.x - r, p.z - r, p.x + r, p.z + r);
      let hit = null;
      for (let i = 0; i < cands.length; i++) {
        const s = cands[i];
        if (
          p.x - r < s.max[0] - EPS && p.x + r > s.min[0] + EPS &&
          p.y < s.max[1] - EPS && p.y + h > s.min[1] + EPS &&
          p.z - r < s.max[2] - EPS && p.z + r > s.min[2] + EPS
        ) { hit = s; break; }
      }
      if (!hit) break;

      if (axis === 1) {
        if (delta <= 0) {
          p.y = hit.max[1];
          body.grounded = true;
          result.landed = true;
        } else {
          p.y = hit.min[1] - h - EPS;
          result.hitCeiling = true;
        }
        blocked = true;
        continue;
      }

      // Horizontal: try stepping up onto low obstacles (stairs, curbs).
      if (canStep) {
        const rise = hit.max[1] - p.y;
        if (rise > 0 && rise <= STEP_HEIGHT) {
          const oldY = p.y;
          p.y = hit.max[1] + EPS;
          if (!this.bodyOverlaps(p, r, h)) {
            body.grounded = true;
            result.stepped = true;
            continue;
          }
          p.y = oldY;
        }
      }
      if (axis === 0) p.x = delta > 0 ? hit.min[0] - r - EPS : hit.max[0] + r + EPS;
      else p.z = delta > 0 ? hit.min[2] - r - EPS : hit.max[2] + r + EPS;
      blocked = true;
    }
    return blocked;
  }

  /**
   * Ray cast against all solids. dir must be normalized.
   * Returns { dist, point:{x,y,z}, normal:{x,y,z}, solid } or null.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    // Avoid 0 * Infinity = NaN in the slab test for axis-aligned rays.
    if (dx === 0) dx = 1e-12;
    if (dy === 0) dy = 1e-12;
    if (dz === 0) dz = 1e-12;
    const ex = ox + dx * maxDist;
    const ez = oz + dz * maxDist;
    const cands = this.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez));
    let best = maxDist;
    let bestSolid = null;
    let bestAxis = -1;
    const invX = 1 / dx, invY = 1 / dy, invZ = 1 / dz;
    for (let i = 0; i < cands.length; i++) {
      const s = cands[i];
      let tmin = 0, tmax = best, axis = -1;
      // X slab
      let t1 = (s.min[0] - ox) * invX, t2 = (s.max[0] - ox) * invX;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) { tmin = t1; axis = 0; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
      // Y slab
      t1 = (s.min[1] - oy) * invY; t2 = (s.max[1] - oy) * invY;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) { tmin = t1; axis = 1; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
      // Z slab
      t1 = (s.min[2] - oz) * invZ; t2 = (s.max[2] - oz) * invZ;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) { tmin = t1; axis = 2; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
      if (axis === -1) {
        // Origin inside the box: treat as an immediate hit.
        tmin = 0;
      }
      if (tmin < best) {
        best = tmin;
        bestSolid = s;
        bestAxis = axis;
      }
    }
    if (!bestSolid) return null;
    const normal = { x: 0, y: 0, z: 0 };
    if (bestAxis === 0) normal.x = dx > 0 ? -1 : 1;
    else if (bestAxis === 1) normal.y = dy > 0 ? -1 : 1;
    else if (bestAxis === 2) normal.z = dz > 0 ? -1 : 1;
    else { normal.x = -dx; normal.y = -dy; normal.z = -dz; }
    return {
      dist: best,
      point: { x: ox + dx * best, y: oy + dy * best, z: oz + dz * best },
      normal,
      solid: bestSolid,
    };
  }

  // Line-of-sight test between two points (true = nothing solid in between).
  lineClear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    const hit = this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len);
    return hit === null;
  }
}

// Ray vs. a single AABB given as min/max arrays. Returns distance or -1.
export function rayAabb(ox, oy, oz, dx, dy, dz, min, max, maxDist) {
  let tmin = 0, tmax = maxDist;
  for (let a = 0; a < 3; a++) {
    const o = a === 0 ? ox : a === 1 ? oy : oz;
    const d = a === 0 ? dx : a === 1 ? dy : dz;
    if (Math.abs(d) < 1e-9) {
      if (o < min[a] || o > max[a]) return -1;
      continue;
    }
    let t1 = (min[a] - o) / d, t2 = (max[a] - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}
