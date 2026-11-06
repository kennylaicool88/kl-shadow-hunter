// Fictional seeker simulation for the projectile's TARGET_TRACKING phase.
// Works only on the game's own simulated signatures (bunker vents, hostile NPC positions).
//
// AUTO_TRACE : visual lock on the designated target. Needs line of sight inside a narrow cone.
// HEAT_TRACE : follows the strongest thermal signature in a wider cone. Locks faster, but hot
//              decoys can steal the lock ("decoy interference").
// Both modes model acquisition time, lock stability, confidence, signal interruption and lock loss.

export const TRACK_MODES = {
  AUTO_TRACE: 'AUTO_TRACE',
  HEAT_TRACE: 'HEAT_TRACE',
};

const MODE_CFG = {
  AUTO_TRACE: { acquireTime: 1.2, coneDeg: 18, stabilityGain: 1.6, stabilityLoss: 2.2, interferenceWeight: 1.0 },
  HEAT_TRACE: { acquireTime: 0.6, coneDeg: 24, stabilityGain: 2.2, stabilityLoss: 1.4, interferenceWeight: 0.6 },
};

export const LOCK_STATE = {
  SEARCHING: 'SEARCHING',
  ACQUIRING: 'ACQUIRING',
  LOCKED: 'LOCKED',
  LOST: 'LOCK LOST',
};

function angleBetween(dir, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const dot = (dir.x * dx + dir.y * dy + dir.z * dz) / len;
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

export class TargetTracker {
  /**
   * designatedId: id of the selected target signature.
   * env.lineOfSight(from, to) -> bool (defaults to always visible)
   */
  constructor(mode, designatedId, env = {}) {
    if (!MODE_CFG[mode]) throw new Error(`Unknown tracking mode ${mode}`);
    this.mode = mode;
    this.cfg = MODE_CFG[mode];
    this.designatedId = designatedId;
    this.env = env;
    this.state = LOCK_STATE.SEARCHING;
    this.lockProgress = 0;
    this.stability = 0;
    this.lockedId = null;
    this.candidateId = null;
    this.aimPoint = null;
    this.decoyInterference = false;
    this.signalInterrupted = false;
    this.events = [];
    this.everLocked = false;
  }

  get confidence() {
    return Math.max(0, Math.min(1, this.lockProgress * (0.35 + 0.65 * this.stability)));
  }

  _visible(seeker, sig) {
    if (angleBetween(seeker.dir, seeker.pos, sig.pos) > (this.cfg.coneDeg * Math.PI) / 180) return false;
    return this.env.lineOfSight ? this.env.lineOfSight(seeker.pos, sig.pos) : true;
  }

  _pickCandidate(seeker, signatures) {
    if (this.mode === TRACK_MODES.AUTO_TRACE) {
      const s = signatures.find((x) => x.id === this.designatedId);
      return s && this._visible(seeker, s) ? s : null;
    }
    // HEAT_TRACE: strongest thermal return, weighted toward the centre of the seeker cone.
    // Hysteresis: once locked, another signature must score clearly higher to steal the lock.
    let best = null, bestScore = 0, lockedSig = null, lockedScore = 0;
    const cone = (this.cfg.coneDeg * Math.PI) / 180;
    for (const s of signatures) {
      if (!(s.heat > 0) || !this._visible(seeker, s)) continue;
      const centred = 1 - angleBetween(seeker.dir, seeker.pos, s.pos) / cone;
      const score = s.heat * centred * centred;
      if (s.id === this.lockedId) { lockedSig = s; lockedScore = score; }
      if (score > bestScore) { bestScore = score; best = s; }
    }
    if (lockedSig && best !== lockedSig && bestScore < lockedScore * 1.25) return lockedSig;
    return best;
  }

  /**
   * seeker: { pos:{x,y,z}, dir:{x,y,z} (normalised) }
   * signatures: [{ id, pos, heat, decoy }]
   * interference: 0..1 simulated jamming/clutter this frame
   */
  update(dt, seeker, signatures, interference = 0) {
    this.events.length = 0;
    const cand = this._pickCandidate(seeker, signatures);
    this.signalInterrupted = interference > 0.5;
    const noise = interference * this.cfg.interferenceWeight;

    if (cand && this.lockedId && cand.id !== this.lockedId) {
      // Lock switches to a different (hotter) signature.
      this.events.push({ type: 'lock-switched', from: this.lockedId, to: cand.id });
      this.lockedId = cand.id;
      this.stability *= 0.5;
    }
    if (cand) {
      this.candidateId = cand.id;
      this.decoyInterference = !!cand.decoy && cand.id !== this.designatedId;
      if (this.decoyInterference && !this._decoyWarned) {
        this._decoyWarned = true;
        this.events.push({ type: 'decoy-interference', id: cand.id });
      }
      if (!this.signalInterrupted) this.lockProgress = Math.min(1, this.lockProgress + dt / this.cfg.acquireTime);
      this.stability = Math.max(0, Math.min(1, this.stability + dt * (this.cfg.stabilityGain * (1 - noise) - noise * 2)));
      if (this.lockProgress >= 1 && this.state !== LOCK_STATE.LOCKED && this.stability > 0.3) {
        this.state = LOCK_STATE.LOCKED;
        this.lockedId = cand.id;
        this.everLocked = true;
        this.events.push({ type: 'locked', id: cand.id });
      } else if (this.state !== LOCK_STATE.LOCKED) {
        this.state = LOCK_STATE.ACQUIRING;
      }
      if (this.state === LOCK_STATE.LOCKED) this.aimPoint = { x: cand.pos.x, y: cand.pos.y, z: cand.pos.z };
    } else {
      this.candidateId = null;
      this.stability = Math.max(0, this.stability - dt * this.cfg.stabilityLoss);
      this.lockProgress = Math.max(0, this.lockProgress - dt * 0.6);
      if (this.state === LOCK_STATE.ACQUIRING) this.state = LOCK_STATE.SEARCHING;
    }
    if (this.state === LOCK_STATE.LOCKED && (this.stability < 0.2 || (!cand && this.lockProgress < 0.5))) {
      this.state = LOCK_STATE.LOST;
      this.events.push({ type: 'lock-lost', id: this.lockedId });
      this.lockedId = null;
      this.lockProgress *= 0.4;
    } else if (this.state === LOCK_STATE.LOST && cand) {
      this.state = LOCK_STATE.ACQUIRING;
    }
    return this;
  }
}
