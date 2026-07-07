# MARRIAGE 3.30 Browser Remake Design

Date: 2026-06-27

## Goal

Rewrite the DOS game `MARRIAGE 3.30` as a native browser game without DOS emulation. The first release is a hybrid remake: it preserves the spirit, rules, and table feel of the original, but it does not attempt a binary-accurate reconstruction of the executable or original asset formats.

The game runs locally in the browser as one human player against two computer players.

## Source Context

The project folder contains the original DOS distribution:

- `MARRIAGE.EXE`, `STAT1.EXE`: MS-DOS executables built with Borland/Turbo Pascal and BGI graphics.
- `MARRIAGE.000` through `MARRIAGE.009`, `PREFF.PSR`: binary data, resources, and statistics files.
- `!READ_ME.!!!`: CP866 Russian readme with version, rules, controls, and technical context.
- `old-games.nfo`: distribution note.

There are no original source files. The readme identifies the game as `MARRIAGE 3.30` from 1995, a three-player Sochi preference game.

## Scope

### In Scope

- Native TypeScript/JavaScript browser implementation.
- One human player against two local AI players.
- Sochi preference with rules described in `!READ_ME.!!!`.
- Modern web UI with a retro VGA card-table mood.
- Local persistence for settings, active bullet, statistics, and resumable game state.
- Automated tests for rule-critical behavior.

### Out of Scope for First Release

- DOS emulation.
- Pixel-perfect recreation of the DOS UI.
- Exact reverse engineering of the original Pascal AI.
- Online multiplayer.
- Voice control.
- Full extraction and conversion of all original binary resources.

## Game Rules

The first release implements the original readme's core agreements:

- 32-card preference deck.
- Three players.
- Deal 10 cards to each player and 2 cards to the widow.
- Card ranks: 7, 8, 9, 10, Jack, Queen, King, Ace.
- Suit order for bidding: spades, clubs, diamonds, hearts.
- Clockwise bidding and play.
- Misere is overcalled by a nine-level game; bidding does not continue beyond that.
- Player cannot order a contract below the winning bid.
- Renounce is prevented by legal move validation.
- Two whisters play face down; one whister plays face up.
- Half-whist is supported.
- Sliding all-pass deal progression.
- Progressive all-pass scoring is configurable.
- All-pass exits by a six-level game.
- Widow is opened during all-pass and shows suit.
- Configurable agreements:
  - mandatory whist on six spades,
  - ten-level contract is whisted or checked,
  - responsible or half-responsible whist,
  - progressive or non-progressive all-pass.

Scoring follows the readme:

- Six-level game: 2 points.
- Seven-level game: 4 points.
- Eight-level game: 6 points.
- Nine-level game: 8 points.
- Ten-level game: 10 points.
- Misere: 10 points.
- All-pass trick values: 1 on first all-pass, 2 on second, 3 on third and later.
- Zero tricks on all-pass writes the trick value to the bullet.

## Architecture

### `game-engine`

Pure TypeScript domain module with no DOM access. It owns:

- card model,
- deterministic shuffle and deal,
- player order,
- bidding state,
- contract ordering,
- widow pickup and discard,
- whist decisions,
- trick play,
- all-pass,
- misere,
- scoring,
- phase transitions,
- legal action generation.

The engine exposes immutable state transitions:

```ts
nextState = applyAction(currentState, action)
```

The UI and AI use the same legal-action API, so invalid human and AI moves are prevented at the boundary.

### `rules`

Rule configuration and helpers:

- default Sochi configuration,
- agreement toggles,
- bid ordering,
- contract value mapping,
- trick winner calculation,
- score calculation.

### `ai`

Local heuristic AI. First release priority is legality and plausible decisions, not exact original strength.

AI responsibilities:

- evaluate hand strength for bidding,
- choose contract after winning bid,
- discard to the widow,
- decide pass, whist, half-whist, or check,
- choose legal card during trick play,
- play all-pass and misere without illegal moves.

The AI should be deterministic when supplied with a seeded random source, so tests and replay debugging remain stable.

### `ui`

Browser UI with no dependency on DOS runtime. Preferred implementation is TypeScript with a lightweight frontend stack chosen during implementation based on the repository state. If no app exists, Vite with TypeScript is the default.

Main screens:

- game table,
- new game setup,
- agreement settings,
- bullet and score table,
- current-phase help,
- game over and statistics.

### `persistence`

Browser `localStorage` persistence:

- settings,
- active bullet,
- resumable game state,
- player statistics.

State schema versions are stored with saved data so future migrations are possible.

## Interface Direction

Use the first visual direction from brainstorming:

- dark green card table,
- retro VGA mood,
- monospace accents,
- visible panels for bidding, agreements, current contract, action log, and status,
- bottom command/status line inspired by the DOS UI,
- readable modern cards and buttons,
- responsive layout for desktop browsers first.

The interface should feel like a respectful remake, not a pixel-art replica. It should be playable with mouse and keyboard.

## Data Flow

1. UI renders the current engine state.
2. UI asks the engine for legal human actions.
3. Human chooses an action.
4. Engine validates and applies the action.
5. If the next actor is AI, the AI receives the public/allowed state and legal actions.
6. AI chooses an action.
7. Engine validates and applies it.
8. Persistence saves after stable phase transitions.

## Error Handling

- Illegal actions are rejected by the engine with structured errors.
- UI disables unavailable actions before submission.
- Saved game load validates schema version and state integrity.
- Corrupt saves are ignored with a recoverable "start new game" path.

## Testing

Tests focus on rules and engine behavior:

- deck contains 32 unique cards,
- deal produces three 10-card hands and a 2-card widow,
- bid ordering follows suit and level order,
- player cannot order below the winning bid,
- misere and nine-level bidding relationship is enforced,
- legal move generation prevents renounce,
- trick winner calculation handles trump and no-trump cases,
- all-pass scoring works for progressive and non-progressive settings,
- contract scoring writes bullet, mountain, and whists correctly,
- AI always returns a legal action for supported phases,
- saved state round-trips through serialization.

Implementation should use test-driven development for the engine and rule modules.

## Delivery Plan Boundary

This design is complete when it supports writing a detailed implementation plan. The implementation plan should decompose work into:

1. app scaffold,
2. card and rule model,
3. deal and bidding,
4. trick engine,
5. scoring,
6. AI,
7. UI table,
8. persistence,
9. end-to-end playable loop.

