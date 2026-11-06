// Weapon attachments: slots, display data and balanced (fictional) stat adjustments.
// The 3D parts live in forge/attachments.js; this file is pure data + maths (Node-safe for tests).

export const ATTACHMENT_SLOTS = ['optic', 'muzzle', 'under', 'light', 'laser', 'mag', 'stock'];
export const SLOT_LABEL = { optic: 'Optic', muzzle: 'Muzzle', under: 'Underbarrel', light: 'Light', laser: 'Laser', mag: 'Magazine', stock: 'Stock' };

// mods are multipliers (×) unless noted (+ for mobility / adsTime, which are additive).
export const ATTACHMENTS = {
  reddot: { slot: 'optic', name: 'Red Dot Sight', desc: 'Compact reflex sight. Fast target acquisition.', ads: { zoom: 1.35, time: -0.02 } },
  holo: { slot: 'optic', name: 'Holographic Sight', desc: 'Wide-window holographic reticle. Slightly tighter ADS spread.', ads: { zoom: 1.3, time: -0.03 }, mods: { adsSpread: 0.94 } },
  x2: { slot: 'optic', name: '2x Optic', desc: 'Low-power magnified optic for mid range.', ads: { zoom: 2, time: 0.03 }, mods: { mobility: -0.005 } },
  x4: { slot: 'optic', name: '4x Scope', desc: 'Prism scope with chevron reticle. Full-screen sight picture when aiming.', ads: { zoom: 4, time: 0.06, overlay: 'acog' }, mods: { mobility: -0.01 } },
  x8: { slot: 'optic', name: '8x Sniper Scope', desc: 'High-power precision scope (two zoom stages on bolt rifles).', ads: { zoom: 8, time: 0.1, overlay: 'mildot' }, mods: { mobility: -0.02 } },
  suppressor: { slot: 'muzzle', name: 'Suppressor', desc: 'Quieter shots that alert fewer enemies, no muzzle flash. Slight damage loss.', mods: { damage: 0.95, range: 1.1, recoil: 0.92, noise: 0.4, tracer: 0.4 } },
  flashlight: { slot: 'light', name: 'Weapon Light', desc: 'Toggle with L. Lights dark tunnels; enemies notice the beam.', mods: {} },
  laser: { slot: 'laser', name: 'Laser Module', desc: 'Visible aiming laser. Tighter hip-fire spread.', mods: { hipSpread: 0.78 } },
  foregrip: { slot: 'under', name: 'Vertical Foregrip', desc: 'Reduces vertical recoil.', mods: { recoil: 0.85, mobility: -0.01 } },
  extmag: { slot: 'mag', name: 'Extended Magazine', desc: '+50% magazine capacity, slower reload.', mods: { mag: 1.5, reload: 1.15, mobility: -0.02 } },
  tstock: { slot: 'stock', name: 'Tactical Stock', desc: 'Adjustable stock with cheek riser. Less recoil, steadier aim.', mods: { recoil: 0.9, adsSpread: 0.9, adsTime: -0.02 } },
};

export function attachmentAllowed(compat, id) {
  const a = ATTACHMENTS[id];
  return !!(a && compat && compat[a.slot] && compat[a.slot].includes(id));
}

// Normalise an attachment map { slot: id } against the weapon's compatibility table.
export function sanitizeAttachments(compat, map = {}) {
  const out = {};
  for (const [slot, id] of Object.entries(map || {})) {
    if (id && ATTACHMENTS[id] && ATTACHMENTS[id].slot === slot && attachmentAllowed(compat, id)) out[slot] = id;
  }
  return out;
}

/**
 * Returns a new weapon config with the attachments' effects applied (base config is never mutated).
 * Adds: cfg.attachments, cfg.ads { zoom, time, overlay, spreadMul }, cfg.hipSpreadMul, cfg.noiseMul,
 * cfg.suppressed, cfg.hasLight, cfg.hasLaser.
 */
