// Tactical equipment: toggled gear (night vision, thermal, flashlight) and held devices
// (binoculars, laser rangefinder, enemy detector, ballistic shield, medical kit, ammunition pack).
// Gameplay effects are applied here; WeaponManager owns the first-person presentation of held items.
import * as THREE from 'three';
import { EQUIPMENT, THROWABLES } from '../weapons/equipmentData.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = { x: 0, y: 0, z: 0 };

export const HELD_IDS = ['binoculars', 'rangefinder', 'detector', 'shield', 'medkit', 'ammopack'];

export class EquipmentSystem {
  constructor(game) {
    this.game = game;
    this.owned = new Set();
    this.reset([]);
  }

  reset(list) {
    this.owned = new Set(list.filter((id) => EQUIPMENT[id]));
    this.vision = 'none'; // none | nvg | thermal
    this.battery = { nvg: EQUIPMENT.nvg.battery, thermal: EQUIPMENT.thermal.battery };
    this.light = false;
    this.empTime = 0;
    this.charges = { medkit: EQUIPMENT.medkit.charges, ammopack: EQUIPMENT.ammopack.charges };
    this.shieldHp = EQUIPMENT.shield.hp;
    this.healing = 0; // medkit use progress (s)
    this.range = null; // last rangefinder reading
    this.marks = []; // { pos, until, label }
    this.binoZoom = false;
    this.detectorBlips = [];
    this.heldActive = null; // id of the currently held device (set by WeaponManager)
    this._applyVision();
    this._applyLight();
  }

  has(id) { return this.owned.has(id); }

  heldList() { return HELD_IDS.filter((id) => this.owned.has(id)); }

  // ------------------------------------------------------------------ toggles
  toggleVision(mode) {
    if (!this.has(mode)) { this.game.hud.message('', `${EQUIPMENT[mode].name} not in loadout`, 1.2); return false; }
    if (this.empTime > 0) { this.game.audio.dryFire(); this.game.hud.message('', 'Electronics disrupted (EMP)', 1.2); return false; }
    if (this.vision !== mode && this.battery[mode] <= 1) { this.game.hud.message('', `${EQUIPMENT[mode].name}: battery depleted`, 1.2); return false; }
    this.vision = this.vision === mode ? 'none' : mode;
    this._applyVision();
    this.game.audio.gearToggle?.(this.vision !== 'none');
    return true;
  }

  toggleLight() {
    const weaponLight = this.game.weapons.weapon && this.game.weapons.weapon.cfg.hasLight;
    if (!this.has('flashlight') && !weaponLight) { this.game.hud.message('', 'No flashlight in loadout', 1.2); return false; }
    this.light = !this.light;
    this._applyLight();
    this.game.audio.uiClick();
    return true;
  }

  _applyVision() {
    const g = this.game;
    if (g.pipeline) g.pipeline.setVision(this.vision);
    // Thermal: hostiles glow (marked emissive) so the vision shader renders them white-hot.
    for (const bot of g.enemies ? g.enemies.bots : []) bot.setThermal?.(this.vision === 'thermal');
  }

  _applyLight() {
    const g = this.game;
    if (this.light && !this.spot) {
      // Created on first use only (each scene light costs every pixel).
      this.spot = new THREE.SpotLight(0xfff2dc, 0, 45, 0.42, 0.45, 1.4);
      this.spot.castShadow = false;
      this.spotTarget = new THREE.Object3D();
      g.scene.add(this.spot, this.spotTarget);
      this.spot.target = this.spotTarget;
    }
    if (this.spot) this.spot.intensity = this.light ? 40 : 0;
  }

  // EMP near the player: gear switches off for a while.
  empHit(pos, radius, duration) {
    const p = this.game.player.body.pos;
    if (Math.hypot(p.x - pos.x, p.z - pos.z) > radius) return false;
    this.empTime = Math.max(this.empTime, duration);
    if (this.vision !== 'none') { this.vision = 'none'; this._applyVision(); }
    if (this.light) { this.light = false; this._applyLight(); }
    return true;
  }

