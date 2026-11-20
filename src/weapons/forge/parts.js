// Geometry kit for the procedural weapon models ("forge").
// Conventions: metres; the barrel points down -Z; the bore axis is y = 0; z = 0 is the trigger.
// A Build collects geometry per material (merged into one mesh per material per part) and records
// named points (grip, support hand, ejection port…), mount anchors (optic, muzzle, under, side, stock)
// and movable sub-parts (magazine, bolt, slide, pump, feed cover) with their own pivots.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { material, MATERIAL_UV, FINISHES, hasMaterial } from './materials.js';

// ------------------------------------------------------------------ primitives (non-indexed, no uv yet)
const ni = (g) => {
  const out = g.index ? g.toNonIndexed() : g;
  if (out.attributes.uv) out.deleteAttribute('uv');
  if (out.attributes.uv1) out.deleteAttribute('uv1');
  return out;
};

export function xf(g, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  if (x || y || z) g.translate(x, y, z);
  return g;
}

export function box(w, h, d, x = 0, y = 0, z = 0, r = 0, rot = null) {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const g = rr > 0.0004 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new THREE.BoxGeometry(w, h, d);
  if (rot) xf(g, rot);
  return ni(g.translate(x, y, z));
}

// Cylinder along Z centred at z (r2 = radius at the front / -Z end).
export function cyl(r, len, x = 0, y = 0, z = 0, { r2 = r, seg = 16, open = false, rz = 0 } = {}) {
  const g = new THREE.CylinderGeometry(r, r2, len, seg, 1, open);
  g.rotateX(Math.PI / 2); // cylinder top (radius r) -> +Z (rear), bottom (r2) -> -Z (front)
  if (rz) g.rotateZ(rz);
  return ni(g.translate(x, y, z));
}

// Cylinder along X (pins, screws, knobs).
export function cylX(r, len, x = 0, y = 0, z = 0, seg = 12) {
  return ni(new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2).translate(x, y, z));
}

// Cylinder along Y.
export function cylY(r, len, x = 0, y = 0, z = 0, seg = 12, r2 = r) {
  return ni(new THREE.CylinderGeometry(r2, r, len, seg).translate(x, y, z));
}

// Lathe profile [[radius, z], ...] revolved around the Z axis (z grows toward the shooter).
export function lathe(pts, x = 0, y = 0, z = 0, seg = 20) {
  const ordered = pts[0][1] > pts[pts.length - 1][1] ? [...pts].reverse() : pts; // ascending -> outward normals
  const g = new THREE.LatheGeometry(ordered.map(([r, zz]) => new THREE.Vector2(Math.max(0.0001, r), zz)), seg);
  g.rotateX(Math.PI / 2); // lathe Y axis -> +Z
  return ni(g.translate(x, y, z));
}

// Hollow tube along Z (optic housings you can look through): outer wall, rear rim, bore, front rim.
// The closed profile keeps every face pointing out of the wall, so the bore is visible from inside.
export function tube(rOut, rIn, len, x = 0, y = 0, z = 0, seg = 20) {
  const z0 = -len / 2, z1 = len / 2;
  return lathe([[rOut, z0], [rOut, z1], [rIn, z1], [rIn, z0], [rOut, z0]], x, y, z, seg);
}

// Side profile [[z, y], ...] extruded symmetrically along X, with a bevel.
export function prof(pts, width, bevel = 0.002, x = 0, curveSegments = 6) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const b = Math.min(bevel, width * 0.3);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0005, width - b * 2), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments });
  g.translate(0, 0, -(width - b * 2) / 2);
  g.rotateY(-Math.PI / 2); // shape x -> world z ; extrusion -> world x
  g.translate(x, 0, 0);
  return ni(g);
}

// Top profile [[x, z], ...] extruded along Y (used for flat plates seen from above).
export function plate(pts, thickness, y = 0, bevel = 0.001) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0005, thickness - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y - thickness / 2 + bevel, 0);
  return ni(g);
}

export function tor(R, r, arc, x, y, z, rot = {}, seg = [8, 16]) {
  return ni(xf(new THREE.TorusGeometry(R, r, seg[0], seg[1], arc), rot).translate(x, y, z));
}

