# SPELL RUNNER: Game Design Document

Version 1.1. Scope: Level 1 only, built so that further levels are new data files.

This document describes what the game is and how it should play. The companion file `docs/CONTRACT.md` describes how the code is divided and how the parts fit together. Names used here (threat kinds, events, sprites, sounds, settings) match the names in the contract.

Two things to know before reading the numbers:

- The tuning numbers in sections 4.1, 9.1 and 11 (timings, counts of threats, boss values) are **starting values**. They were set from arithmetic and a model, before the game existed. The contract (section 12.1) says who may change them, by how much, and how changes are written back here.
- Section 19 sorts the features into two priority tiers. Tier 2 features are built last and may be left out.

Conventions used in this document:

- All distances are in pixels at the internal resolution of 384 x 216.
- Where three values appear as `a / b / c` they are Easy / Medium / Hard.
- A "tile" is 16 px. Level positions are given in tiles from the start of the level.
- Three kinds of seconds are used. They are defined in section 3.2 and matter for every timing number in this document.

---

## 1. Overview and title

**Title:** SPELL RUNNER. (Working title. It has not been checked against existing products; check before any public release.)

**Premise, shown on the title screen after a short idle period:**
"BARON VON BURROW HAS DUG UP THE MEADOW AND CARRIED OFF ITS WORDS. PIP THE SCRIBE SETS OUT TO SPELL THEM BACK."

**What the player does.** Pip runs automatically from left to right through a side-scrolling level. Creatures and objects approach from the right, from behind, from above and from below. Each one shows a word. Typing the word sends the creature away. Gaps in the ground are jumped and low overhead hazards are ducked. At the end of the level Pip meets the Baron, who is defeated by typing.

**Tone.** Nothing dies. Creatures are under a word spell; typing the word breaks it and they bounce, spin or float away. Losing a life looks mild: Pip stumbles and blinks.

**Hero.** Pip, an apprentice scribe. Red cap, red scarf trailing behind, teal tunic, white quill held forward. On each correct letter an ink spark shows at the quill tip. When a word is completed an ink bolt flies from the quill to the target, so the player sees the cause of the clear.

**Level 1.** QUILL MEADOWS. Sunny grassland with hills, a windmill, an orchard and a brook. Time of day moves from morning to dusk across the level. Boss: Baron von Burrow, a large mole in a brass miner's helmet.

**Style target.** Late NES / Master System, about 1989 to 1991, with more parallax layers than those machines had.

**Platform.** Browser, no dependencies, no build step, runs from `index.html` by double-click. Canvas 2D and Web Audio only. All art is pixel data in JavaScript and all sound is synthesised.

**Length.** About 6 minutes on Easy, 5 on Medium and 4.5 on Hard, including the boss.

---

## 2. Controls

| Action | Keys | On-screen | Notes |
|---|---|---|---|
| Type a letter | A to Z | none | Case-insensitive. Words never need Enter. Key auto-repeat is ignored. |
| Jump | Space, ArrowUp | JUMP button | Fixed height. A tap gives the full jump. |
| Duck / slide | Enter, ArrowDown, semicolon | DUCK button | A tap gives a slide of fixed minimum length. Holding extends it. |
| Release the locked word | Backspace | none | The word's progress returns to zero. Straight after a wrong key, Backspace only takes that mistake back and keeps the progress; a second Backspace releases (section 3.3). |
| Pause | Esc | none | The game also pauses when the window loses focus. A resume countdown that is running then goes back to the pause menu, and the continue countdown of game over waits until the window has focus again. |
| Menus | Arrow keys, Enter or Space to confirm, Esc to go back | none | Difficulty can also be chosen by typing EASY, MEDIUM or HARD. |

**Recommended duck key: Enter.** It is shown on the How to Play screen. It is reached with the right little finger from the home row, it is in the same place on every keyboard layout, and it is free because words are never submitted. Semicolon is also accepted because it sits under the right little finger on US and UK layouts. On layouts where that key types a letter (for example AZERTY), it types the letter and does not duck. ArrowDown is accepted for players who prefer arrows.

Keys that are avoided on purpose: Shift (can open the Sticky Keys dialog), Tab (moves focus), Ctrl and Alt (browser shortcuts). Combinations with Ctrl or Cmd are left to the browser.

**No letter key has any function other than typing during play.**

**Jump details.** Coyote time 0.10 s and input buffer 0.15 s (both world seconds). No double jump. Damage never alters a jump arc.

**Slide details.** Pressing duck again during a slide restarts the minimum duration. Jump cancels a slide. Typing works in every hero state: running, airborne, sliding and while invulnerable.

**On-screen buttons.** JUMP (red, on the right) and DUCK (blue, on the left) are HTML buttons of at least 64 x 64 CSS px. They sit outside the canvas so they never cover the playfield, and they are always fully visible without scrolling. They work with mouse and touch and never take keyboard focus.

Where the buttons go depends on the space around the canvas (section 14.1 has the scale rule):

- If the canvas can be shown at 2x or more and the margin on each side of it is then at least 72 CSS px wide, DUCK goes in the left margin and JUMP in the right margin, level with the bottom of the canvas.
- Otherwise both go in a strip 72 CSS px high directly below the canvas, DUCK at the left end and JUMP at the right end. The canvas scale is then chosen from the window height minus 72 px.
- In a short, wide window (a phone held sideways, a low browser window) where that would leave the canvas below 2x, the buttons go in the side margins instead whenever that gives the canvas a larger scale (the canvas then fits the width minus two 72 px margins, or the full height).

**A keyboard is needed.** The game has no text field, so a phone or tablet shows no on-screen keyboard, and only typing READY starts a run. When the first input is a touch and no key has been pressed yet, the boot, title and How to Play screens say "SPELL RUNNER NEEDS A KEYBOARD." (How to Play adds "CONNECT ONE, THEN TYPE READY."). The first key press removes the line.

**Non-QWERTY layouts.** Typing reads the character produced by the key, so every Latin layout works. The Easy word tiers (home row first) assume QWERTY; the Options screen says so. A non-Latin layout (Cyrillic, Greek, Hebrew, Arabic and so on) cannot type the English words, and a player who has one switched on by accident would otherwise get no response at all, so a letter key that produces a letter outside a to z types the letter of the same key position on a QWERTY keyboard.

---

## 3. Core loop

### 3.1 The loop

1. A threat appears with a word on a plate above it.
2. The player types the first letter. This locks on to that threat. Brackets appear around it and its word is mirrored in large letters in the type bar at the bottom of the screen.
3. Each correct letter lights up on the plate, makes the threat flinch and plays a rising note.
4. The last letter clears the threat on the same frame: the ink bolt flies, the clear animation plays, the letters fly to the score.
5. Between words the player jumps gaps and ducks under low hazards. Each of these has a signpost.

### 3.2 Time model

The game has one world clock that can run slower or faster than real time. This keeps level geometry identical on every difficulty and lets the game slow down for a player who needs it.

| Term | Meaning |
|---|---|
| Real seconds | Wall-clock time. Used for typing statistics, invulnerability, power-up durations and screen timers. |
| World seconds (ws) | Time on the world clock. Used for Pip's physics, scrolling, threat movement and boss timers. |
| Nominal seconds | Real seconds when `assist` is 1.0 and no slow effect is active. Tuning tables for threats and the boss are written in nominal seconds. nominal = ws / pace. |
| `pace` | Set by difficulty: 0.75 / 1.0 / 1.25. |
| `assist` | Adaptive pacing, 0.60 to 1.00. Section 9.3. |
| `slow` | 0.5 while the Hourglass is active, otherwise 1. |
| `tutor` | 0.25 during a tutorial slow-down (section 3.5), otherwise 1. |
| `finisher` | 0.25 during the boss finisher (section 11.6), otherwise 1. |
| `timeScale` | pace x assist x slow x tutor x finisher. Each simulation step advances the world clock by dt x timeScale. |

Pip's physics are defined once in world units:

| Value | World units | Real, Easy / Medium / Hard at assist 1.0 |
|---|---|---|
| Run speed | 64 px/ws | 48 / 64 / 80 px/s |
| Jump distance | 48 px | same on all |
| Jump apex height | 40 px | same on all |
| Jump airtime | 0.75 ws | 1.0 / 0.75 / 0.6 s |
| Tap slide distance | 56 px | same on all |
| Tap slide duration | 0.875 ws | 1.17 / 0.875 / 0.7 s |

Because jump and slide cover the same distance at every time scale, each gap and branch is validated once.

### 3.3 Targeting (lock-on)

- With no lock, a letter locks the typable thing whose word starts with that letter. Active words never share a first letter (section 10.4), so normally one thing matches. If several ever match, threats are preferred over crates, then the one with the shortest time to impact.
- While locked, keys apply only to the locked word until it is complete, the lock is released, or the target is gone.
- **Backspace** releases the lock and resets that word's progress to zero. A wrong key is never added to the word, so there is nothing to delete after a typo: a Backspace pressed straight after a wrong key on the locked word only takes that mistake back, and the lock and progress stay. A second Backspace in a row, or one after a correct key, releases. Backspace does not reset the count of wrong keys in a row used by auto-release.
- **Auto-release** (Easy and Medium): if the locked word has 2 or fewer letters typed and three wrong keys are pressed in a row, the lock is released. If those wrong keys, less any taken back with Backspace, spell the start of another word, the player has moved on to that word without Backspace: it is locked with those letters typed, and they count as correct keys, not misses. Otherwise the third key is tried as a new lock. On Hard only Backspace releases.
- **Spillover guard:** when a locked target is lost for any reason other than being completed (it reached Pip, left the screen or was cleared by an Ink blast), letter keys are ignored for 0.25 s. They count as neither hits nor misses.
- A letter pressed when nothing typable exists is ignored and does not count against accuracy.
- A letter that matches no word while at least one word is visible counts as a wrong key.
- Power-up crates lock only when no threat matches the letter.
- A threat is typable from the moment its word is shown, including while its sprite is still outside the playfield and represented by an edge tag (section 4.3).

### 3.4 Keystroke response

Everything in a row happens on the same frame as the key.

| Event | Simulation | Screen | Sound |
|---|---|---|---|
| Lock acquired | Lock set, progress 1 | GOLD plate border, animated corner brackets around the sprite, other plates dim to SILVER, word appears in the type bar | `lock_on` |
| Correct letter | Progress +1, +10 points. A moving threat's clock pauses for 0.20 / 0.12 / 0.06 nominal s. Letters typed again after the word was released earn neither, so releasing and retyping cannot hold a threat back | Letter turns GOLD and sits 1 px higher; ink spark at the quill; target flashes white for 2 frames | `key_ok`, one pentatonic step higher per letter |
| Wrong letter | No progress lost, no input lockout | Plate shakes 2 px for 0.15 s with a RED border; the expected letter blinks | `key_bad`, quieter than `key_ok` |
| Word complete | Threat removed, score added | Ink bolt, white flash, clear animation, letters fly to the score, score popup, 1 px shake for 0.1 s | `word_clear` plus the threat's sound family |
| Lock released | Progress reset to 0 | Brackets disappear | `lock_release` |

After three wrong keys on the same letter, the key guide flashes that key (if the guide is on) and the expected letter is drawn enlarged in the type bar.

### 3.5 Tutorial slow-down

The first three threats of Level 1 are marked as tutorial threats. For a tutorial threat, if 60% of its time has passed and no letter of it has been typed, the world slows to 25% and a prompt appears above the type bar: `TYPE: ASK`. The slow-down ends on the first correct letter.

This applies on Easy every run. On Medium and Hard it applies only until the player has passed the first checkpoint once (stored in settings as `tutorialDone`).

### 3.6 Frame timing

The simulation runs at a fixed step of 1/60 s. At most 5 steps run per displayed frame. If a frame takes longer than 0.25 s (for example after the tab was in the background), the game pauses.

---

## 4. Threats: typable enemies and obstacles

### 4.1 How a threat's time is set

Every threat gets a **budget** when it appears. The budget is the time from the word being shown to the threat reaching Pip. Movement is derived from the budget, so a longer word always gets more time.

```
base budget (nominal s)  = react + perChar x wordLength
                           react   = 1.8 / 1.2 / 0.7
                           perChar = 1.0 / 0.5 / 0.3
```

These correspond to a typing pace of 12 / 24 / 40 WPM after the reaction time. A player at the design speed for the difficulty (15 / 30 / 50 WPM) uses about three quarters of each budget.

Three rules can lengthen a budget. They never shorten it.

1. **Queue rule.** A new word's budget is at least `react + perChar x (R + wordLength) + 0.4 x react x A`, where A is the number of words already active (threats and crates) with letters still untyped and R is the number of those letters. The last term allows for the time it takes to move attention from one word to the next. Words therefore run out in the order they appeared, and each one can be finished at the budget pace even if the player types them strictly in order.
2. **Impact spacing.** A new word runs out at least 3.5 / 1.5 / 0.9 nominal s after the latest one already scheduled.
3. **Hazard keep-clear.** If a threat's predicted arrival point falls within a jump or duck hazard's input window, or within 1.2 / 0.75 / 0.5 nominal s of run distance either side of it, the budget is extended so the threat arrives just past that zone.

First appearances of a new direction (marked `intro` in the level data) and tutorial threats use 1.5 x the base budget.

**Crates** take part in rules 1 and 2 in both directions: a crate's budget is the largest of 1.5 x its base budget, the queue value and the spacing value, and a crate with letters still untyped counts in A and R for whatever appears after it. A player who is part-way through a crate word when a threat appears is therefore given time for both. For a crate the budget is the time until it has drifted off the screen. Crates skip rule 3, because a crate never reaches Pip.

The number of threats active at once is capped per section (section 9.1). A spawn that would exceed the cap waits until a slot is free. Crates do not count towards the cap.

### 4.2 Threat table

Word length ranges are for section 1. Sections 2 and 3 add a length shift (section 9.1), and the picker intersects the range with the words available in the section's tiers (section 10).

