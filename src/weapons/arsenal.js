// The arsenal catalogue: every selectable weapon with its category, fictional in-game name, the
// real-world platform its *look* is inspired by, and abstract gameplay stats.
// IMPORTANT: the numbers below are game-balance values on fictional scales (damage points, rounds per
// minute in game time, metres of in-game effective range). They do not describe real weapon performance.
// Pure data – safe to import from Node unit tests.

export const CATEGORIES = [
  { id: 'ar', label: 'Assault Rifles', short: 'AR', slot: 'primary' },
  { id: 'smg', label: 'SMGs', short: 'SMG', slot: 'primary' },
  { id: 'sniper', label: 'Sniper Rifles', short: 'SNP', slot: 'primary' },
  { id: 'dmr', label: 'DMRs', short: 'DMR', slot: 'primary' },
  { id: 'shotgun', label: 'Shotguns', short: 'SG', slot: 'primary' },
  { id: 'pistol', label: 'Pistols', short: 'PST', slot: 'secondary' },
  { id: 'heavy', label: 'Heavy Weapons', short: 'HVY', slot: 'primary' },
  { id: 'grenade', label: 'Grenades', short: 'GRN', slot: 'grenade' },
  { id: 'equipment', label: 'Tactical Equipment', short: 'EQP', slot: 'equipment' },
];

// Attachment slots each category accepts (see attachments.js for the parts themselves).
export const COMPAT = {
  ar: { optic: ['reddot', 'holo', 'x2', 'x4'], muzzle: ['suppressor'], under: ['foregrip'], light: ['flashlight'], laser: ['laser'], mag: ['extmag'], stock: ['tstock'] },
  smg: { optic: ['reddot', 'holo', 'x2'], muzzle: ['suppressor'], under: ['foregrip'], light: ['flashlight'], laser: ['laser'], mag: ['extmag'], stock: ['tstock'] },
  sniper: { optic: ['x4', 'x8'], muzzle: ['suppressor'], laser: ['laser'], mag: ['extmag'], stock: ['tstock'] },
  dmr: { optic: ['reddot', 'holo', 'x2', 'x4', 'x8'], muzzle: ['suppressor'], under: ['foregrip'], light: ['flashlight'], laser: ['laser'], mag: ['extmag'], stock: ['tstock'] },
  shotgun: { optic: ['reddot', 'holo'], under: ['foregrip'], light: ['flashlight'], laser: ['laser'], mag: ['extmag'], stock: ['tstock'] },
  pistol: { optic: ['reddot'], muzzle: ['suppressor'], light: ['flashlight'], laser: ['laser'], mag: ['extmag'] },
  heavy: { optic: ['reddot', 'holo', 'x2', 'x4'], under: ['foregrip'], light: ['flashlight'], laser: ['laser'] },
};

// [id, name, inspiredBy, category, finish, stats, extra]
// stats: dmg (per projectile), rpm, mag, reserve, reload (s), acc (0–100), recoil (0–100), range (m, in-game effective), mob (move speed ×)
const S = (dmg, rpm, mag, reserve, reload, acc, recoil, range, mob) => ({ dmg, rpm, mag, reserve, reload, acc, recoil, range, mob });

