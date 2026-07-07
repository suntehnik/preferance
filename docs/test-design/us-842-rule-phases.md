# US-842 Rule Phases QA Test Design

Refs: PERSONAL-US-842; PERSONAL-REQ-1755; PERSONAL-REQ-1756; PERSONAL-REQ-1757; PERSONAL-AC-2422; PERSONAL-AC-2423; PERSONAL-STD-063
Task: PERSONAL-TASK-1139 / MZ-201
Component: default
Layer: qa-test-design
Phase: implementation
Required setup: deterministic rule fixtures only; no backend, auth, or external environment.
QA risk level: critical
Security review: not needed; scope is local rules/state logic with no auth, backend, or sensitive data.
Release gate required: yes

## Goal

Define executable scenarios for the fixed Sochi MVP rules profile so later implementation and verification tasks can build legal-action generation, rule transitions, trick resolution, settlement, and bullet completion coverage from one source of truth.

This document is the test-design input for:

- MZ-202: rules engine and legal-action implementation
- MZ-204: rule integration and regression coverage
- later release and verification tasks for US-842 / US-846

## Scope And Source Refs

In scope:

- bidding and bid ordering
- all-pass detection and progression
- contract ordering
- widow pickup and discard
- whist / half-whist / pass decisions
- contract trick play
- misere trick play
- trick winner calculation and next lead
- deal settlement transition
- next deal transition
- bullet completion transition
- legal action generation for every supported phase

Out of scope:

- exact DOS emulation beyond the fixed profile
- AI policy quality beyond legal-action consumption
- final score formula audit beyond transition/readiness expectations
- accessibility and visual validation of action controls

Primary rule evidence:

- `PERSONAL-REQ-1755`, `PERSONAL-REQ-1756`, `PERSONAL-REQ-1757`
- `PERSONAL-AC-2422`, `PERSONAL-AC-2423`
- `PERSONAL-STD-063`
- local reverse-engineering note: `/Users/dvaletin/development/Maryazh_330/docs/reverse-engineering/marriage-exe-findings.md`

## Fixed Agreement Profile Assumptions

All scenarios in this document assume one explicit fixed Sochi MVP profile. Implementation and tests must not treat these as configurable for US-842:

- six spades does not require mandatory whist
- ten-level games are checked, not whisted
- whist is half-responsible
- all-pass scoring is progressive
- all-pass exits by a six-level game
- supported deal families are game contracts, all-pass deals, and misere

If code later introduces configurable agreements, US-842 tests still need one locked fixture profile matching the bullets above.

## State Model Assumptions

Recommended canonical phases for implementation/test fixtures:

1. `bidding`
2. `contract-order`
3. `widow-pickup`
4. `discard`
5. `whist-decision`
6. `all-pass`
7. `misere-play`
8. `contract-play`
9. `deal-settlement`
10. `next-deal`
11. `bullet-complete`

Recommended common state fields for fixtures:

- active player / seat
- bidder/declarer
- contract level and trump, or `misere`, or `all-pass`
- widow cards
- current trick cards in play order
- trick counts per player or team role
- whist decision state per defender
- deal history needed for progressive all-pass tracking
- bullet score snapshot and target
- legal actions for current actor derived from rules, never hand-authored in fixtures

## Scenario Matrix

| Scenario ID | Phase / Area | Summary | Trace |
|---|---|---|---|
| RUL-842-001 | bidding | Only ordered bids or pass are exposed; lower/equal illegal bids are blocked | REQ-1756, AC-2422 |
| RUL-842-002 | bidding -> all-pass | Three passes with no contract selected transition to all-pass deal flow | REQ-1756, AC-2422 |
| RUL-842-003 | bidding -> contract-order | Winning bid transitions to contract ordering with declarer active | REQ-1756, AC-2422 |
| RUL-842-004 | contract-order | Declarer can choose only contracts consistent with the winning bid family/order rules | REQ-1756, AC-2422 |
| RUL-842-005 | widow-pickup | Declarer receives widow before discard and no other actor can act | REQ-1756, AC-2422 |
| RUL-842-006 | discard | Declarer must discard exactly the legal count before whist decisions or play continue | REQ-1756, AC-2422 |
| RUL-842-007 | whist six spades | Six spades allows defenders to decline whist; mandatory whist is not enforced | REQ-1755, AC-2422 |
| RUL-842-008 | whist ten-level | Ten-level game exposes check/pass path, not whist choices | REQ-1755, AC-2422 |
| RUL-842-009 | half-whist | Half-whist is an explicit legal action when whist is available | REQ-1755, REQ-1756, AC-2422 |
| RUL-842-010 | defender pass | Defender pass/check options appear only where profile allows them | REQ-1755, REQ-1756, AC-2422 |
| RUL-842-011 | contract-play | Only legal card plays are exposed during contract trick play | REQ-1756, AC-2422 |
| RUL-842-012 | misere-play | Misere deal uses misere play path and legal card generation | REQ-1756, AC-2422 |
| RUL-842-013 | trick resolution | Three-card trick records winner, increments trick counts, clears trick, sets next lead | REQ-1757, AC-2423 |
| RUL-842-014 | all-pass scoring | All-pass settlement uses progressive scoring state | REQ-1755, REQ-1756, AC-2422 |
| RUL-842-015 | all-pass exit | After all-pass, the next contract opening starts at six-level | REQ-1755, REQ-1756, AC-2422 |
| RUL-842-016 | deal settlement | Completed play transitions to deal settlement with outcome data ready for scoring/UI | REQ-1756, AC-2422 |
| RUL-842-017 | next deal | Non-terminal settlement transitions to next deal setup with preserved bullet state | REQ-1756, AC-2422 |
| RUL-842-018 | bullet completion | Target reached transitions to bullet completion and prevents further deal continuation | REQ-1756, AC-2422 |

