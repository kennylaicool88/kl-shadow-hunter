// Hostile surveillance cameras (fictional electronics). They sweep a view cone; holding the player in
// view for ~1 s raises the alarm (nearby hostiles investigate, mission alert rises). EMP grenades and the
// pulse device knock them out for a while. Model: Poly Haven "security_camera_01" (CC0) when available.
// These cameras are unrelated to the protected SENTINEL surveillance post of the Deep Strike mission.
import * as THREE from 'three';
import { material } from '../weapons/forge/materials.js';

// Rough placement hints per level; each is snapped onto the nearest wall at runtime.
const HINTS = {
  depot: [[-6, 3.4, 15], [6, 3.4, -15], [26, 3.4, 4], [-26, 3.4, -6]],
  kl: [[0, 3.6, -36], [-20, 3.6, -48], [-22, 3.6, 72], [70, 3.6, 70], [-30, -5.2, 46], [24, -5.2, 58]],
};

const FOV = 0.5; // half-angle (rad)
const RANGE = 24;
const _eye = { x: 0, y: 0, z: 0 };

export class SurveillanceSystem {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'surveillance';
    game.scene.add(this.group);
    this.cameras = [];
    this.lastAlarm = -99;
    this.time = 0;
  }

  setLevel(levelId) {
    for (const c of this.cameras) this.group.remove(c.root);
    this.cameras = [];
    const hints = HINTS[levelId] || [];
    const col = this.game.collision;
    for (const [x, y, z] of hints) {
      let best = null;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const h = col.raycast(x, y, z, dx, 0, dz, 9);
        if (h && (!best || h.dist < best.dist)) best = h;
      }
      const pos = best ? new THREE.Vector3(best.point.x + best.normal.x * 0.2, y, best.point.z + best.normal.z * 0.2) : new THREE.Vector3(x, y, z);
      const facing = best ? Math.atan2(-best.normal.x, -best.normal.z) + Math.PI : Math.random() * Math.PI * 2;
      this.cameras.push(this._build(pos, facing, !best));
    }
  }

  _build(pos, facing, pole) {
    const root = new THREE.Group();
    root.position.copy(pos);
    const head = new THREE.Group();
    root.add(head);
    const assets = this.game.assets;
    let model = assets && assets.hasModel('security_camera') ? assets.model('security_camera') : null;
    if (model) {
      model.scale.setScalar(1.0);
      model.rotation.y = Math.PI; // lens toward -Z of the head
      model.position.set(0, -0.12, 0.1);
      head.add(model);
    } else {
      head.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.3).translate(0, 0, -0.1), material('white')));
      head.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12).rotateX(Math.PI / 2).translate(0, 0, -0.26), material('lens')));
    }
    if (pole) root.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, pos.y, 10).translate(0, -pos.y / 2, 0), material('steel_dark')));
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), material('glow_red').clone());
    led.position.set(0.04, 0.02, -0.2);
    head.add(led);
    head.rotation.order = 'YXZ';
    head.rotation.x = -0.32; // looks down
    this.group.add(root);
    return { root, head, led, pos, facing, sweep: Math.random() * 6, disabled: 0, seen: 0, tracking: false };
  }

  // Disables cameras within radius for `duration` seconds. Returns the number affected.
  emp(pos, radius, duration) {
    let n = 0;
    for (const c of this.cameras) {
      if (Math.hypot(c.pos.x - pos.x, c.pos.y - pos.y, c.pos.z - pos.z) < radius) { c.disabled = Math.max(c.disabled, duration); c.seen = 0; n++; }
    }
    return n;
  }

  // Status for the HUD: 'clear' | 'watched' (a camera is building detection) | 'detected'
  status() {
    if (this.time - this.lastAlarm < 4) return 'detected';
    return this.cameras.some((c) => c.seen > 0.15) ? 'watched' : 'clear';
  }

  update(dt) {
    this.time += dt;
    const g = this.game;
    const p = g.player;
    for (const c of this.cameras) {
      if (c.disabled > 0) {
        c.disabled -= dt;
        c.led.visible = false;
        c.head.rotation.x = -0.6; // slumped
        if (Math.random() < dt * 3) g.effects.burst?.(c.pos, 2, 1.5, { r: 0.5, g: 0.85, b: 1 });
        continue;
      }
      c.head.rotation.x = -0.32;
      // Sweep, or track the player while they're in view.
      let yaw = c.facing + Math.sin((c.sweep += dt * 0.45)) * 0.75;
      let visible = false;
      if (p.alive) {
        p.getEyePosition(_eye);
        const dx = _eye.x - c.pos.x, dz = _eye.z - c.pos.z, dy = _eye.y - c.pos.y;
        const d = Math.hypot(dx, dz);
        const toYaw = Math.atan2(-dx, -dz);
        let off = toYaw - (c.tracking ? c.head.rotation.y : yaw);
        while (off > Math.PI) off -= Math.PI * 2;
        while (off < -Math.PI) off += Math.PI * 2;
        if (d < RANGE && Math.abs(off) < FOV && Math.abs(Math.atan2(dy, d) + 0.32) < 0.7) {
          const a = { x: c.pos.x, y: c.pos.y - 0.1, z: c.pos.z };
          visible = g.collision.lineClear(a.x, a.y, a.z, _eye.x, _eye.y - 0.2, _eye.z) && !(g.throwables && g.throwables.visionBlocked(a, _eye));
          if (visible) yaw = toYaw;
        }
      }
      c.tracking = visible;
      c.seen = visible ? c.seen + dt : Math.max(0, c.seen - dt * 0.5);
      c.head.rotation.y = yaw;
      c.led.visible = visible || (this.time * 1.5) % 1 < 0.5;
      if (c.seen > 1.0 && this.time - this.lastAlarm > 6) this._alarm(c);
    }
  }

  _alarm(c) {
    const g = this.game;
    this.lastAlarm = this.time;
    const pos = g.player.body.pos;
    for (const bot of g.enemies.bots) if (bot.alive && bot.team !== g.player.team && bot.ai) bot.ai.hear({ x: pos.x, y: pos.y, z: pos.z }, 90);
    const m = g.mission;
    if (m && m.active && m.mission) m.mission.raiseAlert(6, 'surveillance camera detection');
    g.hud.message('', 'Spotted by a surveillance camera', 1.6);
    g.audio.cameraAlarm?.(c.pos);
  }

  clear() {
    for (const c of this.cameras) this.group.remove(c.root);
    this.cameras = [];
  }
}
