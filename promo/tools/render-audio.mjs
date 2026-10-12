#!/usr/bin/env node
// promo/tools/render-audio.mjs
// Renders the sound for the promo shorts with the game's own js/audio.js, in an OfflineAudioContext
// of the headless Chrome that Remotion installs. Writes 44.1 kHz stereo WAV files to public/audio.
//
//   node tools/render-audio.mjs <job> [<job> ...]
//
//   music:<track>:<seconds>[:<as>] public/audio/music_<track>.wav   one of the game's tracks
//                                  (title, level1, boss1, victory, results, gameover, jingle_ready ...).
//                                  With <as>, the file is music_<as>.wav instead
//   sfx:<clip>[:<seconds>]         the sound effects of a captured clip: its logged events are emitted
//                                  at their frame times (30 frames a second) with the music switched off.
//                                  A clip of tools/capture.js (public/clips/<clip>/events.json) gets
//                                  public/clips/<clip>/sfx.wav; a clip of the first two shorts
//                                  (public/events/<clip>.json) gets public/audio/sfx_<clip>.wav
//   sfx:all                        every clip in public/clips
//   one:<sound>[:<seconds>]        public/audio/one_<sound>.wav     one of the game's sound effects on
//                                  its own (stamp, tally_tick, key_ok, ui_select, boss_hit ...), for
//                                  the videos' own graphics. Default 1.5 seconds
//
// Without <seconds>, a clip's length is its number of frames plus one second.
// Music is normalised to a peak of 0.89 and a single sound to 0.7. The sound effects of a clip are
// written at the level the game plays them (SFX_GAIN 1), so that clips keep their loudness relative
// to each other.
//
// The page loads only js/core.js and js/audio.js from the project root. It makes no network request
// outside this computer.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(PROMO, "..");
const PUBLIC = path.join(PROMO, "public");
const SFX_GAIN = 1;

function findChrome() {
  const base = path.join(PROMO, "node_modules", ".remotion", "chrome-headless-shell");
  const stack = [base];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === "chrome-headless-shell" || e.name === "chrome-headless-shell.exe") return p;
    }
  }
  throw new Error("chrome-headless-shell was not found; run `npx remotion browser ensure` in promo/");
}

const countFrames = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".png")).length : 0;

function sfxJob(name, secs) {
  const clipDir = path.join(PUBLIC, "clips", name);
  const isNew = fs.existsSync(path.join(clipDir, "events.json"));
  if (!isNew && !fs.existsSync(path.join(PUBLIC, "events", name + ".json"))) {
    throw new Error("no event log for clip " + name);
  }
  let seconds = Number(secs);
  if (!(seconds > 0)) {
    // A clip of tools/capture.js says how long it is; not every frame of it need be on disk.
    const frames = isNew
      ? JSON.parse(fs.readFileSync(path.join(clipDir, "data.json"), "utf8")).frames
      : countFrames(path.join(PUBLIC, "frames", name));
    if (!(frames > 0)) throw new Error("no frames for clip " + name + "; give the seconds");
    seconds = frames / 30 + 1;
  }
  return isNew
    ? { kind: "sfx", name, seconds, out: `clips/${name}/sfx.wav`, events: `/promo/public/clips/${name}/events.json` }
    : { kind: "sfx", name, seconds, out: `audio/sfx_${name}.wav`, events: `/promo/public/events/${name}.json` };
}

