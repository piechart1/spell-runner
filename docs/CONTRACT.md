# SPELL RUNNER: Technical Contract

Version 1.1. Read `docs/DESIGN.md` first. This file defines how the code is divided and how the parts fit together. Work packages are built in parallel by engineers who cannot talk to each other, so every name, signature and data shape here is binding. If something you need is not defined here, keep it private to your own module.

Numeric tuning values are treated differently from names and shapes. The values in section 5.10 and the level timeline in DESIGN 11 are starting values; section 12.1 says who may change them and how. Section 12.2 lists the Tier 2 features that may be left out, with the fallback for each.

Contents:

1. Files, owners and load order
2. Module pattern and load-time rules
3. Constants (`TG.C`)
4. Public API of every module
5. Data shapes
6. Sprite format and sprite registry
7. Sound effect and music registries
8. Event registry
9. Game state machine
10. Headless test interface
11. Coordinates and units
12. Work package checklists
13. Lead decisions
14. Integration record (WP-H)

---

## 1. Files, owners and load order

Project root: the repository root, the folder that holds `index.html`.

| # | File | Owner | Defines |
|---|---|---|---|
| | `index.html` | WP-G | Page, canvas, on-screen buttons, script tags |
| | `css/style.css` | WP-G | Layout, scaling, buttons, CRT overlay |
| 1 | `js/core.js` | WP0 | `TG`, `TG.C`, `TG.PAL`, `TG.COLOR`, `TG.Util`, `TG.Events`, `TG.RNG`, `TG.Save`, `TG.Difficulty`, and the empty registries `TG.Sprites`, `TG.Remaps`, `TG.Backdrops`, `TG.Levels` |
| 2 | `js/words.js` | WP-A | `TG.Words` |
| 3 | `js/typing.js` | WP-A | `TG.Typing` |
| 4 | `js/audio.js` | WP-B | `TG.Audio` |
| 5 | `js/gfx.js` | WP-C | `TG.Gfx` |
| 6 | `js/font.js` | WP-C | `TG.Font` |
| 7 | `js/sprites-chars.js` | WP-C | Sprite and remap definitions (hero, enemies, boss, projectiles) |
| 8 | `js/sprites-world.js` | WP-D | Sprite, remap and backdrop definitions (tiles, hazards, items, effects, icons, parallax) |
| 9 | `js/input.js` | WP-E | `TG.Input` |
| 10 | `js/entities.js` | WP-E | `TG.Entities` |
| 11 | `js/level.js` | WP-E | `TG.Level` |
| 12 | `js/boss.js` | WP-E | `TG.Boss` |
| 13 | `js/levels/level1.js` | WP-E | `TG.Levels[1]` |
| 14 | `js/game.js` | WP-E | `TG.Game` |
| 15 | `js/effects.js` | WP-F | `TG.Effects` |
| 16 | `js/hud.js` | WP-F | `TG.Hud` |
| 17 | `js/render.js` | WP-F | `TG.Render` |
| 18 | `js/ui.js` | WP-G | `TG.UI` |
| 19 | `js/main.js` | WP-G | `TG.Main` |
| | `test/stubs.js` | WP0 | Node loader with stubs |
| | `test/test-core.js` | WP0 | Tests for core.js |
| | `test/test-words.js` | WP-A | |
| | `test/test-typing.js` | WP-A | |
| | `test/test-audio.js` | WP-B | |
| | `test/test-gfx.js` | WP-C | Gfx, Font and the WP-C sprites |
| | `test/test-sprites-world.js` | WP-D | The WP-D sprites and backdrops |
| | `test/sim.js` | WP-E | Headless harness and bot |
| | `test/standins/*.js` | WP-E, WP-F, WP-G | Temporary stand-ins for files of another package that are not delivered yet (section 12). Never loaded by `index.html`. Deleted by WP-H |
| | `test/test-render.js` | WP-F | |
| | `test/test-ui.js` | WP-G | |
| | `test/run-all.js` | WP-H | Runs every test file and reports |
| | `test/test-integration.js` | WP-H | The whole game driven by key events and the bots, with rendering and sound on (section 14) |
| | `tools/png.js`, `tools/softcanvas.js`, `tools/sheet.js` | WP0 | Headless drawing tools (section 13.2) |
| | `test/test-tools.js` | WP0 | Tests for the three WP0 tools |
| | `tools/shot.js` | WP-F | Screenshots of a bot run (section 13.2) |
| | `tools/shot-ui.js` | WP-G | Screenshots of the interface screens (section 13.2) |
| | `README.md` | WP-H | How to start and play the game, run the tests and add a level |
| | `docs/DESIGN.md`, `docs/CONTRACT.md` | Lead | |

**Script load order.** `index.html` loads the 19 JavaScript files with classic `<script src>` tags in the numbered order above, at the end of `<body>`, followed by one inline script:

```html
<script src="js/core.js"></script>
<script src="js/words.js"></script>
<script src="js/typing.js"></script>
<script src="js/audio.js"></script>
<script src="js/gfx.js"></script>
<script src="js/font.js"></script>
<script src="js/sprites-chars.js"></script>
<script src="js/sprites-world.js"></script>
<script src="js/input.js"></script>
<script src="js/entities.js"></script>
<script src="js/level.js"></script>
<script src="js/boss.js"></script>
<script src="js/levels/level1.js"></script>
<script src="js/game.js"></script>
<script src="js/effects.js"></script>
<script src="js/hud.js"></script>
<script src="js/render.js"></script>
<script src="js/ui.js"></script>
<script src="js/main.js"></script>
<script>TG.Main.init();</script>
```

No `type="module"`, no `defer`, no `async`. No network requests of any kind: no fonts, images, audio files or analytics.

`test/stubs.js` exports the same list as `FILES`. `test/test-ui.js` checks that the script tags in `index.html` match it.

---

## 2. Module pattern and load-time rules

### 2.1 Pattern

Every JavaScript file under `js/` is one IIFE that attaches to the single global `TG`.

```js
// js/words.js
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  // private helpers and data
  function lengthOk(word, min, max) {
    return word.length >= min && word.length <= max;
  }

  // public API
  TG.Words = {
    POOLS: { /* ... */ },
    createPicker: function (difficultyName, rng) { /* ... */ }
  };
})(typeof window !== 'undefined' ? window : globalThis);
```

### 2.2 Rules

1. **Nothing happens at load time except definitions.** A file may create objects and functions, read `TG.C`, `TG.PAL` and `TG.COLOR`, and register data with `TG.Sprites.define`, `TG.Remaps`, `TG.Backdrops` and `TG.Levels`. It may not touch `document`, `window` properties other than `TG`, canvas, `AudioContext`, `localStorage`, timers, `requestAnimationFrame`, or call any other module's functions.
2. **DOM, canvas and audio access happens only inside `init` functions** (and functions called after them). `TG.Main.init()` is the only entry point and calls the other `init` functions.
3. **References to other modules are resolved at call time**, inside functions: write `TG.Events.emit(...)` in a function body. Only `TG.C`, `TG.PAL`, `TG.PAL_KEYS`, `TG.COLOR` and `TG.Util` may be read or copied at load time, and the registries named in rule 1 may be written to. Every other module is looked up inside function bodies, including modules that load earlier in the script order. For example, `hud.js` must not read `TG.Font.SYM.HEART` at load time and `render.js` must not contain `var Gfx = TG.Gfx` at the top of the file, because in the isolated test loads of rule 6 those modules are absent.
4. **Simulation modules** are `core.js`, `words.js`, `typing.js`, `input.js` (its queue), `entities.js`, `level.js`, `boss.js`, `levels/level1.js` and `game.js`. They:
   - never use `Math.random`, `Date`, `performance.now`, timers or the DOM;
   - take all randomness from `state.rng`;
   - never call `TG.Audio`, `TG.Gfx`, `TG.Font`, `TG.Effects`, `TG.Hud`, `TG.Render`, `TG.UI` or `TG.Main`. They communicate outward only by mutating state and emitting events.
5. **Presentation modules** are `audio.js`, `gfx.js`, `font.js`, `effects.js`, `hud.js`, `render.js`. They read state and subscribe to events. They never mutate the game state, never emit simulation events and never use `state.rng`. For their own randomness they create a private generator with `TG.RNG.create(seed)`.
6. **Missing modules must not throw.** Presentation code that calls an optional module guards the call, for example `if (TG.UI && TG.UI.draw) TG.UI.draw(ctx, state)`. This lets each work package load its files, and each presentation package run its tests, with only `core.js` and its own files present. Running the simulation (WP-E) also needs `words.js` and `typing.js`; section 12.0 gives the build order that provides them.
7. **Language level.** ES2020 syntax is allowed (`let`, `const`, arrow functions, classes, template strings, spread, optional chaining). No ES modules, no top-level `await`, no `import`/`require` in files under `js/`.
8. **Identifiers use American spelling** where the platform does (`color`, `center`), to match the Canvas API.
9. **Errors.** Public functions validate their arguments only where this contract says they throw. Presentation failures (missing sprite, unknown sound name) warn once with `console.warn` and continue.

---

## 3. Constants (`TG.C`)

Defined in `core.js` and frozen with `Object.freeze`. Units: px, real seconds (s), world seconds (ws). See section 11 for the difference.

```js
TG.C = {
  VERSION: '1.0.0',
  STORAGE_KEY: 'spellrunner.v1',

  // Display
  W: 384,                 // internal width, px
  H: 216,                 // internal height, px
  TILE: 16,               // tile size, px
  GROUND_Y: 184,          // y of the ground surface, px
  PLAY_TOP: 24,           // top of the playfield (below the HUD), px
  HERO_SCREEN_X: 96,      // screen x of Pip's centre, px
  CAMERA_MAX_STEP: 4,     // camera catches up by at most this many px per step
  BUTTON_SPACE: 72,       // CSS px kept free for the JUMP and DUCK buttons (section 4.21)

  // Loop
  DT: 1 / 60,             // fixed simulation step, s
  MAX_STEPS: 5,           // most simulation steps per displayed frame
  MAX_FRAME: 0.25,        // a longer frame pauses the game, s

  // Hero physics (world units)
  RUN_SPEED: 64,          // px/ws
  JUMP_TIME: 0.75,        // airtime, ws
  JUMP_HEIGHT: 40,        // apex, px
  JUMP_DIST: 48,          // = RUN_SPEED * JUMP_TIME, px
  GRAVITY: 570,           // px/ws^2, used only when falling (not during a jump arc)
  COYOTE: 0.10,           // ws
  JUMP_BUFFER: 0.15,      // ws
  SLIDE_TIME: 0.875,      // minimum slide, ws (56 px)

  // Hitboxes, px
  HERO_W: 10, HERO_H: 22,
  SLIDE_W: 12, SLIDE_H: 10,
  FOOT_W: 8,              // foot box used for the support tests of section 5.2
  INSET: 2,               // attacks and hazards are inset by this on each side; also used for the `contact` distance of threats

  // Hazards, px
  GAP_NARROW: 16, GAP_WIDE: 32,
  HANG_CLEAR: 14,         // underside of branch, beehive, arch above the ground
  BRAMBLE_H: 8,
  BRAMBLE_INSET_X: 4,     // the bramble's collision box is inset by this on the left and right (8 px wide)
  GAP_WIN_BACK: 52,       // gap:    winStart = x + w - 52
  GAP_WIN_FWD: 4,         // gap:    winEnd   = x + 4
  BRAMBLE_WIN_BACK: 27,   // bramble: winStart = x - 27
  BRAMBLE_WIN_FWD: -5,    // bramble: winEnd   = x - 5
  DUCK_WIN_BACK: 34,      // branch, beehive, arch: winStart = x - 34
  DUCK_WIN_FWD: -6,       //                         winEnd   = x - 6
  HOLD_PAST: 6,           // arch: hold duck until x + w + 6
  FALL_COMMIT: 8,         // a committed fall ends (life lost) when the feet are this far below GROUND_Y, px
  RESCUE_AHEAD: 24,       // Pip returns this far past the gap's far edge, px
  CHECKPOINT_CLEAR: 12,   // no hazard within this many tiles after a checkpoint

  // Threat geometry
  EDGE_DX_RIGHT: 296,     // dx at which a 16 px sprite is just off the right edge
  EDGE_DX_LEFT: -104,     // dx at which a 16 px sprite is just off the left edge
  BOULDER_MIN_BUDGET: 4.4,// ws
  INTRO_FACTOR: 1.5,      // budget factor for intro and tutorial spawns
  SPAWN_RETRY: 0.25,      // ws between retries of a waiting spawn
  SWOOP_HOVER_DX: 120, SWOOP_HOVER_ELEV: 120, SWOOP_ENTER_T: 0.15, SWOOP_DIVE_T: 0.65,
  FLY_HIT_ELEV: 12,       // elevation at which Swoop ends its dive, px
  BUZZLE_ELEV: 16, BUZZLE_BOB: 4, BUZZLE_BOB_HZ: 1.5,
  HOP_LEN: 24, HOP_HEIGHT: 10,
  DIGBY_POP_T: 0.85,      // t at which the mole starts to rise
  DIGBY_DX: 56,           // dx of the mound and the mole until DIGBY_POP_T, px
  DIGBY_DEPTH: 16,        // how far below the ground the mole is until DIGBY_POP_T, px (elev = -16)
  CRATE_ELEV: 100, CRATE_FACTOR: 1.5, CRATE_BOB: 3,
  ROCK_FROM_DX: 190, ROCK_FROM_ELEV: 40, ROCK_TO_ELEV: 8, ROCK_ARC: 50,
  MIN_SPEED: { dawdle: 6, hoppet: 20, buzzle: 28 },   // px/ws towards Pip, relative to the ground
  TRUFFLE_MIN_CLOSING: 40, TRUFFLE_SPAN: 110,
  TRUFFLE_HOLD: 64,       // truffle: largest distance beyond `contact` at which it is drawn, px
  RIGHT_SPAN: 280,
  HOLD_SPAN: 264,         // dawdle, hoppet, buzzle: largest distance beyond `contact` at which they are drawn, px
  HOLD_STEP: 16,          // each further creature waiting at the right edge stands this much closer, px

  // Boss
  BOSS_DX: 200,           // boss centre is this far ahead of Pip, px
  ATTACK_SPEED: 160,      // shockwave and pickaxe closing speed, px/ws
  SHOCK_WIN: [0.05, 0.45],// press jump when eta (ws) is inside this range
  PICK_WIN: [0.05, 0.60], // press duck when eta (ws) is inside this range
  BOSS_RECOIL: 0.8,       // ws
  BOSS_LAUGH: 1.0,        // ws
  BOSS_PHASE_TIME: 2.0,   // ws
  BOSS_INTRO_TIME: 4.0,   // s
  BOSS_INTRO_SHORT: 1.5,  // s, after a continue
  LEVEL_COMPLETE_TIME: 4.0, // s
  FINISHER_SCALE: 0.25,

  // Typing
  DISCARD_TIME: 0.25,     // s, spillover guard
  AUTO_RELEASE_MAX_TYPED: 2,
  RECENT_WORDS: 20,
  LIVE_WPM_WORDS: 8, LIVE_WPM_MIN: 3, PEAK_WPM_WORDS: 5,
  KEY_INTERVAL_MAX: 2.0,  // s
  WPM_REFRESH: 0.5,       // s
  MULT_STEPS: [0, 3, 6, 10, 15],      // clean run needed for x1..x5
  KEY_STREAK_MILESTONES: [25, 50, 100],   // banners; the key streak that gives a shield charge is config.shieldKeyStreak
  MAX_WORD_LEN: 10,       // threats and crates

  // Scoring
  PTS_LETTER: 10,
  PTS_WORD_PER_LETTER: 20,
  CLEAN_FACTOR: 1.5,
  QUICK_FACTOR: 1.25, QUICK_U: 0.5,
  CLOSE_CALL_TIME: 0.35, PTS_CLOSE: 100,
  BLAST_FACTOR: 0.5,
  PTS_INK: 10,
  PTS_CORE: 1000, PTS_BOSS: 5000,
  PTS_CP_ACC: 500, CP_ACC: 0.95, PTS_CP_NODAMAGE: 500,
  PTS_LIFE: 1000, PTS_ACC95: 3000, PTS_ACC90: 1500, PTS_NOCONT: 2000,
  INK_PER_LIFE: 100,
  MAX_LIVES: 9, MAX_SHIELD: 2,
  SCORE_SLOTS: 5,

  // Timers, s (real)
  HIT_FREEZE: 0.10,
  FALL_FREEZE: 1.0,
  LAST_LIFE_FREEZE: 1.5,
  SHIELD_INVULN: 1.0,
  HOURGLASS_TIME: 6, HOURGLASS_SCALE: 0.5,
  QUILL_TIME: 10,
  TUTOR_SCALE: 0.25, TUTOR_T: 0.6,
  CONTINUE_COUNT: 9, CONTINUE_LOCKOUT: 0.8,
  RESUME_STEP: 0.5,       // seconds per step of the 3-2-1 resume countdown
  READY_TIME: 3.0,        // READY / GO banner

  // Adaptive pacing
  ASSIST_MAX: 1.0, ASSIST_MIN: 0.70, ASSIST_MIN_CONTINUE: 0.60,
  ASSIST_RATE: 0.05,      // per real second
  ASSIST_WINDOW: 4,       // resolved threat words per evaluation
  ASSIST_CONTINUE_CAP: 0.85,
  U_MISS: 1.2,

  // Screens on which TG.Game.step advances the simulation
  SIM_SCREENS: ['playing', 'lifeLost', 'bossIntro', 'boss', 'levelComplete']
};
```

`TG.PAL` is an array of 32 hex strings in palette order (DESIGN 14.2). `TG.PAL_KEYS` is the string `'0123456789abcdefghijklmnopqrstuv'`; the character at index `i` is the sprite-data key for palette entry `i`. `TG.COLOR` maps names to indices:

```js
TG.COLOR = { INK:0, SHADOW:1, STONE:2, SILVER:3, WHITE:4, DEEP_BLUE:5, ROYAL:6, SKY:7, HAZE:8,
  DEEP_TEAL:9, TEAL:10, AQUA:11, PINE:12, FOREST:13, GRASS:14, LIME:15, BRONZE:16, ORANGE:17,
  GOLD:18, CREAM:19, BARK:20, SOIL:21, CLAY:22, SAND:23, MAROON:24, RED:25, CORAL:26, PINK:27,
  PLUM:28, VIOLET:29, LILAC:30, PEACH:31 };
```

Every function that takes a colour takes a palette index (0 to 31), never a hex string.

---

## 4. Public API of every module

Notation: `name(param, param) -> return`. "Throws" means a thrown `Error`. Anything not listed is private.

### 4.1 `TG.Util` (core.js, WP0)

```js
TG.Util.clamp(v, min, max) -> number
TG.Util.lerp(a, b, t) -> number
TG.Util.approach(v, target, maxDelta) -> number   // moves v towards target by at most maxDelta
TG.Util.pad(n, width) -> string                    // zero-padded integer, e.g. pad(42, 3) = '042'
TG.Util.overlap(a, b) -> boolean                   // a, b are {x, y, w, h} with x,y = left, top. Touching edges do not overlap
TG.Util.round10(n) -> number                       // rounds to the nearest 10
TG.Util.deepFreeze(obj) -> obj
```

### 4.2 `TG.Events` (core.js, WP0)

```js
TG.Events.on(name, fn) -> function      // subscribes; returns a function that unsubscribes
TG.Events.once(name, fn) -> function
TG.Events.off(name, fn) -> void
TG.Events.emit(name, payload) -> void
TG.Events.clear() -> void               // removes every listener (used by tests)
TG.Events.count(name) -> number         // listeners registered for name
TG.Events.NAMES                         // array of every event name in section 8
```

- Listeners are called synchronously, in the order they subscribed, as `fn(payload, name)`.
- The name `'*'` subscribes to every event.
- Each listener call is wrapped in `try/catch`. An exception is reported with `console.error` and does not stop other listeners or the emitter. A presentation bug therefore cannot break the simulation.
- `emit` with a name not in `TG.Events.NAMES` still delivers the event and warns once per name.
- `payload` is always an object. Listeners must not modify it.

### 4.3 `TG.RNG` (core.js, WP0)

```js
TG.RNG.create(seed) -> rng              // seed is coerced with (seed >>> 0)
rng.next() -> number                    // float in [0, 1)
rng.int(min, max) -> number             // integer, both ends inclusive
rng.pick(array) -> element              // undefined for an empty array
rng.weighted(weights) -> number         // index chosen in proportion to weights (array of numbers >= 0); -1 if the sum is 0
rng.chance(p) -> boolean                // true with probability p
rng.getState() -> number                // uint32
rng.setState(n) -> void
```

The generator is mulberry32, written exactly like this so that every implementation produces the same sequence:

```js
function next() {
  s = (s + 0x6D2B79F5) | 0;
  var t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
```

Check value: `TG.RNG.create(1).next()` must equal `0.6270739405881613`.

### 4.4 `TG.Save` (core.js, WP0)

```js
TG.Save.init(root) -> void              // root: the window object. Reads root.localStorage inside try/catch and keeps it, or null if the read throws
                                        // or the value is missing. Called by TG.Main.init as TG.Save.init(window)
TG.Save.load() -> data                  // reads and validates; falls back to defaults; result also at TG.Save.data
TG.Save.save() -> boolean               // writes TG.Save.data; false if storage failed
TG.Save.defaults() -> data              // a fresh default object
TG.Save.data                            // the current data. Equals defaults() from load time until load() is called
TG.Save.getSetting(key) -> value
TG.Save.setSetting(key, value) -> void  // also saves
TG.Save.scores(difficulty) -> entry[]   // copy, highest first, length SCORE_SLOTS
TG.Save.qualifies(difficulty, score) -> boolean   // score > lowest entry and score > 0
TG.Save.addScore(difficulty, entry) -> number     // 0-based position, or -1; also saves
TG.Save.best(difficulty) -> { wpm, score }
TG.Save.assist(difficulty) -> number    // the saved assist value for the difficulty, clamped to ASSIST_MIN_CONTINUE..ASSIST_MAX; 1 when nothing is saved
TG.Save.recordRun(result) -> void       // updates best wpm and best score for result.difficulty and stores result.assist; also saves.
                                        // A result with adaptive === false (adaptive pacing off) leaves the saved assist as it was
TG.Save.resetScores() -> void
```

- Every storage access is inside `try/catch`, including the first read of `root.localStorage`, which throws in some browsers when storage is blocked. If storage is missing, throws, or holds invalid JSON, the module works from memory and never throws.
- `TG.Save` works before `init` and before `load` are called (memory only, default data). The headless harness calls neither, so a headless run always starts from default settings and an assist of 1.
- Saving assist between runs is Tier 2. If it is left out, `assist()` returns 1 and `recordRun` does not store the value.
- Data shape: section 5.12.

### 4.5 `TG.Difficulty` (core.js, WP0)

```js
TG.Difficulty.NAMES                     // ['easy', 'medium', 'hard']
TG.Difficulty.get(name) -> config       // deep-frozen; throws on an unknown name
TG.Difficulty.rank(name) -> 0 | 1 | 2
TG.Difficulty.includes(name, tag) -> boolean   // true if an entry tagged `tag` is used on difficulty `name`
                                               // includes('easy','medium') = false; includes('hard','easy') = true
TG.Difficulty.budget(config, len) -> number    // nominal seconds = react + perChar * len
TG.Difficulty.toWs(config, nominal) -> number  // nominal * config.pace
TG.Difficulty.wordRange(config, kind, sectionIndex) -> [min, max]
                                        // config.wordLen[kind] with both ends raised by config.lenShift[sectionIndex]
                                        // (sectionIndex 3 = boss: no shift); max capped at MAX_WORD_LEN
TG.Difficulty.tierMix(config, sectionIndex) -> { tier: weight }
TG.Difficulty.TUNABLE                   // the top-level config keys that a level may override:
                                        // ['react', 'perChar', 'letterStall', 'impactGap', 'hazardMargin', 'urgentTime', 'maxActive',
                                        //  'wordLen', 'lenShift', 'tierMix', 'shieldKeyStreak', 'boss', 'bot']
TG.Difficulty.resolve(name, tune) -> config
                                        // The config used for a run. tune: the level's `tune` block (section 5.9), or undefined.
                                        // With no tune, or an empty one, returns TG.Difficulty.get(name) itself.
                                        // Otherwise returns a deep-frozen copy of get(name) into which tune.all and then tune[name] are merged.
                                        // Merge rule: a plain object is merged key by key; a number, string, boolean or array replaces the old value.
                                        // A top-level key that is not in TUNABLE is ignored with one console.warn. Throws on an unknown name.
```

Config shape and values: section 5.10.

`TG.Difficulty.get` gives the difficulty table as written. `TG.Game.newRun` uses `resolve`, so everything in the simulation reads `state.config`, never `TG.Difficulty.get`. The keys outside `TUNABLE` are the ones the menus show before a level is chosen (label, description, WPM guide, lives) and the help settings; a level cannot change them, so `TG.UI` may read them from `TG.Difficulty.get`.

### 4.6 `TG.Words` (words.js, WP-A)

```js
TG.Words.POOLS        // { easy: { 1: [...], 2: [...], 3: [...], boss: [...], finisher: [...], flavour: {} }, medium: {...}, hard: {...} }
                      // flavour is optional: { flavourName: { 1: [...], 2: [...], 3: [...] } }, extra words per tier for one word flavour.
                      // Level 1 has none: its meadow words are already in the tiers.
TG.Words.SAMPLES      // { easy: ['ask','frog','puppy'], medium: ['river','bridge','rainbow'], hard: ['zephyr','labyrinth','silhouette'] }
TG.Words.ADJACENT     // { q: 'wa', w: 'qase', ... } QWERTY neighbours of each letter, including the letter's row neighbours and the keys above and below
TG.Words.createPicker(difficultyName, rng, opts) -> picker
                      // opts is optional: { flavour: 'meadow' }. If POOLS[difficultyName].flavour[opts.flavour] exists, its lists are added
                      // to tiers 1 to 3 for this picker. An unknown or missing flavour changes nothing and does not warn.
TG.Words.has(difficultyName, word) -> boolean    // true if the word is in any pool of that difficulty, flavour lists included
TG.Words.validate() -> string[]         // problems found in POOLS; empty when valid

picker.pick(req) -> string | null
picker.recent                           // array of the last RECENT_WORDS picks, oldest first
picker.reset() -> void                  // clears recent and the words returned so far
```

`req`:

```js
{
  tierMix: { 1: 0.3, 2: 0.7 },   // weights by tier; used when `tier` is absent
  tier: 'boss',                  // optional: 'boss', 'finisher', 1, 2 or 3. Picks from that pool only
  minLen: 4,
  maxLen: 6,
  active: ['frog', 'ask'],       // words currently active (any typable on screen or as an edge tag)
  weak: ['q', 'z']               // optional: the player's weakest letters
}
```

Behaviour: DESIGN 10.4, steps 1 to 11. With `tier` set, steps 1 and 6 are skipped. `pick` returns lowercase a-z. It returns `null` only when no word satisfies the first-letter and prefix rules. A returned word is appended to `picker.recent`. The picker also remembers every word it has returned (privately; `reset()` clears it with `recent`), and step 10 keeps only the candidates it has not returned before, when there are any; the candidates themselves come from steps 2 to 8 unchanged.

The two weightings of step 10 are Tier 2. If they are left out, every candidate has weight 1 and `req.weak` is ignored.

Pools: DESIGN Appendix A, used as given, plus extensions that follow DESIGN 10.1 and 10.2. `validate()` checks: a-z only; length within the tier's range; no word in more than one pool across all difficulties (flavour lists count as pools); Easy tier 1 uses only `asdfghjkl`; Easy tier 2 uses only `asdfghjkleirtou` and each word has a letter outside the home row; Easy tier 3 words each have a letter outside tier 2's set; every threat tier has at least 45 words; every pool has at least 8 distinct first letters.

### 4.7 `TG.Typing` (typing.js, WP-A)

The typing engine knows nothing about sprites, levels or scoring. It sees a list of objects that implement the typable interface (section 5.3) and mutates only the fields that interface says it owns.

```js
TG.Typing.create(opts) -> ty
   // opts: { autoReleaseMisses: 3 (0 = off), streakPenaltySteps: 1 | 2 | 5 }
TG.Typing.sync(ty, typables, now, dt) -> void
   // Call once per step before any key. If the locked target is not in `typables` or has typable === false,
   // releases the lock with reason 'gone' and, if the target's `lost` field is true, starts the discard window.
   // Counts down the discard window by dt. Refreshes stats.liveWpm every WPM_REFRESH seconds.
TG.Typing.key(ty, ch, typables, now) -> result
   // ch: one lowercase letter. now: state.time. See "Key handling" below.
TG.Typing.release(ty, reason) -> boolean
   // Releases the lock, sets the target's typed and errors to 0, emits target:release. reason: 'backspace' | 'auto' | 'gone' | 'screen'.
   // Returns false if nothing was locked.
TG.Typing.backspace(ty) -> 'kept' | 'released' | 'none'
   // The Backspace key (DESIGN 3.3). 'none' when nothing is locked. When the last key on the locked word was a wrong key and no
   // Backspace has followed it: 'kept', the lock, typed, errors and statistics stay as they are and nothing is emitted; the count
   // of wrong keys in a row towards auto-release is not reset. Otherwise release(ty, 'backspace') and 'released'.
TG.Typing.locked(ty) -> typable | null   // returns ty.target
TG.Typing.onDamage(ty) -> void           // life lost: cleanRun = 0, mult = 1, emits streak:change
TG.Typing.onMissed(ty, typable) -> void  // a threat reached Pip with its word unfinished: stats.wordsMissed++
TG.Typing.sectionSummary(ty) -> { wpm, accuracy, correct, wrong, words }   // since the last sectionReset
TG.Typing.sectionReset(ty) -> void
TG.Typing.summary(ty) -> summary         // section 5.11; pure, does not change ty
TG.Typing.weakLetters(ty, n) -> string[] // up to n letters, highest miss rate first, each with at least 2 misses
TG.Typing.mult(cleanRun) -> number       // 1..5 from MULT_STEPS
```

The engine object. These four fields are public and binding; anything else on `ty` is private to `typing.js`.

```js
ty = {
  opts: { autoReleaseMisses: 3, streakPenaltySteps: 2 },
  stats: { /* section 5.11 */ },
  target: null,        // the locked typable, or null. Written only by TG.Typing
  discardT: 0          // s left of the spillover guard; 0 when it is not running
};
```

`state.typing` is this object. `TG.Render`, `TG.Hud` and `TG.Effects` read the lock from `state.typing.target` directly, so that they work on a hand-built state when `typing.js` is not loaded. They never write to it.

`result`:

```js
{
  type: 'ignored' | 'discarded' | 'miss' | 'lock' | 'hit' | 'complete',
  target: typable | null,
  ch: 'a',
  index: 0,            // index of the letter just typed (lock: 0); -1 for ignored, discarded, miss
  expected: 'r' | null,// for miss: the letter that was expected
  clean: true,         // for complete: no wrong keys on this word
  wordTime: 1.84,      // for complete: tLastKey - tFirstKey, s
  released: false      // true if this key caused an auto-release before being retried
}
```

**Key handling**, in order:

1. If `now` is not greater than the time of the previous key, use the previous key's time + 0.001. Key times are therefore strictly increasing.
2. If the discard window is open: result `discarded`. No statistics change.
3. If a target is locked:
   - `ch` equals the next letter: `typed++`, stats updated, emit `type:hit`. If the word is now complete: update word statistics, release the lock silently (no `target:release` event), result `complete`. Otherwise result `hit`.
   - Otherwise it is a wrong key: `errors++` on the target, `stats.wrong++`, the miss is recorded against the expected letter, `keyStreak = 0`, emit `type:miss`. If auto-release is on, the target has `typed <= AUTO_RELEASE_MAX_TYPED`, and this is the Nth wrong key in a row on this lock (N = `autoReleaseMisses`): undo the miss count for this key and release with reason `'auto'`. Then, if the run of wrong keys on this lock (since the last correct key or lock change, less any key taken back by a `'kept'` Backspace, and not reaching back past a `sectionReset`) has two or more keys and spells the start of the word of a typable with `typed === 0`, chosen as in step 4, the run is replayed on it: the misses of the run are undone, `keyStreak` returns to its value before the first key of the run, and the word is locked by the first key of the run and typed by the others at the times they were pressed (`target:lock`, then a `type:hit` per key, as in step 4 and the first case above). The result is that of the last key, with `released: true`. With no such run, handle the same key again from step 4 with `released: true`. Otherwise result `miss`.
