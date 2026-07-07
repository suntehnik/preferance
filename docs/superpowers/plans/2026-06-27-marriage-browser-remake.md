# MARRIAGE Browser Remake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native TypeScript browser remake of `MARRIAGE 3.30`: one human player against two local AI players, with Sochi preference rules and a retro VGA-inspired table UI.

**Architecture:** Create a Vite TypeScript app. Keep rules and game state in pure TypeScript modules with immutable transitions, then layer deterministic AI, localStorage persistence, and DOM UI on top. Use tests to lock down card model, bidding, legal moves, scoring, AI legality, and save/load behavior before wiring the playable interface.

**Tech Stack:** Vite, TypeScript, Vitest, jsdom, native DOM/CSS, localStorage.

---

## File Structure

- Create: `package.json` - npm scripts and dev dependencies.
- Create: `tsconfig.json` - TypeScript app configuration.
- Create: `vite.config.ts` - Vite and Vitest configuration.
- Create: `index.html` - browser entrypoint.
- Create: `src/main.ts` - bootstraps the app.
- Create: `src/styles.css` - retro table UI styling.
- Create: `src/domain/cards.ts` - card, suit, rank, deck, shuffle, sort helpers.
- Create: `src/domain/rules.ts` - contracts, bids, rule configuration, scoring constants.
- Create: `src/domain/state.ts` - serializable game state and action types.
- Create: `src/domain/engine.ts` - immutable state transitions and legal action generation.
- Create: `src/domain/scoring.ts` - bullet, mountain, whist, all-pass scoring.
- Create: `src/ai/heuristicAi.ts` - deterministic local AI.
- Create: `src/persistence/saveStore.ts` - localStorage schema and round-trip validation.
- Create: `src/ui/render.ts` - DOM rendering and action binding.
- Create: `src/ui/controller.ts` - game loop between UI, engine, AI, and persistence.
- Create: `src/domain/*.test.ts`, `src/ai/*.test.ts`, `src/persistence/*.test.ts` - Vitest coverage.

## Task 1: App Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/styles.css`

- [ ] **Step 1: Create package metadata and scripts**

Write `package.json`:

```json
{
  "name": "marriage-browser-remake",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "verify": "npm run test && npm run build"
  },
  "devDependencies": {
    "@vitejs/plugin-basic-ssl": "^2.0.0",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5",
    "jsdom": "^24.1.1"
  }
}
```

- [ ] **Step 2: Create TypeScript and Vite config**

Write `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "vite.config.ts"]
}
```

Write `vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true
  }
});
```

- [ ] **Step 3: Create static entry files**

Write `index.html`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MARRIAGE Browser Remake</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Write `src/main.ts`:

```ts
import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root');
}

app.innerHTML = '<main class="app-shell"><h1>MARRIAGE</h1><p>Browser remake bootstrap</p></main>';
```

Write `src/styles.css`:

```css
:root {
  color: #e8f4d6;
  background: #061a14;
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #071f18;
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 5: Verify scaffold**

Run: `npm run verify`

Expected: Vitest reports no test files or a clean run, and Vite build succeeds.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/main.ts src/styles.css
git commit -m "chore: scaffold browser app"
```

## Task 2: Card Model and Deterministic Shuffle

**Files:**
- Create: `src/domain/cards.ts`
- Test: `src/domain/cards.test.ts`

- [ ] **Step 1: Write failing card tests**

Write `src/domain/cards.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createDeck, dealPreference, sortCards, seededShuffle } from './cards';

describe('cards', () => {
  it('creates a 32-card preference deck with unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(32);
    expect(new Set(deck.map((card) => card.id)).size).toBe(32);
  });

  it('deals three 10-card hands and a 2-card widow', () => {
    const deal = dealPreference(seededShuffle(createDeck(), 42));
    expect(deal.hands).toHaveLength(3);
    expect(deal.hands.every((hand) => hand.length === 10)).toBe(true);
    expect(deal.widow).toHaveLength(2);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/domain/cards.test.ts`

Expected: FAIL because `src/domain/cards.ts` does not exist.

- [ ] **Step 3: Implement card model**

Write `src/domain/cards.ts`:

```ts
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
  widow: Card[];
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
    widow: deck.slice(30, 32)
  };
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((left, right) => {
    const suitDelta = suits.indexOf(left.suit) - suits.indexOf(right.suit);
    if (suitDelta !== 0) return suitDelta;
    return ranks.indexOf(left.rank) - ranks.indexOf(right.rank);
  });
}
```

- [ ] **Step 4: Run card tests**

Run: `npm test -- src/domain/cards.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/cards.ts src/domain/cards.test.ts
git commit -m "feat: add preference card model"
```

## Task 3: Rules and Bidding

**Files:**
- Create: `src/domain/rules.ts`
- Test: `src/domain/rules.test.ts`

- [ ] **Step 1: Write failing rules tests**

Write `src/domain/rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compareBids, contractBulletValue, defaultRules, isBidAllowedAfter } from './rules';

describe('rules', () => {
  it('orders bids by level and suit', () => {
    expect(compareBids({ level: 6, suit: 'clubs' }, { level: 6, suit: 'spades' })).toBeGreaterThan(0);
    expect(compareBids({ level: 7, suit: 'spades' }, { level: 6, suit: 'hearts' })).toBeGreaterThan(0);
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
    expect(defaultRules.responsibleWhist).toBe(true);
    expect(defaultRules.progressiveAllPass).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/domain/rules.test.ts`

Expected: FAIL because `rules.ts` does not exist.

- [ ] **Step 3: Implement rules**

Write `src/domain/rules.ts`:

```ts
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
  responsibleWhist: true,
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
```

- [ ] **Step 4: Run rules tests**

Run: `npm test -- src/domain/rules.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/rules.ts src/domain/rules.test.ts
git commit -m "feat: add preference bidding rules"
```

## Task 4: Game State, Actions, and Deal Start

**Files:**
- Create: `src/domain/state.ts`
- Create: `src/domain/engine.ts`
- Test: `src/domain/engine.test.ts`

- [ ] **Step 1: Write failing engine start tests**

Write initial `src/domain/engine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createNewGame, getLegalActions } from './engine';

describe('engine', () => {
  it('starts a bidding hand with three players, sorted hands, and a widow', () => {
    const game = createNewGame(123);
    expect(game.phase).toBe('bidding');
    expect(game.players.map((player) => player.name)).toEqual(['You', 'AF Computers', 'VIMCOM']);
    expect(game.hands.every((hand) => hand.length === 10)).toBe(true);
    expect(game.widow).toHaveLength(2);
  });

  it('offers pass, game bids, and misere to the first bidder', () => {
    const game = createNewGame(123);
    const actions = getLegalActions(game);
    expect(actions.some((action) => action.type === 'pass')).toBe(true);
    expect(actions.some((action) => action.type === 'bidGame')).toBe(true);
    expect(actions.some((action) => action.type === 'bidMisere')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/domain/engine.test.ts`

Expected: FAIL because `engine.ts` does not exist.

- [ ] **Step 3: Define state types**

Write `src/domain/state.ts`:

```ts
import type { Card } from './cards';
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

export type BiddingState = {
  phase: 'bidding';
  seed: number;
  players: [Player, Player, Player];
  dealer: PlayerId;
  actor: PlayerId;
  hands: [Card[], Card[], Card[]];
  widow: Card[];
  currentBid: Bid | null;
  bidWinner: PlayerId | null;
  passed: PlayerId[];
  scores: [Score, Score, Score];
  allPassCount: number;
  log: string[];
};

export type ContractState = {
  phase: 'contract';
  seed: number;
  players: [Player, Player, Player];
  dealer: PlayerId;
  actor: PlayerId;
  hands: [Card[], Card[], Card[]];
  widow: Card[];
  contract: Bid;
  declarer: PlayerId;
  scores: [Score, Score, Score];
  allPassCount: number;
  log: string[];
};

export type PlayState = {
  phase: 'play';
  seed: number;
  players: [Player, Player, Player];
  dealer: PlayerId;
  actor: PlayerId;
  hands: [Card[], Card[], Card[]];
  widow: Card[];
  contract: Bid | { type: 'allPass' };
  declarer: PlayerId | null;
  trump: GameBid['suit'] | null;
  currentTrick: { player: PlayerId; card: Card }[];
  tricksTaken: [number, number, number];
  scores: [Score, Score, Score];
  allPassCount: number;
  log: string[];
};

export type FinishedState = PlayState & {
  phase: 'finished';
  winnerSummary: string;
};

export type GameState = BiddingState | ContractState | PlayState | FinishedState;

export type GameAction =
  | { type: 'pass' }
  | { type: 'bidGame'; bid: GameBid }
  | { type: 'bidMisere' }
  | { type: 'orderContract'; contract: Bid; discard: [Card['id'], Card['id']] }
  | { type: 'playCard'; cardId: Card['id'] };
```

