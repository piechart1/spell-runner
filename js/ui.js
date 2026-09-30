// js/ui.js
// SPELL RUNNER interface screens (WP-G). Defines TG.UI.
//
// Contract: docs/CONTRACT.md sections 4.20, 8.6, 9 and 13. Design: docs/DESIGN.md sections 2, 8.8,
// 8.9, 10.5 and 12.
//
// TG.UI owns the screens that are not simulated: boot, title (with its menu, options, high score and
// story panels), difficultySelect, howToPlay, paused (menu and resume countdown), gameOver (continue
// countdown), results (tally and rank) and highScoreEntry. It reads keys from the TG.Input queue in
// update(), changes screens only through TG.Game (setScreen, newRun, resume, continueRun, endRun)
// and emits the ui:* events that TG.Audio plays. It also does the saving that follows from play
// (CONTRACT 4.20), because the simulation never writes to TG.Save.
//
// File layout:
//   1. constants, texts and small helpers
//   2. drawing helpers: only TG.Gfx, TG.Font and the canvas subset of CONTRACT 13.2
//   3. screen set-up (on screen:change) and the saving that follows from play
//   4. one section per screen, each with its update (keys and timers) and its draw
//   5. the public object
//
// How keys are read. update() drains TG.Input once per step and turns the queue into actions:
//   up, down, left, right          arrow keys (the DUCK button counts as down)
//   confirm                        Enter or Space (the JUMP button counts as confirm)
//   back                           Esc
//   backspace                      Backspace
//   letter                         a-z
// Key releases are not used. When an action changes the screen, the rest of that step's keys are
// dropped, so one key press never acts on two screens.
//
// Nothing runs at load time. Every other module is looked up inside function bodies and every call
// into another package is guarded, so this file also works with only core.js loaded.
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  // ---------------------------------------------------------------------------------------------
  // 1. Constants, texts and small helpers
  // ---------------------------------------------------------------------------------------------

  // Palette indices (DESIGN 14.2).
  var INK = 0, SHADOW = 1, STONE = 2, SILVER = 3, WHITE = 4, DEEP_BLUE = 5, SKY = 7,
    AQUA = 11, FOREST = 13, GRASS = 14, LIME = 15, ORANGE = 17, GOLD = 18, SOIL = 21,
    RED = 25, CORAL = 26;

  // Internal resolution (TG.C may be read at load time, CONTRACT 2.2 rule 3).
  var SW = (TG.C && TG.C.W) || 384;
  var SH = (TG.C && TG.C.H) || 216;
  var CX = SW / 2;
  var GROUND = (TG.C && TG.C.GROUND_Y) || 184;

  var NAMES = ['easy', 'medium', 'hard'];

  // Used when TG.Difficulty or TG.Words is not loaded (CONTRACT 5.10, DESIGN 10.5).
  var FALLBACK_DIFF = {
    easy: { label: 'EASY', description: 'SHORT WORDS, HOME ROW FIRST', wpmGuide: '10-20', lives: 5 },
    medium: { label: 'MEDIUM', description: 'EVERYDAY WORDS', wpmGuide: '20-40', lives: 4 },
    hard: { label: 'HARD', description: 'LONG AND UNUSUAL WORDS', wpmGuide: '40+', lives: 3 }
  };
  var FALLBACK_SAMPLES = {
    easy: ['ask', 'frog', 'puppy'],
    medium: ['river', 'bridge', 'rainbow'],
    hard: ['zephyr', 'labyrinth', 'silhouette']
  };

  // What each difficulty means, in plain words, for the words and for the speed. The third line is
  // built from the difficulty config (WPM guide and starting lives).
  var DETAIL = {
    easy: ['WORDS: SHORT, MIDDLE-ROW LETTERS FIRST', 'SPEED: SLOW, WITH LOTS OF TIME PER WORD'],
    medium: ['WORDS: EVERYDAY WORDS, A LITTLE LONGER', 'SPEED: STEADY, WORDS COME MORE OFTEN'],
    hard: ['WORDS: LONG AND UNUSUAL WORDS', 'SPEED: FAST, WORDS COME QUICKLY']
  };

  var MASCOT = {
    easy: { sprite: 'en_dawdle', fps: 4, frames: 2 },
    medium: { sprite: 'en_hoppet', fps: 3, frames: 2 },
    hard: { sprite: 'en_truffle', fps: 12, frames: 4 }
  };

  var PREMISE = 'BARON VON BURROW HAS DUG UP THE MEADOW AND CARRIED OFF ITS WORDS. ' +
    'PIP THE SCRIBE SETS OUT TO SPELL THEM BACK.';

  // Shown on a touch screen until the first key arrives (TG.Main, DESIGN 2).
  var KEYBOARD_NOTE = 'SPELL RUNNER NEEDS A KEYBOARD.';

  var LOGO = ['SPELL', 'RUNNER'];
  var LOGO_LETTERS = 11;
  var LOGO_STEP = 0.1;            // one letter every 6 frames (DESIGN 12)
  var LOGO_ROWS = [GOLD, GOLD, GOLD, ORANGE, ORANGE, RED, RED, RED];
  var TITLE_SPEED = 48;           // px/s the title backdrop scrolls
  var IDLE_TIME = 12;             // s on the title menu before the idle rotation starts (Tier 2)
  var ROTATE_TIME = 8;            // s per panel of the idle rotation

  var MENU = [
    { id: 'start', label: 'START' },
    { id: 'how', label: 'HOW TO PLAY' },
    { id: 'scores', label: 'HIGH SCORES' },
    { id: 'options', label: 'OPTIONS' }
  ];

  // Settings shown on the Options panel. type: 'bool' or 'tri' ('auto' | 'on' | 'off').
  var OPTIONS = [
    { key: 'music', label: 'MUSIC', type: 'bool', help: ['THE CHIPTUNE MUSIC.'] },
    { key: 'sfx', label: 'SOUND EFFECTS', type: 'bool', help: ['KEY CLICKS, JUMPS AND OTHER SOUNDS.'] },
    { key: 'crt', label: 'CRT EFFECT', type: 'tri', help: ['LINES LIKE AN OLD TV SCREEN.', 'AUTO: ON WHEN THE GAME IS SHOWN LARGE.'] },
    { key: 'reduceFlash', label: 'REDUCE FLASH', type: 'bool', help: ['NO FLASHES AND NO SCREEN SHAKE.'] },
    { key: 'keyGuide', label: 'KEY GUIDE', type: 'tri', help: ['A SMALL KEYBOARD THAT LIGHTS THE NEXT KEY.', 'AUTO: ON FOR EASY ONLY.'] },
    { key: 'adaptive', label: 'ADAPTIVE PACE', type: 'bool', help: ['THE GAME SLOWS DOWN A LITTLE', 'IF WORDS KEEP REACHING PIP.'] },
    { id: 'reset', label: 'RESET SCORES', help: ['CLEARS THE HIGH SCORES AND BESTS.'] },
    { id: 'back', label: 'BACK', help: ['BACK TO THE MENU.'] }
  ];

  var PAUSE_ITEMS = [
    { id: 'resume', label: 'RESUME', help: ['BACK TO THE GAME AFTER 3-2-1.'] },
    { id: 'restart', label: 'RESTART FROM CHECKPOINT', help: ['BACK TO THE LAST FLAG.', 'COUNTS AS A CONTINUE.'] },
    { key: 'music', label: 'MUSIC', type: 'bool' },
    { key: 'sfx', label: 'SOUND EFFECTS', type: 'bool' },
    { key: 'crt', label: 'CRT EFFECT', type: 'tri' },
    { key: 'reduceFlash', label: 'REDUCE FLASH', type: 'bool' },
    { id: 'quit', label: 'QUIT', help: ['END THE RUN AND SEE YOUR RESULTS.'] }
  ];

  var POWERS = [
    { sprite: 'pw_shield', name: 'SHIELD', text: 'BLOCKS A HIT' },
    { sprite: 'pw_hourglass', name: 'HOURGLASS', text: 'SLOWS TIME' },
    { sprite: 'pw_quill', name: 'GOLDEN QUILL', text: '2X POINTS' },
    { sprite: 'pw_blast', name: 'INK BLAST', text: 'CLEARS WORDS' },
    { sprite: 'pw_cap', name: 'RED CAP', text: 'EXTRA LIFE' },
    { sprite: 'item_ink', name: 'INK DROPS', text: '100 = 1 LIFE' }
  ];

  // Keyboard rows for the How to Play picture, with the finger colour of each key (DESIGN 13.4:
  // little CORAL, ring GOLD, middle GRASS, index AQUA, mirrored per hand).
  var KEY_ROWS = ['qwertyuiop', 'asdfghjkl;', 'zxcvbnm'];
  var KEY_OFFSETS = [0, 3, 8];
  var FINGER = [CORAL, GOLD, GRASS, AQUA, AQUA, AQUA, AQUA, GRASS, GOLD, CORAL];
  var HOME = 'asdfjkl;';

  var RESULTS_LOCK = 0.5;         // s at the start of the results screen in which keys are ignored
  var ROW_TIME = 0.15;            // s per row of the results tally
  var COUNT_TIME = 0.3;           // s a number takes to count up
  var TICK_TIME = 0.05;           // s between tally ticks (every 3 frames, DESIGN 15.2)
  var STAMP_WAIT = 0.35;          // s between the last row and the rank stamp

  var RANK_COLOR = { S: GOLD, A: LIME, B: AQUA, C: SILVER };

  // Per-screen data, rebuilt on every screen change.
  var started = false;            // the first screen:change has arrived
  var current = null;             // the screen S belongs to
  var S = {};
  var clock = 0;                  // s, advances in update (animation clock)
  var screenT = 0;                // s on the current screen, advanced by update
  var subs = [];
  var warned = {};

  // Kept between screens.
  var titleCursor = 0;
  var chosenDifficulty = null;    // the difficulty last confirmed on the difficulty screen
  var pendingHighlight = null;    // { difficulty, pos }: the entry just added, shown on the title
  var recordedResult = null;      // the result passed to TG.Save.recordRun
  var focusLost = false;          // the window has no focus: the continue countdown waits (TG.Main)
  var keyboardHint = false;       // a touch screen with no keyboard seen yet (TG.Main)

  function num(v, d) {
    return typeof v === 'number' && isFinite(v) ? v : d;
  }

  function emit(name, payload) {
    if (TG.Events && typeof TG.Events.emit === 'function') TG.Events.emit(name, payload || {});
  }

  function report(key, err) {
    if (warned[key]) return;
    warned[key] = true;
    if (typeof console !== 'undefined' && console && console.error) console.error('TG.UI: ' + key + ' failed', err);
  }

  function gameState() {
    var g = TG.Game;
    return g && g.state ? g.state : null;
  }

  // Calls TG.Game[fn]. An exception is reported and the screen stays as it is.
  function callGame(fn, a, b) {
    var g = TG.Game;
    if (!g || typeof g[fn] !== 'function') return false;
    try {
      return g[fn](a, b);
    } catch (e) {
      report('TG.Game.' + fn, e);
      return false;
    }
  }

  function getSetting(key, fallback) {
    try {
      if (TG.Save && typeof TG.Save.getSetting === 'function') {
        var v = TG.Save.getSetting(key);
        return v === undefined || v === null ? fallback : v;
      }
    } catch (e) { /* the default is used */ }
    return fallback;
  }

  function setSetting(key, value) {
    if (TG.Save && typeof TG.Save.setSetting === 'function') TG.Save.setSetting(key, value);
  }

  function diffInfo(name) {
    var d = null;
    try {
      if (TG.Difficulty && typeof TG.Difficulty.get === 'function') d = TG.Difficulty.get(name);
    } catch (e) { d = null; }
    var f = FALLBACK_DIFF[name] || FALLBACK_DIFF.medium;
    return {
      label: d && typeof d.label === 'string' ? d.label : f.label,
      description: d && typeof d.description === 'string' ? d.description : f.description,
      wpmGuide: d && typeof d.wpmGuide === 'string' ? d.wpmGuide : f.wpmGuide,
      lives: d ? num(d.lives, f.lives) : f.lives
    };
  }

  function samplesFor(name) {
    var list = TG.Words && TG.Words.SAMPLES && TG.Words.SAMPLES[name];
    return Array.isArray(list) && list.length ? list.slice(0, 3) : FALLBACK_SAMPLES[name];
  }

  function sym(name, fallback) {
    return (TG.Font && TG.Font.SYM && TG.Font.SYM[name]) || fallback;
  }

  function pad(n, width) {
    if (TG.Util && typeof TG.Util.pad === 'function') return TG.Util.pad(n, width);
    var s = String(Math.max(0, Math.floor(n)));
    while (s.length < width) s = '0' + s;
    return s;
  }

  // Splits text into lines of at most `max` characters, at spaces.
  function wrap(text, max) {
    var words = String(text).split(' ');
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (line.length === 0) line = w;
      else if (line.length + 1 + w.length <= max) line += ' ' + w;
      else { lines.push(line); line = w; }
    }
    if (line.length) lines.push(line);
    return lines;
  }

  function formatTime(seconds) {
    var s = Math.max(0, Math.floor(num(seconds, 0)));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function today() {
    var d = new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function blink(period, on) {
    return (clock % period) < on;
  }

  // The TG.Input queue as actions (see the header).
  var KEY_ACTIONS = {
    up: 'up', down: 'down', left: 'left', right: 'right',
    enter: 'confirm', space: 'confirm', jump: 'confirm', duck: 'down',
    esc: 'back', backspace: 'backspace'
  };

  function readActions() {
    var events = (TG.Input && typeof TG.Input.drain === 'function') ? TG.Input.drain() : [];
    var out = [];
    if (!events || typeof events.length !== 'number') return out;
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (!e) continue;
      if (e.type === 'char' && typeof e.ch === 'string' && /^[a-z]$/.test(e.ch)) {
        out.push({ act: 'letter', ch: e.ch });
      } else if (e.type === 'down' && Object.prototype.hasOwnProperty.call(KEY_ACTIONS, e.key)) {
        out.push({ act: KEY_ACTIONS[e.key], key: e.key });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // 2. Drawing helpers
  // ---------------------------------------------------------------------------------------------

  function fill(ctx, x, y, w, h, c) {
    if (TG.Gfx && typeof TG.Gfx.rect === 'function') {
      TG.Gfx.rect(ctx, x, y, w, h, c);
      return;
    }
    var fw = Math.floor(w), fh = Math.floor(h);
    if (!(fw > 0 && fh > 0) || !TG.PAL) return;
    ctx.fillStyle = TG.PAL[c] || TG.PAL[INK];
    ctx.fillRect(Math.floor(x), Math.floor(y), fw, fh);
  }

  function outline(ctx, x, y, w, h, c) {
    if (TG.Gfx && typeof TG.Gfx.frame === 'function') {
      TG.Gfx.frame(ctx, x, y, w, h, c);
      return;
    }
    fill(ctx, x, y, w, 1, c);
    fill(ctx, x, y + h - 1, w, 1, c);
    fill(ctx, x, y + 1, 1, h - 2, c);
    fill(ctx, x + w - 1, y + 1, 1, h - 2, c);
  }

  function dither(ctx, x, y, w, h, c, phase) {
    if (TG.Gfx && typeof TG.Gfx.dither === 'function') TG.Gfx.dither(ctx, x, y, w, h, c, phase || 0);
  }

  function spr(ctx, name, frame, x, y, opts) {
    if (TG.Gfx && typeof TG.Gfx.draw === 'function') TG.Gfx.draw(ctx, name, frame, x, y, opts);
  }

  function hasSprite(name) {
    return !!(TG.Gfx && typeof TG.Gfx.has === 'function' && TG.Gfx.has(name));
  }

  // Text through TG.Font. opts: { scale, align, shadow, rowColors }.
  function txt(ctx, s, x, y, color, opts) {
    if (!TG.Font || typeof TG.Font.draw !== 'function') return;
    var o = opts || {};
    TG.Font.draw(ctx, s, x, y, {
      color: color === undefined ? WHITE : color,
      scale: o.scale || 1,
      align: o.align || 'left',
      shadow: !!o.shadow,
      rowColors: o.rowColors
    });
  }

  function centerText(ctx, s, y, color, scale, shadow) {
    txt(ctx, s, CX, y, color, { scale: scale || 1, align: 'center', shadow: !!shadow });
  }

  function textWidth(s, scale) {
    return String(s).length * 8 * (scale || 1);
  }

  // A panel: INK fill with a 1 px border.
  function panelBox(ctx, x, y, w, h, border) {
    fill(ctx, x, y, w, h, INK);
    outline(ctx, x, y, w, h, border === undefined ? SILVER : border);
  }

  // A word plate like the ones in play: INK, letters typed so far GOLD and raised 1 px, the next
  // letter underlined in AQUA (typed < 0: no underline, for words that are only shown). Returns the
  // plate's width.
  function plate(ctx, word, x, y, typed, border, dim) {
    var text = String(word).toUpperCase();
    var w = text.length * 8 + 4;
    fill(ctx, x, y, w, 12, INK);
    if (border !== null && border !== undefined) outline(ctx, x, y, w, 12, border);
    for (var i = 0; i < text.length; i++) {
      var done = i < typed;
      var color = dim ? STONE : (done ? GOLD : WHITE);
      txt(ctx, text.charAt(i), x + 2 + i * 8, y + (done ? 1 : 2), color);
      if (!dim && typed >= 0 && i === typed) fill(ctx, x + 2 + i * 8, y + 10, 7, 1, AQUA);
    }
    return w;
  }

  // A keycap of any width, drawn like the key_cap sprite (WHITE face, SILVER edge, STONE side, INK
  // outline). pressed: the face sits 2 px lower. The legend is centred on the face.
  function keycap(ctx, x, y, w, label, pressed, legend) {
    var t = pressed ? 2 : 0;
    fill(ctx, x + 1, y + t, w - 2, 1, INK);
    fill(ctx, x, y + t + 1, 1, pressed ? 11 : 13, INK);
    fill(ctx, x + w - 1, y + t + 1, 1, pressed ? 11 : 13, INK);
    fill(ctx, x + 1, y + t + 1, w - 3, 10, WHITE);
    fill(ctx, x + w - 2, y + t + 1, 1, 10, SILVER);
    fill(ctx, x + 1, y + t + 11, 1, 1, WHITE);
    fill(ctx, x + 2, y + t + 11, w - 3, 1, SILVER);
    if (!pressed) {
      fill(ctx, x + 1, y + 12, 1, 2, SILVER);
      fill(ctx, x + 2, y + 12, w - 3, 2, STONE);
    }
    fill(ctx, x + 1, y + 14, w - 2, 1, INK);
    if (label) txt(ctx, label, x + Math.floor((w + 1) / 2), y + t + 2, legend === undefined ? INK : legend, { align: 'center' });
  }

  function keycapWidth(label) {
    return String(label).length * 8 + 8;
  }

  // The selection bar of a menu row: SHADOW bar, blinking arrow, GOLD text.
  function menuRow(ctx, x, y, w, label, selected, value, valueColor) {
    if (selected) {
      fill(ctx, x, y - 3, w, 13, SHADOW);
      if (blink(0.6, 0.4)) txt(ctx, sym('RIGHT', '>'), x + 4, y, GOLD);
    }
    txt(ctx, label, x + 16, y, selected ? GOLD : WHITE);
    if (value !== undefined && value !== null) {
      txt(ctx, value, x + w - 6, y, valueColor === undefined ? (selected ? GOLD : SILVER) : valueColor, { align: 'right' });
    }
  }

  function footer(ctx, s, color) {
    fill(ctx, 0, SH - 13, SW, 13, INK);
    centerText(ctx, s, SH - 10, color === undefined ? SILVER : color);
  }

  // The Level 1 backdrop behind the title. TG.Render.drawBackdrop draws it when WP-F is present; the
  // private fallback below follows CONTRACT 6.5 for the day palette.
  function backdrop(ctx, camX, time) {
    var R = TG.Render;
    if (R && typeof R.drawBackdrop === 'function') {
      try {
        R.drawBackdrop(ctx, 'meadow', 'day', camX, time, 0);
        return;
      } catch (e) {
        report('TG.Render.drawBackdrop', e);
      }
    }
    fallbackBackdrop(ctx, camX, time);
  }

  function fallbackBackdrop(ctx, camX, time) {
    var bd = TG.Backdrops && TG.Backdrops.meadow;
    var pal = bd && bd.palettes && bd.palettes.day;
    if (!pal || !Array.isArray(pal.sky)) {
      fill(ctx, 0, 0, SW, GROUND, SKY);
      return;
    }
    for (var i = 0; i < pal.sky.length; i++) {
      var band = pal.sky[i];
      fill(ctx, 0, band.y, SW, band.h, band.color);
      if (typeof band.dither === 'number') dither(ctx, 0, band.y, SW, band.h, band.dither, 0);
    }
    var layers = Array.isArray(bd.layers) ? bd.layers : [];
    for (var l = 0; l < layers.length; l++) {
      var layer = layers[l];
      if (!layer || layer.front || !Array.isArray(layer.items)) continue;
      var repeat = Math.max(16, num(layer.repeat, SW));
      var off = Math.floor(camX * num(layer.factor, 0) + time * num(layer.drift, 0));
      for (var k = 0; k < layer.items.length; k++) {
        var item = layer.items[k];
        if (item.sections && item.sections.indexOf(0) === -1) continue;
        var info = TG.Gfx && TG.Gfx.info ? TG.Gfx.info(item.sprite) : null;
        var frame = info && info.fps > 0 && info.frames > 1 ? Math.floor(time * info.fps) % info.frames : 0;
        var base = ((item.x - off) % repeat + repeat) % repeat;
        for (var x = base - repeat; x < SW + repeat; x += repeat) {
          spr(ctx, item.sprite, frame, x, item.y, pal.remap ? { remap: pal.remap } : undefined);
        }
      }
    }
  }

  // Ground tiles (L5) under the title backdrop.
  function ground(ctx, camX) {
    var first = Math.floor(camX / 16);
    var tiles = hasSprite('tile_grass') && hasSprite('tile_soil');
    for (var i = 0; i <= Math.ceil(SW / 16) + 1; i++) {
      var col = first + i;
      var x = col * 16 - camX;
      if (tiles) {
        spr(ctx, 'tile_grass', col % 2, x, GROUND);
        spr(ctx, 'tile_soil', (col + 1) % 2, x, GROUND + 16);
      } else {
        fill(ctx, x, GROUND, 16, 4, GRASS);
        fill(ctx, x, GROUND + 4, 16, SH - GROUND - 4, SOIL);
      }
    }
  }

  // The Baron, composed from his parts (CONTRACT 6.4), for the story panel.
  function baron(ctx, bx, by, t) {
    spr(ctx, 'boss_body', Math.floor(t * 4) % 2, bx, by - 8);
    spr(ctx, 'boss_arm', 'rest', bx + 20, by - 26, { flipX: true });
    spr(ctx, 'boss_head', Math.floor(t) % 4 === 3 ? 'laugh' : 'normal', bx - 2, by - 34);
    spr(ctx, 'boss_arm', 'rest', bx - 20, by - 26);
    spr(ctx, 'boss_mound', 0, bx, by);
  }

  // ---------------------------------------------------------------------------------------------
  // 3. Screen set-up and the saving that follows from play
  // ---------------------------------------------------------------------------------------------

  function setup(to, from, data) {
    switch (to) {
      case 'boot': return {};
      case 'title': return setupTitle(from);
      case 'difficultySelect': return setupDifficulty(from);
      case 'howToPlay': return setupHow(data);
      case 'paused': return { cursor: 0, confirm: null, countdown: -1, lastN: null };
      case 'gameOver': return { lastN: null, ended: false, countT: 0 };
      case 'results': return setupResults();
      case 'highScoreEntry': return setupEntry();
      default: return {};
    }
  }

  function onScreenChange(p) {
    var to = p && typeof p.to === 'string' ? p.to : null;
    if (!to) return;
    started = true;
    enter(to, p.from === undefined ? null : p.from, p.data);
  }

  function enter(to, from, data) {
    current = to;
    screenT = 0;
    S = setup(to, from, data);
  }

  // Keeps S in step with TG.Game.state.screen, also when a screen change arrived without an event
  // (for example after TG.Events.clear() in a test).
  function sync(state) {
    var st = state || gameState();
    var screen = st && typeof st.screen === 'string' ? st.screen : current;
    if (screen && screen !== current) enter(screen, current, st ? st.screenData : null);
    return current;
  }

  function onCheckpoint(p) {
    if (!p || !(p.index >= 1)) return;
    if (getSetting('tutorialDone', false) !== true) setSetting('tutorialDone', true);
  }

  function applySetting(key, value) {
    if ((key === 'music' || key === 'sfx') && TG.Audio && typeof TG.Audio.setEnabled === 'function') {
      TG.Audio.setEnabled(key, !!value);
    }
  }

  // Changes a bool or tri setting by one step (dir: +1 or -1) and saves it.
  function changeSetting(item, dir) {
    var value;
    if (item.type === 'tri') {
      var order = ['auto', 'on', 'off'];
      var i = order.indexOf(getSetting(item.key, 'auto'));
      value = order[((i < 0 ? 0 : i) + (dir < 0 ? 2 : 1)) % 3];
    } else {
      value = !(getSetting(item.key, true) === true);
    }
    setSetting(item.key, value);
    applySetting(item.key, value);
    emit('ui:move');
  }

  function settingText(item) {
    var v = getSetting(item.key, item.type === 'tri' ? 'auto' : true);
    if (item.type === 'tri') return String(v).toUpperCase();
    return v === true ? 'ON' : 'OFF';
  }

  // Starts a run from the menus (CONTRACT 4.20).
  function startRun(difficulty) {
    var name = NAMES.indexOf(difficulty) !== -1 ? difficulty : getSetting('lastDifficulty', 'medium');
    setSetting('lastDifficulty', name);
    emit('ui:select');
    callGame('newRun', { difficulty: name, seed: (Date.now() >>> 0) });
  }

  // ---------------------------------------------------------------------------------------------
  // 4a. Boot
  // ---------------------------------------------------------------------------------------------

  function updateBoot(dt, acts) {
    if (acts.length > 0) callGame('setScreen', 'title');
  }

  function drawBoot(ctx) {
    fill(ctx, 0, 0, SW, SH, INK);
    centerText(ctx, 'SPELL RUNNER', 72, STONE, 2);
    if (blink(1.0, 0.65)) centerText(ctx, 'PRESS ANY KEY', 112, WHITE, 2);
    if (keyboardHint) centerText(ctx, KEYBOARD_NOTE, 146, GOLD);
    centerText(ctx, 'A TYPING ADVENTURE', 176, STONE);
  }

  // ---------------------------------------------------------------------------------------------
  // 4b. Title, with its menu, options, high score and story panels
  // ---------------------------------------------------------------------------------------------

  function setupTitle(from) {
    var animate = from === 'boot' || from === 'results' || from === 'highScoreEntry' || from === null;
    var t = {
      panel: 'menu', auto: false, rotT: 0, idleT: 0,
      stamped: animate ? 0 : LOGO_LETTERS, stampT: 0,
      opt: 0, confirmReset: false, resetT: 0, highlight: null
    };
    if (from === 'howToPlay') titleCursor = 1;
    else if (from !== 'difficultySelect' && from !== 'howToPlay') titleCursor = 0;
    if (pendingHighlight) {
      t.panel = 'scores';
      t.highlight = pendingHighlight;
      pendingHighlight = null;
      t.stamped = LOGO_LETTERS;
    }
    return t;
  }

  function updateTitle(dt, acts) {
    var t = S;
    if (t.stamped < LOGO_LETTERS) {
      t.stampT += dt;
      while (t.stamped < LOGO_LETTERS && t.stampT >= (t.stamped + 1) * LOGO_STEP) {
        emit('ui:letter', { index: t.stamped });
        t.stamped++;
      }
    }
    if (t.resetT > 0) t.resetT = Math.max(0, t.resetT - dt);
    if (acts.length === 0) {
      if (t.panel === 'menu') {
        t.idleT += dt;
        if (t.idleT >= IDLE_TIME) {
          t.panel = 'story';
          t.auto = true;
          t.rotT = 0;
        }
      } else if (t.auto) {
        t.rotT += dt;
        if (t.rotT >= ROTATE_TIME) {
          t.rotT = 0;
          t.panel = t.panel === 'story' ? 'scores' : 'story';
        }
      }
      return;
    }
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      t.idleT = 0;
      if (t.stamped < LOGO_LETTERS) {          // a key finishes the logo at once
        t.stamped = LOGO_LETTERS;
        continue;
      }
      if (t.auto) {                            // any key ends the idle rotation
        t.auto = false;
        t.panel = 'menu';
        continue;
      }
      if (t.panel === 'menu') {
        if (titleMenuKey(t, a)) return;
      } else if (t.panel === 'scores') {
        if (a.act === 'confirm' || a.act === 'back') {
          t.panel = 'menu';
          t.highlight = null;
          emit('ui:back');
        }
      } else if (t.panel === 'options') {
        optionsKey(t, a);
      } else {
        t.panel = 'menu';
      }
    }
  }

  // Returns true when the screen changed.
  function titleMenuKey(t, a) {
    if (a.act === 'up' || a.act === 'down') {
      titleCursor = (titleCursor + (a.act === 'up' ? MENU.length - 1 : 1)) % MENU.length;
      emit('ui:move');
      return false;
    }
    if (a.act !== 'confirm') return false;
    var id = MENU[titleCursor].id;
    emit('ui:select');
    if (id === 'start') {
      callGame('setScreen', 'difficultySelect');
      return true;
    }
    if (id === 'how') {
      callGame('setScreen', 'howToPlay', { origin: 'title' });
      return true;
    }
    if (id === 'scores') {
      t.panel = 'scores';
      t.highlight = null;
    } else if (id === 'options') {
      t.panel = 'options';
      t.opt = 0;
      t.confirmReset = false;
    }
    return false;
  }

  function optionsKey(t, a) {
    var item = OPTIONS[t.opt];
    if (a.act === 'back') {
      t.panel = 'menu';
      t.confirmReset = false;
      emit('ui:back');
      return;
    }
    if (a.act === 'up' || a.act === 'down') {
      t.opt = (t.opt + (a.act === 'up' ? OPTIONS.length - 1 : 1)) % OPTIONS.length;
      t.confirmReset = false;
      emit('ui:move');
      return;
    }
    if (a.act !== 'confirm' && a.act !== 'left' && a.act !== 'right') return;
    if (item.key) {
      changeSetting(item, a.act === 'left' ? -1 : 1);
    } else if (item.id === 'reset' && a.act === 'confirm') {
      if (t.confirmReset) {
        if (TG.Save && typeof TG.Save.resetScores === 'function') TG.Save.resetScores();
        t.confirmReset = false;
        t.resetT = 2;
        emit('ui:select');
      } else {
        t.confirmReset = true;
        emit('ui:move');
      }
    } else if (item.id === 'back' && a.act === 'confirm') {
      t.panel = 'menu';
      emit('ui:back');
    }
  }

  function drawTitle(ctx) {
    var t = S;
    var camX = Math.floor(clock * TITLE_SPEED);
    backdrop(ctx, camX, clock);
    ground(ctx, camX);
    if (t.panel === 'menu') spr(ctx, 'hero_run', Math.floor(clock * 12) % 6, 60, GROUND);
    if (t.panel === 'scores') drawScores(ctx, t);
    else if (t.panel === 'options') drawOptions(ctx, t);
    else if (t.panel === 'story') drawStory(ctx);
    else drawMenu(ctx, t);
  }

  function drawLogo(ctx, t) {
    var k = 0;
    for (var line = 0; line < LOGO.length; line++) {
      var word = LOGO[line];
      var x0 = CX - word.length * 16;
      var y = line === 0 ? 12 : 48;
      for (var i = 0; i < word.length; i++, k++) {
        if (k >= t.stamped) return;
        var x = x0 + i * 32;
        var ch = word.charAt(i);
        txt(ctx, ch, x + 3, y + 3, INK, { scale: 4 });
        var fresh = t.stamped < LOGO_LETTERS && t.stampT - (k + 1) * LOGO_STEP < 0.034;
        if (fresh) txt(ctx, ch, x, y, WHITE, { scale: 4 });
        else txt(ctx, ch, x, y, GOLD, { scale: 4, rowColors: LOGO_ROWS });
      }
    }
  }

  function drawMenu(ctx, t) {
    drawLogo(ctx, t);
    if (t.stamped < LOGO_LETTERS) return;
    var x = 120, y = 96, w = 144, h = 66;
    panelBox(ctx, x, y, w, h, SILVER);
    for (var i = 0; i < MENU.length; i++) {
      menuRow(ctx, x + 4, y + 9 + i * 14, w - 8, MENU[i].label, i === titleCursor);
    }
    if (keyboardHint) footer(ctx, KEYBOARD_NOTE, GOLD);
    else footer(ctx, 'UP AND DOWN TO CHOOSE, ENTER TO SELECT');
  }

  function drawScores(ctx, t) {
    panelBox(ctx, 8, 6, SW - 16, SH - 12, SILVER);
    centerText(ctx, 'HIGH SCORES', 14, GOLD, 2);
    for (var d = 0; d < NAMES.length; d++) {
      var name = NAMES[d];
      var cx = 8 + 4 + d * 120 + 60;
      txt(ctx, diffInfo(name).label, cx, 38, d === 0 ? GRASS : (d === 1 ? GOLD : CORAL), { align: 'center' });
      var list = [];
      try {
        if (TG.Save && typeof TG.Save.scores === 'function') list = TG.Save.scores(name) || [];
      } catch (e) { list = []; }
      for (var i = 0; i < list.length && i < 5; i++) {
        var e = list[i];
        var y = 54 + i * 26;
        var lit = t.highlight && t.highlight.difficulty === name && t.highlight.pos === i;
        var line1 = (i + 1) + ' ' + String(e.name || '???') + ' ' + pad(num(e.score, 0), 7);
        var line2 = num(e.wpm, 0) + ' WPM ' + num(e.accuracy, 0) + '% ' + String(e.rank || 'C');
        if (!lit || blink(0.5, 0.35)) txt(ctx, line1, cx, y, lit ? GOLD : WHITE, { align: 'center' });
        txt(ctx, line2, cx, y + 10, lit ? GOLD : STONE, { align: 'center' });
      }
    }
    centerText(ctx, t.auto ? 'PRESS ANY KEY' : 'ENTER OR ESC: BACK', SH - 20, STONE);
  }

  function drawOptions(ctx, t) {
    var x = 32, y = 8, w = SW - 64, h = SH - 16;
    panelBox(ctx, x, y, w, h, SILVER);
    centerText(ctx, 'OPTIONS', y + 8, GOLD, 2);
    for (var i = 0; i < OPTIONS.length; i++) {
      var item = OPTIONS[i];
      var value = item.key ? settingText(item) : null;
      var valueColor;
      if (item.id === 'reset' && t.resetT > 0) { value = 'DONE'; valueColor = GRASS; }
      menuRow(ctx, x + 8, y + 36 + i * 13, w - 16, item.label, i === t.opt, value, valueColor);
    }
    var help = OPTIONS[t.opt].help || [];
    if (OPTIONS[t.opt].id === 'reset' && t.confirmReset) help = ['PRESS ENTER AGAIN TO CLEAR THE SCORES.', 'ESC OR UP/DOWN TO KEEP THEM.'];
    for (var k = 0; k < help.length; k++) centerText(ctx, help[k], y + 148 + k * 10, t.confirmReset ? CORAL : SILVER);
    centerText(ctx, 'EASY WORDS ASSUME A QWERTY KEYBOARD', y + 172, STONE);
    centerText(ctx, 'ENTER OR ARROWS: CHANGE   ESC: BACK', y + 186, STONE);
  }

  function drawStory(ctx) {
    var x = 24, y = 26, w = SW - 48, h = 150;
    panelBox(ctx, x, y, w, h, SILVER);
    var lines = wrap(PREMISE, 34);
    for (var i = 0; i < lines.length; i++) centerText(ctx, lines[i], y + 14 + i * 12, WHITE);
    spr(ctx, 'hero_idle', Math.floor(clock * 2) % 2, 120, y + h - 8, { scale: 2 });
    baron(ctx, 272, y + h - 8, clock);
    if (keyboardHint) footer(ctx, KEYBOARD_NOTE, GOLD);
    else footer(ctx, 'PRESS ANY KEY', blink(1, 0.65) ? WHITE : STONE);
  }

  // ---------------------------------------------------------------------------------------------
  // 4c. Difficulty select
  // ---------------------------------------------------------------------------------------------

  function setupDifficulty(from) {
    var last = from === 'howToPlay' && chosenDifficulty ? chosenDifficulty : getSetting('lastDifficulty', 'medium');
    var i = NAMES.indexOf(last);
    return { cursor: i < 0 ? 1 : i, typed: '' };
  }

  function chooseDifficulty(i) {
    chosenDifficulty = NAMES[i];
    emit('ui:select');
    callGame('setScreen', 'howToPlay', { origin: 'start', difficulty: NAMES[i] });
  }

  function updateDifficulty(dt, acts) {
    var d = S;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (a.act === 'left' || a.act === 'right' || a.act === 'up' || a.act === 'down') {
        var dir = (a.act === 'left' || a.act === 'up') ? -1 : 1;
        var next = Math.max(0, Math.min(NAMES.length - 1, d.cursor + dir));
        if (next !== d.cursor) {
          d.cursor = next;
          emit('ui:move');
        }
        d.typed = '';
      } else if (a.act === 'confirm') {
        chooseDifficulty(d.cursor);
        return;
      } else if (a.act === 'back') {
        emit('ui:back');
        callGame('setScreen', 'title');
        return;
      } else if (a.act === 'letter') {
        // Typing a name selects it; the full name confirms it (DESIGN 12). Only the end of what was
        // typed that starts one of the names is kept.
        var typed = d.typed + a.ch;
        while (typed.length > 0 && !startsName(typed)) typed = typed.slice(1);
        d.typed = typed;
        if (typed.length === 0) continue;
        var k = nameIndex(typed);
        if (k !== d.cursor) d.cursor = k;
        emit('ui:letter', { index: typed.length - 1 });
        if (NAMES[k] === typed) {
          chooseDifficulty(k);
          return;
        }
      }
    }
  }

  function startsName(typed) {
    return nameIndex(typed) !== -1;
  }

  function nameIndex(typed) {
    for (var i = 0; i < NAMES.length; i++) if (NAMES[i].indexOf(typed) === 0) return i;
    return -1;
  }

  function drawDifficulty(ctx) {
    var d = S;
    fill(ctx, 0, 0, SW, SH, INK);
    centerText(ctx, 'CHOOSE A DIFFICULTY', 6, WHITE, 2);
    for (var i = 0; i < NAMES.length; i++) drawDiffPanel(ctx, i, i === d.cursor);
    var name = NAMES[d.cursor];
    var info = diffInfo(name);
    var lines = DETAIL[name].concat(['FOR ' + info.wpmGuide + ' WORDS A MINUTE. ' + info.lives + ' LIVES.']);
    for (var k = 0; k < lines.length; k++) centerText(ctx, lines[k], 158 + k * 12, k === 2 ? GOLD : WHITE);
    footer(ctx, 'ARROWS AND ENTER, OR TYPE THE NAME', STONE);
  }

  function drawDiffPanel(ctx, i, selected) {
    var name = NAMES[i];
    var info = diffInfo(name);
    var w = 112, h = 120;
    var x = 12 + i * 124;
    var y = 28 - (selected ? Math.floor(Math.abs(Math.sin(clock * 5)) * 3) : 0);
    fill(ctx, x, y, w, h, selected ? DEEP_BLUE : SHADOW);
    outline(ctx, x, y, w, h, selected ? GOLD : STONE);
    if (selected) outline(ctx, x + 1, y + 1, w - 2, h - 2, GOLD);
    var cx = x + w / 2;

    // Label; letters typed so far are GOLD.
    var label = info.label;
    var typed = selected ? S.typed.length : 0;
    var lx = Math.floor(cx) - label.length * 8;
    for (var c = 0; c < label.length; c++) {
      var color = !selected ? STONE : (c < typed ? GOLD : WHITE);
      txt(ctx, label.charAt(c), lx + c * 16, y + 5, color, { scale: 2, shadow: selected });
    }

    // Mascot on a strip of grass.
    var m = MASCOT[name];
    var frame = selected ? Math.floor(clock * m.fps) % m.frames : 0;
    var hop = (selected && name === 'medium' && frame === 1) ? 3 : 0;
    fill(ctx, x + 16, y + 57, w - 32, 2, selected ? GRASS : STONE);
    spr(ctx, m.sprite, name === 'medium' ? (hop ? 'leap' : 'sit') : frame, Math.floor(cx), y + 57 - hop,
      { scale: 2, remap: selected ? undefined : 'dim' });

    txt(ctx, info.wpmGuide + ' WPM', cx, y + 62, selected ? GOLD : STONE, { align: 'center' });

    // Three sample words on plates.
    var samples = samplesFor(name);
    for (var s = 0; s < samples.length; s++) {
      var word = String(samples[s]);
      var pw = word.length * 8 + 4;
      plate(ctx, word, Math.floor(cx - pw / 2), y + 72 + s * 13, -1, selected ? STONE : null, !selected);
    }

    // Starting lives as hearts.
    var hearts = '';
    for (var l = 0; l < info.lives; l++) hearts += sym('HEART', '@');
    txt(ctx, hearts, cx, y + 111, selected ? RED : STONE, { align: 'center' });
  }

  // ---------------------------------------------------------------------------------------------
  // 4d. How to play
  // ---------------------------------------------------------------------------------------------

  function setupHow(data) {
    var origin = data && data.origin === 'start' ? 'start' : 'title';
    var difficulty = data && NAMES.indexOf(data.difficulty) !== -1 ? data.difficulty : null;
    if (origin === 'start' && !difficulty) difficulty = getSetting('lastDifficulty', 'medium');
    return { origin: origin, difficulty: difficulty, progress: 0, nudgeT: 0, missT: 0 };
  }

  function updateHow(dt, acts) {
    var h = S;
    if (h.nudgeT > 0) h.nudgeT = Math.max(0, h.nudgeT - dt);
    if (h.missT > 0) h.missT = Math.max(0, h.missT - dt);
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (a.act === 'back') {
        emit('ui:back');
        callGame('setScreen', h.origin === 'start' ? 'difficultySelect' : 'title');
        return;
      }
      if (h.origin === 'title') {
        if (a.act === 'confirm') {
          emit('ui:back');
          callGame('setScreen', 'title');
          return;
        }
        continue;
      }
      if (a.act === 'confirm') {
        h.nudgeT = 0.8;                         // the READY plate blinks: this is what to do
        continue;
      }
      if (a.act !== 'letter') continue;
      var target = 'ready';
      if (a.ch === target.charAt(h.progress)) {
        h.progress++;
        emit('ui:letter', { index: h.progress - 1 });
        if (h.progress === target.length) {
          startRun(h.difficulty);
          return;
        }
      } else {
        h.progress = a.ch === target.charAt(0) ? 1 : 0;
        if (h.progress === 1) emit('ui:letter', { index: 0 });
        else h.missT = 0.3;
      }
    }
  }

  function drawHow(ctx) {
    var h = S;
    fill(ctx, 0, 0, SW, SH, INK);
    centerText(ctx, 'HOW TO PLAY', 5, GOLD, 2);
    if (h.origin === 'start' && h.difficulty) {
      txt(ctx, diffInfo(h.difficulty).label, SW - 6, 9, SILVER, { align: 'right' });
    }
    fill(ctx, 126, 26, 1, 164, SHADOW);
    fill(ctx, 257, 26, 1, 164, SHADOW);
    drawHowType(ctx, 4);
    drawHowMove(ctx, 132);
    drawHowPowers(ctx, 262);
    drawHowBottom(ctx, h);
  }

  // Column 1: typing. A Dawdle with CAT lighting up, and the home row.
  function drawHowType(ctx, x0) {
    var cx = x0 + 60;
    txt(ctx, 'TYPE', cx, 28, GOLD, { align: 'center' });
    var cycle = screenT % 2.8;                  // starts when the screen opens: the snail is seen first
    var typed = cycle < 0.5 ? 0 : (cycle < 0.9 ? 1 : (cycle < 1.3 ? 2 : 3));
    var dawdleX = cx + 22;
    var base = 70;
    spr(ctx, 'hero_run', Math.floor(clock * 12) % 6, x0 + 18, base);
    if (typed > 0 && typed < 3) spr(ctx, 'hero_cast', 0, x0 + 18, base);
    if (typed < 3) {
      var flash = typed > 0 && (cycle - (0.1 + 0.4 * typed)) < 0.034;
      spr(ctx, 'en_dawdle', Math.floor(clock * 4) % 2, dawdleX, base, flash ? { remap: 'white' } : undefined);
      var pw = 3 * 8 + 4;
      plate(ctx, 'cat', dawdleX - Math.floor(pw / 2), 38, typed, typed > 0 ? GOLD : null, false);
    } else if (cycle < 2.2) {
      // The word is complete: the shell spins up and away, leaving a star.
      var k = cycle - 1.3;
      spr(ctx, 'en_dawdle', 'shell', dawdleX + Math.floor(k * 16), base - Math.floor(k * 30), Math.floor(clock * 16) % 2 ? { flipX: true } : undefined);
      spr(ctx, 'fx_star', Math.floor(clock * 8) % 2, dawdleX - 8, base - 12 - Math.floor(k * 10));
    }
    fill(ctx, x0 + 2, base, 116, 1, FOREST);
    var lines = ['TYPE THE WORD', 'ON A CREATURE', 'TO CLEAR IT.', 'THERE IS NO', 'NEED FOR ENTER.'];
    for (var i = 0; i < lines.length; i++) txt(ctx, lines[i], cx, 76 + i * 10, WHITE, { align: 'center' });
    txt(ctx, 'FINGERS REST', cx, 130, SILVER, { align: 'center' });
    txt(ctx, 'ON THESE KEYS:', cx, 140, SILVER, { align: 'center' });
    drawKeyboard(ctx, x0 + 4, 153, typed > 0 && typed < 3 ? 'cat'.charAt(typed - 1) : null);
  }

  function drawKeyboard(ctx, x, y, lit) {
    for (var r = 0; r < KEY_ROWS.length; r++) {
      var row = KEY_ROWS[r];
      for (var i = 0; i < row.length; i++) {
        var ch = row.charAt(i);
        var kx = x + KEY_OFFSETS[r] + i * 11;
        var ky = y + r * 11;
        var home = HOME.indexOf(ch) !== -1;
        var face = home ? FINGER[i] : SHADOW;
        if (ch === lit) face = WHITE;
        // Keys are 10 x 10 squares 1 px apart; the INK background shows between them.
        fill(ctx, kx, ky, 10, 10, face);
        txt(ctx, ch, kx + 2, ky + 2, home || ch === lit ? INK : SILVER);
      }
    }
  }

  // Column 2: jump, duck (held for the arch, DESIGN 5), let go of a word (DESIGN 3.3), pause.
  function drawHowMove(ctx, x0) {
    var cx = x0 + 62;
    txt(ctx, 'JUMP AND DUCK', cx, 28, GOLD, { align: 'center' });
    var press = Math.floor(clock * 2) % 4;
    keycap(ctx, x0 + 2, 40, keycapWidth('SPACE'), 'SPACE', press === 0);
    txt(ctx, 'JUMP', x0 + 56, 45, WHITE);
    txt(ctx, 'OVER GAPS AND', x0 + 2, 58, SILVER);
    txt(ctx, 'BRAMBLES', x0 + 2, 67, SILVER);
    keycap(ctx, x0 + 2, 80, keycapWidth('ENTER'), 'ENTER', press === 2);
    txt(ctx, 'DUCK', x0 + 56, 85, WHITE);
    txt(ctx, 'UNDER BRANCHES.', x0 + 2, 98, SILVER);
    txt(ctx, 'HOLD FOR ARCHES', x0 + 2, 107, SILVER);
    keycap(ctx, x0 + 2, 119, keycapWidth('BACKSPACE'), 'BACKSPACE', false);
    txt(ctx, 'LETS GO OF A', x0 + 2, 136, SILVER);
    txt(ctx, 'WORD. MISTAKES', x0 + 2, 145, SILVER);
    txt(ctx, 'NEED NO FIXING.', x0 + 2, 154, SILVER);
    keycap(ctx, x0 + 2, 165, keycapWidth('ESC'), 'ESC', false);
    txt(ctx, 'PAUSE', x0 + 40, 170, WHITE);
    txt(ctx, 'OR USE ARROWS', x0 + 2, 183, STONE);
  }

  // Column 3: power-ups.
  function drawHowPowers(ctx, x0) {
    var cx = x0 + 59;
    txt(ctx, 'POWER-UPS', cx, 28, GOLD, { align: 'center' });
    txt(ctx, 'TYPE THE WORD', cx, 40, SILVER, { align: 'center' });
    txt(ctx, 'ON A CRATE:', cx, 49, SILVER, { align: 'center' });
    for (var i = 0; i < POWERS.length; i++) {
      var p = POWERS[i];
      var y = 62 + i * 21;
      var small = p.sprite === 'item_ink';
      spr(ctx, p.sprite, Math.floor(clock * 4) % 2, x0 + 8, y + (small ? 12 : 16));
      txt(ctx, p.name, x0 + 20, y, GOLD);
      txt(ctx, p.text, x0 + 20, y + 9, WHITE);
    }
  }

  function drawHowBottom(ctx, h) {
    fill(ctx, 0, 192, SW, SH - 192, INK);
    fill(ctx, 0, 192, SW, 1, SHADOW);
    if (keyboardHint) {
      // Only READY starts the run, and a touch screen without a keyboard cannot type it.
      centerText(ctx, KEYBOARD_NOTE, 196, GOLD);
      centerText(ctx, h.origin === 'start' ? 'CONNECT ONE, THEN TYPE READY.' : 'ENTER OR ESC: BACK', 206, SILVER);
      return;
    }
    if (h.origin !== 'start') {
      centerText(ctx, 'ENTER OR ESC: BACK', 201, SILVER);
      return;
    }
    var pw = 5 * 8 + 4;
    var total = textWidth('TYPE ') + pw + textWidth(' TO START');
    var x = Math.floor(CX - total / 2);
    var y = 199;
    txt(ctx, 'TYPE', x, y + 2, WHITE);
    var border = h.progress > 0 ? GOLD : SILVER;
    if (h.nudgeT > 0) border = blink(0.2, 0.1) ? GOLD : RED;
    if (h.missT > 0) border = RED;
    plate(ctx, 'ready', x + textWidth('TYPE '), y, h.progress, border, false);
    txt(ctx, 'TO START', x + textWidth('TYPE ') + pw + 8, y + 2, WHITE);
    txt(ctx, 'ESC: BACK', 4, 203, STONE);
  }

  // ---------------------------------------------------------------------------------------------
  // 4e. Paused (menu and resume countdown)
  // ---------------------------------------------------------------------------------------------

  function resumeStep() {
    return num(TG.C && TG.C.RESUME_STEP, 0.5);
  }

  function startCountdown(p) {
    p.countdown = 0;
    p.confirm = null;
    p.lastN = 3;
    emit('ui:count', { n: 3, high: false });
  }

  function updatePaused(dt, acts) {
    var p = S;
    var step = resumeStep();
    if (p.countdown >= 0) {
      for (var j = 0; j < acts.length; j++) {
        if (acts[j].act === 'back') {           // Esc during the countdown returns to the menu
          p.countdown = -1;
          p.lastN = null;
          emit('ui:back');
          return;
        }
      }
      p.countdown += dt;
      if (p.countdown + 1e-9 >= 3 * step) {
        p.countdown = -1;
        callGame('resume');
        return;
      }
      var n = 3 - Math.floor((p.countdown + 1e-9) / step);
      if (n !== p.lastN) {
        p.lastN = n;
        emit('ui:count', { n: n, high: false });
      }
      return;
    }
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      var item = PAUSE_ITEMS[p.cursor];
      if (a.act === 'up' || a.act === 'down') {
        p.cursor = (p.cursor + (a.act === 'up' ? PAUSE_ITEMS.length - 1 : 1)) % PAUSE_ITEMS.length;
        p.confirm = null;
        emit('ui:move');
      } else if (a.act === 'back') {
        if (p.confirm) {
          p.confirm = null;
          emit('ui:back');
        } else {
          startCountdown(p);
          return;
        }
      } else if ((a.act === 'left' || a.act === 'right') && item.key) {
        changeSetting(item, a.act === 'left' ? -1 : 1);
      } else if (a.act === 'confirm') {
        if (item.key) {
          changeSetting(item, 1);
        } else if (item.id === 'resume') {
          emit('ui:select');
          startCountdown(p);
          return;
        } else if (item.id === 'restart' || item.id === 'quit') {
          if (p.confirm === item.id) {
            p.confirm = null;
            emit('ui:select');
            callGame(item.id === 'restart' ? 'continueRun' : 'endRun');
            return;
          }
          p.confirm = item.id;
          emit('ui:move');
        }
      }
    }
  }

  // The frozen picture of play under an INK dither (DESIGN 12). The top bar and the progress strip (y 0
  // to 22), or in the arena the boss bar (to y 30), stay clear, so score, lives and WPM can be read.
  function ditherPlay(ctx) {
    var st = gameState();
    var top = st && st.boss ? 31 : 23;
    dither(ctx, 0, top, SW, SH - top, INK, 0);
  }

  function drawPaused(ctx) {
    var p = S;
    ditherPlay(ctx);
    if (p.countdown >= 0) {
      var n = Math.max(1, 3 - Math.floor((p.countdown + 1e-9) / resumeStep()));
      panelBox(ctx, CX - 44, 64, 88, 72, GOLD);
      centerText(ctx, 'GET READY', 72, WHITE);
      txt(ctx, String(n), CX + 2, 90, GOLD, { scale: 4, align: 'center', shadow: true });
      return;
    }
    var x = 64, y = 36, w = SW - 128, h = 148;
    panelBox(ctx, x, y, w, h, SILVER);
    centerText(ctx, 'PAUSED', y + 8, GOLD, 2);
    for (var i = 0; i < PAUSE_ITEMS.length; i++) {
      var item = PAUSE_ITEMS[i];
      menuRow(ctx, x + 6, y + 34 + i * 13, w - 12, item.label, i === p.cursor, item.key ? settingText(item) : null);
    }
    var help;
    var item2 = PAUSE_ITEMS[p.cursor];
    if (p.confirm === 'restart') help = ['PRESS ENTER AGAIN TO RESTART', 'AT THE LAST FLAG.'];
    else if (p.confirm === 'quit') help = ['PRESS ENTER AGAIN TO END THE RUN.'];
    else help = item2.help || ['LEFT/RIGHT OR ENTER TO CHANGE.'];
    for (var k = 0; k < help.length; k++) centerText(ctx, help[k], y + 126 + k * 10, p.confirm ? CORAL : SILVER);
    footer(ctx, 'ESC: RESUME', STONE);
  }

  // ---------------------------------------------------------------------------------------------
  // 4f. Game over (continue countdown)
  // ---------------------------------------------------------------------------------------------

  // The countdown runs on its own clock (countT), which stands still while the window has no focus, so
  // the run does not end while the player is in another window (DESIGN 2).
  function updateGameOver(dt, acts) {
    var g = S;
    if (acts.length) focusLost = false;          // a key arrives only when the page has the focus
    if (g.ended || focusLost) return;
    g.countT += dt;
    var C = TG.C || {};
    var count = num(C.CONTINUE_COUNT, 9);
    var lock = num(C.CONTINUE_LOCKOUT, 0.8);
    if (g.countT + 1e-9 >= count) {
      g.ended = callGame('endRun') !== false;   // a refused call is tried again on the next step
      return;
    }
    var n = count - Math.floor(g.countT + 1e-9);
    if (n !== g.lastN) {
      g.lastN = n;
      emit('ui:count', { n: n, high: n <= 3 });
    }
    if (g.countT + 1e-9 < lock) return;          // keys are ignored for the first CONTINUE_LOCKOUT s
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (a.act === 'confirm') {
        emit('ui:select');
        g.ended = callGame('continueRun') !== false;
        return;
      }
      if (a.act === 'back') {
        emit('ui:back');
        g.ended = callGame('endRun') !== false;
        return;
      }
    }
  }

  function drawGameOver(ctx) {
    var C = TG.C || {};
    var count = num(C.CONTINUE_COUNT, 9);
    var lock = num(C.CONTINUE_LOCKOUT, 0.8);
    var countT = num(S.countT, screenT);
    ditherPlay(ctx);
    // "GAME OVER" letters drop in one by one.
    var word = 'GAME OVER';
    var x0 = CX - word.length * 16;
    for (var i = 0; i < word.length; i++) {
      var ch = word.charAt(i);
      if (ch === ' ') continue;
      var start = i * 0.08;
      if (screenT < start) break;
      var k = Math.min(1, (screenT - start) / 0.3);
      var y = Math.floor(-32 + (40 + 32) * k * k);
      txt(ctx, ch, x0 + i * 32 + 3, y + 3, INK, { scale: 4 });
      txt(ctx, ch, x0 + i * 32, y, RED, { scale: 4, rowColors: [CORAL, CORAL, RED, RED, RED, RED, RED, RED] });
    }
    var n = Math.max(0, count - Math.floor(countT + 1e-9));
    var total = textWidth('CONTINUE?', 2) + 8 + 32;
    var cx = Math.floor(CX - total / 2);
    // The panel ends above the ground line, so that Pip is seen sitting down under it.
    panelBox(ctx, 72, 80, SW - 144, 78, SILVER);
    txt(ctx, 'CONTINUE?', cx, 100, WHITE, { scale: 2 });
    if (n > 3 || blink(0.5, 0.35)) txt(ctx, String(n), cx + textWidth('CONTINUE?', 2) + 8, 86, n <= 3 ? RED : GOLD, { scale: 4, shadow: true });
    var ready = countT >= lock;
    centerText(ctx, 'ENTER OR SPACE: CONTINUE', 122, ready ? WHITE : STONE);
    centerText(ctx, 'ESC: END THE RUN', 133, ready ? SILVER : STONE);
    fill(ctx, 84, 144, SW - 168, 1, SHADOW);
    centerText(ctx, 'YOU RESTART AT THE LAST FLAG', 148, STONE);
  }

  // ---------------------------------------------------------------------------------------------
  // 4g. Results (tally and rank)
  // ---------------------------------------------------------------------------------------------

  function setupResults() {
    var st = gameState();
    var res = st && st.result && typeof st.result === 'object' ? st.result : null;
    // TG.Save.recordRun once per result (CONTRACT 4.20 and 9.2).
    if (res && res !== recordedResult) {
      recordedResult = res;
      try {
        if (TG.Save && typeof TG.Save.recordRun === 'function') TG.Save.recordRun(res);
      } catch (e) {
        report('TG.Save.recordRun', e);
      }
    }
    return {
      result: res, pages: buildPages(res), page: 0, row: 0, rowT: 0, tickT: 0,
      pageDone: false, stamped: false, waitT: 0, stampT: 0, leaving: false
    };
  }

  // A row: { label, value (number), format(value) -> string, count, color, note, noteColor, keys }, or
  // { label, text, textColor } for a value that is shown as it is.
  function buildPages(res) {
    var r = res || {};
    var t = r.typing && typeof r.typing === 'object' ? r.typing : {};
    var p1 = [], p2 = [];
    var plain = function (v) { return String(Math.floor(v)); };
    var plus = function (v) { return '+' + Math.floor(v); };
    var pct = function (v) { return Math.floor(v) + '%'; };
    var bonuses = Array.isArray(r.bonuses) ? r.bonuses : [];
    var score = num(r.score, 0);
    var base = num(r.baseScore, score);

    p1.push({ label: 'SCORE', value: base, format: plain, count: true });
    for (var i = 0; i < bonuses.length; i++) {
      var b = bonuses[i] || {};
      p1.push({ label: String(b.label || 'BONUS'), value: num(b.points, 0), format: plus, count: true, color: GOLD, indent: 8 });
    }
    if (bonuses.length) p1.push({ label: 'TOTAL', value: score, format: plain, count: true, color: GOLD, valueColor: GOLD });

    var wpm = Math.round(num(t.wpm, 0));
    var best = Math.round(num(r.bestWpm, 0));
    var note = null, noteColor = STONE;
    if (wpm > 0 && best > 0 && wpm > best) { note = 'NEW BEST! +' + (wpm - best); noteColor = GOLD; }
    else if (best > 0) note = 'BEST ' + best;
    else if (wpm > 0) { note = 'NEW BEST!'; noteColor = GOLD; }
    p1.push({ label: 'WPM', value: wpm, format: plain, count: true, note: note, noteColor: noteColor });
    // A run with no letter key pressed has no accuracy and no keys to practise; 100% and a green NONE
    // would read as praise (the HUD shows ---% in that case too).
    var noKeys = typeof t.correct === 'number' && typeof t.wrong === 'number' && t.correct + t.wrong === 0;
    if (noKeys) p1.push({ label: 'ACCURACY', text: '---' });
    else p1.push({ label: 'ACCURACY', value: Math.floor(num(t.accuracy, 1) * 100 + 1e-9), format: pct, count: true });
    var bestRun = Math.floor(num(t.bestCleanRun, 0));
    p1.push({ label: 'BEST STREAK', value: bestRun, format: function (v) { return Math.floor(v) + (bestRun === 1 ? ' WORD' : ' WORDS'); }, count: true });
    if (noKeys) p1.push({ label: 'KEYS TO PRACTISE', text: '---', textColor: SILVER });
    else p1.push({ label: 'KEYS TO PRACTISE', keys: Array.isArray(t.practiseKeys) ? t.practiseKeys.slice(0, 3) : [] });

    p2.push({ label: 'PEAK WPM', value: Math.round(num(t.peakWpm, 0)), format: plain });
    var cleared = Math.floor(num(t.wordsCleared, 0)), missed = Math.floor(num(t.wordsMissed, 0));
    p2.push({ label: 'WORDS', text: cleared + ' CLEARED, ' + missed + ' MISSED' });
    p2.push({ label: 'BEST KEY STREAK', value: Math.floor(num(t.bestKeyStreak, 0)), format: plain });
    if (num(t.avgReaction, 0) > 0) p2.push({ label: 'AVERAGE REACTION', text: num(t.avgReaction, 0).toFixed(2) + ' S' });
    if (Array.isArray(t.slowKeys) && t.slowKeys.length) p2.push({ label: 'SLOWEST KEYS', keys: t.slowKeys.slice(0, 3) });
    p2.push({ label: 'INK DROPS', value: Math.floor(num(r.ink, 0)), format: plain });
    p2.push({ label: 'TIME', text: formatTime(r.time) });
    p2.push({ label: 'LIVES LOST', value: Math.floor(num(r.livesLost, 0)), format: plain });
    p2.push({ label: 'CONTINUES USED', value: Math.floor(num(r.continues, 0)), format: plain });
    return [p1, p2];
  }

  function rowCounts(row) {
    return !!(row && row.count && row.value > 0);
  }

  function stamp(r) {
    if (r.stamped) return;
    r.stamped = true;
    r.stampT = 0;
    emit('ui:stamp', { rank: r.result && r.result.rank ? r.result.rank : 'C' });
  }

  function finishPage(r) {
    r.row = r.pages[r.page].length;
    r.pageDone = true;
    if (r.page === 0) stamp(r);
  }

  function leaveResults(r) {
    var res = r.result || {};
    var qualifies = false;
    try {
      qualifies = !!(TG.Save && typeof TG.Save.qualifies === 'function' &&
        TG.Save.qualifies(res.difficulty, num(res.score, 0)));
    } catch (e) { qualifies = false; }
    emit('ui:select');
    r.leaving = callGame('setScreen', qualifies ? 'highScoreEntry' : 'title') !== false;
  }

  function updateResults(dt, acts) {
    var r = S;
    if (!r.pages || r.leaving) return;
    var rows = r.pages[r.page];
    if (!r.pageDone) {
      var row = rows[r.row];
      if (r.rowT === 0) emit('ui:tally');
      r.rowT += dt;
      if (rowCounts(row)) {
        r.tickT += dt;
        while (r.tickT >= TICK_TIME) {
          r.tickT -= TICK_TIME;
          if (r.rowT < COUNT_TIME) emit('ui:tally');
        }
      }
      var dur = rowCounts(row) ? COUNT_TIME + 0.08 : ROW_TIME;
      if (r.page > 0) dur = ROW_TIME * 0.6;
      if (r.rowT >= dur) {
        r.row++;
        r.rowT = 0;
        r.tickT = 0;
        if (r.row >= rows.length) r.pageDone = true;
      }
    } else if (r.page === 0 && !r.stamped) {
      r.waitT += dt;
      if (r.waitT >= STAMP_WAIT) stamp(r);
    }
    if (r.stamped) r.stampT += dt;
    if (screenT < RESULTS_LOCK) return;
    for (var i = 0; i < acts.length; i++) {
      if (acts[i].act !== 'confirm') continue;
      if (!r.pageDone || (r.page === 0 && !r.stamped)) {
        finishPage(r);
      } else if (r.page < r.pages.length - 1) {
        r.page++;
        r.row = 0;
        r.rowT = 0;
        r.tickT = 0;
        r.pageDone = false;
        emit('ui:move');
      } else {
        leaveResults(r);
        return;
      }
    }
  }

  function drawKeysValue(ctx, keys, right, y) {
    if (!keys || keys.length === 0) {
      txt(ctx, 'NONE', right, y, GRASS, { align: 'right' });
      return;
    }
    var x = right - keys.length * 14 + 3;
    for (var i = 0; i < keys.length; i++) {
      var kx = x + i * 14;
      fill(ctx, kx - 2, y - 2, 11, 11, INK);
      fill(ctx, kx - 1, y - 1, 9, 9, WHITE);
      txt(ctx, String(keys[i]).toUpperCase(), kx, y, INK);
    }
  }

  function drawResults(ctx) {
    var r = S;
    fill(ctx, 0, 0, SW, SH, INK);
    var res = r.result || {};
    var cleared = res.cleared === true;
    centerText(ctx, cleared ? 'STAGE ' + num(res.levelId, 1) + ' CLEAR!' : 'RUN ENDED', 8, cleared ? GOLD : SILVER, 2, true);
    if (res.difficulty) centerText(ctx, diffInfo(res.difficulty).label, 28, STONE);
    if (!r.pages) return;
    var rows = r.pages[r.page];
    for (var i = 0; i < rows.length; i++) {
      if (i > r.row) break;
      var row = rows[i];
      var y = 48 + i * 16;
      if (i === r.row && !r.pageDone && r.rowT <= 0) break;
      var lx = 64 + (row.indent || 0);
      txt(ctx, row.label, lx, y, row.color === undefined ? WHITE : row.color);
      if (row.note) txt(ctx, row.note, lx + textWidth(row.label) + 8, y, row.noteColor);
      if (row.keys) {
        drawKeysValue(ctx, row.keys, 320, y);
      } else if (row.text !== undefined) {
        txt(ctx, row.text, 320, y, row.textColor === undefined ? WHITE : row.textColor, { align: 'right' });
      } else {
        var v = row.value;
        if (i === r.row && !r.pageDone && rowCounts(row)) v = Math.floor(row.value * Math.min(1, r.rowT / COUNT_TIME));
        txt(ctx, row.format(v), 320, y, row.valueColor === undefined ? WHITE : row.valueColor, { align: 'right' });
      }
      fill(ctx, 64, y + 11, 256, 1, SHADOW);
    }
    // The rank, stamped in the right margin.
    if (r.stamped) {
      var rank = res.rank || 'C';
      var color = RANK_COLOR[rank] || SILVER;
      txt(ctx, 'RANK', 352, 44, STONE, { align: 'center' });
      // For the first frames the letter is WHITE and a little higher: it lands like a stamp.
      if (r.stampT < 0.12) txt(ctx, rank, 353, 54, WHITE, { scale: 4, align: 'center', shadow: true });
      else txt(ctx, rank, 353, 58, color, { scale: 4, align: 'center', shadow: true });
    }
    if (r.page === 1 && r.pageDone && res.suggestion) {
      centerText(ctx, String(res.suggestion), 194, GOLD);
    }
    var ready = screenT >= RESULTS_LOCK;
    var last = r.page === r.pages.length - 1 && r.pageDone;
    txt(ctx, (r.page + 1) + '/' + r.pages.length, SW - 6, SH - 11, STONE, { align: 'right' });
    txt(ctx, last ? 'ENTER: CONTINUE' : 'ENTER: NEXT', 6, SH - 11, ready ? SILVER : STONE);
  }

  // ---------------------------------------------------------------------------------------------
  // 4h. High score entry
  // ---------------------------------------------------------------------------------------------

  function setupEntry() {
    var st = gameState();
    var res = st && st.result && typeof st.result === 'object' ? st.result : {};
    var saved = String(getSetting('initials', 'PIP')).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (saved.length !== 3) saved = 'PIP';
    return { result: res, initials: '', saved: saved, shakeT: 0, added: false, done: false };
  }

  function entryFor(e, name) {
    var res = e.result || {};
    var t = res.typing && typeof res.typing === 'object' ? res.typing : {};
    return {
      name: name,
      score: Math.floor(num(res.score, 0)),
      wpm: Math.round(num(t.wpm, 0)),
      accuracy: Math.floor(num(t.accuracy, 1) * 100 + 1e-9),
      rank: typeof res.rank === 'string' ? res.rank : 'C',
      cleared: res.cleared === true,
      date: today()
    };
  }

  function saveEntry(e) {
    if (!e.added) {
      var name = e.initials.length === 3 ? e.initials : e.saved;
      var difficulty = e.result && e.result.difficulty;
      var pos = -1;
      try {
        if (TG.Save && typeof TG.Save.addScore === 'function') pos = TG.Save.addScore(difficulty, entryFor(e, name));
      } catch (err) {
        report('TG.Save.addScore', err);
      }
      setSetting('initials', name);
      e.added = true;
      pendingHighlight = pos >= 0 ? { difficulty: difficulty, pos: pos } : null;
      emit('ui:select');
    }
    e.done = callGame('setScreen', 'title') !== false;
  }

  function updateEntry(dt, acts) {
    var e = S;
    if (e.done) return;
    if (e.shakeT > 0) e.shakeT = Math.max(0, e.shakeT - dt);
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (a.act === 'letter') {
        if (e.initials.length < 3) {
          e.initials += a.ch.toUpperCase();
          emit('ui:letter', { index: e.initials.length - 1 });
        }
      } else if (a.act === 'backspace') {
        if (e.initials.length > 0) {
          e.initials = e.initials.slice(0, -1);
          emit('ui:back');
        }
      } else if (a.act === 'confirm' && a.key !== 'space' && a.key !== 'jump') {
        if (e.initials.length === 3 || e.initials.length === 0) {
          saveEntry(e);
          return;
        }
        e.shakeT = 0.3;
      }
    }
  }

  // The table of the difficulty with the new entry in its place.
  function previewTable(e) {
    var res = e.result || {};
    var list = [];
    try {
      if (TG.Save && typeof TG.Save.scores === 'function') list = TG.Save.scores(res.difficulty) || [];
    } catch (err) { list = []; }
    var score = Math.floor(num(res.score, 0));
    var pos = list.length;
    for (var i = 0; i < list.length; i++) {
      if (score > num(list[i].score, 0)) { pos = i; break; }
    }
    var rows = list.slice(0, pos).concat([{ mine: true, score: score }]).concat(list.slice(pos));
    return rows.slice(0, 5);
  }

  function drawEntry(ctx) {
    var e = S;
    var res = e.result || {};
    fill(ctx, 0, 0, SW, SH, INK);
    centerText(ctx, 'NEW HIGH SCORE!', 8, GOLD, 2, true);
    centerText(ctx, diffInfo(res.difficulty || 'medium').label + '   ' + Math.floor(num(res.score, 0)), 30, WHITE);
    centerText(ctx, 'TYPE YOUR INITIALS', 46, SILVER);
    var shake = e.shakeT > 0 ? (Math.floor(clock * 40) % 2 ? 2 : -2) : 0;
    var bx = CX - 68 + shake;
    for (var i = 0; i < 3; i++) {
      var x = bx + i * 48;
      var y = 60;
      var active = i === e.initials.length;
      panelBox(ctx, x, y, 40, 44, active ? GOLD : SILVER);
      var ch = e.initials.charAt(i);
      if (ch) {
        txt(ctx, ch, x + 6, y + 8, WHITE, { scale: 4 });
      } else if (e.initials.length === 0) {
        txt(ctx, e.saved.charAt(i), x + 6, y + 8, SHADOW, { scale: 4 });
      }
      if (active && blink(0.6, 0.35)) fill(ctx, x + 6, y + 38, 28, 2, GOLD);
    }
    var hint = e.initials.length === 0 ? 'ENTER: USE ' + e.saved : (e.initials.length === 3 ? 'ENTER: SAVE' : 'BACKSPACE: DELETE');
    centerText(ctx, hint, 112, e.shakeT > 0 ? CORAL : STONE);
    var rows = previewTable(e);
    for (var k = 0; k < rows.length; k++) {
      var r = rows[k];
      var y2 = 132 + k * 12;
      var name = r.mine ? (e.initials + '---').slice(0, 3) : String(r.name || '???');
      if (r.mine && e.initials.length === 0) name = e.saved;
      var line = (k + 1) + '  ' + name + '  ' + pad(num(r.score, 0), 7);
      centerText(ctx, line, y2, r.mine ? GOLD : SILVER);
    }
    footer(ctx, 'TYPE 3 LETTERS, THEN ENTER', STONE);
  }

  // ---------------------------------------------------------------------------------------------
  // 5. Public object
  // ---------------------------------------------------------------------------------------------

  var UPDATE = {
    boot: updateBoot,
    title: updateTitle,
    difficultySelect: updateDifficulty,
    howToPlay: updateHow,
    paused: updatePaused,
    gameOver: updateGameOver,
    results: updateResults,
    highScoreEntry: updateEntry
  };

  var DRAW = {
    boot: drawBoot,
    title: drawTitle,
    difficultySelect: drawDifficulty,
    howToPlay: drawHow,
    paused: drawPaused,
    gameOver: drawGameOver,
    results: drawResults,
    highScoreEntry: drawEntry
  };

  TG.UI = {
    // Subscribes to screen:change (and checkpoint, for the tutorialDone setting). Reads no game state.
    init: function () {
      for (var i = 0; i < subs.length; i++) {
        try { subs[i](); } catch (e) { /* already gone */ }
      }
      subs = [];
      started = false;
      current = null;
      S = {};
      if (!TG.Events || typeof TG.Events.on !== 'function') return;
      subs.push(TG.Events.on('screen:change', onScreenChange));
      subs.push(TG.Events.on('checkpoint', onCheckpoint));
    },

    // Called by TG.Main once per step when the screen is not a sim screen. Drains TG.Input.
    update: function (dt) {
      if (!started) return;
      var d = num(dt, 0);
      if (d < 0) d = 0;
      var screen = sync(null);
      var acts = readActions();
      clock += d;
      screenT += d;
      var fn = UPDATE[screen];
      if (fn) fn(d, acts);
    },

    // Draws the current screen or overlay; nothing on playing, lifeLost, bossIntro, boss, levelComplete.
    draw: function (ctx, state) {
      if (!started || !ctx) return;
      var screen = sync(state);
      var fn = DRAW[screen];
      if (fn) fn(ctx, state);
    },

    // Called by TG.Main when the window loses focus or the tab is hidden (DESIGN 2). A resume countdown
    // that is running goes back to the pause menu (as Esc does), and the continue countdown of game
    // over waits until onFocusGained.
    onFocusLost: function () {
      focusLost = true;
      if (!started) return;
      var screen = sync(null);
      if (screen === 'paused' && S.countdown >= 0) {
        S.countdown = -1;
        S.lastN = null;
      }
    },

    onFocusGained: function () {
      focusLost = false;
    },

    // Called by TG.Main: true on a touch screen before any keydown, false after the first keydown. While
    // it is true, the boot, title and How to Play screens say that a keyboard is needed.
    setKeyboardHint: function (flag) {
      keyboardHint = !!flag;
    }
  };

  // Read-only: 'menu' | 'scores' | 'options' | 'story' on the title screen, otherwise null.
  Object.defineProperty(TG.UI, 'panel', {
    enumerable: true,
    get: function () {
      return started && current === 'title' && S && S.panel ? S.panel : null;
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
