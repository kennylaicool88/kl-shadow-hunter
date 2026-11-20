// Bot decision making: a finite state machine driven by perception (vision + hearing + damage).
//
// States: idle → patrol → alert (reaction delay) → attack ⇄ chase → investigate → patrol
//         attack → cover (low health / reloading) → chase ;  any → dead
const DEG = Math.PI / 180;

export const DIFFICULTY = {
  easy: {
    reaction: 0.8, aimError: 4.5, aimSpeed: 2.6, fov: 100, viewDist: 45, headshot: 0.05,
    burst: [2, 3], burstPause: [0.55, 1.0], strafe: 0.15, armor: 0, hearing: 0.6, focusTime: 1.4,
    damageScale: 0.55, coverChance: 0.2, runSpeed: 4.0,
  },
  normal: {
    reaction: 0.45, aimError: 2.4, aimSpeed: 4.5, fov: 110, viewDist: 60, headshot: 0.15,
    burst: [3, 5], burstPause: [0.3, 0.6], strafe: 0.5, armor: 50, hearing: 1, focusTime: 0.9,
    damageScale: 0.8, coverChance: 0.5, runSpeed: 4.5,
  },
  hard: {
    reaction: 0.25, aimError: 1.3, aimSpeed: 7.5, fov: 120, viewDist: 85, headshot: 0.3,
    burst: [4, 8], burstPause: [0.18, 0.4], strafe: 0.85, armor: 100, hearing: 1.3, focusTime: 0.5,
    damageScale: 1.0, coverChance: 0.75, runSpeed: 4.9,
  },
};

// Enemy classes tune the difficulty profile (multipliers) – see EnemyManager for their weapons and looks.
export const CLASS_MODS = {
  rifleman: {},
  heavy: { runSpeed: 0.8, aimSpeed: 0.85, coverChance: 0.6, strafe: 0.5 },
  sniper: { viewDist: 1.6, aimError: 0.7, reaction: 1.1, strafe: 0, fov: 0.9 },
  recon: { runSpeed: 1.15, hearing: 1.35, reaction: 0.9, strafe: 1.2 },
  elite: { aimError: 0.7, reaction: 0.8, aimSpeed: 1.25, headshot: 1.6, coverChance: 1.2 },
};

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const _eye = { x: 0, y: 0, z: 0 };
const _tp = { x: 0, y: 0, z: 0 };
const _dir = { x: 0, y: 0, z: 0 };

export class EnemyAI {
  /**
   * world: { collision, nav, getEnemies(bot), fire(bot, origin, dir), playFootstep(bot), voice(bot, kind), goalsFor(bot) }
   */
  constructor(bot, world, difficulty) {
    this.bot = bot;
    this.world = world;
    const base = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    const mods = CLASS_MODS[bot.cls] || {};
    this.diff = { ...base };
    for (const [k, v] of Object.entries(mods)) this.diff[k] = base[k] * v;
    this.reset();
  }

  reset() {
    this.state = 'idle';
    this.stateTime = 0;
    this.target = null;
    this.targetVisible = false;
    this.lastSeen = { x: 0, y: 0, z: 0 };
    this.lastSeenTime = -99;
    this.time = 0;
    this.path = null;
    this.pathIdx = 0;
    this.goal = null;
    this.goals = [];
    this.perceptionTimer = Math.random() * 0.15;
    this.reactionTimer = 0;
    this.aimYaw = this.bot.yaw;
    this.aimPitch = 0;
    this.errYaw = 0;
    this.errPitch = 0;
    this.focus = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.aimHead = false;
    this.strafeDir = 0;
    this.strafeTimer = 0;
    this.stuckTimer = 0;
    this.stuckCount = 0;
    this.lastPos = { x: this.bot.body.pos.x, z: this.bot.body.pos.z };
    this.investigatePos = null;
    this.lookTimer = 0;
    this.lookYaw = this.bot.yaw;
    this.coverTimer = 0;
    this.stepDist = 0;
    this.speed = 0;
    this.frozen = true;
    this.blindTime = 0; // flashbang
    this.stunTime = 0; // stun grenade
    this.stunSlow = 1;
    this.empTime = 0; // optics / radio knocked out
  }