4. If nothing is locked:
   - No entry in `typables` has `typable === true`: result `ignored`.
   - Candidates are typables with `typable === true` and `typed === 0` whose word starts with `ch`. Choose the lowest `priority`, then the lowest `eta`, then the lowest `id`. Set the lock, `typed = 1`, record `firstKeyAt`, emit `target:lock` then `type:hit` with `index: 0`. If the word has one letter it is complete (not used in Level 1). Result `lock`.
   - No candidate: wrong key. `stats.wrong++`, recorded against the first letter of the typable with the lowest `eta`, `keyStreak = 0`, emit `type:miss` with `target: null`. Result `miss`.

On `complete`, `TG.Typing` updates: `wordsCleared`, `lettersInWords += length - 1`, `wordTime`, `recentWords`, `wpm`, `peakWpm`, reaction time, `cleanRun` and `mult` (DESIGN 8.2), `bestCleanRun`. It emits `streak:change` when `mult` changes and `streak:milestone` for key streak milestones. It does not score, remove the entity or emit `word:clear`; `TG.Game` does that.

Crate words and boss words count in statistics like any other word. For a boss word (kind `core` or `finisher`) the engine emits `type:hit` with `complete: true` like for any word; no `word:clear` follows (section 4.16, step 5).

### 4.8 `TG.Audio` (audio.js, WP-B)

```js
TG.Audio.SFX                          // array of every sound effect name in section 7.1
TG.Audio.TRACKS                       // array of every track and jingle name in section 7.2
TG.Audio.init() -> void               // subscribes to events (section 7.3). Creates no AudioContext
TG.Audio.unlock() -> boolean          // call from a key or pointer handler. Creates or resumes the AudioContext. Safe to call repeatedly. False if audio is unavailable
TG.Audio.isUnlocked() -> boolean      // true only while the AudioContext exists and its state is 'running'
TG.Audio.sfx(name, opts) -> void      // opts: { step: 0.., pan: -1..1, duration: s }. No-op when locked or when sound effects are off
TG.Audio.music(name, opts) -> void    // name: a looping track, or null to stop. opts: { transpose: semitones, tempo: bpm, restart: boolean }
                                      // Calling with the track already playing changes transpose and tempo at the next bar without restarting, unless restart is true
TG.Audio.jingle(name) -> void         // plays once; a looping track is ducked to 30% while it plays
TG.Audio.setTempoScale(f) -> void     // multiplies the current tempo (Hourglass: 0.75)
TG.Audio.setBassOnly(flag) -> void
TG.Audio.setEnabled(kind, flag) -> void   // kind: 'music' | 'sfx'
TG.Audio.suspend() -> void            // suspends the AudioContext: all sound stops. Called by TG.Main when the window loses focus or the tab is hidden
TG.Audio.resume() -> void             // resumes the AudioContext. Called by TG.Main when the window has focus again. No-op before unlock
TG.Audio.update(dt) -> void           // called by TG.Main once per displayed frame. Runs the sequencer's 100 ms look-ahead and the urgent tick. No timers are used
```

- `suspend` and `resume` act on the AudioContext only. They do not start or stop the sequencer. Stopping the sequencer on the pause screen is separate and is driven by `screen:change` (section 7.3); sound effects still play on the pause screen.
- Unknown names warn once and do nothing.
- If `AudioContext` does not exist or throws, every function is a no-op and nothing throws.
- `TG.Audio.init` reads `music` and `sfx` from `TG.Save.getSetting`.

### 4.9 `TG.Gfx` (gfx.js, WP-C)

```js
TG.Gfx.init(doc) -> void              // doc: document. Stores the canvas factory. Builds nothing yet
TG.Gfx.color(index) -> string         // '#rrggbb' from TG.PAL
TG.Gfx.has(name) -> boolean           // sprite is defined
TG.Gfx.info(name) -> { w, h, frames, ax, ay, fps, names } | null     // from the definition, or from TG.Sprites.MANIFEST if undefined
TG.Gfx.frameIndex(name, frame) -> number      // frame: index or frame name; unknown -> 0
TG.Gfx.get(name, frame, opts) -> canvas       // cached off-screen canvas for one frame. opts: { remap, flipX }
TG.Gfx.draw(ctx, name, frame, x, y, opts) -> void
   // Draws the frame so that the sprite's anchor lands on (floor(x), floor(y)).
   // opts: { flipX: boolean, remap: string, scale: 1|2|3|4, anchor: boolean (default true; false = x,y is the top-left corner) }
   // With flipX the anchor is mirrored as well, so a flipped sprite stays on the same spot.
TG.Gfx.rect(ctx, x, y, w, h, colorIndex) -> void          // filled rectangle, floored
TG.Gfx.frame(ctx, x, y, w, h, colorIndex) -> void         // 1 px outline rectangle
TG.Gfx.dither(ctx, x, y, w, h, colorIndex, phase) -> void // checkerboard of single pixels; phase 0 or 1 selects which squares
TG.Gfx.clearCache() -> void
```

- Frames are rendered to off-screen canvases on first use and cached by `name|frame|remap|flipX`.
- A remap is a named table in `TG.Remaps` (section 6.3). It is applied when the frame is cached.
- If `name` is not defined, `draw` draws a placeholder: a CORAL 1 px outline box of the manifest size (16x16 if unknown) with the first two letters of the name inside, and warns once per name.
- `TG.Gfx` sets `imageSmoothingEnabled = false` on every context it creates. `TG.Render.init` does the same for the main canvas.

### 4.10 `TG.Font` (font.js, WP-C)

```js
TG.Font.CELL                          // 8
TG.Font.SYM                           // names for special glyphs, see below
TG.Font.has(ch) -> boolean
TG.Font.measure(text, scale) -> number        // text.length * 8 * (scale || 1)
TG.Font.draw(ctx, text, x, y, opts) -> void
   // x, y: top-left of the first cell, floored.
   // opts: { color: index (default WHITE), scale: 1|2|4 (default 1), align: 'left'|'center'|'right' (default 'left'; x is then the left, centre or right of the text),
   //         shadow: boolean (INK copy offset by scale px right and down), rowColors: [8 indices] (one colour per glyph row, overrides color) }
TG.Font.drawGlyph(ctx, ch, x, y, colorIndex, scale) -> void
```

- Lowercase letters are drawn as uppercase. Unknown characters are drawn as `?`.
- Character set: `A-Z 0-9 . , ! ? : ; ' " - + / % ( ) = * #` and space.
- Special glyphs are reached through `TG.Font.SYM`, which maps names to the single characters that stand for them:

```js
TG.Font.SYM = { UP: '^', DOWN: '_', LEFT: '<', RIGHT: '>', CHEV_UP: '{', CHEV_DOWN: '}',
                HEART: '@', STAR: '&', DROP: '$', BLOCK: '|', RETURN: '~' };
```

- Glyph data is 8 rows of 8 characters (`#` = pixel, `.` = empty), drawn within the top-left 7x7 of the cell. Glyphs are cached per colour and scale through off-screen canvases.

### 4.11 `TG.Sprites`, `TG.Remaps`, `TG.Backdrops`, `TG.Levels` (registries in core.js, WP0)

```js
TG.Sprites.define(name, def) -> void    // stores def; throws if name is already defined or def fails TG.Sprites.check
TG.Sprites.get(name) -> def | null
TG.Sprites.has(name) -> boolean
TG.Sprites.names() -> string[]
TG.Sprites.check(def) -> string[]       // format problems (section 6.1); empty when valid
TG.Sprites.MANIFEST                     // array of { name, w, h, frames, ax, ay, owner } transcribed from section 6.4
TG.Sprites.missing(owner) -> string[]   // manifest names for owner ('C' or 'D', or undefined for all) that are undefined or differ in size or frame count

TG.Remaps      // plain object: name -> { fromIndex: toIndex, ... }. '*' as a key means "every opaque colour"
TG.Backdrops   // plain object: id -> backdrop definition (section 6.5)
TG.Levels      // plain object: level id -> level data (section 5.9)
```

### 4.12 `TG.Input` (input.js, WP-E)

`TG.Input` turns DOM events, on-screen buttons and bot calls into one queue of input events. It has no game logic.

```js
TG.Input.init(target) -> void          // target: window. Adds keydown, keyup and blur listeners
TG.Input.bindButton(element, key) -> void
   // key: 'jump' | 'duck'. Adds pointerdown, pointerup, pointercancel and pointerleave listeners.
   // Calls preventDefault and never lets the element keep keyboard focus.
TG.Input.translate(e) -> { kind: 'char', ch } | { kind: 'key', key } | null     // pure; e is a KeyboardEvent-like object
TG.Input.typeChar(ch) -> void          // queues { type: 'char', ch }. ch is lowercased; anything outside a-z is dropped
TG.Input.keyDown(key) -> void          // queues { type: 'down', key } unless that key is already down
TG.Input.keyUp(key) -> void            // queues { type: 'up', key } if that key was down
TG.Input.isDown(key) -> boolean
TG.Input.drain() -> event[]            // returns the queue in order and empties it
TG.Input.clear() -> void               // empties the queue and marks every key as up (queues no events)
TG.Input.onFirstInput                  // settable: function called once, on the first keydown or pointerdown (used to unlock audio)
```

Key names: `'space'`, `'enter'`, `'up'`, `'down'`, `'left'`, `'right'`, `'esc'`, `'backspace'`, `'semicolon'`, `'jump'`, `'duck'`. The last two come from the on-screen buttons and the bot.

`translate` rules:

| Event | Result |
|---|---|
| `ctrlKey`, `metaKey` or `altKey` is set | `null`, and the DOM handler does not call `preventDefault` |
| `e.key` is one character in `a-z` or `A-Z` | `char` with the lowercase letter; `null` if `e.repeat` |
| `e.key` is `;` or `:` | key `semicolon` |
| `e.code` is `Semicolon` and `e.key` is not a single letter a-z | key `semicolon` |
| `e.key` is one character outside ASCII (a letter of a non-Latin layout, for example `'ф'`) and `e.code` is `KeyA` to `KeyZ` | `char` with the lowercase letter of the code (`KeyA` gives `a`); `null` if `e.repeat`. `{ key: 'é' }` with no such code stays `null` |
| `e.key` is `' '` or `Spacebar` | key `space` |
| `Enter`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Escape`, `Backspace` | keys `enter`, `up`, `down`, `left`, `right`, `esc`, `backspace` |
| anything else | `null` |

The DOM handler calls `preventDefault` for every event that translates to something. `e.repeat` key events are dropped for keys as well as letters. On `blur`, `TG.Input.clear()` is called.

How consumers read keys:

| Consumer | Jump | Duck | Release lock | Pause | Confirm | Back |
|---|---|---|---|---|---|---|
| `TG.Game` (sim screens) | `space`, `up`, `jump` | `enter`, `down`, `semicolon`, `duck` | `backspace` | `esc` | | |
| `TG.UI` (other screens) | | | | | `enter`, `space` | `esc` |

### 4.13 `TG.Entities` (entities.js, WP-E)

```js
TG.Entities.KINDS                        // table, section 5.4
TG.Entities.createPlayer(config, x) -> player
TG.Entities.pressJump(state) -> void     // starts the jump buffer
TG.Entities.pressDuck(state) -> void     // starts or restarts a slide
TG.Entities.releaseDuck(state) -> void
TG.Entities.updatePlayer(state, wdt, dt) -> void
TG.Entities.spawn(state, spec) -> entity | null
   // spec: a level spawn entry (section 5.9) or { kind, from, power, tutorial, intro }.
   // Applies the active cap, picks the word, sets the budget (DESIGN 4.1) and the start position (DESIGN 4.3).
   // Returns null, changing nothing, if the cap is reached or the picker returns null. The caller retries after SPAWN_RETRY.
TG.Entities.spawnAttack(state, kind) -> entity      // kind: 'shock' | 'pick'
TG.Entities.update(state, wdt, dt) -> void
   // Advances clocks and positions, refreshes eta, onScreen, urgent; emits threat:* events;
   // decides contact (see "Contact" below), collects ink drops; marks finished entities dead; removes dead entities at the end.
TG.Entities.typables(state) -> typable[]            // active threats and crates, plus state.boss.word when it is typable
TG.Entities.activeThreats(state) -> number          // entities of type 'threat' that are not dead
TG.Entities.remove(state, entity, reason) -> void   // reason: 'cleared' | 'hit' | 'bounced' | 'escaped' | 'blast' | 'flee'. See "Removal" below
TG.Entities.clearAll(state, reason) -> void         // calls remove(state, entity, reason) for every live threat and crate; removes every attack
TG.Entities.damage(state, cause) -> 'none' | 'shield' | 'life'
   // cause: { type: 'threat' | 'hazard' | 'attack' | 'fall', kind, id, from }
   // 'none' when Pip is invulnerable. Falls ignore invulnerability and shield.
TG.Entities.hitbox(entity) -> { x, y, w, h }        // world px, x,y = left, top; already inset
TG.Entities.playerBox(player) -> { x, y, w, h }     // standing or sliding box; not inset
TG.Entities.nextAction(state) -> action | null      // section 5.8; the nearest jump or duck that Pip has not yet passed
```

`TG.Entities.update` never uses the renderer's idea of what is visible. `onScreen` is true when the entity's sprite box intersects the playfield: the 384 px wide view, between `PLAY_TOP` and `GROUND_Y`. A Digby that is still underground is therefore not on screen.

**Contact.** How `TG.Entities.update` decides that something has reached Pip:

| What | Rule |
|---|---|
| Threat (type `threat`) | By its clock. Contact happens on the first step on which `t >= 1`. Pip's height, jump state and slide state are not tested and no hitbox is used. A typable threat therefore cannot be jumped over or slid under (DESIGN 4.4) |
| Crate | Never makes contact. At `t >= 1` it has left the screen and is removed with reason `escaped` |
| Attack (type `attack`) | `TG.Util.overlap(TG.Entities.hitbox(attack), TG.Entities.playerBox(player))` |
| Bramble, branch, beehive, arch | Overlap of the hazard's inset collision box (section 5.8) with `playerBox(player)` |
| Gap | The foot box rules of section 5.2 |
| Ink drop | Overlap of the item's box (section 5.14) with `playerBox(player)` |

On contact with a threat, `TG.Entities.damage` is called with `type: 'threat'`. If it returns `'none'` the threat is removed with reason `bounced`, otherwise with reason `hit`. In both cases the word was not finished: `TG.Typing.onMissed` is called, `run.threatsMissed` goes up by 1 and the threat counts with `u = U_MISS` for adaptive pacing.

**Removal.** `TG.Entities.remove` sets `dead = true` and `reason`, sets `lost = true` for every reason except `cleared`, and emits one event. Every removal of a threat or crate is therefore announced by exactly one event.

| Reason | Used when | Event emitted by `remove` |
|---|---|---|
| `cleared` | The word was typed | none; `TG.Game` emits `word:clear` with cause `typed` |
| `blast` | Ink blast | none; `TG.Game` emits `word:clear` with cause `blast` |
| `hit` | Contact that cost a life or a shield charge | `threat:hit` |
| `bounced` | Contact while Pip was invulnerable | `threat:bounce` |
| `escaped` | A crate drifted off the screen | `threat:escape` with reason `drift` |
| `flee` | Arena start, boss finisher, continue | `threat:escape` with reason `flee` |

Threats removed with `flee` are not counted as missed and do not enter adaptive pacing.

`TG.Entities.damage` is the single place where Pip is hurt. In order: if `cause.type` is not `fall` and `player.invulnT > 0`, return `'none'`. If `cause.type` is not `fall` and `power.shield > 0`: use a charge, set `invulnT = SHIELD_INVULN`, emit `shield:break`, count `run.damageTypable` or `run.damageOther`, return `'shield'`. Otherwise: `lives--`, `invulnT = config.invuln`, `hurtT = 0.3`, update the run counters, call `TG.Typing.onDamage`, lower `assistTarget` by 0.10 if `cause.type` is `threat`, emit `hero:hurt` (not for falls) and `life:lost`, fill `state.lifeLost`, set `resumeTo` to the current screen and go to `lifeLost`. Return `'life'`.

### 4.14 `TG.Level` (level.js, WP-E)

```js
TG.Level.validate(data) -> string[]      // static checks, section 5.9; empty when valid
TG.Level.build(data, config) -> level    // runtime level for one difficulty (section 5.9). Throws if validate(data) is not empty
TG.Level.isGround(level, x) -> boolean   // false over a gap that is not bridged; true for x < 0 and x >= level.arenaX
TG.Level.gapAt(level, x) -> hazard | null
TG.Level.sectionAt(level, x) -> number   // 0, 1, 2, or 3 for the boss arena
TG.Level.update(state, wdt) -> void
   // In order: section change (emits section:enter), checkpoint crossing (emits checkpoint), spawn triggers and retries,
   // hazard cues (emits hazard:cue), arena start (clears threats with reason 'flee', sets the screen to bossIntro).
TG.Level.resetFrom(state, checkpointIndex) -> void
   // Re-arms spawns with x >= the checkpoint, restores ink drops with x >= the checkpoint, clears hazard `cued` and `passed`
   // flags from the checkpoint on. Keeps `bridged` and `falls`.
TG.Level.makeItems(level, fromX) -> item[]          // ink drop items (section 5.14) at or after fromX, sorted by x
```

`section:enter` is emitted by `TG.Level.update` when Pip crosses into a new section. At the start of a run and after a continue it is emitted by `TG.Game` (section 4.16), because no boundary is crossed then.

### 4.15 `TG.Boss` (boss.js, WP-E)

```js
TG.Boss.create(state) -> boss            // also sets state.boss; phase from state.checkpoint.bossPhase
TG.Boss.update(state, wdt, dt) -> void   // runs the round state machine (section 5.7), keeps boss.x = player.x + BOSS_DX
TG.Boss.onWordComplete(state, word) -> void   // called by TG.Game when state.boss.word is completed (weak point or finisher)
TG.Boss.phaseStartHealth(config, phase) -> number
TG.Boss.phaseForHealth(config, health) -> 1 | 2 | 3
```

### 4.16 `TG.Game` (game.js, WP-E)

```js
TG.Game.state                            // the current game state (section 5.1). Replaced by init and newRun; read it fresh each frame
TG.Game.init() -> state                  // screen 'boot'; no run data. Emits screen:change with { from: null, to: 'boot', data: null }
TG.Game.newRun(opts) -> state
   // opts: { difficulty: 'easy'|'medium'|'hard', seed: integer, levelId: 1, adaptive: boolean, assist: number, tutorial: boolean }
   // Defaults: levelId 1, seed 1, adaptive from the `adaptive` setting (true if unset), assist = TG.Save.assist(difficulty) when
   // adaptive is true and 1 when it is false (DESIGN 9.3), tutorial = config.tutorialAlways || !TG.Save.getSetting('tutorialDone').
   // TG.Save is only read here. The simulation never writes to TG.Save.
   // state.config = TG.Difficulty.resolve(difficulty, TG.Levels[levelId].tune).
   // The picker is TG.Words.createPicker(difficulty, state.rng, { flavour: level.theme.wordFlavour }).
   // Builds the level, player, picker and typing engine, sets screen 'playing' without checking the transition table.
   // Emits, in this order: screen:change, level:start with continued: false, section:enter for section 0.
TG.Game.step(dt) -> void                 // advances one step if state.screen is in SIM_SCREENS; otherwise returns at once without draining input
TG.Game.isSimScreen(name) -> boolean
TG.Game.canGo(from, to) -> boolean       // transition table, section 9
TG.Game.setScreen(name, data) -> boolean // checks canGo; sets state.screen, state.screenT = 0, state.screenData = data || null; emits screen:change. False (and a warning) if not allowed
TG.Game.pause() -> boolean               // from playing, bossIntro or boss: stores resumeTo, goes to 'paused', returns true.
                                         // From lifeLost: sets state.pausePending = true and returns false (section 9.2). Elsewhere: false
TG.Game.resume() -> boolean              // from paused: returns to resumeTo
TG.Game.continueRun() -> boolean         // from gameOver or paused: DESIGN 6 "Continue". Goes to 'playing', or 'bossIntro' at the boss checkpoint. See below
TG.Game.endRun() -> boolean              // from gameOver or paused: builds state.result with cleared: false, goes to 'results'
TG.Game.addScore(points, info) -> void   // info: { reason, x, y }. Adds, checks extra-life thresholds, emits score:add
TG.Game.addLife(cause) -> boolean        // false at MAX_LIVES
TG.Game.applyPower(power, x, y) -> void  // 'shield' | 'hourglass' | 'quill' | 'blast' | 'cap'
TG.Game.snapshot() -> object             // JSON-safe summary for tests, section 10.4
```

**Order of work inside `TG.Game.step(dt)`.** This order is fixed so that runs are reproducible.

1. Return if `state.screen` is not a sim screen.
2. `state.frame++`, `state.time += dt`, `state.screenT += dt`.
3. Work out `state.timeScale` (section 11.3) and `wdt = dt * state.timeScale`. `wdt` is 0 while the screen is `lifeLost`.
4. `TG.Typing.sync(ty, typables, state.time, dt)`.
5. Drain `TG.Input` and handle each event in order:
   - `char`: `TG.Typing.key`, then apply the result (scoring, clears, power-ups, boss word, shield for a key streak). Letters are handled on `playing`, `boss` and `lifeLost`.
   - jump key down: `TG.Entities.pressJump`. Duck key down: `pressDuck`. Duck key up: `releaseDuck` if no other duck key is down.
   - `backspace` down: `TG.Typing.backspace(ty)` (section 4.7): straight after a wrong key it keeps the word, otherwise it releases with reason `'backspace'`.
   - `esc` down: `TG.Game.pause()` and stop handling this step's remaining events (they are dropped).

   After the events, whether or not there were any: `player.duckHeld = TG.Input.isDown('enter') || TG.Input.isDown('down') || TG.Input.isDown('semicolon') || TG.Input.isDown('duck')`. This keeps `duckHeld` right when a key-up was lost, for example when the key was released while the game was paused or after `TG.Input.clear()`.
6. Screen timers: `lifeLost`, `bossIntro`, `levelComplete`. When a timer ends, change screen and return. When the `lifeLost` timer ends with lives remaining and `state.pausePending` is true, the game goes to `paused` instead (section 9.2).
7. `TG.Level.update(state, wdt)` on `playing`. `TG.Boss.update(state, wdt, dt)` on `bossIntro`, `boss` and `levelComplete`.
8. `TG.Entities.updatePlayer(state, wdt, dt)`, then `TG.Entities.update(state, wdt, dt)`.
9. Power-up timers, tutorial slow-down, adaptive pacing, camera.
10. `state.worldTime += wdt`.

**Applying a typing result** (step 5, `char`):

- Result `lock`, `hit` or `complete`: the letter scores `PTS_LETTER` (twice that with the Golden quill) and a moving threat's clock gets the letter stall (`toWs(config, config.letterStall)` added to `stallT`), but only when the letter takes the word past its `bestTyped` (section 5.3), which is then raised to `typed`. A letter typed again after a release earns neither. When one key has typed several letters (a run replayed after an auto-release, 4.7), each letter past `bestTyped` earns both.
- Result `complete` on a threat or crate: `TG.Game` scores the word, calls `TG.Entities.remove(state, entity, 'cleared')`, emits `word:clear` with cause `typed`, and for a crate calls `applyPower`.
- Result `complete` on a boss word (kind `core` or `finisher`): `TG.Game` does **not** emit `word:clear`. It calls `TG.Boss.onWordComplete(state, word)`, which moves the boss to `recoil` (emitting `boss:hit`) or to `defeated` (emitting `boss:defeat`). Presentation modules recognise a completed boss word by `type:hit` with `complete: true` and kind `core` or `finisher`.
- Shield for a key streak: after every result of type `lock`, `hit` or `complete`, if `stats.keyStreak > 0` and `stats.keyStreak % config.shieldKeyStreak === 0` and `power.shield < MAX_SHIELD`, then `power.shield++` and `shield:gain` is emitted with cause `streak`. When the key added more than one correct key (a replayed run), each `keyStreak` value it passed through is tested the same way.

**`continueRun`**, in order:

1. `run.continues++`, `checkpoint.continuesHere++`, adaptive pacing eases (DESIGN 9.3).
2. `TG.Entities.clearAll(state, 'flee')`.
3. `TG.Typing.release(ty, 'screen')` if a word is locked. Typing statistics are kept.
4. Score, ink and `nextLifeAt` return to the values in `state.checkpoint`. Lives return to `config.lives`.
5. Timed power-ups end without events: `power.slowT = 0`, `power.quillT = 0`, `power.last = null`, `slowScale = 1`. `power.shield` is kept. `tutorScale = 1`, `finisherScale = 1`, `pausePending = false`.
6. `TG.Level.resetFrom(state, checkpoint.index)`. The player is rebuilt at `checkpoint.x` in state `run`; the camera is set to its target.
7. At the boss checkpoint: `TG.Boss.create(state)` with the stored phase, and the screen becomes `bossIntro`. Otherwise the screen becomes `playing`.
8. Emits, in this order: `screen:change`, `game:continue`, `level:start` with `continued: true`, `section:enter` for the section of the checkpoint (index 3 at the boss checkpoint).

Presentation modules reset themselves on `level:start` (sections 4.17, 4.18 and 7.3), so nothing from before the game over carries into the continued run.

### 4.17 `TG.Effects` (effects.js, WP-F)

Presentation only: particles, clear animations, ink bolts, score popups, letter particles, screen shake, flashes, label effects, hero cast overlay.

```js
TG.Effects.init() -> void                // subscribes to events
TG.Effects.reset() -> void               // removes every effect. TG.Effects calls it itself on level:start (new run and continue)
TG.Effects.update(dt) -> void            // real seconds; called once per simulation step by TG.Main, on every screen except 'paused'
TG.Effects.draw(ctx, layer, camX) -> void   // layer: 'world' (drawn over entities, in world coordinates shifted by camX) or 'screen' (drawn over the HUD)
TG.Effects.shake() -> { x, y }           // current whole-pixel screen offset
TG.Effects.flash() -> number | null      // palette index to fill the playfield with this frame, or null
TG.Effects.label(id) -> { shakeX, border, hopIndex, blink } | null
   // per-typable label effects: shakeX in px, border as a palette index or null, hopIndex = letter index to raise 2 px or -1,
   // blink = true while the expected letter should blink after a wrong key
TG.Effects.casting() -> boolean          // true for 0.1 s after a correct key: draw hero_cast over the run frame and ink_spark at the quill
TG.Effects.count() -> number             // live particles (tests)
```

Limits: at most 256 particles; when full, the oldest is replaced. With `reduceFlash` on, `shake()` returns `{x: 0, y: 0}` and `flash()` returns `null`.

Rules for the clear sequence (DESIGN 4.6):

- **Threats and crates.** Started by `word:clear`. The ink bolt, flash, kind animation and letter particles use the payload's `x`, `y`, `w`, `h`.
- **Position outside the playfield.** If the payload's position is outside the view (a Boulder still beyond the right edge, a Swoop above the top, a Digby underground), the effect position is clamped to the playfield before anything is drawn: screen x to `[8, 376]`, y to `[PLAY_TOP + 8, GROUND_Y - 8]`. This is where the edge tag was, so the clear is always visible.
- **Boss words.** `word:clear` is not emitted for boss words. On `type:hit` with `complete: true` and kind `core` or `finisher`, `TG.Effects` plays the ink bolt to the payload's `x`, `y` and the letter particles from the boss plate (DESIGN 13.3). The Baron's own reaction follows from `boss:hit` or `boss:defeat`.
- **Hit while in the air or sliding.** On `threat:hit`, the hit effect is drawn at Pip's position, not at the threat's.

### 4.18 `TG.Hud` (hud.js, WP-F)

```js
TG.Hud.init() -> void                    // subscribes to events (banners, tips, prompts)
TG.Hud.reset() -> void                   // empties the banner queue, tips and prompts. TG.Hud calls it itself on level:start
TG.Hud.update(dt, state) -> void         // banner queue, blink timers, displayed WPM refresh
TG.Hud.draw(ctx, state) -> void          // top bar, progress strip or boss bar, boss plate, type bar, key guide, prompts, banners (DESIGN 13),
                                         // and the boss speech plate during bossIntro (text from state.level.boss.speech)
TG.Hud.banner(text, opts) -> void        // queues a banner; opts: { seconds: 2, color: index }
TG.Hud.keyGuideOn(state) -> boolean      // from the keyGuide setting: 'auto' follows config.keyGuide
```

- The type bar and the key guide show the locked word. `TG.Hud` reads it from `state.typing.target` (section 4.7); it is `null` when nothing is locked.
- The speech plate is an INK plate with a WHITE 1 px border, centred at x = 192 with its top at y = 40, text at 1x. It is shown from the second half of the boss intro until the screen leaves `bossIntro`.

### 4.19 `TG.Render` (render.js, WP-F)

```js
TG.Render.init(canvas) -> void           // canvas: the 384x216 canvas element. Gets the 2D context, turns smoothing off
TG.Render.draw(state) -> void            // draws one frame, in the order below
TG.Render.drawBackdrop(ctx, backdropId, palette, camX, time, sectionIndex) -> void   // parallax layers L0 to L4; used by TG.UI for the title screen
TG.Render.layoutLabels(state) -> label[] // pure; section 5.13. Used by draw and by tests
TG.Render.worldToScreenX(state, x) -> number   // floor(x - state.camera.x)
```

Draw order in `TG.Render.draw`:

1. If `state.screen` is one of `playing`, `lifeLost`, `bossIntro`, `boss`, `levelComplete`, `paused`, `gameOver` and `state.level` exists: the world.
   1. Backdrop (L0 to L4) with the section's palette.
   2. Tiles, gap fill, plank bridges, decor, signposts, checkpoint flags.
   3. Hazards, with their chevrons.
   4. Ink drops.
   5. Boss, entities, ground markers.
   6. Pip, shield ring or rescue bubble, cast overlay.
   7. `TG.Effects.draw(ctx, 'world', camX)`.
   8. Foreground layer L6.
   9. Word plates, lock brackets, edge tags.
   10. `TG.Effects.flash()`.
   11. `TG.Hud.draw(ctx, state)`.
   12. `TG.Effects.draw(ctx, 'screen', 0)`.
   The world (steps 1 to 10) is drawn offset by `TG.Effects.shake()`. The HUD is not.
2. Otherwise: fill with INK.
3. `TG.UI.draw(ctx, state)` if it exists.

Who draws what on the screens where both take part:

- `paused` and `gameOver`: `TG.Render` draws the world as it stands (on `gameOver` with Pip sitting, section 6.6). `TG.UI` then draws its dither and its text over it.
- `levelComplete`: `TG.Render` draws the world with Pip in his victory pose and the Baron from `state.boss` (section 5.7); `TG.Effects` draws the defeat sequence.
- Lock brackets and the `locked` and `dim` fields of word plates come from `state.typing.target` (section 4.7).

### 4.20 `TG.UI` (ui.js, WP-G)

```js
TG.UI.init() -> void                     // subscribes to screen:change
TG.UI.update(dt) -> void                 // called by TG.Main once per step when the screen is not a sim screen. Drains TG.Input
TG.UI.draw(ctx, state) -> void           // draws the current screen or overlay; draws nothing on playing, lifeLost, bossIntro, boss, levelComplete
TG.UI.panel                              // read-only: 'menu' | 'scores' | 'options' | 'story' on the title screen, otherwise null
TG.UI.onFocusLost() -> void              // called by TG.Main on blur and on a hidden tab: a running resume countdown goes back
                                         // to the pause menu; the game over countdown stands still until onFocusGained
TG.UI.onFocusGained() -> void            // called by TG.Main on focus and on a visible tab
TG.UI.setKeyboardHint(flag) -> void      // called by TG.Main: true after a touch press with no keydown seen yet, false on the
                                         // first keydown. While true, boot, title and How to Play say a keyboard is needed