export function sphere(r, x = 0, y = 0, z = 0, seg = 12, scale = null) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(4, seg * 0.6));
  if (scale) g.scale(...scale);
  return ni(g.translate(x, y, z));
}

// Box-projected UVs in metres so generated detail maps tile at a real-world scale.
function boxUV(g, scale) {
  const p = g.attributes.position.array;
  const n = p.length / 3;
  const uv = new Float32Array(n * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let t = 0; t < n; t += 3) {
    a.fromArray(p, t * 3); b.fromArray(p, t * 3 + 3); c.fromArray(p, t * 3 + 6);
    nn.subVectors(c, b).cross(a.clone().sub(b));
    const ax = Math.abs(nn.x), ay = Math.abs(nn.y), az = Math.abs(nn.z);
    for (let k = 0; k < 3; k++) {
      const i = (t + k) * 3;
      let u, v;
      if (ax >= ay && ax >= az) { u = p[i + 2]; v = p[i + 1]; } else if (ay >= az) { u = p[i]; v = p[i + 2]; } else { u = p[i]; v = p[i + 1]; }
      uv[(t + k) * 2] = u / scale;
      uv[(t + k) * 2 + 1] = v / scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ------------------------------------------------------------------ Build
export class Build {
  constructor({ finish = 'black', lod = 0 } = {}) {
    this.f = FINISHES[finish] || FINISHES.black;
    this.lod = lod;
    this.groups = new Map([['main', { pivot: [0, 0, 0], mats: new Map() }]]);
    this.points = {};
    this.mounts = {};
    this.meta = {};
  }

  seg(n) { return this.lod ? Math.max(6, Math.ceil(n * 0.5)) : n; }

  mat(role) {
    if (this.f[role]) return this.f[role];
    if (hasMaterial(role)) return role;
    throw new Error(`forge: unknown role ${role}`);
  }

  // Add geometry (weapon space) to a part ('main' by default).
  add(role, ...geos) { return this.addTo('main', role, ...geos); }

  addTo(part, role, ...geos) {
    const g = this.groups.get(part);
    if (!g) throw new Error(`forge: unknown part ${part}`);
    const key = this.mat(role);
    if (!g.mats.has(key)) g.mats.set(key, []);
    for (const geo of geos.flat()) if (geo) g.mats.get(key).push(geo);
    return this;
  }

  // Declare a movable sub-part with its pivot (in weapon space).
  part(name, pivot = [0, 0, 0]) {
    if (!this.groups.has(name)) this.groups.set(name, { pivot, mats: new Map() });
    const self = this;
    return { add(role, ...geos) { self.addTo(name, role, ...geos); return this; } };
  }

  point(name, x, y, z) { this.points[name] = new THREE.Vector3(x, y, z); return this; }

  mount(name, x, y, z, extra = {}) { this.mounts[name] = { pos: new THREE.Vector3(x, y, z), ...extra }; return this; }

  // Merges geometry into a reusable spec (no scene objects). Instantiate it any number of times;
  // all instances share the merged geometries and materials.
  bake() {
    const groups = [];
    let tris = 0;
    for (const [name, g] of this.groups) {
      const meshes = [];
      for (const [key, geos] of g.mats) {
        if (!geos.length) continue;
        const uvScale = MATERIAL_UV[key] || 0.1;
        const list = geos.map((geo) => {
          const c = geo.clone();
          if (name !== 'main') c.translate(-g.pivot[0], -g.pivot[1], -g.pivot[2]);
          return boxUV(c, uvScale);
        });
        const merged = list.length === 1 ? list[0] : mergeGeometries(list);
        merged.computeBoundingSphere();
        tris += merged.attributes.position.count / 3;
        meshes.push({ key, geometry: merged });
      }
      groups.push({ name, pivot: g.pivot, meshes });
    }
    return { groups, points: this.points, mounts: this.mounts, meta: this.meta, tris: Math.round(tris) };
  }

  build() { return instantiate(this.bake()); }
}

// Creates scene objects for a baked spec. userData holds fresh copies of points (Vector3) and
// references to this instance's parts / anchors / muzzle.
export function instantiate(spec) {
  const root = new THREE.Group();
  const parts = {};
  for (const g of spec.groups) {
    const holder = g.name === 'main' ? root : new THREE.Group();
    if (g.name !== 'main') {
      holder.name = `part-${g.name}`;
      holder.position.set(...g.pivot);
      root.add(holder);
      parts[g.name] = holder;
    }
    for (const m of g.meshes) {
      const mesh = new THREE.Mesh(m.geometry, material(m.key));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `${g.name}:${m.key}`;
      mesh.userData.shared = true; // geometry belongs to the cached spec – never dispose per instance
      holder.add(mesh);
    }
  }
  const anchors = {};
  for (const [k, m] of Object.entries(spec.mounts)) {
    const o = new THREE.Object3D();
    o.name = `mount-${k}`;
    o.position.copy(m.pos);
    root.add(o);
    anchors[k] = o;
  }
  if (spec.points.muzzle) {
    const mz = new THREE.Object3D();
    mz.name = 'muzzle';
    mz.position.copy(spec.points.muzzle);
    root.add(mz);
    root.userData.muzzle = mz;
  }
  root.userData.points = Object.fromEntries(Object.entries(spec.points).map(([k, v]) => [k, v.clone()]));
  root.userData.parts = parts;
  root.userData.anchors = anchors;
  root.userData.mounts = Object.fromEntries(Object.entries(spec.mounts).map(([k, v]) => [k, { ...v, pos: v.pos.clone() }]));
  root.userData.meta = { ...spec.meta };
  root.userData.tris = spec.tris;
  return root;
}

// ------------------------------------------------------------------ shared components
// All take the Build first. Positions are weapon space.

// Picatinny rail between z0 and z1 whose base sits at height y. rot: rotation about the bore (0 = top).
export function picatinny(b, role, z0, z1, y, { w = 0.021, rot = 0, cx = 0, cy = 0 } = {}) {
  const len = Math.abs(z1 - z0), zc = (z0 + z1) / 2;
  const geos = [box(w * 0.72, 0.004, len, 0, y + 0.002, zc), box(w, 0.004, len, 0, y + 0.006, zc, 0.0006)];
  if (!b.lod) {
    for (let z = Math.min(z0, z1) + 0.003; z < Math.max(z0, z1) - 0.002; z += 0.01) geos.push(box(w, 0.0032, 0.0052, 0, y + 0.0095, z, 0.0005));
  } else geos.push(box(w, 0.003, len, 0, y + 0.0095, zc));
  if (rot) for (const g of geos) g.translate(-cx, -cy, 0).rotateZ(rot).translate(cx, cy, 0);
  b.add(role, geos);
  return y + 0.011; // rail top height
}

// M-LOK style slots on both sides of a handguard (dark inlays slightly proud of a flat face at |x| = half).
export function mlok(b, z0, z1, y, half, { count = 4, h = 0.0075, len = 0.03 } = {}) {
  if (b.lod) return;
  const span = (z1 - z0) / count;
  for (let i = 0; i < count; i++) {
    const z = z0 + span * (i + 0.5);
    for (const s of [-1, 1]) b.add('slot', box(0.002, h, len, s * (half + 0.0004), y, z, 0.001));
  }
}

// Row of round vent holes on both sides.
export function vents(b, z0, z1, y, half, { count = 6, r = 0.004, rows = 1, dy = 0.012 } = {}) {
  if (b.lod) return;
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < count; i++) {
      const z = z0 + ((z1 - z0) * (i + 0.5)) / count;
      for (const s of [-1, 1]) b.add('slot', cylX(r, 0.002, s * (half + 0.0005), y + row * dy, z, 10));
    }
  }
}

// Slide/receiver serrations on both sides.
export function serrations(b, role, z0, z1, y0, y1, half, count = 8) {
  if (b.lod) return;
  for (let i = 0; i < count; i++) {
    const z = z0 + ((z1 - z0) * i) / Math.max(1, count - 1);
    for (const s of [-1, 1]) b.add(role, box(0.0016, y1 - y0, 0.0018, s * (half + 0.0002), (y0 + y1) / 2, z));
  }
}

export function screw(b, x, y, z, r = 0.0025, axis = 'x') {
  if (b.lod) return;
  if (axis === 'x') b.add('steel_dark', cylX(r, 0.0016, x, y, z, 10));
  else b.add('steel_dark', cylY(r, 0.0016, x, y, z, 10));
}

export function barrel(b, z0, z1, r, { y = 0, role = 'steel', taper = 0.9, fluted = false } = {}) {
  const len = z1 - z0;
  b.add(role, cyl(r, len, 0, y, (z0 + z1) / 2, { r2: r * taper, seg: b.seg(18) }));
  if (fluted && !b.lod) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      b.add('slot', box(0.0016, 0.0016, len * 0.7, Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97, z0 + len * 0.5));
    }
  }
}

