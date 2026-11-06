// Classic-PC-shooter style movement: ground friction + acceleration, air control, jump, crouch, walk.
import { STAND_HEIGHT, CROUCH_HEIGHT } from './Player.js';

const GRAVITY = 20;
const JUMP_VELOCITY = 6.4;
const RUN_SPEED = 5.4;
const WALK_FACTOR = 0.52;
const CROUCH_FACTOR = 0.34;
const GROUND_ACCEL = 10;
const AIR_ACCEL = 1.2;
const AIR_SPEED_CAP = 1.0;
const FRICTION = 6;
const STOP_SPEED = 1.5;
const MOUSE_SCALE = 0.0022;
const MAX_PITCH = Math.PI / 2 - 0.01;
const STEP_DISTANCE = 2.3;

export class PlayerController {
  constructor(player, input, collision, settings) {
    this.player = player;
    this.input = input;
    this.collision = collision;
    this.settings = settings;
    this.speedModifier = 1; // set by the active weapon
    this.zoomSensitivity = 1; // reduced while scoped
    this.frozen = false; // freeze time: can look but not move
    this.lookLocked = false; // weapon wheel open: mouse movement drives the wheel instead of the view
    this.stepAccumulator = 0;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.landKick = 0; // camera dip on landing
    this.events = { footstep: null, jump: null, land: null, fallDamage: null };
    this._wish = { x: 0, z: 0 };
  }

  get horizontalSpeed() {
    const v = this.player.velocity;
    return Math.hypot(v.x, v.z);
  }

  update(dt) {
    const p = this.player;
    const input = this.input;
    if (!p.alive) return;

    // ---- Mouse look
    const m = this.lookLocked ? { x: 0, y: 0 } : input.consumeMouse();
    const sens = MOUSE_SCALE * this.settings.sensitivity * this.zoomSensitivity;
    p.yaw -= m.x * sens;
    p.pitch -= m.y * sens * (this.settings.invertY ? -1 : 1);
    if (p.pitch > MAX_PITCH) p.pitch = MAX_PITCH;
    if (p.pitch < -MAX_PITCH) p.pitch = -MAX_PITCH;

    // ---- Crouch (Ctrl or C)
    const wantCrouch = input.isDown('ControlLeft') || input.isDown('ControlRight') || input.isDown('KeyC');
    if (wantCrouch) {
      p.crouching = true;
    } else if (p.crouching) {
      // Only stand up if there is room above.
      const pos = p.body.pos;
      if (!this.collision.bodyOverlaps(pos, p.body.radius, STAND_HEIGHT)) p.crouching = false;
    }
    const targetCrouch = p.crouching ? 1 : 0;
    const prevHeight = p.body.height;
    p.crouch += (targetCrouch - p.crouch) * Math.min(1, dt * 12);
    if (Math.abs(p.crouch - targetCrouch) < 0.01) p.crouch = targetCrouch;
    p.body.height = p.crouching ? CROUCH_HEIGHT : STAND_HEIGHT;
    // Crouching in mid-air tucks the legs up (lets you crouch-jump onto higher crates).
    if (!p.body.grounded && p.body.height < prevHeight) {
      const lift = prevHeight - p.body.height;
      p.body.pos.y += lift;
      if (this.collision.bodyOverlaps(p.body.pos, p.body.radius, p.body.height)) p.body.pos.y -= lift;
    }

    // ---- Wish direction (from WASD) in world space
    let fx = 0, sx = 0;
    if (!this.frozen) {
      if (input.isDown('KeyW')) fx += 1;
      if (input.isDown('KeyS')) fx -= 1;
      if (input.isDown('KeyD')) sx += 1;
      if (input.isDown('KeyA')) sx -= 1;
    }
    const sinY = Math.sin(p.yaw), cosY = Math.cos(p.yaw);
    // Forward (yaw 0) is -Z; right is +X.
    let wx = -sinY * fx + cosY * sx;
    let wz = -cosY * fx - sinY * sx;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }

    p.walking = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    let wishSpeed = RUN_SPEED * this.speedModifier * (this.settings.moveSpeed ?? 1);
    if (p.crouching && p.body.grounded) wishSpeed *= CROUCH_FACTOR;
    else if (p.walking) wishSpeed *= WALK_FACTOR;
    if (wl === 0) wishSpeed = 0;

    const v = p.velocity;
    if (p.body.grounded) {
      // Friction
      const speed = Math.hypot(v.x, v.z);
      if (speed > 0) {
        const control = Math.max(speed, STOP_SPEED);
        const newSpeed = Math.max(0, speed - control * FRICTION * dt);
        v.x *= newSpeed / speed;
        v.z *= newSpeed / speed;
      }
      this._accelerate(wx, wz, wishSpeed, GROUND_ACCEL, dt);

      // Jump
      if (!this.frozen && input.wasPressed('Space')) {
        v.y = JUMP_VELOCITY;
        p.body.grounded = false;
        if (this.events.jump) this.events.jump();
      }
    } else {
      this._accelerate(wx, wz, Math.min(wishSpeed, AIR_SPEED_CAP), AIR_ACCEL * 10, dt);
    }

    // Gravity
    v.y -= GRAVITY * dt;
    const preVy = v.y;

    const res = this.collision.moveBody(p.body, v.x * dt, v.y * dt, v.z * dt, true);
    if (res.hitX) v.x = 0;
    if (res.hitZ) v.z = 0;
    if (res.hitCeiling && v.y > 0) v.y = 0;
    if (p.body.grounded) {
      if (preVy < -7 && res.landed) {
        this.landKick = Math.min(0.12, -preVy * 0.008);
        if (this.events.land) this.events.land(-preVy);
        if (preVy < -14 && this.events.fallDamage) this.events.fallDamage(Math.round((-preVy - 14) * 9));
      }
      if (v.y < 0) v.y = 0;
    }

    // Safety net: never fall out of the world.
    if (p.body.pos.y < -10) {
      p.body.pos.y = 2;
      v.x = v.y = v.z = 0;
    }

    // ---- Footsteps & view bob
    const hs = this.horizontalSpeed;
    if (p.body.grounded && hs > 0.5) {
      this.stepAccumulator += hs * dt;
      this.bobPhase += hs * dt * 2.1;
      if (this.stepAccumulator > STEP_DISTANCE) {
        this.stepAccumulator = 0;
        const loud = !p.walking && !p.crouching;
        if (this.events.footstep) this.events.footstep(loud);
      }
    }
    const targetBob = p.body.grounded ? Math.min(1, hs / RUN_SPEED) : 0;
    this.bobAmount += (targetBob - this.bobAmount) * Math.min(1, dt * 8);
    this.landKick *= Math.max(0, 1 - dt * 8);
  }

  _accelerate(wx, wz, wishSpeed, accel, dt) {
    const v = this.player.velocity;
    const current = v.x * wx + v.z * wz;
    const add = wishSpeed - current;
    if (add <= 0) return;
    const accelSpeed = Math.min(accel * dt * Math.max(wishSpeed, 1), add);
    v.x += accelSpeed * wx;
    v.z += accelSpeed * wz;
  }

  // Camera bob offsets for rendering.
  getBob() {
    const a = this.bobAmount;
    return {
      y: Math.abs(Math.sin(this.bobPhase)) * 0.035 * a - this.landKick,
      x: Math.cos(this.bobPhase) * 0.02 * a,
    };
  }
}
