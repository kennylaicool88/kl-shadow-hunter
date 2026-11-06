// Thrown equipment and launcher rockets in the world: projectile physics (bounce, roll, stick),
// fuses, and every effect: fragmentation blast, smoke clouds that block line of sight, flash/stun
// pulses that disorient bots, burning area denial, EMP / pulse blackouts of electronics, sensor
// pulses that reveal hostiles, and acoustic decoys. All effects are fictional game mechanics.
import * as THREE from 'three';
import { THROWABLES } from './equipmentData.js';
import { buildGrenadeModel } from './forge/equipmentModels.js';
import { createFlashTexture, createSoftParticleTexture } from '../maps/Textures.js';

const GRAVITY = 15;
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _n = new THREE.Vector3();
const _p = { x: 0, y: 0, z: 0 };

let SOFT = null, FLASH = null;
const tex = () => { if (!SOFT) { SOFT = createSoftParticleTexture(); FLASH = createFlashTexture(); } };

function sprite(map, color, additive, opacity = 1) {
  const m = new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const s = new THREE.Sprite(m);
  s.frustumCulled = false;
  return s;
}

// Distance from point c to segment ab (all {x,y,z}).
export function segmentPointDistance(a, b, c) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz || 1e-9;
  let t = ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.x + abx * t - c.x, a.y + aby * t - c.y, a.z + abz * t - c.z);
}

