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
  results: ['highScoreEntry', 'title', 'playing'],
  highScoreEntry: ['title']
};
const SIM = ['playing', 'lifeLost', 'bossIntro', 'boss', 'levelComplete'];

// A result in the shape of CONTRACT 5.11. stages follows cleared unless it is given: a run of one stage has
// cleared one stage exactly when that stage was cleared.
function fakeResult(over) {
  const r = Object.assign({
    cleared: true, levelId: 1, difficulty: 'medium', score: 48210, baseScore: 41210,
    bonuses: [{ id: 'lives', label: 'LIVES X3', points: 3000 }, { id: 'accuracy', label: 'ACCURACY 95%', points: 3000 },
      { id: 'nocontinue', label: 'NO CONTINUES', points: 2000 }],
    time: 301.4,
    typing: { wpm: 28.4, peakWpm: 35.1, accuracy: 0.954, correct: 412, wrong: 20, wordsCleared: 61, wordsClean: 48,
      wordsMissed: 3, bestCleanRun: 14, bestKeyStreak: 96, avgReaction: 0.82, practiseKeys: ['q', 'z'], slowKeys: ['p', 'b'] },
    ink: 131, livesLost: 2, lives: 3, continues: 0, rank: 'A', suggestion: null, bestWpm: 26, assist: 1, adaptive: true,
    stageScore: 0, stageTime: 301.4, bestScore: 0
  }, over || {});
  if (!over || over.stages === undefined) r.stages = r.cleared ? 1 : 0;
  return r;
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
    // As TG.Game.nextStage (CONTRACT 9.1): only from the results screen of a cleared stage with a level
    // after it. The result is gone once the run goes on.
    nextStage() {
      log.push(['nextStage']);
      const r = g.state.result;
      if (g.state.screen !== 'results' || !r || r.cleared !== true || !(TG.Levels && TG.Levels[r.levelId + 1])) return false;
      g.state.result = null;
      g.force('playing');
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
    setEnabled(kind, flag) { log.push(['setEnabled', kind, flag]); },
    music(name) { log.push(['music', name === undefined ? null : name]); }
  };
}

const FAKE_FILES = ['js/core.js', 'js/words.js', 'js/gfx.js', 'js/font.js', 'js/sprites-chars.js', 'js/sprites-world.js',
  'js/ui.js', 'js/main.js'];

// The same with js/board.js, loaded before js/ui.js as in the page (world scores).
const BOARD_FILES = FAKE_FILES.slice(0, FAKE_FILES.indexOf('js/ui.js')).concat(['js/board.js', 'js/ui.js', 'js/main.js']);

// The two level files, which only register their data in TG.Levels.
const LEVEL_FILES = ['js/levels/level1.js', 'js/levels/level2.js'];

