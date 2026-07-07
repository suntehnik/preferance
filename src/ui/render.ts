import { getLegalActions } from '../domain/engine';
import { type Card, type Suit } from '../domain/cards';
import type {
  ContractState,
  DealResult,
  FinalResult,
  GameAction,
  GameState,
  PlayerId,
  Score,
  ScoreSheet,
  TrickPlay,
  WhistResponse
} from '../domain/state';
import type { ActiveBulletSave, SupportedBulletSize } from '../persistence/saveStore';

export type RenderHandlers = {
  onAction: (action: GameAction) => void;
  onNewGame: () => void;
  onContinuePause?: () => void;
};

export type BiddingBubble = {
  player: PlayerId;
  text: string;
  sticky?: boolean;
};

export type TablePause = {
  kind: 'widow-reveal' | 'trick-complete';
  message: string;
};

export type RenderView = {
  biddingBubbles?: BiddingBubble[];
  completedTrick?: TrickPlay[];
  pause?: TablePause;
  playedCardId?: Card['id'];
  tableMotion?: 'deal' | 'card';
  widowPickup?: {
    player: PlayerId;
    cards: readonly Card[];
  };
};

export type StartScreenHandlers = {
  onContinue?: () => void;
  onStart: (bulletSize: SupportedBulletSize) => void;
};

export function renderStartScreen(
  root: HTMLElement,
  supportedBulletSizes: readonly SupportedBulletSize[],
  saved: ActiveBulletSave | null,
  handlers: StartScreenHandlers
): void {
  root.innerHTML = `
    <main class="start-shell">
      <section class="start-panel" aria-labelledby="start-title">
        <p class="start-kicker">Сочинский преферанс</p>
        <h1 id="start-title">MARRIAGE</h1>
        ${saved ? savedBulletSummary(saved) : '<p class="start-copy">Выберите размер пули, чтобы начать новую партию.</p>'}
        ${
          saved
            ? '<button type="button" class="start-continue" data-continue-bullet>Продолжить незавершенную пулю</button>'
            : ''
        }
        <div class="start-actions" role="group" aria-label="Выбор размера пули">
          ${supportedBulletSizes
            .map(
              (size) => `
                <button type="button" class="start-size" data-start-bullet-size="${size}" aria-label="Начать пулю до ${size}">
                  <strong>${size}</strong>
                  <span>пуля</span>
                </button>
              `
            )
            .join('')}
        </div>
      </section>
    </main>
  `;

  root.querySelectorAll<HTMLButtonElement>('[data-start-bullet-size]').forEach((button) => {
    const bulletSize = Number(button.dataset.startBulletSize);
    if (isRenderedBulletSize(bulletSize, supportedBulletSizes)) {
      button.addEventListener('click', () => handlers.onStart(bulletSize));
    }
  });

  if (saved && handlers.onContinue) {
    root.querySelector('[data-continue-bullet]')?.addEventListener('click', handlers.onContinue);
  }
}

export function renderGame(root: HTMLElement, state: GameState, handlers: RenderHandlers, view: RenderView = {}): void {
  const legal = getLegalActions(state);
  const paused = view.pause !== undefined;
  const humanActor = state.players[state.actor].kind === 'human' && !paused;
  const resultLikePhase = isResultLikePhase(state);
  const completedTrickView = view.completedTrick !== undefined;
  const biddingBubbles = mergeBiddingBubbles(stickyBubblesForState(state), view.biddingBubbles ?? []);
  root.innerHTML = `
    <main class="game-shell">
      <header class="top-bar">
        <section class="player-panel"><strong>${escapeHtml(state.players[1].name)}</strong><span>AI</span></section>
        <section class="title-panel"><h1>MARRIAGE</h1><p>Сочинский преферанс</p></section>
        <section class="player-panel right"><strong>${escapeHtml(state.players[2].name)}</strong><span>AI</span></section>
      </header>
      <section class="table-layout">
        <aside class="side-panel info-panel">
          ${scoreboardMarkup(state)}
          <section class="history-panel" aria-labelledby="history-title">
            <h2 id="history-title">Ход партии</h2>
            <ol>${state.log.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ol>
          </section>
        </aside>
        <section class="card-table ${resultLikePhase ? 'result-table-layout' : ''} ${view.tableMotion === 'deal' ? 'deal-animation' : ''}">
          ${
            resultLikePhase
              ? ''
              : `<div class="opponents-row">
                  <div class="opponent-hand opponent-left" aria-label="${escapeAttribute(state.players[1].name)} hand">${state.hands[1].map(() => cardBack()).join('')}</div>
                  <div class="opponent-hand opponent-right" aria-label="${escapeAttribute(state.players[2].name)} hand">${state.hands[2].map(() => cardBack()).join('')}</div>
                </div>`
          }
          ${biddingBubblesMarkup(biddingBubbles)}
          ${dealAnimationMarkup(state, view, resultLikePhase)}
          ${widowPickupAnimationMarkup(view, resultLikePhase)}
          <div class="trick-zone ${resultLikePhase && !completedTrickView ? 'result-zone' : ''} ${completedTrickView ? 'completed-trick-zone' : ''}">${tableContent(state, view)}</div>
          ${
            resultLikePhase
              ? ''
              : `<div class="human-hand ${state.phase === 'contract' ? 'contract-hand' : ''}">${humanCards(state)}</div>`
          }
          ${view.pause ? pauseMarkup(view.pause) : ''}
        </section>
        <aside class="side-panel">
          ${stateContextMarkup(state)}
          <h2>Действия</h2>
          <div class="actions"></div>
          ${actionNotice(state, paused)}
        </aside>
      </section>
      <footer class="status-line">Фаза: ${escapeHtml(state.phase)} · Игрок: ${escapeHtml(state.players[state.actor].name)}</footer>
    </main>
  `;

  const actions = root.querySelector('.actions');
  if (actions) {
    renderActions(actions, paused ? [] : legal, handlers, state);
  }

  if (view.pause && handlers.onContinuePause) {
    const continuePause = () => handlers.onContinuePause?.();
    root.querySelector('.pause-overlay')?.addEventListener('click', (event) => {
      event.stopPropagation();
      continuePause();
    });
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        continuePause();
      },
      { once: true }
    );
  }

  if (state.phase === 'contract' && state.step === 'discard' && humanActor) {
    setupDiscardSelection(root, state as ContractState, handlers);
  } else {
    root.querySelectorAll<HTMLButtonElement>('[data-card-id]').forEach((button) => {
      const action =
        humanActor &&
        legal.find((candidate) => candidate.type === 'playCard' && candidate.cardId === button.dataset.cardId);
      button.disabled = !action;
      if (action) button.addEventListener('click', () => handlers.onAction(action));
    });
  }
}

