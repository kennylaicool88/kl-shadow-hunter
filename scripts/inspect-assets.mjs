// Prints glTF facts (bounds, nodes, materials, animations, bones) for assets in the manifest.
// Usage: node scripts/inspect-assets.mjs [name ...]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('public/assets');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const want = process.argv.slice(2);

function readGltf(file) {
  const buf = fs.readFileSync(path.join(ROOT, file));
  if (file.endsWith('.glb')) {
    const len = buf.readUInt32LE(12);
    return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
  }
  return JSON.parse(buf.toString('utf8'));
}

const entries = [...Object.entries(manifest.models), ...Object.entries(manifest.characters)];
for (const [name, m] of entries) {
  if (want.length && !want.includes(name)) continue;
  const j = readGltf(m.file);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of j.meshes || []) for (const p of mesh.primitives) {
    const a = j.accessors[p.attributes.POSITION];
    if (!a.min) continue;
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], a.min[i]); max[i] = Math.max(max[i], a.max[i]); }
  }
  const nodes = (j.nodes || []).filter((n) => n.mesh !== undefined).map((n) => `${n.name}${n.rotation ? ' rot' + JSON.stringify(n.rotation.map((v) => +v.toFixed(3))) : ''}${n.scale ? ' scl' + JSON.stringify(n.scale) : ''}`);
  console.log(`\n== ${name} (${m.file})`);
  console.log(' mesh bounds min', min.map((v) => +v.toFixed(3)), 'max', max.map((v) => +v.toFixed(3)));
  console.log(' mesh nodes:', nodes.slice(0, 8).join(' | '));
  console.log(' materials:', (j.materials || []).map((x) => x.name).join(', '));
  if (j.animations) console.log(' animations:', j.animations.map((a) => a.name).join(', '));
  if (j.skins) console.log(' bones:', j.skins[0].joints.map((i) => j.nodes[i].name).filter((n) => /Hips|Spine|Hand|Head|Neck/.test(n)).join(', '));
}
