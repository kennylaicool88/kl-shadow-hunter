// Static city geometry: PBR-textured walkable architecture (mall, garage, lobby, tunnels, sidewalks),
// detailed facades for every high-rise (FacadeBuilder), the Twin Towers landmark (with LOD and
// floor-by-floor stainless sunshade rings), and an instanced distant skyline.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { worldBox, mergeChunked } from '../render/geometryUtils.js';
import { FacadeBuilder } from './FacadeBuilder.js';

// Collision-only solids whose visuals are built elsewhere (facades, street dressing, vegetation, cars).
const SKIP = new Set(['tower', 'trunk', 'car', 'barrier']);

export class BuildingManager {
  constructor(group, data, textures, envMap, assets) {
    this.group = group;
    this.data = data;
    this.tex = textures;
    this.envMap = envMap;
    this.assets = assets;
    this.materials = {};
    this.nightMaterials = [];
    this.facades = new FacadeBuilder(assets);
  }

  // solid material -> [pbr set | null, tile, options]
  _style(mat) {
    const a = this.assets;
    const S = {
      asphalt: () => a.pbr('asphalt', { vertexColors: true, key: 'kl-asphalt' }),
      paving: () => a.pbr('sidewalk', { vertexColors: true, key: 'kl-paving' }),
      concrete: () => a.pbr('concrete', { vertexColors: true, color: 0xd0ccc4, key: 'kl-concrete' }),
      garage: () => a.pbr('concrete', { vertexColors: true, color: 0xbdb9b0, key: 'kl-garage' }),
      stairs: () => a.pbr('concrete', { vertexColors: true, color: 0xc4c0b6, key: 'kl-stairs' }),
      mall: () => a.pbr('granite', { vertexColors: true, color: 0xe2ddd4, key: 'kl-mall' }),
      mallroof: () => a.pbr('concrete', { vertexColors: true, color: 0x77746e, key: 'kl-mallroof' }),
      planter: () => a.pbr('granite', { vertexColors: true, color: 0x9a968f, key: 'kl-planter' }),
      tunnel: () => a.pbr('slab_wall', { vertexColors: true, color: 0xb8b6b0, key: 'kl-tunnel' }),
      tunnelfloor: () => a.pbr('hangar_floor', { vertexColors: true, key: 'kl-tunnelfloor' }),
      container: () => a.pbr('corrugated', { vertexColors: true, color: 0xb4532f, key: 'kl-container' }),
      hut: () => a.pbr('corrugated', { vertexColors: true, color: 0xe4e4dc, key: 'kl-hut' }),
      truck: () => a.pbr('corrugated', { vertexColors: true, color: 0x3c6a98, key: 'kl-truck' }),
      fence: () => new THREE.MeshStandardMaterial({ color: 0x5d666c, metalness: 0.85, roughness: 0.45, vertexColors: true }),
      rail: () => new THREE.MeshStandardMaterial({ color: 0x40464c, metalness: 0.9, roughness: 0.35, vertexColors: true }),
      cabinet: () => new THREE.MeshStandardMaterial({ color: 0x8a9aa5, metalness: 0.7, roughness: 0.4, vertexColors: true }),
      generator: () => new THREE.MeshStandardMaterial({ color: 0x5f6b3a, metalness: 0.6, roughness: 0.5, vertexColors: true }),
      server: () => new THREE.MeshStandardMaterial({ color: 0x1d2024, metalness: 0.7, roughness: 0.35, emissive: 0x0a2a14, vertexColors: true }),
      desk: () => new THREE.MeshStandardMaterial({ color: 0x4f3b2a, metalness: 0, roughness: 0.55, vertexColors: true }),
      kiosk: () => new THREE.MeshStandardMaterial({ color: 0x8c5a2b, metalness: 0, roughness: 0.6, vertexColors: true }),
      crate: () => new THREE.MeshStandardMaterial({ color: 0x8a6a3e, metalness: 0, roughness: 0.8, vertexColors: true }),
      bench: () => new THREE.MeshStandardMaterial({ color: 0x6d4c32, metalness: 0, roughness: 0.7, vertexColors: true }),
      hedge: () => new THREE.MeshStandardMaterial({ map: this.tex.hedge, color: 0xb6c9a6, roughness: 0.9, metalness: 0, vertexColors: true }),
      hoarding: () => new THREE.MeshStandardMaterial({ map: this.tex.hoarding, roughness: 0.6, metalness: 0.1, vertexColors: true }),
      shop: () => new THREE.MeshStandardMaterial({ color: 0x46545e, metalness: 0.85, roughness: 0.08, vertexColors: true }),
      lobby: () => new THREE.MeshStandardMaterial({ color: 0x5c7383, metalness: 0.85, roughness: 0.07, vertexColors: true }),
      // Shophouse row and skybridge
      shopwall: () => new THREE.MeshStandardMaterial({ color: 0xf0e2bc, roughness: 0.88, metalness: 0, vertexColors: true }), // painted plaster
      ceiling: () => new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.95, metalness: 0, vertexColors: true }),
      shopfloor: () => a.pbr('granite', { vertexColors: true, color: 0xc9b8a2, key: 'kl-shopfloor' }),
      shelf: () => new THREE.MeshStandardMaterial({ color: 0x7a5a3a, metalness: 0, roughness: 0.65, vertexColors: true }),
      tank: () => new THREE.MeshStandardMaterial({ color: 0x9fa7ad, metalness: 0.7, roughness: 0.35, vertexColors: true }),
      bridge: () => a.pbr('concrete', { vertexColors: true, color: 0xb6b2aa, key: 'kl-bridge' }),
      bridgeroof: () => new THREE.MeshStandardMaterial({ color: 0xb4bec6, metalness: 0.6, roughness: 0.35, vertexColors: true }),
      glassrail: () => new THREE.MeshStandardMaterial({ color: 0x7f9aa8, metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.4, vertexColors: true }),
      lamp: () => new THREE.MeshStandardMaterial({ color: 0x202020, emissive: 0xe8f0ff, emissiveIntensity: 4, vertexColors: true }),
    };
    return S[mat] ? S[mat]() : new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.8, vertexColors: true });
  }

  static tile(mat) {
    return { asphalt: 6, paving: 2.5, tunnel: 3.5, tunnelfloor: 4, mall: 3, planter: 2, stairs: 2, hoarding: 6, hedge: 2, container: 3, hut: 3, truck: 3, shopwall: 3, shopfloor: 1.5 }[mat] ?? 4;
  }

  buildStatic(skipBench) {
    const byMat = new Map();
    for (const s of this.data.solids) {
      if (SKIP.has(s.mat) || s.mat.startsWith('bld-') || (skipBench && s.mat === 'bench')) continue;
      if (!byMat.has(s.mat)) byMat.set(s.mat, []);
      byMat.get(s.mat).push(worldBox(s.min, s.max, BuildingManager.tile(s.mat), { groundY: s.min[1] < -2 ? -8 : 0 }));
    }
    for (const [mat, geos] of byMat) {
      const style = this._style(mat);
      // Spatial chunks: three.js frustum-culls each chunk, so looking down a street never draws the
      // geometry behind the viewer.
      for (const c of mergeChunked(geos, 48)) {
        const mesh = new THREE.Mesh(c.geometry, style);
        mesh.name = `city-${mat}`;
        mesh.receiveShadow = true;
        mesh.castShadow = !['asphalt', 'tunnelfloor', 'paving'].includes(mat);
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        this.group.add(mesh);
      }
    }
  }

  // Every high-rise / shophouse solid becomes detailed facade geometry.
  buildFacades() {
    const blocks = this.data.solids.filter((s) => s.mat.startsWith('bld-')).map((s) => ({
      x0: s.min[0], z0: s.min[2], x1: s.max[0], z1: s.max[2], y0: s.min[1], h: s.max[1], style: s.mat.slice(4), skip: s.skipFaces,
    }));
    this.facadeDetail = [];
    for (const m of this.facades.build(blocks, { x: 0, z: 0 })) {
      this.group.add(m);
      if (m.userData.detail) this.facadeDetail.push(m);
    }
    return this.facades.rooftop;
  }

  // Fine facade detail (mullions, sills, shutters) is only drawn within `distance` of the viewer.
  updateDetail(camPos, distance) {
    const d2 = distance * distance;
    for (const m of this.facadeDetail) {
      const dx = m.userData.cx - camPos.x, dz = m.userData.cz - camPos.z;
      m.visible = dx * dx + dz * dz < d2;
    }
  }

  // ---------------------------------------------------------------- Twin Towers
  buildTwinTowers() {
    const skin = new THREE.MeshStandardMaterial({
      map: this.tex.towerSkin, emissiveMap: this.tex.towerSkin_night, metalness: 0.82, roughness: 0.2,
      envMapIntensity: 1.3, color: 0xe6ecf1, emissive: 0x000000,
    });
    const steel = new THREE.MeshStandardMaterial({ color: 0xe9edf0, metalness: 1, roughness: 0.16, envMapIntensity: 1.4, emissive: 0x000000 });
    skin.userData.nightEmissive = true;
    steel.userData.nightEmissive = true;
    this.nightMaterials.push(skin, steel);
    this.towerMaterials = { skin, steel };
    const root = new THREE.Group();
    root.name = 'twin-towers';
    const base = this.data.podiumRoof;
    for (const t of this.data.towers) root.add(buildTowerLOD(t.x, t.z, base, skin, steel));
    const [ta, tb] = this.data.towers;
    const midX = (ta.x + tb.x) / 2, z = ta.z;
    const bridgeLen = Math.abs(tb.x - ta.x) - 15;
    const parts = [];
    for (const [y, h] of [[77.2, 2.2], [79.6, 2.2]]) {
      const deck = new THREE.BoxGeometry(bridgeLen, h, 3.4); deck.translate(midX, y + h / 2, z); parts.push(deck);
    }
    const glassBand = new THREE.BoxGeometry(bridgeLen - 0.4, 3.6, 3.6); glassBand.translate(midX, 79.6, z);
    for (const side of [-1, 1]) {
      const leg = new THREE.CylinderGeometry(0.35, 0.45, 26, 10);
      leg.rotateZ(side * 0.55);
      leg.translate(midX + side * 6.4, 66.5, z);
      parts.push(leg);
    }
    const bridge = new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed())), steel);
    bridge.castShadow = true;
    root.add(bridge, new THREE.Mesh(glassBand, new THREE.MeshStandardMaterial({ color: 0x40505c, metalness: 0.9, roughness: 0.05 })));
    this.group.add(root);
    this.towers = root;
    return root;
  }

  // Ring of instanced high-rises beyond the playable area (horizon silhouette), varied by facade.
  buildSkyline() {
    const rand = (() => { let s = 99; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    // Unit boxes are scaled per instance, so tile the facade textures to a typical building size
    // (otherwise each window would stretch across a whole distant tower).
    const tiled = (t) => { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(4, 14); c.needsUpdate = true; return c; };
    const mats = [
      new THREE.MeshStandardMaterial({ map: tiled(this.tex.glass), emissiveMap: tiled(this.tex.glass_night), color: 0xc8d2d8, metalness: 0.6, roughness: 0.25 }),
      new THREE.MeshStandardMaterial({ map: tiled(this.tex.office), emissiveMap: tiled(this.tex.office_night), color: 0xd8d4cc, metalness: 0.1, roughness: 0.7 }),
    ];
    for (const m of mats) { m.userData.nightEmissive = true; this.nightMaterials.push(m); }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    mats.forEach((mat, k) => {
      const count = 110;
      const inst = new THREE.InstancedMesh(geo, mat, count);
      for (let i = 0; i < count; i++) {
        const a = rand() * Math.PI * 2;
        const r = 150 + rand() * 520;
        const h = 20 + rand() * rand() * 170;
        const w = 14 + rand() * 22;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.round(rand() * 4) * (Math.PI / 2) + (rand() - 0.5) * 0.3);
        s.set(w, h, w * (0.7 + rand() * 0.6));
        m4.compose(p.set(Math.cos(a) * r, 0, Math.sin(a) * r), q, s);
        inst.setMatrixAt(i, m4);
      }
      inst.name = `skyline-${k}`;
      this.group.add(inst);
    });
  }

  setNight(night) {
    this.facades.setNight(night);
    for (const m of this.nightMaterials) {
      if (m === this.towerMaterials?.steel) {
        m.emissive.setHex(night ? 0x8090a0 : 0x000000);
        m.emissiveIntensity = night ? 0.9 : 0;
      } else {
        m.emissive.setHex(night ? 0xffffff : 0x000000);
        m.emissiveIntensity = night ? (m === this.towerMaterials?.skin ? 1.1 : 0.8) : 0;
      }
      m.needsUpdate = true;
    }
  }
}

