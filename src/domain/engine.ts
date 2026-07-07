import { createDeck, dealPreference, ranks, seededShuffle, sortCards, type Card } from './cards';
import { defaultRules, isBidAllowedAfter, type Bid, type GameBid } from './rules';
import { calculateFinalResult, settleDealResult } from './scoring';
import type {
  BiddingState,
  ContractState,
  DealResult,
  DealSettlementState,
  FinalResult,
  GameAction,
  GameState,
  NextDealState,
  PlayState,
  Player,
  PlayerId,
  Score,
  ScoreSheet,
  WhistResponse
} from './state';

const emptyScore = (): Score => ({ bullet: 0, mountain: 0, whists: [0, 0, 0] });
const emptyScoreSheetPlayer = () => ({ bullet: [], mountain: [], whists: [[], [], []] as [number[], number[], number[]] });
const emptyScoreSheet = (): ScoreSheet => [emptyScoreSheetPlayer(), emptyScoreSheetPlayer(), emptyScoreSheetPlayer()];

function createPlayers(): [Player, Player, Player] {
  return [
    { id: 0, name: 'You', kind: 'human' },
    { id: 1, name: 'AF Computers', kind: 'ai' },
    { id: 2, name: 'VIMCOM', kind: 'ai' }
  ];
}

export function createNewGame(seed: number, bulletTarget = 10): GameState {
  return createBiddingDeal(seed, bulletTarget, 2, [emptyScore(), emptyScore(), emptyScore()], 0, createPlayers());
}

export function getLegalActions(state: GameState): GameAction[] {
  switch (state.phase) {
    case 'bidding':
      return legalBiddingActions(state);
    case 'contract':
      return legalContractActions(state);
    case 'play':
      return legalCardsForActor(state).map((card) => ({ type: 'playCard', cardId: card.id }));
    case 'deal-settlement':
      return [{ type: 'settleDeal' }];
    case 'next-deal':
      return [{ type: 'startNextDeal' }];
    case 'finished':
      return [];
  }
}

export function applyAction(state: GameState, action: GameAction): GameState {
  switch (state.phase) {
    case 'bidding':
      return applyBiddingAction(state, action);
    case 'contract':
      return applyContractAction(state, action);
    case 'play':
      return applyPlayAction(state, action);
    case 'deal-settlement':
      return applySettlementAction(state, action);
    case 'next-deal':
      return applyNextDealAction(state, action);
    case 'finished':
      throw new Error(`Action ${action.type} is not valid during ${state.phase}`);
  }
}

function createBiddingDeal(
  seed: number,
  bulletTarget: number,
  dealer: PlayerId,
  scores: [Score, Score, Score],
  allPassCount: number,
  players = createPlayers(),
  scoreSheet: ScoreSheet = emptyScoreSheet()
): BiddingState {
  const deal = dealPreference(seededShuffle(createDeck(), seed));
  return {
    phase: 'bidding',
    seed,
    bulletTarget,
    players,
    dealer,
    actor: nextPlayer(dealer),
    hands: [sortCards(deal.hands[0]), sortCards(deal.hands[1]), sortCards(deal.hands[2])],
    widow: deal.widow,
    currentBid: null,
    bidWinner: null,
    passed: [],
    scores,
    scoreSheet,
    allPassCount,
    log: ['New deal started']
  };
}

function legalBiddingActions(state: BiddingState): GameAction[] {
  if (state.passed.includes(state.actor)) {
    return [{ type: 'pass' }];
  }
  const actions: GameAction[] = state.currentBid && state.bidWinner === state.actor ? [] : [{ type: 'pass' }];
  for (const bid of createGameBids()) {
    if (isBidAllowedAfter(state.currentBid, bid)) {
      actions.push({ type: 'bidGame', bid });
    }
  }
  if (isBidAllowedAfter(state.currentBid, { type: 'misere' })) {
    actions.push({ type: 'bidMisere' });
  }
  return actions;
}

function legalContractActions(state: ContractState): GameAction[] {
  switch (state.step) {
    case 'order':
      return legalOrderedContracts(state.contract).map((contract) => ({ type: 'orderContract', contract }));
    case 'widow-pickup':
      return [{ type: 'pickupWidow' }];
    case 'discard':
      return createDiscardActions(state.hands[state.declarer]);
    case 'whist-decision':
      return createWhistActions(state.contract);
  }
}

function createDiscardActions(hand: Card[]): GameAction[] {
  const actions: GameAction[] = [];
  for (let left = 0; left < hand.length; left += 1) {
    for (let right = left + 1; right < hand.length; right += 1) {
      actions.push({ type: 'discardCards', cardIds: [hand[left].id, hand[right].id] });
    }
  }
  return actions;
}

