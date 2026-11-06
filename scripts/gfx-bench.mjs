// Robust GPU benchmark: interleaved trials per preset, warm-up excluded, medians reported.
// Raw preset cost is measured with dynamic resolution OFF; the "auto" row shows the effective
// frame rate with dynamic resolution ON at the detected preset.
// Usage: node scripts/gfx-bench.mjs [views] [trials]
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const views = (process.argv[2] || 'depot,kl-towers-day,kl-street,kl-tunnel').split(',');
const trials = Number(process.argv[3] || 3);
const presets = ['low', 'medium', 'high', 'ultra'];
const server = await createServer({ server: { port: 5189, strictPort: true, open: false }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--window-size=1920,1080', '--disable-frame-rate-limit', '--disable-gpu-vsync'],
  defaultViewport: { width: 1920, height: 1080 }, protocolTimeout: 1800000,
});
const page = await browser.newPage();
await page.goto('http://localhost:5189/?nolock', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game, { timeout: 180000 });
const gpu = await page.evaluate(() => window.__game.gpuInfo);
console.log(`GPU: ${gpu.gpu} · auto preset: ${gpu.preset} · 1920x1080`);
await page.click('#btn-play');
await new Promise((r) => setTimeout(r, 800));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const run = (preset, drs) => page.evaluate(async (p, d) => {
  const g = window.__game;
  g.settings.dynamicRes = d;
  g.drs.scale = 1;
  g.settings.graphics = p;
  g.applySettings('graphics');
  await new Promise((r) => setTimeout(r, d ? 9000 : 4000)); // warm-up (DRS needs time to settle)
  return new Promise((resolve) => {
    const times = [];
    let last = performance.now();
    const t0 = last;
    const tick = () => {
      const now = performance.now();
      times.push(now - last); last = now;
      if (now - t0 < 4000) requestAnimationFrame(tick);
      else {
        times.sort((a, b) => a - b);
        resolve({ fps: times.length / ((now - t0) / 1000), p95: times[Math.floor(times.length * 0.95)], tris: g.renderer.info.render.triangles, scale: g.drs.scale });
      }
    };
    requestAnimationFrame(tick);
  });
}, preset, drs);

for (const v of views) {
  await page.evaluate(async (name) => window.__game.test.gfxView(name), v);
  const res = Object.fromEntries(presets.map((p) => [p, []]));
  for (let t = 0; t < trials; t++) {
    const order = t % 2 ? [...presets].reverse() : presets;
    for (const p of order) res[p].push(await run(p, false));
  }
  for (const p of presets) {
    const r = res[p];
    console.log(`${v.padEnd(16)} ${p.padEnd(7)} median ${median(r.map((x) => x.fps)).toFixed(1).padStart(6)} fps  p95 ${median(r.map((x) => x.p95)).toFixed(1).padStart(6)} ms  tris ${(median(r.map((x) => x.tris)) / 1000).toFixed(0)}k  [${r.map((x) => x.fps.toFixed(0)).join(', ')}]`);
  }
  const auto = await run(gpu.preset, true);
  console.log(`${v.padEnd(16)} auto(${gpu.preset}) + dynamic res: ${auto.fps.toFixed(1)} fps at ${(auto.scale * 100).toFixed(0)}% resolution`);
}
await browser.close();
await server.close();
