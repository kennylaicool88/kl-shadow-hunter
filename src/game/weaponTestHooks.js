// Acceptance checks for the weapon & equipment overhaul (run by scripts/smoke-test.mjs).
// They drive the real systems: input path for switching, real projectiles/effects, real bots/AI.
import { ARSENAL, CATEGORIES } from '../weapons/arsenal.js';
import { THROWABLES, EQUIPMENT } from '../weapons/equipmentData.js';
import { buildWeaponModel, buildViewModel } from '../weapons/WeaponModels.js';
import { CLASS_WEAPONS } from '../enemies/EnemyManager.js';

const DT = 1 / 60;

export function installWeaponHooks(game, hooks, step) {
  const press = (code) => { game.input.pressed.add(code); game.input.keys.add(code); game.simulate(DT); game.input.keys.delete(code); game.input.endFrame(); };
  const click = (b = 0) => { game.input.mousePressed.add(b); game.input.mouseButtons.add(b); game.simulate(DT); game.input.mouseButtons.delete(b); game.input.endFrame(); };

  // Live bot with real AI, frozen in place (perception still runs where tests call it).
  const spawnBot = (x, z, cls = 'rifleman', yaw = Math.PI) => {
    const b = game.enemies._spawnMissionBot({ pos: [x, 0, z], zone: null, cls }, `T-${cls}-${game.enemies.bots.length}`);
    b.ai.frozen = true;
    b.yaw = yaw; b.ai.aimYaw = yaw;
    b.health = 1000;
    b.updateModel(0, 0);
    return b;
  };
  const clearBots = () => {
    for (const b of game.enemies.bots) { b.alive = false; b.body.pos.y = -80; }
  };

  hooks.runWeaponAcceptance = async () => {
    const results = [];
    const ok = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail: String(detail) });
    const p = game.player;
    const W = game.weapons;
    Object.assign(game.settings, { mode: 'solo', enemyCount: 2, difficulty: 'normal', sandboxUnlock: true });
    await game.startMatch();
    hooks.prepare();
    // Hold the round open while bots are cleared / spawned for the checks.
    const gsUpdate = game.gs.update;
    game.gs.update = () => null;
    clearBots();
    p.health = 1e6; // test bots are briefly unfrozen (decoy check); keep the player alive

    // ---- 1. Categories
    const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.id === 'grenade' ? Object.keys(THROWABLES).length : c.id === 'equipment' ? Object.keys(EQUIPMENT).length : ARSENAL.filter((w) => w.category === c.id).length]));
    ok('W1. every weapon category contains multiple selectable items', Object.values(counts).every((n) => n >= 2), JSON.stringify(counts));
    let selectable = 0;
    for (const e of ARSENAL) { W.give(e.id); if (W.weapon && W.weapon.id === e.id) selectable++; }
    ok('W1b. every arsenal weapon can be equipped', selectable === ARSENAL.length, `${selectable}/${ARSENAL.length}`);

    // ---- 2. Distinct 3D models
    const sigs = new Map();
    let placeholders = 0;
    for (const e of ARSENAL) {
      const m = buildWeaponModel(e.id);
      if (m.userData.placeholder) placeholders++;
      let tris = 0, meshes = 0;
      m.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
      // Topology + overall dimensions (e.g. the GL-17 and GL-19 share topology but not size).
      const bb = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
      m.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        for (let k = 0; k < 3; k++) { bb.min[k] = Math.min(bb.min[k], b.min.getComponent(k)); bb.max[k] = Math.max(bb.max[k], b.max.getComponent(k)); }
      });
      const dims = bb.max.map((v, k) => (v - bb.min[k]).toFixed(3)).join('x');
      const sig = `${Math.round(tris)}:${meshes}:${dims}`;
      sigs.set(e.id, sig);
    }
    const unique = new Set(sigs.values()).size;
    ok('W2. every weapon has its own distinct 3D model (no placeholders, no reuse)', unique === ARSENAL.length && placeholders === 0, `${unique} unique / ${ARSENAL.length}, placeholders ${placeholders}`);

    // ---- 3. Switching through the real input path (1–6), wheel and fire mode
    W.giveLoadout('ar_416');
    const seq = [];
    for (const code of ['Digit2', 'Digit3', 'Digit5', 'Digit6', 'Digit1']) { press(code); W.switchTimer = 0; seq.push(W.current); }
    ok('W3. number keys switch primary/sidearm/knife/grenades/equipment', seq.join(',') === 'secondary,melee,grenade,equipment,primary', seq.join(','));
    const ge0 = W.grenadeType;
    press('Digit5'); press('Digit5');
    ok('W3b. pressing 5 again cycles the grenade type', W.current === 'grenade' && W.grenadeType !== ge0, `${ge0} -> ${W.grenadeType}`);
    press('Digit1'); W.switchTimer = 0;
    const entries = W.wheelEntries();
    const target = entries.findIndex((e) => e.kind === 'slot' && e.slot === 'secondary');
    W.selectWheel(entries[target]);
    ok('W3c. weapon wheel selection equips the chosen item', W.current === 'secondary', `current=${W.current} entries=${entries.length}`);
    press('Digit1'); W.switchTimer = 0;
    const m0 = W.weapon.mode;
    press('KeyX');
    ok('W3d. X cycles the fire mode', W.weapon.mode !== m0, `${m0} -> ${W.weapon.mode}`);

    // ---- 4. Firing + reload animations
    hooks.teleport(0, 0, 33, 0, 0.1);
    W.switchTimer = 0;
    const model = W.model;
    hooks.fireOnce();
    const kicked = W.kick > 0.3 && W.cycleTime > 0;
    W.updateViewModel(DT);
    const firedPos = model.position.z;
    const mag = model.userData.mag;
    W.weapon.startReload(); W._onReloadStart(W.weapon);
    let magMoved = false, magY0 = null;
    for (let t = 0; t < W.weapon.cfg.reloadTime + 0.3; t += DT) {
      game.simulate(DT); W.updateViewModel(DT);
      if (mag && mag.userData.base) { magY0 = mag.userData.base.y; if (mag.position.y < magY0 - 0.05) magMoved = true; }
    }
    ok('W4a. firing plays recoil kick + bolt cycling', kicked && Number.isFinite(firedPos), `kick=${W.kick.toFixed(2)}`);
    ok('W4b. reload animation moves the magazine out and back', magMoved && Math.abs(mag.position.y - magY0) < 1e-6 && W.weapon.mag === W.weapon.cfg.magSize, `moved=${magMoved} mag=${W.weapon.mag}`);
    W.give('pt_g17'); W.switchTimer = 0;
    const slide = W.model.userData.slide;
    hooks.fireOnce(); W.updateViewModel(0.03);
    ok('W4c. pistol slide cycles when firing', slide && slide.position.z > slide.userData.base.z + 0.005, slide ? (slide.position.z - slide.userData.base.z).toFixed(3) : 'no slide');
    W.inspectTime = 1.3; W.updateViewModel(0.016); // mid-animation
    ok('W4d. inspect animation rotates the weapon', Math.abs(W.model.rotation.y) > 0.3, `ry=${W.model.rotation.y.toFixed(2)}`);

    // ---- 5. Grenades (real projectiles + effects)
    W.giveLoadout('ar_416', { ...W.loadout, grenades: ['frag', 'smoke', 'flash', 'stun'], equipment: W.loadout.equipment });
    for (const t of Object.keys(THROWABLES)) W.grenades[t] = 3;
    hooks.teleport(0, 0, 33, 0, -0.25);
    const thr = game.throwables;
    // frag
    const fb = spawnBot(0, 27.5);
    const h0 = fb.health;
    W.throwGrenade('frag', true);
    step(4, () => thr.stats.detonated.frag >= 1);
    ok('W5a. frag grenade is thrown, bounces, detonates and damages nearby enemies', thr.stats.detonated.frag >= 1 && fb.health < h0, `hp ${h0}->${fb.health}`);
    // smoke blocks AI line of sight
    clearBots();
    const sb = spawnBot(0, 18);
    const seesBefore = !!sb.ai._canSee(p);
    thr._spawnSmoke({ x: 0, y: 0, z: 25.5, clone() { return { ...this }; } }, THROWABLES.smoke);
    step(2.6);
    const seesAfter = !!sb.ai._canSee(p);
    ok('W5b. smoke cloud blocks enemy vision', seesBefore && !seesAfter && thr.smokes.length === 1, `before=${seesBefore} after=${seesAfter}`);
    thr.clear();
    // flash
    clearBots();
    const flb = spawnBot(0, 26);
    W.throwGrenade('flash', true);
    step(3, () => (thr.stats.detonated.flash || 0) >= 1);
    ok('W5c. flashbang disorients enemies that see it', flb.ai.blindTime > 0, `blind=${flb.ai.blindTime.toFixed(2)}s`);
    // stun
    W.throwGrenade('stun', true);
    step(3, () => (thr.stats.detonated.stun || 0) >= 1);
    ok('W5d. stun grenade slows nearby enemies', flb.ai.stunTime > 0 && flb.ai.stunSlow < 1, `stun=${flb.ai.stunTime.toFixed(2)} slow=${flb.ai.stunSlow}`);
    // incendiary
    clearBots();
    const ib = spawnBot(0, 27);
    const ih = ib.health;
    thr.throw('incendiary', { x: 0, y: 0.3, z: 27 }, { x: 0, y: -1, z: 0 }, 0, p);
    step(4.5);
    ok('W5e. incendiary creates a burning area-denial zone', thr.fires.length === 1 && ib.health < ih, `fires=${thr.fires.length} hp ${ih}->${ib.health}`);
    thr.clear();
    // EMP: cameras + bot electronics
    const cam = game.surveillance.cameras[0];
    clearBots();
    const eb = spawnBot(cam.pos.x + 2, cam.pos.z + 2);
    thr.throw('emp', { x: cam.pos.x, y: cam.pos.y - 0.5, z: cam.pos.z }, { x: 0, y: -1, z: 0 }, 0, p);
    step(2.5, () => cam.disabled > 0);
    ok('W5f. EMP disables surveillance cameras and enemy electronics', cam.disabled > 0 && eb.ai.empTime > 0, `cam=${cam.disabled.toFixed(1)}s bot=${eb.ai.empTime.toFixed(1)}s`);
    // sensor
    clearBots();
    const snb = spawnBot(6, 14);
    thr.throw('sensor', { x: 0, y: 0.4, z: 26 }, { x: 0, y: -1, z: 0 }, 0, p);
    step(2.5);
    game._updateHud(0);
    const marks = document.querySelectorAll('#hud-markers .mk-hostile').length;
    ok('W5g. sensor grenade reveals nearby hostiles on the HUD', thr.isRevealed(snb) && marks >= 1, `revealed=${thr.isRevealed(snb)} markers=${marks}`);
    thr.clear();
    // decoy
    clearBots();
    const db = spawnBot(10, 12, 'rifleman', 0);
    db.ai.frozen = false;
    db.ai.goals = [[10, 0, 12]]; // hold position (looking away from the player) until something is heard
    db.ai.path = null;
    // This checks hearing: a random patrol glance must not spot the player before the first burst.
    db.ai.diff = { ...db.ai.diff, viewDist: 2 };
    db.ai.setState('patrol');
    thr.throw('decoy', { x: 4, y: 0.3, z: 22 }, { x: 0, y: -1, z: 0 }, 0, p);
    // First reaction to the first fake burst (later it may spot the player and switch target).
    step(3, () => thr.decoys.length && thr.decoys[0].pulses >= 1);
    const ip = db.ai.investigatePos ? { ...db.ai.investigatePos } : null;
    const ipTxt = ip ? `${ip.x.toFixed(1)},${ip.z.toFixed(1)}` : 'none';
    ok('W5h. decoy makes enemies investigate its fake gunfire', ip && Math.hypot(ip.x - 4, ip.z - 22) < 1.5, `state=${db.ai.state} target=${ipTxt}`);
    db.ai.frozen = true;
    thr.clear();
    // pulse device + counters & cooldown
    const before = W.grenades.pulse;
    W.throwGrenade('pulse', true);
    const cool = W.grenadeCooldown > 0;
    ok('W5i. grenade inventory counter and cooldown update', W.grenades.pulse === before - 1 && cool, `pulse ${before}->${W.grenades.pulse} cooldown=${W.grenadeCooldown.toFixed(2)}`);
    step(3.5);
    ok('W5j. EM pulse device detonates (wide blackout)', (thr.stats.detonated.pulse || 0) >= 1 && thr.lastEmp, JSON.stringify(thr.lastEmp));
    // throw via the real input path
    W.equip('grenade'); W.switchTimer = 0;
    const thrown0 = thr.stats.thrown;
    click(0);
    step(1);
    ok('W5k. LMB with grenades selected plays the throw and launches the grenade', thr.stats.thrown === thrown0 + 1, `thrown ${thrown0}->${thr.stats.thrown}`);
    thr.clear();
    clearBots();

    // ---- 6. Tactical equipment
    const eq = game.equipment;
    W.giveLoadout('ar_416', { ...W.loadout, equipment: ['binoculars', 'nvg', 'thermal', 'flashlight', 'medkit', 'ammopack', 'rangefinder'] });
    press('KeyN');
    const nvg = eq.vision === 'nvg' && game.pipeline.vision === 'nvg';
    press('KeyJ');
    const th = eq.vision === 'thermal' && game.pipeline.visionPass && game.pipeline.visionPass.enabled;
    press('KeyJ');
    press('KeyL');
    const light = eq.light && eq.spot && eq.spot.intensity > 0;
    press('KeyL');
    ok('W6a. night vision / thermal / flashlight toggle and render', nvg && th && light && eq.vision === 'none', `nvg=${nvg} thermal=${th} light=${light}`);
    p.health = 40;
    W.selectGear('equipment', 'medkit'); W.switchTimer = 0;
    W.update(0); // held device becomes active
    game.input.mouseButtons.add(0);
    step(2.3);
    game.input.mouseButtons.delete(0);
    ok('W6b. medical kit heals over a 2 s use', p.health === 100, `health=${p.health} kits=${eq.charges.medkit}`);
    W.slots.primary.mag = 1; W.slots.primary.reserve = 0;
    W.selectGear('equipment', 'ammopack'); W.switchTimer = 0;
    click(0);
    ok('W6c. ammunition pack refills weapons', W.slots.primary.mag === W.slots.primary.cfg.magSize && W.slots.primary.reserve > 0, `mag=${W.slots.primary.mag} reserve=${W.slots.primary.reserve}`);
    hooks.teleport(0, 0, 33, 0, 0);
    W.selectGear('equipment', 'rangefinder'); W.switchTimer = 0;
    click(0);
    ok('W6d. laser rangefinder measures distance', eq.range && eq.range.dist > 1, eq.range ? `${eq.range.dist && eq.range.dist.toFixed(1)} m` : 'none');
    const tb = spawnBot(0, 22);
    hooks.teleport(0, 0, 33, 0, Math.atan2(1.1 - 1.65, 11));
    W.selectGear('equipment', 'binoculars'); W.switchTimer = 0;
    click(0);
    ok('W6e. binoculars tag a hostile in view', thr.isRevealed(tb), `revealed=${thr.isRevealed(tb)}`);
    W.giveLoadout('ar_416', { ...W.loadout, equipment: ['detector', 'shield'] });
    W.selectGear('equipment', 'detector'); W.switchTimer = 0;
    step(0.2);
    ok('W6f. enemy detector shows nearby hostiles', eq.detectorBlips.length >= 1,
      `blips=${eq.detectorBlips.length} held=${eq.heldActive} emp=${eq.empTime.toFixed(1)} bot=${tb.alive}@${tb.body.pos.x.toFixed(1)},${tb.body.pos.z.toFixed(1)} player=${p.body.pos.x.toFixed(1)},${p.body.pos.z.toFixed(1)}`);
    W.selectGear('equipment', 'shield'); W.switchTimer = 0;
    tb.alive = true; tb.health = 1000;
    p.health = 100;
    const hp0 = p.health;
    game.enemies._botFire(tb, { x: 0, y: 1.6, z: 22 }, { x: 0, y: 0, z: 1 }, 0);
    ok('W6g. tactical shield blocks frontal fire', p.health === hp0 && eq.shieldHp < EQUIPMENT.shield.hp, `hp=${p.health} shield=${eq.shieldHp}`);
    clearBots();

    // ---- 7. Attachments visibly change the model and the stats
    const full = { optic: 'holo', muzzle: 'suppressor', under: 'foregrip', light: 'flashlight', laser: 'laser', mag: 'extmag', stock: 'tstock' };
    const vm = buildViewModel('ar_416', full);
    const atts = [];
    vm.traverse((o) => { if (o.name && o.name.startsWith('att-')) atts.push(o.name); });
    const irons = vm.userData.parts.irons;
    const stock = vm.userData.parts.stock;
    W.give('ar_416', null, full);
    const cfg = W.weapon.cfg;
    ok('W7a. attachments appear on the 3D model (optic, suppressor, grip, light, laser, stock)', atts.length === 6 && irons && !irons.visible && stock && !stock.visible && vm.userData.mag.scale.y > 1.3, atts.join(','));
    ok('W7b. attachments change the weapon stats', cfg.magSize === 45 && cfg.suppressed && cfg.hasLaser && cfg.ads.optic === 'holo', `mag=${cfg.magSize} supp=${cfg.suppressed}`);
    W.switchTimer = 0;
    game.input.mouseButtons.add(2);
    step(0.5);
    const fovAds = W.getZoomFov();
    game.input.mouseButtons.delete(2);
    step(0.5);
    ok('W7c. aiming down the holographic sight zooms the view', W.ads === 0 && fovAds < game.settings.fov / 1.2, `ads fov=${fovAds.toFixed(1)}`);

    // ---- 8. HUD ammo
    W.give('ar_416'); W.switchTimer = 0;
    hooks.teleport(0, 0, 33, 0, 0.1);
    game._updateHud(0);
    const hud0 = document.getElementById('hud-mag').textContent;
    hooks.fireOnce(); hooks.fireOnce();
    game._updateHud(0);
    const hud1 = document.getElementById('hud-mag').textContent;
    W.weapon.startReload();
    step(W.weapon.cfg.reloadTime + 0.1);
    game._updateHud(0);
    const hud2 = document.getElementById('hud-mag').textContent;
    ok('W8. HUD ammunition updates on fire and reload', hud0 === '30' && hud1 === '28' && hud2 === '30', `${hud0} -> ${hud1} -> ${hud2}`);
    const icon = document.getElementById('hud-weapon-icon').src;
    ok('W8b. HUD shows the weapon name, icon, fire mode and grenade counter', /^data:image/.test(icon) && document.getElementById('hud-firemode').textContent.length > 0 && document.querySelectorAll('#hud-grenades .gr').length >= 1);

    // ---- 9. Enemy classes carry their weapons
    const classes = ['rifleman', 'heavy', 'sniper', 'recon', 'elite'];
    const bots = classes.map((c, i) => spawnBot(-6 + i * 3, 10, c));
    const okCls = bots.every((b) => CLASS_WEAPONS[b.cls].includes(b.weapon.id) && b.gunModel && b.gunModel.name === `weapon-${b.weapon.id}`);
    ok('W9. enemy classes display their assigned weapon models', okCls, bots.map((b) => `${b.cls}:${b.weapon.id}`).join(' '));
    clearBots();
    p.health = 100;
    game.gs.update = gsUpdate;
    game.settings.sandboxUnlock = false;
    return results;
  };
}
