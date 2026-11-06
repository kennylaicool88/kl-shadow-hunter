// PBR material library for the procedural weapon/equipment models ("forge").
// Surface detail comes from generated tiling maps (normal + roughness), so no external files are needed:
//   micro   – fine anodising / cerakote grain      stipple – textured polymer grip panels
//   knurl   – diamond knurling (controls, bolts)    pebble  – moulded polymer furniture
//   grain   – wood grain (colour + normal)          brushed – machined / brushed steel
// Models get box-projected UVs in metres (see parts.js boxUV), so every map tiles at a real-world scale.
import * as THREE from 'three';

const SIZE = 256;
const cache = new Map();

function heightField(fn) {
  const h = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) h[y * SIZE + x] = fn(x, y);
  return h;
}

// Tileable value noise
function makeNoise(seed, cells) {
  const rnd = mulberry(seed);
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  return (x, y) => {
    const fx = (x / SIZE) * cells, fy = (y / SIZE) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (i, j) => g[((j + cells) % cells) * cells + ((i + cells) % cells)];
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toNormalMap(h, strength) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  const img = g.createImageData(SIZE, SIZE);
  const at = (x, y) => h[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * SIZE + x) * 4;
      img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, false);
}

function toGreyMap(h, lo, hi) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  const img = g.createImageData(SIZE, SIZE);
  for (let i = 0; i < h.length; i++) {
    const v = (lo + (hi - lo) * h[i]) * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, false);
}

