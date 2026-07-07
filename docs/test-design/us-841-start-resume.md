# US-841 Start/Resume QA Test Design

Refs: PERSONAL-US-841; PERSONAL-REQ-1752; PERSONAL-REQ-1753; PERSONAL-REQ-1754; PERSONAL-AC-2420; PERSONAL-AC-2421
Task: PERSONAL-TASK-1130 / MZ-101
Component: default
Layer: qa-test-design
Phase: implementation
Required setup: none external. Scenarios use localStorage fixtures and deterministic seeds from the shared test harness.
QA risk level: medium
Security review: not needed; the save is browser-local only and there is no auth, server, or sensitive data in scope.

## Goal

Define executable scenarios for starting a new local bullet, choosing a supported bullet size, continuing one active unfinished bullet, and replacing an unfinished save.

This document is the test-design input for:

- MZ-102: versioned bullet persistence
- MZ-103: start/resume UI flow
- MZ-104: start/resume integration tests
- MZ-105/MZ-106/MZ-107/MZ-108/MZ-109: verification gates

## Scope

In scope:

- Empty browser storage first-open path.
- Supported bullet size selection before first deal creation.
- One active unfinished bullet in localStorage.
- Continue saved bullet.
- Discard active saved bullet and start a new bullet.
- Versioned save envelope validation.
- Corrupt, missing, malformed, and unsupported saved state handling.
- Finished saved bullets are treated as non-resumable for the start/resume prompt.

Out of scope:

- Multiple save slots.
- Accounts, backend sync, online play.
- Full mobile start/resume UX.
- Tutorial or glossary.
- Migration from shipped legacy save schemas, unless a prior shipped schema is later identified.

## Test Data

Use deterministic seeds from `src/test/integrationHarness.ts` where a stable game state is needed.

Recommended fixtures:

- Empty storage: no `marriage.save.v1` key.
- Valid unfinished save: serialized `createNewGame(deterministicSeeds.playwrightDesktopFlow)`.
- Unsupported schema save: `{ schema: 2, state: <valid game> }`.
- Corrupt save: invalid JSON under `marriage.save.v1`.
- Malformed state save: schema 1 with missing or invalid state fields.

When bullet size support is implemented, add fixture values for every supported size and at least one unsupported value.

MVP bullet-size test constants:

- Supported values: 10, 20, 30.
- Default/recommended value in UI tests: 10.
- Unsupported values: 0, 25, and any non-integer value.

Implementation tasks should expose these values from one source of truth, such as `SUPPORTED_BULLET_SIZES`, instead of duplicating literals across UI, persistence, and tests.

## State Rules

An unfinished bullet is any valid saved game whose phase is not `finished` and whose bullet target has not been completed.

A finished saved bullet must not be offered as a continue/resume option. The app may show the completed result in a later feature, but US-841 start/resume treats it as no active unfinished bullet.

After starting a new bullet, the first state commit means: the new game state has been created from the selected bullet size and persisted before the player performs any gameplay action.

When a valid unfinished bullet exists, a fresh app boot must show the resume/start-new choice. It must not silently auto-restore into the table without a player continue action.

## Unit Test Scenarios

### UT-841-001: versioned save round-trip

Refs: PERSONAL-REQ-1754; PERSONAL-AC-2421

Given a valid unfinished game state
When the state is saved and loaded through the persistence API
Then the loaded state matches the saved state and includes schema version 1.

Expected owner: MZ-102.

### UT-841-002: unsupported save schema is ignored

Refs: PERSONAL-REQ-1754; PERSONAL-AC-2421

Given localStorage contains a save envelope with an unsupported schema version
When the persistence API loads the game
Then it returns no active game and does not throw.

Expected owner: MZ-102; compatibility verification in MZ-107.

### UT-841-003: corrupt save is ignored

Refs: PERSONAL-REQ-1754; PERSONAL-AC-2421

Given localStorage contains invalid JSON at the save key
When the persistence API loads the game
Then it returns no active game and does not throw.

Expected owner: MZ-102; MZ-107.

### UT-841-004: malformed saved state is ignored

Refs: PERSONAL-REQ-1754; PERSONAL-AC-2421

Given localStorage contains schema 1 with missing or invalid required game state fields
When the persistence API loads the game
Then it returns no active game and does not throw.

Expected owner: MZ-102; MZ-107.

### UT-841-005: save replacement overwrites one active slot

Refs: PERSONAL-REQ-1753; PERSONAL-REQ-1754; PERSONAL-AC-2421

Given one unfinished bullet is saved
When a new bullet is explicitly started
Then the old saved state is replaced by the new active bullet state.

Expected owner: MZ-102 and MZ-103.

### UT-841-006: finished save is not resumable

Refs: PERSONAL-REQ-1753; PERSONAL-REQ-1754; PERSONAL-AC-2421

Given localStorage contains a valid saved state in `finished` phase
When the app checks whether an unfinished bullet can be continued
Then that save is not treated as an active unfinished bullet for the resume prompt.

Expected owner: MZ-102.

### UT-841-007: supported bullet sizes come from one source of truth

Refs: PERSONAL-REQ-1752; PERSONAL-AC-2420

Given the implementation exposes supported bullet sizes
When unit tests inspect the size options
Then values 10, 20, and 30 are supported, while 0, 25, and non-integer values are rejected or not displayable.

Expected owner: MZ-102 and MZ-103.

## UI/Integration Scenarios

### IT-841-001: first open with no save starts a supported bullet

Refs: PERSONAL-REQ-1752; PERSONAL-AC-2420

