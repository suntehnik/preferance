# US-843 AI Decision QA Test Design

Refs: PERSONAL-US-843; PERSONAL-REQ-1758; PERSONAL-REQ-1759; PERSONAL-AC-2424; PERSONAL-AC-2425; PERSONAL-STD-063
Task: PERSONAL-TASK-1147 / MZ-301
Component: default
Layer: qa-test-design
Phase: implementation
Depends on: MZ-208
Required setup: stable rule engine from US-842; deterministic rule fixtures; no backend, auth, or external services.
QA risk level: critical
Observability verification: required for stuck/AI failure diagnostics.
Security review: not needed; scope is local AI/rules logic with no auth, backend, or sensitive data.
Release gate required: yes

## Goal

Define executable AI-decision scenarios that prove:

- AI always returns one legal action from the rules engine action set.
- AI uses current phase and rule context instead of a phase-blind first-action fallback.
- later implementation tasks MZ-302 and MZ-303 can build deterministic unit/integration coverage without inventing new QA requirements.

This document is the test-design input for:

- MZ-302: AI decision heuristics and phase-aware unit coverage
- MZ-303: AI integration/regression and stuck-diagnostics coverage

## Scope And Traceability

In scope:

- bidding decisions
- contract ordering
- widow pickup and discard
- whist / half-whist / check / pass decisions
- all-pass behavior
- misere behavior
- contract and misere trick play legality
- no-illegal-action property checks across all AI-controlled phases
- observability expectations when AI has no action, chooses illegal action, or gets stuck

Out of scope:

- exact MARRIAGE 3.30 AI reconstruction
- advanced search/simulation strength
- UI polish or human-control rendering
- multiplayer, backend, or online telemetry

Primary refs:

- `PERSONAL-REQ-1758`
- `PERSONAL-REQ-1759`
- `PERSONAL-AC-2424`
- `PERSONAL-AC-2425`
- `PERSONAL-STD-063`
- `/Users/dvaletin/development/Maryazh_330/docs/reverse-engineering/marriage-exe-findings.md`

## Current Surface Alignment

Tests should target the current code surfaces unless MZ-302 intentionally refactors them:

- AI entrypoint: `src/ai/heuristicAi.ts` -> `chooseAiAction(state, seed)`
- legal action source: `src/domain/engine.ts` -> `getLegalActions(state)`
- rule state/action types: `src/domain/state.ts`
- deterministic harness: `src/test/integrationHarness.ts`

Current state model uses:

- `phase: 'bidding'`
- `phase: 'contract'` with `step: 'order' | 'widow-pickup' | 'discard' | 'whist-decision'`
- `phase: 'play'` with `mode: 'all-pass' | 'contract' | 'misere'`
- `phase: 'deal-settlement'`
- `phase: 'next-deal'`
- `phase: 'finished'`

Current action types relevant to AI:

- `pass`
- `check`
- `whist`
- `halfWhist`
- `bidGame`
- `bidMisere`
- `orderContract`
- `pickupWidow`
- `discardCards`
- `playCard`
- `settleDeal`
- `startNextDeal`

## Deterministic Fixture Strategy

Use deterministic seeds and helper fixtures already present in the repo wherever possible:

- `src/test/integrationHarness.ts`
  - `fixtureDeals.seededRuleScenario`
  - `fixtureDeals.contractOrdering`
  - `deterministicSeeds.fullBulletSmoke`
- `src/domain/engine.test.ts`
  - `makeContractOrderState(...)`
  - `makeWhistState(...)`
  - `makePlayState(...)`
  - `makeSettlementState(...)`

Recommended fixture policy for MZ-302/MZ-303:

1. Reuse existing deterministic helpers before inventing new cards/hands.
2. Add explicit named fixture builders for AI-only edge cases where current helpers are too broad.
3. Keep hands minimal for branch-specific play tests: only the cards needed to prove suit-follow, trumping, shedding, or misere avoidance.
4. Assertions must compare against `getLegalActions(state)` from the same state, never a hand-authored legal set.

## Executable Scenario Matrix

