import { ranks, suits, type Card } from '../domain/cards';
import { getLegalActions } from '../domain/engine';
import type { Bid, ContractLevel } from '../domain/rules';
import type { BiddingState, ContractState, GameAction, GameState, PlayState } from '../domain/state';

const rankStrength: Record<Card['rank'], number> = {
  '7': 0,
  '8': 1,
  '9': 2,
  '10': 4,
  jack: 5,
  queen: 7,
  king: 9,
  ace: 12
};

const discardWeakness: Record<Card['rank'], number> = {
  '7': 12,
  '8': 10,
  '9': 8,
  '10': 5,
  jack: 3,
  queen: 1,
  king: -3,
  ace: -6
};

export function chooseAiAction(state: GameState, seed: number): GameAction {
  const legal = getLegalActions(state);
  if (legal.length === 0) {
    throw new Error(buildNoLegalActionsMessage(state, seed));
  }

  switch (state.phase) {
    case 'bidding':
      return chooseBiddingAction(state, legal, seed);
    case 'contract':
      return chooseContractAction(state, legal, seed);
    case 'play':
      return choosePlayAction(state, legal, seed);
    case 'deal-settlement':
    case 'next-deal':
      return legal[0];
    case 'finished':
      throw new Error(buildNoLegalActionsMessage(state, seed));
  }
}

function chooseBiddingAction(state: BiddingState, legal: GameAction[], seed: number): GameAction {
  const pass = legal.find((action) => action.type === 'pass');
  const options = legal
    .filter((action): action is Extract<GameAction, { type: 'bidGame' | 'bidMisere' }> => action.type === 'bidGame' || action.type === 'bidMisere')
    .filter((action) => action.type !== 'bidGame' || isGameBidViable(state.hands[state.actor], action.bid))
    .map((action) => ({
      action,
      score: action.type === 'bidGame' ? scoreGameBid(state.hands[state.actor], action.bid) : scoreMisereBid(state.hands[state.actor])
    }));

  const best = pickBestScoredAction(options, seed);
  if (!best) {
    return legal[0];
  }

  if (best.score < 26 && pass) {
    return pass;
  }

  return best.action;
}

function chooseContractAction(state: ContractState, legal: GameAction[], seed: number): GameAction {
  switch (state.step) {
    case 'order':
      return chooseOrderedContract(state, legal, seed);
    case 'widow-pickup':
      return legal[0];
    case 'discard':
      return chooseDiscardAction(state, legal, seed);
    case 'whist-decision':
      return chooseWhistAction(state, legal, seed);
  }
}

function chooseOrderedContract(state: ContractState, legal: GameAction[], seed: number): GameAction {
  const options = legal
    .filter((action): action is Extract<GameAction, { type: 'orderContract' }> => action.type === 'orderContract')
    .filter((action) => action.contract.type !== 'game' || isGameBidViable(state.hands[state.declarer], action.contract))
    .map((action) => ({
      action,
      score: scoreGameBid(state.hands[state.declarer], action.contract)
    }));

  return pickBestScoredAction(options, seed)?.action ?? lowestContractOrder(legal) ?? legal[0];
}

function chooseDiscardAction(state: ContractState, legal: GameAction[], seed: number): GameAction {
  const options = legal
    .filter((action): action is Extract<GameAction, { type: 'discardCards' }> => action.type === 'discardCards')
    .map((action) => ({
      action,
      score: scoreDiscardPair(state, action.cardIds)
    }));

  return pickBestScoredAction(options, seed)?.action ?? legal[0];
}

function chooseWhistAction(state: ContractState, legal: GameAction[], seed: number): GameAction {
  const check = legal.find((action) => action.type === 'check');
  if (check) return check;

  const contract = state.contract.type === 'game' ? state.contract : null;
  if (!contract) return legal[0];

  const hand = state.hands[state.actor];
  const supportScore = suitStrength(hand, contract.suit) + totalHighCardStrength(hand) - (contract.level - 6) * 5;
  const whist = legal.find((action) => action.type === 'whist');
  const halfWhist = legal.find((action) => action.type === 'halfWhist');
  const pass = legal.find((action) => action.type === 'pass');

  if (supportScore >= 36 && whist) return whist;
  if (supportScore >= 24 && halfWhist) return halfWhist;
  if (pass) return pass;

  return pickBySeed(legal, seed);
}

