// test/test-render.js
// Tests for WP-F: js/effects.js (TG.Effects), js/hud.js (TG.Hud) and js/render.js (TG.Render).
// CONTRACT 4.17 to 4.19, 5.13, 6.6, 12 (WP-F acceptance) and 13.2 (canvas subset).
//
// Run from the project root:
//   node test/test-render.js
//   node test/test-render.js --quick     skips the long runs of the real simulation (one short run only)
//
// Two kinds of state are used:
//   - hand-built states that follow CONTRACT section 5, so that the presentation files can be tested with
//     only js/core.js present (CONTRACT 12, WP-F acceptance);
//   - the real simulation, driven by the bot of test/sim.js, when the simulation files are present.
// Drawing is done on the software canvas of tools/softcanvas.js (stubs.load({ canvas: 'soft' })), which
// really draws and throws for anything outside the canvas subset of CONTRACT 13.2.
'use strict';

const fs = require('fs');
const path = require('path');
const stubs = require('./stubs');

const QUICK = process.argv.indexOf('--quick') !== -1;

let passed = 0;
let failed = 0;
let skipped = 0;

function ok(condition, description, detail) {
  if (condition) {
    passed++;
    console.log('ok - ' + description);
  } else {
    failed++;
    console.log('FAIL - ' + description + (detail ? ' (' + detail + ')' : ''));
  }
}

function skip(description, why) {
  skipped++;
  console.log('skip - ' + description + (why ? ' (' + why + ')' : ''));
}

// fn returns undefined or true to pass, false or a string (the reason) to fail; a throw fails.
function check(description, fn) {
  try {
    const result = fn();
    if (result === false) ok(false, description);
    else if (typeof result === 'string') ok(false, description, result);
    else ok(true, description);
  } catch (e) {
    ok(false, description, (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)));
  }
}

const WPF_FILES = ['js/effects.js', 'js/hud.js', 'js/render.js'];
const ART_FILES = ['js/gfx.js', 'js/font.js', 'js/sprites-chars.js', 'js/sprites-world.js'];
const SIM_PRESENT = ['js/words.js', 'js/typing.js', 'js/input.js', 'js/entities.js', 'js/level.js', 'js/boss.js',
  'js/levels/level1.js', 'js/game.js'].every(function (f) { return fs.existsSync(path.join(stubs.ROOT, f)); });

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

// A fresh load with the presentation files. art: also gfx.js, font.js and both sprite files.
function loadEnv(opts) {
  const o = opts || {};
  const files = ['js/core.js'].concat(o.art === false ? [] : (o.art === 'gfx' ? ['js/gfx.js', 'js/font.js'] : ART_FILES))
    .concat(o.sim ? ['js/words.js', 'js/typing.js', 'js/input.js', 'js/entities.js', 'js/level.js', 'js/boss.js',
      'js/levels/level1.js', 'js/game.js'] : [])
    .concat(WPF_FILES);
  const env = stubs.load({ files: files, canvas: o.canvas || 'soft', storage: o.storage || 'memory' });
  const TG = env.TG;
  if (TG.Gfx && TG.Gfx.init) TG.Gfx.init(env.document);
  TG.Events.clear();
  TG.Effects.init();
  TG.Hud.init();
  TG.Render.init(env.canvas);
  return env;
}

function deepFreeze(o) {
  if (o === null || typeof o !== 'object' || Object.isFrozen(o)) return o;
  Object.freeze(o);
  Object.getOwnPropertyNames(o).forEach(function (k) { deepFreeze(o[k]); });
  return o;
}

// The typing statistics of CONTRACT 5.11.
function stats() {
  const perKey = {};
  'abcdefghijklmnopqrstuvwxyz'.split('').forEach(function (c) { perKey[c] = { hits: 0, misses: 0, intervalSum: 0, intervalCount: 0 }; });
  return {
    correct: 12, wrong: 1, wordsCleared: 3, wordsClean: 2, wordsMissed: 0, lettersInWords: 9, wordTime: 3.6,
    wpm: 30, liveWpm: 30, peakWpm: 0, accuracy: 12 / 13, keyStreak: 5, bestKeyStreak: 8, cleanRun: 3, bestCleanRun: 3,
    mult: 2, reactionSum: 0, reactionCount: 0, perKey: perKey, recentWords: [],
    section: { correct: 12, wrong: 1, lettersInWords: 9, wordTime: 3.6, words: 3 }
  };
}

let nextId = 1;

// A threat or crate (CONTRACT 5.3, 5.5) at dx from Pip and elev above the ground.
function entity(TG, state, kind, word, dx, elev, extra) {
  const C = TG.C;
  const box = { boulder: [24, 32], dawdle: [16, 16], hoppet: [16, 16], buzzle: [16, 16], swoop: [24, 16], truffle: [24, 16],
    digby: [16, 16], rock: [12, 12], crate: [16, 32] }[kind] || [16, 16];
  const e = {
    id: nextId++, kind: kind, word: word, typable: true, priority: kind === 'crate' ? 2 : 0, eta: 3 + dx / 100,
    x: state.player.x + dx, y: C.GROUND_Y - elev, shownAt: 0, lost: false, typed: 0, errors: 0, firstKeyAt: null, lastKeyAt: null,
    type: kind === 'crate' ? 'crate' : 'threat', from: kind === 'truffle' ? 'behind' : (kind === 'swoop' ? 'above' : (kind === 'digby' ? 'below' : 'right')),
    w: box[0], h: box[1], elev: elev, budget: 4, age: 1, t: 0.25, stallT: 0, holdSpan: 0, harmful: kind !== 'crate',
    onScreen: true, urgent: false, tutorial: false, intro: false, section: 0, dead: false, reason: null, animT: 0.4,
    flipX: kind === 'truffle', phase: 'approach'
  };
  if (kind === 'crate') e.power = 'hourglass';
  Object.assign(e, extra || {});
  return e;
}

function attack(TG, state, kind, dx) {
  const C = TG.C;
  const elev = kind === 'pick' ? 14 : 0;
  return {
    id: nextId++, type: 'attack', kind: kind, action: kind === 'pick' ? 'duck' : 'jump',
    x: state.player.x + dx, y: C.GROUND_Y - elev, w: 16, h: kind === 'pick' ? 16 : 8, elev: elev,
    eta: 0.3, harmful: true, onScreen: true, dead: false, reason: null, animT: 0.2
  };
}

function hazard(TG, id, kind, tile, tiles) {
  const C = TG.C;
  const x = tile * 16, w = (tiles || 1) * 16;
  const h = { id: id, kind: kind, action: kind === 'gap' || kind === 'bramble' ? 'jump' : 'duck', hold: kind === 'arch',
    x: x, y: C.GROUND_Y, w: w, h: 32, winStart: 0, winEnd: 0, holdUntil: 0, bridged: false, falls: 0, cued: false,
    passed: false, prompt: false, section: 0 };
  if (kind === 'gap') { h.winStart = x + w - 52; h.winEnd = x + 4; }
  if (kind === 'bramble') { h.y = C.GROUND_Y - 8; h.h = 8; h.winStart = x - 27; h.winEnd = x - 5; }
  if (kind === 'branch' || kind === 'beehive' || kind === 'arch') {
    h.y = C.PLAY_TOP; h.h = C.GROUND_Y - C.HANG_CLEAR - C.PLAY_TOP; h.winStart = x - 34; h.winEnd = x - 6;
    if (kind === 'arch') h.holdUntil = x + w + 6;
  }
  return h;
}

// A hand-built state following CONTRACT 5.1, for the given screen.
function handState(TG, screen, opts) {
  const C = TG.C;
  const o = opts || {};
  const arena = ['bossIntro', 'boss', 'levelComplete'].indexOf(screen) !== -1 || o.arena;
  const camX = arena ? 14200 : 1200 + (o.section === 2 ? 8704 : 0);
  const section = arena ? 3 : (o.section || 0);
  const player = {
    x: camX + C.HERO_SCREEN_X, y: C.GROUND_Y, vy: 0, state: 'run', onGround: true, jumpT: -1, coyoteT: 0, bufferT: 0,
    slideT: 0, duckHeld: false, lives: 4, invulnT: 0, animT: 1.3, hurtT: 0, lastGapId: null
  };
  const T = camX / 16;
  const level = {
    id: 1, name: 'QUILL MEADOWS',
    theme: { id: 'meadow', backdrop: 'meadow', wordFlavour: 'meadow', music: { level: 'level1', boss: 'boss1' } },
    tutorial: true, lengthPx: 14080, arenaX: 14080, arenaTilesX: 13952,
    sections: [
      { index: 0, name: 'MORNING MEADOW', stage: '1-1', x0: 0, x1: 4096, palette: 'day', music: { transpose: 0, tempo: 150 }, gapFill: 'water' },
      { index: 1, name: 'ORCHARD BROOK', stage: '1-2', x0: 4096, x1: 8704, palette: 'day', music: { transpose: 0, tempo: 150 }, gapFill: 'water' },
      { index: 2, name: 'SUNSET RIDGE', stage: '1-3', x0: 8704, x1: 14080, palette: 'sunset', music: { transpose: 2, tempo: 158 }, gapFill: 'dark' }
    ],
    arena: { index: 3, name: "THE BARON'S DIG", stage: '1-B', palette: 'dusk', music: { transpose: 0, tempo: 168 } },
    checkpoints: [
      { index: 0, x: 96, flagX: 0, raised: true }, { index: 1, x: 4096, flagX: 4096, raised: camX > 4096 },
      { index: 2, x: 8704, flagX: 8704, raised: camX > 8704 }, { index: 3, x: 14080, flagX: 14080, raised: arena }
    ],
    hazards: arena ? [] : [
      hazard(TG, 'h1', 'gap', T + 10), hazard(TG, 'h2', 'bramble', T + 14), hazard(TG, 'h3', 'branch', T + 17),
      hazard(TG, 'h4', 'beehive', T + 20), hazard(TG, 'h5', 'arch', T + 23, 3), hazard(TG, 'h6', 'gap', T + 7, 2)
    ],
    spawns: [], ink: [], decor: [{ x: camX + 40, y: C.GROUND_Y, sprite: 'sign_type' }],
    boss: { kind: 'baron', speech: 'MY MEADOW! MY WORDS!' }
  };
  if (!arena) level.hazards[5].bridged = true;
  const state = {
    screen: screen, screenT: o.screenT !== undefined ? o.screenT : 1.0, screenData: null, resumeTo: null, pausePending: false,
    frame: 100, time: 12.5, worldTime: 12, pace: 1, assist: 1, assistTarget: 1, adaptive: true,
    slowScale: 1, tutorScale: 1, finisherScale: 1, timeScale: 1, seed: 1, rng: null, difficulty: 'medium',
    config: TG.Difficulty.get('medium'), levelId: 1, level: level, picker: null,
    typing: { opts: {}, stats: stats(), target: null, discardT: 0 },
    section: section, camera: { x: camX }, player: player, entities: [], items: [], boss: null, nextId: 100,
    score: 4210, nextLifeAt: 10000, ink: 42, inkTotal: 42, power: { shield: 2, slowT: 3, quillT: 0, last: 'hourglass' },
    checkpoint: { index: 0, x: 96, score: 0, ink: 0, inkTotal: 0, nextLifeAt: 10000, bossPhase: 1, continuesHere: 0 },
    lifeLost: { cause: 'hit', t: 0, duration: 0.1, gapId: null, last: false },
    tutorial: { active: false, targetId: null }, adapt: { n: 0, uSum: 0, correct: 0, wrong: 0 },
    run: { continues: 0, livesLost: 0, sectionLivesLost: 0, hits: 0, falls: 0, damageTypable: 0, damageOther: 0,
      threatsCleared: 3, threatsMissed: 0, cratesCleared: 0, cratesMissed: 0, cleared: false, ended: false, bonuses: [] },
    result: null
  };
  state.items = [{ id: 'i1', x: camX + 180, y: C.GROUND_Y - 4, w: 8, h: 8 }, { id: 'i2', x: camX + 190, y: C.GROUND_Y - 4, w: 8, h: 8 },
    { id: 'i3', x: camX + 200, y: C.GROUND_Y - 22, w: 8, h: 8 }];
  if (arena) {
    state.boss = {
      kind: 'baron', x: player.x + C.BOSS_DX, y: C.GROUND_Y, w: 48, h: 48, state: screen === 'levelComplete' ? 'defeated' : 'taunt',
      stateT: 0.4, phase: 2, round: 1, health: 3, maxHealth: 6,
      volley: { toLaunch: ['rock', 'rockhigh'], launched: 2, sinceLaunch: 0, hits: 1 }, attacks: [], nextAttack: 'shock',
      word: null, windowWs: 5, pose: screen === 'levelComplete' ? 'dizzy' : 'laugh', rise: screen === 'bossIntro' ? 20 : 0,
      lampRed: true, flashT: 0
    };
    if (screen === 'boss') {
      state.boss.word = { id: nextId++, kind: 'core', word: 'monocle', typable: true, priority: 0, eta: 3, x: state.boss.x,
        y: C.GROUND_Y - 32, shownAt: 10, lost: false, typed: 3, errors: 0, firstKeyAt: 11, lastKeyAt: 12 };
      state.entities.push(entity(TG, state, 'rock', 'glow', 140, 60), entity(TG, state, 'rock', 'high', 0, 220, { from: 'above' }));
      state.entities.push(attack(TG, state, 'shock', 90), attack(TG, state, 'pick', 120));
    }
  } else {
    state.entities.push(
      entity(TG, state, 'boulder', 'stone', 330, 0),
      entity(TG, state, 'dawdle', 'river', 200, 0),
      entity(TG, state, 'hoppet', 'frog', 160, 6),
      entity(TG, state, 'buzzle', 'honey', 120, 18),
      entity(TG, state, 'swoop', 'crow', 120, 120, { phase: 'hover' }),
      entity(TG, state, 'truffle', 'boar', -60, 0, { phase: 'hold' }),
      entity(TG, state, 'digby', 'mole', 56, -16, { phase: 'mound', onScreen: false, harmful: false }),
      entity(TG, state, 'crate', 'kite', 230, 100)
    );
  }
  return state;
}

