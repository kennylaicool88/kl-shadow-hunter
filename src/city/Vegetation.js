// Tropical vegetation for the KLCC park: umbrella-canopy rain trees and royal palms.
// Built procedurally (Poly Haven's scanned trees are 1.7–4.8M polygons, far too heavy for a browser):
// tapered trunk/branch geometry + alpha-tested leaf cards with a canvas-painted foliage texture,
// instanced so all trees of one species cost two or three draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// Clustered small leaves (rain tree foliage card).
function leafClusterTexture() {
  const [c, g] = canvas(256, 256);
  const r = rng(11);
  for (let i = 0; i < 900; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 118;
    const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d * 0.8;
    const s = 3 + r() * 5;
    const l = 0.55 + r() * 0.45;
    g.fillStyle = `rgb(${Math.floor(48 * l)},${Math.floor(98 * l + 20)},${Math.floor(34 * l)})`;
    g.beginPath();
    g.ellipse(x, y, s, s * 0.55, r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Palm frond: central rib with paired leaflets (alpha cut-out).
function frondTexture() {
  const [c, g] = canvas(128, 512);
  g.strokeStyle = '#5b6b2e';
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 512); g.stroke();
  for (let y = 8; y < 500; y += 7) {
    const len = 58 * Math.sin((y / 512) * Math.PI) + 6;
    for (const s of [-1, 1]) {
      const l = 0.7 + ((y * 7) % 13) / 40;
      g.strokeStyle = `rgb(${Math.floor(60 * l)},${Math.floor(120 * l)},${Math.floor(42 * l)})`;
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + s * len * 0.6, y + 6, 64 + s * len, y + 22); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function barkTexture() {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#5d4a39'; g.fillRect(0, 0, 128, 256);
  const r = rng(5);
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = `rgba(${r() > 0.5 ? '30,22,16' : '120,100,80'},${0.2 + r() * 0.3})`;
    g.lineWidth = 1 + r() * 2;
    const x = r() * 128, y = r() * 256;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y + 10 + r() * 30); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Tapered limb between two points.
function limb(a, b, r0, r1, seg = 7) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 3);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

function card(center, size, rotY, tiltX) {
  const g = new THREE.PlaneGeometry(size, size * 0.8);
  g.rotateX(-Math.PI / 2 + tiltX);
  g.rotateY(rotY);
  g.translate(center.x, center.y, center.z);
  return g;
}

export class Vegetation {
  constructor(group, quality = 'high') {
    this.group = group;
    const bark = barkTexture();
    this.barkMat = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95, metalness: 0 });
    this.leafMat = new THREE.MeshStandardMaterial({ map: leafClusterTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, metalness: 0 });
    this.frondMat = new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7, metalness: 0 });
    this.cardsPerTree = quality === 'low' ? 50 : quality === 'medium' ? 80 : 110;
  }

  // Samanea saman ("rain tree"): short trunk, wide spreading limbs, umbrella canopy.
  _rainTree(seed) {
    const r = rng(seed);
    const wood = [], leaves = [];
    const trunkTop = new THREE.Vector3(0, 3.2 + r() * 0.8, 0);
    wood.push(limb(new THREE.Vector3(0, -0.2, 0), trunkTop, 0.55, 0.42, 9));
    const tips = [];
    const nLimbs = 5;
    for (let i = 0; i < nLimbs; i++) {
      const a = (i / nLimbs) * Math.PI * 2 + r() * 0.6;
      const reach = 4.5 + r() * 2.5;
      const mid = new THREE.Vector3(Math.cos(a) * reach * 0.5, trunkTop.y + 1.6 + r() * 0.8, Math.sin(a) * reach * 0.5);
      const tip = new THREE.Vector3(Math.cos(a) * reach, trunkTop.y + 2.7 + r() * 1.2, Math.sin(a) * reach);
      wood.push(limb(trunkTop, mid, 0.32, 0.2), limb(mid, tip, 0.2, 0.08, 6));
      tips.push(tip, mid);
    }
    // Canopy: leaf cards on an umbrella-shaped shell over the limb tips
    for (let i = 0; i < this.cardsPerTree; i++) {
      // Half the foliage clusters around branch tips/mid-points (hides bare limbs), half fills the dome.
      let x, y, z;
      if (i % 2 === 0) {
        const t = tips[i % tips.length];
        x = t.x + (r() - 0.5) * 2.4; z = t.z + (r() - 0.5) * 2.4; y = t.y + (r() - 0.2) * 1.4;
      } else {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 7.4;
        x = Math.cos(a) * d; z = Math.sin(a) * d;
        y = trunkTop.y + 2.6 + Math.cos((d / 7.4) * Math.PI * 0.5) * 2.4 + (r() - 0.5) * 1.2;
      }
      leaves.push(card(new THREE.Vector3(x, y, z), 2.8 + r() * 1.8, r() * Math.PI, (r() - 0.5) * 1.1));
    }
    return { wood: mergeGeometries(wood), leaves: mergeGeometries(leaves) };
  }

  // Royal palm: smooth ringed trunk, crownshaft and arching fronds.
  _palm(seed) {
    const r = rng(seed);
    const h = 9 + r() * 3;
    const wood = [limb(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(r() * 0.4, h, r() * 0.4), 0.32, 0.22, 10)];
    const top = new THREE.Vector3(0, h, 0);
    wood.push(limb(top, top.clone().add(new THREE.Vector3(0, 1.4, 0)), 0.26, 0.2, 8)); // crownshaft
    const fronds = [];
    const n = 13;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.3;
      const g = new THREE.PlaneGeometry(1.3, 4.6, 1, 6);
      // Arch the frond: bend along its length
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const y = p.getY(k) + 2.3; // 0..4.6
        p.setZ(k, -(y * y) * 0.07);
        p.setY(k, y);
      }
      g.rotateX(-Math.PI / 2 + 0.55 + r() * 0.25);
      g.rotateY(a);
      g.translate(top.x, top.y + 1.3, top.z);
      fronds.push(g);
    }
    return { wood: mergeGeometries(wood), leaves: mergeGeometries(fronds) };
  }

  _instance(geos, mat, placements, cast = true) {
    const inst = new THREE.InstancedMesh(geos, mat, placements.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    placements.forEach((pl, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.rot);
      s.setScalar(pl.scale);
      m.compose(p.set(pl.x, pl.y || 0, pl.z), q, s);
      inst.setMatrixAt(i, m);
    });
    inst.castShadow = cast;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    this.group.add(inst);
    return inst;
  }

  /** trees: [[x, z, scale]] from the level data; palms: [[x, z]] */
  build(trees, palms) {
    // Two rain-tree variants alternate for variety.
    const variants = [this._rainTree(3), this._rainTree(17)];
    variants.forEach((v, k) => {
      const pl = trees.filter((_, i) => i % 2 === k).map(([x, z, s], i) => ({ x, z, scale: 0.75 + s * 0.35, rot: i * 2.1 }));
      if (!pl.length) return;
      this._instance(v.wood, this.barkMat, pl);
      this._instance(v.leaves, this.leafMat, pl);
    });
    if (palms.length) {
      const pv = this._palm(9);
      const pl = palms.map(([x, z], i) => ({ x, z, scale: 0.9 + (i % 3) * 0.08, rot: i * 1.7 }));
      this._instance(pv.wood, this.barkMat, pl);
      this._instance(pv.leaves, this.frondMat, pl);
    }
  }
}
