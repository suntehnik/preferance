import { ranks, suits } from '../domain/cards';
import { defaultRules, type RulesConfig } from '../domain/rules';
import type { GameState } from '../domain/state';

const saveKey = 'marriage.save.v1';
const playerIds = [0, 1, 2] as const;
const levels = [6, 7, 8, 9, 10] as const;

export const SUPPORTED_BULLET_SIZES = [10, 20, 30] as const;

export type SupportedBulletSize = (typeof SUPPORTED_BULLET_SIZES)[number];

export type TechnicalDealHistoryEntry = {
  seed: number;
  phase: GameState['phase'];
  dealer: GameState['dealer'];
  actor: GameState['actor'];
  contract: string | null;
  scoreTable: GameState['scores'];
};

export type ActiveBulletSave = {
  schema: 1;
  activeBulletSettings: {
    bulletSize: SupportedBulletSize;
    rules?: RulesConfig;
  };
  currentDeal: GameState;
  scoreTable: GameState['scores'];
  technicalDealHistory: TechnicalDealHistoryEntry[];
};

export type SaveGameOptions = {
  bulletSize?: SupportedBulletSize;
  technicalDealHistory?: TechnicalDealHistoryEntry[];
  replaceActiveBullet?: boolean;
};

export function saveGame(state: GameState, options: SaveGameOptions = {}): void {
  const previous = options.replaceActiveBullet ? null : readStoredActiveBullet({ includeFinished: true });
  const bulletSize = options.bulletSize ?? previous?.activeBulletSettings.bulletSize ?? 10;
  if (!isSupportedBulletSize(bulletSize)) {
    throw new Error(`Unsupported bullet size ${bulletSize}`);
  }
  const technicalDealHistory =
    options.technicalDealHistory ?? appendDealHistory(previous?.technicalDealHistory ?? [], createDealHistoryEntry(state));
  const envelope: ActiveBulletSave = {
    schema: 1,
    activeBulletSettings: { bulletSize, rules: state.rules ?? defaultRules },
    currentDeal: state,
    scoreTable: state.scores,
    technicalDealHistory
  };
  localStorage.setItem(saveKey, JSON.stringify(envelope));
}

export function loadGame(): GameState | null {
  return loadActiveBullet()?.currentDeal ?? null;
}

export function loadActiveBullet(): ActiveBulletSave | null {
  return readStoredActiveBullet({ includeFinished: false });
}

function readStoredActiveBullet(options: { includeFinished: boolean }): ActiveBulletSave | null {
  const raw = localStorage.getItem(saveKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const save = normalizeSaveEnvelope(parsed);
    if (
      !save ||
      (!options.includeFinished &&
        (save.currentDeal.phase === 'finished' || isBulletTargetComplete(save.scoreTable, save.activeBulletSettings.bulletSize)))
    ) {
      return null;
    }
    return save;
  } catch {
    return null;
  }
}

function isSupportedBulletSize(value: unknown): value is SupportedBulletSize {
  return SUPPORTED_BULLET_SIZES.includes(value as SupportedBulletSize);
}

function createDealHistoryEntry(state: GameState): TechnicalDealHistoryEntry {
  return {
    seed: state.seed,
    phase: state.phase,
    dealer: state.dealer,
    actor: state.actor,
    contract: 'contract' in state ? formatStoredContract(state.contract) : null,
    scoreTable: state.scores
  };
}

function appendDealHistory(
  history: TechnicalDealHistoryEntry[],
  nextEntry: TechnicalDealHistoryEntry
): TechnicalDealHistoryEntry[] {
  return [...history, nextEntry];
}

function isBulletTargetComplete(scoreTable: GameState['scores'], bulletSize: SupportedBulletSize): boolean {
  return scoreTable.every((score) => score.bullet >= bulletSize);
}

function normalizeSaveEnvelope(value: unknown): ActiveBulletSave | null {
  if (isActiveBulletSave(value)) return value;
  const activeSave = normalizeActiveBulletSave(value);
  if (activeSave) return activeSave;
  const legacyState = normalizeLegacySaveState(value);
  if (legacyState) {
    return {
      schema: 1,
      activeBulletSettings: { bulletSize: 10, rules: legacyState.rules ?? defaultRules },
      currentDeal: legacyState,
      scoreTable: legacyState.scores,
      technicalDealHistory: [createDealHistoryEntry(legacyState)]
    };
  }
  return null;
}

