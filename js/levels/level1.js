// js/levels/level1.js
// SPELL RUNNER Level 1: QUILL MEADOWS (WP-E). Registers TG.Levels[1].
//
// Contract: docs/CONTRACT.md section 5.9. Design: docs/DESIGN.md section 11 and Appendix B.
// Positions are in tiles (16 px). For a threat or crate, x is the trigger tile: the entry appears when
// Pip's centre reaches x * 16. For a gap or hazard, x is its left edge. `min` is the lowest difficulty
// that uses the entry (absent = every difficulty); a gap below its min is bridged from the start and a
// hazard below its min is absent.
//
// Tuning changes (CONTRACT 12.1 and 13.4). The delivery by WP-E needed none: the full acceptance matrix
// and every extra check of test/sim.js passed with the starting values of CONTRACT 5.10 and the timeline
// of DESIGN 11 as written, and CONSTANT_OVERRIDES in test/sim.js is empty. The Tier 2 double attack and
// minion of boss phase 3 are built, so config.boss.doubleAttack and config.boss.minion keep their values
// from CONTRACT 5.10. The changes below were made after a play review, all within the limits of 12.1;
// none was needed to make a run pass.
//   medium react: 1.2 -> 1.0. hard react: 0.7 -> 0.6. medium perChar: 0.5 -> 0.45. hard perChar: 0.3 -> 0.27.
//     Players in the middle of each speed range finished threat words with about half their time left
//     and almost never lost a life to typing (target bot mean window use u 0.47 / 0.56 against the 0.75
//     of DESIGN 4.1). With these values it is 0.54 / 0.62; the floor bots still finish without a continue.
//   medium boss.health: 6 -> 5, boss.coreWords [2, 2, 2] -> [1, 2, 2]. hard boss.health: 8 -> 7,
//     boss.coreWords [2, 3, 3] -> [2, 2, 3]. The fight took about 101 / 117 s for the target bot against
//     the 95 / 100 s of DESIGN 11.6, a third of the run or more; now about 88 / 105 s. Phase 3 keeps its
//     weak-point words.
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};
  TG.Levels = TG.Levels || {};

  TG.Levels[1] = {
    id: 1,
    name: 'QUILL MEADOWS',
    tutorial: true,
    tune: {
      medium: { react: 1.0, perChar: 0.45, boss: { health: 5, coreWords: [1, 2, 2] } },
      hard: { react: 0.6, perChar: 0.27, boss: { health: 7, coreWords: [2, 2, 3] } }
    },
    theme: {
      id: 'meadow',
      backdrop: 'meadow',
      wordFlavour: 'meadow',
      music: { level: 'level1', boss: 'boss1' },
      tiles: {
        top: 'tile_grass', fill: 'tile_soil',
        edgeL: 'tile_edge_l', edgeR: 'tile_edge_r', wallL: 'tile_wall_l', wallR: 'tile_wall_r',
        gapFill: 'tile_water', gapFillDark: 'tile_dark', plank: 'tile_plank',
        arenaTop: 'tile_arena', arenaFill: 'tile_soil', rail: 'tile_rail'
      },
      hazardSkins: { bramble: 'haz_bramble', branch: 'haz_branch', beehive: 'haz_beehive', arch: 'haz_arch' }
    },
    lengthTiles: 880,
    sections: [
      { name: 'MORNING MEADOW', stage: '1-1', from: 0, to: 256, palette: 'day', gapFill: 'water',
        music: { transpose: 0, tempo: 150, keyOk: { root: 0, mode: 'major' } } },
      { name: 'ORCHARD BROOK', stage: '1-2', from: 256, to: 544, palette: 'day', gapFill: 'water',
        music: { transpose: 0, tempo: 150, keyOk: { root: 0, mode: 'major' } } },
      { name: 'SUNSET RIDGE', stage: '1-3', from: 544, to: 880, palette: 'sunset', gapFill: 'dark',
        music: { transpose: 2, tempo: 158, keyOk: { root: 2, mode: 'major' } } }
    ],
    arena: { name: "THE BARON'S DIG", stage: '1-B', palette: 'dusk', arenaTilesFrom: 872,
      music: { transpose: 0, tempo: 168, keyOk: { root: 4, mode: 'minor' } } },
    checkpoints: [0, 256, 544, 880],

    gaps: [
      { x: 106, w: 1 },                     // section 1: first jump
      { x: 202, w: 2 },                     // section 1: wide jump
      { x: 322, w: 2 },                     // section 2: stepping stones
      { x: 330, w: 2, min: 'medium' },
      { x: 338, w: 2 },
      { x: 479, w: 2 },                     // section 2: movement only
      { x: 502, w: 1 },                     // section 2: typing in the air
      { x: 632, w: 2 },                     // section 3: two jumps
      { x: 642, w: 1, min: 'medium' },
      { x: 804, w: 1 },                     // section 3: movement run
      { x: 818, w: 2 }
    ],

    hazards: [
      { x: 156, kind: 'branch' },
      { x: 236, kind: 'branch' },
      { x: 418, kind: 'branch' },
      { x: 428, kind: 'branch' },
      { x: 472, kind: 'bramble' },
      { x: 486, kind: 'bramble', min: 'medium' },
      { x: 702, kind: 'beehive' },
      { x: 709, kind: 'bramble' },
      { x: 716, kind: 'beehive', min: 'medium' },
      { x: 811, kind: 'branch' },
      { x: 828, kind: 'arch', w: 3 }        // Tier 2: long arch, hold duck
    ],

    spawns: [
      // Section 1: MORNING MEADOW. Threats from the right only.
      { x: 22, kind: 'boulder', min: 'easy', tutorial: true },
      { x: 44, kind: 'boulder', min: 'easy', tutorial: true },
      { x: 66, kind: 'dawdle', min: 'easy', tutorial: true },
      { x: 112, kind: 'hoppet', min: 'easy' },
      { x: 118, kind: 'buzzle', min: 'medium' },
      { x: 124, kind: 'dawdle', min: 'hard' },
      { x: 132, kind: 'hoppet', min: 'easy' },
      { x: 138, kind: 'buzzle', min: 'hard' },
      { x: 162, kind: 'crate', power: 'shield', min: 'easy' },
      { x: 166, kind: 'hoppet', min: 'easy' },
      { x: 172, kind: 'buzzle', min: 'hard' },
      { x: 174, kind: 'boulder', min: 'easy' },
      { x: 206, kind: 'dawdle', min: 'easy' },
      { x: 212, kind: 'buzzle', min: 'easy' },
      { x: 216, kind: 'hoppet', min: 'hard' },
      { x: 240, kind: 'buzzle', min: 'easy' },
      { x: 244, kind: 'hoppet', min: 'easy' },
      { x: 248, kind: 'dawdle', min: 'hard' },
      { x: 250, kind: 'hoppet', min: 'hard' },

      // Section 2: ORCHARD BROOK. Adds threats from above and from behind.
      { x: 268, kind: 'swoop', min: 'easy', intro: true },
      { x: 296, kind: 'boulder', min: 'easy' },
      { x: 300, kind: 'hoppet', min: 'easy' },
      { x: 304, kind: 'buzzle', min: 'hard' },
      { x: 342, kind: 'crate', power: 'hourglass', min: 'easy' },
      { x: 346, kind: 'dawdle', min: 'easy' },
      { x: 352, kind: 'buzzle', min: 'easy' },
      { x: 358, kind: 'hoppet', min: 'easy' },
      { x: 364, kind: 'swoop', min: 'hard' },
      { x: 390, kind: 'truffle', min: 'easy', intro: true },
      { x: 396, kind: 'swoop', min: 'hard' },
      { x: 434, kind: 'buzzle', min: 'easy' },
      { x: 438, kind: 'truffle', min: 'easy' },
      { x: 440, kind: 'boulder', min: 'easy' },
      { x: 444, kind: 'swoop', min: 'medium' },
      { x: 450, kind: 'hoppet', min: 'hard' },
      { x: 490, kind: 'crate', power: 'cap', min: 'easy' },
      { x: 492, kind: 'boulder', min: 'easy' },
      { x: 514, kind: 'hoppet', min: 'easy' },
      { x: 518, kind: 'swoop', min: 'easy' },
      { x: 522, kind: 'truffle', min: 'medium' },
      { x: 526, kind: 'buzzle', min: 'easy' },
      { x: 530, kind: 'dawdle', min: 'hard' },
      { x: 534, kind: 'hoppet', min: 'hard' },

      // Section 3: SUNSET RIDGE. Adds threats from below and waves from all four directions.
      { x: 560, kind: 'digby', min: 'easy', intro: true },
      { x: 590, kind: 'digby', min: 'easy' },
      { x: 596, kind: 'buzzle', min: 'easy' },
      { x: 600, kind: 'hoppet', min: 'easy' },
      { x: 604, kind: 'swoop', min: 'hard' },
      { x: 616, kind: 'crate', power: 'quill', min: 'easy' },
      { x: 648, kind: 'hoppet', min: 'easy' },
      { x: 654, kind: 'swoop', min: 'medium' },
      { x: 658, kind: 'boulder', min: 'easy' },
      { x: 662, kind: 'truffle', min: 'medium' },
      { x: 668, kind: 'crate', power: 'blast', min: 'easy' },
      { x: 684, kind: 'buzzle', min: 'easy' },
      { x: 722, kind: 'buzzle', min: 'easy' },
      { x: 728, kind: 'truffle', min: 'easy' },
      { x: 734, kind: 'swoop', min: 'easy' },
      { x: 740, kind: 'digby', min: 'easy' },
      { x: 746, kind: 'hoppet', min: 'medium' },
      { x: 754, kind: 'dawdle', min: 'medium' },
      { x: 766, kind: 'boulder', min: 'easy' },
      { x: 770, kind: 'crate', power: 'cap', min: 'easy' },
      { x: 834, kind: 'truffle', min: 'easy' },
      { x: 838, kind: 'buzzle', min: 'easy' },
      { x: 842, kind: 'swoop', min: 'medium' },
      { x: 850, kind: 'crate', power: 'shield', min: 'easy' }
    ],

    ink: [
      // Rows of 4 on the ground, 2 tiles apart.
      { x: 14, shape: 'row', n: 4, step: 2 },
      { x: 88, shape: 'row', n: 4, step: 2 },
      { x: 146, shape: 'row', n: 4, step: 2 },
      { x: 184, shape: 'row', n: 4, step: 2 },
      { x: 222, shape: 'row', n: 4, step: 2 },
      { x: 262, shape: 'row', n: 4, step: 2 },
      { x: 310, shape: 'row', n: 4, step: 2 },
      { x: 372, shape: 'row', n: 4, step: 2 },
      { x: 408, shape: 'row', n: 4, step: 2 },
      { x: 462, shape: 'row', n: 4, step: 2 },
      { x: 540, shape: 'row', n: 4, step: 2 },
      { x: 552, shape: 'row', n: 4, step: 2 },
      { x: 624, shape: 'row', n: 4, step: 2 },
      { x: 692, shape: 'row', n: 4, step: 2 },
      { x: 776, shape: 'row', n: 4, step: 2 },
      { x: 786, shape: 'row', n: 4, step: 2 },
      { x: 856, shape: 'row', n: 4, step: 2 },
      { x: 870, shape: 'row', n: 4, step: 2 },
      // Arcs of 5 over every gap, including the gaps bridged on Easy.
      { gap: 106, shape: 'arc' },
      { gap: 202, shape: 'arc' },
      { gap: 322, shape: 'arc' },
      { gap: 330, shape: 'arc' },
      { gap: 338, shape: 'arc' },
      { gap: 479, shape: 'arc' },
      { gap: 502, shape: 'arc' },
      { gap: 632, shape: 'arc' },
      { gap: 642, shape: 'arc' },
      { gap: 804, shape: 'arc' },
      { gap: 818, shape: 'arc' },
      // Rows under the duck hazards: 3 drops, 5 under the arch.
      { hazard: 156, shape: 'under' },
      { hazard: 236, shape: 'under' },
      { hazard: 418, shape: 'under' },
      { hazard: 428, shape: 'under' },
      { hazard: 702, shape: 'under' },
      { hazard: 716, shape: 'under' },
      { hazard: 811, shape: 'under' },
      { hazard: 828, shape: 'under' }
    ],

    decor: [
      { x: 8, sprite: 'sign_type' }
    ],

    boss: { kind: 'baron', speech: 'MY MEADOW! MY WORDS!' }
  };
})(typeof window !== 'undefined' ? window : globalThis);
