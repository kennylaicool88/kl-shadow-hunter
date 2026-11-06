// Fictional "Deep Strike" projectile: a scripted, time-compressed cinematic flight.
// Motion is authored (Bézier curves, a cruise arc and in-game waypoint corridors) – no physics,
// guidance law or real-world flight model. It is completely separate from FPS player movement.
import * as THREE from 'three';
import { ProjectileStateMachine, TIME_COMPRESSION } from './ProjectileStateMachine.js';
import { ProjectileEffects } from './ProjectileEffects.js';
import { TargetTracker, TRACK_MODES } from '../tracking/TrackingModes.js';

const ALT_DISPLAY = 75; // fictional: world metres → displayed feet
const DIST_DISPLAY = 0.025; // fictional: world metres → displayed km
const CRUISE_R = 560;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

function bezier(p0, p1, p2, p3, t, out) {
  const k = 1 - t;
  return out.set(0, 0, 0)
    .addScaledVector(p0, k * k * k).addScaledVector(p1, 3 * k * k * t)
    .addScaledVector(p2, 3 * k * t * t).addScaledVector(p3, t * t * t);
}

const easeInOut = (t) => t * t * (3 - 2 * t);
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export class SciFiProjectile {
  /**
   * ctx: { scene, collision, level, audio }
   * opts: { target: {kind,id,label,getPos()}, warhead, spread, trackMode, getSignatures(), interference(t), onTerminal(aim) -> impacts[], onImpact(info) }
   */
  constructor(ctx, opts) {
    this.ctx = ctx;
    this.opts = opts;
    this.sm = new ProjectileStateMachine(opts.durations);
    this.fx = new ProjectileEffects(ctx.scene);
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 1, 0);
    this.aim = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camFov = 70;
    this.shake = 0;
    this.seg = null;
    this.tracker = null;
    this.fallback = false;
    this.impacts = null;
    this.visited = [];
    this.booms = new Set();
    this.done = false;
    this.sm.on((state) => this._enter(state));
    const tp = opts.target.getPos();
    this.aim.set(tp.x, tp.y, tp.z);
    this.designatedAim = this.aim.clone();
    this.pad = v3(ctx.level.launchPad);
    this.sm.selectTarget(opts.target);
    this.sm.launch();
  }

  get state() {
    return this.sm.state;
  }

  // ---------------------------------------------------------------- per-state paths
  _enter(state) {
    this.visited.push(state);
    const P = this.pad;
    const audio = this.ctx.audio;
    switch (state) {
      case 'LAUNCH':
        this.pos.copy(P).add(new THREE.Vector3(0, 6, 0));
        this.prev.copy(this.pos);
        this.seg = { kind: 'bez', p: [P.clone().setY(6), P.clone().setY(20), P.clone().setY(40), P.clone().setY(70)], ease: (t) => t * t };
        this.camPos.copy(P).add(new THREE.Vector3(55, 14, 70));
        this.camLook.copy(this.pos);
        audio.launchRoar && audio.launchRoar();
        break;
      case 'ASCENT':
        this.seg = { kind: 'bez', p: [this.pos.clone(), P.clone().setY(520), P.clone().add(new THREE.Vector3(-140, 940, 60)), P.clone().add(new THREE.Vector3(-330, 1150, 120))] };
        break;
      case 'HIGH_ALTITUDE_CINEMATIC': {
        const th = -1.2;
        this.cruiseStart = th;
        const end = new THREE.Vector3(Math.cos(th) * CRUISE_R, 1420, Math.sin(th) * CRUISE_R);
        const tan = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th)).multiplyScalar(-1); // heading for a clockwise cruise
        this.seg = { kind: 'bez', p: [this.pos.clone(), this.pos.clone().add(new THREE.Vector3(-20, 320, -120)), end.clone().addScaledVector(tan, -260).setY(1500), end] };
        break;
      }
      case 'CRUISE':
        // Auto-cruise: scripted arc around the district.
        this.seg = { kind: 'arc', from: this.cruiseStart, to: this.cruiseStart - 3.5, y0: 1420, y1: 1300 };
        break;
      case 'AUTOPILOT': {
        // Autopilot: follow the predefined corridor whose entry point is closest.
        const corridors = Object.entries(this.ctx.level.corridors);
        let best = corridors[0], bd = Infinity;
        for (const c of corridors) {
          const d = this.pos.distanceTo(v3(c[1][0]));
          if (d < bd) { bd = d; best = c; }
        }
        this.corridor = best[0];
        const pts = [this.pos.clone(), ...best[1].map(v3)];
        const last = pts[pts.length - 1];
        const away = new THREE.Vector3(last.x - this.aim.x, 0, last.z - this.aim.z).normalize();
        this.trackStart = this.aim.clone().addScaledVector(away, 170).setY(430);
        pts.push(this.trackStart.clone());
        this.waypoints = pts;
        this.seg = { kind: 'spline', curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal') };
        break;
      }
      case 'TARGET_TRACKING': {
        const env = { lineOfSight: (a, b) => this.ctx.collision.lineClear(a.x, a.y, a.z, b.x, b.y + 1.5, b.z) };
        this.tracker = new TargetTracker(this.opts.trackMode, this.opts.target.id, env);
        this.seg = { kind: 'track', from: this.pos.clone() };
        audio.lockTone && audio.lockTone('acquire');
        break;
      }
      case 'TERMINAL_APPROACH':
        if (!this.tracker || !this.tracker.everLocked || this.tracker.state !== 'LOCKED') {
          this.fallback = !this.tracker || !this.tracker.aimPoint;
          if (this.tracker && this.tracker.aimPoint && !this.fallback) this.aim.set(this.tracker.aimPoint.x, this.tracker.aimPoint.y, this.tracker.aimPoint.z);
          else this.aim.copy(this.designatedAim);
        }
        this.seg = { kind: 'terminal', from: this.pos.clone() };
        this.impacts = this.opts.onTerminal(this.aim.clone(), this.tracker ? this.tracker.lockedId : null);
        break;
      case 'IMPACT':
        // Unitary: resolve at the final (possibly moved) aim point. Cluster sub-impacts were fixed at the split.
        if (!this.split) this.impacts = this.opts.onTerminal(this.aim.clone(), this.tracker ? this.tracker.lockedId : null);
        this.pos.set(this.aim.x, 0.5, this.aim.z);
        this.fx.missile.visible = false;
        this.fx.clearSubs();
        this.fx.explode(this.impacts.map((i) => ({ x: i.x, z: i.z })));
        this.shake = 2.2;
        this.camPos.set(this.aim.x + 70, 26, this.aim.z + 70);
        audio.impactBoom && audio.impactBoom();
        break;
      case 'IMPACT_RESOLUTION':
        this.opts.onImpact({
          aim: this.aim.clone(), impacts: this.impacts, lockedId: this.tracker ? this.tracker.lockedId : null,
          fallback: this.fallback, visited: [...this.visited],
        });
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    if (this.done) return;
    this.prev.copy(this.pos);
    this.sm.update(dt);
    const st = this.sm.state;
    const t = this.sm.progress;
    const seg = this.seg;
    if (seg && this.sm.inFlight) {
      if (seg.kind === 'bez') {
        bezier(seg.p[0], seg.p[1], seg.p[2], seg.p[3], seg.ease ? seg.ease(t) : t, this.pos);
      } else if (seg.kind === 'arc') {
        const a = seg.from + (seg.to - seg.from) * t;
        this.pos.set(Math.cos(a) * CRUISE_R, seg.y0 + (seg.y1 - seg.y0) * t, Math.sin(a) * CRUISE_R);
        this.cruiseProgress = t;
      } else if (seg.kind === 'spline') {
        seg.curve.getPointAt(easeInOut(t) * 0.999 + 0.0005, this.pos);
        this.autopilotProgress = t;
      } else if (seg.kind === 'track') {
        // Glide from the corridor exit toward a point above the (tracked) aim point.
        const tr = this.tracker;
        if (tr) {
          _a.copy(this.aim).sub(this.pos).normalize();
          tr.update(dt, { pos: this.pos, dir: _a }, this.opts.getSignatures(), this.opts.interference ? this.opts.interference(this.sm.flightTime) : 0);
          for (const e of tr.events) this._trackEvent(e);
          if (tr.aimPoint) this.aim.set(tr.aimPoint.x, tr.aimPoint.y, tr.aimPoint.z);
        }
        _b.copy(this.aim).setY(this.aim.y + 210).lerp(seg.from, 0.25);
        this.pos.lerpVectors(seg.from, _b, easeInOut(t));
      } else if (seg.kind === 'terminal') {
        // Keep following a moving lock during the first half of the dive.
        if (this.tracker && t < 0.5) {
          _a.copy(this.aim).sub(this.pos).normalize();
          // Terminal commit: only the locked signature is followed (no re-targeting in the dive).
          const sigs = this.opts.getSignatures().filter((s) => s.id === this.tracker.lockedId);
          this.tracker.update(dt, { pos: this.pos, dir: _a }, sigs, 0);
          if (this.tracker.aimPoint && this.tracker.state === 'LOCKED') this.aim.set(this.tracker.aimPoint.x, this.tracker.aimPoint.y, this.tracker.aimPoint.z);
        }
        _a.copy(seg.from);
        _b.copy(this.aim).setY(this.aim.y + seg.from.y * 0.6);
        _c.set(this.aim.x, 0.5, this.aim.z);
        const k = 1 - t * t;
        this.pos.set(0, 0, 0).addScaledVector(_a, k * k).addScaledVector(_b, 2 * k * (1 - k)).addScaledVector(_c, (1 - k) * (1 - k));
        // Cluster split
        if (this.opts.warhead === 'cluster' && t > 0.35 && !this.split) {
          this.split = true;
          this.fx.missile.visible = false;
          this.fx.splitCluster(this.pos, this.impacts);
          this.ctx.audio.clusterSplit && this.ctx.audio.clusterSplit();
        }
        if (this.split) this.fx.updateSubs((t - 0.35) / 0.65);
        this.shake = Math.max(this.shake, t * 0.9);
      }
      if (this.pos.distanceToSquared(this.prev) > 1e-6) this.dir.copy(this.pos).sub(this.prev).normalize();
      this.fx.missile.position.copy(this.pos);
      // Seeker (nose-camera) states: hide the airframe so it doesn't fill the view.
      if (!this.split) this.fx.missile.visible = st !== 'TARGET_TRACKING' && st !== 'TERMINAL_APPROACH';
      _a.copy(this.pos).sub(this.dir);
      this.fx.missile.lookAt(_a); // model nose is -Z
      if (!this.split) this.fx.pushTrail(this.pos, st !== 'HIGH_ALTITUDE_CINEMATIC');
      if (st === 'LAUNCH') { this.fx.puff({ x: this.pad.x, y: 3, z: this.pad.z }, 10, 16); this.shake = 0.6; }
      // Sonic boom cues as the display speed passes milestones.
      for (const m of [1, 5, 10]) {
        if (this.sm.mach >= m && !this.booms.has(m)) { this.booms.add(m); this.ctx.audio.sonicBoom && this.ctx.audio.sonicBoom(m); if (m >= 5) this.shake = Math.max(this.shake, 0.8); }
      }
    }
    this.fx.update(dt);
    this.shake = Math.max(0, this.shake - dt * 1.4);
    this.ctx.audio.flightWind && this.ctx.audio.flightWind(this.sm.inFlight ? this.sm.mach / 10 : 0);
  }

  _trackEvent(e) {
    const a = this.ctx.audio;
    if (e.type === 'locked') a.lockTone && a.lockTone('locked');
    if (e.type === 'lock-lost') a.lockTone && a.lockTone('lost');
    if (this.opts.onTrackEvent) this.opts.onTrackEvent(e);
  }

  // ---------------------------------------------------------------- cinematic camera
  updateCamera(camera, dt) {
    const st = this.sm.state;
    const p = this.pos;
    const d = this.dir;
    const right = _a.crossVectors(d, camera.up).normalize();
    let target = _b, look = _c, fov = 70, k = 3.5;
    switch (st) {
      case 'LAUNCH': target.copy(this.pad).add(new THREE.Vector3(55, 14 + this.sm.progress * 20, 70)); look.copy(p); fov = 60; break;
      case 'ASCENT': target.copy(p).addScaledVector(d, -38).add(new THREE.Vector3(0, -6, 0)).addScaledVector(right, 10); look.copy(p).addScaledVector(d, 20); fov = 68; break;
      case 'HIGH_ALTITUDE_CINEMATIC': target.copy(p).add(new THREE.Vector3(260, 140, 260)); look.copy(p).addScaledVector(d, 120); fov = 58; k = 2; break;
      case 'CRUISE': target.copy(p).addScaledVector(right, 46).addScaledVector(d, -24).add(new THREE.Vector3(0, 10, 0)); look.copy(p).addScaledVector(d, 30); fov = 72; break;
      case 'AUTOPILOT': target.copy(p).addScaledVector(d, -34).add(new THREE.Vector3(0, 8, 0)); look.copy(p).addScaledVector(d, 60); fov = 74; break;
      case 'TARGET_TRACKING':
      case 'TERMINAL_APPROACH': target.copy(p).addScaledVector(d, 4).add(new THREE.Vector3(0, 0.6, 0)); look.copy(this.aim); fov = st === 'TARGET_TRACKING' ? 42 : 60; k = 8; break;
      case 'IMPACT':
      case 'IMPACT_RESOLUTION': target.set(this.aim.x + 70, 26, this.aim.z + 70); look.copy(this.aim).setY(8); fov = 64; k = 3; break;
      default: target.copy(camera.position); look.copy(p);
    }
    const f = 1 - Math.exp(-dt * k);
    this.camPos.lerp(target, f);
    this.camLook.lerp(look, Math.min(1, f * 1.5));
    camera.position.copy(this.camPos);
    if (this.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * this.shake;
      camera.position.y += (Math.random() - 0.5) * this.shake;
      camera.position.z += (Math.random() - 0.5) * this.shake;
    }
    camera.lookAt(this.camLook);
    this.camFov += (fov - this.camFov) * f;
    if (Math.abs(camera.fov - this.camFov) > 0.01) { camera.fov = this.camFov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    this.fx.updateStreaks(dt, camera, this.sm.inFlight ? Math.max(0, (this.sm.mach - 3) / 7) : 0);
  }

  telemetry() {
    const st = this.sm.state;
    const guidance = {
      LAUNCH: 'IGNITION', ASCENT: 'BOOST', HIGH_ALTITUDE_CINEMATIC: 'HIGH-ALTITUDE', CRUISE: 'AUTO-CRUISE',
      AUTOPILOT: `AUTOPILOT · ${(this.corridor || '').toUpperCase()} CORRIDOR`,
      TARGET_TRACKING: this.opts.trackMode === TRACK_MODES.HEAT_TRACE ? 'HEAT-TRACE' : 'AUTO-TRACE',
      TERMINAL_APPROACH: 'TERMINAL', IMPACT: 'IMPACT', IMPACT_RESOLUTION: 'RESOLUTION',
    }[st] || st;
    let progressLabel = '';
    if (st === 'CRUISE') progressLabel = `auto-cruise path ${Math.round((this.cruiseProgress || 0) * 100)}%`;
    if (st === 'AUTOPILOT') progressLabel = `waypoint ${Math.min(this.waypoints.length - 1, 1 + Math.floor((this.autopilotProgress || 0) * (this.waypoints.length - 1)))}/${this.waypoints.length - 1}`;
    return {
      state: st,
      mach: this.sm.mach,
      altitudeFt: Math.max(0, this.pos.y) * ALT_DISPLAY,
      flightTimeDisplay: this.sm.flightTime * TIME_COMPRESSION,
      compression: TIME_COMPRESSION,
      distanceKm: Math.hypot(this.pos.x - this.aim.x, this.pos.z - this.aim.z, this.pos.y) * DIST_DISPLAY,
      guidance,
      progressLabel,
      targetLabel: this.opts.target.label,
      warhead: this.opts.warhead === 'cluster' ? `CLUSTER (${this.opts.spread})` : 'UNITARY',
      fallback: this.fallback,
    };
  }

  finish() {
    this.done = true;
    this.ctx.audio.flightWind && this.ctx.audio.flightWind(0);
    this.fx.dispose();
  }
}
