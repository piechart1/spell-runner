// js/effects.js
// TG.Effects: particles, clear animations, ink bolts, score popups, letter particles, screen shake,
// flashes, label effects and the hero's cast overlay (WP-F). CONTRACT 4.17, DESIGN 3.4, 4.2, 4.6, 7,
// 8.7, 11.6 and 14.6.
//
// File layout:
//   1. constants and module state
//   2. helpers: randomness, the game state, positions, drawing
//   3. the effect pool (at most MAX_FX live effects; the oldest is replaced when the pool is full)
//   4. spawners: particles, text, letters, bolts, the clear sequence of every kind
//   5. event handlers
//   6. update
//   7. draw
//   8. the public object
//
// Everything is presentation. Nothing here writes to the game state, emits a simulation event or uses
// state.rng; randomness comes from a private TG.RNG generator. The state is read (camera, player,
// boss, power) through TG.Game.state when it exists, so that effects start where the player sees
// them; without TG.Game the last camera given to draw() is used.
//
// Timing: TG.Effects.update(dt) is called once per simulation step (dt = 1/60 s), so lengths given in
// "frames" below are 1/60 s each.
//
// Extra fields beyond CONTRACT 4.17 (see the hand-over notes):
//   label(id) also returns `white` (draw the typable's sprite with the white remap: 2 frames after a
//   correct key) and `flinch` (px to push the sprite away from Pip: the creature flinches).
//   TG.Effects._list() returns a copy of every live effect as { type, layer, x, y } with x, y in screen
//   px, for tests.
//   The letters of a cleared threat or crate word are screen-layer effects, but while they are in the
//   playfield they are drawn in the world pass, before the other world effects: under the word plates
//   (TG.Render draws those after the world effects) and under the score and CLEAN / SUPER popups.
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  // ---------------------------------------------------------------------------------------------
  // 1. Constants and module state
  // ---------------------------------------------------------------------------------------------

  var INK = 0, SHADOW = 1, STONE = 2, SILVER = 3, WHITE = 4, AQUA = 11, GRASS = 14, LIME = 15,
    GOLD = 18, CREAM = 19, SOIL = 21, CLAY = 22, SAND = 23, RED = 25, CORAL = 26, PINK = 27, LILAC = 30;

  var MAX_FX = 256;                 // CONTRACT 4.17: at most 256 particles
  var FRAME = 1 / 60;
  var WORLD = 0, SCREEN = 1;

  var QUILL_RUN = [6, -23];         // quill tip from Pip's anchor, facing right (WP-C hand-over)
  var QUILL_SLIDE = [8, -12];       // quill tip in the hero_slide frames

  var BOLT_TIME = 6 * FRAME;        // DESIGN 4.6 step 1
  var WHITE_TIME = 3 * FRAME;       // DESIGN 4.6 step 2
  var BLAST_STAGGER = 4 * FRAME;    // DESIGN 7: ink blast clears staggered 4 frames apart
  var CAST_TIME = 0.1;              // DESIGN 14.3: cast held 0.1 s after each correct key
  var HIT_WHITE = 2 * FRAME;        // DESIGN 3.4: target flashes white for 2 frames
  var FLINCH_TIME = 5 * FRAME;
  var MISS_SHAKE = 0.15;            // DESIGN 3.4: plate shakes 2 px for 0.15 s with a RED border
  var MISS_BLINK = 1.0;             // the expected letter blinks for this long, or until the next correct key
  var HOP_TIME = 5 * FRAME;         // the letter just typed stands 2 px high for this long
  var LETTER_BURST = 12 * FRAME;    // letter particles burst upward, then
  var LETTER_FLY = 30 * FRAME;      // fly to the SCORE counter over 30 frames (DESIGN 4.6 step 4)
  var SCORE_X = 20, SCORE_Y = 10;   // where letter particles end: the SCORE digits of the top bar
  var POPUP_TIME = 30 * FRAME;      // DESIGN 8.7: "+100" rising 12 px over 30 frames
  var POPUP_HOLD = 0.3;
  var CONFETTI = [GOLD, PINK, AQUA, LIME, CORAL, WHITE, LILAC];

  var pool = null;                  // MAX_FX effect records, made once
  var liveCount = 0;
  var seq = 0;
  var clock = 0;                    // s, advanced by update()
  var frameNo = 0;                  // steps seen by update()
  var rng = null;
  var subs = [];                    // unsubscribe functions of init()

  var labels = {};                  // typable id -> label record
  var castT = 0;
  var shakeAmp = 0, shakeT = 0;
  var flashColor = null, flashT = 0;
  var flashStarts = [-10, -10, -10];   // start times of the last three flashes (at most 3 per second)
  var telegraph = { on: false, kind: 'shock', t: 0, dur: 0 };
  var blastStep = -1, blastCount = 0; // stagger of ink blast clears within one step
  var wordsSinceQuality = 1;        // DESIGN 8.7: at most one CLEAN / SUPER / CLOSE! popup per two words
  var lastCamX = 0;
  var lastFinisher = '';            // the finisher word, for the letter fountain of the defeat
  var prevCam = null;               // camera x at the previous update, for effects that follow the view

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

  function random() {
    if (!rng) rng = TG.RNG && TG.RNG.create ? TG.RNG.create(0x5eed) : null;
    return rng ? rng.next() : 0.5;
  }

  function rnd(a, b) {
    return a + (b - a) * random();
  }

  function pick(list) {
    return list[Math.floor(random() * list.length) % list.length];
  }

  function reduceFlash() {
    try {
      return !!(TG.Save && TG.Save.getSetting && TG.Save.getSetting('reduceFlash') === true);
    } catch (e) {
      return false;
    }
  }

  function gameState() {
    return TG.Game && TG.Game.state ? TG.Game.state : null;
  }

  function camX() {
    var s = gameState();
    return s && s.camera && isNum(s.camera.x) ? s.camera.x : lastCamX;
  }

  // Pip's anchor in world px, or the place he stands on screen when there is no run.
  function heroPos(out) {
    var s = gameState();
    var p = s ? s.player : null;
    if (p && isNum(p.x) && isNum(p.y)) {
      out.x = p.x;
      out.y = p.y;
      out.slide = p.state === 'slide';
    } else {
      out.x = camX() + TG.C.HERO_SCREEN_X;
      out.y = TG.C.GROUND_Y;
      out.slide = false;
    }
    return out;
  }
  var heroTmp = { x: 0, y: 0, slide: false };

  function quillPos(out) {
    heroPos(heroTmp);
    var q = heroTmp.slide ? QUILL_SLIDE : QUILL_RUN;
    out.x = heroTmp.x + q[0];
    out.y = heroTmp.y + q[1];
    return out;
  }
  var quillTmp = { x: 0, y: 0 };

  function kindDef(kind) {
    var K = TG.Entities && TG.Entities.KINDS;
    return K && hasOwn(K, kind) ? K[kind] : null;
  }

  // Sprite box of a kind when the payload does not give one.
  var FALLBACK_BOX = {
    boulder: [24, 32], dawdle: [16, 16], hoppet: [16, 16], buzzle: [16, 16], swoop: [24, 16], truffle: [24, 16],
    digby: [16, 16], rock: [12, 12], crate: [16, 32], shock: [16, 8], pick: [16, 16]
  };

  function boxOf(kind) {
    var d = kindDef(kind);
    if (d) return [d.w, d.h];
    return FALLBACK_BOX[kind] || [16, 16];
  }

  function quillActive() {
    var s = gameState();
    return !!(s && s.power && s.power.quillT > 0);
  }

  // --- drawing ---------------------------------------------------------------------------------

  var drawOpts = { flipX: false, remap: null, scale: 1, anchor: true };
  var getOpts = { flipX: false, remap: null };
  var glyphOpts = { color: WHITE, scale: 1, align: 'center', shadow: true };
  var infoCache = {};

  function info(name) {
    if (hasOwn(infoCache, name)) return infoCache[name];
    var i = TG.Gfx && TG.Gfx.info ? TG.Gfx.info(name) : null;
    if (i) infoCache[name] = i;
    return i;
  }

  function sprite(ctx, name, frame, x, y, flip, remap) {
    if (!TG.Gfx || !TG.Gfx.draw) return;
    drawOpts.flipX = !!flip;
    drawOpts.remap = remap || null;
    drawOpts.scale = 1;
    drawOpts.anchor = true;
    TG.Gfx.draw(ctx, name, frame, x, y, drawOpts);
  }

  // A sprite whose rows below clipY (screen px) are not drawn: a mole going into its hole.
  function spriteClipped(ctx, name, frame, x, y, flip, remap, clipY) {
    if (!TG.Gfx || !TG.Gfx.get) return;
    var inf = info(name);
    if (!inf) return;
    getOpts.flipX = !!flip;
    getOpts.remap = remap || null;
    var canvas = TG.Gfx.get(name, frame, getOpts);
    if (!canvas) return;
    var ax = flip ? inf.w - inf.ax : inf.ax;
    var left = Math.floor(x) - ax, top = Math.floor(y) - inf.ay;
    var rows = Math.min(inf.h, Math.floor(clipY) - top);
    if (rows <= 0) return;
    ctx.drawImage(canvas, 0, 0, inf.w, rows, left, top, inf.w, rows);
  }

  function rect(ctx, x, y, w, h, c) {
    if (TG.Gfx && TG.Gfx.rect) {
      TG.Gfx.rect(ctx, x, y, w, h, c);
      return;
    }
    ctx.fillStyle = TG.PAL[c];
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  }

  function glyph(ctx, ch, x, y, c) {
    if (TG.Font && TG.Font.drawGlyph) TG.Font.drawGlyph(ctx, ch, Math.floor(x), Math.floor(y), c, 1);
  }

  function text(ctx, str, x, y, c) {
    if (!TG.Font || !TG.Font.draw) return;
    glyphOpts.color = c;
    TG.Font.draw(ctx, str, Math.floor(x), Math.floor(y), glyphOpts);
  }

  // ---------------------------------------------------------------------------------------------
  // 3. The effect pool
  // ---------------------------------------------------------------------------------------------

  function blank() {
    return {
      on: false, seq: 0, type: '', layer: WORLD, z: 0,
      x: 0, y: 0, vx: 0, vy: 0, g: 0, t: 0, life: 0, delay: 0,
      x0: 0, y0: 0, x1: 0, y1: 0, arc: 0, home: false,
      sprite: null, frame: 0, fps: 0, frames: 1, flip: false, spin: 0, remap: null,
      color: WHITE, size: 1, text: '', ch: '',
      ground: 0, bounces: 0, sway: 0, swayHz: 0, blinkOut: 0,
      kind: '', w: 16, h: 16, pre: 0, stage: 0, a: 0, b: 0, under: false, power: null, follow: false,
      low: false
    };
  }

  function ensurePool() {
    if (pool) return;
    pool = [];
    for (var i = 0; i < MAX_FX; i++) pool.push(blank());
  }

  // A free record, or the oldest live one when the pool is full. Every field is reset.
  function alloc(type, layer) {
    ensurePool();
    var slot = null, oldest = null;
    for (var i = 0; i < MAX_FX; i++) {
      var f = pool[i];
      if (!f.on) { slot = f; break; }
      if (!oldest || f.seq < oldest.seq) oldest = f;
    }
    if (!slot) {
      slot = oldest;
    } else {
      liveCount++;
    }
    var fresh = blank();
    for (var k in fresh) if (hasOwn(fresh, k)) slot[k] = fresh[k];
    slot.on = true;
    slot.seq = ++seq;
    slot.type = type;
    slot.layer = layer;
    slot.follow = followNew;
    return slot;
  }

  // Effects made inside fn move with the view (they belong to the Baron, who keeps pace with Pip).
  var followNew = false;
  function following(fn) {
    followNew = true;
    try {
      fn();
    } finally {
      followNew = false;
    }
  }

  function free(f) {
    if (!f.on) return;
    f.on = false;
    liveCount--;
  }

  // ---------------------------------------------------------------------------------------------
  // 4. Spawners
  // ---------------------------------------------------------------------------------------------

  // A square particle of 1 or 2 px, or a sprite particle when `name` is given.
  function particle(layer, x, y, vx, vy, g, life, color, size) {
    var f = alloc('part', layer);
    f.x = x; f.y = y; f.vx = vx; f.vy = vy; f.g = g; f.life = life;
    f.color = color; f.size = size || 1; f.z = 2;
    return f;
  }

  function spriteParticle(name, x, y, vx, vy, g, life, fps, frames) {
    var f = alloc('part', WORLD);
    f.sprite = name; f.x = x; f.y = y; f.vx = vx; f.vy = vy; f.g = g; f.life = life;
    f.fps = fps || 0; f.frames = frames || 1; f.z = 1;
    return f;
  }

  // Text that rises 12 px over POPUP_TIME, holds, and blinks out. World px unless layer is SCREEN.
  function popup(layer, str, x, y, color, delay) {
    var f = alloc('text', layer);
    f.text = str; f.x = x; f.y = y; f.color = color;
    f.life = POPUP_TIME + POPUP_HOLD; f.delay = delay || 0; f.z = 0;   // under the clear animation that it goes with
    return f;
  }

  // A burst of square particles around (x, y).
  function burst(layer, x, y, n, speed, colors, g, life) {
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3);
      var v = speed * rnd(0.6, 1.1);
      particle(layer, x, y, Math.cos(a) * v, Math.sin(a) * v, g, life * rnd(0.8, 1.1), pick(colors), random() < 0.5 ? 1 : 2);
    }
  }

  // An animated puff (fx_poof or fx_dust) that plays its frames once.
  function puff(name, x, y, delay) {
    var inf = info(name);
    var frames = inf ? inf.frames : 3;
    var f = spriteParticle(name, x, y, 0, 0, 0, frames / 12, 12, frames);
    f.delay = delay || 0;
    f.z = 2;
    return f;
  }

  // Letter particles: each letter of `word` from the plate at (left, top) in screen px bursts upward
  // and then flies to the SCORE counter (DESIGN 4.6 step 4). low: while a letter is in the playfield
  // (y >= PLAY_TOP) it is drawn with the world effects, under the word plates and the score and CLEAN
  // popups, so that it covers neither the next word nor the popups; above that it is drawn over the HUD.
  function letters(word, left, top, cell, delay, low) {
    var str = String(word || '').toUpperCase();
    var n = str.length;
    var color = quillActive() ? CREAM : GOLD;
    for (var i = 0; i < n; i++) {
      var ch = str.charAt(i);
      if (ch === ' ') continue;
      var f = alloc('letter', SCREEN);
      f.ch = ch;
      f.x = left + i * cell + (cell - 8) / 2;
      f.y = top;
      f.vx = (i - (n - 1) / 2) * 10 + rnd(-12, 12);
      // A plate high on the screen bursts less, so that the letters do not cover the top bar.
      f.vy = -rnd(120, 190) * clamp((top - TG.C.PLAY_TOP) / 90, 0.15, 1);
      f.g = 520;
      f.a = i * FRAME;                         // extra wait before flying, so they stream in a line
      f.x1 = SCORE_X + (i % 7) * 4;
      f.y1 = SCORE_Y;
      f.life = LETTER_BURST + f.a + LETTER_FLY;
      f.delay = delay || 0;
      f.color = color;
      f.z = 3;
      f.low = !!low;
    }
  }

  function bolt(x1, y1) {
    quillPos(quillTmp);
    var f = alloc('bolt', WORLD);
    f.x0 = quillTmp.x; f.y0 = quillTmp.y;
    f.x1 = x1; f.y1 = y1;
    f.x = f.x0; f.y = f.y0;
    f.life = BOLT_TIME;
    f.z = 3;
    return f;
  }

  // The sprite and frame that stand for a kind at the moment it is cleared.
  var GHOST = {
    boulder: ['en_boulder', 'crack3'], dawdle: ['en_dawdle', 'crawl0'], hoppet: ['en_hoppet', 'sit'],
    buzzle: ['en_buzzle', 'fly0'], swoop: ['en_swoop', 'flap0'], truffle: ['en_truffle', 'run0'],
    digby: ['en_digby', 'up'], rock: ['pr_rock', 'k0'], crate: ['crate_balloon', 'c0']
  };

  // Screen-space clamp of an effect position (CONTRACT 4.17): the centre of the sprite box is kept
  // inside x 8..376 and y PLAY_TOP + 8 .. GROUND_Y - 8, so a clear off screen plays where the edge tag was.
  // Returns the world anchor { x, y } in `out` and whether the box was outside the view.
  function placeClear(x, y, w, h, out) {
    var C = TG.C;
    var cx = camX();
    var sx = x - cx;
    var cy = y - h / 2;
    var outside = !(sx + w / 2 > 0 && sx - w / 2 < C.W && y > C.PLAY_TOP && y - h < C.GROUND_Y);
    sx = clamp(sx, 8, C.W - 8);
    cy = clamp(cy, C.PLAY_TOP + 8, C.GROUND_Y - 8);
    out.x = sx + cx;
    out.y = cy + h / 2;
    out.outside = outside;
    return out;
  }
  var placeTmp = { x: 0, y: 0, outside: false };

  // The universal clear sequence of a threat or crate (DESIGN 4.6) from a word:clear payload.
  function startClear(p) {
    var C = TG.C;
    var kind = String(p.kind || '');
    var box = boxOf(kind);
    var w = num(p.w, box[0]), h = num(p.h, box[1]);
    var x = num(p.x, camX() + C.W / 2), y = num(p.y, C.GROUND_Y);
    var underground = kind === 'digby' && y >= C.GROUND_Y + 6;
    placeClear(x, y, w, h, placeTmp);
    var ax = placeTmp.x, ay = underground ? C.GROUND_Y : placeTmp.y;
    var blast = p.cause === 'blast';

    var pre = BOLT_TIME;
    if (blast) {
      if (blastStep !== frameNo) {
        blastStep = frameNo;
        blastCount = 0;
      }
      pre = blastCount * BLAST_STAGGER;
      blastCount++;
    } else {
      bolt(ax, ay - h / 2);
    }

    var f = alloc('clear', WORLD);
    f.kind = kind;
    f.x = ax; f.y = ay; f.x0 = ax; f.y0 = ay;
    f.w = w; f.h = h;
    f.pre = pre;
    f.under = underground;
    f.power = p.power || null;
    f.flip = kind === 'truffle';
    var g = GHOST[kind] || GHOST.hoppet;
    f.sprite = g[0];
    f.frame = g[1];
    f.life = pre + WHITE_TIME + clearLength(kind, underground);
    f.z = 1;

    // Letter particles start from where the plate was: 4 px above the sprite box.
    var word = String(p.word || '');
    var sx = ax - camX();
    var plateW = 8 * word.length + 2;
    var plateTop = clamp(Math.floor(ay - h) - 14, C.PLAY_TOP, 174);
    if (underground) plateTop = C.GROUND_Y - 22;
    var left = clamp(Math.floor(sx - plateW / 2), 2, C.W - 2 - plateW);
    letters(word, left + 1, plateTop + 1, 8, blast ? pre : 0, true);

    // Score popup, and at most one CLEAN / SUPER / CLOSE! per two words (DESIGN 8.7).
    // Popups rise 12 px and carry a quality line 10 px above: they start low enough to stay below the HUD.
    var popY = Math.max(C.PLAY_TOP + 32, plateTop + 2);
    if (isNum(p.score) && p.score > 0) popup(WORLD, '+' + Math.round(p.score), ax, popY, GOLD, pre + WHITE_TIME);
    if (!blast) {
      var quality = null, qColor = WHITE;
      if (p.close) { quality = 'CLOSE!'; qColor = CORAL; }
      else if (p.clean && p.quick) { quality = 'SUPER'; qColor = LIME; }
      else if (p.clean) { quality = 'CLEAN'; qColor = AQUA; }
      if (quality && wordsSinceQuality >= 1) {
        popup(WORLD, quality, ax, popY - 10, qColor, pre + WHITE_TIME);
        wordsSinceQuality = 0;
      } else {
        wordsSinceQuality++;
      }
    }
    requestShake(1, 6 * FRAME);                // DESIGN 14.6: word clear 1 px for 6 frames
  }

  // Seconds of the kind-specific part of the clear (after the white flash).
  function clearLength(kind, underground) {
    switch (kind) {
      case 'boulder': return 0.02;
      case 'dawdle': return 1.3;
      case 'hoppet': return 0.14;
      case 'buzzle': return 0.5;
      case 'swoop': return 1.2;
      case 'truffle': return 1.4;
      case 'digby': return underground ? 0.52 : 0.42;
      case 'rock': return 0.3;
      case 'crate': return 0.16;
      default: return 0.1;
    }
  }

  // The kind animation begins: particles that start at this moment.
  function clearBegin(f) {
    var C = TG.C;
    var x = f.x, y = f.y, cy = f.y - f.h / 2;
    switch (f.kind) {
      case 'boulder':
        // Crumbles into 6 bouncing chunks (DESIGN 4.2).
        for (var i = 0; i < 6; i++) {
          var c = spriteParticle('fx_chunk', x + rnd(-8, 8), y - rnd(6, 26), rnd(-110, 110), -rnd(120, 230), 760, rnd(0.8, 1.0));
          c.frame = i % 2;
          c.ground = C.GROUND_Y - 3;
          c.bounces = 2;
          c.blinkOut = 0.25;
        }
        puff('fx_dust', x - 8, y, 0);
        puff('fx_dust', x + 8, y, 2 * FRAME);
        burst(WORLD, x, cy, 8, 60, [STONE, SILVER, SHADOW], 300, 0.4);
        break;
      case 'dawdle':
        break;
      case 'hoppet':
        break;
      case 'buzzle':
        f.x0 = x; f.y0 = y;
        break;
      case 'swoop':
        // A puff of feathers drifting down; the crow flaps off to the left.
        for (var k = 0; k < 5; k++) {
          var fe = spriteParticle('fx_feather', x + rnd(-8, 8), cy + rnd(-4, 4), rnd(-40, 40), -rnd(20, 70), 70, rnd(1.1, 1.5), 6, 2);
          fe.sway = rnd(3, 6);
          fe.swayHz = rnd(1.5, 2.5);
          fe.blinkOut = 0.3;
          fe.frame = k % 2;
        }
        break;
      case 'truffle':
        f.a = 0;
        break;
      case 'digby':
        if (!f.under) digbyHelmet(f);
        break;
      case 'rock':
        f.x0 = x; f.y0 = y;
        var s = gameState();
        var bx = s && s.boss && isNum(s.boss.x) ? s.boss.x : x + 120;
        f.x1 = bx - 4;
        f.y1 = C.GROUND_Y - 52;
        break;
      case 'crate':
        // The balloon pops; the crate drops (DESIGN 4.2).
        puff('fx_poof', x, y - 24, 0);
        burst(WORLD, x, y - 24, 8, 90, [RED, CORAL, WHITE], 200, 0.35);
        var box = spriteParticle('crate_box', x, y, 0, 30, 1100, 0.16);
        box.z = 1;
        f.a = 0;
        break;
    }
  }

  function digbyHelmet(f) {
    var h = spriteParticle('fx_helmet', f.x, f.y - 14, rnd(30, 60), -rnd(200, 240), 720, 1.0);
    h.ground = TG.C.GROUND_Y - 4;
    h.bounces = 2;
    h.blinkOut = 0.3;
  }

  // Per-step work of the kind animation. tc: s since the white flash ended.
  function clearStep(f, tc, dt) {
    var C = TG.C;
    switch (f.kind) {
      case 'dawdle':
        // Retracts into its shell, spins like a top, rolls off to the right leaving stars.
        if (tc > 0.3) f.x += 150 * dt;
        if (tc > 0.3 && Math.floor(tc / 0.1) !== Math.floor((tc - dt) / 0.1)) {
          var st = spriteParticle('fx_star', f.x - 8, f.y - 6, rnd(-10, 10), -rnd(10, 30), 0, 0.45, 8, 2);
          st.blinkOut = 0.15;
        }
        break;
      case 'hoppet':
        break;
      case 'buzzle':
        break;
      case 'swoop':
        f.x -= 150 * dt;
        f.y -= 55 * dt;
        break;
      case 'truffle':
        if (tc < 0.28) {
          // Skids to a halt in dust.
          var v = 110 * (1 - tc / 0.28);
          f.x += v * dt;
          if (Math.floor(tc / 0.08) !== Math.floor((tc - dt) / 0.08)) puff('fx_dust', f.x - 10, f.y, 0);
        } else if (tc > 0.4) {
          f.x -= 175 * dt;       // turns and runs off to the left
        }
        break;
      case 'digby':
        // A mole cleared underground pops out of its mound first, then loses its helmet.
        if (f.under && f.stage === 2 && tc >= 0.1) {
          f.stage = 3;
          digbyHelmet(f);
        }
        break;
      case 'rock':
        var r = clamp(tc / 0.3, 0, 1);
        var s = gameState();
        if (s && s.boss && isNum(s.boss.x)) f.x1 = s.boss.x - 4;
        f.x = f.x0 + (f.x1 - f.x0) * r;
        f.y = f.y0 + (f.y1 - f.y0) * r - 30 * 4 * r * (1 - r);
        break;
      case 'crate':
        if (f.a === 0 && tc >= 0.15) {
          f.a = 1;
          crateBreak(f);
        }
        break;
    }
  }

  // The kind animation ends: particles that follow it.
  function clearEnd(f) {
    var C = TG.C;
    switch (f.kind) {
      case 'hoppet':
        // Inflated; pops into confetti; a lily pad floats down.
        var cy = f.y - f.h / 2;
        puff('fx_poof', f.x, cy, 0);
        for (var i = 0; i < 16; i++) {
          var a = (i / 16) * Math.PI * 2;
          var v = rnd(70, 150);
          var p = particle(WORLD, f.x, cy, Math.cos(a) * v, Math.sin(a) * v - 60, 320, rnd(0.6, 0.9), pick(CONFETTI), 2);
          p.blinkOut = 0.2;
        }
        var pad = spriteParticle('fx_lilypad', f.x, cy, 0, 26, 0, 2.2);
        pad.sway = 5;
        pad.swayHz = 1.2;
        pad.ground = C.GROUND_Y - 4;
        pad.bounces = 0;
        pad.blinkOut = 0.4;
        break;
      case 'buzzle':
        // Turns into a flower that drifts down.
        puff('fx_poof', f.x, f.y - 8, 0);
        var fl = spriteParticle('fx_flower', f.x, f.y - 8, 0, 34, 0, 2.6, 4, 2);
        fl.sway = 6;
        fl.swayHz = 1.4;
        fl.ground = C.GROUND_Y - 4;
        fl.bounces = 0;
        fl.blinkOut = 0.4;
        break;
      case 'digby':
        // A daisy grows where the mole went down.
        var d = spriteParticle('fx_daisy', f.x0, C.GROUND_Y, 0, 0, 0, 1.8);
        d.a = 1;                 // grows through its frames
        d.blinkOut = 0.3;
        break;
      case 'rock':
        // Bounces off the Baron's helmet.
        var s = spriteParticle('fx_star', f.x, f.y, 0, -20, 0, 0.35, 8, 2);
        s.z = 3;
        burst(WORLD, f.x, f.y, 6, 70, [WHITE, GOLD], 0, 0.25);
        var rk = spriteParticle('pr_rock', f.x, f.y + 6, -rnd(70, 100), -rnd(180, 230), 650, 1.2, 20, 2);
        rk.blinkOut = 0.3;
        rk.follow = true;
        s.follow = true;
        break;
    }
  }

  function crateBreak(f) {
    var C = TG.C;
    // Where the dropping crate is now: it fell for 0.15 s from f.y.
    var by = f.y + 30 * 0.15 + 0.5 * 1100 * 0.15 * 0.15;
    for (var i = 0; i < 6; i++) {
      var sp = spriteParticle('fx_splinter', f.x + rnd(-6, 6), by - rnd(4, 12), rnd(-90, 90), -rnd(80, 180), 700, rnd(0.6, 0.8));
      sp.frame = i % 2;
      sp.ground = C.GROUND_Y - 3;
      sp.bounces = 1;
      sp.blinkOut = 0.2;
    }
    puff('fx_dust', f.x, by, 0);
    // The item hops to Pip.
    if (f.power) {
      var it = alloc('fly', WORLD);
      it.sprite = 'pw_' + f.power;
      it.x0 = f.x; it.y0 = by;
      it.x = f.x; it.y = by;
      it.home = true;
      it.arc = 30;
      it.life = 0.45;
      it.fps = 4; it.frames = 2;
      it.power = f.power;
      it.z = 3;
    }
  }

  // The item of a crate has reached Pip.
  function itemArrived(f) {
    heroPos(heroTmp);
    following(function () {
      burst(WORLD, heroTmp.x, heroTmp.y - 12, 10, 80, [AQUA, GOLD, WHITE], 0, 0.3);
      // The names of How to Play (TG.UI), so that each power has one name.
      var name = { shield: 'SHIELD', hourglass: 'HOURGLASS', quill: 'GOLDEN QUILL', blast: 'INK BLAST' }[f.power];
      if (name) popup(WORLD, name, heroTmp.x, heroTmp.y - 40, f.power === 'quill' ? GOLD : AQUA, 0);
    });
  }

  // A creature knocked away after it reached Pip (threat:hit, threat:bounce).
  function knockAway(kind, dir) {
    var g = GHOST[kind];
    if (!g) return;
    heroPos(heroTmp);
    var box = boxOf(kind);
    var f = spriteParticle(g[0], heroTmp.x + dir * 6, heroTmp.y - 4, dir * rnd(90, 130), -rnd(150, 200), 600, 0.7);
    f.frame = g[1] === 'crack3' ? 'whole' : g[1];
    f.flip = kind === 'truffle';          // it keeps facing Pip as it is knocked back
    f.spin = 0.1;
    f.blinkOut = 0.5;
    f.z = 1;
    if (box[1] > 24) f.y = heroTmp.y;
  }

  function impact(x, y, big) {
    puff('fx_poof', x, y, 0);
    burst(WORLD, x, y, big ? 12 : 6, big ? 120 : 80, [WHITE, GOLD, RED], 0, 0.3);
    var st = spriteParticle('fx_star', x + 8, y - 8, 30, -60, 200, 0.4, 8, 2);
    st.blinkOut = 0.15;
  }

  // --- shake and flash -------------------------------------------------------------------------

  function requestShake(amp, seconds) {
    if (amp > shakeAmp || shakeT <= 0) {
      if (amp >= shakeAmp || shakeT <= 0) shakeAmp = amp;
    }
    if (seconds > shakeT) shakeT = seconds;
  }

  // A flash of at most `frames` frames; at most 3 flashes start in any second, and never two in a row, so
  // that flashes do not run together into a longer one (DESIGN 14.6).
  function requestFlash(color, frames) {
    var oldest = Math.min(flashStarts[0], flashStarts[1], flashStarts[2]);
    var newest = Math.max(flashStarts[0], flashStarts[1], flashStarts[2]);
    if (clock - oldest < 1 || clock - newest < 0.2 || flashT > 0) return;
    var i = flashStarts.indexOf(oldest);
    flashStarts[i] = clock;
    flashColor = color;
    flashT = Math.min(2, frames) * FRAME;
  }

  // --- labels ----------------------------------------------------------------------------------

  function labelRec(id) {
    var key = String(id);
    var r = labels[key];
    if (!r) {
      r = labels[key] = {
        shakeT: 0, borderT: 0, hopIndex: -1, hopT: 0, blinkT: 0, whiteT: 0, flinchT: 0,
        out: { shakeX: 0, border: null, hopIndex: -1, blink: false, white: false, flinch: 0 }
      };
    }
    return r;
  }

  // ---------------------------------------------------------------------------------------------
  // 5. Event handlers
  // ---------------------------------------------------------------------------------------------

  var delayedFlash = { t: -1, color: WHITE };

  var handlers = {
    'level:start': function () {
      reset();
    },

    'type:hit': function (p) {
      castT = CAST_TIME;
      if (p.id !== null && p.id !== undefined) {
        var r = labelRec(p.id);
        r.hopIndex = num(p.index, -1);
        r.hopT = HOP_TIME;
        r.whiteT = HIT_WHITE;
        r.flinchT = FLINCH_TIME;
        r.blinkT = 0;
        r.borderT = 0;
        r.shakeT = 0;
      }
      if (p.complete && (p.kind === 'core' || p.kind === 'finisher')) bossWordDone(p);
    },

    'type:miss': function (p) {
      if (p.id === null || p.id === undefined) return;
      var r = labelRec(p.id);
      r.shakeT = MISS_SHAKE;
      r.borderT = MISS_SHAKE;
      r.blinkT = MISS_BLINK;
    },

    'target:release': function (p) {
      if (p.reason !== 'backspace' && p.reason !== 'auto') return;
      var t = p.target;
      if (!t || !isNum(t.x) || !isNum(t.y)) return;
      if (t.kind === 'core' || t.kind === 'finisher') return;
      var box = boxOf(t.kind);
      var f = alloc('unlock', WORLD);
      f.x = t.x; f.y = t.y;
      f.w = num(t.w, box[0]); f.h = num(t.h, box[1]);
      f.life = 8 * FRAME;
      f.z = 3;
    },

    'word:clear': function (p) {
      startClear(p);
    },

    'score:add': function (p) {
      if (!isNum(p.x) || !isNum(p.y)) return;
      var r = p.reason;
      if (r === 'core' || r === 'finisher' || r === 'boss') {
        // Boss scores stay by the Baron, who keeps pace with Pip.
        var dy = r === 'boss' ? -10 : 0;
        var f = popup(WORLD, '+' + Math.round(p.points), p.x, p.y - 36 + dy, r === 'boss' ? LIME : GOLD, r === 'boss' ? 0.2 : 0);
        f.follow = true;
      }
    },

    'life:gain': function (p) {
      // Effects on Pip move with him (he keeps his place on the screen).
      heroPos(heroTmp);
      following(function () {
        popup(WORLD, '1UP', heroTmp.x, heroTmp.y - 34, LIME, p.cause === 'cap' ? 0.5 : 0);
        burst(WORLD, heroTmp.x, heroTmp.y - 12, 10, 70, [LIME, WHITE, GOLD], 0, 0.35);
      });
    },

    'life:lost': function (p) {
      var cause = p.cause || {};
      if (cause.type === 'fall') requestShake(2, 0.2);
      else requestShake(3, 0.25);                 // DESIGN 6 and 14.6: hurt 3 px for 0.25 s
    },

    'hero:hurt': function (p) {
      heroPos(heroTmp);
      following(function () { impact(heroTmp.x, heroTmp.y - 12, true); });
    },

    'threat:hit': function (p) {
      // CONTRACT 4.17: the hit effect is drawn at Pip's position, not at the threat's.
      heroPos(heroTmp);
      var dir = isNum(p.x) && p.x < heroTmp.x - 2 ? -1 : 1;
      knockAway(p.kind, dir);
    },

    'threat:bounce': function (p) {
      heroPos(heroTmp);
      var dir = isNum(p.x) && p.x < heroTmp.x - 2 ? -1 : 1;
      puff('fx_poof', heroTmp.x + dir * 8, heroTmp.y - 10, 0);
      knockAway(p.kind, dir);
    },

    'threat:escape': function (p) {
      if (p.reason !== 'flee') return;
      var s = gameState();
      if (!s || !s.entities) return;
      for (var i = 0; i < s.entities.length; i++) {
        var e = s.entities[i];
        if (e && e.id === p.id && isNum(e.x) && isNum(e.y)) {
          var h = num(e.h, 16);
          puff('fx_poof', e.x, Math.min(e.y, TG.C.GROUND_Y) - h / 2, 0);
          return;
        }
      }
    },

    'hazard:hit': function (p) {
      heroPos(heroTmp);
      impact(heroTmp.x, heroTmp.y - 12, false);
      var colors = p.kind === 'bramble' ? [GRASS, CORAL, LIME] : [GRASS, LIME, SOIL];
      burst(WORLD, heroTmp.x, heroTmp.y - 16, 8, 90, colors, 300, 0.5);
    },

    'shield:break': function (p) {
      heroPos(heroTmp);
      var last = num(p.charges, 0) <= 0;
      following(function () {
        burst(WORLD, heroTmp.x, heroTmp.y - 14, last ? 16 : 10, last ? 130 : 90, [AQUA, WHITE, LILAC], 0, last ? 0.4 : 0.3);
        if (last) puff('fx_poof', heroTmp.x, heroTmp.y - 14, 0);
      });
    },

    'shield:gain': function () {
      heroPos(heroTmp);
      following(function () {
        for (var i = 0; i < 10; i++) {
          var a = (i / 10) * Math.PI * 2;
          particle(WORLD, heroTmp.x + Math.cos(a) * 20, heroTmp.y - 14 + Math.sin(a) * 20,
            -Math.cos(a) * 80, -Math.sin(a) * 80, 0, 0.25, i % 2 ? AQUA : WHITE, 2);
        }
      });
    },

    'pickup:ink': function (p) {
      if (!isNum(p.x) || !isNum(p.y)) return;
      particle(WORLD, p.x - 2, p.y - 6, -20, -60, 0, 0.25, AQUA, 1);
      particle(WORLD, p.x + 2, p.y - 6, 20, -60, 0, 0.25, WHITE, 1);
      particle(WORLD, p.x, p.y - 8, 0, -80, 0, 0.25, AQUA, 1);
    },

    'pickup:power': function (p) {
      if (p.power === 'blast') requestFlash(WHITE, 2);    // DESIGN 7: 2-frame white flash
    },

    'hero:jump': function (p) {
      if (isNum(p.x)) puff('fx_dust', p.x - 4, TG.C.GROUND_Y, 0);
    },

    'hero:land': function (p) {
      if (!isNum(p.x)) return;
      puff('fx_dust', p.x - 7, TG.C.GROUND_Y, 0);
      puff('fx_dust', p.x + 7, TG.C.GROUND_Y, 0);
    },

    'hero:duck': function (p) {
      if (isNum(p.x)) puff('fx_dust', p.x - 10, TG.C.GROUND_Y, 0);
    },

    'hero:rescue': function (p) {
      if (!isNum(p.x) || !isNum(p.y)) return;
      following(function () { burst(WORLD, p.x, p.y - 14, 10, 70, [AQUA, WHITE], 0, 0.3); });
    },

    'checkpoint': function (p) {
      if (!(p.index > 0) || !isNum(p.x)) return;
      var C = TG.C;
      for (var i = 0; i < 18; i++) {
        var f = particle(WORLD, p.x + 8 + rnd(-6, 6), C.GROUND_Y - 30, rnd(-70, 70), -rnd(90, 200), 260,
          rnd(0.7, 1.1), pick(CONFETTI), 2);
        f.blinkOut = 0.2;
      }
    },

    'hazard:bridge': function (p) {
      if (!isNum(p.x)) return;
      var w = num(p.w, 16);
      puff('fx_poof', p.x + w / 2, TG.C.GROUND_Y, 0);
      burst(WORLD, p.x + w / 2, TG.C.GROUND_Y, 8, 70, [SAND, CLAY, SOIL], 250, 0.4);
    },

    'attack:spawn': function (p) {
      if (p.kind !== 'shock') return;
      requestShake(2, 8 * FRAME);                 // DESIGN 14.6: boss stomp 2 px for 8 frames
      var s = gameState();
      if (s && s.boss && isNum(s.boss.x)) {
        following(function () {
          puff('fx_dust', s.boss.x - 20, TG.C.GROUND_Y, 0);
          puff('fx_dust', s.boss.x - 34, TG.C.GROUND_Y, 3 * FRAME);
        });
      }
    },

    'boss:attack': function (p) {
      if ((p.kind === 'shock' || p.kind === 'pick') && p.telegraph > 0) {
        telegraph.on = true;
        telegraph.kind = p.kind;
        telegraph.t = 0;
        telegraph.dur = p.telegraph;
      }
    },

    'boss:throw': function (p) {
      following(function () {
        if (isNum(p.x) && isNum(p.y)) burst(WORLD, p.x, p.y, 5, 50, [SAND, CLAY, WHITE], 200, 0.3);
      });
    },

    'boss:hit': function (p) {
      following(function () {
        var C = TG.C;
        var x = num(p.x, camX() + 296), y = num(p.y, C.GROUND_Y - 32);
        // The monocle pops off.
        var m = spriteParticle('boss_monocle', x - 10, y - 8, -rnd(50, 80), -rnd(170, 210), 520, 1.2);
        m.ground = C.GROUND_Y - 4;
        m.bounces = 2;
        m.blinkOut = 0.3;
        m.z = 3;
        for (var i = 0; i < 3; i++) {
          var st = spriteParticle('fx_star', x + rnd(-10, 10), y - 20, rnd(-60, 60), -rnd(60, 120), 200, 0.5, 8, 2);
          st.blinkOut = 0.15;
        }
        requestShake(2, 8 * FRAME);
      });
    },

    'boss:phase': function () {
      following(function () {
        // He stamps and dust falls (DESIGN 11.6).
        var C = TG.C;
        requestShake(2, 8 * FRAME);
        var cx = camX();
        for (var i = 0; i < 24; i++) {
          var f = particle(WORLD, cx + rnd(0, C.W), C.PLAY_TOP + rnd(-10, 20), rnd(-8, 8), rnd(20, 60), 90,
            rnd(1.2, 1.8), pick([SAND, CLAY, STONE]), random() < 0.3 ? 2 : 1);
          f.delay = rnd(0, 0.4);
          f.ground = C.GROUND_Y - 1;
          f.bounces = 0;
          f.blinkOut = 0.2;
        }
      });
    },

    'boss:defeat': function (p) {
      following(function () {
        // DESIGN 11.6: 30-frame freeze of the picture (TG.Render), 2-frame flash, the helmet flies off,
        // he spins and shrinks (TG.Render), and a fountain of letter tiles erupts from the hole.
        var C = TG.C;
        var x = num(p.x, camX() + 296), y = num(p.y, C.GROUND_Y);
        delayedFlash.t = 0.5;
        delayedFlash.color = WHITE;
        var hm = spriteParticle('boss_helmet', x - 2, y - 52, rnd(40, 60), -260, 480, 2.4);
        hm.delay = 0.55;
        hm.spin = 0.12;
        hm.ground = C.GROUND_Y - 4;
        hm.bounces = 2;
        hm.blinkOut = 0.4;
        hm.z = 3;
        puff('fx_poof', x, y - 30, 0.55);
        puff('fx_poof', x - 14, y - 18, 0.6);
        puff('fx_poof', x + 14, y - 22, 0.65);
        var tiles = String(lastFinisher || 'WORDS').toUpperCase() + 'SPELLRUNNER';
        for (var i = 0; i < 24; i++) {
          var f = alloc('letter', WORLD);
          f.ch = tiles.charAt(i % tiles.length);
          f.x = x - 4 + rnd(-3, 3);
          f.y = y - 12;
          f.vx = rnd(-70, 70);
          f.vy = -rnd(200, 300);
          f.g = 420;
          f.a = 0.25 + (i % 6) * FRAME;
          f.x1 = SCORE_X + (i % 7) * 4;
          f.y1 = SCORE_Y;
          f.life = 0.55 + f.a + LETTER_FLY;
          f.delay = 2.2 + i * 0.04;
          f.color = i % 3 === 0 ? CREAM : GOLD;
          f.home = true;               // a world letter that becomes a screen letter when it flies
          f.z = 3;
        }
      });
    }
  };

  // A weak-point or finisher word was completed: the ink bolt flies to the Baron and the letters fly
  // from the boss plate (CONTRACT 4.17, DESIGN 13.3).
  function bossWordDone(p) {
    var C = TG.C;
    var x = num(p.x, camX() + 296), y = num(p.y, C.GROUND_Y - 32);
    bolt(x, y);
    var word = p.target && p.target.word ? String(p.target.word) : '';
    if (p.kind === 'finisher') lastFinisher = word;
    if (word) {
      // The boss plate (TG.Hud): 2x letters in cells of 16 px from x + 4, glyph rows 37 to 50. Each
      // letter particle starts on the centre of its 2x letter.
      var w = 16 * word.length + 6;
      var x0 = Math.floor(C.W / 2 - w / 2);
      letters(word, x0 + 3, 39, 16, 0);
    }
    var s = spriteParticle('fx_star', x, y - 6, 0, -40, 0, 0.35, 8, 2);
    s.delay = BOLT_TIME;
    s.z = 3;
    s.follow = true;
    requestShake(1, 6 * FRAME);
  }

  // ---------------------------------------------------------------------------------------------
  // 6. update
  // ---------------------------------------------------------------------------------------------

  function update(dt) {
    if (!(dt > 0)) return;
    clock += dt;
    frameNo++;
    castT = Math.max(0, castT - dt);
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      if (shakeT === 0) shakeAmp = 0;
    }
    if (flashT > 0) {
      flashT = Math.max(0, flashT - dt);
      if (flashT === 0) flashColor = null;
    }
    if (delayedFlash.t >= 0) {
      delayedFlash.t -= dt;
      if (delayedFlash.t < 0) requestFlash(delayedFlash.color, 2);
    }
    if (telegraph.on) {
      telegraph.t += dt;
      if (telegraph.t >= telegraph.dur) telegraph.on = false;
    }

    for (var key in labels) {
      if (!hasOwn(labels, key)) continue;
      var r = labels[key];
      r.shakeT = Math.max(0, r.shakeT - dt);
      r.borderT = Math.max(0, r.borderT - dt);
      r.hopT = Math.max(0, r.hopT - dt);
      r.blinkT = Math.max(0, r.blinkT - dt);
      r.whiteT = Math.max(0, r.whiteT - dt);
      r.flinchT = Math.max(0, r.flinchT - dt);
      if (r.shakeT === 0 && r.borderT === 0 && r.hopT === 0 && r.blinkT === 0 && r.whiteT === 0 && r.flinchT === 0) {
        delete labels[key];
      }
    }

    // In the arena the Baron keeps pace with Pip, so the view scrolls under him. Effects that belong to
    // him (or to the screen) move with the view.
    var cam = camX();
    var camDelta = prevCam === null ? 0 : cam - prevCam;
    if (Math.abs(camDelta) > 32) camDelta = 0;          // a continue or a new run: the view jumped
    prevCam = cam;

    if (!pool) return;
    for (var i = 0; i < MAX_FX; i++) {
      var f = pool[i];
      if (!f.on) continue;
      if (f.follow && camDelta !== 0) {
        f.x += camDelta;
        f.x0 += camDelta;
        if (f.type !== 'letter') f.x1 += camDelta;
      }
      if (f.delay > 0) {
        f.delay -= dt;
        if (f.delay > 0) continue;
        f.delay = 0;
      }
      stepFx(f, dt);
    }
  }

  function stepFx(f, dt) {
    f.t += dt;
    switch (f.type) {
      case 'part':
        f.vy += f.g * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (f.ground > 0 && f.y >= f.ground && f.vy > 0) {
          f.y = f.ground;
          if (f.bounces > 0) {
            f.bounces--;
            f.vy = -f.vy * 0.45;
            f.vx *= 0.6;
          } else {
            f.vy = 0;
            f.vx = 0;
            f.g = 0;
            f.follow = false;       // at rest on the ground: from now on it stays where it lies
          }
        }
        break;
      case 'letter':
        stepLetter(f, dt);
        break;
      case 'clear':
        var tc = f.t - f.pre - WHITE_TIME;
        if (tc >= 0) {
          if (f.stage < 2) {
            f.stage = 2;
            clearBegin(f);
          }
          clearStep(f, tc, dt);
        }
        break;
      case 'fly':
        if (f.home) {
          heroPos(heroTmp);
          f.x1 = heroTmp.x;
          f.y1 = heroTmp.y - 10;
        }
        var r = clamp(f.t / f.life, 0, 1);
        f.x = f.x0 + (f.x1 - f.x0) * r;
        f.y = f.y0 + (f.y1 - f.y0) * r - f.arc * 4 * r * (1 - r);
        break;
    }
    if (f.t >= f.life) {
      if (f.type === 'clear') clearEnd(f);
      else if (f.type === 'fly' && f.power) itemArrived(f);
      else if (f.type === 'bolt') boltArrived(f);
      free(f);
    }
  }

  function boltArrived(f) {
    burst(WORLD, f.x1, f.y1, 6, 70, [AQUA, WHITE], 0, 0.2);
  }

  // Letters burst upward in world or screen space, then fly to the SCORE counter in screen space.
  function stepLetter(f, dt) {
    var burstEnd = f.home ? 0.55 : LETTER_BURST;
    if (f.t < burstEnd + f.a) {
      f.vy += f.g * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.home && f.y > TG.C.GROUND_Y - 10 && f.vy > 0) {
        f.y = TG.C.GROUND_Y - 10;
        f.vy = -f.vy * 0.3;
      }
      f.x0 = f.x;
      f.y0 = f.y;
      return;
    }
    if (f.home && f.layer === WORLD) {
      // Switch to screen space where the letter is now.
      f.layer = SCREEN;
      f.follow = false;
      f.x0 = f.x - camX();
      f.y0 = f.y;
    }
    var r = clamp((f.t - burstEnd - f.a) / LETTER_FLY, 0, 1);
    var e = r * r;
    f.x = f.x0 + (f.x1 - f.x0) * e;
    f.y = f.y0 + (f.y1 - f.y0) * e;
  }

  // ---------------------------------------------------------------------------------------------
  // 7. draw
  // ---------------------------------------------------------------------------------------------

  function blinkHidden(f) {
    if (f.blinkOut > 0 && f.life - f.t < f.blinkOut) return (frameNo & 1) === 1;
    return false;
  }

  function draw(ctx, layer, cam) {
    if (!ctx) return;
    var wantLayer = layer === 'screen' ? SCREEN : WORLD;
    var cx = wantLayer === WORLD ? num(cam, 0) : 0;
    if (wantLayer === WORLD) {
      lastCamX = num(cam, lastCamX);
      if (telegraph.on) drawTelegraph(ctx, cx);
    }
    if (!pool) return;
    var i, f;
    if (wantLayer === WORLD) {
      // Letters of a cleared word that are still in the playfield go first, under everything else.
      for (i = 0; i < MAX_FX; i++) {
        f = pool[i];
        if (f.on && f.delay <= 0 && lowLetter(f) && !blinkHidden(f)) drawFx(ctx, f, 0);
      }
    }
    for (var z = 0; z <= 3; z++) {
      for (i = 0; i < MAX_FX; i++) {
        f = pool[i];
        if (!f.on || f.layer !== wantLayer || f.z !== z || f.delay > 0) continue;
        if (blinkHidden(f) || lowLetter(f)) continue;
        drawFx(ctx, f, cx);
      }
    }
  }

  // A screen-space letter of a cleared word that is still below the top of the playfield (see letters).
  function lowLetter(f) {
    return f.low && f.type === 'letter' && f.layer === SCREEN && f.y >= TG.C.PLAY_TOP;
  }

  function frameOf(f) {
    if (f.fps > 0 && f.frames > 1) return Math.floor(f.t * f.fps) % f.frames;
    return f.frame;
  }

  function drawFx(ctx, f, cx) {
    var sx = Math.floor(f.x - cx), sy = Math.floor(f.y);
    switch (f.type) {
      case 'part':
        if (f.sprite) {
          var fr = frameOf(f);
          if (f.sprite === 'fx_daisy') fr = f.t < 0.15 ? 0 : (f.t < 0.3 ? 1 : 2);
          var flip = f.flip;
          if (f.spin > 0) flip = Math.floor(f.t / f.spin) % 2 === 1;
          var swayX = f.sway > 0 ? Math.round(Math.sin(f.t * f.swayHz * Math.PI * 2) * f.sway) : 0;
          sprite(ctx, f.sprite, fr, sx + swayX, sy, flip, f.remap);
        } else {
          rect(ctx, sx, sy, f.size, f.size, f.color);
        }
        break;
      case 'text':
        var rise = Math.min(1, f.t / POPUP_TIME) * 12;
        if (f.t > POPUP_TIME && (frameNo & 2) === 2 && f.life - f.t < 0.15) break;
        // Centred text, kept inside the view.
        var half = Math.ceil(f.text.length * 4);
        text(ctx, f.text, clamp(sx, half + 2, TG.C.W - half - 2), sy - 8 - Math.floor(rise), f.color);
        break;
      case 'letter':
        glyph(ctx, f.ch, sx, sy, f.color);
        break;
      case 'bolt':
        var r = clamp(f.t / f.life, 0, 1);
        var bx = f.x0 + (f.x1 - f.x0) * r, by = f.y0 + (f.y1 - f.y0) * r;
        // A short trail of ink behind the bolt.
        for (var k = 1; k <= 2; k++) {
          var rr = clamp(r - k * 0.18, 0, 1);
          rect(ctx, Math.floor(f.x0 + (f.x1 - f.x0) * rr - cx) - 1, Math.floor(f.y0 + (f.y1 - f.y0) * rr) - 1, 2, 2, k === 1 ? AQUA : 6);
        }
        sprite(ctx, 'ink_bolt', Math.floor(f.t * 20) % 2, Math.floor(bx - cx), Math.floor(by), f.x1 < f.x0, null);
        break;
      case 'clear':
        drawClear(ctx, f, cx);
        break;
      case 'fly':
        sprite(ctx, f.sprite, frameOf(f), sx, sy + 8, false, null);
        break;
      case 'unlock':
        drawUnlock(ctx, f, cx);
        break;
    }
  }

  function drawClear(ctx, f, cx) {
    var C = TG.C;
    var sx = Math.floor(f.x - cx), sy = Math.floor(f.y);
    var tc = f.t - f.pre - WHITE_TIME;
    if (tc < 0) {
      var white = f.t >= f.pre && !reduceFlash();
      if (f.kind === 'digby' && f.under) {
        sprite(ctx, 'en_mound', 'm0', sx, C.GROUND_Y, false, white ? 'white' : null);
      } else if (f.kind === 'digby') {
        spriteClipped(ctx, f.sprite, f.frame, sx, sy, false, white ? 'white' : null, C.GROUND_Y);
      } else {
        sprite(ctx, f.sprite, f.frame, sx, sy, f.flip, white ? 'white' : null);
        if (f.kind === 'crate' && f.power) sprite(ctx, 'pw_' + f.power, 0, sx, sy, false, white ? 'white' : null);
      }
      return;
    }
    var spin;
    switch (f.kind) {
      case 'dawdle':
        spin = Math.floor(tc * 30) % 2 === 1;
        sprite(ctx, 'en_dawdle', 'shell', sx, sy, spin, null);
        break;
      case 'hoppet':
        // Inflates: the puffed frame, wobbling.
        sprite(ctx, 'en_hoppet', 'puff', sx + (Math.floor(tc * 40) % 2), sy, false, null);
        break;
      case 'buzzle':
        var a = tc * 16;
        var bxx = f.x0 + Math.sin(a) * 9;
        var byy = f.y0 - tc * 90 + Math.cos(a) * 3;
        f.x = bxx; f.y = byy;
        sprite(ctx, 'en_buzzle', Math.floor(tc * 16) % 2, Math.floor(bxx - cx), Math.floor(byy), Math.cos(a) > 0, null);
        break;
      case 'swoop':
        sprite(ctx, 'en_swoop', Math.floor(tc * 12) % 2, sx, sy, false, null);
        break;
      case 'truffle':
        var turned = tc >= 0.34;
        var fr = tc < 0.28 ? 0 : (tc < 0.4 ? 1 : Math.floor(tc * 16) % 4);
        sprite(ctx, 'en_truffle', fr, sx, sy, !turned, null);
        break;
      case 'digby':
        var start = f.under ? 0.1 : 0;
        if (f.under && tc < 0.1) {
          // Pops out of the mound first.
          var rise = Math.floor(16 * (1 - tc / 0.1));
          spriteClipped(ctx, 'en_digby', 'up', sx, C.GROUND_Y + rise, false, null, C.GROUND_Y);
          sprite(ctx, 'en_mound', 'm0', sx, C.GROUND_Y, false, null);
          break;
        }
        var sink = Math.floor(clamp((tc - start) / 0.3, 0, 1) * 16);
        spriteClipped(ctx, 'en_digby', 'spin', sx, Math.min(sy, C.GROUND_Y) + sink, Math.floor(tc * 20) % 2 === 1, null, C.GROUND_Y);
        break;
      case 'rock':
        sprite(ctx, 'pr_rock', Math.floor(tc * 20) % 2, sx, sy, false, null);
        break;
      case 'boulder':
      case 'crate':
      default:
        break;
    }
  }

  // The four lock brackets move outward and blink out after a release (backspace or auto).
  function drawUnlock(ctx, f, cx) {
    if ((frameNo & 1) === 1 && f.t > 4 * FRAME) return;
    var d = 2 + Math.floor(f.t / FRAME);
    var left = Math.floor(f.x - f.w / 2 - cx) - d, right = Math.floor(f.x + f.w / 2 - cx) + d;
    var top = Math.floor(f.y - f.h) - d, bottom = Math.floor(f.y) + d;
    sprite(ctx, 'fx_bracket', 'tl1', left, top, false, 'dim');
    sprite(ctx, 'fx_bracket', 'tl1', right, top, true, 'dim');
    sprite(ctx, 'fx_bracket', 'bl1', left, bottom - 8, false, 'dim');
    sprite(ctx, 'fx_bracket', 'bl1', right, bottom - 8, true, 'dim');
  }

  // The telegraph of a physical attack: the ground (shockwave) or the air at head height (pickaxe)
  // between Pip and the Baron flashes for the telegraph time (DESIGN 11.6).
  function drawTelegraph(ctx, cx) {
    var C = TG.C;
    var s = gameState();
    if (!s || !s.player || !s.boss) return;
    var x0 = Math.floor(s.player.x - cx) + 14;
    var x1 = Math.floor(s.boss.x - cx) - 26;
    if (x1 <= x0) return;
    var steady = reduceFlash();
    var phase = Math.floor(telegraph.t * 10) % 2;
    var y = telegraph.kind === 'shock' ? C.GROUND_Y - 2 : C.GROUND_Y - C.HANG_CLEAR - 10;
    var dash = Math.floor(telegraph.t * 60) % 8;
    for (var x = x0 - dash; x < x1; x += 8) {
      var a = Math.max(x, x0), b = Math.min(x + 4, x1);
      if (b <= a) continue;
      rect(ctx, a, y, b - a, 2, steady || phase === 0 ? CORAL : GOLD);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // 8. The public object
  // ---------------------------------------------------------------------------------------------

  function reset() {
    if (pool) {
      for (var i = 0; i < MAX_FX; i++) pool[i].on = false;
    }
    liveCount = 0;
    labels = {};
    castT = 0;
    shakeAmp = 0;
    shakeT = 0;
    flashColor = null;
    flashT = 0;
    delayedFlash.t = -1;
    telegraph.on = false;
    blastCount = 0;
    blastStep = -1;
    wordsSinceQuality = 1;
  }

  function init() {
    for (var i = 0; i < subs.length; i++) subs[i]();
    subs = [];
    ensurePool();
    reset();
    if (!TG.Events || !TG.Events.on) return;
    Object.keys(handlers).forEach(function (name) {
      subs.push(TG.Events.on(name, function (payload) { handlers[name](payload || {}); }));
    });
  }

  TG.Effects = {
    init: init,
    reset: reset,
    update: update,
    draw: draw,

    // Current whole-pixel screen offset.
    shake: function () {
      if (shakeT <= 0 || shakeAmp <= 0 || reduceFlash()) return { x: 0, y: 0 };
      var k = Math.floor(clock * 60);
      var a = Math.round(shakeAmp);
      var x = (k & 1) ? a : -a;
      var y = a > 1 ? (((k >> 1) & 1) ? a - 1 : 1 - a) : 0;
      return { x: x, y: y };
    },

    // Palette index to fill the playfield with this frame, or null.
    flash: function () {
      if (flashT <= 0 || flashColor === null || reduceFlash()) return null;
      return flashColor;
    },

    // Per-typable label effects, or null when none is running for this id.
    label: function (id) {
      if (id === null || id === undefined) return null;
      var r = labels[String(id)];
      if (!r) return null;
      var o = r.out;
      o.shakeX = r.shakeT > 0 ? ((Math.floor(r.shakeT * 60) & 1) ? 2 : -2) : 0;
      o.border = r.borderT > 0 ? RED : null;
      o.hopIndex = r.hopT > 0 ? r.hopIndex : -1;
      o.blink = r.blinkT > 0;
      o.white = r.whiteT > 0 && !reduceFlash();     // no white sprite flashes with reduce flash on
      o.flinch = r.flinchT > 0 ? (r.flinchT > FLINCH_TIME / 2 ? 2 : 1) : 0;
      return o;
    },

    casting: function () {
      return castT > 0;
    },

    count: function () {
      return liveCount;
    },

    // Tests: every live effect as { type, layer, x, y } in screen px (world effects use the last camera).
    _list: function () {
      var out = [];
      if (!pool) return out;
      var cx = camX();
      for (var i = 0; i < MAX_FX; i++) {
        var f = pool[i];
        if (!f.on) continue;
        var x = f.x, y = f.y;
        if (f.type === 'bolt') { x = f.x1; y = f.y1; }
        out.push({ type: f.type, kind: f.kind || f.sprite || f.text || f.ch, layer: f.layer === SCREEN ? 'screen' : 'world',
          x: f.layer === SCREEN ? x : x - cx, y: y });
      }
      return out;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
