import { chromium } from '/Applications/Codex.app/Contents/Resources/cua_node/lib/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const cwd = '/Users/dvaletin/development/Maryazh_330/.worktrees/browser-remake';
const outDir = path.join(cwd, 'output/playwright');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const baseUrl = process.env.MZ505_BASE_URL ?? 'http://127.0.0.1:5331/';
const viewports = [
  { label: 'desktop', width: 1280, height: 800 },
  { label: 'laptop', width: 1024, height: 768 }
];

async function renderState(page, stateName) {
  await page.evaluate(async (name) => {
    const [{ renderGame }, { createDeck }, { applyAction }] = await Promise.all([
      import('/src/ui/render.ts'),
      import('/src/domain/cards.ts'),
      import('/src/domain/engine.ts')
    ]);

    const deck = createDeck();
    const card = (id) => {
      const found = deck.find((candidate) => candidate.id === id);
      if (!found) throw new Error(`Missing card ${id}`);
      return found;
    };
    const players = () => [
      { id: 0, name: 'You', kind: 'human' },
      { id: 1, name: 'AF Computers', kind: 'ai' },
      { id: 2, name: 'VIMCOM', kind: 'ai' }
    ];
    const scores = () => [
      { bullet: 6, mountain: 1, whists: [0, 4, -2] },
      { bullet: 2, mountain: 3, whists: [-4, 0, 5] },
      { bullet: 1, mountain: 0, whists: [2, -5, 0] }
    ];
    const nearFinishScores = () => [
      { bullet: 9, mountain: 1, whists: [0, 6, -1] },
      { bullet: 3, mountain: 4, whists: [-6, 0, 4] },
      { bullet: 2, mountain: 0, whists: [1, -4, 0] }
    ];
    const base = (overrides = {}) => ({
      seed: 845505,
      bulletTarget: 10,
      players: players(),
      dealer: 2,
      actor: 0,
      hands: [
        [card('clubs-7'), card('spades-7'), card('hearts-ace'), card('diamonds-king')],
        [card('clubs-10'), card('spades-queen'), card('diamonds-8')],
        [card('clubs-ace'), card('hearts-king'), card('spades-9')]
      ],
      widow: [card('hearts-7'), card('diamonds-7')],
      scores: scores(),
      allPassCount: 0,
      log: [
        'Synthetic MZ-505 visual fixture',
        'Static UI evidence; no backend service is involved'
      ],
      ...overrides
    });
    const bidding = () => ({
      ...base(),
      phase: 'bidding',
      currentBid: null,
      bidWinner: null,
      passed: []
    });
    const contract = () => ({
      ...base({
        hands: [
          [card('clubs-7'), card('spades-7'), card('hearts-ace'), card('diamonds-king')],
          [card('clubs-10'), card('spades-queen'), card('diamonds-8')],
          [card('clubs-ace'), card('hearts-king'), card('spades-9')]
        ]
      }),
      phase: 'contract',
      step: 'order',
      contract: { type: 'game', level: 8, suit: 'hearts' },
      declarer: 0,
      defenderOrder: [1, 2],
      whistResponses: [null, null]
    });
    const whist = () => ({
      ...base({
        actor: 0,
        hands: [
          [card('clubs-7'), card('diamonds-9'), card('spades-jack')],
          [card('clubs-10'), card('spades-queen'), card('diamonds-8')],
          [card('clubs-ace'), card('hearts-king'), card('spades-9')]
        ]
      }),
      phase: 'contract',
      step: 'whist-decision',
      contract: { type: 'game', level: 8, suit: 'hearts' },
      declarer: 2,
      defenderOrder: [0, 1],
      whistResponses: [null, null]
    });
    const play = () => ({
      ...base({
        hands: [
          [card('clubs-7'), card('spades-7'), card('hearts-ace')],
          [card('clubs-10'), card('spades-queen')],
          [card('hearts-king'), card('spades-9')]
        ]
      }),
      phase: 'play',
      mode: 'contract',
      contract: { type: 'game', level: 6, suit: 'spades' },
      declarer: 0,
      trump: 'spades',
      currentTrick: [
        { player: 1, card: card('clubs-10') },
        { player: 2, card: card('clubs-ace') }
      ],
      tricksTaken: [4, 2, 1],
      whistResponses: ['whist', 'pass']
    });
    const settlement = () => {
      const state = {
        ...base({
          actor: 2,
          hands: [[], [], [card('hearts-king')]],
          scores: scores()
        }),
        phase: 'play',
        mode: 'contract',
        contract: { type: 'game', level: 8, suit: 'hearts' },
        declarer: 0,
        trump: 'hearts',
        currentTrick: [
          { player: 0, card: card('hearts-ace') },
          { player: 1, card: card('clubs-7') }
        ],
        tricksTaken: [7, 2, 0],
        whistResponses: ['whist', 'pass']
      };
      return applyAction(state, { type: 'playCard', cardId: 'hearts-king' });
    };
    const final = () => {
      const state = {
        ...base({
          scores: nearFinishScores()
        }),
        phase: 'deal-settlement',
        mode: 'contract',
        contract: { type: 'game', level: 6, suit: 'spades' },
        declarer: 0,
        trump: 'spades',
        currentTrick: [],
        tricksTaken: [6, 2, 2],
        whistResponses: ['whist', 'pass'],
        settlementSummary: 'Synthetic final settlement fixture'
      };
      return applyAction(state, { type: 'settleDeal' });
    };

    const states = { bidding, contract, whist, play, settlement, final };
    const stateFactory = states[name];
    if (!stateFactory) throw new Error(`Unknown state ${name}`);
    renderGame(document.getElementById('app'), stateFactory(), { onAction() {}, onNewGame() {} });
  }, stateName);

  await page.waitForSelector('.game-shell');
  await page.waitForSelector('.score-panel');
}

