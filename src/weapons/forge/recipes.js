// Weapon recipes: original procedural models built from the forge kit (parts.js).
// Each recipe has its own silhouette, proportions and finish; family builders share components
// (AR-15 platform, SCAR, AK, chassis bolt-action, pistols, belt-fed MGs). Proportions follow the real
// platforms the designs are inspired by, but the models are original geometry, not copies of any asset.
//
// Every recipe declares: points (grip, support, eject), parts (mag, bolt/slide/pump/cover, stock, irons),
// mounts (optic, muzzle, under, light, laser, stock) and meta.ironY (iron sight line height).
import {
  Build, instantiate, box, cyl, cylX, cylY, lathe, prof, tor, sphere, picatinny, mlok, vents, serrations, screw, barrel,
  muzzleDevice, arGrip, triggerGuard, selector, stanag, akMag, boxMag, flipSights, bipod, qd, railSide, railBottom,
} from './parts.js';

const PI = Math.PI;

// ================================================================== shared sub-assemblies
function handguard(b, type, z0, len, { y = 0.004, r = 0.027, role = 'body', railY = 0.03 } = {}) {
  const z1 = z0 - len, zc = z0 - len / 2;
  if (type === 'quad') {
    b.add(role, box(r * 1.9, r * 1.9, len, 0, y, zc, 0.006));
    picatinny(b, role, z0, z1, railY);
    railBottom(b, role, z0 - 0.01, z1 + 0.01, y - r * 0.95);
    for (const s of [-1, 1]) railSide(b, role, z0 - 0.02, z1 + 0.03, y, r * 0.95, s, 0.019);
    return { bottom: y - r * 0.95 - 0.011, side: r * 0.95 + 0.011 };
  }
  if (type === 'mlok' || type === 'mlok_taper') {
    const r2 = type === 'mlok_taper' ? r * 0.86 : r;
    b.add(role, cyl(r, len, 0, y, zc, { r2, seg: 8, rz: PI / 8 }));
    picatinny(b, role, z0, z1, railY);
    mlok(b, z0 - 0.02, z1 + 0.02, y, r * 0.93, { count: Math.max(2, Math.round(len / 0.06)) });
    if (!b.lod) for (let k = 0; k < Math.round(len / 0.06); k++) b.add('slot', box(0.007, 0.002, 0.03, 0, y - r * 0.93, z0 - 0.04 - k * 0.06, 0.001));
    return { bottom: y - r * 0.93, side: r * 0.93 };
  }
  if (type === 'keymod') {
    b.add(role, cyl(r, len, 0, y, zc, { seg: b.seg(20) }));
    picatinny(b, role, z0, z1, railY);
    vents(b, z0 - 0.03, z1 + 0.03, y - 0.004, r * 0.98, { count: Math.round(len / 0.035), r: 0.0035 });
    return { bottom: y - r, side: r };
  }
  // 'classic': two-piece ribbed round handguard (M4 style)
  b.add('furn', cyl(r * 1.05, len, 0, y - 0.002, zc, { seg: b.seg(20) }));
  if (!b.lod) for (let k = 0; k < 6; k++) b.add('furn', box(r * 2.25, 0.004, 0.01, 0, y - 0.002, z0 - 0.025 - k * (len - 0.05) / 5, 0.002));
  b.add('steel_dark', cyl(r * 1.25, 0.012, 0, y - 0.002, z0 + 0.004, { seg: b.seg(20) })); // delta ring
  return { bottom: y - r * 1.05, side: r * 1.05 };
}

function arStock(b, type, zR, { role = 'furn', y = -0.004 } = {}) {
  const p = b.part('stock', [0, y, zR]);
  if (type === 'fold' || type === 'skel') {
    // Folding skeleton stock (MCX-style): hinge block + two rods + butt plate
    p.add('body', box(0.03, 0.04, 0.03, 0, y, zR + 0.012, 0.004));
    p.add('steel_dark', cyl(0.007, 0.24, 0, y + 0.018, zR + 0.15, { seg: b.seg(10) }), cyl(0.006, 0.22, 0, y - 0.035, zR + 0.15, { seg: b.seg(10) }));
    p.add(role, box(0.034, 0.12, 0.02, 0, y - 0.012, zR + 0.27, 0.006));
    p.add('rubber', box(0.036, 0.122, 0.012, 0, y - 0.012, zR + 0.284, 0.004));
    if (type === 'skel') p.add(role, box(0.03, 0.022, 0.08, 0, y + 0.03, zR + 0.21, 0.006)); // cheek riser
    return zR + 0.29;
  }
  if (type === 'a2') {
    p.add(role, prof([[zR, 0.02], [zR + 0.25, 0.028], [zR + 0.255, -0.105], [zR + 0.235, -0.11], [zR + 0.03, -0.035], [zR, -0.03]], 0.044, 0.008));
    p.add('rubber', box(0.046, 0.13, 0.014, 0, -0.04, zR + 0.258, 0.004));
    qd(b, 0.024, -0.08, zR + 0.2);
    return zR + 0.265;
  }
  if (type === 'prs') {
    p.add('steel_dark', cyl(0.0145, 0.2, 0, y, zR + 0.1, { seg: b.seg(14) }));
    p.add(role, prof([[zR + 0.08, 0.035], [zR + 0.28, 0.04], [zR + 0.29, -0.1], [zR + 0.26, -0.1], [zR + 0.2, -0.04], [zR + 0.08, -0.025]], 0.046, 0.006));
    p.add('knurl', cylX(0.009, 0.05, 0, -0.01, zR + 0.19)); // adjustment wheel
    p.add('rubber', box(0.048, 0.145, 0.014, 0, -0.03, zR + 0.292, 0.004));
    return zR + 0.3;
  }
  // Buffer tube + collapsible stock (m4 / crane)
  p.add('body', cyl(0.0145, 0.25, 0, y, zR + 0.125, { seg: b.seg(16) }));
  p.add('steel_dark', cyl(0.018, 0.012, 0, y, zR + 0.008, { seg: b.seg(16) })); // castle nut
  p.add('steel_dark', box(0.004, 0.018, 0.02, 0.016, y - 0.008, zR + 0.012, 0.001)); // end plate tab
  if (type === 'crane') {
    p.add(role, prof([[zR + 0.15, 0.03], [zR + 0.33, 0.034], [zR + 0.335, -0.085], [zR + 0.3, -0.09], [zR + 0.2, -0.03], [zR + 0.15, -0.02]], 0.05, 0.007));
    for (const s of [-1, 1]) p.add(role, cyl(0.0105, 0.13, s * 0.019, y + 0.006, zR + 0.265, { seg: b.seg(12) })); // battery tubes
    p.add('slot', box(0.052, 0.03, 0.06, 0, -0.052, zR + 0.26, 0.01));
  } else {
    p.add(role, prof([[zR + 0.16, 0.022], [zR + 0.32, 0.026], [zR + 0.325, -0.075], [zR + 0.295, -0.08], [zR + 0.21, -0.025], [zR + 0.16, -0.02]], 0.042, 0.006));
    p.add(role, box(0.012, 0.02, 0.06, 0, y - 0.024, zR + 0.19, 0.003)); // adjustment lever housing
    p.add('slot', box(0.044, 0.028, 0.06, 0, -0.045, zR + 0.255, 0.009)); // hollow butt
    p.add('slot', box(0.044, 0.008, 0.022, 0, 0.006, zR + 0.3, 0.003)); // sling slot
  }
  p.add('rubber', box(0.046, 0.12, 0.012, 0, -0.026, zR + 0.333, 0.004));
  qd(b, 0.024, y, zR + 0.29);
  return zR + 0.34;
}

// Common mounts for rail guns.
function railMounts(b, { railTop, opticZ, muzzleZ, hgZ0, hgLen, hg, magZ, magY, stockZ }) {
  b.mount('optic', 0, railTop, opticZ);
  b.mount('muzzle', 0, 0, muzzleZ);
  b.mount('under', 0, hg.bottom, hgZ0 - hgLen * 0.55);
  b.mount('light', -hg.side, 0.004, hgZ0 - hgLen + 0.045, { side: -1 });
  b.mount('laser', hg.side, 0.004, hgZ0 - hgLen * 0.7, { side: 1 });
  if (magZ !== undefined) b.mount('mag', 0, magY, magZ);
  if (stockZ !== undefined) b.mount('stock', 0, -0.004, stockZ);
  b.point('support', 0, hg.bottom - 0.018, hgZ0 - hgLen * 0.42);
  b.point('muzzle', 0, 0, muzzleZ);
}

