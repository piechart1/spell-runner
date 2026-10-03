// test/test-integration.js
// Integration checks for the whole game (WP-H). CONTRACT 12 (WP-H checklist), 9 and 10.
//
//   node test/test-integration.js            every check (about 90 s)
//   node test/test-integration.js --quick    skips the three full bot runs and the clumsy players
//
// Prints one line per check (ok / FAIL / skip) and exits with 0 when every check passed.
//
// Every check loads all 20 game files under test/stubs.js with the software canvas
// (tools/softcanvas.js), which throws on any canvas call outside the subset of CONTRACT 13.2. The
// game is driven the way a player drives it: keydown and keyup events through env.dispatch, frames
// through env.runFrame and the real TG.Main loop. Long stretches of play use TG.Main.tick with the
// small bot of tools/shot-ui.js, or the acceptance bot of test/sim.js. Each session must end with no
// captured console.error and no console.warn (a placeholder sprite, an unknown sound or track, an
// unknown event and a refused screen change all warn).
//
// What is checked:
//   1. static: every file present; no network API, remote address or external file in the page, the
//      style sheet or any script, except that js/board.js (world scores) may call the network function
//      it is handed and holds the one remote address, TG.Board.URL; every sound and track name used by
//      audio.js is in its registries
//   2. boot -> title -> difficulty select -> how to play -> playing by key events, 600 frames, on each
//      difficulty
//   3. a whole run by the test/sim.js bot on each difficulty with TG.Main.tick, TG.Audio.update and
//      TG.Render.draw on every step (skipped with --quick)
//   4. pause and resume on playing, bossIntro and boss; a pause during lifeLost is deferred; pauses are
//      ignored on levelComplete; losing focus and a hidden tab; a long frame
//   5. game over, then continue, at each checkpoint including the boss; game over, then the countdown
//      runs out
//   6. quit to the title from pause, then a new run with nothing left over; a second run after
//      finishing the first; high score entry
//   7. options changed on the title and kept after a reload; storage missing and storage that throws
//   8. a clumsy player: random keys, Backspace, stray jumps and ducks, pauses, blur and long frames
//      until the run is over (skipped with --quick)
'use strict';

const fs = require('fs');
const path = require('path');
const stubs = require('./stubs');
const shot = require('../tools/shot-ui');

const ROOT = stubs.ROOT;
const QUICK = process.argv.indexOf('--quick') !== -1;
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

