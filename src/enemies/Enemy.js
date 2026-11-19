// Bot entity: physical body, health/armor, weapon, hitboxes and a low-poly soldier model.
// The model is built to the same proportions as the hitboxes in combat.js.
import * as THREE from 'three';
import { Weapon } from '../weapons/Weapon.js';
import { buildWeaponModel } from '../weapons/WeaponModels.js';
import { SoldierRig } from './SoldierRig.js';
import { hitTestCharacter, computeDamage, HEAD_SIZE } from '../game/combat.js';

const HEIGHT = 1.8;
const EYE = 1.62;

const TEAM_LOOK = {
  A: { shirt: 0x4d5a6a, pants: 0x3b4450, vest: 0x2d3540, head: 0x2b2f36, band: 0x6fa8dc },
  B: { shirt: 0x8a7656, pants: 0x5e5240, vest: 0x4a4232, head: 0x3a2f26, band: 0xe06666 },
};
const SKIN = 0xb98b6b;

const matCache = new Map();
function lambert(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

function part(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export class Enemy {
  static assets = null; // shared asset library (skinned soldier); null -> procedural fallback model

  constructor(name, team, weaponId, scene, { cls = 'rifleman', attachments = null } = {}) {
    this.isPlayer = false;
    this.cls = cls;
    this.maxHealth = cls === 'heavy' ? 150 : cls === 'elite' ? 115 : 100;
    this.name = name;
    this.team = team;
    this.body = { pos: { x: 0, y: 0, z: 0 }, radius: 0.38, height: HEIGHT, grounded: false };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = 0; // facing; 0 = -Z
    this.aimPitch = 0;
    this.health = 100;
    this.armor = 0;
    this.alive = true;
    this.kills = 0;
    this.deaths = 0;
    this.weapon = new Weapon(weaponId, null, attachments);
    this.scene = scene;
    this.deathTime = 0;
    this.walkPhase = 0;
    this.lastAttacker = null;
    this.onDamaged = null;
    this.onKilled = null;
    this._buildModel();
  }

  get position() {
    return this.body.pos;
  }

  getEyePosition(out) {
    out.x = this.body.pos.x;
    out.y = this.body.pos.y + EYE;
    out.z = this.body.pos.z;
    return out;
  }

  getAimPoint(out, part = 'body') {
    out.x = this.body.pos.x;
    out.z = this.body.pos.z;
    out.y = this.body.pos.y + (part === 'head' ? HEIGHT - HEAD_SIZE / 2 : HEIGHT * 0.62);
    return out;
  }

  hitTest(ox, oy, oz, dx, dy, dz, maxDist) {
    if (!this.alive) return null;
    return hitTestCharacter(this.body.pos, HEIGHT, ox, oy, oz, dx, dy, dz, maxDist);
  }

  applyDamage(raw, info) {
    if (!this.alive) return 0;
    const d = computeDamage(raw, this.armor, info.armorRatio ?? 0.5, info.part);
    this.armor = Math.max(0, this.armor - d.armor);
    const dealt = Math.min(this.health, d.health);
    this.health -= dealt;
    this.lastAttacker = info.attacker || null;
    this.flinch = 0.15;
    if (this.onDamaged) this.onDamaged(this, dealt, info);
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.deaths++;
      this.deathTime = 0;
      this.deathDir = info.direction ? Math.atan2(info.direction.x, info.direction.z) : 0;
      if (this.onKilled) this.onKilled(this, info);
    }
    return dealt;
  }

  spawn(pos, yaw, armor) {
    this.body.pos.x = pos[0];
    this.body.pos.y = pos[1];
    this.body.pos.z = pos[2];
    this.body.grounded = false;
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this.yaw = yaw;
    this.aimPitch = 0;
    this.health = this.maxHealth;
    this.armor = this.cls === 'heavy' ? Math.max(armor, 100) : armor;
    this.alive = true;
    this.deathTime = 0;
    this.flinch = 0;
    this.weapon.refill();
    this.model.visible = true;
    if (this.rig) { this.rig.reset(yaw); this.rig.root.position.set(pos[0], pos[1], pos[2]); return; }
    this.model.rotation.set(0, yaw, 0);
    this.lowerBody.rotation.set(0, 0, 0);
    this.upper.rotation.set(0, 0, 0);
    this._syncModel();
  }

  setWeapon(id, attachments = null) {
    this.weapon = new Weapon(id, null, attachments);
    if (this.rig) { this.gunModel = this.rig.setWeapon(id, this.weapon.attachments); return; }
    if (this.gunModel) this.arms.remove(this.gunModel);
    this.gunModel = buildWeaponModel(id, { attachments: this.weapon.attachments, lod: 'auto' });
    this.gunModel.position.set(0.12, -0.02, -0.28);
    this.arms.add(this.gunModel);
  }

  _buildModel() {
    if (SoldierRig.available(Enemy.assets)) {
      this.rig = new SoldierRig(Enemy.assets, this.team, this.name, this.cls);
      this.model = this.rig.root;
      this.setWeapon(this.weapon.id, this.weapon.attachments);
      this.scene.add(this.model);
      return;
    }
    if (Enemy.assets) Enemy.assets._fallback('character:soldier', 'skinned soldier unavailable, using block soldier');
    const look = TEAM_LOOK[this.team];
    const root = new THREE.Group();
    root.name = `bot-${this.name}`;
    root.rotation.order = 'YXZ'; // yaw first, then local pitch (used for the death fall)

    // Legs (0 – 0.8)
    this.lowerBody = new THREE.Group();
    this.legL = new THREE.Group();
    this.legL.position.set(-0.11, 0.8, 0);
    this.legL.add(part(0.17, 0.8, 0.2, look.pants, 0, -0.4, 0));
    this.legL.add(part(0.18, 0.12, 0.28, 0x1e1c1a, 0, -0.74, -0.04));
    this.legR = new THREE.Group();
    this.legR.position.set(0.11, 0.8, 0);
    this.legR.add(part(0.17, 0.8, 0.2, look.pants, 0, -0.4, 0));
    this.legR.add(part(0.18, 0.12, 0.28, 0x1e1c1a, 0, -0.74, -0.04));
    this.lowerBody.add(this.legL, this.legR);
    root.add(this.lowerBody);

    // Upper body pivots at the hips (0.8) so aiming pitch bends the torso.
    this.upper = new THREE.Group();
    this.upper.position.y = 0.8;
    this.upper.add(part(0.46, 0.66, 0.28, look.shirt, 0, 0.33, 0)); // torso 0.8–1.46
    this.upper.add(part(0.5, 0.42, 0.32, look.vest, 0, 0.4, 0)); // vest
    // Head (1.46 – 1.8): matches HEAD_SIZE hitbox
    this.head = new THREE.Group();
    this.head.position.y = 0.66;
    this.head.add(part(0.26, 0.28, 0.26, SKIN, 0, 0.15, 0));
    this.head.add(part(0.3, 0.13, 0.3, look.head, 0, 0.29, 0)); // helmet / cap
    this.head.add(part(0.27, 0.08, 0.05, 0x111111, 0, 0.17, -0.13)); // goggles
    this.upper.add(this.head);
    // Team armband
    this.upper.add(part(0.06, 0.08, 0.17, look.band, -0.27, 0.5, 0));

    // Arms holding the gun, pivot at shoulders
    this.arms = new THREE.Group();
    this.arms.position.set(0, 0.56, 0);
    const armR = part(0.12, 0.12, 0.42, look.shirt, 0.2, -0.05, -0.18);
    armR.rotation.x = 0.2;
    const armL = part(0.12, 0.12, 0.46, look.shirt, -0.1, -0.06, -0.26);
    armL.rotation.set(0.15, -0.5, 0);
    this.arms.add(armR, armL);
    this.arms.add(part(0.09, 0.09, 0.09, 0x2d2a24, 0.12, -0.08, -0.38));
    this.upper.add(this.arms);
    root.add(this.upper);

    this.model = root;
    this.setWeapon(this.weapon.id, this.weapon.attachments);
    this.scene.add(root);
  }

  _syncModel() {
    this.model.position.set(this.body.pos.x, this.body.pos.y, this.body.pos.z);
  }

  // Muzzle position in world space for tracers/flash.
  getMuzzle(out) {
    const m = this.gunModel.userData.muzzle;
    m.getWorldPosition(out);
    return out;
  }

  updateModel(dt, speed, onScreen = true) {
    if (this.rig) {
      if (!this.alive) { this.deathTime += dt; if (this.deathTime > 20) { this.model.visible = false; return; } }
      this.flinch = Math.max(0, (this.flinch || 0) - dt);
      // Off-screen: keep the root placed (shadows, audio) but skip skinning/IK work.
      this.model.visible = onScreen;
      if (!onScreen) { this.rig.place(this.yaw, this.body.pos, dt); return; }
      this.rig.update(dt, {
        speed, aimPitch: this.aimPitch, flinch: this.flinch, alive: this.alive, deathTime: this.deathTime,
        reloading: this.weapon.reloading, yaw: this.yaw, pos: this.body.pos, camDist: this.camDist,
      });
      return;
    }
    if (!this.alive) {
      // Fall over backwards/sideways over 0.45s, then lie still.
      this.deathTime += dt;
      const t = Math.min(1, this.deathTime / 0.45);
      const ease = t * t;
      this.model.rotation.set(ease * Math.PI / 2 * 0.98, this.yaw, 0); // fall backwards
      this.upper.rotation.x = 0;
      this.arms.rotation.x = ease * 0.8;
      this.model.position.y = this.body.pos.y + 0.05 * ease;
      if (this.deathTime > 20) this.model.visible = false;
      return;
    }
    this._syncModel();
    this.model.rotation.set(0, this.yaw, 0);
    // Walk cycle
    if (speed > 0.3) this.walkPhase += dt * speed * 2.4;
    const swing = Math.min(1, speed / 4) * 0.55;
    this.legL.rotation.x = Math.sin(this.walkPhase) * swing;
    this.legR.rotation.x = -Math.sin(this.walkPhase) * swing;
    // Aim pitch bends torso & arms; flinch jolts the torso when hit.
    this.flinch = Math.max(0, (this.flinch || 0) - dt);
    this.upper.rotation.x = this.aimPitch * 0.35 - this.flinch * 1.2;
    this.arms.rotation.x = this.aimPitch * 0.65;
    // Reload: tilt the gun down
    this.gunModel.rotation.x = this.weapon.reloading ? -0.6 : 0;
  }

  // Thermal vision: mark the body as a hot target (the vision shader renders magenta-marked pixels white-hot).
  setThermal(on) {
    if (this.thermal === on) return;
    this.thermal = on;
    this.model.traverse((o) => {
      if (!(o.isSkinnedMesh || (o.isMesh && !this.rig)) || !o.material || o.userData.shared) return;
      if (o.userData.emissive0 === undefined) o.userData.emissive0 = [o.material.emissive.getHex(), o.material.emissiveIntensity];
      if (on) { o.material.emissive.setHex(0xff00ff); o.material.emissiveIntensity = 1.4; }
      else { o.material.emissive.setHex(o.userData.emissive0[0]); o.material.emissiveIntensity = o.userData.emissive0[1]; }
    });
  }

  dispose() {
    this.scene.remove(this.model);
    // Skinned clones and forge weapons share cached geometry; only the block soldier's own geometry is owned here.
    if (!this.rig) this.model.traverse((o) => { if (o.isMesh && !o.userData.shared) o.geometry.dispose(); });
  }
}