// Loads the interface with fakes and starts it like the page does. opts: { storage, canvas, init, world, board, levels }.
//   world: a stand-in for the world scores service (shot.createWorld()). js/board.js is loaded, the
//          service's address is TG.Board.URL and its fetch is window.fetch before TG.Main.init();
//          TG.Board's clock is t.now (ms), which t.steps moves on with TG.Board.update, as a frame does.
//   board: true loads js/board.js and leaves TG.Board.URL empty, as the game is delivered.
//   levels: true also loads the level files, so that there is a Level 2 to unlock and to go on to. Without
//          them the interface has no level after Level 1 and behaves as it did before Level 2.
function fakeEnv(opts) {
  const o = opts || {};
  let files = o.world || o.board ? BOARD_FILES : FAKE_FILES;
  if (o.levels) files = files.slice(0, files.indexOf('js/sprites-world.js') + 1).concat(LEVEL_FILES, files.slice(files.indexOf('js/sprites-world.js') + 1));
  const env = stubs.load({ files: files, storage: o.storage || 'memory', canvas: o.canvas || 'stub' });
  const TG = env.TG;
  if (o.board) TG.Board.URL = '';
  if (o.world) {
    TG.Board.URL = o.world.url;
    env.window.fetch = o.world.fetch;
  }
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
  ['setSetting', 'addScore', 'recordRun', 'resetScores', 'setPending', 'clearPending', 'enterPending'].forEach(function (fn) {
    const orig = save[fn];
    save[fn] = function () {
      log.push([fn].concat(JSON.parse(JSON.stringify(Array.prototype.slice.call(arguments)))));
      return orig.apply(save, arguments);
    };
  });
  if (o.init !== false) TG.Main.init();
  const t = { env: env, TG: TG, log: log, game: game, input: input, audio: audio, world: o.world || null, now: 0 };
  if (o.world) TG.Board.init({ fetch: o.world.fetch, now: function () { return t.now; } });
  t.steps = function (n) {
    for (let i = 0; i < n; i++) {
      TG.Main.tick(DT);
      if (o.world) {
        t.now += 1000 * DT;
        TG.Board.update(DT);
      }
    }
  };
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

// The one outside script the page may load: Cloudflare Web Analytics (visits and referrers, no
// cookies), added at the owner's request. It comes last, so the game never waits for it.
const ANALYTICS_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';
const ANALYTICS_TAG = /<script type="module" src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js" data-cf-beacon='\{"token": "[0-9a-f]{32}"\}'><\/script>/;

check('index.html: the script tags are the 21 files of CONTRACT 1 in order, then the inline TG.Main.init(), then the analytics script', function () {
  const all = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) all.push({ attrs: m[1], body: m[2].trim() });
  // The analytics script: at most one, the last tag, exactly as Cloudflare gives it.
  const outside = all.filter(function (t) { return t.attrs.indexOf(ANALYTICS_SRC) !== -1; });
  assert.ok(outside.length <= 1, 'more than one analytics script');
  if (outside.length === 1) {
    assert.strictEqual(all[all.length - 1], outside[0], 'the analytics script is not the last script');
    assert.strictEqual((html.match(ANALYTICS_TAG) || []).length, 1, 'the analytics tag is not the expected one');
  }
  const tags = all.filter(function (t) { return outside.indexOf(t) === -1; });
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
  // The analytics tag is the one outside reference; everything else is held to the rule.
  const page = html.replace(ANALYTICS_TAG, '').replace(/<!-- Cloudflare Web Analytics[^>]*-->/, '');
  [page, css].forEach(function (text) {
    assert.ok(!/https?:/i.test(text), 'no http: or https:');
    assert.ok(!/(src|href)\s*=\s*"\/\//i.test(text), 'no protocol-relative URL');
    assert.ok(!/@import|@font-face/i.test(text), 'no @import or web font');
  });
  assert.ok(!/url\(/i.test(css), 'no url() in the stylesheet');
  const refs = [];
  const re = /\b(src|href)\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = re.exec(page))) refs.push(m[2]);
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
  assert.ok('page' in TG.UI);
  assert.strictEqual(TG.UI.page, null);
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

check('TG.UI.panel: menu, options, scores and story (after 12 s idle) on the title, null elsewhere (bye: see the EXIT checks)', function () {
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

// The same calls as boxes in canvas px: { text, x, y, w, h, color }, x and y the top-left corner.
function textBoxes(TG, fn) {
  const seen = [];
  const draw = TG.Font.draw;
  TG.Font.draw = function (ctx, text, x, y, opts) {
    const o = opts || {};
    const scale = o.scale || 1;
    const w = String(text).length * 8 * scale;
    const left = Math.floor(x) - (o.align === 'center' ? Math.floor(w / 2) : (o.align === 'right' ? w : 0));
    seen.push({ text: String(text), x: left, y: Math.floor(y), w: w, h: 8 * scale, color: o.color });
    return draw.apply(TG.Font, arguments);
  };
  try { fn(); } finally { TG.Font.draw = draw; }
  return seen;
}

// From boot to the title menu with the logo stamped.
function toMenu(t) {
  t.press('enter');
  t.seconds(1.3);
  assert.strictEqual(t.TG.UI.panel, 'menu');
}

// From the title menu with START selected: Up wraps round to EXIT, the last item, and Enter chooses it.
function chooseExit(t) {
  t.press('up');
  t.press('enter');
}

// The copyright line as the screens show it. js/ui.js holds it in one constant and README.md ends
// with it (see the check below), so a new year is changed in those two files and here.
const COPYRIGHT = '\u00a9 2026 DAVID SLEE';

check('Title menu: START, HOW TO PLAY, HIGH SCORES, OPTIONS and EXIT, in that order; the box clears the logo, the ground and the bottom strip', function () {
  const t = fakeEnv({ canvas: 'soft' });
  toMenu(t);
  const ctx = t.env.canvas.getContext('2d');
  const boxes = textBoxes(t.TG, function () { t.TG.UI.draw(ctx, t.game.state); });
  const labels = ['START', 'HOW TO PLAY', 'HIGH SCORES', 'OPTIONS', 'EXIT'];
  const rows = boxes.filter(function (b) { return labels.indexOf(b.text) !== -1; });
  assert.deepStrictEqual(rows.map(function (b) { return b.text; }), labels);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].y >= rows[i - 1].y + 10, labels[i] + ' is too close to the row above');
  // The box is the longest run of its SILVER border in the column of its left edge.
  const rgba = t.env.canvas.toRGBA();
  const silver = t.TG.PAL[3].toLowerCase(), ink = t.TG.PAL[0].toLowerCase();
  const px = function (x, y) {
    const o = (y * 384 + x) * 4;
    return '#' + [rgba[o], rgba[o + 1], rgba[o + 2]].map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  };
  const left = rows[0].x - 20;                   // menuRow: the label is 16 px into the row, the row 4 px into the box
  let top = 0, bottom = -1, start = -1;
  for (let y = 0; y <= 216; y++) {
    const on = y < 216 && px(left, y) === silver;
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      if (y - start > bottom - top + 1) { top = start; bottom = y - 1; }
      start = -1;
    }
  }
  assert.ok(bottom - top + 1 >= 5 * 12, 'no menu box found at x ' + left + ' (' + top + ' to ' + bottom + ')');
  assert.ok(top > 48 + 32 + 3, 'the box starts at y ' + top + ', on the logo and its shadow');
  assert.ok(bottom < 184 - 8, 'the box ends at y ' + bottom + ', on the ground');
  assert.ok(rows[0].y > top + 4 && rows[4].y + 8 < bottom - 2, 'a row is outside the box');
  // The bottom strip is INK from its top to the bottom of the screen; the hint line is inside it.
  const hint = boxes.filter(function (b) { return b.text === 'UP AND DOWN TO CHOOSE, ENTER TO SELECT'; });
  assert.strictEqual(hint.length, 1);
  assert.ok(hint[0].y > 184 + 8 && hint[0].x >= 0 && hint[0].x + hint[0].w <= 384, 'the hint line is on the ground or off the screen');
  for (let y = hint[0].y - 2; y < 216; y++) assert.strictEqual(px(2, y), ink, 'the strip is not INK at y ' + y);
  assert.notStrictEqual(px(2, 184 + 2), ink, 'the ground line is covered');
  // Down from START reaches EXIT in four steps and START again in five.
  for (let i = 0; i < 5; i++) t.press('down');
  t.press('enter');
  assert.strictEqual(t.screen(), 'difficultySelect', 'five times Down did not come back to START');
});

check('EXIT emits ui:exit once, shows the goodbye panel and stops the title music; Esc on the menu does not exit', function () {
  const t = fakeEnv();
  const ui = eventLog(t.TG);
  const exits = function () { return ui.filter(function (e) { return e.name === 'ui:exit'; }).length; };
  toMenu(t);
  t.press('esc');                                // Esc on START
  for (let i = 0; i < 4; i++) t.press('down');   // EXIT
  t.press('esc');                                // Esc on EXIT
  t.press('backspace');
  t.type('x');
  assert.strictEqual(exits(), 0, 'Esc, Backspace or a letter chose EXIT');
  assert.strictEqual(t.TG.UI.panel, 'menu');
  assert.deepStrictEqual(t.calls('music'), []);
  t.press('enter');
  assert.strictEqual(exits(), 1);
  assert.deepStrictEqual(ui.slice(-2).map(function (e) { return e.name; }), ['ui:select', 'ui:exit']);
  assert.deepStrictEqual(ui[ui.length - 1].p, {});
  assert.strictEqual(t.TG.UI.panel, 'bye');
  assert.strictEqual(t.screen(), 'title', 'the goodbye screen is a panel of the title screen');
  assert.strictEqual(t.calls('setScreen').length, 1, 'EXIT asked TG.Game for a screen change');
  assert.deepStrictEqual(t.calls('music'), [['music', null]], 'the title music was not stopped');
  const texts = textsDrawn(t.TG, function () { t.TG.UI.draw(t.env.canvas.getContext('2d'), t.game.state); });
  ['THANKS FOR PLAYING!', 'YOU CAN CLOSE THIS TAB NOW.', 'PRESS ANY KEY TO PLAY AGAIN', COPYRIGHT].forEach(function (line) {
    assert.ok(texts.indexOf(line) !== -1, 'the goodbye screen does not say "' + line + '": ' + texts.join('|'));
  });
  assert.ok(texts.indexOf('START') === -1, 'the menu is still drawn');
  t.seconds(2);
  assert.strictEqual(exits(), 1, 'ui:exit was emitted again');
  assert.deepStrictEqual(t.env.errors, []);
});

check('Goodbye screen: keys are ignored for 0.5 s, then any key returns to the menu with START selected and the title music back', function () {
  ['enter', 'space', 'esc', 'down', 'backspace', 'q'].forEach(function (key) {
    const t = fakeEnv();
    const ui = eventLog(t.TG);
    toMenu(t);
    t.input.press('up');
    t.input.press('enter');                      // EXIT ...
    t.input.press('enter');                      // ... and a second key in the same step, which is dropped
    t.steps(1);
    assert.strictEqual(t.TG.UI.panel, 'bye', 'a key of the same step closed the goodbye screen');
    t.seconds(0.2);
    t.press('enter');
    assert.strictEqual(t.TG.UI.panel, 'bye', 'a key in the first 0.5 s closed the goodbye screen');
    t.seconds(0.4);
    if (key.length === 1) t.type(key);
    else t.press(key);
    assert.strictEqual(t.TG.UI.panel, 'menu', key);
    assert.strictEqual(t.screen(), 'title');
    assert.deepStrictEqual(t.calls('music'), [['music', null], ['music', 'title']], key);
    assert.strictEqual(ui.filter(function (e) { return e.name === 'ui:exit'; }).length, 1);
    t.press('enter');                            // START is selected again, not EXIT
    assert.strictEqual(t.screen(), 'difficultySelect', key);
    assert.strictEqual(ui.filter(function (e) { return e.name === 'ui:exit'; }).length, 1);
  });
});

check('Goodbye screen: the idle rotation does not replace it, and the 12 s start again after the return to the menu', function () {
  const t = fakeEnv();
  toMenu(t);
  t.seconds(10);                                 // nearly idle on the menu
  chooseExit(t);
  t.seconds(60);
  assert.strictEqual(t.TG.UI.panel, 'bye', 'the idle rotation started on the goodbye screen');
  t.press('enter');
  assert.strictEqual(t.TG.UI.panel, 'menu');
  t.seconds(11.5);
  assert.strictEqual(t.TG.UI.panel, 'menu', 'the idle time of before EXIT was kept');
  t.seconds(1);
  assert.strictEqual(t.TG.UI.panel, 'story');
});

check('The copyright line is on the boot screen, the title menu, the story panel and the goodbye screen, clear of every other line, on plain INK', function () {
  const t = fakeEnv({ canvas: 'soft' });
  const ctx = t.env.canvas.getContext('2d');
  const ink = t.TG.PAL[0].toLowerCase(), silver = t.TG.PAL[3].toLowerCase();
  function look(where, expected) {
    const boxes = textBoxes(t.TG, function () { t.TG.UI.draw(ctx, t.game.state); });
    const lines = boxes.filter(function (b) { return b.text === COPYRIGHT; });
    assert.strictEqual(lines.length, expected, where + ': the copyright line is drawn ' + lines.length + ' times');
    if (expected === 0) return boxes;
    const c = lines[0];
    assert.strictEqual(c.w, 17 * 8);
    assert.ok(c.x === (384 - c.w) / 2 && c.y >= 200 && c.y + 8 <= 216, where + ': at ' + c.x + ',' + c.y);
    boxes.forEach(function (b) {
      if (b === c) return;
      const apart = b.x + b.w <= c.x || c.x + c.w <= b.x || b.y + b.h + 1 <= c.y || c.y + c.h <= b.y;
      assert.ok(apart, where + ': "' + b.text + '" is on the copyright line');
    });
    // Only the letters and INK in the line's box and 2 px round it: no scenery, panel or sprite under it.
    const rgba = t.env.canvas.toRGBA();
    let lit = 0;
    for (let y = c.y - 2; y < Math.min(216, c.y + 9); y++) for (let x = c.x - 2; x < c.x + c.w + 2; x++) {
      const o = (y * 384 + x) * 4;
      const hex = '#' + [rgba[o], rgba[o + 1], rgba[o + 2]].map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
      assert.ok(hex === ink || hex === silver, where + ': ' + hex + ' at ' + x + ',' + y);
      if (hex === silver) lit++;
    }
    assert.ok(lit > 150, where + ': the line has only ' + lit + ' pixels');
    return boxes;
  }
  const NOTE = 'SPELL RUNNER NEEDS A KEYBOARD.';
  const has = function (boxes, text) { return boxes.some(function (b) { return b.text === text; }); };
  t.steps(10);                                   // 'PRESS ANY KEY' is in the lit part of its blink
  assert.ok(has(look('boot', 1), 'PRESS ANY KEY'));
  t.env.dispatch('pointerdown', { pointerType: 'touch', target: t.env.document.getElementById('btn-jump') });
  assert.ok(has(look('boot with the keyboard note', 1), NOTE));
  t.press('enter');
  t.steps(20);
  assert.strictEqual(t.screen(), 'title');
  assert.ok(!has(look('title while the logo is stamped', 1), 'START'));
  t.seconds(1.3);
  let boxes = look('title menu with the keyboard note', 1);
  assert.ok(has(boxes, NOTE) && has(boxes, 'EXIT'));
  t.env.dispatch('keydown', { key: 'Shift', code: 'ShiftLeft', shiftKey: true });   // the first key takes the note away
  boxes = look('title menu', 1);
  assert.ok(has(boxes, 'UP AND DOWN TO CHOOSE, ENTER TO SELECT') && !has(boxes, NOTE));
  chooseExit(t);
  t.seconds(0.6);
  assert.ok(has(look('goodbye', 1), 'THANKS FOR PLAYING!'));
  t.press('enter');
  t.seconds(12.5);
  assert.strictEqual(t.TG.UI.panel, 'story');
  look('story', 1);
  t.press('enter');
  t.press('down');
  t.press('down');
  t.press('enter');
  assert.strictEqual(t.TG.UI.panel, 'scores');
  look('high scores (a panel that fills the screen)', 0);
  t.press('esc');
  t.press('down');
  t.press('enter');
  assert.strictEqual(t.TG.UI.panel, 'options');
  look('options (a panel that fills the screen)', 0);
  assert.deepStrictEqual(t.env.errors, []);
});

check('The copyright text is in one place in the code, and README.md ends with it', function () {
  const hits = stubs.FILES.filter(function (f) { return /DAVID SLEE|David Slee/.test(read(f)); });
  assert.deepStrictEqual(hits, ['js/ui.js']);
  const ui = read('js/ui.js');
  assert.strictEqual(ui.match(/DAVID SLEE/g).length, 1, 'the name is written more than once in js/ui.js');
  assert.ok(ui.indexOf('var COPYRIGHT = \'\\u00a9' + COPYRIGHT.slice(1) + '\';') !== -1, 'js/ui.js has no constant COPYRIGHT with the text ' + COPYRIGHT.slice(2));
  const last = read('README.md').replace(/\n+$/, '').split('\n').pop();
  assert.strictEqual(last.charAt(0), '\u00a9', 'README.md does not end with the copyright line: ' + last);
  assert.strictEqual(last.toUpperCase(), COPYRIGHT);
});

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

check('ui:exit: TG.Main calls window.close() once; a close that throws, and a window without close, leave the goodbye screen and no error', function () {
  // The browser accepts the call (in a real tab it then does nothing, or closes a window a script opened).
  let t = fakeEnv();
  let closes = 0;
  t.env.window.close = function () { closes++; };
  toMenu(t);
  t.press('down');
  t.press('up');
  assert.strictEqual(closes, 0, 'window.close was called before EXIT was chosen');
  chooseExit(t);
  assert.strictEqual(closes, 1);
  assert.strictEqual(t.TG.UI.panel, 'bye');
  t.seconds(0.6);
  t.press('enter');
  assert.strictEqual(closes, 1, 'window.close was called again on the way back to the menu');
  chooseExit(t);
  assert.strictEqual(closes, 2, 'a second EXIT did not try again');
  assert.deepStrictEqual(t.env.errors, []);
  // The call throws.
  t = fakeEnv();
  t.env.window.close = function () { closes += 10; throw new Error('SecurityError: this window was not opened by a script'); };
  toMenu(t);
  chooseExit(t);
  assert.strictEqual(closes, 12);
  assert.strictEqual(t.TG.UI.panel, 'bye');
  assert.deepStrictEqual(t.env.errors, [], 'the exception of window.close was not caught');
  t.seconds(0.6);
  t.press('enter');
  assert.strictEqual(t.TG.UI.panel, 'menu', 'the game does not go on after a close that throws');
  // The window has no close function at all (the stubs' default).
  t = fakeEnv();
  assert.strictEqual(typeof t.env.window.close, 'undefined');
  toMenu(t);
  chooseExit(t);
  assert.strictEqual(t.TG.UI.panel, 'bye');
  t.seconds(1);
  assert.deepStrictEqual(t.env.errors, []);
  // TG.UI on its own never touches the window: without TG.Main listening, nothing is closed.
  t = fakeEnv({ init: false });
  let alone = 0;
  t.env.window.close = function () { alone++; };
  t.TG.UI.init();
  t.game.init();
  const step = function (n) { for (let i = 0; i < n; i++) t.TG.UI.update(DT); };
  t.input.press('enter');
  step(80);
  t.input.press('up');
  step(1);
  t.input.press('enter');
  step(1);
  assert.strictEqual(t.TG.UI.panel, 'bye');
  assert.strictEqual(alone, 0, 'TG.UI closed the window itself');
  const code = function (f) { return read(f).replace(/\/\/.*$/gm, ''); };
  assert.ok(!/\.close\s*\(/.test(code('js/ui.js')), 'js/ui.js calls close()');
  assert.strictEqual(code('js/main.js').match(/\.close\s*\(/g).length, 1, 'js/main.js calls close() in one place');
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

// The semicolon key as a browser reports it: plain, with Shift, and on a layout that has another
// character there (German). TG.Input queues all three as 'semicolon' (CONTRACT 4.12).
const SEMICOLON_KEYS = [{ key: ';', code: 'Semicolon' }, { key: ':', code: 'Semicolon', shiftKey: true }, { key: '\u00f6', code: 'Semicolon' }];

check('Boot: Shift, a digit, the semicolon key or a click also counts as "any key"; the first input unlocks audio', function () {
  [{ key: 'Shift', code: 'ShiftLeft', shiftKey: true }, { key: '7', code: 'Digit7' }, 'click'].concat(SEMICOLON_KEYS).forEach(function (what) {
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
  s.press('esc');                                 // the strip: TITLE ends the run here (Enter is NEXT STAGE)
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

check('Real modules: EXIT stops the title loop and shows the goodbye screen; a key, Shift, a digit, the semicolon key or a click brings the menu and the loop back', function () {
  ['enter', { key: 'Shift', code: 'ShiftLeft', shiftKey: true }, { key: '7', code: 'Digit7' }, 'click'].concat(SEMICOLON_KEYS).forEach(function (what) {
    const s = shot.createSession({ canvas: 'stub' });
    const TG = s.TG;
    const name = JSON.stringify(what);
    const loop = function () { return TG.Audio._internals.sequencer('loop'); };
    let closes = 0;
    s.env.window.close = function () { closes++; };
    const exits = [];
    TG.Events.on('ui:exit', function (p) { exits.push(p); });
    s.frames(2);
    s.press('enter');
    s.seconds(1.3);
    assert.ok(loop().playing && loop().name === 'title', 'the title loop is not playing on the menu');
    s.press('esc');
    assert.strictEqual(TG.UI.panel, 'menu');
    s.press('up');
    s.press('enter');
    assert.strictEqual(TG.UI.panel, 'bye');
    assert.strictEqual(s.screen(), 'title');
    assert.strictEqual(exits.length, 1);
    assert.strictEqual(closes, 1, 'TG.Main did not call window.close()');
    assert.strictEqual(loop().playing, false, 'the title loop goes on under the goodbye screen');
    s.seconds(20);                                // well past the idle time of the menu
    assert.strictEqual(TG.UI.panel, 'bye');
    assert.strictEqual(loop().playing, false);
    if (what === 'click') s.env.dispatch('pointerdown', { target: s.env.document.body });
    else if (typeof what === 'string') s.key(what);
    else {
      s.env.dispatch('keydown', what);
      s.env.dispatch('keyup', what);
    }
    s.frame();
    assert.strictEqual(TG.UI.panel, 'menu', name + ' did not close the goodbye screen');
    assert.ok(loop().playing && loop().name === 'title', 'the title loop did not start again after ' + name);
    s.press('enter');
    assert.strictEqual(s.screen(), 'difficultySelect', 'START is not selected after ' + name);
    assert.strictEqual(exits.length, 1);
    assert.strictEqual(closes, 1);
    assert.deepStrictEqual(s.env.errors, []);
    assert.deepStrictEqual(s.env.warnings, []);
  });
});

check('Real modules: every kind of key leaves the boot screen and the goodbye screen; bare modifiers, function keys and Ctrl combinations do not', function () {
  // One event for each key name TG.Input can queue (CONTRACT 4.12), then keys it does not queue.
  const ANY = [
    { key: 'Enter', code: 'Enter' }, { key: ' ', code: 'Space' }, { key: 'Escape', code: 'Escape' },
    { key: 'ArrowUp', code: 'ArrowUp' }, { key: 'ArrowDown', code: 'ArrowDown' },
    { key: 'ArrowLeft', code: 'ArrowLeft' }, { key: 'ArrowRight', code: 'ArrowRight' },
    { key: 'Backspace', code: 'Backspace' }, { key: 'q', code: 'KeyQ' }, { key: '\u0444', code: 'KeyA' }
  ].concat(SEMICOLON_KEYS, [
    { key: 'Tab', code: 'Tab' }, { key: 'CapsLock', code: 'CapsLock' }, { key: 'Shift', code: 'ShiftRight', shiftKey: true },
    { key: '0', code: 'Digit0' }, { key: ',', code: 'Comma' }, { key: '\'', code: 'Quote' }, { key: 'Delete', code: 'Delete' }
  ]);
  const NOT = [
    { key: 'Control', code: 'ControlLeft', ctrlKey: true }, { key: 'Alt', code: 'AltLeft', altKey: true },
    { key: 'Meta', code: 'MetaLeft', metaKey: true }, { key: 'F5', code: 'F5' }, { key: 'F11', code: 'F11' },
    { key: ';', code: 'Semicolon', ctrlKey: true }, { key: ';', code: 'Semicolon', repeat: true },
    { key: 'Dead', code: 'BracketLeft' }
  ];
  ANY.concat(NOT).forEach(function (init) {
    const want = ANY.indexOf(init) !== -1;
    const name = JSON.stringify(init);
    const tap = function (s) {
      s.env.dispatch('keydown', init);
      s.env.dispatch('keyup', init);
      s.frame();
    };
    const b = shot.createSession({ canvas: 'stub' });
    b.frames(2);
    tap(b);
    assert.strictEqual(b.screen(), want ? 'title' : 'boot', 'boot: ' + name);
    assert.deepStrictEqual(b.env.errors, []);
    const s = shot.createSession({ canvas: 'stub' });
    s.frames(2);
    s.press('enter');
    s.seconds(1.3);
    s.press('up');
    s.press('enter');
    s.seconds(0.6);
    assert.strictEqual(s.TG.UI.panel, 'bye');
    tap(s);
    assert.strictEqual(s.TG.UI.panel, want ? 'menu' : 'bye', 'goodbye: ' + name);
    assert.strictEqual(s.screen(), 'title', name);
    assert.deepStrictEqual(s.env.errors, []);
  });
});

check('Real modules: the semicolon key is "any key" only on the boot and goodbye screens; on the menu and in play it presses nothing else', function () {
  SEMICOLON_KEYS.forEach(function (init) {
    const s = shot.createSession({ canvas: 'stub' });
    const TG = s.TG;
    const name = JSON.stringify(init);
    const tap = function () {
      s.env.dispatch('keydown', init);
      s.env.dispatch('keyup', init);
      s.frame();
    };
    const exits = [];
    TG.Events.on('ui:exit', function (p) { exits.push(p); });
    s.frames(2);
    s.press('enter');
    s.seconds(1.3);
    // Title menu: START is selected, and an Enter passed on by TG.Main would open the difficulty screen.
    tap();
    assert.strictEqual(s.screen(), 'title', name + ' acted on the title menu');
    assert.strictEqual(TG.UI.panel, 'menu', name);
    // Goodbye screen, inside the first 0.5 s: ignored like every other key.
    s.press('up');
    s.press('enter');
    assert.strictEqual(TG.UI.panel, 'bye');
    s.seconds(0.2);
    tap();
    assert.strictEqual(TG.UI.panel, 'bye', name + ' closed the goodbye screen inside the first 0.5 s');
    s.seconds(0.4);
    tap();
    assert.strictEqual(TG.UI.panel, 'menu', name + ' did not close the goodbye screen');
    assert.strictEqual(exits.length, 1);
    // In play the key only ducks: TG.Main queues no Enter of its own.
    s.press('enter');
    s.type('easy');
    s.type('ready');
    assert.strictEqual(s.screen(), 'playing');
    TG.Input.drain();
    s.env.dispatch('keydown', init);
    assert.deepStrictEqual(stubs.plain(TG.Input.drain()), [{ type: 'down', key: 'semicolon' }], name);
    s.env.dispatch('keyup', init);
    assert.deepStrictEqual(s.env.errors, []);
    assert.deepStrictEqual(s.env.warnings, []);
  });
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

['options', 'scores', 'story', 'bye'].forEach(function (panel) {
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

// ---------------------------------------------------------------------------------------------
// H. World scores (docs/LEADERBOARD.md section 9, CONTRACT 4.20 and 4.22)
// ---------------------------------------------------------------------------------------------
//
// The interface with js/board.js and the stand-in service of tools/shot-ui.js, which answers at once
// and makes no network request. The game is the fake of section D, so each check sets the result it
// needs.

const GOLD = 18, CORAL = 26, WHITE = 4, SILVER = 3, STONE = 2;

function worldEnv(opts) {
  const o = opts || {};
  return fakeEnv(Object.assign({ world: shot.createWorld(o.lists ? { lists: o.lists } : {}) }, o));
}

// What one frame draws: { text, x, y, w, h, color } per piece of text.
function drawnBoxes(t) {
  const ctx = t.env.canvas.getContext('2d');
  return textBoxes(t.TG, function () { t.TG.UI.draw(ctx, t.game.state); });
}

function drawnTexts(t) {
  return drawnBoxes(t).map(function (b) { return b.text; });
}

// Every piece of text is on the screen; scale 1 text keeps 8 px from the sides of a panel that is as
// wide as the screen.
function assertFits(boxes, what) {
  boxes.forEach(function (b) {
    assert.ok(b.x >= 0 && b.x + b.w <= 384 && b.y >= 0 && b.y + b.h <= 216, what + ': "' + b.text + '" at ' + b.x + ', ' + b.y + ' is ' + b.w + ' px wide');
  });
}

// No two pieces of text share pixels.
function assertApart(boxes, what) {
  for (let i = 0; i < boxes.length; i++) {
    for (let k = i + 1; k < boxes.length; k++) {
      const a = boxes[i], b = boxes[k];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, what + ': "' + a.text + '" and "' + b.text + '" overlap');
    }
  }
}

// From the title menu with START selected (also while the logo is still being stamped): START, the
// difficulty typed, READY typed. The fake game is then on `playing`. Confirming the difficulty is
// where the run token is asked for.
function startFakeRun(t, difficulty) {
  t.seconds(1.3);                                // after a run the logo is stamped again
  t.press('enter');
  assert.strictEqual(t.screen(), 'difficultySelect');
  t.type(difficulty);
  assert.strictEqual(t.screen(), 'howToPlay');
  t.type('ready');
  assert.strictEqual(t.screen(), 'playing');
}

// The run ends with this result; Enter through the two results pages. Returns the screen that follows.
// On the initials screen it waits until Enter and Esc are read (0.5 s while world scores are on), unless
// wait is false.
function endFakeRun(t, result, wait) {
  t.game.state.result = result;
  t.game.force('results');
  t.seconds(6);
  t.press('enter');
  t.seconds(3);
  t.press('enter');
  if (wait !== false && t.screen() === 'highScoreEntry') t.seconds(0.6);
  return t.screen();
}

function sends(t) {
  return t.world.calls.filter(function (c) { return c.method === 'POST' && c.path === '/v1/scores'; });
}

function tokens(t) {
  return t.world.calls.filter(function (c) { return c.path === '/v1/runs'; });
}

function gets(t) {
  return t.world.calls.filter(function (c) { return c.method === 'GET'; });
}

const LOW = { score: 900, baseScore: 900, bonuses: [], cleared: false, rank: 'C' };   // under every seeded score

// ----- unchanged without world scores ----------------------------------------------------------

const TODAY_SCORES = [
  ['HIGH SCORES', 14], ['EASY', 38], ['MEDIUM', 38], ['HARD', 38],
  ['1 PIP 0016000', 54], ['18 WPM 96% A', 64], ['5 CAP 0003000', 158], ['9 WPM 88% B', 168],
  ['1 PIP 0040000', 54], ['5 CAP 0014000', 158], ['ENTER OR ESC: BACK', 196]
];
const TODAY_OPTIONS = ['OPTIONS', 'MUSIC', 'ON', 'SOUND EFFECTS', 'ON', 'CRT EFFECT', 'AUTO', 'REDUCE FLASH', 'OFF', 'KEY GUIDE', 'AUTO',
  'ADAPTIVE PACE', 'ON', 'RESET SCORES', 'BACK', 'THE CHIPTUNE MUSIC.', 'EASY WORDS ASSUME A QWERTY KEYBOARD', 'ENTER OR ARROWS: CHANGE   ESC: BACK'];

[['without js/board.js', {}], ['with js/board.js and an empty TG.Board.URL', { board: true }]].forEach(function (kind) {
  check('World scores off (' + kind[0] + '): the High Scores and Options panels are the ones from before, line for line', function () {
    let fetched = 0;
    const t = fakeEnv(Object.assign({ canvas: 'soft', init: false }, kind[1]));
    t.env.window.fetch = function () { fetched++; };   // a browser has fetch; the game must not use it
    t.TG.Main.init();
    toMenu(t);
    t.press('down'); t.press('down'); t.press('enter');
    assert.strictEqual(t.TG.UI.panel, 'scores');
    assert.strictEqual(t.TG.UI.page, null);
    const scores = drawnBoxes(t);
    assert.strictEqual(scores.length, 1 + 3 + 3 * 5 * 2 + 1, 'the title, three labels, fifteen entries of two lines and the footer');
    TODAY_SCORES.forEach(function (want) {
      assert.ok(scores.some(function (b) { return b.text === want[0] && b.y === want[1]; }), '"' + want[0] + '" at y ' + want[1]);
    });
    t.press('left'); t.press('right'); t.press('right');
    assert.strictEqual(t.TG.UI.panel, 'scores', 'Left and Right do nothing on the panel');
    assert.deepStrictEqual(drawnBoxes(t).map(function (b) { return b.text + '@' + b.x + ',' + b.y; }),
      scores.map(function (b) { return b.text + '@' + b.x + ',' + b.y; }));
    t.press('esc');
    t.press('down'); t.press('enter');
    assert.strictEqual(t.TG.UI.panel, 'options');
    const options = drawnBoxes(t);
    assert.deepStrictEqual(options.map(function (b) { return b.text; }).filter(function (x) { return x !== '>'; }), TODAY_OPTIONS);
    const rows = options.filter(function (b) { return ['MUSIC', 'SOUND EFFECTS', 'CRT EFFECT', 'REDUCE FLASH', 'KEY GUIDE', 'ADAPTIVE PACE', 'RESET SCORES', 'BACK'].indexOf(b.text) !== -1; });
    assert.deepStrictEqual(rows.map(function (b) { return b.y; }), [44, 57, 70, 83, 96, 109, 122, 135], 'eight lines from y 44, 13 px apart');
    assert.strictEqual(fetched, 0);
  });
});

check('World scores off: the results and initials screens follow the old rule, blocked initials are accepted, and nothing is asked of TG.Board', function () {
  [{}, { board: true }].forEach(function (kind) {
    const t = fakeEnv(kind);
    toMenu(t);
    startFakeRun(t, 'medium');
    assert.strictEqual(endFakeRun(t, fakeResult(LOW)), 'title', 'a score under the top five goes back to the title');
    assert.strictEqual(t.TG.UI.panel, 'menu');
    startFakeRun(t, 'medium');
    assert.strictEqual(endFakeRun(t, fakeResult({ score: 99999 })), 'highScoreEntry');
    const texts = drawnTexts(t);
    assert.ok(texts.indexOf('NEW HIGH SCORE!') !== -1);
    assert.ok(texts.indexOf('INITIALS AND SCORE ALSO GO TO WORLD SCORES') === -1);
    assert.ok(drawnBoxes(t).some(function (b) { return b.text === '2  PIP  0040000' && b.y === 144; }), 'the table rows are 12 px apart from y 132');
    t.type('ass');
    t.press('enter');
    assert.strictEqual(t.screen(), 'title');
    assert.strictEqual(t.TG.Save.scores('medium')[0].name, 'ASS', 'the block list is for the world scores only');
    assert.strictEqual(t.TG.UI.panel, 'scores');
    assert.strictEqual(t.TG.UI.page, null);
    if (t.TG.Board) {
      assert.strictEqual(t.TG.Board.state.boards, 'off');
      assert.strictEqual(t.TG.Board.state.send, 'none');
    }
    assert.deepStrictEqual(t.env.errors, []);
  });
});

// ----- Options -------------------------------------------------------------------------------

check('Options with world scores: a WORLD SCORES line (ON / OFF) with the note SENDS YOUR INITIALS AND SCORE; nine lines that fit', function () {
  const t = worldEnv({ canvas: 'soft' });
  toMenu(t);
  t.press('down'); t.press('down'); t.press('down'); t.press('enter');
  assert.strictEqual(t.TG.UI.panel, 'options');
  let boxes = drawnBoxes(t);
  const labels = ['MUSIC', 'SOUND EFFECTS', 'CRT EFFECT', 'REDUCE FLASH', 'KEY GUIDE', 'ADAPTIVE PACE', 'WORLD SCORES', 'RESET SCORES', 'BACK'];
  const rows = boxes.filter(function (b) { return labels.indexOf(b.text) !== -1; });
  assert.deepStrictEqual(rows.map(function (b) { return b.text; }), labels);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].y - rows[i - 1].y >= 11, labels[i] + ' is too close to the line above');
  assert.ok(boxes.every(function (b) { return b.text !== 'SENDS YOUR INITIALS AND SCORE'; }), 'the note belongs to the WORLD SCORES line');
  for (let i = 0; i < 6; i++) t.press('down');
  boxes = drawnBoxes(t).filter(function (b) { return b.text !== '>'; });
  const line = boxes.filter(function (b) { return b.text === 'WORLD SCORES'; })[0];
  assert.strictEqual(line.color, GOLD, 'the line is selected');
  const value = boxes.filter(function (b) { return b.y === line.y && b.text !== 'WORLD SCORES'; });
  assert.deepStrictEqual(value.map(function (b) { return b.text; }), ['ON'], 'on by default');
  const note = boxes.filter(function (b) { return b.text === 'SENDS YOUR INITIALS AND SCORE'; });
  assert.strictEqual(note.length, 1);
  const back = boxes.filter(function (b) { return b.text === 'BACK'; })[0];
  assert.ok(note[0].y >= back.y + 8 + 8, 'the note is ' + (note[0].y - back.y - 8) + ' px under BACK');
  assertFits(boxes, 'options');
  assertApart(boxes, 'options');
  boxes.forEach(function (b) { assert.ok(b.x >= 32 + 4 && b.x + b.w <= 352 - 4, '"' + b.text + '" is outside the panel'); });
  // Enter, Left and Right change it, and it is saved.
  t.press('enter');
  assert.strictEqual(t.TG.Save.getSetting('worldScores'), false);
  assert.deepStrictEqual(t.calls('setSetting').pop(), ['setSetting', 'worldScores', false]);
  assert.strictEqual(t.TG.Board.enabled(), false);
  assert.ok(drawnBoxes(t).some(function (b) { return b.text === 'OFF' && b.y === line.y; }));
  t.press('right');
  assert.strictEqual(t.TG.Save.getSetting('worldScores'), true);
  t.press('left');
  assert.strictEqual(t.TG.Save.getSetting('worldScores'), false);
  // The line stays while the setting is off, so that it can be switched on again.
  t.press('esc');
  t.press('enter');
  assert.ok(drawnTexts(t).indexOf('WORLD SCORES') !== -1);
  // Down from MUSIC reaches BACK in eight steps.
  for (let i = 0; i < 8; i++) t.press('down');
  t.press('enter');
  assert.strictEqual(t.TG.UI.panel, 'menu');
  assert.strictEqual(t.world.calls.length, 0, 'the Options panel made a request');
  assert.deepStrictEqual(t.env.errors, []);
});

check('Options: RESET SCORES still asks twice and BACK still leaves, one line further down', function () {
  const t = worldEnv();
  toMenu(t);
  t.press('down'); t.press('down'); t.press('down'); t.press('enter');
  for (let i = 0; i < 7; i++) t.press('down');
  t.press('enter');
  assert.strictEqual(t.calls('resetScores').length, 0);
  assert.ok(drawnTexts(t).indexOf('PRESS ENTER AGAIN TO CLEAR THE SCORES.') !== -1);
  t.press('enter');
  assert.strictEqual(t.calls('resetScores').length, 1);
  t.press('down');
  t.press('enter');
  assert.strictEqual(t.TG.UI.panel, 'menu');
});

// ----- the High Scores panel -----------------------------------------------------------------

check('High Scores with world scores: opens on the WORLD page of the difficulty last played and asks for the boards; Left and Right go round four pages', function () {
  const t = worldEnv({ canvas: 'soft' });
  t.TG.Save.setSetting('lastDifficulty', 'hard');
  toMenu(t);
  assert.strictEqual(t.world.calls.length, 0, 'a request before the panel was opened');
  t.press('down'); t.press('down'); t.press('enter');
  assert.strictEqual(t.TG.UI.panel, 'scores');
  assert.strictEqual(t.TG.UI.page, 'hard');
  assert.deepStrictEqual(t.world.calls.map(function (c) { return c.method + ' ' + c.path; }), ['GET /v1/scores']);
  const seen = [];
  const ui = eventLog(t.TG);
  for (let i = 0; i < 4; i++) { t.press('right'); seen.push(t.TG.UI.page); }
  assert.deepStrictEqual(seen, ['local', 'easy', 'medium', 'hard']);
  assert.strictEqual(ui.filter(function (e) { return e.name === 'ui:move'; }).length, 4);
  const back = [];
  for (let i = 0; i < 4; i++) { t.press('left'); back.push(t.TG.UI.page); }
  assert.deepStrictEqual(back, ['medium', 'easy', 'local', 'hard']);
  t.press('up'); t.press('down'); t.type('x');
  assert.strictEqual(t.TG.UI.page, 'hard', 'other keys do not change the page');
  assert.strictEqual(t.world.calls.length, 1, 'changing the page asks for nothing');
  t.press('enter');
  assert.strictEqual(t.TG.UI.panel, 'menu');
  assert.strictEqual(t.TG.UI.page, null);
  // Opened again within 30 s: the boards are not asked for again.
  t.press('enter');
  assert.strictEqual(t.TG.UI.page, 'hard');
  assert.strictEqual(t.world.calls.length, 1);
  t.press('esc');
  t.seconds(11);
  t.press('up'); t.press('down');
  t.seconds(11);
  t.press('up'); t.press('down');
  t.seconds(9);
  t.press('enter');
  assert.strictEqual(t.world.calls.length, 2, 'after 30 s the boards are asked for again');
  assert.deepStrictEqual(t.env.errors, []);
});

check('A WORLD page: a header with the page and the arrows, ten rows of place, initials, score, WPM, accuracy and rank; nothing overlaps or leaves the panel', function () {
  const t = worldEnv({ canvas: 'soft' });
  toMenu(t);
  t.press('down'); t.press('down'); t.press('enter');
  ['medium', 'hard', 'easy'].forEach(function (d) {
    for (let i = 0; i < 3 && t.TG.UI.page !== d; i++) t.press('right');   // medium -> hard -> local -> easy
    assert.strictEqual(t.TG.UI.page, d);
    const boxes = drawnBoxes(t);
    const texts = boxes.map(function (b) { return b.text; });
    assert.ok(texts.indexOf('HIGH SCORES') !== -1);
    const header = boxes.filter(function (b) { return b.text === 'WORLD ' + d.toUpperCase(); });
    assert.strictEqual(header.length, 1, 'the page header');
    const arrows = boxes.filter(function (b) { return b.y === header[0].y && (b.text === '<' || b.text === '>'); });
    assert.deepStrictEqual(arrows.map(function (b) { return b.text; }), ['<', '>'], 'an arrow on each side of the page name');
    assert.ok(arrows[0].x + arrows[0].w <= header[0].x && arrows[1].x >= header[0].x + header[0].w);
    assert.ok(texts.indexOf((['easy', 'medium', 'hard'].indexOf(d) + 1) + '/4') !== -1, 'the page number');
    assert.ok(texts.indexOf('LEFT AND RIGHT: PAGE   ENTER OR ESC: BACK') !== -1);
    ['NAME', 'SCORE', 'WPM', 'ACC', 'RANK'].forEach(function (h) { assert.ok(texts.indexOf(h) !== -1, 'column ' + h); });
    const list = t.world.lists[d].slice(0, 10);
    list.forEach(function (e, i) {
      const cells = boxes.filter(function (b) { return b.y === 56 + i * 11; }).map(function (b) { return b.text; });
      const padded = ('0000000' + e.score).slice(-7);
      assert.deepStrictEqual(cells, [String(i + 1), e.name, padded, String(e.wpm), e.accuracy + '%', e.rank], 'row ' + (i + 1));
    });
    assert.strictEqual(boxes.filter(function (b) { return /^\d{7}$/.test(b.text); }).length, 10, 'ten rows');
    assertFits(boxes, d);
    assertApart(boxes, d);
    boxes.forEach(function (b) { assert.ok(b.x >= 8 + 4 && b.x + b.w <= 376 - 4 && b.y >= 6 + 4 && b.y + b.h <= 210 - 4, '"' + b.text + '" is outside the panel'); });
  });
  assert.deepStrictEqual(t.env.errors, []);
});

check('The THIS COMPUTER page has the three tables of this computer under its header; the new entry of this computer blinks there', function () {
  const t = worldEnv({ canvas: 'soft' });
  toMenu(t);
  t.press('down'); t.press('down'); t.press('enter');
  t.press('left'); t.press('left');               // medium -> easy -> local
  assert.strictEqual(t.TG.UI.page, 'local');
  const boxes = drawnBoxes(t);
  const texts = boxes.map(function (b) { return b.text; });
  assert.ok(texts.indexOf('THIS COMPUTER') !== -1 && texts.indexOf('4/4') !== -1);
  assert.strictEqual(boxes.filter(function (b) { return /^\d [A-Z]{3} \d{7}$/.test(b.text); }).length, 15);
  assert.strictEqual(boxes.filter(function (b) { return /WPM \d+% [SABC]$/.test(b.text); }).length, 15);
  ['EASY', 'MEDIUM', 'HARD'].forEach(function (label) { assert.ok(texts.indexOf(label) !== -1, label); });
  assertFits(boxes, 'local');
  assertApart(boxes, 'local');
  boxes.forEach(function (b) { assert.ok(b.x >= 12 && b.x + b.w <= 372 && b.y + b.h <= 206, '"' + b.text + '" is outside the panel'); });
});

check('WORLD page states: LOADING..., WORLD SCORES CANNOT BE REACHED with the way to this computer\'s scores, NO SCORES YET. BE THE FIRST!', function () {
  // Loading: the reply has not come yet.
  const t = worldEnv({ canvas: 'soft' });
  t.world.hold = true;
  toMenu(t);
  t.press('down'); t.press('down'); t.press('enter');
  assert.strictEqual(t.TG.UI.page, 'medium');
  assert.strictEqual(t.TG.Board.state.boards, 'loading');
  let boxes = drawnBoxes(t);
  let texts = boxes.map(function (b) { return b.text; });
  assert.ok(texts.indexOf('LOADING...') !== -1);
  assert.ok(texts.indexOf('NAME') === -1 && texts.indexOf('WORLD MEDIUM') !== -1);
  assertFits(boxes, 'loading');
  assertApart(boxes, 'loading');
  // The reply arrives: the rows.
  t.world.hold = false;
  t.world.release();
  assert.strictEqual(drawnBoxes(t).filter(function (b) { return /^\d{7}$/.test(b.text); }).length, 10);

  // No reply at all: failed after 6 s.
  const slow = worldEnv({ canvas: 'soft' });
  slow.world.hold = true;
  toMenu(slow);
  slow.press('down'); slow.press('down'); slow.press('enter');
  slow.seconds(5.8);
  assert.ok(drawnTexts(slow).indexOf('LOADING...') !== -1);
  slow.seconds(0.4);
  boxes = drawnBoxes(slow);
  texts = boxes.map(function (b) { return b.text; });
  assert.ok(texts.indexOf('WORLD SCORES CANNOT BE REACHED') !== -1, texts.join(' | '));
  assert.ok(texts.indexOf('PRESS RIGHT FOR THIS COMPUTER\'S SCORES') !== -1);
  assert.ok(texts.indexOf('LOADING...') === -1);
  assertFits(boxes, 'failed');
  assertApart(boxes, 'failed');
  // Right goes straight to THIS COMPUTER from a page in this state, as the line says.
  slow.press('right');
  assert.strictEqual(slow.TG.UI.page, 'local');
  slow.press('left');
  assert.strictEqual(slow.TG.UI.page, 'hard');
  slow.press('left');
  assert.strictEqual(slow.TG.UI.page, 'medium');
  slow.press('right');
  assert.strictEqual(slow.TG.UI.page, 'local');

  // Empty boards.
  const empty = worldEnv({ canvas: 'soft', lists: { easy: [], medium: [], hard: [] } });
  toMenu(empty);
  empty.press('down'); empty.press('down'); empty.press('enter');
  boxes = drawnBoxes(empty);
  texts = boxes.map(function (b) { return b.text; });
  assert.ok(texts.indexOf('NO SCORES YET. BE THE FIRST!') !== -1);
  assert.ok(texts.indexOf('NAME') === -1);
  assertFits(boxes, 'empty');
  [t, slow, empty].forEach(function (x) { assert.deepStrictEqual(x.env.errors, []); });
});

check('When the boards could not be loaded, the panel opens on THIS COMPUTER and asks for them again', function () {
  const t = worldEnv();
  t.world.down = true;
  toMenu(t);
  t.press('down'); t.press('down'); t.press('enter');
  assert.strictEqual(t.TG.UI.page, 'medium', 'the first time nothing is known yet');
  assert.strictEqual(t.TG.Board.state.boards, 'failed');
  t.press('esc');
  t.press('enter');
  assert.strictEqual(t.TG.UI.page, 'local', 'after a failed load the panel opens on THIS COMPUTER');
  assert.strictEqual(gets(t).length, 2, 'the boards are asked for again, although 30 s have not passed');
  // The service is back: the next opening shows the world page again.
  t.world.down = false;
  t.press('esc');
  t.press('enter');
  assert.strictEqual(t.TG.UI.page, 'local');
  assert.strictEqual(t.TG.Board.state.boards, 'ready');
  t.press('esc');
  t.press('enter');
  assert.strictEqual(t.TG.UI.page, 'medium');
  assert.strictEqual(gets(t).length, 3, 'boards that are known are not asked for again within 30 s');
});

// ----- the run token -------------------------------------------------------------------------

check('The run token is asked for when a difficulty is confirmed; a confirm for another difficulty replaces it; a continue and a restart keep it', function () {
  const t = worldEnv();
  toMenu(t);
  t.press('enter');
  assert.strictEqual(t.screen(), 'difficultySelect');
  t.press('left'); t.press('right'); t.press('right');
  assert.strictEqual(tokens(t).length, 0, 'moving between the panels asks for nothing');
  t.press('enter');                              // HARD
  assert.strictEqual(t.screen(), 'howToPlay');
  assert.deepStrictEqual(tokens(t).map(function (c) { return c.body.difficulty; }), ['hard']);
  assert.strictEqual(t.TG.Board.hasToken('hard'), true);
  t.press('esc');                                // back to the difficulty screen
  t.type('easy');
  assert.deepStrictEqual(tokens(t).map(function (c) { return c.body.difficulty; }), ['hard', 'easy']);
  assert.strictEqual(t.TG.Board.hasToken('hard'), false);
  assert.strictEqual(t.TG.Board.hasToken('easy'), true);
  t.type('ready');
  assert.strictEqual(t.screen(), 'playing');
  assert.strictEqual(tokens(t).length, 2, 'starting the run asks for nothing more');
  // Game over and continue.
  t.game.force('gameOver');
  t.seconds(1);
  t.press('enter');
  assert.strictEqual(t.calls('continueRun').length, 1);
  // Pause and restart from the checkpoint.
  t.game.pause();
  t.steps(1);
  t.press('down');
  t.press('enter');
  t.press('enter');
  assert.strictEqual(t.calls('continueRun').length, 2);
  assert.strictEqual(tokens(t).length, 2, 'a continue or a restart asked for a token');
  assert.strictEqual(t.TG.Board.hasToken('easy'), true);
  // How to Play from the title menu is not a confirm.
  const other = worldEnv();
  toMenu(other);
  other.press('down'); other.press('enter');
  assert.strictEqual(other.screen(), 'howToPlay');
  other.press('enter');
  assert.strictEqual(other.world.calls.length, 0);
});

// ----- when the initials screen appears -------------------------------------------------------

check('The initials screen appears for the local top five (NEW HIGH SCORE!), or with world scores on, a token held and a score above zero (WORLD SCORES)', function () {
  // Top five of this computer, world scores on: the old heading.
  let t = worldEnv({ canvas: 'soft' });
  toMenu(t);
  startFakeRun(t, 'medium');
  assert.strictEqual(endFakeRun(t, fakeResult({ score: 99999 })), 'highScoreEntry');
  let boxes = drawnBoxes(t);
  let texts = boxes.map(function (b) { return b.text; });
  assert.ok(texts.indexOf('NEW HIGH SCORE!') !== -1 && texts.indexOf('WORLD SCORES') === -1);
  assert.ok(texts.indexOf('INITIALS AND SCORE ALSO GO TO WORLD SCORES') !== -1, 'the screen says that the score is also sent');
  assertFits(boxes, 'entry, local and world');
  assertApart(boxes, 'entry, local and world');

  // Under the top five, token held, score above zero: the screen appears for the world scores.
  t = worldEnv({ canvas: 'soft' });
  toMenu(t);
  startFakeRun(t, 'medium');
  assert.strictEqual(endFakeRun(t, fakeResult(LOW)), 'highScoreEntry');
  boxes = drawnBoxes(t);
  texts = boxes.map(function (b) { return b.text; });
  assert.ok(texts.indexOf('WORLD SCORES') !== -1 && texts.indexOf('NEW HIGH SCORE!') === -1, texts.join(' | '));
  assert.ok(texts.indexOf('TYPE YOUR INITIALS') !== -1 && texts.indexOf('MEDIUM   900') !== -1);
  assert.ok(texts.some(function (x) { return /YOUR INITIALS AND SCORE/.test(x); }), 'the screen says what is sent');
  assert.ok(texts.every(function (x) { return !/^\d  [A-Z-]{3}  \d{7}$/.test(x); }), 'the table of this computer is not shown: the score is not in it');
  assertFits(boxes, 'entry, world');
  assertApart(boxes, 'entry, world');

  // A score of zero is not sent.
  t = worldEnv();
  toMenu(t);
  startFakeRun(t, 'medium');
  assert.strictEqual(endFakeRun(t, fakeResult({ score: 0, baseScore: 0, bonuses: [], cleared: false, rank: 'C' })), 'title');
  assert.strictEqual(sends(t).length, 0);

  // A run shorter than the service accepts (10 s) is not offered: it would be refused. From 10 s it is.
  assert.strictEqual(t.TG.Board.MIN_TIME, 10);
  startFakeRun(t, 'medium');
  assert.strictEqual(t.TG.Board.hasToken('medium'), true);
  assert.strictEqual(endFakeRun(t, fakeResult(Object.assign({}, LOW, { time: 9.99 }))), 'title', 'a run of 9.99 s went to the initials screen');
  assert.strictEqual(t.TG.UI.panel, 'menu');
  startFakeRun(t, 'medium');
  assert.strictEqual(endFakeRun(t, fakeResult(Object.assign({}, LOW, { time: 10 }))), 'highScoreEntry');
  // Such a run still gets the old screen when it reaches the top five of this computer, and is not sent.
  t = worldEnv();
  toMenu(t);
  startFakeRun(t, 'medium');
  assert.strictEqual(endFakeRun(t, fakeResult({ score: 99999, time: 4 })), 'highScoreEntry');
  texts = drawnTexts(t);
  assert.ok(texts.indexOf('NEW HIGH SCORE!') !== -1 && texts.indexOf('INITIALS AND SCORE ALSO GO TO WORLD SCORES') === -1, texts.join(' | '));
  assert.ok(texts.indexOf('TYPE 3 LETTERS, THEN ENTER') !== -1 && texts.every(function (x) { return !/^ESC/.test(x); }), 'Esc is offered although nothing is sent');
  t.type('abc');
  t.press('enter');
  assert.strictEqual(t.screen(), 'title');
  assert.strictEqual(t.TG.UI.page, 'local');
  assert.strictEqual(sends(t).length, 0);

  // No token (the service was down when the difficulty was confirmed): the old rule.
  t = worldEnv();
  t.world.down = true;
  toMenu(t);
  startFakeRun(t, 'medium');
  t.world.down = false;
  assert.strictEqual(endFakeRun(t, fakeResult(LOW)), 'title');
  assert.strictEqual(t.TG.UI.panel, 'menu');
  startFakeRun(t, 'medium');                     // this time the token arrives
  assert.strictEqual(endFakeRun(t, fakeResult(LOW)), 'highScoreEntry');

  // A token for another difficulty does not count.
  t = worldEnv();
  toMenu(t);
  startFakeRun(t, 'easy');
  assert.strictEqual(endFakeRun(t, fakeResult(Object.assign({}, LOW, { difficulty: 'hard' }))), 'title');

  // The setting off: the old rule, and no request.
  t = worldEnv();
  t.TG.Save.setSetting('worldScores', false);
  toMenu(t);
  startFakeRun(t, 'medium');
  assert.strictEqual(endFakeRun(t, fakeResult(LOW)), 'title');
  assert.strictEqual(t.world.calls.length, 0);
});

// ----- confirming the initials ----------------------------------------------------------------

check('Initials: the last ones used are offered and Enter alone takes them; on confirm the table of this computer is updated when the score reaches it, and the score is sent', function () {
  const t = worldEnv();
  t.TG.Save.setSetting('initials', 'KEY');
  toMenu(t);
  startFakeRun(t, 'medium');
  endFakeRun(t, fakeResult({ score: 99999 }));
  assert.ok(drawnTexts(t).indexOf('ENTER: SAVE AND SEND AS KEY') !== -1, drawnTexts(t).join(' | '));
  t.log.length = 0;
  t.press('enter');
  assert.strictEqual(t.screen(), 'title');
  assert.strictEqual(t.calls('addScore').length, 1);
  assert.strictEqual(t.calls('addScore')[0][2].name, 'KEY');
  assert.strictEqual(t.TG.Save.scores('medium')[0].name, 'KEY');
  const sent = sends(t);
  assert.strictEqual(sent.length, 1);
  assert.deepStrictEqual(sent[0].body, { token: 'run-1.medium', name: 'KEY', score: 99999, wpm: 28, accuracy: 95, rank: 'A', cleared: true, time: 301 });
  assert.strictEqual(t.TG.Board.state.send, 'sent');
  assert.strictEqual(t.TG.UI.panel, 'scores');
  assert.strictEqual(t.TG.UI.page, 'medium');

  // Under the top five: nothing is added to the table of this computer, the score is still sent, and
  // the initials are kept for the next time.
  const low = worldEnv();
  toMenu(low);
  startFakeRun(low, 'hard');
  endFakeRun(low, fakeResult(Object.assign({}, LOW, { difficulty: 'hard' })));
  const before = JSON.stringify(low.TG.Save.scores('hard'));
  low.type('zoe');
  low.press('enter');
  assert.strictEqual(low.screen(), 'title');
  assert.strictEqual(JSON.stringify(low.TG.Save.scores('hard')), before);
  assert.strictEqual(sends(low).length, 1);
  assert.strictEqual(sends(low)[0].body.name, 'ZOE');
  assert.strictEqual(sends(low)[0].body.score, 900);
  assert.strictEqual(low.TG.Save.getSetting('initials'), 'ZOE');
  assert.strictEqual(low.TG.UI.page, 'hard');

  // Top five but no token: saved on this computer as before, nothing sent, and the panel opens on
  // THIS COMPUTER, where the new entry is.
  const local = worldEnv();
  local.world.down = true;
  toMenu(local);
  startFakeRun(local, 'medium');
  endFakeRun(local, fakeResult({ score: 99999 }));
  assert.ok(drawnTexts(local).indexOf('INITIALS AND SCORE ALSO GO TO WORLD SCORES') === -1, 'nothing will be sent, so the screen does not say so');
  local.type('abc');
  local.press('enter');
  assert.strictEqual(local.TG.Save.scores('medium')[0].name, 'ABC');
  assert.strictEqual(sends(local).length, 0);
  assert.strictEqual(local.TG.UI.panel, 'scores');
  assert.strictEqual(local.TG.UI.page, 'local');
});

check('Blocked initials are refused on the spot: the boxes shake, TRY OTHER INITIALS shows, and nothing is saved or sent', function () {
  const t = worldEnv({ canvas: 'soft' });
  toMenu(t);
  startFakeRun(t, 'medium');
  endFakeRun(t, fakeResult({ score: 99999 }));
  const requests = t.world.calls.length;
  t.log.length = 0;
  const ui = eventLog(t.TG);
  t.type('ass');
  t.press('enter');
  assert.strictEqual(t.screen(), 'highScoreEntry');
  assert.strictEqual(t.calls('addScore').length, 0, 'saved on this computer');
  assert.strictEqual(t.calls('setSetting').length, 0, 'the initials were kept');
  assert.strictEqual(t.world.calls.length, requests, 'something was sent');
  assert.strictEqual(t.TG.Board.state.send, 'none');
  assert.strictEqual(ui.filter(function (e) { return e.name === 'ui:select'; }).length, 0);
  let boxes = drawnBoxes(t);
  const message = boxes.filter(function (b) { return b.text === 'TRY OTHER INITIALS'; });
  assert.strictEqual(message.length, 1);
  assert.strictEqual(message[0].color, CORAL);
  const letters = boxes.filter(function (b) { return b.h === 32; });
  assert.deepStrictEqual(letters.map(function (b) { return b.text; }), ['A', 'S', 'S']);
  assert.ok(letters.every(function (b) { return b.color === CORAL; }), 'the refused letters are not marked');
  // The boxes shake: over the next frames the letters are seen at two different places.
  const xs = {};
  for (let i = 0; i < 12; i++) {
    t.steps(1);
    drawnBoxes(t).filter(function (b) { return b.h === 32; }).slice(0, 1).forEach(function (b) { xs[b.x] = true; });
  }
  assert.ok(Object.keys(xs).length >= 2, 'the boxes did not move: x ' + Object.keys(xs).join(', '));
  t.seconds(0.5);
  boxes = drawnBoxes(t);
  assert.ok(boxes.some(function (b) { return b.text === 'TRY OTHER INITIALS'; }), 'the message stays until another key');
  assert.ok(boxes.every(function (b) { return !/ASS/.test(b.text); }), 'the refused initials are shown in the table');
  assertFits(boxes, 'refused');
  assertApart(boxes, 'refused');
  // Enter again changes nothing; in any letter case, every entry of the list is refused.
  t.press('enter');
  assert.strictEqual(t.screen(), 'highScoreEntry');
  // The next letter starts again; Backspace also clears the message.
  t.type('k');
  assert.ok(drawnTexts(t).indexOf('TRY OTHER INITIALS') === -1);
  assert.deepStrictEqual(drawnBoxes(t).filter(function (b) { return b.h === 32; }).map(function (b) { return b.text; }), ['K']);
  t.type('kk');
  t.press('enter');
  assert.strictEqual(t.screen(), 'highScoreEntry', 'KKK was accepted');
  t.press('backspace');
  assert.ok(drawnTexts(t).indexOf('TRY OTHER INITIALS') === -1);
  t.type('y');
  t.press('enter');
  assert.strictEqual(t.screen(), 'title');
  assert.strictEqual(t.TG.Save.scores('medium')[0].name, 'KKY');
  assert.strictEqual(sends(t).length, 1);
  assert.strictEqual(sends(t)[0].body.name, 'KKY');
  assert.deepStrictEqual(t.env.errors, []);
});

check('Blocked initials saved earlier are not offered while world scores are on: they have to be typed again', function () {
  const t = worldEnv();
  t.TG.Save.setSetting('initials', 'ASS');
  toMenu(t);
  startFakeRun(t, 'medium');
  endFakeRun(t, fakeResult({ score: 99999 }));
  const texts = drawnTexts(t);
  assert.ok(texts.every(function (x) { return !/ASS/.test(x); }), texts.join(' | '));
  t.press('enter');
  assert.strictEqual(t.screen(), 'highScoreEntry', 'Enter alone sent the score');
  assert.strictEqual(sends(t).length, 0);
  t.type('amy');
  t.press('enter');
  assert.strictEqual(t.screen(), 'title');
  assert.strictEqual(sends(t)[0].body.name, 'AMY');
});

// ----- declining, the lock and the placeholder initials -----------------------------------------

// The big letters in the three boxes.
function boxLetters(t) {
  return drawnBoxes(t).filter(function (b) { return b.h === 32; }).map(function (b) { return b.text; });
}

check('Initials screen: Enter and Esc are not read for the first 0.5 s while world scores are on, so a second Enter meant for the results screen sends nothing; letters are taken at once', function () {
  const t = worldEnv();
  t.TG.Save.setSetting('initials', 'KEY');
  toMenu(t);
  startFakeRun(t, 'medium');
  assert.strictEqual(endFakeRun(t, fakeResult(LOW), false), 'highScoreEntry');
  t.press('enter');                              // one frame after the Enter that left the results
  assert.strictEqual(t.screen(), 'highScoreEntry', 'the second Enter sent the score');
  t.press('esc');
  assert.strictEqual(t.screen(), 'highScoreEntry', 'Esc left the screen during the lock');
  for (let i = 0; i < 12; i++) { t.press('enter'); t.steps(1); }   // 0.4 s of Enter presses
  assert.strictEqual(t.screen(), 'highScoreEntry');
  assert.strictEqual(sends(t).length, 0, 'a score was sent during the lock');
  assert.strictEqual(t.calls('addScore').length, 0);
  t.seconds(0.2);
  t.press('enter');
  assert.strictEqual(t.screen(), 'title', 'Enter after the lock');
  assert.strictEqual(sends(t).length, 1);
  assert.strictEqual(sends(t)[0].body.name, 'KEY');

  // Letters typed during the lock are kept.
  const typed = worldEnv();
  toMenu(typed);
  startFakeRun(typed, 'medium');
  endFakeRun(typed, fakeResult(LOW), false);
  typed.type('zoe');
  assert.deepStrictEqual(boxLetters(typed), ['Z', 'O', 'E']);
  typed.press('enter');
  assert.strictEqual(typed.screen(), 'highScoreEntry');
  typed.seconds(0.5);
  typed.press('enter');
  assert.strictEqual(sends(typed)[0].body.name, 'ZOE');

  // With world scores off the screen is as it was: Enter is read from the first frame.
  [{}, { board: true }].forEach(function (kind) {
    const off = fakeEnv(kind);
    toMenu(off);
    startFakeRun(off, 'medium');
    assert.strictEqual(endFakeRun(off, fakeResult({ score: 99999 }), false), 'highScoreEntry');
    off.press('enter');
    assert.strictEqual(off.screen(), 'title');
    assert.strictEqual(off.TG.Save.scores('medium')[0].name, 'PIP');
  });
});

check('Initials screen, WORLD SCORES: Esc goes to the title with nothing sent and nothing saved, and the screen says so (ESC: DO NOT SEND)', function () {
  const t = worldEnv({ canvas: 'soft' });
  toMenu(t);
  startFakeRun(t, 'medium');
  assert.strictEqual(endFakeRun(t, fakeResult(LOW)), 'highScoreEntry');
  const boxes = drawnBoxes(t);
  const texts = boxes.map(function (b) { return b.text; });
  assert.ok(texts.indexOf('WORLD SCORES') !== -1);
  const esc = boxes.filter(function (b) { return b.text === 'ESC: DO NOT SEND'; });
  assert.strictEqual(esc.length, 1, texts.join(' | '));
  assert.strictEqual(esc[0].color, SILVER);
  assertFits(boxes, 'entry, world');
  assertApart(boxes, 'entry, world');
  const requests = t.world.calls.length;
  t.log.length = 0;
  const ui = eventLog(t.TG);
  t.type('da');                                  // letters typed so far are dropped with the rest
  t.press('esc');
  assert.strictEqual(t.screen(), 'title');
  assert.strictEqual(t.TG.UI.panel, 'menu', 'the title menu, as after a run that earns no entry');
  assert.strictEqual(t.world.calls.length, requests, 'a request was made');
  assert.strictEqual(t.TG.Board.state.send, 'none');
  assert.strictEqual(t.calls('addScore').length, 0);
  assert.strictEqual(t.calls('setSetting').length, 0, 'the initials were saved');
  assert.strictEqual(ui.filter(function (e) { return e.name === 'ui:back'; }).length, 1);
  assert.strictEqual(ui.filter(function (e) { return e.name === 'ui:select'; }).length, 0);
  // The High Scores panel has no status line for a run that was not sent.
  t.seconds(1.3);                                // the logo is stamped again after a run
  t.press('down'); t.press('down'); t.press('enter');
  assert.strictEqual(t.TG.UI.page, 'medium');
  assert.ok(drawnTexts(t).every(function (x) { return !/YOUR PLACE|SENDING|COULD NOT/.test(x); }));
  assert.deepStrictEqual(t.env.errors, []);
});

check('Initials screen, NEW HIGH SCORE!: Esc keeps the score on this computer only (THIS SCORE STAYS ON THIS COMPUTER), Esc again sends it after all', function () {
  const t = worldEnv({ canvas: 'soft' });
  toMenu(t);
  startFakeRun(t, 'medium');
  assert.strictEqual(endFakeRun(t, fakeResult({ score: 99999 })), 'highScoreEntry');
  let boxes = drawnBoxes(t);
  let texts = boxes.map(function (b) { return b.text; });
  assert.ok(texts.indexOf('INITIALS AND SCORE ALSO GO TO WORLD SCORES') !== -1 && texts.indexOf('ESC: DO NOT SEND') !== -1, texts.join(' | '));
  const ui = eventLog(t.TG);
  t.press('esc');
  assert.strictEqual(t.screen(), 'highScoreEntry', 'the score still belongs in the table of this computer');
  assert.strictEqual(ui.filter(function (e) { return e.name === 'ui:move'; }).length, 1);
  boxes = drawnBoxes(t);
  texts = boxes.map(function (b) { return b.text; });
  assert.ok(texts.indexOf('THIS SCORE STAYS ON THIS COMPUTER') !== -1 && texts.indexOf('ESC: SEND IT TOO') !== -1, texts.join(' | '));
  assert.ok(texts.indexOf('INITIALS AND SCORE ALSO GO TO WORLD SCORES') === -1 && texts.indexOf('ESC: DO NOT SEND') === -1);
  assert.ok(texts.indexOf('ENTER: USE PIP') !== -1, 'nothing is sent, so Enter alone takes PIP as it always did');
  assertFits(boxes, 'entry, declined');
  assertApart(boxes, 'entry, declined');
  t.type('dav');
  assert.ok(drawnTexts(t).indexOf('ENTER: SAVE') !== -1);
  t.press('enter');
  assert.strictEqual(t.screen(), 'title');
  assert.strictEqual(t.TG.Save.scores('medium')[0].name, 'DAV');
  assert.strictEqual(sends(t).length, 0, 'the score was sent after Esc');
  assert.strictEqual(t.TG.Board.state.send, 'none');
  assert.strictEqual(t.TG.UI.panel, 'scores');
  assert.strictEqual(t.TG.UI.page, 'local', 'the panel opens where the new entry is');
  let seen = [];
  for (let i = 0; i < 30; i++) { t.steps(1); seen = seen.concat(drawnBoxes(t)); }
  assert.ok(seen.some(function (b) { return b.text === '1 DAV 0099999' && b.color === GOLD; }), 'the new entry is not marked');
  assert.strictEqual(t.TG.Board.hasToken('medium'), true, 'the token is not used up by a run that was not sent');

  // Esc twice: sent after all.
  const again = worldEnv();
  toMenu(again);
  startFakeRun(again, 'medium');
  endFakeRun(again, fakeResult({ score: 99999 }));
  again.press('esc');
  again.press('esc');
  texts = drawnTexts(again);
  assert.ok(texts.indexOf('INITIALS AND SCORE ALSO GO TO WORLD SCORES') !== -1 && texts.indexOf('ESC: DO NOT SEND') !== -1);
  again.type('dav');
  assert.ok(drawnTexts(again).indexOf('ENTER: SAVE AND SEND') !== -1);
  again.press('enter');
  assert.strictEqual(sends(again).length, 1);
  assert.strictEqual(again.TG.UI.page, 'medium');

  // With world scores off, and with them on but no run token, Esc does nothing, as before.
  const off = fakeEnv({ board: true });
  toMenu(off);
  startFakeRun(off, 'medium');
  endFakeRun(off, fakeResult({ score: 99999 }));
  const before = drawnTexts(off).join('|');
  off.press('esc');
  assert.strictEqual(off.screen(), 'highScoreEntry');
  assert.strictEqual(drawnTexts(off).join('|'), before);
  const none = worldEnv();
  none.world.down = true;
  toMenu(none);
  startFakeRun(none, 'medium');
  endFakeRun(none, fakeResult({ score: 99999 }));
  none.press('esc');
  assert.strictEqual(none.screen(), 'highScoreEntry');
  assert.ok(drawnTexts(none).every(function (x) { return !/^ESC|STAYS ON THIS COMPUTER/.test(x); }));
  none.type('abc');
  none.press('enter');
  assert.strictEqual(none.TG.Save.scores('medium')[0].name, 'ABC');
});

check('Initials screen: with no initials used before, Enter alone does not send the score as PIP; the boxes are empty and the letters have to be typed', function () {
  [fakeResult(LOW), fakeResult({ score: 99999 })].forEach(function (result) {
    const t = worldEnv({ canvas: 'soft' });
    assert.strictEqual(t.TG.Save.getSetting('initials'), 'PIP');
    toMenu(t);
    startFakeRun(t, 'medium');
    assert.strictEqual(endFakeRun(t, result), 'highScoreEntry');
    assert.deepStrictEqual(boxLetters(t), [], 'PIP is shown in the boxes');
    let texts = drawnTexts(t);
    assert.ok(texts.every(function (x) { return !/^ENTER/.test(x); }), 'Enter is offered: ' + texts.join(' | '));
    const requests = t.world.calls.length;
    t.log.length = 0;
    for (let i = 0; i < 5; i++) { t.press('enter'); t.seconds(0.25); }
    assert.strictEqual(t.screen(), 'highScoreEntry', 'Enter alone was accepted');
    assert.strictEqual(t.world.calls.length, requests, 'a request was made');
    assert.strictEqual(t.calls('addScore').length, 0);
    const boxes = drawnBoxes(t);
    assert.ok(boxes.some(function (b) { return b.text === 'TYPE 3 LETTERS FIRST'; }), boxes.map(function (b) { return b.text; }).join(' | '));
    assert.ok(boxes.every(function (b) { return !/PIP  \d{7}/.test(b.text) || b.color !== GOLD; }), 'the new row of the table is shown as PIP');
    assertFits(boxes, 'entry, nothing offered');
    assertApart(boxes, 'entry, nothing offered');
    // PIP can still be chosen: typed, it is sent like any other initials.
    t.type('pip');
    assert.ok(drawnTexts(t).indexOf('TYPE 3 LETTERS FIRST') === -1);
    t.press('enter');
    assert.strictEqual(t.screen(), 'title');
    assert.strictEqual(sends(t)[0].body.name, 'PIP');
  });
});

check('Initials screen: the line under the boxes says what Enter does: SEND on WORLD SCORES, SAVE AND SEND on NEW HIGH SCORE!, SAVE when nothing is sent', function () {
  const hint = function (t) {
    return drawnBoxes(t).filter(function (b) { return b.y === 112; }).map(function (b) { return b.text; });
  };
  // WORLD SCORES.
  let t = worldEnv();
  t.TG.Save.setSetting('initials', 'KEY');
  toMenu(t);
  startFakeRun(t, 'medium');
  endFakeRun(t, fakeResult(LOW));
  assert.deepStrictEqual(hint(t), ['ENTER: SEND AS KEY']);
  t.type('d');
  assert.deepStrictEqual(hint(t), ['BACKSPACE: DELETE']);
  t.type('av');
  assert.deepStrictEqual(hint(t), ['ENTER: SEND']);
  assert.ok(drawnTexts(t).every(function (x) { return x !== 'ENTER: SAVE'; }), 'nothing is saved on this computer from this screen');
  // NEW HIGH SCORE!, sent as well.
  t = worldEnv();
  t.TG.Save.setSetting('initials', 'KEY');
  toMenu(t);
  startFakeRun(t, 'medium');
  endFakeRun(t, fakeResult({ score: 99999 }));
  assert.deepStrictEqual(hint(t), ['ENTER: SAVE AND SEND AS KEY']);
  t.type('dav');
  assert.deepStrictEqual(hint(t), ['ENTER: SAVE AND SEND']);
  t.press('esc');
  assert.deepStrictEqual(hint(t), ['ENTER: SAVE']);
  // World scores off: the lines from before.
  t = fakeEnv({ board: true });
  t.TG.Save.setSetting('initials', 'KEY');
  toMenu(t);
  startFakeRun(t, 'medium');
  endFakeRun(t, fakeResult({ score: 99999 }));
  assert.deepStrictEqual(hint(t), ['ENTER: USE KEY']);
  t.type('dav');
  assert.deepStrictEqual(hint(t), ['ENTER: SAVE']);
});

// ----- the page after a send ------------------------------------------------------------------

check('After the initials screen: the WORLD page of the run\'s difficulty with SENDING..., then YOUR PLACE: n OF m and the player\'s row highlighted', function () {
  const t = worldEnv({ canvas: 'soft' });
  toMenu(t);
  startFakeRun(t, 'medium');
  endFakeRun(t, fakeResult({ score: 99999 }));
  t.world.holdSend = true;
  t.type('dav');
  t.press('enter');
  assert.strictEqual(t.screen(), 'title');
  assert.strictEqual(t.TG.UI.panel, 'scores');
  assert.strictEqual(t.TG.UI.page, 'medium');
  assert.strictEqual(gets(t).length, 1, 'the boards are asked for when the panel opens');
  let boxes = drawnBoxes(t);
  let texts = boxes.map(function (b) { return b.text; });
  assert.ok(texts.indexOf('SENDING...') !== -1);
  assert.ok(texts.indexOf('0099999') === -1, 'the score is on the board before the service answered');
  assert.strictEqual(boxes.filter(function (b) { return /^\d{7}$/.test(b.text); }).length, 10, 'the board as it was is shown meanwhile');
  assertFits(boxes, 'sending');
  assertApart(boxes, 'sending');
  t.world.release();
  const place = t.TG.Board.state.place;
  assert.ok(place >= 1 && place <= 10, 'place ' + place);
  boxes = drawnBoxes(t).filter(function (b) { return b.text !== '>'; });
  texts = boxes.map(function (b) { return b.text; });
  assert.ok(texts.indexOf('YOUR PLACE: ' + place + ' OF 87') !== -1, texts.join(' | '));
  assert.ok(texts.indexOf('SENDING...') === -1);
  const row = boxes.filter(function (b) { return b.y === 56 + (place - 1) * 11; });
  assert.deepStrictEqual(row.map(function (b) { return b.text; }), [String(place), 'DAV', '0099999', '28', '95%', 'A']);
  assert.ok(row.slice(0, 5).every(function (b) { return b.color === GOLD; }), 'the row is not highlighted');
  const others = boxes.filter(function (b) { return /^\d{7}$/.test(b.text) && b.text !== '0099999'; });
  assert.strictEqual(others.length, 9);
  assert.ok(others.every(function (b) { return b.color === WHITE; }), 'another row is highlighted');
  assertFits(boxes, 'placed');
  assertApart(boxes, 'placed');
  // The status line belongs to that page only.
  t.seconds(0.6);
  t.press('right');
  assert.ok(drawnTexts(t).every(function (x) { return !/YOUR PLACE/.test(x); }));
  // THIS COMPUTER has the entry too, blinking as before.
  t.press('right');
  assert.strictEqual(t.TG.UI.page, 'local');
  t.press('left'); t.press('left');
  assert.ok(drawnTexts(t).some(function (x) { return /YOUR PLACE/.test(x); }));
  assert.deepStrictEqual(t.env.errors, []);
});

check('The place stays: opened again from the menu, the WORLD page still shows YOUR PLACE and the highlighted row, until the next run starts', function () {
  const t = worldEnv({ canvas: 'soft' });
  toMenu(t);
  startFakeRun(t, 'medium');
  endFakeRun(t, fakeResult({ score: 99999 }));
  t.type('dav');
  t.press('enter');
  t.seconds(0.6);
  const place = t.TG.Board.state.place;
  const line = 'YOUR PLACE: ' + place + ' OF 87';
  assert.ok(drawnTexts(t).indexOf(line) !== -1);
  t.press('esc');
  assert.strictEqual(t.TG.UI.panel, 'menu');
  t.press('down'); t.press('down'); t.press('enter');
  assert.strictEqual(t.TG.UI.page, 'medium');
  let boxes = drawnBoxes(t);
  assert.ok(boxes.some(function (b) { return b.text === line && b.color === GOLD; }), 'the place is gone after the panel was left');
  assert.ok(boxes.some(function (b) { return b.text === 'DAV' && b.color === GOLD && b.y === 56 + (place - 1) * 11; }), 'the row is no longer marked');
  // The other WORLD pages have no status line.
  t.press('right');
  assert.ok(drawnTexts(t).every(function (x) { return !/YOUR PLACE/.test(x); }));
  // The idle rotation shows the boards without it.
  t.press('esc');
  t.seconds(12.1 + 8.05);
  assert.strictEqual(t.TG.UI.panel, 'scores');
  assert.ok(drawnBoxes(t).every(function (b) { return !/YOUR PLACE/.test(b.text) && !(b.text === 'DAV' && b.color === GOLD); }), 'the rotation shows the status line');
  t.press('up');
  assert.strictEqual(t.TG.UI.panel, 'menu');
  // The next run starts: the line of the run before goes. This run ends with no score and is not sent.
  t.press('up'); t.press('up');
  startFakeRun(t, 'medium');
  assert.strictEqual(endFakeRun(t, fakeResult({ score: 0, baseScore: 0, bonuses: [], cleared: false, rank: 'C' })), 'title');
  t.seconds(1.3);
  t.press('down'); t.press('down'); t.press('enter');
  assert.strictEqual(t.TG.UI.page, 'medium');
  boxes = drawnBoxes(t);
  assert.ok(boxes.every(function (b) { return !/YOUR PLACE/.test(b.text); }), 'the place of the run before is still shown');
  assert.ok(boxes.every(function (b) { return !(b.text === 'DAV' && b.color === GOLD); }));

  // Leaving while SENDING... is on screen: the reply arrives on the menu, and the panel shows the place.
  const away = worldEnv({ canvas: 'soft' });
  toMenu(away);
  startFakeRun(away, 'medium');
  endFakeRun(away, fakeResult(LOW));
  away.world.holdSend = true;
  away.type('dav');
  away.press('enter');
  away.seconds(0.6);
  assert.ok(drawnTexts(away).indexOf('SENDING...') !== -1);
  away.press('esc');
  assert.strictEqual(away.TG.UI.panel, 'menu');
  away.world.release();
  assert.strictEqual(away.TG.Board.state.send, 'sent');
  away.press('down'); away.press('down'); away.press('enter');
  assert.ok(drawnTexts(away).some(function (x) { return /^YOUR PLACE: \d+ OF 87$/.test(x); }), drawnTexts(away).join(' | '));
});

check('The page after a send reads no keys for its first 0.5 s, so an Enter meant for the initials screen does not close it', function () {
  const t = worldEnv();
  toMenu(t);
  startFakeRun(t, 'medium');
  endFakeRun(t, fakeResult({ score: 99999 }));
  t.type('dav');
  t.press('enter');
  assert.strictEqual(t.TG.UI.panel, 'scores');
  for (let i = 0; i < 6; i++) { t.press('enter'); t.press('esc'); t.press('right'); t.steps(1); }   // 0.4 s
  assert.strictEqual(t.TG.UI.panel, 'scores', 'the page was closed during the lock');
  assert.strictEqual(t.TG.UI.page, 'medium', 'the page was changed during the lock');
  t.seconds(0.2);
  t.press('right');
  assert.strictEqual(t.TG.UI.page, 'hard');
  t.press('enter');
  assert.strictEqual(t.TG.UI.panel, 'menu');
  // Opened from the menu the panel reads keys at once, as does the panel after a run that was not sent.
  t.press('down'); t.press('down'); t.press('enter');
  t.press('esc');
  assert.strictEqual(t.TG.UI.panel, 'menu');
  const local = worldEnv();
  local.world.down = true;                       // no token: the entry goes to this computer only
  toMenu(local);
  startFakeRun(local, 'medium');
  endFakeRun(local, fakeResult({ score: 99999 }));
  local.type('abc');
  local.press('enter');
  assert.strictEqual(local.TG.UI.page, 'local');
  local.press('esc');
  assert.strictEqual(local.TG.UI.panel, 'menu');
});

check('After a send that places below the ten rows: YOUR PLACE with no row highlighted', function () {
  const t = worldEnv({ canvas: 'soft' });
  toMenu(t);
  startFakeRun(t, 'medium');
  endFakeRun(t, fakeResult(LOW));
  t.type('dav');
  t.press('enter');
  assert.strictEqual(t.TG.UI.page, 'medium');
  const st = t.TG.Board.state;
  assert.strictEqual(st.send, 'sent');
  assert.ok(st.place > 10 && st.total === 87, 'place ' + st.place);
  const boxes = drawnBoxes(t);
  assert.ok(boxes.some(function (b) { return b.text === 'YOUR PLACE: ' + st.place + ' OF 87' && b.color === GOLD; }));
  assert.strictEqual(boxes.filter(function (b) { return /^\d{7}$/.test(b.text); }).length, 10);
  assert.ok(boxes.filter(function (b) { return b.y >= 56 && b.y < 166 && b.color === GOLD && !/^[SABC]$/.test(b.text); }).length === 0, 'a row is highlighted');
  assertFits(boxes, 'far');
  assertApart(boxes, 'far');
});

check('A place of 10: the arrow of the highlighted row stands clear of the two-digit place', function () {
  const lists = shot.sampleLists();
  lists.medium.forEach(function (e, i) { e.score = i < 9 ? 200000 - i * 1000 : 90000 - i * 100; });
  const t = worldEnv({ canvas: 'soft', lists: lists });
  toMenu(t);
  startFakeRun(t, 'medium');
  endFakeRun(t, fakeResult({ score: 99999 }));
  t.type('dav');
  t.press('enter');
  assert.strictEqual(t.TG.Board.state.place, 10);
  let arrow = null, number = null;
  for (let i = 0; i < 40 && !arrow; i++) {
    t.steps(1);
    const row = drawnBoxes(t).filter(function (b) { return b.y === 56 + 9 * 11; });
    arrow = row.filter(function (b) { return b.text === '>'; })[0] || null;
    number = row.filter(function (b) { return b.text === '10'; })[0];
  }
  assert.ok(arrow && number, 'the arrow or the place is not drawn');
  assert.strictEqual(number.color, GOLD);
  assert.ok(number.x - (arrow.x + arrow.w) >= 8, 'the arrow is ' + (number.x - arrow.x - arrow.w) + ' px from the place');
  assert.ok(arrow.x >= 8 + 4, 'the arrow is outside the panel');
});

check('A full board: a run below its 200 rows is not shown as place 201 of 201 but as NOT IN THE BEST 200 YET. KEEP GOING!', function () {
  const t = worldEnv({ canvas: 'soft', lists: shot.fullLists() });
  toMenu(t);
  startFakeRun(t, 'medium');
  endFakeRun(t, fakeResult(LOW));
  t.type('dav');
  t.press('enter');
  const st = t.TG.Board.state;
  assert.strictEqual(st.send, 'sent');
  assert.strictEqual(st.place, 201);
  assert.strictEqual(st.total, 201);
  assert.strictEqual(st.kept, false);
  let boxes = drawnBoxes(t);
  let texts = boxes.map(function (b) { return b.text; });
  assert.ok(texts.indexOf('NOT IN THE BEST 200 YET. KEEP GOING!') !== -1, texts.join(' | '));
  assert.ok(texts.every(function (x) { return !/YOUR PLACE|201/.test(x); }), texts.join(' | '));
  assert.strictEqual(boxes.filter(function (b) { return /^\d{7}$/.test(b.text); }).length, 10);
  assertFits(boxes, 'not kept');
  assertApart(boxes, 'not kept');
  // The last row that is kept does get its place.
  const last = worldEnv({ lists: shot.fullLists() });
  last.world.lists.medium.pop();                 // 199 rows: the run is the 200th
  toMenu(last);
  startFakeRun(last, 'medium');
  endFakeRun(last, fakeResult(LOW));
  last.type('dav');
  last.press('enter');
  assert.strictEqual(last.TG.Board.state.kept, true);
  assert.ok(drawnTexts(last).indexOf('YOUR PLACE: 200 OF 200') !== -1, drawnTexts(last).join(' | '));
});

check('After a send that fails: COULD NOT REACH WORLD SCORES. and, when the score reached this computer\'s table, SAVED ON THIS COMPUTER.', function () {
  // The send fails, the score in the local top five; the board is known.
  let t = worldEnv({ canvas: 'soft' });
  toMenu(t);
  t.press('down'); t.press('down'); t.press('enter');   // the boards are loaded while the service works
  t.press('esc');
  t.press('up'); t.press('up');
  startFakeRun(t, 'medium');
  endFakeRun(t, fakeResult({ score: 99999 }));
  t.world.downSend = true;
  t.type('dav');
  t.press('enter');
  assert.strictEqual(t.TG.UI.page, 'medium');
  assert.strictEqual(t.TG.Board.state.send, 'failed');
  assert.strictEqual(t.TG.Board.state.sendError, 'unreachable');
  let boxes = drawnBoxes(t);
  let texts = boxes.map(function (b) { return b.text; });
  assert.ok(boxes.some(function (b) { return b.text === 'COULD NOT REACH WORLD SCORES.' && b.color === CORAL; }), texts.join(' | '));
  assert.ok(texts.indexOf('SAVED ON THIS COMPUTER.') !== -1);
  assert.strictEqual(boxes.filter(function (b) { return /^\d{7}$/.test(b.text); }).length, 10, 'the board that is known is still shown');
  assert.strictEqual(t.TG.Save.scores('medium')[0].name, 'DAV');
  assertFits(boxes, 'failed, saved');
  assertApart(boxes, 'failed, saved');

  // The same with a score under the local top five: only the first line.
  t = worldEnv({ canvas: 'soft' });
  toMenu(t);
  startFakeRun(t, 'medium');
  endFakeRun(t, fakeResult(LOW));
  t.world.downSend = true;
  t.type('dav');
  t.press('enter');
  assert.strictEqual(t.TG.Board.state.send, 'failed');
  boxes = drawnBoxes(t);
  texts = boxes.map(function (b) { return b.text; });
  assert.ok(texts.indexOf('COULD NOT REACH WORLD SCORES.') !== -1);
  assert.ok(texts.indexOf('SAVED ON THIS COMPUTER.') === -1);
  assertFits(boxes, 'failed');
  assertApart(boxes, 'failed');
});

check('A score the service refuses is not reported as a service that cannot be reached: WORLD SCORES DID NOT TAKE THIS SCORE., and for its hourly limit TOO MANY SCORES SENT FROM HERE THIS HOUR.', function () {
  const cases = [
    ['implausible', 'refused', 'WORLD SCORES DID NOT TAKE THIS SCORE.'],
    ['too_soon', 'refused', 'WORLD SCORES DID NOT TAKE THIS SCORE.'],
    ['used', 'refused', 'WORLD SCORES DID NOT TAKE THIS SCORE.'],
    ['rate', 'busy', 'TOO MANY SCORES SENT FROM HERE THIS HOUR.'],
    ['server', 'unreachable', 'COULD NOT REACH WORLD SCORES.']
  ];
  cases.forEach(function (c) {
    [fakeResult({ score: 99999 }), fakeResult(LOW)].forEach(function (result) {
      const local = result.score === 99999;
      const t = worldEnv({ canvas: 'soft' });
      toMenu(t);
      startFakeRun(t, 'medium');
      endFakeRun(t, result);
      t.world.refuse = c[0];
      t.type('dav');
      t.press('enter');
      assert.strictEqual(t.TG.Board.state.send, 'failed', c[0]);
      assert.strictEqual(t.TG.Board.state.sendError, c[1], c[0]);
      const boxes = drawnBoxes(t);
      const texts = boxes.map(function (b) { return b.text; });
      assert.ok(boxes.some(function (b) { return b.text === c[2] && b.color === CORAL; }), c[0] + ': ' + texts.join(' | '));
      cases.forEach(function (other) { if (other[2] !== c[2]) assert.ok(texts.indexOf(other[2]) === -1, c[0] + ' also shows ' + other[2]); });
      assert.strictEqual(texts.indexOf('SAVED ON THIS COMPUTER.') !== -1, local, c[0]);
      assert.strictEqual(boxes.filter(function (b) { return /^\d{7}$/.test(b.text); }).length, 10, 'the board is shown: it did load');
      assertFits(boxes, c[0]);
      assertApart(boxes, c[0]);
      boxes.forEach(function (b) { assert.ok(b.x >= 8 + 4 && b.x + b.w <= 376 - 4, '"' + b.text + '" is outside the panel'); });
      assert.deepStrictEqual(t.env.errors, []);
    });
  });
});

check('The service cannot be reached at all after a run: one block says so once, with what became of the score', function () {
  // No reply to anything: SENDING... and LOADING... for 6 s, then the block. The game is never held up.
  let t = worldEnv({ canvas: 'soft' });
  toMenu(t);
  startFakeRun(t, 'medium');
  endFakeRun(t, fakeResult({ score: 99999 }));
  t.world.hold = true;
  t.type('dav');
  t.press('enter');
  t.seconds(5.5);
  let texts = drawnTexts(t);
  assert.ok(texts.indexOf('SENDING...') !== -1 && texts.indexOf('LOADING...') !== -1, texts.join(' | '));
  t.seconds(0.7);
  let boxes = drawnBoxes(t);
  texts = boxes.map(function (b) { return b.text; });
  assert.ok(boxes.some(function (b) { return b.text === 'WORLD SCORES CANNOT BE REACHED' && b.color === CORAL; }), texts.join(' | '));
  assert.ok(texts.indexOf('YOUR SCORE IS SAVED ON THIS COMPUTER.') !== -1 && texts.indexOf('PRESS RIGHT TO SEE IT') !== -1, texts.join(' | '));
  assert.ok(texts.indexOf('COULD NOT REACH WORLD SCORES.') === -1 && texts.indexOf('SAVED ON THIS COMPUTER.') === -1, 'the same thing is said twice: ' + texts.join(' | '));
  assert.ok(texts.indexOf('PRESS RIGHT FOR THIS COMPUTER\'S SCORES') === -1);
  assert.strictEqual(boxes.filter(function (b) { return b.color === CORAL; }).length, 1, 'one line in the colour of a failure');
  assertFits(boxes, 'down, saved');
  assertApart(boxes, 'down, saved');
  // Right goes to THIS COMPUTER, where the new entry is marked.
  t.press('right');
  assert.strictEqual(t.TG.UI.page, 'local');
  let seen = [];
  for (let i = 0; i < 30; i++) { t.steps(1); seen = seen.concat(drawnBoxes(t)); }
  assert.ok(seen.some(function (b) { return b.text === '1 DAV 0099999' && b.color === GOLD; }), 'the new entry is not marked on THIS COMPUTER');
  t.press('esc');
  assert.strictEqual(t.TG.UI.panel, 'menu');
  t.press('enter');
  assert.strictEqual(t.screen(), 'difficultySelect', 'a new run can start');

  // The score did not reach the table of this computer: the page does not send the player there.
  t = worldEnv({ canvas: 'soft' });
  toMenu(t);
  startFakeRun(t, 'medium');
  endFakeRun(t, fakeResult(LOW));
  t.world.down = true;
  t.type('dav');
  t.press('enter');
  assert.strictEqual(t.TG.Board.state.boards, 'failed');
  assert.strictEqual(t.TG.Board.state.send, 'failed');
  boxes = drawnBoxes(t);
  texts = boxes.map(function (b) { return b.text; });
  assert.ok(texts.indexOf('WORLD SCORES CANNOT BE REACHED') !== -1 && texts.indexOf('YOUR SCORE WAS NOT SENT.') !== -1, texts.join(' | '));
  assert.ok(texts.every(function (x) { return !/PRESS RIGHT|SAVED ON THIS COMPUTER|COULD NOT REACH/.test(x); }), texts.join(' | '));
  assertFits(boxes, 'down, not saved');
  assertApart(boxes, 'down, not saved');
  // Opened again from the menu, the panel is on THIS COMPUTER, as after any failed load.
  t.seconds(0.6);
  t.press('esc');
  t.press('down'); t.press('down'); t.press('enter');
  assert.strictEqual(t.TG.UI.page, 'local', 'after a failed load the panel opens on THIS COMPUTER');
});

// ----- the idle rotation ----------------------------------------------------------------------

check('The idle rotation shows a WORLD page when the boards are known (easy, medium and hard in turn), otherwise the panel of this computer', function () {
  const t = worldEnv({ canvas: 'soft' });
  t.TG.Save.setSetting('lastDifficulty', 'hard');
  toMenu(t);
  t.seconds(12.1);
  assert.strictEqual(t.TG.UI.panel, 'story');
  assert.strictEqual(gets(t).length, 1, 'the boards are asked for when the rotation starts');
  const pages = [];
  for (let i = 0; i < 4; i++) {
    t.seconds(8.05);
    assert.strictEqual(t.TG.UI.panel, 'scores');
    pages.push(t.TG.UI.page);
    const boxes = drawnBoxes(t);
    const texts = boxes.map(function (b) { return b.text; });
    assert.ok(texts.indexOf('WORLD ' + t.TG.UI.page.toUpperCase()) !== -1);
    assert.ok(texts.indexOf('PRESS ANY KEY') !== -1 && texts.indexOf('<') === -1 && texts.indexOf('>') === -1 && texts.every(function (x) { return !/LEFT AND RIGHT/.test(x); }),
      'the rotation offers no page keys');
    assert.strictEqual(boxes.filter(function (b) { return /^\d{7}$/.test(b.text); }).length, 10);
    assertFits(boxes, 'rotation');
    assertApart(boxes, 'rotation');
    t.seconds(8.05);
    assert.strictEqual(t.TG.UI.panel, 'story');
  }
  assert.deepStrictEqual(pages, ['hard', 'easy', 'medium', 'hard']);
  assert.strictEqual(gets(t).length, 1, 'the rotation asked for the boards more than once');
  t.press('right');                              // any key: back to the menu, and nothing else
  assert.strictEqual(t.TG.UI.panel, 'menu');

  // The service cannot be reached: the rotation shows the tables of this computer, as before.
  const down = worldEnv({ canvas: 'soft' });
  down.world.down = true;
  toMenu(down);
  down.seconds(12.1);
  down.seconds(8.05);
  assert.strictEqual(down.TG.UI.panel, 'scores');
  assert.strictEqual(down.TG.UI.page, null);
  const boxes = drawnBoxes(down);
  TODAY_SCORES.slice(0, -1).forEach(function (want) {
    assert.ok(boxes.some(function (b) { return b.text === want[0] && b.y === want[1]; }), '"' + want[0] + '" at y ' + want[1]);
  });
  assert.ok(boxes.some(function (b) { return b.text === 'PRESS ANY KEY'; }));
  assert.ok(boxes.every(function (b) { return !/WORLD/.test(b.text); }));
});

// ----- the pictures ---------------------------------------------------------------------------

[
  ['the WORLD page', 'title', { panel: 'scores', world: 'ready', board: 'easy' }, ['WORLD EASY', 'RANK']],
  ['the WORLD page, loading', 'title', { panel: 'scores', world: 'loading' }, ['LOADING...']],
  ['the WORLD page, failed', 'title', { panel: 'scores', world: 'failed', board: 'hard' }, ['WORLD HARD', 'WORLD SCORES CANNOT BE REACHED']],
  ['the WORLD page, empty', 'title', { panel: 'scores', world: 'empty' }, ['NO SCORES YET. BE THE FIRST!']],
  ['THIS COMPUTER', 'title', { panel: 'scores', world: 'ready', board: 'local' }, ['THIS COMPUTER']],
  ['Options with the WORLD SCORES line', 'title', { panel: 'options', world: 'ready' }, ['WORLD SCORES', 'SENDS YOUR INITIALS AND SCORE']],
  ['the initials screen, NEW HIGH SCORE!', 'highScoreEntry', { world: 'ready' }, ['NEW HIGH SCORE!', 'INITIALS AND SCORE ALSO GO TO WORLD SCORES']],
  ['the initials screen, WORLD SCORES', 'highScoreEntry', { world: 'ready', entry: 'world' }, ['WORLD SCORES']],
  ['the initials screen, refused', 'highScoreEntry', { world: 'ready', entry: 'refused' }, ['TRY OTHER INITIALS']],
  ['the initials screen, not sent', 'highScoreEntry', { world: 'ready', entry: 'declined' }, ['NEW HIGH SCORE!', 'THIS SCORE STAYS ON THIS COMPUTER', 'ESC: SEND IT TOO', 'ENTER: SAVE']],
  ['the initials screen, initials offered', 'highScoreEntry', { world: 'ready', entry: 'offered' }, ['WORLD SCORES', 'ENTER: SEND AS DAV', 'ESC: DO NOT SEND']],
  ['the initials screen, no initials yet', 'highScoreEntry', { world: 'ready', entry: 'first' }, ['WORLD SCORES', 'TYPE 3 LETTERS FIRST', 'ESC: DO NOT SEND']],
  ['after a send, sending', 'title', { world: 'ready', send: 'sending' }, ['SENDING...']],
  ['after a send, placed', 'title', { world: 'ready', send: 'placed' }, ['DAV']],
  ['after a send, far down', 'title', { world: 'ready', send: 'far' }, ['WORLD MEDIUM']],
  ['after a send, failed', 'title', { world: 'ready', send: 'failed' }, ['COULD NOT REACH WORLD SCORES.', 'SAVED ON THIS COMPUTER.']],
  ['after a send, failed and not saved', 'title', { world: 'ready', send: 'failed-far' }, ['COULD NOT REACH WORLD SCORES.']],
  ['after a send, below a full board', 'title', { world: 'ready', send: 'unkept' }, ['NOT IN THE BEST 200 YET. KEEP GOING!']],
  ['after a send, refused', 'title', { world: 'ready', send: 'refused' }, ['WORLD SCORES DID NOT TAKE THIS SCORE.', 'SAVED ON THIS COMPUTER.']],
  ['after a send, the hourly limit', 'title', { world: 'ready', send: 'busy' }, ['TOO MANY SCORES SENT FROM HERE THIS HOUR.', 'SAVED ON THIS COMPUTER.']],
  ['after a send, the service down', 'title', { world: 'ready', send: 'down' }, ['WORLD SCORES CANNOT BE REACHED', 'YOUR SCORE IS SAVED ON THIS COMPUTER.', 'PRESS RIGHT TO SEE IT']],
  ['after a send, the service down and not saved', 'title', { world: 'ready', send: 'down-far' }, ['WORLD SCORES CANNOT BE REACHED', 'YOUR SCORE WAS NOT SENT.']]
].forEach(function (c) {
  check('Software canvas, real modules: ' + c[0] + ' draws without errors, with every line on the screen (tools/shot-ui.js options)', function () {
    const world = shot.worldFor(c[2]);
    const s = shot.createSession({ canvas: 'soft', world: world });
    shot.reach(s, c[1], c[2]);
    assert.strictEqual(s.screen(), c[1]);
    const ctx = s.env.canvas.getContext('2d');
    const boxes = textBoxes(s.TG, function () { s.TG.UI.draw(ctx, s.TG.Game.state); });
    const texts = boxes.map(function (b) { return b.text; });
    c[3].forEach(function (want) { assert.ok(texts.indexOf(want) !== -1, '"' + want + '" is not drawn: ' + texts.join(' | ')); });
    if (c[2].send === 'placed' || c[2].send === 'far') assert.ok(texts.some(function (x) { return /^YOUR PLACE: \d+ OF 87$/.test(x); }), texts.join(' | '));
    if (c[2].send && c[2].send !== 'placed' && c[2].send !== 'far') assert.ok(texts.every(function (x) { return !/^YOUR PLACE/.test(x); }), texts.join(' | '));
    assertFits(boxes, c[0]);
    assertApart(boxes.filter(function (b) { return b.text !== '>'; }), c[0]);
    s.frame();
    assert.deepStrictEqual(s.env.errors, []);
    assert.deepStrictEqual(s.env.warnings, []);
  });
});

check('tools/shot-ui.js: the world options are checked, and need --world', function () {
  const error = console.error;
  const lines = [];
  console.error = function () { lines.push(Array.prototype.join.call(arguments, ' ')); };
  try {
    assert.strictEqual(shot.main(['--screen', 'title', '--out', 'x.png', '--world', 'sideways']), 2);
    assert.strictEqual(shot.main(['--screen', 'title', '--out', 'x.png', '--board', 'easy']), 2);
    assert.strictEqual(shot.main(['--screen', 'title', '--out', 'x.png', '--world', 'ready', '--send', 'never']), 2);
    assert.strictEqual(shot.main(['--screen', 'highScoreEntry', '--out', 'x.png', '--entry', 'refused']), 2);
  } finally {
    console.error = error;
  }
  assert.strictEqual(lines.length, 4);
  assert.ok(!fs.existsSync(path.join(ROOT, 'x.png')), 'a picture was written');
});

// ---------------------------------------------------------------------------------------------
// I. Stages (docs/LEVEL2.md section 12 and 13.5): the NEXT STAGE strip, the STAGE row, the results
//    lines, How to Play, the story panels and the pending entry
// ---------------------------------------------------------------------------------------------
//
// The fakes of section D with the two level files loaded, so that there is a Level 2 to unlock and to
// go on to. The fake TG.Game has nextStage, which accepts what the real one accepts.

const STRIP_KEYS = 'ENTER: NEXT STAGE   ESC: TITLE';
const STRIP_LINE = 'THE SCORE IS ENTERED WHEN THE RUN ENDS';
const UNLOCKED = 'STAGE 2 UNLOCKED: CLOCKWORK CAVERNS';
const HOOK = 'A COLD WIND BLOWS DOWN THE SHAFT.';
const STORY_1 = ['BARON VON BURROW HAS DUG UP THE', 'MEADOW AND CARRIED OFF ITS WORDS.', 'PIP THE SCRIBE SETS OUT TO SPELL', 'THEM BACK.'];
const STORY_2 = ['THE BARON FLED TO LADY RATCHET,', 'WHO WINDS WORDS INTO CLOCKWORK.', 'PIP CLIMBS DOWN AFTER HIM.'];
const LIME = 15, AQUA = 11;

function stageEnv(opts) {
  return fakeEnv(Object.assign({ levels: true }, opts || {}));
}

// Level 2 is open, as after a cleared Level 1 run on Easy: the unlock is for every difficulty.
function openLevel2(t) {
  t.TG.Save.setSetting('clearedEasy', 1);
}

// The results screen of `result` on its last page with the tally finished, which is where the strip is.
// Page 1 is left to finish by itself, and Space turns the page, as before.
function toLastPage(t, result) {
  t.game.state.result = result;
  t.game.force('results');
  t.seconds(6);
  t.press('space');
  t.seconds(3);
  assert.strictEqual(t.screen(), 'results');
}

// A page load on the same computer: a new copy of the game over the stored record of `t`.
function reload(t, opts) {
  const u = fakeEnv(Object.assign({ levels: true, init: false }, opts || {}));
  t.env.storage.forEach(function (value, key) { u.env.storage.set(key, value); });
  u.TG.Main.init();
  return u;
}

function at(boxes, text) {
  return boxes.filter(function (b) { return b.text === text; })[0] || null;
}

// The letters drawn one by one on a line (a plate, or a panel's label), joined from left to right.
function lettersAt(boxes, y) {
  return boxes.filter(function (b) { return b.y === y && b.text.length === 1; })
    .sort(function (p, q) { return p.x - q.x; }).map(function (b) { return b.text; }).join('');
}

// The names of the sprites TG.Gfx.draw is asked for during one frame.
function spritesDrawn(t) {
  const seen = [];
  const draw = t.TG.Gfx.draw;
  t.TG.Gfx.draw = function (ctx, name) { seen.push(String(name)); return draw.apply(t.TG.Gfx, arguments); };
  try { t.TG.UI.draw(t.env.canvas.getContext('2d'), t.game.state); } finally { t.TG.Gfx.draw = draw; }
  return seen;
}

// ----- the STAGE row ---------------------------------------------------------------------------

check('Difficulty screen before the unlock: no STAGE row, the screen is the one from before line for line, and Up and Down move the selection as Left and Right do', function () {
  const t = stageEnv();
  const old = fakeEnv();                         // without the level files: the game as it was before Level 2
  [t, old].forEach(function (e) { toMenu(e); e.press('enter'); assert.strictEqual(e.screen(), 'difficultySelect'); });
  const boxes = drawnBoxes(t);
  const line = function (b) { return b.text + '@' + b.x + ',' + b.y; };
  assert.deepStrictEqual(boxes.map(line), drawnBoxes(old).map(line));
  assert.ok(boxes.every(function (b) { return b.text.indexOf('STAGE') === -1; }), 'a STAGE row before the unlock');
  [['WORDS: EVERYDAY WORDS, A LITTLE LONGER', 158], ['SPEED: STEADY, WORDS COME MORE OFTEN', 170], ['FOR 20-40 WORDS A MINUTE. 4 LIVES.', 182],
    ['ARROWS AND ENTER, OR TYPE THE NAME', 206]].forEach(function (want) {
    assert.ok(at(boxes, want[0]) && at(boxes, want[0]).y === want[1], '"' + want[0] + '" at y ' + want[1]);
  });
  t.press('up');
  assert.ok(at(drawnBoxes(t), 'FOR 10-20 WORDS A MINUTE. 5 LIVES.'), 'Up did not move the selection to Easy');
  t.press('down');
  t.press('down');
  assert.ok(at(drawnBoxes(t), 'FOR 40+ WORDS A MINUTE. 3 LIVES.'), 'Down did not move the selection to Hard');
  assert.strictEqual(t.calls('setSetting').filter(function (e) { return e[1] === 'lastLevel'; }).length, 0);
  // A stage remembered from somewhere else does not start Level 2 while it is locked.
  t.TG.Save.setSetting('lastLevel', 2);
  t.press('enter');
  t.type('ready');
  assert.strictEqual(t.calls('newRun')[0][1].levelId, 1);
  assert.strictEqual(t.calls('newRun')[0][1].difficulty, 'hard');
});

check('The STAGE row is there once Level 1 has been cleared on any difficulty: STAGE 1  QUILL MEADOWS between two arrows, changed with Up and Down to STAGE 2  CLOCKWORK CAVERNS with its three sample words, and remembered', function () {
  const t = stageEnv();
  const ui = eventLog(t.TG);
  openLevel2(t);                                 // cleared on Easy; the selection below is Medium and Hard
  toMenu(t);
  t.press('enter');
  let boxes = drawnBoxes(t);
  const row = at(boxes, 'STAGE 1  QUILL MEADOWS');
  assert.ok(row && row.y === 153 && row.x === 104 && row.color === GOLD, 'the row: ' + JSON.stringify(row));
  assert.deepStrictEqual([at(boxes, '^').x, at(boxes, '^').y, at(boxes, '_').x, at(boxes, '_').y], [88, 153, 288, 153], 'the arrows stand either side of the name');
  assert.strictEqual(lettersAt(boxes, 166), '', 'Level 1 has no sample words of its own: the panels show them');
  // Under the row, the two lines about the words and the speed; the third line has given way.
  assert.deepStrictEqual([at(boxes, 'WORDS: EVERYDAY WORDS, A LITTLE LONGER').y, at(boxes, 'SPEED: STEADY, WORDS COME MORE OFTEN').y], [180, 191]);
  assert.ok(boxes.every(function (b) { return b.text.indexOf('WORDS A MINUTE') === -1; }));
  assert.ok(at(boxes, '20-40 WPM'), 'the WPM guide is on the panel');
  assertFits(boxes, 'the STAGE row on STAGE 1');
  assertApart(boxes, 'the STAGE row on STAGE 1');

  const moves = ui.filter(function (e) { return e.name === 'ui:move'; }).length;
  t.press('down');
  boxes = drawnBoxes(t);
  const two = at(boxes, 'STAGE 2  CLOCKWORK CAVERNS');
  assert.ok(two && two.y === 153 && two.x === 88, 'the row after Down: ' + JSON.stringify(two));
  assert.strictEqual(lettersAt(boxes, 166), 'GEARPISTONCLOCKWORK', 'the sample words of LEVEL2 7.5, on plates under the name');
  assert.strictEqual(ui.filter(function (e) { return e.name === 'ui:move'; }).length, moves + 1);
  assert.deepStrictEqual(t.calls('setSetting').pop(), ['setSetting', 'lastLevel', 2]);
  assert.strictEqual(t.TG.Save.getSetting('lastLevel'), 2);
  assertFits(boxes, 'the STAGE row on STAGE 2');
  assertApart(boxes, 'the STAGE row on STAGE 2');
  assert.ok(boxes.filter(function (b) { return b.y >= 149 && b.y < 203; }).every(function (b) { return b.y + b.h <= 203; }), 'the row and its lines end above the bottom strip');

  // Up and Down go round the two stages. Left and Right still choose the difficulty and leave the row alone.
  t.press('down');
  assert.ok(at(drawnBoxes(t), 'STAGE 1  QUILL MEADOWS'));
  t.press('up');
  assert.ok(at(drawnBoxes(t), 'STAGE 2  CLOCKWORK CAVERNS'));
  t.press('right');
  boxes = drawnBoxes(t);
  assert.ok(at(boxes, 'STAGE 2  CLOCKWORK CAVERNS') && at(boxes, 'WORDS: LONG AND UNUSUAL WORDS'), 'Right chose Hard and kept the stage');
  // The sample words belong to the stage, not to the difficulty.
  assert.strictEqual(lettersAt(boxes, 166), 'GEARPISTONCLOCKWORK');

  // Typing a name still confirms, with the same screen data as before, and READY starts at the stage.
  t.type('easy');
  assert.deepStrictEqual(t.calls('setScreen').pop(), ['setScreen', 'howToPlay', { origin: 'start', difficulty: 'easy' }]);
  t.press('esc');                                // back: the row is where it was left
  assert.ok(at(drawnBoxes(t), 'STAGE 2  CLOCKWORK CAVERNS'));
  t.press('enter');
  t.type('ready');
  const run = t.calls('newRun')[0][1];
  assert.deepStrictEqual([run.difficulty, run.levelId], ['easy', 2]);
  assert.deepStrictEqual(t.env.errors, []);

  // The next visit opens on the stage chosen last, also after a page load; STAGE 1 starts Level 1.
  const u = reload(t);
  toMenu(u);
  u.press('enter');
  assert.ok(at(drawnBoxes(u), 'STAGE 2  CLOCKWORK CAVERNS'), 'the stage was not remembered');
  u.press('up');
  u.press('enter');
  u.type('ready');
  assert.strictEqual(u.calls('newRun')[0][1].levelId, 1);
  assert.strictEqual(u.TG.Save.getSetting('lastLevel'), 1);
});

check('The sample words of the STAGE row are words of Level 2: one of its flavour from each difficulty', function () {
  const TG = stubs.load({ files: ['js/core.js', 'js/words.js', 'js/levels/level2.js'] }).TG;
  const flavour = TG.Levels[2].theme.wordFlavour;
  ['gear', 'piston', 'clockwork'].forEach(function (word, i) {
    const tiers = TG.Words.POOLS[['easy', 'medium', 'hard'][i]].flavour[flavour];
    const found = Object.keys(tiers).some(function (tier) { return tiers[tier].indexOf(word) !== -1; });
    assert.ok(found, word + ' is not a ' + flavour + ' word of ' + ['easy', 'medium', 'hard'][i]);
  });
});

check('A record stored before Level 2 with a dated cleared entry opens the STAGE row at once, and its next clear of Level 1 is not announced as an unlock', function () {
  const record = JSON.parse(read('test/fixtures/save-before-level2.json')).records.played;
  const t = stageEnv({ init: false });
  t.env.storage.set('spellrunner.v1', record);
  t.TG.Main.init();
  assert.strictEqual(t.env.storage.get('spellrunner.v1'), record, 'starting the game wrote to the stored record');
  toMenu(t);
  t.press('enter');
  assert.ok(at(drawnBoxes(t), 'STAGE 1  QUILL MEADOWS'), 'no STAGE row for a player who cleared Level 1 before this release');
  t.game.state.result = fakeResult({ difficulty: 'hard' });
  t.game.force('results');
  t.seconds(6);
  const texts = drawnTexts(t);
  assert.ok(texts.indexOf('STAGE 1 CLEAR!') !== -1 && texts.indexOf(UNLOCKED) === -1, texts.join(' | '));
  assert.strictEqual(t.TG.Save.getSetting('initials'), 'EVE');
});

// ----- the NEXT STAGE strip --------------------------------------------------------------------

check('Results after a cleared Level 1 run: once the last page is tallied, THE SCORE IS ENTERED WHEN THE RUN ENDS over ENTER: NEXT STAGE   ESC: TITLE; until then, and after any other run, the footer of before', function () {
  const t = stageEnv();
  openLevel2(t);
  t.game.state.result = fakeResult();
  t.game.force('results');
  t.seconds(0.6);
  const strip = function () { const x = drawnTexts(t); return x.indexOf(STRIP_KEYS) !== -1 || x.indexOf(STRIP_LINE) !== -1; };
  assert.ok(!strip() && drawnTexts(t).indexOf('ENTER: NEXT') !== -1, 'the first page, tallying');
  t.press('esc');                                // Esc has no meaning before the strip
  t.press('enter');                              // finishes the tally and stamps the rank
  assert.ok(!strip() && drawnTexts(t).indexOf('ENTER: NEXT') !== -1, 'the first page, tallied');
  t.press('esc');
  t.press('enter');                              // page 2
  t.press('esc');
  assert.ok(!strip() && drawnTexts(t).indexOf('ENTER: NEXT') !== -1, 'the last page, tallying');
  assert.strictEqual(t.calls('setScreen').length + t.calls('nextStage').length, 0, 'a key acted before the strip was shown');
  t.seconds(3);
  const boxes = drawnBoxes(t);
  const line = at(boxes, STRIP_LINE), keys = at(boxes, STRIP_KEYS);
  assert.ok(line && line.y === 194 && line.x === (384 - line.w) / 2, 'the line: ' + JSON.stringify(line));
  assert.ok(keys && keys.y === 205 && keys.x === (384 - keys.w) / 2 && keys.color === WHITE, 'the strip: ' + JSON.stringify(keys));
  assert.ok(!at(boxes, 'ENTER: CONTINUE') && !at(boxes, 'ENTER: NEXT'), 'the old footer is drawn with the strip');
  assert.ok(at(boxes, '2/2'), 'the page number');
  assert.strictEqual(boxes.filter(function (b) { return b.y === 48 + 8 * 16; }).length > 0, true, 'nine rows at 16 px from y 48');
  assertFits(boxes, 'the strip');
  assertApart(boxes, 'the strip');
  assert.strictEqual(t.screen(), 'results');
  assert.strictEqual(t.calls('recordRun').length, 1);

  // No strip: a run that ended, a cleared Level 2 (there is no Level 3), a game without a Level 2, and a
  // level whose id is not a number, as the harness plays: TG.Game.nextStage has no level after any of them.
  [['a run that ended', stageEnv(), fakeResult({ cleared: false, bonuses: [], rank: 'B' })],
    ['a cleared Level 2', stageEnv(), fakeResult({ levelId: 2 })],
    ['no level files', fakeEnv(), fakeResult()],
    ['a level called test', stageEnv(), fakeResult({ levelId: 'test' })]].forEach(function (c) {
    const u = c[1];
    toLastPage(u, c[2]);
    const texts = drawnTexts(u);
    assert.ok(texts.indexOf('ENTER: CONTINUE') !== -1 && texts.indexOf(STRIP_KEYS) === -1 && texts.indexOf(STRIP_LINE) === -1, c[0] + ': ' + texts.slice(-4).join(' | '));
    u.press('esc');                              // Esc is read only where the strip is shown
    assert.strictEqual(u.screen(), 'results', c[0] + ': Esc left the results screen');
    u.press('space');                            // and without it Space still leaves, as before
    assert.strictEqual(u.screen(), 'highScoreEntry', c[0]);
    assert.strictEqual(u.calls('nextStage').length, 0, c[0]);
  });
});

check('The strip: Space and the JUMP button do nothing there, Enter alone calls TG.Game.nextStage, once, and nothing is entered; a refused call leaves the screen working', function () {
  const t = stageEnv();
  const ui = eventLog(t.TG);
  toLastPage(t, fakeResult());                   // Space turned the page on the way
  t.press('space');
  t.press('jump');
  t.seconds(0.5);
  t.press('space');
  assert.strictEqual(t.calls('nextStage').length, 0, 'Space or JUMP took NEXT STAGE');
  assert.strictEqual(t.screen(), 'results');
  assert.ok(drawnTexts(t).indexOf(STRIP_KEYS) !== -1);
  let refuse = true;
  const next = t.game.nextStage;
  t.game.nextStage = function () { if (refuse) { refuse = false; t.log.push(['nextStage']); return false; } return next(); };
  t.press('enter');                              // refused
  assert.strictEqual(t.screen(), 'results');
  assert.strictEqual(t.calls('setPending').length, 0, 'an entry was kept for a run that did not go on');
  t.press('enter');
  assert.strictEqual(t.screen(), 'playing');
  assert.strictEqual(t.calls('nextStage').length, 2);
  assert.strictEqual(t.calls('addScore').length, 0, 'NEXT STAGE entered a score');
  assert.strictEqual(t.calls('setScreen').length, 0, 'NEXT STAGE went through setScreen');
  assert.strictEqual(t.calls('newRun').length, 0);
  assert.ok(ui.some(function (e) { return e.name === 'ui:select'; }));
  assert.deepStrictEqual(t.env.errors, []);
  // Keys that arrive in the same step as the Enter are dropped: one press does not act on two screens.
  const u = stageEnv();
  toLastPage(u, fakeResult());
  u.input.press('enter');
  u.input.press('esc');
  u.input.press('enter');
  u.steps(1);
  assert.strictEqual(u.screen(), 'playing');
  assert.deepStrictEqual([u.calls('nextStage').length, u.calls('setScreen').length], [1, 0]);
});

check('The strip: Esc is TITLE and leads where Enter led before, to the initials screen when the run has an entry to make and to the title otherwise', function () {
  const t = stageEnv();
  toLastPage(t, fakeResult());                   // 48,210 on Medium reaches the table
  t.press('esc');
  assert.strictEqual(t.screen(), 'highScoreEntry');
  assert.strictEqual(t.calls('nextStage').length, 0);
  t.type('abc');
  t.press('enter');
  assert.strictEqual(t.screen(), 'title');
  assert.strictEqual(t.calls('addScore').length, 1);
  assert.strictEqual(t.calls('addScore')[0][2].score, 48210);
  const u = stageEnv();
  toLastPage(u, fakeResult({ score: 900, baseScore: 900, bonuses: [] }));   // cleared, under every seeded score
  assert.ok(drawnTexts(u).indexOf(STRIP_KEYS) !== -1);
  u.press('esc');
  assert.strictEqual(u.screen(), 'title');
  assert.strictEqual(u.calls('addScore').length + u.calls('nextStage').length, 0);
});

check('The line over the strip is for a run with an entry to make: a total under the table of this computer, with no world scores to take it, has the strip alone', function () {
  const lowest = { score: 900, baseScore: 900, bonuses: [], suggestion: 'READY FOR HARD?' };   // under every seeded score
  // No entry to make: the strip without the line, the suggestion where it was before, the rows at 16 px.
  const t = stageEnv();
  toLastPage(t, fakeResult(lowest));
  let boxes = drawnBoxes(t);
  const keys = at(boxes, STRIP_KEYS);
  assert.ok(keys && keys.y === 205 && keys.x === (384 - keys.w) / 2, 'the strip: ' + JSON.stringify(keys));
  assert.ok(!at(boxes, STRIP_LINE), 'the line promises an entry that this run does not get');
  assert.deepStrictEqual([at(boxes, 'READY FOR HARD?').y, at(boxes, 'CONTINUES USED').y], [194, 48 + 8 * 16]);
  assertApart(boxes, 'the strip alone');
  // Both keys work as with the line: Enter goes on, and nothing is kept for a total that would not place.
  t.press('enter');
  assert.strictEqual(t.screen(), 'playing');
  assert.strictEqual(t.TG.Save.pending(), null);
  // The same total where the fifth place is lower: the line is back.
  const u = stageEnv();
  toLastPage(u, fakeResult(Object.assign({}, lowest, { difficulty: 'easy', score: 3001, baseScore: 3001 })));   // fifth place on Easy is 3,000
  boxes = drawnBoxes(u);
  assert.ok(at(boxes, STRIP_LINE) && at(boxes, STRIP_LINE).y === 194 && at(boxes, STRIP_KEYS), 'no line for a total that reaches the table');
  // And with the world scores taking the run, the lowest total has it too: Esc leads to the initials screen.
  const w = worldEnv({ levels: true });
  toMenu(w);
  startFakeRun(w, 'medium');
  toLastPage(w, fakeResult(lowest));
  boxes = drawnBoxes(w);
  assert.ok(at(boxes, STRIP_LINE) && at(boxes, STRIP_KEYS), 'no line for a run that goes to the world scores');
  assertApart(boxes, 'the line with the world scores');
  w.press('esc');
  assert.strictEqual(w.screen(), 'highScoreEntry');
});

check('A second Esc straight after the Esc of the strip does not decline on the initials screen: Esc is not read there for 0.5 s wherever it has a meaning', function () {
  // NEW HIGH SCORE! with world scores on: Esc there switches the sending off.
  const t = worldEnv({ levels: true });
  toMenu(t);
  startFakeRun(t, 'medium');
  toLastPage(t, fakeResult({ score: 99999 }));
  t.press('esc');
  t.press('esc');                                // the next step: a second press, or a key that bounced
  assert.strictEqual(t.screen(), 'highScoreEntry');
  let texts = drawnTexts(t);
  assert.ok(texts.indexOf('INITIALS AND SCORE ALSO GO TO WORLD SCORES') !== -1 && texts.indexOf('THIS SCORE STAYS ON THIS COMPUTER') === -1,
    'the second Esc declined: ' + texts.slice(-3).join(' | '));
  t.seconds(0.3);
  t.press('esc');                                // still inside the 0.5 s
  assert.ok(drawnTexts(t).indexOf('THIS SCORE STAYS ON THIS COMPUTER') === -1);
  t.seconds(0.3);
  t.press('esc');                                // now it is read
  texts = drawnTexts(t);
  assert.ok(texts.indexOf('THIS SCORE STAYS ON THIS COMPUTER') !== -1, texts.slice(-3).join(' | '));
  assert.strictEqual(sends(t).length, 0);

  // WORLD SCORES: Esc there goes to the title with nothing saved or sent.
  const u = worldEnv({ levels: true });
  toMenu(u);
  startFakeRun(u, 'medium');
  toLastPage(u, fakeResult({ score: 900, baseScore: 900, bonuses: [] }));
  u.press('esc');
  u.press('esc');
  assert.strictEqual(u.screen(), 'highScoreEntry', 'the second Esc left the initials screen');
  assert.ok(drawnTexts(u).indexOf('WORLD SCORES') !== -1);
  u.seconds(0.6);
  u.press('esc');
  assert.strictEqual(u.screen(), 'title');
  assert.strictEqual(sends(u).length + u.calls('addScore').length, 0);

  // With world scores off Esc has no meaning on the initials screen, so there is nothing to lock.
  const v = stageEnv();
  toLastPage(v, fakeResult());
  v.press('esc');
  v.press('esc');
  v.seconds(0.6);
  v.press('esc');
  assert.strictEqual(v.screen(), 'highScoreEntry');
  v.type('abc');
  v.press('enter');
  assert.strictEqual(v.calls('addScore').length, 1);
});

// ----- one entry and one submission per run -----------------------------------------------------

check('NEXT STAGE asks for no run token and keeps the one held; the run is entered once, at its end, as cleared when it cleared a stage, with its run total and its whole time', function () {
  const t = worldEnv({ levels: true });
  toMenu(t);
  t.TG.Save.setSetting('initials', 'KEY');
  startFakeRun(t, 'medium');
  assert.strictEqual(tokens(t).length, 1);
  toLastPage(t, fakeResult({ score: 99999 }));
  t.press('enter');                              // NEXT STAGE
  assert.strictEqual(t.screen(), 'playing');
  assert.strictEqual(tokens(t).length, 1, 'a second run token was asked for');
  assert.strictEqual(t.TG.Board.hasToken('medium'), true, 'the run token was dropped');
  assert.strictEqual(sends(t).length + t.calls('addScore').length, 0, 'the run was entered at STAGE 1 CLEAR');
  // The run ends in Level 2, from the pause menu: its stage was not cleared, the run cleared one.
  const end = fakeResult({ levelId: 2, cleared: false, stages: 1, bonuses: [], score: 120470, baseScore: 120470, stageScore: 99999,
    time: 512.7, stageTime: 211.3, rank: 'A' });
  assert.strictEqual(endFakeRun(t, end), 'highScoreEntry');
  assert.ok(drawnTexts(t).indexOf('MEDIUM   120470') !== -1, 'the initials screen shows the run total');
  t.press('enter');                              // the initials used last
  assert.strictEqual(t.screen(), 'title');
  const sent = sends(t);
  assert.strictEqual(sent.length, 1, 'one submission per run');
  assert.deepStrictEqual(sent[0].body, { token: 'run-1.medium', name: 'KEY', score: 120470, wpm: 28, accuracy: 95, rank: 'A', cleared: true, time: 512 });
  const add = t.calls('addScore');
  assert.strictEqual(add.length, 1, 'one table entry per run');
  assert.deepStrictEqual([add[0][1], add[0][2].name, add[0][2].score, add[0][2].cleared, add[0][2].rank], ['medium', 'KEY', 120470, true, 'A']);
  assert.strictEqual(t.calls('recordRun').length, 2, 'each results screen records its result');
  assert.strictEqual(t.calls('setScreen').filter(function (e) { return e[1] === 'highScoreEntry'; }).length, 1, 'the initials screen comes once');
  assert.strictEqual(t.TG.Save.scores('medium').filter(function (e) { return e.name === 'KEY'; }).length, 1);
  assert.deepStrictEqual(t.env.errors, []);

  // The mark on an entry follows the run, not the stage that ended last.
  const u = stageEnv();
  u.game.state.result = fakeResult({ cleared: false, stages: 0, bonuses: [], score: 99999, rank: 'B' });
  u.game.force('highScoreEntry');
  u.type('abc');
  u.press('enter');
  assert.strictEqual(u.calls('addScore')[0][2].cleared, false);
});

// ----- the pending entry ----------------------------------------------------------------------

check('The pending entry: kept at NEXT STAGE when the stage\'s total would reach the table, as the entry STAGE 1 CLEAR would have made; forgotten when the run reaches the title', function () {
  const t = stageEnv();
  toLastPage(t, fakeResult());
  assert.strictEqual(t.TG.Save.pending(), null, 'an entry was kept before NEXT STAGE was pressed');
  t.press('enter');
  const p = stubs.plain(t.TG.Save.pending());
  assert.ok(p && /^\d{4}-\d{2}-\d{2}$/.test(p.entry.date), JSON.stringify(p));
  delete p.entry.date;
  delete p.entry.name;                           // not used: the entry is made under the initials used last
  assert.deepStrictEqual(p, { difficulty: 'medium', entry: { score: 48210, wpm: 28, accuracy: 95, rank: 'A', cleared: true } });
  assert.ok(JSON.parse(t.env.storage.get('spellrunner.v1')).pending, 'the pending entry is not in the stored record');
  assert.strictEqual(t.TG.Save.scores('medium').some(function (e) { return e.score === 48210; }), false);
  // The run ends in the game and is entered: nothing is left pending, and the table has one entry of it.
  assert.strictEqual(endFakeRun(t, fakeResult({ levelId: 2, cleared: false, stages: 1, bonuses: [], score: 61000, baseScore: 61000, stageScore: 48210, rank: 'B' })), 'highScoreEntry');
  assert.ok(t.TG.Save.pending(), 'the entry was dropped before the run reached the title');
  t.type('abc');
  t.press('enter');
  assert.strictEqual(t.screen(), 'title');
  assert.strictEqual(t.TG.Save.pending(), null);
  assert.strictEqual(JSON.parse(t.env.storage.get('spellrunner.v1')).pending, null);
  const mine = stubs.plain(t.TG.Save.scores('medium')).filter(function (e) { return e.date !== ''; });
  assert.deepStrictEqual(mine.map(function (e) { return [e.name, e.score]; }), [['ABC', 61000]]);

  // A total under the table keeps nothing. A run that ends without an entry reaches the title too.
  const u = stageEnv();
  toLastPage(u, fakeResult({ score: 900, baseScore: 900, bonuses: [] }));
  u.press('enter');
  assert.strictEqual(u.screen(), 'playing');
  assert.strictEqual(u.TG.Save.pending(), null);
  const v = stageEnv();
  toLastPage(v, fakeResult({ score: 9000, baseScore: 9000, bonuses: [] }));   // fifth place on Medium is 8,000
  v.press('enter');
  assert.ok(v.TG.Save.pending());
  v.TG.Save.addScore('medium', { name: 'TOP', score: 50000, wpm: 30, accuracy: 96, rank: 'A', cleared: true, date: '2026-10-12' });
  assert.strictEqual(endFakeRun(v, fakeResult({ levelId: 2, cleared: false, stages: 1, bonuses: [], score: 9000, baseScore: 9000, stageScore: 9000, rank: 'B' })), 'title');
  assert.strictEqual(v.TG.Save.pending(), null);
  assert.strictEqual(v.TG.Save.scores('medium').some(function (e) { return e.score === 9000; }), false);
  // Starting a run forgets one as well.
  const w = stageEnv();
  toMenu(w);
  w.TG.Save.setPending('easy', { name: 'PIP', score: 20000, wpm: 20, accuracy: 95, rank: 'A', cleared: true, date: '2026-10-12' });
  assert.ok(w.TG.Save.pending());
  startFakeRun(w, 'easy');
  assert.strictEqual(w.TG.Save.pending(), null, 'a run started with an entry still pending');
});

check('A run that went on and never ended (a closed tab): at the next start its Stage 1 entry is in the table under the initials used last, once', function () {
  const t = stageEnv();
  t.TG.Save.setSetting('initials', 'KEY');
  toLastPage(t, fakeResult({ difficulty: 'hard', score: 81230 }));
  t.press('enter');                              // NEXT STAGE; the tab is then closed in Level 2
  assert.strictEqual(t.screen(), 'playing');
  const u = reload(t);
  assert.strictEqual(u.screen(), 'boot');
  assert.strictEqual(u.calls('enterPending').length, 1, 'TG.UI.init did not enter the pending entry');
  const top = stubs.plain(u.TG.Save.scores('hard'))[0];
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(top.date), 'the entry has no date');
  delete top.date;
  assert.deepStrictEqual(top, { name: 'KEY', score: 81230, wpm: 28, accuracy: 95, rank: 'A', cleared: true });
  assert.strictEqual(u.TG.Save.pending(), null);
  assert.strictEqual(JSON.parse(u.env.storage.get('spellrunner.v1')).pending, null);
  toMenu(u);                                     // the title changes nothing more
  assert.strictEqual(u.TG.UI.panel, 'menu', 'the start-up entry opened a panel');
  const v = reload(u);                           // and neither does another start
  assert.strictEqual(v.TG.Save.scores('hard').filter(function (e) { return e.score === 81230; }).length, 1);
  assert.deepStrictEqual(u.env.errors.concat(v.env.errors), []);
  // With nothing pending a start writes nothing.
  const w = stageEnv();
  assert.strictEqual(w.env.storage.has('spellrunner.v1'), false, 'a first start wrote a record');
  toMenu(w);
  assert.strictEqual(w.env.storage.has('spellrunner.v1'), false, 'reaching the title wrote a record');
});

// ----- the results lines ------------------------------------------------------------------------

check('STAGE 2 UNLOCKED: CLOCKWORK CAVERNS is under the title the first time Level 1 is cleared on this computer, and not again; the difficulty then stands in the corner', function () {
  const t = stageEnv();
  // A run that ended opens nothing.
  t.game.state.result = fakeResult({ cleared: false, bonuses: [], rank: 'B' });
  t.game.force('results');
  t.seconds(1);
  assert.ok(drawnTexts(t).indexOf(UNLOCKED) === -1);
  assert.strictEqual(t.TG.Save.levelOpen(2), false);
  // The first clear.
  t.game.state.result = fakeResult({ difficulty: 'easy' });
  t.game.force('results');
  t.seconds(1);
  let boxes = drawnBoxes(t);
  const line = at(boxes, UNLOCKED);
  assert.ok(line && line.y === 28 && line.x === (384 - line.w) / 2 && line.color === LIME, 'the line: ' + JSON.stringify(line));
  const label = at(boxes, 'EASY');
  assert.ok(label && label.y === 12 && label.x + label.w === 378, 'the difficulty: ' + JSON.stringify(label));
  assert.strictEqual(at(boxes, 'STAGE 1 CLEAR!').y, 8);
  assert.strictEqual(t.TG.Save.levelOpen(2), true);
  t.seconds(6);
  t.press('enter');
  t.seconds(3);
  boxes = drawnBoxes(t);
  assert.ok(at(boxes, UNLOCKED) && at(boxes, STRIP_KEYS), 'the line stays on the last page, over the strip');
  assertFits(boxes, 'the unlock line');
  assertApart(boxes, 'the unlock line');
  // The same result set up again keeps its line; the next clear, on any difficulty, has none.
  t.game.force('results');
  t.seconds(1);
  assert.ok(at(drawnBoxes(t), UNLOCKED));
  t.game.state.result = fakeResult({ difficulty: 'hard' });
  t.game.force('results');
  t.seconds(1);
  boxes = drawnBoxes(t);
  assert.ok(!at(boxes, UNLOCKED));
  assert.deepStrictEqual([at(boxes, 'HARD').y, at(boxes, 'HARD').x], [28, 176], 'without a headline the difficulty is under the title, as before');
});

check('STAGE 2 CLEAR! has A COLD WIND BLOWS DOWN THE SHAFT. under it; a run that ended in Level 2 and a cleared Level 1 do not', function () {
  const t = stageEnv();
  openLevel2(t);
  t.game.state.result = fakeResult({ levelId: 2 });
  t.game.force('results');
  t.seconds(6);
  let boxes = drawnBoxes(t);
  const hook = at(boxes, HOOK);
  assert.ok(at(boxes, 'STAGE 2 CLEAR!') && hook && hook.y === 28 && hook.x === (384 - hook.w) / 2 && hook.color === AQUA, JSON.stringify(hook));
  assert.ok(at(boxes, 'MEDIUM').y === 12 && at(boxes, 'MEDIUM').x + at(boxes, 'MEDIUM').w === 378);
  assertFits(boxes, 'the hook line');
  assertApart(boxes, 'the hook line');
  t.press('enter');
  t.seconds(3);
  boxes = drawnBoxes(t);
  assert.ok(at(boxes, HOOK) && at(boxes, 'ENTER: CONTINUE'));
  assertApart(boxes, 'the hook line, page 2');
  [fakeResult({ levelId: 2, cleared: false, bonuses: [], rank: 'B' }), fakeResult()].forEach(function (r) {
    t.game.state.result = r;
    t.game.force('results');
    t.seconds(1);
    assert.ok(drawnTexts(t).indexOf(HOOK) === -1);
  });
});

check('A run that came through NEXT STAGE: STAGE 1 SCORE is the first row, over SCORE and TOTAL of the run; a page with ten rows has a 14 px pitch and ends above the line under it', function () {
  const t = stageEnv();
  openLevel2(t);
  t.game.state.result = fakeResult({ levelId: 2, stages: 2, stageScore: 73160, baseScore: 121230, score: 129230 });
  t.game.force('results');
  t.seconds(7);
  const boxes = drawnBoxes(t);
  const labels = ['STAGE 1 SCORE', 'SCORE', 'LIVES X3', 'ACCURACY 95%', 'NO CONTINUES', 'TOTAL', 'WPM', 'ACCURACY', 'BEST STREAK', 'KEYS TO PRACTISE'];
  assert.deepStrictEqual(labels.map(function (l) { return at(boxes, l).y; }), labels.map(function (l, i) { return 48 + i * 14; }));
  assert.ok(at(boxes, '73160') && at(boxes, '73160').y === 48 && at(boxes, '73160').x + at(boxes, '73160').w === 320, 'the carried score');
  assert.strictEqual(at(boxes, '121230').y, 62);
  assert.strictEqual(at(boxes, '129230').y, 118);
  const target = at(boxes, 'S NEEDS 97% ACCURACY, YOU HAD 95%');
  assert.ok(target && target.y === 194, 'the line under the rows');
  assert.ok(48 + 9 * 14 + 12 <= target.y, 'the tenth row and its rule end above the line');
  assertFits(boxes, 'ten rows');
  assertApart(boxes, 'ten rows');
  // After a run that ended in Level 2 the carried score is still shown; a run of one stage has no such row.
  t.game.state.result = fakeResult({ levelId: 2, cleared: false, stages: 1, bonuses: [], stageScore: 73160, baseScore: 88120, score: 88120, rank: 'B' });
  t.game.force('results');
  t.seconds(6);
  let b2 = drawnBoxes(t);
  assert.deepStrictEqual([at(b2, 'RUN ENDED').y, at(b2, 'STAGE 1 SCORE').y, at(b2, 'SCORE').y, at(b2, 'WPM').y], [8, 48, 64, 80]);
  t.game.state.result = fakeResult({ levelId: 2 });            // Level 2 from the STAGE row
  t.game.force('results');
  t.seconds(6);
  b2 = drawnBoxes(t);
  assert.ok(!at(b2, 'STAGE 1 SCORE') && at(b2, 'SCORE').y === 48 && at(b2, 'KEYS TO PRACTISE').y === 48 + 8 * 16);
});

check('BEST RUN is beside the run\'s final score: the best score of the difficulty from before the run, or NEW BEST RUN!', function () {
  const t = stageEnv();
  const noteOf = function (over, label) {
    t.game.state.result = fakeResult(over);
    t.game.force('results');
    t.seconds(6);
    const boxes = drawnBoxes(t);
    assertApart(boxes, JSON.stringify(over));
    const row = at(boxes, label);
    const notes = boxes.filter(function (b) { return b.y === row.y && b.x === row.x + row.w + 8; });
    return notes.length ? notes[0].text : null;
  };
  assert.strictEqual(noteOf({ bestScore: 61230 }, 'TOTAL'), 'BEST RUN 61230');
  assert.strictEqual(noteOf({ bestScore: 48210 }, 'TOTAL'), 'BEST RUN 48210', 'a run equal to the best is not a new best');
  assert.strictEqual(noteOf({ bestScore: 48200 }, 'TOTAL'), 'NEW BEST RUN!');
  assert.strictEqual(noteOf({ bestScore: 0 }, 'TOTAL'), 'NEW BEST RUN!');
  assert.strictEqual(noteOf({ bestScore: 0 }, 'SCORE'), null, 'the note is on the final score only');
  assert.strictEqual(noteOf({ cleared: false, bonuses: [], score: 12000, baseScore: 12000, bestScore: 48210, rank: 'B' }, 'SCORE'), 'BEST RUN 48210');
  assert.strictEqual(noteOf({ cleared: false, bonuses: [], score: 0, baseScore: 0, bestScore: 0, rank: 'C' }, 'SCORE'), null);
  // Seven digits on both sides still leave the note clear of the value.
  assert.strictEqual(noteOf({ score: 1234560, baseScore: 1226560, bestScore: 1300000 }, 'TOTAL'), 'BEST RUN 1300000');
  // WPM keeps its own note, on its own row.
  assert.strictEqual(noteOf({ bestScore: 61230 }, 'WPM'), 'NEW BEST! +2');
});

check('WPM after NEXT STAGE: NEW BEST! is for a WPM above the best from before the run and above the one the run showed at its earlier results screen', function () {
  // The note beside WPM on the first page of the results screen that is showing.
  const wpmNote = function (t) {
    const boxes = drawnBoxes(t);
    const row = at(boxes, 'WPM');
    const notes = boxes.filter(function (b) { return b.y === row.y && b.x === row.x + row.w + 8; });
    return notes.length ? notes[0].text : null;
  };
  const typing = fakeResult().typing;
  const wpm = function (v) { return Object.assign({}, typing, { wpm: v }); };
  // A run with a best of 80 from before: 85 at STAGE 1 CLEAR, which TG.Save records, then NEXT STAGE.
  const twoStages = function (final) {
    const t = stageEnv();
    t.game.state.result = fakeResult({ typing: wpm(85.4), bestWpm: 80 });
    t.game.force('results');
    t.seconds(6);
    assert.strictEqual(wpmNote(t), 'NEW BEST! +5');
    t.press('space');
    t.seconds(3);
    t.press('enter');                            // NEXT STAGE
    assert.strictEqual(t.screen(), 'playing');
    assert.strictEqual(Math.round(t.TG.Save.best('medium').wpm), 85);
    t.game.state.result = fakeResult({ levelId: 2, stages: 2, stageScore: 48210, baseScore: 91000, score: 99000, typing: wpm(final), bestWpm: 80 });
    t.game.force('results');
    t.seconds(7);
    return t;
  };
  // The whole run's WPM is under the first stage's: the best is the 85 shown before, not a new one of 82.
  const lower = twoStages(82.3);
  assert.strictEqual(wpmNote(lower), 'BEST 85');
  assert.strictEqual(Math.round(lower.TG.Save.best('medium').wpm), 85, 'the saved best is the one the screen names');
  assert.strictEqual(wpmNote(twoStages(85.2)), 'BEST 85', 'the same WPM is not a new best');
  assert.strictEqual(wpmNote(twoStages(87.1)), 'NEW BEST! +2');
  // The next run from the menus starts again. Its bests are 0, as after RESET SCORES: 60 at its first clear,
  // then 62 over both stages, which is a new best whatever the run before showed.
  lower.press('enter');                          // page 2
  lower.seconds(3);
  lower.press('enter');
  assert.strictEqual(lower.screen(), 'highScoreEntry');
  lower.type('abc');
  lower.press('enter');
  assert.strictEqual(lower.screen(), 'title');
  lower.press('esc');                            // the High Scores panel that shows the new entry
  startFakeRun(lower, 'medium');
  toLastPage(lower, fakeResult({ typing: wpm(60.2), bestWpm: 0 }));
  lower.press('enter');                          // NEXT STAGE
  assert.strictEqual(lower.screen(), 'playing');
  lower.game.state.result = fakeResult({ levelId: 2, stages: 2, stageScore: 48210, baseScore: 91000, score: 99000, typing: wpm(62.4), bestWpm: 0 });
  lower.game.force('results');
  lower.seconds(7);
  assert.strictEqual(wpmNote(lower), 'NEW BEST! +2');
  // A result that carries a stage score in a session where NEXT STAGE was not pressed has only its own best.
  const direct = stageEnv();
  direct.game.state.result = fakeResult({ levelId: 2, stages: 2, stageScore: 48210, baseScore: 91000, score: 99000, typing: wpm(82.3), bestWpm: 80 });
  direct.game.force('results');
  direct.seconds(7);
  assert.strictEqual(wpmNote(direct), 'NEW BEST! +2');
});

// The rank of DESIGN 8.6 as TG.Game gives it (LEVEL2 12.5): S and A need a cleared stage.
function rankOf(accuracy, livesLost, continues, stages) {
  if (stages > 0 && accuracy >= 0.97 && livesLost === 0 && continues === 0) return 'S';
  if (stages > 0 && accuracy >= 0.93 && livesLost <= 2 && continues === 0) return 'A';
  return accuracy >= 0.85 ? 'B' : 'C';
}

check('The rank target: one line under the first page, after the stamp, that names something the next rank up needs and the run did not have; none for rank S', function () {
  const t = stageEnv();
  const typing = fakeResult().typing;
  const lineOf = function (over, wait) {
    t.game.state.result = fakeResult(Object.assign({ bonuses: [] }, over));
    t.game.force('results');
    t.seconds(wait === undefined ? 6 : wait);
    const boxes = drawnBoxes(t).filter(function (b) { return b.y === 194; });
    assert.ok(boxes.length <= 1);
    boxes.forEach(function (b) { assert.ok(b.x >= 0 && b.x + b.w <= 384 && b.x === (384 - b.w) / 2 && b.color === SILVER, JSON.stringify(b)); });
    return boxes.length ? boxes[0].text : null;
  };
  const acc = function (a) { return Object.assign({}, typing, { accuracy: a }); };
  // The two lines the plan gives, and the rest of the set.
  assert.strictEqual(lineOf({ rank: 'A', typing: acc(0.954), livesLost: 2 }), 'S NEEDS 97% ACCURACY, YOU HAD 95%');
  assert.strictEqual(lineOf({ rank: 'B', typing: acc(0.954), livesLost: 0, continues: 1 }), 'A NEEDS NO CONTINUES');
  assert.strictEqual(lineOf({ rank: 'A', typing: acc(0.981), livesLost: 1 }), 'S NEEDS NO LIVES LOST, YOU LOST 1');
  assert.strictEqual(lineOf({ rank: 'B', typing: acc(0.909) }), 'A NEEDS 93% ACCURACY, YOU HAD 90%');
  assert.strictEqual(lineOf({ rank: 'B', typing: acc(0.954), livesLost: 4, continues: 1 }), 'A NEEDS AT MOST 2 LIVES LOST, YOU LOST 4');
  assert.strictEqual(lineOf({ rank: 'B', typing: acc(0.99), livesLost: 0, cleared: false, stages: 0 }), 'A NEEDS A CLEARED STAGE');
  assert.strictEqual(lineOf({ rank: 'C', typing: acc(0.812), cleared: false }), 'B NEEDS 85% ACCURACY, YOU HAD 81%');
  assert.strictEqual(lineOf({ rank: 'S', typing: acc(0.99), livesLost: 0 }), null);
  assert.strictEqual(lineOf({ rank: 'C', cleared: false, typing: Object.assign({}, typing, { correct: 0, wrong: 0, accuracy: 1 }) }), null, 'a run with no letter key pressed');
  // Not before the rank is stamped (the tally of these five rows ends after 1.67 s and the stamp lands
  // 0.35 s later), and not on the second page.
  const stamps = eventLog(t.TG);
  assert.strictEqual(lineOf({ rank: 'A', typing: acc(0.954) }, 1), null);
  assert.strictEqual(lineOf({ rank: 'A', typing: acc(0.954) }, 1.85), null, 'the line is there before the rank');
  assert.strictEqual(stamps.filter(function (e) { return e.name === 'ui:stamp'; }).length, 0);
  assert.strictEqual(lineOf({ rank: 'A', typing: acc(0.954) }, 2.2), 'S NEEDS 97% ACCURACY, YOU HAD 95%');
  assert.strictEqual(stamps.filter(function (e) { return e.name === 'ui:stamp'; }).length, 1);
  assert.strictEqual(lineOf({ rank: 'A', typing: acc(0.954) }), 'S NEEDS 97% ACCURACY, YOU HAD 95%');
  t.press('enter');
  t.seconds(3);
  assert.ok(drawnTexts(t).every(function (x) { return x.indexOf('NEEDS') === -1; }));

  // Against the rule itself, over every combination: the line is there for every rank but S, names
  // the next rank up, and what it names is something that rank needs and this run did not have.
  const up = { A: 'S', B: 'A', C: 'B' };
  const need = { S: { accuracy: 97, lives: 0 }, A: { accuracy: 93, lives: 2 }, B: { accuracy: 85, lives: Infinity } };
  [0.80, 0.849, 0.85, 0.90, 0.929, 0.93, 0.95, 0.969, 0.97, 1].forEach(function (a) {
    [0, 1, 2, 3, 5].forEach(function (lost) {
      [0, 1].forEach(function (continues) {
        [0, 1, 2].forEach(function (stages) {
          const rank = rankOf(a, lost, continues, stages);
          const what = [a, lost, continues, stages, rank].join(' / ');
          const line = lineOf({ rank: rank, typing: acc(a), livesLost: lost, continues: continues, stages: stages, cleared: stages > 0 });
          if (rank === 'S') { assert.strictEqual(line, null, what); return; }
          assert.ok(line && line.indexOf(up[rank] + ' NEEDS ') === 0, what + ': ' + line);
          const n = need[up[rank]];
          const pct = Math.floor(a * 100 + 1e-9);
          if (/ACCURACY/.test(line)) assert.ok(pct < n.accuracy && line === up[rank] + ' NEEDS ' + n.accuracy + '% ACCURACY, YOU HAD ' + pct + '%', what + ': ' + line);
          else if (/LIVES LOST/.test(line)) assert.ok(lost > n.lives && line.slice(-String(lost).length - 10) === ' YOU LOST ' + lost, what + ': ' + line);
          else if (/CONTINUES/.test(line)) assert.ok(continues > 0, what + ': ' + line);
          else assert.ok(/CLEARED STAGE/.test(line) && stages === 0, what + ': ' + line);
        });
      });
    });
  });
});

check('The last page with the strip and a suggestion: the suggestion, the line and the strip one under the other, the rows at a 14 px pitch, and nothing overlaps', function () {
  const t = stageEnv();
  toLastPage(t, fakeResult({ suggestion: 'READY FOR HARD?' }));
  const boxes = drawnBoxes(t);
  assert.deepStrictEqual([at(boxes, 'READY FOR HARD?').y, at(boxes, STRIP_LINE).y, at(boxes, STRIP_KEYS).y], [180, 194, 205]);
  assert.strictEqual(at(boxes, 'READY FOR HARD?').color, GOLD);
  const labels = ['PEAK WPM', 'WORDS', 'BEST KEY STREAK', 'AVERAGE REACTION', 'SLOWEST KEYS', 'INK DROPS', 'TIME', 'LIVES LOST', 'CONTINUES USED'];
  assert.deepStrictEqual(labels.map(function (l) { return at(boxes, l).y; }), labels.map(function (l, i) { return 48 + i * 14; }));
  assertFits(boxes, 'three lines under the rows');
  assertApart(boxes, 'three lines under the rows');
  // Without the strip the suggestion is where it was, under rows at the pitch of before.
  const u = stageEnv();
  toLastPage(u, fakeResult({ levelId: 2, suggestion: 'READY FOR HARD?' }));
  const b2 = drawnBoxes(u);
  assert.deepStrictEqual([at(b2, 'READY FOR HARD?').y, at(b2, 'CONTINUES USED').y, at(b2, 'ENTER: CONTINUE').y, at(b2, 'ENTER: CONTINUE').x], [194, 48 + 8 * 16, 205, 6]);
});

// ----- How to Play ------------------------------------------------------------------------------

check('How to Play: seven power-up rows, the Pocket Watch after the Red Cap, 18 px apart and all above the bottom strip at y 192; HOLD FOR ARCHES and, under it, AND TUNNELS', function () {
  const t = fakeEnv();
  t.game.force('howToPlay', { origin: 'start', difficulty: 'medium' });
  t.steps(1);
  const boxes = drawnBoxes(t);
  const names = ['SHIELD', 'HOURGLASS', 'GOLDEN QUILL', 'INK BLAST', 'RED CAP', 'POCKET WATCH', 'INK DROPS'];
  const texts = ['BLOCKS A HIT', 'SLOWS TIME', '2X POINTS', 'CLEARS WORDS', 'EXTRA LIFE', 'STOPS TIME', '100 = 1 LIFE'];
  names.forEach(function (name, i) {
    const n = at(boxes, name), x = at(boxes, texts[i]);
    assert.ok(n && x, name);
    assert.deepStrictEqual([n.x, n.y, n.color, x.x, x.y], [282, 62 + i * 18, GOLD, 282, 71 + i * 18], name);
    assert.ok(x.y + x.h <= 192 && n.x + n.w <= 384 && x.x + x.w <= 384, name + ' does not fit');
  });
  // Every line of the three columns ends above the rule at y 192.
  boxes.filter(function (b) { return b.y < 192; }).forEach(function (b) { assert.ok(b.y + b.h <= 192, '"' + b.text + '" at y ' + b.y); });
  const drawn = spritesDrawn(t);
  ['pw_shield', 'pw_hourglass', 'pw_quill', 'pw_blast', 'pw_cap', 'pw_watch', 'item_ink'].forEach(function (name) {
    assert.ok(drawn.indexOf(name) !== -1 && t.TG.Gfx.has(name), name + ' is not drawn');
  });
  const hold = at(boxes, 'HOLD FOR ARCHES'), and = at(boxes, 'AND TUNNELS');
  assert.ok(hold && and && and.x === hold.x && and.y === hold.y + 9, 'AND TUNNELS under HOLD FOR ARCHES');
  assert.ok(and.x + and.w <= 257, 'the line reaches into the third column');
  // The four keys of the middle column in order, each clear of the lines round it.
  const column = boxes.filter(function (b) { return b.x >= 127 && b.x < 257 && b.y >= 28 && b.y < 192; }).sort(function (p, q) { return p.y - q.y; });
  assert.deepStrictEqual(column.map(function (b) { return b.text; }), ['JUMP AND DUCK', 'SPACE', 'JUMP', 'OVER GAPS AND', 'BRAMBLES', 'ENTER', 'DUCK',
    'UNDER BRANCHES.', 'HOLD FOR ARCHES', 'AND TUNNELS', 'BACKSPACE', 'LETS GO OF A', 'WORD. MISTAKES', 'NEED NO FIXING.', 'ESC', 'PAUSE', 'OR USE ARROWS']);
  assertFits(boxes, 'How to Play');
  assertApart(boxes, 'How to Play');
  assert.ok(at(boxes, 'TO START') && at(boxes, 'TO START').y > 192, 'the bottom line is the READY prompt, as before');
  assert.deepStrictEqual(t.env.errors, []);
});

check('How to Play, drawn: no keycap of the middle column touches the text above or below it, and the seven icons stand in their rows', function () {
  const s = shot.createSession({ canvas: 'soft' });
  shot.reach(s, 'howToPlay', { difficulty: 'medium' });
  assert.strictEqual(s.screen(), 'howToPlay');
  const rgba = s.env.canvas.toRGBA();
  const ink = s.TG.PAL[0].toLowerCase();
  const px = function (x, y) {
    const o = (y * 384 + x) * 4;
    return '#' + [rgba[o], rgba[o + 1], rgba[o + 2]].map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  };
  const blank = function (y, x0, x1) { for (let x = x0; x < x1; x++) if (px(x, y) !== ink) return false; return true; };
  // A row of plain INK above and below each of the four keycaps (y 39, 76, 121 and 166; 15 px high).
  [39, 76, 121, 166].forEach(function (y) {
    assert.ok(blank(y - 1, 128, 256) && blank(y - 2, 128, 256), 'the keycap at y ' + y + ' touches the line above it');
    assert.ok(blank(y + 15, 128, 256), 'the keycap at y ' + y + ' touches the line below it');
  });
  // Something is drawn in each icon's place (x 262 to 278), and each row has plain INK between it and the next.
  for (let i = 0; i < 7; i++) {
    let lit = 0;
    for (let y = 62 + i * 18; y < 62 + i * 18 + 16; y++) for (let x = 262; x < 279; x++) if (px(x, y) !== ink) lit++;
    assert.ok(lit > 8, 'no icon in row ' + (i + 1));
    assert.ok(blank(62 + i * 18 + 16, 280, 384) && blank(62 + i * 18 + 17, 280, 384), 'row ' + (i + 1) + ' touches the next');
  }
  assert.ok(blank(190, 258, 384) && blank(191, 258, 384), 'the last row reaches the rule at y 192');
  assert.deepStrictEqual(s.env.errors, []);
  assert.deepStrictEqual(s.env.warnings, []);
});

// ----- the story panels and the idle rotation -----------------------------------------------------

// The lines of the story panel on screen, top to bottom: the text inside the panel (y 26 to 176).
function storyLines(t) {
  return drawnBoxes(t).filter(function (b) { return b.y > 26 && b.y < 176; }).sort(function (p, q) { return p.y - q.y; });
}

check('The idle rotation shows Level 1\'s story panel and the high scores in turn; once Level 2 is open, Level 2\'s panel takes every second turn. Neither panel has text below y 108', function () {
  const t = stageEnv();
  toMenu(t);
  t.seconds(12.5);
  assert.strictEqual(t.TG.UI.panel, 'story');
  let lines = storyLines(t);
  assert.deepStrictEqual(lines.map(function (b) { return b.text; }), STORY_1);
  assert.deepStrictEqual(lines.map(function (b) { return b.y; }), [40, 52, 64, 76]);
  let drawn = spritesDrawn(t);
  assert.ok(drawn.indexOf('boss_head') !== -1 && drawn.indexOf('boss2_head') === -1 && drawn.indexOf('hero_idle') !== -1);
  // Level 2 locked: the same panel every time.
  t.seconds(8);
  assert.strictEqual(t.TG.UI.panel, 'scores');
  t.seconds(8);
  assert.strictEqual(t.TG.UI.panel, 'story');
  assert.deepStrictEqual(storyLines(t).map(function (b) { return b.text; }), STORY_1);

  const u = stageEnv({ canvas: 'soft' });
  openLevel2(u);
  toMenu(u);
  const seen = [];
  for (let turn = 0; turn < 5; turn++) {
    u.seconds(turn === 0 ? 12.5 : 8);
    assert.strictEqual(u.TG.UI.panel, 'story', 'turn ' + turn);
    lines = storyLines(u);
    seen.push(lines[0].text);
    lines.forEach(function (b) { assert.ok(b.y + b.h <= 108, '"' + b.text + '" ends at y ' + (b.y + b.h)); });
    assertFits(drawnBoxes(u), 'story, turn ' + turn);
    assertApart(drawnBoxes(u), 'story, turn ' + turn);
    lines.forEach(function (b) { assert.ok(b.x >= 24 + 8 && b.x + b.w <= 360 - 8, '"' + b.text + '" is too wide for the panel'); });
    if (turn === 1) {
      assert.deepStrictEqual(lines.map(function (b) { return b.text; }), STORY_2);
      assert.deepStrictEqual(lines.map(function (b) { return b.y; }), [40, 52, 64]);
      drawn = spritesDrawn(u);
      ['boss2_body', 'boss2_arm', 'boss2_key', 'boss2_head', 'boss2_engine', 'hero_idle'].forEach(function (name) {
        assert.ok(drawn.indexOf(name) !== -1 && u.TG.Gfx.has(name), name + ' is not drawn on Level 2\'s panel');
      });
      assert.ok(drawn.indexOf('boss_head') === -1 && drawn.indexOf('boss_mound') === -1, 'the Baron stands on Level 2\'s panel');
    }
    u.seconds(8);
    assert.strictEqual(u.TG.UI.panel, 'scores', 'the high scores follow each story panel');
  }
  assert.deepStrictEqual(seen, [STORY_1[0], STORY_2[0], STORY_1[0], STORY_2[0], STORY_1[0]]);
  u.press('down');                               // any key: back to the menu, and the next rotation starts with Level 1 again
  assert.strictEqual(u.TG.UI.panel, 'menu');
  u.seconds(12.5);
  assert.deepStrictEqual(storyLines(u).map(function (b) { return b.text; }), STORY_1);
  assert.deepStrictEqual(u.env.errors, []);
});

check('Real modules: the idle rotation shows Level 2\'s story panel and the high scores after it over the cavern, and the menu is always over the meadow', function () {
  const s = shot.createSession({ canvas: 'stub' });      // the picture itself is in the --stage checks below
  const TG = s.TG;
  shot.unlock(s, 'hard');
  const calls = [];
  const drawBackdrop = TG.Render.drawBackdrop;
  TG.Render.drawBackdrop = function (ctx, id, palette) { calls.push(id + '/' + palette); return drawBackdrop.apply(TG.Render, arguments); };
  const tiles = [];
  const draw = TG.Gfx.draw;
  TG.Gfx.draw = function (ctx, name) { if (/^tile_/.test(name)) tiles.push(name); return draw.apply(TG.Gfx, arguments); };
  const scene = function () {
    calls.length = 0;
    tiles.length = 0;
    s.frame();
    assert.strictEqual(calls.length, 1);
    return TG.UI.panel + ' ' + calls[0] + ' ' + tiles.filter(function (n, i) { return tiles.indexOf(n) === i; }).sort().join('+');
  };
  s.frames(2);
  s.press('enter');
  s.seconds(1.3);
  const meadow = 'meadow/day tile_grass+tile_soil', cavern = 'cavern/lantern tile_cave_fill+tile_cave_top';
  assert.strictEqual(scene(), 'menu ' + meadow);
  s.seconds(12.5);
  assert.strictEqual(scene(), 'story ' + meadow);
  s.seconds(8);
  assert.strictEqual(scene(), 'scores ' + meadow);
  s.seconds(8);
  assert.strictEqual(scene(), 'story ' + cavern);
  s.seconds(8);
  assert.strictEqual(scene(), 'scores ' + cavern);
  s.seconds(8);
  assert.strictEqual(scene(), 'story ' + meadow);
  s.seconds(16);
  assert.strictEqual(scene(), 'story ' + cavern);
  s.press('enter');                              // any key ends the rotation
  assert.strictEqual(scene(), 'menu ' + meadow);
  s.press('enter');
  assert.strictEqual(s.screen(), 'difficultySelect');
  assert.deepStrictEqual(s.env.errors, []);
  assert.deepStrictEqual(s.env.warnings, []);
});

// ----- the High Scores panel --------------------------------------------------------------------

check('The High Scores panel still has four pages with Level 2 open: WORLD EASY, WORLD MEDIUM, WORLD HARD and THIS COMPUTER, and three tables of five without world scores', function () {
  const t = worldEnv({ levels: true });
  openLevel2(t);
  t.TG.Save.setSetting('lastLevel', 2);
  toMenu(t);
  t.press('down'); t.press('down'); t.press('enter');
  assert.strictEqual(t.TG.UI.panel, 'scores');
  const pages = [], headers = [];
  for (let i = 0; i < 5; i++) {
    pages.push(t.TG.UI.page);
    const texts = drawnTexts(t);
    headers.push(texts.filter(function (x) { return /^\d\/\d$/.test(x); })[0] + ' ' + texts.filter(function (x) { return /^WORLD (EASY|MEDIUM|HARD)$|^THIS COMPUTER$/.test(x); })[0]);
    assert.ok(texts.every(function (x) { return x.indexOf('STAGE') === -1 && x.indexOf('CAVERNS') === -1; }), 'a stage on the panel: ' + texts.join(' | '));
    t.press('right');
  }
  assert.deepStrictEqual(pages, ['medium', 'hard', 'local', 'easy', 'medium']);
  assert.deepStrictEqual(headers, ['2/4 WORLD MEDIUM', '3/4 WORLD HARD', '4/4 THIS COMPUTER', '1/4 WORLD EASY', '2/4 WORLD MEDIUM']);
  // Without world scores: the three tables of this computer, as before.
  const u = stageEnv();
  openLevel2(u);
  toMenu(u);
  u.press('down'); u.press('down'); u.press('enter');
  assert.strictEqual(u.TG.UI.page, null);
  const boxes = drawnBoxes(u);
  assert.strictEqual(boxes.length, 1 + 3 + 3 * 5 * 2 + 1, 'the title, three labels, fifteen entries of two lines and the footer');
  TODAY_SCORES.forEach(function (want) {
    assert.ok(boxes.some(function (b) { return b.text === want[0] && b.y === want[1]; }), '"' + want[0] + '" at y ' + want[1]);
  });
});

// ----- the real modules ---------------------------------------------------------------------------

check('Real modules: a cleared Level 1 run, NEXT STAGE on Enter and not on Space; Level 2 starts with the score carried and nothing entered; ended from the pause menu, the run is entered once, as cleared, with its total', function () {
  const s = shot.createSession({ canvas: 'stub' });
  const TG = s.TG;
  const ctx = s.env.canvas.getContext('2d');
  const texts = function () { return textsDrawn(TG, function () { TG.UI.draw(ctx, TG.Game.state); }); };
  shot.startRun(s, 'easy');
  assert.strictEqual(TG.Game.state.levelId, 1, 'a first run starts at Level 1');
  const bot = shot.createBot({ wpm: 70 });
  assert.ok(shot.playUntil(s, 'results', bot, 1500), 'reached results, the screen is ' + s.screen());
  s.frames(2);
  const r1 = TG.Game.state.result;
  assert.ok(r1.cleared === true && r1.stages === 1, 'the level was cleared');
  assert.strictEqual(TG.Save.levelOpen(2), true, 'the clear opened Level 2');
  assert.ok(texts().indexOf(UNLOCKED) !== -1, 'the first clear is announced');
  s.seconds(0.6);
  s.press('space');                               // finish the tally
  s.press('space');                               // page 2
  s.seconds(2);
  let x = texts();
  assert.ok(x.indexOf(STRIP_KEYS) !== -1 && x.indexOf(STRIP_LINE) !== -1, x.slice(-4).join(' | '));
  s.press('space');
  s.seconds(0.2);
  assert.strictEqual(s.screen(), 'results', 'Space took NEXT STAGE');
  s.press('enter');
  assert.strictEqual(s.screen(), 'playing');
  const st = TG.Game.state;
  assert.deepStrictEqual([st.levelId, st.score, st.result, st.run.stages, st.level.name], [2, r1.score, null, 1, 'CLOCKWORK CAVERNS']);
  assert.strictEqual(TG.Save.scores('easy').filter(function (e) { return e.date !== ''; }).length, 0, 'the run was entered at STAGE 1 CLEAR');
  assert.strictEqual(TG.Save.pending().entry.score, r1.score, 'the Stage 1 entry is kept in case the run never ends');
  bot.pressed = {};
  s.steps(60 * 20, bot);                          // twenty seconds of Level 2
  s.frame();
  assert.ok(TG.Game.state.score > r1.score, 'no points in Level 2');
  s.press('esc');
  s.press('up');                                  // from RESUME round to QUIT
  s.press('enter');
  s.press('enter');
  assert.strictEqual(s.screen(), 'results');
  const r2 = TG.Game.state.result;
  assert.deepStrictEqual([r2.cleared, r2.stages, r2.levelId, r2.stageScore], [false, 1, 2, r1.score]);
  assert.ok(r2.score > r1.score && r2.time > r1.time);
  s.seconds(4.5);
  x = texts();
  assert.ok(x.indexOf('RUN ENDED') !== -1 && x.indexOf('STAGE 1 SCORE') !== -1 && x.indexOf(String(r1.score)) !== -1, x.slice(0, 8).join(' | '));
  s.press('enter');                               // page 2
  s.seconds(2);
  x = texts();
  assert.ok(x.indexOf('ENTER: CONTINUE') !== -1 && x.indexOf(STRIP_KEYS) === -1 && x.indexOf(HOOK) === -1);
  s.press('enter');
  assert.strictEqual(s.screen(), 'highScoreEntry', 'the initials screen comes at the end of the run');
  s.type('xyz');
  s.press('enter');
  assert.strictEqual(s.screen(), 'title');
  const mine = stubs.plain(TG.Save.scores('easy')).filter(function (e) { return e.date !== ''; });
  assert.strictEqual(mine.length, 1, 'one entry per run');
  assert.deepStrictEqual([mine[0].name, mine[0].score, mine[0].cleared, mine[0].rank], ['XYZ', r2.score, true, r2.rank]);
  assert.strictEqual(TG.Save.pending(), null);
  assert.strictEqual(TG.Save.best('easy').score, r2.score);
  // The STAGE row is there now, and a run from it starts at Level 2.
  s.press('esc');
  s.press('enter');
  assert.strictEqual(s.screen(), 'difficultySelect');
  assert.ok(texts().indexOf('STAGE 1  QUILL MEADOWS') !== -1);
  s.press('down');
  s.type('hard');
  s.type('ready');
  assert.deepStrictEqual([s.screen(), TG.Game.state.levelId, TG.Game.state.difficulty, TG.Game.state.score, TG.Game.state.run.stages], ['playing', 2, 'hard', 0, 0]);
  assert.strictEqual(TG.Game.state.player.lives, 3);
  assert.deepStrictEqual(s.env.errors, []);
  assert.deepStrictEqual(s.env.warnings, []);
});

// ----- the pictures -----------------------------------------------------------------------------

[
  ['the difficulty screen with the STAGE row on STAGE 1', 'difficultySelect', { stage: '1' }, ['STAGE 1  QUILL MEADOWS']],
  ['the difficulty screen with the STAGE row on STAGE 2', 'difficultySelect', { stage: '2', difficulty: 'hard' }, ['STAGE 2  CLOCKWORK CAVERNS']],
  ['Level 2\'s story panel', 'title', { panel: 'story', stage: '2' }, STORY_2],
  ['the results of a first cleared Level 1 run, page 1', 'results', {}, ['STAGE 1 CLEAR!', UNLOCKED, 'ENTER: NEXT']],
  ['the results of a cleared Level 1 run with the strip', 'results', { page: 2, stage: '1' }, ['STAGE 1 CLEAR!', STRIP_LINE, STRIP_KEYS]],
  ['the results of a Level 2 run from the STAGE row', 'results', { stage: '2', difficulty: 'easy' }, ['STAGE 2 CLEAR!', HOOK]],
  ['the results at the end of a two-stage run', 'results', { stage: '1+2', difficulty: 'hard' }, ['STAGE 2 CLEAR!', HOOK, 'STAGE 1 SCORE', 'TOTAL']],
  ['the initials screen at the end of a two-stage run', 'highScoreEntry', { stage: '1+2', world: 'ready' }, ['NEW HIGH SCORE!', 'INITIALS AND SCORE ALSO GO TO WORLD SCORES']]
].forEach(function (c) {
  check('Software canvas, real modules: ' + c[0] + ' draws without errors, with every line on the screen and none on another (tools/shot-ui.js --stage)', function () {
    const s = shot.createSession({ canvas: 'soft', world: shot.worldFor(c[2]) });
    shot.reach(s, c[1], c[2]);
    assert.strictEqual(s.screen(), c[1]);
    const ctx = s.env.canvas.getContext('2d');
    const boxes = textBoxes(s.TG, function () { s.TG.UI.draw(ctx, s.TG.Game.state); });
    const texts = boxes.map(function (b) { return b.text; });
    c[3].forEach(function (want) { assert.ok(texts.indexOf(want) !== -1, '"' + want + '" is not drawn: ' + texts.join(' | ')); });
    assertFits(boxes, c[0]);
    assertApart(boxes, c[0]);
    if (c[2].stage === '1+2') {
      // One run through both stages: its entry and its submission are still to come, and come once.
      const res = s.TG.Game.state.result;
      assert.deepStrictEqual([res.levelId, res.stages, res.cleared], [2, 2, true]);
      assert.ok(res.stageScore > 0 && res.score > 2 * res.stageScore * 0.6, 'the run total: ' + res.stageScore + ' then ' + res.score);
      assert.strictEqual(s.TG.Save.scores(res.difficulty).filter(function (e) { return e.date !== ''; }).length, 0);
      if (s.world) assert.strictEqual(s.world.calls.filter(function (q) { return q.path === '/v1/runs'; }).length, 1, 'one run token for the whole run');
    }
    s.frame();
    assert.deepStrictEqual(s.env.errors, []);
    assert.deepStrictEqual(s.env.warnings, []);
  });
});

check('tools/shot-ui.js: --stage is checked, and 1+2 is for the screens at the end of a run', function () {
  const error = console.error;
  const lines = [];
  console.error = function () { lines.push(Array.prototype.join.call(arguments, ' ')); };
  try {
    assert.strictEqual(shot.main(['--screen', 'difficultySelect', '--out', 'x.png', '--stage', '3']), 2);
    assert.strictEqual(shot.main(['--screen', 'title', '--out', 'x.png', '--stage', '1+2']), 2);
  } finally {
    console.error = error;
  }
  assert.strictEqual(lines.length, 2);
  assert.ok(/--stage must be one of 1, 2, 1\+2/.test(lines[0]) && /--stage 1\+2 is for results and highScoreEntry/.test(lines[1]), lines.join(' | '));
  assert.ok(!fs.existsSync(path.join(ROOT, 'x.png')), 'a picture was written');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + skipped + ' skipped');
process.exitCode = failed > 0 ? 1 : 0;
