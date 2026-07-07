import { describe, expect, it, vi } from 'vitest';
import { createDeck, type Card } from '../domain/cards';
import { applyAction, getLegalActions } from '../domain/engine';
import type { Bid } from '../domain/rules';
import type {
  BiddingState,
  ContractState,
  DealSettlementState,
  GameAction,
  GameState,
  NextDealState,
  PlayState,
  Score
} from '../domain/state';
import { renderGame } from '../ui/render';

describe('US-842 rule flow integration', () => {
  it('runs an all-pass deal from bidding through play, settlement, and next-deal continuation with legal actions only', () => {
    const opening = makeBiddingState({
      hands: [
        [findCard('clubs-7')],
        [findCard('clubs-10')],
        [findCard('clubs-ace')]
      ],
      widow: [findCard('hearts-7'), findCard('spades-7')],
      allPassCount: 2
    });

    const afterAllPass = applySequence(opening, [{ type: 'pass' }, { type: 'pass' }, { type: 'pass' }]);
    expect(afterAllPass.phase).toBe('play');
    if (afterAllPass.phase !== 'play') throw new Error('Expected play');
    expect(afterAllPass.mode).toBe('all-pass');
    expect(afterAllPass.contract).toEqual({ type: 'allPass' });
    expect(afterAllPass.allPassCount).toBe(3);
    expect(legalActionKeys(afterAllPass)).toEqual(['playCard:clubs-7']);
    expect(renderProjection(afterAllPass)).toEqual(['playCard:clubs-7']);

    const settled = applySequence(afterAllPass, [
      { type: 'playCard', cardId: 'clubs-7' },
      { type: 'playCard', cardId: 'clubs-10' },
      { type: 'playCard', cardId: 'clubs-ace' }
    ]);
    expect(settled.phase).toBe('deal-settlement');
    if (settled.phase !== 'deal-settlement') throw new Error('Expected deal-settlement');
    expect(settled.tricksTaken).toEqual([0, 0, 1]);
    expect(legalActionKeys(settled)).toEqual(['settleDeal']);

    const nextDeal = applyAction(settled, { type: 'settleDeal' });
    expect(nextDeal.phase).toBe('next-deal');
    if (nextDeal.phase !== 'next-deal') throw new Error('Expected next-deal');
    expect(nextDeal.allPassCount).toBe(3);
    expect(legalActionKeys(nextDeal)).toEqual(['startNextDeal']);

    const reopened = applyAction(nextDeal, { type: 'startNextDeal' });
    expect(reopened.phase).toBe('bidding');
    if (reopened.phase !== 'bidding') throw new Error('Expected bidding');
    expect(legalActionKeys(reopened)).toContain('bidGame:6-spades');
  });

  it('runs the misere path through widow pickup and discard into play without whist controls', () => {
    const opening = makeBiddingState({
      hands: [
        [findCard('clubs-7')],
        [findCard('clubs-ace')],
        [findCard('clubs-king')]
      ],
      widow: [findCard('hearts-7'), findCard('spades-7')],
      scores: [
        { bullet: 0, mountain: 0, whists: [0, 0, 0] },
        { bullet: 10, mountain: 3, whists: [0, 0, 0] },
        { bullet: 10, mountain: 2, whists: [0, 0, 0] }
      ]
    });

    const misereWidow = applySequence(opening, [{ type: 'bidMisere' }, { type: 'pass' }, { type: 'pass' }]);
    expect(misereWidow.phase).toBe('contract');
    if (misereWidow.phase !== 'contract') throw new Error('Expected contract');
    expect(misereWidow.step).toBe('widow-pickup');
    expect(renderProjection(misereWidow)).toEqual(['pickupWidow']);

    const discard = applyAction(misereWidow, { type: 'pickupWidow' });
    expect(discard.phase).toBe('contract');
    if (discard.phase !== 'contract') throw new Error('Expected contract');
    expect(discard.step).toBe('discard');
    expect(discard.hands[discard.declarer]).toHaveLength(3);

    const miserePlay = applyAction(discard, expectDiscard(discard, ['hearts-7', 'spades-7']));
    expect(miserePlay.phase).toBe('play');
    if (miserePlay.phase !== 'play') throw new Error('Expected play');
    expect(miserePlay.mode).toBe('misere');
    expect(miserePlay.contract).toEqual({ type: 'misere' });
    expect(miserePlay.widow.map((card) => card.id).sort()).toEqual(['hearts-7', 'spades-7']);
    expect(renderedActionButtons(miserePlay)).toEqual([]);
    expect(renderProjection(miserePlay)).toEqual(['playCard:clubs-7']);

    const settled = applySequence(miserePlay, [
      { type: 'playCard', cardId: 'clubs-7' },
      { type: 'playCard', cardId: 'clubs-ace' },
      { type: 'playCard', cardId: 'clubs-king' }
    ]);
    expect(settled.phase).toBe('deal-settlement');
    if (settled.phase !== 'deal-settlement') throw new Error('Expected deal-settlement');
    expect(settled.tricksTaken).toEqual([0, 1, 0]);
    expect(legalActionKeys(settled)).toEqual(['settleDeal']);

    const nextDeal = applyAction(settled, { type: 'settleDeal' });
    expect(nextDeal.phase).toBe('finished');
    if (nextDeal.phase !== 'finished') throw new Error('Expected finished');
    expect(nextDeal.scores[0].bullet).toBe(10);
  });

  it('walks a contract deal through bidding, widow pickup, discard, order, whist decisions, and into play', () => {
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
    if (widowPickup.phase !== 'contract') throw new Error('Expected contract');
    expect(widowPickup.step).toBe('widow-pickup');
    expect(renderProjection(widowPickup)).toEqual(['pickupWidow']);

    const discard = applyAction(widowPickup, { type: 'pickupWidow' });
    expect(discard.phase).toBe('contract');
    if (discard.phase !== 'contract') throw new Error('Expected contract');
    expect(discard.step).toBe('discard');
    expect(discard.hands[discard.declarer]).toHaveLength(4);
    expect(renderedActionButtons(discard)).toEqual(['discardCards:pending']);

    const discardAction = expectDiscard(discard, ['clubs-7', 'diamonds-7']);
    const ordered = applyAction(discard, discardAction);
    expect(ordered.phase).toBe('contract');
    if (ordered.phase !== 'contract') throw new Error('Expected contract');
    expect(ordered.step).toBe('order');
    expect(ordered.widow.map((card) => card.id).sort()).toEqual(['clubs-7', 'diamonds-7']);
    expect(renderProjection(ordered)).toEqual(legalActionKeys(ordered));

    const firstWhist = applyAction(ordered, { type: 'orderContract', contract: { type: 'game', level: 8, suit: 'hearts' } });
    expect(firstWhist.phase).toBe('contract');
    if (firstWhist.phase !== 'contract') throw new Error('Expected contract');
    expect(firstWhist.step).toBe('whist-decision');
    expect(firstWhist.actor).toBe(1);
    expect(legalActionKeys(firstWhist)).toEqual(['halfWhist', 'pass', 'whist']);

    const secondWhist = applyAction(firstWhist, { type: 'halfWhist' });
    expect(secondWhist.phase).toBe('contract');
    if (secondWhist.phase !== 'contract') throw new Error('Expected contract');
    expect(secondWhist.step).toBe('whist-decision');
    expect(secondWhist.actor).toBe(2);
    expect(legalActionKeys(secondWhist)).toEqual(['halfWhist', 'pass', 'whist']);

    const play = applyAction(secondWhist, { type: 'pass' });
    expect(play.phase).toBe('play');
    if (play.phase !== 'play') throw new Error('Expected play');
    expect(play.mode).toBe('contract');
    expect(play.trump).toBe('hearts');
    expect(play.whistResponses).toEqual(['half-whist', 'pass']);
    expect(renderProjection(play)).toEqual(['playCard:hearts-7', 'playCard:spades-7']);
  });

  it('resolves the third card of a trick with winner, counts, and next lead through legal actions', () => {
    const state = makePlayState({
      actor: 2,
      trump: 'spades',
      currentTrick: [
        { player: 0, card: findCard('clubs-10') },
        { player: 1, card: findCard('clubs-ace') }
      ],
      hands: [[], [], [findCard('spades-7')]]
    });

    expect(legalActionKeys(state)).toEqual(['playCard:spades-7']);
    const next = applyAction(state, { type: 'playCard', cardId: 'spades-7' });

    expect(next.phase).toBe('deal-settlement');
    if (next.phase !== 'deal-settlement') throw new Error('Expected deal-settlement');
    expect(next.currentTrick).toEqual([]);
    expect(next.tricksTaken).toEqual([0, 0, 1]);
    expect(next.actor).toBe(2);
    expect(legalActionKeys(next)).toEqual(['settleDeal']);
  });

  it('keeps rendered human controls as a subset or projection of legal actions for representative US-842 states', () => {
    const bidding = makeBiddingState();
    const order = makeContractState({ step: 'order', contract: { type: 'game', level: 6, suit: 'clubs' } });
    const whist = makeContractState({
      step: 'whist-decision',
      actor: 1,
      players: makePlayers({ 1: 'human' }),
      contract: { type: 'game', level: 10, suit: 'hearts' },
      hands: [
        [findCard('clubs-7')],
        [findCard('diamonds-7')],
        [findCard('spades-7')]
      ],
      widow: []
    });
    const settlement = makeSettlementState();
    const nextDeal = makeNextDealState();

    expect(renderProjection(bidding).every((key) => legalActionKeys(bidding).includes(key))).toBe(true);
    expect(renderProjection(order)).toEqual(legalActionKeys(order));
    expect(renderProjection(whist)).toEqual(legalActionKeys(whist));
    expect(renderProjection(settlement)).toEqual(['settleDeal']);
    expect(renderProjection(nextDeal)).toEqual(['startNextDeal']);
  });
});

