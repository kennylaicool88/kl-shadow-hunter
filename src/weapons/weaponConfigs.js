// Weapon definitions. Angles are in radians unless noted. Distances in metres.
// All values are fictional game-balance numbers (see arsenal.js).
//
// spread: cone half-angle of inaccuracy
//   base      – standing still, first shot
//   move      – added at full run speed (scaled by speed)
//   air       – added while airborne
//   perShot   – added per shot fired, decays at `recovery` rad/s
//   max       – cap on accumulated shot spread
//   crouch    – multiplier while crouched
// recoil: view punch per shot (degrees). pattern = horizontal drift for consecutive shots.
// action: 'auto' | 'semi' | 'burst' (selectable fire modes in `modes`), 'bolt', 'pump', 'single'.
import { ARSENAL, CATEGORIES, CLASS_LABEL } from './arsenal.js';

const DEG = Math.PI / 180;

const RIFLE_PATTERN = [0, 0, 0.1, 0.2, 0.3, 0.6, 0.9, 1.0, 0.8, 0.2, -0.6, -1.2, -1.3, -1.0, -0.4, 0.4, 1.0, 1.2, 0.8, 0, -0.8, -1.2, -1.0, -0.2, 0.6, 1.0, 0.8, 0.2, -0.4, -0.8];

export const WEAPONS = {
  knife: {
    id: 'knife',
    name: 'Combat Knife',
    slot: 'melee',
    category: 'melee',
    melee: true,
    damage: 40,
    heavyDamage: 75,
    fireInterval: 0.42,
    heavyInterval: 1.0,
    range: 1.8,
    armorRatio: 0.85,
    moveSpeed: 1.06,
    sound: 'knife',
    magSize: 0,
    reserveMax: 0,
  },
  pistol: {
    id: 'pistol',
    name: 'P-9 Sidearm',
    slot: 'secondary',
    damage: 30,
    pellets: 1,
    fireInterval: 0.15,
    auto: false,
    magSize: 12,
    reserveMax: 48,
    reloadTime: 2.0,
    armorRatio: 0.55,
    range: 25,
    maxRange: 120,
    moveSpeed: 1.0,
    spread: { base: 0.6 * DEG, move: 2.2 * DEG, air: 6 * DEG, perShot: 0.9 * DEG, max: 3.5 * DEG, recovery: 6 * DEG, crouch: 0.8 },
    recoil: { pitch: 1.6, yaw: 0.35, pattern: [0, 0.5, -0.4, 0.6, -0.6, 0.3], recover: 14 },
    sound: 'pistol',
    tracerChance: 0.3,
  },
  rifle: {
    id: 'rifle',
    name: 'AR-7 Carbine',
    slot: 'primary',
    damage: 32,
    pellets: 1,
    fireInterval: 0.1,
    auto: true,
    magSize: 30,
    reserveMax: 90,
    reloadTime: 2.4,
    armorRatio: 0.78,
    range: 45,
    maxRange: 200,
    moveSpeed: 0.92,
    spread: { base: 0.3 * DEG, move: 4.5 * DEG, air: 9 * DEG, perShot: 0.32 * DEG, max: 3.2 * DEG, recovery: 4.5 * DEG, crouch: 0.7 },
    // Climbs up, then drifts right, then snakes left – learnable spray.
    recoil: { pitch: 0.95, yaw: 0.55, recover: 9, pattern: RIFLE_PATTERN },
    sound: 'rifle',
    tracerChance: 0.5,
  },
  shotgun: {
    id: 'shotgun',
    name: 'M-12 Breacher',
    slot: 'primary',
    damage: 19,
    pellets: 9,
    pelletSpread: 3.6 * DEG,
    fireInterval: 0.88,
    auto: false,
    magSize: 7,
    reserveMax: 28,
    reloadTime: 0.5, // per shell
    reloadStart: 0.35,
    shellReload: true,
    armorRatio: 0.6,
    range: 9,
    maxRange: 40,
    moveSpeed: 0.92,
    spread: { base: 0.4 * DEG, move: 1.5 * DEG, air: 4 * DEG, perShot: 1.0 * DEG, max: 2 * DEG, recovery: 4 * DEG, crouch: 0.85 },
    recoil: { pitch: 4.2, yaw: 0.8, pattern: [0, 1, -1], recover: 10 },
    sound: 'shotgun',
    tracerChance: 0.35,
  },
  sniper: {
    id: 'sniper',
    name: 'LR-50 Marksman',
    slot: 'primary',
    damage: 115,
    pellets: 1,
    fireInterval: 1.45,
    auto: false,
    magSize: 5,
    reserveMax: 20,
    reloadTime: 3.0,
    armorRatio: 0.97,
    range: 200,
    maxRange: 300,
    moveSpeed: 0.84,
    scopedMoveSpeed: 0.6,
    zoomLevels: [80, 40, 15], // FOV multipliers: index 0 = unscoped (uses user FOV)
    unscopedSpread: 7 * DEG,
    spread: { base: 0.02 * DEG, move: 6 * DEG, air: 14 * DEG, perShot: 0, max: 0, recovery: 1, crouch: 0.6 },
    recoil: { pitch: 3.5, yaw: 0.3, pattern: [0], recover: 6 },
    sound: 'sniper',
    tracerChance: 1,
  },
};

