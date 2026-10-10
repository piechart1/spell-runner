// test/test-level1-pixels.js
// The Level 1 pixel regression (docs/LEVEL2.md 13.4, milestone M0, and 13.5 "Regressions").
// Run from the project root: node test/test-level1-pixels.js
//
// Level 1 must be drawn exactly as it was before the engine began to read from level data what Level 1
// hard-codes. test/fixtures/level1-pixels/ holds 36 frames taken with tools/shot.js at that time, at
// scale 1, from one run on each difficulty with the target profile and seed 1. On every difficulty: the
// frames at 30, 150 and 260 s, at boss:enter, at the first and the second boss:phase event (the six of
// LEVEL2 13.4), 2.3 s after boss:enter and 1 s after boss:defeat. On one difficulty: twelve more, chosen
// because they show what those do not (ONE_RUN below says what each is for). Between them the frames of
// the Medium run show every tile but the plank, every hazard, every creature, the crate and both of the
// Baron's attacks, so that --quick sees them too. This file plays the same three runs with the code as it
// is now, takes the same frames (all those of a difficulty from one run, through the `run` function of
// tools/shot.js) and compares every pixel with the reference.
//
//   node test/test-level1-pixels.js            all 36 frames (about 65 s)
//   node test/test-level1-pixels.js --quick    the 19 frames of the Medium run (about 20 s)
//   node test/test-level1-pixels.js --record   writes the 36 frames as the new reference; compares nothing
//
// A frame that differs is written, as it is now, to a folder under the system's temporary folder, and
// its path is printed beside the reference's, so that the two pictures can be opened side by side. The
// run is deterministic, so a difference is a change in the drawing or in the simulation, never noise;
// it is explained before it is accepted. A deliberate change to how Level 1 is drawn means new reference
// files, with the owner's agreement (LEVEL2 13.4): --record makes them.
//
// A reference file is the picture that tools/shot.js writes for the same moment, for example:
//   node tools/shot.js --out medium-150s.png --difficulty medium --seed 1 --profile target --at 150 --scale 1
//   node tools/shot.js --out hard-boss-phase2.png --difficulty hard --seed 1 --profile target --event boss:phase:1 --scale 1
//   node tools/shot.js --out easy-boss-intro.png --difficulty easy --seed 1 --profile target --event boss:enter --after 2.3 --scale 1
// The last part of this file checks that on two frames, and the --level option of the tool and of
// test/sim.js.
//
// What no frame shows: the target bot types every Digby while it is still under its mound, so a Digby
// above ground is in none of the three runs. test/test-render.js checks where it is drawn.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const stubs = require('./stubs');
const png = require('../tools/png');
const shot = require('../tools/shot');

const QUICK = process.argv.indexOf('--quick') !== -1;
const RECORD = process.argv.indexOf('--record') !== -1;

const DIR = path.join(stubs.ROOT, 'test', 'fixtures', 'level1-pixels');
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const QUICK_DIFFICULTIES = ['medium'];
const W = 384, H = 216;