function applySequence(state: GameState, actions: GameAction[]): GameState {
  return actions.reduce((current, action) => {
    expect(legalActionKeys(current)).toContain(actionKey(action));
    return applyAction(current, action);
  }, state);
}

function renderProjection(state: GameState): string[] {
  const root = document.createElement('div');
  renderGame(root, state, { onAction: vi.fn(), onNewGame: vi.fn() });

  const actionKeys = Array.from(root.querySelectorAll<HTMLElement>('[data-action-key]'))
    .map((element) => element.dataset.actionKey ?? '')
    .filter((key) => key !== 'discardCards:pending');

  const playableKeys = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-card-id]'))
    .filter((button) => !button.disabled && !button.hasAttribute('data-discard-card-id'))
    .map((button) => `playCard:${button.dataset.cardId}`);

  return [...actionKeys, ...playableKeys].sort();
}

function renderedActionButtons(state: GameState): string[] {
  const root = document.createElement('div');
  renderGame(root, state, { onAction: vi.fn(), onNewGame: vi.fn() });
  return Array.from(root.querySelectorAll<HTMLElement>('[data-action-key]'))
    .map((element) => element.dataset.actionKey ?? '')
    .sort();
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

function expectDiscard(state: ContractState, cardIds: [Card['id'], Card['id']]): Extract<GameAction, { type: 'discardCards' }> {
  const target = [...cardIds].sort().join(',');
  const discard = getLegalActions(state).find(
    (action): action is Extract<GameAction, { type: 'discardCards' }> =>
      action.type === 'discardCards' && [...action.cardIds].sort().join(',') === target
  );
  expect(discard).toBeDefined();
  return discard as Extract<GameAction, { type: 'discardCards' }>;
}

function emptyScores(): [Score, Score, Score] {
  return [
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] }
  ];
}

