import { describe, expect, it, vi } from 'vitest';
import { createDeck, type Card } from '../domain/cards';
import { applyAction, getLegalActions } from '../domain/engine';
import type { Bid } from '../domain/rules';
import type {
  BiddingState,
  ContractState,
  DealSettlementState,
  FinishedState,
  GameAction,
  GameState,
  PlayState,
  Score
} from '../domain/state';
import { renderGame } from '../ui/render';

describe('US-845 desktop table integration', () => {
  it('renders the desktop bidding state with actor, legal actions, score table, hands, and no result panel', () => {
    const state = makeBiddingState();

    expect(legalActionKeys(state)).toContain('pass');

    const root = renderFor(state);

    expect(root.querySelector('.status-line')?.textContent).toContain('Фаза: bidding');
    expect(root.querySelector('.status-line')?.textContent).toContain('Игрок: You');
    expect(root.querySelector('[data-state-context]')?.textContent).toContain('Торговля');
    expect(root.querySelector('[aria-label="Текущий счет пули"]')).not.toBeNull();
    expect(root.querySelectorAll('[data-card-id]')).toHaveLength(state.hands[0].length);
    expect(renderedActionKeys(root).sort()).toEqual(legalActionKeys(state));
    expect(root.querySelector('[data-result-panel="deal"]')).toBeNull();
    expect(root.querySelector('[data-result-panel="final"]')).toBeNull();
  });

  it('keeps contract-family desktop states on one action family at a time for order and whist decisions', () => {
    const opening = makeBiddingState({
      hands: [
        [findCard('clubs-7'), findCard('diamonds-7')],
        [findCard('clubs-10')],
        [findCard('clubs-ace')]
      ],
      widow: [findCard('hearts-7'), findCard('spades-7')]
    });

    const widowPickup = applySequence(opening, [
      { type: 'bidGame', bid: { type: 'game', level: 8, suit: 'hearts' } },
      { type: 'pass' },
      { type: 'pass' }
    ]);
    expect(widowPickup.phase).toBe('contract');
    if (widowPickup.phase !== 'contract') throw new Error('Expected widow pickup state');

    const widowRoot = renderFor(widowPickup);
    expect(widowRoot.querySelector('[data-state-context]')?.textContent).toContain('Прикуп');
    expect(widowRoot.querySelector('.widow-open')).not.toBeNull();

    const discard = applyAction(widowPickup, { type: 'pickupWidow' });
    expect(discard.phase).toBe('contract');
    if (discard.phase !== 'contract') throw new Error('Expected discard state');
    const discardAction = getLegalActions(discard).find((action) => action.type === 'discardCards');
    if (!discardAction || discardAction.type !== 'discardCards') throw new Error('Expected discard action');

    const ordered = applyAction(discard, discardAction);
    expect(ordered.phase).toBe('contract');
    if (ordered.phase !== 'contract') throw new Error('Expected contract order state');

    const orderRoot = renderFor(ordered);
    expect(orderRoot.querySelector('[data-state-context]')?.textContent).toContain('Заказ игры');
    expect(orderRoot.querySelector('[data-state-context]')?.textContent).toContain('Контракт');
    expect(orderRoot.querySelector('[data-state-context]')?.textContent).toContain('8 червы');
    expect(renderedActionKeys(orderRoot).sort()).toEqual(legalActionKeys(ordered));
    expect(orderRoot.querySelector('.contract-order-group')).not.toBeNull();
    expect(Array.from(orderRoot.querySelectorAll('.contract-order-grid button')).map((button) => button.textContent)).toEqual([
      '8♥',
      '9♠',
      '9♣',
      '9♦',
      '9♥',
      '10♠',
      '10♣',
      '10♦',
      '10♥'
    ]);

    const whistState = makeWhistState({
      actor: 1,
      players: makePlayers({ 1: 'human' }),
      contract: { type: 'game', level: 8, suit: 'hearts' }
    });
    const whistRoot = renderFor(whistState);
    expect(whistRoot.querySelector('[data-state-context]')?.textContent).toContain('Висты');
    expect(whistRoot.querySelector('[data-state-context]')?.textContent).toContain('Заказчик');
    expect(whistRoot.querySelector('[aria-label="Текущий счет пули"]')).not.toBeNull();
    expect(renderedActionKeys(whistRoot).sort()).toEqual(legalActionKeys(whistState));
    expect(enabledPlayableCards(whistRoot)).toEqual([]);
  });

  it('renders the desktop play state with contract, trump, current trick, and only legal playable cards', () => {
    const state = makePlayState({
      actor: 0,
      currentTrick: [{ player: 1, card: findCard('clubs-10') }]
    });

    expect(legalActionKeys(state)).toEqual(['playCard:clubs-7']);

    const root = renderFor(state);

    expect(root.querySelector('[data-state-context]')?.textContent).toContain('Розыгрыш');
    expect(root.querySelector('[data-state-context]')?.textContent).toContain('6 пики');
    expect(root.querySelector('[data-state-context]')?.textContent).toContain('Козырь');
    expect(root.querySelector('[data-state-context]')?.textContent).toContain('пики');
    expect(root.querySelector('[data-state-context]')?.textContent).toContain('Текущая взятка');
    expect(root.querySelector('[data-state-context]')?.textContent).toContain('AF Computers: 10 трефы');
    expect(renderedActionKeys(root)).toEqual([]);
    expect(enabledPlayableCards(root)).toEqual(['playCard:clubs-7']);
  });

  it('omits misleading trump and declarer-only context for all-pass and misere desktop play states', () => {
    const allPassRoot = renderFor(
      applySequence(makeBiddingState({ allPassCount: 2 }), [{ type: 'pass' }, { type: 'pass' }, { type: 'pass' }])
    );
    const misereRoot = renderFor(
      makePlayState({
        mode: 'misere',
        contract: { type: 'misere' },
        declarer: null,
        trump: null
      })
    );

    expect(allPassRoot.querySelector('[data-state-context]')?.textContent).toContain('Распасы');
    expect(allPassRoot.querySelector('[data-state-context]')?.textContent).not.toContain('Козырь');
    expect(allPassRoot.querySelector('[data-state-context]')?.textContent).not.toContain('Заказчик');
    expect(enabledPlayableCards(allPassRoot)).toEqual(['playCard:clubs-7']);

    expect(misereRoot.querySelector('[data-state-context]')?.textContent).toContain('Мизер');
    expect(misereRoot.querySelector('[data-state-context]')?.textContent).not.toContain('Козырь');
    expect(misereRoot.querySelector('[data-state-context]')?.textContent).not.toContain('Заказчик');
    expect(renderedActionKeys(misereRoot)).toEqual([]);
    expect(enabledPlayableCards(misereRoot)).toEqual(
      legalActionKeys(
        makePlayState({
          mode: 'misere',
          contract: { type: 'misere' },
          declarer: null,
          trump: null
        })
      )
    );
  });

  it('shows deal settlement and next-deal desktop result states with understandable result context and proceed action', () => {
    const play = makePlayState({
      contract: { type: 'game', level: 8, suit: 'hearts' },
      declarer: 0,
      actor: 2,
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

    const settlementRoot = renderFor(settlement);
    expect(settlementRoot.querySelector('.card-table')?.classList.contains('result-table-layout')).toBe(true);
    expect(settlementRoot.querySelector('.opponents-row')).toBeNull();
    expect(settlementRoot.querySelector('.human-hand')).toBeNull();
    expect(settlementRoot.querySelector('[data-result-panel="deal"]')).not.toBeNull();
    expect(settlementRoot.querySelector('[data-state-context]')?.textContent).toContain('Расчет сдачи');
    expect(settlementRoot.textContent).toContain('Результат сдачи');
    expect(settlementRoot.textContent).toContain('Контракт выполнен');
    expect(renderedActionKeys(settlementRoot)).toEqual(['settleDeal']);

    const nextDeal = applyAction(settlement, { type: 'settleDeal' });
    expect(nextDeal.phase).toBe('next-deal');
    if (nextDeal.phase !== 'next-deal') throw new Error('Expected next-deal');

    const nextDealRoot = renderFor(nextDeal);
    expect(nextDealRoot.querySelector('.card-table')?.classList.contains('result-table-layout')).toBe(true);
    expect(nextDealRoot.querySelector('.opponents-row')).toBeNull();
    expect(nextDealRoot.querySelector('.human-hand')).toBeNull();
    expect(nextDealRoot.querySelector('[data-result-panel="deal"]')).not.toBeNull();
    expect(nextDealRoot.querySelector('[aria-label="Текущий счет пули"]')).not.toBeNull();
    expect(nextDealRoot.querySelector('[data-state-context]')?.textContent).toContain('Следующая сдача');
    expect(nextDealRoot.textContent).toContain('AF Computers: +12');
    expect(renderedActionKeys(nextDealRoot)).toEqual(['startNextDeal']);
  });

  it('renders the final bullet result with ranking and no continuation controls', () => {
    const settlement = makeSettlementState({
      contract: { type: 'game', level: 6, suit: 'spades' },
      declarer: 0,
      scores: scoreNearFinish()
    });

    const finished = applyAction(settlement, { type: 'settleDeal' });
    expect(finished.phase).toBe('finished');
    if (finished.phase !== 'finished') throw new Error('Expected finished');

    const root = renderFor(finished);

    expect(root.querySelector('.card-table')?.classList.contains('result-table-layout')).toBe(true);
    expect(root.querySelector('.opponents-row')).toBeNull();
    expect(root.querySelector('.human-hand')).toBeNull();
    expect(root.querySelector('[data-result-panel="final"]')).not.toBeNull();
    expect(root.querySelector('[data-state-context]')?.textContent).toContain('Итог пули');
    expect(root.textContent).toContain('Победитель');
    expect(root.textContent).toContain('Место 1');
    expect(root.textContent).toContain('You');
    expect(root.textContent).not.toContain('Следующая сдача');
    expect(renderedActionKeys(root)).toEqual([]);
    expect(enabledPlayableCards(root)).toEqual([]);
  });
});

function renderFor(state: GameState): HTMLDivElement {
  const root = document.createElement('div');
  renderGame(root, state, { onAction: vi.fn<(action: GameAction) => void>(), onNewGame: vi.fn() });
  return root;
}

function applySequence(state: GameState, actions: GameAction[]): GameState {
  return actions.reduce((current, action) => {
    expect(legalActionKeys(current)).toContain(actionKey(action));
    return applyAction(current, action);
  }, state);
}

function renderedActionKeys(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-action-key]'))
    .map((element) => element.dataset.actionKey ?? '')
    .sort();
}

function enabledPlayableCards(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('[data-card-id]'))
    .filter((button) => !button.disabled && !button.hasAttribute('data-discard-card-id'))
    .map((button) => `playCard:${button.dataset.cardId}`);
}