// ================================================================== AR-15 / AR-10 platform
function arFamily(b, o) {
  const k = o.big ? 1.1 : 1;
  const W = 0.026 * k;
  const zR = 0.078 * k, zF = -0.14 * k;
  const yTop = 0.028 * k;
  // Upper receiver with ejection port, dust cover and forward assist
  b.add('body', prof([[zR, -0.012], [zF, -0.012], [zF, yTop], [zR - 0.008, yTop], [zR, yTop - 0.01]], W, 0.0025));
  b.add('body', box(W + 0.002, 0.01, 0.05 * k, 0, -0.008, zF + 0.03, 0.002)); // barrel nut shroud
  b.add('steel_dark', box(0.003, 0.016, 0.05, W / 2 + 0.0012, 0.008, 0.004, 0.001)); // dust cover
  if (o.fa !== false) {
    b.add('body', cyl(0.0085, 0.032, W / 2 + 0.004, 0.014, zR - 0.034, { seg: b.seg(12) }));
    b.add('knurl', cyl(0.0068, 0.012, W / 2 + 0.004, 0.014, zR - 0.012, { seg: b.seg(12) }));
  }
  b.point('eject', W / 2 + 0.003, 0.008, 0.004);
  // Lower receiver + magwell + trigger guard
  b.add('body', prof([[zR, -0.012], [zR, -0.032], [0.03, -0.036], [0.004, -0.036], [0.0, -0.04], [-0.006, -0.072], [-0.082 * k, -0.072], [-0.082 * k, -0.04], [-0.075 * k, -0.012]], W - 0.002, 0.003));
  b.add('body', box(W + 0.004, 0.012, 0.085 * k, 0, -0.068, -0.044 * k, 0.003)); // flared magwell
  triggerGuard(b, -0.005, 0.03, -0.006);
  selector(b, 0.04, -0.02, W / 2);
  screw(b, W / 2, -0.02, zR - 0.012); screw(b, -W / 2, -0.02, zR - 0.012); screw(b, W / 2, -0.02, -0.07 * k);
  b.add('steel_dark', box(0.006, 0.01, 0.01, W / 2 + 0.002, -0.042, -0.01)); // mag release
  arGrip(b, 0.032, -0.03, { angle: 0.36, len: 0.105, role: o.gripRole || 'grip' });
  // Upper rail
  const railTop = picatinny(b, 'body', zR - 0.004, zF, yTop);
  // Charging handle (moves on reload)
  b.part('bolt', [0, yTop - 0.004, zR]).add('steel_dark', box(0.044, 0.007, 0.016, 0, yTop - 0.004, zR + 0.006, 0.002), box(0.012, 0.006, 0.04, 0, yTop - 0.006, zR - 0.016, 0.001));
  // Handguard + barrel + muzzle
  const hgLen = o.hgLen * k;
  const hg = handguard(b, o.hg, zF, hgLen, { r: 0.027 * k, railY: yTop, y: 0.004 });
  const bz1 = zF - o.barrel * k;
  barrel(b, zF - hgLen + 0.01, bz1, 0.0085 * k, { taper: 0.95 });
  if (o.fsb) {
    // Classic front sight base + bayonet lug, A2 sight post
    b.add('steel_dark', box(0.02, 0.05, 0.022, 0, 0.014, zF - hgLen - 0.03, 0.003));
    b.add('steel_dark', prof([[zF - hgLen - 0.04, 0.035], [zF - hgLen - 0.02, 0.035], [zF - hgLen - 0.022, 0.07], [zF - hgLen - 0.038, 0.07]], 0.018, 0.002));
    b.add('steel_dark', box(0.003, 0.016, 0.003, 0, 0.074, zF - hgLen - 0.03));
    b.add('steel_dark', box(0.012, 0.012, 0.02, 0, -0.016, zF - hgLen - 0.032, 0.002));
  } else if (o.hg === 'classic') {
    b.add('steel_dark', box(0.024, 0.022, 0.022, 0, 0.004, zF - hgLen - 0.02, 0.003));
  }
  const tip = muzzleDevice(b, o.muzzle || 'birdcage', bz1, 0.0085 * k);
  // Irons
  const irons = b.part('irons');
  if (o.carry) {
    irons.add('body', prof([[zR - 0.01, railTop], [zR - 0.01, railTop + 0.034], [zF + 0.03, railTop + 0.034], [zF + 0.03, railTop]], 0.022, 0.003));
    irons.add('steel_dark', box(0.014, 0.014, 0.014, 0, railTop + 0.04, zR - 0.02, 0.002));
    b.meta.ironY = railTop + 0.04;
  } else {
    flipSights(b, zR - 0.025, zF - hgLen + 0.02, railTop, { rearOnly: !!o.fsb });
  }
  if (o.fsb) b.meta.ironY = 0.072;
  // Stock + magazine
  const stockEnd = arStock(b, o.stock || 'm4', zR, { role: 'furn' });
  if (o.mag === 'ar10') boxMag(b, 'mag', -0.044 * k, -0.07, { len: 0.12, w: 0.028, d: 0.08, rake: 0.18, role: o.magRole || 'poly_black' });
  else stanag(b, 'mag', -0.046, -0.07, { len: o.magLen || 0.165, curve: 0.3, pmag: o.mag === 'pmag', role: o.magRole || 'steel_dark' });
  railMounts(b, { railTop, opticZ: -0.03 * k, muzzleZ: tip, hgZ0: zF, hgLen, hg, magZ: -0.046, magY: -0.07, stockZ: zR });
  b.meta.length = stockEnd - tip;
}

// ================================================================== recipes
const R = {};

R.rifle = (b) => arFamily(b, { hg: 'classic', hgLen: 0.18, barrel: 0.37, muzzle: 'birdcage', stock: 'm4', mag: 'stanag', fsb: true });
R.ar_416 = (b) => arFamily(b, { hg: 'quad', hgLen: 0.25, barrel: 0.37, muzzle: 'flash', stock: 'crane', mag: 'stanag', magRole: 'steel_dark' });
R.ar_mcx = (b) => {
  // MCX: no buffer tube (folding stock on the upper), tapered M-LOK handguard, piston system
  arFamily(b, { hg: 'mlok_taper', hgLen: 0.27, barrel: 0.3, muzzle: 'flash', stock: 'skel', mag: 'pmag', fa: false });
  b.add('steel_dark', box(0.02, 0.016, 0.03, 0, -0.004, 0.06)); // stock hinge block
};
R.ar_spear = (b) => arFamily(b, { big: true, hg: 'mlok', hgLen: 0.3, barrel: 0.33, muzzle: 'brake', stock: 'skel', mag: 'ar10', fa: false, magRole: 'poly_black' });
R.dmr_sr25 = (b) => { arFamily(b, { big: true, hg: 'keymod', hgLen: 0.36, barrel: 0.5, muzzle: 'cap', stock: 'a2', mag: 'ar10', magRole: 'steel_dark' }); bipod(b, -0.42, -0.026); };
R.dmr_417 = (b) => arFamily(b, { big: true, hg: 'quad', hgLen: 0.29, barrel: 0.42, muzzle: 'flash', stock: 'prs', mag: 'ar10', magRole: 'steel_dark' });

// ---------------------------------------------------------------- SCAR family (L / H)
function scar(b, o) {
  const W = 0.034;
  const zR = 0.095, zF = -0.34;
  const yTop = 0.032;
  // Monolithic aluminium upper running to the front of the handguard
  b.add('body', prof([[zR, -0.014], [zF, -0.014], [zF - 0.005, 0.0], [zF, yTop], [zR, yTop]], W, 0.004));
  b.add('body', box(W - 0.004, 0.03, 0.12, 0, -0.012, zF + 0.075, 0.006)); // lower handguard section
  const railTop = picatinny(b, 'body', zR, zF, yTop);
  for (const s of [-1, 1]) railSide(b, 'body', zF + 0.13, zF + 0.01, 0.0, W / 2, s);
  railBottom(b, 'body', zF + 0.12, zF + 0.01, -0.027);
  // Polymer lower with integrated grip and magwell
  b.add('furn', prof([[zR, -0.014], [zR - 0.01, -0.04], [0.035, -0.04], [0.0, -0.04], [-0.008, -0.078], [-0.088, -0.078], [-0.09, -0.04], [-0.12, -0.03], [-0.13, -0.014]], W - 0.004, 0.004));
  triggerGuard(b, -0.005, 0.03, -0.01, { role: 'furn', w: 0.014 });
  arGrip(b, 0.035, -0.036, { angle: 0.3, len: 0.1, role: 'grip' });
  selector(b, 0.045, -0.026, W / 2);
  // Side charging handle (left)
  b.part('bolt', [-W / 2, 0.012, -0.07]).add('steel_dark', box(0.018, 0.012, 0.012, -W / 2 - 0.009, 0.012, -0.07, 0.003), cylX(0.006, 0.012, -W / 2 - 0.02, 0.012, -0.07));
  b.point('eject', W / 2 + 0.003, 0.01, 0.0);
  // Barrel & muzzle
  const bz1 = zF - o.barrel;
  barrel(b, zF, bz1, o.heavy ? 0.0105 : 0.0088, { taper: 0.95 });
  b.add('steel_dark', box(0.03, 0.026, 0.03, 0, 0.004, zF - 0.02, 0.004)); // gas block
  const tip = muzzleDevice(b, o.heavy ? 'brake' : 'flash', bz1, o.heavy ? 0.0105 : 0.0088);
  flipSights(b, zR - 0.03, zF + 0.02, railTop, {});
  // Folding stock with cheek riser
  const st = b.part('stock', [0, 0, zR]);
  st.add('furn', prof([[zR, 0.026], [zR + 0.24, 0.036], [zR + 0.29, 0.036], [zR + 0.3, -0.085], [zR + 0.26, -0.09], [zR + 0.07, -0.032], [zR, -0.03]], 0.042, 0.007));
  st.add('slot', box(0.044, 0.04, 0.12, 0, -0.03, zR + 0.17, 0.008));
  st.add('rubber', box(0.044, 0.125, 0.012, 0, -0.026, zR + 0.302, 0.004));
  st.add('furn', box(0.03, 0.016, 0.1, 0, 0.044, zR + 0.21, 0.006)); // cheek piece
  if (o.heavy) boxMag(b, 'mag', -0.05, -0.074, { len: 0.11, w: 0.028, d: 0.082, rake: 0.12, role: 'steel_dark' });
  else stanag(b, 'mag', -0.05, -0.074, { len: 0.165, role: 'steel_dark' });
  const hg = { bottom: -0.033, side: W / 2 + 0.011 };
  railMounts(b, { railTop, opticZ: -0.04, muzzleZ: tip, hgZ0: zF + 0.12, hgLen: 0.13, hg, magZ: -0.05, magY: -0.074, stockZ: zR });
  b.point('support', 0, -0.05, zF + 0.07);
}
R.ar_scarl = (b) => scar(b, { barrel: 0.3 });
R.ar_scarh = (b) => scar(b, { barrel: 0.36, heavy: true });