function createWhistActions(contract: Bid): GameAction[] {
  if (contract.type !== 'game') return [];
  if (contract.level === 6 && contract.suit === 'spades' && defaultRules.mandatoryWhistOnSixSpades) {
    return [{ type: 'whist' }];
  }
  if (contract.level === 10 && defaultRules.tenGameIsChecked) {
    return [{ type: 'check' }];
  }
  return [{ type: 'pass' }, { type: 'whist' }, { type: 'halfWhist' }];
}

function legalOrderedContracts(winningBid: Bid): Bid[] {
  if (winningBid.type === 'misere') return [winningBid];
  return createGameBids().filter((bid) => isBidAllowedAfter(winningBid, bid) || compareBidIdentity(bid, winningBid));
}

function compareBidIdentity(left: Bid, right: Bid): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function legalCardsForActor(state: PlayState) {
  const hand = state.hands[state.actor];
  const leadSuit = state.currentTrick[0]?.card.suit;
  if (!leadSuit) return hand;
  const following = hand.filter((card) => card.suit === leadSuit);
  if (following.length > 0) return following;
  const trumping = state.trump ? hand.filter((card) => card.suit === state.trump) : [];
  return trumping.length > 0 ? trumping : hand;
}

function applyBiddingAction(state: BiddingState, action: GameAction): GameState {
  if (action.type === 'pass') {
    const passed = state.passed.includes(state.actor) ? state.passed : [...state.passed, state.actor];
    const log = [...state.log, `${state.players[state.actor].name} passes`];
    if (!state.currentBid && passed.length === 3) {
      return {
        phase: 'play',
        mode: 'all-pass',
        seed: state.seed,
        bulletTarget: state.bulletTarget,
        players: state.players,
        dealer: state.dealer,
        actor: nextPlayer(state.dealer),
        hands: state.hands,
        widow: state.widow,
        contract: { type: 'allPass' },
        declarer: null,
        trump: null,
        currentTrick: [],
        tricksTaken: [0, 0, 0],
        whistResponses: [null, null],
        scores: state.scores,
        scoreSheet: state.scoreSheet,
        allPassCount: state.allPassCount + 1,
        log
      };
    }
    const nextState = { ...state, passed, log };
    const active = activeBidders(nextState);
    if (isCurrentBidWon(nextState, active)) {
      return completeWonBidding(nextState);
    }
    return { ...state, passed, actor: nextActiveBidder(state.actor, passed), log };
  }

  if (state.passed.includes(state.actor)) {
    throw new Error(`Player ${state.actor} has already passed`);
  }

  const bid: Bid | null =
    action.type === 'bidGame' ? action.bid : action.type === 'bidMisere' ? { type: 'misere' } : null;
  if (!bid || !isBidAllowedAfter(state.currentBid, bid)) {
    throw new Error(`Illegal bidding action ${action.type}`);
  }

  const nextState: BiddingState = {
    ...state,
    currentBid: bid,
    bidWinner: state.actor,
    actor: nextActiveBidder(state.actor, state.passed),
    log: [...state.log, `${state.players[state.actor].name} bids ${formatBid(bid)}`]
  };
  const active = activeBidders(nextState);
  if (isCurrentBidWon(nextState, active)) {
    return completeWonBidding(nextState);
  }
  return nextState;
}

function isCurrentBidWon(
  state: BiddingState,
  active: PlayerId[]
): state is BiddingState & { currentBid: Bid; bidWinner: PlayerId } {
  return (
    state.currentBid !== null &&
    state.bidWinner !== null &&
    (active.length === 0 || (active.length === 1 && active[0] === state.bidWinner))
  );
}

function completeWonBidding(state: BiddingState & { currentBid: Bid; bidWinner: PlayerId }): GameState {
  return {
    phase: 'contract',
    step: 'widow-pickup',
    seed: state.seed,
    bulletTarget: state.bulletTarget,
    players: state.players,
    dealer: state.dealer,
    actor: state.bidWinner,
    hands: state.hands,
    widow: state.widow,
    contract: state.currentBid,
    declarer: state.bidWinner,
    defenderOrder: [nextPlayer(state.bidWinner), nextPlayer(nextPlayer(state.bidWinner))],
    whistResponses: [null, null],
    scores: state.scores,
    scoreSheet: state.scoreSheet,
    allPassCount: state.allPassCount,
    log: state.log
  };
}