## Legal Action Generation Scenarios Per Phase

### Bidding

#### RUL-842-001: ordered bids and pass only

Given a bidding state with an active bidder and current highest bid
When legal actions are generated
Then the set contains only `pass` and bids strictly higher than the current highest legal bid.

Assertions:

- no duplicate bids
- no lower/equal bid than current contract
- no play/discard/whist actions leak into bidding

### All-Pass Entry

#### RUL-842-002: all players pass in opening bidding

Given no contract has been selected and each player passes in turn
When the third pass resolves
Then the deal transitions to `all-pass` rather than contract ordering.

Assertions:

- active phase changes away from `bidding`
- declarer is unset or marked not applicable
- all-pass scoring context is initialized for settlement

### Contract Ordering

#### RUL-842-003: winning bid advances to contract ordering

Given bidding ends with a winning player and bid
When bidding resolves
Then the active phase becomes `contract-order` and the winner is the active actor.

#### RUL-842-004: contract order respects winning bid family

Given the winning player enters contract ordering
When legal actions are generated
Then the available contract choices are limited to the valid order at or above the winning bid and exclude unrelated phase actions.

Assertions:

- only contract-order actions are present
- contract below the winning bid is excluded
- misere appears only if the winning path supports it in the state model

### Widow Pickup

#### RUL-842-005: widow pickup is declarer-only

Given a non-all-pass, non-misere contract that requires widow handling
When the deal enters `widow-pickup`
Then only the declarer can perform the pickup action and the widow cards move into the declarer hand before discard.

### Discard

#### RUL-842-006: declarer must complete discard before progress

Given the declarer has picked up the widow
When legal actions are generated in `discard`
Then only card discard actions consistent with required discard count are exposed until the discard is complete.

Assertions:

- exactly the expected number of discard steps are allowed
- whist/play transitions are blocked before discard completion

### Whist / Half-Whist / Pass

#### RUL-842-007: six spades does not require mandatory whist

Given a six spades contract reaches defender decision
When legal actions are generated for the first defender
Then the defender may choose a non-whist option and the engine does not force whist.

#### RUL-842-008: ten-level games are checked, not whisted

Given a ten-level game reaches defender decision
When legal actions are generated
Then no `whist` or `half-whist` action is exposed; only the profile's check/pass continuation is available.

#### RUL-842-009: half-whist is explicit

Given a whist-eligible contract under the fixed profile
When a defender is prompted
Then `whist`, `half-whist`, and allowed decline/pass variants are exposed exactly where applicable.

#### RUL-842-010: defender pass/check availability is phase-correct

Given defender decision states across six-level, ten-level, and standard whistable contracts
When legal actions are generated
Then pass/check appears only in the states allowed by the fixed profile and never appears in trick-play states.

### Contract Trick Play

#### RUL-842-011: contract play exposes only playable cards

Given a live contract trick with one active actor
When legal actions are generated
Then only card-play actions from the active actor hand are exposed for `contract-play`.

Minimum fixture expectations:

- empty hand is impossible before settlement
- no bid/whist/discard actions appear
- current trick state is preserved until the third card resolves

### Misere

#### RUL-842-012: misere uses dedicated play path

Given a misere contract has been ordered
When the deal enters trick play
Then the phase uses `misere-play` or equivalent dedicated deal type and legal actions are card plays only.

Assertions:

- no whist decisions occur for misere
- settlement path identifies deal type as misere

### Trick Resolution

#### RUL-842-013: trick winner and next lead update

Given a trick with exactly two cards already on table and a legal third card available
When the active actor plays the third card
Then the engine:

- determines the trick winner
- increments the winner's trick count
- clears the current trick
- makes the winner the next leader

This scenario is the direct executable trace for `PERSONAL-REQ-1757` and `PERSONAL-AC-2423`.

### All-Pass Settlement And Exit

#### RUL-842-014: all-pass scoring is progressive

Given the bullet contains prior all-pass history and a current all-pass deal completes
When the deal settles
Then the settlement reads the progression state and applies the next progressive all-pass value rather than a flat constant.

#### RUL-842-015: all-pass exits by a six-level game

Given one or more all-pass deals have occurred
When the next non-all-pass contract bidding begins
Then the contract ladder reopens from six-level rather than inheriting a higher forced starting point.

### Deal Settlement And Next Deal