  // ---------------------------------------------------------------- equipment effects
  blind(t) {
    if (!this.bot.alive) return;
    this.blindTime = Math.max(this.blindTime, t);
    this.targetVisible = false;
    this.wanderYaw = this.bot.yaw + rand(-2, 2);
    if (Math.random() < 0.7) this.world.voice(this.bot, 'hurt');
  }

  stun(t, slow = 0.4) {
    if (!this.bot.alive) return;
    this.stunTime = Math.max(this.stunTime, t);
    this.stunSlow = slow;
  }

  emp(t) {
    this.empTime = Math.max(this.empTime, t);
  }

  get disoriented() { return this.blindTime > 0; }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
    if (s !== 'attack') this.strafeDir = 0;
  }

  // ---------------------------------------------------------------- perception
  _canSee(t) {
    const b = this.bot;
    b.getEyePosition(_eye);
    const dx = t.body.pos.x - _eye.x, dz = t.body.pos.z - _eye.z;
    const dist = Math.hypot(dx, dz);
    if (dist > this.diff.viewDist) return false;
    const engaged = this.time - this.lastSeenTime < 1.5 && this.target === t;
    if (!engaged && dist > 3.5) {
      const yawTo = Math.atan2(-dx, -dz);
      if (Math.abs(angleDiff(yawTo, b.yaw)) > (this.diff.fov * DEG) / 2) return false;
    }
    // Check chest then head so targets behind low cover can still be spotted.
    const col = this.world.collision;
    t.getAimPoint(_tp, 'body');
    const smoke = this.world.visionBlocked;
    if (col.lineClear(_eye.x, _eye.y, _eye.z, _tp.x, _tp.y, _tp.z) && !(smoke && smoke(_eye, _tp))) return 'body';
    t.getAimPoint(_tp, 'head');
    if (col.lineClear(_eye.x, _eye.y, _eye.z, _tp.x, _tp.y, _tp.z) && !(smoke && smoke(_eye, _tp))) return 'head';
    return false;
  }

  _perceive() {
    if (this.blindTime > 0) { this.targetVisible = false; return; }
    let best = null, bestD = Infinity, bestPart = null;
    for (const t of this.world.getEnemies(this.bot)) {
      const d = Math.hypot(t.body.pos.x - this.bot.body.pos.x, t.body.pos.z - this.bot.body.pos.z);
      if (d >= bestD) continue;
      const part = this._canSee(t);
      if (part) { best = t; bestD = d; bestPart = part; }
    }
    this.targetVisible = !!best;
    this.headOnly = bestPart === 'head'; // chest is covered, only the head shows
    if (best) {
      if (best !== this.target) this.focus = 0;
      this.target = best;
      this.lastSeen.x = best.body.pos.x;
      this.lastSeen.y = best.body.pos.y;
      this.lastSeen.z = best.body.pos.z;
      this.lastSeenTime = this.time;
    }
  }

  // Sound or damage reveals a position.
  hear(pos, radius) {
    if (!this.bot.alive || this.frozen) return;
    const d = Math.hypot(pos.x - this.bot.body.pos.x, pos.z - this.bot.body.pos.z);
    if (d > radius * this.diff.hearing * (this.empTime > 0 ? 0.5 : 1)) return; // EMP: radio relay down
    if (this.state === 'attack' || this.state === 'alert' || this.state === 'cover') return;
    this.investigatePos = { x: pos.x, y: pos.y, z: pos.z };
    if (this.state !== 'chase') {
      this._goTo(this.investigatePos);
      this.setState('investigate');
    }
  }

  // A round cracked past (near miss): aim degrades while suppressed, and a bot under sustained fire
  // breaks for cover. Unaware bots turn toward the shooter.
  suppress(attacker) {
    if (!this.bot.alive || this.frozen) return;
    this.suppressTime = Math.min(3, (this.suppressTime || 0) + 0.7);
    if (this.state === 'patrol' || this.state === 'investigate' || this.state === 'idle') {
      this.onDamaged(attacker);
      return;
    }
    if (this.state === 'attack' && this.suppressTime > 1.3 && Math.random() < this.diff.coverChance) this._findCover();
  }

  onDamaged(attacker) {
    if (!attacker || !attacker.body) return;
    this.lastSeen.x = attacker.body.pos.x;
    this.lastSeen.y = attacker.body.pos.y;
    this.lastSeen.z = attacker.body.pos.z;
    // Snap attention toward the attacker.
    this.lookYaw = Math.atan2(-(attacker.body.pos.x - this.bot.body.pos.x), -(attacker.body.pos.z - this.bot.body.pos.z));
    if (this.state === 'patrol' || this.state === 'investigate' || this.state === 'idle') {
      this.target = attacker;
      this.lastSeenTime = this.time - 0.5;
      this.investigatePos = { ...this.lastSeen };
      this.setState('investigate');
      this._goTo(this.investigatePos);
      this.reactionTimer = this.diff.reaction * 0.5;
    }
    if (Math.random() < 0.5) this.world.voice(this.bot, 'hurt');
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const bot = this.bot;
    if (!bot.alive) { this.setState('dead'); return; }
    this.time += dt;
    this.stateTime += dt;
    const ev = bot.weapon.update(dt);
    if (ev === 'reloaded' && this.state === 'cover') this.coverTimer = Math.min(this.coverTimer, 0.6);

    if (this.frozen) {
      this.setState('idle');
      this._move(dt, 0, 0, 0);
      return;
    }
    this.blindTime = Math.max(0, this.blindTime - dt);
    this.stunTime = Math.max(0, this.stunTime - dt);
    this.empTime = Math.max(0, this.empTime - dt);
    this.suppressTime = Math.max(0, (this.suppressTime || 0) - dt);
    // Burning ground: get out first.
    const fire = this.world.hazardAt && this.world.hazardAt(bot.body.pos);
    if (fire) {
      let dx = bot.body.pos.x - fire.pos.x, dz = bot.body.pos.z - fire.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      this._move(dt, dx / l, dz / l, this.diff.runSpeed);
      this._faceMovement(dt);
      return;
    }
    // Flashed: stagger around blindly, no shooting.
    if (this.blindTime > 0) {
      this.wanderYaw = (this.wanderYaw ?? bot.yaw) + rand(-3, 3) * dt;
      this._turnToward(dt, this.wanderYaw, 2);
      this._move(dt, -Math.sin(this.wanderYaw), -Math.cos(this.wanderYaw), 0.9);
      return;
    }

    this.perceptionTimer -= dt;
    if (this.perceptionTimer <= 0) {
      this.perceptionTimer = 0.12;
      this._perceive();
    }

    switch (this.state) {
      case 'idle':
        // Look before walking off, so an enemy standing in front is noticed immediately.
        this._perceive();
        if (this.targetVisible) { this._spotted(); break; }
        this._pickGoal();
        this.setState('patrol');
        break;
      case 'patrol': this._patrol(dt); break;
      case 'alert': this._alert(dt); break;
      case 'attack': this._attack(dt); break;
      case 'chase': this._chase(dt); break;
      case 'investigate': this._investigate(dt); break;
      case 'cover': this._cover(dt); break;
      default: break;
    }
    // Reload whenever empty (also mid-move).
    const w = bot.weapon;
    if (w.mag === 0 && !w.reloading && w.reserve > 0) w.startReload();
    if (w.mag === 0 && w.reserve === 0) w.reserve = w.cfg.magSize * 2; // bots never run fully dry
  }

  // ---------------------------------------------------------------- states
  _patrol(dt) {
    if (this.targetVisible) return this._spotted();
    if (!this.path || this.pathIdx >= this.path.length) this._pickGoal();
    this._followPath(dt, this.diff.runSpeed);
    this._faceMovement(dt);
  }

  _spotted() {
    const recentlyEngaged = this.time - this.lastSeenTime < 0.2 && this.stateTime < 0.01;
    this.reactionTimer = this.diff.reaction * rand(0.8, 1.3) * (recentlyEngaged ? 0.5 : 1);
    this.setState('alert');
    if (Math.random() < 0.6) this.world.voice(this.bot, 'alert');
    this._newAimError(1);
  }

  _alert(dt) {
    // Reacting: stop and turn toward the target, but don't shoot yet.
    this._move(dt, 0, 0, 0);
    this._aimAt(dt, false);
    this.reactionTimer -= dt;
    if (this.reactionTimer <= 0) {
      if (this.targetVisible) { this.setState('attack'); this.burstLeft = randInt(...this.diff.burst); }
      else { this._goTo(this.lastSeen); this.setState('chase'); }
    }
  }

  _attack(dt) {
    const bot = this.bot;
    const w = bot.weapon;
    if (!this.target || !this.target.alive) {
      this.target = null;
      this.investigatePos = { ...this.lastSeen };
      this._goTo(this.investigatePos);
      this.setState('investigate');
      return;
    }
    if (!this.targetVisible) {
      if (this.time - this.lastSeenTime > 0.7) {
        this._goTo(this.lastSeen);
        this.setState('chase');
      }
      this._move(dt, 0, 0, 0);
      this._aimAt(dt, false);
      return;
    }

    // Low health or empty magazine: try to break line of sight.
    const lowHp = bot.health < 40;
    if ((w.reloading || lowHp) && this.stateTime > 0.8 && Math.random() < this.diff.coverChance * dt * 3) {
      if (this._findCover()) return;
    }

    // Movement while fighting: strafe (harder bots), shotgunners close distance, snipers hold.
    const dist = Math.hypot(this.target.body.pos.x - bot.body.pos.x, this.target.body.pos.z - bot.body.pos.z);
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = rand(0.5, 1.3);
      this.strafeDir = Math.random() < this.diff.strafe && w.cfg.category !== 'sniper' ? (Math.random() < 0.5 ? -1 : 1) : 0;
    }
    const yaw = this.aimYaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let mx = 0, mz = 0, spd = 0;
    if (this.strafeDir !== 0) {
      mx = -fz * this.strafeDir; mz = fx * this.strafeDir;
      spd = 2.6;
    }
    if ((w.cfg.category === 'shotgun' || w.cfg.category === 'smg') && dist > (w.cfg.category === 'smg' ? 14 : 8)) { mx += fx; mz += fz; spd = this.diff.runSpeed * 0.8; }
    if (w.isMelee && dist > 1.4) { mx += fx; mz += fz; spd = this.diff.runSpeed; }
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    this._move(dt, mx, mz, spd);
    this._aimAt(dt, true);
    this._tryShoot(dt, dist);
  }

  _chase(dt) {
    if (this.targetVisible) return this._reacquire();
    if (!this.path || this.pathIdx >= this.path.length || this.stateTime > 12) {
      this.investigatePos = { ...this.lastSeen };
      this.lookTimer = 0;
      this.setState('investigate');
      this.path = null;
      return;
    }
    this._followPath(dt, this.diff.runSpeed);
    this._faceMovement(dt);
  }

  _investigate(dt) {
    if (this.targetVisible) return this._reacquire();
    if (this.path && this.pathIdx < this.path.length) {
      this._followPath(dt, this.diff.runSpeed * 0.75);
      this._faceMovement(dt);
      if (this.reactionTimer > 0) {
        this.reactionTimer -= dt;
        this._turnToward(dt, this.lookYaw, 6);
      }
      return;
    }
    // Arrived: look around for a while.
    this._move(dt, 0, 0, 0);
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      this.lookTimer = rand(0.7, 1.4);
      this.lookYaw = this.bot.yaw + rand(-2, 2);
    }
    this._turnToward(dt, this.lookYaw, 3);
    if (this.stateTime > 6) {
      this._pickGoal();
      this.setState('patrol');
    }
  }

  _cover(dt) {
    this.coverTimer -= dt;
    if (this.path && this.pathIdx < this.path.length) {
      this._followPath(dt, this.diff.runSpeed);
      this._faceMovement(dt);
    } else {
      this._move(dt, 0, 0, 0);
      this._turnToward(dt, Math.atan2(-(this.lastSeen.x - this.bot.body.pos.x), -(this.lastSeen.z - this.bot.body.pos.z)), 4);
    }
    // Opportunistic shots if the enemy walks into view while not reloading.
    if (this.targetVisible && !this.bot.weapon.reloading && this.stateTime > 0.4) return this._reacquire();
    if (this.coverTimer <= 0 && !this.bot.weapon.reloading) {
      // Re-peek the last known position.
      this._goTo(this.lastSeen);
      this.setState('chase');
    }
  }

  _reacquire() {
    const quick = this.time - this.lastSeenTime < 3;
    if (quick) {
      this.setState('attack');
      this.burstLeft = randInt(...this.diff.burst);
      this._newAimError(0.6);
    } else {
      this._spotted();
    }
  }

  // ---------------------------------------------------------------- helpers
  _pickGoal() {
    if (!this.goals.length) this.goals = this.world.goalsFor(this.bot);
    const g = this.goals.shift();
    if (g) this._goTo({ x: g[0], y: g[1], z: g[2] });
  }

  _goTo(pos) {
    const b = this.bot.body.pos;
    this.path = this.world.nav.findPath(b, pos);
    this.pathIdx = 0;
    this.goal = pos;
  }

  _findCover() {
    const bot = this.bot;
    const nav = this.world.nav;
    const threat = this.target || null;
    if (!threat) return false;
    threat.getEyePosition(_eye);
    let best = null, bestScore = Infinity;
    const col = this.world.collision;
    const bp = bot.body.pos;
    let checks = 0;
    for (const n of nav.nodes) {
      const d = Math.hypot(n.x - bp.x, n.z - bp.z);
      if (d < 2 || d > 13) continue;
      if (++checks > 80) break;
      if (col.lineClear(_eye.x, _eye.y, _eye.z, n.x, n.y + 1.5, n.z)) continue; // still exposed
      const td = Math.hypot(n.x - _eye.x, n.z - _eye.z);
      const score = d - td * 0.3;
      if (score < bestScore) { bestScore = score; best = n; }
    }
    if (!best) return false;
    this._goTo(best);
    this.coverTimer = rand(1.5, 3);
    this.setState('cover');
    if (!bot.weapon.reloading && bot.weapon.mag < bot.weapon.cfg.magSize * 0.5) bot.weapon.startReload();
    return true;
  }

  _newAimError(scale) {
    const e = this.diff.aimError * DEG * scale * 3;
    this.errYaw = rand(-e, e);
    this.errPitch = rand(-e, e) * 0.6;
    this.focus = 0;
  }

  // Smoothly rotate aim toward the target. Error shrinks as the bot "settles" its aim.
  _aimAt(dt, settle) {
    const bot = this.bot;
    if (!this.target) return;
    bot.getEyePosition(_eye);
    // Aim at the chest unless only the head is exposed or the bot is going for a headshot.
    this.target.getAimPoint(_tp, this.headOnly || this.aimHead ? 'head' : 'body');
    const dx = _tp.x - _eye.x, dy = _tp.y - _eye.y, dz = _tp.z - _eye.z;
    const horiz = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, horiz);
    if (settle) this.focus = Math.min(1, this.focus + dt / this.diff.focusTime);
    const errScale = (1 - this.focus * 0.75) * (this.empTime > 0 ? 1.8 : 1) * (this.stunTime > 0 ? 1.6 : 1) // EMP: optics dead
      * (1 + (this.suppressTime || 0) * 0.5); // rounds cracking past ruin a bot's aim
    const ty = wantYaw + this.errYaw * errScale;
    const tp = wantPitch + this.errPitch * errScale;
    const maxStep = this.diff.aimSpeed * dt * (this.stunTime > 0 ? 0.35 : 1);
    const dyaw = angleDiff(ty, this.aimYaw);
    this.aimYaw += Math.max(-maxStep, Math.min(maxStep, dyaw));
    const dp = tp - this.aimPitch;
    this.aimPitch += Math.max(-maxStep, Math.min(maxStep, dp));
    bot.yaw = this.aimYaw;
    bot.aimPitch = this.aimPitch;
    this.aimOnTarget = Math.abs(angleDiff(ty, this.aimYaw)) < 3 * DEG && Math.abs(tp - this.aimPitch) < 3 * DEG;
  }

  _tryShoot(dt, dist) {
    const w = this.bot.weapon;
    if (this.burstPause > 0) { this.burstPause -= dt; return; }
    if (!this.aimOnTarget || w.reloading) return;
    if (w.isMelee && dist > w.cfg.range) return;
    if (!w.isMelee && dist > w.cfg.maxRange * 0.8) return;
    if (!w.tryFire()) return;

    // Shot direction = aim + weapon inaccuracy (bots suffer movement spread too).
    const spread = w.isMelee ? 0 : w.getSpread({
      speed: this.speed, runSpeed: 5.4, grounded: true, crouching: false, scoped: w.cfg.category === 'sniper' && this.speed < 0.5,
    });
    const cp = Math.cos(this.aimPitch);
    _dir.x = -Math.sin(this.aimYaw) * cp;
    _dir.y = Math.sin(this.aimPitch);
    _dir.z = -Math.cos(this.aimYaw) * cp;
    this.bot.getEyePosition(_eye);
    this.world.fire(this.bot, _eye, _dir, spread);

    this.burstLeft--;
    if (this.burstLeft <= 0 || !w.cfg.auto) {
      this.burstLeft = randInt(...this.diff.burst);
      this.burstPause = w.cfg.auto ? rand(...this.diff.burstPause) : rand(0.05, 0.35) + w.cfg.fireInterval;
      this.aimHead = Math.random() < this.diff.headshot;
      // Re-roll a smaller aim error after each burst.
      this._newAimError(0.5);
      this.focus = 0.4;
    }
  }

  _followPath(dt, speed) {
    const bot = this.bot;
    const p = bot.body.pos;
    if (!this.path || this.pathIdx >= this.path.length) { this._move(dt, 0, 0, 0); return; }
    const wp = this.path[this.pathIdx];
    const dx = wp.x - p.x, dz = wp.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6 && Math.abs(wp.y - p.y) < 1) {
      this.pathIdx++;
      return;
    }
    this._move(dt, dx / d, dz / d, Math.min(speed, d * 4 + 1));

    // Stuck detection: repath if barely moving.
    this.stuckTimer += dt;
    if (this.stuckTimer > 1) {
      const moved = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);
      this.lastPos.x = p.x; this.lastPos.z = p.z;
      this.stuckTimer = 0;
      if (moved < 0.35) {
        this.stuckCount++;
        if (this.stuckCount > 2) {
          this.stuckCount = 0;
          this.path = null;
          this._pickGoal();
        } else if (this.goal) {
          // Nudge sideways then repath.
          bot.velocity.x += (Math.random() - 0.5) * 6;
          bot.velocity.z += (Math.random() - 0.5) * 6;
          this._goTo(this.goal);
        }
      } else {
        this.stuckCount = 0;
      }
    }
  }

  _move(dt, dx, dz, speed) {
    const bot = this.bot;
    const v = bot.velocity;
    const accel = bot.body.grounded ? 12 : 2;
    if (this.stunTime > 0) speed *= this.stunSlow;
    const tx = dx * speed, tz = dz * speed;
    v.x += (tx - v.x) * Math.min(1, accel * dt);
    v.z += (tz - v.z) * Math.min(1, accel * dt);
    v.y -= 20 * dt;
    const res = this.world.collision.moveBody(bot.body, v.x * dt, v.y * dt, v.z * dt, true);
    if (res.hitX) v.x = 0;
    if (res.hitZ) v.z = 0;
    if (bot.body.grounded && v.y < 0) v.y = 0;
    if (bot.body.pos.y < -10) { bot.body.pos.y = 1; v.y = 0; }
    this.speed = Math.hypot(v.x, v.z);
    if (bot.body.grounded && this.speed > 2.2) {
      this.stepDist += this.speed * dt;
      if (this.stepDist > 2.4) { this.stepDist = 0; this.world.playFootstep(bot); }
    }
  }

  _faceMovement(dt) {
    const v = this.bot.velocity;
    if (Math.hypot(v.x, v.z) < 0.5) return;
    this._turnToward(dt, Math.atan2(-v.x, -v.z), 8);
    this.bot.aimPitch *= 0.9;
    this.aimPitch = this.bot.aimPitch;
  }

  _turnToward(dt, yaw, rate) {
    const d = angleDiff(yaw, this.bot.yaw);
    const step = rate * dt;
    this.bot.yaw += Math.max(-step, Math.min(step, d));
    this.aimYaw = this.bot.yaw;
  }
}