function applyContractAction(state: ContractState, action: GameAction): GameState {
  switch (state.step) {
    case 'order':
      if (action.type !== 'orderContract') {
        throw new Error(`Action ${action.type} is not valid during ${state.phase}:${state.step}`);
      }
      if (!legalOrderedContracts(state.contract).some((bid) => compareBidIdentity(bid, action.contract))) {
        throw new Error('Ordered contract must be at or above the winning bid');
      }
      return {
        ...state,
        step: 'whist-decision',
        actor: state.defenderOrder[0],
        contract: action.contract,
        log: [...state.log, `${state.players[state.declarer].name} orders ${formatBid(action.contract)}`]
      };
    case 'widow-pickup':
      if (action.type !== 'pickupWidow') {
        throw new Error(`Action ${action.type} is not valid during ${state.phase}:${state.step}`);
      }
      return {
        ...state,
        step: 'discard',
        hands: state.hands.map((hand, index) =>
          index === state.declarer ? sortCards([...hand, ...state.widow]) : hand
        ) as [Card[], Card[], Card[]],
        widow: [],
        log: [...state.log, `${state.players[state.declarer].name} picks up the widow`]
      };
    case 'discard':
      if (action.type !== 'discardCards') {
        throw new Error(`Action ${action.type} is not valid during ${state.phase}:${state.step}`);
      }
      return applyDiscard(state, action.cardIds);
    case 'whist-decision':
      return applyWhistDecision(state, action);
  }
}

function applyDiscard(state: ContractState, cardIds: [Card['id'], Card['id']]): GameState {
  const declarerHand = state.hands[state.declarer];
  const discard = new Set(cardIds);
  if (cardIds.length !== 2 || discard.size !== 2) {
    throw new Error('Discard must contain two distinct cards');
  }
  if (cardIds.some((cardId) => !declarerHand.some((card) => card.id === cardId))) {
    throw new Error('Discard cards must come from the declarer hand');
  }
  const discardedCards = declarerHand.filter((card) => discard.has(card.id));
  const hands = state.hands.map((hand, index) =>
    index === state.declarer ? hand.filter((card) => !discard.has(card.id)) : hand
  ) as [Card[], Card[], Card[]];
  if (state.contract.type === 'misere') {
    return toPlayState(
      {
        ...state,
        widow: discardedCards
      },
      {
        hands,
        mode: 'misere',
        trump: null
      }
    );
  }
  return {
    ...state,
    step: 'order',
    actor: state.declarer,
    hands,
    widow: discardedCards,
    log: [...state.log, `${state.players[state.declarer].name} discards two cards`]
  };
}

function applyWhistDecision(state: ContractState, action: GameAction): GameState {
  const legal = getLegalActions(state);
  if (!legal.some((candidate) => candidate.type === action.type)) {
    throw new Error(`Action ${action.type} is not valid during ${state.phase}:${state.step}`);
  }

  const response = mapWhistResponse(action);
  const defenderIndex = state.defenderOrder.indexOf(state.actor);
  const whistResponses = [...state.whistResponses] as [WhistResponse | null, WhistResponse | null];
  whistResponses[defenderIndex] = response;
  const nextIndex = defenderIndex + 1;

  if (nextIndex < state.defenderOrder.length) {
    return {
      ...state,
      actor: state.defenderOrder[nextIndex],
      whistResponses,
      log: [...state.log, `${state.players[state.actor].name} chooses ${response}`]
    };
  }

  return toPlayState(state, {
    hands: state.hands,
    mode: state.contract.type === 'misere' ? 'misere' : 'contract',
    trump: state.contract.type === 'game' ? state.contract.suit : null,
    whistResponses
  });
}

function mapWhistResponse(action: GameAction): WhistResponse {
  if (action.type === 'whist') return 'whist';
  if (action.type === 'halfWhist') return 'half-whist';
  if (action.type === 'check') return 'check';
  if (action.type === 'pass') return 'pass';
  throw new Error(`Action ${action.type} is not a whist response`);
}

function toPlayState(
  state: ContractState,
  options: {
    hands: [Card[], Card[], Card[]];
    mode: PlayState['mode'];
    trump: Card['suit'] | null;
    whistResponses?: [WhistResponse | null, WhistResponse | null];
  }
): PlayState {
  return {
    phase: 'play',
    mode: options.mode,
    seed: state.seed,
    bulletTarget: state.bulletTarget,
    players: state.players,
    dealer: state.dealer,
    actor: nextPlayer(state.dealer),
    hands: options.hands,
    widow: state.widow,
    contract: state.contract.type === 'misere' ? { type: 'misere' } : state.contract,
    declarer: state.declarer,
    trump: options.trump,
    currentTrick: [],
    tricksTaken: [0, 0, 0],
    whistResponses: options.whistResponses ?? state.whistResponses,
    scores: state.scores,
    scoreSheet: state.scoreSheet,
    allPassCount: state.allPassCount,
    log: state.log
  };
}

