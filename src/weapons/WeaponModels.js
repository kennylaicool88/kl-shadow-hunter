// Weapon models. Units are metres; models point down -Z; userData.muzzle marks the barrel tip.
// - P-9 pistol and LR-50 rifle: CC0 scanned models from Poly Haven (service_pistol, bolt_action_rifle_7_62),
//   re-oriented from their +X authoring axis.
// - Every other weapon: original procedural model from the forge (forge/recipes.js) with PBR
//   materials and generated surface detail, built lazily on first use and shared between instances.
// - Licensed replacements: drop a glTF into the manifest under models["weapon:<id>"] and it is used
//   instead (see README). A missing model is never silently replaced by another gun: it renders as a
//   clearly labelled placeholder and is logged as a TEMPORARY FALLBACK.
import * as THREE from 'three';
import { buildRecipe, RECIPES } from './forge/recipes.js';
import { mountAttachments } from './forge/attachments.js';
import { material } from './forge/materials.js';
import { getWeaponConfig } from './weaponConfigs.js';

let ASSETS = null;
export function setWeaponAssets(assets) { ASSETS = assets; }

// Finish (colourway) per weapon.
const FINISH = {
  rifle: 'black', ar_416: 'black', ar_scarl: 'fde', ar_scarh: 'black', ar_ak12: 'black', ar_ak15: 'plum', ar_mcx: 'grey',
  ar_bren: 'tan2', ar_x95: 'od', ar_spear: 'fde', smg_mp5: 'black', smg_mp7: 'black', smg_p90: 'od', smg_vector: 'fde',
  smg_mpx: 'black', smg_apc9: 'grey', sn_axmc: 'green', sn_mrad: 'fde', sn_m82: 'black', sn_trg: 'od', sn_m200: 'grey',
  sn_bolt: 'tan2', dmr_sr25: 'black', dmr_417: 'grey', dmr_mk14: 'tan2', dmr_svd: 'wood', shotgun: 'wood', sg_m4: 'black',
  sg_590: 'od', sg_saiga: 'black', pt_g17: 'black', pt_g19: 'od', pt_p320: 'tan2', pt_p226: 'black', pt_57: 'black',
  pt_deagle: 'black', hv_m249: 'black', hv_minimi: 'grey', hv_m240: 'black', hv_energy: 'grey', hv_launcher: 'od', knife: 'black',
};

// glTF scans: asset name, parts to hide, offset along the barrel axis, bore height, and hand/mount points.
const GLB = {
  pistol: {
    asset: 'pistol', exclude: /magazine|bullet|pistol_b|slide_b|hammer_b|trigger_b/, shift: -0.02, bore: 0.05,
    points: { grip: [0, -0.04, 0.05], support: [0, -0.06, 0.04] }, ironY: 0.07,
    mounts: { optic: [0, 0.075, 0.0], muzzle: null, light: [0, 0.01, -0.12], laser: [0, 0.01, -0.12] },
  },
  sniper: {
    asset: 'bolt_rifle', exclude: /bullet|bolt_b/, shift: -0.34, bore: 0.03,
    points: { grip: [0, -0.04, 0.07], support: [0, -0.02, -0.26] }, ironY: 0.07,
    mounts: { optic: [0, 0.06, 0.02], muzzle: null, laser: [0.02, 0.0, -0.4] },
  },
};

