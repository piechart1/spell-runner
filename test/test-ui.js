// test/test-ui.js
// Tests for WP-G: js/ui.js, js/main.js, index.html, css/style.css and tools/shot-ui.js.
// CONTRACT 12 (WP-G checklist), 13.1 and 13.2.
//
//   node test/test-ui.js
//
// Prints one line per check (ok / FAIL / skip) and exits with 0 when every check passed.
//
// Two kinds of check:
//   - with fakes for TG.Game, TG.Input and TG.Audio (CONTRACT 12, WP-G), so that the interface is
//     tested on its own and every call it makes can be counted;
//   - with the real modules, driven the way a browser drives the page: keydown events through
//     env.dispatch and frames through env.runFrame (CONTRACT 13.3: tests run against the real
//     simulation as well as the fakes). tools/shot-ui.js supplies the session and a small bot.
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const stubs = require('./stubs');
const shot = require('../tools/shot-ui');

const ROOT = stubs.ROOT;
const DT = 1 / 60;

let passed = 0, failed = 0, skipped = 0;

function check(name, fn) {
  try {
    const r = fn();
    if (r === 'skip') {
      skipped++;
      console.log('skip - ' + name);
      return;
    }
    passed++;
    console.log('ok - ' + name);
  } catch (e) {
    failed++;
    console.log('FAIL - ' + name);
    console.log('    ' + String(e && e.stack ? e.stack : e).split('\n').slice(0, 6).join('\n    '));
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// ---------------------------------------------------------------------------------------------
// Fakes (CONTRACT 12, WP-G)
// ---------------------------------------------------------------------------------------------

const TRANSITIONS = {
  boot: ['title'],
  title: ['difficultySelect', 'howToPlay'],
  difficultySelect: ['howToPlay', 'title'],
  howToPlay: ['playing', 'title', 'difficultySelect'],
  playing: ['lifeLost', 'paused', 'bossIntro'],
  lifeLost: ['playing', 'boss', 'gameOver', 'paused'],
  bossIntro: ['boss', 'paused'],
  boss: ['lifeLost', 'paused', 'levelComplete'],
  levelComplete: ['results'],
  paused: ['playing', 'bossIntro', 'boss', 'results'],
  gameOver: ['playing', 'bossIntro', 'results'],
  results: ['highScoreEntry', 'title'],
  highScoreEntry: ['title']
};
const SIM = ['playing', 'lifeLost', 'bossIntro', 'boss', 'levelComplete'];

function fakeResult(over) {
  return Object.assign({
    cleared: true, levelId: 1, difficulty: 'medium', score: 48210, baseScore: 41210,
    bonuses: [{ id: 'lives', label: 'LIVES X3', points: 3000 }, { id: 'accuracy', label: 'ACCURACY 95%', points: 3000 },
      { id: 'nocontinue', label: 'NO CONTINUES', points: 2000 }],
    time: 301.4,
    typing: { wpm: 28.4, peakWpm: 35.1, accuracy: 0.954, correct: 412, wrong: 20, wordsCleared: 61, wordsClean: 48,
      wordsMissed: 3, bestCleanRun: 14, bestKeyStreak: 96, avgReaction: 0.82, practiseKeys: ['q', 'z'], slowKeys: ['p', 'b'] },
    ink: 131, livesLost: 2, lives: 3, continues: 0, rank: 'A', suggestion: null, bestWpm: 26, assist: 1
  }, over || {});
}

function makeFakeGame(TG, log) {
  const g = {
    state: { screen: 'boot', screenT: 0, screenData: null, resumeTo: null, pausePending: false, result: null },
    init() {
      log.push(['init']);
      g.state = { screen: 'boot', screenT: 0, screenData: null, resumeTo: null, pausePending: false, result: null };
      TG.Events.emit('screen:change', { from: null, to: 'boot', data: null });
      return g.state;
    },
    canGo(from, to) {
      return !!TRANSITIONS[from] && TRANSITIONS[from].indexOf(to) !== -1;
    },
    setScreen(name, data) {
      log.push(['setScreen', name, data === undefined ? null : JSON.parse(JSON.stringify(data))]);
      if (!g.canGo(g.state.screen, name)) return false;
      g.force(name, data);
      return true;
    },
    // Test helper: the simulation changes the screen.
    force(name, data) {
      const from = g.state.screen;
      g.state.screen = name;
      g.state.screenT = 0;
      g.state.screenData = data || null;
      TG.Events.emit('screen:change', { from: from, to: name, data: data || null });
    },
    newRun(opts) {
      log.push(['newRun', JSON.parse(JSON.stringify(opts))]);
      g.force('playing');
      return g.state;
    },
    pause() {
      log.push(['pause']);
      if (['playing', 'bossIntro', 'boss'].indexOf(g.state.screen) !== -1) {
        g.state.resumeTo = g.state.screen;
        g.force('paused');
        return true;
      }
      return false;
    },
    resume() {
      log.push(['resume']);
      if (g.state.screen !== 'paused') return false;
      g.force(g.state.resumeTo || 'playing');
      return true;
    },
    continueRun() {
      log.push(['continueRun']);
      if (g.state.screen !== 'gameOver' && g.state.screen !== 'paused') return false;
      g.force('playing');
      return true;
    },
    endRun() {
      log.push(['endRun']);
      if (g.state.screen !== 'gameOver' && g.state.screen !== 'paused') return false;
      g.state.result = fakeResult({ cleared: false, bonuses: [], score: 12000, baseScore: 12000, rank: 'B' });
      g.force('results');
      return true;
    },
    isSimScreen(name) {
      return SIM.indexOf(name) !== -1;
    },
    step() {
      log.push(['step']);
    }
  };
  return g;
}

function makeFakeInput(log) {
  const I = {
    queue: [], down: {}, onFirstInput: null,
    init(target) { log.push(['Input.init', !!target]); },
    typeChar(ch) { I.queue.push({ type: 'char', ch: String(ch).toLowerCase() }); },
    keyDown(k) { if (!I.down[k]) { I.down[k] = true; I.queue.push({ type: 'down', key: k }); } },
    keyUp(k) { if (I.down[k]) { delete I.down[k]; I.queue.push({ type: 'up', key: k }); } },
    isDown(k) { return !!I.down[k]; },
    drain() { const q = I.queue; I.queue = []; return q; },
    clear() { log.push(['Input.clear']); I.queue = []; I.down = {}; },
    bindButton(el, key) { log.push(['bindButton', el && el.id, key]); },
    // helpers for the tests
    press(k) { I.keyDown(k); I.keyUp(k); },
    type(text) { for (const ch of text) I.typeChar(ch); }
  };
  return I;
}

function makeFakeAudio(log) {
  return {
    init() { log.push(['Audio.init']); },
    unlock() { log.push(['unlock']); return true; },
    isUnlocked() { return log.some(function (e) { return e[0] === 'unlock'; }); },
    suspend() { log.push(['suspend']); },
    resume() { log.push(['resume-audio']); },
    update() { log.push(['Audio.update']); },
    setEnabled(kind, flag) { log.push(['setEnabled', kind, flag]); }
  };
}

const FAKE_FILES = ['js/core.js', 'js/words.js', 'js/gfx.js', 'js/font.js', 'js/sprites-chars.js', 'js/sprites-world.js',
  'js/ui.js', 'js/main.js'];

// Loads the interface with fakes and starts it like the page does. opts: { storage, canvas, init }.
function fakeEnv(opts) {
  const o = opts || {};
  const env = stubs.load({ files: FAKE_FILES, storage: o.storage || 'memory', canvas: o.canvas || 'stub' });
  const TG = env.TG;
  const log = [];
  const game = makeFakeGame(TG, log);
  const input = makeFakeInput(log);
  const audio = makeFakeAudio(log);
  TG.Game = game;
  TG.Input = input;
  TG.Audio = audio;
  TG.Effects = { init() { log.push(['Effects.init']); }, update() { log.push(['Effects.update']); } };
  TG.Hud = { init() { log.push(['Hud.init']); }, update() { log.push(['Hud.update']); } };
  // Record what the interface saves.
  const save = TG.Save;
  ['setSetting', 'addScore', 'recordRun', 'resetScores'].forEach(function (fn) {
    const orig = save[fn];
    save[fn] = function () {
      log.push([fn].concat(JSON.parse(JSON.stringify(Array.prototype.slice.call(arguments)))));
      return orig.apply(save, arguments);
    };
  });
  if (o.init !== false) TG.Main.init();
  const t = { env: env, TG: TG, log: log, game: game, input: input, audio: audio };
  t.steps = function (n) { for (let i = 0; i < n; i++) TG.Main.tick(DT); };
  t.seconds = function (s) { t.steps(Math.round(s * 60)); };
  t.press = function (k) { input.press(k); t.steps(1); };
  t.type = function (text) { for (const ch of text) { input.typeChar(ch); t.steps(1); } };
  t.calls = function (name) { return log.filter(function (e) { return e[0] === name; }); };
  t.screen = function () { return game.state.screen; };
  return t;
}

function eventLog(TG) {
  const seen = [];
  TG.Events.on('*', function (p, name) {
    if (name.indexOf('ui:') === 0) seen.push({ name: name, p: JSON.parse(JSON.stringify(p)) });
  });
  return seen;
}

// ---------------------------------------------------------------------------------------------
// A. The page
// ---------------------------------------------------------------------------------------------

const html = exists('index.html') ? read('index.html') : '';
const css = exists('css/style.css') ? read('css/style.css') : '';

check('index.html: the script tags are the 19 files of CONTRACT 1 in order, then the inline TG.Main.init()', function () {
  const tags = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) tags.push({ attrs: m[1], body: m[2].trim() });
  const srcs = tags.filter(function (t) { return /\bsrc\s*=/.test(t.attrs); }).map(function (t) {
    return /\bsrc\s*=\s*"([^"]*)"/.exec(t.attrs)[1];
  });
  assert.deepStrictEqual(srcs, stubs.FILES);
  assert.strictEqual(tags.length, stubs.FILES.length + 1, 'one inline script after the files');
  const last = tags[tags.length - 1];
  assert.ok(!/\bsrc\s*=/.test(last.attrs), 'the last script is inline');
  assert.strictEqual(last.body, 'TG.Main.init();');
  tags.forEach(function (t) {
    assert.ok(!/\b(type\s*=\s*"module"|defer|async)\b/i.test(t.attrs), 'no module, defer or async: ' + t.attrs);
  });
  // The scripts come at the end of <body>, after the page elements.
  assert.ok(html.indexOf('<script') > html.indexOf('id="btn-jump"'));
});