```

`TG.UI` owns: boot, title (with its options, high score and story panels), difficultySelect, howToPlay, paused (menu and resume countdown), gameOver (countdown), results (tally and rank), highScoreEntry. It changes screens only through `TG.Game.setScreen`, `newRun`, `resume`, `continueRun` and `endRun`. It emits the `ui:*` events.

`TG.UI.init` must not read `TG.Game.state`: `TG.Main` calls it before `TG.Game.init`. `TG.UI` sets up each screen, including `boot`, when it receives `screen:change`; `TG.Game.init` emits that event for `boot`. `TG.UI.update` and `TG.UI.draw` do nothing until the first `screen:change` has arrived.

The `story` panel (title idle rotation) is Tier 2. If it is left out, `TG.UI.panel` never takes the value `story`.

`TG.UI` also does the saving that follows from play, because the simulation never writes to `TG.Save`:

- on `checkpoint` with `index >= 1`: `TG.Save.setSetting('tutorialDone', true)`;
- on entering `results`: `TG.Save.recordRun(state.result)`, once;
- on `highScoreEntry` confirm: `TG.Save.addScore`;
- when starting a run: `TG.Save.setSetting('lastDifficulty', difficulty)`. The seed for a run started from the menus is `(Date.now() >>> 0)`; only `TG.UI` may read the clock for this.

### 4.21 `TG.Main` (main.js, WP-G)

```js
TG.Main.init() -> void
   // In this order: TG.Save.init(window), TG.Save.load(), TG.Gfx.init(document), TG.Audio.init(),
   // TG.Input.init(window), TG.Input.onFirstInput = function () { TG.Audio.unlock(); },
   // TG.Input.bindButton for #btn-jump and #btn-duck, TG.Effects.init(), TG.Hud.init(),
   // TG.Render.init(canvas), TG.UI.init(), TG.Game.init(), resize handling, focus, blur and visibility handling, first requestAnimationFrame.
   // Each call is guarded so that a missing module does not stop the others.
   // TG.Main never reads window.localStorage itself; TG.Save.init does that inside try/catch.
TG.Main.frame(timestampMs) -> void       // the requestAnimationFrame callback
TG.Main.tick(dt) -> void                 // one fixed step, see below
TG.Main.layoutFor(winW, winH, dpr) -> { scale, cssW, cssH, buttons }
                                         // pure. dpr: window.devicePixelRatio, default 1. scale: number; cssW, cssH: canvas size
                                         // in CSS px; buttons: 'side' | 'below'. Rule below
TG.Main.resize() -> void                 // applies layoutFor(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1):
                                         // sets the canvas CSS size and position, places the buttons, sets the CRT overlay
```

**Scale and button placement** (`layoutFor`; lead decision 13.1, written back). The scale does not have to be a whole number of CSS pixels. It is a whole number of device pixels, so that every game pixel is the same size on screen, and small windows use the exact fit so the game is never shown tiny. With `B = TG.C.BUTTON_SPACE` (72) and `snap(f) = floor(f * dpr) / dpr`:

1. `s = snap(min(winW / 384, winH / 216))`. If `s >= 2` and `(winW - 384 * s) / 2 >= B`: `scale = s`, `buttons = 'side'`.
2. Otherwise `fit = min(winW / 384, (winH - B) / 216)` and `s = snap(fit)`. If `s >= 2`: `scale = s`, `buttons = 'below'`.
3. Otherwise `sideFit = min((winW - 2 * B) / 384, winH / 216)`. If `sideFit > fit` and `216 * sideFit >= 64` (a button): `scale = sideFit >= 2 ? snap(sideFit) : sideFit`, `buttons = 'side'`.
4. Otherwise `scale = max(0.25, fit)` (a fraction), `buttons = 'below'`.
5. `cssW = 384 * scale`, `cssH = 216 * scale`.

With `buttons = 'side'` the canvas is centred in the window, `#btn-duck` is centred in the left margin and `#btn-jump` in the right margin, both with their bottom edge level with the bottom of the canvas. With `buttons = 'below'` the canvas and a strip of height `B` directly below it are centred together; `#btn-duck` is at the left end of the strip and `#btn-jump` at the right end. In both cases the buttons are at least 64 x 64 CSS px, do not overlap the canvas and lie fully inside the window, so the page never needs to scroll. `resize` sets a class `buttons-side` or `buttons-below` on `#stage`. `resize` also works out the rectangles of the canvas, the CRT overlay and both buttons in CSS px (rounded to device pixels) and sets them as inline styles; `css/style.css` gives the look and a 2x layout for the moment before the script runs. The canvas backing store stays 384 x 216 and the CSS uses `image-rendering: pixelated`.

Check values with `dpr` 1: `layoutFor(1366, 768)` is scale 3, `side`. `layoutFor(1280, 720)` is scale 3, `below`. `layoutFor(1920, 1080)` is scale 4, `below`. `layoutFor(800, 600)` is scale 2, `below`. With other values: `layoutFor(1440, 900, 2)` is scale 3.5, `below`. `layoutFor(700, 500, 1)` is scale 700 / 384 (about 1.823), `below`. `layoutFor(1200, 400, 1)` is scale 400 / 216 (about 1.852), `side`. `layoutFor(844, 342, 3)` is scale 342 / 216 (about 1.583), `side`. `layoutFor(920, 500, 3)` is scale 2, `side`.

`TG.Main.frame` also calls `resize` when `window.devicePixelRatio` differs from the value of the last layout: moving the window to a screen with another pixel density need not fire a `resize` event.

The CRT overlay default (DESIGN 14.8) is on when the scale is 3 or more.

```js
TG.Main.tick = function (dt) {
  var s = TG.Game.state;
  if (TG.Game.isSimScreen(s.screen)) TG.Game.step(dt); else TG.UI.update(dt);
  s = TG.Game.state;
  if (s.screen !== 'paused') TG.Effects.update(dt);
  TG.Hud.update(dt, s);
};
```

The calls in `tick` are guarded as rule 6 of section 2.2 requires; the guards are left out above for brevity.

`TG.Main.frame` accumulates real time, runs `tick(DT)` at most `MAX_STEPS` times, calls `TG.Audio.update`, then `TG.Render.draw(TG.Game.state)`. If a frame is longer than `MAX_FRAME` it discards the accumulated time and calls `TG.Game.pause()`.

Focus handling:

| Browser event | `TG.Main` calls |
|---|---|
| `blur` on window; `visibilitychange` with `document.hidden` true | `TG.Game.pause()`, `TG.UI.onFocusLost()`, `TG.Input.clear()`, `TG.Audio.suspend()` |
| `focus` on window; `visibilitychange` with `document.hidden` false | `TG.UI.onFocusGained()`, `TG.Audio.resume()` |

Audio unlock and touch (DESIGN 2, 15.1): a browser starts an AudioContext only inside a user gesture, and Esc or a touch `pointerdown` is not one. So until `TG.Audio.isUnlocked()` is true, `TG.Main` calls `TG.Audio.unlock()` on every `keydown` except Esc, and on `pointerdown`, `pointerup`, `touchend` and `click` on the window. A `pointerdown` with `pointerType` `'touch'` before any `keydown` calls `TG.UI.setKeyboardHint(true)`; the first `keydown` calls `TG.UI.setKeyboardHint(false)`.

`TG.Game.pause()` does nothing on screens that are not being played, so on `title`, `results` and the other menu screens losing focus only silences the sound, and getting focus back restores it. On `paused` during the resume countdown and on `gameOver`, `TG.UI.onFocusLost` stops the countdown instead, so that play does not restart, or the run end, while the player is in another window. On `paused` the AudioContext runs again after `focus`, while the sequencer stays stopped until the player resumes (section 7.3). A pause request that arrives during `lifeLost` is deferred, not lost (section 9.2).

Page element ids (WP-G creates them; nobody else looks them up):

| id | Element |
|---|---|
| `stage` | Wrapper that is letterboxed in INK. Carries the class `buttons-side` or `buttons-below` |
| `game` | `<canvas width="384" height="216">` |
| `crt` | Overlay `<div>` above the canvas, `pointer-events: none`. Stays empty if the CRT overlay (Tier 2) is left out |
| `controls` | Wrapper for the two buttons, outside the canvas area |
| `btn-jump` | `<button tabindex="-1">JUMP</button>` |
| `btn-duck` | `<button tabindex="-1">DUCK</button>` |

---

## 5. Data shapes

All objects below are plain JavaScript objects. Fields marked "presentation hint" are set by the simulation for the renderer's benefit and have no effect on play.

### 5.1 Game state (`TG.Game.state`)

```js
state = {
  // Screen (section 9)
  screen: 'playing',
  screenT: 0,               // s since the screen was entered
  screenData: null,         // data passed to setScreen, e.g. { origin: 'start' } for howToPlay
  resumeTo: null,           // screen to return to from 'paused' or 'lifeLost'
  pausePending: false,      // a pause was requested during 'lifeLost' (section 9.2)

  // Clocks (section 11.3)
  frame: 0,                 // steps simulated in this run
  time: 0,                  // s, real, simulated in this run
  worldTime: 0,             // ws
  pace: 1.0,                // from the difficulty
  assist: 1.0,              // current adaptive value
  assistTarget: 1.0,
  adaptive: true,
  slowScale: 1,             // 0.5 while the Hourglass is active
  tutorScale: 1,            // 0.25 during a tutorial slow-down
  finisherScale: 1,         // 0.25 during the boss finisher
  timeScale: 1,             // product of the five factors above

  // Run setup
  seed: 1,
  rng: null,                // TG.RNG instance; simulation use only
  difficulty: 'medium',
  config: null,             // TG.Difficulty.resolve(difficulty, level tune): the difficulty entry with the level's overrides
  levelId: 1,
  level: null,              // runtime level, section 5.9
  picker: null,             // TG.Words picker
  typing: null,             // TG.Typing engine (section 4.7); statistics at state.typing.stats, locked typable at state.typing.target

  // World
  section: 0,               // 0, 1, 2 = sections; 3 = boss arena
  camera: { x: 0 },
  player: null,             // section 5.2
  entities: [],             // threats, crates and attacks, in spawn order
  items: [],                // ink drops still to be collected (section 5.14). Every element is drawn
  boss: null,               // section 5.7
  nextId: 1,                // next entity id

  // Score and power-ups
  score: 0,
  nextLifeAt: 10000,        // score at which the next extra life is given
  ink: 0,                   // ink drops towards the next life, 0..99
  inkTotal: 0,
  power: {
    shield: 0,              // charges, 0..MAX_SHIELD
    slowT: 0,               // s left of Hourglass
    quillT: 0,              // s left of Golden quill
    last: null              // 'hourglass' | 'quill' | null: which timed power the HUD slot shows
  },

  // Checkpoint: what a continue restores
  checkpoint: { index: 0, x: 96, score: 0, ink: 0, inkTotal: 0, nextLifeAt: 10000, bossPhase: 1, continuesHere: 0 },

  // Short interludes
  lifeLost: { cause: 'hit', t: 0, duration: 0.10, gapId: null, last: false },   // cause: 'hit' | 'fall'; last: true when no lives remain
  tutorial: { active: false, targetId: null },

  // Adaptive pacing bookkeeping
  adapt: { n: 0, uSum: 0, correct: 0, wrong: 0 },

  // Run counters
  run: {
    continues: 0, livesLost: 0, sectionLivesLost: 0,
    hits: 0, falls: 0,
    damageTypable: 0,       // lives or shield charges lost to typable threats
    damageOther: 0,         // lost to hazards, attacks and falls
    threatsCleared: 0, threatsMissed: 0, cratesCleared: 0, cratesMissed: 0,
    cleared: false,         // the boss was defeated
    ended: false,           // the run was ended from game over
    bonuses: []             // [{ id: 'lives', label: 'LIVES X3', points: 3000 }, ...]
  },

  result: null              // section 5.11, set when the run finishes
};
```

Before the first `newRun`, only `screen`, `screenT`, `screenData`, `resumeTo`, `pausePending` and `result` are meaningful; `level`, `player` and `typing` are `null`.

### 5.2 Player (`state.player`)

```js
player = {
  x: 96,                    // world px, centre
  y: 184,                   // world px, feet. GROUND_Y when on the ground
  vy: 0,                    // px/ws, positive = downwards. Used when falling
  state: 'run',             // 'run' | 'jump' | 'slide' | 'fall' | 'rescue'
  onGround: true,
  jumpT: -1,                // ws since take-off; -1 when not in a jump arc
  coyoteT: 0,               // ws left in which a jump is still allowed after leaving the ground
  bufferT: 0,               // ws left in which a pressed jump is remembered
  slideT: 0,                // ws left of the minimum slide
  duckHeld: false,
  lives: 4,
  invulnT: 0,               // s left, real
  animT: 0,                 // ws, for the run and slide cycles (presentation hint)
  hurtT: 0,                 // s left to show the hurt frame (presentation hint), 0.3 after a hit
  lastGapId: null           // gap Pip fell into, while state is 'fall' or 'rescue'
};
```

Movement rules:

- `x` increases by `RUN_SPEED * wdt` every step in every state except `fall` and `rescue`.
- **Jump arc.** While `jumpT >= 0`: `jumpT += wdt`; `s = jumpT / JUMP_TIME`; `y = GROUND_Y - 4 * JUMP_HEIGHT * s * (1 - s)`. The height comes from this closed form, not from integrating a velocity, so the jump covers at least `JUMP_DIST` at any time scale. When `s >= 1`: if the landing test passes, land (`y = GROUND_Y`, `onGround = true`, emit `hero:land`); otherwise Pip is committed to the fall at once, with `vy = 4 * JUMP_HEIGHT / JUMP_TIME`.
- **Two support tests.** The foot box is `[x - FOOT_W/2, x + FOOT_W/2]`.
  - *Running test* (states `run` and `slide`): Pip is supported if `TG.Level.isGround` is true at the rear end `x - FOOT_W/2` or at the centre `x`. The front end is not tested.
  - *Landing test* (the end of a jump arc): Pip lands if `isGround` is true at the rear end, the centre or the front end `x + FOOT_W/2`.
- **Leaving the ground without jumping.** On the first step on which the running test fails, `onGround = false` and `coyoteT = COYOTE`. `coyoteT` then counts down by `wdt`, and `y` stays at `GROUND_Y`. If the running test passes again before `coyoteT` reaches 0, Pip is on the ground again (`onGround = true`, `coyoteT = 0`) and nothing else happens. If `coyoteT` reaches 0 while the running test still fails, Pip is **committed to the fall**.
- **Committed fall.** `player.state = 'fall'`, `lastGapId` = the id of `TG.Level.gapAt(level, x)`, `hero:fall` is emitted, a slide ends, and the jump buffer is cleared. From then on `x` does not increase, the support tests are not made and a jump cannot start. Each step `vy += GRAVITY * wdt` and `y += vy * wdt` (`vy` starts at 0 for a fall from running).
- **Fallen.** When `y >= GROUND_Y + FALL_COMMIT` in state `fall`: `TG.Entities.damage(state, { type: 'fall' })`, screen `lifeLost` for `FALL_FREEZE`. Then state `rescue`, `x = gap.x + gap.w + RESCUE_AHEAD`, `y = GROUND_Y`, `vy = 0`, emit `hero:rescue`, state `run`.
- **Why two tests.** With one test on any part of the foot box, a 16 px gap leaves Pip unsupported for only 8 px of travel, less than the coyote time plus the fall, so narrow gaps could be run across. With the running test the unsupported span over any gap is at least 12 px (from centre = `gap.x + 4` to centre = `gap.x + gap.w`) against 6.4 px of coyote travel, so every open gap produces a fall if Pip does not jump. A jump that lands on the front end alone is followed by at most 4 px of running with the running test failing, which the coyote time covers, so every jump pressed inside the input window still clears both gap widths.
- **Jump input.** A jump starts when `bufferT > 0` and (`onGround` or `coyoteT > 0`) and Pip is not in a jump arc and not in state `fall` or `rescue`. A jump cancels a slide.
- **Slide.** `pressDuck` on the ground: state `slide`, `slideT = SLIDE_TIME`, emit `hero:duck`. Pressed in the air, the slide starts on landing if duck is still held or was pressed within `JUMP_BUFFER`. The slide ends when `slideT <= 0` and `duckHeld` is false.
- **Hitbox.** Standing and jumping: `HERO_W x HERO_H`. Sliding: `SLIDE_W x SLIDE_H`. Both are centred on `x` with the bottom at `y`.

### 5.3 Typable (the interface `TG.Typing` sees)

Threats, crates and boss words all carry these fields. "Owner" says who may write the field.

```js
typable = {
  id: 17,                   // Game.   Unique integer in the run
  kind: 'hoppet',           // Game.   Entity kind, or 'core' / 'finisher' for boss words
  word: 'frog',             // Game.   Lowercase a-z, length >= 2
  typable: true,            // Game.   May be locked and typed now
  priority: 0,              // Game.   0 = threats and boss words, 2 = crates. Lower is chosen first
  eta: 2.31,                // Game.   s, real, until impact at the current time scale. Infinity when untimed
  x: 412, y: 184,           // Game.   World px, the entity's anchor (copied into typing events)
  shownAt: 12.50,           // Game.   state.time when the word was first shown
  lost: false,              // Game.   Set true when the target is removed for any reason other than completion
  typed: 0,                 // Typing. Letters typed correctly
  errors: 0,                // Typing. Wrong keys while locked on this word
  firstKeyAt: null,         // Typing. state.time of the first correct key
  lastKeyAt: null,          // Typing. state.time of the latest correct key
  bestTyped: 0              // Game.   The most letters of this word ever typed. Letter points and the letter stall are paid only
                            //         for letters beyond it (section 4.16), so a release and retyping earns nothing. Not read by TG.Typing
};
```

### 5.4 Entity kinds (`TG.Entities.KINDS`)

```js
TG.Entities.KINDS = {
  //         type       from      sprite box   sprite           sound family      letter stall
  boulder: { type: 'threat', from: 'right',  w: 24, h: 32, sprite: 'en_boulder',    family: 'crunch', stall: false },
  dawdle:  { type: 'threat', from: 'right',  w: 16, h: 16, sprite: 'en_dawdle',     family: 'twang',  stall: true  },
  hoppet:  { type: 'threat', from: 'right',  w: 16, h: 16, sprite: 'en_hoppet',     family: 'pop',    stall: true  },
  buzzle:  { type: 'threat', from: 'right',  w: 16, h: 16, sprite: 'en_buzzle',     family: 'pop',    stall: true  },
  swoop:   { type: 'threat', from: 'above',  w: 24, h: 16, sprite: 'en_swoop',      family: 'crunch', stall: true  },
  truffle: { type: 'threat', from: 'behind', w: 24, h: 16, sprite: 'en_truffle',    family: 'bonk',   stall: true  },
  digby:   { type: 'threat', from: 'below',  w: 16, h: 16, sprite: 'en_digby',      family: 'bonk',   stall: true  },
  rock:    { type: 'threat', from: 'right',  w: 12, h: 12, sprite: 'pr_rock',       family: 'pop',    stall: true  },  // from is 'above' for a high rock
  crate:   { type: 'crate',  from: 'right',  w: 16, h: 32, sprite: 'crate_balloon', family: 'pop',    stall: false },
  shock:   { type: 'attack', from: 'right',  w: 16, h: 8,  sprite: 'pr_shock',      action: 'jump', elev: 0 },
  pick:    { type: 'attack', from: 'right',  w: 16, h: 16, sprite: 'pr_pickaxe',    action: 'duck', elev: 14 }
};
```

### 5.5 Threat and crate entities

A threat has every typable field (5.3) plus:

```js
threat = {
  /* ...typable fields... */
  type: 'threat',           // 'threat' | 'crate'
  from: 'right',            // 'right' | 'behind' | 'above' | 'below'
  w: 16, h: 16,             // sprite box; the hitbox is this inset by INSET on each side
  elev: 0,                  // px between the ground and the entity's bottom; y = GROUND_Y - elev. Negative while a digby is underground
  budget: 3.7,              // ws from the word being shown to impact (for a crate: until it has left the screen)
  age: 1.2,                 // ws on the entity's own clock; does not advance while stallT > 0.
                            // Boulder: not a clock. Each step age = budget - (dx - contact) / RUN_SPEED, from the distance Pip still has to run
  t: 0.32,                  // age / budget. Contact happens when t >= 1 (section 4.13)
  stallT: 0,                // ws of letter stall left
  holdSpan: 264,            // dawdle, hoppet, buzzle, truffle: largest distance beyond `contact` at which the entity is placed. Set at spawn. 0 for other kinds
  harmful: true,            // presentation hint. false for crates, and for digby while t < DIGBY_POP_T
  onScreen: true,           // the sprite box intersects the playfield (section 4.13)
  urgent: false,            // eta < config.urgentTime. Always false for crates
  tutorial: false,
  intro: false,
  section: 0,               // section index at spawn
  dead: false,              // set by TG.Entities.remove; removed from state.entities at the end of the step
  reason: null,             // why it was removed
  animT: 0,                 // ws since spawn (presentation hint)
  flipX: false,             // presentation hint; true for truffle (it faces right)
  phase: 'approach'         // presentation hint. swoop: 'enter' | 'hover' | 'dive'. digby: 'mound' | 'up'.
                            // dawdle, hoppet, buzzle, truffle: 'hold' while waiting at the screen edge, then 'approach'. others: 'approach'
};

crate = {
  /* ...threat fields, with... */
  type: 'crate', kind: 'crate', priority: 2, harmful: false,
  power: 'shield'           // 'shield' | 'hourglass' | 'quill' | 'blast' | 'cap'
};
```

Budget rules applied by `TG.Entities.spawn`, in order (all in nominal seconds until the last step):

1. `range = TG.Difficulty.wordRange(config, kind, section)`. Pick the word with `picker.pick({ tierMix, minLen, maxLen, active, weak })`. `active` holds the words of every live typable, including crates and the boss word. `weak` is `TG.Typing.weakLetters(ty, 2)` when `config.weakWeighting` is true and at least 20 words have been completed, otherwise it is left out. If the result is `null`, return `null`.
2. `base = react + perChar * len`. If `intro` or `tutorial`: `base *= INTRO_FACTOR`. For a crate: `base *= CRATE_FACTOR`.
3. Queue rule: `A` = live threats and crates with untyped letters; `R` = their untyped letters in total. `queue = react + perChar * (R + len) + 0.4 * react * A`.
4. Spacing rule: `latest` = the largest remaining time (nominal) among the live threats and crates counted in `A`; `spacing = (A > 0) ? latest + impactGap : 0`.
5. `budget = max(base, queue, spacing)`. For a boulder also at least `BOULDER_MIN_BUDGET / pace`.
6. Convert to world seconds: `budgetWs = budget * pace`.
7. Hazard keep-clear (threats only): `impactX = player.x + RUN_SPEED * budgetWs`. For each hazard of the level that applies to this difficulty and is not bridged, the zone is `[winStart - m, x + w + m]` with `m = hazardMargin * pace * RUN_SPEED`. While `impactX` is inside a zone, move it to the end of that zone. Then `budgetWs = (impactX - player.x) / RUN_SPEED`.
8. Crates follow steps 1 to 6 like threats, and a live crate is counted in `A`, `R` and `latest` when something is spawned after it. Crates skip step 7 and the active cap, and are not counted by `TG.Entities.activeThreats`.

`eta` for a threat or crate is `(budget - age + stallT) / max(timeScale, 0.01)`.

Start positions and paths follow DESIGN 4.3 with the constants of section 3. Two points need exact wording:

- **Waiting at the edge.** For dawdle, hoppet and buzzle, `holdSpan = HOLD_SPAN - HOLD_STEP * k`, where `k` is the number of live dawdles, hoppets and buzzles whose `phase` is `hold` at the moment of the spawn. For truffle, `holdSpan = TRUFFLE_HOLD`. Each step `dist = c * budget * (1 - t)` and `dx = contact + min(dist, holdSpan)` (negated for truffle). `phase` is `hold` while `dist > holdSpan`, otherwise `approach`. While holding, a hoppet sits (`elev = 0`) and a buzzle bobs as usual.
- **Digby.** Until `t = DIGBY_POP_T`: `dx = DIGBY_DX`, `elev = -DIGBY_DEPTH`, `phase = 'mound'`, `onScreen = false`. From then to `t = 1`, with `r = (t - DIGBY_POP_T) / (1 - DIGBY_POP_T)`: `dx = DIGBY_DX + (contact - DIGBY_DX) * r`, `elev = -DIGBY_DEPTH * (1 - r)`, `phase = 'up'`, `onScreen = true`. `threat:enter` is emitted when the phase changes to `up`.

`contact` for a threat is `HERO_W / 2 + (w - 2 * INSET) / 2`.

### 5.6 Attack entities (boss shockwave and pickaxe)

Attacks have no word and are not typable.

```js
attack = {
  id: 40, type: 'attack', kind: 'shock',   // 'shock' | 'pick'
  action: 'jump',           // 'jump' | 'duck'
  x: 600, y: 184, w: 16, h: 8, elev: 0,
  eta: 0.9,                 // ws until its hitbox first reaches Pip's standing hitbox; negative once it has
  harmful: true, onScreen: true, dead: false, reason: null, animT: 0
};
```

An attack starts at `boss.x - 24` and moves so that its distance to Pip shrinks by `ATTACK_SPEED` px per world second. It is removed when it is 32 px behind Pip's left screen edge, or on contact.

### 5.7 Boss (`state.boss`)

```js
boss = {
  kind: 'baron',
  x: 296, y: 184,           // world px, bottom centre; x = player.x + BOSS_DX
  w: 48, h: 48,
  state: 'intro',           // see the table below
  stateT: 0,                // ws in the current state (s, real, while 'intro')
  phase: 1,                 // 1..3
  round: 0,                 // rounds started in this phase
  health: 6, maxHealth: 6,
  volley: { toLaunch: ['rock', 'rock'], launched: 0, sinceLaunch: 0, hits: 0 },   // entries: 'rock' | 'rockhigh' | 'minion'
  attacks: ['shock'],       // attacks still to come in this round
  nextAttack: 'shock',      // alternates between rounds in phase 2 and on Easy in phase 3
  word: null,               // typable of kind 'core' or 'finisher' (5.3) while one is shown; its eta is the time left in the window
  windowWs: 0,              // length of the current taunt window, ws
  // presentation hints
  pose: 'idle',             // 'idle' | 'laugh' | 'raise' | 'throw' | 'stomp' | 'hurt' | 'dizzy'
  rise: 0,                  // px the body is lowered behind the mound: 0 = fully up, 40 = hidden
  lampRed: false,           // true from phase 2
  flashT: 0                 // s left of the white flash after a hit
};
```

| `boss.state` | Entered when | Does | Leaves when |
|---|---|---|---|
| `intro` | Screen becomes `bossIntro` | `rise` goes from 40 to 0; pose `laugh` in the second half | After `BOSS_INTRO_TIME` (or `BOSS_INTRO_SHORT` after a continue), real seconds. Screen becomes `boss`; next state `volley` |
| `volley` | A round starts | Builds `volley.toLaunch` for the phase. Launches the next entry when fewer than `config.boss.inFlight` rocks are live, at least the phase's launch gap has passed since the last launch, and `TG.Entities.spawn` succeeds. Pose `throw` for 0.3 ws after each launch. Emits `boss:attack` and `boss:throw` per launch, both with the entry's kind (`rock`, `rockhigh` or `minion`) | Every entry is launched and no rock or minion is live. Next `telegraph` |
| `telegraph` | | Pose `raise`. Fills `attacks` for the phase. Emits `boss:attack` with the first attack's kind | After `config.boss.telegraph` (nominal). Next `attack` |
| `attack` | | Pose `stomp` (shockwave) or `throw` (pickaxe). Spawns the first attack with `TG.Entities.spawnAttack`, which emits `attack:spawn`. When the attack is a pickaxe, also emits `boss:throw` with kind `pick`. If a second attack is queued, spawns it `config.boss.doubleGap` (nominal) after the first in the same way and emits `boss:attack` for it | No attack entity is live and none is queued. Next `taunt` |
| `taunt` | | Pose `laugh`. Picks a weak-point word (`tier: 'boss'`, length `config.boss.coreLen`), sets `boss.word`, `windowWs`. Emits `boss:weakopen` | Word completed: `onWordComplete`, next `recoil`. Window ends: emits `boss:weakclose` with `completed: false`, marks the word `lost`, clears `boss.word`, counts a miss for adaptive pacing, next `laugh` |
| `recoil` | Weak-point word completed | `health--`, pose `hurt`, `flashT = 0.2`, emits `boss:hit` and `boss:weakclose` with `completed: true`, scores `PTS_CORE` | After `BOSS_RECOIL`. `health == 0`: next `finisher`. Phase changed: next `transition`. Otherwise `volley` |
| `laugh` | Taunt window ended | Pose `laugh` | After `BOSS_LAUGH`. Next `volley` |
| `transition` | Phase changed | `phase++`, `round = 0`, `lampRed = true`, stores `phase` in `state.checkpoint.bossPhase`, emits `boss:phase` | After `BOSS_PHASE_TIME`. Next `volley` |
| `finisher` | Health reached 0 | Pose `dizzy`. Removes every threat and attack (reason `flee`). `state.finisherScale = FINISHER_SCALE`. Picks a finisher word (`tier: 'finisher'`), `eta = Infinity`. Emits `boss:finisher` | Word completed. Next `defeated` |
| `defeated` | Finisher completed | `finisherScale = 1`, scores the finisher bonus and `PTS_BOSS`, `run.cleared = true`, clears `boss.word`, emits `boss:defeat`, screen `levelComplete`. Pose `dizzy` throughout. `rise` stays 0 until the last 1.0 s of `LEVEL_COMPLETE_TIME`, then goes evenly from 0 to 40, so the Baron sinks into his mound while `TG.Effects` plays the defeat sequence | After `LEVEL_COMPLETE_TIME` (real) the game builds `state.result`, emits `level:clear` and goes to `results` |

Volley contents by phase: phase 1, all `rock`. Phase 2 and 3, the second entry is `rockhigh`. Phase 3 with `config.boss.minion`, the last entry is `minion` (a Digby spawned with `TG.Entities.spawn(state, { kind: 'digby' })`). `rock` and `rockhigh` are spawned as kind `rock` with `from` `right` or `above`, using section index 3 for word range and tier mix.

Attacks by phase: phase 1, `['shock']`. Phase 2, one attack, alternating `shock`, `pick` between rounds. Phase 3, `['shock', 'pick']` if `config.boss.doubleAttack`, otherwise alternating as in phase 2.

The minion and the double attack are Tier 2. They are switched by `config.boss.minion` and `config.boss.doubleAttack`, so leaving them out means setting both to `false` on every difficulty (section 12.2); no code path changes.

Rocks and minions are typable threats, so they follow the contact rule of section 4.13: a rock whose word is not finished lands on Pip at `t = 1` whatever he is doing. Shockwaves and pickaxes are attacks and are avoided by jumping and ducking.

### 5.8 Hazards and the next action

```js
hazard = {
  id: 'h12',                // unique in the level
  kind: 'gap',              // 'gap' | 'bramble' | 'branch' | 'beehive' | 'arch'
  action: 'jump',           // 'jump' for gap and bramble; 'duck' for branch, beehive, arch
  hold: false,              // true for arch
  x: 1696, y: 184,          // world px, left and top of the collision box
  w: 16, h: 32,             // px. gap: w = 16 or 32, h = 32 (down to the bottom of the screen)
  winStart: 1660,           // Pip's centre x from which pressing the action clears the hazard
  winEnd: 1700,             // last x at which pressing still clears it
  holdUntil: 0,             // arch only: keep duck held until Pip's centre passes this x
  postX: 1680,              // where the signpost stands (DESIGN 5): the best take-off point inside the window. Presentation only
  bridged: false,           // gap only: covered by planks
  falls: 0,                 // gap only: falls at this gap in this run
  cued: false,              // hazard:cue has been emitted
  passed: false,            // Pip's centre is beyond x + w
  prompt: false,            // show the key prompt (Easy: the first hazards of each action, and every arch)
  section: 0
};
```

Collision boxes (before the inset):

| Kind | x | y | w | h |
|---|---|---|---|---|
| gap | left edge | `GROUND_Y` | 16 or 32 | 32 |
| bramble | left edge | `GROUND_Y - BRAMBLE_H` | 16 | 8 |
| branch, beehive | left edge | `PLAY_TOP` | 16 | `GROUND_Y - HANG_CLEAR - PLAY_TOP` (146) |
| arch | left edge | `PLAY_TOP` | 48 | 146 |

Branch, beehive and arch boxes are inset by `INSET` on the left, the right and the bottom. The bramble box is inset by `BRAMBLE_INSET_X` (4) on the left and right and by `INSET` on the top, which leaves a box 8 px wide and 6 px high in the middle of the sprite. Gaps are not inset; falling is decided by the foot box (5.2).

