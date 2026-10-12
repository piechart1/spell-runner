// test/test-integration.js
// Integration checks for the whole game (WP-H). CONTRACT 12 (WP-H checklist), 9 and 10.
//
//   node test/test-integration.js            every check (about 3 minutes)
//   node test/test-integration.js --quick    skips the runs that are drawn on every frame (the three full
//                                            bot runs, the three Level 2 runs and the clumsy players) and
//                                            some cases of parts 5 and 9, as their names say (about 13 s)
//
// Prints one line per check (ok / FAIL / skip) and exits with 0 when every check passed.
//
// Every check loads all 21 game files under test/stubs.js with the software canvas
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
//   5. game over, then continue, at each checkpoint including the boss: in Level 1, in Level 2 from the
//      STAGE row and in Level 2 after NEXT STAGE; game over, then the countdown runs out
//   6. quit to the title from pause, then a new run with nothing left over; a second run after
//      finishing the first; high score entry
//   7. options changed on the title and kept after a reload; storage missing and storage that throws
//   8. a clumsy player: random keys, Backspace, stray jumps and ducks, pauses, blur and long frames
//      until the run is over (skipped with --quick)
//   9. Level 2 and runs of two stages (docs/LEVEL2.md sections 12 and 13.5): a whole Level 2 run from the
//      STAGE row and one through NEXT STAGE, drawn and heard on every frame (skipped with --quick); the
//      NEXT STAGE chain to STAGE 2 CLEAR, entered once at its end (with --quick on Hard only); TITLE at
//      STAGE 1 CLEAR; NEXT STAGE and then QUIT; the world scores off, late or out of reach, and options
//      carried into the stage (both skipped with --quick); a record stored before Level 2 read through a
//      reload; the pending entry of a tab closed in Level 2
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

// From boot to the first step of play through the menus. stage 2: on the difficulty screen the STAGE row
// is first moved from STAGE 1 to STAGE 2 with Down, so the run starts at Level 2 (LEVEL2 12.3). The row
// is there only when Level 2 is open on this computer.
function startRun(s, difficulty, stage) {
  s.frames(2);
  s.press('enter');                 // boot -> title
  s.seconds(1.3);                   // the logo is stamped
  return startFromTitle(s, difficulty, stage);
}

