// Round & match state machine. Pure logic (no DOM/Three.js) so it can be unit tested.
//
// Phases: freeze (buy time, nobody moves) → live (round timer) → end (results) → next round | matchover
// Round winner: the team that eliminates the other. On timeout the team with more survivors wins (equal = draw).

export const FREEZE_TIME = 4;
export const END_TIME = 4.5;
export const BUY_WINDOW = 15; // seconds after the round goes live

export class GameState {
  constructor({ roundTime = 120, roundsToWin = 5 } = {}) {
    this.roundTime = roundTime;
    this.roundsToWin = roundsToWin;
    this.reset();
  }

  reset() {
    this.round = 0;
    this.score = { A: 0, B: 0 };
    this.phase = 'none';
    this.timer = 0;
    this.liveTime = 0;
    this.lastResult = null;
    this.matchWinner = null;
  }

  startRound() {
    this.round++;
    this.phase = 'freeze';
    this.timer = FREEZE_TIME;
    this.liveTime = 0;
    this.lastResult = null;
  }

  get timeLeft() {
    if (this.phase === 'freeze') return this.roundTime;
    if (this.phase === 'live') return this.timer;
    return 0;
  }

  get canBuy() {
    return this.phase === 'freeze' || (this.phase === 'live' && this.liveTime < BUY_WINDOW);
  }

  /**
   * Advance time. alive = { A, B } living counts.
   * Returns an event: 'live' | 'roundEnd' | 'nextRound' | 'matchOver' | null
   */
  update(dt, alive) {
    if (this.phase === 'freeze') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.phase = 'live';
        this.timer = this.roundTime;
        return 'live';
      }
      return null;
    }
    if (this.phase === 'live') {
      this.timer -= dt;
      this.liveTime += dt;
      let winner = null;
      let reason = '';
      if (alive.B === 0 && alive.A > 0) { winner = 'A'; reason = 'elimination'; }
      else if (alive.A === 0 && alive.B > 0) { winner = 'B'; reason = 'elimination'; }
      else if (alive.A === 0 && alive.B === 0) { winner = 'draw'; reason = 'elimination'; }
      else if (this.timer <= 0) {
        reason = 'time';
        winner = alive.A > alive.B ? 'A' : alive.B > alive.A ? 'B' : 'draw';
      }
      if (winner) {
        this.endRound(winner, reason);
        return 'roundEnd';
      }
      return null;
    }
    if (this.phase === 'end') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.score.A >= this.roundsToWin || this.score.B >= this.roundsToWin) {
          this.phase = 'matchover';
          this.matchWinner = this.score.A >= this.roundsToWin ? 'A' : 'B';
          return 'matchOver';
        }
        this.phase = 'intermission'; // waits for startRound(); emits nextRound only once
        return 'nextRound';
      }
    }
    return null;
  }

  endRound(winner, reason) {
    if (winner === 'A' || winner === 'B') this.score[winner]++;
    this.lastResult = { winner, reason };
    this.phase = 'end';
    this.timer = END_TIME;
  }
}