| Name | What it is | Arrives from | Movement | Word length E / M / H | Clear animation | Sound family |
|---|---|---|---|---|---|---|
| Boulder | Object, 24x32 | Right, on the ground | Stationary. Placed in the world ahead of Pip when it appears; Pip runs up to it | 2-4 / 4-6 / 5-9 | Cracks a little more with each letter, then crumbles into 6 bouncing chunks | CRUNCH |
| Dawdle | Snail, 16x16 | Right, on the ground | Crawls slowly; carries the longer words | 3-5 / 5-8 / 7-10 | Retracts into its shell, which spins like a top and rolls off to the right leaving stars | TWANG |
| Hoppet | Frog, 16x16 | Right, on the ground | Hops in 24 px arcs, 10 px high | 2-4 / 4-6 / 5-8 | Inflates, pops into confetti; a lily pad floats down | POP |
| Buzzle | Bee, 16x16 | Right, at head height | Flies level with a 4 px bob | 2-4 / 4-6 / 5-8 | Spirals upward and turns into a flower that drifts down | POP |
| Swoop | Crow, 24x16 | Above | Enters from the top, hovers ahead of Pip, then dives at Pip's head. A marker on the ground shows where the dive will land | 3-4 / 5-6 / 6-9 | Puff of feathers drifting down; the crow flaps off to the left | CRUNCH |
| Truffle | Boar, 24x16 | Behind, on the ground | Appears at the left edge, keeps pace there, then charges | 2-3 / 4-5 / 5-7 | Skids to a halt in dust, turns and runs off to the left | BONK |
| Digby | Mole minion, 16x16 | Below | Tunnels under the ground just ahead of Pip, shown by a rumbling mound that keeps pace with him. The mole rises out of the ground in the last part of its time | 3-4 / 5-6 / 6-8 | Helmet pops off, the mole spins back into its hole and a daisy grows | BONK |
| Rock | Boss projectile, 12x12 | Right (arc) or above | Lobbed by the Baron. From phase 2, one rock per volley is thrown high and falls from above | 2-4 / 4-5 / 5-7 | Reverses, flies back and bounces off the Baron's helmet | POP |
| Crate | Balloon crate, 16x32, friendly | Right, top of the screen | Drifts left, bobbing. Harmless | 3-5 / 5-8 / 7-10 | Balloon pops, crate drops and breaks, the item hops to Pip | POP |

Colour rule: each enemy uses 3 colours plus the INK outline. Digby wears the same gold helmet as the Baron.

### 4.3 Movement detail

Each threat has a clock `age` that runs on the world clock and pauses briefly on each correct letter. `t = age / budget`. Positions are relative to Pip so that contact happens at `t = 1`. `dx` is the horizontal distance from Pip (positive is ahead). `B` is the budget in world seconds. `contact` is half Pip's hitbox width plus half the threat's hitbox width.

| Kind | Path |
|---|---|
| Boulder | Placed at `pip.x + contact + 64 x B` at the moment it appears. Does not move and has no letter stall. B is at least 4.4 ws so it starts at or beyond the right edge. Its `t` is worked out from the distance Pip still has to run (`t = 1 - (dx - contact) / (64 x B)`), so `t = 1` is the moment Pip reaches it |
| Dawdle, Hoppet, Buzzle | Closing speed `c = max(64 + minSpeed, 280 / B)` px/ws with minSpeed 6 / 20 / 28 for Dawdle / Hoppet / Buzzle. `dx = contact + min(c x B x (1 - t), hold)` with `hold = 264 - 16 x k`, where k is the number of creatures already waiting at the right edge when this one appears |
| Swoop | First 15% of the budget: descends from above the top edge to a hover point at dx = 120, 120 px above the ground. Hovers until t = 0.65, then dives on an ease-in curve to dx = 0, 12 px above the ground, at t = 1 |
| Truffle | `c = max(40, 110 / B)`. `dx = -(contact + min(c x B x (1 - t), 64))` |
| Digby | Until t = 0.85 the mole is underground, 56 px ahead of Pip, and keeps pace with him. A mound on the ground marks the spot and shakes faster as t grows. From t = 0.85 to t = 1 the mole rises out of the mound (16 px, its full height) and dx shrinks from 56 to `contact` |
| Rock | Arc from the Baron's raised arm (dx = 190, 40 px up) to Pip's chest (dx = 0, 8 px up) with 50 px of extra height at mid-flight. A high rock leaves through the top of the screen and falls to the same point |
| Crate | Drifts from the right edge to the left edge 100 px above the ground over its budget |

**Waiting at the edge.** A budget can be much longer than the time a creature needs to cross the screen, because the queue rule adds time for the words ahead of it. The `min(...)` terms above keep the sprite on screen for the whole of its budget: a Dawdle, Hoppet or Buzzle waits just inside the right edge, and a Truffle just inside the left edge, moving along with Pip, and starts to close in when the distance it has left to cover is smaller than its waiting distance. Creatures that wait at the right edge at the same time stand 16 px apart. Contact still happens at `t = 1`, so budgets are not changed by this rule.

**Edge tags.** When a threat's sprite is outside the playfield, its word plate is pinned to the edge it will enter from, with a blinking chevron pointing to where it will enter. The word is already typable. This applies to a Boulder that is still beyond the right edge (right tag), a Swoop or a high rock above the top (top tag), and a Digby that is still underground (bottom tag, pinned just above the ground line over the mound).

**Warning beep.** `warn` plays when a threat appears from behind, above or below, and when a threat from the right starts outside the screen. It is pitched by direction and panned left for threats from behind (section 15.2).

**Urgency.** When a threat has less than 1.5 / 1.2 / 0.9 real seconds left, its plate border blinks RED at 4 Hz and a tick plays.

### 4.4 Contact and fairness rules

- **Typable threats cannot be dodged.** A threat whose word is not finished reaches Pip when its time runs out (`t = 1`), whether Pip is running, in the air or sliding. Typing the word is the only way to stop it. This keeps typing at the centre of the game: jump and duck are for the hazards of section 5 and for the Baron's physical attacks, which have no word.
- If Pip is in the air or sliding at the moment of contact, the hit is shown at Pip's position (hurt frame and hit effect), so the cause is clear.
- For hazards and boss attacks, contact is decided by hitbox overlap. Their hitboxes are inset 2 px on each side.
- Contact removes the threat, so the player is never blocked.
- Contact while Pip is invulnerable or shielded removes the threat without costing a life.
- The hazard keep-clear rule (section 4.1) means a threat does not arrive while Pip has to jump or duck.
- No two active words start with the same letter, and no active word is a prefix of another (section 10).

### 4.5 Word plates

- 8x8 font, uppercase. Plate: INK rectangle, width 8n + 2, height 10, placed 4 px above the sprite and clamped to the playfield (y from 24 to 174, 2 px from the side edges).
- Untyped letters WHITE. Typed letters GOLD and raised 1 px. The next letter has a 1 px AQUA underline. Progress is therefore shown by position and shape as well as colour.
- Plates never overlap. They are placed in order (locked plate first, then by time to impact) and a plate that would overlap moves up in 10 px steps. A 1 px tail points to its owner.
- Crate plates have a GRASS border so they read as friendly.
- Boss weak-point and finisher words are drawn at 2x on a plate at the top centre of the playfield.

### 4.6 Universal clear sequence

1. Ink bolt (8x8, 2 frames) travels from the quill to the target in 6 frames.
2. Target flashes all-white for 3 frames.
3. The kind-specific animation from the table plays.
4. Each letter of the word becomes an 8x8 GOLD letter particle, bursts upward, then flies to the SCORE counter over 30 frames. While a letter is in the playfield it passes under the word plates and under the score and CLEAN / SUPER popups, so it never covers the next word or the popups; above the playfield it is drawn over the HUD as it reaches the score.

The simulation removes the threat on the frame the word is completed. Steps 1 to 4 are presentation only and cannot delay or block anything.

If the threat's sprite is outside the playfield when its word is completed (for example a Boulder still beyond the right edge), the sequence plays at the position of its edge tag, so the player always sees the result of the word.

Boss weak-point and finisher words use steps 1 and 4 as well: the ink bolt flies to the Baron and the letters fly to the score.

---

## 5. Jump and duck hazards

Hazards never carry a word. Each has a blinking 8x8 GOLD chevron above it (up for jump, down for duck) and a CORAL accent, so they differ from typable threats in shape as well as colour.

| Hazard | Size | Action | Input window | Look |
|---|---|---|---|---|
| Narrow crevasse | 16 px wide | Jump | 36 px before the edge to 4 px past it | Soil walls with animated water in sections 1 and 2, darkness in section 3 |
| Wide crevasse | 32 px wide | Jump | 20 px before the edge to 4 px past it, plus coyote time | Same. The widest gap in Level 1 |
| Bramble | 16 wide, 8 tall (collision box 8 wide, centred) | Jump | 27 px to 5 px before it | FOREST bush with CORAL thorns |
| Low branch | 16 wide, underside 14 px above the ground | Duck | 34 px to 6 px before it | BARK branch with LIME leaves hanging from a trunk that rises into a tree crown at the top of the playfield (FOREST and PINE, low in contrast) |
| Hanging beehive | 16 wide, underside 14 px above the ground | Duck | Same as the branch | Swings 6 px either way (cosmetic; the collision box is fixed) |
| Long arch (Tier 2) | 48 wide, underside 14 px above the ground | Hold duck | Press 34 px to 6 px before it and hold until 6 px past it | Bramble arch on two trunks under one tree crown, with HOLD above its chevron. Appears once in Level 1, in section 3, with no threat arriving nearby |
| Boss shockwave | 16 wide, 8 tall | Jump | When it is 0.05 to 0.45 ws from Pip | Dust ring travelling along the ground at 160 px/ws relative to Pip |
| Boss pickaxe | 16x16 | Duck | When it is 0.05 to 0.60 ws from Pip | Spins at head height at 160 px/ws relative to Pip |

**Signposts.** A wooden post with an arrow stands at the best take-off point inside each input window. The rule the player learns is "press when Pip reaches the post". For a crevasse the post is where the ink arc starts, 24 px before the middle of the gap (20 px into a narrow gap's window, 12 px into a wide one's). For a bramble it is 10 px into the window and for a branch, beehive or arch 12 px. A press up to 10 px either side of the post clears the hazard on every difficulty. The first pixel of a crevasse's window is also the earliest take-off that reaches the far side, so a post there would drop a player who pressed a moment early.

**Audio cue.** On Easy and Medium a rising cue (`cue_jump`) plays when Pip enters a jump window and a falling cue (`cue_duck`) when Pip enters a duck window. The cue is a signal to react to, so it stays at the start of the window: a reaction to it lands near the post.

**Key prompts.** On Easy, the first three jump hazards and the first three duck hazards show the key above Pip (a SPACE keycap or an ENTER keycap), pressing, from the moment Pip enters the window. Like the audio cue it is a signal to react to, so it does not appear before the window opens. On Easy the arch also shows its ENTER keycap, with HOLD above it, whatever the count, because it is the one hazard that needs the key held.

**Teaching the hold.** A tapped duck gives a 56 px slide and the arch needs about 70 px, so a tap clears it only by luck, and every duck hazard before it teaches a tap. So on every difficulty a GOLD "HOLD" stands above the arch's chevron, blinking and steady with it (on Easy it gives way to the keycap's HOLD while the ENTER keycap shows, so the two labels do not overlap); How to Play says "HOLD FOR ARCHES"; and after the arch hits Pip the tip line says "TIP: HOLD ENTER UNDER THE ARCH", also when a shield took the hit and no life was lost.

**Ink drops** are laid along the ideal jump arc over each crevasse and in a row under each duck hazard. They act as a timing guide. The arc is symmetrical about the middle of the gap (Appendix B).

**Layout rules.**
- Landing platforms between gaps are at least 4 tiles.
- A jump hazard and a duck hazard are at least 6 tiles apart.
- Some gaps and hazards are tagged Medium-and-up. On Easy a tagged gap is covered by a plank bridge from the start and a tagged hazard is absent.

**When Pip falls.** Every crevasse, narrow or wide, must be jumped. While running, Pip is held up by his back foot and the middle of his feet. Once both are over the gap he has the coyote time (0.10 ws) in which a jump still works. If he is still over the gap when it ends, he falls and cannot recover. A jump that comes down with no part of his feet on the far side also ends in a fall.

**Falling into a crevasse.** The world clock stops for 1.0 s. Pip returns in a bubble 24 px past the far edge, loses one life and is invulnerable for the usual time. The lock and word progress are kept. A shield does not prevent a fall.

**Repeat falls.** After one fall at a gap on Easy, or two on Medium, a plank bridge covers it for the rest of the run. The rescue puts Pip past the gap, so the bridge is there when a continue brings Pip back to it.

**Hitting a bramble, branch, beehive or arch** costs a life in the same way as a threat. Pip passes through it and is never stopped.

---

## 6. Lives, damage, checkpoints and continue

| Value | Easy | Medium | Hard |
|---|---|---|---|
| Starting lives | 5 | 4 | 3 |
| Maximum lives | 9 | 9 | 9 |
| Invulnerability after a hit (real s) | 3.0 | 2.5 | 2.0 |
| Lives topped up at a checkpoint to at least | 3 | 2 | no top-up |

**Typing errors never cost a life and never lock out input.**

**On a hit.**
1. If Pip has a shield charge, the charge is used, the threat is removed, Pip is invulnerable for 1.0 s and nothing else happens.
2. Otherwise one life is lost. The world clock stops for 0.10 s (keys are still accepted), the screen shakes 3 px for 0.25 s, Pip shows the hurt frame and then blinks at 10 Hz while invulnerable.
3. The clean-word streak resets to zero.
4. `assist` drops by 0.10 if the hit came from a typable threat (section 9.3).
5. A tip tied to the cause is shown, for example "TIP: TYPE THE NEAREST WORD FIRST" or "TIP: SPACE TO JUMP".

Recovery happens in place. A hit does not send the player back.

**Checkpoints** are at tiles 0, 256, 544 and 880 (the start of each section and the boss). Passing one:
- raises the flag with a chime,
- banks the score and the ink drop count,
- tops up lives (table above),
- awards the checkpoint bonus (section 8.4),
- shows a banner with the section's WPM and accuracy, without stopping play.

