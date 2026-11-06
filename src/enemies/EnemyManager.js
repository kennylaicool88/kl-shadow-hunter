// Spawns and updates bots, resolves bot gunfire, and relays sounds/damage to their AI.
import * as THREE from 'three';
import { Enemy } from './Enemy.js';
import { EnemyAI, DIFFICULTY } from './EnemyAI.js';
import { NavGraph } from './NavGraph.js';
import { HIT_MULTIPLIER, rangeFalloff } from '../game/combat.js';

const NAMES = {
  B: ['Viper', 'Hawk', 'Raven', 'Cobra', 'Jackal', 'Wolf', 'Falcon', 'Mamba', 'Lynx', 'Bison'],
  A: ['Delta', 'Echo', 'Kilo', 'Mike', 'Oscar', 'Romeo', 'Sierra', 'Tango', 'Victor'],
};

// Enemy classes: weighted mix per difficulty, weapon pools and typical attachments.
const CLASS_MIX = {
  easy: [['rifleman', 5], ['recon', 3], ['heavy', 1], ['sniper', 1]],
  normal: [['rifleman', 5], ['recon', 2], ['heavy', 2], ['sniper', 1], ['elite', 1]],
  hard: [['rifleman', 3], ['recon', 2], ['heavy', 2], ['sniper', 2], ['elite', 3]],
};
export const CLASS_WEAPONS = {
  rifleman: ['rifle', 'ar_416', 'ar_ak12', 'ar_scarl', 'ar_bren', 'ar_mcx', 'ar_ak15'],
  heavy: ['hv_m249', 'hv_minimi', 'hv_m240', 'sg_saiga', 'sg_m4'],
  sniper: ['sn_bolt', 'sn_trg', 'sn_axmc', 'dmr_svd', 'dmr_sr25', 'sniper'],
  recon: ['smg_mp5', 'smg_mp7', 'smg_p90', 'smg_vector', 'smg_mpx', 'smg_apc9'],
  elite: ['ar_spear', 'ar_scarh', 'ar_416', 'dmr_417', 'ar_x95'],
};
const CLASS_ATTACH = {
  rifleman: () => (Math.random() < 0.5 ? { optic: 'reddot' } : {}),
  heavy: () => (Math.random() < 0.5 ? { optic: 'holo' } : {}),
  sniper: () => ({}),
  recon: () => ({ optic: 'reddot', ...(Math.random() < 0.5 ? { muzzle: 'suppressor' } : {}) }),
  elite: () => ({ optic: Math.random() < 0.5 ? 'holo' : 'x2', muzzle: 'suppressor', laser: 'laser', under: 'foregrip' }),
};
// Mission data still names a weapon per hostile; it now maps to a class.
const MISSION_CLASS = { rifle: 'rifleman', shotgun: 'heavy', pistol: 'recon', sniper: 'sniper' };
const pick = (list) => list[Math.floor(Math.random() * list.length)];
export function classLoadout(cls) {
  return { weapon: pick(CLASS_WEAPONS[cls] || CLASS_WEAPONS.rifleman), attachments: (CLASS_ATTACH[cls] || CLASS_ATTACH.rifleman)() };
}

// Strategic positions [x, y, z] grouped into routes through the map.
const MID_POINTS = {
  west: [[-34, 0, -12], [-34, 0, 4], [-34, 0, 14]],
  westYard: [[-18, 0, -14], [-19.5, 2.4, 0], [-14, 0, 12]],
  center: [[0, 0, -16], [-4, 0, -2], [4, 0, 2], [0, 0, 16]],
  eastYard: [[18, 0, -12], [20, 0, 2], [18, 0, 14]],
  east: [[34, 0, -18], [36, 3, 0], [34, 0, 18]],
};

const _origin = new THREE.Vector3();
const _end = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _listener = { x: 0, y: 0, z: 0 };
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _shot = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

function pickWeighted(list) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [id, w] of list) { if ((r -= w) <= 0) return id; }
  return list[0][0];
}