function choosePlayAction(state: PlayState, legal: GameAction[], seed: number): GameAction {
  const options = legal
    .filter((action): action is Extract<GameAction, { type: 'playCard' }> => action.type === 'playCard')
    .map((action) => {
      const card = state.hands[state.actor].find((candidate) => candidate.id === action.cardId);
      if (!card) {
        return { action, score: Number.NEGATIVE_INFINITY };
      }
      return {
        action,
        score: scorePlayCard(state, card)
      };
    });

  return pickBestScoredAction(options, seed)?.action ?? legal[0];
}

function scoreGameBid(hand: Card[], bid: Bid): number {
  if (bid.type !== 'game') {
    return scoreMisereBid(hand);
  }

  const trumpSuitScore = suitStrength(hand, bid.suit);
  const highCardScore = totalHighCardStrength(hand);
  const suitCount = hand.filter((card) => card.suit === bid.suit).length;
  const levelPenalty = (bid.level - 6) * 8;

  return trumpSuitScore * 2 + highCardScore + suitCount * 3 - levelPenalty;
}

function isGameBidViable(hand: Card[], bid: Extract<Bid, { type: 'game' }>): boolean {
  return bid.level <= estimateContractCeiling(hand, bid.suit);
}

function estimateContractCeiling(hand: Card[], trump: Card['suit']): ContractLevel | 5 {
  const trumpCards = hand.filter((card) => card.suit === trump);
  const trumpTricks = trumpCards.reduce((total, card) => total + estimatedTrumpTricks(card.rank), 0);
  const sideTricks = hand
    .filter((card) => card.suit !== trump)
    .reduce((total, card) => total + estimatedSideTricks(card.rank), 0);
  const trumpLengthBonus = Math.max(0, trumpCards.length - 3) * 0.7;
  const raw = Math.round(trumpTricks + sideTricks + trumpLengthBonus);
  if (raw >= 10) return 10;
  if (raw >= 9) return 9;
  if (raw >= 8) return 8;
  if (raw >= 7) return 7;
  if (raw >= 6) return 6;
  return 5;
}

function estimatedTrumpTricks(rank: Card['rank']): number {
  if (rank === 'ace') return 1;
  if (rank === 'king') return 0.9;
  if (rank === 'queen') return 0.75;
  if (rank === 'jack') return 0.55;
  if (rank === '10') return 0.35;
  if (rank === '9') return 0.2;
  return 0.1;
}

function estimatedSideTricks(rank: Card['rank']): number {
  if (rank === 'ace') return 0.9;
  if (rank === 'king') return 0.45;
  if (rank === 'queen') return 0.2;
  return 0;
}

function scoreMisereBid(hand: Card[]): number {
  const penalty = hand.reduce((total, card) => total + rankStrength[card.rank], 0);
  const longestSuit = Math.max(...suits.map((suit) => hand.filter((card) => card.suit === suit).length));
  return 18 - penalty - longestSuit * 4;
}

function suitStrength(hand: Card[], suit: Card['suit']): number {
  return hand
    .filter((card) => card.suit === suit)
    .reduce((total, card) => total + rankStrength[card.rank], 0);
}

function totalHighCardStrength(hand: Card[]): number {
  return hand.reduce((total, card) => total + rankStrength[card.rank], 0);
}

function scoreDiscardPair(state: ContractState, cardIds: [Card['id'], Card['id']]): number {
  const contract = state.contract.type === 'game' ? state.contract : null;
  const hand = state.hands[state.declarer];
  return cardIds.reduce((total, cardId) => {
    const card = hand.find((candidate) => candidate.id === cardId);
    if (!card) return total - 100;

    let score = discardWeakness[card.rank];
    if (contract && card.suit !== contract.suit) score += 4;
    if (contract && card.suit === contract.suit) score -= 5;
    if (contract && card.suit === 'spades' && contract.suit !== 'spades') score -= 1;

    return total + score;
  }, 0);
}

