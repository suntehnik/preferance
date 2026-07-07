# US-844 Bullet Scoring QA Test Design

Refs: PERSONAL-US-844; PERSONAL-REQ-1760; PERSONAL-REQ-1761; PERSONAL-AC-2426; PERSONAL-AC-2427; PERSONAL-STD-063
Task: PERSONAL-TASK-1153 / MZ-401
Component: default
Layer: qa-test-design
Phase: implementation
Depends on: MZ-208
Required setup: fixed Sochi agreement profile from US-842; deterministic deal fixtures only; no backend, auth, or external services.
QA risk level: critical
Accessibility/visual QA: required for score and result display.
Security review: not needed; scope is local scoring/state/UI behavior with no auth, backend, or sensitive data.
Release gate required: yes

## Goal

Define the scoring test contract for later US-844 workers so that MZ-402, MZ-403, MZ-404, MZ-405, and MZ-406 can implement and verify:

- bullet updates for successful contracts
- mountain penalties for failed contracts and misere failures
- mutual-whist state updates
- progressive all-pass scoring under the fixed Sochi profile
- deal-settlement state transitions
- bullet completion and final settlement/result exposure
- score/result UI expectations, including accessibility and visual checks

Visible deal history stays out of scope. Technical history may be used to build deterministic fixtures and reproduce failures.

## Current Source Alignment

Current code surfaces that this design must align with:

- score state: `src/domain/state.ts` -> `Score { bullet, mountain, whists }`
- scoring helpers: `src/domain/scoring.ts`
- settlement path: `src/domain/engine.ts` -> `settleScores(...)`, `applySettlementAction(...)`
- current tests: `src/domain/scoring.test.ts`, `src/domain/engine.test.ts`, `src/test/ruleFlow.integration.test.ts`
- current score/result renderer surface: `src/ui/render.ts`

Current code-backed scoring behavior already present:

- successful game contract: declarer bullet increases by `contractBulletValue(contract)` where 6/7/8/9/10 => 2/4/6/8/10
- successful misere: declarer bullet `+10`
- failed game contract: declarer mountain increases by `contract.level - tricksTakenByDeclarer`
- failed misere: declarer mountain increases by `tricksTakenByDeclarer * 10`
- progressive all-pass: trick value is `min(allPassCount, 3)`; zero-trick player gets bullet `+trickValue`, players with tricks get mountain `+tricks * trickValue`
- bullet completion triggers only when every player reaches `bulletTarget`

Current gaps that later tasks must not guess silently:

- `PERSONAL-STD-063` explicitly says exact whist / half-whist / undertrick formulas remain an open rule gap.
- final ranking uses settled whists: clean directed whists plus mountain settlement normalized across players.
- `src/ui/render.ts` currently shows summary text for settlement and finish states, but not a full score table or final result breakdown.

This document therefore separates:

1. executable numeric scenarios already anchored in current code and accepted MVP behavior
2. provisional scoring-contract scenarios that must be implemented consistently once US-844 scoring decisions are locked

## Canonical Fixture Rules

Use these fixture rules in all later tasks:

1. Player order is fixed as `0=You`, `1=AF Computers`, `2=VIMCOM`.
2. Score fixtures must preserve the full `Score` shape for all three players, including `whists`.
3. Mutual-whist fixtures use a directed 3x3 matrix with these invariants:
   - diagonal entries stay `0`
   - pair entries stay antisymmetric: `scores[a].whists[b] === -scores[b].whists[a]`
4. Every settlement fixture must include:
   - `phase`
   - `mode`
   - `contract`
   - `declarer`
   - `tricksTaken`
   - `whistResponses`
   - `scores`
   - `bulletTarget`
   - `settlementSummary` or `winnerSummary`
5. UI fixtures may use technical history/log lines for debugging, but visible historical deal lists remain out of scope.

Recommended named fixture baselines:

- `scoreZero`: all bullet/mountain/whists are zero
- `scoreCarry`: P0 `{ bullet: 6, mountain: 1, whists: [0, 4, -2] }`, P1 `{ bullet: 2, mountain: 3, whists: [-4, 0, 5] }`, P2 `{ bullet: 1, mountain: 0, whists: [2, -5, 0] }`
- `scoreNearFinish`: P0 `{ bullet: 8, mountain: 1, whists: [0, 4, -2] }`, P1 `{ bullet: 4, mountain: 3, whists: [-4, 0, 5] }`, P2 `{ bullet: 3, mountain: 0, whists: [2, -5, 0] }`

## Executable Scenario Matrix

| Scenario ID | Fixture state | Expected score delta | Expected totals | UI assertion target | Verification type | Trace |
|---|---|---|---|---|---|---|
| SC-844-001 | successful 6-spades contract from `scoreZero`; declarer=P0; tricks=`[6,2,2]` | P0 bullet `+2` | P0 `{2,0,[0,0,0]}`; P1/P2 unchanged | deal result names declarer success and updated bullet row | unit + integration + UI | REQ-1760, REQ-1761, AC-2426 |
| SC-844-002 | successful 7-clubs contract from `scoreZero`; declarer=P0; tricks=`[7,2,1]` | P0 bullet `+4` | P0 bullet `4`; all mountain/whists unchanged | score table shows `4` in bullet for P0 | unit | REQ-1760 |
| SC-844-003 | successful 8-diamonds contract from `scoreZero`; declarer=P1; tricks=`[1,8,1]` | P1 bullet `+6` | P1 bullet `6`; others unchanged | score table highlights only declarer row delta | unit | REQ-1760 |
| SC-844-004 | successful 9-hearts contract from `scoreCarry`; declarer=P2; tricks=`[0,1,9]` | P2 bullet `+8` | P0 `{6,1,[0,4,-2]}`; P1 `{2,3,[-4,0,5]}`; P2 `{9,0,[2,-5,0]}` | current-deal result leaves non-declarer scores untouched | unit + integration | REQ-1760, AC-2426 |
| SC-844-005 | successful 10-no-whist/check-equivalent contract from `scoreCarry`; declarer=P1; tricks=`[0,10,0]` | P1 bullet `+10` | P1 `{12,3,[-4,0,5]}` | bullet-complete path becomes eligible because bullet >= target 10 | unit + integration | REQ-1760, REQ-1761, AC-2426, AC-2427 |
| SC-844-006 | successful misere from `scoreZero`; declarer=P1; tricks=`[0,0,0]` for declarer | P1 bullet `+10` | P1 bullet `10`; others unchanged | result copy distinguishes misere from game contract | unit + integration + UI | REQ-1760, REQ-1761 |
| SC-844-007 | failed 6-level game from `scoreZero`; declarer=P0; tricks=`[5,3,2]` | P0 mountain `+1` | P0 `{0,1,[0,0,0]}` | score table shows mountain penalty, not bullet gain | unit + integration + UI | REQ-1760, AC-2426 |
| SC-844-008 | failed 8-level game from `scoreCarry`; declarer=P1; tricks=`[1,6,3]` | P1 mountain `+(8-6)=2` | P1 `{2,5,[-4,0,5]}` | carry-over bullet/whists remain unchanged | unit | REQ-1760 |
| SC-844-009 | failed misere from `scoreCarry`; declarer=P2; tricks=`[4,3,3]` and declarer took `3` tricks | P2 mountain `+30` | P2 `{1,30,[2,-5,0]}` | deal-result summary names misere failure and penalty | unit + integration + UI | REQ-1760, REQ-1761, AC-2426 |
| SC-844-010 | first all-pass from `scoreZero`; allPassCount=`1`; tricks=`[0,2,8]` | P0 bullet `+1`; P1 mountain `+2`; P2 mountain `+8` | P0 `{1,0,[0,0,0]}`; P1 `{0,2,[0,0,0]}`; P2 `{0,8,[0,0,0]}` | score table displays mixed bullet/mountain update in one settlement | unit + integration | REQ-1760, REQ-1761, AC-2426 |
| SC-844-011 | third progressive all-pass from `scoreZero`; allPassCount=`3`; tricks=`[0,2,8]` | P0 bullet `+3`; P1 mountain `+6`; P2 mountain `+24` | P0 `{3,0,[0,0,0]}`; P1 `{0,6,[0,0,0]}`; P2 `{0,24,[0,0,0]}` | settlement summary and score table agree on final totals | unit + integration | REQ-1760, REQ-1761, AC-2426, STD-063 |
| SC-844-012 | progressive all-pass saturation from `scoreCarry`; allPassCount=`5`; tricks=`[1,0,9]` | cap trickValue at `3`: P0 mountain `+3`; P1 bullet `+3`; P2 mountain `+27` | P0 `{6,4,[0,4,-2]}`; P1 `{5,3,[-4,0,5]}`; P2 `{1,27,[2,-5,0]}` | UI must not show values based on `5`; must show saturated `3`-value outcome | unit + integration + UI | REQ-1760, STD-063 |
| SC-844-013 | deal-settlement state entered after final trick | no score delta yet before `settleDeal` | phase=`deal-settlement`; `settlementSummary` populated; legal action is only `settleDeal` | UI exposes current result summary and one clear confirmation action | integration + UI + accessibility | REQ-1761, AC-2426 |
| SC-844-014 | non-terminal settlement from SC-844-011 after `settleDeal` | applied totals from settlement; no extra delta on next-deal entry | phase=`next-deal`; previousSummary preserved; scores equal settled totals | UI exposes next-deal continuation and leaves settled score table visible | integration + UI | REQ-1761, AC-2426 |
| SC-844-015 | bullet completion from `scoreNearFinish`; successful 6-level contract by P0 | P0 bullet `+2` | P0 bullet `10`; finished state reached; no legal continuation actions | final result screen blocks accidental next-deal continuation | integration + UI + accessibility | REQ-1761, AC-2427 |

