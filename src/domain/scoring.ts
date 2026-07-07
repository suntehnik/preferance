import { contractBulletValue, type Bid } from './rules';
import type { DealResult, FinalResult, FinalRankingEntry, PlayerId, Score, WhistAdjustment, WhistResponse } from './state';

export function scoreSuccessfulContract(scores: readonly [Score, Score, Score], declarer: PlayerId, contract: Bid) {
  const next = cloneScores(scores);
  next[declarer].bullet += contractBulletValue(contract);
  return next;
}

export function scoreAllPass(
  scores: readonly [Score, Score, Score],
  tricksTaken: [number, number, number],
  allPassCount: number,
  progressive: boolean
) {
  const trickValue = progressive ? Math.min(allPassCount, 3) : 1;
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

export function settleDealResult(input: {
  mode: DealResult['mode'];
  contract: DealResult['contract'];
  declarer: PlayerId | null;
  tricksTaken: [number, number, number];
  whistResponses: [WhistResponse | null, WhistResponse | null];
  scores: readonly [Score, Score, Score];
  bulletTarget: number;
  allPassCount: number;
  progressiveAllPass: boolean;
}): DealResult {
  const scoresBefore = cloneScores(input.scores);
  const scoreDelta = zeroScoreDelta();
  const whistAdjustments: WhistAdjustment[] = [];
  let outcome: DealResult['outcome'];

  if (input.mode === 'all-pass') {
    const trickValue = input.progressiveAllPass ? Math.min(input.allPassCount, 3) : 1;
    outcome = { type: 'all-pass', trickValue };
  } else if (input.contract.type === 'misere') {
    if (input.declarer !== null && input.tricksTaken[input.declarer] === 0) {
      scoreDelta[input.declarer].bullet += 10;
      outcome = { type: 'misere-made', contractPoints: 10 };
    } else {
      const penalty = input.declarer === null ? 0 : input.tricksTaken[input.declarer] * 10;
      if (input.declarer !== null) {
        scoreDelta[input.declarer].mountain += penalty;
      }
      outcome = { type: 'misere-failed', penalty };
    }
  } else if (input.declarer !== null && input.contract.type === 'game') {
    if (input.tricksTaken[input.declarer] >= input.contract.level) {
      scoreDelta[input.declarer].bullet += contractBulletValue(input.contract);
      outcome = { type: 'contract-made', contractPoints: contractBulletValue(input.contract) };
    } else {
      const undertricks = input.contract.level - input.tricksTaken[input.declarer];
      scoreDelta[input.declarer].mountain += undertricks * contractBulletValue(input.contract);
      outcome = { type: 'contract-failed', undertricks };
    }
    applyWhists(scoreDelta, whistAdjustments, input.declarer, input.contract, input.tricksTaken, input.whistResponses);
  } else {
    outcome = { type: 'all-pass', trickValue: 0 };
  }

  if (input.mode === 'all-pass') {
    const trickValue = input.progressiveAllPass ? Math.min(input.allPassCount, 3) : 1;
    input.tricksTaken.forEach((tricks, index) => {
      if (tricks === 0) {
        scoreDelta[index as PlayerId].bullet += trickValue;
      } else {
        scoreDelta[index as PlayerId].mountain += tricks * trickValue;
      }
    });
    outcome = { type: 'all-pass', trickValue };
  }

  const scoresAfter = applyScoreDelta(scoresBefore, scoreDelta);
  const bulletTargetReached = scoresAfter.every((score) => score.bullet >= input.bulletTarget);

  return {
    mode: input.mode,
    contract: input.contract,
    declarer: input.declarer,
    trickCounts: [...input.tricksTaken] as [number, number, number],
    whistResponses: [...input.whistResponses] as [WhistResponse | null, WhistResponse | null],
    scoresBefore,
    scoreDelta,
    scoresAfter,
    whistAdjustments,
    outcome,
    bulletTarget: input.bulletTarget,
    bulletTargetReached,
    summary: buildDealSummary(input.contract, input.declarer, outcome, whistAdjustments)
  };
}

export function calculateFinalResult(scores: readonly [Score, Score, Score], bulletTarget: number): FinalResult {
  const averageMountain = scores.reduce((sum, score) => sum + score.mountain, 0) / scores.length;
  const ranking = scores
    .map((score, player) => {
      const netWhists = calculateNetWhists(scores, player as PlayerId);
      return {
        player: player as PlayerId,
        bullet: score.bullet,
        mountain: score.mountain,
        netWhists,
        finalWhists: netWhists - (score.mountain - averageMountain) * 10
      };
    })
    .sort((left, right) => {
      if (right.finalWhists !== left.finalWhists) return right.finalWhists - left.finalWhists;
      if (right.bullet !== left.bullet) return right.bullet - left.bullet;
      return left.player - right.player;
    }) as FinalRankingEntry[];

  const winner = ranking[0].player;
  return {
    bulletTarget,
    winner,
    ranking: ranking as [FinalRankingEntry, FinalRankingEntry, FinalRankingEntry],
    sortKey: 'final-whists-desc,bullet-desc,player-id-asc',
    summary: `Player ${winner} wins the final rating with ${formatSignedWhists(ranking[0].finalWhists)} whists.`
  };
}

function cloneScores(scores: readonly [Score, Score, Score]): [Score, Score, Score] {
  return scores.map((score) => ({
    bullet: score.bullet,
    mountain: score.mountain,
    whists: [...score.whists] as [number, number, number]
  })) as [Score, Score, Score];
}

function zeroScoreDelta(): [Score, Score, Score] {
  return [
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] },
    { bullet: 0, mountain: 0, whists: [0, 0, 0] }
  ];
}