function savedBulletSummary(saved: ActiveBulletSave): string {
  return `
    <p class="start-copy">Есть незавершенная пуля до ${saved.activeBulletSettings.bulletSize}. Можно продолжить ее или начать заново.</p>
  `;
}

function isRenderedBulletSize(
  value: number,
  supportedBulletSizes: readonly SupportedBulletSize[]
): value is SupportedBulletSize {
  return supportedBulletSizes.includes(value as SupportedBulletSize);
}

function isResultLikePhase(state: GameState): boolean {
  return state.phase === 'deal-settlement' || state.phase === 'next-deal' || state.phase === 'finished';
}

function tableContent(state: GameState, view: RenderView): string {
  if (view.completedTrick) {
    return `${trickCardsMarkup(view.completedTrick, view.playedCardId)}<span class="table-message">Взятка завершена</span>`;
  }
  if (state.phase === 'bidding') {
    return `
      <div class="table-stack">
        <div class="widow-row widow-closed" aria-label="Прикуп на столе">${state.widow.map(() => cardBack()).join('')}</div>
        <span class="table-message">Торговля</span>
      </div>
    `;
  }
  if (state.phase === 'contract') {
    if (state.step === 'order') {
      return `
        <div class="table-stack">
          <span class="table-message">Закажите игру.</span>
        </div>
      `;
    }
    if (state.step === 'widow-pickup') {
      return `
        <div class="table-stack">
          <div class="widow-row widow-open" aria-label="Открытый прикуп">${state.widow.map((card) => cardSpan(card)).join('')}</div>
          <span class="table-message">Прикуп открыт</span>
        </div>
      `;
    }
    if (state.step === 'discard') return '<span class="table-message">Выберите 2 карты в закрытый снос.</span>';
    return '<span class="table-message">Решение по висту.</span>';
  }
  if (state.phase === 'next-deal') {
    return state.previousDealResult ? renderDealResultPanel(state.previousDealResult, state.players) : `<span class="table-message">${escapeHtml(state.previousSummary)}</span>`;
  }
  if (state.phase === 'deal-settlement') {
    return state.dealResult ? renderDealResultPanel(state.dealResult, state.players) : `<span class="table-message">${escapeHtml(state.settlementSummary)}</span>`;
  }
  if (state.phase === 'finished') {
    return state.finalResult
      ? renderFinalResultPanel(state.finalResult, state.previousDealResult, state.players, state.scoreSheet ?? scoreSheetFromScores(state.scores), state.winnerSummary)
      : `<span class="table-message">${escapeHtml(state.winnerSummary)}</span>`;
  }

  const currentTrick = trickCardsMarkup(state.currentTrick, view.playedCardId);
  return `${currentTrick}<span class="table-message">Розыгрыш</span>`;
}

function trickCardsMarkup(trick: readonly TrickPlay[], playedCardId: Card['id'] | undefined): string {
  return trick.map((play) => cardSpan(play.card, play.card.id === playedCardId ? ` played-card from-player-${play.player}` : '')).join('');
}

function cardSpan(card: Card, extraClass = ''): string {
  return `<span class="card ${cardTone(card.suit)}${extraClass}" aria-label="${escapeAttribute(cardLabel(card))}">${cardFace(card)}</span>`;
}

function biddingBubblesMarkup(bubbles: readonly BiddingBubble[]): string {
  if (bubbles.length === 0) return '';
  return `
    <div class="bidding-bubbles" aria-live="polite">
      ${bubbles
        .map(
          (bubble) =>
            `<span class="bid-bubble bid-bubble-${bubble.player}${bubble.sticky ? ' bid-bubble-sticky' : ''}">${escapeHtml(bubble.text)}</span>`
        )
        .join('')}
    </div>
  `;
}

function mergeBiddingBubbles(stickyBubbles: readonly BiddingBubble[], transientBubbles: readonly BiddingBubble[]): BiddingBubble[] {
  const merged = [...stickyBubbles];
  transientBubbles.forEach((bubble) => {
    if (!merged.some((existing) => existing.player === bubble.player)) {
      merged.push(bubble);
    }
  });
  return merged;
}

