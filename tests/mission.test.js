import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildKLData } from '../src/city/klLevelData.js';
import { MissionManager, MISSION_PHASE } from '../src/mission/MissionManager.js';
import { MissionValidationService, FAILURE } from '../src/mission/MissionRules.js';
import { Bunker } from '../src/bunkers/Bunker.js';
import { BUNKER_TYPES, SCAN_EVIDENCE_CAP, knownType, displayCategory } from '../src/tracking/TargetClassification.js';

const level = buildKLData();
const fresh = () => new MissionManager(level, { strikes: 3 });
const at = (m, id) => m.bunkers.get(id).surface;
const strikeAt = (m, id, warhead = 'unitary', spread = 'tight') => ({
  impacts: m.validator.buildImpacts(at(m, id), warhead, spread), designatedId: id, warhead,
});
const identifyAll = (m) => { for (const b of m.bunkers.list) { b.discovered = true; b.evidence = 100; } };

test('bunkers have unique ids and valid classified types', () => {
  const m = fresh();
  assert.equal(new Set(m.bunkers.list.map((b) => b.id)).size, m.bunkers.list.length);
  assert.throws(() => new Bunker({ id: 'X', type: 'NOT_A_TYPE', surface: [0, 0], size: [1, 1], depthFt: 10 }));
  assert.throws(() => new Bunker({ type: BUNKER_TYPES.HOSTILE, surface: [0, 0], size: [1, 1], depthFt: 10 }));
});

test('facilities start undiscovered; nothing is revealed at mission start', () => {
  const m = fresh();
  for (const b of m.bunkers.list) {
    assert.equal(b.discovered, false);
    assert.equal(displayCategory(b), 'undiscovered');
  }
});

test('intel discovers and confirms; scanning alone cannot confirm', () => {
  const m = fresh();
  m.scan('B-04', 500);
  const b4 = m.bunkers.get('B-04');
  assert.ok(b4.discovered);
  assert.equal(b4.evidence, SCAN_EVIDENCE_CAP);
  assert.equal(knownType(b4), BUNKER_TYPES.UNKNOWN);
  const i1 = level.intel.find((i) => i.id === 'I1');
  const i2 = level.intel.find((i) => i.id === 'I2');
  m.collectIntel(i1);
  assert.equal(m.bunkers.get('B-01').category, 'unknown');
  m.collectIntel(i2);
  assert.equal(m.bunkers.get('B-01').category, 'hostile');
  assert.equal(m.collectIntel(i2), false, 'intel can only be collected once');
});

test('11. hitting a hostile bunker destroys it and advances the mission', () => {
  const m = fresh();
  identifyAll(m);
  const res = m.resolveStrike(strikeAt(m, 'B-01'));
  assert.equal(res.outcomes.length, 1);
  assert.equal(res.outcomes[0].result, 'DESTROYED');
  assert.equal(m.bunkers.get('B-01').status, 'DESTROYED');
  assert.equal(m.phase, MISSION_PHASE.ACTIVE, 'second hostile remains');
  m.resolveStrike(strikeAt(m, 'B-04'));
  assert.equal(m.phase, MISSION_PHASE.VICTORY);
});

test('12. hitting the surveillance bunker causes immediate mission failure', () => {
  const m = fresh();
  identifyAll(m);
  m.resolveStrike(strikeAt(m, 'B-02'));
  assert.equal(m.phase, MISSION_PHASE.FAILED);
  assert.equal(m.failure.reason, FAILURE.PROTECTED_HIT);
});

test('12b. surveillance failure overrides victory (last hostile + protected in the same strike)', () => {
  const m = fresh();
  identifyAll(m);
  m.resolveStrike(strikeAt(m, 'B-04'));
  // A wide cluster on B-01 also reaches the protected SENTINEL post.
  const res = m.resolveStrike(strikeAt(m, 'B-01', 'cluster', 'wide'));
  assert.ok(res.destroyed.includes('B-01'), 'hostile destroyed by the same strike');
  assert.ok(res.outcomes.some((o) => o.result === 'PROTECTED_HIT'));
  assert.equal(m.phase, MISSION_PHASE.FAILED);
  assert.equal(m.failure.reason, FAILURE.PROTECTED_HIT);
});