- [ ] **Step 4: Implement game creation and legal bidding actions**

Write `src/domain/engine.ts`:

```ts
import { createDeck, dealPreference, sortCards, seededShuffle } from './cards';
import { isBidAllowedAfter, type Bid, type GameBid } from './rules';
import type { BiddingState, GameAction, GameState, Player, PlayerId, Score } from './state';

const players: [Player, Player, Player] = [
  { id: 0, name: 'You', kind: 'human' },
  { id: 1, name: 'AF Computers', kind: 'ai' },
  { id: 2, name: 'VIMCOM', kind: 'ai' }
];

const emptyScore = (): Score => ({ bullet: 0, mountain: 0, whists: [0, 0, 0] });

export function createNewGame(seed: number): GameState {
  const deal = dealPreference(seededShuffle(createDeck(), seed));
  return {
    phase: 'bidding',
    seed,
    players,
    dealer: 2,
    actor: 0,
    hands: [sortCards(deal.hands[0]), sortCards(deal.hands[1]), sortCards(deal.hands[2])],
    widow: deal.widow,
    currentBid: null,
    bidWinner: null,
    passed: [],
    scores: [emptyScore(), emptyScore(), emptyScore()],
    allPassCount: 0,
    log: ['New deal started']
  };
}

export function getLegalActions(state: GameState): GameAction[] {
  if (state.phase !== 'bidding') return [];
  const actions: GameAction[] = [{ type: 'pass' }];
  const gameBids = createGameBids();
  for (const bid of gameBids) {
    if (isBidAllowedAfter(state.currentBid, bid)) {
      actions.push({ type: 'bidGame', bid });
    }
  }
  if (isBidAllowedAfter(state.currentBid, { type: 'misere' })) {
    actions.push({ type: 'bidMisere' });
  }
  return actions;
}

function createGameBids(): GameBid[] {
  const levels: GameBid['level'][] = [6, 7, 8, 9, 10];
  const suits: GameBid['suit'][] = ['spades', 'clubs', 'diamonds', 'hearts'];
  return levels.flatMap((level) => suits.map((suit) => ({ type: 'game' as const, level, suit })));
}

export function nextPlayer(player: PlayerId): PlayerId {
  return ((player + 1) % 3) as PlayerId;
}

export function activeBidders(state: BiddingState): PlayerId[] {
  return [0, 1, 2].filter((id) => !state.passed.includes(id as PlayerId)) as PlayerId[];
}
```

- [ ] **Step 5: Run engine start tests**

Run: `npm test -- src/domain/engine.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/state.ts src/domain/engine.ts src/domain/engine.test.ts
git commit -m "feat: start game engine state"
```

## Task 5: Bidding Transitions

**Files:**
- Modify: `src/domain/engine.ts`
- Test: `src/domain/engine.test.ts`

- [ ] **Step 1: Add failing bidding transition tests**

Append to `src/domain/engine.test.ts`:

```ts
import { applyAction } from './engine';

describe('bidding transitions', () => {
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
    expect(afterThree.contract).toEqual({ type: 'allPass' });
  });

  it('moves to contract ordering when only the winning bidder remains', () => {
    const bid = applyAction(createNewGame(123), { type: 'bidGame', bid: { type: 'game', level: 6, suit: 'spades' } });
    const passOne = applyAction(bid, { type: 'pass' });
    const passTwo = applyAction(passOne, { type: 'pass' });
    expect(passTwo.phase).toBe('contract');
    if (passTwo.phase !== 'contract') throw new Error('Expected contract');
    expect(passTwo.declarer).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/domain/engine.test.ts`