The bramble's wider inset gives it an input window of 22 px, close to the other hazards. A jump clears the inset box for take-offs from `x - 29.1` to `x - 2.9`; the window below sits 2 px inside each end.

Windows are computed by `TG.Level.build` from the constants in section 3:

| Kind | `winStart` | `winEnd` | `holdUntil` | `postX` |
|---|---|---|---|---|
| gap | `x + w - 52` | `x + 4` | | `x + w / 2 - 24`, the take-off of the ink arc |
| bramble | `x - 27` | `x - 5` | | `winStart + 10` |
| branch, beehive | `x - 34` | `x - 6` | | `winStart + 12` |
| arch | `x - 34` | `x - 6` | `x + w + 6` | `winStart + 12` |

A gap's `winStart` is also the earliest take-off that reaches the far edge (at most about 30 ms of margin), which is why the signpost stands at `postX` and not at `winStart`. A press up to 10 px either side of `postX` clears every hazard at every time scale (check `jump-geometry`). The simulation never reads `postX`.

`TG.Entities.nextAction(state)` returns the nearest thing Pip must jump or duck, or `null`:

```js
action = {
  id: 'h12',                // hazard id, or the attack entity's id
  source: 'hazard',         // 'hazard' | 'attack'
  kind: 'gap',
  action: 'jump',           // 'jump' | 'duck'
  hold: false,
  inWindow: true,           // pressing now clears it. Hazards: winStart <= player.x <= winEnd. Attacks: eta inside SHOCK_WIN or PICK_WIN
  winStart: 1660, winEnd: 1700, holdUntil: 0,   // hazards only; 0 for attacks
  eta: 0.4,                 // ws until the window opens (0 when open)
  prompt: false             // show the key prompt
};
```

Hazards that are bridged, passed, or not used on this difficulty are skipped. If a hazard and an attack are both pending, the one whose window opens first is returned.

### 5.9 Level data file and runtime level

`js/levels/level1.js` registers one object. Positions are in tiles; `TG.Level.build` converts to px.

```js
TG.Levels[1] = {
  id: 1,
  name: 'QUILL MEADOWS',
  tutorial: true,                       // optional. true: the level starts with tutorial threats and rule V6 applies
  tune: {},                             // optional. Overrides of the difficulty config for this level, see "The tune block" below
  theme: {
    id: 'meadow',
    backdrop: 'meadow',                 // key in TG.Backdrops
    wordFlavour: 'meadow',              // passed to TG.Words.createPicker as opts.flavour (section 4.6)
    music: { level: 'level1', boss: 'boss1' },   // track names from section 7.2; carried in the level:start payload
    tiles: {                            // sprite names
      top: 'tile_grass', fill: 'tile_soil',
      edgeL: 'tile_edge_l', edgeR: 'tile_edge_r', wallL: 'tile_wall_l', wallR: 'tile_wall_r',
      gapFill: 'tile_water', gapFillDark: 'tile_dark', plank: 'tile_plank',
      arenaTop: 'tile_arena', arenaFill: 'tile_soil', rail: 'tile_rail'
    },
    hazardSkins: { bramble: 'haz_bramble', branch: 'haz_branch', beehive: 'haz_beehive', arch: 'haz_arch' }
  },
  lengthTiles: 880,                     // where the boss arena starts
  sections: [
    { name: 'MORNING MEADOW', stage: '1-1', from: 0,   to: 256, palette: 'day',    gapFill: 'water',
      music: { transpose: 0, tempo: 150, keyOk: { root: 0, mode: 'major' } } },
    { name: 'ORCHARD BROOK',  stage: '1-2', from: 256, to: 544, palette: 'day',    gapFill: 'water',
      music: { transpose: 0, tempo: 150, keyOk: { root: 0, mode: 'major' } } },
    { name: 'SUNSET RIDGE',   stage: '1-3', from: 544, to: 880, palette: 'sunset', gapFill: 'dark',
      music: { transpose: 2, tempo: 158, keyOk: { root: 2, mode: 'major' } } }
  ],
  arena: { name: "THE BARON'S DIG", stage: '1-B', palette: 'dusk', arenaTilesFrom: 872,
           music: { transpose: 0, tempo: 168, keyOk: { root: 4, mode: 'minor' } } },
  // music.keyOk: the scale of the key_ok sound. root = semitones above C5 for the first letter; mode = 'major' | 'minor' pentatonic.
  checkpoints: [0, 256, 544, 880],      // tiles. The last one is the boss checkpoint
  gaps: [
    { x: 106, w: 1 },                   // w in tiles: 1 or 2
    { x: 330, w: 2, min: 'medium' }     // min: lowest difficulty that has this gap open; below it the gap is bridged from the start
    // ...
  ],
  hazards: [
    { x: 156, kind: 'branch' },
    { x: 486, kind: 'bramble', min: 'medium' },   // below min the hazard is absent
    { x: 828, kind: 'arch', w: 3 }
    // ...
  ],
  spawns: [
    { x: 22,  kind: 'boulder', min: 'easy', tutorial: true },
    { x: 162, kind: 'crate', power: 'shield', min: 'easy' },
    { x: 268, kind: 'swoop', min: 'easy', intro: true },
    { x: 118, kind: 'buzzle', min: 'medium' }
    // ... x is the trigger tile: the entry appears when Pip's centre reaches x * 16
  ],
  ink: [
    { x: 14, shape: 'row', n: 4, step: 2 },        // row on the ground, step in tiles
    { gap: 106, shape: 'arc' },                    // 5 drops over the gap at tile 106
    { hazard: 156, shape: 'under' }                // 3 drops under the hazard at tile 156 (5 for an arch)
  ],
  decor: [
    { x: 8, sprite: 'sign_type' }                  // drawn on the ground at tile x
  ],
  boss: { kind: 'baron', speech: 'MY MEADOW! MY WORDS!' }
};
```

The full list of gaps, hazards, spawns and ink drops is DESIGN 11.3 to 11.5 and Appendix B.

**The tune block.** `tune` holds overrides of the difficulty config (section 5.10) for this level. It is how a later level is made harder than the one before it, and it is where WP-E records tuning changes for Level 1 (section 12.1).

```js
tune: {
  all:    { lenShift: [1, 2, 3] },                  // applied on every difficulty
  easy:   { maxActive: [2, 2, 3, 2] },              // then the entry for the chosen difficulty
  medium: { react: 1.1, boss: { telegraph: 0.9 } }, // nested objects are merged key by key
  hard:   { }
}
```

Every key is optional. Only the keys in `TG.Difficulty.TUNABLE` may appear at the top level of `all`, `easy`, `medium` and `hard`. `TG.Game.newRun` applies the block with `TG.Difficulty.resolve` (section 4.5). Level 1 was delivered with an empty block; after a play review it has `medium: { react: 1.0, perChar: 0.45, boss: { health: 5, coreWords: [1, 2, 2] } }` and `hard: { react: 0.6, perChar: 0.27, boss: { health: 7, coreWords: [2, 2, 3] } }` (section 14.2).

Ink drop positions: a drop's `y` is its bottom. Row and under: `y = GROUND_Y - 4`. Arc: five drops at x offsets `-16, -8, 0, 8, 16` px from the gap's centre. The height above the ground of a drop at offset `d` is `min(36, max(0, 4 * JUMP_HEIGHT * s * (1 - s)))` with `s = (d + 24) / JUMP_DIST`, which is the arc of a jump that takes off 24 px before the gap's centre. The five heights are 22.2, 35.6, 36, 35.6 and 22.2 px, the same for both gap widths, and `y = GROUND_Y - height`.

`TG.Level.validate(data)` checks:

| Code | Rule |
|---|---|
| V1 | Sections are contiguous from 0 to `lengthTiles`; `checkpoints` are 0, each later section's `from`, and `lengthTiles` |
| V2 | Every gap has `w` of 1 or 2 and at least 4 tiles of ground before the next gap |
| V3 | A jump hazard and a duck hazard are at least 6 tiles apart, measured between left edges (gaps count as jump hazards) |
| V4 | No gap or hazard within `CHECKPOINT_CLEAR` tiles after a checkpoint, and none at or beyond `lengthTiles - 16` |
| V5 | Every spawn `kind` is a threat or crate kind in `TG.Entities.KINDS`; every crate has a valid `power`; every `min` is a difficulty name |
| V6 | Only when the level has `tutorial: true`: the first three threat spawns are tagged `easy` and `tutorial`. Without the flag, no spawn may be tagged `tutorial` |
| V7 | No threat spawn has `x` greater than `lengthTiles - 32` |
| V8 | Every `ink` entry refers to an existing gap or hazard, or is a row that does not overlap a gap |
| V9 | Every `arch` has `w: 3` (the sprite is 48 px wide). A level may have any number of arches, including none |
| V10 | If `tune` is present, its top-level keys are among `all`, `easy`, `medium`, `hard`, and the keys inside them are in `TG.Difficulty.TUNABLE` |
| V11 | `theme.music.level` and `theme.music.boss` are strings; every section and the arena have `music.transpose` and `music.tempo` as numbers |

Rules V1 to V11 apply to every level. None of them names a Level 1 value.

Runtime level (result of `TG.Level.build`):

```js
level = {
  id: 1, name: 'QUILL MEADOWS', theme: { /* as in the data */ },
  tutorial: true,
  lengthPx: 14080, arenaX: 14080, arenaTilesX: 13952,
  sections: [ { index: 0, name, stage, x0: 0, x1: 4096, palette, music, gapFill }, /* ... */ ],
  arena: { index: 3, name, stage, palette, music },
  checkpoints: [ { index: 0, x: 96, flagX: 0, raised: true }, { index: 1, x: 4096, flagX: 4096, raised: false }, /* ... */ ],
      // x: world px where Pip restarts. flagX: world px of the left edge of the flag pole
  hazards: [ /* hazard objects (5.8) for this difficulty, gaps included, sorted by x */ ],
  spawns: [ { x: 352, kind, power, tutorial, intro, done: false, waiting: false, retryT: 0 }, /* for this difficulty, sorted by x */ ],
  ink: [ { id: 'i0', x, y }, /* every drop position, sorted by x; id is 'i' + the index in this array */ ],
  decor: [ { x, y, sprite }, /* ... */ ],
  boss: { kind: 'baron', speech: '...' }
};
```

The `tune` block is not copied into the runtime level; it has already been applied to `state.config`.

Checkpoint 0 has `x = HERO_SCREEN_X` so that the camera starts at 0 and `flagX = 0`. Other checkpoints have `x = flagX = tile * 16`. Both fields are in world px; neither is a tile index.

Ground rule used by the renderer and by `isGround`: every column of the level is ground from `GROUND_Y` to the bottom of the screen, except the columns of a gap that is not bridged. Columns before 0 and after `arenaX` are ground.

### 5.10 Difficulty config entry

`TG.Difficulty.get('medium')` returns this object. Times marked nominal are converted with `TG.Difficulty.toWs` before use on the world clock.

The field names and the shape are binding. The numbers are starting values: WP0 implements them as written, and section 12.1 describes how they may be changed later through the level's `tune` block.

```js
{
  id: 'medium',
  label: 'MEDIUM',
  description: 'EVERYDAY WORDS',
  wpmGuide: '20-40',
  designWpm: 30,
  floorWpm: 20,

  pace: 1.0,                      // world seconds per real second at assist 1.0

  lives: 4,
  invuln: 2.5,                    // s, real
  checkpointLives: 2,             // lives are raised to at least this at a checkpoint; 0 = no top-up
  extraLifeFirst: 10000,
  extraLifeEvery: 20000,

  react: 1.2,                     // nominal s
  perChar: 0.5,                   // nominal s per letter
  letterStall: 0.12,              // nominal s
  impactGap: 1.5,                 // nominal s
  hazardMargin: 0.75,             // nominal s
  urgentTime: 1.2,                // s, real
  maxActive: [2, 2, 3, 3],        // threats at once in sections 0, 1, 2 and the boss arena (rocks use boss.inFlight as well)

  wordLen: {                      // [min, max] before the section shift
    boulder: [4, 6], dawdle: [5, 8], hoppet: [4, 6], buzzle: [4, 6],
    swoop: [5, 6], truffle: [4, 5], digby: [5, 6], crate: [5, 8], rock: [4, 5]
  },
  lenShift: [0, 1, 2],            // added to both ends in sections 0, 1, 2
  tierMix: [ { 1: 1 }, { 2: 0.7, 1: 0.3 }, { 3: 0.6, 2: 0.4 }, { 1: 0.6, 2: 0.4 } ],   // sections 0, 1, 2, boss arena

  autoReleaseMisses: 3,           // 0 = off
  streakPenaltySteps: 2,          // 5 = back to x1
  weakWeighting: true,
  adjacencyWeighting: true,

  keyGuide: false,
  hazardCue: true,
  keyPrompts: 0,                  // first N hazards of each action show the key
  bridgeAfterFalls: 2,            // 0 = never
  tutorialAlways: false,          // true: tutorial slow-down on every run

  shieldHits: 1,                  // charges per Bubble shield
  shieldKeyStreak: 50,            // correct keys in a row that give one shield charge (section 4.16)

  boss: {
    health: 6,
    coreWords: [2, 2, 2],         // weak-point words in phases 1, 2, 3; their sum is health
    rocks: [2, 3, 4],             // volley entries in phases 1, 2, 3 (a minion replaces the last rock)
    inFlight: 2,
    launchGap: [2.4, 2.2, 1.8],   // nominal s
    coreLen: [7, 9],
    exposeFactor: 1.5,
    exposeBonus: 2.0,             // nominal s
    telegraph: 1.0,               // nominal s
    doubleAttack: true,
    doubleGap: 1.2,               // nominal s
    minion: true,
    finisherLen: [10, 11],
    finisherBonus: 1000
  },

  bot: {                          // profiles used by test/sim.js
    floor:  { wpm: 20, accuracy: 0.92, react: 1.0 },
    target: { wpm: 30, accuracy: 0.95, react: 0.7 },
    fast:   { wpm: 60, accuracy: 0.98, react: 0.4 }
  }
}
```

Values for all three entries:

| Field | easy | medium | hard |
|---|---|---|---|
| `label` | `'EASY'` | `'MEDIUM'` | `'HARD'` |
| `description` | `'SHORT WORDS, HOME ROW FIRST'` | `'EVERYDAY WORDS'` | `'LONG AND UNUSUAL WORDS'` |
| `wpmGuide` | `'10-20'` | `'20-40'` | `'40+'` |
| `designWpm` / `floorWpm` | 15 / 10 | 30 / 20 | 50 / 35 |
| `pace` | 0.75 | 1.0 | 1.25 |
| `lives` | 5 | 4 | 3 |
| `invuln` | 3.0 | 2.5 | 2.0 |
| `checkpointLives` | 3 | 2 | 0 |
| `extraLifeFirst` / `extraLifeEvery` | 5000 / 10000 | 10000 / 20000 | 15000 / 30000 |
| `react` | 1.8 | 1.2 | 0.7 |
| `perChar` | 1.0 | 0.5 | 0.3 |
| `letterStall` | 0.20 | 0.12 | 0.06 |
| `impactGap` | 3.5 | 1.5 | 0.9 |
| `hazardMargin` | 1.2 | 0.75 | 0.5 |
| `urgentTime` | 1.5 | 1.2 | 0.9 |
| `maxActive` | `[1, 2, 2, 2]` | `[2, 2, 3, 3]` | `[2, 3, 4, 4]` |
| `wordLen.boulder` | `[2, 4]` | `[4, 6]` | `[5, 9]` |
| `wordLen.dawdle` | `[3, 5]` | `[5, 8]` | `[7, 10]` |
| `wordLen.hoppet` | `[2, 4]` | `[4, 6]` | `[5, 8]` |
| `wordLen.buzzle` | `[2, 4]` | `[4, 6]` | `[5, 8]` |
| `wordLen.swoop` | `[3, 4]` | `[5, 6]` | `[6, 9]` |
| `wordLen.truffle` | `[2, 3]` | `[4, 5]` | `[5, 7]` |
| `wordLen.digby` | `[3, 4]` | `[5, 6]` | `[6, 8]` |
| `wordLen.crate` | `[3, 5]` | `[5, 8]` | `[7, 10]` |
| `wordLen.rock` | `[2, 4]` | `[4, 5]` | `[5, 7]` |
| `lenShift` | `[0, 0, 1]` | `[0, 1, 2]` | `[0, 1, 2]` |
| `tierMix[0]` | `{1: 1}` | same | same |
| `tierMix[1]` | `{2: 0.7, 1: 0.3}` | same | same |
| `tierMix[2]` | `{3: 0.6, 2: 0.3, 1: 0.1}` | `{3: 0.6, 2: 0.4}` | `{3: 0.6, 2: 0.4}` |
| `tierMix[3]` | `{1: 0.6, 2: 0.4}` | same | same |
| `autoReleaseMisses` | 3 | 3 | 0 |
| `streakPenaltySteps` | 1 | 2 | 5 |
| `weakWeighting`, `adjacencyWeighting` | true | true | false |
| `keyGuide` | true | false | false |
| `hazardCue` | true | true | false |
| `keyPrompts` | 3 | 0 | 0 |
| `bridgeAfterFalls` | 1 | 2 | 0 |
| `tutorialAlways` | true | false | false |
| `shieldHits` | 2 | 1 | 1 |
| `shieldKeyStreak` | 30 | 50 | 75 |
| `boss.health` | 3 | 6 | 8 |
| `boss.coreWords` | `[1, 1, 1]` | `[2, 2, 2]` | `[2, 3, 3]` |
| `boss.rocks` | `[2, 2, 3]` | `[2, 3, 4]` | `[3, 4, 5]` |
| `boss.inFlight` | 1 | 2 | 3 |
| `boss.launchGap` | `[4.5, 4.2, 3.8]` | `[2.4, 2.2, 1.8]` | `[1.5, 1.3, 1.1]` |
| `boss.coreLen` | `[4, 6]` | `[7, 9]` | `[9, 12]` |
| `boss.exposeFactor` / `exposeBonus` | 1.5 / 2.0 | same | same |
| `boss.telegraph` | 1.4 | 1.0 | 0.7 |
| `boss.doubleAttack` / `doubleGap` | false / 0 | true / 1.2 | true / 0.9 |
| `boss.minion` | false | true | true |
| `boss.finisherLen` | `[6, 7]` | `[10, 11]` | `[13, 15]` |
| `boss.finisherBonus` | 500 | 1000 | 1500 |
| `bot.floor` | 10, 0.90, 1.5 | 20, 0.92, 1.0 | 35, 0.94, 0.6 |
| `bot.target` | 15, 0.95, 1.0 | 30, 0.95, 0.7 | 50, 0.95, 0.5 |
| `bot.fast` | 30, 0.98, 0.5 | 60, 0.98, 0.4 | 90, 0.98, 0.3 |

Bot profiles are written as `wpm, accuracy, react`. `bot.floor.wpm` equals `floorWpm` and `bot.target.wpm` equals `designWpm`; these two pairs must stay equal, because they are the speeds the difficulty select screen promises.

Tier 2 switches in this table: `weakWeighting`, `adjacencyWeighting`, `boss.doubleAttack`, `boss.minion` (section 12.2).

### 5.11 Typing statistics, summary and run result

`state.typing.stats`, maintained by `TG.Typing`:

```js
stats = {
  correct: 0,               // correct letter keys
  wrong: 0,                 // wrong letter keys
  wordsCleared: 0,          // words completed by typing
  wordsClean: 0,
  wordsMissed: 0,           // reported through TG.Typing.onMissed
  lettersInWords: 0,        // sum of (length - 1) over completed words
  wordTime: 0,              // s, sum of (tLastKey - tFirstKey) over completed words
  wpm: 0,                   // 12 * lettersInWords / wordTime; 0 when wordTime is 0
  liveWpm: null,            // same formula over the last LIVE_WPM_WORDS words; null until LIVE_WPM_MIN words
  peakWpm: 0,               // best value over any PEAK_WPM_WORDS consecutive words
  accuracy: 1,              // correct / (correct + wrong); 1 when both are 0
  keyStreak: 0, bestKeyStreak: 0,
  cleanRun: 0, bestCleanRun: 0,
  mult: 1,
  reactionSum: 0, reactionCount: 0,
  perKey: {                 // one entry per letter a..z
    a: { hits: 0, misses: 0, intervalSum: 0, intervalCount: 0 }
    // ...
  },
  recentWords: [],          // last LIVE_WPM_WORDS completed: { length, time, clean, at }
  section: { correct: 0, wrong: 0, lettersInWords: 0, wordTime: 0, words: 0 }
};
```

`TG.Typing.summary(ty)`:

```js
summary = {
  wpm: 28.4, peakWpm: 35.1, accuracy: 0.954,
  correct: 412, wrong: 20,
  wordsCleared: 61, wordsClean: 48, wordsMissed: 3,
  bestCleanRun: 14, bestKeyStreak: 96,
  avgReaction: 0.82,        // s; 0 when there are no samples. Tier 2: always 0 if left out
  practiseKeys: ['q', 'z'], // up to 3, highest miss rate first; miss rate = misses / (hits + misses); at least 2 misses each
  slowKeys: ['p', 'b']      // up to 3, highest mean interval first; at least 4 samples each. Tier 2: always [] if left out
};
```

The results screen leaves out the AVERAGE REACTION line when `avgReaction` is 0 and the SLOWEST KEYS line when `slowKeys` is empty.

`state.result`, built by `TG.Game` when the run finishes (`level:clear` or `endRun`):

```js
result = {
  cleared: true,            // false when the run was ended from game over
  levelId: 1, difficulty: 'medium',
  score: 48210,             // final, bonuses included
  baseScore: 41210,
  bonuses: [ { id: 'lives', label: 'LIVES X3', points: 3000 }, { id: 'accuracy', label: 'ACCURACY 95%', points: 3000 }, { id: 'nocontinue', label: 'NO CONTINUES', points: 2000 } ],
  time: 301.4,              // s, real
  typing: { /* summary, as above */ },
  ink: 131, livesLost: 2, lives: 3, continues: 0,
  rank: 'A',                // 'S' | 'A' | 'B' | 'C' (DESIGN 8.6)
  suggestion: null,         // 'READY FOR MEDIUM?' | 'READY FOR HARD?' | null. Tier 2: always null if left out
  bestWpm: 26.0,            // previous personal best for the difficulty, 0 if none
  assist: 1.0,              // assist value at the end of the run
  adaptive: true            // adaptive pacing was on for the run; TG.Save.recordRun stores assist only when this is not false
};
```

End-of-level bonuses are added only when `cleared` is true.

### 5.12 Save data and high score entry

Stored as JSON under `localStorage[TG.C.STORAGE_KEY]`.

```js
data = {
  version: 1,
  settings: {
    music: true,
    sfx: true,
    crt: 'auto',            // 'auto' | 'on' | 'off'. auto = on when the scale is 3 or more
    reduceFlash: false,
    keyGuide: 'auto',       // 'auto' | 'on' | 'off'. auto follows config.keyGuide
    adaptive: true,
    tutorialDone: false,    // set true the first time checkpoint 1 is reached
    lastDifficulty: 'medium',
    initials: 'PIP'
  },
  scores: { easy: [ /* SCORE_SLOTS entries */ ], medium: [ /* ... */ ], hard: [ /* ... */ ] },
  best:   { easy: { wpm: 0, score: 0 }, medium: { wpm: 0, score: 0 }, hard: { wpm: 0, score: 0 } },
  assist: { easy: 1, medium: 1, hard: 1 }
};

entry = {
  name: 'PIP',              // 3 characters, A-Z
  score: 48210,
  wpm: 28,                  // rounded
  accuracy: 95,             // whole percent
  rank: 'A',
  cleared: true,
  date: '2026-09-29'        // set by TG.UI; '' for seeded entries
};
```

Seeded entries (name, score, wpm, accuracy, rank), highest first:

| Difficulty | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| easy | PIP 16000 18 96 A | INK 12000 15 94 A | DOT 9000 13 92 B | TAB 6000 11 90 B | CAP 3000 9 88 B |
| medium | PIP 40000 34 96 A | INK 30000 30 94 A | DOT 22000 27 92 B | TAB 15000 24 90 B | CAP 8000 21 88 B |
| hard | PIP 70000 55 96 A | INK 52000 50 94 A | DOT 38000 46 92 B | TAB 26000 42 90 B | CAP 14000 38 88 B |

### 5.13 Word plate layout (`TG.Render.layoutLabels`)

```js
label = {
  id: 17,                   // typable id
  text: 'FROG',             // uppercase
  typed: 2,
  x: 300, y: 150,           // screen px, top-left of the plate
  w: 34, h: 10,             // 8 * length + 2, 10
  locked: true,
  dim: false,               // true for other plates while a lock is held
  urgent: false,
  friendly: false,          // true for crates (GRASS border)
  edge: null,               // null | 'left' | 'right' | 'top' | 'bottom': the plate is an edge tag
  tailX: 317, tailY: 164    // screen px where the 1 px tail ends (the top centre of the sprite); null for edge tags
};
```

Algorithm:

1. Take every typable entity (not boss words). Order: the locked one first, then by `eta` ascending, then `id`. The locked one is `state.typing.target`; `locked` is true for its plate, and `dim` is true for every other plate while `state.typing.target` is not `null`.
2. Wanted position: centred on the entity's screen x, bottom of the plate 4 px above the top of the sprite box.
3. If the sprite box is outside the playfield (the view in x, `PLAY_TOP` to `GROUND_Y` in y), the plate is an edge tag: pinned 2 px inside the edge named by where the entity is (`right`, `left`, `top`, `bottom`). For `left` and `right` the plate is at the y of the entity clamped to the playfield. For `top` and `bottom` it is centred on the x of the entity, clamped to the view; for `bottom` the edge is the ground line, and the plate's bottom is at `GROUND_Y - 12`, which is 4 px above the 8 px mound that marks the spot, so the plate does not cover the mound. The test is made in this order: below the ground line gives `bottom`, above `PLAY_TOP` gives `top`, then `left` or `right`. In Level 1, `bottom` is used by a Digby that is still underground, `top` by a Swoop that is entering and by a high rock, and `right` by a Boulder that is still beyond the edge. Creatures that wait at the screen edge (section 5.5) are on screen and have ordinary plates.
4. Clamp to `x` in `[2, 382 - w]` and `y` in `[PLAY_TOP, 174]`.
5. If the plate overlaps a plate already placed (with a 1 px margin), move it up 10 px and test again. If it would pass `PLAY_TOP`, place it 10 px below the lowest plate it overlapped and continue downwards.
6. Boss words are not in this list. `TG.Hud` draws them on the boss plate.

### 5.14 Ink drop items (`state.items`)

```js
item = {
  id: 'i12',                // unique in the level; the same id as in level.ink
  x: 1712, y: 148,          // world px: x = centre, y = bottom
  w: 8, h: 8
};
```

- `TG.Level.makeItems(level, fromX)` builds the items from `level.ink`. `newRun` fills `state.items` with `makeItems(level, 0)`; `TG.Level.resetFrom` replaces the items at or after the checkpoint.
- A drop is collected when its box (`x - 4` to `x + 4`, `y - 8` to `y`) overlaps `TG.Entities.playerBox(player)`. `TG.Entities.update` then adds `PTS_INK`, updates `state.ink` and `state.inkTotal`, emits `pickup:ink` and removes the item from `state.items`, all in the same step.
- There is no `collected` flag. Every element of `state.items` is an uncollected drop, and the renderer draws every element.
- Drops over a gap that is bridged stay where they are.

---

## 6. Sprite format and sprite registry

### 6.1 Format

```js
TG.Sprites.define('en_buzzle', {
  w: 16, h: 16,                 // frame size, px
  anchor: [8, 16],              // px from the frame's top-left to the point that is placed on the entity's x, y. May lie outside the frame
  fps: 16,                      // default animation rate; 0 for sprites that are not animated by time
  owner: 'C',                   // 'C' or 'D'
  names: ['fly0', 'fly1'],      // one name per frame, in order
  frames: [
    [                           // frame 0: h strings of w characters
      '................',
      '.....00..00.....',
      '....0440044i0...',
      // ... 16 rows in total
    ],
    [ /* frame 1 */ ]
  ]
});
```

- Each character is `.` (transparent) or a palette key from `TG.PAL_KEYS` (`0`-`9`, `a`-`v`).
- `TG.Sprites.check(def)` reports: missing fields; `frames.length` different from `names.length`; a frame with a row count other than `h`; a row with a length other than `w`; a character outside the allowed set; a frame that is entirely transparent.
- A frame may be given as `{ copy: 2, flipX: true }` to reuse another frame of the same sprite mirrored. `check` accepts this form.

### 6.2 Drawing conventions

- Enemy, projectile and boss sprites are drawn **facing left** (towards Pip). Pip faces right. The renderer sets `flipX` for anything that faces the other way (Truffle; a crow flying off).
- 1 px INK outline on every sprite except tiles and backdrop pieces.
- Colour counts: enemies 3 plus INK, Pip 5 plus INK, boss 6 plus INK (SOIL, CLAY, PINK, GOLD, WHITE, RED) and CREAM for the lamp glass on `boss_head`, items and effects at most 4 plus INK.
- Anchors by group:

| Group | Anchor | Placed at |
|---|---|---|
| Hero, enemies, projectiles, boss parts, items, crates, `pw_*` | Bottom centre `[w/2, h]` unless the registry says otherwise | Entity `x, y` |
| Tiles | Top left `[0, 0]` | Tile column and row |
| Hazards, signs, flag, decor, backdrop pieces | Bottom left `[0, h]` | Left edge and bottom |
| Effects `fx_*`, `ink_*` | Centre `[w/2, h/2]` unless the registry says otherwise | Effect position |
| Icons `icon_*`, `key_*`, `ui_*` | Top left `[0, 0]` | HUD coordinates |

### 6.3 Remaps

`TG.Remaps[name]` maps palette indices to palette indices. The key `'*'` applies to every opaque pixel not listed.

| Name | Owner | Use | Content |
|---|---|---|---|
| `white` | WP-C | Hit flash | `{ '*': 4 }` |
| `gold` | WP-C | Pip with the Golden quill | `{ 25: 18, 24: 16 }` (RED to GOLD, MAROON to BRONZE) |
| `dim` | WP-C | Unselected menu panels | Each colour to a darker neighbour: light colours to STONE, mid colours to SHADOW, dark colours to INK. WP-C writes the full table of 32 |
| `lampred` | WP-C | Baron's lamp from phase 2 | `{ 19: 25 }` (CREAM to RED). The lamp glass is the only CREAM on `boss_head`, in all four frames, and the brass helmet is GOLD, so the remap changes the lamp and nothing else |
| `sunset` | WP-D | Section 3 backdrop and tiles | SKY and HAZE to ORANGE and CORAL; ROYAL to VIOLET; FOREST and PINE to PLUM-leaning greens. WP-D writes the table |
| `dusk` | WP-D | Boss arena backdrop and tiles | Blues to DEEP_BLUE, greens to PINE and DEEP_TEAL, hills to PLUM and INK. WP-D writes the table |

### 6.4 Sprite registry

Every sprite the renderer, HUD and UI ask for is listed here. `TG.Sprites.MANIFEST` in `core.js` is a transcription of these tables (name, w, h, frames, anchor, owner). Frame names are in order from frame 0.

**WP-C: `js/sprites-chars.js`**