function legalActionKeys(state: GameState): string[] {
  return getLegalActions(state).map(actionKey).sort();
}

function actionKey(action: GameAction): string {
  if (action.type === 'pass') return 'pass';
  if (action.type === 'check') return 'check';
  if (action.type === 'whist') return 'whist';
  if (action.type === 'halfWhist') return 'halfWhist';
  if (action.type === 'bidMisere') return 'bidMisere';
  if (action.type === 'bidGame') return `bidGame:${action.bid.level}-${action.bid.suit}`;
  if (action.type === 'orderContract') return `orderContract:${contractKey(action.contract)}`;
  if (action.type === 'pickupWidow') return 'pickupWidow';
  if (action.type === 'discardCards') return `discardCards:${[...action.cardIds].sort().join(',')}`;
  if (action.type === 'settleDeal') return 'settleDeal';
  if (action.type === 'startNextDeal') return 'startNextDeal';
  return `playCard:${action.cardId}`;
}

function contractKey(contract: Bid): string {
  if (contract.type === 'misere') return 'misere';
  return `${contract.level}-${contract.suit}`;
}

function makeBiddingState(overrides: Partial<BiddingState> = {}): BiddingState {
  return {
    phase: 'bidding',
    seed: 845001,
    bulletTarget: 10,
    players: players(),
    dealer: 2,
    actor: overrides.actor ?? 0,
    hands: overrides.hands ?? [
      [findCard('clubs-7')],
      [findCard('clubs-10')],
      [findCard('clubs-ace')]
    ],
    widow: overrides.widow ?? [findCard('hearts-7'), findCard('spades-7')],
    currentBid: overrides.currentBid ?? null,
    bidWinner: overrides.bidWinner ?? null,
    passed: overrides.passed ?? [],
    scores: overrides.scores ?? emptyScores(),
    allPassCount: overrides.allPassCount ?? 0,
    log: overrides.log ?? ['Desktop bidding fixture']
  };
}