Expected: FAIL because `applyAction` is not exported.

- [ ] **Step 3: Implement bidding transitions**

Add to `src/domain/engine.ts`:

```ts
export function applyAction(state: GameState, action: GameAction): GameState {
  if (state.phase === 'bidding') {
    return applyBiddingAction(state, action);
  }
  throw new Error(`Action ${action.type} is not valid during ${state.phase}`);
}

function applyBiddingAction(state: BiddingState, action: GameAction): GameState {
  if (action.type === 'pass') {
    const passed = state.passed.includes(state.actor) ? state.passed : [...state.passed, state.actor];
    const log = [...state.log, `${state.players[state.actor].name} passes`];
    if (!state.currentBid && passed.length === 3) {
      return {
        phase: 'play',
        seed: state.seed,
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
        scores: state.scores,
        allPassCount: state.allPassCount + 1,
        log
      };
    }
    if (state.currentBid && activeBidders({ ...state, passed }).length === 1 && state.bidWinner !== null) {
      return {
        phase: 'contract',
        seed: state.seed,
        players: state.players,
        dealer: state.dealer,
        actor: state.bidWinner,
        hands: state.hands,
        widow: state.widow,
        contract: state.currentBid,
        declarer: state.bidWinner,
        scores: state.scores,
        allPassCount: state.allPassCount,
        log
      };
    }
    return { ...state, passed, actor: nextPlayer(state.actor), log };
  }

  const bid: Bid | null =
    action.type === 'bidGame' ? action.bid : action.type === 'bidMisere' ? { type: 'misere' } : null;
  if (!bid || !isBidAllowedAfter(state.currentBid, bid)) {
    throw new Error(`Illegal bidding action ${action.type}`);
  }

  return {
    ...state,
    currentBid: bid,
    bidWinner: state.actor,
    actor: nextPlayer(state.actor),
    log: [...state.log, `${state.players[state.actor].name} bids ${formatBid(bid)}`]
  };
}

function formatBid(bid: Bid): string {
  return bid.type === 'misere' ? 'misere' : `${bid.level} ${bid.suit}`;
}
```

- [ ] **Step 4: Run engine tests**

Run: `npm test -- src/domain/engine.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/engine.ts src/domain/engine.test.ts
git commit -m "feat: add bidding transitions"
```

## Task 6: Trick Play and Renounce Prevention

**Files:**
- Modify: `src/domain/engine.ts`
- Modify: `src/domain/state.ts`
- Test: `src/domain/engine.test.ts`

- [ ] **Step 1: Add failing legal-play tests**

Append to `src/domain/engine.test.ts`:

```ts
describe('trick play', () => {
  it('only allows following suit when possible', () => {
    const state = createNewGame(5);
    if (state.phase !== 'bidding') throw new Error('Expected bidding');
    const playState = {
      ...state,
      phase: 'play' as const,
      actor: 1 as const,
      contract: { type: 'game' as const, level: 6 as const, suit: 'spades' as const },
      declarer: 0 as const,
      trump: 'spades' as const,
      currentTrick: [{ player: 0 as const, card: state.hands[0].find((card) => card.suit === 'clubs')! }],
      tricksTaken: [0, 0, 0] as [number, number, number]
    };
    const legal = getLegalActions(playState).filter((action) => action.type === 'playCard');
    const hasClub = playState.hands[1].some((card) => card.suit === 'clubs');
    expect(legal.every((action) => {
      const card = playState.hands[1].find((candidate) => candidate.id === action.cardId);
      return !hasClub || card?.suit === 'clubs';
    })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/domain/engine.test.ts`

Expected: FAIL because `getLegalActions` returns no play-card actions during `play`.

- [ ] **Step 3: Implement legal card generation and trick winner**

Extend `getLegalActions` in `src/domain/engine.ts`:

```ts
  if (state.phase === 'play') {
    return legalCardsForActor(state).map((card) => ({ type: 'playCard', cardId: card.id }));
  }
```

Add helpers:

```ts
function legalCardsForActor(state: Extract<GameState, { phase: 'play' }>) {
  const hand = state.hands[state.actor];
  const leadSuit = state.currentTrick[0]?.card.suit;
  if (!leadSuit) return hand;
  const following = hand.filter((card) => card.suit === leadSuit);
  return following.length > 0 ? following : hand;
}
```

