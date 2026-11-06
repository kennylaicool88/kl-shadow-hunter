// Skinned, animated soldier for bots (three.js example "Soldier.glb", Mixamo rig; see asset manifest).
// The clip set only has Idle / Walk / Run, so the other states are layered procedurally on top:
//   aiming   – the rifle is mounted at the chest, pitched to the aim angle, and both hands are placed
//              on it with analytic two-bone IK (grip + handguard); the spine leans with the aim
//   firing   – recoil kick on the rifle mount;  hit – spine flinch;  death – full-body fall
//   moving   – walk/run selected and time-scaled from the real ground speed (no foot sliding)
// Gameplay hitboxes are independent of this visual model (see combat.js).
import * as THREE from 'three';
import { buildWeaponModel } from '../weapons/WeaponModels.js';
import { material } from '../weapons/forge/materials.js';

const TINT = { A: new THREE.Color(0xa9bad0), B: new THREE.Color(0xd9d0bf) };
// Hostile class colourways and gear (helmet, plate carrier, hat/hood, NVG mount).
const CLASS_LOOK = {
  rifleman: { tint: 0xd9d0bf, helmet: 'olive_paint', vest: 'fabric' },
  heavy: { tint: 0x8d8a80, helmet: 'steel_dark', vest: 'fabric_black', bigVest: true, visor: true },
  sniper: { tint: 0x9aa680, hood: true },
  recon: { tint: 0xc9b48e, boonie: true, vest: 'fabric' },
  elite: { tint: 0x5d6068, helmet: 'anod_black', vest: 'fabric_black', nvg: true },
};
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _p = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();
const _axis = new THREE.Vector3(), _elbow = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3();
const _qa = new THREE.Quaternion();
const _grip = new THREE.Vector3(), _guard = new THREE.Vector3(), _rp = new THREE.Vector3(), _lp = new THREE.Vector3();

function rotateBoneWorld(bone, q) {
  bone.getWorldQuaternion(_qw);
  _qw.premultiply(q);
  bone.parent.getWorldQuaternion(_qp).invert();
  bone.quaternion.copy(_qp.multiply(_qw));
  bone.updateMatrixWorld(true);
}

function aimBone(bone, from, to) {
  _q.setFromUnitVectors(from.normalize(), to.normalize());
  rotateBoneWorld(bone, _q);
}

// Places `end` on `target`, bending the middle joint toward `pole`.
function twoBoneIK(upper, lower, end, target, pole) {
  upper.getWorldPosition(_a); lower.getWorldPosition(_b); end.getWorldPosition(_c);
  const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c);
  _t.subVectors(target, _a);
  const d = THREE.MathUtils.clamp(_t.length(), 0.05, l1 + l2 - 0.002);
  const dir = _t.normalize();
  _p.subVectors(pole, _a);
  _p.addScaledVector(dir, -_p.dot(dir)).normalize();
  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  _elbow.copy(_a).addScaledVector(dir, cosA * l1).addScaledVector(_p, Math.sqrt(1 - cosA * cosA) * l1);
  aimBone(upper, _f.subVectors(_b, _a), _d.subVectors(_elbow, _a));
  lower.getWorldPosition(_b); end.getWorldPosition(_c);
  aimBone(lower, _f.subVectors(_c, _b), _d.subVectors(target, _b));
}

export class SoldierRig {
  static available(assets) {
    return !!(assets && assets.hasModel('soldier'));
  }

