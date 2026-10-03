# SPELL RUNNER

A typing game for the browser in the style of late-1980s console games. Pip the scribe runs through a side-scrolling meadow, and every creature and object that comes at him carries a word. Typing the word clears it. Gaps are jumped, low branches are ducked, and at the end of the level the Baron is defeated by typing.

Level 1, QUILL MEADOWS, is complete: three sections, a boss with three phases, three difficulties, high scores and settings that are kept between visits, and world scores that all players share (when a scores service is set up; see below).

**Play it online: https://piechart1.github.io/spell-runner/** (needs a computer with a keyboard).

## Starting the game

To play without the internet, download the repository and open `index.html` in a browser (double-click it). Nothing needs to be installed and the game loads nothing from the network: all the art is pixel data in the scripts and all the sound is synthesised. The only requests the game can make are for the world scores described below, and without a connection it plays the same, with the high scores of this computer.

If a browser does not run pages opened from a file, serve the folder instead, for example:

```
python3 -m http.server 8417 --bind 127.0.0.1
```

and open http://127.0.0.1:8417/.

The first key or click starts the sound (browsers require this). Choose START, pick a difficulty with the arrow keys and Enter (or by typing EASY, MEDIUM or HARD), then type READY.

| Difficulty | For | Starting lives |
|---|---|---|
| Easy | 10 to 20 words a minute; short words, home row first | 5 |
| Medium | 20 to 40 words a minute; everyday words | 4 |
| Hard | 40 or more words a minute; long and unusual words | 3 |

## Controls

| Action | Keys | On screen |
|---|---|---|
| Type a word | A to Z. No Enter is needed: the last letter clears the word | |
| Jump | Space or Up arrow | JUMP button |
| Duck or slide | Enter, Down arrow or semicolon. Hold it to stay down (the arch, marked HOLD, needs it) | DUCK button |
| Let go of a locked word | Backspace. Straight after a wrong key it only takes the mistake back; press it again to let go | |
| Pause | Esc. The game also pauses when the window loses focus | |
| Menus | Arrow keys, Enter or Space to choose, Esc to go back | JUMP chooses, DUCK moves down |

The first letter of a word locks on to that creature; the rest of the keys go to it until it is cleared. Typing mistakes never cost a life and never need deleting: a wrong key is not added to the word. A word that is not typed in time reaches Pip whatever he is doing, so typing is the only way past a creature; jumping and ducking are for gaps, brambles, branches, beehives and the Baron's shockwave and pickaxe. A wooden signpost marks where to press jump or duck.

A physical keyboard is needed. On a phone or tablet the JUMP and DUCK buttons work the menus, but there is no on-screen keyboard, and the game says so.

Options on the title screen: music, sound effects, a CRT effect, reduce flash, the on-screen key guide and adaptive pace (the game slows down a little if words keep reaching Pip). The first four can also be changed in the pause menu. The Easy word lists assume a QWERTY keyboard. With a non-Latin layout switched on (for example Russian or Greek), each letter key types the letter it has on a QWERTY keyboard.

EXIT on the title screen stops the music and shows a goodbye screen. A web page cannot close a browser tab that the player opened, so the tab is closed by hand; any key goes back to the menu.

## World scores

The game keeps the five best scores per difficulty in the browser, on your own computer. It can also show and add to a board per difficulty that all players share.

For players:

- HIGH SCORES on the title screen has four pages, changed with the Left and Right arrows: WORLD EASY, WORLD MEDIUM, WORLD HARD (the ten best of each) and THIS COMPUTER.
- After a run with a score (and at least 10 seconds long), the game asks for three initials. Enter alone takes the ones you used last; the first time, you type them. Your run then goes to the world board of its difficulty, and the game shows your place, for example YOUR PLACE: 12 OF 87. A board keeps its 200 best runs.
- If you do not want a run sent, press Esc on the initials screen (ESC: DO NOT SEND). A score that reaches the top five of this computer is then saved here only.
- What is sent: your three initials, the score, WPM, accuracy, rank, whether the level was cleared and how long the run took. Nothing else is sent: there is no account, and nothing you type during play leaves your computer. `docs/DESIGN.md` section 8.9 has the details.
- To switch it off, set WORLD SCORES to OFF under OPTIONS on the title screen. The game then makes no network request at all, and HIGH SCORES shows this computer's tables only.
- Rude initials are refused (TRY OTHER INITIALS).
- If the scores service cannot be reached, or does not take a score, the game says so and carries on. A score that reaches the top five of this computer is always saved there.
- The WPM on a world board is at most 220. The game measures the speed inside words, and a higher figure is sent as 220.
- Scores are taken from the game's web address. A copy opened from a file on your disk shows the world boards but does not add to them.

For someone hosting their own copy:

- The boards live in a small service of your own, a Cloudflare Worker with a D1 database. Its code is under `server/`, and `server/README.md` says how to deploy it. `docs/LEADERBOARD.md` describes what it stores and how it checks a score.
- The service takes scores only from the addresses in `ORIGINS` in `server/src/worker.js` (and from a local web server, for development). Put the address your copy of the game is served from there.
- The game finds the service through one value, `TG.Board.URL` in `js/board.js`. Set it to the Worker's address without a slash at the end, for example `URL: 'https://spell-runner-scores.<your-subdomain>.workers.dev'`. `js/board.js` is the only file of the game that makes network requests, and it makes them only to that address.
- While `TG.Board.URL` is the empty string, world scores are off: no request is made, the WORLD SCORES line is not in the Options, and the game is the same as it was without them. This is how the code is delivered.
- `node test/test-integration.js` checks that the address is the only remote address in the game and that it is an `https` address ending in `.workers.dev`. If your Worker has a domain of its own, change that check to match.
- The list of refused initials is in two places that must stay equal, `server/src/blocklist.js` and `js/board.js`; `node test/test-board.js` checks that.

## Running the tests

The tests are plain Node scripts with no packages to install; they were run with Node 26. Run them from the project root.

```
node test/run-all.js            # every test file and the bot harness, about 90 s
node test/run-all.js --quick    # the same with shorter render and integration runs
node test/run-all.js ui sim     # only the files whose names contain these words
```

Each file can also be run on its own, for example `node test/test-core.js` or `node test/sim.js`. A test prints one line per check (`ok`, `FAIL` or `skip`) and exits with 0 when every check passed.

| File | What it tests |
|---|---|
| `test/test-core.js` | Constants, events, random numbers, saving, difficulty settings, and that they match the documents |
| `test/test-words.js`, `test/test-typing.js` | Word lists and the word picker; the typing engine and its statistics |
| `test/test-audio.js` | Sound effects, music and how they follow the game's events |
| `test/test-gfx.js`, `test/test-sprites-world.js` | Drawing, the font and every sprite |
| `test/test-render.js` | The playfield, word plates, effects and HUD |
| `test/test-ui.js` | The menus, the page layout and the main loop |
| `test/test-tools.js` | The headless drawing tools |
| `test/test-integration.js` | The whole game driven by key events and bots, with drawing and sound on: menus, pause, focus, game over and continue at every checkpoint, new runs, high scores, settings after a reload, blocked storage. Also that only `js/board.js` can make network requests |
| `test/test-board.js` | The world scores module, `js/board.js`, with a stand-in for the network and a clock the test controls: off without an address, tokens, sending, timeouts, replies that are late or wrong |
| `test/test-server.js` | The world scores service under `server/`, with an in-memory database |
| `test/test-board-server.js` | The game and the service together, without a network: runs played from the menus arrive in the service's database and on the WORLD page |
| `test/sim.js` | The headless harness: bots play the whole level at four typing speeds on each difficulty (36 runs), with fairness checks in every run |

Some useful commands while working on the game:

```
node test/sim.js --difficulty easy --wpm 12 --accuracy 0.9 --react 1.2    # one bot run at a chosen speed
node tools/shot.js --out shot.png --difficulty hard --at 120               # a screenshot of a bot run at 120 s
node tools/shot-ui.js --screen all --out shots                              # every interface screen as a PNG
node tools/shot-ui.js --screen title --panel scores --world ready --out world.png   # a world scores page, with sample scores
node tools/sheet.js --out sprites.png --scale 4 --filter en_                # a sheet of sprites
```

## How the code is arranged

Everything is in 20 classic scripts under `js/`, loaded in order by `index.html`, which attach to one global object, `TG`. The simulation (`core.js`, `words.js`, `typing.js`, `input.js`, `entities.js`, `level.js`, `boss.js`, `levels/level1.js`, `game.js`) runs on a fixed step, takes its randomness from a seeded generator and never touches the page, so the bots in `test/sim.js` run the same game as the browser. The presentation (`audio.js`, `gfx.js`, `font.js`, the two sprite files, `effects.js`, `hud.js`, `render.js`, `ui.js`, `main.js`) listens to the simulation's events and draws the state. `board.js` is the world scores module, the one file that talks to the network; the service it talks to is under `server/` and is not part of the page.

`docs/DESIGN.md` describes the game and `docs/CONTRACT.md` describes the code: every module, data shape, event and test. `docs/LEADERBOARD.md` is the agreement between the game and the world scores service. Section 14 of the contract records how the delivered code differs from the text and the decisions still open.

## Adding a level

A level is a data file. What it can set is described in `docs/CONTRACT.md` section 5.9 (the data shape and the rules V1 to V11) and `docs/DESIGN.md` section 17.

1. Copy `js/levels/level1.js` to `js/levels/level2.js` and change it to register `TG.Levels[2]` with `id: 2` and a new name.
2. Lay out the level: `sections` and the boss `arena` (each with a name, a palette and its music settings), `checkpoints`, `gaps`, `hazards`, `spawns` (the creatures and crates, by trigger tile and lowest difficulty), `ink` drops, `decor` and the `boss` speech. Positions are in 16 px tiles.
3. Make it harder than the level before with the `tune` block, which overrides values of the difficulty settings for this level, for example `tune: { all: { lenShift: [1, 2, 3] }, hard: { react: 0.6 } }`. Only the keys listed in `TG.Difficulty.TUNABLE` are allowed.
4. Give it a theme. `theme.backdrop` names an entry of `TG.Backdrops` and `theme.tiles` and `theme.hazardSkins` name sprites (both in `js/sprites-world.js`). `theme.music` names the level and boss tracks, which must be in `TG.Audio.TRACKS` (`js/audio.js`). `theme.wordFlavour` adds that flavour's words from `TG.Words.POOLS[difficulty].flavour` (`js/words.js`) to the word tiers.
5. Check it. `TG.Level.validate(TG.Levels[2])` must return an empty list, and the bots must finish it:

   ```
   node -e "
   const stubs = require('./test/stubs'); const { runBot } = require('./test/sim');
   const files = stubs.FILES.slice(0, 13).concat(['js/levels/level2.js']).concat(stubs.FILES.slice(13));
   const TG = stubs.load({ files }).TG;
   console.log(TG.Level.validate(TG.Levels[2]));
   console.log(runBot({ difficulty: 'medium', levelId: 2, files }));
   "
   ```

6. Load it in the page: add `<script src="js/levels/level2.js"></script>` to `index.html` after `level1.js`, add the path to `FILES` in `test/stubs.js` at the same place, and add a row to the file table of `docs/CONTRACT.md` section 1 (the tests check that these three lists agree).
7. Let players reach it. The menus start Level 1 (`TG.UI` calls `TG.Game.newRun` without a `levelId`), and there is no step from one level to the next yet. A level choice, or moving on after the results screen, is a change to `js/ui.js`; `TG.Game.newRun({ difficulty, levelId: 2 })` already starts any registered level.

A level that brings a new creature or a new boss also needs code: the kind in `TG.Entities.KINDS` and its movement in `js/entities.js`, its sprites, and its drawing in `js/render.js`.

© 2026 David Slee