export const ARSENAL = [
  // ---- Assault rifles
  { id: 'rifle', name: 'AR-7 Carbine', inspired: 'M4A1-style carbine', category: 'ar', legacy: true, modes: ['auto', 'burst', 'semi'] },
  { id: 'ar_416', name: 'HX-416 Rifle', inspired: 'HK416-style piston rifle', category: 'ar', stats: S(33, 700, 30, 120, 2.3, 72, 48, 48, 0.92), modes: ['auto', 'burst', 'semi'] },
  { id: 'ar_scarl', name: 'SC-16 Light', inspired: 'FN SCAR-L-style rifle', category: 'ar', stats: S(31, 620, 30, 120, 2.4, 74, 44, 46, 0.93), modes: ['auto', 'semi'] },
  { id: 'ar_scarh', name: 'SC-17 Heavy', inspired: 'FN SCAR-H-style battle rifle', category: 'ar', stats: S(42, 560, 20, 80, 2.6, 76, 66, 60, 0.88), modes: ['auto', 'semi'], unlock: { kills: 10 } },
  { id: 'ar_ak12', name: 'KV-12 Rifle', inspired: 'AK-12-style rifle', category: 'ar', stats: S(34, 650, 30, 120, 2.5, 66, 55, 46, 0.91), modes: ['auto', 'burst', 'semi'] },
  { id: 'ar_ak15', name: 'KV-15 Rifle', inspired: 'AK-15-style rifle', category: 'ar', stats: S(40, 600, 30, 90, 2.6, 64, 68, 50, 0.89), modes: ['auto', 'semi'], unlock: { kills: 5 } },
  { id: 'ar_mcx', name: 'MX-300 Carbine', inspired: 'SIG MCX-style carbine', category: 'ar', stats: S(30, 780, 30, 120, 2.2, 70, 40, 38, 0.95), modes: ['auto', 'semi'] },
  { id: 'ar_bren', name: 'BR-2 Carbine', inspired: 'CZ BREN 2-style carbine', category: 'ar', stats: S(32, 720, 30, 120, 2.3, 71, 46, 44, 0.93), modes: ['auto', 'burst', 'semi'] },
  { id: 'ar_x95', name: 'TX-95 Bullpup', inspired: 'IWI Tavor X95-style bullpup', category: 'ar', stats: S(31, 750, 30, 120, 2.6, 68, 42, 40, 0.96), modes: ['auto', 'semi'] },
  { id: 'ar_spear', name: 'SPR-68 Spear', inspired: 'SIG MCX Spear-style rifle', category: 'ar', stats: S(45, 560, 20, 80, 2.7, 78, 70, 64, 0.87), modes: ['auto', 'semi'], unlock: { kills: 25 } },
  // ---- SMGs
  { id: 'smg_mp5', name: 'MK-5 SMG', inspired: 'HK MP5-style SMG', category: 'smg', stats: S(24, 800, 30, 120, 2.1, 70, 28, 22, 1.0), modes: ['auto', 'burst', 'semi'] },
  { id: 'smg_mp7', name: 'PD-7 PDW', inspired: 'HK MP7-style PDW', category: 'smg', stats: S(22, 950, 40, 160, 2.0, 66, 26, 24, 1.02), modes: ['auto', 'semi'] },
  { id: 'smg_p90', name: 'PX-90 PDW', inspired: 'FN P90-style bullpup PDW', category: 'smg', stats: S(21, 900, 50, 150, 2.6, 64, 22, 24, 1.0), modes: ['auto', 'semi'] },
  { id: 'smg_vector', name: 'VK-45 Vector', inspired: 'KRISS Vector-style SMG', category: 'smg', stats: S(25, 1100, 25, 100, 1.9, 60, 20, 16, 1.02), modes: ['auto', 'burst', 'semi'], unlock: { kills: 8 } },
  { id: 'smg_mpx', name: 'MX-9 SMG', inspired: 'SIG MPX-style SMG', category: 'smg', stats: S(24, 850, 30, 120, 2.0, 68, 27, 22, 1.0), modes: ['auto', 'semi'] },
  { id: 'smg_apc9', name: 'APX-9 SMG', inspired: 'B&T APC9-style SMG', category: 'smg', stats: S(25, 900, 30, 120, 2.0, 67, 30, 22, 1.0), modes: ['auto', 'semi'] },
  // ---- Sniper rifles
  { id: 'sniper', name: 'LR-50 Marksman', inspired: 'Classic wood-stocked bolt-action (Poly Haven CC0 scan)', category: 'sniper', legacy: true, modes: ['bolt'] },
  { id: 'sn_axmc', name: 'AXR Magnum', inspired: 'Accuracy International AXMC-style rifle', category: 'sniper', stats: S(120, 40, 5, 20, 3.2, 98, 75, 220, 0.84), modes: ['bolt'] },
  { id: 'sn_mrad', name: 'MR-338 Modular', inspired: 'Barrett MRAD-style rifle', category: 'sniper', stats: S(118, 42, 10, 30, 3.4, 97, 74, 210, 0.84), modes: ['bolt'], unlock: { kills: 6 } },
  { id: 'sn_m82', name: 'AM-50 Anti-Materiel', inspired: 'Barrett M82-style semi-auto rifle', category: 'sniper', stats: S(150, 90, 10, 30, 3.8, 88, 95, 260, 0.78), modes: ['semi'], unlock: { kills: 30 } },
  { id: 'sn_trg', name: 'TG-42 Tactical', inspired: 'Sako TRG-style rifle', category: 'sniper', stats: S(112, 44, 7, 28, 3.0, 97, 70, 200, 0.85), modes: ['bolt'] },
  { id: 'sn_m200', name: 'CT-408 Long Range', inspired: 'CheyTac M200-style rifle', category: 'sniper', stats: S(135, 36, 7, 21, 3.8, 99, 85, 280, 0.8), modes: ['bolt'], unlock: { kills: 20 } },
  { id: 'sn_bolt', name: 'PR-7 Precision', inspired: 'Modern chassis bolt-action precision rifle', category: 'sniper', stats: S(110, 46, 5, 25, 2.8, 96, 68, 190, 0.86), modes: ['bolt'] },
  // ---- DMRs
  { id: 'dmr_sr25', name: 'KS-25 Marksman', inspired: 'SR-25-style marksman rifle', category: 'dmr', stats: S(58, 240, 20, 80, 2.8, 88, 55, 90, 0.88), modes: ['semi'] },
  { id: 'dmr_417', name: 'HX-417 Marksman', inspired: 'HK417-style marksman rifle', category: 'dmr', stats: S(60, 260, 20, 80, 2.9, 86, 58, 85, 0.88), modes: ['semi'] },
  { id: 'dmr_mk14', name: 'EB-14 Enhanced', inspired: 'MK14 EBR-style rifle', category: 'dmr', stats: S(62, 230, 20, 60, 3.0, 85, 62, 85, 0.86), modes: ['semi'], unlock: { kills: 12 } },
  { id: 'dmr_svd', name: 'DV-7 Dragoon', inspired: 'SVD-inspired marksman rifle', category: 'dmr', stats: S(68, 180, 10, 40, 3.0, 84, 66, 95, 0.87), modes: ['semi'] },
  // ---- Shotguns (dmg is per pellet)
  { id: 'shotgun', name: 'M-12 Breacher', inspired: 'Remington 870-style pump shotgun', category: 'shotgun', legacy: true, modes: ['pump'] },
  { id: 'sg_m4', name: 'BN-4 Tactical', inspired: 'Benelli M4-style semi-auto shotgun', category: 'shotgun', stats: S(16, 214, 7, 28, 0.5, 60, 62, 10, 0.9), modes: ['semi'], pellets: 9, shell: true },
  { id: 'sg_590', name: 'MS-590 Patrol', inspired: 'Mossberg 590-style pump shotgun', category: 'shotgun', stats: S(20, 66, 8, 32, 0.52, 62, 78, 10, 0.91), modes: ['pump'], pellets: 9, shell: true },
  { id: 'sg_saiga', name: 'SG-12 Auto', inspired: 'Saiga-12-style box-fed shotgun', category: 'shotgun', stats: S(15, 240, 10, 30, 2.7, 56, 66, 9, 0.88), modes: ['semi'], pellets: 9, unlock: { kills: 8 } },
  // ---- Pistols
  { id: 'pistol', name: 'P-9 Sidearm', inspired: 'Classic service pistol (Poly Haven CC0 scan)', category: 'pistol', legacy: true, modes: ['semi'] },
  { id: 'pt_g17', name: 'GL-17 Service', inspired: 'Glock 17-style pistol', category: 'pistol', stats: S(26, 480, 17, 68, 1.9, 62, 30, 24, 1.0), modes: ['semi'] },
  { id: 'pt_g19', name: 'GL-19 Compact', inspired: 'Glock 19-style compact pistol', category: 'pistol', stats: S(25, 480, 15, 60, 1.8, 60, 32, 22, 1.02), modes: ['semi'] },
  { id: 'pt_p320', name: 'SP-320 Modular', inspired: 'SIG P320-style pistol', category: 'pistol', stats: S(27, 460, 17, 68, 1.9, 64, 31, 24, 1.0), modes: ['semi'] },
  { id: 'pt_p226', name: 'SP-226 Classic', inspired: 'SIG P226-style pistol', category: 'pistol', stats: S(29, 430, 15, 60, 2.0, 66, 34, 25, 1.0), modes: ['semi'] },
  { id: 'pt_57', name: 'FS-57 Sidearm', inspired: 'FN Five-seveN-style pistol', category: 'pistol', stats: S(24, 520, 20, 80, 1.9, 63, 24, 26, 1.0), modes: ['semi'], armorRatio: 0.7 },
  { id: 'pt_deagle', name: 'DE-50 Magnum', inspired: 'Desert Eagle-style magnum pistol', category: 'pistol', stats: S(52, 190, 7, 35, 2.2, 58, 85, 30, 0.97), modes: ['semi'], unlock: { kills: 10 } },
  // ---- Heavy & special
  { id: 'hv_m249', name: 'LM-249 SAW', inspired: 'M249-style light machine gun', category: 'heavy', stats: S(30, 800, 100, 200, 5.5, 55, 50, 45, 0.8), modes: ['auto'], cls: 'Light machine gun' },
  { id: 'hv_minimi', name: 'MN-46 Para', inspired: 'FN Minimi Para-style LMG', category: 'heavy', stats: S(29, 820, 100, 200, 5.2, 57, 48, 42, 0.83), modes: ['auto'], cls: 'Light machine gun' },
  { id: 'hv_m240', name: 'GP-240 GPMG', inspired: 'M240-style general-purpose MG', category: 'heavy', stats: S(40, 650, 100, 200, 6.0, 58, 64, 60, 0.76), modes: ['auto'], cls: 'Medium machine gun', unlock: { kills: 15 } },
  { id: 'hv_energy', name: 'ARC-9 Pulse Rifle', inspired: 'Fictional directed-energy rifle (original design)', category: 'heavy', stats: S(28, 720, 40, 160, 2.4, 80, 15, 60, 0.9), modes: ['auto', 'semi'], cls: 'Energy weapon (fictional)', energy: true, unlock: { missions: 1 } },
  { id: 'hv_launcher', name: 'HAMMER AT Launcher', inspired: 'Fictional anti-armour launcher (original design)', category: 'heavy', stats: S(220, 30, 1, 4, 3.5, 90, 90, 120, 0.8), modes: ['single'], cls: 'Launcher (fictional)', launcher: true, unlock: { kills: 40 } },
];