function scorePlayCard(state: PlayState, card: Card): number {
  const currentWinningCard = winningCard(state.currentTrick, state.trump);
  const wouldWin = currentWinningCard ? compareCardsForTrick(card, currentWinningCard.card, state.currentTrick[0].card.suit, state.trump) > 0 : true;

  if (state.currentTrick.length === 0) {
    if (state.mode === 'contract') {
      const trumpBonus = state.trump && card.suit === state.trump ? 24 : 0;
      const declarerBonus = state.declarer === state.actor ? 8 : 0;
      return trumpBonus + declarerBonus + rankStrength[card.rank] * 2;
    }

    return 40 - rankStrength[card.rank] - suitLength(state.hands[state.actor], card.suit);
  }

  if (state.mode === 'contract') {
    if (wouldWin) {
      return 100 - rankStrength[card.rank];
    }
    return 20 - rankStrength[card.rank];
  }

  if (!wouldWin) {
    return 80 - rankStrength[card.rank];
  }

  return 10 - rankStrength[card.rank];
}

function suitLength(hand: Card[], suit: Card['suit']): number {
  return hand.filter((card) => card.suit === suit).length;
}

function winningCard(trick: PlayState['currentTrick'], trump: Card['suit'] | null): PlayState['currentTrick'][number] | null {
  if (trick.length === 0) return null;

  const leadSuit = trick[0].card.suit;
  let winner = trick[0];
  for (const play of trick.slice(1)) {
    if (compareCardsForTrick(play.card, winner.card, leadSuit, trump) > 0) {
      winner = play;
    }
  }
  return winner;
}

function compareCardsForTrick(left: Card, right: Card, leadSuit: Card['suit'], trump: Card['suit'] | null): number {
  const leftTrump = trump !== null && left.suit === trump;
  const rightTrump = trump !== null && right.suit === trump;
  if (leftTrump !== rightTrump) return leftTrump ? 1 : -1;

  const leftLead = left.suit === leadSuit;
  const rightLead = right.suit === leadSuit;
  if (leftLead !== rightLead) return leftLead ? 1 : -1;

  return ranks.indexOf(left.rank) - ranks.indexOf(right.rank);
}

function pickBestScoredAction<T extends GameAction>(
  options: Array<{ action: T; score: number }>,
  seed: number
): { action: T; score: number } | undefined {
  if (options.length === 0) return undefined;
  const bestScore = Math.max(...options.map((option) => option.score));
  const tied = options
    .filter((option) => option.score === bestScore)
    .sort((left, right) => actionKey(left.action).localeCompare(actionKey(right.action)));
  return tied[Math.abs(seed) % tied.length];
}

function lowestContractOrder(legal: GameAction[]): Extract<GameAction, { type: 'orderContract' }> | undefined {
  return legal
    .filter((action): action is Extract<GameAction, { type: 'orderContract' }> => action.type === 'orderContract')
    .sort((left, right) => contractRank(left.contract) - contractRank(right.contract))[0];
}

function contractRank(contract: Bid): number {
  if (contract.type === 'misere') return 95;
  return contract.level * 10 + suits.indexOf(contract.suit);
}

function pickBySeed<T>(values: T[], seed: number): T {
  return values[Math.abs(seed) % values.length];
}

function buildNoLegalActionsMessage(state: GameState, seed: number): string {
  const context: string[] = [`phase=${state.phase}`, `actor=${state.actor}`, `seed=${seed}`];
  if ('currentBid' in state && state.currentBid) {
    context.push(`currentBid=${bidKey(state.currentBid)}`);
  }
  if ('step' in state) {
    context.push(`step=${state.step}`);
    context.push(`contract=${bidKey(state.contract)}`);
  }
  if ('mode' in state) {
    context.push(`mode=${state.mode}`);
    context.push(`trickSize=${state.currentTrick.length}`);
  }
  if ('previousSummary' in state) {
    context.push('continuation=next-deal');
  }
  if ('winnerSummary' in state) {
    context.push('continuation=finished');
  }
  return `AI has no legal actions (${context.join(' ')})`;
}

function bidKey(bid: Bid): string {
  return bid.type === 'misere' ? 'misere' : `${bid.level}-${bid.suit}`;
}

function actionKey(action: GameAction): string {
  switch (action.type) {
    case 'pass':
    case 'check':
    case 'whist':
    case 'halfWhist':
    case 'bidMisere':
    case 'pickupWidow':
    case 'settleDeal':
    case 'startNextDeal':
      return action.type;
    case 'bidGame':
      return `bidGame:${action.bid.level}-${action.bid.suit}`;
    case 'orderContract':
      return `orderContract:${bidKey(action.contract)}`;
    case 'discardCards':
      return `discardCards:${[...action.cardIds].sort().join(',')}`;
    case 'playCard':
      return `playCard:${action.cardId}`;
  }
}
