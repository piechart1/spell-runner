// test/run-all.js
// Runs every test of SPELL RUNNER and reports (WP-H). CONTRACT 12 (WP-H checklist).
//
//   node test/run-all.js                    every test/test-*.js file and test/sim.js
//   node test/run-all.js --quick            the same, with --quick passed to the files that have it
//                                           (test-render.js and test-integration.js run shorter)
//   node test/run-all.js core words         only the files whose name contains one of these words
//   node test/run-all.js --serial           one file at a time (the default runs several at once)
//   node test/run-all.js --verbose          also print the whole output of every file
//
// Each file runs as its own `node <file>` process from the project root. A file passes when it exits
// with code 0. The line for each file gives its counts: ok / FAIL / skip lines for the test-*.js files,
// runs and checks for test/sim.js. For a file that fails, its FAIL lines (or the end of its output)
// are printed below its line. The exit code is 0 only if every file passed.
//
// No npm packages: Node's child_process, fs, os and path only.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const QUICK_FILES = ['test/test-render.js', 'test/test-integration.js'];

function parseArgs(argv) {
  const o = { quick: false, serial: false, verbose: false, filters: [] };
  for (const a of argv) {
    if (a === '--quick') o.quick = true;
    else if (a === '--serial') o.serial = true;
    else if (a === '--verbose') o.verbose = true;
    else if (a === '--help' || a === '-h') {
      console.log('usage: node test/run-all.js [--quick] [--serial] [--verbose] [name ...]');
      process.exit(0);
    } else if (a.indexOf('--') === 0) {
      console.error('run-all: unknown option ' + a);
      process.exit(2);
    } else o.filters.push(a);
  }
  return o;
}

function listFiles(filters) {
  const tests = fs.readdirSync(path.join(ROOT, 'test'))
    .filter((f) => /^test-.*\.js$/.test(f))
    .sort()
    .map((f) => 'test/' + f);
  tests.push('test/sim.js');
  if (filters.length === 0) return tests;
  return tests.filter((f) => filters.some((w) => f.indexOf(w) !== -1));
}

// Counts from a file's output.
function summarise(file, out) {
  const lines = out.split('\n');
  if (file === 'test/sim.js') {
    const runs = lines.filter((l) => /^RUN /.test(l));
    const checks = lines.filter((l) => /^CHECK /.test(l));
    const bad = runs.concat(checks).filter((l) => /result=(FAIL|ERROR)/.test(l));
    const summary = lines.filter((l) => /^SUMMARY /.test(l)).pop() || '';
    return {
      text: runs.length + ' runs, ' + checks.length + ' checks, ' + bad.length + ' failed',
      failLines: bad.concat(summary ? [summary] : [])
    };
  }
  const ok = lines.filter((l) => /^ok - /.test(l)).length;
  const fail = lines.filter((l) => /^FAIL - /.test(l));
  const skip = lines.filter((l) => /^skip - /.test(l)).length;
  const failLines = [];
  lines.forEach(function (l, i) {
    if (!/^FAIL - /.test(l)) return;
    failLines.push(l);
    for (let k = i + 1; k < lines.length && k <= i + 3 && /^\s+/.test(lines[k]); k++) failLines.push(lines[k]);
  });
  return { text: ok + ' ok, ' + fail.length + ' failed, ' + skip + ' skipped', failLines: failLines };
}

function runOne(file, opts) {
  return new Promise(function (resolve) {
    const args = [file];
    if (opts.quick && QUICK_FILES.indexOf(file) !== -1) args.push('--quick');
    const start = Date.now();
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', function (err) {
      resolve({ file: file, code: -1, out: String(err && err.stack ? err.stack : err), seconds: 0 });
    });
    child.on('close', function (code, signal) {
      resolve({ file: file, code: code === null ? (signal || -1) : code, out: out, seconds: (Date.now() - start) / 1000 });
    });
  });
}

function report(r, opts) {
  const pass = r.code === 0;
  const s = summarise(r.file, r.out);
  console.log((pass ? 'PASS ' : 'FAIL ') + r.file.padEnd(28) + ' ' + s.text + ' (' + r.seconds.toFixed(1) + ' s' +
    (pass ? '' : ', exit ' + r.code) + ')');
  if (opts.verbose) {
    console.log(r.out.replace(/^/gm, '    ').replace(/\s+$/, ''));
  } else if (!pass) {
    const detail = s.failLines.length ? s.failLines : r.out.trim().split('\n').slice(-15);
    console.log(detail.map((l) => '    ' + l).join('\n'));
  }
  return pass;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const files = listFiles(opts.filters);
  if (files.length === 0) {
    console.error('run-all: no test file matches ' + opts.filters.join(' '));
    process.exit(2);
  }
  const width = opts.serial ? 1 : Math.max(1, Math.min(files.length, Math.floor((os.cpus() || []).length / 2) || 2));
  console.log('run-all: ' + files.length + ' files' + (opts.quick ? ', quick' : '') + ', ' + width + ' at a time');
  const start = Date.now();
  const results = new Array(files.length);
  let next = 0;
  let printed = 0;
  // Results are printed in file order as soon as every earlier file has finished.
  function flush() {
    while (printed < files.length && results[printed]) {
      results[printed].pass = report(results[printed], opts);
      printed++;
    }
  }
  async function worker() {
    while (next < files.length) {
      const i = next++;
      results[i] = await runOne(files[i], opts);
      flush();
    }
  }
  const workers = [];
  for (let k = 0; k < width; k++) workers.push(worker());
  await Promise.all(workers);
  flush();
  const failedFiles = results.filter((r) => !r.pass).map((r) => r.file);
  const total = ((Date.now() - start) / 1000).toFixed(1);
  console.log('SUMMARY files=' + files.length + ' passed=' + (files.length - failedFiles.length) + ' failed=' + failedFiles.length +
    ' time=' + total + 's result=' + (failedFiles.length ? 'FAIL' : 'PASS'));
  process.exitCode = failedFiles.length ? 1 : 0;
}

main();
