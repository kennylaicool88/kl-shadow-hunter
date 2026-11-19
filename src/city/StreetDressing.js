// Street furniture and secondary detail for the KL district, laid out along the real street grid.
// glTF props (Poly Haven, CC0) are instanced in spatial chunks; procedural pieces (traffic signals,
// jersey barriers, bollards, crossings, drains, cars) are built from detailed geometry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { InstancedProps } from '../render/InstancedProps.js';
import { buildCarParts, carMaterials } from './CarModel.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Jersey (F-shape) barrier cross-section extruded along X.
function jerseyGeometry(length) {
  const s = new THREE.Shape();
  const pts = [[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.18, 0.33], [0.1, 0.8], [-0.1, 0.8], [-0.18, 0.33], [-0.3, 0.08]];
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(-length / 2, 0, 0);
  // World-ish UVs: along length / height
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2, (p.getY(i) + p.getZ(i)) / 2);
  return g;
}

export class StreetDressing {
  constructor(group, data, assets, quality) {
    this.group = group;
    this.data = data;
    this.assets = assets;
    this.q = quality; // preset object
    this.props = [];
    this.lampPositions = [];
    this.signals = [];
    this.time = 0;
    this.envMap = null;
  }

  _flat(name, opts) {
    return this.assets.flatten(name, { floor: true, center: true, ...opts });
  }

  _props(name, placements, opts = {}) {
    if (!placements.length) return;
    const parts = this._flat(name, opts.flatten);
    if (!parts) return; // fallback recorded by the asset library
    // Only larger props cast shadows (small street clutter is grounded by baked/GTAO occlusion instead).
    const caster = opts.castShadow ?? ['street_lamp', 'covered_car', 'shrub', 'street_seating'].includes(name);
    const p = new InstancedProps(this.group, parts, placements, { name, castShadow: caster });
    p.maxDistance = opts.maxDistance; // e.g. rooftop plant is only worth drawing up close
    this.props.push(p);
  }

  build(rooftop, envMap) {
    this.envMap = envMap;
    this._streetLamps();
    this._trafficSignals();
    this._crossings();
    this._barriers();
    this._bollards();
    this._furniture();
    this._cars();
    this._rooftop(rooftop);
    this._drains();
  }