// ------------------------------------------------------------------ model sources
function buildGlb(id) {
  const spec = GLB[id];
  if (!ASSETS || !ASSETS.hasModel(spec.asset)) return null;
  const model = ASSETS.model(spec.asset, { exclude: spec.exclude });
  if (!model) return null;
  const holder = new THREE.Group();
  model.rotation.y = Math.PI / 2;
  model.position.z = -spec.shift; // pre-rotation +X shift becomes -Z shift
  holder.add(model);
  holder.updateMatrixWorld(true);
  const box3 = new THREE.Box3().setFromObject(model);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.shared = true; } });
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, spec.bore, box3.min.z);
  holder.add(muzzle);
  const anchors = {}, mounts = {};
  for (const [k, p] of Object.entries(spec.mounts)) {
    const pos = p ? new THREE.Vector3(...p) : muzzle.position.clone();
    const o = new THREE.Object3D();
    o.position.copy(pos);
    holder.add(o);
    anchors[k] = o;
    mounts[k] = { pos, side: k === 'laser' ? 1 : 0 };
  }
  holder.userData = {
    muzzle, anchors, mounts, parts: {},
    points: Object.fromEntries(Object.entries(spec.points).map(([k, v]) => [k, new THREE.Vector3(...v)])),
    meta: { ironY: spec.ironY, pistol: id === 'pistol' },
    source: `glTF:${spec.asset}`,
  };
  holder.userData.points.muzzle = muzzle.position.clone();
  return holder;
}

function buildOverride(id) {
  const name = `weapon:${id}`;
  if (!ASSETS || !ASSETS.hasModel(name)) return null;
  const g = ASSETS.model(name);
  const holder = new THREE.Group();
  holder.add(g);
  const box3 = new THREE.Box3().setFromObject(g);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, box3.min.z);
  holder.add(muzzle);
  holder.userData = { muzzle, anchors: {}, mounts: {}, parts: {}, points: { grip: new THREE.Vector3(0, -0.06, 0.06), support: new THREE.Vector3(0, -0.04, box3.min.z * 0.5) }, meta: { ironY: box3.max.y }, source: `glTF:${name}` };
  return holder;
}

// Clearly identified placeholder: a neutral block with a "MODEL MISSING" label.
function buildPlaceholder(id) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ff00ff'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#000'; g.font = 'bold 30px monospace';
  g.fillText(`MODEL MISSING: ${id}`, 12, 43);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const holder = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.5), new THREE.MeshBasicMaterial({ map: t }));
  m.position.z = -0.2;
  holder.add(m);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.45);
  holder.add(muzzle);
  holder.userData = { muzzle, anchors: {}, mounts: {}, parts: {}, points: { grip: new THREE.Vector3(0, -0.03, 0.02), support: new THREE.Vector3(0, -0.03, -0.25) }, meta: { ironY: 0.03 }, source: 'PLACEHOLDER', placeholder: true };
  return holder;
}

function rawModel(id, lod) {
  let g = buildOverride(id);
  if (!g && GLB[id]) {
    g = buildGlb(id);
    if (!g && ASSETS) ASSETS._fallback(`weapon:${id}`, 'glTF scan unavailable, using the procedural forge version');
  }
  if (!g && RECIPES[id]) {
    g = buildRecipe(id, { finish: FINISH[id] || 'black', lod });
    if (g) g.userData.source = 'forge';
  }
  if (!g) {
    if (ASSETS) ASSETS._fallback(`weapon:${id}`, 'no model available – showing a labelled placeholder');
    else console.warn(`[weapons] TEMPORARY FALLBACK for ${id}: no model available – showing a labelled placeholder`);
    g = buildPlaceholder(id);
  }
  // Convenience references used by the animation code.
  const p = g.userData.parts || {};
  g.userData.mag = p.mag || null;
  g.userData.pump = p.pump || null;
  g.userData.boltPart = p.bolt || null;
  g.userData.slide = p.slide || null;
  g.userData.cover = p.cover || null;
  return g;
}

/**
 * World/third-person weapon model. opts.attachments: { slot: id }. opts.lod: 0 (full), 1 (reduced),
 * or 'auto' (THREE.LOD switching to the reduced model beyond 12 m – used by enemies and pickups).
 */