**Game over.** When the last life is lost, the music stops, the game over jingle plays and the CONTINUE screen appears with a 9-second countdown. Enter or Space continues. Esc ends the run and goes to the results screen. Input is ignored for the first 0.8 s so that a key meant for a word does not skip the screen. If the countdown reaches zero the run ends.

**Continue.**
- Continues are unlimited, so the level can always be completed.
- Pip restarts at the last checkpoint with the starting number of lives.
- The score and ink drop count return to the values banked at that checkpoint.
- Typing statistics are kept. "CONTINUES USED" is shown on the results screen.
- Plank bridges already earned stay in place.
- Threats and crates on screen leave. Crates after the checkpoint come back, so their power-ups can be collected again.
- An Hourglass or Golden quill that was running ends. Shield charges are kept.
- Music and sound return to their normal state for the section (tempo, all channels playing).
- Pacing eases (section 9.3).
- At the boss checkpoint, the Baron restarts at the beginning of the phase that had been reached.

---

## 7. Collectibles and power-ups

Ink drops are collected by touch. Power-ups arrive in balloon crates and are released by typing the crate's word, so collecting them is also typing practice. A crate stays on screen long enough to be typed after the words that appeared before it (section 4.1). A missed crate drifts away with no penalty and no effect on the streak.

| Item | How collected | Effect | While active |
|---|---|---|---|
| Ink drop | Touch | +10 points. Every 100 gives an extra life. About 150 in Level 1 | `ink_drop` blip |
| Bubble shield | Type the crate word | Force field with 2 / 1 / 1 charges. Each charge absorbs one hit. No timer. At most 2 charges are held | Oval ring around Pip, drawn on alternate frames. Pops with a ring of particles when the last charge is used |
| Hourglass | Type | World at 50% speed for 6 real seconds | Sky colour shifts from SKY to ROYAL; music at 75% tempo |
| Golden quill | Type | Double points for 10 real seconds | Pip's cap and scarf turn GOLD; letter particles turn CREAM |
| Ink blast | Type | Clears every typable threat on screen at once, at half score. Does not affect the Baron's weak-point word | 2-frame white flash; clears staggered 4 frames apart |
| Red cap | Type | +1 life. Two in Level 1 | `one_up` jingle and a "1UP" popup |

**Other ways to gain a shield or a life.**
- Every 30 / 50 / 75 consecutive correct keys gives one shield charge, so accuracy is rewarded as well as speed. (A run has roughly 210 / 450 / 760 correct keys. In a simple model at 95% accuracy these thresholds give about 2.7 / 1.8 / 0.8 charges per run, and at 90% accuracy about 0.9 / 0.2 / 0.0, before the limit on charges held is applied.) The count does not restart when a shield is given: on Easy, charges come at 30, 60 and 90 keys of the same streak. Nothing is given while 2 charges are held.
- Extra lives from score: the first at 5,000 / 10,000 / 15,000 points and then every further 10,000 / 20,000 / 30,000.

**Crate placement in Level 1:** Bubble shield in section 1; Hourglass and Red cap in section 2; Golden quill, Ink blast, Red cap and Bubble shield in section 3.

The HUD power slot shows the most recent timed power-up with a timer bar. Shield charges are shown as icons next to the lives.

---

## 8. Scoring and statistics

### 8.1 Definitions

All statistics use real seconds.

| Statistic | Formula |
|---|---|
| WPM | `12 x sum(length - 1) / sum(tLastKey - tFirstKey)` over all completed words. This is typing speed within words. It leaves out the time spent finding a target and the time between words, so it is comparable to a standard typing test. Time spent on wrong keys inside a word is included |
| Live WPM (HUD) | The same formula over the last 8 completed words. Shown as `---` until 3 words are completed. Refreshed twice per second |
| Peak WPM | The highest value of the formula over any 5 consecutive completed words |
| Accuracy | `correct / (correct + wrong)` letter keys. Ignored and discarded keys are in neither count |
| Reaction time | Time from a word being shown (or the previous word being completed, if later) to its first correct key. Results screen only |
| Key streak | Consecutive correct keys. Resets on any wrong key |
| Clean word | A word completed with no wrong key while it was locked |
| Clean run | Consecutive clean words. This drives the multiplier |
| Per-key interval | Time between consecutive correct keys within a word, attributed to the later letter. First letters and intervals over 2 s are left out |
| Window use `u` | For a cleared threat, its `age` at the moment of the clear divided by its budget. 1.2 for a threat that reached Pip. Threats that leave because of a continue, the start of the boss arena or the finisher are not counted |

The constant 12 comes from 60 seconds per minute divided by 5 characters per word.

### 8.2 Multiplier

| Clean run | 0-2 | 3-5 | 6-9 | 10-14 | 15+ |
|---|---|---|---|---|---|
| Multiplier | x1 | x2 | x3 | x4 | x5 |

- A clean word adds 1 to the clean run.
- A word completed with errors lowers the multiplier by 1 step on Easy and 2 steps on Medium, and returns it to x1 on Hard. The clean run is set to the lowest value of the resulting step.
- Losing a life resets the clean run to 0.
- Missing a crate, releasing a lock and using a shield charge do not change it.

### 8.3 Points

| Event | Points |
|---|---|
| Correct letter | 10 (20 while the Golden quill is active). A letter typed again after its word was released scores nothing |
| Word cleared (threat, rock or crate) | `20 x length x multiplier x clean x quick x quill x assist`, rounded to the nearest 10 |
| | clean = 1.5 for a clean word, otherwise 1 |
| | quick = 1.25 if `u` is 0.5 or less, otherwise 1 |
| | quill = 2 while the Golden quill is active, otherwise 1 |
| | assist = the current assist value (0.60 to 1.00), so eased pacing does not inflate high scores |
| Close call | +100 if the word is cleared with less than 0.35 real s left |
| Threat cleared by Ink blast | Half of `20 x length x multiplier x assist`. No effect on the streak or typing statistics |
| Ink drop | 10 |
| Boss weak-point word | 1,000 x assist |
| Boss finisher word | 500 / 1,000 / 1,500 |
| Boss defeated | 5,000 |

### 8.4 Bonuses

| Bonus | Points |
|---|---|
| Checkpoint: section accuracy 95% or more | 500 |
| Checkpoint: no life lost in the section | 500 |
| End of level: each remaining life | 1,000 |
| End of level: accuracy 95% or more | 3,000 |
| End of level: accuracy 90% to 94.9% | 1,500 |
| End of level: no continues used | 2,000 |

### 8.5 Extra-life thresholds

| Source | Easy | Medium | Hard |
|---|---|---|---|
| First extra life at score | 5,000 | 10,000 | 15,000 |
| Then every | 10,000 | 20,000 | 30,000 |
| Ink drops | every 100 | every 100 | every 100 |
| Red cap crates in Level 1 | 2 | 2 | 2 |

Lives never exceed 9. A threshold passed at 9 lives is not stored for later.

### 8.6 Rank

Rank ignores WPM so that a careful beginner can earn a high rank.

| Rank | Requirement |
|---|---|
| S | Accuracy 97% or more, no life lost, no continues |
| A | Accuracy 93% or more, at most 2 lives lost, no continues |
| B | Accuracy 85% or more |
| C | Anything else |

### 8.7 Encouragement

- "CLEAN" popup for a clean word. "SUPER" for a clean word with `u` of 0.5 or less. "CLOSE!" for a close call. At most one popup per two words.
- Banners at key streaks of 25, 50 and 100.
- Score popups: "+100" in GOLD rising 12 px over 30 frames.
- Checkpoint banner with section WPM and accuracy.

### 8.8 Results screen content

1. SCORE, with bonuses listed.
2. WPM, with the personal best for this difficulty and the difference.
3. PEAK WPM.
4. ACCURACY. A run in which no letter key was pressed shows "---" here and for KEYS TO PRACTISE (item 8), as the HUD does, instead of 100% and NONE.
5. WORDS cleared and missed.
6. BEST STREAK (clean run) and BEST KEY STREAK.
7. AVERAGE REACTION time. (Tier 2)
8. KEYS TO PRACTISE: up to 3 letters with the highest miss rate, each with at least 2 misses.
9. SLOWEST KEYS: up to 3 letters with the highest mean per-key interval, each with at least 4 samples. (Tier 2)
10. INK DROPS, TIME, LIVES LOST, CONTINUES USED.
11. Rank letter, stamped large.
12. One suggestion line when it applies: "READY FOR MEDIUM?" on Easy at 25 WPM and 92% accuracy or better; "READY FOR HARD?" on Medium at 45 WPM and 92% or better. (Tier 2)

A Tier 2 line that is not built is left off the screen; the lines below it move up.

### 8.9 High scores

Five entries per difficulty, kept separately: three initials, score, WPM, accuracy, rank. The tables are seeded with modest scores so a first completed run can place. These tables are kept in the browser, on the player's own computer.

**World scores.** The game can also keep one board per difficulty that all players share. The boards live in a small service of our own (`server/`, a Cloudflare Worker with a database); `docs/LEADERBOARD.md` describes it and what it checks. The game side is `js/board.js` (CONTRACT 4.22). Section 12 describes the screens.

The game never depends on the service. If the service is switched off, cannot be reached, answers slowly or refuses a score, the game carries on with the tables of this computer, and nothing that the service sends can stop or change a run.

**Privacy.** What is sent for a finished run: the three initials the player typed, the score, WPM, accuracy, rank, whether the level was cleared, the run's length in seconds, and the run token, which carries the difficulty. Nothing else: no account, no name, no email, nothing typed during play and nothing from the browser's storage. No cookies or other credentials go with a request. As with any web request, the service sees the network address a request comes from. It does not store the address; it keeps a salted hash of it for a short time, at most about two hours, only to limit how often one source can submit (LEADERBOARD 1).

**Counting.** So that the owner can see how much the game is played, the game also tells the service when a run starts and when it ends (its length, whether the level was cleared and the part it ended in). The service adds these to totals per day and difficulty and keeps nothing about the run or the player. To count players per day it keeps a hash of the day and the network address until the day is over (LEADERBOARD 10). The Options note says "COUNTS GAMES PLAYED", and switching world scores off stops the counting as well.

**Visits.** The page loads Cloudflare Web Analytics as its last script. It reports visits, countries and referring sites to the owner, without cookies. It is separate from the game's code and from the world scores setting.

A run is sent only when the player confirms initials on the initials screen, and that screen says that the initials and score go to the world scores. The player can decline there: Esc does not send the run (on the "WORLD SCORES" screen it goes back to the title; on the "NEW HIGH SCORE!" screen the score is then saved on this computer only), and the screen shows that key. So that a run is not sent by a key pressed without reading, Enter and Esc are ignored for the first half second of the screen, and Enter alone never sends a run under the placeholder initials PIP: a player who has not used initials before types them. The two other requests carry nothing about the player: choosing a difficulty asks for a run token and sends the difficulty, and opening the High Scores panel (or the idle rotation starting) reads the boards.

Two things about a run are adjusted to what the service accepts. A run that lasted less than 10 seconds is not offered to the world scores, because the service would refuse it. The WPM that is sent is at most 220: the game measures the speed inside words, which for a very fast typist is above the service's limit, and the board would otherwise refuse the whole run. The table of this computer keeps the game's own figure.

The player can switch world scores off in Options (WORLD SCORES: OFF); the game then makes no request at all. When the service is off for the whole game, which is the case while no service address is set (`TG.Board.URL` empty, as the code is delivered), nothing is sent either, and the game plays exactly as it did before world scores.

The service takes scores only from the game's own web address and from a local web server (LEADERBOARD 3). A copy of the game opened from a file on disk, or put on another site, is given no run token: it shows the world boards, sends no score and keeps the tables of this computer, with the initials screen appearing as it did before world scores.

Initials that are rude or hateful are refused on the initials screen ("TRY OTHER INITIALS") from a short block list, the same list the service uses.

---

## 9. Difficulty

Difficulty is chosen before play on the difficulty select screen. It sets the word pools (section 10) and every tuning number below.

The numbers in the table are starting values (see the note at the top of this document). Changes made while the game is tuned against the test bot are written back into this table by WP-H.

Level 1 record: no change was needed for the test bot to finish the level on every difficulty with the values below as written. After a play review, Level 1's `tune` block (contract 12.1, the `Tuning changes` list in `js/levels/level1.js`) changes four values on each of Medium and Hard, within the tuning limits; everything else runs as the table says:

| Value in Level 1 | Medium | Hard | Why |
|---|---|---|---|
| `react` | 1.0 (table 1.2) | 0.6 (table 0.7) | Players in the middle of each speed range finished words with about half their time left and almost never lost a life to typing |
| `perChar` | 0.45 (table 0.5) | 0.27 (table 0.3) | As above. Budget for a 3 / 5 / 8 letter word: 2.35 / 3.25 / 4.6 on Medium, 1.41 / 1.95 / 2.76 on Hard |
| Boss health | 5 (table 6) | 7 (table 8) | The fight was longer than the 95 / 100 s of section 11.6 |
| Weak-point words in phases 1 / 2 / 3 | 1 / 2 / 2 (table 2 / 2 / 2) | 2 / 2 / 3 (table 2 / 3 / 3) | Phase 3 keeps its words |

### 9.1 Difficulty table

