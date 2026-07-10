import { describe, expect, it, vi } from 'vitest';
import { createDeck } from '../domain/cards';
import { createNewGame, getLegalActions } from '../domain/engine';
import type { Bid } from '../domain/rules';
import type {
  BiddingState,
  DealResult,
  ContractState,
  DealSettlementState,
  FinalResult,
  FinishedState,
  GameAction,
  GameState,
  NextDealState,
  PlayState,
  Score,
  WhistResponse
} from '../domain/state';
import { renderGame, type RenderHandlers, type RenderView } from './render';

describe('renderGame legal human actions', () => {
  it('reveals defender cards when exactly one defender is whisting openly', () => {
    const state = makePlayState({
      declarer: 0,
      whistResponses: ['whist', 'pass']
    });
    const root = renderFor(state);

    expect(root.querySelectorAll('.opponent-hand .open-whist-card')).toHaveLength(
      state.hands[1].length + state.hands[2].length
    );
    expect(root.querySelectorAll('.opponent-hand .card-back')).toHaveLength(0);
  });

  it('renders bidding controls from legal actions only', () => {
    const state = makeBiddingState();
    const root = renderFor(state);

    expect(renderedActionKeys(root).sort()).toEqual(legalActionKeys(state).sort());
    expect(root.querySelector('[data-new-game]')).toBeNull();
  });

  it('renders contract ordering controls from legal actions only', () => {
    const state = makeContractOrderState({ type: 'game', level: 6, suit: 'clubs' });
    const root = renderFor(state);

    expect(renderedActionKeys(root).sort()).toEqual(legalActionKeys(state).sort());
  });

  it('renders contract order choices as compact labeled controls', () => {
    const state = makeContractOrderState({ type: 'game', level: 8, suit: 'hearts' });
    const root = renderFor(state);

    const orderGroup = root.querySelector('.contract-order-group');
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.contract-order-grid [data-action-type="orderContract"]'));

    expect(orderGroup).not.toBeNull();
    expect(buttons.map((button) => button.dataset.actionKey).sort()).toEqual(legalActionKeys(state).sort());
    expect(buttons.map((button) => button.textContent)).toEqual(['8♥', '9♠', '9♣', '9♦', '9♥', '10♠', '10♣', '10♦', '10♥']);
  });

  it('renders widow pickup as the only clickable contract action', () => {
    const state = makeWidowPickupState();
    const root = renderFor(state);

    expect(renderedActionKeys(root)).toEqual(['pickupWidow']);
  });

  it('keeps discard confirmation disabled until a legal pair is selected and emits that legal action', () => {
    const state = makeDiscardState();
    const actions = getLegalActions(state);
    const onAction = vi.fn<(action: GameAction) => void>();
    const root = document.createElement('div');

    renderGame(root, state, { onAction, onNewGame: vi.fn() });

    const confirm = root.querySelector<HTMLButtonElement>('[data-action-type="discardCards"]');
    const cards = root.querySelectorAll<HTMLButtonElement>('[data-discard-card-id]');
    expect(confirm?.disabled).toBe(true);
    expect(root.querySelector('[data-action-type="orderContract"]')).toBeNull();
    expect(root.querySelector('[data-action-type="whist"]')).toBeNull();
    expect(enabledPlayableCards(root)).toEqual([]);

    cards[0]?.click();
    expect(confirm?.disabled).toBe(true);

    cards[1]?.click();
    expect(confirm?.disabled).toBe(false);

    confirm?.click();

    const emitted = onAction.mock.calls[0]?.[0];
    expect(emitted).toBeDefined();
    expect(emitted?.type).toBe('discardCards');
    expect(
      actions.some(
        (action) =>
          action.type === 'discardCards' &&
          emitted?.type === 'discardCards' &&
          sameIds(action.cardIds, emitted.cardIds)
      )
    ).toBe(true);
  });

  it('labels discard card toggles with selection state and a clear confirmation name', () => {
    const state = makeDiscardState();
    const root = renderFor(state);

    const confirm = root.querySelector<HTMLButtonElement>('[data-action-type="discardCards"]');
    const cards = root.querySelectorAll<HTMLButtonElement>('[data-discard-card-id]');
    const clubsSeven = root.querySelector<HTMLButtonElement>('[data-discard-card-id="clubs-7"]');

    expect(confirm?.textContent).toBe('Подтвердить снос');
    expect(confirm?.getAttribute('aria-label')).toBe('Подтвердить снос 2 выбранных карт');
    expect(root.querySelector('.discard-count')?.textContent).toBe('Снос: выберите 2 карты');
    expect(clubsSeven?.getAttribute('aria-pressed')).toBe('false');
    expect(clubsSeven?.getAttribute('aria-label')).toBe('Выбрать в снос: 7 трефы');

    clubsSeven?.click();

    expect(clubsSeven?.getAttribute('aria-pressed')).toBe('true');
    expect(clubsSeven?.getAttribute('aria-label')).toBe('Убрать из сноса: 7 трефы');
    expect(root.querySelector('.discard-count')?.textContent).toBe('Снос: выберите 1 карты');

    cards[1]?.click();

    expect(confirm?.disabled).toBe(false);
    expect(confirm?.textContent).toBe('Подтвердить снос');
    expect(root.querySelector('.discard-count')?.textContent).toBe('Снос выбран: 2 карты');
  });

  it('keeps already discarded widow cards out of the visible discard hand', () => {
    const state = {
      ...makeDiscardState(),
      widow: [findCard('clubs-10'), findCard('clubs-jack')]
    };
    const root = renderFor(state);

    expect(root.querySelector('.widow-open')).toBeNull();
    expect(root.querySelector('[data-discard-card-id="clubs-10"]')).toBeNull();
    expect(root.querySelector('[data-discard-card-id="clubs-jack"]')).toBeNull();
    expect(root.querySelectorAll('[data-discard-card-id]')).toHaveLength(state.hands[state.declarer].length);
  });

  it('provides accessible names for legal action controls and playable cards', () => {
    const bidding = renderFor(makeBiddingState());
    const order = renderFor(makeContractOrderState({ type: 'game', level: 8, suit: 'hearts' }));
    const play = renderFor(makePlayState({ currentTrick: [{ player: 1, card: findCard('clubs-10') }] }));

    expect(bidding.querySelector<HTMLButtonElement>('[data-action-type="bidGame"]')?.getAttribute('aria-label')).toMatch(
      /^Ставка \d+ (пики|трефы|бубны|червы)$/
    );
    expect(order.querySelector<HTMLButtonElement>('[data-action-key="orderContract:8-hearts"]')?.getAttribute('aria-label')).toBe(
      'Заказать 8 червы'
    );
    expect(play.querySelector<HTMLButtonElement>('[data-card-id="clubs-7"]')?.getAttribute('aria-label')).toBe('7 трефы');
  });

  it('renders pass, whist, and half-whist when those are the legal defender choices', () => {
    const state = makeWhistState({ type: 'game', level: 8, suit: 'hearts' });
    const root = renderFor(state);

    expect(renderedActionKeys(root).sort()).toEqual(legalActionKeys(state).sort());
  });

  it('renders check only for ten-level whist decisions', () => {
    const state = makeWhistState({ type: 'game', level: 10, suit: 'hearts' });
    const root = renderFor(state);

    expect(renderedActionKeys(root)).toEqual(['check']);
  });

  it('enables only legal cards during contract play', () => {
    const state = makePlayState({
      actor: 0,
      currentTrick: [{ player: 1, card: findCard('clubs-10') }]
    });
    const root = renderFor(state);

    expect(enabledPlayableCards(root)).toEqual(legalActionKeys(state));
    expect(renderedActionKeys(root)).toEqual([]);
  });

  it('enables only trump cards when the human player is void in the led suit', () => {
    const state = makePlayState({
      actor: 0,
      trump: 'spades',
      currentTrick: [{ player: 1, card: findCard('clubs-10') }],
      hands: [
        [findCard('hearts-7'), findCard('diamonds-7'), findCard('spades-7'), findCard('spades-8')],
        [findCard('clubs-10')],
        [findCard('clubs-ace')]
      ]
    });
    const root = renderFor(state);

    expect(enabledPlayableCards(root)).toEqual(['playCard:spades-7', 'playCard:spades-8']);
    expect(root.querySelector<HTMLButtonElement>('[data-card-id="hearts-7"]')?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('[data-card-id="diamonds-7"]')?.disabled).toBe(true);
  });

  it('enables only legal cards during misere play', () => {
    const state = makePlayState({
      mode: 'misere',
      contract: { type: 'misere' },
      trump: null,
      currentTrick: [{ player: 1, card: findCard('clubs-10') }]
    });
    const root = renderFor(state);

    expect(enabledPlayableCards(root)).toEqual(legalActionKeys(state));
  });

  it('renders settle deal as the only deal-settlement action, including all-pass deals', () => {
    const state = makeSettlementState({
      mode: 'all-pass',
      contract: { type: 'allPass' },
      declarer: null,
      trump: null
    });
    const root = renderFor(state);

    expect(renderedActionKeys(root)).toEqual(['settleDeal']);
  });

  it('renders start next deal as the only continuation action', () => {
    const state = makeNextDealState();
    const root = renderFor(state);

    expect(renderedActionKeys(root)).toEqual(['startNextDeal']);
  });

  it('renders no human action controls once the bullet is finished', () => {
    const state = makeFinishedState();
    const root = renderFor(state);

    expect(renderedActionKeys(root)).toEqual([]);
    expect(enabledPlayableCards(root)).toEqual([]);
  });

  it('renders the score as a line-based preferans bullet sheet with accessible score details', () => {
    const state = makeNextDealState({
      scores: scoreCarry(),
      previousDealResult: makeDealResult()
    });
    const root = renderFor(state);

    const scoreboard = root.querySelector('[aria-label="Текущий счет пули"]');
    const bulletSheet = root.querySelector('[data-bullet-sheet]');
    expect(scoreboard).not.toBeNull();
    expect(bulletSheet).not.toBeNull();
    expect(scoreboard?.textContent).toContain('Пуля');
    expect(scoreboard?.textContent).toContain('Гора');
    expect(scoreboard?.textContent).toContain('Висты');
    expect(scoreboard?.textContent).toContain('Цель');
    expect(scoreboard?.textContent).toContain('AF Computers');
    expect(scoreboard?.textContent).toContain('VIMCOM');
    expect(scoreboard?.textContent).toContain('You');
    expect(scoreboard?.textContent).toContain('6');
    expect(scoreboard?.textContent).toContain('-2');
    expect(bulletSheet?.querySelector('.bullet-sheet-svg')).not.toBeNull();
    expect(bulletSheet?.querySelector('.bullet-sheet-target')).not.toBeNull();
    expect(bulletSheet?.querySelector('.bullet-sheet-target-value')?.textContent).toContain('10');
    expect(bulletSheet?.querySelectorAll('.bullet-sheet-line').length).toBeGreaterThan(8);
    expect(bulletSheet?.querySelectorAll('.bullet-sheet-entry')).toHaveLength(12);
    expect(root.querySelectorAll('.bullet-sheet-player')).toHaveLength(0);
  });

  it('renders cumulative score sheet records and omits zero entries from the bullet form', () => {
    const state = makeNextDealState({
      scores: [
        { bullet: 0, mountain: 13, whists: [0, 0, 0] },
        { bullet: 0, mountain: 0, whists: [0, 0, 0] },
        { bullet: 0, mountain: 0, whists: [0, 0, 0] }
      ],
      scoreSheet: [
        { bullet: [], mountain: [5, 13], whists: [[], [], []] },
        { bullet: [], mountain: [], whists: [[], [], []] },
        { bullet: [], mountain: [], whists: [[], [], []] }
      ]
    });
    const root = renderFor(state);
    const entries = Array.from(root.querySelectorAll('.bullet-sheet-entry')).map((entry) => entry.textContent ?? '');

    expect(entries).toContain('.5.13');
    expect(entries).not.toContain('0');
    expect(entries).not.toContain('.0');
  });

  it('renders structured deal result details during settlement and next-deal states', () => {
    const settlementRoot = renderFor(
      makeSettlementState({
        scores: scoreCarry(),
        dealResult: makeDealResult(),
        settlementSummary: makeDealResult().summary
      })
    );
    const nextDealRoot = renderFor(
      makeNextDealState({
        scores: makeDealResult().scoresAfter,
        previousDealResult: makeDealResult(),
        previousSummary: makeDealResult().summary
      })
    );

    for (const root of [settlementRoot, nextDealRoot]) {
      expect(root.querySelector('[data-result-panel="deal"]')).not.toBeNull();
      expect(root.textContent).toContain('Результат сдачи');
      expect(root.textContent).toContain('Контракт выполнен');
      expect(root.textContent).toContain('Изменение счета');
      expect(root.textContent).toContain('Висты');
      expect(root.textContent).toContain('AF Computers: +8');
      expect(root.textContent).toContain('Было');
      expect(root.textContent).toContain('Стало');
    }
  });

  it('uses a dedicated result-table layout without opponent or human hand rows during result-like phases', () => {
    for (const root of [
      renderFor(
        makeSettlementState({
          scores: scoreCarry(),
          dealResult: makeDealResult(),
          settlementSummary: makeDealResult().summary
        })
      ),
      renderFor(
        makeNextDealState({
          scores: makeDealResult().scoresAfter,
          previousDealResult: makeDealResult(),
          previousSummary: makeDealResult().summary
        })
      ),
      renderFor(makeFinishedState())
    ]) {
      expect(root.querySelector('.card-table')?.classList.contains('result-table-layout')).toBe(true);
      expect(root.querySelector('.trick-zone')?.classList.contains('result-zone')).toBe(true);
      expect(root.querySelector('.opponents-row')).toBeNull();
      expect(root.querySelector('.human-hand')).toBeNull();
    }
  });

  it('shows contract-family and play context with phase, actor, contract, and trump where applicable', () => {
    const orderRoot = renderFor(makeContractOrderState({ type: 'game', level: 6, suit: 'clubs' }));
    const whistRoot = renderFor(makeWhistState({ type: 'game', level: 8, suit: 'hearts' }));
    const playRoot = renderFor(
      makePlayState({
        currentTrick: [{ player: 1, card: findCard('clubs-10') }]
      })
    );

    expect(orderRoot.querySelector('[data-state-context]')?.textContent).toContain('Фаза');
    expect(orderRoot.querySelector('[data-state-context]')?.textContent).toContain('Заказ игры');
    expect(orderRoot.querySelector('[data-state-context]')?.textContent).toContain('Заказчик');
    expect(orderRoot.querySelector('[data-state-context]')?.textContent).toContain('You');
    expect(orderRoot.querySelector('[data-state-context]')?.textContent).toContain('6 трефы');

    expect(whistRoot.querySelector('[data-state-context]')?.textContent).toContain('Висты');
    expect(whistRoot.querySelector('[data-state-context]')?.textContent).toContain('8 червы');

    expect(playRoot.querySelector('[data-state-context]')?.textContent).toContain('Розыгрыш');
    expect(playRoot.querySelector('[data-state-context]')?.textContent).toContain('Козырь');
    expect(playRoot.querySelector('[data-state-context]')?.textContent).toContain('пики');
    expect(playRoot.querySelector('[data-state-context]')?.textContent).toContain('Текущая взятка');
    expect(playRoot.querySelector('[data-state-context]')?.textContent).toContain('10 трефы');
  });

  it('omits misleading trump or declarer-only context for all-pass and misere play states', () => {
    const allPassRoot = renderFor(
      makePlayState({
        mode: 'all-pass',
        contract: { type: 'allPass' },
        declarer: null,
        trump: null
      })
    );
    const misereRoot = renderFor(
      makePlayState({
        mode: 'misere',
        contract: { type: 'misere' },
        declarer: null,
        trump: null
      })
    );

    expect(allPassRoot.querySelector('[data-state-context]')?.textContent).toContain('Распасы');
    expect(allPassRoot.querySelector('[data-state-context]')?.textContent).not.toContain('Козырь');
    expect(allPassRoot.querySelector('[data-state-context]')?.textContent).not.toContain('Заказчик');

    expect(misereRoot.querySelector('[data-state-context]')?.textContent).toContain('Мизер');
    expect(misereRoot.querySelector('[data-state-context]')?.textContent).not.toContain('Козырь');
    expect(misereRoot.querySelector('[data-state-context]')?.textContent).not.toContain('Заказчик');
  });

  it('annotates deal score-change values with labels for narrow settlement layouts', () => {
    const root = renderFor(
      makeSettlementState({
        scores: scoreCarry(),
        dealResult: makeDealResult(),
        settlementSummary: makeDealResult().summary
      })
    );

    const firstRow = root.querySelector('[data-result-panel="deal"] tbody tr');
    const cells = firstRow?.querySelectorAll<HTMLTableCellElement>('td');

    expect(cells).toHaveLength(3);
    expect(cells?.[0]?.dataset.cellLabel).toBe('Было');
    expect(cells?.[1]?.dataset.cellLabel).toBe('Изменение');
    expect(cells?.[2]?.dataset.cellLabel).toBe('Стало');
  });

  it('renders finished-state final settlement and deterministic ranking summary without continuation controls', () => {
    const root = renderFor(makeFinishedState());

    expect(root.querySelector('[data-result-panel="final"]')).not.toBeNull();
    expect(root.textContent).toContain('Итог пули');
    expect(root.textContent).toContain('Победитель');
    expect(root.textContent).toContain('Финальный расчет');
    expect(root.textContent).toContain('Место 1');
    expect(root.textContent).toContain('You');
    expect(root.querySelector('[data-final-bullet-sheet] [data-bullet-sheet]')).not.toBeNull();
    expect(root.textContent).not.toContain('Следующая сдача');
    expect(root.querySelector('[data-action-key="startNextDeal"]')).toBeNull();
  });

  it('renders no clickable human controls when the actor is AI', () => {
    const state = { ...makeBiddingState(), actor: 1 as const };
    const root = renderFor(state);

    expect(renderedActionKeys(root)).toEqual([]);
    expect(enabledPlayableCards(root)).toEqual([]);
  });

  it('keeps two closed widow cards on the table during bidding', () => {
    const root = renderFor(makeBiddingState());

    expect(root.querySelector('.widow-closed')).not.toBeNull();
    expect(root.querySelectorAll('.widow-closed .card-back')).toHaveLength(2);
    expect(root.textContent).toContain('Торговля');
  });

  it('renders a center-deck deal animation in circular order with the first two rounds feeding the widow', () => {
    const root = renderFor(makeBiddingState(), { tableMotion: 'deal' });
    const flightCards = Array.from(root.querySelectorAll<HTMLElement>('.deal-flight-card'));

    expect(root.querySelector('.deal-source-deck')).not.toBeNull();
    expect(flightCards).toHaveLength(32);
    expect(flightCards.slice(0, 8).map((card) => card.dataset.dealTarget)).toEqual([
      'player-0',
      'player-1',
      'player-2',
      'widow',
      'player-0',
      'player-1',
      'player-2',
      'widow'
    ]);
    expect(flightCards.slice(8, 14).map((card) => card.dataset.dealTarget)).toEqual([
      'player-0',
      'player-1',
      'player-2',
      'player-0',
      'player-1',
      'player-2'
    ]);
    expect(flightCards[0]?.style.getPropertyValue('--deal-index')).toBe('0');
    expect(flightCards[31]?.style.getPropertyValue('--deal-index')).toBe('31');
  });

  it('shows animated bidding bubbles near the player seats', () => {
    const root = renderFor(makeBiddingState(), {
      biddingBubbles: [
        { player: 1, text: '6♠' },
        { player: 2, text: 'Пас' }
      ]
    });

    expect(root.querySelector('.bid-bubble-1')?.textContent).toBe('6♠');
    expect(root.querySelector('.bid-bubble-2')?.textContent).toBe('Пас');
  });

  it('keeps the ordered contract bubble visible during whist decisions', () => {
    const root = renderFor({
      ...makeWhistState({ type: 'game', level: 6, suit: 'spades' }),
      declarer: 2,
      defenderOrder: [0, 1],
      actor: 0
    });

    const declarerBubble = root.querySelector('.bid-bubble-2');

    expect(declarerBubble?.textContent).toBe('6 пики');
    expect(declarerBubble?.className).toContain('bid-bubble-sticky');
  });

  it('keeps ordered contract and defender decisions visible during play', () => {
    const root = renderFor(
      makePlayState({
        declarer: 2,
        contract: { type: 'game', level: 6, suit: 'spades' },
        trump: 'spades',
        whistResponses: ['whist', 'pass']
      })
    );

    expect(root.querySelector('.bid-bubble-2')?.textContent).toBe('6 пики');
    expect(root.querySelector('.bid-bubble-0')?.textContent).toBe('Вист');
    expect(root.querySelector('.bid-bubble-1')?.textContent).toBe('Пас');
  });

  it('reveals the widow on pickup and can pause all actions for reading', () => {
    const onContinuePause = vi.fn();
    const root = renderFor(
      makeWidowPickupState(),
      { pause: { kind: 'widow-reveal', message: 'Прикуп открыт' } },
      { onContinuePause }
    );

    expect(root.querySelector('.widow-open')?.textContent).toContain('9');
    expect(root.querySelector('.pause-overlay')?.textContent).toContain('Прикуп открыт');
    expect(renderedActionKeys(root)).toEqual([]);

    root.querySelector<HTMLElement>('.pause-overlay')?.click();
    expect(onContinuePause).toHaveBeenCalledTimes(1);
  });

  it('renders widow pickup cards flying toward the declarer hand', () => {
    const state = makeDiscardState();
    const pickupCards = [findCard('hearts-9'), findCard('spades-9')];
    const root = renderFor(state, { widowPickup: { player: state.declarer, cards: pickupCards } });

    const flyingCards = root.querySelectorAll('.widow-pickup-card');

    expect(flyingCards).toHaveLength(2);
    expect(flyingCards[0]?.className).toContain(`to-player-${state.declarer}`);
    expect(flyingCards[0]?.textContent).toContain('9');
    expect(flyingCards[1]?.textContent).toContain('9');
  });

  it('renders a completed trick from the view model and marks the last played card for animation', () => {
    const trick = [
      { player: 0 as const, card: findCard('clubs-7') },
      { player: 1 as const, card: findCard('clubs-8') },
      { player: 2 as const, card: findCard('clubs-9') }
    ];
    const root = renderFor(makePlayState(), {
      completedTrick: trick,
      playedCardId: 'clubs-9',
      pause: { kind: 'trick-complete', message: 'Посмотрите карты взятки' }
    });

    expect(root.textContent).toContain('Взятка завершена');
    expect(root.querySelectorAll('.trick-zone .card')).toHaveLength(3);
    expect(root.querySelector('.played-card.from-player-2')).not.toBeNull();
    expect(root.querySelector('.pause-overlay')?.textContent).toContain('Посмотрите карты взятки');
  });

  it('keeps completed trick cards centered while pausing before deal settlement', () => {
    const trick = [
      { player: 0 as const, card: findCard('diamonds-ace') },
      { player: 1 as const, card: findCard('diamonds-king') },
      { player: 2 as const, card: findCard('diamonds-queen') }
    ];
    const root = renderFor(makeSettlementState(), {
      completedTrick: trick,
      playedCardId: 'diamonds-queen',
      pause: { kind: 'trick-complete', message: 'Посмотрите карты взятки' }
    });

    expect(root.querySelectorAll('.trick-zone .card')).toHaveLength(3);
    expect(root.querySelector('.trick-zone')?.classList.contains('result-zone')).toBe(false);
    expect(root.querySelector('.trick-zone')?.classList.contains('completed-trick-zone')).toBe(true);
  });

});