export function buildWeaponModel(id, { attachments = null, lod = 0 } = {}) {
  if (lod === 'auto' && RECIPES[id] && !GLB[id]) {
    const hi = rawModel(id, 0);
    const lo = rawModel(id, 1);
    if (attachments) { mountAttachments(hi, attachments, { lod: 0 }); mountAttachments(lo, attachments, { lod: 1 }); }
    const l = new THREE.LOD();
    l.addLevel(hi, 0);
    l.addLevel(lo, 6);
    // Beyond 40 m a gun is a few pixels: a dark stick stands in for it.
    const far = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, Math.max(0.3, -((hi.userData.points && hi.userData.points.muzzle && hi.userData.points.muzzle.z) || -0.6))), material('steel_dark'));
    far.position.z = (hi.userData.points && hi.userData.points.muzzle ? hi.userData.points.muzzle.z : -0.6) / 2;
    far.castShadow = false;
    l.addLevel(far, 40);
    // Small third-person weapon parts don't need to cast shadows (saves a shadow pass per gun mesh).
    for (const lv of [hi, lo]) lv.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    l.userData = hi.userData; // muzzle/points/anchors refer to the detailed level (matrices update when hidden)
    l.name = `weapon-${id}`;
    return l;
  }
  const g = rawModel(id, lod === 'auto' ? 0 : lod);
  mountAttachments(g, attachments || {}, { lod: lod === 'auto' ? 0 : lod });
  g.name = `weapon-${id}`;
  return g;
}

// ================================================================== first-person hands
// Gloved hand modelled around a gripped cylinder whose axis is local +Y (radius r): palm on the +X side,
// fingers wrapping around the front (-Z) to the left, thumb over the rear, sleeve running back/down.
const handGeoCache = new Map();
function capsuleBetween(a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, d.length()), 4, 8);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

function handGeometry(r, kind) {
  const key = `${r.toFixed(3)}|${kind}`;
  if (handGeoCache.has(key)) return handGeoCache.get(key);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const glove = [], knuckle = [], sleeve = [], cuff = [];
  const ellipsoid = (sx, sy, sz, p, ry = 0, rz = 0) => new THREE.SphereGeometry(1, 14, 10).scale(sx, sy, sz).rotateZ(rz).rotateY(ry).translate(p.x, p.y, p.z);
  const support = kind === 'support';
  // Palm + back of the hand: rounded mass hugging the rear-right of the gripped object
  glove.push(ellipsoid(0.019, 0.047, 0.036, V(r + 0.009, -0.006, r * 0.45), -0.55));
  // Knuckle line where the fingers leave the palm
  knuckle.push(ellipsoid(0.011, 0.041, 0.014, V(r + 0.008, support ? 0.0 : -0.006, -r * 0.35), -0.9));
  // Wrapped fingers (two phalanx arcs each): 4 on a handguard; 3 on a pistol grip (index on the frame)
  const fingers = support ? 4 : 3;
  for (let i = 0; i < fingers; i++) {
    const y = (support ? 0.027 : 0.008) - i * 0.0185;
    const tube = 0.0082 - i * 0.0005;
    const t = new THREE.TorusGeometry(r + tube * 0.9, tube, 7, 14, Math.PI * (support ? 1.05 : 1.2));
    t.rotateX(-Math.PI / 2); // arc from +X around the front (-Z) to the far side
    t.rotateY(0.35);
    t.translate(0, y, 0);
    glove.push(t);
    const tipA = Math.PI * (support ? 1.05 : 1.2) + 0.35;
    glove.push(new THREE.SphereGeometry(tube * 1.05, 8, 6).translate(Math.cos(tipA) * (r + tube * 0.9), y, -Math.sin(tipA) * (r + tube * 0.9))); // fingertip
  }
  if (!support) {
    // Index finger resting along the frame above the trigger guard
    glove.push(capsuleBetween(V(r + 0.004, 0.03, -r * 0.3), V(r * 0.5, 0.036, -r - 0.045), 0.0078));
  }
  // Thumb across the rear / far side
  glove.push(capsuleBetween(V(r + 0.008, 0.026, r + 0.006), V(-r * 0.2, 0.036, r + 0.002), 0.0092));
  glove.push(capsuleBetween(V(-r * 0.2, 0.036, r + 0.002), V(-r - 0.006, 0.034, r * 0.1), 0.0085));
  // Wrist, cuff and a tapered forearm (sleeve) running back and down toward the shoulder
  const wristA = V(r + 0.014, -0.045, r + 0.016), wristB = V(r + 0.036, -0.09, r + 0.05);
  glove.push(capsuleBetween(V(r + 0.01, -0.02, r * 0.6), wristA, 0.022));
  glove.push(capsuleBetween(wristA, wristB, 0.023));
  const dir = V(0.42, -0.62, 0.66).normalize();
  const elbow = wristB.clone().addScaledVector(dir, 0.3);
  const fore = new THREE.LatheGeometry([V(0.001, 0, 0), V(0.031, 0.0, 0), V(0.034, 0.04, 0), V(0.041, 0.14, 0), V(0.045, 0.26, 0), V(0.043, 0.3, 0), V(0.001, 0.31, 0)].map((p) => new THREE.Vector2(p.x, p.y)), 14);
  fore.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir));
  fore.translate(wristB.x - dir.x * 0.01, wristB.y - dir.y * 0.01, wristB.z - dir.z * 0.01);
  sleeve.push(fore);
  // Fabric folds near the wrist
  for (let k = 0; k < 3; k++) {
    const t = new THREE.TorusGeometry(0.037 + k * 0.002, 0.004, 5, 14);
    t.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir));
    const c = wristB.clone().addScaledVector(dir, 0.05 + k * 0.03);
    t.translate(c.x, c.y, c.z);
    sleeve.push(t);
  }
  const cuffRing = new THREE.CylinderGeometry(0.033, 0.033, 0.03, 14, 1, true);
  cuffRing.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir));
  const cc = wristB.clone().addScaledVector(dir, 0.012);
  cuffRing.translate(cc.x, cc.y, cc.z);
  cuff.push(cuffRing);
  void elbow;
  const merge = (list) => { const gs = list.map((g) => { const n = g.index ? g.toNonIndexed() : g; if (!n.attributes.normal) n.computeVertexNormals(); return n; }); gs.forEach((g) => { for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a); }); return mergeList(gs); };
  const out = { glove: merge(glove), knuckle: merge(knuckle), sleeve: merge(sleeve), cuff: merge(cuff) };
  handGeoCache.set(key, out);
  return out;
}

