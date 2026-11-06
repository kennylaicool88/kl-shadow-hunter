// Finite-state machine for the fictional "Deep Strike" projectile's cinematic sequence.
// Pure logic: timing, legal transitions and presentation values. No physics is simulated –
// speed and altitude are display values for a time-compressed cinematic.

export const FLIGHT_STATES = [
  'READY',
  'TARGET_SELECTED',
  'LAUNCH',
  'ASCENT',
  'HIGH_ALTITUDE_CINEMATIC',
  'CRUISE',
  'AUTOPILOT',
  'TARGET_TRACKING',
  'TERMINAL_APPROACH',
  'IMPACT',
  'IMPACT_RESOLUTION',
];

const TRANSITIONS = {
  READY: ['TARGET_SELECTED'],
  TARGET_SELECTED: ['LAUNCH', 'READY'],
  LAUNCH: ['ASCENT'],
  ASCENT: ['HIGH_ALTITUDE_CINEMATIC'],
  HIGH_ALTITUDE_CINEMATIC: ['CRUISE'],
  CRUISE: ['AUTOPILOT'],
  AUTOPILOT: ['TARGET_TRACKING'],
  TARGET_TRACKING: ['TERMINAL_APPROACH'],
  TERMINAL_APPROACH: ['IMPACT'],
  IMPACT: ['IMPACT_RESOLUTION'],
  IMPACT_RESOLUTION: ['READY'],
};

// Real-time seconds each timed state lasts on screen.
export const DEFAULT_DURATIONS = {
  LAUNCH: 2.6,
  ASCENT: 3.4,
  HIGH_ALTITUDE_CINEMATIC: 3.4,
  CRUISE: 4.2,
  AUTOPILOT: 3.6,
  TARGET_TRACKING: 3.4,
  TERMINAL_APPROACH: 1.8,
  IMPACT: 1.4,
};

// Fictional presentation profile: [startMach, endMach] per state, eased.
const MACH_PROFILE = {
  READY: [0, 0], TARGET_SELECTED: [0, 0],
  LAUNCH: [0, 0.9], ASCENT: [0.9, 4.6], HIGH_ALTITUDE_CINEMATIC: [4.6, 8.2], CRUISE: [8.2, 10],
  AUTOPILOT: [10, 10], TARGET_TRACKING: [10, 9.4], TERMINAL_APPROACH: [9.4, 10], IMPACT: [0, 0], IMPACT_RESOLUTION: [0, 0],
};

export const MAX_MACH = 10;
export const TIME_COMPRESSION = 60; // flight shown at 60x speed (presentation only)

const ease = (t) => t * t * (3 - 2 * t);

export function machFor(state, progress) {
  const [a, b] = MACH_PROFILE[state] || [0, 0];
  if (state === 'CRUISE') return Math.min(MAX_MACH, a + (b - a) * Math.min(1, progress / 0.6)); // reaches Mach 10 at 60%
  return a + (b - a) * ease(Math.max(0, Math.min(1, progress)));
}

export class ProjectileStateMachine {
  constructor(durations = {}) {
    this.durations = { ...DEFAULT_DURATIONS, ...durations };
    this.state = 'READY';
    this.stateTime = 0;
    this.flightTime = 0;
    this.history = ['READY'];
    this.listeners = [];
    this.target = null;
  }

  on(fn) {
    this.listeners.push(fn);
  }

  can(to) {
    return (TRANSITIONS[this.state] || []).includes(to);
  }

  transition(to) {
    if (!this.can(to)) throw new Error(`Illegal flight transition ${this.state} -> ${to}`);
    const from = this.state;
    this.state = to;
    this.stateTime = 0;
    this.history.push(to);
    for (const fn of this.listeners) fn(to, from);
  }

  get timed() {
    return this.durations[this.state] !== undefined;
  }

  get progress() {
    const d = this.durations[this.state];
    return d ? Math.min(1, this.stateTime / d) : 0;
  }

  get inFlight() {
    return ['LAUNCH', 'ASCENT', 'HIGH_ALTITUDE_CINEMATIC', 'CRUISE', 'AUTOPILOT', 'TARGET_TRACKING', 'TERMINAL_APPROACH'].includes(this.state);
  }

  get mach() {
    return machFor(this.state, this.progress);
  }

  selectTarget(target) {
    if (this.state === 'TARGET_SELECTED') { this.target = target; return; }
    this.target = target;
    this.transition('TARGET_SELECTED');
  }

  cancel() {
    if (this.state === 'TARGET_SELECTED') {
      this.target = null;
      this.transition('READY');
    }
  }

  launch() {
    this.flightTime = 0;
    this.history = ['READY', 'TARGET_SELECTED']; // history of this flight only
    this.transition('LAUNCH');
  }

  // Called when the drilling/resolution presentation has finished.
  completeResolution() {
    if (this.state === 'IMPACT_RESOLUTION') {
      this.target = null;
      this.transition('READY');
    }
  }

  /** Advance timed states. Returns the list of states entered during this update. */
  update(dt) {
    const entered = [];
    if (this.inFlight) this.flightTime += dt;
    this.stateTime += dt;
    let guard = 0;
    while (this.timed && this.stateTime >= this.durations[this.state] && guard++ < 12) {
      const over = this.stateTime - this.durations[this.state];
      const next = TRANSITIONS[this.state][0];
      this.transition(next);
      this.stateTime = over;
      entered.push(next);
    }
    return entered;
  }

  reset() {
    this.state = 'READY';
    this.stateTime = 0;
    this.flightTime = 0;
    this.history = ['READY'];
    this.target = null;
  }
}
