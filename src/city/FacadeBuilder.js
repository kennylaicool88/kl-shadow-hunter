// Procedural architecture: converts each building's collision box into detailed facade geometry
// (curtain walls with mullions and spandrels, precast frames with punched windows, heritage shophouse
// arcades, podiums, canopies, parapets, setbacks and rooftop plant). Collision is unchanged.
// All geometry is merged per material, so the whole skyline costs ~a dozen draw calls.
import * as THREE from 'three';
import { worldBox, mergeChunked } from '../render/geometryUtils.js';

const FLOOR = 3.8; // storey height (m)
const BAY = 1.5; // curtain-wall module width (m)
const WIN_CELLS = 64; // window lighting texture cells per side

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Per-window night lighting (emissive) and per-pane roughness variation, one texel per window.
function windowTextures(seed) {
  const r = rng(seed);
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = WIN_CELLS; return [c, c.getContext('2d')]; };
  const [lc, lg] = mk();
  const [rc, rg] = mk();
  for (let y = 0; y < WIN_CELLS; y++) {
    for (let x = 0; x < WIN_CELLS; x++) {
      const v = r();
      // Lit windows cluster by floor (offices left on) – warm or cool.
      const floorOn = (Math.sin(y * 1.7 + seed) + 1) / 2;
      const on = v < 0.18 + floorOn * 0.38;
      const warm = r() < 0.72;
      const b = on ? 0.55 + r() * 0.45 : 0.02;
      lg.fillStyle = on ? (warm ? `rgb(${255 * b},${205 * b},${140 * b})` : `rgb(${190 * b},${220 * b},${255 * b})`) : '#050505';
      lg.fillRect(x, y, 1, 1);
      const rough = 30 + r() * 40; // 0.12..0.27
      rg.fillStyle = `rgb(0,${rough},0)`;
      rg.fillRect(x, y, 1, 1);
    }
  }
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipMapLinearFilter;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { lit: tex(lc, true), rough: tex(rc, false) };
}

export class FacadeBuilder {
  constructor(assets) {
    this.assets = assets;
    this.geo = new Map();
    this.rooftop = { aircon: [], antenna: [], tanks: [] };
    this.signs = [];
    this._initMaterials();
  }

