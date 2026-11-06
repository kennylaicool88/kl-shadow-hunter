// Visual effects for the fictional Deep Strike projectile. Everything is created per flight and
// disposed afterwards (no growth across flights). Positions are driven by SciFiProjectile.
import * as THREE from 'three';
import { createGlowTexture } from '../city/cityTextures.js';

const TRAIL = 520;
const _v = new THREE.Vector3();

export class ProjectileEffects {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'projectile-fx';
    this.disposables = [];
    this.glow = this._own(createGlowTexture('255,200,120'));
    this.cyan = this._own(createGlowTexture('120,230,255'));
    this.smokeTex = this._own(createGlowTexture('200,200,200'));
    this._buildMissile();
    this._buildTrail();
    this._buildSmoke();
    this._buildClouds();
    this._buildStreaks();
    this._buildImpact();
    this.subs = [];
    scene.add(this.group);
  }

  _own(x) {
    this.disposables.push(x);
    return x;
  }

  _mat(m) {
    return this._own(m);
  }

  _buildMissile() {
    const m = new THREE.Group();
    // Brushed titanium airframe with dark composite nose; emissive bands are bright enough to bloom.
    const body = this._mat(new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.9, roughness: 0.28 }));
    const composite = this._mat(new THREE.MeshStandardMaterial({ color: 0x23272b, metalness: 0.3, roughness: 0.5 }));
    const glowMat = this._mat(new THREE.MeshStandardMaterial({ color: 0x0a2a33, emissive: 0x7fe8ff, emissiveIntensity: 4 }));
    const g1 = this._own(new THREE.CylinderGeometry(0.55, 0.62, 7, 16).rotateX(Math.PI / 2));
    const nose = this._own(new THREE.ConeGeometry(0.55, 2.4, 16).rotateX(-Math.PI / 2).translate(0, 0, -4.7));
    m.add(new THREE.Mesh(g1, body), new THREE.Mesh(nose, composite));
    // Panel seams and sensor window detail
    for (const z of [-3.2, -1.2, 1.4, 3.0]) {
      const seam = new THREE.Mesh(this._own(new THREE.TorusGeometry(0.615, 0.012, 4, 32)), composite);
      seam.position.z = z;
      m.add(seam);
    }
    const window_ = new THREE.Mesh(this._own(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2)), this._mat(new THREE.MeshStandardMaterial({ color: 0x101820, metalness: 1, roughness: 0.05 })));
    window_.position.z = -5.5;
    m.add(window_);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(this._own(new THREE.BoxGeometry(0.06, 1.3, 1.6)), body);
      fin.position.set(0, 0, 2.9);
      fin.rotation.z = (i * Math.PI) / 2;
      fin.translateY(0.9);
      m.add(fin);
    }
    for (const z of [-2.2, 0.4]) {
      const band = new THREE.Mesh(this._own(new THREE.TorusGeometry(0.6, 0.06, 6, 24)), glowMat);
      band.position.z = z;
      m.add(band);
    }
    this.flame = new THREE.Mesh(
      this._own(new THREE.ConeGeometry(0.5, 5, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 6)),
      this._mat(new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })),
    );
    m.add(this.flame);
    this.engineGlow = new THREE.Sprite(this._mat(new THREE.SpriteMaterial({ map: this.glow, blending: THREE.AdditiveBlending, depthWrite: false })));
    this.engineGlow.scale.setScalar(7);
    this.engineGlow.position.z = 4.2;
    m.add(this.engineGlow);
    m.scale.setScalar(1.4);
    this.missile = m;
    this.group.add(m);
  }

  _buildTrail() {
    this.trailPos = new Float32Array(TRAIL * 3);
    this.trailCol = new Float32Array(TRAIL * 3);
    this.trailCount = 0;
    const g = this._own(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.trail = new THREE.Points(g, this._mat(new THREE.PointsMaterial({
      size: 5, map: this.smokeTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    this.trail.frustumCulled = false;
    this.group.add(this.trail);
  }

  pushTrail(p, hot = true) {
    // Shift (oldest at the end) – simple and allocation free.
    this.trailPos.copyWithin(3, 0, (TRAIL - 1) * 3);
    this.trailCol.copyWithin(3, 0, (TRAIL - 1) * 3);
    this.trailPos[0] = p.x; this.trailPos[1] = p.y; this.trailPos[2] = p.z;
    this.trailCol[0] = hot ? 1 : 0.7; this.trailCol[1] = hot ? 0.75 : 0.7; this.trailCol[2] = hot ? 0.45 : 0.75;
    this.trailCount = Math.min(TRAIL, this.trailCount + 1);
    // Fade with age
    for (let i = 1; i < this.trailCount; i++) {
      const k = i * 3;
      this.trailCol[k] *= 0.992; this.trailCol[k + 1] *= 0.992; this.trailCol[k + 2] *= 0.994;
    }
    const g = this.trail.geometry;
    g.setDrawRange(0, this.trailCount);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }

  _buildSmoke() {
    this.smoke = [];
    for (let i = 0; i < 36; i++) {
      const s = new THREE.Sprite(this._mat(new THREE.SpriteMaterial({ map: this.smokeTex, color: 0xbfbfbf, transparent: true, depthWrite: false, opacity: 0 })));
      s.visible = false;
      this.group.add(s);
      this.smoke.push({ s, life: 0, vel: new THREE.Vector3() });
    }
    this.smokeNext = 0;
  }

  puff(p, spread = 6, size = 10) {
    const k = this.smoke[this.smokeNext];
    this.smokeNext = (this.smokeNext + 1) % this.smoke.length;
    k.s.position.set(p.x + (Math.random() - 0.5) * spread, p.y, p.z + (Math.random() - 0.5) * spread);
    k.vel.set((Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6);
    k.life = 1;
    k.size = size;
    k.s.visible = true;
  }

  _buildClouds() {
    const n = 320;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 150 + Math.sqrt(Math.random()) * 2200;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 560 + Math.random() * 220;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = this._own(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.clouds = new THREE.Points(g, this._mat(new THREE.PointsMaterial({
      size: 220, map: this.smokeTex, color: 0xf2f4f7, transparent: true, opacity: 0.6, depthWrite: false, fog: false,
    })));
    this.clouds.frustumCulled = false;
    this.group.add(this.clouds);
  }

  _buildStreaks() {
    const n = 90;
    const pos = new Float32Array(n * 6);
    this.streakSeeds = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 9;
      this.streakSeeds.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: -Math.random() * 60, len: 4 + Math.random() * 8 });
    }
    const g = this._own(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.streaks = new THREE.LineSegments(g, this._mat(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
    this.streaks.frustumCulled = false;
    this.group.add(this.streaks);
  }

  updateStreaks(dt, camera, intensity) {
    const m = this.streaks.material;
    m.opacity = intensity * 0.55;
    this.streaks.visible = intensity > 0.02;
    if (!this.streaks.visible) return;
    this.streaks.position.copy(camera.position);
    this.streaks.quaternion.copy(camera.quaternion);
    const pos = this.streaks.geometry.attributes.position.array;
    this.streakSeeds.forEach((s, i) => {
      s.z += dt * 220 * intensity;
      if (s.z > 2) s.z = -60;
      pos[i * 6] = s.x; pos[i * 6 + 1] = s.y; pos[i * 6 + 2] = s.z;
      pos[i * 6 + 3] = s.x; pos[i * 6 + 4] = s.y; pos[i * 6 + 5] = s.z - s.len;
    });
    this.streaks.geometry.attributes.position.needsUpdate = true;
  }

  _buildImpact() {
    this.flash = new THREE.Sprite(this._mat(new THREE.SpriteMaterial({ map: this.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
    this.flash.visible = false;
    this.group.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffc080, 0, 220, 1.4);
    this.group.add(this.flashLight);
    this.shock = new THREE.Mesh(
      this._own(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2)),
      this._mat(new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })),
    );
    this.shock.visible = false;
    this.group.add(this.shock);
    this.impactTime = -1;
    this.extraFlashes = [];
  }

  explode(points) {
    this.impactTime = 0;
    const main = points[0];
    this.flash.position.set(main.x, 6, main.z);
    this.flash.visible = true;
    this.flashLight.position.set(main.x, 20, main.z);
    this.shock.position.set(main.x, 0.4, main.z);
    this.shock.visible = true;
    // Secondary flashes for cluster sub-impacts
    for (const f of this.extraFlashes) { this.group.remove(f); f.material.dispose(); }
    this.extraFlashes = points.slice(1).map((p) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.cyan, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.position.set(p.x, 4, p.z);
      this.group.add(s);
      return s;
    });
    for (let i = 0; i < 18; i++) this.puff({ x: main.x, y: 2, z: main.z }, 14, 24);
  }

  // ---------------------------------------------------------------- cluster sub-projectiles
  splitCluster(from, targets) {
    this.clearSubs();
    for (const t of targets) {
      const mat = new THREE.SpriteMaterial({ map: this.cyan, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(9);
      const n = 40;
      const tp = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { tp[i * 3] = from.x; tp[i * 3 + 1] = from.y; tp[i * 3 + 2] = from.z; }
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(tp, 3).setUsage(THREE.DynamicDrawUsage));
      const line = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0x8feaff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      line.frustumCulled = false;
      // Bezier: fan out, then dive onto the sub-impact point
      const p0 = new THREE.Vector3(from.x, from.y, from.z);
      const p3 = new THREE.Vector3(t.x, 0.5, t.z);
      const out = new THREE.Vector3(t.x - from.x, 0, t.z - from.z).multiplyScalar(0.8);
      const p1 = p0.clone().add(out).add(new THREE.Vector3(0, -from.y * 0.2, 0));
      const p2 = p3.clone().add(new THREE.Vector3(0, from.y * 0.35, 0));
      this.group.add(s, line);
      this.subs.push({ sprite: s, line, p0, p1, p2, p3, n });
    }
  }

  updateSubs(t) {
    for (const sub of this.subs) {
      const u = Math.min(1, t);
      const k = 1 - u;
      _v.set(0, 0, 0)
        .addScaledVector(sub.p0, k * k * k).addScaledVector(sub.p1, 3 * k * k * u)
        .addScaledVector(sub.p2, 3 * k * u * u).addScaledVector(sub.p3, u * u * u);
      sub.sprite.position.copy(_v);
      const arr = sub.line.geometry.attributes.position.array;
      arr.copyWithin(3, 0, (sub.n - 1) * 3);
      arr[0] = _v.x; arr[1] = _v.y; arr[2] = _v.z;
      sub.line.geometry.attributes.position.needsUpdate = true;
    }
  }

  clearSubs() {
    for (const s of this.subs) {
      this.group.remove(s.sprite, s.line);
      s.sprite.material.dispose();
      s.line.geometry.dispose();
      s.line.material.dispose();
    }
    this.subs = [];
  }

  update(dt) {
    this.flame.material.opacity = 0.65 + Math.random() * 0.3;
    this.flame.scale.set(1, 1, 0.8 + Math.random() * 0.5);
    for (const k of this.smoke) {
      if (k.life <= 0) continue;
      k.life -= dt * 0.35;
      k.s.position.addScaledVector(k.vel, dt);
      k.s.scale.setScalar(k.size * (2 - k.life));
      k.s.material.opacity = Math.max(0, k.life) * 0.55;
      if (k.life <= 0) k.s.visible = false;
    }
    if (this.impactTime >= 0) {
      this.impactTime += dt;
      const t = this.impactTime;
      this.flash.scale.setScalar(40 + t * 160);
      this.flash.material.opacity = Math.max(0, 1 - t / 1.2);
      this.flashLight.intensity = Math.max(0, 900 * (1 - t / 0.8));
      this.shock.scale.setScalar(5 + t * 90);
      this.shock.material.opacity = Math.max(0, 0.8 - t * 0.6);
      for (const f of this.extraFlashes) { f.scale.setScalar(20 + t * 60); f.material.opacity = Math.max(0, 1 - t / 1.0); }
      if (t > 2.5) { this.flash.visible = false; this.shock.visible = false; this.impactTime = -1; }
    }
  }

  dispose() {
    this.clearSubs();
    for (const f of this.extraFlashes) { this.group.remove(f); f.material.dispose(); }
    this.scene.remove(this.group);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
