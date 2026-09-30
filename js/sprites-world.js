// js/sprites-world.js
// SPELL RUNNER world art (WP-D): tiles, hazards, signs, items, effects, icons and backdrop pieces,
// the remaps `sunset` and `dusk`, and the backdrop `meadow`. CONTRACT 6.1 to 6.5, DESIGN 14.
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
})(typeof window !== 'undefined' ? window : globalThis);
