// Procedural city textures (canvas-generated; no external image assets).
// Facades come in pairs: a colour map and a night "lit windows" emissive map.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, aniso = 4, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

function grain(g, w, h, rand, amt) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// Grid of windows: cols x rows per texture tile. Returns [colour canvas, emissive canvas].
function windowFacade(rand, { base, frame, glass, glassAlt, cols, rows, wFrac, hFrac, litChance, litColor, bands }) {
  const S = 256;
  const [c, g] = canvas(S);
  const [e, ge] = canvas(S);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, S, S);
  const cw = S / cols, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    if (bands) {
      g.fillStyle = frame;
      g.fillRect(0, r * rh, S, rh * (1 - hFrac) * 0.5);
    }
    for (let k = 0; k < cols; k++) {
      const x = k * cw + (cw * (1 - wFrac)) / 2;
      const y = r * rh + (rh * (1 - hFrac)) / 2;
      const grd = g.createLinearGradient(x, y, x + cw * wFrac, y + rh * hFrac);
      const alt = rand() < 0.25;
      grd.addColorStop(0, alt ? glassAlt : glass);
      grd.addColorStop(1, '#0c1620');
      g.fillStyle = grd;
      g.fillRect(x, y, cw * wFrac, rh * hFrac);
      if (rand() < litChance) {
        const warm = rand() < 0.75;
        ge.fillStyle = warm ? litColor : '#cfe6ff';
        ge.globalAlpha = 0.55 + rand() * 0.45;
        ge.fillRect(x, y, cw * wFrac, rh * hFrac);
        ge.globalAlpha = 1;
      }
    }
  }
  // Mullions
  g.strokeStyle = frame;
  g.lineWidth = 2;
  for (let k = 0; k <= cols; k++) {
    g.beginPath(); g.moveTo(k * cw, 0); g.lineTo(k * cw, S); g.stroke();
  }
  grain(g, S, S, rand, 14);
  return [c, e];
}

