import { describe, expect, it } from 'vitest';
import { chooseAiAction } from '../ai/heuristicAi';
import { createDeck, sortCards, type Card } from './cards';
import { applyAction, createNewGame, getLegalActions } from './engine';
import { defaultRules } from './rules';
import type { BiddingState, ContractState, DealSettlementState, GameState, PlayerId, PlayState, Score } from './state';

describe('engine', () => {
  it('starts a bidding hand with three players, sorted hands, a widow, and a default bullet target', () => {
    const game = createNewGame(123);
    expect(game.phase).toBe('bidding');
    expect(game.players.map((player) => player.name)).toEqual(['You', 'AF Computers', 'VIMCOM']);
    expect(game.dealer).toBe(2);
    expect(game.actor).toBe(0);
    expect(game.hands.every((hand) => hand.length === 10)).toBe(true);
    game.hands.forEach((hand) => expect(hand).toEqual(sortCards(hand)));
    expect(game.widow).toHaveLength(2);
    expect(game.bulletTarget).toBe(10);
  });

  it('does not share player objects between new games', () => {
    const game = createNewGame(123);
    game.players[0].name = 'Changed';

    const nextGame = createNewGame(123);

    expect(nextGame.players[0].name).toBe('You');
  });

  it('offers pass, game bids, and misere to the first bidder', () => {
    const game = createNewGame(123);
    const actions = getLegalActions(game);
    expect(actions.some((action) => action.type === 'pass')).toBe(true);
    expect(actions.some((action) => action.type === 'bidGame')).toBe(true);
    expect(actions.some((action) => action.type === 'bidMisere')).toBe(true);
  });

  it('does not offer bids to an actor who already passed', () => {
    const game = createNewGame(123);
    if (game.phase !== 'bidding') throw new Error('Expected bidding');
    const actions = getLegalActions({ ...game, actor: 0, passed: [0] });

    expect(actions.every((action) => action.type !== 'bidGame' && action.type !== 'bidMisere')).toBe(true);
  });

  it('does not offer pass or lower bids to the current bid winner', () => {
    const bid = applyAction(createNewGame(123), { type: 'bidGame', bid: { type: 'game', level: 6, suit: 'clubs' } });
    if (bid.phase !== 'bidding') throw new Error('Expected bidding');

    const actions = getLegalActions({ ...bid, actor: 0 });

    expect(actions.some((action) => action.type === 'pass')).toBe(false);
    expect(
      actions.every(
        (action) =>
          action.type !== 'bidGame' ||
          (action.bid.level === 6 && ['diamonds', 'hearts'].includes(action.bid.suit)) ||
          action.bid.level > 6
      )
    ).toBe(true);
  });
});

