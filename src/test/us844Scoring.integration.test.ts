import { describe, expect, it, vi } from 'vitest';
import { createDeck, type Card } from '../domain/cards';
import { applyAction } from '../domain/engine';
import type { DealSettlementState, FinishedState, GameAction, GameState, PlayState, Score } from '../domain/state';
import { renderGame } from '../ui/render';

describe('US-844 scoring integration', () => {
  it('settles a deal into next-deal score totals and keeps the updated score/result UI in sync', () => {
    const play = makePlayState({
      contract: { type: 'game', level: 8, suit: 'hearts' },
      declarer: 0,
      currentTrick: [
        { player: 0, card: findCard('hearts-ace') },
        { player: 1, card: findCard('clubs-7') }
      ],
      hands: [[], [], [findCard('hearts-king')]],
      tricksTaken: [7, 2, 0],
      whistResponses: ['whist', 'pass'],
      scores: scoreMidBullet()
    });

    const settlement = applyAction(play, { type: 'playCard', cardId: 'hearts-king' });

    expect(settlement.phase).toBe('deal-settlement');
    if (settlement.phase !== 'deal-settlement') throw new Error('Expected deal-settlement');
    const settlementScreen = renderFor(settlement);
    expect(renderedActionKeys(settlementScreen)).toEqual(['settleDeal']);
    expect(settlementScreen.textContent).toContain('Результат сдачи');
    expect(settlementScreen.textContent).toContain('Контракт выполнен');
    expect(settlementScreen.textContent).toContain('AF Computers: +12');

    const settled = applyAction(settlement, { type: 'settleDeal' });

    expect(settled.phase).toBe('next-deal');
    if (settled.phase !== 'next-deal') throw new Error('Expected next-deal');
    expect(settled.scores).toEqual([
      { bullet: 8, mountain: 1, whists: [0, 4, 0] },
      { bullet: 2, mountain: 3, whists: [12, 0, 5] },
      { bullet: 1, mountain: 0, whists: [2, 0, 0] }
    ]);
    expect(settled.previousDealResult?.scoresAfter).toEqual(settled.scores);
    expect(settled.previousDealResult?.whistAdjustments).toEqual([
      { defender: 1, declarer: 0, response: 'whist', tricks: 2, delta: 12 }
    ]);

    const nextDealScreen = renderFor(settled);
    expect(renderedActionKeys(nextDealScreen)).toEqual(['startNextDeal']);
    expect(nextDealScreen.querySelector('[aria-label="Текущий счет пули"]')).not.toBeNull();
    expect(nextDealScreen.textContent).toContain('Следующая сдача');
    expect(nextDealScreen.textContent).toContain('8');
    expect(nextDealScreen.textContent).toContain('12');
    expect(nextDealScreen.textContent).toContain('AF Computers: +12');
  });

  it('renders the completed bullet final result without any continuation control after settleDeal', () => {
    const settlement = makeSettlementState({
      contract: { type: 'game', level: 6, suit: 'spades' },
      declarer: 0,
      scores: scoreNearFinish()
    });

    const settled = applyAction(settlement, { type: 'settleDeal' });

    expect(settled.phase).toBe('finished');
    if (settled.phase !== 'finished') throw new Error('Expected finished');
    expect(settled.scores[0].bullet).toBe(10);
    expect(settled.previousDealResult?.bulletTargetReached).toBe(true);
    expect(settled.finalResult?.winner).toBe(0);
    expect(settled.finalResult?.ranking.map((entry) => entry.player)).toEqual([0, 2, 1]);

    const finishedScreen = renderFor(settled);
    expect(renderedActionKeys(finishedScreen)).toEqual([]);
    expect(finishedScreen.textContent).toContain('Итог пули');
    expect(finishedScreen.textContent).toContain('Победитель');
    expect(finishedScreen.textContent).toContain('Место 1');
    expect(finishedScreen.textContent).toContain('You');
    expect(finishedScreen.textContent).toContain('10');
    expect(finishedScreen.textContent).not.toContain('Следующая сдача');
    expect(finishedScreen.querySelector('[data-result-panel="final"]')).not.toBeNull();
    expect(finishedScreen.querySelector('[data-action-key="settleDeal"]')).toBeNull();
    expect(finishedScreen.querySelector('[data-action-key="startNextDeal"]')).toBeNull();
  });
});