| Parameter | Easy | Medium | Hard | Unit |
|---|---|---|---|---|
| **Pace and speed** | | | | |
| `pace` | 0.75 | 1.00 | 1.25 | world s per real s |
| Run speed at assist 1.0 | 48 | 64 | 80 | px per real s |
| Design speed (comfortable run with little damage) | 15 | 30 | 50 | WPM |
| Floor speed (finishes with adaptive pacing) | 10 | 20 | 35 | WPM |
| WPM guide shown on the select screen | 10-20 | 20-40 | 40+ | WPM |
| **Lives** | | | | |
| Starting lives | 5 | 4 | 3 | |
| Maximum lives | 9 | 9 | 9 | |
| Invulnerability after a hit | 3.0 | 2.5 | 2.0 | real s |
| Invulnerability after a shield absorbs a hit | 1.0 | 1.0 | 1.0 | real s |
| Checkpoint top-up to at least | 3 | 2 | 0 | lives |
| First extra life / then every | 5,000 / 10,000 | 10,000 / 20,000 | 15,000 / 30,000 | points |
| **Threat timing** | | | | |
| `react` | 1.8 | 1.2 | 0.7 | nominal s |
| `perChar` | 1.0 | 0.5 | 0.3 | nominal s per letter |
| Budget for a 3 / 5 / 8 letter word | 4.8 / 6.8 / 9.8 | 2.7 / 3.7 / 5.2 | 1.6 / 2.2 / 3.1 | nominal s |
| Intro and tutorial budget factor | 1.5 | 1.5 | 1.5 | |
| Letter stall (moving threats) | 0.20 | 0.12 | 0.06 | nominal s |
| Minimum spacing between arrivals | 3.5 | 1.5 | 0.9 | nominal s |
| Hazard keep-clear margin | 1.2 | 0.75 | 0.5 | nominal s |
| Urgent warning when time left is under | 1.5 | 1.2 | 0.9 | real s |
| Maximum active threats, sections 1 / 2 / 3 | 1 / 2 / 2 | 2 / 2 / 3 | 2 / 3 / 4 | |
| Level entries included | tagged Easy | Easy and Medium | all | |
| Threat words in Level 1, sections 1 / 2 / 3 | 11 / 14 / 14 | 12 / 16 / 19 | 18 / 22 / 20 | |
| **Words** | | | | |
| Word length shift, sections 1 / 2 / 3 | 0 / 0 / +1 | 0 / +1 / +2 | 0 / +1 / +2 | letters |
| Longest threat word | 10 | 10 | 10 | letters |
| Tier mix, section 1 | tier 1 100% | tier 1 100% | tier 1 100% | |
| Tier mix, section 2 | tier 2 70%, tier 1 30% | same | same | |
| Tier mix, section 3 | tier 3 60%, tier 2 30%, tier 1 10% | tier 3 60%, tier 2 40% | tier 3 60%, tier 2 40% | |
| Tier mix, boss rocks | tier 1 60%, tier 2 40% | same | same | |
| **Typing rules** | | | | |
| Auto-release after wrong keys in a row | 3 | 3 | off | |
| Multiplier steps lost for a word with errors | 1 | 2 | back to x1 | |
| Weak-letter and adjacency weighting in the picker (Tier 2) | on | on | off | |
| **Help** | | | | |
| Key guide shown by default | yes | no | no | |
| Hazard audio cue | yes | yes | no | |
| Key prompts on the first hazards of each type | 3 | 0 | 0 | |
| Plank bridge after falls at one gap | 1 | 2 | never | |
| Tutorial slow-down | every run | until first checkpoint passed once | same as Medium | |
| **Power-ups** | | | | |
| Shield charges per pickup / maximum held | 2 / 2 | 1 / 2 | 1 / 2 | |
| Correct keys in a row for a shield charge | 30 | 50 | 75 | keys |
| Hourglass | 50% for 6 s | same | same | real s |
| Golden quill | 10 s | same | same | real s |
| **Adaptive pacing** | | | | |
| Starting `assist` | 1.0 (or the saved value, if lower) | same | same | |
| Lowest `assist` in normal play / after continues | 0.70 / 0.60 | same | same | |
| **Boss** | | | | |
| Health (weak-point words) | 3 | 6 | 8 | |
| Weak-point words in phases 1 / 2 / 3 | 1 / 1 / 1 | 2 / 2 / 2 | 2 / 3 / 3 | |
| Rocks per volley in phases 1 / 2 / 3 | 2 / 2 / 3 | 2 / 3 / 4 | 3 / 4 / 5 | |
| Rocks in flight at once | 1 | 2 | 3 | |
| Earliest gap between rock launches, phases 1 / 2 / 3 | 4.5 / 4.2 / 3.8 | 2.4 / 2.2 / 1.8 | 1.5 / 1.3 / 1.1 | nominal s |
| Rock word length | 2-4 | 4-5 | 5-7 | letters |
| Weak-point word length | 4-6 | 7-9 | 9-12 | letters |
| Weak-point window | 1.5 x base budget | same | same | |
| Extra window after a fully cleared volley | 2.0 | 2.0 | 2.0 | nominal s |
| Physical attack telegraph | 1.4 | 1.0 | 0.7 | nominal s |
| Minion in phase 3 volleys (Tier 2) | no | yes | yes | |
| Two physical attacks in a row in phase 3 (Tier 2) | no | yes | yes | |
| Finisher word length | 6-7 | 10-11 | 13-15 | letters |
| Finisher bonus | 500 | 1,000 | 1,500 | points |

### 9.2 How difficulty rises within the level

- Section 1 has threats from the right only, tier 1 words and the lowest cap on active threats.
- Section 2 adds threats from above and from behind, tier 2 words, and on Medium and Hard longer words.
- Section 3 adds threats from below (rising out of the ground in front of Pip), tier 3 words, longer words, a higher cap and waves that mix all four directions.
- The boss combines typing with jump and duck attacks and ends with the longest word of the run.

### 9.3 Adaptive pacing

Difficulty sets the words. `assist` only scales speed. It never changes jump geometry or word tiers.

| Rule | Effect on the `assist` target |
|---|---|
| After every 4 threat words resolved (cleared, or reached Pip), take the mean window use `u` | |
| Mean `u` over 0.90 | -0.10 |
| Mean `u` over 0.80 | -0.05 |
| Mean `u` under 0.55 and accuracy on those words 92% or more | +0.05 |
| A life is lost to a typable threat | -0.10 |
| First continue at a checkpoint | target becomes min(target, 0.85) |
| Each further continue at the same checkpoint | -0.05 |

- Range: 0.70 to 1.00 in normal play. Continues can lower it to 0.60.
- `assist` moves towards its target at 0.05 per real second.
- Increases apply only when no typable threat is active.
- The value reached at the end of a run is saved per difficulty and used as the starting value next time, capped at 1.0. (Tier 2, section 19. Without it every run starts at 1.0.)
- The Options screen has "ADAPTIVE PACE: ON / OFF". When off, `assist` stays at 1.0, whatever value an earlier run saved, and a run played with it off leaves the saved value as it was. The headless tests can also pin it.
- Word scores are multiplied by `assist`.

---

## 10. Word selection

### 10.1 Rules for all words

- Letters a to z only. No spaces, hyphens, apostrophes or digits (Space is jump).
- Stored in lowercase, shown in uppercase. Uppercase matches the legends on keycaps and reads better in an 8x8 font.
- No word appears in more than one list.
- No rude words. No words spelled differently in British and American English.
- Threat words are at most 10 letters (an 82 px plate). Boss weak-point and finisher words can be longer because they are shown on the central boss plate.

### 10.2 Tiers

| Pool | Easy | Medium | Hard |
|---|---|---|---|
| Tier 1 (section 1) | Home row only (A S D F G H J K L), 2-5 letters | Common words, 4-5 letters, no Q X Z | 5-7 letters, less common words and awkward letter pairs |
| Tier 2 (section 2) | Home row plus E I R T O U, 3-4 letters | 5-6 letters with digraphs (TH, CH, SH, WH) and double letters | 7-9 letters |
| Tier 3 (section 3) | All letters, 3-5 letters; each word has at least one letter outside tier 2's set | 6-8 letters, brings in Q X Z J | 8-11 letters |
| Boss | 4-6 letters | 7-9 letters | 9-12 letters |
| Finisher | 6-7 letters | 10-11 letters | 13-15 letters |

About a third of each pool is meadow and woodland vocabulary. The starting lists are in Appendix A. WP-A should grow each threat tier to 80-120 words where the letter set allows, keeping at least 3 words per common first letter. The Easy tier 1 pool is small because few words use only the home row; repetition there is accepted because it helps beginners.

### 10.3 Length requested for each threat

```
range = the kind's range for the difficulty (section 4.2), both ends raised by the section's length shift,
        upper end capped at 10
```

The budget is calculated from the length of the word actually picked.

### 10.4 The picker, in order

1. Choose a tier by weighted random choice from the section's tier mix.
2. Take the words of that tier whose length is within the requested range.
3. Remove the last 20 words picked in this run.
4. Remove any word whose first letter is already used by an active word. This rule is never relaxed.
5. Remove any word that is a prefix of an active word or has an active word as a prefix.
6. If nothing is left, repeat steps 2 to 5 with the other tiers in the mix (highest weight first), then with the difficulty's remaining threat tiers from 1 to 3.
7. If nothing is left, repeat from step 2 without step 3.
8. If nothing is left, lower the bottom of the length range by 1 and repeat, down to a length of 2.
9. If nothing is left, return nothing. The spawn waits 0.25 ws and tries again.
10. Of the words left, keep only those not yet picked in this run, if there are any. This keeps the tier and length found above and only narrows the choice, so a word (on a boss rock too) comes back only after the other words that fit have been used. Weight the remaining words. Each starts at weight 1. The two weightings below are Tier 2 (section 19); without them every word keeps weight 1.
    - Easy and Medium: x3 if the first letter is not adjacent on a QWERTY keyboard to the first letter of any active word.
    - Easy and Medium, after 20 completed words: x2 if the word contains one of the player's two weakest letters (highest miss rate, at least 2 misses).
11. Pick by weighted random choice using the seeded generator.

A later level can add its own vocabulary: the level data names a word flavour, and the word lists may hold extra words for that flavour in each tier. Level 1's meadow words are already part of the lists in Appendix A, so Level 1 needs nothing extra.

### 10.5 Difficulty select screen

Each panel shows a description, three sample words, the starting lives and the WPM guide.

| Panel | Description | Sample words |
|---|---|---|
| EASY | SHORT WORDS, HOME ROW FIRST | ASK, FROG, PUPPY |
| MEDIUM | EVERYDAY WORDS | RIVER, BRIDGE, RAINBOW |
| HARD | LONG AND UNUSUAL WORDS | ZEPHYR, LABYRINTH, SILHOUETTE |

---

## 11. Level 1 script: QUILL MEADOWS

### 11.1 Structure

| Part | Tiles | Name | HUD stage | Look | Music |
|---|---|---|---|---|---|
| Section 1 | 0-255 | MORNING MEADOW | 1-1 | Blue sky, windmill, flat grass | Level theme, G major, 150 BPM |
| Section 2 | 256-543 | ORCHARD BROOK | 1-2 | Apple trees in the near layer, water gaps with plank edges | Same |
| Section 3 | 544-879 | SUNSET RIDGE | 1-3 | Sunset palette, molehills, hanging beehives | Level theme up 2 semitones (A major), 158 BPM |
| Boss arena | 880 onward | THE BARON'S DIG | 1-B | Dusk: DEEP BLUE sky, stars, moon, churned soil with mine rails | Boss theme |

Running time without the boss: 293 / 220 / 176 s at assist 1.0.

### 11.2 How to read the timeline

- For a threat or crate, the tile is its **trigger**: the entry appears when Pip reaches that tile. Its arrival point follows from its budget (section 4.1).
- For a gap or hazard, the tile is its **left edge** in the world.
- Tag E means every difficulty. M means Medium and Hard. H means Hard only.
- `tutorial` and `intro` are flags described in sections 3.5 and 4.1.
- Threat words per section (Easy / Medium / Hard): 11 / 12 / 18 in section 1, 14 / 16 / 22 in section 2, 14 / 19 / 20 in section 3. Level total 39 / 47 / 60, plus 7 crates.
- Why the counts are what they are. On Easy the level has about one word every 6 seconds, so a beginner is typing for roughly half of the run. On Hard, section 3 has fewer threat words than section 2 because its words are about two letters longer; with more words than this, a word would be live for nearly the whole section at the design speed and the rest and movement beats would disappear.
- These positions and counts are starting values. WP-E may move an individual entry by up to 6 tiles, and may add, remove or re-tag entries so that a count changes by at most 25% (rounded up), to satisfy the validation rules and the bot runs. Section boundaries, checkpoint tiles and the order in which threat kinds are introduced on each difficulty stay as written. Every change is recorded as the contract describes (section 12.1) and WP-H writes the final timeline and counts back into this section.
- Level 1 record: no entry was moved, added, removed or re-tagged. The timeline of sections 11.3 to 11.5 and the counts above (39 / 47 / 60 threat words and 7 crates) are final, the long arch included. Running times measured with the test bot at the design speed, boss included: about 366 / 326 / 300 s; the boss fight itself took about 72 / 105 / 122 s (section 11.6 expects about 75 / 95 / 100 s).

### 11.3 Section 1: MORNING MEADOW (tiles 0-255)

One new idea at a time. Threats from the right only.

| Tiles | Beat | Entries |
|---|---|---|
| 0-20 | Start | "READY" then "GO!" banner. "TYPE!" signpost at 8. Four ink drops on the ground from 14 |
| 22-100 | Three teaching words, one at a time | Boulder 22 (E, tutorial). Boulder 44 (E, tutorial). Dawdle 66 (E, tutorial). Ink drops from 88 |
| 104-108 | First jump | Narrow gap at 106 with signpost and an ink drop arc. Nothing to type on Easy |
| 112-150 | Second kind of mover | Hoppet 112 (E). Buzzle 118 (M). Dawdle 124 (H). Hoppet 132 (E). Buzzle 138 (H). Ink drops from 146 |
| 154-158 | First duck | Low branch at 156 with signpost and ink drops beneath |
| 162-200 | First crate | Crate with Bubble shield 162 (E). Hoppet 166 (E). Buzzle 172 (H). Boulder 174 (E). Ink drops from 184 |
| 200-204 | Wide jump | Wide gap at 202 with an ink drop arc |
| 206-234 | First pair on Medium, first Buzzle on Easy | Dawdle 206 (E). Buzzle 212 (E). Hoppet 216 (H). Ink drops from 222. On Easy the cap of 1 makes the Buzzle wait until the Dawdle is dealt with |
| 234-238 | Duck | Low branch at 236 |
| 240-255 | Small wave | Buzzle 240 (E). Hoppet 244 (E). Dawdle 248 (H). Hoppet 250 (H) |
| 256 | Checkpoint | Flag, banner with WPM and accuracy |

