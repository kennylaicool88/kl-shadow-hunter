// Procedurally generated retro textures (canvas-drawn at startup, no external image assets).
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function noise(ctx, size, rand, amount, alpha = 0.12) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  // Blotches
  for (let i = 0; i < 60; i++) {
    const x = rand() * size, y = rand() * size, r = 3 + rand() * size * 0.08;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tone = rand() > 0.5 ? '0,0,0' : '255,255,255';
    grd.addColorStop(0, `rgba(${tone},${rand() * alpha * 0.3})`);
    grd.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = grd;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function toTexture(c, anisotropy) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.magFilter = THREE.LinearFilter;
  return t;
}

function concrete(size, rand, base = '#8d8a82') {
  const [c, g] = canvas(size);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  noise(g, size, rand, 28, 0.25);
  // Panel seams
  g.strokeStyle = 'rgba(40,38,34,0.55)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, size - 2, size - 2);
  g.beginPath();
  g.moveTo(0, size / 2); g.lineTo(size, size / 2);
  g.stroke();
  // Form-tie holes
  g.fillStyle = 'rgba(30,30,30,0.5)';
  for (const [x, y] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
    g.beginPath(); g.arc(x * size, y * size, size * 0.012, 0, Math.PI * 2); g.fill();
  }
  // Cracks
  g.strokeStyle = 'rgba(50,45,40,0.45)';
  g.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    let x = rand() * size, y = rand() * size;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 6; j++) { x += (rand() - 0.5) * 30; y += rand() * 20; g.lineTo(x, y); }
    g.stroke();
  }
  // Grime at bottom
  const grd = g.createLinearGradient(0, size * 0.6, 0, size);
  grd.addColorStop(0, 'rgba(60,50,35,0)');
  grd.addColorStop(1, 'rgba(60,50,35,0.25)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

function brick(size, rand) {
  const [c, g] = canvas(size);
  g.fillStyle = '#5b544c';
  g.fillRect(0, 0, size, size);
  const rows = 8, cols = 4;
  const bh = size / rows, bw = size / cols;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * bw * 0.5;
    for (let k = -1; k < cols + 1; k++) {
      const shade = 0.75 + rand() * 0.3;
      g.fillStyle = `rgb(${Math.floor(140 * shade)},${Math.floor(78 * shade)},${Math.floor(58 * shade)})`;
      g.fillRect(k * bw + off + 2, r * bh + 2, bw - 4, bh - 4);
    }
  }
  noise(g, size, rand, 30, 0.2);
  return c;
}

function metal(size, rand) {
  const [c, g] = canvas(size);
  g.fillStyle = '#6d7a80';
  g.fillRect(0, 0, size, size);
  // Corrugation
  const n = 16;
  for (let i = 0; i < n; i++) {
    const x = (i / n) * size;
    const grd = g.createLinearGradient(x, 0, x + size / n, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0.12)');
    grd.addColorStop(0.5, 'rgba(0,0,0,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0.12)');
    g.fillStyle = grd;
    g.fillRect(x, 0, size / n, size);
  }
  noise(g, size, rand, 20, 0.15);
  // Rust streaks
  for (let i = 0; i < 10; i++) {
    const x = rand() * size;
    const grd = g.createLinearGradient(0, 0, 0, size);
    grd.addColorStop(0, 'rgba(120,60,20,0.35)');
    grd.addColorStop(1, 'rgba(120,60,20,0)');
    g.fillStyle = grd;
    g.fillRect(x, rand() * size * 0.3, 2 + rand() * 5, size * (0.3 + rand() * 0.5));
  }
  // Horizontal rivet bands
  g.fillStyle = 'rgba(30,30,30,0.6)';
  for (const y of [0.04, 0.96]) {
    for (let i = 0; i < 16; i++) {
      g.beginPath(); g.arc((i + 0.5) * size / 16, y * size, 2, 0, Math.PI * 2); g.fill();
    }
  }
  return c;
}

