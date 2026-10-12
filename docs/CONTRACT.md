# SPELL RUNNER: Technical Contract

Version 1.1. Read `docs/DESIGN.md` first. This file defines how the code is divided and how the parts fit together. Work packages are built in parallel by engineers who cannot talk to each other, so every name, signature and data shape here is binding. If something you need is not defined here, keep it private to your own module.

Numeric tuning values are treated differently from names and shapes. The values in section 5.10 and the level timelines in DESIGN 11 and 11A are starting values; section 12.1 says who may change them and how. Section 12.2 lists the Tier 2 features that may be left out, with the fallback for each.

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
| 14 | `js/levels/level2.js` | Lead | `TG.Levels[2]` |
| 15 | `js/game.js` | WP-E | `TG.Game` |
| 16 | `js/effects.js` | WP-F | `TG.Effects` |
| 17 | `js/hud.js` | WP-F | `TG.Hud` |
| 18 | `js/render.js` | WP-F | `TG.Render` |
| 19 | `js/board.js` | Lead | `TG.Board`: world scores, the one file that makes network requests (section 4.22) |
| 20 | `js/ui.js` | WP-G | `TG.UI` |
| 21 | `js/main.js` | WP-G | `TG.Main` |
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
| | `test/test-board.js` | Lead | `TG.Board` with a stand-in network function and a clock under the test's control |
| | `test/test-board-server.js` | Lead | The game and the world scores service together, without a network: `TG.Board`'s requests are passed to the Worker's fetch handler |
| | `server/` (`src/worker.js`, `src/blocklist.js`, `schema.sql`, `wrangler.toml`, `package.json`) | Lead | The world scores service, a Cloudflare Worker with a D1 database. Never loaded by `index.html` |
| | `test/test-server.js` | Lead | Tests for the service |
| | `tools/png.js`, `tools/softcanvas.js`, `tools/sheet.js` | WP0 | Headless drawing tools (section 13.2) |
| | `test/test-tools.js` | WP0 | Tests for the three WP0 tools |
| | `tools/shot.js` | WP-F | Screenshots of a bot run (section 13.2) |
| | `tools/shot-ui.js` | WP-G | Screenshots of the interface screens (section 13.2) |
| | `test/test-level1-pixels.js` | Lead | The Level 1 pixel regression: three seeded runs played through `tools/shot.js`, each frame compared pixel for pixel with its reference in `test/fixtures/level1-pixels/` |
| | `test/fixtures/` | Lead | Recorded data that tests compare the game with. `level1-events.json`: the boss and spawn events of one seeded Level 1 run, read by the `level1-events` check of `test/sim.js`. `level1-pixels/`: 36 reference frames of Level 1, 384 x 216, read by `test/test-level1-pixels.js`. `save-before-level2.json`: two save records as the game stored them before Level 2, read by `test/test-core.js`, `test/test-ui.js` and `test/test-integration.js`. Never loaded by `index.html` |
| | `README.md` | WP-H | How to start and play the game, run the tests and add a level |
| | `docs/DESIGN.md`, `docs/CONTRACT.md` | Lead | |
| | `docs/LEADERBOARD.md` | Lead | The agreement between the world scores service and the game |
| | `docs/LEVEL2.md` | Lead | The plan for Level 2, CLOCKWORK CAVERNS, with its build record (13.8) |

**Script load order.** `index.html` loads the 21 JavaScript files with classic `<script src>` tags in the numbered order above, at the end of `<body>`, followed by one inline script:

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
<script src="js/levels/level2.js"></script>
<script src="js/game.js"></script>
<script src="js/effects.js"></script>
<script src="js/hud.js"></script>
<script src="js/render.js"></script>
<script src="js/board.js"></script>
<script src="js/ui.js"></script>
<script src="js/main.js"></script>
<script>TG.Main.init();</script>
```

No `type="module"`, no `defer`, no `async`, with one exception: after the inline script the page may load Cloudflare Web Analytics (`https://static.cloudflareinsights.com/beacon.min.js`, a module script with a `data-cf-beacon` token). It is the only outside script; `test/test-ui.js` and `test/test-integration.js` allow exactly that tag. The page loads nothing from the network: no fonts, images, audio files or analytics. The only network requests the game ever makes are those of `js/board.js` to the world scores service (rule 10 of section 2.2 and section 4.22), and with `TG.Board.URL` empty there are none. The repository holds the address of the live service (section 4.22).

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
4. **Simulation modules** are `core.js`, `words.js`, `typing.js`, `input.js` (its queue), `entities.js`, `level.js`, `boss.js`, `levels/level1.js`, `levels/level2.js` and `game.js`. They:
   - never use `Math.random`, `Date`, `performance.now`, timers or the DOM;
   - take all randomness from `state.rng`;
   - never call `TG.Audio`, `TG.Gfx`, `TG.Font`, `TG.Effects`, `TG.Hud`, `TG.Render`, `TG.UI` or `TG.Main`. They communicate outward only by mutating state and emitting events.
5. **Presentation modules** are `audio.js`, `gfx.js`, `font.js`, `effects.js`, `hud.js`, `render.js`. They read state and subscribe to events. They never mutate the game state, never emit simulation events and never use `state.rng`. For their own randomness they create a private generator with `TG.RNG.create(seed)`.
6. **Missing modules must not throw.** Presentation code that calls an optional module guards the call, for example `if (TG.UI && TG.UI.draw) TG.UI.draw(ctx, state)`. This lets each work package load its files, and each presentation package run its tests, with only `core.js` and its own files present. Running the simulation (WP-E) also needs `words.js` and `typing.js`; section 12.0 gives the build order that provides them.
7. **Language level.** ES2020 syntax is allowed (`let`, `const`, arrow functions, classes, template strings, spread, optional chaining). No ES modules, no top-level `await`, no `import`/`require` in files under `js/`.
8. **Identifiers use American spelling** where the platform does (`color`, `center`), to match the Canvas API.
9. **Errors.** Public functions validate their arguments only where this contract says they throw. Presentation failures (missing sprite, unknown sound name) warn once with `console.warn` and continue. A name that a level's data leaves out is not a failure: the default of section 5.9 stands in for it and nothing warns. Two names from the level data may also be unknown without a warning: a `boss.kind` that a presentation table does not list is drawn and heard as the Baron (sections 4.17, 4.19 and 7.1), and a `theme.music.ready` that is not a track of `TG.Audio.TRACKS` gives `jingle_ready` (section 7.2), because a level's own ready jingle is Tier 2.
10. **Network.** `js/board.js` (world scores, section 4.22) is the one module that makes network requests, and it makes them only to `TG.Board.URL`. It is neither a simulation nor a presentation module. It never touches the window, the document, storage, timers or the clock: `TG.Main` hands it the browser's `fetch`, bound to the window, and a clock, through `TG.Board.init`. No other file under `js/` calls `fetch` or any other network API, and the only remote address under `js/` is the value of `TG.Board.URL` (empty, or an `https` address ending in `.workers.dev`). The simulation modules never call `TG.Board`; `TG.UI` and `TG.Main` do, with every call guarded as in rule 6. `test/test-integration.js` checks this rule statically.

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
  FLY_HIT_ELEV: 12,       // elevation at which Swoop and Flit end their dive, px
  DANGLE_ELEV: 20,        // elevation at which Dangle hangs, px
  DANGLE_DROP_T: 0.2,     // t by which Dangle has dropped from the roof to DANGLE_ELEV
  DANGLE_CLEAR: 128,      // Dangle's anchor is at least this far from the box of a branch, beehive or arch, px
  FLIT_ENTER_T: 0.15, FLIT_CROSS_T: 0.55, FLIT_BEHIND_T: 0.70,   // t at which Flit's enter, cross and behind phases end; the dive ends at t = 1
  FLIT_FROM_DX: 150, FLIT_BEHIND_DX: -72,     // dx at which Flit comes in, and of its hover point behind Pip, px
  FLIT_CROSS_ELEV: 100, FLIT_BEHIND_ELEV: 80, // elevation at which Flit crosses over Pip, and from which it dives, px
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
  WATCH_TIME: 3, WATCH_SCALE: 0,          // the Pocket Watch stops the world (LEVEL2 6.3)
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
                                        // A result with adaptive === false (adaptive pacing off) leaves the saved assist as it was.
                                        // A result with cleared === true raises the `cleared` setting of the difficulty to result.levelId
TG.Save.resetScores() -> void           // the tables and the bests only: the settings, the `cleared` numbers among them, are kept
TG.Save.levelOpen(levelId) -> boolean   // level 1: true. Level 2: true once level 1 has been cleared on any difficulty (section 5.12)
TG.Save.pending() -> { difficulty, entry } | null   // a copy of the pending entry (section 5.12)
TG.Save.setPending(difficulty, entry) -> boolean    // keeps the entry when its score would reach the table, and saves; false, with nothing kept, when not
TG.Save.clearPending() -> void          // forgets the pending entry and saves; writes nothing when there is none
TG.Save.enterPending() -> { difficulty, pos } | null   // adds the pending entry to its table under settings.initials, forgets it and saves;
                                        // null when there was none or its score no longer reaches the table
```

- Every storage access is inside `try/catch`, including the first read of `root.localStorage`, which throws in some browsers when storage is blocked. If storage is missing, throws, or holds invalid JSON, the module works from memory and never throws.
- `TG.Save` works before `init` and before `load` are called (memory only, default data). The headless harness calls neither, so a headless run always starts from default settings and an assist of 1.
- Saving assist between runs is Tier 2. If it is left out, `assist()` returns 1 and `recordRun` does not store the value.
- **What `load` reads.** `load()` builds valid data from whatever is stored: a field that is missing or of the wrong kind takes its default (section 5.12), and a setting this version does not know is kept as it is when it is a boolean, a string or a number. A stored record whose `version` is not 1 is read as empty: `load()` gives the default data.
- **The unlock.** A level is open once the level before it has been cleared on any difficulty: `levelOpen(n)` is true for level 1, and for a later level when the highest of the three `cleared` settings is at least `n - 1`. It is false for a number that is not a level; the game has levels 1 and 2. The highest level the save knows is `LAST_LEVEL` in `js/core.js`, 2: it is the upper end of `lastLevel` and of the three `cleared` settings, and `levelOpen` and `recordRun` take no level above it, whatever `TG.Levels` holds, so a later level raises it. `recordRun` raises the `cleared` setting of `result.difficulty` to `result.levelId` when `result.cleared` is true, and never lowers it. Everything `recordRun` writes is a highest value or a state, so recording a run again at the end of a later stage counts nothing twice. For a record stored without any of the three `cleared` settings, `load()` sets them from the dated entries of the tables (section 5.12).
- **The pending entry** is the table entry of a run that went on to the next stage where it would otherwise have been entered (LEVEL2 12.6). `TG.UI` sets it at NEXT STAGE, clears it when a run starts and when the title screen is reached, and calls `enterPending()` from `TG.UI.init` (section 4.20): an entry that is still stored when the game starts belongs to a run that never ended in the game, such as one in a tab that was closed. `setPending` does not use the entry's `name`; `enterPending` gives it the `initials` setting. `resetScores` leaves the pending entry as it is.
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
TG.Words.POOLS        // { easy: { 1: [...], 2: [...], 3: [...], boss: [...], finisher: [...], flavour: {...} }, medium: {...}, hard: {...} }
                      // flavour is optional: { flavourName: { 1: [...], 2: [...], 3: [...] } }, extra words per tier for one word flavour.
                      // Every difficulty has one, `clockwork`, the words of Level 2. Level 1's flavour, `meadow`, has no lists:
                      // its meadow words are already in the tiers.
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

The `clockwork` flavour is `docs/LEVEL2.md` Appendix A, used as given: 251 words, with no list for Easy tier 1, where the level's home-row words are already in the tier. `validate()` holds a flavour list to every rule of its tier except the last two: the 45 words and the 8 first letters are asked of the five pools of a difficulty, not of a flavour list.

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
   - Candidates are typables with `typable === true` and `typed === 0` whose word starts with `ch`. Choose the lowest `priority`, then the lowest `eta`, then the lowest `id`. Set the lock, `typed = 1`, record `firstKeyAt`, emit `target:lock` then `type:hit` with `index: 0`. If the word has one letter it is complete (not used in either level: no pool has a word of one letter). Result `lock`.
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
TG.Audio.sfx(name, opts) -> void      // opts: { step: 0.., pan: -1..1, duration: s }. No-op when locked or when sound effects are off.
                                      // Further options, each read by the sounds that use it (section 7.1): variant (the `from` of a threat for
                                      // warn; a boss kind for the boss sounds, which then play that boss's recipe), tock: boolean (watch_tick),
                                      // high: boolean (count_tick), at: the time on the audio clock at which the sound starts
TG.Audio.music(name, opts) -> void    // name: a looping track, or null to stop. opts: { transpose: semitones, tempo: bpm, restart: boolean,
                                      // p2Octave: semitones added to the notes of pulse 2 }
                                      // Calling with the track already playing changes transpose, tempo and p2Octave at the next bar without restarting, unless restart is true
TG.Audio.jingle(name) -> void         // plays once; a looping track is ducked to 30% while it plays
TG.Audio.setTempoScale(f) -> void     // multiplies the current tempo (Hourglass: 0.75)
TG.Audio.setBassOnly(flag) -> void
TG.Audio.setEnabled(kind, flag) -> void   // kind: 'music' | 'sfx'
TG.Audio.suspend() -> void            // suspends the AudioContext: all sound stops. Called by TG.Main when the window loses focus or the tab is hidden
TG.Audio.resume() -> void             // resumes the AudioContext. Called by TG.Main when the window has focus again. No-op before unlock
TG.Audio.update(dt) -> void           // called by TG.Main once per displayed frame. Runs the sequencer's 100 ms look-ahead and the sounds that follow
                                      // the game frame by frame: the urgent tick, the Pocket Watch's tick and the three clicks of Lady Ratchet's
                                      // long intro (section 7.1). No timers are used
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
- Character set: `A-Z 0-9 . , ! ? : ; ' " - + / % ( ) = * #`, the copyright sign `©` and space.
- Special glyphs are reached through `TG.Font.SYM`, which maps names to the single characters that stand for them:

```js
TG.Font.SYM = { UP: '^', DOWN: '_', LEFT: '<', RIGHT: '>', CHEV_UP: '{', CHEV_DOWN: '}',
                HEART: '@', STAR: '&', DROP: '$', BLOCK: '|', RETURN: '~', COPY: '\u00a9' };
```

- `COPY` is the copyright sign itself (U+00A9), so text may contain `©` directly; the scripts write it as `'\u00a9'` and stay ASCII. Its glyph is a ring with a small C inside. The other names stand for spare ASCII characters.
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

`semicolon` is the one queued key with no action in `TG.UI`: the menus ignore it. On the two "any key" screens (boot and the goodbye panel) `TG.Main` passes it on as an Enter press (4.21), so it counts there like every other key.

### 4.13 `TG.Entities` (entities.js, WP-E)

```js
TG.Entities.KINDS                        // table, section 5.4
TG.Entities.createPlayer(config, x) -> player
TG.Entities.pressJump(state) -> void     // starts the jump buffer
TG.Entities.pressDuck(state) -> void     // starts or restarts a slide
TG.Entities.releaseDuck(state) -> void
TG.Entities.updatePlayer(state, wdt, dt) -> void
TG.Entities.spawn(state, spec) -> entity | null
   // spec: a level spawn entry (section 5.9) or { kind, from, power, tutorial, intro, section, skin }.
   // section: the section index whose word range and tier mix are used (default: state.section). skin: a sprite name,
   // kept on the entity as `skin` (section 5.5); the boss gives one to its minion (section 5.7).
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
   // Does nothing on a step on which the world does not move (wdt is not above 0); see "The level waits with the world" below.
   // Otherwise, in order: section change (emits section:enter), checkpoint crossing (emits checkpoint), spawn triggers and retries
   // (left out while state.power.watchT > 0), hazard cues (emits hazard:cue) and the boss warning (emits boss:warning),
   // arena start (clears threats with reason 'flee', sets the screen to bossIntro).
TG.Level.resetFrom(state, checkpointIndex) -> void
   // Re-arms spawns with x >= the checkpoint, restores ink drops with x >= the checkpoint, clears hazard `cued` and `passed`
   // flags from the checkpoint on. Keeps `bridged` and `falls`.
TG.Level.makeItems(level, fromX) -> item[]          // ink drop items (section 5.14) at or after fromX, sorted by x
```

`section:enter` is emitted by `TG.Level.update` when Pip crosses into a new section. At the start of a run, after a continue and at the start of the next stage it is emitted by `TG.Game` (section 4.16), because no boundary is crossed then.

**The level waits with the world.** On a step on which the world does not move, `update` returns at once. `TG.Game` calls it on `playing` only, where such a step is one that a Pocket Watch holds (section 4.16, step 3). Everything `update` does follows Pip's x and not the world step. Without this rule, what Pip passed on the step the watch began, and what a rescue from a fall carries him past while a watch runs, would happen with the world stopped. It happens on the first step the world moves again: a section change, a checkpoint, a spawn, a cue, the boss warning, the arena start. The spawn step has a rule of its own: it is left out while `state.power.watchT > 0`. On the held steps that changes nothing; it covers the step the watch begins on, on which the world still moves and the crate has just been typed. So nothing new appears from the key that finishes a watch crate until the watch has ended.

### 4.15 `TG.Boss` (boss.js, WP-E)

```js
TG.Boss.create(state) -> boss            // also sets state.boss; phase from state.checkpoint.bossPhase; kind from state.level.boss.kind,
                                         // 'baron' when the level names none
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
   // levelId: a key of TG.Levels, 1 or 2; throws when there is no such level.
   // Defaults: levelId 1, seed 1, adaptive from the `adaptive` setting (true if unset), assist = TG.Save.assist(difficulty) when
   // adaptive is true and 1 when it is false (DESIGN 9.3), tutorial = config.tutorialAlways || !TG.Save.getSetting('tutorialDone').
   // The tutorial slow-down applies only in a level with tutorial: true (section 5.9).
   // TG.Save is only read here, the bests of the difficulty among what is read (state.run.bestWpm, state.run.bestScore).
   // The simulation never writes to TG.Save.
   // state.config = TG.Difficulty.resolve(difficulty, TG.Levels[levelId].tune).
   // The picker is TG.Words.createPicker(difficulty, state.rng, { flavour: level.theme.wordFlavour }).
   // Builds the level, player, picker and typing engine, sets screen 'playing' without checking the transition table.
   // Emits, in this order: screen:change, level:start with continued: false, section:enter for section 0.
TG.Game.step(dt) -> void                 // advances one step if state.screen is in SIM_SCREENS; otherwise returns at once without draining input
TG.Game.isSimScreen(name) -> boolean
TG.Game.canGo(from, to) -> boolean       // transition table, section 9
TG.Game.setScreen(name, data) -> boolean // checks canGo; sets state.screen, state.screenT = 0, state.screenData = data || null; emits screen:change. False (and a warning) if not allowed.
                                         // Entering 'bossIntro' ends a Pocket Watch that is still running, with no event ("Timed power-ups" below)
TG.Game.pause() -> boolean               // from playing, bossIntro or boss: stores resumeTo, goes to 'paused', returns true.
                                         // From lifeLost: sets state.pausePending = true and returns false (section 9.2). Elsewhere: false
TG.Game.resume() -> boolean              // from paused: returns to resumeTo
TG.Game.continueRun() -> boolean         // from gameOver or paused: DESIGN 6 "Continue". Goes to 'playing', or 'bossIntro' at the boss checkpoint. See below
TG.Game.nextStage() -> boolean           // from results, when state.result.cleared and TG.Levels[state.levelId + 1] exists: the same run goes on
                                         // into that level (LEVEL2 12.2). Goes to 'playing' and emits screen:change, level:start with
                                         // continued: false, section:enter for section 0. Elsewhere: false, and nothing changes. See below
TG.Game.endRun() -> boolean              // from gameOver or paused: builds state.result with cleared: false, goes to 'results'
TG.Game.addScore(points, info) -> void   // info: { reason, x, y }. Adds, checks extra-life thresholds, emits score:add
TG.Game.addLife(cause) -> boolean        // false at MAX_LIVES
TG.Game.applyPower(power, x, y) -> void  // 'shield' | 'hourglass' | 'quill' | 'blast' | 'cap' | 'watch'
TG.Game.snapshot() -> object             // JSON-safe summary for tests, section 10.4
```

**Order of work inside `TG.Game.step(dt)`.** This order is fixed so that runs are reproducible.

1. Return if `state.screen` is not a sim screen.
2. `state.frame++`, `state.time += dt`, `state.screenT += dt`. The scene clock takes the same step, `state.sceneTime += dt`, except while `power.watchT > 0`. A `lifeLost` screen does not hold it.
3. Work out `state.timeScale` (section 11.3) and `wdt = dt * state.timeScale`. `wdt` is 0 while the screen is `lifeLost`, and while a Pocket Watch runs, when `timeScale` is 0.
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
9. Power-up timers ("Timed power-ups" below), tutorial slow-down, adaptive pacing, camera.
10. `state.worldTime += wdt`.

**Applying a typing result** (step 5, `char`):

- Result `lock`, `hit` or `complete`: the letter scores `PTS_LETTER` (twice that with the Golden quill) and a moving threat's clock gets the letter stall (`toWs(config, config.letterStall)` added to `stallT`), but only when the letter takes the word past its `bestTyped` (section 5.3), which is then raised to `typed`. A letter typed again after a release earns neither. When one key has typed several letters (a run replayed after an auto-release, 4.7), each letter past `bestTyped` earns both.
- Result `complete` on a threat or crate: `TG.Game` scores the word, calls `TG.Entities.remove(state, entity, 'cleared')`, emits `word:clear` with cause `typed`, and for a crate calls `applyPower`. The close call of a threat (`eta < CLOSE_CALL_TIME`: `close` in the payload, and `PTS_CLOSE`) also needs `timeScale > 0`: none is given on a step a Pocket Watch holds the world.
- Result `complete` on a boss word (kind `core` or `finisher`): `TG.Game` does **not** emit `word:clear`. It calls `TG.Boss.onWordComplete(state, word)`, which moves the boss to `recoil` (emitting `boss:hit`) or to `defeated` (emitting `boss:defeat`). Presentation modules recognise a completed boss word by `type:hit` with `complete: true` and kind `core` or `finisher`.
- Shield for a key streak: after every result of type `lock`, `hit` or `complete`, if `stats.keyStreak > 0` and `stats.keyStreak % config.shieldKeyStreak === 0` and `power.shield < MAX_SHIELD`, then `power.shield++` and `shield:gain` is emitted with cause `streak`. When the key added more than one correct key (a replayed run), each `keyStreak` value it passed through is tested the same way.

**Timed power-ups** (`applyPower` and step 9). `applyPower` with `hourglass`, `quill` or `watch` sets the power's timer to its whole time (`power.slowT = HOURGLASS_TIME`, with `slowScale = HOURGLASS_SCALE`; `power.quillT = QUILL_TIME`; `power.watchT = WATCH_TIME`), sets `power.last` to the power's name and emits `power:start`. A power typed while it is running starts its time again. The three timers count down in real seconds in step 9. Each ends with `power:end`, and `power.last` then goes to a timed power that is still running, the watch before the Hourglass before the quill, or to `null`.

The Pocket Watch (LEVEL2 6.3). While `power.watchT > 0` the freeze factor of `timeScale` is `WATCH_SCALE`, which is 0, so `wdt` is 0: nothing in the world moves, ages or appears (steps 7 and 8), the level waits (section 4.14), and typing goes on. The crate is typed in step 5, after the step's `timeScale` has been worked out, and the timer first counts down in step 9 of that same step. So the world still moves on the step the watch is typed, and stands still for the 179 steps after it (2.983 s). While a watch runs the Hourglass's timer stands still, so that a watch does not use up the Hourglass's time, and so does `player.invulnT` (section 5.2); the quill's timer keeps counting, since points are still being scored. A watch ends in one of three ways: its time runs out, with `power:end`; `continueRun` sets `watchT` to 0; or `setScreen('bossIntro')` ends it as Pip reaches the arena. The last two emit no event. No step runs on the `paused` screen, so a watch waits there with its time left; `endRun` from the pause menu leaves the timers as they stand, in a run that is over.

**`continueRun`**, in order:

1. `run.continues++`, `checkpoint.continuesHere++`, adaptive pacing eases (DESIGN 9.3).
2. `TG.Entities.clearAll(state, 'flee')`.
3. `TG.Typing.release(ty, 'screen')` if a word is locked. Typing statistics are kept.
4. Score, ink and `nextLifeAt` return to the values in `state.checkpoint`. Lives return to `config.lives`.
5. Timed power-ups end without events: `power.slowT = 0`, `power.quillT = 0`, `power.watchT = 0`, `power.last = null`, `slowScale = 1`. `power.shield` is kept. `tutorScale = 1`, `finisherScale = 1`, `pausePending = false`.
6. `TG.Level.resetFrom(state, checkpoint.index)`. The player is rebuilt at `checkpoint.x` in state `run`; the camera is set to its target.
7. At the boss checkpoint: `TG.Boss.create(state)` with the stored phase, and the screen becomes `bossIntro`. Otherwise the screen becomes `playing`.
8. Emits, in this order: `screen:change`, `game:continue`, `level:start` with `continued: true`, `section:enter` for the section of the checkpoint (index 3 at the boss checkpoint).

**`nextStage`** works on the state of the run, as `continueRun` does: `TG.Game.state` stays the same object. It returns false and changes nothing unless the screen is `results`, `state.result.cleared` is true and `TG.Levels[state.levelId + 1]` exists. In order:

1. The level: `levelId` goes up by 1, `config = TG.Difficulty.resolve(difficulty, the level's tune)`, `pace = config.pace`, and the level is built. A new picker with the level's word flavour is made on the run's generator, `state.rng`, which is not seeded again. `entities = []`, `items = TG.Level.makeItems(level, 0)`, `boss = null`, `section = 0`.
2. A new player at the level's first checkpoint, with `config.lives`; the camera is set to its target. `power.shield = 0`.
3. Timed power-ups end without events, as on a continue: `power.slowT = 0`, `power.quillT = 0`, `power.watchT = 0`, `power.last = null`, `slowScale = 1`. `tutorScale = 1`, `finisherScale = 1`, `resumeTo = null`, `pausePending = false`; `lifeLost` and `tutorial` return to their starting values, and the tutorial slow-down is off for the stage.
4. `nextLifeAt` is raised by `config.extraLifeEvery` until it is above the score, so the next extra life is due at the first threshold above the carried score. The end-of-stage bonuses are added without the test for extra lives (section 5.11), and a threshold they passed is not paid later.
5. `state.checkpoint = { index: 0, x: the first checkpoint's x, score, ink, inkTotal, nextLifeAt, bossPhase: 1, continuesHere: 0 }`, with the values the run carries: a continue in the new level returns to them.
6. `TG.Typing.sectionReset(ty)` and `run.sectionLivesLost = 0`, so that the bonuses of the level's first checkpoint count from its start.
7. The stage's own record: `run.bonuses = []`, `run.cleared = false`, `run.ended = false`, `run.stageScore = score`, `run.stageStart = time`, `result = null`. `timeScale` is worked out, and the screen becomes `playing` with `screenT = 0` and `screenData = null`, without `setScreen`.
8. Emits, in this order: `screen:change` from `results` to `playing`, `level:start` with `continued: false`, `section:enter` for section 0.

Everything else is kept: the score, `ink` and `inkTotal`; the clocks `frame`, `time`, `sceneTime` and `worldTime`; the typing engine with every statistic, the multiplier and the streaks; the other run counters, `run.stages` and the two bests among them; the pacing (`assist`, `assistTarget`, `adaptive`, `adapt`); the seed, `nextId` and the difficulty.

Presentation modules reset themselves on `level:start` (sections 4.17, 4.18 and 7.3), so nothing from before the game over carries into the continued run, and nothing from the stage before into the next one.

### 4.17 `TG.Effects` (effects.js, WP-F)

Presentation only: particles, clear animations, ink bolts, score popups, letter particles, screen shake, flashes, label effects, hero cast overlay.

```js
TG.Effects.init() -> void                // subscribes to events
TG.Effects.reset() -> void               // removes every effect. TG.Effects calls it itself on level:start (new run, continue and next stage)
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
- **Kinds drawn away from their place.** A dangle sways on its thread and a flit flutters in its crossing (section 4.19), so each is drawn a little away from the payload's place. For them the ink bolt and the kind animation start where the creature was drawn: `TG.Render.sway(entity)` px to the right of the payload's `x` and `TG.Render.flutter(entity)` px above its `y`. The letter particles and the popups keep the payload's place, where the plate held still. A flit flies beside Pip, so its clear and the ink bolt to it keep their place in the view as he runs on.
- **Position outside the playfield.** If the payload's position is outside the view (a Boulder or a Dangle still beyond the right edge, a Swoop, a Dangle or a Flit above the top, a Digby underground), the effect position is clamped to the playfield before anything is drawn: screen x to `[8, 376]`, y to `[PLAY_TOP + 8, GROUND_Y - 8]`. This is where the edge tag was, so the clear is always visible. A clear that the clamp has moved is played at the clamped place as it is, without sway or flutter; one that it has not moved can start up to 2 px outside the range in x, by a dangle's sway.
- **Skins.** No payload carries the look of a creature. `TG.Effects` reads it from `TG.Game.state` as the event arrives: the entity with the payload's `id`, which is still in `state.entities`, marked `dead`, while `word:clear`, `threat:hit` and `threat:bounce` are handled, and `state.level.theme.skins` (section 5.9). A cleared or knocked-away creature is drawn as `TG.Render` drew it (section 4.19): in the entity's own `skin` if it has one, else in the sprite and under the remap of the level's skin for its kind, else in the kind's sprite. What a clear leaves behind follows the skin: the hoppet's `fx_lilypad` is drawn under the skin's remap, and a rock bounces off the boss in the skin's sprite. A skin's `fx` names a sprite to leave in place of another. One sprite is swapped this way, the buzzle's `fx_flower`: with a swap, four of the named sprite drift down where one flower would.
- **The Baronet.** A digby whose own skin is `en_baronet`, Lady Ratchet's minion (section 5.7), has a clear of its own. It is cleared from in front of its mound, where `TG.Render` draws it. It counts as underground, and pops out before it is cleared, while its feet are 1 px or more under the ground line, where a mole does from 6 px. It loses `boss_helmet` and `boss_monocle` where a mole loses `fx_helmet`, and `fx_cogbit` grows where a mole leaves `fx_daisy`. A minion in any other skin is cleared as a mole is.
- **Boss words.** `word:clear` is not emitted for boss words. On `type:hit` with `complete: true` and kind `core` or `finisher`, `TG.Effects` plays the ink bolt to the payload's `x`, `y` and the letter particles from the boss plate (DESIGN 13.3). The boss's own reaction follows from `boss:hit` or `boss:defeat` (the table below).
- **Hit while in the air or sliding.** On `threat:hit`, the hit effect is drawn at Pip's position, not at the threat's. The creature is knocked back the way it came: to the left when the payload's `x` is behind Pip or the entity is a flit that has `turned`, whose dive ends on Pip's own x, and otherwise to the right.
- **Hazards.** The particle colours of `hazard:hit` and `hazard:bridge` are the level's, `theme.hazardFx` (section 5.9).

Effects by boss. The effects of the fight are chosen by `state.boss.kind` from a table in which the Baron is the default: a kind the table does not list has his.

| Event | `baron` | `ratchet` |
|---|---|---|
| `boss:hit`: knocked off the head | `boss_monocle` | `boss2_goggles`, under the remap `lampred` while `boss.lampRed`; and the popup `1...` when the hit leaves her health |
| `boss:defeat`: what flies off, 0.55 s on | `boss_helmet` | `boss2_key`, and her goggles |
| `boss:defeat`: the letter fountain | From the hole in his mound, 2.2 s on | From her hatch as it bursts, 1.2 s on; then 14 `fx_cogbit` rain down and 16 `fx_flake` drift down until the results come |
| `boss:throw`: particle colours | SAND, CLAY, WHITE | GOLD, BRONZE, WHITE |
| `boss:phase`: colours of the falling dust | SAND, CLAY, STONE | BRONZE, GOLD, STONE |
| `boss:enter` | | A puff of dust at the hatch and three puffs of steam from the engine as she rises |
| `boss:state` with state `volley`, in phase 3 | | Two puffs of steam from the engine |
| `boss:weakopen` after a volley that was cleared whole | | A puff of steam beside the gauge, 0.3 s on, with the `toot` (section 7.1) |
| `type:hit` with kind `finisher` | | Three sparks from the key in her back |

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
- The speech plate is an INK plate with a WHITE 1 px border, centred at x = 192 with its top at y = 40, text at 1x. It is shown from the second half of the boss intro until the screen leaves `bossIntro`. The text appears letter by letter, 30 letters a second. A line that would not be whole before the intro ends at that rate, which is when `(letters + 2) / 30` is more than half the intro's length, is typed over the first half of the time it has, `letters / (length / 4)` a second, and stands whole for the other half: Lady Ratchet's 27 letters on the short intro after a continue. The plate's clock is `state.boss.stateT`, the boss's own intro clock, for every boss. A pause sets `state.screenT` back to 0 and leaves `stateT` where it was, so after a pause in the intro a line goes on from the letter it had reached. In an intro with no pause the two clocks hold the same value on every drawn frame: both are 0 when the screen is entered, and every step adds the same `dt` to both. The released game timed the Baron's plate by `screenT`, and after a pause his line came late, was cut short or did not come back; with no pause his frames are the same under either clock (14.3).
- **From the level's data.** The label of the boss bar is `state.level.boss.label`, and `BARON` when the level names none. It ends 8 px before the bar, which starts at x 280: its x is `272 - 8 * letters`, and the INK box behind it runs from 4 px before the label to x 380. The tip for each of the boss's two attacks is `TIP: ` followed by `state.level.boss.tips.shock` or `.pick`; without them the tips are `TIP: JUMP THE SHOCKWAVE` and `TIP: DUCK THE PICKAXE`. The tip for the hazard that needs the duck key held is `TIP: HOLD ENTER UNDER THE ` followed by `state.level.theme.hazardNames.arch`, and by `ARCH` without it.
- **Power slot.** The slot shows the timed power named by `state.power.last`: its icon, `pw_` followed by the name, and beside it a gauge of the time left over the whole time. Hourglass: `power.slowT` over `HOURGLASS_TIME`, AQUA. Golden quill: `power.quillT` over `QUILL_TIME`, GOLD. Pocket Watch: `power.watchT` over `WATCH_TIME`, WHITE. The icon blinks while the time left is at most `min(2, whole time / 3)` seconds: the last 2 s of the Hourglass and of the quill, and the last second of the watch.

### 4.19 `TG.Render` (render.js, WP-F)

```js
TG.Render.init(canvas) -> void           // canvas: the 384x216 canvas element. Gets the 2D context, turns smoothing off
TG.Render.draw(state) -> void            // draws one frame, in the order below
TG.Render.drawBackdrop(ctx, backdropId, palette, camX, time, sectionIndex) -> void   // parallax layers L0 to L4; used by TG.UI for the title screen
TG.Render.layoutLabels(state) -> label[] // pure; section 5.13. Used by draw and by tests
TG.Render.worldToScreenX(state, x) -> number   // floor(x - state.camera.x)
TG.Render.sway(entity) -> number         // px to the right of its place at which a dangle is drawn; 0 for any other kind
TG.Render.flutter(entity) -> number      // px above its path at which a flit is drawn in its crossing; 0 for anything else
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
   9. Word plates, lock brackets, edge tags. In this order: the rims of the plates with a RED border, where the level names a rim (below); the tails; the plates and edge tags; the lock brackets.
   10. `TG.Effects.flash()`.
   11. `TG.Hud.draw(ctx, state)`.
   12. `TG.Effects.draw(ctx, 'screen', 0)`.
   The world (steps 1 to 10) is drawn offset by `TG.Effects.shake()`. The HUD is not. While a Pocket Watch runs (`power.watchT > 0`), its frame is drawn between steps 10 and 11 and is not shaken: 1 px of AQUA along the edge of the rectangle that the flash of step 10 fills, x 0 to 383 and y `PLAY_TOP` to 215. It is on for three steps and off for three, counted on `state.frame`.
