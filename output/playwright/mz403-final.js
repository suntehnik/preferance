async (page) => {
  await page.evaluate(async () => {
    const [{ renderGame }, { createNewGame }, { settleDealResult, calculateFinalResult }] = await Promise.all([
      import('/src/ui/render.ts'),
      import('/src/domain/engine.ts'),
      import('/src/domain/scoring.ts')
    ]);
    const base = createNewGame(78, 10);
    const scores = [
      { bullet: 8, mountain: 1, whists: [0, 4, -2] },
      { bullet: 4, mountain: 3, whists: [-4, 0, 5] },
      { bullet: 3, mountain: 0, whists: [2, -5, 0] }
    ];
    const dealResult = settleDealResult({
      mode: 'misere',
      contract: { type: 'misere' },
      declarer: 0,
      tricksTaken: [0, 5, 5],
      whistResponses: [null, null],
      scores,
      bulletTarget: 10,
      allPassCount: 0,
      progressiveAllPass: true
    });
    const finalResult = calculateFinalResult(dealResult.scoresAfter, 10);
    renderGame(document.getElementById('app'), {
      phase: 'finished',
      seed: base.seed,
      bulletTarget: 10,
      players: base.players,
      dealer: base.dealer,
      actor: 0,
      hands: [[], [], []],
      widow: [],
      contract: { type: 'misere' },
      declarer: 0,
      trump: null,
      currentTrick: [],
      tricksTaken: [0, 5, 5],
      scores: dealResult.scoresAfter,
      allPassCount: 0,
      log: ['Synthetic visual QA finished state'],
      winnerSummary: 'You wins the bullet',
      previousDealResult: dealResult,
      finalResult
    }, { onAction() {}, onNewGame() {} });
  });
  await page.waitForSelector('[data-result-panel="final"]');
}
