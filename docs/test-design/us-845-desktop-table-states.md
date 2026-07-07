# US-845 Desktop Table States QA Test Design

Refs: PERSONAL-US-845; PERSONAL-REQ-1762; PERSONAL-AC-2428; PERSONAL-AC-2429
Task: PERSONAL-TASK-1161 / MZ-501
Component: default
Layer: qa-test-design
Phase: implementation
Depends on: MZ-208; MZ-408
Required setup: deterministic rule fixtures, stable scoring outputs, existing renderer/controller test harness, existing Playwright screenshot capture style evidence.
QA risk level: high
Security review: not needed for this scope; desktop UI state projection only.
Release gate required: yes

## Goal

Define executable desktop/laptop UI scenarios for Sochi preference table states so downstream implementation and verification tasks can prove that the player always understands the current phase, active actor, legal actions, contract context, trump, trick state, hands, score table, deal result, and final result without relying on tutorial or glossary content.

This document is the QA design source for:

- MZ-502 presentation-client implementation
- MZ-503 US-scoped integration tests
- accessibility verification
- visual regression / screenshot review
- component regression
- release gate review

## Scope And Evidence Base

In scope:

- bidding state
- contract ordering
- widow pickup
- discard
- whist / half-whist / pass / check decisions
- contract play
- all-pass play state
- misere play state
- deal-result / settlement
- next-deal continuation
- final-result / completed bullet
- active actor visibility
- legal action visibility, disabled controls, and ineligible action suppression
- contract context and trump display when applicable
- current trick and all three hands
- score table integration in every primary player-facing desktop state

Out of scope:

- full mobile UX
- tutorial copy
- glossary/help system
- custom test harnesses outside the current Vitest/jsdom and bundled Playwright-style evidence pattern

Dependency evidence this design builds on:

- `docs/test-design/us-842-rule-phases.md` for rule-phase legality and transition coverage
- `task-reports/PERSONAL-TASK-1146/attempt-1.json` for US-842 release-gate acceptance
- `task-reports/PERSONAL-TASK-1160/attempt-1.json` and `task-reports/PERSONAL-US-844/review-cycle-2/review-report.json` for score/result acceptance and desktop visual evidence classification
- `src/ui/render.test.ts`
- `src/ui/controller.test.ts`
- `src/test/ruleFlow.integration.test.ts`
- `src/test/us844Scoring.integration.test.ts`
- `output/playwright/mz406-capture.mjs` and `output/playwright/mz-406-*.png`

## Test Surfaces And Constraints

Use existing surfaces only:

- `src/ui/render.test.ts` for deterministic state rendering, visible controls, disabled states, score/result panels, actor/phase/status text, and hand/trick projection
- `src/ui/controller.test.ts` for start/resume shell behavior and any top-level state routing that affects desktop shell visibility
- `src/test/ruleFlow.integration.test.ts` for rule-driven UI flow from legal actions into rendered states
- `src/test/us844Scoring.integration.test.ts` for settlement, next-deal, and final-result integration
- Playwright-style screenshot evidence following `output/playwright/mz406-capture.mjs` patterns for desktop/laptop layout review only

Do not introduce:

- a separate synthetic harness format
- a second UI state model that diverges from `GameState`
- browser-only scenarios that cannot also be expressed as renderer/controller/integration fixtures

## State Coverage Model

The downstream test plan should cover these desktop player-facing state families:

1. `bidding`
2. `contract/order`
3. `contract/widow-pickup`
4. `contract/discard`
5. `contract/whist-decision`
6. `play/contract`
7. `play/all-pass`
8. `play/misere`
9. `deal-settlement`
10. `next-deal`
11. `finished`

For each state, downstream verification must check:

- phase visibility
- active actor visibility
- legal action projection
- absence or disablement of ineligible actions
- card-table state (hands and current trick)
- contract/trump/result context relevance
- score table presence and readability

## Executable Scenario Matrix

