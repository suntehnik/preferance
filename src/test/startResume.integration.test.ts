import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGame } from '../domain/engine';
import type { GameState } from '../domain/state';
import { loadActiveBullet, saveGame } from '../persistence/saveStore';
import { startApp } from '../ui/controller';
import { deterministicSeeds } from './integrationHarness';

describe('US-841 start/resume integration flow', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a supported bullet from an empty boot and offers that new bullet on the next boot', () => {
    const firstBoot = bootApp();

    expect(firstBoot.querySelector('.game-shell')).toBeNull();
    expect(firstBoot.querySelector('[data-continue-bullet]')).toBeNull();

    click(firstBoot, '[data-start-bullet-size="20"]');
    const saved = loadActiveBullet();

    expect(firstBoot.querySelector('.game-shell')).not.toBeNull();
    expect(saved?.activeBulletSettings).toEqual({ bulletSize: 20 });
    expect(saved?.currentDeal.phase).toBe('bidding');

    const secondBoot = bootApp();
    expect(secondBoot.querySelector('.game-shell')).toBeNull();
    expect(secondBoot.querySelector('[data-continue-bullet]')).not.toBeNull();
    expect(secondBoot.querySelector('[data-start-bullet-size="20"]')).not.toBeNull();
  });

  it('continues a valid unfinished bullet from persistence without replacing it', () => {
    const scoreTable: GameState['scores'] = [
      { bullet: 4, mountain: 0, whists: [0, 1, 2] },
      { bullet: 0, mountain: 3, whists: [1, 0, 4] },
      { bullet: 0, mountain: 0, whists: [2, 4, 0] }
    ];
    const savedState = {
      ...createNewGame(deterministicSeeds.playwrightDesktopFlow),
      actor: 1 as const,
      scores: scoreTable,
      log: ['Saved desktop checkpoint']
    };
    saveGame(savedState, { bulletSize: 30 });
    const root = bootApp();

    expect(root.querySelector('.game-shell')).toBeNull();
    expect(root.querySelector('[data-continue-bullet]')).not.toBeNull();

    click(root, '[data-continue-bullet]');

    const active = loadActiveBullet();
    expect(root.querySelector('.game-shell')).not.toBeNull();
    expect(root.querySelector('.status-line')?.textContent).toContain('Фаза: bidding');
    expect(root.querySelector('.status-line')?.textContent).toContain('Игрок: AF Computers');
    expect(root.querySelectorAll('[data-card-id]')).toHaveLength(savedState.hands[0].length);
    expect(root.querySelector('.side-panel li')?.textContent).toBe('Saved desktop checkpoint');
    expect(active?.activeBulletSettings).toEqual({ bulletSize: 30 });
    expect(active?.currentDeal.seed).toBe(deterministicSeeds.playwrightDesktopFlow);
    expect(active?.scoreTable).toEqual(savedState.scores);
  });

  it('replaces an unfinished saved bullet when the player explicitly starts a new supported bullet', () => {
    const oldSave = createNewGame(deterministicSeeds.playwrightDesktopFlow);
    saveGame(oldSave, { bulletSize: 30 });
    const root = bootApp();

    click(root, '[data-start-bullet-size="10"]');

    const active = loadActiveBullet();
    expect(root.querySelector('.game-shell')).not.toBeNull();
    expect(active?.activeBulletSettings).toEqual({ bulletSize: 10 });
    expect(active?.currentDeal.seed).not.toBe(deterministicSeeds.playwrightDesktopFlow);
    expect(active?.technicalDealHistory).toHaveLength(1);
    expect(active?.technicalDealHistory[0].seed).toBe(active?.currentDeal.seed);

    const nextBoot = bootApp();
    expect(nextBoot.querySelector('.game-shell')).toBeNull();
    expect(nextBoot.querySelector('[data-continue-bullet]')).not.toBeNull();
    expect(nextBoot.querySelector('[data-start-bullet-size="10"]')).not.toBeNull();
  });

  it('falls back to the start screen for incompatible, finished, and completed saved bullets', () => {
    localStorage.setItem('marriage.save.v1', '{bad json');
    expectStartOnly(bootApp());

    localStorage.setItem('marriage.save.v1', JSON.stringify({ schema: 1, state: { phase: 'bidding' } }));
    expectStartOnly(bootApp());

    localStorage.setItem('marriage.save.v1', JSON.stringify({ schema: 99, state: createNewGame(44) }));
    expectStartOnly(bootApp());

    localStorage.clear();
    saveGame(finishedGame(createNewGame(45)));
    expectStartOnly(bootApp());

    localStorage.clear();
    saveGame(completedBullet(createNewGame(46)), { bulletSize: 10 });
    expectStartOnly(bootApp());
  });
});

function bootApp(): HTMLElement {
  const root = document.createElement('div');
  startApp(root);
  return root;
}

function click(root: HTMLElement, selector: string): void {
  const button = root.querySelector<HTMLButtonElement>(selector);
  expect(button).not.toBeNull();
  button?.click();
}

function expectStartOnly(root: HTMLElement): void {
  expect(root.querySelector('.game-shell')).toBeNull();
  expect(root.querySelector('[data-continue-bullet]')).toBeNull();
  expect(root.querySelector('[data-start-bullet-size="10"]')).not.toBeNull();
  expect(loadActiveBullet()).toBeNull();
}

function finishedGame(game: GameState): GameState {
  return {
    ...game,
    phase: 'finished',
    contract: { type: 'allPass' },
    declarer: null,
    trump: null,
    currentTrick: [],
    tricksTaken: [0, 0, 0],
    winnerSummary: 'Finished bullet'
  };
}

function completedBullet(game: GameState): GameState {
  return {
    ...game,
    scores: [
      { ...game.scores[0], bullet: 10 },
      game.scores[1],
      game.scores[2]
    ]
  };
}