  // ---------------------------------------------------------------- lamps (+ night light pool)
  _streetLamps() {
    const pts = [];
    for (let x = -88; x <= 88; x += 22) { pts.push([x, -83, 0]); pts.push([x, -73, Math.PI]); pts.push([x, 39, 0]); pts.push([x, 53, Math.PI]); }
    for (let z = -64; z <= 30; z += 22) { pts.push([-71, z, -Math.PI / 2]); pts.push([-57, z, Math.PI / 2]); pts.push([57, z, -Math.PI / 2]); pts.push([71, z, Math.PI / 2]); }
    for (const [x, z] of [[-33, -16], [33, -16], [-33, 24], [33, 24], [0, -26], [-14, -32], [14, -32]]) pts.push([x, z, 0]);
    const place = pts.map(([x, z, rot]) => {
      const y = Math.abs(x) > 56 || Math.abs(z) > 70 || (z > 38 && z < 54) ? 0.15 : 0;
      this.lampPositions.push(new THREE.Vector3(x, y + 3.7, z));
      return { x, y, z, rotY: rot, scale: 1.25 };
    });
    if (this.assets.hasModel('street_lamp')) {
      // LOD: the scanned lamp (~23k tris) only near the viewer; a ~300-tri proxy beyond.
      const hi = this._flat('street_lamp');
      const metal = hi[0].material;
      const proxy = mergeGeometries([
        new THREE.CylinderGeometry(0.06, 0.11, 3.3, 8).translate(0, 1.65, 0),
        new THREE.CylinderGeometry(0.16, 0.2, 0.25, 8).translate(0, 0.12, 0),
        new THREE.CylinderGeometry(0.13, 0.09, 0.45, 8).translate(0, 3.55, 0),
        new THREE.ConeGeometry(0.2, 0.25, 8).translate(0, 3.9, 0),
      ].map((g) => g.toNonIndexed()));
      this.props.push(new InstancedProps(this.group, hi, place, {
        // The scan's detail isn't visible beyond ~15 m; each hi chunk costs ~23k tris per lamp.
        // Small chunks so the hi-detail swap applies to one lamp at a time, not a 40 m block of them.
        name: 'street_lamp', castShadow: true, chunk: 12, lod: { parts: [{ geometry: proxy, material: metal }], distance: [14, 18, 30, 50][this.q.detail] || 18 },
      }));
    } else {
      // Documented fallback: simple pole geometry.
      const g = new THREE.CylinderGeometry(0.08, 0.12, 4.8, 8).translate(0, 2.4, 0);
      const inst = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x33383d, metalness: 0.8, roughness: 0.4 }), place.length);
      place.forEach((pl, i) => { _m.makeTranslation(pl.x, pl.y, pl.z); inst.setMatrixAt(i, _m); });
      this.group.add(inst);
    }
    // Glowing lamp heads + soft ground pools (visible at night)
    this.bulbMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 0 });
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 10, 6), this.bulbMat, this.lampPositions.length);
    this.lampPositions.forEach((p, i) => { _m.makeTranslation(p.x, p.y + 0.95, p.z); bulbs.setMatrixAt(i, _m); });
    this.group.add(bulbs);
    // Real lights: a small pool re-assigned to the lamps nearest the viewer. Always present (at zero
    // intensity by day): changing the scene's light count recompiles every shader.
    this.lightPool = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffc98a, 0, 18, 2);
      l.position.set(0, -50, 0);
      this.group.add(l);
      this.lightPool.push(l);
    }
  }

  // ---------------------------------------------------------------- traffic signals
  _trafficSignals() {
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.8, roughness: 0.45 });
    const pole = new THREE.CylinderGeometry(0.09, 0.11, 5.2, 10).translate(0, 2.6, 0);
    const arm = new THREE.CylinderGeometry(0.06, 0.06, 4.2, 8).rotateZ(Math.PI / 2).translate(2.1, 5.0, 0);
    const head = new THREE.BoxGeometry(0.34, 1.0, 0.32).translate(3.9, 4.45, 0);
    const visor = new THREE.BoxGeometry(0.36, 0.06, 0.42).translate(3.9, 4.95, 0.05);
    const ped = new THREE.BoxGeometry(0.3, 0.55, 0.3).translate(0, 2.6, 0.22);
    const body = mergeGeometries([pole, arm, head, visor, ped].map((g) => (g.index ? g.toNonIndexed() : g)));
    const spots = [[-71.5, 37.5, 0], [-56.5, 54.5, Math.PI], [56.5, 37.5, 0], [71.5, 54.5, Math.PI], [-71.5, -71.5, 0], [71.5, -71.5, Math.PI]];
    this.signalLamps = [];
    const mk = (c) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 0.05 });
    const lampGeo = new THREE.CircleGeometry(0.1, 12);
    for (const [x, z, rot] of spots) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(body, steel));
      const lamps = [0xff2a1a, 0xffb020, 0x30ff70].map((c, i) => {
        const m = new THREE.Mesh(lampGeo, mk(c));
        m.position.set(3.9, 4.75 - i * 0.3, 0.165);
        g.add(m);
        return m;
      });
      g.position.set(x, 0.15, z);
      g.rotation.y = rot;
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.group.add(g);
      this.signals.push({ lamps, phase: (x + z) * 0.01 });
    }
  }

  // ---------------------------------------------------------------- road markings
  _crossings() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -3 });
    const geos = [];
    const stripe = (x, z, w, d) => { const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2); g.translate(x, 0.025, z); geos.push(g); };
    // Zebra crossings across the west/east avenues and the south avenue
    for (const ax of [-64, 64]) for (let i = -5; i <= 5; i++) stripe(ax + i * 1.1, 34, 0.55, 3.2);
    for (const az of [46]) for (const cx of [-52, 52, -12]) for (let i = -5; i <= 5; i++) stripe(cx, az + i * 1.1, 3.2, 0.55);
    // Stop lines
    stripe(-64, 31.6, 12, 0.35); stripe(64, 31.6, 12, 0.35);
    // Edge lines along roads
    for (const z of [-81.4, -74.6]) stripe(0, z, 192, 0.15);
    for (const z of [40.4, 51.6]) stripe(0, z, 192, 0.15);
    for (const x of [-69.6, -58.4, 58.4, 69.6]) { const g = new THREE.PlaneGeometry(0.15, 106).rotateX(-Math.PI / 2); g.translate(x, 0.025, -17); geos.push(g); }
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  _barriers() {
    const concrete = this.assets.pbr('sidewalk', { color: 0xe6e3dc, key: 'barrier-concrete' });
    const geos = [];
    for (const s of this.data.solids) {
      if (s.mat !== 'barrier') continue;
      const lx = s.max[0] - s.min[0], lz = s.max[2] - s.min[2];
      const along = lx >= lz;
      const g = jerseyGeometry(Math.max(lx, lz));
      if (!along) g.rotateY(Math.PI / 2);
      g.scale(1, (s.max[1] - s.min[1]) / 0.8, 1);
      g.translate((s.min[0] + s.max[0]) / 2, 0, (s.min[2] + s.max[2]) / 2);
      geos.push(g.toNonIndexed());
    }
    if (!geos.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos), concrete);
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  _bollards() {
    const pts = [];
    for (let x = -38; x <= 38; x += 3.2) if (Math.abs(x) > 5) pts.push([x, -29.6]);
    for (let x = -54; x <= 54; x += 4) if (Math.abs(x) > 3 && (x < 24 || x > 32)) pts.push([x, 37.4]);
    const steel = new THREE.MeshStandardMaterial({ color: 0x8e959b, metalness: 1, roughness: 0.28 });
    const g = mergeGeometries([
      new THREE.CylinderGeometry(0.11, 0.12, 0.9, 14).translate(0, 0.45, 0),
      new THREE.SphereGeometry(0.11, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.9, 0),
      new THREE.TorusGeometry(0.115, 0.012, 6, 16).rotateX(Math.PI / 2).translate(0, 0.75, 0),
    ].map((x) => (x.index ? x.toNonIndexed() : x)));
    this.props.push(new InstancedProps(this.group, [{ geometry: g, material: steel }], pts.map(([x, z]) => ({ x, z })), { name: 'bollards', castShadow: false }));
  }

  _furniture() {
    // Bins and utility boxes at sidewalk corners and along the avenues
    const bins = [[-60, -20], [-60, 12], [60, -30], [60, 16], [-30, 39.2], [12, 39.2], [44, 52.8], [-44, -73], [30, -73], [-36, -14], [36, 22]];
    this._props('trash_can', bins.map(([x, z], i) => ({ x, z, y: Math.abs(x) > 56 || z > 38 || z < -70 ? 0.15 : 0, rotY: i })), { flatten: { exclude: /rust/ }, maxDistance: 30 });
    const boxes = [[-71.2, -2], [71.2, -40], [-20, 53.4], [36, 53.4], [-62.5, 70], [57.4, 2]];
    this._props('utility_box', boxes.filter((_, i) => i % 2 === 0).map(([x, z], i) => ({ x, z, y: 0.15, rotY: i * Math.PI / 2 })));
    this._props('utility_box_2', boxes.filter((_, i) => i % 2 === 1).map(([x, z], i) => ({ x, z, y: 0.15, rotY: i * Math.PI / 2 + 1 })));
    // Park seating replaces the plain bench volumes
    const benches = this.data.solids.filter((s) => s.mat === 'bench').map((s, i) => ({ x: (s.min[0] + s.max[0]) / 2, z: (s.min[2] + s.max[2]) / 2, rotY: i % 2 ? Math.PI : 0, scale: 0.55 }));
    this._props('street_seating', benches, { maxDistance: 36 }); // ~25k-triangle scan: near the viewer only
    // Planters along the podium plaza
    const planters = [];
    for (let x = -50; x <= 50; x += 10) if (Math.abs(x) > 6) planters.push({ x, z: -33.5, rotY: 0, scale: 1.6 });
    this._props('planter', planters);
    // Shrub clusters in the park (scanned asset; limited count – each is ~52k triangles)
    if (this.q.detail >= 2) {
      const shrubs = [[-40, -6], [40, 8], [-12, 30], [14, 28], [-46, 28], [46, -24], [-20, -24], [22, -26]];
      this._props('shrub', shrubs.map(([x, z], i) => ({ x, z, rotY: i * 1.9, scale: 0.9 })));
    }
  }

  _rooftop(rooftop) {
    this._props('aircon', rooftop.aircon.map((p) => ({ ...p })), { flatten: { exclude: /rusted/ }, maxDistance: 45 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa1a7, metalness: 0.9, roughness: 0.35 });
    for (const a of rooftop.antenna) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, a.h, 6), steel);
      m.position.set(a.x, a.y + a.h / 2, a.z);
      this.group.add(m);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2010, emissiveIntensity: 2.5 }));
      beacon.position.set(a.x, a.y + a.h, a.z);
      this.group.add(beacon);
    }
    const tankMat = new THREE.MeshStandardMaterial({ color: 0xd4d6d2, metalness: 0.3, roughness: 0.55 });
    for (const t of rooftop.tanks) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, 2.4, 18), tankMat);
      m.position.set(t.x, t.y + 1.2, t.z);
      m.castShadow = true;
      this.group.add(m);
    }
  }

  _drains() {
    const set = this.assets.textureSets.get('metal_plate');
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, metalness: 0.8, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -3 });
    if (set) { mat.normalMap = set.nor; mat.map = set.diff; }
    const geos = [];
    const grate = (x, z, rotY) => { const g = new THREE.PlaneGeometry(0.9, 0.45).rotateX(-Math.PI / 2).rotateY(rotY); g.translate(x, 0.02, z); geos.push(g); };
    for (let x = -86; x <= 86; x += 18) { grate(x, -81.2, 0); grate(x, 40.7, 0); grate(x, 51.3, 0); }
    for (let z = -60; z <= 30; z += 18) { grate(-69.7, z, Math.PI / 2); grate(69.7, z, Math.PI / 2); }
    this.group.add(new THREE.Mesh(mergeGeometries(geos), mat));
  }

  // ---------------------------------------------------------------- cars (parked + moving)
  _cars() {
    const parts = buildCarParts();
    this.carMats = carMaterials(this.envMap);
    const parked = this.data.solids.filter((s) => s.mat === 'car');
    // A few parked cars are under covers (scanned asset), the rest are detailed procedural sedans.
    const covered = this.assets.hasModel('covered_car') ? parked.filter((_, i) => i % 4 === 3) : [];
    const sedans = parked.filter((s) => !covered.includes(s));
    this._props('covered_car', covered.map((s) => {
      const along = (s.max[0] - s.min[0]) > (s.max[2] - s.min[2]);
      return { x: (s.min[0] + s.max[0]) / 2, z: (s.min[2] + s.max[2]) / 2, rotY: along ? Math.PI / 2 : 0 };
    }));
    this.moving = [];
    for (let i = 0; i < 10; i++) this.moving.push({ kind: 'north', lane: i % 2, t: i / 10 + Math.random() * 0.05, speed: 11 + Math.random() * 5 });
    for (let i = 0; i < 18; i++) this.moving.push({ kind: 'ring', t: i / 18, speed: 13 + Math.random() * 4 });
    const total = sedans.length + this.moving.length;
    this.carMeshes = Object.entries(parts).map(([k, g]) => {
      const m = new THREE.InstancedMesh(g, this.carMats[k], total);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = k === 'paint' || k === 'glass';
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    });
    const palette = [0xb7b9bb, 0x1f2a3a, 0x8c1c1c, 0xf2f2ef, 0x2b2b2b, 0x5a6670, 0x7c6a4d, 0x234d3a];
    const col = new THREE.Color();
    for (let i = 0; i < total; i++) this.carMeshes[0].setColorAt(i, col.setHex(palette[(i * 5) % palette.length]));
    sedans.forEach((s, i) => {
      const along = (s.max[0] - s.min[0]) > (s.max[2] - s.min[2]);
      _q.setFromAxisAngle(UP, along ? 0 : Math.PI / 2);
      _m.compose(_p.set((s.min[0] + s.max[0]) / 2, 0, (s.min[2] + s.max[2]) / 2), _q, _s);
      for (const m of this.carMeshes) m.setMatrixAt(i, _m);
    });
    this.parkedCount = sedans.length;
    this._updateTraffic(0);
  }

  _ringPos(t, out) {
    const L = 222, P = L * 4, h = 111;
    let d = (((t % 1) + 1) % 1) * P;
    if (d < L) { out.set(-h + d, 0, -h); return 0; }
    d -= L; if (d < L) { out.set(h, 0, -h + d); return -Math.PI / 2; }
    d -= L; if (d < L) { out.set(h - d, 0, h); return Math.PI; }
    d -= L; out.set(-h, 0, h - d); return Math.PI / 2;
  }

  _updateTraffic(dt) {
    let i = this.parkedCount;
    for (const c of this.moving) {
      let rot;
      if (c.kind === 'north') {
        c.t += (c.speed * dt) / 260;
        const u = ((c.t % 1) + 1) % 1;
        _p.set(c.lane ? -130 + u * 260 : 130 - u * 260, 0, c.lane ? -76 : -80);
        rot = c.lane ? 0 : Math.PI;
      } else {
        c.t += (c.speed * dt) / 888;
        rot = this._ringPos(c.t, _p);
      }
      _q.setFromAxisAngle(UP, rot);
      _m.compose(_p, _q, _s);
      for (const m of this.carMeshes) m.setMatrixAt(i, _m);
      i++;
    }
    for (const m of this.carMeshes) m.instanceMatrix.needsUpdate = true;
  }

  setNight(night) {
    this.night = night;
    this.bulbMat.emissiveIntensity = night ? 6 : 0;
    if (this.carMats) { this.carMats.head.emissiveIntensity = night ? 4 : 0; this.carMats.tail.emissiveIntensity = night ? 3 : 0.2; }
    if (!night) for (const l of this.lightPool) l.intensity = 0;
  }

  update(dt, camPos) {
    this.time += dt;
    this._updateTraffic(dt);
    const dist = this.q.propDistance + 20;
    for (const p of this.props) p.update(camPos, p.maxDistance ? Math.min(dist, p.maxDistance + Math.max(0, camPos.y - 10) * 4) : dist);
    // Traffic signal cycle: green 8 s, amber 2 s, red 10 s
    for (const s of this.signals) {
      const t = (this.time + s.phase * 20) % 20;
      const state = t < 8 ? 2 : t < 10 ? 1 : 0;
      s.lamps.forEach((l, i) => { l.material.emissiveIntensity = i === state ? 5 : 0.05; });
    }
    // Night: move the light pool to the nearest lamps.
    if (this.night) {
      this._poolTimer = (this._poolTimer || 0) - dt;
      if (this._poolTimer <= 0) {
        this._poolTimer = 0.4;
        const sorted = [...this.lampPositions].sort((a, b) => a.distanceToSquared(camPos) - b.distanceToSquared(camPos));
        this.lightPool.forEach((l, i) => { l.position.copy(sorted[i]); l.intensity = 40; });
      }
    }
  }
}
