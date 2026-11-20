// Visual weapon attachments (original procedural models) and the logic that mounts them on a forge
// weapon: optics sit on the 'optic' rail anchor (iron sights fold away), suppressors extend the muzzle,
// lights/lasers clamp to side rails, foregrips move the support hand, extended magazines lengthen
// the magazine part, and the tactical stock replaces the stock part.
import * as THREE from 'three';
import { Build, instantiate, box, cyl, cylX, cylY, lathe, prof, tor, sphere, tube } from './parts.js';
import { material } from './materials.js';

const PI = Math.PI;

function reticleMaterial(color, kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = g.fillStyle = color;
  g.lineWidth = 5;
  if (kind === 'holo') {
    g.beginPath(); g.arc(64, 64, 46, 0, PI * 2); g.stroke();
    g.beginPath(); g.arc(64, 64, 5, 0, PI * 2); g.fill();
    for (const [x, y] of [[64, 6], [64, 122], [6, 64], [122, 64]]) { g.beginPath(); g.arc(x, y, 3, 0, PI * 2); g.fill(); }
  } else if (kind === 'chevron') {
    g.beginPath(); g.moveTo(40, 80); g.lineTo(64, 52); g.lineTo(88, 80); g.stroke();
    g.fillRect(62, 84, 4, 30);
  } else if (kind === 'cross') {
    g.lineWidth = 3; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
    for (let k = -4; k <= 4; k++) if (k) { g.beginPath(); g.arc(64 + k * 12, 64, 2.5, 0, PI * 2); g.arc(64, 64 + k * 12, 2.5, 0, PI * 2); g.fill(); }
  } else {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 18);
    grd.addColorStop(0, color); grd.addColorStop(0.35, color); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
}

const attSpecs = new Map();
const reticleMats = new Map();

// Builds an attachment group in its own local space (origin = the rail/mount point).
// Returns { group, sightY (height of the sight line above the mount), lensZ, length }.
// Geometry is baked once per (id, lod, small) and shared by every instance.
export function buildAttachment(id, { lod = 0, small = false } = {}) {
  const key = `${id}|${lod}|${small}`;
  if (!attSpecs.has(key)) attSpecs.set(key, bakeAttachment(id, { lod, small }));
  const s = attSpecs.get(key);
  if (!s) return null;
  const out = { ...s.out };
  const group = instantiate(s.spec);
  group.name = `att-${id}`;
  if (out.reticle && !lod) {
    const colors = { dot: '#ff3020', holo: '#ff3020', chevron: '#ff4a20', cross: '#101010' };
    const size = { dot: 0.01, holo: 0.022, chevron: 0.016, cross: 0.03 }[out.reticle];
    if (!reticleMats.has(out.reticle)) reticleMats.set(out.reticle, reticleMaterial(colors[out.reticle], out.reticle));
    const ret = new THREE.Mesh(new THREE.PlaneGeometry(size, size), reticleMats.get(out.reticle));
    ret.position.set(0, out.sightY, out.lensZ + 0.004);
    // PlaneGeometry faces +Z, i.e. toward the shooter
    ret.renderOrder = 5;
    ret.name = 'reticle';
    ret.visible = out.reticle !== 'cross'; // the 8x reticle is drawn by the scope overlay
    group.add(ret);
  }
  out.group = group;
  return out;
}

