import { chromium } from '/Applications/Codex.app/Contents/Resources/cua_node/lib/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const cwd = '/Users/dvaletin/development/Maryazh_330/.worktrees/browser-remake';
const outDir = path.join(cwd, 'output/playwright');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await page.goto(process.env.MZ_STICKY_BASE_URL ?? 'http://127.0.0.1:5331/', { waitUntil: 'networkidle' });

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
  const state = {
    phase: 'play',
    mode: 'contract',
    seed: 330607,
    bulletTarget: 20,
    players: [
      { id: 0, name: 'You', kind: 'human' },
      { id: 1, name: 'AF Computers', kind: 'ai' },
      { id: 2, name: 'VIMCOM', kind: 'ai' }
    ],
    dealer: 2,
    actor: 0,
    hands: [
      [card('clubs-7'), card('spades-7'), card('hearts-ace')],
      [card('clubs-10'), card('spades-queen')],
      [card('hearts-king'), card('spades-9')]
    ],
    widow: [],
    contract: { type: 'game', level: 6, suit: 'spades' },
    declarer: 2,
    trump: 'spades',
    currentTrick: [
      { player: 0, card: card('clubs-7') },
      { player: 1, card: card('clubs-10') }
    ],
    tricksTaken: [0, 0, 0],
    whistResponses: ['whist', 'pass'],
    scores: [
      { bullet: 0, mountain: 0, whists: [0, 0, 0] },
      { bullet: 0, mountain: 0, whists: [0, 0, 0] },
      { bullet: 0, mountain: 0, whists: [0, 0, 0] }
    ],
    allPassCount: 0,
    log: [
      'New deal started',
      'You passes',
      'AF Computers passes',
      'VIMCOM bids 6 spades',
      'VIMCOM picks up the widow',
      'VIMCOM discards two cards',
      'VIMCOM orders 6 spades',
      'You chooses whist',
      'AF Computers chooses pass'
    ]
  };

  renderGame(document.getElementById('app'), state, { onAction() {}, onNewGame() {} });
});

await page.waitForSelector('.bid-bubble-sticky');
const screenshotPath = path.join(outDir, 'sticky-bubbles-vimcom-play-desktop.png');
await page.screenshot({ path: screenshotPath, fullPage: false });
const bubbles = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.bid-bubble')).map((bubble) => ({
    text: bubble.textContent,
    className: bubble.className,
    rect: (() => {
      const rect = bubble.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    })()
  }))
);

await browser.close();
await writeFile(path.join(outDir, 'sticky-bubbles-capture-results.json'), `${JSON.stringify({ screenshotPath, bubbles }, null, 2)}\n`);
console.log(JSON.stringify({ screenshotPath, bubbles }, null, 2));