| Name | Size | Frames | Frame names | fps | Anchor | Used for |
|---|---|---|---|---|---|---|
| `hero_run` | 16x24 | 6 | r0 r1 r2 r3 r4 r5 | 12 | 8,24 | Pip running |
| `hero_jump` | 16x24 | 3 | rise apex fall | 0 | 8,24 | Chosen by arc position: s < 0.35 rise, s < 0.65 apex, else fall; `fall` while falling |
| `hero_slide` | 24x16 | 2 | s0 s1 | 10 | 12,16 | Sliding |
| `hero_cast` | 16x12 | 1 | cast | 0 | 8,24 | Upper-body overlay on the run frame after a correct key |
| `hero_hurt` | 16x24 | 1 | hurt | 0 | 8,24 | While `player.hurtT > 0` |
| `hero_idle` | 16x24 | 2 | i0 i1 | 2 | 8,24 | Menus |
| `hero_win` | 16x24 | 2 | w0 w1 | 5 | 8,24 | Level complete |
| `hero_sit` | 16x24 | 2 | sit0 sit1 | 3 | 8,24 | Game over |
| `ink_bolt` | 8x8 | 2 | b0 b1 | 20 | 4,4 | Bolt from the quill to a cleared target |
| `ink_spark` | 8x8 | 2 | k0 k1 | 20 | 4,4 | Spark at the quill tip |
| `en_boulder` | 24x32 | 4 | whole crack1 crack2 crack3 | 0 | 12,32 | Frame = `ceil(3 * typed / length)` |
| `en_dawdle` | 16x16 | 3 | crawl0 crawl1 shell | 4 | 8,16 | Crawl: frames 0, 1. `shell` in the clear animation |
| `en_hoppet` | 16x16 | 3 | sit leap puff | 0 | 8,16 | `sit` on the ground, `leap` in the air, `puff` in the clear animation |
| `en_buzzle` | 16x16 | 2 | fly0 fly1 | 16 | 8,16 | |
| `en_swoop` | 24x16 | 3 | flap0 flap1 dive | 8 | 12,16 | Flap: frames 0, 1. `dive` while `phase` is `dive` |
| `en_truffle` | 24x16 | 4 | run0 run1 run2 run3 | 12 | 12,16 | Drawn with `flipX` while charging |
| `en_digby` | 16x16 | 3 | peek up spin | 0 | 8,16 | `peek` for the first 0.05 of `t` after `DIGBY_POP_T`, then `up`; `spin` in the clear animation. Drawn at the entity's `elev`, clipped at the ground line while it rises |
| `en_mound` | 16x8 | 2 | m0 m1 | 6 | 8,8 | The mound that marks where a Digby is underground. Drawn on the ground at the entity's x |
| `boss_body` | 48x32 | 2 | b0 b1 | 4 | 24,32 | |
| `boss_head` | 32x24 | 4 | normal laugh hurt dizzy | 0 | 16,24 | Helmet GOLD, lamp glass CREAM (see `lampred`, section 6.3) |
| `boss_arm` | 16x16 | 3 | rest raise throw | 0 | 8,8 | Left arm as drawn; right arm with `flipX` |
| `boss_mound` | 48x16 | 1 | mound | 0 | 24,16 | Drawn in front of the body |
| `boss_monocle` | 8x8 | 1 | monocle | 0 | 4,4 | Pops off on a hit (effect) |
| `boss_helmet` | 16x8 | 1 | helmet | 0 | 8,4 | Flies off on defeat (effect) |
| `pr_rock` | 12x12 | 2 | k0 k1 | 10 | 6,12 | |
| `pr_pickaxe` | 16x16 | 4 | p0 p1 p2 p3 | 12 | 8,16 | Four rotation steps |
| `pr_shock` | 16x8 | 2 | s0 s1 | 10 | 8,8 | |

Boss composition, drawn in this order, with `bx = boss.x`, `by = boss.y`, `r = boss.rise`:

| Part | Position | Frame |
|---|---|---|
| `boss_body` | `bx, by - 8 + r` | `b0`, `b1` at 4 fps |
| `boss_arm` (far) | `bx + 20, by - 26 + r`, `flipX` | `rest` unless pose is `raise` or `throw` |
| `boss_head` | `bx - 2, by - 34 + r` | pose `laugh`: laugh; `hurt`: hurt; `dizzy`: dizzy; others: normal. Remap `lampred` when `boss.lampRed`; remap `white` while `flashT > 0` |
| `boss_arm` (near) | `bx - 20, by - 26 + r` | `raise` for pose `raise` and `stomp`; `throw` for pose `throw`; otherwise `rest` |
| `boss_mound` | `bx, by` | |

Parts are clipped at `by` so nothing shows below the ground line while the body is lowered.

**WP-D: `js/sprites-world.js`**

Tiles (16x16, anchor 0,0):

| Name | Frames | Frame names | fps | Used for |
|---|---|---|---|---|
| `tile_grass` | 2 | g0 g1 | 0 | Ground surface row. Variant = tile column mod 2 |
| `tile_soil` | 2 | s0 s1 | 0 | Row below the surface. Variant = (column + 1) mod 2 |
| `tile_edge_l` | 1 | edge | 0 | Surface tile immediately left of a gap |
| `tile_edge_r` | 1 | edge | 0 | Surface tile immediately right of a gap |
| `tile_wall_l` | 1 | wall | 0 | Below `tile_edge_l` |
| `tile_wall_r` | 1 | wall | 0 | Below `tile_edge_r` |
| `tile_water` | 2 | w0 w1 | 3 | Lower row of a gap in sections with `gapFill: 'water'` |
| `tile_dark` | 1 | dark | 0 | Lower row of a gap with `gapFill: 'dark'` |
| `tile_plank` | 1 | plank | 0 | Surface row of a bridged gap |
| `tile_arena` | 2 | a0 a1 | 0 | Surface row from `arenaTilesX` on |
| `tile_rail` | 1 | rail | 0 | Drawn over `tile_arena` on every column, 4 px high strip at the top of the tile |

Hazards, signs and flag (anchor bottom left):

| Name | Size | Frames | Frame names | fps | Anchor | Used for |
|---|---|---|---|---|---|---|
| `haz_bramble` | 16x16 | 1 | bramble | 0 | 0,16 | Bottom at `GROUND_Y`. Thorns fill the lower 8 px |
| `haz_branch` | 16x16 | 1 | branch | 0 | 0,16 | Bottom at `GROUND_Y - HANG_CLEAR` |
| `haz_trunk` | 16x16 | 1 | trunk | 0 | 0,16 | Tiled upwards from the branch or arch to `PLAY_TOP`, where `haz_canopy` covers its top |
| `haz_beehive` | 16x24 | 1 | hive | 0 | 0,24 | Bottom at `GROUND_Y - HANG_CLEAR`. The renderer swings it up to 6 px sideways |
| `haz_rope` | 16x16 | 1 | rope | 0 | 0,16 | Tiled upwards from the beehive to `PLAY_TOP` |
| `haz_arch` | 48x16 | 1 | arch | 0 | 0,16 | Bottom at `GROUND_Y - HANG_CLEAR`; `haz_trunk` is tiled above its first and last 16 px |
| `haz_canopy` | 48x16 | 1 | canopy | 0 | 0,16 | Tree crown where the trunk of a branch (centred on it) or of the arch (centred on the arch) ends: bottom at y 36, so its top rows run under the HUD. FOREST and PINE, with the section's remap |
| `sign_jump` | 16x16 | 1 | sign | 0 | 8,16 | Post with an up arrow, centred on the hazard's `postX` (5.8) |
| `sign_duck` | 16x16 | 1 | sign | 0 | 8,16 | Post with a down arrow, centred on the hazard's `postX` (5.8) |
| `sign_type` | 48x32 | 1 | sign | 0 | 0,32 | "TYPE!" board at the start |
| `flag_pole` | 16x32 | 5 | down rise0 rise1 wave0 wave1 | 4 | 0,32 | `down` until raised; `rise0`, `rise1` over 0.3 s; then `wave0`, `wave1` |

Items and crates:

| Name | Size | Frames | Frame names | fps | Anchor | Used for |
|---|---|---|---|---|---|---|
| `item_ink` | 8x8 | 4 | d0 d1 d2 d3 | 8 | 4,8 | Ink drop |
| `crate_balloon` | 16x32 | 2 | c0 c1 | 3 | 8,32 | Balloon (upper 16 px) and crate (lower 16 px) |
| `crate_box` | 16x16 | 1 | box | 0 | 8,16 | The crate falling after the balloon pops (effect) |
| `pw_shield` | 16x16 | 2 | p0 p1 | 4 | 8,16 | Power-up icon, 12x12 art centred in the cell. Drawn over the crate's box and in the HUD slot |
| `pw_hourglass` | 16x16 | 2 | p0 p1 | 4 | 8,16 | |
| `pw_quill` | 16x16 | 2 | p0 p1 | 4 | 8,16 | |
| `pw_blast` | 16x16 | 2 | p0 p1 | 4 | 8,16 | |
| `pw_cap` | 16x16 | 2 | p0 p1 | 4 | 8,16 | |

Effects:

| Name | Size | Frames | Frame names | fps | Anchor | Used for |
|---|---|---|---|---|---|---|
| `fx_shield` | 24x32 | 4 | s0 s1 s2 s3 | 8 | 12,30 | Ring around Pip, drawn on alternate frames |
| `fx_bubble` | 24x32 | 2 | b0 b1 | 4 | 12,30 | Rescue bubble |
| `fx_bracket` | 8x8 | 4 | tl0 tl1 bl0 bl1 | 4 | 0,0 | Lock bracket. `tl0`, `tl1`: top-left corner; `bl0`, `bl1`: bottom-left corner. The two right-hand corners are the same frames drawn with `flipX`. The animation alternates the 0 and 1 frames at 4 fps |
| `fx_marker` | 16x4 | 2 | m0 m1 | 6 | 8,4 | Ground marker under a dive or a high rock |
| `fx_chunk` | 8x8 | 2 | c0 c1 | 0 | 4,4 | Boulder chunks |
| `fx_splinter` | 8x8 | 2 | c0 c1 | 0 | 4,4 | Crate pieces |
| `fx_feather` | 8x8 | 2 | f0 f1 | 6 | 4,4 | Swoop |
| `fx_star` | 8x8 | 2 | s0 s1 | 8 | 4,4 | Dawdle, rock, dizzy boss |
| `fx_flower` | 8x8 | 2 | f0 f1 | 4 | 4,4 | Buzzle |
| `fx_lilypad` | 16x8 | 1 | pad | 0 | 8,4 | Hoppet |
| `fx_daisy` | 8x8 | 3 | d0 d1 d2 | 0 | 4,8 | Digby; grows through its frames |
| `fx_helmet` | 8x8 | 1 | helmet | 0 | 4,4 | Digby |
| `fx_dust` | 8x8 | 3 | d0 d1 d2 | 12 | 4,8 | Truffle, landing, boss stomp |
| `fx_poof` | 16x16 | 3 | p0 p1 p2 | 12 | 8,8 | Balloon pop, generic puff |

Icons and interface pieces (anchor 0,0):

| Name | Size | Frames | Frame names | Used for |
|---|---|---|---|---|
| `icon_pip` | 8x8 | 1 | pip | Lives in the HUD |
| `icon_shield` | 8x8 | 1 | shield | Shield charges in the HUD |
| `icon_ink` | 8x8 | 1 | ink | Ink counter in the HUD |
| `icon_crown` | 8x8 | 1 | crown | Boss end of the progress strip |
| `ui_slot` | 16x16 | 1 | slot | Power slot frame |
| `key_cap` | 16x16 | 2 | up down | Blank keycap, normal and pressed; the legend is drawn with `TG.Font` |
| `key_wide` | 32x16 | 2 | up down | Blank wide keycap for SPACE, ENTER and BACKSPACE |

Backdrop pieces (anchor bottom left):

| Name | Size | Frames | Frame names | fps | Used for |
|---|---|---|---|---|---|
| `bg_cloud_s` | 32x16 | 1 | cloud | 0 | L1 |
| `bg_cloud_m` | 48x16 | 1 | cloud | 0 | L1 |
| `bg_cloud_l` | 64x24 | 1 | cloud | 0 | L1 |
| `bg_hill_far` | 128x48 | 1 | hill | 0 | L2, tiles horizontally |
| `bg_hill_mid` | 128x56 | 1 | hill | 0 | L3, tiles horizontally |
| `bg_tree` | 16x32 | 1 | tree | 0 | L3 |
| `bg_windmill` | 32x48 | 1 | mill | 0 | L3 |
| `bg_sails` | 32x32 | 4 | s0 s1 s2 s3 | 4 | L3, drawn over the windmill. Anchor 16,16 |
| `bg_bush` | 32x16 | 1 | bush | 0 | L4 |
| `bg_fence` | 32x16 | 1 | fence | 0 | L4 |
| `bg_appletree` | 32x48 | 1 | tree | 0 | L4, section 2 |
| `bg_molehill` | 16x8 | 1 | hill | 0 | L4, section 3 and the arena |
| `bg_moon` | 32x32 | 1 | moon | 0 | Arena sky |
| `bg_star` | 8x8 | 2 | s0 s1 | 2 | Arena sky |
| `fg_tuft` | 16x8 | 2 | t0 t1 | 0 | L6 |

### 6.5 Backdrops

`js/sprites-world.js` registers the composition of the parallax layers.

```js
TG.Backdrops.meadow = {
  palettes: {
    day:    { sky: [ { y: 0, h: 136, color: 7 }, { y: 136, h: 48, color: 7, dither: 8 } ], remap: null,     slowSky: 6 },
    sunset: { sky: [ { y: 0, h: 64, color: 28 }, { y: 64, h: 56, color: 26 }, { y: 120, h: 64, color: 17 } ], remap: 'sunset', slowSky: 28 },
    dusk:   { sky: [ { y: 0, h: 184, color: 5 } ], remap: 'dusk', slowSky: 5,
              stars: [ { x: 30, y: 40 }, { x: 110, y: 64 } /* ... */ ], moon: { x: 300, y: 72 } }
  },
  layers: [
    { id: 'clouds', factor: 0.1, drift: 2, repeat: 512, items: [ { sprite: 'bg_cloud_s', x: 40, y: 52 } /* ... */ ] },
    { id: 'far',    factor: 0.2, drift: 0, repeat: 128, items: [ { sprite: 'bg_hill_far', x: 0, y: 168 } ] },
    { id: 'mid',    factor: 0.4, drift: 0, repeat: 384, items: [ /* hills, trees, windmill, sails */ ] },
    { id: 'near',   factor: 0.7, drift: 0, repeat: 384, items: [ { sprite: 'bg_appletree', x: 120, y: 184, sections: [1] } /* ... */ ] },
    { id: 'fg',     factor: 1.3, drift: 0, repeat: 256, front: true, items: [ { sprite: 'fg_tuft', x: 16, y: 216 } /* ... */ ] }
  ]
};
```

- `sky` is a list of horizontal bands in screen px. `dither` adds a checkerboard of that colour over the band. While the Hourglass is active the first band's colour is replaced by `slowSky`.
- A layer is drawn at screen x `item.x - floor(camX * factor + time * drift)`, repeated every `repeat` px so that it covers the view. `item.y` is the bottom of the sprite in screen px.
- `sections` on an item limits it to those section indices (3 = arena). Items without it appear everywhere.
- `remap` is applied to every backdrop piece and tile.
- Layers with `front: true` are drawn after the entities (L6).

### 6.6 What the renderer draws for each entity

| Entity | Sprite | Frame | Notes |
|---|---|---|---|
| Pip, `run` | `hero_run` | `floor(animT * 12) % 6` | `hero_cast` on top while `TG.Effects.casting()` |
| Pip, `jump` | `hero_jump` | by arc position | |
| Pip, `fall` | `hero_jump` | `fall` | |
| Pip, `slide` | `hero_slide` | `floor(animT * 10) % 2` | |
| Pip, `rescue` and while the screen is `lifeLost` after a fall | `hero_idle` inside `fx_bubble` | | |
| Pip, `hurtT > 0` | `hero_hurt` | | |
| Pip, screen `levelComplete` | `hero_win` | `floor(state.screenT * 5) % 2` | Replaces the rows above on this screen |
| Pip, screen `gameOver` | `hero_sit` | `sit0` for the first 0.33 s of the screen, then `sit1` | Drawn by `TG.Render` with the world. `TG.UI` draws its dither and text over the world. Replaces the rows above on this screen |
| Pip, invulnerable | as above | | Drawn only on frames where `floor(state.frame / 3) % 2 == 0`. Not applied on `levelComplete` and `gameOver` |
| Pip, Golden quill active | as above | | Remap `gold` |
| ink drop (each element of `state.items`) | `item_ink` | `floor(state.time * 8) % 4` | |
| boulder | `en_boulder` | `ceil(3 * typed / length)` | |
| dawdle | `en_dawdle` | `floor(animT * 4) % 2` | The same frames while `phase` is `hold` |
| hoppet | `en_hoppet` | `elev > 0 ? leap : sit` | `sit` while `phase` is `hold` |
| buzzle | `en_buzzle` | `floor(animT * 16) % 2` | |
| swoop | `en_swoop` | `dive` when `phase == 'dive'`, else `floor(animT * 8) % 2` | `fx_marker` on the ground at Pip's x during the dive |
| truffle | `en_truffle` | `floor(animT * 12) % 4` | `flipX` |
| digby, `phase == 'mound'` | `en_mound` at `(entity.x, GROUND_Y)` | `floor(animT * (6 + 10 * t)) % 2` | The mole itself is underground and is not drawn. The mound shakes faster as `t` grows |
| digby, `phase == 'up'` | `en_digby` at `(entity.x, GROUND_Y - elev)`, then `en_mound` at `(entity.x, GROUND_Y)` in front of it | mole `peek` then `up`; mound `m0` | `elev` is negative while the mole rises. The mole is clipped at `GROUND_Y` so nothing shows below the ground line. The mound is drawn after the mole, as `boss_mound` is for the Baron |
| rock | `pr_rock` | `floor(animT * 10) % 2` | `fx_marker` at Pip's x for a rock with `from == 'above'` |
| crate | `crate_balloon`, then `pw_<power>` over the lower 16 px | `floor(animT * 3) % 2` | |
| shock | `pr_shock` | `floor(animT * 10) % 2` | |
| pick | `pr_pickaxe` | `floor(animT * 12) % 4` | |
| Any threat on the frame after a correct key | same | | Remap `white` for 2 frames (from `TG.Effects`) |

---

## 7. Sound effect and music registries

Recipes are in DESIGN 15.2 and 15.3. `TG.Audio` plays everything in response to events; other modules do not call `TG.Audio.sfx` for the sounds listed here.

### 7.1 Sound effects

| Name | Plays on |
|---|---|
| `key_ok` | `type:hit` with `index > 0` and `complete == false`. Pitch step = `index` |
| `key_bad` | `type:miss`; a second `type:miss` within 20 ms plays nothing (the key that triggers auto-release emits two) |
| `lock_on` | `target:lock` |
| `lock_release` | `target:release` with reason `backspace` or `auto` |
| `word_clear` | `word:clear` with cause `typed`; also `type:hit` with `complete == true` and kind `core` or `finisher` (boss words, for which no `word:clear` is emitted) |
| `clear_pop` | `word:clear` with family `pop`, except kind `rock` |
| `clear_twang` | `word:clear` with family `twang` |
| `clear_bonk` | `word:clear` with family `bonk` |
| `clear_crunch` | `word:clear` with family `crunch` |
| `deflect` | `word:clear` with kind `rock` |
| `crate_break` | `word:clear` with type `crate`, 0.3 s later |
| `streak` | `streak:change` with `mult > previousMult`; `streak:milestone` |
| `jump` | `hero:jump` |
| `land` | `hero:land` |
| `slide` | `hero:duck` |
| `cue_jump` | `hazard:cue` with action `jump` and `sound == true` |
| `cue_duck` | `hazard:cue` with action `duck` and `sound == true` |
| `ink_drop` | `pickup:ink`, with `step` 0 to 4: one step higher for each drop less than 0.35 s after the previous one |
| `power_get` | `pickup:power` for `hourglass` and `quill`, 0.48 s later (after `crate_break`) |
| `shield_up` | `shield:gain`; with cause `crate`, 0.48 s later |
| `shield_break` | `shield:break` |
| `slow_on` | `power:start` with power `hourglass` |
| `slow_off` | `power:end` with power `hourglass` |
| `ink_blast` | `pickup:power` with power `blast` |
| `one_up` | `life:gain`; with cause `cap`, 0.48 s later |
| `hurt` | `life:lost` with `cause.type` other than `fall` |
| `fall` | `hero:fall` |
| `rescue` | `hero:rescue` |
| `checkpoint` | `checkpoint` with `index > 0` |
| `warn` | `threat:warn`. Pan and pitch by `from` |
| `urgent_tick` | Four times a second while any entity in `TG.Game.state.entities` has `urgent === true` and `dead !== true`, and the screen is `playing` or `boss`. Checked in `TG.Audio.update`, with a guard for a missing `TG.Game` or state. `TG.Audio` keeps no list of ids, so nothing can be left over after a continue |
| `boss_rumble` | `boss:warning` and `boss:enter` |
| `boss_laugh` | `boss:weakopen`; `boss:weakclose` with `completed == false` |
| `boss_telegraph` | `boss:attack` with kind `shock` or `pick`, for `telegraph` seconds |
| `boss_throw` | `boss:throw` |
| `boss_stomp` | `attack:spawn` with kind `shock` |
| `boss_weak` | `boss:weakopen`, 0.3 s after `boss_laugh` starts |
| `boss_hit` | `boss:hit` |
| `boss_stun` | `boss:finisher` |
| `boss_defeat` | `boss:defeat` |
| `ui_move` | `ui:move` |
| `ui_select` | `ui:select` |
| `ui_back` | `ui:back` |
| `pause` | `screen:change` to or from `paused` |
| `tally_tick` | `ui:tally` |
| `stamp` | `ui:stamp` |
| `count_tick` | `ui:count`. Higher pitch when `high == true` |
| `start` | `level:start` with `continued == false` |

### 7.2 Music tracks and jingles

| Name | Kind | Plays on |
|---|---|---|
| `title` | Loop | Screens `title`, `difficultySelect`, `howToPlay` |
| `level1` | Loop | The level track of Level 1. On screen `playing`, `TG.Audio` plays the track named by `music.level` in the latest `level:start` payload. `transpose` and `tempo` come from the latest `section:enter` |
| `boss1` | Loop | The boss track of Level 1. On screen `boss`, `TG.Audio` plays the track named by `music.boss` in the latest `level:start` payload, with `transpose` and `tempo` from `section:enter` with index 3 (168 for Level 1). From `boss:phase` with phase 3 the tempo is 184 and pulse 2 is up an octave |
| `victory` | Once | Screen `levelComplete`, started by `boss:defeat` after `boss_defeat` finishes |
| `results` | Loop | Screens `results` and `highScoreEntry` |
| `gameover` | Once | Screen `gameOver` |
| `jingle_ready` | Jingle | `level:start`, whatever the value of `continued`. Not on `game:continue`, which is always followed by `level:start` |
| `jingle_checkpoint` | Jingle | `checkpoint` with `index > 0` |

`TG.Audio` never chooses a level or boss track by its own name. If a payload names a track that is not in `TG.Audio.TRACKS`, it warns once and plays nothing.

Order of events at the start of a run: `screen:change` to `playing` arrives before `level:start` (section 4.16). `TG.Audio` therefore starts the level track on `level:start` when the screen is already `playing`, and on `screen:change` to `playing` when the track is not already playing (return from `paused` restarts the sequencer instead, section 7.3). `jingle_ready` plays over the start of the track.

### 7.3 Other audio behaviour driven by events

| Event | Behaviour |
|---|---|
| `screen:change` to `boot` | Silence |
| `screen:change` to `paused` | Stops the sequencer at its current position. Sound effects for the pause menu still play. This does not call `suspend()` |
| `screen:change` from `paused` | Restarts the sequencer from that position. This does not call `resume()`. To `results` (QUIT), a jingle that was paused part-way is stopped and the loop is no longer ducked, so it does not finish over the results music |
| `screen:change` to `bossIntro` | Stop the level track; `setBassOnly(false)` |
| `screen:change` to `lifeLost`, `playing` from `lifeLost` | No change to music |
| `level:start` (any `continued`) | `setTempoScale(1)`, `setBassOnly(false)`, remember `music.level` and `music.boss` from the payload, then `jingle_ready`. This resets whatever was active when the last run or life ended |
| `power:start` / `power:end` with `hourglass` | `setTempoScale(0.75)` / `setTempoScale(1)` |
| `boss:warning` | `setBassOnly(true)` until `bossIntro` |
| `section:enter` | `transpose` and `tempo` of the current track from `music.transpose` and `music.tempo`. Scale of `key_ok` from `music.keyOk`: `root` semitones above C5, `mode` major or minor pentatonic. If `music.keyOk` is missing: root 0, major. (Following the music key is Tier 2; if it is left out, `key_ok` is always C major pentatonic.) In a major mode, `word_clear`, `streak`, `checkpoint`, `one_up` and `ink_drop` also move up by `root` semitones (down an octave from there for a root above 2) |

For Level 1 the level data gives C major pentatonic in sections 0 and 1, D major pentatonic in section 2 and E minor pentatonic in the arena (section 5.9).

`suspend()` and `resume()` are called only by `TG.Main`, on loss and return of focus (section 4.21).

---

## 8. Event registry

Every event has a payload object. `target` and `entity` are references to live simulation objects: listeners may read them during the call and must copy anything they keep. Positions are world px unless stated.

Listeners: A = `TG.Audio`, E = `TG.Effects`, H = `TG.Hud`, U = `TG.UI`. Any module may listen to any event; the table lists the listeners that are required.

### 8.1 Typing (emitted by `TG.Typing`)

| Event | Payload | Listeners |
|---|---|---|
| `type:hit` | `{ target, id, kind, ch, index, length, complete, x, y }` | A E H |
| `type:miss` | `{ target, id, ch, expected, repeat, x, y }`. `target` and `id` are `null` when nothing was locked. `repeat` = wrong keys in a row on this letter | A E H |
| `target:lock` | `{ target, id, kind, x, y }` | A E |
| `target:release` | `{ target, id, reason }`. reason: `backspace`, `auto`, `gone`, `screen` | A E |
| `streak:change` | `{ cleanRun, mult, previousMult }` | A H |
| `streak:milestone` | `{ kind: 'keys', value }`. value: 25, 50 or 100 | A H |

### 8.2 Game and scoring (emitted by the simulation, WP-E; mainly `TG.Game`)

| Event | Payload | Listeners |
|---|---|---|
| `screen:change` | `{ from, to, data }` | A E H U |
| `level:start` | `{ levelId, difficulty, name, continued, music }`. `music` is `level.theme.music`: `{ level, boss }`, two track names. Emitted by `newRun` and by `continueRun` | A E H |
| `word:clear` | `{ id, type, kind, family, from, word, x, y, w, h, score, mult, clean, quick, close, cause, power }`. cause: `typed` or `blast`. `power` is set for crates. Emitted for threats and crates only, so `type`, `kind` and `family` always come from `TG.Entities.KINDS`. Not emitted for boss words (section 4.16) | A E H |
| `score:add` | `{ points, total, reason, x, y }`. `x`, `y` are `null` for bonuses | E H |
| `life:gain` | `{ lives, cause }`. cause: `score`, `ink`, `cap` | A E H |
| `life:lost` | `{ lives, cause }`. `cause` as passed to `TG.Entities.damage` | A E H |
| `shield:gain` | `{ charges, cause }`. cause: `crate`, `streak` | A E |
| `shield:break` | `{ charges, x, y }` | A E |
| `pickup:power` | `{ power, x, y }` | A E H |
| `power:start` | `{ power, duration }`. power: `hourglass`, `quill` | A E H |
| `power:end` | `{ power }` | A E H |
| `tutor:prompt` | `{ id, word }` | H |
| `tutor:end` | `{ id }` | H |
| `assist:change` | `{ assist, target }`. Emitted when the target changes | H (debug only) |
| `game:over` | `{ checkpoint, score }` | A E |
| `game:continue` | `{ checkpoint, continues, assist }` | A E H |
| `level:clear` | `{ result }` | A U |
| `run:end` | `{ result }`. Emitted by `endRun` | U |

### 8.3 Hero, threats and hazards (emitted by the simulation, WP-E; mainly `TG.Entities`)

| Event | Payload | Listeners |
|---|---|---|
| `hero:jump` | `{ x, y }` | A E |
| `hero:land` | `{ x, y }` | A E |
| `hero:duck` | `{ x, y }` | A E |
| `hero:hurt` | `{ x, y, cause }` | E |
| `hero:fall` | `{ x, gapId }` | A E |
| `hero:rescue` | `{ x, y }` | A E |
| `pickup:ink` | `{ x, y, ink, inkTotal }` | A E |
| `threat:spawn` | `{ entity, id, type, kind, from, word }`. Emitted for every threat and crate, rocks and minions included. type: `threat` or `crate` | E |
| `threat:warn` | `{ id, kind, from }`. Emitted at spawn, after `threat:spawn`, when `from` is `behind`, `above` or `below`, or when the sprite starts outside the playfield (a boulder). Not emitted for crates | A H |
| `threat:enter` | `{ id, kind, from }`. The sprite first intersects the playfield. Not emitted for a threat that is on screen from its spawn | E |
| `threat:urgent` | `{ id, kind }`. Once per threat | none required. The plate border and `urgent_tick` follow `entity.urgent` in the state |
| `threat:hit` | `{ id, kind, word, typed, x, y }`. Contact that cost a life or a shield charge. Emitted by `TG.Entities.remove` | E |
| `threat:bounce` | `{ id, kind, x, y }`. Contact while invulnerable. Emitted by `TG.Entities.remove` | E |
| `threat:escape` | `{ id, kind, type, reason }`. reason: `flee` (continue, arena start, finisher) or `drift` (crate left the screen). Emitted by `TG.Entities.remove` | E |
| `hazard:hit` | `{ id, kind, x, y }` | E |
| `attack:spawn` | `{ id, kind, action }` | A E |

### 8.4 Level (emitted by `TG.Level`; `section:enter` also by `TG.Game`)

| Event | Payload | Listeners |
|---|---|---|
| `section:enter` | `{ index, name, stage, palette, music }`. index 3 is the arena. `music` is the section's or the arena's `music` object from the level data: `{ transpose, tempo, keyOk }`. Emitted when Pip crosses into a section, and by `TG.Game` directly after `level:start` at the start of a run and after a continue | A H |
| `checkpoint` | `{ index, x, wpm, accuracy, bonus, lives }` | A E H U |
| `hazard:cue` | `{ id, kind, action, hold, sound, prompt }` | A H |
| `hazard:bridge` | `{ id, x, w }` | E |
| `boss:warning` | `{}`. Pip reached tile `lengthTiles - 12` | A H |
| `boss:enter` | `{}`. Pip reached the arena | A E H |

### 8.5 Boss (emitted by `TG.Boss`)

| Event | Payload | Listeners |
|---|---|---|
| `boss:state` | `{ state, phase, round }` | E |
| `boss:attack` | `{ kind, telegraph }`. kind: `rock`, `rockhigh`, `minion`, `shock`, `pick`. `telegraph` in real seconds at the current time scale (0 for rocks and minions) | A E |
| `boss:throw` | `{ kind, x, y }`. kind: `rock`, `rockhigh`, `minion`, `pick`. Emitted for every volley launch and when a pickaxe is spawned. `x`, `y`: the Baron's raised arm | A E |
| `boss:weakopen` | `{ id, word, window }`. `window` in real seconds at the current time scale | A E H |
| `boss:weakclose` | `{ completed }` | A E H |
| `boss:hit` | `{ health, maxHealth, phase, x, y }` | A E H |
| `boss:phase` | `{ phase }` | A E H |
| `boss:finisher` | `{ id, word }` | A E H |
| `boss:defeat` | `{ x, y }` | A E H |

### 8.6 Interface (emitted by `TG.UI`)

| Event | Payload | Listeners |
|---|---|---|
| `ui:move` | `{}` | A |
| `ui:select` | `{}` | A |
| `ui:back` | `{}` | A |
| `ui:count` | `{ n, high }`. Countdown tick; `high` for the last 3 ticks of the continue countdown | A |
| `ui:tally` | `{}` | A |
| `ui:stamp` | `{ rank }` | A E |
| `ui:letter` | `{ index }`. A title logo letter was stamped, or an initial was typed | A |

`ui:letter` plays `key_ok` with `step = index`.

---

## 9. Game state machine

`state.screen` takes one of these values. "Sim" screens are advanced by `TG.Game.step`; the others by `TG.UI.update`.

| Screen | Kind | Owner of the logic | What it is |
|---|---|---|---|
| `boot` | UI | WP-G | "PRESS ANY KEY" |
| `title` | UI | WP-G | Title, menu, and the options, high score and story panels |
| `difficultySelect` | UI | WP-G | Three panels |
| `howToPlay` | UI | WP-G | Instructions; from difficulty select, the READY prompt |
| `playing` | Sim | WP-E | Sections 1 to 3 |
| `paused` | UI | WP-G | Pause menu and resume countdown |
| `lifeLost` | Sim | WP-E | World clock stopped after a hit (0.10 s) or a fall (1.0 s); 1.5 s when it was the last life. Letters are still handled |
| `gameOver` | UI | WP-G | Continue countdown |
| `bossIntro` | Sim | WP-E | The Baron appears |
| `boss` | Sim | WP-E | Boss rounds |
| `levelComplete` | Sim | WP-E | Defeat sequence |
| `results` | UI | WP-G | Tally and rank |
| `highScoreEntry` | UI | WP-G | Initials |