describe('bidding transitions', () => {
  it('ends bidding immediately when a nine-level game overcalls misere', () => {
    const misere = applyAction(createNewGame(123), { type: 'bidMisere' });
    const overcall = applyAction(misere, { type: 'bidGame', bid: { type: 'game', level: 9, suit: 'clubs' } });

    expect(overcall.phase).toBe('contract');
    if (overcall.phase !== 'contract') throw new Error('Expected contract');
    expect(overcall.contract).toEqual({ type: 'game', level: 9, suit: 'clubs' });
    expect(overcall.declarer).toBe(1);
  });

  it('records a game bid and advances the actor', () => {
    const game = createNewGame(123);
    const next = applyAction(game, { type: 'bidGame', bid: { type: 'game', level: 6, suit: 'spades' } });
    expect(next.phase).toBe('bidding');
    if (next.phase !== 'bidding') throw new Error('Expected bidding');
    expect(next.currentBid).toEqual({ type: 'game', level: 6, suit: 'spades' });
    expect(next.bidWinner).toBe(0);
    expect(next.actor).toBe(1);
  });

  it('moves to all-pass play when all players pass without a bid', () => {
    const afterOne = applyAction(createNewGame(123), { type: 'pass' });
    const afterTwo = applyAction(afterOne, { type: 'pass' });
    const afterThree = applyAction(afterTwo, { type: 'pass' });
    expect(afterThree.phase).toBe('play');
    if (afterThree.phase !== 'play') throw new Error('Expected play');
    expect(afterThree.mode).toBe('all-pass');
    expect(afterThree.contract).toEqual({ type: 'allPass' });
  });

  it('opens the widow when only the winning bidder remains', () => {
    const bid = applyAction(createNewGame(123), { type: 'bidGame', bid: { type: 'game', level: 6, suit: 'spades' } });
    const passOne = applyAction(bid, { type: 'pass' });
    const passTwo = applyAction(passOne, { type: 'pass' });
    expect(passTwo.phase).toBe('contract');
    if (passTwo.phase !== 'contract') throw new Error('Expected contract');
    expect(passTwo.step).toBe('widow-pickup');
    expect(passTwo.declarer).toBe(0);
  });

  it('opens the widow immediately when the last active bidder makes a bid after two passes', () => {
    const firstPass = applyAction(createNewGame(123), { type: 'pass' });
    const secondPass = applyAction(firstPass, { type: 'pass' });

    const next = applyAction(secondPass, { type: 'bidGame', bid: { type: 'game', level: 6, suit: 'spades' } });

    expect(next.phase).toBe('contract');
    if (next.phase !== 'contract') throw new Error('Expected contract');
    expect(next.step).toBe('widow-pickup');
    expect(next.declarer).toBe(2);
  });

  it('recovers a bidding loop when the current bid winner was already marked as passed', () => {
    const firstPass = applyAction(createNewGame(123), { type: 'pass' });
    const secondPass = applyAction(firstPass, { type: 'pass' });
    if (secondPass.phase !== 'bidding') throw new Error('Expected bidding fixture before loop recovery');
    const looped = {
      ...secondPass,
      actor: 0 as const,
      currentBid: { type: 'game', level: 6, suit: 'spades' } as const,
      bidWinner: 2 as const,
      passed: [0, 1, 2] as PlayerId[]
    };

    const next = applyAction(looped, { type: 'pass' });

    expect(next.phase).toBe('contract');
    if (next.phase !== 'contract') throw new Error('Expected contract');
    expect(next.declarer).toBe(2);
  });

  it('moves misere winners through widow pickup and discard before misere play without a whist phase', () => {
    const bid = applyAction(createNewGame(123), { type: 'bidMisere' });
    const passOne = applyAction(bid, { type: 'pass' });
    const opened = applyAction(passOne, { type: 'pass' });

    expect(opened.phase).toBe('contract');
    if (opened.phase !== 'contract') throw new Error('Expected contract');
    expect(opened.step).toBe('widow-pickup');
    expect(opened.contract).toEqual({ type: 'misere' });
    expect(getLegalActions(opened)).toEqual([{ type: 'pickupWidow' }]);

    const pickedUp = applyAction(opened, { type: 'pickupWidow' });
    expect(pickedUp.phase).toBe('contract');
    if (pickedUp.phase !== 'contract') throw new Error('Expected contract');
    expect(pickedUp.step).toBe('discard');
    expect(pickedUp.hands[pickedUp.declarer]).toHaveLength(12);

    const discard = getLegalActions(pickedUp)[0];
    if (discard.type !== 'discardCards') throw new Error('Expected discardCards');
    const play = applyAction(pickedUp, discard);

    expect(play.phase).toBe('play');
    if (play.phase !== 'play') throw new Error('Expected play');
    expect(play.mode).toBe('misere');
    expect(play.contract).toEqual({ type: 'misere' });
    expect(play.declarer).not.toBeNull();
    if (play.declarer === null) throw new Error('Expected declarer');
    expect(play.hands[play.declarer]).toHaveLength(10);
    expect(play.widow).toHaveLength(2);
    expect(getLegalActions(play).every((action) => action.type === 'playCard')).toBe(true);
  });
});

