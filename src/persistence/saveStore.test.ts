import { beforeEach, describe, expect, it } from 'vitest';
import { createNewGame } from '../domain/engine';
import type { GameState } from '../domain/state';
import { loadActiveBullet, loadGame, saveGame, SUPPORTED_BULLET_SIZES } from './saveStore';

describe('saveStore', () => {
  beforeEach(() => localStorage.clear());

  it('returns no active bullet when localStorage is empty', () => {
    expect(loadActiveBullet()).toBeNull();
    expect(loadGame()).toBeNull();
  });

  it('round-trips a game through localStorage', () => {
    const game = createNewGame(44);
    saveGame(game);
    expect(loadGame()).toEqual(game);
  });

  it('stores a versioned active bullet envelope with settings, current deal, score table, and technical history', () => {
    const game = createNewGame(44);

    saveGame(game, { bulletSize: 20 });

    const saved = loadActiveBullet();
    expect(saved).not.toBeNull();
    expect(saved?.schema).toBe(1);
    expect(saved?.activeBulletSettings).toEqual({ bulletSize: 20 });
    expect(saved?.currentDeal).toEqual(game);
    expect(saved?.scoreTable).toEqual(game.scores);
    expect(saved?.technicalDealHistory).toEqual([
      {
        seed: game.seed,
        phase: game.phase,
        dealer: game.dealer,
        actor: game.actor,
        contract: null,
        scoreTable: game.scores
      }
    ]);
  });

  it('uses the supported bullet size list as the persistence source of truth', () => {
    expect(SUPPORTED_BULLET_SIZES).toEqual([10, 20, 30]);
    expect(() => saveGame(createNewGame(44), { bulletSize: 25 as never })).toThrow('Unsupported bullet size');
  });

  it('replaces the one active bullet slot when saving a new unfinished game', () => {
    const first = createNewGame(44);
    const second = createNewGame(45);

    saveGame(first, { bulletSize: 10 });
    saveGame(second, { bulletSize: 30 });

    const saved = loadActiveBullet();
    expect(saved?.activeBulletSettings).toEqual({ bulletSize: 30 });
    expect(saved?.currentDeal).toEqual(second);
    expect(saved?.currentDeal).not.toEqual(first);
    expect(loadGame()).toEqual(second);
  });

  it('can explicitly replace the active bullet without carrying old technical history', () => {
    const first = createNewGame(44);
    const second = createNewGame(45);

    saveGame(first, { bulletSize: 30 });
    saveGame(second, { bulletSize: 20, replaceActiveBullet: true });

    const saved = loadActiveBullet();
    expect(saved?.activeBulletSettings).toEqual({ bulletSize: 20 });
    expect(saved?.currentDeal).toEqual(second);
    expect(saved?.technicalDealHistory.map((entry) => entry.seed)).toEqual([45]);
  });

  it('preserves active bullet metadata when saving through the existing game-state API', () => {
    const first = createNewGame(44);
    const second = createNewGame(45);

    saveGame(first, { bulletSize: 30 });
    saveGame(second);

    const saved = loadActiveBullet();
    expect(saved?.activeBulletSettings).toEqual({ bulletSize: 30 });
    expect(saved?.currentDeal).toEqual(second);
    expect(saved?.technicalDealHistory.map((entry) => entry.seed)).toEqual([44, 45]);
  });

  it('migrates a legacy schema-one state envelope into the active bullet shape', () => {
    const game = createNewGame(44);
    localStorage.setItem('marriage.save.v1', JSON.stringify({ schema: 1, state: game }));

    const saved = loadActiveBullet();

    expect(saved?.activeBulletSettings).toEqual({ bulletSize: 10 });
    expect(saved?.currentDeal).toEqual(game);
    expect(saved?.scoreTable).toEqual(game.scores);
    expect(saved?.technicalDealHistory).toEqual([
      {
        seed: game.seed,
        phase: game.phase,
        dealer: game.dealer,
        actor: game.actor,
        contract: null,
        scoreTable: game.scores
      }
    ]);
  });

  it('migrates pre-rule-engine legacy state envelopes that do not include bulletTarget', () => {
    const { bulletTarget: _bulletTarget, ...legacyGame } = createNewGame(44);
    localStorage.setItem('marriage.save.v1', JSON.stringify({ schema: 1, state: legacyGame }));

    const saved = loadActiveBullet();

    expect(saved?.activeBulletSettings).toEqual({ bulletSize: 10 });
    expect(saved?.currentDeal).toEqual({ ...legacyGame, bulletTarget: 10 });
    expect(saved?.technicalDealHistory[0]).toMatchObject({
      seed: legacyGame.seed,
      phase: legacyGame.phase,
      dealer: legacyGame.dealer,
      actor: legacyGame.actor
    });
  });

  it('migrates pre-rule-engine active bullet envelopes that do not include currentDeal bulletTarget', () => {
    const { bulletTarget: _bulletTarget, ...legacyGame } = createNewGame(44);
    localStorage.setItem(
      'marriage.save.v1',
      JSON.stringify({
        schema: 1,
        activeBulletSettings: { bulletSize: 20 },
        currentDeal: legacyGame,
        scoreTable: legacyGame.scores,
        technicalDealHistory: [
          {
            seed: legacyGame.seed,
            phase: legacyGame.phase,
            dealer: legacyGame.dealer,
            actor: legacyGame.actor,
            contract: null,
            scoreTable: legacyGame.scores
          }
        ]
      })
    );

    const saved = loadActiveBullet();

    expect(saved?.activeBulletSettings).toEqual({ bulletSize: 20 });
    expect(saved?.currentDeal).toEqual({ ...legacyGame, bulletTarget: 10 });
    expect(saved?.scoreTable).toEqual(legacyGame.scores);
  });

  it('ignores active bullet envelopes with score table mismatches', () => {
    const game = createNewGame(44);
    saveGame(game);
    const raw = JSON.parse(localStorage.getItem('marriage.save.v1')!);
    raw.scoreTable = [{ bullet: 99, mountain: 0, whists: [0, 0, 0] }, ...raw.scoreTable.slice(1)];
    localStorage.setItem('marriage.save.v1', JSON.stringify(raw));

    expect(loadActiveBullet()).toBeNull();
    expect(loadGame()).toBeNull();
  });

  it('ignores active bullet envelopes with unsupported bullet settings', () => {
    const game = createNewGame(44);
    saveGame(game, { bulletSize: 20 });
    const raw = JSON.parse(localStorage.getItem('marriage.save.v1')!);
    raw.activeBulletSettings = { bulletSize: 25 };
    localStorage.setItem('marriage.save.v1', JSON.stringify(raw));

    expect(loadActiveBullet()).toBeNull();
    expect(loadGame()).toBeNull();
  });

  it('ignores active bullet envelopes missing required schema fields', () => {
    const game = createNewGame(44);
    saveGame(game, { bulletSize: 20 });
    const raw = JSON.parse(localStorage.getItem('marriage.save.v1')!);
    delete raw.currentDeal;
    localStorage.setItem('marriage.save.v1', JSON.stringify(raw));

    expect(loadActiveBullet()).toBeNull();
    expect(loadGame()).toBeNull();

    saveGame(game, { bulletSize: 20 });
    const missingHistory = JSON.parse(localStorage.getItem('marriage.save.v1')!);
    delete missingHistory.technicalDealHistory;
    localStorage.setItem('marriage.save.v1', JSON.stringify(missingHistory));

    expect(loadActiveBullet()).toBeNull();
    expect(loadGame()).toBeNull();
  });

  it('does not load a finished bullet as the active unfinished game', () => {
    const game = createNewGame(44);
    const finished: GameState = {
      ...game,
      phase: 'finished',
      contract: { type: 'allPass' },
      declarer: null,
      trump: null,
      currentTrick: [],
      tricksTaken: [0, 0, 0],
      winnerSummary: 'Done'
    };

    saveGame(finished);

    expect(loadActiveBullet()).toBeNull();
    expect(loadGame()).toBeNull();
  });

  it('does not load a bullet whose target is already complete', () => {
    const game = createNewGame(44);
    const completed: GameState = {
      ...game,
      scores: [
        { ...game.scores[0], bullet: 10 },
        game.scores[1],
        game.scores[2]
      ]
    };

    saveGame(completed, { bulletSize: 10 });

    expect(loadActiveBullet()).toBeNull();
    expect(loadGame()).toBeNull();
  });

  it('round-trips active bullets in deal-settlement and next-deal phases', () => {
    const settlement = makeDealSettlementState();
    saveGame(settlement, { bulletSize: 20 });

    expect(loadActiveBullet()?.currentDeal).toEqual(settlement);

    const nextDeal = makeNextDealState();
    saveGame(nextDeal, { bulletSize: 30, replaceActiveBullet: true });

    expect(loadActiveBullet()?.activeBulletSettings).toEqual({ bulletSize: 30 });
    expect(loadActiveBullet()?.currentDeal).toEqual(nextDeal);
  });

  it('ignores saves with malformed new rule-machine phase fields', () => {
    const settlement = makeDealSettlementState();
    saveGame(settlement, { bulletSize: 20 });
    const missingSummary = JSON.parse(localStorage.getItem('marriage.save.v1')!);
    delete missingSummary.currentDeal.settlementSummary;
    localStorage.setItem('marriage.save.v1', JSON.stringify(missingSummary));

    expect(loadActiveBullet()).toBeNull();

    const nextDeal = makeNextDealState();
    saveGame(nextDeal, { bulletSize: 20, replaceActiveBullet: true });
    const invalidPreviousSummary = JSON.parse(localStorage.getItem('marriage.save.v1')!);
    invalidPreviousSummary.currentDeal.previousSummary = null;
    localStorage.setItem('marriage.save.v1', JSON.stringify(invalidPreviousSummary));

    expect(loadActiveBullet()).toBeNull();
  });

  it('ignores saves with malformed bullet targets', () => {
    const game = createNewGame(44);
    saveGame(game, { bulletSize: 20 });
    const raw = JSON.parse(localStorage.getItem('marriage.save.v1')!);
    raw.currentDeal.bulletTarget = '20';
    localStorage.setItem('marriage.save.v1', JSON.stringify(raw));

    expect(loadActiveBullet()).toBeNull();
    expect(loadGame()).toBeNull();
  });

  it('ignores corrupt saves', () => {
    localStorage.setItem('marriage.save.v1', '{bad json');
    expect(loadGame()).toBeNull();
  });

  it('ignores saves with the wrong schema', () => {
    localStorage.setItem('marriage.save.v1', JSON.stringify({ schema: 2, state: createNewGame(44) }));
    expect(loadGame()).toBeNull();
  });

  it('ignores saves with missing state', () => {
    localStorage.setItem('marriage.save.v1', JSON.stringify({ schema: 1 }));
    expect(loadGame()).toBeNull();
  });

  it('ignores saves with an invalid phase', () => {
    const state = { ...createNewGame(44), phase: 'invalid' };
    localStorage.setItem('marriage.save.v1', JSON.stringify({ schema: 1, state }));
    expect(loadGame()).toBeNull();
  });

  it('ignores saves with an incomplete state shape', () => {
    localStorage.setItem('marriage.save.v1', JSON.stringify({ schema: 1, state: { phase: 'bidding' } }));
    expect(loadGame()).toBeNull();
  });

  it('ignores saves with an invalid actor', () => {
    const state = { ...createNewGame(44), actor: 99 };
    localStorage.setItem('marriage.save.v1', JSON.stringify({ schema: 1, state }));
    expect(loadGame()).toBeNull();
  });

  it('ignores saves with an invalid dealer', () => {
    const state = { ...createNewGame(44), dealer: 99 };
    localStorage.setItem('marriage.save.v1', JSON.stringify({ schema: 1, state }));
    expect(loadGame()).toBeNull();
  });

  it('ignores saves with malformed players', () => {
    const wrongLength = { ...createNewGame(44), players: createNewGame(44).players.slice(0, 2) };
    localStorage.setItem('marriage.save.v1', JSON.stringify({ schema: 1, state: wrongLength }));
    expect(loadGame()).toBeNull();

    const invalidKind = {
      ...createNewGame(44),
      players: createNewGame(44).players.map((player) => (player.id === 1 ? { ...player, kind: 'robot' } : player))
    };
    localStorage.setItem('marriage.save.v1', JSON.stringify({ schema: 1, state: invalidKind }));
    expect(loadGame()).toBeNull();
  });

  it('ignores bidding saves missing phase-specific fields', () => {
    const game = createNewGame(44);
    if (game.phase !== 'bidding') throw new Error('Expected bidding');
    const { currentBid: _currentBid, passed: _passed, ...state } = game;
    localStorage.setItem('marriage.save.v1', JSON.stringify({ schema: 1, state }));
    expect(loadGame()).toBeNull();
  });

  it('ignores saves with malformed hand cards', () => {
    const state = { ...createNewGame(44), hands: [[null], [], []] };
    localStorage.setItem('marriage.save.v1', JSON.stringify({ schema: 1, state }));
    expect(loadGame()).toBeNull();
  });

  it('ignores saves with malformed widow cards', () => {
    const state = { ...createNewGame(44), widow: [null] };
    localStorage.setItem('marriage.save.v1', JSON.stringify({ schema: 1, state }));
    expect(loadGame()).toBeNull();
  });

  it('ignores saves with card ids that do not match suit and rank', () => {
    const game = createNewGame(44);
    const state = {
      ...game,
      hands: [[{ ...game.hands[0][0], id: 'hearts-ace' }], [], []]
    };
    localStorage.setItem('marriage.save.v1', JSON.stringify({ schema: 1, state }));
    expect(loadGame()).toBeNull();
  });
});

function makeDealSettlementState(): Extract<GameState, { phase: 'deal-settlement' }> {
  const game = createNewGame(44);
  return {
    ...game,
    phase: 'deal-settlement',
    mode: 'contract',
    contract: { type: 'game', level: 6, suit: 'spades' },
    declarer: 0,
    trump: 'spades',
    currentTrick: [],
    tricksTaken: [6, 2, 2],
    whistResponses: ['whist', 'pass'],
    settlementSummary: 'Deal is ready to settle'
  };
}

function makeNextDealState(): Extract<GameState, { phase: 'next-deal' }> {
  const game = createNewGame(45);
  return {
    ...game,
    phase: 'next-deal',
    previousSummary: 'Previous deal settled'
  };
}