export class EnemyManager {
  /**
   * game: { scene, collision, mapData, effects, audio, getCombatants(), dealDamage(target, raw, info), getListener() }
   */
  constructor(game) {
    this.game = game;
    this.navCache = new Map();
    this.bots = [];
    this.difficulty = 'normal';
    this.missionLevel = null; // level data when running a mission (zone patrols instead of routes)
    this.aiWorld = {
      collision: this.collision,
      nav: this.nav,
      getEnemies: (bot) => this.game.getCombatants().filter((c) => c.alive && c.team !== bot.team),
      fire: (bot, origin, dir, spread) => this._botFire(bot, origin, dir, spread),
      playFootstep: (bot) => this._footstep(bot),
      voice: (bot, kind) => this._voice(bot, kind),
      goalsFor: (bot) => this._goalsFor(bot),
      visionBlocked: (a, b) => !!(this.game.throwables && this.game.throwables.visionBlocked(a, b)),
      hazardAt: (pos) => (this.game.throwables ? this.game.throwables.insideFire(pos) : null),
    };
    this.setLevel(game.collision, game.mapData);
  }

  setAssets(assets) {
    this.assets = assets;
    Enemy.assets = assets;
  }

  // Point the bots at a new level's collision and navigation graph (graphs are cached per level).
  setLevel(collision, mapData) {
    for (const b of this.bots) b.dispose();
    this.bots = [];
    this.collision = collision;
    const key = mapData.id || 'default';
    if (!this.navCache.has(key)) this.navCache.set(key, new NavGraph(collision, mapData, mapData.navSpacing || 2));
    this.nav = this.navCache.get(key);
    this.aiWorld.collision = collision;
    this.aiWorld.nav = this.nav;
    this.missionLevel = null;
  }

  // Mission roster: hostiles placed by zone; they patrol their zone and never respawn.
  setupMission(level, difficulty) {
    for (const b of this.bots) b.dispose();
    this.bots = [];
    this.difficulty = difficulty;
    this.missionLevel = level;
    const order = { easy: 0, normal: 1, hard: 2 };
    const diff = DIFFICULTY[difficulty];
    let n = 0;
    for (const h of level.hostiles) {
      if (h.minDifficulty && order[h.minDifficulty] > order[difficulty]) continue;
      this._spawnMissionBot(h, `${NAMES.B[n % NAMES.B.length]}${n >= NAMES.B.length ? ' 2' : ''}`, diff);
      n++;
    }
  }

  _spawnMissionBot(h, name, diff = DIFFICULTY[this.difficulty]) {
    const cls = h.cls || MISSION_CLASS[h.weapon] || 'rifleman';
    const lo = classLoadout(cls);
    const bot = new Enemy(name, 'B', lo.weapon, this.game.scene, { cls, attachments: lo.attachments });
    bot.ai = new EnemyAI(bot, this.aiWorld, this.difficulty);
    bot.onDamaged = (b, dealt, info) => b.ai.onDamaged(info.attacker);
    bot.zone = h.zone;
    bot.courier = !!h.courier;
    bot.spawn(h.pos, Math.random() * Math.PI * 2, diff.armor);
    bot.ai.reset();
    bot.ai.frozen = false;
    this.bots.push(bot);
    return bot;
  }

  // Extra hostiles when the enemy alert level is high.
  spawnReinforcement(pos, zone) {
    const n = this.bots.length;
    const bot = this._spawnMissionBot({ pos, zone, cls: Math.random() < 0.6 ? 'rifleman' : 'elite' }, `${NAMES.B[n % NAMES.B.length]} R`);
    return bot;
  }