Given no saved bullet exists in localStorage
When the player opens the app and starts a new bullet with a supported size
Then the game creates the first deal for a new bullet with that target size.

Required assertions:

- The player sees the start-new path.
- The player can choose a supported bullet size before the first deal is created.
- After start, the game table renders a valid first deal.
- A versioned active save exists immediately after the first state commit, before any gameplay action.

Expected owner: MZ-103; integration test in MZ-104.

Use supported bullet size 10 for the main happy path.

### IT-841-002: first open with valid unfinished save offers continue or new

Refs: PERSONAL-REQ-1753; PERSONAL-AC-2421

Given an unfinished bullet exists in localStorage
When the player opens the app
Then the game offers to continue the saved bullet or start a new bullet.

Required assertions:

- Continue action restores the saved state.
- Start-new action does not silently discard the save without an explicit player action.
- The prompt is visible before regular game play continues.

Expected owner: MZ-103; integration test in MZ-104.

### IT-841-003: continue restores the saved active bullet

Refs: PERSONAL-REQ-1753; PERSONAL-REQ-1754; PERSONAL-AC-2421

Given a valid unfinished bullet exists in localStorage
When the player chooses continue
Then the UI renders the restored phase, actor, hands, score table, and log from the saved state.

Expected owner: MZ-103; integration test in MZ-104.

### IT-841-004: start-new replaces the active save

Refs: PERSONAL-REQ-1752; PERSONAL-REQ-1753; PERSONAL-REQ-1754; PERSONAL-AC-2420; PERSONAL-AC-2421

Given a valid unfinished bullet exists in localStorage
When the player chooses to start a new bullet and confirms a supported bullet size
Then the old saved bullet is replaced by the new bullet and a subsequent app boot offers the resume/start-new choice for the new active unfinished bullet.

Expected owner: MZ-102; MZ-103; integration test in MZ-104.

Use supported bullet size 20 here to prove replacement does not always fall back to the default size.

### IT-841-005: finished save does not offer continue

Refs: PERSONAL-REQ-1753; PERSONAL-REQ-1754; PERSONAL-AC-2421

Given localStorage contains a valid saved state in `finished` phase
When the player opens the app
Then the app does not offer to continue that finished bullet as an unfinished active save.

Expected owner: MZ-103; integration test in MZ-104; compatibility verification in MZ-107.

### IT-841-006: invalid save falls back safely

Refs: PERSONAL-REQ-1753; PERSONAL-REQ-1754; PERSONAL-AC-2421

Given localStorage contains corrupt, unsupported, or malformed saved data
When the player opens the app
Then the app does not crash and does not offer to continue that invalid save.

Expected owner: MZ-102; MZ-103; integration test in MZ-104; compatibility verification in MZ-107.

## Accessibility Checks

Refs: PERSONAL-REQ-1752; PERSONAL-REQ-1753; PERSONAL-AC-2420; PERSONAL-AC-2421
Expected owner: MZ-105.

Check:

- Start, continue, and replace-save controls are reachable by keyboard.
- Focus order is stable from app boot through the start/resume choice.
- If a modal or dialog is used, it has a programmatic label and sensible focus behavior.
- Bullet size selection exposes a clear selected state.
- Continue and start-new actions have distinct accessible names.

## Visual Regression Checks

Refs: PERSONAL-REQ-1752; PERSONAL-REQ-1753; PERSONAL-AC-2420; PERSONAL-AC-2421
Expected owner: MZ-106.

Capture desktop screenshots for:

- Empty-storage first-open state.
- Bullet size selection state.
- Valid-save resume choice.
- Invalid-save safe fallback.
- First rendered deal after starting a new bullet.

Check:

- Text does not overlap controls.
- Primary and secondary actions are visually distinct.
- Resume/new choice does not look like a transient error.
- Desktop and laptop viewports do not block normal play.

## Compatibility Verification

Refs: PERSONAL-REQ-1754; PERSONAL-AC-2421
Expected owner: MZ-107.

Check:

- Schema version is explicit in saved data.
- Unsupported schema versions are rejected without throwing.
- Corrupt or malformed state does not crash app boot.
- Replacing the active save writes a complete schema 1 envelope.
- Existing shipped save formats are not silently broken without a migration plan if any are later discovered.

## Regression Scope

Every implementation task for US-841 must protect:

- App boot with no localStorage state.
- App boot with valid localStorage state.
- App boot with invalid localStorage state.
- Save after state changes.
- Explicit save replacement when starting a new bullet.
- Finished saved state not being treated as resumable.

## Component Regression Verification

Refs: PERSONAL-REQ-1752; PERSONAL-REQ-1753; PERSONAL-REQ-1754; PERSONAL-AC-2420; PERSONAL-AC-2421
Expected owner: MZ-108.

MZ-108 should verify:

- MZ-102 persistence changes match US-841 owner scope and do not introduce multi-save, backend, account, or full-mobile behavior.
- MZ-103 UI changes expose the start/resume path without silently auto-restoring a valid unfinished save.
- MZ-104 integration tests exist for first-open, continue, start-new replacement, invalid save fallback, and finished-save non-resume behavior.
- MZ-105, MZ-106, and MZ-107 evidence is present before US-841 is considered component-complete.
- `npm run verify` passes after all US-841 implementation and verification work.

## Release Gate Evidence

MZ-109 should not pass until evidence exists for:

- Unit persistence tests covering schema, corrupt data, unsupported schema, malformed state, and replacement.
- Playwright or equivalent browser integration tests covering first-open, continue, and start-new replacement flows.
- Accessibility review for start/resume controls.
- Visual review screenshots for the required start/resume states.
- `npm run verify` passing.