// Mission-only designator: opens the Deep Strike targeting interface instead of firing bullets.
WEAPONS.uplink = {
  id: 'uplink',
  name: 'Deep Strike Uplink',
  slot: 'special',
  category: 'special',
  special: true,
  damage: 0,
  fireInterval: 0.4,
  range: 0,
  magSize: 0,
  reserveMax: 0,
  moveSpeed: 1.0,
  sound: 'none',
};

// ------------------------------------------------------------------ class templates for the arsenal
const TEMPLATES = {
  ar: { spread: [0.3, 4.5, 9, 0.32, 3.2, 4.5, 0.7], recoil: { pitch: 0.95, yaw: 0.55, recover: 9, pattern: RIFLE_PATTERN }, armorRatio: 0.78, sound: 'rifle', tracer: 0.5, noise: 45, ads: { zoom: 1.15, time: 0.2 } },
  smg: { spread: [0.45, 2.6, 7, 0.28, 2.8, 6, 0.8], recoil: { pitch: 0.6, yaw: 0.45, recover: 12, pattern: [0, 0.3, -0.3, 0.5, -0.5, 0.6, -0.4, 0.2, -0.2, 0.4] }, armorRatio: 0.6, sound: 'smg', tracer: 0.4, noise: 35, ads: { zoom: 1.12, time: 0.16 } },
  sniper: { spread: [0.02, 6, 14, 0, 0, 1, 0.6], recoil: { pitch: 3.5, yaw: 0.3, recover: 6, pattern: [0] }, armorRatio: 0.97, sound: 'sniper', tracer: 1, noise: 70, ads: { zoom: 1.2, time: 0.3 } },
  dmr: { spread: [0.12, 5, 10, 0.6, 2.4, 5, 0.65], recoil: { pitch: 1.9, yaw: 0.4, recover: 8, pattern: [0, 0.4, -0.3, 0.5, -0.5] }, armorRatio: 0.88, sound: 'dmr', tracer: 0.7, noise: 55, ads: { zoom: 1.2, time: 0.26 } },
  shotgun: { spread: [0.4, 1.5, 4, 1.0, 2, 4, 0.85], recoil: { pitch: 4.2, yaw: 0.8, recover: 10, pattern: [0, 1, -1] }, armorRatio: 0.6, sound: 'shotgun', tracer: 0.35, noise: 45, ads: { zoom: 1.1, time: 0.22 } },
  pistol: { spread: [0.6, 2.2, 6, 0.9, 3.5, 6, 0.8], recoil: { pitch: 1.6, yaw: 0.35, recover: 14, pattern: [0, 0.5, -0.4, 0.6, -0.6, 0.3] }, armorRatio: 0.55, sound: 'pistol', tracer: 0.3, noise: 40, ads: { zoom: 1.1, time: 0.14 } },
  heavy: { spread: [0.5, 5, 10, 0.25, 3.8, 3.5, 0.55], recoil: { pitch: 0.85, yaw: 0.7, recover: 8, pattern: [0, 0.4, 0.8, 0.5, -0.2, -0.8, -1.0, -0.4, 0.4, 0.9] }, armorRatio: 0.8, sound: 'lmg', tracer: 0.6, noise: 55, ads: { zoom: 1.12, time: 0.32 } },
};