### 11.4 Section 2: ORCHARD BROOK (tiles 256-543)

Adds threats from above and from behind. On Medium and Hard, typing and jumping start to overlap.

| Tiles | Beat | Entries |
|---|---|---|
| 256-266 | Rest | Section banner. Ink drops from 262 |
| 268-294 | First threat from above, alone | Swoop 268 (E, intro) with a top edge tag and a ground marker |
| 296-318 | | Boulder 296 (E). Hoppet 300 (E). Buzzle 304 (H). Ink drops from 310 |
| 320-340 | Stepping stones | Wide gaps at 322, 330 (M; bridged on Easy) and 338, each with an ink drop arc. Platforms of 6 tiles |
| 342-386 | Second crate and a pair | Crate with Hourglass 342 (E). Dawdle 346 (E). Buzzle 352 (E). Hoppet 358 (E). Swoop 364 (H). Ink drops from 372 |
| 388-414 | First threat from behind, alone | Truffle 390 (E, intro), which appears at the left edge with a warning beep panned left. Swoop 396 (H). Ink drops from 408 |
| 416-430 | Plank bridge | Low branches at 418 and 428 with ink drops beneath |
| 432-468 | Mixed wave | Buzzle 434 (E). Truffle 438 (E). Boulder 440 (E). Swoop 444 (M). Hoppet 450 (H). Ink drops from 462 |
| 470-488 | Movement only | Bramble 472. Wide gap 479. Bramble 486 (M; absent on Easy) |
| 490-512 | Typing in the air | Crate with Red cap 490 (E). Boulder 492 (E), whose word can be typed during the jump. Narrow gap at 502 |
| 514-543 | Section peak | Hoppet 514 (E). Swoop 518 (E). Truffle 522 (M). Buzzle 526 (E). Dawdle 530 (H). Hoppet 534 (H). Ink drops from 540 |
| 544 | Checkpoint | Flag, banner |

### 11.5 Section 3: SUNSET RIDGE (tiles 544-879)

Adds threats from below and waves from all four directions.

| Tiles | Beat | Entries |
|---|---|---|
| 544-558 | Rest | Sunset palette, music changes key. Ink drops from 552 |
| 560-588 | First threat from below, alone | Digby 560 (E, intro) with a rumbling mound ahead of Pip, a bottom edge tag and the low warning beep |
| 590-628 | Pair | Digby 590 (E). Buzzle 596 (E). Hoppet 600 (E). Swoop 604 (H). Crate with Golden quill 616 (E). Ink drops from 624 |
| 630-644 | Two jumps | Wide gap 632. Narrow gap 642 (M; bridged on Easy) |
| 648-698 | Build | Hoppet 648 (E). Swoop 654 (M). Boulder 658 (E). Truffle 662 (M). Crate with Ink blast 668 (E). Buzzle 684 (E). Ink drops from 692 |
| 700-718 | Duck, jump, duck | Beehive 702. Bramble 709. Beehive 716 (M; absent on Easy) |
| 722-764 | Peak: all four directions | Buzzle 722 (E, right). Truffle 728 (E, behind). Swoop 734 (E, above). Digby 740 (E, below). Hoppet 746 (M, right). Dawdle 754 (M) |
| 766-800 | Rest | Boulder 766 (E) with the longest word of the level for that difficulty. Crate with Red cap 770 (E). Ink drops from 776 and 786 |
| 802-832 | Movement run | Narrow gap 804. Low branch 811. Wide gap 818. Long arch 828-830 (hold duck; Tier 2, section 19) |
| 834-864 | Last wave | Truffle 834 (E). Buzzle 838 (E). Swoop 842 (M). Crate with Bubble shield 850 (E). Ink drops from 856 |
| 866-879 | Quiet | Music drops to bass only. "WARNING" flashes for 2 s from 868 with a rumble. Ground tiles change to churned soil at 872. Ink drops from 870 |
| 880 | Checkpoint | Flag. Any threat still active leaves. Boss intro begins |

### 11.6 Boss: Baron von Burrow

**Look.** A large mole, 48x48 overall, with a brass miner's helmet and lamp, monocle, handlebar moustache, red sash and big pink claws. Six colours plus outline: SOIL, CLAY, PINK, GOLD, WHITE, RED. The glass of the helmet lamp is CREAM, and it is the only CREAM on the head, so that the lamp alone can be turned RED from phase 2 by a palette swap. Built from parts (body, head with four expressions, arms with three poses, dirt mound) to keep the pixel data manageable.

**Personality.** Pompous and theatrical, vain about his helmet and monocle. When hit, the monocle pops off and he fumbles it back on.

**Arena.** Flat ground with no gaps. The ground keeps scrolling and the Baron stays 200 px ahead of Pip, facing him. No crates and no ink drops.

**Intro (4 s).** He pops up from a mound, polishes the monocle and laughs. Speech plate: "MY MEADOW! MY WORDS!". After a continue the intro is shortened to 1.5 s.

**Health bar.** "BARON" label at x = 232, bar from x = 280 to 376, y = 24 to 29, RED with a CORAL highlight, lost segments SHADOW. One segment per weak-point word.

**A round.** Each round runs in this order. All timers are on the world clock, so adaptive pacing and the Hourglass affect them.

| Step | What happens | Player action |
|---|---|---|
| 1. Volley | The Baron lobs rocks, each with a word. Rocks use the normal budget rules, the cap on rocks in flight and the launch gap from the difficulty table | Type each rock's word. A cleared rock flies back and bounces off his helmet (no damage to him). A rock that is not typed lands on Pip and costs a life; like every typable threat it cannot be dodged |
| 2. Physical attack | He raises an arm and the ground flashes for the telegraph time. Then a shockwave runs along the ground, or a pickaxe spins across at head height. These have no word | Jump the shockwave. Duck the pickaxe |
| 3. Taunt (exposed) | He laughs, the helmet lamp flashes and a weak-point word appears on the boss plate. The window is 1.5 x the base budget for the word, plus 2.0 nominal s if every rock of the volley was cleared | Type the word. Each letter makes him flinch and flashes the health bar |
| 4a. Hit | If the word is completed: health -1, monocle pops, he recoils for 0.8 ws | |
| 4b. Miss | If the window ends first: he laughs and the next round begins. No life is lost. The next taunt uses a new word. For adaptive pacing this counts as a missed word | |

**Phases.**

| Phase | Health range (E / M / H) | Volley | Physical attack | Other |
|---|---|---|---|---|
| 1 | 3 / 5 / 7-6 | Rocks from the right | Shockwave | |
| 2 | 2 / 4-3 / 5-4 | One rock per volley is thrown high and falls from above with a ground marker | Shockwave and pickaxe alternate | Helmet lamp turns RED |
| 3 | 1 / 2-1 / 3-1 | As phase 2. On Medium and Hard the last entry of each volley is a Digby minion from below (Tier 2) | Easy: alternating. Medium and Hard: shockwave then pickaxe, 1.2 / 0.9 nominal s apart (Tier 2; without it, alternating as on Easy) | Boss theme rises from 168 to 184 BPM |

**Phase change.** 2.0 ws with no attacks. He stamps, dust falls and the palette of the arena darkens one step.

**Finisher.** When health reaches zero he is dizzy, with stars circling. One finisher word appears on the boss plate. It has no timer. The world runs at 25% speed and nothing attacks. Each letter is a visible hit. Completing it defeats him.

**Defeat.** 30-frame freeze of the picture, 2-frame flash, the helmet flies off, he spins, shrinks to minion size and scurries down a hole. A fountain of letter tiles erupts from the hole and flies to the score. Victory fanfare, then the results screen.

**Expected duration.** About 75 / 95 / 100 s. The health ranges above are Level 1's (section 9, Level 1 record): Medium 5 and Hard 7, one fewer weak-point word than the difficulty table, because the fight took about 101 / 117 s for the test bot at the design speed. With them it takes about 70 / 88 / 105 s.

---

## 12. Screens and flow

```
boot -> title -> difficultySelect -> howToPlay -> playing -> bossIntro -> boss -> levelComplete -> results -> highScoreEntry -> title
                                                   |  ^                    |
                                                   v  |                    v
                                                 lifeLost  <----------------
                                                   |
                                                   v
                                                gameOver -> (continue) playing or bossIntro
                                                         -> (end run)  results
paused can be entered from playing, bossIntro and boss, and returns to the same state.
```

| Screen | Content and behaviour |
|---|---|
| Boot (start gate) | "PRESS ANY KEY" blinking on INK. Browsers require a key or click before sound can start. The copyright line "© 2026 DAVID SLEE" is at the bottom |
| Title | Logo in two lines at 4x ("SPELL" over "RUNNER"), banded GOLD, ORANGE, RED by row, with an INK shadow offset 3,3. Letters are stamped one every 6 frames with rising key sounds. The Level 1 backdrop scrolls behind with Pip running. Menu: START, HOW TO PLAY, HIGH SCORES, OPTIONS, EXIT. The bottom strip (INK, 22 px) has the help line and, under it, the copyright line. After 12 s idle the premise text and the high score tables are shown in turn; any key returns to the menu (the idle rotation is Tier 2). With world scores on (section 8.9), the rotation shows a world board (Easy, Medium and Hard in turn) when it is known, otherwise the tables of this computer |
| Options (panel of the title screen) | MUSIC, SFX, CRT, REDUCE FLASH, KEY GUIDE (AUTO / ON / OFF), ADAPTIVE PACE, a note that Easy word tiers assume a QWERTY layout, RESET SCORES. When the game has a world scores service: WORLD SCORES (ON / OFF) before RESET SCORES, with the note "SENDS YOUR INITIALS AND SCORE TO A SHARED BOARD. COUNTS GAMES PLAYED." while the line is selected. With it off the game makes no request |
| High scores (panel of the title screen) | Three tables of five. With world scores on, four pages changed with Left and Right: WORLD EASY, WORLD MEDIUM, WORLD HARD (ten rows each: place, initials, score, WPM, accuracy, rank) and THIS COMPUTER (the three tables of five). A header names the page between two arrows, with the page number. The panel opens on the world page of the difficulty last played. A world page says "LOADING..." until its board arrives, "WORLD SCORES CANNOT BE REACHED" with "PRESS RIGHT FOR THIS COMPUTER'S SCORES" when it did not (the panel then opens on THIS COMPUTER the next time), and "NO SCORES YET. BE THE FIRST!" for an empty board. After a run that was sent, the panel opens on the world page of that difficulty (keys are ignored for the first 0.5 s) with a line under the rows: "SENDING...", then "YOUR PLACE: 12 OF 87" with the player's row highlighted when it is among the ten, or "NOT IN THE BEST 200 YET. KEEP GOING!" for a run below the rows a board keeps. When the score was not taken the line says why: "COULD NOT REACH WORLD SCORES.", "WORLD SCORES DID NOT TAKE THIS SCORE." (the service refused it) or "TOO MANY SCORES SENT FROM HERE THIS HOUR." (the service's limit per address), followed by "SAVED ON THIS COMPUTER." when the score reached the local table. When the boards cannot be loaded either, the page says once "WORLD SCORES CANNOT BE REACHED" and then "YOUR SCORE IS SAVED ON THIS COMPUTER." with "PRESS RIGHT TO SEE IT", or "YOUR SCORE WAS NOT SENT.". The line and the highlighted row stay on that page until the next run starts |
| Goodbye (panel of the title screen) | Shown after EXIT. A web page cannot close a tab that the player opened, so the game asks the browser to close the window and shows this panel, which stays whenever the tab stays open. "THANKS FOR PLAYING!", Pip in his victory pose, "YOU CAN CLOSE THIS TAB NOW.", then "PRESS ANY KEY TO PLAY AGAIN" over the copyright line. The title music stops. Keys are ignored for the first 0.5 s; then any key, tap or click returns to the menu with START selected and the music playing. The idle rotation does not start here. Esc on the menu never exits |
| Difficulty select | Three panels of 112 x 120. Mascots: Dawdle (Easy), Hoppet (Medium), Truffle (Hard). Each shows the description, sample words, starting lives and WPM guide. Select with Left and Right then Enter, or by typing EASY, MEDIUM or HARD. The selected panel has a GOLD border and bounces; the others are dimmed |
| How to play | One screen in three columns of 120 px. TYPE: an animated Dawdle with "CAT" lighting up, and a small keyboard showing fingers resting on A S D F and J K L. JUMP and DUCK: SPACE and ENTER keycaps ("HOLD FOR ARCHES" under ENTER), with "BACKSPACE: LETS GO OF A WORD. MISTAKES NEED NO FIXING." POWER-UPS: icons with one-line descriptions. When reached from difficulty select, the bottom line is "TYPE READY TO START"; typing READY starts the run. This teaches the mechanic before any threat appears |
| Playing | Section 13 |
| Life lost | Not a separate picture. A short pause in the world (0.10 s after a hit, 1.0 s after a fall) during which keys still register. If the window loses focus during this pause, the game goes to the pause screen as soon as the pause in the world ends |
| Pause | The frame is frozen under an INK checkerboard dither, below the top bar and progress strip (below the boss bar in the arena), so score, lives and WPM stay readable. Box of 160 x 96: RESUME, RESTART FROM CHECKPOINT, MUSIC, SFX, CRT, REDUCE FLASH, QUIT. Resume runs a 3-2-1 countdown of 0.5 s per step so hands can return to the keys. Restart from checkpoint counts as a continue |
| Game over | Dither, below the HUD as on the pause screen. "GAME OVER" letters drop in one by one. Pip sits down. "CONTINUE? 9" counts down at 1 s per tick in 4x digits, and stands still while the window has no focus. Enter or Space continues. Esc ends the run. Keys are ignored for the first 0.8 s |
| Boss intro | Section 11.6 |
| Level complete | The defeat sequence (4 s), Pip's victory pose |
| Results | "STAGE 1 CLEAR!" (or "RUN ENDED" if the run was ended from game over). Lines are tallied one by one with ticks, then the rank is stamped. Labels at x = 64, values right-aligned at x = 320, 16 px row pitch from y = 48, in two pages if needed. Enter or Space moves on |
| High score entry | Shown if the score places in the table for the difficulty ("NEW HIGH SCORE!"), or, with world scores on, for a run of 10 s or more with a score above zero whose run token was received ("WORLD SCORES"). Type 3 initials directly; Backspace deletes; Enter confirms. The initials used last are offered, so Enter alone takes them; the placeholder PIP is not offered for a run that will be sent, so a new player types initials first. When the run will be sent, the screen says that the initials and score go to the world scores, the line under the boxes says what Enter does ("ENTER: SEND", "ENTER: SAVE AND SEND"), and the bottom strip shows "ESC: DO NOT SEND". Esc on the "WORLD SCORES" screen goes to the title with nothing saved or sent; on the "NEW HIGH SCORE!" screen it keeps the score on this computer only ("THIS SCORE STAYS ON THIS COMPUTER"; Esc again sends it after all). With world scores on, Enter and Esc are ignored for the first 0.5 s, and initials on the block list are refused on the spot: the boxes shake, "TRY OTHER INITIALS" shows, and nothing is saved or sent. On Enter the local table is updated when the score reaches it, and the run is sent to the world scores unless the player declined |