function stickyBubblesForState(state: GameState): BiddingBubble[] {
  if (state.phase !== 'contract' && state.phase !== 'play' && state.phase !== 'deal-settlement') {
    return [];
  }
  if (state.contract.type === 'allPass' || state.declarer === null) {
    return [];
  }

  const bubbles: BiddingBubble[] = [
    {
      player: state.declarer,
      text: contractBubbleText(state.contract),
      sticky: true
    }
  ];

  if (state.contract.type === 'game') {
    const defenderOrder = state.phase === 'contract' ? state.defenderOrder : defenderOrderForDeclarer(state.declarer);
    state.whistResponses.forEach((response, index) => {
      if (response !== null) {
        bubbles.push({
          player: defenderOrder[index],
          text: whistBubbleText(response),
          sticky: true
        });
      }
    });
  }

  return bubbles;
}

function contractBubbleText(contract: ContractState['contract']): string {
  if (contract.type === 'misere') return 'Мизер';
  return `${contract.level} ${suitName(contract.suit)}`;
}

function defenderOrderForDeclarer(declarer: PlayerId): [PlayerId, PlayerId] {
  const first = nextSeat(declarer);
  return [first, nextSeat(first)];
}

function nextSeat(player: PlayerId): PlayerId {
  return ((player + 1) % 3) as PlayerId;
}

function whistBubbleText(response: WhistResponse): string {
  if (response === 'whist') return 'Вист';
  if (response === 'half-whist') return 'Полвиста';
  if (response === 'check') return 'Чек';
  return 'Пас';
}

function dealAnimationMarkup(state: GameState, view: RenderView, resultLikePhase: boolean): string {
  if (view.tableMotion !== 'deal' || resultLikePhase) return '';

  const sequence = dealAnimationTargets(state.actor);
  return `
    <div class="deal-overlay" aria-hidden="true">
      <div class="deal-source-deck" aria-label="Колода в центре стола">
        ${Array.from({ length: 5 }, (_, index) => cardBack(`deck-stack-card deck-stack-card-${index}`)).join('')}
      </div>
      ${sequence
        .map((target, index) =>
          cardBack(
            `deal-flight-card deal-target-${target}`,
            `data-deal-target="${escapeAttribute(target)}" style="--deal-index:${index}"`
          )
        )
        .join('')}
    </div>
  `;
}

function widowPickupAnimationMarkup(view: RenderView, resultLikePhase: boolean): string {
  if (!view.widowPickup || resultLikePhase) return '';
  const { cards, player } = view.widowPickup;

  return `
    <div class="widow-pickup-overlay" aria-hidden="true">
      ${cards
        .map(
          (card, index) => `
            <span
              class="card ${cardTone(card.suit)} widow-pickup-card to-player-${player}"
              style="--pickup-index:${index}; --pickup-offset:${index === 0 ? '-28px' : '28px'}"
            >${cardFace(card)}</span>
          `
        )
        .join('')}
    </div>
  `;
}

function dealAnimationTargets(firstPlayer: PlayerId): string[] {
  const targets: string[] = [];
  for (let round = 0; round < 10; round += 1) {
    for (let offset = 0; offset < 3; offset += 1) {
      targets.push(`player-${((firstPlayer + offset) % 3) as PlayerId}`);
    }
    if (round < 2) {
      targets.push('widow');
    }
  }
  return targets;
}

function pauseMarkup(pause: TablePause): string {
  return `
    <div class="pause-overlay" data-pause-kind="${escapeAttribute(pause.kind)}">
      <button type="button" class="pause-card" data-continue-pause>
        <strong>${escapeHtml(pause.message)}</strong>
        <span>Кликните или нажмите любую клавишу</span>
      </button>
    </div>
  `;
}

function scoreboardMarkup(state: GameState): string {
  return `
    <section class="score-panel" aria-labelledby="scoreboard-title">
      <h2 id="scoreboard-title">Запись пули</h2>
      <div class="bullet-sheet-wrap" aria-label="Текущий счет пули">
        ${bulletSheetMarkup(state.players, state.scoreSheet ?? scoreSheetFromScores(state.scores), state.bulletTarget)}
      </div>
    </section>
  `;
}