function bakeAttachment(id, { lod = 0, small = false } = {}) {
  const b = new Build({ finish: 'black', lod });
  const out = { sightY: 0, lensZ: 0, length: 0 };
  switch (id) {
    case 'reddot': {
      if (small) {
        // Slide-mounted mini reflex sight
        b.add('anod_black', prof([[0.016, 0], [-0.016, 0], [-0.016, 0.006], [-0.012, 0.022], [0.012, 0.022], [0.016, 0.01]], 0.026, 0.002));
        b.add('lens_clear', box(0.02, 0.014, 0.0015, 0, 0.014, -0.008));
        out.sightY = 0.014; out.lensZ = -0.008;
      } else {
        b.add('anod_black', box(0.026, 0.012, 0.05, 0, 0.006, 0, 0.003)); // base/clamp
        b.add('anod_black', tube(0.017, 0.0145, 0.042, 0, 0.034, -0.004, b.seg(20))); // hollow: the dot is seen through it
        b.add('anod_black', cylX(0.007, 0.012, 0.02, 0.034, 0.002), cylY(0.0065, 0.01, 0, 0.055, 0.002));
        b.add('lens_clear', cyl(0.0145, 0.002, 0, 0.034, -0.024, { seg: b.seg(20) }));
        out.sightY = 0.034; out.lensZ = -0.022;
      }
      out.reticle = 'dot';
      break;
    }
    case 'holo': {
      b.add('anod_black', box(0.03, 0.014, 0.085, 0, 0.007, 0, 0.003)); // base + battery
      b.add('anod_black', box(0.034, 0.016, 0.03, 0, 0.022, 0.026, 0.004)); // rear electronics
      for (const s of [-1, 1]) b.add('anod_black', box(0.004, 0.04, 0.05, s * 0.017, 0.034, -0.012, 0.0015)); // hood sides
      b.add('anod_black', box(0.038, 0.004, 0.05, 0, 0.056, -0.012, 0.0015)); // hood top
      b.add('lens_clear', box(0.03, 0.028, 0.002, 0, 0.034, -0.03));
      b.add('knurl', cylX(0.005, 0.008, 0.02, 0.022, 0.03));
      out.sightY = 0.034; out.lensZ = -0.02; out.reticle = 'holo';
      break;
    }
    case 'x2': {
      b.add('anod_black', box(0.026, 0.012, 0.06, 0, 0.006, 0, 0.003));
      b.add('anod_black', tube(0.016, 0.0135, 0.11, 0, 0.04, -0.005, b.seg(20))); // hollow body: look through it at ADS
      b.add('anod_black', lathe([[0.016, 0.05], [0.019, 0.06], [0.019, 0.075]], 0, 0.04, 0, b.seg(20)));
      b.add('anod_black', lathe([[0.016, -0.055], [0.02, -0.065], [0.02, -0.07]], 0, 0.04, 0, b.seg(20)));
      b.add('knurl', cylY(0.007, 0.01, 0, 0.06, -0.005, 12));
      b.add('lens_clear', cyl(0.017, 0.002, 0, 0.04, -0.07, { seg: b.seg(20) }), cyl(0.016, 0.002, 0, 0.04, 0.075, { seg: b.seg(20) }));
      out.sightY = 0.04; out.lensZ = -0.07; out.reticle = 'dot';
      break;
    }
    case 'x4': {
      // Prism scope with a ribbed body and integrated mount
      b.add('anod_black', box(0.026, 0.014, 0.06, 0, 0.007, 0, 0.003));
      b.add('anod_black', prof([[0.05, 0.014], [-0.06, 0.014], [-0.07, 0.03], [-0.06, 0.058], [0.04, 0.058], [0.055, 0.04]], 0.03, 0.004));
      b.add('anod_black', cyl(0.02, 0.03, 0, 0.038, -0.075, { seg: b.seg(20) }), cyl(0.016, 0.02, 0, 0.038, 0.06, { seg: b.seg(20) }));
      if (!b.lod) for (let k = 0; k < 4; k++) b.add('anod_black', box(0.032, 0.003, 0.004, 0, 0.058, 0.02 - k * 0.018));
      b.add('glow_red', box(0.004, 0.004, 0.012, 0, 0.061, -0.03)); // fibre optic
      b.add('lens', cyl(0.018, 0.002, 0, 0.038, -0.091, { seg: b.seg(20) }), cyl(0.014, 0.002, 0, 0.038, 0.071, { seg: b.seg(20) }));
      out.sightY = 0.038; out.lensZ = -0.09; out.reticle = 'chevron';
      break;
    }
    case 'x8': {
      // Long precision scope in two rings, elevation/windage turrets, objective bell
      for (const z of [-0.04, 0.04]) b.add('anod_black', box(0.024, 0.044, 0.018, 0, 0.022, z, 0.003), tor(0.018, 0.003, PI * 2, 0, 0.046, z, {}, [6, 18]));
      b.add('anod_black', cyl(0.0165, 0.2, 0, 0.046, 0.0, { seg: b.seg(20) }));
      b.add('anod_black', lathe([[0.0165, -0.1], [0.028, -0.15], [0.028, -0.19]], 0, 0.046, 0, b.seg(24)));
      b.add('anod_black', lathe([[0.0165, 0.1], [0.021, 0.12], [0.021, 0.16]], 0, 0.046, 0, b.seg(20)));
      b.add('anod_black', box(0.03, 0.03, 0.04, 0, 0.046, -0.005, 0.006));
      b.add('knurl', cylY(0.011, 0.016, 0, 0.068, -0.005, 16), cylX(0.011, 0.016, 0.024, 0.046, -0.005, 16), cylX(0.009, 0.012, -0.022, 0.046, -0.005, 12));
      b.add('lens', cyl(0.026, 0.002, 0, 0.046, -0.191, { seg: b.seg(24) }), cyl(0.019, 0.002, 0, 0.046, 0.161, { seg: b.seg(20) }));
      out.sightY = 0.046; out.lensZ = -0.19; out.reticle = 'cross';
      break;
    }
    case 'suppressor': {
      const r = small ? 0.016 : 0.02, L = small ? 0.13 : 0.17;
      b.add('anod_black', cyl(r, L, 0, 0, -L / 2, { seg: b.seg(24) }));
      b.add('knurl', cyl(r + 0.0012, 0.02, 0, 0, -0.01, { seg: b.seg(24) }));
      b.add('steel_dark', lathe([[r, -L], [r * 0.8, -L - 0.006], [r * 0.35, -L - 0.006]], 0, 0, 0, b.seg(24)));
      b.add('slot', cyl(r * 0.33, 0.002, 0, 0, -L - 0.006, { seg: 12 }));
      out.length = L + 0.006;
      break;
    }
    case 'flashlight': {
      b.add('anod_black', box(0.014, 0.018, 0.026, 0, 0, 0, 0.003)); // rail clamp
      b.add('anod_black', cyl(0.0105, 0.1, 0, 0, -0.035, { seg: b.seg(16) }));
      b.add('anod_black', lathe([[0.0105, -0.085], [0.0135, -0.095], [0.0135, -0.11]], 0, 0, 0, b.seg(16)));
      b.add('knurl', cyl(0.0108, 0.03, 0, 0, 0.0, { seg: b.seg(16) }));
      const lens = b.part('lens', [0, 0, -0.111]);
      lens.add('lens', cyl(0.0122, 0.002, 0, 0, -0.111, { seg: b.seg(16) }));
      out.lensZ = -0.112;
      break;
    }
    case 'laser': {
      b.add('anod_black', box(0.014, 0.018, 0.03, 0, 0, 0, 0.003));
      b.add('poly_od', box(0.03, 0.026, 0.062, 0, 0.0, -0.02, 0.005));
      b.add('lens', cyl(0.004, 0.002, -0.006, 0.004, -0.0515, { seg: 10 }), cyl(0.004, 0.002, 0.006, 0.004, -0.0515, { seg: 10 }));
      b.add('glow_red', cyl(0.0022, 0.002, 0.006, -0.006, -0.052, { seg: 8 }));
      if (!b.lod) b.add('knurl', cylY(0.004, 0.006, 0.008, 0.016, 0.0, 10));
      out.lensZ = -0.052;
      break;
    }
    case 'foregrip': {
      b.add('anod_black', box(0.02, 0.012, 0.035, 0, -0.006, 0, 0.003));
      b.add('poly_black', cylY(0.014, 0.085, 0, -0.05, 0.0, b.seg(14)));
      if (!b.lod) for (let k = 0; k < 4; k++) b.add('rubber', tor(0.0142, 0.0016, PI * 2, 0, -0.03 - k * 0.016, 0, { rx: PI / 2 }, [4, 14]));
      b.add('poly_black', sphere(0.014, 0, -0.092, 0, 10));
      out.gripY = -0.06;
      break;
    }
    case 'tstock': {
      // Adjustable precision stock: tube, cheek riser with adjustment knob, butt with spacers
      b.add('steel_dark', cyl(0.0145, 0.22, 0, -0.004, 0.11, { seg: b.seg(16) }));
      b.add('poly_black', prof([[0.06, 0.042], [0.29, 0.048], [0.3, -0.1], [0.27, -0.105], [0.19, -0.04], [0.06, -0.025]], 0.046, 0.007));
      b.add('slot', box(0.048, 0.03, 0.08, 0, -0.04, 0.2, 0.01));
      b.add('poly_black', box(0.03, 0.022, 0.12, 0, 0.058, 0.2, 0.006));
      b.add('knurl', cylX(0.009, 0.05, 0, 0.03, 0.15));
      b.add('rubber', box(0.048, 0.155, 0.016, 0, -0.026, 0.305, 0.005));
      break;
    }
    default:
      return null;
  }
  return { spec: b.bake(), out };
}

