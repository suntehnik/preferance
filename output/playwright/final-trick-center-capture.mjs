import { chromium } from '/Applications/Codex.app/Contents/Resources/cua_node/lib/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const cwd = '/Users/dvaletin/development/Maryazh_330/.worktrees/browser-remake';
const outDir = path.join(cwd, 'output/playwright');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 2048, height: 976 }, deviceScaleFactor: 1 });
await page.goto(process.env.MZ_FINAL_TRICK_BASE_URL ?? 'http://127.0.0.1:5331/', { waitUntil: 'networkidle' });

await page.evaluate(async () => {
  const [{ renderGame }, { createDeck }] = await Promise.all([
    import('/src/ui/render.ts'),
    import('/src/domain/cards.ts')
  ]);

  const deck = createDeck();
  const card = (id) => {
    const found = deck.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`Missing card ${id}`);
    return found;
  };
  const completedTrick = [
    { player: 0, card: card('diamonds-ace') },
    { player: 1, card: card('diamonds-king') },
    { player: 2, card: card('diamonds-queen') }
  ];
  const state = {
    phase: 'deal-settlement',
    mode: 'contract',
    seed: 330608,
    bulletTarget: 20,
    players: [
      { id: 0, name: 'You', kind: 'human' },
      { id: 1, name: 'AF Computers', kind: 'ai' },
      { id: 2, name: 'VIMCOM', kind: 'ai' }
    ],
    dealer: 2,
    actor: 0,
    hands: [[], [], []],
    widow: [],
    contract: { type: 'game', level: 8, suit: 'spades' },
    declarer: 0,
    trump: 'spades',
    currentTrick: [],
    tricksTaken: [8, 1, 1],
    whistResponses: ['whist', 'half-whist'],
    scores: [
      { bullet: 0, mountain: 0, whists: [0, 0, 0] },
      { bullet: 0, mountain: 0, whists: [0, 0, 0] },
      { bullet: 0, mountain: 0, whists: [0, 0, 0] }
    ],
    allPassCount: 0,
    log: [
      'New deal started',
      'You orders 8 spades',
      'AF Computers chooses whist',
      'VIMCOM chooses half-whist',
      'You plays ace diamonds',
      'AF Computers plays king diamonds',
      'VIMCOM plays queen diamonds'
    ],
    settlementSummary: 'Ready to settle'
  };

  renderGame(
    document.getElementById('app'),
    state,
    { onAction() {}, onNewGame() {} },
    {
      completedTrick,
      playedCardId: 'diamonds-queen',
      pause: { kind: 'trick-complete', message: 'Посмотрите карты взятки' }
    }
  );
});

await page.waitForSelector('.completed-trick-zone .card');
await page.waitForTimeout(650);
const screenshotPath = path.join(outDir, 'final-trick-centered-desktop.png');
await page.screenshot({ path: screenshotPath, fullPage: false });
const metrics = await page.evaluate(() => {
  const zone = document.querySelector('.trick-zone');
  const cards = Array.from(document.querySelectorAll('.trick-zone .card'));
  const rectFor = (node) => {
    const rect = node.getBoundingClientRect();
    return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height), bottom: Math.round(rect.bottom) };
  };
  return {
    zoneClassName: zone?.className,
    zoneRect: zone ? rectFor(zone) : null,
    cardRects: cards.map(rectFor)
  };
});

await browser.close();
await writeFile(path.join(outDir, 'final-trick-center-capture-results.json'), `${JSON.stringify({ screenshotPath, metrics }, null, 2)}\n`);
console.log(JSON.stringify({ screenshotPath, metrics }, null, 2));