  // ------------------------------------------------------------------ per frame
  update(dt, input, active) {
    const g = this.game;
    this.empTime = Math.max(0, this.empTime - dt);
    if (active) {
      if (input.wasPressed('KeyN')) this.toggleVision('nvg');
      if (input.wasPressed('KeyJ')) this.toggleVision('thermal');
      if (input.wasPressed('KeyL')) this.toggleLight();
    }
    // Batteries drain while in use and recharge slowly otherwise.
    for (const k of ['nvg', 'thermal']) {
      const max = EQUIPMENT[k].battery;
      if (this.vision === k) {
        this.battery[k] = Math.max(0, this.battery[k] - dt);
        if (this.battery[k] <= 0) { this.vision = 'none'; this._applyVision(); g.hud.message('', `${EQUIPMENT[k].name}: battery depleted`, 1.5); }
      } else this.battery[k] = Math.min(max, this.battery[k] + dt * 0.25);
    }
    if (this.spot && this.light) {
      g.camera.getWorldPosition(this.spot.position);
      g.camera.getWorldDirection(_d);
      this.spot.position.addScaledVector(_d, 0.3).y -= 0.1;
      this.spotTarget.position.copy(this.spot.position).addScaledVector(_d, 10);
    }
    this.marks = this.marks.filter((m) => m.until > g.throwables.time);
    if (this.vision === 'thermal') for (const b of g.enemies.bots) b.setThermal?.(true); // reinforcements spawned later
    if (this.heldActive === 'detector') this._scanDetector();
  }

  // ------------------------------------------------------------------ held devices
  /**
   * Called by WeaponManager while a held device is equipped.
   * fire: LMB pressed this frame, hold: LMB held, alt: RMB held. Returns an event string or null.
   */
  useHeld(id, { fire, hold, alt, dt }) {
    const g = this.game;
    switch (id) {
      case 'binoculars':
        this.binoZoom = alt;
        if (fire) return this._tagTarget(alt ? 1.2 : 3.5) ? 'tagged' : 'notag';
        return null;
      case 'rangefinder':
        if (fire) { this._range(); return 'ranged'; }
        return null;
      case 'medkit':
        if (hold && this.charges.medkit > 0 && g.player.health < 100) {
          this.healing += dt;
          if (this.healing >= 2) {
            this.healing = 0;
            this.charges.medkit--;
            g.player.health = Math.min(100, g.player.health + EQUIPMENT.medkit.heal);
            g.audio.medkit?.();
            g.hud.message('', `+${EQUIPMENT.medkit.heal} health · ${this.charges.medkit} kit(s) left`, 1.6);
            return 'healed';
          }
        } else this.healing = 0;
        if (fire && this.charges.medkit <= 0) g.hud.message('', 'Medical kit empty', 1.2);
        return null;
      case 'ammopack':
        if (fire) {
          if (this.charges.ammopack <= 0) { g.hud.message('', 'Supply pack empty', 1.2); return null; }
          this.charges.ammopack--;
          g.weapons.refillAll();
          for (const t of Object.keys(g.weapons.grenades)) g.weapons.grenades[t] = Math.min(THROWABLES[t].count + 1, g.weapons.grenades[t] + 1);
          g.audio.pickup();
          g.hud.message('', 'Ammunition resupplied', 1.6);
          return 'resupplied';
        }
        return null;
      case 'shield':
        if (fire) return this._bash() ? 'bash-hit' : 'bash';
        return null;
      default:
        return null;
    }
  }

