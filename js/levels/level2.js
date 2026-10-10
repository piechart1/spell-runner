// js/levels/level2.js
// SPELL RUNNER Level 2: CLOCKWORK CAVERNS. Registers TG.Levels[2].
//
// Plan: docs/LEVEL2.md. Contract: docs/CONTRACT.md section 5.9. Positions are in tiles (16 px); x is the
// trigger tile of a threat or crate and the left edge of a gap or hazard; min is the lowest difficulty that
// uses the entry. No tutorial threats; the first two threats carry `intro` in their place (LEVEL2 9.2).
// The tune block is LEVEL2 section 8.1: timing values within 25% of js/core.js, whole numbers within 1,
// tierMix replaced whole.
//
// Tuning changes: none. The first measurement with the real Dangle and Flit (M1; LEVEL2 8.6 and 13.5)
// needed none: the acceptance matrix and every extra check pass with the tune block of LEVEL2 8.1 and the
// timeline of LEVEL2 9 as written. The targets of LEVEL2 13.5, on seeds 1 to 5: the floor bots finish with
// no continue, from assist 1.0 and from the assist a Level 1 floor run leaves saved; the target bot's mean
// window use u is 0.52 to 0.58 / 0.60 to 0.63 / 0.68 to 0.72 and its fight 69 to 74 / 100 to 103 / 110 to
// 112 s; no threat is live at the arena flag.
//   Two of those targets are not met on every seed. Easy's u is under the band's 0.55 on three seeds of
//     the five (on seeds 1 to 20 it is 0.52 to 0.59, and under on 8): the exception decision 1 notes. And
//     on seeds 1 to 20 the last Dangle (886) is still live at the arena flag in 1 of 60 floor runs from
//     assist 1.0 and 4 of 60 from the saved assist, and in none of the 60 target runs. Neither was tuned:
//     Easy's timing is kept by decision 1 and the Dangle of 886 is the layout of decision 20, so both go
//     back to the owner, with decision 34.
//   Tried and not kept: the last crate (890) 1 to 6 tiles earlier, for decision 34. Where it is, the crate
//     is still untyped at the arena flag in 5 of 10 Medium and 6 of 10 Hard target and floor runs. At 886
//     to 889 that hardly moves (4, and 5 or 6, of 10). At 884 or 885 no crate is left at the flag (it is
//     typed in 10 of 10 Medium and 9 of 10 Hard runs), and the Dangle of 886 is left there in its place, in
//     5 of 10 Medium and 6 of 10 Hard runs.
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