// The frames of one run, in the terms of tools/shot.js: `at` is --at <seconds>; `event` with `n` is
// --event <name>:<n>, and `after` with it is --after <seconds>.
const EVERY_RUN = [
  { name: '030s', what: 'at 30 s', at: 30 },
  { name: '150s', what: 'at 150 s', at: 150 },
  { name: '260s', what: 'at 260 s', at: 260 },
  { name: 'boss-enter', what: 'at boss:enter', event: 'boss:enter', n: 1 },
  { name: 'boss-intro', what: '2.3 s after boss:enter (the monocle polished, the speech plate eight letters in)', event: 'boss:enter', n: 1, after: 2.3 },
  { name: 'boss-phase2', what: 'at the first boss:phase event (phase 2 begins)', event: 'boss:phase', n: 1 },
  { name: 'boss-phase3', what: 'at the second boss:phase event (phase 3 begins)', event: 'boss:phase', n: 2 },
  { name: 'boss-defeat', what: '1 s after boss:defeat (the small figure spinning, the helmet in the air)', event: 'boss:defeat', n: 1, after: 1 }
];
// The frames of one difficulty only. The times are those of its run with seed 1, which does not change.
const ONE_RUN = {
  easy: [
    { name: '210s', what: 'at 210 s (a plank bridge and a dark gap, a crate with the quill)', at: 210 }
  ],
  medium: [
    { name: '075s', what: 'at 75 s (a Boulder with its cracks, a Hoppet, a water gap)', at: 75 },
    { name: '118s', what: 'at 118 s (a Swoop, a bramble, a water gap)', at: 118 },
    // 143.01 and not 143: the white flash is on one drawn frame, the one after the frame at 143 s.
    { name: '143s', what: 'just after 143 s (a Digby\'s mound, white on a correct key)', at: 143.01 },
    { name: '174s', what: 'at 174 s (a Truffle, a Buzzle, a beehive on its rope, a crate)', at: 174 },
    { name: '191s', what: 'at 191 s (a Dawdle, a Hoppet, a Digby\'s mound)', at: 191 },
    { name: '203s', what: 'at 203 s (a crate and its power icon, white on a correct key; a branch under a sunset crown; dark gaps)', at: 203 },
    { name: '205s', what: 'at 205 s (a branch and an arch under their sunset crowns)', at: 205 },
    { name: '231s', what: 'at 231 s (the Baron\'s shockwave)', at: 231 },
    { name: '242s', what: 'at 242 s (a rock thrown high, with the mark where it lands)', at: 242 },
    { name: '247s', what: 'at 247 s (the Baron\'s pickaxe)', at: 247 },
    { name: 'boss-sink', what: '1.8 s after boss:defeat (the small figure going down the hole in the mound)', event: 'boss:defeat', n: 1, after: 1.8 }
  ],
  hard: []
};

function momentsOf(difficulty) {
  return EVERY_RUN.concat(ONE_RUN[difficulty]);
}

let passed = 0;
let failed = 0;
let skipped = 0;

function ok(condition, description, detail) {
  if (condition) {
    passed++;
    console.log('ok - ' + description);
  } else {
    failed++;
    console.log('FAIL - ' + description + (detail ? '\n    ' + detail : ''));
  }
}

function check(description, fn) {
  try {
    const result = fn();
    if (result === false) ok(false, description);
    else if (typeof result === 'string') ok(false, description, result);
    else ok(true, description);
  } catch (e) {
    ok(false, description, (e && e.message ? e.message : String(e)).split('\n')[0]);
  }
}

function skip(description) {
  skipped++;
  console.log('skip - ' + description);
}

function referenceFile(difficulty, moment) {
  return path.join(DIR, difficulty + '-' + moment.name + '.png');
}

// Plays one Level 1 run and takes each frame at its moment, as tools/shot.js does in a run of its own:
// the first drawn frame at or after the time, or the frame of the n-th emission of the event, or the
// first frame `after` seconds past that one.
// Returns { frames: { name: rgba }, error }.
function shoot(difficulty) {
  const moments = momentsOf(difficulty);
  const seen = {};
  const eventTime = {};         // by moment name: state.time on the frame of its event
  const frames = {};
  let left = moments.length;
  const ran = shot.run({ difficulty: difficulty, seed: 1, level: 1, profile: 'target' }, {
    setup: function (TG) {
      moments.forEach(function (m) {
        if (!m.event || m.event in seen) return;
        seen[m.event] = 0;
        TG.Events.on(m.event, function () { seen[m.event]++; });
      });
    },
    afterDraw: function (TG, env) {
      const time = TG.Game.state.time;
      moments.forEach(function (m) {
        if (frames[m.name]) return;
        if (m.event) {
          if (seen[m.event] < m.n) return;
          if (!(m.name in eventTime)) eventTime[m.name] = time;
          if (time < eventTime[m.name] + (m.after || 0) - 1e-9) return;
        } else if (time < m.at) return;
        frames[m.name] = env.canvas.toRGBA();
        left--;
      });
      return left === 0;
    }
  });
  const error = ran.stopped ? null
    : 'the run ended before the moment' + (ran.report ? ' (time ' + ran.report.time.toFixed(2) + (ran.report.error ? ', ' + ran.report.error : '') + ')' : '');
  return { frames: frames, error: error };
}