2. Otherwise: fill with INK.
3. `TG.UI.draw(ctx, state)` if it exists.

Who draws what on the screens where both take part:

- `paused` and `gameOver`: `TG.Render` draws the world as it stands (on `gameOver` with Pip sitting, section 6.6). `TG.UI` then draws its dither and its text over it.
- `levelComplete`: `TG.Render` draws the world with Pip in his victory pose and the boss from `state.boss` (section 5.7); `TG.Effects` draws the defeat sequence.
- Lock brackets and the `locked` and `dim` fields of word plates come from `state.typing.target` (section 4.7).

**Sprites from the level's data.** The renderer takes sprite names from `state.level.theme`, each with Level 1's sprite as the default where the theme names none (the table in section 5.9): the tiles from `theme.tiles`, the hazards and the pieces drawn with them from `theme.hazardSkins`, and the remap of the ink drops from `theme.inkRemap`. An entity is drawn in its own `skin` if it has one (section 5.5), else in the sprite of `theme.skins[kind]`, else in the sprite of its kind (section 5.4). A skin keeps the frames of the sprite it stands for. The remap of `theme.skins[kind]` is used unless the entity has a skin of its own, and the white flash of a correct key goes over either. Attacks are skinned as threats and crates are. The mound of a digby underground and the power icon of a crate are not skinned.

**Boss parts.** The sprites of the boss are chosen by `state.boss.kind` from a table in which the Baron is the default: a kind the table does not list is drawn as the Baron. `baron`: `boss_body`, `boss_arm`, `boss_head`, the base `boss_mound`, `boss_monocle` for the gesture of his intro, and `en_digby` as his small figure in the defeat. `ratchet`: `boss2_body`, `boss2_arm`, `boss2_head`, the base `boss2_engine`, `boss2_key`, and `en_baronet` as the small figure of the cameo in her intro. Lady Ratchet is put together by a branch of her own, her intro and her defeat with her (sections 6.4 and 6.6). All of it is drawn in step 5, so the Baronet of the cameo passes behind Pip.

**Two clocks.** The picture of the world is animated from the scene clock, `state.sceneTime`, which stands still while a Pocket Watch holds the world (section 4.16, step 2); a state without the field is animated from `state.time`. On the scene clock: the backdrop's frames and its drift, the gap fill, the checkpoint flags, the swing of a beehive, the ink drops, the ground markers, the power icon of a crate, the boss, the frame of the shield ring, and the bubble Pip stands in after a rescue. On `state.time`, because they prompt a key or answer one: the chevrons of hazards and attacks and the HOLD over an arch, the word plates with their blinking borders, the edge tags and the lock brackets, the ink spark of a correct key, and the bubble that carries Pip on the `lifeLost` screen. Counted in steps, on `state.frame`, and so not held by a watch either: the alternate steps on which the shield ring is drawn, Pip's blink while he is invulnerable, and the watch's own frame. The creatures and the balloon of a crate are animated from each entity's `animT`, and Pip's run and slide from his own, which are in world seconds and so stand still whenever the world does. In a run with no watch the two clocks are equal.

**Dangle and Flit.** Two kinds are drawn a little away from the place the simulation gives them. `sway(entity)` is `round(2 * sin(2 * PI * 0.4 * animT))` for a dangle: it sways 2 px either way on its thread. `flutter(entity)` is `round(reach * sin(2 * PI * 2 * animT))` for a flit in its `cross` phase, where `reach` grows from 0 to 4 px over the first eighth of the crossing and falls back over the last. Both are presentation only: the entity's `x`, `y` and hitbox are untouched, the word plate holds still (section 5.13), and the tail of the plate and the lock brackets go with the sprite. `TG.Effects` reads both to start a clear where the creature was drawn (section 4.17). Both kinds are drawn in step 5 with the other entities, in front of the hazards of step 3; their frames are in section 6.6.

**The urgent rim.** In a boss phase for which `state.level.boss.urgentRim` names a colour (section 5.9), a plate whose border is RED on this frame, for an urgent word or after a wrong key, has 1 px of that colour outside the border. The rims are drawn before the tails, so that a tail still joins the border of its plate.

### 4.20 `TG.UI` (ui.js, WP-G)

```js
TG.UI.init() -> void                     // subscribes to screen:change and checkpoint; calls TG.Save.enterPending() (see "Stages" below)
TG.UI.update(dt) -> void                 // called by TG.Main once per step when the screen is not a sim screen. Drains TG.Input
TG.UI.draw(ctx, state) -> void           // draws the current screen or overlay; draws nothing on playing, lifeLost, bossIntro, boss, levelComplete
TG.UI.panel                              // read-only: 'menu' | 'scores' | 'options' | 'story' | 'bye' on the title screen, otherwise null
TG.UI.page                               // read-only: the page of the High Scores panel while world scores are on (see below):
                                         // 'easy' | 'medium' | 'hard' (the WORLD pages) | 'local' (THIS COMPUTER). Otherwise null
TG.UI.onFocusLost() -> void              // called by TG.Main on blur and on a hidden tab: a running resume countdown goes back
                                         // to the pause menu; the game over countdown stands still until onFocusGained
TG.UI.onFocusGained() -> void            // called by TG.Main on focus and on a visible tab
TG.UI.setKeyboardHint(flag) -> void      // called by TG.Main: true after a touch press with no keydown seen yet, false on the
                                         // first keydown. While true, boot, title and How to Play say a keyboard is needed
```

`TG.UI` owns: boot, title (with its options, high score, story and goodbye panels), difficultySelect, howToPlay, paused (menu and resume countdown), gameOver (countdown), results (tally and rank), highScoreEntry. It changes screens only through `TG.Game.setScreen`, `newRun`, `resume`, `continueRun`, `endRun` and `nextStage`. It emits the `ui:*` events. It never touches the window or the document.

`TG.UI.init` must not read `TG.Game.state`: `TG.Main` calls it before `TG.Game.init`, and after `TG.Save.load`, so that a pending entry can be entered. `TG.UI` sets up each screen, including `boot`, when it receives `screen:change`; `TG.Game.init` emits that event for `boot`. `TG.UI.update` and `TG.UI.draw` do nothing until the first `screen:change` has arrived.

The `story` panel (title idle rotation) is Tier 2. If it is left out, `TG.UI.panel` never takes the value `story`.

**EXIT and the `bye` panel.** The title menu is START, HOW TO PLAY, HIGH SCORES, OPTIONS, EXIT, in a box of 144 x 76 at (120, 91) with a row pitch of 13 px. Confirming EXIT (Enter, Space or the JUMP button; Esc does nothing on the menu) emits `ui:select`, sets the panel to `bye`, calls `TG.Audio.music(null)` and emits `ui:exit`. The other keys of that step are dropped. `TG.Main` answers `ui:exit` by asking the browser to close the window (4.21); `TG.UI` only shows the panel, which is what the player sees whenever the tab stays open. No screen change is involved: the screen stays `title`.

The `bye` panel is the goodbye screen: "THANKS FOR PLAYING!" in GOLD at 2x, Pip (`hero_win` at 2x), "YOU CAN CLOSE THIS TAB NOW.", and in the bottom strip "PRESS ANY KEY TO PLAY AGAIN" (blinking) over the copyright line. Keys are ignored for its first 0.5 s. After that any key that `TG.UI` reads from the `TG.Input` queue (a letter, or a key with a menu action) returns to `menu` with START selected, emits `ui:select` and calls `TG.Audio.music('title')`; `TG.Main` passes the keys that `TG.Input` does not queue, the semicolon key (queued, but with no menu action: 4.12), and a click or tap outside the buttons, on as an Enter press, as it does on boot. So for the player every key except the bare modifier and function keys of 4.21 returns to the menu. The idle rotation does not run while the panel is `bye`, and the idle time starts from zero after the return to the menu. These are the only two calls `TG.UI` makes to `TG.Audio.music`.

**Copyright line.** The text is the constant `COPYRIGHT` in `js/ui.js` (`'\u00a9 2026 DAVID SLEE'`), the one place that holds the year and the name. It is drawn centred at y 207, in SILVER on INK, on the boot screen and in the bottom strip of the title's `menu` (also while the logo is stamped), `story` and `bye` panels. That strip is INK, 22 px high (y 194 to 215), with the panel's help line (or the keyboard note) at y 197 above the copyright line. The `scores` and `options` panels fill the screen and do not show the line.

`TG.UI` also does the saving that follows from play, because the simulation never writes to `TG.Save`:

- on `checkpoint` with `index >= 1`: `TG.Save.setSetting('tutorialDone', true)`;
- on entering `results`: `TG.Save.recordRun(state.result)`, once for each result. A run of two stages has two results screens, and both results are recorded;
- on `highScoreEntry` confirm: `TG.Save.addScore`;
- when starting a run: `TG.Save.setSetting('lastDifficulty', difficulty)` and `TG.Save.clearPending()`. The seed for a run started from the menus is `(Date.now() >>> 0)`; only `TG.UI` may read the clock for this;
- on the STAGE row of the difficulty screen: `TG.Save.setSetting('lastLevel', level)`;
- for the pending entry: `TG.Save.setPending` at NEXT STAGE, `TG.Save.clearPending()` on entering `title`, and `TG.Save.enterPending()` in `TG.UI.init`.

**Stages** (DESIGN 12; LEVEL2 12). A run can cover two stages, and is entered once, with its run total, when it ends.

