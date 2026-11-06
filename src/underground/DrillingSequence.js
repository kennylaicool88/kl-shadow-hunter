// Cinematic drilling sequence: an independent scene + state (testable without the FPS world).
// A glowing fictional drill head bores through a terrain cross-section to the facility depth
// (display value up to 300 ft). Progress comes from DrillModel; nothing here is physically simulated.
import * as THREE from 'three';
import { DrillModel, STRATA, MAX_DEPTH_FT } from './DrillModel.js';
import { CATEGORY_STYLE } from '../tracking/TargetClassification.js';

const U = 0.1; // scene units per foot
const N_ROCKS = 160;

function strataTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1024;
  const g = c.getContext('2d');
  let top = 0;
  for (const s of STRATA) {
    const y0 = (top / (MAX_DEPTH_FT + 20)) * 1024, y1 = (s.toFt / (MAX_DEPTH_FT + 20)) * 1024;
    g.fillStyle = s.color; g.fillRect(0, y0, 256, y1 - y0);
    for (let i = 0; i < (y1 - y0) * 3; i++) {
      g.fillStyle = `rgba(${Math.random() > 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.12})`;
      g.fillRect(Math.random() * 256, y0 + Math.random() * (y1 - y0), 2 + Math.random() * 6, 1 + Math.random() * 3);
    }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y1 - 2, 256, 3);
    top = s.toFt;
  }
  g.fillStyle = '#5f5a52'; g.fillRect(0, (MAX_DEPTH_FT / (MAX_DEPTH_FT + 20)) * 1024, 256, 1024);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture(rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, `rgba(${rgb},1)`); grd.addColorStop(0.35, `rgba(${rgb},0.45)`); grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _axis = new THREE.Vector3(1, 1, 0).normalize();
const _hidden = new THREE.Vector3(0, 999, 0);

