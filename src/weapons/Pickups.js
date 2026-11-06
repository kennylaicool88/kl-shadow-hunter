// Weapons lying in the world (dropped by the player or by dead bots). Press E nearby to pick up.
import * as THREE from 'three';
import { buildWeaponModel } from './WeaponModels.js';
import { getWeaponConfig } from './weaponConfigs.js';

const MAX_ITEMS = 24;

export class Pickups {
  constructor(scene, collision) {
    this.scene = scene;
    this.collision = collision;
    this.items = [];
    this.group = new THREE.Group();
    this.group.name = 'pickups';
    scene.add(this.group);
  }

  spawn(weaponId, ammo, position, velocity = { x: 0, y: 0, z: 0 }, attachments = {}) {
    if (this.items.length >= MAX_ITEMS) this.remove(this.items[0]);
    const model = buildWeaponModel(weaponId, { attachments, lod: 'auto' });
    model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const holder = new THREE.Group();
    holder.add(model);
    model.rotation.set(0, 0, Math.PI / 2); // lie on its side
    model.position.y = 0.05;
    holder.position.set(position.x, position.y, position.z);
    holder.rotation.y = Math.random() * Math.PI * 2;
    this.group.add(holder);
    const item = {
      weaponId,
      cfgSlot: getWeaponConfig(weaponId).slot,
      name: getWeaponConfig(weaponId).name,
      ammo: { ...ammo },
      attachments: { ...(attachments || {}) },
      mesh: holder,
      vel: { ...velocity },
      body: { pos: holder.position, radius: 0.15, height: 0.1, grounded: false },
      resting: false,
    };
    this.items.push(item);
    return item;
  }

  findNearest(pos, radius) {
    let best = null;
    let bestD = radius;
    for (const it of this.items) {
      const d = Math.hypot(it.mesh.position.x - pos.x, it.mesh.position.z - pos.z);
      const dy = Math.abs(it.mesh.position.y - pos.y);
      if (d < bestD && dy < 1.6) { best = it; bestD = d; }
    }
    return best;
  }

  remove(item) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
    this.group.remove(item.mesh);
    item.mesh.traverse((o) => { if (o.isMesh && !o.userData.shared) o.geometry.dispose(); });
  }

  clear() {
    while (this.items.length) this.remove(this.items[0]);
  }

  update(dt) {
    for (const it of this.items) {
      if (it.resting) continue;
      it.vel.y -= 20 * dt;
      const res = this.collision.moveBody(it.body, it.vel.x * dt, it.vel.y * dt, it.vel.z * dt, false);
      if (res.hitX) it.vel.x *= -0.3;
      if (res.hitZ) it.vel.z *= -0.3;
      if (it.body.grounded) {
        it.vel.x *= 0.8;
        it.vel.z *= 0.8;
        it.vel.y = 0;
        if (Math.hypot(it.vel.x, it.vel.z) < 0.05) it.resting = true;
      }
      if (it.body.pos.y < -5) it.body.pos.y = 0.5;
    }
  }
}
