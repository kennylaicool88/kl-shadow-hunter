// Procedural sedan for traffic and parked cars: beveled extruded side profile, glass greenhouse,
// wheels with rims, lamps and mirrors. Returns geometry parts so many cars can be instanced.
// Car faces +X, length ~4.4 m, origin at ground centre.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function extrudeProfile(points, width, bevel) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  return g;
}

export function buildCarParts() {
  const W = 1.82;
  // Lower body side profile (x along length, y up)
  const body = extrudeProfile([
    [-2.2, 0.32], [2.2, 0.32], [2.25, 0.55], [2.12, 0.78], [1.15, 0.92], [-1.6, 0.95], [-2.18, 0.86], [-2.25, 0.6],
  ], W, 0.06);
  // Greenhouse (cabin) – rendered as glass, slightly narrower
  const cabin = extrudeProfile([
    [-1.35, 0.9], [1.0, 0.9], [0.45, 1.38], [-0.95, 1.42], [-1.55, 0.95],
  ], W - 0.16, 0.05);
  // Roof panel on top of the glass (body colour)
  const roof = new THREE.BoxGeometry(1.2, 0.05, W - 0.3);
  roof.translate(-0.25, 1.43, 0);
  // Pillars between windows (body colour)
  const pillars = [];
  for (const x of [-0.2]) {
    const p = new THREE.BoxGeometry(0.1, 0.5, W - 0.12);
    p.translate(x, 1.15, 0);
    pillars.push(p);
  }
  const paint = mergeGeometries([body, roof, ...pillars].map((g) => (g.index ? g.toNonIndexed() : g)));
  // Wheels: tyre + rim
  const tyres = [], rims = [];
  for (const x of [-1.38, 1.38]) for (const z of [-0.78, 0.78]) {
    const t = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18);
    t.rotateX(Math.PI / 2);
    t.translate(x, 0.34, z);
    tyres.push(t);
    const rim = new THREE.CylinderGeometry(0.22, 0.22, 0.26, 10);
    rim.rotateX(Math.PI / 2);
    rim.translate(x, 0.34, z);
    rims.push(rim);
  }
  // Lamps: head (front, +X) and tail
  const head = [], tail = [];
  for (const z of [-0.62, 0.62]) {
    const h = new THREE.BoxGeometry(0.06, 0.12, 0.38); h.translate(2.22, 0.66, z); head.push(h);
    const t = new THREE.BoxGeometry(0.06, 0.12, 0.42); t.translate(-2.25, 0.72, z); tail.push(t);
  }
  // Grille, bumpers, mirrors (dark trim)
  const trim = [];
  const grille = new THREE.BoxGeometry(0.05, 0.16, 0.8); grille.translate(2.26, 0.5, 0); trim.push(grille);
  for (const x of [2.24, -2.27]) { const b = new THREE.BoxGeometry(0.1, 0.12, W - 0.1); b.translate(x, 0.36, 0); trim.push(b); }
  for (const z of [-0.98, 0.98]) { const m = new THREE.BoxGeometry(0.16, 0.1, 0.12); m.translate(0.75, 1.0, z); trim.push(m); }
  const ni = (arr) => mergeGeometries(arr.map((g) => (g.index ? g.toNonIndexed() : g)));
  return {
    paint,
    glass: cabin.index ? cabin.toNonIndexed() : cabin,
    tyres: ni(tyres),
    rims: ni(rims),
    trim: ni(trim),
    head: ni(head),
    tail: ni(tail),
  };
}

export function carMaterials(envMap) {
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, envMap }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1c2630, metalness: 0.9, roughness: 0.05, envMap }),
    tyres: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9, metalness: 0 }),
    rims: new THREE.MeshStandardMaterial({ color: 0xbfc4c8, metalness: 1, roughness: 0.25, envMap }),
    trim: new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.6, metalness: 0.2 }),
    head: new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.1, metalness: 0.3, emissive: 0xfff3d6, emissiveIntensity: 0 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x7a1010, roughness: 0.2, metalness: 0.2, emissive: 0xff2010, emissiveIntensity: 0 }),
  };
}
