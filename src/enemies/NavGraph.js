// Waypoint navigation graph generated automatically from the collision geometry.
// Nodes sit on walkable floor; edges exist only where a character can actually walk
// (checked by sampling floor height and body clearance along the segment).
import { STEP_HEIGHT } from '../physics/CollisionSystem.js';

const BOT_RADIUS = 0.42;
const BOT_HEIGHT = 1.7;
const SAMPLE = 0.25;

export class NavGraph {
  constructor(collision, mapData, spacing = 2) {
    this.collision = collision;
    this.nodes = []; // { id, x, y, z, edges: [{to, cost}] }
    this._build(mapData, spacing);
  }

  // Floor height at (x,z) when standing roughly at height y (null if no floor / blocked).
  _floorAt(x, z, y) {
    // Near-point footprint so the floor matches what a downward ray at the node finds (stairs).
    return this.collision.floorBelow(x, z, 0.08, y + STEP_HEIGHT, STEP_HEIGHT + 0.6);
  }

  // Body clearance. Starts at step height (the character controller steps over anything lower,
  // e.g. the next stair when walking down) and uses a slimmer core so stair nodes aren't rejected.
  _clear(x, y, z) {
    const r = BOT_RADIUS * 0.72;
    return !this.collision.overlapsAny(x - r, y + STEP_HEIGHT, z - r, x + r, y + BOT_HEIGHT, z + r);
  }

