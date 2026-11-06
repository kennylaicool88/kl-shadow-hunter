// Content cost breakdown on the real GPU: hides one category at a time and measures FPS/triangles.
// Usage: node scripts/gfx-cost.mjs [view] [preset]
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const view = process.argv[2] || 'kl-towers-day';
const preset = process.argv[3] || 'medium';
const server = await createServer({ server: { port: 5185, strictPort: true, open: false }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--window-size=1920,1080', '--disable-frame-rate-limit', '--disable-gpu-vsync'],
  defaultViewport: { width: 1920, height: 1080 }, protocolTimeout: 900000,
});
const page = await browser.newPage();
await page.goto('http://localhost:5185/?nolock', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game, { timeout: 180000 });
await page.click('#btn-play');
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(async (v, p) => {
  await window.__game.test.gfxView(v);
  window.__game.settings.graphics = p;
  window.__game.applySettings('graphics');
}, view, preset);
await new Promise((r) => setTimeout(r, 4000));
const CATS = {
  none: '',
  props: 'props',
  vegetation: 'veg',
  facades: 'facade-',
  towers: 'twin-towers',
  skyline: 'skyline',
  cars: 'cars',
  tunnel: 'tunnel-dressing',
  water: 'lake',
  shadows: '#shadows',
  hud: '#hud',
  lights: '#lights',
  envmap: '#env',
};
for (const [label, key] of Object.entries(CATS)) {
  const r = await page.evaluate(async (k) => {
    const g = window.__game;
    const hidden = [];
    const undo = [];
    if (k === '#shadows') g.renderer.shadowMap.autoUpdate = false;
    else if (k === '#hud') { for (const id of ['tactical', 'hud']) { const e = document.getElementById(id); if (e) { undo.push([e, e.style.display]); e.style.display = 'none'; } } }
    else if (k === '#lights') { g.scene.traverse((o) => { if ((o.isPointLight || o.isSpotLight) && o.visible) { o.visible = false; hidden.push(o); } }); await new Promise((res) => setTimeout(res, 2500)); }
    else if (k === '#env') { undo.push(['env', g.scene.environment]); g.scene.environment = null; await new Promise((res) => setTimeout(res, 2500)); }
    else if (k) {
      g.map.group.traverse((o) => {
        const n = o.name || '';
        const m = o.material && !Array.isArray(o.material) ? o.material : null;
        const isVeg = k === 'veg' && o.isInstancedMesh && m && (m.alphaTest > 0 || (m.map && /bark/.test(m.name)));
        const isProp = k === 'props' && o.isInstancedMesh && !isVeg && /street_lamp|aircon|trash|utility|seating|planter|shrub|covered_car|bollards/.test(n);
        const isCar = k === 'cars' && o.isInstancedMesh && o.count > 20 && !n;
        if (isVeg || isProp || isCar || (k !== 'veg' && k !== 'props' && k !== 'cars' && n.startsWith(k))) { if (o.visible) { o.visible = false; hidden.push(o); } }
      });
    }
    await new Promise((res) => setTimeout(res, 800));
    const out = await new Promise((resolve) => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else resolve({ fps: n / ((performance.now() - t0) / 1000), tris: g.renderer.info.render.triangles, calls: g.renderer.info.render.calls }); };
      requestAnimationFrame(tick);
    });
    for (const o of hidden) o.visible = true;
    for (const [e, v] of undo) { if (e === 'env') g.scene.environment = v; else e.style.display = v; }
    g.renderer.shadowMap.autoUpdate = true;
    await new Promise((res) => setTimeout(res, 2500));
    return out;
  }, key);
  console.log(`hide ${label.padEnd(11)} ${r.fps.toFixed(1).padStart(6)} fps  tris ${(r.tris / 1000).toFixed(0).padStart(5)}k  calls ${r.calls}`);
}
await browser.close();
await server.close();