function mergeList(gs) {
  let n = 0;
  for (const g of gs) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of gs) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.computeBoundingSphere();
  return m;
}

/**
 * kind: 'grip' (right hand on a pistol grip), 'support' (left hand under a handguard),
 * 'pistolSupport' (left hand cupping a pistol grip), 'hold' (flat object).
 */
export function buildHand(kind = 'grip', r = 0.016, angle = 0.35) {
  const geo = handGeometry(r, kind === 'support' ? 'support' : 'grip');
  const inner = new THREE.Group();
  inner.add(new THREE.Mesh(geo.glove, material('glove')), new THREE.Mesh(geo.knuckle, material('glove_knuckle')), new THREE.Mesh(geo.sleeve, material('sleeve')), new THREE.Mesh(geo.cuff, material('fabric_black')));
  inner.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  const g = new THREE.Group();
  g.add(inner);
  if (kind === 'grip') {
    inner.rotation.x = -angle; // grip axis leans back like a pistol grip
  } else if (kind === 'support') {
    // Mirror into a left hand, lay the grip axis along the barrel, palm underneath
    inner.scale.x = -1;
    inner.rotation.set(-Math.PI / 2, 0, 0);
    g.rotation.z = Math.PI / 2 + 0.25;
  } else if (kind === 'pistolSupport') {
    inner.scale.x = -1;
    inner.rotation.x = -angle;
    g.rotation.y = 0.5;
  } else {
    inner.rotation.x = -0.2;
  }
  return g;
}