- [ ] **Step 4: Run trick tests**

Run: `npm test -- src/domain/engine.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/engine.ts src/domain/state.ts src/domain/engine.test.ts
git commit -m "feat: generate legal trick actions"
```

## Task 7: Scoring

**Files:**
- Create: `src/domain/scoring.ts`
- Test: `src/domain/scoring.test.ts`

- [ ] **Step 1: Write failing scoring tests**

Write `src/domain/scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scoreAllPass, scoreSuccessfulContract } from './scoring';

describe('scoring', () => {
  it('writes bullet points for a successful seven-level game', () => {
    const scores = scoreSuccessfulContract(emptyScores(), 0, { type: 'game', level: 7, suit: 'clubs' });
    expect(scores[0].bullet).toBe(4);
  });

  it('writes misere as ten bullet points', () => {
    const scores = scoreSuccessfulContract(emptyScores(), 1, { type: 'misere' });
    expect(scores[1].bullet).toBe(10);
  });

  it('scores progressive all-pass tricks by all-pass count', () => {
    const scores = scoreAllPass(emptyScores(), [0, 2, 8], 2, true);
    expect(scores[1].mountain).toBe(6);
    expect(scores[2].mountain).toBe(24);
    expect(scores[0].bullet).toBe(3);
  });
});

function emptyScores() {
  return [
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] }
  ] as const;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/domain/scoring.test.ts`

Expected: FAIL because `scoring.ts` does not exist.

- [ ] **Step 3: Implement scoring functions**

Write `src/domain/scoring.ts`:

```ts
import { contractBulletValue, type Bid } from './rules';
import type { Score, PlayerId } from './state';

export function scoreSuccessfulContract(scores: readonly [Score, Score, Score], declarer: PlayerId, contract: Bid) {
  const next = cloneScores(scores);
  next[declarer].bullet += contractBulletValue(contract);
  return next;
}

export function scoreAllPass(
  scores: readonly [Score, Score, Score],
  tricksTaken: [number, number, number],
  allPassIndex: number,
  progressive: boolean
) {
  const trickValue = progressive ? Math.min(allPassIndex + 1, 3) : 1;
  const next = cloneScores(scores);
  tricksTaken.forEach((tricks, index) => {
    if (tricks === 0) {
      next[index as PlayerId].bullet += trickValue;
    } else {
      next[index as PlayerId].mountain += tricks * trickValue;
    }
  });
  return next;
}

function cloneScores(scores: readonly [Score, Score, Score]): [Score, Score, Score] {
  return scores.map((score) => ({
    bullet: score.bullet,
    mountain: score.mountain,
    whists: [...score.whists] as [number, number, number]
  })) as [Score, Score, Score];
}
```

- [ ] **Step 4: Run scoring tests**

Run: `npm test -- src/domain/scoring.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/scoring.ts src/domain/scoring.test.ts
git commit -m "feat: add preference scoring helpers"
```

## Task 8: Heuristic AI

**Files:**
- Create: `src/ai/heuristicAi.ts`
- Test: `src/ai/heuristicAi.test.ts`

- [ ] **Step 1: Write failing AI legality test**

Write `src/ai/heuristicAi.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chooseAiAction } from './heuristicAi';
import { applyAction, createNewGame, getLegalActions } from '../domain/engine';

describe('heuristic AI', () => {
  it('always chooses one of the legal bidding actions', () => {
    const state = applyAction(createNewGame(77), { type: 'pass' });
    const legal = getLegalActions(state);
    const chosen = chooseAiAction(state, 99);
    expect(legal).toContainEqual(chosen);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/ai/heuristicAi.test.ts`

Expected: FAIL because `heuristicAi.ts` does not exist.

- [ ] **Step 3: Implement simple deterministic AI**

Write `src/ai/heuristicAi.ts`:

```ts
import { getLegalActions } from '../domain/engine';
import type { GameAction, GameState } from '../domain/state';

export function chooseAiAction(state: GameState, seed: number): GameAction {
  const legal = getLegalActions(state);
  if (legal.length === 0) {
    throw new Error(`AI has no legal actions during ${state.phase}`);
  }

  const preferredBid = legal.find((action) => action.type === 'bidGame' && action.bid.level === 6);
  if (preferredBid && seed % 3 === 0) return preferredBid;

  const playCard = legal.find((action) => action.type === 'playCard');
  if (playCard) return playCard;

  return legal[0];
}
```

- [ ] **Step 4: Run AI tests**

Run: `npm test -- src/ai/heuristicAi.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/heuristicAi.ts src/ai/heuristicAi.test.ts
git commit -m "feat: add legal heuristic ai"
```

## Task 9: Persistence

**Files:**
- Create: `src/persistence/saveStore.ts`
- Test: `src/persistence/saveStore.test.ts`

- [ ] **Step 1: Write failing persistence tests**

Write `src/persistence/saveStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createNewGame } from '../domain/engine';
import { loadGame, saveGame } from './saveStore';

describe('saveStore', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a game through localStorage', () => {
    const game = createNewGame(44);
    saveGame(game);
    expect(loadGame()).toEqual(game);
  });

  it('ignores corrupt saves', () => {
    localStorage.setItem('marriage.save.v1', '{bad json');
    expect(loadGame()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/persistence/saveStore.test.ts`

Expected: FAIL because `saveStore.ts` does not exist.

- [ ] **Step 3: Implement save store**

Write `src/persistence/saveStore.ts`:

```ts
import type { GameState } from '../domain/state';

const saveKey = 'marriage.save.v1';

type SaveEnvelope = {
  schema: 1;
  state: GameState;
};

export function saveGame(state: GameState): void {
  const envelope: SaveEnvelope = { schema: 1, state };
  localStorage.setItem(saveKey, JSON.stringify(envelope));
}

export function loadGame(): GameState | null {
  const raw = localStorage.getItem(saveKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SaveEnvelope>;
    if (parsed.schema !== 1 || !parsed.state || typeof parsed.state.phase !== 'string') {
      return null;
    }
    return parsed.state;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run persistence tests**

Run: `npm test -- src/persistence/saveStore.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/persistence/saveStore.ts src/persistence/saveStore.test.ts
git commit -m "feat: persist game state locally"
```

## Task 10: UI Rendering

**Files:**
- Create: `src/ui/render.ts`
- Create: `src/ui/controller.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Create render API**

Write `src/ui/render.ts`:

```ts
import { getLegalActions } from '../domain/engine';
import type { GameAction, GameState } from '../domain/state';

export type RenderHandlers = {
  onAction: (action: GameAction) => void;
  onNewGame: () => void;
};

export function renderGame(root: HTMLElement, state: GameState, handlers: RenderHandlers): void {
  const legal = getLegalActions(state);
  root.innerHTML = `
    <main class="game-shell">
      <header class="top-bar">
        <section class="player-panel"><strong>${state.players[1].name}</strong><span>AI</span></section>
        <section class="title-panel"><h1>MARRIAGE</h1><p>Сочинский преферанс</p></section>
        <section class="player-panel right"><strong>${state.players[2].name}</strong><span>AI</span></section>
      </header>
      <section class="table-layout">
        <aside class="side-panel"><h2>Ход партии</h2><ol>${state.log.map((line) => `<li>${line}</li>`).join('')}</ol></aside>
        <section class="card-table">
          <div class="opponent-hand">${state.hands[1].map(() => '<span class="card back">░</span>').join('')}</div>
          <div class="trick-zone">${state.phase === 'play' ? state.currentTrick.map((play) => `<span class="card">${play.card.rank}<small>${play.card.suit}</small></span>`).join('') : '<span class="table-message">Торговля</span>'}</div>
          <div class="human-hand">${state.hands[0].map((card) => `<button class="card" data-card-id="${card.id}">${card.rank}<small>${card.suit}</small></button>`).join('')}</div>
        </section>
        <aside class="side-panel"><h2>Действия</h2><div class="actions"></div><button class="secondary" data-new-game>Новая сдача</button></aside>
      </section>
      <footer class="status-line">Фаза: ${state.phase} · Игрок: ${state.players[state.actor].name}</footer>
    </main>
  `;

  const actions = root.querySelector('.actions');
  if (actions) {
    for (const action of legal.filter((item) => item.type !== 'playCard')) {
      const button = document.createElement('button');
      button.textContent = actionLabel(action);
      button.addEventListener('click', () => handlers.onAction(action));
      actions.append(button);
    }
  }

  root.querySelector('[data-new-game]')?.addEventListener('click', handlers.onNewGame);
  root.querySelectorAll<HTMLButtonElement>('[data-card-id]').forEach((button) => {
    const action = legal.find((candidate) => candidate.type === 'playCard' && candidate.cardId === button.dataset.cardId);
    button.disabled = !action;
    if (action) button.addEventListener('click', () => handlers.onAction(action));
  });
}

function actionLabel(action: GameAction): string {
  if (action.type === 'pass') return 'Пас';
  if (action.type === 'bidMisere') return 'Мизер';
  if (action.type === 'bidGame') return `${action.bid.level} ${action.bid.suit}`;
  if (action.type === 'orderContract') return 'Заказать';
  return 'Ход';
}
```