function bulletSheetMarkup(
  players: GameState['players'],
  scoreSheet: ScoreSheet,
  bulletTarget: number,
  extraClass = ''
): string {
  const scoreSummary = players
    .map((player, index) => {
      const sheet = scoreSheet[index];
      return `${player.name}: Пуля ${sheet.bullet.join(', ') || 'нет записей'}, Гора ${sheet.mountain.join(', ') || 'нет записей'}, Висты ${sheet.whists
        .map((entries, opponentIndex) => (opponentIndex === index ? '' : `${players[opponentIndex].name} ${entries.join(', ') || 'нет записей'}`))
        .filter(Boolean)
        .join(', ')}`;
    })
    .join('; ');

  return `
    <figure class="bullet-sheet ${escapeAttribute(extraClass)}" data-bullet-sheet aria-label="${escapeAttribute(`Цель ${bulletTarget}. ${scoreSummary}`)}">
      <svg class="bullet-sheet-svg" viewBox="0 0 724 491" role="img" aria-hidden="true" focusable="false">
        <path class="bullet-sheet-line" d="M0 200H140" />
        <path class="bullet-sheet-line" d="M140 0V342" />
        <path class="bullet-sheet-line" d="M184 0V310" />
        <path class="bullet-sheet-line" d="M362 0V176" />
        <path class="bullet-sheet-line" d="M542 0V310" />
        <path class="bullet-sheet-line" d="M584 0V342" />
        <path class="bullet-sheet-line" d="M584 200H724" />
        <path class="bullet-sheet-line" d="M140 342H584" />
        <path class="bullet-sheet-line" d="M184 310H542" />
        <path class="bullet-sheet-line" d="M362 342V491" />
        <path class="bullet-sheet-line" d="M140 342L0 491" />
        <path class="bullet-sheet-line" d="M584 342L724 491" />
        <path class="bullet-sheet-line bullet-sheet-thin" d="M184 310L320 207" />
        <path class="bullet-sheet-line bullet-sheet-thin" d="M404 207L542 310" />
        <path class="bullet-sheet-line bullet-sheet-thin" d="M140 342L184 310" />
        <path class="bullet-sheet-line bullet-sheet-thin" d="M542 310L584 342" />
        <rect class="bullet-sheet-target" x="320" y="176" width="84" height="31" />
        <text class="bullet-sheet-target-value" x="362" y="198">${escapeHtml(recordValue(bulletTarget))}</text>
        <text class="bullet-sheet-entry" x="112" y="229">${escapeHtml(recordSeries(scoreSheet[1].mountain))}</text>
        <text class="bullet-sheet-entry bullet-sheet-vertical" x="526" y="257">${escapeHtml(recordSeries(scoreSheet[2].mountain))}</text>
        <text class="bullet-sheet-entry" x="365" y="375">${escapeHtml(recordSeries(scoreSheet[0].mountain))}</text>
        <text class="bullet-sheet-entry" x="226" y="302">${escapeHtml(recordSeries(scoreSheet[1].bullet))}</text>
        <text class="bullet-sheet-entry bullet-sheet-vertical" x="566" y="288">${escapeHtml(recordSeries(scoreSheet[2].bullet))}</text>
        <text class="bullet-sheet-entry" x="168" y="340">${escapeHtml(recordSeries(scoreSheet[0].bullet))}</text>
        <text class="bullet-sheet-entry bullet-sheet-vertical" x="116" y="82">${escapeHtml(recordSeries(scoreSheet[1].whists[0]))}</text>
        <text class="bullet-sheet-entry bullet-sheet-vertical" x="158" y="83">${escapeHtml(recordSeries(scoreSheet[1].whists[2]))}</text>
        <text class="bullet-sheet-entry bullet-sheet-vertical" x="524" y="176">${escapeHtml(recordSeries(scoreSheet[2].whists[0]))}</text>
        <text class="bullet-sheet-entry bullet-sheet-vertical" x="584" y="88">${escapeHtml(recordSeries(scoreSheet[2].whists[1]))}</text>
        <text class="bullet-sheet-entry" x="304" y="330">${escapeHtml(recordSeries(scoreSheet[0].whists[1]))}</text>
        <text class="bullet-sheet-entry" x="408" y="330">${escapeHtml(recordSeries(scoreSheet[0].whists[2]))}</text>
      </svg>
      <figcaption class="sr-only">Пуля. Цель ${escapeHtml(bulletTarget)}. ${escapeHtml(scoreSummary)}</figcaption>
    </figure>
  `;
}

function scoreSheetFromScores(scores: readonly [Score, Score, Score]): ScoreSheet {
  return scores.map((score) => ({
    bullet: score.bullet === 0 ? [] : [score.bullet],
    mountain: score.mountain === 0 ? [] : [score.mountain],
    whists: score.whists.map((value) => (value === 0 ? [] : [value])) as [number[], number[], number[]]
  })) as ScoreSheet;
}

function recordSeries(values: readonly number[]): string {
  return values.filter((value) => value !== 0).map(recordValue).join('');
}

function recordValue(value: number): string {
  if (value === 0) return '';
  return value > 0 ? `.${value}` : String(value);
}

function renderDealResultPanel(result: DealResult, players: GameState['players']): string {
  const declarerName = result.declarer === null ? 'Без заказчика' : players[result.declarer].name;
  const scoreRows = players
    .map((player, index) => {
      const before = result.scoresBefore[index];
      const delta = result.scoreDelta[index];
      const after = result.scoresAfter[index];
      return `
        <tr>
          <th scope="row">${escapeHtml(player.name)}</th>
          <td data-cell-label="Было">${escapeHtml(compactScore(before))}</td>
          <td data-cell-label="Изменение">${escapeHtml(compactDelta(delta))}</td>
          <td data-cell-label="Стало">${escapeHtml(compactScore(after))}</td>
        </tr>
      `;
    })
    .join('');

  const whists =
    result.whistAdjustments.length > 0
      ? `<ul class="result-list">${result.whistAdjustments
          .map(
            (adjustment) =>
              `<li>${escapeHtml(players[adjustment.defender].name)}: ${escapeHtml(
                `${formatSigned(adjustment.delta)} к ${players[adjustment.declarer].name} (${adjustment.response}, ${adjustment.tricks} взятки)`
              )}</li>`
          )
          .join('')}</ul>`
      : '<p class="result-empty">Без вистовых изменений</p>';

  return `
    <section class="result-panel" data-result-panel="deal" aria-labelledby="deal-result-title">
      <header class="result-header">
        <p class="result-kicker">Результат сдачи</p>
        <h2 id="deal-result-title">${escapeHtml(outcomeLabel(result.outcome))}</h2>
        <p class="result-summary">${escapeHtml(result.summary)}</p>
      </header>
      <dl class="result-meta">
        <div><dt>Контракт</dt><dd>${escapeHtml(contractSummary(result.contract))}</dd></div>
        <div><dt>Заказчик</dt><dd>${escapeHtml(declarerName)}</dd></div>
        <div><dt>Взятки</dt><dd>${escapeHtml(trickSummary(result.trickCounts, players))}</dd></div>
      </dl>
      <section aria-labelledby="deal-score-change-title">
        <h3 id="deal-score-change-title">Изменение счета</h3>
        <div class="result-table-wrap">
          <table class="result-table">
            <thead>
              <tr>
                <th scope="col">Игрок</th>
                <th scope="col">Было</th>
                <th scope="col">Изменение</th>
                <th scope="col">Стало</th>
              </tr>
            </thead>
            <tbody>${scoreRows}</tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="deal-whists-title">
        <h3 id="deal-whists-title">Висты</h3>
        ${whists}
      </section>
    </section>
  `;
}