  // Shield blocks frontal damage while held. Returns the damage that still gets through.
  absorb(raw, info) {
    if (this.heldActive !== 'shield' || this.shieldHp <= 0 || !info.attacker || !info.attacker.body) return raw;
    const p = this.game.player;
    const a = info.attacker.body.pos;
    const yawTo = Math.atan2(-(a.x - p.body.pos.x), -(a.z - p.body.pos.z));
    let d = yawTo - p.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) > 1.05) return raw;
    this.shieldHp = Math.max(0, this.shieldHp - raw);
    this.game.audio.impact(p.body.pos, 'metal');
    if (this.shieldHp <= 0) this.game.hud.message('', 'Shield destroyed', 1.5);
    this.shieldBlocked = (this.shieldBlocked || 0) + 1;
    return 0;
  }

  _bash() {
    const g = this.game;
    g.camera.getWorldPosition(_v);
    g.camera.getWorldDirection(_d);
    for (const t of g.getTargets(g.player)) {
      const h = t.hitTest(_v.x, _v.y, _v.z, _d.x, _d.y, _d.z, 1.7);
      if (h && t.team !== g.player.team) {
        g.dealDamage(t, 35, { attacker: g.player, part: 'body', armorRatio: 1, weaponId: 'shield', weaponName: 'Shield bash', direction: { x: _d.x, y: 0, z: _d.z } });
        t.ai?.stun?.(1.5, 0.3);
        g.audio.knifeHit(h.point || _v);
        return true;
      }
    }
    g.audio.knifeSwing();
    return false;
  }

  _tagTarget(maxAngleDeg) {
    const g = this.game;
    g.camera.getWorldPosition(_v);
    g.camera.getWorldDirection(_d);
    let best = null, bestA = (maxAngleDeg * Math.PI) / 180;
    for (const bot of g.enemies.bots) {
      if (!bot.alive || bot.team === g.player.team) continue;
      bot.getAimPoint(_p, 'body');
      const dx = _p.x - _v.x, dy = _p.y - _v.y, dz = _p.z - _v.z;
      const dist = Math.hypot(dx, dy, dz);
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * _d.x + dy * _d.y + dz * _d.z) / dist)));
      if (ang < bestA && g.collision.lineClear(_v.x, _v.y, _v.z, _p.x, _p.y, _p.z) && !g.throwables.visionBlocked(_v, _p)) { best = bot; bestA = ang; }
    }
    if (!best) return false;
    g.throwables.reveal(best, 10);
    g.audio.lockTone('acquire');
    g.hud.message('', `Hostile tagged: ${best.name}`, 1.4);
    return true;
  }

  _range() {
    const g = this.game;
    g.camera.getWorldPosition(_v);
    g.camera.getWorldDirection(_d);
    const wall = g.collision.raycast(_v.x, _v.y, _v.z, _d.x, _d.y, _d.z, 1500);
    let dist = wall ? wall.dist : null, target = null;
    for (const t of g.getTargets(g.player)) {
      const h = t.hitTest(_v.x, _v.y, _v.z, _d.x, _d.y, _d.z, dist ?? 1500);
      if (h && (dist === null || h.dist < dist)) { dist = h.dist; target = t; }
    }
    const bearing = ((((-g.player.yaw * 180) / Math.PI) % 360) + 360) % 360;
    const elev = (Math.asin(_d.y) * 180) / Math.PI;
    this.range = { dist, bearing, elev, target: target ? target.name : null, time: g.throwables.time };
    if (dist !== null) {
      const pos = _v.clone().addScaledVector(_d, dist);
      this.marks.push({ pos, until: g.throwables.time + 10, label: `${dist.toFixed(1)} m` });
      if (target && target.team !== g.player.team) g.throwables.reveal(target, 10);
    }
    g.audio.lockTone('acquire');
    return this.range;
  }

  _scanDetector() {
    const g = this.game;
    const range = EQUIPMENT.detector.range;
    const p = g.player.body.pos;
    this.detectorBlips = [];
    if (this.empTime > 0) return;
    for (const bot of g.enemies.bots) {
      if (!bot.alive || bot.team === g.player.team) continue;
      const dx = bot.body.pos.x - p.x, dz = bot.body.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      // Rotate into view space: forward = up on the screen.
      const s = Math.sin(g.player.yaw), c = Math.cos(g.player.yaw);
      this.detectorBlips.push({ x: (dx * c - dz * s) / range, y: (dx * s + dz * c) / range, d, moving: bot.ai && bot.ai.speed > 0.5 });
    }
  }

  // Draws the detector / rangefinder screens (canvas textures on the held models).
  drawScreen(id, screen, time) {
    if (!screen) return;
    const c = screen.userData.canvas;
    const g = c.getContext('2d');
    const W = c.width, H = c.height;
    g.fillStyle = '#04140c'; g.fillRect(0, 0, W, H);
    if (this.empTime > 0) {
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(120,255,170,${Math.random() * 0.5})`; g.fillRect(Math.random() * W, Math.random() * H, 3, 2); }
      screen.userData.texture.needsUpdate = true;
      return;
    }
    g.strokeStyle = 'rgba(80,255,150,0.5)'; g.lineWidth = 2;
    if (id === 'detector') {
      const cx = W / 2, cy = H * 0.8, R = H * 0.75;
      for (const r of [0.33, 0.66, 1]) { g.beginPath(); g.arc(cx, cy, R * r, Math.PI, Math.PI * 2); g.stroke(); }
      const sweep = (time * 2) % 1;
      g.strokeStyle = 'rgba(80,255,150,0.25)'; g.beginPath(); g.arc(cx, cy, R * sweep, Math.PI, Math.PI * 2); g.stroke();
      for (const b of this.detectorBlips) {
        if (b.y > 0.05) continue;
        g.fillStyle = b.moving ? '#ff5040' : '#ffb040';
        g.beginPath(); g.arc(cx + b.x * R, cy + b.y * R, 7, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#7dffb0'; g.font = 'bold 22px monospace';
      g.fillText(`${this.detectorBlips.length} CONTACT${this.detectorBlips.length === 1 ? '' : 'S'}`, 12, 28);
    } else {
      g.fillStyle = '#ff6a50'; g.font = 'bold 40px monospace';
      const r = this.range;
      g.fillText(r && r.dist !== null ? `${r.dist.toFixed(1)}m` : '---.-m', 10, H * 0.55);
      g.font = '20px monospace'; g.fillStyle = '#ffb090';
      if (r) g.fillText(`BRG ${r.bearing.toFixed(0).padStart(3, '0')}  EL ${r.elev.toFixed(1)}`, 10, H * 0.88);
    }
    screen.userData.texture.needsUpdate = true;
  }

  // HUD status strip
  status() {
    const items = [];
    for (const id of ['nvg', 'thermal', 'flashlight']) {
      if (!this.has(id) && !(id === 'flashlight' && this.game.weapons.weapon && this.game.weapons.weapon.cfg.hasLight)) continue;
      const on = id === 'flashlight' ? this.light : this.vision === id;
      const bat = this.battery[id] !== undefined ? Math.round((this.battery[id] / EQUIPMENT[id].battery) * 100) : null;
      items.push({ id, label: EQUIPMENT[id].icon, on, bat, emp: this.empTime > 0 });
    }
    if (this.has('medkit')) items.push({ id: 'medkit', label: EQUIPMENT.medkit.icon, count: this.charges.medkit });
    if (this.has('ammopack')) items.push({ id: 'ammopack', label: EQUIPMENT.ammopack.icon, count: this.charges.ammopack });
    if (this.has('shield')) items.push({ id: 'shield', label: EQUIPMENT.shield.icon, bat: Math.round((this.shieldHp / EQUIPMENT.shield.hp) * 100), on: this.heldActive === 'shield' });
    for (const id of ['binoculars', 'rangefinder', 'detector']) if (this.has(id)) items.push({ id, label: EQUIPMENT[id].icon, on: this.heldActive === id, emp: id === 'detector' && this.empTime > 0 });
    return items;
  }
}