// Muzzle devices. z = rear of the device; returns the muzzle tip z.
export function muzzleDevice(b, type, z, r, y = 0) {
  const S = b.seg(18);
  switch (type) {
    case 'birdcage': {
      b.add('steel_dark', lathe([[r * 1.2, 0], [r * 1.35, -0.006], [r * 1.35, -0.05], [r * 1.2, -0.056]], 0, y, z, S));
      if (!b.lod) for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + 0.6; b.add('slot', box(0.0022, 0.003, 0.03, Math.cos(a) * r * 1.36, y + Math.sin(a) * r * 1.36, z - 0.03, 0, { rz: a + Math.PI / 2 })); }
      return z - 0.056;
    }
    case 'flash': { // three-prong
      b.add('steel_dark', lathe([[r * 1.25, 0], [r * 1.3, -0.012], [r * 1.3, -0.016]], 0, y, z, S));
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + Math.PI / 2; b.add('steel_dark', box(r * 0.7, r * 0.55, 0.034, Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95, z - 0.033, 0.0006, { rz: a })); }
      return z - 0.05;
    }
    case 'brake': {
      b.add('steel_dark', box(r * 3.2, r * 2.6, 0.06, 0, y, z - 0.03, 0.003));
      if (!b.lod) for (let k = 0; k < 3; k++) for (const s of [-1, 1]) b.add('slot', box(0.002, r * 1.9, 0.008, s * r * 1.61, y, z - 0.012 - k * 0.016, 0.001));
      return z - 0.06;
    }
    case 'big_brake': { // anti-materiel double chamber
      b.add('steel_dark', box(r * 4.2, r * 3.0, 0.11, 0, y, z - 0.055, 0.005));
      if (!b.lod) for (const zz of [-0.03, -0.075]) for (const s of [-1, 1]) b.add('slot', box(0.002, r * 2.4, 0.032, s * r * 2.11, y, z + zz, 0.002));
      b.add('steel_dark', cyl(r * 1.5, 0.012, 0, y, z - 0.116, { seg: S }));
      return z - 0.122;
    }
    case 'ak': { // AK-12 style cylindrical brake with slots
      b.add('steel_dark', lathe([[r * 1.6, 0], [r * 1.75, -0.006], [r * 1.75, -0.07], [r * 1.4, -0.076]], 0, y, z, S));
      if (!b.lod) for (let k = 0; k < 4; k++) for (const s of [-1, 1]) b.add('slot', box(0.002, 0.004, 0.012, s * r * 1.76, y, z - 0.014 - k * 0.015));
      return z - 0.076;
    }
    case 'slant': { // AK-74 style slant brake
      b.add('steel_dark', lathe([[r * 1.6, 0], [r * 1.6, -0.065], [r * 1.25, -0.072]], 0, y, z, S));
      b.add('slot', box(0.012, 0.004, 0.02, 0, y + r * 1.55, z - 0.04));
      return z - 0.072;
    }
    case 'svd': { // long slotted flash hider
      b.add('steel_dark', lathe([[r * 1.4, 0], [r * 1.5, -0.01], [r * 1.5, -0.075], [r * 1.35, -0.08]], 0, y, z, S));
      if (!b.lod) for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; b.add('slot', box(0.0025, 0.0025, 0.05, Math.cos(a) * r * 1.51, y + Math.sin(a) * r * 1.51, z - 0.045, 0, { rz: a })); }
      return z - 0.08;
    }
    case 'cap': default:
      b.add('steel_dark', cyl(r * 1.15, 0.012, 0, y, z - 0.006, { seg: S }));
      return z - 0.012;
  }
}

