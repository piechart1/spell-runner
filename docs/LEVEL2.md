# SPELL RUNNER: Level 2 Design Plan, CLOCKWORK CAVERNS

Version 0.4, 2026-10-07. A plan: nothing in it is built.

## 0. Status and how to read this

**What this document is.** A design plan for Level 2. Where it says "the renderer reads `theme.tiles`" it means the renderer must be changed to do so; section 13 lists every such change by file. Where it gives a number it shows the arithmetic, in the style of `docs/DESIGN.md` 4.1 and 11.2. Numbers marked *measured* come from headless runs of the draft level on 2026-10-06, with stand-ins for the two new creatures and the new power-up and with the `clockwork` words installed. They were taken again the same day with the word lists as Appendix A now prints them, after the swaps of decision 17. The measured figures are gathered in section 8.6, which also says what stood in for what; a section that uses one cites it. They are starting values to be re-measured when the real parts exist. The two-stage totals of 8.6 and 12.5 were measured with a scratch `nextStage` and the same stand-ins. Line counts, days and every statement about how the real Flit and the real Pocket Watch play are estimates, and are marked so where they appear.

**What is decided.** The owner decided in three rounds, the first two on 2026-10-06 and the third on 2026-10-07. In the first: the theme (Clockwork Caverns, with Snowdrift Peaks shortlisted for a later level), the villain (Lady Ratchet, with the Baron as a cameo and the phase 3 minion), the second new creature (Flit, beside Dangle), the new power-up (the Pocket Watch), the Easy boss (the minion on, the double attack off: decision 3) and the acceptance standard (the contract's fixed pass conditions unchanged, plus the Level 2 target of 13.5: decision 4). In the second: each stage starts with the difficulty's own lives and no shield charges (decision 21); Easy keeps react 1.4 / perChar 0.8 / impactGap 2.7 for milestone M1, and its measured window use is carried as the noted exception to the 0.55 to 0.75 band until the real creatures are measured (decision 1); the word swaps, which leave 251 words (decision 17); the intro flag on the first two threats and the three-entry last wave of Appendix B as the layout (decision 20); and the world scores (decision 6). On the first four the owner took the plan's recommendation. On the world scores the owner chose differently from the plan: one board per difficulty, the three that exist today, holding every run wherever it ended. In the third round the owner took the plan's recommendation on seven more: Hard's boss has health 7, with a fight target of 60 to 120 s (decision 2); the Pocket Watch lasts 3 s on every difficulty for milestone M3, and its feel is looked at again once it can be played (decision 22); the snow at the defeat and the line "A COLD WIND BLOWS DOWN THE SHAFT." are both kept (decision 25); on an entry a run counts as cleared when it cleared at least one stage, and the rank is the whole run's (decision 28); a board row has no stage mark in the first release (decision 29); a run started at Stage 2 from the stage row goes on the same world board as the others (decision 31); and a board keeps its best 200 runs for the release, with the boards looked at again after a few weeks (decision 33). Section 14.1 records these. The plan also treats as settled, and lists in 14.2 for confirmation: Dangle and its anchored rule (decision 9), the crow's absence (8), the global unlock (5) and the smaller points of decisions 10 and 13 to 15. They are built as written, and none of them waits for an answer; the owner can change any of them by saying so. Two more points are settled in the body and have no row of their own: the round machine of `js/boss.js` does not change (10.5; decision 26 is the plan's choice that the fight adds no new player action, built as recommended unless the owner says otherwise), and each difficulty is made harder only through its `tune` block (section 8).

**What is open.** No decision now blocks the build: nothing waits for the owner's answer before a milestone. Section 14.3 lists the thirteen rows that remain, each with a recommendation, in two parts. Ten are engineering and smaller design choices that the plan will build as recommended unless the owner says otherwise (7, 12, 16, 19, 23, 24, 26, 27, 30 and 32): the save version, the release order, how the watch stops the world, what STAGE 1 CLEAR records for a run that goes on, the music of sections 1 and 2, the ready jingle, the boss's player actions, the replay ideas left for later, how the daily counts treat the second stage, and the table entry of a run abandoned in Level 2. Three wait for a measurement or a check and ask nothing now (11, 18 and 34): the name check, the floor player's headroom on Medium and Hard, and the last crate before the arena.

**What Level 2 inherits.** Everything not said here is as Level 1 has it. The rules live in:

| Rule | Where |
|---|---|
| Controls, the core loop, lock-on, keystroke response, frame timing | DESIGN 2, 3 |
| How a threat's time is set (budget, queue, spacing, keep-clear), contact and fairness, plates, the clear sequence | DESIGN 4.1, 4.4 to 4.6; CONTRACT 5.5 |
| Hazard windows, signposts, cues, falls, plank bridges | DESIGN 5; CONTRACT 5.8 |
| Lives, damage, checkpoints, continue | DESIGN 6 |
| Scoring, multiplier, rank, results, high scores, world scores | DESIGN 8; LEADERBOARD |
| The difficulty table and what `tune` may change | DESIGN 9.1; CONTRACT 5.10, 12.1 |
| Word rules and the picker | DESIGN 10; CONTRACT 4.6 |
| The boss round machine | DESIGN 11.6; CONTRACT 5.7; `js/boss.js` |
| Art rules, palette, parallax, sprite format | DESIGN 14; CONTRACT 6 |
| Audio rules, sound recipes, music format | DESIGN 15; CONTRACT 7; `js/audio.js` |
| Level data shape and validation rules V1 to V11 | CONTRACT 5.9; `js/level.js` |
| The headless harness and its pass conditions | CONTRACT 10.3, 10.4; `test/sim.js` |

Conventions are DESIGN's: distances in pixels at 384 x 216, tiles of 16 px, `a / b / c` is Easy / Medium / Hard, and nominal, world and real seconds are as DESIGN 3.2 defines them.

---

## 1. Summary and recommendation

**Theme.** Clockwork Caverns, the level DESIGN 17 pencils in: the caverns under the Baron's dig, lit by lanterns and crystals, with the palette lead INK, PLUM, TEAL and AQUA. Level 1 moved the time of day across the level; Level 2 moves the light. Section 1 is a lamplit cave under the Baron's hole, section 2 a hall of brass and turning cogs, section 3 a crystal cave with the Baron's rails running through it, and the arena is the hall of the Great Clock.

**The story step.** The Baron was a supplier. He dug up the meadow's words to deliver them to Lady Ratchet, a rat engineer who winds words into clockwork because machines are tidy and words are not. Pip climbs down the hole the Baron fled into. The Baron appears three times: peeking from a pipe in the section 2 backdrop, diving into Lady Ratchet's hatch during the boss intro, and popping out of the floor as her phase 3 minion, in a spare helmet a size too big, now working for her.

**The boss.** Lady Ratchet keeps the round machine of `js/boss.js` exactly as it is: volley, telegraph, attack, taunt, recoil or laugh, transition, finisher, defeated, on the world clock. What changes is what fills each step: cogs for rocks, a rolling gear for the shockwave and a swinging pendulum for the pickaxe, a ratchet-click telegraph, goggles whose lenses turn RED from phase 2, a key on her back that spins faster by phase, a visible boiler gauge that shows the fully-cleared-volley bonus (with a short toot when the long window opens), a finisher that cranks her key backwards one letter at a time, and a defeat that sends her up the shaft with snow drifting down after her: the hook to the next level (decision 25).

**What is new for the player on each difficulty.** Easy opens on the E I R T O U words it reached in Level 1's second section, with two words live from the first screen and the Pocket Watch to learn; the boss has the Baron minion in phase 3. Medium's words are a letter longer from the first screen (Level 1 began the shift in section 2), it meets Q X Z J a section earlier, and it runs three live words from section 2. Hard runs three live words from the first screen (Level 1: two) and four from section 3, as in Level 1, with words two letters longer by section 2. Every timing value is tightened inside the 25% band of CONTRACT 12.1; section 8 gives the figures. Measured with stand-ins (8.6), the bot at the design speed uses more of each word's time than on Level 1 on every difficulty, and the bot at the floor speed finishes every run without a continue, with little adaptive headroom left on Medium and Hard (decision 18).

**The new creatures.** Dangle, a cave spider that drops from the roof and hangs still at head height ahead of Pip: the first threat that waits in the air. Flit, a bat that enters from above, crosses over Pip, hovers behind him and dives from behind, so one word plate travels across the screen and a second warning beep, panned left, marks the turn. Each is introduced alone with the intro budget, each reaches Pip at t = 1 whatever he does, and the bot needs nothing new for either. Dangle never hangs within 8 tiles of a pipe, a lantern or the tunnel, the hazards that also hang from the roof (4.3). The bee and the frog are reskinned (a glow-moth, a tin frog); the boulder, snail, boar, mole and crate stay as they are; the crow does not appear underground.

