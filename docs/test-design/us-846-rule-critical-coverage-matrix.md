# US-846 Rule-Critical Coverage Matrix

Refs: PERSONAL-US-846; PERSONAL-REQ-1763; PERSONAL-AC-2430; PERSONAL-AC-2431; PERSONAL-STD-063
Task: PERSONAL-TASK-1168 / MZ-601
Component: default
Layer: qa-test-design
Phase: implementation
Depends on: MZ-109; MZ-208; MZ-306; MZ-408; MZ-507
Required setup: accepted US-842 through US-845 test-design and verification evidence, current repo test inventory, and deterministic smoke harness seeds.
QA risk level: critical
Regression verification: required
Release readiness: required
Security review: not applicable for current scope; this epic is a static Vite/localStorage browser app with no auth, backend API, or sensitive server boundary.

## Goal

Trace rule-critical Sochi MVP behavior to concrete automated test owners so later implementation and verification tasks can prove release readiness without overstating coverage from source review or prior reports.

This document is the QA design source for:

- `MZ-602`: add or repair missing executable US-846 test coverage
- `MZ-603`: regression verification against the completed matrix
- `MZ-604`: release-readiness gate for US-846

MZ-601 acceptance is limited to QA/test design: it must expose missing executable
test ownership before final verification. Downstream executable gaps are not
MZ-601 risks when they are explicitly routed below.

## Inputs Reviewed

Spexus artifacts:

- `mcp__spexus.current_context`
- `mcp__spexus.get_task(PERSONAL-TASK-1168)`
- `mcp__spexus.epic_hierarchy(PERSONAL-EP-180, full_hierarchy=true)`

Dependency evidence requested by the task:

- missing at requested path: `task-reports/PERSONAL-US-841/review-cycle-1/review-report.json`
- present: `task-reports/PERSONAL-US-842/review-cycle-1/review-report.json`
- present: `task-reports/PERSONAL-US-843/review-cycle-1/review-report.json`
- present: `task-reports/PERSONAL-US-844/review-cycle-2/review-report.json`
- present: `task-reports/PERSONAL-TASK-1167/attempt-1.json`
- present: `task-reports/PERSONAL-US-845/review-cycle-2/review-report.json`
- present: `task-reports/orchestrator-log.json`

Repo surfaces reviewed:

- `package.json`
- `docs/test-design/us-841-start-resume.md`
- `docs/test-design/us-842-rule-phases.md`
- `docs/test-design/us-843-ai-decisions.md`
- `docs/test-design/us-844-bullet-scoring.md`
- `docs/test-design/us-845-desktop-table-states.md`
- `src/domain/cards.test.ts`
- `src/domain/rules.test.ts`
- `src/domain/engine.test.ts`
- `src/domain/scoring.test.ts`
- `src/persistence/saveStore.test.ts`
- `src/ai/heuristicAi.test.ts`
- `src/test/startResume.integration.test.ts`
- `src/test/ruleFlow.integration.test.ts`
- `src/test/aiDecision.integration.test.ts`
- `src/test/us844Scoring.integration.test.ts`
- `src/test/us845DesktopTable.integration.test.ts`
- `src/test/integrationHarness.ts`
- `src/test/integrationHarness.test.ts`

## Coverage Standard

Evidence in this matrix is classified using these rules:

1. `executable-covered` means a current unit, integration, or smoke test exists in the repo.
2. `design-only-gap` means a prior US design or verification report exists, but US-846 still lacks the executable evidence required by `PERSONAL-REQ-1763`, `PERSONAL-AC-2430`, or `PERSONAL-AC-2431`.
3. `report-only` means prior review or release-gate evidence helps trace scope, but does not satisfy US-846 by itself.
4. `MZ-602 owner` means the matrix expects new or expanded automated tests in that task.
5. `MZ-603 owner` means regression verification must rerun the implemented suite and confirm gaps are closed without new failures.
6. `MZ-604 owner` means release-readiness must confirm the final US-846 gate, NFR classification, and full-bullet smoke acceptability.

## Rule-Critical Coverage Matrix