function renderFor(
  state: GameState,
  view: RenderView = {},
  handlerOverrides: Partial<RenderHandlers> = {}
): HTMLDivElement {
  const root = document.createElement('div');
  renderGame(root, state, { onAction: vi.fn(), onNewGame: vi.fn(), ...handlerOverrides }, view);
  return root;
}

function renderedActionKeys(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-action-key]')).map((button) => button.dataset.actionKey ?? '');
}

function enabledPlayableCards(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('[data-card-id]'))
    .filter((button) => !button.disabled && !button.hasAttribute('data-discard-card-id'))
    .map((button) => `playCard:${button.dataset.cardId}`);
}

function legalActionKeys(state: GameState): string[] {
  return getLegalActions(state).map(actionKey);
}

function actionKey(action: GameAction): string {
  if (action.type === 'pass') return 'pass';
  if (action.type === 'check') return 'check';
  if (action.type === 'whist') return 'whist';
  if (action.type === 'halfWhist') return 'halfWhist';
  if (action.type === 'bidMisere') return 'bidMisere';
  if (action.type === 'bidGame') return `bidGame:${action.bid.level}-${action.bid.suit}`;
  if (action.type === 'orderContract') return `orderContract:${contractKey(action.contract)}`;
  if (action.type === 'pickupWidow') return 'pickupWidow';
  if (action.type === 'discardCards') return `discardCards:${action.cardIds.join(',')}`;
  if (action.type === 'settleDeal') return 'settleDeal';
  if (action.type === 'startNextDeal') return 'startNextDeal';
  return `playCard:${action.cardId}`;
}