**The new power-up.** The Pocket Watch: for 3 real seconds the world stops completely (the world clock's step is 0, as it already is on the `lifeLost` screen) while the letters keep lighting up. Every age, budget, arrival point and boss timer holds, so no word can reach Pip sooner because of it; section 6.3 gives the rule timer by timer.

**The words.** The five pools of each difficulty are kept and a flavour named `clockwork` (tools, machines, caves, light, time) adds 251 words to the threat tiers: 0 / 31 / 39 on Easy, 32 / 35 / 24 on Medium, 33 / 29 / 28 on Hard. All of them pass `TG.Words.validate` today, with no word already in `js/words.js`. Appendix A has the lists.

**How the player reaches Level 2.** After STAGE 1 CLEAR the results screen offers NEXT STAGE (Enter) or TITLE (Esc). NEXT continues the same run into Level 2: the score and the statistics carry over, and each stage starts with the difficulty's own lives (decision 21). Once Level 1 has been cleared on any difficulty on this computer, a STAGE row on the difficulty select screen also starts a run at Level 2. Save data keeps `version: 1` and gains a few fields (12.6; decision 7). The world scores keep one board per difficulty, as the owner decided (decision 6): every run is entered once, when it ends, with its run total, whether it ended at STAGE 1 CLEAR, went on into Level 2 or started there. A run through both stages scores about twice a Level 1 run played as well, and so stands above it; today's entries stay and move down (12.5). The service's score caps rise to fit two-stage totals, which also raises what a made-up score can claim against a Level 1 entry (12.5).

**Engineering size.** About 1,170 lines of code (an estimate, summed from the table in 13.1) across the modules that today assume Level 1 (the renderer's literal tile and hazard names, the BARON label, the Baron's draw and defeat branches, the fixed phase 3 tempo, the single-level harness), about 50 sprite definitions, two music tracks and a two-bar jingle, a few new save fields, new limits in the Worker and the level file itself; built in ten milestones (M0 to M9) with the groundwork first so that Level 1 is checked unchanged before any Level 2 content exists (section 13).

---

## 2. Narrative

**Premise, shown on the title screen's story panel once Level 2 is unlocked (12.4 gives the layout):**
"THE BARON FLED TO LADY RATCHET, WHO WINDS WORDS INTO CLOCKWORK. PIP CLIMBS DOWN AFTER HIM."
It is 90 characters and wraps to three lines of 31, 31 and 26 at the panel's width of 34.

**How it follows Level 1.** Level 1 ends with the Baron shrunk to minion size, scurrying down a hole with his helmet gone. Level 2 opens at the bottom of that hole: a rope hangs down the shaft at tile 2 (`decor_hole`), meadow roots hang through the roof of section 1, and the Baron's molehills stand in the near layer. The first words are old friends: a snail, a frog, a boulder, the meadow creatures that followed the words down. The player learns across the level that the Baron was a supplier: he peeks from a pipe in the Gear Hall, his moles are at home in Crystal Deep, and in the arena he dives into Lady Ratchet's hatch and is sent out again as her minion. He lost his helmet at the end of Level 1 (DESIGN 11.6), so here he wears a spare one a size too big, issued by Lady Ratchet. It is drawn in `bg_baronpeek` and on the Baronet, and it is what pops off when the Baronet is cleared (4.4).

**Lady Ratchet.** A rat engineer, 48x48 overall, built from parts like the Baron so that `drawBoss` composes her the same way:

| Part | Size, frames | What it is |
|---|---|---|
| `boss2_body` | 48x32, 2 (b0: standing; b1: the foot lifted and the tail twitched) | STONE fur, TEAL waistcoat with GOLD buttons and watch chain, PINK tail curling out to the right. Sits behind her engine as the Baron sits behind his mound |
| `boss2_head` | 32x24, 4 (normal, laugh, hurt, dizzy) | Long snout, two WHITE buck teeth, WHITE whiskers, round PINK ears, brass goggles with GOLD rims pushed up on her brow. The two lenses are the only CREAM on the head, so the existing `lampred` remap (CREAM to RED, CONTRACT 6.3) turns them RED from phase 2 with no new remap. `hurt`: goggles gone and eyes crossed. `dizzy`: spiral eyes, head on one side |
| `boss2_arm` | 16x16, 4 (rest, raise, throw, watch) | Near and far arm as the Baron's; `raise` holds a spanner up, `throw` flings a cog, `watch` holds her pocket watch up to her face (the near arm during a taunt) |
| `boss2_key` | 16x16, 4 (k0 to k3, a quarter turn each) | The wind-up key in her back, drawn between body and head at `bx + 14, by - 30`. It turns at a rate set by the phase and the state (section 10) |
| `boss2_engine` | 48x16, 2 (shut, open) | The brass engine with a hatch in the middle, drawn where `boss_mound` is drawn. The boiler gauge on its left is a dial of 10 px; the renderer draws its needle (section 10.4) |
| `boss2_goggles` | 8x8, 1 | Pops off on a hit, as `boss_monocle` does |

Colours: STONE, TEAL, GOLD, PINK, WHITE, BRONZE plus INK, and CREAM on the lenses only, which is the six-plus-CREAM rule of CONTRACT 6.2. None of them is a band colour of 3.1. She faces left.

**Personality.** A fussy perfectionist. Words will not sit still, they come in odd lengths, they mean things, and that is why she winds them into cogs. She counts under her breath, taps her foot through the taunt window, winds her own key when she is kept waiting, and is vain about her goggles: two lenses to the Baron's one, which she takes as proof that she is twice as clever. She is never cruel, only impatient. A hit knocks her goggles off and makes her lose count, and a small "1..." popup shows her starting again. Where the Baron was loud, she is brisk, and the fight has that rhythm: the telegraph is three ratchet clicks of her key.

**Speech plate.** "TICK TOCK! WORDS INTO COGS!" (27 characters; the plate is 8 x 27 + 5 = 221 px wide and fits). Level data: `boss.speech`.

**Intro (4 s, 1.5 s after a continue).** The shrunken Baron (`en_baronet`, section 4.4) hops in from the left edge of the screen and drops into the engine hatch with a puff of dust, and the hatch bangs shut. The engine rattles, steam puffs, and Lady Ratchet rises out of the hatch. She lifts her goggles and winds her key three clicks, then laughs while the speech plate types out. Section 10.1 gives the one timeline, as fractions of the intro timer, and says what the short intro keeps. All of it is presentation keyed on `boss.kind` in `js/render.js` and `js/effects.js`; the simulation's intro timer, `boss.rise` and `boss.pose` are unchanged.

**Defeat.** When the finisher word is complete: the 30-frame freeze and 2-frame flash of Level 1; the key shoots out of her back and clatters on the floor (the helmet particle with `boss2_key`); the goggles fly off; the hatch bursts open and the letter fountain erupts from the engine (Level 1's fountain, started at the hatch); she is launched straight up out of the top of the playfield, spinning (the `dizzy` head and a body flip on alternate frames; no rotation); cogs rain down and bounce (`fx_cogbit`); and as the victory fanfare plays, WHITE flakes (`fx_flake`) drift down through the shaft she went up. Nothing is hurt: she is wound down and sent off.

**Section and arena names.** LANTERN HOLLOW, THE GEAR HALL, CRYSTAL DEEP and THE GREAT CLOCK; the table is in 9.1.

**Hook to the next level.** The snow through the shaft, and one line on the results screen under STAGE 2 CLEAR!: "A COLD WIND BLOWS DOWN THE SHAFT." The cogs she finished were being hoisted up that shaft to someone above. The owner has shortlisted DESIGN 17's Snowdrift Peaks for a later level. Neither the snow nor the line names it, so both read as an ending whichever level comes next. The owner decided on 2026-10-07 to keep both (decision 25).

---

## 3. Theme and art

### 3.1 Palettes and the legibility rules

Level 1's backdrop is bright, and the INK word plates with WHITE text, the 1 px INK outlines and the RED urgent border were tuned against it. On a dark backdrop the plates still read by their text and borders, but an INK outline no longer separates a sprite from what is behind it: INK against PLUM, DEEP_BLUE or SHADOW has a contrast of 1.3 to 1.5 to 1, against 6.4 to 1 on Level 1's SKY. Two rules follow.

**Rule 1: the plate band.** Plates travel between y 24 and y 150.

- The band is one flat mid-dark colour per palette (PLUM or DEEP_BLUE), with no dither outside the arena's later phases.
- A backdrop piece inside the band uses SHADOW only. SHADOW is as dark as PLUM (1.0 to 1) and reads against it by hue alone, which is the intent: the walls are a hint. Four exceptions are named, each dim or small: a 1 px BRONZE rim on `bg_cog_l` and `bg_pipe_v`, whose tops reach y 136; the 1 px DEEP_TEAL lines of `bg_mist`; the 2 px GOLD dots of `bg_cave_far`; and the 8x8 BRONZE `bg_gearstar`. Roof pieces (`bg_roots`, `haz_ceiling`) end by y 40.
- The clock face is the one bright piece above y 150. It sits at x 328 to 376, y 36 to 84: to the right of every boss plate (the widest, a 15-letter finisher at 2x, ends at x 315) and of Lady Ratchet (x 272 to 320, below y 126), where no cog flies and no cog plate is drawn.
- Lantern flames (GOLD, ORANGE, CREAM), crystals (AQUA, TEAL) and every other bright pixel stand on the floor line, below y 150.
- The arena changes once per boss phase, as Level 1's dusk does: PLUM; then PLUM with a MAROON dither, the furnace glow of the floor band rising up the walls; then INK with a PLUM dither, which is Level 1's phase 3 sky and is never flat INK. A SHADOW dither on PLUM is not used as a step: the two are equally dark, and the dither is a checkerboard (`TG.Gfx.dither`), so PLUM on SHADOW and SHADOW on PLUM are the same picture.
- The Hourglass sky (`slowSky`) differs from the band colour in every palette, so the slow-down reads.

**Rule 2: sprites against the band.** Creatures, Pip, crates, ink drops, decor and signs are drawn without the section remap, as in Level 1 (`drawEntities`, `drawPip`, `drawItems` and `drawProps` take none). Each must therefore read by its own colours against every band it meets: PLUM (sections 1 and 2 and the arena), DEEP_BLUE (section 3, and section 2 while the level's one Hourglass runs) and the arena's two dithers. The two `slowSky` colours are the same two, so a crate moved in tuning meets nothing new.

- No new creature, projectile or boss part uses PLUM, DEEP_BLUE, SHADOW, MAROON or DEEP_TEAL for a body, a wing or a limb. Dangle and Flit are LILAC (5.7 to 1 on PLUM, 5.1 to 1 on DEEP_BLUE) with VIOLET detail; Glimmer is AQUA and CREAM; Lady Ratchet's waistcoat is TEAL (section 2).
- The hazard skins, which are drawn without the remap as well, each show a colour that is not a band colour: BRONZE on the pipe, GOLD and CREAM on the lantern, AQUA on the spikes, STONE on the tunnel. The signposts and chevrons are unchanged.
- The returning sprites are listed with what carries them. Two are marked for the shot check of 13.6.

| Sprite | Colours | Against PLUM and DEEP_BLUE |
|---|---|---|
| Pip | RED, TEAL, DEEP_TEAL, PEACH, WHITE | Reads by RED, TEAL and PEACH. To check: the DEEP_TEAL shading of his tunic on the DEEP_TEAL dither of `crystal`'s floor band. If it is lost, that dither becomes SHADOW |
| Boulder | SILVER, STONE, SHADOW | Reads by SILVER (6.5 and 5.8 to 1) |
| Dawdle | SAND, ORANGE, BRONZE | Reads |
| Sprocket (the frog under `tin`) | BRONZE, GOLD, SILVER | Reads |
| Truffle; Digby and the Baronet; the mound; the crate | SOIL, CLAY, WHITE; GOLD, SOIL, PINK; BARK, SOIL, CLAY; SAND, CLAY, RED | Read by CLAY, GOLD, SAND and RED. BARK is as dark as both bands, so the mound reads by its CLAY clods |
| Ink drop | ROYAL, DEEP_BLUE, WHITE | To check: ROYAL on the DEEP_BLUE band of section 3. Body against band is 2.2 to 1 there (1.9 to 1 on SKY), but the INK outline that carries the drop on SKY does not carry it here. If the rows are hard to see, `item_ink` takes a remap named in the level data (ROYAL to SKY, DEEP_BLUE to ROYAL; two lines in `drawItems`) |

**Palettes.**

| Palette | Section | Band, y 0 to 150 | Floor band, y 150 to 184 | `slowSky` | Remap | Lead colours |
|---|---|---|---|---|---|---|
| `lantern` | 1 | PLUM | PLUM dithered SHADOW | DEEP_BLUE | none | PLUM, SHADOW, GOLD and ORANGE lamplight |
| `brass` | 2 | PLUM | PLUM dithered SHADOW | DEEP_BLUE | `brass` | PLUM, SHADOW, BRONZE, GOLD |
| `crystal` | 3 | DEEP_BLUE | DEEP_BLUE dithered DEEP_TEAL | PLUM | `crystal` | DEEP_BLUE, DEEP_TEAL, TEAL, AQUA |
| `clock` | arena | PLUM; phase 2 PLUM dithered MAROON; phase 3 INK dithered PLUM | MAROON dithered PLUM | DEEP_BLUE | `brass` | SHADOW, PLUM, MAROON, GOLD |

The band is the first entry of the palette's `sky` list and runs from y 0, because `drawSky` applies the Hourglass colour and the phase colour to the first band only; the HUD covers y 0 to 22. Both rules are checked with `tools/shot.js` in every section and boss phase before any art is final (13.6).

**Remaps.** A remap maps palette indices to palette indices and leaves alone every colour it does not list (CONTRACT 6.3). `lantern` has none: the pieces are drawn in it. The renderer applies a section's remap to the backdrop pieces, the tiles and the ceiling rim (`haz_ceiling`, as `haz_canopy` today). The other hazard skins are drawn without it, as Level 1's are, and so is everything under rule 2.

| Remap | Used by | Pairs | Left alone |
|---|---|---|---|
| `brass` | Palettes `brass` and `clock` | STONE to BRONZE (rock faces become brass plate); TEAL to GOLD (moss specks become rivets) | INK, SHADOW, SILVER, WHITE, CREAM, BRONZE, GOLD, ORANGE, AQUA, DEEP_TEAL, CORAL, PLUM, MAROON, SOIL, PINK |
| `crystal` | Palette `crystal` | PLUM to DEEP_BLUE (the ceiling rim follows the band); BRONZE to DEEP_TEAL (metal goes cold); GOLD to AQUA and ORANGE to TEAL (the far wall's lamp dots become crystal glints) | INK, SHADOW, STONE, SILVER, WHITE, CREAM, TEAL, DEEP_TEAL, AQUA, CORAL |
| `tin` | The frog, through `theme.skins` (3.6). An entity's remap, not a section's | GRASS to BRONZE; LIME to GOLD; WHITE to SILVER | Every other colour |

A piece that appears in more than one section uses STONE, TEAL, BRONZE, GOLD, ORANGE and PLUM only where the change above is wanted. The rails stay SILVER and the hazard accents CORAL everywhere. The arena has no remap of its own: the clock hall is the Gear Hall's metal in a darker room, and its difference is in the bands, the phases and the pieces. Appendix C gives the tables as index pairs.

### 3.2 Progression across the level

Level 1 goes from morning to dusk. Level 2 goes from lamplight to crystal light, deeper and colder, so that the snow at the end is where the level was heading: section 1 is warm (lanterns on posts, roots from the meadow, molehills), section 2 is brass and furnace light (cogs, pipes, the Baron peeking from a pipe), section 3 is cold blue (crystal clusters, glow-worm points of light, the Baron's rails), and the arena is lit only by the clock face and the engine's dials. The music follows: section 3 lifts the level track by 3 semitones at 148 BPM, as Level 1's section 3 lifts its track by 2 at 158.

### 3.3 Backdrop `cavern`, layers back to front

Colours are as drawn for `lantern`; the remaps of 3.1 change them in the other sections. A piece with frames gives their number and rate.

| Layer | Factor | Content | Sprites: size, frames, colours |
|---|---|---|---|
| L0 | 0 | The bands of 3.1 | none |
| L1 `mist` | 0.1, drift 1 | Mist wisps in sections 1 to 3. In the arena the palette's `stars` list draws slowly turning cogs (palette key `starSprite`) and its `moon` entry draws the clock face (`moonSprite`) | `bg_mist` 64x16, 2 frames: 1 px DEEP_TEAL lines. `bg_gearstar` 8x8, 2: BRONZE with a SHADOW hub. `bg_clockface` 48x48, 2 (the minute hand ticks once a second): CREAM face, GOLD rim, BRONZE numerals, INK hands. `drawSky` draws the last two, without a remap |
| L2 `far` | 0.2, repeat 128 | Far rock wall, y 120 to 168, with four 2 px dots that twinkle: lamps in sections 1 and 2, crystal glints in section 3 through the `crystal` remap | `bg_cave_far` 128x48, 2 (2 fps): SHADOW, GOLD dots |
| L3 `mid` | 0.4, repeat 384 | Mid rock wall x3; roots from the roof (section 1, bottom at y 40); lantern posts (sections 1 and 2); a big turning cog where the windmill was (section 2 and the arena); vertical pipes (section 2); crystal clusters (section 3) | `bg_cave_mid` 128x56: SHADOW. `bg_roots` 32x24: SHADOW. `bg_lantern` 16x24, 2 (3 fps): SHADOW post, GOLD, ORANGE and CREAM flame at y 160 to 167. `bg_cog_l` 48x48, 4 (4 fps): SHADOW with a 1 px BRONZE rim and spokes, GOLD hub below y 150. `bg_pipe_v` 16x48: SHADOW with a 1 px BRONZE edge, BRONZE and GOLD flanges below y 150. `bg_crystal_l` 32x24: AQUA, TEAL, DEEP_TEAL |
| L4 `near` | 0.7, repeat 384 | Molehills (section 1, reused); stalagmites (sections 1 and 3); horizontal pipes (section 2 and the arena); the Baron peeking from the end of a pipe, one item, section 2 only; boilers with dials (arena); small crystals (section 3) | `bg_molehill` reused. `bg_stalagmite` 16x24: SHADOW, STONE. `bg_pipe_h` 32x16: BRONZE, GOLD, SHADOW. `bg_baronpeek` 16x16, 2 (he looks out, he ducks back; 1 fps): SOIL, GOLD helmet, PINK, WHITE. `bg_boiler` 32x32, 2 (2 fps): BRONZE, GOLD, SHADOW, CREAM dial. `bg_crystal_s` 16x16: AQUA, TEAL |
| `rails` | 0.7, repeat 32 | The Baron's rails along the floor line (section 3 and the arena) | `bg_rail` 32x8: SILVER, SHADOW |
| L5 | 1.0 | Play plane: the tiles of 3.4 | |
| L6 `fg` | 1.3, repeat 256, front | Stalagmite stumps at y 216, where the grass tufts were | `fg_stalagmite` 16x8, 2: SHADOW, STONE |

The layer format is CONTRACT 6.5 as it stands; the renderer draws whatever layers the backdrop lists, so the `rails` layer needs no code. Three optional palette keys are new, each a line in `js/render.js` with today's behaviour as the default, so Level 1 is unchanged: `starSprite` and `moonSprite`, which `drawSky` reads with `bg_star` and `bg_moon` as the defaults (the moon sprite is drawn with its `fps` frame, which is frame 0 for the one-frame `bg_moon`), and `phases` (3.1), which `skyFor` reads with the `dusk` rule as the fallback. Appendix C gives `TG.Backdrops.cavern` in full, in the form of `TG.Backdrops.meadow`: the four palettes with their `sky` bands, and every layer item with its x, y and sections. The positions are starting values for the art pass of 13.6.

### 3.4 Tiles and hazard skins

The level file names them (CONTRACT 5.9 already has the keys). `js/render.js` draws every tile and hazard sprite by its literal name today (`drawGround` lines 307 to 321, `drawHazards` lines 397 to 424), so the renderer must read `theme.tiles` and `theme.hazardSkins` with today's names as the fallbacks; this is part of milestone M0 (13.4) and it is checked by a before-and-after pixel comparison of Level 1. Each Level 2 tile and hazard sprite has the size, frame names, fps and anchor of the sprite it replaces (Appendix C gives the manifest rows).

| Key | Level 1 | Level 2 | Look |
|---|---|---|---|
| `tiles.top` | `tile_grass` | `tile_cave_top` (2 variants) | STONE and SHADOW rock with TEAL moss specks |
| `tiles.fill` | `tile_soil` | `tile_cave_fill` (2) | SHADOW rock |
| `tiles.edgeL`, `edgeR`, `wallL`, `wallR` | the soil edges | `tile_cave_edge_l`, `tile_cave_edge_r`, `tile_cave_wall_l`, `tile_cave_wall_r` | Rock lips over a pool or a chasm |
| `tiles.gapFill` | `tile_water` | `tile_pool` (2 frames, 3 fps) | A glowing AQUA and DEEP_TEAL pool, for sections with `gapFill: 'water'` (1 and 2) |
| `tiles.gapFillDark` | `tile_dark` | `tile_dark` reused | Darkness, section 3 |
| `tiles.plank` | `tile_plank` | `tile_girder` | An iron girder bridges a bridged gap |
| `tiles.arenaTop`, `arenaFill` | `tile_arena`, `tile_soil` | `tile_clockfloor` (2), `tile_cave_fill` | Brass floor plates with a cog pattern |
| `tiles.rail` | `tile_rail` | `tile_rail` reused | The Baron's mine rails run into the clock hall |
| `hazardSkins.bramble` | `haz_bramble` | `haz_crystal` 16x16 | Jump: an AQUA crystal cluster with CORAL tips, thorns in the lower 8 px as the bramble's are |
| `hazardSkins.branch` | `haz_branch` | `haz_pipe` 16x16 | Duck: a low BRONZE pipe hanging from the roof |
| `hazardSkins.trunk` (new key) | `haz_trunk` | `haz_pipe_riser` 16x16 | Tiled up from the low pipe to the roof |
| `hazardSkins.canopy` (new key) | `haz_canopy` | `haz_ceiling` 48x16 | A rock rim where the riser meets the roof; SHADOW and PLUM. The one hazard sprite drawn with the section's remap, as `haz_canopy` is today |
| `hazardSkins.beehive` | `haz_beehive` | `haz_lantern` 16x24 | Duck: a swinging lantern (the renderer's 6 px swing is reused); CREAM glass, GOLD frame |
| `hazardSkins.rope` (new key) | `haz_rope` | `haz_chain` 16x16 | Tiled up from the lantern |
| `hazardSkins.arch` | `haz_arch` | `haz_tunnel` 48x16 | Hold duck: a low rock tunnel; the HOLD sign is unchanged |
| `hazardSkins.archTrunk` (new key, optional) | `haz_trunk` | `haz_column` 16x16 | Rock columns under the tunnel's ends; defaults to `trunk` |

The hold-duck hazard is a tunnel here, so two lines of text follow the theme: `theme.hazardNames: { arch: 'TUNNEL' }` gives the tip "TIP: HOLD ENTER UNDER THE TUNNEL" (today's text is a literal in `js/hud.js`, "ARCH" is the default), and How To Play says "HOLD FOR ARCHES AND TUNNELS". Signposts, the TYPE! board, the checkpoint flag, the key prompts and the chevrons are reused unchanged.

One more Level 1 literal is in `js/effects.js`: on `hazard:hit` it bursts particles in meadow colours ([GRASS, CORAL, LIME] for a bramble, [GRASS, LIME, SOIL] for the others, line 877), so striking a crystal or a pipe would throw green leaves. `theme.hazardFx` gives the three colours per hazard kind, with today's values as the defaults: the crystal spikes AQUA, CORAL, WHITE; the pipe BRONZE, GOLD, STONE; the lantern GOLD, CREAM, BRONZE; the tunnel STONE, SILVER, SHADOW.

### 3.5 New sprites

| Sprite | Size, frames | Colours (plus INK) | File (CONTRACT work package) |
|---|---|---|---|
| `en_dangle` | 16x16, 3 (hang0, hang1, zip) | LILAC body, VIOLET legs and markings, WHITE eyes | `js/sprites-chars.js` (WP-C) |
| `en_flit` | 24x16, 3 (flap0, flap1, dive) | LILAC wings, VIOLET body, CREAM ears and eyes | WP-C |
| `en_glimmer` | 16x16, 2 (fly0, fly1) | AQUA wings, CREAM body, TEAL markings; replaces the bee's sprite by the skins map | WP-C |
| `en_baronet` | 16x16, 3 (peek, up, spin) | GOLD helmet (a size too big: it sits over his eyes in `peek`), SOIL fur, WHITE monocle and moustache; the Digby model's frame names | WP-C |
| `boss2_body`, `boss2_head`, `boss2_arm`, `boss2_key`, `boss2_engine`, `boss2_goggles` | section 2 | section 2 | WP-C |
| `pr_cog` | 12x12, 2 (k0, k1) | BRONZE, GOLD, STONE: the rock kind's skin | WP-C |
| `pr_rollgear` | 16x8, 2 (s0, s1) | BRONZE, GOLD, STONE: the shockwave's skin, a gear rolling along the floor | WP-C |
| `pr_pendulum` | 16x16, 4 (p0 to p3, four swing steps) | GOLD, BRONZE, SILVER: the pickaxe's skin | WP-C |
| `fx_cogbit` | 8x8, 2 | BRONZE, GOLD | `js/sprites-world.js` (WP-D) |
| `fx_flake` | 8x8, 2 | WHITE, HAZE | WP-D |
| `pw_watch` | 16x16, 2 (the hand ticks) | GOLD, BRONZE, WHITE, CREAM | WP-D |
| Tiles of 3.4 | 16x16 | STONE, SHADOW, TEAL, AQUA, DEEP_TEAL, BRONZE, GOLD, PLUM | WP-D |
| Hazards of 3.4 | as listed | AQUA, CORAL, BRONZE, GOLD, CREAM, SHADOW, PLUM, STONE | WP-D |
| Backdrop pieces of 3.3 | as listed | as listed in 3.3, under rule 1 of 3.1 | WP-D |
| `decor_hole` | 32x32, 1 | BARK, SOIL, SAND: the bottom of the Baron's hole with a rope | WP-D |

The three new creatures follow rule 2 of 3.1: none has a band colour on its body, wings or legs. About 50 definitions (51 are named in 3.3 to 3.5; 47 without the four Tier 2 pieces `bg_mist`, `bg_baronpeek`, `decor_hole` and `fx_flake`). Appendix C lists all 51 as manifest rows (size, frame names, fps, anchor); a sprite that takes the place of a Level 1 sprite copies that sprite's row. A missing sprite draws as a labelled box and never stops the game (DESIGN 14.1), so the level is playable before the art exists.

### 3.6 Level 1 art reused

| Reused as is | Reused with a remap |
|---|---|
| `en_boulder`, `en_dawdle`, `en_truffle`, `en_digby`, `en_mound`, `crate_balloon`, `crate_box`, every `pw_*`, `item_ink`, the signs, the flag, the key caps, every `fx_*` except where 4.1 names a swap, `tile_dark`, `tile_rail`, `bg_molehill` | `en_hoppet` and `fx_lilypad` with the new remap `tin` ({14: 16, 15: 18, 4: 3}: GRASS to BRONZE, LIME to GOLD, WHITE to SILVER), so the frog reads as a wind-up tin frog and its lily pad as a brass disc, with no new frames |

The crate's balloon stays RED: a balloon under a cave roof is odd, but the GRASS-bordered friendly plate and the red balloon are what the player learned to look for (decision 10).

---
## 4. Threats

### 4.1 Returning kinds

Kind ids, frame names, sprite sizes and anchors do not change for any returning kind, so the simulation, the bot, the fairness checks and the `wordLen` tables are untouched by a reskin. A reskin is a sprite or remap substitution at draw time (section 4.5).

| Kind | In Level 1 | In Level 2 | Sprite | Clear animation |
|---|---|---|---|---|
| Boulder | Boulder | A cave rock; unchanged | `en_boulder` | Unchanged |
| Dawdle | Snail | The meadow snail that followed the words down; unchanged. It stays the Easy mascot | `en_dawdle` | Unchanged |
| Hoppet | Frog | Sprocket, a wind-up tin frog: the frog's frames under the remap `tin` (GRASS to BRONZE, LIME to GOLD, WHITE to SILVER) | `en_hoppet` with `tin` | Unchanged; the lily pad is drawn with the same remap and reads as a brass disc |
| Buzzle | Bee | Glimmer, a glow-moth at head height with the bee's 4 px bob; a bee reads wrong underground and a remap of the bee's stripes still reads as a bee, so this one is a new 2-frame sprite | `en_glimmer` | The bee's spiral upward; the flower is swapped for four `fx_star` twinkles that drift down |
| Swoop | Crow | Not used in Level 2. Flit takes the above direction, and two bats would confuse the read. `en_swoop` stays for Level 1 | | |
| Truffle | Boar | The boar that followed the carts down the rails; unchanged | `en_truffle` | Unchanged |
| Digby | Mole minion | The Baron's moles, at home in Crystal Deep; unchanged. Also the model for the Baronet (4.4) | `en_digby` | Unchanged |
| Rock | Boss projectile | A cog lobbed from Lady Ratchet's engine: the rock kind and both its paths, drawn as `pr_cog` | `pr_cog` | The rock's return path (it flies back and clangs off the engine) |
| Crate | Balloon crate | Unchanged | `crate_balloon` | Unchanged |
| Shock, Pick | Shockwave, pickaxe | The attack kinds `shock` and `pick` with the same boxes, speeds and windows, drawn as a rolling gear (`pr_rollgear`) and a swinging pendulum (`pr_pendulum`). The kinds are kept on purpose: `nextAction` (entities.js), `attackWindow` (render.js), `spawnNextAttack` (boss.js), the audio `attack:spawn` handler and the sim Checker's `announce` assertion all key on the literals `shock` and `pick` | | |

Word lengths for the returning kinds are the difficulty table's (CONTRACT 5.10), shifted by the section as section 8 sets, except the rock's on Easy and Hard, which the tune block raises by one letter at both ends through `wordLen` (8.2).

### 4.2 New kinds

| Name | What it is | Arrives from | Movement | Word length E / M / H | Clear animation | Sound family |
|---|---|---|---|---|---|---|
| Dangle | Cave spider, 16x16 | Above, at a fixed point ahead of Pip (anchored in the world like the Boulder) | Drops from the roof on a thread over the first fifth of its time and hangs still at head height; Pip runs up to it. No letter stall | 3-4 / 5-6 / 6-8 | The thread snaps and it zips back up out of the top of the playfield (frame `zip`), leaving two `fx_star` twinkles where it hung | TWANG |
| Flit | Bat, 24x16 | Above, then behind | Enters from the top ahead of Pip, crosses over him to a hover point behind, then dives at him from behind. One plate travels across the screen; a second warning beep, panned left, marks the turn | 3-4 / 5-6 / 6-9 | Folds its wings (frame `dive`, flipped on alternate frames) and tumbles up into the dark, leaving three `fx_star` twinkles | POP |

Both are 3 colours plus INK (LILAC and VIOLET with WHITE or CREAM, 3.5) and face left (towards Pip) when they are drawn unflipped. Both clear animations use `fx_star` as it is, with no remap. `KINDS` entries:

```js
dangle: { type: 'threat', from: 'above', w: 16, h: 16, sprite: 'en_dangle', family: 'twang', stall: false, anchored: true },
flit:   { type: 'threat', from: 'above', w: 24, h: 16, sprite: 'en_flit',   family: 'pop',   stall: true }
```

`wordLen.dangle` and `wordLen.flit` go into the three difficulty entries of `js/core.js` (CONTRACT 5.10), because a kind is defined in code and a level file cannot add one: `dangle: [3, 4] / [5, 6] / [6, 8]`, `flit: [3, 4] / [5, 6] / [6, 9]`.

### 4.3 Movement detail

Notation as DESIGN 4.3: `t = age / budget`, `dx` the distance ahead of Pip, `B` the budget in world seconds, `contact` half Pip's hitbox plus half the threat's (11 px for a 16 px sprite, 15 px for a 24 px sprite), `elev` the height of the sprite's bottom above the ground.

**Dangle: the anchored rule, chosen over the Dawdle formula.** With the Dawdle formula and `minSpeed` 0, the closing speed is `c = max(64, 280 / B)`, so the spider is stationary in the world only for budgets over 280 / 64 = 4.375 ws. On Hard a 7-letter word (the shortest Hard Dangle the draft gives, with section 1's shift of 1) has a base budget of 0.55 + 0.25 x 7 = 2.3 nominal s = 2.9 ws, and the spider would drift towards Pip at 280 / 2.9 - 64 = 33 px/ws; with the letter stall on it would also slide forward during every stall, as the Dawdle does. "Hangs still" would be false exactly where it matters. The Boulder's rule gives stillness on every difficulty, so Dangle takes it:

| Step | Rule |
|---|---|
| Placement | `anchorX = pip.x + contact + 64 x B` at the moment it appears, after the keep-clear rule has moved the arrival point past any hazard zone (the keep-clear rule runs inside `budgetFor` before the anchor is computed, as for the Boulder) |
| Clock | `t` is worked out from the distance Pip still has to run, `t = 1 - (dx - contact) / (64 x B)`, so `t = 1` is the moment Pip reaches it, whatever he is doing. This is the Boulder's branch in `updateTypable`; it becomes "any kind with `anchored: true`" |
| Minimum budget | None. The Boulder's 4.4 ws minimum exists so that a Boulder never pops into existence inside the view (DESIGN 4.3). Dangle enters from above the roof, so a short budget simply means it drops into view closer to Pip. At the base budget this is inside the view on every difficulty: Easy 3 letters (2.85 ws; 4.3 ws as the intro) anchors 193 px ahead; measured today with a patched copy of `js/entities.js`, the shortest Hard Dangle in the draft is a 7-letter word at 2.88 ws, anchored 195 px ahead and in view about 0.03 ws after spawn, with 0.2 x 2.88 = 0.58 ws for the 156 px drop; at a forced 2 ws budget the anchor is 139 px ahead (screen x 235 of 384). The top tag and the `above` warning show from spawn. Run A of 8.6 did not see this case, because the Boulder stand-in kept its minimum; run B did. The `BOULDER_MIN_BUDGET` line in `budgetFor` stays keyed on `boulder` |
| Drop | For `t < DANGLE_DROP_T` (0.2): `elev` goes from the roof (`GROUND_Y - PLAY_TOP + 16` = 176, the sprite's bottom at the top of the screen, as the Swoop starts) to `DANGLE_ELEV` (20) on an ease-out curve. With a long budget the anchor is beyond the right edge and the drop happens out of view: the spider is already hanging when it scrolls in |
| Hang | From `t = 0.2` to `t = 1`: `elev = DANGLE_ELEV`, `dx = anchorX - pip.x`. A 2 px sway on `animT` is presentation; the hitbox is fixed |
| Thread | A 1 px SILVER line from `PLAY_TOP` to the sprite's top, drawn by `js/render.js` (no sprite). Not drawn while the anchor is beyond the right edge |
| Edge tags | A right tag while it is beyond the right edge (as a far Boulder has), a top tag while it is above `PLAY_TOP` in view. `layoutLabels` decides both by position and needs no change |
| Warning | `threat:warn` with `from: 'above'` at spawn (2093 Hz, centre). The existing rule emits it because `from` is not `right` |
| Letter stall | Off, as for the Boulder: with `t` derived from distance a stall would change nothing |
| Head height | `DANGLE_ELEV` 20 puts the sprite at y 148 to 164; Pip's standing hitbox reaches y 162, so the spider is at his face when he arrives. Contact is by the clock in any case |
| Clear of what else hangs | A low pipe, a lantern and the tunnel also hang from the roof at head height. For Dangle the keep-clear rule widens the zone of every duck hazard (`branch`, `beehive`, `arch`) so that the anchor is at least `DANGLE_CLEAR` (128 px, 8 tiles) from the hazard's box on either side; an arrival point inside the zone moves to its far end, as for any zone. One condition in `keepClear`, which now takes the kind. Measured today with the rule patched in (run B of 8.6): in 39 runs no Dangle hung nearer than 8.0 tiles to a duck hazard. Without the rule the nearest was 3.2 tiles, just past the lantern at 200, the pipe at 422 and the tunnel, because the queue and spacing rules stretch a budget until its arrival point meets the next zone |
| The read | Dangle has a word plate, a 1 px thread and a LILAC body, and no signpost or chevron. A lantern has a chain, a GOLD frame, the duck signpost and chevron, and never a plate |

Constants in `TG.C`: `DANGLE_ELEV: 20`, `DANGLE_DROP_T: 0.2`, `DANGLE_CLEAR: 128`. The layout does its part as well: every Dangle trigger is placed so that its arrival point at the base budget (12 to 17 tiles ahead of the trigger, 18 to 25 for the intro) is at least 8 tiles from a duck hazard, and two Hard entries were moved for it (9.2). The Boulder literal appears in seven places in `js/entities.js`, and each is named in 13.1 with what it becomes: the header comment (line 22), `KINDS` (41), the minimum budget in `budgetFor` (382, which stays on the Boulder), the anchor in `spawn()` (435), `place()` (554, where Dangle gets its own case with `dx = anchorX - pip.x`), the x assignment `e.x = e.kind === 'boulder' ? e.anchorX : p.x + dx` (648, which becomes `anchored`, so `x` is exactly `anchorX` for both kinds) and the age from distance in `updateTypable` (665). In the sim Checker, line 241 (the impact point from `anchorX`) becomes "any anchored kind", line 229 (the minimum budget) stays keyed on `boulder`, and the keep-clear assertion (lines 244 to 252) applies Dangle's wider zone, since it fails any budget longer than its own rules give.

**Flit.** Four phases on `t`, all in `place()`:

| Phase | `t` | Path |
|---|---|---|
| `enter` | 0 to 0.15 | `dx = FLIT_FROM_DX` (150); `elev` from the roof (176) to `FLIT_CROSS_ELEV` (100). A top tag until it is in view |
| `cross` | 0.15 to 0.55 | `dx` from 150 to `FLIT_BEHIND_DX` (-72), linear in `t`; `elev` 100 with a 4 px flutter on `animT`. It passes over Pip at about `t = 0.42`. Faces left |
| `behind` | 0.55 to 0.70 | `dx = -72`, `elev` settles from 100 to `FLIT_BEHIND_ELEV` (80). At the moment the phase becomes `behind`, `updateTypable` emits `threat:warn` with `from: 'behind'` once (a new flag `e.turned`): 1760 Hz panned left, the same sound the Truffle uses. Faces right (`flipX`) from here on |
| `dive` | 0.70 to 1 | Ease-in (`r * r`, as the Swoop's dive) from (-72, 80) to `dx = 0`, `elev = FLY_HIT_ELEV` (12): it lands on Pip's head from behind at `t = 1`. A ground marker (`fx_marker`) at Pip's x during the dive, as for the Swoop |

The hover point is on screen: Pip is at screen x 96, so `dx = -72` puts the 24 px sprite at x 12 to 36, and the plate stays a plate rather than a left edge tag; the player watches one plate go across and come back. Crossing speed relative to Pip is 222 px over 0.4 x `B`: 107 px/ws for the Easy intro (`B` = 5.2 ws), 174 px/ws for an 8-letter Hard word, the shortest the draft gives, since Flit first appears in section 2 where Hard's shift is 2 (`B` = 3.2 ws, about 1.0 real s to cross). Letter stall on. Contact at `t = 1` is the clock rule of `updateTypable` and does not depend on Pip's state. Constants in `TG.C`: `FLIT_ENTER_T: 0.15, FLIT_CROSS_T: 0.55, FLIT_BEHIND_T: 0.70, FLIT_FROM_DX: 150, FLIT_BEHIND_DX: -72, FLIT_CROSS_ELEV: 100, FLIT_BEHIND_ELEV: 80`.

**The bot.** Nothing changes: it types the typable with the lowest `eta` and acts only on `nextAction`. The `no-dodge-actions` check (`test/sim.js` line 1187) gains both kinds in its list, and a new `new-kinds` check watches each kind's edge tag, path and removal (section 13.5).

### 4.4 The Baronet

The phase 3 minion is the `digby` kind spawned by `launch()` in `js/boss.js` exactly as today, with one addition: the spawn spec carries `skin: 'en_baronet'` from the boss table (section 10.6), and `spawn()` copies `spec.skin` onto the entity. The renderer draws `en_baronet` (16x16, frames `peek`, `up`, `spin`: the Baron minion-sized in his spare helmet, with monocle and moustache) wherever it would draw `en_digby` for that entity; the mound, the rise, the budget and the word are the Digby's. Clear: the helmet pops (`fx_helmet`), the monocle flies off (`boss_monocle` as a particle, the Baron's own hit effect), and a small cog (`fx_cogbit`) grows where the daisy grew. Sound family BONK. He appears in phase 3 on every difficulty; on Easy that is the owner's decision 3. The intro cameo (10.1) draws the same sprite from the intro timer and needs no other frame: `up` while he hops across, `spin` as he drops into the hatch.

### 4.5 How a skin is applied

`theme.skins` in the level data maps a kind to what replaces its look:

```js
skins: {
  hoppet: { remap: 'tin' },
  buzzle: { sprite: 'en_glimmer', fx: { fx_flower: 'fx_star' } },
  rock:   { sprite: 'pr_cog' },
  shock:  { sprite: 'pr_rollgear' },
  pick:   { sprite: 'pr_pendulum' }
}
```

`js/render.js` and `js/effects.js` look up `skinFor(entity)`: the entity's own `skin` if it has one, else `theme.skins[kind].sprite`, else `KINDS[kind].sprite`; a remap from the skin is applied under the `white` flash remap. A skin keeps the original's size, frame names, fps and anchor, which a test checks against the manifest (section 13.5; the rows are in Appendix C). `js/hud.js` does not draw entities and needs nothing.

---

## 5. Hazards

No new hazard kind. The hazards are the jump-and-duck half of the game and already use the three input shapes the controls have (tap jump, tap duck, hold duck); a new kind would need a new window rule and new geometry checks, and it would add no typing. Level 2 raises the movement difficulty by layout instead.

| Kind | Level 2 skin | Action, window | Count (of which Medium and Hard only) | Where |
|---|---|---|---|---|
| Narrow gap | `tile_pool` or `tile_dark` below, `tile_girder` when bridged | Jump, as DESIGN 5 | 8 (2) | 72, 232, 452, 680, 688 (M), 696, 704 (M), 846 |
| Wide gap | same | Jump | 6 (1) | 166, 350, 358 (M), 366, 501, 860 |
| Bramble as crystal spikes | `haz_crystal` | Jump | 4 (1) | 266, 494, 509 (M), 756 |
| Branch as low pipe | `haz_pipe`, risers `haz_pipe_riser`, rim `haz_ceiling` | Duck | 5 (1) | 134, 422, 552, 764 (M), 853 |
| Beehive as lantern | `haz_lantern`, chain `haz_chain` | Duck; the 6 px swing is cosmetic as before | 3 | 200, 432, 748 |
| Arch as low tunnel | `haz_tunnel`, columns `haz_column` | Hold duck; HOLD above the chevron, the ENTER keycap on Easy | 1 | 870 |

Level 1 had 11 gaps and 11 hazards; Level 2 has 14 and 13, with three movement beats Level 1 does not have: the rail run (four narrow gaps 8 tiles apart at 680 to 704, two of them bridged on Easy, so the Easy rhythm is jump, run, jump, run and the Medium rhythm is jump, jump, jump, jump), the duck-jump-duck trio at 748, 756 and 764 (8 tiles apart, the closest V3 allows plus 2), and the movement run at 846 to 872 (gap, pipe, wide gap, tunnel in 27 tiles against Level 1's 27 for gap, branch, gap, arch, with the tunnel last so the hold ends the run). Collision boxes, windows, signposts, cues, key prompts, ink arcs and plank-bridge rules are unchanged (DESIGN 5, CONTRACT 5.8), so the `jump-geometry` and `fall-geometry` checks apply as they are.

---

## 6. Collectibles and power-ups

### 6.1 Ink drops

| Pattern | Where | Count |
|---|---|---|
| Row of 4, 2 tiles apart | Tiles 14, 60, 104, 150, 192, 224, 270, 294, 318, 376, 410, 470, 520, 564, 614, 640, 670, 728, 810, 826, 900, 912 | 88 |
| Arc of 5 over each gap (bridged gaps included) | 14 gaps | 70 |
| Row of 3 under each pipe and lantern (5 under the tunnel) | 8 hazards and the tunnel | 29 |
| Total | | 187 (184 on Easy, where the pipe at 764 is absent) |

Every drop can be collected. 187 drops are one extra life from ink with 87 towards the next (84 on Easy), about as Level 1's 153. The three counts were measured today with `TG.Level.build` on the draft file.

### 6.2 Crates

Nine crates, all on every difficulty, in the order met: Bubble shield 142, Pocket Watch 206, Hourglass 374, Red cap 440, Golden quill 668, Pocket Watch 770, Ink blast 816, Red cap 836, Bubble shield 890. Level 1 had seven; the two more are the Pocket Watch's.

A crate's power applies when its word is typed (DESIGN 7), and nothing new appears during a freeze (6.3). So each watch is placed 2 tiles before the words it is meant for: the first before the pair at 208 and 212, the second before the peak that starts at 772. Those words trigger from half a world second later, while the crate's word is still being typed. Measured (8.6): at the moment the crate was cleared, 2 / 2 / 3 threat words were live at the first watch and 2 / 3 / 3 to 4 at the second, on every target and floor run that cleared the crate. One run did not: the Hard floor bot on seed 2 had typed 8 of the second crate's 9 letters when the crate drifted off, in run A and in run B, so 29 of the 30 target and floor runs of each count at the second watch. The fast bot finishes the crate word sooner and had 1 / 1 to 2 / 2 at the first watch and 1 to 2 / 2 / 2 at the second in run A (1 / 2 / 2 in run B). A player who types a watch crate in under half a world second freezes an empty screen. The counts check (13.5) holds the list and asserts that at least one threat is live at each watch crate's `word:clear` for the floor and target bots. A watch crate that is not cleared gives no `word:clear`, so there is nothing to count at: the check reports it as a missed watch and does not fail on it.

### 6.3 The Pocket Watch

| Item | How collected | Effect | While active |
|---|---|---|---|
| Pocket Watch | Type the crate word | The world stops for 3 real seconds while typing goes on at full speed | Everything on screen holds its frame; a tick-tock at 2 Hz; the music sequencer stands still; a 1 px AQUA frame round the playfield on alternate frames; the HUD slot shows the watch with a WHITE gauge running down |

**The simulation rule.** `state.timeScale` is `pace x assist x slow x tutor x finisher` today (DESIGN 3.2). The watch adds a sixth factor, `freeze`, which is 0 while `power.watchT > 0` and 1 otherwise. Each step advances the world clock by `dt x timeScale`, so while the watch runs the world step `wdt` is exactly 0. The `lifeLost` screen is the only place `wdt` is 0 today (`js/game.js` line 299), and it is a narrower case: on that screen `TG.Level.update` and `TG.Boss.update` are not called at all (lines 306 to 311), `updatePlayer` returns before its jump and slide code (`js/entities.js` line 244), and `timeScale` keeps its normal value. Only `TG.Typing.sync`, the input handling, `TG.Entities.update`, the power timers, the tutorial, assist and the camera have run with a zero step (CONTRACT 9.1 steps 4, 5, 8 and 9). The watch is the first time the `playing` screen takes a zero step with `timeScale` 0. The simulation gains one field, `power.watchT`, and five conditions:

| Condition | Where | Why |
|---|---|---|
| The `freeze` factor | `timeScaleOf`, `js/game.js` | Makes `wdt` 0. CONTRACT 11.3 and the `timeScale` comment in 5.1 go from five factors to six |
| No spawn step while `watchT > 0` | `update`, `js/level.js` | Without it `updateSpawns` fires a waiting entry with `retryT` 0 the moment the word blocking it is cleared (lines 532 to 540): it gates on Pip's x and the free slot, and `wdt` plays no part |
| The Hourglass timer is paused | `updatePowers`, `js/game.js` | `slowT` counts real seconds, and a watch should not use up the Hourglass (decision 14) |
| Pip's invulnerability timer is paused | `updatePlayer`, `js/entities.js` | `invulnT` counts real seconds (line 241) and lasts 3.0 / 2.5 / 2.0 s after a hit, which is no longer than the watch. Left running, a watch typed just after a hit would use up the protection, and a word it would have absorbed would hit Pip once the world moved. `hurtT`, which only holds the hurt pose, keeps counting |
| The watch is ended | `continueRun` and `setScreen('bossIntro')`, `js/game.js` | As the Hourglass is ended there |

**Measured today** by emulating the rule in the harness on Level 1 (`timeScale` 0 on `playing` for 180 steps; and a 3 s freeze after every crate but the Hourglass in six floor and target runs, seed 1, with no spawn skip and no invulnerability pause in place): the world held in every frozen step, no hazard cue fired, a buffered jump started on the first moving step, a duck started its slide at once, typed letters counted and paid their stall, and every run finished. In one of the six runs (floor, Medium) a threat spawned inside a freeze, which is the case the skip is for. The skip and the invulnerability pause have not been run. The `watch-freeze` check of 13.5 is the evidence for the rule as a whole. Timer by timer:

| Thing | Clock | During the watch | Why no word reaches Pip sooner |
|---|---|---|---|
| Threat and crate `age`, `stallT`, `t` | world | Hold (they advance by `wdt`) | The budget is untouched and the age is not advanced, so the time left only grows in real seconds |
| The Boulder's and Dangle's `t` (from distance) | Pip's x | Hold (Pip does not move) | The anchor and Pip's x are both fixed, so the distance left is fixed |
| Budgets, queue, spacing and keep-clear for words already live | set at spawn | Untouched | They were computed in world units, which do not move |
| Spawn triggers | Pip's x | Nothing new appears: `TG.Level.update` skips its spawn step while `watchT > 0` (one condition), so a slot freed by a word cleared during the freeze is not filled until the world moves | A spawn after the freeze is placed from Pip's then position with the usual rules |
| Hazard cues and windows | Pip's x | Nothing fires. A jump pressed during the freeze is buffered (`bufferT` is only consumed in a moving step) and happens on the first moving step; a duck pressed during the freeze starts the slide pose at once and its distance is counted when the world moves | Windows are positions, and positions do not change |
| Boss timers (`stateT`, launch gap, taunt window, telegraph), attacks' `dx` | world | Hold. In practice the watch cannot be running in the arena: there are no crates there and a watch still running when Pip reaches the arena is ended on the change to `bossIntro` (the same place that releases the lock) | |
| The finisher | world | Not reachable with a watch running (above) | |
| `eta` of every typable, the urgent flag | derived | `eta = remaining / max(timeScale, 0.01)` (`js/entities.js` line 530, `js/boss.js` line 80), so it is 100 x the world time left at pace 1 (measured: 2.09 s became 209 s): the RED urgent border and the tick pause with the world and return when it moves; `threat:urgent` is not re-emitted (`urgentSent`); the close-call bonus (`eta < CLOSE_CALL_TIME`, `js/game.js` line 397) cannot be earned during the freeze; the lowest-`eta` order used by typing, the HUD tip and the bot is unchanged. The sim's own checks at `test/sim.js` lines 780, 982 and 996 divide by `timeScale` and must not run while a watch is live. Section 14 (decision 16) records the alternative of zeroing `wdt` directly, as `lifeLost` does, which leaves `eta` at its normal value | |
| Pip's jump, slide and fall | world | Hold. A jump or a slide in progress stops in place. A fall already committed stops in mid-air and finishes when the world moves, and the life is lost as it would have been | The watch does not undo a mistake already made |
| Pip's invulnerability after a hit or a shield pop (`invulnT`) | real | Paused (the fourth condition above) | The protection covers the same stretch of the world with or without a watch |
| Hourglass and Golden quill timers | real | The Hourglass timer is paused while the watch runs (the third condition), so a watch never uses up the Hourglass's time; the quill keeps counting, since points are still being scored | |
| Adaptive pacing (`assist`) | real | Moves towards its target as usual; its target cannot drop, because no threat can arrive | |
| Typing, scoring, the clean run, the shield streak, the letter stall | real, per key | As usual. A word cleared during the freeze has a small window use `u`, so it earns the quick bonus and the SUPER popup the scoring already pays (DESIGN 8.3, 8.7) | |
| `animT` of every entity | world | Holds, so every sprite keeps its frame with no extra code; particles and popups (presentation, real time) keep moving | |
| A continue, `bossIntro`, the results screen | | End the watch as they end the Hourglass (`power.watchT = 0` in `continueRun`, and in `setScreen` for `bossIntro`) | |
| A second watch while one runs | | `watchT` is set back to `WATCH_TIME`; the times do not add, as a second Hourglass restarts the first (`applyPower`). The two watch crates of this level are 564 tiles apart, so it does not arise here | |
| The `lifeLost` screen | | The world is already stopped there and letters are still accepted, so a watch crate finished during it starts counting at once and up to 1.0 s of the watch (`FALL_FREEZE`) overlaps the screen. Left as it is: the Hourglass timer behaves the same way today | |

Because every world quantity holds and only real time passes, the moment of contact for every live word moves later in real time by the length of the freeze and never earlier; the arrival points in the world are unchanged, so the keep-clear rule still holds. The bot keeps typing, because its timing uses `state.time`, which is real seconds. The `watch-freeze` sim check states these as assertions (section 13.5).

**What 3 seconds are worth.** One key takes 12 / WPM s (CONTRACT 10.3).

| | Easy | Medium | Hard |
|---|---|---|---|
| Keys in 3 s at the design speed (15 / 30 / 50 WPM) | 3.75 | 7.5 | 12.5 |
| Keys in 3 s at the floor speed (10 / 20 / 35 WPM) | 2.5 | 5 | 8.75 |
| The same as words of the typical length of 8.3 (5 / 6 / 8 letters): design, floor | 0.75, 0.5 | 1.25, 0.8 | 1.6, 1.1 |
| 3 s as a share of that word's base budget (5.4 / 3.3 / 2.55 s) | 56% | 91% | 118% |

In keys the watch is worth least where the player is slowest: most of one word on Easy, a word and a half on Hard. Its other value is the same on every difficulty: every live word arrives 3 real seconds later. One length is kept for all three because the power timers are constants in `TG.C` (the Hourglass is 6 s and the quill 10 s on every difficulty), and a length per difficulty needs a new key in the difficulty table. The owner decided on 2026-10-07 that it is 3 s on all three for M3, with the feel looked at again once the watch can be played (decision 22). The alternative, 4 / 3 / 3, was not taken for M3. On the score, a word cleared in the freeze has a small `u` and earns the quick bonus (x 1.25), so a watch adds the bonus on one or two words; M3 measures it (13.4).

**Constants.** `WATCH_TIME: 3` (real s), `WATCH_SCALE: 0` in `TG.C`. A letter pressed during the freeze types, as always; no letter key gains any other function. `'watch'` joins `POWERS` in `js/level.js` (V5 accepts the crate) and the power names in `applyPower` (`js/game.js`).

**HUD.** The slot shows `pw_watch` with the gauge in WHITE (AQUA is the Hourglass, GOLD the quill): `pw.last = 'watch'`, `power:start { power: 'watch', duration: 3 }`, `power:end`. The pickup popup says POCKET WATCH. How To Play adds the row `{ sprite: 'pw_watch', name: 'POCKET WATCH', text: 'STOPS TIME' }` to `POWERS` in `js/ui.js`; with seven rows the column's pitch goes from 21 px to 18 px so the last row (y 170, 179) stays above the bottom strip at y 192.

**Sound and picture.** `watch_tick` (P12, two 30 ms notes a fourth apart, alternating, every 0.5 s while the watch runs) and `watch_off` (P50 220 to 880 Hz over 200 ms); `power_get` at pickup as for the Hourglass. `TG.Audio` stops the loop sequencer on `power:start` with `watch` and restarts it from the same position on `power:end`, which is what it already does for the pause screen. Reduce flash is not involved: there is no flash.

### 6.4 Other ways to gain a shield or a life

Unchanged: a shield charge every 30 / 50 / 75 correct keys, extra lives at 5,000 / 10,000 / 15,000 points and then every 10,000 / 20,000 / 30,000, every 100 ink drops. A run that continues from Level 1 keeps its ink count towards the next life and its next score threshold, and starts the stage with the difficulty's own lives and no shield charges (12.2, decision 21).

---
## 7. Words

### 7.1 Approach

Keep the five pools of every difficulty and add a flavour named `clockwork` to the three threat tiers of each. The tiers and their letter-set rules are what the select screen promises, and the flavour mechanism already exists: `theme.wordFlavour` names it, `createPicker` concatenates its lists into tiers 1 to 3 (`js/words.js`, the `lists` loop in `createPicker`), and `TG.Words.validate` checks flavour lists against the same rules as the pools, across every list of every difficulty. A wholly new word set would discard the typing progression the tiers encode; keeping only the old set would make Level 2 sound like the meadow. The boss and finisher pools are shared by every level and a flavour cannot add to them (CONTRACT 4.6), so Lady Ratchet's words come from the same lists as the Baron's, narrowed to the top of each range (7.4).

The lists in Appendix A were checked by script against the pools of `js/words.js` as they stand today and run through `TG.Words.validate` with the flavour installed: no problems. Every word is a to z, inside its tier's range, obeys the Easy letter-set rules, is in no other list of any difficulty (the boss and finisher pools included), is spelled the same in British and American English (`oxidise`, `sulphur`, `calliper`, `mould` and `anticlockwise` were left out for that reason), is a base form (no plurals, no `-ed` or `-ing`), and is a word a child may meet in a book about machines or caves. Three words look like plurals and are singular nouns in use: `bellows`, `tongs` and `hydraulics`. Unusual words sit in the Hard tiers, where "long and unusual" is the promise.

Two limits of that check, re-run headlessly today with no problems: `TG.Words.validate` applies the 45-word and 8-first-letter minima of CONTRACT 4.6 to the five pools only and not to flavour lists (`js/words.js` line 399), which is why an empty Easy tier 1 list and a 24-word Medium tier 3 list pass; and it does not check DESIGN 10.1's rules on hyphens, British and American spelling and child-suitability, so those rest on the author's reading. Seven words of the first draft raised questions of that kind (`glowworm`, `clockface`, `buzzsaw`, `zipline`, `pickaxe`, `speleology` and `kerosene`); decision 17 dropped the first four and replaced the other three with `keyhole`, `hydraulics` and `headlamp`. It also replaced `jalopy`, a weak fit for the theme, with `adjust`, and added five 5-letter words to Medium tier 2 (7.2).

### 7.2 Counts

| Tier | Easy | Medium | Hard |
|---|---|---|---|
| Tier 1 | 0 | 32 | 33 |
| Tier 2 | 31 | 35 | 29 |
| Tier 3 | 39 | 24 | 28 |
| Total | 70 | 91 | 90 |

251 words in all, after the swaps of decision 17. Easy tier 1 gets nothing because the theme's home-row words (`ash`, `flag`, `glass`, `flask`, `gas`, `flash`, `hall`, `slash`) are already in Level 1's pools and the one free candidate, `slag`, is too unusual for a beginner; padding the tier would not help. That is why Easy's section 1 opens on tier 2 (section 8): the first words of Level 2 Easy are the E I R T O U words Level 1 reached in its second section, plus Level 1's own home-row words at 30%.

**Length spread.** Each flavour list sits inside its tier's range, and two do not span it: Medium tier 1 is all 5 letters (the range is 4 to 5) and Hard tier 2 is 8 and 9 (7 to 9). Medium tier 2 has both its lengths since decision 17: 30 words of 6 letters and five of 5. The picker takes any word of the chosen tier inside the requested range (CONTRACT 4.6), and with this level's shifts every range in sections 1 to 3 that the base tier can serve includes a length the flavour has (checked by script against the resolved ranges; Easy tier 1 apart, which has no flavour words). In the arena a Medium cog drawn from tier 2 asks for 4 or 5 letters; the five 5-letter words that decision 17 added to Medium tier 2 (`wedge`, `ridge`, `hoist`, `lathe`, `notch`) mean it can draw a flavour word, beside Level 1's 38 tier 2 words of those lengths. Measured over seeds 1 to 100 with the target bot (the stand-ins of run A, 8.6): 118 of 1,600 Medium cogs carry one of the five, which is 12.5% of the 942 cogs drawn from tier 2, and Level 1's tier 2 words are on the other 824 (52% of all the cogs). With tier 1's words, 257 cogs (16%) carry a clockwork word, against 144 (9%) before the swaps. Over the same 100 seeds every Easy and Medium flavour word appeared, and 83 of Hard's 90. The seven that did not are valid and are not drawn in this level: the four 11-letter tier 3 words (Appendix A), and three 5-letter tier 1 words, `rivet`, `pivot` and `ingot`, because Hard's length shift is 1 from the first screen and no Hard request in Level 2 asks for 5 letters.

### 7.3 What each tier teaches in Level 2

| | Easy | Medium | Hard |
|---|---|---|---|
| Section 1 | Tier 2 at 70%: the reaches off the home row that Level 1 only began (GEAR, TOOL, RAIL, LIFT, DIAL), with two words live at once from the first screen, so "nearest word first" becomes a habit | Tier 2 at 50% from the start: the digraph and double-letter words (WRENCH, SWITCH, PISTON, BOILER) one letter longer than Level 1's section 1, with the mixed-tier words still common | Tier 1 at 60% with lengths +1: awkward pairs and clusters at 6 to 8 letters (FLANGE, GYPSUM, SPIGOT), three words live at once |
| Section 2 | Tier 3 at 60%: words with a top-row or bottom-row letter (PUMP, BOLT, VALVE, CRANK, BRASS), lengths +1, so 4 and 5 letters are the norm; Flit teaches tracking a plate across the screen | Tier 3 at 50%: Q X Z J a section earlier than Level 1 (QUARRY, FIZZLE, JANGLE, JOSTLE), three words live from here | Tier 2 and 3 at 50% each with lengths +2: 9 and 10 letter words are the norm (MECHANISM, BLOWTORCH, QUARTZITE), three words live |
| Section 3 | Tier 3 at 80%, lengths +1: ANVIL, TORCH, STEAM, SCREW; the Baron's moles from below and every direction in one wave | Tier 3 at 70%, lengths +2: GEARBOX, CONVEYOR, SPROCKET, MINECART; the peak wave has Flit from behind and the mole from below at once | Tier 3 at 80%, lengths +2 (10 letters, the cap): CRANKSHAFT, ESCAPEMENT, WATERWHEEL, MAINSPRING; four words live, as in Level 1; clusters that reward a steady rhythm over bursts |
| Boss | Weak-point words of 5 to 6 letters from the shared pool (38 fit), finisher of 7 (10 fit); cogs at tier 2 60%, lengths +1 | Weak-point words of 8 to 9 (39 fit), finisher 11 (10 fit); cogs at tier 2 60% | Weak-point words of 10 to 12 (46 fit), finisher 14 to 15 (12 fit); cogs at tier 2 60%, lengths +1 |

### 7.4 Boss and finisher notes

The ranges are moved to the top of each shared pool through the tune block: `coreLen` [5, 6] / [8, 9] / [10, 12] and `finisherLen` [7, 7] / [11, 11] / [14, 15] (Level 1: [4, 6] / [7, 9] / [9, 12] and [6, 7] / [10, 11] / [13, 15]). The counts in 7.3 are the words of those lengths in the pools today, enough for a fight of 3 / 6 / 7 words with no repeat, and the picker's preference for words not yet used in the run (CONTRACT 14.2) means a player who has just come from Level 1 sees different ones. The Medium boss pool holds `monocle` and `molehill`, which are the Baron's; they are left where they are (a cog can carry any word). An optional later change to `createPicker` and `eachList` (which use `THREAT_TIERS` today) would let a flavour carry `boss` and `finisher` lists, so that her weak-point words could be clockwork words too (MAINSPRING, ESCAPEMENT and CHRONOMETER would move there from Hard tier 3, since a word may be in one list only); it is not needed for the level and is not in the plan.

### 7.5 The select screen

The three panels keep their sample words (ASK, FROG, PUPPY; RIVER, BRIDGE, RAINBOW; ZEPHYR, LABYRINTH, SILHOUETTE) and their descriptions. The Easy panel's SHORT WORDS, HOME ROW FIRST still holds for the game as a whole: Level 1 Easy starts on the home row, and Level 2 Easy is reached after it. The STAGE row (section 12) shows the stage's own three sample words when Level 2 is chosen: GEAR, PISTON, CLOCKWORK.

---

## 8. Difficulty

Difficulty is chosen as in Level 1 and sets the same word pools, lives, help features and pace. Level 2 is harder only through the `tune` block of `js/levels/level2.js`, which overrides `TUNABLE` keys of the difficulty table in `js/core.js` (CONTRACT 5.9). CONTRACT 12.1 sets its 25% band for tuning Level 1; the documents set no band for a later level (CONTRACT 5.9, DESIGN 17), and no code or test enforces one: `TG.Level.validate` (V10) checks only that each key is in `TUNABLE`. This plan keeps to 12.1 as a guide, measured against the table in `js/core.js`. Level 1's own tune block is the level before; the table is the base.

- **Timing values** (`react`, `perChar`, `impactGap`, `boss.launchGap`) stay within 25% of the table. Medium `react` sits exactly at -25%.
- **Whole-number values** (`maxActive`, `lenShift`, `wordLen.rock`, `boss.health`, `coreWords`, `rocks`, `coreLen`, `finisherLen`) move by at most 1.
- **`tierMix` is replaced whole.** A section's mix is a distribution, and the band is not applied to it: section 1's tier 1 share goes from 100% to 30 / 50 / 60%, tier 3 enters section 2 from 0, and the arena goes from 60 / 40 tier 1 / 2 to 40 / 60 on every difficulty. 8.2 gives every weight.
- **`boss.minion` on Easy is a Tier 2 switch** (CONTRACT 5.10), turned on by the owner's decision 3.
- **Arrays are written in full.** `tierMix`, `lenShift` and `maxActive` have four, three and four entries, because an array in the tune block replaces the base array whole (`mergeInto` merges plain objects key by key and replaces anything else; checked today, `maxActive: [9]` resolves to `[9]`). `boss.coreWords` sums to `boss.health` on every difficulty.

The bot profiles are not overridden: the floor and target speeds are what the select screen promises.

### 8.1 The tune block as the level file holds it

```js
tune: {
  easy: {
    react: 1.4, perChar: 0.8, impactGap: 2.7,
    maxActive: [2, 2, 2, 2],
    lenShift: [0, 1, 1],
    wordLen: { rock: [3, 5] },
    tierMix: [ { 2: 0.7, 1: 0.3 }, { 3: 0.6, 2: 0.4 }, { 3: 0.8, 2: 0.2 }, { 2: 0.6, 1: 0.4 } ],
    boss: { health: 3, coreWords: [1, 1, 1], rocks: [2, 3, 3], launchGap: [3.6, 3.2, 2.9],
            coreLen: [5, 6], finisherLen: [7, 7], minion: true }
  },
  medium: {
    react: 0.9, perChar: 0.4, impactGap: 1.3,
    maxActive: [2, 3, 3, 3],
    lenShift: [1, 1, 2],
    tierMix: [ { 2: 0.5, 1: 0.5 }, { 3: 0.5, 2: 0.5 }, { 3: 0.7, 2: 0.3 }, { 2: 0.6, 1: 0.4 } ],
    boss: { health: 6, coreWords: [2, 2, 2], rocks: [2, 3, 4], launchGap: [2.0, 1.8, 1.5],
            coreLen: [8, 9], finisherLen: [11, 11] }
  },
  hard: {
    react: 0.55, perChar: 0.25, impactGap: 0.8,
    maxActive: [3, 3, 4, 4],
    lenShift: [1, 2, 2],
    wordLen: { rock: [6, 8] },
    tierMix: [ { 2: 0.4, 1: 0.6 }, { 3: 0.5, 2: 0.5 }, { 3: 0.8, 2: 0.2 }, { 2: 0.6, 1: 0.4 } ],
    boss: { health: 7, coreWords: [2, 2, 3], rocks: [3, 4, 5], launchGap: [1.3, 1.1, 0.9],
            coreLen: [10, 12], finisherLen: [14, 15] }
  }
}
```

No `all` block, no `bot`, no null placeholders. The Easy boss block names `minion` only; `doubleAttack` is already false in the table and is not restated. `wordLen` appears only to raise the rock's range on Easy and Hard (the two new kinds' ranges live in `js/core.js`, section 4.2); `wordLen` is a plain object, so the one key merges and every other kind keeps the table's range. `TG.Level.validate` accepts the block (V10) and `TG.Difficulty.resolve` merges it with no warning: checked headlessly today on the draft file in this form.

### 8.2 Every value against the table

Percentages are relative to `js/core.js`; the Level 1 column is what Level 1 plays with (its tune block for Medium and Hard, the table otherwise).

| Key | Easy: table, Level 1, Level 2 | Medium: table, Level 1, Level 2 | Hard: table, Level 1, Level 2 |
|---|---|---|---|
| `react` | 1.8, 1.8, **1.4** (-22%) | 1.2, 1.0, **0.9** (-25%, at the limit) | 0.7, 0.6, **0.55** (-21%) |
| `perChar` | 1.0, 1.0, **0.8** (-20%) | 0.5, 0.45, **0.4** (-20%) | 0.3, 0.27, **0.25** (-17%) |
| `impactGap` | 3.5, 3.5, **2.7** (-23%) | 1.5, 1.5, **1.3** (-13%) | 0.9, 0.9, **0.8** (-11%) |
| `maxActive` | [1, 2, 2, 2] to **[2, 2, 2, 2]** (+1 in section 1) | [2, 2, 3, 3] to **[2, 3, 3, 3]** (+1 in section 2) | [2, 3, 4, 4] to **[3, 3, 4, 4]** (+1 in section 1) |
| `lenShift` | [0, 0, 1] to **[0, 1, 1]** (+1 in section 2) | [0, 1, 2] to **[1, 1, 2]** (+1 in section 1) | [0, 1, 2] to **[1, 2, 2]** (+1 in sections 1 and 2) |
| `wordLen.rock` (the cogs; the rock spawns only in the arena) | [2, 4] to **[3, 5]** (+1 at both ends) | [4, 5] (unchanged) | [5, 7] to **[6, 8]** (+1 at both ends) |
| `tierMix` sections 1 / 2 / 3 / arena, as tier 1 / 2 / 3 shares | table: 100 / 0 / 0, 30 / 70 / 0, 10 / 30 / 60, 60 / 40 / 0. Level 2: **30 / 70 / 0**, **0 / 40 / 60**, **0 / 20 / 80**, **40 / 60 / 0** | table: 100 / 0 / 0, 30 / 70 / 0, 0 / 40 / 60, 60 / 40 / 0. Level 2: **50 / 50 / 0**, **0 / 50 / 50**, **0 / 30 / 70**, **40 / 60 / 0** | table as Medium. Level 2: **60 / 40 / 0**, **0 / 50 / 50**, **0 / 20 / 80**, **40 / 60 / 0** |
| `boss.health`, `coreWords` | 3, [1, 1, 1] (unchanged) | 6, [2, 2, 2] (the table's value; Level 1 ran 5) | 8, [2, 3, 3] to **7, [2, 2, 3]** (-1, as Level 1 ran) |
| `boss.rocks` | [2, 2, 3] to **[2, 3, 3]** (+1 in phase 2) | [2, 3, 4] (unchanged) | [3, 4, 5] (unchanged) |
| `boss.launchGap` | [4.5, 4.2, 3.8] to **[3.6, 3.2, 2.9]** (-20%, -24%, -24%) | [2.4, 2.2, 1.8] to **[2.0, 1.8, 1.5]** (-17%, -18%, -17%) | [1.5, 1.3, 1.1] to **[1.3, 1.1, 0.9]** (-13%, -15%, -18%) |
| `boss.coreLen`, `finisherLen` | [4, 6] to **[5, 6]**; [6, 7] to **[7, 7]** (+1 at the bottom) | [7, 9] to **[8, 9]**; [10, 11] to **[11, 11]** | [9, 12] to **[10, 12]**; [13, 15] to **[14, 15]** |
| `boss.minion`, `doubleAttack` | false to **true**; false (unchanged). Both by the owner's decision 3 | true, true (unchanged) | true, true (unchanged) |
| Not changed | `letterStall`, `hazardMargin`, `urgentTime`, `shieldKeyStreak`, every other `wordLen` entry, `inFlight`, `telegraph`, `exposeFactor`, `exposeBonus`, `doubleGap`, `bot` | same | same |

The arena cogs are made longer through `wordLen.rock`, not through a fourth `lenShift` entry. The engine would read a fourth entry (`wordRange` in `js/core.js` line 851 applies `lenShift[sectionIndex]` for any numeric index, and the arena spawns with section 3; measured today, `[0, 1, 1, 1]` on Easy gives the rock [3, 5]), but CONTRACT 4.5 and 5.10, DESIGN 9.1 and the comment at `js/core.js` line 839 all describe `lenShift` as three entries with no shift in the arena, and a fourth entry also lengthens the minion's word (Easy Digby [3, 4] to [4, 5], Hard [6, 8] to [7, 9]), which the plan does not want. `wordLen` is a documented key, the rock spawns nowhere but the arena, and +1 at both ends is within CONTRACT 12.1's rule for whole numbers; `test/test-core.js` (line 786) also asserts three `lenShift` entries in the table. The rehearsal of 8.6 ran with this block as it is written here: resolved today, the arena ranges are rock [3, 5] / [4, 5] / [6, 8] and Digby [3, 4] / [5, 6] / [6, 8].

### 8.3 Budgets and window use

Base budget = `react + perChar x length` (nominal s = real s at assist 1).

| | Easy | Medium | Hard |
|---|---|---|---|
| 3 / 5 / 8 letters, Level 1 | 4.8 / 6.8 / 9.8 | 2.35 / 3.25 / 4.6 | 1.41 / 1.95 / 2.76 |
| 3 / 5 / 8 letters, Level 2 | 1.4 + 2.4 = **3.8** / 1.4 + 4.0 = **5.4** / 1.4 + 6.4 = **7.8** (-21%, -21%, -20%) | 0.9 + 1.2 = **2.1** / **2.9** / **4.1** (-11%) | 0.55 + 0.75 = **1.3** / **1.8** / **2.55** (-8%) |
| `perChar` as a typing pace, 60 / (5 x perChar) | 15 WPM (Level 1: 12) | 30 WPM (26.7) | 48 WPM (44.4) |
| Design speed (DESIGN 9.1) | 15 | 30 | 50 |

The per-letter budget now matches the design speed on Easy and Medium and is within 2 WPM of it on Hard; the slack comes from `react`, from the queue and spacing rules and from the keep-clear rule, which are unchanged in kind.

**Window use at the design speed (base budget).** The bot's first key comes after its reaction time and then one key per 12 / WPM s (CONTRACT 10.3), so a word of `n` letters takes `react_bot + (n - 1) x 12 / WPM`:

| | Easy, 15 WPM, reaction 1.0 | Medium, 30 WPM, 0.7 | Hard, 50 WPM, 0.5 |
|---|---|---|---|
| A typical word | 5 letters: 1.0 + 4 x 0.8 = 4.2 s against 5.4: **u = 0.78** | 6 letters: 0.7 + 5 x 0.4 = 2.7 s against 3.3: **0.82** | 8 letters: 0.5 + 7 x 0.24 = 2.18 s against 2.55: **0.86** |
| Level 1, the same arithmetic | 4.2 against 6.8: 0.62 | 2.7 against 3.7: 0.73 | 2.18 against 2.76: 0.79 |

The queue and spacing rules lengthen most budgets, so the measured mean is lower than the arithmetic on both levels. Section 8.6 has the measured values.

**The floor speed.** At 10 / 20 / 35 WPM (1.2 / 0.6 / 0.343 s per key, the floor bot's reaction 1.5 / 1.0 / 0.6):

| | Easy | Medium | Hard |
|---|---|---|---|
| A typical word | 5 letters: 1.5 + 4 x 1.2 = 6.3 s against 5.4 | 6 letters: 1.0 + 5 x 0.6 = 4.0 s against 3.3 | 9 letters: 0.6 + 8 x 0.343 = 3.34 s against 2.8 |
| `assist` needed on the base budget | 5.4 / 6.3 = 0.86 | 3.3 / 4.0 = 0.83 | 2.8 / 3.34 = 0.84 |

All three are above the 0.70 floor of normal play, and the queue and spacing rules give more room than this. But a run starts at `assist` 1.0 unless a saved value exists, and adaptive pacing cannot move before four words have resolved; it then moves at 0.05 per second towards a target that steps by 0.05 to 0.10 per window (DESIGN 9.3). So the first words of the level are played on the base budget. There the floor bot can only make words of `n` letters where `react_bot + (n - 1) x 12 / WPM <= react + perChar x n`: `n` at most 2.75 / 2.5 / 3.2 on these values, against 7.5 / 4 / 4.7 on Level 1's. Level 1 covers its opening with the tutorial tags (1.5 x the budget plus the slow-down on the first three threats), which V6 forbids here. The first two threats of the level therefore carry the intro flag (9.2, 9.3), and the owner has confirmed that (decision 20). Measured with the floor bot over five seeds (run A of 8.6):

| Floor bot, five seeds | Easy | Medium | Hard |
|---|---|---|---|
| No intro flags, started at `assist` 1.0: seeds on which the first threat (Dawdle 20) costs a life | 1 | 5 | 5 |
| No intro flags: lives lost in all | 9 | 8 | 11 |
| With the flags: seeds on which the first threat costs a life | 0 | 0 | 0 |
| With the flags: lives lost in all | 10 | 9 | 8 |
| With the flags, started at the `assist` a Level 1 floor run leaves saved (0.85 / 0.75 / 0.70): lives lost in all | 3 | 1 | 1 |

The flags take the loss away from the first word. The total hardly moves: 10 / 9 / 8 with the flags and 9 / 8 / 11 without, which is one more on Easy and Medium and three fewer on Hard, all inside the spread between seeds. The floor player still has to bring `assist` down, and on Easy and Medium the loss moves to a later word. No run in the table needed a continue. On Medium and Hard the floor player is at or near the 0.70 floor for most of the level, which leaves adaptive pacing little room (the `assist` rows of 8.6; decision 18). The last row is the NEXT STAGE case of 12.2, and a player who has cleared Level 1 on the same difficulty.

### 8.4 Counts, length and the fight

**Threat words per section** (counted today from the draft file by the counts check's own rule: threat spawns tagged for the difficulty, by section):

| | Section 1 | Section 2 | Section 3 | Level | Level 1 | Change |
|---|---|---|---|---|---|---|
| Easy | 13 | 16 | 15 | 44 | 39 (11 / 14 / 14) | +13% |
| Medium | 15 | 19 | 19 | 53 | 47 (12 / 16 / 19) | +13% |
| Hard | 21 | 23 | 22 | 66 | 60 (18 / 22 / 20) | +10% |

Plus 9 crates on every difficulty (Level 1: 7). These are entries in the file; in 59 of 60 rehearsal runs every threat entry was typed or reached Pip. The crates are counted apart: the last crate and one watch crate were missed in some runs (8.6). Why these: Easy keeps about one word every 7 s (44 words over 309 s; Level 1 one every 7.5 s), so a beginner is typing for about half the run; Hard's section 3 has fewer words than its section 2 for Level 1's reason (its words are two letters longer, and with the cap at 4 the rests would otherwise vanish). Hard's step is deliberately the smallest in words; it comes from the third live word in section 1 and from length.

**Running time without the boss.** 928 tiles x 16 = 14,848 px at 64 px per world second = 232 ws, so 232 / 0.75, 232 / 1.0 and 232 / 1.25 = **309 / 232 / 186 s** at assist 1 (Level 1: 293 / 220 / 176).

**Run length with the boss.** Section 8.6 has the measured lengths for both levels; Level 2's target runs are about 15 to 25 s longer than Level 1's. DESIGN 11.2's 366 / 326 / 300 for Level 1 were measured before its tune block shortened the Medium and Hard fights. The real Pocket Watch adds 3 real s for each watch used, so up to 6 s (an estimate; the stand-in adds none). The `length` check of `test/sim.js` is hard-coded to 240 to 420 s today (line 1715); it keeps those bounds for Level 1 and gets 260 to 440 s for Level 2, a harness change like the per-level counts, crates and ink figures (13.5).

**The fight.** Section 10.9 says why it is the length it is; the measured lengths are in 8.6.

### 8.5 How each selection stays itself

| | Not touched (not tunable, except where noted) | What moves |
|---|---|---|
| Easy | Pace 0.75, 5 lives, top-up to 3, key guide, key prompts, hazard cues, auto-release, plank bridge after one fall, two shield charges a crate, 2 to 5 letter words with the home-row-first tiers. The double attack stays off (tunable, and left alone by decision 3) | Time per word -21%; two words live from the first screen (Level 1 section 1: one); tier 2 from tile 0 and tier 3 from section 2; lengths +1 from section 2; the boss throws three cogs in phase 2 and sends the Baron out in phase 3 |
| Medium | Pace 1.0, 4 lives, top-up to 2, cues, auto-release, everyday words | Time per word -11%; three words live from section 2; lengths +1 from the first screen; Q X Z J a section earlier; boss health 6 (Level 1 ran 5), weak-point words 8 to 9, cogs 17% quicker |
| Hard | Pace 1.25, 3 lives, no top-up, no cues, no auto-release, long and unusual words | Time per word -8%; three words live from the first screen (Level 1: two); lengths +1 then +2; weak-point words 10 to 12, finisher 14 to 15, cogs one letter longer and 13 to 18% quicker |

The ordering holds with room. Time allowed per letter, reaction included, for a 5-letter word: Easy 5.4 / 5 = 1.08 s (Level 1 1.36), Medium 2.9 / 5 = 0.58 (0.65), Hard 1.8 / 5 = 0.36 (0.39). Easy on Level 2 is still 1.7 x as generous as Medium on Level 1, and Medium on Level 2 is still 1.5 x as generous as Hard on Level 1. On the keyboard, Easy never leaves the home row plus E I R T O U before section 2; Medium never reaches Hard's letter clusters; Hard is the only selection with four live words. The select screen's WPM guide is unchanged, so its promise still holds.

### 8.6 The rehearsal

The two new kinds and the watch do not exist in the code yet, so the draft level (Appendix B) was run in `test/sim.js` with stand-ins. Everything in this section was measured headlessly on 2026-10-06, on the draft exactly as Appendix B gives it and with the `clockwork` lists of Appendix A installed as they now stand, after the swaps of decision 17 (251 words): seeds 1 to 5 for the target and floor profiles and 1 to 3 for the fast profile, every in-run assertion of CONTRACT 10.3 and 14.2 on. No assertion failed and nothing was printed to the console in any run. The battery was first run with the lists as they were before the swaps (version 0.2 of this plan). It was then run again with the lists as printed, beside a control that put the earlier lists back. The control reproduced the earlier figures exactly, so a figure that differs from version 0.2 differs because of the words. No Easy figure moved, since the Easy lists were not touched. The few figures that were not run again are marked where they appear. Nothing here measures Flit's path or the watch in a whole run; those are measured in M1 to M6 (13.5). A run through both stages was measured with a scratch `nextStage` and is reported after the six speeds below. The plan's measured figures are gathered here, and a section that uses one cites this one.

| Planned | Stand-in | What differs, and which way it bends the figures |
|---|---|---|
| Dangle, 6 / 8 / 11 words | Run A: the Boulder. Run B: the rule of 4.3 in a patched copy of `js/entities.js` (the `anchored` flag, no minimum budget, the drop and the hang, the 8-tile clearance), with `wordLen.dangle` [3, 4] / [5, 6] / [6, 8] and a copy of the harness whose keep-clear assertion knows the wider zone | In run A the Boulder keeps its 4.4 ws minimum budget (5.9 / 4.4 / 3.5 real s at assist 1), which every Dangle base budget but the intro's is under (at most 5.4 / 4.1 / 3.05 nominal s with the section shifts), and its own word lengths [2, 4] / [4, 6] / [5, 9]. Run A is kinder than the real kind will be. Run B has neither difference; the harness's other checks are still the Boulder's there |
| Flit, 5 / 8 / 10 words | The Swoop | The same lengths and letter stall; a different path |
| Pocket Watch, 2 crates | The Golden quill | A crate with no effect on time. The quill doubles points for two extra windows, so scores are a little high; the real watch adds 3 real s per pickup, so runs are up to 6 s short |
| Lady Ratchet | The Baron | The round machine and its timers are the same code; only the look differs |

**Run A: the engine as it is today.**

| Profile | Easy | Medium | Hard |
|---|---|---|---|
| target (design speed, adaptive off): finished, continues, lives lost | yes, 0, 0 | yes, 0, 0 to 1 | yes, 0, 0 |
| target: run length (s); checkpoints at (s) | 384 to 389; 94 / 204 / 310 | 338 to 340; 71 / 154 / 234 | 301 to 304; 56 / 123 / 187 |
| target: mean window use `u` | 0.51 to 0.56 | 0.59 to 0.62 | 0.67 to 0.70 |
| target: boss fight (s) | 69 to 75 | 101 to 103 | 110 to 112 |
| target: score | 43,020 to 64,410 | 55,680 to 72,090 | 69,050 to 82,700 |
| floor (adaptive on, started at `assist` 1.0): finished, continues, lives lost | yes, 0, 2 | yes, 0, 1 to 4 | yes, 0, 1 to 2 |
| floor: lives lost over the five seeds | 10 | 9 | 8 |
| floor: `assist` at the end; its mean over the run | 0.70 to 0.75; 0.75 to 0.82 | 0.70; 0.72 to 0.75 | 0.70; 0.71 to 0.75 |
| floor: the fewest lives held at any moment | 4 | 2 | 1, on 2 of 5 seeds |
| floor: run length (s) | 477 to 513 | 455 to 468 | 401 to 419 |
| floor started at the `assist` a Level 1 floor run leaves saved (0.85 / 0.75 / 0.70): continues, lives lost | 0, 0 to 1 | 0, 0 to 1 | 0, 0 to 1 |
| fast: typable damage, run length (s), score | 0, 368, 68,060 to 71,650 | 0, 312, 80,790 to 98,430 | 0, 267, 112,630 to 127,000 |
| target and floor: runs of 10 with a threat still live at the arena flag | 0 | 1 | 0 |
| threat words live when the first and the second watch crate are cleared, target and floor (fast) | 2 and 2 (1 and 1 to 2) | 2 and 3 (1 to 2 and 2) | 3 and 3 to 4 (2 and 2); the floor bot does not clear the second crate on seed 2 |
| Level 1 by the same script, target: run length (s), `u`, fight (s) | 365 to 370, 0.41 to 0.45, 67 to 71 | 312 to 316, 0.51 to 0.56, 86 to 91 | 285 to 287, 0.61 to 0.62, 103 to 105 |
| Level 1, floor: continues, lives lost, `assist` at the end, its mean | 0, 1, 0.80 to 0.90, 0.90 to 0.95 | 0, 1 to 3, 0.70 to 0.80, 0.79 to 0.83 | 0, 0 to 2, 0.70 to 0.75, 0.78 to 0.82 |
| Level 1: lives and shield charges held at STAGE 1 CLEAR, floor; target (from a start of 5 / 4 / 3 and none) | 9 and 0 to 2; 9 and 2 | 5 to 7 and 0 to 1; 9 and 2 | 5 to 8 and 0 to 2; 8 and 1 to 2 |

How the figures are taken. `u` is the engine's own adaptive-pacing measure (`noteResolved` in `js/entities.js`): `age / budget` for each cleared threat word, the boss's cogs and minion included, and 1.2 (`U_MISS`) for a word that reached Pip. The fight is from `boss:enter` to `boss:defeat`; the results screen comes 4 s later. `test/sim.js` starts every run at `assist` 1.0 (`Session`, line 568), which is a floor player with nothing saved: a new device, a changed difficulty. The saved-assist row was run by passing the start value to `newRun`; the harness gains a `startAssist` option for it (13.5). The flag row counts runs with a `threat:escape` of reason `flee`, or a threat entry that never appeared, at `boss:enter`. The watch row counts the threats alive at the `word:clear` of each watch crate (the quill stand-in at the same tile); a crate that is not cleared has no `word:clear` and is left out. Against version 0.2: on Medium the floor bot's worst seed loses 4 lives where it lost 2, and the five-seed total is the same 9. The three Level 1 rows do not use the flavour; they were run again and are unchanged.

**Run B: with the Dangle rule patched in.** All 30 target and floor runs finish with no continue. Target: lives lost 0 / 0 to 2 / 0 to 1, `u` 0.52 to 0.58 / 0.59 to 0.62 / 0.67 to 0.71, run length and fight within 2 s of run A. Floor: lives lost 1 to 2 / 1 to 5 / 1 to 2 (9 / 14 / 8 over the five seeds), `assist` at the end 0.70 / 0.70 to 0.75 / 0.70, the fewest lives held 4 / 2 / 1 (on 2 of 5 Hard seeds); started at the saved `assist`, 0 to 1 / 0 to 2 / 0 to 1 (4 / 5 / 3 over the five seeds). Fast: no typable damage, scores 71,630 to 72,230 / 99,550 to 110,710 / 112,580 to 140,050. No threat was live at the arena flag in any of the 30 runs. The watch counts are 2 and 2 (fast 1 and 1) / 2 and 3 (fast 1 to 2 and 2) / 3 and 3 to 4 (fast 2 and 2), and the Hard floor bot does not clear the second watch crate on seed 2, as in run A. Dangle itself: 250 spawns in the 30 runs, the shortest budget 2.85 / 3.30 / 2.88 ws, the nearest anchor 193 / 222 / 195 px ahead of Pip, and none nearer than 8.0 tiles to a duck hazard (39 runs, the fast profile included). So the real Dangle rule lifts Easy's `u` by about 0.01 and Medium's by a little under 0.01 and leaves Hard's where it was. It costs the Medium floor bot up to three more lives on a seed (14 against 9 over the five seeds) and the Hard floor bot none (8 and 8). It did not produce a continue.

**The six speeds of LEADERBOARD 5** (60, 90, 150, 220, 400 and 1,000 WPM with perfect accuracy, seeds 1 to 3, Level 2 alone): the highest scores are 75,020 / 130,350 / 216,040 in run A and 75,520 / 131,410 / 216,390 in run B, and the shortest cleared runs 355 / 292 / 247 s in both. Only Medium's highest score moved with the swaps (131,810 before, in run B). Level 1 by the same sample: 61,530 / 107,170 / 171,660 and 340 / 278 / 242 s, close to the 62,480 / 108,160 / 173,530 and 339 / 277 / 241 s of LEADERBOARD 5's 360 runs. Section 12.5 uses these.

**A run through both stages.** No two-stage run can be played in the game yet, so a scratch `nextStage` was written from the table of 12.2 as it stands (the stage's own lives, no shield charges; the score, the clocks and the typing statistics carried) and run with the stand-ins of run B. At the six speeds, seeds 1 to 3, all 54 runs cleared both stages: the highest totals are 141,280 / 246,090 / 396,040 and the shortest cleared runs 695 / 570 / 488 s. That is about 2.3 times the highest Level 1 totals of the same sample, and 3% / 3% / 2% above the two stages played apart and added (137,050 / 238,580 / 388,050), because the multiplier and the streak carry over: the multiplier was 5 at STAGE 1 CLEAR in all 54 runs, where a run from the stage row starts at 1. The target, fast and floor bots were also run through both stages on seeds 1 to 3 and none needed a continue. The six-speed, fast and target runs took 488 to 754 s of play and the floor runs 768 to 918 s. One harness point came out of it. The bot keeps one press record per action id and clears them only on `game:continue` (`test/sim.js` lines 385 and 404), and hazard ids are `h` and a number in every level (`js/level.js` line 394), so after NEXT STAGE the bot did not jump or duck at Level 2's first hazards. Before the scratch harness cleared the records at the step, the 150 WPM Medium bot lost 5 lives and used a continue. The `campaign` option clears them too (13.5). Section 12.5 uses these figures too; M6 and M7 measure again with the real `nextStage`.

**What the rehearsal decided.** Each variant below was run on the same seeds as run A.

- Easy's timing. At react 1.5 / perChar 0.85 / impactGap 3.0 the target bot measures `u` 0.48 to 0.53. At the plan's 1.4 / 0.8 / 2.7 it is 0.51 to 0.56, under 0.55 on three seeds of five. At the edge of the band (1.35 / 0.75 / 2.65) it is 0.53 to 0.59, under 0.55 on one seed of five, with the floor bot ending at `assist` 0.70 on every seed. The floor bot's lives lost over five seeds are 7 / 10 / 10 for the three settings. The plan takes the middle values, and the owner has decided that they stay for M1, with Easy's measured `u` carried as the noted exception to the band (decision 1).
- Hard's fight. At boss health 8 it measures 123 to 126 s; at 7 it is 110 to 112, so the plan takes 7. The owner decided on 2026-10-07 that it stays at 7 (decision 2).
- The Easy minion. With it on, no life was lost in the Easy arena in 20 runs (five target and five floor in each of runs A and B), and the fight is within 1.2 s of its length with it off. The owner has decided that it stays on (decision 3).
- The opening. The intro flag on the first two threats (8.3). The owner has confirmed it (decision 20).
- The last wave. As first laid out (Dangle 894, the Medium Flit 886, the Hard Sprocket 896, the last tile V7 allows), the wave left the Dangle, and on Hard the Sprocket too, still ahead of Pip at the flag and untyped: in all 20 Medium runs and all 20 Hard runs (target and floor, runs A and B). Level 1 has one such case in 30 runs (not counted again: Level 1 does not use the flavour, and its matrix came out unchanged). V7 was met; the wave was too long for the 50 tiles left after the tunnel once the words before it had set its budgets, and moving it up to 6 tiles earlier did not cure it (tried with the earlier lists; those trials move entries from tiles the layout no longer has, so they were not run again). Appendix B now holds a last wave of three entries on every difficulty (the Dangle at 886, the Medium Flit at 840, the Hard Sprocket at 824), and one run in 60 left a threat at the flag. The owner has confirmed it as the layout (decision 20).
- The last crate. The flag row counts threats, and the crate at 890 (Bubble shield) is not one. It is still untyped when Pip reaches the arena flag in 5 of 10 Medium and 8 of 10 Hard target and floor runs in run A, and in 5 and 6 of 10 in run B (3 and 4, and 5 and 7, with the earlier lists). Easy clears it in every run. A crate missed costs no life; the player goes into the fight without that shield charge. The layout is left as it is for M1 (decision 34).
- The watch crates. The second watch was first laid out at 760, 12 tiles before the peak, and the Easy target bot then cleared it with no word live on three seeds of five in run A and four in run B. At 770 the counts are those of the table. The first watch stays at 206. One case is new with the swaps. The Hard floor bot on seed 2 does not clear the second watch crate, in run A or in run B: it is still finishing the word before when the crate appears (a 9-letter word with a window of 5.96 ws), and it has typed 8 of the 9 letters when the crate drifts off at tile 794. With the earlier lists the same run cleared it at `u` 1.00 in run A and 0.98 in run B, so the margin was already nil, and the Hard target bot on that seed clears it at 0.96. It costs no life, but with the real watch that player gets no freeze before the peak. M1 measures it again with the real Dangle and Flit, and M3 with the real watch (decision 18).
- The Hard Dangles. Two Hard entries, at 190 and 536, had base arrival points at the lantern at 200 and the pipe at 552. They are now at 160 and 514 (4.3).
- The floor player's headroom on Medium and Hard. Four changes were tried one at a time, floor bot, five seeds, lives lost in all on Medium / Hard (the plan: 9 / 8). `react` back at Level 1's 1.0 / 0.6: 10 / 10. `perChar` back at Level 1's 0.45 / 0.27: 7 / 11. Hard `maxActive` [2, 3, 4, 4]: Hard 9. No length shift in section 1 (`lenShift` [0, 1, 2] and [0, 2, 2]): 11 / 7, with the mean `assist` at 0.74 to 0.77 / 0.72 to 0.74 and the target bot's `u` at 0.57 to 0.62 / 0.66 to 0.71. No change moved a total by more than 3, which is inside the spread between seeds, and none produced a continue; in each case the Hard floor bot was still down to 1 life on 2 or 3 seeds of 5. No single change is lower on both difficulties. With the earlier lists the last change measured 7 / 8 and looked the most helpful; with the lists as they stand it does not. Both results are inside the spread between seeds. Without the intro flags the last change gave the Hard floor bot a continue on one seed. The plan keeps its values and puts the question in section 14 (decision 18).

### 8.7 Checkpoints, lives and adaptive pacing

Checkpoints at tiles 0, 288, 608 and 928 (V1); the sections are 288, 320 and 320 tiles (Level 1: 256, 288, 336). Lives, invulnerability, top-ups, extra-life thresholds, continue rules and plank bridges are DESIGN 6 and 9.1 unchanged, none of them tunable. A run that continues from Level 1 starts the stage with the difficulty's own lives and no shield charges (12.2, decision 21), and Level 2's checkpoint 0 banks the carried score, so a continue in section 1 returns to it.

Adaptive pacing works as DESIGN 9.3: `assist` scales speed only and never changes the words. Level 2 has no tutorial threats, so the first two threats carry the intro flag in their place (8.3, 9.2); the floor bots' `assist` figures in 8.6 show where a player at the floor speed will sit. The saved `assist` value per difficulty carries across runs and levels as it does today.

---
## 9. Level 2 script: CLOCKWORK CAVERNS

### 9.1 Structure

| Part | Tiles | Name | HUD stage | Look | Music |
|---|---|---|---|---|---|
| Section 1 | 0-287 | LANTERN HOLLOW | 2-1 | Lamplit cave under the Baron's hole: roots through the roof, lantern posts, molehills, pools in the gaps. Palette `lantern` | Level theme, D minor, 140 BPM |
| Section 2 | 288-607 | THE GEAR HALL | 2-2 | A hall of brass: a big turning cog in the mid layer, pipes, the Baron peeking from one of them, pools in the gaps. Palette `brass` | Same |
| Section 3 | 608-927 | CRYSTAL DEEP | 2-3 | A cold crystal cave: AQUA clusters, glow-worm points in the far wall, the Baron's rails, dark chasms. Palette `crystal` | Level theme up 3 semitones (F minor), 148 BPM |
| Boss arena | 928 onward | THE GREAT CLOCK | 2-B | The clock hall: a 48x48 clock face where the moon was, turning cogs for stars, boilers with dials, brass floor plates with the rail. Palette `clock` | Boss theme |

Running time without the boss: 309 / 232 / 186 s at assist 1.0 (section 8.4).

### 9.2 How to read the timeline

- For a threat or crate, the tile is its **trigger**: the entry appears when Pip reaches that tile. Its arrival point follows from its budget (DESIGN 4.1). For a gap or hazard, the tile is its **left edge**.
- Tag E means every difficulty, M means Medium and Hard, H means Hard only. `intro` is the flag of DESIGN 4.1 (1.5 x the base budget). It marks the first meeting with a new kind (Dangle 96, Flit 302) and, in this level, the first two threats (Dawdle 20, Boulder 40). There are no `tutorial` flags: the level has `tutorial: false`, so V6 forbids them and the tutorial slow-down never applies. Level 1 covers its opening with the tutorial budget; here the two intro flags do that work, because without them the floor bot lost a life to the first word on every Medium and Hard seed (8.3).
- Threat words per section and in all are in the table of 8.4: 44 / 53 / 66, plus 9 crates.
- Creatures are named as the player sees them: Glimmer is the `buzzle` kind and Sprocket the `hoppet` kind (4.1).
- One new idea at a time, as Level 1 does it: section 1 brings the spider; section 2 brings the bat, the stepping girders and the boar from behind; section 3 brings the moles, the rail run and the peak from every direction.
- The positions are starting values under the same rule as Level 1's (DESIGN 11.2): an entry may move by up to 6 tiles and a count may change by at most 25%, rounded up, to satisfy the bots, with every change recorded in the file's `Tuning changes` list. The owner has confirmed the two points of the layout that were put to them, the opening's intro flags and the three-entry last wave (decision 20), so the rule applies from M1 on; the moves this plan made after the rehearsal (8.6) are part of the layout.
- Two layout rules are new. A Dangle's trigger is placed so that its arrival point at the base budget is at least 8 tiles from a pipe, a lantern or the tunnel (4.3). A watch crate is placed 2 tiles before the words it is meant for (6.2).

### 9.3 Section 1: LANTERN HOLLOW (tiles 0-287)

Old friends first, then the first threat that waits in the air. Threats from the right and, with Dangle, from above and ahead.

| Tiles | Beat | Entries |
|---|---|---|
| 0-18 | Start | "READY" then "GO!" banner. The rope down the Baron's hole at 2 (`decor_hole`). "TYPE!" board at 8. Ink row from 14 |
| 20-66 | Old friends, two at a time | Dawdle 20 (E, intro). Boulder 40 (E, intro): the opening's two flags (9.2). Glimmer 48 (H). Dawdle 56 (H). Glimmer 64 (E), the first cave native, at head height from the right. Ink row from 60 |
| 70-74 | First jump | Narrow pool at 72 with signpost and ink arc |
| 78-94 | | Sprocket 78 (H) |
| 96-118 | First threat that waits in the air, alone | Dangle 96 (E, intro): the high beep, a top tag while it drops from the roof ahead of Pip, then it hangs at head height on its thread. Ink row from 104 |
| 120-130 | | Sprocket 120 (E) |
| 132-136 | First duck | Low pipe at 134 with signpost and ink beneath |
| 142-160 | First crate | Crate with Bubble shield 142 (E). Boulder 146 (E). Dawdle 152 (M). Dangle 160 (H), which hangs beyond the pool. Ink row from 150 |
| 164-168 | Wide jump | Wide pool at 166 with an ink arc |
| 172-194 | Spider and moth | Dangle 172 (E). Glimmer 178 (E). Ink row from 192 |
| 198-202 | Duck | Swinging lantern at 200 with ink beneath |
| 206-228 | The Pocket Watch, on a pair | Crate with the Pocket Watch 206 (E). Sprocket 208 (E). Dawdle 212 (E). Glimmer 216 (M). The pair triggers while the crate's word is being typed, so the freeze lands on live words and the player sees what the watch does (6.2). Ink row from 224 |
| 230-234 | Jump | Narrow pool at 232 with an ink arc |
| 240-262 | Build | Dangle 240 (H). Sprocket 244 (E). Boulder 258 (E) |
| 264-268 | Jump | Crystal spikes at 266 |
| 270-287 | Small wave | Ink row from 270. Dangle 276 (E). Glimmer 280 (H) |
| 288 | Checkpoint | Flag, banner with WPM and accuracy |

### 9.4 Section 2: THE GEAR HALL (tiles 288-607)

Adds the crossing bat and the boar from behind. Typing and jumping overlap from the stepping girders on.

| Tiles | Beat | Entries |
|---|---|---|
| 288-300 | Rest | Section banner. Ink row from 294 |
| 302-326 | First crossing bat, alone | Flit 302 (E, intro): a top tag, it descends ahead of Pip, crosses over him, the second beep panned left as it turns, hovers behind, dives |
| 328-346 | | Ink row from 318. Boulder 328 (E). Sprocket 334 (E). Glimmer 340 (H) |
| 348-368 | Stepping girders | Wide pools at 350, 358 (M; bridged with a girder on Easy) and 366, each with an ink arc. Platforms of 6 tiles |
| 374-398 | Hourglass and a pair | Crate with Hourglass 374 (E). Dawdle 378 (E). Flit 384 (E). Dangle 390 (M). Ink row from 376 |
| 406-416 | From behind | Truffle 406 (E), the beep panned left; no intro flag, the kind is known from Level 1 and it is alone. Flit 412 (H). Ink row from 410 |
| 420-434 | Two ducks | Low pipe at 422, swinging lantern at 432, ink beneath both |
| 440-456 | Typing in the air | Crate with Red cap 440 (E). Boulder 444 (E), whose word is typed during the jump over the narrow pool at 452 |
| 458-486 | Mixed wave | Glimmer 458 (E). Truffle 462 (E). Dangle 468 (E). Flit 474 (M). Ink row from 470 |
| 492-512 | Movement only | Crystal spikes 494. Wide pool 501. Crystal spikes 509 (M; absent on Easy) |
| 514-544 | Build | Dangle 514 (H). Boulder 518 (E). Sprocket 524 (E). Flit 530 (E). Truffle 542 (M). Ink row from 520 |
| 550-554 | Duck | Low pipe at 552 with ink beneath |
| 560-607 | Section peak | Glimmer 560 (E). Flit 566 (E). Dawdle 572 (E). Truffle 590 (H). Ink row from 564 |
| 608 | Checkpoint | Flag, banner |

### 9.5 Section 3: CRYSTAL DEEP (tiles 608-927)

Adds the Baron's moles from below, the rail run, and waves from every direction with every behaviour of the level.

| Tiles | Beat | Entries |
|---|---|---|
| 608-620 | Rest | Crystal palette; the music lifts 3 semitones. Ink row from 614 |
| 622-642 | The moles, alone | Digby 622 (E): the rumbling mound ahead, a bottom tag, the low beep. No intro flag (known from Level 1), but alone. Ink row from 640 |
| 644-668 | Pair and the quill | Digby 644 (E). Glimmer 650 (E). Flit 662 (H). Crate with Golden quill 668 (E). Ink row from 670 |
| 678-708 | The rail run | Narrow chasms at 680, 688 (M), 696 and 704 (M), 8 tiles apart, each with an ink arc. On Easy the second and fourth are bridged: jump, run, jump, run. On Medium and Hard: four jumps in a row |
| 716-740 | Build | Dangle 716 (E). Truffle 720 (E). Sprocket 726 (E). Ink row from 728. Boulder 732 (E). Digby 738 (M) |
| 746-766 | Duck, jump, duck | Swinging lantern 748. Crystal spikes 756. Low pipe 764 (M; absent on Easy) |
| 770-808 | Peak: every direction, every behaviour | Crate with the second Pocket Watch 770 (E): typed as it appears, it stops the first words of the peak (6.2). Glimmer 772 (E, right). Truffle 776 (E, behind). Flit 780 (E, above and then behind). Digby 786 (E, below). Dangle 792 (M, hanging ahead). Boulder 804 (H). Ink row from 810 |
| 816-828 | | Crate with Ink blast 816 (E). Flit 820 (M). Sprocket 824 (H). Ink row from 826 |
| 832-840 | A long word | Boulder 832 (E) with the longest word of the level for the difficulty. Crate with Red cap 836 (E). Flit 840 (M) |
| 846-872 | Movement run | Narrow chasm 846. Low pipe 853. Wide chasm 860. Low tunnel 870-872 (hold duck; HOLD above its chevron, the ENTER keycap on Easy) |
| 878-890 | Last wave | Truffle 878 (E). Glimmer 882 (E). Dangle 886 (E). Crate with Bubble shield 890 (E). Three threats on every difficulty, so that each is typed or reaches Pip before the flag (8.6; decision 20) |
| 900-927 | Quiet | Ink rows from 900 and 912. Music drops to bass only. "WARNING" flashes for 2 s from 916 (`lengthTiles - 12`) with the engine's rumble. Ground changes to brass plates at 920 (`arenaTilesFrom`) |
| 928 | Checkpoint | Flag. Any threat still active leaves. Boss intro begins |

### 9.6 The validation rules and this layout

The timeline obeys V1 to V11 as `TG.Level.validate` applies them today; the draft file of Appendix B returns an empty list (checked today with `dangle`, `flit` and the `watch` power stood in by existing ones, since V5 reads `TG.Entities.KINDS` and the `POWERS` list of `js/level.js`; as written the file gives 23 problems, all of them V5).

| Rule | How the layout meets it |
|---|---|
| V1 | Sections 0-288, 288-608, 608-928 are contiguous to `lengthTiles` 928; `checkpoints` are [0, 288, 608, 928] |
| V2 | Every gap is 1 or 2 tiles wide; the closest pairs leave 6 tiles of ground (350 to 358 and 358 to 366) and 7 (the rail run); the rule asks for 4 |
| V3 | Jump and duck hazards are at least 6 tiles apart by left edge; the closest are 846 / 853 / 860 (7 apart) and 748 / 756 / 764 (8 apart) |
| V4 | No gap or hazard in tiles 0-11, 288-299 or 608-619 (`CHECKPOINT_CLEAR` 12), and none at or beyond 912: the tunnel's last tile is 872 (the rule is applied to a hazard's last covered tile) |
| V5 | Every spawn kind is in `KINDS` once `dangle` and `flit` exist; every crate's power is in `POWERS` once `watch` is added; every `min` is a difficulty name |
| V6 | `tutorial: false` and no spawn is tagged `tutorial` |
| V7 | The last threat spawn is at 886; the rule allows up to 896 = 928 - 32 |
| V8 | Every arc names a gap, every `under` names a pipe, lantern or tunnel, and no row has a drop over a gap (the rows at 60, 318 and 728 were placed to clear the gaps at 72, 350 and 704, and the row at 912 ends before the brass floor at 920) |
| V9 | The one arch has `w: 3` |
| V10 | The tune block uses only `all`-less difficulty keys from `TUNABLE` |
| V11 | `theme.music` names the level and boss tracks; every section and the arena have numeric `transpose` and `tempo`. The rule does not look at the `ready` key or at `phase3`; the audio test does (13.5) |

---
## 10. Boss: Lady Ratchet

### 10.1 Look and personality

Section 2 gives the parts (six colours plus INK and CREAM on the lenses only), the look and the personality. She faces Pip from behind her engine as the Baron did from behind his mound, built from `boss2_body`, `boss2_arm` (far), `boss2_key`, `boss2_head`, `boss2_arm` (near) and `boss2_engine`, drawn in that order with `bx = boss.x`, `by = boss.y`, `r = boss.rise`:

| Part | Position | Frame |
|---|---|---|
| `boss2_body` | `bx, by - 8 + r` | `b0` and `b1` alternate at 1 fps as the idle and at 4 fps through a taunt (the foot tap); `b1` is held in the finisher (the slump) |
| `boss2_arm` (far) | `bx + 20, by - 26 + r`, `flipX` | as the Baron's far arm |
| `boss2_key` | `bx + 14, by - 30 + r` | `k0` to `k3` at the rate of 10.3 |
| `boss2_head` | `bx - 2, by - 34 + r` | `laugh`, `hurt`, `dizzy` by pose, else `normal`; remap `lampred` when `boss.lampRed`; `white` while `flashT > 0` |
| `boss2_arm` (near) | `bx - 20, by - 26 + r` | `raise` for `raise` and `stomp`; `throw` for `throw`; `watch` while `boss.state` is `taunt`; else `rest` |
| `boss2_engine` | `bx, by` | `shut`; `open` while the hatch is in use (the intro cameo, the minion's exit, the defeat) |

Parts are clipped at `by` as the Baron's are.

**The intro, as fractions `u` of the intro timer** (`boss.stateT / boss.introTime`). The simulation is unchanged: `boss.rise` falls from 40 to 0 over the first half and `boss.pose` is `laugh` from the half (`update` in `js/boss.js`), and `js/hud.js` starts the speech plate at the half. The `ratchet` draw branch follows the table for the long intro, as `introPolish` follows the timer for the Baron's monocle today.

| `u` | At 4 s | What is drawn | Sprites and frames |
|---|---|---|---|
| 0 to 0.25 | 0 to 1.0 s | The cameo. She is hidden: the branch draws her at rise 40 whatever `boss.rise` says. The Baronet crosses from the left edge (screen x -8) to the hatch at `bx` (screen x 296) at a steady 304 px per second, in six hops 6 px high, and drops in | `en_baronet` `up`, then `spin` for the last 0.1 s; `boss2_engine` `open`; `fx_poof` at the hatch |
| 0.25 to 0.5 | 1.0 to 2.0 s | The hatch bangs shut, the engine shakes by 1 px, steam puffs, and she rises: rise 40 x (1 - (u - 0.25) / 0.25), which meets `boss.rise` at 0 | `boss2_engine` `shut`; `fx_poof` |
| 0.5 to 0.7 | 2.0 to 2.8 s | She lifts her goggles and winds her key three clicks. The speech plate starts typing | Near arm `raise` with `boss2_goggles` in the hand; head `normal` although the pose is already `laugh`; `boss2_key` a quarter turn per click; `click` three times |
| 0.7 to 1 | 2.8 to 4.0 s | She laughs | Head `laugh`, the goggles back on her brow |

After a continue the intro is 1.5 s (`BOSS_INTRO_SHORT`) and plays without the cameo and the goggles: she rises over the first half as `boss.rise` gives it and laughs over the second, as the Baron's short intro does. The speech plate then has 0.75 s. At the HUD's 30 letters per second it would show 22 of the 27 letters, so `drawSpeech` types at `max(30, letters / (introTime / 2))` per second: one line, and both of Level 1's intros stay at 30 (20 letters).

### 10.2 Arena

THE GREAT CLOCK, stage 2-B, palette `clock`, `arenaTilesFrom` 920. Flat brass floor with the rail strip, no gaps, no crates, no ink. The ground keeps scrolling and she stays `BOSS_DX` (200 px) ahead of Pip, facing him. The clock face ticks in the sky, the cog "stars" turn, and the hall changes colour once per phase (section 3.1). `keyOk` root 7 minor (G minor pentatonic).

### 10.3 The key

`boss2_key` turns at a rate that tells the player where she is: 1 turn per second in phase 1, 2 in phase 2, 4 in phase 3; during a telegraph 8 turns per second (the tell, with the three clicks); still during `recoil` and `laugh`; backwards during the finisher, one quarter turn per letter typed (10.7). Presentation only, from `boss.phase`, `boss.state` and the letter events.

### 10.4 Health bar and the gauge

| Element | Position |
|---|---|
| Label | `state.level.boss.label` ("RATCHET"), WHITE, at `x = 280 - 8 - 8 x length`, y 23: 216 for seven letters, and 232 for BARON, where it is today. The INK box behind the label starts 4 px before it, `rect(x - 4, 20, 380 - (x - 4), 11)`: `rect(212, 20, 168, 11)` for RATCHET and today's `rect(228, 20, 152, 11)` for BARON. The 16 px it gains lie over the top rows of the playfield at x 212 to 227, where the HUD draws nothing else in the arena. BARON is the default, so Level 1 draws exactly as now |
| Bar | x 280 to 376, y 24 to 29, one segment per weak-point word, RED with a CORAL highlight, lost segments SHADOW: unchanged |
| Boss plate | Centred at x 192, top at y 34: unchanged |
| The boiler gauge | A 10 px dial on the left of `boss2_engine`, at `bx - 18, by - 10`. The renderer draws its needle from `boss.volley.hits / boss.volley.toLaunch.length`: it rises one notch per cleared cog, and when every entry of the volley was cleared it points full and the whistle gives a short toot as the taunt opens. This is Level 1's hidden rule made visible: the weak-point window is 1.5 x the word's base budget, plus 2.0 nominal s when every entry of the volley was typed (`exposeBonus`, `openWeakPoint` in `js/boss.js`). The needle turns RED while a taunt window is open and falls back to zero at the next volley |

The toot: `TG.Audio` plays `toot` on `boss:weakopen` when `state.boss.volley.hits >= state.boss.volley.toLaunch.length` (it already reads `TG.Game.state` for the urgent tick and the phase 3 tempo), 0.3 s after `boss_laugh` where `boss_weak` plays today, and `boss_weak` is left out that time so the two do not stack.

### 10.5 A round

Each round runs in this order. All timers are on the world clock, so adaptive pacing and the Hourglass affect them. Nothing in this table is new code; the states, their order and their timers are `js/boss.js` as it is.

| Step | What happens | Player action |
|---|---|---|
| 1. Volley | She flings cogs from the engine, each with a word: the `rock` kind on the rock's arc, drawn as `pr_cog`. The normal budget rules, the cap on cogs in flight (1 / 2 / 3) and the launch gaps of 8.1 apply. The gauge needle rises per cleared cog | Type each cog's word. A cleared cog flies back and clangs off the engine (the rock's return path). An untyped cog lands on Pip at `t = 1` and costs a life; like every typable threat it cannot be dodged |
| 2. Telegraph | Three ratchet clicks as her key spins at 8 turns per second, the near arm up with the spanner (`raise`), the floor dashes flash as today, for the telegraph time (1.4 / 1.0 / 0.7 nominal s) | Get ready |
| 3. Attack | A gear rolls along the floor (`shock` as `pr_rollgear`), or the pendulum swings across at head height (`pick` as `pr_pendulum`). No word | Jump the gear. Duck the pendulum |
| 4. Taunt (exposed) | She taps her foot, checks her pocket watch, the lenses flash, and a weak-point word appears on the boss plate. Window 1.5 x the base budget, plus 2.0 nominal s if every cog of the volley was cleared (the gauge says which) | Type the word. Each letter makes her flinch and flashes the health bar |
| 5a. Hit | Word complete: health -1, the goggles pop off, she loses count ("1..." popup) and recoils for 0.8 ws | |
| 5b. Miss | The window ends: she cackles and the next round begins. No life is lost. The next taunt uses a new word. Adaptive pacing counts a missed word | |

### 10.6 Level data and the boss table

The level file holds what is hers:

```js
boss: {
  kind: 'ratchet',
  label: 'RATCHET',
  speech: 'TICK TOCK! WORDS INTO COGS!',
  tips: { shock: 'JUMP THE GEAR', pick: 'DUCK THE PENDULUM' },
  minionSkin: 'en_baronet'
}
```

`js/boss.js` reads `boss.kind` already (`create`) and gains one line: `launch()` passes `skin: state.level.boss.minionSkin` in the minion's spawn spec when the level has one (4.4). The presentation modules key everything Baron-specific on `boss.kind` through one table each with `baron` as the default, so Level 1's data needs nothing: `js/render.js` (the parts and offsets of 10.1, the intro gesture, the defeat), `js/effects.js` (the goggles for the monocle on `boss:hit`, the key for the helmet on `boss:defeat`, the cog rain and the flakes, the "1..." popup), `js/hud.js` (the label and the tips: "TIP: JUMP THE GEAR" and "TIP: DUCK THE PENDULUM" from `boss.tips`, with the Baron's two lines as the defaults), `js/audio.js` (the sound variants of section 11.3).

### 10.7 Phases, the finisher and the defeat

| Phase | Health range (E / M / H) | Volley | Physical attack | Other |
|---|---|---|---|---|
| 1 | 3 / 6-5 / 7-6 | Cogs from the right: 2 / 2 / 3 per volley | The rolling gear | Lenses CREAM; the key at 1 turn per second; the hall PLUM |
| 2 | 2 / 4-3 / 5-4 | 3 / 3 / 4 per volley; the second cog is flung high and falls from above with a ground marker (the `rockhigh` path) | The gear and the pendulum alternate between rounds, opening with the pendulum (the existing `nextAttack` rule) | Lenses RED (`lampRed`); the key at 2 turns per second; the furnace glow rises up the walls (PLUM dithered MAROON) |
| 3 | 1 / 2-1 / 3-1 | 3 / 4 / 5 per volley; the last entry is the Baronet from below on every difficulty (`minion: true` on Easy through the tune block, by the owner's decision 3; the Digby model, so no extra words) | Easy: alternating. Medium and Hard: gear then pendulum 1.2 / 0.9 nominal s apart (`doubleAttack` as the table has it; off on Easy, by the same decision) | The key spins without stopping (4 turns per second); steam from the engine each round; the hall goes dark (INK dithered PLUM); 176 BPM with pulse 2 up an octave |

**Phase change.** 2.0 ws with no attacks. She stamps, dust falls from the roof and the hall takes its next colour (the existing `boss:phase` effect and the palette's `phases` entry).

**Finisher.** When health reaches zero she is wound down rather than dizzy in the Baron's way: slumped over the engine (the `dizzy` head, the body's `b1` held), stars circling, the key turning slowly backwards. One finisher word appears on the boss plate with no timer. The world runs at 25% and nothing attacks. Each letter is a visible crank of the key the wrong way with a click (`click`, 11.3): the key steps back one frame per letter from the `type:hit` event, presentation only. Completing it defeats her.

**Defeat.** Section 2: freeze, flash, the key shoots out, the goggles fly, the hatch bursts and the letter fountain erupts from the engine, she is launched up out of the top of the playfield spinning, cogs rain and bounce, and WHITE flakes drift down through the shaft during the victory pose. `boss.rise` still goes from 0 to 40 in the last second of `levelComplete` (the simulation's defeated state is unchanged); the `ratchet` draw branch ignores `rise` once she has left the screen. Victory fanfare, then the results screen with "A COLD WIND BLOWS DOWN THE SHAFT." under STAGE 2 CLEAR!.

### 10.8 Physical attacks and what the player does

| Attack | Entity | Box, speed, window | Player | Tell |
|---|---|---|---|---|
| Rolling gear | `shock`, drawn as `pr_rollgear` 16x8 | 16x8 at the floor, `ATTACK_SPEED` 160 px/ws, jump when `eta` is 0.05 to 0.45 ws (`SHOCK_WIN`) | Jump | The clicks, the fast key, the floor dashes; `boss_stomp` (a `ratchet` variant: a gear clunk) when it starts |
| Pendulum | `pick`, drawn as `pr_pendulum` 16x16 | 16x16 at head height (`elev` 14), 160 px/ws, duck when `eta` is 0.05 to 0.60 ws (`PICK_WIN`) | Duck (a tap) | The same, with the near arm raised |

Boxes, speeds, windows, the hitbox inset and the `nextAction` rule are Level 1's, so `jump-geometry`, `no-dodge-actions` and the Checker's `announce` assertion apply unchanged. Contact with either costs a life as a hazard does; a shield charge absorbs it. The fight asks for the three actions Level 1 taught (type, jump, duck) and adds none (decision 26).

### 10.9 Expected duration

The measured fight lengths are in 8.6, taken from `boss:enter` to `boss:defeat`; for the fight the only stand-ins are the boss's and the minion's look. The results screen comes 4 s after the defeat. Why the fight is that long: 3 / 6 / 7 weak-point words at about 24 / 17 / 16 s per round (volley, telegraph, attack, taunt, recoil), with Medium's sixth word and Hard's one-letter-longer cogs and words offset by launch gaps 13 to 24% shorter. Hard runs health 7, as Level 1 did: health 8 is about 13 s longer, and the owner decided on 7 on 2026-10-07 (decision 2). On Easy the minion replaces one cog of the one phase 3 volley and leaves the length as it was. After a continue the fight restarts at the phase reached, as today.

### 10.10 What reuses `js/boss.js` and what is new

| Reused as is | New |
|---|---|
| `create`, `enter`, `update`, the state table, `phaseStartHealth`, `phaseForHealth`, `volleyFor`, `attacksFor`, `launch` (the `rock`, `rockhigh` and `minion` entries, the `digby` kind for the minion), `openWeakPoint` with its window rule, `openFinisher`, `onWordComplete`, the adaptive bookkeeping, every event and payload, every constant | One line in `launch()` for the minion's skin. In the presentation: a `ratchet` branch of `drawBoss` and `drawDefeat` (about 150 lines in `js/render.js`), the effects of 10.6 (about 60 in `js/effects.js`), the label and tips from level data (about 10 in `js/hud.js`), the sound variants and the phase 3 tempo from the arena's music data (about 40 in `js/audio.js` plus the track), the sprites of section 2 |

Nothing dies, a wrong key never costs a life, and slow typing costs only time: a missed window costs the round, as in Level 1.

---

## 11. Music and sound

### 11.1 Tracks

Both are note text in `js/audio.js` in the existing format, and both names go into `TRACK_NAMES` there and into the copy in `test/test-audio.js` (line 62), which checks that the two lists agree.

| Track | Name | Tempo, key, length | Pulse 1 | Pulse 2 | Triangle | Noise |
|---|---|---|---|---|---|---|
| `level2` | "Clockwork Caverns" | 140 BPM, D minor, 32-bar AABA loop (about 55 s). Section 3: up 3 semitones (F minor), 148 BPM | P50 lead with vibrato on held notes: a stepping, dotted tune over Dm, Bb, C, Am (A part) and Gm, Bb, C, Dm (B part), ending each A on a held D | P12 ticking ostinato in 8ths on the root and fifth, the escapement; 16th arpeggios in the B part | Walking quarters on the roots with octave jumps | A hat on every 8th as a tick, the accented hat on the off-beats, kick on 1 and 3, snare on 2 and 4, a rim fill every 8th bar |
| `boss2` | "The Great Clock" | 160 BPM (176 in phase 3), G minor with a flattened second (Ab, marked `!`), 16-bar loop | P12 staccato riff in 16ths over a G pedal, the Ab giving the same edge the Baron's F natural gives | P50 ticking ostinato G3, G4 in 8ths; up an octave in phase 3 | G, Ab!, Bb, Ab! in 8ths, the shape of the Baron's E, F, G, F line | Kick on every beat, the combined hit on 2 and 4, a tick on every off-beat 8th, a roll every 4th bar |

Jingles: `jingle_checkpoint`, `victory`, `results` and `gameover` are reused. `jingle_ready` is fixed note text in G major, the key of Level 1's theme (`js/audio.js` line 334), and `TG.Audio.jingle` adds the section's transpose and nothing else, so here it would play in G major ahead of a D minor loop. Level 2 gets two bars of its own on the D minor triad, in the rhythm of the original:

```js
jingle_ready2: {
  name: 'Ready 2', bpm: 140, key: 'D', mode: 'minor', beats: 4, bars: 2, loop: false,
  p1: { wave: 'p50', gate: 0.8, text: '/2 ' + bars(['D5 D5 D5 - F5 F5 F5 -', 'A5 A5 -:4 D6:8']) },
  p2: { wave: 'p25', gate: 0.8, text: '/2 ' + bars(['F4 F4 F4 - A4 A4 A4 -', 'D5 D5 -:4 F5:8']) },
  tri: { gate: 0.9, text: '/8 ' + bars(['D2 D2', 'A2 D2']) },
  noise: { text: '/4 ' + bars(['k s k s', 'k s k:8']) }
}
```

The level names it as `theme.music.ready`, and `onLevelStart` plays that track when it is a known one and `jingle_ready` otherwise (about 5 lines; Level 1 is unchanged). With section 3's transpose it plays in F minor after a continue there, as the loop does. The name joins `TRACK_NAMES` and the audio test's copy. It is Tier 2: left out, the G major jingle plays (decision 24).

### 11.2 Per section

| Part | `transpose` | `tempo` | `keyOk` |
|---|---|---|---|
| Sections 1 and 2 | 0 | 140 | root 2, minor (D minor pentatonic from D5) |
| Section 3 | 3 | 148 | root 5, minor (F minor pentatonic) |
| Arena | 0 | 160; `phase3: { tempo: 176, p2Octave: 12 }` | root 7, minor (G minor pentatonic) |

Sections 1 and 2 share one setting, as Level 1's do, so the 55 s loop plays unchanged for about 200 / 150 / 120 s. That is deliberate: the lift is held back so that it marks the change of light at Crystal Deep. Decision 23 gives the alternative of a small step in section 2.

In a minor mode the reward sounds (`word_clear`, `streak`, `checkpoint`, `one_up`, `ink_drop`) keep C, as CONTRACT 7.3 says; only `key_ok` follows the scale. The phase 3 change is hard-coded to 184 BPM and an octave in `js/audio.js` today (`bossOpts`, line 1531, and the `boss:phase` handler, line 1795); both read `arena.music.phase3` with `{ tempo: 184, p2Octave: 12 }` as the default, so Level 1 is unchanged. V11 does not check `phase3`; the audio test does.

### 11.3 Sound effects

New names in `SFX_NAMES` (and the audio test's copy):

| Name | Trigger | Recipe |
|---|---|---|
| `watch_tick` | Every 0.5 s while the Pocket Watch runs | P12, two 30 ms notes a fourth apart, alternating tick and tock |
| `watch_off` | `power:end` with `watch` | P50 220 to 880 Hz over 200 ms |
| `toot` | `boss:weakopen` after a fully cleared volley (10.4) | P25 G5 for 120 ms with NZ-L 60 ms, then a fall to D5 over 80 ms: a steam whistle |
| `click` | Each of the three telegraph clicks; each letter of the finisher | P12 1200 Hz, 15 ms |

Variants of existing boss sounds, chosen by `state.level.boss.kind` as `warn` chooses by `from` (the Baron's recipes are unchanged):

| Name | `ratchet` variant |
|---|---|
| `boss_laugh` | A brisk high cackle: P50 C5 D5 E5 D5 C5 at 40 ms on and 30 ms off |
| `boss_telegraph` | Three `click`s 120 ms apart, then a P12 440 Hz whirr pulsing at 20 Hz for the rest of the telegraph time |
| `boss_throw` | A spring: P25 300 to 900 Hz over 80 ms |
| `boss_stomp` | A gear clunk: NZ-L 80 ms at low rate plus TRI 90 Hz 60 ms |
| `boss_hit` | NZ-L 100 ms, a glass tink (P12 2093 Hz, 200 ms decay) and a gear clatter (NZ-S 120 ms) |
| `boss_defeat` | A winding-down whirr (P50 600 to 60 Hz over 1.2 s with a 10 Hz tremolo), then SPROING (P25 200 to 1600 Hz over 120 ms), then 0.5 s of silence |

Music changes that follow the game, as DESIGN 15.3 with two additions: the Pocket Watch stands the sequencer still and restarts it (the pause screen's calls); the boss phase 3 tempo comes from the level data.

---

## 12. Keeping players coming back

### 12.1 The progression model

One run can be two stages: the score carries from the first into the second, as in an arcade game.

```
howToPlay (READY) -> playing (Level 1) ... -> results "STAGE 1 CLEAR!"
                                                  |  Enter: NEXT STAGE   -> playing (Level 2) ... -> results "STAGE 2 CLEAR!" -> highScoreEntry -> title
                                                  |  Esc:   TITLE        -> highScoreEntry -> title           (the run ends here, as today)
difficultySelect (STAGE 2 on the stage row) -> howToPlay (READY) -> playing (Level 2) ... -> results "STAGE 2 CLEAR!" -> highScoreEntry -> title
```

NEXT STAGE continues the same run, and a run is entered once, when it ends. There is one world board for each difficulty (decision 6), and the plan keeps one table on this computer for each as well, so the initials screen, the table entry and the world submission come at the end of the run, wherever that is, with the run total. TITLE at STAGE 1 CLEAR ends the run there, as today. The choice is on the results screen's bottom strip: "ENTER: NEXT STAGE   ESC: TITLE" when the stage was cleared and `TG.Levels[levelId + 1]` exists, and the footer of today otherwise. One line above the strip says what the choice means: "THE SCORE IS ENTERED WHEN THE RUN ENDS". It is there because Enter after a cleared Level 1 leads to the initials screen today, and from this release the same key starts Level 2. The results tally runs first as today; Enter during the tally still finishes the tally.

**The keys on the strip.** Today the results screen acts on every confirm key, and Space and the jump key are confirm keys (`KEY_ACTIONS` and `updateResults` in `js/ui.js`). NEXT STAGE takes Enter only, as the initials screen does (`updateEntry`): Space and the jump key finish the tally and turn the page as today, and do nothing on the strip. Esc is new on this screen. It is read only where the strip is shown, on the last page once the tally has finished, and it leads where Enter leads today: to the initials screen when the run has an entry to make, and to the title otherwise. On the initials screen Esc means that the score is not sent (`declineEntry`), as its footer says. A second Esc pressed straight after the first is ignored there by `ENTRY_LOCK` (0.5 s), which is in force whenever Esc has a meaning on that screen, and `TG.Input` drops auto-repeat, so a held key is one press.

### 12.2 What NEXT STAGE carries

`TG.Game.nextStage()` is new in `js/game.js` and is the only way into Level 2 from Level 1 (`newRun({ difficulty, levelId: 2 })` is the only way in from the menus). It does not call `emptyState()`: it builds the new level, picker, player, items and checkpoint onto the state of the run, as `continueRun` does. Like `newRun` it sets `screen` itself and emits its own events, so adding `playing` to `TRANSITIONS.results` (and to the copy of the table in `test/test-ui.js`) keeps `canGo` and CONTRACT 9.1 true; it is not what makes the step possible. It has no part in the world scores: the run token asked for at the difficulty screen is still held, and the only request at NEXT STAGE is the daily count of a stage started (12.5).

| Group | Kept from the run | Reset for the new stage |
|---|---|---|
| Score and lives | `score` (it already holds Level 1's end-of-stage bonuses, which `buildResult` adds before the results screen), `ink` (towards the next life), `inkTotal`, `nextLifeAt` | `player.lives` to the difficulty's own (5 / 4 / 3) and `power.shield` to 0, as a run from the stage row starts (the rule below) |
| Clocks | `time`, `frame` and `worldTime`. `time` is the typing clock and becomes `result.time`, which the service checks against the token's age and the points allowed per second (LEADERBOARD 5, checks 8, 10 and 11) | |
| Statistics | `typing` (every statistic, the streaks, the multiplier), `run.continues`, `run.livesLost`, `run.falls`, `run.hits` and the other `run` counters (`damageTypable`, `damageOther`, `threatsCleared`, `threatsMissed`, `cratesCleared`, `cratesMissed`), `run.stages` (the stages the run has cleared, 12.5), `run.bestWpm` and the new `run.bestScore` (the bests of the difficulty as `newRun` read them when the run started; STAGE 1 CLEAR has since written this run's first stage into the save, so a second read would compare the run with itself), `assist`, `assistTarget`, `adaptive`, `adapt`, `seed` and `rng` (the same generator continues), `nextId`, `difficulty` | `TG.Typing.sectionReset` and `run.sectionLivesLost` 0, `run.bonuses` empty, `result` null, `run.cleared` and `run.ended` false, `run.stageScore` = the carried score (for the results screen's STAGE 1 SCORE line), `run.stageStart` = the carried `time` (for the stage's own time in the daily count) |
| Level state | | `levelId` 2, `config` from `TG.Difficulty.resolve(difficulty, TG.Levels[2].tune)` (the same pace), `level` built from the new data, a new `picker` with the new flavour (its recent list empty), a new `player` at Level 2's checkpoint 0, `camera`, `entities` empty, `items` from the new level, `checkpoint` index 0 of Level 2 with the carried `score`, `ink`, `inkTotal` and `nextLifeAt` banked, `boss` null, `section` 0, timed powers ended (`slowT`, `quillT`, `watchT`, `power.last`), `lifeLost`, the tutorial off |

**Each stage starts with the difficulty's own lives.** Level 1 pays lives out freely: its bots end the stage holding 9 / 5 to 7 / 5 to 8 lives at the floor speed and 9 / 9 / 8 at the design speed, from a start of 5 / 4 / 3, and most hold two shield charges (8.6). Carried over, a run through NEXT STAGE would play Level 2 with about twice the lives of a run from the stage row, on the same board, and with more lives than Level 1 itself began with. The LIVES bonus (1,000 a life at the end of each stage) would also pay for the same lives twice. So `nextStage` leaves the new player at `config.lives`, as `createPlayer` makes it, and sets `power.shield` to 0. The lives held at STAGE 1 CLEAR have been paid for by that stage's bonus. Every figure of 8.6 was measured from this start, so it holds for both ways into Level 2; the saved-`assist` row there is the NEXT STAGE case for the floor player. The owner decided this rule on 2026-10-06 (decision 21). The alternatives were to carry everything, or to carry up to a cap.

Three entries of the table are there because the code needs them. The checkpoint banks all four values because `continueRun` restores all four (`js/game.js` lines 250 to 253): a checkpoint built as `newRun` builds it would put `nextLifeAt` back at the first threshold, and the loop in `addScore` would then pay a life for every threshold between there and the carried score on the first points after a continue. The section counters are reset because the first Level 2 checkpoint's accuracy and no-damage bonuses read them (`passCheckpoint` in `js/level.js`), and they would otherwise still hold Level 1's arena. The clocks are kept because a run total sent with a Level 2 stage time would fail check 10.

Events, in order, as `newRun` emits them: `screen:change` (`results` to `playing`), `level:start` with `levelId: 2`, `continued: false` and Level 2's `music`, `section:enter` 0. `TG.Audio` plays `level2` and the level's ready jingle (11.1) from these as it does for a new run; `TG.Hud` and `TG.Effects` reset on `level:start` as today. A continue in Level 2 returns to a Level 2 checkpoint with the Level 2 banked score and the starting lives of the difficulty, exactly as a continue works today.

Measured today with a scratch `nextStage` of about 35 lines written from this table, and a copy of Level 1 standing in for Level 2 (fast bot, Medium, seed 3): Level 1 cleared at 64,860 with 9 lives; the step emitted exactly the three events above and banked 64,860; a forced game over and a continue returned to 64,860 with 4 lives and the typing statistics unchanged; the second stage then cleared at 141,940 with the LIVES and ACCURACY bonuses and no NO CONTINUES bonus, rank B, a run time of 652 s and no console output. So the bonuses and the run time need no stage accounting. The rank needs one thing, a count of the stages the run has cleared, so that pressing NEXT STAGE does not cost a letter (12.5). That scratch step was written before the rule on lives and carried the 9 lives across. A second one, written from the table as it stands with the stage's own lives, gave the two-stage figures of 8.6.

### 12.3 The STAGE row and the unlock

Once Level 1 has been cleared on any difficulty on this computer (one of the three `cleared` settings of 12.6 holds 1 or more), the difficulty select screen shows a row under the three panels: "STAGE 1  QUILL MEADOWS" or "STAGE 2  CLOCKWORK CAVERNS", changed with Up and Down (today Up and Down duplicate Left and Right there), remembered as `settings.lastLevel`, with the stage's three sample words (7.5) under its name. It shows no best of its own: there is one best score and one best WPM for each difficulty (12.6). Left and Right still choose the difficulty and typing EASY, MEDIUM or HARD still confirms. Before the unlock the screen is exactly as it is now. The unlock is global (decision 5): a child who cleared Easy can see the caverns on Easy. How To Play is reached as today and its bottom line stays "TYPE READY TO START"; typing READY calls `newRun({ difficulty, levelId: settings.lastLevel })`. The first time Level 1 is cleared on this computer, the results screen adds the line "STAGE 2 UNLOCKED: CLOCKWORK CAVERNS". `setupResults` reads the three `cleared` numbers before it calls `recordRun`, which raises them, so that it knows whether the clear is the first. A player who cleared Level 1 before this release is unlocked from the dated entries in the tables (12.6) and does not see the line. One whose earlier clears left no such entry sees the row, and the line, after the next clear of Level 1.

### 12.4 Results and title

The results screen already prints "STAGE N CLEAR!" from `result.levelId` (`js/ui.js`, `drawResults`). For a run that reached Level 2 it adds: a STAGE 1 SCORE row (the score carried in, so the player sees the split), the SCORE row as the run total with its bonuses, the hook line under the title after STAGE 2 CLEAR!, and the NEXT STAGE / TITLE strip with its line (12.1) after STAGE 1 CLEAR!. The end-of-level bonuses (lives, accuracy, no continues) are paid at the end of each stage as today, for the run's lives, accuracy and continues at that moment. Rank is the run's (DESIGN 8.6), worked out over both stages, and S and A need the run to have cleared a stage (12.5; decision 28).

The title's story panel holds one premise at a time. Its text starts at y 40 with a 12 px pitch, and Pip at double size and the Baron stand from y 110 down; Level 1's premise is four lines, so three more would run into them. Once Level 2 is unlocked, the idle rotation alternates two panels: Level 1's as it is today, and Level 2's with its three lines, Pip, and Lady Ratchet where the Baron stands (`ratchet()` beside `baron()` in `js/ui.js`, about 8 lines; labelled boxes until her parts exist). The rotation also shows the cavern backdrop with Pip running in it on alternate turns (`drawBackdrop` is already public and takes a backdrop id). The High Scores panel is unchanged: its four pages are WORLD EASY, WORLD MEDIUM, WORLD HARD and THIS COMPUTER, and the last still shows three tables of five. Each list holds run totals (12.5).

### 12.5 World scores

**One board per difficulty.** The owner decided this on 2026-10-06 (decision 6), in these words: "if possible I'd like the same board to be used whether the user finishes during level 1 or level 2". It is possible, and it is less work than the board per level that version 0.2 of this plan described. The three boards that exist today, `easy`, `medium` and `hard`, hold every run: a run that ends in Level 1 or at STAGE 1 CLEAR with TITLE, a run that goes on through NEXT STAGE and ends anywhere in Level 2, and a run started at Level 2 from the stage row, which the owner confirmed on 2026-10-07 (decision 31). A run is entered once, when it ends, with its run total, its whole time and its rank. The owner's words speak of the world board. The plan keeps the tables of this computer one per difficulty as well, as they are today, so that both lists hold the same kind of entry. The plan no longer has a board per level, a token per board or a stage switch on the WORLD pages.

**What it means for players.**

- Each difficulty has one list, and every run joins it.
- A run through both stages scores about twice a Level 1 run played as well, and so stands above it. Measured (8.6), the highest two-stage totals are about 2.3 times the highest Level 1 totals of the same sample, and the bot at the design speed ends both stages with 100,400 to 116,360 / 111,850 to 131,620 / 141,120 to 145,480 on three seeds, having held 39,920 to 58,240 / 52,260 to 73,160 / 65,080 to 72,480 at STAGE 1 CLEAR in the same runs.
- A two-stage run does not stand above every Level 1 run. The highest Level 1 totals of LEADERBOARD 5's 360 runs are 62,480 / 108,160 / 173,530, from bots that type with perfect accuracy. The design-speed totals above are over them on Easy and Medium and under them on Hard. The floor bots' two-stage totals are over them on Easy (66,630 to 71,480) and under them on Medium and Hard (82,310 to 83,750 / 109,180 to 119,710).
- Today's entries stay valid and stay on the boards. They move down as two-stage runs arrive. A board keeps its best 200 runs, so an entry of today leaves it only when 200 higher runs exist, and that will come sooner than it would have. The owner decided on 2026-10-07 to keep 200 for the release and to look at the boards again after a few weeks (decision 33).
- A Level 1 run can still be entered, by choosing TITLE at STAGE 1 CLEAR or by ending in Level 1. Once players reach Level 2 its place will be among the lower rows.
- A run started at Stage 2 from the stage row goes on the same board. It scores about a quarter more than a Level 1 run of the same quality (23% / 23% / 26% in the sample) and much less than a run through both stages.
- The score says how far a run got and the rank letter how well it was played. Nothing on a row says which stage the run reached: the owner decided on 2026-10-07 that the first release has no stage mark (decision 29).
- Pressing NEXT STAGE does not lower a player's place, as long as the run is ended in the game (a clear, a game over or QUIT from the pause menu). The one exception is a tab closed in Level 2, which sends nothing to the world board (below). Boards are ordered by score alone, and the score cannot fall below the Stage 1 total: the only place a score goes down is a continue, which returns to the checkpoint's score, and Level 2's first checkpoint banks the carried total (12.2). Measured: a run that was S at STAGE 1 CLEAR and stopped typing 40 s into Level 2 ended at 64,930 / 116,580 / 192,950, against 60,270 / 106,420 / 170,610 at the clear.
- The initials screen comes once, at the end of the run. A player who is used to Enter leading to it after Level 1 now starts Level 2 with that key, which is why the strip carries its line (12.1).
- A run abandoned in Level 2, by closing the tab, is not sent to the world board. The bests, the saved pace and the unlock are kept, and the Stage 1 score reaches this computer's table the next time the game starts (12.6; decision 32).
- On this computer it is the same: five places per difficulty, filled by run totals. Once five two-stage runs are in a table, a Level 1 run no longer places there, and the best score of a difficulty is the best run total.
- Players on an older cached copy, or on the itch.io copy before its zip is replaced, notice nothing: they send Level 1 runs, which the new Worker takes as today's does.

**The service.** Nothing is added to the API, to the token or to the database. `DIFFICULTIES` in `server/src/worker.js` stays the three ids and `LIMITS` keeps its three rows. The `scores` table keys by difficulty as it does now, and a two-stage run is one row with a larger score and a longer `time_s`. `GET /v1/scores` answers three lists as now. What changes is the numbers in `LIMITS` and, for the daily counts, one optional field in one request (below): about 5 new lines and 8 changed, which takes the file from 647 lines to about 652 against the 700 its test allows.

**The limits.** The six speeds of 8.6, seeds 1 to 3, on each way a run can reach a board:

| Path | Highest score | Shortest cleared run (s) | Highest share of check 10's allowance |
|---|---|---|---|
| Level 1 only | 61,530 / 107,170 / 171,660 | 340 / 278 / 242 | 44.7% / 54.5% / 64.3% |
| Level 2 from the stage row | 75,520 / 131,410 / 216,390 | 355 / 292 / 247 | 52.4% / 63.7% / 79.4% |
| Both stages | 141,280 / 246,090 / 396,040 | 695 / 570 / 488 | 50.5% / 61.4% / 73.5% |
| The limit today (`LIMITS`) | cap 80,000 / 140,000 / 220,000 | `minCleared` 300 / 245 / 215 | `rate` 400 / 700 / 1,100 points per second |

The last column is the run's score as a share of 2,000 + time x rate, taken at the moment from 10 s on at which that share was highest. The Level 2 rows were measured with the stand-ins of run B and the two-stage row with a scratch `nextStage` as well (8.6); the quill stand-in makes scores a little high.

- **The caps rise.** Today's caps are less than half of what a strong two-stage run scores, and check 5 refuses such a run. Put through the Worker's own `validateSubmission` with today's `LIMITS`, the three highest totals above are refused as `implausible`. So are the Easy target bot's two-stage runs (100,400 to 116,360 on three seeds), the Medium fast bot's (160,600 to 205,720) and one Hard fast run of three (244,020). Accepted today: the floor bots' (66,630 to 71,480 / 82,310 to 83,750 / 109,180 to 119,710), the Medium target bot's (111,850 to 131,620) and the Hard target bot's (141,120 to 145,480). The new cap is 27 to 29% above the highest two-stage total seen, the rule LEADERBOARD 5 already uses. Working figures from this sample are 180,000 / 315,000 / 505,000, which also keep a real run within 80% of the cap, the margin the test asks for. On Level 1 the 360-run maxima are about 1.5% above this 18-run sample, so the final caps may be nearer 183,000 / 320,000 / 512,000 (an estimate).
- **`minCleared` stays** at 300 / 245 / 215. The shortest cleared run that can reach a board is still a Level 1 run; a run from the stage row is longer, and a two-stage run longer still.
- **The rate stays on Easy and Medium and probably rises on Hard.** The densest path is a run started at Level 2. Hard's 79.4% there is against the 80% that `test/test-server.js` allows, and it comes from 18 runs where M7 plays 360, so Hard's rate is expected to go from 1,100 to about 1,250 to 1,300 (1,300 puts the same run at 67%). The real watch makes runs up to 6 s longer and takes away the quill stand-in's doubled points, which helps a little.
- **Unchanged:** the longest time (10,800 s), the token's life (10,800 s), the shortest time (10 s), the highest WPM (220) and the 200 rows kept.

The exact values are M7's: 360 runs per difficulty on each of the three paths, with the real kinds, the real watch and the real `nextStage`, written into `LIMITS`, the table of LEADERBOARD 5 and the tests in one commit, because a test compares the document with the code. The checks themselves do not change. Checks 7, 8, 10 and 11 are met on every path at today's values, with Hard's rate close to its margin, and one submission per run means check 12's 60 an hour is no tighter than today.

**What the higher caps do to a made-up score.** The figures use the working caps and today's rates.

- Today a made-up score can be at most the cap, which is 28% / 29% / 27% above the best real run. Reaching it needs a claimed time of 195 / 198 / 199 s, and so a wait of 190 / 193 / 194 s (checks 10 and 11).
- With the cap set for two stages, a made-up score at the cap is still 27 to 28% above the best real two-stage run, which is the margin of today. Against a Level 1 run it is about 2.9 times the best. Real two-stage runs are themselves about 2.3 times a Level 1 run, so the gap between a made-up score and a real top entry is what it is today.
- Between today's cap and the new one the cap no longer limits a claim. Check 10 does, with check 11 behind it: each further second waited buys 400 / 700 / 1,100 points. Reaching the new cap needs a claimed time of 445 / 448 / 458 s and a wait of 440 / 443 / 453 s, about seven and a half minutes, which is less than the shortest real two-stage run (695 / 570 / 488 s).
- A made-up run that claims only the length of the shortest real Level 1 clear (339 / 277 / 241 s) can claim 137,600 / 195,900 / 267,100, which is 2.2 / 1.8 / 1.5 times the best real Level 1 run. Today's cap stops the same claim at 1.28 / 1.29 / 1.27 times.
- If Hard's rate rises to 1,300, Hard's figures become 387 s (a wait of 382 s) to reach the cap, and 315,300 at 241 s.
- Tokens are free and independent (LEADERBOARD 2), so a batch still waits once.

LEADERBOARD 2 says the caps are less than 30% above the best score the game was seen to give. That stays true of the best run on a board and gains a second sentence about Level 1 runs. A lower cap for runs that state they ended in Level 1 was looked at and is not in the plan: a program can state Level 2, so the bound on a made-up score is the Level 2 cap either way, and the field would cost a change to the submission, three more rows of limits and their tests.

**Tokens.** One per run, as today, and `js/board.js` needs no change for them. A token is asked for when a difficulty is confirmed (`chooseDifficulty` in `js/ui.js`), its payload is `{ id, d, t }` with `d` the difficulty, and `TG.Board` holds it in memory and drops it only when another difficulty is confirmed, near the end of its life, when a score is sent with it, or when world scores are switched off. The daily count does not use it up. So after NEXT STAGE the same token is still held and is the right one, because the run ends on the board of the same difficulty. A run started at Level 2 from the stage row comes through the same difficulty screen and gets its token there. NEXT STAGE asks for none.

A second token asked for at NEXT STAGE could not be used in any case. Its age would cover Level 2 only, while `result.time` is the whole run's (12.2), and check 11 answers `too_soon`: tried through `validateSubmission` with a token 342 s old and a run time of 656 s. For the same reason a token request that failed at the difficulty screen cannot be made good later in the run. That run stays on this computer, as it does today.

A token lives 10,800 s and the game stops using it 60 s before that. The two-stage runs of 8.6 took 488 to 918 s of play. With How To Play, two results screens, continues and short pauses, a long real run is perhaps 30 minutes (an estimate), a sixth of the token's life. A run left paused for close to three hours loses its token and is kept on this computer only, which is true of a Level 1 run today.

**Cleared and rank.** Today `buildResult(s, cleared)` takes `cleared` for the stage that just ended, and `rankOf` gives S and A only when it is true (`js/game.js`). The entry sends `result.cleared` and `result.rank` as they are. `nextStage` carries the run's lives lost, continues and accuracy, so the rank is already the whole run's. Left like that, the press of NEXT STAGE alone would cost a letter. Run today: the Easy target bot clears Level 1 with 58,240 and rank S, presses NEXT STAGE, and the run is ended from the pause menu half a second later. The result is the same 58,240 with `cleared` false and rank B. The Medium and Hard bots go from A to B the same way.

The rule, which the plan recommended and the owner decided on 2026-10-07 (decision 28): on an entry, cleared means that the run cleared at least one stage, and S and A need that. The rank stays the whole run's.

- `result.cleared` keeps today's meaning, the stage just ended, and still drives STAGE N CLEAR, the end-of-stage bonuses, the suggestion line, the NEXT STAGE strip and the daily count.
- A new `run.stages` counts the stages the run has cleared (0, 1 or 2). `nextStage` keeps it, `buildResult` raises it when the stage was cleared and puts it on the result, `rankOf` is called with `stages > 0`, and the entry sends `cleared` as `stages > 0`.
- The run above then ends with `cleared` true and rank S, which is exactly the entry TITLE would have given. The press itself costs nothing.
- What is then played counts as part of the run, as it does inside one level. Lives lost, a continue or lower accuracy in Level 2 can lower the letter, and better accuracy can raise it: the Hard floor bot on seed 3 went from B at STAGE 1 CLEAR to A at the end.
- A run that ends in Level 2 by a game over still ranks B or C. A stage starts with 5 / 4 / 3 lives (decision 21), so a game over means at least three lives lost, and A allows two.
- For a Level 1 run nothing changes: `stages` is 1 exactly when `cleared` is true.

The service needs no change for it. Check 8 asks that a cleared run be at least `minCleared` long, and a run with the mark has cleared Level 1 or Level 2, so it is at least as long as the shortest Level 1 clear. Check 9 sees a rank and a mark that come from the same calculation as today. Four cases went through today's `validateSubmission` and all were accepted: the quit and a game over in Level 2, each as today's code would send it and as the rule would. `RANK_RULES` is unchanged. LEADERBOARD 1, 3.2 and 5 gain one sentence saying that a cleared run is one that cleared at least one stage; row 9 of the table in LEADERBOARD 5 keeps its words, because `test/test-server.js` reads that row with a pattern. In the game it is about 5 lines, and the copies of the rank rule in `test/sim.js` and `test/test-server.js` follow.

**The daily counts.** `js/ui.js` sends `end` on entering every results screen and `start` only from the menus. Left alone, a two-stage run would send one start and two ends, and the second end would carry the time of the whole run, so Level 1's seconds would be counted twice. The plan counts each stage on its own (decision 30):

- The game sends `start` when a run starts from the menus and again at NEXT STAGE, and `end` on each results screen with the stage's own time (`result.stageTime`, the run time less the time at the stage's start), the stage's `cleared` and the stage's section. From Level 2 the body also carries `level: 2`. A Level 1 body is byte for byte what it is today, so a cached copy and the itch.io copy count as before.
- The Worker reads `level` (1 or 2; absent means 1; anything else is `bad_request`). Stage 1 is counted under the token's difficulty, as now. Stage 2 is counted in the same `stats` table under a label of its own in the `difficulty` column, the difficulty with `-s2` added (`easy-s2`, `medium-s2`, `hard-s2`). The column is text and the table's key is the day and that column, so the database does not change. These are labels in the owner's counter table, and no board has them.
- The rows `easy`, `medium` and `hard` keep exactly today's meaning, so the history stays comparable. The three new rows are the second stage: stages started (NEXT STAGE presses and stage-row starts together), finished and cleared, the seconds played, and where they ended. `section` stays 0 to 3 and means the part of the stage the row is about.
- `days.players` is unchanged: a start at NEXT STAGE finds the source already counted for the day.
- Cost: about 4 lines in `recordStat`, 3 in `TG.Board.stat`, about 8 in `js/ui.js`, one field on the result, LEADERBOARD 10, and the counter tests. In LEADERBOARD 10 the first reading query sums every row of a day, so it takes its counts of runs started, finished and cleared from the rows `easy`, `medium` and `hard` only and they keep today's meaning, while its minutes stay the sum over every row; a second query lists the `-s2` rows; the per-difficulty query's limit goes from 90 to 180; and the sentence that `end` is sent once is rewritten.

Two limits. The stage 2 rows cannot tell a NEXT STAGE press from a stage-row start. And an old Worker takes no notice of `level` and would add Level 2 stages to the Level 1 rows, which is one more reason for the order below. The cheaper alternative counts a run once, from its start to its real end, with no Worker change; the owner then cannot see how many runs reach Level 2 or where they end in it, and a tab closed on the STAGE 1 CLEAR screen is no longer counted as a finish.

**What ships when.**

1. M7 measures the three paths by the 360-run method and writes the `LIMITS` values, the table of LEADERBOARD 5 and the tests in one commit.
2. The owner reads the Worker's diff and deploys it from `server/` with `npx wrangler deploy`. No database command is needed.
3. Then the game's commit is pushed, so that GitHub Pages serves it, and the itch.io zip is built from the same commit and uploaded.

The Worker goes first because the new Worker only widens what is accepted. Today's game, a cached copy and the itch.io copy send Level 1 runs and counter requests without `level`, and all of those are handled exactly as today. In the other order every two-stage total above today's caps is refused at check 5 and the player reads "WORLD SCORES DID NOT TAKE THIS SCORE."; the game drops its token when it sends, so there is no second try. On today's figures that is every Easy two-stage clear at the design speed or better. Version 0.2 of this plan had a state in which Level 2 scores stayed on this computer until the service listed the new boards. With one board there is nothing for the service to list, so that state and its line on the initials screen have gone, and decision 12 is the order alone.

**Before the release.** From M6 until the release, development copies are played with WORLD SCORES off in Options, which also stops the daily counts. A copy of the game served from this machine is accepted by the live service (`LOCAL_ORIGIN` in the Worker), and `TG.Board.URL` in the repository is the live address. Left on, today's Worker would add Level 2 stages to the Level 1 rows of the daily counts and take two-stage totals under today's caps onto the boards. M9's smoke runs are the exception: they write rows to the live boards on purpose, and those rows are then deleted with the commands of LEADERBOARD 8.

### 12.6 What is saved

The save keeps its shape. With one board per difficulty no table is added, renamed or re-keyed: `scores` and `best` stay keyed by difficulty with five entries each and today's seeds, and `qualifies`, `addScore`, `best` and `recordRun` keep their signatures (CONTRACT 4.4). A table entry is a run total, whether the run played one stage or two. Level 2 adds a few fields, and the plan adds them under `version: 1` (decision 7):

```js
data = {
  version: 1,
  settings: {
    /* as today, plus: */
    lastLevel: 1,                                          // the stage last chosen on the STAGE row
    clearedEasy: 0, clearedMedium: 0, clearedHard: 0       // the highest level cleared on each difficulty
  },
  scores: { easy: [...], medium: [...], hard: [...] },     // as today, five entries each: run totals
  best:   { easy: { wpm, score }, medium: { wpm, score }, hard: { wpm, score } },   // as today
  assist: { easy: 1, medium: 1, hard: 1 },                 // as today: it measures the player, not the level
  pending: null                                            // the entry of a run that went on (below), or null
};
```

**What an older copy of the game does with a newer record.** Checked today by running `js/core.js` as it stands on stored records:

- A `version` that is not exactly the number 1 (2, 0, the string "1", missing, 3): the whole record is read as defaults (`cleanData`, line 1287). Loading alone writes nothing. The first save then writes the defaults over the stored record. `test/test-core.js` pins this for version 2.
- A top-level key it does not know (`pending`, or a `progress` object): not copied, because `cleanData` starts from the defaults and copies `settings`, `scores`, `best` and `assist` only. It is gone from storage after the first save.
- A setting it does not know: kept as it is when it is a boolean, a string or a number (the test pins this with `volume: 7`). `lastLevel: 2` and `clearedMedium: 1` both survived the load and the save.

So under version 2 with a migration, an older copy would show defaults at once (the seeded tables, initials PIP, the tutorial on, WORLD SCORES on), and at its first save it would overwrite the stored record: the three tables, the bests, the saved `assist`, every option and the unlock. The first save is the start of a run, any change in Options, the tutorial flag, initials, a recorded run, a table entry or RESET SCORES. A player who had switched WORLD SCORES off would find it on again. Under `version: 1` with added fields, everything today's code knows is kept unchanged, `lastLevel` and the three `cleared` numbers are kept, and only `pending` is dropped.

An older copy can meet a newer record only on the same address; the itch.io copy is served from another origin and has its own storage. The cases are a browser cache just after a release and a release that is rolled back (the page has no service worker). The rollback is the case that makes version 2 costly: every player who had loaded the new game would lose the record at the first run started on the old one. An old tab left open behaves the same under both routes: it writes the record it holds in memory, so the new fields go and the old data stay.

Version 0.2 of this plan chose version 2 because a new shape under a new number is the plainer record. With one board the shape does not change and nothing needs migrating. At worst version 2 loses everything on the computer; `version: 1` loses a pending entry, which is the same as not having that feature. That is also why the highest level cleared is three numbers among the settings and not a new top-level object: an older copy keeps the first and drops the second. There is a precedent, since `tutorialDone` is progress and lives among the settings (CONTRACT 5.12).

**What the code needs.** The new fields in `defaultSettings`. A branch in `cleanData` for the numeric settings it knows, clamped to whole numbers in range: today a known setting other than `crt`, `keyGuide`, `lastDifficulty` and `initials` is accepted only if it is a boolean. The unlock in `recordRun`: it raises the `cleared` number of `result.difficulty` to `result.levelId` when `result.cleared`. The unlock for a record written before this release, which has no `cleared` numbers: when all three are absent from the stored record, `cleanData` sets the number of a difficulty to 1 if its table holds an entry with `cleared` true and a date (about 5 lines). An entry made by a player has a date and the seeded entries have none. Nothing else in today's record says that a level was cleared, so a player whose clears never reached the top five of a table, or who has used RESET SCORES since, is not unlocked this way: that player sees the STAGE row after the next clear of Level 1, and is offered NEXT STAGE at that clear in any case. The accessors for `pending`. The rule that any other version is read as empty stays; it is in the code only, CONTRACT 4.4 and 5.12 do not state it, and M8 adds it. The storage key stays `spellrunner.v1`. `resetScores` keeps clearing the tables and the bests only, so RESET SCORES does not close the STAGE row.

**What is written when** (decision 19). `js/ui.js` calls `recordRun` on entering each results screen (`setupResults`), before NEXT STAGE or TITLE is chosen, and that stays. At STAGE 1 CLEAR it writes what is a fact about the player: the unlock (with the line STAGE 2 UNLOCKED the first time), the saved `assist`, and the best WPM and best score of the difficulty. The best score written there is the Stage 1 total; the end of the run can only raise it, and there is one best per difficulty. Each of these is a maximum or a state, so when `recordRun` is called again at the end of the run nothing is counted twice.

Three things wait for the end of the run, which is TITLE at STAGE 1 CLEAR or the last results screen: the initials screen, the entry in the table of this computer (`TG.Save.addScore`) and the world submission (`TG.Board.submit`). All three already sit in one function, `saveEntry`, which a run reaches once. Its `added` flag stops a second Enter, the game drops the token when it sends, and the service takes a token once (check 13). So no run can be entered twice on either list, and no new guard is needed. At NEXT STAGE nothing is entered.

**A run abandoned in Level 2.** If the tab is closed in Level 2, the unlock, the saved `assist` and the bests are kept, because they were written at STAGE 1 CLEAR. The world board cannot have the run: the token is held in memory only, nothing of it may be written to storage, and the service could not vouch for the time of a run sent later. A tab closed in the middle of Level 1 is in the same position today. The table of this computer can have it, and the plan gives it (decision 32). When NEXT STAGE is pressed and the Stage 1 total would reach the table, the game keeps that entry in the save as `pending`. It is cleared when the run reaches the title by any route, and when a new run starts. If the game finds one at start-up, the earlier run never ended: it adds the entry to the table under the initials used last and clears it. Because it is entered only at start-up and cleared at every normal end, a run still has one entry. About 25 lines across `js/core.js` and `js/ui.js` with their tests; Tier 2. One known gap: with the game open in two tabs, the Stage 1 figure can be entered from one and the final total from the other. Two tabs overwrite each other's data today as well.

### 12.7 Reasons to play again

| Idea | What the player sees | Files and size | Tier | Recommendation |
|---|---|---|---|---|
| A different run each time | The picker prefers words not yet used in the run (CONTRACT 14.2) and the seed changes the draw, so a second run has different words on the same layout: a run meets 44 / 53 / 66 threat words from pools of several hundred | None | | In the game today |
| The unlock line | "STAGE 2 UNLOCKED: CLOCKWORK CAVERNS" on the results screen, the first time Level 1 is cleared on this computer (12.3) | `js/ui.js`, about 6 lines | 2 | Build |
| BEST RUN | On the results screen, the best run total of the difficulty | `js/ui.js`, about 6 lines, from `result.bestScore`: the best score of the difficulty as `newRun` read it when the run started, carried on the result as `bestWpm` is today. `setupResults` records the run before it builds the page, so the save already holds this run by then | 2 | Build |
| Rank targets | On the results screen, from `rankOf`'s thresholds: "S NEEDS 97% ACCURACY, YOU HAD 95%" or "A NEEDS NO CONTINUES". Text only | `js/ui.js`, about 20 lines | 2 | Build |
| The Baron's three cameos | Section 2; only a Level 1 player recognises him | Art in M4 and M5 | 2 | Build |
| Clockwork words met | On the STAGE row, "CLOCKWORK WORDS 61 OF 91" for the chosen difficulty (OF 70 on Easy, OF 90 on Hard), counted across runs: a collection to finish | `js/core.js` (a bit string per difficulty among the settings, where an older copy keeps it, set in `recordRun`) and `js/ui.js`, about 35 lines | 2 | After release, unless the owner wants it now (decision 27) |
| Saved weak letters | The two weakest letters per difficulty are saved and used by the picker's weak-letter weighting from the first word of the next run. The game measures them today on Easy and Medium, after 20 words, and forgets them | `js/core.js` and `js/game.js`, about 20 lines | Later | Not in this plan (decision 27) |
| ENCORE | A level file that replays Level 1's layout with Level 2's tune block | One level file and a third stage on the row. It would use the same three boards, with the caps measured again | Later | Not in this plan (decision 27) |

---
## 13. Engineering plan

### 13.1 What is data and what is code

Data only (no engine change): `js/levels/level2.js` (Appendix B); the `clockwork` flavour in `js/words.js` (Appendix A); `TG.Backdrops.cavern`, the remaps `brass` and `crystal`, the tiles, hazard skins and backdrop pieces in `js/sprites-world.js`; the creature, projectile and boss parts and the remap `tin` in `js/sprites-chars.js` (Appendix C has the data for both files); the two tracks and the ready jingle as note text in `js/audio.js`; the `MANIFEST` rows in `js/core.js`; the script tag in `index.html`, the `FILES` entry in `test/stubs.js` and the row in CONTRACT section 1 (the tests check that the three agree). The count of 20 files is written in many places and each becomes 21: `test/test-core.js` lines 73, 82 and 1532 (line 73 also pins `js/board.js` at index 17 and `js/main.js` at 19, which become 18 and 20 when `level2.js` goes in after `level1.js`), the check names at `test/test-ui.js` line 264 and `test/test-integration.js` line 171, README line 114, and CONTRACT section 1 (the table, the load-order sentence and the script block), 10.1, the WP-H checklist, 14.1 and 14.2 (`js/board.js` as "the 20th script"). Two checks in `test/test-words.js` also change when the flavour goes in: the one at lines 91 to 99 asserts that every flavour object is empty, and the fixture at lines 683 to 693 adds a `tools` flavour with `gear`, `bolt`, `wrench`, `chisel` and `spanner`, which are now `clockwork` words and would be reported as duplicates.

Code, by file, with the groundwork marked G (built first, with Level 1 checked unchanged):

| File | Change | Size |
|---|---|---|
| `js/render.js` | G: `attackWindow` by `e.action` as in `js/entities.js`; `drawGround` and `drawHazards` read `theme.tiles` and `theme.hazardSkins` (keys `trunk`, `rope`, `canopy`, `archTrunk` added) with today's names as fallbacks; `skinFor(entity)` with the `KINDS` sprite as the fallback, applied in `drawEntities` with the skin's remap under `white`; `drawSky` reads `starSprite` and `moonSprite`; `skyFor` reads `palette.phases` with the `dusk` rule as the fallback; a `BOSS_PARTS` table keyed on `boss.kind` for `drawBoss`, the intro gesture and `drawDefeat`, with `baron` as the default. Then: the `dangle` branch with the thread, the `flit` branch with its frames and `flipX` from the turn, the `ratchet` parts, intro and defeat, the gauge needle, the watch's AQUA frame | about 260 lines |
| `js/entities.js` | G: `nextAction` chooses `SHOCK_WIN` or `PICK_WIN` by `e.action` instead of the kind name (Level 2 keeps the kinds; this removes an assumption for later levels). Then: `KINDS.dangle`, `KINDS.flit`; the `boulder` literal at its seven places: the header comment (line 22) and `KINDS` (41) describe anchored kinds; the minimum budget in `budgetFor` (382) stays on the Boulder; the anchor in `spawn()` (435), the x assignment (648) and the age from distance in `updateTypable()` (665) test `anchored`; `place()` (554) gains a Dangle case with `dx = anchorX - pip.x`. `place()` branches for Flit; the second `threat:warn` at Flit's turn; `spec.skin` copied onto the entity; `keepClear` takes the kind and widens the zone of a duck hazard for Dangle (`DANGLE_CLEAR`, 4.3); `updatePlayer` holds `invulnT` while a watch runs (6.3) | about 90 lines |
| `js/level.js` | `FALLBACK_SPAWN_KINDS` gains `dangle`, `flit`; `POWERS` gains `watch`; `update()` skips its spawn step while `state.power.watchT > 0` | 6 lines |
| `js/boss.js` | `launch()` passes `skin: state.level.boss.minionSkin` for the minion when the level has one. Nothing else | 2 lines |
| `js/game.js` | `timeScaleOf` includes the freeze factor; `applyPower('watch')`, the watch timer in `updatePowers` (the Hourglass paused meanwhile, `power:end`), the watch ended by `continueRun` and by `setScreen('bossIntro')`; `nextStage()` (12.2), built onto the run's state as `continueRun` is, with the stage's own lives and no shield charges, and `playing` in `TRANSITIONS.results`; `run.stages`, `run.stageScore`, `run.stageStart` and `run.bestScore` in `emptyState`, kept or set by `nextStage`; `buildResult` raises `run.stages` on a cleared stage, adds `stages`, `stageScore`, `stageTime` and `bestScore` to the result and calls `rankOf` with `stages > 0` (12.5) | about 125 lines |
| `js/core.js` | Constants `DANGLE_ELEV`, `DANGLE_DROP_T`, `DANGLE_CLEAR`, the seven `FLIT_*`, `WATCH_TIME`, `WATCH_SCALE`; `wordLen.dangle` and `wordLen.flit` in the three difficulty entries; `MANIFEST` rows; in `TG.Save` (12.6): `lastLevel` and the three `cleared` numbers in `defaultSettings`, a branch in `cleanData` for the numeric settings it knows, the unlock in `recordRun` and, for a record written before this release, from the dated entries of the tables, and the `pending` entry with its accessors. The version stays 1, and the tables, the bests, `qualifies` and `addScore` are untouched | about 130 lines |
| `js/effects.js` | G: the `hazard:hit` colours from `theme.hazardFx`, today's as the defaults (3.4). Then: `GHOST` entries and clear animations for `dangle` and `flit`; the skin-aware particles (the Glimmer's stars, the brass lily pad, the Baronet's monocle); a `BOSS_FX` table keyed on `boss.kind` for `boss:hit` (goggles) and `boss:defeat` (the key, the burst, the cog rain, the flakes, the launch), the "1..." popup, the finisher crank frames | about 180 lines |
| `js/hud.js` | G: the label from `level.boss.label` with x from its length and the box from x - 4; the tips from `level.boss.tips`; the arch tip's noun from `theme.hazardNames`; the speech plate's letter rate from the intro length (10.1). Then: the watch in the power slot with the WHITE gauge | about 30 lines |
| `js/audio.js` | G: the phase 3 tempo and octave from `arena.music.phase3` in `bossOpts` and the `boss:phase` handler, default `{ 184, 12 }`; the ready jingle from `theme.music.ready`, default `jingle_ready` (11.1). Then: `level2`, `boss2` and `jingle_ready2` in `TRACK_NAMES` and as note text; `watch_tick`, `watch_off`, `toot`, `click`; the `ratchet` variants of six boss sounds chosen by the level's boss kind; `power:start` / `power:end` for `watch` (the sequencer stood still and restarted, the tick timer); the toot rule of 10.4 | about 105 lines plus the tracks |
| `js/ui.js` | The results strip (NEXT STAGE on Enter alone, TITLE on Esc, 12.1) with its line, and `nextStage()`; the STAGE row with Up and Down; `startRun` passing the chosen level to `newRun`; STAGE 2 UNLOCKED, STAGE 1 SCORE, BEST RUN, the rank target and the hook lines; the How To Play row (pitch 18 px) and "HOLD FOR ARCHES AND TUNNELS"; the Level 2 story panel with `ratchet()` (12.4) and the idle backdrop; `entryFor` taking `cleared` from `result.stages`; the daily counts per stage (12.5); the pending entry, written at NEXT STAGE, cleared at the title and entered at start-up (12.6); the copy of `TRANSITIONS` in `test/test-ui.js` gains `playing` under `results`. The High Scores panel and the initials screen are unchanged | about 230 lines |
| `js/board.js` | `TG.Board.stat` puts `level: 2` in the body when it is told the stage is 2 (12.5); the two header comments name NEXT STAGE among the things that keep the token. The token, the submission and the three lists are unchanged | about 3 lines |
| `server/src/worker.js`, `docs/LEADERBOARD.md` | New values in `LIMITS` from the measurement of 12.5 (the three caps, and probably Hard's rate), with their comment; a sentence in the `RANK_RULES` comment; `level` in `recordStat`. No new id, no schema change and nothing to apply to the live database. In `test/test-server.js` the rows pinned to LEADERBOARD 5 (lines 512 to 521) change in the same commit, the figures at line 1238 change if a rate does, and the check at lines 2370 to 2385, which asserts each cap under 120,000 / 200,000 / 300,000, is rewritten around the two-stage maxima. Lines 290 and 488, which pin the three ids, stay as they are | about 13 lines, of which about 5 are new, plus the document |
| `test/sim.js` | `--level N` and `levelId` on every run of the matrix (72 runs; `--quick` keeps one level); `EXPECTED_COUNTS`, `DESIGN_COUNTS`, the crate list, the ink counts, the first open Easy gap and the length bounds keyed by level; the Boulder literal at line 241 (the impact point) becomes the anchored kinds, the one at line 229 (the minimum budget) stays on the Boulder, and the keep-clear assertion (lines 244 to 252) applies Dangle's wider zone; the kind lists of `no-dodge-actions` and `spawn-onscreen`; the checks of 13.5; a `startAssist` option (`Session` passes `assist: 1` today, line 568); the checks at lines 780, 982 and 996, which divide by `timeScale`, kept away from a live watch; a `campaign` option that plays Level 1, presses NEXT STAGE and plays Level 2, clearing the bot's press records at the step (8.6); `rankFor` and the list of result keys (lines 1957 to 1963 and 1978) follow the rank rule and the new result fields | about 265 lines |
| `tools/shot.js` | `--level` passed to `runBot` | 5 lines |

About 1,170 lines of engine and interface code by the table above, about 265 lines in `test/sim.js`, the unit and integration cases of 13.5 across eleven test files (not sized here; several hundred lines more), the level file and the data files. Every size is an estimate: none of this code is written, and the one piece that was rehearsed, a scratch `nextStage`, came to about 35 lines. The table of version 0.2 summed to about 1,320. The one-board decision took about 150 lines out, most of them from `js/board.js`, `js/ui.js` and `js/core.js`.

M0 also searches `js/effects.js`, `js/audio.js` and `js/render.js` for the literals `bramble`, `beehive`, `water` and `GRASS`, so that no other meadow value is missed. Today the search finds the burst colours of `js/effects.js` line 877, the tile and hazard names of `js/render.js` already listed, and the GRASS border of a friendly plate, which stays; `js/audio.js` has none.

### 13.2 New sprites and tracks

Sections 3.3 to 3.5 name 51 sprite definitions, the six boss parts of section 2 among them, and Appendix C has their manifest rows, the remap tables and the backdrop data; section 11 has the two tracks, the ready jingle and four sounds. The order that keeps art off the critical path: engine and level first with placeholder boxes (a missing sprite draws as a labelled box, DESIGN 14.1), then the two creatures and the moth, then the boss parts, then the world.

### 13.3 Save data and the service

New save fields under `version: 1`, with no migration (12.6; decision 7). The Worker's new limits and the counter's `level` (12.5), measured at M7 and deployed before the game, because the new Worker only widens what is accepted and today's Worker refuses every two-stage total above today's caps, which on today's figures is every Easy two-stage clear at the design speed or better. No database change. There is no local-only state for Level 2: every run goes to a board that exists today.

### 13.4 Build order

| Milestone | What | Gate |
|---|---|---|
| M0 Groundwork, no visible change | The G items of 13.1: theme names with fallbacks, the skins lookup, the boss tables with the Baron as the default, the label and tips from data, the phase 3 tempo from data, the palette keys, the `anchored` flag, `theme.hazardFx`, `theme.music.ready` and the speech plate's letter rate, `--level` and the per-level tables in the harness, the recorded Level 1 event sequence, the Level 1 pixel regression, and the literal search of 13.1 | Every run and check of `node test/run-all.js` still passes (the harness gains `--level`, so its printed lines change); the Level 1 PNGs from `tools/shot.js` at 30, 150 and 260 s and at `boss:enter` and both `boss:phase` events (`--event`) on each difficulty are byte-for-byte the same before and after. 330 s is not used: the seed 1 target run ends at 314 s on Medium and 286 s on Hard. The comparison is byte-for-byte on purpose and the shot tool is deterministic (two runs give identical files, checked today), so any difference in M0 is explained before it is accepted, and a deliberate change of draw order means new reference files with the owner's agreement; the recorded sequence (every `boss:state`, `boss:attack`, `boss:throw`, `attack:spawn` and `threat:spawn` kind of a seeded Medium target run, saved under `test/fixtures/`) matches |
| M1 The level, playable | `KINDS.dangle` and `KINDS.flit` with their movement in the simulation, Dangle's keep-clear zone, `wordLen` rows, `js/levels/level2.js` with its tune block, the file wired into `index.html`, `test/stubs.js` and the CONTRACT table (and every count of 20 files, 13.1), the `clockwork` flavour, `watch` as a crate power with no effect yet; `TG.Level.validate` empty; the Level 2 matrix with placeholder art, which is the first measurement of the real Dangle and Flit (8.6), floor rows first | The Level 2 matrix passes the fixed conditions and the targets of 13.5, tuned within the 25% rules; the Level 1 matrix is unchanged |
| M2 The creatures on screen | `en_dangle`, `en_flit`, `en_glimmer`, the `tin` remap; draw branches, the thread, the clear animations; the `new-kinds` and `skins` checks; the matrix re-run with the real kinds | Shots of each kind in each phase of its path; the matrix passes |
| M3 The Pocket Watch | 6.3 in `js/game.js`, `js/core.js`, `js/level.js`, `js/hud.js`, `js/ui.js`, `js/audio.js`; `pw_watch`; the `watch-freeze` check; the integration cases of 13.5 | The check passes; the matrix passes with the watch live; the score a watch adds is measured against the quill stand-in's (6.3). Once the watch can be played, the feel of its 3 s is looked at again (decision 22); this is a look and not a gate |
| M4 The boss | Lady Ratchet's parts, draw branch, intro with the cameo, the gauge and the toot, the telegraph variant, the finisher crank, the defeat with the snow; `en_baronet`; `pr_cog`, `pr_rollgear`, `pr_pendulum`; `boss2`; the `boss-fight` check on kind `ratchet`; the Easy minion | The fight measures 60 to 120 s for the target bot (13.5); `boss-continue` passes on Level 2 |
| M5 The world | `TG.Backdrops.cavern`, the palettes and remaps, the tiles and hazard skins, `decor_hole`, `bg_baronpeek`, `level2`, `jingle_ready2`; the legibility pass of 13.6 | The shot tool at every palette and boss phase shows both rules of 3.1 holding |
| M6 Progression and save | `nextStage()`, the results strip with its line and its keys (12.1), the STAGE row, the save fields of 12.6 (no migration), the rank rule of 12.5 (`run.stages`), the pending entry, the results lines, the story panel and idle rotation, the `campaign` harness option, the integration tests of 13.5 | `test/test-integration.js` runs the NEXT STAGE chain and a continue inside Level 2 after it |
| M7 World scores | The 360-run measurement on the three paths (Level 1 only, Level 2 from the stage row, both stages) with the real kinds and the real watch; the `LIMITS` values written from it; LEADERBOARD 1, 2, 3.2, 5, 9 and 10; the daily counts per stage: `level` in the Worker and in `TG.Board.stat`, and the `start` at NEXT STAGE and the stage's own time on `end` in `js/ui.js` (12.5); the cap check rewritten; `test/test-server.js`, `test/test-board.js`, `test/test-board-server.js`; the Worker deployed first | The server tests pass with the 80% and 10% margins on the three paths |
| M8 Documents | DESIGN: a Level 2 section parallel to 11 written from this plan with the measured values, section 17's row, 4.2 and 4.3 (rows for Dangle and Flit), 8.6 (the rank of a run that goes on), 8.9 and 12 (still one board per difficulty; a run can cover two stages and is entered once, with its run total; the stage step), 13.3 (the boss bar label from level data). CONTRACT: section 1 (the file row, every count of 20, a row for `test/fixtures/`), 3 (the `DANGLE_`, `FLIT_` and `WATCH_` constants), 4.4 (the unlock in `recordRun` and from the dated entries of an older record, the new settings and the pending entry; a save version it does not know is read as empty), 4.16 (`nextStage` and its order of work), 4.18 (the label and tips from `state.level.boss`), 4.22 (the level passed to `stat`; nothing changes for tokens), 5.1 (`power.watchT`, `run.stages`, `run.stageScore`, `run.stageStart`, `run.bestScore`, the `timeScale` comment), 5.4 (the `anchored` field, `dangle`, `flit`), 5.5 (the `age` comment and the warning note name anchored kinds; step 5's minimum stays the Boulder's; Dangle's wider zone in the keep-clear step), 5.7 (the minion skin), 5.9 (the new keys), 5.10 (`wordLen`), 5.11 (`stages`, `stageScore`, `stageTime`, `bestScore`; `cleared` is the stage's), 5.12 (the added fields under version 1; `cleared` on an entry means the run cleared a stage), 6.3 to 6.6, 7.1, 7.2, 8.2 (`level:start` also from `nextStage`), 8.3 (the turn warning), 9.1 (`results` to `playing` on Enter alone; with the strip shown, Esc is the key for `highScoreEntry` or `title`), 9.2 (`recordRun` on both results screens; one entry per run, at its end), 10.3 (`levelId`, `files`, `startAssist` and `campaign` on `runBot`), 10.4, 11.3 (six factors), 12.1 (the 25% band is written for Level 1's tune block: say that a later level replaces `tierMix` whole), 14.2. README: "Adding a level" step 4 is now true and step 7 is done, the count of scripts, "World scores" | The document tests of `test/test-core.js` and `test/test-ui.js` pass |
| M9 Release | The Worker deployed first, after the owner has read its diff (12.5): it only widens what is accepted; then the commit pushed, so that GitHub Pages serves it; the itch.io zip built from the same commit and uploaded (the README says both copies share the world scores); the name check of decision 11; the README's play text, and the stills and shorts under `promo/`, brought up to date | A smoke run on each copy on each difficulty: Level 1 through NEXT STAGE to STAGE 2 CLEAR, and a start from the stage row, each ending with one row on the difficulty's board. The rows of the smoke runs are then deleted with the commands of LEADERBOARD 8 |

Rough days for one person: M0 2, M1 2, M2 2, M3 1, M4 4, M5 4, M6 2, M7 1.5, M8 1, M9 0.5: 20 working days, of which about 8 are pixel art and 1.5 music. These are guesses added up; nothing in the repository measures them.

After release: the boards are looked at again after a few weeks, with the 200 rows a board keeps in mind (decision 33). This is a look and not a milestone.

### 13.5 The test plan

**The acceptance matrix on Level 2.** `node test/sim.js --level 2` runs the four profiles of CONTRACT 10.4 (floor, target, fast, exact) on each difficulty with seeds 1 to 3, every in-run assertion of CONTRACT 10.3 and 14.2 (event names and fields, first letters, the active cap, the word pool, no dodge, budget, keep-clear, scoring, console, announce, weak window) and every extra check; `node test/sim.js` with no option runs both levels (72 runs) and `--quick` one level. The pass conditions are the contract's fixed ones, unchanged: floor finished with at most 3 continues, target finished with 0, fast with 0 and no typable damage, exact with the WPM within 10%. That is all CONTRACT 10.4 binds for the floor bot; "without a continue" was an observation about Level 1 (CONTRACT 14.2). Level 2 adds its own target on top. The owner decided the standard on 2026-10-06 (decision 4): the fixed conditions unchanged, plus the floor and `u` rows below, with the note on Easy, which decision 1 keeps for M1. The owner decided the fight row on 2026-10-07, with Hard's health at 7 (decision 2). The other rows are the plan's. Each bound applies to every seed. The last column cites 8.6, and M1 to M4 measure again with the real parts.

| Target | Easy | Medium | Hard | In the rehearsal |
|---|---|---|---|---|
| Floor bot continues, at most, started at `assist` 1.0 and started at the saved value of a Level 1 floor run (the `startAssist` option). Decided | 1 | 2 | 2 | Met: none on any seed, from either start, in runs A and B |
| Target bot mean window use `u`. Decided | 0.55 to 0.75 | 0.55 to 0.75 | 0.55 to 0.75 | Medium and Hard are inside. Easy is under 0.55 on three seeds of five at the plan's values (0.51 to 0.56; 0.52 to 0.58 in run B): the noted exception. The owner decided to keep the values for M1 and measure again with the real creatures (decision 1) |
| Target bot fight length, s, `boss:enter` to `boss:defeat`. Decided (decision 2) | 60 to 120 | same | same | Met |
| Target bot run length, s (the `length` check per level) | 260 to 440 | same | same | Met |
| Threats still live at the arena flag (`threat:escape` with `flee`), target and floor bots, at most (decision 20) | 0 | 0 | 0 | One run in 60 (Medium, floor, seed 5), with the Boulder standing in for Dangle; none in run B. The row counts threats; the crate at 890 is decision 34 |
| Threat words live at each watch crate's `word:clear`, target and floor bots, at least. A watch crate that is not cleared has no `word:clear`; it is reported as a missed watch and is not a failure (6.2) | 1 | 1 | 1 | Met wherever the crate is cleared: 2 or more, at 118 of the 120 crate meetings in the 60 target and floor runs. The Hard floor bot on seed 2 does not clear the second watch crate in run A or B |
| A run that arrives through NEXT STAGE (the `campaign` option, M6): the floor and `u` rows again | as above | as above | as above | The floor row is met in the scratch two-stage runs of 8.6: no continue on three seeds per difficulty. `u` was not taken there. M6 measures both with the real `nextStage`. Under the rule of 12.2 the stage starts with the same lives as the rows above, and with the saved `assist` |

The `u` band has a basis in the design: a player at the design speed uses about three quarters of each budget (DESIGN 4.1), and adaptive pacing raises its target under 0.55 and lowers it over 0.80 (DESIGN 9.3). The fight bounds are wide because Easy measures as low as 69 s and Hard as high as 112 s.

**Checks keyed by level.** `level-valid` (`TG.Level.validate(TG.Levels[2])` empty), `counts` (threat spawns per section equal `EXPECTED_COUNTS[2]`, within 25% rounded up of `DESIGN_COUNTS[2]` = 13 / 16 / 15, 15 / 19 / 19, 21 / 23 / 22; 9 crates with the powers of 6.2, and the watch row of the table above), `items-shape` (184 / 187 / 187 drops), `no-jump-bridge` (the first open Easy gap of the level, tile 72), `length` (the bounds above), `boss-fight` (kind `ratchet`: the state order, entries `rock`, `rockhigh`, `minion` with the minion carrying `skin: 'en_baronet'` on every difficulty, attacks `shock` and `pick` by phase, health 3 / 6 / 7, the finisher at 25%, the defeat, `result.levelId` 2), `boss-continue`, `words-by-difficulty` (the three sets of words seen still disjoint with the flavour in).

**New checks.**

| Check | What it asserts |
|---|---|
| `new-kinds` | For `dangle` and `flit` at budgets of 2, 6 and 12 ws: the edge tag or on-screen state at spawn; Dangle's `elev` on the drop and the hang and its `anchorX` fixed in the world; Flit's four phases in order, the second `threat:warn` exactly once with `from: 'behind'`, `flipX` from the turn; contact at `t = 1` while running, jumping and sliding gives `threat:hit`; a typed word gives `word:clear`; both kinds obey the keep-clear rule near a pipe and a pool. For Dangle at the 2 ws budget on Hard: the anchor is inside the view at spawn, `x` equals `anchorX` exactly, the drop is complete by `t = 0.2` and `threat:warn` with `from: 'above'` is emitted. For Dangle near each kind of duck hazard, and in every run of the matrix: no anchor within 8 tiles of a `branch`, `beehive` or `arch` |
| `watch-freeze` | During the 3 s: `worldTime` unchanged, no entity's `age`, `x` or `t` changes, no spawn, no `hazard:cue`, a word is cleared by typing with `u` under 0.5, a jump pressed during the freeze starts on the first moving step, the Hourglass's `slowT` and Pip's `invulnT` are unchanged meanwhile, a fall in progress finishes after the freeze and costs its life, the watch ends at 3.0 real s with `power:end`, a continue ends it, `bossIntro` ends it, the bot keeps typing. Also: a waiting spawn whose slot is freed during the freeze does not appear until the world moves; `timeScale` is 0 and every `eta` is 100 x its world time left at pace 1, the urgent flag clears and returns, and no close-call bonus is paid (or, if decision 16 goes the other way, `timeScale` and `eta` hold their values) |
| `skins` | Every name in `theme.skins`, `theme.tiles` and `theme.hazardSkins` is in the manifest; each skinned sprite matches its original's size, frame names, fps and anchor |
| `level1-events` | The recorded Level 1 sequence of M0 is reproduced after every milestone |
| `campaign` | A target run and a floor run through Level 1, NEXT STAGE, Level 2: `score`, `time` and the typing statistics carried, `lives` at the difficulty's own and `shield` at 0, the Level 2 checkpoint 0 banking the carried `score`, `ink`, `inkTotal` and `nextLifeAt`, a continue in Level 2 returning to it and paying no extra life on the next points, the first Level 2 checkpoint's bonuses read from Level 2's section 1 only, `result.time` the whole run's, `result.levelId` 2, `result.stageScore` and `result.stageTime` the stage's, `result.stages` 2 after both clears, `result.bestWpm` and `result.bestScore` as they were read at the start of the run. A run that presses NEXT STAGE and is ended at once from the pause menu keeps the rank it had at STAGE 1 CLEAR and counts as cleared on its entry (12.5). One entry and one submission per run. The bot's press records are cleared at the step |

**Unit and integration tests.**

| Test file | Cases |
|---|---|
| `test/test-core.js` | The `wordLen` rows and constants against CONTRACT; the default save with `lastLevel` and the three `cleared` numbers (the shape pinned at lines 412 to 417); a real record of today loads with scores, bests, assist and settings intact and gains the new fields; with a dated cleared entry in a table that difficulty's `cleared` number loads as 1, and with seeded tables only it loads as 0; a number out of range in a setting it knows is clamped; a version 2 record is still read as defaults (line 520); `recordRun` unlocks on a cleared run and not on an ended one; the `pending` entry is kept, entered once and cleared; the 21 files |
| `test/test-words.js` | The flavour passes `validate` and the picker draws flavour words only in tiers 1 to 3; the "flavour is empty" check and the `tools` fixture are rewritten (13.1) |
| `test/test-audio.js` | Both tracks and `jingle_ready2` parse, and the tracks loop; `level:start` plays the level's ready jingle and defaults to `jingle_ready`; the phase 3 change reads the data and defaults to 184; the four sounds and the six variants |
| `test/test-gfx.js`, `test/test-sprites-world.js` | Every new sprite in the manifest with the size, frames, fps and anchor of Appendix C; the colour counts; CREAM only on the lenses of `boss2_head`; no band colour on a new creature (rule 2 of 3.1); the skins rule; the remaps `brass`, `crystal` and `tin` equal to Appendix C; every palette of `TG.Backdrops.cavern` with its first band from y 0 to 150 |
| `test/test-render.js` | Tiles and hazards drawn from theme names and the fallbacks, a missing name still drawing the labelled box; the `ratchet` composition in every pose with `rise` 0 and 40, and at each step of the intro; the label x and box for a 7-letter label and for BARON; the thread; the watch frame; the sky of each boss phase from `phases`; the `hazard:hit` colours from `theme.hazardFx`, and Level 1's when the key is absent |
| `test/test-ui.js` | The STAGE row only when unlocked, and Up/Down changing it; the results strip and its line after a cleared Level 1 run; Space on the strip does not call `nextStage`, and Esc acts only where the strip is shown; a second Esc inside `ENTRY_LOCK` of an initials screen reached by Esc does not decline; the High Scores panel still four pages; the seven How To Play rows above y 192; the two story panels in turn, neither with text below y 108 |
| `test/test-integration.js` | A whole Level 2 run from the menus with drawing and sound on and no console output; the NEXT STAGE chain from a cleared Level 1 run into Level 2 to STAGE 2 CLEAR; game over and continue at each of the four Level 2 checkpoints; a stored record of today read through a reload with nothing lost; a run that goes on reaches the initials screen once, at its end; a pending entry entered at the next start |
| `test/test-board.js`, `test/test-board-server.js`, `test/test-server.js` | One token for the whole run: no token request at NEXT STAGE, and no request at STAGE 1 CLEAR but the counter's; one submission at the end with the run total and the run time, and one row in the database; the body of the submission still the fields of LEADERBOARD 3.2 and nothing else; `stat` sending `level: 2` from Level 2, and the Level 1 body as it is today; the counters per stage, with `level` absent, 1, 2 and out of range; the `LIMITS` table equal to LEADERBOARD 5; bot results on the three paths within the 80% and 10% margins, with the extremes of the stage-row path and the two-stage path added to Level 1's six; the cap check rewritten around the two-stage maxima; a Level 1 run from an old client still accepted |

**Regressions.** The Level 1 matrix and every existing check unchanged at every milestone; the pixel regression of M0; the recorded event sequence.

### 13.6 Legibility checks

Before any Level 2 art is final: `tools/shot.js --level 2` on each difficulty 20 s after each `section:enter`, `boss:enter` and `boss:phase` event (`--event` with `--after`: one shot per palette and one per boss phase), one at the Hourglass's `power:start` (section 2 under its `slowSky`), and `tools/sheet.js` for every new sprite at 4x. Fixed times do not serve all three difficulties: the target bot reaches the checkpoints at different times on each, and the Hard run is over by 304 s (8.6). The pass:

- Rule 1 of 3.1. The band y 24 to 150 is flat and mid-dark in every shot; every plate's INK body, WHITE text, GOLD lock border and RED urgent border read against it; no backdrop piece but the named exceptions is lighter than SHADOW inside the band; the clock face is clear of every plate; the foreground particle layer is sparse.
- Rule 2 of 3.1. Pip, every creature of the level, the crate, the ink drop and each hazard skin are picked out at a glance against PLUM, against DEEP_BLUE and in each arena phase. The two marked cases are looked at first: Pip's tunic on `crystal`'s floor band, and the ink rows in section 3.
- Dangle 8 tiles from a lantern, from a pipe and from the tunnel: the two are told apart without reading the plate (4.3).

CONTRACT 13.6's art check (two rounds of look and revise per character sprite) applies to Lady Ratchet, Dangle, Flit, Glimmer and the Baronet.

### 13.7 Tier 1 and Tier 2

Tier 1 is everything needed for the level to be played, tuned and reached: M0, M1, M2, M3, M4 (the parts, the skins, the clicks, the finisher crank, the defeat), M5 (the backdrop, the tiles, the hazard skins, `level2`), M6 and M8. M7 is Tier 1 for the release and has no fallback: the Worker's new limits must be deployed before the game is released, or two-stage scores above today's caps are refused (12.5). M9 is the release itself.

Tier 2, built last and dropped first, each with its fallback:

| Item | Fallback if left out |
|---|---|
| The gauge needle and the toot | The window rule is unchanged; nothing is drawn on the dial |
| The Baron peeking from a pipe (`bg_baronpeek`) | The pipe without him |
| The intro cameo | She rises from the hatch with no cameo; the minion is still the Baronet |
| The snow flakes | The hook line alone. The owner decided to keep the snow (decision 25), so leaving it out is brought back to the owner first |
| The `tin` remap (Sprocket and the brass lily pad) | The frog as it is |
| The "1..." popup, the key spin by phase | A constant spin |
| STAGE 2 UNLOCKED, BEST RUN and the rank target lines | The results screen as today plus the strip and its line |
| The pending entry of a run abandoned in Level 2 (12.6) | The Stage 1 score of such a run is not entered in the table; the bests and the unlock are still kept |
| The Level 2 story panel and the idle cavern backdrop | Level 1's panel only |
| `jingle_ready2` | `jingle_ready`, in G major |
| `bg_mist`, `decor_hole`, the watch's AQUA frame | Nothing drawn |

As in DESIGN 19.3, a Tier 2 item left out must leave the game running without errors or warnings, and the record says which were left out.

---

## 14. Decisions

Three groups. A decision keeps one number whichever group it is in, so a reference elsewhere in the plan points at one row; the four choices made first have none. A number is never reused. Decisions 28 to 34 were new in version 0.3. Version 0.4 adds none: it moves decisions 2, 22, 25, 28, 29, 31 and 33 to 14.1.

### 14.1 Decided by the owner on 2026-10-06 and 2026-10-07

The first six rows are the first round, on 2026-10-06. Decisions 1, 6, 17, 20 and 21 were decided in a second round the same day. On four of them the owner took the plan's recommendation; on decision 6 the owner chose differently, and the plan has been rewritten to match. Decisions 2, 22, 25, 28, 29, 31 and 33 were decided in a third round on 2026-10-07, and on all seven the owner took the plan's recommendation.

| # | Decision | What was decided, and the plan's reasoning |
|---|---|---|
| | The theme | Clockwork Caverns, the level DESIGN 17 pencils in. Snowdrift Peaks is shortlisted for a later level; nothing in Level 2 names it (decision 25) |
| | The villain | Lady Ratchet, with the Baron as a cameo and as the phase 3 minion (section 2) |
| | The second new creature | Flit, the crossing bat, beside Dangle (4.2, 4.3) |
| | The new power-up | The Pocket Watch (6.3). Its length is 3 s for M3 (decision 22), and the way it stops the world is decision 16 |
| 3 | The Easy boss | The minion on and the double attack off. The Baron cameo is then seen by every player, and the minion is the Digby model, so it adds no extra words. The difficulty table keeps the double attack off Easy on purpose, and Level 2 leaves it there. Measured (8.6): with the minion on, no life was lost in the Easy arena in 20 runs, and the fight is within 1.2 s of its length with the minion off. In the tune block this is one entry, `minion: true`; `doubleAttack` is false in the table and is not restated (8.1), so either can be reversed without other change |
| 4 | The acceptance standard | The contract's fixed pass conditions unchanged, plus the Level 2 target of 13.5: the Easy floor bot at most 1 continue, the Medium and Hard floor bots at most 2, and the target bots' mean window use between 0.55 and 0.75, with the plan's note that Easy measures 0.51 to 0.56 at the plan's values (8.6; decision 1). Level 1's floor bots finished without a continue, and the rehearsal's did too, on all 30 runs from `assist` 1.0 and all 30 from the saved value. But the Hard floor bot was down to 1 life on 2 of 5 seeds, and one retune tried without the intro flags gave it a continue on one seed, so a no-continue result on Hard depends on the seed and "at most 1 / 2 / 2" is the bar. The fixed conditions are what the contract binds; the target is what this level is tuned to, written down so that a retune has a stated aim |
| 1 | Easy's timing against the decided target | Keep react 1.4 / perChar 0.8 / impactGap 2.7 for M1, and carry Easy's measured window use as the noted exception to the 0.55 to 0.75 band until the real creatures are measured. At those values the Easy target bot measures 0.51 to 0.56 and is under 0.55 on three seeds of five (8.6). The Easy bot's reaction of 1.0 s is a large fixed part of every short word, and Level 1's Easy measures 0.41 to 0.45, so this is already a step of about a quarter. The values at the edge of the 25% band (1.35 / 0.75 / 2.65) gain about 0.02 of `u`, still miss the band on one seed of five and leave the floor bot at `assist` 0.70 at the end of every seed, which is the last of a 10 WPM child's headroom. They remain the route inside the 25% guide if M1 shows that Easy should come closer |
| 6 | The world boards. Decided differently from the plan | One board per difficulty. The owner's words: "if possible I'd like the same board to be used whether the user finishes during level 1 or level 2". It is possible (12.5). The three boards of today hold every run: one that ends in Level 1 or at STAGE 1 CLEAR with TITLE, one that goes on through NEXT STAGE and ends anywhere in Level 2, and one started at Level 2 from the stage row. The owner's words do not speak of that last kind; the plan includes it, and the owner confirmed it on 2026-10-07 (decision 31). A run is entered once, when it ends, with its run total. The tables of this computer are not in the owner's words either: the plan keeps them one per difficulty as well, as they are today, so that both lists hold the same kind of entry, and that is the plan's choice. What follows from it: a run through both stages scores about twice a Level 1 run played as well and stands above it, and today's entries stay and move down; the service keeps its three ids, its API, its token and its database, and needs higher caps before the game is released (decision 12). The caps rise to about 180,000 / 315,000 / 505,000 (working figures), so a made-up score can be up to about 2.9 times the best real Level 1 run where today it can be about 1.3 times, while its margin over the best real two-stage run stays under 30% as today (12.5). A lower cap for runs that say they ended in Level 1 was looked at and left out, because a program can say Level 2. The game asks for one token per run and for none at NEXT STAGE; the save keeps its tables (decision 7). Version 0.2 of this plan had a board per level and difficulty, with three more board ids, a token per board, a stage switch on the WORLD pages and six tables in the save. None of that is in the plan now. Decisions 7, 12 and 19 are restated for one board, and decisions 28 to 33 are the points it raised |
| 17 | Word choices in the `clockwork` lists | `glowworm`, `clockface`, `buzzsaw` and `zipline` are dropped: each is written as one word here and hyphenated or split in some dictionaries. `keyhole` replaces `pickaxe` (`pickax` in American dictionaries), `hydraulics` replaces `speleology` (`spelaeology` in older British use), `headlamp` replaces `kerosene` (paraffin to a British child), and `adjust` replaces `jalopy`, which was a weak fit for the theme. `wedge`, `ridge`, `hoist`, `lathe` and `notch` join Medium tier 2, so that a Medium cog drawn from tier 2 can carry a flavour word (7.2). The lists are 0 / 31 / 39, 32 / 35 / 24 and 33 / 29 / 28, 251 words, and pass `TG.Words.validate` with no problems. Appendix A holds them, and the rehearsal of 8.6 was run again with them. `hydraulics` ends in s and is a singular noun in use, as `bellows` and `tongs` are. The Baron's attack keeps its name: the `pick` kind and `pr_pendulum` are not list words |
| 20 | The opening and the last wave | The intro flag on the first two threats (Dawdle 20, Boulder 40) and the three-entry last wave of Appendix B are the layout. The flags: without them the floor bot loses a life to the first word on 1 / 5 / 5 seeds of five, and with them on none (8.3). The wave: Appendix B holds the Dangle at 886 on every difficulty, with the Medium Flit at 840 and the Hard Sprocket at 824. As first laid out (Dangle 894, Flit 886, Sprocket 896), one of Medium's 53 words and two of Hard's 66 were still ahead of Pip at the arena flag and left untyped, in all 20 Medium runs and all 20 Hard runs. Nothing unfair followed, since nothing reached Pip untyped, but those words were never a threat. With the three-entry wave the counts per section do not change, and one run in 60 left a threat at the flag (8.6). The crate at 890 was not part of the question and is decision 34 |
| 21 | Lives and shield charges at NEXT STAGE | Each stage starts with the difficulty's own lives (5 / 4 / 3) and no shield charges (12.2). The rule keeps "harder than Level 1" true for a run through NEXT STAGE, makes the two ways into Level 2 play alike on the one board, pays the LIVES bonus once for each life, and means the rehearsal's figures hold for both ways in. It is two lines in `nextStage`, asserted by the `campaign` check. The alternatives were to carry everything, as an arcade game does (Level 1's bots would arrive with 5 to 9 lives and up to two charges, 8.6), or to carry between a floor and a cap, which would give a player who ends Level 1 short of lives a reason to quit to the title and start from the stage row |
| 2 | Hard's fight | Health 7, which is seven weak-point words (`coreWords` [2, 2, 3], as Level 1 has), where the difficulty table of DESIGN 9.1 has 8, and a fight target of 60 to 120 s (13.5). Measured (8.6): the fight lasts 110 to 112 s at health 7 and 123 to 126 s at 8; Level 1's Hard fight is 103 to 105 s. What makes Level 2 harder on Hard is the third live word from the first screen and the longer words, so the fight does not also need to be longer. The +1 letter on cogs and the 10 to 12 letter weak-point words already make the fight harder than Level 1's without making it much longer |
| 22 | The Pocket Watch's length | 3 s on every difficulty for M3, with the feel looked at again once the watch can be played. In 3 s an Easy player at the design speed types 3.75 keys, most of one word; a Hard player types a word and a half (6.3). Every live word gains 3 real seconds on every difficulty, which on Easy is more than half a typical budget. The alternative, longer on Easy (4 / 3 / 3), costs a new key in the difficulty table (`watchTime`, not tunable) and about 6 lines across `js/core.js`, `js/game.js` and CONTRACT 5.10 |
| 25 | The snow at the defeat and the hook line | Both are kept: the flakes (`fx_flake`) and "A COLD WIND BLOWS DOWN THE SHAFT." ship in Level 2. Snowdrift Peaks is shortlisted and not yet chosen. Neither the flakes nor the line names the Peaks, and a cold wind down a shaft reads as an ending on its own. The flakes are one 8x8 sprite and about 10 lines in `js/effects.js`; the line is one string in `js/ui.js`. The flakes are built in the Tier 2 group (13.7); if time runs short there, leaving them out is brought back to the owner first. Not chosen: dropping the flakes and changing the line, so that nothing hints at the next level until it is chosen |
| 28 | The rank letter and the cleared mark of a run that goes on | On an entry, a run counts as cleared when it cleared at least one stage, and the rank is the whole run's: accuracy, lives lost and continues over both stages. As the code stands, S and A are given only when the stage that just ended was cleared (`buildResult`, `rankOf`), so a player who earned S at STAGE 1 CLEAR and presses NEXT STAGE ends with B at most unless Level 2 is cleared, even on quitting at once with the same score (measured, 12.5). Under the rule the press itself costs nothing: quitting straight after gives the entry TITLE would have given. Lives lost, a continue or lower accuracy in Level 2 still lower the letter, as they do inside one level. About 5 lines in the game and none in the service, whose checks 8 and 9 pass as they are. Two alternatives were not chosen: leaving the code alone (no lines, but a key press costs the letter), and banking the Stage 1 rank and keeping the better of the two, which needs the accuracy banked with it and is the stage accounting the plan set out to avoid |
| 29 | A stage mark on a board row | None in the first release. The plan's reasons: the mark is the one thing here that needs a change to the live database (one new column, added by hand with `ALTER TABLE` before the Worker is deployed, because `schema.sql` creates only what is missing); it needs a new field in what the game sends and changes to the tests that pin an entry to seven fields; and it would be only as reliable as the score, since a program can claim any stage. What is given up: without a mark, for example a small 2 beside runs that reached Stage 2, a player sees some scores about twice the size of others, with nothing on the row to say why. The line on the STAGE 1 CLEAR screen ("THE SCORE IS ENTERED WHEN THE RUN ENDS", 12.1) tells the player who goes on that a run can cover both stages; nothing tells a reader of the board. If the mark is added later, rows entered before then show none |
| 31 | A run started at Stage 2 from the stage row | It goes on the same world board as the others, as the plan has it. It skips Level 1, and it scores about a quarter more than a Level 1 run of the same quality. Its totals are well below two-stage totals, so once two-stage runs are on a board it stands under them; until then it stands above a Level 1 run played as well. The board could tell such runs apart only through a new field that a program could misstate. Not chosen: a rule in the game alone, under which a run from the stage row is kept on this computer and is not offered to the world board |
| 33 | The rows a board keeps | The best 200 runs for the release, and the boards are looked at again after a few weeks. The plan's reasoning: the number can be raised later with no database change, so the choice can wait until the boards show how quickly entries drop out. With one list for every run, Level 1 entries will drop out of the 200 sooner than they would have. Raising the number later is the constant in the Worker and its copy in `js/board.js`, the tests written around 200 and place 201 (`test/test-board.js`, `test/test-server.js`) and the figure in LEADERBOARD 3.2, 4 and 5, with no database change. A cached older copy would go on saying NOT IN THE BEST 200 YET for a place the service now keeps |

### 14.2 Settled in the plan, listed for confirmation

| # | Point | What the plan does, and why |
|---|---|---|
| 5 | The unlock | Global: clearing Level 1 on any difficulty opens the stage row on every difficulty. A child who cleared Easy can see the caverns on Easy, and a player does not have to clear Hard to see Level 2 there. A player who cleared Level 1 before this release is unlocked from a dated entry in the tables, where there is one (12.6). The alternative is an unlock per difficulty |
| 8 | The crow | Not used in Level 2. Flit takes the above direction, and two bats would blur the one new read Flit teaches. The alternative is a bat reskin of the crow beside Flit |
| 9 | Dangle's rule | Anchored like the Boulder: still on every difficulty, no stall, no minimum budget, and never within 8 tiles of a duck hazard (4.3). The alternative, the Dawdle formula with `minSpeed` 0, is still only for budgets over 4.4 ws |
| 10 | The crate's balloon | Unchanged: the red balloon and the GRASS-bordered plate are what the player learned to look for. A cave remap (RED to TEAL, CORAL to AQUA) is a one-line change if the owner wants it |
| 13 | Easy tier 1 | It gets no flavour words, so Level 2 Easy opens on tier 2 at 70% with Level 1's home-row words at 30% (7.2). The select panel's SHORT WORDS, HOME ROW FIRST still describes the game as a whole |
| 14 | The Hourglass and the watch | The Hourglass timer pauses while a Pocket Watch runs: the watch is the stronger power and should not use up the weaker one's time |
| 15 | The boss bar label | RATCHET, seven letters, with the box widened by 16 px (10.4). The change is two lines and BARON draws where it does today. The alternative is a five-letter label |

### 14.3 Open

Thirteen rows in two parts, each with the plan's recommendation: ten choices that the plan builds as recommended unless the owner says otherwise, and three that wait for a measurement or a check. Nothing now waits for the owner's answer before a milestone. The seven decisions that did are in 14.1.

**Built as recommended unless the owner says otherwise.** Engineering choices and smaller design choices.

| # | Decision | Recommendation |
|---|---|---|
| 7 | Save data: `version: 1` with the new fields added, or version 2 with a migration. With one board per difficulty the tables do not change, so there is nothing to migrate: a new record is today's record with a few more fields (12.6). | `version: 1` with the fields added, and the highest level cleared held as three numbers among the settings. Checked against today's `js/core.js`: an older copy of the game reads any other version as empty and writes defaults over the record at its next save. If an older copy ever read a version 2 record (a cached copy just after release, or a release that is rolled back), everything on that computer would be lost at the next run started, including a WORLD SCORES setting that had been switched off. Under `version: 1` an older copy keeps every table, best and option and every setting it does not know, and drops only a top-level key it does not know, which here is the pending entry of decision 32. Version 0.2 of this plan recommended version 2 because a new shape under a new number is the plainer record; the shape no longer changes |
| 12 | The release order. Version 0.2 asked about shipping before the Worker listed the Level 2 boards, with scores kept on this computer in the meantime. With one board there is nothing for the service to list, so that fallback has gone and the question is the order alone. | Deploy the Worker first, after the owner has read its diff; then push the game; then upload the itch.io zip (12.5). The new Worker only widens what is accepted, so today's game and any cached copy are handled as now. In the other order every two-stage total above today's caps is refused, and the game has no second try: on today's figures that is every Easy two-stage clear at the design speed or better. Level 2 stages would also be added to the Level 1 rows of the daily counts |
| 16 | How the Pocket Watch stops the world, and what the player sees while it runs. In the plan's form the red urgent border and its tick pause for the 3 s, and no close-call bonus can be earned in that time; in the alternative both carry on as normal. The engineering behind it: the plan adds a `freeze` factor to `timeScale` (6.3). That makes `timeScale` 0 for the first time: every `eta` becomes 100 x the world time left through the 0.01 clamp, so the urgent border and tick pause, the close-call bonus cannot be earned during the freeze, and three harness checks that divide by `timeScale` must be kept away from a live watch. The alternative zeroes the world step directly, as the `lifeLost` screen does (`wdt` is 0 while `watchT > 0`, one condition in `step`): `timeScale`, `eta`, the urgent border and the close call then keep their normal values. | The `freeze` factor. It is the form that was rehearsed today (six Level 1 runs with a 3 s freeze after every crate but the Hourglass, all finished), and the pause of the urgent border is part of what shows the player that the world has stopped. If M3 finds another place that divides by `timeScale`, take the alternative; the `eta` row of 6.3 then reads "holds" |
| 19 | What STAGE 1 CLEAR records for a run that goes on, now that a run is entered once, at its end. `js/ui.js` records the result and sends the daily `end` count on entering the results screen, before NEXT STAGE or TITLE is chosen. The plan keeps that for what is a fact about the player (12.6): the unlock, the saved `assist`, the best WPM and best score of the difficulty, and the count of a first stage finished. The initials screen, the table entry and the world submission wait for the end of the run. The alternative defers the STAGE 1 writes until the player chooses TITLE. | Keep it. Each thing written at STAGE 1 CLEAR is a maximum or a state, so writing it again at the end of the run counts nothing twice, and the three things that enter a run sit in one function that a run reaches once. There is one best per difficulty and the run's final total is at least the Stage 1 total, so for a run that reaches its end the oddity version 0.2 named, a best from a run that was never entered in its table, has gone. It remains for a run abandoned in Level 2: its Stage 1 total can be the best of the difficulty, and it reaches the table through the pending entry of decision 32, or not at all if that item is left out. Deferring is worse under one board: a player who goes on and then closes the tab would lose the unlock as well |
| 23 | The music of sections 1 and 2: one setting for both (D minor, 140 BPM), as Level 1 does, or a small step at the Gear Hall. | One setting. The lift at section 3 then marks the one change of light. The alternative is 144 BPM in section 2: one number in the level file, no code |
| 24 | The ready jingle: `jingle_ready2` in D minor (11.1), or Level 1's G major jingle kept. | Add `jingle_ready2`, as Tier 2. It costs two bars of note text, a name in `TRACK_NAMES` and its test copy, and about 5 lines in `js/audio.js` for `theme.music.ready`. Without it every start and continue of Level 2 opens in G major ahead of a D minor loop |
| 26 | The boss asks for no new player action. Lady Ratchet's round is Level 1's with new pictures: type the cogs, jump the gear, duck the pendulum, type the weak point (10.5). | Accept for Level 2. What is new to learn is in the level (Dangle, Flit, the watch), and the fight tests the player through longer words and quicker cogs. A new attack kind would need a window rule, geometry checks and changes at the five places that key on `shock` and `pick` (4.1): about 80 lines and a rehearsal, better spent on a later boss |
| 27 | Three replay ideas the plan leaves late or out (12.7): the count of clockwork words met, the saved weak letters, and an ENCORE stage. | Words met: yes, after release (about 35 lines and a save field). Saved weak letters: yes, in a later update (about 20 lines; it changes the first words of a run, so it wants its own bot runs). ENCORE: no for now. It would need no new board, since a third stage would use the same three, but the caps would have to be measured again for a run of three stages |
| 30 | How the daily counts treat the second stage: each stage counted on its own, or a run counted once from its start to its end. | Each stage on its own (12.5). The Level 1 rows keep exactly today's meaning, so the history stays comparable, and three new rows a day show how many second stages were started, finished and cleared and where they ended. It needs about 4 lines in the Worker and no database change. The new rows carry labels of their own in the counter table (`easy-s2`, `medium-s2`, `hard-s2`); no board has those names. Counting per run needs no Worker change but cannot show how many runs reach Level 2 |
| 32 | A player goes on to Level 2 and then closes the tab. Should the Stage 1 score still reach the table on this computer? | Yes: keep it as a pending entry and add it at the next start under the initials used last (12.6). About 25 lines, Tier 2. It cannot be sent to the world board afterwards, because the run token lives in memory only |

**Waiting for a measurement or a check.** These ask nothing of the owner now.

| # | Decision | Recommendation |
|---|---|---|
| 11 | The name "Lady Ratchet" and the level name have not been checked against existing products, as DESIGN 1 notes for the game's own title. | Check before release (M9) |
| 18 | The floor player's headroom on Medium and Hard. The floor bot finishes Level 2 without a continue on every seed, but at or near the `assist` floor. On Hard it was down to 1 life on 2 of 5 seeds, and on one seed it missed the second watch crate; on Medium its worst seed lost 4 lives in run A and 5 in run B (8.6). None of four single changes tried moved the lives lost by more than the spread between seeds, and none is lower on both difficulties: against the plan's 9 / 8, no length shift in section 1 measures 11 / 7, `react` back at Level 1's value 10 / 10, and `perChar` back at Level 1's value 7 / 11. | Keep the plan's values for M1 and measure again with the real Dangle and Flit before deciding. A 20 WPM Medium player is at the bottom of what the select screen promises (20 to 40) and a 35 WPM Hard player is under it (40 or more), and both finish. If the M1 matrix shows a floor continue, try the four changes again on the real kinds and take the one that measures best there: the rehearsal gives no order among them. Version 0.2 named section 1's length shift as the first thing to give back, on a figure that the word swaps reversed on Medium. None of the changes brings back Level 1's headroom (8.6), so none is worth taking before M1 |
| 34 | The last crate before the arena (Bubble shield, tile 890). It is still untyped when Pip reaches the arena flag in 5 of 10 Medium and 8 of 10 Hard target and floor runs in run A, and in 5 and 6 of 10 in run B; Easy clears it in every run (8.6). A missed crate costs no life, but in those runs the bot goes into the fight without that shield charge. The owner confirmed the last wave's three threats (decision 20); the crate was not part of that question. | Leave it at 890 for M1 and measure with the real Dangle, which is the threat just before it. If it is still missed that often, move it earlier under the tuning rule of 9.2 (up to 6 tiles, recorded in the file), and bring it back to the owner if 6 tiles are not enough |

---

## Appendix A: the `clockwork` flavour, in full

Installed as `POOLS[difficulty].flavour.clockwork = { 1: [...], 2: [...], 3: [...] }` in `js/words.js` and named by `theme.wordFlavour: 'clockwork'`. Checked by script against every pool of `js/words.js` as it stands and run through `TG.Words.validate` with the flavour installed, again on 2026-10-06 from the lists as printed here: no problems (section 7.1). The swaps of decision 17 are applied: `glowworm`, `clockface`, `buzzsaw` and `zipline` are dropped, `keyhole` replaces `pickaxe`, `hydraulics` replaces `speleology`, `headlamp` replaces `kerosene`, `adjust` replaces `jalopy`, and `wedge`, `ridge`, `hoist`, `lathe` and `notch` join Medium tier 2. The rehearsal of 8.6 was run again with the lists as printed here. Lengths per tier: Easy 2-5 / 3-4 / 3-5, Medium 4-5 / 5-6 / 6-8, Hard 5-7 / 7-9 / 8-11; Easy tier 1 home row only, tier 2 home row plus E I R T O U with a letter outside the home row, tier 3 a letter outside that set; Medium tier 1 without Q, X or Z. Hard tier 3 words of 11 letters are valid but never picked for a threat (`MAX_WORD_LEN` 10), as Level 1's are. Three 5-letter Hard tier 1 words (`rivet`, `pivot`, `ingot`) are valid and are not drawn in this level, because Hard's length shift is 1 from the first screen (7.2).

### Easy

**Tier 1 (home row only, 2-5 letters): 0 words**
(none: the theme's home-row words are already in Level 1's pools, section 7.2)

**Tier 2 (home row plus E I R T O U, 3-4 letters): 31 words**
gear tool rust rail lift dial soot fuse jolt tilt grit fuel sift turf rift rod rig ore tar slot silt stir toil grid hose gust leak idle load lead stud

**Tier 3 (all letters, 3-5 letters): 39 words**
cog bolt pump pipe bulb wire coal cart mine vent valve crank brass winch anvil torch robot clamp spoke motor steam cable pick chain screw spade coil knob bench brick wick tick tock zinc onyx opal echo drip beam

### Medium

**Tier 1 (common words, 4-5 letters, no Q X Z): 32 words**
metal steel drill lever shaft miner ledge forge hinge gauge track crane blade latch plank tongs ember rocky rusty wagon gleam glint depth chute press smelt flint geode tread pedal shale vault

**Tier 2 (5-6 letters): 35 words**
piston pulley wrench bucket copper switch clutch socket gasket chisel mallet boiler nozzle gadget engine rattle rumble grotto cavern marble gravel nugget widget tinker toggle thrust cobble rubble ticker bobbin wedge ridge hoist lathe notch

**Tier 3 (6-8 letters): 24 words**
gearbox conveyor cogwheel dynamo furnace turbine flywheel bellows windlass mechanic quarry fizzle jiggle jangle sizzle ratchet keyhole whistle sprocket spanner minecart jostle adjust extract

### Hard

**Tier 1 (5-7 letters): 33 words**
flange spigot gantry rivet swivel pivot pumice basalt gypsum cobalt zircon gimbal sextant smelter spindle treadle fissure crevice geyser girder trowel pewter chrome nickel pyrite ingot solder pinion torque crowbar hopper foundry grommet

**Tier 2 (7-9 letters): 29 words**
gearwheel mechanism clockwork blowtorch mineshaft crucible generator machinist millstone quartzite limestone whirligig excavator periscope monorail funicular trapdoor camshaft headlamp lodestone turnstile crankcase sandstone propeller stopwatch metronome locksmith cartwheel blueprint

**Tier 3 (8-11 letters): 28 words**
crankshaft typewriter grindstone waterwheel escapement clockmaker centrifuge thermostat mechanical machinery fluorite amethyst malachite magnetite tourmaline geothermal horologist mainspring wheelbarrow drawbridge screwdriver locomotive ironmonger watchmaker chronometer millwright calibration hydraulics

Total: 251 words (Easy 70, Medium 91, Hard 90).

---

## Appendix B: the skeleton of js/levels/level2.js

The draft file as it was validated (9.6) and measured (8.6) for this plan. The gaps, hazards, spawns and ink lists are in full; the beats of section 9 are the same entries by tile. Counts: 14 gaps, 13 hazards, 75 spawn entries (66 threat entries across the three tags, giving 44 / 53 / 66 threat words, and 9 crates), 45 ink entries giving 184 / 187 / 187 drops. The opening's two intro flags and the three-entry last wave are the layout the owner confirmed (decision 20). The keys `theme.music.ready` and `theme.hazardFx` and the remap name `tin` are presentation only and play no part in the simulation.

```js
// js/levels/level2.js
// SPELL RUNNER Level 2: CLOCKWORK CAVERNS. Registers TG.Levels[2].
//
// Plan: docs/LEVEL2.md. Contract: docs/CONTRACT.md section 5.9. Positions are in tiles (16 px); x is the
// trigger tile of a threat or crate and the left edge of a gap or hazard; min is the lowest difficulty that
// uses the entry. No tutorial threats; the first two threats carry `intro` in their place (LEVEL2 9.2).
// The tune block is LEVEL2 section 8.1: timing values within 25% of js/core.js, whole numbers within 1,
// tierMix replaced whole.
//
// Tuning changes: none yet (the list is kept here as js/levels/level1.js keeps its own).
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};
  TG.Levels = TG.Levels || {};
  TG.Levels[2] = {
    id: 2,
    name: 'CLOCKWORK CAVERNS',
    tutorial: false,
    tune: {
      easy: {
        react: 1.4, perChar: 0.8, impactGap: 2.7,
        maxActive: [2, 2, 2, 2],
        lenShift: [0, 1, 1],
        wordLen: { rock: [3, 5] },
        tierMix: [ { 2: 0.7, 1: 0.3 }, { 3: 0.6, 2: 0.4 }, { 3: 0.8, 2: 0.2 }, { 2: 0.6, 1: 0.4 } ],
        boss: { health: 3, coreWords: [1, 1, 1], rocks: [2, 3, 3], launchGap: [3.6, 3.2, 2.9],
                coreLen: [5, 6], finisherLen: [7, 7], minion: true }
      },
      medium: {
        react: 0.9, perChar: 0.4, impactGap: 1.3,
        maxActive: [2, 3, 3, 3],
        lenShift: [1, 1, 2],
        tierMix: [ { 2: 0.5, 1: 0.5 }, { 3: 0.5, 2: 0.5 }, { 3: 0.7, 2: 0.3 }, { 2: 0.6, 1: 0.4 } ],
        boss: { health: 6, coreWords: [2, 2, 2], rocks: [2, 3, 4], launchGap: [2.0, 1.8, 1.5],
                coreLen: [8, 9], finisherLen: [11, 11] }
      },
      hard: {
        react: 0.55, perChar: 0.25, impactGap: 0.8,
        maxActive: [3, 3, 4, 4],
        lenShift: [1, 2, 2],
        wordLen: { rock: [6, 8] },
        tierMix: [ { 2: 0.4, 1: 0.6 }, { 3: 0.5, 2: 0.5 }, { 3: 0.8, 2: 0.2 }, { 2: 0.6, 1: 0.4 } ],
        boss: { health: 7, coreWords: [2, 2, 3], rocks: [3, 4, 5], launchGap: [1.3, 1.1, 0.9],
                coreLen: [10, 12], finisherLen: [14, 15] }
      }
    },
    theme: {
      id: 'cavern',
      backdrop: 'cavern',
      wordFlavour: 'clockwork',
      music: { level: 'level2', boss: 'boss2', ready: 'jingle_ready2' },
      tiles: {
        top: 'tile_cave_top', fill: 'tile_cave_fill',
        edgeL: 'tile_cave_edge_l', edgeR: 'tile_cave_edge_r', wallL: 'tile_cave_wall_l', wallR: 'tile_cave_wall_r',
        gapFill: 'tile_pool', gapFillDark: 'tile_dark', plank: 'tile_girder',
        arenaTop: 'tile_clockfloor', arenaFill: 'tile_cave_fill', rail: 'tile_rail'
      },
      hazardSkins: { bramble: 'haz_crystal', branch: 'haz_pipe', beehive: 'haz_lantern', arch: 'haz_tunnel',
                     trunk: 'haz_pipe_riser', rope: 'haz_chain', canopy: 'haz_ceiling', archTrunk: 'haz_column' },
      hazardNames: { arch: 'TUNNEL' },
      // Particle colours on hazard:hit: AQUA CORAL WHITE; BRONZE GOLD STONE; GOLD CREAM BRONZE; STONE SILVER SHADOW.
      hazardFx: { bramble: [11, 26, 4], branch: [16, 18, 2], beehive: [18, 19, 16], arch: [2, 3, 1] },
      skins: {
        hoppet: { remap: 'tin' },
        buzzle: { sprite: 'en_glimmer', fx: { fx_flower: 'fx_star' } },
        rock:   { sprite: 'pr_cog' },
        shock:  { sprite: 'pr_rollgear' },
        pick:   { sprite: 'pr_pendulum' }
      }
    },
    lengthTiles: 928,
    sections: [
      { name: 'LANTERN HOLLOW', stage: '2-1', from: 0, to: 288, palette: 'lantern', gapFill: 'water',
        music: { transpose: 0, tempo: 140, keyOk: { root: 2, mode: 'minor' } } },
      { name: 'THE GEAR HALL', stage: '2-2', from: 288, to: 608, palette: 'brass', gapFill: 'water',
        music: { transpose: 0, tempo: 140, keyOk: { root: 2, mode: 'minor' } } },
      { name: 'CRYSTAL DEEP', stage: '2-3', from: 608, to: 928, palette: 'crystal', gapFill: 'dark',
        music: { transpose: 3, tempo: 148, keyOk: { root: 5, mode: 'minor' } } }
    ],
    arena: { name: 'THE GREAT CLOCK', stage: '2-B', palette: 'clock', arenaTilesFrom: 920,
      music: { transpose: 0, tempo: 160, keyOk: { root: 7, mode: 'minor' }, phase3: { tempo: 176, p2Octave: 12 } } },
    checkpoints: [0, 288, 608, 928],

    gaps: [
      { x: 72, w: 1 },                      // section 1: first jump
      { x: 166, w: 2 },                     // section 1: wide jump
      { x: 232, w: 1 },                     // section 1
      { x: 350, w: 2 },                     // section 2: stepping stones
      { x: 358, w: 2, min: 'medium' },
      { x: 366, w: 2 },
      { x: 452, w: 1 },                     // section 2: typing in the air
      { x: 501, w: 2 },                     // section 2: movement only
      { x: 680, w: 1 },                     // section 3: rail run
      { x: 688, w: 1, min: 'medium' },
      { x: 696, w: 1 },
      { x: 704, w: 1, min: 'medium' },
      { x: 846, w: 1 },                     // section 3: movement run
      { x: 860, w: 2 }
    ],

    hazards: [
      { x: 134, kind: 'branch' },           // low pipe: first duck
      { x: 200, kind: 'beehive' },          // lantern
      { x: 266, kind: 'bramble' },          // crystal spikes
      { x: 422, kind: 'branch' },
      { x: 432, kind: 'beehive' },
      { x: 494, kind: 'bramble' },
      { x: 509, kind: 'bramble', min: 'medium' },
      { x: 552, kind: 'branch' },
      { x: 748, kind: 'beehive' },
      { x: 756, kind: 'bramble' },
      { x: 764, kind: 'branch', min: 'medium' },
      { x: 853, kind: 'branch' },
      { x: 870, kind: 'arch', w: 3 }        // low tunnel: hold duck
    ],

    spawns: [
      // Section 1: LANTERN HOLLOW. Old friends from the right, then Dangle.
      { x: 20, kind: 'dawdle', min: 'easy', intro: true },
      { x: 40, kind: 'boulder', min: 'easy', intro: true },
      { x: 48, kind: 'buzzle', min: 'hard' },
      { x: 56, kind: 'dawdle', min: 'hard' },
      { x: 64, kind: 'buzzle', min: 'easy' },
      { x: 78, kind: 'hoppet', min: 'hard' },
      { x: 96, kind: 'dangle', min: 'easy', intro: true },
      { x: 120, kind: 'hoppet', min: 'easy' },
      { x: 142, kind: 'crate', power: 'shield', min: 'easy' },
      { x: 146, kind: 'boulder', min: 'easy' },
      { x: 152, kind: 'dawdle', min: 'medium' },
      { x: 160, kind: 'dangle', min: 'hard' },              // clear of the lantern at 200 (LEVEL2 4.3)
      { x: 172, kind: 'dangle', min: 'easy' },
      { x: 178, kind: 'buzzle', min: 'easy' },
      { x: 206, kind: 'crate', power: 'watch', min: 'easy' },  // 2 tiles before the pair (LEVEL2 6.2)
      { x: 208, kind: 'hoppet', min: 'easy' },
      { x: 212, kind: 'dawdle', min: 'easy' },
      { x: 216, kind: 'buzzle', min: 'medium' },
      { x: 240, kind: 'dangle', min: 'hard' },
      { x: 244, kind: 'hoppet', min: 'easy' },
      { x: 258, kind: 'boulder', min: 'easy' },
      { x: 276, kind: 'dangle', min: 'easy' },
      { x: 280, kind: 'buzzle', min: 'hard' },

      // Section 2: THE GEAR HALL. Flit crosses; the boar from behind; the stepping girders.
      { x: 302, kind: 'flit', min: 'easy', intro: true },
      { x: 328, kind: 'boulder', min: 'easy' },
      { x: 334, kind: 'hoppet', min: 'easy' },
      { x: 340, kind: 'buzzle', min: 'hard' },
      { x: 374, kind: 'crate', power: 'hourglass', min: 'easy' },
      { x: 378, kind: 'dawdle', min: 'easy' },
      { x: 384, kind: 'flit', min: 'easy' },
      { x: 390, kind: 'dangle', min: 'medium' },
      { x: 406, kind: 'truffle', min: 'easy' },
      { x: 412, kind: 'flit', min: 'hard' },
      { x: 440, kind: 'crate', power: 'cap', min: 'easy' },
      { x: 444, kind: 'boulder', min: 'easy' },
      { x: 458, kind: 'buzzle', min: 'easy' },
      { x: 462, kind: 'truffle', min: 'easy' },
      { x: 468, kind: 'dangle', min: 'easy' },
      { x: 474, kind: 'flit', min: 'medium' },
      { x: 514, kind: 'dangle', min: 'hard' },              // clear of the pipe at 552
      { x: 518, kind: 'boulder', min: 'easy' },
      { x: 524, kind: 'hoppet', min: 'easy' },
      { x: 530, kind: 'flit', min: 'easy' },
      { x: 542, kind: 'truffle', min: 'medium' },
      { x: 560, kind: 'buzzle', min: 'easy' },
      { x: 566, kind: 'flit', min: 'easy' },
      { x: 572, kind: 'dawdle', min: 'easy' },
      { x: 590, kind: 'truffle', min: 'hard' },

      // Section 3: CRYSTAL DEEP. The Baron's moles, the rail run, the peak from every direction.
      { x: 622, kind: 'digby', min: 'easy' },
      { x: 644, kind: 'digby', min: 'easy' },
      { x: 650, kind: 'buzzle', min: 'easy' },
      { x: 662, kind: 'flit', min: 'hard' },
      { x: 668, kind: 'crate', power: 'quill', min: 'easy' },
      { x: 716, kind: 'dangle', min: 'easy' },
      { x: 720, kind: 'truffle', min: 'easy' },
      { x: 726, kind: 'hoppet', min: 'easy' },
      { x: 732, kind: 'boulder', min: 'easy' },
      { x: 738, kind: 'digby', min: 'medium' },
      { x: 770, kind: 'crate', power: 'watch', min: 'easy' },  // 2 tiles before the peak
      { x: 772, kind: 'buzzle', min: 'easy' },
      { x: 776, kind: 'truffle', min: 'easy' },
      { x: 780, kind: 'flit', min: 'easy' },
      { x: 786, kind: 'digby', min: 'easy' },
      { x: 792, kind: 'dangle', min: 'medium' },
      { x: 804, kind: 'boulder', min: 'hard' },
      { x: 816, kind: 'crate', power: 'blast', min: 'easy' },
      { x: 820, kind: 'flit', min: 'medium' },
      { x: 824, kind: 'hoppet', min: 'hard' },              // decision 20: out of the last wave
      { x: 832, kind: 'boulder', min: 'easy' },
      { x: 836, kind: 'crate', power: 'cap', min: 'easy' },
      { x: 840, kind: 'flit', min: 'medium' },              // decision 20: out of the last wave
      { x: 878, kind: 'truffle', min: 'easy' },
      { x: 882, kind: 'buzzle', min: 'easy' },
      { x: 886, kind: 'dangle', min: 'easy' },              // decision 20: the last threat, on every difficulty
      { x: 890, kind: 'crate', power: 'shield', min: 'easy' }
    ],

    ink: [
      { x: 14, shape: 'row', n: 4, step: 2 },
      { x: 60, shape: 'row', n: 4, step: 2 },
      { x: 104, shape: 'row', n: 4, step: 2 },
      { x: 150, shape: 'row', n: 4, step: 2 },
      { x: 192, shape: 'row', n: 4, step: 2 },
      { x: 224, shape: 'row', n: 4, step: 2 },
      { x: 270, shape: 'row', n: 4, step: 2 },
      { x: 294, shape: 'row', n: 4, step: 2 },
      { x: 318, shape: 'row', n: 4, step: 2 },
      { x: 376, shape: 'row', n: 4, step: 2 },
      { x: 410, shape: 'row', n: 4, step: 2 },
      { x: 470, shape: 'row', n: 4, step: 2 },
      { x: 520, shape: 'row', n: 4, step: 2 },
      { x: 564, shape: 'row', n: 4, step: 2 },
      { x: 614, shape: 'row', n: 4, step: 2 },
      { x: 640, shape: 'row', n: 4, step: 2 },
      { x: 670, shape: 'row', n: 4, step: 2 },
      { x: 728, shape: 'row', n: 4, step: 2 },
      { x: 810, shape: 'row', n: 4, step: 2 },
      { x: 826, shape: 'row', n: 4, step: 2 },
      { x: 900, shape: 'row', n: 4, step: 2 },
      { x: 912, shape: 'row', n: 4, step: 2 },
      { gap: 72, shape: 'arc' }, { gap: 166, shape: 'arc' }, { gap: 232, shape: 'arc' },
      { gap: 350, shape: 'arc' }, { gap: 358, shape: 'arc' }, { gap: 366, shape: 'arc' },
      { gap: 452, shape: 'arc' }, { gap: 501, shape: 'arc' },
      { gap: 680, shape: 'arc' }, { gap: 688, shape: 'arc' }, { gap: 696, shape: 'arc' }, { gap: 704, shape: 'arc' },
      { gap: 846, shape: 'arc' }, { gap: 860, shape: 'arc' },
      { hazard: 134, shape: 'under' }, { hazard: 200, shape: 'under' }, { hazard: 422, shape: 'under' },
      { hazard: 432, shape: 'under' }, { hazard: 552, shape: 'under' }, { hazard: 748, shape: 'under' },
      { hazard: 764, shape: 'under' }, { hazard: 853, shape: 'under' }, { hazard: 870, shape: 'under' }
    ],

    decor: [
      { x: 2, sprite: 'decor_hole' },
      { x: 8, sprite: 'sign_type' }
    ],

    boss: {
      kind: 'ratchet',
      label: 'RATCHET',
      speech: 'TICK TOCK! WORDS INTO COGS!',
      tips: { shock: 'JUMP THE GEAR', pick: 'DUCK THE PENDULUM' },
      minionSkin: 'en_baronet'
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
```

---

## Appendix C: the art data

Starting values for M2, M4 and M5, in the form the code holds them, so that they can be pasted in and then changed by the art pass of 13.6. Colour numbers are palette indices (DESIGN 14.2): INK 0, SHADOW 1, STONE 2, SILVER 3, WHITE 4, DEEP_BLUE 5, DEEP_TEAL 9, TEAL 10, AQUA 11, GRASS 14, LIME 15, BRONZE 16, ORANGE 17, GOLD 18, MAROON 24, PLUM 28.

**Manifest rows** (`MANIFEST_C` and `MANIFEST_D` in `js/core.js`: name, w, h, frame names, fps, ax, ay). A row with a Level 1 name beside it is a copy of that sprite's row, which is what the skins rule of 4.5 checks. All 51 sprites of 3.3 to 3.5 are here.

```js
// MANIFEST_C: js/sprites-chars.js (WP-C)
['en_dangle',        16, 16, 'hang0 hang1 zip',            4,  8, 16],
['en_flit',          24, 16, 'flap0 flap1 dive',           8, 12, 16],   // en_swoop
['en_glimmer',       16, 16, 'fly0 fly1',                 16,  8, 16],   // en_buzzle
['en_baronet',       16, 16, 'peek up spin',               0,  8, 16],   // en_digby
['boss2_body',       48, 32, 'b0 b1',                      0, 24, 32],   // boss_body; fps 0, the renderer picks the frame (10.1)
['boss2_head',       32, 24, 'normal laugh hurt dizzy',    0, 16, 24],   // boss_head
['boss2_arm',        16, 16, 'rest raise throw watch',     0,  8,  8],   // boss_arm, plus watch
['boss2_key',        16, 16, 'k0 k1 k2 k3',                0,  8,  8],
['boss2_engine',     48, 16, 'shut open',                  0, 24, 16],   // boss_mound's size and anchor
['boss2_goggles',     8,  8, 'goggles',                    0,  4,  4],   // boss_monocle
['pr_cog',           12, 12, 'k0 k1',                     10,  6, 12],   // pr_rock
['pr_rollgear',      16,  8, 's0 s1',                     10,  8,  8],   // pr_shock
['pr_pendulum',      16, 16, 'p0 p1 p2 p3',               12,  8, 16],   // pr_pickaxe

// MANIFEST_D: js/sprites-world.js (WP-D)
['tile_cave_top',    16, 16, 'g0 g1',                      0,  0,  0],   // tile_grass
['tile_cave_fill',   16, 16, 's0 s1',                      0,  0,  0],   // tile_soil
['tile_cave_edge_l', 16, 16, 'edge',                       0,  0,  0],   // tile_edge_l
['tile_cave_edge_r', 16, 16, 'edge',                       0,  0,  0],   // tile_edge_r
['tile_cave_wall_l', 16, 16, 'wall',                       0,  0,  0],   // tile_wall_l
['tile_cave_wall_r', 16, 16, 'wall',                       0,  0,  0],   // tile_wall_r
['tile_pool',        16, 16, 'w0 w1',                      3,  0,  0],   // tile_water
['tile_girder',      16, 16, 'plank',                      0,  0,  0],   // tile_plank
['tile_clockfloor',  16, 16, 'a0 a1',                      0,  0,  0],   // tile_arena
['haz_crystal',      16, 16, 'bramble',                    0,  0, 16],   // haz_bramble
['haz_pipe',         16, 16, 'branch',                     0,  0, 16],   // haz_branch
['haz_pipe_riser',   16, 16, 'trunk',                      0,  0, 16],   // haz_trunk
['haz_lantern',      16, 24, 'hive',                       0,  0, 24],   // haz_beehive
['haz_chain',        16, 16, 'rope',                       0,  0, 16],   // haz_rope
['haz_tunnel',       48, 16, 'arch',                       0,  0, 16],   // haz_arch
['haz_ceiling',      48, 16, 'canopy',                     0,  0, 16],   // haz_canopy
['haz_column',       16, 16, 'trunk',                      0,  0, 16],   // haz_trunk
['pw_watch',         16, 16, 'p0 p1',                      4,  8, 16],   // every pw_ row
['fx_cogbit',         8,  8, 'c0 c1',                      0,  4,  4],   // fx_chunk
['fx_flake',          8,  8, 'f0 f1',                      6,  4,  4],   // fx_feather
['decor_hole',       32, 32, 'hole',                       0,  0, 32],
['bg_mist',          64, 16, 'm0 m1',                      2,  0, 16],
['bg_gearstar',       8,  8, 's0 s1',                      2,  0,  8],   // bg_star
['bg_clockface',     48, 48, 'c0 c1',                      1,  0, 48],
['bg_cave_far',     128, 48, 'w0 w1',                      2,  0, 48],
['bg_cave_mid',     128, 56, 'wall',                       0,  0, 56],
['bg_roots',         32, 24, 'roots',                      0,  0, 24],
['bg_lantern',       16, 24, 'l0 l1',                      3,  0, 24],
['bg_cog_l',         48, 48, 'c0 c1 c2 c3',                4,  0, 48],
['bg_pipe_v',        16, 48, 'pipe',                       0,  0, 48],
['bg_crystal_l',     32, 24, 'crystal',                    0,  0, 24],
['bg_stalagmite',    16, 24, 'spike',                      0,  0, 24],
['bg_pipe_h',        32, 16, 'pipe',                       0,  0, 16],
['bg_baronpeek',     16, 16, 'out in',                     1,  0, 16],
['bg_rail',          32,  8, 'rail',                       0,  0,  8],
['bg_boiler',        32, 32, 'b0 b1',                      2,  0, 32],
['bg_crystal_s',     16, 16, 'crystal',                    0,  0, 16],
['fg_stalagmite',    16,  8, 't0 t1',                      0,  0,  8]    // fg_tuft
```

**Remaps** (3.1). A colour that is not listed is unchanged.

```js
// js/sprites-chars.js: the frog and its lily pad, through theme.skins
TG.Remaps.tin = { 14: 16, 15: 18, 4: 3 };   // GRASS -> BRONZE, LIME -> GOLD, WHITE -> SILVER

// js/sprites-world.js: section 2 and the arena
TG.Remaps.brass = {
  2: 16,     // STONE -> BRONZE: rock faces become brass plate
  10: 18     // TEAL -> GOLD: moss specks become rivets
};

// js/sprites-world.js: section 3
TG.Remaps.crystal = {
  28: 5,     // PLUM -> DEEP_BLUE: the ceiling rim follows the band
  16: 9,     // BRONZE -> DEEP_TEAL: metal goes cold
  18: 11,    // GOLD -> AQUA: the far wall's lamp dots become crystal glints
  17: 10     // ORANGE -> TEAL
};
```

**The backdrop**, in the form of `TG.Backdrops.meadow` (CONTRACT 6.5), with the three new palette keys of 3.3.

```js
// js/sprites-world.js. All positions are screen px; x is the left of a piece and y its bottom.
// The first band of each sky is the plate band and runs from y 0: drawSky applies slowSky and the
// phase colour to the first band only.
TG.Backdrops.cavern = {
  palettes: {
    lantern: { sky: [ { y: 0, h: 150, color: 28 }, { y: 150, h: 34, color: 28, dither: 1 } ], remap: null, slowSky: 5 },
    brass:   { sky: [ { y: 0, h: 150, color: 28 }, { y: 150, h: 34, color: 28, dither: 1 } ], remap: 'brass', slowSky: 5 },
    crystal: { sky: [ { y: 0, h: 150, color: 5 }, { y: 150, h: 34, color: 5, dither: 9 } ], remap: 'crystal', slowSky: 28 },
    clock: {
      sky: [ { y: 0, h: 150, color: 28 }, { y: 150, h: 34, color: 24, dither: 28 } ],
      remap: 'brass',
      slowSky: 5,
      phases: { 2: { color: 28, dither: 24 }, 3: { color: 0, dither: 28 } },   // PLUM with MAROON; INK with PLUM
      starSprite: 'bg_gearstar',
      stars: [
        { x: 22, y: 72 }, { x: 58, y: 112 }, { x: 118, y: 64 }, { x: 166, y: 100 },
        { x: 204, y: 128 }, { x: 236, y: 76 }, { x: 258, y: 116 }, { x: 350, y: 124 }
      ],
      moonSprite: 'bg_clockface',
      moon: { x: 328, y: 84 }                  // x 328 to 376, y 36 to 84: clear of every plate (3.1)
    }
  },
  layers: [
    { id: 'mist', factor: 0.1, drift: 1, repeat: 512, items: [
      { sprite: 'bg_mist', x: 40,  y: 72,  sections: [0, 1, 2] },
      { sprite: 'bg_mist', x: 230, y: 108, sections: [0, 1, 2] },
      { sprite: 'bg_mist', x: 400, y: 56,  sections: [0, 1, 2] }
    ] },
    { id: 'far', factor: 0.2, drift: 0, repeat: 128, items: [
      { sprite: 'bg_cave_far', x: 0, y: 168 }
    ] },
    { id: 'mid', factor: 0.4, drift: 0, repeat: 384, items: [
      { sprite: 'bg_cave_mid',  x: 0,   y: 184 },
      { sprite: 'bg_cave_mid',  x: 128, y: 184 },
      { sprite: 'bg_cave_mid',  x: 256, y: 184 },
      { sprite: 'bg_roots',     x: 40,  y: 40,  sections: [0] },
      { sprite: 'bg_roots',     x: 170, y: 40,  sections: [0] },
      { sprite: 'bg_roots',     x: 300, y: 40,  sections: [0] },
      { sprite: 'bg_lantern',   x: 96,  y: 184, sections: [0, 1] },
      { sprite: 'bg_lantern',   x: 290, y: 184, sections: [0, 1] },
      { sprite: 'bg_cog_l',     x: 200, y: 184, sections: [1, 3] },
      { sprite: 'bg_pipe_v',    x: 60,  y: 184, sections: [1] },
      { sprite: 'bg_pipe_v',    x: 330, y: 184, sections: [1] },
      { sprite: 'bg_crystal_l', x: 30,  y: 184, sections: [2] },
      { sprite: 'bg_crystal_l', x: 150, y: 184, sections: [2] },
      { sprite: 'bg_crystal_l', x: 300, y: 184, sections: [2] }
    ] },
    { id: 'near', factor: 0.7, drift: 0, repeat: 384, items: [
      { sprite: 'bg_molehill',   x: 60,  y: 184, sections: [0] },
      { sprite: 'bg_molehill',   x: 200, y: 184, sections: [0] },
      { sprite: 'bg_molehill',   x: 330, y: 184, sections: [0] },
      { sprite: 'bg_stalagmite', x: 20,  y: 184, sections: [0, 2] },
      { sprite: 'bg_stalagmite', x: 250, y: 184, sections: [0, 2] },
      { sprite: 'bg_pipe_h',     x: 96,  y: 184, sections: [1, 3] },
      { sprite: 'bg_pipe_h',     x: 128, y: 184, sections: [1, 3] },
      { sprite: 'bg_baronpeek',  x: 160, y: 184, sections: [1] },   // at the open end of the pipe
      { sprite: 'bg_boiler',     x: 40,  y: 184, sections: [3] },
      { sprite: 'bg_boiler',     x: 232, y: 184, sections: [3] },
      { sprite: 'bg_crystal_s',  x: 110, y: 184, sections: [2] },
      { sprite: 'bg_crystal_s',  x: 210, y: 184, sections: [2] },
      { sprite: 'bg_crystal_s',  x: 340, y: 184, sections: [2] }
    ] },
    { id: 'rails', factor: 0.7, drift: 0, repeat: 32, items: [
      { sprite: 'bg_rail', x: 0, y: 184, sections: [2, 3] }
    ] },
    { id: 'fg', factor: 1.3, drift: 0, repeat: 256, front: true, items: [
      { sprite: 'fg_stalagmite', x: 16,  y: 216 },
      { sprite: 'fg_stalagmite', x: 120, y: 216 },
      { sprite: 'fg_stalagmite', x: 200, y: 216 }
    ] }
  ]
};
```