| Area | Trace | Current executable evidence | Current status | Gaps / notes | Owner |
|---|---|---|---|---|---|
| Deck integrity | REQ-1763, AC-2430 | `src/domain/cards.test.ts`: 32-card deck uniqueness, deterministic shuffle, non-mutating shuffle, sort order | executable-covered | Satisfies unit coverage for deck shape and shuffle invariants | Keep in matrix; MZ-603 rerun |
| Deal integrity | REQ-1763, AC-2430 | `src/domain/cards.test.ts`: three 10-card hands plus 2-card widow; `src/domain/engine.test.ts`: new game starts bidding hand with sorted hands and widow | executable-covered | Good unit coverage for basic deal creation | Keep in matrix; MZ-603 rerun |
| Bid ordering | REQ-1763, AC-2430 | `src/domain/rules.test.ts`: bid ordering and misere overcall; `src/domain/engine.test.ts`: bidding actions and transitions | executable-covered | Covers ordered bids and transition into all-pass / contract paths | Keep in matrix; MZ-603 rerun |
| Fixed agreement profile | REQ-1763, AC-2430, STD-063 | `src/domain/rules.test.ts`: Sochi defaults; `src/domain/engine.test.ts`: six spades, ten-level check; `src/domain/scoring.test.ts`: progressive all-pass saturation; `src/test/ruleFlow.integration.test.ts` | executable-covered | Prior US-842 review confirms profile intent, but executable proof already exists | Keep in matrix; MZ-603 rerun |
| Legal action generation | REQ-1763, AC-2430 | `src/domain/engine.test.ts`: bidding/order/discard/follow-suit/legal whist; `src/test/ruleFlow.integration.test.ts`: legal action flow; `src/test/us845DesktopTable.integration.test.ts`: renderer projects legal actions | executable-covered | Strong unit+integration evidence; UI projection is supporting evidence only | Keep in matrix; MZ-603 rerun |
| Trick winner calculation | REQ-1763, AC-2430 | `src/domain/engine.test.ts`: third-card winner, counts, clear trick, next lead; `src/test/ruleFlow.integration.test.ts`: same through legal actions | executable-covered | Meets explicit AC-level trick-resolution expectation inherited from US-842 | Keep in matrix; MZ-603 rerun |
| Whist / half-whist | REQ-1763, AC-2430 | `src/domain/engine.test.ts`: legal whist choices and no mandatory whist on six spades; `src/domain/scoring.test.ts`: full-whist and half-whist pair deltas; `src/test/aiDecision.integration.test.ts`: AI legal whist decisions | executable-covered | Numeric whist behavior now has unit evidence; prior US-844 design note about unresolved formula is no longer a coverage gap for current code behavior | Keep in matrix; MZ-603 rerun |
| All-pass | REQ-1763, AC-2430 | `src/domain/engine.test.ts`: bidding to all-pass, progressive all-pass settlement, six-level reopen; `src/domain/scoring.test.ts`: first, third, saturated all-pass scoring; `src/test/ruleFlow.integration.test.ts`: full all-pass path | executable-covered | Covers both rules and scoring behavior | Keep in matrix; MZ-603 rerun |
| Misere | REQ-1763, AC-2430 | `src/domain/engine.test.ts`: misere bid transition and settlement; `src/domain/scoring.test.ts`: success and failure scoring; `src/test/ruleFlow.integration.test.ts`: misere flow; `src/test/aiDecision.integration.test.ts`: AI misere play legality | executable-covered | Good breadth across unit and integration | Keep in matrix; MZ-603 rerun |
| Scoring | REQ-1763, AC-2430 | `src/domain/scoring.test.ts`: contract success/failure, misere, all-pass, whists, final ranking; `src/domain/engine.test.ts`: settlement and final completion; `src/test/us844Scoring.integration.test.ts`: score/result UI sync | executable-covered | Strong coverage for current MVP scoring contract | Keep in matrix; MZ-603 rerun |
| Save / load | REQ-1763, AC-2430 | `src/persistence/saveStore.test.ts`: versioned envelope, supported bullet sizes, active-slot replacement, legacy migration, invalid save rejection, finished/non-resumable saves, deal-settlement and next-deal round-trip; `src/test/startResume.integration.test.ts` | executable-covered | The requested US-841 completion report path is missing, but current tests provide direct executable evidence | Keep in matrix; MZ-603 rerun |
| AI legality | REQ-1763, AC-2430 | `src/ai/heuristicAi.test.ts`: legal action selection across phases; `src/test/aiDecision.integration.test.ts`: choose/apply legality across representative phases; harness diagnostics | executable-covered | Strong unit+integration legality evidence | Keep in matrix; MZ-603 rerun |
| Full-bullet smoke | REQ-1763, AC-2431 | `src/test/integrationHarness.test.ts`: deterministic trace replay for 12 steps only; `src/test/integrationHarness.ts`: fullBulletSmoke seed explicitly marked "Reserved seed for future full-bullet smoke runs"; `src/domain/engine.test.ts`: 8-step playable loop smoke only | downstream-gap-routed | No current test completes a whole bullet or proves no stuck actor / no illegal AI action / no unhandled error through bullet completion. This is the main missing executable coverage for AC-2431, explicitly routed out of MZ-601. | `MZ-602` must implement; `MZ-603` rerun; `MZ-604` gate |