function parseJobs(argv) {
  if (argv.length === 0) {
    console.error("usage: node tools/render-audio.mjs music:<track>:<seconds> | sfx:<clip>[:<seconds>] | sfx:all | one:<sound> ...");
    process.exit(1);
  }
  const jobs = [];
  for (const a of argv) {
    const [kind, name, secs, as] = a.split(":");
    if (kind === "music") {
      if (!name || !(Number(secs) > 0)) throw new Error("music needs a track and seconds: " + a);
      jobs.push({ kind, name, seconds: Number(secs), out: `audio/music_${as || name}.wav` });
    } else if (kind === "one" && name) {
      jobs.push({ kind, name, seconds: Number(secs) > 0 ? Number(secs) : 1.5, out: `audio/one_${name}.wav` });
    } else if (kind === "sfx" && name === "all") {
      const dir = path.join(PUBLIC, "clips");
      for (const clip of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
        if (fs.existsSync(path.join(dir, clip, "events.json"))) jobs.push(sfxJob(clip));
      }
    } else if (kind === "sfx" && name) {
      jobs.push(sfxJob(name, secs));
    } else {
      throw new Error("unknown job " + a);
    }
  }
  return jobs;
}

// Runs in the page. Renders one job and posts the WAV back to this script's server.
const PAGE_SCRIPT = String(async function render(job, sfxGain) {
  const sr = 44100;
  const length = Math.ceil(sr * job.seconds);
  const TG = window.TG;
  TG.Events.clear();
  const off = new OfflineAudioContext(2, length, sr);
  const RealAC = window.AudioContext;
  window.AudioContext = function () {
    return off;
  };
  const src = await (await fetch("/js/audio.js")).text();
  (0, eval)(src);
  TG.Audio.init();
  const unlocked = TG.Audio.unlock();
  window.AudioContext = RealAC;
  // Boss handlers read the phase from the game state.
  const game = { state: { boss: { phase: 1 }, screen: "playing" } };
  TG.Game = game;
  TG.Events.on("boss:phase", (p) => {
    if (p && typeof p.phase === "number") game.state.boss.phase = p.phase;
  });

  let events = [];
  if (job.events) events = await (await fetch(job.events)).json();
  events.sort((a, b) => a.f - b.f);
  if (job.kind === "music") {
    TG.Audio.setEnabled("sfx", false);
    TG.Audio.music(job.name);
  } else {
    TG.Audio.setEnabled("music", false);
  }

  // The game steps 60 times a second and a clip keeps every second step, so events fall on half
  // frames. Stepping the offline context at 60 Hz puts each one at its own time.
  let ei = 0;
  let emitted = 0;
  const emitUpTo = (k) => {
    while (ei < events.length && events[ei].f * 2 <= k + 1e-6) {
      try {
        TG.Events.emit(events[ei].name, events[ei].payload);
        emitted++;
      } catch (e) {
        /* an event handler other than the audio's own is not loaded here */
      }
      ei++;
    }
  };
  const steps = Math.floor(job.seconds * 60);
  for (let k = 1; k < steps; k++) {
    off.suspend(k / 60).then(() => {
      emitUpTo(k);
      TG.Audio.update(1 / 60);
      off.resume();
    });
  }
  emitUpTo(0);
  if (job.kind === "one") TG.Audio.sfx(job.name);
  TG.Audio.update(1 / 60);
  const buf = await off.startRendering();
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let peak = 0;
  for (let i = 0; i < L.length; i++) {
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if (a > peak) peak = a;
  }
  // Music is normalised to a peak of 0.89 and a single sound to 0.7. The sound effects of a clip keep
  // the game's own level; the few samples of a loud moment that pass full scale are clipped, so that
  // one transient does not turn a whole clip down.
  const gain =
    job.kind === "music" ? (peak > 0 ? 0.89 / peak : 1) : job.kind === "one" ? (peak > 0 ? 0.7 / peak : 1) : sfxGain;
  let clipped = 0;
  for (let i = 0; i < L.length; i++) {
    if (Math.abs(L[i] * gain) > 1 || Math.abs(R[i] * gain) > 1) clipped++;
  }
  const bytes = new Uint8Array(44 + L.length * 4);
  const dv = new DataView(bytes.buffer);
  const w = (o, s) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  dv.setUint32(4, 36 + L.length * 4, true);
  w(8, "WAVEfmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 2, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 4, true);
  dv.setUint16(32, 4, true);
  dv.setUint16(34, 16, true);
  w(36, "data");
  dv.setUint32(40, L.length * 4, true);
  for (let i = 0; i < L.length; i++) {
    dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * gain)) * 32767, true);
    dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * gain)) * 32767, true);
  }
  const res = await fetch("/__save?file=" + encodeURIComponent(job.out), { method: "POST", body: bytes });
  return {
    out: await res.text(),
    unlocked,
    seconds: job.seconds,
    peak: Number(peak.toFixed(4)),
    gain: Number(gain.toFixed(3)),
    clipped,
    events: events.length,
    emitted,
  };
});

