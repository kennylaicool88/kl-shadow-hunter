// Weapon state: ammunition, fire cooldown, reloading, fire mode, heat and accumulated spread.
// No rendering or audio here – WeaponManager drives presentation from the events this returns.
import { getWeaponConfig } from './weaponConfigs.js';
import { applyAttachments, sanitizeAttachments } from './attachmentData.js';
import { COMPAT } from './arsenal.js';

export const DRAW_TIME = 0.45;

export class Weapon {
  /**
   * @param id weapon id
   * @param ammo { mag, reserve } or null for a full weapon
   * @param attachments { slot: attachmentId } (validated against the weapon's category)
   */
  constructor(id, ammo = null, attachments = null) {
    const base = getWeaponConfig(id);
    this.attachments = sanitizeAttachments(COMPAT[base.category], attachments || {});
    this.cfg = applyAttachments(base, this.attachments);
    this.id = id;
    this.mag = ammo ? Math.min(ammo.mag, this.cfg.magSize) : this.cfg.magSize;
    this.reserve = ammo ? ammo.reserve : this.cfg.reserveMax;
    this.cooldown = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.reloadPhase = null; // 'full' | 'start' | 'shell'
    this.shotsFired = 0; // consecutive shots (drives recoil pattern)
    this.shotSpread = 0; // accumulated inaccuracy from sustained fire
    this.sinceLastShot = 99;
    this.zoomIndex = 0;
    this.modeIndex = 0;
    this.heat = 0; // energy weapons: 0..1, overheats at 1
    this.overheated = false;
  }

  get isMelee() {
    return !!this.cfg.melee;
  }

  // Current fire mode: 'auto' | 'burst' | 'semi' | 'bolt' | 'pump' | 'single'
  get mode() {
    const m = this.cfg.modes;
    if (m && m.length) return m[this.modeIndex % m.length];
    return this.cfg.auto ? 'auto' : 'semi';
  }

  cycleMode() {
    const m = this.cfg.modes;
    if (!m || m.length < 2) return false;
    this.modeIndex = (this.modeIndex + 1) % m.length;
    return true;
  }

  get reloadProgress() {
    if (!this.reloading) return 0;
    if (this.reloadPhase === 'full') return 1 - this.reloadTimer / this.cfg.reloadTime;
    // Shell-by-shell: progress = fraction of the magazine filled.
    return this.mag / this.cfg.magSize;
  }

  canFire() {
    if (this.cooldown > 0) return false;
    if (this.isMelee) return true;
    if (this.mag <= 0) return false;
    if (this.overheated) return false;
    // Shotguns can interrupt shell reloading to fire; magazine weapons cannot.
    if (this.reloading && !this.cfg.shellReload) return false;
    return true;
  }

  // Consumes a round if possible. Returns true if a shot was fired.
  tryFire(interval = this.cfg.fireInterval) {
    if (!this.canFire()) return false;
    if (this.reloading) this.cancelReload();
    if (!this.isMelee) this.mag--;
    this.cooldown = interval;
    if (this.sinceLastShot > this.cfg.fireInterval * 2.5) this.shotsFired = 0;
    this.shotsFired++;
    this.sinceLastShot = 0;
    const sp = this.cfg.spread;
    if (sp) this.shotSpread = Math.min(sp.max, this.shotSpread + sp.perShot);
    if (this.cfg.heatPerShot) {
      this.heat = Math.min(1, this.heat + this.cfg.heatPerShot);
      if (this.heat >= 1) this.overheated = true;
    }
    return true;
  }

  startReload() {
    if (this.isMelee || this.reloading) return false;
    if (this.mag >= this.cfg.magSize || this.reserve <= 0) return false;
    this.reloading = true;
    this.zoomIndex = 0;
    if (this.cfg.shellReload) {
      this.reloadPhase = 'start';
      this.reloadTimer = this.cfg.reloadStart ?? 0.3;
    } else {
      this.reloadPhase = 'full';
      this.reloadTimer = this.cfg.reloadTime;
    }
    return true;
  }

  cancelReload() {
    this.reloading = false;
    this.reloadPhase = null;
    this.reloadTimer = 0;
  }

  // Called when the weapon is drawn.
  deploy() {
    this.cancelReload();
    this.cooldown = Math.max(this.cooldown, DRAW_TIME);
    this.shotsFired = 0;
    this.zoomIndex = 0;
  }

  refill() {
    this.mag = this.cfg.magSize;
    this.reserve = this.cfg.reserveMax;
    this.heat = 0;
    this.overheated = false;
    this.cancelReload();
  }

  /** Advances timers. Returns 'reloaded' | 'shell' | 'cooled' | null. */
  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.sinceLastShot += dt;
    const sp = this.cfg.spread;
    if (sp && this.sinceLastShot > this.cfg.fireInterval) {
      this.shotSpread = Math.max(0, this.shotSpread - sp.recovery * dt);
      if (this.sinceLastShot > this.cfg.fireInterval * 2.5) this.shotsFired = 0;
    }
    if (this.cfg.heatPerShot && this.sinceLastShot > 0.15) {
      this.heat = Math.max(0, this.heat - dt * (this.overheated ? 0.45 : 0.6));
      if (this.overheated && this.heat <= 0) { this.overheated = false; return 'cooled'; }
    }
    if (!this.reloading) return null;

    this.reloadTimer -= dt;
    if (this.reloadTimer > 0) return null;

    if (this.reloadPhase === 'full') {
      const take = Math.min(this.cfg.magSize - this.mag, this.reserve);
      this.mag += take;
      this.reserve -= take;
      this.cancelReload();
      return 'reloaded';
    }
    if (this.reloadPhase === 'start') {
      this.reloadPhase = 'shell';
      this.reloadTimer += this.cfg.reloadTime;
      return null;
    }
    // Shell phase: load one shell.
    this.mag++;
    this.reserve--;
    if (this.mag < this.cfg.magSize && this.reserve > 0) {
      this.reloadTimer += this.cfg.reloadTime;
      return 'shell';
    }
    this.cancelReload();
    return 'reloaded';
  }

  /**
   * Current inaccuracy cone (radians) given the shooter's movement state.
   * state: { speed (m/s), runSpeed, grounded, crouching, scoped, ads (0..1 aim-down-sights blend) }
   */
  getSpread(state) {
    const cfg = this.cfg;
    if (this.isMelee || cfg.special) return 0;
    const sp = cfg.spread;
    const moveFrac = Math.min(1, state.speed / (state.runSpeed || 5.4));
    let s = sp.base + sp.move * moveFrac * moveFrac + this.shotSpread;
    if (!state.grounded) s += sp.air;
    if (state.crouching && state.grounded) s *= sp.crouch;
    if (cfg.unscopedSpread !== undefined && !state.scoped) s += cfg.unscopedSpread;
    const ads = state.ads || 0;
    if (ads > 0 && cfg.ads) s *= 1 - ads * (1 - cfg.ads.spreadMul);
    else if (cfg.hipSpreadMul) s *= cfg.hipSpreadMul;
    return s;
  }

  // Ammo snapshot used when a weapon is dropped and picked up again.
  getAmmo() {
    return { mag: this.mag, reserve: this.reserve };
  }
}
