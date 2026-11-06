// HUD / menu weapon icons: side-view silhouettes rendered once per weapon with the main renderer into a
// render target, read back and cached as data URLs (no extra WebGL context).
import * as THREE from 'three';
import { buildWeaponModel } from '../weapons/WeaponModels.js';
import { buildGrenadeModel, buildEquipmentModel } from '../weapons/forge/equipmentModels.js';

const W = 256, H = 96;

export class WeaponIcons {
  constructor(renderer) {
    this.renderer = renderer;
    this.cache = new Map();
    this.rt = new THREE.WebGLRenderTarget(W, H);
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.buf = new Uint8Array(W * H * 4);
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
  }

  // id: weapon id, 'grenade:<type>' or 'equip:<id>'
  get(id) {
    if (!id) return '';
    if (this.cache.has(id)) return this.cache.get(id);
    let url = '';
    try { url = this._render(id); } catch (err) { console.warn('[icons]', id, err.message); }
    this.cache.set(id, url);
    return url;
  }

  _render(id) {
    let m;
    if (id.startsWith('grenade:')) m = buildGrenadeModel(id.slice(8));
    else if (id.startsWith('equip:')) m = buildEquipmentModel(id.slice(6));
    else m = buildWeaponModel(id, { lod: 1 });
    if (!m) return '';
    const holder = new THREE.Group();
    holder.add(m);
    m.rotation.y = id.includes(':') ? 0.4 : -Math.PI / 2;
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const aspect = W / H;
    const half = Math.max(size.x / aspect, size.y) / 2 * 1.08;
    Object.assign(this.cam, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
    this.cam.position.set(c.x, c.y, c.z + 5);
    this.cam.lookAt(c);
    this.cam.updateProjectionMatrix();
    this.scene.add(holder);
    this.scene.overrideMaterial = this.mat;
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearAlpha();
    const prevColor = r.getClearColor(new THREE.Color());
    const prevTone = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.cam);
    r.readRenderTargetPixels(this.rt, 0, 0, W, H, this.buf);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevColor, prevClear);
    r.toneMapping = prevTone;
    this.scene.remove(holder);
    this.scene.overrideMaterial = null;
    const g = this.canvas.getContext('2d');
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const s = ((H - 1 - y) * W + x) * 4, d = (y * W + x) * 4;
        img.data[d] = img.data[d + 1] = img.data[d + 2] = 235;
        img.data[d + 3] = this.buf[s + 3] > 0 ? 230 : 0;
      }
    }
    g.putImageData(img, 0, 0);
    return this.canvas.toDataURL();
  }
}