| Scenario ID | Fixture state | AI action type under test | Assertion pattern | Trace |
|---|---|---|---|---|
| AI-843-001 | bidding state with at least one bid and pass | `bidGame` or `pass` | chosen action is in `getLegalActions`; never throws while legal actions exist | REQ-1758, AC-2424 |
| AI-843-002 | bidding state where a legal non-pass bid exists and seed varies | `bidGame` / `bidMisere` vs `pass` | choice is not hard-coded to first legal action across phase-distinct fixtures | REQ-1759, AC-2425 |
| AI-843-003 | contract step `order` after winning bid | `orderContract` | chosen contract is legal and consistent with winning-bid ordering context | REQ-1758, REQ-1759 |
| AI-843-004 | contract step `widow-pickup` | `pickupWidow` | declarer-only action chosen; no unrelated action type appears | REQ-1758 |
| AI-843-005 | contract step `discard` with 12-card declarer hand | `discardCards` | chosen pair is legal and exactly 2 cards; no phase leak to whist/play | REQ-1758, REQ-1759 |
| AI-843-006 | contract step `whist-decision` on six spades | `whist` / `halfWhist` / `pass` | chosen action is legal and uses six-spades non-mandatory-whist context | REQ-1758, REQ-1759, AC-2425 |
| AI-843-007 | contract step `whist-decision` on ten-level game | `check` | AI selects `check`; no `whist`/`halfWhist` path is attempted | REQ-1758, REQ-1759, AC-2425 |
| AI-843-008 | play mode `all-pass` with active AI and deterministic hand | `playCard` | chosen card is legal and reflects all-pass trick context, not bidding/contract heuristics | REQ-1758, REQ-1759, AC-2425 |
| AI-843-009 | play mode `misere` with forced safe vs risky options | `playCard` | chosen card is legal and fixture distinguishes misere context from ordinary contract play | REQ-1758, REQ-1759, AC-2425 |
| AI-843-010 | play mode `contract` while following suit is mandatory | `playCard` | AI always follows suit when suit exists in hand | REQ-1758 |
| AI-843-011 | play mode `contract` where actor is void in lead suit but has trump | `playCard` | chosen card is legal under trump/void context; no illegal off-suit leak | REQ-1758, REQ-1759 |
| AI-843-012 | play mode `contract` as leader with multiple legal leads | `playCard` | fixture pair proves choice depends on contract/trump/trick role rather than global first-action fallback | REQ-1759, AC-2425 |
| AI-843-013 | settlement/continuation states controlled by AI | `settleDeal` / `startNextDeal` | chosen action remains legal in non-play terminal transitions | REQ-1758 |
| AI-843-014 | any AI-controlled state with empty legal actions stubbed or impossible | error path | explicit thrown error includes phase and diagnostic context expectations | REQ-1758, observability |

## Scenario Details

### AI-843-001 Legal action property across every AI-controlled phase

Fixture state:

- table-driven suite over `bidding`, `contract/order`, `contract/widow-pickup`, `contract/discard`, `contract/whist-decision`, `play/all-pass`, `play/misere`, `play/contract`, `deal-settlement`, `next-deal`

Action type:

- whatever `chooseAiAction` returns for the current phase

Assertions:

- `getLegalActions(state).length > 0`
- `chooseAiAction(state, seed)` does not throw
- returned action deep-matches one member of `getLegalActions(state)`
- action type belongs to the current phase only

Implementation note:

- This is the non-negotiable property test backing `PERSONAL-REQ-1758`.

### AI-843-002 Bidding uses bidding context, not first-action fallback

Fixture state:

- at least two bidding fixtures with different strongest legal bids
- one fixture where `pass` is first in legal order but a bid should still be preferred by heuristic
- one fixture where bidding higher than current contract is legal but misere is not

Action type:

- `bidGame`, `bidMisere`, or `pass`

Assertions:

- chosen action is legal
- cross-fixture results are not identical when the legal set ordering is similar but bid context differs
- AI does not always return `legal[0]`

Minimum implementation pattern:

- compare `formatAction(chosen)` against `formatAction(legal[0])`
- require at least one fixture where chosen action differs from first legal action

### AI-843-003 Contract order uses winning-bid context

Fixture state:

- `makeContractOrderState({ type: 'game', level: 6, suit: 'clubs' })`
- variant with a higher winning bid

Action type:

- `orderContract`

Assertions:

- chosen contract is one of `getLegalActions(state)`
- chosen contract never ranks below the winning bid
- cross-fixture result changes when winning-bid floor changes

### AI-843-004 Widow pickup is phase-correct

Fixture state:

- contract state at `step: 'widow-pickup'`

Action type:

- `pickupWidow`

Assertions:

- AI picks `pickupWidow`
- no attempt is made to discard, whist, or play before pickup

### AI-843-005 Discard uses discard context

Fixture state:

- declarer at `step: 'discard'` with 12 cards after widow pickup
- one fixture where two obvious low off-suit cards exist
- one fixture where trump-protection tradeoff exists

Action type:

- `discardCards`

Assertions:

- returned action is legal
- exactly two card ids are returned
- both card ids exist in declarer hand
- discard choice differs across fixtures with materially different contract/trump context

### AI-843-006 Whist decision uses six-spades profile context

Fixture state:

- `makeWhistState({ type: 'game', level: 6, suit: 'spades' })`

Action type:

- `whist`, `halfWhist`, or `pass`

Assertions:

- chosen action is legal
- AI does not throw due to absent mandatory-whist assumption
- result proves the phase logic recognizes six-spades profile rules

### AI-843-007 Ten-level game uses check context

Fixture state:

- `makeWhistState({ type: 'game', level: 10, suit: 'hearts' })`

