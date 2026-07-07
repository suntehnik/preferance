import { chromium } from '/Applications/Codex.app/Contents/Resources/cua_node/lib/node_modules/playwright/index.mjs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const cwd = '/Users/dvaletin/development/Maryazh_330/.worktrees/browser-remake';
const outDir = path.join(cwd, 'output/playwright');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const baseUrl = 'http://127.0.0.1:5331/';
const viewports = [
  { label: 'desktop', width: 1280, height: 800 },
  { label: 'laptop', width: 1024, height: 768 }
];

async function renderActive(page) {
  await page.evaluate(async () => {
    const [{ renderGame }, { createNewGame }] = await Promise.all([
      import('/src/ui/render.ts'),
      import('/src/domain/engine.ts')
    ]);
    const base = createNewGame(3305331, 10);
    renderGame(document.getElementById('app'), {
      ...base,
      phase: 'bidding',
      actor: 0,
      scores: [
        { bullet: 6, mountain: 1, whists: [0, 4, -2] },
        { bullet: 2, mountain: 3, whists: [-4, 0, 5] },
        { bullet: 1, mountain: 0, whists: [2, -5, 0] }
      ],
      log: ['Synthetic visual QA active score state']
    }, { onAction() {}, onNewGame() {} });
  });
  await page.waitForSelector('.score-panel');
}

async function renderSettlement(page) {
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

async function renderFinal(page) {
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

const states = [
  { name: 'active', render: renderActive },
  { name: 'settlement', render: renderSettlement },
  { name: 'final', render: renderFinal }
];

const results = [];
for (const viewport of viewports) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1
  });
  const consoleMessages = [];
  page.on('console', (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  for (const state of states) {
    await state.render(page);
    await page.waitForTimeout(100);
    const screenshotPath = path.join(outDir, `mz-406-${state.name}-${viewport.label}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const metrics = await page.evaluate(() => {
      const score = document.querySelector('.score-panel');
      const result = document.querySelector('[data-result-panel]');
      const buttons = Array.from(document.querySelectorAll('button'))
        .map((button) => button.textContent?.trim())
        .filter(Boolean);
      const overflowingElements = Array.from(document.querySelectorAll('body *'))
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (rect.right > window.innerWidth + 1 || rect.left < -1);
        })
        .slice(0, 12)
        .map((el) => ({
          tag: el.tagName,
          className: String(el.className),
          text: el.textContent?.trim().slice(0, 80),
          rect: el.getBoundingClientRect().toJSON()
        }));
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        scoreRect: score?.getBoundingClientRect().toJSON(),
        resultRect: result?.getBoundingClientRect().toJSON() ?? null,
        buttons,
        overflowingElements
      };
    });
    results.push({
      state: state.name,
      viewport: viewport.label,
      screenshot: screenshotPath,
      metrics
    });
  }
  await page.close();
  if (consoleMessages.length > 0) {
    results.push({ viewport: viewport.label, consoleMessages });
  }
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