// From the title menu (already on the title, with START selected) to play.
function startFromTitle(s, difficulty, stage) {
  if (s.TG.UI.panel !== 'menu') {   // a panel left open (for example the high scores after an entry)
    s.press('esc');
    s.frames(10);
  }
  s.press('enter');                 // START -> difficultySelect
  s.frames(10);
  if (stage === 2) s.press('down'); // the STAGE row
  s.type(difficulty);               // typing the name selects and confirms it
  s.frames(10);
  s.type('ready');                  // howToPlay -> playing
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

// Ends the run on the results screen; then fills in initials if asked. Enter is pressed until the screen
// is left. Where the screen offers NEXT STAGE (a cleared stage with a level after it), Enter on its strip
// would go on with the run: there the strip is reached (toStrip below) and Esc (TITLE) ends the run.
function leaveResults(s, initials) {
  if (shot.nextStageOffered(s)) {
    toStrip(s);
    s.press('esc');
    s.frames(10);
  } else {
    s.seconds(0.7);                 // results ignore keys for 0.5 s
    for (let i = 0; i < 10 && s.screen() === 'results'; i++) {
      s.press('enter');
      s.frames(10);
    }
  }
  if (s.screen() === 'highScoreEntry') {
    if (initials) s.type(initials);
    s.press('enter');
    s.frames(5);
  }
}

// The NEXT STAGE strip at the bottom of the results screen, and the line over it (LEVEL2 12.1).
const STRIP_KEYS = 'ENTER: NEXT STAGE   ESC: TITLE';
const STRIP_LINE = 'THE SCORE IS ENTERED WHEN THE RUN ENDS';

// Brings the strip on show. On the results screen of a cleared stage that has a level after it, Enter
// finishes the tally of the first page, turns the page and finishes the tally of the second; then Enter is
// NEXT STAGE and Esc is TITLE. However far the tally has got, no Enter is pressed once the strip is drawn.
function toStrip(s) {
  assert(s.screen() === 'results' && shot.nextStageOffered(s), 'no results screen that offers NEXT STAGE');
  s.seconds(0.7);                   // results ignore keys for 0.5 s
  for (let i = 0; i < 3 && drawnTexts(s).indexOf(STRIP_KEYS) === -1; i++) s.press('enter');
  assert(s.screen() === 'results' && drawnTexts(s).indexOf(STRIP_KEYS) !== -1, 'the strip is not on show: ' + s.screen());
}

// A run started from the menus at Level 1 and played by the small bot to STAGE 1 CLEAR, then NEXT STAGE:
// the first step of Level 2. Returns the result of the first stage, with lifeAt: the score at which the
// next extra life was due when the stage ended. The end-of-stage bonuses are added without paying extra
// lives, so the result's score can stand past it (pastLifeAt); on Easy and Hard the small bot's always does.
function throughNextStage(s, difficulty) {
  assert(startRun(s, difficulty), 'run did not start');
  assert(stepUntil(s, shot.createBot(), () => s.screen() === 'results', 1500), 'Level 1 did not finish');
  const r1 = s.TG.Game.state.result;
  assert(r1.cleared === true && r1.levelId === 1, 'Level 1 was not cleared');
  const lifeAt = s.TG.Game.state.nextLifeAt;
  toStrip(s);
  s.press('enter');
  assert(s.screen() === 'playing' && s.TG.Game.state.levelId === 2, 'NEXT STAGE did not start Level 2: ' + s.screen());
  return { result: r1, lifeAt: lifeAt, pastLifeAt: r1.score >= lifeAt };
}

// TG.UI takes the seed of a run from Date.now(). With this the runs of a session are the same every time.
function fixSeed(s, n) {
  s.env.run('Date.now = function () { return ' + n + '; };');
}

// One displayed frame, and every text TG.Font drew in it.
function drawnTexts(s) {
  const font = s.TG.Font;
  const draw = font.draw;
  const out = [];
  font.draw = function (ctx, text) {
    out.push(String(text));
    return draw.apply(this, arguments);
  };
  try {
    s.frame();
  } finally {
    font.draw = draw;
  }
  return out;
}

// A score as the HUD and the tables print it: seven digits.
function pad7(n) {
  return ('0000000' + Math.floor(n)).slice(-7);
}

// The entries of a table of this computer that a player made: the seeded ones have no date.
function dated(TG, difficulty) {
  return TG.Save.scores(difficulty).filter((e) => e.date !== '');
}

const STORAGE_KEY = 'spellrunner.v1';

// What the session's storage holds, parsed.
function storedRecord(s) {
  return JSON.parse(s.env.storage.get(STORAGE_KEY));
}

// ---------------------------------------------------------------------------------------------
// 1. Static checks
// ---------------------------------------------------------------------------------------------

check('all 21 files load under the stubs with the software canvas; no sprite of CONTRACT 6.4 is missing', function () {
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
  // index.html may load one outside script, Cloudflare Web Analytics, as its last script
  // (test/test-ui.js checks the tag); that tag is left out here and everything else is checked.
  const ANALYTICS_TAG = /<script type="module" src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js" data-cf-beacon='\{"token": "[0-9a-f]{32}"\}'><\/script>/;
  const codeOf = function (f) {
    const text = f === 'index.html' ? read(f).replace(ANALYTICS_TAG, '').replace(/<!-- Cloudflare Web Analytics[^>]*-->/, '') : read(f);
    return text.split('\n').map(function (line) {
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
  const html = read('index.html').replace(ANALYTICS_TAG, '');
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

// Game over at checkpoint `cp` of `level`, then Enter on the continue screen. way: 'menus' (the run was
// started at that level from the menus on Medium, Level 2 from the STAGE row) or 'next' (Level 1 was
// cleared on Hard and NEXT STAGE taken; LEVEL2 12.2). The level's own tracks, boss and tempo are read from
// its data. The Level 2 runs have a fixed seed.
function continueAt(level, way, cp) {
  const s = session();
  const TG = s.TG;
  const data = TG.Levels[level];
  const arena = data.arena.music;
  let carried = null;
  if (way === 'next') {
    // On Hard, where the first stage ends past an extra-life threshold: the case in which a threshold left
    // behind the score would pay its life on the first points after every continue.
    fixSeed(s, 5100 + cp);
    const first = throughNextStage(s, 'hard');
    assert(first.pastLifeAt, 'the first stage ended at ' + first.result.score + ', short of the threshold at ' + first.lifeAt + ': the case needs it past');
    carried = first.result;
  } else {
    if (level === 2) {
      fixSeed(s, 5000 + cp);
      shot.unlock(s, 'easy');                       // opened by a clear on another difficulty (decision 5)
    }
    assert(startRun(s, 'medium', level), 'run did not start');
  }
  assert(TG.Game.state.levelId === level, 'level ' + TG.Game.state.levelId);
  const correctAtStart = TG.Game.state.typing.stats.correct;
  const bot = toGameOver(s, cp);
  const st = TG.Game.state;
  assert(st.checkpoint.index === cp, 'game over at checkpoint ' + st.checkpoint.index);
  const phase = st.checkpoint.bossPhase;
  const correct = st.typing.stats.correct;
  s.seconds(0.5);
  s.press('enter');                               // inside the 0.8 s lockout: ignored
  assert(s.screen() === 'gameOver', 'a key was taken during the lockout');
  s.seconds(0.4);
  s.press('enter');
  const st2 = TG.Game.state;
  // From here on an extra life from the score is due at this threshold and not before (DESIGN 8.5).
  const lifeAt = st2.nextLifeAt;
  const early = [];
  TG.Events.on('life:gain', (p) => { if (p.cause === 'score' && TG.Game.state.score < lifeAt) early.push(TG.Game.state.score); });
  assert(s.screen() === (cp === 3 ? 'bossIntro' : 'playing'), 'screen ' + s.screen());
  assert(st2.levelId === level && st2.level.name === data.name, 'level ' + st2.levelId + ' ' + st2.level.name);
  assert(st2.player.lives === st2.config.lives, 'lives ' + st2.player.lives);
  assert(Math.abs(st2.player.x - st2.level.checkpoints[cp].x) < 4, 'x ' + st2.player.x);
  assert(st2.score === st2.checkpoint.score, 'score ' + st2.score + ' banked ' + st2.checkpoint.score);
  assert(st2.entities.every((e) => e.dead) && st2.typing.target === null, 'threats or a lock left');
  assert(st2.power.slowT === 0 && st2.power.quillT === 0 && st2.power.watchT === 0 && st2.slowScale === 1, 'a timed power is still running');
  assert(st2.run.continues === 1, 'continues ' + st2.run.continues);
  assert(st2.typing.stats.correct === correct && correct > correctAtStart, 'typing statistics changed by the continue');
  if (carried) {
    // The run's first stage stays in its figures: the score cannot fall below the Stage 1 total, the next
    // extra life is still ahead, and the stage is still counted.
    assert(st2.score >= carried.score && (cp > 0 || st2.score === carried.score), 'score ' + st2.score + ' after carrying ' + carried.score);
    assert(st2.nextLifeAt > st2.score, 'an extra life is due at ' + st2.nextLifeAt + ' with the score at ' + st2.score);
    assert(st2.run.stages === 1 && st2.run.stageScore === carried.score, 'stages ' + st2.run.stages + ', stageScore ' + st2.run.stageScore);
    assert(st2.time > carried.time, 'the run clock started again');
  }
  s.seconds(2);
  const q = loopSeq(TG);
  assert(q.name === (cp === 3 ? data.theme.music.boss : data.theme.music.level) && q.playing && !q.paused && !q.bassOnly, 'music ' + JSON.stringify(q));
  assert(TG.Audio._internals.tempoScale() === 1, 'tempo scale ' + TG.Audio._internals.tempoScale());
  if (cp === 3) {
    assert(phase > 1, 'the boss was still in phase 1');
    assert(s.screen() === 'boss' && st2.boss.kind === data.boss.kind && st2.boss.phase === phase, 'boss ' + st2.boss.kind + ' phase ' + st2.boss.phase + ', expected ' + phase);
    assert(st2.boss.health === TG.Boss.phaseStartHealth(st2.config, phase), 'health ' + st2.boss.health);
    assert(q.bpm === (phase === 3 ? (arena.phase3 ? arena.phase3.tempo : 184) : arena.tempo), 'boss tempo ' + q.bpm);
  }
  s.steps(60 * 20, bot);
  assert(TG.Game.isSimScreen(s.screen()) || s.screen() === 'results', 'play did not go on: ' + s.screen());
  assert(early.length === 0, 'an extra life was paid before its threshold, at ' + early.join(', '));
  quiet(s);
}

for (const cp of [0, 1, 2, 3]) {
  check('game over at checkpoint ' + cp + (cp === 3 ? ' (the boss)' : '') + ', then Enter continues there: lives, score, ' +
    'no threat or lock, timed powers ended, music normal' + (cp === 3 ? ', the Baron in the phase reached' : ''), function () {
    continueAt(1, 'menus', cp);
  });
}

// The same in Level 2 (LEVEL2 13.5), by both ways into it. With --quick only at the first checkpoint, which
// banks what the run carried in, and at the boss.
for (const [way, how] of [['menus', 'a run started from the STAGE row'], ['next', 'a run that came through NEXT STAGE']]) {
  for (const cp of [0, 1, 2, 3]) {
    check('Level 2, ' + how + ': game over at checkpoint ' + cp + (cp === 3 ? ' (the boss)' : '') + ', then Enter continues there: ' +
      'Level 2\'s checkpoint, lives, banked score, no threat or lock, timed powers ended, Level 2\'s music' +
      (cp === 3 ? ', Lady Ratchet in the phase reached' : '') +
      (way === 'next' ? '; the score not under the Stage 1 total and no extra life before its threshold' : ''), function () {
      if (QUICK && (cp === 1 || cp === 2)) return 'skip';
      continueAt(2, way, cp);
    });
  }
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
  // A cleared Level 1 run is offered NEXT STAGE: Esc on the strip (TITLE) ends the run.
  toStrip(s);
  s.press('esc');
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

// ---------------------------------------------------------------------------------------------
// 9. Level 2 and runs of two stages (docs/LEVEL2.md sections 12 and 13.5)
// ---------------------------------------------------------------------------------------------

// Play that is shown and heard: the bot acts, then one displayed frame (a step, the sound and a draw
// through the real loop), until pred() is true. each() is called after every frame.
function playDrawn(s, bot, pred, maxSeconds, each) {
  const limit = Math.round((maxSeconds || 900) * 60);
  for (let i = 0; i < limit && !pred(); i++) {
    shot.botStep(s.TG, bot);
    s.frame();
    if (each) each();
  }
  return pred();
}

// A whole Level 2 run, drawn and heard on every frame, to STAGE 2 CLEAR and back to the title. way 'row':
// started at Level 2 from the STAGE row, which a clear on another difficulty opened. way 'next': Level 1
// is played first without drawing (part 3 draws it), and from its results screen on every frame is drawn:
// the strip, NEXT STAGE and Level 2 on the state of that run.
function drawnLevel2(difficulty, way) {
  const s = session();
  const TG = s.TG;
  fixSeed(s, 9100);
  let draws = 0;
  const draw = TG.Render.draw;
  TG.Render.draw = function () {
    draws++;
    return draw.apply(this, arguments);
  };
  let r1 = null;
  if (way === 'next') {
    r1 = throughNextStage(s, difficulty).result;
  } else {
    shot.unlock(s, difficulty === 'easy' ? 'medium' : 'easy');
    assert(startRun(s, difficulty, 2), 'run did not start');
    assert(TG.Save.getSetting('lastLevel') === 2, 'the stage chosen on the row was not remembered');
  }
  const st = TG.Game.state;
  assert(st.levelId === 2 && st.level.name === 'CLOCKWORK CAVERNS' && st.player.lives === st.config.lives, 'not at the start of Level 2');
  const heard = new Set(), loops = new Set(), jingles = new Set(), kinds = new Set(), bossBar = new Set();
  const log = TG.Audio._internals.sfxLog;
  TG.Events.on('threat:spawn', (p) => kinds.add(p.kind));
  // The label of the boss bar, as TG.Font draws it in the fight.
  const fontDraw = TG.Font.draw;
  TG.Font.draw = function (ctx, text) {
    if (text === 'RATCHET' || text === 'BARON') bossBar.add(text);
    return fontDraw.apply(this, arguments);
  };
  let frames = 0;
  const drawn0 = draws;
  const bot = shot.createBot();
  const done = playDrawn(s, bot, () => s.screen() === 'results', 900, function () {
    frames++;
    for (const n of log) heard.add(n);
    const loop = loopSeq(TG), once = TG.Audio._internals.sequencer('once');
    if (loop.playing) loops.add(loop.name);
    if (once.playing) jingles.add(once.name);
  });
  TG.Font.draw = fontDraw;
  assert(done, 'the run did not reach the results screen: ' + s.screen());
  const res = TG.Game.state.result;
  assert(res.cleared === true && res.levelId === 2 && res.continues === 0, 'result ' + res.cleared + ', level ' + res.levelId + ', continues ' + res.continues);
  assert(res.stages === (r1 ? 2 : 1) && res.stageScore === (r1 ? r1.score : 0), 'stages ' + res.stages + ', stageScore ' + res.stageScore);
  assert(draws - drawn0 >= frames && frames > 60 * 200, (draws - drawn0) + ' draws for ' + frames + ' frames');
  assert(kinds.has('dangle') && kinds.has('flit'), 'Level 2\'s own creatures did not appear: ' + Array.from(kinds).join(', '));
  for (const n of ['key_ok', 'lock_on', 'word_clear', 'jump', 'land', 'slide', 'checkpoint', 'deflect', 'boss_hit', 'boss_defeat',
    'watch_tick', 'watch_off', 'toot', 'click']) {
    assert(heard.has(n), 'never played: ' + n);
  }
  assert(loops.has('level2') && loops.has('boss2') && !loops.has('level1') && !loops.has('boss1'), 'loops ' + Array.from(loops).join(', '));
  assert(jingles.has('jingle_ready2') && !jingles.has('jingle_ready'), 'jingles ' + Array.from(jingles).join(', '));
  assert(bossBar.has('RATCHET') && !bossBar.has('BARON'), 'the boss bar: ' + Array.from(bossBar).join(', '));
  s.seconds(5);                                     // the tally and the stamp
  const texts = drawnTexts(s);
  for (const t of ['STAGE 2 CLEAR!', 'A COLD WIND BLOWS DOWN THE SHAFT.'].concat(r1 ? ['STAGE 1 SCORE'] : [])) {
    assert(texts.indexOf(t) !== -1, '"' + t + '" is not on the results screen: ' + texts.join(' | '));
  }
  assert(!shot.nextStageOffered(s), 'NEXT STAGE is offered after the last level');
  leaveResults(s, 'lvl');
  assert(s.screen() === 'title' && TG.UI.panel === 'scores', 'after the entry: ' + s.screen() + ' ' + TG.UI.panel);
  const mine = dated(TG, difficulty);
  assert(mine.length === 1 && mine[0].name === 'LVL' && mine[0].score === res.score && mine[0].cleared === true, 'entries ' + JSON.stringify(mine));
  assert(TG.Sprites.missing().length === 0, 'missing sprites');
  quiet(s);
}

for (const [difficulty, way] of [['easy', 'row'], ['medium', 'next'], ['hard', 'row']]) {
  check('a whole Level 2 run on ' + difficulty + (way === 'row' ? ' from the STAGE row' : ' through NEXT STAGE from a cleared Level 1 run') +
    ', drawn and heard on every frame through the real loop: STAGE 2 CLEAR, Level 2\'s creatures, tracks and sounds, ' +
    'no placeholder, no console output', function () {
    if (QUICK) return 'skip';
    drawnLevel2(difficulty, way);
  });
}

// The requests of a kind that the stand-in service has had.
function requests(world, method, path) {
  return world.calls.filter((c) => c.method === method && c.path === path);
}

for (const difficulty of ['easy', 'medium', 'hard']) {
  check('NEXT STAGE on ' + difficulty + ', by key events: a cleared Level 1 run goes on into Level 2 with its score, clocks and statistics ' +
    'and the stage\'s own lives, to STAGE 2 CLEAR; the run is entered once, at its end, with the run total and the run time: ' +
    'one initials screen, one table entry, one run token and one submission', function () {
    if (QUICK && difficulty !== 'hard') return 'skip';
    const world = shot.createWorld();
    const s = session({ world: world });
    const TG = s.TG;
    fixSeed(s, 9200);
    const screens = [];
    TG.Events.on('screen:change', (p) => screens.push(p.to));
    assert(startRun(s, difficulty), 'run did not start');
    assert(TG.Save.levelOpen(2) === false, 'Level 2 is open before Level 1 was cleared');
    const bot = shot.createBot();
    assert(stepUntil(s, bot, () => s.screen() === 'results', 1500), 'Level 1 did not finish');
    const r1 = TG.Game.state.result;
    assert(r1.cleared === true && r1.levelId === 1 && r1.stages === 1 && r1.stageScore === 0, 'first result');

    // STAGE 1 CLEAR records what is a fact about the player and enters nothing (decision 19).
    s.seconds(5);
    let texts = drawnTexts(s);
    assert(texts.indexOf('STAGE 1 CLEAR!') !== -1 && texts.indexOf('STAGE 2 UNLOCKED: CLOCKWORK CAVERNS') !== -1, 'first page: ' + texts.join(' | '));
    assert(TG.Save.levelOpen(2) === true && TG.Save.best(difficulty).score === r1.score, 'the unlock and the best score were not recorded');
    assert(dated(TG, difficulty).length === 0 && TG.Save.pending() === null, 'something was entered at STAGE 1 CLEAR');
    toStrip(s);
    texts = drawnTexts(s);
    assert(texts.indexOf(STRIP_LINE) !== -1 && texts.indexOf(STRIP_KEYS) !== -1, 'the strip: ' + texts.join(' | '));
    s.press('space');                               // Space turns pages; on the strip it does nothing
    s.frames(5);
    assert(s.screen() === 'results', 'Space on the strip left the results screen');
    // Nothing pauses the results screen, and the strip is still there afterwards.
    s.env.dispatch('blur');
    s.frames(3);
    s.env.dispatch('focus');
    s.ms += 5000;                                   // five seconds with no frame
    s.frame();
    assert(s.screen() === 'results' && drawnTexts(s).indexOf(STRIP_KEYS) !== -1, 'the strip after a blur and a long frame: ' + s.screen());
    assert(requests(world, 'POST', '/v1/runs').length === 1 && requests(world, 'POST', '/v1/scores').length === 0, 'requests before NEXT STAGE');

    // NEXT STAGE. On Easy and Hard the bonuses have carried this bot's score past the next extra-life
    // threshold, which is the case the step has to settle; on Medium they have not.
    const before = TG.Game.state;
    // nextStage works on the state of the run, so `before` and the state after the step are one object:
    // what must be the same afterwards, or must not be, is copied here.
    const kept = {
      correct: before.typing.stats.correct, wrong: before.typing.stats.wrong, mult: before.typing.stats.mult,
      ink: before.ink, inkTotal: before.inkTotal, seed: before.seed, livesLost: before.run.livesLost,
      frame: before.frame, worldTime: before.worldTime, rng: before.rng, picker: before.picker,
      assist: before.assist, assistTarget: before.assistTarget, adaptive: before.adaptive,
      counters: JSON.stringify([before.run.continues, before.run.hits, before.run.falls, before.run.threatsCleared, before.run.threatsMissed,
        before.run.cratesCleared, before.run.cratesMissed])
    };
    assert(before.section === 3 && before.run.cleared === true && before.run.bonuses.length > 0 && before.tutorial.enabled === true &&
      before.typing.stats.section.words > 0, 'the state at STAGE 1 CLEAR is not the end of a first run\'s arena');
    assert((r1.score >= before.nextLifeAt) === (difficulty !== 'medium'), 'the first stage ended at ' + r1.score + ' with the next extra life at ' + before.nextLifeAt);
    const order = [];
    const stop = TG.Events.on('*', function (p, n) {
      if (n === 'screen:change') order.push(p.from + '>' + p.to);
      else if (n === 'level:start') order.push('level:start ' + p.levelId + ' ' + p.continued + ' ' + p.music.level);
      else if (n === 'section:enter') order.push('section:enter ' + p.index);
    });
    // Enter is held down for a moment, as a finger holds it. It is also a duck key in play.
    s.env.dispatch('keydown', shot.keyEvent('enter'));
    s.frame();
    stop();
    const st = TG.Game.state;
    assert(s.screen() === 'playing' && st.levelId === 2 && st.level.name === 'CLOCKWORK CAVERNS', 'not in Level 2: ' + s.screen());
    assert(order.join(', ') === 'results>playing, level:start 2 false level2, section:enter 0', 'events: ' + order.join(', '));
    assert(st.score === r1.score && st.checkpoint.index === 0 && st.checkpoint.score === r1.score, 'score ' + st.score + ', banked ' + st.checkpoint.score);
    assert(st.player.lives === st.config.lives && st.config.lives === { easy: 5, medium: 4, hard: 3 }[difficulty] && st.power.shield === 0, 'lives ' + st.player.lives + ', shield ' + st.power.shield);
    assert(st.power.slowT === 0 && st.power.quillT === 0 && st.power.watchT === 0 && st.power.last === null && st.boss === null, 'a timed power or the boss of Level 1 is left');
    // The clocks go on from where they stood (the frame of the press holds at most one step of play). Level 1
    // has no Pocket Watch, so the scene clock is still the same number as the run clock.
    assert(Math.abs(st.time - r1.time) < 0.05 && st.sceneTime === st.time, 'the run clock: ' + st.time + ' and ' + st.sceneTime + ' after ' + r1.time);
    assert(st.frame >= kept.frame && st.frame <= kept.frame + 1 && st.worldTime >= kept.worldTime && st.worldTime < kept.worldTime + 0.05,
      'frame ' + st.frame + ' after ' + kept.frame + ', worldTime ' + st.worldTime + ' after ' + kept.worldTime);
    assert(st.typing.stats.correct === kept.correct && st.typing.stats.wrong === kept.wrong && st.typing.stats.mult === kept.mult, 'typing statistics');
    assert(st.ink === kept.ink && st.inkTotal === kept.inkTotal && st.seed === kept.seed && st.run.livesLost === kept.livesLost, 'ink, seed or lives lost');
    assert(JSON.stringify([st.run.continues, st.run.hits, st.run.falls, st.run.threatsCleared, st.run.threatsMissed, st.run.cratesCleared,
      st.run.cratesMissed]) === kept.counters, 'the run counters: ' + kept.counters);
    assert(st.assist === kept.assist && st.assistTarget === kept.assistTarget && st.adaptive === kept.adaptive, 'the pace: ' + st.assist + ' after ' + kept.assist);
    assert(st.rng === kept.rng && st.picker !== kept.picker, 'the generator goes on and the picker is the new level\'s');
    // What belongs to the stage starts again: the section and its counters, the stage's own record, the tutorial.
    assert(st.section === 0 && st.run.sectionLivesLost === 0 && st.typing.stats.section.words === 0 && st.typing.stats.section.correct === 0,
      'the section counters still hold the arena of Level 1');
    assert(st.run.cleared === false && st.run.ended === false && st.run.bonuses.length === 0, 'the stage\'s own record was not started again');
    assert(st.tutorial.enabled === false && st.tutorial.active === false, 'the tutorial is on in Level 2');
    assert(st.run.stages === 1 && st.run.stageScore === r1.score && st.result === null && st.difficulty === difficulty, 'the run\'s record of its stages');
    assert(st.nextLifeAt > st.score, 'an extra life is due at ' + st.nextLifeAt + ' with the score at ' + st.score);
    // One token for the whole run, and nothing entered: the entry is kept in case the run never ends.
    assert(requests(world, 'POST', '/v1/runs').length === 1 && requests(world, 'POST', '/v1/scores').length === 0, 'a token or a score was sent at NEXT STAGE');
    assert(TG.Board.hasToken(difficulty) === true, 'the run token was dropped at NEXT STAGE');
    const pending = TG.Save.pending();
    assert(pending && pending.difficulty === difficulty && pending.entry.score === r1.score && pending.entry.cleared === true &&
      pending.entry.rank === r1.rank && storedRecord(s).pending.entry.score === r1.score, 'pending entry ' + JSON.stringify(pending));
    assert(dated(TG, difficulty).length === 0 && screens.indexOf('highScoreEntry') === -1, 'the run was entered at NEXT STAGE');
    texts = drawnTexts(s);
    assert(texts.indexOf('2-1') !== -1 && texts.indexOf(pad7(r1.score)) !== -1, 'the HUD of Level 2: ' + texts.join(' | '));
    s.frames(6);
    assert(st.player.state === 'run' && st.levelId === 2 && s.screen() === 'playing', 'the held Enter did something in Level 2: ' + st.player.state + ' on ' + s.screen());
    s.env.dispatch('keyup', shot.keyEvent('enter'));
    s.seconds(2);
    const q = loopSeq(TG);
    assert(q.name === 'level2' && q.playing && !q.paused && !q.bassOnly && TG.Audio._internals.tempoScale() === 1, 'music ' + JSON.stringify(q));

    // Level 2 to its end.
    assert(stepUntil(s, bot, () => s.screen() === 'results', 1500), 'Level 2 did not finish');
    const r2 = TG.Game.state.result;
    assert(r2 !== r1 && r2.cleared === true && r2.levelId === 2 && r2.stages === 2, 'second result');
    assert(r2.stageScore === r1.score && r2.score > r1.score && r2.time > r1.time + 200, 'run total ' + r2.score + ' in ' + r2.time + ' s after ' + r1.score + ' in ' + r1.time + ' s');
    assert(Math.abs(r2.stageTime - (r2.time - r1.time)) < 0.05, 'stageTime ' + r2.stageTime);
    assert(r2.bestScore === 0 && r2.bestWpm === 0, 'the bests on the result are not those from before the run: ' + r2.bestScore + ', ' + r2.bestWpm);
    assert(r2.typing.correct > kept.correct && r2.ink > r1.ink, 'the statistics of the result are not the whole run\'s');
    // One bot played both stages. Level 2's hazards have the ids of Level 1's, and it jumped and ducked them.
    assert(r2.continues === 0 && r2.livesLost === r1.livesLost, 'lives were lost in Level 2: ' + r2.livesLost + ' after ' + r1.livesLost + ', continues ' + r2.continues);
    s.seconds(5);
    texts = drawnTexts(s);
    for (const t of ['STAGE 2 CLEAR!', 'A COLD WIND BLOWS DOWN THE SHAFT.', 'STAGE 1 SCORE', String(r1.score), String(r2.score)]) {
      assert(texts.indexOf(t) !== -1, '"' + t + '" is not on the last results screen: ' + texts.join(' | '));
    }
    // The note beside WPM. There was no best before the run, and STAGE 1 CLEAR showed and saved the first
    // stage's WPM, so the whole run's is a new best only when it is above that.
    const w1 = Math.round(r1.typing.wpm), w2 = Math.round(r2.typing.wpm);
    assert(texts.indexOf(w2 > w1 ? 'NEW BEST! +' + (w2 - w1) : 'BEST ' + w1) !== -1 && texts.indexOf('NEW BEST!') === -1,
      'the WPM note after ' + w1 + ' and then ' + w2 + ': ' + texts.join(' | '));
    assert(!shot.nextStageOffered(s) && screens.indexOf('highScoreEntry') === -1, 'the initials screen came before the end of the run');
    for (let i = 0; i < 10 && s.screen() === 'results'; i++) {
      s.press('enter');
      s.frames(10);
    }
    assert(s.screen() === 'highScoreEntry', 'no initials screen at the end of the run: ' + s.screen());
    s.seconds(0.6);                                 // with world scores on, Enter is not read for half a second
    s.type('two');
    s.press('enter');
    assert(s.screen() === 'title' && TG.UI.panel === 'scores' && TG.UI.page === difficulty, 'after the entry: ' + s.screen() + ' ' + TG.UI.panel + ' ' + TG.UI.page);

    // One of everything, with the run total and the run time.
    assert(screens.filter((n) => n === 'highScoreEntry').length === 1, 'initials screens: ' + screens.join('>'));
    const mine = dated(TG, difficulty);
    assert(mine.length === 1 && mine[0].name === 'TWO' && mine[0].score === r2.score && mine[0].cleared === true && mine[0].rank === r2.rank, 'entries ' + JSON.stringify(mine));
    assert(requests(world, 'POST', '/v1/runs').length === 1, 'run tokens asked for: ' + requests(world, 'POST', '/v1/runs').length);
    const posts = requests(world, 'POST', '/v1/scores');
    assert(posts.length === 1, 'submissions: ' + posts.length);
    const body = posts[0].body;
    assert(body.name === 'TWO' && body.score === r2.score && body.time === Math.floor(r2.time) && body.cleared === true && body.rank === r2.rank, 'submission ' + JSON.stringify(body));
    assert(world.lists[difficulty].filter((e) => e.name === 'TWO').length === 1, 'rows on the board');
    assert(TG.Save.pending() === null && storedRecord(s).pending === null, 'the pending entry was left after the run ended');
    assert(TG.Save.best(difficulty).score === r2.score && TG.Save.getSetting('lastLevel') === 1, 'best ' + TG.Save.best(difficulty).score);
    quiet(s);
  });
}

check('TITLE at STAGE 1 CLEAR: Esc is read only on the strip and ends the run there, as Enter did before Level 2: one initials screen, ' +
  'one entry and one submission with the Stage 1 total, and a second Esc at once does not stop the sending; ' +
  'then the STAGE row starts Level 2 on a difficulty that was never cleared', function () {
  const world = shot.createWorld();
  const s = session({ world: world });
  const TG = s.TG;
  fixSeed(s, 9300);
  const levels = [];
  TG.Events.on('level:start', (p) => levels.push(p.levelId));
  assert(startRun(s, 'medium'), 'run did not start');
  assert(stepUntil(s, shot.createBot(), () => s.screen() === 'results', 1500), 'Level 1 did not finish');
  const r1 = TG.Game.state.result;
  s.seconds(0.7);
  s.press('esc');                                   // the first page, tallying: Esc has no meaning
  s.press('enter');                                 // finishes the tally and stamps the rank
  s.press('esc');
  s.press('enter');                                 // the second page
  s.press('esc');
  s.press('enter');                                 // finishes its tally: the strip
  assert(s.screen() === 'results', 'Esc acted before the strip: ' + s.screen());
  s.press('esc');                                   // TITLE
  assert(s.screen() === 'highScoreEntry', 'Esc on the strip: ' + s.screen());
  s.press('esc');                                   // inside the half second in which Esc is not read
  s.seconds(0.6);
  let texts = drawnTexts(s);
  assert(texts.indexOf('INITIALS AND SCORE ALSO GO TO WORLD SCORES') !== -1, 'the second Esc switched the sending off: ' + texts.join(' | '));
  s.type('one');
  s.press('enter');
  assert(s.screen() === 'title' && TG.UI.panel === 'scores', 'after the entry: ' + s.screen());
  const mine = dated(TG, 'medium');
  assert(mine.length === 1 && mine[0].name === 'ONE' && mine[0].score === r1.score && mine[0].cleared === true && mine[0].rank === r1.rank, 'entries ' + JSON.stringify(mine));
  const posts = requests(world, 'POST', '/v1/scores');
  assert(posts.length === 1 && posts[0].body.score === r1.score && posts[0].body.time === Math.floor(r1.time), 'submissions ' + JSON.stringify(posts.map((c) => c.body)));
  assert(TG.Save.pending() === null && levels.join() === '1', 'pending ' + JSON.stringify(TG.Save.pending()) + ', levels started ' + levels.join());

  // The clear opened Level 2 for every difficulty (decision 5).
  s.seconds(0.6);                                   // the page that shows the place reads no keys at first
  s.press('esc');
  s.press('enter');
  assert(s.screen() === 'difficultySelect', 'screen ' + s.screen());
  texts = drawnTexts(s);
  assert(texts.indexOf('STAGE 1  QUILL MEADOWS') !== -1, 'no STAGE row after the clear: ' + texts.join(' | '));
  s.press('down');
  texts = drawnTexts(s);
  assert(texts.indexOf('STAGE 2  CLOCKWORK CAVERNS') !== -1 && TG.Save.getSetting('lastLevel') === 2, 'the row did not change: ' + texts.join(' | '));
  s.type('hard');
  s.frames(10);
  s.type('ready');
  const st = TG.Game.state;
  assert(s.screen() === 'playing' && st.levelId === 2 && st.difficulty === 'hard', 'not in Level 2 on Hard: ' + s.screen() + ' ' + st.levelId + ' ' + st.difficulty);
  assert(st.score === 0 && st.time < 0.1 && st.player.lives === 3 && st.run.stages === 0 && st.run.stageScore === 0, 'the run did not start afresh');
  assert(requests(world, 'POST', '/v1/runs').length === 2 && TG.Board.hasToken('hard') === true, 'no run token for the new run');
  s.seconds(2);
  assert(loopSeq(TG).name === 'level2', 'music ' + loopSeq(TG).name);
  quiet(s);
});

check('NEXT STAGE, then QUIT from the pause menu at once: the run keeps the rank it had at STAGE 1 CLEAR and counts as cleared ' +
  'on its entry and on its submission (decision 28)', function () {
  const world = shot.createWorld();
  const s = session({ world: world });
  const TG = s.TG;
  fixSeed(s, 9400);
  const r1 = throughNextStage(s, 'hard').result;
  assert(r1.rank === 'S' || r1.rank === 'A', 'the first stage ranked ' + r1.rank + ': the case needs S or A');
  s.press('esc');
  assert(s.screen() === 'paused', 'not paused: ' + s.screen());
  s.press('up');                                    // from RESUME round to QUIT
  s.press('enter');
  s.press('enter');                                 // QUIT asks for a second Enter
  const r = TG.Game.state.result;
  assert(s.screen() === 'results' && r !== r1 && r.levelId === 2 && r.cleared === false && r.stages === 1, 'result ' + s.screen());
  assert(r.rank === r1.rank && r.score === r1.score && r.stageScore === r1.score, 'rank ' + r.rank + ' after ' + r1.rank + ', score ' + r.score + ' after ' + r1.score);
  s.seconds(5);
  const texts = drawnTexts(s);
  assert(texts.indexOf('RUN ENDED') !== -1 && texts.indexOf('STAGE 1 SCORE') !== -1 && texts.indexOf(r1.rank) !== -1, 'results: ' + texts.join(' | '));
  assert(!shot.nextStageOffered(s), 'NEXT STAGE is offered after a run that was ended');
  for (let i = 0; i < 10 && s.screen() === 'results'; i++) {
    s.press('enter');
    s.frames(10);
  }
  assert(s.screen() === 'highScoreEntry', 'no initials screen: ' + s.screen());
  s.seconds(0.6);
  s.type('qit');
  s.press('enter');
  const mine = dated(TG, 'hard');
  assert(mine.length === 1 && mine[0].name === 'QIT' && mine[0].cleared === true && mine[0].rank === r1.rank && mine[0].score === r1.score, 'entries ' + JSON.stringify(mine));
  const posts = requests(world, 'POST', '/v1/scores');
  assert(posts.length === 1 && posts[0].body.cleared === true && posts[0].body.rank === r1.rank && posts[0].body.score === r1.score &&
    posts[0].body.time === Math.floor(r.time), 'submissions ' + JSON.stringify(posts.map((c) => c.body)));
  assert(TG.Save.pending() === null, 'pending left');
  quiet(s);
});

check('NEXT STAGE with the world scores switched off, with a run token that arrived late, with the service out of reach from the ' +
  'start, and with the service lost during Level 2: the run goes on each time, is entered on this computer at its end, and is ' +
  'sent only with a run token', function () {
  if (QUICK) return 'skip';
  for (const mode of ['off', 'slow', 'down', 'lost']) {
    const world = shot.createWorld();
    const s = session({ world: world });
    const TG = s.TG;
    fixSeed(s, 9500);
    if (mode === 'off') TG.Save.setSetting('worldScores', false);
    if (mode === 'slow') world.hold = true;         // no reply yet
    if (mode === 'down') world.down = true;
    assert(startRun(s, 'medium'), mode + ': run did not start');
    const bot = shot.createBot();
    if (mode === 'slow') {                          // the token arrives three seconds into Level 1
      s.steps(60 * 3, bot);
      assert(TG.Board.hasToken('medium') === false, 'slow: a run token before the reply');
      world.hold = false;
      world.release();
    }
    assert(stepUntil(s, bot, () => s.screen() === 'results', 1500), mode + ': Level 1 did not finish');
    const r1 = TG.Game.state.result;
    toStrip(s);
    s.press('enter');
    assert(s.screen() === 'playing' && TG.Game.state.levelId === 2, mode + ': NEXT STAGE did not start Level 2: ' + s.screen());
    assert(TG.Board.hasToken('medium') === (mode === 'slow' || mode === 'lost'), mode + ': run token ' + TG.Board.hasToken('medium'));
    if (mode === 'lost') world.down = true;
    assert(stepUntil(s, bot, () => s.screen() === 'results', 1500), mode + ': Level 2 did not finish');
    const r2 = TG.Game.state.result;
    assert(r2.cleared === true && r2.stages === 2 && r2.score > r1.score, mode + ': second result');
    s.seconds(0.7);
    for (let i = 0; i < 10 && s.screen() === 'results'; i++) {
      s.press('enter');
      s.frames(10);
    }
    assert(s.screen() === 'highScoreEntry', mode + ': no initials screen: ' + s.screen());
    s.seconds(0.6);
    // The screen says that the score is also sent only when it will be.
    const says = drawnTexts(s).indexOf('INITIALS AND SCORE ALSO GO TO WORLD SCORES') !== -1;
    assert(says === (mode === 'slow' || mode === 'lost'), mode + ': the initials screen ' + (says ? 'says' : 'does not say') + ' that the score is sent');
    s.type('abc');
    s.press('enter');
    assert(s.screen() === 'title' && TG.UI.panel === 'scores', mode + ': after the entry: ' + s.screen());
    const mine = dated(TG, 'medium');
    assert(mine.length === 1 && mine[0].score === r2.score && mine[0].cleared === true, mode + ': entries ' + JSON.stringify(mine));
    assert(TG.Save.pending() === null, mode + ': pending left');
    const posts = requests(world, 'POST', '/v1/scores');
    if (mode === 'off') assert(world.calls.length === 0, 'off: requests were made: ' + world.calls.map((c) => c.path).join(', '));
    if (mode === 'slow') {
      assert(requests(world, 'POST', '/v1/runs').length === 1 && posts.length === 1 && posts[0].body.score === r2.score &&
        posts[0].body.time === Math.floor(r2.time) && TG.Board.state.send === 'sent', 'slow: ' + posts.length + ' sent, ' + TG.Board.state.send);
    }
    if (mode === 'down') assert(posts.length === 0, 'down: a score was sent without a run token');
    if (mode === 'lost') {
      assert(posts.length === 1 && posts[0].body.score === r2.score && TG.Board.state.send === 'failed', 'lost: ' + posts.length + ' sent, ' + TG.Board.state.send);
      s.seconds(0.6);
      const texts = drawnTexts(s);
      assert(texts.indexOf('YOUR SCORE IS SAVED ON THIS COMPUTER.') !== -1, 'lost: the page does not say where the score is: ' + texts.join(' | '));
    }
    quiet(s, mode);
  }
});

check('options set on the title (key guide on, reduce flash, adaptive pace off, music and sound effects off) are in force ' +
  'in Level 2 after NEXT STAGE', function () {
  if (QUICK) return 'skip';
  const s = session();
  const TG = s.TG;
  fixSeed(s, 9600);
  s.frames(2);
  s.press('enter');
  s.seconds(1.5);
  for (let i = 0; i < 3; i++) s.press('down');
  s.press('enter');                                 // OPTIONS
  s.press('enter');                                 // MUSIC off
  s.press('down'); s.press('enter');                // SOUND EFFECTS off
  s.press('down');                                  // CRT EFFECT
  s.press('down'); s.press('enter');                // REDUCE FLASH on
  s.press('down'); s.press('enter');                // KEY GUIDE auto -> on (auto is off on Hard)
  s.press('down'); s.press('enter');                // ADAPTIVE PACE off
  s.press('esc');
  for (let i = 0; i < 3; i++) s.press('up');        // back to START
  assert(startFromTitle(s, 'hard'), 'run did not start');
  assert(stepUntil(s, shot.createBot(), () => s.screen() === 'results', 1500), 'Level 1 did not finish');
  toStrip(s);
  const nodes = s.env.audio.nodes;
  s.press('enter');
  const st = TG.Game.state;
  assert(s.screen() === 'playing' && st.levelId === 2, 'not in Level 2');
  assert(st.adaptive === false && st.assist === 1, 'adaptive pace: ' + st.adaptive + ', assist ' + st.assist);
  assert(TG.Hud.keyGuideOn(st) === true, 'the key guide is not on in Level 2');
  playDrawn(s, shot.createBot(), () => false, 4);
  assert(s.env.audio.nodes === nodes, 'sound in Level 2 with music and sound effects off: ' + (s.env.audio.nodes - nodes) + ' nodes');
  // A life lost in Level 2: no shake and no flash.
  const bot = shot.createBot({ type: false });
  let lost = 0, moved = 0;
  TG.Events.on('life:lost', () => lost++);
  playDrawn(s, bot, () => lost >= 2, 120, function () {
    const k = TG.Effects.shake();
    if (k.x !== 0 || k.y !== 0 || TG.Effects.flash() !== null) moved++;
  });
  assert(lost >= 2, 'no life was lost');
  assert(moved === 0, 'reduce flash is not in force in Level 2: ' + moved + ' frames with a shake or a flash');
  quiet(s);
});

// The stored strings of test/fixtures/save-before-level2.json: records written by the game as it was
// before any Level 2 work, after real runs there (its "what" says how).
const OLD_RECORDS = JSON.parse(read('test/fixtures/save-before-level2.json')).records;
const OLD_SETTINGS = ['music', 'sfx', 'crt', 'reduceFlash', 'keyGuide', 'adaptive', 'tutorialDone', 'lastDifficulty', 'initials', 'worldScores'];

// What of the old record `was` is not in `now` (a parsed stored record, or one read through TG.Save):
// a list of messages, empty when nothing is lost. changed: the settings, tables, bests and assist values
// that a run since then has changed on purpose, as { settings: [...], difficulties: [...] }.
function lostFrom(was, now, changed) {
  const c = changed || {};
  const out = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const k of OLD_SETTINGS) {
    if (!(k in was.settings)) out.push('the old record has no setting ' + k);
    else if ((c.settings || []).indexOf(k) === -1 && now.settings[k] !== was.settings[k]) out.push('setting ' + k + ': ' + now.settings[k] + ' for ' + was.settings[k]);
  }
  for (const d of ['easy', 'medium', 'hard']) {
    if ((c.difficulties || []).indexOf(d) !== -1) continue;
    if (!same(now.scores[d], was.scores[d])) out.push('the ' + d + ' table');
    if (!same(now.best[d], was.best[d])) out.push('the ' + d + ' bests');
    if (now.assist[d] !== was.assist[d]) out.push('the ' + d + ' assist');
  }
  return out;
}

// The record the game holds, read through TG.Save, in the shape of a stored one.
function heldRecord(TG) {
  const out = { settings: {}, scores: {}, best: {}, assist: {} };
  for (const k of OLD_SETTINGS) out.settings[k] = TG.Save.getSetting(k);
  for (const d of ['easy', 'medium', 'hard']) {
    out.scores[d] = JSON.parse(JSON.stringify(TG.Save.scores(d)));
    out.best[d] = JSON.parse(JSON.stringify(TG.Save.best(d)));
    out.assist[d] = TG.Save.assist(d);
  }
  return out;
}

check('a record stored before Level 2 (scores, bests, saved pace, initials and five options changed), read through a reload: ' +
  'nothing is lost on loading, at the first save, after a Level 2 run from the STAGE row, or after a second reload', function () {
  const stored = OLD_RECORDS.played;
  const was = JSON.parse(stored);
  assert(was.version === 1 && !('pending' in was) && !('lastLevel' in was.settings) && !('clearedEasy' in was.settings), 'the fixture is not a record from before Level 2');
  const s = session({ stored: { [STORAGE_KEY]: stored } });
  const TG = s.TG;
  fixSeed(s, 9700);

  // 1. The page has loaded. Nothing was written, and the game holds every value of the record.
  assert(s.env.storage.get(STORAGE_KEY) === stored, 'loading wrote to the stored record');
  let lost = lostFrom(was, heldRecord(TG));
  assert(lost.length === 0, 'lost on loading: ' + lost.join('; '));
  assert(TG.Save.getSetting('lastLevel') === 1 && TG.Save.pending() === null, 'the new fields do not start at their defaults');
  // Level 2 is open from the dated cleared entries of Easy and Medium; the Hard entry was not a clear.
  assert(TG.Save.getSetting('clearedEasy') === 1 && TG.Save.getSetting('clearedMedium') === 1 && TG.Save.getSetting('clearedHard') === 0 &&
    TG.Save.levelOpen(2) === true, 'the unlock from the tables');

  // 2. As the player meets it: the tables, the options, and the STAGE row.
  s.frames(2);
  s.press('enter');
  s.seconds(1.5);
  s.press('down'); s.press('down'); s.press('enter');     // HIGH SCORES
  assert(TG.UI.panel === 'scores' && TG.UI.page === null, 'the panel: ' + TG.UI.panel + ' ' + TG.UI.page);
  let texts = drawnTexts(s);
  for (const line of ['1 DAV 0033930', '1 DAV 0052260', '3 EVE 0035440', '5 EVE 0018550']) {
    assert(texts.indexOf(line) !== -1, '"' + line + '" is not on the High Scores panel: ' + texts.join(' | '));
  }
  s.press('esc');
  s.press('up'); s.press('up');                           // back to START
  s.press('enter');
  assert(s.screen() === 'difficultySelect', 'screen ' + s.screen());
  texts = drawnTexts(s);
  assert(texts.indexOf('STAGE 1  QUILL MEADOWS') !== -1, 'no STAGE row for a player who cleared Level 1 before Level 2 existed: ' + texts.join(' | '));
  assert(s.env.storage.get(STORAGE_KEY) === stored, 'the menus wrote to the stored record');
  s.press('down');                                        // STAGE 2: the first save of the new game
  let now = storedRecord(s);
  lost = lostFrom(was, now);
  assert(lost.length === 0 && now.version === 1, 'lost at the first save: ' + lost.join('; '));
  assert(now.settings.lastLevel === 2 && now.settings.clearedEasy === 1 && now.settings.clearedMedium === 1 && now.settings.clearedHard === 0 &&
    now.pending === null, 'the new fields in the stored record: ' + JSON.stringify(now.settings));

  // 3. A Level 2 run on Easy from the row, with the saved pace and options of the record, entered as EVE.
  s.type('easy');
  s.frames(10);
  s.type('ready');
  const st = TG.Game.state;
  assert(s.screen() === 'playing' && st.levelId === 2 && st.difficulty === 'easy', 'not in Level 2: ' + s.screen());
  assert(st.assist === was.assist.easy && st.adaptive === true && TG.Hud.keyGuideOn(st) === false, 'saved pace ' + st.assist + ', key guide ' + TG.Hud.keyGuideOn(st));
  assert(stepUntil(s, shot.createBot(), () => s.screen() === 'results', 1500), 'the run did not finish');
  const res = TG.Game.state.result;
  assert(res.cleared === true && res.levelId === 2 && res.bestScore === was.best.easy.score, 'result: best before the run ' + res.bestScore);
  s.seconds(5);
  texts = drawnTexts(s);
  assert(texts.indexOf('STAGE 2 CLEAR!') !== -1 && texts.every((t) => t.indexOf('UNLOCKED') === -1), 'results: ' + texts.join(' | '));
  leaveResults(s, '');                                    // Enter with no letters keeps the saved initials
  assert(s.screen() === 'title', 'screen ' + s.screen());

  // 4. A second reload. The run changed the Easy table, bests and pace, and two settings; all else is as it was.
  for (const [where, record] of [['stored after the run', storedRecord(s)], ['held after a second reload', null]]) {
    let TG2 = TG;
    if (!record) {
      const again = session({ stored: s.env.storage });
      TG2 = again.TG;
      quiet(again, 'second reload');
    }
    now = record || heldRecord(TG2);
    lost = lostFrom(was, now, { settings: ['lastDifficulty'], difficulties: ['easy'] });
    assert(lost.length === 0, where + ', lost: ' + lost.join('; '));
    assert(now.settings.lastDifficulty === 'easy' && now.settings.initials === 'EVE', where + ': ' + JSON.stringify(now.settings));
    const want = [{ name: 'EVE', score: res.score }].concat(was.scores.easy.slice(0, 4).map((e) => ({ name: e.name, score: e.score })));
    assert(JSON.stringify(now.scores.easy.map((e) => ({ name: e.name, score: e.score }))) === JSON.stringify(want), where + ', the Easy table: ' + JSON.stringify(now.scores.easy));
    assert(now.best.easy.score === res.score && now.best.easy.wpm >= was.best.easy.wpm, where + ', the Easy bests: ' + JSON.stringify(now.best.easy));
    assert(TG2.Save.getSetting('clearedEasy') === 2 && TG2.Save.getSetting('clearedMedium') === 1 && TG2.Save.getSetting('lastLevel') === 2 &&
      TG2.Save.pending() === null, where + ': the new fields');
  }
  quiet(s);
});

check('the same player after RESET SCORES (no dated entry left): the record loads with nothing lost and without the STAGE row; ' +
  'the next clear of Level 1 opens it, with STAGE 2 UNLOCKED on the results screen', function () {
  const stored = OLD_RECORDS.reset;
  const was = JSON.parse(stored);
  const s = session({ stored: { [STORAGE_KEY]: stored } });
  const TG = s.TG;
  fixSeed(s, 9800);
  const lost = lostFrom(was, heldRecord(TG));
  assert(lost.length === 0 && s.env.storage.get(STORAGE_KEY) === stored, 'lost on loading: ' + lost.join('; '));
  assert(TG.Save.levelOpen(2) === false, 'Level 2 is open with no dated cleared entry');
  s.frames(2);
  s.press('enter');
  s.seconds(1.5);
  s.press('enter');
  let texts = drawnTexts(s);
  assert(s.screen() === 'difficultySelect' && texts.every((t) => t.indexOf('STAGE') === -1), 'a STAGE row before the unlock: ' + texts.join(' | '));
  s.press('up');                                          // without the row, Up moves the difficulty: Hard to Medium
  s.press('enter');
  assert(s.screen() === 'howToPlay' && TG.Save.getSetting('lastLevel') === 1, 'screen ' + s.screen() + ', lastLevel ' + TG.Save.getSetting('lastLevel'));
  s.type('ready');
  const st = TG.Game.state;
  assert(st.levelId === 1 && st.difficulty === 'medium' && st.assist === was.assist.medium, 'level ' + st.levelId + ' on ' + st.difficulty + ', assist ' + st.assist);
  assert(stepUntil(s, shot.createBot(), () => s.screen() === 'results', 1500), 'the run did not finish');
  s.seconds(5);
  texts = drawnTexts(s);
  assert(texts.indexOf('STAGE 2 UNLOCKED: CLOCKWORK CAVERNS') !== -1 && TG.Save.levelOpen(2) === true, 'results: ' + texts.join(' | '));
  const now = storedRecord(s);
  const gone = lostFrom(was, now, { settings: ['lastDifficulty'], difficulties: ['medium'] });
  assert(gone.length === 0 && now.settings.clearedMedium === 1, 'lost after the run: ' + gone.join('; '));
  quiet(s);
});

check('a tab closed in Level 2 after NEXT STAGE: at the next start the Stage 1 total is in the table, once, under the initials used last, ' +
  'and a later start adds nothing; a tab closed on the STAGE 1 CLEAR screen leaves nothing to enter; the bests and the unlock are kept', function () {
  const s = session();
  const TG = s.TG;
  // A first run, ended with TITLE at STAGE 1 CLEAR and entered as ZOE.
  fixSeed(s, 9901);
  assert(startRun(s, 'easy'), 'first run did not start');
  assert(stepUntil(s, shot.createBot(), () => s.screen() === 'results', 1500), 'first run did not finish');
  const first = TG.Game.state.result;
  toStrip(s);
  const atStrip = new Map(s.env.storage);                 // a tab closed here, before the choice
  s.press('esc');
  assert(s.screen() === 'highScoreEntry', 'screen ' + s.screen());
  s.type('zoe');
  s.press('enter');
  assert(s.screen() === 'title' && dated(TG, 'easy').length === 1, 'the first run was not entered');
  // A second run goes on to Level 2, and the tab is closed there.
  fixSeed(s, 9902);
  assert(startFromTitle(s, 'easy'), 'second run did not start');
  assert(stepUntil(s, shot.createBot(), () => s.screen() === 'results', 1500), 'second run did not finish');
  const r1 = TG.Game.state.result;
  assert(r1.cleared === true && r1.score !== first.score, 'the second run is the first again');
  toStrip(s);
  s.press('enter');
  s.steps(60 * 40, shot.createBot());
  assert(TG.Game.state.levelId === 2 && TG.Game.isSimScreen(s.screen()), 'not playing Level 2: ' + s.screen());
  assert(dated(TG, 'easy').length === 1, 'the second run is in the table before it ended');
  const closed = new Map(s.env.storage);
  assert(JSON.parse(closed.get(STORAGE_KEY)).pending.entry.score === r1.score, 'the stored record has no pending entry');
  quiet(s, 'the session that was closed');

  // The next start.
  const b = session({ stored: closed });
  const want = [first.score, r1.score].sort((x, y) => y - x);
  let mine = dated(b.TG, 'easy');
  assert(mine.length === 2 && mine.every((e) => e.name === 'ZOE') && mine.map((e) => e.score).join() === want.join(), 'the table at the next start: ' + JSON.stringify(mine));
  const entered = mine.filter((e) => e.score === r1.score)[0];
  assert(entered.cleared === true && entered.rank === r1.rank && entered.wpm === Math.round(r1.typing.wpm), 'the entry ' + JSON.stringify(entered));
  assert(b.TG.Save.pending() === null && storedRecord(b).pending === null, 'the pending entry was not cleared at the start');
  assert(b.TG.Save.levelOpen(2) === true && b.TG.Save.best('easy').score === Math.max(first.score, r1.score), 'the unlock or the best score was lost');
  b.frames(2);
  b.press('enter');
  b.seconds(1.5);
  b.press('down'); b.press('down'); b.press('enter');     // HIGH SCORES
  const texts = drawnTexts(b);
  assert(texts.filter((t) => / ZOE /.test(t)).length === 2, 'the High Scores panel: ' + texts.join(' | '));
  quiet(b, 'the next start');

  // A later start adds nothing.
  const c = session({ stored: b.env.storage });
  mine = dated(c.TG, 'easy');
  assert(mine.length === 2 && mine.map((e) => e.score).join() === want.join(), 'the table at a later start: ' + JSON.stringify(mine));
  quiet(c, 'a later start');

  // The tab closed on the STAGE 1 CLEAR screen: the run was recorded there, and nothing waits to be entered.
  const d = session({ stored: atStrip });
  assert(dated(d.TG, 'easy').length === 0 && d.TG.Save.pending() === null, 'an entry from a tab closed at STAGE 1 CLEAR: ' + JSON.stringify(dated(d.TG, 'easy')));
  assert(d.TG.Save.levelOpen(2) === true && d.TG.Save.best('easy').score === first.score, 'the unlock or the best score was lost');
  quiet(d, 'the tab closed at STAGE 1 CLEAR');
});

console.log('# ' + passed + ' passed, ' + failed + ' failed, ' + skipped + ' skipped');
process.exitCode = failed > 0 ? 1 : 0;
