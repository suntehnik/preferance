import { describe, expect, it } from 'vitest';
import { chooseAiAction } from './heuristicAi';
import { createDeck, type Card } from '../domain/cards';
import { applyAction, createNewGame, getLegalActions } from '../domain/engine';
import type { Bid } from '../domain/rules';
import type { BiddingState, ContractState, DealSettlementState, GameState, PlayState, Score } from '../domain/state';

describe('heuristic AI', () => {
  it('always returns a legal action across representative AI-controlled phases', () => {
    const orderState = makeContractOrderState({ type: 'game', level: 6, suit: 'clubs' });
    const widowPickupState = { ...orderState, step: 'widow-pickup' as const };
    if (widowPickupState.phase !== 'contract') throw new Error('Expected contract widow pickup state');
    const discardState = applyAction(widowPickupState, { type: 'pickupWidow' });
    if (discardState.phase !== 'contract') throw new Error('Expected contract discard state');

    const states: GameState[] = [
      makeStrongBiddingState(),
      widowPickupState,
      discardState,
      orderState,
      makeWhistState({ type: 'game', level: 6, suit: 'spades' }),
      makePlayState({ mode: 'all-pass', contract: { type: 'allPass' }, declarer: null, trump: null }),
      makePlayState({ mode: 'misere', contract: { type: 'misere' }, declarer: 0, trump: null }),
      makePlayState(),
      makeSettlementState(),
      makeNextDealState()
    ];

    states.forEach((state, index) => {
      const legal = getLegalActions(state);
      expect(legal.length).toBeGreaterThan(0);
      const chosen = chooseAiAction(state, 100 + index);
      expect(legal).toContainEqual(chosen);
    });
  });

  it('uses bidding heuristics instead of blindly taking the first legal action', () => {
    const state = makeStrongBiddingState();
    const legal = getLegalActions(state);

    expect(legal[0]).toEqual({ type: 'pass' });

    const chosen = chooseAiAction(state, 5);

    expect(chosen.type).toBe('bidGame');
    expect(chosen).not.toEqual(legal[0]);
  });

  it('passes instead of pushing an already-overstretched bidding ladder to ten', () => {
    const state = makeModerateBiddingState({
      currentBid: { type: 'game', level: 8, suit: 'hearts' },
      bidWinner: 2
    });

    expect(chooseAiAction(state, 21)).toEqual({ type: 'pass' });
  });

  it('orders a legal contract that is not below the winning bid', () => {
    const state = makeContractOrderState({ type: 'game', level: 6, suit: 'clubs' });
    const chosen = chooseAiAction(state, 7);

    expect(chosen.type).toBe('orderContract');
    if (chosen.type !== 'orderContract') throw new Error('Expected orderContract');
    expect(getLegalActions(state)).toContainEqual(chosen);
    expect(contractRank(chosen.contract)).toBeGreaterThanOrEqual(contractRank(state.contract));
  });

  it('does not inflate a moderate won bid into a ten-level ordered contract', () => {
    const state = makeModerateContractOrderState({ type: 'game', level: 6, suit: 'spades' });
    const chosen = chooseAiAction(state, 23);

    expect(chosen.type).toBe('orderContract');
    if (chosen.type !== 'orderContract') throw new Error('Expected orderContract');
    expect(chosen.contract.type).toBe('game');
    if (chosen.contract.type !== 'game') throw new Error('Expected game contract');
    expect(chosen.contract.level).toBeLessThan(10);
  });

  it('discards exactly two legal low-value cards from the declarer hand', () => {
    const state = makeDiscardState();
    const chosen = chooseAiAction(state, 9);

    expect(chosen.type).toBe('discardCards');
    if (chosen.type !== 'discardCards') throw new Error('Expected discardCards');
    expect(chosen.cardIds).toHaveLength(2);
    expect(getLegalActions(state)).toContainEqual(chosen);
    expect([...chosen.cardIds].sort()).toEqual(['clubs-7', 'diamonds-7']);
  });

  it('checks ten-level games during whist decisions', () => {
    const state = makeWhistState({ type: 'game', level: 10, suit: 'hearts' });

    expect(chooseAiAction(state, 11)).toEqual({ type: 'check' });
  });

  it('uses mandatory whist for six-spades decisions', () => {
    const state = makeWhistState({ type: 'game', level: 6, suit: 'spades' });
    const legal = getLegalActions(state);
    const chosen = chooseAiAction(state, 13);

    expect(legal).toEqual([{ type: 'whist' }]);
    expect(chosen).toEqual({ type: 'whist' });
  });

  it('uses play-mode context instead of one phase-blind card choice', () => {
    const allPass = makePlayState({
      mode: 'all-pass',
      contract: { type: 'allPass' },
      declarer: null,
      trump: null,
      hands: [
        [findCard('clubs-7'), findCard('hearts-ace')],
        [findCard('clubs-8'), findCard('diamonds-8')],
        [findCard('clubs-9'), findCard('spades-7')]
      ],
      currentTrick: [],
      actor: 0
    });
    const misere = makePlayState({
      mode: 'misere',
      contract: { type: 'misere' },
      declarer: 0,
      trump: null,
      hands: [
        [findCard('clubs-7'), findCard('hearts-ace')],
        [findCard('clubs-8'), findCard('diamonds-8')],
        [findCard('clubs-9'), findCard('spades-7')]
      ],
      currentTrick: [],
      actor: 0
    });
    const contract = makePlayState({
      mode: 'contract',
      contract: { type: 'game', level: 8, suit: 'hearts' },
      declarer: 0,
      trump: 'hearts',
      hands: [
        [findCard('clubs-7'), findCard('hearts-ace')],
        [findCard('clubs-8'), findCard('diamonds-8')],
        [findCard('clubs-9'), findCard('spades-7')]
      ],
      currentTrick: [],
      actor: 0
    });

    const allPassAction = chooseAiAction(allPass, 15);
    const misereAction = chooseAiAction(misere, 15);
    const contractAction = chooseAiAction(contract, 15);

    expect(allPassAction).toEqual({ type: 'playCard', cardId: 'clubs-7' });
    expect(misereAction).toEqual({ type: 'playCard', cardId: 'clubs-7' });
    expect(contractAction).toEqual({ type: 'playCard', cardId: 'hearts-ace' });
    expect(contractAction).not.toEqual(getLegalActions(contract)[0]);
  });

  it('plays only trump when void in the led suit during a trump contract', () => {
    const state = makePlayState({
      actor: 1,
      trump: 'spades',
      currentTrick: [{ player: 0, card: findCard('clubs-7') }],
      hands: [
        [findCard('clubs-8')],
        [findCard('hearts-7'), findCard('diamonds-7'), findCard('spades-7'), findCard('spades-8')],
        [findCard('clubs-9')]
      ]
    });

    const action = chooseAiAction(state, 31);

    expect(getLegalActions(state)).toEqual([
      { type: 'playCard', cardId: 'spades-7' },
      { type: 'playCard', cardId: 'spades-8' }
    ]);
    expect(action.type).toBe('playCard');
    if (action.type !== 'playCard') throw new Error('Expected playCard');
    expect(['spades-7', 'spades-8']).toContain(action.cardId);
  });

  it('handles continuation phases with legal continuation actions', () => {
    expect(chooseAiAction(makeSettlementState(), 17)).toEqual({ type: 'settleDeal' });
    expect(chooseAiAction(makeNextDealState(), 17)).toEqual({ type: 'startNextDeal' });
  });

  it('throws a diagnostic error with phase context when no legal actions exist', () => {
    const state = {
      ...makePlayState(),
      phase: 'finished' as const,
      winnerSummary: 'Done'
    };

    expect(() => chooseAiAction(state, 19)).toThrowError(/phase=finished/);
    expect(() => chooseAiAction(state, 19)).toThrowError(/actor=0/);
  });
});