function makeBiddingState(overrides: Partial<BiddingState> = {}): BiddingState {
  const players = makePlayers();
  return {
    phase: 'bidding',
    seed: 842,
    bulletTarget: 10,
    players,
    dealer: 2,
    actor: 0,
    hands: [
      [findCard('clubs-7'), findCard('diamonds-7')],
      [findCard('clubs-10'), findCard('diamonds-10')],
      [findCard('clubs-ace'), findCard('diamonds-ace')]
    ],
    widow: [findCard('hearts-7'), findCard('spades-7')],
    currentBid: null,
    bidWinner: null,
    passed: [],
    scores: emptyScores(),
    allPassCount: 0,
    log: ['Fixture'],
    ...overrides
  };
}

function makeContractState(overrides: Partial<ContractState> = {}): ContractState {
  const bidding = makeBiddingState();
  return {
    phase: 'contract',
    step: 'order',
    seed: bidding.seed,
    bulletTarget: bidding.bulletTarget,
    players: bidding.players,
    dealer: bidding.dealer,
    actor: 0,
    hands: bidding.hands,
    widow: bidding.widow,
    contract: { type: 'game', level: 8, suit: 'hearts' },
    declarer: 0,
    defenderOrder: [1, 2],
    whistResponses: [null, null],
    scores: bidding.scores,
    allPassCount: bidding.allPassCount,
    log: bidding.log,
    ...overrides
  };
}

