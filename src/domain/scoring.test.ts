import { describe, expect, it } from 'vitest';
import { calculateFinalResult, scoreAllPass, scoreSuccessfulContract, settleDealResult } from './scoring';
import type { Score } from './state';

describe('scoring', () => {
  it('writes bullet points for a successful seven-level game', () => {
    const scores = scoreSuccessfulContract(emptyScores(), 0, { type: 'game', level: 7, suit: 'clubs' });
    expect(scores[0].bullet).toBe(4);
  });

  it('writes misere as ten bullet points', () => {
    const scores = scoreSuccessfulContract(emptyScores(), 1, { type: 'misere' });
    expect(scores[1].bullet).toBe(10);
  });

  it('scores progressive all-pass tricks by all-pass count', () => {
    const scores = scoreAllPass(emptyScores(), [0, 2, 8], 3, true);
    expect(scores[1].mountain).toBe(6);
    expect(scores[2].mountain).toBe(24);
    expect(scores[0].bullet).toBe(3);
  });

  it('scores the first progressive all-pass as one point per trick', () => {
    const scores = scoreAllPass(emptyScores(), [0, 2, 8], 1, true);
    expect(scores[1].mountain).toBe(2);
    expect(scores[2].mountain).toBe(8);
    expect(scores[0].bullet).toBe(1);
  });

  it('saturates progressive all-pass value at three', () => {
    const scores = scoreAllPass(scoreCarry(), [1, 0, 9], 5, true);
    expect(scores).toEqual([
      { bullet: 6, mountain: 4, whists: [0, 4, 0] },
      { bullet: 5, mountain: 3, whists: [0, 0, 5] },
      { bullet: 1, mountain: 27, whists: [2, 0, 0] }
    ]);
  });

  it('settles failed contracts into value-weighted mountain penalties without touching carry-over whists', () => {
    const result = settleDealResult({
      mode: 'contract',
      contract: { type: 'game', level: 8, suit: 'clubs' },
      declarer: 1,
      tricksTaken: [1, 6, 3],
      whistResponses: ['pass', 'pass'],
      scores: scoreCarry(),
      bulletTarget: 10,
      allPassCount: 0,
      progressiveAllPass: true
    });

    expect(result.scoreDelta).toEqual([
      { bullet: 0, mountain: 0, whists: [0, 0, 0] },
      { bullet: 0, mountain: 12, whists: [0, 0, 0] },
      { bullet: 0, mountain: 0, whists: [0, 0, 0] }
    ]);
    expect(result.scoresAfter).toEqual([
      { bullet: 6, mountain: 1, whists: [0, 4, 0] },
      { bullet: 2, mountain: 15, whists: [0, 0, 5] },
      { bullet: 1, mountain: 0, whists: [2, 0, 0] }
    ]);
  });

  it('scores six-level undertricks as missing tricks times two mountain points', () => {
    const result = settleDealResult({
      mode: 'contract',
      contract: { type: 'game', level: 6, suit: 'spades' },
      declarer: 0,
      tricksTaken: [4, 3, 3],
      whistResponses: ['whist', 'whist'],
      scores: emptyScores(),
      bulletTarget: 10,
      allPassCount: 0,
      progressiveAllPass: true
    });

    expect(result.scoreDelta[0].bullet).toBe(0);
    expect(result.scoreDelta[0].mountain).toBe(4);
    expect(result.outcome).toEqual({ type: 'contract-failed', undertricks: 2 });
  });

  it('settles failed misere into mountain penalties with a deterministic result summary', () => {
    const result = settleDealResult({
      mode: 'misere',
      contract: { type: 'misere' },
      declarer: 2,
      tricksTaken: [4, 3, 3],
      whistResponses: [null, null],
      scores: scoreCarry(),
      bulletTarget: 10,
      allPassCount: 0,
      progressiveAllPass: true
    });

    expect(result.outcome).toEqual({ type: 'misere-failed', penalty: 30 });
    expect(result.scoresAfter[2]).toEqual({ bullet: 1, mountain: 30, whists: [2, 0, 0] });
    expect(result.summary).toContain('failed misere');
  });

  it('writes all defender tricks to the sole whister and caps bullet overflow as help', () => {
    const result = settleDealResult({
      mode: 'contract',
      contract: { type: 'game', level: 8, suit: 'hearts' },
      declarer: 0,
      tricksTaken: [8, 2, 0],
      whistResponses: ['whist', 'pass'],
      scores: scoreCarry(),
      bulletTarget: 10,
      allPassCount: 0,
      progressiveAllPass: true
    });

    expect(result.scoresAfter[0].bullet).toBe(10);
    expect(result.scoresAfter[2].bullet).toBe(3);
    expect(result.whistAdjustments).toEqual([{ defender: 1, declarer: 0, response: 'whist', tricks: 2, delta: 12 }]);
    expect(result.scoresAfter[0].whists[1]).toBe(4);
    expect(result.scoresAfter[1].whists[0]).toBe(12);
    expect(result.scoresAfter[0].whists[0]).toBe(0);
    expect(result.scoresAfter[1].whists[1]).toBe(0);
    expect(result.scoresAfter[0].whists[2]).toBe(0);
    expect(result.scoresAfter[2].whists[0]).toBe(2);
  });

  it('writes half-whist as the fixed four-whist settlement without a full play', () => {
    const halfWhist = settleDealResult({
      mode: 'contract',
      contract: { type: 'game', level: 6, suit: 'hearts' },
      declarer: 0,
      tricksTaken: [8, 2, 0],
      whistResponses: ['half-whist', 'pass'],
      scores: scoreCarry(),
      bulletTarget: 10,
      allPassCount: 0,
      progressiveAllPass: true
    });

    expect(halfWhist.whistAdjustments).toEqual([{ defender: 1, declarer: 0, response: 'half-whist', tricks: 2, delta: 4 }]);
    expect(halfWhist.scoreDelta[1].whists[0]).toBe(4);
  });

  it('writes full whists for checked ten-level games', () => {
    const result = settleDealResult({
      mode: 'contract',
      contract: { type: 'game', level: 10, suit: 'hearts' },
      declarer: 0,
      tricksTaken: [10, 3, 1],
      whistResponses: ['check', 'check'],
      scores: emptyScores(),
      bulletTarget: 10,
      allPassCount: 0,
      progressiveAllPass: true
    });

    expect(result.scoreDelta[1].whists[0]).toBe(30);
    expect(result.scoreDelta[2].whists[0]).toBe(10);
    expect(result.scoreDelta[0].whists[1]).toBe(0);
    expect(result.scoreDelta[0].whists[2]).toBe(0);
    expect(result.whistAdjustments).toEqual([
      { defender: 1, declarer: 0, response: 'check', tricks: 3, delta: 30 },
      { defender: 2, declarer: 0, response: 'check', tricks: 1, delta: 10 }
    ]);
  });

  it('keeps a bullet open until every player reaches the target', () => {
    const result = settleDealResult({
      mode: 'contract',
      contract: { type: 'game', level: 6, suit: 'spades' },
      declarer: 0,
      tricksTaken: [6, 2, 2],
      whistResponses: ['pass', 'pass'],
      scores: [
        { bullet: 18, mountain: 17, whists: [0, 0, 0] },
        { bullet: 5, mountain: 1, whists: [0, 0, 0] },
        { bullet: 2, mountain: 12, whists: [0, 0, 0] }
      ],
      bulletTarget: 20,
      allPassCount: 0,
      progressiveAllPass: true
    });

    expect(result.scoresAfter.map((score) => score.bullet)).toEqual([20, 5, 2]);
    expect(result.bulletTargetReached).toBe(false);
  });

  it('caps a closed bullet and distributes overflow as help to the furthest player', () => {
    const result = settleDealResult({
      mode: 'misere',
      contract: { type: 'misere' },
      declarer: 0,
      tricksTaken: [0, 5, 5],
      whistResponses: [null, null],
      scores: [
        { bullet: 9, mountain: 0, whists: [0, 0, 0] },
        { bullet: 0, mountain: 0, whists: [0, 0, 0] },
        { bullet: 4, mountain: 0, whists: [0, 0, 0] }
      ],
      bulletTarget: 10,
      allPassCount: 0,
      progressiveAllPass: true
    });

    expect(result.scoresAfter.map((score) => score.bullet)).toEqual([10, 9, 4]);
    expect(result.scoreDelta.map((score) => score.bullet)).toEqual([1, 9, 0]);
  });

  it('charges the sole whister for missing the required defender trick norm', () => {
    const result = settleDealResult({
      mode: 'contract',
      contract: { type: 'game', level: 6, suit: 'clubs' },
      declarer: 0,
      tricksTaken: [7, 2, 1],
      whistResponses: ['whist', 'pass'],
      scores: emptyScores(),
      bulletTarget: 10,
      allPassCount: 0,
      progressiveAllPass: true,
      responsibleWhist: false
    });

    expect(result.scoreDelta[1].mountain).toBe(1);
    expect(result.whistAdjustments[0]).toEqual({ defender: 1, declarer: 0, response: 'whist', tricks: 3, delta: 6 });
  });

  it('calculates final ranking from settled whists instead of raw bullet totals', () => {
    const result = calculateFinalResult(
      [
        { bullet: 20, mountain: 17, whists: [0, 0, 0] },
        { bullet: 20, mountain: 1, whists: [0, 0, 6] },
        { bullet: 20, mountain: 12, whists: [30, 0, 0] }
      ],
      20
    );

    expect(result.winner).toBe(1);
    expect(result.ranking.map((entry) => entry.player)).toEqual([1, 2, 0]);
    expect(result.ranking[0].finalWhists).toBe(96);
    expect(result.ranking[1].finalWhists).toBe(4);
    expect(result.ranking[2].finalWhists).toBe(-100);
    expect(result.sortKey).toBe('final-whists-desc,bullet-desc,player-id-asc');
  });

  it('calculates a deterministic final ranking from final whists, bullet, and player id', () => {
    const result = calculateFinalResult(scoreCarry(), 10);

    expect(result.winner).toBe(2);
    expect(result.ranking.map((entry) => entry.player)).toEqual([2, 0, 1]);
    expect(result.ranking[0].netWhists).toBe(-3);
    expect(result.ranking[1].netWhists).toBe(2);
    expect(result.ranking[2].netWhists).toBe(1);
    expect(result.sortKey).toBe('final-whists-desc,bullet-desc,player-id-asc');
  });

  it('breaks final-whist ties by higher bullet before player id', () => {
    const result = calculateFinalResult(
      [
        { bullet: 10, mountain: 1, whists: [0, 0, 0] },
        { bullet: 9, mountain: 1, whists: [0, 0, 0] },
        { bullet: 8, mountain: 0, whists: [0, 0, 0] }
      ],
      10
    );

    expect(result.ranking.map((entry) => entry.player)).toEqual([2, 0, 1]);
  });

  it('returns new scores without mutating or reusing nested whists', () => {
    const original = emptyScores();

    const scores = scoreSuccessfulContract(original, 0, { type: 'game', level: 7, suit: 'clubs' });

    expect(original[0].bullet).toBe(0);
    expect(scores[0]).not.toBe(original[0]);
    expect(scores[0].whists).not.toBe(original[0].whists);
    expect(scores[0].whists).toEqual([0, 0, 0]);
  });
});

function emptyScores(): readonly [Score, Score, Score] {
  return [
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] }
  ];
}

function scoreCarry(): readonly [Score, Score, Score] {
  return [
    { bullet: 6, mountain: 1, whists: [0, 4, 0] },
    { bullet: 2, mountain: 3, whists: [0, 0, 5] },
    { bullet: 1, mountain: 0, whists: [2, 0, 0] }
  ];
}