function renderFinalResultPanel(
  finalResult: FinalResult,
  previousDealResult: DealResult | undefined,
  players: GameState['players'],
  scoreSheet: ScoreSheet,
  winnerSummary: string
): string {
  const ranking = finalResult.ranking
    .map(
      (entry, index) => `
        <li>
          <span class="ranking-place">Место ${index + 1}</span>
          <strong>${escapeHtml(players[entry.player].name)}</strong>
          <span>${escapeHtml(
            `Пуля ${entry.bullet} · Гора ${entry.mountain} · Чистый вист ${formatSigned(entry.netWhists)} · Итог ${formatSigned(entry.finalWhists)}`
          )}</span>
        </li>
      `
    )
    .join('');

  const settlement = previousDealResult
    ? `<section aria-labelledby="final-settlement-title">
        <h3 id="final-settlement-title">Финальный расчет</h3>
        <p class="result-summary">${escapeHtml(previousDealResult.summary)}</p>
      </section>`
    : '';

  return `
    <section class="result-panel" data-result-panel="final" aria-labelledby="final-result-title">
      <header class="result-header">
        <p class="result-kicker">Итог пули</p>
        <h2 id="final-result-title">${escapeHtml(winnerSummary)}</h2>
        <p class="result-summary">${escapeHtml(finalResult.summary)}</p>
      </header>
      <dl class="result-meta">
        <div><dt>Победитель</dt><dd>${escapeHtml(players[finalResult.winner].name)}</dd></div>
        <div><dt>Размер пули</dt><dd>${escapeHtml(finalResult.bulletTarget)}</dd></div>
      </dl>
      <section aria-labelledby="final-bullet-sheet-title" data-final-bullet-sheet>
        <h3 id="final-bullet-sheet-title">Запись пули</h3>
        <div class="final-bullet-sheet-wrap">${bulletSheetMarkup(players, scoreSheet, finalResult.bulletTarget, 'bullet-sheet-large')}</div>
      </section>
      <section aria-labelledby="ranking-title">
        <h3 id="ranking-title">Финальный рейтинг</h3>
        <ol class="ranking-list">${ranking}</ol>
      </section>
      ${settlement}
    </section>
  `;
}

function actionNotice(state: GameState, paused = false): string {
  if (paused) {
    return '<p class="action-note">Просмотр стола: кликните или нажмите любую клавишу</p>';
  }
  if (state.phase === 'play') {
    return '<p class="action-note">Выберите доступную карту</p>';
  }
  if (state.phase === 'deal-settlement') {
    return '<p class="action-note">Подтвердите расчет сдачи</p>';
  }
  if (state.phase === 'next-deal') {
    return '<p class="action-note">Перейдите к следующей сдаче</p>';
  }
  if (state.phase === 'contract') {
    if (state.step === 'whist-decision') {
      return `<p class="action-note">${escapeHtml(state.players[state.actor].name)} выбирает вист или пас</p>`;
    }
    return '<p class="action-note">Подтвердите заказ игры</p>';
  }
  if (state.phase === 'finished') {
    return '<p class="action-note">Партия завершена</p>';
  }
  return '';
}

function stateContextMarkup(state: GameState): string {
  const items: Array<{ label: string; value: string }> = [
    { label: 'Фаза', value: visiblePhaseLabel(state) },
    { label: 'Игрок', value: state.players[state.actor].name }
  ];

  const contractSummaryValue = liveContractSummary(state);
  if (contractSummaryValue) {
    items.push({ label: 'Контракт', value: contractSummaryValue });
  }

  const declarerName = liveDeclarerName(state);
  if (declarerName) {
    items.push({ label: 'Заказчик', value: declarerName });
  }

  const trumpName = liveTrumpName(state);
  if (trumpName) {
    items.push({ label: 'Козырь', value: trumpName });
  }

  const trickValue = liveTrickSummary(state);
  if (trickValue) {
    items.push({ label: 'Текущая взятка', value: trickValue });
  }

  return `
    <section class="state-panel" data-state-context aria-labelledby="state-context-title">
      <h2 id="state-context-title">Состояние стола</h2>
      <dl class="state-meta">
        ${items
          .map(
            (item) => `
              <div>
                <dt>${escapeHtml(item.label)}</dt>
                <dd>${escapeHtml(item.value)}</dd>
              </div>
            `
          )
          .join('')}
      </dl>
    </section>
  `;
}

function compactScore(score: Score): string {
  return `П${score.bullet} / Г${score.mountain} / В${score.whists.map((value) => formatSigned(value)).join('/')}`;
}

