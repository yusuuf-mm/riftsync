# RIFTSYNC: FRACTURE RUN

RIFTSYNC is a static start.ng arcade runner. In a one-minute run, move between three lanes, jump low fractures, slide under broken gates, collect energy shards, and survive four connected dimensions. Three collisions end a run; each hit leaves a brief recovery window.

## Play

- Arrow keys or A/D: switch lanes.
- Space or Up: jump.
- Shift or Down: slide.
- E, Q, or the RIFT PULSE button: spend three collected shards to clear nearby hazards.
- On touch screens, swipe in any direction or use the four large on-screen controls.

The run begins from PLAY RUN. A lane tap or left/right swipe changes lanes; up and down gestures jump and slide. The game pauses its timer while the browser tab is hidden. Sound is generated locally and can be muted.

## Dimensions

Each dimension takes 15 seconds. The palette, architecture, atmosphere, and audio cue change while the controls and rules remain consistent.

| Time | Dimension | Motif |
| --- | --- | --- |
| 0–15 seconds | THE GRID | Stacked data towers and narrow signal lights |
| 15–30 seconds | THE DOJO | Gate beams, lanterns, and warm stone |
| 30–45 seconds | THE FORGE | Gantries, furnace cores, and heavy steel |
| 45–60 seconds | THE VOID | Broken monoliths and a sparse star field |

PLAN, CODE, TEST, and SHIP mark progress in the HUD without interrupting play.

## Project files

- `index.html` is the single-page entry point.
- `styles.css` contains the responsive interface and touch controls.
- `src/main.js` owns the Three.js scene, rendering, input, audio, and start.ng bridge.
- `src/runner-core.js` contains testable run rules and scoring.
- `src/character.js` builds the runner as a procedural rigged humanoid, styled from the start.ng appearance colors.
- `src/world.js` builds the four dimensions, sky, street, and skyline once and caches them.
- `src/portal.js` renders each rift as a live preview of its destination.
- `src/audio.js` synthesises all sound locally with WebAudio.
- `tests/` covers the run rules with `node --test`.
- `vendor/` holds the local Three.js runtime; the game makes no runtime CDN requests.
- `assets/runner.glb` is the earlier skinned model, kept with its attribution in `assets/CESIUM-MAN-LICENSE.md` and `assets/THIRD-PARTY-NOTICES.md`. The runner is no longer loaded from it.
- `cover.png` remains the start.ng game cover.
- `startng.json` keeps the current shared leaderboard keys.

Serve the directory as static files over HTTP during local development; ES modules do not load from `file://` URLs. There is no build step or external runtime service.

## start.ng integration

The game requests the current player through the hidden `https://start.ng/connect` iframe. It accepts replies only from the expected start.ng origin and iframe window, and matches each response to its request ID. Signed-in players see their start.ng face and name, and their appearance colors tint the runner. Guests use the default runner and can play without an account. Scores are saved for signed-in players; the shared leaderboard remains readable for guests.

The leaderboard keeps the keys `score`, `best_combo`, and `ships`; `ships` now records dimensions stabilized. Its label is “Dimensions stabilized”.

See the [official start.ng documentation](https://start.ng/docs.md) for hosting and publishing.
