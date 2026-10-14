// js/sprites-chars.js
// Sprite and remap definitions for the characters (WP-C): Pip, the ink effects of his quill, the
// enemies, the Baron and his projectiles. CONTRACT 6.1 to 6.4, DESIGN 4.2, 11.6 and 14.
//
// Format (CONTRACT 6.1): every frame is h strings of w characters. '.' is transparent; any other
// character is a palette key from TG.PAL_KEYS:
//
//   0 INK        1 SHADOW   2 STONE    3 SILVER   4 WHITE    5 DEEP_BLUE  6 ROYAL   7 SKY
//   8 HAZE       9 DEEP_TEAL a TEAL    b AQUA     c PINE     d FOREST     e GRASS   f LIME
//   g BRONZE     h ORANGE   i GOLD     j CREAM    k BARK     l SOIL       m CLAY    n SAND
//   o MAROON     p RED      q CORAL    r PINK     s PLUM     t VIOLET     u LILAC   v PEACH
//
// Drawing rules followed here (CONTRACT 6.2, DESIGN 14.1):
//   - Pip faces right. Enemies, projectiles and the Baron face left, towards Pip.
//   - Every sprite has a 1 px INK outline: an opaque pixel next to a transparent one (left, right,
//     above or below), or on the edge of the frame, is INK. The one exception is the bottom row of
//     hero_cast, which lies on top of the run frame and is not an outer edge.
//   - Colours: Pip uses RED, TEAL, DEEP_TEAL, PEACH and WHITE. Each enemy and projectile uses three
//     colours. The Baron's parts use SOIL, CLAY, PINK, GOLD, WHITE and RED between them. CREAM appears
//     only as the glass of the lamp on boss_head, in all four frames, so that the remap `lampred`
//     changes the lamp and nothing else.
//   - Frames of one sprite keep the same ground line: the lowest opaque row is the last row of the
//     frame (except where the pose leaves the ground, as in hero_jump and the leap of en_hoppet).
//   - Rows 0 to 11 of every hero_run frame are the same, and hero_cast (16x12, same anchor) covers
//     every opaque pixel of those rows, so the overlay fits on any run frame.
//
// Level 2 (docs/LEVEL2.md 2, 3 and Appendix C) adds the remap `tin` and two marked regions: the
// creatures after the Level 1 enemies, and Lady Ratchet with her projectiles at the end of the file.
//   - Its sprites are drawn without a section's remap on PLUM and on DEEP_BLUE, where an INK outline
//     does not separate a sprite from the backdrop. None uses PLUM, DEEP_BLUE, SHADOW, MAROON or
//     DEEP_TEAL for a body, a wing or a limb (LEVEL2 3.1, rule 2).
//   - Lady Ratchet's parts use STONE, TEAL, GOLD, PINK, WHITE and BRONZE between them. CREAM appears
//     only as the lenses of her goggles, on boss2_head and on boss2_goggles, so that `lampred` changes
//     the lenses and nothing else.
//
// Nothing here runs at load time except these definitions.
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  // ---------------------------------------------------------------------------------------------
  // Remaps (CONTRACT 6.3)
  // ---------------------------------------------------------------------------------------------

  // Hit flash: every opaque pixel becomes WHITE.
  TG.Remaps.white = { '*': 4 };

  // Pip with the Golden quill: RED to GOLD, MAROON to BRONZE.
  TG.Remaps.gold = { 25: 18, 24: 16 };

  // The Baron's lamp from phase 2: CREAM to RED.
  TG.Remaps.lampred = { 19: 25 };

  // Unselected menu panels: each colour to a darker neighbour. Light colours go to STONE (2), mid
  // colours to SHADOW (1), dark colours to INK (0).
  TG.Remaps.dim = {
    0: 0,    // INK        dark
    1: 0,    // SHADOW     dark
    2: 1,    // STONE      mid
    3: 2,    // SILVER     light
    4: 2,    // WHITE      light
    5: 0,    // DEEP_BLUE  dark
    6: 1,    // ROYAL      mid
    7: 1,    // SKY        mid
    8: 2,    // HAZE       light
    9: 0,    // DEEP_TEAL  dark
    10: 1,   // TEAL       mid
    11: 2,   // AQUA       light
    12: 0,   // PINE       dark
    13: 1,   // FOREST     mid
    14: 1,   // GRASS      mid
    15: 2,   // LIME       light
    16: 1,   // BRONZE     mid
    17: 1,   // ORANGE     mid
    18: 2,   // GOLD       light
    19: 2,   // CREAM      light
    20: 0,   // BARK       dark
    21: 1,   // SOIL       mid
    22: 1,   // CLAY       mid
    23: 2,   // SAND       light
    24: 0,   // MAROON     dark
    25: 1,   // RED        mid
    26: 1,   // CORAL      mid
    27: 2,   // PINK       light
    28: 0,   // PLUM       dark
    29: 1,   // VIOLET     mid
    30: 2,   // LILAC      light
    31: 2    // PEACH      light
  };

  // Level 2 (LEVEL2 3.6): the frog and its lily pad, through theme.skins. GRASS to SILVER, LIME to WHITE,
  // WHITE to GOLD and FOREST to STONE, so that en_hoppet reads as a wind-up tin frog with brass eyes and
  // fx_lilypad, whose underside is FOREST, as a tin disc. A colour that is not listed is unchanged.
  // The pairs are not those of LEVEL2 Appendix C (GRASS to BRONZE, LIME to GOLD, WHITE to SILVER): a
  // BRONZE and GOLD frog was lost on the brass floor of the Gear Hall, and that table left the pad's
  // underside green.
  TG.Remaps.tin = { 14: 3, 15: 4, 4: 18, 13: 2 };

  // ---------------------------------------------------------------------------------------------
  // Pip
  // ---------------------------------------------------------------------------------------------

  // Pip running: RED cap and scarf, TEAL and DEEP_TEAL tunic, PEACH face, WHITE quill and cap band.
  // Three leg poses (contact, down, pass), each twice; the scarf flaps on its own cycle, so all six frames
  // differ. Rows 0 to 11 are the same in every frame. The tip of the quill is the pixel at (14, 1), which
  // is 6 px right of and 23 px above the anchor; ink_spark and ink_bolt start there.
  TG.Sprites.define('hero_run', {
    w: 16, h: 24, anchor: [8, 24], fps: 12, owner: 'C',
    names: ['r0', 'r1', 'r2', 'r3', 'r4', 'r5'],
    frames: [
      [
        '....00000.....0.',
        '..00ppppp00..040',
        '.0pp44ppppp00440',
        '0pp4pppppppp0440',
        '0ppppppppppp4440',
        '0pp4444444444440',
        '.000vvvvvvvv440.',
        '.00vvv40v40v440.',
        '.0v0vv40v40v40..',
        '.0v0vv40v40v40..',
        '.0vvvvvvvvvv40..',
        '000vvvvvv00vv0..',
        '0p00vvvvv0avv0..',
        '0pppppppppa00...',
        '09aaaaaaaaa0....',
        '09aaaaaaaa0.....',
        '09aaaaaaaa0.....',
        '.0999999490.....',
        '.0aaaaaaaa00....',
        '..00990000990...',
        '..0990....0990..',
        '.0pp0.....0ppp0.',
        '0ppp0.....0ppp0.',
        '.000.......000..'
      ],
      [
        '....00000.....0.',
        '..00ppppp00..040',
        '.0pp44ppppp00440',
        '0pp4pppppppp0440',
        '0ppppppppppp4440',
        '0pp4444444444440',
        '.000vvvvvvvv440.',
        '.00vvv40v40v440.',
        '.0v0vv40v40v40..',
        '.0v0vv40v40v40..',
        '.0vvvvvvvvvv40..',
        '..0vvvvvv00vv0..',
        '0000vvvvv0avv0..',
        '0pppppppppa00...',
        '09aaaaaaaaa0....',
        '09aaaaaaaa0.....',
        '09aaaaaaaa0.....',
        '.0999999490.....',
        '.0aaaaaaaa0.....',
        '..0999000990....',
        '.09900..0990....',
        '0ppp0...0ppp0...',
        '.000....0ppp0...',
        '.........000....'
      ],
      [
        '....00000.....0.',
        '..00ppppp00..040',
        '.0pp44ppppp00440',
        '0pp4pppppppp0440',
        '0ppppppppppp4440',
        '0pp4444444444440',
        '.000vvvvvvvv440.',
        '.00vvv40v40v440.',
        '.0v0vv40v40v40..',
        '.0v0vv40v40v40..',
        '.0vvvvvvvvvv40..',
        '..0vvvvvv00vv0..',
        '0.00vvvvv0avv0..',
        '00ppppppppa00...',
        '0paaaaaaaaa0....',
        '09aaaaaaaa0.....',
        '09aaaaaaaa0.....',
        '.0999999490.....',
        '.0aaaaaaaa0.....',
        '..000999990.....',
        '....0pp0990.....',
        '....0pp0990.....',
        '.....00ppp0.....',
        '.......000......'
      ],
      [
        '....00000.....0.',
        '..00ppppp00..040',
        '.0pp44ppppp00440',
        '0pp4pppppppp0440',
        '0ppppppppppp4440',
        '0pp4444444444440',
        '.000vvvvvvvv440.',
        '.00vvv40v40v440.',
        '.0v0vv40v40v40..',
        '.0v0vv40v40v40..',
        '.0vvvvvvvvvv40..',
        '..0vvvvvv00vv0..',
        '0000vvvvv0avv0..',
        '0pppppppppa00...',
        '09aaaaaaaaa0....',
        '09aaaaaaaa0.....',
        '09aaaaaaaa0.....',
        '.0999999490.....',
        '.0aaaaaaaa00....',
        '..00990000990...',
        '..0990....0990..',
        '.0pp0.....0ppp0.',
        '0ppp0.....0ppp0.',
        '.000.......000..'
      ],
      [
        '....00000.....0.',
        '..00ppppp00..040',
        '.0pp44ppppp00440',
        '0pp4pppppppp0440',
        '0ppppppppppp4440',
        '0pp4444444444440',
        '.000vvvvvvvv440.',
        '.00vvv40v40v440.',
        '.0v0vv40v40v40..',
        '.0v0vv40v40v40..',
        '.0vvvvvvvvvv40..',
        '..0vvvvvv00vv0..',
        '0.00vvvvv0avv0..',
        '00ppppppppa00...',
        '0paaaaaaaaa0....',
        '09aaaaaaaa0.....',
        '09aaaaaaaa0.....',
        '.0999999490.....',
        '.0aaaaaaaa0.....',
        '..0999000990....',
        '.09900..0990....',
        '0ppp0...0ppp0...',
        '.000....0ppp0...',
        '.........000....'
      ],
      [
        '....00000.....0.',
        '..00ppppp00..040',
        '.0pp44ppppp00440',
        '0pp4pppppppp0440',
        '0ppppppppppp4440',
        '0pp4444444444440',
        '.000vvvvvvvv440.',
        '.00vvv40v40v440.',
        '.0v0vv40v40v40..',
        '.0v0vv40v40v40..',
        '.0vvvvvvvvvv40..',
        '000vvvvvv00vv0..',
        '0p00vvvvv0avv0..',
        '0pppppppppa00...',
        '09aaaaaaaaa0....',
        '09aaaaaaaa0.....',
        '09aaaaaaaa0.....',
        '.0999999490.....',
        '.0aaaaaaaa0.....',
        '..000999990.....',
        '....0pp0990.....',
        '....0pp0990.....',
        '.....00ppp0.....',
        '.......000......'
      ]
    ]
  });

  // rise: push off, front knee up. apex: both knees tucked. fall: legs reaching down.
  TG.Sprites.define('hero_jump', {
    w: 16, h: 24, anchor: [8, 24], fps: 0, owner: 'C',
    names: ['rise', 'apex', 'fall'],
    frames: [
      [
        '....00000.....0.',
        '..00ppppp00..040',
        '.0pp44ppppp00440',
        '0pp4pppppppp0440',
        '0ppppppppppp4440',
        '0pp4444444444440',
        '.000vvvvvvvv440.',
        '.00vvv40v40v440.',
        '.0v0vv40v40v40..',
        '.0v0vv40v40v40..',
        '.0vvvvvvvvvv40..',
        '0.0vvvvvv00vv0..',
        '0000vvvvv0avv0..',
        '0pppppppppa00...',
        '09aaaaaaaaa0....',
        '09aaaaaaaa0.....',
        '09aaaaaaaa0.....',
        '.0999999490.....',
        '.0aaaaaaaa0.....',
        '..0099099990....',
        '..0990.00ppp0...',
        '.0pp0...0ppp0...',
        '0pp0.....000....',
        '.00.............'
      ],
      [
        '....00000.....0.',
        '..00ppppp00..040',
        '.0pp44ppppp00440',
        '0pp4pppppppp0440',
        '0ppppppppppp4440',
        '0pp4444444444440',
        '.000vvvvvvvv440.',
        '.00vvv40v40v440.',
        '.0v0vv40v40v40..',
        '.0v0vv40v40v40..',
        '.0vvvvvvvvvv40..',
        '000vvvvvv00vv0..',
        '0p00vvvvv0avv0..',
        '0pppppppppa00...',
        '09aaaaaaaaa0....',
        '09aaaaaaaa0.....',
        '09aaaaaaaa0.....',
        '.0999999490.....',
        '.0aaaaaaaa0.....',
        '..0099999990....',
        '...0ppp0ppp0....',
        '...0ppp0ppp0....',
        '....000.000.....',
        '................'
      ],
      [
        '....00000.....0.',
        '..00ppppp00..040',
        '.0pp44ppppp00440',
        '0pp4pppppppp0440',
        '0ppppppppppp4440',
        '0pp4444444444440',
        '.000vvvvvvvv440.',
        '.00vvv40v40v440.',
        '.0v0vv40v40v40..',
        '.0v0vv40v40v40..',
        '.0vvvvvvvvvv40..',
        '0.0vvvvvv00vv0..',
        '0000vvvvv0avv0..',
        '0pppppppppa00...',
        '09aaaaaaaaa0....',
        '09aaaaaaaa0.....',
        '09aaaaaaaa0.....',
        '.0999999490.....',
        '.0aaaaaaaa0.....',
        '..0099000990....',
        '..0990..0990....',
        '.0ppp0..0ppp0...',
        '.0ppp0..0ppp0...',
        '..000....000....'
      ]
    ]
  });

  // Pip leans back, the cap pressed down, and slides on the front leg with the quill held forward.
  // Rows 0 and 1 are empty: the sprite is 14 px tall, so it passes under a branch or beehive, whose
  // underside is HANG_CLEAR (14) px above the ground, without touching it.
  TG.Sprites.define('hero_slide', {
    w: 24, h: 16, anchor: [12, 16], fps: 10, owner: 'C',
    names: ['s0', 's1'],
    frames: [
      [
        '........................',
        '........................',
        '..000000000.............',
        '.0pp44ppppp0........0...',
        '0pp4pppppppp00.....040..',
        '0ppppppppppppp0...0440..',
        '0pp44444444440...04440..',
        '.000vvvvvvvv0...04440...',
        '.00vvv40v40v0.004440....',
        '.0v0vv40v40v0044000.....',
        '00vvvvvvvvvv0vv0........',
        '000vvvvvv0vaavv0........',
        '0p00vvvvvaaaaa0000000...',
        '0ppppppppaaaaa9999ppp0..',
        '.0p09999999999999pppp0..',
        '..0.00000000000000000...'
      ],
      [
        '........................',
        '........................',
        '..000000000.............',
        '.0pp44ppppp0........0...',
        '0pp4pppppppp00.....040..',
        '0ppppppppppppp0...0440..',
        '0pp44444444440...04440..',
        '.000vvvvvvvv0...04440...',
        '.00vvv40v40v0.004440....',
        '00v0vv40v40v0044000.....',
        '00vvvvvvvvvv0vv0........',
        '0p0vvvvvv0vaavv0........',
        '0pp0vvvvvaaaaa00000000..',
        '.0pppppppaaaaa99999ppp0.',
        '..00999999999999900ppp0.',
        '....0000000000000..000..'
      ]
    ]
  });

  // Upper body after a correct key, drawn over the run frame with the same anchor: narrowed eyes and
  // the feather flared at its tip. It covers every opaque pixel of rows 0 to 11 of every run frame. Its
  // bottom row continues into the run frame, so it has no outline there.
  TG.Sprites.define('hero_cast', {
    w: 16, h: 12, anchor: [8, 24], fps: 0, owner: 'C',
    names: ['cast'],
    frames: [
      [
        '....00000..00000',
        '..00ppppp0000040',
        '.0pp44ppppp44440',
        '0pp4pppppppp0440',
        '0ppppppppppp4440',
        '0pp4444444444440',
        '.000vvvvvvvv440.',
        '.00vvv00v00v440.',
        '.0v0vv40v40v40..',
        '.0v0vv40v40v40..',
        '.0vvvvvvvvvv40..',
        '000vvvvv000vv0..'
      ]
    ]
  });

  // Knocked back: eyes squeezed shut, mouth open, feet off the ground.
  TG.Sprites.define('hero_hurt', {
    w: 16, h: 24, anchor: [8, 24], fps: 0, owner: 'C',
    names: ['hurt'],
    frames: [
      [
        '...00000.....0..',
        '.00ppppp00..040.',
        '0pp44ppppp00440.',
        '0p4pppppppp0440.',
        '0pppppppppp4440.',
        '0p4444444444440.',
        '000vvvvvvvv440..',
        '00vv0vvvv0v440..',
        '0v0vv0vv0vv40...',
        '0v0v0vvvv0v40...',
        '0vvvvvvvvvv40...',
        '.0vvvvv000vv0...',
        '000vvvv00avv0...',
        '0ppppppppa00....',
        '0aaaaaaaaa0.....',
        '0aaaaaaaa0......',
        '0aaaaaaaa0......',
        '0999999490......',
        '0aaaaaaaa000....',
        '.0099000999900..',
        '.0990...000ppp0.',
        '0ppp0.....0ppp0.',
        '0pp0.......000..',
        '.00.............'
      ]
    ]
  });

  // Menus. i1 is a breath: the body sinks a pixel, the scarf moves and the feather tip bends.
  TG.Sprites.define('hero_idle', {
    w: 16, h: 24, anchor: [8, 24], fps: 2, owner: 'C',
    names: ['i0', 'i1'],
    frames: [
      [
        '....00000.....0.',
        '..00ppppp00..040',
        '.0pp44ppppp00440',
        '0pp4pppppppp0440',
        '0ppppppppppp4440',
        '0pp4444444444440',
        '.000vvvvvvvv440.',
        '.00vvv40v40v440.',
        '.0v0vv40v40v40..',
        '.0v0vv40v40v40..',
        '.0vvvvvvvvvv40..',
        '..0vvvvvv00vv0..',
        '0000vvvvv0avv0..',
        '0pppppppppa00...',
        '09aaaaaaaaa0....',
        '09aaaaaaaa0.....',
        '09aaaaaaaa0.....',
        '.0999999490.....',
        '.0aaaaaaaa0.....',
        '..009900990.....',
        '...09900990.....',
        '..0ppp0ppp0.....',
        '..0ppp0ppp0.....',
        '...000.000......'
      ],
      [
        '................',
        '....00000.....0.',
        '..00ppppp00..040',
        '.0pp44ppppp00440',
        '0pp4pppppppp0440',
        '0ppppppppppp4440',
        '0pp4444444444440',
        '.000vvvvvvvv440.',
        '.00vvv40v40v440.',
        '.0v0vv40v40v40..',
        '.0v0vv40v40v40..',
        '.0vvvvvvvvvv40..',
        '..0vvvvvv00vv0..',
        '0.00vvvvv0avv0..',
        '00ppppppppa00...',
        '0paaaaaaaaa0....',
        '09aaaaaaaa0.....',
        '09aaaaaaaa0.....',
        '.0999999490.....',
        '.0aa99aa990.....',
        '..009900990.....',
        '..0ppp0ppp0.....',
        '..0ppp0ppp0.....',
        '...000.000......'
      ]
    ]
  });

  // Level complete: w0 stands with the quill flaring, w1 crouches for the next bounce.
  TG.Sprites.define('hero_win', {
    w: 16, h: 24, anchor: [8, 24], fps: 5, owner: 'C',
    names: ['w0', 'w1'],
    frames: [
      [
        '....00000..00000',
        '..00ppppp0000040',
        '.0pp44ppppp44440',
        '0pp4pppppppp0440',
        '0ppppppppppp4440',
        '0pp4444444444440',
        '.000vvvvvvvv440.',
        '.00vvv0vvv0v440.',
        '.0v0v0v0v0v040..',
        '.0v0vvvvvvvv40..',
        '.0vvvv0vvv0v40..',
        '..0vvvv0000vv0..',
        '0000vvvvv0avv0..',
        '0pppppppppa00...',
        '09aaaaaaaaa0....',
        '09aaaaaaaa0.....',
        '09aaaaaaaa0.....',
        '.0999999490.....',
        '.0aaaaaaaa0.....',
        '..009900990.....',
        '...09900990.....',
        '..0ppp0ppp0.....',
        '..0ppp0ppp0.....',
        '...000.000......'
      ],
      [
        '................',
        '....00000.....0.',
        '..00ppppp00..040',
        '.0pp44ppppp00440',
        '0pp4pppppppp0440',
        '0ppppppppppp4440',
        '0pp4444444444440',
        '.000vvvvvvvv440.',
        '.00vvv0vvv0v440.',
        '.0v0v0v0v0v040..',
        '.0v0vvvvvvvv40..',
        '.0vvvv0vvv0v40..',
        '0.0vvvv0000vv0..',
        '0000vvvvv0avv0..',
        '0pppppppppa00...',
        '09aaaaaaaaa0....',
        '09aaaaaaaa0.....',
        '09aaaaaaaa0.....',
        '.0999999490.....',
        '.0aaaaaaaa0.....',
        '..0990000990....',
        '.0ppp0.0ppp0....',
        '.0ppp0.0ppp0....',
        '..000...000.....'
      ]
    ]
  });

  // Game over: sit0 sinks down, sit1 sits with the head bowed and the quill across the lap.
  TG.Sprites.define('hero_sit', {
    w: 16, h: 24, anchor: [8, 24], fps: 3, owner: 'C',
    names: ['sit0', 'sit1'],
    frames: [
      [
        '................',
        '................',
        '................',
        '....00000.......',
        '..00ppppp00.....',
        '.0pp44ppppp0....',
        '0pp4pppppppp0...',
        '0pppppppppppp0..',
        '0pp44444444440..',
        '.000vvvvvvvv0...',
        '.00vvvvvvvvv0...',
        '.0v0vv00v00v0...',
        '.0v0vvvvvvvv0...',
        '.0vvvvvvvvvv0...',
        '..0vvvvv00vv40..',
        '0.00vvvvv004440.',
        '00ppppppppa04440',
        '0paaaaaaaaa00440',
        '09aaaaaaaa0..040',
        '00999999490...0.',
        '.0aaaaaaaa0.....',
        '.0999009990.....',
        '0ppp0.099990....',
        '00000..00000....'
      ],
      [
        '................',
        '................',
        '................',
        '................',
        '................',
        '....00000.......',
        '..00ppppp00.....',
        '.0pp44ppppp0....',
        '0pp4pppppppp0...',
        '0pppppppppppp0..',
        '0pp44444444440..',
        '.000vvvvvvvv0...',
        '.00vvvvvvvvv0...',
        '.0v0vv00v00v0...',
        '.0v0vvvvvvvv0...',
        '.0vvvvvvvvvv0...',
        '..0vvvvv0000....',
        '0.00vvvvv0vv0...',
        '00ppppppp4vv0...',
        '0paaaa4444a0.00.',
        '09aaaaaaaa000pp0',
        '00999999999999p0',
        '.0aaaaaa9999ppp0',
        '..0000000000000.'
      ]
    ]
  });

  // The ink bolt that flies from the quill to a cleared target: DEEP_BLUE, ROYAL, AQUA, WHITE.
  // It points right; draw it with flipX to send it left.
  TG.Sprites.define('ink_bolt', {
    w: 8, h: 8, anchor: [4, 4], fps: 20, owner: 'C',
    names: ['b0', 'b1'],
    frames: [
      [
        '....00..',
        '.0.0660.',
        '0506bb60',
        '056b44b0',
        '0506bb60',
        '.0.0660.',
        '....00..',
        '........'
      ],
      [
        '...000..',
        '..05660.',
        '.056bb60',
        '056b44b0',
        '.056bb60',
        '..05660.',
        '...000..',
        '........'
      ]
    ]
  });

  // The spark at the quill tip after a correct letter: AQUA and WHITE.
  TG.Sprites.define('ink_spark', {
    w: 8, h: 8, anchor: [4, 4], fps: 20, owner: 'C',
    names: ['k0', 'k1'],
    frames: [
      [
        '...0....',
        '..0b0...',
        '.00b00..',
        '0bb4bb0.',
        '.00b00..',
        '..0b0...',
        '...0....',
        '........'
      ],
      [
        '.0...0..',
        '0b0.0b0.',
        '.0b0b0..',
        '..040...',
        '.0b0b0..',
        '0b0.0b0.',
        '.0...0..',
        '........'
      ]
    ]
  });

  // ---------------------------------------------------------------------------------------------
  // Enemies. All face left, towards Pip.
  // ---------------------------------------------------------------------------------------------

  // Boulder: SILVER, STONE, SHADOW. The frame follows the typing, ceil(3 * typed / length), and each
  // frame adds cracks to the one before.
  TG.Sprites.define('en_boulder', {
    w: 24, h: 32, anchor: [12, 32], fps: 0, owner: 'C',
    names: ['whole', 'crack1', 'crack2', 'crack3'],
    frames: [
      [
        '........................',
        '..........0000..........',
        '........00333300..00....',
        '.......033333333002200..',
        '......03333333333022210.',
        '.....0333333333332222110',
        '....03333333333332222210',
        '....03333333333322222210',
        '...033333333333222222210',
        '...033333333333222222210',
        '..0333333333332222222210',
        '..0333333333222222222210',
        '..033333333222222222210.',
        '...03333322222222222210.',
        '..033333222222222222210.',
        '.03333322222232222222100',
        '.03333222222232222222210',
        '033332222222322222222110',
        '033322222223222222211110',
        '033222222232222222111110',
        '032222222322222221112110',
        '032222223222222211111110',
        '.02222232222222111111110',
        '022222222122221111111110',
        '022222222222211111111110',
        '022222222222111111111110',
        '022222222221111111111110',
        '.02222222211111111111110',
        '.02222222111111111111110',
        '..0222211111111111111110',
        '...01111111111111111000.',
        '....0000000000000000....'
      ],
      [
        '........................',
        '..........0.00..........',
        '........00303300..00....',
        '.......033303333002200..',
        '......03333303333022210.',
        '.....0333333033332222110',
        '....03333330333332222210',
        '....03333330033322222210',
        '...033333333033222222210',
        '...033333333033222222210',
        '..0333333333332222222210',
        '..0333333333222222222210',
        '..033333333222222222210.',
        '...03333322222222222210.',
        '..033333222222222222210.',
        '.03333322222232222222100',
        '.03333222222232222222210',
        '033332222222322222222110',
        '033322222223222222211110',
        '033222222232222222111110',
        '032222222322222221112110',
        '032222223222222211111110',
        '.02222232222222111111110',
        '022222222122221111111110',
        '022222222222211111111110',
        '022222222222111111111110',
        '022222222221111111111110',
        '.02222222211111111111110',
        '.02222222111111111111110',
        '..0222211111111111111110',
        '...01111111111111111000.',
        '....0000000000000000....'
      ],
      [
        '........................',
        '..........0.00..........',
        '........00303300..00....',
        '.......033303333002200..',
        '......03333303333022210.',
        '.....0333333033332222110',
        '....03333330333332222210',
        '....03333330033322222210',
        '...033333333033222222210',
        '...033333333033222222210',
        '..0333333333332222222210',
        '..0333333333022222222210',
        '..033333333002222222210.',
        '...03333320220222222210.',
        '..033333202220222222210.',
        '.03333320222230222222100',
        '.03333202222230022222210',
        '033332222222322022222110',
        '033322222223222022211110',
        '033222222232220222111110',
        '032222222322222221112110',
        '032222223222222211111110',
        '.02222232222222111111110',
        '022222222122221111111110',
        '022222222222211111111110',
        '022222222222111111111110',
        '022222222221111111111110',
        '.02222222211111111111110',
        '.02222222111111111111110',
        '..0222211111111111111110',
        '...01111111111111111000.',
        '....0000000000000000....'
      ],
      [
        '........................',
        '..........0.00..........',
        '........00303300..00....',
        '.......033303333002200..',
        '......03333303333022210.',
        '.....0333333033332222110',
        '....03333330333332222210',
        '....03333330033322222210',
        '...033333333033222222210',
        '...033333333033222222210',
        '..0333333333332222222210',
        '..0333333333022222222210',
        '..033333333002222222210.',
        '...03333320220222222210.',
        '..033333202220222222210.',
        '.03333320222230222222100',
        '.03333202222230022222210',
        '033332022222320022222110',
        '033320222223220022211110',
        '033202222232220022111110',
        '032022222322222001112110',
        '030222223222222201111110',
        '.02222232222222110111110',
        '022222222122221110011110',
        '022222222220211111101110',
        '022222222220111111110010',
        '022222222201111111111110',
        '.02222222201111111111110',
        '.02222222011111111111110',
        '..0222211111111111111110',
        '...01111111111111111000.',
        '....0000000000000000....'
      ]
    ]
  });

  // Dawdle the snail: SAND body with eyes on stalks, ORANGE shell with a BRONZE spiral.
  // crawl0 and crawl1 stretch and draw in; shell is the shell alone, for the spinning clear animation.
  TG.Sprites.define('en_dawdle', {
    w: 16, h: 16, anchor: [8, 16], fps: 4, owner: 'C',
    names: ['crawl0', 'crawl1', 'shell'],
    frames: [
      [
        '.0..0...........',
        '0n00n0..........',
        '0n0nn0...0000...',
        '0n00n0.00hhhh0..',
        '0n00n00hhhhhhh0.',
        '0n00n0hhhgggghh0',
        '0nnnn0hhghhhhgh0',
        '0nnnnnhhghhghgh0',
        '00nnnnhhghhgghg0',
        '0nnnnnhhhgghhgh0',
        '0nn0nnhhhhhhgg0.',
        '.0nnnn0hhhhgg00.',
        '..0nnnnnnnnnnnn0',
        '..0nnnnnnnnnnnn0',
        '...0nnnnnnnnnnn0',
        '....00000000000.'
      ],
      [
        '..0..0..........',
        '.0n00n0.........',
        '0nn0nn0..0000...',
        '.0n00n000hhhh0..',
        '.0n00n0hhhhhhh0.',
        '.0n00nhhhgggghh0',
        '.0nnnnhhghhhhgh0',
        '0nnnnnhhghhghgh0',
        '0n0nnnhhghhgghg0',
        '0nnnnnhhhgghhgh0',
        '.0n0nnhhhhhhgg0.',
        '..0nnn0hhhhgg0..',
        '..0nnnnnnnnnnn0.',
        '.0nnnnnnnnnnnnn0',
        '..000nnnnnnnnn0.',
        '.....000000000..'
      ],
      [
        '................',
        '................',
        '.......0000.....',
        '.....00hhhh00...',
        '....0hhhhhhhh0..',
        '...0hhhgggghhh0.',
        '..0hhhghhhhghhh0',
        '..0hhghhgghhghh0',
        '..0hhghghhghghh0',
        '..0hhghhgghhghh0',
        '..0hhhghhhhghhh0',
        '...0hhhgggghhh0.',
        '....0hhhhhhhh0..',
        '.....00hhhh00...',
        '.......0000.....',
        '................'
      ]
    ]
  });

  // Hoppet the frog: GRASS body, LIME belly and spots, WHITE eyes. sit on the ground, leap in the air,
  // puff blown up before it pops.
  TG.Sprites.define('en_hoppet', {
    w: 16, h: 16, anchor: [8, 16], fps: 0, owner: 'C',
    names: ['sit', 'leap', 'puff'],
    frames: [
      [
        '................',
        '..00...00.......',
        '.0440.0440......',
        '04444044440.....',
        '.0444004440.....',
        '.0444e0444e00...',
        '0e44eee44eeee0..',
        '0eeeeeeeeeefee0.',
        '0eeeeeeeeeeeeee0',
        '000000eeeeefffe0',
        '0fffffeeeeffeee0',
        '0ffffffeeeeeeee0',
        '.0ffffeeeeeeeee0',
        '0eeeeeeeeeeeee00',
        '0ee0eee00eeeeee0',
        '000.000..0000000'
      ],
      [
        '..00.00.........',
        '.0440440........',
        '0444444400......',
        '00440444ee00....',
        '00440444eeee0...',
        '0eeeeeeeeeefe0..',
        '000000eeeeeeee0.',
        '0ffffffeeeeeeee0',
        '.0ffffffeeeeefe0',
        '.0ff000eeeeeeee0',
        '0ff0...0eee00ee0',
        '.00.....0eee00e0',
        '.........0ee0.00',
        '..........0e0..0',
        '...........0....',
        '................'
      ],
      [
        '...00..00.......',
        '..044004400.....',
        '.04444044440....',
        '.00444e044400...',
        '0ee44eee44eee00.',
        '0eeeeeeeeeeeeee0',
        '00000eeeeeefeee0',
        '0ffffffeeeeeeee0',
        '0ffffffffeeefee0',
        '0fffffffffeeeee0',
        '0fffffffffeeeee0',
        '0ffffffffeeeeee0',
        '0fffffffeeeeeee0',
        '.0ffffeeeeeeee0.',
        '..00eeeeeeee00..',
        '....00000000....'
      ]
    ]
  });

  // Buzzle the bee: GOLD body, BRONZE shade, WHITE wings and eye, INK stripes. Wings up, wings back.
  TG.Sprites.define('en_buzzle', {
    w: 16, h: 16, anchor: [8, 16], fps: 16, owner: 'C',
    names: ['fly0', 'fly1'],
    frames: [
      [
        '........00..00..',
        '.......04400440.',
        '......044404440.',
        '......044444440.',
        '..0..000444440..',
        '..000ii00ii0i0..',
        '.0iiiiii0ii0ii0.',
        '0i44iiii0ii0iii0',
        '0i04iiii0ii0iii0',
        '0iiiiiig0gg0ggg0',
        '.0iiggg00gg0gg0.',
        '..000000.00.00..',
        '................',
        '................',
        '................',
        '................'
      ],
      [
        '................',
        '................',
        '..........00000.',
        '........00444440',
        '..0..00044444440',
        '..000ii004444440',
        '.0iiiiii0ii0ii0.',
        '0i44iiii0ii0iii0',
        '0i04iiii0ii0iii0',
        '0iiiiiig0gg0ggg0',
        '.0iiggg00gg0gg0.',
        '..000000.00.00..',
        '................',
        '................',
        '................',
        '................'
      ]
    ]
  });

  // Swoop the crow: SHADOW body, STONE feather edges, GOLD beak, eye and feet. flap0 wings up, flap1
  // wings down, dive with the wings swept back and the beak leading.
  TG.Sprites.define('en_swoop', {
    w: 24, h: 16, anchor: [12, 16], fps: 8, owner: 'C',
    names: ['flap0', 'flap1', 'dive'],
    frames: [
      [
        '...............0000.....',
        '.............0022220....',
        '...0000.....022111120...',
        '..011110...021111120....',
        '.01111110.021111200.....',
        '01ii1111102111200.......',
        '010i11111111110000......',
        '0i11111111111111110000..',
        '0ii11111111111111111220.',
        '0i111111111111111122220.',
        '.00111111111111111222220',
        '...00111111111111000220.',
        '.....000i000i0000...00..',
        '......0ii00ii0..........',
        '.......00..00...........',
        '........................'
      ],
      [
        '........................',
        '........................',
        '...0000.................',
        '..011110................',
        '.01111110...............',
        '01ii111110000000........',
        '010i11111111111100......',
        '0i111111111111111100000.',
        '0ii111111222111111111220',
        '0i1111112222211111122220',
        '.00111112222221111122220',
        '...001122222221100002200',
        '.....001222221i0....00..',
        '......0122221ii0........',
        '.......02221000.........',
        '........0000............'
      ],
      [
        '...................0000.',
        '.................0022220',
        '...............002211220',
        '.............00221111220',
        '..........00022111111220',
        '.......0002211111111200.',
        '.....0011111111111100...',
        '...0011111111111100.....',
        '..011111111111000.......',
        '.01ii111111100..........',
        '.010i1111000............',
        '0ii111100...............',
        '0ii1100.................',
        '0i000...................',
        '00......................',
        '........................'
      ]
    ]
  });

  // Truffle the boar: SOIL body, CLAY snout, belly and back, WHITE tusk and eye, INK bristles and
  // hooves. Drawn facing left like the others; the renderer flips it while it charges.
  TG.Sprites.define('en_truffle', {
    w: 24, h: 16, anchor: [12, 16], fps: 12, owner: 'C',
    names: ['run0', 'run1', 'run2', 'run3'],
    frames: [
      [
        '......0.................',
        '.....0l0.00000000.......',
        '....0lml0llllllll00.....',
        '..00llmlllmmmmmmmll000.0',
        '.0l00lllllllllllllllll00',
        '0ll440lllllllllllllllll0',
        '0lll40lllllllllllllllll0',
        '0mmllllllllllllllllllll0',
        '00mmllllllllllllllllll0.',
        '0mm4llllllmmmmmmmmllll0.',
        '00m4lllllmmmmmmmmmmlll0.',
        '0mm0l000lmmmmmmmmmllll0.',
        '0000ll0ll0000000ll0ll0..',
        '...0ll0ll0.....0ll0ll0..',
        '...0ll0ll0.....0ll0ll0..',
        '....00.00.......00.00...'
      ],
      [
        '......0.................',
        '.....0l0.00000000.......',
        '....0lml0llllllll00.....',
        '..00llmlllmmmmmmmll000.0',
        '.0l00lllllllllllllllll00',
        '0ll440lllllllllllllllll0',
        '0lll40lllllllllllllllll0',
        '0mmllllllllllllllllllll0',
        '00mmllllllllllllllllll0.',
        '0mm4llllllmmmmmmmmllll0.',
        '00m4lllllmmmmmmmmmmlll0.',
        '0mm0l000lmmmmmmmmmllll0.',
        '0000ll00ll000000ll00ll0.',
        '..0ll0..0ll0..0ll0..0ll0',
        '.0ll0....0ll00ll0....0l0',
        '..00......00..00......00'
      ],
      [
        '......0.................',
        '.....0l0.00000000.......',
        '....0lml0llllllll00.....',
        '..00llmlllmmmmmmmll000.0',
        '.0l00lllllllllllllllll00',
        '0ll440lllllllllllllllll0',
        '0lll40lllllllllllllllll0',
        '0mmllllllllllllllllllll0',
        '00mmllllllllllllllllll0.',
        '0mm4llllllmmmmmmmmllll0.',
        '00m4lllllmmmmmmmmmmlll0.',
        '0mm0l000lmmmmmmmmmllll0.',
        '000.0llll00000000llll0..',
        '....0ll0ll0.....0ll0ll0.',
        '...0ll00ll0....0ll00ll0.',
        '....00..00......00..00..'
      ],
      [
        '......0.................',
        '.....0l0.00000000.......',
        '....0lml0llllllll00.....',
        '..00llmlllmmmmmmmll000.0',
        '.0l00lllllllllllllllll00',
        '0ll440lllllllllllllllll0',
        '0lll40lllllllllllllllll0',
        '0mmllllllllllllllllllll0',
        '00mmllllllllllllllllll0.',
        '0mm4llllllmmmmmmmmllll0.',
        '00m4lllllmmmmmmmmmmlll0.',
        '0mm0l000lmmmmmmmmmllll0.',
        '0000ll00ll000000ll00ll0.',
        '...0ll0.0ll0...0ll00ll0.',
        '..0ll0..0ll0..0ll0.0ll0.',
        '...00....00....00...00..'
      ]
    ]
  });

  // Digby the mole minion: GOLD helmet (the Baron's, without the lamp glass), SOIL fur, PINK nose and
  // claws. peek with the eyes shut, up with the claws raised, spin without the helmet (it pops off as fx_helmet).
  TG.Sprites.define('en_digby', {
    w: 16, h: 16, anchor: [8, 16], fps: 0, owner: 'C',
    names: ['peek', 'up', 'spin'],
    frames: [
      [
        '......0000......',
        '....00iiii00....',
        '...0iiiiiiii0...',
        '..0i00iiiiiii0..',
        '..0i00iiiiiiii0.',
        '.0iiiiiiiiiiiii0',
        '..0lllllllllll0.',
        '00ll0l0llllllll0',
        '0rlllllllllllll0',
        '0rrlllllllllll0.',
        '00rr0llllllll0..',
        '0rrrr0lllllll0..',
        '.0lllllllllll0..',
        '..0lllllllllll0.',
        '..0lllllllllll0.',
        '...00000000000..'
      ],
      [
        '......0000......',
        '....00iiii00....',
        '...0iiiiiiii0...',
        '..0i00iiiiiii0..',
        '..0i00iiiiiiii0.',
        '.0iiiiiiiiiiiii0',
        '..0lllllllllll0.',
        '00l0ll0llllllll0',
        '0rlllllllllllll0',
        '0rrll0000lllll0.',
        '00lllllllllllrr0',
        '0r0lllllllllrrr0',
        '0rrlllllllllrrr0',
        '000lllllllllll0.',
        '..0lllllllllll0.',
        '...00000000000..'
      ],
      [
        '................',
        '................',
        '.....00000......',
        '....0lllll0.....',
        '...0lllllll0....',
        '..0ll0lll0ll0...',
        '.00lllllllll00..',
        '0r0llrrrllll0r00',
        '0rrlllrllllllrr0',
        '0r0lllllllllll00',
        '.0.0lllllllll0.0',
        '....0lllllll0...',
        '....0lllllll0...',
        '.....0lllll0....',
        '.....0lllll0....',
        '......00000.....'
      ]
    ]
  });

  // The mound over a Digby that is still underground: BARK, SOIL, CLAY. The two frames shake.
  TG.Sprites.define('en_mound', {
    w: 16, h: 8, anchor: [8, 8], fps: 6, owner: 'C',
    names: ['m0', 'm1'],
    frames: [
      [
        '.......00.......',
        '....000mm00.....',
        '...0mmmllmm0....',
        '..0mllllllmm0...',
        '.0mlllklllllm0..',
        '0mllllllllklll0.',
        '0llkllllllllll0.',
        '.0000000000000..'
      ],
      [
        '......00..0.....',
        '....00mm00m0....',
        '...0mmllmmm00...',
        '..0mllllllllm0..',
        '.0mllkllllllm0..',
        '0mlllllllkllll0.',
        '0llllkllllllll0.',
        '.0000000000000..'
      ]
    ]
  });

  // ===== LEVEL 2: creatures (LEVEL2 3.5, 4.2, 4.4) =====

  // Level 2's creatures are drawn on PLUM and on DEEP_BLUE without a section's remap, so each is carried
  // by a light colour of its own: LILAC, AQUA and CREAM, GOLD. All face left, towards Pip.

  // Dangle the cave spider: LILAC body with a VIOLET hourglass on the abdomen, VIOLET legs and fangs
  // with a LILAC pixel at the outer joints, WHITE eyes. It hangs head down, and the thread the renderer
  // draws meets the top row at the anchor's x. hang0 with the legs spread, hang1 with them drawn in; zip
  // looks up with the legs bent and trailing, for the clear animation.
  TG.Sprites.define('en_dangle', {
    w: 16, h: 16, anchor: [8, 16], fps: 4, owner: 'C',
    names: ['hang0', 'hang1', 'zip'],
    frames: [
      [
        '..0...0000...0..',
        '.0u0.0uuuu0.0u0.',
        '0t0.0uttttu0.0t0',
        '0t0.0uuttuu0.0t0',
        '.0t00uuttuu00t0.',
        '..0t0uttttu0t0..',
        '...0t0uuuu0t0...',
        '..000uuuuuu000..',
        '.0utt44u44uttu0.',
        '0t00u04u04u000t0',
        '0t00t44u44ut00t0',
        '.00t0uuuuuu0t00.',
        '.0u0.0tuut0.0u0.',
        '.0t00t0000t00t0.',
        '..0.0t0..0t0.0..',
        '.....0....0.....'
      ],
      [
        '......0000......',
        '..0..0uuuu0..0..',
        '.0u00uttttu00u0.',
        '.0t00uuttuu00t0.',
        '.0t00uuttuu00t0.',
        '..0t0uttttu0t0..',
        '...0t0uuuu0t0...',
        '...00uuuuuu00...',
        '..0ut44u44utu0..',
        '.0t0u04u04u00t0.',
        '.0t0t44u44ut0t0.',
        '..0t0uuuuuu0t0..',
        '..0u00tuut00u0..',
        '...00t0000t00...',
        '.....0....0.....',
        '................'
      ],
      [
        '......0000......',
        '.....0uuuu0.....',
        '....0uttttu0....',
        '....0uuttuu0....',
        '....0uuttuu0....',
        '....0uttttu0....',
        '..0.00uuuu00.0..',
        '.0u0tuuuuuut0u0.',
        '.0ttu04u04u0tt0.',
        '.0t0u44u44u00t0.',
        '0t00t44u44ut00t0',
        '0t0u0uuuuuu0u0t0',
        '.00t00tuut00t00.',
        '..0t0t0000t0t0..',
        '..0t0t0..0t0t0..',
        '...0.0....0.0...'
      ]
    ]
  });

  // Flit the bat: LILAC wings with VIOLET finger bones, VIOLET fur, CREAM eyes and ear linings. Its face is
  // turned to the left, with the snout and both eyes on that side. flap0 wings up, flap1 wings down, with
  // the head and body in the same place; dive with the head leading at the lower left and the near wing
  // swept up and back over the body as one membrane: its tip and two finger points trail behind, with a
  // VIOLET bone running into each point.
  TG.Sprites.define('en_flit', {
    w: 24, h: 16, anchor: [12, 16], fps: 8, owner: 'C',
    names: ['flap0', 'flap1', 'dive'],
    frames: [
      [
        '...0...............00...',
        '..0u0...0..0......0uu0..',
        '.0uuu0.0t00t0....0utuu0.',
        '0uuut00tjttjt0..0uutuuu0',
        '0uuut00tttttt0.0uuutuuu0',
        '0uuutu0jjtjjt00utuutuuu0',
        '0u0utut0jt0jt0uutuutuuu0',
        '0u00tutttttttuuutuut00u0',
        '.0.0tuujtttttuuutu0t0.0.',
        '...0tuu0tttt0uuut00t0...',
        '...0t000tttt0000t0.0....',
        '....0..0tttt0...0.......',
        '........0tt0............',
        '.......0t00t0...........',
        '........0..0............',
        '........................'
      ],
      [
        '........................',
        '........0..0............',
        '.......0t00t0...........',
        '......0tjttjt0..........',
        '......0tttttt0..........',
        '......0jjtjjt0..........',
        '.....0t0jt0jt0..........',
        '....00ttttttt00000......',
        '...0uuujtttttuuuuu00....',
        '..0utuu0tttt0uutuuuu0...',
        '.0uutuu0tttt0uutuuutu0..',
        '0uuutu00tttt00utuuutuu0.',
        '0uu0t0..0tt0..0t00utuuu0',
        '0u00t0.0t00t0.0t0.0t0uu0',
        '0u0.0...0..0...0..0t00u0',
        '.0.................0..0.'
      ],
      [
        '....................00..',
        '..................00uu0.',
        '................00uuuu0.',
        '..............00uuuuu0..',
        '............00uutuuu0...',
        '...........0uuuuutuu00..',
        '..........0uutuuuuttuu0.',
        '...0..0..0uuuutuuuuuttu0',
        '..0t00t00uuuuuutuuu0000.',
        '.0tjttjt0tuuuuuutu0.....',
        '.0tttttttttuuuuuutu0....',
        '.0jjtjjtttttuuuuuutu0...',
        '0t0jt0jtttt0t000uuuu0...',
        '0tttttttt00.0...0000....',
        '.0jttttt0...............',
        '..000000................'
      ]
    ]
  });

  // Glimmer the glow-moth, drawn in the place of the bee and in its rows (0 to 11): AQUA wings with TEAL
  // spots, CREAM body with TEAL bands, TEAL antennae. Seen from above, heading up and to the left.
  // fly0 wings spread, fly1 wings folded in to 10 px, with the body and the antennae in the same place.
  TG.Sprites.define('en_glimmer', {
    w: 16, h: 16, anchor: [8, 16], fps: 16, owner: 'C',
    names: ['fly0', 'fly1'],
    frames: [
      [
        '....0...0...000.',
        '...0a0.0a000bbb0',
        '..000a0a00bbbbb0',
        '.0bbb0jj0bbbabb0',
        '0bbbbbjjbbbbbbb0',
        '0bbabbbjjbbbb00.',
        '0bbbbbbjjbbbbbb0',
        '.0bbb00ajjbbabb0',
        '..00bbbbjjbbbb0.',
        '...0bbabajj0bb0.',
        '....0bbb0jj000..',
        '.....000.00.....',
        '................',
        '................',
        '................',
        '................'
      ],
      [
        '....0...0.00....',
        '...0a0.0a0bb0...',
        '....0a0a00bbb0..',
        '...00bjj0bbab0..',
        '..0bbbjjbbbbb0..',
        '..0babbjjbbb0...',
        '..0bbbbjjbbbb0..',
        '...0bb0ajjbab0..',
        '....0bbbjjbb0...',
        '....0babajj0....',
        '.....0bb0jj0....',
        '......00.00.....',
        '................',
        '................',
        '................',
        '................'
      ]
    ]
  });

  // The Baronet: the Baron at minion size, drawn in the place of a Digby. GOLD spare helmet a size too
  // big, with a WHITE shine and a WHITE lamp glass boxed off at the front; SOIL fur; WHITE eyebrow and
  // handlebar moustache, two rows thick in two lobes, its ends hanging past the cheeks (they show either
  // side of en_mound); a monocle with a GOLD rim and WHITE glass over the front eye. The nose is INK:
  // three colours leave no PINK. peek with the helmet down over his eyes, up with it pushed up two rows
  // and the monocle hanging from the brim, spin from the front with helmet and monocle gone (they fly
  // off as fx_helmet and boss_monocle). The moustache is on rows 9 to 11 in peek and up.
  TG.Sprites.define('en_baronet', {
    w: 16, h: 16, anchor: [8, 16], fps: 0, owner: 'C',
    names: ['peek', 'up', 'spin'],
    frames: [
      [
        '................',
        '................',
        '.....000000.....',
        '...00iiiiii00...',
        '.00ii44iiiiii0..',
        '0440iiiiiiiiii0.',
        '0440iiiiiiiiiii0',
        '0iiiiiiiiiiiiii0',
        '.00llll00llll00.',
        '0444444ll444440.',
        '044444l00l444440',
        '0440lllllll00440',
        '.00llllllllll00.',
        '..0llllllllll0..',
        '...0llllllll0...',
        '....00000000....'
      ],
      [
        '.....000000.....',
        '...00iiiiii00...',
        '.00ii44iiiiii0..',
        '0440iiiiiiiiii0.',
        '0440iiiiiiiiiii0',
        '0iiiiiiiiiiiiii0',
        '.00i44illl44l00.',
        '..0i04illl0ll0..',
        '.00liil00llll0..',
        '0444444ll444440.',
        '044444l00l444440',
        '0440lllllll00440',
        '.00llllllllll00.',
        '..0llllllllll0..',
        '...0llllllll0...',
        '....00000000....'
      ],
      [
        '................',
        '......0000......',
        '....00llll00....',
        '...0llllllll0...',
        '..0llllllllll0..',
        '..0l44lll44ll0..',
        '..0ll0lll0lll0..',
        '.00lll00lllll00.',
        '0444444ll4444440',
        '044444l00l444440',
        '0440llllllll0440',
        '.000llllllll000.',
        '...0llllllll0...',
        '....0llllll0....',
        '.....0llll0.....',
        '......0000......'
      ]
    ]
  });

  // ---------------------------------------------------------------------------------------------
  // Baron von Burrow. The renderer puts him together from these parts (CONTRACT 6.4).
  // ---------------------------------------------------------------------------------------------

  // The Baron's body: SOIL fur, CLAY belly and lit edge, WHITE lace cravat, RED sash from the far
  // shoulder to the near hip, GOLD medal. b1 breathes in: the chest rises a pixel and the belly swells.
  TG.Sprites.define('boss_body', {
    w: 48, h: 32, anchor: [24, 32], fps: 4, owner: 'C',
    names: ['b0', 'b1'],
    frames: [
      [
        '...............000000000000000000...............',
        '............000llllllllllllllllll000............',
        '..........00llllllllllllllllllllllll00..........',
        '.........0llllllllllllllllllllllllllll0.........',
        '........0llllllllllllllllllllllllllllll0........',
        '.......0mllllll4444444444lllllllllllpppp0.......',
        '......0mllllll444444444444lllllllllppppll0......',
        '.....0mllllllll4m44m44m44llllllllpppplllll0.....',
        '....0mmllllllll4444444444lllllllpppplllllll0....',
        '....0mmlllllllll4m44m444lllllllppppllllllll0....',
        '...0mmlllllllllll444444llllllpppplllllllllll0...',
        '...0mmllllllllllll4m44llllllppppllllllllllll0...',
        '..0mmllllllllllllmm44mmmmmpppplllllllllllllll0..',
        '.0mmlllllllllllmmmmmmmmmmippplllllllllllllllll0.',
        '.0mmlllllllllmmmmmmmmmmmiiipmmllllllllllllllll0.',
        '.0mmllllllllmmmmmmmmmmpii4iimmmlllllllllllllll0.',
        '.0mmlllllllmmmmmmmmmmpppiiimmmmmllllllllllllll0.',
        '.0mmllllllmmmmmmmmmmppppimimmmmmmlllllllllllll0.',
        '.0mmllllllmmmmmmmmppppmmmmmmmmmmmlllllllllllll0.',
        '.0mmlllllmmmmmmmmppppmmmmmmmmmmmmmllllllllllll0.',
        '.0mmlllllmmmmmmmppppmmmmmmmmmmmmmmllllllllllll0.',
        '.0mllllllmmmmmppppmmmmmmmmmmmmmmmmllllllllllll0.',
        '.0mlllllllmmmppppmmmmmmmmmmmmmmmmmllllllllllll0.',
        '.0mllllllmmppppmmmmmmmmmmmmmmmmmmmllllllllllll0.',
        '.0mlllllllppppmmmmmmmmmmmmmmmmmmmlllllllllllll0.',
        '.0mllllllppppmmmmmmmmmmmmmmmmmmmmlllllllllllll0.',
        '.0mllllppppmmmmmmmmmmmmmmmmmmmmmllllllllllllll0.',
        '.0llllppppllmmmmmmmmmmmmmmmmmmmlllllllllllllll0.',
        '..0llllllllllmmmmmmmmmmmmmmmmmlllllllllllllll0..',
        '..0llllllllllllmmmmmmmmmmmmmlllllllllllllllll0..',
        '...0lllllllllllllmmmmmmmmmllllllllllllllllll0...',
        '....0000000000000000000000000000000000000000....'
      ],
      [
        '............000000000000000000000000............',
        '..........00llllllllllllllllllllllll00..........',
        '.........0llllllllllllllllllllllllllll0.........',
        '........0llllllllllllllllllllllllllllll0........',
        '.......0mllllll4444444444lllllllllllpppp0.......',
        '......0mllllll444444444444lllllllllppppll0......',
        '.....0mllllllll4m44m44m44llllllllpppplllll0.....',
        '....0mmllllllll4444444444lllllllpppplllllll0....',
        '....0mmlllllllll4m44m444lllllllppppllllllll0....',
        '...0mmlllllllllll444444llllllpppplllllllllll0...',
        '...0mmllllllllllll4m44llllllppppllllllllllll0...',
        '..0mmllllllllllllmm44mmmmmpppplllllllllllllll0..',
        '..0mmllllllllllllmm44mmmmmpppplllllllllllllll0..',
        '.0mmlllllllllllmmmmmmmmmmippplllllllllllllllll0.',
        '0mmmlllllllllmmmmmmmmmmmiiipmmlllllllllllllllll0',
        '0mmmllllllllmmmmmmmmmmpii4iimmmllllllllllllllll0',
        '0mmmlllllllmmmmmmmmmmpppiiimmmmmlllllllllllllll0',
        '0mmmllllllmmmmmmmmmmppppimimmmmmmllllllllllllll0',
        '0mmmllllllmmmmmmmmppppmmmmmmmmmmmllllllllllllll0',
        '0mmmlllllmmmmmmmmppppmmmmmmmmmmmmmlllllllllllll0',
        '0mmmlllllmmmmmmmppppmmmmmmmmmmmmmmlllllllllllll0',
        '0mmllllllmmmmmppppmmmmmmmmmmmmmmmmlllllllllllll0',
        '0mmlllllllmmmppppmmmmmmmmmmmmmmmmmlllllllllllll0',
        '0mmllllllmmppppmmmmmmmmmmmmmmmmmmmlllllllllllll0',
        '0mmlllllllppppmmmmmmmmmmmmmmmmmmmllllllllllllll0',
        '0mmllllllppppmmmmmmmmmmmmmmmmmmmmllllllllllllll0',
        '0mmllllppppmmmmmmmmmmmmmmmmmmmmmlllllllllllllll0',
        '.0llllppppllmmmmmmmmmmmmmmmmmmmlllllllllllllll0.',
        '..0llllllllllmmmmmmmmmmmmmmmmmlllllllllllllll0..',
        '..0llllllllllllmmmmmmmmmmmmmlllllllllllllllll0..',
        '...0lllllllllllllmmmmmmmmmllllllllllllllllll0...',
        '....0000000000000000000000000000000000000000....'
      ]
    ]
  });

  // The Baron's head: GOLD brass helmet with a WHITE shine and CLAY brim, the lamp with CREAM glass
  // (the only CREAM in any boss part, so `lampred` turns just the lamp RED), SOIL fur, PINK nose, WHITE
  // eyebrows and handlebar moustache, GOLD monocle. normal: smug; laugh: eyes shut, mouth open; hurt: the
  // monocle is gone and the eyes are wide; dizzy: crossed-out eyes and the tongue out.
  TG.Sprites.define('boss_head', {
    w: 32, h: 24, anchor: [16, 24], fps: 0, owner: 'C',
    names: ['normal', 'laugh', 'hurt', 'dizzy'],
    frames: [
      [
        '..............000000............',
        '...........000iiiiii000.........',
        '.........00iiiiiiiiiiii00.......',
        '........0iii44iiiiiiiiiii00.....',
        '.......0ii44iiiiiiiiiiiiiim0....',
        '...0000ii4iiiiiiiiiiiiiiiimm0...',
        '..0jjjj0iiiiiiiiiiiiiiiiiiim0...',
        '..0jjjj0iiiiiiiiiiiiiiiiiiimm0..',
        '..0jjjj0iiiiiiiiiiiiiiiiiiiim0..',
        '...0000mmmmmmmmmmmmmmmmmmmmmmm0.',
        '......0llllllllllllllllllllllll0',
        '.....0llll44llllllll444lllllll0.',
        '....0lllllliiilllllllllllllll0..',
        '...0lllllli444illll04lllllll0...',
        '..0rrrlllli004illll00llllll0....',
        '.0rrrrrllli444illlllllllll0.....',
        '0rrrrrrrllliiillllllllllll0.....',
        '0rrrrrrmmmmmmmmlllllllllll0.....',
        '0rrrrrm44444mmmmm4444llll0......',
        '0rrrr444444444m44444444l0.......',
        '.04444000mm0000mm0044440........',
        '.04440...0mmmmmmm0.04440........',
        '..000.....0mmmmm0...000.........',
        '...........00000................'
      ],
      [
        '..............000000............',
        '...........000iiiiii000.........',
        '.........00iiiiiiiiiiii00.......',
        '........0iii44iiiiiiiiiii00.....',
        '.......0ii44iiiiiiiiiiiiiim0....',
        '...0000ii4iiiiiiiiiiiiiiiimm0...',
        '..0jjjj0iiiiiiiiiiiiiiiiiiim0...',
        '..0jjjj0iiiiiiiiiiiiiiiiiiimm0..',
        '..0jjjj0iiiiiiiiiiiiiiiiiiiim0..',
        '...0000mmmmmmmmmmmmmmmmmmmmmmm0.',
        '......0llllllllllllllllllllllll0',
        '.....0llll44llllllll444lllllll0.',
        '....0lllllliiilllllllllllllll0..',
        '...0lllllli404illlll0llllllll0..',
        '..0rrrlllli040illll0l0llll000...',
        '.0rrrrrllli444illlllllllll0.....',
        '0rrrrrrrllliiillllllllllll0.....',
        '0rrrrrrmmmmmmmmlllllllllll0.....',
        '0rrrrrm44444mmmmm4444llll0......',
        '0rr44444444m0000m444444440......',
        '.04444400m0444440m0044440.......',
        '.044000.0m0ppppp0m0.00440.......',
        '..00.....0m0ppp0m0....00........',
        '..........0000000...............'
      ],
      [
        '..............000000............',
        '...........000iiiiii000.........',
        '.........00iiiiiiiiiiii00.......',
        '........0iii44iiiiiiiiiii00.....',
        '.......0ii44iiiiiiiiiiiiiim0....',
        '...0000ii4iiiiiiiiiiiiiiiimm0...',
        '..0jjjj0iiiiiiiiiiiiiiiiiiim0...',
        '..0jjjj0iiiiiiiiiiiiiiiiiiimm0..',
        '..0jjjj0iiiiiiiiiiiiiiiiiiiim0..',
        '...0000mmmmmmmmmmmmmmmmmmmmmmm0.',
        '.....00llllllllllllllllllllllll0',
        '....0444lllllllll444llllllllll0.',
        '....0lll444llllll444lllllllll0..',
        '...0lll44404llll4404lllllll00...',
        '..0rrrll4444lllll44lllllll0.....',
        '.0rrrrrlll44llllllllllllll0.....',
        '0rrrrrrrllllllllllllllllll0.....',
        '0rrrrrrmmmmmmmmlllllllllll0.....',
        '0rrrrrm44444mmmmm4444llll0......',
        '0rrrr4444444mm44444444l00.......',
        '.044404400mm000mm004404440......',
        '.0440.00.0m0ppp0m0.000440.......',
        '..00......0m000m0.....00........',
        '...........0...0................'
      ],
      [
        '..............000000............',
        '...........000iiiiii000.........',
        '.........00iiiiiiiiiiii00.......',
        '........0iii44iiiiiiiiiii00.....',
        '.......0ii44iiiiiiiiiiiiiim0....',
        '...0000ii4iiiiiiiiiiiiiiiimm0...',
        '..0jjjj0iiiiiiiiiiiiiiiiiiim0...',
        '..0jjjj0iiiiiiiiiiiiiiiiiiimm0..',
        '..0jjjj0iiiiiiiiiiiiiiiiiiiim0..',
        '...0000mmmmmmmmmmmmmmmmmmmmmmm0.',
        '......0llllllllllllllllllllllll0',
        '.....0llllllllllllllllllllllll0.',
        '....0lll4l4lllllll4l4lllllll00..',
        '...0lllll4lllllllll4lllllll0....',
        '..0rrrll4l4lllllll4l4llllll0....',
        '.0rrrrrllllllllllllllllllll0....',
        '0rrrrrrrlllllllllllllllllll0....',
        '0rrrrrrmmmmmmmmllllllllllll0....',
        '0rrrrrm4444mmmmmmm4444llll0.....',
        '0rrrr4444444m0000m44444ll0......',
        '.0044440400m0rrr0m00440440......',
        '..04400.0.0mmrrrm0..000440......',
        '...00......00rr00......00.......',
        '.............00.................'
      ]
    ]
  });

  // The left arm as drawn, shoulder at the right: SOIL fur, CLAY highlight, a big PINK digging hand
  // with WHITE claws. rest hangs down, raise lifts the hand above the shoulder, throw reaches forward.
  TG.Sprites.define('boss_arm', {
    w: 16, h: 16, anchor: [8, 8], fps: 0, owner: 'C',
    names: ['rest', 'raise', 'throw'],
    frames: [
      [
        '.........00000..',
        '........0mmmmm0.',
        '.......0llllllm0',
        '......0lllllllm0',
        '.....0lllllllm0.',
        '....0llllllll0..',
        '..00rrrrllll0...',
        '.0rrrrrrrrrl0...',
        '0rrrrrrrrrrr0...',
        '0rrrrrrrrrrr0...',
        '0rrrrrrrrrr0....',
        '0rrrrrrrrr00....',
        '0440440440440...',
        '040040040040....',
        '.0..0..0..0.....',
        '................'
      ],
      [
        '0..0..0..0......',
        '00040040040.....',
        '040440440440....',
        '0rrrrrrrrrr0....',
        '0rrrrrrrrrrr0...',
        '0rrrrrrrrrrr0...',
        '.0rrrrrrrrrl0...',
        '..00rrrrllll0...',
        '....0lllllllm00.',
        '.....0llllllllm0',
        '......0mlllllll0',
        '.......0mmllll0.',
        '........000000..',
        '................',
        '................',
        '................'
      ],
      [
        '................',
        '................',
        '................',
        '00..............',
        '0400.....00000..',
        '04rr00.00mmmmm0.',
        '04rrrr0llllllll0',
        '0rrrrrrlllllllm0',
        '04rrrrrllllllll0',
        '04rrrrrllllllll0',
        '04rrrr00lllllm0.',
        '04rr00..000000..',
        '.000............',
        '................',
        '................',
        '................'
      ]
    ]
  });

  // The mound of churned soil in front of the Baron: SOIL with CLAY clods and WHITE pebbles.
  TG.Sprites.define('boss_mound', {
    w: 48, h: 16, anchor: [24, 16], fps: 0, owner: 'C',
    names: ['mound'],
    frames: [
      [
        '................................................',
        '................................................',
        '................................................',
        '..................00000000000...................',
        '.............00000mmmmmmmmmmm00000..............',
        '.........0000mmmmmmlllllllllmmmmmm000...........',
        '.......00mmmmmlllllllllllllllllllmmmm000........',
        '.....00mmmllllllllll4llllllllllllllllmmm00......',
        '....0mmlllllllllllllllllllllmmllllllllllmm00....',
        '...0mllllllmmllllllllllllllmllllllllllllllmm0...',
        '..0mllllllmlllllllllllllllllllllllll4llllllmm0..',
        '.0mlllllllllllllllmmllllllllllllllllllllllllmm0.',
        '0mllll4lllllllllllmllllllllllllllmmllllllllllm0.',
        '0mllllllllllllllllllllllllllllllmllllllllllllll0',
        '0llllllllllllllllllllllllllllllllllllllllllllll0',
        '000000000000000000000000000000000000000000000000'
      ]
    ]
  });

  // The monocle that pops off on a hit: GOLD rim, WHITE glass.
  TG.Sprites.define('boss_monocle', {
    w: 8, h: 8, anchor: [4, 4], fps: 0, owner: 'C',
    names: ['monocle'],
    frames: [
      [
        '..000...',
        '.0iii0..',
        '0i444i0.',
        '0i444i0.',
        '0i444i0.',
        '.0iii0..',
        '..00i0..',
        '....0...'
      ]
    ]
  });

  // The helmet that flies off on defeat: GOLD with a CLAY brim. Its lamp glass is WHITE, because
  // CREAM is kept for boss_head.
  TG.Sprites.define('boss_helmet', {
    w: 16, h: 8, anchor: [8, 4], fps: 0, owner: 'C',
    names: ['helmet'],
    frames: [
      [
        '.....000000.....',
        '...00iiiiii00...',
        '.00iii44iiiii0..',
        '044iii4iiiiiii0.',
        '044iiiiiiiiiiim0',
        '.0mmmmmmmmmmmmm0',
        '..0000000000000.',
        '................'
      ]
    ]
  });

  // ---------------------------------------------------------------------------------------------
  // Projectiles of the Baron
  // ---------------------------------------------------------------------------------------------

  // Rock: SILVER, STONE, SHADOW. Two frames a quarter turn apart.
  TG.Sprites.define('pr_rock', {
    w: 12, h: 12, anchor: [6, 12], fps: 10, owner: 'C',
    names: ['k0', 'k1'],
    frames: [
      [
        '....0000....',
        '..00333200..',
        '.0333322220.',
        '.0333222220.',
        '033322222210',
        '033222222110',
        '032222222110',
        '022222221110',
        '.0222211110.',
        '.0221111110.',
        '..00111100..',
        '....0000....'
      ],
      [
        '.....00.....',
        '...003300...',
        '..03333220..',
        '.0333322220.',
        '033332222220',
        '033222222210',
        '032222222110',
        '.02222211110',
        '.0222211110.',
        '..02111110..',
        '...001100...',
        '.....00.....'
      ]
    ]
  });

  // Pickaxe: SILVER head, STONE shade, CLAY handle. Four quarter turns, clockwise.
  TG.Sprites.define('pr_pickaxe', {
    w: 16, h: 16, anchor: [8, 16], fps: 12, owner: 'C',
    names: ['p0', 'p1', 'p2', 'p3'],
    frames: [
      [
        '..00........00..',
        '.03300....00230.',
        '0333330000223330',
        '.033333222333320',
        '..0033mm3333300.',
        '....00mm00000...',
        '.....0mm0.......',
        '.....0mm0.......',
        '.....0mm0.......',
        '.....0mm0.......',
        '.....0mm0.......',
        '.....0mm0.......',
        '.....0mm0.......',
        '.....0mm0.......',
        '......00........',
        '................'
      ],
      [
        '.............0..',
        '............030.',
        '...........03330',
        '...........03330',
        '..........03330.',
        '..0000000003330.',
        '.0mmmmmmmmmm30..',
        '.0mmmmmmmmmm20..',
        '..000000000320..',
        '..........0320..',
        '..........03320.',
        '..........03320.',
        '..........033320',
        '...........03330',
        '...........0230.',
        '............00..'
      ],
      [
        '................',
        '........00......',
        '.......0mm0.....',
        '.......0mm0.....',
        '.......0mm0.....',
        '.......0mm0.....',
        '.......0mm0.....',
        '.......0mm0.....',
        '.......0mm0.....',
        '.......0mm0.....',
        '...00000mm00....',
        '.0033333mm3300..',
        '023333222333330.',
        '0333220000333330',
        '.03200....00330.',
        '..00........00..'
      ],
      [
        '..00............',
        '.0320...........',
        '03330...........',
        '023330..........',
        '.02330..........',
        '.02330..........',
        '..0230..........',
        '..023000000000..',
        '..02mmmmmmmmmm0.',
        '..03mmmmmmmmmm0.',
        '.0333000000000..',
        '.03330..........',
        '03330...........',
        '03330...........',
        '.030............',
        '..0.............'
      ]
    ]
  });

  // Shockwave dust ring: SAND, CLAY, WHITE.
  TG.Sprites.define('pr_shock', {
    w: 16, h: 8, anchor: [8, 8], fps: 10, owner: 'C',
    names: ['s0', 's1'],
    frames: [
      [
        '................',
        '......0000......',
        '....004nn400....',
        '..00nnnnnnnn00..',
        '.0nnmnnnnnnmnn0.',
        '0nmmmn0000nmmmn0',
        '0mmmm0....0mmmm0',
        '.0000......0000.'
      ],
      [
        '.....00..00.....',
        '...004n00n400...',
        '..0nnnnnnnnnn0..',
        '.0nmnnn44nnnmn0.',
        '0nmmmn0000nmmmn0',
        '0mmmm0....0mmmm0',
        '0mm00......00mm0',
        '.00..........00.'
      ]
    ]
  });

  // ===== LEVEL 2: Lady Ratchet and her projectiles (LEVEL2 2, 3.5, 10.1) =====

  // ---------------------------------------------------------------------------------------------
  // Lady Ratchet. The renderer puts her together from these parts as it does the Baron: body, far arm,
  // key, head, near arm, and the engine in front (LEVEL2 10.1).
  // ---------------------------------------------------------------------------------------------

  // Lady Ratchet's body, seen from the front: a TEAL waistcoat over a WHITE shirt front, two GOLD buttons,
  // a GOLD watch chain to the pocket, a breast pocket with a pencil (GOLD, PINK rubber) and a WHITE rule,
  // STONE fur and a PINK tail that rises in a wave on the right and thins towards its tip. Rows 24 to 31 are
  // behind the engine: STONE haunches and PINK feet with toes. b1: the near foot is lifted (behind the
  // engine), the hem rides up a pixel, the chain swings and the tip of the tail flicks to the other side.
  TG.Sprites.define('boss2_body', {
    w: 48, h: 32, anchor: [24, 32], fps: 0, owner: 'C',
    names: ['b0', 'b1'],
    frames: [
      [
        '................................................',
        '................................................',
        '...................00000000000..................',
        '..................0222222222220.................',
        '..................0222222222220.................',
        '.................004444444444400................',
        '...............00aa04444444440aa00..............',
        '.............00aaaa04444444440aaaa00............',
        '...........00aaaaaaa044444440aaaaaaa00..........',
        '..........0aaaaaaaaaa0444440aaaaaaaaaa0.........',
        '..........0aaaraaaaaa0444440aaaaaaaaaa0......00.',
        '..........0aaaiaaaaaaa04440aaaaaaaaaaa0.....0rr0',
        '..........0aaaia4aaaaa04440aaaaaaaaaaa0....0r000',
        '..........0aaaia4aaaaaa040aaaaaaaaaaaa0....0r0..',
        '..........0aa00000aaaaaa0aaaaaaaaaaaaa0....0rr0.',
        '..........0aaaaaaaaaaaaa0iiaaaaaaaaaaa0.....0rr0',
        '..........0aaaaaaaaaaaaa0iiaaaa00000aa0.....0rr0',
        '.........0aaaaaaaaaaaaaa0aaiaaaiaaaaaaa0....0rr0',
        '.........0aaaaaaaaaaaaaa0aaaiiiaaaaaaaa0....0rr0',
        '.........0aaaaaaaaaaaaaa0iiaaaaaaaaaaaa0...0rrr0',
        '.........0aaaaaaaaaaaaaa0iiaaaaaaaaaaaa00000rrr0',
        '.........0aaaaaaaaaaaaaa0aaaaaaaaaaaaaa0rrrrrrr0',
        '.........0aaaaaaaaaaaaa020aaaaaaaaaaaaa0rrrrrr0.',
        '..........00aaaaaaaaa0022200aaaaaaaaa000000000..',
        '.........0220000000002222222000000000220........',
        '.........0222222222222222222222222222220........',
        '.........0222222222222222222222222222220........',
        '.........0222222222222222222222222222220........',
        '..........0rrrrrrrrr2222222rrrrrrrrr200.........',
        '..........0rrrrrrrrr2222222rrrrrrrrr0...........',
        '..........0rr0rr0rrr2222222rrr0rr0rr0...........',
        '...........0000000000000000000000000............'
      ],
      [
        '................................................',
        '................................................',
        '...................00000000000..................',
        '..................0222222222220.................',
        '..................0222222222220.................',
        '.................004444444444400................',
        '...............00aa04444444440aa00..............',
        '.............00aaaa04444444440aaaa00............',
        '...........00aaaaaaa044444440aaaaaaa00..........',
        '..........0aaaaaaaaaa0444440aaaaaaaaaa0.........',
        '..........0aaaraaaaaa0444440aaaaaaaaaa0....00...',
        '..........0aaaiaaaaaaa04440aaaaaaaaaaa0...0rr0..',
        '..........0aaaia4aaaaa04440aaaaaaaaaaa0....0r0..',
        '..........0aaaia4aaaaaa040aaaaaaaaaaaa0....0r0..',
        '..........0aa00000aaaaaa0aaaaaaaaaaaaa0....0rr0.',
        '..........0aaaaaaaaaaaaa0iiaaaaaaaaaaa0.....0rr0',
        '..........0aaaaaaaaaaaaa0iiaaaa00000aa0.....0rr0',
        '.........0aaaaaaaaaaaaaa0aaiaaaiaaaaaaa0....0rr0',
        '.........0aaaaaaaaaaaaaa0aaaiaiaaaaaaaa0....0rr0',
        '.........0aaaaaaaaaaaaaa0iiaaiaaaaaaaaa0...0rrr0',
        '.........0aaaaaaaaaaaaaa0iiaaaaaaaaaaaa00000rrr0',
        '.........0aaaaaaaaaaaaa020aaaaaaaaaaaaa0rrrrrrr0',
        '..........00aaaaaaaaa0022200aaaaaaaaa000rrrrrr0.',
        '.........0220000000002222222000000000220000000..',
        '.........0222222222222222222222222222220........',
        '.........0rrrrrrrrr222222222222222222220........',
        '.........0rrrrrrrrr222222222222222222220........',
        '.........0rr0rr0rrr222222222222222222220........',
        '.........000000000002222222rrrrrrrrr200.........',
        '...................02222222rrrrrrrrr0...........',
        '...................02222222rrr0rr0rr0...........',
        '....................0000000000000000............'
      ]
    ]
  });

  // Lady Ratchet's head: STONE fur, a long snout that narrows to a PINK nose, two WHITE buck teeth under
  // its tip and the lower jaw set back behind them, WHITE whiskers, a round PINK ear at the back of the
  // skull, brass goggles with GOLD rims pushed up on her brow, a BRONZE strap. The two lenses are CREAM, so
  // `lampred` turns just the lenses RED. Rows 0 and 1 are empty in every frame: at rise 40 the whole head is
  // behind the engine. normal: eyes half shut, unimpressed; laugh: eyes shut, mouth open; hurt: the goggles
  // are gone, the eyes are wide and crossed and three tufts of fur stand up from a crown no higher than
  // her brow was; dizzy: two round spiral eyes, WHITE on INK, the goggles knocked crooked, the ear down, the
  // snout a row lower and the tongue out.
  TG.Sprites.define('boss2_head', {
    w: 32, h: 24, anchor: [16, 24], fps: 0, owner: 'C',
    names: ['normal', 'laugh', 'hurt', 'dizzy'],
    frames: [
      [
        '................................',
        '................................',
        '.........000...000.......00000..',
        '........0iii0.0iii0....00rrrrr0.',
        '.......0ijjji0ijjji000.0rrrrrrr0',
        '.......0ijjjiiijjji0gg0rr0rrrrr0',
        '.......0ijjji0ijjji0gg0r0rrrrrr0',
        '........0iii0.0iii002g0r0rrrrrr0',
        '.........00000000022220rr0rrrrr0',
        '........0022222222222220rrrrrr0.',
        '.4...4.02222222222222222000000..',
        '..4.400222000020000022222220....',
        '.0000222222042220442222222220...',
        '0rr22222222042220442222222220...',
        '0rr22020222222222222222222220...',
        '.0022202222222222222222222220...',
        '..000000022222222222222222220...',
        '..04404400002222222222222220....',
        '..0440440222002222222222220.....',
        '..044044022222222222222220......',
        '...00.00.0002222222222220.......',
        '............0000222222200.......',
        '................000222000.......',
        '...................000..........'
      ],
      [
        '................................',
        '................................',
        '.........000...000.......00000..',
        '........0iii0.0iii0....00rrrrr0.',
        '.......0ijjji0ijjji000.0rrrrrrr0',
        '.......0ijjjiiijjji0gg0rr0rrrrr0',
        '.......0ijjji0ijjji0gg0r0rrrrrr0',
        '........0iii0.0iii002g0r0rrrrrr0',
        '.........00000000022220rr0rrrrr0',
        '........0022222222222220rrrrrr0.',
        '.4...4.02222222222222222000000..',
        '..4.400222200222200022222220....',
        '.0000222220220220222022222220...',
        '0rr22222222222222222222222220...',
        '0rr22020222222222222222222220...',
        '.0022202222222222222222222220...',
        '..000000022222222222222222220...',
        '..04404400000002222222222220....',
        '..0440440rrrrr0222222222220.....',
        '..0440440rrrrr022222222220......',
        '...00.000rrrr022222222220.......',
        '........02222222222222200.......',
        '.........0000000000222000.......',
        '...................000..........'
      ],
      [
        '................................',
        '................................',
        '................................',
        '................................',
        '.........................00000..',
        '.............0...0..0...00rrr00.',
        '............020.020020..0rrrrr0.',
        '............0200020020..0rr0rrr0',
        '..........00222222222200rr0rrrr0',
        '........0022220002222220rr0rrrr0',
        '.4...4.02002204440222220rrr0rrr0',
        '..4.400204402044402222220rrrrr0.',
        '.000022204002004402222222000000.',
        '0rr22222200222000222222222220...',
        '0rr22020222222222222222222220...',
        '.0022202222222222222222222220...',
        '..000000022222222222222222220...',
        '..04404400000222222222222220....',
        '..0440440rrr022222222222220.....',
        '..044044022222222222222220......',
        '...00.00.0002222222222220.......',
        '............0000222222200.......',
        '................000222000.......',
        '...................000..........'
      ],
      [
        '................................',
        '................................',
        '...............000..............',
        '..............0iii0......00000..',
        '.........000.0ijjji000..00rrr00.',
        '........0iii00ijjji0gg0.0rrrrr0.',
        '.......0ijjjiiijjji0gg00rr0rrr0.',
        '.......0ijjji00iii002220rr0rrrr0',
        '.......0ijjji000002222220r0rrrr0',
        '........0iii00222222222220rr0rr0',
        '.......000002222244422222200rrr0',
        '.4...4.022444222400042222220000.',
        '..4.4002240004224040422222220...',
        '.0000222240404224044422222220...',
        '0rr22222240444222400222222220...',
        '0rr22222224002222222222222220...',
        '.0022222222222222222222222220...',
        '..00000002222222222222222220....',
        '..0440440000002222222222220.....',
        '..0440440rr022222222222220......',
        '..0440440rr02222222222220.......',
        '...00.00.0r00000222222200.......',
        '..........0.....000222000.......',
        '...................000..........'
      ]
    ]
  });

  // The left arm as drawn, shoulder at the right on rows 4 to 7 in every frame: STONE fur, a WHITE cuff, a
  // PINK hand. rest: hand on hip; raise: a spanner held up, WHITE with a STONE shade; throw: flung forward,
  // hand open; watch: her GOLD pocket watch held up under her nose, crown at the top, the hands at three.
  TG.Sprites.define('boss2_arm', {
    w: 16, h: 16, anchor: [8, 8], fps: 0, owner: 'C',
    names: ['rest', 'raise', 'throw', 'watch'],
    frames: [
      [
        '................',
        '................',
        '................',
        '................',
        '............000.',
        '..........002220',
        '.........0222220',
        '........02222220',
        '.......02222200.',
        '.......022220...',
        '.......0222220..',
        '........0222200.',
        '.........0444rr0',
        '..........044rr0',
        '..........00rrr0',
        '............000.'
      ],
      [
        '0000000.........',
        '0440440.........',
        '0440440.........',
        '0444420.........',
        '.04420......000.',
        '.0442000...02220',
        '.0rrrr4400022220',
        '.0rrrr4422222220',
        '..0420022222220.',
        '..042002222220..',
        '...00..0022200..',
        '.........000....',
        '................',
        '................',
        '................',
        '................'
      ],
      [
        '.000............',
        '0rrr00..........',
        '0rrrr00000......',
        '0rrrr44222000...',
        '.0rr04422222200.',
        '..00.04222222220',
        '.....00022222220',
        '........00222220',
        '..........00000.',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................'
      ],
      [
        '....0...........',
        '...0i0..........',
        '..0iii0.........',
        '.0i444i0........',
        '.0i404i0....000.',
        '.0i400i0..002220',
        '.0i444i0.0222220',
        '..0iiirr00222220',
        '...00rrr02222220',
        '.....0rr4422220.',
        '......00002220..',
        '..........000...',
        '................',
        '................',
        '................',
        '................'
      ]
    ]
  });

  // The wind-up key in her back: a GOLD bow of two wings with a hole in each, BRONZE shade, on a stem one
  // pixel wide that stands clear under the bow and ends on row 8, on her far shoulder. Four steps of half a
  // turn about the stem, after which the bow looks the same again: k0 face on; k1 the left wing near and
  // wide, the right one turned away, narrow and BRONZE; k2 edge on; k3 as k1 mirrored. So k0 to k3 is a
  // turn one way and k3 to k0 the other.
  TG.Sprites.define('boss2_key', {
    w: 16, h: 16, anchor: [8, 8], fps: 0, owner: 'C',
    names: ['k0', 'k1', 'k2', 'k3'],
    frames: [
      [
        '..000.......000.',
        '.0iii0.....0iii0',
        '.0i0ii00000ii0g0',
        '.0i0iiiiiiiii0g0',
        '.0iiig00i00gigg0',
        '..0000.0i0.0000.',
        '.......0i0......',
        '.......0g0......',
        '........0.......',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................'
      ],
      [
        '..000...........',
        '.0iii0...0000...',
        '.0i0ii0000ggg0..',
        '.0i0iiiiiig0g0..',
        '.0iiig00i00gg0..',
        '..0000.0i0.000..',
        '.......0i0......',
        '.......0g0......',
        '........0.......',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................'
      ],
      [
        '.......000......',
        '......0iig0.....',
        '......0iig0.....',
        '......0iig0.....',
        '......0igg0.....',
        '.......0i0......',
        '.......0i0......',
        '.......0g0......',
        '........0.......',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................'
      ],
      [
        '............000.',
        '....0000...0iii0',
        '...0ggg0000ii0i0',
        '...0g0giiiiii0i0',
        '...0gg00i00giii0',
        '...000.0i0.0000.',
        '.......0i0......',
        '.......0g0......',
        '........0.......',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................'
      ]
    ]
  });

  // The brass engine she stands behind: BRONZE with a GOLD top edge over a row of rivets, a STONE skid, a
  // TEAL sight glass with louvres beside it, and on the left the boiler gauge, a WHITE dial in a GOLD rim.
  // The renderer draws the needle from the dial's centre, column 6, row 6. The hatch is the arched door in
  // the middle. shut: the door closed, a TEAL porthole in it and two STONE strap hinges on its right; open:
  // the door swung aside on those hinges and the dark inside.
  TG.Sprites.define('boss2_engine', {
    w: 48, h: 16, anchor: [24, 16], fps: 0, owner: 'C',
    names: ['shut', 'open'],
    frames: [
      [
        '..........0000000000000000000000000000000000000.',
        '....000000iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii0',
        '...00i0i00ggigggigggigggigggigggigggigggigggigg0',
        '..00i444i00gg0ggggggg000000ggggggg0gggggggggggg0',
        '.00i44444i00g0giggg00iiiiii00gggig0gggg000ggggg0',
        '.0i4444444i0g0gggg0iiggggggii0gggg0gggg040g000g0',
        '.00444444400g0ggg0iggggggg22220ggg0gggg0a0ggggg0',
        '.0i4444444i0g0ggg0iggg000ggggi0ggg0gggg0a0g000g0',
        '.00i44444i00g0ggg0igg04aa0gggi0ggg0gggg0a0ggggg0',
        '.000iiiii00gg0ggg0igg0aaa0gggi0ggg0gggg0a0g000g0',
        '.0g00iii00ggg0ggg0igg0aaa0gggi0ggg0gggg0a0ggggg0',
        '.0gg00000gggg0ggg0iggg000ggggi0ggg0gggg000g000g0',
        '.0ggggggggggg0ggg0iggggggg22220ggg0gggggggggggg0',
        '.0ggigggggigg0ggg0iggggggggggi0ggg0gggggggggggg0',
        '.02222222222202220iggggggggggi022202222222222220',
        '.00000000000000000000000000000000000000000000000'
      ],
      [
        '..........0000000000000000000000000000000000000.',
        '....000000iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii0',
        '...00i0i00ggigggigggigggigggigggigggigggigggigg0',
        '..00i444i00gg0ggggggg000000ggggggg0gggggggggggg0',
        '.00i44444i00g0giggg0000000000gggig0gggg000ggggg0',
        '.0i4444444i0g0gggg0i00000000i0gi0g0gggg040g000g0',
        '.00444444400g0ggg0i0000000000i2i0g0gggg0a0ggggg0',
        '.0i4444444i0g0ggg0i0000000000i0i0g0gggg0a0g000g0',
        '.00i44444i00g0ggg0i0000000000i0i0g0gggg0a0ggggg0',
        '.000iiiii00gg0ggg0i0000000000i0i0g0gggg0a0g000g0',
        '.0g00iii00ggg0ggg0i0000000000i0i0g0gggg0a0ggggg0',
        '.0gg00000gggg0ggg0i0000000000i0i0g0gggg000g000g0',
        '.0ggggggggggg0ggg0i0000000000i2i0g0gggggggggggg0',
        '.0ggigggggigg0ggg0i0000000000i0i0g0gggggggggggg0',
        '.02222222222202220i0000000000i0i0202222222222220',
        '.00000000000000000000000000000000000000000000000'
      ]
    ]
  });

  // The goggles that pop off on a hit: two CREAM lenses in GOLD rims with a GOLD bridge, so that `lampred`
  // turns them RED like the pair on her head.
  TG.Sprites.define('boss2_goggles', {
    w: 8, h: 8, anchor: [4, 4], fps: 0, owner: 'C',
    names: ['goggles'],
    frames: [
      [
        '........',
        '.00..00.',
        '0ii00ii0',
        '0jjiijj0',
        '0jjiijj0',
        '0ii00ii0',
        '.00..00.',
        '........'
      ]
    ]
  });

  // ---------------------------------------------------------------------------------------------
  // Projectiles of Lady Ratchet (LEVEL2 3.5)
  // ---------------------------------------------------------------------------------------------

  // Cog, in the place of the rock: GOLD with BRONZE shade and a hole for the axle. The eight teeth of k1
  // stand where the gaps of k0 are.
  TG.Sprites.define('pr_cog', {
    w: 12, h: 12, anchor: [6, 12], fps: 10, owner: 'C',
    names: ['k0', 'k1'],
    frames: [
      [
        '.....00.....',
        '..000ii000..',
        '.0ii0ii0ii0.',
        '.0iiiiiiii0.',
        '.00iiggii00.',
        '0iiig00giig0',
        '0iiig00gigg0',
        '.00iiggig00.',
        '.0iiiiiggg0.',
        '.0ii0ig0gg0.',
        '..000gg000..',
        '.....00.....'
      ],
      [
        '...00..00...',
        '..0ii00ii0..',
        '.00iiiiii00.',
        '0iiiiiiiiii0',
        '0iiiiggiiig0',
        '.00ig00gi00.',
        '.00ig00gg00.',
        '0iiiiggiggg0',
        '0iiiiiggggg0',
        '.00iigggg00.',
        '..0ig00gg0..',
        '...00..00...'
      ]
    ]
  });

  // Rolling gear, in the place of the shockwave: the upper half of a big gear that runs along the floor, a
  // round GOLD rim with small teeth, a BRONZE web in one piece, a STONE hub on the floor. The teeth of s1
  // stand between those of s0.
  TG.Sprites.define('pr_rollgear', {
    w: 16, h: 8, anchor: [8, 8], fps: 10, owner: 'C',
    names: ['s0', 's1'],
    frames: [
      [
        '....00.00.00....',
        '..000i0ii0i000..',
        '.0i0iiiiiiii0i0.',
        '.0iiiiggggiiii0.',
        '00iiggggggggii00',
        '0iiigg0220ggiii0',
        '0iiig022220giii0',
        '0000000000000000'
      ],
      [
        '......0000......',
        '...00.0ii0.00...',
        '..0ii0iiii0ii0..',
        '00iiiiggggiiii00',
        '0iiiggggggggiii0',
        '.0iigg0220ggii0.',
        '0iiig022220giii0',
        '0000000000000000'
      ]
    ]
  });

  // Pendulum, in the place of the pickaxe: a round GOLD bob with BRONZE shade on a SILVER rod one pixel
  // wide, a BRONZE hanger. Four steps of a swing: p0 to the left and a row higher, p1 down, p2 to the right
  // and a row higher, p3 down again, the glint on the other side.
  TG.Sprites.define('pr_pendulum', {
    w: 16, h: 16, anchor: [8, 16], fps: 12, owner: 'C',
    names: ['p0', 'p1', 'p2', 'p3'],
    frames: [
      [
        '......00000.....',
        '......0ggg0.....',
        '.......030......',
        '......030.......',
        '......030.......',
        '.....030........',
        '...00030........',
        '..0iiii0........',
        '.0i3iiii0.......',
        '0i3iiiiig0......',
        '0iiiiiiig0......',
        '0iiiiiggg0......',
        '.0iigggg0.......',
        '..0gggg0........',
        '...0000.........',
        '................'
      ],
      [
        '......00000.....',
        '......0ggg0.....',
        '.......030......',
        '.......030......',
        '.......030......',
        '.......030......',
        '.......030......',
        '......0030......',
        '.....0iiii0.....',
        '....0i3iiii0....',
        '...0i3iiiiig0...',
        '...0iiiiiiig0...',
        '...0iiiiiggg0...',
        '....0iigggg0....',
        '.....0gggg0.....',
        '......0000......'
      ],
      [
        '......00000.....',
        '......0ggg0.....',
        '.......030......',
        '........030.....',
        '........030.....',
        '.........030....',
        '.........0300...',
        '........0iiii0..',
        '.......0i3iiii0.',
        '......0i3iiiiig0',
        '......0iiiiiiig0',
        '......0iiiiiggg0',
        '.......0iigggg0.',
        '........0gggg0..',
        '.........0000...',
        '................'
      ],
      [
        '......00000.....',
        '......0ggg0.....',
        '.......030......',
        '.......030......',
        '.......030......',
        '.......030......',
        '.......030......',
        '......0030......',
        '.....0iiii0.....',
        '....0iiii3i0....',
        '...0iiiiii3g0...',
        '...0iiiiiiig0...',
        '...0iiiiiggg0...',
        '....0iigggg0....',
        '.....0gggg0.....',
        '......0000......'
      ]
    ]
  });

})(typeof window !== 'undefined' ? window : globalThis);