// Every palette index as a '#rrggbb' lower-case string.
function paletteSet(TG) {
  return TG.PAL.map(function (h) { return h.toLowerCase(); });
}

function pixel(rgba, W, x, y) {
  const o = (y * W + x) * 4;
  if (rgba[o + 3] === 0) return null;
  return '#' + [rgba[o], rgba[o + 1], rgba[o + 2]].map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// The checks that every layout must pass: plates inside x 2..382 and y 24..184, no overlaps, the
// locked one first, dim on the others while a lock is held.
function labelProblems(state, labels) {
  const target = state.typing ? state.typing.target : null;
  for (let i = 0; i < labels.length; i++) {
    const L = labels[i];
    if (L.x < 2 || L.x + L.w > 382 || L.y < 24 || L.y + L.h > 184) return 'plate ' + L.text + ' outside the playfield at ' + L.x + ',' + L.y;
    if (L.w !== 8 * L.text.length + 2 || L.h !== 10) return 'plate ' + L.text + ' has size ' + L.w + 'x' + L.h;
    for (let j = 0; j < i; j++) {
      if (rectsOverlap(L, labels[j])) return 'plates ' + L.text + ' and ' + labels[j].text + ' overlap';
    }
    if (target && L.locked !== (L.id === target.id)) return 'locked flag of ' + L.text;
    if (target && !L.locked && !L.dim) return 'plate ' + L.text + ' is not dim while a lock is held';
    if (!target && (L.locked || L.dim)) return 'plate ' + L.text + ' is locked or dim with no lock';
  }
  if (target && labels.length && labels.some(function (L) { return L.locked; }) && !labels[0].locked) return 'the locked plate is not first';
  return null;
}

// ---------------------------------------------------------------------------------------------
// 1. Loading, module pattern, canvas subset (CONTRACT 2, 12.0, 13.2)
// ---------------------------------------------------------------------------------------------

check('effects.js, hud.js and render.js load with only js/core.js present', function () {
  const env = stubs.load({ files: ['js/core.js'].concat(WPF_FILES) });
  if (env.missing.length) return 'missing: ' + env.missing.join(', ');
  if (!env.TG.Effects || !env.TG.Hud || !env.TG.Render) return 'a module is not defined';
});

check('loading them makes no canvas, audio or storage calls', function () {
  const env = stubs.load({ files: ['js/core.js'].concat(WPF_FILES), storage: 'throw' });
  if (env.canvasCalls.count !== 0) return 'canvas calls: ' + env.canvasCalls.count;
  if (env.audio.contexts.length !== 0) return 'audio contexts: ' + env.audio.contexts.length;
  if (env.errors.length || env.warnings.length) return 'console: ' + env.errors.concat(env.warnings).join('; ');
});

function sourceWithoutComments(file) {
  const src = fs.readFileSync(path.join(stubs.ROOT, file), 'utf8');
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(function (l) {
    const i = l.indexOf('//');
    return i === -1 ? l : l.slice(0, i);
  }).join('\n');
}

check('every file is one IIFE on the global TG, in strict mode (CONTRACT 2.1)', function () {
  for (const f of WPF_FILES) {
    const src = fs.readFileSync(path.join(stubs.ROOT, f), 'utf8');
    if (src.indexOf('(function (root) {') === -1) return f + ': no IIFE';
    if (src.indexOf("'use strict';") === -1) return f + ': not strict';
    if (src.indexOf("var TG = root.TG = root.TG || {};") === -1) return f + ': does not attach to TG';
    if (!/\}\)\(typeof window !== 'undefined' \? window : globalThis\);\s*$/.test(src)) return f + ': bad ending';
  }
});

check('no other module is read at load time (CONTRACT 2.2 rule 3)', function () {
  const found = [];
  for (const f of WPF_FILES) {
    const src = sourceWithoutComments(f);
    // Top-level statements of the IIFE are indented by 2 spaces.
    const re = /^ {2}(?:var|let|const) [^\n]*\bTG\.(Gfx|Font|Effects|Hud|Render|Game|Entities|Level|Boss|UI|Main|Audio|Save|Typing|Words|Input|Events|RNG|Difficulty)\b/gm;
    let m;
    while ((m = re.exec(src)) !== null) found.push(f + ': ' + m[0].trim());
  }
  if (found.length) return found.join('; ');
});

check('no Math.random, Date, performance.now, timers, DOM or storage in these files (CONTRACT 2.2 rule 5)', function () {
  const bad = ['Math.random', 'Date.', 'new Date', 'performance.now', 'setTimeout', 'setInterval', 'requestAnimationFrame',
    'document.', 'localStorage', 'AudioContext', 'state.rng', '.rng.'];
  const found = [];
  for (const f of WPF_FILES) {
    const src = sourceWithoutComments(f);
    bad.forEach(function (b) { if (src.indexOf(b) !== -1) found.push(f + ': ' + b); });
  }
  if (found.length) return found.join(', ');
});

check('only the canvas subset of CONTRACT 13.2 appears in the source', function () {
  const bad = ['fillText', 'strokeText', 'strokeRect', 'strokeStyle', 'beginPath', 'moveTo', 'lineTo', 'arc(', '.fill(',
    '.stroke(', '.clip(', 'createLinearGradient', 'createRadialGradient', 'createPattern', '.scale(', '.rotate(',
    '.transform(', 'globalCompositeOperation', '.font =', '.font=', 'shadowBlur', 'shadowColor', 'measureText',
    'lineWidth', 'filter =', 'toDataURL', 'new Image', 'Path2D', 'createElement'];
  const found = [];
  for (const f of WPF_FILES) {
    const src = sourceWithoutComments(f);
    bad.forEach(function (b) { if (src.indexOf(b) !== -1) found.push(f + ': ' + b); });
    const alpha = src.match(/globalAlpha\s*=\s*([^;]+)/g) || [];
    alpha.forEach(function (a) { if (!/=\s*1\s*$/.test(a)) found.push(f + ': ' + a); });
  }
  if (found.length) return found.join(', ');
});

// ---------------------------------------------------------------------------------------------
// 2. TG.Render.draw on hand-built states (CONTRACT 12, WP-F acceptance)
// ---------------------------------------------------------------------------------------------

const SCREENS = ['playing', 'lifeLost', 'bossIntro', 'boss', 'levelComplete', 'paused', 'gameOver'];

[['with the sprite files', {}], ['with gfx.js and font.js but no sprite files', { art: 'gfx' }],
  ['with only core.js and the WP-F files', { art: false }]].forEach(function (variant) {
  check('Render.draw runs on a hand-built state for every world screen ' + variant[0] + ', and makes canvas calls', function () {
    for (const canvasMode of ['soft', 'stub']) {
      const env = loadEnv(Object.assign({ canvas: canvasMode }, variant[1]));
      const TG = env.TG;
      for (const screen of SCREENS) {
        const s = handState(TG, screen);
        const before = env.canvasCalls.count;
        TG.Render.draw(s);
        if (env.canvasCalls.count === before) return screen + ' (' + canvasMode + '): no canvas calls';
      }
      if (env.errors.length) return 'console.error: ' + env.errors[0];
    }
  });
});

check('Render.draw on a screen with no world fills INK, and on a state with no level does not throw', function () {
  const env = loadEnv();
  const TG = env.TG;
  TG.Render.draw({ screen: 'title', screenT: 0, level: null, player: null, typing: null });
  TG.Render.draw({ screen: 'playing', level: null });
  TG.Render.draw(null);
  const rgba = env.canvas.toRGBA();
  if (pixel(rgba, 384, 100, 100) !== TG.PAL[0].toLowerCase()) return 'not INK';
});

check('drawBackdrop draws the sky of each palette (used by TG.UI for the title)', function () {
  const env = loadEnv();
  const TG = env.TG;
  const ctx = env.canvas.getContext('2d');
  const want = { day: 7, sunset: 28, dusk: 5 };
  for (const name of Object.keys(want)) {
    TG.Render.drawBackdrop(ctx, 'meadow', name, 500, 3, name === 'dusk' ? 3 : 0);
    const p = pixel(env.canvas.toRGBA(), 384, 2, 2);
    if (p !== TG.PAL[want[name]].toLowerCase()) return name + ': ' + p;
  }
  TG.Render.drawBackdrop(ctx, 'no-such-backdrop', 'day', 0, 0, 0);
});

check('worldToScreenX is floor(x - camera.x)', function () {
  const env = loadEnv({ art: false });
  const TG = env.TG;
  if (TG.Render.worldToScreenX({ camera: { x: 100.6 } }, 200) !== 99) return String(TG.Render.worldToScreenX({ camera: { x: 100.6 } }, 200));
  if (TG.Render.worldToScreenX({ camera: { x: 0 } }, -0.5) !== -1) return 'negative';
});

