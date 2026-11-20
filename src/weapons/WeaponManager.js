// Player weapon handling: loadout & inventory (weapons, grenades, held equipment), input, hitscan
// firing, fire modes, aim-down-sights, recoil, scopes, rockets, and all first-person animation
// (draw, idle breathing, recoil, slide/bolt cycling, reload choreography, inspect, throws).
import * as THREE from 'three';
import { Weapon, DRAW_TIME } from './Weapon.js';
import { buildViewModel, buildGearView, setWeaponAssets } from './WeaponModels.js';
import { buildGrenadeModel, buildEquipmentModel, setEquipmentAssets } from './forge/equipmentModels.js';
import { THROWABLES, EQUIPMENT, DEFAULT_LOADOUT } from './equipmentData.js';
import { HIT_MULTIPLIER, rangeFalloff } from '../game/combat.js';
import { traceBullet, penetrationPower } from './penetration.js';
import { createFlashTexture } from '../maps/Textures.js';

const DEG = Math.PI / 180;
export const SLOTS = ['primary', 'secondary', 'melee', 'special', 'grenade', 'equipment'];
const SLOT_KEYS = { Digit1: 'primary', Digit2: 'secondary', Digit3: 'melee', Digit4: 'special', Digit5: 'grenade', Digit6: 'equipment' };
const WHEEL_HOLD = 0.22; // seconds Q must be held to open the weapon wheel

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _end = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _hidden = new THREE.Vector3(0, -99, 0);
const _fxM = new THREE.Matrix4();
const _fxQ = new THREE.Quaternion();
const _fxOne = new THREE.Vector3(1, 1, 1);
const _tmp = new THREE.Vector3();
const _segO = new THREE.Vector3();
const _exitP = new THREE.Vector3();

// Slot occupant for grenades / held equipment (behaves like a weapon for the shared code paths).
class GearItem {
  constructor(kind) {
    this.id = kind;
    this.kind = kind;
    this.cfg = { id: kind, name: kind === 'grenade' ? 'Grenades' : 'Equipment', slot: kind, category: kind, moveSpeed: 1, gear: true };
    this.mag = 0; this.reserve = 0; this.reloading = false; this.zoomIndex = 0; this.cooldown = 0;
    this.reloadProgress = 0; this.attachments = {};
  }
  get isMelee() { return false; }
  get mode() { return null; }
  update() { return null; }
  deploy() {}
  cancelReload() {}
  startReload() { return false; }
  refill() {}
  getSpread() { return 0; }
  getAmmo() { return { mag: 0, reserve: 0 }; }
  tryFire() { return false; }
  cycleMode() { return false; }
}

export class WeaponManager {
  /**
   * world: {
   *   collision, effects, audio, hud, pickups, throwables, equipment,
   *   getTargets(): combatants that can be hit,
   *   dealDamage(target, raw, info) => { dealt, killed },
   *   onNoise(position, radius): bots hear gunfire
   * }
   */
  constructor(player, controller, input, camera, settings, world) {
    this.player = player;
    this.controller = controller;
    this.input = input;
    this.camera = camera;
    this.settings = settings;
    this.world = world;
    this.slots = { primary: null, secondary: null, melee: null, special: null, grenade: null, equipment: null };
    this.current = 'secondary';
    this.lastSlot = 'melee';
    this.switchTimer = 0;
    this.enabled = true;
    this.stats = { shots: 0, hits: 0 };
    this.loadout = structuredClone(DEFAULT_LOADOUT);
    this.grenades = {}; // type -> count
    this.grenadeType = null;
    this.heldIndex = 0;
    this.grenadeCooldown = 0;
    this.throwState = null; // { t, type, released, under }
    this.ads = 0;
    this.burstQueue = 0;
    this.burstGap = 0;
    this.inspectTime = 0;
    this.cycleTime = 0;
    this.modeTwitch = 0;
    this.qHeld = 0;
    this.wheel = { open: false, x: 0, y: 0, choice: null };

    // Separate scene/camera so the gun never clips into walls and keeps its own FOV.
    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    this.viewHemi = new THREE.HemisphereLight(0xd8e4ff, 0x4a3f30, 1.6);
    this.viewScene.add(this.viewHemi);
    this.viewKey = new THREE.DirectionalLight(0xfff0d8, 1.6);
    this.viewKey.position.set(1, 2, 1);
    this.viewScene.add(this.viewKey);
    this.viewRoot = new THREE.Group();
    this.viewScene.add(this.viewRoot);
    this.models = {};
    this.flashMat = new THREE.SpriteMaterial({ map: createFlashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flash = new THREE.Sprite(this.flashMat);
    // Ejected casings (pooled instanced brass) and muzzle smoke (pooled sprites) in the viewmodel scene.
    this.casingMat = new THREE.MeshStandardMaterial({ color: 0xc9a248, metalness: 1, roughness: 0.3 });
    this.casings = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.026, 8).rotateZ(Math.PI / 2), this.casingMat, 24);
    this.casings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.casings.frustumCulled = false;
    this.casingState = Array.from({ length: 24 }, () => ({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0 }));
    this.casingNext = 0;
    this.viewScene.add(this.casings);
    const smokeTex = createFlashTexture();
    this.smoke = Array.from({ length: 10 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x9a9a9a, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false;
      this.viewScene.add(s);
      return { s, life: 0, v: new THREE.Vector3() };
    });
    this.smokeNext = 0;
    this.flash.visible = false;
    this.flashTime = 0;
    // Laser beam (viewmodel) + dot (world)
    this.laserBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 1, 4).translate(0, 0.5, 0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.laserBeam.visible = false;
    this.laserBeam.scale.z = 3;
    this.laserDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xff2010, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.laserDot.scale.setScalar(0.06);
    this.laserDot.visible = false;
    this.laserDotAdded = false;

    // Animation state
    this.kick = 0;
    this.kickRot = 0;
    this.slashTime = 0;
    this.slashHeavy = false;
    this.pumpTime = 0;
    this.boltTime = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.prevYaw = 0;
    this.prevPitch = 0;
    this.shellBob = 0;
    this.idleT = 0;
    this.reloadWasEmpty = false;
  }

  // Shared asset library (glTF weapon models, environment lighting for the viewmodel).
  setAssets(assets) {
    this.assets = assets;
    setWeaponAssets(assets);
    setEquipmentAssets(assets);
    const hdri = assets.hdri.get('day');
    if (hdri) { this.viewScene.environment = hdri.env; this.viewScene.environmentIntensity = 0.8; }
    for (const m of Object.values(this.models)) this.viewRoot.remove(m);
    this.models = {};
    if (this.weapon) this._showModel();
  }

  // NVG / thermal: tint the viewmodel lighting to match the vision mode.
  setVisionTint(mode) {
    const green = mode === 'nvg', grey = mode === 'thermal';
    this.viewHemi.color.setHex(green ? 0x4dff80 : grey ? 0x9a9a9a : 0xd8e4ff);
    this.viewHemi.groundColor.setHex(green ? 0x0a3010 : grey ? 0x202020 : 0x4a3f30);
    this.viewKey.color.setHex(green ? 0x60ff90 : grey ? 0xaaaaaa : 0xfff0d8);
    this.viewScene.environmentIntensity = mode === 'none' ? 0.8 : 0.15;
  }

  // ------------------------------------------------------------------ inventory
  get weapon() {
    return this.slots[this.current];
  }

  get heldList() {
    return this.world.equipment ? this.world.equipment.heldList() : [];
  }

  get heldId() {
    const l = this.heldList;
    return l.length ? l[this.heldIndex % l.length] : null;
  }

