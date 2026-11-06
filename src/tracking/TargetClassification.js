// Target classification: how much the player KNOWS about each facility.
// Pure logic, kept separate from rendering and from the mission rules that act on true types.

export const BUNKER_TYPES = {
  HOSTILE: 'HOSTILE_BUNKER',
  SURVEILLANCE: 'SURVEILLANCE_BUNKER',
  DECOY: 'DECOY_BUNKER',
  UNKNOWN: 'UNKNOWN_BUNKER',
};

export const DISCOVERY = {
  UNDISCOVERED: 'UNDISCOVERED',
  DETECTED: 'DETECTED', // location known, classification not confirmed
  CONFIRMED: 'CONFIRMED', // classification confirmed by intelligence
};

export const CONFIRM_THRESHOLD = 100; // evidence needed to confirm a classification
export const SCAN_EVIDENCE_CAP = 70; // tracker scanning alone can never confirm a facility

// Display categories used by the HUD, tracker, minimap and cutaway (one style per category).
export const CATEGORY_STYLE = {
  undiscovered: { label: 'UNDETECTED', color: '#55606a', icon: '·' },
  unknown: { label: 'UNIDENTIFIED', color: '#f0b429', icon: '?' },
  hostile: { label: 'CONFIRMED HOSTILE', color: '#e5483b', icon: '▲' },
  decoy: { label: 'DECOY', color: '#a78bfa', icon: '◇' },
  protected: { label: 'PROTECTED · SURVEILLANCE', color: '#4aa8ff', icon: '⛨' },
  unclassifiable: { label: 'UNKNOWN (UNCLASSIFIABLE)', color: '#c0c0c0', icon: '?' },
  destroyed: { label: 'NEUTRALIZED', color: '#7a7f85', icon: '✕' },
};

export function confidence(bunker) {
  return Math.max(0, Math.min(1, bunker.evidence / CONFIRM_THRESHOLD));
}

export function discoveryState(bunker) {
  if (!bunker.discovered) return DISCOVERY.UNDISCOVERED;
  return bunker.evidence >= CONFIRM_THRESHOLD ? DISCOVERY.CONFIRMED : DISCOVERY.DETECTED;
}

// What the player believes the facility is.
export function knownType(bunker) {
  return discoveryState(bunker) === DISCOVERY.CONFIRMED ? bunker.trueType : BUNKER_TYPES.UNKNOWN;
}

export function displayCategory(bunker) {
  if (bunker.status === 'DESTROYED') return 'destroyed';
  const state = discoveryState(bunker);
  if (state === DISCOVERY.UNDISCOVERED) return 'undiscovered';
  if (state === DISCOVERY.DETECTED) return 'unknown';
  switch (bunker.trueType) {
    case BUNKER_TYPES.HOSTILE: return 'hostile';
    case BUNKER_TYPES.DECOY: return 'decoy';
    case BUNKER_TYPES.SURVEILLANCE: return 'protected';
    default: return 'unclassifiable';
  }
}

/**
 * Adds evidence about a facility. Intelligence can confirm; scanning is capped below confirmation.
 * Returns { discoveredNow, confirmedNow }.
 */
export function addEvidence(bunker, amount, { scan = false } = {}) {
  const wasDiscovered = bunker.discovered;
  const wasConfirmed = bunker.evidence >= CONFIRM_THRESHOLD;
  bunker.discovered = true;
  if (scan) bunker.evidence = Math.max(bunker.evidence, Math.min(SCAN_EVIDENCE_CAP, bunker.evidence + amount));
  else bunker.evidence = Math.min(CONFIRM_THRESHOLD, bunker.evidence + amount);
  return { discoveredNow: !wasDiscovered, confirmedNow: !wasConfirmed && bunker.evidence >= CONFIRM_THRESHOLD };
}
