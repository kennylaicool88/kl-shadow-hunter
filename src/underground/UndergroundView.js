// Tactical underground cutaway: a separate, lazily built scene (never loaded unless opened).
// Shows the street surface, strata to 300 ft, B1 tunnels and facilities by discovery category.
// Undiscovered facilities are NOT drawn (only counted in the HUD list).
import * as THREE from 'three';
import { STRATA, MAX_DEPTH_FT } from './DrillModel.js';
import { CATEGORY_STYLE } from '../tracking/TargetClassification.js';

const FT = 0.3048;
const V_EXAG = 1.6; // vertical exaggeration so 300 ft reads clearly against a 200 m city

function labelSprite(text, color = '#e4ecef', size = 26) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = `bold ${size}px Consolas, monospace`;
  g.fillStyle = color;
  g.textBaseline = 'middle';
  g.fillText(text, 6, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(32, 8, 1);
  return s;
}

export class UndergroundView {
  constructor(level) {
    this.level = level;
    this.built = false;
    this.yaw = 0.7;
    this.pitch = 0.32;
    this.dist = 330;
    this.center = new THREE.Vector3(0, -55, 20);
    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 3000);
    this.dynamic = [];
  }

  _build() {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x0b1117);
    s.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dl = new THREE.DirectionalLight(0xffffff, 1.4);
    dl.position.set(100, 200, 120);
    s.add(dl);
    const L = this.level;
    // Surface: city footprint
    const surf = new THREE.Mesh(new THREE.BoxGeometry(200, 1.2, 200), new THREE.MeshLambertMaterial({ color: 0x3a434c, transparent: true, opacity: 0.55 }));
    surf.position.y = -0.6;
    s.add(surf);
    const bmat = new THREE.MeshLambertMaterial({ color: 0x8b98a6, transparent: true, opacity: 0.75 });
    for (const b of L.buildings) {
      const h = Math.min(30, b.h * 0.25);
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, h, b.z1 - b.z0), bmat);
      m.position.set((b.x0 + b.x1) / 2, h / 2, (b.z0 + b.z1) / 2);
      s.add(m);
    }
    const towerMat = new THREE.MeshLambertMaterial({ color: 0xdfe6ec, emissive: 0x2a3440 });
    for (const t of L.towers) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(6, 9, 60, 8), towerMat);
      m.position.set(t.x, 30, t.z);
      s.add(m);
    }
    const park = new THREE.Mesh(new THREE.BoxGeometry(112, 0.3, 68), new THREE.MeshLambertMaterial({ color: 0x3f6f35 }));
    park.position.set(0, 0.2, 4);
    s.add(park);
    // Strata (cross-section slabs on the back half so the cut face is visible)
    let top = 0;
    for (const st of STRATA) {
      const h = (st.toFt - top) * FT * V_EXAG;
      const m = new THREE.Mesh(new THREE.BoxGeometry(200, h, 200), new THREE.MeshLambertMaterial({ color: st.color, transparent: true, opacity: 0.16, depthWrite: false }));
      m.position.y = -top * FT * V_EXAG - h / 2;
      s.add(m);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: st.color, transparent: true, opacity: 0.5 }));
      edges.position.copy(m.position);
      s.add(edges);
      const lab = labelSprite(st.name.toUpperCase(), st.color, 20);
      lab.position.set(118, m.position.y, -100);
      s.add(lab);
      top = st.toFt;
    }
    // Depth ruler (0 – 300 ft)
    const ruler = new THREE.Group();
    const lineMat = new THREE.LineBasicMaterial({ color: 0xe4ecef });
    const pts = [new THREE.Vector3(-104, 0, -104), new THREE.Vector3(-104, -MAX_DEPTH_FT * FT * V_EXAG, -104)];
    ruler.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    for (let ft = 0; ft <= MAX_DEPTH_FT; ft += 50) {
      const y = -ft * FT * V_EXAG;
      ruler.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-108, y, -104), new THREE.Vector3(-100, y, -104)]), lineMat));
      const lab = labelSprite(`${ft} FT`, '#e4ecef', 24);
      lab.position.set(-128, y, -104);
      ruler.add(lab);
    }
    s.add(ruler);
    // B1 tunnels
    const tunnelMat = new THREE.MeshBasicMaterial({ color: 0x46e08a, transparent: true, opacity: 0.35, depthWrite: false });
    for (const sol of L.solids) {
      if (sol.mat !== 'tunnel') continue;
      const w = sol.max[0] - sol.min[0], d = sol.max[2] - sol.min[2], h = (sol.max[1] - sol.min[1]) * V_EXAG;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), tunnelMat);
      m.position.set((sol.min[0] + sol.max[0]) / 2, ((sol.min[1] + sol.max[1]) / 2) * V_EXAG, (sol.min[2] + sol.max[2]) / 2);
      s.add(m);
    }
    const b1 = labelSprite('B1 SERVICE TUNNELS', '#46e08a', 22);
    b1.position.set(0, -8 * V_EXAG - 8, 40);
    s.add(b1);
    // Player marker
    this.playerMarker = new THREE.Mesh(new THREE.ConeGeometry(2.5, 7, 8).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    s.add(this.playerMarker);
    this.dynamicGroup = new THREE.Group();
    s.add(this.dynamicGroup);
    this.built = true;
  }

  // Rebuild facility markers from the current mission state.
  refresh(mission) {
    if (!this.built) this._build();
    for (const o of this.dynamic) {
      this.dynamicGroup.remove(o);
      o.traverse?.((x) => { x.geometry?.dispose(); x.material?.map?.dispose(); x.material?.dispose(); });
    }
    this.dynamic = [];
    this.labelAnchors = [];
    for (const b of mission.bunkers.list) {
      if (!b.discovered) continue;
      const st = CATEGORY_STYLE[b.category];
      const color = new THREE.Color(st.color);
      const y = -b.depthM * V_EXAG;
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(b.size.w, 7, b.size.d), new THREE.MeshLambertMaterial({ color, emissive: color.clone().multiplyScalar(0.35), transparent: b.status !== 'INTACT', opacity: b.status !== 'INTACT' ? 0.45 : 1 }));
      box.position.set(b.surface.x, y, b.surface.z);
      g.add(box);
      // Dotted shaft from the surface marker down to the facility
      const shaft = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(b.surface.x, 0, b.surface.z), new THREE.Vector3(b.surface.x, y + 3.5, b.surface.z)]),
        new THREE.LineDashedMaterial({ color, dashSize: 3, gapSize: 2 }),
      );
      shaft.computeLineDistances();
      g.add(shaft);
      if (b.category === 'protected') {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(b.size.w, b.size.d) * 0.8, 0.5, 6, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color }));
        ring.position.copy(box.position);
        g.add(ring);
      }
      if (b.status !== 'INTACT') {
        // Drill shaft from the strike
        const drill = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, -y, 8), new THREE.MeshBasicMaterial({ color: 0xff5a36 }));
        drill.position.set(b.surface.x, y / 2, b.surface.z);
        g.add(drill);
      }
      this.dynamicGroup.add(g);
      this.dynamic.push(g);
      this.labelAnchors.push({ pos: new THREE.Vector3(b.surface.x, y + 8, b.surface.z), text: `${st.icon} ${b.id} ${b.name} · ${b.depthFt} FT`, color: st.color });
    }
    for (const strike of mission.strikeHistory) {
      for (const imp of strike.impacts) {
        const m = new THREE.Mesh(new THREE.RingGeometry(imp.radius - 0.6, imp.radius, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5a36, side: THREE.DoubleSide }));
        m.position.set(imp.x, 1.2, imp.z);
        this.dynamicGroup.add(m);
        this.dynamic.push(m);
      }
    }
  }

  // Orbit controls driven by the game's input manager (pointer stays locked).
  handleInput(input, dt) {
    const m = input.consumeMouse();
    this.yaw -= m.x * 0.004;
    this.pitch = Math.max(-0.2, Math.min(1.35, this.pitch + m.y * 0.003));
    const w = input.consumeWheel();
    if (w) this.dist = Math.max(120, Math.min(700, this.dist * (w > 0 ? 1.1 : 0.9)));
    const k = dt * 120;
    if (input.isDown('KeyW')) this.center.z -= k;
    if (input.isDown('KeyS')) this.center.z += k;
    if (input.isDown('KeyA')) this.center.x -= k;
    if (input.isDown('KeyD')) this.center.x += k;
  }

  render(renderer, player, aspect) {
    if (!this.built) this._build();
    const c = this.camera;
    c.aspect = aspect;
    c.updateProjectionMatrix();
    c.position.set(
      this.center.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist,
      this.center.y + Math.sin(this.pitch) * this.dist,
      this.center.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist,
    );
    c.lookAt(this.center);
    c.updateMatrixWorld();
    const p = player.body.pos;
    this.playerMarker.position.set(p.x, (p.y < -3 ? p.y * V_EXAG : 0) + 8, p.z);
    renderer.render(this.scene, c);
  }

  // Screen-space label positions for the HUD overlay.
  labels(width, height) {
    if (!this.labelAnchors) return [];
    const v = new THREE.Vector3();
    return this.labelAnchors.map((a) => {
      v.copy(a.pos).project(this.camera);
      return { x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height, text: a.text, color: a.color, visible: v.z < 1 };
    }).filter((l) => l.visible);
  }
}
