# SPELL RUNNER

A typing game for the browser in the style of late-1980s console games. Pip the scribe runs through a side-scrolling meadow and then a cavern, and every creature and object that comes at him carries a word. Typing the word clears it. Gaps are jumped, low branches and pipes are ducked, and at the end of each level a boss is defeated by typing.

The game has two levels, each with three sections and a boss with three phases, on three difficulties:

- Level 1, QUILL MEADOWS, ends with Baron von Burrow.
- Level 2, CLOCKWORK CAVERNS, has two new creatures (Dangle, a spider that drops on a thread and hangs in Pip's way, and Flit, a bat that crosses overhead and dives from behind), a new power-up (the Pocket Watch, which stops the world for 3 seconds while the typing goes on) and a new boss, Lady Ratchet.

When Level 1 is cleared, NEXT STAGE on the results screen takes the same run on into Level 2, with its score. Once Level 1 has been cleared on a computer, a run can also start at Level 2. High scores and settings are kept between visits, and world scores are shared by all players (when a scores service is set up; see below).

**Play it online: https://piechart1.github.io/spell-runner/** (needs a computer with a keyboard). It is also on itch.io: https://piechart1.itch.io/spell-runner. Both copies share the same world scores, and both have the two levels. A copy of this code served from a local web server for development should be played with WORLD SCORES set to OFF (under OPTIONS), because the service takes scores from a local web server too.

## Starting the game

To play without the internet, download the repository and open `index.html` in a browser (double-click it). Nothing needs to be installed and the game loads nothing from the network: all the art is pixel data in the scripts and all the sound is synthesised. The only requests the game can make are for the world scores described below, and without a connection it plays the same, with the high scores of this computer.

If a browser does not run pages opened from a file, serve the folder instead, for example:

```
python3 -m http.server 8417 --bind 127.0.0.1
```

and open http://127.0.0.1:8417/.

The first key or click starts the sound (browsers require this). Choose START, pick a difficulty with the arrow keys and Enter (or by typing EASY, MEDIUM or HARD), then type READY. Once Level 1 has been cleared on this computer, on any difficulty, the difficulty screen also has a STAGE row: the Up and Down arrows choose the level the run starts at, and the choice is remembered.

| Difficulty | For | Starting lives |
|---|---|---|
| Easy | 10 to 20 words a minute; short words, home row first | 5 |
| Medium | 20 to 40 words a minute; everyday words | 4 |
| Hard | 40 or more words a minute; long and unusual words | 3 |

Each level starts with these lives, also when Level 2 is reached through NEXT STAGE: the score is carried on, the lives are not.

## Controls

| Action | Keys | On screen |
|---|---|---|
| Type a word | A to Z. No Enter is needed: the last letter clears the word | |
| Jump | Space or Up arrow | JUMP button |
| Duck or slide | Enter, Down arrow or semicolon. Hold it to stay down (the arch of Level 1 and the tunnel of Level 2, marked HOLD, need it) | DUCK button |
| Let go of a locked word | Backspace. Straight after a wrong key it only takes the mistake back; press it again to let go | |
| Pause | Esc. The game also pauses when the window loses focus | |
| Menus | Arrow keys, Enter or Space to choose, Esc to go back | JUMP chooses, DUCK moves down |

The first letter of a word locks on to that creature; the rest of the keys go to it until it is cleared. Typing mistakes never cost a life and never need deleting: a wrong key is not added to the word. A word that is not typed in time reaches Pip whatever he is doing, so typing is the only way past a creature; jumping and ducking are for gaps, brambles, branches, beehives and the Baron's shockwave and pickaxe, and in Level 2 for gaps, crystal spikes, pipes, lanterns and Lady Ratchet's rolling gear and pendulum. A wooden signpost marks where to press jump or duck.

A physical keyboard is needed. On a phone or tablet the JUMP and DUCK buttons work the menus, but there is no on-screen keyboard, and the game says so.

Options on the title screen: music, sound effects, a CRT effect, reduce flash, the on-screen key guide and adaptive pace (the game slows down a little if words keep reaching Pip). The first four can also be changed in the pause menu. The Easy word lists assume a QWERTY keyboard. With a non-Latin layout switched on (for example Russian or Greek), each letter key types the letter it has on a QWERTY keyboard.

EXIT on the title screen stops the music and shows a goodbye screen. A web page cannot close a browser tab that the player opened, so the tab is closed by hand; any key goes back to the menu.

## World scores

The game keeps the five best scores per difficulty in the browser, on your own computer. It can also show and add to a board per difficulty that all players share. A run can cover both levels and is still one entry: there is one table and one board per difficulty, whichever levels a run played.

For players:

- HIGH SCORES on the title screen has four pages, changed with the Left and Right arrows: WORLD EASY, WORLD MEDIUM, WORLD HARD (the ten best of each) and THIS COMPUTER.
- After a run with a score (and at least 10 seconds long), the game asks for three initials. Enter alone takes the ones you used last; the first time, you type them. Your run then goes to the world board of its difficulty, and the game shows your place, for example YOUR PLACE: 12 OF 87. A board keeps its 200 best runs.
- A run that goes on into Level 2 through NEXT STAGE is entered once, when it ends: the initials screen comes after its last results screen, and the entry has the run's total score, with the WPM, accuracy and rank of the whole run. A run started at Level 2 from the STAGE row is entered in the same way, on the same board.
- If you do not want a run sent, press Esc on the initials screen (ESC: DO NOT SEND). A score that reaches the top five of this computer is then saved here only.
- What is sent: your three initials, the score, WPM, accuracy, rank, whether the run cleared a level and how long the run took. Nothing else is sent: there is no account, and nothing you type during play leaves your computer. `docs/DESIGN.md` section 8.9 has the details.
- The game also tells the service when a run starts and ends each level, so that the owner can see daily totals of games played, level by level. Only totals are kept, nothing about you or your run. Switching world scores off stops this too.
- The page also loads Cloudflare Web Analytics, which counts visits and which sites they came from. It sets no cookies and does not follow individual visitors. It is the one outside script on the page, and it loads whatever the world scores setting is. A copy of the game you host yourself should remove that tag from `index.html` or use its own token.
- To switch it off, set WORLD SCORES to OFF under OPTIONS on the title screen. The game then makes no network request at all, and HIGH SCORES shows this computer's tables only.
- Rude initials are refused (TRY OTHER INITIALS).
- If the scores service cannot be reached, or does not take a score, the game says so and carries on. A score that reaches the top five of this computer is always saved there.
- The WPM on a world board is at most 220. The game measures the speed inside words, and a higher figure is sent as 220.
- Scores are taken from the game's web address. A copy opened from a file on your disk shows the world boards but does not add to them.

For someone hosting their own copy:

- The boards live in a small service of your own, a Cloudflare Worker with a D1 database. Its code is under `server/`, and `server/README.md` says how to deploy it. `docs/LEADERBOARD.md` describes what it stores and how it checks a score.
- The service takes scores only from the addresses in `ORIGINS` in `server/src/worker.js` (and from a local web server, for development). Put the address your copy of the game is served from there.
- The game finds the service through one value, `TG.Board.URL` in `js/board.js`. Set it to the Worker's address without a slash at the end, for example `URL: 'https://spell-runner-scores.<your-subdomain>.workers.dev'`. `js/board.js` is the only file of the game that makes network requests, and it makes them only to that address.
- While `TG.Board.URL` is the empty string, world scores are off: no request is made, the WORLD SCORES line is not in the Options, and the game is the same as it was without them. In this repository the value is the address of the service that the two online copies use.
- When a change touches both the game and the service, deploy the Worker first and publish the game after it. Level 2 is such a change. Its Worker has higher score limits, for the total of a run through both levels, and counts the games of each level on their own; it answers a copy of the game from before Level 2 as before. A Worker from before Level 2 refuses a total above its old limits and counts Level 2's games as Level 1's. `docs/LEADERBOARD.md` section 9 has the order and the reasons.
- `node test/test-integration.js` checks that the address is the only remote address in the game and that it is an `https` address ending in `.workers.dev`. If your Worker has a domain of its own, change that check to match.
- The list of refused initials is in two places that must stay equal, `server/src/blocklist.js` and `js/board.js`; `node test/test-board.js` checks that.

## Running the tests

The tests are plain Node scripts with no packages to install; they were run with Node 26. Run them from the project root.

```
node test/run-all.js            # every test file and the bot harness, 3 to 4 minutes
node test/run-all.js --quick    # the same with the long runs left out or shortened and the harness's 36 runs on Level 1 only, about 40 s
node test/run-all.js ui sim     # only the files whose names contain these words
```

Several files run at once; `--serial` runs one at a time, and `--verbose` prints the whole output of every file. Each file can also be run on its own, for example `node test/test-core.js` or `node test/sim.js`. A test prints one line per check (`ok`, `FAIL` or `skip`) and exits with 0 when every check passed.

| File | What it tests |
|---|---|
| `test/test-core.js` | Constants, events, random numbers, saving, difficulty settings, and that they match the documents |
| `test/test-words.js`, `test/test-typing.js` | Word lists and the word picker; the typing engine and its statistics |
| `test/test-audio.js` | Sound effects, music and how they follow the game's events |
| `test/test-gfx.js`, `test/test-sprites-world.js` | Drawing, the font and every sprite |
| `test/test-render.js` | The playfield, word plates, effects and HUD |
| `test/test-level1-pixels.js` | That Level 1 is drawn as it was before the engine was changed for Level 2: 36 frames of three seeded bot runs, compared pixel for pixel with the pictures in `test/fixtures/level1-pixels/` |
| `test/test-ui.js` | The menus, the page layout and the main loop |
| `test/test-tools.js` | The headless drawing tools |
| `test/test-integration.js` | The whole game driven by key events and bots, with drawing and sound on: menus, pause, focus, game over and continue at every checkpoint, new runs, high scores, settings after a reload, blocked storage, Level 2 from the STAGE row and through NEXT STAGE, and a record saved before Level 2. Also that only `js/board.js` can make network requests |
| `test/test-board.js` | The world scores module, `js/board.js`, with a stand-in for the network and a clock the test controls: off without an address, tokens, sending, timeouts, replies that are late or wrong |
| `test/test-server.js` | The world scores service under `server/`, with an in-memory database, and its limits against bot runs of Level 1, of Level 2 and of both |
| `test/test-board-server.js` | The game and the service together, without a network: runs played from the menus arrive in the service's database and on the WORLD page, and a run through both levels arrives once, with its total |
| `test/sim.js` | The headless harness: bots play each level at four typing speeds on each difficulty (36 runs a level), with fairness checks in every run, and its extra checks include runs through both levels |

`test/fixtures/` holds what some of these compare with: the Level 1 pictures, the events of one Level 1 run as they were before the engine was changed for Level 2 (`level1-events.json`, replayed by `test/sim.js`), and two saved records written by the game as released before Level 2 (`save-before-level2.json`), which the tests load to check that nothing saved is lost.

Some useful commands while working on the game:

```
node test/sim.js --difficulty easy --wpm 12 --accuracy 0.9 --react 1.2    # one bot run at a chosen speed
node test/sim.js --level 2                                                 # the runs and checks of one level
node test/sim.js --campaign                                                # the runs played through NEXT STAGE, both levels in one run
node tools/shot.js --out shot.png --difficulty hard --at 120               # a screenshot of a bot run at 120 s
node tools/shot.js --out shot.png --level 2 --difficulty hard --at 120     # the same in Level 2
node tools/shot-ui.js --screen all --out shots                              # every interface screen as a PNG
node tools/shot-ui.js --screen difficultySelect --stage 2 --out stage.png   # a screen as it is once Level 2 is unlocked
node tools/shot-ui.js --screen title --panel scores --world ready --out world.png   # a world scores page, with sample scores
node tools/sheet.js --out sprites.png --scale 4 --filter en_                # a sheet of sprites
```

## How the code is arranged

Everything is in 21 classic scripts under `js/`, loaded in order by `index.html`, which attach to one global object, `TG`. The simulation (`core.js`, `words.js`, `typing.js`, `input.js`, `entities.js`, `level.js`, `boss.js`, `levels/level1.js`, `levels/level2.js`, `game.js`) runs on a fixed step, takes its randomness from a seeded generator and never touches the page, so the bots in `test/sim.js` run the same game as the browser. The presentation (`audio.js`, `gfx.js`, `font.js`, the two sprite files, `effects.js`, `hud.js`, `render.js`, `ui.js`, `main.js`) listens to the simulation's events and draws the state. `board.js` is the world scores module, the one file that talks to the network; the service it talks to is under `server/` and is not part of the page.

`docs/DESIGN.md` describes the game and `docs/CONTRACT.md` describes the code: every module, data shape, event and test. `docs/LEADERBOARD.md` is the agreement between the game and the world scores service. `docs/LEVEL2.md` is the plan Level 2 was built from, with a record of the build in its section 13.8; comments in the code that say LEVEL2 refer to it. Section 14 of the contract records how the delivered code differs from the text and the decisions still open.

## Adding a level

A level is a data file. What it can set is described in `docs/CONTRACT.md` section 5.9 (the data shape and the rules V1 to V11) and `docs/DESIGN.md` section 17. Level 2 was added by the steps below, which are written here for a third level.

1. Copy `js/levels/level2.js` to `js/levels/level3.js` and change it to register `TG.Levels[3]` with `id: 3` and a new name. Level 2's file is the fuller example: it names the optional keys of the theme and the boss, which Level 1's file leaves out. A key that is left out gives Level 1's sprites, sounds and texts.
2. Lay out the level: `sections` and the boss `arena` (each with a name, a palette and its music settings), `checkpoints`, `gaps`, `hazards`, `spawns` (the creatures and crates, by trigger tile and lowest difficulty), `ink` drops, `decor` and the `boss` entry (its kind, the label of its health bar, its speech and its tips). Positions are in 16 px tiles. Only Level 1 has the tutorial. A later level has `tutorial: false` and can tag a spawn `intro: true`, which gives its word more time, as Level 2 does for its first two threats and for the first Dangle and the first Flit.
3. Make it harder than the level before with the `tune` block, which overrides values of the difficulty settings for this level, for example `tune: { all: { lenShift: [1, 2, 3] }, hard: { react: 0.6 } }`. Only the keys listed in `TG.Difficulty.TUNABLE` are allowed.
4. Give it a theme. `theme.backdrop` names an entry of `TG.Backdrops`, and each section names one of that backdrop's palettes; `theme.tiles` and `theme.hazardSkins` name sprites (all in `js/sprites-world.js`). `theme.skins` gives a creature or a boss attack another sprite or a remap. `theme.music` names the level and boss tracks and the ready jingle, which must be in `TG.Audio.TRACKS` (`js/audio.js`). `theme.wordFlavour` adds that flavour's words from `TG.Words.POOLS[difficulty].flavour` (`js/words.js`) to the word tiers. A new sprite needs its definition, a row in the manifest in `js/core.js` and the same row in `docs/CONTRACT.md` section 6.4.
5. Check it. `TG.Level.validate(TG.Levels[3])` must return an empty list, and the bots must finish it, started at the level and reached through NEXT STAGE from Level 1:

   ```
   node -e "
   const stubs = require('./test/stubs'); const { runBot } = require('./test/sim');
   const files = stubs.FILES.slice(0, 14).concat(['js/levels/level3.js']).concat(stubs.FILES.slice(14));
   const TG = stubs.load({ files }).TG;
   console.log(TG.Level.validate(TG.Levels[3]));
   console.log(runBot({ difficulty: 'medium', levelId: 3, files }));
   console.log(runBot({ difficulty: 'medium', campaign: true, files }));
   "
   ```

6. Load it in the page: add `<script src="js/levels/level3.js"></script>` to `index.html` after `level2.js`, add the path to `FILES` in `test/stubs.js` at the same place, and add a row to the file table and a tag to the block of script tags of `docs/CONTRACT.md` section 1 (the tests check that these four lists agree). The number of scripts, 21, becomes 22 wherever it is written: in `test/test-core.js` (which also pins the places of the level files, `js/board.js` and `js/main.js` in the list, and has a check with 20 names that do not exist, one fewer than the count), in the names of checks in `test/test-ui.js` and `test/test-integration.js`, in the comments at the top of `test/stubs.js` and `test/test-integration.js`, in this file and in the contract.
7. Add it to the harness. In `test/sim.js`, put its id in `LEVELS`, its file in `SIM_FILES` and `WPE_FILES`, and a row for it in each table keyed by level below `LEVELS` (the expected counts of threats, kinds, crates and ink drops, the word flavour, the boss and the others). `node test/sim.js` then plays its 36 runs and its checks with those of the other levels. Its `campaign` check is written for a run of two stages and has to be extended: it expects every results screen a run goes on from to have carried no score in, and the run to end with two stages cleared.
8. Let players reach it. NEXT STAGE needs no change: the results screen offers it after any cleared level that has a registered level after it, and `TG.Game.nextStage` takes the run there. The STAGE row needs `LAST_LEVEL` in `js/core.js` raised to 3: the save keeps the highest level cleared on each difficulty up to that number, and a level is open once the one before it has been cleared on any difficulty. In `js/ui.js`, give the level its entries in `STORY` (the story panel of the title), `STAGE_SAMPLES` (the sample words on the STAGE row) and `HOOK` (the line under STAGE CLEAR that leads on), and look at the `STAGE 1 SCORE` row of the results screen, which is written for a run of two levels.
9. Extend the world scores, in the game and in the service together. A run is one row with its total, so the score limits (`LIMITS` in `server/src/worker.js`) are measured again on runs through every level, as `docs/LEADERBOARD.md` section 5 describes; `test/test-server.js` plays the game against them. The daily counter knows two levels: `TG.Board.stat` in `js/board.js` sends `level` only when it is 2, so a third level would be counted as Level 1; the Worker refuses a `level` that is not 1 or 2; and it counts Level 2 under labels of its own (`easy-s2`, `medium-s2`, `hard-s2`). The game module, the Worker's rule and the labels are extended together, with section 10 of that document and the comments on the `stats` table in `server/schema.sql`. The Worker is deployed before the game.
10. Bring the tests that are written for two levels up to three. With the steps above done they fail where they expect Level 2 to be the last level: the two `TG.Save` checks of `test/test-core.js` that hold `lastLevel` and the `cleared` settings to 2, the results-screen cases of `test/test-ui.js` (its section I) and the NEXT STAGE chain of `test/test-integration.js`, which look for Level 2's closing line where STAGE 3 UNLOCKED then stands, and the runs through both stages in `test/test-server.js`.

A level that brings a new creature, a new power-up or a new boss also needs code, as Level 2 did. A creature: the kind in `TG.Entities.KINDS` and its movement in `js/entities.js`, the kind in `FALLBACK_SPAWN_KINDS` in `js/level.js`, its word lengths in the three difficulty entries of `js/core.js`, its sprites, its drawing in `js/render.js` and its clear animation in `js/effects.js`. A power-up: its name in `POWERS` in `js/level.js`, its effect in `applyPower` in `js/game.js`, its place in the HUD's power slot, its sounds and its row on the How To Play screen. A boss fights by the rounds of `js/boss.js`, which are the same for every boss and are tuned by the `boss` values of the `tune` block; a new one needs its look in `BOSS_PARTS` (`js/render.js`) and `BOSS_FX` (`js/effects.js`) and its sounds in `BOSS_VARIANTS` (`js/audio.js`), each chosen by the level's `boss.kind`. Where the engine has to read something new from a level's data, keep Level 1's behaviour as the default: `test/test-level1-pixels.js` and the `level1-events` check of `test/sim.js` then show that Level 1 has not changed.

© 2026 David Slee