check('no function in these files writes to the state: draw and Hud.update on deep-frozen states', function () {
  const env = loadEnv();
  const TG = env.TG;
  for (const screen of SCREENS) {
    const s = handState(TG, screen);
    s.typing.target = s.entities.length ? s.entities[1] : (s.boss && s.boss.word) || null;
    const text = JSON.stringify(s);
    deepFreeze(s);
    for (let i = 0; i < 3; i++) {
      TG.Hud.update(1 / 60, s);
      TG.Effects.update(1 / 60);
      TG.Render.draw(s);
      TG.Render.layoutLabels(s);
      TG.Hud.keyGuideOn(s);
    }
    if (JSON.stringify(s) !== text) return screen + ': the state changed';
  }
  if (env.errors.length) return env.errors[0];
});

// Records the names of the sprites drawn during fn: TG.Gfx.draw, and TG.Gfx.get for the parts that are
// drawn clipped at the ground line.
function spritesDrawn(TG, fn) {
  const names = [];
  const draw = TG.Gfx.draw, get = TG.Gfx.get;
  TG.Gfx.draw = function (ctx, name) {
    names.push(name);
    return draw.apply(TG.Gfx, arguments);
  };
  TG.Gfx.get = function (name) {
    names.push(name);
    return get.apply(TG.Gfx, arguments);
  };
  try { fn(); } finally { TG.Gfx.draw = draw; TG.Gfx.get = get; }
  return names;
}

check('with three items in state.items the ink drop is drawn three times; with none, never', function () {
  const env = loadEnv();
  const TG = env.TG;
  const s = handState(TG, 'playing');
  let n = spritesDrawn(TG, function () { TG.Render.draw(s); }).filter(function (x) { return x === 'item_ink'; }).length;
  if (n !== 3) return 'three items drew ' + n;
  s.items = [];
  n = spritesDrawn(TG, function () { TG.Render.draw(s); }).filter(function (x) { return x === 'item_ink'; }).length;
  if (n !== 0) return 'no items drew ' + n;
});

check('signposts stand at hazard.postX (DESIGN 5), at winStart for a hazard without one; the Easy key prompt shows only inside the input window', function () {
  const env = loadEnv();
  const TG = env.TG;
  const s = handState(TG, 'playing');
  const camX = s.camera.x;
  const gap = s.level.hazards[0], bramble = s.level.hazards[1];
  gap.postX = gap.x + gap.w / 2 - 24;
  const signs = [];
  const draw = TG.Gfx.draw;
  TG.Gfx.draw = function (ctx, name, frame, x) {
    if (name === 'sign_jump') signs.push(x);
    return draw.apply(TG.Gfx, arguments);
  };
  try { TG.Render.draw(s); } finally { TG.Gfx.draw = draw; }
  if (signs.indexOf(Math.floor(gap.postX - camX)) === -1) return 'no sign at the gap post: ' + signs.join(',');
  if (signs.indexOf(Math.floor(gap.winStart - camX)) !== -1) return 'a sign at the first pixel of the gap window';
  if (signs.indexOf(Math.floor(bramble.winStart - camX)) === -1) return 'no sign at winStart for a hazard without postX';
  // The key prompt: nothing before the window opens, a SPACE keycap inside it.
  gap.prompt = true;
  const texts = [];
  const fdraw = TG.Font.draw;
  TG.Font.draw = function (ctx, str) {
    texts.push(String(str));
    return fdraw.apply(TG.Font, arguments);
  };
  let before, inside;
  try {
    s.player.x = gap.winStart - 12;
    TG.Render.draw(s);
    before = texts.indexOf('SPACE') !== -1;
    texts.length = 0;
    s.player.x = gap.winStart + 2;
    TG.Render.draw(s);
    inside = texts.indexOf('SPACE') !== -1;
  } finally { TG.Font.draw = fdraw; }
  if (before) return 'the SPACE keycap shows before the window opens';
  if (!inside) return 'no SPACE keycap inside the window';
});

check('the arch, which needs duck held, has a GOLD HOLD sign over its chevron on every difficulty, and the Easy key prompt', function () {
  const env = loadEnv({ sim: true });
  const TG = env.TG;
  const s = handState(TG, 'playing');
  const arch = s.level.hazards[4];
  if (arch.kind !== 'arch') return 'hand state: ' + arch.kind;
  s.player.x = arch.winStart + 2;
  const glyphs = [];
  const fn = TG.Font.drawGlyph;
  TG.Font.drawGlyph = function (ctx, ch, x, y, color) {
    glyphs.push({ ch: ch, x: x, y: y, color: color });
    return fn.apply(TG.Font, arguments);
  };
  try { TG.Render.draw(s); } finally { TG.Font.drawGlyph = fn; }
  const HANG = TG.C.GROUND_Y - TG.C.HANG_CLEAR;
  const hold = glyphs.filter(function (g) { return g.color === 18 && g.y === HANG - 37; }).map(function (g) { return g.ch; }).join('');
  if (hold !== 'HOLD') return 'sign over the arch: "' + hold + '"';
  // With the Easy key prompt, the keycap above Pip carries HOLD inside the window and the sign over the
  // arch gives way to it (the two overlapped as the arch scrolled in); before the window the sign shows.
  arch.prompt = true;
  const fdraw = TG.Font.draw;
  const holdAt = function (px, time) {
    s.player.x = px;
    s.time = time;
    glyphs.length = 0;
    const texts = [];
    TG.Font.drawGlyph = function (ctx, ch, x, y, color) {
      glyphs.push({ ch: ch, x: x, y: y, color: color });
      return fn.apply(TG.Font, arguments);
    };
    TG.Font.draw = function (ctx, str) {
      texts.push(String(str));
      return fdraw.apply(TG.Font, arguments);
    };
    try { TG.Render.draw(s); } finally { TG.Font.drawGlyph = fn; TG.Font.draw = fdraw; }
    return {
      sign: glyphs.filter(function (g) { return g.color === 18 && g.y === HANG - 37; }).map(function (g) { return g.ch; }).join(''),
      texts: texts
    };
  };
  for (const px of [arch.winStart + 2, arch.x + 20, arch.holdUntil - 1]) {
    const r = holdAt(px, 1);
    if (r.sign !== '') return 'Easy prompt at x ' + (px - arch.x) + ': the arch sign still shows ("' + r.sign + '")';
    if (r.texts.indexOf('HOLD') === -1 || r.texts.indexOf('ENTER') === -1) return 'Easy prompt at x ' + (px - arch.x) + ': no HOLD ENTER keycap';
  }
  const before = [0, 0.13, 0.26, 0.39].map(function (t) { return holdAt(arch.winStart - 12, t).sign; });
  if (before.indexOf('HOLD') === -1) return 'Easy, before the window: no sign over the arch (' + before.join(',') + ')';
  arch.prompt = false;
  // Level 1: on Easy the arch gets a key prompt although the first three duck hazards used them up.
  const data = TG.Levels[1];
  for (const d of ['easy', 'medium', 'hard']) {
    const level = TG.Level.build(data, TG.Difficulty.resolve(d, data.tune));
    const arches = level.hazards.filter(function (h) { return h.kind === 'arch'; });
    if (!arches.length) return d + ': no arch';
    const ducks = level.hazards.filter(function (h) { return h.action === 'duck' && h.prompt && h.kind !== 'arch'; }).length;
    if (d === 'easy' && (arches.some(function (h) { return !h.prompt; }) || ducks !== 3)) return 'easy: arch prompt ' + arches[0].prompt + ', other duck prompts ' + ducks;
    if (d !== 'easy' && arches.some(function (h) { return h.prompt; })) return d + ': the arch has a key prompt';
  }
});

check('in the arena a plate stays at y 37 or lower, 4 px clear of the boss bar box (y 20 to 30)', function () {
  const env = loadEnv({ art: false });
  const TG = env.TG;
  const s = handState(TG, 'boss');
  s.boss.word = null;
  s.entities = [entity(TG, s, 'rock', 'shelf', 150, 200), entity(TG, s, 'rock', 'clap', 60, 150)];
  const labels = TG.Render.layoutLabels(s);
  if (!labels.some(function (L) { return L.edge === 'top'; })) return 'no top edge tag';
  const high = labels.filter(function (L) { return L.y < 37; });
  if (high.length) return high[0].text + ' at y ' + high[0].y;
  const rng = TG.RNG.create(5);
  for (let n = 0; n < 300; n++) {
    const t = handState(TG, 'boss');
    t.entities = [];
    for (let k = 0; k < 4; k++) t.entities.push(entity(TG, t, 'rock', ['ab', 'cedar', 'fjord', 'mo'][k], rng.int(-40, 320), rng.int(0, 240), { eta: rng.next() * 4 }));
    const L = TG.Render.layoutLabels(t).filter(function (x) { return x.y < 37; });
    if (L.length) return 'scene ' + n + ': ' + L[0].text + ' at y ' + L[0].y;
  }
});

check('the arena sky darkens per phase and the far hills stay visible in phase 3 (INK with a PLUM dither, not plain PLUM)', function () {
  const env = loadEnv();
  const TG = env.TG;
  const pal = paletteSet(TG);
  const s = handState(TG, 'boss');
  s.boss.word = null;
  s.entities = [];
  s.boss.phase = 3;
  s.power.slowT = 0;
  TG.Render.draw(s);
  const rgba = env.canvas.toRGBA();
  const seen = {};
  for (let x = 0; x < 200; x++) seen[pixel(rgba, 384, x, 60)] = true;
  if (!seen[pal[0]] || !seen[pal[28]]) return 'phase 3 sky at y 60 is not INK and PLUM: ' + Object.keys(seen).join(' ');
  // The far hills (PLUM under the dusk remap) show as a solid PLUM run against the dithered sky.
  let run = 0, best = 0;
  for (let y = 120; y < 170; y++) {
    for (let x = 0; x < 384; x++) {
      if (pixel(rgba, 384, x, y) === pal[28]) { run++; best = Math.max(best, run); } else run = 0;
    }
    run = 0;
  }
  if (best < 16) return 'no solid PLUM hills (longest run ' + best + ')';
});

check('on gameOver the hero sprite is hero_sit; on levelComplete it is hero_win', function () {
  const env = loadEnv();
  const TG = env.TG;
  const heroes = function (names) { return names.filter(function (x) { return x.indexOf('hero_') === 0; }); };
  let h = heroes(spritesDrawn(TG, function () { TG.Render.draw(handState(TG, 'gameOver')); }));
  if (h.length !== 1 || h[0] !== 'hero_sit') return 'gameOver: ' + h.join(',');
  h = heroes(spritesDrawn(TG, function () { TG.Render.draw(handState(TG, 'levelComplete', { screenT: 0.01 })); }));
  if (h.length !== 1 || h[0] !== 'hero_win') return 'levelComplete: ' + h.join(',');
});

check('on levelComplete with boss.rise = 40 and pose dizzy, draw does not throw, at every moment of the defeat', function () {
  const env = loadEnv();
  const TG = env.TG;
  for (const t of [0, 0.02, 0.3, 0.6, 1.0, 1.8, 2.1, 2.5, 3.5, 3.99]) {
    const s = handState(TG, 'levelComplete', { screenT: t });
    s.boss.rise = 40;
    s.boss.pose = 'dizzy';
    TG.Render.draw(s);
  }
  if (env.errors.length) return env.errors[0];
});