describe('contract order, widow, and discard', () => {
  it('limits contract order choices to bids that outrank the winning game bid', () => {
    const state = makeContractOrderState({ type: 'game', level: 6, suit: 'clubs' });

    const actions = getLegalActions(state);

    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((action) => action.type === 'orderContract')).toBe(true);
    expect(
      actions.some(
        (action) =>
          action.type === 'orderContract' &&
          action.contract.type === 'game' &&
          action.contract.level === 6 &&
          action.contract.suit === 'spades'
      )
    ).toBe(false);
    expect(
      actions.some(
        (action) =>
          action.type === 'orderContract' &&
          action.contract.type === 'game' &&
          action.contract.level === 6 &&
          action.contract.suit === 'clubs'
      )
    ).toBe(true);
    expect(actions.some((action) => action.type === 'playCard')).toBe(false);
  });

  it('moves won contracts through widow pickup and declarer-only discard before final order', () => {
    const opened = makeWidowPickupState({ type: 'game', level: 6, suit: 'spades' });
    expect(getLegalActions(opened)).toEqual([{ type: 'pickupWidow' }]);

    const pickedUp = applyAction(opened, { type: 'pickupWidow' });
    expect(pickedUp.phase).toBe('contract');
    if (pickedUp.phase !== 'contract') throw new Error('Expected contract');
    expect(pickedUp.step).toBe('discard');
    expect(pickedUp.hands[pickedUp.declarer]).toHaveLength(12);
    expect(pickedUp.widow).toEqual([]);

    const discardActions = getLegalActions(pickedUp);
    expect(discardActions.length).toBeGreaterThan(0);
    expect(discardActions.every((action) => action.type === 'discardCards' && action.cardIds.length === 2)).toBe(true);
    expect(discardActions.some((action) => action.type === 'whist')).toBe(false);

    const discard = discardActions[0];
    if (discard.type !== 'discardCards') throw new Error('Expected discardCards');
    const ordered = applyAction(pickedUp, discard);
    expect(ordered.phase).toBe('contract');
    if (ordered.phase !== 'contract') throw new Error('Expected contract');
    expect(ordered.step).toBe('order');
    expect(ordered.hands[ordered.declarer]).toHaveLength(10);
    expect(ordered.widow).toHaveLength(2);
    expect(getLegalActions(ordered).every((action) => action.type === 'orderContract')).toBe(true);
  });

  it('routes game contracts to whist decisions after discard and final order', () => {
    const opened = makeWidowPickupState({ type: 'game', level: 7, suit: 'hearts' });
    const pickedUp = applyAction(opened, { type: 'pickupWidow' });
    if (pickedUp.phase !== 'contract') throw new Error('Expected contract');
    const discard = getLegalActions(pickedUp)[0];
    if (discard.type !== 'discardCards') throw new Error('Expected discardCards');
    const discardedCards = pickedUp.hands[pickedUp.declarer].filter((card) => discard.cardIds.includes(card.id));

    const ordered = applyAction(pickedUp, discard);
    expect(ordered.phase).toBe('contract');
    if (ordered.phase !== 'contract') throw new Error('Expected contract');
    expect(ordered.step).toBe('order');
    expect(ordered.widow).toEqual(discardedCards);

    const next = applyAction(ordered, { type: 'orderContract', contract: { type: 'game', level: 7, suit: 'hearts' } });

    expect(next.phase).toBe('contract');
    if (next.phase !== 'contract') throw new Error('Expected contract');
    expect(next.step).toBe('whist-decision');
    expect(next.widow).toEqual(discardedCards);
    expect(next.hands[next.declarer].some((card) => discard.cardIds.includes(card.id))).toBe(false);
  });
});

