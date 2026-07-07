async (page) => {
  await page.evaluate(async () => {
    const [{ renderGame }, { createNewGame }, { settleDealResult }] = await Promise.all([
      import('/src/ui/render.ts'),
      import('/src/domain/engine.ts'),
      import('/src/domain/scoring.ts')
    ]);
    const base = createNewGame(77, 10);
    const scores = [
      { bullet: 6, mountain: 1, whists: [0, 4, -2] },
      { bullet: 2, mountain: 3, whists: [-4, 0, 5] },
      { bullet: 1, mountain: 0, whists: [2, -5, 0] }
    ];
    const dealResult = settleDealResult({
      mode: 'contract',
      contract: { type: 'game', level: 6, suit: 'hearts' },
      declarer: 0,
      tricksTaken: [6, 2, 2],
      whistResponses: ['whist', 'pass'],
      scores,
      bulletTarget: 10,
      allPassCount: 0,
      progressiveAllPass: true
    });
    renderGame(document.getElementById('app'), {
      phase: 'deal-settlement',
      mode: 'contract',
      seed: base.seed,
      bulletTarget: 10,
      players: base.players,
      dealer: base.dealer,
      actor: 0,
      hands: [[], [], []],
      widow: [],
      contract: { type: 'game', level: 6, suit: 'hearts' },
      declarer: 0,
      trump: 'hearts',
      currentTrick: [],
      tricksTaken: [6, 2, 2],
      whistResponses: ['whist', 'pass'],
      scores,
      allPassCount: 0,
      log: ['Synthetic visual QA settlement state'],
      settlementSummary: dealResult.summary,
      dealResult
    }, { onAction() {}, onNewGame() {} });
  });
  await page.waitForSelector('[data-result-panel="deal"]');
}