check('Pip: run with the cast overlay and the spark after a correct key; jump, slide, fall, rescue bubble, hurt', function () {
  const env = loadEnv();
  const TG = env.TG;
  const s = handState(TG, 'playing');
  TG.Events.emit('type:hit', { target: s.entities[1], id: s.entities[1].id, kind: 'dawdle', ch: 'r', index: 0, length: 5, complete: false, x: 0, y: 0 });
  let names = spritesDrawn(TG, function () { TG.Render.draw(s); });
  if (names.indexOf('hero_run') === -1 || names.indexOf('hero_cast') === -1 || names.indexOf('ink_spark') === -1) return 'cast: ' + names.filter(function (n) { return /hero|ink/.test(n); }).join(',');
  const cases = [
    [{ state: 'jump', jumpT: 0.3 }, 'hero_jump'], [{ state: 'slide' }, 'hero_slide'], [{ state: 'fall' }, 'hero_jump'],
    [{ state: 'rescue' }, 'fx_bubble'], [{ hurtT: 0.2, invulnT: 2 }, 'hero_hurt']
  ];
  for (const c of cases) {
    const t = handState(TG, 'playing');
    Object.assign(t.player, c[0]);
    names = spritesDrawn(TG, function () { TG.Render.draw(t); });
    if (names.indexOf(c[1]) === -1) return JSON.stringify(c[0]) + ' did not draw ' + c[1];
  }
  const f = handState(TG, 'lifeLost');
  f.player.state = 'fall';
  f.player.y = TG.C.GROUND_Y + 8;
  f.lifeLost = { cause: 'fall', t: 0.8, duration: 1.0, gapId: 'h1', last: false };
  names = spritesDrawn(TG, function () { TG.Render.draw(f); });
  if (names.indexOf('fx_bubble') === -1) return 'the fall pause does not show the bubble';
});

check('every entity kind is drawn with its sprite (CONTRACT 6.6), and the boss parts in the arena', function () {
  const env = loadEnv();
  const TG = env.TG;
  const s = handState(TG, 'playing');
  let names = spritesDrawn(TG, function () { TG.Render.draw(s); });
  const want = ['en_boulder', 'en_dawdle', 'en_hoppet', 'en_buzzle', 'en_swoop', 'en_truffle', 'en_mound', 'crate_balloon',
    'pw_hourglass', 'haz_bramble', 'haz_branch', 'haz_trunk', 'haz_beehive', 'haz_rope', 'haz_arch', 'haz_canopy', 'sign_jump', 'sign_duck',
    'tile_grass', 'tile_soil', 'tile_water', 'tile_plank', 'tile_edge_l', 'tile_edge_r', 'fx_shield', 'sign_type', 'bg_hill_far'];
  let missing = want.filter(function (n) { return names.indexOf(n) === -1; });
  if (missing.length) return 'playing: ' + missing.join(', ');
  const b = handState(TG, 'boss');
  names = spritesDrawn(TG, function () { TG.Render.draw(b); });
  missing = ['boss_body', 'boss_head', 'boss_arm', 'boss_mound', 'pr_rock', 'pr_shock', 'pr_pickaxe', 'fx_marker', 'tile_arena', 'tile_rail',
    'bg_moon', 'bg_star'].filter(function (n) { return names.indexOf(n) === -1; });
  if (missing.length) return 'boss: ' + missing.join(', ');
  if (env.warnings.length) return 'warning: ' + env.warnings[0];
});

// ---------------------------------------------------------------------------------------------
// 3. Word plates (CONTRACT 5.13, DESIGN 4.5)
// ---------------------------------------------------------------------------------------------

check('layoutLabels with 4 typables at the same position gives 4 plates that do not overlap, inside x 2..382, y 24..184', function () {
  const env = loadEnv({ art: false });
  const TG = env.TG;
  for (const elev of [0, 40, 100, 150]) {
    for (const dx of [-80, 0, 100, 270]) {
      const s = handState(TG, 'playing');
      s.entities = [];
      ['able', 'bake', 'calm', 'dome'].forEach(function (w) { s.entities.push(entity(TG, s, 'hoppet', w, dx, elev)); });
      const labels = TG.Render.layoutLabels(s);
      if (labels.length !== 4) return labels.length + ' plates';
      const p = labelProblems(s, labels);
      if (p) return 'elev ' + elev + ' dx ' + dx + ': ' + p;
    }
  }
});

check('with typing.target set, its plate is locked and first and the others are dim; with null, none is locked or dim', function () {
  const env = loadEnv({ art: false });
  const TG = env.TG;
  const s = handState(TG, 'playing');
  s.typing.target = s.entities[3];
  let labels = TG.Render.layoutLabels(s);
  if (!labels[0].locked || labels[0].id !== s.entities[3].id) return 'the locked plate is not first';
  if (labels.slice(1).some(function (L) { return L.locked || !L.dim; })) return 'dim';
  s.typing.target = null;
  labels = TG.Render.layoutLabels(s);
  if (labels.some(function (L) { return L.locked || L.dim; })) return 'locked or dim without a lock';
  if (labels.length !== s.entities.length) return labels.length + ' plates for ' + s.entities.length + ' typables';
});

check('plates are ordered by eta then id; boss words and attacks get no plate; a plate has the label shape of 5.13', function () {
  const env = loadEnv({ art: false });
  const TG = env.TG;
  const s = handState(TG, 'boss');
  const labels = TG.Render.layoutLabels(s);
  if (labels.length !== 2) return labels.length + ' plates in the arena (two rocks)';
  const keys = ['id', 'text', 'typed', 'x', 'y', 'w', 'h', 'locked', 'dim', 'urgent', 'friendly', 'edge', 'tailX', 'tailY'];
  for (const k of keys) if (!(k in labels[0])) return 'no field ' + k;
  const t = handState(TG, 'playing');
  t.entities.forEach(function (e, i) { e.eta = 10 - i; });
  const ids = TG.Render.layoutLabels(t).map(function (L) { return L.id; });
  const want = t.entities.slice().reverse().map(function (e) { return e.id; });
  if (JSON.stringify(ids) !== JSON.stringify(want)) return 'order ' + ids.join(',');
});

check('edge tags: left of the view gives left; a digby at elev -16 gives bottom with the plate bottom at GROUND_Y - 12; a boulder beyond the right gives right; a swoop above gives top', function () {
  const env = loadEnv({ art: false });
  const TG = env.TG;
  const C = TG.C;
  const s = handState(TG, 'playing');
  s.entities = [
    entity(TG, s, 'truffle', 'boar', -140, 0),
    entity(TG, s, 'digby', 'mole', 56, -16, { phase: 'mound' }),
    entity(TG, s, 'boulder', 'stone', 330, 0),
    entity(TG, s, 'swoop', 'crow', 120, 190, { phase: 'enter' })
  ];
  const byId = {};
  TG.Render.layoutLabels(s).forEach(function (L) { byId[L.id] = L; });
  const L0 = byId[s.entities[0].id], L1 = byId[s.entities[1].id], L2 = byId[s.entities[2].id], L3 = byId[s.entities[3].id];
  if (L0.edge !== 'left') return 'truffle: ' + L0.edge;
  if (L1.edge !== 'bottom' || L1.y + L1.h !== C.GROUND_Y - 12) return 'digby: ' + L1.edge + ' bottom ' + (L1.y + L1.h);
  if (L2.edge !== 'right') return 'boulder: ' + L2.edge;
  if (L3.edge !== 'top') return 'swoop: ' + L3.edge;
  if ([L0, L1, L2, L3].some(function (L) { return L.tailX !== null; })) return 'an edge tag has a tail';
  if (L2.x + L2.w !== 382) return 'right tag at x ' + L2.x;
  if (L0.x !== 2) return 'left tag at x ' + L0.x;
});

check('a plate keeps clear of the other creatures\' sprites and of Pip', function () {
  const env = loadEnv({ art: false });
  const TG = env.TG;
  const s = handState(TG, 'playing');
  // A bee hovering right above a snail at the right edge, and a hoppet about to reach Pip.
  s.entities = [entity(TG, s, 'dawdle', 'dandelion', 270, 0), entity(TG, s, 'buzzle', 'grape', 262, 18), entity(TG, s, 'hoppet', 'kiwi', 13, 0)];
  const labels = TG.Render.layoutLabels(s);
  const camX = s.camera.x;
  for (const L of labels) {
    for (const e of s.entities) {
      if (e.id === L.id) continue;
      const box = { x: Math.floor(e.x - camX - e.w / 2), y: Math.floor(e.y - e.h), w: e.w, h: e.h };
      if (rectsOverlap(L, box)) return L.text + ' covers the ' + e.kind;
    }
    const pip = { x: 96 - 8, y: 160, w: 16, h: 24 };
    if (rectsOverlap(L, pip)) return L.text + ' covers Pip';
  }
});

check('random scenes of up to 6 typables: plates never overlap and never leave the playfield', function () {
  const env = loadEnv({ art: false });
  const TG = env.TG;
  const rng = TG.RNG.create(77);
  const kinds = ['boulder', 'dawdle', 'hoppet', 'buzzle', 'swoop', 'truffle', 'digby', 'crate'];
  const words = ['ab', 'cedar', 'fjords', 'glimpses', 'hibernated', 'ivy', 'jumbo', 'kraken', 'lollipop', 'mo'];
  for (let n = 0; n < 1500; n++) {
    const s = handState(TG, 'playing', { arena: n % 5 === 0 });
    s.entities = [];
    const count = 1 + rng.int(0, 5);
    const used = {};
    for (let k = 0; k < count; k++) {
      let w = rng.pick(words);
      while (used[w.charAt(0)]) w = rng.pick(words);
      used[w.charAt(0)] = true;
      const kind = rng.pick(kinds);
      s.entities.push(entity(TG, s, kind, w, rng.int(-120, 320), kind === 'digby' ? rng.int(-16, 0) : rng.int(0, 200), { eta: rng.next() * 6 }));
    }
    if (rng.chance(0.5)) s.typing.target = rng.pick(s.entities);
    const p = labelProblems(s, TG.Render.layoutLabels(s));
    if (p) return 'scene ' + n + ': ' + p;
  }
});

check('plates stay legible over every palette: the plate box shows only INK, its letter colours and its border', function () {
  const env = loadEnv();
  const TG = env.TG;
  const pal = paletteSet(TG);
  const allowed = [0, 4, 18, 11, 3, 26, 25, 14, 2].map(function (i) { return pal[i]; });
  for (const variant of [{ section: 0 }, { section: 2 }, { arena: true }]) {
    const s = handState(TG, variant.arena ? 'boss' : 'playing', variant);
    if (variant.arena) {
      s.boss.word = null;
      s.entities = [entity(TG, s, 'rock', 'glow', 140, 60)];
    }
    s.typing.target = s.entities[0];
    s.entities[0].typed = 2;
    TG.Render.draw(s);
    const rgba = env.canvas.toRGBA();
    const labels = TG.Render.layoutLabels(s);
    for (const L of labels) {
      for (let y = L.y - 1; y < L.y + L.h + 1; y++) {
        for (let x = L.x - 1; x < L.x + L.w + 1; x++) {
          const p = pixel(rgba, 384, x, y);
          if (allowed.indexOf(p) === -1) return JSON.stringify(variant) + ': ' + L.text + ' shows ' + p + ' at ' + x + ',' + y;
        }
      }
    }
  }
});

