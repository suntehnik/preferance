import { describe, expect, it } from 'vitest';
import { createNewGame } from '../domain/engine';
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
    const initialState = createNewGame(
      deterministicSeeds.fullBulletSmoke,
      fixtureDeals.fullBulletSmoke.bulletTarget
    );
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