// ---------------------------------------------------------------- AK family
function akFamily(b, o) {
  const W = 0.029;
  const zR = 0.095, zF = -0.15;
  // Stamped receiver + trunnions + top cover with rail
  b.add('body', prof([[zR, -0.012], [zR, -0.04], [-0.02, -0.04], [-0.03, -0.046], [-0.09, -0.046], [zF, -0.036], [zF, 0.012], [zR - 0.02, 0.016], [zR, 0.004]], W, 0.002));
  b.add('body', box(W + 0.002, 0.016, zR - zF - 0.02, 0, 0.02, (zR + zF) / 2 + 0.01, 0.006)); // dust cover
  if (!b.lod) for (let k = 0; k < 3; k++) b.add('body', box(W + 0.004, 0.003, 0.008, 0, 0.026, zR - 0.04 - k * 0.012, 0.001));
  const railTop = picatinny(b, 'body', zR - 0.01, zF + 0.02, 0.026);
  // Long selector lever on the right
  b.add('steel_dark', box(0.003, 0.012, 0.11, W / 2 + 0.002, -0.004, -0.03, 0.001, { rx: 0.08 }));
  b.point('eject', W / 2 + 0.003, 0.008, -0.02);
  // Gas tube + handguard with rails
  b.add('steel_dark', cyl(0.011, 0.22, 0, 0.03, zF - 0.11, { seg: b.seg(14) }));
  const hgLen = o.hgLen || 0.21;
  b.add(o.wood ? 'wood' : 'furn', box(0.05, 0.048, hgLen, 0, 0.002, zF - hgLen / 2, 0.01));
  if (!o.wood) {
    railBottom(b, 'body', zF - 0.01, zF - hgLen + 0.01, -0.022);
    for (const s of [-1, 1]) railSide(b, 'body', zF - 0.06, zF - hgLen + 0.01, 0.002, 0.025, s, 0.017);
    picatinny(b, 'body', zF - 0.005, zF - hgLen + 0.005, 0.042);
  } else if (!b.lod) {
    for (let k = 0; k < 5; k++) for (const s of [-1, 1]) b.add('slot', box(0.002, 0.006, 0.026, s * 0.0255, 0.012, zF - 0.03 - k * 0.04, 0.001));
  }
  // Barrel, front sight block, muzzle
  const bz1 = zF - o.barrel;
  barrel(b, zF - hgLen, bz1, o.br || 0.009);
  b.add('steel_dark', box(0.022, 0.04, 0.03, 0, 0.012, bz1 + 0.05, 0.004));
  b.add('steel_dark', box(0.004, 0.022, 0.004, 0, 0.042, bz1 + 0.05));
  const tip = muzzleDevice(b, o.muzzle, bz1, o.br || 0.009);
  // Grip
  if (o.thumbhole) {
    // SVD: skeleton thumbhole stock carries the grip
  } else {
    arGrip(b, 0.042, -0.038, { angle: 0.32, len: 0.1, role: 'grip' });
  }
  triggerGuard(b, -0.004, 0.034, -0.012, { role: 'steel_dark', w: 0.01 });
  // Charging handle on the bolt carrier (right side)
  b.part('bolt', [W / 2, 0.006, -0.05]).add('steel_dark', cylX(0.0055, 0.024, W / 2 + 0.012, 0.006, -0.05), sphere(0.0075, W / 2 + 0.024, 0.006, -0.05, 10));
  // Stock
  const st = b.part('stock', [0, 0, zR]);
  if (o.thumbhole) {
    st.add('wood', prof([[zR, 0.012], [zR + 0.3, 0.03], [zR + 0.38, 0.03], [zR + 0.39, -0.13], [zR + 0.34, -0.135], [zR + 0.2, -0.06], [zR + 0.1, -0.13], [zR + 0.06, -0.13], [zR + 0.02, -0.04], [zR, -0.04]], 0.04, 0.008));
    st.add('slot', box(0.042, 0.04, 0.08, 0, -0.035, zR + 0.15, 0.015)); // thumbhole
    st.add('slot', box(0.042, 0.045, 0.1, 0, -0.07, zR + 0.27, 0.02)); // skeleton cut
    st.add('wood', box(0.03, 0.02, 0.12, 0, 0.042, zR + 0.26, 0.006)); // cheek rest
    st.add('rubber', box(0.042, 0.165, 0.012, 0, -0.05, zR + 0.392, 0.004));
    b.point('grip', 0, -0.085, zR + 0.06);
  } else {
    st.add('body', box(0.026, 0.03, 0.03, 0, -0.012, zR + 0.015, 0.004)); // folding hinge
    st.add('steel_dark', cyl(0.01, 0.2, 0, 0.004, zR + 0.12, { seg: b.seg(12) }));
    st.add('furn', prof([[zR + 0.13, 0.03], [zR + 0.3, 0.036], [zR + 0.305, -0.085], [zR + 0.27, -0.09], [zR + 0.18, -0.035], [zR + 0.13, -0.03]], 0.044, 0.007));
    st.add('rubber', box(0.046, 0.125, 0.012, 0, -0.025, zR + 0.31, 0.004));
    st.add('slot', box(0.046, 0.03, 0.08, 0, -0.045, zR + 0.24, 0.01));
  }
  // Magazine
  if (o.box) boxMag(b, 'mag', -0.06, -0.044, { len: o.box.len, w: o.box.w, d: o.box.d, rake: 0.06, role: o.magRole || 'steel_dark' });
  else akMag(b, 'mag', -0.06, -0.044, { len: o.magLen || 0.19, curve: o.curve || 0.5, role: o.magRole || 'poly_plum' });
  b.meta.ironY = railTop + 0.02;
  flipSights(b, zR - 0.02, zF - hgLen + 0.03, railTop, { folded: false });
  const hg = { bottom: -0.035, side: 0.036 };
  railMounts(b, { railTop, opticZ: -0.02, muzzleZ: tip, hgZ0: zF, hgLen, hg, magZ: -0.06, magY: -0.044, stockZ: zR });
}
R.ar_ak12 = (b) => akFamily(b, { barrel: 0.42, muzzle: 'ak', magRole: 'poly_black', curve: 0.42, magLen: 0.18 });
R.ar_ak15 = (b) => akFamily(b, { barrel: 0.42, br: 0.0098, muzzle: 'brake', magRole: 'poly_black', curve: 0.62, magLen: 0.2 });
R.dmr_svd = (b) => akFamily(b, { barrel: 0.62, muzzle: 'svd', wood: true, hgLen: 0.24, thumbhole: true, box: { len: 0.1, w: 0.03, d: 0.085 }, magRole: 'steel_dark' });
R.sg_saiga = (b) => akFamily(b, { barrel: 0.43, br: 0.013, muzzle: 'cap', box: { len: 0.13, w: 0.034, d: 0.1 }, magRole: 'poly_black' });

// ---------------------------------------------------------------- MK14 EBR-style chassis
R.dmr_mk14 = (b) => {
  const W = 0.05;
  // Aluminium chassis with full-length top rail, side rails, adjustable stock on a tube
  b.add('body', prof([[0.12, -0.03], [-0.42, -0.03], [-0.42, 0.026], [0.12, 0.026]], W, 0.006));
  b.add('steel', prof([[0.09, 0.026], [-0.12, 0.026], [-0.12, 0.05], [0.07, 0.05]], 0.03, 0.003)); // action
  const railTop = picatinny(b, 'body', 0.11, -0.41, 0.05, { w: 0.022 });
  for (const s of [-1, 1]) railSide(b, 'body', -0.15, -0.4, 0.0, W / 2, s, 0.02);
  vents(b, -0.16, -0.4, -0.01, W / 2, { count: 6, r: 0.006 });
  b.part('bolt', [0.0, 0.035, -0.05]).add('steel_dark', box(0.01, 0.012, 0.03, 0.022, 0.035, -0.05, 0.002), box(0.014, 0.01, 0.01, 0.03, 0.035, -0.035, 0.002)); // op rod handle
  b.point('eject', 0.017, 0.04, 0.0);
  triggerGuard(b, -0.004, 0.034, -0.026, { w: 0.014 });
  arGrip(b, 0.04, -0.03, { angle: 0.34, len: 0.105 });
  barrel(b, -0.42, -0.6, 0.0095);
  const tip = muzzleDevice(b, 'flash', -0.6, 0.0095);
  const st = b.part('stock', [0, 0, 0.12]);
  st.add('steel_dark', cyl(0.014, 0.24, 0, 0.0, 0.24, { seg: b.seg(14) }));
  st.add('furn', prof([[0.25, 0.04], [0.4, 0.044], [0.41, -0.1], [0.38, -0.105], [0.3, -0.04], [0.25, -0.03]], 0.046, 0.007));
  st.add('furn', box(0.03, 0.024, 0.1, 0, 0.05, 0.33, 0.006));
  st.add('rubber', box(0.048, 0.15, 0.014, 0, -0.03, 0.414, 0.004));
  boxMag(b, 'mag', -0.06, -0.03, { len: 0.11, w: 0.028, d: 0.085, rake: 0.1 });
  flipSights(b, 0.08, -0.38, railTop, {});
  railMounts(b, { railTop, opticZ: -0.02, muzzleZ: tip, hgZ0: -0.15, hgLen: 0.26, hg: { bottom: -0.03, side: W / 2 + 0.01 }, magZ: -0.06, magY: -0.03, stockZ: 0.12 });
  bipod(b, -0.33, -0.03);
};

// ---------------------------------------------------------------- BREN 2-style
R.ar_bren = (b) => {
  const W = 0.032;
  b.add('body', prof([[0.1, -0.012], [-0.17, -0.012], [-0.17, 0.03], [0.1, 0.03]], W, 0.004)); // aluminium upper
  const railTop = picatinny(b, 'body', 0.1, -0.17, 0.03);
  // Polymer lower with integrated grip & flared magwell
  b.add('furn', prof([[0.1, -0.012], [0.1, -0.034], [0.035, -0.036], [0.0, -0.036], [-0.006, -0.08], [-0.085, -0.08], [-0.09, -0.04], [-0.17, -0.032], [-0.17, -0.012]], W - 0.002, 0.004));
  triggerGuard(b, -0.004, 0.032, -0.006, { role: 'furn', w: 0.016 });
  arGrip(b, 0.036, -0.032, { angle: 0.32, len: 0.105 });
  selector(b, 0.045, -0.02, W / 2);
  b.part('bolt', [-W / 2, 0.012, -0.11]).add('steel_dark', box(0.016, 0.01, 0.014, -W / 2 - 0.008, 0.012, -0.11, 0.003));
  b.point('eject', W / 2 + 0.003, 0.008, 0.0);
  const hg = handguard(b, 'mlok', -0.17, 0.2, { r: 0.026, railY: 0.03 });
  barrel(b, -0.36, -0.53, 0.0088);
  b.add('steel_dark', cyl(0.012, 0.02, 0, 0, -0.37, { seg: 14 }));
  const tip = muzzleDevice(b, 'flash', -0.53, 0.0088);
  const st = b.part('stock', [0, 0, 0.1]);
  st.add('furn', box(0.03, 0.05, 0.03, 0, -0.005, 0.115, 0.006));
  st.add('furn', prof([[0.12, 0.025], [0.36, 0.034], [0.37, -0.085], [0.34, -0.09], [0.28, -0.04], [0.2, -0.012], [0.12, -0.025]], 0.04, 0.007));
  st.add('slot', box(0.042, 0.045, 0.1, 0, -0.03, 0.27, 0.012));
  st.add('rubber', box(0.042, 0.12, 0.012, 0, -0.028, 0.372, 0.004));
  stanag(b, 'mag', -0.046, -0.078, { len: 0.16, pmag: true, role: 'poly_black' });
  flipSights(b, 0.08, -0.35, railTop, {});
  railMounts(b, { railTop, opticZ: -0.04, muzzleZ: tip, hgZ0: -0.17, hgLen: 0.2, hg, magZ: -0.046, magY: -0.078, stockZ: 0.1 });
};

