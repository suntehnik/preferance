import { chooseAiAction } from '../ai/heuristicAi';
import type { Card } from '../domain/cards';
import { applyAction, createNewGame, getLegalActions } from '../domain/engine';
import type { Bid } from '../domain/rules';
import type { GameAction, GameState } from '../domain/state';

export const deterministicSeeds = {
  fullBulletSmoke: 639,
  seededRuleScenario: 3301129,
  playwrightDesktopFlow: 3305331
} as const;

export const fixtureDeals = {
  fullBulletSmoke: {
    seed: deterministicSeeds.fullBulletSmoke,
    bulletTarget: 10,
    maxSteps: 2000,
    purpose: 'Deterministic full-bullet smoke run that reaches finished with the real engine and heuristic AI.'
  },
  seededRuleScenario: {
    seed: deterministicSeeds.seededRuleScenario,
    purpose: 'Stable deal for focused rule scenarios that need reproducible hands and widow cards.'
  },
  contractOrdering: {
    seed: 123,
    purpose: 'Existing contract-ordering path: human bids six spades, both opponents pass, declarer orders.'
  },
  playwrightDesktopFlow: {
    seed: deterministicSeeds.playwrightDesktopFlow,
    purpose: 'Stable seed for desktop UI flows once Playwright specs are added.'
  }
} as const;

export const localSmokeRunNotes = {
  viteDevServer: 'npm run dev # serves Vite on 127.0.0.1:5331 per package.json',
  viteBaseUrl: 'http://127.0.0.1:5331',
  playwrightDesktop:
    'Point future Playwright desktop specs at http://127.0.0.1:5331 with a fixed desktop viewport such as 1280x800.',
  smokeRunEntrypoint:
    'runDeterministicSmoke({ initialState: createNewGame(deterministicSeeds.fullBulletSmoke, fixtureDeals.fullBulletSmoke.bulletTarget), maxSteps: fixtureDeals.fullBulletSmoke.maxSteps })'
} as const;

export const playwrightDesktopHooks = {
  appRoot: '#app',
  gameShell: '.game-shell',
  actionsPanel: '.actions',
  statusLine: '.status-line',
  newDealButton: '[data-new-game]',
  cardButton: '[data-card-id]',
  discardCardButton: '[data-discard-card-id]',
  orderContractButton: '[data-order-contract]'
} as const;

export type FixtureDealName = keyof typeof fixtureDeals;

export type FixtureDealSnapshot = {
  name: FixtureDealName;
  seed: number;
  hands: [Card['id'][], Card['id'][], Card['id'][]];
  widow: [Card['id'], Card['id']];
};

export type HarnessStateSummary = {
  phase: GameState['phase'];
  actor: number;
  handSizes: [number, number, number];
  widowSize: number;
  currentTrickSize: number;
  contract: string | null;
  scores: [{ bullet: number; mountain: number }, { bullet: number; mountain: number }, { bullet: number; mountain: number }];
  logTail: string[];
};

export type HarnessTraceEntry = {
  step: number;
  legalActionCountBefore: number;
  phaseBefore: GameState['phase'];
  actorBefore: number;
  action: string;
  phaseAfter: GameState['phase'];
  actorAfter: number;
  handSizesAfter: [number, number, number];
  logLengthAfter: number;
};

export type SmokeRunStoppedReason = 'finished' | 'maxSteps' | 'noLegalActions';

export type SmokeRunResult = {
  seed: number;
  requestedSteps: number;
  completedSteps: number;
  stoppedReason: SmokeRunStoppedReason;
  trace: HarnessTraceEntry[];
  finalSummary: HarnessStateSummary;
};

export type HarnessStepContext = {
  seed: number;
  step: number;
  state: GameState;
  legalActions: GameAction[];
};

export type HarnessActionChooser = (context: HarnessStepContext) => GameAction;

export type SmokeRunOptions = {
  seed?: number;
  maxSteps?: number;
  initialState?: GameState;
  chooseAction?: HarnessActionChooser;
};

type HarnessContract = Bid | { type: 'allPass' };

export function createFixtureGame(name: FixtureDealName = 'seededRuleScenario'): GameState {
  return createNewGame(fixtureDeals[name].seed);
}

export function createFixtureDealSnapshot(name: FixtureDealName = 'seededRuleScenario'): FixtureDealSnapshot {
  const state = createFixtureGame(name);
  return {
    name,
    seed: state.seed,
    hands: state.hands.map((hand) => hand.map((card) => card.id)) as FixtureDealSnapshot['hands'],
    widow: [state.widow[0].id, state.widow[1].id]
  };
}

export function chooseDeterministicHarnessAction(context: HarnessStepContext): GameAction {
  return chooseAiAction(context.state, context.seed + context.step);
}

