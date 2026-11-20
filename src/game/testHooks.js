// Debug/test hooks exposed as window.__game.test for the automated smoke test
// (scripts/smoke-test.mjs). They drive the real game systems with a fixed time step.
import { Enemy } from '../enemies/Enemy.js';
import { installWeaponHooks } from './weaponTestHooks.js';

const DT = 1 / 60;

export function installTestHooks(game) {
  const step = (seconds, until) => {
    for (let t = 0; t < seconds; t += DT) {
      game.simulate(DT);
      if (until && until()) return true;
    }
    return until ? !!until() : true;
  };

  const place = (bot, x, z, yaw) => {
    bot.body.pos.x = x; bot.body.pos.y = 0; bot.body.pos.z = z;
    bot.velocity.x = bot.velocity.y = bot.velocity.z = 0;
    bot.yaw = yaw;
    bot.ai.aimYaw = yaw;
    bot.updateModel(0, 0);
  };

  const hooks = {
    // Skip buy time but keep the bots frozen so scripted checks are deterministic.
    prepare() {
      game.gs.phase = 'live';
      game.gs.timer = 9999;
      game.controller.frozen = false;
      game.enemies.setFrozen(true);
      return true;
    },

    teleport(x, y, z, yaw, pitch = 0) {
      const b = game.player.body;
      b.pos.x = x; b.pos.y = y; b.pos.z = z;
      game.player.velocity.x = game.player.velocity.z = 0;
      game.player.yaw = yaw;
      game.player.pitch = pitch;
      game.player.recoilPitch = game.player.recoilYaw = 0;
      game._updateCamera();
    },

    // Frozen enemy used as a shooting target.
    spawnDummy(x, z) {
      hooks.prepare();
      const bot = new Enemy('Dummy', 'B', 'rifle', game.scene);
      bot.ai = { update() {}, hear() {}, onDamaged() {}, reset() {}, speed: 0, frozen: true };
      bot.spawn([x, 0, z], Math.PI, 0);
      game.enemies.bots.push(bot);
      return game.enemies.bots.length - 1;
    },

    dummy(i) {
      const d = game.enemies.bots[i];
      return { health: d.health, alive: d.alive };
    },

    // Fire one shot of the current weapon with zero spread, straight through the crosshair.
    fireOnce() {
      const wm = game.weapons;
      const w = wm.weapon;
      w.cooldown = 0;
      w.shotSpread = 0;
      wm.switchTimer = 0;
      game.player.velocity.x = game.player.velocity.z = 0;
      game.player.body.grounded = true;
      game.player.recoilPitch = game.player.recoilYaw = 0;
      game._updateCamera();
      const saved = wm._spreadDir;
      wm._spreadDir = (fwd, r, u, cone, out) => out.copy(fwd);
      const ok = wm._tryFire(w, false);
      wm._spreadDir = saved;
      return ok;
    },

    ammo() {
      const w = game.weapons.weapon;
      return { id: w.id, mag: w.mag, reserve: w.reserve, reloading: w.reloading };
    },

    equip(slot) {
      game.weapons.equip(slot);
      game.weapons.switchTimer = 0;
      return game.weapons.weapon.id;
    },

    // ------------------------------------------------------------------ acceptance scenarios
    runAcceptance() {
      const results = [];
      const ok = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail: String(detail) });
      const p = game.player;

      Object.assign(game.settings, { mode: 'solo', enemyCount: 2, difficulty: 'normal', roundsToWin: 2, roundTime: 120, primary: 'rifle' });
      game.startMatch();
      ok('match starts in buy/freeze time', game.gs.phase === 'freeze' && game.controller.frozen);
      step(6, () => game.gs.phase === 'live');
      ok('round goes live after freeze time', game.gs.phase === 'live' && !game.controller.frozen);

      // --- Buy menu (B), drop (G), pick up (E), scoreboard (Tab) through the real input path.
      const press = (code) => { game.input.pressed.add(code); game.input.keys.add(code); game.simulate(DT); game.input.keys.delete(code); game.input.endFrame(); };
      game.gs.phase = 'freeze';
      game.gs.timer = 30;
      press('KeyB');
      const buyShown = game.buyOpen && !document.getElementById('buy-menu').classList.contains('hidden');
      press('Digit3');
      ok('armory (B) gives the chosen weapon during buy time', buyShown && game.weapons.slots.primary.id === 'sniper' && !game.buyOpen,
        `open=${buyShown} primary=${game.weapons.slots.primary && game.weapons.slots.primary.id}`);
      press('KeyB');
      press('Digit4');
      ok('armory sells armor', p.armor === 100, `armor=${p.armor}`);
      game.gs.timer = 0.01; // end buy time
      step(1, () => game.gs.phase === 'live');
      game.enemies.setFrozen(true);
      hooks.teleport(-14, 0, 33, 0);
      game.weapons.equip('primary');
      const itemsBefore = game.pickups.items.length;
      press('KeyG');
      step(1.5);
      const dropped = game.pickups.items.length === itemsBefore + 1 && game.weapons.slots.primary === null;
      ok('G drops the current weapon', dropped, `items=${game.pickups.items.length} primary=${game.weapons.slots.primary}`);
      const item = game.pickups.items[game.pickups.items.length - 1];
      hooks.teleport(item.mesh.position.x, 0, item.mesh.position.z + 0.5, 0);
      press('KeyE');
      ok('E picks up a nearby weapon', game.weapons.slots.primary && game.weapons.slots.primary.id === 'sniper', `primary=${game.weapons.slots.primary && game.weapons.slots.primary.id}`);
      game.weapons.give('rifle');
      game.input.keys.add('Tab');
      game._updateHud(0);
      const sbShown = !document.getElementById('scoreboard').classList.contains('hidden') && document.getElementById('sb-b').children.length === 2;
      game.input.keys.delete('Tab');
      game._updateHud(0);
      ok('Tab shows the scoreboard', sbShown);

      const [b0, b1] = game.enemies.bots;
      b1.ai.frozen = true;
      place(b1, -37, -37, 0);

      // --- Line of sight: a bot inside the warehouse cannot see the player outside.
      hooks.teleport(5, 0, 20, Math.PI);
      place(b0, 5, 8, Math.PI);
      b0.ai.reset();
      b0.ai.frozen = false;
      const seesThroughWall = b0.ai._canSee(p);
      place(b0, 8, 14, Math.PI);
      hooks.teleport(8, 0, 23, 0);
      const seesInOpen = b0.ai._canSee(p);
      ok('bots use line of sight (no seeing through walls)', !seesThroughWall && seesInOpen, `wall=${seesThroughWall} open=${seesInOpen}`);

      // --- 11. Enemies detect and attack the player.
      b0.ai.reset();
      b0.ai.frozen = false;
      p.health = 10000; // large pool so a bot headshot can't end the round mid-test
      p.armor = 0;
      const states = new Set();
      step(10, () => { states.add(b0.ai.state); return p.health < 10000; });
      ok('enemies detect and attack the player', p.health < 10000 && states.has('attack'), `damage=${10000 - p.health} states=${[...states].join(',')}`);
      p.health = 100;

      // --- Bot bullets are blocked by walls.
      b0.ai.reset();
      b0.ai.frozen = false;
      place(b0, 5, 6, Math.PI);
      hooks.teleport(5, 0, 18, 0);
      // Force the bot to aim and fire straight at the player through the warehouse wall.
      b0.ai.target = p;
      const hpBefore = p.health;
      for (let i = 0; i < 10; i++) {
        game.enemies._botFire(b0, { x: 5, y: 1.62, z: 6 }, { x: 0, y: 0, z: 1 }, 0);
      }
      ok('bot shots do not pass through walls', p.health === hpBefore, `health=${p.health}`);
      b0.ai.frozen = true;

      // --- 7 / 12. Shoot an enemy: health drops, death updates the kill counter.
      place(b0, 8, 14, Math.PI);
      b0.ai.frozen = true;
      game.weapons.equip('primary');
      game.weapons.switchTimer = 0;
      const eyeY = 1.65;
      hooks.teleport(8, 0, 23, 0, Math.atan2(1.1 - eyeY, 9));
      const h0 = b0.health;
      hooks.fireOnce();
      ok('shooting an enemy reduces its health', b0.health < h0, `${h0} -> ${b0.health}`);
      hooks.teleport(8, 0, 23, 0, Math.atan2(1.63 - eyeY, 9));
      for (let i = 0; i < 6 && b0.alive; i++) hooks.fireOnce();
      game._updateHud(0);
      const hudKills = document.getElementById('hud-kill-count').textContent;
      ok('enemy death updates the kill counter', !b0.alive && p.kills === 1 && hudKills === '1', `alive=${b0.alive} kills=${p.kills} hud=${hudKills}`);
      ok('dead bot drops its weapon', game.pickups.items.length >= 1, `pickups=${game.pickups.items.length}`);

      // --- 13a. Win the round by eliminating every enemy.
      game.dealDamage(b1, 999, { attacker: p, part: 'body', armorRatio: 1, weaponName: 'test' });
      step(0.1);
      ok('player wins the round when all enemies are dead', game.gs.lastResult && game.gs.lastResult.winner === 'A' && game.gs.score.A === 1,
        JSON.stringify(game.gs.lastResult));
      step(6, () => game.gs.round === 2);
      ok('next round starts automatically', game.gs.round === 2 && game.gs.phase === 'freeze' && b0.alive && b1.alive);

      // --- 13b. Lose a round.
      step(6, () => game.gs.phase === 'live');
      game.enemies.setFrozen(true);
      game.dealDamage(p, 999, { attacker: b0, part: 'body', armorRatio: 1, weaponName: 'test' });
      step(0.1);
      ok('player loses the round when killed', game.gs.lastResult && game.gs.lastResult.winner === 'B' && !p.alive && game.deathCam.active,
        JSON.stringify(game.gs.lastResult));

      // --- Match over → victory screen, then restart.
      step(6, () => game.gs.round === 3);
      step(6, () => game.gs.phase === 'live');
      game.enemies.setFrozen(true);
      for (const b of game.enemies.bots) game.dealDamage(b, 999, { attacker: p, part: 'body', armorRatio: 1, weaponName: 'test' });
      step(6, () => game.state === 'over');
      const endVisible = !document.getElementById('end-screen').classList.contains('hidden');
      const endTitle = document.getElementById('end-title').textContent;
      ok('match ends with a victory screen', game.state === 'over' && endVisible && endTitle === 'Victory', `state=${game.state} title=${endTitle}`);
      document.getElementById('btn-restart-end').click();
      ok('restart begins a fresh match', game.state === 'playing' && game.gs.round === 1 && game.gs.score.A === 0 && game.gs.score.B === 0 && p.alive && p.kills === 0);

      // --- Short real AI soak: bots navigate and fight without errors.
      Object.assign(game.settings, { enemyCount: 5, mode: 'team', allyCount: 3 });
      game.startMatch();
      step(5, () => game.gs.phase === 'live');
      p.health = 100000; // keep the player alive for the soak
      const startPos = game.enemies.bots.map((b) => ({ x: b.body.pos.x, z: b.body.pos.z }));
      step(25, () => game.gs.phase !== 'live');
      const moved = game.enemies.bots.filter((b, i) => Math.hypot(b.body.pos.x - startPos[i].x, b.body.pos.z - startPos[i].z) > 4).length;
      const insideWalls = game.enemies.bots.filter((b) => b.alive && game.collision.bodyOverlaps(b.body.pos, b.body.radius - 0.05, 1.7)).length;
      ok('bots navigate the map (team mode soak)', moved >= 5, `${moved}/${game.enemies.bots.length} moved >4m`);
      ok('no bot ends up inside geometry', insideWalls === 0, `${insideWalls} overlapping`);
      p.health = 100;
      return results;
    },

    // ------------------------------------------------------------------ screenshot views
    screenshotViews() {
      return VIEWS.length;
    },

    setView(i) {
      if (game.state !== 'playing' || !game.enemies.bots.length) {
        Object.assign(game.settings, { mode: 'solo', enemyCount: 3, difficulty: 'normal' });
        game.startMatch();
      }
      hooks.prepare();
      const v = VIEWS[i];
      const bots = game.enemies.bots;
      bots.forEach((b, k) => {
        b.alive = true;
        b.health = 100;
        b.model.visible = true;
        b.ai.frozen = true;
        const pos = v.bots[k] || [-37 + k, -37];
        place(b, pos[0], pos[1], pos[2] ?? Math.PI);
      });
      game.weapons.giveLoadout(v.primary || 'rifle');
      game.weapons.equip(v.slot || 'primary');
      game.weapons.switchTimer = 0;
      hooks.teleport(v.at[0], v.at[1], v.at[2], v.yaw, v.pitch || 0);
      game.enemies.update(0); // settle bot LOD / visibility for the new camera position
      if (v.zoom) game.weapons.weapon.zoomIndex = v.zoom;
      game._updateHud(0);
      return v.name;
    },
  };

  installMissionHooks(game, hooks, step);
  installWeaponHooks(game, hooks, step);
  game.test = hooks;
}