  // Rebuild the bot roster for a new match.
  setup({ difficulty, enemyCount, allyCount }) {
    for (const b of this.bots) b.dispose();
    this.bots = [];
    this.difficulty = difficulty;
    this.missionLevel = null;
    const make = (team, count) => {
      for (let i = 0; i < count; i++) {
        const name = NAMES[team][i % NAMES[team].length] + (i >= NAMES[team].length ? ` ${Math.floor(i / NAMES[team].length) + 1}` : '');
        const cls = team === 'B' ? pickWeighted(CLASS_MIX[difficulty] || CLASS_MIX.normal) : 'rifleman';
        const lo = classLoadout(cls);
        const bot = new Enemy(name, team, lo.weapon, this.game.scene, { cls, attachments: lo.attachments });
        bot.ai = new EnemyAI(bot, this.aiWorld, difficulty);
        bot.onDamaged = (b, dealt, info) => b.ai.onDamaged(info.attacker);
        this.bots.push(bot);
      }
    };
    make('B', enemyCount);
    make('A', allyCount);
  }

  // Place bots at spawn points for a new round. playerSpawnIndex reserves a slot for the player.
  spawnRound(mapData, roundNumber) {
    const used = { A: 1, B: 0 }; // index 0 of team A is the player's spawn
    const diff = DIFFICULTY[this.difficulty];
    for (const bot of this.bots) {
      const spawns = mapData.spawns[bot.team];
      const idx = used[bot.team]++ % spawns.length;
      const s = spawns[idx];
      // Survivors keep their gun; others get a fresh loadout each round.
      if (!bot.alive || roundNumber === 1) { const lo = classLoadout(bot.cls); bot.setWeapon(lo.weapon, lo.attachments); }
      bot.spawn([s[0] + (Math.random() - 0.5) * 0.6, s[1], s[2] + (Math.random() - 0.5) * 0.6], mapData.spawnYaw[bot.team], diff.armor);
      bot.ai.reset();
      bot.ai.goals = [];
    }
  }

  setFrozen(frozen) {
    for (const b of this.bots) b.ai.frozen = frozen;
  }

