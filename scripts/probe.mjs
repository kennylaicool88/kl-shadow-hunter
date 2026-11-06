// Runtime probe on the real GPU: loads the game, runs a setup snippet, then for each extra snippet runs it
// and takes a screenshot. Prints results and every console error / asset fallback.
// Usage: node scripts/probe.mjs <setup-js> <shotPrefix|-> [step-js ...]
//   snippets run inside the page with `g` = window.__game (async allowed)
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const [setup = 'return 1', prefix = '-', ...steps] = process.argv.slice(2);
const server = await createServer({ server: { port: 5187, strictPort: true, open: false }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: [process.env.PROBE_SWIFT ? '--use-angle=swiftshader' : '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--window-size=1600,900', ...(process.env.PROBE_UNCAPPED ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])], defaultViewport: { width: 1600, height: 900 }, protocolTimeout: 900000,
});
const page = await browser.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || /FALLBACK/.test(m.text())) errs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errs.push(`PAGEERR ${e.message}\n${(e.stack || '').split('\n').slice(0, 5).join('\n')}`));
await page.goto('http://localhost:5187/?nolock', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game, { timeout: 180000 }).catch(() => errs.push('timeout waiting for __game'));
const run = async (code) => {
  try { return await page.evaluate(new Function(`return (async () => { const g = window.__game; ${code} })()`)); } catch (e) { return `EVAL ERROR ${e.message}`; }
};
console.log('SETUP', JSON.stringify(await run(setup)));
for (const [i, s] of steps.entries()) {
  const r = await run(s);
  await new Promise((res) => setTimeout(res, 500));
  if (prefix !== '-') await page.screenshot({ path: `${prefix}-${i}.png` });
  console.log(`STEP ${i}`, JSON.stringify(r));
}
console.log(errs.length ? errs.join('\n') : 'no errors');
await browser.close();
await server.close();
