import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeck } from '../domain/cards';
import { applyAction, createNewGame } from '../domain/engine';
import type { ContractState, GameState } from '../domain/state';
import { loadActiveBullet, saveGame } from '../persistence/saveStore';
import { startApp } from './controller';

describe('startApp start/resume flow', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows supported bullet sizes before creating the first deal when no save exists', () => {
    const root = document.createElement('div');

    startApp(root);

    expect(root.querySelector('.game-shell')).toBeNull();
    expect(root.querySelector('[data-start-bullet-size="10"]')).not.toBeNull();
    expect(root.querySelector('[data-start-bullet-size="20"]')).not.toBeNull();
    expect(root.querySelector('[data-start-bullet-size="30"]')).not.toBeNull();
    expect(loadActiveBullet()).toBeNull();
  });

  it('starts a new bullet with the selected supported size', () => {
    const root = document.createElement('div');
    startApp(root);

    root.querySelector<HTMLButtonElement>('[data-start-bullet-size="20"]')?.click();

    const saved = loadActiveBullet();
    expect(root.querySelector('.game-shell')).not.toBeNull();
    expect(saved?.activeBulletSettings).toEqual({ bulletSize: 20 });
    expect(saved?.currentDeal.bulletTarget).toBe(20);
    expect(saved?.currentDeal.phase).toBe('bidding');
  });

  it('offers continue or start-new when an unfinished save exists', () => {
    saveGame(createNewGame(44), { bulletSize: 30 });
    const root = document.createElement('div');

    startApp(root);

    expect(root.querySelector('.game-shell')).toBeNull();
    expect(root.querySelector('[data-continue-bullet]')).not.toBeNull();
    expect(root.querySelector('[data-start-bullet-size="10"]')).not.toBeNull();
    expect(loadActiveBullet()?.currentDeal.seed).toBe(44);
  });

  it('places continue before start-new choices in the resume keyboard order', () => {
    saveGame(createNewGame(44), { bulletSize: 30 });
    const root = document.createElement('div');

    startApp(root);

    const continueButton = root.querySelector('[data-continue-bullet]');
    const firstStartButton = root.querySelector('[data-start-bullet-size="10"]');
    expect(continueButton).not.toBeNull();
    expect(firstStartButton).not.toBeNull();
    expect(continueButton?.compareDocumentPosition(firstStartButton!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('continues the saved unfinished bullet only after the player chooses continue', () => {
    saveGame(createNewGame(44), { bulletSize: 30 });
    const root = document.createElement('div');
    startApp(root);

    root.querySelector<HTMLButtonElement>('[data-continue-bullet]')?.click();

    expect(root.querySelector('.game-shell')).not.toBeNull();
    expect(loadActiveBullet()?.activeBulletSettings).toEqual({ bulletSize: 30 });
    expect(loadActiveBullet()?.currentDeal.seed).toBe(44);
  });

  it('replaces the saved bullet when the player starts a new bullet from the resume screen', () => {
    saveGame(createNewGame(44), { bulletSize: 30 });
    const root = document.createElement('div');
    startApp(root);

    root.querySelector<HTMLButtonElement>('[data-start-bullet-size="10"]')?.click();

    const saved = loadActiveBullet();
    expect(root.querySelector('.game-shell')).not.toBeNull();
    expect(saved?.activeBulletSettings).toEqual({ bulletSize: 10 });
    expect(saved?.currentDeal.seed).not.toBe(44);
  });

  it('starts replacement bullets with fresh technical history', () => {
    saveGame(createNewGame(44), { bulletSize: 30 });
    const root = document.createElement('div');
    startApp(root);

    root.querySelector<HTMLButtonElement>('[data-start-bullet-size="20"]')?.click();

    const saved = loadActiveBullet();
    expect(saved?.activeBulletSettings).toEqual({ bulletSize: 20 });
    expect(saved?.currentDeal.bulletTarget).toBe(20);
    expect(saved?.technicalDealHistory).toHaveLength(1);
    expect(saved?.technicalDealHistory[0].seed).toBe(saved?.currentDeal.seed);
    expect(saved?.technicalDealHistory[0].seed).not.toBe(44);
  });

  it('does not show an in-game new-deal bypass button during active play', () => {
    const root = document.createElement('div');
    startApp(root);
    root.querySelector<HTMLButtonElement>('[data-start-bullet-size="30"]')?.click();

    expect(root.querySelector('[data-new-game]')).toBeNull();
    expect(loadActiveBullet()?.activeBulletSettings).toEqual({ bulletSize: 30 });
    expect(loadActiveBullet()?.currentDeal.bulletTarget).toBe(30);
  });

  it('continues without advancing a saved ai actor state before rendering', () => {
    const aiTurnSave = { ...createNewGame(44), actor: 1 as const, log: ['AI turn checkpoint'] };
    saveGame(aiTurnSave, { bulletSize: 30 });
    const root = document.createElement('div');
    startApp(root);

    root.querySelector<HTMLButtonElement>('[data-continue-bullet]')?.click();

    expect(root.querySelector('.status-line')?.textContent).toContain('Игрок: AF Computers');
    expect(loadActiveBullet()?.currentDeal.actor).toBe(1);
    expect(loadActiveBullet()?.currentDeal.log).toEqual(['AI turn checkpoint']);
  });

  it('opens the widow after bidding, then moves it into the human hand on any key before discard and final order', () => {
    saveGame(makeHumanBidWaitingForLastAiPass(), { bulletSize: 10 });
    const root = document.createElement('div');
    startApp(root);
    root.querySelector<HTMLButtonElement>('[data-continue-bullet]')?.click();

    vi.advanceTimersByTime(700);

    const saved = loadActiveBullet()?.currentDeal;
    expect(saved?.phase).toBe('contract');
    if (saved?.phase !== 'contract') throw new Error('Expected contract');
    expect(saved.step).toBe('widow-pickup');
    expect(saved.declarer).toBe(0);
    expect(saved.hands[0]).toHaveLength(10);
    expect(root.querySelectorAll('.widow-open .card')).toHaveLength(2);
    expect(root.querySelector('.pause-overlay')?.textContent).toContain('Прикуп открыт');
    expect(root.querySelectorAll('[data-discard-card-id]')).toHaveLength(0);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));

    const afterPickup = loadActiveBullet()?.currentDeal;
    expect(afterPickup?.phase).toBe('contract');
    if (afterPickup?.phase !== 'contract') throw new Error('Expected contract');
    expect(afterPickup.step).toBe('discard');
    expect(afterPickup.hands[0]).toHaveLength(12);
    expect(root.querySelector('[data-action-type="orderContract"]')).toBeNull();
    expect(root.querySelector('[data-action-key="pickupWidow"]')).toBeNull();
    expect(root.querySelectorAll('[data-discard-card-id]')).toHaveLength(12);

    const discardCards = root.querySelectorAll<HTMLButtonElement>('[data-discard-card-id]');
    discardCards[0]?.click();
    discardCards[1]?.click();
    root.querySelector<HTMLButtonElement>('[data-action-type="discardCards"]')?.click();

    const afterDiscard = loadActiveBullet()?.currentDeal;
    expect(afterDiscard?.phase).toBe('contract');
    if (afterDiscard?.phase !== 'contract') throw new Error('Expected contract');
    expect(afterDiscard.step).toBe('order');
    expect(afterDiscard.hands[afterDiscard.declarer]).toHaveLength(10);
    expect(afterDiscard.widow).toHaveLength(2);
    expect(root.querySelector('.widow-open')).toBeNull();
    expect(root.querySelector('[data-action-type="orderContract"]')).not.toBeNull();

    root.querySelector<HTMLButtonElement>('[data-action-key="orderContract:6-spades"]')?.click();

    const afterOrder = loadActiveBullet()?.currentDeal;
    expect(afterOrder?.phase).toBe('contract');
    if (afterOrder?.phase !== 'contract') throw new Error('Expected contract');
    expect(afterOrder.step).toBe('whist-decision');
  });

  it('asks both AI defenders for whist decisions before entering play', () => {
    saveGame(makeAiWhistDecisionState(), { bulletSize: 10 });
    const root = document.createElement('div');
    startApp(root);
    root.querySelector<HTMLButtonElement>('[data-continue-bullet]')?.click();

    vi.advanceTimersByTime(700);

    const afterFirstWhist = loadActiveBullet()?.currentDeal;
    expect(afterFirstWhist?.phase).toBe('contract');
    if (afterFirstWhist?.phase !== 'contract') throw new Error('Expected contract after first whist decision');
    expect(afterFirstWhist.step).toBe('whist-decision');
    expect(afterFirstWhist.actor).toBe(2);
    expect(afterFirstWhist.whistResponses[0]).not.toBeNull();
    expect(afterFirstWhist.whistResponses[1]).toBeNull();
    expect(root.querySelector('.status-line')?.textContent).toContain('Игрок: VIMCOM');
    expect(root.querySelector('.bid-bubble-1')?.textContent).toBe('Вист');
    expect(root.querySelector('.action-note')?.textContent).toContain('VIMCOM выбирает вист или пас');

    vi.advanceTimersByTime(700);

    const afterSecondWhist = loadActiveBullet()?.currentDeal;
    expect(afterSecondWhist?.phase).toBe('play');
    if (afterSecondWhist?.phase !== 'play') throw new Error('Expected play after second whist decision');
    expect(afterSecondWhist.whistResponses[0]).not.toBeNull();
    expect(afterSecondWhist.whistResponses[1]).not.toBeNull();
  });
});

function makeHumanBidWaitingForLastAiPass(): GameState {
  const bid = applyAction(createNewGame(123), { type: 'bidGame', bid: { type: 'game', level: 6, suit: 'spades' } });
  return applyAction(bid, { type: 'pass' });
}

function makeAiWhistDecisionState(): ContractState {
  const base = createNewGame(123);
  const card = (id: string) => {
    const found = createDeck().find((candidate) => candidate.id === id);
    if (!found) throw new Error(`Missing card ${id}`);
    return found;
  };

  return {
    phase: 'contract',
    step: 'whist-decision',
    seed: base.seed,
    bulletTarget: base.bulletTarget,
    players: base.players,
    dealer: base.dealer,
    actor: 1,
    hands: [
      [card('clubs-7')],
      [card('clubs-ace'), card('clubs-king'), card('clubs-queen'), card('hearts-ace')],
      [card('spades-7'), card('diamonds-7')]
    ],
    widow: [card('hearts-7'), card('hearts-8')],
    contract: { type: 'game', level: 6, suit: 'clubs' },
    declarer: 0,
    defenderOrder: [1, 2],
    whistResponses: [null, null],
    scores: base.scores,
    allPassCount: base.allPassCount,
    log: ['Fixture whist decision']
  };
}
