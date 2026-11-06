// Throwables and tactical equipment: display data, inventory limits and gameplay tuning.
// All values are fictional game-balance numbers. Pure data (Node-safe).

export const THROWABLES = {
  frag: { name: 'Frag Grenade', inspired: 'M67-style fragmentation grenade', kind: 'lethal', count: 2, fuse: 3.0, radius: 7, damage: 160, cooldown: 0.9, icon: '●', desc: 'Timed explosive. Damage falls off with distance; walls block the blast.' },
  smoke: { name: 'Smoke Grenade', inspired: 'M18-style smoke canister', kind: 'tactical', count: 2, fuse: 1.4, radius: 6.5, duration: 20, cooldown: 0.9, icon: '◌', desc: 'Dense smoke cloud that blocks vision for players and enemies.' },
  flash: { name: 'Flashbang', inspired: 'M84-style stun device', kind: 'tactical', count: 2, fuse: 1.6, radius: 14, duration: 4.5, cooldown: 0.9, icon: '✸', desc: 'Blinds and disorients enemies that can see the burst.' },
  stun: { name: 'Stun Grenade', inspired: 'Concussion grenade', kind: 'tactical', count: 2, fuse: 1.8, radius: 9, duration: 5, slow: 0.4, cooldown: 0.9, icon: '≋', desc: 'Concussive pulse that slows enemies and their aim.' },
  incendiary: { name: 'Incendiary Grenade', inspired: 'Thermite-style canister', kind: 'lethal', count: 1, fuse: 2.0, radius: 4.5, duration: 8, dps: 24, cooldown: 1.2, icon: '▲', desc: 'Creates a burning area-denial zone.' },
  emp: { name: 'EMP Grenade', inspired: 'Fictional electromagnetic grenade', kind: 'tactical', count: 2, fuse: 1.8, radius: 12, duration: 15, cooldown: 0.9, icon: 'ϟ', desc: 'Disables hostile surveillance cameras and enemy electronics (optics, radios).' },
  sensor: { name: 'Sensor Grenade', inspired: 'Fictional motion-sensor puck', kind: 'tactical', count: 2, fuse: 0.6, radius: 22, duration: 15, cooldown: 0.9, icon: '◎', desc: 'Sticks where it lands and reveals nearby hostiles on the HUD.' },
  decoy: { name: 'Decoy Grenade', inspired: 'Fictional acoustic decoy', kind: 'tactical', count: 2, fuse: 1.0, radius: 45, duration: 10, cooldown: 0.9, icon: '♪', desc: 'Plays fake gunfire that draws enemies to investigate.' },
  pulse: { name: 'EM Pulse Device', inspired: 'Fictional heavy pulse charge (original design)', kind: 'tactical', count: 1, fuse: 2.5, radius: 26, duration: 25, cooldown: 2, icon: '⌬', desc: 'Large thrown pulse charge: wide, long electronics blackout.' },
};

export const THROWABLE_IDS = Object.keys(THROWABLES);
export const GRENADE_CAPACITY = 4; // grenade types carried at once

export const EQUIPMENT = {
  knife: { name: 'Tactical Combat Knife', kind: 'melee', desc: 'Always carried (slot 3). Quick slash / heavy stab.', always: true, icon: '⟋' },
  binoculars: { name: 'Binoculars', kind: 'held', desc: 'Hold RMB for 6x magnification; LMB tags the hostile in view on the HUD.', icon: '∞', model: 'binoculars' },
  nvg: { name: 'Night-Vision Goggles', kind: 'toggle', key: 'KeyN', desc: 'N: light-amplified green view for night and tunnels.', icon: 'NV', battery: 120 },
  thermal: { name: 'Thermal Vision', kind: 'toggle', key: 'KeyJ', desc: 'J: white-hot thermal view; warm bodies stand out through smoke.', icon: 'TH', battery: 90 },
  rangefinder: { name: 'Laser Rangefinder', kind: 'held', desc: 'LMB: laser range and bearing to the point in the crosshair; marks it for 10 s.', icon: '⊕' },
  flashlight: { name: 'Tactical Flashlight', kind: 'toggle', key: 'KeyL', desc: 'L: helmet/weapon light. Enemies can notice the beam.', icon: '☀', model: 'flashlight' },
  detector: { name: 'Portable Enemy Detector', kind: 'held', desc: 'Handheld motion/heartbeat scanner showing hostiles within 30 m.', icon: '⌖', range: 30 },
  shield: { name: 'Tactical Shield', kind: 'held', desc: 'Ballistic shield: blocks frontal fire (600 HP). LMB bash.', icon: '▮', hp: 600 },
  medkit: { name: 'Medical Kit', kind: 'held', desc: 'Hold LMB 2 s: restore 60 health. 2 uses.', icon: '✚', charges: 2, heal: 60, model: 'medical_box' },
  ammopack: { name: 'Ammunition Supply Pack', kind: 'held', desc: 'LMB: refill all weapons and +1 of each grenade. 1 use.', icon: '▤', charges: 1, model: 'ammo_box' },
};

export const EQUIPMENT_IDS = Object.keys(EQUIPMENT);
export const EQUIPMENT_CAPACITY = 7; // items carried (knife is free)

export const DEFAULT_LOADOUT = {
  primary: 'rifle',
  secondary: 'pistol',
  grenades: ['frag', 'smoke', 'flash', 'sensor'],
  equipment: ['binoculars', 'nvg', 'thermal', 'flashlight', 'medkit', 'ammopack', 'rangefinder'],
  attachments: {},
};

// Clamp a stored loadout to valid ids and capacities.
export function sanitizeLoadout(l, isWeapon) {
  const d = DEFAULT_LOADOUT;
  const out = { ...d, ...(l || {}) };
  if (!isWeapon(out.primary, 'primary')) out.primary = d.primary;
  if (!isWeapon(out.secondary, 'secondary')) out.secondary = d.secondary;
  out.grenades = [...new Set((out.grenades || []).filter((g) => THROWABLES[g]))].slice(0, GRENADE_CAPACITY);
  out.equipment = [...new Set((out.equipment || []).filter((e) => EQUIPMENT[e] && !EQUIPMENT[e].always))].slice(0, EQUIPMENT_CAPACITY);
  out.attachments = typeof out.attachments === 'object' && out.attachments ? out.attachments : {};
  return out;
}