- **The STAGE row.** Once a level after the first is open (`TG.Save.levelOpen`, and the level's data is loaded), the difficulty screen has a row under the three panels: `STAGE <n>  <LEVEL NAME>` in GOLD at y 153, between an up and a down arrow, and under it at y 164 the sample words of the stage on plates, when it has its own (Level 2: `gear`, `piston`, `clockwork`). Up and Down go round the open stages (`ui:move`), and each choice is saved as the `lastLevel` setting; Left and Right move between the difficulties. With the row, the two lines about the words and the speed stand at y 180 and 191, and the line with the WPM guide and the lives is left out. Before the unlock there is no row: the screen has its three lines from y 158 and all four arrows move between the difficulties.
- **Starting a run.** READY typed on How To Play starts the run at the level of the `lastLevel` setting while that level is open, and otherwise at Level 1: `TG.Game.newRun({ difficulty, seed, levelId })`.
- **Results.** The title is `STAGE <n> CLEAR!` for a cleared stage and `RUN ENDED` otherwise. A cleared stage can have a headline under the title, at y 28: `STAGE <n + 1> UNLOCKED: <LEVEL NAME>` in LIME when recording this result opened the next level for the first time, and otherwise the level's own closing line when it has one (Level 2: `A COLD WIND BLOWS DOWN THE SHAFT.` in AQUA). With a headline the difficulty's label moves from that line to the top right corner. In a run that came through NEXT STAGE (`result.stageScore > 0`) the first row is `STAGE <n - 1> SCORE`, the score the run carried in; SCORE, the bonuses and TOTAL under it are the run's. The last of those rows has a note: `NEW BEST RUN!` when `result.score` is above `result.bestScore`, and otherwise `BEST RUN <bestScore>` when there is one. In such a run the note beside WPM compares with the higher of `result.bestWpm` and the WPM an earlier results screen of the run showed. Under the rows of the first page, once the rank is stamped, one line says what the next rank up needs that the run did not have: accuracy first, then lives lost, then continues, then a cleared stage (for example `S NEEDS NO LIVES LOST, YOU LOST 2`). The rows have a pitch of 16 px from y 48, and of 14 px on a page with a tenth row or with two lines under its rows.
- **The strip.** After a cleared stage that has a level after it (`TG.Levels[result.levelId + 1]`), once the tally of the last page has finished, the footer is `ENTER: NEXT STAGE   ESC: TITLE`, centred at y 205. Enter alone goes on: Space and the JUMP button finish the tally and turn the page as before, and do nothing on the strip. Esc is read only while the strip is shown, and leads where Enter leads without it: to `highScoreEntry` when the run has an entry to make, and otherwise to `title`. While a run that ended here would have an entry to make, the line `THE SCORE IS ENTERED WHEN THE RUN ENDS` stands over the strip, at y 194.
- **NEXT STAGE.** Emits `ui:select` and calls `TG.Game.nextStage()`; if that returns false the screen stays as it is. Then `TG.Board.stat('start', { level })` for the level that starts, and `TG.Save.setPending(result.difficulty, entry)` with the entry this result would have made, under `PIP`. No run token is asked for and no score is sent.
- **The entry of a run** is made from the result of its last stage, whose figures are the run's (section 5.11). `entry.cleared` is `result.stages > 0`: the run cleared at least one stage, which is not `result.cleared` when a later stage was not finished.
- **The pending entry** covers a run that never ends in the game, such as one in a tab that was closed in the second stage. It is the entry kept at NEXT STAGE; `TG.Save` keeps it only when its score would reach the table. It is cleared when a run starts and when the title screen is reached, by whatever route. One that `TG.UI.init` still finds is added to its table then, under the `initials` setting, with no screen for it.
- **Title.** The story panel shows the premise of a level and its villain beside Pip: Level 1's with the Baron, Level 2's with Lady Ratchet. The idle rotation shows the story panel of each open level in turn, each followed by the high scores, over that level's scene: its backdrop in the palette of its first section, and its `top` and `fill` tiles. The menu keeps Level 1's scene.
- **How To Play.** The POWER-UPS column has seven rows with a pitch of 18 px from y 62, the Pocket Watch among them (`POCKET WATCH`, `STOPS TIME`), and the duck lines read `HOLD FOR ARCHES AND TUNNELS`.
- **Texts by level.** The sample words of the STAGE row, the closing line of the results screen and the story panel (premise and villain) are not level data (section 5.9): they are the tables `STAGE_SAMPLES`, `HOOK` and `STORY` in `js/ui.js`, keyed by level id. A level without an entry has no sample words and no closing line, and the idle rotation goes back to Level 1's panel when the next level has no story panel.

**World scores** (`TG.Board`, section 4.22; DESIGN 8.9 and 12). `TG.UI` makes no network request. It calls `TG.Board` and reads `TG.Board.state` each frame, every call guarded. "World scores are on" below means `TG.Board.enabled()` is true. When `js/board.js` is absent, `TG.Board.URL` is empty, the browser has no `fetch` or the `worldScores` setting is off, every screen looks and behaves as it did before world scores existed, and the rest of this part does not apply.

- **Options.** When `TG.Board.available()` is true the panel has a ninth line, WORLD SCORES (ON / OFF, the `worldScores` setting of 5.12), between ADAPTIVE PACE and RESET SCORES. Its help lines are "SENDS YOUR INITIALS AND SCORE" and "TO A SHARED BOARD. COUNTS GAMES PLAYED.". With nine lines the row pitch is 12 px from y 42 (eight lines: 13 px from y 44). The line stays while the setting is off.
- **Run token.** Confirming a difficulty (on entering `howToPlay` from `difficultySelect`) calls `TG.Board.startRun(difficulty)`. A later confirm calls it again. Starting the run, a continue, a restart from a checkpoint and NEXT STAGE do not: a run of two stages is sent once, at its end, with the token it started with.
- **Daily counts.** For the owner's totals (LEADERBOARD 10), each stage is counted on its own. `TG.Board.stat('start', { level })` is called when a run starts from the menus and at NEXT STAGE, with the level that starts. `TG.Board.stat('end', { time, cleared, section, level })` is called once for each result, on entering `results`: `time` is `result.stageTime`, the stage's own, `cleared` is `result.cleared`, `section` is `state.section` and `level` is `result.levelId`.
- **When the initials screen appears.** `results` goes on to `highScoreEntry` when the score reaches the top five of this computer (`TG.Save.qualifies`), or when the run goes to the world scores: world scores are on, `TG.Board.hasToken(result.difficulty)` is true, the score is above zero and `floor(result.time)` is at least `TG.Board.MIN_TIME` (10 s; the service refuses a shorter run, so it is not offered). Otherwise it goes to `title`, as before. On a results screen with the NEXT STAGE strip this is what Esc does; Enter goes on to the next stage and nothing is entered yet (Stages, above).
- **Initials screen.** The heading is "NEW HIGH SCORE!" when the score reaches the local top five and "WORLD SCORES" when the screen is shown for the world scores alone. While a score will be sent, the screen says so: under the local table "INITIALS AND SCORE ALSO GO TO WORLD SCORES" (the table rows then have a pitch of 11 px from y 129, instead of 12 px from y 132), or, when there is no local table to show, "YOUR INITIALS AND SCORE GO ON THE WORLD SCORES FOR <DIFFICULTY>." and "WORLD SCORES CAN BE SWITCHED OFF IN OPTIONS ON THE TITLE SCREEN.". The line under the boxes (y 112) says what Enter does: "ENTER: SEND" (WORLD SCORES), "ENTER: SAVE AND SEND" (NEW HIGH SCORE! with a send) or "ENTER: SAVE" (nothing is sent), with " AS <INITIALS>" added while the boxes are empty and initials are offered; when nothing is sent the offer reads "ENTER: USE <INITIALS>", as before.
- **Declining (Esc).** While the run can be sent, the bottom strip reads "TYPE 3 LETTERS, THEN ENTER   ESC: DO NOT SEND", the Esc part in SILVER. On the WORLD SCORES screen Esc emits `ui:back` and goes to `title` (the menu) with nothing saved and nothing sent: no `TG.Save.addScore`, no `initials` setting, no `TG.Board.submit`. On the NEW HIGH SCORE! screen the score still belongs in the local table, so Esc switches the sending off or on again (`ui:move`): off, the line under the table is "THIS SCORE STAYS ON THIS COMPUTER", the strip ends "ESC: SEND IT TOO" and Enter saves on this computer only. When nothing would be sent (world scores off, no token, a run under 10 s) Esc does nothing and the strip is "TYPE 3 LETTERS, THEN ENTER", as before.
- **Key lock.** While world scores are on, Enter and Esc are not read for the first 0.5 s of the initials screen (`ENTRY_LOCK`), so a second Enter meant for the results screen cannot send a score. Letters and Backspace are read at once. With world scores off there is no lock.
- **Offered initials.** The initials last used (the `initials` setting) are shown dim in the boxes, and Enter alone takes them. One exception: `PIP` is the game's placeholder, not initials somebody chose, so while the run will be sent it is not offered. The boxes are then empty, Enter alone shakes them and shows "TYPE 3 LETTERS FIRST", and nothing is saved or sent; a player who wants PIP types it. When nothing is sent, PIP is offered as before.
- **Refused initials.** While world scores are on, Enter with initials for which `TG.Board.blocked(name)` is true is refused on the spot: the boxes shake for 0.3 s and turn CORAL, "TRY OTHER INITIALS" replaces the hint line, `ui:back` is emitted, and nothing is saved or sent (no `TG.Save.addScore`, no `initials` setting, no `TG.Board.submit`). The next letter starts the initials again; Backspace also clears the message. Saved initials that are blocked count as PIP.
- **Confirm.** `TG.Save.addScore` as before (it adds the entry only when the score qualifies), `TG.Save.setSetting('initials', name)`, then `TG.Board.submit(entry, state.result)` when the run goes to the world scores and the player has not declined. Then `title`.
- **High Scores panel.** With world scores on the panel has four pages, changed with Left and Right (they go round; `ui:move`): WORLD EASY, WORLD MEDIUM, WORLD HARD and THIS COMPUTER. The page header (y 31) is the page name between a left and a right arrow, with the page number ("2/4") at the right; the bottom line is "LEFT AND RIGHT: PAGE   ENTER OR ESC: BACK". A WORLD page shows ten rows (11 px pitch from y 56) under the column heads NAME, SCORE, WPM, ACC, RANK: place, initials, score (seven digits), WPM, accuracy and rank. THIS COMPUTER shows the three tables of five as the unpaged panel does, 6 px lower. Instead of rows a WORLD page shows "LOADING..." while `state.boards` is `idle` or `loading`, "WORLD SCORES CANNOT BE REACHED" with "PRESS RIGHT FOR THIS COMPUTER'S SCORES" when it is `failed` (on such a page Right goes straight to THIS COMPUTER), and "NO SCORES YET. BE THE FIRST!" for an empty board. Opening the panel from the menu calls `TG.Board.refresh()`, or `TG.Board.refresh(true)` when the last load failed. It opens on the WORLD page of the `lastDifficulty` setting, or on THIS COMPUTER when the last load failed.
- **After the initials screen.** When a score was sent, the title opens on the WORLD page of the run's difficulty, and keys are not read for the first 0.5 s (`ARRIVE_LOCK`), so that an Enter meant for the initials screen does not close it. Under the rows (y 172) a status line says what became of the score:
  - `state.send` `sending`: "SENDING...";
  - `sent`: "YOUR PLACE: 12 OF 87" in GOLD, with the player's row on a SHADOW bar (x 32 to 352) in GOLD with a blinking arrow at x 36 when `state.place` is among the ten rows. When `state.kept` is false (the run is below the 200 rows the service keeps, which it answers with place 201 of 201) the line is "NOT IN THE BEST 200 YET. KEEP GOING!" instead;
  - `failed`: by `state.sendError`, "COULD NOT REACH WORLD SCORES." (`unreachable`), "WORLD SCORES DID NOT TAKE THIS SCORE." (`refused`) or "TOO MANY SCORES SENT FROM HERE THIS HOUR." (`busy`), in CORAL, followed by "SAVED ON THIS COMPUTER." on a second line when the score reached the local table. (Two lines, because together they are wider than the screen.)

  When the send failed and the board could not be loaded either, the page has no rows and says it once: "WORLD SCORES CANNOT BE REACHED", then "YOUR SCORE IS SAVED ON THIS COMPUTER." and "PRESS RIGHT TO SEE IT" when the score reached the local table, or "YOUR SCORE WAS NOT SENT." when it did not; there is no second failure line. After a successful send the page shows the list of the service's reply, also when the other boards are not loaded. When nothing was sent and the score reached the local table, the panel opens on THIS COMPUTER with the new entry blinking, as before, and reads keys at once. The status line and the highlighted row stay on that WORLD page each time the panel is opened from the menu, until the next run starts (READY typed); the idle rotation shows the boards without them.
- **Idle rotation.** When the rotation starts it calls `TG.Board.refresh()` once. Each time it reaches the high scores it shows a WORLD page (easy, medium and hard in turn, starting with `lastDifficulty`) if that board is known, without the arrows and with "PRESS ANY KEY"; otherwise it shows the unpaged panel. There is one board for each difficulty whatever stages a run played.

### 4.21 `TG.Main` (main.js, WP-G)

```js
TG.Main.init() -> void
   // In this order: TG.Save.init(window), TG.Save.load(), TG.Board.init({ fetch, now }), TG.Gfx.init(document), TG.Audio.init(),
   // TG.Input.init(window), TG.Input.onFirstInput = function () { TG.Audio.unlock(); },
   // TG.Input.bindButton for #btn-jump and #btn-duck, TG.Effects.init(), TG.Hud.init(),
   // TG.Render.init(canvas), TG.UI.init(), TG.Events.on('ui:exit', ...), TG.Game.init(), resize handling, focus, blur and visibility handling,
   // first requestAnimationFrame.
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

`TG.Main.frame` accumulates real time, runs `tick(DT)` at most `MAX_STEPS` times, calls `TG.Audio.update` and `TG.Board.update` (both with the frame's real time, at most `MAX_FRAME`), then `TG.Render.draw(TG.Game.state)`. If a frame is longer than `MAX_FRAME` it discards the accumulated time and calls `TG.Game.pause()`.

World scores (section 4.22): `TG.Main.init` calls `TG.Board.init({ fetch: f, now: function () { return Date.now(); } })`, where `f` is `window.fetch.bind(window)`, or `null` when the window has no `fetch` function or reading it throws. This is the only place where the game takes a network function from the browser; `TG.Main` never calls it.

Focus handling:

| Browser event | `TG.Main` calls |
|---|---|
| `blur` on window; `visibilitychange` with `document.hidden` true | `TG.Game.pause()`, `TG.UI.onFocusLost()`, `TG.Input.clear()`, `TG.Audio.suspend()` |
| `focus` on window; `visibilitychange` with `document.hidden` false | `TG.UI.onFocusGained()`, `TG.Audio.resume()` |

Audio unlock and touch (DESIGN 2, 15.1): a browser starts an AudioContext only inside a user gesture, and Esc or a touch `pointerdown` is not one. So until `TG.Audio.isUnlocked()` is true, `TG.Main` calls `TG.Audio.unlock()` on every `keydown` except Esc, and on `pointerdown`, `pointerup`, `touchend` and `click` on the window. A `pointerdown` with `pointerType` `'touch'` before any `keydown` calls `TG.UI.setKeyboardHint(true)`; the first `keydown` calls `TG.UI.setKeyboardHint(false)`.

EXIT (`ui:exit`, sections 4.20 and 8.6): `TG.Main` calls `window.close()` inside try/catch, and skips the call when the window has no `close` function. This is the only place where the game asks the browser to close anything. A browser closes only a window that a script opened (some also close a tab that has no earlier page in its history), so for a tab the player opened the call does nothing and the goodbye panel of `TG.UI` stays on screen. While `TG.UI.panel` is `'bye'`, "any key" works as on the boot screen: a key that `TG.Input` does not queue (Shift, a digit and so on), the semicolon key (`;`, `:` or whatever a layout has on that key; `TG.Input` queues it as `semicolon` for the game, and `TG.UI` has no menu action for it) and a click or tap outside the buttons are passed to `TG.UI` as an Enter press, through `TG.Input.keyDown('enter')` and `keyUp('enter')`. Not passed on: a repeated key, a combination with Ctrl, Cmd or Alt, the keys Control, Meta, Alt, AltGraph, OS and Fn on their own, the function keys (F1, F2 and so on), and the `Unidentified`, `Dead` and `Process` keys. On every other screen `TG.Main` passes nothing on, so the semicolon key does nothing in the menus and only ducks in play.

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

### 4.22 `TG.Board` (board.js, Lead)

World scores, the game side. `docs/LEADERBOARD.md` is the agreement with the service under `server/`; its section 9 is this module. Rule 10 of section 2.2 applies.

```js
TG.Board.URL                             // the base address of the service, no slash at the end. '' switches world scores off
                                         // completely: no request is ever made. The repository holds the address of the live service
TG.Board.init({ fetch, now }) -> void    // called by TG.Main (4.21). fetch: the network function, or null. now: a function returning ms.
                                         // Drops the token, the lists and every request in flight
TG.Board.update(dt) -> void              // called by TG.Main once per frame: gives up requests that have waited TIMEOUT_MS
TG.Board.available() -> boolean          // URL set and a fetch function given
TG.Board.enabled() -> boolean            // available() and the worldScores setting is not false
TG.Board.startRun(difficulty) -> void    // asks for a run token: POST <URL>/v1/runs
TG.Board.hasToken(difficulty) -> boolean // a token for a run of this difficulty is held (any difficulty when none is given)
TG.Board.submit(entry, result) -> void   // sends a finished run: POST <URL>/v1/scores. entry: section 5.12; result: state.result
TG.Board.stat(event, info) -> void       // counts a stage of a run for the owner's daily totals: POST <URL>/v1/stats (LEADERBOARD 10). event: 'start'
                                         // (TG.UI, when a run starts from the menus and at NEXT STAGE) or 'end' (when a stage reaches results,
                                         // with info { time, cleared, section } for that stage alone). info.level: the stage. With 2 the
                                         // request carries level: 2; with anything else it has no such field, and the service counts it as
                                         // Level 1. Needs a held token; the reply is not used
TG.Board.refresh(force) -> void          // loads the three boards: GET <URL>/v1/scores
TG.Board.blocked(name) -> boolean        // the initials are on the block list (any letter case); works whether world scores are on or off
TG.Board.BLOCKLIST                       // frozen array: a copy of the array in server/src/blocklist.js
TG.Board.TIMEOUT_MS                      // 6000
TG.Board.REFRESH_MS                      // 30000
TG.Board.MIN_TIME                        // 10: s. The service refuses a shorter run (LEADERBOARD 5, check 7), so it is not sent
TG.Board.SEND_MAX_WPM                    // 220: the highest WPM the service accepts (check 6). A higher figure is sent as this one
TG.Board.KEPT_ROWS                       // 200: rows the service keeps per board (LEADERBOARD 4)
TG.Board.state = {
  boards: 'off',                         // 'off' | 'idle' | 'loading' | 'ready' | 'failed'
  lists: { easy: [], medium: [], hard: [] },   // entries as in 5.12, highest first, at most 50 each
  send: 'none',                          // 'none' | 'sending' | 'sent' | 'failed': the last submission
  sendError: null,                       // while send is 'failed': 'unreachable' | 'refused' | 'busy'. Otherwise null
  place: 0, total: 0,                    // set when send is 'sent'
  kept: true,                            // while send is 'sent': false when place is above KEPT_ROWS (the run was not kept)
  sentDifficulty: null,                  // the difficulty of the last submission
  sentEntry: null                        // the entry that was sent
};
```

`sendError` and `kept`, and the three limits, are not in LEADERBOARD 9; they were added after the review of the game side (14.2). The limits are copies of `RULES.minTime`, `RULES.maxWpm` and `RULES.keep` in `server/src/worker.js`; `test/test-board.js` checks that they are equal.

- **Off.** While `enabled()` is false the state is `boards: 'off'` with empty lists and `send: 'none'`, no function makes a request, the token is dropped and replies still in flight are ignored. `enabled()` is read on every call, so the module follows the `worldScores` setting without being told.
- **Nothing throws, nothing returns a promise.** Every function returns `undefined` or a boolean, whatever its arguments and whatever the network function does (also when it throws or returns something that is not a promise). Results arrive in `TG.Board.state`, which stays the same object.
- **Requests.** Only to `TG.Board.URL` followed by `/v1/runs`, `/v1/scores` or `/v1/stats`, with `mode: 'cors'`, `credentials: 'omit'` and `referrerPolicy: 'no-referrer'`; a POST carries a JSON body and the header `content-type: application/json`. A reply counts only when its status is 2xx and its body is a JSON object with `ok === true`; anything else (an error status, a body that is not JSON, a wrong shape, a network failure) is a failure. A request is given up after 6 s, measured on the clock of `init` in `update(dt)` (without a clock, `update` counts `dt`); that is a failure too, and a reply that arrives later is ignored. One request of each kind (token, send, boards, count) is in flight at a time: a newer one replaces the older, whose reply is then ignored.
- **Where scores are taken from.** The service gives a run token only to the game's own web address and to a local web server (LEADERBOARD 3: a `POST` from another origin, or from a file on disk, is answered with `403`). For `TG.Board` that is a failed token request like any other: no token is held, so `TG.UI` shows no initials screen for the world scores and nothing is sent, while `refresh` still loads the boards.
- **Token.** Kept in memory only, with its difficulty. `startRun` for another difficulty drops the token at once; for the same difficulty the old token stays in use until the new one arrives, and stays if the request fails. `submit` uses the token up. A continue, a restart from a checkpoint and NEXT STAGE do not come through `startRun` and keep the token: a run that covers two stages is sent once, at its end, with the token it started with. A token is no longer held from 60 s before the end of its life (`expires` of the reply, 3 hours).
- **submit.** Does nothing without a token for `result.difficulty`, for initials on the block list, for an entry that is not one, or for a run with `floor(result.time)` under `MIN_TIME`. Otherwise `send` becomes `sending` and the body is `{ token, name, score, wpm, accuracy, rank, cleared, time }` with `time = floor(result.time)` and `wpm = min(entry.wpm, SEND_MAX_WPM)`. For a run of two stages these are the run's figures: its total, the time of both stages, and `cleared` true when it cleared at least one stage (section 5.12). (The game's WPM is the speed inside words, `TG.Typing`, 4.7; a fast typist can be above 220 there, and the service would refuse the whole run. The table of this computer keeps the game's own figure; `sentEntry` holds what was sent.) An accepted reply needs whole numbers `place` and `total` from 1 to 999,999 with `place <= total`, the token's `difficulty` and an array `scores`; then `lists[difficulty]` becomes the cleaned `scores`, `kept` becomes `place <= KEPT_ROWS` and `send` becomes `sent`. Any failure gives `send: 'failed'` and leaves the lists as they were.
- **stat.** Does nothing while world scores are off, without a held token, or for an event that is not `start` or `end`. The body is `{ token, event }`; for `end` also `time` (a whole number from 0 to 10,800), `cleared` and `section` (0 to 3), all of the stage that ended; and `level: 2` when `info.level` is 2. The service counts a request without `level` under the difficulty's own label, as Level 1, and one with `level: 2` under the labels `easy-s2`, `medium-s2` and `hard-s2`; it refuses any other `level`. So a third level needs the three extended together: this function, the Worker's rule and the labels. Nothing about the player is sent, and nothing changes for tokens: `stat` reads the token and does not use it up.
- **Why a send failed.** `sendError` is read from the status of the reply: `refused` for 400, 409 and 413 (the service read the score and did not take it: LEADERBOARD 6 `bad_request`, `bad_token`, `expired`, `name`, `implausible`, `too_soon`, `used`, `too_large`), `busy` for 429 (`rate`, the hourly limit of the address), and `unreachable` for everything else: a network failure, the 6 s timeout, any other status, a 2xx reply that is not JSON or has the wrong shape. The body of an error reply is not read.
- **refresh.** Asks the service at most once every 30 s unless `force` is `true`, and never while a load is in flight. `boards` goes from `idle` or `failed` to `loading`, then to `ready` or `failed`; while lists that are already known are loaded again it stays `ready`. For 20 s after an accepted `submit`, a load does not replace the list of that difficulty, because the service lets `GET /v1/scores` be cached for 15 s and an older copy would not hold the new score.
- **Cleaning.** Every list from the service is cleaned before it is kept, because the game draws it: an entry needs a string `name` with at least three letters in it (capitals are made, other characters dropped, the first three letters kept) and a number `score`, or it is left out; `score` is a whole number from 0 to 9,999,999, `wpm` from 0 to 999, `accuracy` from 0 to 100; `rank` is S, A, B or C (otherwise C); `cleared` is a boolean; `date` is `YYYY-MM-DD` or `''`; no other field is kept; at most 50 entries are kept, from the first 500 looked at.

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
  sceneTime: 0,             // s: the scene clock. It takes the step of `time`, except while power.watchT > 0 (section 4.16, step 2).
                            // TG.Render animates the picture of the world from it (section 4.19). Equal to `time` until a run's first watch
  worldTime: 0,             // ws
  pace: 1.0,                // from the difficulty
  assist: 1.0,              // current adaptive value
  assistTarget: 1.0,
  adaptive: true,
  slowScale: 1,             // 0.5 while the Hourglass is active
  tutorScale: 1,            // 0.25 during a tutorial slow-down
  finisherScale: 1,         // 0.25 during the boss finisher
  timeScale: 1,             // product of the five factors above and of a sixth, the Pocket Watch's freeze: WATCH_SCALE, which is 0,
                            // while power.watchT > 0, and otherwise 1 (section 11.3)

  // Run setup
  seed: 1,
  rng: null,                // TG.RNG instance; simulation use only
  difficulty: 'medium',
  config: null,             // TG.Difficulty.resolve(difficulty, level tune): the difficulty entry with the level's overrides
  levelId: 1,               // the level being played: 1 or 2. TG.Game.nextStage raises it, and replaces config, level and picker
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
    watchT: 0,              // s left of Pocket Watch. While it is above 0 the world is stopped: timeScale is 0 (section 4.16)
    last: null              // 'hourglass' | 'quill' | 'watch' | null: which timed power the HUD slot shows
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
    cleared: false,         // the boss of the stage being played was defeated
    ended: false,           // the run was ended from game over
    bonuses: [],            // [{ id: 'lives', label: 'LIVES X3', points: 3000 }, ...]: the end-of-stage bonuses of the stage that has ended
    bestWpm: 0,             // the saved bests of the difficulty, read once by newRun (TG.Save.best) and kept through nextStage:
    bestScore: 0,           // by then the save holds this run's own first stage
    stages: 0,              // stages this run has cleared: 0, 1 or 2. Raised when the result of a cleared stage is built
    stageScore: 0,          // the score the run held when the stage being played began: 0 in a run's first stage
    stageStart: 0           // state.time when the stage being played began: 0 in a run's first stage
  },

  result: null              // section 5.11, set when a stage finishes; TG.Game.nextStage sets it back to null
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
  invulnT: 0,               // s left, real. Stands still while a Pocket Watch runs (state.power.watchT > 0)
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
  boulder: { type: 'threat', from: 'right',  w: 24, h: 32, sprite: 'en_boulder',    family: 'crunch', stall: false, anchored: true },
  dawdle:  { type: 'threat', from: 'right',  w: 16, h: 16, sprite: 'en_dawdle',     family: 'twang',  stall: true  },
  hoppet:  { type: 'threat', from: 'right',  w: 16, h: 16, sprite: 'en_hoppet',     family: 'pop',    stall: true  },
  buzzle:  { type: 'threat', from: 'right',  w: 16, h: 16, sprite: 'en_buzzle',     family: 'pop',    stall: true  },
  swoop:   { type: 'threat', from: 'above',  w: 24, h: 16, sprite: 'en_swoop',      family: 'crunch', stall: true  },
  truffle: { type: 'threat', from: 'behind', w: 24, h: 16, sprite: 'en_truffle',    family: 'bonk',   stall: true  },
  digby:   { type: 'threat', from: 'below',  w: 16, h: 16, sprite: 'en_digby',      family: 'bonk',   stall: true  },
  dangle:  { type: 'threat', from: 'above',  w: 16, h: 16, sprite: 'en_dangle',     family: 'twang',  stall: false, anchored: true },
  flit:    { type: 'threat', from: 'above',  w: 24, h: 16, sprite: 'en_flit',       family: 'pop',    stall: true  },
  rock:    { type: 'threat', from: 'right',  w: 12, h: 12, sprite: 'pr_rock',       family: 'pop',    stall: true  },  // from is 'above' for a high rock
  crate:   { type: 'crate',  from: 'right',  w: 16, h: 32, sprite: 'crate_balloon', family: 'pop',    stall: false },
  shock:   { type: 'attack', from: 'right',  w: 16, h: 8,  sprite: 'pr_shock',      action: 'jump', elev: 0 },
  pick:    { type: 'attack', from: 'right',  w: 16, h: 16, sprite: 'pr_pickaxe',    action: 'duck', elev: 14 }
};
```

`anchored: true` marks a kind that stands at a fixed point in the world while Pip runs up to it (the boulder, and Level 2's dangle): its `x` is its `anchorX`, set at the spawn, and its `t` follows from the distance Pip still has to run (section 5.5). `dangle` and `flit` are the kinds that only Level 2 spawns; their paths are in section 5.5.

The table is part of the code: a level's data names kinds in its `spawns` and cannot define one. `sprite` is what a kind is drawn with unless the level's theme or the entity itself names another sprite (`theme.skins` in section 5.9; `skin` in section 5.5).

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
                            // Anchored kinds (5.4: boulder, dangle): not a clock. Each step age = budget - (dx - contact) / RUN_SPEED,
                            // from the distance Pip still has to run
  t: 0.32,                  // age / budget. Contact happens when t >= 1 (section 4.13)
  stallT: 0,                // ws of letter stall left
  holdSpan: 264,            // dawdle, hoppet, buzzle, truffle: largest distance beyond `contact` at which the entity is placed. Set at spawn. 0 for other kinds
  harmful: true,            // presentation hint. false for crates, and for digby while t < DIGBY_POP_T
  onScreen: true,           // the sprite box intersects the playfield (section 4.13)
  urgent: false,            // eta < config.urgentTime. Always false for crates, and for every threat while timeScale is 0 (a Pocket Watch)
  tutorial: false,
  intro: false,
  section: 0,               // section index at spawn
  dead: false,              // set by TG.Entities.remove; removed from state.entities at the end of the step
  reason: null,             // why it was removed
  animT: 0,                 // ws since spawn (presentation hint)
  flipX: false,             // presentation hint; true for truffle (it faces right), and for a flit from its turn
  phase: 'approach',        // presentation hint. swoop: 'enter' | 'hover' | 'dive'. digby: 'mound' | 'up'.
                            // dangle: 'drop' | 'hang'. flit: 'enter' | 'cross' | 'behind' | 'dive'.
                            // dawdle, hoppet, buzzle, truffle: 'hold' while waiting at the screen edge, then 'approach'. others: 'approach'
  turned: false,            // flit only; other kinds do not have the field. true from the step on which it has crossed to its hover
                            // point behind Pip (t >= FLIT_CROSS_T), when the second threat:warn is emitted
  skin: 'en_baronet'        // presentation hint, present only when the spawn spec gave one (section 4.13): the sprite the entity is
                            // drawn in, in place of its kind's and of the level's skin for the kind. Nothing in the simulation reads it
};

crate = {
  /* ...threat fields, with... */
  type: 'crate', kind: 'crate', priority: 2, harmful: false,
  power: 'shield'           // 'shield' | 'hourglass' | 'quill' | 'blast' | 'cap' | 'watch'
};
```

Budget rules applied by `TG.Entities.spawn`, in order (all in nominal seconds until the last step):

1. `range = TG.Difficulty.wordRange(config, kind, section)`. Pick the word with `picker.pick({ tierMix, minLen, maxLen, active, weak })`. `active` holds the words of every live typable, including crates and the boss word. `weak` is `TG.Typing.weakLetters(ty, 2)` when `config.weakWeighting` is true and at least 20 words have been completed, otherwise it is left out. If the result is `null`, return `null`.
2. `base = react + perChar * len`. If `intro` or `tutorial`: `base *= INTRO_FACTOR`. For a crate: `base *= CRATE_FACTOR`.
3. Queue rule: `A` = live threats and crates with untyped letters; `R` = their untyped letters in total. `queue = react + perChar * (R + len) + 0.4 * react * A`.
4. Spacing rule: `latest` = the largest remaining time (nominal) among the live threats and crates counted in `A`; `spacing = (A > 0) ? latest + impactGap : 0`.
5. `budget = max(base, queue, spacing)`. For a boulder also at least `BOULDER_MIN_BUDGET / pace`: the boulder by name, not every anchored kind.
6. Convert to world seconds: `budgetWs = budget * pace`.
7. Hazard keep-clear (threats only): `impactX = player.x + RUN_SPEED * budgetWs`. For each hazard of the level that applies to this difficulty and is not bridged, the zone is `[winStart - m, x + w + m]` with `m = hazardMargin * pace * RUN_SPEED`. While `impactX` is inside a zone, move it to the end of that zone. Then `budgetWs = (impactX - player.x) / RUN_SPEED`. A dangle hangs at head height, as a branch, a beehive and an arch do, so for a dangle the zone of each of those three is wider: it starts no later than `x - DANGLE_CLEAR - contact` and ends no earlier than `x + w + DANGLE_CLEAR - contact`. Its anchor, which is `contact` beyond `impactX`, is then at least `DANGLE_CLEAR` from the hazard's box on either side.
8. Crates follow steps 1 to 6 like threats, and a live crate is counted in `A`, `R` and `latest` when something is spawned after it. Crates skip step 7 and the active cap, and are not counted by `TG.Entities.activeThreats`.

`eta` for a threat or crate is `(budget - age + stallT) / max(timeScale, 0.01)`. While a Pocket Watch holds the world `timeScale` is 0, and `eta` is then 100 times the world time left; `urgent` and the close call (section 4.16) are not given from it on such a step.

Start positions and paths follow DESIGN 4.3 with the constants of section 3. Four points need exact wording:

- **Waiting at the edge.** For dawdle, hoppet and buzzle, `holdSpan = HOLD_SPAN - HOLD_STEP * k`, where `k` is the number of live dawdles, hoppets and buzzles whose `phase` is `hold` at the moment of the spawn. For truffle, `holdSpan = TRUFFLE_HOLD`. Each step `dist = c * budget * (1 - t)` and `dx = contact + min(dist, holdSpan)` (negated for truffle). `phase` is `hold` while `dist > holdSpan`, otherwise `approach`. While holding, a hoppet sits (`elev = 0`) and a buzzle bobs as usual.
- **Digby.** Until `t = DIGBY_POP_T`: `dx = DIGBY_DX`, `elev = -DIGBY_DEPTH`, `phase = 'mound'`, `onScreen = false`. From then to `t = 1`, with `r = (t - DIGBY_POP_T) / (1 - DIGBY_POP_T)`: `dx = DIGBY_DX + (contact - DIGBY_DX) * r`, `elev = -DIGBY_DEPTH * (1 - r)`, `phase = 'up'`, `onScreen = true`. `threat:enter` is emitted when the phase changes to `up`.
- **Dangle.** Anchored, as the boulder is: `anchorX = player.x + contact + RUN_SPEED * budget` at the spawn, and `x = anchorX` from then on. With `roof = GROUND_Y - PLAY_TOP + h`, the elevation at which the bottom of the sprite is its own height above the top of the playfield: until `t = DANGLE_DROP_T`, `elev = roof + (DANGLE_ELEV - roof) * r` with `r = 1 - (1 - t / DANGLE_DROP_T)^2`, and `phase = 'drop'`; from then on `elev = DANGLE_ELEV` and `phase = 'hang'`. It has no letter stall (5.4).
- **Flit.** With the same `roof`, and `x = player.x + dx`:
  - until `t = FLIT_ENTER_T`: `dx = FLIT_FROM_DX`, `elev` goes evenly from `roof` to `FLIT_CROSS_ELEV`, `phase = 'enter'`;
  - until `t = FLIT_CROSS_T`: `dx` goes evenly from `FLIT_FROM_DX` to `FLIT_BEHIND_DX`, `elev = FLIT_CROSS_ELEV`, `phase = 'cross'`. The flutter of the crossing is drawn by the renderer (section 4.19) and is not in `elev`;
  - until `t = FLIT_BEHIND_T`: `dx = FLIT_BEHIND_DX`, `elev` goes evenly from `FLIT_CROSS_ELEV` to `FLIT_BEHIND_ELEV`, `phase = 'behind'`;
  - until `t = 1`, with `r = ((t - FLIT_BEHIND_T) / (1 - FLIT_BEHIND_T))^2`: `dx = FLIT_BEHIND_DX * (1 - r)`, `elev = FLIT_BEHIND_ELEV + (FLY_HIT_ELEV - FLIT_BEHIND_ELEV) * r`, `phase = 'dive'`.

  On the first step with `t >= FLIT_CROSS_T` the flit turns: `turned = true`, `flipX = true`, and `threat:warn` is emitted a second time, with `from: 'behind'`. The entity's own `from` stays `above`, so what needs the side it comes from after the turn reads `turned`.

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

The two kinds are the attacks of every boss. A level may draw them in other sprites (`theme.skins.shock` and `theme.skins.pick`, section 5.9: Level 2's rolling gear and pendulum) and name them in its own tips (`boss.tips`). The action, the box and the input window of each stay those of its kind: an attack to jump has `SHOCK_WIN` and one to duck has `PICK_WIN`.

### 5.7 Boss (`state.boss`)

```js
boss = {
  kind: 'baron',            // state.level.boss.kind, or 'baron' when the level names none. Level 2: 'ratchet'
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
  rise: 0,                  // px the body is lowered behind its base (the Baron's mound, Lady Ratchet's engine): 0 = fully up, 40 = hidden
  lampRed: false,           // true from phase 2: the Baron's helmet lamp, Lady Ratchet's lenses
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

The state machine, its timing and its events are the same for every `kind`. `kind` says only how the fight is drawn and heard: `TG.Render` and `TG.Effects` choose by `state.boss.kind`, `TG.Hud` and `TG.Audio` by `state.level.boss.kind` (sections 4.17 to 4.19 and 7.1). The presentation hints are set the same way for every kind. The `rise` of `defeated` is not seen for Lady Ratchet, who has been launched out of the playfield before the last second (section 4.19).

Volley contents by phase: phase 1, all `rock`. Phase 2 and 3, the second entry is `rockhigh`. Phase 3 with `config.boss.minion`, the last entry is `minion`: a Digby spawned with `TG.Entities.spawn(state, { kind: 'digby', section: 3 })`, and with `skin: state.level.boss.minionSkin` when the level names one (Level 2: `en_baronet`). `rock` and `rockhigh` are spawned as kind `rock` with `from` `right` or `above`, using section index 3 for word range and tier mix.

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

The five kinds are the hazards of every level, with the boxes, windows and rules below. A level's theme gives them its own sprites, the colours of their bursts and, for the arch, its name in the tip (`theme.hazardSkins`, `theme.hazardFx` and `theme.hazardNames`, section 5.9): in Level 2 the bramble is drawn as crystal spikes, the branch as a low pipe, the beehive as a lantern and the arch as a tunnel.

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

Each file under `js/levels/` registers one object: `js/levels/level1.js` registers `TG.Levels[1]` and `js/levels/level2.js` registers `TG.Levels[2]`. Positions are in tiles; `TG.Level.build` converts to px. Level 1's object shows the shape:

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
    { x: 162, kind: 'crate', power: 'shield', min: 'easy' },   // power: 'shield' | 'hourglass' | 'quill' | 'blast' | 'cap' | 'watch'
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

The full list of gaps, hazards, spawns and ink drops is DESIGN 11.3 to 11.5 and Appendix B for Level 1. Level 2's is DESIGN 11A.3 to 11A.5 and Appendix B; `docs/LEVEL2.md` 9 is the plan it was written from.

**What a level may name.** Beyond the keys of Level 1's object, a level's data may carry the keys below, shown with Level 2's values. Each is optional, and so are several of the keys above. Where a level leaves a key out, the engine does what the table says, which for the keys Level 1 does not have is what it does for Level 1.

```js
TG.Levels[2] = {
  // ...
  theme: {
    // ...
    music: { level: 'level2', boss: 'boss2', ready: 'jingle_ready2' },
    hazardSkins: { bramble: 'haz_crystal', branch: 'haz_pipe', beehive: 'haz_lantern', arch: 'haz_tunnel',
                   trunk: 'haz_pipe_riser', rope: 'haz_chain', canopy: 'haz_ceiling', archTrunk: 'haz_column' },
    hazardNames: { arch: 'TUNNEL' },
    hazardFx: { bramble: [11, 26, 4], branch: [16, 18, 2], beehive: [18, 19, 16], arch: [2, 3, 1], bridge: [2, 3, 18] },   // palette indices
    skins: {                            // by kind of TG.Entities.KINDS: { sprite, remap, fx }, each part optional
      hoppet: { remap: 'tin' },
      buzzle: { sprite: 'en_glimmer', fx: { fx_flower: 'fx_star' } },
      rock:   { sprite: 'pr_cog' },
      shock:  { sprite: 'pr_rollgear' },
      pick:   { sprite: 'pr_pendulum' }
    },
    inkRemap: 'paleink'
  },
  arena: { name: 'THE GREAT CLOCK', stage: '2-B', palette: 'clock', arenaTilesFrom: 920,
           music: { transpose: 0, tempo: 160, keyOk: { root: 7, mode: 'minor' }, phase3: { tempo: 176, p2Octave: 12 } } },
  boss: {
    kind: 'ratchet', label: 'RATCHET', speech: 'TICK TOCK! WORDS INTO COGS!',
    tips: { shock: 'JUMP THE GEAR', pick: 'DUCK THE PENDULUM' },
    minionSkin: 'en_baronet',
    urgentRim: { 2: 0 }                 // boss phase: palette index
  }
};
```

| Key | What it is, and who reads it | Without it |
|---|---|---|
| `tutorial` | `true`: the level opens with tutorial threats (rule V6) and the tutorial slow-down can apply (`TG.Game.newRun`) | No tutorial threats and no slow-down |
| `tune` | Overrides of the difficulty config (below) | The difficulty table as written |
| `theme.id` | A name for the theme. Nothing in the engine reads it | |
| `theme.backdrop` | Key in `TG.Backdrops` (section 6.5). `TG.Render`; `TG.UI` for the scene of the title's idle rotation | A plain SKY band down to the ground line and no layers; on the title, Level 1's scene |
| `theme.wordFlavour` | Passed to `TG.Words.createPicker` by `TG.Game` | The five pools alone, as for a name no pool has |
| `theme.music.ready` | The track `TG.Audio` plays as the ready jingle on `level:start` | `jingle_ready`, as for a name that is not a track (rule 9 of section 2.2) |
| `theme.tiles.<key>` | The sprite of each of the twelve tiles. `TG.Render`; `TG.UI` reads `top` and `fill` for the title | Level 1's sprite for the key, as in its object above |
| `theme.hazardSkins.<key>` | The sprites of the hazards: `bramble`, `branch`, `beehive`, `arch`, and the pieces drawn with them: `trunk` (the pieces from a branch up to the top of the playfield), `rope` (the pieces a beehive hangs from), `canopy` (the crown at the top of the playfield over a branch and over an arch), `archTrunk` (the pieces at the two ends of an arch). `TG.Render` | Level 1's sprite: `haz_bramble`, `haz_branch`, `haz_beehive`, `haz_arch`, `haz_trunk`, `haz_rope`, `haz_canopy`. `archTrunk`: the theme's `trunk` |
| `theme.hazardNames.arch` | The name of the arch in the tip for holding duck. `TG.Hud` | `ARCH` |
| `theme.hazardFx.<kind>`, `theme.hazardFx.bridge` | Lists of palette indices: the particle colours of `hazard:hit` for a hazard kind, and of `hazard:bridge`. `TG.Effects` | `bramble`: GRASS, CORAL, LIME. The other kinds: GRASS, LIME, SOIL. `bridge`: SAND, CLAY, SOIL |
| `theme.skins.<kind>` | `sprite`: drawn in place of the kind's sprite. `remap`: the remap it is drawn under. `fx`: a sprite the clear leaves in place of another; only the buzzle's `fx_flower` is read. `TG.Render` and `TG.Effects` (sections 4.17 and 4.19) | The kind's own sprite and colours |
| `theme.inkRemap` | The remap the ink drops are drawn under. `TG.Render` | The drops' own colours |
| `palette` of a section or of the arena | The name of a palette of the backdrop. `TG.Render` | For a name the backdrop does not have: its `day` palette, if it has one |
| `gapFill` of a section | `'dark'`: the lower row of a gap is `tiles.gapFillDark`. `TG.Render` | `tiles.gapFill` |
| `music.keyOk` of a section or of the arena | The scale of the `key_ok` sound. `TG.Audio` | `root` 0, `mode` `'major'` |
| `arena.arenaTilesFrom` | The tile from which the arena's tiles are drawn. `TG.Level.build` | `lengthTiles` |
| `arena.music.phase3` | `{ tempo, p2Octave }` of the boss track from `boss:phase` with phase 3. `TG.Audio` (section 7.2) | `tempo` 184 and `p2Octave` 12, each on its own when only one is given |
| `decor` | Sprites drawn on the ground. `TG.Level.build`, `TG.Render` | No decor |
| `boss` | The level's boss | `level.boss` is `null`, and every key below has its default |
| `boss.kind` | Which boss it is. `TG.Boss.create` copies it to `state.boss.kind`; `TG.Hud` and `TG.Audio` read it from the level | `baron` |
| `boss.label` | The label of the boss bar. `TG.Hud` | `BARON` |
| `boss.speech` | The line of the speech plate in the boss intro. `TG.Hud` | No speech plate |
| `boss.tips.shock`, `boss.tips.pick` | The tips for the two attacks, written without `TIP: `. `TG.Hud` | `JUMP THE SHOCKWAVE`, `DUCK THE PICKAXE` |
| `boss.minionSkin` | The sprite of the phase 3 minion: `TG.Boss` gives it to the digby as its `skin` (section 5.7) | The minion is drawn as any digby of the level |
| `boss.urgentRim` | By boss phase, the colour of 1 px outside the RED border of a word plate. `TG.Render` (section 4.19) | No rim |

A sprite named in `theme.tiles`, `theme.hazardSkins`, `theme.skins.<kind>.sprite` or `boss.minionSkin` is put where Level 1's sprite goes and is drawn with that sprite's frames, so it has the same size, anchor, frame names and frame rate. A sprite named in a skin's `fx` has the size and the anchor of the one it replaces, and is played with its own frames. `TG.Level.validate` looks at none of this: the `skins` check of `test/sim.js` does (section 10.4).

**The tune block.** `tune` holds overrides of the difficulty config (section 5.10) for this level. It is how a later level is made harder than the one before it, and it is where WP-E records tuning changes for Level 1 (section 12.1).

```js
tune: {
  all:    { lenShift: [1, 2, 3] },                  // applied on every difficulty
  easy:   { maxActive: [2, 2, 3, 2] },              // then the entry for the chosen difficulty
  medium: { react: 1.1, boss: { telegraph: 0.9 } }, // nested objects are merged key by key
  hard:   { }
}
```

Every key is optional. Only the keys in `TG.Difficulty.TUNABLE` may appear at the top level of `all`, `easy`, `medium` and `hard`. `TG.Game.newRun` and `TG.Game.nextStage` apply the block with `TG.Difficulty.resolve` (section 4.5). Level 1 was delivered with an empty block; after a play review it has `medium: { react: 1.0, perChar: 0.45, boss: { health: 5, coreWords: [1, 2, 2] } }` and `hard: { react: 0.6, perChar: 0.27, boss: { health: 7, coreWords: [2, 2, 3] } }` (section 14.2).

Level 2's block has no `all` part. A key it does not name keeps the value of section 5.10; section 5.10 also says which values a block replaces whole, and section 12.1 how far a level may move one.

| Key | easy | medium | hard |
|---|---|---|---|
| `react` | 1.4 | 0.9 | 0.55 |
| `perChar` | 0.8 | 0.4 | 0.25 |
| `impactGap` | 2.7 | 1.3 | 0.8 |
| `maxActive` | `[2, 2, 2, 2]` | `[2, 3, 3, 3]` | `[3, 3, 4, 4]` |
| `lenShift` | `[0, 1, 1]` | `[1, 1, 2]` | `[1, 2, 2]` |
| `wordLen.rock` | `[3, 5]` | not named | `[6, 8]` |
| `tierMix[0]` | `{2: 0.7, 1: 0.3}` | `{2: 0.5, 1: 0.5}` | `{2: 0.4, 1: 0.6}` |
| `tierMix[1]` | `{3: 0.6, 2: 0.4}` | `{3: 0.5, 2: 0.5}` | `{3: 0.5, 2: 0.5}` |
| `tierMix[2]` | `{3: 0.8, 2: 0.2}` | `{3: 0.7, 2: 0.3}` | `{3: 0.8, 2: 0.2}` |
| `tierMix[3]` | `{2: 0.6, 1: 0.4}` | same | same |
| `boss.health` | 3 | 6 | 7 |
| `boss.coreWords` | `[1, 1, 1]` | `[2, 2, 2]` | `[2, 2, 3]` |
| `boss.rocks` | `[2, 3, 3]` | `[2, 3, 4]` | `[3, 4, 5]` |
| `boss.launchGap` | `[3.6, 3.2, 2.9]` | `[2.0, 1.8, 1.5]` | `[1.3, 1.1, 0.9]` |
| `boss.coreLen` | `[5, 6]` | `[8, 9]` | `[10, 12]` |
| `boss.finisherLen` | `[7, 7]` | `[11, 11]` | `[14, 15]` |
| `boss.minion` | true | not named | not named |

Ink drop positions: a drop's `y` is its bottom. Row and under: `y = GROUND_Y - 4`. Arc: five drops at x offsets `-16, -8, 0, 8, 16` px from the gap's centre. The height above the ground of a drop at offset `d` is `min(36, max(0, 4 * JUMP_HEIGHT * s * (1 - s)))` with `s = (d + 24) / JUMP_DIST`, which is the arc of a jump that takes off 24 px before the gap's centre. The five heights are 22.2, 35.6, 36, 35.6 and 22.2 px, the same for both gap widths, and `y = GROUND_Y - height`.

`TG.Level.validate(data)` checks:

| Code | Rule |
|---|---|
| V1 | Sections are contiguous from 0 to `lengthTiles`; `checkpoints` are 0, each later section's `from`, and `lengthTiles` |
| V2 | Every gap has `w` of 1 or 2 and at least 4 tiles of ground before the next gap |
| V3 | A jump hazard and a duck hazard are at least 6 tiles apart, measured between left edges (gaps count as jump hazards) |
| V4 | No gap or hazard within `CHECKPOINT_CLEAR` tiles after a checkpoint, and none at or beyond `lengthTiles - 16` |
| V5 | Every spawn `kind` is a threat or crate kind in `TG.Entities.KINDS`; every crate has a valid `power` (`shield`, `hourglass`, `quill`, `blast`, `cap` or `watch`); every `min` is a difficulty name |
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
  boss: { kind: 'baron', speech: '...' }    // the data's boss object as it is, with every key it has; null when the data has none
};
```

The `tune` block is not copied into the runtime level; it has already been applied to `state.config`. `theme`, each section's and the arena's `music`, and `boss` are the objects of the data, not copies, so the optional keys above reach their readers through `state.level`.

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
    swoop: [5, 6], truffle: [4, 5], digby: [5, 6], crate: [5, 8], rock: [4, 5],
    dangle: [5, 6], flit: [5, 6]
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
| `wordLen.dangle` | `[3, 4]` | `[5, 6]` | `[6, 8]` |
| `wordLen.flit` | `[3, 4]` | `[5, 6]` | `[6, 9]` |
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

`wordLen` has a range for every threat and crate kind of `TG.Entities.KINDS`, `dangle` and `flit` among them, though only Level 2 spawns those two. For a kind with no range, `TG.Difficulty.wordRange` warns once and uses 2 to `MAX_WORD_LEN`.

What a level's `tune` block replaces follows from the merge rule of section 4.5. An object is merged key by key: a block names single kinds in `wordLen` (Level 2 names `rock` alone, on Easy and Hard) and single fields in `boss` and in a `bot` profile, and the rest keep the values above. An array is replaced whole: a block that names `maxActive`, `lenShift`, `tierMix`, or one of `coreWords`, `rocks`, `launchGap`, `coreLen` and `finisherLen` in `boss`, or a kind's range in `wordLen`, writes every entry of it. Level 2 replaces `tierMix` whole on each difficulty (section 5.9).

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

`state.result`, built by `TG.Game` when a stage finishes (`level:clear` or `endRun`). A run can cover two stages (`TG.Game.nextStage`, LEVEL2 12.2): each stage that ends has a result of its own, and `nextStage` sets `state.result` back to `null`.

```js
result = {
  cleared: true,            // the stage that has just ended was cleared; false when the run was ended from game over or the pause menu
  levelId: 1, difficulty: 'medium',
  score: 48210,             // the run's score, bonuses included
  baseScore: 41210,         // the run's score before the bonuses of this stage
  bonuses: [ { id: 'lives', label: 'LIVES X3', points: 3000 }, { id: 'accuracy', label: 'ACCURACY 95%', points: 3000 }, { id: 'nocontinue', label: 'NO CONTINUES', points: 2000 } ],
                            // the bonuses of this stage
  time: 301.4,              // s, real: the whole run's
  typing: { /* summary, as above: the whole run's */ },
  ink: 131, livesLost: 2, lives: 3, continues: 0,   // ink, livesLost and continues: the whole run's. lives: what Pip held as the stage ended
  rank: 'A',                // 'S' | 'A' | 'B' | 'C' (DESIGN 8.6), from the whole run. S and A need stages > 0
  suggestion: null,         // 'READY FOR MEDIUM?' | 'READY FOR HARD?' | null. Tier 2: always null if left out
  bestWpm: 26.0,            // personal best WPM for the difficulty before the run, 0 if none
  assist: 1.0,              // assist value at the end of the stage
  adaptive: true,           // adaptive pacing was on for the run; TG.Save.recordRun stores assist only when this is not false
  stages: 1,                // stages the run has cleared, this one included: 0, 1 or 2
  stageScore: 0,            // the score the run held when this stage began: 0 in a run's first stage, the carried total after nextStage
  stageTime: 301.4,         // s, real: this stage's own time. Equal to time in a run's first stage
  bestScore: 40000          // best score for the difficulty before the run, 0 if none
};
```

End-of-level bonuses are added only when `cleared` is true. They are added to the score with a `score:add` event and without the test for extra lives. On a high score entry, a run counts as cleared when `stages > 0` (LEVEL2 12.5).

`cleared` and `stages` say different things in a run of two stages. A run that clears Level 1 and ends in Level 2 has a last result with `cleared: false` and `stages: 1`: no bonuses for the stage that ended, a rank that may still be S or A, and an entry with `cleared: true`. `TG.Save.recordRun` reads `cleared` with `levelId` for the unlock (section 4.4), and `TG.Board.stat` is given `cleared` and `stageTime` for the count of the stage (section 4.20).

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
    initials: 'PIP',
    worldScores: true,      // world scores (section 4.22): send finished runs and show the world boards. false: no request is made
    lastLevel: 1,           // the stage last chosen on the STAGE row: 1 or 2, and never a level that is not open
    clearedEasy: 0,         // the highest level cleared on each difficulty: 0, 1 or 2. TG.Save.recordRun raises the one
    clearedMedium: 0,       // of result.difficulty to result.levelId when result.cleared. Level 2 is open when any of the
    clearedHard: 0          // three is 1 or more (TG.Save.levelOpen)
  },
  scores: { easy: [ /* SCORE_SLOTS entries */ ], medium: [ /* ... */ ], hard: [ /* ... */ ] },
  best:   { easy: { wpm: 0, score: 0 }, medium: { wpm: 0, score: 0 }, hard: { wpm: 0, score: 0 } },
  assist: { easy: 1, medium: 1, hard: 1 },
  pending: null             // { difficulty, entry }: the entry of a run that went on to the next stage (LEVEL2 12.6), or null
};

entry = {
  name: 'PIP',              // 3 characters, A-Z
  score: 48210,
  wpm: 28,                  // rounded
  accuracy: 95,             // whole percent
  rank: 'A',
  cleared: true,            // the run cleared at least one stage
  date: '2026-09-29'        // set by TG.UI; '' for seeded entries
};
```

The version is 1, and the fields added for Level 2 (`lastLevel`, the three `cleared` numbers and `pending`) are added under it: nothing is migrated (LEVEL2 12.6). A record stored before them loads as it is and takes their defaults, with one exception: when it has none of the three `cleared` numbers, the number of a difficulty is 1 if its table holds an entry with `cleared: true` and a date. A number setting is kept as a whole number in its range, whose upper end is `LAST_LEVEL` (section 4.4), and a value that is not a number takes the default. `lastLevel` goes back to 1 on load when it names a level that is not open. A `pending` that is not `{ difficulty, entry }` with a difficulty name and a valid entry is read as `null`. A stored record whose `version` is not 1 is read as empty (section 4.4).

An entry's `cleared` is written by `TG.UI` from `result.stages > 0` (section 4.20): the run cleared at least one stage, whichever stage it ended in. `TG.Save.resetScores` returns `scores` and `best` to their defaults and leaves `settings`, `assist` and `pending` as they are.

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
  tailX: 317, tailY: 164    // screen px where the 1 px tail ends: the top centre of the sprite as it is drawn, with a dangle's sway
                            // and a flit's flutter (section 4.19); null for edge tags
};
```

Algorithm:

1. Take every typable entity (not boss words). Order: the locked one first, then by `eta` ascending, then `id`. The locked one is `state.typing.target`; `locked` is true for its plate, and `dim` is true for every other plate while `state.typing.target` is not `null`.
2. Wanted position: centred on the entity's screen x, bottom of the plate 4 px above the top of the sprite box. The plate holds still over a dangle that sways and a flit that flutters (section 4.19): it is placed from the entity's own x and y, and for a flit in its crossing 4 px above the top of the flutter's reach, which is up to 4 px above the sprite box.
3. If the sprite box is outside the playfield (the view in x, `PLAY_TOP` to `GROUND_Y` in y), the plate is an edge tag: pinned 2 px inside the edge named by where the entity is (`right`, `left`, `top`, `bottom`). For `left` and `right` the plate is at the y of the entity clamped to the playfield. For `top` and `bottom` it is centred on the x of the entity, clamped to the view; for `bottom` the edge is the ground line, and the plate's bottom is at `GROUND_Y - 12`, which is 4 px above the 8 px mound that marks the spot, so the plate does not cover the mound. The test is made in this order: below the ground line gives `bottom`, beyond the right edge of the view gives `right`, above `PLAY_TOP` gives `top`, and anything else `left`. In Level 1, `bottom` is used by a Digby that is still underground, `top` by a Swoop that is entering and by a high rock, and `right` by a Boulder that is still beyond the edge. In Level 2, `right` is also used by a Dangle whose anchor is still beyond the edge, from its spawn, while it is above the playfield as well; `top` by a Dangle that drops inside the view and by a Flit that is entering. Creatures that wait at the screen edge (section 5.5) are on screen and have ordinary plates.
4. Clamp to `x` in `[2, 382 - w]` and `y` in `[PLAY_TOP, 174]`.
5. If the plate overlaps a plate already placed (with a 1 px margin), move it up 10 px and test again. If it would pass `PLAY_TOP`, place it 10 px below the lowest plate it overlapped and continue downwards.
6. Boss words are not in this list. `TG.Hud` draws them on the boss plate.

`layoutLabels` places the plates and draws nothing. `TG.Render.draw` draws them in its step 9 (section 4.19), where a plate with a RED border can have a rim 1 px outside it; the layout does not take the rim into account.

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

- Enemy, projectile and boss sprites are drawn **facing left** (towards Pip). Pip faces right. The renderer sets `flipX` for anything that faces the other way (Truffle; a crow flying off; a Flit from its turn behind Pip).
- 1 px INK outline on every sprite except tiles and backdrop pieces.
- Colour counts: enemies 3 plus INK, Pip 5 plus INK, the parts of one boss 6 plus INK between them, items and effects at most 4 plus INK. The Baron's six are SOIL, CLAY, PINK, GOLD, WHITE and RED, with CREAM for the lamp glass on `boss_head`. Lady Ratchet's are STONE, TEAL, GOLD, PINK, WHITE and BRONZE, with CREAM for the lenses on `boss2_head` and `boss2_goggles`.
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
| `lampred` | WP-C | While `boss.lampRed` (from phase 2): the Baron's lamp, and Lady Ratchet's lenses on `boss2_head` and on the goggles a hit knocks off (`boss2_goggles`) | `{ 19: 25 }` (CREAM to RED). The lamp glass is the only CREAM on `boss_head`, in all four frames, and the brass helmet is GOLD, so the remap changes the lamp and nothing else |
| `sunset` | WP-D | Section 3 backdrop and tiles | SKY and HAZE to ORANGE and CORAL; ROYAL to VIOLET; FOREST and PINE to PLUM-leaning greens. WP-D writes the table |
| `dusk` | WP-D | Boss arena backdrop and tiles | Blues to DEEP_BLUE, greens to PINE and DEEP_TEAL, hills to PLUM and INK. WP-D writes the table |
| `tin` | WP-C | Level 2: the frog (`en_hoppet`) and its lily pad (`fx_lilypad`), through `theme.skins`. An entity's remap, not a section's | `{ 14: 3, 15: 4, 4: 18, 13: 2 }` (GRASS to SILVER, LIME to WHITE, WHITE to GOLD, FOREST to STONE). A silver frog with brass eyes and a tin disc for its pad, whose underside is FOREST. These are not the pairs of LEVEL2 Appendix C (GRASS to BRONZE, LIME to GOLD, WHITE to SILVER): that frog was lost on the brass floor of section 2, and that table left the pad's underside green |
| `brass` | WP-D | Level 2: section 2 and boss arena backdrop and tiles (palettes `brass` and `clock`) | `{ 2: 16, 10: 18 }` (STONE to BRONZE, TEAL to GOLD) |
| `crystal` | WP-D | Level 2: section 3 backdrop and tiles (palette `crystal`) | `{ 28: 5, 16: 9, 18: 11, 17: 10 }` (PLUM to DEEP_BLUE, BRONZE to DEEP_TEAL, GOLD to AQUA, ORANGE to TEAL) |
| `paleink` | WP-D | Level 2: the ink drops (`item_ink`), in every section; the level names it as `theme.inkRemap` (section 5.9; the fallback of LEVEL2 3.1, rule 2). An item's remap, not a section's | `{ 6: 7, 5: 6 }` (ROYAL to SKY, DEEP_BLUE to ROYAL). The drop then has the colours of `icon_ink` |

The four Level 2 remaps list only the colours they change; every other colour is left as drawn (LEVEL2 3.1 and Appendix C). `test/test-gfx.js` and `test/test-sprites-world.js` read the rows of this table that give their pairs as `{ ... }` and compare them, and the words after them, with `TG.Remaps`. A section's remap is applied to the backdrop pieces, the tiles and the ceiling rim `haz_ceiling`, as `haz_canopy` takes it in Level 1.

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
| `boss_monocle` | 8x8 | 1 | monocle | 0 | 4,4 | Pops off on a hit (effect). It also pops off a Baronet that is cleared (effect) |
| `boss_helmet` | 16x8 | 1 | helmet | 0 | 8,4 | Flies off on defeat (effect). A Baronet that is cleared loses this helmet, where a Digby loses `fx_helmet` (effect) |
| `pr_rock` | 12x12 | 2 | k0 k1 | 10 | 6,12 | |
| `pr_pickaxe` | 16x16 | 4 | p0 p1 p2 p3 | 12 | 8,16 | Four rotation steps |
| `pr_shock` | 16x8 | 2 | s0 s1 | 10 | 8,8 | |

The renderer chooses the parts of the boss by `boss.kind`; a kind it has no parts for is drawn as the Baron. The Baron's composition (boss kind `baron`), drawn in this order, with `bx = boss.x`, `by = boss.y`, `r = boss.rise`:

| Part | Position | Frame |
|---|---|---|
| `boss_body` | `bx, by - 8 + r` | `b0`, `b1` at 4 fps |
| `boss_arm` (far) | `bx + 20, by - 26 + r`, `flipX` | `rest` unless pose is `raise` or `throw` |
| `boss_head` | `bx - 2, by - 34 + r` | pose `laugh`: laugh; `hurt`: hurt; `dizzy`: dizzy; others: normal. Remap `lampred` when `boss.lampRed`; remap `white` while `flashT > 0` |
| `boss_arm` (near) | `bx - 20, by - 26 + r` | `raise` for pose `raise` and `stomp`; `throw` for pose `throw`; otherwise `rest` |
| `boss_mound` | `bx, by` | |

Parts are clipped at `by` so nothing shows below the ground line while the body is lowered.

Level 2 (LEVEL2 2, 3.5, 4 and 10.1; the rows are those of LEVEL2 Appendix C). A sprite that takes the place of a Level 1 sprite keeps that sprite's size, frame names, fps and anchor, so that the renderer can draw one for the other; the Level 1 name is given in "Used for". Lady Ratchet's parts use STONE, TEAL, GOLD, PINK, WHITE and BRONZE between them, with CREAM on the lenses of her goggles only (the two on `boss2_head`, and the pair that is `boss2_goggles`), so that `lampred` changes the lenses and nothing else.

| Name | Size | Frames | Frame names | fps | Anchor | Used for |
|---|---|---|---|---|---|---|
| `en_dangle` | 16x16 | 3 | hang0 hang1 zip | 4 | 8,16 | Dangle, a cave spider. `hang0`, `hang1` while it drops and hangs on its thread (the renderer draws the thread; the sprite's top row is opaque at the anchor's x, where the thread meets it); `zip` in the clear animation |
| `en_flit` | 24x16 | 3 | flap0 flap1 dive | 8 | 12,16 | Flit, a bat. The row of `en_swoop`. Flap: frames 0, 1. `dive` while `phase` is `dive` and in the clear animation. Drawn with `flipX` from its turn behind Pip |
| `en_glimmer` | 16x16 | 2 | fly0 fly1 | 16 | 8,16 | Glimmer, a glow-moth. The row of `en_buzzle`, whose kind it skins; drawn in the bee's rows, 0 to 11 |
| `en_baronet` | 16x16 | 3 | peek up spin | 0 | 8,16 | The Baron at minion size in a spare helmet. The row of `en_digby`, whose kind it skins in phase 3; also the cameo of the boss intro. `peek` with the helmet over his eyes, `up` with the monocle showing; `spin` has neither helmet nor monocle (they fly off as `boss_helmet` and `boss_monocle`) |
| `boss2_body` | 48x32 | 2 | b0 b1 | 0 | 24,32 | Lady Ratchet. The size and anchor of `boss_body`. `b0` standing; `b1` the foot lifted and the tail twitched. The foot is in rows 24 to 31, behind the engine; above it `b1` shows the hem a pixel higher, the chain swung and the tail's tip flicked to the other side. Rows 0 to 9 are the same in both. fps 0: the renderer picks the frame |
| `boss2_head` | 32x24 | 4 | normal laugh hurt dizzy | 0 | 16,24 | The row of `boss_head`. A long snout with two WHITE buck teeth under its tip in every frame. Goggle rims GOLD, the two lenses CREAM (see `lampred`, section 6.3); `hurt` has no goggles and so no CREAM. Rows 0 and 1 are empty, so that at `rise` 40 the engine hides the whole head |
| `boss2_arm` | 16x16 | 4 | rest raise throw watch | 0 | 8,8 | The frames of `boss_arm` and `watch`, the near arm during a taunt and during the gesture of the long intro. Left arm as drawn; right arm with `flipX`. The shoulder is on the right edge at rows 4 to 7 in every frame. `rest` hand on hip; `raise` holds a spanner; `watch` holds the pocket watch up under her nose, and is the only frame with GOLD |
| `boss2_key` | 16x16 | 4 | k0 k1 k2 k3 | 0 | 8,8 | The wind-up key in her back: a bow of two wings on a stem one pixel wide. Drawn between the far arm and the head; the stem ends at the anchor, on the top edge of the far shoulder. The four frames are four steps of half a turn, after which the bow looks the same again: `k0` face on, `k1` the left wing near and wide, `k2` edge on, `k3` the right wing near and wide (`k1` mirrored). So k0 to k3 in a loop is a steady turn one way, eight frames to the turn, and k3 to k0 is the turn backwards. The renderer shows one frame step for each half turn (the table of her composition below). At her defeat the key flies out of her back (effect) |
| `boss2_engine` | 48x16 | 2 | shut open | 0 | 24,16 | The brass engine with its hatch, the arched door in the middle of its front: a porthole in it, hinged on its right; `open` shows it swung aside. The size and anchor of `boss_mound`; drawn in front of the body. The two frames differ only in columns 17 to 32. The dial of the boiler gauge is on the left: its centre is column 6, row 6 (`bx - 18, by - 10`), with a WHITE face 3 px to the left, to the right and above it for the needle the renderer draws |
| `boss2_goggles` | 8x8 | 1 | goggles | 0 | 4,4 | The row of `boss_monocle`. Pops off on a hit, and once more at her defeat (effect). GOLD rims, CREAM lenses: drawn with `lampred` while `boss.lampRed`, it matches the lenses on her head |
| `pr_cog` | 12x12 | 2 | k0 k1 | 10 | 6,12 | A cog. The row of `pr_rock`, whose kind it skins |
| `pr_rollgear` | 16x8 | 2 | s0 s1 | 10 | 8,8 | A gear rolling along the floor: the upper half of a big gear, its hub on the floor line. The row of `pr_shock`, whose kind it skins |
| `pr_pendulum` | 16x16 | 4 | p0 p1 p2 p3 | 12 | 8,16 | A pendulum, a round bob on a thin rod, four swing steps: left, down, right, down, the bob a row higher at the two ends. The row of `pr_pickaxe`, whose kind it skins |

Lady Ratchet's composition (boss kind `ratchet`), drawn in this order, with `bx`, `by` and `r` as for the Baron and `time` the scene clock (section 6.6). Her parts are clipped at `by` as his are, and in pose `stomp` every part but the engine is drawn 2 px lower.

| Part | Position | Frame |
|---|---|---|
| `boss2_body` | `bx, by - 8 + r` | `floor(time) % 2`, and `floor(time * 4) % 2` in state `taunt`, which taps the foot. `b1` in states `finisher` and `defeated` |
| `boss2_arm` (far) | `bx + 20, by - 26 + r`, `flipX` | `rest` in every pose. Raised with the near arm, as the Baron's far arm is, she would hold two spanners |
| `boss2_key` | `bx + 14, by - 30 + r` | `floor(time * n) % 4`, with `n` 2, 4 and 8 in phases 1, 2 and 3, and 16 while the pose is `raise`. `k0` in states `intro`, `recoil`, `laugh` and `defeated`, but for the clicks of the long intro (below). In state `finisher`, `(4 - typed % 4) % 4` with `typed` from the finisher word, so each letter typed turns the key one step back |
| `boss2_head` | `bx - 2, by - 34 + r` | By pose, as `boss_head`. Remap `lampred` when `boss.lampRed`; remap `white` while `flashT > 0`. For the first 0.6 s of a taunt the lenses flash, as the Baron's lamp does |
| `boss2_arm` (near) | `bx - 20, by - 26 + r` | `raise` for pose `raise` and `stomp`; `throw` for pose `throw`; otherwise `watch` in state `taunt` and `rest` in every other state |
| `boss2_engine` | `bx, by` | `shut`. `open` while the minion is sent out: state `volley`, pose `throw`, and the entry launched last is `minion` |
| The needle of the gauge | 4 px long, from the centre of the dial at `bx - 18, by - 10` | It points left at empty and turns over the top to the right at full, by the part of the volley that was typed: `boss.volley.hits / boss.volley.toLaunch.length`. RED while a weak-point word is open (state `taunt`), otherwise INK. At empty in states `finisher` and `defeated` |

Her long intro (`boss.introTime` above `BOSS_INTRO_SHORT`), with `u = boss.stateT / boss.introTime`:

| `u` | What is drawn |
|---|---|
| 0 to 0.25 | She is out of sight: `r` is taken as 40, whatever `boss.rise` is, and the engine is `open`. The cameo is drawn over the engine: `en_baronet` in its `up` frame, with `flipX`, comes in from 304 px left of `bx` in six hops 6 px high, reaches the hatch at 0.9 of this span and drops 16 px into it, turned from side to side 20 times a second. Of the drop only the part inside the opening of the hatch (`bx - 5` to `bx + 5`, `by - 12` to `by`) is drawn |
| 0.25 to 0.5 | She rises: `r` goes from 40 to 0 |
| 0.5 to 0.7 | Her gesture: head `normal`, near arm `watch`, and the key at `k1`, `k2` and `k3` from `u` 0.55, 0.6 and 0.65, the moments at which `TG.Audio` plays `click` (section 7.1) |
| 0.7 to 1 | The head of her pose, which is `laugh`. The key stays at `k3` until the intro ends |

In either intro the engine and the needle are drawn 1 px to the right on alternate twentieths of a second while `0 < r < 40`. The short intro after a continue has no cameo and no gesture: she is drawn at `boss.rise`, with the head of her pose.

Her defeat, on `state.screenT` of `levelComplete`. The picture is frozen for 0.5 s and then flashes, as for the Baron (section 14.2). From 0.55 s the key is not drawn and her head is `hurt`, the frame without goggles: `TG.Effects` throws the key and the goggles from that moment. From 1.2 s the engine is `open` and she is drawn `480 * (screenT - 1.2)` px higher, her body flipped 20 times a second, until she has risen by `by` px; after that only the engine and the needle are drawn.

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
| `fx_star` | 8x8 | 2 | s0 s1 | 8 | 4,4 | Dawdle, rock, dizzy boss. The twinkles a cleared Dangle (two) and a cleared Flit (three) leave. Four of them where a skin's `fx` names it for `fx_flower` (Level 2's glow-moth) |
| `fx_flower` | 8x8 | 2 | f0 f1 | 4 | 4,4 | Buzzle, unless the level's skin for the kind names another sprite in its place (`theme.skins.buzzle.fx`, section 5.9) |
| `fx_lilypad` | 16x8 | 1 | pad | 0 | 8,4 | Hoppet. Drawn with the remap of the level's skin for the kind, so Level 2's tin frog leaves a tin disc |
| `fx_daisy` | 8x8 | 3 | d0 d1 d2 | 0 | 4,8 | Digby; grows through its frames. Where a Baronet went down, `fx_cogbit` grows in its place |
| `fx_helmet` | 8x8 | 1 | helmet | 0 | 4,4 | Digby (a Baronet loses `boss_helmet`) |
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

Level 2 (LEVEL2 3.3 to 3.5; the rows are those of LEVEL2 Appendix C). The level names its tiles and hazard skins in `theme.tiles` and `theme.hazardSkins`; each has the size, frame names, fps and anchor of the Level 1 sprite it takes the place of, which is given in "Used for".

Level 2 tiles (16x16, anchor 0,0):

| Name | Frames | Frame names | fps | Used for |
|---|---|---|---|---|
| `tile_cave_top` | 2 | g0 g1 | 0 | `tiles.top`, for `tile_grass`. Rock with moss specks |
| `tile_cave_fill` | 2 | s0 s1 | 0 | `tiles.fill` and `tiles.arenaFill`, for `tile_soil` |
| `tile_cave_edge_l` | 1 | edge | 0 | `tiles.edgeL`, for `tile_edge_l` |
| `tile_cave_edge_r` | 1 | edge | 0 | `tiles.edgeR`, for `tile_edge_r` |
| `tile_cave_wall_l` | 1 | wall | 0 | `tiles.wallL`, for `tile_wall_l` |
| `tile_cave_wall_r` | 1 | wall | 0 | `tiles.wallR`, for `tile_wall_r` |
| `tile_pool` | 2 | w0 w1 | 3 | `tiles.gapFill`, for `tile_water`. A glowing pool, AQUA, DEEP_TEAL and SHADOW only, so that no section remap changes it |
| `tile_girder` | 1 | plank | 0 | `tiles.plank`, for `tile_plank`. A girder over a bridged gap: a STONE beam four rows deep with a GOLD deck line and GOLD rivets, open between its struts. BRONZE under `brass`; under `crystal` it stays STONE and the GOLD turns AQUA |
| `tile_clockfloor` | 2 | a0 a1 | 0 | `tiles.arenaTop`, for `tile_arena`. Dark floor plates with the brass inlaid: SHADOW under a BRONZE edge with GOLD rivets, a BRONZE cog in a0 and a stud in a1; `tile_rail` is drawn over it, on the SHADOW bed of its top four rows |

Level 2 hazard skins (anchor bottom left):

| Name | Size | Frames | Frame names | fps | Anchor | Used for |
|---|---|---|---|---|---|---|
| `haz_crystal` | 16x16 | 1 | bramble | 0 | 0,16 | `hazardSkins.bramble`, for `haz_bramble`. A cluster of three AQUA shards with CORAL points; the shards fill the lower 8 px |
| `haz_pipe` | 16x16 | 1 | branch | 0 | 0,16 | `hazardSkins.branch`, for `haz_branch`. A low pipe hanging from the roof: the riser ends in a wide outlet, mouth down, with a CORAL glow and drips at the mouth |
| `haz_pipe_riser` | 16x16 | 1 | trunk | 0 | 0,16 | `hazardSkins.trunk`, for `haz_trunk`. Tiled upwards from the low pipe to the roof |
| `haz_lantern` | 16x24 | 1 | hive | 0 | 0,24 | `hazardSkins.beehive`, for `haz_beehive`. A lantern; the renderer swings it as it swings the beehive |
| `haz_chain` | 16x16 | 1 | rope | 0 | 0,16 | `hazardSkins.rope`, for `haz_rope`. Tiled upwards from the lantern |
| `haz_tunnel` | 48x16 | 1 | arch | 0 | 0,16 | `hazardSkins.arch`, for `haz_arch`. A low rock tunnel: a shelf of rough rock between the feet of two columns, with CORAL-tipped stalactites under it |
| `haz_ceiling` | 48x16 | 1 | canopy | 0 | 0,16 | `hazardSkins.canopy`, for `haz_canopy`. A rock rim where the riser or the tunnel's columns meet the roof: three hanging lumps, one over each column and one over a riser, at full width above them so that it covers the columns. SHADOW and PLUM, with the section's remap. Also four items of the backdrop `cavern`, as a hint of the roof in sections 2 and 3 (6.5) |
| `haz_column` | 16x16 | 1 | trunk | 0 | 0,16 | `hazardSkins.archTrunk`, for `haz_trunk` above the tunnel's first and last 16 px. Rough rock columns, 12 px wide (the riser is 8) |

Level 2 power-up, effects and decor:

| Name | Size | Frames | Frame names | fps | Anchor | Used for |
|---|---|---|---|---|---|---|
| `pw_watch` | 16x16 | 2 | p0 p1 | 4 | 8,16 | The Pocket Watch. The row of every `pw_` icon: 12x12 art centred in the cell; the hand ticks between the frames |
| `fx_cogbit` | 8x8 | 2 | c0 c1 | 0 | 4,4 | Clockwork bits, a cog (c0) and a small collar (c1): Lady Ratchet's defeat and the Baronet's clear. The row of `fx_chunk` |
| `fx_flake` | 8x8 | 2 | f0 f1 | 6 | 4,4 | Snowflakes drifting down the shaft after the defeat. The row of `fx_feather` |
| `decor_hole` | 32x32 | 1 | hole | 0 | 0,32 | Decor at the start of the level: the bottom of the Baron's hole, a heap of earth under the end of a rope. The rope runs off the top of the frame, 32 px above the floor, fading to BARK there, and ends in a knot 3 px above the heap |

Level 2 backdrop pieces, backdrop `cavern` (anchor bottom left):

| Name | Size | Frames | Frame names | fps | Used for |
|---|---|---|---|---|---|
| `bg_mist` | 64x16 | 2 | m0 m1 | 2 | L1, sections 1 to 3 |
| `bg_gearstar` | 8x8 | 2 | s0 s1 | 2 | Arena sky, as the palette's `starSprite`. The row of `bg_star`. A dark cog whose teeth glint in turn |
| `bg_clockface` | 48x48 | 2 | c0 c1 | 1 | Arena sky, as the palette's `moonSprite`. The minute hand ticks once a second |
| `bg_cave_far` | 128x48 | 2 | w0 w1 | 2 | L2, tiles horizontally. Its four dots twinkle between the frames |
| `bg_cave_mid` | 128x56 | 1 | wall | 0 | L3, sections 1 to 3, tiles horizontally. SHADOW rocks; below y 150 the rock round its arch is lit in single BRONZE pixels |
| `bg_roots` | 32x24 | 1 | roots | 0 | L3, section 1. Hangs from the roof: its bottom is at y 40 |
| `bg_lantern` | 16x24 | 2 | l0 l1 | 3 | L3, sections 1 and 2. A lantern on a post, one in each arch of `bg_cave_mid`. The lit side of the post is ORANGE, then BRONZE |
| `bg_cog_l` | 48x48 | 4 | c0 c1 c2 c3 | 4 | L3, section 2 and the arena. A big turning cog, SHADOW inside a 1 px BRONZE line, with 1 px spokes and a 2 x 2 GOLD pin |
| `bg_pipe_v` | 16x48 | 1 | pipe | 0 | L3, section 2. A standpipe, SHADOW inside a 1 px BRONZE line, with two GOLD rivets on each flange |
| `bg_crystal_l` | 32x24 | 1 | crystal | 0 | L3, section 3, one before each arch of `bg_cave_mid`. DEEP_TEAL with a TEAL face and an AQUA glint |
| `bg_stalagmite` | 16x24 | 1 | spike | 0 | L4, sections 1 and 3 |
| `bg_pipe_h` | 32x16 | 1 | pipe | 0 | L4, section 2 and the arena. A pipe run, SHADOW inside a 1 px BRONZE line, without GOLD |
| `bg_baronpeek` | 16x16 | 2 | out in | 1 | Layer `peek`, section 2. The Baron looks out of the end of a pipe and ducks back. SOIL, GOLD, PINK and WHITE, with BRONZE and SHADOW for the pipe mouth, which is drawn as `bg_pipe_h` is |
| `bg_rail` | 32x8 | 1 | rail | 0 | Layer `rails`, section 3, tiles horizontally. A SHADOW rail with short SILVER glints |
| `bg_boiler` | 32x32 | 2 | b0 b1 | 2 | L4, the arena. A dark tank drawn in a 1 px BRONZE line; the CREAM needle of its gauge quivers and two GOLD sparks in its firebox change places |
| `bg_crystal_s` | 16x16 | 1 | crystal | 0 | L4, section 3. DEEP_TEAL with a TEAL face and an AQUA glint |
| `fg_stalagmite` | 16x8 | 2 | t0 t1 | 0 | L6, sections 1 and 3. The row of `fg_tuft` |

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
- A layer is drawn at screen x `item.x - floor(camX * factor + time * drift)`, repeated every `repeat` px so that it covers the view. `item.y` is the bottom of the sprite in screen px. A piece with more than one frame and an `fps` above 0 is drawn with frame `floor(time * fps) % frames`. In play `time` is the scene clock (section 6.6), so the drift and the frames stand still while a Pocket Watch runs; `TG.Render.drawBackdrop` uses the time it is given.
- `sections` on an item limits it to those section indices (3 = arena). Items without it appear everywhere.
- `remap` is applied to every backdrop piece and tile.
- Layers with `front: true` are drawn after the entities (L6).

**Level 2: the backdrop `cavern`** (LEVEL2 3.1, 3.3 and Appendix C; `TG.Backdrops.cavern` in `js/sprites-world.js`). A palette may carry three more keys. Each is optional, and without it the renderer does what it does for `meadow`: `starSprite` and `moonSprite` name the sprites that `stars` and `moon` are drawn with (`bg_star` and `bg_moon` by default; the moon is drawn with the frame of its `fps`), and `phases`, `{ phase: { color, dither } }`, gives the first band during a boss phase (a phase that is not listed keeps the band).

| Palette | Used in | First band, y 0 to 150 | Floor band, y 150 to 184 | `slowSky` | `remap` | Other keys |
|---|---|---|---|---|---|---|
| `lantern` | Section 1 | PLUM | PLUM dithered SHADOW | DEEP_BLUE | none | |
| `brass` | Section 2 | PLUM | PLUM dithered SHADOW | DEEP_BLUE | `brass` | |
| `crystal` | Section 3 | DEEP_BLUE | DEEP_BLUE dithered DEEP_TEAL | PLUM | `crystal` | |
| `clock` | Arena | PLUM | MAROON dithered PLUM | DEEP_BLUE | `brass` | `phases`: 2 is PLUM dithered MAROON, 3 is INK dithered PLUM. `stars` (8) drawn with `bg_gearstar`. `moon` at x 328, y 84 drawn with `bg_clockface` |

| Layer | Factor | Repeat | Items (sections are counted from 1, as in LEVEL2; the item's `sections` list counts from 0, with 3 for the arena) |
|---|---|---|---|
| `mist` | 0.1, drift 1 | 512 | `bg_mist` x3, sections 1 to 3 |
| `far` | 0.2 | 128 | `bg_cave_far`, with its bottom at y 168 |
| `mid` | 0.4 | 384 | `bg_cave_mid` x3 in sections 1 and 3, x2 in section 2, where the hall is more open, and none in the arena. `bg_roots` x3 with the bottom at y 40, section 1. `haz_ceiling` x4 with the bottom at y 30 to 34, sections 2 and 3. `bg_lantern`, one in each arch of the rocks: x3 in section 1 and x2 in section 2. `bg_cog_l`, section 2 and the arena. `bg_pipe_v` x2, section 2. `bg_crystal_l`, one before each arch: x3, section 3 |
| `near` | 0.7 | 384 | `bg_molehill` x3 and `bg_stalagmite` x2, section 1. `bg_pipe_h` x2, section 2 and the arena. `bg_boiler` x2, the arena. `bg_crystal_s` x3 and `bg_stalagmite` x2, section 3 |
| `peek` | 0.7 | 1536 | `bg_baronpeek`, section 2, 16 px left of every fourth pipe run of `near` |
| `rails` | 0.7 | 32 | `bg_rail`, section 3 |
| `fg` | 1.3, `front` | 256 | `fg_stalagmite` x3 at y 216, sections 1 and 3 |

- The first band of every palette is the band where the word plates travel. It runs from y 0, because the Hourglass colour and the phase colour are applied to the first band only, and it is one flat colour (rule 1 of LEVEL2 3.1).
- A piece that stands inside the band, between y 24 and y 150, is SHADOW there. The exceptions are the four that LEVEL2 3.1 names: the 1 px BRONZE line of `bg_cog_l` and `bg_pipe_v` (their rims and, on the cog, the inner edge of the wheel and the ends of its 1 px spokes in the lowest 5 rows of the band), the 1 px DEEP_TEAL lines of `bg_mist`, the four GOLD lamps of `bg_cave_far` (2 px wide) and the BRONZE teeth of `bg_gearstar`. `bg_clockface` is the one bright piece in the band. Every other bright pixel is below y 150. `test/test-sprites-world.js` checks this on the pixel data of every item.
- The roof is hinted at under the HUD, and every roof piece ends by y 40: `bg_roots` in section 1, and in sections 2 and 3, which are too deep for roots, four of the rock rims that the hazards hang from (`haz_ceiling`, drawn with the section's remap as every backdrop item is). Without them the flat band over the far wall reads as open sky, most of all the DEEP_BLUE band of section 3. A rim ends at y 34 or higher, above the rim of a pipe or the tunnel, whose bottom is at y 36. It is the one item of the backdrop with an outline: besides SHADOW it puts its INK outline into the band between y 24 and y 33, and flecks of PLUM, which is the band colour of section 2 and becomes that of section 3 under the remap `crystal` (while the Hourglass runs the flecks are the other of the two band colours). The arena has no roof piece: the boss bar is there, and the clock face 2 px below it.
- `bg_baronpeek` has a layer of its own, `peek`, with the factor of `near` and four times its repeat, so that the Baron is at the left end of every fourth pipe run. As an item of `near`, whose repeat is the width of the screen, one copy of him was on screen at every moment of the Gear Hall, in a mole's colours, where the creatures walk. With the sections of LEVEL2 9.1 he comes by three times, each time from the right edge to the left: as the section begins, with Pip at tiles 425 to 460, and with Pip at tiles 562 to 597. No pipe, lantern or crystal of LEVEL2 Appendix B passes him while he is on screen; the gap at tile 452 does, at the left edge.
- `bg_cave_far` is solid along its skyline and its foot and leaves every other row open between them, so the far wall is half as strong as the SHADOW rocks of `bg_cave_mid` in front of it and the floor band shows through it. `bg_cave_mid` is a row of rocks standing on the floor line, with open floor between them. Below y 150 the rock round its arch is lit in single BRONZE pixels, densest at the inner faces of the arch and sparse from y 168 down, where the ground creatures pass: the light of the lantern that stands in the arch in sections 1 and 2 and, as DEEP_TEAL under the remap `crystal`, of the crystal cluster that stands before it in section 3. The arena has no mid rocks.
- The arena scrolls during the fight as every section does, so the pieces of the arena pass behind the boss; only the gear stars and the clock face keep their place.
- The pieces of the arena are kept dark so that they are not taken for parts of the fight. `bg_gearstar` is a SHADOW cog whose BRONZE teeth glint in turn, the upright ones in `s0` and the diagonal ones in `s1`, so that it is not taken for `pr_cog`, the GOLD cog Lady Ratchet throws through the same band. The machines of the Gear Hall and the arena (`bg_cog_l`, `bg_pipe_v`, `bg_pipe_h`, `bg_boiler`) stand in the 34 px above the floor, where `pr_rollgear` and `pr_pendulum` pass in BRONZE and GOLD and the tin frog in SILVER. Each is SHADOW inside a 1 px BRONZE line from top to bottom, with at most 6 pixels of GOLD and CREAM in a frame and no filled patch: the pin of the cog, the rivets of the standpipe, the needle and the two sparks of the boiler. The boiler is thereby not taken for `boss2_engine` when it passes behind her. `test/test-sprites-world.js` checks these.
- `bg_rail` is drawn behind the play plane, so it runs across every open gap 4 px above the floor. Its head is SHADOW with two short SILVER glints in every 32 px and not one bright line, which would read as something to run along. It is not in the arena, where `tile_rail` lies on the play plane.
- Three more pieces are dimmer than the hazard skin they can stand behind. `bg_crystal_l` and `bg_crystal_s` are DEEP_TEAL with a TEAL face of 2 px and an AQUA glint at the tips only, behind the AQUA `haz_crystal` and behind Pip, whose tunic is TEAL. `bg_lantern` is an ORANGE glow round a GOLD flame with a CREAM heart of 2 px, behind `haz_lantern` with its CREAM glass. `bg_stalagmite` is SHADOW with a STONE face on its lit third, so that it reads as rock at the back and not as a spike in Pip's way. The same test file checks the three.

### 6.6 What the renderer draws for each entity

**The sprite.** The Sprite column gives the sprite of the kind (section 5.4). An entity with a `skin` of its own, or of a kind for which the level's theme names a skin, is drawn with that sprite, and with the remap of the theme's skin, in its place (section 4.19). A skin has the size, frame names, fps and anchor of the sprite it stands for, so the Frame column applies to it as it stands.

**The clocks.** `animT` is the entity's own, or Pip's, and runs on the world clock. `time` is the scene clock, `state.sceneTime`, which runs with `state.time` and stands still while a Pocket Watch runs. Section 4.19 lists what is drawn from each clock and what counts steps.

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
| ink drop (each element of `state.items`) | `item_ink` | `floor(time * 8) % 4` | Remap `theme.inkRemap` when the level names one (section 5.9); without it the drop has its own colours |
| boulder | `en_boulder` | `ceil(3 * typed / length)` | |
| dawdle | `en_dawdle` | `floor(animT * 4) % 2` | The same frames while `phase` is `hold` |
| hoppet | `en_hoppet` | `elev > 0 ? leap : sit` | `sit` while `phase` is `hold` |
| buzzle | `en_buzzle` | `floor(animT * 16) % 2` | |
| swoop | `en_swoop` | `dive` when `phase == 'dive'`, else `floor(animT * 8) % 2` | `fx_marker` on the ground at Pip's x during the dive |
| dangle | `en_dangle` at `(entity.x + sway, entity.y)` | `floor(animT * 4) % 2` (`hang0`, `hang1`), in both phases | `sway` is `round(2 * sin(2 * PI * 0.4 * animT))` px (`TG.Render.sway`). A thread 1 px wide, SILVER, runs from `(entity.x, PLAY_TOP)` down to the top of the sprite; it is not drawn while `entity.x` is beyond the right edge of the view. The sway is presentation: the hitbox and the plate keep `entity.x` |
| flit | `en_flit` at `(entity.x, entity.y - flutter)` | `dive` when `phase == 'dive'`, else `floor(animT * 8) % 2` | `flipX` once `entity.turned` is true. `flutter` is 0 outside `phase == 'cross'`; in the crossing it is `round(reach * sin(2 * PI * 2 * animT))` px (`TG.Render.flutter`), with `reach` 4 px, less in the first and the last eighth of the crossing, where it grows from 0 and falls back to 0. `fx_marker` on the ground at Pip's x during the dive, as for the swoop. The flutter is presentation: the simulation keeps the flit level at `FLIT_CROSS_ELEV` |
| truffle | `en_truffle` | `floor(animT * 12) % 4` | `flipX` |
| digby, `phase == 'mound'` | `en_mound` at `(entity.x, GROUND_Y)` | `floor(animT * (6 + 10 * t)) % 2` | The mole itself is underground and is not drawn. The mound shakes faster as `t` grows |
| digby, `phase == 'up'` | `en_digby` at `(entity.x, GROUND_Y - elev)`, then `en_mound` at `(entity.x, GROUND_Y)` in front of it | mole `peek` then `up`; mound `m0` | `elev` is negative while the mole rises. The mole is clipped at `GROUND_Y` so nothing shows below the ground line. The mound is drawn after the mole, as `boss_mound` is for the Baron |
| digby, `phase == 'up'`, with a `skin` of its own (the Baronet) | `en_mound` at `(entity.x, GROUND_Y)`, then the skin at `(entity.x, GROUND_Y - elev)` in front of it | mound `m0`; the skin `peek` until 12 of its 16 rows are above the ground line, then `up` | Clipped at `GROUND_Y`, as the mole is. He comes up in front of the mound, so that his helmet, monocle and moustache are seen |
| rock | `pr_rock` | `floor(animT * 10) % 2` | `fx_marker` at Pip's x for a rock with `from == 'above'` |
| crate | `crate_balloon`, then `pw_<power>` over the lower 16 px | balloon `floor(animT * 3) % 2`; icon `floor(time * 4) % 2` | `power` is the crate's power (section 5.5), so a watch crate carries `pw_watch` |
| shock | `pr_shock` | `floor(animT * 10) % 2` | |
| pick | `pr_pickaxe` | `floor(animT * 12) % 4` | |
| Any threat on the frame after a correct key | same | | Remap `white` for 2 frames (from `TG.Effects`), in place of the skin's remap |

A shockwave has a GOLD chevron pointing up above it and a pickaxe one pointing down, blinking at 2 Hz and steady while the attack's window is open (`SHOCK_WIN` for an attack with action `jump`, `PICK_WIN` for one with action `duck`), whatever sprite the attack is drawn with.

What Level 2 names (`js/levels/level2.js`):

| Kind | Level 2 draws |
|---|---|
| hoppet | `en_hoppet` with remap `tin`, the tin frog |
| buzzle | `en_glimmer`, the glow-moth |
| rock | `pr_cog` |
| shock | `pr_rollgear` |
| pick | `pr_pendulum` |
| digby, as the boss's minion | `en_baronet`, through the entity's own `skin` (`boss.minionSkin`) |

`TG.Effects` gives a cleared or knocked-away creature the same sprite and remap. It reads the level's theme from `TG.Game.state` and finds the entity by the id in the event's payload, in `state.entities`, where an entity that has just been removed still is while its events are handled; no payload carries a skin.

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
| `power_get` | `pickup:power` for `hourglass`, `quill` and `watch`, 0.48 s later (after `crate_break`) |
| `shield_up` | `shield:gain`; with cause `crate`, 0.48 s later |
| `shield_break` | `shield:break` |
| `slow_on` | `power:start` with power `hourglass` |
| `slow_off` | `power:end` with power `hourglass` |
| `watch_tick` | Every 0.5 s from `power:start` with power `watch` until that watch ends: a tick and a tock in turn (`tock` in the options), the first at once, six in the watch's 3 s. Counted in real seconds in `TG.Audio.update`, up to the `duration` of the event; the count waits on the `paused` screen. It has the takeover priority of the sounds that repeat all the time, as `urgent_tick` has (DESIGN 15.1): when all three voices are busy it takes over one that plays another of those sounds, such as `key_ok`, and it is not played when all three hold more important sounds, as they can at the pickup |
| `watch_off` | `power:end` with power `watch` |
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
| `boss_weak` | `boss:weakopen`, 0.3 s after `boss_laugh` starts; not when `toot` plays in its place |
| `boss_hit` | `boss:hit` |
| `boss_stun` | `boss:finisher` |
| `boss_defeat` | `boss:defeat` |
| `toot` | `boss:weakopen` in a level whose boss kind is `ratchet`, when every entry of the volley was typed: `state.boss.volley.hits >= state.boss.volley.toLaunch.length` with at least one entry, read from `TG.Game.state` when the event arrives, which is the rule that gives the long weak-point window (section 5.7). It plays 0.3 s after `boss_laugh` starts, in place of `boss_weak` (LEVEL2 10.4) |
| `click` | In a level whose boss kind is `ratchet`. `type:hit` with kind `finisher`: every letter of the finisher word, the first and the last too, asked for before the letter's own sound (LEVEL2 10.7). And three times in the long boss intro, when `boss.stateT / boss.introTime` passes 0.55, 0.6 and 0.65 while `boss.state` is `intro` and `boss.introTime` is above `BOSS_INTRO_SHORT`: checked in `TG.Audio.update`, with the guards of `urgent_tick`, at the moments `TG.Render` steps her key (LEVEL2 10.1). It has the takeover priority of the sounds that repeat all the time, as `urgent_tick` has. The three clicks that open the `ratchet` variant of `boss_telegraph` are this sound, played inside that one |
| `ui_move` | `ui:move` |
| `ui_select` | `ui:select` |
| `ui_back` | `ui:back` |
| `pause` | `screen:change` to or from `paused` |
| `tally_tick` | `ui:tally` |
| `stamp` | `ui:stamp` |
| `count_tick` | `ui:count`. Higher pitch when `high == true` |
| `start` | `level:start` with `continued == false`: the start of a run, and of the next stage of a run that goes on (`TG.Game.nextStage`) |

Boss sounds by boss kind. `boss_laugh`, `boss_telegraph`, `boss_throw`, `boss_stomp`, `boss_hit` and `boss_defeat` each have a second recipe for the boss kind `ratchet` (LEVEL2 11.3). On each of their events `TG.Audio` reads the kind from `TG.Game.state.level.boss.kind`, taking `baron` where the game, the level or the kind is missing, and plays that kind's recipe under the same name, at the same level and takeover priority; a kind with no recipe of its own plays the Baron's. `TG.Audio.SFX` lists each name once. `TG.Audio.sfx(name, { variant: kind })` plays a kind's recipe directly. `boss_rumble`, `boss_weak` and `boss_stun` are the same for every boss. The `ratchet` `boss_defeat` lasts 1.82 s where the Baron's lasts 1.22 s, and `victory` starts when it ends (section 7.2), or after the same wait when sound effects are off.

### 7.2 Music tracks and jingles

| Name | Kind | Plays on |
|---|---|---|
| `title` | Loop | Screens `title`, `difficultySelect`, `howToPlay`. Silent while the title's `bye` panel shows: `TG.UI` stops it with `TG.Audio.music(null)` and starts it again with `TG.Audio.music('title')` (section 4.20) |
| `level1` | Loop | The level track of Level 1. On screen `playing`, `TG.Audio` plays the track named by `music.level` in the latest `level:start` payload. `transpose` and `tempo` come from the latest `section:enter` |
| `boss1` | Loop | The boss track of Level 1. On screen `boss`, `TG.Audio` plays the track named by `music.boss` in the latest `level:start` payload, with `transpose` and `tempo` from `section:enter` with index 3 (168 for Level 1). From `boss:phase` with phase 3 the tempo and the octave of pulse 2 are those of the arena's `music.phase3` (section 5.9). Without it, as in Level 1, the tempo is 184 and pulse 2 is up an octave (12 semitones) |
| `victory` | Once | Screen `levelComplete`, started by `boss:defeat` after `boss_defeat` finishes |
| `results` | Loop | Screens `results` and `highScoreEntry` |
| `gameover` | Once | Screen `gameOver` |
| `jingle_ready` | Jingle | `level:start`, whatever the value of `continued`, unless the payload's `music.ready` names another track of this table. Not on `game:continue`, which is always followed by `level:start` |
| `jingle_checkpoint` | Jingle | `checkpoint` with `index > 0` |
| `level2` | Loop | The level track of Level 2 (LEVEL2 11.1), named by `music.level` as `level1` is. `transpose` and `tempo` come from the latest `section:enter`: 0 and 140 in sections 1 and 2, 3 and 148 in section 3 |
| `boss2` | Loop | The boss track of Level 2, named by `music.boss` as `boss1` is, at the arena's `tempo` (160). From `boss:phase` with phase 3 the tempo and the octave of pulse 2 are those of the arena's `music.phase3` (176 and 12 for Level 2; LEVEL2 11.2) |
| `jingle_ready2` | Jingle | `level:start` of a level whose `music.ready` names it (Level 2), in place of `jingle_ready` and under the same rule. It takes the section's `transpose`, as `jingle_ready` does |

`TG.Audio` never chooses a level or boss track by its own name. If a payload names a level or boss track that is not in `TG.Audio.TRACKS`, it warns once and plays nothing. The ready jingle is treated differently, because a level's own jingle is a Tier 2 item: a `music.ready` that is missing or is not a name in `TG.Audio.TRACKS` gives `jingle_ready`, with no warning.

Order of events at the start of a run: `screen:change` to `playing` arrives before `level:start` (section 4.16). `TG.Audio` therefore starts the level track on `level:start` when the screen is already `playing`, and on `screen:change` to `playing` when the track is not already playing (return from `paused` restarts the sequencer instead, section 7.3). The ready jingle plays over the start of the track. `TG.Game.nextStage` emits the same events in the same order as `newRun` (section 4.16), so the next level's track and its ready jingle start in the same way.

### 7.3 Other audio behaviour driven by events

| Event | Behaviour |
|---|---|
| `screen:change` to `boot` | Silence |
| `screen:change` to `paused` | Stops the sequencer at its current position. Sound effects for the pause menu still play. This does not call `suspend()` |
| `screen:change` from `paused` | Restarts the sequencer from that position. This does not call `resume()`. To `results` (QUIT), a jingle that was paused part-way is stopped and the loop is no longer ducked, so it does not finish over the results music. Back in play while a Pocket Watch is still running, the sequencer stays stopped until the watch ends |
| `screen:change` to `bossIntro` | Stop the level track; `setBassOnly(false)` |
| `screen:change` to `lifeLost`, `playing` from `lifeLost` | No change to music |
| `level:start` (any `continued`) | `setTempoScale(1)`, `setBassOnly(false)`, a Pocket Watch's hold on the music ends, remember `music.level` and `music.boss` from the payload, then the ready jingle: the track `music.ready` names, or `jingle_ready` (section 7.2). This resets whatever was active when the last run, stage or life ended. With `continued == false` the values of the last `section:enter` are also put back to their defaults (transpose 0, the track's own tempo, phase 3 at 184 and 12, `key_ok` in C major) until the `section:enter` that follows |
| `power:start` / `power:end` with `hourglass` | `setTempoScale(0.75)` / `setTempoScale(1)` |
| `power:start` with `watch` | The sequencers stop at their position, as on `paused`, and `watch_tick` begins (section 7.1). A second `power:start` while one watch runs starts the count of ticks again |
| `power:end` with `watch` | `watch_off`, and the sequencers go on from where they stopped |
| A Pocket Watch that ends with no `power:end` (section 4.16) | The hold on the music ends with no sound of its own, before the rest of what the event does: on `level:start` (a continue, NEXT STAGE, a new run) and on `screen:change` to any screen but `playing`, `lifeLost` and `paused` (the arena, game over, results) |
| `boss:warning` | `setBassOnly(true)` until `bossIntro` |
| `section:enter` | `transpose` and `tempo` of the current track from `music.transpose` and `music.tempo`. Scale of `key_ok` from `music.keyOk`: `root` semitones above C5, `mode` major or minor pentatonic. If `music.keyOk` is missing: root 0, major. (Following the music key is Tier 2; if it is left out, `key_ok` is always C major pentatonic.) In a major mode, `word_clear`, `streak`, `checkpoint`, `one_up` and `ink_drop` also move up by `root` semitones (down an octave from there for a root above 2). `music.phase3`, `{ tempo, p2Octave }`, which an arena may carry, is kept for `boss:phase` with phase 3 (section 7.2); where the object or one of its two values is missing, 184 and 12 stand. A jingle that has not sounded its first step yet takes the section's `transpose` |

For Level 1 the level data gives C major pentatonic in sections 0 and 1, D major pentatonic in section 2 and E minor pentatonic in the arena (section 5.9). For Level 2 it gives D minor pentatonic in sections 0 and 1, F minor pentatonic in section 2 and G minor pentatonic in the arena.

`TG.Audio.update(dt)` runs the look-ahead of the sequencers and, besides it, three things that no event marks: `urgent_tick`, `watch_tick` and the three `click`s of Lady Ratchet's long intro (section 7.1).

`suspend()` and `resume()` are called only by `TG.Main`, on loss and return of focus (section 4.21).

---

## 8. Event registry

Every event has a payload object. `target` and `entity` are references to live simulation objects: listeners may read them during the call and must copy anything they keep. Positions are world px unless stated.

Listeners: A = `TG.Audio`, E = `TG.Effects`, H = `TG.Hud`, U = `TG.UI`, M = `TG.Main`. Any module may listen to any event; the table lists the listeners that are required.

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
| `level:start` | `{ levelId, difficulty, name, continued, music }`. `music` is `level.theme.music`: `{ level, boss }`, two track names, and `ready`, the name of the level's ready jingle, when the level has one of its own (section 5.9). Emitted by `newRun` and by `nextStage` with `continued: false`, and by `continueRun` with `continued: true` | A E H |
| `word:clear` | `{ id, type, kind, family, from, word, x, y, w, h, score, mult, clean, quick, close, cause, power }`. cause: `typed` or `blast`. `power` is set for crates. Emitted for threats and crates only, so `type`, `kind` and `family` always come from `TG.Entities.KINDS`. Not emitted for boss words (section 4.16) | A E H |
| `score:add` | `{ points, total, reason, x, y }`. `x`, `y` are `null` for bonuses | E H |
| `life:gain` | `{ lives, cause }`. cause: `score`, `ink`, `cap` | A E H |
| `life:lost` | `{ lives, cause }`. `cause` as passed to `TG.Entities.damage` | A E H |
| `shield:gain` | `{ charges, cause }`. cause: `crate`, `streak` | A E |
| `shield:break` | `{ charges, x, y }` | A E |
| `pickup:power` | `{ power, x, y }` | A E H |
| `power:start` | `{ power, duration }`. power: `hourglass`, `quill`, `watch`. `duration` in real seconds | A E H |
| `power:end` | `{ power }`. Emitted when the time of the power runs out. A timed power that a continue or NEXT STAGE ends, and a watch that the arena ends, has no `power:end` (section 4.16) | A E H |
| `tutor:prompt` | `{ id, word }` | H |
| `tutor:end` | `{ id }` | H |
| `assist:change` | `{ assist, target }`. Emitted when the target changes | H (debug only) |
| `game:over` | `{ checkpoint, score }` | A E |
| `game:continue` | `{ checkpoint, continues, assist }` | A E H |
| `level:clear` | `{ result }`. The result of section 5.11 for the stage that has just been cleared, emitted when `levelComplete` ends: once for each stage a run clears | A U |
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
| `threat:warn` | `{ id, kind, from }`. Emitted at spawn, after `threat:spawn`, when `from` is `behind`, `above` or `below`, or when the sprite starts outside the playfield (a boulder). Not emitted for crates. A flit has a second one, with `from: 'behind'`, on the step its `t` reaches `FLIT_CROSS_T` and it turns behind Pip, once; the entity's own `from` stays `above`, and `turned` on the entity says that it has turned (section 5.5) | A H |
| `threat:enter` | `{ id, kind, from }`. The sprite first intersects the playfield. Not emitted for a threat that is on screen from its spawn | E |
| `threat:urgent` | `{ id, kind }`. Once per threat | none required. The plate border and `urgent_tick` follow `entity.urgent` in the state |
| `threat:hit` | `{ id, kind, word, typed, x, y }`. Contact that cost a life or a shield charge. Emitted by `TG.Entities.remove`. The payload does not name the side the threat came from: a listener that needs it for a flit, whose dive ends on Pip's own x, reads `turned` on the entity with this `id` | E |
| `threat:bounce` | `{ id, kind, x, y }`. Contact while invulnerable. Emitted by `TG.Entities.remove` | E |
| `threat:escape` | `{ id, kind, type, reason }`. reason: `flee` (continue, arena start, finisher) or `drift` (crate left the screen). Emitted by `TG.Entities.remove` | E |
| `hazard:hit` | `{ id, kind, x, y }` | E |
| `attack:spawn` | `{ id, kind, action }` | A E |

### 8.4 Level (emitted by `TG.Level`; `section:enter` also by `TG.Game`)

| Event | Payload | Listeners |
|---|---|---|
| `section:enter` | `{ index, name, stage, palette, music }`. index 3 is the arena. `music` is the section's or the arena's `music` object from the level data: `{ transpose, tempo, keyOk }`, and for an arena that names them also `phase3: { tempo, p2Octave }` (section 5.9). Emitted when Pip crosses into a section, and by `TG.Game` directly after `level:start` at the start of a run, at NEXT STAGE and after a continue | A H |
| `checkpoint` | `{ index, x, wpm, accuracy, bonus, lives }` | A E H U |
| `hazard:cue` | `{ id, kind, action, hold, sound, prompt }` | A H |
| `hazard:bridge` | `{ id, x, w }` | E |
| `boss:warning` | `{}`. Pip reached tile `lengthTiles - 12` | A H |
| `boss:enter` | `{}`. Pip reached the arena | A E H |

On a step on which a Pocket Watch holds the world, `TG.Level.update` does nothing (section 4.14): `section:enter`, `checkpoint`, `hazard:cue`, `boss:warning` and `boss:enter` wait for the first step on which the world moves again.

### 8.5 Boss (emitted by `TG.Boss`)

| Event | Payload | Listeners |
|---|---|---|
| `boss:state` | `{ state, phase, round }` | E |
| `boss:attack` | `{ kind, telegraph }`. kind: `rock`, `rockhigh`, `minion`, `shock`, `pick`. `telegraph` in real seconds at the current time scale (0 for rocks and minions) | A E |
| `boss:throw` | `{ kind, x, y }`. kind: `rock`, `rockhigh`, `minion`, `pick`. Emitted for every volley launch and when a pickaxe is spawned. `x`, `y`: beside the boss's raised arm, the point where the rock path starts (section 14.2) | A E |
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
| `ui:exit` | `{}`. EXIT was confirmed on the title menu, after its `ui:select`. `TG.Main` tries `window.close()` (section 4.21) | M |

`ui:letter` plays `key_ok` with `step = index`. `ui:exit` plays nothing of its own; the title music stops through `TG.Audio.music(null)` (section 4.20).

---

## 9. Game state machine

`state.screen` takes one of these values. "Sim" screens are advanced by `TG.Game.step`; the others by `TG.UI.update`.

| Screen | Kind | Owner of the logic | What it is |
|---|---|---|---|
| `boot` | UI | WP-G | "PRESS ANY KEY" |
| `title` | UI | WP-G | Title, menu, and the options, high score, story and goodbye panels |
| `difficultySelect` | UI | WP-G | Three panels, and under them a STAGE row once a level after the first is open (section 4.20) |
| `howToPlay` | UI | WP-G | Instructions; from difficulty select, the READY prompt |
| `playing` | Sim | WP-E | Sections 1 to 3 |
| `paused` | UI | WP-G | Pause menu and resume countdown |
| `lifeLost` | Sim | WP-E | World clock stopped after a hit (0.10 s) or a fall (1.0 s); 1.5 s when it was the last life. Letters are still handled |
| `gameOver` | UI | WP-G | Continue countdown |
| `bossIntro` | Sim | WP-E | The boss of the level appears |
| `boss` | Sim | WP-E | Boss rounds |
| `levelComplete` | Sim | WP-E | Defeat sequence |
| `results` | UI | WP-G | Tally and rank. After a cleared stage that has a level after it, also the strip with NEXT STAGE and TITLE |
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
| `results` | `highScoreEntry` | Confirm, and the run has an entry to make: `TG.Save.qualifies`, or the run goes to the world scores (section 4.20). With the strip shown the key is Esc (TITLE) | UI |
| `results` | `title` | Confirm, and the run has no entry to make. With the strip shown the key is Esc (TITLE) | UI |
| `results` | `playing` | NEXT STAGE: Enter with the strip shown, `TG.Game.nextStage`. The strip is shown once the tally of the last page has finished, when the stage was cleared and there is a level after it. Space and the JUMP button, which confirm elsewhere, do nothing on the strip | UI |
| `highScoreEntry` | `title` | Initials confirmed | UI |

Any other transition is refused by `setScreen`. Three calls are exceptions. `TG.Game.newRun` sets `playing` from any screen, so tests can start a run without the menus. `TG.Game.nextStage` sets `playing` itself, as `newRun` does, and only from the `results` screen of a cleared stage with a level after it; elsewhere it returns false and changes nothing. `TG.Game.init` sets `boot` and emits `screen:change` with `from: null`; no transition leads back to `boot`.

### 9.2 Rules

- **Pause during `lifeLost` is deferred.** A pause request while the screen is `lifeLost` (Esc, blur, hidden tab or a long frame) sets `state.pausePending = true`; `TG.Game.pause()` returns false. When the `lifeLost` timer ends with lives remaining, the game goes to `paused` instead of back to play, `resumeTo` keeps the screen that `lifeLost` would have returned to (`playing` or `boss`), and `pausePending` is set to false. After a fall, Pip's rescue (section 5.2) is carried out before the screen changes, so the paused picture shows him in his bubble at the rescue point. If no lives remain, the game goes to `gameOver` as usual and `pausePending` is set to false.
- Pause requests during `levelComplete` are ignored. Nothing can hurt Pip on that screen.
- Entering `paused`, `gameOver`, `results` or `bossIntro` releases the typing lock with reason `screen`.
- Entering `gameOver` emits `game:over`. `continueRun` emits `screen:change`, `game:continue`, `level:start` with `continued: true` and `section:enter`, in that order (section 4.16).
- `nextStage` emits `screen:change` from `results` to `playing`, `level:start` with `continued: false` and `section:enter`, in that order, as `newRun` does (section 4.16).
- On `results`, `TG.UI` calls `TG.Save.recordRun(state.result)` once for each result. A run that goes on through NEXT STAGE has a results screen at the end of each stage, with a result of its own, so `recordRun` is called on both. What it stores is a highest value or a state (section 4.4), so the second call counts nothing twice.
- **One entry for a run, at its end.** The initials screen, the entry in the table of this computer and the score sent to the world scores follow the last results screen of the run and carry the run's total. NEXT STAGE enters nothing: `TG.UI` hands `TG.Save.setPending` the entry the run would have made at that point, and `TG.Save` keeps it when its score would reach the table. `TG.UI` clears it when the run reaches the title or another run starts. One that is still there at the next start of the game belongs to a run that never ended in it (a closed tab), and `TG.UI.init` enters it through `TG.Save.enterPending` (section 4.4).
- While `paused`, neither the simulation nor `TG.Effects` advances.
- **Focus loss stops the interface countdowns.** `TG.Main` calls `TG.UI.onFocusLost()` on blur and on a hidden tab (4.21). On `paused` with the resume countdown running, the countdown is cancelled and the pause menu is back, as after Esc during the countdown. On `gameOver`, the continue countdown (and its key lockout) stands still until `TG.UI.onFocusGained()`; it runs on a clock of its own, so it does not jump ahead when the focus returns.

---

## 10. Headless test interface

All tests are plain Node scripts with no npm packages. They run from the project root: `node test/<file>.js`. A test prints one line per check (`ok - description` or `FAIL - description`) and exits with code 0 if every check passed, otherwise 1.

### 10.1 `test/stubs.js` (WP0)

```js
const stubs = require('./stubs');

