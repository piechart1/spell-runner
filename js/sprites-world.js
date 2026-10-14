// js/sprites-world.js
// SPELL RUNNER world art (WP-D): tiles, hazards, signs, items, effects, icons and backdrop pieces,
// the remaps `sunset` and `dusk`, and the backdrop `meadow`. CONTRACT 6.1 to 6.5, DESIGN 14.
//
// Level 2 (docs/LEVEL2.md 3 and Appendix C) adds the remaps `brass`, `crystal` and `paleink`, beside the
// Level 1 remaps, and two marked regions: the tiles, hazard skins and small pieces after the Level 1 effects,
// and the pieces and definition of the backdrop `cavern` at the end of the file.
//
// This file holds definitions only. Nothing is drawn and no other module is called when it loads.
//
// Pixel data: one string per row, one character per pixel. '.' is transparent; the other characters
// are the palette keys of DESIGN 14.2:
//   0 INK      1 SHADOW   2 STONE    3 SILVER   4 WHITE    5 DEEP_BLUE 6 ROYAL   7 SKY
//   8 HAZE     9 DEEP_TEAL a TEAL    b AQUA     c PINE     d FOREST    e GRASS   f LIME
//   g BRONZE   h ORANGE   i GOLD     j CREAM    k BARK     l SOIL      m CLAY    n SAND
//   o MAROON   p RED      q CORAL    r PINK     s PLUM     t VIOLET    u LILAC   v PEACH
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  // define(name, width, height, anchorX, anchorY, fps, 'frame names', [frames])
  function define(name, w, h, ax, ay, fps, names, frames) {
    TG.Sprites.define(name, {
      w: w, h: h, anchor: [ax, ay], fps: fps, owner: 'D', names: names.split(' '), frames: frames
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Tiles (16x16, anchor top left). No outline. The remaps sunset and dusk are applied to them.
  // ---------------------------------------------------------------------------------------------

  define('tile_grass', 16, 16, 0, 0, 0, 'g0 g1', [
    [   // g0
      'ffffefffffffefff',
      'efefeeffeefeeefe',
      'eeeeeeeeeeeeeeee',
      'eedeeeeedeeeeede',
      'edeedeedeedeedee',
      'dddddddddddddddd',
      'ddkdddkkddkdddkd',
      'dkkkdkkkkdkkdkkk',
      'kklkkkllkkklkkll',
      'llllmlllllllllll',
      'llmmllllllkllmll',
      'llllllllllllllll',
      'lkllllmlllllmlll',
      'llllllllllllllll',
      'lmlllkllllmllllk',
      'llllllllllllllll'
    ],
    [   // g1
      'ffefffffeffffffe',
      'eefeefeeeeffeefe',
      'eeeeeeeeeeeeeeee',
      'eeeedeeeeedeeeee',
      'deedeedeedeedeed',
      'dddddddddddddddd',
      'kdddkdddkdddkddd',
      'kkdkkkdkkkdkkkdk',
      'lkkkllkklkkkllkk',
      'llllllllmlllllll',
      'lllkllllllllllml',
      'mlllllllllllllll',
      'lllllllmllllklll',
      'llllllllllllllll',
      'llmllllllllmllll',
      'llllllklllllllll'
    ]
  ]);

  define('tile_soil', 16, 16, 0, 0, 0, 's0 s1', [
    [   // s0
      'llllllllllllllll',
      'lllmmlllllllllll',
      'llmmmmllllllklll',
      'lllkklllllllllll',
      'llllllllllmlllll',
      'lkllllllllllllll',
      'lllllllllllllmml',
      'llllllmlllllmmmm',
      'lllllllllllllkkl',
      'llllllllllllllll',
      'llmllllllkllllll',
      'llllllllllllllll',
      'lllllmmlllllllml',
      'llllmmmmllllllll',
      'lllllkklllklllll',
      'llllllllllllllll'
    ],
    [   // s1
      'llllllllllllllll',
      'llllllllllmmllll',
      'lkllllllllmmmlll',
      'lllllllllllkkllk',
      'llllmlllllllllll',
      'llllllllllllllll',
      'mmllllllklllllll',
      'mmmlllllllllllml',
      'kkllllllllllllll',
      'llllllmmllllllll',
      'lllllmmmmllllkll',
      'llllllkkllllllll',
      'llllllllllllllll',
      'llkllllllllmllll',
      'llllllllllllllll',
      'lllllllmllllllll'
    ]
  ]);

  define('tile_edge_l', 16, 16, 0, 0, 0, 'edge', [
    [   // edge
      'ffffefffffffeff.',
      'efefeeffeefeeeff',
      'eeeeeeeeeeeeqeef',
      'eedeeeeedeeqiqee',
      'edeedeedeedeqeee',
      'ddddddddddddeeee',
      'ddkdddkkddkddeee',
      'dkkkdkkkkdkkddee',
      'kklkkkllkkklkdde',
      'llllmlllllllkkdd',
      'llmmllllllklllkd',
      'lllllllllllllllm',
      'lkllllmllllllklm',
      'lllllllllllllllk',
      'lmlllkllllmllkmm',
      'lllllllllllllllm'
    ]
  ]);

  define('tile_edge_r', 16, 16, 0, 0, 0, 'edge', [
    [   // edge
      '.ffefffffffeffff',
      'ffeeefeeffeefefe',
      'feeqeeeeeeeeeeee',
      'eeqiqeedeeeeedee',
      'eeeqedeedeedeede',
      'eeeedddddddddddd',
      'eeeddkddkkdddkdd',
      'eeddkkdkkkkdkkkd',
      'eddklkkkllkkklkk',
      'ddkklllllllmllll',
      'dklllkllllllmmll',
      'mlllllllllllllll',
      'mlkllllllmllllkl',
      'klllllllllllllll',
      'mmkllmllllklllml',
      'mlllllllllllllll'
    ]
  ]);

  define('tile_wall_l', 16, 16, 0, 0, 0, 'wall', [
    [   // wall
      'llllllllllllllkm',
      'lllmmllllllllllm',
      'llmmmmlllllklllk',
      'lllkkllllllllkmm',
      'llllllllllmllllm',
      'lkllllllllllllkm',
      'lllllllllllllllk',
      'llllllmllllllkmm',
      'lllllllllllllllm',
      'llllllllllllkllk',
      'llmllllllkllllkm',
      'lllllllllllllkkm',
      'lllllmmlllllllkk',
      'llllmmmmlllllkkm',
      'lllllkkllllllkkk',
      'llllllllllllkkkk'
    ]
  ]);

  define('tile_wall_r', 16, 16, 0, 0, 0, 'wall', [
    [   // wall
      'mkllllllllllllll',
      'mllllllllllmmlll',
      'klllklllllmmmmll',
      'mmkllllllllkklll',
      'mllllmllllllllll',
      'mkllllllllllllkl',
      'klllllllllllllll',
      'mmkllllllmllllll',
      'mlllllllllllllll',
      'kllkllllllllllll',
      'mkllllkllllllmll',
      'mkklllllllllllll',
      'kklllllllmmlllll',
      'mkklllllmmmmllll',
      'kkkllllllkklllll',
      'kkkkllllllllllll'
    ]
  ]);

  define('tile_water', 16, 16, 0, 0, 3, 'w0 w1', [
    [   // w0
      '8448888884488888',
      '7788777777887777',
      '6777766667777666',
      '6666666666666666',
      '6667766666666776',
      '6666666666666666',
      '6666666677666666',
      '6566666666666566',
      '6666656666656666',
      '6776666566666666',
      '6656566666566656',
      '5665656566656565',
      '5656565656565656',
      '5565655565655565',
      '5555565555555655',
      '5555555555555555'
    ],
    [   // w1
      '8888844888888448',
      '7777788777777887',
      '6766667777666677',
      '6666666666666666',
      '6666667766666666',
      '6666666666666666',
      '6677666666666776',
      '6666665666666666',
      '6656666666566666',
      '6666666776666656',
      '6566656666665666',
      '6565665656566565',
      '5656565656565656',
      '5655565565556555',
      '5555655555565555',
      '5555555555555555'
    ]
  ]);

  define('tile_dark', 16, 16, 0, 0, 0, 'dark', [
    [   // dark
      '0000000000000000',
      '0000000000000000',
      '0000000000000000',
      '0000000000000000',
      '0000000000000000',
      '0000000000000000',
      '0000000000000000',
      '0000000000000000',
      '0000000000000000',
      '0000000000000000',
      '0000000000000000',
      '0000010000000000',
      '0000000000001000',
      '0100000010000000',
      '0000100000000010',
      '1000001000100000'
    ]
  ]);

  define('tile_plank', 16, 16, 0, 0, 0, 'plank', [
    [   // plank
      'nnnknnnknnnknnnk',
      'mmmkmmmkmmmkmmmk',
      'mmmkmmmkmmmkmmmk',
      'mlmkmmlkmlmkmmlk',
      'llllllllllllllll',
      'kkkkkkkkkkkkkkkk',
      '..kk........kk..',
      '..kk........kk..',
      '...k........k...',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................'
    ]
  ]);

  define('tile_arena', 16, 16, 0, 0, 0, 'a0 a1', [
    [   // a0
      'mmnmmlmmmmlmmnmm',
      'lmmmlllmmllllmml',
      'llllllllllllllll',
      'llmmmllllllmmlll',
      'lmmmmmllllmmmmll',
      'lllmmkklllllmkkl',
      'llkkkklllllllkkl',
      'llllllllmmllllll',
      'mlllllllmmmlllll',
      'mmlllllllkkklllm',
      'kkkllllllllllllk',
      'llllmmllllllmlll',
      'lllmmmmllllmmmll',
      'llllkkkklllllkkl',
      'llllllllllllllll',
      'llllllllllllllll'
    ],
    [   // a1
      'mlmmmnmmlmmmmmlm',
      'llmmlllmmllmmlll',
      'llllllllllllllll',
      'lllllllmmmllllll',
      'mmllllmmmmmllllm',
      'mmmlllllmkkkllmm',
      'kkklllllkkkllllk',
      'llllllllllllllll',
      'lllmmlllllllmmll',
      'llmmmmlllllmmmml',
      'lllkkkklllllmkkk',
      'llllllllllllllkl',
      'lmllllllmmllllll',
      'mmmllllmmmmlllll',
      'kkklllllkkkkllll',
      'llllllllllllllll'
    ]
  ]);

  // Mine rail over tile_arena: SILVER rail head, STONE web, sleepers with a SAND top and a CLAY face on
  // BARK ends. The sleepers avoid SOIL and BARK faces because the dusk remap turns the ground into BARK.
  define('tile_rail', 16, 16, 0, 0, 0, 'rail', [
    [   // rail
      '3333333333333333',
      '2222222222222222',
      '.knnnnk..knnnnk.',
      '.kmmmmk..kmmmmk.',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................'
    ]
  ]);

  // ---------------------------------------------------------------------------------------------
  // Hazards, signs and the checkpoint flag (anchor bottom left; signs bottom centre).
  // ---------------------------------------------------------------------------------------------

  define('haz_trunk', 16, 16, 0, 16, 0, 'trunk', [
    [   // trunk
      '....0mllklk0....',
      '....0mllklk0....',
      '....0mlkllk0....',
      '....0mlkllk0....',
      '....0mmllkk0....',
      '....0mmllkk0....',
      '....0mlllkk0....',
      '....0mlklkk0....',
      '....0mlkllk0....',
      '....0mllllk0....',
      '....0mllklk0....',
      '....0mmlklk0....',
      '....0mmllkk0....',
      '....0mlkllk0....',
      '....0mlkllk0....',
      '....0mllklk0....'
    ]
  ]);

  // Low branch: the trunk flares into a BARK bough across the full width, with LIME and GRASS leaves hanging
  // below it in pointed tips and CORAL berries as the hazard accent. INK outline except at the top, where
  // haz_trunk continues upwards.
  define('haz_branch', 16, 16, 0, 16, 0, 'branch', [
    [   // branch
      '....0mllklk0....',
      '....0mlkllk0....',
      '....0mlkllk0....',
      '.0000mllllk0000.',
      '0mmmmmllllkkkkk0',
      '0nmllllkllllklk0',
      '0kkkkkkkkkkkkkk0',
      '0ffffffeffffffe0',
      '0fffqqffeffqqfe0',
      '0feeqqeeeeeqqee0',
      '0eeeeeeqqeeeeed0',
      '0edeeeeqqeedeed0',
      '0dde0ddddd0e0dd0',
      '.0d0.0ddd0.0dd0.',
      '..0...0d0...00..',
      '.......0........'
    ]
  ]);

  define('haz_rope', 16, 16, 0, 16, 0, 'rope', [
    [   // rope
      '......0nm0......',
      '......0nn0......',
      '......0mn0......',
      '......0km0......',
      '......0nm0......',
      '......0nn0......',
      '......0mn0......',
      '......0km0......',
      '......0nm0......',
      '......0nn0......',
      '......0mn0......',
      '......0km0......',
      '......0nm0......',
      '......0nn0......',
      '......0mn0......',
      '......0km0......'
    ]
  ]);

  define('haz_beehive', 16, 24, 0, 24, 0, 'hive', [
    [   // hive
      '......0nm0......',
      '......0nn0......',
      '......0mn0......',
      '.....0gggg0.....',
      '....0iiihhh0....',
      '...0iiiihhhh0...',
      '..0gggggggggg0..',
      '..0iijiihhhhh0..',
      '.0iijiiihhhhhh0.',
      '.0gggggggggggg0.',
      '0iiiiiiihhhhhhh0',
      '0iijiiqqqqhhhhh0',
      '0iiiiq0000qhhhh0',
      '0ggggq0000qgggg0',
      '0iiiiiqqqqhhhhh0',
      '.0iiiiiihhhhhh0.',
      '.0gggggggggggg0.',
      '.0iiiiiihhhhhh0.',
      '..0iiiiihhhhh0..',
      '...0gggggggg0...',
      '....0qqqqqq0....',
      '.....0qqqq0.....',
      '......0qq0......',
      '.......00.......'
    ]
  ]);

  define('haz_bramble', 16, 16, 0, 16, 0, 'bramble', [
    [   // bramble
      '................',
      '................',
      '................',
      '................',
      '.....0.....0....',
      '....0q0...0q0...',
      '..00dqd000dqd0..',
      '.0q0ddd0q0dddq0.',
      '0qddcdddqdddcdq0',
      '.0dcdqddddqddd0.',
      '0ddddqddcdqdddd0',
      '0dcddddqddddcdq0',
      '0qddqdcdddqcddd0',
      '0dcdddddcdddddd0',
      '0ccdcdqccdcqccd0',
      '0ccccccccccccc0.'
    ]
  ]);

  // Tree crown at the top of the playfield, where the trunk of a branch or of the arch ends, so that they
  // read as trees rather than poles. FOREST with PINE shading only, so that it stays low in contrast in the
  // band where word plates go (DESIGN 14.1); the renderer applies the section's remap. The top rows run on
  // under the HUD, so the top edge has no outline.
  define('haz_canopy', 48, 16, 0, 16, 0, 'canopy', [
    [   // canopy
      '0ddddddddddddddddddddcddddddddddddddddddddcdddd0',
      '0dddcddddddddddddddddddddcddddddddddddddddddddc0',
      '0cddddddcddddddddddddddddddddcddddddddddddddddc0',
      '.0ddddddddddcddddddddddddddddddddcdddddddddddd0.',
      '.0cdddddddddddddcddddddddddddddddddddcdddddddc0.',
      '..0dddddddddddddddddcddddddddddddddddddddcddd0..',
      '..0cddddddddddddddddddddcdddddddddddddddddddd0..',
      '...0dddcddddddddddddddddddddcddddddddddddddd0...',
      '...0dddddddcddddddddddddddddddddcddddddddddd0...',
      '...0ddddddddddccdddddddddddddddddcddcddddddd0...',
      '...0ddddddddddcddddcddccccdddddddcddddddcddd0...',
      '...0cddddddddc0ccdddccccccccdddcc0cddddddddc0...',
      '....0ccddddcc0.0cccccc0000cccccc0.0ccddddcc0....',
      '....0cccccccc0.00ccc00....00ccc00.0cccccccc0....',
      '.....00cccc00....000........000....00cccc00.....',
      '.......0000..........................0000.......'
    ]
  ]);

  define('haz_arch', 48, 16, 0, 16, 0, 'arch', [
    [   // arch
      '....0mllklk0........................0mllklk0....',
      '....0mlkllk0........................0mlkllk0....',
      '....0mlkllk0........................0mlkllk0....',
      '...00mmllkk0.....00.....00.....00...0mmllkk0.00.',
      '.00eemmllkee00000ee00000ee00000ee0000meelkk00ee0',
      '0eeddeeeeeddeeeeeddeeeeeddeeeeeddeeeeeedeeeeedd0',
      '0cdddcddddcddddcdddddddddccdccddcddddddddddeddd0',
      '0cddddddddcddddddddddddddcddddddddddeddddcdeddd0',
      '0dddcdqqddddddeqqdddddddqqcddddedqqeddddddqqdde0',
      '0ddcddqcddedddeqddddedddqdcddceddqdddcddddqdddc0',
      '0dddedcdcdddddcdcdddddddcdddddceddddddddddddecd0',
      '0cdcccccdcccccdcccccdcccccdcccccdcccccdcccccdcc0',
      '0ccqqccccqqccccqqccccqqccccqqccccqqccccqqccccqq0',
      '.0cqq000cqq000cqq000cqq000cqq000cqq000cqq000cqq0',
      '..0q0...0q0...0q0...0q0...0q0...0q0...0q0...0q0.',
      '...0.....0.....0.....0.....0.....0.....0.....0..'
    ]
  ]);

  define('sign_jump', 16, 16, 8, 16, 0, 'sign', [
    [   // sign
      '.00000000000000.',
      '0nnnnnnnnnnnnnn0',
      '0nnnnnnppnnnnnn0',
      '0nnnnnppppnnnnn0',
      '0nnnnppppppnnnn0',
      '0nnnppppppppnnn0',
      '0nnnnnppppnnnnn0',
      '0nnnnnppppnnnnn0',
      '0nnnnnppppnnnnn0',
      '0mmmmmmmmmmmmmm0',
      '.000000ml000000.',
      '......0ml0......',
      '......0ml0......',
      '......0ml0......',
      '......0ml0......',
      '......0ml0......'
    ]
  ]);

  define('sign_duck', 16, 16, 8, 16, 0, 'sign', [
    [   // sign
      '.00000000000000.',
      '0nnnnnnnnnnnnnn0',
      '0nnnnn6666nnnnn0',
      '0nnnnn6666nnnnn0',
      '0nnnnn6666nnnnn0',
      '0nnn66666666nnn0',
      '0nnnn666666nnnn0',
      '0nnnnn6666nnnnn0',
      '0nnnnnn66nnnnnn0',
      '0mmmmmmmmmmmmmm0',
      '.000000ml000000.',
      '......0ml0......',
      '......0ml0......',
      '......0ml0......',
      '......0ml0......',
      '......0ml0......'
    ]
  ]);

  define('sign_type', 48, 32, 0, 32, 0, 'sign', [
    [   // sign
      '.0000000000000000000000000000000000000000000000.',
      '0mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm0',
      '0mnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnm0',
      '0mnlnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnlnm0',
      '0mnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnm0',
      '0mnnnnn000000nn00nn00nn00000nnn000000nn00nnnnnm0',
      '0mnnnnn000000nn00nn00nn000000nn000000nn00nnnnnm0',
      '0mnnnnnnn00nnnn00nn00nn00nn00nn00nnnnnn00nnnnnm0',
      '0mnnnnnnn00nnnn00nn00nn00nn00nn0000nnnn00nnnnnm0',
      '0mnnnnnnn00nnnnn0000nnn000000nn0000nnnn00nnnnnm0',
      '0mnnnnnnn00nnnnnn00nnnn00000nnn00nnnnnn00nnnnnm0',
      '0mnnnnnnn00nnnnnn00nnnn00nnnnnn00nnnnnnnnnnnnnm0',
      '0mnnnnnnn00nnnnnn00nnnn00nnnnnn000000nn00nnnnnm0',
      '0mnnnnnnn00nnnnnn00nnnn00nnnnnn000000nn00nnnnnm0',
      '0mnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnm0',
      '0mnlnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnlnm0',
      '0mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm0',
      '0llllllllllllllllllllllllllllllllllllllllllllll0',
      '.00000000mlk000000000000000000000000mlk00000000.',
      '........0mlk0......................0mlk0........',
      '........0mlk0......................0mlk0........',
      '........0mlk0......................0mlk0........',
      '........0mlk0......................0mlk0........',
      '........0mlk0......................0mlk0........',
      '........0mlk0......................0mlk0........',
      '........0mlk0......................0mlk0........',
      '........0mlk0......................0mlk0........',
      '........0mlk0......................0mlk0........',
      '........0mlk0......................0mlk0........',
      '........0mlk0......................0mlk0........',
      '........0mlk0......................0mlk0........',
      '........0mlk0......................0mlk0........'
    ]
  ]);

  define('flag_pole', 16, 32, 0, 32, 4, 'down rise0 rise1 wave0 wave1', [
    [   // down
      '..00............',
      '.0ji0...........',
      '0iiii0..........',
      '.0ii0...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.043000.........',
      '.0430pp0........',
      '.043oppp0.......',
      '.0430ppo0.......',
      '.0430ppp0.......',
      '.0430pop0.......',
      '.0430ppp0.......',
      '.0430ppo0.......',
      '.0430pp0........',
      '.0430po0........',
      '.043000.........',
      '.0430...........'
    ],
    [   // rise0
      '..00............',
      '.0ji0...........',
      '0iiii0..........',
      '.0ii0...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.04300000000000.',
      '.0430pppppppppp0',
      '.043oppppp44ppp0',
      '.0430pppp44pppp0',
      '.0430ppp44pppp0.',
      '.0430ppi4pppp0..',
      '.0430pipppppop0.',
      '.043opppppppoop0',
      '.0430oooooooooo0',
      '.04300000000000.',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........'
    ],
    [   // rise1
      '..00............',
      '.0ji0...........',
      '0iiii0..........',
      '.0ii0...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.04300000000....',
      '.0430ppppppp000.',
      '.043oppppp44ppp0',
      '.0430pppp44pppp0',
      '.0430ppp44ppppp0',
      '.0430ppi4ppppp0.',
      '.0430pippppp00..',
      '.043oppppppoop0.',
      '.0430oooooooooo0',
      '.04300000000000.',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........'
    ],
    [   // wave0
      '..00............',
      '.0ji0...........',
      '0iiii0..........',
      '.0ii00000000000.',
      '.0430pppppppppp0',
      '.043oppppp44ppp0',
      '.0430pppp44pppp0',
      '.0430ppp44pppp0.',
      '.0430ppi4pppp0..',
      '.0430pipppppop0.',
      '.043opppppppoop0',
      '.0430oooooooooo0',
      '.04300000000000.',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........'
    ],
    [   // wave1
      '..00............',
      '.0ji0...........',
      '0iiii0..........',
      '.0ii00000000....',
      '.0430ppppppp000.',
      '.043oppppp44ppp0',
      '.0430pppp44pppp0',
      '.0430ppp44ppppp0',
      '.0430ppi4ppppp0.',
      '.0430pippppp00..',
      '.043oppppppoop0.',
      '.0430oooooooooo0',
      '.04300000000000.',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........',
      '.0430...........'
    ]
  ]);

  // ---------------------------------------------------------------------------------------------
  // Items and crates (anchor bottom centre). At most 4 colours plus INK each.
  // ---------------------------------------------------------------------------------------------

  // Ink drop: ROYAL body, DEEP_BLUE shade, WHITE gleam. d1 and d3 sit 1 px higher (bob); d2 and d3
  // move the gleam (shimmer).
  define('item_ink', 8, 8, 4, 8, 8, 'd0 d1 d2 d3', [
    [   // d0
      '........',
      '...00...',
      '..0660..',
      '.046660.',
      '.046660.',
      '.066650.',
      '.066550.',
      '..0000..'
    ],
    [   // d1
      '...00...',
      '..0660..',
      '.046660.',
      '.046660.',
      '.066650.',
      '.066550.',
      '..0000..',
      '........'
    ],
    [   // d2
      '........',
      '...00...',
      '..0460..',
      '.066660.',
      '.046660.',
      '.066650.',
      '.066550.',
      '..0000..'
    ],
    [   // d3
      '...00...',
      '..0460..',
      '.066660.',
      '.046660.',
      '.066650.',
      '.066550.',
      '..0000..',
      '........'
    ]
  ]);

  // The crate box (lower 16 px of crate_balloon and crate_box): SAND face, CLAY frame, INK outline.
  // The power-up icon is drawn over the middle 12 x 12, so the face is kept plain.
  var CRATE_ROWS = [
    '0000000000000000',
    '0mmmmmmmmmmmmmm0',
    '0mnnnnnnnnnnnnm0',
    '0mnnnnnnnnnnnnm0',
    '0mnnnnnnnnnnnnm0',
    '0mnnnnnnnnnnnnm0',
    '0mnnnnnnnnnnnnm0',
    '0mnnnnnnnnnnnnm0',
    '0mnnnnnnnnnnnnm0',
    '0mnnnnnnnnnnnnm0',
    '0mnnnnnnnnnnnnm0',
    '0mnnnnnnnnnnnnm0',
    '0mnnnnnnnnnnnnm0',
    '0mnnnnnnnnnnnnm0',
    '0mmmmmmmmmmmmmm0',
    '0000000000000000'
  ];

  // Balloon (upper 16 px): RED with a CORAL highlight and a knot; the string sways between frames.
  var BALLOON_0 = [
    '.....000000.....',
    '....0pqqppp0....',
    '...0pqqppppp0...',
    '..0pqqpppppppp0.',
    '..0pqppppppppp0.',
    '..0ppppppppppp0.',
    '..0ppppppppppp0.',
    '..0ppppppppppp0.',
    '...0ppppppppp0..',
    '...0ppppppppp0..',
    '....0ppppppp0...',
    '.....0ppppp0....',
    '......00p00.....',
    '.......0p0......',
    '........0.......',
    '........0.......'
  ];
  var BALLOON_1 = [
    '......000000....',
    '.....0pqqppp0...',
    '....0pqqppppp0..',
    '...0pqqpppppppp0',
    '...0pqppppppppp0',
    '...0ppppppppppp0',
    '...0ppppppppppp0',
    '...0ppppppppppp0',
    '....0ppppppppp0.',
    '....0ppppppppp0.',
    '.....0ppppppp0..',
    '......0ppppp0...',
    '.......00p00....',
    '........0p0.....',
    '........0.......',
    '........0.......'
  ];

  define('crate_balloon', 16, 32, 8, 32, 3, 'c0 c1', [
    BALLOON_0.concat(CRATE_ROWS),
    BALLOON_1.concat(CRATE_ROWS)
  ]);

  define('crate_box', 16, 16, 8, 16, 0, 'box', [ CRATE_ROWS.slice() ]);

  // Power-up icons: 12 x 12 art centred in a 16 x 16 cell, two frames each (a twinkle or a small
  // movement), so that the same art serves over the crate and in the HUD slot.

  // Bubble shield: an AQUA shield with a TEAL shadow half and a WHITE gleam that moves.
  define('pw_shield', 16, 16, 8, 16, 4, 'p0 p1', [
    [   // p0
      '................',
      '................',
      '...0000000000...',
      '..0b4bbbbaaaa0..',
      '..0b4bbbbaaaa0..',
      '..0b4bbbbaaaa0..',
      '..0bbbbbbaaaa0..',
      '..0bbbbbbaaaa0..',
      '...0bbbbbaaa0...',
      '...0bbbbbaaa0...',
      '....0bbbbaa0....',
      '....0bbbbaa0....',
      '.....0bbaa0.....',
      '......0000......',
      '................',
      '................'
    ],
    [   // p1
      '................',
      '................',
      '...0000000000...',
      '..0bbbbbbaaaa0..',
      '..0bbbbbbaaaa0..',
      '..0bb4bbbaaaa0..',
      '..0bb4bbbaaaa0..',
      '..0bbbbbbaaaa0..',
      '...0bbbbbaaa0...',
      '...0bbbbbaaa0...',
      '....0bbbbaa0....',
      '....0bbbbaa0....',
      '.....0bbaa0.....',
      '......0000......',
      '................',
      '................'
    ]
  ]);

  // Hourglass: GOLD plates with a BRONZE edge, WHITE glass, SAND running from the top bulb to the bottom.
  define('pw_hourglass', 16, 16, 8, 16, 4, 'p0 p1', [
    [   // p0
      '................',
      '................',
      '...0000000000...',
      '..0iiiiiiiiig0..',
      '...0444444440...',
      '...04nnnnnn40...',
      '....0nnnnnn0....',
      '.....0nnnn0.....',
      '......0nn0......',
      '.....044n40.....',
      '....04444440....',
      '...04nnnnnn40...',
      '..0iiiiiiiiig0..',
      '...0000000000...',
      '................',
      '................'
    ],
    [   // p1
      '................',
      '................',
      '...0000000000...',
      '..0iiiiiiiiig0..',
      '...0444444440...',
      '...0444nn44440..',
      '....04nnnn40....',
      '.....0nnnn0.....',
      '......0nn0......',
      '.....04nn40.....',
      '....044nn440....',
      '...0nnnnnnnn0...',
      '..0iiiiiiiiig0..',
      '...0000000000...',
      '................',
      '................'
    ]
  ]);

  // Golden quill: a GOLD feather with notched barbs, a CREAM leading edge and a BRONZE shaft ending in a nib
  // at the bottom left. The notches keep it from reading as a leaf.
  define('pw_quill', 16, 16, 8, 16, 4, 'p0 p1', [
    [   // p0
      '................',
      '................',
      '...........000..',
      '.........00ji0..',
      '........0jiig0..',
      '.......0jiigi0..',
      '......0jiigi00..',
      '.....0jiigii0...',
      '....0jiigi00....',
      '....0iigii0.....',
      '...0iigi00......',
      '...0igg0........',
      '..0g000.........',
      '..00............',
      '................',
      '................'
    ],
    [   // p1
      '................',
      '................',
      '...........000..',
      '.........004i0..',
      '........0j4ig0..',
      '.......0jjigi0..',
      '......0jjigi00..',
      '.....0jiigii0...',
      '....0jiigi00....',
      '....0iigii0.....',
      '...0iigi00......',
      '...0igg0........',
      '..0g000.........',
      '..00............',
      '................',
      '................'
    ]
  ]);

  // Ink blast: ROYAL spikes round a DEEP_BLUE ring and a WHITE core; p1 tips the spikes with AQUA. ROYAL
  // rather than DEEP_BLUE on the outside, so the burst still shows on the SHADOW well of the HUD slot.
  define('pw_blast', 16, 16, 8, 16, 4, 'p0 p1', [
    [   // p0
      '................',
      '................',
      '.......00.......',
      '....0.0660.0....',
      '...0600660060...',
      '....06066060....',
      '...0006556000...',
      '..066654456660..',
      '..066654456660..',
      '...0006556000...',
      '....06066060....',
      '...0600660060...',
      '....0.0660.0....',
      '.......00.......',
      '................',
      '................'
    ],
    [   // p1
      '................',
      '................',
      '.......00.......',
      '....0.0bb0.0....',
      '...0b006600b0...',
      '....06066060....',
      '...0006556000...',
      '..0b66544566b0..',
      '..0b66544566b0..',
      '...0006556000...',
      '....06066060....',
      '...0b006600b0...',
      '....0.0bb0.0....',
      '.......00.......',
      '................',
      '................'
    ]
  ]);

  // Red cap: Pip's cap seen from the side, a RED dome with a CORAL highlight, a WHITE button on top, a
  // MAROON band and a RED peak sticking out to the left. p1 moves the highlight.
  define('pw_cap', 16, 16, 8, 16, 4, 'p0 p1', [
    [   // p0
      '................',
      '................',
      '.........00.....',
      '.......004400...',
      '......0pqqppp0..',
      '.....0pqqpppp0..',
      '.....0pqppppp0..',
      '.....0ppppppp0..',
      '.....0ppppppp0..',
      '..0000ooooooo0..',
      '..0ppppppoooo0..',
      '..000000000000..',
      '................',
      '................',
      '................',
      '................'
    ],
    [   // p1
      '................',
      '................',
      '.........00.....',
      '.......004400...',
      '......0ppqqpp0..',
      '.....0ppqqppp0..',
      '.....0pppqppp0..',
      '.....0ppppppp0..',
      '.....0ppppppp0..',
      '..0000ooooooo0..',
      '..0ppppppoooo0..',
      '..000000000000..',
      '................',
      '................',
      '................',
      '................'
    ]
  ]);
  // ---------------------------------------------------------------------------------------------
  // Effects (anchor centre unless the registry says otherwise). At most 4 colours plus INK each.
  // ---------------------------------------------------------------------------------------------

  define('fx_shield', 24, 32, 12, 30, 8, 's0 s1 s2 s3', [
    [   // s0
      '.........000000.........',
      '.......0044444b00.......',
      '......0bbaaaaaabb0......',
      '.....0baa......aab0.....',
      '....0ba..........ab0....',
      '...0ba............ab0...',
      '..0ba..............ab0..',
      '..0ba..............ab0..',
      '.0ba................ab0.',
      '.0ba................ab0.',
      '.0ba................ab0.',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '.0ba................ab0.',
      '.0ba................ab0.',
      '.0ba................ab0.',
      '..0ba..............ab0..',
      '..0ba..............ab0..',
      '...0ba............ab0...',
      '....0ba..........ab0....',
      '.....0baa......aab0.....',
      '......0bbaaaaaabb0......',
      '.......00bb4bbb00.......',
      '.........000000.........'
    ],
    [   // s1
      '.........000000.........',
      '.......00bbbbbb00.......',
      '......0bbaaaaaabb0......',
      '.....0baa......aa40.....',
      '....0ba..........a40....',
      '...0ba............a40...',
      '..0ba..............ab0..',
      '..0ba..............a40..',
      '.0ba................ab0.',
      '.0ba................ab0.',
      '.0ba................ab0.',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '.0ba................ab0.',
      '.0ba................ab0.',
      '.04a................ab0.',
      '..04a..............ab0..',
      '..04a..............ab0..',
      '...04a............ab0...',
      '....04a..........ab0....',
      '.....0baa......aab0.....',
      '......0bbaaaaaabb0......',
      '.......00bbbbbb00.......',
      '.........000000.........'
    ],
    [   // s2
      '.........000000.........',
      '.......00bbbbbb00.......',
      '......0bbaaaaaabb0......',
      '.....0baa......aab0.....',
      '....0ba..........ab0....',
      '...0ba............ab0...',
      '..0ba..............ab0..',
      '..0ba..............ab0..',
      '.0ba................ab0.',
      '.0ba................ab0.',
      '.0ba................ab0.',
      '0ba..................ab0',
      '04a..................ab0',
      '04a..................ab0',
      '04a..................ab0',
      '04a..................a40',
      '04a..................ab0',
      '04a..................ab0',
      '04a..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '.0ba................ab0.',
      '.0ba................ab0.',
      '.0ba................ab0.',
      '..0ba..............ab0..',
      '..0ba..............ab0..',
      '...0ba............ab0...',
      '....0ba..........ab0....',
      '.....0baa......aab0.....',
      '......0bbaaaaaabb0......',
      '.......00bbbbbb00.......',
      '.........000000.........'
    ],
    [   // s3
      '.........000000.........',
      '.......00bbbbbb00.......',
      '......0bbaaaaaabb0......',
      '.....04aa......aab0.....',
      '....04a..........ab0....',
      '...04a............ab0...',
      '..04a..............ab0..',
      '..04a..............ab0..',
      '.0ba................ab0.',
      '.0ba................ab0.',
      '.0ba................ab0.',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '0ba..................ab0',
      '.0ba................ab0.',
      '.0ba................ab0.',
      '.0ba................ab0.',
      '..0ba..............ab0..',
      '..0ba..............ab0..',
      '...0ba............ab0...',
      '....0ba..........ab0....',
      '.....0baa......aab0.....',
      '......0bbaaaaaabb0......',
      '.......00bbbbbb00.......',
      '.........000000.........'
    ]
  ]);

  define('fx_bubble', 24, 32, 12, 30, 4, 'b0 b1', [
    [   // b0
      '.........000000.........',
      '.......0088888800.......',
      '......088777777880......',
      '.....0877......7780.....',
      '....047..........780....',
      '...047............780...',
      '..047..............780..',
      '..087..............780..',
      '.087................780.',
      '.087................780.',
      '.087................780.',
      '087..................780',
      '087..................780',
      '087..................780',
      '087..................780',
      '087..................780',
      '087..................780',
      '087..................780',
      '087..................780',
      '087..................780',
      '087..................780',
      '.087................780.',
      '.087................780.',
      '.087................780.',
      '..087..............780..',
      '..087..............780..',
      '...087............780...',
      '....087..........780....',
      '.....0877......7780.....',
      '......088777777880......',
      '.......0088888800.......',
      '.........000000.........'
    ],
    [   // b1
      '.........000000.........',
      '.......0088888800.......',
      '......084777777880......',
      '.....0477......7780.....',
      '....047..........780....',
      '...087............780...',
      '..087..............780..',
      '..087..............780..',
      '.087................780.',
      '.087................780.',
      '.087................780.',
      '087..................780',
      '087..................780',
      '087..................780',
      '087..................780',
      '087..................780',
      '087..................780',
      '087..................780',
      '087..................780',
      '087..................780',
      '087..................780',
      '.087................780.',
      '.087................780.',
      '.087................780.',
      '..087..............780..',
      '..087..............780..',
      '...087............780...',
      '....087..........780....',
      '.....0877......7780.....',
      '......088777777880......',
      '.......0088888800.......',
      '.........000000.........'
    ]
  ]);

  // Lock bracket corner: a GOLD L with an INK outline. tl1 sits 1 px further in, so the two frames pulse.
  // bl0 and bl1 are tl0 and tl1 mirrored top to bottom; the right-hand corners are drawn with flipX.
  define('fx_bracket', 8, 8, 0, 0, 4, 'tl0 tl1 bl0 bl1', [
    [   // tl0
      '0000000.',
      '0iiiiii0',
      '0ii00000',
      '0ii0....',
      '0ii0....',
      '0ii0....',
      '0000....',
      '........'
    ],
    [   // tl1
      '........',
      '.000000.',
      '.0iiiii0',
      '.0ii000.',
      '.0ii0...',
      '.0ii0...',
      '.0000...',
      '........'
    ],
    [   // bl0
      '........',
      '0000....',
      '0ii0....',
      '0ii0....',
      '0ii0....',
      '0ii00000',
      '0iiiiii0',
      '0000000.'
    ],
    [   // bl1
      '........',
      '.0000...',
      '.0ii0...',
      '.0ii0...',
      '.0ii000.',
      '.0iiiii0',
      '.000000.',
      '........'
    ]
  ]);

  // Ground marker under a dive or a high rock: CORAL dashes, then GOLD dashes in the other places, so it blinks.
  define('fx_marker', 16, 4, 8, 4, 6, 'm0 m1', [
    [   // m0
      '0000000000000000',
      '0qq00qq00qq00qq0',
      '0qq00qq00qq00qq0',
      '0000000000000000'
    ],
    [   // m1
      '0000000000000000',
      '000ii00ii00ii000',
      '000ii00ii00ii000',
      '0000000000000000'
    ]
  ]);

  // Boulder chunks: STONE with a SILVER top and SHADOW underside.
  define('fx_chunk', 8, 8, 4, 4, 0, 'c0 c1', [
    [   // c0
      '..0000..',
      '.033320.',
      '03322220',
      '03222210',
      '.0221100',
      '..0000..',
      '........',
      '........'
    ],
    [   // c1
      '...00...',
      '..0330..',
      '.032220.',
      '.032210.',
      '..02210.',
      '...000..',
      '........',
      '........'
    ]
  ]);

  // Crate splinters: SAND and CLAY wood with a BARK edge.
  define('fx_splinter', 8, 8, 4, 4, 0, 'c0 c1', [
    [   // c0
      '.....00.',
      '....0nm0',
      '...0nmk0',
      '..0nmk0.',
      '.0nmk0..',
      '.0mk0...',
      '.000....',
      '........'
    ],
    [   // c1
      '........',
      '.000000.',
      '0nnnnmm0',
      '0nmmmmk0',
      '0mkkkkk0',
      '.000000.',
      '........',
      '........'
    ]
  ]);

  // Crow feather: SHADOW with a STONE edge, falling and turning.
  define('fx_feather', 8, 8, 4, 4, 6, 'f0 f1', [
    [   // f0
      '.....00.',
      '....0120',
      '...0120.',
      '..0120..',
      '.0120...',
      '.0120...',
      '.0000...',
      '........'
    ],
    [   // f1
      '........',
      '..00000.',
      '.0122210',
      '0122210.',
      '.02210..',
      '..000...',
      '........',
      '........'
    ]
  ]);

  // Star: GOLD with a WHITE centre; s1 is smaller, so the two frames twinkle.
  define('fx_star', 8, 8, 4, 4, 8, 's0 s1', [
    [   // s0
      '...00...',
      '..0ii0..',
      '.00ii00.',
      '0ii44ii0',
      '0ii44ii0',
      '.00ii00.',
      '..0ii0..',
      '...00...'
    ],
    [   // s1
      '........',
      '...00...',
      '..0ii0..',
      '.0i44i0.',
      '.0i44i0.',
      '..0ii0..',
      '...00...',
      '........'
    ]
  ]);

  // Flower from a cleared Buzzle: PINK petals, GOLD centre, GRASS stem. f1 turns the outer petals CORAL.
  define('fx_flower', 8, 8, 4, 4, 4, 'f0 f1', [
    [   // f0
      '..0000..',
      '.0rrrr0.',
      '0rriirr0',
      '0rriirr0',
      '.0rrrr0.',
      '..00e0..',
      '...0e0..',
      '...000..'
    ],
    [   // f1
      '..0000..',
      '.0qrrq0.',
      '0rriirr0',
      '0rriirr0',
      '.0qrrq0.',
      '..00e0..',
      '...0e0..',
      '...000..'
    ]
  ]);

  // Lily pad from a cleared Hoppet: GRASS with a LIME edge and FOREST underside, and the notch of a lily pad.
  define('fx_lilypad', 16, 8, 8, 4, 0, 'pad', [
    [   // pad
      '.....000.000....',
      '...00fee0eee00..',
      '..0ffeeeeeeee0..',
      '.0feeeeeeeeeee0.',
      '.0eeeeeeeeeedd0.',
      '..0eeeddddddd0..',
      '...00ddddddd00..',
      '.....0000000....'
    ]
  ]);

  // Daisy from a cleared Digby: sprout, bud, flower. Anchor at the bottom so it grows out of the ground.
  define('fx_daisy', 8, 8, 4, 8, 0, 'd0 d1 d2', [
    [   // d0
      '........',
      '........',
      '........',
      '........',
      '...00...',
      '..0ee0..',
      '...0e0..',
      '...000..'
    ],
    [   // d1
      '........',
      '...00...',
      '..0ff0..',
      '..0ff0..',
      '...0e0..',
      '..0ee0..',
      '...0e0..',
      '...000..'
    ],
    [   // d2
      '..0000..',
      '.044440.',
      '044ii440',
      '044ii440',
      '.044440.',
      '..00e0..',
      '...0e0..',
      '...000..'
    ]
  ]);

  // Digby's helmet, popping off: GOLD dome, BRONZE brim, CREAM lamp at the front (left).
  define('fx_helmet', 8, 8, 4, 4, 0, 'helmet', [
    [   // helmet
      '...0000.',
      '..0iiii0',
      '.0iiiii0',
      '0jiiiig0',
      '0j0iigg0',
      '000gggg0',
      '..00000.',
      '........'
    ]
  ]);

  // Dust puff: SAND and CLAY, growing and breaking up. Anchor at the bottom.
  define('fx_dust', 8, 8, 4, 8, 12, 'd0 d1 d2', [
    [   // d0
      '........',
      '........',
      '........',
      '........',
      '...00...',
      '..0nn0..',
      '.0nnmn0.',
      '.000000.'
    ],
    [   // d1
      '........',
      '........',
      '..000...',
      '.0nnn00.',
      '0nnnnnn0',
      '0nmnnmn0',
      '.0mmmm0.',
      '..0000..'
    ],
    [   // d2
      '.00..00.',
      '0nn00nn0',
      '0nn0nnn0',
      '.0nnnn0.',
      '0nn0nnm0',
      '0mn00mm0',
      '.00..00.',
      '........'
    ]
  ]);

  // Poof: WHITE and SILVER puff for the balloon pop, growing then breaking into a ring.
  define('fx_poof', 16, 16, 8, 8, 12, 'p0 p1 p2', [
    [   // p0
      '................',
      '................',
      '................',
      '................',
      '......0000......',
      '.....044440.....',
      '....04444440....',
      '....04444440....',
      '....04444330....',
      '....04443330....',
      '.....033330.....',
      '......0000......',
      '................',
      '................',
      '................',
      '................'
    ],
    [   // p1
      '................',
      '................',
      '.....0000000....',
      '....044444440...',
      '...04444444440..',
      '..0444444444330.',
      '..0444444444330.',
      '..0444444443330.',
      '..0444444333330.',
      '...0444333330...',
      '....03333330....',
      '.....0000000....',
      '................',
      '................',
      '................',
      '................'
    ],
    [   // p2
      '....00....00....',
      '...0440..0440...',
      '...0430..0340...',
      '....00....00....',
      '.00..........00.',
      '0440........0440',
      '0430........0340',
      '.00..........00.',
      '.00..........00.',
      '0440........0440',
      '0430........0340',
      '.00..........00.',
      '....00....00....',
      '...0440..0440...',
      '...0430..0340...',
      '....00....00....'
    ]
  ]);

  // ===== LEVEL 2: tiles, hazard skins and small pieces (LEVEL2 3.4, 3.5) =====

  // Level 2 tiles (16x16, anchor top left). No outline. The renderer applies the section's remap to them: none
  // in Lantern Hollow, brass in the Gear Hall and the arena, crystal in Crystal Deep (LEVEL2 3.1). The rock is
  // STONE and SHADOW with TEAL moss, which brass turns to BRONZE plate with GOLD rivets.

  // Cave floor: a STONE slab in two courses of cracked blocks, TEAL moss on top and in the joints, over
  // SHADOW rock with PLUM pits. Under the brass remap the slab is brass plate and the moss its rivets.
  define('tile_cave_top', 16, 16, 0, 0, 0, 'g0 g1', [
    [   // g0
      '2aaa22222222aa22',
      '22a2222222222a22',
      '2222222222222222',
      '2222221222222222',
      '2222212222222222',
      '2222212222111111',
      '1111111111222222',
      '2122222222222222',
      '2122222a22222221',
      '1222222222222212',
      '1112222111112211',
      '1111111111111111',
      '1111111111211111',
      '11111s1111111111',
      '1111111111111s11',
      '1211111111111111'
    ],
    [   // g1
      '2222aaa22222a222',
      '22222a2222222222',
      '2222222222222222',
      '2222122222222222',
      '2221222222221222',
      '1112222222212222',
      '1222111122111111',
      '1222222222222122',
      '2222222a22222122',
      '2222222222221222',
      '1122221111112221',
      '1111111111111111',
      '1111211111111111',
      '1111111111s11111',
      '11s1111111111111',
      '1111111112111111'
    ]
  ]);

  // Cave rock below the floor: SHADOW with a few STONE lumps and PLUM pits.
  define('tile_cave_fill', 16, 16, 0, 0, 0, 's0 s1', [
    [   // s0
      '1111111111111111',
      '1111111111111111',
      '1111221111111111',
      '111222211111s111',
      '1111ss1111111111',
      '1111111111111111',
      '1111111111111111',
      '1s11111111111111',
      '1111111111111111',
      '1111111111122111',
      '11111111111ss111',
      '1111111111111111',
      '11s1111111111111',
      '1111111111111111',
      '1111111s11111111',
      '1111111111111111'
    ],
    [   // s1
      '1111111111111111',
      '1111111111111s11',
      '1111111111111111',
      '11s1111111111111',
      '1111111111111111',
      '1111111122111111',
      '1111111222211111',
      '11111111ss111111',
      '1111111111111111',
      '1111111111111111',
      '1221111111111s11',
      '1ss1111111111111',
      '1111111111111111',
      '1111111111111111',
      '1111111111111111',
      '1s11111111111111'
    ]
  ]);

  // Rock lips beside a pool or a chasm: the slab ends in a STONE face on the gap's side, with moss over the
  // corner. The side away from the gap is tile_cave_top's.
  define('tile_cave_edge_l', 16, 16, 0, 0, 0, 'edge', [
    [   // edge
      '2aaa22222222aaa.',
      '22a2222222222aaa',
      '22222222222222aa',
      '222222122222222a',
      '2222212222222222',
      '2222212222222222',
      '1111111111222222',
      '2122222222122222',
      '2122222a22122222',
      '1222222222122222',
      '1112222111112222',
      '1111111111111222',
      '1111111111211122',
      '11111s1111111222',
      '1111111111111122',
      '1211111111111222'
    ]
  ]);

  // tile_cave_edge_l mirrored.
  define('tile_cave_edge_r', 16, 16, 0, 0, 0, 'edge', [
    [   // edge
      '.aaa22222222aaa2',
      'aaa2222222222a22',
      'aa22222222222222',
      'a222222221222222',
      '2222222222122222',
      '2222222222122222',
      '2222221111111111',
      '2222212222222212',
      '22222122a2222212',
      '2222212222222221',
      '2222111112222111',
      '2221111111111111',
      '2211121111111111',
      '2221111111s11111',
      '2211111111111111',
      '2221111111111121'
    ]
  ]);

  // Below the lips: the STONE face runs on down, with DEEP_TEAL where the pool's light reaches it.
  define('tile_cave_wall_l', 16, 16, 0, 0, 0, 'wall', [
    [   // wall
      '1111111111111122',
      '1111111111111222',
      '1111221111111122',
      '111222211111s129',
      '1111ss1111111229',
      '1111111111111129',
      '1111111111111229',
      '1s11111111111129',
      '1111111111111299',
      '1111111111122129',
      '11111111111ss229',
      '1111111111111299',
      '11s1111111111129',
      '1111111111111299',
      '1111111s11111199',
      '1111111111111999'
    ]
  ]);

  // tile_cave_wall_l mirrored.
  define('tile_cave_wall_r', 16, 16, 0, 0, 0, 'wall', [
    [   // wall
      '2211111111111111',
      '2221111111111111',
      '2211111111221111',
      '921s111112222111',
      '9221111111ss1111',
      '9211111111111111',
      '9221111111111111',
      '92111111111111s1',
      '9921111111111111',
      '9212211111111111',
      '922ss11111111111',
      '9921111111111111',
      '9211111111111s11',
      '9921111111111111',
      '99111111s1111111',
      '9991111111111111'
    ]
  ]);

  // A glowing pool: an AQUA surface over DEEP_TEAL, with glints that rise between the two frames. No STONE
  // or TEAL, so the brass remap leaves it as it is.
  define('tile_pool', 16, 16, 0, 0, 3, 'w0 w1', [
    [   // w0
      'bbbbbb9bbbbbbbbb',
      '9bbbb999bbbbb99b',
      '99bb99999bbb9999',
      '9999999999999999',
      '999b999999999999',
      '9999999999b99999',
      '9999999999999999',
      '99999b9999999999',
      '9999999999999b99',
      '9199999999999999',
      '9999991999999919',
      '9919999999199999',
      '1999199919999199',
      '9191919191919191',
      '1919191919191919',
      '1111111111111111'
    ],
    [   // w1
      'bb9bbbbbbbbbb9bb',
      'b999bbbbb99bb999',
      '9999bbb99999b999',
      '999b999999999999',
      '9999999999b99999',
      '9999999999999999',
      '99999b9999999999',
      '9999999999999b99',
      '9999999999999999',
      '9199999b99999999',
      '9999991999999919',
      '9919999999199999',
      '1999199919999199',
      '9191919191919191',
      '1919191919191919',
      '1111111111111111'
    ]
  ]);

  // Girder over a bridged gap: an iron beam four rows deep, as tile_plank's deck is, with a GOLD deck line on
  // top, on a truss of struts that is open between them, and a GOLD rivet where the struts meet the beam and
  // the lower chord. The iron is STONE: the brass remap makes it a brass girder, and under the crystal remap
  // it stays as light as the floor beside it while its deck line and rivets turn AQUA.
  define('tile_girder', 16, 16, 0, 0, 0, 'plank', [
    [   // plank
      'iiiiiiiiiiiiiiii',
      '2222222222222222',
      'i2222222i2222222',
      '2222222222222222',
      '21....1221....12',
      '.21..12..21..12.',
      '..2112....2112..',
      '2222i2222222i222',
      '1111111111111111',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................'
    ]
  ]);

  // Arena floor: dark plates with the brass inlaid, so that the clock face is the light of the hall and what
  // stands on the floor shows against it. Each plate is SHADOW under a lit BRONZE edge with a GOLD rivet at
  // either end. a0 has a BRONZE cog set into it, a ring of eight teeth round a GOLD pin; a1 has a small
  // BRONZE stud, so a cog comes every 32 px. The top four rows are a SHADOW bed for tile_rail, which is drawn
  // over them.
  define('tile_clockfloor', 16, 16, 0, 0, 0, 'a0 a1', [
    [   // a0
      'iiiiiiiiiiiiiiii',
      'gggggggggggggggg',
      '1111111111111111',
      '1111111111111111',
      'iggggggggggggggi',
      '1111111111111111',
      '1111111g11111111',
      '1111g1ggg1g11111',
      '11111ggggg111111',
      '1111gg111gg11111',
      '111ggg1i1ggg1111',
      '1111gg111gg11111',
      '11111ggggg111111',
      '1111g1ggg1g11111',
      '1111111g11111111',
      '1111111111111111'
    ],
    [   // a1
      'iiiiiiiiiiiiiiii',
      'gggggggggggggggg',
      '1111111111111111',
      '1111111111111111',
      'iggggggggggggggi',
      '1111111111111111',
      '1111111111111111',
      '1111111111111111',
      '1111111111111111',
      '1111111g11111111',
      '111111gig1111111',
      '1111111g11111111',
      '1111111111111111',
      '1111111111111111',
      '1111111111111111',
      '1111111111111111'
    ]
  ]);

  // Level 2 hazard skins (anchor bottom left), each with the size and frame name of the Level 1 hazard it takes
  // the place of. They are drawn without the section's remap, except haz_ceiling, and each shows a colour that
  // is not the colour of a band behind it: AQUA, BRONZE, GOLD and CREAM, STONE (LEVEL2 3.1).

  // Crystal spikes: three AQUA shards with a STONE shaded side, growing straight from the floor, each cut to a
  // slanted point that is CORAL, the hazard accent, three rows deep on each shard so that all three tips show
  // at 1x. The shards fill the lower 8 px, as the bramble's thorns do; the tall one reaches above it.
  define('haz_crystal', 16, 16, 0, 16, 0, 'bramble', [
    [   // bramble
      '................',
      '................',
      '................',
      '................',
      '......0.........',
      '.....0q0........',
      '.....0qq0.....0.',
      '...0.0qqq0...0q0',
      '..0q00qbbb000qq0',
      '.0qq00bbbb200qq0',
      '0qqq0bbbbb20qq20',
      '0bbb0bbbbb20bb20',
      '0bbb0bbbbb20bb20',
      '0bb20bbbbb20b20.',
      '.0b20bbbbb20b20.',
      '.0b20bbbbb20b20.'
    ]
  ]);

  // Low pipe: the riser ends in a wide BRONZE outlet that hangs mouth down, GOLD on its lit side and SHADOW on
  // the other, with a rim across the full width. Its mouth glows CORAL, the hazard accent, and drips in two
  // places. INK outline except at the top, where haz_pipe_riser continues upwards.
  define('haz_pipe', 16, 16, 0, 16, 0, 'branch', [
    [   // branch
      '....0igggg10....',
      '....0igggg10....',
      '.00000000000000.',
      '.0iiiiiiiiiigg0.',
      '.0iigggggggg110.',
      '.0iigggggggg110.',
      '.0iigggggggg110.',
      '0000000000000000',
      '0iiiiiiiiiiiigg0',
      '0iigggggggggg110',
      '0000000000000000',
      '.0qqqqqqqqqqqq0.',
      '..00qq00000q00..',
      '...0qq0...0q0...',
      '...0qq0....0....',
      '....00..........'
    ]
  ]);

  // Pipe riser, tiled up from the low pipe to the roof: BRONZE with a GOLD highlight and a SHADOW side, and a
  // bolted flange once a tile.
  define('haz_pipe_riser', 16, 16, 0, 16, 0, 'trunk', [
    [   // trunk
      '....0igggg10....',
      '....0igggg10....',
      '....0igggg10....',
      '....0igggg10....',
      '....0igggg10....',
      '....0igggg10....',
      '...0000000000...',
      '...0iggggggg0...',
      '...0gggggg110...',
      '...0000000000...',
      '....0igggg10....',
      '....0igggg10....',
      '....0igggg10....',
      '....0igggg10....',
      '....0igggg10....',
      '....0igggg10....'
    ]
  ]);

  // Hanging lantern: a GOLD frame with a BRONZE shaded side, CREAM glass and a CORAL flame with a GOLD
  // heart, on the last link of haz_chain. The renderer swings it.
  define('haz_lantern', 16, 24, 0, 24, 0, 'hive', [
    [   // hive
      '......0220......',
      '......0110......',
      '.....000000.....',
      '....0iiiiig0....',
      '..00iiiiiiig00..',
      '.0iiiiiiiiiigg0.',
      '0gggggggggggggg0',
      '.0ijjjjjjjjjjg0.',
      '.0ijjjjjjjjjjg0.',
      '.0ijjjjqjjjjjg0.',
      '.0ijjjjqqjjjjg0.',
      '.0ijjjqqqqjjjg0.',
      '.0ijjjqiiqjjjg0.',
      '.0ijjqqiiqqjjg0.',
      '.0ijjjqiiqjjjg0.',
      '.0ijjjjqqjjjjg0.',
      '.0ijjjjggjjjjg0.',
      '.0ijjjjjjjjjjg0.',
      '0gggggggggggggg0',
      '.0iiiiiiiiiigg0.',
      '..0gggggggggg0..',
      '...0000gg0000...',
      '......0qq0......',
      '.......00.......'
    ]
  ]);

  // Chain, tiled up from the lantern: STONE links, one seen flat and one on edge, twice a tile.
  define('haz_chain', 16, 16, 0, 16, 0, 'rope', [
    [   // rope
      '......0000......',
      '.....022220.....',
      '.....020020.....',
      '.....020020.....',
      '.....022220.....',
      '......0220......',
      '......0110......',
      '......0220......',
      '......0000......',
      '.....022220.....',
      '.....020020.....',
      '.....020020.....',
      '.....022220.....',
      '......0220......',
      '......0110......',
      '......0220......'
    ]
  ]);

  // Low tunnel: a shelf of rough STONE between the feet of two rock columns, boulders wedged together with
  // SHADOW cracks between them and an uneven top, with a SHADOW underside and a row of CORAL-tipped
  // stalactites, the hazard accent. INK outline except where haz_column continues upwards.
  define('haz_tunnel', 48, 16, 0, 16, 0, 'arch', [
    [   // arch
      '..022222221110....................022222221110..',
      '..022222221110.000000.......0000..022222221110..',
      '..02222222111002222220...000222200022222221110..',
      '.0222222221111122222220002222222222222222211120.',
      '022222222221112222222221222222222221222222211220',
      '022211122222122222222222122222222212222222222220',
      '021122222221222211122222122211122122222211122220',
      '022222222212222222212222122222212122222122222220',
      '022212222122222122222222212222221222222221122220',
      '022222221222222222222222221222212222222222222220',
      '011122211111222111112221111122211111222111112220',
      '012111112111112111112111112111112111112111112110',
      '011221111221111221111221111221111221111221111220',
      '.01qq0001qq0001qq0001qq0001qq0001qq0001qq0001qq0',
      '..0q0...0q0...0q0...0q0...0q0...0q0...0q0...0q0.',
      '...0.....0.....0.....0.....0.....0.....0.....0..'
    ]
  ]);

  // Rock rim at the top of the playfield, where a riser or the tunnel's columns meet the roof. SHADOW with
  // PLUM flecks only, so that it stays a hint in the band where word plates go (LEVEL2 3.1); the renderer
  // applies the section's remap. Its lower edge hangs in three lumps, one over each of the tunnel's columns
  // and one over a riser, and it keeps its full width down to them, so that a column goes up into the rock and
  // shows no edge beside it. The top rows run on under the HUD, so the top edge has no outline.
  define('haz_ceiling', 48, 16, 0, 16, 0, 'canopy', [
    [   // canopy
      '011111111111111111111111111111111111111111111110',
      '011111111111111111s111111111111111111111s1111110',
      '011111s111111111111s111111111111111111111s111110',
      '0111111ss111111111111111111111s11111111111111110',
      '011111111111111111111s1111111111ss11111111111110',
      '0111111111111111ss111111111111111111111s11111110',
      '01111s1111111111111111111s11111111111111s1111110',
      '011111111111s111111111111ss1111111111111111s1110',
      '0111111111111s1111111111111111111111s11111111110',
      '011111111111111111111111111111111s111s1111111110',
      '0111111111s111110001111s1111s0001111111111111110',
      '0111111111111110...0111111110...0111111s11111110',
      '.00111111111100.....00111110.....00111111111100.',
      '...0000111000.........00100........0000011000...',
      '.......000..............0...............00......',
      '................................................'
    ]
  ]);

  // Rock column over each end of the tunnel, tiled up to the roof: rough STONE 12 px wide, half as wide again
  // as the pipe's riser, with a SHADOW side, an outline that bulges and is notched as rock is, and two cracks
  // a tile.
  define('haz_column', 16, 16, 0, 16, 0, 'trunk', [
    [   // trunk
      '..022222221110..',
      '..022222221110..',
      '.0222222222110..',
      '.0222122221110..',
      '.02221222211110.',
      '..0222122211110.',
      '..0222222211110.',
      '..022222221110..',
      '...02222221110..',
      '...01222221110..',
      '..021122222110..',
      '..02222222110...',
      '..02222222110...',
      '..022222222110..',
      '..022222221110..',
      '..022222221110..'
    ]
  ]);

  // Level 2 power-up icon, effects and decor.

  // Pocket Watch: a GOLD case with a BRONZE shaded side and a crown on top, a WHITE face with a CREAM rim
  // and INK hands. The long hand ticks on between the two frames.
  define('pw_watch', 16, 16, 8, 16, 4, 'p0 p1', [
    [   // p0
      '................',
      '................',
      '......0000......',
      '.....0iiii0.....',
      '....00000000....',
      '...0iiiiiiig0...',
      '..0iij4444jig0..',
      '..0ij440444jg0..',
      '..0ij440444jg0..',
      '..0ij440004jg0..',
      '..0ij444444jg0..',
      '..0iij4444jgg0..',
      '...0iggggggg0...',
      '....00000000....',
      '................',
      '................'
    ],
    [   // p1
      '................',
      '................',
      '......0000......',
      '.....0iiii0.....',
      '....00000000....',
      '...0iiiiiiig0...',
      '..0iij4444jig0..',
      '..0ij444404jg0..',
      '..0ij444044jg0..',
      '..0ij440004jg0..',
      '..0ij444444jg0..',
      '..0iij4444jgg0..',
      '...0iggggggg0...',
      '....00000000....',
      '................',
      '................'
    ]
  ]);

  // Clockwork bits: BRONZE with GOLD on the lit side and an INK hole. c0 is a cog of eight teeth; c1 is a small
  // collar with no teeth.
  define('fx_cogbit', 8, 8, 4, 4, 0, 'c0 c1', [
    [   // c0
      '.0.00.0.',
      '0i0ii0i0',
      '.0iggi0.',
      '0ig00gi0',
      '0ig00gg0',
      '.0gggg0.',
      '0g0gg0g0',
      '.0.00.0.'
    ],
    [   // c1
      '........',
      '...00...',
      '..0ii0..',
      '.0i00g0.',
      '.0i00g0.',
      '..0gg0..',
      '...00...',
      '........'
    ]
  ]);

  // Snowflake: a WHITE star of six arms with HAZE tips, 5 px across. f1 is f0 turned a quarter, so that the
  // flake turns as it falls.
  define('fx_flake', 8, 8, 4, 4, 6, 'f0 f1', [
    [   // f0
      '...0....',
      '.00800..',
      '0804080.',
      '.04440..',
      '0804080.',
      '.00800..',
      '...0....',
      '........'
    ],
    [   // f1
      '..0.0...',
      '.08080..',
      '.00400..',
      '0844480.',
      '.00400..',
      '.08080..',
      '..0.0...',
      '........'
    ]
  ]);

  // The bottom of the Baron's hole: the end of the rope Pip came down, hanging clear of a heap of fallen
  // earth. The rope is SAND with a SOIL twist, as haz_rope is twisted, and BARK in its top four rows, where it
  // runs off the frame into the dark; it ends in a knot and a frayed tip 3 px above the heap. Three crumbs of
  // earth are still falling beside it, the only pixels with no outline. The heap is SOIL with SAND clods and a
  // BARK side.
  define('decor_hole', 32, 32, 0, 32, 0, 'hole', [
    [   // hole
      '..............0kk0..............',
      '..............0kk0..............',
      '..............0lk0..............',
      '..............0kl0..............',
      '..............0nl0..............',
      '..............0nn0..............',
      '..............0ln0..............',
      '..............0kl0..............',
      '..............0nl0..............',
      '..............0nn0..............',
      '..............0ln0..............',
      '..............0kl0..............',
      '..........n...0nl0..............',
      '..............0nn0..............',
      '..............0ln0..............',
      '.............0nnll0.............',
      '.............0nllk0.............',
      '.............0lnlk0....l........',
      '.............00nl00.............',
      '..............0nl0..............',
      '..............0n0...............',
      '...............0................',
      '...................n............',
      '................................',
      '................................',
      '..........0000000000000.........',
      '.......000llnnllllllkk000.......',
      '.....00llnnllllllllklllkk00.....',
      '...00llnnlllllklllllllllkkk00...',
      '..0llnlllllllllllkllllllkkkkk0..',
      '.0lllllklllllllllllllllkllkkkk0.',
      '0lllllllllllklllllllllllllkkkkk0'
    ]
  ]);

  // ---------------------------------------------------------------------------------------------
  // Icons and interface pieces (anchor top left). Drawn on the INK top bar.
  // ---------------------------------------------------------------------------------------------

  // Pip's head: RED cap, PEACH face.
  define('icon_pip', 8, 8, 0, 0, 0, 'pip', [
    [   // pip
      '..0000..',
      '.0pppp0.',
      '0pppppp0',
      '0vvvvvv0',
      '0v0vv0v0',
      '0vvvvvv0',
      '.0vvvv0.',
      '..0000..'
    ]
  ]);

  // Shield charge: the pw_shield shape at 8 px.
  define('icon_shield', 8, 8, 0, 0, 0, 'shield', [
    [   // shield
      '00000000',
      '0b4bbaa0',
      '0b4bbaa0',
      '0bbbbaa0',
      '.0bbba0.',
      '.0bbba0.',
      '..0ba0..',
      '...00...'
    ]
  ]);

  // Ink counter: a drop like item_ink, in SKY and ROYAL so it shows on the INK bar.
  define('icon_ink', 8, 8, 0, 0, 0, 'ink', [
    [   // ink
      '...00...',
      '..0770..',
      '.047770.',
      '.047770.',
      '.077760.',
      '.077660.',
      '..0000..',
      '........'
    ]
  ]);

  // Crown for the boss end of the progress strip: GOLD with a BRONZE band and a RED jewel.
  define('icon_crown', 8, 8, 0, 0, 0, 'crown', [
    [   // crown
      '.0.00.0.',
      '0i0ii0i0',
      '0iiiiii0',
      '0iipiii0',
      '0iiiiii0',
      '0gggggg0',
      '00000000',
      '........'
    ]
  ]);

  // Power slot frame: SILVER frame with STONE corners round a SHADOW well.
  define('ui_slot', 16, 16, 0, 0, 0, 'slot', [
    [   // slot
      '0000000000000000',
      '0233333333333320',
      '0311111111111130',
      '0311111111111130',
      '0311111111111130',
      '0311111111111130',
      '0311111111111130',
      '0311111111111130',
      '0311111111111130',
      '0311111111111130',
      '0311111111111130',
      '0311111111111130',
      '0311111111111130',
      '0311111111111130',
      '0233333333333320',
      '0000000000000000'
    ]
  ]);

  // Keycaps: WHITE face with a SILVER lower edge on a STONE side. The legend is drawn over the face by
  // TG.Font. `down` is the pressed cap: the face sits 2 px lower on a thinner side.
  define('key_cap', 16, 16, 0, 0, 0, 'up down', [
    [   // up
      '.00000000000000.',
      '0444444444444430',
      '0444444444444430',
      '0444444444444430',
      '0444444444444430',
      '0444444444444430',
      '0444444444444430',
      '0444444444444430',
      '0444444444444430',
      '0444444444444430',
      '0444444444444430',
      '0433333333333330',
      '0322222222222220',
      '0322222222222220',
      '.00000000000000.',
      '................'
    ],
    [   // down
      '................',
      '................',
      '.00000000000000.',
      '0444444444444430',
      '0444444444444430',
      '0444444444444430',
      '0444444444444430',
      '0444444444444430',
      '0444444444444430',
      '0444444444444430',
      '0444444444444430',
      '0444444444444430',
      '0444444444444430',
      '0433333333333330',
      '.00000000000000.',
      '................'
    ]
  ]);

  define('key_wide', 32, 16, 0, 0, 0, 'up down', [
    [   // up
      '.000000000000000000000000000000.',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04333333333333333333333333333330',
      '03222222222222222222222222222220',
      '03222222222222222222222222222220',
      '.000000000000000000000000000000.',
      '................................'
    ],
    [   // down
      '................................',
      '................................',
      '.000000000000000000000000000000.',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04444444444444444444444444444430',
      '04333333333333333333333333333330',
      '.000000000000000000000000000000.',
      '................................'
    ]
  ]);

  // ---------------------------------------------------------------------------------------------
  // Backdrop pieces (anchor bottom left; bg_sails at its hub). No outline, and no WHITE, GOLD or INK in
  // the hills, trees and bushes, so the word plates stay legible in front of them (CONTRACT 12, WP-D).
  // ---------------------------------------------------------------------------------------------

  define('bg_cloud_s', 32, 16, 0, 16, 0, 'cloud', [
    [   // cloud
      '................................',
      '.............444444.............',
      '...........4444444444...........',
      '..........444444444444..........',
      '.........44444444444444.........',
      '.........44444444444444.........',
      '.....4444444444444444444444.....',
      '...44444444444444444444444444...',
      '..4444444444444444444444444444..',
      '.444444444444444444444444444444.',
      '.444444444444444444444444444444.',
      '.844444444444444444444444444448.',
      '.844444444444444444444444444488.',
      '..8884444448488884888444444488..',
      '...88884888888888888884888888...',
      '.....888888..........888888.....'
    ]
  ]);

  define('bg_cloud_m', 48, 16, 0, 16, 0, 'cloud', [
    [   // cloud
      '................................................',
      '...............444444...........................',
      '............444444444444........................',
      '...........44444444444444.44444444..............',
      '..........44444444444444444444444444............',
      '..........444444444444444444444444444...........',
      '.....44444444444444444444444444444444444444.....',
      '...444444444444444444444444444444444444444444...',
      '..44444444444444444444444444444444444444444444..',
      '.4444444444444444444444444444444444444444444444.',
      '.4444444444444444444444444444444444444444444444.',
      '.8444444444444444444444444444444444444444444448.',
      '.8444444444448844444484888444444448444444444488.',
      '..88844444484888848888888884888848888444444888..',
      '...8888488888..888888.....88888888.8848888488...',
      '.....888888..........................888888.....'
    ]
  ]);

  define('bg_cloud_l', 64, 24, 0, 24, 0, 'cloud', [
    [   // cloud
      '................................................................',
      '....................44444444....................................',
      '..................444444444444..................................',
      '................4444444444444444....44444444....................',
      '...............444444444444444444.444444444444..................',
      '..............4444444444444444444444444444444444................',
      '..............44444444444444444444444444444444444...............',
      '.............4444444444444444444444444444444444444..............',
      '.............44444444444444444444444444444444444444.............',
      '............444444444444444444444444444444444444444.............',
      '.......44444444444444444444444444444444444444444444444444.......',
      '....44444444444444444444444444444444444444444444444444444444....',
      '...4444444444444444444444444444444444444444444444444444444444...',
      '..444444444444444444444444444444444444444444444444444444444444..',
      '..444444444444444444444444444444444444444444444444444444444444..',
      '.44444444444444444444444444444444444444444444444444444444444444.',
      '.44444444444444444444444444444444444444444444444444444444444444.',
      '.84444444444444444444444444444444444444444444444444444444444444.',
      '.84444444444444444444444444444444444444444444444444444444444448.',
      '..444444444444444444444444444488484444444444448444444444444448..',
      '..884444444444448888444444448888888844444444888444444444444488..',
      '...88884444448888.888848888488....888488884888.88884444444888...',
      '....888488884888....88888888........88888888....888848888888....',
      '.......888888......................................888888.......'
    ]
  ]);

  // Far hills: ROYAL with a HAZE rim, one long ridge that tiles every 128 px. They rise out of the HAZE dither
  // of the day sky.
  define('bg_hill_far', 128, 48, 0, 48, 0, 'hill', [
    [   // hill
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '..........................................................................................................8888888...............',
      '.......................................................................................................8886666666888............',
      '.....................................................................................................886666666666666888.........',
      '....................................................................................................866666666666666666688.......',
      '...................................................................................................8666666666666666666666888....',
      '..................................................................................................86666666666666666666666666888.',
      '88...............................................................................................8666666666666666666666666666668',
      '6688888.........................................................................................86666666666666666666666666666666',
      '666666688888...................................................................................866666666666666666666666666666666',
      '6666666666668888..............................................................................8666666666666666666666666666666666',
      '6666666666666666888..........................................................................86666666666666666666666666666666666',
      '6666666666666666666888......................................................................866666666666666666666666666666666666',
      '6666666666666666666666888..................................................................8666666666666666666666666666666666666',
      '6666666666666666666666666888..............................................................86666666666666666666666666666666666666',
      '6666666666666666666666666666888..........................................................866666666666666666666666666666666666666',
      '666666666666666666666666666666688888....................................................8666666666666666666666666666666666666666',
      '66666666666666666666666666666666666688888888888888888..................................86666666666666666666666666666666666666666',
      '666666666666666666666666666666666666666666666666666668888.............................866666666666666666666666666666666666666666',
      '666666666666666666666666666666666666666666666666666666666888.........................8666666666666666666666666666666666666666666',
      '66666666666666666666666666666666666666666666666666666666666688......................86666666666666666666666666666666666666666666',
      '6666666666666666666666666666666666666666666666666666666666666688...................866666666666666666666666666666666666666666666',
      '6666666666666666666666666666666666666666666666666666666666666666888..............88666666666666666666666666666666666666666666666',
      '666666666666666666666666666666666666666666666666666666666666666666688..........8866666666666666666666666666666666666666666666666',
      '6666666666666666666666666666666666666666666666666666666666666666666668888...8886666666666666666666666666666666666666666666666666',
      '66666666666666666666666666666666666666666666666666666666666666666666666668886666666666666666666666666666666666666666666666666666',
      '66666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666',
      '66666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666',
      '66666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666',
      '66666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666',
      '66666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666',
      '66666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666',
      '66666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666',
      '66666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666',
      '66666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666'
    ]
  ]);

  // Mid hills: FOREST with a GRASS rim, lit from the upper left, and a PINE band that follows the east-facing
  // slopes, plus a PINE hedge line along the bottom. The silhouette meets itself at the left and right edges,
  // so the piece tiles every 128 px.
  define('bg_hill_mid', 128, 56, 0, 56, 0, 'hill', [
    [   // hill
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '............................................................eeee................................................................',
      '..........................................................eeccccee..............................................................',
      '.........................................................ecccccccce.............................................................',
      '........................................................eccccccccccee...........................................................',
      '.......................................................eccccccccccccce..........................................................',
      '......................................................eccccccccccccccce.........................................................',
      '.....................................................edddcccccccccccccce........................................................',
      '.....................................................eddddddccccccccccccee......................................................',
      '....................................................edddddddddccccccccccccee....................................................',
      '...................................................eddddddddddddccccccccccccee..................................................',
      '...................................................eddddddddddddddddddcccccccceeeeeee...........................................',
      '..................................................edddddddddddddddddddddddccccccccccceeee.......................................',
      '.................................................edddddddddddddddddddddddddddcccccccccccceee....................................',
      '.................................................eddddddddddddddddddddddddddddcccccccccccccce...................................',
      '................................................edddddddddddddddddddddddddddddddcccccccccccccee.................................',
      '................................................eddddddddddddddddddddddddddddddddcccccccccccccce................................',
      '...............................................edddddddddddddddddddddddddddddddddddccccccccccccce...............................',
      '..............................................edddddddddddddddddddddddddddddddddddddccccccccccccce....................eeeee.....',
      '..............................................edddddddddddddddddddddddddddddddddddddddccccccccccccee...............eeecccccee...',
      '.............................................edddddddddddddddddddddddddddddddddddddddddccccccccccccce............eeccccccccccee.',
      '............................................eddddddddddddddddddddddddddddddddddddddddddddccccccccccccee........eecccccccccccccce',
      'e...........................................edddddddddddddddddddddddddddddddddddddddddddddddccccccccccceee..eeeddccccccccccccccc',
      'ce.........................................eddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddeedddddddccccccccccccc',
      'cc........................................eddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddccccccccccccc',
      'cce......................................edddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddccccccccccc',
      'ccce....................................edddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddcccccccccc',
      'cccce.................................eeddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddcccccccc',
      'ccccce..............................eedddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddccccccc',
      'cccccce.........................eeeeddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddcccccc',
      'ccccccce...................eeeeedddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddccccc',
      'cccccccce................eeddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddccc',
      'ccccccccce............eeedddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddcc',
      'ccccccccccee........eedddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      'ddddddddddddeeeeeeeedddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
    ]
  ]);

  define('bg_tree', 16, 32, 0, 32, 0, 'tree', [
    [   // tree
      '................',
      '.....dddddd.....',
      '....dddddddc....',
      '...deeedddddc...',
      '..deeeeedddddc..',
      '..deeeeeeddddc..',
      '.ddeeeeeeddddcc.',
      '.deeeeeeeddddcc.',
      '.deeeeeeeddddcc.',
      '.ddeeeeeedddddc.',
      '.ddeeeeeeddddcc.',
      '.dddeeeedddddcc.',
      '.ddddedddddddcc.',
      '.ddddddddddddcc.',
      '.ddddddddddddcc.',
      '.dddddddddddccc.',
      '..dddddddddccc..',
      '..dddddddddccc..',
      '...dddddddccc...',
      '....ccdccccc....',
      '.....clkkkc.....',
      '......lkkk......',
      '......lkkk......',
      '......lkkk......',
      '......lkkk......',
      '......lkkk......',
      '......lkkk......',
      '......lkkk......',
      '......lkkk......',
      '......lkkk......',
      '......lkkk......',
      '......lkkk......'
    ]
  ]);

  define('bg_windmill', 32, 48, 0, 48, 0, 'mill', [
    [   // mill
      '...............22...............',
      '..............2222..............',
      '.............222211.............',
      '............22222211............',
      '...........2222222111...........',
      '..........222222222111..........',
      '.........22222222221111.........',
      '........2222222222221111........',
      '......11111111111111111111......',
      '........mnnnnnnnnnmmmmmm........',
      '........mnnnnnnnnnmmmmmm........',
      '........mnnnnnnkkkmmmmmm........',
      '........mnnnnnnkkkmmmmmm........',
      '........mnnnnnnkkkmmmmmm........',
      '........mnnnnnnnnnmmmmmm........',
      '........mnnnnnnnnnmmmmmm........',
      '........mnnnnnnnnnmmmmmm........',
      '........mnnnnnnnnnmmmmmm........',
      '........mnnnnnnnnnmmmmmm........',
      '.......mnnnnnnnnnnmmmmmmm.......',
      '.......mnnnnnnnnnnmmmmmmm.......',
      '.......mnnnnnnnnnnmmmmmmm.......',
      '.......mnnnkknnnnnmkkmmmm.......',
      '.......mnnnkknnnnnmkkmmmm.......',
      '.......mnnnkknnnnnmkkmmmm.......',
      '.......mnnnnnnnnnnmmmmmmm.......',
      '.......mnnnnnnnnnnmmmmmmm.......',
      '.......mnnnnnnnnnnmmmmmmm.......',
      '......mnnnnnnnnnnnnmmmmmmm......',
      '......mnnnnnnnnnnnnmmmmmmm......',
      '......mnnnnnnnnnnnnmmmmmmm......',
      '......mnnnnnnnnnnnnmmmmmmm......',
      '......mnnnnkknnnnnnkkmmmmm......',
      '......mnnnnkknnnnnnkkmmmmm......',
      '......mnnnnkknnnnnnkkmmmmm......',
      '......mnnnnnnnnnnnnmmmmmmm......',
      '......mnnnnnnnnnnnnmmmmmmm......',
      '......mnnnnnnnnnnnnmmmmmmm......',
      '.....mnnnnnnnnnnnnnmmmmmmmm.....',
      '.....mnnnnnnnnkkkknmmmmmmmm.....',
      '.....mnnnnnnnkkkkkkmmmmmmmm.....',
      '.....mnnnnnnnkkkkkkmmmmmmmm.....',
      '.....mnnnnnnnkkkkkkmmmmmmmm.....',
      '.....mnnnnnnnkkkkkkmmmmmmmm.....',
      '.....mnnnnnnnkkkkkkmmmmmmmm.....',
      '.....mnnnnnnnkkkkkkmmmmmmmm.....',
      '.....mnnnnnnnkkkkkkmmmmmmmm.....',
      '....222222222kkkkkk222222222....'
    ]
  ]);

  define('bg_sails', 32, 32, 16, 16, 4, 's0 s1 s2 s3', [
    [   // s0
      '................................',
      '...............kk...............',
      '.............mmkkm..............',
      '.............mnkkn..............',
      '.............mnkkn..............',
      '.............mnkkn..............',
      '.............mnkkn..............',
      '.............mnkkn..............',
      '.............mnkkn..............',
      '.............mnkkn..............',
      '.............mmkkm..............',
      '...............kk...............',
      '...............kk...............',
      '...............kk...............',
      '..mnnnnnnnm....kk....mnnnnnnnm..',
      '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
      '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
      '..mnnnnnnnm....kkk...mnnnnnnnm..',
      '..mmmmmmmmm....kk...............',
      '...............kk...............',
      '...............kk...............',
      '..............mkkmm.............',
      '..............nkknm.............',
      '..............nkknm.............',
      '..............nkknm.............',
      '..............nkknm.............',
      '..............nkknm.............',
      '..............nkknm.............',
      '..............nkknm.............',
      '..............mkkmm.............',
      '...............kk...............',
      '................................'
    ],
    [   // s1
      '................................',
      '................................',
      '...................m............',
      '..................mnmk..........',
      '..................mnknm.........',
      '..................mnknm.........',
      '.................mnkknm.........',
      '.................mnknm..........',
      '................mnkknm..........',
      '....mmm.........mnknm...........',
      '...knnnmm.......mmknm...........',
      '...mkkknnmmm.....kkmm...........',
      '..mnnnkkknnm.....k..............',
      '...mmmnnkkkk....kk..............',
      '......mmnnmkkk..k...............',
      '........mmm..kkkkk..............',
      '...............kkkk..mmm........',
      '...............kkkkkkmnnmm......',
      '..............kk....kkkknnmmm...',
      '..............k.....mnnkkknnnm..',
      '...........mmkk.....mmmnnkkkm...',
      '...........mnkmm.......mmnnnk...',
      '...........mnknm.........mmm....',
      '..........mnkknm................',
      '..........mnknm.................',
      '.........mnkknm.................',
      '.........mnknm..................',
      '.........mnknm..................',
      '..........kmnm..................',
      '............m...................',
      '................................',
      '................................'
    ],
    [   // s2
      '................................',
      '................................',
      '................................',
      '................................',
      '................................',
      '.......mm..............mm.......',
      '......knnm............mnnk......',
      '.....mnknnm..........mnnknm.....',
      '.....mnnknnm........mnnknnm.....',
      '......mnnknnm......mnnknnm......',
      '.......mnnknnm....mnnknnm.......',
      '........mnnkm......mknnm........',
      '.........mnmk......kmnm.........',
      '..........m..k....k..m..........',
      '..............k..k..............',
      '...............kkk..............',
      '...............kkk..............',
      '..............kkkk..............',
      '..........m..k....k..m..........',
      '.........mnmk......kmnm.........',
      '........mnnkm......mknnm........',
      '.......mnnknnm....mnnknnm.......',
      '......mnnknnm......mnnknnm......',
      '.....mnnknnm........mnnknnm.....',
      '.....mnknnm..........mnnknm.....',
      '......knnm............mnnk......',
      '.......mm..............mm.......',
      '................................',
      '................................',
      '................................',
      '................................',
      '................................'
    ],
    {copy:1,flipX:true}
  ]);

  define('bg_bush', 32, 16, 0, 16, 0, 'bush', [
    [   // bush
      '................................',
      '.............eeeeeeee...........',
      '...........eeffeeeeeeed.........',
      '..........effffffeeeeeed........',
      '.........eefffffffeeeeeee.......',
      '....eeeeeeffffffffeeeeeee.......',
      '..eeffffeeffffffffeeeeeeeeeeed..',
      '.eeffffffeefffffffeeeeffffeeeed.',
      '.efffffffeeefffffeeeeefffffeeed.',
      '.eeffffffeeeeeeeeeeeeefffffeeedd',
      '.eeefffeeeeeeeeeeeeeeeffffeeeedd',
      '.eeeeeeeeeeeeeeeeeeeeeeeeeeeeddd',
      '.deeeeeeeeeeeeeeeeeedeeeeeeeddd.',
      '..ddddeddddddddeddddddddedddddd.',
      '....dddddddd.dddddddd.dddddddd..',
      '................................'
    ]
  ]);

  // Fence: SAND rails with a CLAY underside and CLAY posts on BARK feet. The rails reach both edges so
  // fences placed 32 px apart join up. L4.
  define('bg_fence', 32, 16, 0, 16, 0, 'fence', [
    [   // fence
      '...m...............m............',
      '..mnm.............mnm...........',
      '..mnm.............mnm...........',
      '..mnm.............mnm...........',
      '..mnm.............mnm...........',
      'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
      '..mnm.............mnm...........',
      '..mnm.............mnm...........',
      '..mnm.............mnm...........',
      'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
      '..mnm.............mnm...........',
      '..mnm.............mnm...........',
      '..mnm.............mnm...........',
      '..kkk.............kkk...........'
    ]
  ]);


  define('bg_appletree', 32, 48, 0, 48, 0, 'tree', [
    [   // tree
      '................................',
      '..........eeeeeeeeeeee..........',
      '........eeeeeeeeeeeeeeee........',
      '.......eeeeeeeeeeeeeeeeee.......',
      '.....eeeefffffeeeeeeeeeeeed.....',
      '....eeefffffffffeeeeeeeeeeed....',
      '...eeefffffffffffeeeeeeeeeedd...',
      '...eeffffffffffffeeeeeeeeeeed...',
      '..eeefffffffffffffeeeppeeeeeed..',
      '..eeffffffffffffffeeeppeeeeeed..',
      '.eeefffppfffffffffeeeeeeeeeeedd.',
      '.eeefffppfffffffffeeeeeeeeeeedd.',
      '.eeeefffffffffffffeeeeeeeeeeedd.',
      '.eeeefffffffffffffeeeeeeeeeeeed.',
      '.eeeeefffffffffffeeeeeeeeeeeedd.',
      '.eefffffffffffffeeefffffeeeeedd.',
      '.effffffffffffeeeefffffffeeeeed.',
      '.efffffffeeeeeppeefffffffeeeeed.',
      'eefffffffeeeeeppeefffffffeppeedd',
      'eefffffffeeeeeeeeefffffffeppeedd',
      'eeeeffffeeeeeeeeeeeeffffeeeeeedd',
      'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeddd',
      '.eeeeeeeeeppeeeeeeeeeeeeeeeeddd.',
      '.deeeeeeeeppeeeeeeeppeeeeeedddd.',
      '..ddeeeeeeeeeeeeeeeppeeeeddddd..',
      '...ddddeeeeeeeeeeeeeeeddddddd...',
      '.....ddddeeeeeeeeeeeddddddd.....',
      '........dddddllkkkkddddd........',
      '..........dddllkkkkddd..........',
      '.............llkkkk.............',
      '.............llkkkk.............',
      '.............llkkkk.............',
      '.............llkkkk.............',
      '.............llkkkk.............',
      '.............llkkkk.............',
      '.............llkkkk.............',
      '.............llkkkk.............',
      '.............llkkkk.............',
      '.............llkkkk.............',
      '.............llkkkk.............',
      '.............llkkkk.............',
      '.............llkkkk.............',
      '.............llkkkk.............',
      '.............llkkkk.............',
      '.............llkkkk.............',
      '.............llkkkk.............',
      '............llkkkkkk............',
      '...........lllkkkkkkk...........'
    ]
  ]);

  // Molehill: an old, grassed-over mound, SOIL on the lit side and BARK in shadow, with a GRASS tuft and no
  // hole. L4, section 3 and the arena. It is kept low, dark and without an outline so that it cannot be
  // taken for en_mound, the outlined mound that marks a Digby about to rise.
  define('bg_molehill', 16, 8, 0, 8, 0, 'hill', [
    [   // hill
      '................',
      '......f..e......',
      '.....ef.ef.e....',
      '....llleelkk....',
      '...lllllkkkkk...',
      '..llmllllkkkkk..',
      '.lllllllkkkkkkk.',
      'llmlllllllkkkkkk'
    ]
  ]);


  define('bg_moon', 32, 32, 0, 32, 0, 'moon', [
    [   // moon
      '................................',
      '...........jjjjjjjjjj...........',
      '........jjjjjjjjjjjjjjjj........',
      '.......jjjjjjjjjjjjjjjjjj.......',
      '......jjjjjjjjjjjjjjjjjjjj......',
      '.....jjjjjjjjjjjjjjjjjjjjjj.....',
      '....jjjjjjjjjjjjjjjjjjjjjjjj....',
      '...jjjjjvvvvjjjjjjjjjjjjjjjjv...',
      '..jjjjjjvvvvjjjjjjjjjjjjjjjjjv..',
      '..jjjjjjvvvvjjjjjjjjjjjjjjjjjv..',
      '..jjjjjjvvvvjjjjjjjjjjjjjjjjjj..',
      '.jjjjjjjjjjjjjjjjjvvvvjjjjjjjjv.',
      '.jjjjjjjjjjjjjjjjvvvvvvjjjjjjjv.',
      '.jjjjjjjjjjjjjjjjvvvvvvjjjjjjjv.',
      '.jjjjjjjjjjjjjjjjvvvvvvjjjjjjjv.',
      '.jjjjjjjjjjjjjjjjvvvvvvjjjjjjjv.',
      '.jjjjjjvvjjjjjjjjjvvvvjjjjjjjjv.',
      '.jjjjjjvvjjjjjjjjjjjjjjjjjjjjjv.',
      '.jjjjjjjjjjjjjjjjjjjjjjjjjjjjjv.',
      '.jjjjjjjjjjjjjjjjjjjjjjjjjjjjjv.',
      '.jjjjjjjjjjvvvvjjjjjjjjjjjjjjvv.',
      '..jjjjjjjjjvvvvjjjjjjjjjjjjjjv..',
      '..jjjjjjjjjvvvvjjjjjjjvvjjjjvv..',
      '..jjjjjjjjjvvvvjjjjjjvvvvjjjvv..',
      '...jjjjjjjjjjjjjjjjjjvvvvjjvv...',
      '....jjjjjjjjjjjjjjjjjjvvjjvv....',
      '.....jjjjjjjjjjjjjjjjjjjjvv.....',
      '......jjjjjjjjjjjjjjjjjjvv......',
      '.......vjjjjjjjjjjjjjjvvv.......',
      '........vvjjjjjjjjjjvvvv........',
      '...........vvvvvvvvvv...........',
      '................................'
    ]
  ]);

  // Star: a CREAM point with SILVER rays; s1 is brighter. CREAM and SILVER are not touched by the dusk remap.
  define('bg_star', 8, 8, 0, 8, 2, 's0 s1', [
    [   // s0
      '........',
      '........',
      '........',
      '...3....',
      '..3j3...',
      '...3....',
      '........',
      '........'
    ],
    [   // s1
      '........',
      '........',
      '...3....',
      '...j....',
      '.3jjj3..',
      '...j....',
      '...3....',
      '........'
    ]
  ]);

  // Foreground grass tufts: GRASS blades with LIME tips on a FOREST base. L6, drawn under the type bar.
  define('fg_tuft', 16, 8, 0, 8, 0, 't0 t1', [
    [   // t0
      '....f......f....',
      '...ff.....ff....',
      '..fe..f..fe..f..',
      '..ee.ff..ee.ff..',
      '.eee.fe.eee.fe..',
      '.eeeeee.eeeeee..',
      'deeeeeedeeeeeed.',
      'dddddddddddddddd'
    ],
    [   // t1
      '.......f.....f..',
      '..f...ff....ff..',
      '.ff..fe..f..fe..',
      '.fe..ee.ff..ee..',
      '.ee.eee.fe.eee..',
      '.eeeeee.eeeeee..',
      '.deeeeedeeeeeed.',
      'dddddddddddddddd'
    ]
  ]);

  // ---------------------------------------------------------------------------------------------
  // Remaps (CONTRACT 6.3). Applied by the renderer to every backdrop piece and tile of a section.
  // ---------------------------------------------------------------------------------------------

  // Section 3, sunset: SKY and HAZE to ORANGE and CORAL; ROYAL to VIOLET; the greens one step darker and
  // cooler (FOREST and PINE towards PLUM, GRASS and LIME towards FOREST and GRASS); WHITE to CREAM so the
  // clouds catch the evening light.
  TG.Remaps.sunset = {
    7: 17,    // SKY -> ORANGE
    8: 26,    // HAZE -> CORAL
    6: 29,    // ROYAL -> VIOLET
    5: 28,    // DEEP_BLUE -> PLUM
    13: 9,    // FOREST -> DEEP_TEAL
    12: 28,   // PINE -> PLUM
    14: 13,   // GRASS -> FOREST
    15: 14,   // LIME -> GRASS
    4: 19     // WHITE -> CREAM
  };

  // Boss arena, dusk: blues to DEEP_BLUE, greens to PINE and DEEP_TEAL, hills to PLUM and INK, WHITE to
  // STONE, the ground colours one step darker. SILVER and CREAM are left alone, so the rails, the stars and
  // the moon keep their colours.
  TG.Remaps.dusk = {
    7: 5,     // SKY -> DEEP_BLUE
    8: 29,    // HAZE -> VIOLET (the rim of the far hills)
    6: 28,    // ROYAL -> PLUM (far hills)
    13: 12,   // FOREST -> PINE (mid hills, trees)
    12: 0,    // PINE -> INK (their shaded slopes)
    14: 9,    // GRASS -> DEEP_TEAL
    15: 12,   // LIME -> PINE
    4: 2,     // WHITE -> STONE
    23: 22,   // SAND -> CLAY
    22: 21,   // CLAY -> SOIL
    21: 20,   // SOIL -> BARK
    25: 24    // RED -> MAROON
  };

  // Level 2 (LEVEL2 3.1, Appendix C). The pieces of the backdrop `cavern` are drawn in the colours of
  // section 1, whose palette `lantern` has no remap. These two list only the colours they change; a
  // colour that is not listed is unchanged. The rails stay SILVER and the hazard accents CORAL.

  // Section 2 and the boss arena, brass (palettes `brass` and `clock`).
  TG.Remaps.brass = {
    2: 16,    // STONE -> BRONZE: rock faces become brass plate
    10: 18    // TEAL -> GOLD: moss specks become rivets
  };

  // Section 3, crystal (palette `crystal`).
  TG.Remaps.crystal = {
    28: 5,    // PLUM -> DEEP_BLUE: the ceiling rim follows the band
    16: 9,    // BRONZE -> DEEP_TEAL: metal goes cold
    18: 11,   // GOLD -> AQUA: the far wall's lamp dots become crystal glints
    17: 10    // ORANGE -> TEAL
  };

  // The ink drops of Level 2 (LEVEL2 3.1, rule 2: the fallback named there). An item's remap and not a
  // section's: item_ink is drawn with it in every section of the level, named in the level data. On
  // DEEP_BLUE and on PLUM a ROYAL drop is nearly as dark as the band, and its INK outline does not
  // carry it there; with this the drop has the SKY body and ROYAL shade of icon_ink on the HUD bar.
  TG.Remaps.paleink = {
    6: 7,     // ROYAL -> SKY: the body
    5: 6      // DEEP_BLUE -> ROYAL: the shade
  };

  // ---------------------------------------------------------------------------------------------
  // Backdrop (CONTRACT 6.5): parallax layers of Level 1. All positions are screen px; `x` is the left
  // of the piece and `y` its bottom, except bg_sails, whose anchor (its hub) is placed at x, y.
  // ---------------------------------------------------------------------------------------------

  TG.Backdrops.meadow = {
    palettes: {
      // Sections 1 and 2: SKY, dithered towards HAZE over the lowest 48 px. Hourglass: the top band turns ROYAL.
      day: {
        sky: [ { y: 0, h: 136, color: 7 }, { y: 136, h: 48, color: 7, dither: 8 } ],
        remap: null,
        slowSky: 6
      },
      // Section 3: PLUM above CORAL above ORANGE at the horizon. Hourglass: the top band turns DEEP_BLUE.
      sunset: {
        sky: [ { y: 0, h: 64, color: 28 }, { y: 64, h: 56, color: 26 }, { y: 120, h: 64, color: 17 } ],
        remap: 'sunset',
        slowSky: 5
      },
      // Boss arena: DEEP_BLUE with stars and a moon. Hourglass: the sky turns PLUM.
      dusk: {
        sky: [ { y: 0, h: 184, color: 5 } ],
        remap: 'dusk',
        slowSky: 28,
        stars: [
          { x: 22, y: 44 }, { x: 58, y: 72 }, { x: 84, y: 36 }, { x: 118, y: 60 }, { x: 146, y: 92 },
          { x: 166, y: 40 }, { x: 204, y: 70 }, { x: 236, y: 48 }, { x: 258, y: 100 }, { x: 274, y: 34 },
          { x: 350, y: 52 }, { x: 366, y: 96 }, { x: 40, y: 108 }, { x: 200, y: 112 }
        ],
        moon: { x: 300, y: 72 }
      }
    },
    layers: [
      { id: 'clouds', factor: 0.1, drift: 2, repeat: 512, items: [
        { sprite: 'bg_cloud_l', x: 40,  y: 60, sections: [0, 1, 2] },
        { sprite: 'bg_cloud_s', x: 190, y: 44, sections: [0, 1, 2] },
        { sprite: 'bg_cloud_m', x: 300, y: 76, sections: [0, 1, 2] },
        { sprite: 'bg_cloud_s', x: 430, y: 52, sections: [0, 1, 2] }
      ] },
      { id: 'far', factor: 0.2, drift: 0, repeat: 128, items: [
        { sprite: 'bg_hill_far', x: 0, y: 168 }
      ] },
      { id: 'mid', factor: 0.4, drift: 0, repeat: 384, items: [
        { sprite: 'bg_hill_mid', x: 0,   y: 184 },
        { sprite: 'bg_hill_mid', x: 128, y: 184 },
        { sprite: 'bg_hill_mid', x: 256, y: 184 },
        { sprite: 'bg_tree', x: 30,  y: 184 },
        { sprite: 'bg_tree', x: 52,  y: 184 },
        { sprite: 'bg_tree', x: 150, y: 184 },
        { sprite: 'bg_tree', x: 290, y: 184 },
        { sprite: 'bg_tree', x: 312, y: 184 },
        { sprite: 'bg_windmill', x: 200, y: 184, sections: [0, 1] },
        { sprite: 'bg_sails',    x: 216, y: 148, sections: [0, 1] },
        { sprite: 'bg_tree', x: 210, y: 184, sections: [2, 3] }
      ] },
      { id: 'near', factor: 0.7, drift: 0, repeat: 384, items: [
        { sprite: 'bg_bush',  x: 20,  y: 184 },
        { sprite: 'bg_fence', x: 96,  y: 184, sections: [0, 1, 2] },
        { sprite: 'bg_fence', x: 128, y: 184, sections: [0, 1, 2] },
        { sprite: 'bg_bush',  x: 250, y: 184 },
        { sprite: 'bg_appletree', x: 180, y: 184, sections: [1] },
        { sprite: 'bg_appletree', x: 320, y: 184, sections: [1] },
        { sprite: 'bg_molehill', x: 60,  y: 184, sections: [2, 3] },
        { sprite: 'bg_molehill', x: 200, y: 184, sections: [2, 3] },
        { sprite: 'bg_molehill', x: 330, y: 184, sections: [2, 3] }
      ] },
      { id: 'fg', factor: 1.3, drift: 0, repeat: 256, front: true, items: [
        { sprite: 'fg_tuft', x: 16,  y: 216 },
        { sprite: 'fg_tuft', x: 120, y: 216 },
        { sprite: 'fg_tuft', x: 200, y: 216 }
      ] }
    ]
  };

  // ===== LEVEL 2: the cavern backdrop (LEVEL2 3.3, Appendix C) =====

  // Backdrop pieces (anchor bottom left). No outline, as in Level 1. The band where the word plates travel, y 24 to
  // 150, is one flat dark colour in every palette of `cavern`, so a piece is SHADOW wherever it stands inside the
  // band (LEVEL2 3.1, rule 1). The plan names four exceptions, each dim or small: the 1 px BRONZE rim of bg_cog_l
  // and bg_pipe_v, the DEEP_TEAL lines of bg_mist, the GOLD lamps of bg_cave_far and the BRONZE teeth of
  // bg_gearstar. The clock face is the one bright piece in the band. Every other bright pixel stands on the floor
  // line, below y 150. The pieces are drawn in the colours of section 1; the remaps brass and crystal change them
  // elsewhere. The roof is hinted at under the HUD and ends by y 40: bg_roots in section 1, and in sections 2 and 3
  // the rock rim of the hazards, haz_ceiling, which is SHADOW with flecks of the band colour inside an INK outline.
  //
  // The 34 px above the floor are where the ground creatures, the rolling gear and the pendulum pass, in BRONZE and
  // GOLD. The machines of the Gear Hall and the clock hall (the cog, the standpipe, the pipe run, the boiler) are
  // therefore SHADOW inside a 1 px BRONZE line from top to bottom, with a few single pixels of GOLD or CREAM and no
  // bright fill. A piece that stands behind something Pip has to read is kept dimmer than it: the crystals than
  // haz_crystal and than his tunic, the lantern than haz_lantern, the stalagmite than a spike in his way, the gear
  // stars than pr_cog and the boiler than boss2_engine.

  // Mist: three thin DEEP_TEAL wisps, 1 px high, each rising and falling by a row or two along its length. Their
  // broken ends lengthen and shorten between the two frames. L1, sections 1 to 3. The wisps drift inside the plate
  // band: one of the exceptions of rule 1.
  define('bg_mist', 64, 16, 0, 16, 2, 'm0 m1', [
    [   // m0
      '................................................................',
      '................................................................',
      '....................9999999999999...............................',
      '...........999999999.............99999999.......................',
      '.....99.999..............................9999.99................',
      '................................................................',
      '................................................................',
      '......................................99999999999999............',
      '.............................999999999..............99999.99....',
      '........................99.99...................................',
      '................................................................',
      '................................................................',
      '..........9999999999999999......................................',
      '....99.999................999999.99.............................',
      '................................................................',
      '................................................................'
    ],
    [   // m1
      '................................................................',
      '................................................................',
      '....................9999999999999...............................',
      '...........999999999.............99999999.......................',
      '...9999.999..............................9999.9999..............',
      '................................................................',
      '................................................................',
      '......................................99999999999999............',
      '.............................999999999..............99999.9.....',
      '......................9999.99...................................',
      '................................................................',
      '................................................................',
      '..........9999999999999999......................................',
      '......9999................999999.9999...........................',
      '................................................................',
      '................................................................'
    ]
  ]);

  // Gear star: a small SHADOW cog of eight teeth, in place of the stars of the arena sky. Its teeth glint BRONZE:
  // the upright ones in s0 and the diagonal ones in s1. The renderer alternates the two, so the cogs of the clock
  // hall turn. The body is dark so that a gear star is not taken for pr_cog, the GOLD cog Lady Ratchet throws.
  define('bg_gearstar', 8, 8, 0, 8, 2, 's0 s1', [
    [   // s0
      '...gg...',
      '.1.gg.1.',
      '..1111..',
      'gg1111gg',
      'gg1111gg',
      '..1111..',
      '.1.gg.1.',
      '...gg...'
    ],
    [   // s1
      '...11...',
      '.g.11.g.',
      '..g11g..',
      '11111111',
      '11111111',
      '..g11g..',
      '.g.11.g.',
      '...11...'
    ]
  ]);

  // The Great Clock: a CREAM face in a GOLD rim, BRONZE numerals and hour marks, INK hands. It is the moon of the
  // palette `clock`: the one bright piece above the floor line, at x 328 to 376 and y 36 to 84, to the right of every
  // boss plate (LEVEL2 3.1). The minute hand moves one mark between c0 and c1, once a second.
  define('bg_clockface', 48, 48, 0, 48, 1, 'c0 c1', [
    [   // c0
      '.....................iiiiii.....................',
      '.................iiiiiiiiiiiiii.................',
      '..............iiiiiiiiiiiiiiiiiiii..............',
      '............iiiiiiiiiiiiiiiiiiiiiiii............',
      '...........iiiiiiijjjjjjjjjjjjiiiiiii...........',
      '.........iiiiiijjjjjjgjjggjjjjjjjiiiiii.........',
      '........iiiiiijjjjjjggjjjjgjjjjjjjiiiiii........',
      '.......iiiiijjgjjjjjjgjjjgjjjjjjjgjjiiiii.......',
      '......iiiiijjjggjjjjjgjjgjjjjjjjggjjjiiiii......',
      '.....iiiiijjjjjgjjjjgggjgggjjjjjgjjjjjiiiii.....',
      '.....iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiiii.....',
      '....iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiiig....',
      '...iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiigg...',
      '...iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiiig...',
      '..iiiijggjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjggjiiig..',
      '..iiijjjggjjjjjjjjjjjjjjjjjjjjjjjjjjjjggjjjiig..',
      '..iiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjj000jjjjjiig..',
      '.iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjj000jjjjjjiiig.',
      '.iiijjjjjjjjjjjj00jjjjjjjjjjjjjj000jjjjjjjjjiig.',
      '.iiijjjjjjjjjjjj0000jjjjjjjjjj000jjjjjjjjjjjiig.',
      '.iiijjjjjjjjjjjjj0000jjjjjjj0000jjjjjjjjjjjjiig.',
      'iiiijjjjjjjjjjjjjj00000jjjj000jjjjjjjjjjjjjjiigg',
      'iiiijjjgjjjjjjjjjjjj00j00j00jjjjjjjjjjjggjjjiiig',
      'iiiijjgjgjjjjjjjjjjjj00000jjjjjjjjjjjjjjjgjjiiig',
      'iiiijjjggjjjjjjjjjjjjj0000jjjjjjjjjjjjjjgjjjiiig',
      'iiiijjjjgjjjjjjjjjjjjjj00jjjjjjjjjjjjjjjjgjjiiig',
      'iiiijjggjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjggjjjiigg',
      '.iiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiig.',
      '.iiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiig.',
      '.iiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiig.',
      '.iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiiig.',
      '..iiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiig..',
      '..iiijjjggjjjjjjjjjjjjjjjjjjjjjjjjjjjjggjjjiig..',
      '..iiiijggjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjggjiiig..',
      '...iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiiig...',
      '...iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiigg...',
      '....iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiiig....',
      '.....iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiiig.....',
      '.....iiiiijjjjjgjjjjjjjggjjjjjjjgjjjjjiiigg.....',
      '......iiiiijjjggjjjjjjgjjjjjjjjjggjjjiiigg......',
      '.......iiiiijjgjjjjjjjggjjjjjjjjjgjjiiigg.......',
      '........iiiiiijjjjjjjjgjgjjjjjjjjjiiiigg........',
      '.........iiiiiijjjjjjjjgjjjjjjjjjiiiigg.........',
      '...........ggiiiiijjjjjjjjjjjjiiiiigg...........',
      '............ggiiiiiiiiiiiiiiiiiiiigg............',
      '..............gggiiiiiiiiiiiiiiggg..............',
      '.................gggggiiiiggggg.................',
      '.....................gggggg.....................'
    ],
    [   // c1
      '.....................iiiiii.....................',
      '.................iiiiiiiiiiiiii.................',
      '..............iiiiiiiiiiiiiiiiiiii..............',
      '............iiiiiiiiiiiiiiiiiiiiiiii............',
      '...........iiiiiiijjjjjjjjjjjjiiiiiii...........',
      '.........iiiiiijjjjjjgjjggjjjjjjjiiiiii.........',
      '........iiiiiijjjjjjggjjjjgjjjjjjjiiiiii........',
      '.......iiiiijjgjjjjjjgjjjgjjjjjjjgjjiiiii.......',
      '......iiiiijjjggjjjjjgjjgjjjjjjjggjjjiiiii......',
      '.....iiiiijjjjjgjjjjgggjgggjjjjjgjjjjjiiiii.....',
      '.....iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiiii.....',
      '....iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiiig....',
      '...iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiigg...',
      '...iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiiig...',
      '..iiiijggjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjggjiiig..',
      '..iiijjjggjjjjjjjjjjjjjjjjjjjjjjjjjjjjggjjjiig..',
      '..iiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiig..',
      '.iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj0jjjjjiiig.',
      '.iiijjjjjjjjjjjj00jjjjjjjjjjjjjjjj0000jjjjjjiig.',
      '.iiijjjjjjjjjjjj0000jjjjjjjjjjjj0000jjjjjjjjiig.',
      '.iiijjjjjjjjjjjjj0000jjjjjjjjj0000jjjjjjjjjjiig.',
      'iiiijjjjjjjjjjjjjj00000jjjjj0000jjjjjjjjjjjjiigg',
      'iiiijjjgjjjjjjjjjjjj00j00j000jjjjjjjjjjggjjjiiig',
      'iiiijjgjgjjjjjjjjjjjj000000jjjjjjjjjjjjjjgjjiiig',
      'iiiijjjggjjjjjjjjjjjj00000jjjjjjjjjjjjjjgjjjiiig',
      'iiiijjjjgjjjjjjjjjjjjjj00jjjjjjjjjjjjjjjjgjjiiig',
      'iiiijjggjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjggjjjiigg',
      '.iiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiig.',
      '.iiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiig.',
      '.iiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiig.',
      '.iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiiig.',
      '..iiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiig..',
      '..iiijjjggjjjjjjjjjjjjjjjjjjjjjjjjjjjjggjjjiig..',
      '..iiiijggjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjggjiiig..',
      '...iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiiig...',
      '...iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiigg...',
      '....iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiiig....',
      '.....iiiijjjjjjjjjjjjjjjjjjjjjjjjjjjjjjiiig.....',
      '.....iiiiijjjjjgjjjjjjjggjjjjjjjgjjjjjiiigg.....',
      '......iiiiijjjggjjjjjjgjjjjjjjjjggjjjiiigg......',
      '.......iiiiijjgjjjjjjjggjjjjjjjjjgjjiiigg.......',
      '........iiiiiijjjjjjjjgjgjjjjjjjjjiiiigg........',
      '.........iiiiiijjjjjjjjgjjjjjjjjjiiiigg.........',
      '...........ggiiiiijjjjjjjjjjjjiiiiigg...........',
      '............ggiiiiiiiiiiiiiiiiiiiigg............',
      '..............gggiiiiiiiiiiiiiiggg..............',
      '.................gggggiiiiggggg.................',
      '.....................gggggg.....................'
    ]
  ]);

  // Far wall: tilted ledges of rock in SHADOW that tile every 128 px. The skyline and the foot are solid; between them
  // every other row is left open, so the wall is half as strong as the rocks in front of it and the floor band shows
  // through it. Four GOLD lamps, 2 px wide, burn in it: two are 2 px high in each frame and two 1 px. The remap
  // crystal turns them into AQUA glints.
  define('bg_cave_far', 128, 48, 0, 48, 2, 'w0 w1', [
    [   // w0
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '...............1................................................................................................................',
      '...............1................................................................................................................',
      '...........11.1.1...............................................................................................................',
      '..........1111111...............................................................................................................',
      '.........1.......111...............................................1............................................................',
      '........1111111111111..............................................1............................................................',
      '........1...........1......1...................................1111.1...........................................................',
      '........11111111111111....11..................................11111111..........................................................',
      '........1.............11..1.1................................1........111.......................................................',
      '........111111111111111111111...............................11111111111111....................................1.................',
      '.......1.....................1..............................1............1.......1............................1.................',
      '.......1111111111111111111111111............................111111111111111.....11...........................11.................',
      '.......1........................1...........................1..............11...1.1..........................1.1................',
      '.......11111111111111111111111111...........................11111111111111111111111.......................111111................',
      '......1..........................1......1...................1......................11.....................1.....1111............',
      '......111111111111111111111111111111...11..................1111111111111111111111111111..................111111111111...........',
      '......1.............................111..1.................1...........................1................1............11...11....',
      '...1111111111ii11111111111111111111111111111..............1111111111111111111111111111111......1........111111111111111111111...',
      '111..........ii.............................11............1................ii............1.....1.......1.....................111',
      '11111111111111111111111111111111111111111111111.....1.....11111111111111111ii1111111111111111.111.....11111111111111111111111111',
      '...............................................1...11....1...................................1...11...1.........................',
      '111111111111111111111111111111111111111111111111111111...11111111111111111111111111111111111111111111111111111111111111111111111',
      '......................................................111.......................................................................',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111ii1111111111111111',
      '..............................................................................................................11................',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111',
      '................................................................................................................................',
      '1111111111111111111111111111111111111111111111111111ii11111111111111111111111111111111111111111111111111111111111111111111111111',
      '....................................................11..........................................................................',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111',
      '................................................................................................................................',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111',
      '................................................................................................................................',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111',
      '................................................................................................................................',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111',
      '................................................................................................................................',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111',
      '................................................................................................................................',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111'
    ],
    [   // w1
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '...............1................................................................................................................',
      '...............1................................................................................................................',
      '...........11.1.1...............................................................................................................',
      '..........1111111...............................................................................................................',
      '.........1.......111...............................................1............................................................',
      '........1111111111111..............................................1............................................................',
      '........1...........1......1...................................1111.1...........................................................',
      '........11111111111111....11..................................11111111..........................................................',
      '........1.............11..1.1................................1........111.......................................................',
      '........111111111111111111111...............................11111111111111....................................1.................',
      '.......1.....................1..............................1............1.......1............................1.................',
      '.......1111111111111111111111111............................111111111111111.....11...........................11.................',
      '.......1........................1...........................1..............11...1.1..........................1.1................',
      '.......11111111111111111111111111...........................11111111111111111111111.......................111111................',
      '......1..........................1......1...................1......................11.....................1.....1111............',
      '......111111111111111111111111111111...11..................1111111111111111111111111111..................111111111111...........',
      '......1.............................111..1.................1...........................1................1............11...11....',
      '...1111111111ii11111111111111111111111111111..............1111111111111111111111111111111......1........111111111111111111111...',
      '111..........11.............................11............1................ii............1.....1.......1.....................111',
      '11111111111111111111111111111111111111111111111.....1.....11111111111111111111111111111111111.111.....11111111111111111111111111',
      '...............................................1...11....1...................................1...11...1.........................',
      '111111111111111111111111111111111111111111111111111111...11111111111111111111111111111111111111111111111111111111111111111111111',
      '......................................................111.......................................................................',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111ii1111111111111111',
      '..............................................................................................................ii................',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111',
      '................................................................................................................................',
      '1111111111111111111111111111111111111111111111111111ii11111111111111111111111111111111111111111111111111111111111111111111111111',
      '....................................................ii..........................................................................',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111',
      '................................................................................................................................',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111',
      '................................................................................................................................',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111',
      '................................................................................................................................',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111',
      '................................................................................................................................',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111',
      '................................................................................................................................',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111',
      '11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111'
    ]
  ]);

  // Mid rocks: SHADOW wherever they stand inside the plate band. A stand of stalagmites, a rock with an arch through
  // it and an open bay with a little rubble, all standing on the floor line; the far wall and the floor band show
  // between them. Below the band the rock round the arch is lit in BRONZE pixels, densest at its inner faces: the
  // light of the lantern that stands in the arch in sections 1 and 2, and under the remap crystal the DEEP_TEAL light of
  // the crystals that stand before it in section 3. Tiles every 128 px.
  define('bg_cave_mid', 128, 56, 0, 56, 0, 'wall', [
    [   // wall
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '................................................................................................................................',
      '...................111..........................................................................................................',
      '...................111..........................................................................................................',
      '..................11111.........................................................................................................',
      '..................11111.........................................................................................................',
      '..................11111.........................................................................................................',
      '..................11111.........................................................................................................',
      '..................11111.........................................................................................................',
      '.................1111111............................................1111........................................................',
      '.................1111111........................................11111111111.....................................................',
      '.................1111111.....................................1111111111111111.....111...........................................',
      '.................1111111.....................................1111111111111111.....111...........................................',
      '.................1111111....................................11111111111111111.....111...........................................',
      '................111111111...................................111111111111111111....111...........................................',
      '................111111111..................................1111111111111111111...11111..........................................',
      '................111111111.................................1111111111111111111111.11111..........................................',
      '................111111111...............................111111111111111111111111111111..........................................',
      '................111111111..............................1111111g111g111g111g11111111111..........................................',
      '................111111111..............................1111111111111111111111111111111..........................................',
      '................111111111..............................1g111g1g1g1g1g1g1g1g1g111g11111..........................................',
      '........111....11111111111.............................1111111111111111111111111111111..........................................',
      '........111....11111111111.............................111g1g1g1g1ggggggg1g1g1g11111111.........................................',
      '.......11111...11111111111.............................1111111111g......g11111111111111.........................................',
      '.......11111...11111111111.............................1g1g1g1g1g........gg1g1g1g111111.........................................',
      '.......11111...11111111111.............................111111g1g..........gg11111111111.........................................',
      '.......11111...11111111111............................g1g1g1g1g............gg1g1g1g11111........................................',
      '......1111111..11111111111...........................11111111g..............g1111111111111......................................',
      '......1111111.1111111111111...111...................g111g1g1gg..............g1g1g111g111111.....................................',
      '......1111111.1111111111111...111..................11111111gg................g1111111111111.....................................',
      '......1111111.1111111111111..11111.................111g1g1g1g................gg1g1g11111111.....................................',
      '......1111111.1111111111111..11111.................11111111gg................g1111111111111.....................................',
      '.....1111111111111111111111..11111.................1g1g1g1g1g................gg1g1g1g111111.....................................',
      '.....1111111111111111111111..11111.................11111111g..................g111111111111.....................................',
      '.....1111111111111111111111.1111111................111g1g1gg..................g1g1g11111111.....................................',
      '.....111111111111111111111111111111................11111111g..................g111111111111.....................................',
      '.....111111111111111111111111111111................11111g1gg..................g1g1111111111.....................................',
      '.....111111111111111111111111111111................11111111g..................g111111111111.....................................',
      '....1111111111111111111111111111111................1111111g1..................g111111111111.....................................',
      '....11111111111111111111111111111111..............111111111g..................g111111111111.....................................',
      '....11111111111111111111111111111111.............1111111g111..................11g11111111111....................................',
      '....11111111111111111111111111111111............11111111111g..................g11111111111111...................................',
      '....11111111111111111111111111111111...........1111111111111..................1111111111111111...............111................',
      '....11111111111111111111111111111111...........111111111111g..................g1111111111111111..............111................',
      '....11111111111111111111111111111111...........1111111111111..................11111111111111111..............111................',
      '...1111111111111111111111111111111111..........111111111111g..................g1111111111111111.............11111...............',
      '..111111111111111111111111111111111111.........1111111111111..................11111111111111111.............11111...............',
      '..111111111111111111111111111111111111.........1111111111111..................11111111111111111.............111111..............',
      '.11111111111111111111111111111111111111........1111111111111..................11111111111111111...........111111111.............',
      '111111111111111111111111111111111111111........1111111111111..................11111111111111111..........11111111111...........1',
      '111111111111111111111111111111111111111........1111111111111..................11111111111111111..........11111111111..........11',
      '111111111111111111111111111111111111111........1111111111111..................11111111111111111..........11111111111..........11'
    ]
  ]);

  // Roots of the meadow, hanging through the roof of section 1: SHADOW. A strip of earth with five thin roots of
  // unequal length hanging straight down from it. The piece is placed with its bottom at y 40, so its top 8 rows are
  // under the HUD and the roots end by y 40.
  define('bg_roots', 32, 24, 0, 24, 0, 'roots', [
    [   // roots
      '11111111111111111111111111111111',
      '11111111111111111111111111111111',
      '11111111111111111111111111111111',
      '11111111111111111111111111111111',
      '11111111111111111111111111111111',
      '11111111111111111111111111111111',
      '11111111111111111111111111111111',
      '11111111111111111111111111111111',
      '11111111111111111111111111111111',
      '.11111111111111111111111111111..',
      '...111.11111.1111111.1111.111...',
      '...11...111...11111...11...11...',
      '...1....11....111.1...11...1....',
      '...1....11.....11.....1....1....',
      '..11....1......11.....1....11...',
      '..1.....1......11.....11....1...',
      '..1.....11.....1.......1....1...',
      '.........1.....1.......1........',
      '.........1....11.......11.......',
      '..............1.........1.......',
      '..............1.................',
      '..............11................',
      '...............1................',
      '................................'
    ]
  ]);

  // Lantern on a post: a SHADOW frame and post, a GOLD flame with a CREAM heart inside an ORANGE glow at y 161 to
  // 166, and ORANGE sparks of glow around the glass. The lit side of the post is ORANGE, then BRONZE, down to a foot
  // that stands in a small pool of light, so the lamp stands on the floor. It is warmer and dimmer than haz_lantern,
  // the outlined lantern on a chain that Pip has to duck. The flame leans and the sparks shift between the two frames.
  // Each lantern stands in an arch of bg_cave_mid, whose rock carries the light that falls round it.
  define('bg_lantern', 16, 24, 0, 24, 3, 'l0 l1', [
    [   // l0
      '......1111......',
      '..h.11hhhh11.h..',
      '....1hhiihh1....',
      '.h.1hhiiiihh1.h.',
      '...1hiijjiih1...',
      '.h.1hhiiiihh1.h.',
      '....1hhiihh1....',
      '..h..111111..h..',
      '......1hh1......',
      '.......hh.......',
      '.......h1.......',
      '.......h1.......',
      '.......h1.......',
      '.......h1.......',
      '.......g1.......',
      '.......g1.......',
      '.......g1.......',
      '.......g1.......',
      '.......g1.......',
      '.......g1.......',
      '.......g1.......',
      '.......g1.......',
      '......g111......',
      '...ggg1111ggg...'
    ],
    [   // l1
      '......1111......',
      '....11hhhh11....',
      '..h.1hhiihh1.h..',
      '...1hiiiiihh1...',
      '.h.1hijjiiih1.h.',
      '...1hhiiiihh1...',
      '..h.1hhiihh1.h..',
      '.....111111.....',
      '......1hh1......',
      '.......hh.......',
      '.......h1.......',
      '.......h1.......',
      '.......h1.......',
      '.......h1.......',
      '.......g1.......',
      '.......g1.......',
      '.......g1.......',
      '.......g1.......',
      '.......g1.......',
      '.......g1.......',
      '.......g1.......',
      '.......g1.......',
      '......g111......',
      '...ggg1111ggg...'
    ]
  ]);

  // The big cog, where Level 1 has its windmill: twelve teeth and six thin spokes. It is SHADOW inside a 1 px BRONZE
  // line from top to bottom, the spokes are 1 px BRONZE lines, and the pin of the hub is 2 x 2 GOLD: its top 14 rows
  // stand inside the plate band, and below them the frog, the rolling gear and the pendulum pass in front of it. Each
  // frame is the wheel turned 15 degrees on.
  define('bg_cog_l', 48, 48, 0, 48, 4, 'c0 c1 c2 c3', [
    [   // c0
      '.....................gggggg.....................',
      '.....................g1111g.....................',
      '..............g......g1111g......g..............',
      '............ggg......g1111g......ggg............',
      '..........gg111g....g111111g....g111gg..........',
      '..........g11111gggg11111111gggg11111g..........',
      '...........g111111111111111111111111g...........',
      '...........g111111111111111111111111g...........',
      '...........g1111111gggggggggg1111111g...........',
      '..........g111111gg..........gg111111g..........',
      '....gg...g11111gg..............gg11111g...gg....',
      '....g1ggg11111g.g..............g.g11111ggg1g....',
      '...g111111111g...g............g...g111111111g...',
      '...g11111111g....g............g....g11111111g...',
      '..gg1111111g......g..........g......g1111111gg..',
      '....g11111g.......g..........g.......g11111g....',
      '.....g1111g........g........g........g1111g.....',
      '.....g111g..........g......g..........g111g.....',
      '.....g111g..........g......g..........g111g.....',
      '.....g11g............g.gg.g............g11g.....',
      '....g111g............gg11gg............g111g....',
      'gggg1111g...........g111111g...........g1111gggg',
      'g1111111g...........g111111g...........g1111111g',
      'g1111111g..........g111ii111g..........g1111111g',
      'g11111111ggggggggggg111ii111ggggggggggg11111111g',
      'g1111111g...........g111111g...........g1111111g',
      'gggg1111g...........g111111g...........g1111gggg',
      '....g111g............gg11gg............g111g....',
      '.....g11g............g.gg.g............g11g.....',
      '.....g111g..........g......g..........g111g.....',
      '.....g111g..........g......g..........g111g.....',
      '.....g1111g........g........g........g1111g.....',
      '....g11111g.......g..........g.......g11111g....',
      '..gg1111111g......g..........g......g1111111gg..',
      '...g11111111g....g............g....g11111111g...',
      '...g111111111g...g............g...g111111111g...',
      '....g1ggg11111g.g..............g.g11111ggg1g....',
      '....gg...g11111gg..............gg11111g...gg....',
      '..........g111111gg..........gg111111g..........',
      '...........g1111111gggggggggg1111111g...........',
      '...........g111111111111111111111111g...........',
      '...........g111111111111111111111111g...........',
      '..........g11111gggg11111111gggg11111g..........',
      '..........gg111g....g111111g....g111gg..........',
      '............ggg......g1111g......ggg............',
      '..............g......g1111g......g..............',
      '.....................g1111g.....................',
      '.....................gggggg.....................'
    ],
    [   // c1
      '................................................',
      '................ggggg......ggggg................',
      '...............g1111g......g1111g...............',
      '................g111g......g111g................',
      '................g1111gggggg1111g................',
      '................g11111111111111g................',
      '........gg....gg1111111111111111gg....gg........',
      '.......g11g..g11111111111111111111g..g11g.......',
      '......g1111gg111111g1gggggggg111111gg1111g......',
      '......g1111111111gg.g........gg1111111111g......',
      '.......g1111111gg...g..........gg1111111g.......',
      '........g11111g.....g............g11111g........',
      '........g1111g......g.............g1111g........',
      '.......g1111g........g............gg1111g.......',
      '......g1111g.........g...........g..g1111g......',
      '..g...g111g..........g..........g....g111g...g..',
      '.g1ggg1111g...........g........g.....g1111ggg1g.',
      '.g1111111g............g.......g.......g1111111g.',
      '.g1111111g............g......g........g1111111g.',
      '.g111111g.............ggg...g..........g111111g.',
      '.ggg11111gggg........g111ggg...........g1111ggg.',
      '....g111g....ggg....g111111g...........g111g....',
      '....g111g.......gggg1111111g...........g111g....',
      '....g111g..........g111ii111g..........g111g....',
      '....g111g..........g111ii111g..........g111g....',
      '....g111g...........g1111111gggg.......g111g....',
      '....g111g...........g111111g....ggg....g111g....',
      '.ggg1111g...........ggg111g........gggg11111ggg.',
      '.g111111g..........g...ggg.............g111111g.',
      '.g1111111g........g......g............g1111111g.',
      '.g1111111g.......g.......g............g1111111g.',
      '.g1ggg1111g.....g........g...........g1111ggg1g.',
      '..g...g111g....g..........g..........g111g...g..',
      '......g1111g..g...........g.........g1111g......',
      '.......g1111gg............g........g1111g.......',
      '........g1111g.............g......g1111g........',
      '........g11111g............g.....g11111g........',
      '.......g1111111gg..........g...gg1111111g.......',
      '......g1111111111gg........g.gg1111111111g......',
      '......g1111gg111111gggggggg1g111111gg1111g......',
      '.......g11g..g11111111111111111111g..g11g.......',
      '........gg....gg1111111111111111gg....gg........',
      '................g11111111111111g................',
      '................g1111gggggg1111g................',
      '................g111g......g111g................',
      '...............g1111g......g1111g...............',
      '................ggggg......ggggg................',
      '................................................'
    ],
    [   // c2
      '.....................gggggg.....................',
      '.....................g1111g.....................',
      '..............g......g1111g......g..............',
      '............ggg......g1111g......ggg............',
      '..........gg111g....g111111g....g111gg..........',
      '..........g11111gggg11111111gggg11111g..........',
      '...........g111111111111111111111111g...........',
      '...........g111111111111111111111111g...........',
      '...........g1111111gggg1ggggg1111111g...........',
      '..........g111111gg....g.....gg111111g..........',
      '....gg...g11111gg......g.......gg11111g...gg....',
      '....g1ggg11111g........g.........g11111ggg1g....',
      '...g111111111g.........g..........g111111111g...',
      '...g11111111g...........g..........g11111111g...',
      '..gg1111111g............g...........g1111111gg..',
      '....g11111g.............g............g11111g....',
      '.....g1111gg............g...........gg1111g.....',
      '.....g111g..gg..........g.........gg..g111g.....',
      '.....g111g....gg........g.......gg....g111g.....',
      '.....g11g.......g......gg......g.......g11g.....',
      '....g111g........gg..gg11gg..gg........g111g....',
      'gggg1111g..........gg111111gg..........g1111gggg',
      'g1111111g...........g111111g...........g1111111g',
      'g1111111g..........g111ii111g..........g1111111g',
      'g1111111g..........g111ii111g..........g1111111g',
      'g1111111g...........g111111g...........g1111111g',
      'gggg1111g..........gg111111gg..........g1111gggg',
      '....g111g........gg..gg11gg..gg........g111g....',
      '.....g11g.......g......gg......g.......g11g.....',
      '.....g111g....gg........g.......gg....g111g.....',
      '.....g111g..gg..........g.........gg..g111g.....',
      '.....g1111gg............g...........gg1111g.....',
      '....g11111g.............g............g11111g....',
      '..gg1111111g............g...........g1111111gg..',
      '...g11111111g...........g..........g11111111g...',
      '...g111111111g..........g.........g111111111g...',
      '....g1ggg11111g.........g........g11111ggg1g....',
      '....gg...g11111gg.......g......gg11111g...gg....',
      '..........g111111gg.....g....gg111111g..........',
      '...........g1111111ggggg1gggg1111111g...........',
      '...........g111111111111111111111111g...........',
      '...........g111111111111111111111111g...........',
      '..........g11111gggg11111111gggg11111g..........',
      '..........gg111g....g111111g....g111gg..........',
      '............ggg......g1111g......ggg............',
      '..............g......g1111g......g..............',
      '.....................g1111g.....................',
      '.....................gggggg.....................'
    ],
    [   // c3
      '................................................',
      '................ggggg......ggggg................',
      '...............g1111g......g1111g...............',
      '................g111g......g111g................',
      '................g1111gggggg1111g................',
      '................g11111111111111g................',
      '........gg....gg1111111111111111gg....gg........',
      '.......g11g..g11111111111111111111g..g11g.......',
      '......g1111gg111111gggggggg1g111111gg1111g......',
      '......g1111111111gg........g.gg1111111111g......',
      '.......g1111111gg..........g...gg1111111g.......',
      '........g11111g............g.....g11111g........',
      '........g1111g.............g......g1111g........',
      '.......g1111gg............g........g1111g.......',
      '......g1111g..g...........g.........g1111g......',
      '..g...g111g....g..........g..........g111g...g..',
      '.g1ggg1111g.....g........g...........g1111ggg1g.',
      '.g1111111g.......g.......g............g1111111g.',
      '.g1111111g........g......g............g1111111g.',
      '.g111111g..........g...ggg.............g111111g.',
      '.ggg1111g...........ggg111g........gggg11111ggg.',
      '....g111g...........g111111g....ggg....g111g....',
      '....g111g...........g1111111gggg.......g111g....',
      '....g111g..........g111ii111g..........g111g....',
      '....g111g..........g111ii111g..........g111g....',
      '....g111g.......gggg1111111g...........g111g....',
      '....g111g....ggg....g111111g...........g111g....',
      '.ggg11111gggg........g111ggg...........g1111ggg.',
      '.g111111g.............ggg...g..........g111111g.',
      '.g1111111g............g......g........g1111111g.',
      '.g1111111g............g.......g.......g1111111g.',
      '.g1ggg1111g...........g........g.....g1111ggg1g.',
      '..g...g111g..........g..........g....g111g...g..',
      '......g1111g.........g...........g..g1111g......',
      '.......g1111g........g............gg1111g.......',
      '........g1111g......g.............g1111g........',
      '........g11111g.....g............g11111g........',
      '.......g1111111gg...g..........gg1111111g.......',
      '......g1111111111gg.g........gg1111111111g......',
      '......g1111gg111111g1gggggggg111111gg1111g......',
      '.......g11g..g11111111111111111111g..g11g.......',
      '........gg....gg1111111111111111gg....gg........',
      '................g11111111111111g................',
      '................g1111gggggg1111g................',
      '................g111g......g111g................',
      '...............g1111g......g1111g...............',
      '................ggggg......ggggg................',
      '................................................'
    ]
  ]);

  // Standpipe: it rises to y 136 and bends to an open mouth on the right. It is SHADOW inside a 1 px BRONZE line from
  // top to bottom; its top 14 rows stand inside the plate band. Below y 150 it has three flanges, drawn in the same
  // line, with two GOLD rivets each.
  define('bg_pipe_v', 16, 48, 0, 48, 0, 'pipe', [
    [   // pipe
      '.............ggg',
      '.............g1g',
      '....ggggggggg11g',
      '...g11111111111g',
      '..g111111111111g',
      '..g111111111111g',
      '..g111111111111g',
      '..g111111111111g',
      '..g111111111111g',
      '..g1111111ggg11g',
      '..g111111g...g1g',
      '..g111111g...ggg',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      'gggggggggggg....',
      'g1i111111i1g....',
      'gggggggggggg....',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      'gggggggggggg....',
      'g1i111111i1g....',
      'gggggggggggg....',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      '..g111111g......',
      'gggggggggggg....',
      'g1i111111i1g....',
      'gggggggggggg....'
    ]
  ]);

  // Crystal cluster: DEEP_TEAL shards with a TEAL lit face 2 px wide and an AQUA glint on the upper part of each lit
  // edge. No outline and no CORAL, and two steps dimmer than haz_crystal, the outlined AQUA cluster that Pip has to
  // jump, so that the two are told apart when one stands in front of the other. Its body is not the TEAL of Pip's
  // tunic either, since he runs in front of one for a good part of section 3.
  define('bg_crystal_l', 32, 24, 0, 24, 0, 'crystal', [
    [   // crystal
      '................................',
      '................b...............',
      '...............ba9..............',
      '...............ba9..............',
      '..............baa99.............',
      '..............baa99.............',
      '..............aa999.....b.......',
      '.....b.......aa99999...ba9......',
      '....ba9......aa99999...ba9......',
      '....ba9......aa99999..baa9......',
      '....aa99.....aa99999..aa999.....',
      '....aa99.....aa99999..aa999.....',
      '.....aa99....aa99999.aa9999.....',
      '.....aa99....aa99999.aa9999.....',
      '.....aa999...aa99999.aa999......',
      '......aa99...aa999999aa999......',
      '......aa999..aa999999aa999......',
      '......aa999..aa99999aa999..b....',
      '.......aa999.aa99999aa999.ba9...',
      '..b....aa999.aa9999aa999..aa9...',
      '.ba9....aa999aa9999aa999.aa99...',
      '.aa99...aa999aa99aa9999..aa999..',
      '.aa999..aa999aa99aa9999.aa9999..',
      '9aa9999999aa99aa9aa99999aa999999'
    ]
  ]);

  // Stalagmite: a tall spike and a short one in SHADOW, with a STONE face on the lit third of each. It is kept dark
  // so that it reads as rock at the back and not as a spike in Pip's way. L4, sections 1 and 3.
  define('bg_stalagmite', 16, 24, 0, 24, 0, 'spike', [
    [   // spike
      '................',
      '......2.........',
      '.....211........',
      '.....211........',
      '.....2211.......',
      '....22111.......',
      '....22211.......',
      '....222111......',
      '...2221111......',
      '....222111......',
      '...22211111.....',
      '...22221111.....',
      '..222211111.....',
      '..222111111..2..',
      '...222211111.21.',
      '..2222111111211.',
      '..2222111111221.',
      '.222211111112211',
      '.222221111112211',
      '.222211111122111',
      '..22221111112211',
      '.222221111122111',
      '2222211111122111',
      '2222221111122111'
    ]
  ]);

  // Pipe run: a SHADOW pipe inside a 1 px BRONZE line, as the standpipe is drawn, with a collar at each end and a
  // clamp on a foot in the middle. It stands in the 24 px above the floor, where the ground creatures, the rolling gear
  // and the mouth of haz_pipe are, so it has no fill brighter than SHADOW and no GOLD. Two stand side by side, their
  // collars meeting as a flanged joint; the stub of bg_baronpeek joins the left collar of the first.
  define('bg_pipe_h', 32, 16, 0, 16, 0, 'pipe', [
    [   // pipe
      '.gg..........................gg.',
      '.gg..........................gg.',
      'gggggggggggggggggggggggggggggggg',
      'g1g11111111111g11g11111111111g1g',
      'g1g11111111111g11g11111111111g1g',
      'g1g11111111111g11g11111111111g1g',
      'g1g11111111111g11g11111111111g1g',
      'g1g11111111111g11g11111111111g1g',
      'g1g11111111111g11g11111111111g1g',
      'ggggggggggggggg11ggggggggggggggg',
      '.gg...........g11g...........gg.',
      '..............g11g..............',
      '..............g11g..............',
      '..............g11g..............',
      '.............gg11gg.............',
      '.............g1111g.............'
    ]
  ]);

  // The Baron at the open end of the pipe run, in his spare helmet, a size too big: GOLD helmet with a WHITE lamp,
  // SOIL fur, PINK nose and paw, WHITE monocle and moustache. The pipe he looks out of is drawn as the run is: SHADOW
  // inside a 1 px BRONZE line, with a BRONZE collar round its mouth. out: he looks out towards Pip. in: he has ducked
  // back and only his nose, his moustache and the peak of the helmet show.
  define('bg_baronpeek', 16, 16, 0, 16, 1, 'out in', [
    [   // out
      '....iiiii.......',
      '...iiiiiiiig....',
      '..4iiiiiiiiggggg',
      '..iiiiiiiiig1111',
      '.iiiiiiiiiig1111',
      '.ggggggggggg1111',
      '...ll44lllll1111',
      '.rlll41lllll1111',
      'rrllllllllll1111',
      '.4444llllrrlgggg',
      '..44.....rrg....',
      '................',
      '................',
      '................',
      '................',
      '................'
    ],
    [   // in
      '................',
      '........gg......',
      '........gggggggg',
      '......iiig111111',
      '.....giiig111111',
      '.....rllig111111',
      '....rrllig111111',
      '.....44lgg111111',
      '......4.gg111111',
      '........gggggggg',
      '........gg......',
      '................',
      '................',
      '................',
      '................',
      '................'
    ]
  ]);

  // The Baron's rails, behind the floor line: a SHADOW rail on SHADOW sleepers, spaced as the sleepers of tile_rail
  // are, with two short SILVER glints on the rail head in every 32 px. The head is not one bright line: the piece is
  // drawn behind the play plane, so it runs across every open gap 4 px above the floor, and a bright line there reads
  // as something to run along. Tiles every 32 px.
  define('bg_rail', 32, 8, 0, 8, 0, 'rail', [
    [   // rail
      '................................',
      '................................',
      '................................',
      '................................',
      '11333311111111111113311111111111',
      '11111111111111111111111111111111',
      '.111111..111111..111111..111111.',
      '.111111..111111..111111..111111.'
    ]
  ]);

  // Boiler: a SHADOW tank inside a 1 px BRONZE line, with two BRONZE hoops, a gauge and a firebox door drawn as BRONZE
  // rings. Its only lights are the CREAM needle of the gauge and two GOLD sparks among the BRONZE embers, a pixel each:
  // the rolling gear passes its foot and the pendulum its gauge, and they must be the brightest things there. It is not
  // to be taken for the engine Lady Ratchet stands in either. The needle quivers and the sparks change places between
  // the two frames. L4, the arena.
  define('bg_boiler', 32, 32, 0, 32, 2, 'b0 b1', [
    [   // b0
      '.............gggg...............',
      '.............g11g...............',
      '..........ggggggggggg...........',
      '........gg11111111111gg.........',
      '.......g111111111111111g........',
      '......g11111111111111111g.......',
      '.....g1111111111111111111g......',
      '.....ggggggggggggggggggggg......',
      '.....g11111111111111111111g.....',
      '.....g111111gggg1111111111g.....',
      '.....g11111g1111g111111111g.....',
      '.....g1111g1j1111g11111111g.....',
      '.....g1111g11j111g11111111g.....',
      '.....g1111g111j11g11111111g.....',
      '.....g1111g111111g11111111g.....',
      '.....g11111g1111g111111111g.....',
      '.....g111111gggg1111111111g.....',
      '.....g11111111111111111111g.....',
      '.....gggggggggggggggggggggg.....',
      '.....g11111111111111111111g.....',
      '.....g11111ggggggg11111111g.....',
      '.....g1111g1111111g1111111g.....',
      '.....g1111g1111111g1111111g.....',
      '.....g1111g1111gi1g1111111g.....',
      '.....g1111g1gig1g1g1111111g.....',
      '.....g1111ggggggggg1111111g.....',
      '.....g11111111111111111111g.....',
      '.....ggggggggggggggggggggg......',
      '......g111..........g111........',
      '......g111..........g111........',
      '.....g1111.........g1111........',
      '.....g11111........g11111.......'
    ],
    [   // b1
      '.............gggg...............',
      '.............g11g...............',
      '..........ggggggggggg...........',
      '........gg11111111111gg.........',
      '.......g111111111111111g........',
      '......g11111111111111111g.......',
      '.....g1111111111111111111g......',
      '.....ggggggggggggggggggggg......',
      '.....g11111111111111111111g.....',
      '.....g111111gggg1111111111g.....',
      '.....g11111g1111g111111111g.....',
      '.....g1111g111j11g11111111g.....',
      '.....g1111g111j11g11111111g.....',
      '.....g1111g111j11g11111111g.....',
      '.....g1111g111111g11111111g.....',
      '.....g11111g1111g111111111g.....',
      '.....g111111gggg1111111111g.....',
      '.....g11111111111111111111g.....',
      '.....gggggggggggggggggggggg.....',
      '.....g11111111111111111111g.....',
      '.....g11111ggggggg11111111g.....',
      '.....g1111g1111111g1111111g.....',
      '.....g1111g1111111g1111111g.....',
      '.....g1111g1ig1111g1111111g.....',
      '.....g1111g1gg1ig1g1111111g.....',
      '.....g1111ggggggggg1111111g.....',
      '.....g11111111111111111111g.....',
      '.....ggggggggggggggggggggg......',
      '......g111..........g111........',
      '......g111..........g111........',
      '.....g1111.........g1111........',
      '.....g11111........g11111.......'
    ]
  ]);

  // Small crystals: two DEEP_TEAL shards with a TEAL lit face and an AQUA glint at the tip. L4, section 3.
  define('bg_crystal_s', 16, 16, 0, 16, 0, 'crystal', [
    [   // crystal
      '................',
      '................',
      '................',
      '......b.........',
      '.....ba9........',
      '.....ba9........',
      '.....aa9........',
      '....aa999.......',
      '....aa999.......',
      '....aa999..b....',
      '....aa999.ba9...',
      '....aa999.aa9...',
      '....aa999.aa9...',
      '....aa999.aa9...',
      '....aa999.aa99..',
      '...aa9999.aa99..'
    ]
  ]);

  // Foreground stalagmite stumps: STONE on the lit side, SHADOW on the other. L6, drawn under the type bar.
  define('fg_stalagmite', 16, 8, 0, 8, 0, 't0 t1', [
    [   // t0
      '................',
      '....22..........',
      '...2221.....2...',
      '...22211...221..',
      '..222211...2211.',
      '..2222111.222111',
      '.22222111.222111',
      '2222221112222111'
    ],
    [   // t1
      '................',
      '..........22....',
      '.........2221...',
      '..2......22211..',
      '.221....222211..',
      '.2211...2222111.',
      '222111.22222111.',
      '2221111222221111'
    ]
  ]);

  // ---------------------------------------------------------------------------------------------
  // Backdrop (CONTRACT 6.5): parallax layers of Level 2. All positions are screen px; `x` is the left
  // of the piece and `y` its bottom. The first band of each sky is the plate band and runs from y 0:
  // the renderer applies slowSky and the phase colour to the first band only.
  // ---------------------------------------------------------------------------------------------

  TG.Backdrops.cavern = {
    palettes: {
      // Section 1: PLUM, dithered towards SHADOW over the floor band. Hourglass: the band turns DEEP_BLUE.
      lantern: {
        sky: [ { y: 0, h: 150, color: 28 }, { y: 150, h: 34, color: 28, dither: 1 } ],
        remap: null,
        slowSky: 5
      },
      // Section 2: the same bands, with the remap brass.
      brass: {
        sky: [ { y: 0, h: 150, color: 28 }, { y: 150, h: 34, color: 28, dither: 1 } ],
        remap: 'brass',
        slowSky: 5
      },
      // Section 3: DEEP_BLUE, dithered towards DEEP_TEAL over the floor band. Hourglass: the band turns PLUM.
      crystal: {
        sky: [ { y: 0, h: 150, color: 5 }, { y: 150, h: 34, color: 5, dither: 9 } ],
        remap: 'crystal',
        slowSky: 28
      },
      // Boss arena: PLUM over a furnace glow of MAROON and PLUM, with small cogs for stars and the clock face
      // for a moon. The band changes once per boss phase: PLUM, PLUM with a MAROON dither, INK with a PLUM dither.
      clock: {
        sky: [ { y: 0, h: 150, color: 28 }, { y: 150, h: 34, color: 24, dither: 28 } ],
        remap: 'brass',
        slowSky: 5,
        phases: { 2: { color: 28, dither: 24 }, 3: { color: 0, dither: 28 } },
        starSprite: 'bg_gearstar',
        stars: [
          { x: 22, y: 72 }, { x: 58, y: 112 }, { x: 118, y: 64 }, { x: 166, y: 100 },
          { x: 204, y: 128 }, { x: 236, y: 76 }, { x: 258, y: 116 }, { x: 350, y: 124 }
        ],
        moonSprite: 'bg_clockface',
        moon: { x: 328, y: 84 }     // x 328 to 376, y 36 to 84: clear of every boss plate (LEVEL2 3.1)
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
        { sprite: 'bg_cave_mid',  x: 0,   y: 184, sections: [0, 1, 2] },   // the clock hall has no rocks: it is a built room
        { sprite: 'bg_cave_mid',  x: 128, y: 184, sections: [0, 1, 2] },
        { sprite: 'bg_cave_mid',  x: 256, y: 184, sections: [0, 2] },      // the Gear Hall is more open than the caves
        { sprite: 'bg_roots',     x: 40,  y: 40,  sections: [0] },
        { sprite: 'bg_roots',     x: 170, y: 40,  sections: [0] },
        { sprite: 'bg_roots',     x: 300, y: 40,  sections: [0] },
        // Sections 2 and 3 are too deep for roots. Four rock rims hint at the roof there (haz_ceiling, the rim
        // that the hazards hang from); without them the band reads as open sky. Each ends above a hazard's own rim,
        // whose bottom is at y 36.
        { sprite: 'haz_ceiling',  x: 8,   y: 32,  sections: [1, 2] },
        { sprite: 'haz_ceiling',  x: 96,  y: 34,  sections: [1, 2] },
        { sprite: 'haz_ceiling',  x: 214, y: 30,  sections: [1, 2] },
        { sprite: 'haz_ceiling',  x: 296, y: 34,  sections: [1, 2] },
        { sprite: 'bg_lantern',   x: 61,  y: 184, sections: [0, 1] },      // one in each arch, which its light falls on
        { sprite: 'bg_lantern',   x: 189, y: 184, sections: [0, 1] },
        { sprite: 'bg_lantern',   x: 317, y: 184, sections: [0] },
        { sprite: 'bg_cog_l',     x: 214, y: 184, sections: [1, 3] },      // in the second bay
        { sprite: 'bg_pipe_v',    x: 104, y: 184, sections: [1] },         // in the first and third bays
        { sprite: 'bg_pipe_v',    x: 360, y: 184, sections: [1] },
        { sprite: 'bg_crystal_l', x: 53,  y: 184, sections: [2] },         // one before each arch, which its light falls on
        { sprite: 'bg_crystal_l', x: 181, y: 184, sections: [2] },
        { sprite: 'bg_crystal_l', x: 309, y: 184, sections: [2] }
      ] },
      { id: 'near', factor: 0.7, drift: 0, repeat: 384, items: [
        { sprite: 'bg_molehill',   x: 60,  y: 184, sections: [0] },
        { sprite: 'bg_molehill',   x: 200, y: 184, sections: [0] },
        { sprite: 'bg_molehill',   x: 330, y: 184, sections: [0] },
        { sprite: 'bg_stalagmite', x: 20,  y: 184, sections: [0, 2] },
        { sprite: 'bg_stalagmite', x: 250, y: 184, sections: [0, 2] },
        { sprite: 'bg_pipe_h',     x: 96,  y: 184, sections: [1, 3] },
        { sprite: 'bg_pipe_h',     x: 128, y: 184, sections: [1, 3] },
        { sprite: 'bg_boiler',     x: 40,  y: 184, sections: [3] },
        { sprite: 'bg_boiler',     x: 232, y: 184, sections: [3] },
        { sprite: 'bg_crystal_s',  x: 110, y: 184, sections: [2] },
        { sprite: 'bg_crystal_s',  x: 210, y: 184, sections: [2] },
        { sprite: 'bg_crystal_s',  x: 340, y: 184, sections: [2] }
      ] },
      // The Baron, at the open left end of a pipe run. The layer has the factor of `near` and four times its repeat,
      // so he is at every fourth run: he comes by three times in the Gear Hall. In `near`, whose repeat is the width
      // of the screen, one of him was on screen at every moment, in a mole's colours, where the creatures walk.
      { id: 'peek', factor: 0.7, drift: 0, repeat: 1536, items: [
        { sprite: 'bg_baronpeek', x: 464, y: 184, sections: [1] }          // 16 px left of the run at 96 + 384
      ] },
      { id: 'rails', factor: 0.7, drift: 0, repeat: 32, items: [
        { sprite: 'bg_rail', x: 0, y: 184, sections: [2] }       // not the arena, which has tile_rail on the play plane
      ] },
      { id: 'fg', factor: 1.3, drift: 0, repeat: 256, front: true, items: [
        { sprite: 'fg_stalagmite', x: 16,  y: 216, sections: [0, 2] },   // rock: the two cave sections only
        { sprite: 'fg_stalagmite', x: 120, y: 216, sections: [0, 2] },
        { sprite: 'fg_stalagmite', x: 200, y: 216, sections: [0, 2] }
      ] }
    ]
  };

})(typeof window !== 'undefined' ? window : globalThis);