// ---------------------------------------------------------------- X95-style bullpup
R.ar_x95 = (b) => {
  const W = 0.05;
  // One-piece polymer bullpup body: forward trigger group, magazine behind the grip, butt plate
  b.add('furn', prof([[0.39, 0.03], [0.39, -0.1], [0.3, -0.105], [0.22, -0.045], [0.08, -0.045], [0.04, -0.04], [-0.02, -0.04], [-0.07, -0.05], [-0.16, -0.05], [-0.2, -0.02], [-0.2, 0.03]], W, 0.01));
  b.add('furn', prof([[0.06, -0.045], [-0.06, -0.045], [-0.07, -0.12], [-0.05, -0.135], [0.07, -0.135], [0.08, -0.12]], 0.024, 0.006)); // closed trigger guard
  b.add('slot', box(0.026, 0.06, 0.09, 0, -0.09, 0.005, 0.008));
  arGrip(b, 0.02, -0.045, { angle: 0.12, len: 0.095, role: 'grip' });
  b.add('rubber', box(0.052, 0.135, 0.014, 0, -0.035, 0.396, 0.005));
  const railTop = picatinny(b, 'body', 0.33, -0.19, 0.03);
  b.add('body', box(0.052, 0.006, 0.06, 0, -0.01, 0.15, 0.002)); // ejection cover strip
  b.part('bolt', [-W / 2, 0.012, -0.12]).add('steel_dark', box(0.016, 0.01, 0.014, -W / 2 - 0.008, 0.01, -0.12, 0.003));
  b.point('eject', W / 2 + 0.003, 0.005, 0.15);
  barrel(b, -0.2, -0.33, 0.0085);
  const tip = muzzleDevice(b, 'flash', -0.33, 0.0085);
  stanag(b, 'mag', 0.13, -0.045, { len: 0.165, pmag: true, role: 'poly_black' });
  flipSights(b, 0.28, -0.17, railTop, { folded: false });
  railMounts(b, { railTop, opticZ: 0.12, muzzleZ: tip, hgZ0: -0.07, hgLen: 0.12, hg: { bottom: -0.05, side: W / 2 }, magZ: 0.13, magY: -0.045 });
  b.point('support', 0, -0.07, -0.12);
  b.meta.bullpup = true;
};

// ---------------------------------------------------------------- SMGs
R.smg_mp5 = (b) => {
  // Stamped tube receiver, cocking tube over the barrel, slimline handguard, drum rear sight
  b.add('body', cyl(0.021, 0.27, 0, 0.012, -0.035, { seg: b.seg(18) }));
  b.add('body', box(0.034, 0.03, 0.27, 0, -0.006, -0.035, 0.004));
  b.add('body', cyl(0.011, 0.14, 0, 0.022, -0.235, { seg: b.seg(12) })); // cocking tube
  b.add('furn', box(0.042, 0.04, 0.11, 0, -0.005, -0.215, 0.012)); // handguard
  if (!b.lod) for (let k = 0; k < 4; k++) b.add('furn', box(0.044, 0.004, 0.012, 0, -0.012, -0.175 - k * 0.022, 0.002));
  b.part('bolt', [-0.012, 0.022, -0.26]).add('steel_dark', box(0.006, 0.01, 0.012, -0.016, 0.03, -0.26, 0.002), sphere(0.006, -0.02, 0.038, -0.26, 8));
  b.add('steel_dark', box(0.03, 0.012, 0.03, 0, 0.004, -0.122, 0.003)); // trunnion
  barrel(b, -0.27, -0.34, 0.0085);
  b.add('steel_dark', cyl(0.012, 0.026, 0, 0, -0.33, { seg: 12 })); // tri-lug
  const tip = muzzleDevice(b, 'cap', -0.343, 0.0085);
  // Hooded front sight + drum rear sight
  b.add('steel_dark', tor(0.012, 0.0025, PI * 1.6, 0, 0.044, -0.3, { ry: PI / 2, rz: -0.3 * PI }, [6, 14]));
  b.add('steel_dark', box(0.018, 0.02, 0.016, 0, 0.032, -0.3, 0.002));
  b.add('steel_dark', cylX(0.011, 0.024, 0, 0.044, 0.07, 14), box(0.016, 0.014, 0.02, 0, 0.032, 0.07, 0.002));
  b.meta.ironY = 0.046;
  // Trigger pack + grip
  b.add('furn', prof([[0.09, -0.02], [0.09, -0.04], [0.05, -0.044], [0.02, -0.044], [0.0, -0.034], [-0.02, -0.03], [-0.02, -0.02]], 0.03, 0.004));
  triggerGuard(b, -0.003, 0.03, -0.012, { role: 'furn', w: 0.014 });
  arGrip(b, 0.048, -0.04, { angle: 0.28, len: 0.1 });
  b.point('eject', 0.019, 0.01, -0.03);
  // Retractable stock: two struts + butt plate
  const st = b.part('stock', [0, 0, 0.1]);
  for (const s of [-1, 1]) st.add('steel_dark', cyl(0.0055, 0.2, s * 0.019, 0.004, 0.2, { seg: b.seg(10) }));
  st.add('steel_dark', box(0.05, 0.016, 0.02, 0, 0.004, 0.1, 0.004));
  st.add('rubber', box(0.05, 0.1, 0.02, 0, -0.02, 0.3, 0.006));
  stanag(b, 'mag', -0.085, -0.02, { len: 0.15, curve: 0.38, w: 0.02, d: 0.04, role: 'steel_dark' });
  b.add('steel_dark', box(0.024, 0.02, 0.05, 0, -0.026, -0.085, 0.002)); // magwell
  const railTop = picatinny(b, 'steel_dark', 0.05, -0.1, 0.034, { w: 0.02 }); // claw mount rail
  railMounts(b, { railTop, opticZ: -0.03, muzzleZ: tip, hgZ0: -0.16, hgLen: 0.11, hg: { bottom: -0.025, side: 0.021 }, magZ: -0.085, magY: -0.02, stockZ: 0.1 });
};

R.smg_mp7 = (b) => {
  // Compact polymer PDW: magazine in the grip, folding front grip, telescoping stock
  b.add('furn', prof([[0.12, -0.02], [0.12, 0.03], [-0.15, 0.03], [-0.17, 0.0], [-0.15, -0.03], [-0.04, -0.03], [-0.02, -0.04], [0.06, -0.04], [0.12, -0.02]], 0.04, 0.008));
  const railTop = picatinny(b, 'furn', 0.11, -0.14, 0.03, { w: 0.02 });
  for (const s of [-1, 1]) railSide(b, 'furn', -0.07, -0.14, -0.002, 0.02, s, 0.017);
  // Grip with magazine inside (baseplate visible)
  b.add('grip', prof([[0.035, -0.035], [0.075, -0.035], [0.092, -0.14], [0.06, -0.15], [0.04, -0.15], [0.03, -0.1]], 0.034, 0.008));
  b.point('grip', 0, -0.085, 0.06);
  triggerGuard(b, -0.01, 0.03, -0.01, { role: 'furn', w: 0.014 });
  const mag = b.part('mag', [0, -0.15, 0.065]);
  mag.add('poly_black', box(0.024, 0.11, 0.032, 0, -0.1, 0.064, 0.003, { rx: -0.17 }), box(0.03, 0.012, 0.042, 0, -0.158, 0.073, 0.004, { rx: -0.17 }));
  b.mount('mag', 0, -0.15, 0.065);
  // Folding foregrip
  b.add('furn', box(0.022, 0.07, 0.024, 0, -0.065, -0.11, 0.008, { rx: 0.2 }));
  b.point('support', 0, -0.07, -0.11);
  b.add('steel_dark', box(0.024, 0.012, 0.03, 0, -0.026, -0.11, 0.004));
  barrel(b, -0.17, -0.2, 0.0072);
  const tip = muzzleDevice(b, 'flash', -0.2, 0.0072);
  b.part('bolt', [0, 0.02, 0.12]).add('steel_dark', box(0.03, 0.008, 0.012, 0, 0.022, 0.125, 0.002));
  b.point('eject', 0.021, 0.006, -0.01);
  const st = b.part('stock', [0, 0, 0.12]);
  for (const s of [-1, 1]) st.add('steel_dark', cyl(0.004, 0.14, s * 0.014, 0.0, 0.18, { seg: 8 }));
  st.add('furn', box(0.04, 0.07, 0.016, 0, -0.012, 0.25, 0.006));
  flipSights(b, 0.08, -0.12, railTop, { folded: false });
  b.mount('optic', 0, railTop, -0.01);
  b.mount('muzzle', 0, 0, tip);
  b.mount('light', -0.03, -0.002, -0.12, { side: -1 });
  b.mount('laser', 0.03, -0.002, -0.1, { side: 1 });
  b.mount('stock', 0, 0, 0.12);
  b.point('muzzle', 0, 0, tip);
};

R.smg_p90 = (b) => {
  // Smooth bullpup PDW with thumbhole grip and a top-mounted magazine
  b.add('furn', prof([[0.25, 0.02], [0.25, -0.09], [0.18, -0.095], [0.12, -0.05], [0.05, -0.05], [0.04, -0.12], [0.0, -0.13], [-0.03, -0.12], [-0.06, -0.05], [-0.14, -0.04], [-0.2, -0.025], [-0.22, 0.0], [-0.2, 0.02]], 0.055, 0.016));
  b.add('slot', box(0.057, 0.05, 0.05, 0, -0.085, 0.02, 0.015)); // thumbhole
  b.add('slot', box(0.057, 0.032, 0.06, 0, -0.07, 0.15, 0.012));
  b.point('grip', 0, -0.09, 0.075);
  b.point('support', 0, -0.07, -0.06);
  b.add('rubber', box(0.057, 0.11, 0.012, 0, -0.035, 0.255, 0.006));
  // Translucent top magazine (part 'mag', slides up/back on reload)
  const mag = b.part('mag', [0, 0.03, 0.08]);
  mag.add('lens_amber', box(0.04, 0.03, 0.27, 0, 0.036, 0.02, 0.008));
  mag.add('brass', box(0.03, 0.01, 0.24, 0, 0.034, 0.02, 0.002));
  b.mount('mag', 0, 0.03, 0.08);
  b.add('furn', box(0.044, 0.02, 0.04, 0, 0.03, -0.14, 0.006)); // front sight housing
  const railTop = picatinny(b, 'furn', 0.11, -0.08, 0.055, { w: 0.02 });
  for (const s of [-1, 1]) b.add('furn', box(0.004, 0.04, 0.3, s * 0.022, 0.035, 0.02, 0.002)); // mag rails
  barrel(b, -0.21, -0.25, 0.0075);
  const tip = muzzleDevice(b, 'flash', -0.25, 0.0075);
  b.part('bolt', [-0.028, 0.0, -0.1]).add('steel_dark', box(0.008, 0.01, 0.016, -0.03, 0.0, -0.1, 0.002));
  b.point('eject', 0, -0.13, 0.1);
  b.meta.ironY = railTop + 0.01;
  b.mount('optic', 0, railTop, 0.02);
  b.mount('muzzle', 0, 0, tip);
  b.mount('light', -0.028, -0.01, -0.16, { side: -1 });
  b.mount('laser', 0.028, -0.01, -0.15, { side: 1 });
  b.point('muzzle', 0, 0, tip);
};