function contractKey(contract: Bid): string {
  if (contract.type === 'misere') return 'misere';
  return `${contract.level}-${contract.suit}`;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

function emptyScores(): [Score, Score, Score] {
  return [
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] }
  ];
}

function scoreCarry(): [Score, Score, Score] {
  return [
    { bullet: 6, mountain: 1, whists: [0, 4, -2] },
    { bullet: 2, mountain: 3, whists: [-4, 0, 5] },
    { bullet: 1, mountain: 0, whists: [2, -5, 0] }
  ];
}

function makeDealResult(): DealResult {
  return {
    mode: 'contract' as const,
    contract: { type: 'game' as const, level: 8 as const, suit: 'hearts' as const },
    declarer: 0 as const,
    trickCounts: [8, 2, 0] as [number, number, number],
    whistResponses: ['whist', 'pass'] as [WhistResponse | null, WhistResponse | null],
    scoresBefore: scoreCarry(),
    scoreDelta: [
      { bullet: 6, mountain: 0, whists: [0, -8, 0] },
      { bullet: 0, mountain: 0, whists: [8, 0, 0] },
      { bullet: 0, mountain: 0, whists: [0, 0, 0] }
    ] as [Score, Score, Score],
    scoresAfter: [
      { bullet: 12, mountain: 1, whists: [0, -4, -2] },
      { bullet: 2, mountain: 3, whists: [4, 0, 5] },
      { bullet: 1, mountain: 0, whists: [2, -5, 0] }
    ] as [Score, Score, Score],
    whistAdjustments: [{ defender: 1 as const, declarer: 0 as const, response: 'whist' as const, tricks: 2, delta: 8 }],
    outcome: { type: 'contract-made' as const, contractPoints: 6 },
    bulletTarget: 10,
    bulletTargetReached: true,
    summary: 'You made 8 hearts and reached the bullet target'
  };
}