  _initMaterials() {
    const a = this.assets;
    this.win = windowTextures(7);
    const glass = (color, rough = 0.06, metal = 0.85) => new THREE.MeshStandardMaterial({
      color, metalness: metal, roughness: rough, roughnessMap: this.win.rough, envMapIntensity: 1.25,
      emissive: 0x000000, emissiveMap: this.win.lit, emissiveIntensity: 1,
    });
    this.mats = {
      glassBlue: glass(0x5d7f97),
      glassGreen: glass(0x5f8a82),
      glassSilver: glass(0x9aa6ae, 0.05, 0.92),
      glassBronze: glass(0x8a7660),
      glassDark: glass(0x3b4752, 0.08, 0.7),
      frame: new THREE.MeshStandardMaterial({ color: 0xb9bfc5, metalness: 0.9, roughness: 0.32, vertexColors: true }),
      darkFrame: new THREE.MeshStandardMaterial({ color: 0x30353b, metalness: 0.75, roughness: 0.42, vertexColors: true }),
      panels: a.pbr('facade_panels', { vertexColors: true, key: 'fac-panels' }),
      tiles: a.pbr('facade_tiles', { vertexColors: true, key: 'fac-tiles' }),
      stone: a.pbr('granite', { vertexColors: true, key: 'fac-stone' }),
      concrete: a.pbr('concrete', { vertexColors: true, color: 0xd6d2ca, key: 'fac-concrete' }),
      roof: a.pbr('concrete', { vertexColors: true, color: 0x8d8a84, key: 'fac-roof' }),
      plaster: a.pbr('plaster', { vertexColors: true, key: 'fac-plaster' }),
      shutter: a.pbr('corrugated', { vertexColors: true, color: 0xa9b3b8, key: 'fac-shutter' }),
      wood: new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.6, metalness: 0, vertexColors: true }),
    };
    for (const k of ['glassBlue', 'glassGreen', 'glassSilver', 'glassBronze', 'glassDark']) this.mats[k].userData.nightGlass = true;
  }

  // detail: small trim that is only drawn near the viewer and never casts shadows.
  _push(key, g, detail = false) {
    const k = detail ? `${key}#detail` : key;
    if (!this.geo.has(k)) this.geo.set(k, []);
    this.geo.get(k).push(g);
  }

  // Box defined relative to a face: along [u0,u1], vertical [y0,y1], out of plane [d0,d1] (+ = outward).
  _faceBox(key, f, u0, u1, y0, y1, d0, d1, tile = 4, tint, detail = false) {
    const ax = f.ox + f.dx * u0, az = f.oz + f.dz * u0;
    const bx = f.ox + f.dx * u1, bz = f.oz + f.dz * u1;
    const xs = [ax + f.nx * d0, ax + f.nx * d1, bx + f.nx * d0, bx + f.nx * d1];
    const zs = [az + f.nz * d0, az + f.nz * d1, bz + f.nz * d0, bz + f.nz * d1];
    const min = [Math.min(...xs), y0, Math.min(...zs)], max = [Math.max(...xs), y1, Math.max(...zs)];
    if (max[0] - min[0] < 1e-3 || max[2] - min[2] < 1e-3 || y1 - y0 < 1e-3) return;
    this._push(key, worldBox(min, max, tile, { tint }), detail);
  }

  static faces(r) {
    // ox/oz: start corner, d: along-face direction, n: outward normal, L: length
    // r.skip: side names left bare (faces that sit against another structure)
    return [
      { side: 'north', ox: r.x0, oz: r.z0, dx: 1, dz: 0, nx: 0, nz: -1, L: r.x1 - r.x0 },
      { side: 'south', ox: r.x1, oz: r.z1, dx: -1, dz: 0, nx: 0, nz: 1, L: r.x1 - r.x0 },
      { side: 'west', ox: r.x0, oz: r.z1, dx: 0, dz: -1, nx: -1, nz: 0, L: r.z1 - r.z0 },
      { side: 'east', ox: r.x1, oz: r.z0, dx: 0, dz: 1, nx: 1, nz: 0, L: r.z1 - r.z0 },
    ].filter((f) => !(r.skip && r.skip.includes(f.side)));
  }

  // Glass core box with window-cell UVs (one emissive/roughness texel per pane).
  _glassCore(key, x0, z0, x1, z1, y0, y1, offset) {
    const g = worldBox([x0, y0, z0], [x1, y1, z1], 1);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / (BAY * WIN_CELLS) + offset, uv.getY(i) / (FLOOR * WIN_CELLS) + offset * 0.37);
    this._push(key, g);
  }

  build(buildings, center = { x: 0, z: 0 }) {
    buildings.forEach((b, i) => {
      if (b.style === 'shophouse') this._shophouse(b, i);
      else if (b.style === 'office') this._office(b, i, center);
      else this._tower(b, i, center);
    });
    return this._finish();
  }

  _faceTowardCenter(r, center) {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const dx = center.x - cx, dz = center.z - cz;
    if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 3 : 2;
    return dz > 0 ? 1 : 0;
  }

  // Shared storefront podium: recessed glass, stone piers, fascia and an entrance canopy.
  _podium(r, y0, height, center) {
    const faces = FacadeBuilder.faces(r);
    this._glassCore('glassDark', r.x0 + 0.6, r.z0 + 0.6, r.x1 - 0.6, r.z1 - 0.6, y0, y0 + height - 1.1, 0.1);
    faces.forEach((f) => {
      for (let u = 0; u <= f.L + 0.01; u += 6) this._faceBox('stone', f, Math.max(0, u - 0.45), Math.min(f.L, u + 0.45), y0, y0 + height - 1.1, -0.6, 0.05, 2);
      this._faceBox('stone', f, 0, f.L, y0 + height - 1.1, y0 + height, -0.6, 0.18, 2);
      this._faceBox('darkFrame', f, 0, f.L, y0, y0 + 0.35, -0.6, 0.02, 2); // plinth
    });
    const fc = faces[this._faceTowardCenter(r, center)];
    const w = Math.min(14, fc.L * 0.45);
    this._faceBox('darkFrame', fc, fc.L / 2 - w / 2, fc.L / 2 + w / 2, y0 + height - 1.55, y0 + height - 1.3, 0, 2.6);
    this._faceBox('frame', fc, fc.L / 2 - w / 2, fc.L / 2 + w / 2, y0 + height - 1.3, y0 + height - 1.2, 0, 2.6);
  }

  _roofPlant(r, top, rand, tall) {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const w = (r.x1 - r.x0) * 0.42, d = (r.z1 - r.z0) * 0.42;
    this._push('roof', worldBox([r.x0, top - 0.3, r.z0], [r.x1, top, r.z1], 4));
    this._push('concrete', worldBox([cx - w / 2, top, cz - d / 2], [cx + w / 2, top + 3.6, cz + d / 2], 4)); // plant room
    this._push('darkFrame', worldBox([cx - w / 2 - 0.2, top + 3.6, cz - d / 2 - 0.2], [cx + w / 2 + 0.2, top + 3.9, cz + d / 2 + 0.2], 2));
    // Parapet
    const p = 0.35, ph = 1.15;
    for (const [a, b] of [[[r.x0, r.z0], [r.x1, r.z0 + p]], [[r.x0, r.z1 - p], [r.x1, r.z1]], [[r.x0, r.z0], [r.x0 + p, r.z1]], [[r.x1 - p, r.z0], [r.x1, r.z1]]]) {
      this._push(tall ? 'frame' : 'concrete', worldBox([a[0], top, a[1]], [b[0], top + ph, b[1]], 2));
    }
    const n = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      this.rooftop.aircon.push({ x: r.x0 + 2 + rand() * (r.x1 - r.x0 - 4), y: top, z: r.z0 + 2 + rand() * (r.z1 - r.z0 - 4), rotY: Math.floor(rand() * 4) * Math.PI / 2, scale: 1.6 });
    }
    if (tall) this.rooftop.antenna.push({ x: cx + w * 0.3, y: top + 3.9, z: cz, h: 8 + rand() * 10 });
    if (rand() < 0.6) this.rooftop.tanks.push({ x: cx - w * 0.3, y: top + 3.9, z: cz - d * 0.2, r: 1.2 });
  }

  // ------------------------------------------------------------------ curtain-wall tower
  _tower(b, idx, center) {
    const rand = rng(idx * 97 + 13);
    const glass = ['glassBlue', 'glassGreen', 'glassSilver', 'glassBronze'][idx % 4];
    const y0 = b.y0 ?? 0;
    const r = { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 };
    let yb = y0;
    if (y0 === 0) { this._podium(r, 0, 7, center); yb = 7; }
    const hasSetback = b.h - yb > 50;
    const ys = hasSetback ? yb + Math.round(((b.h - yb) * 0.8) / FLOOR) * FLOOR : b.h;
    this._curtainWall(r, yb, ys, glass, rand, idx);
    let top = ys;
    if (hasSetback) {
      const inset = 2.6;
      const r2 = { x0: r.x0 + inset, z0: r.z0 + inset, x1: r.x1 - inset, z1: r.z1 - inset };
      this._push('frame', worldBox([r.x0, ys, r.z0], [r.x1, ys + 0.5, r.z1], 2)); // setback terrace edge
      this._curtainWall(r2, ys + 0.5, b.h, glass, rand, idx + 50);
      this._roofPlant(r2, b.h, rand, true);
      top = b.h;
      this._roofTerrace(r, ys + 0.5, r2);
    } else this._roofPlant(r, top, rand, true);
  }

  _roofTerrace(r, y, inner) {
    // Low glass balustrade around the setback terrace
    const h = 1.1, t = 0.08;
    for (const [a, b] of [[[r.x0, r.z0], [r.x1, r.z0 + t]], [[r.x0, r.z1 - t], [r.x1, r.z1]], [[r.x0, r.z0], [r.x0 + t, r.z1]], [[r.x1 - t, r.z0], [r.x1, r.z1]]]) {
      this._push('frame', worldBox([a[0], y, a[1]], [b[0], y + h, b[1]], 2));
    }
    void inner;
  }

  _curtainWall(r, y0, y1, glass, rand, seed) {
    const ins = 0.35;
    this._glassCore(glass, r.x0 + ins, r.z0 + ins, r.x1 - ins, r.z1 - ins, y0, y1, (seed * 0.137) % 1);
    for (const f of FacadeBuilder.faces(r)) {
      // Vertical mullions (detail: drawn near the viewer only)
      for (let u = BAY; u < f.L - 0.4; u += BAY) this._faceBox('frame', f, u - 0.045, u + 0.045, y0, y1, -ins, 0.12, 2, undefined, true);
      // Spandrels / transoms every floor, a deeper band every fifth floor
      let k = 0;
      for (let y = y0; y < y1 - 0.5; y += FLOOR, k++) {
        const deep = k % 5 === 0;
        this._faceBox(deep ? 'darkFrame' : 'frame', f, 0, f.L, y, y + (deep ? 0.9 : 0.22), -ins, deep ? 0.2 : 0.07, 2, undefined, !deep);
      }
      // Corner columns
      this._faceBox('frame', f, 0, 0.55, y0, y1, -ins, 0.25, 2);
    }
  }

  // ------------------------------------------------------------------ precast office
  _office(b, idx, center) {
    const rand = rng(idx * 31 + 5);
    const r = { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 };
    const y0 = b.y0 ?? 0;
    let yb = y0;
    if (y0 === 0) { this._podium(r, 0, 6, center); yb = 6; }
    const ins = 0.45;
    const clad = idx % 2 ? 'tiles' : 'panels';
    this._glassCore('glassDark', r.x0 + ins, r.z0 + ins, r.x1 - ins, r.z1 - ins, yb, b.h, (idx * 0.29) % 1);
    const pier = 3.2 + (idx % 3) * 0.4;
    for (const f of FacadeBuilder.faces(r)) {
      for (let u = 0; u <= f.L + 0.01; u += pier) this._faceBox(clad, f, Math.max(0, u - 0.38), Math.min(f.L, u + 0.38), yb, b.h, -ins, 0.02, 3);
      for (let y = yb; y < b.h - 0.5; y += FLOOR) {
        this._faceBox(clad, f, 0, f.L, y, y + 1.3, -ins, 0, 3); // spandrel
        this._faceBox('concrete', f, 0, f.L, y + 1.3, y + 1.42, -ins, 0.14, 2, undefined, true); // sill ledge (detail)
      }
      this._faceBox('concrete', f, 0, f.L, b.h - 1.0, b.h, -ins, 0.45, 2); // cornice
    }
    this._roofPlant(r, b.h, rand, b.h > 50);
  }

  // ------------------------------------------------------------------ heritage shophouses
  _shophouse(b, idx) {
    const r = { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, skip: b.skip };
    if (r.x1 - r.x0 < 1 || r.z1 - r.z0 < 1) {
      this._push('plaster', worldBox([r.x0, 0, r.z0], [r.x1, b.h, r.z1], 3, { tint: [0.92, 0.88, 0.8] }));
      return;
    }
    const palette = [[0.96, 0.9, 0.74], [0.78, 0.9, 0.84], [0.95, 0.76, 0.66], [0.9, 0.8, 0.55], [0.76, 0.86, 0.93], [0.93, 0.93, 0.9]];
    const rand = rng(idx * 7 + 3);
    // Solid interior volume behind the facades (flush with any bare side)
    const ins = (side) => (r.skip && r.skip.includes(side) ? 0 : 1.2);
    this._push('plaster', worldBox([r.x0 + ins('west'), 0, r.z0 + ins('north')], [r.x1 - ins('east'), b.h - 0.2, r.z1 - ins('south')], 3, { tint: [0.85, 0.82, 0.76] }));
    const unit = 4.6;
    const floors = Math.max(2, Math.round(b.h / 4.4));
    const fh = b.h / floors;
    for (const f of FacadeBuilder.faces(r)) {
      const n = Math.max(1, Math.round(f.L / unit));
      const w = f.L / n;
      for (let k = 0; k < n; k++) {
        const u0 = k * w, u1 = (k + 1) * w;
        const tint = palette[Math.floor(rand() * palette.length)];
        // Five-foot way: arcade pillars and a recessed shopfront with a part-open roller shutter
        this._faceBox('plaster', f, u0, u0 + 0.55, 0, fh, -0.9, 0, 2, tint);
        this._faceBox('glassDark', f, u0 + 0.55, u1, 0, fh - 0.6, -1.2, -0.9, 1);
        this._faceBox('shutter', f, u0 + 0.75, u1 - 0.2, fh * 0.45, fh - 0.6, -1.15, -0.95, 2);
        this._faceBox('plaster', f, u0 + 0.55, u1, fh - 0.6, fh, -0.9, 0, 2, tint);
        this.signs.push({ f, u: (u0 + u1) / 2, y: fh - 0.95, w: w - 1.2 });
        // Upper floors: plaster wall, framed windows with timber shutters, cornice between floors
        for (let fl = 1; fl < floors; fl++) {
          const y = fl * fh;
          this._faceBox('plaster', f, u0, u1, y, y + fh, -0.3, 0, 2, tint);
          for (const c of [0.28, 0.72]) {
            const wu = u0 + w * c;
            this._faceBox('glassDark', f, wu - 0.55, wu + 0.55, y + 0.9, y + fh - 0.7, -0.32, -0.25, 1);
            this._faceBox('wood', f, wu - 0.7, wu + 0.7, y + 0.8, y + 0.9, -0.3, 0.12, 2, undefined, true); // sill
            this._faceBox('wood', f, wu - 1.15, wu - 0.6, y + 0.9, y + fh - 0.7, -0.3, 0.06, 2, [0.6, 1.2, 0.9], true); // shutter
            this._faceBox('wood', f, wu + 0.6, wu + 1.15, y + 0.9, y + fh - 0.7, -0.3, 0.06, 2, [0.6, 1.2, 0.9], true);
          }
          this._faceBox('plaster', f, u0, u1, y - 0.18, y + 0.12, -0.3, 0.22, 2, [0.98, 0.97, 0.94], true); // cornice
        }
        this._faceBox('plaster', f, u0 + 0.2, u1 - 0.2, b.h, b.h + 0.9, -0.3, 0.05, 2, tint); // stepped parapet
      }
    }
    this._push('roof', worldBox([r.x0, b.h - 0.2, r.z0], [r.x1, b.h, r.z1], 4));
  }

  _finish() {
    const meshes = [];
    for (const [k, geos] of this.geo) {
      const [key, flag] = k.split('#');
      const detail = flag === 'detail';
      // Chunked so the GPU only draws facades in view; detail chunks are distance-gated by the map.
      for (const c of mergeChunked(geos, 48)) {
        const mesh = new THREE.Mesh(c.geometry, this.mats[key]);
        mesh.name = `facade-${key}${detail ? '-detail' : ''}`;
        mesh.castShadow = !detail;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        mesh.userData = { detail, cx: c.cx, cz: c.cz };
        meshes.push(mesh);
      }
    }
    this.geo.clear();
    return meshes;
  }

  setNight(night) {
    for (const m of Object.values(this.mats)) {
      if (!m.userData.nightGlass) continue;
      m.emissive.setHex(night ? 0xffffff : 0x000000);
      m.emissiveIntensity = night ? 1.6 : 0;
    }
  }
}