---

## 13. HUD layout

Screen 384 x 216. Origin top left.

### 13.1 Regions

| Region | y range | Content |
|---|---|---|
| Top bar | 0-19 | INK background. Labels at y = 2 in SILVER, values at y = 10 in WHITE |
| Progress strip | 20-22 | SHADOW track, GOLD fill, WHITE checkpoint ticks, crown icon at the boss end. Replaced by the boss bar in the arena |
| Playfield | 24-184 | Threats, plates, Pip. Ground surface at y = 184 |
| Ground | 184-216 | Two rows of tiles. The type bar and key guide are drawn over it |

### 13.2 Top bar

| Element | x | Label (y = 2) | Value (y = 10) |
|---|---|---|---|
| Score | 4 | SCORE | 7 digits, zero padded |
| Lives | 68 | PIP | Head icon at x = 68, then "x3" at x = 76 |
| Shield | 96 | none (under PIP) | One shield icon per charge at x = 96 and x = 105, straight after the lives |
| Ink drops | 120 | INK | Drop icon at x = 120, then 3 digits at x = 128 (count towards the next life, 000-099) |
| WPM | 160 | WPM | 3 digits, or "---" |
| Accuracy | 196 | ACC | "097%" |
| Multiplier | 240 | COMBO | "x3", then from x = 258 one pip (3 x 5 px, 4 px apart) for each clean word the current step of 8.2 needs to reach the next one: 3, 3, 4 and 5 pips for x1 to x4, filled in the multiplier's colour for the clean words already typed and SHADOW for the rest; all 5 filled at x5 |
| Stage | 300 | STAGE | "1-1", "1-2", "1-3", "1-B" |
| Power slot | 364 | none | 16 x 16 frame at (364, 1), dimmed while empty, power-up icon inside; the time left is a 2 px gauge beside the slot (x = 381 to 382, y = 2 to 15) that runs down, AQUA for the Hourglass and GOLD for the Golden quill |

WPM and accuracy are drawn in a neutral colour and refresh twice a second so the digits do not flicker.

### 13.3 Boss bar

| Element | Position |
|---|---|
| "BARON" label | x = 232, y = 23 |
| Bar | x = 280 to 376, y = 24 to 29 |
| Boss plate (weak-point and finisher words at 2x) | Centred at x = 192, top at y = 34, height 20 |

### 13.4 Bottom of the screen

| Element | Position | Content |
|---|---|---|
| Type bar | Centred at x = 192, y = 198 to 213 | INK plate with GOLD border showing the locked word at 2x, typed letters GOLD, next letter underlined. Words longer than 10 letters are drawn at 1x. Empty when nothing is locked |
| Prompt line | Centred at x = 192, y = 188 | Tutorial prompt ("TYPE: ASK") and tips |
| Key guide | x = 4 to 84, y = 190 to 214 | Three rows of keys, 8 px per key, rows offset by 0, 2 and 6 px. The next key is lit: a WHITE block with an INK letter, a colour no finger uses, so it does not merge with the keys above and below it, which share its finger colour. After three wrong keys on one letter it flashes RED. Keys are coloured by finger with 4 colours mirrored per hand: little finger CORAL, ring GOLD, middle GRASS, index AQUA |
| Key prompt | 12 px above Pip | SPACE or ENTER keycap (Easy, first hazards and the arch, section 5) |

### 13.5 Banners

Banners are drawn centred at y = 60 in 2x text on an INK strip: "READY", "GO!", section names, checkpoint results ("CHECKPOINT  WPM 28  ACC 96%"), streak banners, "WARNING". At most one banner at a time; others wait. Banners never cover the row of the locked target's plate; if they would, they are drawn at y = 100.

---

## 14. Art direction

### 14.1 Rules

- 1 px INK outline on all sprites. No outline on background tiles.
- Colours per sprite: enemies 3 plus outline, hero 5 plus outline, boss 6 plus outline (and CREAM for the lamp glass, section 11.6).
- No alpha blending, gradients, rotation or smooth scaling at runtime. Use pre-drawn frames, horizontal flip, palette swaps and whole-number scaling. Translucency is imitated by drawing on alternate frames. Screen dimming uses a checkerboard dither of INK.
- Particles are 1x1 or 2x2 squares in palette colours, or 8x8 font glyphs.
- All draw positions are floored to whole pixels, each parallax layer separately.
- The canvas is letterboxed in INK and scaled so that every game pixel is the same whole number of device pixels (on a screen with 2 device pixels per CSS pixel, a scale of 3.5 CSS px is 7 device pixels). The canvas keeps its 384 x 216 backing store and is shown with `image-rendering: pixelated`. The scale is chosen so that the JUMP and DUCK buttons (section 2) are always visible (contract 4.21, lead decision 13.1):
  1. Take the largest scale, in whole device pixels, at which the canvas fits the window.
  2. If that scale is at least 2 and the margin on each side is then at least 72 CSS px, keep it and put the buttons in the side margins.
  3. Otherwise take the largest scale, in whole device pixels, at which the canvas fits the window width and the window height minus 72 px, and put the buttons in a 72 px strip below the canvas.
  4. If that scale is less than 2, the buttons may go in the side margins instead: the canvas then fits the window width minus 2 x 72 px and the full height. That is used when it gives a larger scale than the strip below and the canvas is at least 64 px (a button) tall, in whole device pixels at 2 or more.
  5. Otherwise, with a scale below 2, the canvas takes the exact fit of the space above the strip instead (a fraction, at least 0.25), so the game is never shown tiny, with the buttons in the strip.
  
  Examples with 1 device pixel per CSS pixel: 1366 x 768 gives 3x with the buttons at the sides. 1280 x 720 gives 3x with the strip below (648 + 72 = 720). 1920 x 1080 gives 4x with the strip below, because at 5x the canvas would fill the window and leave no room for the buttons. 800 x 600 gives 2x with the strip below. 700 x 500 gives the exact fit, about 1.82x, with the strip below. 1200 x 400 gives about 1.85x with the buttons at the sides (1.52x with the strip). With 2 device pixels per CSS pixel, 1440 x 900 gives 3.5x with the strip below. A phone held sideways, 844 x 342 with 3 device pixels per CSS pixel, gives about 1.58x with the buttons at the sides (1.25x with the strip).
  
  The layout is redone when the window is resized and when the window moves to a screen with another pixel density (checked every frame, since that move need not fire a resize event).
- Keep high-contrast background detail out of y = 24 to 150 so word plates stay legible.
- A missing sprite is drawn as a labelled placeholder box and never stops the game.

### 14.2 Master palette (32 entries)

The key is the character used in sprite pixel data. `.` is transparent.

| # | Key | Name | Hex | # | Key | Name | Hex |
|---|---|---|---|---|---|---|---|
| 0 | 0 | INK | #0F0F1B | 16 | g | BRONZE | #B86A00 |
| 1 | 1 | SHADOW | #2B2D42 | 17 | h | ORANGE | #F08A1C |
| 2 | 2 | STONE | #5C6078 | 18 | i | GOLD | #F8C020 |
| 3 | 3 | SILVER | #A9B0C3 | 19 | j | CREAM | #FCF0A0 |
| 4 | 4 | WHITE | #F8F8F8 | 20 | k | BARK | #3E2210 |
| 5 | 5 | DEEP_BLUE | #1E2A78 | 21 | l | SOIL | #7A4420 |
| 6 | 6 | ROYAL | #2F5FD0 | 22 | m | CLAY | #B87848 |
| 7 | 7 | SKY | #5C94FC | 23 | n | SAND | #E8C890 |
| 8 | 8 | HAZE | #A8D8FC | 24 | o | MAROON | #6A1428 |
| 9 | 9 | DEEP_TEAL | #0B6A6A | 25 | p | RED | #D82C2C |
| 10 | a | TEAL | #18A8A0 | 26 | q | CORAL | #F86858 |
| 11 | b | AQUA | #6EF0E0 | 27 | r | PINK | #FCA8C0 |
| 12 | c | PINE | #0E4A2A | 28 | s | PLUM | #3C1A5A |
| 13 | d | FOREST | #1E8A32 | 29 | t | VIOLET | #7C3CC0 |
| 14 | e | GRASS | #4CC83C | 30 | u | LILAC | #C090F0 |
| 15 | f | LIME | #B8F050 | 31 | v | PEACH | #F8B888 |

### 14.3 Hero animations

| Animation | Frames | Cell | Rate |
|---|---|---|---|
| Run | 6 | 16x24 | 12 per world second |
| Jump: rise, apex, fall | 3 | 16x24 | chosen by vertical speed |
| Slide | 2 | 24x16 | 10 per world second |
| Cast (upper-body overlay on the run) | 1 | 16x12 | held 0.1 s after each correct key |
| Hurt | 1 | 16x24 | then blinking |
| Idle (menus) | 2 | 16x24 | 2 per second |
| Victory | 2 | 16x24 | 5 per second |
| Sit down (game over) | 2 | 16x24 | 3 per second |

Pip's colours: INK outline, RED, TEAL, PEACH, WHITE, DEEP_TEAL.

### 14.4 Parallax layers for Level 1, back to front

| Layer | Content | Scroll factor |
|---|---|---|
| L0 | Flat sky fill; the lowest 48 px dithered towards the haze colour | 0 |
| L1 | 3 clouds, WHITE with HAZE shading (32x16, 48x16, 64x24) | 0.1, plus 2 px/s drift |
| L2 | Far hills, ROYAL and HAZE | 0.2 |
| L3 | Mid hills with trees and a windmill (4-frame sails), FOREST and PINE | 0.4 |
| L4 | Near bushes and fence, GRASS and LIME; apple trees in section 2; molehills in section 3 | 0.7 |
| L5 | Play plane, 16 px tiles, ground surface at y = 184 | 1.0 |
| L6 | Foreground grass tufts at y of 200 or more, drawn under the type bar | 1.3 |

Large layers are composed from smaller repeated pieces so that no single sprite is wider than 128 px.

### 14.5 Time of day

| Part | Sky | Hills | Notes |
|---|---|---|---|
| Sections 1 and 2 | SKY with HAZE near the horizon | ROYAL, HAZE, FOREST, PINE | |
| Section 3 | Bands of ORANGE, CORAL and PLUM | VIOLET and PLUM | Palette swap `sunset` |
| Boss arena | DEEP_BLUE with twinkling stars and a 32x32 CREAM moon | PLUM and INK | Palette swap `dusk` |
| Hourglass active | The top sky band changes (SKY becomes ROYAL in daylight) | unchanged | Set per palette in the backdrop definition |

### 14.6 Presentation of hits and checkpoints

- Hurt: hurt frame, 3 px screen shake for 0.25 s, then Pip is drawn on alternate 3-frame intervals while invulnerable.
- Checkpoint: a 16x32 flagpole. The pennant (with a quill emblem) rises over 3 frames as Pip passes, then waves.
- Screen shake: hurt 3 px; boss stomp 2 px for 8 frames; word clear 1 px for 6 frames.
- "Reduce flash" turns off flashes and shake. Flashes are at most 2 frames long and at most 3 per second.

### 14.7 Font

8x8 cell, glyphs drawn in 7x7. Uppercase A-Z (lowercase input is shown as uppercase), 0-9, and `. , ! ? : ; ' " - + / % ( ) = * #`. Special glyphs: heart, star, four arrows, up and down chevrons, cursor block, ink drop, return arrow, copyright sign (a ring with a small C, the one glyph with 1 px strokes). Draw scales 1x, 2x and 4x, with an optional INK drop shadow.

These groups must be clearly distinct at 8x8: O, Q, D and 0; U and V; M, N, W and H; I, L and 1; S and 5; B and 8.

### 14.8 CRT overlay

- Tier 2 (section 19).
- Optional. Toggled in Options and Pause and saved in settings.
- Default on when the whole-number scale is 3 or more, otherwise off.
- The bottom third of each scaled pixel row is darkened at 18% opacity, plus a vignette reaching 15% at the corners.
- No curvature and no blur, because both reduce word legibility.

---

## 15. Audio direction

### 15.1 Architecture