### 9.1 Allowed transitions (`TG.Game.canGo`)

| From | To | Trigger | Made by |
|---|---|---|---|
| `boot` | `title` | First key or click (audio is unlocked by the same input) | UI |
| `title` | `difficultySelect` | START | UI |
| `title` | `howToPlay` | HOW TO PLAY, with `data.origin = 'title'` | UI |
| `difficultySelect` | `howToPlay` | Difficulty confirmed, with `data = { origin: 'start', difficulty }` | UI |
| `difficultySelect` | `title` | Esc | UI |
| `howToPlay` | `playing` | READY typed (origin `start`): `TG.Game.newRun` | UI |
| `howToPlay` | `title` | Esc or confirm (origin `title`) | UI |
| `howToPlay` | `difficultySelect` | Esc (origin `start`) | UI |
| `playing` | `lifeLost` | A life is lost | Game |
| `playing` | `paused` | Esc, blur, long frame | Game |
| `playing` | `bossIntro` | Pip reaches the arena | Game |
| `lifeLost` | `playing` | Timer ends, lives remain, `resumeTo` is `playing` | Game |
| `lifeLost` | `boss` | Timer ends, lives remain, `resumeTo` is `boss` | Game |
| `lifeLost` | `gameOver` | Timer ends, no lives remain | Game |
| `lifeLost` | `paused` | Timer ends, lives remain, `pausePending` is true. `resumeTo` keeps the screen that `lifeLost` would have returned to | Game |
| `bossIntro` | `boss` | Intro timer ends | Game |
| `bossIntro` | `paused` | Esc, blur, long frame | Game |
| `boss` | `lifeLost` | A life is lost | Game |
| `boss` | `paused` | Esc, blur, long frame | Game |
| `boss` | `levelComplete` | Finisher word completed | Game |
| `levelComplete` | `results` | Timer ends | Game |
| `paused` | `playing`, `bossIntro`, `boss` | Resume, after the countdown. Only to `resumeTo` | UI through `TG.Game.resume` |
| `paused` | `playing`, `bossIntro` | Restart from checkpoint: `TG.Game.continueRun` | UI |
| `paused` | `results` | Quit: `TG.Game.endRun` | UI |
| `gameOver` | `playing`, `bossIntro` | Continue: `TG.Game.continueRun` | UI |
| `gameOver` | `results` | Esc or countdown reaches 0: `TG.Game.endRun` | UI |
| `results` | `highScoreEntry` | Confirm, and `TG.Save.qualifies` | UI |
| `results` | `title` | Confirm, score does not qualify | UI |
| `highScoreEntry` | `title` | Initials confirmed | UI |

Any other transition is refused by `setScreen`. Two calls are exceptions. `TG.Game.newRun` sets `playing` from any screen, so tests can start a run without the menus. `TG.Game.init` sets `boot` and emits `screen:change` with `from: null`; no transition leads back to `boot`.

### 9.2 Rules

- **Pause during `lifeLost` is deferred.** A pause request while the screen is `lifeLost` (Esc, blur, hidden tab or a long frame) sets `state.pausePending = true`; `TG.Game.pause()` returns false. When the `lifeLost` timer ends with lives remaining, the game goes to `paused` instead of back to play, `resumeTo` keeps the screen that `lifeLost` would have returned to (`playing` or `boss`), and `pausePending` is set to false. After a fall, Pip's rescue (section 5.2) is carried out before the screen changes, so the paused picture shows him in his bubble at the rescue point. If no lives remain, the game goes to `gameOver` as usual and `pausePending` is set to false.
- Pause requests during `levelComplete` are ignored. Nothing can hurt Pip on that screen.
- Entering `paused`, `gameOver`, `results` or `bossIntro` releases the typing lock with reason `screen`.
- Entering `gameOver` emits `game:over`. `continueRun` emits `screen:change`, `game:continue`, `level:start` with `continued: true` and `section:enter`, in that order (section 4.16).
- On `results`, `TG.UI` calls `TG.Save.recordRun(state.result)` once.
- While `paused`, neither the simulation nor `TG.Effects` advances.
- **Focus loss stops the interface countdowns.** `TG.Main` calls `TG.UI.onFocusLost()` on blur and on a hidden tab (4.21). On `paused` with the resume countdown running, the countdown is cancelled and the pause menu is back, as after Esc during the countdown. On `gameOver`, the continue countdown (and its key lockout) stands still until `TG.UI.onFocusGained()`; it runs on a clock of its own, so it does not jump ahead when the focus returns.

---

## 10. Headless test interface

All tests are plain Node scripts with no npm packages. They run from the project root: `node test/<file>.js`. A test prints one line per check (`ok - description` or `FAIL - description`) and exits with code 0 if every check passed, otherwise 1.

### 10.1 `test/stubs.js` (WP0)

```js
const stubs = require('./stubs');

stubs.FILES            // the 19 file paths of section 1, in load order, relative to the project root
stubs.ROOT             // absolute path of the project root

stubs.plain(value) -> value   // a JSON copy of `value` made in the test's own realm (see "Comparing values" below)

const env = stubs.load({
  files: stubs.FILES,  // optional list of paths relative to the project root, loaded in the order given,
                       // e.g. ['js/core.js', 'js/words.js', 'js/typing.js']. Paths outside js/ are allowed,
                       // e.g. 'test/standins/typing.js' (section 12)
  allowMissing: true,  // default true: files that do not exist are skipped and listed in env.missing
  storage: 'memory',   // 'memory': working localStorage.
                       // 'none':   window.localStorage is undefined.
                       // 'throw':  reading the property window.localStorage throws, and so does every method of the
                       //           storage object (getItem, setItem, removeItem, clear, key) if a reference to it is obtained
  constants: {},       // optional: { NAME: value }. Directly after js/core.js is loaded and before any other file, TG.C is replaced
                       // by a frozen copy with these values. Used by tests and for the constant overrides of section 12.1
  quiet: true,         // default true: console.warn and console.error are captured, not printed
  canvas: 'stub'       // 'stub' (default): canvases count calls and draw nothing.
                       // 'soft': canvases are software canvases (tools/softcanvas.js, section 13.2) that really draw
});

env.TG                 // the namespace after loading
env.canvas             // the game canvas, document.getElementById('game') (section 13.2)
env.localStorage       // the storage object itself in every mode (undefined for 'none'); with 'throw' its methods throw
env.run(code), env.context   // evaluates code inside the vm context; the context itself
env.timers, env.runTimers()  // callbacks passed to setTimeout and setInterval; nothing runs until runTimers() is called
env.window             // the stub window (env.window.TG === env.TG)
env.document           // the stub document
env.loaded             // files that were loaded
env.missing            // files that were skipped
env.storage            // Map behind the stub localStorage ('memory' only)
env.warnings           // array of captured console.warn messages
env.errors             // array of captured console.error messages
env.listeners          // { keydown: [fn], keyup: [fn], blur: [fn], focus: [fn], visibilitychange: [fn], resize: [fn], ... }
                       // registered on window and document
env.dispatch(type, init) -> event     // calls the window and document listeners for `type` with an event object built from `init`;
                                      // the event has preventDefault() and defaultPrevented
env.dispatchTo(element, type, init) -> event
                                      // the same for one stub element: calls element.listeners[type] in order.
                                      // Example: env.dispatchTo(env.document.getElementById('btn-jump'), 'pointerdown', { pointerId: 1 })
env.setHidden(flag) -> void           // sets document.hidden and document.visibilityState ('hidden' | 'visible'); dispatches nothing
env.setSize(w, h) -> void             // sets window.innerWidth and innerHeight; dispatches nothing
env.raf                // array of callbacks passed to requestAnimationFrame and not yet run
env.runFrame(ms) -> void              // runs and clears env.raf, passing ms as the timestamp
env.canvasCalls        // { count: 0 }: total 2D context method calls, for smoke tests
env.audio              // { contexts: [], nodes: 0, starts: 0, suspends: 0, resumes: 0, advance: fn }
                       // contexts: AudioContexts created. nodes: nodes created. starts: calls to start() on any node.
                       // suspends, resumes: calls to suspend() and resume() on any context.
env.audio.advance(seconds) -> void    // adds `seconds` to currentTime of every context created so far
```

**Comparing values.** Everything that comes out of `env.TG` was created inside the vm context and belongs to another realm: its arrays and objects do not share prototypes with the test's own. `assert.deepStrictEqual(TG.Difficulty.wordRange(m, 'hoppet', 2), [6, 8])` therefore fails although the contents are equal, and `x instanceof Array` is false. Tests compare by value: `JSON.stringify(a) === JSON.stringify(b)`, or `assert.deepEqual`, or `assert.deepStrictEqual(stubs.plain(a), b)`. They never use `assert.deepStrictEqual` or `instanceof` directly on values from `env.TG`. `Array.isArray` works across realms.

How it loads: each file is read and run with `vm.runInContext(source, context, { filename })` in one shared context whose global object has `window` (pointing to itself), `document`, `navigator`, `localStorage`, `AudioContext`, `webkitAudioContext`, `requestAnimationFrame`, `cancelAnimationFrame`, `performance`, `console`, `setTimeout`, `clearTimeout`, `Math`, `Date` and `JSON`. A file that throws while loading makes `load` throw with the file name in the message. Every `load` call builds a fresh context.

What the stubs do:

| Stub | Behaviour |
|---|---|
| `document.createElement('canvas')` | Object with `width`, `height`, `style`, `getContext('2d')` |
| 2D context | Accepts any property assignment. Every method is a no-op that adds 1 to `env.canvasCalls.count`. `getImageData` returns `{ width, height, data: Uint8ClampedArray }`. `measureText` returns `{ width: 0 }`. `createImageData`, `createPattern`, `createLinearGradient` return inert objects |
| `document.getElementById(id)` | Returns a stub element (a canvas stub for `game`), the same object for the same id. Elements have `style`, `classList` (`add`, `remove`, `toggle`, `contains`), `addEventListener`, `removeEventListener`, `focus`, `blur`, `getBoundingClientRect`, `setAttribute`, `getAttribute`. `addEventListener` records the listener in `element.listeners[type]` (an array per type); `removeEventListener` removes it |
| `window.addEventListener`, `document.addEventListener` | Record the listener in `env.listeners` |
| `window.innerWidth`, `innerHeight`, `devicePixelRatio` | 1920, 1080, 1. Changed with `env.setSize` |
| `document.hidden`, `document.visibilityState` | `false`, `'visible'`. Changed with `env.setHidden` |
| `window.localStorage` | By the `storage` option of `load` |
| `AudioContext` | `currentTime` starts at 0, is writable and is advanced only by `env.audio.advance`. `state` is `'running'` or `'suspended'` and follows `resume` and `suspend`, which count in `env.audio.resumes` and `env.audio.suspends`. `destination`, and the factory methods `createOscillator`, `createGain`, `createBuffer`, `createBufferSource`, `createDynamicsCompressor`, `createPeriodicWave`, `createStereoPanner`, `createBiquadFilter`. Nodes have `connect`, `disconnect`, `start` (adds 1 to `env.audio.starts`), `stop` and AudioParam-like fields with `value`, `setValueAtTime`, `linearRampToValueAtTime`, `exponentialRampToValueAtTime`, `setTargetAtTime`, `cancelScheduledValues`. Buffers have `getChannelData` returning a `Float32Array` |
| `requestAnimationFrame` | Stores the callback in `env.raf` and returns an id. Nothing runs by itself |
| `performance.now` | Returns 0 |

### 10.2 Driving the game without the interface

```js
const env = require('./stubs').load();
const TG = env.TG;

TG.Events.clear();
TG.Game.init();
const state0 = TG.Game.newRun({ difficulty: 'medium', seed: 1, adaptive: false, assist: 1, tutorial: false });

// one simulated step
TG.Input.typeChar('f');          // letters
TG.Input.keyDown('jump');        // jump: keyDown then keyUp on a later step
TG.Input.keyUp('jump');
TG.Input.keyDown('duck');        // duck: hold by delaying keyUp
TG.Input.keyUp('duck');
TG.Game.step(TG.C.DT);

const s = TG.Game.state;         // read state: s.screen, s.player, s.entities, s.boss, s.typing.stats, s.score ...
const typables = TG.Entities.typables(s);
const next = TG.Entities.nextAction(s);
```

- Input injected before a `step` is handled in that step, in the order injected.
- The harness never calls `TG.UI` or `TG.Main`. On `gameOver` it calls `TG.Game.continueRun()`. On `paused` (which happens headlessly only in the `pause-deferred` check) it calls `TG.Game.resume()`. A run is finished when `state.screen` is `results`, or earlier when it reaches the stop point given in `until` (section 10.3).
- The simulation must run with `audio.js`, `gfx.js`, `font.js`, the sprite files, `effects.js`, `hud.js`, `render.js`, `ui.js` and `main.js` absent.
- The simulation needs `core.js`, `words.js` and `typing.js`. `words.js` and `typing.js` belong to WP-A. The build order in section 12 delivers them before WP-E starts; section 12 also says what WP-E does if they are late.
- The harness calls neither `TG.Save.init` nor `TG.Save.load`, so every headless run starts from default settings.

### 10.3 The bot (`test/sim.js`, WP-E)

`test/sim.js` is both a command line script and a module: it runs the acceptance matrix only when `require.main === module`, and it exports `runBot`. Every run starts from a fresh `stubs.load()` so that no state is shared between runs.

`test/sim.js` holds two small tables that belong to the tuning record of section 12.1. `CONSTANT_OVERRIDES` (`{ NAME: value }`, empty at first) is passed to every `stubs.load` as `constants`. `EXPECTED_COUNTS` is `{ easy: [11, 14, 14], medium: [12, 16, 19], hard: [18, 22, 20] }`, the threat words per section from DESIGN 11.2; WP-E changes an entry only together with a line in the `Tuning changes` list.

```js
const { runBot } = require('./sim');
const report = runBot({
  difficulty: 'medium', wpm: 30, accuracy: 0.95, react: 0.7, seed: 1, adaptive: false,
  until: 'results',      // stop point: 'checkpoint1' | 'checkpoint2' | 'boss' | 'results' (default)
  noType: false,         // true: the bot never presses a letter
  noJump: false,         // true: the bot never jumps
  noDuck: false,         // true: the bot never ducks
  files: undefined,      // optional file list passed to stubs.load (default: stubs.FILES)
  maxSeconds: 1500, verbose: false
});
```

Stop points. They let a part of the level be tested before the rest exists, and let WP-H integrate a partial delivery.

| `until` | The run stops when |
|---|---|
| `checkpoint1` | `checkpoint` is emitted with index 1 (end of section 1) |
| `checkpoint2` | `checkpoint` is emitted with index 2 (end of section 2) |
| `boss` | `checkpoint` is emitted with index 3 (Pip has reached the arena) |
| `results` | `state.screen` is `results` |

Bot behaviour, per step:

1. **Screens.** `gameOver`: call `continueRun()` and count it. `paused`: call `resume()`. `results`: stop. Otherwise continue.
2. **Jump and duck.** `a = TG.Entities.nextAction(state)`. For each action id the bot chooses, once, a press point: for hazards `winStart + 2 + r * 0.4 * (winEnd - winStart - 4)` with `r` from the bot's own generator; for attacks the first step on which `inWindow` is true. When Pip reaches the press point and `a.inWindow` is true, it calls `keyDown` for the action and `keyUp` on the next step, or, for `hold`, when `player.x > a.holdUntil`. The bot jumps and ducks only for hazards and attacks. It cannot avoid a typable threat in this way, because the simulation does not allow it (section 4.13).
3. **Choosing a word.** If a word is locked, continue it. Otherwise take the typable with the lowest `eta`, then the lowest `id`. Threats, crates and boss words are treated alike; the queue and spacing rules (section 5.5) have already given each of them time in the order they appeared.
4. **Timing.** The bot may press the first key of a word when `state.time >= max(word.shownAt + react, lastWordDoneAt + 0.4 * react)`. After that it presses one key every `12 / wpm` seconds.
5. **Errors.** Before each key, with probability `(1 - accuracy) / accuracy`, it presses a neighbouring key from `TG.Words.ADJACENT` (one that is not the expected letter) and delays the correct key by one interval plus 0.15 s.
6. **Lost targets.** If the locked target disappears, the bot waits `DISCARD_TIME` and chooses again.

The bot uses `TG.RNG.create(seed + 1000)` for its own choices and never touches `state.rng`. `runBot` starts the run with `TG.Game.newRun({ difficulty, seed, adaptive, assist: 1, tutorial: config.tutorialAlways })`. The bot profiles are read from `TG.Game.state.config.bot` after `newRun`, so that overrides in the level's `tune` block are used.

**Assertions inside the harness.** During every run the harness listens with `'*'` and checks the following. A failure is recorded in `report.error` and the run fails.

| Assertion | Rule |
|---|---|
| `event-names` | Every event emitted has a name in `TG.Events.NAMES` and the payload fields listed in section 8 |
| `first-letters` | No two live typables share a first letter |
| `active-cap` | Live threats never exceed `config.maxActive` for the section |
| `word-pool` | Every `word` in `threat:spawn`, `boss:weakopen` and `boss:finisher` satisfies `TG.Words.has(difficulty, word)`. This covers threats, crates, rocks, minions, weak-point words and finisher words |
| `no-dodge` | Every threat that reaches `t >= 1` with its word unfinished is followed in the same step by `threat:hit` or `threat:bounce` |

The words seen in a run are returned in `report.words` for the `words-by-difficulty` check (section 10.4).

`report`:

```js
{
  difficulty: 'medium', profile: 'target', seed: 1,
  wpm: 30, accuracy: 0.95, react: 0.7, adaptive: false,
  until: 'results',
  finished: true,            // reached the stop point; for 'results', with result.cleared === true
  words: ['river', 'bridge'],// every word shown in the run, in order, without repeats
  time: 301.4,               // state.time at the end
  steps: 18084,
  score: 48210,
  lives: 3, livesLost: 1, continues: 0,
  damageTypable: 1, damageOther: 0,
  reportedWpm: 29.6, reportedAccuracy: 0.951,
  assistEnd: 1.0,
  rank: 'A',
  error: null                // message if the run threw or timed out
}
```

### 10.4 What `node test/sim.js` does and prints

With no arguments it runs the acceptance matrix: for each difficulty, each profile below, seeds 1, 2 and 3 (36 runs), then the extra checks.

| Profile | Bot settings | `adaptive` | Pass condition for each run |
|---|---|---|---|
| `floor` | `config.bot.floor` | on | `finished`, `continues <= 3` |
| `target` | `config.bot.target` | off | `finished`, `continues == 0` |
| `fast` | `config.bot.fast` | off | `finished`, `continues == 0`, `damageTypable == 0` |
| `exact` | `config.bot.target` with `accuracy: 1` | off | `finished`, `reportedWpm` within 10% of `wpm`, `reportedAccuracy == 1` |

Every run must also pass the assertions of section 10.3. With `--until` the same conditions apply up to the stop point.

These pass conditions are fixed. The tuning values they are run against are not: if the matrix does not pass with the starting values, WP-E changes tuning values within the limits of section 12.1, and does not change the conditions, the bot's behaviour or the `wpm` and `accuracy` of a profile.

Extra checks:

| Check | Pass condition |
|---|---|
| `level-valid` | `TG.Level.validate(TG.Levels[1])` returns an empty array |
| `deterministic` | Two `target` runs on medium with seed 1 give the same `steps`, `score` and `time` |
| `no-presentation` | A `target` run on medium finishes when only the simulation files are loaded |
| `jump-geometry` | At time scales 0.45, 1.0 and 1.25: a jump started at `winStart` and one started at `winEnd` both clear a narrow gap and a wide gap; a jump started at `winStart` and one at `winEnd` both clear a bramble; a slide started at `winStart` and one at `winEnd` both clear a branch. Also, for every hazard, `postX` lies inside the window and a press 10 px before it, at it and 10 px after it clears (section 5.8) |
| `fall-geometry` | At time scales 0.45, 1.0 and 1.25: running into a narrow gap without jumping, and into a wide gap without jumping, each ends in `hero:fall` and the loss of one life, from 20 different starting offsets of Pip's x |
| `no-jump-bridge` | In a run on easy with `noJump: true`, continued as often as needed: `hero:fall` is emitted at the first open gap (tile 106); the first gap that Pip falls into twice is bridged from then on (`hazard.bridged` is true and Pip runs across it); `hazard:bridge` is emitted once for it. After a fall Pip returns beyond the gap, so a second fall at the same gap needs a continue that restarts before it. The gap is expected to be the one at tile 322, after one continue from checkpoint 1; the check does not depend on which gap it is |
| `no-type` | A run with `noType: true` reaches `gameOver`; after `continueRun` Pip is at the last checkpoint with `config.lives` lives and the banked score |
| `pause-deferred` | `TG.Game.pause()` called during `lifeLost` returns false and sets `pausePending`; when the timer ends the screen is `paused` and `resumeTo` is `playing`; after `resume()` the run continues. The same call during `lifeLost` with no lives left leads to `gameOver` |
| `duck-held` | With the duck key held, `TG.Input.clear()` followed by steps ends the slide once `slideT` has run out: `player.state` returns to `run` |
| `counts` | The number of threat spawns per section and difficulty in `TG.Levels[1]` equals `EXPECTED_COUNTS` (section 10.3), no entry of `EXPECTED_COUNTS` differs from DESIGN 11.2 (11 / 14 / 14, 12 / 16 / 19, 18 / 22 / 20) by more than 25% rounded up, and the level has 7 crates |
| `words-by-difficulty` | Over the `target` runs of the matrix, the sets of words seen on easy, on medium and on hard have no word in common, and every run passed the `word-pool` assertion |
| `length` | `target` run time is between 240 and 420 s on every difficulty |

Output, one line per run and per check, then a summary:

```
RUN  difficulty=medium profile=target seed=1 wpm=30 acc=0.95 adaptive=off until=results result=PASS finished=1 time=301.4 score=48210 lives=3 continues=0 dmgTyp=1 dmgOther=0 repWpm=29.6 repAcc=0.951 assist=1.00
CHECK name=deterministic result=PASS
SUMMARY runs=36 passed=36 checks=12 checksPassed=12 result=PASS
```

Options:

| Option | Meaning |
|---|---|
| `--difficulty easy\|medium\|hard` | Run only this difficulty |
| `--profile floor\|target\|fast\|exact` | Run only this profile |
| `--wpm N --accuracy A --react R` | One custom run (needs `--difficulty`); printed as `profile=custom`, always `result=INFO` |
| `--seed N` | Use this seed only |
| `--adaptive on\|off` | Override |
| `--until checkpoint1\|checkpoint2\|boss\|results` | Stop every run at this point. Checks that need a full run (`length`, `deterministic`, `no-presentation`, `words-by-difficulty`) are then run to the same stop point, and `length` is skipped |
| `--check NAME` | Run only this extra check, and no matrix runs |
| `--milestone N` | Run the runs and checks of milestone N of the WP-E checklist (section 12) |
| `--verbose` | Also print one line per life lost, checkpoint, continue and boss phase |

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Every run and check passed |
| 1 | At least one run or check failed its pass condition |
| 2 | The harness could not run: a file failed to load, an exception escaped `TG.Game.step`, or a run exceeded `maxSeconds` of simulated time |

`TG.Game.snapshot()` returns the fields the report needs, as plain data:

```js
{ screen, time, frame, section, score, lives, shield, continues, livesLost, damageTypable, damageOther,
  assist, playerX, entities: [ { id, kind, word, typed, eta } ], bossHealth, bossPhase, wpm, accuracy }
```

---

## 11. Coordinates and units

### 11.1 Axes

- **World x** increases to the right. The level starts at x = 0. Tile `n` spans world x from `16 * n` to `16 * n + 15`.
- **y** increases downwards, as on the canvas. There is no vertical scrolling, so world y equals screen y. The ground surface is at `GROUND_Y` (184).
- **Screen x** = `floor(worldX - state.camera.x)`.
- **Camera.** The target is `player.x - HERO_SCREEN_X`. Each step `camera.x` moves towards the target by at most `CAMERA_MAX_STEP` px. In normal running the camera is exactly on target, so Pip's centre is at screen x 96. After a rescue the camera catches up over a few frames. `camera.x` is never negative.
- **Elevation** (`elev`) is the distance from the ground up to an entity's bottom: `y = GROUND_Y - elev`.

### 11.2 What x and y mean

| Object | `x` | `y` | Size |
|---|---|---|---|
| Player, threats, crates, attacks, boss, ink drops | Horizontal centre | Bottom (feet) | `w`, `h` extend `w/2` to each side and `h` upwards |
| Hazards, tiles, decor | Left edge | Top for collision boxes; sprites are placed by their bottom-left anchor | `w`, `h` extend right and down |
| Word plates, HUD elements, banners | Left edge, screen px | Top, screen px | |
| Hitbox objects returned by `hitbox` and `playerBox` | Left edge | Top | |

### 11.3 Time

- The simulation is advanced only by `TG.Game.step(dt)` with `dt` in **seconds**. The browser loop always passes `TG.C.DT` (1/60). Nothing in the simulation counts frames.
- `state.timeScale = pace * assist * slowScale * tutorScale * finisherScale`.
- `wdt = dt * state.timeScale` is the world step. It is 0 while the screen is `lifeLost`.
- On the **world clock** (`wdt`): Pip's movement, jump arc, coyote time, jump buffer and slide time; threat and crate clocks; attack movement; spawn retries; boss state timers except the intro; entity and player `animT`.
- On the **real clock** (`dt`): `state.time`; every typing statistic and key timestamp; the discard window; invulnerability; Hourglass and Golden quill time; `lifeLost`, `bossIntro` and `levelComplete` timers; assist easing; all presentation timers.
- **Nominal seconds** in the difficulty config are converted once, with `TG.Difficulty.toWs` (multiply by `pace`), and then counted on the world clock.
- `eta` on typables is in real seconds at the current time scale. `eta` on attacks and in `nextAction` is in world seconds.
- Speeds are px per world second. Distances are px. Level data positions are tiles.

### 11.4 Rounding

- The simulation keeps positions as floating point numbers.
- The renderer floors every draw position. Each parallax layer floors its own offset.
- Scores are integers. Word scores are rounded to the nearest 10.

---

## 12. Work package checklists

### 12.0 Build order and what each package may rely on

The packages are built in six stages (lead decision 13.3, written back). Packages inside one stage are built in parallel and cannot talk to each other. A stage starts when the files of the stages before it are present in the project.

| Stage | Packages | Notes |
|---|---|---|
| 1 | WP0 | Including the tools of 13.2 |
| 2 | WP-A, WP-B, WP-C, WP-D | In parallel |
| 3 | WP-E, first engineer | Milestones 1 to 3 |
| 4 | WP-E, second engineer | Milestones 4 to 6. May change any WP-E file |
| 5 | WP-F, WP-G | In parallel, after the simulation is delivered. Their tests run against the real simulation as well as against the fakes of section 12 |
| 6 | WP-H | |

What this means for each package after stage 2:

- **WP-E** needs `js/words.js` and `js/typing.js` (WP-A) to run `test/sim.js`: `TG.Game.newRun`, `TG.Entities.spawn` and the bot call `TG.Words.createPicker`, `picker.pick` and most of `TG.Typing`. They are present at stage 3.
- **WP-F** may use `TG.Gfx`, `TG.Font` and the sprite files in its tests, and must also run without them (section 2.2 rule 6).
- **WP-G** may use `TG.Gfx` and `TG.Font`. Its tests use fakes for `TG.Input` and `TG.Game` and guard the call to `TG.Render.drawBackdrop`, and also run against the real simulation, which is present at stage 5.

In the delivery of Level 1 no package used a stand-in, and `test/standins/` was never created.

**If a file from an earlier stage is late or does not work.** A package may write a temporary stand-in for it under `test/standins/`, with the same file name as the real one (for example `test/standins/typing.js`), and load it through `stubs.load({ files: [...] })`. Stand-ins are never placed under `js/` and never loaded by `index.html`. The package says in its hand-over notes which stand-ins it used. The acceptance run against the real files is then done by WP-H, which deletes `test/standins/`. A stand-in for `core.js` or `stubs.js` follows this contract in the same way.

**For every package.** Each package delivers its files, its tests, and a passing run of its acceptance checks. Each package also checks that its files load under `test/stubs.js` with only `js/core.js` and its own files present, and that loading them makes no canvas, audio or storage calls (`env.canvasCalls.count === 0`, `env.audio.contexts.length === 0`). This load check is about load time only (section 2.2, rules 1, 3 and 6); running WP-E's simulation needs WP-A's files as well.

Hand-over notes are part of the final message of each package to the lead, not a file, with one exception: WP-E's list of tuning changes, which is a comment in `js/levels/level1.js` (section 12.1).

### 12.1 What is binding and what may be tuned

**Binding.** Names, function signatures, data shapes, event names and payload fields, sprite and sound names, the state machine, the file list and file ownership. A package that needs one of these changed does not change it; it reports the need in its hand-over notes and WP-H decides.

**Starting values.** The numbers in section 5.10, the level timeline in DESIGN 11.3 to 11.5 with its counts in DESIGN 11.2, and the numeric constants in section 3. They were set from arithmetic and from a model, before any code existed. WP0 implements the values of sections 3 and 5.10 as written, and WP-E writes the level from DESIGN 11 as written. After that, WP-E may change values to make `node test/sim.js` pass, within these limits:

| What | Limit | Where WP-E makes the change |
|---|---|---|
| A number under one of the `TG.Difficulty.TUNABLE` keys, other than the bot profiles | At most 25% up or down from the value in 5.10. Whole-number values (`maxActive`, `wordLen`, `lenShift`, `shieldKeyStreak`, `boss.health`, `boss.coreWords`, `boss.rocks`, `boss.inFlight`, `boss.coreLen`, `boss.finisherLen`) by at most 1, except `shieldKeyStreak`, which may change by 25%. `boss.coreWords` must still add up to `boss.health` | The `tune` block of `js/levels/level1.js` (section 5.9) |
| Bot profiles | `react` by at most 25%. `wpm` and `accuracy` may not change: they are the speeds the difficulty select screen promises | The `tune` block, key `bot` |
| Position of a spawn, gap or hazard | At most 6 tiles | `js/levels/level1.js` |
| Number of threat spawns | Entries may be added, removed or given another difficulty tag, as long as no count per section and difficulty differs from DESIGN 11.2 by more than 25% (rounded up). The order in which threat kinds are introduced on each difficulty stays the same. Crates: their number and their powers stay the same | `js/levels/level1.js` |
| Section boundaries, checkpoints, number of gaps and hazards | May not change. The one exception is the long arch, which may be left out as a Tier 2 item (section 12.2) | |
| A numeric constant in `TG.C` | WP-E does not edit `js/core.js`. If a constant prevents acceptance and no tunable value can make up for it, WP-E puts the new value into `CONSTANT_OVERRIDES` (section 10.3), so that its tests run with it, and records the constant, the value and the reason. At most 25% up or down. Until WP-H has written the value back, the browser build still runs with the old value | `CONSTANT_OVERRIDES` in `test/sim.js` |
| Pass conditions, bot behaviour, assertions (sections 10.3 and 10.4) | May not change | |

**The record.** WP-E lists every change in a comment block headed `Tuning changes` at the top of `js/levels/level1.js`, one line per change: what was changed, the old value, the new value, and the run or check that failed without it. An empty list is written as `Tuning changes: none`. The `counts` check of section 10.4 compares the level with DESIGN 11.2 as amended by this list.

**If the limits are not enough** (lead decision 13.4, written back). The engineers do not stop to ask. If the acceptance matrix cannot pass within the limits, WP-E goes beyond them by the smallest amount that works and marks the line in the `Tuning changes` list with `beyond limit` and the reason. The pass conditions, the bot's behaviour, and the bot's `wpm` and `accuracy` stay fixed. A complete delivery (milestone 6) is expected.

**Writing back.** WP-H copies every recorded change into section 5.10 or section 3 of this file and into DESIGN 9.1 and 11. It moves the values of the `tune` block into the difficulty entries of `js/core.js` and the constant overrides into `TG.C`, and empties the `tune` block and `CONSTANT_OVERRIDES`, so that the documents, `js/core.js` and the running game agree. It then runs `node test/sim.js` again.

