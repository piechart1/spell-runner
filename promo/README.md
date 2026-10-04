# Spell Runner promo shorts

Two vertical videos (1080 x 1920, 30 frames a second) made with [Remotion](https://www.remotion.dev):

- `TypeFastEnough`: "Can you type fast enough?" (about 17 s)
- `LearningToType`: "Learning to type?" (about 18 s)

The scenes are joined with Remotion's `TransitionSeries` (slide, wipe, clock wipe, flip, fade). The code is in `src/`: `Short1.tsx` and `Short2.tsx` hold the scenes and captions, `Stage.tsx` the gameplay band, `Text.tsx` the text styles.

## Preview and render

```bash
npm install
npm run dev
npx remotion render TypeFastEnough out/spell-runner-short-1.mp4
npx remotion render LearningToType out/spell-runner-short-2.mp4
```

Remotion is free for individuals and teams of up to three; see its licence for larger companies.

## The footage and sound are not in the repository

`public/frames`, `public/audio`, `public/events`, `public/ui` and `out/` are ignored by git, because they are generated from the game and are large. The videos cannot be rendered until they exist.

**Frames and event logs.** Run from the project root. Each command plays the game with the test bot and writes frames at 384 x 216 plus a log of the game events on each frame:

```bash
F=promo/public/frames; E=promo/public/events; mkdir -p $F/m1 $F/m3 $F/boss $F/easy $F/hard $E
node tools/shot.js --out $F/m1/f.png --events $E/m1.json --difficulty medium --wpm 55 --accuracy 0.97 --react 0.35 --seed 2 --when "s.section===1 && TG.Entities.typables(s).length>=2" --frames 240 --every 2 --scale 3
node tools/shot.js --out $F/m3/f.png --events $E/m3.json --difficulty medium --wpm 45 --accuracy 0.96 --react 0.4 --seed 3 --when "s.section===2 && TG.Entities.typables(s).length>=3" --frames 200 --every 2 --scale 3
node tools/shot.js --out $F/boss/f.png --events $E/boss.json --difficulty medium --profile target --seed 2 --when "s.screen==='boss' && TG.Entities.typables(s).length>=2" --frames 240 --every 2 --scale 3
node tools/shot.js --out $F/easy/f.png --events $E/easy.json --difficulty easy --wpm 30 --accuracy 0.97 --react 0.4 --seed 1 --when "s.time>25 && TG.Entities.typables(s).length>=1" --frames 170 --every 2 --scale 3
node tools/shot.js --out $F/hard/f.png --events $E/hard.json --difficulty hard --wpm 70 --accuracy 0.96 --react 0.3 --seed 4 --when "s.section>=1 && TG.Entities.typables(s).length>=3" --frames 200 --every 2 --scale 3
```

**Menu screens** (`public/ui`): `title.png`, `difficulty.png` and `world.png` from `tools/shot-ui.js` at `--scale 3`. The world scores picture uses the tool's sample data (`--panel scores --world ready --board medium`).

**Audio** (`public/audio`): `music_level1.wav`, `music_title.wav` and one `sfx_<clip>.wav` per clip. These were rendered in a browser by running the game's own `js/audio.js` in an `OfflineAudioContext`: the music by calling `TG.Audio.music(name)`, and each effects track by emitting that clip's logged events at their frame times with the music switched off. There is no script for this step in the repository yet.
