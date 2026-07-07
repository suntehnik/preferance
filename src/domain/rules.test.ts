import { describe, expect, it } from 'vitest';
import { compareBids, contractBulletValue, defaultRules, isBidAllowedAfter } from './rules';

describe('rules', () => {
  it('orders bids by level and suit', () => {
    expect(compareBids({ type: 'game', level: 6, suit: 'clubs' }, { type: 'game', level: 6, suit: 'spades' })).toBeGreaterThan(0);
    expect(compareBids({ type: 'game', level: 7, suit: 'spades' }, { type: 'game', level: 6, suit: 'hearts' })).toBeGreaterThan(0);
  });

  it('allows misere to be overcalled only by a nine-level game or higher', () => {
    expect(isBidAllowedAfter({ type: 'misere' }, { type: 'game', level: 8, suit: 'hearts' })).toBe(false);
    expect(isBidAllowedAfter({ type: 'misere' }, { type: 'game', level: 9, suit: 'spades' })).toBe(true);
  });

  it('maps contract levels to bullet values', () => {
    expect(contractBulletValue({ type: 'game', level: 6, suit: 'spades' })).toBe(2);
    expect(contractBulletValue({ type: 'game', level: 10, suit: 'hearts' })).toBe(10);
    expect(contractBulletValue({ type: 'misere' })).toBe(10);
  });

  it('uses Sochi defaults from the remake spec', () => {
    expect(defaultRules.mandatoryWhistOnSixSpades).toBe(true);
    expect(defaultRules.tenGameIsChecked).toBe(true);
    expect(defaultRules.responsibleWhist).toBe(false);
    expect(defaultRules.progressiveAllPass).toBe(true);
  });
});