function applyScoreDelta(
  scoresBefore: readonly [Score, Score, Score],
  scoreDelta: readonly [Score, Score, Score]
): [Score, Score, Score] {
  return scoresBefore.map((score, index) => ({
    bullet: score.bullet + scoreDelta[index].bullet,
    mountain: score.mountain + scoreDelta[index].mountain,
    whists: score.whists.map((value, pairIndex) => value + scoreDelta[index].whists[pairIndex]) as [number, number, number]
  })) as [Score, Score, Score];
}

function applyWhists(
  scoreDelta: [Score, Score, Score],
  whistAdjustments: WhistAdjustment[],
  declarer: PlayerId,
  contract: Extract<Bid, { type: 'game' }>,
  tricksTaken: [number, number, number],
  whistResponses: [WhistResponse | null, WhistResponse | null]
) {
  const defenders = [((declarer + 1) % 3) as PlayerId, ((declarer + 2) % 3) as PlayerId] as const;
  defenders.forEach((defender, index) => {
    const response = whistResponses[index];
    if (response !== 'whist' && response !== 'half-whist' && response !== 'check') return;
    const multiplier = response === 'half-whist' ? 0.5 : 1;
    const delta = tricksTaken[defender] * contractBulletValue(contract) * multiplier;
    if (delta === 0) return;
    scoreDelta[defender].whists[declarer] += delta;
    whistAdjustments.push({ defender, declarer, response, tricks: tricksTaken[defender], delta });
  });
}

function calculateNetWhists(scores: readonly [Score, Score, Score], player: PlayerId): number {
  const writtenByPlayer = scores[player].whists.reduce((sum, value, opponent) => (opponent === player ? sum : sum + value), 0);
  const writtenAgainstPlayer = scores.reduce((sum, score, opponent) => (opponent === player ? sum : sum + score.whists[player]), 0);
  return writtenByPlayer - writtenAgainstPlayer;
}

function formatSignedWhists(value: number): string {
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return value > 0 ? `+${rounded}` : rounded;
}

function buildDealSummary(
  contract: DealResult['contract'],
  declarer: PlayerId | null,
  outcome: DealResult['outcome'],
  whistAdjustments: WhistAdjustment[]
) {
  const actor = declarer === null ? 'No declarer' : `Player ${declarer}`;
  const base =
    outcome.type === 'all-pass'
      ? `All-pass settled at ${outcome.trickValue} per trick.`
      : outcome.type === 'contract-made'
        ? `${actor} made ${formatContract(contract)} for +${outcome.contractPoints} bullet.`
        : outcome.type === 'contract-failed'
          ? `${actor} failed ${formatContract(contract)} by ${outcome.undertricks} and takes +${
              outcome.undertricks * scoreValueForContract(contract)
            } mountain.`
          : outcome.type === 'misere-made'
            ? `${actor} made misere for +${outcome.contractPoints} bullet.`
            : `${actor} failed misere for +${outcome.penalty} mountain.`;

  if (whistAdjustments.length === 0) {
    return base;
  }

  const whistSummary = whistAdjustments
    .map((entry) => `P${entry.defender} ${entry.response} +${entry.delta} vs P${entry.declarer}`)
    .join('; ');
  return `${base} Whists: ${whistSummary}.`;
}

function formatContract(contract: DealResult['contract']) {
  if (contract.type === 'allPass') return 'all-pass';
  if (contract.type === 'misere') return 'misere';
  return `${contract.level} ${contract.suit}`;
}

function scoreValueForContract(contract: DealResult['contract']): number {
  return contract.type === 'allPass' ? 0 : contractBulletValue(contract);
}
