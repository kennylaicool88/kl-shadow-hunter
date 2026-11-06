// Shared asset pipeline: reads /assets/manifest.json (written by scripts/fetch-assets.mjs),
// loads and caches glTF models, PBR texture sets and HDRIs, and builds reusable PBR materials.
// Anything missing falls back to procedural content and is recorded in `fallbacks` (shown in the console).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

// Relative to the site base so the game also works from a sub-path (e.g. GitHub Pages /<repo>/).
const BASE = `assets/`;

export class AssetLibrary {
  constructor(renderer) {
    this.renderer = renderer;
    this.manifest = null;
    this.gltf = new GLTFLoader();
    this.tex = new THREE.TextureLoader();
    this.rgbe = new RGBELoader();
    this.models = new Map(); // name -> gltf
    this.textureSets = new Map(); // name -> {diff, nor, arm}
    this.materials = new Map();
    this.hdri = new Map(); // name -> { env, background, sunDir }
    this.fallbacks = [];
    this.anisotropy = 8;
    this.pmrem = new THREE.PMREMGenerator(renderer);
  }

  async init() {
    try {
      const r = await fetch(`${BASE}manifest.json`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      this.manifest = await r.json();
    } catch (err) {
      this.manifest = { textures: {}, hdri: {}, models: {}, characters: {} };
      this._fallback('manifest', `assets/manifest.json unavailable (${err.message}); run "npm run assets". Using procedural fallbacks.`);
    }
    return this;
  }

  _fallback(name, reason) {
    this.fallbacks.push({ name, reason });
    console.warn(`[assets] TEMPORARY FALLBACK for ${name}: ${reason}`);
  }

  has(kind, name) {
    return !!(this.manifest && this.manifest[kind] && this.manifest[kind][name]);
  }

  // ------------------------------------------------------------------ textures & materials
  async loadTextureSets(names) {
    await Promise.all(names.map(async (name) => {
      if (this.textureSets.has(name)) return;
      const m = this.manifest.textures[name];
      if (!m) { this._fallback(`texture:${name}`, 'not in manifest'); this.textureSets.set(name, null); return; }
      try {
        const [diff, nor, arm] = await Promise.all(['diff', 'nor', 'arm'].map((k) => this.tex.loadAsync(BASE + m.files[k])));
        diff.colorSpace = THREE.SRGBColorSpace;
        for (const t of [diff, nor, arm]) {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = this.anisotropy;
        }
        this.textureSets.set(name, { diff, nor, arm });
      } catch (err) {
        this._fallback(`texture:${name}`, err.message);
        this.textureSets.set(name, null);
      }
    }));
  }

  /**
   * Shared PBR material from a texture set. opts: { color, roughness, metalness, normalScale, envIntensity, key }
   * The ARM map packs AO (R), roughness (G) and metalness (B) as three.js expects.
   * Returns a procedural-colour standard material if the set is unavailable.
   */
  pbr(setName, opts = {}) {
    const key = opts.key || `${setName}|${JSON.stringify(opts)}`;
    if (this.materials.has(key)) return this.materials.get(key);
    const set = this.textureSets.get(setName);
    const m = new THREE.MeshStandardMaterial({
      color: opts.color ?? 0xffffff,
      roughness: opts.roughness ?? 1,
      metalness: opts.metalness ?? (set ? 1 : 0),
      envMapIntensity: opts.envIntensity ?? 1,
    });
    if (set) {
      m.map = set.diff;
      m.normalMap = set.nor;
      m.normalScale = new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1);
      m.aoMap = set.arm;
      m.roughnessMap = set.arm;
      m.metalnessMap = set.arm;
      m.aoMapIntensity = opts.ao ?? 1;
    } else {
      m.color.set(opts.fallbackColor ?? opts.color ?? 0x8a8a8a);
      m.roughness = opts.roughness ?? 0.85;
      m.metalness = opts.metalness ?? 0;
    }
    if (opts.vertexColors) m.vertexColors = true;
    m.name = key;
    this.materials.set(key, m);
    return m;
  }