test('13. hitting a decoy applies the intelligence penalty and raises the alert level', () => {
  const m = fresh();
  identifyAll(m);
  m.intelPoints = 60;
  const alert0 = m.alert;
  const res = m.resolveStrike(strikeAt(m, 'B-03'));
  assert.equal(res.outcomes[0].result, 'DECOY_HIT');
  assert.equal(m.intelPoints, 60 - m.validator.rules.decoyIntelPenalty);
  assert.ok(m.alert >= alert0 + m.validator.rules.decoyAlertIncrease);
  assert.equal(m.phase, MISSION_PHASE.ACTIVE);
});

test('unknown (unidentified) target applies the uncertainty penalty, then its true outcome', () => {
  const m = fresh();
  const res = m.resolveStrike(strikeAt(m, 'B-04'));
  assert.equal(res.outcomes[0].knownType, BUNKER_TYPES.UNKNOWN);
  assert.equal(res.outcomes[0].result, 'DESTROYED');
  assert.ok(res.scoreDelta < m.validator.rules.hostileScore, 'penalised');
  // An unidentified facility that is really the protected post still fails the mission.
  const m2 = fresh();
  m2.resolveStrike(strikeAt(m2, 'B-02'));
  assert.equal(m2.phase, MISSION_PHASE.FAILED);
  // A genuinely unclassifiable facility only gets the uncertainty penalty.
  const v = new MissionValidationService();
  const b = new Bunker({ id: 'X1', name: 'X', type: BUNKER_TYPES.UNKNOWN, surface: [0, 0], size: [10, 10], depthFt: 100 });
  const r = v.resolve({ impacts: v.buildImpacts({ x: 0, z: 0 }, 'unitary') }, [b]);
  assert.equal(r.outcomes[0].result, 'UNRESOLVED');
  assert.equal(r.failure, null);
});

test('14. protected rule holds with multiple effects: every sub-munition is validated', () => {
  const m = fresh();
  identifyAll(m);
  const wide = strikeAt(m, 'B-01', 'cluster', 'wide');
  assert.equal(wide.impacts.length, m.validator.rules.clusterCount);
  const preview = m.validator.preview(wide, m.bunkers.list);
  assert.ok(preview.protectedRisk, 'targeting preview warns about the protected facility');
  // Tight spread stays clear of SENTINEL.
  const tight = strikeAt(m, 'B-01', 'cluster', 'tight');
  assert.equal(m.validator.preview(tight, m.bunkers.list).protectedRisk, false);
  m.resolveStrike(tight);
  assert.equal(m.phase, MISSION_PHASE.ACTIVE);
  assert.equal(m.bunkers.get('B-02').status, 'INTACT');
  // Even a stray sub-munition that alone touches the protected post triggers failure.
  const stray = { impacts: [{ x: 40, z: 40, radius: 3, label: 'sub-x' }, { ...m.validator.buildImpacts(at(m, 'B-02'), 'unitary')[0], label: 'sub-y' }] };
  m.resolveStrike(stray);
  assert.equal(m.phase, MISSION_PHASE.FAILED);
});

test('running out of strikes with hostiles remaining fails the mission', () => {
  const m = new MissionManager(level, { strikes: 1 });
  identifyAll(m);
  m.resolveStrike(strikeAt(m, 'B-03'));
  assert.equal(m.phase, MISSION_PHASE.FAILED);
  assert.equal(m.failure.reason, FAILURE.STRIKES_EXHAUSTED);
});

test('objectives progress with intel and strikes', () => {
  const m = fresh();
  assert.equal(m.objectives().find((o) => o.id === 'locate').done, false);
  for (const id of ['I1', 'I2', 'I3']) m.collectIntel(level.intel.find((i) => i.id === id));
  const obj = Object.fromEntries(m.objectives().map((o) => [o.id, o.done]));
  assert.ok(obj.locate && obj.intel && obj.classify);
  assert.equal(obj.primary, false);
});
