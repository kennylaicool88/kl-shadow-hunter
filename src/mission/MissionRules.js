// Central mission validation service.
//
// EVERY projectile effect (unitary warhead or each cluster sub-munition) is resolved here.
// No other code may change a facility's status, so a generic area effect can never damage a
// protected facility without this service seeing it. A protected surveillance hit always
// produces a mission failure that overrides any victory in the same strike.
import { BUNKER_TYPES, knownType } from '../tracking/TargetClassification.js';

export const DEFAULT_RULES = {
  hostileScore: 1000,
  decoyIntelPenalty: 25, // intel points lost
  decoyAlertIncrease: 30, // enemy alert level increase
  uncertaintyScorePenalty: 150, // striking a facility that was not positively identified
  uncertaintyAlertIncrease: 10,
  strikeAlertIncrease: 10, // any strike raises the alert level
  unitaryRadius: 7, // surface effect radius (abstract game units)
  clusterSubRadius: 6,
  clusterSpread: { tight: 10, wide: 30 },
  clusterCount: 6,
};

export const FAILURE = {
  PROTECTED_HIT: 'PROTECTED_FACILITY_HIT',
  PLAYER_KIA: 'OPERATIVE_KIA',
  STRIKES_EXHAUSTED: 'STRIKE_ASSETS_EXHAUSTED',
};

export class MissionValidationService {
  constructor(rules = {}) {
    this.rules = { ...DEFAULT_RULES, ...rules };
  }

  // Which facilities does a single surface effect touch?
  affectedBunkers(impact, bunkers) {
    return bunkers.filter((b) => b.status !== 'DESTROYED' && b.intersectsCircle(impact.x, impact.z, impact.radius));
  }

  /**
   * Pure evaluation of a strike (does not modify anything).
   * strike: { impacts: [{x, z, radius, label}], designatedId }
   * Returns a resolution describing every affected facility, penalties and whether the mission fails.
   */
  evaluate(strike, bunkers) {
    const r = this.rules;
    const hits = new Map(); // bunker -> labels of the effects that touched it
    for (const imp of strike.impacts) {
      for (const b of this.affectedBunkers(imp, bunkers)) {
        if (!hits.has(b)) hits.set(b, []);
        hits.get(b).push(imp.label || 'impact');
      }
    }
    const res = {
      outcomes: [],
      failure: null,
      intelDelta: 0,
      alertDelta: r.strikeAlertIncrease,
      scoreDelta: 0,
      destroyed: [],
      designatedId: strike.designatedId || null,
      impactCount: strike.impacts.length,
    };
    for (const [b, labels] of hits) {
      const known = knownType(b);
      const o = { bunkerId: b.id, name: b.name, trueType: b.trueType, knownType: known, effects: labels, result: null, notes: [] };
      if (known === BUNKER_TYPES.UNKNOWN) {
        // Struck without positive identification: uncertainty penalty, then the true outcome applies.
        res.scoreDelta -= r.uncertaintyScorePenalty;
        res.alertDelta += r.uncertaintyAlertIncrease;
        o.notes.push('Struck without positive identification (uncertainty penalty)');
      }
      switch (b.trueType) {
        case BUNKER_TYPES.SURVEILLANCE:
          o.result = 'PROTECTED_HIT';
          res.failure = { reason: FAILURE.PROTECTED_HIT, bunkerId: b.id, name: b.name };
          o.notes.push('Protected allied surveillance facility hit');
          break;
        case BUNKER_TYPES.HOSTILE:
          o.result = 'DESTROYED';
          res.scoreDelta += r.hostileScore;
          res.destroyed.push(b.id);
          break;
        case BUNKER_TYPES.DECOY:
          o.result = 'DECOY_HIT';
          res.intelDelta -= r.decoyIntelPenalty;
          res.alertDelta += r.decoyAlertIncrease;
          o.notes.push('Decoy facility: intelligence penalty, enemy alerted');
          break;
        default:
          o.result = 'UNRESOLVED';
          res.scoreDelta -= r.uncertaintyScorePenalty;
          o.notes.push('Facility type could not be determined');
      }
      res.outcomes.push(o);
    }
    return res;
  }

  /** Evaluate and apply a strike to the facilities. Returns the resolution. */
  resolve(strike, bunkers) {
    const res = this.evaluate(strike, bunkers);
    for (const o of res.outcomes) {
      const b = bunkers.find((x) => x.id === o.bunkerId);
      if (o.result === 'DESTROYED') b.status = 'DESTROYED';
      else if (o.result === 'DECOY_HIT' || o.result === 'PROTECTED_HIT') b.status = 'STRUCK';
      // Hitting a facility reveals what it really was.
      b.discovered = true;
      b.evidence = 100;
    }
    return res;
  }

  /** Predicts which facilities a planned strike would affect (for targeting warnings). */
  preview(strike, bunkers) {
    const res = this.evaluate(strike, bunkers);
    return {
      affected: res.outcomes.map((o) => ({ id: o.bunkerId, knownType: o.knownType })),
      // Warn about protected facilities the player KNOWS about, and about unidentified ones.
      protectedRisk: res.outcomes.some((o) => o.knownType === BUNKER_TYPES.SURVEILLANCE),
      unidentified: res.outcomes.some((o) => o.knownType === BUNKER_TYPES.UNKNOWN),
    };
  }

  /** Builds the surface effects of a strike (unitary or cluster) around an aim point. */
  buildImpacts(aim, warhead, spread = 'tight') {
    const r = this.rules;
    if (warhead !== 'cluster') return [{ x: aim.x, z: aim.z, radius: r.unitaryRadius, label: 'unitary' }];
    const out = [{ x: aim.x, z: aim.z, radius: r.clusterSubRadius, label: 'sub-1' }];
    const R = r.clusterSpread[spread] ?? r.clusterSpread.tight;
    for (let i = 1; i < r.clusterCount; i++) {
      const a = (i / (r.clusterCount - 1)) * Math.PI * 2;
      out.push({ x: aim.x + Math.cos(a) * R, z: aim.z + Math.sin(a) * R, radius: r.clusterSubRadius, label: `sub-${i + 1}` });
    }
    return out;
  }
}
