import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameState, FREEZE_TIME, END_TIME } from '../src/game/GameState.js';

function run(gs, seconds, alive) {
  const events = [];
  for (let t = 0; t < seconds; t += 0.1) {
    const e = gs.update(0.1, alive);
    if (e) events.push(e);
  }
  return events;
}

test('round goes live after freeze time', () => {
  const gs = new GameState({ roundTime: 60, roundsToWin: 2 });
  gs.startRound();
  assert.equal(gs.phase, 'freeze');
  assert.ok(gs.canBuy);
  const ev = run(gs, FREEZE_TIME + 0.2, { A: 1, B: 3 });
  assert.deepEqual(ev, ['live']);
  assert.equal(gs.phase, 'live');
});

test('eliminating all enemies wins the round; losing all players loses it', () => {
  const gs = new GameState({ roundTime: 60, roundsToWin: 3 });
  gs.startRound();
  run(gs, FREEZE_TIME + 0.2, { A: 1, B: 3 });
  assert.deepEqual(run(gs, 0.2, { A: 1, B: 0 }), ['roundEnd']);
  assert.equal(gs.score.A, 1);
  assert.equal(gs.lastResult.winner, 'A');
  run(gs, END_TIME + 0.2, { A: 1, B: 0 });
  gs.startRound();
  run(gs, FREEZE_TIME + 0.2, { A: 1, B: 3 });
  run(gs, 0.2, { A: 0, B: 2 });
  assert.equal(gs.score.B, 1);
  assert.equal(gs.lastResult.winner, 'B');
});

test('timeout: more survivors wins, equal is a draw', () => {
  const gs = new GameState({ roundTime: 5, roundsToWin: 3 });
  gs.startRound();
  run(gs, FREEZE_TIME + 0.2, { A: 2, B: 2 });
  run(gs, 5.5, { A: 2, B: 2 });
  assert.equal(gs.lastResult.winner, 'draw');
  assert.equal(gs.lastResult.reason, 'time');
  assert.deepEqual(gs.score, { A: 0, B: 0 });
});

test('match ends when a team reaches the rounds-to-win target, and can restart', () => {
  const gs = new GameState({ roundTime: 60, roundsToWin: 2 });
  for (let r = 0; r < 2; r++) {
    gs.startRound();
    run(gs, FREEZE_TIME + 0.2, { A: 1, B: 1 });
    run(gs, 0.2, { A: 1, B: 0 });
    const ev = run(gs, END_TIME + 0.2, { A: 1, B: 0 });
    assert.deepEqual(ev, [r === 0 ? 'nextRound' : 'matchOver']);
  }
  assert.equal(gs.matchWinner, 'A');
  gs.reset();
  assert.deepEqual(gs.score, { A: 0, B: 0 });
  assert.equal(gs.round, 0);
});
