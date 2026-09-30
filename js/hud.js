// js/hud.js
// TG.Hud: the heads-up display (WP-F). CONTRACT 4.18, DESIGN 3.4, 3.5, 6, 8.7, 11.6 and 13.
//
// File layout:
//   1. constants and module state
//   2. helpers: numbers, the key guide layout, drawing (rects, text, glyphs, sprites, keycaps)
//   3. event handlers: banners, tips, prompts, flashes
//   4. update: banner queue, timers, the displayed score, WPM and accuracy
//   5. draw: top bar, progress strip or boss bar, boss plate, speech plate, banners, prompt line,
//      type bar, key guide, key prompts
//   6. the public object
//
// Presentation only: nothing here writes to the game state. The lock is read from
// state.typing.target (CONTRACT 4.7), so the HUD works on a hand-built state without typing.js.
// Only the canvas subset of CONTRACT 13.2 is used; no canvas is made per frame.
//
// Positions follow DESIGN 13, with these differences (see the hand-over notes):
//   - The type bar (13.4: y 198 to 213) is y 195 to 214 with its border at 194 and 215, so that the 2x
//     letters can be raised and the next letter underlined without touching the border.
//   - The prompt line has its text at y 186 (13.4: 188), so that its INK box ends above the type bar.
//     With the key guide on it moves right of the guide.
//   - The progress strip runs from x 4 to 351 with the crown at x 356; the power slot takes the rest.
//   - A banner is drawn at y 60 or 100, whichever hides less of the plates and creatures (13.5 moves it
//     to 100 only for the locked plate); a checkpoint result is shown before the next section's name.
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  // ---------------------------------------------------------------------------------------------
  // 1. Constants and module state
  // ---------------------------------------------------------------------------------------------

  var INK = 0, SHADOW = 1, STONE = 2, SILVER = 3, WHITE = 4, AQUA = 11, GRASS = 14, LIME = 15,
    GOLD = 18, CREAM = 19, RED = 25, CORAL = 26;

  var FRAME = 1 / 60;
  var MAX_BANNERS = 6;
  var PIP_X = 258;                  // first COMBO pip, after "X3" at x 240
  var GAUGE_X = 381, GAUGE_Y = 2, GAUGE_H = 14;   // power timer gauge beside the slot at (364, 1)
  var BANNER_OPEN = 4 * FRAME;      // the INK strip opens and closes over 4 frames
  var REFRESH = 0.5;                // DESIGN 13.2: WPM and accuracy refresh twice a second

  // DESIGN 13.4 key guide: three rows, 8 px per key, rows offset 0, 2 and 6 px.
  var ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  var ROW_OFF = [0, 2, 6];
  var GUIDE_X = 4, GUIDE_Y = 190;
  // Finger colours, mirrored per hand: little CORAL, ring GOLD, middle GRASS, index AQUA.
  var FINGER = {
    q: CORAL, a: CORAL, z: CORAL, p: CORAL,
    w: GOLD, s: GOLD, x: GOLD, o: GOLD, l: GOLD,
    e: GRASS, d: GRASS, c: GRASS, i: GRASS, k: GRASS,
    r: AQUA, f: AQUA, v: AQUA, t: AQUA, g: AQUA, b: AQUA, y: AQUA, h: AQUA, n: AQUA, u: AQUA, j: AQUA, m: AQUA
  };

  var TIPS = {
    threat: 'TIP: TYPE THE NEAREST WORD FIRST',
    jump: 'TIP: SPACE TO JUMP',
    duck: 'TIP: ENTER TO DUCK',
    hold: 'TIP: HOLD ENTER UNDER THE ARCH',
    fall: 'TIP: JUMP AT THE SIGNPOST',
    shock: 'TIP: JUMP THE SHOCKWAVE',
    pick: 'TIP: DUCK THE PICKAXE'
  };

  var banners = [];                 // queue; banners[0] is on screen
  var tip = { text: null, t: 0 };
  var tutor = { id: null, word: null };
  var missLetter = { ch: '', t: 0 };                 // wrong key with nothing locked
  var repeat = { id: null, index: -1, n: 0 };        // wrong keys in a row on one letter of the lock
  var livesFlash = { t: 0, color: WHITE };
  var comboT = 0, slotT = 0, hpLetterT = 0, hpHitT = 0, hpHitIndex = -1;
  var lastWeak = null;
  var weakFail = { word: null, t: 0 };
  var display = { state: null, score: 0, wpm: '---', acc: '---%', refreshT: 0 };
  var clock = 0;
  var subs = [];

  // ---------------------------------------------------------------------------------------------
  // 2. Helpers
  // ---------------------------------------------------------------------------------------------

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function num(v, fallback) {
    return isNum(v) ? v : fallback;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function pad(n, width) {
    if (TG.Util && TG.Util.pad) return TG.Util.pad(n, width);
    var s = String(Math.max(0, Math.floor(n)));
    while (s.length < width) s = '0' + s;
    return s;
  }

  function blinkOn(hz, time) {
    return Math.floor(time * hz * 2) % 2 === 0;
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

  function outline(c, x, y, w, h, color) {
    rect(c, x - 1, y - 1, w + 2, 1, color);
    rect(c, x - 1, y + h, w + 2, 1, color);
    rect(c, x - 1, y, 1, h, color);
    rect(c, x + w, y, 1, h, color);
  }

  var textOpts = { color: WHITE, scale: 1, align: 'left', shadow: false };
  function text(c, str, x, y, color, scale, align) {
    if (!TG.Font || !TG.Font.draw) return;
    textOpts.color = color;
    textOpts.scale = scale || 1;
    textOpts.align = align || 'left';
    textOpts.shadow = false;
    TG.Font.draw(c, str, Math.floor(x), Math.floor(y), textOpts);
  }

  function glyph(c, ch, x, y, color, scale) {
    if (TG.Font && TG.Font.drawGlyph) TG.Font.drawGlyph(c, ch, Math.floor(x), Math.floor(y), color, scale || 1);
  }

  var drawOpts = { flipX: false, remap: null, scale: 1, anchor: true };
  function sprite(c, name, frame, x, y, anchor, remap) {
    if (!TG.Gfx || !TG.Gfx.draw) return;
    drawOpts.flipX = false;
    drawOpts.remap = remap || null;
    drawOpts.scale = 1;
    drawOpts.anchor = anchor !== false;
    TG.Gfx.draw(c, name, frame, x, y, drawOpts);
  }

  // A key_wide cap stretched to width w: its left 2 columns, its column 2 repeated, its right 3 columns.
  var capOpts = { flipX: false, remap: null };
  function keycap(c, x, y, w, pressed) {
    if (!TG.Gfx || !TG.Gfx.get || !TG.Gfx.has || !TG.Gfx.has('key_wide')) {
      rect(c, x, y + (pressed ? 2 : 0), w, 14 - (pressed ? 2 : 0), WHITE);
      return;
    }
    var cv = TG.Gfx.get('key_wide', pressed ? 'down' : 'up', capOpts);
    if (!cv) return;
    x = Math.floor(x);
    y = Math.floor(y);
    c.imageSmoothingEnabled = false;
    c.drawImage(cv, 0, 0, 2, 16, x, y, 2, 16);
    c.drawImage(cv, 2, 0, 1, 16, x + 2, y, w - 5, 16);
    c.drawImage(cv, 29, 0, 3, 16, x + w - 3, y, 3, 16);
  }

  function gameState() {
    return TG.Game && TG.Game.state ? TG.Game.state : null;
  }

  function reduceFlash() {
    try {
      return !!(TG.Save && TG.Save.getSetting && TG.Save.getSetting('reduceFlash') === true);
    } catch (e) {
      return false;
    }
  }

  function sectionOf(state) {
    var level = state && state.level;
    if (!level) return null;
    var i = num(state.section, 0);
    if (i >= 3 || !level.sections || !level.sections[i]) return level.arena || null;
    return level.sections[i];
  }

  // The typable whose word the player should look at next: the lock, or the one with the lowest eta.
  function nextTypable(state) {
    var t = state.typing ? state.typing.target : null;
    if (t) return t;
    var best = null;
    var list = state.entities || [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e.dead || (e.type !== 'threat' && e.type !== 'crate') || e.typable === false || !e.word) continue;
      if (!best || num(e.eta, Infinity) < num(best.eta, Infinity)) best = e;
    }
    var bw = state.boss ? state.boss.word : null;
    if (!best && bw && bw.typable !== false && bw.word) best = bw;
    return best;
  }

  // ---------------------------------------------------------------------------------------------
  // 3. Event handlers
  // ---------------------------------------------------------------------------------------------

  function hazardTip(kind) {
    if (kind === 'bramble') return 'jump';
    return kind === 'arch' ? 'hold' : 'duck';
  }

  function makeBanner(textStr, seconds, color, sub, subColor, blink, kind) {
    return { text: String(textStr || ''), sub: sub || null, subColor: isNum(subColor) ? subColor : SILVER,
      seconds: seconds > 0 ? seconds : 2, color: isNum(color) ? color : WHITE, blink: !!blink, t: 0,
      kind: kind || 'banner', at: clock };
  }

  function queue(textStr, seconds, color, sub, subColor, blink, kind) {
    if (banners.length >= MAX_BANNERS) banners.splice(1, 1);
    banners.push(makeBanner(textStr, seconds, color, sub, subColor, blink, kind));
  }

  var handlers = {
    'level:start': function () {
      reset();
      var C = TG.C;
      var ready = num(C.READY_TIME, 3);
      queue('READY', ready * 2 / 3, GOLD);
      queue('GO!', ready / 3, LIME);
    },

    'section:enter': function (p) {
      if (!p.name) return;
      queue(String(p.name), 2.2, p.index === 3 ? CORAL : WHITE, p.stage ? 'STAGE ' + p.stage : null, SILVER, false, 'section');
    },

    'checkpoint': function (p) {
      if (!(p.index > 0)) return;
      var wpm = Math.round(num(p.wpm, 0));
      var acc = Math.floor(num(p.accuracy, 1) * 100);
      var sub = 'WPM ' + wpm + '  ACC ' + acc + '%';
      if (p.bonus > 0) sub += '  +' + Math.round(p.bonus);
      // The section banner of the same moment (Pip crossed into the next section in this step) waits
      // until the checkpoint result has been shown.
      var b = makeBanner('CHECKPOINT', 2.4, GOLD, sub, WHITE, false, 'checkpoint');
      var last = banners.length - 1;
      if (last >= 0 && banners[last].kind === 'section' && banners[last].at === clock && banners[last].t === 0) {
        banners.splice(last, 0, b);
      } else {
        if (banners.length >= MAX_BANNERS) banners.splice(1, 1);
        banners.push(b);
      }
    },

    'streak:milestone': function (p) {
      queue(String(num(p.value, 0)) + ' KEY STREAK!', 1.6, AQUA);
    },

    'streak:change': function (p) {
      if (num(p.mult, 1) > num(p.previousMult, 1)) comboT = 0.6;
    },

    'boss:warning': function () {
      queue('WARNING', 2.0, RED, null, null, true);
    },

    'tutor:prompt': function (p) {
      tutor.id = p.id;
      tutor.word = p.word ? String(p.word) : null;
    },

    'tutor:end': function (p) {
      if (p.id === tutor.id || p.id === undefined) {
        tutor.id = null;
        tutor.word = null;
      }
    },

    'life:lost': function (p) {
      livesFlash.t = 0.8;
      livesFlash.color = RED;
      var cause = p.cause || {};
      var key = null;
      if (cause.type === 'threat') key = 'threat';
      else if (cause.type === 'fall') key = 'fall';
      else if (cause.type === 'attack') key = cause.kind === 'pick' ? 'pick' : 'shock';
      else if (cause.type === 'hazard') key = hazardTip(cause.kind);
      if (key) {
        tip.text = TIPS[key];
        tip.t = 3.0;
      }
    },

    // The arch is the one hazard that needs the key held, and a hit on it is often taken by a shield,
    // which loses no life: the hold tip is shown for every arch hit.
    'hazard:hit': function (p) {
      if (p.kind !== 'arch') return;
      tip.text = TIPS.hold;
      tip.t = 3.0;
    },

    'life:gain': function () {
      livesFlash.t = 0.8;
      livesFlash.color = LIME;
    },

    'type:hit': function (p) {
      missLetter.t = 0;
      repeat.n = 0;
      if ((p.kind === 'core' || p.kind === 'finisher') && !p.complete) hpLetterT = 2 * FRAME;
    },

    'type:miss': function (p) {
      if (p.id === null || p.id === undefined) {
        missLetter.ch = p.ch ? String(p.ch) : '?';
        missLetter.t = 0.45;
        return;
      }
      repeat.id = p.id;
      repeat.n = num(p.repeat, 1);
    },

    'target:release': function () {
      repeat.n = 0;
    },

    'boss:hit': function (p) {
      hpHitT = 0.5;
      hpHitIndex = num(p.health, 0);
    },

    'boss:weakopen': function (p) {
      lastWeak = p.word ? String(p.word) : null;
      weakFail.t = 0;
    },

    'boss:weakclose': function (p) {
      if (p.completed === false && lastWeak) {
        weakFail.word = lastWeak;
        weakFail.t = 0.8;
      }
    },

    'power:start': function () {
      slotT = 0.5;
    }
  };

  // ---------------------------------------------------------------------------------------------
  // 4. update
  // ---------------------------------------------------------------------------------------------

  function update(dt, state) {
    if (!(dt > 0)) return;
    // The paused picture stays as it is: nothing on the HUD moves while the game is paused.
    if (state && state.screen === 'paused') return;
    clock += dt;
    if (banners.length > 0) {
      banners[0].t += dt;
      if (banners[0].t >= banners[0].seconds) banners.shift();
    }
    tip.t = Math.max(0, tip.t - dt);
    if (tip.t === 0) tip.text = null;
    missLetter.t = Math.max(0, missLetter.t - dt);
    livesFlash.t = Math.max(0, livesFlash.t - dt);
    comboT = Math.max(0, comboT - dt);
    slotT = Math.max(0, slotT - dt);
    hpLetterT = Math.max(0, hpLetterT - dt);
    hpHitT = Math.max(0, hpHitT - dt);
    weakFail.t = Math.max(0, weakFail.t - dt);
    if (!state) return;

    // The score counts up to its value; a lower value (a continue) is shown at once.
    var score = Math.max(0, Math.floor(num(state.score, 0)));
    if (display.state !== state) {
      display.state = state;
      display.score = score;
      display.refreshT = 0;
    } else if (score <= display.score) {
      display.score = score;
    } else {
      var step = Math.max(10, Math.ceil((score - display.score) * 0.15));
      display.score = Math.min(score, display.score + step);
    }

    display.refreshT -= dt;
    if (display.refreshT <= 0) {
      display.refreshT = REFRESH;
      refreshStats(state);
    }
  }

  function refreshStats(state) {
    var st = state && state.typing ? state.typing.stats : null;
    if (!st) {
      display.wpm = '---';
      display.acc = '---%';
      return;
    }
    display.wpm = isNum(st.liveWpm) ? pad(Math.min(999, Math.round(st.liveWpm)), 3) : '---';
    var keys = num(st.correct, 0) + num(st.wrong, 0);
    display.acc = keys > 0 ? pad(Math.floor(num(st.accuracy, 1) * 100), 3) + '%' : '---%';
  }

  // ---------------------------------------------------------------------------------------------
  // 5. draw
  // ---------------------------------------------------------------------------------------------

  function drawTopBar(c, state) {
    var C = TG.C;
    rect(c, 0, 0, C.W, 20, INK);
    var p = state.player;
    var st = state.typing ? state.typing.stats : null;
    var pw = state.power || {};

    // SCORE
    var score = display.state === state ? display.score : Math.max(0, Math.floor(num(state.score, 0)));
    text(c, 'SCORE', 4, 2, SILVER);
    text(c, pad(Math.min(9999999, score), 7), 4, 10, WHITE);
    // PIP: head icon and lives, then one shield icon per shield charge (no label of their own)
    text(c, 'PIP', 68, 2, SILVER);
    sprite(c, 'icon_pip', 0, 68, 10, false);
    var lifeColor = livesFlash.t > 0 && blinkOn(8, clock) ? livesFlash.color : WHITE;
    text(c, 'X' + (p ? clamp(Math.floor(num(p.lives, 0)), 0, 9) : 0), 76, 10, lifeColor);
    var shield = clamp(Math.floor(num(pw.shield, 0)), 0, 2);
    if (shield >= 1) sprite(c, 'icon_shield', 0, 96, 10, false);
    if (shield >= 2) sprite(c, 'icon_shield', 0, 105, 10, false);
    // INK: drop icon and the count towards the next life
    text(c, 'INK', 120, 2, SILVER);
    sprite(c, 'icon_ink', 0, 120, 10, false);
    text(c, pad(clamp(Math.floor(num(state.ink, 0)), 0, 99), 3), 128, 10, WHITE);
    // WPM and ACC, refreshed twice a second
    if (display.state !== state) refreshStats(state);
    text(c, 'WPM', 160, 2, SILVER);
    text(c, display.wpm, 160, 10, WHITE);
    text(c, 'ACC', 196, 2, SILVER);
    text(c, display.acc, 196, 10, WHITE);
    // COMBO: the multiplier, then one pip per clean word needed for the next step, filled for the clean
    // words already typed (all filled at the top step)
    text(c, 'COMBO', 240, 2, SILVER);
    var mult = st ? clamp(Math.floor(num(st.mult, 1)), 1, 9) : 1;
    var run = st ? Math.max(0, Math.floor(num(st.cleanRun, 0))) : 0;
    var comboColor = comboT > 0 && blinkOn(8, clock) ? GOLD : (mult > 1 ? CREAM : WHITE);
    text(c, 'X' + mult, 240, 10, comboColor);
    drawComboPips(c, mult, run, comboColor);
    // STAGE
    text(c, 'STAGE', 300, 2, SILVER);
    var sec = sectionOf(state);
    text(c, sec && sec.stage ? String(sec.stage) : '1-1', 300, 10, WHITE);
    // Power slot: the latest timed power-up, with its timer as a gauge beside the slot (x 381 to 382,
    // y 2 to 15) that runs down. The empty slot is dimmed.
    var last = pw.last;
    var timed = last === 'hourglass' || last === 'quill';
    sprite(c, 'ui_slot', 0, 364, 1, false, timed ? null : 'dim');
    if (timed) {
      var left = last === 'hourglass' ? num(pw.slowT, 0) : num(pw.quillT, 0);
      var total = last === 'hourglass' ? num(C.HOURGLASS_TIME, 6) : num(C.QUILL_TIME, 10);
      var frac = total > 0 ? clamp(left / total, 0, 1) : 0;
      var showIcon = left > 2 || blinkOn(4, clock);
      if (showIcon && !(slotT > 0 && !blinkOn(10, clock))) sprite(c, 'pw_' + last, Math.floor(clock * 4) % 2, 372, 17, true);
      var gauge = Math.round(GAUGE_H * frac);
      rect(c, GAUGE_X, GAUGE_Y, 2, GAUGE_H, SHADOW);
      rect(c, GAUGE_X, GAUGE_Y + GAUGE_H - gauge, 2, gauge, last === 'quill' ? GOLD : AQUA);
    }
  }

  // The pips after the COMBO multiplier (DESIGN 8.2, 13.2): the clean words of the current step of
  // MULT_STEPS, out of the words that step needs. 3 x 5 px each, 4 px apart, from x 258.
  function drawComboPips(c, mult, run, color) {
    var steps = TG.C && Array.isArray(TG.C.MULT_STEPS) ? TG.C.MULT_STEPS : [0, 3, 6, 10, 15];
    var i = clamp(mult - 1, 0, steps.length - 1);
    var from = num(steps[i], 0);
    var top = i >= steps.length - 1;
    var need = top ? num(steps[i], 0) - num(steps[i - 1], 0) : num(steps[i + 1], from + 1) - from;
    need = clamp(need, 1, 5);
    var have = top ? need : clamp(run - from, 0, need);
    for (var k = 0; k < need; k++) rect(c, PIP_X + 4 * k, 11, 3, 5, k < have ? color : SHADOW);
  }

  // Progress strip (DESIGN 13.1): SHADOW track, GOLD fill, WHITE checkpoint ticks, crown at the boss end.
  function drawStrip(c, state) {
    var C = TG.C;
    rect(c, 0, 20, C.W, 3, INK);
    var level = state.level;
    var X0 = 4, W = 348;
    rect(c, X0, 20, W, 3, SHADOW);
    var end = level && level.arenaX > 0 ? level.arenaX : 1;
    var px = state.player ? num(state.player.x, 0) : 0;
    rect(c, X0, 20, Math.round(W * clamp(px / end, 0, 1)), 3, GOLD);
    var cps = level && level.checkpoints ? level.checkpoints : [];
    for (var i = 1; i < cps.length - 1; i++) {
      var tx = X0 + Math.round(W * clamp(num(cps[i].flagX, cps[i].x) / end, 0, 1));
      rect(c, tx, 20, 1, 3, WHITE);
    }
    sprite(c, 'icon_crown', 0, 356, 16, false);
  }

  // Boss bar (DESIGN 11.6, 13.3): "BARON" at x 232, bar from x 280 to 376, y 24 to 29, one segment per
  // weak-point word; RED with a CORAL highlight, lost segments SHADOW.
  function drawBossBar(c, state, time) {
    var C = TG.C;
    var boss = state.boss;
    rect(c, 0, 20, C.W, 3, INK);
    rect(c, 228, 20, 152, 11, INK);
    text(c, 'BARON', 232, 23, WHITE);
    var n = Math.max(1, Math.floor(num(boss.maxHealth, 1)));
    var health = clamp(Math.floor(num(boss.health, 0)), 0, n);
    for (var i = 0; i < n; i++) {
      var x0 = 280 + Math.floor(96 * i / n), x1 = 280 + Math.floor(96 * (i + 1) / n);
      var w = x1 - x0 - (i < n - 1 ? 1 : 0);
      var alive = i < health;
      var flashNext = alive && i === health - 1 && hpLetterT > 0 && !reduceFlash();
      var flashLost = !alive && i === hpHitIndex && hpHitT > 0 && blinkOn(8, time);
      if (flashNext || flashLost) {
        rect(c, x0, 24, w, 6, WHITE);
      } else if (alive) {
        rect(c, x0, 24, w, 6, RED);
        rect(c, x0, 24, w, 1, CORAL);
      } else {
        rect(c, x0, 24, w, 6, SHADOW);
      }
    }
  }

  // Boss plate (DESIGN 4.5, 13.3): the weak-point or finisher word at 2x, centred at x 192, top at y 34.
  function drawBossPlate(c, state, time) {
    var boss = state.boss;
    var word = boss ? boss.word : null;
    var target = state.typing ? state.typing.target : null;
    if (word && word.word && word.typable !== false && !word.lost) {
      var str = String(word.word).toUpperCase();
      var n = str.length;
      var w = 16 * n + 6;
      var lab = TG.Effects && TG.Effects.label ? TG.Effects.label(word.id) : null;
      var x = Math.floor(TG.C.W / 2 - w / 2) + (lab ? lab.shakeX : 0), y = 34;
      var locked = target === word;
      var border = lab && lab.border !== null && lab.border !== undefined ? lab.border
        : (locked ? GOLD : (word.kind === 'finisher' ? (blinkOn(2, time) ? GOLD : CREAM) : WHITE));
      rect(c, x, y, w, 20, INK);
      outline(c, x, y, w, 20, border);
      var typed = clamp(Math.floor(num(word.typed, 0)), 0, n);
      var blink = lab && lab.blink && Math.floor(time * 16) % 2 === 0;
      for (var i = 0; i < n; i++) {
        var gx = x + 4 + 16 * i;
        if (i < typed) {
          glyph(c, str.charAt(i), gx, y + 1 + (lab && lab.hopIndex === i ? -1 : 0), GOLD, 2);
        } else {
          glyph(c, str.charAt(i), gx, y + 3, i === typed && blink ? CORAL : WHITE, 2);
          if (i === typed) rect(c, gx, y + 18, 14, 2, AQUA);
        }
      }
      // The weak-point window: a bar under the plate that runs down.
      if (word.kind === 'core' && num(boss.windowWs, 0) > 0) {
        var frac = clamp(1 - num(boss.stateT, 0) / boss.windowWs, 0, 1);
        rect(c, x, y + 22, w, 2, SHADOW);
        var low = frac < 0.3;
        if (!low || blinkOn(4, time)) rect(c, x, y + 22, Math.round(w * frac), 2, low ? RED : GOLD);
      }
      return;
    }
    if (weakFail.t > 0 && weakFail.word) {
      // The window ran out: the word drops away in grey.
      var s2 = weakFail.word.toUpperCase();
      var w2 = 16 * s2.length + 6;
      var drop = Math.floor((0.8 - weakFail.t) * 30);
      var x2 = Math.floor(TG.C.W / 2 - w2 / 2);
      rect(c, x2, 34 + drop, w2, 20, INK);
      outline(c, x2, 34 + drop, w2, 20, RED);
      for (var k = 0; k < s2.length; k++) glyph(c, s2.charAt(k), x2 + 4 + 16 * k, 37 + drop, STONE, 2);
    }
  }

  // Speech plate during the boss intro (CONTRACT 4.18): INK with a WHITE border, centred at x 192,
  // top at y 40, text at 1x, from the second half of the intro. The text appears letter by letter.
  function drawSpeech(c, state) {
    if (state.screen !== 'bossIntro' || !state.boss) return;
    var speech = state.level && state.level.boss && state.level.boss.speech ? String(state.level.boss.speech) : '';
    if (!speech) return;
    var intro = num(state.boss.introTime, num(TG.C.BOSS_INTRO_TIME, 4));
    var since = num(state.screenT, 0) - intro / 2;
    if (since < 0) return;
    var n = speech.length;
    var w = 8 * n + 5, h = 13;
    var x = Math.floor(TG.C.W / 2 - w / 2), y = 40;
    rect(c, x, y, w, h, WHITE);
    rect(c, x + 1, y + 1, w - 2, h - 2, INK);
    var shown = clamp(Math.floor(since * 30), 0, n);
    text(c, speech.slice(0, shown), x + 3, y + 3, WHITE);
  }

  // Banners (DESIGN 13.5): centred at y 60 in 2x text on an INK strip, one at a time. When the strip
  // would cover the plate of the locked target it is drawn at y 100. The place is chosen when the banner
  // appears (the one of 60 and 100 that hides least) and kept, unless the lock comes under it.
  function drawBanner(c, state, time) {
    var b = banners[0];
    if (!b) return;
    var C = TG.C;
    var scale = 16 * b.text.length <= C.W - 24 ? 2 : 1;
    var tw = 8 * scale * b.text.length;
    var sw = b.sub ? 8 * b.sub.length : 0;
    var w = Math.max(tw, sw) + 16;
    var h = 8 * scale + 8 + (b.sub ? 11 : 0);
    var x0 = Math.floor(C.W / 2 - w / 2);
    if (b.y !== 60 && b.y !== 100) {
      b.y = bannerCost(state, x0, w, 56, 56 + h, true) <= bannerCost(state, x0, w, 96, 96 + h, true) ? 60 : 100;
    } else if (bannerCost(state, x0, w, b.y - 4, b.y - 4 + h) >= 50) {
      // The lock's plate or its creature came under the banner: it moves if the other place is better.
      var other = b.y === 60 ? 100 : 60;
      if (bannerCost(state, x0, w, other - 4, other - 4 + h) < 50) b.y = other;
    }
    var y = b.y;
    var top = y - 4;
    // The strip opens and closes over 4 frames.
    var open = Math.min(1, b.t / BANNER_OPEN, (b.seconds - b.t) / BANNER_OPEN);
    var sh = Math.max(2, Math.round(h * clamp(open, 0, 1)));
    var x = Math.floor(C.W / 2 - w / 2);
    rect(c, x, top + Math.floor((h - sh) / 2), w, sh, INK);
    if (open < 1) return;
    rect(c, x, top, w, 1, SHADOW);
    rect(c, x, top + h - 1, w, 1, SHADOW);
    if (b.blink && !blinkOn(4, b.t)) return;
    text(c, b.text, C.W / 2, y, b.color, scale, 'center');
    if (b.sub) text(c, b.sub, C.W / 2, y + 8 * scale + 3, b.subColor, 1, 'center');
  }

  // How much a banner strip over x0..x0+w, top..bottom would hide: the plate of the locked target (it
  // must never be covered), the boss plate, the locked target's sprite, other plates and sprites.
  function bannerCost(state, x0, w, top, bottom, choosing) {
    var C = TG.C;
    var cost = 0;
    var target = state.typing ? state.typing.target : null;
    var camX = state.camera ? num(state.camera.x, 0) : 0;
    function covers(x, y, bw, bh) {
      return x < x0 + w && x + bw > x0 && y < bottom && y + bh > top;
    }
    if (TG.Render && TG.Render.layoutLabels) {
      var labels = TG.Render.layoutLabels(state);
      for (var i = 0; i < labels.length; i++) {
        var L = labels[i];
        if (covers(L.x - 2, L.y - 2, L.w + 4, L.h + 4)) cost += L.locked ? 100 : 10;
      }
    }
    if (state.boss && state.boss.word && covers(0, 33, C.W, 26)) cost += 100;
    // A new banner also keeps clear of the speech plate of the boss intro (y 40 to 52) and the 4 px under it.
    if (choosing && state.screen === 'bossIntro' && covers(0, 40, C.W, 17)) cost += 20;
    var list = state.entities || [];
    for (var k = 0; k < list.length; k++) {
      var e = list[k];
      if (!e || e.dead || !isNum(e.x) || !isNum(e.y)) continue;
      var ew = num(e.w, 16), eh = num(e.h, 16);
      if (covers(Math.floor(e.x - camX - ew / 2), Math.floor(e.y - eh), ew, eh)) cost += e === target ? 50 : 5;
    }
    return cost;
  }

  // Prompt line (DESIGN 13.4): centred at x 192, text at y 186 (2 px above 188, so that its INK box ends
  // above the border of the type bar). The tutorial prompt, or a tip.
  function drawPromptLine(c, state, time) {
    var C = TG.C;
    var str = null, word = null;
    if (tutor.word && state.tutorial && state.tutorial.active !== false) {
      str = 'TYPE: ';
      word = tutor.word.toUpperCase();
    } else if (tip.text) {
      str = tip.text;
    }
    if (!str) return;
    var total = str.length + (word ? word.length : 0);
    var w = 8 * total + 6;
    var x = Math.floor(C.W / 2 - w / 2);
    // With the key guide on (x 2 to 86), the line moves right so that it does not cover the guide.
    if (keyGuideOn(state) && x < 90) x = Math.min(90, C.W - 2 - w);
    rect(c, x, 185, w, 9, INK);
    if (word) {
      text(c, str, x + 3, 186, WHITE);
      text(c, word, x + 3 + 8 * str.length, 186, blinkOn(2, time) ? GOLD : CREAM);
    } else {
      text(c, str.slice(0, 4), x + 3, 186, GOLD);
      text(c, str.slice(4), x + 3 + 32, 186, WHITE);
    }
  }

  // Type bar (DESIGN 13.4): the locked word at 2x (1x above 10 letters), typed letters GOLD and raised,
  // the next letter underlined. Empty when nothing is locked. The plate is y 195 to 214 with its GOLD
  // border outside (194 and 215), so that raised letters and the underline keep clear of the border.
  var TB_Y = 195, TB_H = 20;

  function drawTypeBar(c, state, time) {
    var C = TG.C;
    var t = state.typing ? state.typing.target : null;
    if (!t || !t.word) {
      if (missLetter.t > 0 && missLetter.ch) {
        // A wrong key with nothing locked: the letter shows briefly in RED.
        var shake = Math.floor(missLetter.t * 60) % 2 ? 1 : -1;
        var mx = Math.floor(C.W / 2) - 11 + shake;
        rect(c, mx, TB_Y, 22, TB_H, INK);
        outline(c, mx, TB_Y, 22, TB_H, RED);
        glyph(c, missLetter.ch.toUpperCase(), mx + 4, TB_Y + 3, RED, 2);
      }
      return;
    }
    var str = String(t.word).toUpperCase();
    var n = str.length;
    var scale = n <= 10 ? 2 : 1;
    var cell = 8 * scale;
    var w = cell * n + (scale === 2 ? 6 : 8);
    var x = Math.floor(C.W / 2 - w / 2), y = TB_Y;
    var lab = TG.Effects && TG.Effects.label ? TG.Effects.label(t.id) : null;
    if (lab) x += lab.shakeX;
    var border = lab && lab.border !== null && lab.border !== undefined ? lab.border : GOLD;
    rect(c, x, y, w, TB_H, INK);
    outline(c, x, y, w, TB_H, border);
    var typed = clamp(Math.floor(num(t.typed, 0)), 0, n);
    var blink = lab && lab.blink && Math.floor(time * 16) % 2 === 0;
    var hop = lab ? lab.hopIndex : -1;
    var gx0 = x + (scale === 2 ? 4 : 5);
    var gy = scale === 2 ? y + 3 : y + 6;
    var under = scale === 2 ? y + 18 : y + 15;
    for (var i = 0; i < n; i++) {
      var gx = gx0 + cell * i;
      if (i < typed) {
        glyph(c, str.charAt(i), gx, gy - scale - (i === hop ? 1 : 0), GOLD, scale);
      } else {
        glyph(c, str.charAt(i), gx, gy, i === typed && blink ? CORAL : WHITE, scale);
        if (i === typed) rect(c, gx, under, 7 * scale, 1, AQUA);
      }
    }
    // After three wrong keys on the same letter the expected letter is shown enlarged (DESIGN 3.4).
    if (repeat.n >= 3 && repeat.id === t.id && typed < n) {
      var bx = Math.floor(C.W / 2) - 18, by = 156;
      rect(c, bx, by, 36, 34, INK);
      outline(c, bx, by, 36, 34, blinkOn(4, time) ? RED : CORAL);
      glyph(c, str.charAt(typed), bx + 4, by + 3, WHITE, 4);
    }
  }

  // Key guide (DESIGN 13.4): three rows of keys coloured by finger; the next key is lit in WHITE.
  function drawKeyGuide(c, state, time) {
    if (!keyGuideOn(state)) return;
    rect(c, 2, 188, 84, 27, INK);
    var next = nextTypable(state);
    var nextCh = '';
    if (next && next.word) nextCh = String(next.word).charAt(clamp(Math.floor(num(next.typed, 0)), 0, next.word.length - 1)).toLowerCase();
    var stuck = repeat.n >= 3 && state.typing && state.typing.target;
    for (var r = 0; r < ROWS.length; r++) {
      var row = ROWS[r];
      for (var i = 0; i < row.length; i++) {
        var ch = row.charAt(i);
        var x = GUIDE_X + ROW_OFF[r] + 8 * i, y = GUIDE_Y + 8 * r;
        var color = FINGER[ch];
        if (ch === nextCh) {
          // The next key is a WHITE block, a colour no finger uses, so it does not merge with the keys
          // above and below it, which share its finger colour. After three wrong keys it flashes RED.
          var flash = stuck && !blinkOn(4, time);
          rect(c, x - 1, y - 1, 9, 9, flash ? RED : WHITE);
          glyph(c, ch.toUpperCase(), x, y, flash ? WHITE : INK, 1);
        } else {
          glyph(c, ch.toUpperCase(), x, y, color, 1);
        }
      }
    }
  }

  // Key prompt (DESIGN 5, 13.4): on Easy, above Pip for the first hazards of each action: a SPACE or an
  // ENTER keycap, shown pressing while Pip is inside the input window. Like the audio cue it is a signal
  // to react to, so it appears only when the window opens: a keycap shown earlier invited presses before
  // the window, which drop Pip into a gap.
  function drawKeyPrompt(c, state, time) {
    var C = TG.C;
    var p = state.player;
    var level = state.level;
    if (!p || !level || !level.hazards) return;
    if (state.screen !== 'playing' && state.screen !== 'lifeLost') return;
    var px = num(p.x, 0);
    for (var i = 0; i < level.hazards.length; i++) {
      var h = level.hazards[i];
      if (!h.prompt || h.bridged || h.passed) continue;
      if (px < h.winStart || px > (h.hold ? h.holdUntil : h.winEnd)) continue;
      // Once the key has been pressed (Pip is in the air, or sliding) the prompt has done its work; under
      // an arch it stays as a reminder to hold the key.
      var airborne = p.jumpT >= 0 || p.state === 'jump' || p.state === 'fall';
      if (h.action === 'jump' && airborne) return;
      if (h.action === 'duck' && p.state === 'slide' && !h.hold) return;
      var legend = h.action === 'duck' ? 'ENTER' : 'SPACE';
      var camX = state.camera ? num(state.camera.x, 0) : 0;
      var cx = Math.floor(px - camX);
      var w = 8 * legend.length + 6;
      var x = cx - Math.floor(w / 2), y = C.GROUND_Y - 24 - 12 - 16;
      var pressed = blinkOn(4, time) || (h.hold && p.state === 'slide');
      keycap(c, x, y, w, pressed);
      text(c, legend, x + 3, y + (pressed ? 5 : 3), INK);
      if (h.hold) text(c, 'HOLD', cx, y - 9, GOLD, 1, 'center');
      return;
    }
  }

  function draw(c, state) {
    if (!c || !state) return;
    var time = num(state.time, 0);
    if (state.level) {
      drawKeyPrompt(c, state, time);
      drawBossPlate(c, state, time);
      drawSpeech(c, state);
      drawBanner(c, state, time);
      drawPromptLine(c, state, time);
      drawTypeBar(c, state, time);
      drawKeyGuide(c, state, time);
    }
    drawTopBar(c, state);
    if (state.boss) drawBossBar(c, state, time);
    else drawStrip(c, state);
  }

  // ---------------------------------------------------------------------------------------------
  // 6. The public object
  // ---------------------------------------------------------------------------------------------

  function reset() {
    banners = [];
    tip.text = null;
    tip.t = 0;
    tutor.id = null;
    tutor.word = null;
    missLetter.t = 0;
    repeat.n = 0;
    repeat.id = null;
    livesFlash.t = 0;
    comboT = 0;
    slotT = 0;
    hpLetterT = 0;
    hpHitT = 0;
    hpHitIndex = -1;
    lastWeak = null;
    weakFail.t = 0;
    weakFail.word = null;
    display.state = null;
  }

  function keyGuideOn(state) {
    var setting = 'auto';
    try {
      if (TG.Save && TG.Save.getSetting) setting = TG.Save.getSetting('keyGuide') || 'auto';
    } catch (e) {
      setting = 'auto';
    }
    if (setting === 'on' || setting === true) return true;
    if (setting === 'off' || setting === false) return false;
    var cfg = state && state.config ? state.config : null;
    if (!cfg && state && state.difficulty && TG.Difficulty && TG.Difficulty.get) {
      try { cfg = TG.Difficulty.get(state.difficulty); } catch (e) { cfg = null; }
    }
    return !!(cfg && cfg.keyGuide);
  }

  TG.Hud = {
    init: function () {
      for (var i = 0; i < subs.length; i++) subs[i]();
      subs = [];
      reset();
      if (!TG.Events || !TG.Events.on) return;
      Object.keys(handlers).forEach(function (name) {
        subs.push(TG.Events.on(name, function (payload) { handlers[name](payload || {}); }));
      });
    },
    reset: reset,
    update: update,
    draw: draw,
    // opts: { seconds: 2, color: index }
    banner: function (textStr, opts) {
      var o = opts || {};
      queue(textStr, num(o.seconds, 2), isNum(o.color) ? o.color : WHITE, o.sub || null, SILVER, !!o.blink);
    },
    keyGuideOn: keyGuideOn
  };
})(typeof window !== 'undefined' ? window : globalThis);
