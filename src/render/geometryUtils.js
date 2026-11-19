// Geometry helpers shared by the level builders.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Box from an AABB with world-projected UVs (texture density independent of box size) and a baked
 * ambient-occlusion approximation in vertex colours: faces darken toward the ground and toward
 * enclosed undersides, which grounds static architecture without per-frame cost.
 */
export function worldBox(min, max, tile = 4, opts = {}) {
  const sx = max[0] - min[0], sy = max[1] - min[1], sz = max[2] - min[2];
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  const colors = new Float32Array(pos.count * 3);
  const groundY = opts.groundY ?? 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nrm.getX(i)), ny = nrm.getY(i);
    if (tile) {
      if (nx > 0.5) uv.setXY(i, z / tile, y / tile);
      else if (Math.abs(ny) > 0.5) uv.setXY(i, x / tile, z / tile);
      else uv.setXY(i, x / tile, y / tile);
    }
    let ao = 1;
    if (Math.abs(ny) < 0.5) ao = 0.62 + 0.38 * Math.min(1, Math.max(0, (y - groundY) / 2.2)); // wall base
    if (ny < -0.5) ao = 0.55; // undersides (lintels, roofs) are occluded
    const tint = opts.tint || [1, 1, 1];
    colors[i * 3] = ao * tint[0]; colors[i * 3 + 1] = ao * tint[1]; colors[i * 3 + 2] = ao * tint[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.clearGroups();
  return g;
}

/**
 * Merges geometries into spatial chunks (by bounding-box centre) so three.js can frustum-cull each
 * chunk separately instead of drawing one giant merged mesh. Returns [{ geometry, cx, cz }].
 */
export function mergeChunked(geos, chunk = 48) {
  const buckets = new Map();
  for (const g of geos) {
    g.computeBoundingBox();
    const b = g.boundingBox;
    const cx = Math.floor((b.min.x + b.max.x) / 2 / chunk), cz = Math.floor((b.min.z + b.max.z) / 2 / chunk);
    const k = `${cx},${cz}`;
    if (!buckets.has(k)) buckets.set(k, { cx: (cx + 0.5) * chunk, cz: (cz + 0.5) * chunk, list: [] });
    buckets.get(k).list.push(g);
  }
  const out = [];
  for (const b of buckets.values()) {
    const merged = b.list.length === 1 ? b.list[0] : mergeGeometries(b.list, false);
    if (b.list.length > 1) b.list.forEach((g) => g.dispose());
    merged.computeBoundingSphere();
    out.push({ geometry: merged, cx: b.cx, cz: b.cz });
  }
  return out;
}

// Adds a uniform vertex-colour attribute (so geometries can merge with worldBox output).
export function withColor(g, c = [1, 1, 1]) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (g.index) {
    const ng = g.toNonIndexed();
    g.dispose();
    return ng;
  }
  return g;
}

/** Applies HDRI lighting to a scene: environment for reflections/ambient, background sky, sun direction. */
export function applyEnvironment(scene, hdri, { background = true, envIntensity = 1, bgIntensity = 1, blur = 0 } = {}) {
  if (!hdri) return null;
  scene.environment = hdri.env;
  scene.environmentIntensity = envIntensity;
  if (background) {
    scene.background = hdri.background;
    scene.backgroundIntensity = bgIntensity;
    scene.backgroundBlurriness = blur;
  }
  return hdri.sunDir.clone();
}