stubs.FILES            // the 21 file paths of section 1, in load order, relative to the project root
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
- The harness never calls `TG.UI` or `TG.Main`. On `gameOver` it calls `TG.Game.continueRun()`. On `paused` (which happens headlessly only in the `pause-deferred` check) it calls `TG.Game.resume()`. A run is finished when `state.screen` is `results`, or earlier when it reaches the stop point given in `until` (section 10.3). With the `campaign` option a run that reaches `results` after a cleared stage with a level after it calls `TG.Game.nextStage()` and goes on, as NEXT STAGE does in the game.
- The simulation must run with `audio.js`, `gfx.js`, `font.js`, the sprite files, `effects.js`, `hud.js`, `render.js`, `ui.js` and `main.js` absent.
- The simulation needs `core.js`, `words.js` and `typing.js`. `words.js` and `typing.js` belong to WP-A. The build order in section 12 delivers them before WP-E starts; section 12 also says what WP-E does if they are late.
- The harness calls neither `TG.Save.init` nor `TG.Save.load`, so every headless run starts from default settings.

### 10.3 The bot (`test/sim.js`, WP-E)

`test/sim.js` is both a command line script and a module: it runs the acceptance matrix only when `require.main === module`, and it exports `runBot`. Every run starts from a fresh `stubs.load()` so that no state is shared between runs.