export function applyAttachments(base, map = {}) {
  const cfg = structuredClone(base);
  cfg.attachments = { ...map };
  const ids = Object.values(map).filter(Boolean);
  let damage = 1, range = 1, recoil = 1, mag = 1, reload = 1, mobility = 0, adsSpread = 1, hipSpread = 1, noise = 1, tracer = 1, adsTime = 0;
  for (const id of ids) {
    const m = (ATTACHMENTS[id] && ATTACHMENTS[id].mods) || {};
    damage *= m.damage ?? 1; range *= m.range ?? 1; recoil *= m.recoil ?? 1; mag *= m.mag ?? 1; reload *= m.reload ?? 1;
    adsSpread *= m.adsSpread ?? 1; hipSpread *= m.hipSpread ?? 1; noise *= m.noise ?? 1; tracer *= m.tracer ?? 1;
    mobility += m.mobility ?? 0; adsTime += m.adsTime ?? 0;
  }
  if (cfg.melee || cfg.special) return cfg;
  cfg.damage = +(cfg.damage * damage).toFixed(2);
  cfg.range *= range;
  cfg.maxRange *= range;
  if (cfg.recoil) { cfg.recoil.pitch *= recoil; cfg.recoil.yaw *= recoil; }
  if (mag !== 1) {
    // Tube-fed shotguns get a tube extension (+3 shells) instead of a percentage.
    const extra = cfg.shellReload ? 3 : Math.round(cfg.magSize * (mag - 1));
    cfg.magSize += extra;
    cfg.reserveMax += cfg.shellReload ? 6 : extra * 2;
  }
  cfg.reloadTime *= reload;
  cfg.moveSpeed = +(cfg.moveSpeed + mobility).toFixed(3);
  cfg.hipSpreadMul = hipSpread;
  cfg.noiseMul = noise;
  cfg.suppressed = !!map.muzzle;
  cfg.tracerChance = (cfg.tracerChance ?? 0.3) * tracer;
  cfg.hasLight = map.light === 'flashlight';
  cfg.hasLaser = map.laser === 'laser';
  const optic = map.optic && ATTACHMENTS[map.optic] ? ATTACHMENTS[map.optic].ads : null;
  const baseAds = cfg.ads || { zoom: 1.15, time: 0.2 };
  cfg.ads = {
    zoom: optic ? optic.zoom : baseAds.zoom,
    time: Math.max(0.08, baseAds.time + (optic ? optic.time : 0) + adsTime),
    overlay: optic ? optic.overlay || null : null,
    spreadMul: (cfg.ads && cfg.ads.spreadMul ? cfg.ads.spreadMul : 0.45) * adsSpread,
    optic: map.optic || null,
  };
  // Bolt-action rifles keep the classic cycling scope (unscoped -> stage 1 -> stage 2).
  if (cfg.zoomLevels) {
    if (map.optic === 'x4') cfg.zoomLevels = [80, 22];
    else cfg.zoomLevels = [80, 32, 11];
  }
  return cfg;
}

// Stat deltas for the armory UI (positive = better).
export function attachmentSummary(id) {
  const a = ATTACHMENTS[id];
  if (!a) return [];
  const m = a.mods || {};
  const out = [];
  const pct = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
  if (a.ads) out.push(`ADS zoom ${a.ads.zoom}x`);
  if (m.damage) out.push(`damage ${pct(m.damage - 1)}`);
  if (m.range) out.push(`range ${pct(m.range - 1)}`);
  if (m.recoil) out.push(`recoil ${pct(m.recoil - 1)}`);
  if (m.mag) out.push(`magazine ${pct(m.mag - 1)}`);
  if (m.reload) out.push(`reload time ${pct(m.reload - 1)}`);
  if (m.hipSpread) out.push(`hip spread ${pct(m.hipSpread - 1)}`);
  if (m.adsSpread) out.push(`ADS spread ${pct(m.adsSpread - 1)}`);
  if (m.noise) out.push(`gunshot noise ${pct(m.noise - 1)}`);
  if (m.mobility) out.push(`mobility ${pct(m.mobility)}`);
  return out;
}