export function createCityTextures(aniso = 4) {
  const rand = rng(4242);
  const out = {};
  const pair = (name, opts) => {
    const [c, e] = windowFacade(rand, opts);
    out[name] = tex(c, aniso);
    out[`${name}_night`] = tex(e, aniso);
  };
  pair('glass', { base: '#4f6a78', frame: '#9fb3bd', glass: '#2f5670', glassAlt: '#3d6d86', cols: 4, rows: 4, wFrac: 0.9, hFrac: 0.78, litChance: 0.45, litColor: '#ffd99a', bands: true });
  pair('office', { base: '#b9b3a6', frame: '#8d877b', glass: '#36495a', glassAlt: '#4a5d6c', cols: 4, rows: 4, wFrac: 0.62, hFrac: 0.55, litChance: 0.5, litColor: '#ffe2a8', bands: false });

  // Shophouse: colourful two-storey facades with shutters and a five-foot-way arcade.
  {
    const S = 256;
    const [c, g] = canvas(S);
    const [e, ge] = canvas(S);
    ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
    const colors = ['#d9a441', '#6fa8a0', '#c9705a', '#e8d9b5', '#8fb26b'];
    for (let k = 0; k < 2; k++) {
      g.fillStyle = colors[Math.floor(rand() * colors.length)];
      g.fillRect(k * 128, 0, 128, S);
      // Upper windows with shutters
      for (let w = 0; w < 3; w++) {
        const x = k * 128 + 14 + w * 38;
        g.fillStyle = '#3b2f25'; g.fillRect(x, 40, 26, 54);
        g.fillStyle = '#2f6b55'; g.fillRect(x, 40, 9, 54); g.fillRect(x + 17, 40, 9, 54);
        if (rand() < 0.5) { ge.fillStyle = '#ffcf7a'; ge.fillRect(x + 9, 42, 8, 50); }
      }
      // Arcade with shop sign
      g.fillStyle = '#5b4a3a'; g.fillRect(k * 128, 150, 128, 106);
      g.fillStyle = '#1f1b17'; g.fillRect(k * 128 + 10, 170, 108, 86);
      g.fillStyle = '#a3241f'; g.fillRect(k * 128 + 8, 122, 112, 22);
      g.fillStyle = '#f3e2b0'; g.font = 'bold 15px Arial'; g.textAlign = 'center';
      g.fillText(['KEDAI MAKAN', 'RESTORAN', 'FARMASI', 'KEDAI RUNCIT', 'KOPITIAM'][Math.floor(rand() * 5)], k * 128 + 64, 139);
      ge.fillStyle = '#ffb860'; ge.fillRect(k * 128 + 10, 170, 108, 86);
      ge.fillStyle = '#ff6a4a'; ge.fillRect(k * 128 + 8, 122, 112, 22);
    }
    grain(g, S, S, rand, 16);
    out.shophouse = tex(c, aniso);
    out.shophouse_night = tex(e, aniso);
  }

  const simple = (name, size, draw) => {
    const [c, g] = canvas(size);
    draw(g, size);
    out[name] = tex(c, aniso);
  };
  simple('asphalt', 256, (g, S) => {
    g.fillStyle = '#3c3e40'; g.fillRect(0, 0, S, S);
    grain(g, S, S, rand, 26);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${rand() > 0.5 ? '20,20,20' : '120,120,120'},0.4)`; g.fillRect(rand() * S, rand() * S, 2, 2); }
  });
  simple('paving', 128, (g, S) => {
    g.fillStyle = '#9d948a'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const s = 0.85 + rand() * 0.2;
      g.fillStyle = `rgb(${Math.floor(170 * s)},${Math.floor(156 * s)},${Math.floor(140 * s)})`;
      g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
    }
    grain(g, S, S, rand, 12);
  });
  simple('grass', 256, (g, S) => {
    g.fillStyle = '#4f7a3a'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(${40 + rand() * 60},${90 + rand() * 70},${30 + rand() * 30},0.6)`;
      g.fillRect(rand() * S, rand() * S, 1.5, 3);
    }
  });
  simple('dirt', 256, (g, S) => {
    g.fillStyle = '#8a6e4e'; g.fillRect(0, 0, S, S);
    grain(g, S, S, rand, 40);
    for (let i = 0; i < 200; i++) { g.fillStyle = 'rgba(60,45,30,0.4)'; g.fillRect(rand() * S, rand() * S, 3, 3); }
  });
  simple('stone', 256, (g, S) => {
    g.fillStyle = '#d6d0c4'; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(120,110,100,0.5)';
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(S, i * 64); g.stroke(); g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, S); g.stroke(); }
    grain(g, S, S, rand, 10);
  });
  simple('tile', 128, (g, S) => {
    g.fillStyle = '#bfcfc4'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#7f8f86'; g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(0, i * 16); g.lineTo(S, i * 16); g.stroke(); g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, S); g.stroke(); }
    g.fillStyle = '#2f6b55'; g.fillRect(0, 88, S, 10); // painted stripe
    grain(g, S, S, rand, 12);
  });
  simple('hoarding', 256, (g, S) => {
    g.fillStyle = '#e9ecef'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#1f4e8c'; g.fillRect(0, S * 0.7, S, S * 0.3);
    g.fillStyle = '#1f4e8c'; g.font = 'bold 24px Arial'; g.textAlign = 'center';
    g.fillText('KAWASAN PEMBINAAN', S / 2, 70);
    g.font = '16px Arial'; g.fillText('construction site · keep out', S / 2, 100);
    grain(g, S, S, rand, 8);
  });
  simple('barrier', 128, (g, S) => {
    g.fillStyle = '#d8d5cf'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#c0392b' : '#f4f1ea'; g.fillRect(i * 22, 0, 22, S * 0.35); }
    grain(g, S, S, rand, 10);
  });
  simple('hedge', 128, (g, S) => {
    g.fillStyle = '#2f5b2a'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(${40 + rand() * 50},${100 + rand() * 60},${30 + rand() * 30},0.8)`; g.beginPath(); g.arc(rand() * S, rand() * S, 2 + rand() * 3, 0, 7); g.fill(); }
  });
  simple('water', 256, (g, S) => {
    const grd = g.createLinearGradient(0, 0, S, S);
    grd.addColorStop(0, '#1f5a6e'); grd.addColorStop(1, '#2c7a8a');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 40; i++) { g.beginPath(); const y = rand() * S; g.moveTo(rand() * S, y); g.lineTo(rand() * S, y + 2); g.stroke(); }
  });
  simple('lanes', 64, (g, S) => {
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#e8e2c8'; g.fillRect(0, 24, S, 16);
  });

  // Twin Towers cladding: stainless-steel sunshades + glass bands; emissive version lights the facade at night.
  {
    const S = 256;
    const [c, g] = canvas(S);
    const [e, ge] = canvas(S);
    g.fillStyle = '#5a6a76'; g.fillRect(0, 0, S, S);
    ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
    for (let r = 0; r < 8; r++) {
      const y = r * 32;
      const grd = g.createLinearGradient(0, y, 0, y + 22);
      grd.addColorStop(0, '#3c5568'); grd.addColorStop(1, '#22323e');
      g.fillStyle = grd; g.fillRect(0, y + 8, S, 20);
      g.fillStyle = '#d7dde2'; g.fillRect(0, y, S, 6); // steel band
      g.fillStyle = '#9aa6ae'; g.fillRect(0, y + 28, S, 4);
      ge.fillStyle = 'rgba(235,240,255,0.95)'; ge.fillRect(0, y, S, 6);
      ge.fillStyle = 'rgba(255,230,180,0.35)'; ge.fillRect(0, y + 8, S, 20);
    }
    g.fillStyle = '#c5ccd2';
    for (let k = 0; k < 16; k++) g.fillRect(k * 16, 0, 2, S);
    out.towerSkin = tex(c, aniso);
    out.towerSkin_night = tex(e, aniso);
  }
  return out;
}

// Soft radial glow (light pools, vents, intel beacons).
export function createGlowTexture(color = '255,220,160') {
  const [c, g] = canvas(64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, `rgba(${color},0.9)`);
  grd.addColorStop(0.4, `rgba(${color},0.35)`);
  grd.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Text label texture for signs.
export function createSignTexture(text, bg = '#1d5c3a', fg = '#ffffff', w = 512, h = 96) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = fg; g.font = `bold ${Math.floor(h * 0.45)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
