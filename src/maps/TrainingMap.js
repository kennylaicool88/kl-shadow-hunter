// Builds the renderable Training Depot from pure map data.
// PBR texture sets (Poly Haven, CC0) with world-projected UVs and baked AO vertex colours; static
// boxes are merged per material (a handful of draw calls). Barrels are real glTF models.
// If an asset is missing, the original canvas textures are used as a documented fallback.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createTextures } from './Textures.js';
import { worldBox, applyEnvironment } from '../render/geometryUtils.js';

// solid material -> PBR texture set + tile size (metres per repeat)
const PBR = {
  ground: { set: 'hangar_floor', tile: 5, color: 0xd8d2c4 },
  concrete: { set: 'concrete', tile: 4 },
  brick: { set: 'brick', tile: 3 },
  metal: { set: 'corrugated', tile: 3, color: 0x9fb2ba, metalness: 1 },
  roof: { set: 'corrugated', tile: 4, color: 0x8a8f94, metalness: 1 },
  stairs: { set: 'concrete', tile: 2, color: 0xc8c2b6 },
};

export class TrainingMap {
  constructor(scene, mapData, quality = 'high', assets = null) {
    this.scene = scene;
    this.data = mapData;
    this.assets = assets;
    this.group = new THREE.Group();
    this.group.name = 'map';
    this.quality = quality;
    this.sun = null;
    this.textures = createTextures(8); // canvas fallbacks + crate/stairs detail
    this._build();
    scene.add(this.group);
  }

  _material(mat) {
    const a = this.assets;
    const p = PBR[mat];
    if (p && a && a.textureSets.get(p.set)) {
      return a.pbr(p.set, { color: p.color ?? 0xffffff, metalness: p.metalness, vertexColors: true, key: `depot-${mat}` });
    }
    if (mat === 'crate') {
      // Crates keep their painted canvas artwork but get a physically based response.
      const m = new THREE.MeshStandardMaterial({ map: this.textures.crate, roughness: 0.82, metalness: 0, vertexColors: true });
      const wood = a && a.textureSets.get('metal_plate');
      if (wood) { m.normalMap = wood.nor; m.normalScale.set(0.25, 0.25); }
      return m;
    }
    // Documented fallback: procedural canvas texture.
    if (a && p) a._fallback(`depot:${mat}`, 'PBR set unavailable, using canvas texture');
    return new THREE.MeshStandardMaterial({ map: this.textures[mat] || null, roughness: 0.9, vertexColors: true });
  }