// ================================================================== first-person view model
// The viewmodel scene has different lights from the world, and three.js keys shader programs by the
// light set – a material drawn in both scenes would be recompiled twice every frame. The viewmodel
// therefore uses its own clones of every material (shared across all viewmodels).
const viewMats = new Map();
function toViewMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh && !o.isSprite) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((m) => {
      if (!viewMats.has(m)) { const c = m.clone(); c.name = `${m.name}:view`; viewMats.set(m, c); }
      return viewMats.get(m);
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  return root;
}

const LAYOUT = {
  long: { scale: 0.5, hand: [0.13, -0.175, -0.29] },
  pistol: { scale: 0.62, hand: [0.115, -0.163, -0.285] },
  knife: { scale: 0.68, hand: [0.13, -0.12, -0.27] },
  launcher: { scale: 0.5, hand: [0.15, -0.2, -0.24] },
};

export function buildViewModel(id, attachments = null) {
  const root = new THREE.Group();
  if (id === 'uplink') return buildUplinkView(root);
  const cfg = getWeaponConfig(id);
  const weapon = buildWeaponModel(id, { attachments });
  const ud = weapon.userData;
  const kind = cfg.melee ? 'knife' : cfg.category === 'pistol' ? 'pistol' : cfg.launcher ? 'launcher' : 'long';
  const L = LAYOUT[kind];
  root.add(weapon);
  const grip = ud.points.grip || new THREE.Vector3(0, -0.06, 0.06);
  // Hands on the weapon's own grip / support points (they follow attachments such as foregrips).
  if (kind === 'knife') {
    const h = buildHand('grip', 0.013, 0.0);
    h.position.copy(grip);
    h.rotation.x = Math.PI / 2;
    weapon.add(h);
  } else {
    const right = buildHand('grip', kind === 'pistol' ? 0.015 : 0.016, 0.35);
    right.position.copy(grip);
    weapon.add(right);
    const support = ud.points.support;
    if (kind === 'pistol') {
      const left = buildHand('pistolSupport', 0.016, 0.3);
      left.position.copy(grip).add(new THREE.Vector3(-0.012, -0.012, 0.0));
      weapon.add(left);
    } else if (support) {
      const left = buildHand(ud.foregrip ? 'grip' : 'support', ud.foregrip ? 0.015 : 0.03, 0.0);
      left.position.copy(support);
      if (ud.foregrip) { left.scale.x = -1; left.rotation.y = -0.4; }
      weapon.add(left);
      root.userData.leftHand = left;
    }
  }
  weapon.scale.setScalar(L.scale);
  weapon.rotation.y = kind === 'knife' ? 0 : 0.045; // toe-in so the barrel points toward the crosshair
  const s = L.scale;
  const basePos = new THREE.Vector3(L.hand[0] - grip.x * s, L.hand[1] - grip.y * s, L.hand[2] - grip.z * s);
  // Aim-down-sights: sight line on the camera axis.
  const sightY = ud.sightY ?? (ud.meta && ud.meta.ironY) ?? 0.06;
  const sightX = ud.sightX || 0;
  // Eye position along the weapon (weapon space): cheek weld at the stock / behind the optic; pistols at arm's length.
  let eyeZ = ud.mounts && ud.mounts.stock ? ud.mounts.stock.pos.z + 0.03 : grip.z + 0.07;
  if (ud.anchors && ud.anchors.optic && ud.attachmentGroups && ud.attachmentGroups.optic) eyeZ = Math.max(eyeZ, ud.anchors.optic.position.z + 0.19);
  if (kind === 'pistol') eyeZ = grip.z + 0.36;
  if (kind === 'launcher') eyeZ = 0.1;
  const adsPos = new THREE.Vector3(-sightX * s, -sightY * s, -eyeZ * s);
  root.userData = { ...ud, weapon, basePos, adsPos, kind, scale: s, cfgId: id };
  root.position.copy(basePos);
  return toViewMaterials(root);
}

// Deep Strike uplink tablet (mission designator)
function buildUplinkView(root) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.21), material('poly_black'));
  g.add(shell);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.16), material('screen'));
  screen.rotation.x = -Math.PI / 2;
  screen.position.y = 0.0105;
  g.add(screen);
  for (const r of [0.035, 0.065]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.003, r, 24), material('glow_green'));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(-0.04, 0.011, 0);
    g.add(ring);
  }
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.03).translate(0.13, 0.03, -0.08), material('olive_paint')));
  for (const s of [-1, 1]) {
    const h = buildHand('hold', 0.012);
    h.position.set(s * 0.16, -0.01, 0.03);
    if (s < 0) h.scale.x = -1;
    g.add(h);
  }
  g.rotation.x = 0.9;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.1);
  g.add(muzzle);
  g.scale.setScalar(0.55);
  root.add(g);
  root.userData = { weapon: g, muzzle, basePos: new THREE.Vector3(0.1, -0.16, -0.36), adsPos: new THREE.Vector3(0.1, -0.16, -0.36), kind: 'uplink', scale: 0.55, points: {}, parts: {} };
  root.position.copy(root.userData.basePos);
  return toViewMaterials(root);
}