  // Scoped view: bolt-rifle zoom stages, a magnified optic at full ADS, or raised binoculars.
  get scoped() {
    const w = this.weapon;
    if (!w) return false;
    if (w.cfg.zoomLevels && w.zoomIndex > 0) return true;
    if (w.cfg.ads && w.cfg.ads.overlay && this.ads > 0.9 && !w.cfg.zoomLevels) return true;
    if (this.current === 'equipment' && this.heldId === 'binoculars' && this.world.equipment && this.world.equipment.binoZoom && this.ads > 0.9) return true;
    return false;
  }

  scopeType() {
    if (!this.scoped) return null;
    const w = this.weapon;
    if (this.current === 'equipment') return 'binocular';
    if (w.cfg.zoomLevels) return w.cfg.ads && w.cfg.ads.optic === 'x4' ? 'acog' : 'mildot';
    return w.cfg.ads.overlay;
  }

  setLoadout(loadout) {
    this.loadout = structuredClone(loadout);
  }

  giveLoadout(primaryId, loadout = this.loadout) {
    const att = (loadout && loadout.attachments) || {};
    this.slots.primary = primaryId ? new Weapon(primaryId, null, att[primaryId]) : null;
    const sec = (loadout && loadout.secondary) || 'pistol';
    this.slots.secondary = new Weapon(sec, null, att[sec]);
    this.slots.melee = new Weapon('knife');
    this.slots.special = null;
    this.grenades = {};
    for (const t of (loadout && loadout.grenades) || []) if (THROWABLES[t]) this.grenades[t] = THROWABLES[t].count;
    this.grenadeType = Object.keys(this.grenades)[0] || null;
    this.slots.grenade = this.grenadeType ? new GearItem('grenade') : null;
    if (this.world.equipment) this.world.equipment.reset((loadout && loadout.equipment) || []);
    this.heldIndex = 0;
    this.slots.equipment = this.heldList.length ? new GearItem('equipment') : null;
    this.throwState = null;
    this.equip(this.slots.primary ? 'primary' : 'secondary', true);
    this._prebuildViewModels();
  }

  // Builds the viewmodels of every carried item now (hidden) so switching never pays for model
  // construction or shader compilation mid-fight.
  _prebuildViewModels() {
    const saved = { current: this.current, grenadeType: this.grenadeType, heldIndex: this.heldIndex };
    const build = () => {
      const key = this._modelKey();
      if (this.models[key]) return;
      let m;
      if (this.current === 'grenade') m = buildGearView('grenade', this.grenadeType, { grenade: buildGrenadeModel, equipment: buildEquipmentModel });
      else if (this.current === 'equipment') m = buildGearView('equipment', this.heldId, { grenade: buildGrenadeModel, equipment: buildEquipmentModel });
      else m = buildViewModel(this.weapon.id, this.weapon.attachments);
      m.traverse((o) => { if (o.isMesh && /glow_amber/.test(o.name)) { o.material = o.material.clone(); (m.userData.vents = m.userData.vents || []).push(o.material); } });
      m.visible = false;
      this.models[key] = m;
      this.viewRoot.add(m);
    };
    for (const s of ['primary', 'secondary', 'melee']) if (this.slots[s]) { this.current = s; build(); }
    if (this.slots.grenade) { this.current = 'grenade'; for (const t of Object.keys(this.grenades)) { this.grenadeType = t; build(); } }
    if (this.slots.equipment) { this.current = 'equipment'; this.heldList.forEach((_, i) => { this.heldIndex = i; build(); }); }
    Object.assign(this, saved);
    if (this.renderer && this.renderer.compileAsync) this.renderer.compileAsync(this.viewScene, this.viewCamera).catch(() => {});
  }

  // Re-issue grenades and equipment from a loadout without touching the guns.
  refreshGear(loadout) {
    this.grenades = {};
    for (const t of loadout.grenades || []) if (THROWABLES[t]) this.grenades[t] = THROWABLES[t].count;
    this.grenadeType = Object.keys(this.grenades)[0] || null;
    this.slots.grenade = this.grenadeType ? new GearItem('grenade') : null;
    if (this.world.equipment) this.world.equipment.reset(loadout.equipment || []);
    this.heldIndex = 0;
    this.slots.equipment = this.heldList.length ? new GearItem('equipment') : null;
    if (!this.slots[this.current]) this.equip(this.slots.primary ? 'primary' : 'secondary', true);
    else if (this.current === 'grenade' || this.current === 'equipment') this.equip(this.current, true);
  }

  // Swap the attachments on a carried weapon (keeps its ammunition).
  reattach(id, attachments) {
    for (const s of ['primary', 'secondary']) {
      const w = this.slots[s];
      if (!w || w.id !== id) continue;
      this.slots[s] = new Weapon(id, w.getAmmo(), attachments);
      if (this.current === s) this.equip(s, true);
    }
  }

  // Give a weapon (armory / pickup). Returns the replaced weapon, if any.
  give(id, ammo = null, attachments = undefined) {
    const att = attachments !== undefined ? attachments : (this.loadout.attachments || {})[id];
    const w = new Weapon(id, ammo, att);
    const slot = w.cfg.slot;
    const old = this.slots[slot];
    this.slots[slot] = w;
    this.equip(slot, true);
    return old;
  }

  refillAll() {
    for (const s of SLOTS) if (this.slots[s]) this.slots[s].refill();
    for (const t of Object.keys(this.grenades)) this.grenades[t] = Math.max(this.grenades[t], THROWABLES[t].count);
    if (!this.slots.grenade && Object.keys(this.grenades).length) this.slots.grenade = new GearItem('grenade');
  }

  equip(slot, force = false) {
    if (!this.slots[slot]) return false;
    if (slot === 'grenade' && !this._hasGrenades()) { this.world.hud.message('', 'No grenades left', 1); return false; }
    if (slot === this.current && !force) {
      // Pressing 5 / 6 again cycles the grenade type / held device.
      if (slot === 'grenade') return this.cycleGrenade();
      if (slot === 'equipment') return this.cycleHeld();
      return false;
    }
    if (this.weapon) {
      this.weapon.cancelReload();
      this.weapon.zoomIndex = 0;
    }
    if (slot !== this.current) this.lastSlot = this.current;
    this.current = slot;
    this.weapon.deploy();
    this.switchTimer = DRAW_TIME;
    this.ads = 0;
    this.burstQueue = 0;
    this.inspectTime = 0;
    this.throwState = null;
    if (slot === 'grenade' && !(this.grenades[this.grenadeType] > 0)) this.cycleGrenade(true);
    this._showModel();
    this.controller.speedModifier = this.weapon.cfg.moveSpeed;
    if (this.world.equipment) this.world.equipment.heldActive = slot === 'equipment' ? this.heldId : null;
    this.world.audio.weaponSwitch();
    return true;
  }

  _hasGrenades() {
    return Object.values(this.grenades).some((n) => n > 0);
  }

  cycleGrenade(silent = false) {
    const types = Object.keys(this.grenades).filter((t) => this.grenades[t] > 0);
    if (!types.length) return false;
    const i = types.indexOf(this.grenadeType);
    this.grenadeType = types[(i + 1) % types.length];
    if (this.current === 'grenade') { this._showModel(); if (!silent) this.world.audio.uiClick(); }
    return true;
  }

  cycleHeld() {
    const l = this.heldList;
    if (l.length < 2) return false;
    this.heldIndex = (this.heldIndex + 1) % l.length;
    if (this.world.equipment) this.world.equipment.heldActive = this.heldId;
    this.switchTimer = DRAW_TIME * 0.7;
    this._showModel();
    this.world.audio.weaponSwitch();
    return true;
  }

  // Selects a specific grenade type / held item (weapon wheel, menus, tests).
  selectGear(kind, id) {
    if (kind === 'grenade' && this.grenades[id] > 0) { this.grenadeType = id; return this.equip('grenade', true); }
    if (kind === 'equipment') { const i = this.heldList.indexOf(id); if (i >= 0) { this.heldIndex = i; return this.equip('equipment', true); } }
    return false;
  }