function emptyScores(): [Score, Score, Score] {
  return [
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] }
  ];
}

function makeBiddingBase(): BiddingState {
  return {
    phase: 'bidding',
    seed: 99,
    bulletTarget: 10,
    players: createNewGame(1).players,
    dealer: 2,
    actor: 1,
    hands: [
      [findCard('clubs-7'), findCard('clubs-8'), findCard('diamonds-7'), findCard('diamonds-8'), findCard('hearts-7'), findCard('hearts-8'), findCard('spades-7'), findCard('spades-8'), findCard('clubs-9'), findCard('diamonds-9')],
      [findCard('spades-ace'), findCard('spades-king'), findCard('spades-queen'), findCard('spades-jack'), findCard('hearts-ace'), findCard('hearts-king'), findCard('clubs-ace'), findCard('clubs-king'), findCard('diamonds-ace'), findCard('diamonds-king')],
      [findCard('clubs-10'), findCard('clubs-jack'), findCard('diamonds-10'), findCard('diamonds-jack'), findCard('hearts-10'), findCard('hearts-jack'), findCard('spades-10'), findCard('spades-9'), findCard('clubs-queen'), findCard('diamonds-queen')]
    ],
    widow: [findCard('hearts-9'), findCard('spades-8')],
    currentBid: null,
    bidWinner: null,
    passed: [],
    scores: emptyScores(),
    allPassCount: 0,
    log: ['Fixture']
  };
}