check('index.html and css/style.css: no network references; the only local ones are the scripts and the stylesheet', function () {
  assert.ok(css.length > 0, 'css/style.css exists');
  [html, css].forEach(function (text) {
    assert.ok(!/https?:/i.test(text), 'no http: or https:');
    assert.ok(!/(src|href)\s*=\s*"\/\//i.test(text), 'no protocol-relative URL');
    assert.ok(!/@import|@font-face/i.test(text), 'no @import or web font');
  });
  assert.ok(!/url\(/i.test(css), 'no url() in the stylesheet');
  const refs = [];
  const re = /\b(src|href)\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = re.exec(html))) refs.push(m[2]);
  refs.forEach(function (r) {
    const ok = stubs.FILES.indexOf(r) !== -1 || r === 'css/style.css' || r === 'data:,';
    assert.ok(ok, 'unexpected reference ' + r);
  });
  assert.ok(refs.indexOf('css/style.css') !== -1, 'the stylesheet is linked');
  assert.ok(/<link rel="icon" href="data:,">/.test(html), 'an empty icon, so the browser does not ask for favicon.ico');
});

check('index.html: #stage, #game (384 x 216), #crt, #controls; #btn-jump and #btn-duck with tabindex="-1" inside #controls', function () {
  assert.ok(/<div id="stage"[^>]*>/.test(html));
  assert.ok(/<canvas id="game" width="384" height="216">/.test(html));
  assert.ok(/<div id="crt"><\/div>/.test(html));
  const controls = /<div id="controls">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(controls, '#controls');
  assert.ok(/<button id="btn-jump" tabindex="-1"[^>]*>JUMP<\/button>/.test(controls[1]), '#btn-jump');
  assert.ok(/<button id="btn-duck" tabindex="-1"[^>]*>DUCK<\/button>/.test(controls[1]), '#btn-duck');
  assert.ok(/<meta name="viewport"/.test(html) && /<meta charset="utf-8">/.test(html));
});