  _modelKey() {
    if (this.current === 'grenade') return `grenade:${this.grenadeType}`;
    if (this.current === 'equipment') return `equip:${this.heldId}`;
    const w = this.weapon;
    return `${w.id}|${JSON.stringify(w.attachments || {})}`;
  }

  _showModel() {
    for (const m of Object.values(this.models)) m.visible = false;
    const key = this._modelKey();
    if (!this.models[key]) {
      let m;
      if (this.current === 'grenade') m = buildGearView('grenade', this.grenadeType, { grenade: buildGrenadeModel, equipment: buildEquipmentModel });
      else if (this.current === 'equipment') m = buildGearView('equipment', this.heldId, { grenade: buildGrenadeModel, equipment: buildEquipmentModel });
      else m = buildViewModel(this.weapon.id, this.weapon.attachments);
      // Energy weapons get private vent materials so heat glow doesn't affect other instances.
      m.traverse((o) => { if (o.isMesh && /glow_amber/.test(o.name)) { o.material = o.material.clone(); (m.userData.vents = m.userData.vents || []).push(o.material); } });
      this.models[key] = m;
      this.viewRoot.add(m);
      // New viewmodel materials: compile their shaders off-thread rather than on the first draw.
      if (this.renderer && this.renderer.compileAsync) this.renderer.compileAsync(this.viewScene, this.viewCamera).catch(() => {});
    }
    const model = this.models[key];
    model.visible = true;
    if (model.userData.muzzle) model.userData.muzzle.add(this.flash);
    if (model.userData.laserAnchor) model.userData.laserAnchor.add(this.laserBeam);
    this.model = model;
  }

  cycle(dir) {
    const idx = SLOTS.indexOf(this.current);
    for (let i = 1; i <= SLOTS.length; i++) {
      const s = SLOTS[(idx + dir * i + SLOTS.length * 2) % SLOTS.length];
      if (this.slots[s] && (s !== 'grenade' || this._hasGrenades())) return this.equip(s);
    }
    return false;
  }

  drop() {
    const w = this.weapon;
    if (!w || w.isMelee || w.cfg.special || w.cfg.gear) return;
    this.player.getEyePosition(_origin);
    this.camera.getWorldDirection(_fwd);
    this.world.pickups.spawn(w.id, w.getAmmo(), _origin, { x: _fwd.x * 4, y: 2 + _fwd.y * 3, z: _fwd.z * 4 }, w.attachments);
    this.slots[this.current] = null;
    this.equip(this.slots.primary ? 'primary' : this.slots.secondary ? 'secondary' : 'melee', true);
  }

  tryPickup() {
    const item = this.world.pickups.findNearest(this.player.body.pos, 1.8);
    if (!item) return false;
    const slot = item.cfgSlot;
    const old = this.slots[slot];
    if (old) {
      this.player.getEyePosition(_origin);
      this.world.pickups.spawn(old.id, old.getAmmo(), _origin, { x: 0, y: 1, z: 0 }, old.attachments);
    }
    this.world.pickups.remove(item);
    this.give(item.weaponId, item.ammo, item.attachments || {});
    this.world.audio.pickup();
    return true;
  }

  // ------------------------------------------------------------------ weapon wheel
  // Entries shown on the wheel (carried weapons, each grenade type, each held device).
  wheelEntries() {
    const out = [];
    for (const s of ['primary', 'secondary', 'melee', 'special']) if (this.slots[s]) out.push({ kind: 'slot', slot: s, id: this.slots[s].id, label: this.slots[s].cfg.name });
    for (const [t, n] of Object.entries(this.grenades)) out.push({ kind: 'grenade', id: t, label: `${THROWABLES[t].name} ×${n}`, disabled: n <= 0 });
    for (const e of this.heldList) out.push({ kind: 'equipment', id: e, label: EQUIPMENT[e].name });
    return out;
  }

  _updateWheel(dt) {
    const input = this.input;
    const held = input.isDown('KeyQ');
    if (input.wasPressed('KeyQ')) this.qHeld = 0;
    if (held) {
      this.qHeld += dt;
      if (!this.wheel.open && this.qHeld > WHEEL_HOLD) {
        this.wheel = { open: true, x: 0, y: 0, choice: null, entries: this.wheelEntries() };
        this.controller.lookLocked = true;
      }
      if (this.wheel.open) {
        const m = input.consumeMouse();
        this.wheel.x = THREE.MathUtils.clamp(this.wheel.x + m.x, -160, 160);
        this.wheel.y = THREE.MathUtils.clamp(this.wheel.y + m.y, -160, 160);
        const n = this.wheel.entries.length;
        if (Math.hypot(this.wheel.x, this.wheel.y) > 40 && n) {
          const a = (Math.atan2(this.wheel.x, -this.wheel.y) + Math.PI * 2) % (Math.PI * 2);
          this.wheel.choice = Math.floor((a / (Math.PI * 2)) * n + 0.5) % n;
        }
      }
      return true;
    }
    if (this.qHeld > 0) {
      const wasOpen = this.wheel.open;
      this.qHeld = 0;
      this.controller.lookLocked = false;
      if (wasOpen) {
        const e = this.wheel.choice !== null ? this.wheel.entries[this.wheel.choice] : null;
        this.wheel.open = false;
        if (e && !e.disabled) this.selectWheel(e);
      } else this.equip(this.lastSlot); // quick tap: last weapon
    }
    return false;
  }

  selectWheel(e) {
    if (e.kind === 'slot') return this.equip(e.slot);
    return this.selectGear(e.kind, e.id);
  }

  // ------------------------------------------------------------------ update
  update(dt, canFire = true) {
    const w = this.weapon;
    if (!w) return;
    const input = this.input;
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);

    // Tick the current weapon (reload timers, heat, spread recovery).
    const ev = w.update(dt);
    if (ev === 'shell') this.world.audio.reload('shotgun-shell', 0.5);
    if (ev === 'reloaded' && w.cfg.shellReload) this.world.audio.reload('shotgun-pump', 0.3);
    if (ev === 'cooled') this.world.hud.message('', 'Pulse rifle cooled', 0.8);
    this.switchTimer = Math.max(0, this.switchTimer - dt);
    this.inspectTime = Math.max(0, this.inspectTime - dt);