  /** True when a character can walk in a straight line from a to b. */
  walkable(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(len / SAMPLE));
    let y = ay;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = ax + dx * t, z = az + dz * t;
      const f = this._floorAt(x, z, y);
      if (f === null) return false;
      if (Math.abs(f - y) > STEP_HEIGHT) return false;
      if (!this._clear(x, f, z)) return false;
      y = f;
    }
    return Math.abs(y - by) <= STEP_HEIGHT; // endpoints may sit exactly on a stair edge
  }

  _build(mapData, spacing) {
    const b = mapData.bounds;
    const candidates = [];
    const col = this.collision;
    const pushNode = (x, y, z) => {
      if (!this._clear(x, y, z)) return;
      candidates.push({ x, y, z });
    };
    // Each nav level casts rays down from a start height (below roofs / ceilings) to find floors.
    const levels = mapData.navLevels || [{ from: 4.6, length: 6 }];
    for (let x = b.min[0] + 1; x <= b.max[0] - 1; x += spacing) {
      for (let z = b.min[2] + 1; z <= b.max[2] - 1; z += spacing) {
        const ys = [];
        for (const lv of levels) {
          const hit = col.raycast(x, lv.from, z, 0, -1, 0, lv.length);
          if (!hit || hit.normal.y < 0.5) continue;
          const y = hit.point.y;
          if (ys.some((v) => Math.abs(v - y) < 0.5)) continue; // same floor found twice
          ys.push(y);
          pushNode(x, y, z);
        }
      }
    }
    for (const [x, y, z] of mapData.navExtra || []) pushNode(x, y, z);

    // Connect neighbours within ~1.5 grid cells.
    const maxD = spacing * 1.5 + 0.01;
    const nodes = candidates.map((c, i) => ({ id: i, x: c.x, y: c.y, z: c.z, edges: [] }));
    const cell = new Map();
    const key = (x, z) => `${Math.floor(x / spacing)},${Math.floor(z / spacing)}`;
    for (const n of nodes) {
      const k = key(n.x, n.z);
      if (!cell.has(k)) cell.set(k, []);
      cell.get(k).push(n);
    }
    for (const a of nodes) {
      const cx = Math.floor(a.x / spacing), cz = Math.floor(a.z / spacing);
      for (let ix = -2; ix <= 2; ix++) {
        for (let iz = -2; iz <= 2; iz++) {
          const list = cell.get(`${cx + ix},${cz + iz}`);
          if (!list) continue;
          for (const bn of list) {
            if (bn.id <= a.id) continue;
            const d = Math.hypot(bn.x - a.x, bn.z - a.z);
            if (d > maxD || d < 0.5) continue;
            if (this.walkable(a.x, a.y, a.z, bn.x, bn.y, bn.z) && this.walkable(bn.x, bn.y, bn.z, a.x, a.y, a.z)) {
              const cost = Math.hypot(d, bn.y - a.y);
              a.edges.push({ to: bn.id, cost });
              bn.edges.push({ to: a.id, cost });
            }
          }
        }
      }
    }

    // Keep only the largest connected component (drops crate tops and enclosed pockets).
    const comp = new Int32Array(nodes.length).fill(-1);
    let bestComp = -1, bestSize = 0, c = 0;
    for (const n of nodes) {
      if (comp[n.id] !== -1) continue;
      const stack = [n.id];
      comp[n.id] = c;
      let size = 0;
      while (stack.length) {
        const id = stack.pop();
        size++;
        for (const e of nodes[id].edges) if (comp[e.to] === -1) { comp[e.to] = c; stack.push(e.to); }
      }
      if (size > bestSize) { bestSize = size; bestComp = c; }
      c++;
    }
    const remap = new Map();
    for (const n of nodes) {
      if (comp[n.id] === bestComp) {
        remap.set(n.id, this.nodes.length);
        this.nodes.push({ id: this.nodes.length, x: n.x, y: n.y, z: n.z, edges: n.edges });
      }
    }
    for (const n of this.nodes) n.edges = n.edges.filter((e) => remap.has(e.to)).map((e) => ({ to: remap.get(e.to), cost: e.cost }));

    // Spatial hash for fast nearest-node queries on large maps.
    this.hashSize = 8;
    this.hash = new Map();
    for (const n of this.nodes) {
      const k = this._hkey(Math.floor(n.x / this.hashSize), Math.floor(n.z / this.hashSize));
      if (!this.hash.has(k)) this.hash.set(k, []);
      this.hash.get(k).push(n);
    }
  }

  _hkey(cx, cz) {
    return (cx + 500) * 2000 + (cz + 500);
  }

  // Candidate nodes in growing rings of hash cells around (x, z).
  _nearbyNodes(x, z) {
    const cx = Math.floor(x / this.hashSize), cz = Math.floor(z / this.hashSize);
    for (let r = 1; r <= 40; r++) {
      const out = [];
      for (let ix = -r; ix <= r; ix++) {
        for (let iz = -r; iz <= r; iz++) {
          const list = this.hash.get(this._hkey(cx + ix, cz + iz));
          if (list) out.push(...list);
        }
      }
      if (out.length >= 4 || r === 40) return out;
    }
    return this.nodes;
  }

  nearestNode(x, y, z, requireReachable = true) {
    const search = (cands) => {
      // Sort by distance so the (expensive) visibility check runs on as few nodes as possible.
      const scored = cands.map((n) => [n, (n.x - x) ** 2 + (n.z - z) ** 2 + ((n.y - y) * 3) ** 2]).sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < scored.length && i < 60; i++) {
        const [n, d] = scored[i];
        if (requireReachable && d > 1 && !this.collision.lineClear(x, y + 0.8, z, n.x, n.y + 0.8, n.z)) continue;
        return n;
      }
      return requireReachable ? null : (scored[0] ? scored[0][0] : null);
    };
    const near = this.hash ? search(this._nearbyNodes(x, z)) : null;
    return near || search(this.nodes) || (requireReachable ? this.nearestNode(x, y, z, false) : null);
  }

  /** A* from world position to world position. Returns array of {x,y,z} (smoothed) or null. */
  findPath(from, to) {
    const start = this.nearestNode(from.x, from.y, from.z);
    const goal = this.nearestNode(to.x, to.y, to.z, false);
    if (!start || !goal) return null;
    const N = this.nodes.length;
    const g = new Float64Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new MinHeap();
    g[start.id] = 0;
    heap.push(start.id, this._h(start, goal));
    let found = false;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal.id) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const node = this.nodes[cur];
      for (const e of node.edges) {
        if (closed[e.to]) continue;
        const ng = g[cur] + e.cost;
        if (ng < g[e.to]) {
          g[e.to] = ng;
          came[e.to] = cur;
          heap.push(e.to, ng + this._h(this.nodes[e.to], goal));
        }
      }
    }
    if (!found) return null;
    const ids = [];
    for (let id = goal.id; id !== -1; id = came[id]) ids.push(id);
    ids.reverse();
    const raw = ids.map((id) => ({ x: this.nodes[id].x, y: this.nodes[id].y, z: this.nodes[id].z }));
    raw.push({ x: to.x, y: to.y, z: to.z });
    return this._smooth(from, raw);
  }

  _h(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z, a.y - b.y);
  }

  // Greedy string-pulling: skip waypoints that can be reached in a straight line.
  _smooth(from, pts) {
    const out = [];
    let cur = { x: from.x, y: from.y, z: from.z };
    let i = 0;
    while (i < pts.length) {
      let far = i;
      for (let j = Math.min(pts.length - 1, i + 6); j > i; j--) {
        if (this.walkable(cur.x, cur.y, cur.z, pts[j].x, pts[j].y, pts[j].z)) { far = j; break; }
      }
      out.push(pts[far]);
      cur = pts[far];
      i = far + 1;
    }
    return out;
  }

  randomNodeNear(x, z, radius) {
    const cands = this.nodes.filter((n) => Math.hypot(n.x - x, n.z - z) <= radius);
    if (!cands.length) return this.nodes[Math.floor(Math.random() * this.nodes.length)];
    return cands[Math.floor(Math.random() * cands.length)];
  }
}

class MinHeap {
  constructor() { this.ids = []; this.keys = []; }
  get size() { return this.ids.length; }
  push(id, key) {
    const ids = this.ids, keys = this.keys;
    let i = ids.length;
    ids.push(id); keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p]; keys[i] = keys[p];
      i = p;
    }
    ids[i] = id; keys[i] = key;
  }
  pop() {
    const ids = this.ids, keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop(), lastKey = keys.pop();
    if (ids.length) {
      let i = 0;
      const n = ids.length;
      while (true) {
        let l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        if (r < n && keys[r] < keys[l]) l = r;
        if (keys[l] >= lastKey) break;
        ids[i] = ids[l]; keys[i] = keys[l];
        i = l;
      }
      ids[i] = lastId; keys[i] = lastKey;
    }
    return top;
  }
}