check('css/style.css: pixelated scaling, INK letterbox, CRT overlay without pointer events, class rules', function () {
  assert.ok(/image-rendering:\s*pixelated/.test(css));
  assert.ok(/#stage\s*\{[^}]*background:\s*#0f0f1b/i.test(css), 'the stage is INK');
  assert.ok(/#crt\s*\{[^}]*pointer-events:\s*none/.test(css), 'the CRT overlay takes no pointer events');
  assert.ok(/#stage\.crt-on #crt\s*\{[^}]*display:\s*block/.test(css));
  assert.ok(/\.buttons-side/.test(css) && /\.buttons-below/.test(css));
  assert.ok(/overflow:\s*hidden/.test(css), 'the page never scrolls');
  assert.ok(/touch-action:\s*none/.test(css));
});

// ---------------------------------------------------------------------------------------------
// B. Load-time rules and the canvas subset
// ---------------------------------------------------------------------------------------------

check('ui.js and main.js load with only core.js and make no canvas, audio, storage, timer or listener calls', function () {
  const env = stubs.load({ files: ['js/core.js', 'js/ui.js', 'js/main.js'] });
  assert.deepStrictEqual(env.missing, []);
  assert.strictEqual(env.canvasCalls.count, 0);
  assert.strictEqual(env.audio.contexts.length, 0);
  assert.strictEqual(env.storage.size, 0);
  assert.strictEqual(env.raf.length, 0);
  assert.strictEqual(env.timers.length, 0);
  assert.strictEqual(Object.keys(env.listeners).length, 0);
  assert.deepStrictEqual(env.errors, []);
  assert.deepStrictEqual(env.warnings, []);
  const TG = env.TG;
  ['init', 'update', 'draw'].forEach(function (fn) { assert.strictEqual(typeof TG.UI[fn], 'function', 'TG.UI.' + fn); });
  assert.ok('panel' in TG.UI);
  assert.strictEqual(TG.UI.panel, null);
  ['init', 'frame', 'tick', 'layoutFor', 'resize'].forEach(function (fn) { assert.strictEqual(typeof TG.Main[fn], 'function', 'TG.Main.' + fn); });
});

check('ui.js and main.js follow the module pattern of CONTRACT 2.1', function () {
  ['js/ui.js', 'js/main.js'].forEach(function (f) {
    const src = read(f);
    assert.ok(/^\(function \(root\) \{\n  'use strict';\n  var TG = root\.TG = root\.TG \|\| \{\};/m.test(src), f + ': IIFE head');
    assert.ok(/\}\)\(typeof window !== 'undefined' \? window : globalThis\);\s*$/.test(src), f + ': IIFE tail');
    assert.ok(!/\b(import|require)\s*\(/.test(src.replace(/\/\/.*$/gm, '')), f + ': no import or require');
    // Other modules are looked up in function bodies, never kept at load time (rule 3).
    assert.ok(!/^\s{2}var \w+ = TG\.(Game|Input|Audio|Gfx|Font|Render|Hud|Effects|Save|Events|UI|Main)\b/m.test(src), f + ': no module copied at load time');
  });
});

check('ui.js uses only the canvas subset of CONTRACT 13.2 (static scan)', function () {
  const src = read('js/ui.js').replace(/\/\/.*$/gm, '');
  const outside = ['fillText', 'strokeText', 'strokeRect', 'beginPath', 'arc', 'lineTo', 'moveTo', 'stroke', 'fill', 'clip',
    'createLinearGradient', 'createRadialGradient', 'createPattern', 'rotate', 'scale', 'measureText', 'transform'];
  outside.forEach(function (m) {
    assert.ok(!new RegExp('ctx\\.' + m + '\\s*\\(').test(src), 'ctx.' + m + '() is outside the subset');
  });
  ['font', 'strokeStyle', 'lineWidth', 'textAlign', 'textBaseline', 'globalCompositeOperation', 'shadowColor'].forEach(function (p) {
    assert.ok(!new RegExp('ctx\\.' + p + '\\s*=').test(src), 'ctx.' + p + ' is outside the subset');
  });
  assert.ok(!/globalAlpha\s*=/.test(src));
});

// ---------------------------------------------------------------------------------------------
// C. TG.Main.init under the stubs
// ---------------------------------------------------------------------------------------------

['memory', 'none', 'throw'].forEach(function (storage) {
  check('TG.Main.init() with all modules present, storage "' + storage + '": no exception, no console error, boot screen', function () {
    const env = stubs.load({ storage: storage });
    env.TG.Main.init();
    for (let i = 1; i <= 30; i++) env.runFrame(i * 1000 / 60);
    assert.deepStrictEqual(env.errors, []);
    assert.strictEqual(env.TG.Game.state.screen, 'boot');
    assert.ok(env.canvasCalls.count > 0, 'something was drawn');
    assert.strictEqual(env.raf.length, 1, 'one frame is always pending');
  });
  check('TG.Main.init() with only core.js, ui.js and main.js, storage "' + storage + '": no exception, the loop runs', function () {
    const env = stubs.load({ files: ['js/core.js', 'js/ui.js', 'js/main.js'], storage: storage });
    env.TG.Main.init();
    for (let i = 1; i <= 10; i++) env.runFrame(i * 1000 / 60);
    env.dispatch('keydown', { key: 'a' });
    env.dispatch('blur', {});
    env.dispatch('focus', {});
    env.TG.Main.tick(DT);
    assert.deepStrictEqual(env.errors, []);
    assert.strictEqual(env.raf.length, 1);
  });
});

check('TG.Main.init() calls TG.Input.bindButton for #btn-jump and #btn-duck, and sets onFirstInput to unlock audio', function () {
  const t = fakeEnv();
  const binds = t.calls('bindButton').map(function (e) { return e[1] + ':' + e[2]; }).sort();
  assert.deepStrictEqual(binds, ['btn-duck:duck', 'btn-jump:jump']);
  assert.strictEqual(typeof t.input.onFirstInput, 'function');
  t.input.onFirstInput();
  assert.strictEqual(t.calls('unlock').length, 1);
});

check('TG.Main.init() starts the modules in the order of CONTRACT 4.21', function () {
  const t = fakeEnv();
  const order = t.log.map(function (e) { return e[0]; }).filter(function (n) {
    return ['Audio.init', 'Input.init', 'bindButton', 'Effects.init', 'Hud.init', 'init'].indexOf(n) !== -1;
  });
  const firsts = order.filter(function (n, i) { return order.indexOf(n) === i; });
  assert.deepStrictEqual(firsts, ['Audio.init', 'Input.init', 'bindButton', 'Effects.init', 'Hud.init', 'init']);
});

// ---------------------------------------------------------------------------------------------
// D. TG.UI with fakes
// ---------------------------------------------------------------------------------------------

check('TG.UI.init() before TG.Game.init() reads no game state; boot is set up when screen:change arrives', function () {
  const env = stubs.load({ files: FAKE_FILES });
  const TG = env.TG;
  const log = [];
  const game = makeFakeGame(TG, log);
  let reads = 0;
  let inner = game.state;
  Object.defineProperty(game, 'state', { get() { reads++; return inner; }, set(v) { inner = v; }, configurable: true });
  const input = makeFakeInput(log);
  TG.Game = game;
  TG.Input = input;
  TG.UI.init();
  assert.strictEqual(reads, 0, 'TG.UI.init read TG.Game.state');
  // Before the first screen:change, update and draw do nothing (the key stays in the queue).
  input.press('enter');
  TG.UI.update(DT);
  assert.strictEqual(input.queue.length, 2, 'update drained the queue before screen:change');
  const ctx = env.document.createElement('canvas').getContext('2d');
  const before = env.canvasCalls.count;
  TG.UI.draw(ctx, game.state);
  assert.strictEqual(env.canvasCalls.count, before, 'draw drew before screen:change');
  input.clear();
  game.init();
  TG.UI.draw(ctx, game.state);
  assert.ok(env.canvasCalls.count > before, 'the boot screen is drawn');
  input.press('space');
  TG.UI.update(DT);
  assert.strictEqual(game.state.screen, 'title');
});

check('From boot a key moves to title; START, a difficulty and typing READY call newRun with that difficulty', function () {
  const t = fakeEnv();
  const ui = eventLog(t.TG);
  assert.strictEqual(t.screen(), 'boot');
  t.steps(3);
  t.input.typeChar('q');
  t.steps(1);
  assert.strictEqual(t.screen(), 'title');
  assert.strictEqual(t.TG.UI.panel, 'menu');
  t.seconds(1.5);                                // the logo is stamped
  assert.strictEqual(ui.filter(function (e) { return e.name === 'ui:letter'; }).length, 11, 'one ui:letter per logo letter');
  t.press('enter');                              // START
  assert.strictEqual(t.screen(), 'difficultySelect');
  assert.strictEqual(t.TG.UI.panel, null);
  t.press('left');                               // from medium (the default) to easy
  t.press('enter');
  assert.strictEqual(t.screen(), 'howToPlay');
  const how = t.calls('setScreen').pop();
  assert.deepStrictEqual(how, ['setScreen', 'howToPlay', { origin: 'start', difficulty: 'easy' }]);
  t.press('enter');                              // Enter does not start the run; READY does
  assert.strictEqual(t.screen(), 'howToPlay');
  t.type('rea');
  t.type('x');                                   // a wrong letter starts READY again
  t.type('ready');
  assert.strictEqual(t.screen(), 'playing');
  const runs = t.calls('newRun');
  assert.strictEqual(runs.length, 1);
  assert.strictEqual(runs[0][1].difficulty, 'easy');
  assert.ok(Number.isInteger(runs[0][1].seed) && runs[0][1].seed >= 0 && runs[0][1].seed <= 0xffffffff, 'seed is a uint32');
  assert.deepStrictEqual(t.calls('setSetting').filter(function (e) { return e[1] === 'lastDifficulty'; }).pop(), ['setSetting', 'lastDifficulty', 'easy']);
  assert.ok(ui.some(function (e) { return e.name === 'ui:select'; }) && ui.some(function (e) { return e.name === 'ui:move'; }));
});

check('Typing HARD on the difficulty screen selects Hard (and EASY and MEDIUM likewise)', function () {
  ['hard', 'easy', 'medium'].forEach(function (name) {
    const t = fakeEnv();
    t.press('enter');
    t.seconds(1.3);
    t.press('enter');
    assert.strictEqual(t.screen(), 'difficultySelect');
    t.type('zq');                                // letters that start no name do nothing
    t.type(name);
    assert.strictEqual(t.screen(), 'howToPlay', name);
    assert.deepStrictEqual(t.calls('setScreen').pop(), ['setScreen', 'howToPlay', { origin: 'start', difficulty: name }]);
    t.type('ready');
    assert.strictEqual(t.calls('newRun')[0][1].difficulty, name);
  });
});

check('Esc goes back: howToPlay -> difficultySelect -> title; How to Play from the title returns with Enter', function () {
  const t = fakeEnv();
  t.press('enter');
  t.seconds(1.3);
  t.press('enter');
  t.press('enter');
  assert.strictEqual(t.screen(), 'howToPlay');
  t.press('esc');
  assert.strictEqual(t.screen(), 'difficultySelect');
  t.press('esc');
  assert.strictEqual(t.screen(), 'title');
  t.press('down');
  t.press('enter');
  assert.deepStrictEqual(t.calls('setScreen').pop(), ['setScreen', 'howToPlay', { origin: 'title' }]);
  t.type('ready');                               // from the title, READY does not start a run
  assert.strictEqual(t.calls('newRun').length, 0);
  t.press('enter');
  assert.strictEqual(t.screen(), 'title');
});

check('gameOver: keys are ignored for 0.8 s, then Enter calls continueRun', function () {
  const t = fakeEnv();
  t.game.force('gameOver');
  t.seconds(0.5);
  t.press('enter');
  t.press('esc');
  t.seconds(0.2);
  assert.strictEqual(t.calls('continueRun').length + t.calls('endRun').length, 0, 'a key in the lockout acted');
  assert.strictEqual(t.screen(), 'gameOver');
  t.seconds(0.15);
  t.press('enter');
  assert.strictEqual(t.calls('continueRun').length, 1);
  assert.strictEqual(t.screen(), 'playing');
});

check('gameOver: with no input, endRun is called when the countdown reaches zero (9 s), not before', function () {
  const t = fakeEnv();
  const ui = eventLog(t.TG);
  t.game.force('gameOver');
  t.seconds(8.9);
  assert.strictEqual(t.calls('endRun').length, 0);
  t.seconds(0.2);
  assert.strictEqual(t.calls('endRun').length, 1);
  assert.strictEqual(t.screen(), 'results');
  const counts = ui.filter(function (e) { return e.name === 'ui:count'; }).map(function (e) { return e.p.n + (e.p.high ? 'h' : ''); });
  assert.deepStrictEqual(counts, ['9', '8', '7', '6', '5', '4', '3h', '2h', '1h']);
});

check('gameOver: Esc after the lockout ends the run', function () {
  const t = fakeEnv();
  t.game.force('gameOver');
  t.seconds(1);
  t.press('esc');
  assert.strictEqual(t.calls('endRun').length, 1);
  assert.strictEqual(t.calls('continueRun').length, 0);
});

check('paused: RESUME calls resume only after the 1.5 s countdown (3, 2, 1)', function () {
  const t = fakeEnv();
  const ui = eventLog(t.TG);
  t.game.force('playing');
  t.game.pause();
  assert.strictEqual(t.screen(), 'paused');
  t.press('enter');                              // RESUME is the first item
  t.seconds(1.4);
  assert.strictEqual(t.calls('resume').length, 0, 'resume came too early');
  t.seconds(0.15);
  assert.strictEqual(t.calls('resume').length, 1);
  assert.strictEqual(t.screen(), 'playing');
  const counts = ui.filter(function (e) { return e.name === 'ui:count'; }).map(function (e) { return e.p.n; });
  assert.deepStrictEqual(counts, [3, 2, 1]);
});

check('paused: Esc starts the countdown and Esc again cancels it; RESTART and QUIT need a second Enter', function () {
  const t = fakeEnv();
  t.game.force('playing');
  t.game.pause();
  t.press('esc');
  t.seconds(0.6);
  t.press('esc');
  t.seconds(2);
  assert.strictEqual(t.calls('resume').length, 0);
  assert.strictEqual(t.screen(), 'paused');
  t.press('down');                               // RESTART FROM CHECKPOINT
  t.press('enter');
  assert.strictEqual(t.calls('continueRun').length, 0);
  t.press('enter');
  assert.strictEqual(t.calls('continueRun').length, 1);
  t.game.pause();
  for (let i = 0; i < 6; i++) t.press('down');   // QUIT
  t.press('enter');
  t.press('up');                                 // moving away cancels the question
  t.press('down');
  t.press('enter');
  assert.strictEqual(t.calls('endRun').length, 0);
  t.press('enter');
  assert.strictEqual(t.calls('endRun').length, 1);
  assert.strictEqual(t.screen(), 'results');
});

check('paused: MUSIC and SOUND EFFECTS are saved through TG.Save.setSetting and passed to TG.Audio.setEnabled', function () {
  const t = fakeEnv();
  t.game.force('playing');
  t.game.pause();
  t.press('down');
  t.press('down');                               // MUSIC
  t.press('enter');
  t.press('down');                               // SOUND EFFECTS
  t.press('right');
  t.press('down');                               // CRT EFFECT
  t.press('right');
  t.press('down');                               // REDUCE FLASH
  t.press('enter');
  const saved = t.calls('setSetting').map(function (e) { return e[1] + '=' + e[2]; });
  assert.deepStrictEqual(saved, ['music=false', 'sfx=false', 'crt=on', 'reduceFlash=true']);
  assert.deepStrictEqual(t.calls('setEnabled').map(function (e) { return e[1] + '=' + e[2]; }), ['music=false', 'sfx=false']);
  assert.strictEqual(t.TG.Save.getSetting('music'), false);
});

check('highScoreEntry: three letters and Enter call TG.Save.addScore with those initials', function () {
  const t = fakeEnv();
  t.game.state.result = fakeResult({ score: 99999 });
  t.game.force('highScoreEntry');
  t.type('a');
  t.press('enter');                              // one or two letters: Enter waits for three
  assert.strictEqual(t.calls('addScore').length, 0);
  t.type('bx');
  t.press('backspace');
  t.type('c');
  t.type('d');                                   // a fourth letter is ignored
  t.press('enter');
  const add = t.calls('addScore');
  assert.strictEqual(add.length, 1);
  assert.strictEqual(add[0][1], 'medium');
  assert.strictEqual(add[0][2].name, 'ABC');
  assert.strictEqual(add[0][2].score, 99999);
  assert.strictEqual(add[0][2].wpm, 28);
  assert.strictEqual(add[0][2].accuracy, 95);
  assert.strictEqual(add[0][2].rank, 'A');
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(add[0][2].date), 'date YYYY-MM-DD');
  assert.strictEqual(t.TG.Save.scores('medium')[0].name, 'ABC');
  assert.strictEqual(t.TG.Save.getSetting('initials'), 'ABC');
  assert.strictEqual(t.screen(), 'title');
  assert.strictEqual(t.TG.UI.panel, 'scores', 'the title opens on the high scores with the new entry');
});

check('highScoreEntry: Enter with no letters uses the saved initials', function () {
  const t = fakeEnv();
  t.TG.Save.setSetting('initials', 'KEY');
  t.game.state.result = fakeResult({ score: 77777, difficulty: 'hard' });
  t.game.force('highScoreEntry');
  t.press('enter');
  assert.strictEqual(t.calls('addScore')[0][2].name, 'KEY');
});

check('Options: changes are written through TG.Save.setSetting; RESET SCORES needs a second Enter', function () {
  const t = fakeEnv();
  t.press('enter');
  t.seconds(1.3);
  t.press('down');
  t.press('down');
  t.press('down');                               // OPTIONS
  t.press('enter');
  assert.strictEqual(t.TG.UI.panel, 'options');
  t.press('enter');                              // MUSIC
  t.press('down');
  t.press('left');                               // SOUND EFFECTS
  t.press('down');
  t.press('left');                               // CRT: auto -> off
  t.press('down');
  t.press('right');                              // REDUCE FLASH
  t.press('down');
  t.press('right');                              // KEY GUIDE: auto -> on
  t.press('down');
  t.press('enter');                              // ADAPTIVE PACE
  const saved = t.calls('setSetting').map(function (e) { return e[1] + '=' + e[2]; });
  assert.deepStrictEqual(saved, ['music=false', 'sfx=false', 'crt=off', 'reduceFlash=true', 'keyGuide=on', 'adaptive=false']);
  assert.deepStrictEqual(t.calls('setEnabled').map(function (e) { return e[1] + '=' + e[2]; }), ['music=false', 'sfx=false']);
  t.TG.Save.addScore('easy', { name: 'ZZZ', score: 99999, wpm: 20, accuracy: 90, rank: 'B', cleared: true, date: '' });
  t.press('down');                               // RESET SCORES
  t.press('enter');
  assert.strictEqual(t.calls('resetScores').length, 0);
  t.press('enter');
  assert.strictEqual(t.calls('resetScores').length, 1);
  assert.notStrictEqual(t.TG.Save.scores('easy')[0].name, 'ZZZ');
  t.press('esc');
  assert.strictEqual(t.TG.UI.panel, 'menu');
});

check('checkpoint with index 1 calls TG.Save.setSetting("tutorialDone", true); index 0 does not', function () {
  const t = fakeEnv();
  t.TG.Events.emit('checkpoint', { index: 0, x: 96, wpm: 0, accuracy: 1, bonus: 0, lives: 4 });
  assert.strictEqual(t.calls('setSetting').length, 0);
  t.TG.Events.emit('checkpoint', { index: 1, x: 4096, wpm: 20, accuracy: 0.9, bonus: 0, lives: 4 });
  assert.deepStrictEqual(t.calls('setSetting'), [['setSetting', 'tutorialDone', true]]);
  assert.strictEqual(t.TG.Save.getSetting('tutorialDone'), true);
});

check('results: TG.Save.recordRun once; the tally and rank stamp; Enter pages; then highScoreEntry when the score qualifies', function () {
  const t = fakeEnv();
  const ui = eventLog(t.TG);
  t.game.state.result = fakeResult();
  t.game.force('results');
  t.steps(3);
  t.press('enter');                              // ignored in the first 0.5 s
  t.seconds(0.2);
  assert.strictEqual(t.calls('recordRun').length, 1);
  assert.strictEqual(t.calls('recordRun')[0][1].score, 48210);
  assert.ok(ui.filter(function (e) { return e.name === 'ui:tally'; }).length > 3, 'tally ticks');
  assert.strictEqual(ui.filter(function (e) { return e.name === 'ui:stamp'; }).length, 0, 'no stamp before the tally ends');
  t.seconds(0.4);
  t.press('enter');                              // finishes the tally and stamps the rank
  const stamps = ui.filter(function (e) { return e.name === 'ui:stamp'; });
  assert.strictEqual(stamps.length, 1);
  assert.strictEqual(stamps[0].p.rank, 'A');
  assert.strictEqual(t.screen(), 'results');
  t.press('enter');                              // page 2
  assert.strictEqual(t.screen(), 'results');
  t.seconds(3);
  t.press('enter');
  assert.strictEqual(t.screen(), 'highScoreEntry');
  assert.strictEqual(t.calls('recordRun').length, 1, 'recordRun only once');
});

check('results: a score that does not qualify returns to the title; the tally finishes by itself', function () {
  const t = fakeEnv();
  const ui = eventLog(t.TG);
  t.game.state.result = fakeResult({ score: 100, baseScore: 100, bonuses: [], cleared: false, rank: 'C' });
  t.game.force('results');
  t.seconds(6);
  assert.strictEqual(ui.filter(function (e) { return e.name === 'ui:stamp'; }).length, 1, 'the rank is stamped by itself');
  t.press('enter');
  t.seconds(3);
  t.press('enter');
  assert.strictEqual(t.screen(), 'title');
  assert.strictEqual(t.calls('addScore').length, 0);
});

check('A screen change that is refused leaves the screen working: the next key tries again', function () {
  const t = fakeEnv();
  let refuse = true;
  const setScreen = t.game.setScreen;
  t.game.setScreen = function (name, data) {
    if (refuse) { refuse = false; t.log.push(['refused', name]); return false; }
    return setScreen(name, data);
  };
  t.game.state.result = fakeResult();
  t.game.force('results');
  t.seconds(4);
  t.press('enter');                              // to page 2
  t.seconds(2);
  t.press('enter');                              // refused
  assert.strictEqual(t.screen(), 'results');
  assert.strictEqual(t.calls('refused').length, 1);
  t.press('enter');                              // tried again
  assert.strictEqual(t.screen(), 'highScoreEntry');
  refuse = true;
  t.type('abc');
  t.press('enter');                              // the score is added, the change is refused
  assert.strictEqual(t.screen(), 'highScoreEntry');
  t.press('enter');
  assert.strictEqual(t.screen(), 'title');
  assert.strictEqual(t.calls('addScore').length, 1, 'the score was added once');
  const cont = t.game.continueRun;
  let once = true;
  t.game.continueRun = function () { if (once) { once = false; t.log.push(['refused', 'continue']); return false; } return cont(); };
  t.game.force('gameOver');
  t.seconds(1);
  t.press('enter');
  assert.strictEqual(t.screen(), 'gameOver');
  t.press('enter');
  assert.strictEqual(t.screen(), 'playing');
});

check('TG.UI.panel: menu, options, scores and story (after 12 s idle) on the title, null elsewhere', function () {
  const t = fakeEnv();
  assert.strictEqual(t.TG.UI.panel, null);
  t.press('enter');
  t.seconds(1.3);
  assert.strictEqual(t.TG.UI.panel, 'menu');
  t.press('down');
  t.press('down');
  t.press('enter');
  assert.strictEqual(t.TG.UI.panel, 'scores');
  t.press('esc');
  assert.strictEqual(t.TG.UI.panel, 'menu');
  t.seconds(11.5);
  assert.strictEqual(t.TG.UI.panel, 'menu');
  t.seconds(1);
  assert.strictEqual(t.TG.UI.panel, 'story');
  t.seconds(8.5);
  assert.strictEqual(t.TG.UI.panel, 'scores', 'the idle rotation shows the high scores next');
  t.press('down');                               // any key returns to the menu, and does nothing else
  assert.strictEqual(t.TG.UI.panel, 'menu');
  assert.strictEqual(t.screen(), 'title');
  t.press('up');
  t.press('up');                                 // from HIGH SCORES back to START
  t.press('enter');
  assert.strictEqual(t.screen(), 'difficultySelect');
  assert.strictEqual(t.TG.UI.panel, null);
});

// The strings TG.Font.draw is asked to draw during fn.
function textsDrawn(TG, fn) {
  const seen = [];
  const draw = TG.Font.draw;
  TG.Font.draw = function (ctx, text) { seen.push(String(text)); return draw.apply(TG.Font, arguments); };
  try { fn(); } finally { TG.Font.draw = draw; }
  return seen;
}

check('Focus lost during the RESUME countdown returns to the pause menu; on game over the continue countdown waits for the focus', function () {
  const t = fakeEnv();
  t.game.force('playing');
  t.game.pause();
  t.press('enter');                              // RESUME: the 3-2-1 starts
  t.seconds(0.5);
  t.env.dispatch('blur', {});
  t.seconds(3);
  assert.strictEqual(t.calls('resume').length, 0, 'the game resumed with the window unfocused');
  assert.strictEqual(t.screen(), 'paused');
  const texts = textsDrawn(t.TG, function () { t.TG.UI.draw(t.env.canvas.getContext('2d'), t.game.state); });
  assert.ok(texts.indexOf('PAUSED') !== -1, 'not back on the pause menu: ' + texts.join('|'));
  t.env.dispatch('focus', {});
  t.press('enter');
  t.seconds(1.6);
  assert.strictEqual(t.calls('resume').length, 1, 'RESUME works again after the focus is back');
  // Game over: 1 s, then 20 s in another window, then focus: the countdown goes on from 8.
  t.game.force('gameOver');
  t.seconds(1);
  t.env.dispatch('blur', {});
  t.seconds(20);
  assert.strictEqual(t.calls('endRun').length, 0, 'the run ended while the window had no focus');
  assert.strictEqual(t.screen(), 'gameOver');
  t.env.dispatch('focus', {});
  t.seconds(7.8);
  assert.strictEqual(t.calls('endRun').length, 0, 'the countdown jumped ahead after the focus came back');
  t.seconds(0.3);
  assert.strictEqual(t.calls('endRun').length, 1);
});

check('Touch without a keyboard: a touch press shows that a keyboard is needed on the title and How to Play; the first key clears it', function () {
  const t = fakeEnv();
  const ctx = t.env.canvas.getContext('2d');
  const drawn = function () { return textsDrawn(t.TG, function () { t.TG.UI.draw(ctx, t.game.state); }); };
  const NOTE = 'SPELL RUNNER NEEDS A KEYBOARD.';
  t.env.dispatch('pointerdown', { pointerType: 'mouse', target: t.env.document.body });
  t.steps(2);
  assert.strictEqual(t.screen(), 'title');
  t.seconds(1.3);
  assert.ok(drawn().indexOf(NOTE) === -1, 'the note after a mouse click');
  t.env.dispatch('pointerdown', { pointerType: 'touch', target: t.env.document.getElementById('btn-jump') });
  assert.ok(drawn().indexOf(NOTE) !== -1, 'no note on the title after a touch');
  t.game.force('howToPlay', { origin: 'start', difficulty: 'easy' });
  t.steps(1);
  let texts = drawn();
  assert.ok(texts.indexOf(NOTE) !== -1 && texts.indexOf('CONNECT ONE, THEN TYPE READY.') !== -1, 'How to Play: ' + texts.slice(-4).join('|'));
  t.env.dispatch('keydown', { key: 'r', code: 'KeyR' });
  t.steps(1);
  texts = drawn();
  assert.ok(texts.indexOf(NOTE) === -1 && texts.indexOf('TO START') !== -1, 'the note stays after a key: ' + texts.slice(-4).join('|'));
  t.env.dispatch('pointerdown', { pointerType: 'touch', target: t.env.document.body });
  assert.ok(drawn().indexOf(NOTE) === -1, 'a touch after a key shows the note again');
});

check('How to Play says that the arch needs duck held and that mistakes need no Backspace', function () {
  const t = fakeEnv();
  t.game.force('howToPlay', { origin: 'title' });
  t.steps(1);
  const texts = textsDrawn(t.TG, function () { t.TG.UI.draw(t.env.canvas.getContext('2d'), t.game.state); });
  ['HOLD FOR ARCHES', 'LETS GO OF A', 'WORD. MISTAKES', 'NEED NO FIXING.'].forEach(function (line) {
    assert.ok(texts.indexOf(line) !== -1, 'missing "' + line + '"');
  });
});

check('results: a run with no letter key pressed shows --- for ACCURACY and KEYS TO PRACTISE, not 100% and a green NONE', function () {
  const t = fakeEnv();
  t.game.state.result = fakeResult({ cleared: false, rank: 'C', score: 120, baseScore: 120, bonuses: [],
    typing: { wpm: 0, peakWpm: 0, accuracy: 1, correct: 0, wrong: 0, wordsCleared: 0, wordsClean: 0, wordsMissed: 3,
      bestCleanRun: 0, bestKeyStreak: 0, avgReaction: 0, practiseKeys: [], slowKeys: [] } });
  t.game.force('results');
  t.seconds(0.6);
  t.press('enter');                              // finish the tally
  const texts = textsDrawn(t.TG, function () { t.TG.UI.draw(t.env.canvas.getContext('2d'), t.game.state); });
  assert.ok(texts.indexOf('100%') === -1, 'ACCURACY 100% for a run with no keys');
  assert.ok(texts.indexOf('NONE') === -1, 'KEYS TO PRACTISE NONE for a run with no keys');
  assert.ok(texts.filter(function (s) { return s === '---'; }).length === 2, 'expected --- twice: ' + texts.join('|'));
  // A perfect run keeps the green NONE.
  const u = fakeEnv();
  u.game.state.result = fakeResult({ typing: Object.assign({}, fakeResult().typing, { wrong: 0, accuracy: 1, practiseKeys: [] }) });
  u.game.force('results');
  u.seconds(0.6);
  u.press('enter');
  const texts2 = textsDrawn(u.TG, function () { u.TG.UI.draw(u.env.canvas.getContext('2d'), u.game.state); });
  assert.ok(texts2.indexOf('NONE') !== -1 && texts2.indexOf('100%') !== -1, 'perfect run: ' + texts2.join('|'));
});

check('Pause and game over dim the frame below the HUD only: the top bar (and the boss bar in the arena) stays readable', function () {
  const t = fakeEnv({ canvas: 'soft' });
  const ctx = t.env.canvas.getContext('2d');
  const white = t.TG.PAL[4].toLowerCase();
  function topClear(boss) {
    t.game.state.boss = boss ? { phase: 1 } : null;
    ctx.fillStyle = t.TG.PAL[4];
    ctx.fillRect(0, 0, 384, 216);
    t.TG.UI.draw(ctx, t.game.state);
    const rgba = t.env.canvas.toRGBA();
    const px = function (x, y) {
      const o = (y * 384 + x) * 4;
      return '#' + [rgba[o], rgba[o + 1], rgba[o + 2]].map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
    };
    const bottom = boss ? 30 : 22;
    for (let y = 0; y <= bottom; y++) for (let x = 0; x < 384; x++) if (px(x, y) !== white) return 'dithered at ' + x + ',' + y;
    let dithered = false;
    for (let x = 0; x < 20; x++) if (px(x, bottom + 5) !== white) dithered = true;
    return dithered ? null : 'no dither below the HUD';
  }
  t.game.force('playing');
  t.game.pause();
  t.steps(1);
  let p = topClear(false) || topClear(true);
  assert.ok(!p, 'paused: ' + p);
  t.game.force('gameOver');
  t.seconds(1.2);                                // the GAME OVER letters have dropped into place
  p = topClear(false) || topClear(true);
  assert.ok(!p, 'gameOver: ' + p);
});

check('TG.UI.draw draws nothing on playing, lifeLost, bossIntro, boss and levelComplete, and draws every UI screen', function () {
  const t = fakeEnv();
  const ctx = t.env.canvas.getContext('2d');
  const drawn = {};
  ['boot', 'title', 'difficultySelect', 'howToPlay', 'paused', 'gameOver', 'results', 'highScoreEntry',
    'playing', 'lifeLost', 'bossIntro', 'boss', 'levelComplete'].forEach(function (name) {
    t.game.state.result = fakeResult();
    t.game.force(name, name === 'howToPlay' ? { origin: 'start', difficulty: 'hard' } : null);
    t.steps(2);
    const before = t.env.canvasCalls.count;
    t.TG.UI.draw(ctx, t.game.state);
    drawn[name] = t.env.canvasCalls.count - before;
  });
  SIM.forEach(function (name) { assert.strictEqual(drawn[name], 0, name); });
  ['boot', 'title', 'difficultySelect', 'howToPlay', 'paused', 'gameOver', 'results', 'highScoreEntry'].forEach(function (name) {
    assert.ok(drawn[name] > 0, name + ' was not drawn');
  });
  assert.deepStrictEqual(t.env.errors, []);
});

// ---------------------------------------------------------------------------------------------
// E. Layout (CONTRACT 4.21 and 13.1)
// ---------------------------------------------------------------------------------------------

check('TG.Main.layoutFor gives the check values of CONTRACT 4.21 and 13.1', function () {
  const env = stubs.load({ files: ['js/core.js', 'js/main.js'] });
  const L = env.TG.Main.layoutFor;
  function same(r, scale, buttons) {
    assert.ok(Math.abs(r.scale - scale) < 1e-9, 'scale ' + r.scale + ' != ' + scale);
    assert.strictEqual(r.buttons, buttons);
    assert.ok(Math.abs(r.cssW - 384 * scale) < 1e-6 && Math.abs(r.cssH - 216 * scale) < 1e-6);
  }
  same(L(1366, 768), 3, 'side');
  same(L(1280, 720), 3, 'below');
  same(L(1920, 1080), 4, 'below');
  same(L(800, 600), 2, 'below');
  same(L(1366, 768, 1), 3, 'side');
  same(L(1440, 900, 2), 3.5, 'below');
  same(L(700, 500, 1), 700 / 384, 'below');
  same(L(50, 40, 1), 0.25, 'below');
  // Short, wide windows (a phone held sideways, a low browser window): the buttons at the sides leave
  // the canvas larger than a strip under it (it was 1.519 and 1.25 below).
  same(L(1200, 400, 1), 400 / 216, 'side');
  same(L(844, 342, 3), 342 / 216, 'side');
  same(L(920, 500, 3), 2, 'side');               // side fit 2.02 is snapped to whole device pixels
});

check('Moving the window to a screen with another pixel density redoes the layout on the next frame, without a resize event', function () {
  const env = stubs.load({ files: ['js/core.js', 'js/main.js'] });
  env.TG.Main.init();
  env.setSize(1512, 871);
  env.window.devicePixelRatio = 2;
  env.TG.Main.resize();
  const canvas = env.document.getElementById('game');
  assert.strictEqual(canvas.getBoundingClientRect().width, 384 * 3.5, 'scale 3.5 at 2 device px per CSS px');
  env.window.devicePixelRatio = 1;
  env.runFrame(16);
  env.runFrame(33);
  assert.strictEqual(canvas.getBoundingClientRect().width, 384 * 3, 'the layout kept the old density');
});

check('Audio unlock is tried again until the context runs: Esc first leaves it suspended, the next tap or key resumes it', function () {
  ['pointerup', 'keydown', 'touchend', 'click'].forEach(function (how) {
    const env = stubs.load();
    env.TG.Main.init();
    env.runFrame(0);
    env.dispatch('keydown', { key: 'Escape', code: 'Escape' });
    assert.strictEqual(env.audio.contexts.length, 1, 'no context after the first key');
    const ctx = env.audio.contexts[0];
    ctx.state = 'suspended';                   // the browser refused to start it outside a user gesture
    const resumes = env.audio.resumes;
    env.dispatch('keydown', { key: 'Escape', code: 'Escape' });
    assert.strictEqual(env.audio.resumes, resumes, 'Esc is not a user gesture');
    if (how === 'keydown') env.dispatch('keydown', { key: 'a', code: 'KeyA' });
    else env.dispatch(how, { pointerType: 'touch', target: env.document.body });
    assert.strictEqual(ctx.state, 'running', how + ' did not resume the context');
    assert.strictEqual(env.TG.Audio.isUnlocked(), true);
    const after = env.audio.resumes;
    env.dispatch('keydown', { key: 'b', code: 'KeyB' });
    assert.strictEqual(env.audio.resumes, after, 'resume called with the context running');
    assert.strictEqual(env.audio.contexts.length, 1, 'a second context');
  });
});

check('For every window from 320 x 240 to 2560 x 1440 (40 px steps, dpr 1 and 2) the canvas and both 64 x 64 buttons are inside the window and do not overlap', function () {
  const env = stubs.load({ files: ['js/core.js', 'js/main.js'] });
  const TG = env.TG;
  TG.Main.init();
  const doc = env.document;
  const canvas = doc.getElementById('game'), jump = doc.getElementById('btn-jump'), duck = doc.getElementById('btn-duck');
  const stage = doc.getElementById('stage');
  const eps = 1e-6;
  function inside(r, w, h) { return r.left >= -eps && r.top >= -eps && r.right <= w + eps && r.bottom <= h + eps; }
  function apart(a, b) { return a.right <= b.left + eps || b.right <= a.left + eps || a.bottom <= b.top + eps || b.bottom <= a.top + eps; }
  let n = 0;
  [1, 2].forEach(function (dpr) {
    env.window.devicePixelRatio = dpr;
    for (let w = 320; w <= 2560; w += 40) {
      for (let h = 240; h <= 1440; h += 40) {
        env.setSize(w, h);
        TG.Main.resize();
        const L = TG.Main.layoutFor(w, h, dpr);
        const c = canvas.getBoundingClientRect(), j = jump.getBoundingClientRect(), d = duck.getBoundingClientRect();
        const where = w + 'x' + h + '@' + dpr;
        assert.ok(Math.abs(c.width - L.cssW) < eps && Math.abs(c.height - L.cssH) < eps, where + ' canvas size');
        assert.ok(j.width === 64 && j.height === 64 && d.width === 64 && d.height === 64, where + ' button size');
        assert.ok(inside(c, w, h) && inside(j, w, h) && inside(d, w, h), where + ' outside the window');
        assert.ok(apart(c, j) && apart(c, d) && apart(j, d), where + ' overlap');
        assert.ok(d.left < j.left, where + ' DUCK is on the left');
        if (L.buttons === 'side') {
          assert.ok(Math.abs(j.bottom - c.bottom) < 0.51 && Math.abs(d.bottom - c.bottom) < 0.51, where + ' side buttons level with the canvas bottom');
          assert.ok(d.right <= c.left && j.left >= c.right, where + ' side buttons in the margins');
        } else {
          assert.ok(j.top >= c.bottom && d.top >= c.bottom, where + ' below buttons under the canvas');
        }
        if (L.scale >= 2) assert.ok(Math.abs(L.scale * dpr - Math.round(L.scale * dpr)) < 1e-9, where + ' whole device pixels');
        assert.ok(stage.classList.contains('buttons-' + L.buttons) && !stage.classList.contains('buttons-' + (L.buttons === 'side' ? 'below' : 'side')), where + ' stage class');
        n++;
      }
    }
  });
  assert.ok(n > 3000);
  assert.strictEqual(canvas.width, 384, 'the backing store stays 384 x 216');
  assert.strictEqual(canvas.height, 216);
});

check('CRT overlay: auto is on at scale 3 or more and off below; the crt setting on and off wins', function () {
  const env = stubs.load();
  const TG = env.TG;
  TG.Main.init();
  const stage = env.document.getElementById('stage');
  env.setSize(1366, 768);                          // scale 3
  TG.Main.resize();
  assert.ok(stage.classList.contains('crt-on'));
  assert.strictEqual(env.document.getElementById('crt').style.backgroundSize, '100% 3px, 100% 100%');
  env.setSize(800, 600);                           // scale 2
  TG.Main.resize();
  assert.ok(!stage.classList.contains('crt-on'));
  TG.Save.setSetting('crt', 'on');
  env.runFrame(16);
  assert.ok(stage.classList.contains('crt-on'), 'on, read on the next frame');
  TG.Save.setSetting('crt', 'off');
  env.setSize(1920, 1080);
  TG.Main.resize();
  assert.ok(!stage.classList.contains('crt-on'));
});

// ---------------------------------------------------------------------------------------------
// F. Focus, keys and the loop
// ---------------------------------------------------------------------------------------------

['title', 'playing'].forEach(function (screen) {
  check('Focus on ' + screen + ': blur calls pause, Input.clear and Audio.suspend; focus calls resume; visibilitychange does the same', function () {
    const t = fakeEnv();
    t.game.force(screen);
    t.log.length = 0;
    t.env.dispatch('blur', {});
    assert.deepStrictEqual(t.log.map(function (e) { return e[0]; }), ['pause', 'Input.clear', 'suspend']);
    t.log.length = 0;
    t.env.dispatch('focus', {});
    assert.deepStrictEqual(t.log.map(function (e) { return e[0]; }), ['resume-audio']);
    t.log.length = 0;
    t.env.setHidden(true);
    t.env.dispatch('visibilitychange', {});
    assert.deepStrictEqual(t.log.map(function (e) { return e[0]; }), ['pause', 'Input.clear', 'suspend']);
    t.log.length = 0;
    t.env.setHidden(false);
    t.env.dispatch('visibilitychange', {});
    assert.deepStrictEqual(t.log.map(function (e) { return e[0]; }), ['resume-audio']);
    assert.strictEqual(t.screen(), screen === 'playing' ? 'paused' : 'title');
  });
});

check('Main loop: fixed steps from an accumulator; at most 5 steps a frame; a frame over 0.25 s pauses and runs none', function () {
  const t = fakeEnv();
  t.game.force('playing');
  const env = t.env;
  function steps() { return t.calls('step').length; }
  let ms = 1000;
  env.runFrame(ms);                               // the first frame only sets the clock
  assert.strictEqual(steps(), 0);
  for (let i = 0; i < 120; i++) { ms += 1000 / 60; env.runFrame(ms); }
  assert.strictEqual(steps(), 120, '60 steps per second');
  for (let i = 0; i < 60; i++) { ms += 1000 / 120; env.runFrame(ms); }
  assert.ok(Math.abs(steps() - 150) <= 1, '120 Hz frames still give 60 steps a second: ' + steps());
  let before = steps();
  ms += 150;
  env.runFrame(ms);
  assert.strictEqual(steps() - before, 5, 'at most MAX_STEPS in one frame');
  before = steps();
  ms += 1000 / 60;
  env.runFrame(ms);
  assert.ok(steps() - before <= 2, 'the backlog was dropped, not carried');
  const pausesBefore = t.calls('pause').length;
  before = steps();
  ms += 400;
  env.runFrame(ms);
  assert.strictEqual(steps(), before, 'no step after a long frame');
  assert.strictEqual(t.calls('pause').length, pausesBefore + 1, 'a long frame pauses');
  assert.strictEqual(t.screen(), 'paused');
  ms += 1000 / 60;
  env.runFrame(ms);
  assert.ok(t.calls('Audio.update').length >= 180, 'TG.Audio.update once per frame');
  assert.strictEqual(env.raf.length, 1);
});

check('Main.tick: Game.step on sim screens, UI.update on the others; Effects.update except while paused; Hud.update always', function () {
  const t = fakeEnv();
  t.log.length = 0;
  t.game.force('playing');
  t.TG.Main.tick(DT);
  assert.deepStrictEqual(t.log.map(function (e) { return e[0]; }), ['step', 'Effects.update', 'Hud.update']);
  t.game.pause();
  t.log.length = 0;
  t.TG.Main.tick(DT);
  assert.deepStrictEqual(t.log.map(function (e) { return e[0]; }), ['Hud.update']);
  t.game.force('title');
  t.log.length = 0;
  t.input.press('down');
  t.TG.Main.tick(DT);
  assert.strictEqual(t.input.queue.length, 0, 'UI.update drained TG.Input');
  assert.deepStrictEqual(t.log.map(function (e) { return e[0]; }), ['Effects.update', 'Hud.update']);
});

check('Keys: Tab, quote and slash are kept from the browser; Ctrl and Cmd combinations are left to it; game keys are prevented', function () {
  const env = stubs.load();
  env.TG.Main.init();
  function down(init) { return env.dispatch('keydown', init).defaultPrevented; }
  assert.ok(down({ key: 'Tab', code: 'Tab' }), 'Tab');
  assert.ok(down({ key: '\'', code: 'Quote' }), 'quote (Firefox quick find)');
  assert.ok(down({ key: '/', code: 'Slash' }), 'slash (Firefox quick find)');
  assert.ok(down({ key: 'PageDown', code: 'PageDown' }), 'PageDown');
  assert.ok(down({ key: ' ', code: 'Space' }), 'Space');
  assert.ok(down({ key: 'Backspace', code: 'Backspace' }), 'Backspace');
  assert.ok(down({ key: 'ArrowDown', code: 'ArrowDown' }), 'ArrowDown');
  assert.ok(down({ key: 'a', code: 'KeyA' }), 'a letter');
  assert.ok(!down({ key: 'r', code: 'KeyR', ctrlKey: true }), 'Ctrl+R');
  assert.ok(!down({ key: 'Tab', code: 'Tab', ctrlKey: true }), 'Ctrl+Tab');
  assert.ok(!down({ key: 'l', code: 'KeyL', metaKey: true }), 'Cmd+L');
  assert.ok(!down({ key: 'F5', code: 'F5' }), 'F5');
});

check('Buttons never take the focus: mousedown on them is prevented; a press queues the key (real TG.Input)', function () {
  const env = stubs.load();
  env.TG.Main.init();
  const jump = env.document.getElementById('btn-jump');
  const md = env.dispatchTo(jump, 'mousedown', {});
  assert.ok(md.defaultPrevented, 'mousedown');
  jump.focus();
  env.dispatchTo(jump, 'focus', {});
  assert.notStrictEqual(env.document.activeElement, jump, 'a focused button gives the focus back');
  env.dispatchTo(jump, 'pointerdown', { pointerId: 1 });
  assert.deepStrictEqual(stubs.plain(env.TG.Input.drain()), [{ type: 'down', key: 'jump' }]);
});

check('Boot: Shift, a digit or a click also counts as "any key"; the first input unlocks audio', function () {
  [{ key: 'Shift', code: 'ShiftLeft', shiftKey: true }, { key: '7', code: 'Digit7' }, 'click'].forEach(function (what) {
    const env = stubs.load();
    env.TG.Main.init();
    env.runFrame(0);
    assert.strictEqual(env.audio.contexts.length, 0, 'no AudioContext before the first input');
    if (what === 'click') env.dispatch('pointerdown', { target: env.document.body });
    else env.dispatch('keydown', what);
    env.runFrame(17);
    assert.strictEqual(env.TG.Game.state.screen, 'title', JSON.stringify(what));
    assert.strictEqual(env.audio.contexts.length, 1, 'audio unlocked by ' + JSON.stringify(what));
  });
});

// ---------------------------------------------------------------------------------------------
// G. The real modules, driven like a browser
// ---------------------------------------------------------------------------------------------

check('Real modules: boot -> title -> difficulty (typed) -> How to Play -> READY -> playing, with audio unlocked', function () {
  const s = shot.createSession({ canvas: 'stub' });
  const TG = s.TG;
  s.frames(3);
  assert.strictEqual(s.screen(), 'boot');
  s.press('enter');
  assert.strictEqual(s.screen(), 'title');
  assert.strictEqual(s.env.audio.contexts.length, 1);
  s.seconds(1.3);
  s.press('enter');
  assert.strictEqual(s.screen(), 'difficultySelect');
  s.type('hard');
  assert.strictEqual(s.screen(), 'howToPlay');
  assert.strictEqual(TG.Game.state.screenData.difficulty, 'hard');
  s.type('ready');
  assert.strictEqual(s.screen(), 'playing');
  assert.strictEqual(TG.Game.state.difficulty, 'hard');
  assert.strictEqual(TG.Save.getSetting('lastDifficulty'), 'hard');
  // The letters of READY do not reach the game: nothing has been typed in the run.
  s.frames(5);
  assert.strictEqual(TG.Game.state.typing.stats.correct + TG.Game.state.typing.stats.wrong, 0);
  assert.deepStrictEqual(s.env.errors, []);
});

check('Real modules: Esc pauses, RESUME counts down 1.5 s; blur pauses; restart from the pause menu continues', function () {
  const s = shot.createSession({ canvas: 'stub' });
  shot.startRun(s, 'medium');
  s.seconds(2);
  s.press('esc');
  assert.strictEqual(s.screen(), 'paused');
  s.press('enter');
  s.seconds(1.3);
  assert.strictEqual(s.screen(), 'paused');
  s.seconds(0.3);
  assert.strictEqual(s.screen(), 'playing');
  s.seconds(1);
  const suspends = s.env.audio.suspends;
  s.env.dispatch('blur', {});
  assert.strictEqual(s.screen(), 'paused');
  assert.strictEqual(s.env.audio.suspends, suspends + 1);
  s.env.dispatch('focus', {});
  s.press('down');
  s.press('enter');
  s.press('enter');
  assert.strictEqual(s.screen(), 'playing');
  assert.strictEqual(s.TG.Game.state.run.continues, 1);
  assert.deepStrictEqual(s.env.errors, []);
});

check('Real modules: game over, the 0.8 s lockout, then Enter continues from the checkpoint', function () {
  const s = shot.createSession({ canvas: 'stub' });
  shot.startRun(s, 'hard');
  assert.ok(shot.playUntil(s, 'gameOver', shot.createBot({ type: false }), 400), 'reached game over');
  s.seconds(0.4);
  s.press('enter');
  assert.strictEqual(s.screen(), 'gameOver');
  s.seconds(0.6);
  s.press('enter');
  assert.strictEqual(s.screen(), 'playing');
  assert.strictEqual(s.TG.Game.state.run.continues, 1);
  assert.deepStrictEqual(s.env.errors, []);
});

check('Real modules: a whole run on Easy to results, the tally, the high score entry and back to the title', function () {
  const s = shot.createSession({ canvas: 'stub' });
  const TG = s.TG;
  shot.startRun(s, 'easy');
  assert.ok(shot.playUntil(s, 'results', shot.createBot({ wpm: 70 }), 1500), 'reached results, the screen is ' + s.screen());
  s.frames(2);
  const res = TG.Game.state.result;
  assert.ok(res && res.cleared === true, 'the level was cleared');
  assert.ok(TG.Save.best('easy').wpm > 0, 'TG.Save.recordRun stored the best WPM');
  s.seconds(0.6);
  s.press('enter');                               // finish the tally
  s.press('enter');                               // page 2
  s.seconds(2);
  s.press('enter');
  assert.strictEqual(s.screen(), 'highScoreEntry', 'the score ' + res.score + ' qualifies');
  s.type('xyz');
  s.press('enter');
  assert.strictEqual(s.screen(), 'title');
  assert.strictEqual(TG.UI.panel, 'scores');
  const names = TG.Save.scores('easy').map(function (e) { return e.name; });
  assert.ok(names.indexOf('XYZ') !== -1, names.join(','));
  s.press('esc');
  assert.strictEqual(TG.UI.panel, 'menu');
  assert.deepStrictEqual(s.env.errors, []);
});

// Every screen drawn on the software canvas, which throws for anything outside the canvas subset.
shot.SCREENS.forEach(function (name) {
  check('Software canvas: the ' + name + ' screen draws without errors and fills the picture', function () {
    const s = shot.createSession({ canvas: 'soft' });
    shot.reach(s, name, { difficulty: 'medium' });
    s.frame();
    assert.strictEqual(s.screen(), name);
    assert.deepStrictEqual(s.env.errors, []);
    const rgba = s.env.canvas.toRGBA();
    let lit = 0;
    for (let i = 0; i < rgba.length; i += 4) if (rgba[i] + rgba[i + 1] + rgba[i + 2] > 120) lit++;
    assert.ok(lit > 500, 'only ' + lit + ' bright pixels');
  });
});

['options', 'scores', 'story'].forEach(function (panel) {
  check('Software canvas: the title ' + panel + ' panel draws without errors', function () {
    const s = shot.createSession({ canvas: 'soft' });
    shot.reach(s, 'title', { panel: panel });
    s.frame();
    assert.strictEqual(s.TG.UI.panel, panel);
    assert.deepStrictEqual(s.env.errors, []);
  });
});

check('tools/shot-ui.js writes a PNG of the requested size', function () {
  const os = require('os');
  const png = require('../tools/png');
  const out = path.join(os.tmpdir(), 'shot-ui-test-' + process.pid + '.png');
  try {
    const r = shot.shoot('difficultySelect', out, { scale: 2 });
    assert.deepStrictEqual(r.errors, []);
    const img = png.read(out);
    assert.strictEqual(img.width, 768);
    assert.strictEqual(img.height, 432);
  } finally {
    if (fs.existsSync(out)) fs.unlinkSync(out);
  }
  const error = console.error;
  console.error = function () {};
  try {
    assert.strictEqual(shot.main(['--screen', 'nowhere', '--out', out]), 1);
    assert.strictEqual(shot.main(['--out', out]), 1);
  } finally {
    console.error = error;
  }
});

console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + skipped + ' skipped');
process.exitCode = failed > 0 ? 1 : 0;