## REQ / AC Trace Matrix

| Trace item | Required behavior | Current evidence | Status | Required follow-up |
|---|---|---|---|---|
| `PERSONAL-REQ-1763` | Automated suite covers deck/deal, bidding, fixed agreement profile, legal actions, trick winner, whist/half-whist, all-pass, misere, scoring, save/load, AI legality, full-bullet smoke | All listed areas have executable evidence except full-bullet smoke | downstream-gap-routed | `MZ-602` must add full-bullet smoke and any suite glue needed to make REQ-1763 fully true |
| `PERSONAL-AC-2430` | Rule-critical unit tests execute for deck/deal, bidding, legal actions, trick winner, whist, all-pass, misere, scoring, persistence, AI legality | Existing unit tests cover each category; integration tests reinforce legal-flow and persistence/UI bindings | covered | `MZ-603` should rerun targeted unit+integration commands and confirm no regressions |
| `PERSONAL-AC-2431` | Deterministic seed + simple AI automated full-bullet smoke completes without unhandled error, illegal AI action, or stuck actor | Only short-horizon harness smoke exists today; seed reserved, but no bullet-completion test | downstream-gap-routed | `MZ-602` must add executable smoke; `MZ-603` must rerun it; `MZ-604` must accept/reject release gate based on it |

## Dependency Story Mapping

| Dependency | What it contributes to US-846 | Evidence used here | Notes |
|---|---|---|---|
| `MZ-109 / US-841` | start/resume and persistence design baseline | `docs/test-design/us-841-start-resume.md`, `src/persistence/saveStore.test.ts`, `src/test/startResume.integration.test.ts` | Requested completion report path was missing, so this matrix relies on current executable tests instead of absent completion-gate JSON |
| `MZ-208 / US-842` | rules engine, legal actions, phase transitions, trick winner | `task-reports/PERSONAL-US-842/review-cycle-1/review-report.json`, `docs/test-design/us-842-rule-phases.md`, domain/integration tests | Core source of rule-critical surface area |
| `MZ-306 / US-843` | AI legality and phase-aware decisions | `task-reports/PERSONAL-US-843/review-cycle-1/review-report.json`, `docs/test-design/us-843-ai-decisions.md`, AI tests | Supplies AC-2430 AI legality evidence and AC-2431 smoke prerequisites |
| `MZ-408 / US-844` | scoring, settlement, final result, persistence compatibility | `task-reports/PERSONAL-US-844/review-cycle-2/review-report.json`, `docs/test-design/us-844-bullet-scoring.md`, scoring tests | Needed for any bullet-complete smoke |
| `MZ-507 / US-845` | UI release-readiness evidence and orchestrator sequencing through US-845 | `task-reports/PERSONAL-TASK-1167/attempt-1.json`, `task-reports/PERSONAL-US-845/review-cycle-2/review-report.json`, `task-reports/orchestrator-log.json` | Supporting context only; UI evidence does not replace US-846 executable test obligations |

## MZ-602 Implementation Targets

`MZ-602` should implement the smallest new automated suite that closes the remaining US-846 gap without duplicating already strong unit coverage.