function makeBiddingState(): BiddingState {
  const players = createNewGame(1).players;
  return {
    phase: 'bidding',
    seed: 99,
    bulletTarget: 10,
    players,
    dealer: 2,
    actor: 0,
    hands: [
      [
        findCard('clubs-7'),
        findCard('clubs-8'),
        findCard('diamonds-7'),
        findCard('diamonds-8'),
        findCard('hearts-7'),
        findCard('hearts-8'),
        findCard('spades-7'),
        findCard('spades-8'),
        findCard('clubs-9'),
        findCard('diamonds-9')
      ],
      [
        findCard('clubs-10'),
        findCard('clubs-jack'),
        findCard('diamonds-10'),
        findCard('diamonds-jack'),
        findCard('hearts-10'),
        findCard('hearts-jack'),
        findCard('spades-10'),
        findCard('spades-jack'),
        findCard('clubs-queen'),
        findCard('diamonds-queen')
      ],
      [
        findCard('clubs-king'),
        findCard('clubs-ace'),
        findCard('diamonds-king'),
        findCard('diamonds-ace'),
        findCard('hearts-queen'),
        findCard('hearts-king'),
        findCard('hearts-ace'),
        findCard('spades-queen'),
        findCard('spades-king'),
        findCard('spades-ace')
      ]
    ],
    widow: [findCard('hearts-9'), findCard('spades-9')],
    currentBid: { type: 'game', level: 6, suit: 'clubs' },
    bidWinner: 2,
    passed: [],
    scores: emptyScores(),
    allPassCount: 0,
    log: ['Fixture']
  };
}