function assert(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ---------------------------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------------------------

// A browser-like session (tools/shot-ui.js) with frames that also move the audio clock.
function session(opts) {
  const s = shot.createSession(Object.assign({ canvas: 'soft' }, opts || {}));
  const frame = s.frame;
  s.frame = function () {
    frame();
    s.env.audio.advance(DT);
  };
  s.frames = function (n) {
    for (let i = 0; i < n; i++) s.frame();
  };
  s.seconds = function (sec) {
    s.frames(Math.round(sec * 60));
  };
  s.press = function (name) {
    const e = s.key(name);
    s.frame();
    return e;
  };
  s.type = function (text) {
    for (const ch of text) s.press(ch);
  };
  return s;
}

// Nothing was written to console.error or console.warn in the session.
function quiet(s, where) {
  const out = s.env.errors.map((m) => 'error: ' + m).concat(s.env.warnings.map((m) => 'warn: ' + m));
  assert(out.length === 0, (where ? where + ': ' : '') + out.slice(0, 4).join(' | '));
}

function loopSeq(TG) {
  return TG.Audio._internals.sequencer('loop');
}

// From boot to the first step of play through the menus.
function startRun(s, difficulty) {
  s.frames(2);
  s.press('enter');                 // boot -> title
  s.seconds(1.3);                   // the logo is stamped
  if (s.TG.UI.panel !== 'menu') {   // a panel left open (for example the high scores after an entry)
    s.press('esc');
    s.frames(5);
  }
  s.press('enter');                 // START -> difficultySelect
  s.frames(10);
  s.type(difficulty);               // typing the name selects and confirms it
  s.frames(10);
  s.type('ready');                  // howToPlay -> playing
  return s.screen() === 'playing';
}

// From the title menu (already on the title) to play.
function startFromTitle(s, difficulty) {
  if (s.TG.UI.panel !== 'menu') {
    s.press('esc');
    s.frames(10);
  }
  s.press('enter');
  s.frames(10);
  s.type(difficulty);
  s.frames(10);
  s.type('ready');
  return s.screen() === 'playing';
}

// Runs fixed steps with the bot (no drawing) until pred() is true. Returns pred().
function stepUntil(s, bot, pred, maxSeconds) {
  const limit = Math.round((maxSeconds || 900) * 60);
  for (let i = 0; i < limit; i++) {
    if (pred()) return true;
    s.steps(1, bot);
  }
  return pred();
}

// Presses Enter on the results screen until it is left; then fills in initials if asked.
function leaveResults(s, initials) {
  s.seconds(0.7);                   // results ignore keys for 0.5 s
  for (let i = 0; i < 10 && s.screen() === 'results'; i++) {
    s.press('enter');
    s.frames(10);
  }
  if (s.screen() === 'highScoreEntry') {
    if (initials) s.type(initials);
    s.press('enter');
    s.frames(5);
  }
}

// ---------------------------------------------------------------------------------------------
// 1. Static checks
// ---------------------------------------------------------------------------------------------

check('all 20 files load under the stubs with the software canvas; no sprite of CONTRACT 6.4 is missing', function () {
  const env = stubs.load({ canvas: 'soft' });
  assert(env.missing.length === 0, 'missing: ' + env.missing.join(', '));
  assert(env.loaded.length === stubs.FILES.length, 'loaded ' + env.loaded.length);
  const missing = env.TG.Sprites.missing();
  assert(missing.length === 0, 'TG.Sprites.missing(): ' + missing.join(', '));
  assert(env.errors.length === 0 && env.warnings.length === 0, 'console output while loading');
  assert(env.canvasCalls.count === 0 && env.audio.contexts.length === 0, 'canvas or audio used at load time');
});

// The game loads nothing from the network, and one module may talk to it: js/board.js, the world
// scores (CONTRACT 2.2 rule 10 and 4.22). Every other file is held to the rule the game had before
// world scores: no remote address and no network API at all. js/board.js may call the network function
// that TG.Main hands it, in one place; it may use no other network API; and the only remote address
// under js/ is the value of TG.Board.URL, which is empty until a service is deployed. js/main.js takes
// the network function from the window in one helper and hands it to TG.Board in one place; it does
// not call it or keep it (mainHandsOver below).
const NETWORK_ADDRESS = /https?:\/\/[^\s'"`)<>]*/g;
// An address written without its scheme: a quote, two slashes, then the start of a host name.
const BARE_ADDRESS = /['"`]\/\/[A-Za-z0-9[]/;

// What is wrong with the way js/main.js (its code, without comment lines) deals with the network
// function: a list of messages, empty when all is well. The helper networkFunction is named twice,
// where it is defined and in the TG.Board.init line, so its result is neither called nor stored; and
// win.fetch is read only inside that helper.
function mainHandsOver(code) {
  const out = [];
  const named = (code.match(/\bnetworkFunction\b/g) || []).length;
  if (named !== 2) out.push('networkFunction is named ' + named + ' times, not twice (its definition and the TG.Board.init line)');
  if (!/\bfunction networkFunction\(\) \{/.test(code)) out.push('function networkFunction() is not defined');
  if (!/TG\.Board\.init\(\{ fetch: networkFunction\(\), now: wallClock \}\)/.test(code)) out.push('networkFunction() is not handed to TG.Board.init');
  const body = /\bfunction networkFunction\(\) \{\n([\s\S]*?)\n  \}\n/.exec(code);
  const all = (code.match(/\bfetch\b/g) || []).length;
  // In the helper: typeof win.fetch, win.fetch.bind(win). In the init line: the key of the object.
  const inside = body ? (body[1].match(/\bwin\.fetch\b/g) || []).length : 0;
  if (inside !== 2) out.push('networkFunction reads win.fetch ' + inside + ' times, not twice');
  if (all !== inside + 1) out.push('the word fetch is used ' + all + ' times, not ' + (inside + 1) + ': somewhere outside networkFunction and the TG.Board.init line');
  if (body && /\bfetch\b[^\n]*\(\s*['"`]/.test(body[1].replace(/win\.fetch\.bind\(win\)/g, ''))) out.push('networkFunction calls the function');
  return out;
}

check('network: only js/board.js may make requests, and only to TG.Board.URL; no other file has a remote address, a network API or an external file', function () {
  const BOARD = 'js/board.js';
  const files = ['index.html', 'css/style.css'].concat(stubs.FILES);
  assert(stubs.FILES.indexOf(BOARD) !== -1, BOARD + ' is not one of the game files');
  const address = NETWORK_ADDRESS;
  const fetchCall = /\bfetch\s*\(/;
  const bad = [
    [/XMLHttpRequest/, 'XMLHttpRequest'],
    [/WebSocket/, 'WebSocket'], [/EventSource/, 'EventSource'], [/sendBeacon/, 'sendBeacon'],
    [/\bimport\s*\(/, 'import()'], [/new\s+Image\s*\(/, 'Image'], [/\.src\s*=/, 'a src assignment'],
    [/serviceWorker/, 'serviceWorker'], [/new\s+Audio\s*\(/, 'Audio element'], [/@import/, '@import'],
    [/url\(\s*['"]?(?!data:)[^)'"\s]/, 'url() of a file']
  ];
  const codeOf = function (f) {
    return read(f).split('\n').map(function (line) {
      return line.replace(/^\s*\/\/.*$/, '').replace(/^\s*\*.*$/, '').replace(/\/\*.*?\*\//g, '');
    });
  };
  const found = [];
  const addresses = [];          // { file, line, text }: every remote address in the code
  const fetchCalls = [];         // 'file:line' of every call of a function named fetch
  for (const f of files) {
    codeOf(f).forEach(function (code, i) {
      for (const [re, what] of bad) if (re.test(code)) found.push(f + ':' + (i + 1) + ' ' + what);
      if (BARE_ADDRESS.test(code)) found.push(f + ':' + (i + 1) + ' an address without a scheme');
      (code.match(address) || []).forEach(function (text) { addresses.push({ file: f, line: i + 1, text: text }); });
      if (fetchCall.test(code)) fetchCalls.push(f + ':' + (i + 1));
    });
  }
  assert(found.length === 0, found.slice(0, 6).join('; '));

  // fetch: called in js/board.js only, once, and there it is the function that init was given.
  const elsewhere = fetchCalls.filter((c) => c.indexOf(BOARD + ':') !== 0);
  assert(elsewhere.length === 0, 'fetch is called outside ' + BOARD + ': ' + elsewhere.join(', '));
  assert(fetchCalls.length === 1, BOARD + ' calls fetch in ' + fetchCalls.length + ' places: ' + fetchCalls.join(', '));
  const boardCode = codeOf(BOARD).join('\n');
  assert(/\bnet\.fetch\(baseUrl\(\) \+ path, options\)/.test(boardCode), 'the request is not made to baseUrl() + path');
  assert(!/\b(window|root|globalThis|self)\.fetch\b/.test(boardCode), BOARD + ' reaches for a global fetch');
  // Outside js/board.js nothing refers to a fetch function (as a property, a key or by name in
  // brackets), except js/main.js where the window's function is handed over. The word itself is
  // allowed: it is in the word lists.
  const fetchUse = /\.fetch\b|\bfetch\s*[:(]|\[\s*['"]fetch['"]\s*\]/;
  for (const f of stubs.FILES) {
    if (f === BOARD) continue;
    codeOf(f).forEach(function (code, i) {
      if (!fetchUse.test(code)) return;
      const handOver = f === 'js/main.js' && (/win\.fetch\.bind\(win\)/.test(code) || /TG\.Board\.init\(\{ fetch: networkFunction\(\), now: wallClock \}\)/.test(code));
      assert(handOver, f + ':' + (i + 1) + ' refers to fetch: ' + code.trim());
    });
  }
  // js/main.js hands the function over and does nothing else with it (CONTRACT 4.21).
  const handOverFaults = mainHandsOver(codeOf('js/main.js').join('\n'));
  assert(handOverFaults.length === 0, 'js/main.js: ' + handOverFaults.join('; '));

  // Remote addresses: none in the page or the style sheet; under js/ only the value of TG.Board.URL.
  const env = stubs.load({ files: ['js/core.js', BOARD] });
  const url = env.TG.Board.URL;
  assert(typeof url === 'string', 'TG.Board.URL is not a string');
  assert(url === '' || /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.workers\.dev$/.test(url),
    'TG.Board.URL must be empty or an https address ending in .workers.dev, without a path: ' + url);
  const other = addresses.filter((a) => !(a.file === BOARD && url !== '' && a.text === url));
  assert(other.length === 0, 'remote addresses: ' + other.slice(0, 6).map((a) => a.file + ':' + a.line + ' ' + a.text).join('; '));
  assert(addresses.length === (url === '' ? 0 : 1), 'the address of TG.Board.URL is written ' + addresses.length + ' times');

  // The page itself refers only to the scripts, the style sheet and an empty data: icon.
  const html = read('index.html');
  const refs = [];
  html.replace(/(?:src|href)\s*=\s*"([^"]*)"/g, function (m, v) { refs.push(v); return m; });
  const allowed = new Set(stubs.FILES.concat(['css/style.css', 'data:,']));
  const others = refs.filter((r) => !allowed.has(r));
  assert(others.length === 0, 'other references: ' + others.join(', '));
});

// The check above is only worth something if it fails when it should. Each of these changes to a
// copy of the rules is one it has to catch.
check('network: the rules of the check above catch a fetch call, a remote address and a second address in the wrong place', function () {
  const fetchCall = /\bfetch\s*\(/;
  const address = /https?:\/\/[^\s'"`)<>]*/g;
  assert(fetchCall.test("fetch('data.json')") && fetchCall.test('window.fetch (u)') && fetchCall.test('net.fetch(a, b)'));
  assert(!fetchCall.test('win.fetch.bind(win)') && !fetchCall.test('typeof win.fetch === \'function\'') && !fetchCall.test('{ fetch: networkFunction() }'));
  assert(!fetchCall.test('prefetch(1)') && !fetchCall.test('// fetch (see above)'.replace(/^\s*\/\/.*$/, '')));
  const two = "URL: 'https://x.workers.dev', other: \"http://a.example/b\"".match(address);
  assert(two.length === 2 && two[0] === 'https://x.workers.dev' && two[1] === 'http://a.example/b', two.join(' '));
  const ok = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.workers\.dev$/;
  ['https://spell-runner-scores.someone.workers.dev', 'https://a.workers.dev'].forEach(function (u) { assert(ok.test(u), u); });
  ['http://spell-runner-scores.someone.workers.dev', 'https://spell-runner-scores.someone.workers.dev/', 'https://workers.dev.example.com',
    'https://example.com', 'https://x.workers.dev/v1', 'https://x.workers.dev?a=1', '//x.workers.dev', 'https://x.workers.dev.evil.net',
    'https://evilworkers.dev', 'https://user@x.workers.dev', 'https://x.workers.dev:8443'].forEach(function (u) { assert(!ok.test(u), u + ' is accepted'); });
  // An address without a scheme, in any kind of quotes; a comment marker or a regular expression is not one.
  ["fetch('//example.com/x')", 'var u = "//cdn.example/a.js";', 'x(`//[::1]/y`)', "kept('//10.0.0.1/x')"].forEach(function (line) {
    assert(BARE_ADDRESS.test(line), line + ' is not seen as an address');
  });
  ["var a = b; // 'quoted' words", "s.replace(/\\/+$/, '')", "var slash = '/';", "x = '// not an address';", "'' //empty"].forEach(function (line) {
    assert(!BARE_ADDRESS.test(line), line + ' is taken for an address');
  });
});

// js/main.js takes window.fetch for TG.Board and must not use it itself. Each change below to a copy
// of its code is one that the rule has to catch; the file as it is has to pass.
check('network: js/main.js hands the network function to TG.Board and neither calls nor keeps it; a call through the helper is caught', function () {
  const code = read('js/main.js').split('\n').map(function (line) { return line.replace(/^\s*\/\/.*$/, ''); }).join('\n');
  assert(mainHandsOver(code).length === 0, mainHandsOver(code).join('; '));
  const marker = '  function wallClock() {';
  assert(code.indexOf(marker) !== -1, 'wallClock was not found in js/main.js');
  const withLine = function (text) { return code.replace(marker, text + '\n\n' + marker); };
  const leaks = [
    ['a call through the helper', withLine("  function leak() { networkFunction()('//example.com/x'); }")],
    ['the function kept in a variable', withLine("  var kept = null;\n  function leak() { kept = networkFunction(); kept('//example.com/x'); }")],
    ['the function handed to something else', withLine('  function leak() { TG.Other.use(networkFunction()); }')],
    ['win.fetch read outside the helper', withLine('  function leak() { return win.fetch.bind(win); }')],
    ['win.fetch called', withLine("  function leak() { win.fetch('data.json'); }")],
    ['fetch by another name of the window', withLine("  function leak() { return window.fetch; }")],
    ['a call inside the helper', code.replace('return win && typeof win.fetch', "win.fetch('data.json');\n      return win && typeof win.fetch")],
    ['the helper renamed away', code.replace(/networkFunction/g, 'net')],
    ['no hand-over', code.replace('TG.Board.init({ fetch: networkFunction(), now: wallClock })', 'TG.Board.init({ fetch: null, now: wallClock })')]
  ];
  leaks.forEach(function (c) {
    assert(c[1] !== code, c[0] + ': the change was not made');
    assert(mainHandsOver(c[1]).length > 0, c[0] + ' is not caught');
  });
});

check('every sound and track name that audio.js plays is in TG.Audio.SFX or TG.Audio.TRACKS (CONTRACT 7)', function () {
  const env = stubs.load({ files: ['js/core.js', 'js/audio.js'] });
  const TG = env.TG;
  const src = read('js/audio.js');
  const sfx = new Set(TG.Audio.SFX), tracks = new Set(TG.Audio.TRACKS);
  const bad = [];
  src.replace(/\bplaySfx\(\s*'([a-z0-9_]+)'/g, function (m, n) { if (!sfx.has(n)) bad.push('sfx ' + n); return m; });
  src.replace(/\b(?:jingle|playMusic|ensureLoop|loopAfterOnce|music)\(\s*'([a-z0-9_]+)'/g, function (m, n) {
    if (!tracks.has(n)) bad.push('track ' + n);
    return m;
  });
  assert(bad.length === 0, bad.join(', '));
  // No other file plays a sound by name (CONTRACT 7: TG.Audio plays everything in response to events).
  for (const f of stubs.FILES) {
    if (f === 'js/audio.js') continue;
    const m = read(f).match(/TG\.Audio\.(sfx|music|jingle)\(\s*'([a-z0-9_]+)'/);
    if (m && !(sfx.has(m[2]) || tracks.has(m[2]))) bad.push(f + ' ' + m[2]);
  }
  assert(bad.length === 0, bad.join(', '));
});

// ---------------------------------------------------------------------------------------------
// 2. Boot to play by key events
// ---------------------------------------------------------------------------------------------

for (const difficulty of ['easy', 'medium', 'hard']) {
  check('boot -> title -> difficultySelect -> howToPlay -> playing by key events on ' + difficulty +
    ', then 600 frames through env.runFrame, with no console output', function () {
    const s = session();
    const TG = s.TG;
    const seen = [];
    TG.Events.on('screen:change', (p) => seen.push(p.to));
    const unknown = [];
    const names = new Set(TG.Events.NAMES);
    TG.Events.on('*', (p, n) => { if (!names.has(n)) unknown.push(n); });
    s.frames(5);
    assert(s.screen() === 'boot', 'not on boot: ' + s.screen());
    s.press('enter');
    s.seconds(1.3);
    s.press('enter');
    s.frames(20);
    s.type(difficulty);
    s.frames(20);
    s.type('ready');
    s.frames(600);
    assert(seen.slice(0, 4).join('>') === 'title>difficultySelect>howToPlay>playing', 'screens ' + seen.join('>'));
    assert(TG.Game.state.difficulty === difficulty, 'difficulty ' + TG.Game.state.difficulty);
    assert(TG.Audio.isUnlocked(), 'audio was not unlocked by the first key');
    assert(loopSeq(TG).name === 'level1' && loopSeq(TG).playing, 'level track not playing: ' + JSON.stringify(loopSeq(TG)));
    assert(TG.Game.state.screen === 'playing' || TG.Game.state.screen === 'lifeLost', 'screen ' + TG.Game.state.screen);
    assert(unknown.length === 0, 'unknown events: ' + unknown.join(', '));
    quiet(s);
  });
}

// ---------------------------------------------------------------------------------------------
// 3. Whole runs by the acceptance bot with rendering and sound on
// ---------------------------------------------------------------------------------------------

function renderedRun(difficulty) {
  const sim = require('./sim');
  let env = null;
  const load = stubs.load;
  stubs.load = function (o) {
    env = load(Object.assign({}, o || {}, { canvas: 'soft' }));
    return env;
  };
  const played = new Set();
  let draws = 0;
  let report;
  try {
    report = sim.runBot({
      difficulty: difficulty, seed: 1, profile: 'target', until: 'results',
      setup: function (TG) {
        TG.Gfx.init(env.document);
        TG.Audio.init();
        TG.Effects.init();
        TG.Hud.init();
        TG.Render.init(env.canvas);
        TG.UI.init();
        TG.Audio.unlock();
        const log = TG.Audio._internals.sfxLog;
        const step = TG.Game.step;
        let inTick = false;
        TG.Game.step = function (dt) {
          if (inTick) return step(dt);
          inTick = true;
          try { TG.Main.tick(dt); } finally { inTick = false; }
          env.audio.advance(dt);
          TG.Audio.update(dt);
          TG.Render.draw(TG.Game.state);
          draws++;
          for (const n of log) played.add(n);
        };
      }
    });
  } finally {
    stubs.load = load;
  }
  return { report: report, env: env, played: played, draws: draws };
}

for (const difficulty of ['easy', 'medium', 'hard']) {
  check('a whole ' + difficulty + ' run by the test/sim.js bot, with TG.Main.tick, TG.Audio.update and TG.Render.draw ' +
    'on every step: finished, every assertion of test/sim.js held, no console output, no placeholder', function () {
    if (QUICK) return 'skip';
    const r = renderedRun(difficulty);
    assert(!r.report.error, r.report.error);
    assert(r.report.finished && r.report.continues === 0, 'finished ' + r.report.finished + ', continues ' + r.report.continues);
    assert(r.draws === r.report.steps, 'draws ' + r.draws + ' for ' + r.report.steps + ' steps');
    assert(r.env.errors.length === 0 && r.env.warnings.length === 0, r.env.errors.concat(r.env.warnings).slice(0, 3).join(' | '));
    assert(r.env.TG.Sprites.missing().length === 0, 'missing sprites');
    for (const n of ['key_ok', 'lock_on', 'word_clear', 'jump', 'land', 'slide', 'checkpoint', 'boss_hit', 'boss_defeat', 'deflect']) {
      assert(r.played.has(n), 'never played: ' + n);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// 4. Pause, focus and long frames
// ---------------------------------------------------------------------------------------------

check('pause and resume on playing, bossIntro and boss (Esc, the 3-2-1 countdown, Esc again); ignored on levelComplete', function () {
  const s = session();
  const TG = s.TG;
  assert(startRun(s, 'medium'), 'run did not start');
  const bot = shot.createBot();
  s.steps(60 * 8, bot);
  s.frame();
  for (const where of ['playing', 'bossIntro', 'boss']) {
    if (where !== 'playing') assert(stepUntil(s, bot, () => s.screen() === where, 600), 'never reached ' + where);
    if (where === 'boss') s.steps(60 * 3, bot);
    s.steps(20, bot);
    s.frame();
    if (s.screen() !== where) continue;
    const introT = TG.Game.state.boss ? TG.Game.state.boss.stateT : 0;
    s.press('esc');
    s.frames(3);
    assert(s.screen() === 'paused' && TG.Game.state.resumeTo === where, where + ': not paused (' + s.screen() + ')');
    assert(TG.Game.state.typing.target === null, where + ': the lock was not released');
    // (During bossIntro no loop plays: the level track stops there and the boss track starts on boss.)
    assert(loopSeq(TG).paused || !loopSeq(TG).playing, where + ': the sequencer was not stopped');
    const t0 = TG.Game.state.time;
    s.seconds(1);
    assert(TG.Game.state.time === t0, where + ': the simulation ran while paused');
    s.press(where === 'boss' ? 'esc' : 'enter');     // Esc on the menu also starts the countdown
    s.seconds(1.3);
    assert(s.screen() === 'paused', where + ': resumed before the countdown ended');
    s.seconds(0.4);
    assert(s.screen() === where, where + ': not resumed (' + s.screen() + ')');
    assert(!loopSeq(TG).paused, where + ': the sequencer did not restart');
    if (where === 'bossIntro') assert(TG.Game.state.boss.stateT >= introT, 'the intro restarted after the pause');
  }
  assert(stepUntil(s, bot, () => s.screen() === 'levelComplete', 600), 'never reached levelComplete');
  s.frame();
  s.press('esc');
  s.env.dispatch('blur');
  s.frames(3);
  assert(s.screen() === 'levelComplete', 'paused on levelComplete: ' + s.screen());
  s.env.dispatch('focus');
  assert(stepUntil(s, bot, () => s.screen() === 'results', 10), 'no results');
  quiet(s);
});

check('a pause during lifeLost (Esc, blur, hidden tab) is deferred: paused when the pause in the world ends, then resumed', function () {
  const s = session();
  const TG = s.TG;
  assert(startRun(s, 'hard'), 'run did not start');
  const bot = shot.createBot({ type: false });
  const ways = [
    ['esc', () => s.press('esc')],
    ['blur', () => { s.env.dispatch('blur'); s.frame(); }],
    ['hidden', () => { s.env.setHidden(true); s.env.dispatch('visibilitychange'); s.frame(); }]
  ];
  for (const [name, fn] of ways) {
    TG.Game.state.player.lives = 3;
    assert(stepUntil(s, bot, () => s.screen() === 'lifeLost', 300), name + ': no lifeLost');
    s.frame();
    fn();
    if (s.screen() === 'lifeLost') assert(TG.Game.state.pausePending === true, name + ': pausePending not set');
    s.seconds(1.2);
    assert(s.screen() === 'paused' && TG.Game.state.resumeTo === 'playing', name + ': ' + s.screen() + ' resumeTo ' + TG.Game.state.resumeTo);
    assert(TG.Game.state.pausePending === false, name + ': pausePending left set');
    if (name === 'hidden') {
      s.env.setHidden(false);
      s.env.dispatch('visibilitychange');
    } else if (name === 'blur') {
      s.env.dispatch('focus');
    }
    s.press('enter');
    s.seconds(1.7);
    assert(s.screen() === 'playing', name + ': not resumed (' + s.screen() + ')');
    s.steps(60, bot);
  }
  assert(s.env.audio.suspends >= 2 && s.env.audio.resumes >= 2, 'audio suspends ' + s.env.audio.suspends + ', resumes ' + s.env.audio.resumes);
  quiet(s);
});

check('losing focus: blur pauses play, clears held keys and suspends audio; focus resumes audio only; the same on the title', function () {
  const s = session();
  const TG = s.TG;
  s.frames(2);
  s.press('enter');
  s.seconds(1.5);
  const sus0 = s.env.audio.suspends, res0 = s.env.audio.resumes;
  s.env.dispatch('blur');
  s.frames(2);
  assert(s.screen() === 'title' && s.env.audio.suspends === sus0 + 1, 'title blur: ' + s.screen());
  s.env.dispatch('focus');
  s.frames(2);
  assert(s.env.audio.resumes === res0 + 1 && s.env.audio.contexts[0].state === 'running', 'title focus did not resume audio');
  assert(startFromTitle(s, 'medium'), 'run did not start');
  s.steps(60 * 5, shot.createBot());
  s.env.dispatch('keydown', shot.keyEvent('down'));  // hold duck: keydown only
  s.frame();
  s.env.dispatch('blur');
  s.frames(2);
  assert(s.screen() === 'paused', 'blur did not pause: ' + s.screen());
  assert(!TG.Input.isDown('down'), 'held key not cleared');
  s.env.dispatch('focus');
  s.frames(10);
  assert(s.screen() === 'paused', 'focus resumed the game without the countdown');
  s.press('enter');
  s.seconds(1.7);
  assert(s.screen() === 'playing', 'not resumed');
  s.frames(30);
  assert(TG.Game.state.player.duckHeld === false, 'duck still held after the blur');
  quiet(s);
});

check('a frame longer than MAX_FRAME (a background tab) pauses play and throws the time away', function () {
  const s = session();
  const TG = s.TG;
  assert(startRun(s, 'medium'), 'run did not start');
  s.frames(60);
  const t0 = TG.Game.state.time;
  s.ms += 5000;                                   // five seconds with no frame
  s.frame();
  assert(s.screen() === 'paused', 'not paused: ' + s.screen());
  assert(TG.Game.state.time - t0 < 0.1, 'simulated ' + (TG.Game.state.time - t0) + ' s');
  quiet(s);
});

// ---------------------------------------------------------------------------------------------
// 5. Game over and continue
// ---------------------------------------------------------------------------------------------

// Plays to checkpoint `cp` (3 = into the boss fight), then lets the last life go.
function toGameOver(s, cp) {
  const TG = s.TG;
  const bot = shot.createBot();
  if (cp > 0) {
    assert(stepUntil(s, bot, () => TG.Game.state.checkpoint.index >= cp && (cp < 3 || s.screen() === 'boss'), 900),
      'never reached checkpoint ' + cp);
  }
  s.steps(60 * (cp === 3 ? 25 : 6), bot);           // in the boss: into a later phase
  bot.type = false;
  if (TG.Game.state.player.lives > 1) TG.Game.state.player.lives = 1;
  assert(stepUntil(s, bot, () => s.screen() === 'gameOver', 300), 'no game over');
  bot.type = true;
  return bot;
}

for (const cp of [0, 1, 2, 3]) {
  check('game over at checkpoint ' + cp + (cp === 3 ? ' (the boss)' : '') + ', then Enter continues there: lives, score, ' +
    'no threat or lock, timed powers ended, music normal' + (cp === 3 ? ', the Baron in the phase reached' : ''), function () {
    const s = session();
    const TG = s.TG;
    assert(startRun(s, 'medium'), 'run did not start');
    const bot = toGameOver(s, cp);
    const st = TG.Game.state;
    assert(st.checkpoint.index === cp, 'game over at checkpoint ' + st.checkpoint.index);
    const phase = st.checkpoint.bossPhase;
    s.seconds(0.5);
    s.press('enter');                               // inside the 0.8 s lockout: ignored
    assert(s.screen() === 'gameOver', 'a key was taken during the lockout');
    s.seconds(0.4);
    s.press('enter');
    const st2 = TG.Game.state;
    assert(s.screen() === (cp === 3 ? 'bossIntro' : 'playing'), 'screen ' + s.screen());
    assert(st2.player.lives === st2.config.lives, 'lives ' + st2.player.lives);
    assert(Math.abs(st2.player.x - st2.level.checkpoints[cp].x) < 4, 'x ' + st2.player.x);
    assert(st2.score === st2.checkpoint.score, 'score ' + st2.score + ' banked ' + st2.checkpoint.score);
    assert(st2.entities.every((e) => e.dead) && st2.typing.target === null, 'threats or a lock left');
    assert(st2.power.slowT === 0 && st2.power.quillT === 0 && st2.slowScale === 1, 'a timed power is still running');
    assert(st2.run.continues === 1, 'continues ' + st2.run.continues);
    s.seconds(2);
    const q = loopSeq(TG);
    assert(q.name === (cp === 3 ? 'boss1' : 'level1') && q.playing && !q.paused && !q.bassOnly, 'music ' + JSON.stringify(q));
    assert(TG.Audio._internals.tempoScale() === 1, 'tempo scale ' + TG.Audio._internals.tempoScale());
    if (cp === 3) {
      assert(s.screen() === 'boss' && st2.boss.phase === phase, 'Baron phase ' + st2.boss.phase + ', expected ' + phase);
      assert(st2.boss.health === TG.Boss.phaseStartHealth(st2.config, phase), 'health ' + st2.boss.health);
      assert(q.bpm === (phase === 3 ? 184 : 168), 'boss tempo ' + q.bpm);
    }
    s.steps(60 * 20, bot);
    assert(TG.Game.isSimScreen(s.screen()) || s.screen() === 'results', 'play did not go on: ' + s.screen());
    quiet(s);
  });
}

check('game over, then the countdown runs out: 9 ticks, the run ends (RUN ENDED), results, then the title', function () {
  const s = session();
  const TG = s.TG;
  assert(startRun(s, 'hard'), 'run did not start');
  toGameOver(s, 0);
  const ticks = [];
  TG.Events.on('ui:count', (p) => ticks.push(p.n + (p.high ? '!' : '')));
  let ends = 0;
  TG.Events.on('run:end', () => ends++);
  s.seconds(9.2);
  assert(ticks.join(',') === '9,8,7,6,5,4,3!,2!,1!', 'ticks ' + ticks.join(','));
  assert(s.screen() === 'results' && ends === 1, s.screen() + ', run:end ' + ends);
  assert(TG.Game.state.result.cleared === false && TG.Game.state.run.ended === true, 'result');
  leaveResults(s, 'end');
  assert(s.screen() === 'title', 'screen ' + s.screen());
  quiet(s);
});

// ---------------------------------------------------------------------------------------------
// 6. Quit, new runs, high scores
// ---------------------------------------------------------------------------------------------

check('quit from the pause menu with the Hourglass running and a word locked, then a new run: nothing left over', function () {
  const s = session();
  const TG = s.TG;
  assert(startRun(s, 'medium'), 'run did not start');
  const bot = shot.createBot();
  assert(stepUntil(s, bot, () => TG.Game.state.power.slowT > 2, 400), 'no Hourglass');
  assert(stepUntil(s, bot, () => TG.Game.state.typing.target !== null, 30), 'no lock');
  s.frame();
  assert(TG.Audio._internals.tempoScale() === 0.75, 'Hourglass tempo');
  s.press('esc');
  s.frames(3);
  for (let i = 0; i < 6; i++) s.press('down');     // QUIT
  s.press('enter');
  assert(s.screen() === 'paused', 'QUIT did not ask for a second Enter');
  s.press('enter');
  assert(s.screen() === 'results' && TG.Game.state.result.cleared === false, 'screen ' + s.screen());
  leaveResults(s, 'qui');
  assert(s.screen() === 'title', 'screen ' + s.screen());
  s.seconds(1.5);
  assert(loopSeq(TG).name === 'title' && !loopSeq(TG).paused && TG.Audio._internals.tempoScale() === 1, 'title music');
  assert(startFromTitle(s, 'easy'), 'new run did not start');
  const st = TG.Game.state;
  assert(st.difficulty === 'easy' && st.score === 0 && st.run.continues === 0 && st.time < 0.1, 'run data');
  assert(st.typing.stats.correct === 0 && st.typing.stats.wrong === 0 && st.typing.target === null, 'typing statistics');
  assert(st.entities.length === 0 && st.power.slowT === 0 && st.power.shield === 0 && st.slowScale === 1, 'world');
  assert(st.player.lives === 5 && st.player.x === 96, 'player');
  assert(TG.Effects.count() === 0, 'effects left: ' + TG.Effects.count());
  s.seconds(1);
  const q = loopSeq(TG);
  assert(q.name === 'level1' && !q.paused && !q.bassOnly && q.bpm === 150 && TG.Audio._internals.tempoScale() === 1, 'music ' + JSON.stringify(q));
  quiet(s);
});

check('a finished run, high score entry with three initials, then a second run to the end from the title', function () {
  const s = session();
  const TG = s.TG;
  assert(startRun(s, 'easy'), 'run did not start');
  let bot = shot.createBot();
  assert(stepUntil(s, bot, () => s.screen() === 'results', 1500), 'first run did not finish');
  const r1 = TG.Game.state.result;
  assert(r1.cleared === true, 'first run not cleared');
  s.seconds(0.7);
  for (let i = 0; i < 10 && s.screen() === 'results'; i++) { s.press('enter'); s.frames(10); }
  assert(s.screen() === 'highScoreEntry', 'no high score entry: ' + s.screen());
  s.type('zqx');
  s.press('backspace');
  s.type('d');
  s.press('enter');
  assert(s.screen() === 'title' && TG.UI.panel === 'scores', 'after entry: ' + s.screen() + ' ' + TG.UI.panel);
  const top = TG.Save.scores('easy')[0];
  assert(top.name === 'ZQD' && top.score === r1.score && top.cleared === true, 'entry ' + JSON.stringify(top));
  assert(TG.Save.best('easy').score === r1.score, 'best not recorded');
  s.frames(30);
  assert(startFromTitle(s, 'easy'), 'second run did not start');
  assert(TG.Game.state.score === 0 && TG.Game.state.result === null, 'second run starts with old data');
  bot = shot.createBot();
  assert(stepUntil(s, bot, () => s.screen() === 'results', 1500), 'second run did not finish');
  const r2 = TG.Game.state.result;
  assert(r2 !== r1 && r2.cleared === true && r2.continues === 0, 'second result');
  assert(Math.abs(r2.bestWpm - r1.typing.wpm) < 1e-6, 'bestWpm ' + r2.bestWpm + ' vs ' + r1.typing.wpm);
  leaveResults(s, '');                             // Enter with no letters keeps the saved initials
  assert(s.screen() === 'title', 'screen ' + s.screen());
  assert(TG.Save.scores('easy').filter((e) => e.name === 'ZQD').length === 2, 'second entry');
  quiet(s);
});

// ---------------------------------------------------------------------------------------------
// 7. Settings and storage
// ---------------------------------------------------------------------------------------------

check('options changed on the title are saved, and after a reload they are in force (memory storage)', function () {
  const s = session();
  let TG = s.TG;
  s.frames(2);
  s.press('enter');
  s.seconds(1.5);
  for (let i = 0; i < 3; i++) s.press('down');
  s.press('enter');
  assert(TG.UI.panel === 'options', 'panel ' + TG.UI.panel);
  s.press('enter');                                // MUSIC off
  s.press('down'); s.press('enter');               // SOUND EFFECTS off
  s.press('down'); s.press('enter');               // CRT auto -> on
  s.press('down'); s.press('enter');               // REDUCE FLASH on
  s.press('down'); s.press('enter'); s.press('enter');   // KEY GUIDE auto -> on -> off
  s.press('down'); s.press('enter');               // ADAPTIVE PACE off
  const want = { music: false, sfx: false, crt: 'on', reduceFlash: true, keyGuide: 'off', adaptive: false };
  for (const k of Object.keys(want)) assert(TG.Save.getSetting(k) === want[k], k + ' = ' + TG.Save.getSetting(k));
  quiet(s, 'first load');
  const saved = new Map(s.env.storage);

  // Reload: a fresh page with the same storage.
  const env = stubs.load({ canvas: 'soft', storage: 'memory' });
  for (const [k, v] of saved) env.storage.set(k, v);
  env.setSize(1920, 1080);
  TG = env.TG;
  TG.Main.init();
  for (const k of Object.keys(want)) assert(TG.Save.getSetting(k) === want[k], 'after reload ' + k + ' = ' + TG.Save.getSetting(k));
  assert(env.document.getElementById('stage').classList.contains('crt-on'), 'CRT overlay not on');
  const s2 = { env: env, TG: TG, ms: 0 };
  s2.frame = function () { s2.ms += 1000 / 60; env.runFrame(s2.ms); env.audio.advance(DT); };
  s2.press = function (k) { env.dispatch('keydown', shot.keyEvent(k)); env.dispatch('keyup', shot.keyEvent(k)); s2.frame(); };
  s2.frame();
  s2.press('enter');
  for (let i = 0; i < 90; i++) s2.frame();
  s2.press('enter');
  for (const c of 'easyready') s2.press(c);
  assert(TG.Game.state.screen === 'playing', 'run did not start');
  assert(TG.Game.state.adaptive === false, 'adaptive pace setting not used');
  assert(TG.Hud.keyGuideOn(TG.Game.state) === false, 'key guide setting not used on Easy');
  const nodes = env.audio.nodes;
  for (let i = 0; i < 180; i++) s2.frame();
  assert(env.audio.nodes === nodes, 'sound with music and sound effects off: ' + (env.audio.nodes - nodes) + ' nodes');
  TG.Events.emit('life:lost', { lives: 4, cause: { type: 'threat' } });
  assert(TG.Effects.shake().x === 0 && TG.Effects.shake().y === 0 && TG.Effects.flash() === null, 'reduce flash not in force');
  assert(env.errors.length === 0 && env.warnings.length === 0, 'console output after reload');
});

for (const mode of ['none', 'throw']) {
  check('storage ' + (mode === 'none' ? 'missing' : 'that throws') + ': menus, play, an option changed while paused, quit, ' +
    'results, high score entry and a new run work from memory, with no console output', function () {
    const s = session({ storage: mode });
    const TG = s.TG;
    assert(startRun(s, 'easy'), 'run did not start');
    const bot = shot.createBot();
    assert(stepUntil(s, bot, () => TG.Game.state.checkpoint.index >= 1, 400), 'no checkpoint 1');
    s.frame();
    assert(TG.Save.getSetting('tutorialDone') === true, 'tutorialDone not set in memory');
    s.press('esc');
    s.frames(3);
    s.press('down'); s.press('down'); s.press('enter');     // MUSIC off
    assert(TG.Save.getSetting('music') === false, 'setting not changed');
    for (let i = 0; i < 4; i++) s.press('down');
    s.press('enter'); s.press('enter');                     // QUIT
    assert(s.screen() === 'results', 'screen ' + s.screen());
    leaveResults(s, 'mem');
    assert(s.screen() === 'title', 'screen ' + s.screen());
    assert(TG.Save.scores('easy').some((e) => e.name === 'MEM'), 'score not kept in memory');
    assert(startFromTitle(s, 'medium'), 'new run did not start');
    s.steps(60 * 10, shot.createBot());
    s.frames(10);
    quiet(s);
  });
}

// ---------------------------------------------------------------------------------------------
// 8. A clumsy player
// ---------------------------------------------------------------------------------------------

// Random wrong keys, Backspace, stray jumps and ducks, held duck keys, Esc and random keys on the pause
// menu, blur and focus, long frames, and the results and high score screens pressed at random, drawn
// on every frame, until the run is over and the title is back.
function clumsyRun(seed, difficulty) {
  let x = (seed * 2654435761) >>> 0;
  function rnd() {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  }
  const s = session();
  const TG = s.TG, env = s.env;
  env.run('Date.now = function () { return ' + (1000 + seed) + '; };');   // the run seed chosen by TG.UI
  const names = new Set(TG.Events.NAMES);
  const bad = [];
  TG.Events.on('*', (p, n) => { if (!names.has(n) || !p || typeof p !== 'object') bad.push(n); });
  const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
  const key = (k) => { env.dispatch('keydown', shot.keyEvent(k)); env.dispatch('keyup', shot.keyEvent(k)); };
  const held = {};
  let sharedFirst = 0;
  assert(startRun(s, difficulty), 'run did not start');
  let played = false;
  for (let step = 0; step < 60 * 60 * 30; step++) {
    const st = TG.Game.state, sc = st.screen, r = rnd();
    if (TG.Game.isSimScreen(sc)) {
      played = true;
      const ty = TG.Entities.typables(st);
      const first = new Set();
      for (const t of ty) { if (first.has(t.word[0])) sharedFirst++; first.add(t.word[0]); }
      if (r < 0.06) {
        const t = st.typing.target || ty.filter((q) => q.typed === 0).sort((a, b) => a.eta - b.eta)[0];
        if (t && t.typed < t.word.length && st.time > t.shownAt + 0.5) key(t.word[t.typed]);
      } else if (r < 0.075) key(LETTERS[Math.floor(rnd() * 26)]);
      else if (r < 0.077) key('backspace');
      else if (r < 0.080) key(rnd() < 0.5 ? 'space' : 'up');
      else if (r < 0.083) {
        const k = ['enter', 'down', 'semicolon'][Math.floor(rnd() * 3)];
        env.dispatch(held[k] ? 'keyup' : 'keydown', shot.keyEvent(k));
        held[k] = !held[k];
      } else if (r < 0.0833) key('esc');
      else if (r < 0.0835) { env.dispatch('blur'); env.dispatch('focus'); }
      else if (r < 0.0836) s.ms += 400;             // a long frame
      const a = TG.Entities.nextAction(st);
      if (a && a.inWindow && rnd() < 0.08) key(a.action === 'jump' ? 'space' : 'enter');
    } else if (sc === 'paused') {
      if (r < 0.02) key(['enter', 'up', 'down', 'left', 'right', 'esc'][Math.floor(rnd() * 6)]);
    } else if (sc === 'gameOver') {
      if (r < 0.02) key(rnd() < 0.9 ? 'enter' : 'space');
    } else if (sc === 'results' || sc === 'highScoreEntry') {
      if (r < 0.05) key(rnd() < 0.8 ? 'enter' : LETTERS[Math.floor(rnd() * 26)]);
    } else if (sc === 'title' && played) {
      break;
    }
    s.frame();
  }
  assert(played && s.screen() === 'title', 'the run did not come back to the title: ' + s.screen());
  assert(sharedFirst === 0, sharedFirst + ' steps with two live words sharing a first letter');
  assert(bad.length === 0, 'bad events: ' + bad.slice(0, 5).join(', '));
  quiet(s);
}

for (const [seed, difficulty] of [[1, 'easy'], [2, 'hard']]) {
  check('a clumsy player on ' + difficulty + ' (random wrong keys, Backspace, stray jumps and ducks, pauses with random menu keys, ' +
    'blur, long frames), drawn every frame, back to the title with no console output', function () {
    if (QUICK) return 'skip';
    clumsyRun(seed, difficulty);
  });
}

console.log('# ' + passed + ' passed, ' + failed + ' failed, ' + skipped + ' skipped');
process.exitCode = failed > 0 ? 1 : 0;
