// Pooled visual effects: spark/blood/dust particles, bullet-hole decals, tracers, world muzzle flashes.
// Everything is preallocated so firing never allocates GPU resources at runtime.
import * as THREE from 'three';
import { createFlashTexture, createDecalTexture, createSoftParticleTexture } from '../maps/Textures.js';

const MAX_PARTICLES = 600;
const MAX_DECALS = 120;
const MAX_TRACERS = 24;
const MAX_FLASHES = 10;

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.flashTexture = createFlashTexture();
    this._initParticles();
    this._initDecals();
    this._initTracers();
    this._initFlashes();
    // A single light reused for the player's muzzle flash.
    this.muzzleLight = new THREE.PointLight(0xffc070, 0, 9, 2);
    scene.add(this.muzzleLight);
    this.muzzleLightTime = 0;
  }

  // ------------------------------------------------------------- particles
  _initParticles() {
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.pVel = new Float32Array(MAX_PARTICLES * 3);
    this.pLife = new Float32Array(MAX_PARTICLES);
    this.pMaxLife = new Float32Array(MAX_PARTICLES);
    this.pGravity = new Float32Array(MAX_PARTICLES);
    this.pBase = new Float32Array(MAX_PARTICLES * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({
      size: 0.09, map: this.flashTexture, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    // Blood/dust need normal blending – second system.
    const geo2 = new THREE.BufferGeometry();
    this.dPos = new Float32Array(MAX_PARTICLES * 3);
    this.dCol = new Float32Array(MAX_PARTICLES * 3);
    this.dVel = new Float32Array(MAX_PARTICLES * 3);
    this.dLife = new Float32Array(MAX_PARTICLES);
    this.dMaxLife = new Float32Array(MAX_PARTICLES);
    this.dGravity = new Float32Array(MAX_PARTICLES);
    geo2.setAttribute('position', new THREE.BufferAttribute(this.dPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo2.setAttribute('color', new THREE.BufferAttribute(this.dCol, 3).setUsage(THREE.DynamicDrawUsage));
    const mat2 = new THREE.PointsMaterial({
      size: 0.1, map: createSoftParticleTexture(), vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false,
    });
    this.dust = new THREE.Points(geo2, mat2);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
    this.pNext = 0;
    this.dNext = 0;
    // Park all particles far away.
    for (let i = 0; i < MAX_PARTICLES; i++) { this.pPos[i * 3 + 1] = -999; this.dPos[i * 3 + 1] = -999; }
  }

  _emit(additive, pos, normal, count, speed, color, life, gravity, spreadAmt = 0.8) {
    const P = additive ? this.pPos : this.dPos;
    const C = additive ? this.pCol : this.dCol;
    const V = additive ? this.pVel : this.dVel;
    const L = additive ? this.pLife : this.dLife;
    const M = additive ? this.pMaxLife : this.dMaxLife;
    const G = additive ? this.pGravity : this.dGravity;
    for (let k = 0; k < count; k++) {
      const i = additive ? this.pNext : this.dNext;
      if (additive) this.pNext = (this.pNext + 1) % MAX_PARTICLES;
      else this.dNext = (this.dNext + 1) % MAX_PARTICLES;
      P[i * 3] = pos.x; P[i * 3 + 1] = pos.y; P[i * 3 + 2] = pos.z;
      const s = speed * (0.4 + Math.random() * 0.8);
      V[i * 3] = (normal.x + (Math.random() - 0.5) * 2 * spreadAmt) * s;
      V[i * 3 + 1] = (normal.y + (Math.random() - 0.5) * 2 * spreadAmt + 0.3) * s;
      V[i * 3 + 2] = (normal.z + (Math.random() - 0.5) * 2 * spreadAmt) * s;
      const shade = 0.75 + Math.random() * 0.25;
      C[i * 3] = color.r * shade; C[i * 3 + 1] = color.g * shade; C[i * 3 + 2] = color.b * shade;
      L[i] = M[i] = life * (0.6 + Math.random() * 0.6);
      G[i] = gravity;
    }
  }

  _updateParticles(dt, P, C, V, L, M, G, geo, fade) {
    let alive = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (L[i] <= 0) continue;
      alive = true;
      L[i] -= dt;
      if (L[i] <= 0) { P[i * 3 + 1] = -999; continue; }
      V[i * 3 + 1] -= G[i] * dt;
      P[i * 3] += V[i * 3] * dt;
      P[i * 3 + 1] += V[i * 3 + 1] * dt;
      P[i * 3 + 2] += V[i * 3 + 2] * dt;
      if (fade) {
        const f = Math.max(0, L[i] / M[i]);
        C[i * 3] *= 0.9 + 0.1 * f; C[i * 3 + 1] *= 0.85 + 0.15 * f; C[i * 3 + 2] *= 0.8 + 0.2 * f;
      }
    }
    if (alive) {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------- decals
  _initDecals() {
    const tex = createDecalTexture();
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.11, 0.11), mat, MAX_DECALS);
    this.decals.frustumCulled = false;
    this.decals.count = 0;
    this.decalNext = 0;
    this.scene.add(this.decals);
  }

  addDecal(point, normal, scale = 1) {
    _n.set(normal.x, normal.y, normal.z);
    _q.setFromUnitVectors(_z, _n);
    _v.set(point.x + normal.x * 0.004, point.y + normal.y * 0.004, point.z + normal.z * 0.004);
    const s = (0.8 + Math.random() * 0.5) * scale;
    _s.set(s, s, s);
    _m.compose(_v, _q, _s);
    this.decals.setMatrixAt(this.decalNext, _m);
    this.decalNext = (this.decalNext + 1) % MAX_DECALS;
    this.decals.count = Math.min(MAX_DECALS, this.decals.count + 1);
    this.decals.instanceMatrix.needsUpdate = true;
  }

  clearDecals() {
    this.decals.count = 0;
    this.decalNext = 0;
  }

  // ------------------------------------------------------------- tracers
  _initTracers() {
    this.tracers = [];
    const geo = new THREE.BoxGeometry(0.012, 0.012, 1);
    geo.translate(0, 0, 0.5);
    for (let i = 0; i < MAX_TRACERS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.tracers.push({ mesh, life: 0 });
    }
    this.tracerNext = 0;
  }

  addTracer(from, to, color = 0xffe2a0) {
    const t = this.tracers[this.tracerNext];
    t.mesh.material.color.setHex(color);
    this.tracerNext = (this.tracerNext + 1) % MAX_TRACERS;
    const len = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    if (len < 1.5) return;
    // Start a little ahead so the tracer doesn't originate inside the camera.
    const startFrac = Math.min(0.5, 1.2 / len);
    t.mesh.position.set(
      from.x + (to.x - from.x) * startFrac,
      from.y + (to.y - from.y) * startFrac,
      from.z + (to.z - from.z) * startFrac,
    );
    t.mesh.lookAt(to.x, to.y, to.z);
    t.mesh.scale.set(1, 1, len * (1 - startFrac));
    t.mesh.visible = true;
    t.mesh.material.opacity = 0.75;
    t.life = 0.07;
  }

  // ------------------------------------------------------------- world muzzle flashes (bots)
  _initFlashes() {
    this.flashes = [];
    for (let i = 0; i < MAX_FLASHES; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.flashTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      sp.scale.set(0.5, 0.5, 0.5);
      this.scene.add(sp);
      this.flashes.push({ sprite: sp, life: 0 });
    }
    this.flashNext = 0;
  }

  worldMuzzleFlash(pos, scale = 0.55) {
    const f = this.flashes[this.flashNext];
    this.flashNext = (this.flashNext + 1) % MAX_FLASHES;
    f.sprite.position.set(pos.x, pos.y, pos.z);
    f.sprite.material.rotation = Math.random() * Math.PI;
    f.sprite.scale.setScalar(scale);
    f.sprite.visible = true;
    f.life = 0.05;
  }

  playerMuzzleLight(pos, color = 0xffc070) {
    this.muzzleLight.position.set(pos.x, pos.y, pos.z);
    this.muzzleLight.color.setHex(color);
    this.muzzleLight.distance = 9;
    this.muzzleLight.intensity = 6;
    this.muzzleLightTime = 0.05;
  }

  // Short world light flash (explosions, flashbangs, fire flicker) reusing the single muzzle light.
  lightFlash(pos, intensity, time, color = 0xffb060) {
    if (this.muzzleLightTime > 0 && this.muzzleLight.intensity > intensity) return;
    this.muzzleLight.position.set(pos.x, pos.y + 0.6, pos.z);
    this.muzzleLight.color.setHex(color);
    this.muzzleLight.distance = 22;
    this.muzzleLight.intensity = intensity;
    this.muzzleLightTime = time;
  }

  // Additive spark burst.
  burst(pos, count, speed, color) {
    this._emit(true, pos, { x: 0, y: 0.6, z: 0 }, count, speed, color, 0.5, 9, 1);
  }

  // ------------------------------------------------------------- high level
  impact(point, normal, surface) {
    this.addDecal(point, normal);
    const sparkColor = surface === 'metal' || surface === 'roof' || surface === 'barrel'
      ? { r: 1, g: 0.85, b: 0.5 } : { r: 0.9, g: 0.75, b: 0.5 };
    this._emit(true, point, normal, surface === 'metal' ? 8 : 4, 4, sparkColor, 0.22, 9);
    const dustColor = surface === 'crate' ? { r: 0.45, g: 0.33, b: 0.2 } : { r: 0.55, g: 0.52, b: 0.47 };
    this._emit(false, point, normal, 6, 1.4, dustColor, 0.5, 2, 0.6);
  }

  blood(point, dir, heavy = false) {
    _v.set(-dir.x, -dir.y, -dir.z);
    this._emit(false, point, _v, heavy ? 18 : 9, 2.2, { r: 0.55, g: 0.04, b: 0.03 }, 0.5, 9, 0.9);
    _v.set(dir.x, dir.y, dir.z);
    this._emit(false, point, _v, heavy ? 10 : 5, 2.5, { r: 0.45, g: 0.02, b: 0.02 }, 0.45, 9, 0.5);
  }

  update(dt) {
    this._updateParticles(dt, this.pPos, this.pCol, this.pVel, this.pLife, this.pMaxLife, this.pGravity, this.points.geometry, true);
    this._updateParticles(dt, this.dPos, this.dCol, this.dVel, this.dLife, this.dMaxLife, this.dGravity, this.dust.geometry, false);
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.75;
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) f.sprite.visible = false;
    }
    if (this.muzzleLightTime > 0) {
      this.muzzleLightTime -= dt;
      if (this.muzzleLightTime <= 0) this.muzzleLight.intensity = 0;
    }
  }

  reset() {
    this.clearDecals();
    this.pLife.fill(0);
    this.dLife.fill(0);
    for (let i = 0; i < MAX_PARTICLES; i++) { this.pPos[i * 3 + 1] = -999; this.dPos[i * 3 + 1] = -999; }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.dust.geometry.attributes.position.needsUpdate = true;
  }
}