  _goalsFor(bot) {
    if (this.missionLevel && bot.zone) {
      // Mission: patrol a shuffled tour of the bot's own zone.
      const pts = [...(this.missionLevel.zones[bot.zone] || [])];
      for (let i = pts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pts[i], pts[j]] = [pts[j], pts[i]];
      }
      return pts;
    }
    // Each bot takes one route through the middle, then pushes the enemy spawn, then roams.
    const routes = Object.keys(MID_POINTS);
    const route = MID_POINTS[routes[Math.floor(Math.random() * routes.length)]];
    const towardEnemy = bot.team === 'B' ? [...route] : [...route].reverse();
    const pts = towardEnemy.filter(() => Math.random() < 0.8);
    const enemySpawn = this.game.mapData.spawns[bot.team === 'B' ? 'A' : 'B'];
    const s = enemySpawn[Math.floor(Math.random() * enemySpawn.length)];
    pts.push([s[0], 0, s[2]]);
    if (!pts.length) pts.push([0, 0, 0]);
    return pts;
  }

  update(dt) {
    for (const bot of this.bots) {
      if (bot.alive) bot.ai.update(dt);
      bot.updateModel(dt, bot.alive ? bot.ai.speed : 0);
    }
  }

  // A loud event (gunshot, footsteps) that bots of other teams may hear.
  noise(pos, radius, source) {
    for (const bot of this.bots) {
      if (!bot.alive || (source && bot.team === source.team)) continue;
      bot.ai.hear(pos, radius);
    }
  }

  aliveCount(team) {
    return this.bots.filter((b) => b.alive && b.team === team).length;
  }

  // ---------------------------------------------------------------- bot weapons
  _botFire(bot, eye, dir, spread) {
    const w = bot.weapon;
    const cfg = w.cfg;
    const diff = DIFFICULTY[this.difficulty];
    const pellets = cfg.pellets || 1;
    _origin.set(eye.x, eye.y, eye.z);
    bot.getMuzzle(_muzzle);
    const listener = this.game.getListener(_listener);
    const distToListener = Math.hypot(listener.x - eye.x, listener.z - eye.z);

    if (w.isMelee) {
      this._resolveShot(bot, _origin, dir, cfg.range, cfg.damage, cfg, diff, false);
      this.game.audio.knifeSwing(_origin);
      return;
    }
    _fwd.set(dir.x, dir.y, dir.z);
    _right.crossVectors(_fwd, _worldUp).normalize();
    _up.crossVectors(_right, _fwd).normalize();
    for (let i = 0; i < pellets; i++) {
      const cone = pellets > 1 ? cfg.pelletSpread + spread * 0.5 : spread;
      const a = Math.random() * Math.PI * 2;
      const r = Math.tan(cone) * Math.random();
      const d = _shot.copy(_fwd).addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
      const end = this._resolveShot(bot, _origin, d, cfg.maxRange, cfg.damage, cfg, diff, i === 0);
      if (i === 0 || Math.random() < 0.3) {
        if (Math.random() < (cfg.tracerChance ?? 0.3)) this.game.effects.addTracer(_muzzle, end, cfg.tracerColor);
      }
    }
    if (!cfg.suppressed) this.game.effects.worldMuzzleFlash(_muzzle, cfg.category === 'shotgun' ? 0.8 : 0.55);
    if (bot.rig) bot.rig.fire();
    if (distToListener < 160) this.game.audio.gunshot(cfg.sound, _origin, 1, cfg.suppressed);
    if (cfg.action === 'bolt') this.game.audio.boltCycle(_origin);
    this.noise(_origin, (cfg.noiseRadius || 45) * (cfg.noiseMul || 1), bot);
  }

  // Returns the end point of the shot.
  _resolveShot(bot, origin, dir, range, damage, cfg, diff, effects) {
    const wall = this.collision.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range);
    const limit = wall ? wall.dist : range;
    let best = null, bestT = null;
    for (const c of this.game.getCombatants()) {
      if (c === bot || !c.alive) continue;
      const h = c.hitTest(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, limit);
      if (h && (!best || h.dist < best.dist)) { best = h; bestT = c; }
    }
    if (bestT) {
      _end.copy(origin).addScaledVector(dir, best.dist);
      if (bestT.team !== bot.team) {
        const mult = cfg.melee ? 1 : HIT_MULTIPLIER[best.part];
        const raw = damage * mult * rangeFalloff(best.dist, cfg.range) * diff.damageScale;
        this.game.dealDamage(bestT, raw, {
          attacker: bot, part: best.part, armorRatio: cfg.armorRatio, weaponId: cfg.id, weaponName: cfg.name,
          direction: { x: dir.x, y: dir.y, z: dir.z },
        });
        // No blood on the local player: it would spawn inside the camera (the HUD damage flash covers it).
        if (!bestT.isPlayer) this.game.effects.blood(_end, dir, best.part === 'head');
      }
      return _end.clone();
    }
    if (wall) {
      _end.set(wall.point.x, wall.point.y, wall.point.z);
      if (effects) {
        this.game.effects.impact(wall.point, wall.normal, wall.solid.mat);
        const l = this.game.getListener(_listener);
        if (Math.hypot(l.x - wall.point.x, l.y - wall.point.y, l.z - wall.point.z) < 25) {
          this.game.audio.impact(wall.point, wall.solid.mat);
        }
      }
      return _end.clone();
    }
    return _origin.clone().addScaledVector(dir, range);
  }

  _footstep(bot) {
    const l = this.game.getListener(_listener);
    if (Math.hypot(l.x - bot.body.pos.x, l.z - bot.body.pos.z) < 28) {
      this.game.audio.footstep({ x: bot.body.pos.x, y: bot.body.pos.y, z: bot.body.pos.z }, true);
    }
  }

  _voice(bot, kind) {
    const l = this.game.getListener(_listener);
    if (Math.hypot(l.x - bot.body.pos.x, l.z - bot.body.pos.z) < 40) {
      this.game.audio.voice(kind, { x: bot.body.pos.x, y: bot.body.pos.y + 1.6, z: bot.body.pos.z });
    }
  }
}