function makeStrongBiddingState(): BiddingState {
  return makeBiddingBase();
}

function makeModerateBiddingState(overrides: Partial<BiddingState> = {}): BiddingState {
  return {
    ...makeBiddingBase(),
    actor: 1,
    hands: [
      [findCard('clubs-7'), findCard('clubs-8'), findCard('diamonds-7'), findCard('diamonds-8'), findCard('hearts-7'), findCard('hearts-8'), findCard('spades-7'), findCard('spades-8'), findCard('clubs-9'), findCard('diamonds-9')],
      [findCard('spades-ace'), findCard('spades-king'), findCard('spades-queen'), findCard('clubs-ace'), findCard('clubs-king'), findCard('diamonds-ace'), findCard('hearts-10'), findCard('hearts-9'), findCard('diamonds-8'), findCard('clubs-8')],
      [findCard('clubs-10'), findCard('clubs-jack'), findCard('diamonds-10'), findCard('diamonds-jack'), findCard('hearts-jack'), findCard('spades-10'), findCard('spades-9'), findCard('clubs-queen'), findCard('diamonds-queen'), findCard('hearts-queen')]
    ],
    currentBid: null,
    bidWinner: null,
    passed: [],
    ...overrides
  };
}

function makeContractOrderState(winningBid: Extract<Bid, { type: 'game' }>): ContractState {
  const base = makeBiddingBase();
  return {
    phase: 'contract',
    step: 'order',
    seed: base.seed,
    bulletTarget: base.bulletTarget,
    players: base.players,
    dealer: base.dealer,
    actor: 1,
    hands: base.hands,
    widow: base.widow,
    contract: winningBid,
    declarer: 1,
    defenderOrder: [2, 0],
    whistResponses: [null, null],
    scores: base.scores,
    allPassCount: 0,
    log: base.log
  };
}

function makeModerateContractOrderState(winningBid: Extract<Bid, { type: 'game' }>): ContractState {
  const base = makeModerateBiddingState();
  return {
    phase: 'contract',
    step: 'order',
    seed: base.seed,
    bulletTarget: base.bulletTarget,
    players: base.players,
    dealer: base.dealer,
    actor: 1,
    hands: base.hands,
    widow: base.widow,
    contract: winningBid,
    declarer: 1,
    defenderOrder: [2, 0],
    whistResponses: [null, null],
    scores: base.scores,
    allPassCount: 0,
    log: base.log
  };
}