| Scenario ID | State | Summary | Primary downstream surface | Trace |
|---|---|---|---|---|
| UI-845-001 | bidding | Desktop bidding shows phase, active actor, only legal bid/pass controls, score table, hands, and no contract/settlement panel | render + integration | REQ-1762, AC-2428 |
| UI-845-002 | contract order | Winning bidder sees contract-order choices only, active actor is declarer, contract context updates, trump not shown until ordered | render + integration | REQ-1762, AC-2428 |
| UI-845-003 | widow pickup | Pickup state shows declarer-only pickup action, clear contract context, score table retained, no discard/whist/play controls yet | render + integration | REQ-1762, AC-2428 |
| UI-845-004 | discard | Discard state shows open human hand, discard selection affordance, disabled confirm before legal pair, no unrelated actions | render | REQ-1762, AC-2428 |
| UI-845-005 | whist decision | Defender decision state shows only legal whist/half-whist/pass choices for the active actor and suppresses play controls | render + integration | REQ-1762, AC-2428 |
| UI-845-006 | ten-level check | Ten-level whist decision shows `check` only and suppresses `whist` / `half-whist` / `pass` where not legal | render + integration | REQ-1762, AC-2428 |
| UI-845-007 | contract play | Play state shows active actor, legal playable cards only, current trick, contract and trump context, and no bidding/whist controls | render + integration | REQ-1762, AC-2428 |
| UI-845-008 | all-pass play | All-pass play state preserves score table and active actor while omitting trump/declarer-only context that does not apply | integration + visual | REQ-1762, AC-2428 |
| UI-845-009 | misere play | Misere play state shows misere contract context, no whist controls, no trump indicator, legal card plays only | render + integration | REQ-1762, AC-2428 |
| UI-845-010 | deal result | Settlement state shows result panel, score-change table, contract summary, active actor, and only settle/proceed action | render + scoring integration | REQ-1762, AC-2428, AC-2429 |
| UI-845-011 | next deal | Next-deal state keeps previous deal result understandable, exposes only next-deal continuation, and preserves updated score table | render + scoring integration | REQ-1762, AC-2429 |
| UI-845-012 | final result | Finished state shows final ranking/result summary, no continuation controls, previous settlement context if present, and stable score table | render + scoring integration + visual | REQ-1762, AC-2428, AC-2429 |
| UI-845-013 | active actor visibility | Representative states visibly identify the current actor in desktop shell/status copy without needing hidden logic knowledge | render + visual | REQ-1762, AC-2428 |
| UI-845-014 | illegal action suppression | Ineligible actions are absent, and deferred actions such as discard confirm stay disabled until a legal selection exists | render | REQ-1762, AC-2428 |
| UI-845-015 | score table integration | Score panel remains present and readable across bidding, play, settlement, next-deal, and final-result states | render + visual + scoring integration | REQ-1762, AC-2428, AC-2429 |

## Detailed Scenarios

### UI-845-001: Bidding desktop shell

Given a desktop/laptop viewport and a human bidding turn
When the game renders the bidding state
Then the UI shows:

- phase as `bidding`
- active actor identity
- only legal bid and pass controls
- human hand and opponent hand placeholders
- score table
- no deal-result or final-result panel

Assertions:

- rendered action keys match legal bid/pass actions only
- no `orderContract`, `pickupWidow`, `discardCards`, `whist`, `halfWhist`, `check`, `settleDeal`, or `startNextDeal`
- status line names the active actor

### UI-845-002 through UI-845-006: Contract-family decision states

Given representative contract states from US-842 fixtures
When each state renders
Then the UI must preserve one clear action family at a time:

- `order` shows contract-order actions only
- `widow-pickup` shows `pickupWidow` only
- `discard` shows discard-selection interaction and disabled confirm until legal selection
- `whist-decision` shows only current legal defender choices
- ten-level decision shows `check` only where the rules engine says so

Additional assertions:

- declarer/contract context stays visible through order, pickup, discard, and whist states
- trump is shown only after a trump-bearing contract is actually selected
- score table remains visible in every state

### UI-845-007: Contract play

Given a contract play state with a partially filled trick
When the human is active
Then the UI shows:

- active actor identity
- contract and trump context
- current trick cards already played
- only the legal playable cards enabled
- no other action buttons

Assertions:

- enabled card buttons equal `playCard:*` legal actions
- current trick cards are visible in table order
- ineligible cards are disabled, not clickable

### UI-845-008: All-pass play

Given an all-pass path that has reached play
When the desktop state renders
Then the player can still understand:

- that play is ongoing
- whose turn it is
- what cards are playable
- the persistent score table

Assertions:

- no irrelevant trump label
- no declarer-only contract language
- legal play action projection still matches engine output

### UI-845-009: Misere play

Given a misere play state
When the UI renders
Then the player sees misere context and legal card play only.

Assertions:

- no whist controls
- no trump indicator
- current trick and hand remain readable
- action projection equals legal `playCard:*` actions

### UI-845-010 and UI-845-011: Deal result and next-deal continuation

Given a completed deal
When the UI renders `deal-settlement` and then `next-deal`
Then the player can understand:

- outcome/result summary
- contract and declarer context
- trick totals
- score before / delta / after
- whist adjustments where applicable
- the only legal continuation action

Assertions:

- settlement exposes only `settleDeal`
- next-deal exposes only `startNextDeal`
- updated score table matches `scoresAfter`
- previous deal result remains visible in next-deal

These scenarios are the direct UI trace for `PERSONAL-AC-2429`.

### UI-845-012: Final result / completed bullet

Given bullet completion has occurred
When the `finished` state renders
Then the player sees:

- final result panel
- winner / ranking summary
- bullet target / completion context
- no continuation buttons

Assertions:

- no `settleDeal` or `startNextDeal`
- final result remains readable at desktop and laptop viewports
- previous settlement context is preserved if available