// ---------------------------------------------------------------------------------------------
// Operation Deep Strike acceptance scenarios (KL city). Async because the city is lazy-loaded.
function installMissionHooks(game, hooks, step) {
  const press = (code) => { game.input.pressed.add(code); game.simulate(DT); game.input.endFrame(); };
  const click = (button = 0) => { game.input.mousePressed.add(button); game.input.mouseButtons.add(button); game.simulate(DT); game.input.mouseButtons.delete(button); game.input.endFrame(); };
  const mm = () => game.mission;

  async function startMission(tod = 'day') {
    Object.assign(game.settings, { mode: 'mission', difficulty: 'normal', timeOfDay: tod, primary: 'rifle' });
    await game.startMatch();
    return game.mission && game.mission.active;
  }

  // Walks the uplink → targeting UI → launch path with real input, then flies the whole sequence.
  function strike(bunkerOrLabel, { warhead = 'unitary', spread = 'tight', track = 'AUTO_TRACE', onTracking = null } = {}) {
    const m = mm();
    game.weapons.equip('special');
    game.weapons.switchTimer = 0;
    click(0); // fire the uplink -> opens targeting
    const opened = m.view === 'targeting';
    const ti = m.targeting;
    const idx = ti.targets.findIndex((t) => t.id === bunkerOrLabel || t.label === bunkerOrLabel);
    if (idx < 0) {
      m.setView('city');
      return { opened, launched: false, error: `target ${bunkerOrLabel} not offered`, states: [], lockStates: new Set(), aimTrail: [], drillMax: 0, cruiseRadius: [] };
    }
    ti.index = idx;
    press('Enter'); // select
    if (warhead !== ti.warhead) press('KeyM');
    if (warhead === 'cluster' && spread !== ti.spread) press('KeyC');
    if (track !== ti.trackMode) press('KeyT');
    press('Enter'); // launch (or request confirmation)
    if (m.view === 'targeting') press('Enter'); // confirm risky launch
    const launched = m.view === 'flight';
    const p = m.projectile;
    const rec = { opened, launched, maxMach: 0, states: [], cruiseRadius: [], waypointHits: 0, split: false, subs: 0, lockStates: new Set(), aimTrail: [] };
    if (!p) return rec;
    const wps = () => p.waypoints || [];
    for (let i = 0; i < 4000 && m.view === 'flight'; i++) {
      game.simulate(DT);
      if (!m.projectile) break;
      rec.maxMach = Math.max(rec.maxMach, p.sm.mach);
      if (p.sm.state === 'CRUISE') rec.cruiseRadius.push(Math.hypot(p.pos.x, p.pos.z));
      if (p.sm.state === 'AUTOPILOT') for (const w of wps().slice(1, -1)) if (p.pos.distanceTo(w) < 25) { w.hit = true; }
      if (p.tracker) {
        rec.lockStates.add(p.tracker.state);
        if (p.tracker.aimPoint) rec.aimTrail.push({ ...p.tracker.aimPoint });
      }
      if (p.split) { rec.split = true; rec.subs = Math.max(rec.subs, p.fx.subs.length); }
      if (p.sm.state === 'TARGET_TRACKING' && onTracking) onTracking(p);
    }
    rec.waypointHits = wps().slice(1, -1).filter((w) => w.hit).length;
    rec.waypointCount = Math.max(0, wps().length - 2);
    rec.corridor = p.corridor;
    rec.lockedId = p.tracker ? p.tracker.lockedId : null;
    rec.decoyInterference = p.tracker ? p.tracker.decoyInterference : false;
    // Drilling plays after a valid impact (unless the mission failed immediately).
    rec.drillMax = 0;
    for (let i = 0; i < 4000 && m.view === 'drilling'; i++) {
      game.simulate(DT);
      if (m.drill && m.drill.model) rec.drillMax = Math.max(rec.drillMax, m.drill.model.depth);
    }
    rec.states = m.lastFlightHistory || (m.projectile ? m.projectile.sm.history : []);
    rec.viewAfter = m.view;
    return rec;
  }

  hooks.runMissionAcceptance = async () => {
    const results = [];
    const ok = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail: String(detail) });
    const p = game.player;

    // 1. City movement
    ok('mission loads the Kuala Lumpur district', await startMission('day') && game.levelId === 'kl', `level=${game.levelId}`);
    const m = mm();
    // Random insertion: no hostile on the same level within 25 m, none with a clear line within 60 m
    const ip = p.body.pos;
    const watchers = game.enemies.bots.filter((b) => b.alive).filter((b) => {
      const q = b.body.pos, d = Math.hypot(q.x - ip.x, q.y - ip.y, q.z - ip.z);
      return (d < 25 && Math.abs(q.y - ip.y) < 3) || (d < 60 && game.collision.lineClear(q.x, q.y + 1.6, q.z, ip.x, ip.y + 1.6, ip.z));
    });
    ok('mission inserts the player out of every hostile\'s sight', watchers.length === 0 && p.spawnGrace > 0, `at ${ip.x.toFixed(0)},${ip.z.toFixed(0)} watchers=${watchers.length}`);
    hooks.teleport(0, 0, 32, 0); // movement check from the classic park start
    const z0 = p.body.pos.z;
    game.input.keys.add('KeyW');
    step(1.5);
    game.input.keys.delete('KeyW');
    ok('1. player moves through the city', z0 - p.body.pos.z > 4, `moved ${(z0 - p.body.pos.z).toFixed(1)} m`);

    // 2. Landmarks
    const towers = game.scene.getObjectByName('twin-towers');
    let top = 0;
    const lods = towers ? towers.children.filter((c) => c.isLOD) : [];
    for (const l of lods) for (const lv of l.levels) lv.object.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); top = Math.max(top, o.geometry.boundingBox.max.y); } });
    ok('2. KLCC Twin Towers present (two LOD towers + skybridge, >180 m with spires)', lods.length === 2 && lods.every((l) => l.levels.length === 2) && top > 180, `towers=${lods.length} top=${top.toFixed(0)}m`);

    // 4. Tracker: nothing revealed at start, reveals with progress
    const discovered0 = m.mission.bunkers.discovered().length;
    const aliveBots = game.enemies.bots.filter((b) => b.alive).length;
    ok('4a. no facilities revealed at start; only hostiles actually seen are tracked', discovered0 === 0 && m.tracker.list().length < aliveBots, `contacts ${m.tracker.list().length}/${aliveBots}`);
    for (const b of game.enemies.bots) b.ai.frozen = true;
    const i1 = game.mapData.intel.find((i) => i.id === 'I1');
    hooks.teleport(i1.pos[0], 0, i1.pos[2] + 1.6, 0);
    press('KeyE');
    ok('4b. collecting intel (E) reveals a facility', m.mission.collected.has('I1') && m.mission.bunkers.get('B-01').discovered, m.mission.log.slice(-1)[0].text);
    const b4 = m.mission.bunkers.get('B-04');
    hooks.teleport(b4.surface.x - 6, 0, b4.surface.z - 8, 0);
    step(3);
    ok('4c. tracker subsurface scan detects (but cannot confirm) a facility', b4.discovered && b4.category === 'unknown', `${b4.category} ${Math.round(b4.confidence * 100)}%`);
    // Contact: a hostile in line of sight becomes CONFIRMED
    const bot = game.enemies.bots.find((x) => x.alive && x.zone === 'park');
    hooks.teleport(0, 0, 30, 0);
    bot.body.pos.x = 0; bot.body.pos.y = 0; bot.body.pos.z = 22;
    step(0.3);
    const contact = m.tracker.contacts.get(bot);
    ok('4d. hostile in line of sight shows as a confirmed tracker contact', contact && contact.status === 'confirmed');

    // 3. Underground cutaway
    press('KeyV');
    const inCut = m.view === 'underground';
    game.renderer.clear(); m.render(game.renderer);
    const labels = m.underground.labels(1280, 720);
    ok('3. underground cutaway shows discovered facilities with depths', inCut && m.underground.labelAnchors.length === m.mission.bunkers.discovered().length && m.underground.labelAnchors.every((a) => /FT/.test(a.text)),
      `anchors=${m.underground.labelAnchors.length} visibleLabels=${labels.length}`);
    press('KeyV');
    ok('3b. cutaway returns to the city view', m.view === 'city');

    // Gather the remaining intel directly (positions already verified reachable by unit tests)
    for (const id of ['I2', 'I3', 'I4']) m.collectIntel(game.mapData.intel.find((i) => i.id === id));
    m.collectIntel({ ...game.mapData.courierIntel, pos: [0, 0, 0] });
    ok('classification: TIGER DEN hostile, SENTINEL protected, MIRAGE decoy, COBRA PIT hostile',
      ['hostile', 'protected', 'decoy', 'hostile'].every((c, i) => m.mission.bunkers.list[i].category === c), m.mission.bunkers.list.map((b) => b.category).join(','));

    // 5–9, 11. Strike B-01 with auto-trace
    hooks.teleport(0, 0, 32, 0);
    const r1 = strike('B-01', { track: 'AUTO_TRACE' });
    const allStates = ['READY', 'TARGET_SELECTED', 'LAUNCH', 'ASCENT', 'HIGH_ALTITUDE_CINEMATIC', 'CRUISE', 'AUTOPILOT', 'TARGET_TRACKING', 'TERMINAL_APPROACH', 'IMPACT', 'IMPACT_RESOLUTION', 'READY'];
    ok('uplink (4 + fire) opens targeting and launches', r1.opened && r1.launched);
    ok('5. projectile transitions through every flight state', JSON.stringify(r1.states) === JSON.stringify(allStates), r1.states.join('>'));
    ok('6. speed display reaches Mach 10', Math.abs(r1.maxMach - 10) < 1e-6, `max ${r1.maxMach.toFixed(2)}`);
    const rad = r1.cruiseRadius;
    ok('7a. auto-cruise follows its scripted arc', rad.length > 30 && rad.every((r) => Math.abs(r - 560) < 1), `${rad.length} samples`);
    ok('7b. autopilot passes its corridor waypoints', r1.waypointHits === r1.waypointCount && r1.waypointCount > 0, `${r1.waypointHits}/${r1.waypointCount} (${r1.corridor})`);
    ok('8a. auto-trace locks onto the designated facility', r1.lockStates.has('LOCKED') && r1.lockedId === 'B-01', `lock=${r1.lockedId}`);
    ok('9. drilling animation reaches the facility depth', Math.abs(r1.drillMax - 240) < 0.01, `${r1.drillMax.toFixed(0)} ft`);
    ok('11. hostile bunker hit applies the mission outcome', m.mission.bunkers.get('B-01').status === 'DESTROYED' && m.view === 'city' && m.mission.objectives().find((o) => o.id === 'primary').done);

    // 8b, 13. Heat-trace at COBRA PIT is pulled onto the hotter MIRAGE decoy
    const intel0 = m.mission.intelPoints, alert0 = m.mission.alert;
    const r2 = strike('B-04', { track: 'HEAT_TRACE' });
    ok('8b. heat-trace locks the strongest thermal signature (decoy interference)', r2.lockedId === 'B-03' && r2.decoyInterference, `lock=${r2.lockedId}`);
    ok('13. decoy hit applies the intelligence penalty and raises alert', m.mission.bunkers.get('B-03').status === 'STRUCK' && m.mission.intelPoints === intel0 - 25 && m.mission.alert > alert0 + 25,
      `intel ${intel0}->${m.mission.intelPoints} alert ${alert0.toFixed(0)}->${m.mission.alert.toFixed(0)}`);

    // 10. Cluster mode → victory
    const r3 = strike('B-04', { warhead: 'cluster', spread: 'tight', track: 'AUTO_TRACE' });
    ok('10. cluster mode splits into sub-projectiles', r3.split && r3.subs === 6, `subs=${r3.subs}`);
    ok('9b. drilling display reaches 300 ft (COBRA PIT)', Math.abs(r3.drillMax - 300) < 0.01, `${r3.drillMax.toFixed(0)} ft`);
    const vicTitle = document.querySelector('.tac-result h1').textContent;
    ok('victory screen after all hostile facilities are neutralized', m.mission.phase === 'VICTORY' && m.view === 'result' && /ACCOMPLISHED/.test(vicTitle), vicTitle);

    // 15. Restart after success
    document.getElementById('btn-mission-restart').click();
    await new Promise((r) => setTimeout(r, 50));
    const m2 = mm().mission;
    ok('15a. restart after victory begins a fresh mission (settings kept)', mm().active && mm().view === 'city' && m2.phase === 'ACTIVE' && m2.bunkers.discovered().length === 0 && game.settings.mode === 'mission');

    // 8c. Heat-trace follows a moving hostile NPC
    const mm2 = mm();
    for (const b of game.enemies.bots) b.ai.frozen = true;
    for (const b of mm2.mission.bunkers.list) { b.discovered = true; b.evidence = 100; }
    const npc = game.enemies.bots.find((b) => b.alive && b.zone === 'park');
    hooks.teleport(0, 0, 32, 0);
    npc.body.pos.x = -10; npc.body.pos.y = 0; npc.body.pos.z = 33;
    step(0.3);
    const npcStart = npc.body.pos.x;
    const r4 = strike(`${npc.name} (hostile contact)`, { track: 'HEAT_TRACE', onTracking: () => { npc.body.pos.x += 0.12; } });
    const xs = r4.aimTrail.map((a) => a.x);
    ok('8c. heat-trace lock follows a moving hostile NPC', r4.lockedId === `npc-${npc.name}` && xs.length > 10 && xs[xs.length - 1] - xs[0] > 5, `lock=${r4.lockedId} aim dx=${(xs[xs.length - 1] - xs[0]).toFixed(1)} npc dx=${(npc.body.pos.x - npcStart).toFixed(1)}`);
    ok('NPC strike eliminates the target without touching facilities', !npc.alive && mm2.mission.bunkers.list.every((b) => b.status === 'INTACT'));

    // 12, 14. Wide cluster on TIGER DEN also reaches the protected SENTINEL post → immediate failure
    const r5 = strike('B-01', { warhead: 'cluster', spread: 'wide' });
    const failTitle = document.querySelector('.tac-result h1').textContent;
    ok('12/14. protected facility hit by any cluster effect → immediate mission failure', mm2.mission.phase === 'FAILED' && mm2.mission.failure.reason === 'PROTECTED_FACILITY_HIT' && /PROTECTED/.test(failTitle),
      `${mm2.mission.phase} · ${failTitle}`);
    ok('14b. failure overrides the hostile destroyed in the same strike', mm2.mission.bunkers.get('B-01').status === 'DESTROYED' && mm2.mission.phase === 'FAILED');
    ok('failure skips drilling (immediate)', r5.drillMax === 0, `drill ${r5.drillMax}`);
    document.getElementById('btn-mission-restart').click();
    await new Promise((r) => setTimeout(r, 50));
    ok('15b. restart after failure begins a fresh mission', mm().active && mm().mission.phase === 'ACTIVE' && mm().view === 'city');

    // Night mode
    game.settings.timeOfDay = 'night';
    game.applySettings('timeOfDay');
    ok('day/night lighting toggles', game.map.night === true && game.map.stars.visible);
    game.settings.timeOfDay = 'day';
    game.applySettings('timeOfDay');
    return results;
  };

  // Puts the mission into a specific presentation state for screenshots (simulation frozen).
  hooks.missionShot = async (name) => {
    game.testFreeze = false;
    if (!game.mission || !game.mission.active || game.state !== 'playing') await startMission('day');
    const m = mm();
    if (m.view !== 'city' && m.view !== 'flight' && m.view !== 'drilling') m.setView('city');
    for (const b of game.enemies.bots) b.ai.frozen = true;
    for (const b of m.mission.bunkers.list) { b.discovered = true; b.evidence = 100; }
    m.undergroundDirty = true;
    const flightTo = (target, state, opts) => {
      if (m.view !== 'city') { if (m.projectile) { m.projectile.finish(); m.projectile = null; } m._restoreWorldCamera(); m.setView('city'); }
      m.mission.strikesUsed = 0;
      game.weapons.equip('special');
      game.weapons.switchTimer = 0;
      click(0);
      const ti = m.targeting;
      ti.index = Math.max(0, ti.targets.findIndex((t) => t.id === target));
      press('Enter');
      ti.warhead = opts && opts.cluster ? 'cluster' : 'unitary';
      ti.spread = 'tight';
      ti.trackMode = 'AUTO_TRACE';
      press('Enter');
      if (m.view === 'targeting') press('Enter');
      for (let i = 0; i < 4000 && m.projectile && m.projectile.sm.state !== state; i++) game.simulate(DT);
      for (let i = 0; i < (opts && opts.extra || 20); i++) { game.simulate(DT); game._updateCamera(); }
    };
    switch (name) {
      case 'towers-day':
      case 'towers-night':
        game.settings.timeOfDay = name.endsWith('night') ? 'night' : 'day';
        game.applySettings('timeOfDay');
        game.weapons.equip('primary');
        hooks.teleport(4, 0, 30, 0, 0.32);
        break;
      case 'street':
        game.settings.timeOfDay = 'day'; game.applySettings('timeOfDay');
        hooks.teleport(-64, 0.15, 34, 0, 0.12);
        break;
      case 'garage-roof':
        hooks.teleport(-86, 12, -10, -Math.PI / 2 - 0.5, 0.05);
        break;
      case 'tunnel':
        hooks.teleport(-20, -8, 46, -Math.PI / 2, 0);
        break;
      case 'mall':
        hooks.teleport(0, 0, -40, 0, 0.05);
        break;
      case 'targeting':
        game.weapons.equip('special'); game.weapons.switchTimer = 0; click(0); press('Enter'); press('KeyM');
        break;
      case 'cutaway':
        press('KeyV');
        break;
      case 'flight-launch': flightTo('B-01', 'LAUNCH', { extra: 90 }); break;
      case 'flight-highalt': flightTo('B-01', 'HIGH_ALTITUDE_CINEMATIC', { extra: 100 }); break;
      case 'flight-cruise': flightTo('B-01', 'CRUISE', { extra: 150 }); break;
      case 'flight-tracking': flightTo('B-04', 'TARGET_TRACKING', { extra: 120 }); break;
      case 'flight-cluster': flightTo('B-04', 'TERMINAL_APPROACH', { cluster: true, extra: 75 }); break;
      case 'impact': flightTo('B-01', 'IMPACT', { extra: 20 }); break;
      case 'drilling': flightTo('B-01', 'IMPACT_RESOLUTION', { extra: 160 }); break;
      case 'failure': {
        if (m.view !== 'city') { if (m.projectile) { m.projectile.finish(); m.projectile = null; } m.setView('city'); }
        m.mission.resolveStrike({ impacts: m.mission.validator.buildImpacts(m.mission.bunkers.get('B-02').surface, 'unitary'), designatedId: 'B-02' });
        m._showResult();
        break;
      }
      default: break;
    }
    game.weapons.switchTimer = 0; // don't freeze mid weapon-draw animation
    game._updateCamera();
    game.enemies.update(0); // settle bot LOD / visibility for the new camera position
    game.hud.clearMessage();
    game._updateHud(0);
    game.testFreeze = true;
    return m.view;
  };

  hooks.unfreeze = () => { game.testFreeze = false; };

  // Named views for the GPU visual probe (scripts/gfx-probe.mjs).
  const DEPOT_VIEWS = { depot: 0, 'depot-pistol': 1, 'depot-shotgun': 2, 'depot-knife': 4, 'depot-platform': 5, 'depot-warehouse': 6, 'depot-alley': 7 };
  hooks.gfxView = async (name) => {
    if (name.startsWith('kl-')) return !!(await hooks.missionShot(name.slice(3)));
    if (!(name in DEPOT_VIEWS)) return false;
    game.testFreeze = false;
    if (game.levelId !== 'depot') await hooks.backToDepot();
    hooks.setView(DEPOT_VIEWS[name]);
    game.hud.clearMessage();
    return true;
  };
  hooks.backToDepot = async () => {
    game.testFreeze = false;
    Object.assign(game.settings, { mode: 'solo', enemyCount: 3 });
    await game.startMatch();
    hooks.prepare();
    return game.levelId;
  };
}