function makeWhistState(contract: Extract<Bid, { type: 'game' }>): ContractState {
  const base = makeContractOrderState(contract);
  return {
    ...base,
    step: 'whist-decision',
    actor: 2,
    widow: [],
    hands: base.hands.map((hand) => hand.slice(0, 10)) as typeof base.hands
  };
}

function makeDiscardState(): ContractState {
  return {
    ...makeContractOrderState({ type: 'game', level: 7, suit: 'hearts' }),
    step: 'discard',
    widow: [],
    hands: [
      [findCard('clubs-8'), findCard('diamonds-8'), findCard('hearts-8'), findCard('spades-8'), findCard('clubs-9'), findCard('diamonds-9'), findCard('hearts-9'), findCard('spades-9'), findCard('clubs-10'), findCard('diamonds-10')],
      [
        findCard('clubs-7'),
        findCard('diamonds-7'),
        findCard('clubs-queen'),
        findCard('diamonds-queen'),
        findCard('hearts-queen'),
        findCard('hearts-king'),
        findCard('hearts-ace'),
        findCard('spades-queen'),
        findCard('spades-king'),
        findCard('spades-ace'),
        findCard('hearts-10'),
        findCard('spades-10')
      ],
      [findCard('clubs-jack'), findCard('diamonds-jack'), findCard('hearts-jack'), findCard('spades-jack'), findCard('clubs-king'), findCard('diamonds-king'), findCard('clubs-ace'), findCard('diamonds-ace'), findCard('hearts-7'), findCard('spades-7')]
    ] as [Card[], Card[], Card[]]
  };
}

function makePlayState(overrides: Partial<PlayState> = {}): PlayState {
  const base = makeBiddingBase();
  return {
    phase: 'play',
    mode: 'contract',
    seed: base.seed,
    bulletTarget: base.bulletTarget,
    players: base.players,
    dealer: base.dealer,
    actor: 0,
    hands: [
      [findCard('clubs-7'), findCard('hearts-7')],
      [findCard('clubs-8'), findCard('hearts-8')],
      [findCard('clubs-9'), findCard('spades-7')]
    ],
    widow: [],
    contract: { type: 'game', level: 6, suit: 'spades' },
    declarer: 0,
    trump: 'spades',
    currentTrick: [],
    tricksTaken: [0, 0, 0],
    whistResponses: ['whist', 'pass'],
    scores: emptyScores(),
    allPassCount: 0,
    log: ['Fixture'],
    ...overrides
  };
}

function makeSettlementState(overrides: Partial<DealSettlementState> = {}): DealSettlementState {
  const play = makePlayState();
  return {
    phase: 'deal-settlement',
    mode: play.mode,
    seed: play.seed,
    bulletTarget: play.bulletTarget,
    players: play.players,
    dealer: play.dealer,
    actor: play.actor,
    hands: [[], [], []],
    widow: [],
    contract: play.contract,
    declarer: play.declarer,
    trump: play.trump,
    currentTrick: [],
    tricksTaken: [6, 2, 2],
    whistResponses: play.whistResponses,
    scores: emptyScores(),
    allPassCount: 0,
    log: ['Fixture'],
    settlementSummary: 'Ready to settle',
    ...overrides
  };
}

function makeNextDealState(
  overrides: Partial<Extract<GameState, { phase: 'next-deal' }>> = {}
): Extract<GameState, { phase: 'next-deal' }> {
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

function contractRank(contract: Bid): number {
  if (contract.type === 'misere') return 100;
  const suits = ['spades', 'clubs', 'diamonds', 'hearts'];
  return contract.level * 10 + suits.indexOf(contract.suit);
}

function findCard(cardId: Card['id']): Card {
  const card = createDeck().find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Missing card ${cardId}`);
  return card;
}