check('the locked plate draws typed letters GOLD and raised, the next letter underlined in AQUA, the rest WHITE', function () {
  const env = loadEnv();
  const TG = env.TG;
  const pal = paletteSet(TG);
  const s = handState(TG, 'playing');
  s.entities = [entity(TG, s, 'dawdle', 'river', 150, 0)];
  s.entities[0].typed = 2;
  s.typing.target = s.entities[0];
  TG.Render.draw(s);
  const rgba = env.canvas.toRGBA();
  const L = TG.Render.layoutLabels(s)[0];
  const colorsIn = function (x0, y0, x1, y1) {
    const set = {};
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set[pixel(rgba, 384, x, y)] = true;
    return set;
  };
  // Letter 0 (typed): GOLD in rows y .. y+6 (raised 1 px), nothing in row y+7.
  const typed = colorsIn(L.x + 1, L.y, L.x + 7, L.y + 6);
  if (!typed[pal[18]]) return 'typed letter not GOLD';
  const below = colorsIn(L.x + 1, L.y + 7, L.x + 7, L.y + 7);
  if (below[pal[18]]) return 'typed letter not raised';
  // Letter 2 (next): WHITE, underline AQUA on row y+9.
  if (!colorsIn(L.x + 17, L.y + 1, L.x + 23, L.y + 7)[pal[4]]) return 'next letter not WHITE';
  const under = colorsIn(L.x + 17, L.y + 9, L.x + 23, L.y + 9);
  if (!under[pal[11]]) return 'no AQUA underline';
  // GOLD border 2 px outside the plate box.
  if (pixel(rgba, 384, L.x + 5, L.y - 2) !== pal[18]) return 'no GOLD border';
});

// ---------------------------------------------------------------------------------------------
// 4. TG.Effects (CONTRACT 4.17)
// ---------------------------------------------------------------------------------------------

// A payload for every event of CONTRACT section 8.
function payloads(TG, s) {
  const e = s.entities[1];
  const bossWord = { id: 999, kind: 'core', word: 'monocle', typable: true, typed: 7, x: s.player.x + 200, y: 152 };
  return {
    'type:hit': { target: e, id: e.id, kind: e.kind, ch: 'r', index: 1, length: 5, complete: false, x: e.x, y: e.y },
    'type:miss': { target: e, id: e.id, ch: 'q', expected: 'i', repeat: 1, x: e.x, y: e.y },
    'target:lock': { target: e, id: e.id, kind: e.kind, x: e.x, y: e.y },
    'target:release': { target: e, id: e.id, reason: 'backspace' },
    'streak:change': { cleanRun: 3, mult: 2, previousMult: 1 },
    'streak:milestone': { kind: 'keys', value: 25 },
    'screen:change': { from: 'playing', to: 'paused', data: null },
    'level:start': { levelId: 1, difficulty: 'medium', name: 'QUILL MEADOWS', continued: false, music: { level: 'level1', boss: 'boss1' } },
    'word:clear': { id: e.id, type: 'threat', kind: 'dawdle', family: 'twang', from: 'right', word: 'river', x: e.x, y: e.y, w: 16, h: 16,
      score: 150, mult: 1, clean: true, quick: false, close: false, cause: 'typed', power: null },
    'score:add': { points: 1000, total: 5210, reason: 'core', x: s.player.x + 200, y: 152 },
    'life:gain': { lives: 5, cause: 'cap' },
    'life:lost': { lives: 3, cause: { type: 'threat', kind: 'hoppet', id: 5, from: 'right' } },
    'shield:gain': { charges: 1, cause: 'crate' },
    'shield:break': { charges: 0, x: s.player.x, y: s.player.y },
    'pickup:power': { power: 'blast', x: s.player.x + 50, y: 84 },
    'power:start': { power: 'hourglass', duration: 6 },
    'power:end': { power: 'hourglass' },
    'tutor:prompt': { id: e.id, word: 'river' },
    'tutor:end': { id: e.id },
    'assist:change': { assist: 1, target: 0.9 },
    'game:over': { checkpoint: 1, score: 4000 },
    'game:continue': { checkpoint: 1, continues: 1, assist: 0.85 },
    'level:clear': { result: { cleared: true } },
    'run:end': { result: { cleared: false } },
    'hero:jump': { x: s.player.x, y: s.player.y },
    'hero:land': { x: s.player.x, y: s.player.y },
    'hero:duck': { x: s.player.x, y: s.player.y },
    'hero:hurt': { x: s.player.x, y: s.player.y, cause: { type: 'hazard', kind: 'bramble', id: 'h2', from: null } },
    'hero:fall': { x: s.player.x, gapId: 'h1' },
    'hero:rescue': { x: s.player.x, y: s.player.y },
    'pickup:ink': { x: s.player.x, y: 180, ink: 43, inkTotal: 43 },
    'threat:spawn': { entity: e, id: e.id, type: 'threat', kind: e.kind, from: 'right', word: e.word },
    'threat:warn': { id: e.id, kind: e.kind, from: 'behind' },
    'threat:enter': { id: e.id, kind: e.kind, from: 'right' },
    'threat:urgent': { id: e.id, kind: e.kind },
    'threat:hit': { id: e.id, kind: 'hoppet', word: 'frog', typed: 1, x: s.player.x + 13, y: s.player.y },
    'threat:bounce': { id: e.id, kind: 'truffle', x: s.player.x - 13, y: s.player.y },
    'threat:escape': { id: e.id, kind: e.kind, type: 'threat', reason: 'flee' },
    'hazard:hit': { id: 'h2', kind: 'bramble', x: s.player.x, y: s.player.y },
    'attack:spawn': { id: 77, kind: 'shock', action: 'jump' },
    'section:enter': { index: 1, name: 'ORCHARD BROOK', stage: '1-2', palette: 'day', music: { transpose: 0, tempo: 150 } },
    'checkpoint': { index: 1, x: 4096, wpm: 28.4, accuracy: 0.962, bonus: 1000, lives: 4 },
    'hazard:cue': { id: 'h1', kind: 'gap', action: 'jump', hold: false, sound: true, prompt: true },
    'hazard:bridge': { id: 'h1', x: s.player.x + 60, w: 32 },
    'boss:warning': {},
    'boss:enter': {},
    'boss:state': { state: 'volley', phase: 1, round: 1 },
    'boss:attack': { kind: 'shock', telegraph: 1.0 },
    'boss:throw': { kind: 'rock', x: s.player.x + 190, y: 144 },
    'boss:weakopen': { id: 999, word: 'monocle', window: 6.3 },
    'boss:weakclose': { completed: false },
    'boss:hit': { health: 2, maxHealth: 6, phase: 2, x: s.player.x + 200, y: 152 },
    'boss:phase': { phase: 3 },
    'boss:finisher': { id: 1000, word: 'tremendous' },
    'boss:defeat': { x: s.player.x + 200, y: 184 },
    'ui:move': {}, 'ui:select': {}, 'ui:back': {}, 'ui:count': { n: 3, high: true }, 'ui:tally': {}, 'ui:stamp': { rank: 'A' },
    'ui:letter': { index: 2 },
    // A completed boss word (CONTRACT 4.16): type:hit with complete true and kind core.
    '_core': { target: bossWord, id: 999, kind: 'core', ch: 'e', index: 6, length: 7, complete: true, x: bossWord.x, y: bossWord.y }
  };
}

function withGame(TG, s) {
  // A stand-in for TG.Game when game.js is not loaded, so that effects read the hand-built camera and Pip.
  if (!TG.Game) TG.Game = { state: s };
  else TG.Game.state = s;
}

check('every event of section 8 has a payload here, and emitting each one does not throw', function () {
  const env = loadEnv();
  const TG = env.TG;
  const s = handState(TG, 'playing');
  withGame(TG, s);
  const p = payloads(TG, s);
  const missing = TG.Events.NAMES.filter(function (n) { return !(n in p); });
  if (missing.length) return 'no payload for ' + missing.join(', ');
  for (const name of TG.Events.NAMES) {
    TG.Events.emit(name, p[name]);
    for (let i = 0; i < 5; i++) { TG.Effects.update(1 / 60); TG.Hud.update(1 / 60, s); }
    TG.Render.draw(s);
  }
  for (let i = 0; i < 400; i++) { TG.Effects.update(1 / 60); TG.Hud.update(1 / 60, s); if (i % 20 === 0) TG.Render.draw(s); }
  if (env.errors.length) return 'console.error: ' + env.errors[0];
});

check('Effects.count() never exceeds 256 after 1,000 word:clear events, and is 0 after level:start', function () {
  const env = loadEnv();
  const TG = env.TG;
  const s = handState(TG, 'playing');
  withGame(TG, s);
  const p = payloads(TG, s);
  let most = 0;
  for (let i = 0; i < 1000; i++) {
    const clear = Object.assign({}, p['word:clear'], { id: 5000 + i, kind: ['boulder', 'hoppet', 'buzzle', 'crate', 'rock', 'digby', 'swoop', 'truffle', 'dawdle'][i % 9],
      word: 'hibernated', type: i % 9 === 3 ? 'crate' : 'threat', power: i % 9 === 3 ? 'shield' : null, cause: i % 7 ? 'typed' : 'blast' });
    TG.Events.emit('word:clear', clear);
    most = Math.max(most, TG.Effects.count());
    TG.Effects.update(1 / 60);
    most = Math.max(most, TG.Effects.count());
  }
  if (most > 256) return 'count reached ' + most;
  if (most < 200) return 'the pool never filled (' + most + '), so the limit was not tested';
  TG.Render.draw(s);
  TG.Events.emit('level:start', p['level:start']);
  if (TG.Effects.count() !== 0) return 'after level:start: ' + TG.Effects.count();
  if (env.errors.length) return env.errors[0];
});

check('a word:clear with x beyond the right edge of the view creates effects whose screen x is at most 376', function () {
  const env = loadEnv();
  const TG = env.TG;
  const s = handState(TG, 'playing');
  withGame(TG, s);
  const p = payloads(TG, s);
  TG.Events.emit('word:clear', Object.assign({}, p['word:clear'], { kind: 'boulder', family: 'crunch', w: 24, h: 32, x: s.camera.x + 460 }));
  for (let step = 0; step < 90; step++) {
    const list = TG.Effects._list();
    if (step === 0 && list.length === 0) return 'no effects';
    for (const f of list) {
      if (f.type === 'letter' || f.type === 'text' || f.type === 'part') continue;
      if (f.x > 376) return f.type + ' at screen x ' + f.x.toFixed(1) + ' at step ' + step;
    }
    if (step === 0) {
      const clear = list.filter(function (f) { return f.type === 'clear'; })[0];
      if (!clear || clear.x > 376) return 'the clear sequence is not clamped';
    }
    TG.Effects.update(1 / 60);
  }
  // And the clear of a hoppet far beyond the edge is painted inside the view, next to the right edge.
  const env2 = loadEnv();
  const T2 = env2.TG;
  const s2 = handState(T2, 'playing');
  withGame(T2, s2);
  T2.Events.emit('word:clear', Object.assign({}, p['word:clear'], { kind: 'hoppet', x: s2.camera.x + 700, y: 184 }));
  const ctx = env2.canvas.getContext('2d');
  ctx.clearRect(0, 0, 384, 216);
  T2.Effects.draw(ctx, 'world', s2.camera.x);
  const rgba = env2.canvas.toRGBA();
  let seen = false;
  for (let y = 24; y < 184; y++) for (let x = 360; x < 384; x++) if (pixel(rgba, 384, x, y)) seen = true;
  if (!seen) return 'the clear is not painted at the right edge';
});