describe('fixed-profile whist legal actions', () => {
  it('requires mandatory whist on six spades', () => {
    const legal = getLegalActions(makeWhistState({ type: 'game', level: 6, suit: 'spades' }));

    expect(legal).toEqual([{ type: 'whist' }]);
  });

  it('checks ten-level games instead of offering whist choices', () => {
    const legal = getLegalActions(makeWhistState({ type: 'game', level: 10, suit: 'hearts' }));

    expect(legal).toEqual([{ type: 'check' }]);
  });

  it('lets the AI choose a legal whist-phase action', () => {
    const state = makeWhistState({ type: 'game', level: 8, suit: 'clubs' });
    const legal = getLegalActions(state);

    expect(legal).toContainEqual(chooseAiAction(state, 4));
  });

  it('offers half-whist only after both defenders pass and settles it without card play', () => {
    const firstPass = applyAction(makeWhistState({ type: 'game', level: 7, suit: 'clubs' }), { type: 'pass' });
    expect(firstPass.phase).toBe('contract');
    if (firstPass.phase !== 'contract') throw new Error('Expected contract');
    expect(getLegalActions(firstPass)).toEqual([{ type: 'pass' }, { type: 'whist' }]);

    const secondPass = applyAction(firstPass, { type: 'pass' });
    expect(secondPass.phase).toBe('contract');
    if (secondPass.phase !== 'contract') throw new Error('Expected half-whist offer');
    expect(secondPass.whistStage).toBe('half-whist-offer');
    expect(getLegalActions(secondPass)).toEqual([{ type: 'pass' }, { type: 'halfWhist' }]);

    const settled = applyAction(secondPass, { type: 'halfWhist' });
    expect(settled.phase).toBe('deal-settlement');
    if (settled.phase !== 'deal-settlement') throw new Error('Expected automatic settlement');
    expect(settled.whistResponses).toEqual(['half-whist', 'pass']);
    expect(settled.dealResult?.scoreDelta[1].whists[0]).toBe(4);
  });

  it('uses the rules stored with the bullet instead of global defaults', () => {
    const state = makeWhistState({ type: 'game', level: 6, suit: 'spades' });
    state.rules = { ...defaultRules, mandatoryWhistOnSixSpades: false };

    expect(getLegalActions(state)).toEqual([{ type: 'pass' }, { type: 'whist' }]);
  });
});