function makePlayState(overrides: Partial<PlayState> = {}): PlayState {
  return {
    phase: 'play',
    seed: 845003,
    bulletTarget: 10,
    players: players(),
    dealer: 2,
    actor: overrides.actor ?? 0,
    hands: overrides.hands ?? [
      [findCard('clubs-7'), findCard('spades-7')],
      [findCard('clubs-10')],
      [findCard('hearts-7')]
    ],
    widow: overrides.widow ?? [],
    scores: overrides.scores ?? emptyScores(),
    allPassCount: overrides.allPassCount ?? 0,
    log: overrides.log ?? ['Desktop play fixture'],
    mode: overrides.mode ?? 'contract',
    contract: overrides.contract ?? { type: 'game', level: 6, suit: 'spades' },
    declarer: overrides.declarer !== undefined ? overrides.declarer : 0,
    trump: overrides.trump !== undefined ? overrides.trump : 'spades',
    currentTrick: overrides.currentTrick ?? [],
    tricksTaken: overrides.tricksTaken ?? [0, 0, 0],
    whistResponses: overrides.whistResponses ?? ['whist', 'pass']
  };
}

function makeWhistState(
  overrides: Partial<ContractState> & { contract: Extract<Bid, { type: 'game' }> }
): ContractState {
  return {
    phase: 'contract',
    step: 'whist-decision',
    seed: 845002,
    bulletTarget: 10,
    players: overrides.players ?? players(),
    dealer: 2,
    actor: overrides.actor ?? 1,
    hands: overrides.hands ?? [
      [findCard('clubs-7')],
      [findCard('diamonds-7')],
      [findCard('spades-7')]
    ],
    widow: overrides.widow ?? [],
    contract: overrides.contract,
    declarer: overrides.declarer ?? 0,
    defenderOrder: overrides.defenderOrder ?? [1, 2],
    whistResponses: overrides.whistResponses ?? [null, null],
    scores: overrides.scores ?? emptyScores(),
    allPassCount: overrides.allPassCount ?? 0,
    log: overrides.log ?? ['Desktop whist fixture']
  };
}