// Where two pictures of the same size differ, as text; null when every pixel is the same.
function difference(reference, rgba) {
  let count = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    if (reference[o] === rgba[o] && reference[o + 1] === rgba[o + 1] && reference[o + 2] === rgba[o + 2] && reference[o + 3] === rgba[o + 3]) continue;
    count++;
    const x = i % W, y = (i - x) / W;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (count === 0) return null;
  return count + ' of ' + (W * H) + ' pixels differ, from x ' + x0 + ', y ' + y0 + ' to x ' + x1 + ', y ' + y1;
}

// Compares a frame with its reference file. Returns true or the text of the failure.
function compare(difficulty, moment, rgba) {
  const file = referenceFile(difficulty, moment);
  const reference = png.read(file);
  if (reference.width !== W || reference.height !== H) return 'the reference is ' + reference.width + ' x ' + reference.height;
  const d = difference(reference.rgba, rgba);
  if (d === null) return true;
  const now = path.join(os.tmpdir(), 'spell-runner-level1-pixels', path.basename(file));
  png.write(now, W, H, rgba);
  return d + '\n    now:       ' + now + '\n    reference: ' + file;
}

// =================================================================================================
// --record: new reference files
// =================================================================================================

if (RECORD) {
  DIFFICULTIES.forEach(function (difficulty) {
    const shotRun = shoot(difficulty);
    if (shotRun.error) {
      console.log('FAIL - ' + difficulty + ': ' + shotRun.error);
      process.exit(1);
    }
    momentsOf(difficulty).forEach(function (m) {
      png.write(referenceFile(difficulty, m), W, H, shotRun.frames[m.name]);
      console.log('recorded ' + path.relative(stubs.ROOT, referenceFile(difficulty, m)));
    });
  });
  process.exit(0);
}

// =================================================================================================
// The reference files
// =================================================================================================

check('level 1 pixels: test/fixtures/level1-pixels holds the 36 reference frames, 384 x 216, and nothing else', function () {
  const want = [];
  DIFFICULTIES.forEach(function (d) { momentsOf(d).forEach(function (m) { want.push(path.basename(referenceFile(d, m))); }); });
  if (want.length !== 36) return 'the lists of moments name ' + want.length + ' frames';
  const have = fs.readdirSync(DIR).filter(function (f) { return f.charAt(0) !== '.'; }).sort();
  if (JSON.stringify(have) !== JSON.stringify(want.slice().sort())) return 'the folder holds ' + have.join(', ');
  const wrong = have.filter(function (f) {
    const p = png.read(path.join(DIR, f));
    return p.width !== W || p.height !== H;
  });
  return wrong.length === 0 ? true : 'not 384 x 216: ' + wrong.join(', ');
});

check('level 1 pixels: the comparison reports a single changed pixel and where it is', function () {
  const reference = png.read(referenceFile('medium', EVERY_RUN[0])).rgba;
  const changed = new Uint8ClampedArray(reference);
  const o = (100 * W + 200) * 4;
  changed[o] = changed[o] === 255 ? 0 : 255;
  return difference(reference, reference) === null &&
    difference(reference, changed) === '1 of 82944 pixels differ, from x 200, y 100 to x 200, y 100';
});

// =================================================================================================
// The three runs
// =================================================================================================