  constructor(assets, team, name, cls = 'rifleman') {
    this.cls = cls;
    this.root = new THREE.Group();
    this.root.name = `bot-${name}`;
    this.root.rotation.order = 'YXZ';
    this.body = new THREE.Group(); // pitched for the death fall
    this.root.add(this.body);
    const model = assets.model('soldier', { skinned: true });
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const s = 1.8 / Math.max(0.5, box.max.y - box.min.y);
    model.scale.multiplyScalar(s);
    model.position.y = -box.min.y * s;
    // This rig already faces -Z (the game's forward axis) – verified in gameplay screenshots.
    model.traverse((o) => {
      if (o.isSkinnedMesh || o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false; // skinned bounds come from the bind pose
        o.material = o.material.clone();
        if (/Body/i.test(o.material.name)) o.material.color.multiply(team === 'B' ? new THREE.Color(CLASS_LOOK[cls].tint) : TINT[team]);
      }
    });
    this.body.add(model);
    this.model = model;
    const bone = (n) => { let r = null; model.traverse((o) => { if (o.isBone && o.name.replace(/[^A-Za-z0-9]/g, '').endsWith(n)) r = r || o; }); return r; };
    this.bones = {
      spine: bone('Spine1'), spine2: bone('Spine2'), head: bone('Head'),
      rArm: bone('RightArm'), rFore: bone('RightForeArm'), rHand: bone('RightHand'),
      lArm: bone('LeftArm'), lFore: bone('LeftForeArm'), lHand: bone('LeftHand'),
    };
    this.ikReady = Object.values(this.bones).every(Boolean);
    if (team === 'B') this._addGear(CLASS_LOOK[cls] || CLASS_LOOK.rifleman);
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of assets.animations('soldier')) {
      if (['Idle', 'Walk', 'Run'].includes(clip.name)) this.actions[clip.name] = this.mixer.clipAction(clip);
    }
    this.current = null;
    this._play('Idle', 0);
    // Rifle mount at the chest (character space, forward = -Z)
    this.mount = new THREE.Group();
    this.mount.position.set(0.1, 1.36, -0.08);
    this.body.add(this.mount);
    this.kick = 0;
  }

  _play(name, fade = 0.25) {
    const a = this.actions[name];
    if (!a || this.current === a) return;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = a;
  }

  // Class gear parented to bones (sizes compensate the rig's bone scale).
  _addGear(look) {
    const ws = new THREE.Vector3();
    const attach = (bone, mesh, x, y, z) => {
      if (!bone) return;
      bone.getWorldScale(ws);
      const s = 1.8 / 1.8; // model already normalised to 1.8 m
      mesh.scale.multiplyScalar(s / ws.x);
      mesh.position.set(x / ws.x, y / ws.y, z / ws.z);
      mesh.userData.shared = true;
      mesh.castShadow = false; // gear is small; the body already casts the shadow
      bone.add(mesh);
    };
    const head = this.bones.head, chest = this.bones.spine2;
    if (look.helmet) {
      attach(head, new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), material(look.helmet)), 0, 0.095, -0.005);
      if (look.visor) attach(head, new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.02), material('lens')), 0, 0.075, 0.12);
      if (look.nvg) attach(head, new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.06), material('anod_black')), 0, 0.17, 0.11);
    }
    if (look.boonie) {
      attach(head, new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.08, 14), material('fabric')), 0, 0.13, 0);
      attach(head, new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 16), material('fabric')), 0, 0.1, 0);
    }
    if (look.hood) attach(head, new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), material('fabric')), 0, 0.08, -0.02);
    if (look.vest) {
      const w = look.bigVest ? 0.4 : 0.34, d = look.bigVest ? 0.3 : 0.25;
      attach(chest, new THREE.Mesh(new THREE.BoxGeometry(w, 0.32, d), material(look.vest)), 0, -0.02, 0.01);
      for (let k = 0; k < 3; k++) attach(chest, new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.05), material(look.vest)), -0.09 + k * 0.09, -0.12, 0.15);
    }
  }

  setWeapon(id, attachments = null) {
    if (this.gun) this.mount.remove(this.gun);
    this.gun = buildWeaponModel(id, { attachments, lod: 'auto' });
    // Place the weapon's own grip at the right-hand position of the chest mount.
    const grip = (this.gun.userData.points && this.gun.userData.points.grip) || new THREE.Vector3(0, -0.05, 0.09);
    this.gun.position.set(-grip.x, -0.11 - grip.y, -0.21 - grip.z);
    this.mount.add(this.gun);
    return this.gun;
  }

  reset(yaw) {
    this.root.rotation.set(0, yaw, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.mixer.timeScale = 1;
    this.current = null;
    for (const a of Object.values(this.actions)) a.stop();
    this._play('Idle', 0);
    this.dead = false;
  }

  fire() {
    this.kick = 1;
  }

  update(dt, { speed, aimPitch, flinch, alive, deathTime, reloading, yaw, pos }) {
    this.root.position.set(pos.x, pos.y, pos.z);
    if (!alive) {
      // Death: freeze the animation and fall backwards.
      if (!this.dead) { this.dead = true; this.mixer.timeScale = 0; }
      const t = Math.min(1, deathTime / 0.55);
      const e = t * t;
      this.root.rotation.set(0, yaw, 0);
      this.body.rotation.x = e * Math.PI * 0.49;
      this.body.position.y = 0.05 * e;
      this.mount.rotation.x = e * 0.9;
      return;
    }
    this.root.rotation.set(0, yaw, 0);
    // Locomotion clip from real speed; playback rate matched to stride length.
    if (speed < 0.35) { this._play('Idle'); this.mixer.timeScale = 1; }
    else if (speed < 3.0) { this._play('Walk'); this.mixer.timeScale = THREE.MathUtils.clamp(speed / 1.55, 0.6, 1.8); }
    else { this._play('Run'); this.mixer.timeScale = THREE.MathUtils.clamp(speed / 4.6, 0.75, 1.5); }
    this.mixer.update(dt);
    this.model.updateMatrixWorld(true);
    if (!this.ikReady) return;
    // Upper-body aim layer
    this.kick = Math.max(0, this.kick - dt * 9);
    const lean = -aimPitch * 0.45 - flinch * 1.4;
    this.root.updateMatrixWorld(true);
    _axis.set(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(_q));
    rotateBoneWorld(this.bones.spine2, _qa.setFromAxisAngle(_axis, -lean * 0.5));
    this.mount.rotation.set(aimPitch + (reloading ? -0.7 : 0), 0, 0);
    this.mount.position.z = -0.08 + this.kick * 0.05;
    this.mount.updateMatrixWorld(true);
    // Hands onto the rifle: grip (right) and handguard (left); elbows down and outward.
    const pts = this.gun.userData.points || {};
    const grip = this.gun.localToWorld(pts.grip ? _grip.copy(pts.grip) : _grip.set(0, -0.05, 0.09));
    const guard = this.gun.localToWorld(pts.support ? _guard.copy(pts.support) : _guard.set(0, -0.02, -0.24));
    const rPole = this.body.localToWorld(_rp.set(0.6, 0.9, 0.3));
    const lPole = this.body.localToWorld(_lp.set(-0.6, 0.9, -0.2));
    twoBoneIK(this.bones.rArm, this.bones.rFore, this.bones.rHand, grip, rPole);
    twoBoneIK(this.bones.lArm, this.bones.lFore, this.bones.lHand, guard, lPole);
  }
}