function renderFor(state: GameState): HTMLDivElement {
  const root = document.createElement('div');
  renderGame(root, state, { onAction: vi.fn<(action: GameAction) => void>(), onNewGame: vi.fn() });
  return root;
}

function renderedActionKeys(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-action-key]'))
    .map((element) => element.dataset.actionKey ?? '')
    .sort();
}

function makeSettlementState(
  overrides: Partial<DealSettlementState> & Pick<DealSettlementState, 'contract' | 'declarer'>
): DealSettlementState {
  return {
    phase: 'deal-settlement',
    seed: 330844,
    bulletTarget: 10,
    players: players(),
    dealer: 2,
    actor: 0,
    hands: [[], [], []],
    widow: [],
    scores: overrides.scores ?? emptyScores(),
    allPassCount: overrides.allPassCount ?? 0,
    log: overrides.log ?? ['Settlement ready'],
    mode: overrides.mode ?? (overrides.contract.type === 'misere' ? 'misere' : 'contract'),
    contract: overrides.contract,
    declarer: overrides.declarer,
    trump: overrides.trump ?? (overrides.contract.type === 'game' ? overrides.contract.suit : null),
    currentTrick: overrides.currentTrick ?? [],
    tricksTaken: overrides.tricksTaken ?? [6, 2, 2],
    whistResponses: overrides.whistResponses ?? [null, null],
    settlementSummary: overrides.settlementSummary ?? 'Pending settlement',
    dealResult: overrides.dealResult
  };
}

function makePlayState(overrides: Partial<PlayState> & Pick<PlayState, 'contract' | 'declarer'>): PlayState {
  return {
    phase: 'play',
    seed: 330844,
    bulletTarget: 10,
    players: players(),
    dealer: 2,
    actor: overrides.actor ?? 2,
    hands: overrides.hands ?? [[], [], [findCard('spades-7')]],
    widow: overrides.widow ?? [],
    scores: overrides.scores ?? emptyScores(),
    allPassCount: overrides.allPassCount ?? 0,
    log: overrides.log ?? ['Last trick in progress'],
    mode: overrides.mode ?? (overrides.contract.type === 'misere' ? 'misere' : 'contract'),
    contract: overrides.contract,
    declarer: overrides.declarer,
    trump: overrides.trump ?? (overrides.contract.type === 'game' ? overrides.contract.suit : null),
    currentTrick: overrides.currentTrick ?? [],
    tricksTaken: overrides.tricksTaken ?? [0, 0, 0],
    whistResponses: overrides.whistResponses ?? [null, null]
  };
}

function emptyScores(): [Score, Score, Score] {
  return [
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] }
  ];
}

function scoreMidBullet(): [Score, Score, Score] {
  return [
    { bullet: 2, mountain: 1, whists: [0, 4, 0] },
    { bullet: 2, mountain: 3, whists: [0, 0, 5] },
    { bullet: 1, mountain: 0, whists: [2, 0, 0] }
  ];
}

function scoreNearFinish(): [Score, Score, Score] {
  return [
    { bullet: 8, mountain: 0, whists: [0, 4, 0] },
    { bullet: 10, mountain: 3, whists: [0, 0, 5] },
    { bullet: 10, mountain: 2, whists: [2, 0, 0] }
  ];
}

function players(): FinishedState['players'] {
  return [
    { id: 0, name: 'You', kind: 'human' },
    { id: 1, name: 'AF Computers', kind: 'ai' },
    { id: 2, name: 'VIMCOM', kind: 'ai' }
  ];
}

function findCard(id: Card['id']): Card {
  const card = createDeck().find((candidate) => candidate.id === id);
  expect(card).toBeDefined();
  return card as Card;
}