export function runDeterministicSmoke(options: SmokeRunOptions = {}): SmokeRunResult {
  const seed = options.seed ?? options.initialState?.seed ?? deterministicSeeds.fullBulletSmoke;
  const maxSteps = options.maxSteps ?? 20;
  if (!Number.isInteger(maxSteps) || maxSteps < 0) {
    throw new Error(`Smoke maxSteps must be a non-negative integer, got ${maxSteps}`);
  }

  const chooseAction = options.chooseAction ?? chooseDeterministicHarnessAction;
  let state = options.initialState ?? createNewGame(seed);
  const trace: HarnessTraceEntry[] = [];

  for (let step = 0; step < maxSteps; step += 1) {
    const legalActions = getLegalActions(state);
    if (legalActions.length === 0) {
      return resultFor(seed, maxSteps, 'noLegalActions', trace, state);
    }

    const before = summarizeState(state);
    let action: GameAction;
    try {
      action = chooseAction({ seed, step, state, legalActions });
    } catch (error) {
      throw new Error(buildHarnessFailureMessage({ seed, step, state, legalActions, trace, cause: error }), {
        cause: error
      });
    }
    assertLegalHarnessAction(action, legalActions, { seed, step, state, trace });
    try {
      state = applyAction(state, action);
    } catch (error) {
      throw new Error(
        buildHarnessFailureMessage({ seed, step, state, legalActions, chosenAction: action, trace, cause: error }),
        { cause: error }
      );
    }

    trace.push({
      step,
      legalActionCountBefore: legalActions.length,
      phaseBefore: before.phase,
      actorBefore: before.actor,
      action: formatAction(action),
      phaseAfter: state.phase,
      actorAfter: state.actor,
      handSizesAfter: handSizes(state),
      logLengthAfter: state.log.length
    });

    if (state.phase === 'finished') {
      return resultFor(seed, maxSteps, 'finished', trace, state);
    }
  }

  return resultFor(seed, maxSteps, 'maxSteps', trace, state);
}

export function summarizeState(state: GameState): HarnessStateSummary {
  return {
    phase: state.phase,
    actor: state.actor,
    handSizes: handSizes(state),
    widowSize: state.widow.length,
    currentTrickSize: 'currentTrick' in state ? state.currentTrick.length : 0,
    contract: 'contract' in state ? formatContract(state.contract) : null,
    scores: state.scores.map((score) => ({ bullet: score.bullet, mountain: score.mountain })) as HarnessStateSummary['scores'],
    logTail: state.log.slice(-3)
  };
}

function resultFor(
  seed: number,
  requestedSteps: number,
  stoppedReason: SmokeRunStoppedReason,
  trace: HarnessTraceEntry[],
  state: GameState
): SmokeRunResult {
  return {
    seed,
    requestedSteps,
    completedSteps: trace.length,
    stoppedReason,
    trace,
    finalSummary: summarizeState(state)
  };
}

function assertLegalHarnessAction(
  action: GameAction,
  legalActions: GameAction[],
  context: { seed: number; step: number; state: GameState; trace: HarnessTraceEntry[] }
): void {
  const actionKey = formatAction(action);
  if (!legalActions.some((legalAction) => formatAction(legalAction) === actionKey)) {
    throw new Error(
      buildHarnessFailureMessage({
        seed: context.seed,
        step: context.step,
        state: context.state,
        legalActions,
        chosenAction: action,
        trace: context.trace,
        cause: `illegal action ${actionKey}`
      })
    );
  }
}

function handSizes(state: GameState): [number, number, number] {
  return [state.hands[0].length, state.hands[1].length, state.hands[2].length];
}

function formatAction(action: GameAction): string {
  if (action.type === 'pass') return 'pass';
  if (action.type === 'check') return 'check';
  if (action.type === 'whist') return 'whist';
  if (action.type === 'halfWhist') return 'halfWhist';
  if (action.type === 'bidMisere') return 'bidMisere';
  if (action.type === 'bidGame') return `bidGame:${action.bid.level}-${action.bid.suit}`;
  if (action.type === 'orderContract') return `orderContract:${formatContract(action.contract)}`;
  if (action.type === 'pickupWidow') return 'pickupWidow';
  if (action.type === 'discardCards') return `discardCards:${action.cardIds.join(',')}`;
  if (action.type === 'settleDeal') return 'settleDeal';
  if (action.type === 'startNextDeal') return 'startNextDeal';
  return `playCard:${action.cardId}`;
}

function formatContract(contract: HarnessContract): string {
  if (contract.type === 'allPass') return 'allPass';
  if (contract.type === 'misere') return 'misere';
  return `${contract.level}-${contract.suit}`;
}

function buildHarnessFailureMessage(details: {
  seed: number;
  step: number;
  state: GameState;
  legalActions: GameAction[];
  trace: HarnessTraceEntry[];
  chosenAction?: GameAction;
  cause: unknown;
}): string {
  const traceSummary =
    details.trace.length === 0
      ? 'trace=none'
      : `trace=${details.trace
          .slice(-3)
          .map(
            (entry) =>
              `${entry.step}:${entry.phaseBefore}:${entry.actorBefore}:legalCount=${entry.legalActionCountBefore}:${entry.action}`
          )
          .join(' | ')}`;
  const legalSummary = details.legalActions.map(formatAction).join(',');
  const chosenSummary = details.chosenAction ? formatAction(details.chosenAction) : 'chooseAction-threw';
  const causeSummary = details.cause instanceof Error ? details.cause.message : String(details.cause);
  return [
    `AI smoke failure seed=${details.seed}`,
    `step=${details.step}`,
    `phase=${details.state.phase}`,
    `actor=${details.state.actor}`,
    `legalCount=${details.legalActions.length}`,
    `legal=${legalSummary}`,
    `chosen=${chosenSummary}`,
    traceSummary,
    `cause=${causeSummary}`
  ].join(' ');
}