function applyPlayAction(state: PlayState, action: GameAction): GameState {
  if (action.type !== 'playCard') {
    throw new Error(`Action ${action.type} is not valid during ${state.phase}`);
  }
  const legal = getLegalActions(state).some((candidate) => candidate.type === 'playCard' && candidate.cardId === action.cardId);
  if (!legal) {
    throw new Error(`Illegal play card ${action.cardId}`);
  }

  const nextState = {
    ...state,
    hands: state.hands.map((hand) => [...hand]) as [Card[], Card[], Card[]],
    currentTrick: [...state.currentTrick]
  };
  const card = removeCardFromHand(nextState, action.cardId);
  const currentTrick = [...nextState.currentTrick, { player: state.actor, card }];
  const log = [...state.log, `${state.players[state.actor].name} plays ${card.rank} ${card.suit}`];

  if (currentTrick.length < 3) {
    return {
      ...nextState,
      actor: nextPlayer(state.actor),
      currentTrick,
      log
    };
  }

  const winner = determineTrickWinner(currentTrick, state.trump);
  const tricksTaken = [...state.tricksTaken] as [number, number, number];
  tricksTaken[winner] += 1;
  const handsEmpty = nextState.hands.every((hand) => hand.length === 0);

  if (handsEmpty) {
    const dealResult = buildDealResult({
      mode: state.mode,
      contract: state.contract,
      declarer: state.declarer,
      tricksTaken,
      whistResponses: state.whistResponses,
      scores: state.scores,
      bulletTarget: state.bulletTarget,
      allPassCount: state.allPassCount
    });
    return {
      phase: 'deal-settlement',
      mode: state.mode,
      seed: state.seed,
      bulletTarget: state.bulletTarget,
      players: state.players,
      dealer: state.dealer,
      actor: winner,
      hands: nextState.hands,
      widow: state.widow,
      contract: state.contract,
      declarer: state.declarer,
      trump: state.trump,
      currentTrick: [],
      tricksTaken,
      whistResponses: state.whistResponses,
      scores: state.scores,
      scoreSheet: state.scoreSheet,
      allPassCount: state.allPassCount,
      log,
      settlementSummary: dealResult.summary,
      dealResult
    };
  }

  return {
    ...nextState,
    actor: winner,
    currentTrick: [],
    tricksTaken,
    log
  };
}

function applySettlementAction(state: DealSettlementState, action: GameAction): GameState {
  if (action.type !== 'settleDeal') {
    throw new Error(`Action ${action.type} is not valid during ${state.phase}`);
  }
  const dealResult = state.dealResult ?? buildDealResult(state);
  const scores = dealResult.scoresAfter;
  const scoreSheet = appendScoreSheetEntries(state.scoreSheet ?? emptyScoreSheet(), dealResult);
  const log = [...state.log, dealResult.summary];
  if (dealResult.bulletTargetReached) {
    const finalResult = calculateFinalResult(scores, state.bulletTarget);
    return {
      phase: 'finished',
      seed: state.seed,
      bulletTarget: state.bulletTarget,
      players: state.players,
      dealer: state.dealer,
      actor: state.actor,
      hands: state.hands,
      widow: state.widow,
      contract: state.contract,
      declarer: state.declarer,
      trump: state.trump,
      currentTrick: state.currentTrick,
      tricksTaken: state.tricksTaken,
      scores,
      scoreSheet,
      allPassCount: state.mode === 'all-pass' ? state.allPassCount : 0,
      log,
      winnerSummary: buildWinnerSummary(state.players, finalResult),
      previousDealResult: dealResult,
      finalResult
    };
  }
  return {
    phase: 'next-deal',
    seed: state.seed,
    bulletTarget: state.bulletTarget,
    players: state.players,
    dealer: state.dealer,
    actor: state.actor,
    hands: state.hands,
    widow: state.widow,
    scores,
    scoreSheet,
    allPassCount: state.mode === 'all-pass' ? state.allPassCount : 0,
    log,
    previousSummary: dealResult.summary,
    previousDealResult: dealResult
  };
}

function applyNextDealAction(state: NextDealState, action: GameAction): GameState {
  if (action.type !== 'startNextDeal') {
    throw new Error(`Action ${action.type} is not valid during ${state.phase}`);
  }
  return createBiddingDeal(
    state.seed + 1,
    state.bulletTarget,
    nextPlayer(state.dealer),
    state.scores,
    state.allPassCount,
    state.players,
    state.scoreSheet
  );
}

