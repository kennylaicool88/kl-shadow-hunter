// Player entity: health/armor/stats and the physical body used for collision and hit detection.
import { hitTestCharacter, computeDamage } from '../game/combat.js';

export const STAND_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.2;
export const STAND_EYE = 1.65;
export const CROUCH_EYE = 1.08;

export class Player {
  constructor() {
    this.isPlayer = true;
    this.name = 'You';
    this.team = 'A';
    this.body = { pos: { x: 0, y: 0, z: 0 }, radius: 0.4, height: STAND_HEIGHT, grounded: false };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.recoilPitch = 0; // view punch from weapon recoil (radians), recovers over time
    this.recoilYaw = 0;
    this.crouch = 0; // 0 = standing, 1 = fully crouched (smoothed)
    this.crouching = false;
    this.walking = false;
    this.health = 100;
    this.armor = 0;
    this.alive = true;
    this.kills = 0;
    this.deaths = 0;
    this.headshots = 0;
    this.lastDamageTime = -10;
    this.onDamaged = null; // (amount, info) => void
    this.onKilled = null; // (info) => void
  }

  get position() {
    return this.body.pos;
  }

  get eyeHeight() {
    return STAND_EYE + (CROUCH_EYE - STAND_EYE) * this.crouch;
  }

  getEyePosition(out) {
    out.x = this.body.pos.x;
    out.y = this.body.pos.y + this.eyeHeight;
    out.z = this.body.pos.z;
    return out;
  }

  // Point a bot aims at. part: 'head' | 'body'
  getAimPoint(out, part = 'body') {
    out.x = this.body.pos.x;
    out.z = this.body.pos.z;
    out.y = this.body.pos.y + (part === 'head' ? this.body.height - 0.17 : this.body.height * 0.62);
    return out;
  }

  hitTest(ox, oy, oz, dx, dy, dz, maxDist) {
    if (!this.alive) return null;
    return hitTestCharacter(this.body.pos, this.body.height, ox, oy, oz, dx, dy, dz, maxDist);
  }

  reset(spawn, yaw) {
    this.body.pos.x = spawn[0];
    this.body.pos.y = spawn[1];
    this.body.pos.z = spawn[2];
    this.body.height = STAND_HEIGHT;
    this.body.grounded = false;
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.crouch = 0;
    this.crouching = false;
    this.health = 100;
    this.alive = true;
  }

  /**
   * info: { attacker, part, direction:{x,z}, armorRatio, weaponName }
   * Returns health damage dealt.
   */
  applyDamage(raw, info) {
    if (!this.alive) return 0;
    const d = computeDamage(raw, this.armor, info.armorRatio ?? 0.5, info.part);
    this.armor = Math.max(0, this.armor - d.armor);
    const dealt = Math.min(this.health, d.health);
    this.health -= dealt;
    this.lastDamageTime = performance.now() / 1000;
    if (this.onDamaged) this.onDamaged(dealt, info);
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.deaths++;
      if (this.onKilled) this.onKilled(info);
    }
    return dealt;
  }
}