#### RUL-842-016: completed play transitions to deal settlement

Given the last trick of a contract, all-pass, or misere deal is resolved
When no playable cards remain
Then the phase becomes `deal-settlement` with enough outcome data for scoring and result presentation.

#### RUL-842-017: non-terminal settlement advances to next deal

Given a deal settles and the bullet target has not been reached
When settlement completes
Then the engine creates the next deal state, rotates/setup lead/dealer according to implementation contract, and keeps bullet score/history.

### Bullet Completion

#### RUL-842-018: bullet completion blocks further deal continuation

Given settlement reaches the bullet completion condition
When the settlement finalizes
Then the phase becomes `bullet-complete`, final result data is exposed, and no `start-next-deal` action is legal.

## Transition Scenarios

### Deal Settlement Transition Set

Use one terminal-play fixture per deal family:

- standard contract completes after final trick
- misere completes after final trick
- all-pass completes after final trick

For each:

- transition source phase is play (`contract-play` or `misere-play` or `all-pass`)
- transition target phase is `deal-settlement`
- legal actions after transition exclude card play
- outcome payload contains winner/trick or equivalent scoring inputs

### Next Deal Transition Set

Use one non-terminal bullet fixture for each deal family above.

Assertions:

- score state persists into next deal
- progression state for all-pass history persists
- next deal deck/hand/trick state resets
- bullet remains active

### Bullet Completion Transition Set

Use one fixture where settlement exactly reaches bullet target and one where target is exceeded by settlement.

Assertions:

- both transition to `bullet-complete`
- no next-deal action is legal
- resume/persistence tasks can later treat this bullet as completed

## Trick-Winner Fixtures

These fixtures should be promoted into shared rule tests so both unit and integration layers can reuse them.

### TW-842-001: trump beats higher off-suit

- Contract: hearts trump
- Lead: `9S`
- Second: `AS`
- Third: `7H`
- Expected winner: third player by trump
- Expected next leader: third player

### TW-842-002: highest lead-suit wins when no trump played

- Contract: clubs trump
- Lead: `8D`
- Second: `QD`
- Third: `9S`
- Expected winner: second player by highest diamond
- Expected next leader: second player

### TW-842-003: earlier high trump remains winner

- Contract: spades trump
- Lead: `10H`
- Second: `JS`
- Third: `9S`
- Expected winner: second player
- Expected next leader: second player

### TW-842-004: misere still uses normal trick winner mechanics

- Deal type: misere
- Lead: `7C`
- Second: `KC`
- Third: `8C`
- Expected winner: second player
- Expected next leader: second player

## All-Pass And Misere Fixtures

### AP-842-001: opening all-pass

- bidding sequence: pass / pass / pass
- resulting deal type: all-pass
- expected next active phase: `all-pass`
- expected settlement note: progressive all-pass index starts from baseline value

### AP-842-002: repeated all-pass progression

- prior bullet history: at least one completed all-pass already recorded
- current bidding sequence: pass / pass / pass
- resulting settlement uses progression step `n + 1`
- follow-up bidding after exit begins at six-level

### MIS-842-001: ordered misere skips whist decisions

- winning/declarer state selects misere
- next playable phase is `misere-play`
- no `whist`, `half-whist`, or defender check action is generated

### MIS-842-002: misere final trick reaches settlement

- misere deal with one remaining card per player
- third card completes the final trick
- transition target: `deal-settlement`
- settlement payload identifies misere as the deal family

## Regression And NFR Notes

Regression scope:

- every legal-action generator per phase
- rule transition reducer/state machine boundaries
- trick resolution and next-lead assignment
- all-pass progression state across multiple deals
- misere branch isolation from contract/whist logic
- settlement-to-next-deal and settlement-to-bullet-complete paths

NFR applicability:

- security review: not applicable for US-842 rule logic only
- accessibility review: deferred to MZ-205 for legal-action controls and phase communication
- visual review: deferred to MZ-206 for desktop action layout, active-state visibility, and non-overlap
- release gate: required; US-842 cannot be accepted without legal-action coverage, fixed-profile traceability, transition evidence, and regression evidence

## Implementation Handoff Notes

For MZ-202:

- expose phase-local legal action generators from one rules entrypoint
- keep the fixed Sochi profile explicit in code/constants, not implied by scattered conditionals
- model all-pass progression state directly in bullet state so settlement and next bidding can read it
- keep trick resolution reusable across contract and misere

For MZ-204:

- convert the scenario IDs in this doc into executable test names
- reuse the trick fixtures and all-pass/misere fixtures instead of inventing separate ad hoc data
- include direct traceability comments or table entries back to REQ-1755/1756/1757 and AC-2422/2423
- verify that no UI-facing action list ever exposes an illegal phase action for the human player

## Minimum Acceptance Checklist For This Test Design

- every US-842 phase named in the task has at least one executable scenario
- fixed Sochi profile is explicit and complete
- trick winner expectations are fixture-backed
- all-pass and misere both have dedicated fixtures
- settlement, next deal, and bullet completion transitions are specified
- deferred accessibility/visual gates are called out
- release gate requirement is explicit
