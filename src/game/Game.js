// Top-level game orchestrator: owns the renderer, world, player, bots, round flow and UI.
import * as THREE from 'three';
import { buildMapData } from '../maps/mapData.js';
import { TrainingMap } from '../maps/TrainingMap.js';
import { CollisionSystem } from '../physics/CollisionSystem.js';
import { InputManager } from '../utils/InputManager.js';
import { Player } from '../player/Player.js';
import { PlayerController } from '../player/PlayerController.js';
import { WeaponManager } from '../weapons/WeaponManager.js';
import { Effects } from '../weapons/Effects.js';
import { Pickups } from '../weapons/Pickups.js';
import { PRIMARIES, WEAPONS, getWeaponConfig } from '../weapons/weaponConfigs.js';
import { ThrowableSystem } from '../weapons/Throwables.js';
import { EquipmentSystem } from '../equipment/Equipment.js';
import { SurveillanceSystem } from '../world/Surveillance.js';
import { DEFAULT_LOADOUT, sanitizeLoadout, THROWABLES } from '../weapons/equipmentData.js';
import { arsenalEntry, isUnlocked } from '../weapons/arsenal.js';
import { LoadoutMenu } from '../ui/LoadoutMenu.js';
import { WeaponIcons } from '../ui/WeaponIcons.js';
import { saveSettings, loadLoadoutRaw, saveLoadoutRaw, loadProgress, saveProgress } from './Settings.js';
import { EnemyManager } from '../enemies/EnemyManager.js';
import { AudioManager } from '../audio/AudioManager.js';
import { HUD } from '../ui/HUD.js';
import { Menu } from '../ui/Menu.js';
import { GameState } from './GameState.js';
import { installTestHooks } from './testHooks.js';
import { AssetLibrary } from '../render/AssetLibrary.js';
import { RenderPipeline, QUALITY, detectQuality } from '../render/RenderPipeline.js';
import '../render/Atmosphere.js'; // patches the fog shader chunks before any material compiles
import { WeatherSystem } from '../world/Weather.js';

const _fwd = new THREE.Vector3();
const _mk = new THREE.Vector3();
const TEAM_NAME = { A: 'Alpha', B: 'Bravo' };