R.smg_vector = (b) => {
  // Boxy upper with full rail; slanted lower with the magazine forward of the trigger
  b.add('body', prof([[0.1, 0.0], [-0.21, 0.0], [-0.21, 0.035], [0.1, 0.035]], 0.04, 0.004));
  const railTop = picatinny(b, 'body', 0.1, -0.21, 0.035);
  b.add('furn', prof([[0.1, 0.0], [0.1, -0.03], [0.05, -0.04], [-0.04, -0.12], [-0.12, -0.12], [-0.19, -0.04], [-0.21, 0.0]], 0.05, 0.008));
  b.add('slot', box(0.052, 0.03, 0.05, 0, -0.06, -0.16, 0.01));
  arGrip(b, 0.08, -0.03, { angle: 0.25, len: 0.1 });
  triggerGuard(b, 0.03, 0.07, -0.02, { role: 'furn', w: 0.016 });
  for (const s of [-1, 1]) railSide(b, 'body', -0.13, -0.2, 0.012, 0.02, s, 0.016);
  railBottom(b, 'furn', -0.13, -0.2, -0.04, 0.018);
  barrel(b, -0.21, -0.27, 0.0095);
  const tip = muzzleDevice(b, 'flash', -0.27, 0.0095);
  b.part('bolt', [-0.02, 0.018, -0.06]).add('steel_dark', box(0.012, 0.01, 0.02, -0.026, 0.018, -0.06, 0.003));
  b.point('eject', 0.022, 0.016, -0.02);
  boxMag(b, 'mag', -0.06, -0.11, { len: 0.17, w: 0.026, d: 0.034, rake: 0.0, role: 'poly_black', ribs: false });
  const st = b.part('stock', [0, 0.012, 0.1]);
  st.add('furn', box(0.032, 0.03, 0.04, 0, 0.012, 0.115, 0.006));
  st.add('steel_dark', cyl(0.012, 0.13, 0, 0.012, 0.2, { seg: b.seg(12) }));
  st.add('furn', prof([[0.2, 0.04], [0.33, 0.044], [0.335, -0.075], [0.31, -0.08], [0.24, -0.02], [0.2, -0.015]], 0.04, 0.006));
  flipSights(b, 0.08, -0.19, railTop, {});
  b.mount('optic', 0, railTop, -0.04);
  b.mount('muzzle', 0, 0, tip);
  b.mount('under', 0, -0.046, -0.17);
  b.mount('light', -0.03, 0.012, -0.19, { side: -1 });
  b.mount('laser', 0.03, 0.012, -0.18, { side: 1 });
  b.mount('mag', 0, -0.11, -0.06);
  b.mount('stock', 0, 0.012, 0.1);
  b.point('support', 0, -0.07, -0.16);
  b.point('muzzle', 0, 0, tip);
};

function compactSmg(b, o) {
  // AR-like compact receivers (MPX / APC9)
  const W = o.boxy ? 0.036 : 0.028;
  b.add('body', prof([[0.08, -0.012], [-0.12, -0.012], [-0.12, 0.03], [0.08, 0.03]], W, o.boxy ? 0.006 : 0.003));
  const railTop = picatinny(b, 'body', 0.08, -0.12, 0.03);
  b.add(o.boxy ? 'furn' : 'body', prof([[0.08, -0.012], [0.08, -0.032], [0.03, -0.036], [0.0, -0.04], [-0.006, -0.07], [-0.07, -0.07], [-0.075, -0.036], [-0.12, -0.03], [-0.12, -0.012]], W - 0.002, 0.003));
  triggerGuard(b, -0.004, 0.03, -0.006, { w: 0.014 });
  arGrip(b, 0.032, -0.03, { angle: 0.34, len: 0.1 });
  selector(b, 0.04, -0.02, W / 2);
  if (o.boxy) b.part('bolt', [0, 0.034, 0.02]).add('steel_dark', box(0.014, 0.012, 0.026, 0, 0.04, 0.02, 0.003));
  else b.part('bolt', [0, 0.024, 0.08]).add('steel_dark', box(0.044, 0.007, 0.016, 0, 0.024, 0.086, 0.002));
  b.point('eject', W / 2 + 0.003, 0.008, -0.02);
  const hg = handguard(b, 'mlok', -0.12, o.hgLen, { r: 0.023, railY: 0.03 });
  barrel(b, -0.12 - o.hgLen, -0.12 - o.hgLen - 0.04, 0.0085);
  const tip = muzzleDevice(b, o.boxy ? 'flash' : 'cap', -0.12 - o.hgLen - 0.04, 0.0085);
  const st = b.part('stock', [0, -0.004, 0.08]);
  st.add('body', box(0.026, 0.034, 0.024, 0, -0.004, 0.092, 0.004));
  st.add('steel_dark', cyl(0.006, 0.18, 0, 0.012, 0.18, { seg: 8 }), cyl(0.006, 0.17, 0, -0.03, 0.18, { seg: 8 }));
  st.add('furn', box(0.034, 0.1, 0.02, 0, -0.012, 0.27, 0.006));
  stanag(b, 'mag', -0.038, -0.07, { len: 0.15, curve: o.boxy ? 0.25 : 0.12, w: 0.02, d: 0.036, pmag: true, role: 'poly_black' });
  flipSights(b, 0.06, -0.1 - o.hgLen, railTop, {});
  railMounts(b, { railTop, opticZ: -0.03, muzzleZ: tip, hgZ0: -0.12, hgLen: o.hgLen, hg, magZ: -0.038, magY: -0.07, stockZ: 0.08 });
}
R.smg_mpx = (b) => compactSmg(b, { hgLen: 0.16 });
R.smg_apc9 = (b) => compactSmg(b, { hgLen: 0.14, boxy: true });

// ---------------------------------------------------------------- bolt-action chassis rifles
function chassis(b, o) {
  const W = o.W || 0.05;
  // Round action + bolt
  b.add('steel', cyl(0.0175, 0.2, 0, 0.006, 0.02, { seg: b.seg(18) }));
  const bolt = b.part('bolt', [0, 0.006, 0.09]);
  bolt.add('steel_bright', cyl(0.009, 0.05, 0, 0.006, 0.12, { seg: 12 }));
  bolt.add('steel_dark', cylX(0.004, 0.05, 0.026, 0.006, 0.09), sphere(o.bigKnob ? 0.011 : 0.009, 0.052, 0.0, 0.09, 12));
  b.point('eject', 0.019, 0.01, 0.03);
  // Chassis body with magwell and grip area
  b.add('body', prof([[0.15, 0.0], [0.15, -0.035], [0.06, -0.038], [0.0, -0.05], [-0.09, -0.05], [-0.12, -0.03], [-0.12, 0.0]], W, 0.006));
  const railTop = picatinny(b, 'body', 0.13, -0.12 - o.fore + 0.03, 0.026, { w: 0.022 });
  triggerGuard(b, -0.004, 0.035, -0.028, { w: 0.016 });
  arGrip(b, 0.06, -0.034, { angle: 0.22, len: 0.105, role: 'grip' });
  // Forend
  if (o.forend === 'tube') {
    b.add('body', cyl(0.032, o.fore, 0, 0.0, -0.12 - o.fore / 2, { seg: b.seg(18) }));
    vents(b, -0.15, -0.12 - o.fore + 0.03, 0.0, 0.031, { count: Math.round(o.fore / 0.05), r: 0.006 });
  } else {
    b.add('body', box(W * 0.9, 0.05, o.fore, 0, -0.004, -0.12 - o.fore / 2, 0.008));
    mlok(b, -0.14, -0.12 - o.fore + 0.02, -0.004, W * 0.45, { count: Math.round(o.fore / 0.07) });
  }
  // Heavy fluted barrel + brake
  const bz1 = -0.12 - o.barrel;
  barrel(b, -0.08, bz1, o.br || 0.011, { fluted: true, taper: 0.9 });
  const tip = muzzleDevice(b, o.muzzle || 'brake', bz1, o.br || 0.011);
  // Stock
  const st = b.part('stock', [0, 0, 0.15]);
  if (o.stock === 'skeleton') {
    st.add('body', box(0.03, 0.04, 0.03, 0, -0.01, 0.165, 0.005));
    st.add('body', box(0.02, 0.016, 0.26, 0, 0.022, 0.29, 0.005), box(0.02, 0.016, 0.26, 0, -0.07, 0.29, 0.005));
    st.add('furn', box(0.032, 0.026, 0.12, 0, 0.045, 0.31, 0.006)); // cheek riser
    st.add('body', box(0.034, 0.15, 0.024, 0, -0.03, 0.42, 0.006));
    st.add('rubber', box(0.036, 0.15, 0.012, 0, -0.03, 0.437, 0.004));
    st.add('knurl', cylX(0.007, 0.04, 0, -0.07, 0.38));
  } else if (o.stock === 'thumbhole') {
    st.add('furn', prof([[0.15, 0.02], [0.42, 0.036], [0.44, -0.13], [0.39, -0.13], [0.26, -0.06], [0.2, -0.12], [0.16, -0.12], [0.15, -0.04]], 0.044, 0.01));
    st.add('slot', box(0.046, 0.045, 0.06, 0, -0.05, 0.215, 0.015));
    st.add('furn', box(0.03, 0.02, 0.12, 0, 0.046, 0.33, 0.006));
    st.add('rubber', box(0.046, 0.17, 0.014, 0, -0.045, 0.442, 0.004));
  } else if (o.stock === 'tube') {
    st.add('steel_dark', cyl(0.016, 0.26, 0, -0.01, 0.28, { seg: b.seg(14) }));
    if (!b.lod) for (let k = 0; k < 3; k++) st.add('steel_dark', cyl(0.02, 0.012, 0, -0.01, 0.2 + k * 0.05, { seg: 14 }));
    st.add('body', box(0.03, 0.03, 0.14, 0, 0.032, 0.32, 0.006));
    st.add('body', box(0.034, 0.13, 0.03, 0, -0.035, 0.43, 0.006));
    st.add('rubber', box(0.036, 0.13, 0.012, 0, -0.035, 0.45, 0.004));
  } else { // 'solid' folding
    st.add('body', prof([[0.15, 0.02], [0.43, 0.034], [0.44, -0.12], [0.41, -0.125], [0.3, -0.05], [0.15, -0.04]], 0.044, 0.008));
    st.add('slot', box(0.046, 0.04, 0.14, 0, -0.06, 0.32, 0.012));
    st.add('rubber', box(0.046, 0.16, 0.014, 0, -0.045, 0.444, 0.004));
  }
  boxMag(b, 'mag', -0.04, -0.045, { len: o.magLen || 0.07, w: 0.03, d: o.magD || 0.09, rake: 0.0, role: 'steel_dark' });
  if (o.bipod) bipod(b, -0.12 - o.fore + 0.05, o.forend === 'tube' ? -0.032 : -0.03);
  b.meta.ironY = railTop + 0.03;
  const hg = { bottom: -0.03, side: W * 0.45 };
  railMounts(b, { railTop, opticZ: 0.03, muzzleZ: tip, hgZ0: -0.12, hgLen: o.fore, hg, magZ: -0.04, magY: -0.045, stockZ: 0.15 });
  b.point('support', 0, -0.06, -0.16);
}
R.sn_axmc = (b) => chassis(b, { fore: 0.33, barrel: 0.62, stock: 'skeleton', bipod: true, bigKnob: true });
R.sn_mrad = (b) => chassis(b, { fore: 0.36, barrel: 0.6, stock: 'solid', magLen: 0.1, W: 0.052 });
R.sn_trg = (b) => chassis(b, { fore: 0.3, barrel: 0.6, stock: 'thumbhole', bipod: true, muzzle: 'cap' });
R.sn_m200 = (b) => chassis(b, { fore: 0.42, barrel: 0.68, br: 0.0135, stock: 'tube', forend: 'tube', bipod: true, muzzle: 'big_brake', bigKnob: true, magD: 0.11 });
R.sn_bolt = (b) => chassis(b, { fore: 0.3, barrel: 0.56, stock: 'skeleton', muzzle: 'brake', W: 0.046 });

