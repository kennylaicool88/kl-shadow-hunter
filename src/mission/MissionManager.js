// Mission progression: objectives, intelligence log, alert level, strikes and outcome.
// Pure logic (no rendering). Resolution of strikes is delegated to the MissionValidationService.
import { BunkerManager } from '../bunkers/BunkerManager.js';
import { MissionValidationService, FAILURE } from './MissionRules.js';
import { BUNKER_TYPES, CATEGORY_STYLE } from '../tracking/TargetClassification.js';

export const MISSION_PHASE = { ACTIVE: 'ACTIVE', VICTORY: 'VICTORY', FAILED: 'FAILED' };

export class MissionManager {
  constructor(level, { strikes = 3, rules = {} } = {}) {
    this.level = level;
    this.bunkers = new BunkerManager(level.bunkers);
    this.validator = new MissionValidationService(rules);
    this.phase = MISSION_PHASE.ACTIVE;
    this.time = 0;
    this.alert = 10; // 0..100
    this.intelPoints = 0;
    this.score = 0;
    this.strikesTotal = strikes;
    this.strikesUsed = 0;
    this.collected = new Set();
    this.revealedEntrances = new Set(level.entrances.filter((e) => !e.hidden).map((e) => e.id));
    this.firstContact = false;
    this.log = [];
    this.failure = null;
    this.strikeHistory = [];
    this.listeners = [];
    this.addLog('Mission start: Operation Deep Strike. Locate hostile command bunkers beneath the KLCC district.', 'system');
    this.addLog('Rules of engagement: protected surveillance facilities must NOT be struck.', 'warning');
  }

  on(fn) {
    this.listeners.push(fn);
  }

  _emit(type, data) {
    for (const fn of this.listeners) fn(type, data);
  }

  get strikesRemaining() {
    return this.strikesTotal - this.strikesUsed;
  }

  get active() {
    return this.phase === MISSION_PHASE.ACTIVE;
  }

  addLog(text, kind = 'info') {
    const entry = { t: this.time, text, kind };
    this.log.push(entry);
    if (this.log.length > 60) this.log.shift();
    this._emit('log', entry);
    return entry;
  }

  update(dt) {
    if (!this.active) return;
    this.time += dt;
    this.alert = Math.max(5, this.alert - dt * 0.4); // the enemy slowly calms down
  }

  raiseAlert(amount, reason) {
    const before = this.alert;
    this.alert = Math.min(100, this.alert + amount);
    if (reason && Math.floor(before / 25) !== Math.floor(this.alert / 25)) this.addLog(`Enemy alert level ${Math.round(this.alert)}%: ${reason}`, 'warning');
  }

  // ------------------------------------------------------------------ intelligence
  collectIntel(def) {
    if (this.collected.has(def.id) || !this.active) return false;
    this.collected.add(def.id);
    this.intelPoints += 20;
    this.addLog(`INTEL · ${def.name}: ${def.text}`, 'intel');
    for (const r of def.reveals || []) {
      const res = this.bunkers.addIntel(r.bunker, r.evidence);
      if (!res) continue;
      const b = res.bunker;
      if (!b.sources.includes(def.name)) b.sources.push(def.name);
      if (res.discoveredNow) this.addLog(`Facility located: ${b.id} ${b.name} (depth ${b.depthFt} ft).`, 'discovery');
      if (res.confirmedNow) this.addLog(`Classification confirmed: ${b.id} ${b.name} is ${CATEGORY_STYLE[b.category].label}.`, b.trueType === BUNKER_TYPES.SURVEILLANCE ? 'warning' : 'discovery');
      this._emit('bunker', b);
    }
    if (def.revealsEntrance && !this.revealedEntrances.has(def.revealsEntrance)) {
      this.revealedEntrances.add(def.revealsEntrance);
      const e = this.level.entrances.find((x) => x.id === def.revealsEntrance);
      this.addLog(`Hidden entrance discovered: ${e ? e.name : def.revealsEntrance}.`, 'discovery');
    }
    this._emit('intel', def);
    return true;
  }

  // Tracker subsurface scan near a facility (evidence capped below confirmation).
  scan(bunkerId, amount) {
    const res = this.bunkers.addScan(bunkerId, amount);
    if (res && !res.bunker.sources.includes('Tracker subsurface scan')) res.bunker.sources.push('Tracker subsurface scan');
    if (res && res.discoveredNow) {
      this.addLog(`Subsurface signal: unidentified facility ${res.bunker.id} detected (depth ~${res.bunker.depthFt} ft).`, 'discovery');
      this._emit('bunker', res.bunker);
    }
    return res;
  }