Action type:

- `check`

Assertions:

- legal set is exactly `[{ type: 'check' }]` or equivalent single-action set
- AI returns `check`
- no `whist`/`halfWhist` fallback is attempted

### AI-843-008 All-pass play uses all-pass context

Fixture state:

- `phase: 'play'`, `mode: 'all-pass'`, deterministic short hands, no trump
- one fixture where leading a specific low-risk card is desirable

Action type:

- `playCard`

Assertions:

- returned card is legal
- card belongs to actor hand
- selection differs from a contract-play analog fixture when legal ordering is held stable

### AI-843-009 Misere play uses misere context

Fixture state:

- `phase: 'play'`, `mode: 'misere'`
- actor has more than one legal card and fixtures encode different danger levels

Action type:

- `playCard`

Assertions:

- returned card is legal
- chosen card is not explained by a phase-blind first legal action in every fixture
- misere fixture pair produces behavior distinguishable from contract-play pair

### AI-843-010 Contract play always follows suit when possible

Fixture state:

- `makePlayState(...)` with actor holding lead suit and at least one off-suit card

Action type:

- `playCard`

Assertions:

- chosen card id belongs to a lead-suit card
- repeated seeds never produce an off-suit illegal choice

### AI-843-011 Contract play respects void/trump legality

Fixture state:

- `makePlayState(...)` where actor is void in lead suit but holds trump and non-trump cards

Action type:

- `playCard`

Assertions:

- returned card is legal
- chosen action never violates engine trump/void restrictions
- fixture should be written so an illegal naive off-suit card would be easy to spot

### AI-843-012 Contract lead uses trick-role context

Fixture state:

- leader in contract play with 2+ legal leads
- pair of fixtures changes only contract/trump/trick-role context while preserving action ordering as much as possible

Action type:

- `playCard`

Assertions:

- chosen card is legal
- at least one paired fixture produces a different decision than `legal[0]`
- paired result demonstrates role/context sensitivity

### AI-843-013 Terminal continuation states remain legal

Fixture state:

- `deal-settlement` state with `settleDeal`
- `next-deal` state with `startNextDeal`

Action type:

- `settleDeal`, `startNextDeal`

Assertions:

- AI chooses the only legal continuation action
- no thrown error on AI-driven continuation steps

### AI-843-014 Stuck/failure diagnostics are observable

Fixture state:

- artificial or mocked state where `getLegalActions(state)` returns `[]`
- optional stub where chooser returns an illegal action to verify harness diagnostics

Action type:

- error path

Assertions:

- thrown error includes current phase at minimum
- integration harness captures seed, step, phase, actor, legal action keys, and recent log tail
- reportable failure distinguishes:
  - no legal actions from engine
  - chooser returned illegal action
  - repeated state/no-progress loop

## Observability Expectations For MZ-303

When AI-related tests fail, diagnostics must include enough evidence to reproduce the failure without rerunning in a debugger.

Minimum failure payload:

- seed
- scenario id
- phase and, when applicable, `contract.step` or `play.mode`
- actor
- legal action keys
- chosen action key
- top-level contract summary
- current trick cards
- hand ids for acting player
- recent `state.log` tail

Recommended sources:

- extend `formatAction(...)` / harness trace formatting from `src/test/integrationHarness.ts`
- on stuck-loop checks, include prior N trace entries and repeated summary snapshot

## Regression Mapping

| Requirement / AC | Required scenario coverage |
|---|---|
| PERSONAL-REQ-1758 | AI-843-001, AI-843-003, AI-843-004, AI-843-005, AI-843-006, AI-843-007, AI-843-008, AI-843-009, AI-843-010, AI-843-011, AI-843-012, AI-843-013, AI-843-014 |
| PERSONAL-REQ-1759 | AI-843-002, AI-843-003, AI-843-005, AI-843-006, AI-843-007, AI-843-008, AI-843-009, AI-843-011, AI-843-012 |
| PERSONAL-AC-2424 | AI-843-001, AI-843-013, AI-843-014 |
| PERSONAL-AC-2425 | AI-843-002, AI-843-006, AI-843-007, AI-843-008, AI-843-009, AI-843-012 |
| PERSONAL-STD-063 | AI-843-006, AI-843-007, AI-843-008, AI-843-009 |

## Implementation Notes For MZ-302 / MZ-303

- Prefer one table-driven legality suite plus focused per-phase heuristic suites.
- Keep phase-context assertions strong enough to fail the current simplistic fallback pattern in `src/ai/heuristicAi.ts`.
- Add a deterministic smoke/regression scenario that repeatedly advances AI-controlled states and fails on:
  - illegal action
  - thrown error with non-empty legal set
  - repeated no-progress state
- Do not assert exact “best” card or exact DOS-like strategy unless the fixture is intentionally narrow; assert legality plus context-sensitive divergence instead.

