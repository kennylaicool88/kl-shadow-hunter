// CPU frame-time breakdown on the real GPU machine (wraps Game methods with timers).
// Usage: node scripts/gfx-cpu.mjs [view] [preset]
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const view = process.argv[2] || 'kl-street';
const preset = process.argv[3] || 'low';
const server = await createServer({ server: { port: 5186, strictPort: true, open: false }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--window-size=1920,1080', '--disable-frame-rate-limit', '--disable-gpu-vsync'],
  defaultViewport: { width: 1920, height: 1080 }, protocolTimeout: 900000,
});
const page = await browser.newPage();
await page.goto('http://localhost:5186/?nolock', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game, { timeout: 180000 });
await page.click('#btn-play');
await new Promise((r) => setTimeout(r, 800));
const res = await page.evaluate(async (v, p) => {
  const g = window.__game;
  await g.test.gfxView(v);
  g.settings.graphics = p;
  g.applySettings('graphics');
  await new Promise((r) => setTimeout(r, 3000));
  const acc = {};
  const wrap = (obj, name, label) => {
    const orig = obj[name].bind(obj);
    obj[name] = (...a) => { const t = performance.now(); const r = orig(...a); acc[label] = (acc[label] || 0) + performance.now() - t; return r; };
  };
  wrap(g.map, 'update', 'map.update');
  wrap(g, '_updateHud', 'hud');
  wrap(g.pipeline, 'render', 'world render (CPU submit)');
  wrap(g.weapons, 'render', 'viewmodel render');
  wrap(g.weapons, 'updateViewModel', 'viewmodel anim');
  wrap(g.effects, 'update', 'effects');
  if (g.mission) wrap(g.mission, 'updateHud', 'tactical hud');
  wrap(g.enemies, 'update', 'enemies');
  let frames = 0;
  const t0 = performance.now();
  await new Promise((resolve) => { const tick = () => { frames++; if (performance.now() - t0 < 4000) requestAnimationFrame(tick); else resolve(); }; requestAnimationFrame(tick); });
  const total = performance.now() - t0;
  const out = { fps: frames / (total / 1000), frameMs: total / frames };
  for (const [k, v] of Object.entries(acc)) out[k] = v / frames;
  // GPU time of one frame via gl.finish
  const gl = g.renderer.getContext();
  const t1 = performance.now();
  g.pipeline.render(); gl.finish();
  out['render+gl.finish (one frame)'] = performance.now() - t1;
  return out;
}, view, preset);
for (const [k, v] of Object.entries(res)) console.log(`${k.padEnd(32)} ${v.toFixed(2)}`);
await browser.close();
await server.close();
