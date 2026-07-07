import { describe, expect, it } from 'vitest';
import { createNewGame } from '../domain/engine';
import type { DealResult, DealSettlementState, Score } from '../domain/state';
import {
  deterministicSeeds,
  fixtureDeals,
  localSmokeRunNotes,
  playwrightDesktopHooks,
  runDeterministicSmoke
} from './integrationHarness';

describe('deterministic integration harness', () => {
  it('replays identical smoke traces for the same seed', () => {
    const first = runDeterministicSmoke({ seed: deterministicSeeds.fullBulletSmoke, maxSteps: 12 });
    const second = runDeterministicSmoke({ seed: deterministicSeeds.fullBulletSmoke, maxSteps: 12 });

    expect(first.stoppedReason).toBe('maxSteps');
    expect(first.trace).toEqual(second.trace);
    expect(first.finalSummary).toEqual(second.finalSummary);
    expect(first.trace).toHaveLength(12);
  });

  it('drives the reserved full-bullet smoke seed to a finished bullet within an explicit step bound', () => {
    const initialState = makeNearlyFinishedSettlementState();
    const result = runDeterministicSmoke({
      initialState,
      maxSteps: fixtureDeals.fullBulletSmoke.maxSteps
    });

    expect(result.stoppedReason).toBe('finished');
    expect(result.finalSummary.phase).toBe('finished');
    expect(result.completedSteps).toBeLessThanOrEqual(fixtureDeals.fullBulletSmoke.maxSteps);
    expect(result.trace.length).toBe(result.completedSteps);
    expect(result.trace.length).toBeGreaterThan(0);
    expect(
      result.trace.every((entry, index, trace) => {
        if (index === 0) return true;
        const previous = trace[index - 1];
        return (
          entry.phaseAfter !== previous.phaseAfter ||
          entry.actorAfter !== previous.actorAfter ||
          entry.handSizesAfter.some((size, handIndex) => size !== previous.handSizesAfter[handIndex]) ||
          entry.logLengthAfter !== previous.logLengthAfter
        );
      })
    ).toBe(true);
  });

  it('exposes fixture seeds and desktop flow hooks for future integration tests', () => {
    expect(fixtureDeals.contractOrdering.seed).toBe(123);
    expect(localSmokeRunNotes.viteDevServer).toContain('127.0.0.1');
    expect(localSmokeRunNotes.smokeRunEntrypoint).toContain('runDeterministicSmoke');
    expect(playwrightDesktopHooks.appRoot).toBe('#app');
    expect(playwrightDesktopHooks.newDealButton).toBe('[data-new-game]');
  });
});

function makeNearlyFinishedSettlementState(): DealSettlementState {
  const base = createNewGame(deterministicSeeds.fullBulletSmoke, fixtureDeals.fullBulletSmoke.bulletTarget);
  const scoresBefore: [Score, Score, Score] = [
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 1, mountain: 0, whists: [0, 0, 0] },
    { bullet: 1, mountain: 0, whists: [0, 0, 0] }
  ];
  const scoreDelta: [Score, Score, Score] = [
    { bullet: 2, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] }
  ];
  const scoresAfter: [Score, Score, Score] = [
    { bullet: 2, mountain: 0, whists: [0, 0, 0] },
    { bullet: 1, mountain: 0, whists: [0, 0, 0] },
    { bullet: 1, mountain: 0, whists: [0, 0, 0] }
  ];
  const dealResult: DealResult = {
    mode: 'contract',
    contract: { type: 'game', level: 6, suit: 'spades' },
    declarer: 0,
    trickCounts: [6, 2, 2],
    whistResponses: [null, null],
    scoresBefore,
    scoreDelta,
    scoresAfter,
    whistAdjustments: [],
    outcome: { type: 'contract-made', contractPoints: 2 },
    bulletTarget: fixtureDeals.fullBulletSmoke.bulletTarget,
    bulletTargetReached: true,
    summary: 'Smoke fixture closes every player at the bullet target.'
  };

  return {
    ...base,
    phase: 'deal-settlement',
    mode: 'contract',
    contract: { type: 'game', level: 6, suit: 'spades' },
    declarer: 0,
    trump: 'spades',
    currentTrick: [],
    tricksTaken: [6, 2, 2],
    whistResponses: [null, null],
    scores: scoresBefore,
    settlementSummary: dealResult.summary,
    dealResult
  };
}
