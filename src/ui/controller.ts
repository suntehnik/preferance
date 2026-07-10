import { chooseAiAction } from '../ai/heuristicAi';
import { applyAction, createNewGame } from '../domain/engine';
import type { Card } from '../domain/cards';
import type { GameAction, GameState } from '../domain/state';
import {
  loadActiveBullet,
  saveGame,
  SUPPORTED_BULLET_SIZES,
  type ActiveBulletSave,
  type SupportedBulletSize
} from '../persistence/saveStore';
import { renderGame, renderStartScreen, type RenderView } from './render';
import { defaultRules, type RulesConfig } from '../domain/rules';

const AI_TURN_DELAY_MS = 700;
const POST_DEAL_DELAY_MS = 850;

export function startApp(root: HTMLElement): void {
  let state: GameState | null = null;
  let bulletSize: SupportedBulletSize = loadActiveBullet()?.activeBulletSettings.bulletSize ?? 10;
  let view: RenderView = {};
  let aiTimer: ReturnType<typeof window.setTimeout> | null = null;
  let aiGuard = 0;

  const clearAiTimer = () => {
    if (aiTimer !== null) {
      window.clearTimeout(aiTimer);
      aiTimer = null;
    }
  };

  const commit = (next: GameState, nextView: RenderView = {}) => {
    clearAiTimer();
    state = next;
    view = nextView;
    saveGame(state, { bulletSize });
    renderGameScreen();
    scheduleAiTurn();
  };

  const handleAction = (action: GameAction) => {
    if (!state || view.pause) return;
    try {
      const before = state;
      const next = applyAction(state, action);
      commit(next, visualFeedbackForAction(before, action, next));
    } catch (error) {
      console.warn('Action could not be applied', error);
      state = appendLog(state, 'Action is not available yet');
      view = {};
      saveGame(state, { bulletSize });
      renderGameScreen();
      scheduleAiTurn();
    }
  };

  const startNewBullet = (selectedBulletSize: SupportedBulletSize, rules: RulesConfig = defaultRules) => {
    bulletSize = selectedBulletSize;
    clearAiTimer();
    state = createNewGame(Date.now() % 100000, selectedBulletSize, rules);
    view = { tableMotion: 'deal' };
    saveGame(state, { bulletSize, replaceActiveBullet: true });
    renderGameScreen();
    scheduleAiTurn(POST_DEAL_DELAY_MS);
  };

  const continueBullet = (saved: ActiveBulletSave) => {
    bulletSize = saved.activeBulletSettings.bulletSize;
    clearAiTimer();
    state = saved.currentDeal;
    view = {};
    renderGameScreen();
    scheduleAiTurn();
  };

  const continuePause = () => {
    if (!state || !view.pause) return;
    if (state.phase === 'contract' && state.step === 'widow-pickup') {
      const before = state;
      const action: GameAction = { type: 'pickupWidow' };
      const next = applyAction(before, action);
      commit(next, visualFeedbackForAction(before, action, next));
      return;
    }
    view = {};
    renderGameScreen();
    scheduleAiTurn();
  };

  const renderGameScreen = () => {
    if (!state) return;
    renderGame(root, state, {
      onAction: handleAction,
      onNewGame: () => commit(createNewGame(Date.now() % 100000, bulletSize), { tableMotion: 'deal' }),
      onContinuePause: continuePause
    }, view);
  };

  const scheduleAiTurn = (delay = AI_TURN_DELAY_MS) => {
    if (!state || view.pause || !shouldAutoAct(state) || aiTimer !== null) return;
    aiTimer = window.setTimeout(() => {
      aiTimer = null;
      if (!state || view.pause || !shouldAutoAct(state)) return;
      try {
        const before = state;
        const action = chooseAiAction(before, before.seed + aiGuard);
        aiGuard += 1;
        const next = applyAction(before, action);
        commit(next, visualFeedbackForAction(before, action, next));
      } catch (error) {
        console.warn('AI turn stopped', error);
        state = appendLog(state, 'AI turn is waiting for the next engine task');
        view = {};
        saveGame(state, { bulletSize });
        renderGameScreen();
      }
    }, delay);
  };

  const saved = loadActiveBullet();
  renderStartScreen(root, SUPPORTED_BULLET_SIZES, saved, {
    onStart: startNewBullet,
    onContinue: saved ? () => continueBullet(saved) : undefined
  });
}

function shouldAutoAct(state: GameState): boolean {
  return state.players[state.actor]?.kind === 'ai' && (state.phase === 'bidding' || state.phase === 'contract' || state.phase === 'play');
}

function visualFeedbackForAction(before: GameState, action: GameAction, next: GameState): RenderView {
  const view: RenderView = {};

  if (before.phase === 'bidding') {
    view.biddingBubbles = [{ player: before.actor, text: actionSummary(action) }];
  }

  if (before.phase === 'contract' && before.step === 'whist-decision') {
    view.biddingBubbles = [{ player: before.actor, text: actionSummary(action) }];
  }

  if (action.type === 'playCard' && before.phase === 'play') {
    view.playedCardId = action.cardId;
    view.tableMotion = 'card';
    if (before.currentTrick.length === 2) {
      const played = findCard(before.hands[before.actor], action.cardId);
      if (played) {
        view.completedTrick = [...before.currentTrick, { player: before.actor, card: played }];
        view.pause = {
          kind: 'trick-complete',
          message: 'Посмотрите карты взятки'
        };
      }
    }
  }

  if (action.type === 'pickupWidow' && before.phase === 'contract' && before.step === 'widow-pickup') {
    view.widowPickup = {
      player: before.declarer,
      cards: before.widow
    };
  }

  if (next.phase === 'contract' && next.step === 'widow-pickup' && before.phase === 'bidding') {
    view.pause = {
      kind: 'widow-reveal',
      message: 'Прикуп открыт'
    };
  }

  if (action.type === 'startNextDeal') {
    view.tableMotion = 'deal';
  }

  return view;
}

function findCard(hand: readonly Card[], cardId: Card['id']): Card | undefined {
  return hand.find((card) => card.id === cardId);
}

function actionSummary(action: GameAction): string {
  if (action.type === 'pass') return 'Пас';
  if (action.type === 'bidMisere') return 'Мизер';
  if (action.type === 'bidGame') return `${action.bid.level}${suitSymbol(action.bid.suit)}`;
  if (action.type === 'whist') return 'Вист';
  if (action.type === 'halfWhist') return 'Полвиста';
  if (action.type === 'check') return 'Чек';
  return 'Ход';
}

function suitSymbol(suit: Card['suit']): string {
  if (suit === 'spades') return '♠';
  if (suit === 'clubs') return '♣';
  if (suit === 'diamonds') return '♦';
  return '♥';
}

function appendLog(state: GameState, line: string): GameState {
  return { ...state, log: [...state.log, line] };
}
