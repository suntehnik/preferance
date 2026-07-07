import '../../src/styles.css';
import { createDeck, type Card } from '../../src/domain/cards';
import { applyAction, getLegalActions } from '../../src/domain/engine';
import type {
  BiddingState,
  ContractState,
  DealSettlementState,
  GameAction,
  GameState,
  PlayState,
  Score
} from '../../src/domain/state';
import { renderGame } from '../../src/ui/render';

type FixtureKey = 'bidding' | 'whist' | 'contract-play' | 'all-pass' | 'misere' | 'deal-settlement' | 'next-deal';

const fixtureKey = readFixtureKey();
const root = document.querySelector<HTMLElement>('#app');

if (!root) throw new Error('Missing #app root');

renderGame(root, fixtureState(fixtureKey), {
  onAction: () => undefined,
  onNewGame: () => undefined
});

document.documentElement.dataset.fixture = fixtureKey;

function readFixtureKey(): FixtureKey {
  const raw = new URLSearchParams(window.location.search).get('fixture') ?? 'bidding';
  if (
    raw === 'bidding' ||
    raw === 'whist' ||
    raw === 'contract-play' ||
    raw === 'all-pass' ||
    raw === 'misere' ||
    raw === 'deal-settlement' ||
    raw === 'next-deal'
  ) {
    return raw;
  }
  throw new Error(`Unknown fixture: ${raw}`);
}

function fixtureState(key: FixtureKey): GameState {
  if (key === 'bidding') {
    return makeBiddingState({
      currentBid: { type: 'game', level: 6, suit: 'hearts' },
      bidWinner: 2,
      passed: [1],
      log: ['VIMCOM: 6 червы', 'AF Computers: пас', 'You думаете']
    });
  }

  if (key === 'whist') {
    return makeContractState({
      step: 'whist-decision',
      actor: 0,
      declarer: 1,
      contract: { type: 'game', level: 8, suit: 'hearts' },
      defenderOrder: [0, 2],
      whistResponses: [null, null],
      players: makePlayers({ 1: 'ai', 2: 'ai' }),
      hands: [
        [findCard('clubs-7'), findCard('diamonds-9'), findCard('spades-jack')],
        [findCard('hearts-ace'), findCard('hearts-king'), findCard('clubs-ace')],
        [findCard('diamonds-ace'), findCard('spades-ace'), findCard('clubs-king')]
      ],
      widow: [],
      log: ['AF Computers ordered 8 червы', 'Прикуп забран', 'Снос завершен', 'You: решение по висту']
    });
  }

  if (key === 'contract-play') {
    return makePlayState({
      mode: 'contract',
      actor: 0,
      declarer: 0,
      trump: 'hearts',
      contract: { type: 'game', level: 8, suit: 'hearts' },
      currentTrick: [
        { player: 1, card: findCard('clubs-10') },
        { player: 2, card: findCard('clubs-ace') }
      ],
      hands: [
        [findCard('clubs-7'), findCard('hearts-7'), findCard('spades-7')],
        [findCard('diamonds-10')],
        [findCard('diamonds-ace')]
      ],
      tricksTaken: [3, 2, 1],
      whistResponses: ['whist', 'pass'],
      log: ['Контракт 8 червы', 'AF Computers: 10 трефы', 'VIMCOM: A трефы', 'You ходите']
    });
  }

  if (key === 'all-pass') {
    return makePlayState({
      mode: 'all-pass',
      actor: 0,
      contract: { type: 'allPass' },
      declarer: null,
      trump: null,
      currentTrick: [],
      hands: [
        [findCard('clubs-7'), findCard('diamonds-7')],
        [findCard('clubs-10'), findCard('diamonds-10')],
        [findCard('clubs-ace'), findCard('diamonds-ace')]
      ],
      tricksTaken: [0, 0, 0],
      whistResponses: [null, null],
      allPassCount: 3,
      log: ['You: пас', 'AF Computers: пас', 'VIMCOM: пас', 'Распасовка']
    });
  }

  if (key === 'misere') {
    return makePlayState({
      mode: 'misere',
      actor: 0,
      contract: { type: 'misere' },
      declarer: 0,
      trump: null,
      currentTrick: [],
      hands: [
        [findCard('clubs-7'), findCard('diamonds-7')],
        [findCard('clubs-ace'), findCard('diamonds-10')],
        [findCard('clubs-king'), findCard('spades-10')]
      ],
      tricksTaken: [0, 1, 0],
      whistResponses: [null, null],
      log: ['You: мизер', 'AF Computers: пас', 'VIMCOM: пас', 'Розыгрыш мизера']
    });
  }

  if (key === 'deal-settlement') {
    return makeSettlementState({
      settlementSummary: 'Сдача завершена: You взяли 6 взяток. Подсчитайте результат.',
      log: ['Последняя взятка завершена', 'Счет готов к расчету']
    });
  }

  return {
    phase: 'next-deal',
    seed: 843,
    bulletTarget: 10,
    players: makePlayers(),
    dealer: 0,
    actor: 0,
    hands: [[], [], []],
    widow: [],
    scores: [
      { bullet: 6, mountain: 0, whists: [0, 0, 0] },
      { bullet: 0, mountain: 2, whists: [0, 0, 0] },
      { bullet: 0, mountain: 0, whists: [0, 0, 0] }
    ],
    allPassCount: 3,
    log: ['Сдача завершена', 'Следующая сдача готова'],
    previousSummary: 'You записали 6 в пулю. Можно начать следующую сдачу.'
  };
}