check('type:hit with complete true and kind core creates letter particles; the same event with kind hoppet creates none', function () {
  const env = loadEnv();
  const TG = env.TG;
  const s = handState(TG, 'boss');
  withGame(TG, s);
  const p = payloads(TG, s);
  TG.Events.emit('type:hit', p._core);
  const letters = TG.Effects._list().filter(function (f) { return f.type === 'letter'; });
  if (letters.length !== 7) return letters.length + ' letter particles for MONOCLE';
  if (!TG.Effects._list().some(function (f) { return f.type === 'bolt'; })) return 'no ink bolt to the Baron';
  TG.Effects.reset();
  TG.Events.emit('type:hit', Object.assign({}, p._core, { kind: 'hoppet', target: s.entities[0], id: s.entities[0].id }));
  const again = TG.Effects._list().filter(function (f) { return f.type === 'letter'; });
  if (again.length !== 0) return again.length + ' letter particles for a hoppet';
});

check('the letters of a cleared word stay under the plates and the popups in the playfield, and go over the HUD above it', function () {
  const env = loadEnv();
  const TG = env.TG;
  const s = handState(TG, 'playing');
  withGame(TG, s);
  const p = payloads(TG, s);
  const word = String(p['word:clear'].word).toUpperCase();
  TG.Events.emit('word:clear', Object.assign({}, p['word:clear'], { clean: true, quick: true }));
  const ctx = env.canvas.getContext('2d');
  const calls = [];
  const glyph = TG.Font.drawGlyph, draw = TG.Font.draw;
  TG.Font.drawGlyph = function (c, ch, x, y) { calls.push({ kind: 'glyph', ch: ch, y: y }); return glyph.apply(TG.Font, arguments); };
  TG.Font.draw = function (c, str, x, y) { calls.push({ kind: 'text', str: String(str), y: y }); return draw.apply(TG.Font, arguments); };
  let lowSeen = false, highSeen = false, popupOrder = false;
  try {
    for (let step = 0; step < 70; step++) {
      TG.Effects.update(1 / 60);
      const letters = TG.Effects._list().filter(function (f) { return f.type === 'letter'; });
      calls.length = 0;
      TG.Effects.draw(ctx, 'world', s.camera.x);
      const world = calls.slice();
      calls.length = 0;
      TG.Effects.draw(ctx, 'screen', 0);
      const screen = calls.slice();
      const isLetter = function (c) { return c.kind === 'glyph' && word.indexOf(c.ch) !== -1; };
      const low = letters.filter(function (f) { return f.y >= TG.C.PLAY_TOP; }).length;
      const high = letters.length - low;
      // In the playfield a letter is drawn with the world effects (under the plates, which come later).
      if (world.filter(isLetter).length < low) return 'step ' + step + ': ' + low + ' letters in the playfield, ' + world.filter(isLetter).length + ' drawn in the world pass';
      if (screen.some(function (c) { return isLetter(c) && c.y >= TG.C.PLAY_TOP; })) return 'step ' + step + ': a letter in the playfield drawn over the HUD';
      if (high && screen.filter(isLetter).length < high) return 'step ' + step + ': letters above the playfield not drawn over the HUD';
      if (low) lowSeen = true;
      if (high) highSeen = true;
      // Popups (+points, SUPER) come after the letters in the world pass, so they are drawn over them.
      const firstText = world.findIndex(function (c) { return c.kind === 'text'; });
      const lastLetter = world.map(isLetter).lastIndexOf(true);
      if (firstText !== -1 && lastLetter !== -1) {
        if (lastLetter > firstText) return 'step ' + step + ': a letter drawn over a popup';
        popupOrder = true;
      }
    }
  } finally {
    TG.Font.drawGlyph = glyph;
    TG.Font.draw = draw;
  }
  if (!lowSeen || !highSeen) return 'letters low ' + lowSeen + ', high ' + highSeen;
  if (!popupOrder) return 'never saw a popup and letters together';
});

check('word:clear plays the universal clear: ink bolt, clear sequence, one letter particle per letter, a score popup', function () {
  const env = loadEnv();
  const TG = env.TG;
  const s = handState(TG, 'playing');
  withGame(TG, s);
  const p = payloads(TG, s);
  TG.Events.emit('word:clear', p['word:clear']);
  const list = TG.Effects._list();
  const count = function (type) { return list.filter(function (f) { return f.type === type; }).length; };
  if (count('bolt') !== 1 || count('clear') !== 1 || count('letter') !== 5 || count('text') < 1) {
    return 'bolt ' + count('bolt') + ', clear ' + count('clear') + ', letters ' + count('letter') + ', text ' + count('text');
  }
  // Every kind plays to its end without errors.
  for (const kind of ['boulder', 'dawdle', 'hoppet', 'buzzle', 'swoop', 'truffle', 'digby', 'rock', 'crate']) {
    TG.Events.emit('word:clear', Object.assign({}, p['word:clear'], { kind: kind, type: kind === 'crate' ? 'crate' : 'threat', power: kind === 'crate' ? 'quill' : null }));
  }
  TG.Events.emit('word:clear', Object.assign({}, p['word:clear'], { kind: 'digby', y: 200 }));
  for (let i = 0; i < 240; i++) { TG.Effects.update(1 / 60); if (i % 3 === 0) TG.Render.draw(s); }
  if (env.errors.length) return env.errors[0];
});

check('label(id): a correct key raises the letter, flashes the sprite white and makes it flinch; a wrong key shakes the plate with a RED border and blinks the letter', function () {
  const env = loadEnv({ art: false });
  const TG = env.TG;
  const s = handState(TG, 'playing');
  withGame(TG, s);
  const p = payloads(TG, s);
  const id = s.entities[1].id;
  if (TG.Effects.label(id) !== null) return 'a label before any event';
  TG.Events.emit('type:hit', p['type:hit']);
  let L = TG.Effects.label(id);
  if (!L || L.hopIndex !== 1 || L.white !== true || !(L.flinch > 0) || L.border !== null || L.blink) return 'after hit ' + JSON.stringify(L);
  if (!TG.Effects.casting()) return 'not casting after a correct key';
  for (let i = 0; i < 7; i++) TG.Effects.update(1 / 60);
  if (TG.Effects.casting()) return 'still casting after 0.1 s';
  TG.Events.emit('type:miss', p['type:miss']);
  L = TG.Effects.label(id);
  if (!L || L.border !== 25 || Math.abs(L.shakeX) !== 2 || !L.blink) return 'after miss ' + JSON.stringify(L);
  for (let i = 0; i < 10; i++) TG.Effects.update(1 / 60);
  L = TG.Effects.label(id);
  if (!L || L.border !== null || L.shakeX !== 0 || !L.blink) return 'after 0.17 s ' + JSON.stringify(L);
  TG.Events.emit('type:hit', p['type:hit']);
  if (TG.Effects.label(id).blink) return 'the blink does not stop on the next correct key';
  for (let i = 0; i < 120; i++) TG.Effects.update(1 / 60);
  if (TG.Effects.label(id) !== null) return 'the label does not end';
});

check('with reduceFlash set, shake() is zero and flash() is null after life:lost and after an ink blast', function () {
  const env = loadEnv({ art: false });
  const TG = env.TG;
  const s = handState(TG, 'playing');
  withGame(TG, s);
  const p = payloads(TG, s);
  TG.Events.emit('life:lost', p['life:lost']);
  TG.Effects.update(1 / 60);
  const sh = TG.Effects.shake();
  if (sh.x === 0 && sh.y === 0) return 'no shake without reduceFlash';
  TG.Events.emit('pickup:power', p['pickup:power']);
  if (TG.Effects.flash() === null) return 'no flash without reduceFlash';
  TG.Save.setSetting('reduceFlash', true);
  TG.Effects.reset();
  TG.Events.emit('life:lost', p['life:lost']);
  TG.Effects.update(1 / 60);
  const z = TG.Effects.shake();
  if (z.x !== 0 || z.y !== 0) return 'shake ' + JSON.stringify(z);
  TG.Events.emit('pickup:power', p['pickup:power']);
  if (TG.Effects.flash() !== null) return 'flash ' + TG.Effects.flash();
  for (let i = 0; i < 30; i++) {
    TG.Effects.update(1 / 60);
    if (TG.Effects.flash() !== null) return 'flash during the effect';
  }
});

