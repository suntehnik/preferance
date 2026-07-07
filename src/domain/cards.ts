export const suits = ['spades', 'clubs', 'diamonds', 'hearts'] as const;
export const ranks = ['7', '8', '9', '10', 'jack', 'queen', 'king', 'ace'] as const;

export type Suit = (typeof suits)[number];
export type Rank = (typeof ranks)[number];

export type Card = {
  suit: Suit;
  rank: Rank;
  id: `${Suit}-${Rank}`;
};

export type PreferenceDeal = {
  hands: [Card[], Card[], Card[]];
  widow: [Card, Card];
};

export function createDeck(): Card[] {
  return suits.flatMap((suit) =>
    ranks.map((rank) => ({
      suit,
      rank,
      id: `${suit}-${rank}` as const
    }))
  );
}

export function seededShuffle(cards: Card[], seed: number): Card[] {
  const result = [...cards];
  let state = seed >>> 0;
  const next = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(next() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

export function dealPreference(deck: Card[]): PreferenceDeal {
  if (deck.length !== 32) {
    throw new Error(`Preference deal requires 32 cards, got ${deck.length}`);
  }

  return {
    hands: [deck.slice(0, 10), deck.slice(10, 20), deck.slice(20, 30)],
    widow: [deck[30], deck[31]]
  };
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((left, right) => {
    const suitDelta = suits.indexOf(left.suit) - suits.indexOf(right.suit);
    if (suitDelta !== 0) return suitDelta;
    return ranks.indexOf(left.rank) - ranks.indexOf(right.rank);
  });
}