function makeBiddingState(overrides: Partial<BiddingState> = {}): BiddingState {
  return {
    phase: 'bidding',
    seed: 842,
    bulletTarget: 10,
    players: makePlayers(),
    dealer: 2,
    actor: 0,
    hands: [
      [findCard('clubs-7'), findCard('diamonds-7'), findCard('spades-7')],
      [findCard('clubs-10'), findCard('diamonds-10'), findCard('spades-10')],
      [findCard('clubs-ace'), findCard('diamonds-ace'), findCard('spades-ace')]
    ],
    widow: [findCard('hearts-7'), findCard('hearts-10')],
    currentBid: null,
    bidWinner: null,
    passed: [],
    scores: emptyScores(),
    allPassCount: 0,
    log: ['Fixture'],
    ...overrides
  };
}

function makeContractState(overrides: Partial<ContractState> = {}): ContractState {
  const bidding = makeBiddingState();
  return {
    phase: 'contract',
    step: 'order',
    seed: bidding.seed,
    bulletTarget: bidding.bulletTarget,
    players: bidding.players,
    dealer: bidding.dealer,
    actor: 0,
    hands: bidding.hands,
    widow: bidding.widow,
    contract: { type: 'game', level: 8, suit: 'hearts' },
    declarer: 0,
    defenderOrder: [1, 2],
    whistResponses: [null, null],
    scores: bidding.scores,
    allPassCount: bidding.allPassCount,
    log: bidding.log,
    ...overrides
  };
}

function makePlayState(overrides: Partial<PlayState> = {}): PlayState {
  const contract = makeContractState();
  return {
    phase: 'play',
    mode: 'contract',
    seed: contract.seed,
    bulletTarget: contract.bulletTarget,
    players: contract.players,
    dealer: contract.dealer,
    actor: 0,
    hands: [
      [findCard('hearts-7'), findCard('spades-7')],
      [findCard('hearts-10')],
      [findCard('clubs-ace')]
    ],
    widow: [],
    contract: contract.contract,
    declarer: contract.declarer,
    trump: 'hearts',
    currentTrick: [],
    tricksTaken: [0, 0, 0],
    whistResponses: ['whist', 'pass'],
    scores: contract.scores,
    allPassCount: 0,
    log: contract.log,
    ...overrides
  };
}

function makeSettlementState(overrides: Partial<DealSettlementState> = {}): DealSettlementState {
  const play = makePlayState({
    hands: [[], [], []],
    currentTrick: [],
    tricksTaken: [6, 2, 2]
  });
  return {
    phase: 'deal-settlement',
    mode: play.mode,
    seed: play.seed,
    bulletTarget: play.bulletTarget,
    players: play.players,
    dealer: play.dealer,
    actor: play.actor,
    hands: play.hands,
    widow: play.widow,
    contract: play.contract,
    declarer: play.declarer,
    trump: play.trump,
    currentTrick: play.currentTrick,
    tricksTaken: play.tricksTaken,
    whistResponses: play.whistResponses,
    scores: play.scores,
    allPassCount: play.allPassCount,
    log: play.log,
    settlementSummary: 'Ready to settle',
    ...overrides
  };
}

function emptyScores(): [Score, Score, Score] {
  return [
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] }
  ];
}

function makePlayers(overrides: Partial<Record<0 | 1 | 2, 'human' | 'ai'>> = {}) {
  return [
    { id: 0 as const, name: 'You', kind: overrides[0] ?? 'human' },
    { id: 1 as const, name: 'AF Computers', kind: overrides[1] ?? 'ai' },
    { id: 2 as const, name: 'VIMCOM', kind: overrides[2] ?? 'ai' }
  ] as BiddingState['players'];
}

function findCard(cardId: Card['id']): Card {
  const card = createDeck().find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Missing card ${cardId}`);
  return card;
}

export function fixtureLegalActionKeys(key: FixtureKey): string[] {
  return getLegalActions(fixtureState(key)).map(actionKey).sort();
}

function actionKey(action: GameAction): string {
  if (action.type === 'pass') return 'pass';
  if (action.type === 'check') return 'check';
  if (action.type === 'whist') return 'whist';
  if (action.type === 'halfWhist') return 'halfWhist';
  if (action.type === 'bidMisere') return 'bidMisere';
  if (action.type === 'bidGame') return `bidGame:${action.bid.level}-${action.bid.suit}`;
  if (action.type === 'orderContract') {
    if (action.contract.type === 'misere') return 'orderContract:misere';
    return `orderContract:${action.contract.level}-${action.contract.suit}`;
  }
  if (action.type === 'pickupWidow') return 'pickupWidow';
  if (action.type === 'discardCards') return `discardCards:${[...action.cardIds].sort().join(',')}`;
  if (action.type === 'settleDeal') return 'settleDeal';
  if (action.type === 'startNextDeal') return 'startNextDeal';
  return `playCard:${action.cardId}`;
}