async function collectMetrics(page, stateName, viewportLabel, screenshotPath) {
  return page.evaluate(
    ({ stateName: currentState, viewportLabel: currentViewport, screenshotPath: currentScreenshot }) => {
      const selectors = [
        '.score-panel',
        '.state-panel',
        '.actions',
        '.card-table',
        '.human-hand',
        '.trick-zone',
        '[data-result-panel]',
        '.status-line'
      ];
      const rectFor = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          x: Math.round(rect.x * 100) / 100,
          y: Math.round(rect.y * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
          right: Math.round(rect.right * 100) / 100,
          bottom: Math.round(rect.bottom * 100) / 100
        };
      };
      const selected = selectors
        .map((selector) => ({ selector, element: document.querySelector(selector) }))
        .filter((entry) => entry.element)
        .map((entry) => ({ selector: entry.selector, rect: rectFor(entry.element), text: entry.element.textContent?.trim().slice(0, 120) }));
      const overlaps = [];
      for (let left = 0; left < selected.length; left += 1) {
        for (let right = left + 1; right < selected.length; right += 1) {
          const a = selected[left].rect;
          const b = selected[right].rect;
          const width = Math.min(a.right, b.right) - Math.max(a.x, b.x);
          const height = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
          if (width > 2 && height > 2) {
            overlaps.push({ a: selected[left].selector, b: selected[right].selector, width, height });
          }
        }
      }
      const clippedText = Array.from(document.querySelectorAll('button, h1, h2, h3, h4, p, dt, dd, th, td, li, .table-message, .status-line'))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          return element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
        })
        .slice(0, 20)
        .map((element) => ({
          tag: element.tagName,
          className: String(element.className),
          text: element.textContent?.trim().slice(0, 100),
          rect: rectFor(element),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight
        }));
      const horizontalOverflowElements = Array.from(document.querySelectorAll('body *'))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (rect.right > window.innerWidth + 1 || rect.left < -1);
        })
        .slice(0, 20)
        .map((element) => ({
          tag: element.tagName,
          className: String(element.className),
          text: element.textContent?.trim().slice(0, 100),
          rect: rectFor(element)
        }));
      const buttons = Array.from(document.querySelectorAll('button'))
        .map((button) => ({
          text: button.textContent?.trim(),
          actionKey: button.dataset.actionKey ?? null,
          disabled: button.disabled,
          rect: rectFor(button)
        }));
      const visibleButtons = buttons.filter((button) => button.rect && button.rect.bottom >= 0 && button.rect.y <= window.innerHeight);
      const resultPanel = document.querySelector('[data-result-panel]');
      const scorePanel = document.querySelector('.score-panel');
      const actionArea = document.querySelector('.actions');
      const humanHand = document.querySelector('.human-hand');
      const trickZone = document.querySelector('.trick-zone');
      const hasLegalActionArea =
        currentState === 'final' ? buttons.length === 0 : buttons.some((button) => !button.disabled && button.actionKey !== null);
      return {
        state: currentState,
        viewport: currentViewport,
        screenshot: currentScreenshot,
        evidence_classification: 'synthetic_static_visual_ui_evidence',
        viewportSize: { width: window.innerWidth, height: window.innerHeight },
        documentScrollWidth: document.documentElement.scrollWidth,
        documentScrollHeight: document.documentElement.scrollHeight,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        horizontalOverflowElements,
        clippedText,
        selectedRects: selected,
        overlaps,
        buttons,
        visibleButtons,
        scorePanelRect: rectFor(scorePanel),
        resultPanelRect: rectFor(resultPanel),
        actionAreaRect: rectFor(actionArea),
        humanHandRect: rectFor(humanHand),
        trickZoneRect: rectFor(trickZone),
        hasScorePanel: Boolean(scorePanel),
        hasResultPanel: Boolean(resultPanel),
        hasLegalActionArea,
        bodyText: document.body.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500)
      };
    },
    { stateName, viewportLabel, screenshotPath }
  );
}

const states = ['bidding', 'contract', 'whist', 'play', 'settlement', 'final'];
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
    await renderState(page, state);
    await page.waitForTimeout(100);
    const screenshotPath = path.join(outDir, `mz-505-${state}-${viewport.label}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    results.push(await collectMetrics(page, state, viewport.label, screenshotPath));
  }
  if (consoleMessages.length > 0) {
    results.push({ viewport: viewport.label, consoleMessages });
  }
  await page.close();
}

await browser.close();
await writeFile(path.join(outDir, 'mz505-capture-results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