function crate(size, rand) {
  const [c, g] = canvas(size);
  g.fillStyle = '#9a7445';
  g.fillRect(0, 0, size, size);
  // Planks
  const planks = 5;
  for (let i = 0; i < planks; i++) {
    const shade = 0.85 + rand() * 0.25;
    g.fillStyle = `rgb(${Math.floor(160 * shade)},${Math.floor(118 * shade)},${Math.floor(68 * shade)})`;
    g.fillRect(0, (i * size) / planks + 1, size, size / planks - 2);
    // Grain
    g.strokeStyle = 'rgba(80,50,20,0.35)';
    for (let k = 0; k < 6; k++) {
      const y = (i * size) / planks + rand() * (size / planks);
      g.beginPath(); g.moveTo(0, y);
      g.bezierCurveTo(size * 0.3, y + rand() * 4 - 2, size * 0.6, y + rand() * 4 - 2, size, y);
      g.stroke();
    }
  }
  // Frame
  const f = size * 0.09;
  g.fillStyle = '#6b4c27';
  g.fillRect(0, 0, size, f); g.fillRect(0, size - f, size, f);
  g.fillRect(0, 0, f, size); g.fillRect(size - f, 0, f, size);
  // Diagonal brace
  g.save();
  g.translate(size / 2, size / 2);
  g.rotate(Math.PI / 4);
  g.fillRect(-size * 0.7, -f / 2, size * 1.4, f);
  g.restore();
  // Stencil mark
  g.fillStyle = 'rgba(30,20,10,0.55)';
  g.font = `bold ${Math.floor(size * 0.09)}px monospace`;
  g.fillText('DS-04', size * 0.62, size * 0.22);
  noise(g, size, rand, 18, 0.15);
  return c;
}

function ground(size, rand) {
  const [c, g] = canvas(size);
  g.fillStyle = '#857a66';
  g.fillRect(0, 0, size, size);
  noise(g, size, rand, 40, 0.3);
  for (let i = 0; i < 400; i++) {
    const s = rand() * 2.5;
    g.fillStyle = `rgba(${rand() > 0.5 ? '60,55,45' : '170,160,140'},0.5)`;
    g.fillRect(rand() * size, rand() * size, s, s);
  }
  // Faint tile seams
  g.strokeStyle = 'rgba(50,45,35,0.1)';
  g.lineWidth = 1;
  g.strokeRect(0, 0, size, size);
  return c;
}

function stairs(size, rand) {
  const c = concrete(size, rand, '#7e7b74');
  const g = c.getContext('2d');
  // Yellow hazard edge along the top
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? '#c9a227' : '#2b2b2b';
    g.beginPath();
    const x = (i * size) / 12;
    g.moveTo(x, 0); g.lineTo(x + size / 12, 0); g.lineTo(x + size / 24, size * 0.06); g.lineTo(x - size / 24, size * 0.06);
    g.fill();
  }
  return c;
}

function roof(size, rand) {
  const [c, g] = canvas(size);
  g.fillStyle = '#4a4f52';
  g.fillRect(0, 0, size, size);
  noise(g, size, rand, 20, 0.2);
  g.strokeStyle = 'rgba(20,20,20,0.6)';
  for (let i = 0; i <= 8; i++) {
    g.beginPath(); g.moveTo((i * size) / 8, 0); g.lineTo((i * size) / 8, size); g.stroke();
  }
  return c;
}

function barrel(size, rand) {
  const [c, g] = canvas(size);
  g.fillStyle = '#3f5a3a';
  g.fillRect(0, 0, size, size);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  for (const y of [0.18, 0.5, 0.82]) g.fillRect(0, y * size - 3, size, 6);
  g.fillStyle = '#c9a227';
  g.fillRect(0, size * 0.36, size, size * 0.06);
  noise(g, size, rand, 20, 0.2);
  return c;
}

export function createTextures(anisotropy = 4) {
  const rand = rng(1337);
  const size = 256;
  return {
    concrete: toTexture(concrete(size, rand), anisotropy),
    brick: toTexture(brick(size, rand), anisotropy),
    metal: toTexture(metal(size, rand), anisotropy),
    crate: toTexture(crate(size, rand), anisotropy),
    ground: toTexture(ground(size, rand), anisotropy),
    stairs: toTexture(stairs(size, rand), anisotropy),
    roof: toTexture(roof(size, rand), anisotropy),
    barrel: toTexture(barrel(size, rand), anisotropy),
  };
}

// Small radial sprite used for muzzle flashes / sparks.
export function createFlashTexture() {
  const [c, g] = canvas(64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,230,1)');
  grd.addColorStop(0.25, 'rgba(255,210,120,0.9)');
  grd.addColorStop(0.6, 'rgba(255,140,40,0.35)');
  grd.addColorStop(1, 'rgba(255,100,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  // Star spikes
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(255,230,160,0.8)';
  g.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Soft round white sprite for dust/blood particles (tinted by vertex colors).
export function createSoftParticleTexture() {
  const [c, g] = canvas(32);
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Bullet-hole decal.
export function createDecalTexture() {
  const [c, g] = canvas(32);
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(0.3, 'rgba(15,12,10,0.95)');
  grd.addColorStop(0.55, 'rgba(40,35,30,0.5)');
  grd.addColorStop(1, 'rgba(40,35,30,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
