# Spell Runner promo shorts

Five vertical videos (1080 x 1920, 30 frames a second) made with [Remotion](https://www.remotion.dev). All of them show Level 1, the live game.

| Composition | Made for | What it is | Length |
|---|---|---|---|
| `TypeFastEnough` | anyone | "Can you type fast enough?": a tour of the game | 17 s |
| `LearningToType` | people learning to type | "Learning to type?": the three difficulties and the world scores | 18 s |
| `OneLetterLeft` | people who play platformers | Opens one letter short of defeating the Baron, rewinds through the fight, then types the letter | 25 s |
| `WhichRunGetsS` | the typing community | A 120 WPM run and a 40 WPM run side by side: which one gets rank S? | 24 s |
| `BeforeItLands` | both | Spell along against the game's own timers, then one word that nobody types | 18 s |

`OneLetterLeft` shows the end of the boss fight, and `WhichRunGetsS` shows the Baron's defeat too, so they are better not posted one after the other.

## Preview and render

```bash
npm install
npm run dev
npx remotion render OneLetterLeft out/spell-runner-short-3-one-letter-left.mp4 --image-format=png
npx remotion render WhichRunGetsS out/spell-runner-short-4-which-run-gets-s.mp4 --image-format=png
npx remotion render BeforeItLands out/spell-runner-short-5-before-it-lands.mp4 --image-format=png
npx remotion render TypeFastEnough out/spell-runner-short-1.mp4
npx remotion render LearningToType out/spell-runner-short-2.mp4
```

`--image-format=png` keeps the pixel edges clean before the video is encoded; without it the project's setting (JPEG frames) is used, which is faster. Each of the three takes a minute or two.

Remotion is free for individuals and teams of up to three; see its licence for larger companies.

## Where the code is

- `src/Short1.tsx`, `src/Short2.tsx`, `src/Stage.tsx`, `src/Text.tsx`: the first two shorts.
- `src/shorts/<Composition>/`: one folder for each of the three newer shorts. `index.tsx` is the video, `Compositions.tsx` registers it and its scenes, and the other files are its scenes and parts.
- `src/kit/`: what the newer shorts share. `clip.ts` reads a captured clip; `PixelFrame.tsx` draws a game frame with hard pixel edges at any crop and size; `Keyboard.tsx`, `BigWord.tsx`, `Tiles.tsx`, `TimerBar.tsx`, `Type.tsx`, `Brand.tsx` and `Backdrop.tsx` are the on-screen parts. `KitTest.tsx` shows each of them.
- `src/theme.ts`: the game's palette and pixel font.

## The footage and sound are not in the repository

`public/clips`, `public/frames`, `public/audio`, `public/events`, `public/ui` and `out/` are ignored by git, because they are generated from the game and are large. The videos cannot be rendered until they exist. Everything in them is the live game's own output: the pictures are drawn by the game's code from runs played by its test bot (`test/sim.js`) at a set typing speed, and the sound is made by the game's `js/audio.js`.

### The three newer shorts

From this folder:

```bash
node tools/capture.js --all
node tools/render-audio.mjs sfx:all
node tools/render-audio.mjs music:boss1:40:boss1_long music:level1:40:level1_long music:title:40:title_long music:victory:11 music:results:24
node tools/render-audio.mjs one:stamp one:tally_tick one:key_ok one:key_bad one:ui_select one:ui_move one:ui_back one:word_clear one:lock_on one:warn one:urgent_tick one:hurt one:start one:boss_laugh one:slow_on one:slow_off one:streak one:checkpoint:2.5 one:boss_defeat:4 one:count_tick
```

They also use `public/ui/title.png` (below).

`clips.json` lists the runs and the clips cut from them:

| Run | Bot | Clips | Used by |
|---|---|---|---|
| `boss60` | Hard, 60 WPM, 99% accuracy, seed 5 | `boss_fight` | `OneLetterLeft` |
| `fast120` | Hard, seed 1, adaptive pace off; the results screen reads 120 WPM, 95%, rank A, 80,590 | `fast_run`, `fast_results` | `WhichRunGetsS` |
| `slow40` | Hard, seed 1, adaptive pace off; the results screen reads 40 WPM, 99%, rank S, 111,650 | `slow_run`, `slow_results` | `WhichRunGetsS`, `BeforeItLands` |
| `untyped` | Hard, seed 1, nobody types | `untyped` | `BeforeItLands` |

The bot's `wpm` setting is a little higher than the figure the game reports (137 for a reported 120, 40.6 for a reported 40), because the game's WPM counts the time between words too. The videos show the game's figures. In `WhichRunGetsS` the two speeds and the two accuracy settings on screen are written in `src/shorts/WhichRunGetsS/layout.ts`, not read from the clips. The simulation is seeded, so the same settings give the same run each time; if the game changes, the runs change, and the numbers on screen have to be checked again against `public/clips/<clip>/data.json`.

The tools:

- `tools/capture.js` plays a run and writes each clip to `public/clips/<clip>/`: the frames at 384 x 216, `events.json` (every game event with its frame) and `data.json` (the game's state on every frame, which is what keeps the letter tiles, timers and counters in the videos in step with the picture). `--probe <run>` prints the times of a run's main events without capturing. A clip's `keep` ranges limit the pictures written to the frames the videos use: about 4,400 files in place of 20,000, which Remotion Studio could not cope with.
- `tools/render-audio.mjs` renders sound with the game's own audio code in the headless Chrome that Remotion installs: `sfx:<clip>` the effects of a clip in step with its frames, `music:<track>:<seconds>` a music track, `one:<sound>` a single effect. Sounds that the game makes from its state and not from an event (the tick when a word is about to land) are not in a clip's effects.
- `tools/clip-index.js <clip>` prints a clip's timeline, to find the frame to cut on. `--words` lists each creature word with the seconds it was allowed and the seconds to spare.
- `tools/sheet.js <Composition> --out <file.png>` writes contact sheets of a video: every 15th frame with its number, for checking a cut without rendering.
- `tools/audio-levels.js <file.wav>` prints loudness over time. `npx remotion render <Composition> out/x.wav --codec=wav` gives a video's sound on its own.
- `tools/used-frames.js <Composition> ... --write` finds which clip frames the videos ask for and writes them to `clips.json` as `keep` ranges. Run it after changing which stretches a video shows, then capture again. To look for new moments in a whole run, remove a clip's `keep` first.

### The first two shorts

**Frames and event logs.** Run from the project root. Each command plays the game with the test bot and writes frames at 384 x 216 (enlarged three times) plus a log of the game events on each frame:

```bash
F=promo/public/frames; E=promo/public/events; mkdir -p $F/m1 $F/m3 $F/boss $F/easy $F/hard $E
node tools/shot.js --out $F/m1/f.png --events $E/m1.json --difficulty medium --wpm 55 --accuracy 0.97 --react 0.35 --seed 2 --when "s.section===1 && TG.Entities.typables(s).length>=2" --frames 240 --every 2 --scale 3
node tools/shot.js --out $F/m3/f.png --events $E/m3.json --difficulty medium --wpm 45 --accuracy 0.96 --react 0.4 --seed 3 --when "s.section===2 && TG.Entities.typables(s).length>=3" --frames 200 --every 2 --scale 3
node tools/shot.js --out $F/boss/f.png --events $E/boss.json --difficulty medium --profile target --seed 2 --when "s.screen==='boss' && TG.Entities.typables(s).length>=2" --frames 240 --every 2 --scale 3
node tools/shot.js --out $F/easy/f.png --events $E/easy.json --difficulty easy --wpm 30 --accuracy 0.97 --react 0.4 --seed 1 --when "s.time>25 && TG.Entities.typables(s).length>=1" --frames 170 --every 2 --scale 3
node tools/shot.js --out $F/hard/f.png --events $E/hard.json --difficulty hard --wpm 70 --accuracy 0.96 --react 0.3 --seed 4 --when "s.section>=1 && TG.Entities.typables(s).length>=3" --frames 200 --every 2 --scale 3
```

**Menu screens** (`public/ui`): `title.png`, `difficulty.png` and `world.png` from `tools/shot-ui.js` at `--scale 3`. The world scores picture uses the tool's sample data (`--panel scores --world ready --board medium`).

**Audio** (`public/audio`), from this folder:

```bash
node tools/render-audio.mjs music:level1:24 music:title:24 sfx:m1:8 sfx:m3:6.7 sfx:boss:8 sfx:easy:5.7 sfx:hard:6.7
```

The effects files these two shorts were first rendered with were each turned up to a peak of 0.89. The script writes effects at the game's own level, so a quiet clip made again with it (the Easy one) comes out quieter than in the videos of 4 October 2026.