`test/sim.js` holds the tables that belong to the tuning record of section 12.1. `CONSTANT_OVERRIDES` (`{ NAME: value }`, empty at first) is passed to every `stubs.load` as `constants`. `LEVELS` lists the levels the harness plays, `[1, 2]`: a level joins it when its file is built and it has a row in each of the tables below, which are keyed by level id. `EXPECTED_COUNTS` holds the threat words per section, from DESIGN 11.2 for Level 1 and from DESIGN 11A.2 (LEVEL2 8.4) for Level 2; an entry is changed only together with a line in the `Tuning changes` list of the level's file.

| Table | Level 1 | Level 2 | Read by |
|---|---|---|---|
| `EXPECTED_COUNTS` | `{ easy: [11, 14, 14], medium: [12, 16, 19], hard: [18, 22, 20] }` | `{ easy: [13, 16, 15], medium: [15, 19, 19], hard: [21, 23, 22] }` | `counts` |
| `DESIGN_COUNTS`, the design's counts as written, never changed | equal to `EXPECTED_COUNTS` | equal to `EXPECTED_COUNTS` | `counts` |
| `EXPECTED_KINDS`, the threat entries of each kind on Easy / Medium / Hard | boulder 8 / 8 / 8, dawdle 3 / 4 / 7, hoppet 9 / 10 / 14, buzzle 9 / 10 / 13, swoop 3 / 6 / 9, truffle 4 / 6 / 6, digby 3 / 3 / 3 | boulder 8 / 8 / 9, dawdle 4 / 5 / 6, hoppet 6 / 6 / 8, buzzle 7 / 8 / 11, truffle 5 / 6 / 7, digby 3 / 4 / 4, dangle 6 / 8 / 11, flit 5 / 8 / 10 | `counts` |
| `DESIGN_CRATES`, the powers of the crates in the order they are met | shield, hourglass, cap, quill, blast, cap, shield | shield, watch, hourglass, cap, quill, watch, blast, cap, shield | `counts` |
| `WORD_FLAVOUR`, the flavour whose lists the level's runs draw from | `null` (`meadow` has no lists) | `clockwork` | `words-by-difficulty` |
| `INK_COUNTS`, the ink drops laid out on Easy / Medium / Hard | 150 / 153 / 153 | 184 / 187 / 187 | `items-shape` |
| `FIRST_EASY_GAP`, the tile of the first gap that is open on Easy | 106 | 72 | `no-jump-bridge` |
| `LENGTH_BOUNDS`, the target bot's run length in seconds | 240 to 420 | 260 to 440 | `length` |
| `BOSS_EXPECTED`, the boss of the level | kind `baron`; health 3 / 5 / 7; the phase 3 minion on Medium and Hard; no minion skin | kind `ratchet`; health 3 / 6 / 7; the minion on every difficulty, with skin `en_baronet` | `boss-fight`, `boss-continue` |
| `LEVEL_TARGETS`, what a level is tuned to beyond the fixed pass conditions of section 10.4 | no row | `floorContinues` 1 / 2 / 2 with `savedFrom` 1; `u` 0.55 to 0.75, with Easy (`uNoted`) allowed down to 0.50 (`uNotedFrom`); `fight` 60 to 120 s; `liveAtFlag` 0; `watchLive` 1 | `targets`, `campaign-targets`, and `counts` for the watch crates |

