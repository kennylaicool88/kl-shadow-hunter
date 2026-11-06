// Triangle budget audit: sums triangles per named object type in the loaded level (all instances).
// Usage: node scripts/gfx-tris.mjs [view]
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const view = process.argv[2] || 'kl-street';
const server = await createServer({ server: { port: 5187, strictPort: true, open: false }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--window-size=1280,720'], defaultViewport: { width: 1280, height: 720 }, protocolTimeout: 900000,
});
const page = await browser.newPage();
await page.goto('http://localhost:5187/?nolock', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game, { timeout: 180000 });
await page.click('#btn-play');
await new Promise((r) => setTimeout(r, 800));
const rows = await page.evaluate(async (v) => {
  const g = window.__game;
  await g.test.gfxView(v);
  await new Promise((r) => setTimeout(r, 4000));
  const acc = {};
  g.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const geo = o.geometry;
    const tris = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    const n = o.isInstancedMesh ? o.count : 1;
    const key = (o.name || (o.parent && o.parent.name) || o.material.name || o.type).slice(0, 34);
    acc[key] = acc[key] || { tris: 0, objects: 0, visible: 0 };
    acc[key].tris += tris * n;
    acc[key].objects += 1;
    if (o.visible) acc[key].visible += 1;
  });
  return Object.entries(acc).sort((a, b) => b[1].tris - a[1].tris).slice(0, 25);
}, view);
for (const [k, v] of rows) console.log(`${k.padEnd(36)} ${(v.tris / 1000).toFixed(0).padStart(6)}k tris  ${v.objects} meshes (${v.visible} visible)`);
await browser.close();
await server.close();