- [ ] **Step 2: Create controller**

Write `src/ui/controller.ts`:

```ts
import { applyAction, createNewGame } from '../domain/engine';
import type { GameAction, GameState } from '../domain/state';
import { chooseAiAction } from '../ai/heuristicAi';
import { loadGame, saveGame } from '../persistence/saveStore';
import { renderGame } from './render';

export function startApp(root: HTMLElement): void {
  let state: GameState = loadGame() ?? createNewGame(Date.now() % 100000);

  const commit = (next: GameState) => {
    state = runAiTurns(next);
    saveGame(state);
    render();
  };

  const render = () => {
    renderGame(root, state, {
      onAction: (action: GameAction) => commit(applyAction(state, action)),
      onNewGame: () => commit(createNewGame(Date.now() % 100000))
    });
  };

  commit(state);
}

function runAiTurns(initial: GameState): GameState {
  let state = initial;
  let guard = 0;
  while (state.players[state.actor]?.kind === 'ai' && guard < 20) {
    state = applyAction(state, chooseAiAction(state, state.seed + guard));
    guard += 1;
  }
  return state;
}
```

- [ ] **Step 3: Wire main entry**

Replace `src/main.ts`:

```ts
import './styles.css';
import { startApp } from './ui/controller';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root');
}

startApp(app);
```

- [ ] **Step 4: Add table styling**

Replace `src/styles.css` with the dark retro table CSS:

```css
:root {
  color: #e8f4d6;
  background: #061a14;
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; min-height: 100vh; }
button { font: inherit; }

.game-shell {
  min-height: 100vh;
  padding: 16px;
  background: #071f18;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 14px;
}

.top-bar, .table-layout, .status-line {
  width: min(1280px, 100%);
  margin: 0 auto;
}

.top-bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  align-items: center;
}

.title-panel { text-align: center; }
.title-panel h1 { margin: 0; font-size: 28px; letter-spacing: 0; color: #f6d37a; }
.title-panel p { margin: 4px 0 0; color: #b9c7a2; }

.player-panel, .side-panel, .status-line {
  border: 1px solid #5f8d68;
  background: #102c22;
  padding: 12px;
}

.player-panel { display: flex; justify-content: space-between; gap: 8px; }
.player-panel.right { text-align: right; }

.table-layout {
  display: grid;
  grid-template-columns: 220px 1fr 220px;
  gap: 14px;
}

.side-panel h2 {
  margin: 0 0 10px;
  color: #f6d37a;
  font-size: 16px;
}

.side-panel ol {
  margin: 0;
  padding-left: 20px;
  color: #d6e5c7;
}

.card-table {
  min-height: 560px;
  border: 2px solid #5f8d68;
  background: radial-gradient(circle at center, #174a35, #0b2b20 66%, #061a14);
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 18px;
  padding: 18px;
}

.opponent-hand, .human-hand, .trick-zone {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.trick-zone { min-height: 180px; gap: 18px; }
.table-message { color: #f6d37a; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

.card {
  width: 56px;
  height: 82px;
  border: 1px solid #d6e0ba;
  background: #f6f1df;
  color: #111;
  border-radius: 4px;
  display: inline-grid;
  place-items: center;
  box-shadow: 0 6px 16px rgba(0, 0, 0, .25);
}

.card small {
  display: block;
  max-width: 48px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
}

.card.back { color: #314737; background: #e8edd8; }
button.card:disabled { opacity: .45; }

.actions {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
  max-height: 360px;
  overflow: auto;
}

.actions button, .secondary {
  border: 1px solid #8baa72;
  background: #173d2e;
  color: #e8f4d6;
  padding: 8px 10px;
  border-radius: 4px;
}

.status-line {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #d6e5c7;
}

@media (max-width: 900px) {
  .top-bar, .table-layout {
    grid-template-columns: 1fr;
  }
  .card-table { min-height: 460px; }
}
```