// ================================================================== gear view models (grenades, held equipment)
const GEAR_LAYOUT = {
  grenade: { pos: [0.15, -0.15, -0.3], scale: 0.62 },
  binoculars: { pos: [0.0, -0.135, -0.3], scale: 0.62, rot: [0.15, 0, 0], hands: 'both' },
  rangefinder: { pos: [0.12, -0.12, -0.3], scale: 0.62, rot: [0.1, 0.1, 0], hands: 'right' },
  detector: { pos: [0.06, -0.17, -0.3], scale: 0.62, rot: [0.75, 0.15, 0], hands: 'both' },
  shield: { pos: [-0.17, -0.22, -0.48], scale: 0.62, rot: [0, 0.18, 0], hands: 'left' },
  medkit: { pos: [0.02, -0.2, -0.36], scale: 0.62, rot: [0.4, 0.3, 0], hands: 'both' },
  ammopack: { pos: [0.05, -0.2, -0.34], scale: 0.62, rot: [0.3, -0.3, 0], hands: 'both' },
};

export function buildGearView(kind, id, models) {
  const root = new THREE.Group();
  const item = kind === 'grenade' ? models.grenade(id) : models.equipment(id);
  const L = GEAR_LAYOUT[kind === 'grenade' ? 'grenade' : id] || GEAR_LAYOUT.medkit;
  const g = new THREE.Group();
  g.add(item);
  if (kind === 'grenade') {
    const h = buildHand('grip', 0.032, 0.1);
    h.position.set(0.0, -0.005, 0.0);
    g.add(h);
  } else {
    const box3 = new THREE.Box3().setFromObject(item);
    const hw = (box3.max.x - box3.min.x) / 2;
    if (L.hands === 'both' || L.hands === 'right') { const r = buildHand('grip', 0.03, 0.1); r.position.set(hw * 0.8, box3.min.y + 0.01, 0.0); g.add(r); }
    if (L.hands === 'both' || L.hands === 'left') { const l = buildHand('grip', 0.03, 0.1); l.scale.x = -1; l.position.set(id === 'shield' ? 0.0 : -hw * 0.8, id === 'shield' ? -0.02 : box3.min.y + 0.01, id === 'shield' ? 0.05 : 0.0); g.add(l); }
  }
  if (L.rot) g.rotation.set(...L.rot);
  g.scale.setScalar(L.scale);
  root.add(g);
  const pin = item.userData.parts && item.userData.parts.pin;
  root.userData = { weapon: g, item, pin, screen: item.userData.screen || null, basePos: new THREE.Vector3(...L.pos), adsPos: new THREE.Vector3(...L.pos), kind, gear: true, scale: L.scale, points: {}, parts: {} };
  root.position.copy(root.userData.basePos);
  // Device screens are canvas textures owned by the equipment system: keep those materials unique.
  const screen = item.userData.screen;
  toViewMaterials(root);
  if (screen) screen.material = viewMats.get(screen.material) || screen.material;
  return root;
}

// Material access for other modules building small props.
export function forgeMaterial(key) { return material(key); }