// AR-style pistol grip with stippled panels; (z, y) = top-front of the grip at the receiver.
export function arGrip(b, z, y, { angle = 0.32, len = 0.1, role = 'grip', w = 0.03 } = {}) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const P = (dz, dy) => [z + dz * c - dy * s, y + dy * c + dz * s]; // grip axis leans back (+Z) going down
  const pts = [P(0, 0), P(0.03, 0), P(0.034, -len * 0.5), P(0.028, -len), P(0.004, -len - 0.006), P(-0.006, -len * 0.55), P(-0.004, -0.02), P(0.002, -0.012)];
  b.add(role, prof(pts.map(([zz, yy]) => [zz, yy]), w, 0.006));
  if (!b.lod) for (let k = 0; k < 3; k++) { const [zz, yy] = P(-0.006, -0.03 - k * 0.022); b.add(role, sphere(0.006, 0, yy, zz - 0.002, 8, [1.9, 0.9, 0.7])); } // finger grooves
  b.point('grip', 0, y - len * 0.45, z + 0.012 + len * 0.45 * s);
}

export function triggerGuard(b, z0, z1, y, { role = 'body', w = 0.012 } = {}) {
  b.add(role, box(w, 0.004, z1 - z0, 0, y - 0.03, (z0 + z1) / 2, 0.0015));
  b.add(role, box(w, 0.03, 0.005, 0, y - 0.015, z0, 0.0015));
  b.add('steel_dark', prof([[0.002, y], [0.008, y], [0.012, y - 0.012], [0.009, y - 0.024], [0.005, y - 0.024], [0.006, y - 0.012]], 0.005, 0.0008));
}