function compactDelta(score: Score): string {
  const pieces = [];
  if (score.bullet !== 0) pieces.push(`П ${formatSigned(score.bullet)}`);
  if (score.mountain !== 0) pieces.push(`Г ${formatSigned(score.mountain)}`);
  const whistChanges = score.whists.filter((value) => value !== 0);
  if (whistChanges.length > 0) pieces.push(`В ${score.whists.map((value) => formatSigned(value)).join('/')}`);
  return pieces.join(' · ') || 'Без изменений';
}

function formatSigned(value: number): string {
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return value > 0 ? `+${formatted}` : formatted;
}

function contractSummary(contract: DealResult['contract']): string {
  if (contract.type === 'allPass') return 'Распасы';
  if (contract.type === 'misere') return 'Мизер';
  return `${contract.level} ${suitName(contract.suit)}`;
}

function trickSummary(tricks: DealResult['trickCounts'], players: GameState['players']): string {
  return tricks.map((count, index) => `${players[index].name} ${count}`).join(' · ');
}

function outcomeLabel(outcome: DealResult['outcome']): string {
  if (outcome.type === 'all-pass') return `Распасы: цена взятки ${outcome.trickValue}`;
  if (outcome.type === 'contract-made') return 'Контракт выполнен';
  if (outcome.type === 'contract-failed') return `Контракт не выполнен: недобор ${outcome.undertricks}`;
  if (outcome.type === 'misere-made') return 'Мизер сыгран';
  return `Мизер сорван: штраф ${outcome.penalty}`;
}

function visiblePhaseLabel(state: GameState): string {
  if (state.phase === 'bidding') return 'Торговля';
  if (state.phase === 'contract') {
    if (state.step === 'order') return 'Заказ игры';
    if (state.step === 'widow-pickup') return 'Прикуп';
    if (state.step === 'discard') return 'Снос';
    return 'Висты';
  }
  if (state.phase === 'play') {
    if (state.mode === 'all-pass') return 'Распасы';
    if (state.mode === 'misere') return 'Мизер';
    return 'Розыгрыш';
  }
  if (state.phase === 'deal-settlement') return 'Расчет сдачи';
  if (state.phase === 'next-deal') return 'Следующая сдача';
  return 'Итог пули';
}

function liveContractSummary(state: GameState): string | null {
  if (state.phase === 'bidding') return null;
  if (state.phase === 'next-deal') return null;
  if (state.phase === 'contract') return contractSummary(state.contract);
  if (state.phase === 'play' || state.phase === 'deal-settlement' || state.phase === 'finished') {
    return contractSummary(state.contract);
  }
  return null;
}

function liveDeclarerName(state: GameState): string | null {
  if (state.phase === 'contract') return state.players[state.declarer].name;
  if ((state.phase === 'play' || state.phase === 'deal-settlement' || state.phase === 'finished') && state.declarer !== null) {
    return state.players[state.declarer].name;
  }
  return null;
}

function liveTrumpName(state: GameState): string | null {
  if (state.phase === 'play' || state.phase === 'deal-settlement' || state.phase === 'finished') {
    return state.trump ? suitName(state.trump) : null;
  }
  return null;
}

function liveTrickSummary(state: GameState): string | null {
  if (state.phase !== 'play' && state.phase !== 'deal-settlement' && state.phase !== 'finished') {
    return null;
  }
  if (state.currentTrick.length === 0) {
    return 'Пусто';
  }
  return state.currentTrick.map((play) => `${state.players[play.player].name}: ${cardLabel(play.card)}`).join(' · ');
}

function humanCards(state: GameState): string {
  const cards =
    state.phase === 'contract' && state.step === 'discard' && state.players[state.actor].kind === 'human'
      ? state.hands[state.actor]
      : state.hands[0];

  return cards
    .map((card) => {
      const discardAttr =
        state.phase === 'contract' && state.step === 'discard'
          ? ` data-discard-card-id="${escapeAttribute(card.id)}" aria-pressed="false"`
          : '';
      const label =
        state.phase === 'contract' && state.step === 'discard'
          ? `Выбрать в снос: ${cardLabel(card)}`
          : cardLabel(card);
      return `<button class="card ${cardTone(card.suit)}" data-card-id="${escapeAttribute(card.id)}"${discardAttr} aria-label="${escapeAttribute(label)}">${cardFace(card)}</button>`;
    })
    .join('');
}