// Extended magazine: stretch the magazine part downward (keeps it a separate animated part).
function extendMagazine(weapon) {
  const mag = weapon.userData.parts.mag;
  if (!mag) return false;
  mag.scale.set(1, 1.42, 1.08);
  mag.userData.extended = true;
  return true;
}

/**
 * Mounts attachments on a forge weapon (in place). map: { slot: attachmentId }.
 * Updates weapon.userData: sightY (ADS sight line), opticLensZ, muzzle (moved for suppressors),
 * lightAnchor / laserAnchor (world beam origins), points.support (foregrip), attachmentGroups.
 */
export function mountAttachments(weapon, map = {}, { lod = 0 } = {}) {
  const ud = weapon.userData;
  const anchors = ud.anchors || {};
  const groups = {};
  ud.sightY = ud.meta && ud.meta.ironY !== undefined ? ud.meta.ironY : 0.06;
  ud.sightX = (ud.meta && ud.meta.sightX) || 0;
  const pistolLike = !!(ud.meta && ud.meta.pistol);
  for (const [slot, id] of Object.entries(map)) {
    if (!id) continue;
    if (slot === 'mag') { if (extendMagazine(weapon)) groups.mag = ud.parts.mag; continue; }
    const anchorName = { optic: 'optic', muzzle: 'muzzle', under: 'under', light: 'light', laser: 'laser', stock: 'stock' }[slot];
    const anchor = anchors[anchorName];
    const a = buildAttachment(id, { lod, small: pistolLike });
    if (!a) continue;
    if (!anchor) {
      // No mount point: tactical stock on a stockless bullpup becomes a cheek riser pad.
      if (slot === 'stock') {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.018, 0.12), material('rubber'));
        pad.position.set(0, 0.04, 0.24);
        weapon.add(pad);
        groups.stock = pad;
      }
      continue;
    }
    const g = a.group;
    if (slot === 'optic') {
      const holder = ud.parts.cover && ud.mounts.optic && ud.mounts.optic.onCover ? ud.parts.cover : weapon;
      g.position.copy(anchor.position);
      if (holder !== weapon) g.position.sub(holder.position);
      holder.add(g);
      if (ud.parts.irons) ud.parts.irons.visible = false;
      ud.sightY = anchor.position.y + a.sightY;
      ud.opticLensZ = anchor.position.z + a.lensZ;
      ud.reticle = g.getObjectByName('reticle');
    } else if (slot === 'muzzle') {
      // The can threads over the muzzle device (rifles) / barrel (pistols).
      g.position.copy(anchor.position);
      g.position.z += pistolLike ? 0.0 : 0.045;
      weapon.add(g);
      if (ud.muzzle) ud.muzzle.position.z = g.position.z - a.length;
    } else if (slot === 'light' || slot === 'laser') {
      const side = (ud.mounts[slot] && ud.mounts[slot].side) ?? (slot === 'light' ? -1 : 1);
      g.position.copy(anchor.position);
      if (side === 0) g.position.y -= 0.01; // pistols: under the dust cover
      else { g.rotation.z = side > 0 ? -PI / 2 : PI / 2; g.position.x += side * 0.006; } // clamp onto the side rail
      weapon.add(g);
      const beam = new THREE.Object3D();
      beam.position.set(0, 0, a.lensZ);
      g.add(beam);
      if (slot === 'light') { ud.lightAnchor = beam; ud.lightLens = g.userData.parts.lens; } else ud.laserAnchor = beam;
    } else if (slot === 'under') {
      g.position.copy(anchor.position);
      weapon.add(g);
      ud.points.support = new THREE.Vector3(anchor.position.x, anchor.position.y + a.gripY, anchor.position.z);
      ud.foregrip = true;
    } else if (slot === 'stock') {
      if (ud.parts.stock) ud.parts.stock.visible = false;
      g.position.copy(anchor.position);
      weapon.add(g);
    }
    groups[slot] = g;
  }
  ud.attachmentGroups = groups;
  ud.attachmentMap = { ...map };
  return weapon;
}