function makeSettlementState(
  overrides: Partial<DealSettlementState> & Pick<DealSettlementState, 'contract' | 'declarer'>
): DealSettlementState {
  return {
    phase: 'deal-settlement',
    seed: 845006,
    bulletTarget: 10,
    players: players(),
    dealer: 2,
    actor: 0,
    hands: [[], [], []],
    widow: [],
    scores: overrides.scores ?? emptyScores(),
    allPassCount: overrides.allPassCount ?? 0,
    log: overrides.log ?? ['Desktop settlement fixture'],
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

function emptyScores(): [Score, Score, Score] {
  return [
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] }
  ];
}

function scoreMidBullet(): [Score, Score, Score] {
  return [
    { bullet: 2, mountain: 1, whists: [0, 4, -2] },
    { bullet: 2, mountain: 3, whists: [-4, 0, 5] },
    { bullet: 1, mountain: 0, whists: [2, -5, 0] }
  ];
}

function scoreNearFinish(): [Score, Score, Score] {
  return [
    { bullet: 8, mountain: 0, whists: [0, 4, -2] },
    { bullet: 10, mountain: 3, whists: [-4, 0, 5] },
    { bullet: 10, mountain: 2, whists: [2, -5, 0] }
  ];
}

function players(): FinishedState['players'] {
  return [
    { id: 0, name: 'You', kind: 'human' },
    { id: 1, name: 'AF Computers', kind: 'ai' },
    { id: 2, name: 'VIMCOM', kind: 'ai' }
  ];
}

function makePlayers(overrides: Partial<Record<0 | 1 | 2, 'human' | 'ai'>>): FinishedState['players'] {
  return players().map((player) => ({
    ...player,
    kind: overrides[player.id as 0 | 1 | 2] ?? player.kind
  })) as FinishedState['players'];
}

function findCard(id: Card['id']): Card {
  const card = createDeck().find((candidate) => candidate.id === id);
  expect(card).toBeDefined();
  return card as Card;
}