export function selector(b, z, y, half) {
  if (b.lod) return;
  for (const s of [-1, 1]) b.add('steel_dark', box(0.003, 0.006, 0.016, s * (half + 0.002), y, z, 0.001));
}

// STANAG-style curved magazine (5.56). Pivot at the magwell bottom (0, yTop, z).
export function stanag(b, name, z, yTop, { len = 0.17, curve = 0.32, role = 'steel_dark', w = 0.023, d = 0.062, pmag = false } = {}) {
  const p = b.part(name, [0, yTop, z]);
  const steps = b.lod ? 4 : 8;
  for (let i = 0; i < steps; i++) {
    const t = i / steps, t2 = (i + 1) / steps;
    const a = curve * (t + t2) / 2;
    const yy = yTop - len * (t + t2) / 2;
    const zz = z - Math.sin(curve * t) * len * 0.35;
    p.add(pmag ? 'poly_black' : role, box(w, len / steps + 0.002, d - t * 0.006, 0, yy, zz, 0.002, { rx: a * 0.55 }));
  }
  if (!pmag && !b.lod) for (const s of [-1, 1]) p.add(role, box(0.0015, len * 0.75, 0.006, s * (w / 2 + 0.0004), yTop - len * 0.45, z + 0.012 + len * 0.08));
  const bz = z - Math.sin(curve) * len * 0.35;
  p.add(pmag ? 'poly_black' : role, box(w + 0.006, 0.01, d + 0.004, 0, yTop - len - 0.003, bz, 0.003, { rx: curve * 0.55 }));
  if (pmag && !b.lod) for (let k = 0; k < 4; k++) p.add('poly_black', box(w + 0.002, 0.004, 0.005, 0, yTop - 0.03 - k * 0.01, z - d / 2 + 0.008));
  return p;
}

// AK curved magazine with ribs. Pivot at magwell.
export function akMag(b, name, z, yTop, { len = 0.2, curve = 0.55, role = 'poly_plum', w = 0.026, d = 0.07 } = {}) {
  const p = b.part(name, [0, yTop, z]);
  const steps = b.lod ? 5 : 10;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const a = curve * t;
    const yy = yTop - len * t * Math.cos(a * 0.5);
    const zz = z - len * (0.42 * t * t + 0.1 * t);
    p.add(role, box(w, len / steps + 0.004, d, 0, yy, zz, 0.0025, { rx: a * 0.9 }));
  }
  if (!b.lod) for (let k = 0; k < 4; k++) { const t = 0.2 + k * 0.2; p.add(role, box(w + 0.004, 0.006, 0.01, 0, yTop - len * t, z - len * (0.42 * t * t + 0.1 * t) + d / 2 - 0.006, 0.002, { rx: curve * t * 0.9 })); }
  return p;
}