const HARNESS = `<!doctype html><meta charset="utf-8"><title>render-audio</title>
<script src="/js/core.js"></script>
<script>window.__render = ${PAGE_SCRIPT};</script>`;

const TYPES = { ".js": "text/javascript", ".json": "application/json", ".html": "text/html" };

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "POST" && url.pathname === "/__save") {
      const file = path.normalize(path.join(PUBLIC, url.searchParams.get("file") || ""));
      if (!file.startsWith(PUBLIC + path.sep) || !file.endsWith(".wav")) {
        res.writeHead(400);
        res.end("bad file");
        return;
      }
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.concat(chunks));
        res.end(path.relative(PROMO, file));
      });
      return;
    }
    if (url.pathname === "/__audio.html") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(HARNESS);
      return;
    }
    const file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function startChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "spell-runner-audio-"));
  const child = spawn(
    findChrome(),
    ["--remote-debugging-port=0", "--user-data-dir=" + profile, "--no-first-run", "--mute-audio", "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  return new Promise((resolve, reject) => {
    let text = "";
    const timer = setTimeout(() => reject(new Error("the browser did not start: " + text)), 20000);
    child.stderr.on("data", (d) => {
      text += d;
      const m = text.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve({ child, ws: m[1], profile });
      }
    });
    child.on("exit", () => reject(new Error("the browser exited: " + text)));
  });
}

// A minimal Chrome DevTools Protocol client over Node's own WebSocket.
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve({ send, close: () => ws.close() }));
    ws.addEventListener("error", () => reject(new Error("could not connect to the browser")));
  });
}

async function main() {
  const jobs = parseJobs(process.argv.slice(2));
  const server = await startServer();
  const origin = "http://127.0.0.1:" + server.address().port;
  const chrome = await startChrome();
  let failed = false;
  try {
    const cdp = await connect(chrome.ws);
    for (const job of jobs) {
      // A new page per job: js/audio.js keeps its state in a closure.
      const { targetId } = await cdp.send("Target.createTarget", { url: origin + "/__audio.html" });
      const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
      const evaluate = async (expression) => {
        const r = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
        if (r.exceptionDetails) {
          const d = r.exceptionDetails;
          throw new Error((d.exception && d.exception.description) || d.text);
        }
        return r.result.value;
      };
      for (let i = 0; i < 100; i++) {
        if (await evaluate("typeof window.__render === 'function' && !!(window.TG && window.TG.Events)")) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      try {
        const result = await evaluate(`window.__render(${JSON.stringify(job)}, ${SFX_GAIN})`);
        console.log(JSON.stringify(result));
        if (!result.unlocked) failed = true;
      } catch (e) {
        failed = true;
        console.error(job.out + ": " + e.message);
      }
      await cdp.send("Target.closeTarget", { targetId });
    }
    cdp.close();
  } finally {
    chrome.child.removeAllListeners("exit");
    const gone = new Promise((resolve) => chrome.child.once("exit", resolve));
    chrome.child.kill();
    await Promise.race([gone, new Promise((resolve) => setTimeout(resolve, 3000))]);
    server.close();
    try {
      fs.rmSync(chrome.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* the browser's temporary profile is left for the system to clear */
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