export class ThrowableSystem {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'throwables';
    game.scene.add(this.group);
    this.items = []; // live projectiles
    this.smokes = []; // { pos, radius, t, duration, sprites }
    this.fires = [];
    this.pulses = []; // visual expanding rings
    this.sensors = []; // { pos, t, duration, next }
    this.decoys = [];
    this.explosions = [];
    this.revealed = new Map(); // bot -> time revealed until
    this.time = 0;
    this.stats = { thrown: 0, detonated: {} };
  }

  get collision() { return this.game.collision; }

  // ------------------------------------------------------------------ spawning
  /** Throws a grenade. dir: unit vector, power 0..1 (underhand / overhand). Returns the projectile. */
  throw(type, origin, dir, power, owner) {
    const def = THROWABLES[type];
    if (!def) return null;
    const mesh = buildGrenadeModel(type);
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    if (mesh.userData.parts && mesh.userData.parts.pin) mesh.userData.parts.pin.visible = false; // pin pulled
    this.group.add(mesh);
    const speed = 7 + power * 11;
    const p = {
      type, def, owner, mesh,
      pos: new THREE.Vector3(origin.x, origin.y, origin.z),
      vel: new THREE.Vector3(dir.x * speed, dir.y * speed + 2.2 + power * 1.5, dir.z * speed),
      spin: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 18),
      fuse: def.fuse, resting: false, stuck: false, bounces: 0,
    };
    mesh.position.copy(p.pos);
    this.items.push(p);
    this.stats.thrown++;
    this.game.audio.throwWhoosh?.(p.pos);
    return p;
  }

  /** Launcher rocket (fictional): fast, slight drop, explodes on contact. */
  launchRocket(origin, dir, cfg, owner) {
    const mesh = buildGrenadeModel('rocket');
    this.group.add(mesh);
    const p = {
      type: 'rocket', owner, mesh, cfg, rocket: true,
      pos: new THREE.Vector3(origin.x, origin.y, origin.z),
      vel: new THREE.Vector3(dir.x, dir.y, dir.z).multiplyScalar(62),
      fuse: 4, trail: 0,
    };
    mesh.position.copy(p.pos);
    mesh.lookAt(_v.copy(p.pos).add(p.vel));
    this.items.push(p);
    this.game.audio.rocketLaunch?.(p.pos);
    return p;
  }

  // ------------------------------------------------------------------ simulation
  update(dt) {
    this.time += dt;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      if (p.rocket) this._updateRocket(p, dt);
      else this._updateGrenade(p, dt);
      if (p.dead) { this.group.remove(p.mesh); this.items.splice(i, 1); }
    }
    this._updateSmokes(dt);
    this._updateFires(dt);
    this._updateSensors(dt);
    this._updateDecoys(dt);
    this._updateVisuals(dt);
    for (const [bot, until] of this.revealed) if (until < this.time || !bot.alive) this.revealed.delete(bot);
  }

  _updateGrenade(p, dt) {
    p.fuse -= dt;
    if (!p.resting && !p.stuck) {
      p.vel.y -= GRAVITY * dt;
      const step = p.vel.length() * dt;
      if (step > 0) {
        _v.copy(p.vel).normalize();
        const hit = this.collision.raycast(p.pos.x, p.pos.y, p.pos.z, _v.x, _v.y, _v.z, step + 0.05);
        if (hit) {
          _n.set(hit.normal.x, hit.normal.y, hit.normal.z);
          p.pos.set(hit.point.x, hit.point.y, hit.point.z).addScaledVector(_n, 0.045);
          if (p.type === 'sensor') {
            p.stuck = true; p.vel.set(0, 0, 0); p.spin.set(0, 0, 0);
            p.mesh.quaternion.setFromUnitVectors(_a.set(0, 1, 0), _n);
          } else {
            const vn = p.vel.dot(_n);
            p.vel.addScaledVector(_n, -1.4 * vn).multiplyScalar(0.62);
            p.spin.multiplyScalar(0.6);
            if (Math.abs(vn) > 1.5) { p.bounces++; this.game.audio.grenadeBounce?.(p.pos, Math.min(1, Math.abs(vn) / 10)); }
            if (_n.y > 0.6 && p.vel.length() < 0.8) { p.resting = true; p.vel.set(0, 0, 0); }
          }
        } else p.pos.addScaledVector(p.vel, dt);
      }
      if (p.pos.y < -60) p.pos.y = -60;
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
    }
    p.mesh.position.copy(p.pos);
    if (p.fuse <= 0) { this.detonate(p); p.dead = true; }
  }

  _updateRocket(p, dt) {
    p.fuse -= dt;
    p.vel.y -= 1.5 * dt;
    const step = p.vel.length() * dt;
    _v.copy(p.vel).normalize();
    const wall = this.collision.raycast(p.pos.x, p.pos.y, p.pos.z, _v.x, _v.y, _v.z, step);
    let limit = wall ? wall.dist : step;
    let hitChar = null;
    for (const c of this.game.getCombatants()) {
      if (c === p.owner || !c.alive) continue;
      const h = c.hitTest(p.pos.x, p.pos.y, p.pos.z, _v.x, _v.y, _v.z, limit);
      if (h && h.dist < limit) { limit = h.dist; hitChar = c; }
    }
    p.pos.addScaledVector(_v, limit);
    p.mesh.position.copy(p.pos);
    p.mesh.lookAt(_a.copy(p.pos).add(p.vel));
    p.trail -= dt;
    if (p.trail <= 0) { p.trail = 0.02; this._puff(p.pos, 0x8a8a8a, 0.35, 0.9, false); this._puff(p.pos, 0xffa040, 0.2, 0.08, true); }
    if (wall || hitChar || p.fuse <= 0) {
      p.dead = true;
      this._explode(p.pos, p.cfg.splashRadius || 6, p.cfg.damage, p.owner, p.cfg.name, hitChar);
    }
  }

  // ------------------------------------------------------------------ detonation
  detonate(p) {
    const pos = p.pos.clone();
    const def = p.def;
    this.stats.detonated[p.type] = (this.stats.detonated[p.type] || 0) + 1;
    const g = this.game;
    switch (p.type) {
      case 'frag':
        this._explode(pos, def.radius, def.damage, p.owner, def.name);
        break;
      case 'smoke':
        this._spawnSmoke(pos, def);
        g.audio.smokeHiss?.(pos);
        break;
      case 'flash':
        this._flash(pos, def, p.owner);
        break;
      case 'stun':
        this._stun(pos, def, p.owner);
        break;
      case 'incendiary':
        this._spawnFire(pos, def, p.owner);
        break;
      case 'emp':
      case 'pulse':
        this._emp(pos, def, p.type === 'pulse');
        break;
      case 'sensor':
        this.sensors.push({ pos, mesh: this._keepMesh(p), t: 0, duration: def.duration, next: 0, radius: def.radius, owner: p.owner });
        g.audio.sensorPing?.(pos);
        break;
      case 'decoy':
        this.decoys.push({ pos, mesh: this._keepMesh(p), t: 0, duration: def.duration, next: 0.1, owner: p.owner, radius: def.radius });
        break;
      default: break;
    }
  }

  // Leaves a detonated device in the world (sensor / decoy keep working where they landed).
  _keepMesh(p) {
    const m = buildGrenadeModel(p.type);
    m.position.copy(p.mesh.position);
    m.quaternion.copy(p.mesh.quaternion);
    this.group.add(m);
    return m;
  }

  // Damage + visuals for blasts. Walls block the blast (line of sight to the target's chest).
  _explode(pos, radius, damage, owner, name, direct = null) {
    const g = this.game;
    const hits = [];
    for (const c of g.getCombatants()) {
      if (!c.alive) continue;
      c.getAimPoint(_p, 'body');
      const d = Math.hypot(_p.x - pos.x, _p.y - pos.y, _p.z - pos.z);
      if (d > radius && c !== direct) continue;
      if (c !== direct && !this.collision.lineClear(pos.x, pos.y + 0.25, pos.z, _p.x, _p.y, _p.z)) continue;
      const f = c === direct ? 1 : Math.max(0, 1 - d / radius);
      const raw = damage * (0.25 + 0.75 * f * f);
      const res = g.dealDamage(c, raw, { attacker: owner, part: 'body', armorRatio: 0.5, weaponId: 'explosive', weaponName: name, direction: { x: _p.x - pos.x, y: 0, z: _p.z - pos.z } });
      hits.push({ target: c, dealt: res.dealt, killed: res.killed });
      if (c.ai && c.ai.onDamaged) c.ai.onDamaged(owner);
    }
    // Visuals: flash, fireball, smoke, sparks, light, camera shake, sound
    this._flashSprite(pos, radius * 0.9, 0.12);
    for (let k = 0; k < 8; k++) this._puff(_v.set(pos.x + (Math.random() - 0.5) * 1.2, pos.y + 0.3 + Math.random() * 0.8, pos.z + (Math.random() - 0.5) * 1.2), 0xff9a40, 1.4 + Math.random(), 0.35, true);
    for (let k = 0; k < 12; k++) this._puff(_v.set(pos.x + (Math.random() - 0.5) * 2, pos.y + 0.5 + Math.random() * 1.5, pos.z + (Math.random() - 0.5) * 2), 0x4a4643, 2 + Math.random() * 1.5, 2.6, false, 0.9);
    g.effects.burst?.(pos, 40, 9, { r: 1, g: 0.75, b: 0.4 });
    g.effects.lightFlash?.(pos, 30, 0.18, 0xffb060);
    g.effects.addDecal({ x: pos.x, y: pos.y + 0.02, z: pos.z }, { x: 0, y: 1, z: 0 }, 6);
    g.audio.explosion?.(pos);
    g.enemies.noise(pos, 70, owner);
    g.shake?.(pos, radius * 2.5, 0.6);
    this.explosions.push({ pos, hits, time: this.time });
    return hits;
  }

  _flash(pos, def, owner) {
    const g = this.game;
    let affected = 0;
    for (const bot of g.enemies.bots) {
      if (!bot.alive || !bot.ai || (owner && bot.team === owner.team)) continue;
      bot.getEyePosition(_p);
      const d = Math.hypot(_p.x - pos.x, _p.y - pos.y, _p.z - pos.z);
      if (d > def.radius || !this.collision.lineClear(pos.x, pos.y + 0.2, pos.z, _p.x, _p.y, _p.z)) continue;
      // Facing the burst = full effect, back turned = partial.
      const yawTo = Math.atan2(-(pos.x - _p.x), -(pos.z - _p.z));
      let dy = yawTo - bot.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      const facing = Math.abs(dy) < 1.2 ? 1 : 0.45;
      bot.ai.blind?.(def.duration * facing * (1 - (d / def.radius) * 0.5));
      affected++;
    }
    // The player is affected too when looking at it.
    const p = g.player;
    if (p.alive) {
      p.getEyePosition(_p);
      const d = Math.hypot(_p.x - pos.x, _p.y - pos.y, _p.z - pos.z);
      if (d < def.radius && this.collision.lineClear(pos.x, pos.y + 0.2, pos.z, _p.x, _p.y, _p.z)) {
        g.camera.getWorldDirection(_v);
        _a.set(pos.x - _p.x, pos.y - _p.y, pos.z - _p.z).normalize();
        const look = Math.max(0.25, _v.dot(_a));
        g.hud.flashbang?.(look * (1 - d / def.radius), def.duration * look);
      }
    }
    this._flashSprite(pos, 7, 0.25, 0xffffff);
    g.effects.lightFlash?.(pos, 60, 0.12, 0xffffff);
    g.audio.flashBang?.(pos);
    g.enemies.noise(pos, 50, owner);
    this.lastFlashAffected = affected;
  }

  _stun(pos, def, owner) {
    const g = this.game;
    let affected = 0;
    for (const bot of g.enemies.bots) {
      if (!bot.alive || !bot.ai || (owner && bot.team === owner.team)) continue;
      bot.getEyePosition(_p);
      const d = Math.hypot(_p.x - pos.x, _p.z - pos.z);
      if (d > def.radius || !this.collision.lineClear(pos.x, pos.y + 0.2, pos.z, _p.x, _p.y, _p.z)) continue;
      bot.ai.stun?.(def.duration, def.slow);
      affected++;
    }
    this._ring(pos, def.radius, 0xffc060, 0.5);
    this._flashSprite(pos, 3, 0.1, 0xffd080);
    g.audio.stunPulse?.(pos);
    g.enemies.noise(pos, 40, owner);
    this.lastStunAffected = affected;
  }

  _emp(pos, def, big) {
    const g = this.game;
    const r = def.radius;
    let botsHit = 0;
    for (const bot of g.enemies.bots) {
      if (!bot.alive || !bot.ai) continue;
      if (Math.hypot(bot.body.pos.x - pos.x, bot.body.pos.z - pos.z) < r) { bot.ai.emp?.(def.duration); botsHit++; }
    }
    const cams = g.surveillance ? g.surveillance.emp(pos, r, def.duration) : 0;
    if (g.equipment) g.equipment.empHit(pos, r, def.duration * 0.4);
    this._ring(pos, r, 0x60d8ff, big ? 1.2 : 0.7);
    g.effects.burst?.(pos, big ? 60 : 30, 6, { r: 0.4, g: 0.85, b: 1 });
    g.effects.lightFlash?.(pos, 25, 0.25, 0x60d8ff);
    g.audio.empZap?.(pos, big);
    this.lastEmp = { bots: botsHit, cameras: cams };
  }

  // ------------------------------------------------------------------ smoke
  _spawnSmoke(pos, def) {
    tex();
    const sprites = [];
    for (let k = 0; k < 26; k++) {
      const s = sprite(SOFT, 0xc9c6c0, false, 0);
      const a = Math.random() * Math.PI * 2, r = Math.random() * def.radius * 0.75;
      s.userData = { off: new THREE.Vector3(Math.cos(a) * r, 0.4 + Math.random() * 2.6, Math.sin(a) * r), size: 2.8 + Math.random() * 2.2, drift: (Math.random() - 0.5) * 0.3 };
      s.position.copy(pos);
      this.group.add(s);
      sprites.push(s);
    }
    this.smokes.push({ pos: pos.clone(), radius: def.radius, t: 0, duration: def.duration, sprites });
  }

  smokeDensity(s) {
    const grow = Math.min(1, s.t / 2.2);
    const fade = Math.min(1, Math.max(0, (s.duration - s.t) / 4));
    return grow * fade;
  }

  _updateSmokes(dt) {
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t += dt;
      const dens = this.smokeDensity(s);
      const grow = Math.min(1, s.t / 2.2);
      for (const sp of s.sprites) {
        const u = sp.userData;
        sp.position.set(s.pos.x + u.off.x * (0.3 + grow * 0.7) + Math.sin(s.t * 0.3 + u.drift * 10) * 0.3, s.pos.y + u.off.y * (0.4 + grow * 0.6), s.pos.z + u.off.z * (0.3 + grow * 0.7));
        sp.scale.setScalar(u.size * (0.4 + grow * 0.6));
        sp.material.opacity = 0.62 * dens;
        sp.material.rotation += u.drift * dt;
      }
      if (s.t >= s.duration) { for (const sp of s.sprites) { this.group.remove(sp); sp.material.dispose(); } this.smokes.splice(i, 1); }
    }
  }

  // True if the segment a→b passes through dense smoke (blocks vision for bots, cameras and trackers).
  visionBlocked(a, b) {
    for (const s of this.smokes) {
      if (this.smokeDensity(s) < 0.45) continue;
      _p.x = s.pos.x; _p.y = s.pos.y + 1.4; _p.z = s.pos.z;
      if (segmentPointDistance(a, b, _p) < s.radius * 0.85) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ fire
  _spawnFire(pos, def, owner) {
    tex();
    const flames = [];
    for (let k = 0; k < 16; k++) {
      const s = sprite(FLASH, 0xff7a22, true, 0.9);
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * def.radius * 0.85;
      s.userData = { x: Math.cos(a) * r, z: Math.sin(a) * r, ph: Math.random() * 6, size: 0.8 + Math.random() * 0.9 };
      this.group.add(s);
      flames.push(s);
    }
    this.fires.push({ pos: pos.clone(), radius: def.radius, t: 0, duration: def.duration, dps: def.dps, flames, tick: 0, owner, name: def.name });
    this.game.audio.fireIgnite?.(pos);
  }

  insideFire(pos) {
    for (const f of this.fires) if (Math.hypot(pos.x - f.pos.x, pos.z - f.pos.z) < f.radius && Math.abs(pos.y - f.pos.y) < 2) return f;
    return null;
  }

  _updateFires(dt) {
    const g = this.game;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt;
      const life = Math.min(1, (f.duration - f.t) / 1.5);
      for (const s of f.flames) {
        const u = s.userData;
        const fl = 0.75 + Math.sin(f.t * 11 + u.ph) * 0.2 + Math.sin(f.t * 23 + u.ph * 2) * 0.1;
        s.position.set(f.pos.x + u.x, f.pos.y + 0.35 * u.size * fl, f.pos.z + u.z);
        s.scale.set(u.size * fl, u.size * 1.5 * fl, 1);
        s.material.opacity = 0.85 * life;
      }
      if (Math.random() < 0.5) g.effects.burst?.(_v.set(f.pos.x + (Math.random() - 0.5) * f.radius, f.pos.y + 0.2, f.pos.z + (Math.random() - 0.5) * f.radius), 1, 2, { r: 1, g: 0.55, b: 0.2 });
      f.tick -= dt;
      if (f.tick <= 0) {
        f.tick = 0.5;
        g.effects.lightFlash?.(f.pos, 10 * life, 0.55, 0xff8030);
        for (const c of g.getCombatants()) {
          if (!c.alive) continue;
          if (Math.hypot(c.body.pos.x - f.pos.x, c.body.pos.z - f.pos.z) < f.radius && Math.abs(c.body.pos.y - f.pos.y) < 2) {
            g.dealDamage(c, f.dps * 0.5, { attacker: f.owner, part: 'legs', armorRatio: 1, weaponId: 'fire', weaponName: f.name });
          }
        }
      }
      if (f.t >= f.duration) { for (const s of f.flames) { this.group.remove(s); s.material.dispose(); } this.fires.splice(i, 1); }
    }
  }

  // ------------------------------------------------------------------ sensor / decoy
  _updateSensors(dt) {
    const g = this.game;
    for (let i = this.sensors.length - 1; i >= 0; i--) {
      const s = this.sensors[i];
      s.t += dt;
      s.next -= dt;
      const led = s.mesh.userData.parts && s.mesh.userData.parts.led;
      if (led) led.visible = (s.t * 2) % 1 < 0.5;
      if (s.next <= 0) {
        s.next = 1;
        let n = 0;
        for (const bot of g.enemies.bots) {
          if (!bot.alive || (s.owner && bot.team === s.owner.team)) continue;
          if (Math.hypot(bot.body.pos.x - s.pos.x, bot.body.pos.z - s.pos.z) < s.radius) { this.reveal(bot, 1.6); n++; }
        }
        this._ring(s.pos, s.radius, 0xff4040, 0.9, 0.25);
        if (n) g.audio.sensorPing?.(s.pos);
        s.lastCount = n;
      }
      if (s.t >= s.duration) { this.group.remove(s.mesh); this.sensors.splice(i, 1); }
    }
  }

  // Mark a hostile as revealed on the HUD (and as a confirmed contact for the mission tracker).
  reveal(bot, seconds) {
    this.revealed.set(bot, Math.max(this.revealed.get(bot) || 0, this.time + seconds));
    const m = this.game.mission;
    if (m && m.active && m.tracker && m.tracker.reveal) m.tracker.reveal(bot);
  }

  isRevealed(bot) {
    return (this.revealed.get(bot) || 0) > this.time;
  }

  _updateDecoys(dt) {
    const g = this.game;
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i];
      d.t += dt;
      d.next -= dt;
      if (d.next <= 0 && d.t < d.duration) {
        // Fake bursts of gunfire: sounds + noise events that pull enemies in to investigate.
        const burst = 1 + Math.floor(Math.random() * 4);
        for (let k = 0; k < burst; k++) setTimeout(() => g.audio.gunshot('rifle', d.pos, 0.8), k * 95);
        g.enemies.noise(d.pos, d.radius, d.owner);
        d.next = 0.5 + Math.random() * 1.1;
        d.pulses = (d.pulses || 0) + 1;
      }
      const led = d.mesh.userData.parts && d.mesh.userData.parts.led;
      if (led) led.visible = d.next < 0.15;
      if (d.t >= d.duration + 1) { this.group.remove(d.mesh); this.decoys.splice(i, 1); }
    }
  }

  // ------------------------------------------------------------------ visuals helpers
  _puff(pos, color, size, life, additive, opacity = 0.8) {
    tex();
    const s = sprite(additive ? FLASH : SOFT, color, additive, opacity);
    s.position.copy(pos);
    s.scale.setScalar(size * 0.5);
    s.userData = { life, max: life, size, opacity, rise: additive ? 0.5 : 0.8 };
    this.group.add(s);
    this.pulses.push({ sprite: s });
  }

  _flashSprite(pos, size, life, color = 0xffd9a0) {
    tex();
    const s = sprite(FLASH, color, true, 1);
    s.position.set(pos.x, pos.y + 0.4, pos.z);
    s.scale.setScalar(size);
    s.userData = { life, max: life, size, opacity: 1, rise: 0, flash: true };
    this.group.add(s);
    this.pulses.push({ sprite: s });
  }

  _ring(pos, radius, color, life, opacity = 0.6) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, pos.y + 0.08, pos.z);
    m.userData = { life, max: life, radius, opacity, ring: true };
    this.group.add(m);
    this.pulses.push({ sprite: m });
  }

  _updateVisuals(dt) {
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const s = this.pulses[i].sprite;
      const u = s.userData;
      u.life -= dt;
      const k = Math.max(0, u.life / u.max);
      if (u.ring) {
        const r = u.radius * (1 - k * k);
        s.scale.set(r, r, r);
        s.material.opacity = u.opacity * k;
      } else if (u.flash) {
        s.material.opacity = k;
        s.scale.setScalar(u.size * (1.4 - k * 0.4));
      } else {
        s.position.y += u.rise * dt;
        s.scale.setScalar(u.size * (0.5 + (1 - k) * 0.8));
        s.material.opacity = u.opacity * k;
      }
      if (u.life <= 0) {
        this.group.remove(s);
        s.material.dispose();
        if (s.geometry && u.ring) s.geometry.dispose();
        this.pulses.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.items) this.group.remove(p.mesh);
    for (const s of this.smokes) for (const sp of s.sprites) this.group.remove(sp);
    for (const f of this.fires) for (const sp of f.flames) this.group.remove(sp);
    for (const s of this.sensors) this.group.remove(s.mesh);
    for (const d of this.decoys) this.group.remove(d.mesh);
    for (const p of this.pulses) this.group.remove(p.sprite);
    this.items = []; this.smokes = []; this.fires = []; this.sensors = []; this.decoys = []; this.pulses = [];
    this.revealed.clear();
  }
}