// ---------------------------------------------------------------- AM-50 anti-materiel
R.sn_m82 = (b) => {
  const W = 0.055;
  // Stamped upper/lower receivers with lightening cuts and a perforated barrel shroud
  b.add('body', prof([[0.38, -0.02], [0.38, 0.05], [-0.3, 0.05], [-0.33, 0.02], [-0.33, -0.03], [0.0, -0.03], [-0.02, -0.045], [-0.15, -0.045], [-0.17, -0.03]], W, 0.006));
  if (!b.lod) for (let k = 0; k < 4; k++) for (const s of [-1, 1]) b.add('slot', box(0.002, 0.026, 0.05, s * (W / 2 + 0.0005), 0.018, 0.3 - k * 0.07, 0.006));
  const railTop = picatinny(b, 'body', 0.2, -0.28, 0.05, { w: 0.024 });
  b.add('steel_dark', cyl(0.03, 0.3, 0, 0.008, -0.48, { seg: b.seg(18) })); // shroud
  vents(b, -0.36, -0.6, 0.008, 0.03, { count: 6, r: 0.007, rows: 2, dy: 0.0 });
  barrel(b, -0.6, -0.95, 0.0145);
  const tip = muzzleDevice(b, 'big_brake', -0.95, 0.0145);
  // Carry handle
  b.add('steel_dark', box(0.012, 0.012, 0.12, 0, 0.09, -0.12, 0.004), box(0.012, 0.04, 0.012, 0, 0.07, -0.07), box(0.012, 0.04, 0.012, 0, 0.07, -0.17));
  // Grip + trigger
  arGrip(b, 0.12, -0.02, { angle: 0.3, len: 0.11 });
  triggerGuard(b, 0.07, 0.11, 0.01, { w: 0.016 });
  // Butt + monopod
  b.add('furn', box(0.05, 0.12, 0.06, 0, 0.0, 0.41, 0.012));
  b.add('rubber', box(0.052, 0.13, 0.025, 0, 0.0, 0.45, 0.008));
  b.add('steel_dark', cylY(0.007, 0.07, 0, -0.08, 0.38, 8));
  b.part('bolt', [0.03, 0.02, 0.0]).add('steel_dark', box(0.02, 0.016, 0.02, 0.036, 0.02, 0.0, 0.004));
  b.point('eject', W / 2 + 0.003, 0.02, 0.05);
  boxMag(b, 'mag', -0.08, -0.03, { len: 0.12, w: 0.042, d: 0.12, rake: 0.05 });
  bipod(b, -0.5, -0.022, { len: 0.26 });
  b.meta.ironY = railTop + 0.04;
  b.mount('optic', 0, railTop, -0.05);
  b.mount('muzzle', 0, 0, tip);
  b.mount('laser', 0.03, 0.01, -0.3, { side: 1 });
  b.mount('mag', 0, -0.03, -0.08);
  b.mount('stock', 0, 0, 0.38);
  b.point('support', 0, -0.06, -0.2);
  b.point('muzzle', 0, 0, tip);
};

// LR-50 legacy bolt rifle uses the Poly Haven scan (see WeaponModels); this is its procedural fallback.
R.sniper = (b) => chassis(b, { fore: 0.3, barrel: 0.58, stock: 'thumbhole', muzzle: 'cap' });

// ---------------------------------------------------------------- shotguns
function pumpGun(b, o) {
  // Receiver, barrel over magazine tube, sliding forend
  b.add('body', prof([[0.12, -0.035], [-0.12, -0.035], [-0.12, 0.03], [0.1, 0.03], [0.12, 0.012]], 0.046, 0.005));
  if (o.rail) picatinny(b, 'body', 0.1, -0.1, 0.03);
  b.point('eject', 0.024, 0.0, -0.02);
  triggerGuard(b, -0.004, 0.04, -0.03, { w: 0.014 });
  const bz1 = -0.12 - o.barrel;
  barrel(b, -0.12, bz1, 0.0115, { taper: 1 });
  b.add('steel_dark', cyl(0.011, o.tube, 0, -0.03, -0.12 - o.tube / 2, { seg: b.seg(14) }));
  b.add('steel_dark', box(0.024, 0.05, 0.016, 0, -0.012, -0.12 - o.tube + 0.01, 0.004)); // barrel clamp
  if (o.heatShield) {
    b.add('steel_dark', box(0.03, 0.012, o.barrel * 0.55, 0, 0.016, -0.17 - o.barrel * 0.275, 0.003));
    vents(b, -0.17, -0.17 - o.barrel * 0.55, 0.016, 0.0145, { count: 7, r: 0.0035 });
  }
  b.add('steel_dark', sphere(0.0035, 0, 0.016, bz1 + 0.01, 8)); // bead
  const tip = muzzleDevice(b, 'cap', bz1, 0.0115);
  const pump = b.part('pump', [0, -0.03, -0.25]);
  pump.add(o.pumpRole || 'furn', cyl(0.024, 0.16, 0, -0.03, -0.26, { seg: b.seg(16) }));
  if (!b.lod) for (let k = 0; k < 7; k++) pump.add(o.pumpRole || 'furn', tor(0.024, 0.0025, PI * 2, 0, -0.03, -0.195 - k * 0.02, {}, [5, 14]));
  if (o.stock === 'wood') {
    const st = b.part('stock', [0, 0, 0.12]);
    st.add('wood', prof([[0.12, 0.028], [0.42, -0.005], [0.43, -0.125], [0.39, -0.13], [0.21, -0.07], [0.15, -0.09], [0.12, -0.04]], 0.042, 0.01));
    st.add('rubber', box(0.044, 0.13, 0.014, 0, -0.067, 0.435, 0.004));
    b.point('grip', 0, -0.06, 0.16);
  } else if (o.stock === 'collapsible') {
    arGrip(b, 0.06, -0.03, { angle: 0.3, len: 0.1 });
    const st = b.part('stock', [0, 0, 0.12]);
    st.add('body', cyl(0.0145, 0.22, 0, -0.004, 0.23, { seg: 14 }));
    st.add('furn', prof([[0.25, 0.022], [0.4, 0.026], [0.405, -0.08], [0.38, -0.085], [0.29, -0.025], [0.25, -0.02]], 0.044, 0.006));
    st.add('rubber', box(0.046, 0.115, 0.012, 0, -0.03, 0.41, 0.004));
  } else {
    // synthetic fixed stock with integral pistol grip shape
    const st = b.part('stock', [0, 0, 0.12]);
    st.add('furn', prof([[0.12, 0.028], [0.42, 0.0], [0.43, -0.125], [0.39, -0.13], [0.21, -0.07], [0.16, -0.12], [0.12, -0.12], [0.12, -0.04]], 0.044, 0.01));
    st.add('rubber', box(0.046, 0.13, 0.014, 0, -0.067, 0.435, 0.004));
    b.point('grip', 0, -0.075, 0.14);
  }
  if (o.ghost) {
    b.add('steel_dark', box(0.03, 0.014, 0.02, 0, 0.036, 0.08, 0.003), tor(0.006, 0.0018, PI * 2, 0, 0.05, 0.08, { ry: 0 }, [5, 12]));
    b.add('steel_dark', box(0.004, 0.026, 0.01, 0, 0.026, bz1 + 0.015));
    b.meta.ironY = 0.05;
  } else b.meta.ironY = 0.02;
  b.mount('optic', 0, 0.041, -0.02);
  b.mount('muzzle', 0, 0, tip);
  b.mount('under', 0, -0.056, -0.26);
  b.mount('light', -0.025, -0.03, -0.3, { side: -1 });
  b.mount('laser', 0.025, -0.03, -0.29, { side: 1 });
  b.mount('stock', 0, 0, 0.12);
  b.point('support', 0, -0.055, -0.26);
  b.point('muzzle', 0, 0, tip);
  b.meta.pump = true;
}
R.shotgun = (b) => pumpGun(b, { barrel: 0.46, tube: 0.4, stock: 'wood', pumpRole: 'wood' });
R.sg_590 = (b) => pumpGun(b, { barrel: 0.48, tube: 0.44, stock: 'synthetic', heatShield: true, ghost: true, rail: true });
R.sg_m4 = (b) => {
  pumpGun(b, { barrel: 0.46, tube: 0.4, stock: 'collapsible', ghost: true, rail: true });
  // Semi-auto: fixed forend (drawn as the pump part but never animated) + twin gas pistons + charging handle
  b.meta.pump = false;
  for (const s of [-1, 1]) b.add('steel', cyl(0.005, 0.06, s * 0.012, -0.012, -0.36, { seg: 8 }));
  b.part('bolt', [0.026, 0.0, -0.03]).add('steel_dark', box(0.02, 0.012, 0.012, 0.034, 0.0, -0.03, 0.003));
};