function makeContractOrderState(contract: Extract<Bid, { type: 'game' }>): ContractState {
  const base = makeBiddingState();
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
    contract,
    declarer: 0,
    defenderOrder: [1, 2],
    whistResponses: [null, null],
    scores: base.scores,
    allPassCount: 0,
    log: base.log
  };
}

function makeWidowPickupState(): ContractState {
  return {
    ...makeContractOrderState({ type: 'game', level: 6, suit: 'spades' }),
    step: 'widow-pickup'
  };
}

function makeDiscardState(): ContractState {
  return {
    ...makeContractOrderState({ type: 'game', level: 7, suit: 'hearts' }),
    step: 'discard',
    widow: [],
    hands: [
      [
        findCard('clubs-7'),
        findCard('clubs-8'),
        findCard('diamonds-7'),
        findCard('diamonds-8'),
        findCard('hearts-7'),
        findCard('hearts-8'),
        findCard('spades-7'),
        findCard('spades-8'),
        findCard('clubs-9'),
        findCard('diamonds-9'),
        findCard('hearts-9'),
        findCard('spades-9')
      ],
      makeBiddingState().hands[1],
      makeBiddingState().hands[2]
    ]
  };
}

function makeWhistState(contract: Extract<Bid, { type: 'game' }>): ContractState {
  const base = makeContractOrderState(contract);
  return {
    ...base,
    step: 'whist-decision',
    actor: 0,
    widow: []
  };
}