// ---------------------------------------------------------------- tower geometry
// Plan: union of two squares (8-point star) with circular infill → scalloped star.
function towerOutline(R, segments, scale = 1) {
  const pts = [];
  const sq = (a) => {
    const m = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
    return (R * Math.SQRT1_2) / Math.cos(m - Math.PI / 4);
  };
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const r = Math.max(sq(a + Math.PI / 4), sq(a), R * 0.84) * scale;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

function prism(outline, y0, y1, uScale = 4, vScale = 4, cap = true) {
  const pos = [], uv = [], idx = [];
  let perim = 0;
  const n = outline.length;
  for (let i = 0; i <= n; i++) {
    const [x, z] = outline[i % n];
    if (i > 0) { const [px, pz] = outline[i - 1]; perim += Math.hypot(x - px, z - pz); }
    pos.push(x, y0, z, x, y1, z);
    uv.push(perim / uScale, y0 / vScale, perim / uScale, y1 / vScale);
  }
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  if (cap) {
    const base = pos.length / 3;
    pos.push(0, y1, 0); uv.push(0.5, 0.5);
    for (let i = 0; i < n; i++) { pos.push(outline[i][0], y1, outline[i][1]); uv.push(0.5, 0.5); }
    for (let i = 0; i < n; i++) idx.push(base, base + 1 + ((i + 1) % n), base + 1 + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

const TIERS = [[10, 118], [9.2, 132], [8.2, 142], [7, 150], [5.6, 157], [4.2, 163]];

function buildTowerLOD(cx, cz, baseY, skinMat, steelMat) {
  const lod = new THREE.LOD();
  lod.position.set(cx, 0, cz);
  {
    const skin = [], rings = [];
    let y0 = baseY;
    for (const [r, top] of TIERS) {
      skin.push(prism(towerOutline(r, 96), y0, top, 10, 14));
      // Stainless sunshade ring on every floor (real geometry, catches the light)
      for (let y = y0 + 3.6; y < top - 0.5; y += 4.2) {
        rings.push(prism(towerOutline(r, 64, 1.035), y, y + 0.28, 10, 14, false));
        rings.push(prism(towerOutline(r, 64, 1.035), y + 0.28, y + 0.3, 10, 14, true));
      }
      // Setback ledge
      rings.push(prism(towerOutline(r, 64, 1.06), top - 0.6, top, 10, 14, true));
      y0 = top;
    }
    const crown = [];
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.TorusGeometry(3.4 - i * 0.6, 0.18, 6, 24);
      ring.rotateX(Math.PI / 2);
      ring.translate(0, 164 + i * 2.2, 0);
      crown.push(ring.toNonIndexed());
    }
    const mast = new THREE.CylinderGeometry(1.1, 1.6, 12, 12).translate(0, 169, 0);
    const spire = new THREE.CylinderGeometry(0.08, 0.7, 34, 8).translate(0, 192, 0);
    const ball = new THREE.SphereGeometry(0.9, 12, 8).translate(0, 186, 0);
    const hi = new THREE.Group();
    hi.add(new THREE.Mesh(mergeGeometries(skin), skinMat));
    hi.add(new THREE.Mesh(mergeGeometries([...rings, ...crown, mast.toNonIndexed(), spire.toNonIndexed(), ball.toNonIndexed()]), steelMat));
    hi.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    lod.addLevel(hi, 0);
  }
  {
    const geos = [];
    let y0 = baseY;
    for (const [r, top] of [[10, 132], [7.5, 150], [5, 163]]) { geos.push(prism(towerOutline(r, 16), y0, top, 10, 14)); y0 = top; }
    const lo = new THREE.Group();
    lo.add(new THREE.Mesh(mergeGeometries(geos), skinMat));
    lo.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 1.2, 46, 6).translate(0, 186, 0), steelMat));
    lod.addLevel(lo, 360);
  }
  return lod;
}