**Level 1 record.** WP-E delivered milestone 6 with `Tuning changes: none`: the whole matrix and every extra check pass with the starting values of section 3 and section 5.10 and the timeline of DESIGN 11 as written. The `tune` block of `js/levels/level1.js` and `CONSTANT_OVERRIDES` in `test/sim.js` are empty, so there was nothing to write back, and the numbers in section 3, section 5.10, DESIGN 9.1 and DESIGN 11 are the final values. `node test/sim.js` passes (36 runs, 28 checks).

After a play review, Level 1's `tune` block and its `Tuning changes` list hold four changes on each of Medium and Hard, all within the limits above: `react`, `perChar`, `boss.health` and `boss.coreWords` (section 14.2). They are left in the tune block rather than written back into section 5.10, because they describe Level 1 and the difficulty table is the starting point for later levels. DESIGN 9 (Level 1 record) and 11.6 give the values.

### 12.2 Priorities

DESIGN section 19 sorts the features into two tiers. Tier 1 is everything not listed below. Tier 2 is built last in each package and may be left out. A Tier 2 item that is left out must leave the game running without errors and without warnings; the table gives the fallback that achieves this. The names and fields stay in place, so no other package needs to know whether an item was built.

| Tier 2 item | Owner | Fallback if it is left out |
|---|---|---|
| CRT overlay | WP-G | `#crt` stays empty. The `crt` setting keeps its place in the save data and has no effect. The CRT line is left out of Options and Pause |
| Title idle rotation | WP-G | `TG.UI.panel` never takes the value `story`. High scores are reached from the menu |
| Average reaction time, slowest keys | WP-A, WP-G | `summary.avgReaction` is 0 and `summary.slowKeys` is `[]`; `stats.reactionSum`, `reactionCount` and the `interval*` fields stay 0. The results screen leaves out the two lines |
| Weak-letter and adjacency weighting | WP-A | Every candidate word has weight 1. `req.weak` and `TG.Words.ADJACENT` are not used by the picker. `ADJACENT` is still delivered, because the bot uses it |
| Suggestion line | WP-E, WP-G | `result.suggestion` is `null` |
| `key_ok` scale that follows the music key | WP-B | `key_ok` always uses C major pentatonic from C5. `music.keyOk` is ignored |
| Assist saved between runs | WP0, WP-E | `TG.Save.assist()` returns 1. `recordRun` does not store `result.assist` |
| Long arch | WP-E | No `arch` entry in `TG.Levels[1].hazards` and no ink row under it (148 drops, 145 on Easy). `haz_arch` is still delivered by WP-D, and the `hold` fields keep their place in the data shapes |
| Double attack and minion in boss phase 3 | WP-E | `tune.all.boss = { doubleAttack: false, minion: false }` in `js/levels/level1.js`, recorded as a tuning change. Phase 3 then has alternating attacks and volleys of rocks only |

Rules:

- Each package builds and tests its Tier 1 work first. Acceptance checks marked (Tier 2) below are skipped for an item that was left out, and the test prints `skip - description` for them.
- A package says in its hand-over notes which Tier 2 items it left out.
- WP-H records the items left out in DESIGN 19 and in this section. If integration runs short, WP-H may treat further presentation-only details as Tier 2 on the same terms: no error, no warning, and nothing that the bot or a goal sentence in DESIGN 16 depends on.

**Level 1 record.** No Tier 2 item was left out: all nine items in the table above are built and tested, and no further detail was moved into Tier 2 during integration. `weakWeighting`, `adjacencyWeighting`, `boss.doubleAttack` and `boss.minion` keep their values from section 5.10.

### WP0: foundation

Deliverables: `js/core.js`, `test/stubs.js`, `test/test-core.js`, and the tools of section 13.2: `tools/png.js`, `tools/softcanvas.js`, `tools/sheet.js`, `test/test-tools.js`.

- [ ] `TG.C`, `TG.PAL`, `TG.PAL_KEYS`, `TG.COLOR` exactly as in section 3 and DESIGN 14.2; `TG.C` is frozen.
- [ ] The headless drawing tools of section 13.2 and the `canvas: 'stub' | 'soft'` option of `stubs.load`; `node test/test-tools.js` passes.
- [ ] `TG.Util`, `TG.Events`, `TG.RNG`, `TG.Save`, `TG.Difficulty` as in sections 4.1 to 4.5, including `TG.Save.assist`, `TG.Difficulty.TUNABLE` and `TG.Difficulty.resolve`.
- [ ] Registries `TG.Sprites` (with `MANIFEST` transcribed from 6.4), `TG.Remaps`, `TG.Backdrops`, `TG.Levels`.
- [ ] `TG.Events.NAMES` lists every event in section 8.
- [ ] Three difficulty entries with every value in 5.10, as starting values (section 12.1).
- [ ] `test/stubs.js` as in 10.1, including `stubs.plain`, `env.dispatchTo`, `env.setHidden`, `env.setSize`, `env.audio.advance`, and the `constants` option: `stubs.load({ constants: { NAME: value } })` replaces `TG.C` with a frozen copy that has these values, directly after `js/core.js` is loaded and before any other file.

Acceptance (`node test/test-core.js`). Values from `env.TG` are compared as section 10.1 describes.

- [ ] `TG.RNG.create(1).next() === 0.6270739405881613`; two generators with the same seed give the same 1,000 values; `int(1, 6)` stays within 1 to 6 over 10,000 calls.
- [ ] A listener that throws does not stop the next listener or the emitter; the unsubscribe function works; `'*'` receives every event.
- [ ] `TG.Save` round-trips settings and scores with `storage: 'memory'`; `TG.Save.init(env.window)` and every other function work without throwing with `'none'` and `'throw'`; recovers from invalid JSON; `addScore` keeps 5 entries sorted; `qualifies` is false for a score of 0.
- [ ] Before `init` and `load` are called, `TG.Save.data` equals `TG.Save.defaults()` by value and `TG.Save.assist('easy')` is 1.
- [ ] With `m = TG.Difficulty.get('medium')`: `budget(m, 5)` is 3.7; `wordRange(m, 'hoppet', 2)` equals `[6, 8]` by value; `wordRange(m, 'dawdle', 2)` equals `[7, 10]` by value; `toWs(TG.Difficulty.get('easy'), 4)` is 3. `includes('easy', 'medium')` is false.
- [ ] `TG.Difficulty.resolve('medium', undefined) === TG.Difficulty.get('medium')`. `resolve('medium', { all: { react: 1.0 }, medium: { boss: { telegraph: 0.9 } } })` has `react` 1.0, `boss.telegraph` 0.9, `boss.health` 6 and `perChar` 0.5, is frozen, and leaves `get('medium')` unchanged. A key outside `TUNABLE` (for example `lives`) is ignored with one warning.
- [ ] `TG.Sprites.define` rejects a sprite with a short row and accepts a valid one; `MANIFEST` has an entry for every name in 6.4, and `fx_bracket` has 4 frames.
- [ ] `stubs.load()` with no game files other than `core.js` succeeds and reports the rest as missing.
- [ ] `env.dispatchTo` calls a listener added to a stub element; `env.audio.advance(1)` raises `currentTime` of a created context by 1; `stubs.load({ constants: { COYOTE: 0.12 } })` gives `TG.C.COYOTE === 0.12` and a frozen `TG.C`.

### WP-A: words and typing

Deliverables: `js/words.js`, `js/typing.js`, `test/test-words.js`, `test/test-typing.js`.

- [ ] Pools from DESIGN Appendix A, extended under DESIGN 10.1 and 10.2.
- [ ] Picker as in DESIGN 10.4, with the `flavour` option and `TG.Words.has` of section 4.6.
- [ ] Typing engine as in 4.7, with the public fields `opts`, `stats`, `target` and `discardT`; statistics as in 5.11.

Acceptance:

- [ ] `TG.Words.validate()` returns an empty array.
- [ ] Over 5,000 picks per difficulty and section, with 1 to 4 random active words: the pick never shares a first letter with an active word, is never a prefix of one or has one as a prefix, is within the requested length range (or shorter, by rule 8), and never repeats within 20 picks unless rule 7 applied.
- [ ] The same seed gives the same sequence of picks.
- [ ] `TG.Words.has('easy', w)` is true for every word of every easy pool and false for every word of the medium and hard pools; the same for the other two difficulties.
- [ ] A picker created with `{ flavour: 'meadow' }` gives the same sequence as one created without options. With a test flavour list added to `POOLS.easy.flavour`, its words are picked and `validate()` includes them.
- [ ] Lock chooses the lowest `priority`, then the lowest `eta`.
- [ ] After a lock, `ty.target` is the locked typable and `TG.Typing.locked(ty)` returns the same object; after completion, release or loss of the target, `ty.target` is `null`.
- [ ] A key with no typables returns `ignored` and changes no statistic.
- [ ] Wrong keys keep progress; three wrong keys with `typed <= 2` auto-release when enabled and do not when disabled.
- [ ] Backspace release resets `typed` to 0. `backspace(ty)` straight after a wrong key keeps the lock and progress and emits nothing; a second one releases.
- [ ] The discard window drops keys for 0.25 s after a locked target is lost, and only then.
- [ ] A scripted word typed at a fixed interval reports WPM within 1% of `12 / interval`.
- [ ] Multiplier steps and penalties follow DESIGN 8.2 for each `streakPenaltySteps`.
- [ ] `summary` returns practise keys under the minimum-sample rule.
- [ ] (Tier 2) `summary` returns slow keys and the average reaction time under the minimum-sample rules; weighted picks favour non-adjacent first letters and weak letters.
- [ ] Completing a word of kind `core` emits `type:hit` with `complete: true` and kind `core`.
- [ ] Every event emitted matches the payloads in 8.1.

### WP-B: audio

Deliverables: `js/audio.js`, `test/test-audio.js`.

- [ ] Voices, routing and gains from DESIGN 15.1.
- [ ] Every sound effect in 7.1 and every track and jingle in 7.2, composed from DESIGN 15.2 and 15.3.
- [ ] Event subscriptions from 7.1 to 7.3.

Acceptance:

- [ ] `TG.Audio.SFX` and `TG.Audio.TRACKS` contain exactly the names in 7.1 and 7.2.
- [ ] Before `unlock`, no `AudioContext` exists and every function returns without throwing.
- [ ] After `unlock` under the stub, `sfx(name)` for every name creates nodes and does not throw.
- [ ] For every looping track: `music(name)` followed by 600 rounds of `env.audio.advance(1 / 60)` and `update(1 / 60)` raises `env.audio.starts` during every one of the 10 seconds. For every track that plays once and every jingle, `env.audio.starts` rises during the first second and stops rising after the track's length.
- [ ] `setTempoScale(0.75)` lowers the number of `start()` calls per second of a looping track; `setBassOnly(true)` lowers it further.
- [ ] After `power:start` with `hourglass` and `boss:warning`, a `level:start` event (with `continued` true or false) returns the tempo scale to 1 and turns bass-only off, and `jingle_ready` plays once. `game:continue` followed by `level:start` plays `jingle_ready` once, not twice.
- [ ] `level:start` with `music: { level: 'level1', boss: 'boss1' }` followed by `screen:change` to `playing` plays `level1`; with a track name that is not in `TRACKS` it warns once and does not throw.
- [ ] `urgent_tick`: with a fake `TG.Game.state` that has one entity with `urgent: true` and the screen `playing`, `update` plays the tick four times a second; with the entity removed from `state.entities`, or the screen `gameOver`, it plays none. With `TG.Game` absent it does not throw.
- [ ] `suspend()` and `resume()` call `suspend` and `resume` on the context (`env.audio.suspends`, `env.audio.resumes`) and do not change the sequencer position. `screen:change` to `paused` stops new music notes while `sfx('ui_move')` still creates nodes.
- [ ] `type:hit` with `complete: true` and kind `finisher` plays `word_clear`.
- [ ] With `AudioContext` removed from the stub window, `init`, `unlock`, `sfx`, `music`, `suspend`, `resume` and `update` do not throw.
- [ ] Emitting each event in 7.1 with a payload from section 8 does not throw.
- [ ] `setEnabled('sfx', false)` stops new sound effects; `setEnabled('music', false)` silences music without stopping the sequencer position.
- [ ] (Tier 2) `section:enter` with `music.keyOk = { root: 2, mode: 'major' }` raises the pitch of `key_ok` by 2 semitones.
- [ ] Listening check in a browser (manual): `key_ok` rises with each letter; `key_bad` is quieter than `key_ok`; music sits below the typing sounds.

### WP-C: graphics core and characters

Deliverables: `js/gfx.js`, `js/font.js`, `js/sprites-chars.js`, `test/test-gfx.js`.

- [ ] `TG.Gfx` and `TG.Font` as in 4.9 and 4.10.
- [ ] Every WP-C sprite in 6.4 and the remaps `white`, `gold`, `dim`, `lampred`.

Acceptance:

- [ ] `TG.Sprites.missing('C')` is empty.
- [ ] Every defined sprite passes `TG.Sprites.check`; every enemy uses at most 3 colours plus INK, Pip at most 5 plus INK, boss parts at most 6 plus INK in total, plus CREAM for the lamp.
- [ ] `boss_head` has CREAM pixels in all four frames, and no other boss part has any. `TG.Remaps.lampred` equals `{ 19: 25 }` by value. A `boss_head` frame drawn with `lampred` differs from the plain frame only in the pixels that were CREAM; the GOLD pixels of the helmet are unchanged.
- [ ] Every sprite frame with an outline rule has INK on every opaque pixel that touches a transparent pixel or the frame edge (report as a warning list; at most 5% of edge pixels may differ).
- [ ] The font has a glyph for every character in 4.10 and every symbol in `TG.Font.SYM`; no two glyphs are identical; O, Q, D and 0 differ from each other by at least 3 pixels, as do I, L and 1.
- [ ] `TG.Gfx.draw` of an undefined name draws the placeholder and warns once.
- [ ] `TG.Gfx.get` returns the same canvas object for the same arguments and a different one for a different remap.
- [ ] Visual check in a browser (manual): a test page or a temporary call that draws every WP-C sprite frame on a grid at 4x.
- [ ] Art check (lead decision 13.6): the sprites are rendered with `tools/sheet.js` at 4x, the PNG files are opened, and the pixel data is revised until each sprite reads clearly as what it is: Pip faces right; threats that arrive from the right face left; animation frames of one sprite keep the same proportions and ground line; the Baron reads as a large mole with a miner's helmet. At least two rounds of look and revise for every character sprite.

### WP-D: world art

Deliverables: `js/sprites-world.js`, `test/test-sprites-world.js`.

- [ ] Every WP-D sprite in 6.4, the remaps `sunset` and `dusk`, and `TG.Backdrops.meadow` as in 6.5.

Acceptance:

- [ ] `TG.Sprites.missing('D')` is empty; every sprite passes `TG.Sprites.check`.
- [ ] `fx_bracket` has the four frames `tl0 tl1 bl0 bl1`; each `bl` frame is the matching `tl` frame mirrored top to bottom.
- [ ] `tile_grass`, `tile_soil`, `tile_arena`, `bg_hill_far` and `bg_hill_mid` tile horizontally: the first and last columns of each are compatible (the test compares column 0 with the column after the last by checking that the silhouette height differs by at most 1 px).
- [ ] `TG.Backdrops.meadow` has the palettes `day`, `sunset`, `dusk` and the five layers; every sprite name it uses is defined; sky bands cover y from 0 to 184 without gaps.
- [ ] `haz_bramble`, `haz_branch`, `haz_beehive` and `haz_arch` each contain CORAL pixels (the hazard accent). The thorns of `haz_bramble` fill the middle 8 columns of its lower 8 px, which is where its collision box is.
- [ ] In each of `bg_hill_far`, `bg_hill_mid`, `bg_tree`, `bg_bush` and `bg_appletree`, WHITE, GOLD and INK together make up at most 10% of the opaque pixels, so word plates stay legible in front of them.
- [ ] Visual check in a browser (manual), as for WP-C.
- [ ] Art check (lead decision 13.6), as for WP-C: render with `tools/sheet.js` at 4x, open the PNG files and revise until every tile, hazard, item and backdrop piece reads clearly as what it is.

### WP-E: gameplay simulation

Deliverables: `js/input.js`, `js/entities.js`, `js/level.js`, `js/boss.js`, `js/game.js`, `js/levels/level1.js`, `test/sim.js`.

- [ ] `TG.Input`, `TG.Entities`, `TG.Level`, `TG.Boss`, `TG.Game` as in 4.12 to 4.16.
- [ ] Data shapes as in section 5; events as in 8.2 to 8.5; state machine as in section 9.
- [ ] Level 1 data following DESIGN 11 and Appendix B, with the `Tuning changes` list of section 12.1.
- [ ] Harness and bot as in section 10.

**Milestones.** WP-E builds in this order. Each milestone has its own check, run with `node test/sim.js --milestone N`, so that a problem is found at the step that causes it. The hand-over notes state the highest milestone that passes. A delivery that passes milestone 3 or higher can be integrated by WP-H: the game is then playable up to that point, and WP-H runs the bot with the matching `--until`.

| # | What is built | Check (`--milestone N` runs exactly this) |
|---|---|---|
| 1 | Input queue and `translate`; player physics, jump, slide, the two support tests, fall and rescue; level build and validation; hazards and their windows; `nextAction` | Extra checks `level-valid`, `jump-geometry`, `fall-geometry`, `duck-held`, `counts`. The `translate` table of 4.12, including `e.repeat`, modifier keys and the semicolon rules. `env.dispatchTo` with `pointerdown` on a bound button queues a `jump` key down and `pointerup` queues the key up |
| 2 | Spawning, word picking, budgets with the queue, spacing and keep-clear rules, waiting at the edge, movement paths, contact by the clock, typing results, scoring, lives, `lifeLost`; section 1 | Profiles `target` and `exact`, every difficulty, seeds 1 to 3, `--until checkpoint1`, with the assertions of 10.3 |
| 3 | Sections 2 and 3: all four directions, crates and power-ups, ink drops, extra lives, shield for a key streak, checkpoints, game over and continue, plank bridges, pause and deferred pause | Profiles `target` and `fast`, every difficulty, seeds 1 to 3, `--until boss`. Extra checks `no-type`, `no-jump-bridge`, `pause-deferred` |
| 4 | Boss: intro, volleys, attacks, weak-point words, phases, finisher, defeat, `levelComplete`, result and rank | Profiles `target`, `fast` and `exact`, every difficulty, seeds 1 to 3, to `results`. Extra checks `deterministic`, `no-presentation`, `words-by-difficulty`, `length` |
| 5 | Adaptive pacing, tutorial slow-down | Profile `floor` (adaptive on), every difficulty, seeds 1 to 3, to `results` |
| 6 | Tuning within the limits of 12.1; Tier 2 items | `node test/sim.js` with no arguments: the full matrix and every extra check |

Acceptance:

- [ ] `node test/sim.js` exits with 0. This includes the assertions of section 10.3 and the extra checks of section 10.4.
- [ ] `TG.Input.translate` follows the table in 4.12, including `e.repeat`, modifier keys and the semicolon rules.
- [ ] A `pointerdown` on an element bound with `TG.Input.bindButton(element, 'jump')`, sent with `env.dispatchTo`, queues a `jump` key down and calls `preventDefault`; `pointerup`, `pointercancel` and `pointerleave` queue the key up.
- [ ] Threat counts per section and difficulty match DESIGN 11.2 as amended by the `Tuning changes` list (check `counts`).
- [ ] No two live typables ever share a first letter during any acceptance run (assertion `first-letters`).
- [ ] Live threats never exceed `config.maxActive` for the section (assertion `active-cap`).
- [ ] Every word shown in a run belongs to the pools of the run's difficulty (assertion `word-pool`, check `words-by-difficulty`).
- [ ] A threat whose word is not finished always reaches Pip, whatever he is doing (assertion `no-dodge`). A test that makes Pip jump, and one that makes him slide, at the moment a Dawdle and a Buzzle reach `t = 1` both end in `threat:hit`.
- [ ] Running into a narrow gap and into a wide gap without jumping both end in a fall (check `fall-geometry`).
- [ ] Score returns to the banked value on continue; typing statistics do not reset.
- [ ] After a continue, `state.power.slowT` and `quillT` are 0, `state.slowScale` is 1, no entity is live, and the events `screen:change`, `game:continue`, `level:start`, `section:enter` were emitted in that order. `newRun` emits `screen:change`, `level:start`, `section:enter`.
- [ ] A crate spawned while a threat is live gets a budget of at least the queue value, and a threat spawned while a crate with untyped letters is live counts the crate in `A` and `R`.
- [ ] A Dawdle, Hoppet, Buzzle or Truffle is `onScreen` on the step it is spawned, for budgets of 2, 6 and 12 ws. A Digby is not `onScreen` until `t = DIGBY_POP_T` and its `dx` is `DIGBY_DX` until then.
- [ ] Every element of `state.items` has the shape of section 5.14, and a collected drop is no longer in the array on the step after `pickup:ink`.
- [ ] A run in which the bot never types ends in `gameOver`, and after `continueRun` Pip is at the last checkpoint with starting lives (check `no-type`).
- [ ] In a run on easy in which the bot never jumps, the first gap that Pip falls into twice is bridged from then on, and `hazard:bridge` is emitted once for it (check `no-jump-bridge`).
- [ ] A pause requested during `lifeLost` takes effect when the timer ends (check `pause-deferred`).
- [ ] `TG.Game.init()` emits `screen:change` with `from: null` and `to: 'boot'`.
- [ ] Every event emitted has a name in `TG.Events.NAMES` and the payload fields listed in section 8 (assertion `event-names`).

### WP-F: rendering

Deliverables: `js/effects.js`, `js/hud.js`, `js/render.js`, `test/test-render.js`.

- [ ] `TG.Effects`, `TG.Hud`, `TG.Render` as in 4.17 to 4.19.
- [ ] Draw order from 4.19; entity drawing from 6.6; HUD from DESIGN 13; plates from DESIGN 4.5 and section 5.13; clear animations from DESIGN 4.2 and 4.6.

Acceptance (`node test/test-render.js`; the test builds a state by hand from section 5 if the simulation files are absent. In the hand-built state, `typing` is `{ opts: {}, stats: { /* 5.11 */ }, target: null, discardT: 0 }`, and the lock is set by assigning one of the typables to `typing.target`):

- [ ] `TG.Render.draw` runs without throwing on a hand-built state for each of the screens `playing`, `lifeLost`, `bossIntro`, `boss`, `levelComplete`, `paused`, `gameOver`, with and without sprite files loaded, and makes canvas calls.
- [ ] `layoutLabels` with 4 typables at the same position returns 4 plates that do not overlap, all inside x 2 to 382 and y 24 to 184.
- [ ] With `state.typing.target` set to one of the typables, its label has `locked: true` and comes first, and every other label has `dim: true`. With `target: null` no label is locked or dim.
- [ ] A typable whose sprite box is left of the view gets `edge: 'left'`. A digby with `elev: -16` gets `edge: 'bottom'` with the plate's bottom at `GROUND_Y - 12`. A boulder beyond the right edge gets `edge: 'right'`.
- [ ] A `word:clear` event with `x` beyond the right edge of the view creates effects whose screen x is at most 376.
- [ ] `type:hit` with `complete: true` and kind `core` creates letter particles; the same event with kind `hoppet` creates none (they come from `word:clear`).
- [ ] With three items in `state.items`, the item sprite is drawn three times; with an empty array, none.
- [ ] On `gameOver` the hero sprite requested is `hero_sit`; on `levelComplete` it is `hero_win`. With `boss.rise = 40` and pose `dizzy` on `levelComplete`, `draw` does not throw.
- [ ] Emitting every event in section 8 with a valid payload does not throw, and `TG.Effects.count()` never exceeds 256 after 1,000 `word:clear` events. After `level:start`, `TG.Effects.count()` is 0.
- [ ] With `reduceFlash` set, `shake()` is zero and `flash()` is `null` after `life:lost`.
- [ ] No function in these files writes to the state: the test deep-freezes the state before `draw` and `Hud.update`.
- [ ] Visual check in a browser (manual) once the simulation exists: plates legible over every backdrop palette; HUD positions match DESIGN 13.

### WP-G: screens and bootstrap

Deliverables: `js/ui.js`, `js/main.js`, `index.html`, `css/style.css`, `test/test-ui.js`.

- [ ] `TG.UI` and `TG.Main` as in 4.20 and 4.21; screens from DESIGN 12; page elements from 4.21.
- [ ] Whole-number scaling with room for the buttons (section 4.21, DESIGN 14.1), letterbox, on-screen buttons (DESIGN 2).
- [ ] (Tier 2) CRT overlay (DESIGN 14.8); title idle rotation.

Acceptance (`node test/test-ui.js`). The test uses fakes for the modules that are built in the same stage, when the real files are absent:

- for `TG.Game`, a fake that implements `state`, `init` (which emits `screen:change` to `boot`), `setScreen`, `canGo`, `newRun`, `pause`, `resume`, `continueRun`, `endRun` and `isSimScreen`;
- for `TG.Input`, a fake that implements `init`, `typeChar`, `keyDown`, `keyUp`, `isDown`, `drain`, `clear`, `bindButton` and `onFirstInput`. The test puts keys into it with `typeChar` and `keyDown`, and `TG.UI.update` drains it;
- for `TG.Audio`, a fake that records calls to `unlock`, `suspend`, `resume` and `update`.

Checks:

- [ ] The script tags in `index.html` match `stubs.FILES` in order, followed by the inline `TG.Main.init()` call; the page has no other external references.
- [ ] `TG.Main.init()` runs under the stubs without throwing, with all modules present and with only `core.js`, `ui.js` and `main.js` present, with `storage` set to `memory`, `none` and `throw`.
- [ ] `TG.UI.init()` called before `TG.Game.init()` does not throw and does not read `TG.Game.state`; the `boot` screen is set up when `screen:change` to `boot` arrives.
- [ ] From `boot`, a key moves to `title`; START then a difficulty then typing `ready` calls `newRun` with that difficulty.
- [ ] Typing `hard` on the difficulty screen selects Hard.
- [ ] On `gameOver`, keys are ignored for 0.8 s; Enter then calls `continueRun`; with no input, `endRun` is called after the countdown.
- [ ] On `paused`, RESUME calls `resume` only after 1.5 s of countdown.
- [ ] On `highScoreEntry`, three letters and Enter call `TG.Save.addScore` with those initials.
- [ ] Options changes are written through `TG.Save.setSetting`.
- [ ] On `checkpoint` with index 1, `TG.Save.setSetting('tutorialDone', true)` is called.
- [ ] `btn-jump` and `btn-duck` have `tabindex="-1"` in `index.html`, and `TG.Main.init` calls `TG.Input.bindButton` for both. (That a press on a bound button queues a key is tested by WP-E.)
- [ ] `TG.Main.layoutFor` gives the check values of section 4.21 for 1366 x 768, 1280 x 720, 1920 x 1080 and 800 x 600. For every window size from 320 x 240 to 2560 x 1440 in steps of 40 px, the canvas and both buttons (64 x 64) lie inside the window and do not overlap.
- [ ] `env.dispatch('blur')` calls `TG.Game.pause`, `TG.Input.clear` and `TG.Audio.suspend`. `env.dispatch('focus')` calls `TG.Audio.resume`. `env.setHidden(true)` with `env.dispatch('visibilitychange')` calls `suspend`; `env.setHidden(false)` with `env.dispatch('visibilitychange')` calls `resume`. This holds on the `title` screen as well as on `playing`.
- [ ] Manual check in a browser: opening `index.html` by double-click shows the boot screen; the canvas scales in whole steps when the window is resized; at 1920 x 1080, 1366 x 768 and 1280 x 720 both buttons are fully inside the window without scrolling and do not cover the canvas; after switching to another window and back on the title screen, the music plays again.

### WP-H: integration and fixes

Deliverables: `test/run-all.js`, `test/test-integration.js`, `README.md`, fixes in any file, a short list of changes made to files owned by other packages, and the write-back of tuning changes and lead decisions into this file and DESIGN.

- [ ] `node test/run-all.js` runs every `test/test-*.js` and `test/sim.js`, prints each file's result and exits with 0 only if all passed.
- [ ] `node test/test-integration.js` drives the whole game with key events and the bots, with rendering and sound on, and covers the paths a bot run does not take (section 14.1).
- [ ] Every test passes against the real files. `test/standins/` is deleted.
- [ ] If WP-E was delivered at a milestone below 6: the bot runs of the delivered milestones pass with the matching `--until`, and the part that is missing is listed for the lead, who decides how it is completed.
- [ ] With all 19 files loaded under the stubs, 600 frames driven through `env.runFrame` from `boot` to `playing` (keys injected with `env.dispatch`) complete without a captured `console.error`.
- [ ] `TG.Sprites.missing()` is empty; no placeholder warning appears during a full bot run with rendering on.
- [ ] Every name passed to `TG.Audio.sfx` and `TG.Audio.music` anywhere in the code is in the registries.
- [ ] Tuning changes are written back as section 12.1 describes: into sections 3 and 5.10 of this file, DESIGN 9.1 and 11, and `js/core.js`; the `tune` block of Level 1 and `CONSTANT_OVERRIDES` are empty; `node test/sim.js` passes afterwards.
- [ ] Tier 2 items that were left out are recorded in DESIGN 19 and in section 12.2.
- [ ] Manual play-through in a browser on each difficulty: difficulty can be selected; words differ by difficulty; a word that is not typed always reaches Pip; every crevasse has to be jumped; the level can be completed; a game over can be continued and the music is normal afterwards; scores and settings persist after a reload; the game works with storage blocked.
- [ ] No network requests appear in the browser's network panel.
- [ ] Any change to this contract made during integration is written into this file.

---

## 13. Lead decisions

These were made by the project lead after the review of version 1.1. Where a decision here differs from text above or from `docs/DESIGN.md`, this section applies. WP-H writes the decisions back into the sections they replace.

Written back by WP-H: 13.1 into section 4.21 and DESIGN 2 and 14.1; 13.2 into sections 1, 10.1 and the WP0 checklist; 13.3 into section 12.0; 13.4 into section 12.1; 13.6 into the WP-C and WP-D checklists. 13.5 confirms text that was already there. This section is kept as the record of the decisions.

### 13.1 Scaling and buttons (replaces the scale rule of 4.21 and DESIGN 14.1)

The JUMP and DUCK buttons stay visible at all times, placed as 4.21 describes (`side` or `below`). The scale no longer has to be a whole number of CSS pixels. It has to be a whole number of device pixels, so that every game pixel is the same size on screen, and small windows use the exact fit so the game is never shown tiny.

```js
TG.Main.layoutFor(winW, winH, dpr) -> { scale, cssW, cssH, buttons }   // dpr: window.devicePixelRatio, default 1
```

With `B = TG.C.BUTTON_SPACE` (72) and `snap(f) = floor(f * dpr) / dpr`:

1. `s = snap(min(winW / 384, winH / 216))`. If `s >= 2` and `(winW - 384 * s) / 2 >= B`: `scale = s`, `buttons = 'side'`.
2. Otherwise `fit = min(winW / 384, (winH - B) / 216)` and `s = snap(fit)`. If `s >= 2`: `scale = s`, `buttons = 'below'`.
3. Otherwise `sideFit = min((winW - 2 * B) / 384, winH / 216)`. If `sideFit > fit` and `216 * sideFit >= 64` (a button): `scale = sideFit >= 2 ? snap(sideFit) : sideFit`, `buttons = 'side'`.
4. Otherwise `scale = max(0.25, fit)` (a fraction), `buttons = 'below'`.
5. `cssW = 384 * scale`, `cssH = 216 * scale`.

Check values. With `dpr` 1 the four values of 4.21 are unchanged. In addition: `layoutFor(1440, 900, 2)` is scale 3.5, `below`. `layoutFor(700, 500, 1)` is scale 700 / 384 (about 1.823), `below`. Step 3 (added by the presentation review, 14.2): `layoutFor(1200, 400, 1)` is scale 400 / 216, `side`; `layoutFor(844, 342, 3)` is scale 342 / 216, `side`; `layoutFor(920, 500, 3)` is scale 2, `side`. `TG.Main.resize` passes `window.devicePixelRatio || 1`. The canvas backing store stays 384 x 216; the CSS uses `image-rendering: pixelated`.

The CRT overlay default (DESIGN 14.8) is on when the scale is 3 or more.