  // ------------------------------------------------------------------ models
  async loadModels(names) {
    await Promise.all(names.map(async (name) => {
      if (this.models.has(name)) return;
      const m = this.manifest.models[name] || this.manifest.characters[name];
      if (!m) { this._fallback(`model:${name}`, 'not in manifest'); this.models.set(name, null); return; }
      try {
        const g = await this.gltf.loadAsync(BASE + m.file);
        g.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const mat of mats) {
              for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) if (mat[k]) mat[k].anisotropy = this.anisotropy;
            }
          }
        });
        this.models.set(name, g);
      } catch (err) {
        this._fallback(`model:${name}`, err.message);
        this.models.set(name, null);
      }
    }));
  }

  hasModel(name) {
    return !!this.models.get(name);
  }

  /**
   * Clone of a loaded model. opts.include / opts.exclude: regex on mesh/node names (variants in one file).
   * opts.skinned: deep-clone skeletons. Returns null if unavailable.
   */
  model(name, opts = {}) {
    const g = this.models.get(name);
    if (!g) return null;
    const root = opts.skinned ? SkeletonUtils.clone(g.scene) : g.scene.clone(true);
    if (opts.include || opts.exclude) {
      const remove = [];
      // Match against the mesh and all its ancestors: multi-material glTF nodes load as a Group
      // whose child meshes carry suffixed names.
      root.traverse((o) => {
        if (!o.isMesh) return;
        const names = [];
        for (let p = o; p && p !== root; p = p.parent) names.push(p.name || '');
        const hit = (re) => names.some((n) => re.test(n));
        if ((opts.include && !hit(opts.include)) || (opts.exclude && hit(opts.exclude))) remove.push(o);
      });
      for (const o of remove) o.parent.remove(o);
    }
    return root;
  }

  animations(name) {
    const g = this.models.get(name);
    return g ? g.animations : [];
  }

  /**
   * Merges every mesh of a model into one geometry per material (for InstancedMesh use).
   * Returns [{ geometry, material }] in the model's local space, optionally re-centred on the floor.
   */
  flatten(name, opts = {}) {
    const root = this.model(name, opts);
    if (!root) return null;
    root.updateMatrixWorld(true);
    const byMat = new Map();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      // Keep only the attributes InstancedMesh needs, consistently across parts.
      for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!byMat.has(mat)) byMat.set(mat, []);
      byMat.get(mat).push(g.index ? g.toNonIndexed() : g);
    });
    const out = [];
    const box = new THREE.Box3();
    const parts = [];
    for (const [mat, geos] of byMat) {
      const merged = geos.length === 1 ? geos[0] : mergeSimple(geos);
      parts.push({ geometry: merged, material: mat });
      merged.computeBoundingBox();
      box.union(merged.boundingBox);
    }
    const dx = opts.center ? -(box.min.x + box.max.x) / 2 : 0;
    const dz = opts.center ? -(box.min.z + box.max.z) / 2 : 0;
    const dy = opts.floor ? -box.min.y : 0;
    const s = opts.scale ?? 1;
    for (const p of parts) {
      p.geometry.translate(dx, dy, dz);
      if (s !== 1) p.geometry.scale(s, s, s);
      p.geometry.computeBoundingSphere();
      out.push(p);
    }
    out.size = box.getSize(new THREE.Vector3()).multiplyScalar(s);
    return out;
  }

  // ------------------------------------------------------------------ HDRI environment
  async loadHDRI(name) {
    if (this.hdri.has(name)) return this.hdri.get(name);
    const m = this.manifest.hdri[name];
    if (!m) { this._fallback(`hdri:${name}`, 'not in manifest; using generated sky environment'); this.hdri.set(name, null); return null; }
    try {
      const tex = await this.rgbe.loadAsync(BASE + m.file);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const env = this.pmrem.fromEquirectangular(tex).texture;
      const res = { background: tex, env, sunDir: findSun(tex) };
      this.hdri.set(name, res);
      return res;
    } catch (err) {
      this._fallback(`hdri:${name}`, err.message);
      this.hdri.set(name, null);
      return null;
    }
  }

  report() {
    return {
      textures: [...this.textureSets.entries()].filter(([, v]) => v).length,
      models: [...this.models.entries()].filter(([, v]) => v).length,
      hdri: [...this.hdri.entries()].filter(([, v]) => v).length,
      fallbacks: this.fallbacks,
    };
  }
}

function mergeSimple(geos) {
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nrm.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return m;
}

// Direction of the brightest region of an equirect HDR (used to align the sun light with the sky).
function findSun(tex) {
  const { data, width, height } = tex.image;
  if (!data) return new THREE.Vector3(0.4, 0.8, 0.3).normalize();
  const stride = data.length / (width * height);
  const toFloat = data instanceof Uint16Array ? THREE.DataUtils.fromHalfFloat : (v) => v;
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y < height / 2; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * stride;
      const l = toFloat(data[i]) * 0.2126 + toFloat(data[i + 1]) * 0.7152 + toFloat(data[i + 2]) * 0.0722;
      if (l > best) { best = l; bx = x; by = y; }
    }
  }
  // Inverse of three.js equirectUv(): u = atan(z, x)/2π + 0.5, v = asin(y)/π + 0.5 (row 0 = top).
  const a = (bx / width - 0.5) * Math.PI * 2;
  const theta = (by / height) * Math.PI; // angle from zenith
  const dir = new THREE.Vector3(Math.sin(theta) * Math.cos(a), Math.cos(theta), Math.sin(theta) * Math.sin(a));
  if (dir.y < 0.25) dir.y = 0.25; // keep shadows usable if the sky's brightest spot is near the horizon
  return dir.normalize();
}
