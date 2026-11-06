// Models for throwables and tactical equipment.
// Grenades, rangefinder, detector and shield are original forge models; binoculars, medical kit,
// ammunition box and flashlight use Poly Haven CC0 scans when available (procedural fallback otherwise).
import * as THREE from 'three';
import { Build, instantiate, box, cyl, cylX, cylY, lathe, prof, tor, sphere } from './parts.js';
import { material } from './materials.js';

const PI = Math.PI;
const specs = new Map();
let ASSETS = null;
export function setEquipmentAssets(a) { ASSETS = a; }

// ------------------------------------------------------------------ grenades (origin = centre of mass)
const GRENADE = {
  frag(b) {
    // Smooth steel body, fuse assembly, spoon and pull ring
    b.add('olive_paint', sphere(0.032, 0, 0, 0, b.seg(20), [1, 1.12, 1]));
    b.add('steel_dark', cylY(0.012, 0.022, 0, 0.041, 0, 12));
    b.add('steel', prof([[-0.01, 0.05], [0.012, 0.05], [0.016, 0.035], [0.02, -0.01], [0.016, -0.012], [0.011, 0.034], [0.006, 0.044], [-0.01, 0.044]], 0.012, 0.001, 0.0));
    b.part('pin', [-0.016, 0.046, 0]).add('steel_bright', tor(0.011, 0.0014, PI * 2, -0.022, 0.046, 0, { ry: PI / 2 }, [5, 16]));
    b.add('yellow_paint', cylY(0.0325, 0.004, 0, 0.018, 0, b.seg(20)));
  },
  smoke(b) {
    b.add('olive_paint', cylY(0.03, 0.11, 0, 0, 0, b.seg(20)));
    b.add('white', cylY(0.0305, 0.03, 0, -0.01, 0, b.seg(20)));
    b.add('steel_dark', cylY(0.012, 0.02, 0, 0.065, 0, 12));
    b.add('steel', box(0.012, 0.07, 0.006, 0.02, 0.03, 0.0, 0.001));
    b.part('pin', [-0.016, 0.07, 0]).add('steel_bright', tor(0.011, 0.0014, PI * 2, -0.022, 0.07, 0, { ry: PI / 2 }, [5, 16]));
    for (const y of [-0.05, 0.05]) b.add('steel_dark', cylY(0.031, 0.006, 0, y, 0, b.seg(20)));
  },
  flash(b) {
    // Perforated tube
    b.add('steel_dark', cylY(0.024, 0.12, 0, 0, 0, b.seg(18)));
    if (!b.lod) for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) { const a = (k / 6) * PI * 2 + r * 0.5; b.add('slot', box(0.002, 0.016, 0.008, Math.cos(a) * 0.0245, -0.03 + r * 0.03, Math.sin(a) * 0.0245, 0, { ry: -a })); }
    b.add('steel_dark', cylY(0.012, 0.02, 0, 0.07, 0, 12));
    b.add('steel', box(0.012, 0.08, 0.006, 0.016, 0.03, 0, 0.001));
    b.add('white', cylY(0.0245, 0.008, 0, 0.045, 0, b.seg(18)));
    b.part('pin', [-0.016, 0.075, 0]).add('steel_bright', tor(0.011, 0.0014, PI * 2, -0.022, 0.075, 0, { ry: PI / 2 }, [5, 16]));
  },
  stun(b) {
    b.add('poly_black', cylY(0.026, 0.1, 0, 0, 0, b.seg(18)));
    for (const y of [-0.03, 0.0, 0.03]) b.add('glow_amber', cylY(0.0265, 0.005, 0, y, 0, b.seg(18)));
    b.add('steel_dark', cylY(0.012, 0.02, 0, 0.06, 0, 12));
    b.part('pin', [-0.016, 0.065, 0]).add('steel_bright', tor(0.011, 0.0014, PI * 2, -0.022, 0.065, 0, { ry: PI / 2 }, [5, 16]));
  },
  incendiary(b) {
    b.add('steel_dark', cylY(0.029, 0.11, 0, 0, 0, b.seg(20)));
    b.add('red_paint', cylY(0.0295, 0.02, 0, 0.02, 0, b.seg(20)));
    b.add('steel_dark', cylY(0.012, 0.02, 0, 0.065, 0, 12));
    b.add('steel', box(0.012, 0.07, 0.006, 0.02, 0.03, 0.0, 0.001));
    b.part('pin', [-0.016, 0.07, 0]).add('steel_bright', tor(0.011, 0.0014, PI * 2, -0.022, 0.07, 0, { ry: PI / 2 }, [5, 16]));
  },
  emp(b) {
    // Disc with coil windings and a glowing core (fictional)
    b.add('anod_grey', lathe([[0.0, -0.022], [0.04, -0.02], [0.046, 0.0], [0.04, 0.02], [0.0, 0.024]], 0, 0, 0, b.seg(24)).rotateX(-PI / 2));
    for (let k = 0; k < 3; k++) b.add('copper', tor(0.03 - k * 0.006, 0.0025, PI * 2, 0, 0.0, 0, { rx: PI / 2 }, [5, 20]).translate(0, 0.022 + k * 0.002, 0));
    b.add('glow_cyan', cylY(0.009, 0.01, 0, 0.026, 0, 14));
    b.part('pin', [0.04, 0.02, 0]).add('steel_bright', tor(0.008, 0.0014, PI * 2, 0.048, 0.02, 0, { ry: PI / 2 }, [5, 14]));
  },
  sensor(b) {
    b.add('poly_od', cylY(0.028, 0.03, 0, 0, 0, b.seg(18)));
    b.add('poly_black', cylY(0.03, 0.006, 0, -0.016, 0, b.seg(18)));
    b.add('steel_dark', cylY(0.0018, 0.06, 0.012, 0.045, 0, 6));
    b.part('led', [0, 0.016, 0]).add('glow_red', sphere(0.005, -0.01, 0.017, 0, 8));
  },
  decoy(b) {
    b.add('poly_black', cylY(0.026, 0.1, 0, 0, 0, b.seg(18)));
    if (!b.lod) for (let k = 0; k < 8; k++) { const a = (k / 8) * PI * 2; b.add('slot', box(0.002, 0.05, 0.004, Math.cos(a) * 0.0265, 0, Math.sin(a) * 0.0265, 0, { ry: -a })); }
    b.add('steel_dark', cylY(0.012, 0.02, 0, 0.06, 0, 12));
    b.part('led', [0, 0.05, 0]).add('glow_green', sphere(0.004, 0.0, 0.052, 0.018, 8));
    b.part('pin', [-0.016, 0.065, 0]).add('steel_bright', tor(0.011, 0.0014, PI * 2, -0.022, 0.065, 0, { ry: PI / 2 }, [5, 16]));
  },
  pulse(b) {
    // Heavy pulse charge: capacitor block with four coils (fictional)
    b.add('anod_black', box(0.09, 0.05, 0.07, 0, 0, 0, 0.008));
    for (const [x, z] of [[-0.03, -0.022], [0.03, -0.022], [-0.03, 0.022], [0.03, 0.022]]) {
      b.add('copper', cylY(0.011, 0.03, x, 0.035, z, 12));
      b.add('glow_cyan', cylY(0.004, 0.032, x, 0.036, z, 8));
    }
    b.add('screen', box(0.04, 0.002, 0.02, 0, 0.026, 0.0));
    b.add('steel_dark', box(0.1, 0.008, 0.012, 0, 0.0, 0.0, 0.002));
    b.part('pin', [0.05, 0.02, 0]).add('steel_bright', tor(0.009, 0.0016, PI * 2, 0.058, 0.02, 0, { ry: PI / 2 }, [5, 14]));
  },
  rocket(b) {
    b.add('olive_paint', lathe([[0.0, 0.0], [0.04, -0.03], [0.04, -0.25], [0.03, -0.3], [0.012, -0.34], [0.0, -0.35]], 0, 0, 0.18, b.seg(18)));
    for (let k = 0; k < 4; k++) b.add('steel_dark', box(0.002, 0.03, 0.05, 0, 0, 0.16, 0, { rz: (k * PI) / 2 }).translate(0, 0, 0));
  },
};