function renderActions(actions: Element, legal: GameAction[], handlers: RenderHandlers, state: GameState): void {
  const tableControlPhase = state.phase === 'deal-settlement' || state.phase === 'next-deal';
  if (state.players[state.actor].kind !== 'human' && !tableControlPhase) {
    return;
  }

  if (state.phase === 'contract' && state.step === 'discard') {
    renderContractActions(actions);
    return;
  }

  const commandActions = legal.filter((action) => action.type === 'pass' || action.type === 'bidMisere');
  const bidActions = legal.filter((action) => action.type === 'bidGame');
  const orderActions = legal.filter((action) => action.type === 'orderContract');
  const otherActions = legal.filter((action) => action.type !== 'playCard' && action.type !== 'pass' && action.type !== 'bidMisere' && action.type !== 'bidGame');

  if (commandActions.length > 0) {
    const row = document.createElement('div');
    row.className = 'action-row';
    for (const action of commandActions) {
      row.append(actionButton(action, handlers, action.type === 'pass' ? 'action-secondary' : 'action-primary'));
    }
    actions.append(row);
  }

  if (bidActions.length > 0) {
    const group = document.createElement('div');
    group.className = 'bid-group';
    const title = document.createElement('div');
    title.className = 'bid-title';
    title.textContent = 'Ставка';
    group.append(title);

    const grid = document.createElement('div');
    grid.className = 'bid-grid';
    for (const action of bidActions) {
      grid.append(actionButton(action, handlers, `bid-button ${cardTone(action.bid.suit)}`));
    }
    group.append(grid);
    actions.append(group);
  }

  if (orderActions.length > 0) {
    const group = document.createElement('div');
    group.className = 'contract-order-group';
    const title = document.createElement('div');
    title.className = 'bid-title';
    title.textContent = 'Заказ';
    group.append(title);

    const grid = document.createElement('div');
    grid.className = 'contract-order-grid';
    for (const action of orderActions) {
      grid.append(actionButton(action, handlers, `contract-order-button ${contractTone(action.contract)}`));
    }
    group.append(grid);
    actions.append(group);
  }

  for (const action of otherActions.filter((action) => action.type !== 'orderContract')) {
    actions.append(actionButton(action, handlers, 'action-primary'));
  }
}

function renderContractActions(actions: Element): void {
  const panel = document.createElement('div');
  panel.className = 'contract-controls';

  const hint = document.createElement('p');
  hint.className = 'action-note discard-count';
  hint.textContent = 'Снос: выберите 2 карты';
  panel.append(hint);

  const button = document.createElement('button');
  button.className = 'action-primary';
  button.dataset.actionType = 'discardCards';
  button.dataset.actionKey = 'discardCards:pending';
  button.textContent = 'Подтвердить снос';
  button.setAttribute('aria-label', 'Подтвердить снос 2 выбранных карт');
  button.disabled = true;
  panel.append(button);

  actions.append(panel);
}

function setupDiscardSelection(
  root: HTMLElement,
  state: ContractState,
  handlers: RenderHandlers
): void {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-discard-card-id]'));
  const orderButton = root.querySelector<HTMLButtonElement>('[data-action-type="discardCards"]');
  const count = root.querySelector<HTMLElement>('.discard-count');
  const discardableIds = new Set<Card['id']>(state.hands[state.actor].map((card) => card.id));
  const legalDiscards = getLegalActions(state).filter(
    (action): action is Extract<GameAction, { type: 'discardCards' }> => action.type === 'discardCards'
  );
  const selected = new Set<Card['id']>();

  const update = () => {
    const selectedCount = selected.size;
    if (count) count.textContent = selectedCount === 2 ? 'Снос выбран: 2 карты' : `Снос: выберите ${2 - selectedCount} карты`;
    const discard = Array.from(selected);
    const legalDiscard =
      selectedCount === 2
        ? legalDiscards.find((action) => sameCardIds(action.cardIds, discard))
        : undefined;
    if (orderButton) {
      orderButton.disabled = !legalDiscard;
      orderButton.dataset.actionKey = legalDiscard ? actionKey(legalDiscard) : 'discardCards:pending';
    }
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const cardId = button.dataset.discardCardId;
      if (!isDiscardableCardId(cardId, discardableIds)) return;
      if (selected.has(cardId)) {
        selected.delete(cardId);
        button.classList.remove('selected-discard');
        button.setAttribute('aria-pressed', 'false');
      } else if (selected.size < 2) {
        selected.add(cardId);
        button.classList.add('selected-discard');
        button.setAttribute('aria-pressed', 'true');
      }
      const card = state.hands[state.actor].find((candidate) => candidate.id === cardId);
      if (card) {
        button.setAttribute(
          'aria-label',
          selected.has(cardId) ? `Убрать из сноса: ${cardLabel(card)}` : `Выбрать в снос: ${cardLabel(card)}`
        );
      }
      update();
    });
  }

  orderButton?.addEventListener('click', () => {
    const discard = Array.from(selected);
    if (discard.length !== 2) return;
    const legalDiscard = legalDiscards.find((action) => sameCardIds(action.cardIds, discard));
    if (legalDiscard) handlers.onAction(legalDiscard);
  });
}

function isDiscardableCardId(cardId: string | undefined, discardableIds: Set<Card['id']>): cardId is Card['id'] {
  return cardId !== undefined && discardableIds.has(cardId as Card['id']);
}

