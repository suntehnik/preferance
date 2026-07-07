import type { Suit } from './cards';
import { suits } from './cards';

export type ContractLevel = 6 | 7 | 8 | 9 | 10;

export type GameBid = {
  type: 'game';
  level: ContractLevel;
  suit: Suit;
};

export type MisereBid = {
  type: 'misere';
};

export type Bid = GameBid | MisereBid;

export type RulesConfig = {
  mandatoryWhistOnSixSpades: boolean;
  tenGameIsChecked: boolean;
  responsibleWhist: boolean;
  progressiveAllPass: boolean;
};

export const defaultRules: RulesConfig = {
  mandatoryWhistOnSixSpades: true,
  tenGameIsChecked: true,
  responsibleWhist: false,
  progressiveAllPass: true
};

export function compareBids(left: GameBid, right: GameBid): number {
  if (left.level !== right.level) {
    return left.level - right.level;
  }
  return suits.indexOf(left.suit) - suits.indexOf(right.suit);
}

export function isBidAllowedAfter(current: Bid | null, next: Bid): boolean {
  if (!current) return true;
  if (current.type === 'misere') {
    return next.type === 'game' && next.level >= 9;
  }
  if (next.type === 'misere') {
    return current.level < 9;
  }
  return compareBids(next, current) > 0;
}

export function contractBulletValue(bid: Bid): number {
  if (bid.type === 'misere') return 10;
  return (bid.level - 5) * 2;
}