  reportContact() {
    if (this.firstContact) return;
    this.firstContact = true;
    this.addLog('Hostile armed personnel confirmed in the district.', 'contact');
  }

  // ------------------------------------------------------------------ objectives
  objectives() {
    const discovered = this.bunkers.discovered().length;
    const total = this.bunkers.list.length;
    const hostiles = this.bunkers.hostiles();
    const destroyed = hostiles.filter((b) => b.status === 'DESTROYED').length;
    const primary = this.bunkers.list.find((b) => b.primary);
    const anyConfirmedHostile = hostiles.some((b) => b.discovery === 'CONFIRMED');
    return [
      { id: 'locate', text: 'Locate suspicious activity in the KLCC district', done: this.firstContact || discovered > 0 || this.collected.size > 0 },
      { id: 'intel', text: `Gather intelligence (${Math.min(this.collected.size, 3)}/3 sources)`, done: this.collected.size >= 3 },
      { id: 'discover', text: `Discover underground facilities (${discovered}/${total})`, done: discovered >= total },
      { id: 'classify', text: 'Positively identify a hostile facility', done: anyConfirmedHostile },
      { id: 'primary', text: `Strike the primary target ${primary ? `${primary.id} ${primary.name}` : ''}`, done: primary ? primary.status === 'DESTROYED' : false },
      { id: 'all', text: `Neutralize all hostile facilities (${destroyed}/${hostiles.length})`, done: destroyed === hostiles.length },
      { id: 'roe', text: 'Do not strike protected facilities', done: false, constraint: true, violated: !!(this.failure && this.failure.reason === FAILURE.PROTECTED_HIT) },
    ];
  }

  // ------------------------------------------------------------------ strikes
  /**
   * Resolves a completed projectile strike through the validation service.
   * strike: { impacts, designatedId, warhead, trackingMode, lockedId }
   */
  resolveStrike(strike) {
    if (!this.active) return null;
    this.strikesUsed++;
    const res = this.validator.resolve(strike, this.bunkers.list);
    this.strikeHistory.push({ ...strike, resolution: res, t: this.time });
    this.intelPoints = Math.max(0, this.intelPoints + res.intelDelta);
    this.score += res.scoreDelta;
    this.raiseAlert(res.alertDelta, 'strike detected');
    if (!res.outcomes.length) this.addLog('Strike resolved: no facility within the effect area.', 'warning');
    for (const o of res.outcomes) {
      const msg = {
        DESTROYED: `${o.bunkerId} ${o.name} NEUTRALIZED.`,
        DECOY_HIT: `${o.bunkerId} ${o.name} was a DECOY. Intelligence -${this.validator.rules.decoyIntelPenalty}, enemy alert raised.`,
        PROTECTED_HIT: `${o.bunkerId} ${o.name}: PROTECTED SURVEILLANCE FACILITY HIT.`,
        UNRESOLVED: `${o.bunkerId} ${o.name}: outcome unresolved.`,
      }[o.result];
      this.addLog(`STRIKE · ${msg}${o.notes.length ? ` (${o.notes.join('; ')})` : ''}`, o.result === 'DESTROYED' ? 'success' : 'warning');
      this._emit('bunker', this.bunkers.get(o.bunkerId));
    }
    // Failure overrides any success in the same strike.
    if (res.failure) {
      this.fail(res.failure.reason, `A protected surveillance facility (${res.failure.bunkerId} ${res.failure.name}) was hit.`);
    } else if (this.bunkers.allHostilesDestroyed()) {
      this.win();
    } else if (this.strikesRemaining <= 0) {
      this.fail(FAILURE.STRIKES_EXHAUSTED, 'All strike assets were used before every hostile facility was neutralized.');
    }
    return res;
  }

  fail(reason, detail) {
    if (this.phase === MISSION_PHASE.FAILED) return;
    // Failure overrides victory, even if victory was already declared this frame.
    this.phase = MISSION_PHASE.FAILED;
    this.failure = { reason, detail };
    this.addLog(`MISSION FAILED: ${detail}`, 'failure');
    this._emit('failed', this.failure);
  }

  win() {
    if (this.phase !== MISSION_PHASE.ACTIVE) return;
    this.phase = MISSION_PHASE.VICTORY;
    this.score += Math.max(0, 600 - Math.floor(this.time)) + this.intelPoints * 5 + this.strikesRemaining * 250;
    this.addLog('All hostile facilities neutralized. Mission accomplished.', 'success');
    this._emit('victory', {});
  }
}
