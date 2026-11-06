// Dev gallery (?forge[&ids=a,b][&att=optic:x4,muzzle:suppressor][&lod=1]): renders weapon models side by
// side with HDRI lighting so proportions and silhouettes can be reviewed. Used by scripts/forge-shots.mjs.
import * as THREE from 'three';
import { AssetLibrary } from '../render/AssetLibrary.js';
import { buildWeaponModel, buildViewModel, setWeaponAssets } from '../weapons/WeaponModels.js';
import { ALL_WEAPON_IDS, getWeaponConfig } from '../weapons/weaponConfigs.js';

export async function runForgeGallery(params) {
  document.getElementById('main-menu').classList.add('hidden');
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  const assets = new AssetLibrary(renderer);
  await assets.init();
  await Promise.all([assets.loadHDRI('day'), assets.loadModels(['pistol', 'bolt_rifle'])]);
  setWeaponAssets(assets);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x3a3f45);
  const hdri = assets.hdri.get('day');
  if (hdri) { scene.environment = hdri.env; scene.environmentIntensity = 0.9; }
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 3, 2);
  scene.add(key, new THREE.HemisphereLight(0xddeeff, 0x332211, 0.6));

  const ids = params.get('ids') ? params.get('ids').split(',') : ALL_WEAPON_IDS;
  const att = {};
  if (params.get('att')) for (const kv of params.get('att').split(',')) { const [k, v] = kv.split(':'); att[k] = v; }
  const lod = Number(params.get('lod') || 0);
  const cols = Number(params.get('cols') || (ids.length <= 4 ? 1 : ids.length <= 12 ? 2 : 4));
  const rows = Math.ceil(ids.length / cols);
  const cellW = 1.4, cellH = 0.42;
  const labels = [];
  const stats = [];
  ids.forEach((id, i) => {
    let m;
    if (params.has('vm')) {
      // First-person assembly (weapon + hands), shown at weapon scale for review.
      const v = buildViewModel(id, att);
      m = v.userData.weapon;
      v.remove(m);
      m.scale.setScalar(1);
      m.rotation.set(0, 0, 0);
    } else m = buildWeaponModel(id, { attachments: att, lod });
    const c = i % cols, r = Math.floor(i / cols);
    // Side view: barrel points to screen-left (-Z -> -X)
    m.rotation.y = -Math.PI / 2;
    const box = new THREE.Box3().setFromObject(m);
    const center = box.getCenter(new THREE.Vector3());
    m.position.set(c * cellW - center.x, -r * cellH - center.y, -center.z);
    scene.add(m);
    let tris = 0;
    m.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    stats.push({ id, tris: Math.round(tris), len: +(box.max.x - box.min.x).toFixed(3), source: m.userData.source });
    labels.push({ id, name: getWeaponConfig(id).name, x: c * cellW, y: -r * cellH + cellH * 0.42 });
  });
  const w = cols * cellW, h = rows * cellH;
  const aspect = window.innerWidth / window.innerHeight;
  const half = Math.max(w / aspect, h) / 2 + 0.05;
  const cam = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.01, 20);
  cam.position.set((cols - 1) * cellW / 2, -(rows - 1) * cellH / 2, 5);
  cam.lookAt(cam.position.x, cam.position.y, 0);
  if (params.has('persp')) {
    // 3/4 view for detail review
    const p = new THREE.PerspectiveCamera(30, aspect, 0.01, 50);
    const span = Math.max(w * 0.75, h * 1.6);
    p.position.set(cam.position.x - span * 0.35, cam.position.y + span * 0.28, span * 1.25);
    p.lookAt(cam.position.x, cam.position.y, 0);
    renderer.render(scene, p);
  } else renderer.render(scene, cam);
  // Labels
  const root = document.getElementById('game-root');
  for (const l of labels) {
    const v = new THREE.Vector3(l.x, l.y, 0).project(cam);
    const d = document.createElement('div');
    d.textContent = `${l.name} (${l.id})`;
    Object.assign(d.style, { position: 'absolute', left: `${(v.x * 0.5 + 0.5) * window.innerWidth}px`, top: `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`, transform: 'translateX(-50%)', color: '#eee', font: '12px monospace', textShadow: '0 1px 2px #000' });
    root.appendChild(d);
  }
  window.__forge = { done: true, stats };
}