// ------------------------------------------------------------------ held equipment (origin = grip centre)
const HELD = {
  rangefinder(b) {
    b.add('olive_paint', box(0.06, 0.05, 0.13, 0, 0, 0, 0.01));
    b.add('rubber', box(0.062, 0.052, 0.02, 0, 0, 0.06, 0.008));
    b.add('lens', cyl(0.016, 0.004, -0.012, 0.004, -0.066, { seg: 16 }), cyl(0.009, 0.004, 0.016, 0.004, -0.066, { seg: 12 }));
    b.add('glow_red', cyl(0.004, 0.002, 0.016, 0.004, -0.069, { seg: 8 }));
    b.add('rubber', cyl(0.012, 0.03, 0.0, 0.012, 0.08, { seg: 14 }));
    b.add('steel_dark', box(0.014, 0.006, 0.014, 0.0, 0.028, -0.02, 0.002));
    b.point('screen', 0, 0.012, 0.095);
  },
  detector(b) {
    b.add('poly_black', box(0.09, 0.025, 0.14, 0, 0, 0, 0.008));
    b.add('rubber', box(0.094, 0.028, 0.03, 0, 0, 0.06, 0.008));
    b.add('steel_dark', cylY(0.004, 0.08, 0.035, 0.045, -0.06, 8));
    b.add('olive_paint', box(0.03, 0.02, 0.06, 0, -0.022, 0.03, 0.006));
    b.point('screen', 0, 0.0128, -0.005);
  },
  shield(b) {
    // Ballistic shield with a viewport and handle (held in the left hand)
    b.add('olive_paint', box(0.5, 0.75, 0.025, 0, 0.0, 0, 0.03));
    b.add('fabric_black', box(0.51, 0.76, 0.012, 0, 0.0, -0.012, 0.03));
    b.add('lens_amber', box(0.24, 0.07, 0.03, 0, 0.24, 0, 0.004));
    b.add('steel_dark', box(0.26, 0.09, 0.028, 0, 0.24, 0.002, 0.004));
    b.add('white', box(0.3, 0.06, 0.002, 0, -0.1, -0.019));
    b.add('steel_dark', box(0.03, 0.12, 0.05, 0.0, 0.0, 0.04, 0.008));
  },
};