// ---------------------------------------------------------------- pistols
function pistol(b, o) {
  const L = o.len, W = o.w || 0.026;
  const yS = 0.0; // slide bottom
  // Slide (moves back when firing)
  const slide = b.part('slide', [0, 0.02, 0.03]);
  const sh = o.slideH || 0.032;
  const slideGeo = o.round
    ? [box(W, sh, L, 0, yS + sh / 2, 0.03 - L / 2, 0.008)]
    : [box(W, sh, L, 0, yS + sh / 2, 0.03 - L / 2, 0.003)];
  slide.add(o.slideRole || 'steel_dark', ...slideGeo);
  if (!b.lod) {
    for (let k = 0; k < 7; k++) for (const s of [-1, 1]) slide.add('slot', box(0.0014, sh * 0.7, 0.0018, s * (W / 2 + 0.0002), sh / 2, 0.022 - k * 0.0045));
    if (o.frontSerr) for (let k = 0; k < 5; k++) for (const s of [-1, 1]) slide.add('slot', box(0.0014, sh * 0.6, 0.0018, s * (W / 2 + 0.0002), sh / 2, 0.03 - L + 0.012 + k * 0.0045));
    slide.add('slot', box(0.003, 0.012, 0.03, W / 2 + 0.0002, sh * 0.6, -0.01, 0.001)); // ejection port
  }
  slide.add('steel_dark', box(0.006, 0.008, 0.006, 0, sh + 0.004, 0.024, 0.001), box(0.004, 0.007, 0.004, 0, sh + 0.0035, 0.03 - L + 0.01, 0.001));
  if (!b.lod) { slide.add('white', sphere(0.0011, 0, sh + 0.006, 0.0205, 6), sphere(0.0011, -0.0022, sh + 0.006, 0.0272, 6), sphere(0.0011, 0.0022, sh + 0.006, 0.0272, 6)); }
  b.meta.ironY = sh + 0.0075;
  // Barrel muzzle visible at the slide front
  b.add('steel', cyl(0.0065, 0.008, 0, 0.012, 0.03 - L - 0.001, { seg: 12 }));
  // Frame + dust cover rail + trigger guard + grip
  const fr = o.frameRole || 'furn';
  b.add(fr, box(W - 0.002, 0.016, L * 0.8, 0, -0.008, 0.03 - L * 0.42, 0.003));
  if (o.rail !== false) { picatinny(b, fr, 0.03 - L * 0.48, 0.03 - L * 0.9, -0.03, { rot: PI, cy: -0.024, w: 0.018 }); }
  const g = o.gripAngle ?? 0.33;
  const c = Math.cos(g), s = Math.sin(g);
  const P = (dz, dy) => [0.01 + dz * c - dy * s, -0.01 + dy * c + dz * s]; // grip rakes back going down
  b.add(o.gripRole || 'grip', prof([P(-0.03, 0), P(0.012, 0), P(0.012, -o.gripLen), P(-0.024, -o.gripLen), P(-0.03, -0.02)], W + 0.002, 0.005));
  if (o.squareGuard) b.add(fr, box(0.01, 0.004, 0.044, 0, -0.04, 0.0, 0.0015), box(0.01, 0.03, 0.005, 0, -0.025, -0.021, 0.0015));
  else b.add(fr, tor(0.019, 0.0025, PI, 0, -0.02, 0.0, { ry: PI / 2, rx: PI }, [6, 14]));
  b.add('steel_dark', box(0.004, 0.016, 0.006, 0, -0.022, 0.006, 0.001));
  if (o.hammer) b.add('steel_dark', box(0.008, 0.016, 0.008, 0, 0.022, 0.04, 0.002, { rx: -0.4 }));
  if (o.decocker && !b.lod) b.add('steel_dark', box(0.004, 0.006, 0.014, -W / 2 - 0.002, 0.0, 0.012, 0.001));
  // Magazine inside the grip (drops on reload)
  const [mz, my] = P(-0.008, -o.gripLen);
  const mag = b.part('mag', [0, my, mz]);
  mag.add('steel_dark', box(W - 0.008, o.gripLen * 0.9, 0.03, 0, my + o.gripLen * 0.45, mz - o.gripLen * 0.45 * s, 0.002, { rx: -g }));
  mag.add(o.magBase || 'poly_black', box(W, 0.009, 0.036, 0, my - 0.004, mz + 0.002, 0.003, { rx: -g }));
  b.mount('mag', 0, my, mz);
  const [gz, gy] = P(-0.008, -o.gripLen * 0.42);
  b.point('grip', 0, gy, gz);
  b.point('support', 0.0, gy - 0.012, gz - 0.005);
  b.point('eject', W / 2 + 0.003, 0.02, -0.01);
  const tip = 0.03 - L - 0.005;
  b.point('muzzle', 0, 0.012, tip);
  b.mount('muzzle', 0, 0.012, tip);
  b.mount('optic', 0, sh + 0.02, 0.0, { slideMounted: true });
  b.mount('light', 0, -0.035, 0.03 - L * 0.72, { side: 0 });
  b.mount('laser', 0, -0.035, 0.03 - L * 0.72, { side: 0 });
  b.meta.pistol = true;
}
R.pt_g17 = (b) => pistol(b, { len: 0.186, squareGuard: true, gripLen: 0.1, gripAngle: 0.38 });
R.pt_g19 = (b) => pistol(b, { len: 0.172, squareGuard: true, gripLen: 0.088, gripAngle: 0.38 });
R.pt_p320 = (b) => pistol(b, { len: 0.18, round: true, frontSerr: true, gripLen: 0.097, gripAngle: 0.3 });
R.pt_p226 = (b) => pistol(b, { len: 0.19, round: true, slideH: 0.035, gripLen: 0.1, gripAngle: 0.25, hammer: true, decocker: true, frameRole: 'body', gripRole: 'grip', magBase: 'steel_dark' });
R.pt_57 = (b) => pistol(b, { len: 0.2, w: 0.024, slideH: 0.03, gripLen: 0.11, gripAngle: 0.2, frontSerr: true, frameRole: 'poly_grey', gripRole: 'grip_black', slideRole: 'steel_dark' });
R.pt_deagle = (b) => {
  pistol(b, { len: 0.12, w: 0.032, slideH: 0.036, gripLen: 0.11, gripAngle: 0.22, hammer: true, rail: false, frameRole: 'steel_dark', gripRole: 'rubber', slideRole: 'steel_dark' });
  // Massive triangular-profile barrel with its own top rail, extending past the slide
  b.add('steel_dark', prof([[-0.09, -0.004], [-0.27, -0.004], [-0.27, 0.03], [-0.26, 0.04], [-0.1, 0.04], [-0.09, 0.03]], 0.03, 0.004));
  picatinny(b, 'steel_dark', -0.1, -0.26, 0.04, { w: 0.018 });
  b.add('slot', cyl(0.007, 0.004, 0, 0.012, -0.271, { seg: 12 }));
  b.points.muzzle.set(0, 0.012, -0.275);
  b.mounts.muzzle.pos.set(0, 0.012, -0.275);
  b.mounts.optic.pos.set(0, 0.051, -0.17);
  b.mounts.light.pos.set(0, -0.01, -0.2);
  b.mounts.laser.pos.set(0, -0.01, -0.2);
  b.meta.ironY = 0.05;
};
// P-9 legacy pistol uses the Poly Haven scan; procedural fallback:
R.pistol = (b) => pistol(b, { len: 0.2, gripLen: 0.1, gripAngle: 0.22, hammer: true, frameRole: 'steel_dark', gripRole: 'wood', slideRole: 'steel_dark', rail: false });

// ---------------------------------------------------------------- belt-fed machine guns
function beltFed(b, o) {
  const W = o.W || 0.05;
  const zR = 0.14, zF = -0.2;
  // Receiver body + feed tray cover (hinged, opens on reload)
  b.add('body', prof([[zR, -0.03], [zF, -0.03], [zF, 0.03], [zR - 0.02, 0.03], [zR, 0.01]], W, 0.005));
  const cover = b.part('cover', [0, 0.03, zF + 0.01]);
  cover.add('body', box(W - 0.006, 0.026, 0.2, 0, 0.043, zF + 0.11, 0.006));
  const railTop = picatinny(b, 'body', zF + 0.2, zF + 0.03, 0.056);
  b.meta.coverRailTop = railTop;
  // Belt + ammunition box/pouch on the left
  const mag = b.part('mag', [-W / 2, -0.03, -0.06]);
  if (o.can) mag.add('olive_paint', box(0.1, 0.14, 0.12, -W / 2 - 0.05, -0.1, -0.07, 0.006));
  else mag.add(o.pouch ? 'fabric' : 'poly_black', box(0.09, 0.12, 0.11, -W / 2 - 0.045, -0.09, -0.06, o.pouch ? 0.02 : 0.006));
  // Belt: rounds (brass) held by steel links, rising from the box into the feed tray
  for (let k = 0; k < (b.lod ? 3 : 8); k++) {
    const x = -W / 2 - 0.004 - k * 0.0045, y = 0.014 - k * 0.0075, z = -0.075 + k * 0.012;
    mag.add('brass', cyl(0.0042, 0.05, x, y, z, { seg: 6 }));
    mag.add('steel_dark', box(0.006, 0.006, 0.012, x, y + 0.003, z + 0.01, 0.001));
  }
  b.mount('mag', -W / 2, -0.03, -0.06);
  // Barrel, gas tube, heat shield, carry handle
  const bz1 = zF - o.barrel;
  barrel(b, zF, bz1, 0.011, { taper: 0.95 });
  b.add('steel_dark', cyl(0.009, o.barrel * 0.7, 0, -0.024, zF - o.barrel * 0.35, { seg: 10 }));
  b.add('steel_dark', box(0.03, 0.01, o.barrel * 0.4, 0, 0.018, zF - 0.04 - o.barrel * 0.2, 0.003));
  b.add('steel_dark', box(0.012, 0.012, 0.1, 0.03, 0.06, zF - 0.06, 0.004), box(0.012, 0.04, 0.012, 0.03, 0.04, zF - 0.02), box(0.012, 0.04, 0.012, 0.03, 0.04, zF - 0.1));
  const tip = muzzleDevice(b, o.muzzle || 'birdcage', bz1, 0.011);
  if (o.railHg) {
    const hg = handguard(b, 'quad', zF, 0.16, { r: 0.028, railY: 0.03, y: 0.0 });
    b.mount('under', 0, hg.bottom, zF - 0.09);
    b.mount('light', -hg.side, 0.0, zF - 0.13, { side: -1 });
    b.mount('laser', hg.side, 0.0, zF - 0.12, { side: 1 });
  } else {
    b.add('furn', box(0.06, 0.05, 0.16, 0, -0.012, zF - 0.08, 0.012));
    b.mount('under', 0, -0.037, zF - 0.09);
    b.mount('light', -0.031, -0.01, zF - 0.13, { side: -1 });
    b.mount('laser', 0.031, -0.01, zF - 0.12, { side: 1 });
  }
  b.add('steel_dark', box(0.004, 0.026, 0.008, 0, 0.026, bz1 + 0.04)); // front post
  b.meta.ironY = 0.06;
  arGrip(b, 0.075, -0.03, { angle: 0.3, len: 0.105 });
  triggerGuard(b, 0.035, 0.075, -0.024, { w: 0.016 });
  b.part('bolt', [W / 2, 0.0, -0.02]).add('steel_dark', box(0.02, 0.014, 0.016, W / 2 + 0.01, 0.0, -0.02, 0.004));
  b.point('eject', 0, -0.035, -0.02);
  // Stock
  const st = b.part('stock', [0, 0, zR]);
  if (o.stock === 'collapsible') {
    for (const s of [-1, 1]) st.add('steel_dark', cyl(0.0065, 0.26, s * 0.018, -0.005, zR + 0.13, { seg: 10 }));
    st.add('furn', box(0.05, 0.12, 0.024, 0, -0.03, zR + 0.26, 0.008));
    st.add('rubber', box(0.052, 0.12, 0.012, 0, -0.03, zR + 0.275, 0.004));
  } else {
    st.add(o.woodStock ? 'wood' : 'furn', prof([[zR, 0.022], [zR + 0.3, 0.012], [zR + 0.31, -0.11], [zR + 0.27, -0.115], [zR + 0.08, -0.05], [zR, -0.03]], 0.05, 0.01));
    if (!o.woodStock) st.add('slot', box(0.052, 0.035, 0.12, 0, -0.04, zR + 0.16, 0.012));
    st.add('rubber', box(0.052, 0.13, 0.014, 0, -0.05, zR + 0.313, 0.004));
  }
  bipod(b, zF - o.barrel * 0.55, -0.034, { len: 0.22 });
  b.mount('optic', 0, railTop, zF + 0.1, { onCover: true });
  b.mount('muzzle', 0, 0, tip);
  b.mount('stock', 0, 0, zR);
  b.point('support', 0, -0.05, zF - 0.08);
  b.point('muzzle', 0, 0, tip);
  b.meta.beltFed = true;
}
R.hv_m249 = (b) => beltFed(b, { barrel: 0.46, pouch: false, muzzle: 'birdcage' });
R.hv_minimi = (b) => beltFed(b, { barrel: 0.35, pouch: true, stock: 'collapsible', railHg: true, muzzle: 'flash' });
R.hv_m240 = (b) => beltFed(b, { barrel: 0.55, W: 0.058, can: true, muzzle: 'svd', woodStock: false });

