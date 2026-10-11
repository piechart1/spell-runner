// js/render.js
// TG.Render: draws one frame of the game (WP-F). CONTRACT 4.19, 5.13, 6.4 to 6.6, 11; DESIGN 4.3, 4.5,
// 5, 11.6, 13 and 14.
//
// File layout:
//   1. constants and module state
//   2. helpers: numbers, sprite info, drawing (sprites, clipped sprites, rects, glyphs)
//   3. backdrop: sky, parallax layers (drawBackdrop is public, used by TG.UI for the title screen)
//   4. the ground: tiles, gaps, plank bridges, the arena
//   5. props: decor, signposts, checkpoint flags; hazards with their chevrons; ink drops
//   6. the Baron and Lady Ratchet, the entities and their ground markers
//   7. Pip: run, jump, slide, fall, rescue bubble, hurt, victory, game over; shield ring; cast overlay
//   8. word plates: layoutLabels (CONTRACT 5.13), plates, tails, edge tags and lock brackets
//   9. draw: the order of CONTRACT 4.19
//
// Presentation only: nothing here writes to the state. Every position is floored (CONTRACT 11.4);
// screen x = floor(world x - camera.x) for every object, so nothing jitters against anything else.
// Only the canvas subset of CONTRACT 13.2 is used. No canvas is made per frame: sprite frames are
// cached by TG.Gfx and glyphs by TG.Font.
//
// Where this file goes beyond the contract (see the hand-over notes):
//   - Plates: the INK plate has 1 px more INK around it and its border outside that; plates keep 5 px
//     apart and 3 px from Pip and from the other typables' sprites; a plate that fits where it wants to
//     be keeps that place before the others move; plates stay at y >= 26 (y >= 37 in the arena, so that a
//     plate is not read as part of the boss bar).
//   - The arena sky darkens one step per boss phase: DEEP_BLUE, DEEP_BLUE with a PLUM dither, INK with a
//     PLUM dither (a PLUM sky would hide the far hills, which the dusk remap makes PLUM).
//   - Defeat (DESIGN 11.6): the picture freezes for 0.5 s; from 0.55 s the Baron is drawn at minion size,
//     spinning on his mound, and goes down the hole at 1.7 to 2.2 s.
//   - Ground markers lie 4 px below the ground line, so that Pip's feet do not hide them.
//   - Level 2's dangle sways on its thread and its flit flutters in its crossing (LEVEL2 4.3). Their plates
//     hold still, the flit's clear of the top of its flutter; the tail and the lock brackets go with the
//     sprite. A typable beyond the right edge has the right tag while it is also above the playfield.
//     TG.Render.sway(entity) and TG.Render.flutter(entity) give the two distances, so that TG.Effects can
//     begin a clear where the creature was drawn.
//   - Lady Ratchet (LEVEL2 10.1, 10.3, 10.4 and 10.7, with what LEVEL2 13.8 records of the art): her far
//     arm stays at rest; her key is shown one frame step to the half turn; in the long intro she checks her
//     watch and winds her key, where 10.1 has her lift her goggles; the needle of her gauge is at empty in
//     the finisher; after her defeat she sits wound down until 1.2 s and is then launched, with the letter
//     fountain of TG.Effects, her head the one without goggles from the moment they fly off. A minion in a
//     sprite of its own, the Baronet, comes up in front of his mound; in the intro's cameo he keeps his
//     helmet as he drops into the hatch.
//   - Two clocks (LEVEL2 6.3). The world's picture is animated from the scene clock, state.sceneTime, which
//     stands still while a Pocket Watch holds the world: the backdrop's frames and drift, the pool, the
//     flags, the swing of a hive or a lantern, the ink drops, the ground markers, a crate's power icon, the
//     frame of the shield ring, the boss. What prompts the player or answers a key runs on state.time and
//     does not hold: the chevrons and HOLD, the plates with their blinking borders, edge tags and lock
//     brackets, the ink spark, and Pip's bubble on the lifeLost screen. In a run with no watch the two
//     clocks are equal. Three things are drawn by the step count, state.frame, and go on under a watch as
//     well: the shield ring, which is drawn on alternate steps; Pip's blink while he is invulnerable, which
//     lasts the whole freeze after a hit just before it, because invulnT stands still; and the watch's own
//     frame. Held in the off half of its blink, the ring or Pip would be missing for the whole freeze.
//   - Level 2 names a remap for its ink drops (theme.inkRemap), and a colour for 1 px outside the RED border
//     of a plate in a boss phase whose band is close to RED (boss.urgentRim). That rim lies under the tails,
//     so that a plate's tail still joins its border.
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  // ---------------------------------------------------------------------------------------------
  // 1. Constants and module state
  // ---------------------------------------------------------------------------------------------

  var INK = 0, SHADOW = 1, STONE = 2, SILVER = 3, WHITE = 4, DEEP_BLUE = 5, AQUA = 11, GRASS = 14,
    GOLD = 18, RED = 25, CORAL = 26, PLUM = 28;

  var WORLD_SCREENS = { playing: true, lifeLost: true, bossIntro: true, boss: true, levelComplete: true,
    paused: true, gameOver: true };

  var QUILL_RUN = [6, -23];         // quill tip from Pip's anchor, facing right (WP-C hand-over)
  var QUILL_SLIDE = [8, -12];

  var PLATE_H = 10;
  var PLATE_MAX_Y = 174;            // CONTRACT 5.13 step 4
  var PLATE_GAP = 5;                // plates keep at least this many px apart: the INK margin and the border
                                    // are drawn 2 px outside the plate box, and 1 px stays between borders
  var SPRITE_GAP = 3;               // and this far from the sprites of other typables and from Pip
  var PLATE_MIN_Y = 26;             // the plate's margin and border (2 px above it) stay below the HUD strip
  var ARENA_PLATE_TOP = 37;         // in the arena the boss bar takes y 20 to 30; its border (y 35) stays 4 px below
  var FREEZE_TIME = 0.5;            // DESIGN 11.6: 30-frame freeze of the picture after the finisher
  var CANOPY_BOTTOM = 36;           // tree crowns of the branch and arch: y 20 to 35, the top rows under the HUD
  var MARKER_DY = 4;                // ground markers lie on the top rows of the ground, so Pip's feet do not hide them
  var DANGLE_SWAY = 2;              // LEVEL2 4.3: the dangle sways this many px either way on its thread,
  var DANGLE_SWAY_HZ = 0.4;         // this many times a world second
  var FLIT_FLUTTER = 4;             // LEVEL2 4.3: in its crossing the flit rises and falls this many px about its path,
  var FLIT_FLUTTER_HZ = 2;          // this many times a world second

  var canvas = null, ctx = null;
  var lastState = null, lastScreen = null;

  // ---------------------------------------------------------------------------------------------
  // 2. Helpers
  // ---------------------------------------------------------------------------------------------

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function num(v, fallback) {
    return isNum(v) ? v : fallback;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  var infoCache = {};
  function info(name) {
    if (hasOwn(infoCache, name)) return infoCache[name];
    var i = TG.Gfx && TG.Gfx.info ? TG.Gfx.info(name) : null;
    if (i) infoCache[name] = i;
    return i;
  }

  function fpsFrame(name, time) {
    var inf = info(name);
    if (!inf || !(inf.fps > 0) || inf.frames < 2) return 0;
    return Math.floor(time * inf.fps) % inf.frames;
  }

  var drawOpts = { flipX: false, remap: null, scale: 1, anchor: true };
  var getOpts = { flipX: false, remap: null };

  function sprite(c, name, frame, x, y, flip, remap) {
    if (!TG.Gfx || !TG.Gfx.draw) return;
    drawOpts.flipX = !!flip;
    drawOpts.remap = remap || null;
    drawOpts.scale = 1;
    drawOpts.anchor = true;
    TG.Gfx.draw(c, name, frame, x, y, drawOpts);
  }

  // A tile or other piece placed by its top-left corner.
  function tile(c, name, frame, x, y, remap) {
    if (!TG.Gfx || !TG.Gfx.draw) return;
    drawOpts.flipX = false;
    drawOpts.remap = remap || null;
    drawOpts.scale = 1;
    drawOpts.anchor = false;
    TG.Gfx.draw(c, name, frame, x, y, drawOpts);
  }

  // A sprite drawn only above the screen row clipY (the ground line), from the cached frame with the
  // 9-argument drawImage. There is no clip() in the canvas subset. A name from the level data that is
  // neither defined nor in the manifest is TG.Gfx's labelled box of 16 x 16, placed by its corner as
  // TG.Gfx.draw places it.
  function spriteClipped(c, name, frame, x, y, flip, remap, clipY) {
    if (!TG.Gfx || !TG.Gfx.get) return;
    var inf = info(name);
    getOpts.flipX = !!flip;
    getOpts.remap = remap || null;
    var cv = TG.Gfx.get(name, frame, getOpts);
    if (!cv) return;
    var w = inf ? inf.w : 16, h = inf ? inf.h : 16;
    var ax = inf ? (flip ? inf.w - inf.ax : inf.ax) : 0;
    var left = Math.floor(x) - ax, top = Math.floor(y) - (inf ? inf.ay : 0);
    var rows = Math.min(h, Math.floor(clipY) - top);
    if (rows <= 0) return;
    c.drawImage(cv, 0, 0, w, rows, left, top, w, rows);
  }

  // A sprite drawn only inside the screen box from x0, y0 to x1, y1 (the far edges not included), by the
  // same means as spriteClipped: the Baronet seen through the opening of Lady Ratchet's hatch.
  function spriteWithin(c, name, frame, x, y, flip, x0, y0, x1, y1) {
    if (!TG.Gfx || !TG.Gfx.get) return;
    var inf = info(name);
    getOpts.flipX = !!flip;
    getOpts.remap = null;
    var cv = TG.Gfx.get(name, frame, getOpts);
    if (!cv) return;
    var left = Math.floor(x) - (inf ? (flip ? inf.w - inf.ax : inf.ax) : 0), top = Math.floor(y) - (inf ? inf.ay : 0);
    var l = Math.max(left, x0), t = Math.max(top, y0);
    var w = Math.min(left + (inf ? inf.w : 16), x1) - l, h = Math.min(top + (inf ? inf.h : 16), y1) - t;
    if (w > 0 && h > 0) c.drawImage(cv, l - left, t - top, w, h, l, t, w, h);
  }

  function rect(c, x, y, w, h, color) {
    if (!(w > 0) || !(h > 0)) return;
    if (TG.Gfx && TG.Gfx.rect) {
      TG.Gfx.rect(c, x, y, w, h, color);
      return;
    }
    c.fillStyle = TG.PAL[color] || TG.PAL[INK];
    c.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  }

  // 1 px outline drawn outside the box x, y, w, h.
  function outline(c, x, y, w, h, color) {
    rect(c, x - 1, y - 1, w + 2, 1, color);
    rect(c, x - 1, y + h, w + 2, 1, color);
    rect(c, x - 1, y, 1, h, color);
    rect(c, x + w, y, 1, h, color);
  }

  function glyph(c, ch, x, y, color, scale) {
    if (TG.Font && TG.Font.drawGlyph) TG.Font.drawGlyph(c, ch, Math.floor(x), Math.floor(y), color, scale || 1);
  }

  // A glyph with a 1 px INK shadow to the right and below, so it reads over any background.
  function glyphShadow(c, ch, x, y, color) {
    glyph(c, ch, x + 1, y + 1, INK, 1);
    glyph(c, ch, x, y, color, 1);
  }

  // A short word of shadowed glyphs centred on cx.
  function wordShadow(c, str, cx, y, color) {
    var x0 = Math.floor(cx) - 4 * str.length;
    for (var i = 0; i < str.length; i++) glyphShadow(c, str.charAt(i), x0 + 8 * i, y, color);
  }

  function reduceFlash() {
    try {
      return !!(TG.Save && TG.Save.getSetting && TG.Save.getSetting('reduceFlash') === true);
    } catch (e) {
      return false;
    }
  }

  function effectsLabel(id) {
    return TG.Effects && TG.Effects.label ? TG.Effects.label(id) : null;
  }

  function casting() {
    return !!(TG.Effects && TG.Effects.casting && TG.Effects.casting());
  }

  function blinkOn(time, hz) {
    return Math.floor(time * hz * 2) % 2 === 0;
  }

  // The clock of the world's picture (LEVEL2 6.3): state.sceneTime, which runs with state.time and stands
  // still while a Pocket Watch holds the world. A state without it is animated from state.time.
  function sceneClock(state) {
    return num(state.sceneTime, num(state.time, 0));
  }

  // The section (or arena) object and its palette name for the state.
  function sectionOf(state) {
    var level = state.level;
    var i = num(state.section, 0);
    if (i >= 3 || !level.sections[i]) return level.arena || level.sections[level.sections.length - 1];
    return level.sections[i];
  }

  function backdropOf(state) {
    var id = state.level && state.level.theme ? state.level.theme.backdrop : null;
    return id && TG.Backdrops ? TG.Backdrops[id] || null : null;
  }

  function paletteOf(bd, name) {
    if (!bd || !bd.palettes) return null;
    return bd.palettes[name] || bd.palettes.day || null;
  }

  // Level 1's tile and hazard sprites, for a theme that does not name one (CONTRACT 5.9 theme.tiles and
  // theme.hazardSkins; LEVEL2 3.4). archTrunk, the trunks under an arch, has no entry: it defaults to trunk.
  var TILES = {
    top: 'tile_grass', fill: 'tile_soil', edgeL: 'tile_edge_l', edgeR: 'tile_edge_r', wallL: 'tile_wall_l',
    wallR: 'tile_wall_r', gapFill: 'tile_water', gapFillDark: 'tile_dark', plank: 'tile_plank',
    arenaTop: 'tile_arena', arenaFill: 'tile_soil', rail: 'tile_rail'
  };
  var HAZARD_SKINS = {
    bramble: 'haz_bramble', branch: 'haz_branch', trunk: 'haz_trunk', canopy: 'haz_canopy',
    beehive: 'haz_beehive', rope: 'haz_rope', arch: 'haz_arch'
  };

  // The sprite name that level.theme[group] gives for key, or null.
  function themeName(level, group, key) {
    var names = level.theme ? level.theme[group] : null;
    var name = names ? names[key] : null;
    return typeof name === 'string' && name ? name : null;
  }

  function tileName(level, key) {
    return themeName(level, 'tiles', key) || TILES[key];
  }

  function hazardSkin(level, key) {
    return themeName(level, 'hazardSkins', key) || HAZARD_SKINS[key];
  }

  // ---------------------------------------------------------------------------------------------
  // 3. Backdrop (CONTRACT 6.5)
  // ---------------------------------------------------------------------------------------------

  // skyOverride: null, or { color, dither } for the first band (the Hourglass, the boss phases).
  function drawSky(c, pal, time, skyColor, skyDither) {
    var C = TG.C;
    var bands = pal && pal.sky ? pal.sky : [{ y: 0, h: C.GROUND_Y, color: 7 }];
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      var color = i === 0 && skyColor !== null ? skyColor : b.color;
      rect(c, 0, b.y, C.W, b.h, color);
      var dith = i === 0 && skyDither !== null ? skyDither : b.dither;
      if (isNum(dith) && TG.Gfx && TG.Gfx.dither) TG.Gfx.dither(c, 0, b.y, C.W, b.h, dith, 0);
    }
    // The palette may name the sprites of its stars and its moon (LEVEL2 3.3); the moon is drawn with the
    // frame of its fps, which is frame 0 for bg_moon.
    if (pal && pal.stars) {
      var star = pal.starSprite || 'bg_star';
      for (var s = 0; s < pal.stars.length; s++) {
        var st = pal.stars[s];
        sprite(c, star, (Math.floor(time * 2) + s) % 2, st.x, st.y, false, null);
      }
    }
    if (pal && pal.moon) {
      var moon = pal.moonSprite || 'bg_moon';
      sprite(c, moon, fpsFrame(moon, time), pal.moon.x, pal.moon.y, false, null);
    }
  }

  // Parallax layers: those with front: true when `front` is set (L6), the others (L1 to L4) otherwise.
  function drawLayers(c, bd, pal, camX, time, section, front) {
    var C = TG.C;
    if (!bd || !bd.layers) return;
    var remap = pal && pal.remap ? pal.remap : null;
    for (var l = 0; l < bd.layers.length; l++) {
      var layer = bd.layers[l];
      if (!!layer.front !== !!front) continue;
      var rep = layer.repeat > 0 ? layer.repeat : C.W;
      var off = Math.floor(camX * num(layer.factor, 0) + time * num(layer.drift, 0));
      for (var k = 0; k < layer.items.length; k++) {
        var item = layer.items[k];
        if (item.sections && item.sections.indexOf(section) === -1) continue;
        var inf = info(item.sprite);
        var w = inf ? inf.w : 16, ax = inf ? inf.ax : 0;
        var frame = fpsFrame(item.sprite, time);
        var x0 = item.x - off;
        x0 = ((x0 % rep) + rep) % rep - rep;
        for (var x = x0; x - ax < C.W; x += rep) {
          if (x - ax + w <= 0) continue;
          sprite(c, item.sprite, frame, x, item.y, false, remap);
        }
      }
    }
  }

  // Public (CONTRACT 4.19): parallax layers L0 to L4. palette: a palette name of the backdrop, or a
  // palette object.
  function drawBackdrop(c, backdropId, palette, camX, time, sectionIndex) {
    if (!c) return;
    var bd = TG.Backdrops ? TG.Backdrops[backdropId] : null;
    var pal = typeof palette === 'string' ? paletteOf(bd, palette) : (palette || paletteOf(bd, 'day'));
    var t = num(time, 0);
    drawSky(c, pal, t, null, null);
    drawLayers(c, bd, pal, num(camX, 0), t, num(sectionIndex, 0), false);
  }

  // ---------------------------------------------------------------------------------------------
  // 4. The ground (CONTRACT 5.9 "Ground rule", 6.4 tiles)
  // ---------------------------------------------------------------------------------------------

  var viewGaps = [];     // gaps that touch the view this frame; reused

  function gapFillOf(level, gap) {
    var sec = level.sections[num(gap.section, 0)];
    return sec && sec.gapFill === 'dark' ? 'dark' : 'water';
  }

  function drawGround(c, state, camX, remap, time) {
    var C = TG.C, T = C.TILE;
    var level = state.level;
    var G = C.GROUND_Y;
    var c0 = Math.floor(camX / T), c1 = Math.floor((camX + C.W) / T);
    var x0 = c0 * T - T, x1 = (c1 + 2) * T;
    viewGaps.length = 0;
    var hz = level.hazards || [];
    for (var i = 0; i < hz.length; i++) {
      var h = hz[i];
      if (h.kind === 'gap' && h.x + h.w > x0 && h.x < x1) viewGaps.push(h);
    }
    var arenaTiles = num(level.arenaTilesX, Infinity);
    var water = Math.floor(time * 3) % 2;
    for (var col = c0; col <= c1; col++) {
      var wx = col * T;
      var sx = Math.floor(wx - camX);
      var gap = null, leftOf = false, rightOf = false;
      for (var g = 0; g < viewGaps.length; g++) {
        var q = viewGaps[g];
        if (wx >= q.x && wx < q.x + q.w) gap = q;
        else if (!q.bridged && wx + T === q.x) leftOf = true;
        else if (!q.bridged && wx === q.x + q.w) rightOf = true;
      }
      if (gap) {
        // The upper row of a gap is darkness; the lower row is the theme's gap fill (water in Level 1) or
        // its dark fill.
        var dark = gapFillOf(level, gap) === 'dark';
        rect(c, sx, G, T, T, INK);
        tile(c, tileName(level, dark ? 'gapFillDark' : 'gapFill'), dark ? 0 : water, sx, G + T, remap);
        if (gap.bridged) tile(c, tileName(level, 'plank'), 0, sx, G, remap);
      } else if (wx >= arenaTiles) {
        tile(c, tileName(level, 'arenaTop'), ((col % 2) + 2) % 2, sx, G, remap);
        tile(c, tileName(level, 'rail'), 0, sx, G, remap);
        tile(c, tileName(level, 'arenaFill'), (((col + 1) % 2) + 2) % 2, sx, G + T, remap);
      } else if (leftOf) {
        tile(c, tileName(level, 'edgeL'), 0, sx, G, remap);
        tile(c, tileName(level, 'wallL'), 0, sx, G + T, remap);
      } else if (rightOf) {
        tile(c, tileName(level, 'edgeR'), 0, sx, G, remap);
        tile(c, tileName(level, 'wallR'), 0, sx, G + T, remap);
      } else {
        tile(c, tileName(level, 'top'), ((col % 2) + 2) % 2, sx, G, remap);
        tile(c, tileName(level, 'fill'), (((col + 1) % 2) + 2) % 2, sx, G + T, remap);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // 5. Props, hazards, ink drops
  // ---------------------------------------------------------------------------------------------

  function visible(sx, w) {
    return sx + w > -32 && sx - w < TG.C.W + 32;
  }

  function drawProps(c, state, camX, time) {
    var C = TG.C;
    var level = state.level;
    var p = state.player;
    var i;
    var decor = level.decor || [];
    for (i = 0; i < decor.length; i++) {
      var d = decor[i];
      var dx = Math.floor(d.x - camX);
      if (visible(dx, 64)) sprite(c, d.sprite, 0, dx, num(d.y, C.GROUND_Y), false, null);
    }
    // Signposts at the best take-off point, hazard.postX, inside the input window (DESIGN 5).
    var hz = level.hazards || [];
    for (i = 0; i < hz.length; i++) {
      var h = hz[i];
      if (h.bridged) continue;
      var sx = Math.floor(num(h.postX, h.winStart) - camX);
      if (visible(sx, 16)) sprite(c, h.action === 'duck' ? 'sign_duck' : 'sign_jump', 0, sx, C.GROUND_Y, false, null);
    }
    // Checkpoint flags: down until raised; the pennant rises over 0.3 s as Pip passes, then waves.
    var cps = level.checkpoints || [];
    for (i = 0; i < cps.length; i++) {
      var cp = cps[i];
      var fx = Math.floor(num(cp.flagX, cp.x) - camX);
      if (!visible(fx, 32)) continue;
      var frame = 'down';
      if (cp.raised) {
        var past = p ? p.x - num(cp.flagX, cp.x) : 999;
        if (past >= 0 && past < 7) frame = 'rise0';
        else if (past >= 7 && past < 14) frame = 'rise1';
        else frame = Math.floor(time * 4) % 2 === 0 ? 'wave0' : 'wave1';
      }
      sprite(c, 'flag_pole', frame, fx, C.GROUND_Y, false, null);
    }
  }

  // Chevron above a hazard or attack: GOLD, blinking at 2 Hz, steady while its window is open. now:
  // state.time. A chevron prompts a key, as the HUD's key prompt does, and blinks on through a Pocket
  // Watch: held in the dark half of its blink it would be missing for the whole freeze.
  function chevron(c, up, cx, y, now, steady) {
    if (!steady && !blinkOn(now, 2)) return;
    var ch = TG.Font && TG.Font.SYM ? (up ? TG.Font.SYM.CHEV_UP : TG.Font.SYM.CHEV_DOWN) : (up ? '{' : '}');
    glyphShadow(c, ch, cx - 4, y, GOLD);
  }

  // remap: the section's palette remap, for the tree crowns (the hazards themselves keep their colours).
  // time: the scene clock, for the swing; now: state.time, for the chevrons and HOLD.
  function drawHazards(c, state, camX, time, now, remap) {
    var C = TG.C;
    var level = state.level;
    var p = state.player;
    var px = p ? p.x : -Infinity;
    var G = C.GROUND_Y, HANG = C.GROUND_Y - C.HANG_CLEAR;
    var hz = level.hazards || [];
    for (var i = 0; i < hz.length; i++) {
      var h = hz[i];
      var sx = Math.floor(h.x - camX);
      if (!visible(sx, h.w + 16)) continue;
      var inWin = px >= h.winStart && px <= h.winEnd;
      var showChev = !h.bridged && !h.passed;
      var y;
      switch (h.kind) {
        case 'gap':
          if (showChev) chevron(c, true, sx + h.w / 2, G - 13, now, inWin);
          break;
        case 'bramble':
          sprite(c, hazardSkin(level, 'bramble'), 0, sx, G, false, null);
          if (showChev) chevron(c, true, sx + 8, G - 22, now, inWin);
          break;
        case 'branch':
          sprite(c, hazardSkin(level, 'branch'), 0, sx, HANG, false, null);
          var trunk = hazardSkin(level, 'trunk');
          for (y = HANG - 16; y > C.PLAY_TOP - 16; y -= 16) sprite(c, trunk, 0, sx, y, false, null);
          // The trunk ends in a tree crown at the top of the playfield (its top rows run under the HUD).
          sprite(c, hazardSkin(level, 'canopy'), 0, sx - 16, CANOPY_BOTTOM, false, remap);
          if (showChev) chevron(c, false, sx + 8, HANG - 27, now, inWin);
          break;
        case 'beehive':
          // The hive swings up to 6 px either way; the rope leans with it (cosmetic, DESIGN 5).
          var swing = Math.round(Math.sin(time * 2.4 + h.x * 0.013) * 6);
          sprite(c, hazardSkin(level, 'beehive'), 0, sx + swing, HANG, false, null);
          var rope = hazardSkin(level, 'rope');
          var ropeTop = HANG - 24;
          for (y = ropeTop; y > C.PLAY_TOP - 16; y -= 16) {
            var lean = Math.round(swing * (y - C.PLAY_TOP) / (ropeTop - C.PLAY_TOP + 16));
            sprite(c, rope, 0, sx + lean, y, false, null);
          }
          if (showChev) chevron(c, false, sx + 8 + swing, HANG - 35, now, inWin);
          break;
        case 'arch':
          sprite(c, hazardSkin(level, 'arch'), 0, sx, HANG, false, null);
          // The trunks under the arch's ends are the theme's archTrunk, or its trunk.
          var archTrunk = themeName(level, 'hazardSkins', 'archTrunk') || hazardSkin(level, 'trunk');
          for (y = HANG - 16; y > C.PLAY_TOP - 16; y -= 16) {
            sprite(c, archTrunk, 0, sx, y, false, null);
            sprite(c, archTrunk, 0, sx + h.w - 16, y, false, null);
          }
          sprite(c, hazardSkin(level, 'canopy'), 0, sx + Math.floor(h.w / 2) - 24, CANOPY_BOTTOM, false, remap);
          if (showChev) {
            var held = inWin || (px > h.winStart && px < h.holdUntil);
            chevron(c, false, sx + h.w / 2, HANG - 27, now, held);
            // The arch is the one hazard that needs the duck key held (DESIGN 5): HOLD above its
            // chevron on every difficulty, blinking and steady with it. While the Easy key prompt
            // (hud.js drawKeyPrompt) shows HOLD over its ENTER keycap above Pip, this sign gives way
            // to it, so the two labels do not overlap as the arch scrolls in.
            var prompted = h.prompt && px >= h.winStart && px <= h.holdUntil &&
              (state.screen === 'playing' || state.screen === 'lifeLost');
            if (!prompted && (held || blinkOn(now, 2))) wordShadow(c, 'HOLD', sx + h.w / 2, HANG - 37, GOLD);
          }
          break;
      }
    }
  }

  // The ink drops, under the remap the level names for them: theme.inkRemap (LEVEL2 3.1, rule 2: on Level
  // 2's dark bands the ROYAL drop is drawn paler). With none they have their own colours, as in Level 1.
  function drawItems(c, state, camX, time) {
    var items = state.items || [];
    var frame = Math.floor(time * 8) % 4;
    var theme = state.level.theme;
    var remap = theme && typeof theme.inkRemap === 'string' && theme.inkRemap ? theme.inkRemap : null;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var sx = Math.floor(it.x - camX);
      if (sx < -8 || sx > TG.C.W + 8) continue;
      sprite(c, 'item_ink', frame, sx, it.y, false, remap);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // 6. The Baron, Lady Ratchet and the entities (CONTRACT 6.4 boss composition, 6.6; LEVEL2 10)
  // ---------------------------------------------------------------------------------------------

  var HEAD_FRAME = { laugh: 'laugh', hurt: 'hurt', dizzy: 'dizzy' };

  // The sprites of each boss by boss.kind (LEVEL2 10.6), with the Baron as the default: the parts of
  // drawBoss (CONTRACT 6.4) with the base he stands behind, the thing in his hand in the intro gesture,
  // and the minion-size figure of drawDefeat. Lady Ratchet has a key in her back and nothing in her hand
  // (her watch is a frame of her arm); her small figure is the Baronet of the intro's cameo. drawRatchet
  // puts her together.
  var BOSS_PARTS = {
    baron: { body: 'boss_body', arm: 'boss_arm', head: 'boss_head', base: 'boss_mound', gesture: 'boss_monocle',
      small: 'en_digby' },
    ratchet: { body: 'boss2_body', arm: 'boss2_arm', head: 'boss2_head', base: 'boss2_engine', key: 'boss2_key',
      small: 'en_baronet' }
  };

  function bossParts(boss) {
    return hasOwn(BOSS_PARTS, boss.kind) ? BOSS_PARTS[boss.kind] : BOSS_PARTS.baron;
  }

  function drawBoss(c, state, camX, time) {
    var C = TG.C;
    var boss = state.boss;
    if (!boss) return;
    var bx = Math.floor(num(boss.x, 0) - camX);
    var by = Math.floor(num(boss.y, C.GROUND_Y));
    if (!visible(bx, 48)) return;
    var r = clamp(Math.floor(num(boss.rise, 0)), 0, 60);
    var pose = boss.pose || 'idle';
    var parts = bossParts(boss);

    // A letter of a weak-point or finisher word makes him flinch and flash.
    var lab = boss.word ? effectsLabel(boss.word.id) : null;
    if (lab && lab.flinch) bx += lab.flinch;
    var white = (num(boss.flashT, 0) > 0 && !reduceFlash()) || (lab && lab.white);

    // Lady Ratchet is put together her own way, her intro and her defeat with her (LEVEL2 10.1, 10.7).
    if (parts === BOSS_PARTS.ratchet) {
      drawRatchet(c, state, parts, bx, by, r, white, time);
      return;
    }

    if (state.screen === 'levelComplete' && boss.state === 'defeated') {
      if (drawDefeat(c, state, parts, bx, by, time)) return;
    }

    var nearArm = (pose === 'raise' || pose === 'stomp') ? 'raise' : (pose === 'throw' ? 'throw' : 'rest');
    var farArm = pose === 'raise' ? 'raise' : (pose === 'throw' ? 'throw' : 'rest');
    var headRemap = white ? 'white' : (boss.lampRed ? 'lampred' : null);
    // The helmet lamp flashes as he laughs at the start of a taunt (DESIGN 11.6).
    if (!white && boss.state === 'taunt' && num(boss.stateT, 9) < 0.6) {
      headRemap = Math.floor(time * 15) % 2 === 0 ? (boss.lampRed ? null : 'lampred') : (boss.lampRed ? 'lampred' : null);
    }
    var bodyRemap = white ? 'white' : null;
    var stomp = pose === 'stomp' ? 2 : 0;

    spriteClipped(c, parts.body, Math.floor(time * 4) % 2, bx, by - 8 + r + stomp, false, bodyRemap, by);
    spriteClipped(c, parts.arm, farArm, bx + 20, by - 26 + r + stomp, true, bodyRemap, by);
    spriteClipped(c, parts.head, HEAD_FRAME[pose] || 'normal', bx - 2, by - 34 + r + stomp, false, headRemap, by);
    // Intro (DESIGN 11.6): once he is up he polishes his monocle, then laughs.
    var polish = boss.state === 'intro' && state.screen === 'bossIntro' ? introPolish(boss) : -1;
    if (polish >= 0) nearArm = 'raise';
    spriteClipped(c, parts.arm, nearArm, bx - 20, by - 26 + r + stomp, false, bodyRemap, by);
    if (polish >= 0) {
      var a = polish * Math.PI * 6;
      sprite(c, parts.gesture, 0, bx - 7 + Math.round(Math.cos(a) * 2), by - 44 + r + Math.round(Math.sin(a) * 2), false,
        Math.floor(time * 12) % 2 === 0 ? 'white' : null);
    }
    sprite(c, parts.base, 0, bx, by, false, null);
    if (pose === 'dizzy' && r < 30) dizzyStars(c, bx - 2, by - 60 + r, 16, time);
  }

  // 0..1 through the monocle polish of the intro (from 40% to 60% of the intro), or -1 outside it.
  function introPolish(boss) {
    var len = num(boss.introTime, num(TG.C.BOSS_INTRO_TIME, 4));
    if (!(len > 0)) return -1;
    var u = num(boss.stateT, 0) / len;
    return u >= 0.4 && u < 0.6 ? (u - 0.4) / 0.2 : -1;
  }

  // Stars circling a dizzy head.
  function dizzyStars(c, cx, cy, radius, time) {
    for (var k = 0; k < 3; k++) {
      var a = time * 5 + k * 2.094;
      sprite(c, 'fx_star', Math.floor(time * 8 + k) % 2, Math.floor(cx + Math.cos(a) * radius), Math.floor(cy + Math.sin(a) * 4), false, null);
    }
  }

  // DESIGN 11.6 defeat, after the freeze and the flash: he spins, shrinks to minion size and goes
  // down the hole in his mound; TG.Effects throws the helmet and the letter fountain. Returns false
  // while the full-size Baron is still to be drawn.
  function drawDefeat(c, state, parts, bx, by, time) {
    var t = num(state.screenT, 0);
    if (t < 0.55) return false;
    if (t < 1.7) {
      sprite(c, parts.small, 'spin', bx, by - 11, Math.floor(t * 20) % 2 === 1, null);
      dizzyStars(c, bx, by - 30, 10, time);
    } else if (t < 2.2) {
      var sink = Math.floor((t - 1.7) / 0.5 * 18);
      spriteClipped(c, parts.small, 'spin', bx, by - 11 + sink, false, null, by);
    }
    sprite(c, parts.base, 0, bx, by, false, null);
    return true;
  }

  // --- Lady Ratchet (LEVEL2 10.1, 10.3, 10.4, 10.7, and the build record of 13.8) -----------------

  var RISE_HIDDEN = 40;             // boss.rise while a boss is out of sight behind its base (js/boss.js)

  // Her key (LEVEL2 10.3) turns once a second in phase 1, twice in phase 2 and four times in phase 3, and
  // eight times a second while her arm is up for an attack. Its four frames are four steps of half a turn,
  // after which the bow looks the same again. One frame step is shown for each half turn of those rates:
  // 2, 4, 8 and 16 steps a second, each twice the one before and all of them slow enough to be seen. (At
  // the eight frames of a true turn the telegraph would ask for 64 steps a second, more than a display shows.)
  var KEY_STEPS = [2, 4, 8];        // frame steps a second in phase 1, 2 and 3
  var KEY_STEPS_RAISED = 16;        // and while her arm is up

  // The long intro (LEVEL2 10.1), as fractions of the intro's length.
  var INTRO_CAMEO = 0.25;           // the Baronet's cameo ends here: the hatch shuts and she begins to rise
  var INTRO_UP = 0.5;               // she is up, and her gesture begins: she holds her watch up
  var INTRO_CLICKS = [0.55, 0.6, 0.65];   // and winds her key three clicks, one frame step each. TG.Audio plays
                                    // its `click` at the same three (INTRO_CLICKS there; test/test-audio.js compares them)
  var INTRO_LAUGH = 0.7;            // the gesture ends and she laughs
  var CAMEO_RUN = 304;              // px the Baronet crosses to reach the hatch: from screen x -8 to 296,
  var CAMEO_HOPS = 6;               // in this many hops,
  var CAMEO_HOP = 6;                // each this high, px
  var CAMEO_DROP = 0.9;             // he is at the hatch at this fraction of the cameo, and goes down into it
                                    // over the rest (its last 0.1 s)
  // The opening of the hatch in the engine's `open` frame, in px from bx, by: 10 px wide between the
  // jambs, from under the arch to the ground line.
  var HATCH_LEFT = -5, HATCH_RIGHT = 5, HATCH_TOP = -12;

  // Her defeat (LEVEL2 10.7), s of the levelComplete screen. Until DEFEAT_START the picture is frozen and
  // then flashes, as for the Baron; TG.Effects throws her key from there on.
  var DEFEAT_START = 0.55;
  var LAUNCH_AT = 1.2;              // the hatch bursts and she is launched up the shaft: the SPROING of her defeat
                                    // sound (LEVEL2 11.3), and the moment TG.Effects starts the letter fountain
  var LAUNCH_SPEED = 480;           // px a second

  // How far the long intro has run, 0 to 1 (boss.stateT over the intro's length), or -1 outside it. The
  // short intro after a continue has neither cameo nor gesture: she rises as boss.rise says and laughs from
  // the half, as the Baron does, so it is -1 too.
  function longIntro(boss) {
    var len = num(boss.introTime, TG.C.BOSS_INTRO_TIME);
    if (boss.state !== 'intro' || !(len > TG.C.BOSS_INTRO_SHORT)) return -1;
    return clamp(num(boss.stateT, 0) / len, 0, 1);
  }

  // The frame of her key, 0 to 3 (LEVEL2 10.3). It turns forward, k0 to k3, at the rate of her phase, and
  // faster while her arm is up; it is still in the intro, a recoil, a laugh and the defeat; in the finisher
  // each letter typed cranks it one step back (10.7).
  function keyFrame(boss, time) {
    var st = boss.state;
    if (st === 'finisher') return (4 - (boss.word ? Math.floor(num(boss.word.typed, 0)) : 0) % 4) % 4;
    if (st === 'intro' || st === 'recoil' || st === 'laugh' || st === 'defeated') return 0;
    var rate = boss.pose === 'raise' ? KEY_STEPS_RAISED : KEY_STEPS[clamp(Math.floor(num(boss.phase, 1)), 1, 3) - 1];
    return Math.floor(time * rate) % 4;
  }

  // The needle of the boiler gauge (LEVEL2 10.4): the centre of the dial on the engine's left and 3 px
  // from it, from the left (empty) over the top to the right (full). It shows the part of the volley that
  // was cleared, one notch for each cog, so that a full gauge says the long weak-point window is coming.
  // It is RED while a window is open, and at empty once she is wound down.
  function drawNeedle(c, boss, bx, by) {
    var v = boss.volley;
    var n = v && v.toLaunch ? v.toLaunch.length : 0;
    var woundDown = boss.state === 'finisher' || boss.state === 'defeated';
    var a = Math.PI * (1 - (n > 0 && !woundDown ? clamp(num(v.hits, 0) / n, 0, 1) : 0));
    var color = boss.state === 'taunt' && boss.word ? RED : INK;
    for (var k = 0; k <= 3; k++) rect(c, bx - 18 + needleStep(Math.cos(a) * k), by - 10 - needleStep(Math.sin(a) * k), 1, 1, color);
  }

  // A distance along the needle as whole px, a half going towards the centre. The needle at one third is
  // then the mirror of the needle at two thirds, whatever the last bit of the cosine is, and both end on
  // the dial and not on its rim.
  function needleStep(d) {
    return d < 0 ? -Math.round(-d - 1e-6) : Math.round(d - 1e-6);
  }

  // The cameo of the long intro (LEVEL2 10.1, 4.4): the Baronet hops in from the left edge of the view at
  // a steady pace, lands in front of the open hatch and goes down into it. q: 0 to 1 through the cameo; t:
  // the intro's clock, which turns him as he goes down. Drawn over the engine.
  function drawCameo(c, name, bx, by, q, t) {
    if (q < CAMEO_DROP) {
      var run = q / CAMEO_DROP;
      var f = run * CAMEO_HOPS % 1;
      sprite(c, name, 'up', bx - Math.round(CAMEO_RUN * (1 - run)), by - Math.round(CAMEO_HOP * 4 * f * (1 - f)), true, null);
      return;
    }
    // He is in the hatch and falls, spinning: only what the opening shows of him is drawn, so that the
    // jambs, the arch and the gauge stay in front. He is turned from side to side in his `up` frame: the
    // `spin` frame that 4.4 names is the bare head of his clear, and in it his helmet would be gone for
    // these six frames.
    var d = (q - CAMEO_DROP) / (1 - CAMEO_DROP);
    spriteWithin(c, name, 'up', bx, by + Math.round(16 * d * d), Math.floor(t * 20) % 2 === 1,
      bx + HATCH_LEFT, by + HATCH_TOP, bx + HATCH_RIGHT, by);
  }

  // LEVEL2 10.1: body, far arm, key, head, near arm and engine, in that order, the parts clipped at the
  // ground line as the Baron's are. The far arm stays at rest (13.8: raised with the near one she would
  // hold two spanners). r: boss.rise, floored; white: the flash of a hit or of a correct key.
  function drawRatchet(c, state, parts, bx, by, r, white, time) {
    var boss = state.boss;
    var st = boss.state;
    var pose = boss.pose || 'idle';
    var head = HEAD_FRAME[pose] || 'normal';
    var nearArm = (pose === 'raise' || pose === 'stomp') ? 'raise' : (pose === 'throw' ? 'throw' : (st === 'taunt' ? 'watch' : 'rest'));
    // The body: the foot taps through a taunt, and she is slumped once she is wound down.
    var body = st === 'finisher' || st === 'defeated' ? 1 : Math.floor(time * (st === 'taunt' ? 4 : 1)) % 2;
    var key = keyFrame(boss, time);
    var hatch = 'shut', rattle = 0, lift = 0, flip = false;

    // The long intro: the cameo with her out of sight, whatever boss.rise says; her rise, which meets
    // boss.rise at the half; her gesture; her laugh, which is the pose's.
    var u = longIntro(boss);
    if (u >= 0) {
      if (u < INTRO_CAMEO) {
        r = RISE_HIDDEN;
        hatch = 'open';
      } else if (u < INTRO_UP) {
        r = Math.floor(RISE_HIDDEN * (INTRO_UP - u) / (INTRO_UP - INTRO_CAMEO));
      } else if (u < INTRO_LAUGH) {
        // The gesture (13.8): she checks her watch and winds her key. Her frames cannot show the goggles
        // lifted, as 10.1 has it.
        head = 'normal';
        nearArm = 'watch';
      }
      for (var k = 0; k < INTRO_CLICKS.length; k++) if (u >= INTRO_CLICKS[k]) key = k + 1;
    }
    // The engine shakes by 1 px while she comes up through it, in either intro.
    if (st === 'intro' && r > 0 && r < RISE_HIDDEN) rattle = Math.floor(num(boss.stateT, 0) * 20) % 2;
    // The hatch opens to send the minion out.
    var v = boss.volley;
    if (st === 'volley' && pose === 'throw' && v && v.toLaunch && v.toLaunch[v.launched - 1] === 'minion') hatch = 'open';

    // The defeat, after the freeze and the flash: her key is gone and her goggles are off, and then the
    // hatch bursts open and she is launched straight up out of the playfield, spinning: her body is flipped
    // twenty times a second, not rotated. TG.Effects throws the key and the goggles, so her head is the
    // frame without goggles: the dizzy head that 10.7 names wears a pair, and she would have two. boss.rise
    // sinks a defeated boss into its base in the last second; she has left by then, and is not drawn once
    // every part of her is above the screen.
    var t = state.screen === 'levelComplete' && st === 'defeated' ? num(state.screenT, 0) : 0;
    if (t >= DEFEAT_START) {
      key = -1;
      head = 'hurt';
    }
    if (t >= LAUNCH_AT) {
      hatch = 'open';
      lift = Math.floor(LAUNCH_SPEED * (t - LAUNCH_AT));
      flip = Math.floor(t * 20) % 2 === 1;
    }

    if (lift < by) {
      var remap = white ? 'white' : null;
      var headRemap = white ? 'white' : (boss.lampRed ? 'lampred' : null);
      // Her lenses flash as she laughs at the start of a taunt, as the Baron's lamp does (LEVEL2 10.5).
      if (!white && st === 'taunt' && num(boss.stateT, 9) < 0.6 && Math.floor(time * 15) % 2 === 0) {
        headRemap = boss.lampRed ? null : 'lampred';
      }
      var dy = r + (pose === 'stomp' ? 2 : 0) - lift;
      spriteClipped(c, parts.body, body, bx, by - 8 + dy, flip, remap, by);
      spriteClipped(c, parts.arm, 'rest', bx + 20, by - 26 + dy, true, remap, by);
      if (key >= 0) spriteClipped(c, parts.key, key, bx + 14, by - 30 + dy, false, remap, by);
      spriteClipped(c, parts.head, head, bx - 2, by - 34 + dy, false, headRemap, by);
      spriteClipped(c, parts.arm, nearArm, bx - 20, by - 26 + dy, false, remap, by);
    }
    sprite(c, parts.base, hatch, bx + rattle, by, false, null);
    drawNeedle(c, boss, bx + rattle, by);
    if (u >= 0 && u < INTRO_CAMEO) drawCameo(c, parts.small, bx, by, u / INTRO_CAMEO, num(boss.stateT, 0));
    if (pose === 'dizzy' && r < 30 && lift === 0) dizzyStars(c, bx - 2, by - 60 + r, 16, time);
  }

  // The sprite of each kind (CONTRACT 5.4), for when js/entities.js is not loaded.
  var KIND_SPRITE = {
    boulder: 'en_boulder', dawdle: 'en_dawdle', hoppet: 'en_hoppet', buzzle: 'en_buzzle', swoop: 'en_swoop',
    truffle: 'en_truffle', digby: 'en_digby', rock: 'pr_rock', crate: 'crate_balloon', shock: 'pr_shock',
    pick: 'pr_pickaxe'
  };

  function kindSprite(kind) {
    var K = TG.Entities && TG.Entities.KINDS;
    if (K && hasOwn(K, kind)) return K[kind].sprite;
    return hasOwn(KIND_SPRITE, kind) ? KIND_SPRITE[kind] : 'en_' + kind;
  }

  // The level's skin for a kind (LEVEL2 4.5): theme.skins[kind] = { sprite, remap }, either part optional;
  // null when the level has none.
  function themeSkin(state, kind) {
    var skins = state.level.theme ? state.level.theme.skins : null;
    return skins && hasOwn(skins, kind) && skins[kind] ? skins[kind] : null;
  }

  // The sprite an entity is drawn with (LEVEL2 4.5): its own skin if it has one, else the sprite of the
  // level's skin for its kind, else the sprite of its kind in KINDS. A skin keeps the frames of the
  // sprite it replaces.
  function skinFor(state, e) {
    if (typeof e.skin === 'string' && e.skin) return e.skin;
    var skin = themeSkin(state, e.kind);
    if (skin && typeof skin.sprite === 'string' && skin.sprite) return skin.sprite;
    return kindSprite(e.kind);
  }

  // The remap of the level's skin for an entity's kind, or null. An entity with a skin of its own is
  // drawn in that sprite's colours: the remap is written for the look of the kind.
  function skinRemap(state, e) {
    if (typeof e.skin === 'string' && e.skin) return null;
    var skin = themeSkin(state, e.kind);
    return skin && typeof skin.remap === 'string' && skin.remap ? skin.remap : null;
  }

  // The dangle's thread (LEVEL2 4.3): 1 px of SILVER from the top of the playfield at x0, the anchor, down
  // to the top of the sprite at x1 and row `bottom`. The two are at most DANGLE_SWAY px apart, so the line
  // is one upright run for each x it passes through. Nothing is drawn while the sprite is above the top.
  function drawThread(c, x0, x1, bottom) {
    var top = TG.C.PLAY_TOP;
    var runs = Math.abs(x1 - x0) + 1, step = x1 < x0 ? -1 : 1;
    for (var k = 0; k < runs; k++) {
      var y = top + Math.floor((bottom - top) * k / runs);
      rect(c, x0 + k * step, y, 1, top + Math.floor((bottom - top) * (k + 1) / runs) - y, SILVER);
    }
  }

  // Two kinds are drawn a little away from the place the simulation gives them (LEVEL2 4.3): the dangle
  // sways on its thread and the flit flutters in its crossing. Both are presentation: the hitbox stays, and
  // so does the plate, which is easier to read when it holds still. Both run on the entity's animT, which
  // stands still with the world under a Pocket Watch (state.time does not).

  // How many px to the right of its anchor a dangle is drawn; 0 for any other kind.
  function sway(e) {
    if (e.kind !== 'dangle') return 0;
    return Math.round(DANGLE_SWAY * Math.sin(2 * Math.PI * DANGLE_SWAY_HZ * num(e.animT, 0)));
  }

  // How far the flutter of a crossing flit reaches above and below its path, px; 0 for anything else. It
  // grows to FLIT_FLUTTER over the first eighth of the crossing and dies away over the last, so that the
  // flit does not jump as the phase begins and ends.
  function flutterReach(e) {
    var C = TG.C;
    if (e.kind !== 'flit' || e.phase !== 'cross') return 0;
    var r = (num(e.t, 0) - C.FLIT_ENTER_T) / (C.FLIT_CROSS_T - C.FLIT_ENTER_T);
    return FLIT_FLUTTER * clamp(8 * Math.min(r, 1 - r), 0, 1);
  }

  // How many px above its path a flit is drawn.
  function flutter(e) {
    var reach = flutterReach(e);
    return reach > 0 ? Math.round(reach * Math.sin(2 * Math.PI * FLIT_FLUTTER_HZ * num(e.animT, 0))) : 0;
  }

  // time: the scene clock, for the ground markers and a crate's power icon; now: state.time, for the
  // chevrons of the attacks. The creatures themselves are animated from their own animT.
  function drawEntities(c, state, camX, time, now) {
    var C = TG.C;
    var list = state.entities || [];
    var p = state.player;
    var px = p ? p.x : 0;
    var G = C.GROUND_Y;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e.dead) continue;
      var sx = Math.floor(num(e.x, 0) - camX);
      var sy = Math.floor(num(e.y, G));
      if (!visible(sx, num(e.w, 16))) continue;
      var lab = e.type !== 'attack' ? effectsLabel(e.id) : null;
      // The entity's own sprite takes the skin's remap, under the white flash of a correct key. The
      // mound of a Digby underground and the power icon of a crate are not skinned: they only flash.
      var name = skinFor(state, e);
      var flash = lab && lab.white ? 'white' : null;
      var remap = flash || skinRemap(state, e);
      if (lab && lab.flinch) sx += (num(e.x, 0) >= px ? 1 : -1) * lab.flinch;
      var at = num(e.animT, 0);
      var t = num(e.t, 0);
      switch (e.kind) {
        case 'boulder':
          var len = e.word ? e.word.length : 1;
          sprite(c, name, clamp(Math.ceil(3 * num(e.typed, 0) / len), 0, 3), sx, sy, false, remap);
          break;
        case 'dawdle':
          sprite(c, name, Math.floor(at * 4) % 2, sx, sy, false, remap);
          break;
        case 'hoppet':
          sprite(c, name, num(e.elev, 0) > 0.5 && e.phase !== 'hold' ? 'leap' : 'sit', sx, sy, false, remap);
          break;
        case 'buzzle':
          sprite(c, name, Math.floor(at * 16) % 2, sx, sy, false, remap);
          break;
        case 'swoop':
          if (e.phase === 'dive' && p) sprite(c, 'fx_marker', fpsFrame('fx_marker', time), Math.floor(px - camX), G + MARKER_DY, false, null);
          sprite(c, name, e.phase === 'dive' ? 'dive' : Math.floor(at * 8) % 2, sx, sy, false, remap);
          break;
        case 'dangle':
          // LEVEL2 4.3: it comes down and hangs on a thread, legs out and in, and sways on it. The thread
          // runs from the anchor's x at the top of the playfield, so it is not drawn while the anchor is
          // beyond the right edge.
          var anchorSx = Math.floor(num(e.x, 0) - camX);
          var swung = sx + sway(e);
          if (anchorSx < C.W) drawThread(c, anchorSx, swung, sy - num(e.h, 16));
          sprite(c, name, Math.floor(at * 4) % 2, swung, sy, false, remap);
          break;
        case 'flit':
          // LEVEL2 4.3: it flaps across over Pip, faces right from its turn behind him, and dives at him
          // from there with the swoop's marker on the ground. Its dive frame has the head at the lower
          // left, so flipped it leads down and to the right.
          if (e.phase === 'dive' && p) sprite(c, 'fx_marker', fpsFrame('fx_marker', time), Math.floor(px - camX), G + MARKER_DY, false, null);
          sprite(c, name, e.phase === 'dive' ? 'dive' : Math.floor(at * 8) % 2, sx, sy - flutter(e), e.turned === true, remap);
          break;
        case 'truffle':
          sprite(c, name, Math.floor(at * 12) % 4, sx, sy, e.flipX !== false, remap);
          break;
        case 'digby':
          if (e.phase === 'up' && typeof e.skin === 'string' && e.skin) {
            // A minion in a sprite of its own, the Baronet (LEVEL2 4.4, 13.8): he comes up in front of the
            // mound, where the Digby comes up behind it, so that his helmet, monocle and moustache are
            // seen; he peeks until 12 of his 16 rows are out.
            var feet = G - num(e.elev, 0);
            sprite(c, 'en_mound', 0, sx, G, false, null);
            spriteClipped(c, name, G + 16 - Math.floor(feet) < 12 ? 'peek' : 'up', sx, feet, false, remap, G);
          } else if (e.phase === 'up') {
            var popT = C.DIGBY_POP_T;
            spriteClipped(c, name, t < popT + 0.05 ? 'peek' : 'up', sx, G - num(e.elev, 0), false, remap, G);
            sprite(c, 'en_mound', 0, sx, G, false, null);
          } else {
            sprite(c, 'en_mound', Math.floor(at * (6 + 10 * t)) % 2, sx, G, false, flash);
          }
          break;
        case 'rock':
          if (e.from === 'above' && p) sprite(c, 'fx_marker', fpsFrame('fx_marker', time), Math.floor(px - camX), G + MARKER_DY, false, null);
          sprite(c, name, Math.floor(at * 10) % 2, sx, sy, false, remap);
          break;
        case 'crate':
          sprite(c, name, Math.floor(at * 3) % 2, sx, sy, false, remap);
          if (e.power) sprite(c, 'pw_' + e.power, Math.floor(time * 4) % 2, sx, sy, false, flash);
          break;
        case 'shock':
          sprite(c, name, Math.floor(at * 10) % 2, sx, sy, false, remap);
          chevron(c, true, sx, sy - 20, now, attackWindow(e));
          break;
        case 'pick':
          sprite(c, name, Math.floor(at * 12) % 4, sx, sy, false, remap);
          chevron(c, false, sx, sy - 28, now, attackWindow(e));
          break;
        default:
          if (e.kind) sprite(c, name, 0, sx, sy, false, remap);
      }
    }
  }

  // The window of an attack is chosen by its action, as TG.Entities.nextAction chooses it: SHOCK_WIN for
  // an attack to jump, PICK_WIN for one to duck.
  function attackWindow(e) {
    var C = TG.C;
    var win = e.action === 'jump' ? C.SHOCK_WIN : C.PICK_WIN;
    return isNum(e.eta) && e.eta >= win[0] && e.eta <= win[1];
  }

  // ---------------------------------------------------------------------------------------------
  // 7. Pip (CONTRACT 6.6)
  // ---------------------------------------------------------------------------------------------

  function findGap(level, id) {
    var hz = level && level.hazards ? level.hazards : [];
    for (var i = 0; i < hz.length; i++) if (hz[i].id === id) return hz[i];
    return null;
  }

  function drawBubble(c, x, y, time) {
    sprite(c, 'hero_idle', Math.floor(time * 2) % 2, x, y, false, null);
    sprite(c, 'fx_bubble', Math.floor(time * 4) % 2, x, y, false, null);
  }

  // time: the scene clock, for the bubble Pip waits in after a rescue and for the frame of the shield
  // ring; now: state.time, for the bubble that carries him on the lifeLost screen and for the ink spark of
  // a key. The ring's alternate steps and Pip's blink while invulnerable count state.frame, and neither
  // holds under a Pocket Watch (the note on the two clocks at the top of the file).
  function drawPip(c, state, camX, time, now) {
    var C = TG.C;
    var p = state.player;
    if (!p) return;
    var sx = Math.floor(num(p.x, 0) - camX), sy = Math.floor(num(p.y, C.GROUND_Y));
    var remap = state.power && state.power.quillT > 0 ? 'gold' : null;
    var screen = state.screen;
    var screenT = num(state.screenT, 0);

    if (screen === 'levelComplete') {
      sprite(c, 'hero_win', Math.floor(screenT * 5) % 2, sx, sy, false, remap);
      return;
    }
    if (screen === 'gameOver') {
      sprite(c, 'hero_sit', screenT < 0.33 ? 'sit0' : 'sit1', sx, sy, false, remap);
      return;
    }

    // Fell into a gap: during the pause he floats in a bubble from the pit to the rescue point.
    var ll = state.lifeLost;
    if (screen === 'lifeLost' && ll && ll.cause === 'fall' && p.state === 'fall') {
      var u = ll.duration > 0 ? clamp(num(ll.t, 0) / ll.duration, 0, 1) : 1;
      var gap = findGap(state.level, ll.gapId !== undefined && ll.gapId !== null ? ll.gapId : p.lastGapId);
      if (ll.last || !gap || u < 0.3) {
        sprite(c, 'hero_jump', 'fall', sx, sy, false, remap);
        return;
      }
      var v = (u - 0.3) / 0.7;
      var toX = gap.x + gap.w + C.RESCUE_AHEAD - camX;
      var bx = sx + (toX - sx) * v;
      var by = sy + (C.GROUND_Y - sy) * v - Math.sin(Math.PI * v) * 30;
      drawBubble(c, Math.floor(bx), Math.floor(by), now);
      return;
    }
    if (p.state === 'rescue') {
      drawBubble(c, sx, sy, time);
      return;
    }

    // DESIGN 14.6: the hurt frame shows in full, then Pip is drawn on alternate 3-frame intervals while
    // he is invulnerable.
    var show = p.hurtT > 0 || !(num(p.invulnT, 0) > 0) || Math.floor(num(state.frame, 0) / 3) % 2 === 0;
    var cast = casting() && !(p.hurtT > 0);
    if (show) {
      if (p.hurtT > 0) {
        sprite(c, 'hero_hurt', 0, sx, sy, false, remap);
      } else if (p.state === 'fall') {
        sprite(c, 'hero_jump', 'fall', sx, sy, false, remap);
      } else if (p.jumpT >= 0 || p.state === 'jump') {
        var s = num(p.jumpT, 0) / C.JUMP_TIME;
        sprite(c, 'hero_jump', s < 0.35 ? 'rise' : (s < 0.65 ? 'apex' : 'fall'), sx, sy, false, remap);
      } else if (p.state === 'slide') {
        sprite(c, 'hero_slide', Math.floor(num(p.animT, 0) * 10) % 2, sx, sy, false, remap);
      } else {
        sprite(c, 'hero_run', Math.floor(num(p.animT, 0) * 12) % 6, sx, sy, false, remap);
        if (cast) sprite(c, 'hero_cast', 0, sx, sy, false, remap);
      }
    }
    // The ink spark at the quill tip on the frame of a correct key (DESIGN 3.4).
    if (cast && p.state !== 'fall') {
      var q = p.state === 'slide' ? QUILL_SLIDE : QUILL_RUN;
      sprite(c, 'ink_spark', Math.floor(now * 20) % 2, sx + q[0], sy + q[1], false, null);
    }
    // Bubble shield: an oval ring drawn on alternate frames (DESIGN 7).
    if (state.power && state.power.shield > 0 && num(state.frame, 0) % 2 === 0) {
      sprite(c, 'fx_shield', Math.floor(time * 8) % 4, sx, sy, false, null);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // 8. Word plates (CONTRACT 5.13, DESIGN 4.5)
  // ---------------------------------------------------------------------------------------------

  function etaKey(e) {
    return isNum(e.eta) ? e.eta : Infinity;
  }

  function hits(a, x, y, w, h, m) {
    return x < a.x + a.w + m && a.x < x + w + m && y < a.y + a.h + m && a.y < y + h + m;
  }

  function isTypableEntity(e) {
    return e && !e.dead && (e.type === 'threat' || e.type === 'crate') && e.typable !== false &&
      typeof e.word === 'string' && e.word.length > 0;
  }

  // Screen boxes that plates keep clear of: Pip standing, and the sprite of every typable on screen.
  // A hoppet's box includes its hop and a buzzle's its bob, so that a plate does not jump from frame
  // to frame as the creature moves; a crossing flit's includes the reach of its flutter.
  function obstacles(state, list, camX) {
    var C = TG.C;
    var out = [];
    var p = state.player;
    if (p && isNum(p.x)) out.push({ id: -1, x: Math.floor(p.x - camX) - 8, y: C.GROUND_Y - 24, w: 16, h: 24 });
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var ew = num(e.w, 16), eh = num(e.h, 16);
      var sx = num(e.x, 0) - camX, bottom = num(e.y, C.GROUND_Y), top = bottom - eh;
      if (!(sx + ew / 2 > 0 && sx - ew / 2 < C.W && bottom > C.PLAY_TOP && top < C.GROUND_Y)) continue;
      if (e.kind === 'hoppet') top = Math.min(top, C.GROUND_Y - eh - C.HOP_HEIGHT);
      if (e.kind === 'buzzle') { top -= C.BUZZLE_BOB; bottom += C.BUZZLE_BOB; }
      if (e.kind === 'flit') { top -= flutterReach(e); bottom += flutterReach(e); }
      out.push({ id: e.id, x: Math.floor(sx - ew / 2), y: Math.floor(top), w: ew, h: Math.ceil(bottom - top) });
    }
    return out;
  }

  // What a plate at x, y would overlap: the lowest plate or obstacle it touches, or null.
  function blocker(placed, obs, id, x, y, w, h) {
    var worst = null, worstBottom = -Infinity;
    var i;
    for (i = 0; i < placed.length; i++) {
      var a = placed[i];
      if (hits(a, x, y, w, h, PLATE_GAP) && a.y + a.h > worstBottom) { worst = a; worstBottom = a.y + a.h; }
    }
    for (i = 0; i < obs.length; i++) {
      var b = obs[i];
      if (b.id === id) continue;
      if (hits(b, x, y, w, h, SPRITE_GAP) && b.y + b.h > worstBottom) { worst = b; worstBottom = b.y + b.h; }
    }
    return worst;
  }

  // Pure: the plates of every typable entity, placed so that none overlaps another (CONTRACT 5.13).
  // Beyond the contract's steps, a plate also keeps clear of Pip and of the other typables' sprites,
  // so that no word covers a creature.
  function layoutLabels(state) {
    if (!state || !state.entities) return [];
    var camX = state.camera && isNum(state.camera.x) ? state.camera.x : 0;
    var target = state.typing ? state.typing.target : null;
    var list = [];
    for (var i = 0; i < state.entities.length; i++) {
      if (isTypableEntity(state.entities[i])) list.push(state.entities[i]);
    }
    list.sort(function (a, b) {
      if (a === target) return -1;
      if (b === target) return 1;
      var ea = etaKey(a), eb = etaKey(b);
      if (ea !== eb) return ea < eb ? -1 : 1;
      return num(a.id, 0) - num(b.id, 0);
    });
    var obs = obstacles(state, list, camX);

    var minY = state.boss ? ARENA_PLATE_TOP : PLATE_MIN_Y;
    var maxY = PLATE_MAX_Y;
    var labels = [];
    for (var k = 0; k < list.length; k++) labels.push(wanted(list[k], camX, target, minY, maxY));

    // Placing (step 5). The locked plate keeps its place. Then every plate that fits where it wants to be
    // takes that place, in the order of the list, so that the plate nearest to a creature is its own.
    // The others then move: up in 10 px steps; if that would pass the top, below the lowest thing they
    // overlapped and on downwards.
    var placed = [];
    var moved = [];
    for (var n = 0; n < labels.length; n++) {
      var L = labels[n];
      if (n === 0 && L.locked) placed.push(L);
      else if (!blocker(placed, obs, L.id, L.x, L.y, L.w, L.h)) placed.push(L);
      else moved.push(L);
    }
    for (var m = 0; m < moved.length; m++) {
      place(moved[m], placed, obs, minY, maxY);
      placed.push(moved[m]);
    }
    return labels;
  }

  // A label at the place its entity wants (CONTRACT 5.13 steps 2 to 4).
  function wanted(e, camX, target, minY, maxY) {
    var C = TG.C;
    var text = e.word.toUpperCase();
    var w = 8 * text.length + 2, h = PLATE_H;
    var ew = num(e.w, 16), eh = num(e.h, 16);
    var sx = num(e.x, 0) - camX;
    var top = num(e.y, C.GROUND_Y) - eh, bottom = num(e.y, C.GROUND_Y);
    var onScreen = sx + ew / 2 > 0 && sx - ew / 2 < C.W && bottom > C.PLAY_TOP && top < C.GROUND_Y;
    var edge = null, x, y, tailX = null, tailY = null;
    if (!onScreen) {
      // Beyond the right edge is asked before above the playfield: a dangle whose anchor is still ahead of
      // the view comes down out of sight, and its tag is the right one from its spawn, as a far boulder's
      // is (LEVEL2 4.3). No other kind is in both places at once.
      if (top >= C.GROUND_Y) edge = 'bottom';
      else if (sx - ew / 2 >= C.W) edge = 'right';
      else if (bottom <= C.PLAY_TOP) edge = 'top';
      else edge = 'left';
    }
    if (edge === 'right' || edge === 'left') {
      x = edge === 'right' ? C.W - 2 - w : 2;
      y = Math.floor(top) - 4 - h;
    } else if (edge === 'top') {
      x = Math.floor(sx - w / 2);
      y = C.PLAY_TOP + 2;
    } else if (edge === 'bottom') {
      x = Math.floor(sx - w / 2);
      y = C.GROUND_Y - 12 - h;
    } else {
      // The plate holds still over a dangle that sways and a flit that flutters, clear of the top of the
      // flutter; its tail ends on the sprite where that is drawn.
      x = Math.floor(sx - w / 2);
      y = Math.floor(top - flutterReach(e)) - 4 - h;
      tailX = Math.floor(sx) + sway(e);
      tailY = Math.floor(top) - flutter(e);
    }
    return {
      id: e.id, text: text, typed: clamp(Math.floor(num(e.typed, 0)), 0, text.length),
      x: clamp(x, 2, C.W - 2 - w), y: clamp(y, minY, maxY), w: w, h: h,
      locked: e === target,
      dim: target !== null && target !== undefined && e !== target,
      urgent: !!e.urgent,
      friendly: e.type === 'crate',
      edge: edge,
      tailX: tailX, tailY: tailY
    };
  }

  // Moves label L until it overlaps nothing placed and no obstacle.
  function place(L, placed, obs, minY, maxY) {
    var wantY = L.y;
    var y = L.y, dir = -1;
    for (var guard = 0; guard < 64; guard++) {
      var b = blocker(placed, obs, L.id, L.x, y, L.w, L.h);
      if (!b) {
        L.y = y;
        return;
      }
      if (dir < 0) {
        if (y - 10 >= minY) {
          y -= 10;
          continue;
        }
        dir = 1;
        y = Math.max(wantY, b.y + b.h + PLATE_GAP);
      } else {
        y += 10;
      }
      if (y > maxY) break;
    }
    L.y = freeRow(placed, obs, L.id, L.x, L.w, L.h, minY, maxY, wantY);
  }

  // The first row from the top where the plate overlaps nothing; failing that, the first row where it
  // overlaps no plate (sprites may be covered); failing that, `fallback`.
  function freeRow(placed, obs, id, x, w, h, minY, maxY, fallback) {
    var y;
    for (y = minY; y <= maxY; y++) if (!blocker(placed, obs, id, x, y, w, h)) return y;
    for (y = minY; y <= maxY; y++) if (!blocker(placed, [], id, x, y, w, h)) return y;
    return clamp(fallback, minY, maxY);
  }

  function plateBorder(L, lab, time) {
    if (lab && lab.border !== null && lab.border !== undefined) return lab.border;
    var urgentOn = L.urgent && blinkOn(time, 4);
    if (L.locked) return urgentOn ? RED : GOLD;
    if (urgentOn) return RED;
    if (L.dim) return null;
    if (L.friendly) return GRASS;
    if (L.edge) return CORAL;
    return null;
  }

  function tailColor(L) {
    if (L.locked) return GOLD;
    if (L.dim) return STONE;
    if (L.friendly) return GRASS;
    return SILVER;
  }

  function drawTail(c, L) {
    if (L.tailX === null || L.tailY === null) return;
    var bottom = L.y + L.h + 1;
    if (L.tailY <= bottom + 1) return;
    var tx = clamp(L.tailX, L.x + 1, L.x + L.w - 2);
    var color = tailColor(L);
    rect(c, tx, bottom + 1, 1, L.tailY - bottom - 1, color);
    if (tx !== L.tailX) {
      var a = Math.min(tx, L.tailX), b = Math.max(tx, L.tailX);
      rect(c, a, L.tailY - 1, b - a + 1, 1, color);
    }
  }

  // The colour of 1 px outside a plate's RED border in this boss phase, or null: level.boss.urgentRim =
  // { phase: palette index }. Lady Ratchet's phase 2 band is PLUM dithered MAROON (LEVEL2 3.1), close to
  // RED in hue, and the border of an urgent plate is faint on it. With INK outside it, the RED line has INK
  // on both sides. The RED border of a wrong key is the same line and has it too. Level 1's boss names none.
  function urgentRim(state) {
    var rims = state.boss && state.level.boss ? state.level.boss.urgentRim : null;
    var rim = rims ? rims[Math.min(num(state.boss.phase, 1), 3)] : null;
    return isNum(rim) ? rim : null;
  }

  // The rim of a plate whose border is RED on this frame: 1 px of the colour `rim` outside the border.
  function drawRim(c, L, time, rim) {
    var lab = effectsLabel(L.id);
    if (plateBorder(L, lab, time) !== RED) return;
    outline(c, L.x + (lab ? lab.shakeX : 0) - 2, L.y - 2, L.w + 4, L.h + 4, rim);
  }

  // The INK plate of w x h has 1 px more INK around it, and a border (when it has one) outside that, so
  // that raised GOLD letters never touch a GOLD border.
  function drawPlate(c, L, time) {
    var lab = effectsLabel(L.id);
    var x = L.x + (lab ? lab.shakeX : 0), y = L.y;
    var border = plateBorder(L, lab, time);
    rect(c, x - 1, y - 1, L.w + 2, L.h + 2, INK);
    if (border !== null) outline(c, x - 1, y - 1, L.w + 2, L.h + 2, border);
    var n = L.text.length;
    var hop = lab ? lab.hopIndex : -1;
    var blink = lab && lab.blink && Math.floor(time * 16) % 2 === 0;
    for (var i = 0; i < n; i++) {
      var ch = L.text.charAt(i);
      var gx = x + 1 + 8 * i;
      var color, dy = 0;
      if (i < L.typed) {
        color = GOLD;                                 // typed: GOLD and raised 1 px (2 px just after the key)
        dy = i === hop ? -2 : -1;
      } else if (L.dim) {
        color = SILVER;
      } else if (i === L.typed && blink) {
        color = CORAL;                                // the expected letter blinks after a wrong key
      } else {
        color = WHITE;
      }
      glyph(c, ch, gx, y + 1 + dy, color, 1);
      if (i === L.typed && !L.dim) rect(c, gx, y + 9, 7, 1, AQUA);   // the next letter is underlined
    }
  }

  // Blinking chevron beside an edge tag, pointing to the edge the threat enters from (DESIGN 4.3).
  function drawEdgeChevron(c, L, time) {
    if (!L.edge || !blinkOn(time, 4)) return;
    var sym = TG.Font && TG.Font.SYM ? TG.Font.SYM : { UP: '^', DOWN: '_', LEFT: '<', RIGHT: '>' };
    var x, y, ch;
    if (L.edge === 'right') { ch = sym.RIGHT; x = L.x - 11; y = L.y + 1; }
    else if (L.edge === 'left') { ch = sym.LEFT; x = L.x + L.w + 4; y = L.y + 1; }
    else if (L.edge === 'top') { ch = sym.UP; x = L.x + Math.floor(L.w / 2) - 4; y = L.y + L.h + 4; }
    else { ch = sym.DOWN; x = L.x + Math.floor(L.w / 2) - 4; y = L.y - 11; }
    glyphShadow(c, ch, x, y, CORAL);
  }

  // Animated corner brackets around a box (screen px). They close in over 5 frames after the lock.
  function brackets(c, left, top, right, bottom, time, snap) {
    var d = Math.max(0, snap);
    var f = Math.floor(time * 4) % 2;
    var tl = f ? 'tl1' : 'tl0', bl = f ? 'bl1' : 'bl0';
    sprite(c, 'fx_bracket', tl, left - d, top - d, false, null);
    sprite(c, 'fx_bracket', tl, right + d, top - d, true, null);
    sprite(c, 'fx_bracket', bl, left - d, bottom + d - 8, false, null);
    sprite(c, 'fx_bracket', bl, right + d, bottom + d - 8, true, null);
  }

  function drawLock(c, state, labels, camX, time) {
    var C = TG.C;
    var t = state.typing ? state.typing.target : null;
    if (!t) return;
    var snap = isNum(t.firstKeyAt) ? 5 - Math.floor((num(state.time, 0) - t.firstKeyAt) * 60) : 0;
    if (t.kind === 'core' || t.kind === 'finisher') {
      var boss = state.boss;
      if (!boss) return;
      var bx = Math.floor(boss.x - camX), by = Math.floor(boss.y);
      brackets(c, bx - 27, by - 62, bx + 27, by + 1, time, snap);
      return;
    }
    for (var i = 0; i < labels.length; i++) {
      var L = labels[i];
      if (!L.locked) continue;
      if (L.edge) {
        brackets(c, L.x - 5, L.y - 5, L.x + L.w + 5, L.y + L.h + 5, time, snap);
        return;
      }
      // The brackets go with the sprite as it is drawn: with a dangle's sway and a flit's flutter.
      var sx = Math.floor(num(t.x, 0) - camX) + sway(t);
      var w = num(t.w, 16), h = num(t.h, 16);
      var up = flutter(t);
      var top = Math.floor(num(t.y, C.GROUND_Y) - h) - up, bottom = Math.min(Math.floor(num(t.y, C.GROUND_Y)), C.GROUND_Y) - up;
      brackets(c, sx - Math.floor(w / 2) - 3, top - 3, sx + Math.ceil(w / 2) + 3, bottom + 3, time, snap);
      return;
    }
  }

  // time: state.time. The plates are where the player reads and types, and nothing of them holds under a
  // Pocket Watch: the blink of an urgent border and of an edge tag, the letter after a wrong key, the lock.
  // The rims of urgentRim are drawn first: a tail starts in the row of its plate's rim, and drawn over the
  // rim it still joins the border, as it does where there is no rim.
  function drawPlates(c, state, labels, camX, time) {
    var i;
    var rim = urgentRim(state);
    if (rim !== null) for (i = 0; i < labels.length; i++) drawRim(c, labels[i], time, rim);
    for (i = 0; i < labels.length; i++) drawTail(c, labels[i]);
    for (i = labels.length - 1; i >= 0; i--) {
      drawPlate(c, labels[i], time);
      drawEdgeChevron(c, labels[i], time);
    }
    drawLock(c, state, labels, camX, time);
  }

  // ---------------------------------------------------------------------------------------------
  // 9. draw (CONTRACT 4.19)
  // ---------------------------------------------------------------------------------------------

  // The first band of the dusk sky in boss phases 2 and 3, for a palette named dusk without `phases`.
  var DUSK_PHASES = { 2: { color: DEEP_BLUE, dither: PLUM }, 3: { color: INK, dither: PLUM } };

  function skyFor(state, palName, pal) {
    // The Hourglass changes the top band (DESIGN 14.5); in the arena each boss phase darkens the sky
    // one step (DESIGN 11.6): DEEP_BLUE, DEEP_BLUE with a PLUM dither, INK with a PLUM dither. A plain
    // PLUM sky would hide the far hills, which the dusk remap turns PLUM. A palette may give its own
    // steps as `phases`, { phase: { color, dither } } (LEVEL2 3.3); a phase it does not list keeps the band.
    var slow = state.power && state.power.slowT > 0;
    if (slow && pal && isNum(pal.slowSky)) return { color: pal.slowSky, dither: null };
    if (state.boss) {
      var phases = pal && pal.phases ? pal.phases : (palName === 'dusk' ? DUSK_PHASES : null);
      var step = phases ? phases[Math.min(num(state.boss.phase, 1), 3)] : null;
      if (step) return step;
    }
    return null;
  }

  function drawWorld(c, state) {
    var C = TG.C;
    var camX = state.camera && isNum(state.camera.x) ? state.camera.x : 0;
    // time: the scene clock, which a Pocket Watch holds, for the world's picture. now: state.time, for
    // what prompts the player or answers a key (the note on the two clocks at the top of the file).
    var time = sceneClock(state);
    var now = num(state.time, 0);
    var sec = sectionOf(state);
    var bd = backdropOf(state);
    var palName = sec ? sec.palette : 'day';
    var pal = paletteOf(bd, palName);
    var remap = pal && pal.remap ? pal.remap : null;
    var sectionIndex = num(state.section, 0);

    // 1. Backdrop L0 to L4.
    var sky = skyFor(state, palName, pal);
    drawSky(c, pal, time, sky && isNum(sky.color) ? sky.color : null, sky && isNum(sky.dither) ? sky.dither : null);
    drawLayers(c, bd, pal, camX, time, sectionIndex, false);
    // 2. Tiles, gap fill, plank bridges, decor, signposts, checkpoint flags.
    drawGround(c, state, camX, remap, time);
    drawProps(c, state, camX, time);
    // 3. Hazards with their chevrons. 4. Ink drops.
    drawHazards(c, state, camX, time, now, remap);
    drawItems(c, state, camX, time);
    // 5. Boss, entities, ground markers. 6. Pip.
    drawBoss(c, state, camX, time);
    drawEntities(c, state, camX, time, now);
    drawPip(c, state, camX, time, now);
    // 7. Effects in the world.
    if (TG.Effects && TG.Effects.draw) TG.Effects.draw(c, 'world', camX);
    // 8. Foreground layer L6.
    drawLayers(c, bd, pal, camX, time, sectionIndex, true);
    // 9. Word plates, lock brackets, edge tags.
    drawPlates(c, state, layoutLabels(state), camX, now);
    // 10. Flash.
    var flash = TG.Effects && TG.Effects.flash ? TG.Effects.flash() : null;
    if (flash !== null && flash !== undefined) rect(c, 0, C.PLAY_TOP, C.W, C.H - C.PLAY_TOP, flash);
  }

  // The Pocket Watch's frame (LEVEL2 6.3): while a watch runs, 1 px of AQUA round the playfield, the part
  // of the view the flash fills. It blinks ten times a second, three steps on and three off, as the power
  // slot flashes when a power starts. On alternate steps it would be lost at 30 pictures a second, where a
  // picture is drawn every second step: all of them would show it or none would. With three and three, a
  // picture every 1 to MAX_STEPS steps shows it in some pictures and not in others, whichever step the
  // watch began on.
  var WATCH_FRAME_STEPS = 3;        // steps the frame is on, and then off

  function drawWatchFrame(c, state) {
    if (!(state.power && state.power.watchT > 0) || Math.floor(num(state.frame, 0) / WATCH_FRAME_STEPS) % 2 !== 0) return;
    var C = TG.C;
    outline(c, 1, C.PLAY_TOP + 1, C.W - 2, C.H - C.PLAY_TOP - 2, AQUA);
  }

  function draw(state) {
    if (!ctx) return;
    var C = TG.C;
    var s = state || null;
    var world = !!(s && WORLD_SCREENS[s.screen] && s.level);

    // DESIGN 11.6: the picture freezes for 30 frames after the finisher word. The canvas keeps the
    // last picture, so nothing is drawn. (Only when the frame before was drawn from this same run.)
    if (world && s.screen === 'levelComplete' && lastState === s && lastScreen === 'levelComplete' &&
        num(s.screenT, 0) > 0.03 && num(s.screenT, 0) < FREEZE_TIME) {
      return;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    rect(ctx, 0, 0, C.W, C.H, INK);
    if (world) {
      var sh = TG.Effects && TG.Effects.shake ? TG.Effects.shake() : null;
      var dx = sh ? Math.floor(num(sh.x, 0)) : 0, dy = sh ? Math.floor(num(sh.y, 0)) : 0;
      ctx.save();
      if (dx !== 0 || dy !== 0) ctx.translate(dx, dy);
      drawWorld(ctx, s);
      ctx.restore();
      // The watch's frame stays at the edges of the view when the world is shaken, and under the HUD.
      drawWatchFrame(ctx, s);
      // 11. The HUD (not shaken). 12. Effects over the HUD.
      if (TG.Hud && TG.Hud.draw) TG.Hud.draw(ctx, s);
      if (TG.Effects && TG.Effects.draw) TG.Effects.draw(ctx, 'screen', 0);
    }
    if (TG.UI && TG.UI.draw) TG.UI.draw(ctx, s);
    lastState = s;
    lastScreen = s ? s.screen : null;
  }

  TG.Render = {
    // canvas: the 384x216 canvas element. Gets the 2D context, turns smoothing off.
    init: function (cv) {
      canvas = cv || null;
      ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
      if (ctx) ctx.imageSmoothingEnabled = false;
      lastState = null;
      lastScreen = null;
    },
    draw: draw,
    drawBackdrop: drawBackdrop,
    layoutLabels: layoutLabels,
    worldToScreenX: function (state, x) {
      var cx = state && state.camera && isNum(state.camera.x) ? state.camera.x : 0;
      return Math.floor(x - cx);
    },
    // How far from the place the simulation gives it an entity is drawn (LEVEL2 4.3): sway, px to the
    // right, for a dangle; flutter, px up, for a flit in its crossing. 0 for anything else.
    sway: sway,
    flutter: flutter
  };
})(typeof window !== 'undefined' ? window : globalThis);