- **Voices.** P12, P25 and P50 are pulse waves at 12.5%, 25% and 50% duty, built with PeriodicWave from 32 harmonics. TRI is a triangle oscillator. NZ-L is a long-period LFSR noise buffer and NZ-S is a 93-step metallic one; pitch is set by playback rate.
- **Routing.** Music uses 4 channels (pulse 1, pulse 2, triangle bass, noise percussion). Sound effects use 3 separate voices. When all are busy, a new sound takes over the voice of lowest priority that is not above its own, the one started first among equals; the sounds that repeat all the time (key_ok, key_bad, lock_on, lock_release, ink_drop, land, slide, urgent_tick, tally_tick, ui_move) never take over a reward (word_clear, streak, one_up, power_get, ink_blast, shield_up, checkpoint, crate_break, boss_hit, boss_defeat) and are left out instead. A sound timed for later (crate_break, boss_weak) takes its voice only when it starts. The master runs through a DynamicsCompressor.
- **Gains.** Music P1 0.20, P2 0.14, TRI 0.28, noise 0.16, through a music bus at 0.2. Sound effects 0.30. Key sounds 0.12. Typing sounds sit above the music: the start of key_ok is louder than the level or boss music with every channel at its loudest note.
- **Timing.** The sequencer schedules 100 ms ahead on the AudioContext clock.
- **Browser policy.** The AudioContext is created on the first key press or click (the boot screen).
- **Pause and focus.** These are two separate things. On the pause screen the music sequencer stops and sound effects still play, so the pause menu has its sounds. When the window loses focus or the tab is hidden, all sound is suspended; it comes back when the window has focus again, on every screen.
- **Reset.** At the start of a run and after a continue, the tempo returns to normal and all channels play, whatever was active when the last life was lost.
- **Fatigue.** `key_ok` can play several hundred times a minute, so it is short, quiet and varied in pitch. `key_bad` is soft so beginners are not discouraged. Music and sound effects have separate toggles.

### 15.2 Sound effects

Every figure is original. The game takes the feel of late-1980s console sound (pulse and noise voices, short arpeggios) but copies no game's sounds: one_up, ink_drop and start were rewritten because they had matched the Super Mario Bros. 1-up and coin figures note for note.

| Name | Trigger | Recipe |
|---|---|---|
| key_ok | Correct letter | P25, 45 ms, linear decay. Starts at C5 (523 Hz) and climbs one step of the C major pentatonic scale per letter typed in the word, so each word plays a rising run. In section 3 and the boss the scale follows the music key (Tier 2; the scale for each section is part of the level data) |
| key_bad | Wrong letter | P50 110 to 82 Hz over 90 ms plus NZ-L 40 ms, at half the gain of key_ok. One key never plays it twice: a second request within 20 ms (the key that triggers auto-release) is dropped |
| lock_on | First letter locks a target | P12, E5 then A5, 30 ms each (replaces key_ok for that key) |
| lock_release | Lock released | P25, A5 then E5, 30 ms each |
| word_clear | Word complete, including boss weak-point and finisher words | P25 arpeggio C6 E6 G6 C7, 35 ms per note, plus NZ-S 60 ms. In a major section it moves to the section's key (D6 F#6 A6 D7 in section 3), as do streak, checkpoint, one_up and ink_drop; minor sections keep C |
| clear_pop | POP family clear | P50 sweep 200 to 800 Hz in 120 ms, then NZ-L 50 ms |
| clear_twang | TWANG family clear | TRI 660 to 220 Hz exponential over 180 ms with 12 Hz vibrato |
| clear_bonk | BONK family clear | TRI 150 to 60 Hz in 100 ms plus NZ-L 30 ms |
| clear_crunch | CRUNCH family clear | NZ-L 80 ms at full volume plus TRI 100 to 50 Hz |
| streak | Streak milestone or multiplier step up | P25 G5 C6 E6 G6 C7, 50 ms each; second pulse a third below |
| jump | Jump | P50 sweep 220 to 660 Hz over 140 ms |
| land | Landing | NZ-L 30 ms at low rate plus TRI 80 Hz 30 ms |
| slide | Duck | NZ-L rate sweep high to low over 160 ms |
| cue_jump | Pip enters a jump window (Easy, Medium) | P12 C6 then G6, 40 ms each |
| cue_duck | Pip enters a duck window (Easy, Medium) | P12 G6 then C6, 40 ms each |
| ink_drop | Ink drop collected | P25 C6 for 30 ms, then G6 (a fifth up) for 90 ms. Drops collected less than 0.35 s apart step up the C major pentatonic, up to 4 steps |
| crate_break | Crate lands, 0.3 s after its word | NZ-L 80 ms, then P25 C5 E5 G5 at 30 ms each |
| power_get | Power-up collected | P25 C5 E5 G5 C6 E6 G6 C7 at 40 ms each; second pulse a fifth above, delayed 20 ms. From a crate, the power sound (power_get, shield_up or one_up) plays 0.48 s after the word, once crate_break has ended; ink_blast plays at once, with the blast |
| shield_up | Shield gained | TRI 440 Hz, 8 Hz vibrato of 20 Hz depth, 300 ms |
| shield_break | Shield absorbs a hit | P12 C7 G6 E6 C6 G5 at 35 ms each plus NZ-S 120 ms |
| slow_on | Hourglass starts | P50 880 to 220 Hz over 500 ms |
| slow_off | Hourglass ends | P50 220 to 880 Hz over 300 ms |
| ink_blast | Ink blast | NZ-L 600 ms decaying with falling rate, plus TRI 120 to 40 Hz over 400 ms |
| one_up | Extra life | P25 C6 C6 G6 G6 C7 at 60 ms each (10 ms apart), then E7 held 240 ms: pairs of notes climbing to a held top |
| hurt | Life lost to a hit | P50 400 to 100 Hz over 250 ms plus NZ-L 100 ms |
| fall | Fell in a crevasse | P25 800 to 80 Hz over 700 ms, then NZ-L thud 80 ms |
| rescue | Pip returns in the bubble | TRI 220 to 660 Hz over 300 ms |
| checkpoint | Flag raised | P25 C6+E6 then G6+C7, 120 ms each, TRI C4 underneath |
| warn | A threat appears from behind, above or below, or starts outside the screen (section 4.3) | P12 two beeps of 50 ms. Behind: 1760 Hz panned left 0.7. Above: 2093 Hz centre. Below: 880 Hz centre. Right: 1319 Hz panned right 0.7 |
| urgent_tick | Threat is urgent | P12 988 Hz 20 ms, 4 per second while any live threat is urgent and the screen is the level or the boss |
| boss_rumble | Boss entrance and the quiet before it | TRI 55 Hz with 6 Hz tremolo plus low-rate NZ-L, 1.5 s |
| boss_laugh | Taunt, and a missed weak-point word | P50 A4 G4 F4 E4 D4, 50 ms on and 40 ms off |
| boss_telegraph | Physical attack telegraph | P12 440 Hz pulses, 60 ms on and 60 ms off, for the telegraph time |
| boss_throw | Rock or pickaxe thrown | NZ-L 100 ms with rising rate |
| boss_stomp | Shockwave starts | NZ-L 120 ms at low rate plus TRI 70 Hz |
| deflect | Typed rock returns | P25 300 to 1200 Hz over 100 ms |
| boss_weak | Weak-point word appears | P12 trill B5/C6, 30 ms per note, 300 ms |
| boss_hit | Boss damaged | NZ-L 150 ms plus P50 160 to 80 Hz, then helmet bell P12 1568 Hz with 300 ms decay |
| boss_stun | Boss dizzy (finisher) | TRI warble 600 to 900 Hz at 6 Hz for 600 ms |
| boss_defeat | Boss defeated | 6 NZ-L bursts 120 ms apart at falling rates, P50 sweep 600 to 60 Hz, then 0.5 s silence |
| ui_move | Menu cursor moved | P25 660 Hz 25 ms |
| ui_select | Menu item chosen | P25 880 then 1320 Hz |
| ui_back | Menu back | P25 660 then 440 Hz |
| pause | Pause and resume | P25 E6 C6 E6 C6 at 60 ms each |
| tally_tick | Results counting | P12 1568 Hz 15 ms every 3 frames |
| stamp | Rank stamped | NZ-L 120 ms at low rate plus TRI 90 Hz |
| count_tick | Continue and resume countdowns | P50 440 Hz 80 ms per tick; 880 Hz for the last 3 of the continue countdown |
| start | Run starts | P50 G5 for 70 ms, then G6 held 350 ms |

### 15.3 Music

Channels: pulse 1, pulse 2, triangle bass, noise percussion.

| Track | Name | Tempo, key, length | Pulse 1 | Pulse 2 | Triangle | Noise |
|---|---|---|---|---|---|---|
| title | "Once Upon a Keystroke" | 132 BPM, C major, 16-bar loop | P25 lead, staccato, with a 16th-note echo at lower volume | P12 arpeggios in 16ths: C, Am, F, G; B part F, G, Em, Am, Dm, G, C, C | Root and fifth bounce in 8ths | Kick on 1 and 3, snare on 2 and 4, hats on off-beat 8ths |
| level1 | "Quill Meadows" | 150 BPM, G major, 32-bar AABA loop (about 51 s). Section 3: up 2 semitones, 158 BPM | P50 lead, 6 Hz vibrato on notes longer than 150 ms | P25 harmony in thirds and sixths, answering fills in bars 4 and 8 | Bouncing 8ths with octave jumps; A: G, Em, C, D; B: C, D, Bm, Em, Am, D, G, D | Kick on 1, the "and" of 2, and 3; snare on 2 and 4; 16th hats with accents |
| boss1 | "The Baron's Dig" | 168 BPM (184 in phase 3), E minor with F natural, 16-bar loop | P12 riff in 16ths | P50 octave ostinato on E; up an octave in phase 3 | E, F, G, F line in 8ths | Kick on every beat, snare on 2 and 4, snare roll every 4th bar |
| victory | "Words Restored" | 140 BPM, C major, 6 bars, no loop | P25 fanfare | P25 harmony a third below | Roots, held | Snare roll into a final hit |
| results | Results loop | 100 BPM, F major, 8-bar loop | P25 melody | P12 sustained thirds | Roots in half notes | Hats only |
| gameover | "Try Again" | 80 BPM, A minor, 4 bars, no loop, ends on E7 | P50 descending phrase | P12 sustained thirds | Descending A, G, F, E | None |

Jingles (played once over ducked music): `jingle_ready` (2 bars in the level key; once at the start of a run and once after each continue), `jingle_checkpoint` (0.6 s).

Which track plays in a level and at its boss is named in the level data, so a later level brings its own tracks.

Music changes that follow the game:
- Hourglass: tempo at 75% while active.
- Quiet before the boss: bass channel only.
- Boss phase 3: 184 BPM and pulse 2 up an octave.
- Pause: sequencer stopped.
- Start of a run and continue: tempo and channels back to normal.

---

## 16. Requirements checklist

Each sentence of the user's goal, and where the design meets it.

| # | Goal sentence | Where it is met |
|---|---|---|
| 1 | "Create a side-scrolling game where you have to type fast enough to clear obstacles as the character moves through the world." | Sections 1 and 3.1: Pip runs automatically and the world scrolls. Section 4.1: each threat has a time budget and reaches Pip if its word is not typed in time. Section 4.4: a typable threat cannot be jumped or ducked, so typing is the only way past it |
| 2 | "It should be in levels, maybe influenced by super mario brothers." | Section 11: Level 1 in three sections with checkpoint flags, gaps to jump, collectibles and an end-of-level boss. Levels are data files, so further levels can be added (contract section 5). Art and sound target the same period (sections 14 and 15) |
| 3 | "The character should have multiple lives with the ability to gain more within the game." | Section 6: 5 / 4 / 3 starting lives. Sections 7 and 8.5: extra lives from Red cap crates, every 100 ink drops and score thresholds |
| 4 | "As you type the words, the obstacles which could be animals, monsters, objects are cleared away." | Section 4.2: animals (snail, frog, bee, crow, boar, mole), objects (boulder, rocks, crates), and the Baron and his minions |
| 5 | "You don't need to hit enter to submit the word." | Sections 2 and 3.4: the last letter clears the threat on the same frame. Enter is never used for typing |
| 6 | "The obstacles can come from any direction and should show the word above the obstacle." | Sections 4.2 and 4.3: threats arrive from the right, from behind (left edge), from above (top edge) and from below (rising out of the ground in front of Pip). Section 4.5: the word plate sits above the sprite; section 4.3: edge tags show the word for threats not yet in the playfield |
| 7 | "As the word is typed, it should show the progress of the word being typed and the obstacle should clear away in a fun way once it is cleared." | Section 4.5: typed letters turn GOLD and rise, the next letter is underlined; the type bar mirrors the word at 2x. Sections 4.2 and 4.6: each kind has its own clear animation and sound family |
| 8 | "Each obstacle can display its own unique word." | Section 10.4: every threat gets its own word; active words never share a first letter; no repeat within 20 picks |
| 9 | "As the player progresses through the levels, the difficulty should increase." | Section 9.2: word tiers, word length, number of directions, active threat cap and hazard combinations all rise from section 1 to the boss. Later levels continue from there (section 17): each level's data file can raise the tuning numbers for that level |
| 10 | "There should also be an easy, medium, or hard setting that can be selected which changes the overall difficulty level for the player." | Section 12: difficulty select screen. Section 9.1: the full table of what each setting changes. Section 10: word pools per difficulty |
| 11 | "There should be a jump and a duck button that allows the player to clear crevasses or go under some obstacles." | Section 2: jump and duck keys and on-screen JUMP and DUCK buttons, which are always visible (sections 2 and 14.1). Section 5: every crevasse and bramble must be jumped; branches, beehives and the arch are ducked |
| 12 | "There should be a few different things that can be collected that power up a force field or other personal effects for the character." | Section 7: Bubble shield (force field), Hourglass, Golden quill, Ink blast, Red cap and ink drops |
| 13 | "There should be sounds and graphics reminiscent of the 80s and 90s." | Section 14: 384 x 216 pixel art, 32-colour palette, 8x8 bitmap font, parallax, optional CRT overlay. Section 15: pulse, triangle and noise voices, four-channel chiptune music |
| 14 | "There should be scores and other key data such as wpm." | Section 8: score, WPM, peak WPM, accuracy, streaks, reaction time, keys to practise. Section 13: live WPM and accuracy in the HUD. Section 8.9: high score tables |
| 15 | "There should be a boss at the end of each level to defeat." | Section 11.6: Baron von Burrow, three phases and a finisher word |
| 16 | "Start with one level." | This document specifies Level 1 only |
| 17 | "Each level should have a unique theme." | Sections 1 and 11.1: Quill Meadows has its own palette, tiles, enemies, word flavour, music and boss. Section 17 lists planned themes for later levels. The level data format carries the theme, including the music tracks, the key-sound scale, the word flavour and the level's own tuning (contract section 5.9) |
| 18 | Why: "Make learning to type feel thrilling and easy to learn." | Easy to learn: home-row-first tiers (10.2), tutorial slow-down (3.5), key guide (13.4), budgets sized from word length (4.1), adaptive pacing (9.3), errors never cost a life (6), results that name the keys to practise (8.8). Thrilling: same-frame feedback (3.4), streak multiplier and close-call bonus (8), threats from four directions (4), the boss and its finisher (11.6) |
| 19 | Outcome: "Give me a playable game that feels like it was made in the 80s or 90s and has excellent playability." | Sections 14 and 15 for the period feel. For playability: fixed jump geometry (3.2), signposted hazards (5), fairness rules (4.1, 4.4), plates that never overlap (4.5), spillover guard and auto-release (3.3), pause countdown (12) |
| 20 | Verification: "I can select the difficulty level which will determine the word selection, I can play the game, I can complete it without major bugs." | Difficulty select and word pools: sections 9, 10 and 12. Completable: unlimited continues from checkpoints and pacing that eases after each (6, 9.3). Tested: scripted bots must finish the level on all three difficulties in a headless harness, and the harness checks that every word shown in a run comes from the pools of the chosen difficulty (contract section 10) |

