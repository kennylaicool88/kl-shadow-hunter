// Screenshots of the weapon model gallery (?forge) on the real GPU.
// Usage: node scripts/forge-shots.mjs <outDir> [query ...]   e.g. "ids=rifle,ar_416&att=optic:x4" "persp&ids=smg_p90"
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'forge-shots';
const queries = process.argv.slice(3);
if (!queries.length) queries.push('');
fs.mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5186, strictPort: true, open: false }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--window-size=1920,1080'], defaultViewport: { width: 1920, height: 1080 },
});
for (const [i, q] of queries.entries()) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  await page.goto(`http://localhost:5186/?forge&${q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__forge && window.__forge.done, { timeout: 120000 }).catch(() => {});
  const stats = await page.evaluate(() => (window.__forge ? window.__forge.stats : null));
  const file = path.join(out, `forge-${i}.png`);
  await page.screenshot({ path: file });
  console.log(`${file}  ${q}`);
  if (stats) for (const s of stats) console.log(`  ${s.id.padEnd(12)} tris ${String(s.tris).padStart(6)}  len ${s.len} m  ${s.source}`);
  if (errors.length) console.log('  ERRORS:', errors.slice(0, 5).join(' | '));
  await page.close();
}
await browser.close();
await server.close();