function makePlayState(overrides: Partial<PlayState> = {}): PlayState {
  const base = makeBiddingState();
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

function makeNextDealState(overrides: Partial<NextDealState> = {}): NextDealState {
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
    previousDealResult: settlement.dealResult,
    ...overrides
  };
}

function makeFinishedState(): FinishedState {
  const settlement = makeSettlementState();
  return {
    phase: 'finished',
    seed: settlement.seed,
    bulletTarget: settlement.bulletTarget,
    players: settlement.players,
    dealer: settlement.dealer,
    actor: settlement.actor,
    hands: settlement.hands,
    widow: settlement.widow,
    contract: settlement.contract,
    declarer: settlement.declarer,
    trump: settlement.trump,
    currentTrick: settlement.currentTrick,
    tricksTaken: settlement.tricksTaken,
    scores: settlement.scores,
    allPassCount: 0,
    log: settlement.log,
    winnerSummary: 'You wins the final rating',
    previousDealResult: makeDealResult(),
    finalResult: {
      bulletTarget: 10,
      winner: 0,
      ranking: [
        { player: 0, bullet: 12, mountain: 1, netWhists: -6, finalWhists: 7.33 },
        { player: 1, bullet: 2, mountain: 3, netWhists: 9, finalWhists: 2.33 },
        { player: 2, bullet: 1, mountain: 0, netWhists: -3, finalWhists: -9.67 }
      ],
      sortKey: 'final-whists-desc,bullet-desc,player-id-asc',
      summary: 'You wins the final rating with +7.33 whists'
    } satisfies FinalResult
  };
}

function findCard(cardId: string) {
  const card = createDeck().find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Missing card ${cardId}`);
  return card;
}