function actionButton(action: GameAction, handlers: RenderHandlers, className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = className;
  button.dataset.actionType = action.type;
  button.dataset.actionKey = actionKey(action);
  button.textContent = actionLabel(action);
  button.setAttribute('aria-label', actionAccessibleLabel(action));
  button.addEventListener('click', () => handlers.onAction(action));
  return button;
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

function contractKey(contract: ContractState['contract']): string {
  if (contract.type === 'misere') return 'misere';
  return `${contract.level}-${contract.suit}`;
}

function sameCardIds(left: readonly Card['id'][], right: readonly Card['id'][]): boolean {
  return left.length === right.length && left.every((cardId) => right.includes(cardId));
}

function actionLabel(action: GameAction): string {
  if (action.type === 'pass') return 'Пас';
  if (action.type === 'check') return 'Чек';
  if (action.type === 'whist') return 'Вист';
  if (action.type === 'halfWhist') return 'Полвиста';
  if (action.type === 'bidMisere') return 'Мизер';
  if (action.type === 'bidGame') return `${action.bid.level}${suitSymbol(action.bid.suit)}`;
  if (action.type === 'orderContract') return orderContractLabel(action.contract);
  if (action.type === 'pickupWidow') return 'Взять прикуп';
  if (action.type === 'discardCards') return 'Снести 2 карты';
  if (action.type === 'settleDeal') return 'Подсчитать';
  if (action.type === 'startNextDeal') return 'Следующая сдача';
  return 'Ход';
}

function orderContractLabel(contract: ContractState['contract']): string {
  if (contract.type === 'misere') return 'Мизер';
  return `${contract.level}${suitSymbol(contract.suit)}`;
}

function contractTone(contract: ContractState['contract']): string {
  return contract.type === 'misere' ? 'action-primary' : cardTone(contract.suit);
}

function actionAccessibleLabel(action: GameAction): string {
  if (action.type === 'bidGame') return `Ставка ${action.bid.level} ${suitName(action.bid.suit)}`;
  if (action.type === 'orderContract') {
    if (action.contract.type === 'misere') return 'Заказать мизер';
    return `Заказать ${action.contract.level} ${suitName(action.contract.suit)}`;
  }
  if (action.type === 'discardCards') return 'Подтвердить снос 2 выбранных карт';
  if (action.type === 'playCard') return `Сыграть карту ${action.cardId}`;
  return actionLabel(action);
}

function cardBack(extraClass = '', extraAttributes = ''): string {
  return `
    <span class="card card-back ${extraClass}" ${extraAttributes} aria-hidden="true">
      <svg class="card-art" viewBox="0 0 72 104" focusable="false">
        <rect class="card-back-base" x="3" y="3" width="66" height="98" rx="5" />
        <path class="card-back-line" d="M12 14h48v76H12z" />
        <path class="card-back-mark" d="M36 24l14 14-14 14-14-14zM36 52l14 14-14 14-14-14z" />
      </svg>
    </span>
  `;
}

function cardFace(card: Card): string {
  const rank = rankLabel(card.rank);
  const suit = suitSymbol(card.suit);
  const pips = pipPositions(card.rank)
    .map((pip) => `<text x="${pip.x}" y="${pip.y}" class="pip">${suit}</text>`)
    .join('');

  return `
    <svg class="card-art" viewBox="0 0 72 104" focusable="false">
      <rect class="card-face-base" x="3" y="3" width="66" height="98" rx="5" />
      <text x="12" y="18" class="corner-rank">${rank}</text>
      <text x="12" y="31" class="corner-suit">${suit}</text>
      <g class="pips">${pips}</g>
      <g transform="rotate(180 36 52)">
        <text x="12" y="18" class="corner-rank">${rank}</text>
        <text x="12" y="31" class="corner-suit">${suit}</text>
      </g>
    </svg>
  `;
}

function pipPositions(rank: Card['rank']): { x: number; y: number }[] {
  if (rank === 'ace') return [{ x: 36, y: 58 }];
  if (rank === 'king' || rank === 'queen' || rank === 'jack') {
    return [
      { x: 36, y: 45 },
      { x: 36, y: 66 }
    ];
  }

  const count = Number(rank);
  const layouts: Record<number, { x: number; y: number }[]> = {
    7: [
      { x: 26, y: 32 },
      { x: 46, y: 32 },
      { x: 26, y: 48 },
      { x: 46, y: 48 },
      { x: 26, y: 66 },
      { x: 46, y: 66 },
      { x: 36, y: 82 }
    ],
    8: [
      { x: 26, y: 30 },
      { x: 46, y: 30 },
      { x: 26, y: 45 },
      { x: 46, y: 45 },
      { x: 26, y: 62 },
      { x: 46, y: 62 },
      { x: 26, y: 78 },
      { x: 46, y: 78 }
    ],
    9: [
      { x: 26, y: 29 },
      { x: 46, y: 29 },
      { x: 26, y: 44 },
      { x: 46, y: 44 },
      { x: 36, y: 55 },
      { x: 26, y: 66 },
      { x: 46, y: 66 },
      { x: 26, y: 81 },
      { x: 46, y: 81 }
    ],
    10: [
      { x: 26, y: 28 },
      { x: 46, y: 28 },
      { x: 36, y: 39 },
      { x: 26, y: 49 },
      { x: 46, y: 49 },
      { x: 26, y: 62 },
      { x: 46, y: 62 },
      { x: 36, y: 72 },
      { x: 26, y: 83 },
      { x: 46, y: 83 }
    ]
  };
  return layouts[count] ?? [{ x: 36, y: 58 }];
}

function rankLabel(rank: Card['rank']): string {
  if (rank === 'ace') return 'A';
  if (rank === 'king') return 'K';
  if (rank === 'queen') return 'Q';
  if (rank === 'jack') return 'J';
  return rank;
}

function suitSymbol(suit: Suit): string {
  if (suit === 'spades') return '♠';
  if (suit === 'clubs') return '♣';
  if (suit === 'diamonds') return '♦';
  return '♥';
}

function cardTone(suit: Suit): string {
  return suit === 'hearts' || suit === 'diamonds' ? 'card-red' : 'card-black';
}

function cardLabel(card: Card): string {
  return `${rankLabel(card.rank)} ${suitName(card.suit)}`;
}

function suitName(suit: Suit): string {
  if (suit === 'spades') return 'пики';
  if (suit === 'clubs') return 'трефы';
  if (suit === 'diamonds') return 'бубны';
  return 'червы';
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value: string | number): string {
  return escapeHtml(value).replaceAll('`', '&#96;');
}