## Provisional Scenarios Requiring Locked Scoring Contract

These rows are mandatory for US-844, but the exact numeric formula is still unresolved in `PERSONAL-STD-063`. Later tasks must either:

- implement these exact assumptions and record the product decision, or
- replace them with an approved scoring contract before claiming US-844 complete.

Until then, tests for these rows should be checked in as explicit pending/TODO scenarios, not omitted.

### Whist / Mutual Whist Contract Assumptions

Assumption set for MZ-403 and MZ-404 unless product says otherwise:

- full whist writes pairwise points between declarer and each whisting defender
- half-whist writes exactly half of the corresponding full-whist pair delta for the same trick outcome
- pass/check do not modify `whists`
- whist updates must preserve directed-matrix antisymmetry and zero diagonals
- declarer bullet/mountain settlement happens in the same atomic deal result as whist updates

| Scenario ID | Fixture state | Provisional expected delta | Expected totals/invariants | Verification type | Trace |
|---|---|---|---|---|---|
| SC-844-016 | successful 8-hearts contract from `scoreCarry`; declarer=P0; defenders responses=`['whist','pass']`; defender tricks=`P1=2,P2=0` | update only P0<->P1 whist pair; P0 bullet still `+6` | diagonals stay `0`; P0/P2 and P1/P2 pair entries unchanged; non-whisting defender gets no whist delta | unit + integration | REQ-1760, REQ-1761, AC-2426 |
| SC-844-017 | same as SC-844-016 but defender response=`['half-whist','pass']` | pairwise delta magnitude is exactly half of SC-844-016 | antisymmetry preserved; bullet/mountain outcome identical to full-whist fixture aside from reduced whist delta | unit | REQ-1760, STD-063 |
| SC-844-018 | failed 7-clubs contract with one full whister and one passer | declarer mountain penalty and whist deltas are both applied in one settlement | final `scores` object reflects mountain plus mutual-whist updates without overwriting either | unit + integration | REQ-1760, REQ-1761 |
| SC-844-019 | two whisting defenders on one game contract | both declarer pair entries update independently | P0<->P1 pair update must not leak into P0<->P2 pair or defender-defender pair unless product explicitly requires it | unit | REQ-1760 |