Required additions:

1. Add one deterministic full-bullet smoke test that starts from `createNewGame(deterministicSeeds.fullBulletSmoke)` or an equivalent accepted seed and drives the game to `phase === 'finished'`.
2. Use the real rules engine and real AI chooser, not mocked legal-action lists.
3. Assert at minimum:
   - bullet reaches `finished`
   - no thrown error occurs
   - every chosen AI action remains legal
   - the active actor keeps progressing and the run does not get stuck before completion
   - the run finishes within an explicit step bound to avoid infinite loops
4. Keep existing short-horizon harness diagnostics and extend them if needed for actionable failure output.

Nice-to-have if implementation cost stays low:

- persist/reload the smoke state at one intermediate point and resume to completion with the same deterministic contract
- record a compact end-state summary assertion: winner, ranking length, bullet target reached, and no legal actions in `finished`

## MZ-603 Regression Verification Expectations

`MZ-603` must verify:

1. The coverage matrix remains accurate against the post-`MZ-602` repo.
2. Existing targeted tests still pass:
   - `src/domain/cards.test.ts`
   - `src/domain/rules.test.ts`
   - `src/domain/engine.test.ts`
   - `src/domain/scoring.test.ts`
   - `src/persistence/saveStore.test.ts`
   - `src/ai/heuristicAi.test.ts`
   - `src/test/startResume.integration.test.ts`
   - `src/test/ruleFlow.integration.test.ts`
   - `src/test/aiDecision.integration.test.ts`
   - the new US-846 smoke coverage from `MZ-602`
3. No category in `PERSONAL-REQ-1763` regresses from executable-covered back to report-only.
4. Security review remains not applicable unless `MZ-602` introduces a new sensitive boundary, which is not expected.

## MZ-604 Release-Readiness Expectations

`MZ-604` must not accept US-846 until:

1. `PERSONAL-REQ-1763`, `PERSONAL-AC-2430`, and `PERSONAL-AC-2431` all have current executable evidence.
2. The final full-bullet smoke is clearly classified as automated in-process executable evidence, not source review.
3. The smoke test uses deterministic seed(s) and a documented step bound.
4. Release-readiness explicitly confirms:
   - regression-verification required: satisfied
   - release-readiness required: satisfied
   - security-review: still not applicable

## Downstream Gap Routing

These are not unresolved MZ-601 risks; they are explicitly routed follow-up gates
for the remaining US-846 implementation and verification tasks.

| Routed item | Source evidence | Downstream owner | Required closure evidence |
|---|---|---|---|
| Missing deterministic full-bullet smoke for `PERSONAL-AC-2431` | `src/test/integrationHarness.test.ts` stops at 12 deterministic steps; `src/test/integrationHarness.ts` reserves `fullBulletSmoke` for future full-bullet smoke runs; `src/domain/engine.test.ts` has only a short playable loop | `MZ-602` | Automated test reaches `phase === 'finished'` from deterministic seed/simple AI, records no thrown error, no illegal AI action, no stuck actor, and enforces an explicit step bound |
| Regression confirmation after the smoke is implemented | This matrix plus post-`MZ-602` test inventory | `MZ-603` | Targeted unit/integration/smoke verification reruns and confirms every `PERSONAL-REQ-1763` category remains executable-covered |
| Release-readiness acceptance for US-846 | `PERSONAL-AC-2431` is not executable-covered yet | `MZ-604` | Final release gate confirms `PERSONAL-REQ-1763`, `PERSONAL-AC-2430`, and `PERSONAL-AC-2431` all have current executable evidence |
| Missing requested US-841 completion report path | `task-reports/PERSONAL-US-841/review-cycle-1/review-report.json` absent at the requested path | `MZ-603` / `MZ-604` | Use current executable persistence/start-resume tests as direct evidence, or record the missing historical report path as traceability-only context if no alternate exact report exists |

## Acceptance Readiness For MZ-601

`MZ-601` is ready to accept because this matrix is present and downstream owners
are explicit. The story `PERSONAL-US-846` itself is not ready to accept until
`MZ-602` closes the full-bullet smoke gap and `MZ-603` / `MZ-604` verify it.