function normalizeActiveBulletSave(value: unknown): ActiveBulletSave | null {
  if (
    !isRecord(value) ||
    value.schema !== 1 ||
    !isRecord(value.activeBulletSettings) ||
    !isSupportedBulletSize(value.activeBulletSettings.bulletSize) ||
    !isScores(value.scoreTable) ||
    !isTechnicalDealHistory(value.technicalDealHistory)
  ) {
    return null;
  }
  const currentDeal = normalizeGameState(value.currentDeal);
  if (!currentDeal || !scoresEqual(value.scoreTable, currentDeal.scores)) {
    return null;
  }
  const technicalDealHistory = value.technicalDealHistory as TechnicalDealHistoryEntry[];
  return {
    schema: 1,
    activeBulletSettings: {
      bulletSize: value.activeBulletSettings.bulletSize,
      rules: isRulesConfig(value.activeBulletSettings.rules) ? value.activeBulletSettings.rules : currentDeal.rules ?? defaultRules
    },
    currentDeal: { ...currentDeal, rules: currentDeal.rules ?? defaultRules },
    scoreTable: currentDeal.scores,
    technicalDealHistory
  };
}

function normalizeLegacySaveState(value: unknown): GameState | null {
  if (!isRecord(value) || value.schema !== 1 || !('state' in value)) {
    return null;
  }
  return normalizeGameState(value.state);
}

function normalizeGameState(value: unknown): GameState | null {
  if (isGameState(value)) return value;
  if (!isRecord(value) || 'bulletTarget' in value) return null;
  return normalizePreRuleEngineState(value);
}

function normalizePreRuleEngineState(value: Record<string, unknown>): GameState | null {
  const withBulletTarget: Record<string, unknown> = { ...value, bulletTarget: 10 };
  if (withBulletTarget['phase'] === 'contract') {
    const declarer = withBulletTarget['declarer'];
    if (!isPlayerId(declarer)) return null;
    const contractState = {
      ...withBulletTarget,
      step: 'order',
      defenderOrder: [nextPlayerId(declarer), nextPlayerId(nextPlayerId(declarer))],
      whistResponses: [null, null]
    };
    return isGameState(contractState) ? contractState : null;
  }
  if (withBulletTarget['phase'] === 'play') {
    const playState = {
      ...withBulletTarget,
      mode: inferPlayMode(withBulletTarget['contract']),
      whistResponses: [null, null]
    };
    return isGameState(playState) ? playState : null;
  }
  return isGameState(withBulletTarget) ? withBulletTarget : null;
}

function nextPlayerId(player: 0 | 1 | 2): 0 | 1 | 2 {
  return ((player + 1) % 3) as 0 | 1 | 2;
}

function inferPlayMode(contract: unknown): 'all-pass' | 'contract' | 'misere' | null {
  if (!isRecord(contract)) return null;
  if (contract.type === 'allPass') return 'all-pass';
  if (contract.type === 'misere') return 'misere';
  if (contract.type === 'game') return 'contract';
  return null;
}

function formatStoredContract(contract: unknown): string | null {
  if (!isRecord(contract)) return null;
  if (contract.type === 'allPass') return 'allPass';
  if (contract.type === 'misere') return 'misere';
  if (contract.type === 'game' && typeof contract.level === 'number' && typeof contract.suit === 'string') {
    return `${contract.level}-${contract.suit}`;
  }
  return null;
}

function isGameState(value: unknown): value is GameState {
  if (!isRecord(value)) return false;
  return (
    isValidPhase(value.phase) &&
    typeof value.seed === 'number' &&
    typeof value.bulletTarget === 'number' &&
    Number.isFinite(value.bulletTarget) &&
    isPlayers(value.players) &&
    isPlayerId(value.dealer) &&
    isPlayerId(value.actor) &&
    isHands(value.hands) &&
    isCardArray(value.widow) &&
    isScores(value.scores) &&
    (!('scoreSheet' in value) || isScoreSheet(value.scoreSheet)) &&
    typeof value.allPassCount === 'number' &&
    Array.isArray(value.log) &&
    value.log.every((entry) => typeof entry === 'string') &&
    isPhaseShape(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isActiveBulletSave(value: unknown): value is ActiveBulletSave {
  return (
    isRecord(value) &&
    value.schema === 1 &&
    isRecord(value.activeBulletSettings) &&
    isSupportedBulletSize(value.activeBulletSettings.bulletSize) &&
    (!('rules' in value.activeBulletSettings) || isRulesConfig(value.activeBulletSettings.rules)) &&
    isGameState(value.currentDeal) &&
    isScores(value.scoreTable) &&
    scoresEqual(value.scoreTable, value.currentDeal.scores) &&
    isTechnicalDealHistory(value.technicalDealHistory)
  );
}

function isRulesConfig(value: unknown): value is RulesConfig {
  return (
    isRecord(value) &&
    typeof value.mandatoryWhistOnSixSpades === 'boolean' &&
    typeof value.tenGameIsChecked === 'boolean' &&
    typeof value.responsibleWhist === 'boolean' &&
    typeof value.progressiveAllPass === 'boolean'
  );
}

function isPlayerId(value: unknown): value is 0 | 1 | 2 {
  return value === 0 || value === 1 || value === 2;
}

function isPlayers(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (player, index) =>
        isRecord(player) &&
        player.id === playerIds[index] &&
        typeof player.name === 'string' &&
        (player.kind === 'human' || player.kind === 'ai')
    )
  );
}

function isHands(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && value.every(isCardArray);
}

function isCardArray(value: unknown): boolean {
  return Array.isArray(value) && value.every(isCard);
}

function isCard(value: unknown): boolean {
  return (
    isRecord(value) &&
    suits.includes(value.suit as never) &&
    ranks.includes(value.rank as never) &&
    value.id === `${value.suit}-${value.rank}`
  );
}

function isScores(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (score) =>
        isRecord(score) &&
        typeof score.bullet === 'number' &&
        typeof score.mountain === 'number' &&
        Array.isArray(score.whists) &&
        score.whists.length === 3 &&
        score.whists.every((whist) => typeof whist === 'number')
    )
  );
}