check('flashes last at most 2 frames and at most 3 start in any second (DESIGN 14.6)', function () {
  const env = loadEnv({ art: false });
  const TG = env.TG;
  const s = handState(TG, 'playing');
  withGame(TG, s);
  const p = payloads(TG, s);
  let started = 0, run = 0, longest = 0;
  for (let i = 0; i < 60; i++) {
    TG.Events.emit('pickup:power', p['pickup:power']);
    if (TG.Effects.flash() !== null) {
      if (run === 0) started++;
      run++;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
    TG.Effects.update(1 / 60);
  }
  if (started > 3) return started + ' flashes in one second';
  if (longest > 2) return 'a flash of ' + longest + ' frames';
});

check('shake follows DESIGN 14.6: 3 px for a hit (0.25 s), 1 px for a word clear', function () {
  const env = loadEnv({ art: false });
  const TG = env.TG;
  const s = handState(TG, 'playing');
  withGame(TG, s);
  const p = payloads(TG, s);
  TG.Events.emit('life:lost', p['life:lost']);
  let most = 0, frames = 0;
  for (let i = 0; i < 30; i++) {
    TG.Effects.update(1 / 60);
    const sh = TG.Effects.shake();
    const m = Math.max(Math.abs(sh.x), Math.abs(sh.y));
    most = Math.max(most, m);
    if (m > 0) frames++;
  }
  if (most !== 3) return 'hit shake ' + most;
  if (frames < 13 || frames > 16) return 'hit shake lasted ' + frames + ' frames';
  TG.Effects.reset();
  TG.Events.emit('word:clear', p['word:clear']);
  TG.Effects.update(1 / 60);
  const w = TG.Effects.shake();
  if (Math.max(Math.abs(w.x), Math.abs(w.y)) !== 1) return 'word clear shake ' + JSON.stringify(w);
});

check('Effects without TG.Game, TG.Gfx or TG.Font: events and drawing do not throw', function () {
  const env = stubs.load({ files: ['js/core.js'].concat(WPF_FILES), canvas: 'soft' });
  const TG = env.TG;
  TG.Events.clear();
  TG.Effects.init();
  TG.Hud.init();
  TG.Render.init(env.canvas);
  const s = handState(TG, 'playing');
  const p = payloads(TG, s);
  TG.Events.NAMES.forEach(function (n) { TG.Events.emit(n, p[n]); });
  for (let i = 0; i < 60; i++) TG.Effects.update(1 / 60);
  TG.Render.draw(s);
  TG.Effects.draw(env.canvas.getContext('2d'), 'world', 0);
  TG.Effects.draw(env.canvas.getContext('2d'), 'screen', 0);
  if (env.errors.length) return env.errors[0];
});

// ---------------------------------------------------------------------------------------------
// 5. TG.Hud (CONTRACT 4.18, DESIGN 13)
// ---------------------------------------------------------------------------------------------

check('keyGuideOn: the setting on and off win; auto follows config.keyGuide', function () {
  const env = loadEnv({ art: false });
  const TG = env.TG;
  const s = handState(TG, 'playing');
  s.config = TG.Difficulty.get('easy');
  if (TG.Hud.keyGuideOn(s) !== true) return 'auto on easy';
  s.config = TG.Difficulty.get('hard');
  if (TG.Hud.keyGuideOn(s) !== false) return 'auto on hard';
  TG.Save.setSetting('keyGuide', 'on');
  if (TG.Hud.keyGuideOn(s) !== true) return 'on';
  TG.Save.setSetting('keyGuide', 'off');
  s.config = TG.Difficulty.get('easy');
  if (TG.Hud.keyGuideOn(s) !== false) return 'off';
});

check('the top bar follows DESIGN 13.2: INK bar, SILVER labels at y 2, WHITE values at y 10, power slot at (364, 1)', function () {
  const env = loadEnv();
  const TG = env.TG;
  const pal = paletteSet(TG);
  const s = handState(TG, 'playing');
  TG.Render.draw(s);
  const rgba = env.canvas.toRGBA();
  const colorsIn = function (x0, y0, x1, y1) {
    const set = {};
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set[pixel(rgba, 384, x, y)] = true;
    return set;
  };
  const labels = { SCORE: 4, PIP: 68, INK: 120, WPM: 160, ACC: 196, COMBO: 240, STAGE: 300 };
  for (const k of Object.keys(labels)) {
    const set = colorsIn(labels[k], 2, labels[k] + 8 * k.length - 1, 8);
    if (!set[pal[3]]) return k + ' label is not SILVER at x ' + labels[k];
  }
  // The shield icons follow the lives under PIP; there is no SH label over them.
  if (colorsIn(96, 2, 111, 8)[pal[3]]) return 'a label over the shield icons';
  if (!colorsIn(96, 10, 111, 17)[pal[11]]) return 'no shield icons after the lives';
  if (!colorsIn(4, 10, 59, 16)[pal[4]]) return 'score value not WHITE';
  if (pixel(rgba, 384, 364, 1) !== pal[0] || pixel(rgba, 384, 366, 2) !== pal[3]) return 'power slot frame';
  if (pixel(rgba, 384, 0, 19) !== pal[0]) return 'top bar not INK at y 19';
  // Hourglass active, half its time left: the gauge beside the slot (x 381, y 2 to 15) is AQUA in its
  // lower half and SHADOW above; nothing beside the crown at y 18.
  if (pixel(rgba, 384, 381, 15) !== pal[11] || pixel(rgba, 384, 382, 9) !== pal[11]) return 'timer gauge not filled from the bottom';
  if (pixel(rgba, 384, 381, 2) !== pal[1]) return 'timer gauge track';
  if (pixel(rgba, 384, 364, 18) !== pal[0]) return 'something drawn beside the crown at (364, 18)';
  // Progress strip: SHADOW track and GOLD fill at y 20 to 22.
  const strip = colorsIn(4, 20, 350, 22);
  if (!strip[pal[1]] || !strip[pal[18]]) return 'progress strip';
});

check('COMBO shows the multiplier and one pip per clean word of its step; the empty power slot is dimmed', function () {
  const env = loadEnv();
  const TG = env.TG;
  const pal = paletteSet(TG);
  const s = handState(TG, 'playing');
  // x2 (clean run 3 to 5): three pips, none filled at a clean run of 3.
  TG.Render.draw(s);
  let rgba = env.canvas.toRGBA();
  const pips = function () {
    const out = [];
    for (let k = 0; k < 5; k++) out.push(pixel(rgba, 384, 259 + 4 * k, 13));
    return out;
  };
  let p = pips();
  if (!(p[0] === pal[1] && p[1] === pal[1] && p[2] === pal[1] && p[3] === pal[0])) return 'x2 at clean run 3: ' + p.join(' ');
  s.typing.stats.cleanRun = 5;
  TG.Render.draw(s);
  rgba = env.canvas.toRGBA();
  p = pips();
  if (!(p[0] === pal[19] && p[1] === pal[19] && p[2] === pal[1])) return 'x2 at clean run 5: ' + p.join(' ');
  s.typing.stats.cleanRun = 12;
  s.typing.stats.mult = 4;
  TG.Render.draw(s);
  rgba = env.canvas.toRGBA();
  p = pips();
  if (!(p[1] === pal[19] && p[2] === pal[1] && p[4] === pal[1])) return 'x4 at clean run 12: ' + p.join(' ');
  s.typing.stats.cleanRun = 20;
  s.typing.stats.mult = 5;
  TG.Render.draw(s);
  rgba = env.canvas.toRGBA();
  if (pips().some(function (c) { return c !== pal[19]; })) return 'x5: every pip filled: ' + pips().join(' ');
  // No timed power: the slot frame is dimmed and there is no gauge.
  s.power = { shield: 0, slowT: 0, quillT: 0, last: null };
  TG.Render.draw(s);
  rgba = env.canvas.toRGBA();
  if (pixel(rgba, 384, 366, 2) === pal[3]) return 'empty slot not dimmed';
  if (pixel(rgba, 384, 381, 15) !== pal[0]) return 'a gauge without a timed power';
});

check('the boss bar follows DESIGN 13.3: BARON at x 232, bar from x 280 to 376, y 24 to 29, RED and SHADOW segments', function () {
  const env = loadEnv();
  const TG = env.TG;
  const pal = paletteSet(TG);
  const s = handState(TG, 'boss');
  TG.Render.draw(s);
  const rgba = env.canvas.toRGBA();
  if (pixel(rgba, 384, 281, 26) !== pal[25]) return 'first segment ' + pixel(rgba, 384, 281, 26);
  if (pixel(rgba, 384, 281, 24) !== pal[26]) return 'no CORAL highlight';
  if (pixel(rgba, 384, 370, 26) !== pal[1]) return 'lost segment ' + pixel(rgba, 384, 370, 26);
  let white = false;
  for (let x = 232; x < 272; x++) for (let y = 23; y < 30; y++) if (pixel(rgba, 384, x, y) === pal[4]) white = true;
  if (!white) return 'no BARON label';
  // The boss plate: the weak-point word at 2x, centred at x 192 with its top at y 34.
  const w = 16 * 7 + 6, x0 = Math.floor(192 - w / 2);
  if (pixel(rgba, 384, x0 + 2, 36) !== pal[0] || pixel(rgba, 384, x0 - 1, 40) !== pal[4]) return 'boss plate';
});

check('the type bar mirrors the locked word at 2x, and at 1x for more than 10 letters; empty without a lock', function () {
  const env = loadEnv();
  const TG = env.TG;
  const pal = paletteSet(TG);
  const s = handState(TG, 'playing');
  TG.Render.draw(s);
  let rgba = env.canvas.toRGBA();
  if (pixel(rgba, 384, 192, 194) === pal[18]) return 'a type bar with nothing locked';
  s.typing.target = s.entities[1];
  s.entities[1].typed = 2;
  TG.Render.draw(s);
  rgba = env.canvas.toRGBA();
  const w = 16 * 5 + 6, x0 = Math.floor(192 - w / 2);
  if (pixel(rgba, 384, x0 + 10, 194) !== pal[18]) return 'no GOLD border at the top of the type bar';
  let gold = 0;
  for (let y = 195; y < 214; y++) for (let x = x0; x < x0 + 36; x++) if (pixel(rgba, 384, x, y) === pal[18]) gold++;
  if (gold < 40) return 'typed letters not GOLD at 2x (' + gold + ')';
  s.entities[1].word = 'hibernation';
  TG.Render.draw(s);
});

check('banners: one at a time, READY then GO! on level:start, the checkpoint result before the next section name', function () {
  const env = loadEnv();
  const TG = env.TG;
  const s = handState(TG, 'playing');
  const p = payloads(TG, s);
  TG.Events.emit('level:start', p['level:start']);
  TG.Events.emit('section:enter', Object.assign({}, p['section:enter'], { index: 0, name: 'MORNING MEADOW' }));
  TG.Events.emit('section:enter', p['section:enter']);
  TG.Events.emit('checkpoint', p['checkpoint']);
  TG.Hud.banner('HELLO', { seconds: 1, color: 18 });
  const seen = [];
  const draw = TG.Font.draw;
  TG.Font.draw = function (ctx, text, x, y, o) {
    if (o && o.scale === 2 && y >= 56) seen.push(String(text));
    return draw.apply(TG.Font, arguments);
  };
  for (let i = 0; i < 60 * 14; i++) {
    TG.Hud.update(1 / 60, s);
    TG.Hud.draw(env.canvas.getContext('2d'), s);
  }
  TG.Font.draw = draw;
  const order = seen.filter(function (t, i) { return i === 0 || seen[i - 1] !== t; });
  const want = ['READY', 'GO!', 'MORNING MEADOW', 'CHECKPOINT', 'ORCHARD BROOK', 'HELLO'];
  if (JSON.stringify(order) !== JSON.stringify(want)) return order.join(' > ');
});

check('Hud.update does not move anything on the paused screen', function () {
  const env = loadEnv();
  const TG = env.TG;
  const s = handState(TG, 'paused');
  TG.Hud.banner('HELLO', { seconds: 0.5 });
  const playing = handState(TG, 'playing');
  for (let i = 0; i < 10; i++) TG.Hud.update(1 / 60, playing);      // the strip is open
  for (let i = 0; i < 120; i++) TG.Hud.update(1 / 60, s);
  const seen = [];
  const draw = TG.Font.draw;
  TG.Font.draw = function (ctx, text) { seen.push(String(text)); return draw.apply(TG.Font, arguments); };
  TG.Hud.draw(env.canvas.getContext('2d'), s);
  TG.Font.draw = draw;
  if (seen.indexOf('HELLO') === -1) return 'the banner ran out while paused';
});

check('the speech plate shows in the second half of the boss intro, and the tutorial prompt while it is active', function () {
  const env = loadEnv();
  const TG = env.TG;
  const seen = [];
  const draw = TG.Font.draw;
  TG.Font.draw = function (ctx, text) { seen.push(String(text)); return draw.apply(TG.Font, arguments); };
  const s = handState(TG, 'bossIntro', { screenT: 1.0 });
  TG.Hud.draw(env.canvas.getContext('2d'), s);
  if (seen.some(function (t) { return t.indexOf('MY MEADOW') === 0; })) return 'speech in the first half';
  const t = handState(TG, 'bossIntro', { screenT: 3.5 });
  TG.Hud.draw(env.canvas.getContext('2d'), t);
  if (!seen.some(function (x) { return x === 'MY MEADOW! MY WORDS!'; })) return 'no speech in the second half';
  const u = handState(TG, 'playing');
  TG.Events.emit('tutor:prompt', { id: u.entities[0].id, word: 'ask' });
  u.tutorial.active = true;
  seen.length = 0;
  TG.Hud.draw(env.canvas.getContext('2d'), u);
  TG.Font.draw = draw;
  if (seen.indexOf('TYPE: ') === -1 || seen.indexOf('ASK') === -1) return 'no tutorial prompt: ' + seen.join('|');
});

check('after three wrong keys on the same letter the expected letter is drawn enlarged (4x) above the type bar', function () {
  const env = loadEnv();
  const TG = env.TG;
  const s = handState(TG, 'playing');
  const t = s.entities[1];
  s.typing.target = t;
  t.typed = 1;
  const scales = [];
  const glyphFn = TG.Font.drawGlyph;
  TG.Font.drawGlyph = function (ctx, ch, x, y, color, scale) {
    scales.push(scale + ':' + ch);
    return glyphFn.apply(TG.Font, arguments);
  };
  try {
    TG.Events.emit('type:miss', { target: t, id: t.id, ch: 'q', expected: 'i', repeat: 2, x: t.x, y: t.y });
    TG.Hud.draw(env.canvas.getContext('2d'), s);
    if (scales.indexOf('4:I') !== -1) return 'enlarged after two misses';
    TG.Events.emit('type:miss', { target: t, id: t.id, ch: 'q', expected: 'i', repeat: 3, x: t.x, y: t.y });
    scales.length = 0;
    TG.Hud.draw(env.canvas.getContext('2d'), s);
    if (scales.indexOf('4:I') === -1) return 'not enlarged after three: ' + scales.join(',');
    TG.Events.emit('type:hit', { target: t, id: t.id, kind: t.kind, ch: 'i', index: 1, length: 5, complete: false, x: t.x, y: t.y });
    scales.length = 0;
    TG.Hud.draw(env.canvas.getContext('2d'), s);
    if (scales.indexOf('4:I') !== -1) return 'still enlarged after a correct key';
  } finally {
    TG.Font.drawGlyph = glyphFn;
  }
});

check('the prompt line and the type bar keep clear of the key guide (x 2 to 86)', function () {
  const env = loadEnv();
  const TG = env.TG;
  const s = handState(TG, 'playing');
  s.config = TG.Difficulty.get('easy');
  s.typing.target = s.entities[1];
  s.entities[1].word = 'watermelon';
  TG.Events.emit('life:lost', { lives: 3, cause: { type: 'threat', kind: 'hoppet', id: 3, from: 'right' } });
  const boxes = [];
  const rect = TG.Gfx.rect;
  TG.Gfx.rect = function (ctx, x, y, w, h, c) {
    if (c === 0 && y >= 180 && x >= 2 && w > 30) boxes.push({ x: x, y: y, w: w, h: h });
    return rect.apply(TG.Gfx, arguments);
  };
  try {
    TG.Hud.draw(env.canvas.getContext('2d'), s);
  } finally {
    TG.Gfx.rect = rect;
  }
  const guide = boxes.filter(function (b) { return b.x === 2 && b.w === 84; });
  if (guide.length !== 1) return 'no key guide panel';
  const others = boxes.filter(function (b) { return b !== guide[0]; });
  if (others.length < 2) return 'expected the tip box and the type bar, got ' + others.length;
  const hit = others.filter(function (b) { return rectsOverlap(b, guide[0]); });
  if (hit.length) return 'overlap at x ' + hit[0].x + ' y ' + hit[0].y;
});

check('an arch hit shows the hold tip, also when a shield took it (hazard:hit); a power from a crate pops up with its How to Play name', function () {
  const env = loadEnv();
  const TG = env.TG;
  const s = handState(TG, 'playing');
  withGame(TG, s);
  const seen = [];
  const draw = TG.Font.draw;
  TG.Font.draw = function (ctx, text) { seen.push(String(text)); return draw.apply(TG.Font, arguments); };
  const ctx = env.canvas.getContext('2d');
  try {
    TG.Events.emit('hazard:hit', { id: 'h5', kind: 'branch', x: s.player.x, y: s.player.y });
    TG.Hud.draw(ctx, s);
    if (seen.some(function (t) { return t.indexOf('TIP') === 0; })) return 'a tip for a branch hit taken by a shield';
    TG.Events.emit('hazard:hit', { id: 'h5', kind: 'arch', x: s.player.x, y: s.player.y });
    seen.length = 0;
    TG.Hud.draw(ctx, s);
    if (seen.join('|').indexOf('HOLD ENTER UNDER THE ARCH') === -1) return 'no hold tip after an arch hit: ' + seen.join('|');
    TG.Hud.reset();
    TG.Events.emit('life:lost', { lives: 3, cause: { type: 'hazard', kind: 'arch', id: 'h5', from: null } });
    seen.length = 0;
    TG.Hud.draw(ctx, s);
    if (seen.join('|').indexOf('HOLD ENTER UNDER THE ARCH') === -1) return 'no hold tip after a life lost to the arch';
    // A Golden quill crate: the name that reaches Pip is the one of How to Play.
    const p = payloads(TG, s);
    TG.Events.emit('word:clear', Object.assign({}, p['word:clear'], { type: 'crate', kind: 'crate', power: 'quill' }));
    const names = [];
    for (let i = 0; i < 90; i++) {
      TG.Effects.update(1 / 60);
      seen.length = 0;
      TG.Effects.draw(ctx, 'world', s.camera.x);
      seen.forEach(function (t) { if (/QUILL/.test(t)) names.push(t); });
    }
    if (!names.length || names.some(function (t) { return t !== 'GOLDEN QUILL'; })) return 'quill popup: ' + names.slice(0, 2).join(',');
  } finally {
    TG.Font.draw = draw;
  }
});

check('the key guide lights the next key in WHITE with an INK letter, a colour no finger uses; stuck, it flashes RED', function () {
  const env = loadEnv();
  const TG = env.TG;
  const pal = paletteSet(TG);
  const s = handState(TG, 'playing');
  s.config = TG.Difficulty.get('easy');
  const t = s.entities[1];
  s.typing.target = t;
  t.word = 'watermelon';
  t.typed = 2;                                  // next letter T: top row, fifth key, x 36, y 190
  const ctx = env.canvas.getContext('2d');
  TG.Hud.draw(ctx, s);
  let rgba = env.canvas.toRGBA();
  if (pixel(rgba, 384, 35, 189) !== pal[4] || pixel(rgba, 384, 43, 197) !== pal[4]) return 'the lit key is not a WHITE block';
  if (pixel(rgba, 384, 37, 190) !== pal[0]) return 'the lit letter is not INK';
  // G, below T on the same finger, keeps its AQUA letter: the two no longer read as one block.
  let aqua = false;
  for (let x = 38; x < 46; x++) for (let y = 198; y < 205; y++) if (pixel(rgba, 384, x, y) === pal[11]) aqua = true;
  if (!aqua) return 'G below is not AQUA';
  TG.Events.emit('type:miss', { target: t, id: t.id, ch: 'q', expected: 't', repeat: 3, x: t.x, y: t.y });
  s.time = 12.625;                              // the off half of the 4 Hz blink
  TG.Hud.draw(ctx, s);
  rgba = env.canvas.toRGBA();
  if (pixel(rgba, 384, 35, 189) !== pal[25]) return 'stuck: no RED flash, ' + pixel(rgba, 384, 35, 189);
});

// ---------------------------------------------------------------------------------------------
// 6. The real simulation (when WP-E's files are present)
// ---------------------------------------------------------------------------------------------

function simulate(opts, onStep) {
  const sim = require('./sim');
  let env = null;
  const load = stubs.load;
  stubs.load = function (o) {
    env = load(Object.assign({}, o || {}, { canvas: 'soft' }));
    return env;
  };
  let problem = null;
  let steps = 0;
  try {
    const report = sim.runBot(Object.assign({}, opts, {
      setup: function (TG) {
        TG.Gfx.init(env.document);
        TG.Effects.init();
        TG.Hud.init();
        TG.Render.init(env.canvas);
        const step = TG.Game.step;
        TG.Game.step = function (dt) {
          step(dt);
          const s = TG.Game.state;
          if (s.screen !== 'paused') TG.Effects.update(dt);
          TG.Hud.update(dt, s);
          steps++;
          if (!problem) problem = onStep(TG, s, env, steps) || null;
        };
      }
    }));
    return { report: report, problem: problem, env: env, steps: steps };
  } finally {
    stubs.load = load;
  }
}

if (!SIM_PRESENT) {
  skip('bot runs with rendering on every step', 'the simulation files are not all present');
} else {
  const runs = QUICK ? [['medium', 'target', 'checkpoint1', 1]]
    : [['easy', 'target', 'results', 1], ['medium', 'target', 'results', 1], ['hard', 'target', 'results', 1], ['hard', 'floor', 'boss', 2]];
  runs.forEach(function (r) {
    check('bot run on ' + r[0] + ' (' + r[1] + ', to ' + r[2] + ') drawn on every step: no console output, plates valid, effects within 256, state unchanged by drawing', function () {
      let most = 0;
      const res = simulate({ difficulty: r[0], profile: r[1], until: r[2], seed: r[3] }, function (TG, s, env, n) {
        let before = null;
        if (n % 97 === 0) before = JSON.stringify(s, function (k, v) { return k === 'rng' || k === 'picker' ? undefined : v; });
        TG.Render.draw(s);
        if (before !== null && JSON.stringify(s, function (k, v) { return k === 'rng' || k === 'picker' ? undefined : v; }) !== before) {
          return 'drawing changed the state at step ' + n;
        }
        const p = labelProblems(s, TG.Render.layoutLabels(s));
        if (p) return 'step ' + n + ' (' + s.screen + ', t ' + s.time.toFixed(2) + '): ' + p;
        most = Math.max(most, TG.Effects.count());
        if (most > 256) return 'effects ' + most;
        return null;
      });
      if (res.problem) return res.problem;
      if (res.report.error) return res.report.error;
      if (!res.report.finished) return 'the run did not reach ' + r[2];
      if (res.env.errors.length || res.env.warnings.length) return 'console: ' + res.env.errors.concat(res.env.warnings)[0];
    });
  });

  check('drawing a real run stays within 1,500 canvas calls per frame, and canvases are made only to fill caches', function () {
    let made = 0, calls = 0, frames = 0;
    const res = simulate({ difficulty: 'medium', profile: 'target', until: 'checkpoint1', seed: 1 }, function (TG, s, env, n) {
      if (n === 1) {
        const create = env.document.createElement;
        env.document.createElement = function (tag) {
          if (String(tag).toLowerCase() === 'canvas') made++;
          return create.apply(env.document, arguments);
        };
      }
      const before = env.canvasCalls.count;
      TG.Render.draw(s);
      calls += env.canvasCalls.count - before;
      frames++;
      return null;
    });
    if (res.problem) return res.problem;
    if (calls / frames > 1500) return 'about ' + Math.round(calls / frames) + ' canvas calls per frame';
    // Every canvas is a cached sprite frame or glyph sheet: a few hundred at most over a section.
    if (made > 400) return made + ' canvases made over ' + frames + ' frames';
  });
}

check('no canvas is made per frame: once a busy, animated scene has run for 4 s, 5 s more of it make none', function () {
  const env = loadEnv();
  const TG = env.TG;
  for (const screen of ['playing', 'boss']) {
    const s = handState(TG, screen);
    withGame(TG, s);
    s.typing.target = s.entities[0];
    const frame = function () {
      s.time += 1 / 60;
      s.frame++;
      s.entities.forEach(function (e) { e.animT += 1 / 60; });
      s.player.animT += 1 / 60;
      TG.Effects.update(1 / 60);
      TG.Hud.update(1 / 60, s);
      TG.Render.draw(s);
    };
    for (let i = 0; i < 240; i++) frame();
    let made = 0;
    const create = env.document.createElement;
    env.document.createElement = function (tag) {
      if (String(tag).toLowerCase() === 'canvas') made++;
      return create.apply(env.document, arguments);
    };
    try {
      for (let i = 0; i < 300; i++) frame();
    } finally {
      env.document.createElement = create;
    }
    if (made) return screen + ': ' + made + ' canvases made';
  }
});

// ---------------------------------------------------------------------------------------------

console.log('SUMMARY passed=' + passed + ' failed=' + failed + ' skipped=' + skipped);
process.exit(failed > 0 ? 1 : 0);
