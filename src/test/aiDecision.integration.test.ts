import { describe, expect, it } from 'vitest';
import { chooseAiAction } from '../ai/heuristicAi';
import { createDeck, type Card } from '../domain/cards';
import { applyAction, createNewGame, getLegalActions } from '../domain/engine';
import type { Bid } from '../domain/rules';
import type { BiddingState, ContractState, DealSettlementState, GameAction, GameState, PlayState, Score } from '../domain/state';
import { deterministicSeeds, runDeterministicSmoke } from './integrationHarness';

describe('AI decision integration', () => {
  it('keeps chooseAiAction legal and applyAction-compatible across representative US-843 phases', () => {
    const orderState = makeContractOrderState({ type: 'game', level: 6, suit: 'clubs' });
    const widowPickupState = { ...orderState, step: 'widow-pickup' as const };
    if (widowPickupState.phase !== 'contract') throw new Error('Expected widow pickup contract state');
    const discardState = applyAction(widowPickupState, { type: 'pickupWidow' });
    if (discardState.phase !== 'contract') throw new Error('Expected discard contract state');

    const scenarios: Array<{
      name: string;
      state: GameState;
      seed: number;
      expectedActionTypes: GameAction['type'][];
      assertNext?: (next: GameState, chosen: GameAction, legal: GameAction[]) => void;
    }> = [
      {
        name: 'bidding',
        state: makeStrongBiddingState(),
        seed: 401,
        expectedActionTypes: ['pass', 'bidGame', 'bidMisere'],
        assertNext: (next, chosen, legal) => {
          expect(legal[0]).toEqual({ type: 'pass' });
          expect(chosen).not.toEqual(legal[0]);
          expect(['bidding', 'contract', 'play']).toContain(next.phase);
        }
      },
      {
        name: 'contract-order',
        state: orderState,
        seed: 402,
        expectedActionTypes: ['orderContract'],
        assertNext: (next, chosen) => {
          expect(chosen.type).toBe('orderContract');
          expect(next.phase).toBe('contract');
          if (next.phase !== 'contract') throw new Error('Expected contract next state');
          expect(next.step).toBe('whist-decision');
        }
      },
      {
        name: 'widow-pickup',
        state: widowPickupState,
        seed: 403,
        expectedActionTypes: ['pickupWidow'],
        assertNext: (next, chosen) => {
          expect(chosen).toEqual({ type: 'pickupWidow' });
          expect(next.phase).toBe('contract');
          if (next.phase !== 'contract') throw new Error('Expected contract next state');
          expect(next.step).toBe('discard');
        }
      },
      {
        name: 'discard',
        state: discardState,
        seed: 404,
        expectedActionTypes: ['discardCards'],
        assertNext: (next, chosen) => {
          expect(chosen.type).toBe('discardCards');
          if (chosen.type !== 'discardCards') throw new Error('Expected discardCards action');
          expect(chosen.cardIds).toHaveLength(2);
          expect(next.phase).toBe('contract');
          if (next.phase !== 'contract') throw new Error('Expected contract next state');
          expect(next.step).toBe('order');
        }
      },
      {
        name: 'whist-six-spades',
        state: makeWhistState({ type: 'game', level: 6, suit: 'spades' }),
        seed: 405,
        expectedActionTypes: ['pass', 'whist', 'halfWhist'],
        assertNext: (next, chosen) => {
          expect(['pass', 'whist', 'halfWhist']).toContain(chosen.type);
          expect(['contract', 'play']).toContain(next.phase);
        }
      },
      {
        name: 'whist-ten-level-check',
        state: makeWhistState({ type: 'game', level: 10, suit: 'hearts' }),
        seed: 406,
        expectedActionTypes: ['check'],
        assertNext: (next, chosen) => {
          expect(chosen).toEqual({ type: 'check' });
          expect(next.phase).toBe('contract');
          if (next.phase !== 'contract') throw new Error('Expected contract next state');
          expect(next.step).toBe('whist-decision');
        }
      },
      {
        name: 'all-pass-play',
        state: makePlayState({
          mode: 'all-pass',
          contract: { type: 'allPass' },
          declarer: null,
          trump: null
        }),
        seed: 407,
        expectedActionTypes: ['playCard'],
        assertNext: (next, chosen) => {
          expect(chosen.type).toBe('playCard');
          expect(next.phase).toBe('play');
        }
      },
      {
        name: 'misere-play',
        state: makePlayState({
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
        }),
        seed: 408,
        expectedActionTypes: ['playCard'],
        assertNext: (next, chosen, legal) => {
          expect(chosen.type).toBe('playCard');
          expect(legal).toHaveLength(2);
          expect(next.phase).toBe('play');
        }
      },
      {
        name: 'contract-play-follow-suit',
        state: makePlayState({
          mode: 'contract',
          contract: { type: 'game', level: 8, suit: 'hearts' },
          declarer: 0,
          trump: 'hearts',
          actor: 1,
          hands: [
            [findCard('hearts-ace')],
            [findCard('clubs-7'), findCard('hearts-7')],
            [findCard('clubs-8'), findCard('spades-7')]
          ],
          currentTrick: [{ player: 0, card: findCard('clubs-10') }],
          tricksTaken: [0, 0, 0]
        }),
        seed: 409,
        expectedActionTypes: ['playCard'],
        assertNext: (next, chosen, legal) => {
          expect(legal).toEqual([{ type: 'playCard', cardId: 'clubs-7' }]);
          expect(chosen).toEqual({ type: 'playCard', cardId: 'clubs-7' });
          expect(next.phase).toBe('play');
        }
      },
      {
        name: 'deal-settlement',
        state: makeSettlementState(),
        seed: 410,
        expectedActionTypes: ['settleDeal'],
        assertNext: (next, chosen) => {
          expect(chosen).toEqual({ type: 'settleDeal' });
          expect(next.phase).toBe('next-deal');
        }
      },
      {
        name: 'next-deal',
        state: makeNextDealState(),
        seed: 411,
        expectedActionTypes: ['startNextDeal'],
        assertNext: (next, chosen) => {
          expect(chosen).toEqual({ type: 'startNextDeal' });
          expect(next.phase).toBe('bidding');
        }
      }
    ];

    for (const scenario of scenarios) {
      const legal = getLegalActions(scenario.state);
      expect(legal.length, scenario.name).toBeGreaterThan(0);

      const chosen = chooseAiAction(scenario.state, scenario.seed);

      expect(scenario.expectedActionTypes, scenario.name).toContain(chosen.type);
      expect(actionKeys(legal), scenario.name).toContain(actionKey(chosen));

      const next = applyAction(scenario.state, chosen);
      scenario.assertNext?.(next, chosen, legal);
    }
  });

  it('reports seed, phase, actor, legal actions, chosen action, and trace when the auto-turn harness goes illegal', () => {
    expect(() =>
      runDeterministicSmoke({
        seed: deterministicSeeds.fullBulletSmoke,
        maxSteps: 2,
        chooseAction: () => ({ type: 'startNextDeal' })
      })
    ).toThrowError(new RegExp(`seed=${deterministicSeeds.fullBulletSmoke}`));
    expect(() =>
      runDeterministicSmoke({
        seed: deterministicSeeds.fullBulletSmoke,
        maxSteps: 2,
        chooseAction: () => ({ type: 'startNextDeal' })
      })
    ).toThrowError(/phase=bidding/);
    expect(() =>
      runDeterministicSmoke({
        seed: deterministicSeeds.fullBulletSmoke,
        maxSteps: 2,
        chooseAction: () => ({ type: 'startNextDeal' })
      })
    ).toThrowError(/actor=0/);
    expect(() =>
      runDeterministicSmoke({
        seed: deterministicSeeds.fullBulletSmoke,
        maxSteps: 2,
        chooseAction: () => ({ type: 'startNextDeal' })
      })
    ).toThrowError(/legal=/);
    expect(() =>
      runDeterministicSmoke({
        seed: deterministicSeeds.fullBulletSmoke,
        maxSteps: 2,
        chooseAction: () => ({ type: 'startNextDeal' })
      })
    ).toThrowError(/legalCount=/);
    expect(() =>
      runDeterministicSmoke({
        seed: deterministicSeeds.fullBulletSmoke,
        maxSteps: 2,
        chooseAction: () => ({ type: 'startNextDeal' })
      })
    ).toThrowError(/chosen=startNextDeal/);
    expect(() =>
      runDeterministicSmoke({
        seed: deterministicSeeds.fullBulletSmoke,
        maxSteps: 2,
        chooseAction: () => ({ type: 'startNextDeal' })
      })
    ).toThrowError(/trace=/);
  });
});

function actionKey(action: GameAction): string {
  if (action.type === 'pass') return 'pass';
  if (action.type === 'check') return 'check';
  if (action.type === 'whist') return 'whist';
  if (action.type === 'halfWhist') return 'halfWhist';
  if (action.type === 'bidMisere') return 'bidMisere';
  if (action.type === 'bidGame') return `bidGame:${action.bid.level}-${action.bid.suit}`;
  if (action.type === 'orderContract') return `orderContract:${formatBid(action.contract)}`;
  if (action.type === 'pickupWidow') return 'pickupWidow';
  if (action.type === 'discardCards') return `discardCards:${[...action.cardIds].sort().join(',')}`;
  if (action.type === 'playCard') return `playCard:${action.cardId}`;
  if (action.type === 'settleDeal') return 'settleDeal';
  return 'startNextDeal';
}

function actionKeys(actions: GameAction[]): string[] {
  return actions.map(actionKey);
}

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

function findCard(cardId: Card['id']): Card {
  const card = createDeck().find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Missing card ${cardId}`);
  return card;
}

function formatBid(bid: Bid): string {
  return bid.type === 'misere' ? 'misere' : `${bid.level}-${bid.suit}`;
}
