import type { Card, Suit } from './cards';
import type { Bid, GameBid } from './rules';

export type PlayerId = 0 | 1 | 2;

export type Player = {
  id: PlayerId;
  name: string;
  kind: 'human' | 'ai';
};

export type Score = {
  bullet: number;
  mountain: number;
  whists: [number, number, number];
};

export type ScoreSheetPlayer = {
  bullet: number[];
  mountain: number[];
  whists: [number[], number[], number[]];
};

export type ScoreSheet = [ScoreSheetPlayer, ScoreSheetPlayer, ScoreSheetPlayer];

export type WhistAdjustment = {
  defender: PlayerId;
  declarer: PlayerId;
  response: 'whist' | 'half-whist' | 'check';
  tricks: number;
  delta: number;
};

export type DealResultOutcome =
  | { type: 'all-pass'; trickValue: number }
  | { type: 'contract-made'; contractPoints: number }
  | { type: 'contract-failed'; undertricks: number }
  | { type: 'misere-made'; contractPoints: number }
  | { type: 'misere-failed'; penalty: number };

export type DealResult = {
  mode: PlayMode;
  contract: Bid | { type: 'allPass' };
  declarer: PlayerId | null;
  trickCounts: [number, number, number];
  whistResponses: [WhistResponse | null, WhistResponse | null];
  scoresBefore: [Score, Score, Score];
  scoreDelta: [Score, Score, Score];
  scoresAfter: [Score, Score, Score];
  whistAdjustments: WhistAdjustment[];
  outcome: DealResultOutcome;
  bulletTarget: number;
  bulletTargetReached: boolean;
  summary: string;
};

export type FinalRankingEntry = {
  player: PlayerId;
  bullet: number;
  mountain: number;
  netWhists: number;
  finalWhists: number;
};

export type FinalResult = {
  bulletTarget: number;
  winner: PlayerId;
  ranking: [FinalRankingEntry, FinalRankingEntry, FinalRankingEntry];
  sortKey: 'final-whists-desc,bullet-desc,player-id-asc';
  summary: string;
};

export type TrickPlay = {
  player: PlayerId;
  card: Card;
};

export type WhistResponse = 'whist' | 'half-whist' | 'pass' | 'check';

type BaseState = {
  seed: number;
  bulletTarget: number;
  players: [Player, Player, Player];
  dealer: PlayerId;
  actor: PlayerId;
  hands: [Card[], Card[], Card[]];
  widow: Card[];
  scores: [Score, Score, Score];
  scoreSheet?: ScoreSheet;
  allPassCount: number;
  log: string[];
};

export type BiddingState = BaseState & {
  phase: 'bidding';
  currentBid: Bid | null;
  bidWinner: PlayerId | null;
  passed: PlayerId[];
};

export type ContractState = BaseState & {
  phase: 'contract';
  step: 'order' | 'widow-pickup' | 'discard' | 'whist-decision';
  contract: Bid;
  declarer: PlayerId;
  defenderOrder: [PlayerId, PlayerId];
  whistResponses: [WhistResponse | null, WhistResponse | null];
};

export type PlayMode = 'all-pass' | 'contract' | 'misere';

export type PlayState = BaseState & {
  phase: 'play';
  mode: PlayMode;
  contract: Bid | { type: 'allPass' };
  declarer: PlayerId | null;
  trump: Suit | null;
  currentTrick: TrickPlay[];
  tricksTaken: [number, number, number];
  whistResponses: [WhistResponse | null, WhistResponse | null];
};

export type DealSettlementState = BaseState & {
  phase: 'deal-settlement';
  mode: PlayMode;
  contract: Bid | { type: 'allPass' };
  declarer: PlayerId | null;
  trump: Suit | null;
  currentTrick: TrickPlay[];
  tricksTaken: [number, number, number];
  whistResponses: [WhistResponse | null, WhistResponse | null];
  settlementSummary: string;
  dealResult?: DealResult;
};

export type NextDealState = BaseState & {
  phase: 'next-deal';
  previousSummary: string;
  previousDealResult?: DealResult;
};

export type FinishedState = BaseState & {
  phase: 'finished';
  contract: Bid | { type: 'allPass' };
  declarer: PlayerId | null;
  trump: Suit | null;
  currentTrick: TrickPlay[];
  tricksTaken: [number, number, number];
  winnerSummary: string;
  previousDealResult?: DealResult;
  finalResult?: FinalResult;
};

export type GameState =
  | BiddingState
  | ContractState
  | PlayState
  | DealSettlementState
  | NextDealState
  | FinishedState;

export type GameAction =
  | { type: 'pass' }
  | { type: 'check' }
  | { type: 'whist' }
  | { type: 'halfWhist' }
  | { type: 'bidGame'; bid: GameBid }
  | { type: 'bidMisere' }
  | { type: 'orderContract'; contract: Bid }
  | { type: 'pickupWidow' }
  | { type: 'discardCards'; cardIds: [Card['id'], Card['id']] }
  | { type: 'playCard'; cardId: Card['id'] }
  | { type: 'settleDeal' }
  | { type: 'startNextDeal' };