---

## 17. Later levels (not built now)

Listed only to show that each level has its own theme. The level data format must allow these without code changes beyond new enemy kinds and a new boss.

What a level's data file can set, so that a new level is a new file (contract section 5.9):

- palette, tiles, backdrop and hazard skins;
- the music tracks for the level and its boss, and the tempo, key and key-sound scale of each section;
- a word flavour, which adds that flavour's words to the tiers;
- a `tune` block that overrides tuning numbers of the difficulty table for this level (word length shift, cap on active threats, tier mix, timings, boss values). This is how a later level is made harder than the one before it;
- whether the level starts with tutorial threats.

| Level | Theme | Palette lead | Word flavour | Music |
|---|---|---|---|---|
| 2 | Clockwork Caverns | INK, PLUM, TEAL, AQUA | tools, machines | D minor, 140 BPM |
| 3 | Snowdrift Peaks | HAZE, WHITE, ROYAL | winter, travel | F major, 6/8, 126 BPM |
| 4 | Neon Harbour (night city) | DEEP_BLUE, PINK, AQUA | technology | A minor, 160 BPM |
| 5 | Castle Lexicon | MAROON, ORANGE, SHADOW | long and unusual words | C minor, 172 BPM |

---

## 18. Ideas from the proposals that were left out

| Idea | Reason |
|---|---|
| Level authored in seconds and converted to a different layout per difficulty | Geometry would have to be validated three times. The world clock gives the same effect with one layout |
| Assist values above 1.0 (game speeds up for fast typists) | Hard already serves fast typists, and speeding up makes high scores harder to compare |
| T, Y, P, E letter pickups | Marked lowest priority in the proposal; four more sprites and a HUD element |
| Gulper (threat rising from a crevasse), Rollo (log), Dangle (spider), Acorn | Seven threat kinds already cover the four directions. Each extra kind is more pixel art and more tuning |
| Burrow rush (the Baron surfaces behind Pip) | Needs the boss to move and turn. The minion and the high rock already bring other directions into the boss encounter |
| Rocks that damage the Baron when returned, with health of 12 to 24 | One health unit per weak-point word is easier to read on the health bar and to tune |
| Attract-mode demo play | Needs the bot in the browser build |
| "TRY EASY?" offer after repeated game overs | Changing word pools and score table in the middle of a run adds states. Pacing eases after each continue instead |
| Common mix-up pairs on the results screen | The results screen already has two lists of letters; this can be added later from the same data |
| Shield with a 20-second timer | A shield that lasts until used is simpler and kinder to beginners |
| Score kept on continue | Returning to the banked score keeps high scores comparable |
| Hit-stop done in the browser loop | Pauses that affect play are in the simulation so the browser and the headless bot behave the same. Picture-only freezes remain in presentation |
| Life-lost jingle and "GET READY" card after every hit | Recovery in place keeps the player typing. The jingle is kept for game over |
| Stars (1 to 3) as the result grade | Rank letters were chosen; one grading scheme is enough |
| Dodging a typable threat by jumping over it or sliding under it | The numbers gave the dodge a timing window as wide as the hazards that are meant to be jumped, so most of the level could be passed with little typing. Threats now reach Pip when their time runs out (section 4.4) |

---

## 19. Priorities

The design is large for one level. This section says what must be there and what can be left out if time runs short. The contract (section 12.2) has the same list with the fallback for each item.

### 19.1 Tier 1: needed by the goal

Everything in this document that is not listed in 19.2. In short:

- typing with lock-on, word plates that show progress, clear animations;
- threats from four directions, each with its own word;
- jump and duck hazards, keys and on-screen buttons;
- lives, extra lives, checkpoints, game over and continue;
- ink drops and the five power-ups;
- three difficulties with their word pools and tuning;
- score, WPM, accuracy, multiplier, rank, results screen, high scores;
- the Baron with three phases, rocks, shockwave, pickaxe, weak-point words and the finisher;
- adaptive pacing within a run;
- the Level 1 art, the sound effects and the music.

### 19.2 Tier 2: built last, dropped first

| Item | Where it is described |
|---|---|
| CRT overlay | 14.8 |
| Title screen idle rotation (premise text and high score tables after 12 s) | 12 |
| Average reaction time and slowest keys on the results screen | 8.1, 8.8 |
| Weak-letter and keyboard-adjacency weighting in the word picker | 10.4 step 10 |
| "READY FOR MEDIUM?" and "READY FOR HARD?" suggestion | 8.8 |
| `key_ok` scale that follows the music key | 15.2 |
| Assist value saved between runs | 9.3 |
| Long arch (hold duck) | 5, 11.5 |
| Two physical attacks in a row and the Digby minion in boss phase 3 | 11.6 |

### 19.3 Rules

- Tier 1 is built and tested first in every work package.
- A Tier 2 item may be left out if the game runs without error without it. Every module already has to cope with missing parts (contract 2.2 rule 6), and the contract gives the fallback value for each item.
- WP-H records which Tier 2 items were left out, in this section and in the contract.
- If integration runs short, WP-H may move further presentation-only details into Tier 2 and records them here. Anything that the test bot or the goal sentences in section 16 depend on stays in Tier 1.

### 19.4 Record for Level 1

No Tier 2 item was left out. All nine items of 19.2 are built and tested, and no further detail was moved into Tier 2 during integration (contract 12.2).

---

## Appendix A: starting word pools

These lists were checked by script: a to z only, lengths within range, no word in more than one list, letter-set rules for Easy tiers 1 to 3 hold. WP-A uses them as given and extends them under the rules in section 10.

### Easy

**Tier 1: home row only, 2-5 letters (49 words)**
as ad ah ha add ads ash ask all dad fad gag gal gas had has jag lad lag sad sag aha adds asks alas dash fall flag glad hall half hash lash sash saga gala lads dads lass shall flash flask glass salad slash salsa halls falls flags

**Tier 2: home row plus E I R T O U, 3-4 letters (56 words)**
red rat eat tea sit set let leg jet jog dog fog log hot hat hit hug rug dig kid lid oak oil out toe tie sea ear egg fur jar jug kit frog goat toad hare deer seal tree leaf lake hill road gate kite fire fish star rose tail gold joke ride sail dust

**Tier 3: all letters, 3-5 letters (60 words)**
cat bat bee bug cow cub van web zoo box fox yak map mud net nut pan pen pig pup sun win yes ant owl hen bird bear boat bone book cake camp cave coin corn crab crow duck drum farm hawk lamb lion mole moon moth nest pony pond swan wasp wolf worm bunny camel mouse snake zebra puppy

**Boss: 4-6 letters (40 words, plus themed additions)**
jump leap zoom vine root quick brave magic power storm giant crown spark blaze flame frost stone thorn grove woods maple cedar acorn berry honey petal bloom creek brook cheer smile happy lucky shiny swift fuzzy jolly proud clever mighty
Themed additions: burrow shovel helmet

**Finisher: 6-7 letters (9 words)**
forest meadow garden spring hooray winner bright friend victory

### Medium

**Tier 1: common words, 4-5 letters, no Q X Z (63 words)**
back ball barn bell blue bowl bush calm city clap coat cold cook dawn deep draw drop easy face find flip game glow hand help home hope keep kind king land milk mind path rain wind apple beach bread chair climb cloud dance dream earth field fruit grass green heart horse house light music night ocean plant river sheep sleep sound water world

**Tier 2: 5-6 letters, digraphs and double letters (69 words)**
brush chalk chest lunch match peach shark shell shirt teeth thumb whale wheel thing animal basket better bottle bridge butter button candle castle cherry circle cookie corner dinner dragon family farmer finger flower follow ground hammer island jacket jungle kitten ladder letter little market middle mirror monkey number orange parrot pencil pepper planet pocket rabbit ribbon rocket shadow silver spider stream summer sunset tunnel turtle valley window winter yellow

**Tier 3: 6-8 letters, brings in Q X Z J (59 words)**
puzzle zipper wizard frozen jigsaw quartz oxygen galaxy amazing balloon blanket captain chimney compass crystal diamond dolphin explore feather giraffe holiday journey kingdom kitchen lantern library machine mystery octopus penguin picture pumpkin quarter quickly rainbow science thunder village volcano weather whisper mixture example blizzard squirrel question mosquito exercise keyboard backpack elephant mountain sandwich dinosaur sunshine triangle umbrella treasure notebook

**Boss: 7-9 letters (43 words, plus themed additions)**
monster warrior courage bravery triumph champion creature fearless fortress guardian gigantic powerful strength thousand together tomorrow defender skeleton adventure beautiful butterfly challenge chocolate crocodile dangerous different discovery excellent fantastic furniture important invisible knowledge lightning orchestra pineapple rectangle signature telephone vegetable wonderful yesterday hurricane
Themed additions: monocle molehill

**Finisher: 10-11 letters (16 words)**
tremendous strawberry basketball playground remarkable watermelon lighthouse helicopter earthquake everything trampoline incredible spectacular celebration imagination magnificent

### Hard

**Tier 1: 5-7 letters (76 words)**
abyss azure bayou blitz brisk cache chasm civic crypt dwarf epoch fjord gauze glyph gnome gusto havoc ivory jaunt joust kayak kiosk knack lyric mauve nexus nymph optic oxide pixel plaza proxy quake qualm query quest queue quill quirk quota rhyme squid topaz tweak unzip vague vivid waltz wharf wrist yacht zesty zephyr zigzag zodiac quiver sphinx rhythm jockey hybrid hazard gazebo frenzy enzyme dazzle cobweb bypass buzzer bazaar abrupt awkward equinox exhibit jackpot jukebox squeeze

**Tier 2: 7-9 letters (66 words)**
acquire alchemy anxious archive bizarre boycott buoyant calypso cryptic dynasty eclipse equator exhaust fixture gazelle glimpse gymnast horizon hydrant hygiene jasmine javelin jubilee juniper kinetic lozenge mammoth oblique orchard paradox phoenix plywood pyramid quantum rhubarb squeaky synonym texture trapeze typhoon zoology abstract zeppelin zucchini buzzword chipmunk flapjack jeopardy junkyard knapsack mnemonic puzzling quagmire quadrant quixotic rhapsody squabble squadron symphony quotient obsidian avalanche blackjack labyrinth mezzanine xylophone

**Tier 3: 8-11 letters (50 words)**
vanquish rhythmic algorithm boulevard chrysalis dehydrate exquisite juxtapose mythology pneumatic technique whirlwind zoologist sovereign quicksand whimsical ephemeral threshold hydraulic squeamish accomplish apocalypse bankruptcy blacksmith camouflage chandelier cyberspace exaggerate excavation hieroglyph hypothesis mozzarella phenomenon playwright psychology quarantine rendezvous rhinoceros silhouette stalactite turbulence ubiquitous vocabulary wavelength zigzagging bewildering catastrophe equilibrium fluorescent unequivocal

**Boss: 9-12 letters (41 words)**
supernova whirlpool invincible juggernaut razzmatazz skyscraper mastermind hypersonic quizmaster abracadabra acknowledge cataclysmic choreograph flabbergast hallucinate mischievous pandemonium quadrillion quicksilver unbreakable unstoppable xylophonist nightingale thunderbolt breakthrough conquistador cryptography electrifying extinguisher hippopotamus idiosyncrasy impenetrable kaleidoscope lexicography onomatopoeia overwhelming pyrotechnics sledgehammer wholehearted ambidextrous stratosphere

**Finisher: 13-15 letters (17 words)**
extraordinary thunderstruck indestructible unquestionable kaleidoscopic quintessential uncompromising transformation congratulations metamorphosis unconquerable tyrannosaurus hydroelectric perpendicular chrysanthemum phosphorescent whippersnapper

## Appendix B: ink drop placement

| Pattern | Where | Count |
|---|---|---|
| Arc of 5 following the jump arc. The drops are 16, 8 and 0 px either side of the middle of the gap, at heights of 22, 36, 36, 36 and 22 px above the ground (the arc of a jump that takes off 24 px before the middle, capped at 36 px) | Over each of the 11 gaps (including gaps bridged on Easy) | 55 |
| Row of 3 on the ground, 8 px apart, centred under the hazard | Under each branch and beehive (7 on Medium and Hard, 6 on Easy) | 21 |
| Row of 5 | Under the long arch | 5 |
| Row of 4 on the ground, 2 tiles apart | Starting at tiles 14, 88, 146, 184, 222, 262, 310, 372, 408, 462, 540, 552, 624, 692, 776, 786, 856, 870 | 72 |
| Total | | 153 (150 on Easy) |

Every drop can be collected. If the long arch is left out (Tier 2), its row of 5 goes with it and the totals are 148 and 145.
