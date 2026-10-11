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

check('the speech plate types 30 letters a second, and faster when the line would not be whole before the intro ends: both of Level 1\'s intros stay at 30', function () {
  const env = loadEnv();
  const TG = env.TG;
  const C = TG.C;
  const shown = function (speech, introTime, since) {
    const s = handState(TG, 'bossIntro', { screenT: introTime / 2 + since });
    s.level.boss.speech = speech;
    s.boss.introTime = introTime;
    return speechShown(TG, env, s);
  };
  if (BARON_LINE.length !== 20 || RATCHET_LINE.length !== 27) return 'the lines changed length';
  for (const intro of [C.BOSS_INTRO_TIME, C.BOSS_INTRO_SHORT]) {
    for (const since of [0, 0.125, 0.25, 0.5, 0.625, 0.75]) {       // eighths, so that the sums are exact
      const want = Math.min(20, Math.floor(since * 30));
      if (shown(BARON_LINE, intro, since) !== want) return 'Level 1, intro ' + intro + ' s, ' + since + ' s in: ' + shown(BARON_LINE, intro, since) + ' letters, want ' + want;
    }
  }
  // 27 letters: the 4 s intro has 2 s for them, so 30 a second. The 1.5 s intro has 0.75 s, so the line
  // and two letters more go into it: 29 / 0.75 = 38.67 a second.
  if (shown(RATCHET_LINE, C.BOSS_INTRO_TIME, 0.5) !== 15) return '27 letters in the long intro: ' + shown(RATCHET_LINE, C.BOSS_INTRO_TIME, 0.5);
  if (shown(RATCHET_LINE, C.BOSS_INTRO_SHORT, 0) !== 0) return '27 letters in the short intro at its half: ' + shown(RATCHET_LINE, C.BOSS_INTRO_SHORT, 0);
  if (shown(RATCHET_LINE, C.BOSS_INTRO_SHORT, 0.25) !== 9) return '27 letters in the short intro after 0.25 s: ' + shown(RATCHET_LINE, C.BOSS_INTRO_SHORT, 0.25);
  if (shown(RATCHET_LINE, C.BOSS_INTRO_SHORT, 0.5) !== 19) return '27 letters in the short intro after 0.5 s: ' + shown(RATCHET_LINE, C.BOSS_INTRO_SHORT, 0.5);
  // The last frame of an intro is drawn one step before its end: the step that reaches the end changes
  // the screen. Every line the screen holds (8 px a letter and 5 px of plate: 47 letters) is whole on it.
  for (const intro of [C.BOSS_INTRO_TIME, C.BOSS_INTRO_SHORT]) {
    for (let n = 1; n <= 47; n++) {
      const got = shown('TICK TOCK! '.repeat(5).slice(0, n), intro, intro / 2 - C.DT);
      if (got !== n) return 'a line of ' + n + ' letters on the last frame of the ' + intro + ' s intro: ' + got + ' letters';
    }
  }
  if (shown(RATCHET_LINE, C.BOSS_INTRO_SHORT, -0.1) !== -1) return 'a plate before the half';
});

if (!SIM_PRESENT) {
  skip('in the game, the last frame of the boss intro shows the whole speech line', 'the simulation files are not all present');
} else {
  check('in the game, the last frame of the boss intro shows the whole speech line, in the 4 s intro and in the 1.5 s intro after a continue: 20 letters and 27', function () {
    for (const speech of [BARON_LINE, RATCHET_LINE]) {
      const env = loadEnv({ sim: true });
      const TG = env.TG;
      const C = TG.C;
      // Level 1 with this line, started a few steps before the arena flag.
      const data = JSON.parse(JSON.stringify(TG.Levels[1]));
      data.boss.speech = speech;
      TG.Levels.scratch = data;
      TG.Input.clear();
      TG.Game.init();
      const s0 = TG.Game.newRun({ difficulty: 'medium', seed: 1, levelId: 'scratch', adaptive: false, assist: 1, tutorial: false });
      s0.player.x = s0.level.arenaX - 8;
      s0.camera.x = Math.max(0, s0.player.x - C.HERO_SCREEN_X);
      // Steps to the end of the next boss intro. Returns the letters shown on each of its frames.
      const intro = function () {
        const shown = [];
        for (let i = 0; i < 2000; i++) {
          const was = TG.Game.state.screen;
          TG.Game.step(C.DT);
          const s = TG.Game.state;
          TG.Effects.update(C.DT);
          TG.Hud.update(C.DT, s);
          if (s.screen === 'bossIntro') shown.push(speechShown(TG, env, s));
          else if (was === 'bossIntro') return shown;
        }
        return shown;
      };
      const long = intro();
      if (TG.Game.state.screen !== 'boss' || !TG.Game.pause() || !TG.Game.continueRun()) return 'the run did not reach the fight and continue from it';
      if (TG.Game.state.boss.introTime !== C.BOSS_INTRO_SHORT) return 'the intro after the continue is ' + TG.Game.state.boss.introTime + ' s';
      const short = intro();
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

console.log('SUMMARY passed=' + passed + ' failed=' + failed + ' skipped=' + skipped);
process.exit(failed > 0 ? 1 : 0);