- [ ] **Step 5: Run verification**

Run: `npm run verify`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/render.ts src/ui/controller.ts src/main.ts src/styles.css
git commit -m "feat: render retro game table"
```

## Task 11: Playable Loop Stabilization

**Files:**
- Modify: `src/domain/engine.ts`
- Modify: `src/ui/render.ts`
- Modify: `src/ai/heuristicAi.ts`
- Test: `src/domain/engine.test.ts`

- [ ] **Step 1: Add a smoke test for multiple AI-assisted actions**

Append to `src/domain/engine.test.ts`:

```ts
describe('playable loop smoke', () => {
  it('keeps state valid after several legal actions', () => {
    let state = createNewGame(314);
    for (let step = 0; step < 6; step += 1) {
      const action = getLegalActions(state)[0];
      expect(action).toBeDefined();
      state = applyAction(state, action);
      expect(state.players).toHaveLength(3);
      expect(state.hands).toHaveLength(3);
    }
  });
});
```

- [ ] **Step 2: Run test to verify current gaps**

Run: `npm test -- src/domain/engine.test.ts`

Expected: FAIL if later phases still throw on supported smoke-path actions.

- [ ] **Step 3: Fill minimal supported transitions**

Update `applyAction` so `contract` can enter `play` by accepting `orderContract`, and `playCard` removes the card from the actor hand, appends to `currentTrick`, and advances actor. Keep scoring finalization minimal until the trick implementation is complete.

Use these function boundaries:

```ts
function applyContractAction(state: Extract<GameState, { phase: 'contract' }>, action: GameAction): GameState
function applyPlayAction(state: Extract<GameState, { phase: 'play' }>, action: GameAction): GameState
function removeCardFromHand(state: Extract<GameState, { phase: 'play' }>, cardId: string): Card
```

- [ ] **Step 4: Run all tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/engine.ts src/domain/engine.test.ts src/ui/render.ts src/ai/heuristicAi.ts
git commit -m "feat: stabilize playable game loop"
```

## Task 12: Manual Browser Verification

**Files:**
- No required code changes unless verification finds defects.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

Expected: Vite prints a local URL.

- [ ] **Step 2: Open the game**

Open the printed localhost URL in a browser.

Expected:

- Page shows the retro green card table.
- Human hand is visible.
- Bidding buttons appear during bidding.
- AI turns advance without freezing.
- New deal button starts a new deal.
- Refresh restores saved state.

- [ ] **Step 3: Fix verification defects with TDD**

For each defect, write or update a focused failing test first, run it to confirm failure, implement the smallest fix, then run `npm run verify`.

- [ ] **Step 4: Final verification**

Run: `npm run verify`

Expected: PASS.

- [ ] **Step 5: Commit verification fixes**

```bash
git add src
git commit -m "fix: resolve browser verification issues"
```

## Self-Review

- Spec coverage: The plan covers native TypeScript browser implementation, one human versus two AI, rules core, retro table UI, local persistence, and automated tests. Online multiplayer, DOS emulation, voice control, pixel-perfect reconstruction, and deep binary asset extraction remain out of scope as specified.
- Placeholder scan: The plan does not include unfinished-marker text. Task 11 intentionally names function boundaries for implementation because the exact code depends on prior task output; it still gives concrete behavior and verification commands.
- Type consistency: Core names are stable across tasks: `GameState`, `GameAction`, `createNewGame`, `getLegalActions`, `applyAction`, `chooseAiAction`, `saveGame`, `loadGame`.