describe('play and trick resolution', () => {
  it('uses the two open widow suits for the first two all-pass leads', () => {
    const firstLead = makePlayState({
      mode: 'all-pass',
      contract: { type: 'allPass' },
      declarer: null,
      trump: null,
      actor: 0,
      widow: [findCard('hearts-ace'), findCard('diamonds-ace')],
      hands: [[findCard('hearts-7'), findCard('clubs-7')], [findCard('hearts-8')], [findCard('hearts-9')]],
      tricksTaken: [0, 0, 0]
    });
    expect(getLegalActions(firstLead)).toEqual([{ type: 'playCard', cardId: 'hearts-7' }]);

    const secondLead = makePlayState({
      mode: 'all-pass',
      contract: { type: 'allPass' },
      declarer: null,
      trump: null,
      actor: 0,
      widow: [findCard('hearts-ace'), findCard('diamonds-ace')],
      hands: [[findCard('diamonds-7'), findCard('clubs-7')], [findCard('diamonds-8')], [findCard('diamonds-9')]],
      tricksTaken: [1, 0, 0]
    });
    expect(getLegalActions(secondLead)).toEqual([{ type: 'playCard', cardId: 'diamonds-7' }]);
  });

  it('only allows following suit when possible', () => {
    const state = makePlayState({
      actor: 1,
      currentTrick: [{ player: 0, card: findCard('clubs-7') }]
    });

    const legal = getLegalActions(state).filter((action) => action.type === 'playCard');
    const hasClub = state.hands[1].some((card) => card.suit === 'clubs');

    expect(legal.length).toBeGreaterThan(0);
    expect(
      legal.every((action) => {
        const card = state.hands[1].find((candidate) => candidate.id === action.cardId);
        return !hasClub || card?.suit === 'clubs';
      })
    ).toBe(true);
  });

  it('requires trump when the actor cannot follow suit in a trump contract', () => {
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

    const legal = getLegalActions(state);

    expect(legal).toEqual([
      { type: 'playCard', cardId: 'spades-7' },
      { type: 'playCard', cardId: 'spades-8' }
    ]);
  });

  it('allows any card when the actor has neither lead suit nor trump', () => {
    const state = makePlayState({
      actor: 1,
      trump: 'spades',
      currentTrick: [{ player: 0, card: findCard('clubs-7') }],
      hands: [
        [findCard('clubs-8')],
        [findCard('hearts-7'), findCard('diamonds-7')],
        [findCard('clubs-9')]
      ]
    });

    const legal = getLegalActions(state);

    expect(legal).toEqual([
      { type: 'playCard', cardId: 'hearts-7' },
      { type: 'playCard', cardId: 'diamonds-7' }
    ]);
  });

  it('allows any card without lead suit in no-trump and misere play', () => {
    const state = makePlayState({
      actor: 1,
      mode: 'misere',
      contract: { type: 'misere' },
      trump: null,
      currentTrick: [{ player: 0, card: findCard('clubs-7') }],
      hands: [
        [findCard('clubs-8')],
        [findCard('hearts-7'), findCard('diamonds-7'), findCard('spades-7')],
        [findCard('clubs-9')]
      ]
    });

    const legal = getLegalActions(state);

    expect(legal).toEqual([
      { type: 'playCard', cardId: 'hearts-7' },
      { type: 'playCard', cardId: 'diamonds-7' },
      { type: 'playCard', cardId: 'spades-7' }
    ]);
  });

  it('resolves the third card of a trick with winner, trick counts, cleared trick, and next lead', () => {
    const state = makePlayState({
      actor: 2,
      trump: 'spades',
      currentTrick: [
        { player: 0, card: findCard('clubs-10') },
        { player: 1, card: findCard('clubs-ace') }
      ],
      hands: [
        [findCard('hearts-7')],
        [findCard('diamonds-7')],
        [findCard('spades-7')]
      ]
    });

    const next = applyAction(state, { type: 'playCard', cardId: 'spades-7' });

    expect(next.phase).toBe('play');
    if (next.phase !== 'play') throw new Error('Expected play');
    expect(next.currentTrick).toEqual([]);
    expect(next.tricksTaken).toEqual([0, 0, 1]);
    expect(next.actor).toBe(2);
  });

  it('transitions the final trick into deal settlement', () => {
    const state = makePlayState({
      actor: 2,
      mode: 'all-pass',
      contract: { type: 'allPass' },
      declarer: null,
      trump: null,
      currentTrick: [
        { player: 0, card: findCard('clubs-10') },
        { player: 1, card: findCard('clubs-ace') }
      ],
      hands: [[], [], [findCard('spades-7')]],
      tricksTaken: [0, 0, 9]
    });

    const next = applyAction(state, { type: 'playCard', cardId: 'spades-7' });

    expect(next.phase).toBe('deal-settlement');
    if (next.phase !== 'deal-settlement') throw new Error('Expected deal-settlement');
    expect(next.tricksTaken).toEqual([0, 1, 9]);
    expect(getLegalActions(next)).toEqual([{ type: 'settleDeal' }]);
  });
});