### UI-845-013 through UI-845-015: Cross-cutting presentation rules

Representative states must prove:

- active actor text is always visible in desktop shell
- legal actions are either present and enabled, or absent/disabled when ineligible
- score panel remains visible and readable in all player-facing primary states

## Verification Matrix

| Checkpoint | Bidding | Contract order/pickup/discard | Whist/check | Play contract/all-pass/misere | Deal result / next-deal | Final result |
|---|---|---|---|---|---|---|
| Phase visible | required | required | required | required | required | required |
| Active actor visible | required | required | required | required | required | required |
| Legal actions projected | required | required | required | required | required | none after completion |
| Disabled/ineligible actions handled correctly | required | required | required | required | required | required |
| Contract context visible | n/a before order | required | required | required except all-pass | required | previous deal context optional |
| Trump visible when applicable | n/a | after contract order only | when contract has trump | contract play only | deal summary only | not required for misere/final summary |
| Current trick visible | n/a | n/a | n/a | required | not required | not required |
| Human and opponent hands visible | required | required | required | required | empty-state acceptable | empty-state acceptable |
| Score table visible | required | required | required | required | required | required |
| Result/final panel visible | absent | absent | absent | absent | required | required |

## Traceability

### Requirement / AC coverage

| Contract | Scenarios | Notes |
|---|---|---|
| PERSONAL-REQ-1762 | UI-845-001 through UI-845-015 | Every row checks current phase, active actor, legal actions, contract/trump/result context, trick/hands, and score table in desktop scope |
| PERSONAL-AC-2428 | UI-845-001 through UI-845-015 | Primary acceptance trace for bidding, contract, whist, play, deal-result, and final-result readability without blocking play |
| PERSONAL-AC-2429 | UI-845-010, UI-845-011, UI-845-012, UI-845-015 | Deal-result understanding, proceed-to-next-deal behavior, and completed-bullet stop behavior |

### Dependency trace

| Dependency | Dependency use in US-845 design |
|---|---|
| US-842 QA design / MZ-208 release gate | Supplies the legal state families and legal-action expectations this document maps onto desktop UI states |
| US-844 release gate / completion review | Supplies accepted score/result/final-result surfaces and the settled classification of Playwright screenshot artifacts as visual-only evidence |

## Downstream Ownership / Routing

| Downstream task or gate | Ownership | Required work from this design |
|---|---|---|
| MZ-502 presentation client | implementation | Ensure desktop renderer exposes phase/actor/contract/trump/result/score contexts and suppresses or disables ineligible actions exactly as scenario matrix requires |
| MZ-503 integration tests | integration verification | Add US-scoped state-flow tests that drive representative bidding, contract, whist, play, settlement, next-deal, and final-result states through real engine + renderer surfaces |
| Accessibility verification | QA/NFR | Verify keyboard reachability of active controls, meaningful accessible names, visible state labels, non-color-only action affordances, and no hidden-only reliance for actor/phase/result context |
| Visual regression | QA/NFR | Capture deterministic desktop `1280x800` and laptop `1024x768` screenshots for active, settlement, and final shells at minimum; extend with whist and discard if layout risk remains |
| Component regression | QA regression | Re-run renderer/controller/scoring/rule integration coverage and ensure US-845 states do not regress US-842 legality or US-844 score/result readability |
| Release gate | verifier | Confirm REQ/AC evidence, desktop/laptop screenshot review, accessibility applicability, regression coverage, and explicit out-of-scope boundaries remain intact |

## Desktop / Laptop Viewport Checklist

Required viewport set:

- desktop: `1280x800`
- laptop: `1024x768`

Per viewport, verify:

- no horizontal overflow in table shell, score panel, result panel, or actions panel
- status line remains visible
- score panel remains readable without clipping
- current actions fit without overlap
- human hand remains visible and clickable where active
- settlement/final tables do not clip labels or values
- primary panel order still lets the player read score, table, and actions without blocked play

Full mobile UX remains out of scope and must not be silently folded into this task.

## Screenshot Review Checklist

Use the existing `mz406-capture` pattern as the baseline review style.

For each captured state, verify:

- viewport label and dimensions are recorded
- no console errors relevant to rendering
- no horizontal overflow
- score panel is present
- result panel is present for settlement/final states
- actor/phase context is visible somewhere in the shell
- text does not overlap cards, tables, or buttons
- no hidden clipped columns in score/result tables
- controls visible in the screenshot match the legal action family for that state

Screenshot evidence is accepted here as visual-review evidence only, not as backend-live or end-to-end behavioral proof.

## Explicit Non-Scope Reminder

This US-845 QA design does not require:

- full mobile adaptation
- tutorial screens or helper overlays
- glossary terminology support
- new test harness infrastructure

Those remain out of scope unless a later Spexus task adds them explicitly.