### 13.2 Headless drawing tools (added to WP0)

Engineers cannot see a browser, so WP0 also delivers tools that turn drawing into PNG files. An engineer then opens the PNG with the file viewer and checks the picture.

| File | Owner | What it does |
|---|---|---|
| `tools/png.js` | WP0 | `encode(width, height, rgba) -> Buffer` (RGBA bytes to a PNG, using Node's built-in `zlib`), `write(path, width, height, rgba)` |
| `tools/softcanvas.js` | WP0 | A software canvas: `createCanvas(w, h)` returns an object with `width`, `height`, `style`, `getContext('2d')` and `toRGBA() -> Uint8ClampedArray`. The context implements the subset below and really draws |
| `tools/sheet.js` | WP0 | `node tools/sheet.js --out <file.png> [--scale 4] [--filter <text>] [--owner C\|D] [--remap <name>] [--bg <palette index>]`. Loads `js/core.js` and whichever sprite files exist, and draws every defined sprite frame whose name contains the filter into a labelled grid. It reads the sprite data directly (section 6.1) and does not need `gfx.js` or `font.js`; labels use a small built-in font of its own |
| `test/test-tools.js` | WP0 | Checks the three tools: a PNG round trip through `zlib.inflateSync`, `fillRect` and `drawImage` pixel values, a sheet of a test sprite |
| `tools/shot.js` | WP-F | `node tools/shot.js --out <file.png> [--difficulty medium] [--seed 1] [--at <seconds>] [--until checkpoint1\|checkpoint2\|boss\|results] [--frames <n>] [--scale 3]`. Runs the bot of `test/sim.js` with all files loaded and the software canvas, calling `TG.Main.tick` and `TG.Render.draw` each step, and writes the frame at the chosen moment |
| `tools/shot-ui.js` | WP-G | `node tools/shot-ui.js --screen boot\|title\|difficultySelect\|howToPlay\|paused\|gameOver\|results\|highScoreEntry --out <file.png> [--scale 3]`. Draws one interface screen on the software canvas |

`test/stubs.js` gains the option `canvas: 'stub' | 'soft'` (default `'stub'`). With `'soft'`, `document.createElement('canvas')` and `document.getElementById('game')` return software canvases, and `env.canvas` is the game canvas.

**Canvas subset.** Presentation code (`gfx.js`, `font.js`, `effects.js`, `hud.js`, `render.js`, `ui.js`) uses only these, so that a PNG from the tools shows what the browser shows:

- properties: `fillStyle` (strings of the form `#rrggbb` only), `imageSmoothingEnabled`, `globalAlpha` (left at 1);
- methods: `fillRect`, `clearRect`, `drawImage` with a canvas as the source (the 3, 5 and 9 argument forms, nearest-neighbour, positive sizes), `save`, `restore`, `translate` (whole pixels), `setTransform(1, 0, 0, 1, 0, 0)`, `createImageData`, `getImageData`, `putImageData`.

No `fillText`, `strokeRect`, paths, `clip`, gradients, `scale` or `rotate`. Text goes through `TG.Font`. Flipped and recoloured sprites are made when a frame is cached. The software canvas throws an error that names the method if code calls anything outside the subset, so that a mistake is found at once.

### 13.3 Build order (replaces the stage table of 12.0)

| Stage | Packages | Notes |
|---|---|---|
| 1 | WP0 | Including the tools of 13.2 |
| 2 | WP-A, WP-B, WP-C, WP-D | In parallel |
| 3 | WP-E, first engineer | Milestones 1 to 3 |
| 4 | WP-E, second engineer | Milestones 4 to 6. May change any WP-E file |
| 5 | WP-F, WP-G | In parallel, after the simulation is delivered. Their tests run against the real simulation as well as against the fakes of section 12 |
| 6 | WP-H | |

### 13.4 Tuning limits (adds to 12.1)

The engineers do not stop to ask when the limits of 12.1 are not enough. If the acceptance matrix cannot pass within the limits, WP-E goes beyond them by the smallest amount that works and marks the line in the `Tuning changes` list with `beyond limit` and the reason. The pass conditions, the bot's behaviour, and the bot's `wpm` and `accuracy` stay fixed. A complete delivery (milestone 6) is expected.

### 13.5 Confirmed as written

- On continue, shield charges are kept and a running Hourglass or Golden quill ends.
- The title is SPELL RUNNER.
- Ground creatures wait at the screen edge, and an untyped threat reaches Pip whatever he is doing. Both are judged in play after integration.

### 13.6 Art check (adds to WP-C and WP-D acceptance)

WP-C and WP-D render their sprites with `tools/sheet.js` at 4x, open the PNG files, and revise the pixel data until each sprite reads clearly as what it is: Pip faces right; threats that arrive from the right face left; animation frames of one sprite keep the same proportions and ground line; the Baron reads as a large mole with a miner's helmet. At least two rounds of look and revise for every character sprite.

---

## 14. Integration record (WP-H)

WP-H integrated the delivered packages of Level 1. This section records what was checked, where the delivered code differs from the text of sections 1 to 12 and of `docs/DESIGN.md`, and what is left for the lead. The code is tested and working in each case below, so it was kept, and this record is the contract for it. Where a line here differs from the text above, this line describes the game as built.

### 14.1 What was checked

`node test/run-all.js` runs the ten `test/test-*.js` files and `test/sim.js` and passes (about 90 s with several files at a time; `--quick` shortens the two slowest files). `test/test-integration.js` (WP-H) loads all 19 files under the stubs with the software canvas, which throws on any canvas call outside the subset of 13.2, and checks:

- every file present, no sprite of 6.4 missing, nothing drawn or played at load time;
- no network API, remote address or external file in `index.html`, `css/style.css` or any script;
- every sound and track name played by `audio.js` is in `TG.Audio.SFX` or `TG.Audio.TRACKS`;
- boot, title, difficulty select, how to play and play reached with key events through `env.dispatch` and 600 frames through `env.runFrame`, on each difficulty;
- a whole run by the `test/sim.js` bot on each difficulty with `TG.Main.tick`, `TG.Audio.update` and `TG.Render.draw` on every step, with every assertion of 10.3 and no console output (so no placeholder sprite, no unknown sound, track or event);
- pause and resume on `playing`, `bossIntro` and `boss`; a pause during `lifeLost` by Esc, blur and a hidden tab is deferred; pauses are ignored on `levelComplete`; blur and focus on the title and in play; a frame longer than `MAX_FRAME`;
- game over and continue at each of the four checkpoints, the boss included (Baron in the phase reached, boss tempo 184 in phase 3), with lives, score, threats, lock, timed powers and music checked; game over with the countdown running out;
- quit from the pause menu with the Hourglass running and a word locked, then a new run with nothing left over (score, statistics, entities, powers, effects, music); a finished run, high score entry, and a second run to the end;
- options changed on the title and in force after a reload with the same storage; storage missing and storage that throws, through play, quit, results, high score entry and a new run;
- a clumsy player on Easy and Hard (random wrong keys, Backspace, stray jumps and ducks, held duck keys, pauses with random menu keys, blur and focus, long frames, random keys on the results and high score screens), drawn every frame, until the run is over and the title is back.

Screenshots from `tools/shot.js` and `tools/shot-ui.js` were taken across the whole flow (every screen and title panel, each section, each creature and hazard, crates and powers, the boss intro, volleys, both attacks, taunt, recoil, the three phases, the minion, the finisher and the defeat, falls and rescues, game over and continue, both results pages, high score entry) and opened. No sprite was found in the wrong place or facing the wrong way, no text outside the screen (also checked by measuring every `TG.Font.draw` during rendered bot runs on each difficulty), no overlapping plates, and the HUD values matched the state. A short run in a real browser (Chromium, served from localhost) went from boot to results and a high score entry with the real canvas and AudioContext, with no console output, only palette colours on the canvas, only the page, the style sheet and the 19 scripts requested, and scores and settings kept after a reload.

WP-H changed no file of another package. No stand-in was used, so `test/standins/` never existed.

### 14.2 Differences between the delivered code and the text

Extra test-only views, used by tests and tools and never by the game: `TG.Audio._internals`, `TG.Effects._list()`, `TG.Events.FIELDS` (the payload fields of section 8 per event), and `fps` and `names` on every `TG.Sprites.MANIFEST` entry.

**4.4 `TG.Save`.** `load()` without working storage keeps the data in memory (validated); with working storage and no value, or invalid JSON, it gives the defaults. `resetScores()` resets the three tables and the personal bests, keeps settings and assist, and saves. Seeded entries have `cleared: true`. `recordRun` updates the best WPM for every run, including runs ended early.

**4.5 `TG.Difficulty`.** `rank()` returns -1 for an unknown name. `includes(name, undefined)` is true (entries without `min` are used on every difficulty); an unknown name or tag gives false. `wordRange` for a kind without a `wordLen` entry warns once per kind and returns `[2, MAX_WORD_LEN]`. `resolve` warns once per ignored key per call, and returns `get(name)` itself when the tune block has no keys at all.

**4.6 `TG.Words`.** Every word of DESIGN Appendix A is in the pools, in order, except `blackjack` (Hard tier 2), left out as a gambling term (see 14.3). The five 11-letter words of Hard tier 3 are valid but never picked for a threat, because `MAX_WORD_LEN` is 10. `validate()` also reports a Q, X or Z in Medium tier 1 and a sample word that is not in the pools. When the bottom of the length range is lowered (DESIGN 10.4 step 8), the search is made with the recent list first and then without it.

**4.7 `TG.Typing`.** A one-letter word completes on its lock key (result `complete`). On completion the typable keeps `typed` and `errors`; only `ty.target` is cleared. A `type:miss` with nothing locked carries the `x`, `y` and first letter of the typable with the lowest `eta`; `repeat` counts wrong keys since the last correct key or lock change. A target whose own `lost` or `typable` flag changed is released (`gone`) even while still in the list, and a typable with `lost === true` is never a lock candidate. `onDamage` always emits `streak:change`. `peakWpm` is 0 until five words are completed. `create()` without options uses `autoReleaseMisses: 3, streakPenaltySteps: 2`.

**4.8 `TG.Audio`.** The four music channel gains of DESIGN 15.1 feed a music bus at `MUSIC_LEVEL = 0.2` (0.35 before the presentation review), so that the typing sounds sit above the music with browser-normalised pulse waves. The master DynamicsCompressor is a hard-knee limiter (threshold -6 dB, knee 0, ratio 12, attack 3 ms, release 150 ms). The look-ahead is 100 ms and grows to at most 300 ms after long frames. Tempo scale and bass-only are also reset on game over, level complete, results, high score entry, title, the menus and boot. A pause rewinds the sequencer to the first step that has not sounded. The results loop waits for the victory fanfare (10.3 s) or the game over tune to finish. `key_ok` never goes above C7. The boss drums use a combined kick and snare hit on beats 2 and 4. `sfx` accepts a private `opts.at`.

**4.9, 4.10 `TG.Gfx`, `TG.Font`.** The placeholder has an INK fill with the two letters in WHITE. `TG.Gfx.color` gives INK for an index outside 0 to 31; fractional scales are floored; text also accepts scale 3. `TG.Font.SYM.DOWN` is `_`, so game text never contains an underscore (empty initials are shown as `-`).

**4.12 `TG.Input`.** A repeated named key is dropped but still has `preventDefault`, so holding Space does not scroll. `keyup` ignores modifier keys. `bindButton` also blurs the element on focus, blocks the long-press menu and sets `tabindex="-1"`. `TG.Main` also prevents Tab, `'`, `/`, PageUp, PageDown, Home and End, and passes any other key and a click outside the buttons to the boot screen as Enter.

**4.13 to 4.16, 5 (simulation).**
- During a jump `x = jumpX + RUN_SPEED * jumpT` (closed form; added field `player.jumpX`), so a jump from `winStart` lands exactly on the far edge without rounding loss.
- The rescue after a fall is private to `game.js` and runs when the `lifeLost` timer ends; `player.state` stays `rescue` until the first step in which the world moves, so a deferred pause shows the bubble.
- At a checkpoint the bonus is added before the score is banked. The accuracy bonus needs at least one key in the section. `run.sectionLivesLost` is not reset by `continueRun`.
- A level spawn uses the section of its trigger tile for word length and tier mix; the active cap uses Pip's section. Waiting threat spawns are served first in, first out; crates never wait. `resetFrom` drops entries before the checkpoint that never appeared.
- The crate path runs from dx 280 (fully visible) to dx -104. Swoop's entry height, the high-rock path, the crate bob and the hop phase are the engineers' choices. At the minimum Boulder budget the Boulder's left edge starts 3.4 px inside the view, so it gets no `threat:warn` in that case.
- The letter stall is added per correct letter that takes the word past its `bestTyped` (5.3, 4.16). The word score uses the multiplier after that word's own streak update. The close-call bonus applies to threats only. `hazard:hit` carries Pip's position. `hazard:cue` is not emitted when Pip first reaches a window already past its end (only after a rescue).
- The boss intro ends on the Baron's own clock (`boss.stateT`), so a pause does not restart it. The volley's entry actions and its `boss:state` run on the step after the screen becomes `boss`. The second attack of a double is announced when the first spawns, with `telegraph` = `doubleGap` in real seconds. Phase 2 opens with the pickaxe. A completed weak-point word also counts for adaptive pacing (`u` = elapsed / window), and an open weak-point window holds assist increases back. Boss words carry the position of the Baron's head; `boss:throw` carries the start of the rock path.
- Rank (DESIGN 8.6): a run with no letter key pressed ranks C, and S and A need the level cleared, so a run quit from the pause menu ranks at most B.
- The tutorial slow-down (DESIGN 3.5) is given once per tutorial threat and only on `playing`.
- Added state fields, all documented in the file headers: `state.tutorial.enabled`, `state.tutorial.done`, `state.run.bestWpm`, `player.jumpX`, `player.duckBufferT`, `player.fallen`, `threat.contact`, `threat.closing`, `threat.anchorX`, `threat.entered`, `threat.urgentSent`, `attack.dx`, `hazard.struck`, `spawn.tile`, `spawn.section`, `level.lengthTiles`, `level.warnX`, `level.warned`, `boss.introTime`, `boss.entered`, `boss.thrown`, `boss.poseT`, `boss.attackT`, `boss.retryT`, `boss.lastAttack`.

**4.17 to 4.19 and 5.13 (presentation).**
- `TG.Effects.label(id)` also returns `white` (flash the sprite white) and `flinch` (px). The clamp of an off-screen clear is applied to the centre of the sprite box.
- Plates (5.13): each plate has 1 px more INK round it with its border outside that, so the gap between plates is 5 px; plates other than the locked one also keep 3 px from Pip and from the other typables' sprites; the locked plate is placed first, then every plate that fits where it wants to be, then the rest move up in 10 px steps; the lowest `y` is 26, or 37 in the arena, 4 px below the boss bar box. The acceptance rules of 5.13 hold. For `left` and `right` edge tags the plate keeps its normal `y`, clamped. Edge tags have a blinking CORAL chevron on the side of the edge.
- HUD (DESIGN 13): the type bar is drawn at y 195 to 214 with its GOLD border at 194 and 215; the prompt line text is at y 186 and moves right of the key guide (x 90 or more) when the guide is on; the progress strip runs from x 4 to 351 with the crown at (356, 16); banners use 2x text and fall back to 1x for text wider than 360 px, and checkpoint and section banners have a 2x title with a 1x second line; a banner's position (y 60 or 100) is chosen when it appears and changes only if the lock comes under it; a checkpoint banner shows before the section banner queued in the same step. HUD timers do not run while paused.
- The defeat follows DESIGN 11.6, timed on `state.screenT`: the picture freezes for 0.5 s, a 2-frame flash, a minion-size mole spins on the mound while the helmet flies off, it goes down the hole, then the letter fountain. The arena sky darkens one step per phase (DEEP_BLUE, DEEP_BLUE with a PLUM dither, INK with a PLUM dither); the Hourglass sky still takes precedence. `fx_marker` is drawn 4 px below `GROUND_Y`. The hurt frame is always shown while `hurtT > 0` and the invulnerability blink starts after it. Reduce flash also turns off the white sprite flashes.
- The upper row of a gap (between `GROUND_Y` and `GROUND_Y + 16`) is filled INK.

**4.20, 4.21 and DESIGN 12 (screens).**
- The pause box is 256 x 148 with a help line for the selected item, because RESTART FROM CHECKPOINT is 184 px wide at 1x. Esc on the pause menu starts the resume countdown and Esc during the countdown cancels it; RESTART and QUIT ask for a second Enter.
- The difficulty panels show the label, the mascot, the WPM guide, three sample words and the lives as hearts; the meaning of the selected setting is written in plain words under the panels. Typing a whole difficulty name selects it and goes on to How to Play; typing only its first letters selects it.
- Keycaps wider than `key_cap` and `key_wide` (SPACE, ENTER, BACKSPACE) are drawn with rectangles in the sprite's colours. The logo's INK shadow is offset 3, 3 as DESIGN 12 asks.
- On How to Play reached from difficulty select only READY starts the run. On the menus the JUMP button counts as confirm and DUCK as down.
- Game over sends `ui:count` for 9 down to 1 and ends the run at 9 s. Results ignore keys for 0.5 s; the first Enter finishes the tally, the next turns the page. On high score entry, Enter with no letters uses the saved initials and Enter with one or two letters waits; after saving, the title opens on the high score panel with the new entry blinking.

**6.2 to 6.5 (art).** Boss far arm: for poses `raise` and `throw` it uses the same frame as the near arm. The Baron's raised hand is about 20 to 28 px left of and 26 to 34 px above `boss.x, boss.y`, close to the rock launch point. The sunset remap turns FOREST to DEEP_TEAL and PINE to PLUM; the dusk remap turns HAZE to VIOLET. `slowSky` is DEEP_BLUE for sunset and PLUM for dusk, so that the Hourglass sky differs from the top band.

**10.1 `test/stubs.js`.** `window` is a Proxy around the context's global object so that reading `window.localStorage` can throw; `window.TG === TG` holds but `window === globalThis` is false inside the context. A name in `constants` that `TG.C` does not have makes `load` throw.

**10.3, 10.4 `test/sim.js`.** Extra assertions in every run: `budget`, `keep-clear`, `scoring`, `console`, `announce`, `weak-window`. Extra checks: `input-translate`, `input-buttons`, `load-isolated`, `sim-purity`, `init-event`, `no-dodge-actions`, `spawn-onscreen`, `typing-results`, `crate-queue`, `items-shape`, `continue-restore`, `boss-fight`, `boss-continue`, `result-rank`, `tutorial-slowdown`, `adaptive-pacing`. In `no-jump-bridge` the gap fallen into twice is the one at tile 106, not 322, because on Easy lives from checkpoints, score and shields carry Pip through the other gaps; the pass conditions are unchanged. The bot times its first key by the time the key will carry (`state.time + DT`) and waits for the discard window after a lost target.

**13.2 tools.** The software canvas is stricter than the browser in four ways, each of which would make a PNG differ from the browser: a coordinate or size that is not a whole number throws; `drawImage` with scaling throws while `imageSmoothingEnabled` is true; assigning a property outside the subset throws; a negative size throws. `tools/shot.js` and `tools/shot-ui.js` have more options than 13.2 lists (see their headers).

**Play review fixes.** A later review of how the game plays led to these changes. Each is written into the sections named, with a regression check in the test file given.

- Letters typed again after a release (Backspace or auto-release) earn no letter points and no letter stall. Typing a word up to its last letter, pressing Backspace and repeating held a threat back for as long as a fast typist kept it up, against DESIGN 4.4. New typable field `bestTyped` (5.3), set on threats, crates and boss words, written by `TG.Game` (4.16). Check `typing-results` in `test/sim.js`.
- With adaptive pacing off, `newRun` starts at assist 1 instead of the value an earlier run saved, which had kept every later run slow, with lower word scores, for good (4.16, DESIGN 9.3). The run result has a new field `adaptive` (5.11), and `TG.Save.recordRun` stores `assist` only when it is not `false` (4.4), so the learner's saved value survives runs played with the option off. Checks `adaptive-pacing` and `result-rank` in `test/sim.js`; `test/test-core.js`.
- `TG.Input.translate` gives the QWERTY letter of `e.code` for a letter key of a non-Latin layout, which had given no response at all (4.12, DESIGN 2). Check `input-translate`.
- The signposts stand at `hazard.postX` (5.8), the best take-off point, instead of the first pixel of the window. For a gap that pixel is also the earliest take-off that reaches the far side, so a press a few milliseconds before the post fell in, and falls were most of the lives lost by players with ordinary timing. The Easy key prompt appears when the window opens, not 48 px before it. The simulation, the windows and `cue_jump` / `cue_duck` are unchanged. Check `jump-geometry` in `test/sim.js`; `test/test-render.js`.
- `TG.Typing.backspace` (4.7): a Backspace straight after a wrong key keeps the word and its progress; a second one releases. The reflex of correcting a typo with Backspace had thrown away the whole word. `test/test-typing.js`; check `typing-results`.
- Auto-release (4.7, DESIGN 3.3, Easy and Medium): when the wrong keys that caused it spell the start of another word, that word is locked with those letters typed, and their misses are taken back. A player who started typing a second word without Backspace had lost its first two letters to the old lock, as misses, and had to type it again from the start. Hard is unchanged. `TG.Game` pays letter points and stall for each letter such a key typed, and tests every key streak value it passed for a shield (4.16). `test/test-typing.js`; check `typing-results`.
- The picker prefers words not yet returned in the run (4.6, DESIGN 10.4 step 10). Boss rocks, which draw from the same tiers as sections 1 and 2, had brought back level words; with the test bot at the design speed a Level 1 run now shows no word twice (it was 3.1 / 2.9 / 8.7 repeats per run with the rocks counted). `test/test-words.js`.
- Level 1's `tune` block: Medium `react` 1.0 and `perChar` 0.45, Hard 0.6 and 0.27, so that words ask more of players in the middle of each speed range (target bot mean `u` from 0.47 / 0.56 to 0.54 / 0.62 on Medium / Hard, with no damage; floor bots still finish without a continue). Boss health Medium 5 (`coreWords` `[1, 2, 2]`) and Hard 7 (`[2, 2, 3]`), which brings the fight for the target bot from about 101 / 117 s to 88 / 105 s. Recorded in the `Tuning changes` list; the full matrix of `node test/sim.js` passes.

**Presentation review fixes.** A review of the graphics, HUD, screens, audio and browser behaviour led to these changes. Each is written into the sections named, with a regression check in the test file given.

- Focus (DESIGN 2, 12; 4.20, 4.21, 9.2). A blur or hidden tab during the 1.5 s resume countdown had let play restart with no keyboard focus, and on game over the continue countdown ran out while the player was in another window. New `TG.UI.onFocusLost()` and `TG.UI.onFocusGained()`, called by `TG.Main`: the resume countdown goes back to the pause menu, and the continue countdown runs on a clock of its own that stands still until the focus returns. `test/test-ui.js`.
- Audio unlock (4.8, 4.21). `TG.Audio.isUnlocked()` was true as soon as an AudioContext existed, so after a first input that is not a user gesture (Esc, a touch `pointerdown`) nothing tried again and Safari stayed silent for the session. It is now true only while the context is `'running'`, and `TG.Main` calls `unlock()` on every key except Esc and on `pointerdown`, `pointerup`, `touchend` and `click` until it runs. `TG.Input.onFirstInput` is unchanged. `test/test-ui.js`, `test/test-audio.js`.
- Touch without a keyboard (DESIGN 2; 4.20, 4.21). A player with only the JUMP and DUCK buttons reached How to Play and could go no further, with no explanation. After a touch press with no key seen, boot, title and How to Play say "SPELL RUNNER NEEDS A KEYBOARD." (How to Play: "CONNECT ONE, THEN TYPE READY."), through the new `TG.UI.setKeyboardHint(flag)`; the first key removes it. `test/test-ui.js`.
- Layout (DESIGN 2, 14.1; 4.21, 13.1). `TG.Main.frame` redoes the layout when `devicePixelRatio` changes without a resize event (a window moved between screens). `layoutFor` has a step 3: a short, wide window whose scale would be below 2 puts the buttons at the sides when that shows the canvas larger (a phone held sideways: 1.58x instead of 1.25x). `test/test-ui.js`.
- The arch (DESIGN 5, 12, 13.4). The one hazard that needs duck held was taught nowhere: a tapped duck clears it only by luck, and most first-time players took an unexplained hit. A GOLD "HOLD" stands above its chevron on every difficulty; on Easy it always gets the ENTER key prompt with HOLD, and while that keycap shows (Pip from `winStart` to `holdUntil`, on `playing` or `lifeLost`) the sign over the arch is not drawn, since the two overlapped as the arch scrolled in (final regression check) (`TG.Level.build` sets `prompt` for an arch when `keyPrompts > 0`; `prompt` is read only by the presentation); How to Play says "HOLD FOR ARCHES"; the tip after an arch hit, also one a shield took (`hazard:hit`), is "TIP: HOLD ENTER UNDER THE ARCH". `test/test-render.js`.
- How to Play (DESIGN 12) says "BACKSPACE: LETS GO OF A WORD. MISTAKES NEED NO FIXING.", after the Backspace change of the play review. `test/test-ui.js`.
- Letters and popups (DESIGN 4.6; 4.17). The letters of a cleared word were drawn over every plate and popup, so for a few frames they covered the plate the player had just locked and made the score and CLEAN / SUPER popups unreadable. They stay screen-space effects, but while a letter is in the playfield (`y >= PLAY_TOP`) `TG.Effects.draw(ctx, 'world')` draws it first, before the other world effects, so it passes under the popups and under the plates; above the playfield it is drawn over the HUD as before. The letters of a boss word stay over the HUD, because the boss plate is part of it. `test/test-render.js`.
- Power names. The pickup popups say HOURGLASS and GOLDEN QUILL, the names of How to Play (they said SLOW TIME and GOLD QUILL). `test/test-render.js`.
- Key guide (DESIGN 13.4). The next key was a box in its finger colour, which merged with the keys above and below it on the same finger. It is a WHITE block with an INK letter, flashing RED after three wrong keys. `test/test-render.js`.
- Top bar (DESIGN 13.2). The SH label is gone (the shield icons follow the lives under PIP); COMBO shows the multiplier and a row of pips for the clean words of its step instead of a second number; the power timer is a gauge beside the slot (x 381 to 382, y 2 to 15) instead of a bar beside the crown, and the empty slot is dimmed. `test/test-render.js`.
- Results (DESIGN 8.8). A run with no letter key pressed shows "---" for ACCURACY and KEYS TO PRACTISE (in SILVER) instead of 100% and a green NONE. `test/test-ui.js`.
- Pause and game over (DESIGN 12) dither from y 23 (y 31 in the arena), so the top bar and the boss bar stay readable; the GAME OVER letters still drop in from above. `test/test-ui.js`.
- Tree crowns (DESIGN 5; 6.4). The branch and the arch hung from bare trunks that ran up to the HUD. A new sprite `haz_canopy` (48 x 16, FOREST and PINE, with the section's remap) covers the top of the trunk: centred on a branch, and one across the arch. The manifest has 93 entries (66 of owner D). `test/test-sprites-world.js`, `test/test-render.js`, `test/test-core.js`.
- Arena (14.2 above): plates stay at `y >= 37` (the lowest plate had sat 2 px under the BARON box and read as part of it), and the phase 3 sky is INK with a PLUM dither (a PLUM sky hid the far hills, which the dusk remap makes PLUM, and left their ridge line floating). `test/test-render.js`.
- Sound effect voices (DESIGN 15.1). With three voices and the oldest taken over, the sounds of one step all took over the same voice and a sound timed for later held a voice while it waited, so crate clears, extra lives, power-ups and streak steps lost their sounds (the review measured, over nine bot runs, 47 word_clear, 27 streak and 9 of 18 power_get sounds heard for less than 20 ms). Voices keep 3; a takeover now goes by priority and then by allocation order, the sounds that repeat all the time never take over a reward and are left out instead, and a sound with `opts.at` beyond the look-ahead takes its voice when `update` starts it. The power sound of a crate plays 0.48 s after its word, after `crate_break`. Measured the same way afterwards, one word_clear and no other reward sound was cut. `test/test-audio.js`.
- Balance (DESIGN 15.1). `MUSIC_LEVEL` 0.35 to 0.2: key_ok had been about 3 dB below the level music. A new check compares key_ok with the whole level and boss mix. `test/test-audio.js`.
- Section key (DESIGN 15.2; 7.3). word_clear, streak, checkpoint, one_up and ink_drop follow a major section's `keyOk.root`, so section 3 no longer plays C major arpeggios over A major music. `test/test-audio.js`.
- key_bad (7.1). A second `type:miss` within 20 ms plays nothing: the key that triggers auto-release emitted two, and the two identical sounds added up to twice the level. `test/test-audio.js`.
- Quit (7.3). QUIT from the pause menu during `jingle_ready` or `jingle_checkpoint` stops the jingle and the duck, which had finished over the results music. `test/test-audio.js`.
- Original figures (DESIGN 15.2). one_up, ink_drop and start had matched the Super Mario Bros. 1-up and coin figures note for note. one_up is C6 C6 G6 G6 C7 then a held E7; ink_drop a rising fifth (120 ms) that steps up the pentatonic in a chain of drops; start G5 then a held G6. `test/test-audio.js`.

### 14.3 Left for the lead

Decisions:

1. `blackjack` is left out of Hard tier 2 (a gambling game). Restore it, or remove it from DESIGN Appendix A; `test/test-words.js` records the exclusion.
2. `peakWpm` is 0 until five words are completed, so a very short run shows PEAK WPM 0. A fallback (for example `peakWpm = wpm` below five words) would read better.
3. The best WPM is recorded for every run, including a short run ended from game over; a minimum number of words may be wanted.
4. The rank rules for a run with no keys (C) and for a run quit from pause (at most B) were decided by WP-E; confirm them.
5. Pacing at the design speed is gentle: the mean window use `u` of the target bot was 0.40 / 0.45 / 0.54 against the expected 0.75, and the target and fast bots take no damage. The boss fight took 72 / 105 / 122 s against the expected 75 / 95 / 100 s. Level 1's `tune` block now tightens Medium and Hard within the limits of 12.1 and removes one weak-point word from each of those fights (14.2, play review fixes): `u` is about 0.43 / 0.54 / 0.62 and the fight about 70 / 88 / 105 s. Going further (the 25% limit, or higher extra-life thresholds, which are not tunable keys) is a decision for the lead; generous lives serve players who are still learning.
6. Hard cannot be finished at 15 to 20 WPM, even with unlimited continues; it can at 25 WPM. This is below Hard's floor speed of 35 WPM, so it meets the design, but the "TRY EASY?" offer of DESIGN 18 would help such a player.
7. `RECENT_WORDS` is 20. The figures first given here (a word at most twice, 0.9 / 0.5 / 2.1 repeats per run) counted threat and crate words only; with boss rocks counted a run had 3.1 / 2.9 / 8.7 repeats with the target bot, and a word could appear three times. The picker now prefers words not yet used in the run (14.2), and a Level 1 run shows no word twice unless continues use up a tier.
8. `BOULDER_MIN_BUDGET` 4.46 or more would start every Boulder fully outside the view (see 14.2).
9. `LEVEL_COMPLETE_TIME` is 4 s while the victory fanfare lasts 10.3 s; the results loop waits for the fanfare, so the results screen starts while it is still playing.

Checks in a real browser (the manual items of section 12), with these points worth a close look:

- the sound balance (`MUSIC_LEVEL` in `js/audio.js` is the single value to change; it is 0.2 after the presentation review, from a measurement of the node graph, not by ear), `key_ok` rising per letter, `key_bad` quieter;
- a full level on each difficulty at full speed, including the waiting-at-the-edge behaviour and untyped threats reaching Pip (13.5);
- opening `index.html` by double-click (`file://`), the scaling at 1920 x 1080, 1366 x 768 and 1280 x 720 and on a screen with 2 device pixels per CSS pixel, and the CRT overlay;
- music after switching to another window and back, on the title and in play;
- the flying letters of a cleared word now pass under the plates and the popups (14.2, presentation review fixes); worth a look at full speed;
- touch devices: the keyboard note, and audio starting after a first tap or Esc in Safari (macOS, iOS, iPadOS), which the stubs cannot check;
- the WARNING banner blinks its text on an INK strip at 4 Hz, so for half of each blink the strip is empty.