DIFFICULTIES.forEach(function (difficulty) {
  if (QUICK && QUICK_DIFFICULTIES.indexOf(difficulty) === -1) {
    skip('level 1 pixels: the ' + momentsOf(difficulty).length + ' frames of the ' + difficulty + ' run (not with --quick)');
    return;
  }
  let shotRun;
  try {
    shotRun = shoot(difficulty);
  } catch (e) {
    shotRun = { frames: {}, error: 'the run threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e) };
  }
  momentsOf(difficulty).forEach(function (m) {
    check('level 1 pixels: ' + difficulty + ' ' + m.what + ' is the reference picture', function () {
      const rgba = shotRun.frames[m.name];
      if (!rgba) return shotRun.error || 'the frame was not taken';
      return compare(difficulty, m, rgba);
    });
  });
});

// =================================================================================================
// tools/shot.js and test/sim.js on the command line
// =================================================================================================

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-shot-'));

function runShot(args) {
  return childProcess.spawnSync(process.execPath, [path.join(stubs.ROOT, 'tools', 'shot.js')].concat(args),
    { cwd: stubs.ROOT, encoding: 'utf8' });
}

// A frame of the Medium reference run, taken by the tool itself in a run of its own, against its
// reference file. `moment` is the tool's options for the frame.
function shotOfMoment(file, name, moment) {
  const m = EVERY_RUN.filter(function (e) { return e.name === name; })[0];
  const r = runShot(['--out', file, '--difficulty', 'medium', '--seed', '1', '--profile', 'target', '--scale', '1'].concat(moment));
  if (r.status !== 0) return 'exit code ' + r.status + ': ' + (r.stderr || r.stdout).trim().split('\n')[0];
  const picture = png.read(file);
  if (picture.width !== W || picture.height !== H) return 'the picture is ' + picture.width + ' x ' + picture.height;
  return compare('medium', m, picture.rgba);
}

check('node tools/shot.js --at 30 --scale 1 on Medium writes the reference picture', function () {
  return shotOfMoment(path.join(tmp, 'plain.png'), '030s', ['--at', '30']);
});

check('node tools/shot.js --level 1 writes the same picture: Level 1 is the default', function () {
  return shotOfMoment(path.join(tmp, 'level1.png'), '030s', ['--at', '30', '--level', '1']);
});

if (QUICK) {
  skip('node tools/shot.js --event boss:enter --after 2.3 writes the reference picture (not with --quick: it plays to the arena)');
} else {
  check('node tools/shot.js --event boss:enter --after 2.3 --scale 1 on Medium writes the reference picture', function () {
    return shotOfMoment(path.join(tmp, 'intro.png'), 'boss-intro', ['--event', 'boss:enter', '--after', '2.3']);
  });
}

check('node tools/shot.js --level N for a level that is not built ends with code 2, says so in one line and writes no picture', function () {
  const file = path.join(tmp, 'level99.png');
  const r = runShot(['--out', file, '--level', '99', '--at', '1', '--scale', '1']);
  const text = r.stderr.trim();
  if (r.status !== 2) return 'exit code ' + r.status + ': ' + (r.stderr || r.stdout).trim().split('\n')[0];
  if (text.split('\n').length !== 1 || text.indexOf('level 99 is not built') === -1 || /\bat .*:\d+/.test(text)) return 'it printed: ' + text;
  return !fs.existsSync(file);
});

check('node tools/shot.js --level with something that is not a level number ends with code 1 and the usage', function () {
  const a = runShot(['--out', path.join(tmp, 'a.png'), '--level', '0', '--at', '1']);
  const b = runShot(['--out', path.join(tmp, 'b.png'), '--level', 'two', '--at', '1']);
  return a.status === 1 && b.status === 1 && a.stderr.indexOf('--level must be a level number') !== -1 &&
    b.stderr.indexOf('--level needs a number') !== -1 && a.stderr.indexOf('usage:') !== -1 &&
    !fs.existsSync(path.join(tmp, 'a.png')) && !fs.existsSync(path.join(tmp, 'b.png'));
});

// Level 99 and not 2, so that the case stands when Level 2 is built.
check('node test/sim.js --level N for a level that is not built plays nothing, says LEVEL N NOT BUILT and ends with code 1', function () {
  const r = childProcess.spawnSync(process.execPath, [path.join(stubs.ROOT, 'test', 'sim.js'), '--level', '99'], { cwd: stubs.ROOT, encoding: 'utf8' });
  const lines = r.stdout.trim().split('\n');
  if (r.status !== 1) return 'exit code ' + r.status + ': ' + (r.stderr || r.stdout).trim().split('\n')[0];
  if (lines.length !== 2 || lines[0].indexOf('LEVEL 99 NOT BUILT') !== 0 || !/^SUMMARY runs=0 .*result=NOT_BUILT$/.test(lines[1])) return 'it printed: ' + lines.join(' | ');
  return r.stderr === '' || 'it wrote to stderr: ' + r.stderr.trim().split('\n')[0];
});

fs.rmSync(tmp, { recursive: true, force: true });

console.log('');
console.log('test-level1-pixels: ' + passed + ' passed, ' + failed + ' failed' + (skipped ? ', ' + skipped + ' skipped' : ''));
process.exit(failed === 0 ? 0 : 1);