describe('settlement and continuation', () => {
  it('precomputes a deterministic deal result in deal-settlement without mutating score totals yet', () => {
    const state = makePlayState({
      actor: 2,
      mode: 'contract',
      contract: { type: 'game', level: 8, suit: 'hearts' },
      declarer: 0,
      trump: 'hearts',
      whistResponses: ['whist', 'pass'],
      scores: scoreCarry(),
      currentTrick: [
        { player: 0, card: findCard('hearts-ace') },
        { player: 1, card: findCard('clubs-7') }
      ],
      hands: [[], [], [findCard('hearts-king')]],
      tricksTaken: [7, 2, 0]
    });

    const next = applyAction(state, { type: 'playCard', cardId: 'hearts-king' });

    expect(next.phase).toBe('deal-settlement');
    if (next.phase !== 'deal-settlement') throw new Error('Expected deal-settlement');
    expect(next.scores).toEqual(scoreCarry());
    expect(next.dealResult?.scoresAfter).toEqual([
      { bullet: 10, mountain: 1, whists: [0, 4, 0] },
      { bullet: 2, mountain: 3, whists: [12, 0, 5] },
      { bullet: 3, mountain: 0, whists: [2, 0, 0] }
    ]);
    expect(next.dealResult?.bulletTargetReached).toBe(false);
    expect(next.settlementSummary).toBe(next.dealResult?.summary);
  });

  it('settles progressive all-pass scoring and exposes next-deal transition', () => {
    const state = makeSettlementState({
      mode: 'all-pass',
      contract: { type: 'allPass' },
      declarer: null,
      trump: null,
      tricksTaken: [0, 2, 8],
      allPassCount: 3
    });

    const settled = applyAction(state, { type: 'settleDeal' });

    expect(settled.phase).toBe('next-deal');
    if (settled.phase !== 'next-deal') throw new Error('Expected next-deal');
    expect(settled.scores[0].bullet).toBe(3);
    expect(settled.scores[1].mountain).toBe(6);
    expect(settled.scores[2].mountain).toBe(24);
    expect(settled.previousDealResult?.outcome).toEqual({ type: 'all-pass', trickValue: 3 });
    expect(getLegalActions(settled)).toEqual([{ type: 'startNextDeal' }]);
  });

  it('starts the next deal with bidding actions that still open at six-level after all-pass', () => {
    const state = makeNextDealState({ allPassCount: 2 });

    const next = applyAction(state, { type: 'startNextDeal' });

    expect(next.phase).toBe('bidding');
    if (next.phase !== 'bidding') throw new Error('Expected bidding');
    expect(getLegalActions(next)).toContainEqual({ type: 'bidGame', bid: { type: 'game', level: 6, suit: 'spades' } });
  });

  it('moves successful settlement into bullet completion when the target is reached', () => {
    const state = makeSettlementState({
      contract: { type: 'game', level: 6, suit: 'spades' },
      declarer: 0,
      scores: scoreNearFinish()
    });

    const settled = applyAction(state, { type: 'settleDeal' });

    expect(settled.phase).toBe('finished');
    if (settled.phase !== 'finished') throw new Error('Expected finished');
    expect(settled.winnerSummary).toContain('wins the final rating');
    expect(settled.previousDealResult?.scoresAfter[0].bullet).toBe(10);
    expect(settled.finalResult?.winner).toBe(0);
    expect(settled.finalResult?.ranking.map((entry) => entry.player)).toEqual([0, 1, 2]);
    expect(getLegalActions(settled)).toEqual([]);
  });

  it('settles failed contracts and whist deltas together in one atomic deal result', () => {
    const state = makeSettlementState({
      contract: { type: 'game', level: 7, suit: 'clubs' },
      declarer: 0,
      tricksTaken: [5, 2, 3],
      whistResponses: ['whist', 'pass'],
      scores: scoreCarry()
    });

    const settled = applyAction(state, { type: 'settleDeal' });

    expect(settled.phase).toBe('next-deal');
    if (settled.phase !== 'next-deal') throw new Error('Expected next-deal');
    expect(settled.scores[0]).toEqual({ bullet: 6, mountain: 9, whists: [0, 4, 0] });
    expect(settled.scores[1]).toEqual({ bullet: 2, mountain: 3, whists: [20, 0, 5] });
    expect(settled.previousDealResult?.scoreDelta[0]).toEqual({ bullet: 0, mountain: 8, whists: [0, 0, 0] });
    expect(settled.previousDealResult?.whistAdjustments).toEqual([
      { defender: 1, declarer: 0, response: 'whist', tricks: 5, delta: 20 }
    ]);
  });

  it('records cumulative non-zero score sheet entries for each settled deal', () => {
    const first = applyAction(
      makeSettlementState({
        mode: 'all-pass',
        contract: { type: 'allPass' },
        declarer: null,
        tricksTaken: [5, 0, 0],
        allPassCount: 1
      }),
      { type: 'settleDeal' }
    );
    expect(first.phase).toBe('next-deal');
    if (first.phase !== 'next-deal') throw new Error('Expected next-deal');

    const second = applyAction(
      makeSettlementState({
        mode: 'all-pass',
        contract: { type: 'allPass' },
        declarer: null,
        tricksTaken: [8, 0, 0],
        allPassCount: 1,
        scores: first.scores,
        scoreSheet: first.scoreSheet
      }),
      { type: 'settleDeal' }
    );

    expect(second.phase).toBe('next-deal');
    if (second.phase !== 'next-deal') throw new Error('Expected next-deal');
    expect(second.scoreSheet?.[0].mountain).toEqual([5, 13]);
    expect(second.scoreSheet?.[0].bullet).toEqual([]);
    expect(second.scoreSheet?.[1].bullet).toEqual([1, 2]);
    expect(second.scoreSheet?.[2].bullet).toEqual([1, 2]);
  });
});