function tex(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ generated maps
function maps(name) {
  if (cache.has(`maps:${name}`)) return cache.get(`maps:${name}`);
  let out;
  if (name === 'micro') {
    const n1 = makeNoise(11, 64), n2 = makeNoise(12, 128);
    const h = heightField((x, y) => n1(x, y) * 0.6 + n2(x, y) * 0.4);
    const smudge = makeNoise(13, 6);
    out = { normal: toNormalMap(h, 1.2), rough: toGreyMap(heightField((x, y) => smudge(x, y)), 0.75, 1.0) };
  } else if (name === 'stipple') {
    const rnd = mulberry(21);
    const h = new Float32Array(SIZE * SIZE);
    for (let k = 0; k < 2600; k++) {
      const cx = rnd() * SIZE, cy = rnd() * SIZE, r = 1.4 + rnd() * 1.8;
      for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
        const d = Math.hypot(x, y) / r;
        if (d < 1) {
          const ix = (Math.floor(cx + x) + SIZE) % SIZE, iy = (Math.floor(cy + y) + SIZE) % SIZE;
          h[iy * SIZE + ix] = Math.max(h[iy * SIZE + ix], Math.sqrt(1 - d * d));
        }
      }
    }
    out = { normal: toNormalMap(h, 2.2), rough: toGreyMap(h.map((v) => 1 - v * 0.3), 0.8, 1.0) };
  } else if (name === 'knurl') {
    const h = heightField((x, y) => {
      const a = Math.abs(((x + y) % 16) - 8) / 8, b = Math.abs(((x - y + SIZE) % 16) - 8) / 8;
      return Math.min(a, b);
    });
    out = { normal: toNormalMap(h, 3), rough: toGreyMap(h, 0.85, 1.0) };
  } else if (name === 'pebble') {
    const n = makeNoise(31, 96), m = makeNoise(32, 24);
    const h = heightField((x, y) => n(x, y) * 0.75 + m(x, y) * 0.25);
    out = { normal: toNormalMap(h, 1.6), rough: toGreyMap(heightField((x, y) => m(x, y)), 0.85, 1.0) };
  } else if (name === 'brushed') {
    const n = makeNoise(41, 128);
    const h = heightField((x, y) => n(x * 0.02, y) * 0.7 + n(x * 0.05 + 50, y * 3) * 0.3);
    out = { normal: toNormalMap(h, 0.8), rough: toGreyMap(h, 0.7, 1.0) };
  } else if (name === 'grain') {
    const n = makeNoise(51, 8), f = makeNoise(52, 160);
    const h = heightField((x, y) => {
      const ring = Math.sin((y / SIZE) * Math.PI * 2 * 14 + n(x, y) * 9) * 0.5 + 0.5;
      return ring * 0.7 + f(x, y) * 0.3;
    });
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const g = c.getContext('2d');
    const img = g.createImageData(SIZE, SIZE);
    for (let i = 0; i < h.length; i++) {
      const v = h[i];
      img.data[i * 4] = 92 + v * 70; img.data[i * 4 + 1] = 52 + v * 40; img.data[i * 4 + 2] = 26 + v * 20; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    out = { normal: toNormalMap(h, 1.5), rough: toGreyMap(h, 0.75, 0.95), color: tex(c, true) };
  }
  cache.set(`maps:${name}`, out);
  return out;
}

// ------------------------------------------------------------------ materials
// key -> definition. uv: metres per texture tile (box projection scale).
const DEFS = {
  // Anodised aluminium receivers
  anod_black: { color: 0x1f2124, metalness: 0.55, roughness: 0.48, maps: 'micro', ns: 0.25, uv: 0.12 },
  anod_fde: { color: 0x8f7a5a, metalness: 0.25, roughness: 0.6, maps: 'micro', ns: 0.25, uv: 0.12 },
  anod_grey: { color: 0x4a4d50, metalness: 0.45, roughness: 0.5, maps: 'micro', ns: 0.25, uv: 0.12 },
  anod_od: { color: 0x474c38, metalness: 0.3, roughness: 0.6, maps: 'micro', ns: 0.25, uv: 0.12 },
  // Polymer furniture
  poly_black: { color: 0x202020, metalness: 0, roughness: 0.72, maps: 'pebble', ns: 0.35, uv: 0.08 },
  poly_fde: { color: 0x9a8562, metalness: 0, roughness: 0.75, maps: 'pebble', ns: 0.35, uv: 0.08 },
  poly_od: { color: 0x4e5540, metalness: 0, roughness: 0.75, maps: 'pebble', ns: 0.35, uv: 0.08 },
  poly_grey: { color: 0x55585a, metalness: 0, roughness: 0.72, maps: 'pebble', ns: 0.35, uv: 0.08 },
  poly_plum: { color: 0x4a2a24, metalness: 0, roughness: 0.62, maps: 'pebble', ns: 0.3, uv: 0.08 }, // AK "plum" polymer
  // Textured grip panels
  grip_black: { color: 0x1c1c1c, metalness: 0, roughness: 0.9, maps: 'stipple', ns: 0.9, uv: 0.05 },
  grip_fde: { color: 0x8c7856, metalness: 0, roughness: 0.92, maps: 'stipple', ns: 0.9, uv: 0.05 },
  grip_od: { color: 0x4a503c, metalness: 0, roughness: 0.92, maps: 'stipple', ns: 0.9, uv: 0.05 },
  rubber: { color: 0x151515, metalness: 0, roughness: 0.95, maps: 'stipple', ns: 0.5, uv: 0.06 },
  // Steel
  steel: { color: 0x2b2d30, metalness: 0.9, roughness: 0.36, maps: 'brushed', ns: 0.2, uv: 0.15 },
  steel_dark: { color: 0x17181a, metalness: 0.85, roughness: 0.42, maps: 'micro', ns: 0.2, uv: 0.12 },
  steel_bright: { color: 0x8c9096, metalness: 1, roughness: 0.22, maps: 'brushed', ns: 0.15, uv: 0.15 },
  knurl: { color: 0x202224, metalness: 0.8, roughness: 0.5, maps: 'knurl', ns: 0.8, uv: 0.02 },
  nickel: { color: 0xb9b7b0, metalness: 1, roughness: 0.18, maps: 'brushed', ns: 0.12, uv: 0.15 },
  brass: { color: 0xc9a248, metalness: 1, roughness: 0.3 },
  copper: { color: 0xb8734a, metalness: 1, roughness: 0.32 },
  // Wood
  wood: { color: 0xffffff, metalness: 0, roughness: 0.6, maps: 'grain', ns: 0.4, uv: 0.25, grain: true },
  // Details
  slot: { color: 0x050505, metalness: 0.2, roughness: 0.8 },
  lens: { color: 0x0b1620, metalness: 0.9, roughness: 0.04 },
  lens_clear: { color: 0x7fa6c8, metalness: 0.2, roughness: 0.02, transparent: true, opacity: 0.16 }, // see-through optic glass
  lens_amber: { color: 0x2a1a05, metalness: 0.9, roughness: 0.05 },
  white: { color: 0xd9d9d4, metalness: 0, roughness: 0.6 },
  orange: { color: 0xc8551c, metalness: 0, roughness: 0.6 },
  red_paint: { color: 0x8a1c14, metalness: 0.2, roughness: 0.5 },
  yellow_paint: { color: 0xc9a227, metalness: 0.2, roughness: 0.55 },
  olive_paint: { color: 0x4d553a, metalness: 0.3, roughness: 0.55, maps: 'micro', ns: 0.2, uv: 0.12 },
  fabric: { color: 0x4b5038, metalness: 0, roughness: 0.98, maps: 'pebble', ns: 0.6, uv: 0.04 },
  fabric_black: { color: 0x1d1e1c, metalness: 0, roughness: 0.98, maps: 'pebble', ns: 0.6, uv: 0.04 },
  glove: { color: 0x26241f, metalness: 0, roughness: 0.92, maps: 'pebble', ns: 0.5, uv: 0.03 },
  glove_knuckle: { color: 0x141412, metalness: 0, roughness: 0.7, maps: 'pebble', ns: 0.3, uv: 0.03 },
  sleeve: { color: 0x4a5139, metalness: 0, roughness: 0.97, maps: 'pebble', ns: 0.7, uv: 0.03 },
  // Emissive
  glow_red: { color: 0x200000, emissive: 0xff2a1a, emissiveIntensity: 4, metalness: 0, roughness: 0.4 },
  glow_green: { color: 0x002000, emissive: 0x39ff6a, emissiveIntensity: 3, metalness: 0, roughness: 0.4 },
  glow_cyan: { color: 0x001a20, emissive: 0x38d8ff, emissiveIntensity: 3.2, metalness: 0, roughness: 0.3 },
  glow_amber: { color: 0x201000, emissive: 0xffa31a, emissiveIntensity: 3, metalness: 0, roughness: 0.4 },
  glow_white: { color: 0x202020, emissive: 0xfff4dc, emissiveIntensity: 5, metalness: 0, roughness: 0.4 },
  screen: { color: 0x02100a, emissive: 0x1f9e63, emissiveIntensity: 1.6, metalness: 0, roughness: 0.2 },
};

export const MATERIAL_UV = Object.fromEntries(Object.entries(DEFS).map(([k, d]) => [k, d.uv || 0.1]));

export function material(key) {
  if (cache.has(key)) return cache.get(key);
  const d = DEFS[key];
  if (!d) throw new Error(`forge: unknown material ${key}`);
  const m = new THREE.MeshStandardMaterial({
    color: d.color, metalness: d.metalness, roughness: d.roughness,
    emissive: d.emissive ?? 0x000000, emissiveIntensity: d.emissiveIntensity ?? 1,
  });
  if (d.transparent) { m.transparent = true; m.opacity = d.opacity; m.depthWrite = false; }
  if (d.maps && typeof document !== 'undefined') {
    const mp = maps(d.maps);
    m.normalMap = mp.normal;
    m.normalScale = new THREE.Vector2(d.ns, d.ns);
    m.roughnessMap = mp.rough;
    if (d.grain) m.map = mp.color;
  }
  m.name = `forge:${key}`;
  cache.set(key, m);
  return m;
}

export function hasMaterial(key) {
  return !!DEFS[key];
}

// Finish -> material roles. Recipes ask for roles (body, furniture, grip, accent) instead of colours.
export const FINISHES = {
  black: { body: 'anod_black', furn: 'poly_black', grip: 'grip_black', accent: 'steel_dark' },
  fde: { body: 'anod_fde', furn: 'poly_fde', grip: 'grip_fde', accent: 'anod_black' },
  tan2: { body: 'anod_black', furn: 'poly_fde', grip: 'grip_fde', accent: 'steel_dark' },
  od: { body: 'anod_black', furn: 'poly_od', grip: 'grip_od', accent: 'steel_dark' },
  grey: { body: 'anod_grey', furn: 'poly_black', grip: 'grip_black', accent: 'steel_dark' },
  green: { body: 'anod_od', furn: 'poly_od', grip: 'grip_od', accent: 'anod_black' },
  wood: { body: 'steel', furn: 'wood', grip: 'wood', accent: 'steel_dark' },
  plum: { body: 'steel_dark', furn: 'poly_plum', grip: 'poly_plum', accent: 'steel' },
  steel: { body: 'steel', furn: 'poly_black', grip: 'grip_black', accent: 'steel_dark' },
  nickel: { body: 'nickel', furn: 'poly_black', grip: 'rubber', accent: 'steel_dark' },
};