### Final Settlement / Final Result Contract Assumptions

Assumption set for MZ-405 and MZ-406 unless product says otherwise:

- bullet completion is not enough by itself; the app must expose a final result object or summary derived from bullet, mountain, and mutual whists
- final result ordering must be deterministic and reproducible from one fixture object
- finished-state UI must show both winner/ranking and the final per-player score table
- save/load must treat a finished bullet as non-resumable

| Scenario ID | Fixture state | Provisional expected outcome | UI assertions | Verification type | Trace |
|---|---|---|---|---|---|
| SC-844-020 | final-settlement fixture with three distinct final totals | result payload includes ordered ranking `[winner, second, third]` plus per-player final totals | final result screen shows ranking and score table together; no start-next-deal action exists | unit + integration + UI | REQ-1761, AC-2427 |
| SC-844-021 | tie-adjacent fixture where bullet leader is not mountain leader | tie-break rule is explicit and deterministic in fixture expectation | UI shows stable ordering that matches domain result object, not row order or actor order | unit + UI | REQ-1761, AC-2427 |
| SC-844-022 | finished bullet persisted through save/load | active save is not offered for resume | resume UI suppresses continue button for completed bullet | integration + persistence + UI | AC-2427 |

## Required UI Assertions For Score And Result Tasks

These assertions are mandatory for MZ-405 and MZ-406:

1. Score table is visible during active bullet play, deal settlement, next-deal, and finished states.
2. Each player row exposes:
   - player name
   - bullet value
   - mountain value
   - mutual-whist values against the other two players
3. Deal-result state shows:
   - textual settlement summary
   - updated score table
   - one primary confirmation action only
4. Finished state shows:
   - final result summary or ranking
   - final score table
   - no accidental continuation action
5. UI must not rely on log/history text as the only source of score/result information.

## Accessibility And Visual QA Applicability

Accessibility checks required:

- score table has a programmatic table structure or equivalent labeled grid semantics
- row/column labels are announced clearly for bullet, mountain, and whists
- settlement and finished summaries are readable without relying on color only
- focus order reaches result confirmation and any restart/new-bullet action predictably
- no hidden disabled control suggests the bullet can continue after completion

Visual checks required:

- desktop score table fits at 1280x800 without overlapping the action area or card table
- long numeric values and negative whist values remain readable
- deal-settlement and finished layouts still show the score table above the fold
- final result hierarchy makes winner/ranking obvious without hiding raw totals

## Mapping To Follow-Up Tasks

- `MZ-402`: implement code-backed scoring unit tests for SC-844-001 through SC-844-012
- `MZ-403`: lock whist/mutual-whist scoring contract and implement SC-844-016 through SC-844-019
- `MZ-404`: integrate settlement-path fixtures for SC-844-013 through SC-844-019
- `MZ-405`: implement final-settlement/result behavior and UI for SC-844-015 and SC-844-020 through SC-844-022
- `MZ-406`: accessibility and visual verification for score/result display using the same deterministic fixtures

## Downstream Notes

- Current `src/domain/scoring.ts` and `src/domain/engine.ts` do not yet update mutual-whist values or compute a final bullet settlement object.
- Current `src/ui/render.ts` shows settlement/finish summary text only; a real score/result surface is still needed for US-844 acceptance.
- Later tasks should reuse the existing engine/scoring fixture builders where possible and add scoring-specific helpers rather than embedding large handwritten states in each test.