describe('playable loop smoke', () => {
  it('keeps state valid after several legal actions', () => {
    let state = createNewGame(314);
    for (let step = 0; step < 8; step += 1) {
      const action = getLegalActions(state)[0];
      expect(action).toBeDefined();
      state = applyAction(state, action);
      expect(state.players).toHaveLength(3);
      expect(state.hands).toHaveLength(3);
    }
  });
});

function emptyScores(): [Score, Score, Score] {
  return [
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] }
  ];
}

function scoreCarry(): [Score, Score, Score] {
  return [
    { bullet: 6, mountain: 1, whists: [0, 4, 0] },
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

function makeBiddingBase(): BiddingState {
  const handA = [findCard('clubs-7'), findCard('clubs-8'), findCard('diamonds-7'), findCard('diamonds-8'), findCard('hearts-7'), findCard('hearts-8'), findCard('spades-7'), findCard('spades-8'), findCard('clubs-9'), findCard('diamonds-9')];
  const handB = [findCard('clubs-10'), findCard('clubs-jack'), findCard('diamonds-10'), findCard('diamonds-jack'), findCard('hearts-10'), findCard('hearts-jack'), findCard('spades-10'), findCard('spades-jack'), findCard('clubs-queen'), findCard('diamonds-queen')];
  const handC = [findCard('clubs-king'), findCard('clubs-ace'), findCard('diamonds-king'), findCard('diamonds-ace'), findCard('hearts-queen'), findCard('hearts-king'), findCard('hearts-ace'), findCard('spades-queen'), findCard('spades-king'), findCard('spades-ace')];

  return {
    phase: 'bidding',
    seed: 99,
    bulletTarget: 10,
    players: createNewGame(1).players,
    dealer: 2,
    actor: 0,
    hands: [handA, handB, handC],
    widow: [findCard('hearts-9'), findCard('spades-9')],
    currentBid: null,
    bidWinner: null,
    passed: [],
    scores: emptyScores(),
    allPassCount: 0,
    log: ['Fixture']
  };
}

function makeContractOrderState(winningBid: { type: 'game'; level: 6 | 7 | 8 | 9 | 10; suit: 'spades' | 'clubs' | 'diamonds' | 'hearts' }): ContractState {
  const base = makeBiddingBase();
  return {
    phase: 'contract',
    step: 'order',
    seed: base.seed,
    bulletTarget: base.bulletTarget,
    players: base.players,
    dealer: base.dealer,
    actor: 0,
    hands: base.hands,
    widow: base.widow,
    contract: winningBid,
    declarer: 0,
    defenderOrder: [1, 2],
    whistResponses: [null, null],
    scores: base.scores,
    allPassCount: 0,
    log: base.log
  };
}

function makeWidowPickupState(winningBid: { type: 'game'; level: 6 | 7 | 8 | 9 | 10; suit: 'spades' | 'clubs' | 'diamonds' | 'hearts' }): ContractState {
  return {
    ...makeContractOrderState(winningBid),
    step: 'widow-pickup'
  };
}

function makeWhistState(contract: { type: 'game'; level: 6 | 7 | 8 | 9 | 10; suit: 'spades' | 'clubs' | 'diamonds' | 'hearts' }): ContractState {
  const base = makeContractOrderState(contract);
  return {
    ...base,
    step: 'whist-decision',
    actor: 1,
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