    if (this.enabled && this.player.alive) {
      const wheelBusy = this._updateWheel(dt) && this.wheel.open;
      if (!wheelBusy) {
        for (const [code, slot] of Object.entries(SLOT_KEYS)) if (input.wasPressed(code)) this.equip(slot);
        const wheel = input.consumeWheel();
        if (wheel !== 0) this.cycle(wheel > 0 ? 1 : -1);
        if (input.wasPressed('KeyG')) this.drop();
        if (input.wasPressed('KeyE')) this.tryPickup();
      }
      const cw = this.weapon;
      if (cw && !wheelBusy) {
        if (cw.cfg.gear) this._updateGear(dt, canFire);
        else this._updateGun(cw, dt, canFire);
      }
    } else {
      this.ads = Math.max(0, this.ads - dt * 6);
    }
    if (this.throwState) this._updateThrow(dt);
    this._updateRecoilRecovery(dt);
    this._updateMovementModifiers();
  }

  _updateGun(cw, dt, canFire) {
    const input = this.input;
    if (input.wasPressed('KeyR') && cw.startReload()) this._onReloadStart(cw);
    if (input.wasPressed('KeyX') && cw.cycleMode()) {
      this.world.audio.fireModeClick();
      this.modeTwitch = 0.25;
      this.world.hud.message('', `Fire mode: ${cw.mode.toUpperCase()}`, 0.9);
    }
    if (input.wasPressed('KeyF') && !cw.reloading && this.switchTimer <= 0) { this.inspectTime = 2.4; this.world.audio.weaponSwitch(); }

    // Right mouse: bolt-rifle scope stages, heavy knife attack, or hold to aim down sights.
    const sniperScope = !!cw.cfg.zoomLevels;
    if (input.mouseWasPressed(2) && sniperScope && !cw.reloading) {
      cw.zoomIndex = (cw.zoomIndex + 1) % cw.cfg.zoomLevels.length;
      this.world.audio.uiClick();
    }
    const wantAds = !sniperScope && !cw.isMelee && !cw.cfg.special && input.mouseDown(2) && !cw.reloading && this.switchTimer <= 0 && this.inspectTime <= 0;
    const adsTime = (cw.cfg.ads && cw.cfg.ads.time) || 0.2;
    this.ads = THREE.MathUtils.clamp(this.ads + (wantAds ? dt / adsTime : -dt / (adsTime * 0.7)), 0, 1);
    if (wantAds) this.inspectTime = 0;

    if (canFire) {
      const mode = cw.mode;
      if (mode === 'burst') {
        if (input.mouseWasPressed(0) && this.burstQueue === 0 && this.burstGap <= 0) this.burstQueue = 3;
        this.burstGap = Math.max(0, this.burstGap - dt);
        if (this.burstQueue > 0 && cw.cooldown <= 0) {
          if (this._tryFire(cw, false)) { this.burstQueue--; if (this.burstQueue === 0) this.burstGap = 0.22; } else this.burstQueue = 0;
        }
      } else {
        const trigger = mode === 'auto' ? input.mouseDown(0) : input.mouseWasPressed(0);
        if (trigger) this._tryFire(cw, false);
      }
      if (cw.isMelee && input.mouseWasPressed(2)) this._tryFire(cw, true);
    }

    // Auto-reload an empty magazine.
    if (!cw.isMelee && !cw.cfg.special && cw.mag === 0 && !cw.reloading && cw.cooldown <= 0 && cw.reserve > 0) {
      if (cw.startReload()) this._onReloadStart(cw);
    }
  }

  _updateGear(dt, canFire) {
    const input = this.input;
    const eq = this.world.equipment;
    if (this.current === 'grenade') {
      this.ads = 0;
      if (canFire && !this.throwState && this.switchTimer <= 0 && this.grenadeCooldown <= 0) {
        if (input.mouseWasPressed(0)) this._startThrow(false);
        else if (input.mouseWasPressed(2)) this._startThrow(true);
      }
      return;
    }
    // Held equipment
    const id = this.heldId;
    if (!id || !eq) return;
    eq.heldActive = id;
    const alt = input.mouseDown(2);
    this.ads = THREE.MathUtils.clamp(this.ads + (alt && id === 'binoculars' ? dt * 4 : -dt * 5), 0, 1);
    if (this.switchTimer > 0) return;
    const ev = eq.useHeld(id, { fire: canFire && input.mouseWasPressed(0), hold: input.mouseDown(0), alt: alt && this.ads > 0.6, dt });
    if (ev === 'bash' || ev === 'bash-hit') this.kick = 1;
    if (this.model && this.model.userData.screen) eq.drawScreen(id, this.model.userData.screen, performance.now() / 1000);
  }

  // ------------------------------------------------------------------ grenades
  _startThrow(underhand) {
    const type = this.grenadeType;
    if (!type || !(this.grenades[type] > 0)) return false;
    this.throwState = { t: 0, type, released: false, under: underhand };
    this.world.audio.pinPull?.();
    if (this.model && this.model.userData.pin) this.model.userData.pin.visible = false;
    return true;
  }

  _updateThrow(dt) {
    const s = this.throwState;
    s.t += dt;
    // 0–0.25 pin pull, 0.25–0.45 wind up, release at 0.5, recover until 0.85
    if (!s.released && s.t >= 0.5) {
      s.released = true;
      this.throwGrenade(s.type, s.under);
    }
    if (s.t >= 0.85) {
      this.throwState = null;
      if (this.model && this.model.userData.pin) this.model.userData.pin.visible = true;
      if (!this._hasGrenades()) this.equip(this.slots.primary ? 'primary' : 'secondary');
      else if (!(this.grenades[this.grenadeType] > 0)) this.cycleGrenade(true);
      else if (this.lastSlot && this.slots[this.lastSlot] && this.lastSlot !== 'grenade') this.equip(this.lastSlot); // back to the gun
    }
  }

  // Spawns the projectile (also used directly by tests).
  throwGrenade(type, underhand = false) {
    if (!(this.grenades[type] > 0)) return null;
    this.grenades[type]--;
    this.grenadeCooldown = THROWABLES[type].cooldown;
    this.camera.getWorldDirection(_fwd);
    _right.crossVectors(_fwd, this.camera.up).normalize();
    this.camera.getWorldPosition(_origin);
    _origin.addScaledVector(_fwd, 0.45).addScaledVector(_right, 0.18).y -= 0.12;
    // Don't spawn inside a wall right in front of the player.
    const wall = this.world.collision.raycast(this.camera.position.x, this.camera.position.y, this.camera.position.z, _fwd.x, _fwd.y, _fwd.z, 0.6);
    if (wall) _origin.copy(this.camera.position).addScaledVector(_fwd, Math.max(0.05, wall.dist - 0.15));
    const p = this.world.throwables.throw(type, _origin, _fwd, underhand ? 0.25 : 1, this.player);
    this.stats.grenades = (this.stats.grenades || 0) + 1;
    return p;
  }

  // ------------------------------------------------------------------ misc
  _onReloadStart(w) {
    this.ads = Math.min(this.ads, 0.3);
    this.inspectTime = 0;
    this.reloadWasEmpty = w.mag === 0;
    if (w.cfg.shellReload) return; // per-shell sounds play as each shell loads
    this.world.audio.reload(w.cfg.category === 'heavy' ? 'rifle' : w.id, w.cfg.reloadTime);
  }

  _updateMovementModifiers() {
    const w = this.weapon;
    if (!w) return;
    const scoped = this.scoped;
    let speed = scoped && w.cfg.scopedMoveSpeed ? w.cfg.scopedMoveSpeed : w.cfg.moveSpeed;
    speed *= 1 - this.ads * 0.3;
    if (this.current === 'equipment' && this.heldId === 'shield') speed *= 0.8;
    this.controller.speedModifier = speed;
    this.controller.zoomSensitivity = this.getZoomFov() / this.settings.fov;
  }

  getZoomFov() {
    const w = this.weapon;
    const fov = this.settings.fov;
    if (!w) return fov;
    if (w.cfg.zoomLevels) return w.zoomIndex === 0 ? fov : w.cfg.zoomLevels[w.zoomIndex];
    if (this.current === 'equipment') return this.heldId === 'binoculars' && this.world.equipment && this.world.equipment.binoZoom ? THREE.MathUtils.lerp(fov, fov / 6, this.ads) : fov;
    const zoom = (w.cfg.ads && w.cfg.ads.zoom) || 1.1;
    const eased = this.ads * this.ads * (3 - 2 * this.ads);
    return fov / THREE.MathUtils.lerp(1, zoom, eased);
  }

  _updateRecoilRecovery(dt) {
    const w = this.weapon;
    const p = this.player;
    if (!w || !w.cfg.recoil) {
      p.recoilPitch *= Math.max(0, 1 - dt * 10);
      p.recoilYaw *= Math.max(0, 1 - dt * 10);
      return;
    }
    if (w.sinceLastShot > Math.min(0.2, w.cfg.fireInterval * 1.2)) {
      const rec = w.cfg.recoil.recover * DEG * dt;
      p.recoilPitch = Math.max(0, p.recoilPitch - rec - p.recoilPitch * dt * 2);
      const yr = Math.min(Math.abs(p.recoilYaw), rec);
      p.recoilYaw -= Math.sign(p.recoilYaw) * yr;
    }
  }

  // ------------------------------------------------------------------ firing
  _movementState() {
    const p = this.player;
    return {
      speed: this.controller.horizontalSpeed,
      runSpeed: 5.4,
      grounded: p.body.grounded,
      crouching: p.crouching,
      scoped: this.scoped,
      ads: this.ads,
    };
  }

  getCurrentSpread() {
    const w = this.weapon;
    if (!w || w.isMelee || w.cfg.gear) return 0;
    return w.getSpread(this._movementState());
  }

  _tryFire(w, heavy) {
    if (w.cfg.special) {
      // Uplink: open the mission targeting interface instead of firing.
      if (this.switchTimer <= 0 && this.world.onSpecialFire) this.world.onSpecialFire();
      return false;
    }
    if (this.switchTimer > 0) return false;
    if (!w.isMelee && w.mag <= 0) {
      if (this.input.mouseWasPressed(0)) this.world.audio.dryFire();
      return false;
    }
    if (w.overheated) { if (this.input.mouseWasPressed(0)) this.world.audio.dryFire(); return false; }
    const interval = heavy ? w.cfg.heavyInterval : w.cfg.fireInterval;
    const spread = w.getSpread(this._movementState()); // measured before the shot adds bloom
    if (!w.tryFire(interval)) return false;
    this.inspectTime = 0;

    if (w.isMelee) {
      this._melee(w, heavy);
      return true;
    }

    this.stats.shots++;
    this.camera.getWorldDirection(_fwd);
    _right.crossVectors(_fwd, this.camera.up).normalize();
    _up.crossVectors(_right, _fwd).normalize();
    this.camera.getWorldPosition(_origin);

    if (w.cfg.launcher) {
      // Fictional anti-armour rocket (projectile, splash damage).
      this._spreadDir(_fwd, _right, _up, spread, _dir);
      _tmp.copy(_origin).addScaledVector(_fwd, 0.9).addScaledVector(_right, 0.12);
      this.world.throwables.launchRocket(_tmp, _dir, w.cfg, this.player);
      if (this.model && this.model.userData.mag) this.model.userData.mag.visible = false;
    } else {
      const pellets = w.cfg.pellets || 1;
      const hitTargets = new Map();
      for (let i = 0; i < pellets; i++) {
        const cone = pellets > 1 ? w.cfg.pelletSpread + spread * 0.5 : spread;
        this._spreadDir(_fwd, _right, _up, cone, _dir);
        this._fireRay(w, _origin, _dir, hitTargets, i === 0 || Math.random() < 0.3);
      }
      // Aggregate feedback per target (one marker for a shotgun blast).
      let anyHit = false, anyKill = false, anyHead = false;
      for (const r of hitTargets.values()) {
        anyHit = true;
        if (r.killed) anyKill = true;
        if (r.head) anyHead = true;
      }
      if (anyHit) {
        this.stats.hits++;
        this.world.hud.showHitMarker(anyKill ? 'kill' : anyHead ? 'head' : 'hit');
        this.world.audio.hitMarker(anyHead);
      }
    }

    this._applyRecoil(w);
    this._fireEffects(w);
    this.world.onNoise(this.player.body.pos, (w.cfg.noiseRadius || 45) * (w.cfg.noiseMul || 1), this.player);
    const action = w.cfg.action;
    if (action === 'pump') { this.pumpTime = 0.55; setTimeout(() => this._ejectCasing(0xa8261c), 300); }
    else if (action === 'bolt') {
      this.boltTime = 0.9;
      setTimeout(() => this._ejectCasing(0xc9a248), 450);
      this.world.audio.boltCycle();
      // Classic behaviour: unscope after a bolt-action shot.
      setTimeout(() => { if (this.weapon === w && w.zoomIndex > 0) w.zoomIndex = 0; }, 120);
    } else this.cycleTime = Math.min(0.09, w.cfg.fireInterval * 0.8);
    if (w.cfg.energy && w.overheated) { this.world.audio.overheat?.(); this.world.hud.message('', 'OVERHEATED', 1.2); }
    return true;
  }

  // Random direction within a cone (center-weighted like classic shooters).
  _spreadDir(fwd, right, up, cone, out) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.tan(cone) * Math.random();
    out.copy(fwd).addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    return out;
  }

  /**
   * Cast one bullet. Thin, penetrable solids (partitions, glass, furniture, hedges) let it through
   * with reduced damage (see penetration.js); anything else stops it. Targets are only hit inside
   * the open segments of the bullet's path.
   */
  _fireRay(w, origin, dir, hitTargets, effects) {
    const maxRange = w.cfg.maxRange;
    const segs = traceBullet(this.world.collision, origin, dir, maxRange, penetrationPower(w.cfg));
    const targets = this.world.getTargets(this.player);
    let best = null, bestTarget = null, seg = null;
    for (const s of segs) {
      _segO.copy(dir).multiplyScalar(s.start).add(origin);
      for (const t of targets) {
        const h = t.hitTest(_segO.x, _segO.y, _segO.z, dir.x, dir.y, dir.z, s.end - s.start);
        if (h && (!best || h.dist < best.dist)) { best = h; bestTarget = t; }
      }
      if (best) { best = { ...best, dist: best.dist + s.start }; seg = s; break; }
      // Entry and exit holes in anything the round passed through (or the final stop)
      if (s.wall) {
        this.world.effects.impact(s.wall.point, s.wall.normal, s.wall.solid.mat);
        if (effects) this.world.audio.impact(s.wall.point, s.wall.solid.mat);
        if (s.exit) {
          _exitP.copy(dir).multiplyScalar(s.exit.dist).add(origin);
          this.world.effects.impact(_exitP, s.exit.normal, s.wall.solid.mat);
        }
      }
    }
    const last = segs[segs.length - 1];
    this._nearMisses(targets, bestTarget, origin, dir, best ? best.dist : last.end);

    if (bestTarget && bestTarget.team === this.player.team) {
      // Teammates stop the bullet but take no damage.
      _end.copy(dir).multiplyScalar(best.dist).add(origin);
    } else if (bestTarget) {
      _end.copy(dir).multiplyScalar(best.dist).add(origin);
      const raw = w.cfg.damage * HIT_MULTIPLIER[best.part] * rangeFalloff(best.dist, w.cfg.range) * seg.mul;
      const res = this.world.dealDamage(bestTarget, raw, {
        attacker: this.player, part: best.part, armorRatio: w.cfg.armorRatio,
        weaponId: w.id, weaponName: w.cfg.name, direction: { x: dir.x, y: dir.y, z: dir.z }, point: _end.clone(),
        penetrated: seg.mul < 1,
      });
      const prev = hitTargets.get(bestTarget) || { killed: false, head: false };
      prev.killed = prev.killed || res.killed;
      prev.head = prev.head || best.part === 'head';
      hitTargets.set(bestTarget, prev);
      this.world.effects.blood(_end, dir, best.part === 'head');
      this.world.audio.fleshHit(_end);
    } else if (last.wall && !last.exit) {
      _end.set(last.wall.point.x, last.wall.point.y, last.wall.point.z);
    } else {
      _end.copy(dir).multiplyScalar(maxRange).add(origin);
    }

    if (effects && Math.random() < (w.cfg.tracerChance ?? 0.3)) {
      this._muzzleWorldPos(_muzzle);
      this.world.effects.addTracer(_muzzle, _end, w.cfg.tracerColor);
    }
  }

  // Hostile bots within 1.6 m of the bullet's path (up to where it stopped) are suppressed.
  _nearMisses(targets, hit, origin, dir, reach) {
    for (const t of targets) {
      if (t === hit || !t.ai || !t.ai.suppress || t.team === this.player.team || !t.alive) continue;
      const p = t.body.pos;
      const px = p.x - origin.x, py = p.y + 1.3 - origin.y, pz = p.z - origin.z;
      const along = px * dir.x + py * dir.y + pz * dir.z;
      if (along < 2 || along > reach) continue;
      const miss = Math.hypot(px - dir.x * along, py - dir.y * along, pz - dir.z * along);
      if (miss < 1.6) t.ai.suppress(this.player);
    }
  }

  _melee(w, heavy) {
    this.slashTime = heavy ? 0.5 : 0.3;
    this.slashHeavy = heavy;
    this.world.audio.knifeSwing();
    // Resolve hit slightly after swing start for feel, but deterministically now for fairness.
    this.camera.getWorldDirection(_fwd);
    this.camera.getWorldPosition(_origin);
    const range = w.cfg.range;
    const wall = this.world.collision.raycast(_origin.x, _origin.y, _origin.z, _fwd.x, _fwd.y, _fwd.z, range);
    const limit = wall ? wall.dist : range;
    let best = null, bestTarget = null;
    for (const t of this.world.getTargets(this.player)) {
      const h = t.hitTest(_origin.x, _origin.y, _origin.z, _fwd.x, _fwd.y, _fwd.z, limit);
      if (h && (!best || h.dist < best.dist)) { best = h; bestTarget = t; }
    }
    if (bestTarget && bestTarget.team === this.player.team) {
      // Teammate in the way: no damage.
    } else if (bestTarget) {
      _end.copy(_fwd).multiplyScalar(best.dist).add(_origin);
      const dmg = (heavy ? w.cfg.heavyDamage : w.cfg.damage) * (best.part === 'head' ? 1.5 : 1);
      const res = this.world.dealDamage(bestTarget, dmg, {
        attacker: this.player, part: best.part === 'legs' ? 'body' : best.part, armorRatio: w.cfg.armorRatio,
        weaponId: 'knife', weaponName: w.cfg.name, direction: { x: _fwd.x, y: _fwd.y, z: _fwd.z }, point: _end.clone(),
      });
      this.world.effects.blood(_end, _fwd, true);
      this.world.audio.knifeHit(_end);
      this.world.hud.showHitMarker(res.killed ? 'kill' : 'hit');
    } else if (wall) {
      this.world.effects.impact(wall.point, wall.normal, wall.solid.mat);
      this.world.audio.impact(wall.point, wall.solid.mat);
    }
  }

  _applyRecoil(w) {
    const r = w.cfg.recoil;
    const p = this.player;
    const i = Math.max(0, w.shotsFired - 1);
    const pitchScale = i < 8 ? 1 : i < 16 ? 0.55 : 0.3;
    const crouchScale = (p.crouching ? 0.8 : 1) * (1 - this.ads * 0.2);
    p.recoilPitch += r.pitch * pitchScale * crouchScale * DEG;
    const pattern = r.pattern[i % r.pattern.length];
    p.recoilYaw += (pattern * r.yaw + (Math.random() - 0.5) * r.yaw * 0.6) * DEG * crouchScale;
    // Clamp total punch so the view never flips.
    p.recoilPitch = Math.min(p.recoilPitch, 18 * DEG);
    const heavyKick = ['shotgun', 'sniper'].includes(w.cfg.category) || w.cfg.launcher || w.id === 'pt_deagle';
    this.kick = Math.min(1, this.kick + (heavyKick ? 1 : 0.55));
    this.kickRot = Math.min(1, this.kickRot + (heavyKick ? 1 : 0.4));
  }

  _fireEffects(w) {
    this.world.audio.gunshot(w.cfg.sound, null, 1, w.cfg.suppressed);
    const showFlash = !this.scoped && !w.cfg.suppressed && !w.cfg.launcher;
    this.flash.visible = showFlash;
    this.flash.material.rotation = Math.random() * Math.PI * 2;
    this.flash.material.color.setHex(w.cfg.energy ? 0x60e0ff : 0xffffff);
    const big = ['shotgun', 'heavy'].includes(w.cfg.category) || w.cfg.sound === 'antimateriel';
    const s = big ? 0.32 : w.cfg.category === 'pistol' ? 0.16 : 0.24;
    this.flash.scale.setScalar(s * (0.8 + Math.random() * 0.4));
    this.flashTime = 0.045;
    this._muzzleWorldPos(_muzzle);
    if (!w.cfg.suppressed) this.world.effects.playerMuzzleLight(_muzzle, w.cfg.energy ? 0x60e0ff : 0xffc070);
    if (!this.scoped) {
      this._emitSmoke();
      const a = w.cfg.action;
      if (a !== 'pump' && a !== 'bolt' && !w.cfg.energy && !w.cfg.launcher) this._ejectCasing(0xc9a248);
    }
  }

  // Ejection port in viewmodel space (from the weapon's eject point).
  _ejectCasing(color) {
    if (!this.model || !this.model.userData.weapon) return;
    const c = this.casingState[this.casingNext];
    this.casingNext = (this.casingNext + 1) % this.casingState.length;
    this.model.updateMatrixWorld(true);
    const ej = this.model.userData.points && this.model.userData.points.eject;
    c.p.copy(ej || _tmp.set(0.03, 0.045, 0.02)).applyMatrix4(this.model.userData.weapon.matrixWorld);
    c.v.set(0.9 + Math.random() * 0.5, 0.9 + Math.random() * 0.4, 0.25 + Math.random() * 0.2);
    c.r.set(Math.random() * 6, Math.random() * 6, 0);
    c.w.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0);
    c.life = 0.8;
    this.casingMat.color.setHex(color);
  }

  _emitSmoke() {
    const muzzle = this.model && this.model.userData.muzzle;
    if (!muzzle) return;
    const k = this.smoke[this.smokeNext];
    this.smokeNext = (this.smokeNext + 1) % this.smoke.length;
    muzzle.getWorldPosition(k.s.position);
    k.v.set((Math.random() - 0.5) * 0.04, 0.08 + Math.random() * 0.05, -0.05);
    k.life = 0.7;
    k.s.visible = true;
  }

  _updateViewFx(dt) {
    const m = _fxM, q = _fxQ, one = _fxOne;
    this.casingState.forEach((c, i) => {
      if (c.life > 0) {
        c.life -= dt;
        c.v.y -= 9.8 * dt;
        c.p.addScaledVector(c.v, dt);
        c.r.x += c.w.x * dt; c.r.y += c.w.y * dt;
      }
      q.setFromEuler(c.r);
      m.compose(c.life > 0 ? c.p : _hidden, q, one);
      this.casings.setMatrixAt(i, m);
    });
    this.casings.instanceMatrix.needsUpdate = true;
    for (const k of this.smoke) {
      if (k.life <= 0) continue;
      k.life -= dt;
      k.s.position.addScaledVector(k.v, dt);
      k.s.scale.setScalar(0.05 + (0.7 - k.life) * 0.18);
      k.s.material.opacity = Math.max(0, k.life / 0.7) * 0.22;
      if (k.life <= 0) k.s.visible = false;
    }
  }

  // World-space muzzle position: the viewmodel lives in camera space, scaled by its layout scale.
  _muzzleWorldPos(out) {
    const mz = this.model && this.model.userData.muzzle;
    if (!mz || this.scoped) {
      this.camera.getWorldDirection(_fwd);
      this.camera.getWorldPosition(out);
      return out.addScaledVector(_fwd, 0.6).y -= 0.05, out;
    }
    this.model.updateMatrixWorld(true);
    mz.getWorldPosition(out); // in view space
    const s = this.model.userData.scale || 0.5;
    out.multiplyScalar(1 / s);
    return this.camera.localToWorld(out);
  }

  // ------------------------------------------------------------------ viewmodel animation
  updateViewModel(dt) {
    const model = this.model;
    if (!model) return;
    this._updateViewFx(dt);
    const w = this.weapon;
    const p = this.player;
    const ud = model.userData;
    model.visible = !this.scoped && p.alive;
    this.idleT += dt;

    // Sway from look movement (reduced while aiming)
    let dyaw = p.yaw - this.prevYaw;
    const dpitch = p.pitch - this.prevPitch;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.prevYaw = p.yaw;
    this.prevPitch = p.pitch;
    const swayK = 1 - this.ads * 0.8;
    this.swayX += (THREE.MathUtils.clamp(dyaw * 1.5, -0.04, 0.04) * swayK - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (THREE.MathUtils.clamp(-dpitch * 1.5, -0.04, 0.04) * swayK - this.swayY) * Math.min(1, dt * 10);

    // Hip ↔ ADS blend
    const a = this.ads * this.ads * (3 - 2 * this.ads);
    const base = ud.basePos;
    const ads = ud.adsPos || base;
    const bobPhase = this.controller.bobPhase;
    const bobAmt = this.controller.bobAmount * (1 - a * 0.85);
    const breathe = 1 - a * 0.7;
    let x = THREE.MathUtils.lerp(base.x, ads.x, a) + this.swayX + Math.cos(bobPhase) * 0.008 * bobAmt;
    let y = THREE.MathUtils.lerp(base.y, ads.y, a) - this.swayY + Math.abs(Math.sin(bobPhase)) * 0.01 * bobAmt + Math.sin(this.idleT * 1.4) * 0.0018 * breathe;
    let z = THREE.MathUtils.lerp(base.z, ads.z, a);
    let rx = Math.sin(this.idleT * 0.9) * 0.004 * breathe, ry = 0, rz = 0;

    // Fire kick
    this.kick *= Math.max(0, 1 - dt * 14);
    this.kickRot *= Math.max(0, 1 - dt * 10);
    z += this.kick * 0.06 * (1 - a * 0.5);
    rx += this.kickRot * 0.12 * (1 - a * 0.6);

    // Draw animation: rise from below
    if (this.switchTimer > 0) {
      const t = this.switchTimer / DRAW_TIME;
      y -= t * t * 0.25;
      rx -= t * 0.6;
    }
    // Fire-mode switch twitch
    if (this.modeTwitch > 0) { this.modeTwitch = Math.max(0, this.modeTwitch - dt); rz += Math.sin((this.modeTwitch / 0.25) * Math.PI) * 0.08; }

    // Inspect: rotate to show the left side, then the right, then back
    if (this.inspectTime > 0 && w && !w.cfg.gear) {
      const t = 1 - this.inspectTime / 2.4;
      const e = Math.sin(t * Math.PI);
      const side = t < 0.5 ? 1 : -0.6;
      ry += e * 0.9 * side;
      rz += e * 0.35;
      rx += e * 0.15;
      x -= e * 0.05;
      y += e * 0.03;
      z += e * 0.05;
    }

    if (w && !w.cfg.gear) this._animateWeapon(model, w, dt, (o) => { x += o.x || 0; y += o.y || 0; z += o.z || 0; rx += o.rx || 0; ry += o.ry || 0; rz += o.rz || 0; });
    else this._animateGear(model, dt, (o) => { x += o.x || 0; y += o.y || 0; z += o.z || 0; rx += o.rx || 0; ry += o.ry || 0; rz += o.rz || 0; });

    model.position.set(x, y, z);
    model.rotation.set(rx, ry, rz);
    if (ud.weapon && ud.kind && ud.kind !== 'knife' && !ud.gear) ud.weapon.rotation.y = 0.045 * (1 - a); // toe-in only from the hip

    // Muzzle flash
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) this.flash.visible = false;
    }
    this._updateLaser(w);
    // Reticle only renders when looking through the optic
    if (ud.reticle) ud.reticle.visible = a > 0.6;
  }

  _animateWeapon(model, w, dt, add) {
    const ud = model.userData;
    // Reload choreography
    if (w.reloading) {
      if (w.reloadPhase === 'full') {
        const prog = 1 - w.reloadTimer / w.cfg.reloadTime;
        const dip = Math.sin(Math.min(1, prog) * Math.PI);
        add({ y: -dip * 0.06, rz: dip * 0.5, rx: dip * 0.22 });
        const mag = ud.mag;
        if (mag) {
          if (mag.userData.base === undefined) mag.userData.base = mag.position.clone();
          const b = mag.userData.base;
          // out (0.15–0.35), hidden (0.35–0.5), in from below (0.5–0.68)
          let off = 0;
          if (prog > 0.15 && prog < 0.35) off = ((prog - 0.15) / 0.2) * 0.22;
          else if (prog >= 0.35 && prog < 0.5) off = 0.3;
          else if (prog >= 0.5 && prog < 0.68) off = (1 - (prog - 0.5) / 0.18) * 0.18;
          mag.position.set(b.x, b.y - off, b.z + off * 0.25);
          mag.visible = !(prog >= 0.35 && prog < 0.5);
          if (ud.meta && ud.meta.launcher) { mag.visible = prog > 0.45; mag.position.z = b.z - (prog < 0.7 ? (0.7 - prog) * 0.6 : 0); mag.position.y = b.y; }
        }
        if (ud.cover) ud.cover.rotation.x = prog > 0.1 && prog < 0.8 ? -Math.sin(((prog - 0.1) / 0.7) * Math.PI) * 1.1 : 0; // belt-fed feed cover
        if (ud.leftHand && ud.mag) {
          if (ud.leftHand.userData.base === undefined) ud.leftHand.userData.base = ud.leftHand.position.clone();
          const lb = ud.leftHand.userData.base;
          const reach = prog > 0.1 && prog < 0.75 ? Math.sin(((prog - 0.1) / 0.65) * Math.PI) : 0;
          const mp = ud.mag.position;
          ud.leftHand.position.set(lb.x + (mp.x - lb.x) * reach * 0.8, lb.y + (mp.y - 0.06 - lb.y) * reach, lb.z + (mp.z + 0.02 - lb.z) * reach);
        }
        // Charge the action after an empty mag (charging handle / slide / bolt part)
        const chargePart = ud.slide || ud.boltPart;
        if (chargePart && this.reloadWasEmpty) {
          if (chargePart.userData.base === undefined) chargePart.userData.base = chargePart.position.clone();
          const c = prog > 0.76 && prog < 0.94 ? Math.sin(((prog - 0.76) / 0.18) * Math.PI) : 0;
          chargePart.position.z = chargePart.userData.base.z + c * (ud.slide ? 0.035 : 0.06);
        }
      } else {
        add({ rz: 0.35, y: -0.03 });
        this.shellBob = (this.shellBob + dt * 4) % 1;
        add({ rx: Math.sin(this.shellBob * Math.PI * 2) * 0.05 });
      }
    } else {
      if (ud.mag && ud.mag.userData.base !== undefined) { ud.mag.position.copy(ud.mag.userData.base); ud.mag.visible = !(ud.meta && ud.meta.launcher && w.mag === 0); }
      if (ud.cover) ud.cover.rotation.x = 0;
      if (ud.leftHand && ud.leftHand.userData.base) ud.leftHand.position.copy(ud.leftHand.userData.base);
    }
    // Per-shot slide / bolt carrier cycling (and pistol slide lock on empty)
    this.cycleTime = Math.max(0, this.cycleTime - dt);
    const cyc = ud.slide || (w.cfg.action !== 'bolt' ? null : null);
    if (cyc && !w.reloading) {
      if (cyc.userData.base === undefined) cyc.userData.base = cyc.position.clone();
      const back = w.mag === 0 ? 1 : this.cycleTime > 0 ? Math.sin((this.cycleTime / 0.09) * Math.PI) : 0;
      cyc.position.z = cyc.userData.base.z + back * 0.03;
    }
    // Shotgun pump
    if (ud.pump && w.cfg.action === 'pump') {
      if (ud.pump.userData.baseZ === undefined) ud.pump.userData.baseZ = ud.pump.position.z;
      this.pumpTime = Math.max(0, this.pumpTime - dt);
      const t = this.pumpTime > 0 && this.pumpTime < 0.4 ? Math.sin((1 - this.pumpTime / 0.4) * Math.PI) : 0;
      ud.pump.position.z = ud.pump.userData.baseZ + t * 0.09;
      add({ rx: t * 0.06 });
    }
    // Bolt action: lift and pull the bolt
    if (w.cfg.action === 'bolt' && ud.boltPart) {
      this.boltTime = Math.max(0, this.boltTime - dt);
      const t = this.boltTime > 0 && this.boltTime < 0.6 ? Math.sin((1 - this.boltTime / 0.6) * Math.PI) : 0;
      if (ud.boltPart.userData.base === undefined) ud.boltPart.userData.base = ud.boltPart.position.clone();
      ud.boltPart.rotation.z = t * 1.1;
      ud.boltPart.position.z = ud.boltPart.userData.base.z + t * 0.07;
      add({ rz: t * 0.15 });
    } else if (ud.bolt) {
      // glTF LR-50 bolt (legacy)
      this.boltTime = Math.max(0, this.boltTime - dt);
      const t = this.boltTime > 0 && this.boltTime < 0.6 ? Math.sin((1 - this.boltTime / 0.6) * Math.PI) : 0;
      add({ rz: t * 0.15 });
    }
    // Energy vents glow with heat
    if (ud.vents) for (const m of ud.vents) m.emissiveIntensity = 0.6 + w.heat * 6 + (w.overheated ? Math.sin(this.idleT * 20) * 2 : 0);
    // Knife slash
    if (w.isMelee && this.slashTime > 0) {
      this.slashTime = Math.max(0, this.slashTime - dt);
      const dur = this.slashHeavy ? 0.5 : 0.3;
      const t = 1 - this.slashTime / dur;
      const s = Math.sin(t * Math.PI);
      if (this.slashHeavy) add({ rx: -s * 1.2, z: -s * 0.12 });
      else add({ ry: s * 1.1, x: -s * 0.12, rz: -s * 0.4 });
    }
  }

  _animateGear(model, dt, add) {
    const ud = model.userData;
    if (this.current === 'grenade') {
      const s = this.throwState;
      if (s) {
        const t = s.t;
        if (t < 0.25) { const k = Math.sin((t / 0.25) * Math.PI); add({ x: -k * 0.05, y: k * 0.02, rz: k * 0.4 }); } // pin pull toward the left hand
        else if (t < 0.5) { const k = (t - 0.25) / 0.25; add(s.under ? { y: -k * 0.08, z: k * 0.06, rx: k * 0.6 } : { y: k * 0.08, z: k * 0.1, rx: -k * 0.9 }); } // wind up
        else { const k = Math.min(1, (t - 0.5) / 0.2); add(s.under ? { y: -0.08 + k * 0.05, z: 0.06 - k * 0.35, rx: 0.6 - k * 1.2 } : { y: 0.08 - k * 0.2, z: 0.1 - k * 0.45, rx: -0.9 + k * 1.6 }); }
        if (s.released) model.userData.item.visible = false;
      } else if (model.userData.item) model.userData.item.visible = true;
      return;
    }
    const id = this.heldId;
    const eq = this.world.equipment;
    if (id === 'binoculars') add({ y: this.ads * 0.1, z: this.ads * 0.15 }); // raise to the eyes
    if (id === 'medkit' && eq && eq.healing > 0) add({ y: Math.sin(eq.healing * 6) * 0.01 + 0.03, rx: -0.3 });
    if (id === 'shield') add({ z: -this.kick * 0.15 });
    this.kick *= Math.max(0, 1 - dt * 8);
  }

  _updateLaser(w) {
    const on = !!(w && w.cfg && w.cfg.hasLaser && this.model && this.model.userData.laserAnchor && !this.scoped && this.player.alive);
    this.laserBeam.visible = on && this.ads < 0.5;
    if (!this.laserDotAdded && this.world.scene) { this.world.scene.add(this.laserDot); this.laserDotAdded = true; }
    this.laserDot.visible = false;
    if (!on) return;
    this.camera.getWorldDirection(_fwd);
    this.camera.getWorldPosition(_origin);
    const hit = this.world.collision.raycast(_origin.x, _origin.y, _origin.z, _fwd.x, _fwd.y, _fwd.z, 60);
    if (hit) {
      this.laserDot.position.set(hit.point.x + hit.normal.x * 0.02, hit.point.y + hit.normal.y * 0.02, hit.point.z + hit.normal.z * 0.02);
      this.laserDot.scale.setScalar(0.04 + hit.dist * 0.004);
      this.laserDot.visible = true;
    }
  }

  render(renderer) {
    if (!this.model || !this.model.visible) return;
    renderer.clearDepth();
    renderer.render(this.viewScene, this.viewCamera);
  }

  resize(aspect) {
    this.viewCamera.aspect = aspect;
    this.viewCamera.updateProjectionMatrix();
  }

  getHudState() {
    const w = this.weapon;
    const gear = w && w.cfg.gear;
    const keys = { primary: '1', secondary: '2', melee: '3', special: '4', grenade: '5', equipment: '6' };
    const gt = this.grenadeType;
    const held = this.heldId;
    let name = w ? w.cfg.name : '';
    if (this.current === 'grenade' && gt) name = THROWABLES[gt].name;
    if (this.current === 'equipment' && held) name = EQUIPMENT[held].name;
    return {
      id: w ? (gear ? (this.current === 'grenade' ? `grenade:${gt}` : `equip:${held}`) : w.id) : '',
      name,
      category: w ? w.cfg.category : '',
      melee: w ? w.isMelee || !!w.cfg.special || !!gear : true,
      mag: w ? w.mag : 0,
      reserve: w ? w.reserve : 0,
      magSize: w && w.cfg.magSize ? w.cfg.magSize : 0,
      reloading: w ? w.reloading : false,
      reloadProgress: w ? w.reloadProgress : 0,
      scoped: this.scoped,
      scopeType: this.scopeType(),
      ads: this.ads,
      fireMode: w && !gear && w.mode ? w.mode : '',
      heat: w && w.cfg.energy ? w.heat : null,
      overheated: !!(w && w.overheated),
      suppressed: !!(w && w.cfg.suppressed),
      grenade: gt ? { type: gt, name: THROWABLES[gt].name, icon: THROWABLES[gt].icon, count: this.grenades[gt] || 0 } : null,
      grenades: Object.entries(this.grenades).map(([t, n]) => ({ type: t, icon: THROWABLES[t].icon, name: THROWABLES[t].name, count: n, active: t === gt })),
      held: held ? { id: held, name: EQUIPMENT[held].name } : null,
      wheel: this.wheel.open ? { entries: this.wheel.entries, choice: this.wheel.choice } : null,
      slots: SLOTS.map((s) => ({
        slot: s, key: keys[s], active: s === this.current,
        name: this.slots[s] ? (s === 'grenade' ? (gt ? `${THROWABLES[gt].name} ×${this.grenades[gt]}` : null) : s === 'equipment' ? (held ? EQUIPMENT[held].name : null) : this.slots[s].cfg.name) : null,
      })),
    };
  }
}