function deriveConfig(e) {
  const t = TEMPLATES[e.category];
  const s = e.stats;
  const accScale = Math.min(2.2, Math.max(0.35, 1 + (70 - s.acc) * 0.03));
  const [base, move, air, perShot, max, recovery, crouch] = t.spread;
  const action = e.modes[0];
  const cfg = {
    id: e.id,
    name: e.name,
    slot: CATEGORIES.find((c) => c.id === e.category).slot,
    damage: s.dmg,
    pellets: e.pellets || 1,
    fireInterval: +(60 / s.rpm).toFixed(4),
    auto: e.modes.includes('auto'),
    magSize: s.mag,
    reserveMax: s.reserve,
    reloadTime: s.reload,
    armorRatio: e.armorRatio ?? t.armorRatio,
    range: s.range,
    maxRange: Math.min(450, Math.max(40, s.range * (e.category === 'sniper' ? 1.5 : 4))),
    moveSpeed: s.mob,
    spread: {
      base: base * DEG * accScale, move: move * DEG, air: air * DEG,
      perShot: perShot * DEG * (0.6 + s.recoil / 125), max: max * DEG, recovery: recovery * DEG, crouch,
    },
    recoil: { ...t.recoil, pitch: +(t.recoil.pitch * (0.35 + s.recoil / 60)).toFixed(3), yaw: +(t.recoil.yaw * (0.5 + s.recoil / 100)).toFixed(3) },
    sound: t.sound,
    tracerChance: t.tracer,
    noiseRadius: t.noise,
    ads: { ...t.ads },
  };
  if (e.category === 'shotgun') {
    cfg.pelletSpread = (e.id === 'sg_saiga' ? 4.0 : 3.4) * DEG;
    if (e.shell) { cfg.shellReload = true; cfg.reloadStart = 0.35; }
  }
  if (e.category === 'sniper') {
    cfg.scopedMoveSpeed = 0.6;
    cfg.zoomLevels = [80, 32, 11];
    cfg.unscopedSpread = (e.id === 'sn_m82' ? 5 : 7) * DEG;
    if (e.id === 'sn_m82' || e.id === 'sn_m200') cfg.sound = 'antimateriel';
  }
  if (e.id === 'pt_deagle') { cfg.sound = 'magnum'; cfg.recoil.pitch = 4.2; }
  if (e.category === 'smg' && e.id === 'smg_p90') cfg.sound = 'pdw';
  if (e.energy) { cfg.energy = true; cfg.sound = 'energy'; cfg.tracerChance = 1; cfg.tracerColor = 0x48e0ff; cfg.heatPerShot = 0.035; cfg.armorRatio = 0.9; }
  if (e.launcher) {
    cfg.launcher = true; cfg.sound = 'launcher'; cfg.projectile = 'rocket'; cfg.splashRadius = 6; cfg.tracerChance = 0; cfg.armorRatio = 1;
    cfg.spread.base = 0.15 * DEG; cfg.recoil = { pitch: 5, yaw: 0.4, recover: 6, pattern: [0] };
  }
  cfg.action = action;
  return cfg;
}

// Attach catalogue metadata (category, platform, fire modes) to every config, legacy ones included.
for (const e of ARSENAL) {
  const cfg = e.legacy ? WEAPONS[e.id] : deriveConfig(e);
  cfg.category = e.category;
  cfg.inspired = e.inspired;
  cfg.cls = e.cls || CLASS_LABEL[e.category];
  cfg.modes = e.modes;
  cfg.action = e.modes[0];
  cfg.auto = e.modes.includes('auto');
  if (!cfg.noiseRadius) cfg.noiseRadius = e.category === 'sniper' ? 70 : e.category === 'pistol' ? 40 : 45;
  if (!cfg.ads) cfg.ads = { ...TEMPLATES[e.category].ads };
  WEAPONS[e.id] = cfg;
}

export const PRIMARIES = ['rifle', 'shotgun', 'sniper'];
export const ALL_WEAPON_IDS = ARSENAL.map((e) => e.id);

export function getWeaponConfig(id) {
  const cfg = WEAPONS[id];
  if (!cfg) throw new Error(`Unknown weapon: ${id}`);
  return cfg;
}

// 0–100 display ratings for menus (derived from the actual gameplay config).
export function weaponRatings(cfg) {
  const dmg = cfg.damage * (cfg.pellets || 1) * (cfg.splashRadius ? 0.5 : 1);
  const spreadDeg = (cfg.spread ? cfg.spread.base : 0) / DEG + (cfg.unscopedSpread ? 0 : 0);
  return {
    damage: Math.min(100, Math.round(dmg / 1.5)),
    fireRate: Math.round(60 / cfg.fireInterval),
    accuracy: Math.max(5, Math.min(100, Math.round(100 - spreadDeg * 55))),
    recoil: cfg.recoil ? Math.min(100, Math.round(cfg.recoil.pitch * 22)) : 0,
    range: Math.round(cfg.range),
    mobility: Math.round(cfg.moveSpeed * 100),
  };
}