// Straight box magazine (7.62 battle rifle, sniper, SMG straight). Pivot at magwell.
export function boxMag(b, name, z, yTop, { len = 0.12, w = 0.026, d = 0.07, role = 'steel_dark', rake = 0.08, ribs = true } = {}) {
  const p = b.part(name, [0, yTop, z]);
  p.add(role, box(w, len, d, 0, yTop - len / 2, z - Math.sin(rake) * len * 0.5, 0.002, { rx: rake }));
  p.add(role, box(w + 0.005, 0.009, d + 0.004, 0, yTop - len - 0.002, z - Math.sin(rake) * len, 0.003, { rx: rake }));
  if (ribs && !b.lod) for (const s of [-1, 1]) p.add(role, box(0.0015, len * 0.7, 0.008, s * (w / 2 + 0.0004), yTop - len * 0.5, z - Math.sin(rake) * len * 0.5 + 0.01, 0, { rx: rake }));
  return p;
}

// Flip-up iron sights (rear over the receiver, front over the handguard). They go into the 'irons'
// part so they can be hidden when an optic is mounted.
export function flipSights(b, zRear, zFront, railY, { role = 'steel_dark', folded = false, part = 'irons', rearOnly = false } = {}) {
  const p = b.part(part);
  const h = folded ? 0.008 : 0.028;
  p.add(role, box(0.024, 0.012, 0.03, 0, railY + 0.006, zRear, 0.002));
  p.add(role, box(0.02, h, 0.006, 0, railY + 0.012 + h / 2, zRear + 0.004, 0.001));
  if (!folded && !b.lod) p.add('slot', cyl(0.0022, 0.008, 0, railY + 0.012 + h * 0.75, zRear + 0.004, { seg: 8 }));
  if (!rearOnly) {
    p.add(role, box(0.022, 0.012, 0.026, 0, railY + 0.006, zFront, 0.002));
    p.add(role, box(0.016, h, 0.005, 0, railY + 0.012 + h / 2, zFront, 0.001));
    p.add(role, box(0.002, h * 0.6, 0.002, 0, railY + 0.012 + h * 0.85, zFront, 0));
  }
  b.meta.ironY = railY + 0.012 + h * 0.75;
}

// Side rail on a handguard of half-width `half` centred at height cy. side: +1 right, -1 left.
export function railSide(b, role, z0, z1, cy, half, side, w = 0.018) {
  return picatinny(b, role, z0, z1, cy + half, { rot: -side * Math.PI / 2, cy, w });
}

// Bottom rail hanging below yBottom (teeth facing down).
export function railBottom(b, role, z0, z1, yBottom, w = 0.02) {
  return picatinny(b, role, z0, z1, yBottom - 0.011, { rot: Math.PI, cy: yBottom - 0.0055, w });
}

// Folding bipod under the handguard (folded flat along the barrel).
export function bipod(b, z, y, { len = 0.2, role = 'steel_dark', deployed = false } = {}) {
  b.add(role, box(0.03, 0.016, 0.03, 0, y - 0.008, z, 0.003));
  for (const s of [-1, 1]) {
    if (deployed) b.add(role, cyl(0.005, len, s * 0.04, y - 0.01 - len * 0.45, z - 0.02, { seg: 8 }).rotateX(0).translate(0, 0, 0));
    else {
      b.add(role, cyl(0.0055, len, s * 0.011, y - 0.016, z - len / 2, { seg: b.seg(10) }));
      b.add('rubber', cyl(0.007, 0.018, s * 0.011, y - 0.016, z - len + 0.009, { seg: b.seg(10) }));
    }
  }
}

// QD sling cup
export function qd(b, x, y, z) {
  if (b.lod) return;
  b.add('steel_dark', cylX(0.0055, 0.004, x, y, z, 12));
}