export class DrillingSequence {
  constructor(assets = null) {
    this.assets = assets;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090c);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.disposables = [];
    this.active = false;
    this._build();
  }

  _own(x) { this.disposables.push(x); return x; }

  _build() {
    const s = this.scene;
    s.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 1.0);
    dl.position.set(4, 10, 12);
    s.add(dl);
    // Cross-section wall
    const H = (MAX_DEPTH_FT + 20) * U;
    const wall = new THREE.Mesh(this._own(new THREE.PlaneGeometry(26, H)), this._own(new THREE.MeshLambertMaterial({ map: this._own(strataTexture()) })));
    wall.position.set(0, -H / 2, -3);
    s.add(wall);
    // Surface with a tiny skyline silhouette
    const ground = new THREE.Mesh(this._own(new THREE.BoxGeometry(26, 0.4, 6)), this._own(new THREE.MeshLambertMaterial({ color: 0x3c3e40 })));
    ground.position.set(0, 0.2, -1);
    s.add(ground);
    const skyMat = this._own(new THREE.MeshBasicMaterial({ color: 0x1b2a3a }));
    for (let i = 0; i < 9; i++) {
      const h = 1 + Math.random() * 5;
      const b = new THREE.Mesh(this._own(new THREE.BoxGeometry(1.4, h, 1)), skyMat);
      b.position.set(-11 + i * 2.7, 0.4 + h / 2, -3.5);
      s.add(b);
    }
    // Depth ticks
    const tickMat = this._own(new THREE.LineBasicMaterial({ color: 0xe4ecef, transparent: true, opacity: 0.6 }));
    for (let ft = 0; ft <= MAX_DEPTH_FT; ft += 25) {
      const y = -ft * U;
      const len = ft % 100 === 0 ? 1.4 : 0.7;
      s.add(new THREE.Line(this._own(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-12.8, y, -2.9), new THREE.Vector3(-12.8 + len, y, -2.9)])), tickMat));
    }
    // Bore shaft (grows with depth) and scrolling tunnel rings
    this.shaft = new THREE.Mesh(this._own(new THREE.BoxGeometry(1.6, 1, 0.2)), this._own(new THREE.MeshBasicMaterial({ color: 0x120d0a })));
    this.shaft.position.z = -2.8;
    s.add(this.shaft);
    this.rings = new THREE.InstancedMesh(
      this._own(new THREE.TorusGeometry(0.85, 0.07, 6, 20).rotateX(Math.PI / 2)),
      this._own(new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })),
      24,
    );
    this.rings.frustumCulled = false;
    s.add(this.rings);
    // Drill head
    const head = new THREE.Group();
    const bodyMat = this._own(new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.8, roughness: 0.3, emissive: 0x331100 }));
    const glowMat = this._own(new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    head.add(new THREE.Mesh(this._own(new THREE.CylinderGeometry(0.7, 0.7, 2.2, 16)), bodyMat));
    const bit = new THREE.Mesh(this._own(new THREE.ConeGeometry(0.75, 1.6, 16)), glowMat);
    bit.rotation.x = Math.PI;
    bit.position.y = -1.9;
    head.add(bit);
    for (let i = 0; i < 4; i++) {
      const flute = new THREE.Mesh(this._own(new THREE.BoxGeometry(0.12, 1.8, 0.35)), glowMat);
      flute.position.set(Math.cos((i * Math.PI) / 2) * 0.62, -0.2, Math.sin((i * Math.PI) / 2) * 0.62);
      flute.rotation.y = -(i * Math.PI) / 2;
      head.add(flute);
    }
    this.headGlow = new THREE.Sprite(this._own(new THREE.SpriteMaterial({ map: this._own(glowTexture('255,170,80')), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
    this.headGlow.scale.setScalar(5);
    this.headGlow.position.y = -2.4;
    head.add(this.headGlow);
    this.head = head;
    s.add(head);
    this.headLight = new THREE.PointLight(0xffa040, 30, 14, 1.5);
    s.add(this.headLight);
    // Rock/soil debris (instanced)
    this.rocks = new THREE.InstancedMesh(this._own(new THREE.IcosahedronGeometry(0.12, 0)), this._own(new THREE.MeshLambertMaterial({ color: 0xffffff })), N_ROCKS);
    this.rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rocks.frustumCulled = false;
    this.rockState = Array.from({ length: N_ROCKS }, () => ({ p: new THREE.Vector3(0, 99, 0), v: new THREE.Vector3(), life: 0, rot: Math.random() * 6 }));
    this.rockNext = 0;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < N_ROCKS; i++) this.rocks.setColorAt(i, white);
    s.add(this.rocks);
    // Facility shell (appears at the target depth)
    this.bunkerMesh = new THREE.Mesh(this._own(new THREE.BoxGeometry(9, 2.6, 3)), this._own(new THREE.MeshLambertMaterial({ color: 0x777777, emissive: 0x000000 })));
    this.bunkerMesh.visible = false;
    s.add(this.bunkerMesh);
    this.breachFlash = new THREE.Sprite(this._own(new THREE.SpriteMaterial({ map: this._own(glowTexture('255,255,230')), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })));
    s.add(this.breachFlash);
  }

  /**
   * Starts the sequence. bunker may be null (no facility under the impact).
   * statusLines: extra lines for the impact status panel.
   */
  start(targetFt, bunker = null, onDone = null) {
    this.model = new DrillModel(targetFt);
    this.bunker = bunker;
    this.onDone = onDone;
    this.active = true;
    this.breachT = -1;
    this.time = 0;
    this.events = [];
    this.bunkerMesh.visible = false;
    this.bunkerMesh.material.transparent = false;
    this.bunkerMesh.material.opacity = 1;
    if (bunker) {
      const st = CATEGORY_STYLE[bunker.category] || CATEGORY_STYLE.unknown;
      this.bunkerMesh.material.color.set(st.color);
      this.bunkerMesh.position.set(0, -targetFt * U - 1.6, -1.2);
      this._buildInterior(bunker, this.bunkerMesh.position);
    }
    for (const r of this.rockState) { r.life = 0; r.p.set(0, 99, 0); }
  }

  // Cross-section of the facility revealed at the breach. Each type has its own visual identity:
  // hostile = red-lit operations room with equipment racks; surveillance = wall of blue monitors;
  // decoy = hollow shell with glowing thermal emitters. Nothing is visible until the breach.
  _buildInterior(bunker, at) {
    if (this.interior) { this.scene.remove(this.interior); this.interior.traverse((o) => { if (o.isMesh && !o.userData.shared) o.geometry.dispose(); }); }
    const g = new THREE.Group();
    g.position.copy(at);
    g.visible = false;
    const shell = new THREE.Mesh(new THREE.BoxGeometry(8.4, 2.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.9 }));
    shell.position.z = -1.2;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.2, 2.6), new THREE.MeshStandardMaterial({ color: 0x3e4044, roughness: 0.8 }));
    floor.position.y = -1.1;
    g.add(shell, floor);
    const type = bunker.trueType;
    const lightColor = { HOSTILE_BUNKER: 0xff3322, SURVEILLANCE_BUNKER: 0x3fa8ff, DECOY_BUNKER: 0xff8a2a }[type] || 0xffffff;
    const light = new THREE.PointLight(lightColor, 20, 10, 2);
    light.position.set(0, 0.6, 0.5);
    g.add(light);
    const rack = this.assets && this.assets.flatten('metal_rack', { floor: true, center: true });
    if (type === 'HOSTILE_BUNKER') {
      for (let i = -3; i <= 3; i += 1.5) {
        if (rack) for (const p of rack) { const m = new THREE.Mesh(p.geometry, p.material); m.userData.shared = true; m.scale.setScalar(0.9); m.position.set(i, -1, -0.8); g.add(m); }
        else { const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.5), new THREE.MeshStandardMaterial({ color: 0x2a2c2f })); m.position.set(i, -0.1, -0.8); g.add(m); }
      }
    } else if (type === 'SURVEILLANCE_BUNKER') {
      for (let x = -3.4; x <= 3.4; x += 0.85) for (const y of [-0.5, 0.25]) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.55), new THREE.MeshStandardMaterial({ color: 0x061220, emissive: 0x3fa8ff, emissiveIntensity: 1.5 + Math.random() }));
        s.position.set(x, y, -1.03);
        g.add(s);
      }
    } else if (type === 'DECOY_BUNKER') {
      for (let x = -3; x <= 3; x += 2) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 8, 24), new THREE.MeshStandardMaterial({ color: 0x331000, emissive: 0xff6a1a, emissiveIntensity: 4 }));
        coil.position.set(x, -0.3, -0.5);
        g.add(coil);
      }
    }
    this.scene.add(g);
    this.interior = g;
  }

  _emitRock(tip, color) {
    const r = this.rockState[this.rockNext];
    this.rocks.setColorAt(this.rockNext, color);
    this.rockNext = (this.rockNext + 1) % N_ROCKS;
    r.p.copy(tip);
    r.v.set((Math.random() - 0.5) * 6, 2 + Math.random() * 5, (Math.random() - 0.2) * 3);
    r.life = 1;
  }

  update(dt) {
    if (!this.active) return [];
    this.time += dt;
    const evs = this.model.update(dt);
    this.events.push(...evs);
    const depthY = -this.model.depth * U;
    this.head.position.set(0, depthY + 1.2, -1.2);
    this.head.rotation.y += dt * 14;
    this.headLight.position.set(0, depthY - 0.5, 1);
    this.headGlow.material.opacity = 0.7 + Math.random() * 0.3;
    this.shaft.scale.y = Math.max(0.01, this.model.depth * U);
    this.shaft.position.y = depthY / 2;
    // Tunnel rings scroll up the bore
    for (let i = 0; i < 24; i++) {
      const y = depthY + 1.5 + (((i * 1.3 + this.time * 6) % 31.2));
      _q.identity();
      _m.compose(_p.set(0, Math.min(-0.2, y), -1.2), _q, _s.set(1, 1, 1));
      this.rings.setMatrixAt(i, _m);
    }
    this.rings.instanceMatrix.needsUpdate = true;
    // Debris
    if (!this.model.breached) {
      const color = new THREE.Color(this.model.layer.color);
      for (let i = 0; i < 4; i++) this._emitRock(_p.set(0, depthY - 0.8, -1.2), color);
      this.rocks.instanceColor.needsUpdate = true;
    }
    this.rockState.forEach((r, i) => {
      if (r.life > 0) {
        r.life -= dt * 0.9;
        r.v.y -= 12 * dt;
        r.p.addScaledVector(r.v, dt);
        r.rot += dt * 6;
      }
      _q.setFromAxisAngle(_axis, r.rot);
      _s.setScalar(r.life > 0 ? 0.6 + r.life : 0.001);
      _m.compose(r.life > 0 ? r.p : _hidden, _q, _s);
      this.rocks.setMatrixAt(i, _m);
    });
    this.rocks.instanceMatrix.needsUpdate = true;
    // Breach: reveal facility + flash
    for (const e of evs) {
      if (e.type === 'breach') {
        this.breachT = 0;
        if (this.bunker) this.bunkerMesh.visible = true;
        if (this.interior) this.interior.visible = true;
        this.bunkerMesh.material.transparent = true;
        this.bunkerMesh.material.opacity = 0.25; // cut-away shell reveals the interior
      }
      if (e.type === 'done') {
        this.active = false;
        if (this.onDone) this.onDone();
      }
    }
    if (this.breachT >= 0) {
      this.breachT += dt;
      this.breachFlash.position.set(0, depthY - 1, 0);
      this.breachFlash.scale.setScalar(4 + this.breachT * 16);
      this.breachFlash.material.opacity = Math.max(0, 1 - this.breachT / 1.2);
      this.bunkerMesh.material.emissive.setHex(Math.sin(this.breachT * 20) > 0 ? 0x552211 : 0x000000);
    }
    // Camera follows the drill down the cross-section
    this.camera.position.set(3.5, depthY + 3.2, 13);
    this.camera.lookAt(0, depthY - 0.8, -1.5);
    return evs;
  }

  render(renderer, aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
