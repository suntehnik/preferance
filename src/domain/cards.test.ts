import { describe, expect, it } from 'vitest';
import { createDeck, dealPreference, sortCards, seededShuffle } from './cards';

describe('cards', () => {
  it('creates a 32-card preference deck with unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(32);
    expect(new Set(deck.map((card) => card.id)).size).toBe(32);
  });

  it('deals three 10-card hands and a 2-card widow in deck order', () => {
    const deck = seededShuffle(createDeck(), 42);
    const deal = dealPreference(deck);
    const dealtCards = [...deal.hands[0], ...deal.hands[1], ...deal.hands[2], ...deal.widow];

    expect(deal.hands).toHaveLength(3);
    expect(deal.hands.every((hand) => hand.length === 10)).toBe(true);
    expect(deal.widow).toHaveLength(2);
    expect(dealtCards).toHaveLength(32);
    expect(new Set(dealtCards.map((card) => card.id)).size).toBe(32);
    expect(dealtCards).toEqual(deck);
  });

  it('throws when dealing a deck with fewer than 32 cards', () => {
    expect(() => dealPreference(createDeck().slice(0, 31))).toThrow(
      'Preference deal requires 32 cards, got 31'
    );
  });

  it('shuffles deterministically for the same seed', () => {
    const firstShuffle = seededShuffle(createDeck(), 42);
    const secondShuffle = seededShuffle(createDeck(), 42);

    expect(secondShuffle).toEqual(firstShuffle);
  });

  it('does not mutate the input deck when shuffling', () => {
    const deck = createDeck();
    const originalOrder = [...deck];

    seededShuffle(deck, 42);

    expect(deck).toEqual(originalOrder);
  });

  it('sorts cards by suit order then rank order', () => {
    const sorted = sortCards([
      { suit: 'hearts', rank: 'ace', id: 'hearts-ace' },
      { suit: 'spades', rank: '7', id: 'spades-7' },
      { suit: 'clubs', rank: 'king', id: 'clubs-king' }
    ]);
    expect(sorted.map((card) => card.id)).toEqual(['spades-7', 'clubs-king', 'hearts-ace']);
  });
});