function isScoreSheet(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        Array.isArray(entry.bullet) &&
        entry.bullet.every((item) => typeof item === 'number') &&
        Array.isArray(entry.mountain) &&
        entry.mountain.every((item) => typeof item === 'number') &&
        Array.isArray(entry.whists) &&
        entry.whists.length === 3 &&
        entry.whists.every((items) => Array.isArray(items) && items.every((item) => typeof item === 'number'))
    )
  );
}

function isTechnicalDealHistory(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.seed === 'number' &&
        isValidPhase(entry.phase) &&
        isPlayerId(entry.dealer) &&
        isPlayerId(entry.actor) &&
        (entry.contract === null || typeof entry.contract === 'string') &&
        isScores(entry.scoreTable)
    )
  );
}

function scoresEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isValidPhase(value: unknown): value is GameState['phase'] {
  return (
    value === 'bidding' ||
    value === 'contract' ||
    value === 'play' ||
    value === 'deal-settlement' ||
    value === 'next-deal' ||
    value === 'finished'
  );
}

function isBid(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === 'misere') return true;
  return value.type === 'game' && levels.includes(value.level as never) && suits.includes(value.suit as never);
}

function isContract(value: unknown): boolean {
  return isBid(value) || (isRecord(value) && value.type === 'allPass');
}

function isTrick(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => isRecord(entry) && isPlayerId(entry.player) && isCard(entry.card));
}

function isTricksTaken(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && value.every((tricks) => typeof tricks === 'number');
}

function isPassed(value: unknown): boolean {
  return Array.isArray(value) && value.every(isPlayerId);
}

function isTrump(value: unknown): boolean {
  return value === null || suits.includes(value as never);
}

function isContractStep(value: unknown): boolean {
  return value === 'order' || value === 'widow-pickup' || value === 'discard' || value === 'whist-decision';
}

function isPlayMode(value: unknown): boolean {
  return value === 'all-pass' || value === 'contract' || value === 'misere';
}

function isDefenderOrder(value: unknown): boolean {
  return Array.isArray(value) && value.length === 2 && value.every(isPlayerId) && value[0] !== value[1];
}

function isWhistResponse(value: unknown): boolean {
  return value === null || value === 'whist' || value === 'half-whist' || value === 'pass' || value === 'check';
}

function isWhistResponses(value: unknown): boolean {
  return Array.isArray(value) && value.length === 2 && value.every(isWhistResponse);
}

function isPlayLikePhaseShape(value: Record<string, unknown>): boolean {
  return (
    isPlayMode(value.mode) &&
    isContract(value.contract) &&
    (value.declarer === null || isPlayerId(value.declarer)) &&
    isTrump(value.trump) &&
    isTrick(value.currentTrick) &&
    isTricksTaken(value.tricksTaken) &&
    isWhistResponses(value.whistResponses)
  );
}

function isPhaseShape(value: Record<string, unknown>): boolean {
  if (value.phase === 'bidding') {
    return (
      'currentBid' in value &&
      (value.currentBid === null || isBid(value.currentBid)) &&
      'bidWinner' in value &&
      (value.bidWinner === null || isPlayerId(value.bidWinner)) &&
      isPassed(value.passed)
    );
  }
  if (value.phase === 'contract') {
    return (
      isContractStep(value.step) &&
      isBid(value.contract) &&
      isPlayerId(value.declarer) &&
      isDefenderOrder(value.defenderOrder) &&
      isWhistResponses(value.whistResponses)
    );
  }
  if (value.phase === 'play') {
    return isPlayLikePhaseShape(value);
  }
  if (value.phase === 'deal-settlement') {
    return isPlayLikePhaseShape(value) && typeof value.settlementSummary === 'string';
  }
  if (value.phase === 'next-deal') {
    return typeof value.previousSummary === 'string';
  }
  return (
    isContract(value.contract) &&
    (value.declarer === null || isPlayerId(value.declarer)) &&
    isTrump(value.trump) &&
    isTrick(value.currentTrick) &&
    isTricksTaken(value.tricksTaken) &&
    typeof value.winnerSummary === 'string'
  );
}
