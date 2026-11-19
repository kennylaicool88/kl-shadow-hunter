// CPU profile of the running game (Chrome's sampling profiler): prints the hottest functions by self time.
// Usage: node scripts/gfx-profile.mjs [view] [preset] [seconds]
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const view = process.argv[2] || 'kl-street';
const preset = process.argv[3] || 'low';
const seconds = Number(process.argv[4] || 4);
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
await page.evaluate(async (v, p) => {
  const g = window.__game;
  await g.test.gfxView(v);
  g.testFreeze = false;
  g.settings.graphics = p;
  g.settings.dynamicRes = false;
  g.applySettings('graphics');
  await new Promise((r) => setTimeout(r, 2500));
}, view, preset);
const client = await page.createCDPSession();
await client.send('Profiler.enable');
await client.send('Profiler.setSamplingInterval', { interval: 200 });
await client.send('Profiler.start');
await new Promise((r) => setTimeout(r, seconds * 1000));
const { profile } = await client.send('Profiler.stop');
// Self time per node, aggregated by function name + url:line
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
for (let i = 0; i < profile.samples.length; i++) {
  const n = byId.get(profile.samples[i]);
  const cf = n.callFrame;
  const key = `${cf.functionName || '(anon)'}  ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`;
  self.set(key, (self.get(key) || 0) + (dt[i] || 0));
}
const total = [...self.values()].reduce((a, b) => a + b, 0) / 1000;
console.log(`profiled ${seconds}s at ${view}/${preset}: ${total.toFixed(0)} ms sampled`);
for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${(v / 1000).toFixed(0).padStart(6)} ms  ${(100 * v / 1000 / total).toFixed(1).padStart(5)}%  ${k}`);
await browser.close();
await server.close();
