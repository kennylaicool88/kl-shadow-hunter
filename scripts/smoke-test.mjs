// Headless browser smoke test: starts Vite, opens the game in Chrome/Edge, plays it through
// the debug hooks, and fails on any JavaScript error.
// Usage: npm run smoke [-- --shots <dir>]
import { createServer, preview } from 'vite';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const shotsIdx = process.argv.indexOf('--shots');
const shotsDir = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

const executablePath = BROWSERS.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error('No Chrome/Edge found. Set CHROME_PATH to a Chromium-based browser.');
  process.exit(2);
}

const PORT = 5179;
// --dist: test the production build in dist/ (vite preview) so source edits during the run can't interfere.
const useDist = process.argv.includes('--dist');
const server = useDist
  ? await preview({ preview: { port: PORT, strictPort: true, open: false }, logLevel: 'error' })
  : await createServer({ server: { port: PORT, strictPort: true, open: false }, logLevel: 'error' });
if (!useDist) await server.listen();

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 720 },
  protocolTimeout: 900000,
});

const errors = [];
const results = [];
let failed = false;
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed = true;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(`http://localhost:${PORT}/?nolock`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__game !== undefined, { timeout: 30000 });
  await sleep(500);
  if (shotsDir) await page.screenshot({ path: path.join(shotsDir, '01-menu.png') });

  // ---- 1. Start without errors, 2. enter the game
  check('app starts without JS errors', errors.length === 0, errors.join(' | '));
  await page.click('#btn-play');
  await sleep(400);
  const state = await page.evaluate(() => window.__game.state);
  check('Play enters the game', state === 'playing', `state=${state}`);

  const stage = await page.evaluate(() => (window.__game.test ? Object.keys(window.__game.test) : []));
  const run = async (name, ...args) => page.evaluate((n, a) => window.__game.test[n](...a), name, args);
  const has = (n) => stage.includes(n);
  if (has('prepare')) await run('prepare'); // skip buy time, keep bots frozen

  // ---- 3. WASD + mouse look
  const p0 = await page.evaluate(() => ({ ...window.__game.player.body.pos }));
  await page.keyboard.down('KeyW');
  await page.waitForFunction((z0) => window.__game.player.body.pos.z < z0 - 2.5, { timeout: 30000 }, p0.z).catch(() => {});
  await page.keyboard.up('KeyW');
  const p1 = await page.evaluate(() => ({ ...window.__game.player.body.pos }));
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check('W moves the player forward', moved > 2 && p1.z < p0.z, `moved ${moved.toFixed(2)}m`);
  const yaw0 = await page.evaluate(() => window.__game.player.yaw);
  await page.evaluate(() => { window.__game.input.mouseDX += 200; });
  await page.waitForFunction((y0) => Math.abs(window.__game.player.yaw - y0) > 0.2, { timeout: 5000 }, yaw0).catch(() => {});
  const yaw1 = await page.evaluate(() => window.__game.player.yaw);
  check('mouse look rotates the camera', Math.abs(yaw1 - yaw0) > 0.2, `dyaw ${(yaw1 - yaw0).toFixed(2)}`);
  await page.evaluate(() => { window.__game.player.yaw = 0; });

  // ---- 5. Jump
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.player.body.pos.y > 0.15, { timeout: 5000 }).catch(() => {});
  const yAir = await page.evaluate(() => window.__game.player.body.pos.y);
  // Headless software rendering is slow (game time < wall time), so wait for landing.
  await page.waitForFunction(() => window.__game.player.body.grounded, { timeout: 30000 }).catch(() => {});
  const yLand = await page.evaluate(() => window.__game.player.body.pos.y);
  const grounded = await page.evaluate(() => window.__game.player.body.grounded);
  check('jump leaves the ground and lands', yAir > 0.1 && Math.abs(yLand) < 0.01 && grounded, `air ${yAir.toFixed(2)} land ${yLand.toFixed(3)}`);

  if (shotsDir) await page.screenshot({ path: path.join(shotsDir, '02-ingame.png') });

  // ---- 4. Wall collision through the real game loop
  if (has('teleport')) {
    await run('teleport', -15, 0, -22, 0);
    await page.keyboard.down('KeyW');
    await sleep(1500);
    await page.keyboard.up('KeyW');
    const z = await page.evaluate(() => window.__game.player.body.pos.z);
    check('cannot walk through a wall', z > -25.5, `z=${z.toFixed(2)}`);
  }

  // ---- Stage 2: shooting (6, 7, 8, 9, 10)
  if (has('spawnDummy')) {
    await run('equip', 'primary');
    // Dummy 5m in front in the open; aim at the chest.
    await run('teleport', 0, 0, 33, 0, Math.atan2(1.1 - 1.65, 5));
    const di = await run('spawnDummy', 0, 28);
    const a0 = await run('ammo');
    await run('fireOnce');
    const a1 = await run('ammo');
    const d1 = await run('dummy', di);
    check('weapon fires toward the crosshair and damages the target', d1.health < 100, `health=${d1.health}`);
    check('ammunition decreases when firing', a1.mag === a0.mag - 1, `${a0.mag} -> ${a1.mag}`);

    // Dummy behind the warehouse wall.
    await run('teleport', 5, 0, 20, 0, Math.atan2(1.1 - 1.65, 12));
    const dw = await run('spawnDummy', 5, 8);
    await run('fireOnce');
    const dw1 = await run('dummy', dw);
    check('shots do not pass through solid walls', dw1.health === 100, `health=${dw1.health}`);

    // Reload through the real input path.
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => window.__game.weapons.weapon.reloading, { timeout: 5000 }).catch(() => {});
    await page.waitForFunction(() => !window.__game.weapons.weapon.reloading, { timeout: 90000 }).catch(() => {});
    const a2 = await run('ammo');
    check('reloading restores the magazine', a2.mag === 30 && a2.reserve === a0.reserve - 2, `mag=${a2.mag} reserve=${a2.reserve}`);
    if (shotsDir) {
      await run('teleport', 0, 0, 33, 0, -0.05);
      await sleep(300);
      await page.screenshot({ path: path.join(shotsDir, '02b-weapon.png') });
    }
  }

  // Later-stage checks register themselves on window.__game.test
  if (has('runAcceptance')) {
    const acc = await run('runAcceptance');
    for (const r of acc) check(r.name, r.ok, r.detail);
    if (shotsDir) await page.screenshot({ path: path.join(shotsDir, '03-after-acceptance.png') });
  }
  if (has('screenshotViews') && shotsDir) {
    const views = await run('screenshotViews');
    for (let i = 0; i < views; i++) {
      await run('setView', i);
      await sleep(350);
      await page.screenshot({ path: path.join(shotsDir, `view-${i}.png`) });
    }
  }

  // ---- Weapon & equipment overhaul
  if (has('runWeaponAcceptance')) {
    const wres = await run('runWeaponAcceptance');
    for (const r of wres) check(`[ARSENAL] ${r.name}`, r.ok, r.detail);
  }

  // ---- Operation Deep Strike (KL city expansion)
  if (has('runMissionAcceptance')) {
    const mres = await run('runMissionAcceptance');
    for (const r of mres) check(`[KL] ${r.name}`, r.ok, r.detail);
    if (shotsDir) {
      const shots = ['towers-day', 'towers-night', 'street', 'garage-roof', 'mall', 'tunnel', 'targeting', 'cutaway',
        'flight-launch', 'flight-highalt', 'flight-cruise', 'flight-tracking', 'flight-cluster', 'impact', 'drilling', 'failure'];
      for (const name of shots) {
        await run('missionShot', name);
        await sleep(900);
        await page.screenshot({ path: path.join(shotsDir, `kl-${name}.png`) });
      }
    }
    await run('unfreeze');
    const lvl = await run('backToDepot');
    check('[KL] 16. returns to the Training Depot after the mission', lvl === 'depot', `level=${lvl}`);
    // 16. Existing FPS systems still work after the expansion
    await run('equip', 'primary');
    await run('teleport', 0, 0, 33, 0, Math.atan2(1.1 - 1.65, 5));
    const di2 = await run('spawnDummy', 0, 28);
    const before = await run('ammo');
    await run('fireOnce');
    const after = await run('ammo');
    const dd = await run('dummy', di2);
    check('[KL] 16. FPS shooting still damages targets and uses ammo', dd.health < 100 && after.mag === before.mag - 1, `hp=${dd.health} mag ${before.mag}->${after.mag}`);
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => window.__game.weapons.weapon.reloading, { timeout: 5000 }).catch(() => {});
    await page.waitForFunction(() => !window.__game.weapons.weapon.reloading, { timeout: 90000 }).catch(() => {});
    const rl = await run('ammo');
    check('[KL] 16. FPS reload still works', rl.mag === 30, `mag=${rl.mag}`);
    const zA = await page.evaluate(() => window.__game.player.body.pos.z);
    await page.keyboard.down('KeyW');
    await page.waitForFunction((z0) => window.__game.player.body.pos.z < z0 - 1.5, { timeout: 10000 }, zA).catch(() => {});
    await page.keyboard.up('KeyW');
    const zB = await page.evaluate(() => window.__game.player.body.pos.z);
    check('[KL] 16. FPS movement still works', zA - zB > 1.5, `moved ${(zA - zB).toFixed(2)}m`);
  }

  // ---- 14. Pause / settings
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.state === 'paused', { timeout: 10000 }).catch(() => {});
  const paused = await page.evaluate(() => window.__game.state);
  check('Esc pauses the game', paused === 'paused', `state=${paused}`);
  await page.click('#btn-settings-pause');
  await sleep(100);
  const settingsVisible = await page.evaluate(() => !document.getElementById('settings-menu').classList.contains('hidden'));
  check('settings menu opens from pause', settingsVisible);
  await page.$eval('#set-sens', (el) => { el.value = '2.5'; el.dispatchEvent(new Event('input')); });
  const sens = await page.evaluate(() => window.__game.settings.sensitivity);
  check('sensitivity slider updates settings', sens === 2.5, `sens=${sens}`);
  await page.click('#btn-settings-back');
  await page.click('#btn-resume');
  await sleep(200);
  const resumed = await page.evaluate(() => window.__game.state);
  check('Resume returns to the game', resumed === 'playing', `state=${resumed}`);

  check('no JS errors during the session', errors.length === 0, errors.slice(0, 5).join(' | '));

  // ---- Standalone drilling sequence (independent of the FPS scene)
  const drill = await browser.newPage();
  const drillErrors = [];
  drill.on('pageerror', (err) => drillErrors.push(err.message));
  drill.on('console', (msg) => { if (msg.type() === 'error') drillErrors.push(msg.text()); });
  await drill.goto(`http://localhost:${PORT}/?drilltest&depth=300`, { waitUntil: 'networkidle0', timeout: 60000 });
  await drill.waitForFunction(() => window.__drill && window.__drill.done, { timeout: 120000 }).catch(() => {});
  const ds = await drill.evaluate(() => window.__drill || {});
  const gameLoaded = await drill.evaluate(() => window.__game !== undefined);
  check('[KL] 9. standalone drilling sequence reaches 300 ft without the FPS scene', ds.done && Math.abs(ds.maxDepth - 300) < 0.01 && ds.breached && !gameLoaded,
    `depth=${ds.maxDepth} layers=${(ds.layers || []).length} fpsLoaded=${gameLoaded}`);
  if (shotsDir) {
    await drill.goto(`http://localhost:${PORT}/?drilltest&depth=300`, { waitUntil: 'networkidle0' });
    await sleep(2500);
    await drill.screenshot({ path: path.join(shotsDir, 'kl-drilltest.png') });
  }
  check('[KL] 17. no JS errors on the drilling test page', drillErrors.length === 0, drillErrors.slice(0, 3).join(' | '));
} catch (err) {
  check('smoke test ran to completion', false, err.stack || String(err));
} finally {
  await browser.close();
  await server.close();
}

console.log(results.join('\n'));
console.log(failed ? '\nSMOKE TEST FAILED' : '\nSMOKE TEST PASSED');
process.exit(failed ? 1 : 0);