export class Game {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.state = 'menu'; // menu | playing | paused | over
    this.debugNoLock = new URLSearchParams(location.search).has('nolock');

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false; // counted per frame (post-processing renders several passes)
    // Skipping the synchronous link-status query lets parallel shader compiles finish off-thread.
    this.renderer.debug.checkShaderErrors = false;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xcbbd9f, 70, 190);
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 600);
    this.camera.rotation.order = 'YXZ';

    // Shared asset pipeline + one render path (tone mapping, shadows, post-processing presets).
    this.gpuInfo = detectQuality(this.renderer);
    if (!QUALITY[settings.graphics] && settings.graphics !== 'auto') settings.graphics = 'auto';
    this.assets = new AssetLibrary(this.renderer);
    this.pipeline = new RenderPipeline(this.renderer, this.scene, this.camera);
    this.quality = this.pipeline.setQuality(this.presetName());
    this.exposure = 1;
    this.drs = { scale: 1, ema: 16, timer: 0 }; // dynamic resolution scaling state

    this.levelId = 'depot';
    this.mission = null; // MissionMode (loaded on demand with the KL city)
    this.mapData = buildMapData();
    this.collision = new CollisionSystem(this.mapData.solids);
    this.map = null; // built in init() once assets are loaded

    this.input = new InputManager(canvas);
    this.audio = new AudioManager(settings.volume);
    this.effects = new Effects(this.scene);
    this.pickups = new Pickups(this.scene, this.collision);
    this.hud = new HUD();
    this.menu = new Menu(settings);
    this.gs = new GameState();

    this.player = new Player();
    this.controller = new PlayerController(this.player, this.input, this.collision, settings);
    this.enemies = new EnemyManager(this);

    // Loadout (persisted) + unlock progress, throwables, tactical equipment, hostile cameras.
    this.progress = loadProgress();
    this.loadout = sanitizeLoadout(loadLoadoutRaw(), (id, slot) => !!WEAPONS[id] && WEAPONS[id].slot === slot);
    settings.primary = this.loadout.primary;
    this.throwables = new ThrowableSystem(this);
    this.equipment = new EquipmentSystem(this);
    this.surveillance = new SurveillanceSystem(this);
    this.weather = new WeatherSystem(this);
    this.shakeT = 0;
    this.shakeAmp = 0;

    this.weapons = new WeaponManager(this.player, this.controller, this.input, this.camera, settings, {
      collision: this.collision,
      effects: this.effects,
      audio: this.audio,
      hud: this.hud,
      pickups: this.pickups,
      scene: this.scene,
      throwables: this.throwables,
      equipment: this.equipment,
      getTargets: (shooter) => this.getTargets(shooter),
      dealDamage: (target, raw, info) => this.dealDamage(target, raw, info),
      onNoise: (pos, radius, source) => this.enemies.noise(pos, radius, source),
    });
    this.weapons.setLoadout(this.loadout);
    this.icons = new WeaponIcons(this.renderer);
    this.hud.icons = this.icons;
    this.hud.onFlash = (strength, duration) => { if (strength > 0.3) this.audio.ringing(duration, strength); };
    this.loadoutMenu = new LoadoutMenu(this);

    this.buyOpen = false;
    this.deathCam = { active: false, time: 0, killer: null, yaw: 0, pitch: 0 };
    this.matchStats = { headshots: 0 };

    this._bindMenu();
    this._bindInput();
    this._bindPlayerEvents();
    window.addEventListener('resize', () => this.resize());
    this.resize();

    installTestHooks(this);
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.clock = new THREE.Clock();
  }

  // Effective preset ('auto' resolves from the detected GPU).
  presetName() {
    return this.settings.graphics === 'auto' ? this.gpuInfo.preset : this.settings.graphics;
  }

  // Loads shared assets (textures, HDRI, models) and builds the starting level, then starts the loop.
  async init() {
    this.menu.setLoading('Loading assets…');
    this.assets.anisotropy = this.quality.aniso;
    await this.assets.init();
    await Promise.all([
      this.assets.loadTextureSets(['hangar_floor', 'concrete', 'brick', 'corrugated', 'rusty_metal', 'metal_plate']),
      this.assets.loadHDRI('day'),
      this.assets.loadModels(['barrel', 'pistol', 'bolt_rifle', 'soldier', 'wooden_crate', 'binoculars', 'ammo_box', 'medical_box', 'flashlight', 'security_camera']),
    ]);
    this.map = new TrainingMap(this.scene, this.mapData, this.presetName(), this.assets);
    this.weapons.setAssets(this.assets);
    this.weapons.renderer = this.renderer;
    this.enemies.setAssets(this.assets);
    this.surveillance.setLevel('depot');
    this.weather.apply(true);
    this._updateLoadoutSummary();
    this.menu.setLoading('Compiling shaders…');
    await this.precompile();
    this.menu.setLoading('');
    this.renderer.setAnimationLoop(() => this.frame());
    return this;
  }

  // Shader programs are compiled off the main thread (KHR_parallel_shader_compile) so the first
  // frames after a level loads don't stall; every scene light already exists at this point.
  // While it runs the world isn't drawn (the last frame stays up): drawing would force the same
  // programs to compile synchronously and freeze the tab for seconds on some drivers.
  async precompile() {
    this.compiling = (this.compiling || 0) + 1;
    const cap = new Promise((r) => setTimeout(r, 8000)); // never hold rendering longer than this
    try {
      await Promise.race([cap, (async () => {
        await this.renderer.compileAsync(this.scene, this.camera);
        await this.renderer.compileAsync(this.weapons.viewScene, this.weapons.viewCamera);
      })()]);
    } catch (err) { console.warn('[render] precompile', err.message); }
    this.compiling--;
  }

  // ------------------------------------------------------------------ wiring
  _bindMenu() {
    this.menu.on('play', () => { this.audio.init(); this.startMatch(); });
    this.menu.on('resume', () => { this.audio.init(); this.resume(); });
    this.menu.on('restart', () => { this.audio.init(); this.startMatch(); });
    this.menu.on('quit', () => this.quitToMenu());
    this.menu.on('settingsChanged', (s, key) => this.applySettings(key));
    this.menu.on('loadout', (from) => this.openArmory(from));
  }

  // ------------------------------------------------------------------ loadout / armory
  openArmory(mode) {
    if (mode === 'armory') {
      this.armoryOpen = true;
      this.buyOpen = false;
      this.hud.setBuyMenu(false);
      this.input.exitLock();
      this.loadoutMenu.open('armory', () => { this.armoryOpen = false; this.input.clear(); if (this.state === 'playing') this._lock(); });
      return;
    }
    const back = mode === 'pause' ? 'pause' : 'main';
    this.menu.hideAll();
    this.loadoutMenu.open(mode, () => { this._updateLoadoutSummary(); this.menu.show(back); });
  }

  saveLoadout() {
    saveLoadoutRaw(this.loadout);
    this.weapons.setLoadout(this.loadout);
    this._updateLoadoutSummary();
  }

  saveSettings() { saveSettings(this.settings); }

  _updateLoadoutSummary() {
    const L = this.loadout;
    this.menu.setLoadoutSummary(`${getWeaponConfig(L.primary).name} · ${getWeaponConfig(L.secondary).name} · ${L.grenades.length} grenade types · ${L.equipment.length} gear`);
  }

  // Armory changes during buy time (or mission field resupply) apply to the carried kit immediately.
  onLoadoutChanged(mode, what, id) {
    this.weapons.setLoadout(this.loadout);
    const live = mode === 'armory' || (mode === 'pause' && this.mission && this.mission.active);
    if (!live || !this.player.alive) return;
    const w = this.weapons;
    if (what === 'primary' || what === 'secondary') w.give(id, null, this.loadout.attachments[id] || {});
    else if (what === 'attachment') w.reattach(id, this.loadout.attachments[id] || {});
    else if (what === 'grenades' || what === 'equipment') w.refreshGear(this.loadout);
  }

  recordKill() {
    this.progress.kills++;
    saveProgress(this.progress);
  }

  recordMissionWin() {
    this.progress.missions++;
    saveProgress(this.progress);
  }

  // Camera shake from nearby explosions.
  shake(pos, radius, amp) {
    const p = this.player.body.pos;
    const d = Math.hypot(p.x - pos.x, p.y - pos.y, p.z - pos.z);
    if (d > radius) return;
    this.shakeAmp = Math.max(this.shakeAmp, amp * (1 - d / radius));
    this.shakeT = 0.6;
  }

  _bindInput() {
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.debugNoLock && !this.armoryOpen) this.pause();
    };
    this.input.onLockError = () => {
      this.menu.setResumeHint('The browser refused mouse lock (wait a second after pressing Esc), then click Resume.');
      if (this.state === 'playing') this.pause();
    };
  }

  _bindPlayerEvents() {
    const c = this.controller;
    c.events.footstep = (loud) => {
      this.audio.footstep(null, loud);
      if (loud) this.enemies.noise(this.player.body.pos, 14, this.player);
    };
    c.events.jump = () => this.audio.jump();
    c.events.land = (v) => this.audio.land(v);
    c.events.fallDamage = (dmg) => this.dealDamage(this.player, dmg, { attacker: null, part: 'legs', armorRatio: 1, weaponName: 'fall' });
    this.player.onDamaged = (amount, info) => {
      this.audio.playerHurt();
      let angle = null;
      if (info.attacker && info.attacker.body) {
        const a = info.attacker.body.pos;
        const p = this.player.body.pos;
        const world = Math.atan2(-(a.x - p.x), -(a.z - p.z)); // yaw that would face the attacker
        angle = -(world - this.player.yaw);
      }
      this.hud.showDamage(amount, angle);
    };
  }

  applySettings(key) {
    if (key === 'fov') { this.camera.fov = this.settings.fov; this.camera.updateProjectionMatrix(); }
    if (key === 'renderScale') this.resize();
    if (key === 'graphics') {
      const wasShadows = this.renderer.shadowMap.enabled;
      this.quality = this.pipeline.setQuality(this.presetName());
      if (this.map) this.map.setShadowQuality(this.presetName());
      this.resize();
      if (wasShadows !== this.renderer.shadowMap.enabled) {
        // Materials must recompile when shadow support toggles.
        this.scene.traverse((o) => {
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; });
        });
        this.precompile();
      }
    }
    if (key === 'volume') this.audio.setVolume(this.settings.volume);
    if (key === 'dynamicRes') { this.drs.scale = 1; this.resize(); }
    if (key === 'timeOfDay' && this.map.setTimeOfDay) { this.map.setTimeOfDay(this.settings.timeOfDay); this.weather.apply(true); }
    if (key === 'weather' || key === 'graphics') this.weather.apply();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    // Pixel ratio is capped by the graphics preset (and scaled by the render-scale setting).
    const drs = this.settings.dynamicRes !== false ? this.drs.scale : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatio) * this.settings.renderScale * drs);
    this.renderer.setSize(w, h, false);
    this.pipeline.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.weapons.resize(w / h);
  }

  // ------------------------------------------------------------------ combat plumbing
  getCombatants() {
    return [this.player, ...this.enemies.bots];
  }

  getTargets(shooter) {
    // Every living character except the shooter: allies block bullets but take no damage.
    return this.getCombatants().filter((c) => c !== shooter && c.alive);
  }

  getListener(out) {
    out.x = this.camera.position.x;
    out.y = this.camera.position.y;
    out.z = this.camera.position.z;
    return out;
  }

  dealDamage(target, raw, info) {
    if (!target.alive) return { dealt: 0, killed: false };
    const attacker = info.attacker;
    if (attacker && attacker !== target && attacker.team === target.team) return { dealt: 0, killed: false }; // no friendly fire
    if (this.gs.phase !== 'live' && this.gs.phase !== 'end') return { dealt: 0, killed: false };
    if (target === this.player) {
      raw = this.equipment.absorb(raw, info); // ballistic shield (frontal)
      if (raw <= 0) return { dealt: 0, killed: false, blocked: true };
    }
    const dealt = target.applyDamage(raw, info);
    const killed = !target.alive;
    if (killed) this._onKill(target, info);
    return { dealt, killed };
  }

  _onKill(victim, info) {
    const killer = info.attacker;
    const headshot = info.part === 'head';
    if (killer && killer !== victim) {
      killer.kills++;
      if (killer === this.player && headshot) this.matchStats.headshots++;
      if (killer === this.player) this.recordKill();
    }
    const killerName = killer ? killer.name : 'World';
    this.hud.killFeed(killerName, victim.name, info.weaponName || '?', headshot, killer === this.player || victim === this.player);

    if (this.mission && this.mission.active) this.mission.onKill(victim, info);

    if (victim === this.player) {
      this.deathCam = { active: true, time: 0, killer, yaw: this.player.yaw, pitch: this.player.pitch };
      this.weapons.model && (this.weapons.model.visible = false);
      this.hud.message('You were eliminated', killer ? `by ${killer.name} [${info.weaponName}]` : '', 3);
      this.buyOpen = false;
      this.hud.setBuyMenu(false);
    } else {
      this.enemies._voice(victim, 'death');
      // Drop the bot's primary so the player can pick it up.
      const w = victim.weapon;
      if (w && !w.isMelee) {
        const p = victim.body.pos;
        this.pickups.spawn(w.id, { mag: w.cfg.magSize, reserve: w.cfg.reserveMax }, { x: p.x, y: p.y + 1.0, z: p.z }, {
          x: (Math.random() - 0.5) * 2, y: 1.5, z: (Math.random() - 0.5) * 2,
        }, w.attachments);
      }
    }
  }

  aliveCounts() {
    return {
      A: (this.player.alive ? 1 : 0) + this.enemies.aliveCount('A'),
      B: this.enemies.aliveCount('B'),
    };
  }

  // ------------------------------------------------------------------ levels
  /**
   * Switch the active level. The KL city and the mission systems are code-split and loaded
   * on first use, so the Training Depot never pays for them.
   */
  async prepareLevel(id) {
    if (this.levelId === id && (id !== 'kl' || this.mission)) return;
    this.menu.setLoading(id === 'kl' ? 'Loading Kuala Lumpur district…' : 'Loading Training Depot…');
    await new Promise((r) => setTimeout(r, 30)); // let the loading text paint
    let data, MapClass = TrainingMap, MissionMode = null;
    if (id === 'kl') {
      const [lvl, mapMod, missionMod] = await Promise.all([
        import('../city/klLevelData.js'), import('../city/KualaLumpurMap.js'), import('../mission/MissionMode.js'),
      ]);
      data = lvl.buildKLData();
      MapClass = mapMod.KualaLumpurMap;
      MissionMode = missionMod.MissionMode;
    } else {
      data = buildMapData();
    }
    if (this.levelId !== id) {
      if (this.mission) this.mission.stop();
      this.enemies.setLevel(this.collision, this.mapData); // drops bots of the old level
      this.map.dispose();
      this.pickups.clear();
      this.effects.reset();
      this.mapData = data;
      this.collision = new CollisionSystem(data.solids);
      if (id === 'kl') {
        this.menu.setLoading('Loading Kuala Lumpur assets…');
        await MapClass.preload(this.assets);
        this.map = new MapClass(this.scene, data, {
          quality: this.presetName(), renderer: this.renderer, timeOfDay: this.settings.timeOfDay, assets: this.assets,
          onReady: () => this.precompile(), // tunnel dressing arrives later: warm its shaders too
        });
      } else {
        this.map = new TrainingMap(this.scene, data, this.presetName(), this.assets);
      }
      this.controller.collision = this.collision;
      this.pickups.collision = this.collision;
      this.weapons.world.collision = this.collision;
      this.enemies.setLevel(this.collision, data);
      this.throwables.clear();
      this.levelId = id;
      this.surveillance.setLevel(id);
      this.weather.apply(true);
      this.menu.setLoading('Compiling shaders…');
      await this.precompile();
    }
    if (id === 'kl' && !this.mission) this.mission = new MissionMode(this);
    this.menu.setLoading('');
  }

  // ------------------------------------------------------------------ match / round flow
  startMatch() {
    this.loadoutMenu.close();
    this.armoryOpen = false;
    // Locked weapons fall back to the defaults (armory shows the unlock requirements).
    const okW = (id) => isUnlocked(arsenalEntry(id) || {}, this.progress, !!this.settings.sandboxUnlock);
    if (!okW(this.loadout.primary)) this.loadout.primary = DEFAULT_LOADOUT.primary;
    if (!okW(this.loadout.secondary)) this.loadout.secondary = DEFAULT_LOADOUT.secondary;
    this.settings.primary = this.loadout.primary;
    this.weapons.setLoadout(this.loadout);
    this.throwables.clear();
    const level = this.settings.mode === 'mission' ? 'kl' : 'depot';
    if (this.levelId !== level || (level === 'kl' && !this.mission)) {
      this._lock(); // request pointer lock inside the click gesture, before the async load
      return this.prepareLevel(level).then(() => this.startMatch()).catch((err) => {
        console.error(err);
        this.menu.setLoading(`Failed to load level: ${err.message}`);
      });
    }
    if (level === 'kl') {
      if (this.map.setTimeOfDay && this.map.night !== (this.settings.timeOfDay === 'night')) { this.map.setTimeOfDay(this.settings.timeOfDay); this.weather.apply(true); }
      this.mission.start();
      this.weather.apply();
      return Promise.resolve();
    }
    if (this.mission) this.mission.stop();
    const s = this.settings;
    this.gs = new GameState({ roundTime: s.roundTime, roundsToWin: s.roundsToWin });
    this.enemies.setup({
      difficulty: s.difficulty,
      enemyCount: s.enemyCount,
      allyCount: s.mode === 'team' ? s.allyCount : 0,
    });
    this.player.kills = 0;
    this.player.deaths = 0;
    this.player.armor = 0;
    this.player.alive = false; // forces a fresh loadout in round 1
    this.matchStats = { headshots: 0 };
    this.weapons.stats = { shots: 0, hits: 0 };
    this.hud.reset();
    this.menu.hideAll();
    this.hud.show();
    this.state = 'playing';
    this.startRound();
    this._lock();
    return Promise.resolve();
  }

  startRound() {
    const survived = this.player.alive && this.gs.round > 0;
    this.gs.startRound();
    this.effects.reset();
    this.pickups.clear();
    this.throwables.clear();
    this.hud.clearKillFeed();
    this.deathCam.active = false;

    const spawn = this.mapData.spawns.A[0];
    this.player.reset(spawn, this.mapData.spawnYaw.A);
    if (survived) this.weapons.refillAll();
    else this.weapons.giveLoadout(this.settings.primary);
    if (this.weapons.weapon) this.weapons.equip(this.weapons.slots.primary ? 'primary' : 'secondary', true);

    this.enemies.spawnRound(this.mapData, this.gs.round);
    this.enemies.setFrozen(true);
    this.controller.frozen = true;
    this.hud.message(`Round ${this.gs.round}`, 'Buy time — press B for the armory', 3);
  }

  _onRoundLive() {
    this.enemies.setFrozen(false);
    this.controller.frozen = false;
    this.audio.roundStart();
    this.hud.message('Round live', 'Eliminate the enemy team', 1.6);
  }

  _onRoundEnd() {
    const r = this.gs.lastResult;
    const won = r.winner === 'A';
    const title = r.winner === 'draw' ? 'Round draw' : `${TEAM_NAME[r.winner]} wins the round`;
    const sub = r.reason === 'time' ? 'Time expired' : won ? 'Enemy team eliminated' : 'Your team was eliminated';
    this.hud.message(title, sub, 4);
    this.audio.roundEnd(won);
    this.buyOpen = false;
    this.hud.setBuyMenu(false);
  }

  _onMatchOver() {
    const victory = this.gs.matchWinner === 'A';
    this.state = 'over';
    this.input.exitLock();
    this.audio.roundEnd(victory);
    const acc = this.weapons.stats.shots ? Math.round((this.weapons.stats.hits / this.weapons.stats.shots) * 100) : 0;
    this.menu.showEnd(victory, `
      Final score <b class="team-a">${this.gs.score.A}</b> – <b class="team-b">${this.gs.score.B}</b><br>
      Kills: <b>${this.player.kills}</b> · Deaths: <b>${this.player.deaths}</b> · Headshots: <b>${this.matchStats.headshots}</b><br>
      Accuracy: <b>${acc}%</b> · Difficulty: <b>${this.settings.difficulty}</b>`);
    this.hud.hide();
  }

  _lock() {
    if (this.debugNoLock) { this.input.locked = true; return; }
    this.input.requestLock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.clear();
    this.audio.suspend();
    this.hud.setScoreboard(false);
    this.menu.show('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.menu.setResumeHint('');
    this.menu.hideAll();
    this.audio.resume();
    this.state = 'playing';
    this._lock();
  }

  quitToMenu() {
    this.state = 'menu';
    if (this.mission) this.mission.stop();
    this.input.exitLock();
    this.hud.hide();
    this.menu.show('main');
  }

  // ------------------------------------------------------------------ buy menu
  _handleBuyMenu() {
    const input = this.input;
    if (input.wasPressed('KeyB')) {
      if (this.buyOpen) this.buyOpen = false;
      else if (this.gs.canBuy && this.player.alive) this.buyOpen = true;
      else this.hud.message('', 'Buy time is over', 1.2);
    }
    if (this.buyOpen && (!this.gs.canBuy || !this.player.alive)) this.buyOpen = false;
    this.hud.setBuyMenu(this.buyOpen);
    this.weapons.enabled = !this.buyOpen;
    if (!this.buyOpen) return;
    const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];
    for (let i = 0; i < keys.length; i++) {
      if (!input.wasPressed(keys[i])) continue;
      input.pressed.delete(keys[i]); // don't also switch weapon slots this frame
      if (i === 5) { this.openArmory('armory'); return; }
      if (i < 3) this.weapons.give(PRIMARIES[i]);
      else if (i === 3) this.player.armor = 100;
      else this.weapons.refillAll();
      this.audio.pickup();
      this.buyOpen = false;
    }
  }

  // ------------------------------------------------------------------ main loop
  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.state === 'playing' && !this.testFreeze) {
      if (this.input.wasPressed('Escape') && this.debugNoLock) this.pause();
      else this.simulate(dt);
    } else if (this.state === 'menu') {
      this._menuCamera(dt);
    }
    this.effects.update(dt);
    this.map.update(dt, this.camera);
    this.weather.update(dt);
    // Eye adaptation: maps may ask for a different exposure (e.g. darker interiors / tunnels).
    const targetExposure = this.map.exposureAt ? this.map.exposureAt(this.camera.position) : 1;
    this.exposure += (targetExposure - this.exposure) * Math.min(1, dt * 1.5);
    // Night vision amplifies dim scenes; thermal is exposure-independent.
    // (gain only in dark scenes – at night or underground – so daylight doesn't white out)
    const dark = this.settings.timeOfDay === 'night' && this.levelId === 'kl' || targetExposure > 1.2;
    this.renderer.toneMappingExposure = this.exposure * (this.equipment.vision === 'nvg' && dark ? 2.2 : 1);
    if (this._visionTint !== this.equipment.vision) { this._visionTint = this.equipment.vision; this.weapons.setVisionTint(this._visionTint); }
    this.input.endFrame();
    if (this.state !== 'menu') this._updateCamera();
    this.weapons.updateViewModel(dt);
    if (this.state === 'playing' || this.state === 'paused') this._updateHud(dt);
    if (!this.compiling) this._render();
    this._fps(dt);
  }

  // One gameplay tick (also used by the automated tests with a fixed dt).
  simulate(dt) {
    const m = this.mission && this.mission.active ? this.mission : null;
    // Mission overlays (targeting, cutaway view, projectile flight, drilling) pause the FPS world.
    if (m && m.blocksWorld()) {
      m.update(dt);
      return;
    }
    const p = this.player;
    if (p.spawnGrace > 0) p.spawnGrace = Math.max(0, p.spawnGrace - dt);
    if (p.alive) {
      if (!m) this._handleBuyMenu();
      else if (m.handleInput()) { /* mission consumed this frame's interaction keys */ }
      this.controller.update(dt);
      this._updateCamera();
      this.weapons.update(dt, this.gs.phase === 'live' || this.gs.phase === 'end');
    } else {
      this.input.consumeMouse();
      this.deathCam.time += dt;
    }
    this.enemies.update(dt);
    this._separateCharacters();
    this.pickups.update(dt);
    this.throwables.update(dt);
    this.surveillance.update(dt);
    this.equipment.update(dt, this.input, p.alive && this.weapons.enabled);

    if (m) {
      m.update(dt);
      return;
    }
    const ev = this.gs.update(dt, this.aliveCounts());
    if (ev === 'live') this._onRoundLive();
    else if (ev === 'roundEnd') this._onRoundEnd();
    else if (ev === 'nextRound') this.startRound();
    else if (ev === 'matchOver') this._onMatchOver();
  }

  // Keep characters from overlapping each other (simple pairwise push).
  _separateCharacters() {
    const list = this.getCombatants().filter((c) => c.alive);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].body, b = list[j].body;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || Math.abs(a.pos.y - b.pos.y) > 1.6) continue;
        const d = Math.sqrt(d2) || 0.001;
        const push = (min - d) / 2;
        const nx = d2 > 0 ? dx / d : 1, nz = d2 > 0 ? dz / d : 0;
        this.collision.moveBody(a, -nx * push, 0, -nz * push, false);
        this.collision.moveBody(b, nx * push, 0, nz * push, false);
        a.grounded = b.grounded = true;
      }
    }
  }

  _menuCamera(dt) {
    // Slow fly-around behind the main menu.
    this.menuTime = (this.menuTime || 0) + dt * 0.05;
    const t = this.menuTime;
    this.camera.position.set(Math.sin(t) * 30, 12, Math.cos(t) * 30);
    this.camera.lookAt(0, 2, 0);
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    this.map.sky.position.copy(this.camera.position);
  }

  _updateCamera() {
    const p = this.player;
    if (this.mission && this.mission.active && this.mission.updateCamera(this.camera)) {
      this.map.sky.position.copy(this.camera.position);
      return;
    }
    if (!p.alive && this.deathCam.active) {
      // Death cam: drop to the floor and turn toward the killer.
      const dc = this.deathCam;
      const t = Math.min(1, dc.time / 0.8);
      this.camera.position.set(p.body.pos.x, p.body.pos.y + 1.6 - 1.3 * t, p.body.pos.z);
      if (dc.killer && dc.killer.body) {
        const k = dc.killer.body.pos;
        const want = Math.atan2(-(k.x - p.body.pos.x), -(k.z - p.body.pos.z));
        let d = want - dc.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        dc.yaw += d * Math.min(1, 0.05);
        dc.pitch += (0.15 - dc.pitch) * 0.05;
      }
      this.camera.rotation.set(dc.pitch, dc.yaw, t * 0.4);
      if (this.camera.fov !== this.settings.fov) { this.camera.fov = this.settings.fov; this.camera.updateProjectionMatrix(); }
      this.camera.updateMatrixWorld();
      this.map.sky.position.copy(this.camera.position);
      return;
    }
    const bob = this.controller.getBob();
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - 1 / 60);
      const k = this.shakeAmp * (this.shakeT / 0.6);
      sx = (Math.random() - 0.5) * 0.06 * k;
      sy = (Math.random() - 0.5) * 0.06 * k;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    this.camera.position.set(p.body.pos.x, p.body.pos.y + p.eyeHeight + bob.y, p.body.pos.z);
    this.camera.rotation.set(p.pitch + p.recoilPitch + sy, p.yaw + p.recoilYaw + sx, 0);
    const targetFov = this.weapons.getZoomFov();
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * 0.5;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
    this.map.sky.position.copy(this.camera.position);
  }

  _updateHud(dt) {
    const ws = this.weapons.getHudState();
    this.hud.setWeapon(ws);
    this.hud.setVitals(this.player.health, this.player.armor, this.player.kills);
    const alive = this.aliveCounts();
    this.hud.setRound({
      scoreA: this.gs.score.A, scoreB: this.gs.score.B, timeLeft: this.gs.timeLeft,
      round: this.gs.round, aliveA: alive.A, aliveB: alive.B, phase: this.gs.phase,
    });
    const spread = this.weapons.getCurrentSpread();
    const halfFov = (this.camera.fov * Math.PI) / 360;
    const gap = 4 + (Math.tan(spread) / Math.tan(halfFov)) * (window.innerHeight / 2);
    const sniper = ws.category === 'sniper';
    this.hud.setCrosshair(gap, !ws.scoped && !sniper && ws.ads < 0.5 && this.player.alive);
    this._updateGearHud();
    const near = this.player.alive ? this.pickups.findNearest(this.player.body.pos, 1.8) : null;
    this.hud.setPickupHint(near ? `Press E to pick up ${near.name}` : '');
    const missionActive = this.mission && this.mission.active;
    const showBoard = this.state === 'playing' && this.input.isDown('Tab') && !missionActive;
    this.hud.setScoreboard(showBoard, showBoard ? this._scoreboardData() : null);
    if (missionActive) {
      const near = this.player.alive ? this.pickups.findNearest(this.player.body.pos, 1.8) : null;
      this.hud.setPickupHint(this.mission.interactionHint() || (near ? `Press E to pick up ${near.name}` : ''));
      this.mission.updateHud(dt);
    }
    this.hud.update(dt);
  }

  // Equipment strip, objective line, enemy detection status, world markers and rangefinder readout.
  _updateGearHud() {
    const eq = this.equipment;
    this.hud.setEquipment(eq.status(), eq.vision);
    const m = this.mission && this.mission.active ? this.mission.mission : null;
    if (m) {
      const next = m.objectives().find((o) => !o.done && !o.constraint);
      this.hud.setObjective(next ? `OBJECTIVE · ${next.text}` : 'OBJECTIVE · Exfiltrate');
    } else {
      this.hud.setObjective(this.gs.phase === 'freeze' ? 'OBJECTIVE · Gear up (B: buy / armory)' : `OBJECTIVE · Eliminate the enemy team (${this.enemies.aliveCount('B')} left)`);
    }
    // Detection: the worst awareness state of any hostile toward the player, plus cameras.
    let level = 'clear';
    const rank = { clear: 0, watched: 1, suspicious: 2, detected: 3, engaged: 4 };
    for (const b of this.enemies.bots) {
      if (!b.alive || b.team === this.player.team || !b.ai) continue;
      const s = b.ai.state;
      const l = (s === 'attack' || s === 'chase') && b.ai.target === this.player ? 'engaged' : s === 'alert' ? 'detected' : s === 'investigate' ? 'suspicious' : 'clear';
      if (rank[l] > rank[level]) level = l;
    }
    const cam = this.surveillance.status();
    if (cam === 'detected' && rank.detected > rank[level]) level = 'detected';
    else if (cam === 'watched' && rank.watched > rank[level]) level = 'watched';
    const text = { clear: 'UNDETECTED', watched: 'CAMERA TRACKING', suspicious: 'ENEMY SUSPICIOUS', detected: 'DETECTED', engaged: 'ENGAGED' }[level];
    this.hud.setDetection(level, text);
    // Markers: revealed hostiles (sensor grenade, binocular/rangefinder tags) and rangefinder points.
    const list = [];
    const W = window.innerWidth, H = window.innerHeight;
    const proj = (x, y, z, label, kind) => {
      _mk.set(x, y, z).project(this.camera);
      if (_mk.z > 1 || Math.abs(_mk.x) > 1.05 || Math.abs(_mk.y) > 1.05) return;
      list.push({ x: (_mk.x * 0.5 + 0.5) * W, y: (-_mk.y * 0.5 + 0.5) * H, label, kind });
    };
    for (const [bot] of this.throwables.revealed) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.body.pos.x - this.player.body.pos.x, bot.body.pos.z - this.player.body.pos.z);
      proj(bot.body.pos.x, bot.body.pos.y + 2.05, bot.body.pos.z, `${Math.round(d)}m`, 'hostile');
    }
    for (const mk of eq.marks) proj(mk.pos.x, mk.pos.y, mk.pos.z, mk.label, 'range');
    if (this.weapons.current === 'equipment' && this.weapons.heldId === 'detector') {
      for (const b of eq.detectorBlips) list.push({ x: W / 2 + b.x * 140, y: H - 170 + b.y * 140, label: '', kind: 'blip' });
    }
    this.hud.setMarkers(list);
    const r = eq.range;
    const showRange = r && this.throwables.time - r.time < 6 && this.weapons.current === 'equipment';
    this.hud.setRange(showRange ? `RANGE ${r.dist !== null ? `${r.dist.toFixed(1)} m` : '---'} · BRG ${r.bearing.toFixed(0).padStart(3, '0')}° · EL ${r.elev.toFixed(1)}°${r.target ? ` · ${r.target}` : ''}` : '');
  }

  _scoreboardData() {
    const row = (c) => ({ name: c.name, kills: c.kills, deaths: c.deaths, alive: c.alive, isPlayer: !!c.isPlayer });
    const all = this.getCombatants();
    return {
      A: all.filter((c) => c.team === 'A').map(row),
      B: all.filter((c) => c.team === 'B').map(row),
      scoreA: this.gs.score.A,
      scoreB: this.gs.score.B,
      mode: `· ${this.settings.mode === 'team' ? 'Team Elimination' : 'Solo vs Bots'} · ${this.settings.difficulty}`,
    };
  }

  _render() {
    this.renderer.info.reset();
    this.renderer.clear();
    // Mission views with their own scenes (underground cutaway, drilling) replace the world render.
    if (this.mission && this.mission.active && this.mission.render(this.renderer)) {
      this.camera.getWorldDirection(_fwd);
      this.audio.updateListener(this.camera.position, _fwd, this.camera.up);
      return;
    }
    this.pipeline.render();
    const fpsView = !(this.mission && this.mission.active && this.mission.hidesViewModel());
    if ((this.state === 'playing' || this.state === 'paused') && fpsView) this.weapons.render(this.renderer);
    this.camera.getWorldDirection(_fwd);
    this.audio.updateListener(this.camera.position, _fwd, this.camera.up);
  }

  // Dynamic resolution: lower the render scale when frames take > ~22 ms, raise it again with headroom.
  _dynamicResolution(dt) {
    const d = this.drs;
    d.ema = d.ema * 0.93 + dt * 1000 * 0.07;
    d.timer += dt;
    if (this.settings.dynamicRes === false || this.state !== 'playing' || d.timer < 1) return;
    d.timer = 0;
    const before = d.scale;
    if (d.ema > 22 && d.scale > 0.6) d.scale = Math.max(0.6, d.scale - 0.1);
    else if (d.ema < 13 && d.scale < 1) d.scale = Math.min(1, d.scale + 0.05);
    if (d.scale !== before) this.resize();
  }

  _fps(dt) {
    this._dynamicResolution(dt);
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.hud.setFps(this.settings.showFps, Math.round(this.fpsFrames / this.fpsTime), Math.round(this.drs.scale * 100));
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
  }
}