export const CLASS_LABEL = {
  ar: 'Assault rifle', smg: 'Submachine gun', sniper: 'Sniper rifle', dmr: 'Designated marksman rifle',
  shotgun: 'Shotgun', pistol: 'Pistol', heavy: 'Heavy weapon',
};

// Default attachments per weapon (players can change them in the armory).
export const DEFAULT_ATTACHMENTS = {
  sniper: { optic: 'x8' }, sn_axmc: { optic: 'x8' }, sn_mrad: { optic: 'x8' }, sn_m82: { optic: 'x8' }, sn_trg: { optic: 'x8' }, sn_m200: { optic: 'x8' }, sn_bolt: { optic: 'x8' },
  dmr_sr25: { optic: 'x4' }, dmr_417: { optic: 'x4' }, dmr_mk14: { optic: 'x4' }, dmr_svd: { optic: 'x4' },
  ar_spear: { optic: 'x2' }, ar_x95: { optic: 'reddot' }, smg_p90: { optic: 'reddot' },
};

export function arsenalEntry(id) {
  return ARSENAL.find((w) => w.id === id) || null;
}

export function weaponsInCategory(cat) {
  return ARSENAL.filter((w) => w.category === cat);
}

// Unlock rules: { kills: n } lifetime kills, { missions: n } completed Deep Strike missions.
export function isUnlocked(entry, progress, sandbox = false) {
  if (sandbox || !entry.unlock) return true;
  const p = progress || { kills: 0, missions: 0 };
  if (entry.unlock.kills && (p.kills || 0) < entry.unlock.kills) return false;
  if (entry.unlock.missions && (p.missions || 0) < entry.unlock.missions) return false;
  return true;
}

export function unlockText(entry) {
  if (!entry.unlock) return 'Unlocked';
  if (entry.unlock.kills) return `${entry.unlock.kills} lifetime kills`;
  if (entry.unlock.missions) return `Complete ${entry.unlock.missions} Deep Strike mission`;
  return 'Locked';
}
