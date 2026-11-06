// GPU visual probe: runs the game in Chrome on the real GPU (not SwiftShader), captures screenshots
// of selected views and measures frame rate per graphics preset.
// Usage: node scripts/gfx-probe.mjs <outDir> [--views depot,kl-towers,...] [--fps] [--presets low,medium,high,ultra]
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'screens';
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const views = (arg('--views', 'depot')).split(',').filter(Boolean);
const presets = (arg('--presets', 'low,medium,high,ultra')).split(',');
const doFps = process.argv.includes('--fps');
const W = Number(arg('--width', 1920)), H = Number(arg('--height', 1080));
fs.mkdirSync(out, { recursive: true });

const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].filter(Boolean).find((p) => fs.existsSync(p));
const server = await createServer({ server: { port: 5183, strictPort: true, open: false }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', `--window-size=${W},${H}`, '--disable-frame-rate-limit', '--disable-gpu-vsync'],
  defaultViewport: { width: W, height: H },
  protocolTimeout: 900000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || /FALLBACK/.test(m.text())) errors.push(m.text()); });
await page.goto('http://localhost:5183/?nolock', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__game || document.getElementById('error-box').textContent, { timeout: 180000 });
const bootErr = await page.evaluate(() => document.getElementById('error-box').textContent);
if (bootErr) console.log('BOOT ERROR:', bootErr);
const gpu = await page.evaluate(() => {
  const gl = window.__game.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
console.log(`GPU: ${gpu}  viewport ${W}x${H}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function measure(seconds = 4) {
  return page.evaluate((s) => new Promise((resolve) => {
    let frames = 0; const times = [];
    let last = performance.now();
    const t0 = last;
    const tick = () => {
      const now = performance.now();
      times.push(now - last); last = now; frames++;
      if (now - t0 < s * 1000) requestAnimationFrame(tick);
      else {
        times.sort((a, b) => a - b);
        const info = window.__game.renderer.info.render;
        resolve({ fps: frames / ((now - t0) / 1000), p95ms: times[Math.floor(times.length * 0.95)], calls: info.calls, tris: info.triangles });
      }
    };
    requestAnimationFrame(tick);
  }), seconds);
}

await page.click('#btn-play');
await sleep(800);
for (const v of views) {
  const ok = await page.evaluate(async (name) => window.__game.test.gfxView ? window.__game.test.gfxView(name) : false, v);
  if (!ok) { console.log(`view ${v}: not available`); continue; }
  await sleep(1500);
  for (const q of doFps ? presets : [arg('--preset', 'high')]) {
    await page.evaluate((p) => { window.__game.settings.graphics = p; window.__game.applySettings('graphics'); }, q);
    await sleep(doFps ? 5000 : 1500); // shader compilation / warm-up excluded from measurements
    const file = path.join(out, `${v}-${q}.png`);
    await page.screenshot({ path: file });
    if (doFps) {
      const m = await measure(5);
      console.log(`${v.padEnd(18)} ${q.padEnd(7)} ${m.fps.toFixed(1).padStart(6)} fps  p95 ${m.p95ms.toFixed(1)}ms  calls ${m.calls}  tris ${(m.tris / 1000).toFixed(0)}k`);
    } else console.log(`saved ${file}`);
  }
}
console.log(errors.length ? `ERRORS/FALLBACKS:\n${errors.slice(0, 10).join('\n')}` : 'no errors or fallbacks');
await browser.close();
await server.close();