const VIEWS = [
  { name: 'rifle-bots', at: [0, 0, 33], yaw: 0, primary: 'rifle', bots: [[-2.5, 26.5, Math.PI], [0.5, 24, Math.PI - 0.4], [3, 27, Math.PI + 0.6]] },
  { name: 'pistol', at: [8, 0, 23], yaw: 0, slot: 'secondary', bots: [[8, 15, Math.PI]] },
  { name: 'shotgun', at: [-20, 0, 18], yaw: 0.3, primary: 'shotgun', bots: [[-22, 10, Math.PI]] },
  { name: 'sniper-scoped', at: [0, 0, 33], yaw: 0, primary: 'sniper', zoom: 1, bots: [[0, -16, Math.PI]] },
  { name: 'knife', at: [-34, 0, 18], yaw: 0, slot: 'melee', bots: [[-34, 12, Math.PI]] },
  { name: 'platform-overview', at: [37, 3, 4], yaw: Math.PI / 2 + 0.3, pitch: -0.12, primary: 'rifle', bots: [[20, 2, -Math.PI / 2], [17, -10, -Math.PI / 2]] },
  { name: 'warehouse-interior', at: [0, 0, 10], yaw: 0, primary: 'rifle', bots: [[-3, 3, Math.PI], [5, -3, Math.PI + 0.5]] },
  { name: 'west-alley', at: [-34, 0, 22], yaw: 0, primary: 'rifle', bots: [[-33, 4, Math.PI]] },
];
