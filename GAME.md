# RIFTSYNC — Game Design Document

> A calm, beat-driven flow game for start.ng

---

## Overview

60-second rounds, no game over. You are an Operator holding a rift open while signals from different universes arrive on the beat. Every hit plays a note, so good play composes a soft melody.

**Tech**: Single static `index.html`, inline CSS/JS, canvas, no libraries, no external scripts, no build step, no audio/image files (WebAudio + canvas art).

---

## Core Architecture

### Beat Clock
- Driven by `AudioContext.currentTime` — never frame counts
- Orbs spawned ahead of time to arrive exactly on beat
- Hits judged against audio clock
- On tab hide: suspend AudioContext; on show: resume and resync

### Game Loop
- `requestAnimationFrame` with delta time
- `devicePixelRatio` capped at 2
- Handle resize via ResizeObserver
- Pause on `document.visibilitychange` = hidden

---

## Input
- Arrow keys or WASD
- Tap / swipe the matching side of the screen
- Character swings toward hit direction

---

## Timing Windows
| Window  | Points | Effect |
|---------|--------|--------|
| Perfect | +100   | 40ms hit-stop, hop animation, note plays |
| Good    | +50    | Note plays |
| Miss    | 0      | Soft miss sound, combo resets |

- Small PERFECT/GOOD label near ring on hit
- `navigator.vibrate` on mobile hits (guarded)

---

## Flow Meter
- Fills on hits, drains on misses
- Sets aura glow size + score multiplier x1–x8
- Aura color = player's `primaryColor`

---

## Round Structure
- Exactly **60 seconds**, no game over
- Intro: 10-second guided intro (first time only, skippable, localStorage flag)
- Difficulty ramps each Rift Shift (15s)

---

## Agent Nodes — "SHIP IT"
Four nodes orbit the character: **Plan**, **Code**, **Test**, **Review**

- Every streak of **8 Perfects** lights the next node
- All 4 lit = **SHIP IT**: 5s x2 score, auto-sync assist, light burst, reset
- One-time tooltip: "Plan, Code, Test, Review. Ship it."

---

## Worlds (Rift Shift every 15s)

| # | Name | BPM | Palette | Orb Shape | Twist |
|---|------|-----|---------|-----------|-------|
| 1 | Neon Grid | 80 | Green on black | Square, flickering | Hit by timing not sight |
| 2 | Ember Dojo | 70 | Ink-wash dark, orange embers | Round ember | Some need double tap |
| 3 | Forge Prime | 90 | Amber + steel | Hexagon | Slow heavy orbs worth more |
| 4 | Void Fleet | 100 | Deep blue stars | Round, curved path | Orbs curve in |
| 5 | Lantern Sea | 75 | Night ocean | Lantern shape | Orbs sway gently |

### Daily Rift
- World order seeded from UTC date (`Math.seededRandom(utcDateInt)`)
- Same run for all players on same day

### Free Play
- Random world order each run

---

## Music System

### Ambient Bed
- Soft pad: continuous tone cluster per world scale (WebAudio oscillators + reverb)
- Gentle bass on the beat (sine wave, short envelope)

### Hit Notes
- Each world has a scale (e.g. pentatonic, Dorian)
- Hit notes quantised to scale so always pleasant
- Played via OscillatorNode + envelope

### World Scales
| World | Scale |
|-------|-------|
| Neon Grid | D Minor Pentatonic |
| Ember Dojo | E Phrygian |
| Forge Prime | F Lydian |
| Void Fleet | G Dorian |
| Lantern Sea | A Major Pentatonic |

### Mute Button
- Stores preference in localStorage
- Remembers across sessions

---

## Juice & Effects
- **40ms hit-stop** on Perfects (pause canvas draw briefly)
- **Beat-synced screen pulse** (subtle outer glow)
- **Particle bursts** on hit (scale by flow meter)
- **Squash-and-stretch** on character on Perfect
- **Arms up** on SHIP IT
- **Flash** on Rift Shift wipe (short wipe transition)
- `navigator.vibrate` on mobile

---

## Accessibility
- **Reduced-motion toggle**: disables hit-stop, pulse, flashes, heavy particles
- Orbs differ by shape AND direction (not colour-only)
- Large tap targets (min 44px)
- Portrait + landscape support

---

## Title Screen
- RIFTSYNC logo
- Player character + name
- Buttons: Play Daily Rift, Free Play, Settings, Mute

### Settings
- Mute toggle
- Reduced-motion toggle
- Audio latency calibration (tap-along sets offset, default 0)

---

## Results Card
- Score, best combo, ships (SHIP IT count)
- Rank badge
- Top-10 leaderboard (player row highlighted)
- Play again button
- "Copy result" → copies `"RIFTSYNC Daily: 12,400 | Combo 38 | 2 ships"`

---

## start.ng Integration

### Connect Page
```js
const START_NG = 'https://start.ng';
// askStartNg helper from docs
// Always check e.origin === START_NG
```

### whoami Flow
- Call on load, on `visibilitychange`, on `focus`
- `reply?.user ?? reply?.guest` → player object

### Character Drawing
Draw from `style`: body, primaryColor, secondaryColor, skinColor, hairColor, hair, hat, accessory

Poses:
- **Idle**: gentle bob animation
- **Perfect hit**: hop
- **Hit swing**: lean toward direction
- **SHIP IT**: arms up, celebration

### Guest Mode
- Use guest look
- Show Sign In button (doesn't block gameplay)
- Fully playable without a player

### Score Saving
```js
await askStartNg({ type: 'startng:score', stats: { score, best_combo, ships } }, 'startng:scoreSaved')
```
- Only if signed in
- Each a whole number 0–1,000,000,000

### startng.json
```json
{
  "leaderboard": {
    "stats": [
      { "key": "score", "label": "Score", "order": "highest" },
      { "key": "best_combo", "label": "Best combo", "order": "highest" },
      { "key": "ships", "label": "Ships", "order": "highest" }
    ]
  }
}
```

### Leaderboard
- Read after round: `startng:leaderboard` limit 10
- Show in results card, highlight player row by `player_id`
- Handle `{ok:false}` gracefully

---

## File Structure
```
riftsync/
├── index.html      ← entire game (inline CSS + JS)
├── startng.json    ← leaderboard config
├── cover.png       ← 1600×1000, 16:10
├── GAME.md         ← this file
└── .gitignore
```

---

## Build Phases

- [x] **Phase 1**: Beat clock, ring, one world, 4-direction input, hits, notes, Perfect/Good/Miss
- [ ] **Phase 2**: Flow meter, 60s round, results card, difficulty ramp, ambient bed
- [ ] **Phase 3**: All 5 worlds, Rift Shift, Daily Rift + Free Play
- [ ] **Phase 4**: Agent nodes + SHIP IT, title screen, intro, calibration, settings, accessibility
- [ ] **Phase 5**: start.ng integration: character, profile card, guest, startng.json, score, leaderboard
- [ ] **Phase 6**: Juice + performance pass, narrow phone viewport
- [ ] **Phase 7**: cover.png, push to GitHub, check + publish

---

## GitHub Repo
- Name: `riftsync`
- URL: `https://github.com/[owner]/riftsync`
- Game URL: `https://riftsync.start.ng`

---

*Last updated: Phase 1 in progress*