```js
const { runBot } = require('./sim');
const report = runBot({
  difficulty: 'medium', wpm: 30, accuracy: 0.95, react: 0.7, seed: 1, adaptive: false,
  levelId: 1,            // the level the run starts at (default 1)
  profile: undefined,    // 'floor' | 'target' | 'fast' | 'exact': wpm, accuracy and react that are not given come from the
                         // profile of config.bot ('exact': target with accuracy 1), and adaptive from section 10.4.
                         // Without it the run is 'custom' when wpm is given and 'target' otherwise
  startAssist: 1,        // the assist the run starts at (default 1: a player with nothing saved)
  campaign: false,       // true: on the results screen of a cleared stage the run goes on with TG.Game.nextStage()
                         // while there is a next level, and is finished when the last level is cleared
  until: 'results',      // stop point: 'checkpoint1' | 'checkpoint2' | 'boss' | 'results' (default)
  noType: false,         // true: the bot never presses a letter
  noJump: false,         // true: the bot never jumps
  noDuck: false,         // true: the bot never ducks
  files: undefined,      // optional file list passed to stubs.load (default: stubs.FILES)
  setup: undefined,      // optional function (TG), called after TG.Game.init() and before newRun
  onStage: undefined,    // optional function (TG, session), with campaign: called on that results screen before the run goes on
  onGameOver: undefined, // optional function (TG, session), called on the game over screen before the continue
  maxSeconds: 1500,      // of simulated time; with campaign, for each stage
  verbose: false
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

1. **Screens.** `gameOver`: call `continueRun()` and count it. `paused`: call `resume()`. `results`: stop; with `campaign`, after a cleared stage that has a level after it, call `nextStage()` and continue. Otherwise continue.
2. **Jump and duck.** `a = TG.Entities.nextAction(state)`. For each action id the bot chooses, once, a press point: for hazards `winStart + 2 + r * 0.4 * (winEnd - winStart - 4)` with `r` from the bot's own generator; for attacks the first step on which `inWindow` is true. When Pip reaches the press point and `a.inWindow` is true, it calls `keyDown` for the action and `keyUp` on the next step, or, for `hold`, when `player.x > a.holdUntil`. The bot jumps and ducks only for hazards and attacks. It cannot avoid a typable threat in this way, because the simulation does not allow it (section 4.13).
3. **Choosing a word.** If a word is locked, continue it. Otherwise take the typable with the lowest `eta`, then the lowest `id`. Threats, crates and boss words are treated alike; the queue and spacing rules (section 5.5) have already given each of them time in the order they appeared.
4. **Timing.** The bot may press the first key of a word when `state.time >= max(word.shownAt + react, lastWordDoneAt + 0.4 * react)`. After that it presses one key every `12 / wpm` seconds.
5. **Errors.** Before each key, with probability `(1 - accuracy) / accuracy`, it presses a neighbouring key from `TG.Words.ADJACENT` (one that is not the expected letter) and delays the correct key by one interval plus 0.15 s.
6. **Lost targets.** If the locked target disappears, the bot waits `DISCARD_TIME` and chooses again.
7. **A level laid out again.** On `game:continue`, and on the `level:start` of NEXT STAGE, the bot drops the press points it has chosen (hazard ids start again in every level), lets go of a key it holds and forgets the word in hand.

The bot uses `TG.RNG.create(seed + 1000)` for its own choices and never touches `state.rng`. `runBot` starts the run with `TG.Game.newRun({ difficulty, seed, levelId, adaptive, assist: startAssist, tutorial: config.tutorialAlways })`, with `config` resolved for the level's `tune` block. The bot profiles are read from `TG.Game.state.config.bot` after `newRun`, so that overrides in the level's `tune` block are used.

**Assertions inside the harness.** During every run the harness listens with `'*'` and checks the following. A failure is recorded in `report.error` and the run fails.

| Assertion | Rule |
|---|---|
| `event-names` | Every event emitted has a name in `TG.Events.NAMES` and the payload fields listed in section 8, those and no other |
| `first-letters` | No two live typables share a first letter |
| `active-cap` | Live threats never exceed `config.maxActive` for the section |
| `word-pool` | Every `word` in `threat:spawn`, `boss:weakopen` and `boss:finisher` satisfies `TG.Words.has(difficulty, word)`. This covers threats, crates, rocks, minions, weak-point words and finisher words |
| `no-dodge` | Every threat that reaches `t >= 1` with its word unfinished is followed in the same step by `threat:hit` or `threat:bounce` |
| `budget` | The budget of every new word is `max(base, queue, spacing)`, and at least the Boulder's minimum for a boulder (section 5.5), worked out again from the state at the moment of the spawn. A longer budget is accepted only for a threat whose arrival the keep-clear rule moved to the end of a zone |
| `keep-clear` | No threat is due to arrive inside the input window of a hazard or its margin. No dangle's anchor is within `DANGLE_CLEAR` of the box of a branch, a beehive or an arch |
| `scoring` | Every `word:clear` carries the score of DESIGN 8.3 (clean, quick, multiplier, quill and assist; the half score of the Ink blast), and the weak-point, finisher and defeat scores of the boss are the ones given there |
| `console` | Nothing is written to `console.error` or `console.warn` during the run |
| `announce` | Every `attack:spawn` follows a `boss:attack` of the same kind with `telegraph > 0`, emitted in an earlier step and at least the telegraph span earlier on the world clock (`config.boss.telegraph` for the first attack of a round, `doubleGap` for the second) |
| `weak-window` | Every weak-point window is `exposeFactor` times the base budget of its word, plus `exposeBonus` when every entry of the volley was typed, and the word's length is within `coreLen`. At `boss:weakopen`, `boss.volley.hits` and `boss.volley.toLaunch` hold the count the window was set from |
| `watch` | On a step that begins with a Pocket Watch running, `state.worldTime` and `state.sceneTime` do not move, no `threat:spawn` is emitted, and none of the events of `TG.Level.update` is (`section:enter`, `checkpoint`, `hazard:cue`, `boss:warning`, `boss:enter`). Until a watch has run in the run, `state.sceneTime` equals `state.time` after every step |

The words seen in a run are returned in `report.words` for the `words-by-difficulty` check (section 10.4).

`report`:

```js
{
  levelId: 1,                // the level the run started at
  levels: [1],               // the levels the run is to play: more than one with campaign
  difficulty: 'medium', profile: 'target', seed: 1,
  wpm: 30, accuracy: 0.95, react: 0.7, adaptive: false,
  until: 'results',
  finished: true,            // reached the stop point; for 'results', with result.cleared === true (with campaign: of the last level)
  words: ['river', 'bridge'],// every word shown in the run, in order, without repeats
  time: 301.4,               // state.time at the end
  steps: 18084,
  score: 48210,
  lives: 3, livesLost: 1, continues: 0,
  damageTypable: 1, damageOther: 0,
  reportedWpm: 29.6, reportedAccuracy: 0.951,
  startAssist: 1.0,          // state.assist directly after newRun
  assistEnd: 1.0,
  rank: 'A',
  // Measurements. They assert nothing; the `targets`, `campaign-targets` and `counts` checks and --measure read them.
  meanU: 0.576,              // mean window use: age / budget of each threat word typed, U_MISS for each threat that reached Pip; null with none
  fightTime: 102.7,          // s from boss:enter to boss:defeat; null when the fight did not end
  liveAtFlag: 0,             // threats that fled at boss:enter, and threat entries of the level that had not appeared by then
  cratesAtFlag: 0,           // the same for crates
  pastFlag: 0,               // threats of the level that were due at or past the arena line when they appeared
  watch: [{ tile: 206, live: 2 }],   // for each watch crate that appeared: Pip's tile at that moment, and the threats live when its
                             // word was cleared (null: it was not cleared)
  minLives: 4,               // the fewest lives held after any step
  dangles: 8,                // dangles spawned
  dangleNearest: 128,        // the least distance from a dangle's anchor to the box of a branch, beehive or arch, px; null with none
  stages: [],                // one record for each stage cleared: { levelId, start, result } with the measurements above for that
                             // stage. start is what the run held when the stage began: { time, score, lives, shield, assist,
                             // continues, livesLost }. result is the game's result for the stage (section 5.11)
  error: null,               // message if the run threw, timed out or failed an assertion
  fatal: false               // true: the harness could not run it (exit code 2, section 10.4)
}
```

With `campaign`, `time`, `score`, `livesLost` and `continues` are the whole run's, the measurements are the last stage's, and `stages` has those of every stage.

### 10.4 What `node test/sim.js` does and prints

With no arguments it runs the acceptance matrix for every level of `LEVELS` (section 10.3): for each level, each difficulty, each profile below, seeds 1, 2 and 3 (36 runs a level, 72 for the two levels), then the extra checks (49 for the two levels).

| Profile | Bot settings | `adaptive` | Pass condition for each run |
|---|---|---|---|
| `floor` | `config.bot.floor` | on | `finished`, `continues <= 3` |
| `target` | `config.bot.target` | off | `finished`, `continues == 0` |
| `fast` | `config.bot.fast` | off | `finished`, `continues == 0`, `damageTypable == 0` |
| `exact` | `config.bot.target` with `accuracy: 1` | off | `finished`, `reportedWpm` within 10% of `wpm`, `reportedAccuracy == 1` |

Every run must also pass the assertions of section 10.3. With `--until` the same conditions apply up to the stop point.

These pass conditions are fixed. The tuning values they are run against are not: if the matrix does not pass with the starting values, WP-E changes tuning values within the limits of section 12.1, and does not change the conditions, the bot's behaviour or the `wpm` and `accuracy` of a profile.

Extra checks, in the order they are run. A check marked "per level" is run once for each level played and prints `level=N` on its line; the others are run once. A per-level check marked "data only" reads the level's data and plays nothing, so `--quick` runs it for every level of `LEVELS`. `targets` and `campaign-targets` print no line for a level that has no row in `LEVEL_TARGETS`. For the two levels that makes 49 lines: the 25 checks that are run once, the 13 per-level checks twice, less the two that have nothing to say about Level 1. The tables named are those of section 10.3.

| Check | Run | Pass condition |
|---|---|---|
| `level-valid` | per level, data only | `TG.Level.validate` returns an empty array for the level's data. A copy of the level broken in one place fails each of the rules V1 to V11. A copy that carries every optional key (`theme.hazardNames`, `theme.hazardFx`, `theme.skins`, `theme.inkRemap`, `theme.music.ready`, `arena.music.phase3`, and a boss table with `kind`, `label`, `speech`, `tips`, `minionSkin` and `urgentRim`) is valid, and `TG.Level.build` hands on `theme`, `boss` and `arena.music` as they are |
| `counts` | per level | The number of threat spawns per section and difficulty in the level equals `EXPECTED_COUNTS`, and no entry of `EXPECTED_COUNTS` differs from `DESIGN_COUNTS` by more than 25% rounded up. The threat entries of each kind on each difficulty equal `EXPECTED_KINDS`. The crates have the powers of `DESIGN_CRATES` in the order they are met (7 crates in Level 1, 9 in Level 2), and every crate is on every difficulty. For a level with watch crates and a row in `LEVEL_TARGETS`: over the `target` and `floor` runs of the matrix at least one watch crate is cleared, and at each `word:clear` of one at least `watchLive` threat words are live; a watch crate that drifts off untyped is reported and is not a failure |
| `skins` | per level, data only | Every sprite the level names in `theme.tiles`, `theme.hazardSkins`, `theme.skins` and `boss.minionSkin` is in `TG.Sprites.MANIFEST` and defined, and has the size, frame names, fps and anchor of the sprite it stands for: the Level 1 tile or hazard sprite of its key, the sprite of the kind in `TG.Entities.KINDS`, `en_digby` for the minion. A key of `theme.tiles` or `theme.hazardSkins` is one the renderer reads, a kind of `theme.skins` is a kind, and a skin's `remap` and `theme.inkRemap` are defined remaps. A key of a skin's `fx` is a sprite `TG.Effects` swaps for that kind (the buzzle's `fx_flower` and no other), and the sprite named for it has its size and anchor. 14 copies of the level with one name changed are each refused |
| `jump-geometry` | once | At time scales 0.45, 1.0 and 1.25: a jump started at `winStart` and one started at `winEnd` both clear a narrow gap and a wide gap; a jump started at `winStart` and one at `winEnd` both clear a bramble; a slide started at `winStart` and one at `winEnd` both clear a branch. Also, for every hazard, `postX` lies inside the window and a press 10 px before it, at it and 10 px after it clears (section 5.8) |
| `fall-geometry` | once | At time scales 0.45, 1.0 and 1.25: running into a narrow gap without jumping, and into a wide gap without jumping, each ends in `hero:fall` and the loss of one life, from 20 different starting offsets of Pip's x |
| `duck-held` | once | With the duck key held, `TG.Input.clear()` followed by steps ends the slide once `slideT` has run out: `player.state` returns to `run` |
| `input-translate` | once | `TG.Input.translate` follows the table of section 4.12, with `e.repeat`, the modifier keys, the semicolon rules and the QWERTY letter of `e.code` for a non-Latin layout. The `keydown`, `keyup` and `blur` handlers and the queue functions behave as that section says |
| `input-buttons` | once | A `pointerdown` on an element bound with `TG.Input.bindButton`, sent with `env.dispatchTo`, queues the key down and calls `preventDefault`; `pointerup`, `pointercancel` and `pointerleave` queue the key up; the button does not keep the focus. For JUMP and for DUCK |
| `load-isolated` | once | Every WP-E file loads under the stubs with `js/core.js` alone, and all of them together, with no console output and no canvas, audio, storage, timer or listener at load time |
| `sim-purity` | once | The source of the WP-E files has no `Math.random`, `Date`, `performance`, timer, `localStorage`, `document` or presentation module (section 2.2 rule 4) |
| `init-event` | once | `TG.Game.init()` emits `screen:change` with `from: null` and `to: 'boot'`. `newRun` emits `screen:change`, `level:start` and `section:enter`, in that order; `setScreen('title')` is then refused, and `canGo` answers as the table of section 9.1 has it |
| `no-dodge-actions` | once | For every threat kind of `TG.Entities.KINDS`: with Pip at the top of a jump, and with Pip in mid-slide, at the moment the threat reaches `t = 1`, the contact is `threat:hit` |
| `spawn-onscreen` | once | For budgets of 2, 6 and 12 ws: a Dawdle, Hoppet, Buzzle or Truffle is `onScreen` on the step it is spawned and on the next. A Digby is not `onScreen` and keeps `dx` at `DIGBY_DX` until `t = DIGBY_POP_T`, and is on screen from then on. A Dangle and a Flit are spawned above the playfield, come into view through its top edge (a Dangle whose anchor is beyond the view: through the right edge) and stay in view |
| `anchored-kinds` | once | The boulder is marked `anchored` in `TG.Entities.KINDS`. For each anchored kind, at time scales 0.45, 1.0 and 1.25 and with Pip falling into a gap on the way: `anchorX` is `player.x + contact + RUN_SPEED * budget` at the spawn, `x` equals `anchorX` on every step, `t` follows from the distance Pip still has to run, and the contact comes on the step Pip reaches it. A kind that is not anchored has `anchorX` 0 |
| `new-kinds` | once | The dangle and the flit, each followed from the spawn to its end at budgets of 2, 6 and 12 ws on the three time scales, with Pip running, jumping and sliding at the contact and once more with its word typed. Dangle: `x` is its `anchorX` on every step; it drops from the roof to `DANGLE_ELEV` by `t = DANGLE_DROP_T`, slowing as it goes, and hangs there; one `threat:warn`, from `above`, at the spawn. Flit: `enter`, `cross`, `behind` and `dive` in that order on its path (the `FLIT_` constants of section 3), level at `FLIT_CROSS_ELEV` through the crossing; a second `threat:warn`, from `behind`, once, on the step it reaches `FLIT_CROSS_T`, and `flipX` from that step on. Both: spawned above the playfield with the `top` edge tag of `TG.Render.layoutLabels` and no tag once in view (a dangle hanging beyond the right edge has the `right` tag until it scrolls in); contact on the step `t` reaches 1 is `threat:hit` whatever Pip is doing; the typed word gives `word:clear`; a typed letter stalls the flit's clock and not the dangle's. Then the keep-clear rule beside a gap and a branch, the dangle's distance of `DANGLE_CLEAR` from a branch, a beehive and an arch, and the `keep-clear` assertion itself, which must refuse a dangle hung 100 px from one. The check loads `js/render.js` for the tags |
| `typing-results` | once | "Applying a typing result" of section 4.16: the lock, the letter stall, letter points, Backspace, no points and no stall for letters typed again after a release, Esc, the clear, doubled points under the Golden quill, the shield for a key streak, a wrong key, a Backspace after a wrong key keeps the word, and moving on to another word by typing it |
| `crate-queue` | once | A crate spawned while a threat is live gets a budget of at least the queue value, and a threat spawned while a crate with untyped letters is live counts the crate in `A` and `R` (section 5.5) |
| `items-shape` | per level | Every element of `state.items` has the shape of section 5.14, a collected drop has left the array by the end of the step of its `pickup:ink`, and the drops laid out on each difficulty are those of `INK_COUNTS` |
| `continue-restore` | once | After a continue from checkpoint 1: score, ink and `nextLifeAt` are the banked ones, Pip is at the checkpoint with `config.lives` lives, the typing statistics are kept, `slowT` and `quillT` are 0 and `slowScale` is 1, the shield charges are kept, no entity is live, and `screen:change`, `game:continue`, `level:start` with `continued: true` and `section:enter` were emitted in that order |
| `no-type` | once | A run with `noType: true` reaches `gameOver`; after `continueRun` Pip is at the last checkpoint with `config.lives` lives and the banked score |
| `no-jump-bridge` | per level | In a run on easy with `noJump: true` and `noType: true`, continued as often as needed: the first `hero:fall` is at the level's first open gap (`FIRST_EASY_GAP`); the first gap that Pip falls into `config.bridgeAfterFalls` times is bridged from then on (`hazard.bridged` is true); `hazard:bridge` is emitted once for it; and after a continue that restarts before it Pip runs across it. After a fall Pip returns beyond the gap, so he meets the same gap again only after such a continue |
| `pause-deferred` | once | `TG.Game.pause()` called during `lifeLost` returns false and sets `pausePending`; when the timer ends the screen is `paused` and `resumeTo` is `playing`; after `resume()` the run continues. The same call during `lifeLost` with no lives left leads to `gameOver`. After a fall the paused state has Pip in `rescue` at the rescue point |
| `watch-freeze` | once | The Pocket Watch, on a test level with a watch crate, in eleven parts. (1) From the step after the crate is finished the world holds for `WATCH_TIME / DT - 1` steps (179) and `power:end` comes on the last of them: `worldTime` and `sceneTime` do not move; the age, `x` and `t` of every threat kind and of a crate hold; `timeScale` is 0 and every `eta` is 100 times the world seconds left; nothing is urgent; Pip and the camera hold; `slowT` and Pip's `invulnT` stand still, while the quill's time, `hurtT` and the easing of `assist` go on; a jump pressed during the freeze starts on the first step the world moves. (2) A word finished on a held step pays no close-call bonus, also on the first held step. (3) A threat a fraction of a step from contact is not urgent and pays no close call. (4) A word typed in the freeze frees its slot, and a spawn that was waiting still waits out its retry time on the world clock. (5) A spawn point, the start of a hazard's window, a checkpoint with its section, and the arena line, each reached on the step of the pickup, are acted on by the first step on which the world moves. (6) A fall in progress holds. (7) A duck pressed in the freeze shows the slide at once, and its time is counted when the world moves. (8) A second watch starts the time again, and a continue ends a watch with no event. (9) A watch started on the step Pip enters the arena is ended by `bossIntro` with no `power:end`. (10) A watch crate finished on `lifeLost` starts counting on that screen and goes on after it, through the rescue from a fall. (11) The bot plays Level 2 to its first watch crate and through the freeze with every assertion of section 10.3 on. Seven of the parts are also run with a Red cap in the crate, which leaves the world moving, and must then fail |
| `deterministic` | per level | Two `target` runs on medium with seed 1 give the same `steps`, `score`, `time` and words |
| `no-presentation` | per level | A `target` run on medium finishes when only the simulation files are loaded |
| `words-by-difficulty` | per level | Over the `target` runs of the matrix, the sets of words seen on easy, on medium and on hard have no word in common, and every run passed the `word-pool` assertion. For a level with a flavour in `WORD_FLAVOUR`, words of that flavour's lists are among those seen on every difficulty; no word seen comes from the lists of another flavour |
| `length` | per level | `target` run time is within `LENGTH_BOUNDS` on every difficulty and seed: 240 to 420 s for Level 1, 260 to 440 s for Level 2 |
| `boss-fight` | per level | One `target` run per difficulty, traced from the arena to the results screen. The boss has the kind and the health of `BOSS_EXPECTED`. The states come in the order of section 5.7, from `intro` to `defeated`; the volleys have the contents of each phase, with the minion in phase 3 on the difficulties `BOSS_EXPECTED` names, and every minion carries its `minionSkin` (or none); each entry is thrown as its threat (`rock` from the right, `rockhigh` as a rock from above, `minion` as a digby from below); the attacks of each phase, the launch gap, the rocks in flight, the health, the phases and the scores are those of the config; `boss.lampRed` is true from phase 2 and not before; the finisher runs at a quarter of the speed with nothing live; then the defeat, `levelComplete` and the result. With the bot not typing for 60 s of the fight on each difficulty, the live threats never exceed `config.boss.inFlight`, and the limit is reached on at least one difficulty |
| `boss-continue` | per level | A medium run reaches phase 2, stops typing and loses every life in the arena to threats and attacks; missed weak-point windows cost no life. After `continueRun` the level's own boss (the kind of `BOSS_EXPECTED`) is back at the start of phase 2 after the short intro with `lampRed` true, Pip is at the boss checkpoint with `config.lives` lives and the banked score, nothing is live, and the fight is then won. Restart from checkpoint on the pause menu during the fight does the same. A pause during the intro does not make the intro start again |
| `result-rank` | once | `state.result` after three whole runs (easy `fast`, medium `target`, hard `floor`): the fields of section 5.11, the bonuses, the final score, the rank by the rule of DESIGN 8.6 with `stages`, the suggestion, and the events. A run quit before any key ranks C with no bonuses |
| `attack-windows` | once | `TG.Entities.nextAction` takes the window of an attack from its action and not from its kind: `SHOCK_WIN` for an attack to jump, `PICK_WIN` for one to duck. Shown on a shockwave and a pickaxe, and on each with the other's action written onto the entity |
| `spawn-skin` | once | `TG.Entities.spawn` copies the `skin` of a spawn spec onto the threat or crate, and an entity spawned without one has no such field. The boss's minion, and no rock, carries `level.boss.minionSkin` when the level has one. The word, the budget and the path are the same with and without a skin |
| `tutorial-slowdown` | once | At `TUTOR_T` of a tutorial threat's time with nothing typed, the world slows to `TUTOR_SCALE` and `tutor:prompt` is emitted; the first correct letter ends it (`tutor:end`), and so does contact. Only tutorial threats have it, and only when the run's tutorial is on |
| `adaptive-pacing` | once | DESIGN 9.3: the evaluation every `ASSIST_WINDOW` resolved words, the limits, the easing rate, no increase while a threat is live, which removals count, the rules after a continue, and no change with adaptive pacing off, when a saved lower assist is neither used nor overwritten |
| `level1-events` | once | The run recorded in `test/fixtures/level1-events.json` (Level 1, medium, `target`, seed 1) gives the same list again, event for event: every `boss:state`, `boss:attack`, `boss:throw`, `attack:spawn` and `threat:spawn`, with the frame it was emitted on and its payload, and for a threat or crate also its budget and the x it was given; and the run takes the same number of steps. One changed word and one missing event are each shown to be noticed |
| `targets` | per level; Level 2 only | The rows of `LEVEL_TARGETS` for the level, each on every seed. The floor bot finishes with at most `floorContinues` continues from assist 1.0 (the matrix's runs) and from the assist a floor run of level `savedFrom` on the same difficulty and seed ends with (nine more runs, with `startAssist`). The target bot's `meanU` is within `u`, or for the `uNoted` difficulty at least `uNotedFrom`, and its `fightTime` is within `fight`. `liveAtFlag` is at most the row's value in the target runs and in the floor runs from both starts |
| `campaign` | once | Runs through the first level, NEXT STAGE and the level after it: the target and the floor bot on each difficulty and seed (18 runs), which do on `TG.Save` what the interface does on each results screen. `nextStage` returns false and changes nothing before a run, in play, from the pause menu, on the results screen of a run that was ended and on that of the last level. At the step the run keeps its score, ink, clocks, typing engine and statistics, counters, pacing, generator and the bests read by `newRun`; it has the next level's data and config, a new picker, the difficulty's own lives, no shield charge and no timed power; `nextLifeAt` is the first threshold above the carried score, and checkpoint 0 banks it with the score; the section counters start again, so the first checkpoint's bonus comes from the stage's own first section; exactly `screen:change`, `level:start` and `section:enter` are emitted. At the end the result has `stages` 2, the run's time, score and statistics with `stageScore` and `stageTime` beside them and the bests of before the run; there was one `level:clear` for each stage and no `run:end`; the table holds one entry for the run and the save has the last level as cleared. On each difficulty one more run takes a continue inside the second stage, which returns to that level's checkpoint 0 with what it banked, and another presses NEXT STAGE and is ended at once from the pause menu: its result keeps the score and the rank of the results screen it left |
| `campaign-targets` | per level; Level 2 only | For a run that arrives in the level through NEXT STAGE from level `savedFrom`, on every seed and measured on the stage itself: the stage starts with the difficulty's own lives, no shield charge and the assist the stage before ended at; the floor bot takes at most `floorContinues` continues in the stage; the target bot's window use in the stage is within `u`, or for the `uNoted` difficulty at least `uNotedFrom`. It reads the runs of `campaign` |

Output, one line per run and per check, then a summary:

```
RUN  level=2 difficulty=medium profile=target seed=1 wpm=30 acc=0.95 adaptive=off until=results result=PASS finished=1 time=346.2 score=74970 lives=9 continues=0 dmgTyp=0 dmgOther=0 repWpm=28.4 repAcc=0.958 assist=1.00
CHECK name=jump-geometry result=PASS detail="..."
CHECK name=deterministic level=2 result=PASS detail="steps 20774, score 74970, time 346.233"
SUMMARY runs=72 passed=72 checks=49 checksPassed=49 result=PASS
```

- A RUN line begins with `level=`, the levels of the run joined by `+`: `level=1`, `level=2`, or `level=1+2` for a campaign run. A run that fails has ` reason="..."` at its end.
- A CHECK line of a per-level check has `level=N` after the name. `detail` says what was measured, or what failed. A check that cannot be made with the options given prints `result=SKIP` and is not counted.
- With `--measure`, each RUN line is followed by a MEASURE line with the measurements of the report (section 10.3):

```
MEASURE level=2 difficulty=medium profile=target seed=1 u=0.576 fight=102.7 livesLost=0 minLives=4 liveAtFlag=0 cratesAtFlag=0 pastFlag=0 watch=206:2,770:3 dangles=8 dangleNearest=128.0 startAssist=1.00
```

  `watch` lists each watch crate as tile:live, with `missed` for one that was not cleared. For a campaign run the line ends with `stages=`, one entry for each stage cleared, as level:score/time/lives/continues/u/assist: the run's score and time at that results screen, the lives held there, the continues taken in the stage, its window use and the assist it started at.
- The totals for the two levels are 72 runs and 49 checks. `--level 1` gives 36 runs and 36 checks, `--level 2` 36 and 38, `--quick` 36 and 38, and `--campaign` 36 and 2.

Options:

| Option | Meaning |
|---|---|
| `--difficulty easy\|medium\|hard` | Run only this difficulty |
| `--profile floor\|target\|fast\|exact` | Run only this profile |
| `--wpm N --accuracy A --react R` | One custom run (needs `--difficulty`); printed as `profile=custom`, always `result=INFO` |
| `--seed N` | Use this seed only |
| `--level N` | Play only this level, with its runs and its checks. A level that is not in `LEVELS` prints `LEVEL N NOT BUILT` and a summary with `result=NOT_BUILT`, and the exit code is 1 |
| `--quick` | The matrix plays only the first level of `LEVELS`, as `node test/run-all.js --quick` runs the file. The checks that are run once are still run, and some of them play a later level: `campaign` plays its runs through both. The data-only checks are still run for every level |
| `--campaign` | Play the matrix as whole campaigns: each run starts at the first level and goes on through NEXT STAGE to the end of the last (`level=1+2`). Only the `campaign` and `campaign-targets` checks follow. Not with `--level`, `--quick`, `--milestone` or `--until` |
| `--measure` | Also print a MEASURE line after each RUN line |
| `--adaptive on\|off` | Override |
| `--until checkpoint1\|checkpoint2\|boss\|results` | Stop every run at this point. Checks that need a full run (`deterministic`, `no-presentation`, `words-by-difficulty`) are then run to the same stop point, and `length`, `targets`, `campaign` and `campaign-targets` are skipped |
| `--check NAME` | Run only this extra check, and no matrix runs. A per-level check is run for every level, or for the one of `--level` |
| `--milestone N` | Run the runs and checks of milestone N of the WP-E checklist (section 12) |
| `--verbose` | Also print one line per life lost, checkpoint, continue and boss phase |
| `--help` | Print the options and exit with 0 |

An option that is not in this table, or a value it does not take, prints the options and gives exit code 2.

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
- `state.timeScale = pace * assist * slowScale * tutorScale * finisherScale * freeze`: six factors. `freeze` is `WATCH_SCALE` (0) while `power.watchT > 0` and 1 otherwise. It is worked out in each step and is not a field of the state.
- `wdt = dt * state.timeScale` is the world step. It is 0 while the screen is `lifeLost`, and while a Pocket Watch runs, when `timeScale` is 0.
- On the **world clock** (`wdt`): Pip's movement, jump arc, coyote time, jump buffer and slide time; threat and crate clocks; attack movement; spawn retries; boss state timers except the intro; entity and player `animT`.
- On the **real clock** (`dt`): `state.time`; every typing statistic and key timestamp; the discard window; invulnerability; Hourglass, Golden quill and Pocket Watch time; `lifeLost`, `bossIntro` and `levelComplete` timers; assist easing; the timers of `TG.Effects` and `TG.Hud`. Two of these stand still while a Pocket Watch runs: invulnerability and the Hourglass's time.
- The **scene clock**, `state.sceneTime`, takes the real step `dt` on every step but those on which a Pocket Watch runs (`power.watchT > 0` at the start of the step). A `lifeLost` screen does not hold it. `TG.Render` animates the world's picture from it (section 4.19). In a run in which no watch has run it equals `state.time`; a watch that runs its whole time in play leaves it 179 steps, 2.983 s, further behind.
- **Nominal seconds** in the difficulty config are converted once, with `TG.Difficulty.toWs` (multiply by `pace`), and then counted on the world clock.
- `eta` on typables is in real seconds at the current time scale: the world seconds left divided by the time scale, which is taken as at least 0.01. While a Pocket Watch runs it is therefore 100 times the world seconds left, and it says nothing about when the threat arrives. `eta` on attacks and in `nextAction` is in world seconds.
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

Hand-over notes are part of the final message of each package to the lead, not a file, with one exception: WP-E's list of tuning changes, which is a comment in `js/levels/level1.js` (section 12.1). Each later level has such a list in its own file.

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

**Level 1 record.** WP-E delivered milestone 6 with `Tuning changes: none`: the whole matrix and every extra check pass with the starting values of section 3 and section 5.10 and the timeline of DESIGN 11 as written. The `tune` block of `js/levels/level1.js` and `CONSTANT_OVERRIDES` in `test/sim.js` are empty, so there was nothing to write back, and the numbers in section 3, section 5.10, DESIGN 9.1 and DESIGN 11 are the final values. `node test/sim.js --level 1` passes (36 runs, 36 checks).

After a play review, Level 1's `tune` block and its `Tuning changes` list hold four changes on each of Medium and Hard, all within the limits above: `react`, `perChar`, `boss.health` and `boss.coreWords` (section 14.2). They are left in the tune block rather than written back into section 5.10, because they describe Level 1 and the difficulty table is the starting point for later levels. DESIGN 9 (Level 1 record) and 11.6 give the values.

**A later level.** The table above is written for Level 1's files. The same limits hold for the `tune` block of a later level, measured from the values of section 5.10, with one difference: `tierMix` is not a number that can move by 25%, and a later level replaces it whole, with an entry for each section and for the arena. A later level's starting values are its own: its timeline and its counts come from its design (for Level 2, DESIGN 11A, which was written from LEVEL2 8 and 9, with the counts of DESIGN 11A.2 and LEVEL2 8.4), and the position and count limits are measured from those. Its file carries its own `Tuning changes` list, and the tables of section 10.3 have a row for it. Nothing of a later level is written back into section 5.10 or `js/core.js`: its `tune` block stays in its file, as Level 1's does.

**Level 2 record.** The `tune` block of `js/levels/level2.js` holds the values of LEVEL2 8.1 as written: timing values within 25% of section 5.10, whole numbers within 1, `tierMix` replaced whole, and on Easy `boss.minion` set to true, so that the phase 3 volley ends with the minion on every difficulty. Its list reads `Tuning changes: none`: the matrix and every extra check passed at the first measurement with the Dangle and the Flit as built, and nothing was tuned afterwards. `node test/sim.js --level 2` passes (36 runs, 38 checks), and `node test/sim.js` for both levels 72 runs and 49 checks.

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

**Level 2 record.** Level 2's Tier 2 items and their fallbacks are the table of LEVEL2 13.7. None was left out: the gauge needle and the toot, the Baron in his pipe, the cameo of the intro, the snow, the `tin` remap, the "1..." popup and the key's rate by phase, the three results lines, the pending entry, Level 2's story panel with the cavern behind the idle rotation, `jingle_ready2`, `bg_mist`, `decor_hole` and the watch's frame are all built.

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
- [ ] After `power:start` with `hourglass` and `boss:warning`, a `level:start` event (with `continued` true or false) returns the tempo scale to 1 and turns bass-only off, and `jingle_ready` plays once. `game:continue` followed by `level:start` plays `jingle_ready` once, not twice. With `music.ready` naming a track of `TRACKS`, that jingle plays in its place; with a name that is not in `TRACKS`, `jingle_ready` plays and nothing is warned.
- [ ] `level:start` with `music: { level: 'level1', boss: 'boss1' }` followed by `screen:change` to `playing` plays `level1`; with a track name that is not in `TRACKS` it warns once and does not throw.
- [ ] From `boss:phase` with phase 3 the boss track has the tempo and the pulse 2 octave of the arena's `music.phase3`, and 184 and an octave up where that is missing or one of its values is. The values of one level are not carried into the next.
- [ ] `power:start` with `watch`: no music note starts while the watch runs, `update` plays `watch_tick` every half second, a tick and a tock in turn, six in its 3 s, and the ticks wait on `paused`. `power:end` with `watch` plays `watch_off`, and the loop goes on with the first step that had not sounded. A watch that ends with no `power:end` plays no `watch_off` and leaves no music standing.
- [ ] In a level whose boss kind is `ratchet` the six boss sounds of 7.1 play her recipes, `toot` plays in place of `boss_weak` after a volley whose every entry was typed, and `click` plays on each letter of the finisher word and three times in the long intro. With the kind `baron`, with no kind, no level or no game, the Baron's sounds play.
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
- [ ] Every WP-C sprite in 6.4 and the remaps `white`, `gold`, `dim`, `lampred` and `tin`.

Acceptance:

- [ ] `TG.Sprites.missing('C')` is empty.
- [ ] Every defined sprite passes `TG.Sprites.check`; every enemy uses at most 3 colours plus INK, Pip at most 5 plus INK, the parts of each boss at most 6 plus INK in total, plus CREAM for the Baron's lamp and for Lady Ratchet's lenses.
- [ ] A Level 2 sprite that takes the place of a Level 1 sprite has that sprite's size, frame names, fps and anchor, as 6.4 says for each. `TG.Remaps.tin` has the pairs of 6.3.
- [ ] `boss2_head` has two CREAM lenses in `normal`, `laugh` and `dizzy` and no goggles in `hurt`; `boss2_goggles` has the pair; no other part of Lady Ratchet has CREAM.
- [ ] `boss_head` has CREAM pixels in all four frames, and no other part of the Baron has any. `TG.Remaps.lampred` equals `{ 19: 25 }` by value. A `boss_head` frame drawn with `lampred` differs from the plain frame only in the pixels that were CREAM; the GOLD pixels of the helmet are unchanged.
- [ ] Every sprite frame with an outline rule has INK on every opaque pixel that touches a transparent pixel or the frame edge (report as a warning list; at most 5% of edge pixels may differ).
- [ ] The font has a glyph for every character in 4.10 and every symbol in `TG.Font.SYM`; no two glyphs are identical; O, Q, D and 0 differ from each other by at least 3 pixels, as do I, L and 1.
- [ ] `TG.Gfx.draw` of an undefined name draws the placeholder and warns once.
- [ ] `TG.Gfx.get` returns the same canvas object for the same arguments and a different one for a different remap.
- [ ] Visual check in a browser (manual): a test page or a temporary call that draws every WP-C sprite frame on a grid at 4x.
- [ ] Art check (lead decision 13.6): the sprites are rendered with `tools/sheet.js` at 4x, the PNG files are opened, and the pixel data is revised until each sprite reads clearly as what it is: Pip faces right; threats that arrive from the right face left; animation frames of one sprite keep the same proportions and ground line; the Baron reads as a large mole with a miner's helmet. At least two rounds of look and revise for every character sprite.

### WP-D: world art

Deliverables: `js/sprites-world.js`, `test/test-sprites-world.js`.

- [ ] Every WP-D sprite in 6.4, the remaps `sunset`, `dusk`, `brass`, `crystal` and `paleink`, and `TG.Backdrops.meadow` and `TG.Backdrops.cavern` as in 6.5.

Acceptance:

- [ ] `TG.Sprites.missing('D')` is empty; every sprite passes `TG.Sprites.check`.
- [ ] `fx_bracket` has the four frames `tl0 tl1 bl0 bl1`; each `bl` frame is the matching `tl` frame mirrored top to bottom.
- [ ] `tile_grass`, `tile_soil`, `tile_arena`, `bg_hill_far` and `bg_hill_mid` tile horizontally: the first and last columns of each are compatible (the test compares column 0 with the column after the last by checking that the silhouette height differs by at most 1 px).
- [ ] `TG.Backdrops.meadow` has the palettes `day`, `sunset`, `dusk` and the five layers; every sprite name it uses is defined; sky bands cover y from 0 to 184 without gaps.
- [ ] `TG.Backdrops.cavern` has the palettes `lantern`, `brass`, `crystal` and `clock` and the seven layers of 6.5; every sprite name it uses is defined; in every palette the first band is one flat colour from y 0 to 150 and the bands cover y from 0 to 184. The rules under the tables of 6.5 hold on the pixel data of every item: what stands in the plate band, the pieces of the arena, and the pieces that are dimmer than the hazard skin they can stand behind.
- [ ] Each Level 2 tile and hazard skin has the size, frame names, fps and anchor of the Level 1 sprite it takes the place of. The remaps `brass`, `crystal` and `paleink` have the pairs of 6.3.
- [ ] `haz_bramble`, `haz_branch`, `haz_beehive` and `haz_arch` each contain CORAL pixels (the hazard accent). The thorns of `haz_bramble` fill the middle 8 columns of its lower 8 px, which is where its collision box is.
- [ ] In each of `bg_hill_far`, `bg_hill_mid`, `bg_tree`, `bg_bush` and `bg_appletree`, WHITE, GOLD and INK together make up at most 10% of the opaque pixels, so word plates stay legible in front of them.
- [ ] Visual check in a browser (manual), as for WP-C.
- [ ] Art check (lead decision 13.6), as for WP-C: render with `tools/sheet.js` at 4x, open the PNG files and revise until every tile, hazard, item and backdrop piece reads clearly as what it is.

### WP-E: gameplay simulation

Deliverables: `js/input.js`, `js/entities.js`, `js/level.js`, `js/boss.js`, `js/game.js`, `js/levels/level1.js`, `js/levels/level2.js`, `test/sim.js`.

- [ ] `TG.Input`, `TG.Entities`, `TG.Level`, `TG.Boss`, `TG.Game` as in 4.12 to 4.16.
- [ ] Data shapes as in section 5; events as in 8.2 to 8.5; state machine as in section 9.
- [ ] Level 1 data following DESIGN 11 and Appendix B, with the `Tuning changes` list of section 12.1.
- [ ] Level 2 data in `js/levels/level2.js`, with a `Tuning changes` list of its own (section 12.1, "A later level").
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

The runs of a milestone are played for every level of `LEVELS`. Every extra check of section 10.4 belongs to one milestone, and `--milestone N` runs those of milestone N (milestone 6: all of them). Milestone 1: `level-valid`, `counts`, `skins`, `jump-geometry`, `fall-geometry`, `duck-held`, `input-translate`, `input-buttons`, `load-isolated`, `sim-purity`, `init-event`. Milestone 2: `no-dodge-actions`, `spawn-onscreen`, `anchored-kinds`, `new-kinds`, `typing-results`. Milestone 3: `crate-queue`, `items-shape`, `continue-restore`, `no-type`, `no-jump-bridge`, `pause-deferred`, `watch-freeze`. Milestone 4: `deterministic`, `no-presentation`, `words-by-difficulty`, `length`, `boss-fight`, `boss-continue`, `result-rank`, `attack-windows`, `spawn-skin`. Milestone 5: `tutorial-slowdown`, `adaptive-pacing`. Milestone 6: `level1-events`, `targets`, `campaign`, `campaign-targets`.

Acceptance:

- [ ] `node test/sim.js` exits with 0. This includes the assertions of section 10.3 and the extra checks of section 10.4.
- [ ] `TG.Input.translate` follows the table in 4.12, including `e.repeat`, modifier keys and the semicolon rules.
- [ ] A `pointerdown` on an element bound with `TG.Input.bindButton(element, 'jump')`, sent with `env.dispatchTo`, queues a `jump` key down and calls `preventDefault`; `pointerup`, `pointercancel` and `pointerleave` queue the key up.
- [ ] Threat counts per section and difficulty match DESIGN 11.2 as amended by the `Tuning changes` list (check `counts`). For Level 2 they match DESIGN 11A.2 (LEVEL2 8.4) as amended by its own list, and the kinds and the crate powers are those of section 10.3.
- [ ] No two live typables ever share a first letter during any acceptance run (assertion `first-letters`).
- [ ] Live threats never exceed `config.maxActive` for the section (assertion `active-cap`).
- [ ] Every word shown in a run belongs to the pools of the run's difficulty (assertion `word-pool`, check `words-by-difficulty`).
- [ ] A threat whose word is not finished always reaches Pip, whatever he is doing (assertion `no-dodge`). A test that makes Pip jump, and one that makes him slide, at the moment a Dawdle and a Buzzle reach `t = 1` both end in `threat:hit`.
- [ ] Running into a narrow gap and into a wide gap without jumping both end in a fall (check `fall-geometry`).
- [ ] Score returns to the banked value on continue; typing statistics do not reset.
- [ ] After a continue, `state.power.slowT`, `quillT` and `watchT` are 0, `state.slowScale` is 1, no entity is live, and the events `screen:change`, `game:continue`, `level:start`, `section:enter` were emitted in that order. `newRun` emits `screen:change`, `level:start`, `section:enter`.
- [ ] A crate spawned while a threat is live gets a budget of at least the queue value, and a threat spawned while a crate with untyped letters is live counts the crate in `A` and `R`.
- [ ] A Dawdle, Hoppet, Buzzle or Truffle is `onScreen` on the step it is spawned, for budgets of 2, 6 and 12 ws. A Digby is not `onScreen` until `t = DIGBY_POP_T` and its `dx` is `DIGBY_DX` until then. A Dangle and a Flit are spawned above the playfield and stay in view once they have come into it (check `spawn-onscreen`).
- [ ] Every element of `state.items` has the shape of section 5.14, and a collected drop is no longer in the array on the step after `pickup:ink`.
- [ ] A run in which the bot never types ends in `gameOver`, and after `continueRun` Pip is at the last checkpoint with starting lives (check `no-type`).
- [ ] In a run on easy in which the bot never jumps, the first gap that Pip falls into `config.bridgeAfterFalls` times is bridged from then on, and `hazard:bridge` is emitted once for it (check `no-jump-bridge`).
- [ ] A pause requested during `lifeLost` takes effect when the timer ends (check `pause-deferred`).
- [ ] The dangle and the flit keep to their paths, with their warnings, their edge tags and the letter stall on the flit alone (check `new-kinds`). An anchored kind stays at its `anchorX` (check `anchored-kinds`), and a dangle keeps `DANGLE_CLEAR` from every hazard to duck (assertion `keep-clear`).
- [ ] While a Pocket Watch runs the world holds and the level waits, and it ends by its time, by a continue or at the arena (check `watch-freeze`, assertion `watch`).
- [ ] The boss of a level is the one its data names, with that level's health, minion and minion skin (checks `boss-fight`, `boss-continue` and `spawn-skin`).
- [ ] `TG.Game.nextStage` carries a run from a cleared level into the next and refuses everywhere else (checks `campaign` and `campaign-targets`).
- [ ] Level 1 plays as it did before the engine read from level data: the recorded run gives the same events (check `level1-events`).
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
- [ ] Tiles and hazards are drawn with the names of `theme.tiles` and `theme.hazardSkins`, in the frames and places of Level 1's. An entity is drawn, and cleared or knocked away, with its own skin, else with the sprite and the remap of `theme.skins` for its kind, else with the sprite of its kind. A minion with a skin of its own comes up in front of its mound.
- [ ] A dangle is drawn in `hang0` and `hang1` with its sway and its thread, and a flit in its flap frames and its `dive` frame, flipped from its turn, with its flutter in the crossing only. Their plates hold still, and each is cleared where it was drawn.
- [ ] The boss is drawn from the parts of `boss.kind`: Lady Ratchet in every pose and from her intro to her defeat (6.4), with the sprite files, with `gfx.js` and `font.js` alone and with only `core.js`. The boss bar's label and the tips after a hit come from the level's boss table.
- [ ] While `power.watchT > 0` the power slot shows `pw_watch` with a WHITE gauge, and the watch's frame of 4.19, 1 px of AQUA from x 0 to 383 and y `PLAY_TOP` to 215, is drawn three steps on and three off. With `state.sceneTime` standing still the world's picture holds while `state.time` runs on (6.6).
- [ ] The ink drops are drawn with `theme.inkRemap`; the bursts of `hazard:hit` and `hazard:bridge` have the colours of `theme.hazardFx`; a RED plate border has the rim of `boss.urgentRim` in the boss phases it names. Without these keys the picture is Level 1's.
- [ ] Visual check in a browser (manual) once the simulation exists: plates legible over every backdrop palette; HUD positions match DESIGN 13.

### WP-G: screens and bootstrap

Deliverables: `js/ui.js`, `js/main.js`, `index.html`, `css/style.css`, `test/test-ui.js`.

- [ ] `TG.UI` and `TG.Main` as in 4.20 and 4.21; screens from DESIGN 12; page elements from 4.21.
- [ ] Whole-number scaling with room for the buttons (section 4.21, DESIGN 14.1), letterbox, on-screen buttons (DESIGN 2).
- [ ] (Tier 2) CRT overlay (DESIGN 14.8); title idle rotation.

Acceptance (`node test/test-ui.js`). The test uses fakes for the modules that are built in the same stage, when the real files are absent:

- for `TG.Game`, a fake that implements `state`, `init` (which emits `screen:change` to `boot`), `setScreen`, `canGo`, `newRun`, `pause`, `resume`, `continueRun`, `endRun`, `nextStage` and `isSimScreen`;
- for `TG.Input`, a fake that implements `init`, `typeChar`, `keyDown`, `keyUp`, `isDown`, `drain`, `clear`, `bindButton` and `onFirstInput`. The test puts keys into it with `typeChar` and `keyDown`, and `TG.UI.update` drains it;
- for `TG.Audio`, a fake that records calls to `unlock`, `suspend`, `resume`, `update` and `music`.

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
- [ ] The difficulty screen has no STAGE row until a level after the first is open; with the row, Up and Down change the stage, the choice is remembered, and `newRun` is called with that `levelId`.
- [ ] On `results` after a cleared stage with a level after it, the strip appears once the last page is tallied. There Enter alone calls `TG.Game.nextStage`, once, and nothing is entered; Space and the JUMP button do nothing; Esc leads to `highScoreEntry` or `title`, as Enter does without the strip. Esc is read on `results` only with the strip shown.
- [ ] `TG.Save.recordRun` is called once for each result. A run that went on through NEXT STAGE is entered once, at its end, with its run total; the pending entry is set at NEXT STAGE, cleared when the run reaches the title, and entered at the next start if it is still there.
- [ ] The results lines of a run with stages: STAGE N UNLOCKED the first time a clear opens the next level, STAGE 1 SCORE as the first row of a run that came through NEXT STAGE, BEST RUN beside the final score, and the line that names what the next rank needs.
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
- [ ] With all 21 files loaded under the stubs, 600 frames driven through `env.runFrame` from `boot` to `playing` (keys injected with `env.dispatch`) complete without a captured `console.error`.
- [ ] `TG.Sprites.missing()` is empty; no placeholder warning appears during a full bot run with rendering on, in Level 1 and in Level 2.
- [ ] `node test/test-level1-pixels.js`: Level 1 is drawn as recorded. The 36 frames of `test/fixtures/level1-pixels/`, from one `target` run with seed 1 on each difficulty, are taken again and compared pixel for pixel.
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
| `tools/shot.js` | WP-F | `node tools/shot.js --out <file.png> [--difficulty medium] [--seed 1] [--level 1] [--at <seconds>] [--until checkpoint1\|checkpoint2\|boss\|results] [--frames <n>] [--scale 3]`. Runs the bot of `test/sim.js` with all files loaded and the software canvas, calling `TG.Main.tick` and `TG.Render.draw` each step, and writes the frame at the chosen moment. `--level <n>` is the level to play (default 1). The other options are in the list under this table |
| `tools/shot-ui.js` | WP-G | `node tools/shot-ui.js --screen boot\|title\|difficultySelect\|howToPlay\|paused\|gameOver\|results\|highScoreEntry --out <file.png> [--scale 3]`. Draws one interface screen on the software canvas. `--screen all` writes every screen into the directory given as `--out`. The other options are in the list under this table |

More options of `tools/shot.js`:

- The moment, the first of these that is given: `--at <s>`, the first frame with `state.time >= s`; `--when "<expr>"`, the first frame for which the JavaScript expression is true, with `s` the state and `TG` the namespace; `--event <name>[:<n>]`, the frame of the n-th emission of an event (the first without `n`). `--after <s>` waits that many seconds of `state.time` after the moment. With none of them the last frame of the run is written, which with `--until` is the frame of the stop point.
- More frames: `--frames <n>` writes n frames from the moment on, as `<out>-00.png`, `<out>-01.png` and so on; `--every <k>` is the number of steps between them (default 1); `--sheet` puts them side by side in one PNG, at most 4 to a row or `--cols <n>`; `--crop x,y,w,h` writes only that part of each frame, in game pixels.
- The run: `--profile floor\|target\|fast\|exact` (default `target`), or `--wpm N --accuracy A --react R` for a custom bot; `--adaptive on\|off`; `--no-type`, `--no-jump`, `--no-duck`; `--reduce-flash` turns the `reduceFlash` setting on and `--key-guide on\|off` sets `keyGuide`.
- `--info` prints the state at each frame written (entities, lock, player). `--events <file.json>` also writes the game events emitted from the first written frame on, as `[{ f, name, payload }]` with `f` the index of the frame.
- Exit codes: 0 written; 1 bad options, or the moment never came; 2 the run failed before the moment. The run is the one of `node test/sim.js` with its assertions (section 10.3), so a `console.warn` or `console.error` from any module, such as a sprite that is not defined, stops it and is printed.
- As a module it exports `run(options, { setup, afterDraw })`, the same drawn run with the caller choosing the frames. `test/test-level1-pixels.js` takes all its frames of a difficulty from one such run.

More options of `tools/shot-ui.js`:

- `--difficulty easy\|medium\|hard` (default `medium`) for the screens reached by playing; `--panel menu\|options\|scores\|story\|bye` for the title (default `menu`); `--page 1\|2` for `results`; `--wait <s>` lets the screen animate that much longer before the picture is taken; `--scale` is a whole number from 1 to 8.
- `--stage 1\|2\|1+2`. Without it the picture is of a computer on which Level 2 is still locked. `1`: Level 2 is unlocked and the STAGE row of the difficulty screen is on STAGE 1. `2`: the same with the row on STAGE 2, so the screens reached by playing are of a run started at Level 2, and `--panel story` shows Level 2's story panel. `1+2`, for `results` and `highScoreEntry` only: Level 1 is cleared from a fresh start, NEXT STAGE is taken and Level 2 is played, so the screen is the one at the end of a two-stage run.
- `--world off\|ready\|loading\|failed\|empty`, `--board`, `--entry` and `--send` draw the world scores screens with a stand-in service that makes no network request (section 14.2, "World scores").
- Exit codes: 0 written; 1 no `--screen` or `--out`, an unknown screen, an option without a value or a bad `--scale`; 2 the screen was not reached, something was written to `console.error`, or one of the other options had a value it does not take.
- As a module it exports the session that drives the game by key events (`createSession`), its bot, the steps `unlock`, `startRun`, `finishRun` and `nextStage`, and the stand-in service (`createWorld`), which the tests use. `createSession` takes `stored`, what the browser's storage holds when the page starts: the storage of an earlier session, to load the page again, or a record that an earlier copy of the game wrote.

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

WP-H integrated the delivered packages of Level 1. This section records what was checked, where the delivered code differs from the text of sections 1 to 12 and of `docs/DESIGN.md`, and what is left for the lead. The code is tested and working in each case below, so it was kept, and this record is the contract for it. Where a line here differs from the text above, this line describes the game as built. Work done after the integration has entries of its own in the same form; the last is Level 2, which was built against the plan `docs/LEVEL2.md`.

### 14.1 What was checked

`node test/run-all.js` runs the `test/test-*.js` files (fourteen: the ten of Level 1, `test-server.js`, `test-board.js` and `test-board-server.js` since world scores, and `test-level1-pixels.js` since Level 2) and `test/sim.js` and passes (about three minutes with several files at a time). With `--quick` it takes about 40 s: `test-render.js` and `test-integration.js` run shorter, `test-level1-pixels.js` compares one of its three runs, and the matrix of `sim.js` plays the first level only (10.4). `test/test-integration.js` (WP-H) loads all 21 files under the stubs with the software canvas, which throws on any canvas call outside the subset of 13.2, and checks:

- every file present, no sprite of 6.4 missing, nothing drawn or played at load time;
- no network API, remote address or external file in `index.html`, `css/style.css` or any script, except in `js/board.js`, which may call the network function it is handed and holds the one remote address, `TG.Board.URL` (rule 10 of 2.2);
- every sound and track name played by `audio.js` is in `TG.Audio.SFX` or `TG.Audio.TRACKS`;
- boot, title, difficulty select, how to play and play reached with key events through `env.dispatch` and 600 frames through `env.runFrame`, on each difficulty;
- a whole run by the `test/sim.js` bot on each difficulty with `TG.Main.tick`, `TG.Audio.update` and `TG.Render.draw` on every step, with every assertion of 10.3 and no console output (so no placeholder sprite, no unknown sound, track or event);
- pause and resume on `playing`, `bossIntro` and `boss`; a pause during `lifeLost` by Esc, blur and a hidden tab is deferred; pauses are ignored on `levelComplete`; blur and focus on the title and in play; a frame longer than `MAX_FRAME`;
- game over and continue at each of the four checkpoints, the boss included (the level's boss in the phase reached, and the boss track at the tempo of that phase: in phase 3, 184 for the Baron and the tempo of the arena's `music.phase3` in Level 2), with lives, score, threats, lock, timed powers and music checked: in Level 1, in Level 2 started from the STAGE row, and in Level 2 after NEXT STAGE, where the score, the next extra life and the stage count of the first stage are kept; game over with the countdown running out;
- quit from the pause menu with the Hourglass running and a word locked, then a new run with nothing left over (score, statistics, entities, powers, effects, music); a finished run, high score entry, and a second run to the end;
- options changed on the title and in force after a reload with the same storage; storage missing and storage that throws, through play, quit, results, high score entry and a new run;
- a clumsy player on Easy and Hard (random wrong keys, Backspace, stray jumps and ducks, held duck keys, pauses with random menu keys, blur and focus, long frames, random keys on the results and high score screens), drawn every frame, until the run is over and the title is back;
- Level 2 and runs of two stages: a whole Level 2 run from the STAGE row on Easy and on Hard and one through NEXT STAGE on Medium, each drawn and heard on every frame through the real loop to STAGE 2 CLEAR, with Level 2's creatures, tracks and sounds, no placeholder and no console output; NEXT STAGE by key events on each difficulty, with the run entered once at its end (one initials screen, one table entry, one run token and one submission, with the run's total and time); TITLE at STAGE 1 CLEAR; NEXT STAGE and then QUIT from the pause menu; NEXT STAGE with the world scores off, with a token that arrives late and with the service out of reach; options set on the title in force in the next stage; a record stored before Level 2 read through a reload, with and without a dated cleared entry; the pending entry of a tab closed in Level 2.

Screenshots from `tools/shot.js` and `tools/shot-ui.js` were taken across the whole flow (every screen and title panel, each section, each creature and hazard, crates and powers, the boss intro, volleys, both attacks, taunt, recoil, the three phases, the minion, the finisher and the defeat, falls and rescues, game over and continue, both results pages, high score entry) and opened. No sprite was found in the wrong place or facing the wrong way, no text outside the screen (also checked by measuring every `TG.Font.draw` during rendered bot runs on each difficulty), no overlapping plates, and the HUD values matched the state. A short run in a real browser (Chromium, served from localhost) went from boot to results and a high score entry with the real canvas and AudioContext, with no console output, only palette colours on the canvas, only the page, the style sheet and the 19 scripts requested, and scores and settings kept after a reload.

WP-H changed no file of another package. No stand-in was used, so `test/standins/` never existed.

**Level 2.** Level 2, CLOCKWORK CAVERNS, was built in milestones against the plan `docs/LEVEL2.md`, whose section 13.8 records each one. Besides the tests above, this was checked:

- Level 1 is unchanged. Before the engine began to read from level data what Level 1 had hard-coded, 2,097 frames and the event logs of seeded Level 1 runs were recorded from the released game, and they were compared byte for byte after every milestone. Inside a Level 1 run every frame is the same, and every event but `level:clear`, whose result has four more fields. Two tests keep this: `test/test-level1-pixels.js`, with 36 reference frames in `test/fixtures/level1-pixels/`, and the `level1-events` check of `test/sim.js`. The one Level 1 screen that changed is How To Play, which has a seventh power-up row. One change was made afterwards on the owner's word, and it shows only in a run that is paused during the Baron's intro: his speech line then goes on from where it was (14.3). The seeded runs that are compared have no pause, and their 2,097 frames and event logs are still the same.
- The targets of the plan (LEVEL2 13.5), measured on seeds 1 to 5 with the creatures, the watch and the fight as built (Easy / Medium / Hard). The floor bot takes no continue, started at assist 1.0 and started at the assist a Level 1 run leaves saved. The target bot's mean window use is 0.50 to 0.55 / 0.58 to 0.62 / 0.66 to 0.69, its fight lasts 69 to 74 / 100 to 103 / 110 to 112 s and its run 390 to 394 / 344 to 346 / 307 to 310 s. No threat is live at the arena flag in 30 runs. Easy's window use is under the plan's band of 0.55 to 0.75 on 4 seeds of 5: the owner decided to keep Easy's timing on the first measurement, which had 3 seeds of 5 under (14.3), and the `targets` check accepts Easy down to 0.50. For a run that arrives through NEXT STAGE (seeds 1 to 3) the floor bot takes no continue in the stage, and the window use is 0.52 to 0.55 / 0.59 to 0.61 / 0.66 to 0.69.
- The two legibility rules of the cavern (LEVEL2 3.1) on the level as drawn, in every palette and boss phase on each difficulty. Two separate counts, over 4,699 and 8,357 frames, found every backdrop pixel of the plate band (y 24 to 149) either SHADOW or one of the exceptions of section 6.5, and the clock face clear of every plate and of the boss.
- The art and the music were looked at on sprite sheets, in the notes and renders of the tracks and on 131 frames from the renderer, in two rounds, by reviewers who had not made them. The second round found nothing that had to be fixed.
- Saved data. Strings stored by the released game (`test/fixtures/save-before-level2.json`) load with nothing lost. A review whose whole task was to lose saved data, or to reach Stage 2 without the unlock, found no way.
- World scores. 360 bot runs for each difficulty on each of three paths (Level 1 alone, Level 2 from the STAGE row, both stages) gave the limits of `docs/LEADERBOARD.md` 5. The released game, played from its menus against the Worker's code from before and after the change, got the same answer to each of 318 requests.

Not checked: the game in a real browser. The motion of the two creatures and of the fight, and the level at real size, were judged from frame sheets and still pictures only (14.3). The Worker with the limits for two stages was not deployed when this record was written.

### 14.2 Differences between the delivered code and the text

Extra test-only views, used by tests and tools and never by the game: `TG.Audio._internals`, `TG.Effects._list()`, `TG.Events.FIELDS` (the payload fields of section 8 per event), and `fps` and `names` on every `TG.Sprites.MANIFEST` entry.

**4.4 `TG.Save`.** `load()` without working storage keeps the data in memory (validated); with working storage and no value, or invalid JSON, it gives the defaults. `resetScores()` resets the three tables and the personal bests, keeps settings and assist, and saves. Seeded entries have `cleared: true`. `recordRun` updates the best WPM for every run, including runs ended early.

**4.5 `TG.Difficulty`.** `rank()` returns -1 for an unknown name. `includes(name, undefined)` is true (entries without `min` are used on every difficulty); an unknown name or tag gives false. `wordRange` for a kind without a `wordLen` entry warns once per kind and returns `[2, MAX_WORD_LEN]`. `resolve` warns once per ignored key per call, and returns `get(name)` itself when the tune block has no keys at all.

**4.6 `TG.Words`.** Every word of DESIGN Appendix A is in the pools, in order, except `blackjack` (Hard tier 2), left out as a gambling term (see 14.3). The five 11-letter words of Hard tier 3 are valid but never picked for a threat, because `MAX_WORD_LEN` is 10. `validate()` also reports a Q, X or Z in Medium tier 1 and a sample word that is not in the pools. When the bottom of the length range is lowered (DESIGN 10.4 step 8), the search is made with the recent list first and then without it.

**4.7 `TG.Typing`.** A one-letter word completes on its lock key (result `complete`). On completion the typable keeps `typed` and `errors`; only `ty.target` is cleared. A `type:miss` with nothing locked carries the `x`, `y` and first letter of the typable with the lowest `eta`; `repeat` counts wrong keys since the last correct key or lock change. A target whose own `lost` or `typable` flag changed is released (`gone`) even while still in the list, and a typable with `lost === true` is never a lock candidate. `onDamage` always emits `streak:change`. `peakWpm` is 0 until five words are completed. `create()` without options uses `autoReleaseMisses: 3, streakPenaltySteps: 2`.

**4.8 `TG.Audio`.** The four music channel gains of DESIGN 15.1 feed a music bus at `MUSIC_LEVEL = 0.2` (0.35 before the presentation review), so that the typing sounds sit above the music with browser-normalised pulse waves. The master DynamicsCompressor is a hard-knee limiter (threshold -6 dB, knee 0, ratio 12, attack 3 ms, release 150 ms). The look-ahead is 100 ms and grows to at most 300 ms after long frames. Tempo scale and bass-only are also reset on game over, level complete, results, high score entry, title, the menus and boot. A pause rewinds the sequencer to the first step that has not sounded. The results loop waits for the victory fanfare (10.3 s) or the game over tune to finish. `key_ok` never goes above C7. The boss drums use a combined kick and snare hit on beats 2 and 4. `sfx` accepts a private `opts.at`.

**4.9, 4.10 `TG.Gfx`, `TG.Font`.** The placeholder has an INK fill with the two letters in WHITE. `TG.Gfx.color` gives INK for an index outside 0 to 31; fractional scales are floored; text also accepts scale 3. `TG.Font.SYM.DOWN` is `_`, so game text never contains an underscore (empty initials are shown as `-`).

**4.12 `TG.Input`.** A repeated named key is dropped but still has `preventDefault`, so holding Space does not scroll. `keyup` ignores modifier keys. `bindButton` also blurs the element on focus, blocks the long-press menu and sets `tabindex="-1"`. `TG.Main` also prevents Tab, `'`, `/`, PageUp, PageDown, Home and End, and passes any other key that `TG.UI` would not act on (the keys that are not queued, and the semicolon key) and a click outside the buttons to the boot screen and the goodbye panel as Enter.

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