  _build() {
    const byMat = new Map();
    const barrels = [];
    for (const s of this.data.solids) {
      if (s.mat === 'barrel') { barrels.push(s); continue; }
      const tile = s.mat === 'crate' ? 0 : PBR[s.mat] ? PBR[s.mat].tile : 4;
      const g = worldBox(s.min, s.max, tile);
      if (!byMat.has(s.mat)) byMat.set(s.mat, []);
      byMat.get(s.mat).push(g);
    }
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, this._material(mat));
      mesh.name = `map-${mat}`;
      mesh.receiveShadow = true;
      mesh.castShadow = mat !== 'ground';
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
    }
    this._buildBarrels(barrels);
    this._buildLights();
    this._buildSky();
    this._buildDecor();
  }

  // Barrels: instanced glTF model (fallback: cylinders).
  _buildBarrels(barrels) {
    if (!barrels.length) return;
    const parts = this.assets && this.assets.flatten('barrel', { floor: true, center: true });
    const m = new THREE.Matrix4();
    if (parts) {
      const s = 0.95 / parts.size.y;
      for (const p of parts) {
        const inst = new THREE.InstancedMesh(p.geometry, p.material, barrels.length);
        barrels.forEach((b, i) => {
          m.makeRotationY(i * 1.3).scale(new THREE.Vector3(s, s, s));
          m.setPosition((b.min[0] + b.max[0]) / 2, 0, (b.min[2] + b.max[2]) / 2);
          inst.setMatrixAt(i, m);
        });
        inst.castShadow = inst.receiveShadow = true;
        inst.computeBoundingSphere();
        this.group.add(inst);
      }
      return;
    }
    const inst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.32, 0.95, 14), new THREE.MeshStandardMaterial({ map: this.textures.barrel, roughness: 0.6, metalness: 0.4 }), barrels.length);
    barrels.forEach((b, i) => {
      m.makeRotationY(i * 1.3);
      m.setPosition((b.min[0] + b.max[0]) / 2, 0.475, (b.min[2] + b.max[2]) / 2);
      inst.setMatrixAt(i, m);
    });
    inst.castShadow = inst.receiveShadow = true;
    this.group.add(inst);
  }

  _buildLights() {
    // HDRI provides sky/ambient light; the hemisphere light is only a small fill.
    // The CC0 'pure sky' HDRI has no ground, so a warm hemisphere fill stands in for ground bounce light.
    const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8a7a62, 0.75);
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 3.2);
    const hdri = this.assets && this.assets.hdri.get('day');
    const dir = hdri ? hdri.sunDir : new THREE.Vector3(30, 60, 20).normalize();
    sun.position.copy(dir).multiplyScalar(80);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48;
    sc.near = 5; sc.far = 200;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 3;
    this.group.add(sun, sun.target);
    this.sun = sun;
    this.setShadowQuality(this.quality);

    // Warehouse interior: practical fluorescent fixtures with realistic falloff.
    const lampGeo = new THREE.BoxGeometry(1.4, 0.08, 0.3);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff2d8, emissiveIntensity: 6 });
    for (const [x, z] of [[-4, -6], [4, -6], [-4, 6], [4, 6]]) {
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(x, 5.9, z);
      this.group.add(lamp);
      if (x > 0) continue; // two lights light the warehouse; all four fixtures glow
      const pl = new THREE.PointLight(0xffe8c8, 30, 18, 2);
      pl.position.set(x + 4, 5.5, z);
      this.group.add(pl);
    }
  }

  _buildSky() {
    const hdri = this.assets && this.assets.hdri.get('day');
    // Kept as an (invisible) anchor: Game moves `sky` with the camera.
    this.sky = new THREE.Object3D();
    if (hdri) {
      applyEnvironment(this.scene, hdri, { envIntensity: 0.9, bgIntensity: 0.85 });
      this.scene.fog = new THREE.Fog(0xb9c3c9, 80, 260);
      return;
    }
    if (this.assets) this.assets._fallback('depot:sky', 'day HDRI unavailable, using gradient sky');
    this.scene.environment = null;
    this.scene.background = new THREE.Color(0x9fb4c8);
    this.scene.fog = new THREE.Fog(0xcbbd9f, 70, 190);
  }

  _buildDecor() {
    // Painted spawn markers on the ground (non-colliding decals).
    const makeLabel = (text) => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#e8d36a';
      g.font = 'bold 96px Impact, Arial Black, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.globalAlpha = 0.7;
      g.fillText(text, 128, 68);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({ map: t, color: 0x8a8a8a, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    };
    const plane = new THREE.PlaneGeometry(6, 3);
    const a = new THREE.Mesh(plane, makeLabel('ALPHA'));
    a.rotation.x = -Math.PI / 2;
    a.position.set(0, 0.01, 30);
    const b = new THREE.Mesh(plane, makeLabel('BRAVO'));
    b.rotation.x = -Math.PI / 2;
    b.rotation.z = Math.PI;
    b.position.set(0, 0.01, -30);
    this.group.add(a, b);
    const stripeCanvas = document.createElement('canvas');
    stripeCanvas.width = 128; stripeCanvas.height = 16;
    const sg = stripeCanvas.getContext('2d');
    for (let i = 0; i < 8; i++) {
      sg.fillStyle = i % 2 ? '#c9a227' : '#262626';
      sg.beginPath();
      sg.moveTo(i * 16, 16); sg.lineTo(i * 16 + 8, 0); sg.lineTo(i * 16 + 24, 0); sg.lineTo(i * 16 + 16, 16);
      sg.fill();
    }
    const stripeTex = new THREE.CanvasTexture(stripeCanvas);
    stripeTex.colorSpace = THREE.SRGBColorSpace;
    const stripeMat = new THREE.MeshStandardMaterial({ map: stripeTex, transparent: true, opacity: 0.85, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const z of [-25, 25]) {
      for (const [x, w] of [[0, 8], [-34, 6], [34, 6]]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.5), stripeMat);
        m.rotation.set(-Math.PI / 2, 0, 0);
        m.position.set(x, 0.012, z);
        this.group.add(m);
      }
    }
  }

  update() {}

  exposureAt(p) {
    // Inside the roofed warehouse the eye adapts slightly brighter.
    return Math.abs(p.x) < 8 && Math.abs(p.z) < 12 && p.y < 6 ? 1.25 : 1.0;
  }

  setShadowQuality(quality) {
    if (!this.sun) return;
    this.sun.castShadow = quality !== 'low';
    const size = quality === 'ultra' ? 4096 : quality === 'low' ? 1024 : 2048;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isInstancedMesh && o.geometry) return; // shared asset geometry is owned by the library
      if (o.geometry) o.geometry.dispose();
      if (o.material && !String(o.material.name).startsWith('depot-')) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    for (const t of Object.values(this.textures)) t.dispose();
  }
}
