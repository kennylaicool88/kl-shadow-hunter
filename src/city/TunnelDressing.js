// Industrial dressing for the B1 service tunnels and rooms. Loaded lazily after the city is ready.
// glTF props (Poly Haven, CC0): ducts, pipes, cables, fluorescent fittings, racks, desks, monitors,
// generator, barrels, crates, roller shutters, security lights. Procedural: signage, hazard markings,
// drains, water stains, ceiling panels and rotating warning beacons.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { InstancedProps } from '../render/InstancedProps.js';
import { TUNNEL_Y } from './klLevelData.js';

const T = TUNNEL_Y;
export const TUNNEL_MODELS = ['airduct', 'pipes', 'cables', 'fluorescent', 'wall_lamp', 'metal_rack', 'office_desk', 'monitor', 'generator', 'barrel', 'wooden_crate', 'cardboard_box', 'military_crate', 'shutter_door', 'security_light', 'power_box'];

function signTexture(lines, bg, fg, w = 512, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => { g.font = `bold ${i === 0 ? 70 : 34}px Arial`; g.fillText(l, w / 2, h * (0.36 + i * 0.28)); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stainTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 40; i++) {
    const x = 64 + (Math.random() - 0.5) * 50, y = Math.random() * 128;
    const grd = g.createRadialGradient(x, y, 0, x, y, 6 + Math.random() * 24);
    grd.addColorStop(0, 'rgba(40,32,20,0.35)'); grd.addColorStop(1, 'rgba(40,32,20,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class TunnelDressing {
  constructor(group, assets) {
    this.group = new THREE.Group();
    this.group.name = 'tunnel-dressing';
    group.add(this.group);
    // Lights live outside the culled group: changing the scene's light count forces shader recompiles,
    // so they are dimmed instead of removed when the viewer is far away.
    this.lightGroup = new THREE.Group();
    group.add(this.lightGroup);
    this.lights = [];
    this.assets = assets;
    this.beacons = [];
    this.props = [];
    this.time = 0;
  }

  _props(name, placements, flatten = {}) {
    const parts = this.assets.flatten(name, { floor: true, center: true, ...flatten });
    if (!parts || !placements.length) return;
    this.props.push(new InstancedProps(this.group, parts, placements, { name, chunk: 30 }));
  }

  build() {
    const y = T;
    // Ceiling panels (visual ceiling below the street slab)
    const ceil = this.assets.pbr('slab_wall', { color: 0x9a9a96, key: 'tun-ceiling' });
    const cg = [];
    const plane = (x0, z0, x1, z1) => { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI / 2); g.translate((x0 + x1) / 2, -1.05, (z0 + z1) / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / 3, uv.getY(i) * (z1 - z0) / 3); cg.push(g); };
    plane(-50, 42, 50, 50); plane(-50, 50.5, -40, 62); plane(-28, 50.5, -12, 64); plane(10, 50.5, 32, 66); plane(-38, 50.5, -34, 60);
    const ceiling = new THREE.Mesh(mergeGeometries(cg), ceil);
    ceiling.receiveShadow = true;
    this.group.add(ceiling);

    // Corridor services: duct run along the north side of the ceiling, pipes on the south wall, cable tray
    const ducts = [], pipes = [], cables = [], lights = [];
    for (let x = -48; x <= 48; x += 1.8) ducts.push({ x, y: -2.6, z: 43.4, rotY: Math.PI / 2 });
    for (let x = -48; x <= 48; x += 1.95) pipes.push({ x, y: y + 3.0, z: 49.7, rotY: 0, rotZ: Math.PI / 2 }); // horizontal run along the wall
    for (let x = -48; x <= 48; x += 2.1) cables.push({ x, y: -1.9, z: 48.9, rotY: 0 });
    for (let x = -46; x <= 46; x += 6) lights.push({ x, y: -1.12, z: 46.5, rotY: 0, scale: 1.4 });
    for (const [x, z] of [[-45, 56], [-20, 57], [20, 58], [28, 60]]) lights.push({ x, y: -1.12, z, rotY: Math.PI / 2, scale: 1.4 });
    this._props('airduct', ducts, { include: /airduct_rectangular_01_single_01/ });
    this._props('pipes', pipes, { include: /pipes_01_pipe01/ });
    this._props('cables', cables, { include: /cable_straight_long/ });
    this._props('fluorescent', lights.map((l) => ({ ...l, y: -1.1 })), { include: /fluorescent_lights_a/, floor: false });
    // Emissive tubes under each fitting (fluorescent glass may not emit on its own)
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xeaf4ff, emissiveIntensity: 5 });
    const tubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.04, 0.08), tubeMat, lights.length);
    const m = new THREE.Matrix4();
    lights.forEach((l, i) => { m.makeRotationY(l.rotY); m.setPosition(l.x, -1.17, l.z); tubes.setMatrixAt(i, m); });
    this.group.add(tubes);
    // Practical point lights (shadowless) every other fitting
    // Light budget: four practical lights cover the corridor and rooms; other fixtures are emissive only.
    [[-30, 46.5], [6, 46.5], [-45, 56], [21, 58]].map(([x, z]) => ({ x, z })).forEach((l) => {
      const p = new THREE.PointLight(0xe8f0ff, 16, 22, 2);
      p.position.set(l.x, -1.6, l.z);
      p.userData.on = 10;
      this.lightGroup.add(p);
      this.lights.push(p);
    });

    // Rooms
    this._props('metal_rack', [{ x: -26, y, z: 63, rotY: 0 }, { x: -22.5, y, z: 63, rotY: 0 }, { x: -13, y, z: 60, rotY: -Math.PI / 2 }]);
    this._props('wooden_crate', [{ x: -24, y, z: 59.5, rotY: 0.3 }, { x: -16, y, z: 54.5, rotY: 1.2 }, { x: -4, y, z: 45, rotY: 0.6 }]);
    this._props('military_crate', [{ x: -19, y, z: 61.5, rotY: 0.1 }, { x: 38, y, z: 47, rotY: 1.57 }]);
    this._props('cardboard_box', [{ x: -26.5, y, z: 56, rotY: 0.4 }, { x: -25.5, y, z: 56.6, rotY: 1.1 }]);
    this._props('barrel', [{ x: -48.5, y, z: 52 }, { x: -47.6, y, z: 52.6 }, { x: 46, y, z: 49 }, { x: 47, y, z: 49.2 }]);
    this._props('generator', [{ x: -46, y: y + 2.4, z: 58, rotY: 0, scale: 1.4 }]);
    this._props('office_desk', [{ x: 26, y, z: 63, rotY: Math.PI }, { x: 18, y, z: 63.5, rotY: Math.PI }]);
    this._props('monitor', [{ x: 24.5, y: y + 0.78, z: 63.2, rotY: Math.PI }, { x: 27.5, y: y + 0.78, z: 63.2, rotY: Math.PI }, { x: 18, y: y + 0.78, z: 63.6, rotY: Math.PI }]);
    this._props('power_box', [{ x: 31.5, y: y + 1.2, z: 56, rotY: -Math.PI / 2 }, { x: -49.6, y: y + 1.2, z: 46, rotY: Math.PI / 2 }]);
    this._props('security_light', [{ x: 25.8, y: -2.2, z: 42.3, rotY: 0 }, { x: -36, y: -2.2, z: 50.2, rotY: Math.PI }]);
    // Roller shutters on blank corridor walls (sealed side bays)
    this._props('shutter_door', [{ x: -8, y, z: 42.1, rotY: 0, scale: 0.9 }, { x: 40, y, z: 42.1, rotY: 0, scale: 0.9 }]);
    // Glowing screens in the control room
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x0b1a12, emissive: 0x39d27a, emissiveIntensity: 1.8 });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 1.6), screenMat);
    wall.position.set(21, T + 2.2, 65.9);
    wall.rotation.y = Math.PI;
    this.group.add(wall);

    this._signage();
    this._floorMarks();
    this._beacons();
  }

  _signage() {
    const signs = [
      { lines: ['BAHAYA', 'DANGER · HIGH VOLTAGE'], bg: '#f2c20f', fg: '#111', pos: [-45, T + 3.2, 50.45], rot: Math.PI },
      { lines: ['AWAS', 'AUTHORISED PERSONNEL ONLY'], bg: '#b3261e', fg: '#fff', pos: [16, T + 3.2, 50.45], rot: Math.PI },
      { lines: ['B1', 'SERVICE TUNNEL · ZON C'], bg: '#1d4f8a', fg: '#fff', pos: [28, T + 3.4, 42.05], rot: 0 },
      { lines: ['KELUAR', 'EXIT →'], bg: '#1b7f3b', fg: '#fff', pos: [-36, T + 3.4, 50.45], rot: Math.PI },
    ];
    for (const s of signs) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshStandardMaterial({ map: signTexture(s.lines, s.bg, s.fg), roughness: 0.6 }));
      m.position.set(...s.pos);
      m.rotation.y = s.rot;
      this.group.add(m);
    }
  }

  _floorMarks() {
    // Painted walking lane, hazard bands at doorways, drains and water stains
    const yellow = new THREE.MeshStandardMaterial({ color: 0xd8b21c, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 });
    const lines = [];
    const quad = (x, z, w, d) => { const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2); g.translate(x, T + 0.012, z); lines.push(g); };
    quad(0, 42.6, 100, 0.12); quad(0, 49.4, 100, 0.12);
    for (const dx of [-46, -36, -20, 16, 28]) for (let k = 0; k < 6; k++) quad(dx - 1.25 + k * 0.5, 49.9, 0.25, 0.6);
    this.group.add(new THREE.Mesh(mergeGeometries(lines), yellow));
    const grate = this.assets.textureSets.get('metal_plate');
    const drainMat = new THREE.MeshStandardMaterial({ color: 0x2c2e30, metalness: 0.85, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -3, map: grate ? grate.diff : null, normalMap: grate ? grate.nor : null });
    const drains = [];
    for (let x = -42; x <= 42; x += 12) { const g = new THREE.PlaneGeometry(1.2, 0.5).rotateX(-Math.PI / 2); g.translate(x, T + 0.014, 46); drains.push(g); }
    this.group.add(new THREE.Mesh(mergeGeometries(drains), drainMat));
    const stainMat = new THREE.MeshStandardMaterial({ map: stainTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const [x, z] of [[-30, 42.05], [6, 42.05], [34, 42.05], [-12, 49.95]]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5.5), stainMat);
      s.position.set(x, T + 3.6, z + (z < 45 ? 0.01 : -0.01));
      if (z > 45) s.rotation.y = Math.PI;
      this.group.add(s);
    }
  }

  _beacons() {
    for (const [x, z, lit] of [[-30, 46, false], [22, 46, true], [-46, 56, false]]) {
      const g = new THREE.Group();
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.24, 12), new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: 0xff8a00, emissiveIntensity: 3, transparent: true, opacity: 0.9 }));
      g.add(housing);
      g.position.set(x, -1.3, z);
      this.group.add(g);
      if (!lit) { this.beacons.push({ g, spot: null }); continue; } // emissive-only beacons
      const spot = new THREE.SpotLight(0xff9a20, 30, 14, 0.45, 0.6, 2);
      spot.position.set(x, -1.3, z);
      spot.userData.on = 30;
      this.lightGroup.add(spot, spot.target);
      this.lights.push(spot);
      this.beacons.push({ g, spot });
    }
  }

  update(dt, camPos) {
    this.time += dt;
    for (const b of this.beacons) {
      const a = this.time * 3.5;
      b.g.rotation.y = a;
      if (b.spot) b.spot.target.position.set(b.g.position.x + Math.cos(a), b.g.position.y - 1.2, b.g.position.z - Math.sin(a));
    }
    // Tunnel props only need to be drawn when the viewer is near the tunnels.
    const near = camPos.y < 2 || (Math.abs(camPos.z - 50) < 30 && Math.abs(camPos.x) < 60);
    this.group.visible = near;
    for (const l of this.lights) l.intensity = near ? l.userData.on : 0;
    if (near) for (const p of this.props) p.update(camPos, 45);
  }
}