**10.3, 10.4 `test/sim.js`.** Extra assertions in every run: `budget`, `keep-clear`, `scoring`, `console`, `announce`, `weak-window`. Extra checks: `input-translate`, `input-buttons`, `load-isolated`, `sim-purity`, `init-event`, `no-dodge-actions`, `spawn-onscreen`, `typing-results`, `crate-queue`, `items-shape`, `continue-restore`, `boss-fight`, `boss-continue`, `result-rank`, `tutorial-slowdown`, `adaptive-pacing`. In `no-jump-bridge` the gap that is bridged is the one at tile 106, not 322, and it is bridged after one fall, which is Easy's `bridgeAfterFalls`: the run does not type either, because with typing on Easy's lives from checkpoints, score and shields carry Pip through every gap without a game over, and no gap is met a second time. The pass conditions are unchanged. The bot times its first key by the time the key will carry (`state.time + DT`) and waits for the discard window after a lost target.

**13.2 tools.** The software canvas is stricter than the browser in four ways, each of which would make a PNG differ from the browser: a coordinate or size that is not a whole number throws; `drawImage` with scaling throws while `imageSmoothingEnabled` is true; assigning a property outside the subset throws; a negative size throws. `tools/shot.js` and `tools/shot-ui.js` had more options than 13.2 listed; since Level 2, 13.2 lists them all.

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
- Tree crowns (DESIGN 5; 6.4). The branch and the arch hung from bare trunks that ran up to the HUD. A new sprite `haz_canopy` (48 x 16, FOREST and PINE, with the section's remap) covers the top of the trunk: centred on a branch, and one across the arch. With it the manifest had 93 entries (66 of owner D). `test/test-sprites-world.js`, `test/test-render.js`, `test/test-core.js`.
- Arena (14.2 above): plates stay at `y >= 37` (the lowest plate had sat 2 px under the BARON box and read as part of it), and the phase 3 sky is INK with a PLUM dither (a PLUM sky hid the far hills, which the dusk remap makes PLUM, and left their ridge line floating). `test/test-render.js`.
- Sound effect voices (DESIGN 15.1). With three voices and the oldest taken over, the sounds of one step all took over the same voice and a sound timed for later held a voice while it waited, so crate clears, extra lives, power-ups and streak steps lost their sounds (the review measured, over nine bot runs, 47 word_clear, 27 streak and 9 of 18 power_get sounds heard for less than 20 ms). Voices keep 3; a takeover now goes by priority and then by allocation order, the sounds that repeat all the time never take over a reward and are left out instead, and a sound with `opts.at` beyond the look-ahead takes its voice when `update` starts it. The power sound of a crate plays 0.48 s after its word, after `crate_break`. Measured the same way afterwards, one word_clear and no other reward sound was cut. `test/test-audio.js`.
- Balance (DESIGN 15.1). `MUSIC_LEVEL` 0.35 to 0.2: key_ok had been about 3 dB below the level music. A new check compares key_ok with the whole level and boss mix. `test/test-audio.js`.
- Section key (DESIGN 15.2; 7.3). word_clear, streak, checkpoint, one_up and ink_drop follow a major section's `keyOk.root`, so section 3 no longer plays C major arpeggios over A major music. `test/test-audio.js`.
- key_bad (7.1). A second `type:miss` within 20 ms plays nothing: the key that triggers auto-release emitted two, and the two identical sounds added up to twice the level. `test/test-audio.js`.
- Quit (7.3). QUIT from the pause menu during `jingle_ready` or `jingle_checkpoint` stops the jingle and the duck, which had finished over the results music. `test/test-audio.js`.
- Original figures (DESIGN 15.2). one_up, ink_drop and start had matched the Super Mario Bros. 1-up and coin figures note for note. one_up is C6 C6 G6 G6 C7 then a held E7; ink_drop a rising fifth (120 ms) that steps up the pentatonic in a chain of drops; start G5 then a held G6. `test/test-audio.js`.

**Copyright line and EXIT.** Two additions to the title screen that the owner asked for after release. Each is written into the sections named, with checks in the test file given.

- Copyright (4.10, 4.20, DESIGN 12, 14.7). "© 2026 DAVID SLEE" is shown on the boot screen and at the bottom of the title's menu, story and goodbye panels. The font has a copyright glyph, `TG.Font.SYM.COPY`, which is the character `©` itself. The text is one constant in `js/ui.js`. On the title it sits in the bottom INK strip, which grew from 13 px with one line to 22 px with two (the help line, then the copyright line), so the ground shows 10 px instead of 19. The high score and options panels fill the screen and do not show the line. `README.md` ends with the same line. `test/test-gfx.js`, `test/test-ui.js`.
- EXIT (4.20, 4.21, 7.2, 8.6, DESIGN 12). EXIT is the fifth item of the title menu. A page cannot close a tab that the player opened, so EXIT emits the new event `ui:exit`, `TG.Main` tries `window.close()` inside try/catch, and `TG.UI` shows a goodbye panel (`TG.UI.panel` is `'bye'`) with the title music stopped; any key, tap or click after 0.5 s goes back to the menu with START selected and the music playing. "Any key" includes the semicolon key, on the goodbye panel and on boot: `TG.Input` queues it for ducking and the menus have no action for it, so before this `TG.Main` did not pass it on and it was the one key that did nothing on those two screens. Esc on the menu does not exit. The menu box has a 13 px row pitch (it was 14) and is 144 x 76 at y 91 (it was 144 x 66 at y 96), so that five rows fit between the logo and the ground. `TG.Events.NAMES` has 63 names. `tools/shot-ui.js` takes `--panel bye`. `test/test-ui.js`, `test/test-core.js`.

**World scores.** A shared leaderboard that the owner asked for after release. The service is a Cloudflare Worker of our own (`server/`); `docs/LEADERBOARD.md` is the agreement between it and the game. The game side is written into the sections named, with checks in the test files given.

- One network module (1, 2.2 rule 10, 4.22). `js/board.js` was the 20th script (`js/levels/level2.js` has since made 21), loaded after `js/render.js` and before `js/ui.js`. It defines `TG.Board`, the only code in the game that makes network requests, and only to `TG.Board.URL`. The address is the empty string as delivered: world scores are then off, no request is made and every screen is as it was. The lead fills the address in after the service is deployed. The statement of section 1 that the game makes no network requests of any kind now reads: the page loads nothing from the network, and `TG.Board` is the one exception. `test/test-integration.js` (the static rule), `test/test-board.js`.
- The game never depends on the service (4.22). No function of `TG.Board` throws or returns a promise; results arrive in `TG.Board.state`. A request is given up after 6 s. A reply that is late, is not JSON, has the wrong shape or an error status is a failure, and after a failure the game carries on with the scores of this computer. Lists from the service are cleaned before they are kept. `test/test-board.js`.
- `TG.Main` (4.21) hands `TG.Board` the window's `fetch` and a clock in `init`, and calls `TG.Board.update` once per frame. `test/test-board.js`.
- Setting `worldScores`, default `true` (4.4, 5.12), with a WORLD SCORES line on the Options panel and the note "SENDS YOUR INITIALS AND SCORE". The line is shown only when an address is set. With the setting off no request is made. `test/test-core.js`, `test/test-ui.js`.
- `TG.UI` (4.20, DESIGN 8.9 and 12): the run token is asked for when a difficulty is confirmed; the initials screen also appears for a run that goes to the world scores (heading "WORLD SCORES"); blocked initials are refused there; the High Scores panel has four pages; after a send the title opens on the WORLD page of the run's difficulty with a status line; the idle rotation shows a WORLD page when one is known. New read-only `TG.UI.page`. `test/test-ui.js`.
- The block list of `js/board.js` is a copy of `server/src/blocklist.js`; `test/test-board.js` reads the server file and checks that the two are equal. While world scores are on, the list also applies to the table of this computer, because the same initials go to both. With world scores off it is not used.
- The two halves together: `test/test-board-server.js` passes every request of `TG.Board` to the Worker's own fetch handler (no network) while the real game is played from the menus to the initials screen, and checks the Worker's database and the WORLD page against the game's result.
- Tools (13.2): `tools/shot-ui.js` has the options `--world`, `--board`, `--entry` and `--send`, which draw the new screens and states with a stand-in service that holds sample scores (`createWorld`, also used by the tests). The stand-in makes no network request.
- Differences from the text of the brief, decided while building: (1) "COULD NOT REACH WORLD SCORES. SAVED ON THIS COMPUTER." is two lines, because one line would be 424 px wide. (2) `TG.Board.refresh()` counts its 30 s from the last request, whatever became of it; `TG.UI` forces a new request when the panel is opened after a failed load. (3) An entry from the service whose name has fewer than three letters is left out rather than padded.
- Changes after the review of the game side (4.20, 4.22, DESIGN 8.9 and 12). Each is in `test/test-ui.js`, and where the service is involved in `test/test-board.js` and `test/test-board-server.js`.
  - The initials screen can be declined. Esc goes to the title without sending (WORLD SCORES) or keeps the score on this computer only (NEW HIGH SCORE!), and the bottom strip says so. Enter and Esc are not read for the first 0.5 s, and Enter alone no longer sends a score under the placeholder PIP: with no initials used before, they have to be typed. This departs from the brief, which had Enter alone accept the pre-filled initials in every case; initials the player has used before are still taken by Enter alone.
  - A run the service is certain to refuse is not sent: a run under 10 s is not offered to the world scores, and a WPM above 220 is sent as 220.
  - A failed send has a reason, `TG.Board.state.sendError`, and the status line follows it: could not be reached, did not take this score, or too many scores from here this hour. `TG.Board.state.kept` is false for a run below the 200 rows a board keeps, which is shown as "NOT IN THE BEST 200 YET. KEEP GOING!" and not as place 201 of 201.
  - When neither the send nor the boards got through, the WORLD page says so once, with what became of the score.
  - The status line and the highlighted row stay until the next run starts, and the page that opens after a send reads no keys for 0.5 s. The bar and arrow of the highlighted row start 8 px further left, clear of a two-digit place.
  - `test/test-integration.js` also checks that `js/main.js` names its helper `networkFunction` only where it is defined and where it is handed to `TG.Board.init`, reads `win.fetch` only inside it, and that no file has an address written without a scheme.
  - Left as the brief has it: a reply that arrives after the 6 s timeout is ignored, so a score the service did store can be reported as not reached; and the player lands on the WORLD page after every send, also when the send then fails (the page says how to reach the local entry).

**Level 2.** CLOCKWORK CAVERNS, the second level, with two new kinds, the Pocket Watch, the boss Lady Ratchet, NEXT STAGE and the STAGE row, and world scores for runs of two stages. It was built against the plan `docs/LEVEL2.md`; section 13.8 of the plan is the build record by milestone. The game as built is written into the sections named below. Where the plan's text and the code differ, the lines below and those sections describe the game, and the plan was not edited.

- A level is data (1, 2.2, 5.9, 6.3 to 6.6, 7.2). `js/levels/level2.js` is the 21st script of the game and the 14th in load order. What tells Level 2 from Level 1 is read from level data, with Level 1's behaviour as the default wherever a key is missing: the backdrop, the tiles and hazard skins, the skins of kinds, the ink remap, the colours of a hazard's burst, the boss table (kind, label, speech, tips, minion skin, urgent rim) and the music with its ready jingle and its phase 3 values. Three things are code: a kind is defined in `TG.Entities.KINDS`; the parts, effects and sounds of a boss are tables keyed by boss kind in `js/render.js`, `js/effects.js` and `js/audio.js`; and the interface's texts for a level (the sample words of the STAGE row, the closing line of the results screen and the story panel) are tables keyed by level id in `js/ui.js` (4.20). The plan's Appendix B lacks three keys the level file has: `theme.inkRemap`, `theme.hazardFx.bridge` and `boss.urgentRim`. `test/sim.js` (`level-valid`, `skins`), `test/test-render.js`.
- Counts. `TG.Sprites.MANIFEST` has 144 entries, 40 of owner C and 104 of owner D: 51 more than before. `TG.Audio.SFX` has 52 names and `TG.Audio.TRACKS` 11. `TG.Events.NAMES` still has 63 names, and no payload has a new field: `music` of `level:start` may hold `ready`, `music` of `section:enter` may hold `phase3`, and the `result` of `level:clear` and `run:end` has four more fields (5.11). `stubs.FILES` has 21 files, and there are fourteen `test/test-*.js` files. `test/test-core.js`, `test/test-audio.js`.
- Words (4.6; LEVEL2 7 and Appendix A). The `clockwork` flavour has 251 words in eight lists: Easy has none in tier 1. Four of Hard's tier 3 flavour words have 11 letters (`wheelbarrow`, `screwdriver`, `chronometer` and `calibration`) and, like the five of Hard tier 3 named above, are never picked for a threat. `test/test-words.js`, `test/sim.js` (`words-by-difficulty`).
- The dangle and the flit (3, 5.4, 5.5, 5.13, 6.6, 8.3; LEVEL2 4.3 and 4.5). In the plan "12 to 17 tiles ahead" is the Dangle's anchor, and an intro Dangle's is 18 to 23. That holds for a Dangle with the base budget. The queue, spacing and keep-clear rules of 5.5 often give a longer budget, and the anchor is then further ahead by the same formula, several screens ahead in places (up to 39 / 81 / 89 tiles in the target and floor runs of the matrix), and the Dangle carries the `right` tag until its anchor is in view. The Flit's flutter is drawn by the renderer; the simulation keeps it level at `FLIT_CROSS_ELEV`. After its turn a Flit's `from` is still `above`, and the side it hits from is read from `turned`. A Dangle beyond the right edge has the `right` tag from its spawn, for which the plate layout asks "beyond the right edge" before "above the playfield"; no Level 1 typable is ever in both places. Both kinds are drawn in front of the pipe, the lantern, the tunnel and the roof rims. A crossing Flit's plate holds still, 4 px above the top of the flutter. A clear begins where the creature was drawn, and one that the clamp of 4.17 moves in from an edge of the view is played at the clamped place, upright. A skin's `fx` swaps one effect sprite, the bee's flower, and the `skins` check refuses any other. A threat word can also be cleared by the Ink blast, which LEVEL2 8.4 does not count. `test/sim.js` (`new-kinds`, `anchored-kinds`, `skins`), `test/test-render.js`.
- The Pocket Watch (3, 4.14, 4.16, 4.18, 4.19, 5.1, 6.6, 7.1, 7.3, 8.2, 11.3; LEVEL2 6.3). The world holds for 179 steps, 2.983 s, because the 3 s are counted from the step the crate is finished on, as the Hourglass's 6 s are. On a held step `TG.Level.update` does nothing, so a watch finished on the step Pip crosses the arena line runs its whole time first, and the boss intro starts when the world moves. A watch running at the rescue from a fall goes on. A word's `age` stands still under a watch, so a word typed during a freeze has the quick bonus when it had used no more than half of its window (`QUICK_U`) before the world stopped; in the bot runs of LEVEL2 13.8 every word on screen during a freeze had it, 4 to 6 a run. The frame of the watch blinks three steps on and three off. LEVEL2 6.3 says everything on screen holds its frame: the scenery, the creatures, the crates and Pip's pose hold, through the scene clock `state.sceneTime`, and what prompts or answers a key goes on (4.19). `test/sim.js` (`watch-freeze`, assertion `watch`), `test/test-render.js`, `test/test-audio.js`.
- Lady Ratchet (4.18, 5.7, 6.4, 7.1, 8.5; LEVEL2 2, 4.4 and 10). The simulation of the fight is the Baron's: the same round machine, with the level's own numbers. In the intro she checks her watch and winds her key three clicks, where the plan has her lift her goggles, which her frames cannot show. The Baronet of the cameo comes in hopping, in his `up` frame, is at the hatch 0.9 s into the intro (338 px a second, where LEVEL2 10.1 has 304) and goes down inside its opening; his `spin` frame is not used there. Her far arm stays at `rest`. The key's four frames are four steps of half a turn, and the renderer steps them 2, 4 and 8 times a second by phase and 16 times while her arm is up; in the finisher it goes one step back for each letter. The needle shows the part of the volley that was typed and is RED while a weak-point word is open. From 0.55 s of the defeat her head is the frame without goggles, where LEVEL2 10.7 has the dizzy head. A Baronet that is cleared loses `boss_helmet`. Her line on the speech plate is timed by `boss.stateT` and goes on after a pause, and a line that would not be whole before the intro ends is typed over the first half of its time. The Baron's plate, which the released game timed by `state.screenT`, has had the same clock since 2026-10-12 (14.3). `test/sim.js` (`boss-fight`, `boss-continue`, `spawn-skin`), `test/test-render.js`, `test/test-audio.js`.
- The art (6.3 to 6.5; LEVEL2 3 and Appendix C). The tin frog is SILVER with a WHITE belly and GOLD eyes, where the plan has BRONZE and GOLD: a bronze frog was lost on the brass floor of section 2. Sections 2 and 3 have rock rims under the HUD as a hint of the roof, which put INK and PLUM into the plate band; rule 1 of LEVEL2 3.1 as written does not allow them, and 6.5 names them as an exception. The Baron in his pipe has a layer of its own. The machines near the floor are drawn in outline. The Baronet is GOLD, SOIL and WHITE. The ink drops are drawn under `paleink` in every section. The positions of the cavern's items in Appendix C, and several colour lists of LEVEL2 3.3, are behind the art: `js/sprites-world.js` and 6.5 are the record. `test/test-gfx.js`, `test/test-sprites-world.js`.
- NEXT STAGE and the save (4.4, 4.16, 4.20, 5.1, 5.11, 5.12, 9; LEVEL2 12). The save keeps version 1. At NEXT STAGE `nextLifeAt` moves to the first threshold above the carried score, where the table of LEVEL2 12.2 leaves it as it is. Left there, a threshold that the end-of-stage bonuses had passed would pay a life on the first points of the next stage, and again after every continue from its first checkpoint. The line over the strip, THE SCORE IS ENTERED WHEN THE RUN ENDS, is shown only for a run that would have an entry to make if it ended there. On the results screens after NEXT STAGE the note beside WPM is measured against the WPM the run already showed at STAGE 1 CLEAR as well as against the best from before the run. In the idle rotation the cavern is behind Level 2's story panel and the High Scores panel, without Pip running in it. The example line A NEEDS NO CONTINUES of LEVEL2 12.7 is shown for a run of 93% or more with at most 2 lives lost that used RESTART FROM CHECKPOINT on the pause menu, which counts as a continue and costs no life; after a continue from game over, which follows the loss of every life, the line about lives comes first. With the STAGE row on the difficulty screen, the two lines about the words and the speed stay under it and the third line, FOR N WORDS A MINUTE with the lives, is left out: the selected panel shows both. `test/sim.js` (`campaign`, `campaign-targets`), `test/test-core.js`, `test/test-ui.js`, `test/test-integration.js`.
- World scores for two stages (4.20, 4.22; `docs/LEADERBOARD.md`). One board for each difficulty, one token and one submission for a run, whatever its stages. The highest scores accepted are 180,000 / 320,000 / 500,000, where LEVEL2 12.5 worked with 180,000 / 315,000 / 505,000, and Hard's rate stays at 1,100 points a second, where the plan expected it to rise. The daily counts are per stage: `TG.Board.stat` sends `level: 2` for Stage 2 only, a `start` is sent at NEXT STAGE, and `end` carries the stage's own time. `test/test-server.js`, `test/test-board.js`, `test/test-board-server.js`.
- The harness (10.3, 10.4). `test/sim.js` plays every level of `LEVELS` and keeps its expected values in tables keyed by level. It has the options `--level`, `--quick`, `--campaign`, `--measure` and `--help`, the `runBot` options `levelId`, `startAssist`, `campaign` and `onStage`, and the measurements on the report. The assertion `watch` is new, `event-names` refuses a payload field that section 8 does not list, and `keep-clear` holds the dangle's distance. New checks: `skins`, `anchored-kinds`, `new-kinds`, `watch-freeze`, `attack-windows`, `spawn-skin`, `level1-events`, `targets`, `campaign` and `campaign-targets`. Thirteen checks are run for each level. The bot drops its press points at NEXT STAGE. With no arguments there are 72 runs and 49 checks, where Level 1 alone had 36 and 28.
- Tools and tests (1, 13.2). `tools/shot.js` takes `--level` and exports `run`; `tools/shot-ui.js` takes `--stage`. `test/test-level1-pixels.js` and the folder `test/fixtures/` are new: the 36 reference frames, the recorded Level 1 events and the stored strings of a save from before Level 2. `TG.Effects._list()` gives each live effect as `{ type, kind, layer, x, y, delay }`, with `kind` and `delay` added, and `TG.Audio._internals` has `INTRO_CLICKS`, which `test/test-audio.js` compares with the fractions `js/render.js` steps her key at.

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

**Level 2.** Left for the owner. None of these stops the game as built from being played; LEVEL2 13.8 gives the figures under each milestone. Items 1 and 3 have been settled since and keep their numbers.

1. Settled on 2026-10-12: the owner decided to leave the weak-point rounds of a boss as they are. Letting the time on a weak-point word run out costs no life and no rank and brings another volley, so a run can go on adding points. Level 1 as released has the same. About 20 such rounds take the best two-stage run over the highest score the service accepts. The other choice was to change what a repeated round pays, which changes the game and Level 1. LEADERBOARD 5 documents what the service does with such runs.
2. To confirm as built: Lady Ratchet's intro gesture (her watch and her key, where the plan has her goggles); the line over the NEXT STAGE strip shown only for a run with an entry to make; the note beside WPM after NEXT STAGE; and the places where the art departs from the plan (14.2).
3. Settled on 2026-10-12. The released game timed the Baron's speech plate by `state.screenT`, so after a pause in his intro his line came late, was cut short or did not come back. The owner decided to give his plate the behaviour of Lady Ratchet's. The plate is now timed by `state.boss.stateT` for every boss (4.18), one line in `js/hud.js`, and a pause leaves his line where it was. In a run with no pause every frame of Level 1 is as it was: the two clocks hold the same value on every drawn frame of an intro that is not paused, measured on each difficulty in the 4 s intro and in the 1.5 s intro after a continue (LEVEL2 13.8). `test/test-render.js`, `test/test-integration.js`.
4. The plate rule of 5.13 beside a crate. In section 3 of Level 2 on Medium and Hard a crate can float beside a Flit as it enters. The Flit's plate then flips above and below it for a fraction of a second, or sits under the Flit for about 3 s with the crate's word above. It touches about one Flit in eight; the word being typed never moves. A plate that keeps its row until it is really blocked would change Level 1's frames as well.
5. In section 3 the RED border of an urgent plate has no rim: on the DEEP_TEAL floor strip it reads by hue alone. `boss.urgentRim` is keyed by boss phase, and a rim there would need a key for each section.
6. `jingle_ready2` has an A in its second bar, a half step under the B flat of the level tune (LEVEL2 11.1 prints it so). A change to B flat has been tested and waits for the owner's ear.
7. By the bots' count Hard loses more lives with the watch than without it: 212 against 179 over 180 runs. The bot types at one speed whatever is on screen, so it does not measure the relief of a pause. To look at in play, together with the length of the freeze (LEVEL2 decision 22).
8. Adaptive pacing measures a word by its window use, which stands still during a freeze, so a word that was on screen during one counts as typed faster than it was, as a word typed under the Hourglass does.
9. Copies of the game and closed tabs. Once this game has saved, a Level 1 clear made afterwards in a cached copy of the released game does not open the STAGE row until the next clear in this game; nothing stored is lost. A tab closed on the last results screen or on the initials screen of a two-stage run leaves the Stage 1 total in the table and not the run total.
10. The names Lady Ratchet and CLOCKWORK CAVERNS have not been checked against existing products (LEVEL2 decision 11).
11. Easy's window use. The owner accepted Easy a little under the band of 0.55 to 0.75 on the first measurement, which had 0.52 to 0.58 with three seeds of five under (LEVEL2 decision 1). With the Pocket Watch it measures 0.50 to 0.55, with four seeds of five under and two of them at 0.501, and the `targets` check fails an Easy run under 0.50. The lower figures have not been put to the owner, and a small change to the level or to the watch can fail the check on Easy.
12. The white flash of a correct key is on one drawn frame, where DESIGN 3.4 and the last row of 6.6 give two: `TG.Effects` sets its timer to two steps at `type:hit` and has taken one off before the first picture is drawn. Level 1 as released has the same. Either the timer is made a step longer, which changes Level 1's frames, or the two documents and the comment in `js/effects.js` say one frame.

Checks in a real browser for Level 2, none of which a test or a still picture can make: the motion of the Dangle and the Flit and of their clears, the fight, the freeze of the Pocket Watch, and the level at real size; and one press of NEXT STAGE with the world scores on, once the Worker with the limits for two stages is deployed.
