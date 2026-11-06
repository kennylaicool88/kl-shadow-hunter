// Operation Deep Strike: connects the mission systems to the existing FPS game loop.
// Game.js delegates to this object (simulate/camera/render/HUD hooks) while the mission is active;
// the FPS player, weapons, bots, collision and audio are the same systems used by the Training Depot.
import * as THREE from 'three';
import { MissionManager, MISSION_PHASE } from './MissionManager.js';
import { FAILURE } from './MissionRules.js';
import { TerroristTracker } from '../tracking/TerroristTracker.js';
import { BUNKER_TYPES, CATEGORY_STYLE } from '../tracking/TargetClassification.js';
import { TacticalHUD } from '../ui/TacticalHUD.js';
import { TargetingInterface } from '../ui/TargetingInterface.js';
import { UndergroundView } from '../underground/UndergroundView.js';
import { DrillingSequence } from '../underground/DrillingSequence.js';
import { SciFiProjectile } from '../weapons/SciFiProjectile.js';
import { Weapon } from '../weapons/Weapon.js';
import { GameState } from '../game/GameState.js';

const _v = new THREE.Vector3();
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class MissionMode {
  constructor(game) {
    this.game = game;
    this.level = game.mapData;
    this.active = false;
    this.view = 'city';
    const root = document.getElementById('game-root');
    this.hud = new TacticalHUD(root, this.level);
    this.hud.handlers.restart = () => { game.audio.init(); game.startMatch(); };
    this.hud.handlers.menu = () => game.quitToMenu();
    this.targeting = new TargetingInterface(this.hud.root);
    this.targeting.onSelect = (t) => this._designate(t);
    this.targeting.onLaunch = (cfg) => this.launchStrike(cfg);
    this.targeting.onClose = () => this.setView('city');
    this.underground = new UndergroundView(this.level);
    this.drill = null; // created on first strike
    this.projectile = null;
    this.lastDt = 1 / 60;
    game.weapons.world.onSpecialFire = () => this.openTargeting();
  }

  // ------------------------------------------------------------------ lifecycle
  start() {
    const g = this.game;
    if (this.projectile) { this.projectile.finish(); this.projectile = null; }
    this._restoreWorldCamera();
    this.mission = new MissionManager(this.level, { strikes: 3 });
    this.tracker = new TerroristTracker(this.mission, g.collision, this.level);
    this.mission.on((type) => {
      if (type === 'bunker') this.undergroundDirty = true;
      if (type === 'intel') g.audio.intelChime();
    });
    // Reset world props
    for (const id of [...g.map.intelMeshes.keys()]) g.map.removeIntel(id);
    for (const it of this.level.intel) g.map.addIntel(it);
    for (const m of g.map.impactMarks) { g.map.group.remove(m); m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); }
    g.map.impactMarks = [];
    this.extraIntel = [];
    this.reinforcements = 0;
    // Safe targeting defaults for every new mission.
    this.targeting.warhead = 'unitary';
    this.targeting.spread = 'tight';
    this.targeting.trackMode = 'AUTO_TRACE';
    this.resultShown = false;
    this.resultTimer = 0;
    this.undergroundDirty = true;
    // Player & bots
    g.enemies.setupMission(this.level, g.settings.difficulty);
    g.pickups.clear();
    g.effects.reset();
    g.player.reset(this.level.playerStart, 0);
    g.player.kills = 0;
    g.player.deaths = 0;
    g.player.armor = 50;
    g.weapons.giveLoadout(g.settings.primary);
    g.weapons.slots.special = new Weapon('uplink');
    g.weapons.stats = { shots: 0, hits: 0 };
    g.matchStats = { headshots: 0 };
    g.gs = new GameState({ roundTime: 1e9 });
    g.gs.phase = 'live';
    g.gs.timer = 1e9;
    g.controller.frozen = false;
    g.deathCam.active = false;
    g.buyOpen = false;
    g.hud.reset();
    g.hud.show();
    document.getElementById('hud').classList.add('mission-mode');
    this.hud.show();
    g.menu.hideAll();
    g.state = 'playing';
    this.active = true;
    this.setView('city');
    g.audio.startAmbience(g.settings.timeOfDay === 'night');
    g._lock();
    this.hud.flash('OPERATION DEEP STRIKE · KLCC district · locate the hostile command bunkers', 5);
  }

  stop() {
    this.active = false;
    if (this.projectile) { this.projectile.finish(); this.projectile = null; }
    this._restoreWorldCamera();
    this.targeting.hide();
    this.hud.hide();
    document.getElementById('hud').classList.remove('mission-mode', 'mission-overlay');
    this.game.audio.stopAmbience();
    this.game.audio.drill(false);
  }

  setView(view) {
    this.view = view;
    this.hud.setMode(view === 'city' ? 'city' : view);
    document.getElementById('hud').classList.toggle('mission-overlay', view !== 'city');
    if (view !== 'targeting') this.targeting.hide();
    this.game.weapons.enabled = view === 'city';
  }

  blocksWorld() {
    return this.view !== 'city';
  }

  hidesViewModel() {
    return this.view !== 'city';
  }

  // ------------------------------------------------------------------ city interaction
  _nearestIntel() {
    const p = this.game.player.body.pos;
    let best = null, bd = 2.3;
    for (const it of [...this.level.intel, ...this.extraIntel]) {
      if (this.mission.collected.has(it.id)) continue;
      const d = Math.hypot(it.pos[0] - p.x, it.pos[2] - p.z);
      if (d < bd && Math.abs(it.pos[1] - p.y) < 2.2) { bd = d; best = it; }
    }
    return best;
  }

  interactionHint() {
    if (this.view !== 'city') return '';
    const it = this._nearestIntel();
    return it ? `Press E to collect intel: ${it.name}` : '';
  }

  // Called before the player controller each city frame. Returns true if it consumed input.
  handleInput() {
    const input = this.game.input;
    if (input.wasPressed('KeyV')) {
      input.pressed.delete('KeyV'); // the cutaway must not see the same press and close again
      this.openUnderground();
      return true;
    }
    if (input.wasPressed('KeyE')) {
      const it = this._nearestIntel();
      if (it) {
        input.pressed.delete('KeyE'); // don't also pick up a weapon
        this.collectIntel(it);
        return true;
      }
    }
    return false;
  }

  collectIntel(it) {
    if (!this.mission.collectIntel(it)) return false;
    this.game.map.removeIntel(it.id);
    this.hud.flash(`INTEL ACQUIRED · ${it.name}`, 3, 'good');
    return true;
  }

  onKill(victim, info) {
    if (victim === this.game.player) {
      this.mission.fail(FAILURE.PLAYER_KIA, `Operative killed in action${info.attacker ? ` by ${info.attacker.name}` : ''}.`);
      return;
    }
    if (victim.courier && !this.mission.collected.has(this.level.courierIntel.id)) {
      const p = victim.body.pos;
      const def = { ...this.level.courierIntel, pos: [p.x, p.y + 0.2, p.z] };
      this.extraIntel.push(def);
      this.game.map.addIntel(def);
      this.mission.addLog('The courier dropped a briefcase.', 'intel');
    }
  }

  // ------------------------------------------------------------------ views
  openUnderground() {
    this.setView('underground');
    if (this.undergroundDirty || !this.underground.built) {
      this.underground.refresh(this.mission);
      this.undergroundDirty = false;
    }
  }

  openTargeting() {
    if (!this.active || this.view !== 'city' || !this.mission.active) return;
    if (this.mission.strikesRemaining <= 0) { this.hud.flash('No strike assets remaining', 2.5, 'bad'); return; }
    const targets = this.mission.bunkers.list
      .filter((b) => b.discovered && b.status === 'INTACT')
      .map((b) => ({ kind: 'bunker', id: b.id, bunker: b, label: `${b.id} ${b.name}` }));
    for (const c of this.tracker.confirmedContacts()) {
      targets.push({ kind: 'npc', id: `npc-${c.bot.name}`, bot: c.bot, label: `${c.bot.name} (hostile contact)` });
    }
    this.game.input.mousePressed.clear(); // the click that opened the panel must not also select a target
    this.setView('targeting');
    this.targeting.show(targets);
  }

  _designate(t) {
    this.tracker.designated = { kind: t.kind, id: t.kind === 'bunker' ? t.id : t.id, name: t.label };
    this.mission.addLog(`Target designated: ${t.label}.`, 'info');
  }

  _preview(t, warhead, spread) {
    const aim = t.kind === 'bunker' ? t.bunker.surface : { x: t.bot.body.pos.x, z: t.bot.body.pos.z };
    const strike = { impacts: this.mission.validator.buildImpacts(aim, warhead, spread) };
    return this.mission.validator.preview(strike, this.mission.bunkers.list);
  }

  // ------------------------------------------------------------------ strike
  launchStrike(cfg) {
    const g = this.game;
    const t = cfg.target;
    const target = t.kind === 'bunker'
      ? { kind: 'bunker', id: t.id, label: t.label, getPos: () => ({ x: t.bunker.surface.x, y: 0.5, z: t.bunker.surface.z }) }
      : { kind: 'npc', id: t.id, label: t.label, getPos: () => ({ x: t.bot.body.pos.x, y: t.bot.body.pos.y + 1, z: t.bot.body.pos.z }) };
    this.strikeCfg = cfg;
    this.mission.addLog(`DEEP STRIKE launched at ${t.label} · ${cfg.warhead.toUpperCase()}${cfg.warhead === 'cluster' ? ` (${cfg.spread})` : ''} · ${cfg.trackMode.replace('_', '-')}.`, 'strike');
    this.projectile = new SciFiProjectile(
      { scene: g.scene, collision: g.collision, level: this.level, audio: g.audio },
      {
        target, warhead: cfg.warhead, spread: cfg.spread, trackMode: cfg.trackMode, durations: this.flightDurations,
        getSignatures: () => this._signatures(),
        interference: (time) => (this.mission.alert > 40 && Math.sin(time * 3.1) > 0.9 ? 0.8 : 0),
        onTerminal: (aim) => this.mission.validator.buildImpacts(aim, cfg.warhead, cfg.spread),
        onImpact: (info) => this._onImpact(info),
        onTrackEvent: (e) => {
          if (e.type === 'decoy-interference') this.mission.addLog('Seeker: decoy interference detected.', 'warning');
          if (e.type === 'lock-switched') this.mission.addLog(`Seeker: lock switched to signature ${e.to}.`, 'warning');
          if (e.type === 'lock-lost') this.mission.addLog('Seeker: lock lost — reacquiring.', 'warning');
          if (e.type === 'locked') this.mission.addLog(`Seeker: lock acquired on ${e.id}.`, 'info');
        },
      },
    );
    // Long view distances for the high-altitude cinematic.
    this._savedFog = g.scene.fog ? { near: g.scene.fog.near, far: g.scene.fog.far } : null;
    if (g.scene.fog) { g.scene.fog.near = 900; g.scene.fog.far = 6500; }
    g.camera.far = 7000;
    g.camera.updateProjectionMatrix();
    this.setView('flight');
  }

  // Simulated signatures visible to the seeker (physical world, independent of what the player knows).
  _signatures() {
    const out = [];
    for (const b of this.mission.bunkers.list) {
      if (b.status === 'DESTROYED') continue;
      out.push({ id: b.id, pos: { x: b.surface.x, y: 0.5, z: b.surface.z }, heat: b.heat, decoy: b.trueType === BUNKER_TYPES.DECOY });
    }
    for (const bot of this.game.enemies.bots) {
      if (!bot.alive || bot.team === this.game.player.team) continue;
      out.push({ id: `npc-${bot.name}`, pos: { x: bot.body.pos.x, y: bot.body.pos.y + 1, z: bot.body.pos.z }, heat: 0.45 });
    }
    return out;
  }

  _onImpact(info) {
    const g = this.game;
    const cfg = this.strikeCfg;
    for (const imp of info.impacts) g.map.markImpact(imp.x, imp.z, imp.radius);
    // Abstract area effect on surface hostiles (game-defined damage, routed through the normal damage path).
    const npcHits = [];
    for (const bot of g.enemies.bots) {
      if (!bot.alive || bot.team === g.player.team) continue;
      const hit = info.impacts.some((imp) => Math.hypot(bot.body.pos.x - imp.x, bot.body.pos.z - imp.z) < imp.radius + 2 && bot.body.pos.y > -2);
      if (hit) {
        g.dealDamage(bot, 9999, { attacker: g.player, part: 'body', armorRatio: 1, weaponId: 'deepstrike', weaponName: 'Deep Strike' });
        npcHits.push(bot.name);
      }
    }
    // Central validation of every effect (protected rules enforced here).
    const res = this.mission.resolveStrike({
      impacts: info.impacts, designatedId: cfg.target.kind === 'bunker' ? cfg.target.id : null,
      warhead: cfg.warhead, trackMode: cfg.trackMode, lockedId: info.lockedId,
    });
    this.lastStrike = { info, res, npcHits };
    const lines = [];
    lines.push(`Seeker lock: <b>${info.lockedId || 'none'}</b>${info.fallback ? ' (nav fallback)' : ''}`);
    lines.push(`Effects: <b>${info.impacts.length}</b> (${cfg.warhead})`);
    for (const o of res.outcomes) {
      const c = { DESTROYED: '#46e08a', DECOY_HIT: '#a78bfa', PROTECTED_HIT: '#e5483b', UNRESOLVED: '#f0b429' }[o.result];
      lines.push(`<span style="color:${c}">${o.bunkerId} ${o.name}: ${o.result.replace('_', ' ')}</span>${o.notes.length ? ` <i>${o.notes.join('; ')}</i>` : ''}`);
    }
    if (!res.outcomes.length) lines.push('No facility inside the effect area.');
    if (npcHits.length) lines.push(`Hostiles affected: ${npcHits.join(', ')}`);
    this.impactLines = lines;

    if (res.failure) {
      // Protected facility hit: immediate failure, overriding everything else.
      g.audio.alarm();
      this._endFlight();
      this._showResult();
      return;
    }
    const primaryOutcome = res.outcomes.find((o) => o.bunkerId === cfg.target.id) || res.outcomes[0];
    const bunker = primaryOutcome ? this.mission.bunkers.get(primaryOutcome.bunkerId) : null;
    if (!this.drill) this.drill = new DrillingSequence(g.assets);
    g.audio.drill(true);
    this.drill.start(bunker ? bunker.depthFt : 40, bunker, () => {
      g.audio.drill(false);
      this.drillHold = 2.2;
    });
    this.drillBunker = bunker;
    this.drillHold = -1;
    this.setView('drilling');
  }

  _endFlight() {
    if (this.projectile) {
      if (this.projectile.state === 'IMPACT_RESOLUTION') this.projectile.sm.completeResolution();
      this.lastFlightHistory = [...this.projectile.sm.history];
      this.projectile.finish();
      this.projectile = null;
    }
    this._restoreWorldCamera();
  }

  _restoreWorldCamera() {
    const g = this.game;
    if (g.pipeline) g.pipeline.setCinematic(null);
    if (this._savedFog && g.scene.fog) { g.scene.fog.near = this._savedFog.near; g.scene.fog.far = this._savedFog.far; this._savedFog = null; }
    g.camera.far = 600;
    g.camera.updateProjectionMatrix();
  }

  _finishStrike() {
    this._endFlight();
    this.game.audio.drill(false);
    this.undergroundDirty = true;
    if (this.mission.phase !== MISSION_PHASE.ACTIVE) { this._showResult(); return; }
    this.setView('city');
    this.game.weapons.equip(this.game.weapons.slots.primary ? 'primary' : 'secondary');
    this.hud.flash('Strike resolved · see the intelligence log and the cutaway [V]', 4);
  }

  _showResult() {
    if (this.resultShown) return;
    this.resultShown = true;
    const g = this.game;
    const m = this.mission;
    const victory = m.phase === MISSION_PHASE.VICTORY;
    if (victory) g.recordMissionWin?.();
    const f = m.failure;
    let title = victory ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED';
    let reason = '';
    if (f && f.reason === FAILURE.PROTECTED_HIT) {
      title = 'MISSION FAILED · PROTECTED FACILITY HIT';
      reason = `<p class="fail-reason">${f.detail} SENTINEL is an allied surveillance post protected by the rules of engagement.
        Striking it ends the mission immediately and overrides any other result of the strike.</p>`;
    } else if (f) {
      reason = `<p class="fail-reason">${f.detail}</p>`;
    }
    const facilities = m.bunkers.list.map((b) => {
      const st = CATEGORY_STYLE[b.category];
      return `<div style="color:${st.color}">${st.icon} ${b.id} ${b.name} · ${b.trueType.replace('_BUNKER', '')} · ${b.status}</div>`;
    }).join('');
    this.hud.showResult(victory, title, `${reason}
      <div class="res-grid">
        <div><span>Mission time</span><b>${fmtTime(m.time)}</b></div>
        <div><span>Score</span><b>${m.score}</b></div>
        <div><span>Intel points</span><b>${m.intelPoints}</b></div>
        <div><span>Strikes used</span><b>${m.strikesUsed}/${m.strikesTotal}</b></div>
        <div><span>Hostiles eliminated</span><b>${g.player.kills}</b></div>
        <div><span>Enemy alert</span><b>${Math.round(m.alert)}%</b></div>
      </div>
      <div class="res-fac">${facilities}</div>
      <div class="muted small">Settings are kept. Restart replays the mission from the insertion point.</div>`);
    this.view = 'result';
    document.getElementById('hud').classList.add('mission-overlay');
    g.weapons.enabled = false;
    g.state = 'over';
    g.input.exitLock();
  }

  // ------------------------------------------------------------------ per-frame
  update(dt) {
    this.lastDt = dt;
    const g = this.game;
    const input = g.input;
    switch (this.view) {
      case 'city': {
        this.mission.update(dt);
        this.tracker.update(dt, g.player, g.enemies.bots);
        this._alertEffects();
        if (this.mission.phase !== MISSION_PHASE.ACTIVE) {
          this.resultTimer += dt;
          if (this.resultTimer > (g.player.alive ? 0.5 : 2.5)) this._showResult();
        }
        break;
      }
      case 'targeting': {
        this.mission.update(dt);
        input.consumeMouse();
        this.targeting.handleInput(input, (t, w, s) => this._preview(t, w, s));
        if (input.wasPressed('Escape')) this.setView('city');
        break;
      }
      case 'underground':
        this.mission.update(dt);
        this.underground.handleInput(input, dt);
        if (input.wasPressed('KeyV') || input.wasPressed('KeyQ')) this.setView('city');
        break;
      case 'flight':
        input.consumeMouse();
        if (this.projectile) this.projectile.update(dt);
        break;
      case 'drilling':
        input.consumeMouse();
        if (this.projectile) this.projectile.update(dt); // impact effects keep animating in the world
        if (this.drill) this.drill.update(dt);
        if (this.drillHold >= 0) {
          this.drillHold -= dt;
          if (this.drillHold <= 0) this._finishStrike();
        }
        break;
      default:
        break;
    }
  }

  _alertEffects() {
    const m = this.mission;
    const spawns = this.level.reinforcementSpawns;
    if (this.reinforcements < 2 && m.alert >= 60) {
      for (let i = 0; i < 2; i++) this.game.enemies.spawnReinforcement(spawns[(this.reinforcements * 2 + i) % spawns.length], 'tunnel');
      this.reinforcements = 2;
      m.addLog('Enemy reinforcements are moving in.', 'warning');
    } else if (this.reinforcements < 3 && m.alert >= 85) {
      this.game.enemies.spawnReinforcement(spawns[2], 'yard');
      this.reinforcements = 3;
      m.addLog('High alert: additional hostiles deployed.', 'warning');
    }
  }

  updateCamera(camera) {
    if ((this.view === 'flight' || this.view === 'drilling') && this.projectile) {
      this.projectile.updateCamera(camera, this.lastDt);
      // Depth of field only for the scripted flight cameras, focused on the projectile.
      // Seeker views (tracking/terminal) focus on the target so the outcome stays readable.
      const st = this.projectile.state;
      const seeker = st === 'TARGET_TRACKING' || st === 'TERMINAL_APPROACH';
      if (this.view === 'flight' && this.game.pipeline) this.game.pipeline.setCinematic(camera.position.distanceTo(seeker ? this.projectile.aim : this.projectile.pos));
      return true;
    }
    if (this.game.pipeline) this.game.pipeline.setCinematic(null);
    return false;
  }

  render(renderer) {
    const aspect = window.innerWidth / window.innerHeight;
    if (this.view === 'underground') {
      this.underground.render(renderer, this.game.player, aspect);
      return true;
    }
    if (this.view === 'drilling' && this.drill) {
      this.drill.render(renderer, aspect);
      return true;
    }
    return false;
  }

  updateHud(dt) {
    const g = this.game;
    this.hud.update(dt);
    const hints = {
      city: '<b>4</b> Deep Strike uplink · <b>V</b> underground cutaway · <b>E</b> collect intel · <b>5</b> grenades · <b>6</b> gear · hold <b>Q</b> wheel',
      targeting: '<b>W/S</b> choose · <b>Enter</b> select / launch · <b>M</b> warhead · <b>C</b> spread · <b>T</b> seeker · <b>Q</b> back',
      underground: '<b>Mouse</b> orbit · <b>Wheel</b> zoom · <b>WASD</b> pan · <b>V</b> return',
      flight: 'Cinematic flight · fictional presentation (time compressed)',
      drilling: 'Fictional drilling cinematic',
      result: '',
    };
    this.hud.setHint(hints[this.view] || '');
    if (this.view === 'city') {
      // Canvas redraws are throttled to 12 Hz: re-uploading/compositing them every frame cost ~40% of the
      // frame on integrated GPUs (measured with scripts/gfx-cost.mjs).
      this._mapTimer = (this._mapTimer || 0) - dt;
      if (this._mapTimer <= 0) {
        this._mapTimer = 1 / 12;
        this.hud.drawMinimap(g.player, this.tracker, this.mission);
        this.hud.drawRadar(g.player, this.tracker, this.mission, this.mission.time);
      }
      this.hud.updateCityPanels(dt, this.mission, this.tracker);
    } else if (this.view === 'targeting') {
      this.targeting.render(this.mission, (t, w, s) => this._preview(t, w, s), this.mission.strikesRemaining);
    } else if (this.view === 'underground') {
      this.hud.updateUnderground(this.mission, this.underground.labels(window.innerWidth, window.innerHeight));
    } else if (this.view === 'flight' && this.projectile) {
      const tel = this.projectile.telemetry();
      const tr = this.projectile.tracker;
      let lock = null;
      if (tr && (tel.state === 'TARGET_TRACKING' || tel.state === 'TERMINAL_APPROACH')) {
        _v.copy(this.projectile.aim).project(g.camera);
        lock = { visible: _v.z < 1, x: (_v.x * 0.5 + 0.5) * window.innerWidth, y: (-_v.y * 0.5 + 0.5) * window.innerHeight, label: tr.lockedId || tr.candidateId || 'SEARCHING' };
      }
      this.hud.updateFlight(tel, tr, lock);
    } else if (this.view === 'drilling' && this.drill && this.drill.model) {
      const st = this.drill.model.breached ? '<b style="color:#46e08a">FACILITY SHELL REACHED</b>' : `Penetrating ${this.drill.model.layer.name}`;
      this.hud.updateDrill(this.drill.model, this.drillBunker, [st, ...(this.impactLines || [])]);
    }
  }
}