function makePlayState(overrides: Partial<PlayState> = {}): PlayState {
  const contract = makeContractState();
  return {
    phase: 'play',
    mode: 'contract',
    seed: contract.seed,
    bulletTarget: contract.bulletTarget,
    players: contract.players,
    dealer: contract.dealer,
    actor: 0,
    hands: [
      [findCard('hearts-7'), findCard('spades-7')],
      [findCard('hearts-10')],
      [findCard('clubs-ace')]
    ],
    widow: [],
    contract: contract.contract,
    declarer: contract.declarer,
    trump: 'hearts',
    currentTrick: [],
    tricksTaken: [0, 0, 0],
    whistResponses: ['whist', 'pass'],
    scores: contract.scores,
    allPassCount: 0,
    log: contract.log,
    ...overrides
  };
}

function makeSettlementState(overrides: Partial<DealSettlementState> = {}): DealSettlementState {
  const play = makePlayState({
    hands: [[], [], []],
    currentTrick: [],
    tricksTaken: [6, 2, 2]
  });
  return {
    phase: 'deal-settlement',
    mode: play.mode,
    seed: play.seed,
    bulletTarget: play.bulletTarget,
    players: play.players,
    dealer: play.dealer,
    actor: play.actor,
    hands: play.hands,
    widow: play.widow,
    contract: play.contract,
    declarer: play.declarer,
    trump: play.trump,
    currentTrick: play.currentTrick,
    tricksTaken: play.tricksTaken,
    whistResponses: play.whistResponses,
    scores: play.scores,
    allPassCount: play.allPassCount,
    log: play.log,
    settlementSummary: 'Ready to settle',
    ...overrides
  };
}

function makeNextDealState(overrides: Partial<NextDealState> = {}): NextDealState {
  const settlement = makeSettlementState();
  return {
    phase: 'next-deal',
    seed: settlement.seed,
    bulletTarget: settlement.bulletTarget,
    players: settlement.players,
    dealer: settlement.dealer,
    actor: settlement.actor,
    hands: settlement.hands,
    widow: settlement.widow,
    scores: settlement.scores,
    allPassCount: settlement.allPassCount,
    log: settlement.log,
    previousSummary: settlement.settlementSummary,
    ...overrides
  };
}

function makePlayers(overrides: Partial<Record<0 | 1 | 2, 'human' | 'ai'>> = {}) {
  return [
    { id: 0 as const, name: 'You', kind: overrides[0] ?? 'human' },
    { id: 1 as const, name: 'AF Computers', kind: overrides[1] ?? 'ai' },
    { id: 2 as const, name: 'VIMCOM', kind: overrides[2] ?? 'ai' }
  ] as BiddingState['players'];
}

function findCard(cardId: Card['id']): Card {
  const card = createDeck().find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Missing card ${cardId}`);
  return card;
}