// ---------------------------------------------------------------- fictional energy rifle
R.hv_energy = (b) => {
  // Sleek composite shell, emitter coils, glowing energy cell and heat vents (original design)
  b.add('white', prof([[0.34, 0.035], [0.34, -0.09], [0.28, -0.095], [0.18, -0.03], [0.1, -0.03], [0.0, -0.045], [-0.2, -0.04], [-0.3, -0.015], [-0.3, 0.02], [-0.1, 0.045], [0.2, 0.05]], 0.05, 0.012));
  b.add('anod_grey', box(0.054, 0.02, 0.4, 0, 0.012, 0.0, 0.008)); // spine
  b.add('anod_grey', cyl(0.018, 0.18, 0, 0.0, -0.37, { seg: b.seg(20), r2: 0.012 }));
  for (let k = 0; k < 4; k++) b.add('glow_cyan', tor(0.021, 0.0025, PI * 2, 0, 0.0, -0.32 - k * 0.035, {}, [6, 18]));
  const tip = -0.47;
  b.add('glow_cyan', cyl(0.008, 0.01, 0, 0, tip + 0.005, { seg: 14 }));
  // Heat vents on both sides (emissive, animated by heat)
  if (!b.lod) for (let k = 0; k < 5; k++) for (const s of [-1, 1]) b.add('glow_amber', box(0.002, 0.024, 0.008, s * 0.0255, -0.005, -0.08 - k * 0.022, 0.001));
  b.add('slot', box(0.056, 0.004, 0.36, 0, -0.016, 0.05, 0.001));
  const railTop = picatinny(b, 'anod_grey', 0.15, -0.2, 0.05, { w: 0.022 });
  arGrip(b, 0.06, -0.04, { angle: 0.3, len: 0.1, role: 'grip' });
  triggerGuard(b, 0.02, 0.06, -0.02, { role: 'anod_grey', w: 0.014 });
  b.add('slot', box(0.052, 0.04, 0.09, 0, -0.06, 0.23, 0.014)); // stock cut-out
  b.add('rubber', box(0.052, 0.12, 0.012, 0, -0.03, 0.345, 0.005));
  // Energy cell (magazine)
  const mag = b.part('mag', [0, -0.045, -0.06]);
  mag.add('anod_grey', box(0.03, 0.09, 0.05, 0, -0.09, -0.06, 0.006));
  mag.add('glow_cyan', box(0.032, 0.05, 0.012, 0, -0.085, -0.04, 0.003));
  b.mount('mag', 0, -0.045, -0.06);
  b.part('bolt', [0, 0.05, 0.1]).add('anod_grey', box(0.02, 0.01, 0.03, 0, 0.055, 0.1, 0.004));
  b.point('eject', 0.026, 0.0, 0.02);
  b.meta.ironY = railTop + 0.02;
  b.meta.energy = true;
  b.mount('optic', 0, railTop, -0.02);
  b.mount('muzzle', 0, 0, tip);
  b.mount('under', 0, -0.04, -0.2);
  b.mount('light', -0.027, -0.01, -0.24, { side: -1 });
  b.mount('laser', 0.027, -0.01, -0.22, { side: 1 });
  b.point('support', 0, -0.06, -0.19);
  b.point('muzzle', 0, 0, tip);
};

// ---------------------------------------------------------------- fictional anti-armour launcher
R.hv_launcher = (b) => {
  // Shoulder-fired tube with optical sight, grips and a visible rocket nose (fictional design)
  b.add('olive_paint', cyl(0.045, 0.95, 0, 0.0, -0.12, { seg: b.seg(24) }));
  b.add('steel_dark', cyl(0.05, 0.03, 0, 0.0, 0.34, { seg: b.seg(24) }), cyl(0.05, 0.03, 0, 0.0, -0.58, { seg: b.seg(24) }));
  b.add('steel_dark', lathe([[0.045, 0], [0.06, 0.08]], 0, 0, 0.35, b.seg(24))); // venturi flare
  b.add('rubber', box(0.05, 0.03, 0.16, 0, 0.04, 0.12, 0.012)); // shoulder pad
  b.add('olive_paint', box(0.03, 0.04, 0.12, -0.06, 0.03, -0.12, 0.008)); // optic housing
  b.add('lens', cyl(0.012, 0.004, -0.06, 0.034, -0.181, { seg: 12 }), cyl(0.012, 0.004, -0.06, 0.034, -0.059, { seg: 12 }));
  b.add('furn', box(0.03, 0.1, 0.035, 0, -0.08, 0.06, 0.01, { rx: -0.25 }));
  b.add('furn', box(0.028, 0.09, 0.03, 0, -0.075, -0.22, 0.01, { rx: -0.15 }));
  b.add('steel_dark', box(0.014, 0.02, 0.04, 0, -0.05, 0.02, 0.003));
  b.add('yellow_paint', cyl(0.0455, 0.02, 0, 0, -0.45, { seg: b.seg(24) }));
  const rocket = b.part('mag', [0, 0, -0.6]);
  rocket.add('olive_paint', lathe([[0.04, 0], [0.04, -0.04], [0.03, -0.1], [0.012, -0.15], [0.002, -0.16]], 0, 0, -0.6, b.seg(20)));
  rocket.add('copper', cyl(0.006, 0.02, 0, 0, -0.765, { seg: 8 }));
  b.mount('mag', 0, 0, -0.6);
  b.point('grip', 0, -0.075, 0.06);
  b.point('support', 0, -0.07, -0.22);
  b.point('muzzle', 0, 0, -0.6);
  b.point('eject', 0, 0, 0.35);
  b.meta.ironY = 0.034;
  b.meta.sightX = -0.06;
  b.meta.launcher = true;
  b.mount('optic', -0.06, 0.05, -0.12);
  b.mount('muzzle', 0, 0, -0.6);
  b.mount('laser', 0.047, 0.0, -0.3, { side: 1 });
};

// ---------------------------------------------------------------- combat knife
R.knife = (b) => {
  // Clip-point blade with fuller groove, guard, stippled handle, pommel
  b.add('steel_bright', prof([[0.0, 0.012], [-0.15, 0.012], [-0.2, 0.004], [-0.215, -0.004], [-0.19, -0.016], [0.0, -0.016]], 0.0045, 0.0012));
  b.add('slot', box(0.0048, 0.004, 0.09, 0, 0.004, -0.07, 0.001)); // fuller
  b.add('steel_dark', box(0.006, 0.004, 0.06, 0, 0.0135, -0.05, 0.001)); // spine jimping
  b.add('steel_dark', box(0.03, 0.045, 0.01, 0, -0.002, 0.004, 0.003));
  b.add('grip_black', prof([[0.01, 0.014], [0.115, 0.016], [0.12, -0.02], [0.01, -0.02]], 0.026, 0.006));
  if (!b.lod) for (let z = 0.03; z < 0.11; z += 0.02) b.add('rubber', box(0.0275, 0.004, 0.006, 0, -0.002, z, 0.001));
  b.add('steel_dark', box(0.03, 0.036, 0.014, 0, -0.002, 0.13, 0.004));
  b.point('grip', 0, -0.002, 0.065);
  b.point('muzzle', 0, 0, -0.2);
  b.meta.ironY = 0;
};

export const RECIPES = R;

const specs = new Map();

// Baked (cached) geometry spec for a recipe; built lazily on first use.
export function recipeSpec(id, { finish = 'black', lod = 0 } = {}) {
  const key = `${id}|${finish}|${lod}`;
  if (specs.has(key)) return specs.get(key);
  const fn = R[id];
  if (!fn) return null;
  const b = new Build({ finish, lod });
  fn(b);
  const spec = b.bake();
  specs.set(key, spec);
  return spec;
}

export function buildRecipe(id, opts = {}) {
  const spec = recipeSpec(id, opts);
  if (!spec) return null;
  const g = instantiate(spec);
  g.userData.recipe = id;
  return g;
}
