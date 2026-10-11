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
    'ui:letter': { index: 2 }, 'ui:exit': {},
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
  for (const kind of ['boulder', 'dawdle', 'hoppet', 'buzzle', 'swoop', 'truffle', 'digby', 'dangle', 'flit', 'rock', 'crate']) {
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

// --- Level 2's creatures and skins in TG.Effects (LEVEL2 4.1, 4.2 and 4.5; milestone M2) -------
//
// The payloads of word:clear, threat:hit and threat:bounce carry no skin and no turn. TG.Effects finds
// the entity they name in state.entities, where it still is while the event is handled. A case below
// that needs the entity (its own skin, a flit's turn or dive) puts one there with the payload's id, as
// the game leaves it at that moment (removed).

// The entity as TG.Entities.remove leaves it. The game marks it dead before it emits word:clear, threat:hit
// or threat:bounce (js/game.js, js/entities.js), and it stays in state.entities to the end of the update.
function removed(e, reason) {
  e.dead = true;
  e.reason = reason;
  e.typable = false;
  e.urgent = false;
  if (reason !== 'cleared') e.lost = true;
  return e;
}

// The sprite of each kind, and its box where it is not 16 x 16.
const KIND_SPRITES = { boulder: 'en_boulder', dawdle: 'en_dawdle', hoppet: 'en_hoppet', buzzle: 'en_buzzle', swoop: 'en_swoop',
  truffle: 'en_truffle', digby: 'en_digby', dangle: 'en_dangle', flit: 'en_flit', rock: 'pr_rock', crate: 'crate_balloon' };
const KIND_BOXES = { boulder: [24, 32], swoop: [24, 16], truffle: [24, 16], flit: [24, 16], rock: [12, 12], crate: [16, 32] };

// A word:clear payload (CONTRACT 8.2) for a creature at screen x `sx` with the bottom of its sprite at y.
let clearId = 7000;
function clearOf(s, kind, sx, y) {
  const box = KIND_BOXES[kind] || [16, 16];
  return { id: clearId++, type: kind === 'crate' ? 'crate' : 'threat', kind: kind, family: 'pop', from: 'right', word: 'gear',
    x: s.camera.x + sx, y: y, w: box[0], h: box[1], score: 100, mult: 1, clean: false, quick: false, close: false,
    cause: 'typed', power: kind === 'crate' ? 'shield' : null };
}

// What one TG.Effects.draw of the world draws: every sprite, and every 1 px wide SILVER run. Only the
// dangle's thread is one.
function effectsPicture(TG, env, s) {
  const threads = [];
  const rect = TG.Gfx.rect;
  TG.Gfx.rect = function (ctx, x, y, w, h, c) {
    if (w === 1 && c === 3) threads.push({ x: x, y: y, h: h });
    return rect.apply(TG.Gfx, arguments);
  };
  try {
    const sprites = drawCalls(TG, function () { TG.Effects.draw(env.canvas.getContext('2d'), 'world', s.camera.x); });
    return { sprites: sprites, threads: threads };
  } finally {
    TG.Gfx.rect = rect;
  }
}

// The live fx_star particles, in screen px.
function starsOf(TG) {
  return TG.Effects._list().filter(function (f) { return f.type === 'part' && f.kind === 'fx_star'; });
}

// A list as its runs: ['a', 'a', 'b'] gives [['a', 2], ['b', 1]].
function runsOf(list) {
  const out = [];
  list.forEach(function (v) {
    if (out.length && out[out.length - 1][0] === v) out[out.length - 1][1]++;
    else out.push([v, 1]);
  });
  return out;
}

// The runs must be these looks in this order, each for its number of steps, give or take one. A number
// that is null is not asked.
function runsProblem(looks, want) {
  const got = runsOf(looks);
  const same = got.length === want.length && got.every(function (r, i) {
    return r[0] === want[i][0] && (want[i][1] === null || Math.abs(r[1] - want[i][1]) <= 1);
  });
  return same ? null : 'it is drawn as ' + got.map(function (r) { return r[0] + ' x ' + r[1]; }).join(', ');
}

check('a cleared dangle hangs on its thread through the ink bolt and the white flash, then is drawn up the thread in its zip frame, faster as it goes, and out through the top; two fx_star stay where it hung (LEVEL2 4.2)', function () {
  const env = loadEnv();
  const TG = env.TG;
  const C = TG.C;
  const s = handState(TG, 'playing');
  s.entities = [];
  withGame(TG, s);
  const sx = 200, y = C.GROUND_Y - C.DANGLE_ELEV;
  TG.Events.emit('word:clear', clearOf(s, 'dangle', sx, y));
  const looks = [], zip = [];
  let twinkles = 0;
  for (let i = 0; i < 50; i++) {
    const pic = effectsPicture(TG, env, s);
    const d = named(pic.sprites, 'en_dangle');
    const stars = starsOf(TG);
    // The twinkles are fx_star as it is, with no remap.
    const drawn = named(pic.sprites, 'fx_star');
    twinkles += drawn.length;
    if (drawn.some(function (c) { return c.remap !== null; })) return 'step ' + i + ': a star is drawn under a remap: ' + JSON.stringify(drawn);
    if (d.length > 1) return 'step ' + i + ': ' + d.length + ' dangles';
    if (!d.length) {
      if (pic.threads.length) return 'step ' + i + ': a thread and no dangle';
      looks.push('gone');
    } else {
      const c = d[0];
      looks.push(c.remap === 'white' ? 'white' : c.frame);
      if (c.x !== sx || c.flipX || (c.remap !== null && c.remap !== 'white')) return 'step ' + i + ': ' + JSON.stringify(c);
      // The thread: from the top of the playfield to the top of the sprite, at the x of its anchor.
      const top = c.y - 16;
      const want = top > C.PLAY_TOP ? [{ x: sx, y: C.PLAY_TOP, h: top - C.PLAY_TOP }] : [];
      if (JSON.stringify(pic.threads) !== JSON.stringify(want)) return 'step ' + i + ': thread ' + JSON.stringify(pic.threads) + ', want ' + JSON.stringify(want);
      if (c.frame === 'zip') zip.push(c.y);
      else if (c.y !== y || stars.length) return 'step ' + i + ': before the thread snaps it is at y ' + c.y + ' with ' + stars.length + ' stars';
    }
    // The two twinkles are there from the snap, each within 8 px of the middle of where it hung, and stay.
    if (zip.length) {
      if (stars.length > 2 || (zip.length < 10 && stars.length !== 2)) return 'step ' + i + ': ' + stars.length + ' stars';
      for (const st of stars) {
        if (Math.abs(st.x - sx) > 8 || Math.abs(st.y - (y - 8)) > 8) return 'step ' + i + ': a star at ' + st.x + ',' + st.y;
      }
    }
    TG.Effects.update(1 / 60);
  }
  // 6 frames of the ink bolt, 3 white, 0.3 s of zip.
  const wrong = runsProblem(looks, [['hang0', 6], ['white', 3], ['zip', 18], ['gone', null]]);
  if (wrong) return wrong;
  for (let k = 1; k < zip.length; k++) if (zip[k] > zip[k - 1]) return 'it comes down again: y ' + zip.join(' ');
  const half = Math.floor(zip.length / 2), last = zip[zip.length - 1];
  if (zip[0] < y - 1 || last > C.PLAY_TOP + 24) return 'the zip goes from y ' + zip[0] + ' to ' + last + ', not from ' + y + ' to the top of the playfield';
  if (!(zip[half] - last > 2 * (zip[0] - zip[half]))) return 'the zip does not gather speed: y ' + zip.join(' ');
  if (twinkles < 20) return 'the stars were drawn ' + twinkles + ' times';
  if (starsOf(TG).length) return 'the stars are still there after 50 steps';
  if (env.errors.length || env.warnings.length) return env.errors.concat(env.warnings)[0];
});

check('a cleared flit folds its wings and tumbles up out of the top: the dive frame, turned over and back, with three fx_star left on the way. It keeps its place in the view while Pip runs on, the ink bolt flies to it there and the bolt\'s splash stays on it, and the stars stay in the world (LEVEL2 4.2)', function () {
  const env = loadEnv();
  const TG = env.TG;
  const C = TG.C;
  const s = handState(TG, 'playing');
  s.entities = [];
  withGame(TG, s);
  const RUN = 1.5;                                     // px the view moves each step
  const sx = 150, y = C.GROUND_Y - C.FLIT_CROSS_ELEV;
  TG.Effects.update(1 / 60);                           // a step before the event, as in a run: the effects know the view
  TG.Events.emit('word:clear', clearOf(s, 'flit', sx, y));
  const looks = [], dive = [];
  let born = 0, before = 0, most = 0, firstStar = null, turns = 0, bolts = 0, landed = null, splash = false;
  for (let i = 0; i < 60; i++) {
    const pic = effectsPicture(TG, env, s);
    const f = named(pic.sprites, 'en_flit');
    if (f.length > 1) return 'step ' + i + ': ' + f.length + ' flits';
    // The ink bolt flies to the flit where it is in the view, on every step of its flight.
    const fxs = TG.Effects._list();
    const bolt = fxs.filter(function (q) { return q.type === 'bolt'; })[0];
    if (bolt) {
      bolts++;
      if (!f.length || Math.abs(bolt.x - f[0].x) > 1 || bolt.y !== y - 8) return 'step ' + i + ': the ink bolt flies to ' + bolt.x + ',' + bolt.y + ' and the flit is drawn at ' + JSON.stringify(f[0]);
    }
    // Its splash stays on the flit: eight steps after the bolt lands the six specks are still round it.
    const specks = fxs.filter(function (q) { return q.type === 'part' && !q.kind; });
    if (specks.length && landed === null) landed = i;
    if (landed !== null && i === landed + 8) {
      const mid = specks.reduce(function (a, q) { return a + q.x; }, 0) / (specks.length || 1);
      if (specks.length !== 6 || Math.abs(mid - sx) > 6) return 'eight steps after the bolt landed its splash is ' + specks.length + ' specks round screen x ' + mid.toFixed(1) + ', and the flit is at ' + sx;
      splash = true;
    }
    // The twinkles are fx_star as it is, with no remap.
    const drawn = named(pic.sprites, 'fx_star');
    if (drawn.some(function (c) { return c.remap !== null; })) return 'step ' + i + ': a star is drawn under a remap: ' + JSON.stringify(drawn);
    if (!f.length) {
      looks.push('gone');
    } else {
      const c = f[0];
      looks.push(c.remap === 'white' ? 'white' : c.frame);
      if (Math.abs(c.x - sx) > 6) return 'step ' + i + ': at screen x ' + c.x + ', it began at ' + sx + ' and the view has moved ' + (i * RUN) + ' px';
      if (c.frame === 'dive') {
        if (dive.length && dive[dive.length - 1].flipX !== c.flipX) turns++;
        dive.push(c);
      } else if (c.flipX || c.y !== y) {
        return 'step ' + i + ': before it folds its wings ' + JSON.stringify(c);
      }
    }
    const stars = starsOf(TG);
    if (stars.length > before) born += stars.length - before;
    before = stars.length;
    most = Math.max(most, stars.length);
    if (stars.length && firstStar === null) firstStar = { step: i, x: stars[0].x };
    // Eight steps on the first star is still the only one, and the view has left it behind.
    if (firstStar && i === firstStar.step + 8 && !(stars.length === 1 && stars[0].x < firstStar.x - 8)) {
      return 'eight steps after the first star: ' + JSON.stringify(stars.map(function (st) { return st.x; })) + ', it was left at screen x ' + firstStar.x;
    }
    s.camera.x += RUN;
    s.player.x += RUN;
    TG.Effects.update(1 / 60);
  }
  // 6 frames of the ink bolt, 3 white, 0.55 s of tumbling.
  const wrong = runsProblem(looks, [['flap0', 6], ['white', 3], ['dive', 33], ['gone', null]]);
  if (wrong) return wrong;
  for (let k = 1; k < dive.length; k++) if (dive[k].y > dive[k - 1].y) return 'it comes down again at step ' + k + ' of the tumble';
  const last = dive[dive.length - 1].y;
  if (dive[0].y < y - 1 || last > C.PLAY_TOP + 24) return 'the tumble goes from y ' + dive[0].y + ' to ' + last + ', not from ' + y + ' to the top of the playfield';
  if (turns < 4) return 'it is turned over ' + turns + ' times';
  if (born !== 3 || most !== 3) return born + ' stars, ' + most + ' at once';
  if (before !== 0) return 'the stars are still there after 60 steps';
  if (bolts < 5 || !splash) return 'the ink bolt was seen on ' + bolts + ' steps and its splash ' + (splash ? 'was' : 'was not') + ' looked at';
  if (env.errors.length || env.warnings.length) return env.errors.concat(env.warnings)[0];
});

check('a flit is cleared facing the way it was drawn: flipped after its turn, and with its wings already folded when it was caught in its dive', function () {
  const env = loadEnv();
  const TG = env.TG;
  const C = TG.C;
  const first = function (extra) {
    const s = handState(TG, 'playing');
    const p = clearOf(s, 'flit', 24, C.GROUND_Y - 60);
    s.entities = extra ? [removed(entity(TG, s, 'flit', 'gear', -72, 60, Object.assign({ id: p.id, w: 24 }, extra)), 'cleared')] : [];
    withGame(TG, s);
    TG.Effects.reset();
    TG.Events.emit('word:clear', p);
    const looks = [];
    let flipped = null;
    for (let i = 0; i < 12; i++) {
      const c = named(effectsPicture(TG, env, s).sprites, 'en_flit')[0];
      if (!c) return 'not drawn at step ' + i;
      looks.push(c.remap === 'white' ? 'white' : c.frame);
      if (i === 0) flipped = c.flipX;
      // Until it tumbles it does not turn.
      if (i < 8 && c.flipX !== flipped) return 'it turns round at step ' + i;
      TG.Effects.update(1 / 60);
    }
    return { flipped: flipped, looks: runsOf(looks).map(function (r) { return r[0]; }).join(',') };
  };
  const cases = [
    ['no entity', null, false, 'flap0,white,dive'],
    ['crossing', { phase: 'cross', turned: false, flipX: false }, false, 'flap0,white,dive'],
    ['behind Pip', { phase: 'behind', turned: true, flipX: true }, true, 'flap0,white,dive'],
    ['diving', { phase: 'dive', turned: true, flipX: true }, true, 'dive,white,dive']
  ];
  for (const c of cases) {
    const got = first(c[1]);
    if (typeof got === 'string') return c[0] + ': ' + got;
    if (got.flipped !== c[2] || got.looks !== c[3]) return c[0] + ': flipped ' + got.flipped + ', drawn as ' + got.looks;
  }
  if (env.errors.length || env.warnings.length) return env.errors.concat(env.warnings)[0];
});

check('a dangle or a flit that reaches Pip is knocked away in its own sprite, back the way it came: the dangle ahead, a flit that has turned to the left though its dive ends on Pip\'s own x (LEVEL2 4.3)', function () {
  const env = loadEnv();
  const TG = env.TG;
  // Where the knocked-away sprite is after 12 steps, relative to Pip, and where the puff of a bounce is.
  const away = function (event, kind, dx, extra) {
    const s = handState(TG, 'playing');
    const id = clearId++;
    s.entities = extra ? [removed(entity(TG, s, kind, 'gear', dx, 12, Object.assign({ id: id }, extra)), event === 'threat:hit' ? 'hit' : 'bounced')] : [];
    withGame(TG, s);
    TG.Effects.reset();
    const p = { id: id, kind: kind, x: s.player.x + dx, y: s.player.y - 12 };
    TG.Events.emit(event, event === 'threat:hit' ? Object.assign({ word: 'gear', typed: 0 }, p) : p);
    const pipX = s.player.x - s.camera.x;
    let puff = null, flung = null;
    for (let i = 0; i < 12; i++) {
      const pic = effectsPicture(TG, env, s);
      const poof = named(pic.sprites, 'fx_poof')[0];
      if (poof && puff === null) puff = poof.x - pipX;
      flung = named(pic.sprites, KIND_SPRITES[kind])[0] || null;
      if (!flung) return null;
      TG.Effects.update(1 / 60);
    }
    return { dx: flung.x - pipX, frame: flung.frame, puff: puff };
  };
  const turned = { turned: true, flipX: true, phase: 'dive', w: 24 };
  const cases = [
    // event, kind, dx at contact, the entity, the side it goes to, its frame
    ['threat:hit', 'dangle', 11, { phase: 'hang' }, 1, 'hang0'],
    ['threat:hit', 'dangle', 11, null, 1, 'hang0'],
    ['threat:hit', 'flit', 0, turned, -1, 'flap0'],
    ['threat:bounce', 'flit', 0, turned, -1, 'flap0'],
    ['threat:hit', 'flit', 0, null, 1, 'flap0'],                   // nothing says it turned: by its x, as before
    // Level 1's kinds as they were: by the side they are on.
    ['threat:hit', 'truffle', -15, { phase: 'approach' }, -1, 'run0'],
    ['threat:bounce', 'hoppet', 11, { phase: 'approach' }, 1, 'sit'],
    ['threat:hit', 'swoop', 0, { phase: 'dive' }, 1, 'flap0']
  ];
  for (const c of cases) {
    const what = c[0] + ' ' + c[1] + (c[3] ? '' : ' with no entity');
    const got = away(c[0], c[1], c[2], c[3]);
    if (!got) return what + ': not drawn';
    if (got.frame !== c[5]) return what + ': frame ' + got.frame;
    if (!(got.dx * c[4] > 12)) return what + ': ' + got.dx + ' px from Pip after 12 steps, expected the ' + (c[4] < 0 ? 'left' : 'right');
    if (c[0] === 'threat:bounce' && !(got.puff * c[4] > 0)) return what + ': the puff is at ' + got.puff + ' px from Pip, on the other side';
  }
  if (env.errors.length || env.warnings.length) return env.errors.concat(env.warnings)[0];
});

check('a cleared or knocked-away creature has the look of its skin: the sprite and the remap of theme.skins for its kind, or the entity\'s own skin without that remap, in the frames and places of the plain one (LEVEL2 4.5)', function () {
  const Y = { buzzle: 18, swoop: 100, flit: 100, dangle: 20, rock: 60, crate: 100, digby: 10, under: -16 };
  // Every sprite the effects draw for the clear of a kind and for the same kind reaching Pip, over 200
  // steps. A fresh load each time, so that the effects' own random numbers are the same in each.
  const record = function (kind, skins, own) {
    const env = loadEnv();
    const TG = env.TG;
    TG.Remaps.scratch = { 14: 16, 30: 18 };
    TG.Sprites.define('x_mole', TG.Sprites.get('en_digby'));
    const scene = kind === 'under' ? 'digby' : kind;
    const s = handState(TG, scene === 'rock' ? 'boss' : 'playing');
    s.entities = [];
    if (skins) s.level.theme.skins = skins;
    withGame(TG, s);
    const p = clearOf(s, scene, 200, TG.C.GROUND_Y - (Y[kind] || 0));
    // animT 0: a dangle at rest on its thread, so that it is cleared in the place of the plain one.
    if (own) s.entities.push(removed(entity(TG, s, scene, 'gear', 104, Y[kind] || 0, { id: p.id, skin: own, animT: 0 }), 'cleared'));
    TG.Events.emit('word:clear', p);
    TG.Events.emit('threat:hit', { id: p.id, kind: scene, word: 'gear', typed: 0, x: s.player.x + 13, y: s.player.y });
    const calls = [];
    for (let i = 0; i < 200; i++) {
      effectsPicture(TG, env, s).sprites.forEach(function (c) { calls.push(c); });
      TG.Effects.update(1 / 60);
    }
    if (env.errors.length) throw new Error(env.errors[0]);
    return calls;
  };
  // The plain calls with the kind's sprite under another name and remap. The frog's lily pad takes the
  // frog's remap and no other sprite takes anything: the mound, the helmet, the power icon, the box.
  const dressed = function (calls, sprite, name, remap) {
    return calls.map(function (c) {
      if (c.name === sprite) return Object.assign({}, c, { name: name, remap: c.remap === null ? remap : c.remap });
      if (sprite === 'en_hoppet' && c.name === 'fx_lilypad') return Object.assign({}, c, { remap: remap });
      return c;
    });
  };
  const differ = function (got, want) {
    for (let i = 0; i < Math.max(got.length, want.length); i++) {
      if (JSON.stringify(got[i]) !== JSON.stringify(want[i])) return 'call ' + i + ' of ' + want.length + ' is ' + JSON.stringify(got[i]) + ', want ' + JSON.stringify(want[i]);
    }
    return null;
  };
  for (const kind of Object.keys(KIND_SPRITES).concat(['under'])) {
    const scene = kind === 'under' ? 'digby' : kind;
    const sprite = KIND_SPRITES[scene];
    // A Digby is drawn cut at the ground line, which needs a sprite that is defined: a copy of its own under
    // another name (record). The Baronet's sprite would bring the Baronet's own clear with it (LEVEL2 4.4).
    const other = scene === 'digby' ? 'x_mole' : 'x_' + kind;
    const plain = record(kind, null, null);
    const mine = plain.filter(function (c) { return c.name === sprite; });
    // The plain one must draw the kind's sprite, and white in the flash. Underground the mound flashes.
    if (mine.length < 10 || (kind !== 'under' && !mine.some(function (c) { return c.remap === 'white'; }))) return kind + ': the plain clear draws ' + sprite + ' ' + mine.length + ' times';
    const skin = {};
    let bad;
    skin[scene] = { sprite: other, remap: 'scratch' };
    if ((bad = differ(record(kind, skin, null), dressed(plain, sprite, other, 'scratch')))) return kind + ' under a sprite and a remap: ' + bad;
    skin[scene] = { remap: 'scratch' };
    if ((bad = differ(record(kind, skin, null), dressed(plain, sprite, sprite, 'scratch')))) return kind + ' under a remap: ' + bad;
    // The entity's own skin wins over the level's, and the level's remap is not put on it.
    skin[scene] = { sprite: 'x_level', remap: 'scratch' };
    if ((bad = differ(record(kind, skin, other), dressed(plain, sprite, other, null)))) return kind + ' with a skin of its own: ' + bad;
    // A skin for another kind changes nothing.
    if (kind === 'hoppet' || kind === 'dangle') {
      if ((bad = differ(record(kind, { dawdle: { sprite: 'x_other', remap: 'scratch' } }, null), plain))) return kind + ' with a skin for the dawdle: ' + bad;
    }
  }
});

check('Level 2\'s own skins in the effects: the tin frog pops and leaves a tin disc, the glow-moth spirals as the bee does and leaves four fx_star for the flower, the cog flies back to the boss as the rock does; without them the pad is green, the flower is one and the rock is a rock (LEVEL2 4.1)', function () {
  const skins = stubs.load({ files: ['js/core.js', 'js/levels/level2.js'] }).TG.Levels[2].theme.skins;
  // The sprites drawn over the whole clear of a kind, by name, and the most fx_star alive at once.
  const cleared = function (kind, withSkins, look) {
    const env = loadEnv();
    const TG = env.TG;
    const s = handState(TG, kind === 'rock' ? 'boss' : 'playing');
    s.entities = [];
    if (withSkins) s.level.theme.skins = skins;
    withGame(TG, s);
    TG.Events.emit('word:clear', clearOf(s, kind, 180, TG.C.GROUND_Y - (kind === 'hoppet' ? 0 : 40)));
    TG.Events.emit('threat:hit', { id: clearId++, kind: kind, word: 'gear', typed: 0, x: s.player.x + 13, y: s.player.y });
    const byName = {};
    let stars = 0;
    for (let i = 0; i < 200; i++) {
      effectsPicture(TG, env, s).sprites.forEach(function (c) { (byName[c.name] = byName[c.name] || []).push(c); });
      stars = Math.max(stars, starsOf(TG).length);
      if (look) look(TG, env, s, i);
      TG.Effects.update(1 / 60);
    }
    if (env.errors.length || env.warnings.length) throw new Error(env.errors.concat(env.warnings)[0]);
    return { byName: byName, stars: stars };
  };
  const remaps = function (calls) {
    const set = {};
    (calls || []).forEach(function (c) { set[c.remap] = true; });
    return Object.keys(set).sort().join(',');
  };
  // The colours on the canvas at step 100 of the frog's clear, when only the pad is left.
  let padColors = null;
  const pad = function (TG, env, s, i) {
    if (i !== 100) return;
    const ctx = env.canvas.getContext('2d');
    ctx.clearRect(0, 0, 384, 216);
    TG.Effects.draw(ctx, 'world', s.camera.x);
    const rgba = env.canvas.toRGBA(), pal = paletteSet(TG);
    padColors = {};
    for (let y = 24; y < 216; y++) for (let x = 0; x < 384; x++) { const c = pixel(rgba, 384, x, y); if (c) padColors[pal.indexOf(c)] = true; }
  };

  // The frog: every frame under `tin` or the white flash, and the pad under `tin`: SILVER, and no green.
  let got = cleared('hoppet', true, pad);
  if (remaps(got.byName.en_hoppet) !== 'tin,white') return 'the tin frog is drawn under ' + remaps(got.byName.en_hoppet);
  if (!got.byName.en_hoppet.some(function (c) { return c.frame === 'puff' && c.remap === 'tin'; })) return 'the tin frog does not puff up in tin';
  if (remaps(got.byName.fx_lilypad) !== 'tin') return 'the pad of the tin frog is drawn under ' + remaps(got.byName.fx_lilypad);
  if (!padColors || !padColors[3] || padColors[14] || padColors[13]) return 'the tin pad\'s colours: ' + Object.keys(padColors || {}).join(' ');
  got = cleared('hoppet', false, pad);
  if (remaps(got.byName.en_hoppet) !== 'null,white' || remaps(got.byName.fx_lilypad) !== 'null') return 'without skins the frog and its pad are remapped';
  if (!padColors[14] || padColors[3]) return 'Level 1\'s pad\'s colours: ' + Object.keys(padColors).join(' ');

  // The moth: en_glimmer in both frames up the bee's spiral, then four stars and no flower.
  const falls = {};                                    // the heights of each star, by its x: a star does not move sideways
  got = cleared('buzzle', true, function (TG) {
    starsOf(TG).forEach(function (st) { (falls[st.x.toFixed(2)] = falls[st.x.toFixed(2)] || []).push(st.y); });
  });
  const moth = got.byName.en_glimmer || [];
  if (got.byName.en_buzzle || moth.length < 30) return 'the moth is drawn as en_glimmer ' + moth.length + ' times, as en_buzzle ' + (got.byName.en_buzzle || []).length;
  if (!moth.some(function (c) { return c.frame === 0; }) || !moth.some(function (c) { return c.frame === 1; })) return 'the moth does not flap on its way up';
  if (got.stars !== 4 || got.byName.fx_flower) return 'the moth leaves ' + got.stars + ' stars and ' + (got.byName.fx_flower ? 'a flower' : 'no flower');
  // The stars are fx_star as it is, with no remap, and each drifts down from where it began.
  if (remaps(got.byName.fx_star) !== 'null') return 'the moth\'s stars are drawn under ' + remaps(got.byName.fx_star);
  if (Object.keys(falls).length !== 4) return 'the moth\'s stars are at ' + Object.keys(falls).length + ' places across';
  for (const x of Object.keys(falls)) {
    const ys = falls[x];
    for (let k = 1; k < ys.length; k++) if (ys[k] < ys[k - 1]) return 'the star at x ' + x + ' goes up: y ' + ys[k - 1].toFixed(1) + ' to ' + ys[k].toFixed(1);
    if (!(ys[ys.length - 1] - ys[0] >= 10)) return 'the star at x ' + x + ' drifts ' + (ys[ys.length - 1] - ys[0]).toFixed(1) + ' px down';
  }
  const bee = cleared('buzzle', false, null);
  if (bee.byName.en_glimmer || !bee.byName.en_buzzle || !bee.byName.fx_flower || bee.stars !== 0) return 'without skins the bee does not leave its one flower';
  // The spiral is the same: the moth is drawn where the bee is, frame for frame.
  const path = function (calls) { return JSON.stringify(calls.map(function (c) { return [c.frame, c.x, c.y, c.flipX, c.remap]; })); };
  if (path(moth) !== path(bee.byName.en_buzzle)) return 'the moth does not follow the bee\'s spiral';

  // The cog: pr_cog on the rock's path to the boss, and bouncing off as a pr_cog.
  got = cleared('rock', true, null);
  const rock = cleared('rock', false, null);
  if (got.byName.pr_rock || !got.byName.pr_cog || rock.byName.pr_cog) return 'the cog is not drawn as pr_cog, or the rock is';
  if (path(got.byName.pr_cog) !== path(rock.byName.pr_rock)) return 'the cog does not follow the rock\'s path';
  const xs = got.byName.pr_cog.map(function (c) { return c.x; });
  if (!(Math.max.apply(null, xs) > 260)) return 'the cog does not reach the boss: screen x up to ' + Math.max.apply(null, xs);
});

check('Effects without TG.Game, TG.Gfx or TG.Font: the clears and the hits of a dangle and a flit do not throw', function () {
  const env = stubs.load({ files: ['js/core.js'].concat(WPF_FILES), canvas: 'soft' });
  const TG = env.TG;
  TG.Events.clear();
  TG.Effects.init();
  const s = handState(TG, 'playing');
  for (const kind of ['dangle', 'flit']) {
    const p = clearOf(s, kind, 150, 100);
    TG.Events.emit('word:clear', p);
    TG.Events.emit('word:clear', Object.assign({}, p, { cause: 'blast' }));
    TG.Events.emit('threat:hit', { id: p.id, kind: kind, word: 'gear', typed: 0, x: s.player.x, y: s.player.y });
    TG.Events.emit('threat:bounce', { id: p.id, kind: kind, x: s.player.x, y: s.player.y });
  }
  const live = TG.Effects._list().filter(function (f) { return f.type === 'clear'; }).length;
  if (live !== 4) return live + ' clear sequences';
  for (let i = 0; i < 80; i++) {
    TG.Effects.update(1 / 60);
    TG.Effects.draw(env.canvas.getContext('2d'), 'world', 0);
  }
  if (TG.Effects._list().some(function (f) { return f.type === 'clear'; })) return 'a clear sequence did not end';
  if (env.errors.length) return env.errors[0];
});

// --- Lady Ratchet's effects and the Baronet's clear (LEVEL2 2, 4.4, 10.1, 10.4 and 10.7; milestone M4) ---
//
// TG.Effects chooses a boss's effects by state.boss.kind (BOSS_FX in js/effects.js). The cases below put
// kind 'ratchet' on the hand-built boss, who stands at screen x 296 with her feet on the floor line, and
// follow what TG.Effects draws step by step, the view scrolling under her as it does in the arena. Each
// case also asks that the Baron's side is as it was.

const BOSS_SX = 296;                 // HERO_SCREEN_X + BOSS_DX: where the boss stands in the view

// A hand-built fight with a boss of this kind and nothing else in it. edit(s) changes the state first.
// One update seats the camera in TG.Effects, so that what follows the view does so from the first step.
function bossFight(TG, kind, edit) {
  const s = handState(TG, 'boss');
  s.entities = [];
  s.boss.word = null;
  s.boss.kind = kind;
  if (edit) edit(s);
  withGame(TG, s);
  TG.Effects.reset();
  TG.Effects.update(1 / 60);
  return s;
}

// Follows the effects for `steps` steps: look(i, pic) sees what is drawn after i updates and returns a
// string to stop with. The view, Pip and the boss move `scroll` px on each step.
function watchEffects(TG, env, s, steps, scroll, look) {
  for (let i = 0; i < steps; i++) {
    const bad = look(i, effectsPicture(TG, env, s));
    if (bad) return 'step ' + i + ': ' + bad;
    s.camera.x += scroll;
    s.player.x += scroll;
    s.boss.x += scroll;
    TG.Effects.update(1 / 60);
  }
  return null;
}

// What TG.Effects writes in the world in one draw: every popup as { text, x, y, color } and every letter
// particle as { ch, x, y }.
function writingDrawn(TG, env, s) {
  const out = { popups: [], letters: [] };
  const draw = TG.Font.draw, glyph = TG.Font.drawGlyph;
  TG.Font.draw = function (ctx, str, x, y, o) {
    out.popups.push({ text: str, x: x, y: y, color: o ? o.color : null });
    return draw.apply(TG.Font, arguments);
  };
  TG.Font.drawGlyph = function (ctx, ch, x, y) {
    out.letters.push({ ch: ch, x: x, y: y });
    return glyph.apply(TG.Font, arguments);
  };
  try { TG.Effects.draw(env.canvas.getContext('2d'), 'world', s.camera.x); } finally { TG.Font.draw = draw; TG.Font.drawGlyph = glyph; }
  return out;
}

// The draws of one sprite over a watch, as { step, x, y, frame } in order, from the list `seen` that a
// look() fills with every call.
function drawsOf(seen, name) {
  return seen.filter(function (c) { return c.name === name; });
}

// The square particles alive now (the sparks and the dust), in screen px.
function squaresOf(TG) {
  return TG.Effects._list().filter(function (f) { return f.type === 'part' && !f.kind; });
}

// The puffs among the draws of a watch, in the order they begin: each fx_poof as { x, y, from, to, x1, y1,
// frames }: where and at which step it begins, the last step it is drawn on and where, and its frames as
// a string. A puff moves less than a pixel a step, and no two that are out together are that close.
function puffsOf(seen) {
  const out = [];
  drawsOf(seen, 'fx_poof').forEach(function (c) {
    const run = out.filter(function (r) { return r.to === c.step - 1 && Math.abs(r.x1 - c.x) <= 1 && Math.abs(r.y1 - c.y) <= 1; })[0];
    if (run) { run.to = c.step; run.x1 = c.x; run.y1 = c.y; run.frames += c.frame; }
    else out.push({ x: c.x, y: c.y, from: c.step, to: c.step, x1: c.x, y1: c.y, frames: String(c.frame) });
  });
  return out;
}

// fx_poof plays its three frames once, in a quarter of a second: 14 or 15 steps, or 16 with the step it
// is made on.
function playsOnce(r) {
  return /^0{4,5}1{5}2{5,6}$/.test(r.frames);
}

// True when `step` is `want` or the step after: a delay that is a whole number of steps ends on one or
// the other, as the sum of the steps falls.
function about(step, want) {
  return step === want || step === want + 1;
}

check('boss:hit knocks the goggles off her brow where the Baron loses his monocle, their lenses RED under lampred when hers are, and she loses count: "1..." in WHITE beside her snout from 0.2 s on, rising with her as the view scrolls. Not on her last weak point, and never for the Baron (LEVEL2 2, 10.5)', function () {
  const env = loadEnv();
  const TG = env.TG;
  const G = TG.C.GROUND_Y;
  const hit = function (kind, health, lampRed) {
    const s = bossFight(TG, kind, function (st) { st.boss.lampRed = lampRed; });
    TG.Events.emit('boss:hit', { health: health, maxHealth: 6, phase: 2, x: s.boss.x, y: s.boss.y - 32 });
    const seen = [], popups = [];
    const bad = watchEffects(TG, env, s, 90, 2, function (i, pic) {
      pic.sprites.forEach(function (c) { if (/^boss/.test(c.name)) seen.push(Object.assign({ step: i }, c)); });
      writingDrawn(TG, env, s).popups.forEach(function (p) { popups.push(Object.assign({ step: i }, p)); });
    });
    if (bad) throw new Error(bad);
    return { seen: seen, popups: popups };
  };
  // What flies off, from where and under which remap, and that it goes to Pip's side and comes down on the floor.
  const flies = function (got, name, x0, y0, remap) {
    const d = drawsOf(got.seen, name);
    if (d.length !== got.seen.length || d.length < 40) return 'the sprites thrown are ' + got.seen.map(function (c) { return c.name; }).filter(function (n, i, a) { return a.indexOf(n) === i; }).join(', ');
    if (d.some(function (c) { return c.remap !== remap; })) return name + ' is drawn under ' + d[0].remap + ', want ' + remap;
    if (d[0].step !== 0 || d[0].x !== x0 || d[0].y !== y0) return name + ' starts at step ' + d[0].step + ' at ' + d[0].x + ',' + d[0].y + ', want ' + x0 + ',' + y0;
    // It is at the floor, or a few px from it, when it blinks out, as the monocle has always been.
    const low = Math.max.apply(null, d.map(function (c) { return c.y; }));
    if (low > G - 4 || low < G - 12 || !(d[d.length - 1].x < x0 - 20)) return name + ' ends at x ' + d[d.length - 1].x + ' and comes down to y ' + low;
    return null;
  };

  let got = hit('ratchet', 3, false);
  let bad = flies(got, 'boss2_goggles', BOSS_SX - 5, G - 53, null);
  if (bad) return 'her hit: ' + bad;
  const p = got.popups;
  if (!p.length || p.some(function (t) { return t.text !== '1...' || t.color !== 4 || t.x !== BOSS_SX - 36; })) return 'her popups: ' + JSON.stringify(p.slice(0, 3));
  // It rises 12 px over half a second from 10 px over the point of the hit, and is there for 0.8 s.
  const ys = p.map(function (t) { return t.y; });
  if (!about(p[0].step, 12) || ys[0] < G - 43 || ys[0] > G - 42 || Math.min.apply(null, ys) !== G - 54) return 'the popup starts at step ' + p[0].step + ' at y ' + ys[0] + ' and rises to ' + Math.min.apply(null, ys);
  if (p.length < 40 || p[p.length - 1].step > 12 + 50) return 'the popup is drawn ' + p.length + ' times, to step ' + p[p.length - 1].step;

  // From phase 2 her lenses are RED (boss.lampRed), and so are those of the pair that flies off.
  got = hit('ratchet', 0, true);
  if ((bad = flies(got, 'boss2_goggles', BOSS_SX - 5, G - 53, 'lampred'))) return 'her last hit: ' + bad;
  if (got.popups.length) return 'she counts again after her last weak point: ' + JSON.stringify(got.popups[0]);

  for (const kind of ['baron', 'nobody']) {
    got = hit(kind, 3, true);
    if ((bad = flies(got, 'boss_monocle', BOSS_SX - 10, G - 40, null))) return 'a hit on the ' + kind + ': ' + bad;
    if (got.popups.length) return 'a popup for the ' + kind + ': ' + JSON.stringify(got.popups[0]);
  }
  if (env.errors.length || env.warnings.length) return env.errors.concat(env.warnings)[0];
});

check('the burst of boss:throw and the dust of boss:phase are brass in her hall (GOLD, BRONZE, WHITE; BRONZE, GOLD, STONE) and soil in the Baron\'s dig as before (SAND, CLAY, WHITE; SAND, CLAY, STONE)', function () {
  const env = loadEnv();
  const TG = env.TG;
  // The colours of the square particles of an event over 30 steps, and the most drawn at once.
  const colors = function (kind, event, payload) {
    const s = bossFight(TG, kind);
    TG.Events.emit(event, payload(s));
    const set = {};
    let most = 0;
    for (let i = 0; i < 30; i++) {
      const c = particleColors(TG, env, s);
      most = Math.max(most, c.length);
      c.forEach(function (v) { set[v] = true; });
      TG.Effects.update(1 / 60);
    }
    return { set: Object.keys(set).map(Number).sort(function (a, b) { return a - b; }), most: most };
  };
  const thrown = function (s) { return { kind: 'rock', x: s.player.x + 190, y: 144 }; };
  const phase = function () { return { phase: 2 }; };
  const within = function (set, allowed) { return set.length >= 2 && set.every(function (c) { return allowed.indexOf(c) !== -1; }); };
  const GOLD = 18, BRONZE = 16, WHITE = 4, STONE = 2, SAND = 23, CLAY = 22;
  let got = colors('ratchet', 'boss:throw', thrown);
  if (got.most !== 5 || !within(got.set, [GOLD, BRONZE, WHITE])) return 'her throw: ' + got.most + ' particles in ' + got.set.join(' ');
  got = colors('ratchet', 'boss:phase', phase);
  if (got.most !== 24 || got.set.join(' ') !== [STONE, BRONZE, GOLD].join(' ')) return 'her dust: ' + got.most + ' particles in ' + got.set.join(' ');
  for (const kind of ['baron', 'nobody']) {
    got = colors(kind, 'boss:throw', thrown);
    if (got.most !== 5 || !within(got.set, [SAND, CLAY, WHITE])) return 'the throw of the ' + kind + ': ' + got.most + ' particles in ' + got.set.join(' ');
    got = colors(kind, 'boss:phase', phase);
    if (got.most !== 24 || got.set.join(' ') !== [STONE, CLAY, SAND].join(' ')) return 'the dust of the ' + kind + ': ' + got.most + ' particles in ' + got.set.join(' ');
  }
});

check('her intro (LEVEL2 10.1): from boss:enter a puff of dust at the hatch as the Baronet drops in, at 0.24 of the intro, and steam from the ends of the engine at 0.29, 0.36 and 0.43, rising; each keeps its place by her as the view scrolls. The Baron\'s intro has none', function () {
  const env = loadEnv();
  const TG = env.TG;
  const G = TG.C.GROUND_Y;
  const puffs = function (kind, introTime) {
    const s = bossFight(TG, kind, function (st) { st.boss.state = 'intro'; st.boss.stateT = 0; st.boss.introTime = introTime; st.boss.rise = 40; });
    TG.Events.emit('boss:enter', {});
    const seen = [];
    watchEffects(TG, env, s, 130, 2, function (i, pic) {
      pic.sprites.forEach(function (c) { seen.push(Object.assign({ step: i }, c)); });
    });
    return puffsOf(seen);
  };
  for (const len of [4, 2]) {
    const got = puffs('ratchet', len);
    const want = [[BOSS_SX, 0.24], [BOSS_SX - 19, 0.29], [BOSS_SX + 19, 0.36], [BOSS_SX - 19, 0.43]];
    if (got.length !== 4) return 'an intro of ' + len + ' s has ' + got.length + ' puffs: ' + JSON.stringify(got);
    for (let k = 0; k < 4; k++) {
      const r = got[k], what = 'an intro of ' + len + ' s, puff ' + k + ': ';
      if (r.x !== want[k][0] || r.x1 !== r.x || !about(r.from, Math.ceil(want[k][1] * len * 60 - 1e-6))) return what + 'at x ' + r.x + ' from step ' + r.from;
      if (!playsOnce(r)) return what + 'frames ' + r.frames;
      // The dust stays over the hatch; the steam starts at the top of the engine and rises.
      if (k === 0 ? (r.y !== G - 14 || r.y1 !== G - 14) : (r.y < G - 19 || r.y > G - 17 || !(r.y - r.y1 >= 4))) return what + 'y ' + r.y + ' to ' + r.y1;
    }
  }
  for (const kind of ['baron', 'nobody']) {
    if (puffs(kind, 4).length) return 'the intro of the ' + kind + ' has a puff';
  }
  if (env.errors.length || env.warnings.length) return env.errors.concat(env.warnings)[0];
});

check('her engine and its gauge: in phase 3 steam from both ends as each round starts (LEVEL2 10.7), and steam blown to the left of the dial 0.3 s after a weak-point window opens when the whole volley was cleared (10.4). No steam in phases 1 and 2, none in another state, none after a volley with a cog missed, and none for the Baron', function () {
  const env = loadEnv();
  const TG = env.TG;
  const G = TG.C.GROUND_Y;
  const puffs = function (kind, event, payload, edit) {
    const s = bossFight(TG, kind, edit);
    TG.Events.emit(event, payload);
    const seen = [];
    watchEffects(TG, env, s, 50, 2, function (i, pic) {
      pic.sprites.forEach(function (c) { seen.push(Object.assign({ step: i }, c)); });
    });
    return puffsOf(seen);
  };
  const round = function (kind, phase, state) {
    return puffs(kind, 'boss:state', { state: state, phase: phase, round: 2 }, function (s) { s.boss.phase = phase; s.boss.state = state; });
  };
  let got = round('ratchet', 3, 'volley');
  if (got.length !== 2 || got[0].x !== BOSS_SX - 19 || got[0].from !== 0 || got[1].x !== BOSS_SX + 19 || !about(got[1].from, 5)) return 'the steam of a round in phase 3: ' + JSON.stringify(got);
  for (const r of got) {
    if (!playsOnce(r) || r.y < G - 19 || r.y > G - 17 || !(r.y - r.y1 >= 4) || r.x1 !== r.x) return 'the steam of a round: ' + JSON.stringify(r);
  }
  for (const c of [['ratchet', 1, 'volley'], ['ratchet', 2, 'volley'], ['ratchet', 3, 'telegraph'], ['ratchet', 3, 'taunt'], ['baron', 3, 'volley'], ['nobody', 3, 'volley']]) {
    if (round(c[0], c[1], c[2]).length) return 'steam for ' + c.join(' ');
  }

  const toot = function (kind, thrown, hits) {
    return puffs(kind, 'boss:weakopen', { id: 999, word: 'monocle', window: 6.3 }, function (s) {
      s.boss.volley = { toLaunch: thrown, launched: thrown.length, sinceLaunch: 0, hits: hits };
    });
  };
  got = toot('ratchet', ['rock', 'rockhigh', 'rock'], 3);
  // One puff, from 0.3 s on, beside the dial (its centre is 18 px left of her and 10 px up), going left.
  if (got.length !== 1 || !about(got[0].from, 18) || !playsOnce(got[0])) return 'the toot: ' + JSON.stringify(got);
  if (got[0].x > BOSS_SX - 28 || got[0].x < BOSS_SX - 32 || got[0].y < G - 14 || got[0].y > G - 11 || !(got[0].x1 <= got[0].x - 4)) return 'the toot goes from ' + got[0].x + ',' + got[0].y + ' to x ' + got[0].x1;
  if (toot('ratchet', ['rock', 'rockhigh', 'rock'], 2).length) return 'a toot after a volley with a cog missed';
  if (toot('ratchet', [], 0).length) return 'a toot with no volley';
  if (toot('baron', ['rock', 'rock'], 2).length || toot('nobody', ['rock', 'rock'], 2).length) return 'a toot for the Baron';
  if (env.errors.length || env.warnings.length) return env.errors.concat(env.warnings)[0];
});

check('each letter of her finisher word throws three sparks from the key in her back, up and away behind her, in GOLD, CREAM or WHITE (LEVEL2 10.7), the last letter too; a letter of a weak-point word throws none, and the Baron\'s finisher none', function () {
  const env = loadEnv();
  const TG = env.TG;
  const G = TG.C.GROUND_Y;
  const letter = function (kind, wordKind, complete) {
    const s = bossFight(TG, kind);
    const word = { id: 999, kind: wordKind, word: 'clockwork', typable: true, typed: 3, x: s.boss.x, y: s.boss.y - 32 };
    TG.Events.emit('type:hit', { target: word, id: 999, kind: wordKind, ch: 'c', index: 3, length: 9, complete: complete, x: word.x, y: word.y });
    const start = squaresOf(TG);
    // The ink bolt of a completed word draws its trail in squares too, in AQUA and index 6.
    const colors = particleColors(TG, env, s).filter(function (c) { return c !== 11 && c !== 6; });
    for (let i = 0; i < 6; i++) TG.Effects.update(1 / 60);
    return { start: start, colors: colors, later: squaresOf(TG).slice(0, start.length) };
  };
  for (const complete of [false, true]) {
    const got = letter('ratchet', 'finisher', complete);
    if (got.start.length !== 3 || got.colors.length !== 3) return 'a finisher letter' + (complete ? ', the last,' : '') + ' throws ' + got.start.length + ' sparks';
    if (!got.colors.every(function (c) { return [18, 19, 4].indexOf(c) !== -1; })) return 'the sparks are in ' + got.colors.join(' ');
    // They start 4 px behind the key (her key is at +14, -30) and 5 px over it, and go up and to the right.
    for (let k = 0; k < 3; k++) {
      const a = got.start[k], b = got.later[k];
      if (a.x !== BOSS_SX + 18 || a.y !== G - 35) return 'a spark starts at ' + a.x + ',' + a.y;
      if (!(b.x > a.x + 1.5) || !(b.y < a.y - 1)) return 'a spark is at ' + b.x.toFixed(1) + ',' + b.y.toFixed(1) + ' after 6 steps';
    }
  }
  if (letter('ratchet', 'core', false).start.length) return 'a letter of a weak-point word throws sparks';
  if (letter('baron', 'finisher', false).start.length || letter('nobody', 'finisher', false).start.length) return 'the Baron\'s finisher throws sparks';
  if (env.errors.length || env.warnings.length) return env.errors.concat(env.warnings)[0];
});

check('her defeat (LEVEL2 2, 10.7): the freeze and the flash as the Baron\'s; at 0.55 s the key shoots out of her back, turning, clatters on the floor behind her and lies still there, and her goggles fly off; at 1.2 s the hatch bursts in steam and sparks and the letter fountain erupts from it; 14 fx_cogbit rain down and bounce; and 16 fx_flake drift down the shaft over her, more of them until the results come', function () {
  const env = loadEnv();
  const TG = env.TG;
  const C = TG.C;
  const G = C.GROUND_Y;
  const STEPS = 240;                 // LEVEL_COMPLETE_TIME
  const SCROLL = 1;
  // Everything of a defeat: the sprites, the first letter of the fountain, the sparks, the flash, and the
  // tracks of the cogs and the flakes as TG.Effects lists them, which is in the order they were made.
  const defeat = function (kind) {
    const s = bossFight(TG, kind, function (st) { st.screen = 'levelComplete'; st.boss.state = 'defeated'; st.boss.pose = 'dizzy'; });
    TG.Events.emit('boss:defeat', { x: s.boss.x, y: s.boss.y });
    const d = { seen: [], letter: null, letters: TG.Effects._list().filter(function (f) { return f.type === 'letter'; }).length,
      sparks: null, flash: [], cogs: [], flakes: [] };
    const bad = watchEffects(TG, env, s, STEPS, SCROLL, function (i, pic) {
      pic.sprites.forEach(function (c) { d.seen.push(Object.assign({ step: i }, c)); });
      if (!d.letter) {
        const l = writingDrawn(TG, env, s).letters[0];
        if (l) d.letter = Object.assign({ step: i }, l);
      }
      if (!d.sparks) {
        const colors = particleColors(TG, env, s);
        if (colors.length) d.sparks = { step: i, colors: colors };
      }
      if (TG.Effects.flash() !== null) d.flash.push(i);
      const list = TG.Effects._list();
      list.filter(function (f) { return f.kind === 'fx_cogbit'; }).forEach(function (f, k) { (d.cogs[k] = d.cogs[k] || []).push(f.y); });
      list.filter(function (f) { return f.kind === 'fx_flake'; }).forEach(function (f, k) { (d.flakes[k] = d.flakes[k] || []).push(f.y); });
    });
    if (bad) throw new Error(bad);
    return d;
  };
  const d = defeat('ratchet');
  const names = {};
  d.seen.forEach(function (c) { names[c.name] = true; });
  if (Object.keys(names).sort().join(' ') !== 'boss2_goggles boss2_key fx_cogbit fx_flake fx_poof') return 'her defeat draws ' + Object.keys(names).sort().join(' ');
  if (d.flash.length !== 2 || !about(d.flash[0], 30)) return 'the flash is at steps ' + d.flash.join(' ');

  // The key: out of her back, where TG.Render draws it (14 px behind her middle, 30 px up).
  const key = drawsOf(d.seen, 'boss2_key');
  if (!key.length || !about(key[0].step, 33) || Math.abs(key[0].x - (BOSS_SX + 14)) > 2 || key[0].y > G - 30 || key[0].y < G - 36) return 'the key starts at step ' + (key[0] || {}).step + ' at ' + (key[0] || {}).x + ',' + (key[0] || {}).y;
  const top = Math.min.apply(null, key.map(function (c) { return c.y; }));
  if (!(top < G - 80) || top < C.PLAY_TOP + 20) return 'the key goes up to y ' + top;
  // On the floor from its first touch: three bounces, then still. Its bottom row is the tip of its stem.
  const touch = key.filter(function (c) { return c.y === G - 1; });
  if (!touch.length || key.some(function (c) { return c.y > G - 1; })) return 'the key does not come down on the floor';
  const air = key.filter(function (c) { return c.step < touch[0].step; });
  for (const fr of [0, 1, 2, 3]) if (!air.some(function (c) { return c.frame === fr; })) return 'the key does not turn through frame ' + fr + ' in the air';
  let bounces = 0;
  for (let k = 1; k < key.length; k++) if (key[k - 1].y === G - 1 && key[k].y < G - 1) bounces++;
  if (bounces !== 3) return 'the key bounces ' + bounces + ' times';
  let lastUp = 0;
  key.forEach(function (c, k) { if (c.y < G - 1) lastUp = k; });
  const rest = key.slice(lastUp + 1);
  const lies = rest[0];
  if (rest.length < 30 || !(lies.x > BOSS_SX + 24) || lies.x > 380) return 'the key lies at x ' + (lies || {}).x + ' for ' + rest.length + ' draws';
  // At rest it shows its first frame and stays where it lies while the view scrolls on.
  for (const c of rest) {
    if (c.frame !== 0 || c.x !== lies.x - SCROLL * (c.step - lies.step)) return 'at rest the key is in frame ' + c.frame + ' at x ' + c.x + ' at step ' + c.step + ', from ' + lies.x + ' at step ' + lies.step;
  }

  // The goggles, from her brow as on a hit.
  const gog = drawsOf(d.seen, 'boss2_goggles');
  if (!gog.length || !about(gog[0].step, 33) || Math.abs(gog[0].x - (BOSS_SX - 5)) > 2 || gog[0].y > G - 53 || gog[0].y < G - 58) return 'the goggles start at step ' + (gog[0] || {}).step + ' at ' + (gog[0] || {}).x + ',' + (gog[0] || {}).y;
  if (!(gog[gog.length - 1].x < BOSS_SX - 25)) return 'the goggles end at x ' + gog[gog.length - 1].x;
  // The hand-built boss is in phase 2 with her lenses RED.
  if (gog.some(function (c) { return c.remap !== 'lampred'; }) || key.some(function (c) { return c.remap !== null; })) return 'the goggles are drawn under ' + gog[0].remap + ' and the key under ' + key[0].remap;

  // The puffs: one at her back with the key; at 1.2 s one over the hatch, then steam at each end of the engine.
  const poofs = puffsOf(d.seen);
  const wantPoofs = [[BOSS_SX + 14, 33], [BOSS_SX, 72], [BOSS_SX - 19, 74], [BOSS_SX + 19, 76]];
  if (poofs.length !== 4 || poofs.some(function (r, k) { return r.x !== wantPoofs[k][0] || !about(r.from, wantPoofs[k][1]) || !playsOnce(r); })) return 'the puffs: ' + JSON.stringify(poofs);
  if (!d.sparks || !about(d.sparks.step, 72) || d.sparks.colors.length !== 10 || !d.sparks.colors.every(function (c) { return [18, 19, 4].indexOf(c) !== -1; })) return 'the sparks of the hatch: ' + JSON.stringify(d.sparks);
  // The fountain: Level 1's 24 letters, from the middle of the hatch (its dark is 12 px under the engine's top).
  if (d.letters !== 24 || !d.letter || !about(d.letter.step, 72)) return 'the fountain has ' + d.letters + ' letters, the first at step ' + (d.letter || {}).step;
  if (Math.abs(d.letter.x - BOSS_SX) > 4 || d.letter.y > G - 12 || d.letter.y < G - 20) return 'the fountain starts at ' + d.letter.x + ',' + d.letter.y;

  // The cogs: none before she has gone up, then all 14, in both frames, from above the playfield.
  const cog = drawsOf(d.seen, 'fx_cogbit');
  if (cog[0].step < 99 || cog[0].step > 101 || cog[0].y > C.PLAY_TOP) return 'the first cog is drawn at step ' + cog[0].step + ' at y ' + cog[0].y;
  const at160 = cog.filter(function (c) { return c.step === 160; });
  if (at160.length !== 14 || at160.filter(function (c) { return c.frame === 0; }).length !== 7) return at160.length + ' cogs at step 160';
  if (cog.some(function (c) { return c.y > G - 4 || c.x < BOSS_SX - 140 || c.x > BOSS_SX + 100; })) return 'a cog is under the floor or far from her';
  // Each lands on the floor, and the first is seen to bounce: up again by 10 px or more, and down.
  if (d.cogs.length !== 14) return d.cogs.length + ' cogs listed';
  const up = function (ys) {
    const landed = ys.indexOf(G - 4);
    return landed === -1 ? -1 : G - 4 - Math.min.apply(null, ys.slice(landed));
  };
  for (let k = 0; k < 8; k++) if (up(d.cogs[k]) < 10) return 'cog ' + k + ' rises ' + up(d.cogs[k]) + ' px after it lands';
  if (d.cogs[0][d.cogs[0].length - 1] !== G - 4) return 'the first cog ends at y ' + d.cogs[0][d.cogs[0].length - 1];

  // The snow: from the fanfare on (1.8 s), one flake after another to the end, down the shaft over her.
  const flake = drawsOf(d.seen, 'fx_flake');
  if (flake[0].step < 108 || flake[0].step > 110) return 'the first flake is drawn at step ' + flake[0].step;
  const counts = [150, 190, STEPS - 1].map(function (st) { return flake.filter(function (c) { return c.step === st; }).length; });
  if (!(counts[0] >= 4 && counts[1] > counts[0] + 2 && counts[2] === 16)) return 'flakes at steps 150, 190 and 239: ' + counts.join(' ');
  if (flake.some(function (c) { return Math.abs(c.x - BOSS_SX) > 16 || c.y > G - 40; })) return 'a flake is out of the shaft or down at her engine';
  if (!flake.some(function (c) { return c.frame === 0; }) || !flake.some(function (c) { return c.frame === 1; })) return 'the flakes do not turn';
  if (d.flakes.length !== 16) return d.flakes.length + ' flakes listed';
  for (const ys of d.flakes) for (let k = 1; k < ys.length; k++) if (ys[k] < ys[k - 1]) return 'a flake goes up';
  // The first has come 2.2 s down at 34 to 52 px a second: well into the playfield.
  const far = d.flakes[0][d.flakes[0].length - 1];
  if (far < C.PLAY_TOP + 60 || far > C.PLAY_TOP + 115) return 'the first flake is at y ' + far.toFixed(1) + ' at the end';
  if (TG.Effects.count() > 256) return TG.Effects.count() + ' effects';

  // The Baron's: his helmet at 0.55 s, three puffs, the fountain from the hole in his mound at 2.2 s.
  for (const kind of ['baron', 'nobody']) {
    const b = defeat(kind);
    const bn = {};
    b.seen.forEach(function (c) { bn[c.name] = true; });
    if (Object.keys(bn).sort().join(' ') !== 'boss_helmet fx_poof') return 'the defeat of the ' + kind + ' draws ' + Object.keys(bn).sort().join(' ');
    if (!about(drawsOf(b.seen, 'boss_helmet')[0].step, 33) || b.sparks) return 'the helmet of the ' + kind + ' at step ' + drawsOf(b.seen, 'boss_helmet')[0].step + (b.sparks ? ', with sparks' : '');
    if (b.letters !== 24 || !about(b.letter.step, 132) || Math.abs(b.letter.x - (BOSS_SX - 4)) > 4) return 'the fountain of the ' + kind + ' starts at step ' + b.letter.step + ' at x ' + b.letter.x;
  }
  if (env.errors.length || env.warnings.length) return env.errors.concat(env.warnings)[0];
});

check('the Baronet\'s clear (LEVEL2 4.4): a digby in the skin en_baronet loses his spare helmet, boss_helmet, and his monocle, which flies off to Pip\'s side from over his eye; he spins down bare, and where a mole leaves a daisy a cog grows: the collar of fx_cogbit, then the cog. Underground he pops out of the mound first. A plain mole and a mole in another skin keep fx_helmet and the daisy; a Baronet that reaches Pip is knocked away with nothing more', function () {
  const cleared = function (skin, elev, event) {
    const env = loadEnv();
    const TG = env.TG;
    TG.Sprites.define('x_mole', TG.Sprites.get('en_digby'));
    const s = handState(TG, 'boss');
    s.entities = [];
    s.boss.word = null;
    withGame(TG, s);
    const p = clearOf(s, 'digby', 180, TG.C.GROUND_Y - elev);
    if (skin) s.entities.push(removed(entity(TG, s, 'digby', 'gear', 84, elev, { id: p.id, skin: skin, phase: elev < 0 ? 'mound' : 'up' }), event ? 'hit' : 'cleared'));
    if (event) TG.Events.emit(event, { id: p.id, kind: 'digby', word: 'gear', typed: 0, x: s.player.x + 13, y: s.player.y });
    else TG.Events.emit('word:clear', p);
    const seen = [];
    for (let i = 0; i < 200; i++) {
      effectsPicture(TG, env, s).sprites.forEach(function (c) { seen.push(Object.assign({ step: i }, c)); });
      TG.Effects.update(1 / 60);
    }
    if (env.errors.length || env.warnings.length) throw new Error(env.errors.concat(env.warnings)[0]);
    return seen;
  };
  const has = function (seen, name) { return drawsOf(seen, name).length > 0; };
  const G = stubs.load({ files: ['js/core.js'] }).TG.C.GROUND_Y;

  for (const elev of [0, -16]) {
    const where = elev < 0 ? 'underground' : 'above ground';
    const seen = cleared('en_baronet', elev, null);
    if (has(seen, 'en_digby') || has(seen, 'fx_helmet') || has(seen, 'fx_daisy')) return where + ': the Baronet is cleared as a mole';
    const him = drawsOf(seen, 'en_baronet');
    if (!him.some(function (c) { return c.frame === 'up'; }) || !him.some(function (c) { return c.frame === 'spin'; })) return where + ': he is drawn in ' + him.map(function (c) { return c.frame; }).filter(function (f, i, a) { return a.indexOf(f) === i; }).join(' ');
    // The helmet and the monocle go together: after the ink bolt and the white flash (9 steps), and
    // underground after the 0.1 s in which he pops out of the mound.
    const helmet = drawsOf(seen, 'boss_helmet'), monocle = drawsOf(seen, 'boss_monocle');
    const from = elev < 0 ? 15 : 9;
    if (!helmet.length || !monocle.length || !about(helmet[0].step, from) || monocle[0].step !== helmet[0].step) return where + ': the helmet from step ' + (helmet[0] || {}).step + ', the monocle from ' + (monocle[0] || {}).step;
    // The monocle starts over his left eye (3 px left of his middle, 9 up), flies 20 px or more to the left
    // and lands; the helmet goes the other way.
    if (Math.abs(monocle[0].x - 177) > 2 || monocle[0].y > G - 9 || monocle[0].y < G - 14) return where + ': the monocle starts at ' + monocle[0].x + ',' + monocle[0].y;
    if (!(monocle[monocle.length - 1].x < 157) || Math.max.apply(null, monocle.map(function (c) { return c.y; })) !== G - 4) return where + ': the monocle ends at x ' + monocle[monocle.length - 1].x;
    if (!(helmet[helmet.length - 1].x > 190)) return where + ': the helmet ends at x ' + helmet[helmet.length - 1].x;
    // The cog, where he went down: the collar for 0.15 s, 1 px lower so that it stands on the floor, then
    // the cog of eight teeth for the rest of the daisy's 1.8 s.
    const cog = drawsOf(seen, 'fx_cogbit');
    const end = elev < 0 ? 40 : 34;                  // the ink bolt, the flash and the 0.42 or 0.52 s of the mole's clear
    const looks = runsOf(cog.map(function (c) { return c.frame + '@' + c.x + ',' + c.y; }));
    if (!cog.length || !about(cog[0].step, end) || looks.length !== 2 || looks[0][0] !== '1@180,' + (G - 3) || looks[1][0] !== '0@180,' + (G - 4)) return where + ': the cog from step ' + (cog[0] || {}).step + ': ' + JSON.stringify(looks);
    if (Math.abs(looks[0][1] - 9) > 1 || looks[1][1] < 85 || cog[cog.length - 1].step > end + 110) return where + ': the collar for ' + looks[0][1] + ' steps, the cog for ' + looks[1][1] + ', to step ' + cog[cog.length - 1].step;
  }

  // A mole, and a mole in a skin that is not the Baronet's, as before.
  for (const skin of [null, 'x_mole']) {
    const seen = cleared(skin, 0, null);
    if (!has(seen, 'fx_helmet') || !has(seen, 'fx_daisy') || !has(seen, skin || 'en_digby')) return 'a mole in ' + skin + ' has no fx_helmet or no daisy';
    if (has(seen, 'boss_helmet') || has(seen, 'boss_monocle') || has(seen, 'fx_cogbit')) return 'a mole in ' + skin + ' is cleared as the Baronet';
  }
  // Knocked away: the Baronet as he was drawn, and nothing of his clear.
  const hit = cleared('en_baronet', 0, 'threat:hit');
  if (!has(hit, 'en_baronet') || has(hit, 'boss_helmet') || has(hit, 'boss_monocle') || has(hit, 'fx_cogbit')) return 'a Baronet that reaches Pip: ' + hit.map(function (c) { return c.name; }).filter(function (n, i, a) { return a.indexOf(n) === i; }).join(' ');
});

check('a Baronet cleared on his way up stays in sight (LEVEL2 4.4), as TG.Render drew him: through the ink bolt and the white flash the rows that were out of the ground stand in front of his mound in the frame he had, white in the flash; then he comes out the rest of the way from there, the mound behind him, in the peek frame until 12 rows are out; with 11 or 15 rows out as with 3. A mole is its mound alone until it pops out from behind it, all 16 px, and with its feet less than 6 px under the floor it is drawn whole at once', function () {
  const G = stubs.load({ files: ['js/core.js'] }).TG.C.GROUND_Y;
  // What TG.Effects draws of the creature and its mound on each step of a clear at this elev, to the step
  // before its spin frame: 'mound', and the creature as 'frame top rows' with top from the ground line,
  // joined in the order drawn; ':w' marks the white remap.
  const watch = function (skin, elev) {
    const env = loadEnv();
    const TG = env.TG;
    TG.Sprites.define('x_mole', TG.Sprites.get('en_digby'));
    const s = handState(TG, 'boss');
    s.entities = [];
    s.boss.word = null;
    withGame(TG, s);
    const p = clearOf(s, 'digby', 180, G - elev);
    if (skin) s.entities.push(removed(entity(TG, s, 'digby', 'gear', 84, elev, { id: p.id, skin: skin, phase: 'up' }), 'cleared'));
    TG.Events.emit('word:clear', p);
    const name = skin || 'en_digby';
    const ctx = env.canvas.getContext('2d');
    const draw = TG.Gfx.draw, get = TG.Gfx.get, drawImage = ctx.drawImage;
    const cut = new Map();
    const looks = [];
    let row = null;
    TG.Gfx.draw = function (c, n, frame, x, y, o) {
      if (n === 'en_mound') row.push('mound' + (o && o.remap === 'white' ? ':w' : ''));
      return draw.apply(TG.Gfx, arguments);
    };
    TG.Gfx.get = function (n, frame, o) {
      const cv = get.apply(TG.Gfx, arguments);
      if (cv && n === name) cut.set(cv, frame + (o && o.remap === 'white' ? ':w' : ''));
      return cv;
    };
    ctx.drawImage = function (cv, sx, sy, sw, sh, dx, dy) {
      if (arguments.length === 9 && cut.has(cv)) row.push(cut.get(cv) + ' ' + (dy - G) + ' ' + sh);
      return drawImage.apply(ctx, arguments);
    };
    try {
      for (let i = 0; i < 40; i++) {
        row = [];
        TG.Effects.draw(ctx, 'world', s.camera.x);
        if (row.some(function (r) { return r.indexOf('spin') === 0; })) break;
        looks.push(row.join('|'));
        TG.Effects.update(1 / 60);
      }
    } finally { TG.Gfx.draw = draw; TG.Gfx.get = get; ctx.drawImage = drawImage; }
    if (env.errors.length || env.warnings.length) throw new Error(env.errors.concat(env.warnings)[0]);
    return runsOf(looks);
  };
  // The bolt for 6 steps and the flash for 3, give or take one as the sum of the steps falls.
  const still = function (runs, plain, white) {
    return runs.length >= 2 && runs[0][0] === plain && Math.abs(runs[0][1] - 6) <= 1 && runs[1][0] === white && Math.abs(runs[1][1] - 3) <= 1;
  };

  // The Baronet with 8 rows out: they stay, and he comes up from there in about 0.1 s.
  const him = watch('en_baronet', -8);
  if (!still(him, 'mound|peek -8 8', 'mound:w|peek:w -8 8')) return 'the Baronet through the bolt and the flash: ' + JSON.stringify(him.slice(0, 3));
  const out = him.slice(2);
  let rows = 8, steps = 0;
  for (const r of out) {
    const m = /^mound\|(peek|up) (-\d+) (\d+)$/.exec(r[0]);
    if (!m || Number(m[3]) < rows || Number(m[2]) !== -Number(m[3]) || m[1] !== (Number(m[3]) < 12 ? 'peek' : 'up')) return 'the Baronet coming out: ' + JSON.stringify(out);
    rows = Number(m[3]);
    steps += r[1];
  }
  if (rows < 14 || steps < 5 || steps > 7) return 'the Baronet comes out to ' + rows + ' rows in ' + steps + ' steps';
  // With 3 rows out it is the same picture, lower.
  if (!still(watch('en_baronet', -13), 'mound|peek -3 3', 'mound:w|peek:w -3 3')) return 'the Baronet with 3 rows out is not drawn through the bolt and the flash';
  // Nearly out, where a mole's clear draws it whole at once: he stays where he was, in the frame he had,
  // and comes up the last rows from there. [elev, his frame, rows out]
  for (const c of [[-5, 'peek', 11], [-4, 'up', 12], [-1, 'up', 15]]) {
    const near = watch('en_baronet', c[0]);
    const look = c[1] + ' -' + c[2] + ' ' + c[2], white = c[1] + ':w -' + c[2] + ' ' + c[2];
    if (!still(near, 'mound|' + look, 'mound:w|' + white)) return 'the Baronet with ' + c[2] + ' rows out, through the bolt and the flash: ' + JSON.stringify(near.slice(0, 3));
    let was = c[2];
    for (const r of near.slice(2)) {
      const m = /^mound\|(peek|up) (-\d+) (\d+)$/.exec(r[0]);
      if (!m || Number(m[3]) < was || Number(m[3]) > was + 3 || Number(m[2]) !== -Number(m[3])) return 'the Baronet with ' + c[2] + ' rows out, coming out: ' + JSON.stringify(near.slice(2));
      was = Number(m[3]);
    }
    if (was < 15) return 'the Baronet with ' + c[2] + ' rows out comes out to ' + was + ' rows';
  }
  // Fully out, there is nothing to come up: he is drawn whole, with no mound, as a mole is.
  if (!still(watch('en_baronet', 0), 'up -16 16', 'up:w -16 16')) return 'the Baronet cleared above ground: ' + JSON.stringify(watch('en_baronet', 0).slice(0, 3));

  // A mole and a mole in another skin: the mound alone, then out from behind it in the up frame.
  for (const skin of [null, 'x_mole']) {
    const mole = watch(skin, -8);
    if (!still(mole, 'mound', 'mound:w')) return 'a mole in ' + skin + ' through the bolt and the flash: ' + JSON.stringify(mole.slice(0, 3));
    const up = mole.slice(2).filter(function (r) { return r[0] !== 'mound'; });
    if (!up.length || !up.every(function (r) { return /^up -\d+ \d+\|mound$/.test(r[0]); })) return 'a mole in ' + skin + ' coming out: ' + JSON.stringify(mole.slice(2));
    if (!/^up -[1-3] [1-3]\|mound$/.test(up[0][0])) return 'a mole in ' + skin + ' does not come out from under the ground: ' + up[0][0];
    // With its feet 5 px under the floor a mole is cleared as one above ground, as in Level 1: whole at once.
    const near = watch(skin, -5);
    if (!still(near, 'up -16 16', 'up:w -16 16')) return 'a mole in ' + skin + ' with its feet 5 px under the floor: ' + JSON.stringify(near.slice(0, 3));
  }
});

check('Effects without TG.Gfx or TG.Font: the events of her fight, her intro, her defeat and the Baronet\'s clear do not throw, and never more than 256 effects are live', function () {
  const env = stubs.load({ files: ['js/core.js'].concat(WPF_FILES), canvas: 'soft' });
  const TG = env.TG;
  TG.Events.clear();
  TG.Effects.init();
  const s = handState(TG, 'boss');
  s.entities = [];
  s.boss.kind = 'ratchet';
  s.boss.phase = 3;
  s.boss.volley = { toLaunch: ['rock', 'rockhigh', 'minion'], launched: 3, sinceLaunch: 0, hits: 3 };
  TG.Game = { state: s };
  const word = { id: 1000, kind: 'finisher', word: 'synchronisation', typable: true, typed: 0, x: s.boss.x, y: s.boss.y - 32 };
  const baronet = removed(entity(TG, s, 'digby', 'gear', 84, 0, { skin: 'en_baronet', phase: 'up' }), 'cleared');
  s.entities.push(baronet);
  let most = 0;
  const run = function (steps) {
    for (let i = 0; i < steps; i++) {
      TG.Effects.update(1 / 60);
      most = Math.max(most, TG.Effects.count());
      TG.Effects.draw(env.canvas.getContext('2d'), 'world', s.camera.x);
      TG.Effects.draw(env.canvas.getContext('2d'), 'screen', 0);
    }
  };
  TG.Events.emit('boss:enter', {});
  run(120);
  TG.Events.emit('boss:state', { state: 'volley', phase: 3, round: 1 });
  TG.Events.emit('boss:throw', { kind: 'rock', x: s.player.x + 190, y: 144 });
  TG.Events.emit('word:clear', Object.assign(clearOf(s, 'digby', 180, TG.C.GROUND_Y), { id: baronet.id }));
  TG.Events.emit('boss:weakopen', { id: 999, word: 'monocle', window: 6.3 });
  TG.Events.emit('boss:hit', { health: 2, maxHealth: 6, phase: 3, x: s.boss.x, y: s.boss.y - 32 });
  TG.Events.emit('boss:phase', { phase: 3 });
  run(40);
  for (let k = 0; k < 15; k++) {
    TG.Events.emit('type:hit', { target: word, id: 1000, kind: 'finisher', ch: 's', index: k, length: 15, complete: k === 14, x: word.x, y: word.y });
    run(4);
  }
  TG.Events.emit('boss:defeat', { x: s.boss.x, y: s.boss.y });
  run(250);
  if (most > 256) return most + ' effects at once';
  if (most < 60) return 'only ' + most + ' effects at once: the defeat was not played';
  if (env.errors.length) return env.errors[0];
});

if (!(SIM_PRESENT && fs.existsSync(path.join(stubs.ROOT, 'js/levels/level2.js')))) {
  skip('in the game, Lady Ratchet\'s fight plays her effects from its own events', 'the simulation files are not all present');
} else {
  check('in the game, Lady Ratchet\'s fight plays her effects from its own events: the four puffs of her intro at boss:enter, the goggles at every boss:hit and "1..." at every hit but the last, steam at each round of phase 3 and at each window after a volley cleared whole, three sparks for each letter of the finisher, and at boss:defeat the key, the goggles, 24 letters, 14 cogs and 16 flakes; the Baronet loses his helmet and his monocle and leaves a cog; never more than 256 effects, and no console output', function () {
    const G = 184;
    const seen = { enter: [], hits: [], rounds: [], windows: [], letters: [], defeat: null, baronet: null, most: 0 };
    let boss = null;
    const res = simulate({ difficulty: 'medium', profile: 'target', until: 'results', seed: 1, levelId: 2 }, function (TG, s, env, n) {
      if (n === 1) {
        // Listeners added here are called after those of TG.Effects, which has made its effects by then.
        // Each looks at the effects in screen px, near the boss where the kind of an effect alone would not tell.
        const list = function () { return TG.Effects._list(); };
        const count = function (kind) { return list().filter(function (f) { return f.kind === kind; }).length; };
        const puffsAt = function (dx, dy) {
          const st = TG.Game.state;
          const bx = st.boss.x - st.camera.x;
          return list().filter(function (f) { return f.kind === 'fx_poof' && Math.abs(f.x - (bx + dx)) < 0.01 && Math.abs(f.y - (G + dy)) < 0.01; }).length;
        };
        TG.Events.on('boss:enter', function () {
          seen.enter.push([puffsAt(0, -14), puffsAt(-19, -17), puffsAt(19, -17)].join(' '));
        });
        TG.Events.on('boss:hit', function (p) {
          seen.hits.push(p.health + ':' + count('boss2_goggles') + ':' + count('1...') + ':' + count('boss_monocle'));
        });
        TG.Events.on('boss:state', function (p) {
          if (p.state === 'volley') seen.rounds.push(p.phase + ':' + puffsAt(-19, -17) + puffsAt(19, -17));
        });
        TG.Events.on('boss:weakopen', function () {
          const v = TG.Game.state.boss.volley;
          seen.windows.push((v.hits >= v.toLaunch.length ? 'whole' : 'part') + ':' + puffsAt(-30, -12));
        });
        TG.Events.on('type:hit', function (p) {
          if (p.kind !== 'finisher') return;
          const st = TG.Game.state;
          const bx = st.boss.x - st.camera.x;
          seen.letters.push(list().filter(function (f) { return f.type === 'part' && !f.kind && Math.abs(f.x - (bx + 18)) < 0.01 && f.y === G - 35; }).length);
        });
        TG.Events.on('boss:defeat', function () {
          seen.defeat = ['boss2_key', 'boss2_goggles', 'fx_cogbit', 'fx_flake', 'boss_helmet'].map(count).join(' ') + ' ' +
            list().filter(function (f) { return f.type === 'letter' && f.layer === 'world'; }).length;
        });
        TG.Events.on('word:clear', function (p) {
          const e = (TG.Game.state.entities || []).filter(function (x) { return x.id === p.id; })[0];
          if (e && e.skin === 'en_baronet') seen.baronet = {};
        });
      }
      if (s.boss) boss = s.boss.kind;
      seen.most = Math.max(seen.most, TG.Effects.count());
      // What the Baronet's clear throws and leaves, in the steps after it and before her defeat.
      if (seen.baronet && !seen.defeat) {
        TG.Effects._list().forEach(function (f) { if (/^(boss_helmet|boss_monocle|fx_cogbit|fx_helmet|fx_daisy)$/.test(String(f.kind))) seen.baronet[f.kind] = true; });
      }
      return null;
    });
    if (res.problem) return res.problem;
    if (res.report.error) return res.report.error;
    if (!res.report.finished || boss !== 'ratchet') return 'the run did not finish her fight';
    if (seen.enter.join('|') !== '1 2 1') return 'at boss:enter the puffs at the hatch, the left end and the right end are ' + seen.enter.join('|');
    // One pair of goggles for each weak point, down to health 0, and a popup for each but that one.
    const hits = seen.hits.map(function (h, k) { return (seen.hits.length - 1 - k) + ':1:' + (k < seen.hits.length - 1 ? 1 : 0) + ':0'; });
    if (seen.hits.length < 3 || seen.hits.join(' ') !== hits.join(' ')) return 'at each boss:hit, health:goggles:popups:monocles are ' + seen.hits.join(' ');
    const rounds3 = seen.rounds.filter(function (r) { return r.charAt(0) === '3'; });
    if (!rounds3.length || seen.rounds.some(function (r) { return r !== (r.charAt(0) === '3' ? '3:11' : r.charAt(0) + ':00'); })) return 'at each round, phase:steam is ' + seen.rounds.join(' ');
    if (seen.windows.indexOf('whole:1') === -1 || seen.windows.some(function (w) { return w !== 'whole:1' && w !== 'part:0'; })) return 'at each window: ' + seen.windows.join(' ');
    if (seen.letters.length < 10 || seen.letters.some(function (k) { return k !== 3; })) return 'the sparks at each finisher letter: ' + seen.letters.join(' ');
    if (seen.defeat !== '1 1 14 16 0 24') return 'at boss:defeat the key, goggles, cogs, flakes, helmets and fountain letters are ' + seen.defeat;
    if (!seen.baronet) return 'the bot did not clear the Baronet';
    if (Object.keys(seen.baronet).sort().join(' ') !== 'boss_helmet boss_monocle fx_cogbit') return 'the Baronet\'s clear makes ' + Object.keys(seen.baronet).sort().join(' ');
    if (seen.most > 256) return seen.most + ' effects at once';
    if (res.env.errors.length || res.env.warnings.length) return 'console: ' + res.env.errors.concat(res.env.warnings)[0];
  });
}

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
  // The boss's intro clock, boss.stateT, runs with screenT until a pause; which of the two times the plate
  // is in the speech plate's own check below.
  const s = handState(TG, 'bossIntro', { screenT: 1.0 });
  Object.assign(s.boss, { state: 'intro', stateT: 1.0 });
  TG.Hud.draw(env.canvas.getContext('2d'), s);
  if (seen.some(function (t) { return t.indexOf('MY MEADOW') === 0; })) return 'speech in the first half';
  const t = handState(TG, 'bossIntro', { screenT: 3.5 });
  Object.assign(t.boss, { state: 'intro', stateT: 3.5 });
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
// 7. What the presentation reads from the level data (LEVEL2 13.4, milestone M0)
// ---------------------------------------------------------------------------------------------
//
// Every key is optional, and without it the picture is Level 1's. The cases below use scratch level
// data built here: sprite names that are not defined (TG.Gfx draws its labelled box for them and warns
// once per name), a scratch remap and a scratch backdrop. No Level 2 art is needed.

// Every sprite drawn during fn, in order: TG.Gfx.draw, and TG.Gfx.get for the parts that are drawn
// clipped at the ground line (those have no position here).
function drawCalls(TG, fn) {
  const calls = [];
  const draw = TG.Gfx.draw, get = TG.Gfx.get;
  TG.Gfx.draw = function (ctx, name, frame, x, y, o) {
    calls.push({ name: name, frame: frame, x: x, y: y, remap: (o && o.remap) || null, flipX: !!(o && o.flipX), anchor: !o || o.anchor !== false });
    return draw.apply(TG.Gfx, arguments);
  };
  TG.Gfx.get = function (name, frame, o) {
    calls.push({ name: name, frame: frame, remap: (o && o.remap) || null, flipX: !!(o && o.flipX), clipped: true });
    return get.apply(TG.Gfx, arguments);
  };
  try { fn(); } finally { TG.Gfx.draw = draw; TG.Gfx.get = get; }
  return calls;
}

function named(calls, name) {
  return calls.filter(function (c) { return c.name === name; });
}

// The colours of the 1 and 2 px square particles that TG.Effects draws in the world.
function particleColors(TG, env, s) {
  const colors = [];
  const rect = TG.Gfx.rect;
  TG.Gfx.rect = function (ctx, x, y, w, h, c) {
    if (w === h && (w === 1 || w === 2)) colors.push(c);
    return rect.apply(TG.Gfx, arguments);
  };
  try { TG.Effects.draw(env.canvas.getContext('2d'), 'world', s.camera.x); } finally { TG.Gfx.rect = rect; }
  return colors;
}

const SCRATCH_TILES = {
  top: 'x_top', fill: 'x_fill', edgeL: 'x_edge_l', edgeR: 'x_edge_r', wallL: 'x_wall_l', wallR: 'x_wall_r',
  gapFill: 'x_pool', gapFillDark: 'x_dark', plank: 'x_girder', arenaTop: 'x_floor', arenaFill: 'x_under', rail: 'x_rail'
};
const SCRATCH_HAZARDS = { bramble: 'x_spikes', branch: 'x_pipe', beehive: 'x_lantern', arch: 'x_tunnel',
  trunk: 'x_riser', rope: 'x_chain', canopy: 'x_ceiling' };

check('tiles and hazards are drawn from theme.tiles and theme.hazardSkins: same frames, places and remaps, the theme\'s names', function () {
  const env = loadEnv();
  const TG = env.TG;
  // Level 1's sprite of each key, as the hand-built state (whose theme names none) draws it.
  const GROUND = { tile_grass: 'top', tile_soil: 'fill', tile_edge_l: 'edgeL', tile_edge_r: 'edgeR', tile_wall_l: 'wallL', tile_wall_r: 'wallR',
    tile_plank: 'plank' };
  const L1 = {
    playing: Object.assign({ tile_water: 'gapFill' }, GROUND),
    dark: Object.assign({ tile_dark: 'gapFillDark' }, GROUND),          // the gaps of a section with gapFill 'dark'
    boss: { tile_arena: 'arenaTop', tile_soil: 'arenaFill', tile_rail: 'rail' }
  };
  const L1_HAZ = { haz_bramble: 'bramble', haz_branch: 'branch', haz_beehive: 'beehive', haz_arch: 'arch', haz_trunk: 'trunk',
    haz_rope: 'rope', haz_canopy: 'canopy' };
  for (const scene of ['playing', 'dark', 'boss']) {
    const build = function (theme) {
      const s = handState(TG, scene === 'boss' ? 'boss' : 'playing', scene === 'dark' ? { section: 2 } : {});
      if (scene === 'dark') s.level.hazards.forEach(function (h) { h.section = 2; });
      Object.assign(s.level.theme, theme);
      return s;
    };
    const plain = drawCalls(TG, function () { TG.Render.draw(build({})); });
    const themed = drawCalls(TG, function () { TG.Render.draw(build({ tiles: SCRATCH_TILES, hazardSkins: SCRATCH_HAZARDS })); });
    const used = {};
    const want = plain.map(function (c) {
      let name = c.name;
      if (L1[scene][name]) { used[L1[scene][name]] = true; name = SCRATCH_TILES[L1[scene][name]]; }
      else if (L1_HAZ[name]) { used[L1_HAZ[name]] = true; name = SCRATCH_HAZARDS[L1_HAZ[name]]; }
      return Object.assign({}, c, { name: name });
    });
    if (themed.length !== want.length) return scene + ': ' + themed.length + ' sprites drawn, ' + want.length + ' without the theme names';
    for (let i = 0; i < want.length; i++) {
      if (JSON.stringify(themed[i]) !== JSON.stringify(want[i])) return scene + ': call ' + i + ' is ' + JSON.stringify(themed[i]) + ', want ' + JSON.stringify(want[i]);
    }
    // The scene must have exercised its keys, or the comparison proves nothing.
    const keys = Object.keys(L1[scene]).map(function (k) { return L1[scene][k]; }).concat(scene === 'boss' ? [] : Object.keys(SCRATCH_HAZARDS));
    const unused = keys.filter(function (k) { return !used[k]; });
    if (unused.length) return scene + ': the scene draws no ' + unused.join(', ');
  }
  if (env.errors.length) return env.errors[0];
});

check('without the theme names the fallbacks are Level 1\'s: the hand-built state draws the same sprites with Level 1\'s theme and with a theme that names none', function () {
  const env = loadEnv({ sim: SIM_PRESENT });
  const TG = env.TG;
  const theme = SIM_PRESENT ? TG.Levels[1].theme : {
    tiles: { top: 'tile_grass', fill: 'tile_soil', edgeL: 'tile_edge_l', edgeR: 'tile_edge_r', wallL: 'tile_wall_l', wallR: 'tile_wall_r',
      gapFill: 'tile_water', gapFillDark: 'tile_dark', plank: 'tile_plank', arenaTop: 'tile_arena', arenaFill: 'tile_soil', rail: 'tile_rail' },
    hazardSkins: { bramble: 'haz_bramble', branch: 'haz_branch', beehive: 'haz_beehive', arch: 'haz_arch' }
  };
  if (!theme.tiles || !theme.hazardSkins) return 'Level 1 names no tiles or hazard skins';
  for (const key of ['trunk', 'rope', 'canopy', 'archTrunk']) {
    if (key in theme.hazardSkins) return 'Level 1 names hazardSkins.' + key + ', so its fallback is not tested here';
  }
  for (const scene of [['playing', {}], ['playing', { section: 2 }], ['boss', {}]]) {
    const build = function (withNames) {
      const s = handState(TG, scene[0], scene[1]);
      if (scene[1].section) s.level.hazards.forEach(function (h) { h.section = scene[1].section; });
      if (withNames) { s.level.theme.tiles = theme.tiles; s.level.theme.hazardSkins = theme.hazardSkins; }
      return s;
    };
    const plain = JSON.stringify(drawCalls(TG, function () { TG.Render.draw(build(false)); }));
    const level1 = JSON.stringify(drawCalls(TG, function () { TG.Render.draw(build(true)); }));
    if (plain !== level1) return scene[0] + ' ' + JSON.stringify(scene[1]) + ': the two differ';
    for (const name of scene[0] === 'boss' ? ['tile_arena', 'tile_soil', 'tile_rail']
      : ['tile_grass', 'tile_soil', scene[1].section ? 'tile_dark' : 'tile_water', 'haz_bramble', 'haz_branch', 'haz_trunk', 'haz_canopy', 'haz_beehive', 'haz_rope', 'haz_arch']) {
      if (plain.indexOf('"' + name + '"') === -1) return scene[0] + ': ' + name + ' is not drawn';
    }
  }
  // A theme may name some keys and leave the others to the fallbacks.
  const s = handState(TG, 'playing');
  s.level.theme.tiles = { top: 'x_top' };
  s.level.theme.hazardSkins = { beehive: 'x_lantern' };
  const names = spritesDrawn(TG, function () { TG.Render.draw(s); });
  const missing = ['x_top', 'tile_soil', 'tile_water', 'x_lantern', 'haz_rope', 'haz_branch'].filter(function (n) { return names.indexOf(n) === -1; });
  if (missing.length) return 'a theme with two names: no ' + missing.join(', ');
  if (names.indexOf('tile_grass') !== -1 || names.indexOf('haz_beehive') !== -1) return 'a named key still draws Level 1\'s sprite';
});

check('the trunks under an arch are hazardSkins.archTrunk, which defaults to hazardSkins.trunk, which defaults to haz_trunk', function () {
  const env = loadEnv();
  const TG = env.TG;
  const HANG = TG.C.GROUND_Y - TG.C.HANG_CLEAR;
  const trunks = function (skins) {
    const s = handState(TG, 'playing');
    if (skins) s.level.theme.hazardSkins = skins;
    const branch = s.level.hazards[2], arch = s.level.hazards[4];
    const calls = drawCalls(TG, function () { TG.Render.draw(s); });
    const at = function (x) {
      const set = {};
      calls.forEach(function (c) { if (c.x === Math.floor(x - s.camera.x) && c.y < HANG && c.y > TG.C.PLAY_TOP && !c.clipped && /trunk|riser|column/.test(c.name)) set[c.name] = true; });
      return Object.keys(set).join(',');
    };
    return { branch: at(branch.x), archLeft: at(arch.x), archRight: at(arch.x + arch.w - 16) };
  };
  let t = trunks(null);
  if (t.branch !== 'haz_trunk' || t.archLeft !== 'haz_trunk' || t.archRight !== 'haz_trunk') return 'no names: ' + JSON.stringify(t);
  t = trunks({ trunk: 'x_riser' });
  if (t.branch !== 'x_riser' || t.archLeft !== 'x_riser' || t.archRight !== 'x_riser') return 'trunk only: ' + JSON.stringify(t);
  t = trunks({ trunk: 'x_riser', archTrunk: 'x_column' });
  if (t.branch !== 'x_riser' || t.archLeft !== 'x_column' || t.archRight !== 'x_column') return 'trunk and archTrunk: ' + JSON.stringify(t);
  t = trunks({ archTrunk: 'x_column' });
  if (t.branch !== 'haz_trunk' || t.archLeft !== 'x_column') return 'archTrunk only: ' + JSON.stringify(t);
});

check('a theme name with no sprite still draws: the labelled box of TG.Gfx where the tile or hazard goes, with one warning per name', function () {
  const env = loadEnv();
  const TG = env.TG;
  const pal = paletteSet(TG);
  const G = TG.C.GROUND_Y;
  const s = handState(TG, 'playing');
  // Screen column 1 (x 16 to 31) is plain ground in the hand-built scene.
  TG.Render.draw(s);
  if (pixel(env.canvas.toRGBA(), 384, 16, G) === pal[26]) return 'the grass tile already has a CORAL corner, so the box cannot be told from it';
  s.level.theme.tiles = { top: 'tile_nosuch' };
  s.level.theme.hazardSkins = { arch: 'haz_nosuch' };
  let names = [];
  for (let i = 0; i < 2; i++) names = spritesDrawn(TG, function () { TG.Render.draw(s); });
  const rgba = env.canvas.toRGBA();
  // The box: INK with a 1 px CORAL border, 16 x 16 for a name that is not in the manifest.
  for (const p of [[16, G], [31, G], [16, G + 15], [31, G + 15], [24, G], [16, G + 8]]) {
    if (pixel(rgba, 384, p[0], p[1]) !== pal[26]) return 'no CORAL border at ' + p.join(',') + ': ' + pixel(rgba, 384, p[0], p[1]);
  }
  if (pixel(rgba, 384, 17, G + 1) !== pal[0]) return 'the box is not INK inside';
  if (names.indexOf('haz_nosuch') === -1) return 'the hazard with an unknown skin is not drawn';
  for (const name of ['tile_nosuch', 'haz_nosuch']) {
    const n = env.warnings.filter(function (w) { return w.indexOf('"' + name + '"') !== -1; }).length;
    if (n !== 1) return n + ' warnings for ' + name;
  }
  if (env.errors.length) return env.errors[0];
});

check('skinFor: an entity is drawn with its own skin, else the sprite of theme.skins for its kind, else the sprite of its kind; the frame and the place stay', function () {
  for (const sim of SIM_PRESENT ? [false, true] : [false]) {
    const env = loadEnv({ sim: sim });            // with and without TG.Entities.KINDS
    const TG = env.TG;
    const where = sim ? 'with entities.js' : 'without entities.js';
    const scenes = function (skins, edit) {
      const out = [];
      for (const screen of ['playing', 'boss']) {
        const s = handState(TG, screen);
        if (skins) s.level.theme.skins = skins;
        if (edit) edit(s);
        out.push(drawCalls(TG, function () { TG.Render.draw(s); }));
      }
      return out[0].concat(out[1]);
    };
    const KIND = { boulder: 'en_boulder', dawdle: 'en_dawdle', hoppet: 'en_hoppet', buzzle: 'en_buzzle', swoop: 'en_swoop',
      truffle: 'en_truffle', rock: 'pr_rock', crate: 'crate_balloon', shock: 'pr_shock', pick: 'pr_pickaxe' };
    const plain = scenes(null);
    for (const k of Object.keys(KIND)) if (!named(plain, KIND[k]).length) return where + ': the ' + k + ' is not drawn as ' + KIND[k];
    // A sprite for every kind.
    const skins = {};
    Object.keys(KIND).forEach(function (k) { skins[k] = { sprite: 'x_' + k }; });
    const skinned = scenes(skins);
    const want = plain.map(function (c) {
      const kind = Object.keys(KIND).filter(function (k) { return KIND[k] === c.name; })[0];
      return kind ? Object.assign({}, c, { name: 'x_' + kind }) : c;
    });
    if (JSON.stringify(skinned) !== JSON.stringify(want)) {
      for (let i = 0; i < want.length; i++) {
        if (JSON.stringify(skinned[i]) !== JSON.stringify(want[i])) return where + ': ' + JSON.stringify(skinned[i]) + ', want ' + JSON.stringify(want[i]);
      }
      return where + ': ' + skinned.length + ' sprites, want ' + want.length;
    }
    // A skin with only a remap keeps the sprite of the kind; a kind with no skin is untouched.
    const tin = scenes({ hoppet: { remap: 'scratchtin' } });
    if (named(tin, 'en_hoppet').length !== 1 || named(tin, 'en_hoppet')[0].remap !== 'scratchtin') return where + ': the hoppet under a remap skin: ' + JSON.stringify(named(tin, 'en_hoppet'));
    if (named(tin, 'en_dawdle')[0].remap !== null) return where + ': the remap reached another kind';
    // The Digby above ground: its own skin wins over the level's, and the mound stays the Digby's.
    const up = function (s) {
      const d = s.entities.filter(function (e) { return e.kind === 'digby'; })[0];
      if (d) Object.assign(d, { phase: 'up', elev: 14, y: TG.C.GROUND_Y - 14, t: TG.C.DIGBY_POP_T + 0.1, skin: 'x_baronet' });
    };
    const own = scenes({ digby: { sprite: 'x_mole', remap: 'scratchtin' } }, up);
    const baronet = named(own, 'x_baronet');
    if (baronet.length !== 1 || !baronet[0].clipped || baronet[0].frame !== 'up') return where + ': the entity\'s own skin: ' + JSON.stringify(baronet);
    if (baronet[0].remap !== null) return where + ': the remap of the level\'s skin was put on an entity with its own skin';
    if (named(own, 'x_mole').length || named(own, 'en_digby').length) return where + ': the level\'s skin or en_digby drawn beside the entity\'s own';
    if (!named(own, 'en_mound').length) return where + ': no mound under the skinned Digby';
    const level = scenes({ digby: { sprite: 'x_mole' } }, function (s) { up(s); s.entities.forEach(function (e) { delete e.skin; }); });
    if (named(level, 'x_mole').length !== 1 || named(level, 'en_digby').length) return where + ': the level\'s skin for the Digby';
    // Underground the Digby is its mound, which no skin replaces.
    if (!named(skinned, 'en_mound').length || named(scenes({ digby: { sprite: 'x_mole' } }), 'x_mole').length) return where + ': the mound of a Digby underground was skinned';
    // A kind that is not in KINDS is drawn as en_<kind>, as before.
    const other = scenes(null, function (s) { if (s.entities[1]) s.entities[1].kind = 'newt'; });
    if (!named(other, 'en_newt').length) return where + ': an unknown kind is not drawn as en_newt';
    if (env.errors.length) return where + ': ' + env.errors[0];
  }
});

check('the remap of a skin is applied under the white flash of a correct key, and recolours the sprite', function () {
  const env = loadEnv();
  const TG = env.TG;
  const pal = paletteSet(TG);
  TG.Remaps.scratchtin = { 14: 16, 15: 18, 4: 3 };        // GRASS to BRONZE, LIME to GOLD, WHITE to SILVER
  const s = handState(TG, 'playing');
  withGame(TG, s);
  const frog = s.entities[2];
  if (frog.kind !== 'hoppet') return 'hand state: ' + frog.kind;
  s.entities = [frog];
  s.level.hazards = [];
  s.items = [];
  const box = function () {
    TG.Render.draw(s);
    const rgba = env.canvas.toRGBA();
    const set = {};
    const x0 = Math.floor(frog.x - s.camera.x) - 8, y0 = Math.floor(frog.y) - 16;
    for (let y = y0; y < y0 + 16; y++) for (let x = x0; x < x0 + 16; x++) set[pixel(rgba, 384, x, y)] = true;
    return set;
  };
  const green = box();
  if (!green[pal[14]]) return 'the frog has no GRASS pixel to remap';
  s.level.theme.skins = { hoppet: { remap: 'scratchtin' } };
  const tin = box();
  if (tin[pal[14]] || !tin[pal[16]]) return 'under the remap the frog is not BRONZE for GRASS';
  // A correct key: the sprite is all WHITE for 2 frames, whatever the skin's remap says.
  TG.Events.emit('type:hit', { target: frog, id: frog.id, kind: 'hoppet', ch: 'f', index: 0, length: 4, complete: false, x: frog.x, y: frog.y });
  const calls = drawCalls(TG, function () { TG.Render.draw(s); });
  const hit = named(calls, 'en_hoppet');
  if (hit.length !== 1 || hit[0].remap !== 'white') return 'during the flash: ' + JSON.stringify(hit);
  for (let i = 0; i < 4; i++) TG.Effects.update(1 / 60);
  const after = named(drawCalls(TG, function () { TG.Render.draw(s); }), 'en_hoppet');
  if (after.length !== 1 || after[0].remap !== 'scratchtin') return 'after the flash: ' + JSON.stringify(after);
  if (env.warnings.length) return 'warning: ' + env.warnings[0];
});

check('a correct key turns the mound of a Digby underground and the power icon of a crate white; the remap of a skin reaches neither', function () {
  const TIN = { 14: 16, 15: 18, 4: 3 };
  for (const skins of [null, { digby: { remap: 'scratchtin' }, crate: { remap: 'scratchtin' } }]) {
    const env = loadEnv();
    const TG = env.TG;
    TG.Remaps.scratchtin = TIN;
    const where = skins ? 'with remap skins for the Digby and the crate' : 'without skins';
    const s = handState(TG, 'playing');
    withGame(TG, s);
    if (skins) s.level.theme.skins = skins;
    const mole = s.entities.filter(function (e) { return e.kind === 'digby'; })[0];
    const crate = s.entities.filter(function (e) { return e.kind === 'crate'; })[0];
    if (mole.phase !== 'mound') return 'hand state: ' + mole.phase;
    crate.power = 'blast';        // an icon the HUD of the hand-built state does not draw as well
    // The remaps of the mound, the power icon and the crate itself, each drawn once.
    const remaps = function () {
      const calls = drawCalls(TG, function () { TG.Render.draw(s); });
      return JSON.stringify(['en_mound', 'pw_blast', 'crate_balloon'].map(function (name) {
        const c = named(calls, name);
        return c.length === 1 ? c[0].remap : name + ' drawn ' + c.length + ' times';
      }));
    };
    const skin = skins ? 'scratchtin' : null;
    const still = JSON.stringify([null, null, skin]);
    if (remaps() !== still) return where + ', before the key: ' + remaps() + ', want ' + still;
    for (const e of [mole, crate]) {
      TG.Events.emit('type:hit', { target: e, id: e.id, kind: e.kind, ch: e.word.charAt(0), index: 0, length: e.word.length, complete: false, x: e.x, y: e.y });
    }
    const white = JSON.stringify(['white', 'white', 'white']);
    if (remaps() !== white) return where + ', on the key: ' + remaps() + ', want ' + white;
    for (let i = 0; i < 4; i++) TG.Effects.update(1 / 60);
    if (remaps() !== still) return where + ', after the flash: ' + remaps() + ', want ' + still;
    if (env.warnings.length || env.errors.length) return where + ': console: ' + env.warnings.concat(env.errors)[0];
  }
});

check('the remap of a skin for the shockwave or the pickaxe is put on that attack\'s sprite; without a skin it has none', function () {
  const env = loadEnv();
  const TG = env.TG;
  TG.Remaps.scratchtin = { 14: 16, 15: 18, 4: 3 };
  const remaps = function (skins) {
    const s = handState(TG, 'boss');
    if (skins) s.level.theme.skins = skins;
    const calls = drawCalls(TG, function () { TG.Render.draw(s); });
    return JSON.stringify(['pr_shock', 'pr_pickaxe'].map(function (name) {
      const c = named(calls, name);
      return c.length === 1 ? c[0].remap : name + ' drawn ' + c.length + ' times';
    }));
  };
  const cases = [[null, [null, null]], [{ shock: { remap: 'scratchtin' } }, ['scratchtin', null]], [{ pick: { remap: 'scratchtin' } }, [null, 'scratchtin']],
    [{ shock: { remap: 'scratchtin' }, pick: { remap: 'scratchtin' } }, ['scratchtin', 'scratchtin']]];
  for (const c of cases) {
    if (remaps(c[0]) !== JSON.stringify(c[1])) return 'skins ' + JSON.stringify(c[0]) + ': ' + remaps(c[0]) + ', want ' + JSON.stringify(c[1]);
  }
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

// The target bot of the pixel regression (test/test-level1-pixels.js) types every Digby while it is under
// its mound, so no reference frame shows one above ground. Its place is checked here.
check('a Digby above ground is drawn at its elev, cut at the ground line, with its mound in front: the peek frame just after the pop, then the up frame', function () {
  const env = loadEnv();
  const TG = env.TG;
  const C = TG.C;
  const G = C.GROUND_Y;
  const ctx = env.canvas.getContext('2d');
  // The Digby's part of a frame: the 9-argument drawImage of its cached sprite frame (16 x 16, anchored
  // at the middle of its bottom edge), and the mound.
  const drawn = function (elev, t) {
    const s = handState(TG, 'playing');
    const mole = s.entities.filter(function (e) { return e.kind === 'digby'; })[0];
    Object.assign(mole, { phase: 'up', elev: elev, y: G - elev, t: t, harmful: true, onScreen: true });
    const sources = { peek: TG.Gfx.get('en_digby', 'peek', { flipX: false, remap: null }), up: TG.Gfx.get('en_digby', 'up', { flipX: false, remap: null }) };
    const parts = [];
    const drawImage = ctx.drawImage;
    ctx.drawImage = function (cv) {
      for (const frame of ['peek', 'up']) if (cv === sources[frame]) parts.push([frame].concat(Array.prototype.slice.call(arguments, 1)));
      return drawImage.apply(ctx, arguments);
    };
    let calls;
    try { calls = drawCalls(TG, function () { TG.Render.draw(s); }); } finally { ctx.drawImage = drawImage; }
    const x = Math.floor(mole.x - s.camera.x);
    const order = calls.map(function (c) { return c.name; });
    return { parts: JSON.stringify(parts), x: x, mound: JSON.stringify(named(calls, 'en_mound').map(function (c) { return [c.frame, c.x, c.y, c.remap]; })),
      moundAfter: order.lastIndexOf('en_mound') > order.lastIndexOf('en_digby') };
  };
  const pop = C.DIGBY_POP_T;
  // [elev, t, frame, rows drawn]: half out just after the pop, all out later, still under the ground.
  const cases = [[-6, pop + 0.02, 'peek', 10], [14, pop + 0.1, 'up', 16], [0, pop + 0.06, 'up', 16], [-16, pop, null, 0]];
  for (const c of cases) {
    const d = drawn(c[0], c[1]);
    const want = c[2] === null ? '[]' : JSON.stringify([[c[2], 0, 0, 16, c[3], d.x - 8, G - c[0] - 16, 16, c[3]]]);
    if (d.parts !== want) return 'elev ' + c[0] + ', t ' + c[1].toFixed(2) + ': ' + d.parts + ', want ' + want;
    if (d.mound !== JSON.stringify([[0, d.x, G, null]])) return 'elev ' + c[0] + ': the mound ' + d.mound;
    if (!d.moundAfter) return 'elev ' + c[0] + ': the mound is drawn before the Digby';
  }
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

check('the steady chevron of an attack follows its action: SHOCK_WIN for jump, PICK_WIN for duck', function () {
  const env = loadEnv();
  const TG = env.TG;
  const C = TG.C;
  // An eta inside PICK_WIN and outside SHOCK_WIN, drawn in the off half of the 2 Hz blink, so that the
  // chevron shows only when its window is open.
  const eta = (C.SHOCK_WIN[1] + C.PICK_WIN[1]) / 2;
  if (!(eta > C.SHOCK_WIN[1] && eta < C.PICK_WIN[1])) return 'the two windows no longer differ at their far ends';
  const chevrons = function (kind, action) {
    const s = handState(TG, 'boss');
    s.boss.word = null;
    s.time = 12.75;
    const a = attack(TG, s, kind, 100);
    a.action = action;
    a.eta = eta;
    s.entities = [a];
    const dy = kind === 'pick' ? 28 : 20;
    let n = 0;
    const fn = TG.Font.drawGlyph;
    TG.Font.drawGlyph = function (ctx, ch, x, y, color) {
      if (color === 18 && y === Math.floor(a.y) - dy) n++;
      return fn.apply(TG.Font, arguments);
    };
    try { TG.Render.draw(s); } finally { TG.Font.drawGlyph = fn; }
    return n;
  };
  if (chevrons('shock', 'jump') !== 0) return 'a jump attack outside SHOCK_WIN has a steady chevron';
  if (chevrons('pick', 'duck') !== 1) return 'a duck attack inside PICK_WIN has no steady chevron';
  // The kind does not decide: the same two sprites with the actions exchanged.
  if (chevrons('shock', 'duck') !== 1) return 'a shock that is ducked does not use PICK_WIN';
  if (chevrons('pick', 'jump') !== 0) return 'a pick that is jumped does not use SHOCK_WIN';
});

// A scratch backdrop with one arena palette in the form of LEVEL2 Appendix C: PLUM, a MAROON floor band
// dithered PLUM, the two later phases as `phases`, DEEP_BLUE for the Hourglass.
function scratchArena(TG, palette) {
  TG.Backdrops.scratch = { palettes: { hall: palette }, layers: [] };
  const s = handState(TG, 'boss');
  s.level.theme.backdrop = 'scratch';
  s.level.arena.palette = 'hall';
  s.boss.word = null;
  s.entities = [];
  s.power.slowT = 0;
  return s;
}

check('the sky of each boss phase comes from the palette\'s phases: the first band only, and the Hourglass sky over it', function () {
  const env = loadEnv();
  const TG = env.TG;
  const pal = paletteSet(TG);
  const hall = { sky: [{ y: 0, h: 150, color: 28 }, { y: 150, h: 34, color: 24, dither: 28 }], remap: null, slowSky: 5,
    phases: { 2: { color: 28, dither: 24 }, 3: { color: 0, dither: 28 } } };
  const s = scratchArena(TG, hall);
  // Two neighbouring pixels of a band: [the dither's pixel (x + y even), the band's own].
  const pair = function (y) {
    TG.Render.draw(s);
    const rgba = env.canvas.toRGBA();
    return [pal.indexOf(pixel(rgba, 384, 2, y)), pal.indexOf(pixel(rgba, 384, 3, y))].join(',');
  };
  const want = { 1: '28,28', 2: '24,28', 3: '28,0' };
  for (const ph of [1, 2, 3]) {
    s.boss.phase = ph;
    if (pair(60) !== want[ph]) return 'phase ' + ph + ': the band at y 60 is ' + pair(60) + ', want ' + want[ph];
    if (pair(160) !== '28,24') return 'phase ' + ph + ': the floor band changed to ' + pair(160);
  }
  s.power.slowT = 3;
  if (pair(60) !== '5,5') return 'the Hourglass sky during phase 3: ' + pair(60);
  s.power.slowT = 0;
  // A phase the palette does not list keeps the band.
  hall.phases = { 3: { color: 0, dither: 28 } };
  s.boss.phase = 2;
  if (pair(60) !== '28,28') return 'phase 2 without an entry: ' + pair(60);
  // An entry may give the colour alone: the band then keeps its own dither (none here).
  hall.phases = { 2: { color: 24 } };
  if (pair(60) !== '24,24') return 'an entry with a colour and no dither: ' + pair(60);
  if (env.errors.length || env.warnings.length) return 'console: ' + env.errors.concat(env.warnings)[0];
});

check('without phases the dusk rule stands: DEEP_BLUE, DEEP_BLUE with a PLUM dither, INK with a PLUM dither; another palette keeps its band', function () {
  const env = loadEnv();
  const TG = env.TG;
  const pal = paletteSet(TG);
  if (TG.Backdrops.meadow.palettes.dusk.phases) return 'the meadow\'s dusk palette has phases, so the fallback is not tested here';
  const colors = function (s, y) {
    TG.Render.draw(s);
    const rgba = env.canvas.toRGBA();
    const even = {}, odd = {};
    for (let x = 0; x < 24; x++) ((x + y) % 2 === 0 ? even : odd)[pal.indexOf(pixel(rgba, 384, x, y))] = true;
    return Object.keys(even).join('/') + ',' + Object.keys(odd).join('/');
  };
  const want = { 1: '5,5', 2: '28,5', 3: '28,0' };
  for (const ph of [1, 2, 3]) {
    const s = handState(TG, 'boss');
    s.boss.word = null;
    s.entities = [];
    s.power.slowT = 0;
    s.boss.phase = ph;
    if (colors(s, 26) !== want[ph]) return 'dusk, phase ' + ph + ': ' + colors(s, 26) + ', want ' + want[ph];
  }
  // A palette of another name with no phases: nothing changes with the phase.
  const t = scratchArena(TG, { sky: [{ y: 0, h: 184, color: 28 }], remap: null, slowSky: 5 });
  for (const ph of [1, 2, 3]) {
    t.boss.phase = ph;
    if (colors(t, 26) !== '28,28') return 'a palette without phases, phase ' + ph + ': ' + colors(t, 26);
  }
  // A palette named dusk that has phases uses them.
  TG.Backdrops.scratch.palettes.dusk = { sky: [{ y: 0, h: 184, color: 5 }], remap: null, slowSky: 5, phases: { 2: { color: 9, dither: 11 } } };
  t.level.arena.palette = 'dusk';
  t.boss.phase = 2;
  if (colors(t, 26) !== '11,9') return 'a dusk palette with its own phases: ' + colors(t, 26);
  t.boss.phase = 3;
  if (colors(t, 26) !== '5,5') return 'a dusk palette with its own phases, phase 3 not listed: ' + colors(t, 26);
});

check('drawSky draws the palette\'s starSprite and moonSprite, the moon with the frame of its fps; bg_star and bg_moon without them', function () {
  const env = loadEnv();
  const TG = env.TG;
  const hall = { sky: [{ y: 0, h: 184, color: 28 }], remap: 'dusk', slowSky: 5, stars: [{ x: 22, y: 72 }, { x: 58, y: 112 }, { x: 118, y: 64 }],
    moon: { x: 328, y: 84 } };
  const s = scratchArena(TG, hall);
  const sky = function (time) {
    s.time = time;
    return drawCalls(TG, function () { TG.Render.draw(s); }).filter(function (c) { return !c.clipped && c.y < 150 && /^(bg_|tile_water$)/.test(c.name); });
  };
  let calls = sky(12.5);
  if (JSON.stringify(calls.map(function (c) { return [c.name, c.frame, c.x, c.y, c.remap]; })) !==
      JSON.stringify([['bg_star', 1, 22, 72, null], ['bg_star', 0, 58, 112, null], ['bg_star', 1, 118, 64, null], ['bg_moon', 0, 328, 84, null]])) {
    return 'without the keys: ' + JSON.stringify(calls);
  }
  // tile_water stands in for a moon with two frames at 3 fps, as bg_clockface has two at 1 fps.
  hall.starSprite = 'bg_cloud';
  hall.moonSprite = 'tile_water';
  calls = sky(12.5);
  if (JSON.stringify(calls.map(function (c) { return [c.name, c.frame, c.x, c.y, c.remap]; })) !==
      JSON.stringify([['bg_cloud', 1, 22, 72, null], ['bg_cloud', 0, 58, 112, null], ['bg_cloud', 1, 118, 64, null], ['tile_water', 1, 328, 84, null]])) {
    return 'with the keys at 12.5 s: ' + JSON.stringify(calls);
  }
  calls = sky(12.7);
  if (named(calls, 'tile_water')[0].frame !== 0) return 'the moon sprite does not follow its fps: frame ' + named(calls, 'tile_water')[0].frame + ' at 12.7 s';
});

check('a boss of a kind with no parts of its own is drawn with the Baron\'s: in the fight, in the intro gesture and in the defeat', function () {
  const env = loadEnv();
  const TG = env.TG;
  const parts = function (kind, screen, edit) {
    const s = handState(TG, screen);
    if (kind === undefined) delete s.boss.kind; else s.boss.kind = kind;
    if (edit) edit(s);
    return JSON.stringify(drawCalls(TG, function () { TG.Render.draw(s); }).filter(function (c) { return /^(boss_|en_digby$)/.test(c.name); }));
  };
  const intro = function (s) { s.boss.state = 'intro'; s.boss.introTime = 4; s.boss.stateT = 2.0; s.boss.rise = 0; };
  const cases = [['boss', null, ['boss_body', 'boss_arm', 'boss_head', 'boss_mound']], ['bossIntro', intro, ['boss_monocle']],
    ['levelComplete', function (s) { s.screenT = 1.0; }, ['en_digby', 'boss_mound']],
    ['levelComplete', function (s) { s.screenT = 2.0; }, ['en_digby', 'boss_mound']]];
  for (const c of cases) {
    const baron = parts('baron', c[0], c[1]);
    for (const name of c[2]) if (baron.indexOf('"' + name + '"') === -1) return c[0] + ': the Baron draws no ' + name;
    for (const kind of ['nobody', undefined]) {
      if (parts(kind, c[0], c[1]) !== baron) return c[0] + ': a boss of kind ' + kind + ' is not drawn as the Baron';
    }
  }
});

check('boss:hit and boss:defeat throw the Baron\'s monocle and helmet for the Baron, for a boss of a kind with no effects of its own, and without a game', function () {
  const env = loadEnv();
  const TG = env.TG;
  const thrown = function (kind) {
    const s = handState(TG, 'boss');
    if (kind === null) delete TG.Game; else { s.boss.kind = kind; withGame(TG, s); }
    const p = payloads(TG, s);
    TG.Effects.reset();
    TG.Events.emit('boss:hit', p['boss:hit']);
    TG.Events.emit('boss:defeat', p['boss:defeat']);
    return TG.Effects._list().filter(function (f) { return f.type === 'part' && /^boss_/.test(String(f.kind)); })
      .map(function (f) { return f.kind; }).join(',');
  };
  for (const kind of ['baron', 'nobody', null]) {
    if (thrown(kind) !== 'boss_monocle,boss_helmet') return 'kind ' + kind + ': ' + thrown(kind);
  }
});

check('hazard:hit bursts in the colours of theme.hazardFx for the hazard\'s kind, and in Level 1\'s leaf colours without it', function () {
  const env = loadEnv();
  const TG = env.TG;
  const IMPACT = [4, 18, 25];                              // the hit star's own burst: WHITE, GOLD, RED
  const burst = function (kind, hazardFx) {
    const s = handState(TG, 'playing');
    if (hazardFx) s.level.theme.hazardFx = hazardFx;
    withGame(TG, s);
    TG.Effects.reset();
    TG.Events.emit('hazard:hit', { id: 'h2', kind: kind, x: s.player.x, y: s.player.y });
    TG.Effects.update(1 / 60);
    return particleColors(TG, env, s).filter(function (c) { return IMPACT.indexOf(c) === -1; });
  };
  const only = function (colors, allowed) { return colors.length === 8 && colors.every(function (c) { return allowed.indexOf(c) !== -1; }); };
  // Level 1, no key: GRASS, CORAL, LIME for the bramble; GRASS, LIME, SOIL for the others.
  let c = burst('bramble', null);
  if (!only(c, [14, 26, 15])) return 'bramble without hazardFx: ' + c.join(' ');
  for (const kind of ['branch', 'beehive', 'arch']) {
    c = burst(kind, null);
    if (!only(c, [14, 15, 21])) return kind + ' without hazardFx: ' + c.join(' ');
  }
  // From the data, per kind. The colours are scratch ones that neither Level 1 nor the hit star uses.
  const fx = { bramble: [11, 9, 30], branch: [16, 2, 1], beehive: [19, 16, 3], arch: [2, 3, 1] };
  for (const kind of Object.keys(fx)) {
    c = burst(kind, fx);
    if (!only(c, fx[kind])) return kind + ' with hazardFx ' + fx[kind].join(' ') + ': ' + c.join(' ');
  }
  // A kind the data leaves out keeps Level 1's colours.
  c = burst('branch', { bramble: [11, 9, 30] });
  if (!only(c, [14, 15, 21])) return 'branch with hazardFx for the bramble only: ' + c.join(' ');
  c = burst('bramble', { bramble: [] });
  if (!only(c, [14, 26, 15])) return 'bramble with an empty list: ' + c.join(' ');
  if (env.errors.length) return env.errors[0];
});

check('the boss bar label is level.boss.label at x 272 - 8 per letter with its INK box from 4 px before it to x 380: RATCHET at 216, BARON at 232', function () {
  const env = loadEnv();
  const TG = env.TG;
  const pal = paletteSet(TG);
  const bar = function (label) {
    const s = handState(TG, 'boss');
    if (label !== undefined) s.level.boss.label = label;
    const texts = [], boxes = [];
    const fdraw = TG.Font.draw, rect = TG.Gfx.rect;
    TG.Font.draw = function (ctx, str, x, y, o) {
      if (y === 23) texts.push([String(str), x, o && o.color]);
      return fdraw.apply(TG.Font, arguments);
    };
    TG.Gfx.rect = function (ctx, x, y, w, h, c) {
      if (y === 20 && h === 11) boxes.push([x, y, w, h, c]);
      return rect.apply(TG.Gfx, arguments);
    };
    try { TG.Render.draw(s); } finally { TG.Font.draw = fdraw; TG.Gfx.rect = rect; }
    return { texts: JSON.stringify(texts), boxes: JSON.stringify(boxes), rgba: env.canvas.toRGBA() };
  };
  const cases = [[undefined, 'BARON', 232, 228, 152], ['BARON', 'BARON', 232, 228, 152], ['RATCHET', 'RATCHET', 216, 212, 168], ['', 'BARON', 232, 228, 152]];
  for (const c of cases) {
    const b = bar(c[0]);
    if (b.texts !== JSON.stringify([[c[1], c[2], 4]])) return 'label ' + JSON.stringify(c[0]) + ': text ' + b.texts;
    if (b.boxes !== JSON.stringify([[c[3], 20, c[4], 11, 0]])) return 'label ' + JSON.stringify(c[0]) + ': box ' + b.boxes;
    // On the canvas: the box is INK from its first column to x 379 on the row under the bar, and the
    // label has WHITE pixels inside its own columns only.
    if (pixel(b.rgba, 384, c[3], 30) !== pal[0] || pixel(b.rgba, 384, 379, 30) !== pal[0]) return 'label ' + JSON.stringify(c[0]) + ': the box is not INK at its ends';
    let first = -1, last = -1;
    for (let x = c[3]; x < 280; x++) for (let y = 23; y < 30; y++) if (pixel(b.rgba, 384, x, y) === pal[4]) { if (first < 0) first = x; last = x; }
    if (first < c[2] || first > c[2] + 1 || last > c[2] + 8 * c[1].length - 1 || last < c[2] + 8 * c[1].length - 3) {
      return 'label ' + JSON.stringify(c[0]) + ': WHITE from x ' + first + ' to ' + last;
    }
  }
  // The bar itself does not move with the label.
  const b = bar('RATCHET');
  if (pixel(b.rgba, 384, 281, 26) !== pal[25] || pixel(b.rgba, 384, 370, 26) !== pal[1]) return 'the bar moved';
});

check('the tips for the boss\'s attacks come from level.boss.tips and the arch tip\'s noun from theme.hazardNames; Level 1\'s lines without them', function () {
  const env = loadEnv();
  const TG = env.TG;
  const ctx = env.canvas.getContext('2d');
  const tipAfter = function (edit, name, payload) {
    const s = handState(TG, 'boss');
    if (edit) edit(s.level);
    TG.Hud.reset();
    TG.Events.emit(name, payload);
    const seen = [];
    const draw = TG.Font.draw;
    TG.Font.draw = function (c, str, x, y) {
      if (y === 186) seen.push(String(str));
      return draw.apply(TG.Font, arguments);
    };
    try { TG.Hud.draw(ctx, s); } finally { TG.Font.draw = draw; }
    return seen.join('');
  };
  const lost = function (cause) { return { lives: 3, cause: cause }; };
  const shock = lost({ type: 'attack', kind: 'shock', id: 7, from: 'right' }), pick = lost({ type: 'attack', kind: 'pick', id: 8, from: 'right' });
  const archLost = lost({ type: 'hazard', kind: 'arch', id: 'h5', from: null }), archHit = { id: 'h5', kind: 'arch', x: 0, y: 0 };
  const ratchet = function (level) {
    level.boss.tips = { shock: 'JUMP THE GEAR', pick: 'DUCK THE PENDULUM' };
    level.theme.hazardNames = { arch: 'TUNNEL' };
  };
  const cases = [
    [null, 'life:lost', shock, 'TIP: JUMP THE SHOCKWAVE'], [null, 'life:lost', pick, 'TIP: DUCK THE PICKAXE'],
    [null, 'life:lost', archLost, 'TIP: HOLD ENTER UNDER THE ARCH'], [null, 'hazard:hit', archHit, 'TIP: HOLD ENTER UNDER THE ARCH'],
    [ratchet, 'life:lost', shock, 'TIP: JUMP THE GEAR'], [ratchet, 'life:lost', pick, 'TIP: DUCK THE PENDULUM'],
    [ratchet, 'life:lost', archLost, 'TIP: HOLD ENTER UNDER THE TUNNEL'], [ratchet, 'hazard:hit', archHit, 'TIP: HOLD ENTER UNDER THE TUNNEL'],
    // The other tips are not the level's to change, and one tip of the two may be given alone.
    [ratchet, 'life:lost', lost({ type: 'threat', kind: 'hoppet', id: 5, from: 'right' }), 'TIP: TYPE THE NEAREST WORD FIRST'],
    [ratchet, 'life:lost', lost({ type: 'hazard', kind: 'branch', id: 'h3', from: null }), 'TIP: ENTER TO DUCK'],
    [function (level) { level.boss.tips = { pick: 'DUCK THE PENDULUM' }; }, 'life:lost', shock, 'TIP: JUMP THE SHOCKWAVE'],
    [function (level) { level.boss = null; level.theme.hazardNames = {}; }, 'life:lost', pick, 'TIP: DUCK THE PICKAXE'],
    [function (level) { level.boss = null; level.theme.hazardNames = {}; }, 'hazard:hit', archHit, 'TIP: HOLD ENTER UNDER THE ARCH']
  ];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const got = tipAfter(c[0], c[1], c[2]);
    if (got !== c[3]) return 'case ' + i + ': "' + got + '", want "' + c[3] + '"';
  }
});

// The letters of the speech plate's line that TG.Hud.draw writes for the state, or -1 with no plate.
function speechShown(TG, env, s) {
  let text = null;
  const draw = TG.Font.draw;
  TG.Font.draw = function (c, str, x, y) {
    if (y === 43) text = String(str);
    return draw.apply(TG.Font, arguments);
  };
  try { TG.Hud.draw(env.canvas.getContext('2d'), s); } finally { TG.Font.draw = draw; }
  return text === null ? -1 : text.length;
}

const BARON_LINE = 'MY MEADOW! MY WORDS!', RATCHET_LINE = 'TICK TOCK! WORDS INTO COGS!';      // Level 1's, and LEVEL2 10.6's

check('the speech plate types 30 letters a second; a line that would not be whole before the intro ends is typed over the first half of its time and stands for the rest: both of Level 1\'s intros stay at 30; Lady Ratchet\'s plate runs on boss.stateT, so a pause does not start it again, and the Baron\'s on screenT, as Level 1 was released', function () {
  const env = loadEnv();
  const TG = env.TG;
  const C = TG.C;
  // `since` s after the half of an intro of introTime s, on the boss's intro clock. screenT, which a pause
  // sets back to 0, is given apart where it is to differ, and the level's boss kind where it is not the Baron.
  const shown = function (speech, introTime, since, screenT, kind) {
    const s = handState(TG, 'bossIntro', { screenT: screenT !== undefined ? screenT : introTime / 2 + since });
    s.level.boss.speech = speech;
    if (kind) s.level.boss.kind = kind;
    Object.assign(s.boss, { state: 'intro', introTime: introTime, stateT: introTime / 2 + since });
    return speechShown(TG, env, s);
  };
  const line = function (n) { return 'TICK TOCK! '.repeat(5).slice(0, n); };
  if (BARON_LINE.length !== 20 || RATCHET_LINE.length !== 27) return 'the lines changed length';
  for (const intro of [C.BOSS_INTRO_TIME, C.BOSS_INTRO_SHORT]) {
    for (const since of [0, 0.125, 0.25, 0.5, 0.625, 0.75]) {       // eighths, so that the sums are exact
      const want = Math.min(20, Math.floor(since * 30));
      if (shown(BARON_LINE, intro, since) !== want) return 'Level 1, intro ' + intro + ' s, ' + since + ' s in: ' + shown(BARON_LINE, intro, since) + ' letters, want ' + want;
    }
  }
  // 27 letters: the 4 s intro has 2 s for them, so 30 a second. The 1.5 s intro has 0.75 s, which 30 a
  // second would not fill in time: the line is typed over the first 0.375 s, 72 a second, and then stands.
  const SHORT = [[0, 0], [0.125, 9], [0.25, 18], [0.375, 27], [0.5, 27], [0.625, 27]];
  if (shown(RATCHET_LINE, C.BOSS_INTRO_TIME, 0.5) !== 15) return '27 letters in the long intro: ' + shown(RATCHET_LINE, C.BOSS_INTRO_TIME, 0.5);
  for (const c of SHORT) {
    if (shown(RATCHET_LINE, C.BOSS_INTRO_SHORT, c[0]) !== c[1]) return '27 letters in the short intro, ' + c[0] + ' s after its half: ' + shown(RATCHET_LINE, C.BOSS_INTRO_SHORT, c[0]) + ', want ' + c[1];
  }
  // Where the rule changes. With the two letters more, 20 letters are the most that 30 a second types in
  // the 0.75 s (22 / 30 = 0.733 s); 21 are typed over 0.375 s. The 4 s intro types every line the screen
  // holds (8 px a letter and 5 px of plate: 47 letters) at 30 a second.
  if (shown(line(20), C.BOSS_INTRO_SHORT, 0.25) !== 7 || shown(line(21), C.BOSS_INTRO_SHORT, 0.25) !== 14 || shown(line(21), C.BOSS_INTRO_SHORT, 0.375) !== 21) {
    return 'lines of 20 and 21 letters in the short intro: ' + [shown(line(20), C.BOSS_INTRO_SHORT, 0.25), shown(line(21), C.BOSS_INTRO_SHORT, 0.25), shown(line(21), C.BOSS_INTRO_SHORT, 0.375)].join(', ');
  }
  if (shown(line(47), C.BOSS_INTRO_TIME, 0.5) !== 15) return '47 letters in the long intro: ' + shown(line(47), C.BOSS_INTRO_TIME, 0.5);
  // The last frame of an intro is drawn one step before its end: the step that reaches the end changes
  // the screen. Every line the screen holds is whole on it.
  for (const intro of [C.BOSS_INTRO_TIME, C.BOSS_INTRO_SHORT]) {
    for (let n = 1; n <= 47; n++) {
      const got = shown(line(n), intro, intro / 2 - C.DT);
      if (got !== n) return 'a line of ' + n + ' letters on the last frame of the ' + intro + ' s intro: ' + got + ' letters';
    }
  }
  if (shown(RATCHET_LINE, C.BOSS_INTRO_SHORT, -0.1) !== -1) return 'a plate before the half';
  // A pause and resume set screenT back to 0 and leave boss.stateT. Lady Ratchet's plate goes on from where
  // it was, and is not there before the half of her intro whatever screenT says.
  if (shown(RATCHET_LINE, C.BOSS_INTRO_TIME, 0.5, 0, 'ratchet') !== 15) return 'her plate with screenT back at 0, 0.5 s after the half: ' + shown(RATCHET_LINE, C.BOSS_INTRO_TIME, 0.5, 0, 'ratchet') + ' letters';
  if (shown(RATCHET_LINE, C.BOSS_INTRO_TIME, -0.5, 3, 'ratchet') !== -1) return 'her plate in the first half of the intro, because screenT is past the half';
  if (shown(RATCHET_LINE, C.BOSS_INTRO_SHORT, 0.25, 0, 'ratchet') !== 18) return 'her plate in the short intro with screenT back at 0: ' + shown(RATCHET_LINE, C.BOSS_INTRO_SHORT, 0.25, 0, 'ratchet') + ' letters';
  // The Baron's plate follows screenT, as Level 1 was released: after a pause it is gone until screenT is
  // past the half of the intro's length again, and then it starts from its first letter.
  if (shown(BARON_LINE, C.BOSS_INTRO_TIME, 0.5, 0) !== -1) return 'the Baron\'s plate with screenT back at 0, 0.5 s after the half: ' + shown(BARON_LINE, C.BOSS_INTRO_TIME, 0.5, 0) + ' letters';
  if (shown(BARON_LINE, C.BOSS_INTRO_TIME, 1.5, 2.25) !== 7) return 'the Baron\'s plate with screenT at 2.25 s, 1.5 s after the half: ' + shown(BARON_LINE, C.BOSS_INTRO_TIME, 1.5, 2.25) + ' letters';
});

if (!SIM_PRESENT) {
  skip('in the game, the last frame of the boss intro shows the whole speech line', 'the simulation files are not all present');
} else {
  check('in the game, the last frame of the boss intro shows the whole speech line, in the 4 s intro and in the 1.5 s intro after a continue: 20 letters and 27; a pause in Lady Ratchet\'s 4 s intro does not start her line again; in the 1.5 s intro the 27 letters stand whole for a third of a second, and the 20 as long as before', function () {
    // [the line, the level's boss kind, the frame of the 4 s intro after which the game is paused and resumed]
    for (const c of [[BARON_LINE, 'baron', undefined], [RATCHET_LINE, 'ratchet', 150]]) {
      const speech = c[0];
      const env = loadEnv({ sim: true });
      const TG = env.TG;
      const C = TG.C;
      // Level 1 with this line and this boss, started a few steps before the arena flag.
      const data = JSON.parse(JSON.stringify(TG.Levels[1]));
      data.boss.speech = speech;
      data.boss.kind = c[1];
      TG.Levels.scratch = data;
      TG.Input.clear();
      TG.Game.init();
      const s0 = TG.Game.newRun({ difficulty: 'medium', seed: 1, levelId: 'scratch', adaptive: false, assist: 1, tutorial: false });
      s0.player.x = s0.level.arenaX - 8;
      s0.camera.x = Math.max(0, s0.player.x - C.HERO_SCREEN_X);
      // Steps to the end of the next boss intro. Returns the letters shown on each of its frames. After
      // frame pauseAt, if given, the game is paused and resumed, which sets screenT back to 0.
      const intro = function (pauseAt) {
        const shown = [];
        for (let i = 0; i < 2000; i++) {
          const was = TG.Game.state.screen;
          TG.Game.step(C.DT);
          const s = TG.Game.state;
          TG.Effects.update(C.DT);
          TG.Hud.update(C.DT, s);
          if (s.screen === 'bossIntro') shown.push(speechShown(TG, env, s));
          else if (was === 'bossIntro') return shown;
          if (shown.length === pauseAt && !(TG.Game.pause() && TG.Game.resume() && s.screenT === 0)) return [];
        }
        return shown;
      };
      // Her intro is paused 0.5 s after its half, with the line 14 or 15 letters in, and the line goes on
      // from there. The Baron's is left to run: after a pause his plate follows screenT, as Level 1 was
      // released (the check above), and the line is not whole on the last frame.
      const long = intro(c[2]);
      if (c[2] && long[c[2] - 1] !== 14 && long[c[2] - 1] !== 15) return 'the 4 s intro, frame ' + c[2] + ': ' + long[c[2] - 1] + ' letters';
      if (TG.Game.state.screen !== 'boss' || !TG.Game.pause() || !TG.Game.continueRun()) return 'the run did not reach the fight and continue from it';
      if (TG.Game.state.boss.introTime !== C.BOSS_INTRO_SHORT) return 'the intro after the continue is ' + TG.Game.state.boss.introTime + ' s';
      const short = intro();
      // How long the whole line stands in the 0.75 s of the short intro. 20 letters at 30 a second are whole
      // 0.667 s in, for the last 4 or 5 frames, as they were before the 27 had a rule of their own; the 27
      // are whole 0.375 s in, for 22 frames.
      const whole = short.filter(function (n) { return n === speech.length; }).length;
      if (speech === BARON_LINE ? (whole < 4 || whole > 5) : (whole < 21 || whole > 23)) return speech.length + ' letters stand whole for ' + whole + ' frames of the 1.5 s intro';
      for (const frames of [['4 s', long, C.BOSS_INTRO_TIME], ['1.5 s', short, C.BOSS_INTRO_SHORT]]) {
        const shown = frames[1];
        if (Math.abs(shown.length - frames[2] / C.DT) > 1) return frames[0] + ' intro: ' + shown.length + ' frames';
        if (shown[shown.length - 1] !== speech.length) {
          return speech.length + ' letters, ' + frames[0] + ' intro: the last frame shows ' + shown[shown.length - 1];
        }
        // Letter by letter: no plate in the first half, an empty one at the half, never a letter fewer.
        const first = shown.findIndex(function (n) { return n >= 0; });
        if (Math.abs(first - shown.length / 2) > 1 || shown[first] > 1) return frames[0] + ' intro: the plate starts at frame ' + first + ' with ' + shown[first] + ' letters';
        for (let i = first + 1; i < shown.length; i++) if (shown[i] < shown[i - 1]) return frames[0] + ' intro: the line shrinks at frame ' + i;
      }
      if (env.errors.length || env.warnings.length) return 'console: ' + env.errors.concat(env.warnings)[0];
    }
  });
}

// ---------------------------------------------------------------------------------------------
// 8. The Pocket Watch (LEVEL2 6.3; the watch frame and the HUD slot of 13.5)
// ---------------------------------------------------------------------------------------------
//
// The state is built by hand: power.watchT holds the real seconds left and power.last is 'watch'. No
// check reads the pixels of pw_watch, which is drawn by name whether or not its art is defined; until
// it is, TG.Gfx draws its labelled box and warns once, so these checks do not ask for a quiet console.

// The seconds a watch lasts: TG.C.WATCH_TIME, and 3 for a TG.C without it, as js/hud.js reads it.
function watchTime(TG) {
  return typeof TG.C.WATCH_TIME === 'number' ? TG.C.WATCH_TIME : 3;
}

// The pixels of the watch's frame: the outline of the playfield, x 0 to 383 and y PLAY_TOP to 215.
function framePixels(TG) {
  const C = TG.C;
  const out = [];
  for (let x = 0; x < C.W; x++) out.push([x, C.PLAY_TOP], [x, C.H - 1]);
  for (let y = C.PLAY_TOP + 1; y < C.H - 1; y++) out.push([0, y], [C.W - 1, y]);
  return out;
}

check('the power slot shows the Pocket Watch: the slot lit, pw_watch in it, and a WHITE gauge that empties from the top over the watch\'s 3 s', function () {
  const env = loadEnv();
  const TG = env.TG;
  const pal = paletteSet(TG);
  const total = watchTime(TG);
  if (total !== 3) return 'a watch lasts ' + total + ' s';
  const s = handState(TG, 'playing');
  const crate = s.entities.filter(function (e) { return e.kind === 'crate'; })[0];
  // [seconds left, rows of the 14 px gauge that are WHITE, counted from its bottom]
  for (const c of [[3, 14], [2.25, 11], [1.5, 7], [0.75, 4], [0.3, 1], [0.1, 0], [0, 0]]) {
    s.power = { shield: 0, slowT: 0, quillT: 0, watchT: c[0], last: 'watch' };
    const calls = drawCalls(TG, function () { TG.Render.draw(s); });
    const rgba = env.canvas.toRGBA();
    for (let y = 2; y <= 15; y++) {
      const want = y > 15 - c[1] ? pal[4] : pal[1];
      for (const x of [381, 382]) {
        if (pixel(rgba, 384, x, y) !== want) return c[0] + ' s left: the gauge at ' + x + ',' + y + ' is ' + pixel(rgba, 384, x, y) + ', want ' + want;
      }
    }
    if (pixel(rgba, 384, 366, 2) !== pal[3]) return c[0] + ' s left: the slot is dimmed';
    if (pixel(rgba, 384, 380, 9) !== pal[0] || pixel(rgba, 384, 383, 9) !== pal[0]) return 'the gauge is wider than 2 px';
    const icon = named(calls, 'pw_watch');
    if (icon.length !== 1 || icon[0].x !== 372 || icon[0].y !== 17 || !icon[0].anchor || icon[0].remap !== null) {
      return c[0] + ' s left: the icon: ' + JSON.stringify(icon);
    }
  }
  // The crate that carries a watch shows the same icon over its balloon, as every crate shows its power.
  crate.power = 'watch';
  s.power = { shield: 0, slowT: 0, quillT: 0, watchT: 0, last: null };
  const world = named(drawCalls(TG, function () { TG.Render.draw(s); }), 'pw_watch');
  if (world.length !== 1 || world[0].x !== Math.floor(crate.x - s.camera.x)) return 'the watch crate\'s icon: ' + JSON.stringify(world);
  if (env.errors.length) return env.errors[0];
});

check('the icon in the slot blinks while the time runs out: for the watch\'s last second, and for the last 2 s of the Hourglass and the Golden quill as before; it flashes when a power starts', function () {
  const env = loadEnv();
  const TG = env.TG;
  const s = handState(TG, 'playing');
  // The HUD's clock is 0 after a load. The 4 Hz blink is on for an eighth of a second and off for the
  // next: three updates of 1/16 s reach an off eighth, one more the next on eighth.
  const shown = function (power) {
    s.power = Object.assign({ shield: 0, slowT: 0, quillT: 0, watchT: 0 }, power);
    return named(drawCalls(TG, function () { TG.Hud.draw(env.canvas.getContext('2d'), s); }), 'pw_' + power.last).length === 1;
  };
  // [the power, seconds left, steady (true) or blinking]
  const cases = [
    [{ watchT: 3, last: 'watch' }, true], [{ watchT: 1.1, last: 'watch' }, true], [{ watchT: 0.9, last: 'watch' }, false],
    [{ slowT: 2.1, last: 'hourglass' }, true], [{ slowT: 1.9, last: 'hourglass' }, false],
    [{ quillT: 2.1, last: 'quill' }, true], [{ quillT: 1.9, last: 'quill' }, false]
  ];
  for (const c of cases) if (!shown(c[0])) return JSON.stringify(c[0]) + ': no icon in the on phase';
  for (let i = 0; i < 3; i++) TG.Hud.update(1 / 16, s);
  for (const c of cases) {
    if (shown(c[0]) !== c[1]) return JSON.stringify(c[0]) + ': ' + (c[1] ? 'the icon blinks' : 'the icon does not blink');
  }
  TG.Hud.update(1 / 16, s);
  for (const c of cases) if (!shown(c[0])) return JSON.stringify(c[0]) + ': no icon in the next on phase';
  // power:start: the slot flashes at 10 Hz for half a second. An eighth of a second on (the clock at
  // 0.375 s) is an off twentieth.
  TG.Events.emit('power:start', { power: 'watch', duration: 3 });
  for (let i = 0; i < 2; i++) TG.Hud.update(1 / 16, s);
  if (shown({ watchT: 2.875, last: 'watch' })) return 'no flash of the slot when the watch starts';
  for (let i = 0; i < 8; i++) TG.Hud.update(1 / 16, s);
  if (!shown({ watchT: 2.375, last: 'watch' })) return 'the slot still flashes 0.625 s after the start';
});

check('the watch\'s frame: 1 px of AQUA round the playfield (x 0 to 383, y 24 to 215) while power.watchT > 0, three steps on and three off, and nothing else in the picture changes', function () {
  for (const art of [true, false]) {
    const env = loadEnv({ art: art ? undefined : false });
    const TG = env.TG;
    const aqua = TG.PAL[11].toLowerCase();
    const where = art ? '' : ' (without TG.Gfx)';
    const edge = framePixels(TG);
    const onEdge = {};
    edge.forEach(function (p) { onEdge[p[0] + ',' + p[1]] = true; });
    if (edge.length !== 2 * 384 + 2 * 190) return 'the frame has ' + edge.length + ' pixels';
    for (const screen of ['playing', 'lifeLost']) {
      const picture = function (watchT, frame) {
        const s = handState(TG, screen);
        s.power = { shield: 0, slowT: 0, quillT: 0, watchT: watchT, last: null };
        s.frame = frame;
        deepFreeze(s);
        TG.Render.draw(s);
        return env.canvas.toRGBA();
      };
      // Steps 102 to 104 are three steps on (state.frame counts the steps): 99 to 101 before them and
      // 105 to 107 after them are off.
      const plain = picture(0, 102);
      for (const p of [[0, 100], [383, 100], [192, 24], [192, 215]]) {
        if (pixel(plain, 384, p[0], p[1]) === aqua) return screen + where + ': AQUA at ' + p.join(',') + ' with no watch running';
      }
      const on = picture(1.5, 102);
      for (const p of edge) {
        if (pixel(on, 384, p[0], p[1]) !== aqua) return screen + where + ': ' + p.join(',') + ' is ' + pixel(on, 384, p[0], p[1]) + ' on step 102';
      }
      for (let y = 0; y < 216; y++) {
        for (let x = 0; x < 384; x++) {
          if (!onEdge[x + ',' + y] && pixel(on, 384, x, y) !== pixel(plain, 384, x, y)) return screen + where + ': the picture changed at ' + x + ',' + y;
        }
      }
      for (const frame of [103, 104]) {
        const again = picture(1.5, frame);
        for (const p of [[0, 100], [383, 100], [192, 24], [192, 215]]) {
          if (pixel(again, 384, p[0], p[1]) !== aqua) return screen + where + ': no frame at ' + p.join(',') + ' on step ' + frame;
        }
      }
      // The three steps before and the three after: no frame, and the picture of a state without a watch.
      for (const frame of [99, 100, 101, 105, 106, 107]) {
        const off = picture(1.5, frame), none = picture(0, frame);
        for (let i = 0; i < off.length; i++) if (off[i] !== none[i]) return screen + where + ': something drawn on step ' + frame + ', one of the three the frame is off';
      }
      // The last step of a watch still shows it. A state with no watchT (Level 1's, before the watch)
      // has the same edge on a step the frame would be on as on one it would be off.
      if (pixel(picture(1 / 60, 102), 384, 0, 100) !== aqua) return screen + where + ': no frame in the last step';
      const old = [102, 105].map(function (frame) {
        const s = handState(TG, screen);
        s.frame = frame;
        TG.Render.draw(s);
        return env.canvas.toRGBA();
      });
      for (const p of edge) {
        if (pixel(old[0], 384, p[0], p[1]) !== pixel(old[1], 384, p[0], p[1])) return screen + where + ': a frame on a state with no watchT';
      }
    }
    if (env.errors.length) return env.errors[0];
  }
});

check('the watch\'s frame is seen at every rate the main loop draws at: with a picture every 1 to MAX_STEPS steps, from any step, it is in some pictures and not in others; at two steps a picture (30 pictures a second) never the same in more than two running', function () {
  const env = loadEnv();
  const TG = env.TG;
  const aqua = TG.PAL[11].toLowerCase();
  const s = handState(TG, 'playing');
  s.power = { shield: 0, slowT: 0, quillT: 0, watchT: 1.5, last: null };
  for (let every = 1; every <= TG.C.MAX_STEPS; every++) {
    // Six steps are one blink, so six starting steps are every case; 13 pictures are two blinks or more.
    for (let start = 240; start < 246; start++) {
      const shown = [];
      for (let i = 0; i < 13; i++) {
        s.frame = start + i * every;
        TG.Render.draw(s);
        shown.push(pixel(env.canvas.toRGBA(), 384, 0, 100) === aqua);
      }
      const on = shown.filter(function (x) { return x; }).length;
      let run = 1, longest = 1;
      for (let i = 1; i < shown.length; i++) {
        run = shown[i] === shown[i - 1] ? run + 1 : 1;
        longest = Math.max(longest, run);
      }
      const what = 'a picture every ' + every + ' steps from step ' + start + ': the frame is in ' + on + ' of 13 pictures, the same in up to ' + longest + ' running';
      if (on < 4 || on > 9 || longest > 3) return what;
      if (every === 2 && longest > 2) return what;
    }
  }
  if (env.errors.length) return env.errors[0];
});

check('the watch\'s frame stays at the edges of the view when the world is shaken, and the HUD is drawn over it', function () {
  const env = loadEnv();
  const TG = env.TG;
  const pal = paletteSet(TG);
  const s = handState(TG, 'playing');
  withGame(TG, s);
  s.power = { shield: 0, slowT: 0, quillT: 0, watchT: 2, last: null };      // no icon in the slot: see the note above
  s.frame = 102;                                                            // a step the frame is on
  // A hit shakes the world by 3 px (DESIGN 14.6).
  TG.Events.emit('hero:hurt', payloads(TG, s)['hero:hurt']);
  TG.Events.emit('life:lost', payloads(TG, s)['life:lost']);
  let shaken = 0;
  for (let i = 0; i < 12; i++) {
    TG.Effects.update(1 / 60);
    const sh = TG.Effects.shake();
    if (sh.x === 0 && sh.y === 0) continue;
    shaken++;
    TG.Render.draw(s);
    const rgba = env.canvas.toRGBA();
    for (const p of framePixels(TG)) {
      if (pixel(rgba, 384, p[0], p[1]) !== pal[11]) return 'shaken by ' + sh.x + ',' + sh.y + ': ' + p.join(',') + ' is ' + pixel(rgba, 384, p[0], p[1]);
    }
  }
  if (shaken < 4) return 'the world was shaken on ' + shaken + ' frames only';
  // A locked word: the type bar's GOLD border lies on the bottom row (y 215), over the frame.
  TG.Effects.reset();
  s.typing.target = s.entities[1];
  TG.Render.draw(s);
  const rgba = env.canvas.toRGBA();
  if (pixel(rgba, 384, 192, 215) !== pal[18]) return 'the type bar\'s border at 192,215 is ' + pixel(rgba, 384, 192, 215);
  if (pixel(rgba, 384, 2, 215) !== pal[11] || pixel(rgba, 384, 381, 215) !== pal[11]) return 'the frame beside the type bar';
  // The top bar and the strip above the playfield are untouched: no AQUA above y 24 at the sides.
  for (let y = 0; y < 24; y++) if (pixel(rgba, 384, 0, y) === pal[11]) return 'AQUA above the playfield at 0,' + y;
});

check('a Pocket Watch from a crate: pw_watch falls with the crate and flies to Pip, and the popup says POCKET WATCH', function () {
  const env = loadEnv();
  const TG = env.TG;
  const s = handState(TG, 'playing');
  withGame(TG, s);
  const seen = [];
  const draw = TG.Font.draw;
  TG.Font.draw = function (ctx, text) { seen.push(String(text)); return draw.apply(TG.Font, arguments); };
  const ctx = env.canvas.getContext('2d');
  try {
    const p = payloads(TG, s);
    TG.Events.emit('word:clear', Object.assign({}, p['word:clear'], { type: 'crate', kind: 'crate', power: 'watch' }));
    TG.Events.emit('pickup:power', { power: 'watch', x: p['word:clear'].x, y: p['word:clear'].y });
    TG.Events.emit('power:start', { power: 'watch', duration: 3 });
    if (TG.Effects.flash() !== null) return 'a flash for the watch';
    let icons = 0;
    const names = [];
    for (let i = 0; i < 120; i++) {
      TG.Effects.update(1 / 60);
      seen.length = 0;
      icons += named(drawCalls(TG, function () { TG.Effects.draw(ctx, 'world', s.camera.x); }), 'pw_watch').length;
      seen.forEach(function (t) { if (/WATCH|HOURGLASS|QUILL|SHIELD|BLAST/.test(t)) names.push(t); });
      if (TG.Effects.flash() !== null) return 'a flash for the watch';
    }
    if (icons < 30) return 'pw_watch drawn on ' + icons + ' frames of the crate\'s fall and the item\'s flight';
    if (!names.length || names.some(function (t) { return t !== 'POCKET WATCH'; })) return 'the popup: ' + (names.slice(0, 2).join(',') || 'none');
  } finally {
    TG.Font.draw = draw;
  }
  if (env.errors.length) return env.errors[0];
});

if (!SIM_PRESENT) {
  skip('in the game, a Pocket Watch is shown from power:start to power:end', 'the simulation files are not all present');
} else {
  check('in the game, a Pocket Watch is shown from power:start to power:end: for its 180 steps the slot holds pw_watch with the WHITE gauge running down and the frame is on for three steps and off for three; then the slot is empty and the frame gone', function () {
    const env = loadEnv({ sim: true });
    const TG = env.TG;
    const C = TG.C;
    const pal = paletteSet(TG);
    const events = [];
    TG.Events.on('power:start', function (p) { events.push('start ' + p.power + ' ' + p.duration); });
    TG.Events.on('power:end', function (p) { events.push('end ' + p.power); });
    TG.Input.clear();
    TG.Game.init();
    TG.Game.newRun({ difficulty: 'medium', seed: 1, levelId: 1, adaptive: false, assist: 1, tutorial: false });
    // The frame but for its corner under the power slot: until pw_watch has its art, the labelled box
    // that stands for it is placed by its corner and hangs down over that part of the frame.
    const frameAway = framePixels(TG).filter(function (p) { return p[0] < 364 || p[1] > 40; });
    const frame = function () {
      TG.Game.step(C.DT);
      const s = TG.Game.state;
      TG.Effects.update(C.DT);
      TG.Hud.update(C.DT, s);
      const calls = drawCalls(TG, function () { TG.Render.draw(s); });
      const rgba = env.canvas.toRGBA();
      let rows = 0;
      for (let y = 2; y <= 15; y++) if (pixel(rgba, 384, 381, y) === pal[4] && pixel(rgba, 384, 382, y) === pal[4]) rows++;
      const edge = frameAway.filter(function (p) { return pixel(rgba, 384, p[0], p[1]) === pal[11]; }).length;
      return { s: s, rows: rows, edge: edge, lit: pixel(rgba, 384, 366, 2) === pal[3], icon: named(calls, 'pw_watch').length };
    };
    for (let i = 0; i < 30; i++) {
      const f = frame();
      if (f.edge > 100 || f.lit || f.icon || f.rows) return 'before the watch: ' + JSON.stringify({ rows: f.rows, edge: f.edge, lit: f.lit, icon: f.icon });
    }
    const p0 = TG.Game.state.player;
    // The crate's word is typed: the game applies its power (js/game.js, completeWord).
    TG.Game.applyPower('watch', p0.x + 60, p0.y - 60);
    if (events.join(', ') !== 'start watch 3') return 'events at the pickup: ' + events.join(', ');
    const all = frameAway.length;
    let icons = 0;
    for (let i = 1; i <= 179; i++) {
      const f = frame();
      const left = f.s.power.watchT;
      if (!(left > 0) || f.s.power.last !== 'watch' || f.s.screen !== 'playing') return 'step ' + i + ': watchT ' + left + ', last ' + f.s.power.last + ', on ' + f.s.screen;
      if (Math.abs(left - (3 - i * C.DT)) > 1e-6) return 'step ' + i + ': ' + left + ' s left';
      if (f.rows !== Math.round(14 * left / 3)) return 'step ' + i + ': ' + f.rows + ' rows of the gauge are WHITE with ' + left.toFixed(3) + ' s left';
      if (!f.lit) return 'step ' + i + ': the slot is dimmed';
      // Every pixel of the frame on the three steps it is on; on the three it is off only what the world
      // has there (water).
      if (Math.floor(f.s.frame / 3) % 2 === 0 ? f.edge !== all : f.edge > 100) {
        return 'step ' + i + ' (frame ' + f.s.frame + '): ' + f.edge + ' of the ' + all + ' pixels of the frame are AQUA';
      }
      icons += f.icon;
    }
    // The icon is steady for the first 2 s, but for the half second in which the slot flashes at 10 Hz,
    // and blinks at 4 Hz through the last second.
    if (icons < 120 || icons > 150) return 'pw_watch drawn in the slot on ' + icons + ' of the 179 steps';
    const last = frame();
    if (events.join(', ') !== 'start watch 3, end watch') return 'events after 180 steps: ' + events.join(', ');
    if (last.s.power.watchT !== 0 || last.s.power.last !== null) return 'after the watch: ' + JSON.stringify(last.s.power);
    for (let i = 0; i < 30; i++) {
      const f = i === 0 ? last : frame();
      if (f.edge > 100 || f.lit || f.icon || f.rows) return 'after the watch: ' + JSON.stringify({ rows: f.rows, edge: f.edge, lit: f.lit, icon: f.icon });
    }
    if (env.errors.length) return env.errors[0];
    const other = env.warnings.filter(function (w) { return w.indexOf('"pw_watch"') === -1; });
    if (other.length) return 'console: ' + other[0];
  });
}

// ---------------------------------------------------------------------------------------------
// 9. Level 2's creatures on screen: the dangle and the flit (LEVEL2 4.3; milestone M2, the cases of 13.5)
// ---------------------------------------------------------------------------------------------
//
// Hand-built states with one creature and nothing else that moves, so that every sprite and every 1 px
// SILVER rect of a frame can be read. The simulation gives both kinds a still or level place; the sway of
// the dangle and the flutter of the flit are the renderer's, and so is the thread.

// A scene with one dangle or flit at dx from Pip and elev above the ground: no hazards, no ink drops.
function creatureScene(TG, kind, dx, elev, extra) {
  const s = handState(TG, 'playing');
  s.level.hazards = [];
  s.items = [];
  const e = entity(TG, s, kind, kind === 'flit' ? 'bat' : 'web', dx, elev,
    Object.assign({ from: 'above', w: kind === 'flit' ? 24 : 16, h: 16 }, kind === 'flit' ? { turned: false } : {}, extra || {}));
  s.entities = [e];
  return { s: s, e: e };
}

// The 1 px wide SILVER rects that fn draws inside the playfield, in order: the dangle's thread, and the
// tail of a plate that is neither locked nor dim.
function silverRuns(TG, fn) {
  const C = TG.C;
  const runs = [];
  const rect = TG.Gfx.rect;
  TG.Gfx.rect = function (ctx, x, y, w, h, color) {
    if (color === 3 && w === 1 && y >= C.PLAY_TOP && y + h <= C.GROUND_Y) runs.push({ x: x, y: y, h: h });
    return rect.apply(TG.Gfx, arguments);
  };
  try { fn(); } finally { TG.Gfx.rect = rect; }
  return runs;
}

// One frame of a scene: the sprite calls and the SILVER runs.
function creatureFrame(TG, s) {
  let runs = [];
  const calls = drawCalls(TG, function () { runs = silverRuns(TG, function () { TG.Render.draw(s); }); });
  return { calls: calls, runs: runs };
}

check('the dangle hangs on its thread: hang0 and hang1 at 4 frames a second, swaying up to 2 px either way on animT, with 1 px of SILVER from PLAY_TOP down to the top of the sprite wherever the sway has put it', function () {
  const env = loadEnv();
  const TG = env.TG;
  const C = TG.C;
  const pal = paletteSet(TG);
  const bottom = C.GROUND_Y - C.DANGLE_ELEV, top = bottom - 16;          // y 148 to 164 while it hangs
  const hang = function (animT, extra) {
    return creatureScene(TG, 'dangle', 120, C.DANGLE_ELEV, Object.assign({ phase: 'hang', t: 0.5, typable: false, animT: animT }, extra || {}));
  };
  const bare = hang(0);
  bare.s.entities = [];
  if (creatureFrame(TG, bare.s).runs.length) return 'the scene has 1 px SILVER rects of its own';
  const seen = {};
  let last = null;
  for (let i = 0; i <= 300; i++) {                                       // 5 s of animT
    const animT = i / 60;
    const sc = hang(animT);
    sc.s.time = 12.5 + (i % 7) * 0.31;                                   // the clock of the state does not move it
    const sx = Math.floor(sc.e.x - sc.s.camera.x);
    const f = creatureFrame(TG, sc.s);
    const d = named(f.calls, 'en_dangle');
    if (d.length !== 1) return 'animT ' + animT.toFixed(3) + ': en_dangle drawn ' + d.length + ' times';
    const off = d[0].x - sx;
    seen[off] = true;
    if (Math.abs(off) > 2 || d[0].y !== bottom || d[0].flipX || d[0].remap !== null) return 'animT ' + animT.toFixed(3) + ': ' + JSON.stringify(d[0]) + ' with the anchor at x ' + sx;
    if (d[0].frame !== Math.floor(animT * 4) % 2) return 'animT ' + animT.toFixed(3) + ': frame ' + d[0].frame;
    if (last !== null && Math.abs(off - last) > 1) return 'animT ' + animT.toFixed(3) + ': the sway jumps from ' + last + ' to ' + off + ' px';
    last = off;
    // The thread: one upright run for each x from the anchor to the sprite, end to end from PLAY_TOP to
    // the sprite's top row.
    if (f.runs.length !== Math.abs(off) + 1) return 'animT ' + animT.toFixed(3) + ': ' + f.runs.length + ' runs of thread for a sway of ' + off + ' px';
    let y = C.PLAY_TOP;
    for (let k = 0; k < f.runs.length; k++) {
      const r = f.runs[k];
      if (r.x !== sx + k * Math.sign(off) || r.y !== y || !(r.h > 0)) return 'animT ' + animT.toFixed(3) + ': run ' + k + ' of the thread is ' + JSON.stringify(r) + ', expected at x ' + (sx + k * Math.sign(off)) + ' from y ' + y;
      y += r.h;
    }
    if (y !== top) return 'animT ' + animT.toFixed(3) + ': the thread ends at y ' + y + ', and the sprite\'s top row is ' + top;
  }
  if (Object.keys(seen).length !== 5) return 'sway offsets seen in 5 s: ' + Object.keys(seen).join(',');
  // The same animT gives the same picture at any state.time and state.frame: it is the entity's clock.
  const at = function (time, frame) {
    const sc = hang(0.7);
    sc.s.time = time;
    sc.s.frame = frame;
    const f = creatureFrame(TG, sc.s);
    return JSON.stringify([named(f.calls, 'en_dangle'), f.runs]);
  };
  if (at(3, 100) !== at(47.37, 2931)) return 'the dangle is drawn differently at another state.time with the same animT';
  // On the canvas: at rest the thread is the column of the anchor, 1 px wide, drawn over the backdrop.
  const still = hang(0);
  const sx = Math.floor(still.e.x - still.s.camera.x);
  TG.Render.draw(still.s);
  const rgba = env.canvas.toRGBA();
  for (let y = C.PLAY_TOP; y < top; y++) {
    if (pixel(rgba, 384, sx, y) !== pal[3]) return 'the thread at ' + sx + ',' + y + ' is ' + pixel(rgba, 384, sx, y);
    if (pixel(rgba, 384, sx - 1, y) === pal[3] || pixel(rgba, 384, sx + 1, y) === pal[3]) return 'the thread is wider than 1 px at y ' + y;
  }
  if (pixel(rgba, 384, sx, C.PLAY_TOP - 1) === pal[3]) return 'the thread runs above the playfield';
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

check('the thread is not drawn while the anchor is beyond the right edge, nor while the sprite is above the playfield; on the drop it is as long as the sprite is far down', function () {
  const env = loadEnv();
  const TG = env.TG;
  const C = TG.C;
  const thread = function (dx, elev, phase) {
    const sc = creatureScene(TG, 'dangle', dx, elev, { phase: phase, t: phase === 'hang' ? 0.5 : 0.1, typable: false, animT: 0 });
    const f = creatureFrame(TG, sc.s);
    return { sprite: named(f.calls, 'en_dangle').length, runs: JSON.stringify(f.runs), sx: Math.floor(sc.e.x - sc.s.camera.x) };
  };
  const right = C.W - C.HERO_SCREEN_X;                    // dx of an anchor at screen x 384, the first column out of view
  // The anchor one column out of view: the left half of the sprite is in view and drawn, with no thread.
  for (const dx of [right, right + 7]) {
    const out = thread(dx, C.DANGLE_ELEV, 'hang');
    if (out.sprite !== 1 || out.runs !== '[]') return 'anchor at screen x ' + out.sx + ': sprite drawn ' + out.sprite + ' times, thread ' + out.runs;
  }
  const edge = thread(right - 1, C.DANGLE_ELEV, 'hang');
  if (edge.runs !== JSON.stringify([{ x: 383, y: C.PLAY_TOP, h: C.GROUND_Y - C.DANGLE_ELEV - 16 - C.PLAY_TOP }])) return 'anchor at screen x 383: thread ' + edge.runs;
  // The drop (LEVEL2 4.3): from the roof, where the sprite's bottom is at the top of the screen.
  const roof = C.GROUND_Y - C.PLAY_TOP + 16;
  const playTop = C.GROUND_Y - C.PLAY_TOP - 16;           // elev at which the sprite's top row is row PLAY_TOP
  for (const elev of [roof, roof - 20, playTop]) {
    const up = thread(120, elev, 'drop');
    if (up.sprite !== 1 || up.runs !== '[]') return 'elev ' + elev + ': sprite drawn ' + up.sprite + ' times, thread ' + up.runs;
  }
  for (const down of [1, 40, 100]) {
    const d = thread(120, playTop - down, 'drop');
    if (d.runs !== JSON.stringify([{ x: d.sx, y: C.PLAY_TOP, h: down }])) return 'the sprite ' + down + ' px into the playfield: thread ' + d.runs;
  }
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

check('the flit: flap0 and flap1 at 8 frames a second and the dive frame in its dive, flipped from its turn behind Pip, with the marker on the ground at Pip\'s x during the dive only', function () {
  const env = loadEnv();
  const TG = env.TG;
  const C = TG.C;
  // [phase, t, dx, elev, turned]: the four phases of LEVEL2 4.3. `from` is 'above' in all of them.
  const cases = [
    ['enter', 0.05, C.FLIT_FROM_DX, 150, false], ['cross', 0.35, 40, C.FLIT_CROSS_ELEV, false],
    ['behind', 0.6, C.FLIT_BEHIND_DX, 90, true], ['dive', 0.85, -40, 50, true]
  ];
  for (const c of cases) {
    for (const animT of [0, 0.06, 0.13, 0.2, 0.26, 0.4, 1.01, 7.3]) {
      const sc = creatureScene(TG, 'flit', c[2], c[3], { phase: c[0], t: c[1], turned: c[4], flipX: c[4], animT: animT });
      const where = c[0] + ' at animT ' + animT;
      const calls = drawCalls(TG, function () { TG.Render.draw(sc.s); });
      const f = named(calls, 'en_flit');
      if (f.length !== 1) return where + ': en_flit drawn ' + f.length + ' times';
      const frame = c[0] === 'dive' ? 'dive' : Math.floor(animT * 8) % 2;
      if (f[0].frame !== frame) return where + ': frame ' + f[0].frame + ', expected ' + frame;
      if (f[0].flipX !== c[4]) return where + ': flipX ' + f[0].flipX + ' with turned ' + c[4];
      if (f[0].x !== Math.floor(sc.e.x - sc.s.camera.x) || f[0].remap !== null) return where + ': ' + JSON.stringify(f[0]);
      if (c[0] !== 'cross' && f[0].y !== C.GROUND_Y - c[3]) return where + ': drawn at y ' + f[0].y + ', its path is at ' + (C.GROUND_Y - c[3]);
      const marker = named(calls, 'fx_marker');
      if (c[0] !== 'dive') {
        if (marker.length) return where + ': a ground marker';
      } else if (marker.length !== 1 || marker[0].x !== C.HERO_SCREEN_X || marker[0].y !== C.GROUND_Y + 4 || calls.indexOf(marker[0]) > calls.indexOf(f[0])) {
        return where + ': the ground marker: ' + JSON.stringify(marker);
      }
    }
  }
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

check('the flit flutters in its crossing only: up to 4 px above and below its level path on animT, from nothing as the crossing begins and back to nothing as it ends', function () {
  const env = loadEnv();
  const TG = env.TG;
  const C = TG.C;
  const T1 = C.FLIT_ENTER_T, T2 = C.FLIT_CROSS_T;
  // How many px above its path the flit is drawn.
  const rise = function (phase, t, animT, elev, time) {
    const sc = creatureScene(TG, 'flit', 40, elev, { phase: phase, t: t, animT: animT, turned: t >= T2, flipX: t >= T2 });
    if (time !== undefined) { sc.s.time = time; sc.s.frame = Math.round(time * 60); }
    const f = named(drawCalls(TG, function () { TG.Render.draw(sc.s); }), 'en_flit');
    return f.length === 1 ? C.GROUND_Y - elev - f[0].y : NaN;
  };
  const mid = (T1 + T2) / 2;
  const seen = {};
  for (let i = 0; i <= 180; i++) {                                       // 3 s of animT in the middle of the crossing
    const up = rise('cross', mid, i / 60, C.FLIT_CROSS_ELEV);
    if (!(Math.abs(up) <= 4) || up !== Math.round(up)) return 'animT ' + (i / 60).toFixed(3) + ': drawn ' + up + ' px above its path';
    seen[up] = true;
  }
  if (!seen[4] || !seen[-4] || !seen[0]) return 'in 3 s the flutter reaches ' + Object.keys(seen).join(',') + ' px';
  // It is the entity's clock that moves it. A Pocket Watch holds animT with the world and lets state.time
  // run (LEVEL2 6.3), so a flutter on state.time would go on through a freeze.
  for (const animT of [0.1, 0.37, 0.9]) {
    const ups = [0, 3.3, 12.5, 100.25].map(function (time) { return rise('cross', mid, animT, C.FLIT_CROSS_ELEV, time); });
    if (ups.some(function (u) { return u !== ups[0]; })) return 'animT ' + animT + ' at four values of state.time: ' + ups.join(',');
  }
  // The reach grows from nothing over the first eighth of the crossing and dies away over the last.
  const reach = function (t) {
    let most = 0;
    for (let i = 0; i < 60; i++) most = Math.max(most, Math.abs(rise('cross', t, i / 60, C.FLIT_CROSS_ELEV)));
    return most;
  };
  const eighth = (T2 - T1) / 8;
  const reaches = [T1, T1 + eighth / 2, T1 + eighth, mid, T2 - eighth, T2 - eighth / 2, T2 - 1e-9].map(reach);
  if (JSON.stringify(reaches) !== JSON.stringify([0, 2, 4, 4, 4, 2, 0])) return 'the reach through the crossing: ' + reaches.join(',');
  // Level in the other phases, whatever animT says.
  for (const c of [['enter', 0.05, 150], ['behind', 0.6, 90], ['dive', 0.85, 50]]) {
    for (let i = 0; i < 60; i++) {
      const up = rise(c[0], c[1], i / 60, c[2]);
      if (up !== 0) return c[0] + ' at animT ' + (i / 60).toFixed(3) + ': drawn ' + up + ' px above its path';
    }
  }
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

check('the plates of the two hold still: a dangle\'s over its anchor, a crossing flit\'s clear of the top of its flutter; the tail and the lock brackets go with the sprite as it is drawn', function () {
  const env = loadEnv();
  const TG = env.TG;
  const C = TG.C;
  const mid = (C.FLIT_ENTER_T + C.FLIT_CROSS_T) / 2;
  const builds = {
    dangle: function (animT) { return creatureScene(TG, 'dangle', 120, C.DANGLE_ELEV, { phase: 'hang', t: 0.5, animT: animT }); },
    flit: function (animT) { return creatureScene(TG, 'flit', 40, C.FLIT_CROSS_ELEV, { phase: 'cross', t: mid, animT: animT }); }
  };
  for (const kind of ['dangle', 'flit']) {
    const plates = {};
    let moved = 0;
    for (let i = 0; i < 150; i++) {
      const animT = i / 60;
      const sc = builds[kind](animT);
      const sx = Math.floor(sc.e.x - sc.s.camera.x), top = Math.floor(sc.e.y) - 16;
      const sprite = named(drawCalls(TG, function () { TG.Render.draw(sc.s); }), 'en_' + kind)[0];
      const dx = sprite.x - sx, up = Math.floor(sc.e.y) - sprite.y;
      if (dx !== 0 || up !== 0) moved++;
      const L = TG.Render.layoutLabels(sc.s)[0];
      plates[[L.x, L.y, L.edge].join(',')] = true;
      // The plate: centred on the anchor, 4 px above the top of the sprite's highest place.
      const wantY = top - (kind === 'flit' ? 4 : 0) - 4 - L.h;
      if (L.x !== Math.floor(sx - L.w / 2) || L.y !== wantY || L.edge !== null) return kind + ' at animT ' + animT.toFixed(3) + ': plate at ' + L.x + ',' + L.y + ', expected ' + Math.floor(sx - L.w / 2) + ',' + wantY;
      if (L.tailX !== sprite.x || L.tailY !== sprite.y - 16) return kind + ' at animT ' + animT.toFixed(3) + ': the tail ends at ' + L.tailX + ',' + L.tailY + ' and the sprite\'s top centre is ' + sprite.x + ',' + (sprite.y - 16);
      // Locked: the brackets stand 3 px outside the sprite's box where it is drawn (CONTRACT 5.13, DESIGN 4.5).
      sc.s.typing.target = sc.e;
      const b = named(drawCalls(TG, function () { TG.Render.draw(sc.s); }), 'fx_bracket');
      const w = sc.e.w;
      const want = [[sprite.x - w / 2 - 3, sprite.y - 16 - 3], [sprite.x + w / 2 + 3, sprite.y - 16 - 3], [sprite.x - w / 2 - 3, sprite.y + 3 - 8], [sprite.x + w / 2 + 3, sprite.y + 3 - 8]];
      const got = b.map(function (c) { return [c.x, c.y]; });
      if (JSON.stringify(got) !== JSON.stringify(want)) return kind + ' at animT ' + animT.toFixed(3) + ': brackets at ' + JSON.stringify(got) + ', expected ' + JSON.stringify(want);
    }
    if (Object.keys(plates).length !== 1) return kind + ': the plate was in ' + Object.keys(plates).length + ' places in 2.5 s';
    if (moved < 60) return kind + ': the sprite was away from its place on ' + moved + ' of 150 frames, so nothing was tested';
  }
  // Outside the crossing the flit's plate is 4 px above its sprite, as every plate is.
  const behind = creatureScene(TG, 'flit', C.FLIT_BEHIND_DX, 90, { phase: 'behind', t: 0.6, turned: true, flipX: true });
  const L = TG.Render.layoutLabels(behind.s)[0];
  if (L.y !== C.GROUND_Y - 90 - 16 - 4 - L.h || L.tailY !== C.GROUND_Y - 90 - 16) return 'the plate of a flit behind Pip: y ' + L.y + ', tail to ' + L.tailY;
  // Another creature's plate keeps clear of the whole reach of the flutter, as it does of a bee's bob.
  const two = builds.flit(0);
  const flitBox = { x: Math.floor(two.e.x - two.s.camera.x) - 12, y: C.GROUND_Y - C.FLIT_CROSS_ELEV - 16 - 4, w: 24, h: 16 + 8 };
  for (let elev = 40; elev <= 80; elev++) {
    const other = entity(TG, two.s, 'dawdle', 'slow', 40, elev);
    two.s.entities = [two.e, other];
    const plate = TG.Render.layoutLabels(two.s).filter(function (l) { return l.id === other.id; })[0];
    // The INK margin and the border are drawn 2 px outside the plate box.
    if (rectsOverlap({ x: plate.x - 2, y: plate.y - 2, w: plate.w + 4, h: plate.h + 4 }, flitBox)) return 'a plate at y ' + plate.y + ' (its creature at elev ' + elev + ') reaches into the flutter of the flit, y ' + flitBox.y + ' to ' + (flitBox.y + flitBox.h);
  }
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

check('edge tags of the two (LEVEL2 4.3): a dangle beyond the right edge has the right tag, also while it is still above the playfield; above the playfield in view both have the top tag; a flit behind Pip has a plate', function () {
  const env = loadEnv({ art: false });
  const TG = env.TG;
  const C = TG.C;
  const roof = C.GROUND_Y - C.PLAY_TOP + 16;
  const label = function (kind, dx, elev, extra) {
    const sc = creatureScene(TG, kind, dx, elev, extra);
    return TG.Render.layoutLabels(sc.s)[0];
  };
  const far = C.W - C.HERO_SCREEN_X + 8;                   // dx at which a 16 px sprite is just out of view
  // A far dangle from its spawn at the roof, down its drop, to its hang: the right tag all the way,
  // pinned to the right edge at the height of the sprite.
  for (const elev of [roof, roof - 1, 160, 100, C.DANGLE_ELEV]) {
    for (const dx of [far, far + 40, far + 600]) {
      const L = label('dangle', dx, elev, { phase: elev > C.DANGLE_ELEV ? 'drop' : 'hang' });
      const wantY = Math.max(26, C.GROUND_Y - elev - 16 - 4 - L.h);
      if (L.edge !== 'right' || L.x + L.w !== 382 || L.y !== wantY || L.tailX !== null) return 'a dangle ' + dx + ' px ahead at elev ' + elev + ': ' + JSON.stringify(L);
    }
  }
  // In view from the side and still above the playfield: the top tag over the anchor.
  for (const kind of ['dangle', 'flit']) {
    const L = label(kind, 150, roof, { phase: kind === 'flit' ? 'enter' : 'drop' });
    if (L.edge !== 'top' || L.y !== C.PLAY_TOP + 2 || L.x !== Math.floor(C.HERO_SCREEN_X + 150 - L.w / 2) || L.tailX !== null) return 'a ' + kind + ' above the playfield: ' + JSON.stringify(L);
  }
  // One px of the far dangle's sprite in view: an ordinary plate.
  if (label('dangle', far - 1, C.DANGLE_ELEV, { phase: 'hang' }).edge !== null) return 'a dangle with its edge in view still has a tag';
  // The flit at its hover point behind Pip is on screen (x 12 to 36), so its plate is not a left tag.
  const behind = label('flit', C.FLIT_BEHIND_DX, C.FLIT_BEHIND_ELEV, { phase: 'behind', turned: true, flipX: true });
  if (behind.edge !== null || behind.tailX !== C.HERO_SCREEN_X + C.FLIT_BEHIND_DX) return 'the flit behind Pip: ' + JSON.stringify(behind);
});

check('the dangle and the flit are drawn in front of what hangs from the roof (the hazards and their rims) and behind Pip', function () {
  const env = loadEnv();
  const TG = env.TG;
  const C = TG.C;
  const s = handState(TG, 'playing');
  const branch = s.level.hazards[2];
  if (branch.kind !== 'branch') return 'hand state: ' + branch.kind;
  // A flit crossing in front of the trunk of the branch, and a dangle hanging beside it.
  const flit = entity(TG, s, 'flit', 'bat', branch.x + 8 - s.player.x, C.FLIT_CROSS_ELEV, { from: 'above', w: 24, phase: 'cross', t: 0.3, turned: false });
  const dangle = entity(TG, s, 'dangle', 'web', branch.x + 40 - s.player.x, C.DANGLE_ELEV, { from: 'above', phase: 'hang', t: 0.5 });
  s.entities = [flit, dangle];
  const f = creatureFrame(TG, s);
  const order = f.calls.map(function (c) { return c.name; });
  const lastHazard = Math.max.apply(null, ['haz_branch', 'haz_trunk', 'haz_canopy', 'haz_beehive', 'haz_rope', 'haz_arch'].map(function (n) { return order.lastIndexOf(n); }));
  const pip = order.indexOf('hero_run');
  if (lastHazard < 0 || pip < 0) return 'the scene draws no hazard or no Pip';
  for (const name of ['en_flit', 'en_dangle']) {
    const i = order.indexOf(name);
    if (!(i > lastHazard && i < pip)) return name + ' is call ' + i + '; the last hazard sprite is ' + lastHazard + ' and Pip is ' + pip;
  }
  // The flit's 24 x 16 box is whole on the canvas where it crosses the trunk: no pixel of the trunk's colours.
  const before = env.canvas.toRGBA();
  s.entities = [dangle];
  TG.Render.draw(s);
  const without = env.canvas.toRGBA();
  const fx = Math.floor(flit.x - s.camera.x) - 12, fy = Math.floor(flit.y) - 16;
  const frame = TG.Gfx.get('en_flit', named(f.calls, 'en_flit')[0].frame, { flipX: false, remap: null });
  const data = frame.getContext('2d').getImageData(0, 0, 24, 16).data;
  let solid = 0;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 24; x++) {
      if (data[(y * 24 + x) * 4 + 3] === 0) continue;
      solid++;
      const sy = named(f.calls, 'en_flit')[0].y - 16 + y;
      const want = '#' + [0, 1, 2].map(function (k) { const v = data[(y * 24 + x) * 4 + k]; return (v < 16 ? '0' : '') + v.toString(16); }).join('');
      if (pixel(before, 384, fx + x, sy) !== want) return 'the flit\'s pixel ' + x + ',' + y + ' shows ' + pixel(before, 384, fx + x, sy) + ' on the canvas, not its own ' + want;
    }
  }
  if (solid < 80) return 'the flit\'s frame has ' + solid + ' solid pixels';
  if (pixel(without, 384, fx + 12, fy + 8) === pixel(before, 384, fx + 12, fy + 8)) return 'the flit was not over the trunk in this scene';
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

check('a dangle and a flit are cleared where they were drawn: on the step of word:clear TG.Effects has the sprite, and the dangle\'s thread, where TG.Render had them the frame before, at every sway and every height of the flutter; the thread keeps its anchor through the zip; a clear that the clamp of CONTRACT 4.17 moves in from an edge, out of view or half in it, is upright at the edge (LEVEL2 4.2, 4.3)', function () {
  const env = loadEnv();
  const TG = env.TG;
  const C = TG.C;
  // The creature as TG.Render draws it alive, then TG.Effects' picture on the step of its word:clear and
  // `later` steps on. It has no plate here, so every 1 px SILVER rect is thread. The entity is handed to
  // the effects as the game hands it: marked dead, and still in state.entities.
  const join = function (kind, dx, elev, extra, later) {
    const sc = creatureScene(TG, kind, dx, elev, Object.assign({ typable: false }, extra));
    withGame(TG, sc.s);
    TG.Effects.reset();
    const live = creatureFrame(TG, sc.s);
    removed(sc.e, 'cleared');
    TG.Events.emit('word:clear', Object.assign(clearOf(sc.s, kind, 0, sc.e.y), { id: sc.e.id, x: sc.e.x }));
    for (let i = 0; i < (later || 0); i++) TG.Effects.update(1 / 60);
    const pic = effectsPicture(TG, env, sc.s);
    return { anchor: Math.floor(sc.e.x - sc.s.camera.x), alive: named(live.calls, 'en_' + kind), runs: live.runs,
      cleared: named(pic.sprites, 'en_' + kind), threads: pic.threads,
      bolt: TG.Effects._list().filter(function (f) { return f.type === 'bolt'; })[0] || null };
  };
  // The ink bolt flies to the middle of the sprite's box as it was drawn.
  const same = function (j, what) {
    if (j.alive.length !== 1 || j.cleared.length !== 1) return what + ': drawn ' + j.alive.length + ' times alive and ' + j.cleared.length + ' times cleared';
    const a = j.alive[0], c = j.cleared[0];
    if (a.x !== c.x || a.y !== c.y || a.flipX !== c.flipX) return what + ': alive at ' + a.x + ',' + a.y + (a.flipX ? ' flipped' : '') + ', cleared at ' + c.x + ',' + c.y + (c.flipX ? ' flipped' : '');
    if (JSON.stringify(j.runs) !== JSON.stringify(j.threads)) return what + ': thread alive ' + JSON.stringify(j.runs) + ', cleared ' + JSON.stringify(j.threads);
    if (!j.bolt || Math.floor(j.bolt.x) !== a.x || Math.floor(j.bolt.y) !== a.y - 8) return what + ': the bolt flies to ' + JSON.stringify(j.bolt) + ', the sprite is at ' + a.x + ',' + a.y;
    return null;
  };
  let bad;
  // The dangle through one sway, hanging and on its drop.
  const sways = {};
  for (let i = 0; i <= 150; i++) {
    const hang = join('dangle', 120, C.DANGLE_ELEV, { phase: 'hang', t: 0.5, animT: i / 60 });
    if ((bad = same(hang, 'dangle hanging at animT ' + (i / 60).toFixed(3)))) return bad;
    sways[hang.alive[0].x - hang.anchor] = true;
    if (hang.threads.length !== Math.abs(hang.alive[0].x - hang.anchor) + 1 || hang.threads[0].x !== hang.anchor) return 'animT ' + (i / 60).toFixed(3) + ': thread ' + JSON.stringify(hang.threads) + ' for the anchor at x ' + hang.anchor;
    if ((bad = same(join('dangle', 120, 90, { phase: 'drop', t: 0.1, animT: i / 60 }), 'dangle on its drop at animT ' + (i / 60).toFixed(3)))) return bad;
  }
  if (Object.keys(sways).length !== 5) return 'sways cleared at: ' + Object.keys(sways).join(',');
  // It keeps that place through the bolt and the flash, and on the zip its thread still comes down from
  // the anchor to the sprite.
  const swung = { phase: 'hang', t: 0.5, animT: 0.625 };                 // a quarter of a sway: 2 px out
  const first = join('dangle', 120, C.DANGLE_ELEV, swung, 0);
  if (first.alive[0].x - first.anchor !== 2) return 'the test\'s dangle is ' + (first.alive[0].x - first.anchor) + ' px from its anchor';
  for (const later of [5, 8, 14, 20]) {
    const j = join('dangle', 120, C.DANGLE_ELEV, swung, later);
    if (j.cleared.length !== 1 || j.cleared[0].x !== first.alive[0].x) return later + ' steps on: ' + JSON.stringify(j.cleared);
    const last = j.threads[j.threads.length - 1];
    if (j.threads.length !== 3 || j.threads[0].x !== j.anchor || j.threads[0].y !== C.PLAY_TOP || last.x !== j.cleared[0].x || last.y + last.h !== j.cleared[0].y - 16) return later + ' steps on: thread ' + JSON.stringify(j.threads) + ' for the sprite ' + JSON.stringify(j.cleared[0]);
    if (later < 9 ? j.cleared[0].y !== first.alive[0].y : !(j.cleared[0].y < first.alive[0].y)) return later + ' steps on it is at y ' + j.cleared[0].y;
  }
  // The flit through one beat of its flutter in the crossing, on the ramp at its start, and behind Pip.
  const heights = {};
  for (let i = 0; i <= 30; i++) {
    const cross = join('flit', 40, C.FLIT_CROSS_ELEV, { phase: 'cross', t: 0.35, animT: i / 60 });
    if ((bad = same(cross, 'flit crossing at animT ' + (i / 60).toFixed(3)))) return bad;
    heights[C.GROUND_Y - C.FLIT_CROSS_ELEV - cross.alive[0].y] = true;
    if ((bad = same(join('flit', 140, C.FLIT_CROSS_ELEV, { phase: 'cross', t: 0.17, animT: i / 60 }), 'flit starting to cross at animT ' + (i / 60).toFixed(3)))) return bad;
    if ((bad = same(join('flit', -72, 90, { phase: 'behind', t: 0.6, turned: true, flipX: true, animT: i / 60 }), 'flit behind Pip at animT ' + (i / 60).toFixed(3)))) return bad;
  }
  if (Object.keys(heights).length !== 9) return 'flutters cleared at: ' + Object.keys(heights).join(',');
  // Beyond the right edge nothing was drawn; the clear is played at the edge, where the tag was, upright.
  const far = join('dangle', 400, C.DANGLE_ELEV, swung, 0);
  if (far.alive.length !== 0 || far.runs.length !== 0) return 'a dangle beyond the right edge is drawn';
  if (far.cleared.length !== 1 || far.cleared[0].x !== C.W - 8 || far.threads.length !== 1 || far.threads[0].x !== C.W - 8) return 'beyond the right edge: cleared ' + JSON.stringify(far.cleared) + ', thread ' + JSON.stringify(far.threads);
  // Half in view at the right edge, with its anchor at screen x 377 to 391, it has a plate and can be typed
  // away. The clamp moves the clear of every kind in to x 376 there (CONTRACT 4.17), and the dangle's is
  // then played as one out of view is: at x 376 and no further, upright, on a thread at x 376, whichever
  // way it had swayed and whether or not its own thread was in view.
  const upright = JSON.stringify([{ x: C.W - 8, y: C.PLAY_TOP, h: C.GROUND_Y - C.DANGLE_ELEV - 16 - C.PLAY_TOP }]);
  const back = { phase: 'hang', t: 0.5, animT: 1.875 };                  // three quarters of a sway: 2 px back
  for (const at of [377, 380, 383, 384, 391]) {
    for (const pose of [swung, back]) {
      const j = join('dangle', at - C.HERO_SCREEN_X, C.DANGLE_ELEV, pose, 0);
      const sway = pose === swung ? 2 : -2;
      if (j.alive.length !== 1 || j.alive[0].x !== at + sway || (j.runs.length > 0) !== (at < C.W)) return 'anchor at screen x ' + at + ': alive ' + JSON.stringify(j.alive) + ', thread ' + JSON.stringify(j.runs);
      if (j.cleared.length !== 1 || j.cleared[0].x !== C.W - 8 || j.cleared[0].y !== j.alive[0].y || JSON.stringify(j.threads) !== upright) return 'anchor at screen x ' + at + ', swayed ' + sway + ': cleared ' + JSON.stringify(j.cleared) + ', thread ' + JSON.stringify(j.threads);
      if (!j.bolt || Math.floor(j.bolt.x) !== C.W - 8) return 'anchor at screen x ' + at + ': the bolt flies to ' + JSON.stringify(j.bolt);
    }
  }
  // Up to x 376 the clamp leaves it, and it is cleared where it was drawn: at most 2 px beyond 376.
  for (const pose of [swung, back]) {
    const j = join('dangle', C.W - 8 - C.HERO_SCREEN_X, C.DANGLE_ELEV, pose, 0);
    if ((bad = same(j, 'dangle with its anchor at screen x 376'))) return bad;
    if (j.cleared[0].x !== C.W - 8 + (pose === swung ? 2 : -2)) return 'anchor at screen x 376: cleared at ' + j.cleared[0].x;
  }
  // The top edge has the same clamp, to the sprite's top on the top row of the playfield (the bottom of a
  // 16 px sprite at y 40), as for the Swoop. A dangle part of the way in on its drop is cleared there,
  // unswayed and with no thread yet; an entering flit is cleared there too.
  const top = C.PLAY_TOP + 16;
  const dropping = join('dangle', 120, C.GROUND_Y - (top - 6), { phase: 'drop', t: 0.05, animT: 0.625 }, 0);
  if (dropping.alive.length !== 1 || dropping.alive[0].x !== dropping.anchor + 2 || dropping.alive[0].y !== top - 6) return 'a dangle 10 px into the playfield: alive ' + JSON.stringify(dropping.alive);
  if (dropping.cleared.length !== 1 || dropping.cleared[0].x !== dropping.anchor || dropping.cleared[0].y !== top || dropping.threads.length) return 'a dangle 10 px into the playfield: cleared ' + JSON.stringify(dropping.cleared) + ', thread ' + JSON.stringify(dropping.threads);
  const entering = join('flit', C.FLIT_FROM_DX, C.GROUND_Y - (top - 8), { phase: 'enter', t: 0.08 }, 0);
  if (entering.alive.length !== 1 || entering.alive[0].y !== top - 8) return 'a flit 8 px into the playfield: alive ' + JSON.stringify(entering.alive);
  if (entering.cleared.length !== 1 || entering.cleared[0].x !== entering.alive[0].x || entering.cleared[0].y !== top) return 'a flit 8 px into the playfield: cleared ' + JSON.stringify(entering.cleared);
  // No other kind is drawn away from its place.
  const sc = creatureScene(TG, 'dangle', 120, C.DANGLE_ELEV, swung);
  for (const kind of ['boulder', 'dawdle', 'hoppet', 'buzzle', 'swoop', 'truffle', 'digby', 'rock', 'crate']) {
    for (const phase of ['approach', 'cross', 'hang']) {
      const e = Object.assign({}, sc.e, { kind: kind, phase: phase, t: 0.35 });
      if (TG.Render.sway(e) !== 0 || TG.Render.flutter(e) !== 0) return kind + ' in ' + phase + ': sway ' + TG.Render.sway(e) + ', flutter ' + TG.Render.flutter(e);
    }
  }
  if (TG.Render.flutter(sc.e) !== 0 || TG.Render.sway(Object.assign({}, sc.e, { kind: 'flit', phase: 'cross', t: 0.35 })) !== 0) return 'a dangle flutters or a flit sways';
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

if (!SIM_PRESENT) {
  skip('in the game, a Pocket Watch holds the dangle and the flit as they are drawn', 'the simulation files are not all present');
  skip('in the game, a dangle and a flit that are typed away are cleared where they were drawn', 'the simulation files are not all present');
} else {
  check('in the game, a Pocket Watch holds the dangle and the flit as they are drawn: through its 179 held steps the sprites, the frames, the sway, the flutter and the thread stay as they were while state.time runs on, and they move again when it ends', function () {
    const env = loadEnv({ sim: true });
    const TG = env.TG;
    const C = TG.C;
    TG.Input.clear();
    TG.Game.init();
    TG.Game.newRun({ difficulty: 'medium', seed: 1, levelId: 1, adaptive: false, assist: 1, tutorial: false });
    const s0 = TG.Game.state;
    const dangle = TG.Entities.spawn(s0, { kind: 'dangle' }), flit = TG.Entities.spawn(s0, { kind: 'flit' });
    if (!dangle || !flit) return 'the spawn failed';
    // Budgets set here, so that both are in view and neither reaches Pip during the check: the flit is a
    // quarter of the way through a crossing of 3.2 world seconds, the dangle hangs 4 world seconds ahead.
    flit.budget = 8;
    flit.age = 8 * (C.FLIT_ENTER_T + (C.FLIT_CROSS_T - C.FLIT_ENTER_T) / 4);
    dangle.budget = 8;
    dangle.anchorX = s0.player.x + dangle.contact + C.RUN_SPEED * 4;
    const step = function () {
      TG.Game.step(C.DT);
      TG.Effects.update(C.DT);
      TG.Hud.update(C.DT, TG.Game.state);
    };
    // What is drawn of the two: their sprites with frame, place and flip, and the 1 px SILVER rects (the
    // thread, and the tails of their plates).
    const picture = function () {
      const f = creatureFrame(TG, TG.Game.state);
      const d = named(f.calls, 'en_dangle'), b = named(f.calls, 'en_flit');
      return d.length === 1 && b.length === 1 ? JSON.stringify([d, b, f.runs]) : null;
    };
    // The same without the places on screen, which change as Pip runs: frame, sway, flutter.
    const pose = function () {
      const st = TG.Game.state;
      const f = creatureFrame(TG, st);
      const d = named(f.calls, 'en_dangle')[0], b = named(f.calls, 'en_flit')[0];
      return [d.frame, d.x - Math.floor(dangle.x - st.camera.x), b.frame, Math.floor(flit.y) - b.y].join(',');
    };
    const moving = {};
    for (let i = 0; i < 40; i++) {
      step();
      if (picture() === null) return 'before the watch, step ' + i + ': the two are not both drawn';
      moving[pose()] = true;
    }
    if (dangle.phase !== 'hang' || flit.phase !== 'cross' || dangle.dead || flit.dead) return 'before the watch: the dangle is in ' + dangle.phase + ', the flit in ' + flit.phase;
    if (Object.keys(moving).length < 8) return 'before the watch the two took ' + Object.keys(moving).length + ' poses in 40 steps: they hardly move, so a freeze would not be seen';
    TG.Game.applyPower('watch', s0.player.x + 60, s0.player.y - 60);
    step();
    const held = picture(), time0 = TG.Game.state.time, animT = [dangle.animT, flit.animT].join(',');
    if (held === null || !(TG.Game.state.power.watchT > 0)) return 'the watch did not start';
    for (let i = 2; i <= 179; i++) {
      step();
      if (!(TG.Game.state.power.watchT > 0)) return 'the watch ended at step ' + i;
      const now = picture();
      if (now !== held) return 'held step ' + i + ': ' + now + ' after ' + held;
    }
    if ([dangle.animT, flit.animT].join(',') !== animT) return 'animT moved under the watch';
    if (Math.abs(TG.Game.state.time - time0 - 178 * C.DT) > 1e-6) return 'state.time ran ' + (TG.Game.state.time - time0).toFixed(3) + ' s in 178 held steps';
    // The watch ends and the world moves: the two go on from where they were held.
    const after = {};
    for (let i = 0; i < 40; i++) {
      step();
      if (picture() === null) return 'after the watch, step ' + i + ': the two are not both drawn';
      after[pose()] = true;
    }
    if (TG.Game.state.power.watchT !== 0) return 'the watch is still running';
    if (Object.keys(after).length < 8) return 'after the watch the two took ' + Object.keys(after).length + ' poses in 40 steps';
    if (env.errors.length) return env.errors[0];
    const other = env.warnings.filter(function (w) { return w.indexOf('"pw_watch"') === -1; });
    if (other.length) return 'console: ' + other[0];
  });

  check('in the game, a dangle and a flit that are typed away are cleared where they were drawn: the entity is dead, and still in state.entities, when word:clear is handled, and the first frame of the clear has its sway, its flutter, its flip and its folded wings; the ink bolt stays on it as Pip runs on', function () {
    // [what, kind, where in its budget of 12 world seconds a flit is put, the moment for the last letter]
    const cases = [
      ['a dangle at the end of its sway', 'dangle', null, function (TG, e) { return e.phase === 'hang' && Math.abs(TG.Render.sway(e)) === 2; }],
      ['a flit at the top or the bottom of its flutter', 'flit', function (C) { return C.FLIT_ENTER_T + 0.02; }, function (TG, e) { return e.phase === 'cross' && Math.abs(TG.Render.flutter(e)) === 4; }],
      ['a flit behind Pip', 'flit', function (C) { return C.FLIT_CROSS_T - 0.02; }, function (TG, e) { return e.phase === 'behind' && e.turned === true; }],
      ['a flit in its dive', 'flit', function (C) { return C.FLIT_BEHIND_T - 0.02; }, function (TG, e) { return e.phase === 'dive'; }]
    ];
    for (const c of cases) {
      const what = c[0], kind = c[1];
      const env = loadEnv({ sim: true });
      const TG = env.TG;
      const C = TG.C;
      TG.Input.clear();
      TG.Game.init();
      TG.Game.newRun({ difficulty: 'medium', seed: 1, levelId: 1, adaptive: false, assist: 1, tutorial: false });
      const e = TG.Entities.spawn(TG.Game.state, { kind: kind });
      if (!e) return what + ': the spawn failed';
      if (kind === 'dangle') {
        e.budget = 8;
        e.anchorX = TG.Game.state.player.x + e.contact + C.RUN_SPEED * 4;
      } else {
        e.budget = 12;
        e.age = 12 * c[2](C);
      }
      let handed = null;
      TG.Events.on('word:clear', function (p) {
        if (p.id === e.id) handed = { dead: e.dead, listed: TG.Game.state.entities.indexOf(e) !== -1 };
      });
      const step = function () {
        TG.Game.step(C.DT);
        TG.Effects.update(C.DT);
        TG.Hud.update(C.DT, TG.Game.state);
      };
      // Every letter but the last as soon as it is in view, and the last at the moment the case names.
      let typed = 0, alive = null;
      for (let i = 0; i < 900 && !e.dead; i++) {
        const drawn = named(creatureFrame(TG, TG.Game.state).calls, 'en_' + kind);
        if (drawn.length === 1) alive = drawn[0];
        if (e.onScreen && typed < e.word.length - 1) TG.Input.typeChar(e.word[typed++]);
        else if (typed === e.word.length - 1 && c[3](TG, e)) TG.Input.typeChar(e.word[typed++]);
        step();
      }
      if (!e.dead || e.reason !== 'cleared' || !alive) return what + ': not typed away (dead ' + e.dead + ', reason ' + e.reason + ', phase ' + e.phase + ')';
      if (!handed || handed.dead !== true || handed.listed !== true) return what + ': when word:clear was handled the entity was ' + JSON.stringify(handed);
      // The first frame of the clear. The entity keeps the place, the clock and the phase it was cleared with.
      const st = TG.Game.state;
      const pic = effectsPicture(TG, env, st);
      const cleared = named(pic.sprites, 'en_' + kind);
      if (cleared.length !== 1) return what + ': the clear draws en_' + kind + ' ' + cleared.length + ' times';
      const k = cleared[0];
      const anchor = Math.floor(e.x - st.camera.x);
      if (kind === 'dangle') {
        const sway = TG.Render.sway(e);
        if (Math.abs(sway) !== 2 || k.x !== Math.floor(e.x + sway - st.camera.x) || k.y !== alive.y) return what + ': cleared at ' + k.x + ',' + k.y + ' with its anchor at ' + anchor + ' and a sway of ' + sway + '; alive at ' + alive.x + ',' + alive.y;
        const last = pic.threads[pic.threads.length - 1];
        if (pic.threads.length !== 3 || pic.threads[0].x !== anchor || last.x !== k.x) return what + ': thread ' + JSON.stringify(pic.threads) + ' from the anchor at ' + anchor + ' to the sprite at ' + k.x;
      } else {
        const up = TG.Render.flutter(e);
        if (k.y !== Math.floor(e.y) - up || k.y !== alive.y || Math.abs(k.x - alive.x) > 2) return what + ': cleared at ' + k.x + ',' + k.y + ' with a flutter of ' + up + ' on y ' + Math.floor(e.y) + '; alive at ' + alive.x + ',' + alive.y;
        if (e.phase === 'cross' && Math.abs(up) !== 4) return what + ': the flutter at the clear is ' + up;
        if (k.flipX !== alive.flipX || k.flipX !== (e.turned === true)) return what + ': alive ' + (alive.flipX ? 'flipped' : 'not flipped') + ', cleared ' + (k.flipX ? 'flipped' : 'not flipped') + ', turned ' + e.turned;
        if ((k.frame === 'dive') !== (e.phase === 'dive') || (alive.frame === 'dive') !== (e.phase === 'dive')) return what + ': alive in frame ' + alive.frame + ', cleared in frame ' + k.frame;
      }
      // The ink bolt flies to the sprite where it is on each step of its flight, while the view moves on.
      let bolts = 0;
      for (let i = 0; i < 6; i++) {
        const now = named(effectsPicture(TG, env, TG.Game.state).sprites, 'en_' + kind)[0];
        const bolt = TG.Effects._list().filter(function (f) { return f.type === 'bolt'; })[0];
        if (bolt && now) {
          bolts++;
          if (Math.abs(bolt.x - now.x) > 1 || Math.abs(bolt.y - (now.y - 8)) > 1) return what + ', ' + i + ' steps on: the ink bolt flies to ' + bolt.x.toFixed(1) + ',' + bolt.y.toFixed(1) + ' and the sprite is at ' + now.x + ',' + now.y;
        }
        step();
      }
      if (bolts < 5) return what + ': the ink bolt was seen on ' + bolts + ' steps';
      if (env.errors.length || env.warnings.length) return what + ': console: ' + env.errors.concat(env.warnings)[0];
    }
  });
}

// ---------------------------------------------------------------------------------------------
// 10. Lady Ratchet as TG.Render draws her (LEVEL2 10.1, 10.3, 10.4, 10.7 and 4.4; milestone M4, the
//     renderer's cases of 13.5)
// ---------------------------------------------------------------------------------------------
//
// The states are built by hand: the arena of handState with level.boss as LEVEL2 10.6 has it and a boss
// of kind 'ratchet'. She stands where the Baron stands: bx 296, by 184.

const RATCHET_BX = 296, RATCHET_BY = 184;
const RATCHET_SPRITES = /^(boss2_|en_baronet$)/;

// A hand-built arena with Lady Ratchet in it, nothing thrown and no word open. `boss` is put over state.boss.
function ratchetState(TG, screen, boss) {
  const s = handState(TG, screen || 'boss');
  s.level.boss = { kind: 'ratchet', label: 'RATCHET', speech: RATCHET_LINE, tips: { shock: 'JUMP THE GEAR', pick: 'DUCK THE PENDULUM' },
    minionSkin: 'en_baronet' };
  s.entities = [];
  Object.assign(s.boss, { kind: 'ratchet', state: 'volley', stateT: 1, phase: 1, pose: 'idle', rise: 0, lampRed: false, flashT: 0, word: null,
    volley: { toLaunch: ['rock', 'rock'], launched: 0, sinceLaunch: 0, hits: 0 } }, boss || {});
  return s;
}

// Her sprites and the Baronet's as TG.Render.draw draws them for the state, in order. A part cut at the
// ground line (TG.Gfx.get and the 9-argument drawImage) is { name, frame, remap, flipX, left, top, rows };
// one drawn whole (TG.Gfx.draw) is { name, frame, remap, flipX, x, y }. A part cut on its sides or at its
// top as well, the Baronet in the hatch, also has cols, the columns drawn, and sx, sy, where in the frame
// they start.
function ratchetDrawn(TG, env, s) {
  const ctx = env.canvas.getContext('2d');
  const out = [], cut = new Map();
  const draw = TG.Gfx.draw, get = TG.Gfx.get, drawImage = ctx.drawImage;
  TG.Gfx.draw = function (c, name, frame, x, y, o) {
    if (RATCHET_SPRITES.test(name)) out.push({ name: name, frame: frame, remap: (o && o.remap) || null, flipX: !!(o && o.flipX), x: x, y: y });
    return draw.apply(TG.Gfx, arguments);
  };
  TG.Gfx.get = function (name, frame, o) {
    const cv = get.apply(TG.Gfx, arguments);
    if (cv && RATCHET_SPRITES.test(name)) cut.set(cv, { name: name, frame: frame, remap: (o && o.remap) || null, flipX: !!(o && o.flipX) });
    return cv;
  };
  ctx.drawImage = function (cv, sx, sy, sw, sh, dx, dy) {
    if (arguments.length === 9 && cut.has(cv)) {
      const part = Object.assign({}, cut.get(cv), { left: dx, top: dy, rows: sh });
      if (sx !== 0 || sy !== 0 || sw !== cv.width) Object.assign(part, { cols: sw, sx: sx, sy: sy });
      out.push(part);
    }
    return drawImage.apply(ctx, arguments);
  };
  try { TG.Render.draw(s); } finally { TG.Gfx.draw = draw; TG.Gfx.get = get; ctx.drawImage = drawImage; }
  return out;
}

// LEVEL2 10.1's table: each part's anchor from bx, by, with the sprite's size and anchor (Appendix C). The
// far arm is flipped; the anchor of a 16 px arm is in its middle either way.
const RATCHET_PARTS = {
  body: { name: 'boss2_body', dx: 0, dy: -8, flipX: false, w: 48, h: 32, ax: 24, ay: 32 },
  far: { name: 'boss2_arm', dx: 20, dy: -26, flipX: true, w: 16, h: 16, ax: 8, ay: 8 },
  key: { name: 'boss2_key', dx: 14, dy: -30, flipX: false, w: 16, h: 16, ax: 8, ay: 8 },
  head: { name: 'boss2_head', dx: -2, dy: -34, flipX: false, w: 32, h: 24, ax: 16, ay: 24 },
  near: { name: 'boss2_arm', dx: -20, dy: -26, flipX: false, w: 16, h: 16, ax: 8, ay: 8 }
};

// What ratchetDrawn is to give for her: body, far arm at rest, key, head and near arm in the order of 10.1,
// each `down` px below its place and cut at the ground line (a part with no row above the line is not
// drawn), then the engine. o: { down, body, key, head, near, engine } with the frames (key null: no key;
// the defaults are b0, k0, normal, rest and shut), remap for the parts and headRemap for the head where it
// differs, flip for a flipped body, shake for the engine's px to the right, gone for no part of her at all.
function ratchetWant(o) {
  const list = [];
  const part = function (p, frame, remap, flipX) {
    const top = RATCHET_BY + p.dy + (o.down || 0) - p.ay;
    const rows = Math.min(p.h, RATCHET_BY - top);
    if (rows > 0) list.push({ name: p.name, frame: frame, remap: remap || null, flipX: flipX, left: RATCHET_BX + p.dx - p.ax, top: top, rows: rows });
  };
  if (!o.gone) {
    part(RATCHET_PARTS.body, o.body || 0, o.remap, !!o.flip);
    part(RATCHET_PARTS.far, 'rest', o.remap, true);
    if (o.key !== null) part(RATCHET_PARTS.key, o.key || 0, o.remap, false);
    part(RATCHET_PARTS.head, o.head || 'normal', o.headRemap !== undefined ? o.headRemap : o.remap, false);
    part(RATCHET_PARTS.near, o.near || 'rest', o.remap, false);
  }
  list.push({ name: 'boss2_engine', frame: o.engine || 'shut', remap: null, flipX: false, x: RATCHET_BX + (o.shake || 0), y: RATCHET_BY });
  return list;
}

// null when the two lists are the same, else both as text.
function ratchetDiffers(got, want) {
  return JSON.stringify(got) === JSON.stringify(want) ? null : JSON.stringify(got) + ', want ' + JSON.stringify(want);
}

check('Lady Ratchet is put together as LEVEL2 10.1 has it: body, far arm at rest, key, head, near arm and engine, in every pose, with rise 0, 13 and 40; at rise 40 nothing of her shows', function () {
  const env = loadEnv();
  const TG = env.TG;
  if (Math.floor(ratchetState(TG).boss.x - ratchetState(TG).camera.x) !== RATCHET_BX || TG.C.GROUND_Y !== RATCHET_BY) return 'the hand-built boss is not at 296, 184';
  // [boss.pose, boss.state, the near arm, the head]. The near arm holds her watch up through a taunt.
  const POSES = [['idle', 'volley', 'rest', 'normal'], ['raise', 'telegraph', 'raise', 'normal'], ['stomp', 'attack', 'raise', 'normal'],
    ['stomp', 'transition', 'raise', 'normal'], ['throw', 'volley', 'throw', 'normal'], ['throw', 'attack', 'throw', 'normal'],
    ['laugh', 'taunt', 'watch', 'laugh'], ['laugh', 'laugh', 'rest', 'laugh'], ['hurt', 'recoil', 'rest', 'hurt'], ['dizzy', 'finisher', 'rest', 'dizzy']];
  for (const rise of [0, 13, 40]) {
    for (const p of POSES) {
      // boss.rise is floored. At 13.6 s the body is b1 at its 1 frame a second, b0 at the 4 a second of a
      // taunt and b1 in the finisher; the key is on step 27 of 2 a second (k3), on step 217 of 16 a second
      // with her arm up (k1), and still at k0 in a recoil, a laugh and the finisher with no letter typed.
      const s = ratchetState(TG, 'boss', { pose: p[0], state: p[1], rise: rise + 0.6 });
      s.time = 13.6;
      const want = ratchetWant({ down: rise + (p[0] === 'stomp' ? 2 : 0), body: p[1] === 'taunt' ? 0 : 1,
        key: p[0] === 'raise' ? 1 : (p[1] === 'recoil' || p[1] === 'laugh' || p[1] === 'finisher' ? 0 : 3), head: p[3], near: p[2] });
      const differs = ratchetDiffers(ratchetDrawn(TG, env, s), want);
      if (differs) return p[0] + ' in ' + p[1] + ', rise ' + rise + ': ' + differs;
    }
  }
  // On the canvas. At rise 40 only the top 18 rows of her head are above the ground line, and the engine
  // covers them: the picture is the one at rise 60, where no part has a row left. At rise 0 she is there.
  const picture = function (rise) {
    TG.Render.draw(ratchetState(TG, 'boss', { rise: rise }));
    return env.canvas.toRGBA();
  };
  const hidden = picture(60), at40 = picture(40), up = picture(0);
  const TEAL = paletteSet(TG)[10];
  let differ = 0, teal = 0;
  for (let i = 0; i < hidden.length; i++) if (hidden[i] !== at40[i]) differ++;
  for (let y = 126; y < 168; y++) for (let x = 272; x < 320; x++) if (pixel(up, 384, x, y) === TEAL && pixel(hidden, 384, x, y) !== TEAL) teal++;
  if (differ !== 0) return 'at rise 40 the picture differs from the one with her out of sight';
  if (teal < 100) return 'at rise 0 her waistcoat has ' + teal + ' TEAL pixels above the engine';
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

check('her body taps its foot at 4 frames a second through a taunt and stands at 1 a second otherwise, and holds b1 once she is wound down; her head takes lampred alone, flashes its lenses as a taunt begins, and all of her but the engine is WHITE in a hit\'s flash', function () {
  const env = loadEnv();
  const TG = env.TG;
  const drawn = function (boss, time, screen) {
    const s = ratchetState(TG, screen || 'boss', boss);
    s.time = time;
    return ratchetDrawn(TG, env, s);
  };
  const body = function (boss, time, screen) { return named(drawn(boss, time, screen), 'boss2_body')[0].frame; };
  // [state, pose, time, frame]
  const BODY = [['volley', 'idle', 20.3, 0], ['volley', 'idle', 21.3, 1], ['telegraph', 'raise', 21.9, 1], ['recoil', 'hurt', 22.1, 0],
    ['taunt', 'laugh', 20.1, 0], ['taunt', 'laugh', 20.3, 1], ['taunt', 'laugh', 20.6, 0], ['taunt', 'laugh', 20.8, 1],
    ['finisher', 'dizzy', 20.3, 1], ['finisher', 'dizzy', 21.6, 1]];
  for (const c of BODY) {
    const got = body({ state: c[0], pose: c[1] }, c[2]);
    if (got !== c[3]) return 'the body in ' + c[0] + ' at ' + c[2] + ' s is frame ' + got + ', want ' + c[3];
  }
  if (body({ state: 'defeated', pose: 'dizzy' }, 20.3, 'levelComplete') !== 1) return 'the body of the defeat is not b1';
  // The head's remap; the other parts have none.
  let differs = ratchetDiffers(drawn({ lampRed: true, phase: 2 }, 20.1), ratchetWant({ key: 0, headRemap: 'lampred' }));
  if (differs) return 'lampRed: ' + differs;
  // The first 0.6 s of a taunt: on the even fifteenths of a second the lenses have the other colour.
  const FLASH = [[false, 0.3, 2.0, 'lampred'], [false, 0.3, 2.07, null], [true, 0.3, 2.0, null], [true, 0.3, 2.07, 'lampred'],
    [false, 0.7, 2.0, null], [true, 0.7, 2.0, 'lampred']];
  for (const c of FLASH) {
    const head = named(drawn({ state: 'taunt', pose: 'laugh', lampRed: c[0], stateT: c[1] }, c[2]), 'boss2_head')[0];
    if (head.remap !== c[3] || head.frame !== 'laugh') return 'a taunt ' + c[1] + ' s old at ' + c[2] + ' s, lampRed ' + c[0] + ': the head is ' + JSON.stringify(head);
  }
  differs = ratchetDiffers(drawn({ flashT: 0.1, lampRed: true }, 20.1), ratchetWant({ key: 0, remap: 'white' }));
  if (differs) return 'the flash of a hit: ' + differs;
  // On the canvas the lenses are the only RED of her: none without lampRed, some with it, all in the head's box.
  const reds = function (lampRed) {
    TG.Render.draw(ratchetState(TG, 'boss', { lampRed: lampRed }));
    const rgba = env.canvas.toRGBA(), RED = paletteSet(TG)[25];
    let inHead = 0, elsewhere = 0;
    for (let y = 110; y < 184; y++) {
      for (let x = 260; x < 332; x++) {
        if (pixel(rgba, 384, x, y) !== RED) continue;
        if (x >= 278 && x < 310 && y >= 126 && y < 150) inHead++; else elsewhere++;
      }
    }
    return [inHead, elsewhere];
  };
  const plain = reds(false), red = reds(true);
  if (plain[0] !== 0 || plain[1] !== 0) return 'RED on her without lampRed: ' + plain.join(' and ');
  if (red[0] < 8 || red[1] !== 0) return 'with lampRed: ' + red[0] + ' RED pixels in the head\'s box and ' + red[1] + ' elsewhere';
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

check('her key is drawn after the far arm and before the head at bx + 14, by - 30 + rise, cut at the ground line; it steps forward 2, 4 and 8 times a second by phase and 16 while her arm is up, is still in a recoil and a laugh, and goes one step back for each letter of the finisher (LEVEL2 10.3, 10.7)', function () {
  const env = loadEnv();
  const TG = env.TG;
  const key = function (boss, time) {
    const s = ratchetState(TG, 'boss', boss);
    s.time = time;
    const k = named(ratchetDrawn(TG, env, s), 'boss2_key');
    return k.length === 1 ? k[0] : null;
  };
  // Sixteenths and sixty-fourths of a second from 20 s, so that every product is exact.
  for (const phase of [1, 2, 3]) {
    const rate = [2, 4, 8][phase - 1];
    const seen = {};
    for (let i = 0; i < 32; i++) {
      const time = 20 + i / 16;
      const k = key({ phase: phase }, time);
      if (!k || k.frame !== Math.floor(time * rate) % 4) return 'phase ' + phase + ' at ' + time + ' s: ' + JSON.stringify(k) + ', want frame ' + Math.floor(time * rate) % 4;
      seen[k.frame] = true;
    }
    if (Object.keys(seen).length !== 4) return 'phase ' + phase + ': 2 s show the frames ' + Object.keys(seen).join(' ');
    for (const state of ['telegraph', 'attack']) {
      for (let i = 0; i < 16; i++) {
        const time = 20 + i / 64;
        const k = key({ phase: phase, state: state, pose: 'raise' }, time);
        if (!k || k.frame !== Math.floor(time * 16) % 4) return 'her arm up in ' + state + ', phase ' + phase + ', at ' + time + ' s: ' + JSON.stringify(k);
      }
    }
  }
  // One step is the next frame: k0, k1, k2, k3 and k0 again, never backwards.
  const run = [0, 1, 2, 3, 4].map(function (i) { return key({ phase: 1 }, 20 + i / 2).frame; });
  if (run.join('') !== '01230') return 'five steps of phase 1: ' + run.join(' ');
  for (const c of [['recoil', 'hurt'], ['laugh', 'laugh']]) {
    for (const time of [20, 20.3, 20.55, 21.9]) {
      const k = key({ state: c[0], pose: c[1], phase: 3 }, time);
      if (!k || k.frame !== 0) return 'in ' + c[0] + ' at ' + time + ' s the key is ' + JSON.stringify(k);
    }
  }
  // The finisher: no step of its own, whatever the clock; one frame back for each letter typed.
  const cranked = [];
  for (let typed = 0; typed <= 9; typed++) {
    const word = { id: 4242, kind: 'finisher', word: 'clockwork', typable: true, priority: 0, eta: Infinity, x: 0, y: 0, shownAt: 0, lost: false,
      typed: typed, errors: 0, firstKeyAt: null, lastKeyAt: null };
    cranked.push(key({ state: 'finisher', pose: 'dizzy', phase: 3, word: word }, 20 + typed * 0.37).frame);
  }
  if (cranked.join('') !== '0321032103') return 'the finisher, letter by letter: ' + cranked.join(' ');
  if (key({ state: 'finisher', pose: 'dizzy', phase: 3 }, 20.3).frame !== 0) return 'the finisher before its word is not at k0';
  // Its place, between the far arm and the head, and its cut at the ground line.
  const s = ratchetState(TG, 'boss', { rise: 30 });
  s.time = 20;
  const list = ratchetDrawn(TG, env, s);
  const order = list.map(function (c) { return c.name + (c.flipX ? ' flipped' : ''); }).join(', ');
  if (order !== 'boss2_body, boss2_arm flipped, boss2_key, boss2_head, boss2_arm, boss2_engine') return 'at rise 30: ' + order;
  const k = named(list, 'boss2_key')[0];
  if (k.left !== RATCHET_BX + 14 - 8 || k.top !== RATCHET_BY - 30 + 30 - 8 || k.rows !== 8) return 'the key at rise 30: ' + JSON.stringify(k);
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

check('the needle of the boiler gauge (LEVEL2 10.4): 4 px from the dial\'s centre at bx - 18, by - 10, from the left over the top to the right by the part of the volley that was cleared; RED while a weak-point word is open; at empty with no volley and once she is wound down; it moves with the engine when the engine shakes', function () {
  const env = loadEnv();
  const TG = env.TG;
  const pal = paletteSet(TG);
  const CX = RATCHET_BX - 18, CY = RATCHET_BY - 10;
  // The needle's pixels as [dx, dy up] from the centre. A third is the mirror of two thirds.
  const LEFT = [[0, 0], [-1, 0], [-2, 0], [-3, 0]], UP = [[0, 0], [0, 1], [0, 2], [0, 3]], RIGHT = [[0, 0], [1, 0], [2, 0], [3, 0]];
  const THIRD = [[0, 0], [0, 1], [-1, 2], [-1, 3]], TWO_THIRDS = [[0, 0], [0, 1], [1, 2], [1, 3]];
  const QUARTER = [[0, 0], [-1, 1], [-2, 2]], THREE_QUARTERS = [[0, 0], [1, 1], [2, 2]];
  const word = { id: 4243, kind: 'core', word: 'ratchet', typable: true, priority: 0, eta: 3, x: 0, y: 0, shownAt: 0, lost: false, typed: 0, errors: 0,
    firstKeyAt: null, lastKeyAt: null };
  const volley = function (n, hits) { return { toLaunch: new Array(n).fill('rock'), launched: n, sinceLaunch: 0, hits: hits }; };
  // The dial's 7 x 6 px with the needle on them. A RED needle is read whole, the engine having no RED of
  // its own; an INK one is read at its own places and by the WHITE it leaves.
  // shake: px the engine is drawn to the right, and the dial with it.
  const needle = function (boss, color, want, shake) {
    TG.Render.draw(ratchetState(TG, 'boss', boss));
    const rgba = env.canvas.toRGBA();
    const cx = CX + (shake || 0);
    for (const p of want) if (pixel(rgba, 384, cx + p[0], CY - p[1]) !== pal[color]) return 'no colour ' + color + ' at ' + p.join(',') + ' from the centre';
    let red = 0, white = 0;
    for (let dy = -2; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const c = pixel(rgba, 384, cx + dx, CY - dy);
        if (c === pal[25]) red++;
        if (c === pal[4]) white++;
      }
    }
    if (red !== (color === 25 ? want.length : 0)) return red + ' RED pixels on the dial';
    // The dial has 34 WHITE pixels, and every pixel of the needle lies on one of them.
    if (white !== 34 - want.length) return white + ' WHITE pixels left on the dial, want ' + (34 - want.length);
    return null;
  };
  const CASES = [[2, 0, LEFT], [2, 1, UP], [2, 2, RIGHT], [3, 0, LEFT], [3, 1, THIRD], [3, 2, TWO_THIRDS], [3, 3, RIGHT], [4, 1, QUARTER],
    [4, 2, UP], [4, 3, THREE_QUARTERS], [5, 0, LEFT], [5, 5, RIGHT], [3, 7, RIGHT]];
  for (const c of CASES) {
    let bad = needle({ volley: volley(c[0], c[1]) }, 0, c[2]);
    if (bad) return c[1] + ' of ' + c[0] + ' cleared: ' + bad;
    // The same place in RED while the window of a taunt is open, and INK again in the taunt before its word.
    bad = needle({ state: 'taunt', pose: 'laugh', word: word, windowWs: 5, volley: volley(c[0], c[1]) }, 25, c[2]);
    if (bad) return c[1] + ' of ' + c[0] + ' cleared, in a taunt: ' + bad;
  }
  let bad = needle({ state: 'taunt', pose: 'laugh', word: null, volley: volley(2, 1) }, 0, UP);
  if (bad) return 'a taunt with no word yet: ' + bad;
  // Empty: before the first volley, and in the finisher and the defeat whatever the last volley was.
  bad = needle({ state: 'intro', introTime: 4, stateT: 3.9, pose: 'laugh', volley: { toLaunch: [], launched: 0, sinceLaunch: 0, hits: 0 } }, 0, LEFT) ||
    needle({ state: 'finisher', pose: 'dizzy', volley: volley(2, 2) }, 0, LEFT);
  if (bad) return 'with no volley, and in the finisher: ' + bad;
  // While she rises the engine shakes 1 px to the right on the odd twentieths of a second (10.1), and the
  // needle stays on its dial: 1.25 s into the long intro is the 25th twentieth, 1.5 s the 30th.
  const rising = function (t) {
    return { state: 'intro', introTime: 4, stateT: t, rise: 40 * (1 - t / 2), pose: 'idle', volley: { toLaunch: [], launched: 0, sinceLaunch: 0, hits: 0 } };
  };
  bad = needle(rising(1.25), 0, LEFT, 1) || needle(rising(1.5), 0, LEFT, 0);
  if (bad) return 'while the engine shakes: ' + bad;
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

// The state of her intro `t` s in, as js/boss.js gives it: rise from 40 to 0 over the first half, the laugh
// pose from the half.
function ratchetIntro(TG, introTime, t) {
  const s = ratchetState(TG, 'bossIntro', { state: 'intro', introTime: introTime, stateT: t, rise: 40 * Math.max(0, 1 - t / (introTime / 2)),
    pose: t >= introTime / 2 ? 'laugh' : 'idle', volley: { toLaunch: [], launched: 0, sinceLaunch: 0, hits: 0 } });
  s.screenT = t;
  return s;
}

check('her long intro is the one timeline of LEVEL2 10.1: the Baronet hops in from the left edge to the open hatch in six hops and drops in, with her out of sight; the hatch shuts, the engine shakes and she rises from the quarter to the half; she holds her watch up and her key steps three times; she laughs from 0.7', function () {
  const env = loadEnv();
  const TG = env.TG;
  const at = function (u, edit) {
    const s = ratchetIntro(TG, 4, 4 * u);
    if (edit) edit(s);
    return ratchetDrawn(TG, env, s);
  };
  // The cameo. He is at the hatch after nine tenths of it. A twelfth of that run at a time: on the ground at
  // the start of each hop, 6 px up in its middle, 304 px from the hatch at first. She is 40 px down whatever
  // boss.rise says (it is 40 to 20 here).
  for (let k = 0; k <= 11; k++) {
    const sx = RATCHET_BX - Math.round(304 * (1 - k / 12));
    const want = ratchetWant({ down: 40, engine: 'open' }).concat([{ name: 'en_baronet', frame: 'up', remap: null, flipX: true, x: sx, y: RATCHET_BY - (k % 2 === 1 ? 6 : 0) }]);
    const differs = ratchetDiffers(at(0.25 * 0.9 * k / 12), want);
    if (differs) return 'the cameo, ' + k + ' twelfths of his run in: ' + differs;
  }
  if (RATCHET_BX - Math.round(304 * 1) !== -8) return 'the Baronet does not start at screen x -8';
  // Over the last tenth he goes down in the hatch, at the hatch's x: still the up frame, so that he keeps
  // his helmet (the spin frame is his bare head), turned over on the odd twentieths of a second, and drawn
  // only in the opening, the 10 px between the jambs from 12 px above the ground line down to it. So the
  // gauge and the jambs are never behind him. [the part of the cameo, px he has fallen, turned over]
  const HATCH = { left: RATCHET_BX - 5, cols: 10, top: RATCHET_BY - 12 };
  for (const c of [[0.925, 1, false], [0.95, 4, true], [0.975, 9, true], [0.98, 10, true]]) {
    const top = Math.max(HATCH.top, RATCHET_BY + c[1] - 16);
    const want = ratchetWant({ down: 40, engine: 'open' }).concat([{ name: 'en_baronet', frame: 'up', remap: null, flipX: c[2], left: HATCH.left, top: top,
      rows: RATCHET_BY - top, cols: HATCH.cols, sx: 3, sy: top - (RATCHET_BY + c[1] - 16) }]);
    const differs = ratchetDiffers(at(0.25 * c[0]), want);
    if (differs) return 'his drop, ' + c[0] + ' of the cameo: ' + differs;
  }
  // On the canvas, through the drop: the engine's 48 x 16 px outside the opening are as they are with nobody
  // there, the dial of the gauge among them, and something of him shows in the opening.
  const engineBox = function (u) {
    TG.Render.draw(ratchetIntro(TG, 4, 4 * u));
    const rgba = env.canvas.toRGBA();
    const out = { round: [], opening: [] };
    for (let y = RATCHET_BY - 16; y < RATCHET_BY; y++) {
      for (let x = RATCHET_BX - 24; x < RATCHET_BX + 24; x++) {
        const inside = x >= HATCH.left && x < HATCH.left + HATCH.cols && y >= HATCH.top;
        (inside ? out.opening : out.round).push(pixel(rgba, 384, x, y));
      }
    }
    return out;
  };
  // Nobody there: at the very end of the cameo he is under the ground line.
  const empty = engineBox(0.25 * 0.9999);
  if (named(at(0.25 * 0.9999), 'en_baronet').length !== 0) return 'the Baronet is still drawn at the very end of the cameo';
  for (const q of [0.91, 0.93, 0.95, 0.97]) {
    const got = engineBox(0.25 * q);
    if (JSON.stringify(got.round) !== JSON.stringify(empty.round)) return 'the Baronet is over the engine outside the opening, ' + q + ' of the way through the cameo';
    if (JSON.stringify(got.opening) === JSON.stringify(empty.opening)) return 'nothing of the Baronet in the opening, ' + q + ' of the way through the cameo';
  }
  // A pause holds the picture: the boss's state says where the intro is, not the screen.
  let differs = ratchetDiffers(at(0.125, function (s) { s.screen = 'paused'; s.screenT = 0; }), at(0.125));
  if (differs) return 'paused in the cameo: ' + differs;
  // From the quarter she rises, 40 px over the second quarter, and the engine is shut and shakes 1 px to
  // the right on the odd twentieths of a second. At the quarter itself she has not moved.
  differs = ratchetDiffers(at(0.25), ratchetWant({ down: 40 }));
  if (differs) return 'at the quarter: ' + differs;
  for (const c of [[0.3125, 30, 1], [0.375, 20, 0], [0.4375, 10, 1]]) {
    differs = ratchetDiffers(at(c[0]), ratchetWant({ down: c[1], shake: c[2] }));
    if (differs) return 'her rise at ' + c[0] + ': ' + differs;
  }
  // The gesture, from the half to 0.7: the watch held up and the head not yet laughing, though the pose
  // is; the key one frame on at 0.55, 0.6 and 0.65, each step looked at just before and just after its
  // moment. Then the laugh, the arm down and the key where it stopped.
  for (const c of [[0.5, 0], [0.5469, 0], [0.5499, 0], [0.5501, 1], [0.5625, 1], [0.5938, 1], [0.5999, 1], [0.6001, 2], [0.625, 2], [0.6406, 2],
    [0.6499, 2], [0.6501, 3], [0.6563, 3], [0.6875, 3]]) {
    differs = ratchetDiffers(at(c[0]), ratchetWant({ key: c[1], near: 'watch', head: 'normal' }));
    if (differs) return 'the gesture at ' + c[0] + ': ' + differs;
  }
  for (const u of [0.7031, 0.75, 0.9375]) {
    differs = ratchetDiffers(at(u), ratchetWant({ key: 3, head: 'laugh' }));
    if (differs) return 'the laugh at ' + u + ': ' + differs;
  }
  // TG.Effects' part of the intro falls inside the renderer's: its puff of dust at the hatch starts while
  // the Baronet is in his drop, the hatch still open, and each of its three puffs of steam while she is on
  // her way up through the engine.
  const first = ratchetIntro(TG, 4, 0);
  withGame(TG, first);
  TG.Effects.reset();
  TG.Events.emit('boss:enter', {});
  const puffs = TG.Effects._list().filter(function (f) { return f.kind === 'fx_poof'; }).map(function (f) { return f.delay; }).sort(function (a, b) { return a - b; });
  TG.Effects.reset();
  if (puffs.length !== 4) return 'TG.Effects makes ' + puffs.length + ' puffs on boss:enter';
  const dust = at(puffs[0] / 4);
  const dropping = named(dust, 'en_baronet');
  if (named(dust, 'boss2_engine')[0].frame !== 'open' || dropping.length !== 1 || dropping[0].cols !== HATCH.cols) return 'the puff of dust at ' + puffs[0] + ' s is not in his drop';
  for (const t of puffs.slice(1)) {
    const up = at(t / 4);
    const down = named(up, 'boss2_head')[0].top - (RATCHET_BY - 58);
    if (named(up, 'boss2_engine')[0].frame !== 'shut' || !(down > 0 && down < 40)) return 'the steam at ' + t + ' s: she is ' + down + ' px down';
  }
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

check('her short intro after a continue has no cameo and no gesture: she rises as boss.rise says, with the engine shut and shaking, and laughs from the half, her key still', function () {
  const env = loadEnv();
  const TG = env.TG;
  const SHORT = TG.C.BOSS_INTRO_SHORT;
  if (SHORT !== 1.5) return 'BOSS_INTRO_SHORT is ' + SHORT;
  // [s into the intro, px she is down (boss.rise, floored), the engine's shake]
  for (const c of [[0, 40, 0], [0.1875, 30, 1], [0.375, 20, 1], [0.5625, 10, 1]]) {
    const differs = ratchetDiffers(ratchetDrawn(TG, env, ratchetIntro(TG, SHORT, c[0])), ratchetWant({ down: c[1], shake: c[2] }));
    if (differs) return c[0] + ' s in: ' + differs;
  }
  for (const t of [0.75, 0.9, 1.2, 1.45]) {
    const differs = ratchetDiffers(ratchetDrawn(TG, env, ratchetIntro(TG, SHORT, t)), ratchetWant({ head: 'laugh' }));
    if (differs) return t + ' s in: ' + differs;
  }
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

check('the hatch is open while she sends the minion out, and shut for a cog: the throw pose of a volley whose last launch was the minion', function () {
  const env = loadEnv();
  const TG = env.TG;
  const hatch = function (boss) { return named(ratchetDrawn(TG, env, ratchetState(TG, 'boss', boss)), 'boss2_engine')[0].frame; };
  const volley = function (launched) { return { toLaunch: ['rock', 'rockhigh', 'minion'], launched: launched, sinceLaunch: 0, hits: 0 }; };
  const cases = [[{ state: 'volley', pose: 'throw', volley: volley(3) }, 'open'], [{ state: 'volley', pose: 'throw', volley: volley(2) }, 'shut'],
    [{ state: 'volley', pose: 'throw', volley: volley(1) }, 'shut'], [{ state: 'volley', pose: 'idle', volley: volley(3) }, 'shut'],
    [{ state: 'volley', pose: 'idle', volley: volley(0) }, 'shut'], [{ state: 'attack', pose: 'throw', volley: volley(3) }, 'shut']];
  for (const c of cases) {
    if (hatch(c[0]) !== c[1]) return JSON.stringify(c[0]) + ': the hatch is ' + hatch(c[0]) + ', want ' + c[1];
  }
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

check('her defeat (LEVEL2 10.7): the picture of the finisher until 0.55 s; then her key is gone and her head is the one without goggles; from 1.2 s the hatch is open and she goes straight up at 480 px a second, her body flipped on the odd twentieths of a second, until she is off the screen; boss.rise does not bring her back; TG.Effects throws her key and her goggles at the same 0.55 s and starts the letter fountain at the same 1.2 s', function () {
  const env = loadEnv();
  const TG = env.TG;
  const at = function (t, rise) {
    const s = ratchetState(TG, 'levelComplete', { state: 'defeated', pose: 'dizzy', rise: rise || 0 });
    s.screenT = t;
    return ratchetDrawn(TG, env, s);
  };
  // [screenT, what is wanted]. 1.251 s and 1.501 s are 24 and 144 px up, in the 25th and the 30th twentieth.
  const CASES = [[0.02, { body: 1, key: 0, head: 'dizzy' }], [0.54, { body: 1, key: 0, head: 'dizzy' }], [0.55, { body: 1, key: null, head: 'hurt' }],
    [1.19, { body: 1, key: null, head: 'hurt' }], [1.2, { body: 1, key: null, head: 'hurt', engine: 'open' }],
    [1.251, { body: 1, key: null, head: 'hurt', engine: 'open', down: -24, flip: true }],
    [1.501, { body: 1, key: null, head: 'hurt', engine: 'open', down: -144, flip: false }],
    [1.59, { gone: true, engine: 'open' }], [2.5, { gone: true, engine: 'open' }]];
  for (const c of CASES) {
    const differs = ratchetDiffers(at(c[0]), ratchetWant(c[1]));
    if (differs) return c[0] + ' s: ' + differs;
  }
  // The last second, in which js/boss.js sinks a defeated boss into its base.
  for (const c of [[3.2, 8], [3.6, 24], [3.98, 39.2]]) {
    const differs = ratchetDiffers(at(c[0], c[1]), ratchetWant({ gone: true, engine: 'open' }));
    if (differs) return c[0] + ' s with boss.rise ' + c[1] + ': ' + differs;
  }
  // What she loses is TG.Effects' from the moment the renderer stops drawing it: her key and her goggles
  // leave her at 0.55 s. The fountain that launches her is TG.Effects' too: its first letter leaves the
  // hatch when the renderer opens it.
  const s = ratchetState(TG, 'levelComplete', { state: 'defeated', pose: 'dizzy' });
  withGame(TG, s);
  TG.Effects.reset();
  TG.Events.emit('boss:defeat', { x: s.boss.x, y: s.boss.y });
  const letters = TG.Effects._list().filter(function (f) { return f.type === 'letter'; }).map(function (f) { return f.delay; });
  const thrown = TG.Effects._list().filter(function (f) { return f.kind === 'boss2_key' || f.kind === 'boss2_goggles'; }).map(function (f) { return f.kind + ' at ' + f.delay; }).sort();
  TG.Effects.reset();
  if (JSON.stringify(thrown) !== JSON.stringify(['boss2_goggles at 0.55', 'boss2_key at 0.55'])) return 'TG.Effects throws ' + JSON.stringify(thrown);
  if (letters.length === 0 || Math.abs(Math.min.apply(null, letters) - 1.2) > 1e-9) return 'the first letter of the fountain leaves at ' + (letters.length ? Math.min.apply(null, letters) : 'no time');
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

check('stars circle her head while she is wound down (LEVEL2 10.7): three fx_star round bx - 2, by - 60 in the finisher and through her defeat until she is launched, moving down with her; none in any other pose, none while she is 30 px or more down, none once she has left the engine', function () {
  const env = loadEnv();
  const TG = env.TG;
  const stars = function (screen, boss, screenT) {
    const s = ratchetState(TG, screen, boss);
    if (screenT !== undefined) s.screenT = screenT;
    return named(drawCalls(TG, function () { TG.Render.draw(s); }), 'fx_star');
  };
  // Three, on a ring 16 px to either side of `cx` and 4 px above and below `cy`.
  const ring = function (list, cy) {
    return list.length === 3 && list.every(function (c) { return Math.abs(c.x - (RATCHET_BX - 2)) <= 16 && Math.abs(c.y - cy) <= 4; });
  };
  const finisher = function (rise) { return stars('boss', { state: 'finisher', pose: 'dizzy', phase: 3, lampRed: true, rise: rise }); };
  if (!ring(finisher(0), RATCHET_BY - 60)) return 'the finisher: ' + JSON.stringify(finisher(0));
  if (!ring(finisher(12.4), RATCHET_BY - 48)) return 'the finisher with her 12 px down: ' + JSON.stringify(finisher(12.4));
  if (finisher(30).length !== 0 || finisher(40).length !== 0) return 'stars with her 30 px or more down';
  for (const p of [['idle', 'volley'], ['raise', 'telegraph'], ['stomp', 'attack'], ['throw', 'volley'], ['laugh', 'taunt'], ['laugh', 'laugh'], ['hurt', 'recoil']]) {
    if (stars('boss', { state: p[1], pose: p[0] }).length !== 0) return 'stars in the pose ' + p[0];
  }
  // Her defeat: through the freeze, the flash and the loss of her key, to the launch at 1.2 s.
  const defeat = function (t) { return stars('levelComplete', { state: 'defeated', pose: 'dizzy' }, t); };
  for (const t of [0.02, 0.3, 0.8, 1.19]) if (!ring(defeat(t), RATCHET_BY - 60)) return 'her defeat at ' + t + ' s: ' + JSON.stringify(defeat(t));
  for (const t of [1.25, 1.5, 2.5, 3.9]) if (defeat(t).length !== 0) return 'stars at ' + t + ' s of her defeat, after the launch';
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

check('the Baronet comes up in front of his mound (LEVEL2 4.4): the mound first, then en_baronet cut at the ground line, the peek frame until 12 of his 16 rows are out and the up frame from there, whatever t is; under the ground he is his mound alone', function () {
  const env = loadEnv();
  const TG = env.TG;
  const C = TG.C;
  const G = C.GROUND_Y;
  const ctx = env.canvas.getContext('2d');
  const drawn = function (elev, t, phase) {
    const s = handState(TG, 'playing');
    const mole = s.entities.filter(function (e) { return e.kind === 'digby'; })[0];
    Object.assign(mole, { skin: 'en_baronet', phase: phase || 'up', elev: elev, y: G - elev, t: t, harmful: true, onScreen: true });
    const sources = { peek: TG.Gfx.get('en_baronet', 'peek', { flipX: false, remap: null }), up: TG.Gfx.get('en_baronet', 'up', { flipX: false, remap: null }) };
    const parts = [];
    const drawImage = ctx.drawImage;
    ctx.drawImage = function (cv) {
      for (const frame of ['peek', 'up']) if (cv === sources[frame]) parts.push([frame].concat(Array.prototype.slice.call(arguments, 1)));
      return drawImage.apply(ctx, arguments);
    };
    let calls;
    try { calls = drawCalls(TG, function () { TG.Render.draw(s); }); } finally { ctx.drawImage = drawImage; }
    const order = calls.map(function (c) { return c.name; });
    return { parts: JSON.stringify(parts), x: Math.floor(mole.x - s.camera.x), mound: JSON.stringify(named(calls, 'en_mound').map(function (c) { return [c.frame, c.x, c.y, c.remap]; })),
      moundFirst: order.indexOf('en_mound') !== -1 && order.indexOf('en_mound') < order.indexOf('en_baronet'), digby: order.indexOf('en_digby') !== -1,
      baronet: order.indexOf('en_baronet') !== -1 };
  };
  const pop = C.DIGBY_POP_T;
  // [elev, t, frame, rows drawn]. The Digby's rule, the peek frame for 0.05 of t after the pop, is not his.
  const cases = [[-15, pop + 0.01, 'peek', 1], [-12, pop + 0.04, 'peek', 4], [-5, pop + 0.1, 'peek', 11], [-4.5, pop + 0.1, 'up', 12], [-4, pop + 0.01, 'up', 12],
    [-1, pop + 0.14, 'up', 15], [0, pop + 0.15, 'up', 16]];
  for (const c of cases) {
    const d = drawn(c[0], c[1]);
    const want = JSON.stringify([[c[2], 0, 0, 16, c[3], d.x - 8, Math.floor(G - c[0]) - 16, 16, c[3]]]);
    if (d.parts !== want) return 'elev ' + c[0] + ', t ' + c[1].toFixed(2) + ': ' + d.parts + ', want ' + want;
    if (d.mound !== JSON.stringify([[0, d.x, G, null]])) return 'elev ' + c[0] + ': the mound ' + d.mound;
    if (!d.moundFirst) return 'elev ' + c[0] + ': the mound is not drawn before the Baronet';
    if (d.digby) return 'elev ' + c[0] + ': en_digby is drawn for an entity with a skin';
  }
  const under = drawn(-16, 0.5, 'mound');
  if (under.baronet || under.digby || JSON.parse(under.mound).length !== 1) return 'under the ground: ' + JSON.stringify(under);
  if (env.warnings.length || env.errors.length) return 'console: ' + env.warnings.concat(env.errors)[0];
});

// Her states of a fight from first to last, for the checks that draw them all.
function ratchetStates(TG) {
  const word = function (kind, typed) {
    return { id: nextId++, kind: kind, word: 'clockwork', typable: true, priority: 0, eta: 3, x: 0, y: 0, shownAt: 0, lost: false, typed: typed, errors: 0,
      firstKeyAt: 1, lastKeyAt: 2 };
  };
  const defeat = function (t) {
    const s = ratchetState(TG, 'levelComplete', { state: 'defeated', pose: 'dizzy' });
    s.screenT = t;
    return s;
  };
  return [ratchetIntro(TG, 4, 0.5), ratchetIntro(TG, 4, 0.97), ratchetIntro(TG, 4, 1.4), ratchetIntro(TG, 4, 2.3), ratchetIntro(TG, 4, 3.5),
    ratchetIntro(TG, 1.5, 0.4), ratchetIntro(TG, 1.5, 1.1), ratchetState(TG, 'boss'),
    ratchetState(TG, 'boss', { state: 'volley', pose: 'throw', volley: { toLaunch: ['rock', 'minion'], launched: 2, sinceLaunch: 0, hits: 1 } }),
    ratchetState(TG, 'boss', { state: 'telegraph', pose: 'raise' }), ratchetState(TG, 'boss', { state: 'attack', pose: 'stomp' }),
    ratchetState(TG, 'boss', { state: 'taunt', pose: 'laugh', stateT: 0.2, word: word('core', 3), windowWs: 5, lampRed: true, phase: 2 }),
    ratchetState(TG, 'boss', { state: 'recoil', pose: 'hurt', flashT: 0.1 }), ratchetState(TG, 'boss', { state: 'laugh', pose: 'laugh' }),
    ratchetState(TG, 'boss', { state: 'transition', pose: 'stomp', phase: 3, lampRed: true }),
    ratchetState(TG, 'boss', { state: 'finisher', pose: 'dizzy', phase: 3, lampRed: true, word: word('finisher', 5) }),
    defeat(0.02), defeat(0.8), defeat(1.3), defeat(3.9)];
}

check('TG.Render.draw draws Lady Ratchet from her intro to her defeat with the sprite files, with gfx.js and font.js alone and with only core.js, and writes nothing to a deep-frozen state', function () {
  for (const variant of [{}, { art: 'gfx' }, { art: false }]) {
    const env = loadEnv(variant);
    const TG = env.TG;
    const states = ratchetStates(TG);
    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      const text = JSON.stringify(s);
      deepFreeze(s);
      const before = env.canvasCalls.count;
      TG.Hud.update(1 / 60, s);
      TG.Render.draw(s);
      if (env.canvasCalls.count === before) return 'state ' + i + ' (art ' + JSON.stringify(variant.art) + '): no canvas calls';
      if (JSON.stringify(s) !== text) return 'state ' + i + ': the state changed';
    }
    if (env.errors.length) return 'console.error (art ' + JSON.stringify(variant.art) + '): ' + env.errors[0];
    // With her art present nothing is missing: no labelled box, no warning.
    if (variant.art === undefined && env.warnings.length) return 'console.warn: ' + env.warnings[0];
  }
});

const LEVEL2_PRESENT = SIM_PRESENT && fs.existsSync(path.join(stubs.ROOT, 'js/levels/level2.js'));

if (!LEVEL2_PRESENT) {
  skip('in the game, Level 2\'s boss intro is drawn on the timeline of LEVEL2 10.1, and the intro after a continue without the cameo and the gesture', 'the simulation files are not all present');
} else {
  check('in the game, Level 2\'s boss intro is drawn on the timeline of LEVEL2 10.1: the Baronet and the open hatch for the first second with her out of sight, her rise over the second, the watch and the three steps of her key from 2 s to 2.8 s, then the laugh; the intro after a continue has no cameo and no gesture; then the fight is hers', function () {
    const files = ['js/core.js'].concat(ART_FILES, ['js/words.js', 'js/typing.js', 'js/input.js', 'js/entities.js', 'js/level.js', 'js/boss.js',
      'js/levels/level1.js', 'js/levels/level2.js', 'js/game.js'], WPF_FILES);
    const env = stubs.load({ files: files, canvas: 'soft', storage: 'memory' });
    const TG = env.TG;
    const C = TG.C;
    TG.Gfx.init(env.document);
    TG.Events.clear();
    TG.Effects.init();
    TG.Hud.init();
    TG.Render.init(env.canvas);
    TG.Input.clear();
    TG.Game.init();
    const s0 = TG.Game.newRun({ difficulty: 'medium', seed: 1, levelId: 2, adaptive: false, assist: 1, tutorial: false });
    s0.player.x = s0.level.arenaX - 8;
    s0.camera.x = Math.max(0, s0.player.x - C.HERO_SCREEN_X);
    // Steps to the end of the next boss intro. Returns what was drawn of her on each of its frames, with
    // boss.stateT and boss.rise as they were and bx, the boss's place on the screen.
    const intro = function () {
      const frames = [];
      for (let i = 0; i < 2000; i++) {
        const was = TG.Game.state.screen;
        TG.Game.step(C.DT);
        const s = TG.Game.state;
        TG.Effects.update(C.DT);
        TG.Hud.update(C.DT, s);
        if (s.screen === 'bossIntro') frames.push({ t: s.boss.stateT, rise: s.boss.rise, bx: Math.floor(s.boss.x - s.camera.x), list: ratchetDrawn(TG, env, s) });
        else if (was === 'bossIntro') return frames;
      }
      return frames;
    };
    const one = function (f, name) { const l = named(f.list, name); return l.length === 1 ? l[0] : null; };
    const long = intro();
    if (TG.Game.state.boss.kind !== 'ratchet' || TG.Game.state.screen !== 'boss') return 'the run did not reach Lady Ratchet\'s fight';
    if (Math.abs(long.length - 240) > 1) return 'the 4 s intro: ' + long.length + ' frames';
    let keys = '';
    for (const f of long) {
      // A frame on one of the timeline's own moments is on either side of it, by the sum of the steps.
      if ([0.9, 1, 2, 2.8].some(function (edge) { return Math.abs(f.t - edge) < 1e-6; })) continue;
      const what = 'the 4 s intro at ' + f.t.toFixed(3) + ' s: ';
      const head = one(f, 'boss2_head'), near = named(f.list, 'boss2_arm').filter(function (c) { return !c.flipX; })[0] || null;
      const engine = one(f, 'boss2_engine'), baronet = one(f, 'en_baronet'), key = one(f, 'boss2_key');
      if (!engine) return what + 'no engine';
      // To 1 s: the cameo. Her head is the only part with a row above the ground line, and the engine hides it.
      if (f.t < 1) {
        if (engine.frame !== 'open' || engine.x !== f.bx) return what + 'the engine is ' + JSON.stringify(engine) + ' with the boss at ' + f.bx;
        if (!head || head.top !== RATCHET_BY - 18 || f.list.length > 3) return what + 'she is not out of sight: ' + JSON.stringify(f.list);
        if (!baronet && f.t < 0.99) return what + 'no Baronet';
        // His up frame throughout, helmet on; from 0.9 s he is in his drop, seen in the hatch's opening alone.
        if (baronet && (baronet.frame !== 'up' || (baronet.cols === 10) !== (f.t > 0.9))) return what + 'the Baronet is ' + JSON.stringify(baronet);
        continue;
      }
      if (baronet || engine.frame !== 'shut') return what + 'the cameo has not ended: ' + JSON.stringify(f.list);
      // 1 s to 2 s: she rises 40 px. From 2 s she is up, as boss.rise says too.
      const down = head ? head.top - (RATCHET_BY - 58) : null;
      if (f.t < 2) {
        if (down === null || Math.abs(down - 40 * (2 - f.t)) > 1) return what + 'she is ' + down + ' px down';
        if (head.frame !== 'normal' || (near && near.frame !== 'rest')) return what + JSON.stringify([head, near]);
        continue;
      }
      if (down !== 0 || f.rise !== 0 || engine.x !== f.bx || !near || !key) return what + 'she is not up and still: ' + JSON.stringify(f.list);
      // 2 s to 2.8 s: the gesture. Then the laugh.
      const gesture = f.t < 2.8;
      if (head.frame !== (gesture ? 'normal' : 'laugh') || near.frame !== (gesture ? 'watch' : 'rest')) return what + JSON.stringify([head, near]);
      if (keys.charAt(keys.length - 1) !== String(key.frame)) keys += key.frame;
      if (!gesture && key.frame !== 3) return what + 'the key is at ' + key.frame + ' in the laugh';
    }
    if (keys !== '0123') return 'the key through the gesture and the laugh: ' + keys.split('').join(' ');
    // The Baronet crosses the 304 px to the hatch in the first 0.9 s, 5 or 6 px a frame and never back, and
    // goes down there: in his drop his middle is at the hatch's on every frame.
    const xs = long.map(function (f) { const b = one(f, 'en_baronet'); return b ? (b.x !== undefined ? b.x : b.left - b.sx + 8) - f.bx : null; }).filter(function (x) { return x !== null; });
    if (xs.length < 59 || xs[0] > -298 || xs[xs.length - 1] !== 0) return 'the Baronet from ' + xs[0] + ' px to ' + xs[xs.length - 1] + ' px from the hatch in ' + xs.length + ' frames';
    for (let i = 1; i < xs.length; i++) {
      const moved = xs[i] - xs[i - 1];
      if (xs[i - 1] < 0 ? (moved < 5 || moved > 6) : moved !== 0) return 'the Baronet moves ' + moved + ' px in a frame, ' + xs[i - 1] + ' px from the hatch';
    }
    if (xs.filter(function (x) { return x === 0; }).length < 5) return 'the Baronet is at the hatch for ' + xs.filter(function (x) { return x === 0; }).length + ' frames';

    // The first frame of the fight: the key at the pace of phase 1.
    TG.Game.step(C.DT);
    let s = TG.Game.state;
    let key = named(ratchetDrawn(TG, env, s), 'boss2_key')[0];
    if (!key || key.frame !== Math.floor(s.time * 2) % 4) return 'the key in the first volley: ' + JSON.stringify(key) + ' at ' + s.time;

    if (!TG.Game.pause() || !TG.Game.continueRun()) return 'the run did not continue from the fight';
    if (TG.Game.state.boss.introTime !== C.BOSS_INTRO_SHORT) return 'the intro after the continue is ' + TG.Game.state.boss.introTime + ' s';
    const short = intro();
    if (Math.abs(short.length - 90) > 1) return 'the 1.5 s intro: ' + short.length + ' frames';
    for (const f of short) {
      const what = 'the 1.5 s intro at ' + f.t.toFixed(3) + ' s: ';
      const head = one(f, 'boss2_head'), near = named(f.list, 'boss2_arm').filter(function (c) { return !c.flipX; })[0] || null;
      const engine = one(f, 'boss2_engine'), key = one(f, 'boss2_key');
      if (one(f, 'en_baronet') || named(f.list, 'en_baronet').length) return what + 'a Baronet';
      if (!engine || engine.frame !== 'shut') return what + 'the engine is ' + JSON.stringify(engine);
      if (!head || head.top - (RATCHET_BY - 58) !== Math.floor(f.rise)) return what + 'her head is at ' + (head ? head.top : null) + ' with boss.rise ' + f.rise;
      if (Math.abs(f.t - 0.75) < 1e-6) continue;
      if (head.frame !== (f.t >= 0.75 ? 'laugh' : 'normal') || (near && near.frame !== 'rest') || (key && key.frame !== 0)) return what + JSON.stringify([head, near, key]);
    }
    if (env.errors.length || env.warnings.length) return 'console: ' + env.errors.concat(env.warnings)[0];
  });
}

// ---------------------------------------------------------------------------------------------

console.log('SUMMARY passed=' + passed + ' failed=' + failed + ' skipped=' + skipped);
process.exit(failed > 0 ? 1 : 0);