function appendScoreSheetEntries(scoreSheet: ScoreSheet, dealResult: DealResult): ScoreSheet {
  const next = cloneScoreSheet(scoreSheet);
  dealResult.scoreDelta.forEach((delta, playerIndex) => {
    const player = playerIndex as PlayerId;
    const after = dealResult.scoresAfter[player];
    if (delta.bullet !== 0 && after.bullet !== 0) {
      next[player].bullet.push(after.bullet);
    }
    if (delta.mountain !== 0 && after.mountain !== 0) {
      next[player].mountain.push(after.mountain);
    }
    delta.whists.forEach((whistDelta, opponentIndex) => {
      if (opponentIndex === player || whistDelta === 0) return;
      const whistTotal = after.whists[opponentIndex];
      if (whistTotal !== 0) {
        next[player].whists[opponentIndex].push(whistTotal);
      }
    });
  });
  return next;
}

function cloneScoreSheet(scoreSheet: ScoreSheet): ScoreSheet {
  return scoreSheet.map((player) => ({
    bullet: [...player.bullet],
    mountain: [...player.mountain],
    whists: player.whists.map((entries) => [...entries]) as [number[], number[], number[]]
  })) as ScoreSheet;
}

function removeCardFromHand(state: PlayState, cardId: string): Card {
  const hand = state.hands[state.actor];
  const cardIndex = hand.findIndex((card) => card.id === cardId);
  if (cardIndex === -1) {
    throw new Error(`Card ${cardId} is not in player ${state.actor}'s hand`);
  }
  const [card] = hand.splice(cardIndex, 1);
  return card;
}

function determineTrickWinner(trick: PlayState['currentTrick'], trump: Card['suit'] | null): PlayerId {
  const leadSuit = trick[0].card.suit;
  return trick.reduce((winner, play) => {
    const best = winner.card;
    const candidate = play.card;
    const candidateIsTrump = trump !== null && candidate.suit === trump;
    const bestIsTrump = trump !== null && best.suit === trump;
    if (candidateIsTrump && !bestIsTrump) return play;
    if (!candidateIsTrump && bestIsTrump) return winner;
    if (candidate.suit === best.suit && rankValue(candidate.rank) > rankValue(best.rank)) return play;
    if (!bestIsTrump && candidate.suit === leadSuit && best.suit !== leadSuit) return play;
    return winner;
  }).player;
}

function rankValue(rank: Card['rank']): number {
  return ranks.indexOf(rank);
}

function formatBid(bid: Bid): string {
  return bid.type === 'misere' ? 'misere' : `${bid.level} ${bid.suit}`;
}

function createGameBids(): GameBid[] {
  const levels: GameBid['level'][] = [6, 7, 8, 9, 10];
  const suits: GameBid['suit'][] = ['spades', 'clubs', 'diamonds', 'hearts'];
  return levels.flatMap((level) => suits.map((suit) => ({ type: 'game' as const, level, suit })));
}

export function nextPlayer(player: PlayerId): PlayerId {
  return ((player + 1) % 3) as PlayerId;
}

export function nextActiveBidder(current: PlayerId, passed: PlayerId[]): PlayerId {
  let candidate = nextPlayer(current);
  for (let checked = 0; checked < 3 && passed.includes(candidate); checked += 1) {
    candidate = nextPlayer(candidate);
  }
  return candidate;
}

export function activeBidders(state: BiddingState): PlayerId[] {
  return [0, 1, 2].filter((id) => !state.passed.includes(id as PlayerId)) as PlayerId[];
}

function buildDealResult(state: {
  mode: DealSettlementState['mode'];
  contract: DealSettlementState['contract'];
  declarer: DealSettlementState['declarer'];
  tricksTaken: DealSettlementState['tricksTaken'];
  whistResponses: DealSettlementState['whistResponses'];
  scores: DealSettlementState['scores'];
  bulletTarget: number;
  allPassCount: number;
}): DealResult {
  return settleDealResult({
    mode: state.mode,
    contract: state.contract,
    declarer: state.declarer,
    tricksTaken: state.tricksTaken,
    whistResponses: state.whistResponses,
    scores: state.scores,
    bulletTarget: state.bulletTarget,
    allPassCount: state.allPassCount,
    progressiveAllPass: defaultRules.progressiveAllPass
  });
}

function buildWinnerSummary(players: GameState['players'], finalResult: FinalResult) {
  return `${players[finalResult.winner].name} wins the final rating`;
}