function bakeEquip(id, lod) {
  const key = `${id}|${lod}`;
  if (specs.has(key)) return specs.get(key);
  const fn = GRENADE[id] || HELD[id];
  if (!fn) return null;
  const b = new Build({ lod });
  fn(b);
  const spec = b.bake();
  specs.set(key, spec);
  return spec;
}

export function buildGrenadeModel(type, lod = 0) {
  const spec = bakeEquip(type, lod);
  if (!spec) return null;
  const g = instantiate(spec);
  g.name = `grenade-${type}`;
  return g;
}

// Labels for held-screen devices (detector / rangefinder) use a canvas texture updated by the owner.
function screenMesh(w, h) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = Math.round((256 * h) / w);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  m.rotation.x = -PI / 2;
  m.userData.canvas = c;
  m.userData.texture = t;
  return m;
}

function scanned(name, fit) {
  if (!ASSETS || !ASSETS.hasModel(name)) return null;
  const m = ASSETS.model(name);
  const holder = new THREE.Group();
  holder.add(m);
  const box3 = new THREE.Box3().setFromObject(m);
  const size = box3.getSize(new THREE.Vector3());
  const s = fit / Math.max(size.x, size.y, size.z);
  m.scale.setScalar(s);
  const c = box3.getCenter(new THREE.Vector3()).multiplyScalar(s);
  m.position.sub(c);
  m.traverse((o) => { if (o.isMesh) { o.userData.shared = true; o.castShadow = false; } });
  holder.userData.source = `glTF:${name}`;
  return holder;
}

/** Held equipment model (first person). Returns a Group with userData.screen for devices. */
export function buildEquipmentModel(id) {
  let g = null;
  if (id === 'binoculars') g = scanned('binoculars', 0.22);
  else if (id === 'medkit') g = scanned('medical_box', 0.34);
  else if (id === 'ammopack') g = scanned('ammo_box', 0.26);
  else if (id === 'flashlight') g = scanned('flashlight', 0.2);
  if (g) {
    if (id === 'binoculars') g.rotation.y = PI;
    return g;
  }
  let spec = bakeEquip(id, 0);
  if (!spec) {
    // Documented fallback for a missing scan: simple labelled box.
    if (ASSETS) ASSETS._fallback(`equipment:${id}`, 'CC0 scan unavailable, using a simple procedural stand-in');
    const b = new Build({});
    b.add('olive_paint', box(0.14, 0.08, 0.1, 0, 0, 0, 0.01));
    spec = b.bake();
  }
  g = instantiate(spec);
  if (id === 'detector' || id === 'rangefinder') {
    const scr = id === 'detector' ? screenMesh(0.072, 0.09) : screenMesh(0.04, 0.026);
    scr.position.copy(g.userData.points.screen);
    if (id === 'rangefinder') { scr.rotation.set(0, 0, 0); scr.position.z += 0.001; }
    g.add(scr);
    g.userData.screen = scr;
  }
  g.userData.source = 'forge';
  return g;
}
