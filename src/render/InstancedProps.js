// Spatially chunked instancing for repeated props. Each chunk is its own InstancedMesh (per material
// part), so three.js frustum-culls chunks individually; chunks beyond the preset's prop distance are
// hidden. One draw call per visible chunk-part instead of one per object.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

export class InstancedProps {
  /**
   * parts: [{ geometry, material }] (e.g. from AssetLibrary.flatten)
   * placements: [{ x, y, z, rotY, scale }]
   */
  // lod: { parts, distance } – a cheaper model shown beyond distance (per chunk).
  constructor(group, parts, placements, { chunk = 40, castShadow = true, name = 'props', lod = null } = {}) {
    this.lod = lod;
    this.chunks = [];
    const buckets = new Map();
    for (const pl of placements) {
      const k = `${Math.floor(pl.x / chunk)},${Math.floor(pl.z / chunk)}`;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(pl);
    }
    for (const list of buckets.values()) {
      const meshes = [];
      const center = new THREE.Vector3();
      for (const pl of list) center.add(_p.set(pl.x, pl.y || 0, pl.z));
      center.divideScalar(list.length);
      const make = (partList, isLod) => partList.map((part) => {
        const inst = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        list.forEach((pl, i) => {
          _e.set(pl.rotX || 0, pl.rotY || 0, pl.rotZ || 0, 'YXZ');
          _q.setFromEuler(_e);
          const sc = pl.scale ?? 1;
          _s.set(sc, pl.scaleY ?? sc, sc);
          _m.compose(_p.set(pl.x, pl.y || 0, pl.z), _q, _s);
          inst.setMatrixAt(i, _m);
        });
        inst.castShadow = castShadow;
        inst.receiveShadow = true;
        inst.computeBoundingSphere();
        inst.name = isLod ? `${name}-lod` : name;
        group.add(inst);
        return inst;
      });
      meshes.push(...make(parts, false));
      const lodMeshes = lod ? make(lod.parts, true) : [];
      this.chunks.push({ center, meshes, lodMeshes });
    }
  }

  // Distance culling (frustum culling is automatic per chunk).
  update(cameraPos, maxDistance) {
    const d2 = maxDistance * maxDistance;
    const l2 = this.lod ? this.lod.distance * this.lod.distance : Infinity;
    for (const c of this.chunks) {
      const dd = c.center.distanceToSquared(cameraPos);
      const vis = dd < d2;
      const near = dd < l2;
      for (const m of c.meshes) m.visible = vis && near;
      for (const m of c.lodMeshes) m.visible = vis && !near;
    }
  }
}
