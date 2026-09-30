// js/audio.js
// TG.Audio: sound effects and music for SPELL RUNNER (WP-B).
// CONTRACT 4.8 (API), 7.1 to 7.3 (registries and event behaviour); DESIGN 15 (audio direction).
//
// Nothing here touches AudioContext until TG.Audio.unlock() is called from a key or pointer handler.
// If AudioContext is missing or throws, every function is a no-op and nothing throws.
//
// Layout of this file:
//   1. Constants, note helpers and the registries (SFX, TRACKS)
//   2. Music data: every track as note names and durations, in a small text notation
//   3. The parser for that notation (lazy; problems are reported, never thrown)
//   4. The audio graph: voices, buses, noise buffers
//   5. Sound scheduling primitives with click-free envelopes
//   6. Sound effect recipes (DESIGN 15.2)
//   7. The sequencer (look-ahead scheduling on the audio clock)
//   8. Event handlers (CONTRACT 7.1 to 7.3)
//   9. The public API
//
// Levels. The four music channels carry the gains of DESIGN 15.1 (P1 0.20, P2 0.14, TRI 0.28,
// noise 0.16) and feed a music bus at MUSIC_LEVEL. Sound effects play at 0.30 and key sounds at 0.12.
// The pulse waves are normalised to a peak of 1, so a P50 note at 0.20 has about three times the
// RMS level of a P25 key_ok at 0.12. Without the music bus level the melody would be louder than
// the typing sounds, which DESIGN 15.1 asks to "sit above the music". At MUSIC_LEVEL 0.2 the onset
// of key_ok is louder than the whole level or boss mix with every channel at its loudest note (0.35
// had left it about 3 dB below the level music). MUSIC_LEVEL is the one place to change that
// balance. The master runs through a DynamicsCompressor set as a hard-knee limiter,
// so that several sounds at once cannot clip; test/test-audio.js checks the worst case.
//
// Clicks. Every note has its own gain envelope that starts at 0, ramps up over a few ms and ramps
// back to 0 before the source stops. Nothing that is already sounding is cut by cancelling its
// envelope: stopping, pausing or muting the music fades the channel gains (whose value is known,
// because they are never automated otherwise) and new notes get new channel gains; a sound effect
// voice that is taken over fades its voice gain the same way. The only automation this file
// replaces part-way is the jingle duck, and its curve is tracked here so that its value is known
// without reading AudioParam.value.
//
// Note notation (section 2):
//   C4 D#5 Bb3     a note; the letter, an optional # or b, and the octave (middle C is C4)
//   F4!            the ! marks an accidental: a note outside the track's stated key, allowed on purpose
//   G4:6           the length in 16th steps (default: the current length)
//   /2             sets the current length in 16th steps for the notes that follow (2 = an eighth)
//   -   -:4        a rest
//   ~   ~:4        extends the previous note
//   E5@.5          velocity 0 to 1 (default 1)
//   k s h H x      noise channel: kick, snare, hat, accented hat, kick and snare in one hit
//   |              a bar line; the parser checks that it falls on a bar boundary
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  // ===========================================================================================
  // 1. Constants, note helpers, registries
  // ===========================================================================================

  var LOOKAHEAD = 0.1;          // s, sequencer look-ahead on the audio clock (DESIGN 15.1)
  var MAX_LOOKAHEAD = 0.3;      // s, the look-ahead grows up to this after long frames
  var FRAME_MARGIN = 1.5;       // the look-ahead covers the longest recent frame times this
  var FRAME_DECAY = 0.98;       // per update, how fast a long frame is forgotten
  var CATCH_UP = 1.0;           // s, a sequencer further behind than this skips ahead arithmetically
  var START_DELAY = 0.02;       // s, a new track starts this far ahead of the audio clock
  var SFX_LEAD = 0.003;         // s, a sound effect starts this far ahead of the audio clock
  var ATTACK = 0.003;           // s, envelope attack
  var RELEASE = 0.012;          // s, envelope release
  var CUT_FADE = 0.01;          // s, fade of the channel gains when music notes are cut
  var TAKEOVER_FADE = 0.008;    // s, fade of a sound effect voice that is taken over
  var SFX_VOICES = 3;           // sound effect voices; see PRIORITY for which one is taken over when all are busy
  var DUCK = 0.3;               // loop volume while a jingle plays
  var DUCK_OUT = 0.25;          // s, ramp back to full volume after a jingle
  var URGENT_PERIOD = 0.25;     // s, urgent tick period
  var KEY_OK_TOP = 24;          // key_ok never goes higher than this many semitones above C5 (C7)
  var LEAD_VIBRATO_MIN = 0.15;  // s, lead notes longer than this get vibrato
  var LEAD_VIBRATO_CENTS = 10;
  var NOISE_AMP = 0.9;          // peak of the noise buffers

  // Gains of DESIGN 15.1. Music channels, sound effects, key sounds.
  var GAINS = Object.freeze({ p1: 0.20, p2: 0.14, tri: 0.28, noise: 0.16, sfx: 0.30, key: 0.12 });
  var MUSIC_LEVEL = 0.2;        // music bus; see "Levels" above

  // Master limiter. With a hard knee the static curve is exact: out = T + (in - T) / R above T,
  // plus the compressor's own makeup gain of (1 / curve(1.0)) ^ 0.6.
  var COMPRESSOR = Object.freeze({ threshold: -6, knee: 0, ratio: 12, attack: 0.003, release: 0.15 });

  var SFX_NAMES = [
    'key_ok', 'key_bad', 'lock_on', 'lock_release', 'word_clear',
    'clear_pop', 'clear_twang', 'clear_bonk', 'clear_crunch', 'deflect', 'crate_break',
    'streak', 'jump', 'land', 'slide', 'cue_jump', 'cue_duck', 'ink_drop', 'power_get',
    'shield_up', 'shield_break', 'slow_on', 'slow_off', 'ink_blast', 'one_up', 'hurt', 'fall',
    'rescue', 'checkpoint', 'warn', 'urgent_tick', 'boss_rumble', 'boss_laugh', 'boss_telegraph',
    'boss_throw', 'boss_stomp', 'boss_weak', 'boss_hit', 'boss_stun', 'boss_defeat',
    'ui_move', 'ui_select', 'ui_back', 'pause', 'tally_tick', 'stamp', 'count_tick', 'start'
  ];

  var TRACK_NAMES = ['title', 'level1', 'boss1', 'victory', 'results', 'gameover', 'jingle_ready', 'jingle_checkpoint'];

  var SEMITONE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  var SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10]
  };
  var PENTATONIC = {
    major: [0, 2, 4, 7, 9],
    minor: [0, 3, 5, 7, 10]
  };
  var C5 = 523.2511306011972;

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // 'F#4' -> 66. Returns null for a bad name.
  function noteToMidi(name) {
    var m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(String(name));
    if (!m) return null;
    var pc = SEMITONE[m[1].toLowerCase()];
    if (m[2] === '#') pc += 1;
    if (m[2] === 'b') pc -= 1;
    return (parseInt(m[3], 10) + 1) * 12 + pc;
  }

  function f(name) {
    return midiToFreq(noteToMidi(name));
  }

  // Pitch classes of a key, e.g. ('G', 'major') -> [7, 9, 11, 0, 2, 4, 6]
  function keyPitchClasses(rootName, mode) {
    var m = /^([A-Ga-g])([#b]?)$/.exec(String(rootName));
    if (!m) return null;
    var pc = SEMITONE[m[1].toLowerCase()];
    if (m[2] === '#') pc += 1;
    if (m[2] === 'b') pc -= 1;
    var scale = SCALES[mode] || SCALES.major;
    var out = [];
    for (var i = 0; i < scale.length; i++) out.push(((pc + scale[i]) % 12 + 12) % 12);
    return out;
  }

  // ===========================================================================================
  // 2. Music data (DESIGN 15.3)
  // ===========================================================================================

  function rep(text, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(text);
    return out;
  }

  function bars(list) {
    return list.join(' | ') + ' |';
  }

  // Four chord notes -> one bar of 16 sixteenths: up, down, up, down.
  function arp(notes) {
    var n = notes.split(' ');
    var bar = [n[0], n[1], n[2], n[3], n[2], n[1], n[0], n[1]];
    return bar.join(' ') + ' ' + bar.join(' ');
  }

  // Root and octave (or fifth) bounce in eighths, e.g. bounce('G2', 'G3')
  function bounce(low, high) {
    return [low, high, low, high, low, high, low, high].join(' ');
  }

  // --- level1: "Quill Meadows", G major, 150 BPM, 32 bars AABA -------------------------------
  // The A part is an eight-bar tune over G, Em, C, D that ends on a held G; the B part climbs
  // higher over C, D, Bm, Em, Am, D, G, D and walks back down into the last A.
  var L_A = [
    'G4 A4 B4:4 D5 B4 G4:4',
    'E5:4 D5 B4 A4:4 B4:4',
    'C5 D5 E5:4 G5 E5 D5:4',
    'D5:6 B4:2 A4:4 -:4',
    'G4 A4 B4:4 D5 B4 G4:4',
    'E5:4 D5 B4 A4:4 B4:4',
    'C5 D5 E5:4 G5 A5 B5:4',
    'A5:4 F#5:4 G5:6 -:2'
  ];
  var L_A_HELD = L_A.slice(0, 7).concat(['A5:4 F#5:4 G5:8']);
  var L_B = [
    'E5 G5 C6:4 B5 G5 E5:4',
    'D5 F#5 A5:4 D6:4 A5:4',
    'B5:4 F#5 D5 B4:4 D5:4',
    'E5:6 G5:2 B5:8',
    'A5 G5 E5:4 C5 D5 E5:4',
    'F#5:4 A5:4 D6:4 C6:4',
    'B5:4 G5 D5 B4:4 G4:4',
    'A4:4 B4:4 C5:4 D5:4'
  ];
  // Pulse 2: harmony a third or a sixth below, with answering fills in bars 4 and 8.
  var L_PA = [
    'E4 F#4 G4:4 B4 G4 E4:4',
    'C5:4 B4 G4 F#4:4 G4:4',
    'A4 B4 C5:4 E5 C5 B4:4',
    'B4:6 G4:2 F#4:4 A4:1 B4:1 C5:1 D5:1',
    'E4 F#4 G4:4 B4 G4 E4:4',
    'C5:4 B4 G4 F#4:4 G4:4',
    'A4 B4 C5:4 E5 F#5 G5:4',
    'F#5:4 D5:4 B4:6 D5:1 F#5:1'
  ];
  var L_PA_HELD = L_PA.slice(0, 7).concat(['F#5:4 D5:4 B4:8']);
  var L_PB = [
    'C5 E5 A5:4 G5 E5 C5:4',
    'B4 D5 F#5:4 A5:4 F#5:4',
    'G5:4 D5 B4 G4:4 B4:4',
    'C5:6 E5:2 G5:8',
    'C5 B4 G4:4 E4 F#4 G4:4',
    'D5:4 F#5:4 A5:4 A5:4',
    'G5:4 D5 B4 G4:4 D4:4',
    'F#4:4 G4:4 A4:4 B4:4'
  ];
  var bG = bounce('G2', 'G3'), bE = bounce('E2', 'E3'), bC = bounce('C2', 'C3'), bD = bounce('D2', 'D3');
  var bB = bounce('B2', 'B3'), bA = bounce('A2', 'A3');
  var bDwalk = 'D2 D3 D2 D3 D2 E2 F#2 F#3';
  var L_TA = [bG, bE, bC, bD, bG, bE, bC, bDwalk];
  var L_TB = [bC, bD, bB, bE, bA, bD, bG, bDwalk];
  // Kick on 1, the "and" of 2 and 3; snare on 2 and 4; 16th hats with accents.
  var L_N = 'k h H h s h k h k h H h s h H h';
  var L_NF = 'k h H h s h k h k h s h s@.7 s@.8 s@.9 s';
  var L_NA = rep(L_N, 7).concat([L_NF]);

  // --- boss1: "The Baron's Dig", E minor with F natural, 168 BPM (184 in phase 3), 16 bars ----
  // A 16th riff over E, F, G, F; the F natural (marked !) gives the Phrygian edge.
  var R_A = 'E4 E5 B4 E5 F4! F5! C5 F5! G4 G5 D5 G5 F4! F5! C5 F5!';
  var R_B = 'E4 E5 B4 E5 F4! F5! C5 F5! G4 G5 D5 G5 B4 B5 F#5 B5';
  var R_C = 'E5 G5 E5 B5 F5! A5 F5! C6 G5 B5 G5 D6 F5! A5 F5! C6';
  var R_D = 'E5 G5 E5 B5 F5! A5 F5! C6 G5 B5 G5 D6 B5 D6 B5 F#6';
  var B_OST = 'E3 E4 E3 E4 E3 E4 E3 E4';
  var B_TA = 'E2 E3 F2! F3! G2 G3 F2! F3!';
  var B_TB = 'E2 E3 F2! F3! G2 G3 B2 B3';
  // Kick on every beat, with the snare on 2 and 4 (x = kick and snare in one hit); roll every 4th bar.
  var B_N = 'k h h h x h h h k h h h x h h h';
  var B_NR = 'k h h h x h h h k s@.5 s@.6 s@.7 s@.8 s@.9 s s';

  // --- title: "Once Upon a Keystroke", C major, 132 BPM, 16 bars ------------------------------
  // Chords: C Am F G twice, then F G Em Am Dm G C C. The lead is played staccato with an echo.
  // Bars 1 and 5 share the opening motif; bars 9 and 10 repeat a figure a step higher.
  var T_P1 = [
    'C5:4 E5:2 G5:2 C6:4 G5:4',
    'A5:6 G5:2 E5:8',
    'F5:4 A5:2 F5:2 C5:4 A4:4',
    'D5:2 E5:2 F5:2 E5:2 D5:8',
    'C5:4 E5:2 G5:2 C6:4 E6:4',
    'C6:6 B5:2 A5:8',
    'F5:4 A5:2 C6:2 A5:4 F5:4',
    'G5:2 A5:2 B5:2 A5:2 G5:8',
    'A5:4 C6:2 A5:2 F5:4 A5:4',
    'B5:4 D6:2 B5:2 G5:4 D5:4',
    'E5:2 G5:2 B5:4 G5:2 E5:2 B5:4',
    'C6:6 B5:2 A5:8',
    'F5:4 A5:2 F5:2 D5:4 A4:4',
    'B4:2 D5:2 G5:2 F5:2 D5:4 B4:4',
    'E5:4 G5:2 C6:2 E6:4 D6:4',
    'C6:6 G5:2 C5:8'
  ];
  var aC = arp('C4 E4 G4 C5'), aAm = arp('A3 C4 E4 A4'), aF = arp('F3 A3 C4 F4'), aG = arp('G3 B3 D4 G4');
  var aEm = arp('E4 G4 B4 E5'), aDm = arp('D4 F4 A4 D5');
  var T_P2 = [aC, aAm, aF, aG, aC, aAm, aF, aG, aF, aG, aEm, aAm, aDm, aG, aC, aC];
  var tC = bounce('C2', 'G2'), tAm = bounce('A2', 'E3'), tF = bounce('F2', 'C3'), tG = bounce('G2', 'D3');
  var tEm = bounce('E2', 'B2'), tDm = bounce('D2', 'A2');
  var T_TRI = [tC, tAm, tF, tG, tC, tAm, tF, tG, tF, tG, tEm, tAm, tDm, tG, tC, tC];
  var T_N = 'k h s h k h s h';

  var MUSIC = {
    title: {
      name: 'Once Upon a Keystroke', bpm: 132, key: 'C', mode: 'major', beats: 4, bars: 16, loop: true,
      p1: { wave: 'p25', echo: true, gate: 0.8, text: '/2 ' + bars(T_P1) },
      p2: { wave: 'p12', gate: 0.9, text: '/1 ' + bars(T_P2) },
      tri: { gate: 0.85, text: '/2 ' + bars(T_TRI) },
      noise: { text: '/2 ' + bars(rep(T_N, 16)) }
    },
    level1: {
      name: 'Quill Meadows', bpm: 150, key: 'G', mode: 'major', beats: 4, bars: 32, loop: true,
      p1: { wave: 'p50', vibrato: true, gate: 0.88, text: '/2 ' + bars(L_A.concat(L_A_HELD, L_B, L_A_HELD)) },
      p2: { wave: 'p25', gate: 0.88, text: '/2 ' + bars(L_PA.concat(L_PA_HELD, L_PB, L_PA_HELD)) },
      tri: { gate: 0.8, text: '/2 ' + bars(L_TA.concat(L_TA, L_TB, L_TA)) },
      noise: { text: '/1 ' + bars(L_NA.concat(L_NA, L_NA, L_NA)) }
    },
    boss1: {
      name: "The Baron's Dig", bpm: 168, key: 'E', mode: 'minor', beats: 4, bars: 16, loop: true,
      p1: { wave: 'p12', gate: 0.7, text: '/1 ' + bars([R_A, R_A, R_A, R_B, R_A, R_A, R_A, R_B, R_C, R_C, R_C, R_D, R_C, R_C, R_A, R_B]) },
      p2: { wave: 'p50', gate: 0.6, vel: 0.8, text: '/2 ' + bars(rep(B_OST, 16)) },
      tri: { gate: 0.85, text: '/2 ' + bars(rep([B_TA, B_TA, B_TA, B_TB].join(' | '), 4)) },
      noise: { text: '/1 ' + bars(rep([B_N, B_N, B_N, B_NR].join(' | '), 4)) }
    },
    victory: {
      name: 'Words Restored', bpm: 140, key: 'C', mode: 'major', beats: 4, bars: 6, loop: false,
      p1: { wave: 'p25', gate: 0.9, text: bars([
        'C5:3 C5:1 C5:3 C5:1 E5:4 G5:4',
        'C6:8 -:2 G5:2 A5:2 B5:2',
        'C6:3 C6:1 C6:3 C6:1 E6:4 D6:4',
        'B5:4 A5:4 G5:4 F5:2 G5:2',
        'E5:2 F5:2 G5:2 A5:2 B5:2 C6:2 D6:2 E6:2',
        'C6:12 -:4'
      ]) },
      p2: { wave: 'p25', gate: 0.9, vel: 0.8, text: bars([
        'A4:3 A4:1 A4:3 A4:1 C5:4 E5:4',
        'A5:8 -:2 E5:2 F5:2 G5:2',
        'A5:3 A5:1 A5:3 A5:1 C6:4 B5:4',
        'G5:4 F5:4 E5:4 D5:2 E5:2',
        'C5:2 D5:2 E5:2 F5:2 G5:2 A5:2 B5:2 C6:2',
        'E5:12 -:4'
      ]) },
      tri: { gate: 0.95, text: bars(['C2:16', 'C2:16', 'A2:16', 'G2:16', 'G2:16', 'C2:16']) },
      noise: { text: bars([
        '/4 k s k s', 'k s k s', 'k s k s', 'k s k s',
        '/1 s@.3 s@.35 s@.4 s@.45 s@.5 s@.55 s@.6 s@.65 s@.7 s@.75 s@.8 s@.85 s@.9 s@.95 s s',
        's:16'
      ]) }
    },
    results: {
      name: 'Results', bpm: 100, key: 'F', mode: 'major', beats: 4, bars: 8, loop: true,
      p1: { wave: 'p25', vibrato: true, gate: 0.9, text: bars([
        'A4:4 C5:4 F5:6 E5:2',
        'D5:4 C5:4 Bb4:6 C5:2',
        'E5:4 G5:4 C5:6 D5:2',
        'F5:8 -:8',
        'D5:4 F5:4 A5:6 G5:2',
        'F5:4 D5:4 Bb4:6 C5:2',
        'E5:4 D5:4 C5:4 Bb4:2 C5:2',
        'F5:12 -:4'
      ]) },
      // Sustained thirds of the chords F, Bb, C, F, Dm, Bb, C, F.
      p2: { wave: 'p12', gate: 0.97, text: bars(['A4:16', 'D5:16', 'E4:16', 'A4:16', 'F4:16', 'D4:16', 'E4:16', 'A4:16']) },
      tri: { gate: 0.95, text: bars(['F2:8 F2:8', 'Bb2:8 Bb2:8', 'C3:8 C3:8', 'F2:8 F2:8', 'D2:8 D2:8', 'Bb2:8 Bb2:8', 'C3:8 C3:8', 'F2:8 F2:8']) },
      noise: { text: '/2 ' + bars(rep('h H h h h H h h', 8)) }
    },
    // A descending phrase over A, G, F, E that stops on an E7 chord (E2, G#4, D5), a question
    // rather than an ending: the player is being asked to try again.
    gameover: {
      name: 'Try Again', bpm: 80, key: 'A', mode: 'minor', beats: 2, bars: 4, loop: false,
      p1: { wave: 'p50', gate: 0.9, text: bars(['E5:2 C5:2 A4:4', 'D5:2 B4:2 G4:4', 'C5:2 A4:2 F4:4', 'B4:2 G#4!:2 D5:4']) },
      p2: { wave: 'p12', gate: 0.97, text: bars(['C5:8', 'B4:8', 'A4:8', 'G#4!:8']) },
      tri: { gate: 0.95, text: bars(['A2:8', 'G2:8', 'F2:8', 'E2:8']) },
      noise: { text: bars(['-:8', '-:8', '-:8', '-:8']) }
    },
    jingle_ready: {
      name: 'Ready', bpm: 150, key: 'G', mode: 'major', beats: 4, bars: 2, loop: false,
      p1: { wave: 'p50', gate: 0.8, text: '/2 ' + bars(['G5 G5 G5 - B5 B5 B5 -', 'D6 D6 -:4 G6:8']) },
      p2: { wave: 'p25', gate: 0.8, text: '/2 ' + bars(['B4 B4 B4 - D5 D5 D5 -', 'G5 G5 -:4 B5:8']) },
      tri: { gate: 0.9, text: '/8 ' + bars(['G2 G2', 'D2 G2']) },
      noise: { text: '/4 ' + bars(['k s k s', 'k s k:8']) }
    },
    jingle_checkpoint: {
      name: 'Checkpoint', bpm: 200, key: 'C', mode: 'major', beats: 2, bars: 1, loop: false,
      p1: { wave: 'p25', gate: 0.9, text: '/1 ' + bars(['C5 E5 G5 C6:5']) },
      p2: { wave: 'p12', gate: 0.9, text: '/1 ' + bars(['E5 G5 C6 E6:5']) },
      tri: { gate: 0.9, text: bars(['C3:4 G3:4']) },
      noise: { text: '/1 ' + bars(['k h h s:5']) }
    }
  };

  var CHANNELS = ['p1', 'p2', 'tri', 'noise'];

  // ===========================================================================================
  // 3. Parser
  // ===========================================================================================

  var NOTE_RE = /^([A-Ga-g])([#b]?)(\d)(!?)(?::(\d+))?(?:@(\d*\.?\d+))?$/;
  var DRUM_RE = /^([ksHhx])(?::(\d+))?(?:@(\d*\.?\d+))?$/;
  var REST_RE = /^-(?::(\d+))?$/;
  var TIE_RE = /^~(?::(\d+))?$/;
  var LEN_RE = /^\/(\d+)$/;

  // Parses one channel text into { steps, events }. Problems are appended to `problems`.
  function parseChannel(text, isNoise, stepsPerBar, keyPcs, label, problems) {
    var tokens = String(text || '').split(/\s+/).filter(function (t) { return t.length > 0; });
    var pos = 0;
    var curLen = 2;
    var events = [];
    var last = null;
    var bar = 1;
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      var m;
      if (tok === '|') {
        if (pos % stepsPerBar !== 0) {
          problems.push(label + ': bar line ' + bar + ' falls at step ' + pos + ', not on a bar boundary');
        }
        bar++;
        continue;
      }
      if ((m = LEN_RE.exec(tok))) {
        curLen = parseInt(m[1], 10) || curLen;
        continue;
      }
      if ((m = REST_RE.exec(tok))) {
        pos += m[1] ? parseInt(m[1], 10) : curLen;
        last = null;
        continue;
      }
      if ((m = TIE_RE.exec(tok))) {
        var extra = m[1] ? parseInt(m[1], 10) : curLen;
        if (last) last.len += extra;
        pos += extra;
        continue;
      }
      if (!isNoise && (m = NOTE_RE.exec(tok))) {
        var midi = noteToMidi(m[1] + m[2] + m[3]);
        var len = m[5] ? parseInt(m[5], 10) : curLen;
        var accidental = m[4] === '!';
        if (keyPcs && !accidental && keyPcs.indexOf(((midi % 12) + 12) % 12) === -1) {
          problems.push(label + ': ' + tok + ' at step ' + pos + ' is outside the key and not marked with !');
        }
        last = { step: pos, len: len, midi: midi, vel: m[6] ? parseFloat(m[6]) : 1, accidental: accidental };
        events.push(last);
        pos += len;
        continue;
      }
      if (isNoise && (m = DRUM_RE.exec(tok))) {
        var dlen = m[2] ? parseInt(m[2], 10) : curLen;
        last = { step: pos, len: dlen, drum: m[1], vel: m[3] ? parseFloat(m[3]) : 1 };
        events.push(last);
        pos += dlen;
        continue;
      }
      problems.push(label + ': cannot read token "' + tok + '" at step ' + pos);
    }
    return { steps: pos, events: events };
  }

  // Expands the title lead: each note of 2 steps or more becomes a 1-step note and a quieter echo.
  function applyEcho(events) {
    var out = [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.len >= 2) {
        out.push({ step: e.step, len: 1, midi: e.midi, vel: e.vel, accidental: e.accidental });
        out.push({ step: e.step + 1, len: 1, midi: e.midi, vel: e.vel * 0.4, accidental: e.accidental, echo: true });
      } else {
        out.push(e);
      }
    }
    return out;
  }

  var parsedTracks = {};

  // Parsed form of a track:
  // { name, bpm, key, mode, loop, beats, bars, stepsPerBar, totalSteps, problems: [],
  //   channels: { p1: { wave, gate, vel, vibrato, steps, events, byStep }, ... } }
  function parseTrack(name) {
    if (parsedTracks[name]) return parsedTracks[name];
    var raw = MUSIC[name];
    if (!raw) return null;
    var problems = [];
    var stepsPerBar = raw.beats * 4;
    var totalSteps = stepsPerBar * raw.bars;
    var keyPcs = keyPitchClasses(raw.key, raw.mode);
    var channels = {};
    for (var c = 0; c < CHANNELS.length; c++) {
      var ch = CHANNELS[c];
      var def = raw[ch] || { text: '' };
      var label = name + '.' + ch;
      var parsed = parseChannel(def.text, ch === 'noise', stepsPerBar, keyPcs, label, problems);
      var events = def.echo ? applyEcho(parsed.events) : parsed.events;
      if (parsed.steps !== totalSteps) {
        problems.push(label + ': ' + parsed.steps + ' steps, the track has ' + totalSteps);
      }
      var byStep = {};
      for (var i = 0; i < events.length; i++) {
        var s = events[i].step;
        if (s >= totalSteps) continue;
        (byStep[s] = byStep[s] || []).push(events[i]);
      }
      channels[ch] = {
        wave: def.wave || (ch === 'tri' ? 'tri' : ch === 'noise' ? 'noise' : 'p25'),
        gate: def.gate === undefined ? 0.9 : def.gate,
        vel: def.vel === undefined ? 1 : def.vel,
        vibrato: !!def.vibrato,
        steps: parsed.steps,
        events: events,
        byStep: byStep
      };
    }
    var track = {
      name: name, title: raw.name, bpm: raw.bpm, key: raw.key, mode: raw.mode, loop: !!raw.loop,
      beats: raw.beats, bars: raw.bars, stepsPerBar: stepsPerBar, totalSteps: totalSteps,
      problems: problems, channels: channels
    };
    parsedTracks[name] = track;
    return track;
  }

  // ===========================================================================================
  // 4. Audio graph
  // ===========================================================================================

  var ctx = null;             // the AudioContext, created by unlock()
  var unavailable = false;    // AudioContext is missing or threw
  var graph = null;           // nodes built by buildGraph()
  var warned = {};

  function warnOnce(key, message) {
    if (warned[key]) return;
    warned[key] = true;
    if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
      console.warn('TG.Audio: ' + message);
    }
  }

  // Pulse wave with duty `duty` (0..1) from 32 harmonics: a_n = 2 sin(pi n d) / (pi n).
  function makePulseWave(duty) {
    var n = 33;
    var real = new Float32Array(n);
    var imag = new Float32Array(n);
    for (var k = 1; k < n; k++) {
      real[k] = 2 * Math.sin(Math.PI * k * duty) / (Math.PI * k);
      imag[k] = 0;
    }
    return ctx.createPeriodicWave(real, imag);
  }

  // NES-style LFSR noise. Long mode taps bits 0 and 1 (period 32767); short mode taps bits 0 and 6
  // (period 93). One LFSR step per sample; pitch is set with playbackRate.
  function makeNoiseBuffer(shortMode) {
    var reg = 1;
    var seed = reg;
    var period = 0;
    var maxPeriod = 32767;
    do {
      var feedback = (reg & 1) ^ ((reg >> (shortMode ? 6 : 1)) & 1);
      reg = (reg >> 1) | (feedback << 14);
      period++;
    } while (reg !== seed && period < maxPeriod);
    var rate = ctx.sampleRate || 44100;
    var buffer = ctx.createBuffer(1, period, rate);
    var data = buffer.getChannelData(0);
    reg = seed;
    for (var i = 0; i < period; i++) {
      data[i] = (reg & 1) ? NOISE_AMP : -NOISE_AMP;
      var fb = (reg & 1) ^ ((reg >> (shortMode ? 6 : 1)) & 1);
      reg = (reg >> 1) | (fb << 14);
    }
    return buffer;
  }

  function makeGain(value, dest) {
    var g = ctx.createGain();
    g.gain.value = value;
    if (dest) g.connect(dest);
    return g;
  }

  function setParam(param, value) {
    if (!param) return;
    if (typeof param.setValueAtTime === 'function') param.setValueAtTime(value, ctx.currentTime);
    else param.value = value;
  }

  // A gain automation that this file owns completely, so that its value at any time is known.
  // Used for the jingle duck, the one gain that is re-scheduled part-way through a ramp.
  function makeCurve(param, value) {
    var c = { param: param, points: [[0, value]] };
    c.valueAt = function (t) {
      var p = c.points;
      if (t <= p[0][0]) return p[0][1];
      for (var i = 1; i < p.length; i++) {
        if (t <= p[i][0]) {
          var a = p[i - 1];
          var b = p[i];
          var span = b[0] - a[0];
          return span > 0 ? a[1] + (b[1] - a[1]) * (t - a[0]) / span : b[1];
        }
      }
      return p[p.length - 1][1];
    };
    // Holds the value the curve has at t, then ramps linearly through `ramps` ([[time, value], ...]).
    c.rampFrom = function (t, ramps) {
      var v = c.valueAt(t);
      if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(t);
      else param.cancelScheduledValues(t);
      param.setValueAtTime(v, t);
      var pts = [[t, v]];
      for (var i = 0; i < ramps.length; i++) {
        param.linearRampToValueAtTime(ramps[i][1], ramps[i][0]);
        pts.push([ramps[i][0], ramps[i][1]]);
      }
      c.points = pts;
    };
    return c;
  }

  function buildGraph() {
    var master = makeGain(1, null);
    var comp = null;
    if (typeof ctx.createDynamicsCompressor === 'function') {
      comp = ctx.createDynamicsCompressor();
      setParam(comp.threshold, COMPRESSOR.threshold);
      setParam(comp.knee, COMPRESSOR.knee);
      setParam(comp.ratio, COMPRESSOR.ratio);
      setParam(comp.attack, COMPRESSOR.attack);
      setParam(comp.release, COMPRESSOR.release);
      master.connect(comp);
      comp.connect(ctx.destination);
    } else {
      master.connect(ctx.destination);
    }
    var musicBus = makeGain(MUSIC_LEVEL, master);
    var duck = makeGain(1, musicBus);
    var sfxBus = makeGain(1, master);

    // One 6 Hz vibrato LFO shared by the long lead notes; each note is connected while it sounds.
    var vibLfo = ctx.createOscillator();
    vibLfo.type = 'sine';
    setParam(vibLfo.frequency, 6);
    var vibDepth = makeGain(LEAD_VIBRATO_CENTS, null);   // cents, into each note's detune
    vibLfo.connect(vibDepth);
    vibLfo.start(ctx.currentTime);

    graph = {
      master: master, comp: comp, musicBus: musicBus, duck: duck, duckCurve: makeCurve(duck.gain, 1), sfxBus: sfxBus,
      waves: { p12: makePulseWave(0.125), p25: makePulseWave(0.25), p50: makePulseWave(0.5) },
      noise: { long: makeNoiseBuffer(false), short: makeNoiseBuffer(true) },
      vibLfo: vibLfo, vibDepth: vibDepth
    };
  }

  // ===========================================================================================
  // 5. Scheduling primitives
  // ===========================================================================================
  // Every note envelope starts at 0, ramps up over a short attack, and ramps down to 0 over a
  // short release. Envelopes are never cancelled once scheduled. Exponential ramps never target 0.

  function anchor(param, value, t) {
    param.setValueAtTime(value, t);
  }

  // Fades a gain that holds the constant value `from` (never automated before) to 0.
  function fadeOut(param, from, t, seconds) {
    param.setValueAtTime(from, t);
    param.linearRampToValueAtTime(0, t + seconds);
  }

  function stopSource(source, t) {
    try { source.stop(t); } catch (e) { /* already stopped */ }
  }

  // Nodes that have faded out and are disconnected once the fade is over.
  var retired = [];

  function retire(node, at) {
    retired.push({ node: node, at: at });
  }

  function disconnectRetired(now) {
    if (!retired.length) return;
    var keep = [];
    for (var i = 0; i < retired.length; i++) {
      if (retired[i].at <= now) {
        try { retired[i].node.disconnect(); } catch (e) { /* ignore */ }
      } else {
        keep.push(retired[i]);
      }
    }
    retired = keep;
  }

  // One envelope segment starting at t (the gain is 0 there).
  // shape: 'decay' (linear to 0), 'hold' (sustain then release), 'exp' (exponential decay then release)
  function envelope(param, t, dur, peak, shape) {
    var a = Math.min(ATTACK, dur * 0.25);
    var r = Math.min(RELEASE, dur * 0.3);
    anchor(param, 0, t);
    param.linearRampToValueAtTime(peak, t + a);
    if (shape === 'decay') {
      param.linearRampToValueAtTime(0, t + dur);
    } else if (shape === 'exp') {
      param.exponentialRampToValueAtTime(Math.max(peak * 0.02, 1e-4), t + dur - r);
      param.linearRampToValueAtTime(0, t + dur);
    } else {
      anchor(param, peak, t + dur - r);
      param.linearRampToValueAtTime(0, t + dur);
    }
  }

  // Sustained note with tremolo written as gain ramps: peak <-> peak * (1 - depth) at `hz`.
  function tremoloEnvelope(param, t, dur, peak, hz, depth) {
    var a = Math.min(ATTACK, dur * 0.25);
    var r = Math.min(RELEASE, dur * 0.3);
    var half = 0.5 / hz;
    anchor(param, 0, t);
    param.linearRampToValueAtTime(peak, t + a);
    var time = t + a;
    var low = peak * (1 - depth);
    var end = t + dur - r;
    var high = false;
    while (time + half < end) {
      time += half;
      param.linearRampToValueAtTime(high ? peak : low, time);
      high = !high;
    }
    param.linearRampToValueAtTime(peak, end);
    param.linearRampToValueAtTime(0, t + dur);
  }

  // Frequency automation for one note or sweep.
  function setFrequency(param, spec, t, dur) {
    if (spec.warble) {
      var w = spec.warble;
      anchor(param, w.from, t);
      var half = 0.5 / w.hz;
      var time = t;
      var up = true;
      while (time + half <= t + dur + 1e-9) {
        time += half;
        param.linearRampToValueAtTime(up ? w.to : w.from, time);
        up = !up;
      }
      return;
    }
    if (spec.from !== undefined && spec.to !== undefined) {
      anchor(param, spec.from, t);
      if (spec.curve === 'lin') param.linearRampToValueAtTime(spec.to, t + dur);
      else param.exponentialRampToValueAtTime(spec.to, t + dur);
      return;
    }
    anchor(param, spec.freq, t);
  }

  // A tone: wave 'p12' | 'p25' | 'p50' | 'tri'. Returns { end, gain, source, cleanup }.
  // spec: { at, dur, freq | from, to, curve | seq: [[freq, dur, gap, shape, vel], ...] | warble: { hz, from, to },
  //         vel, shape, vibrato: { hz, cents }, tremolo: { hz, depth }, leadVibrato }
  function scheduleTone(dest, wave, spec, t0) {
    var start = t0 + (spec.at || 0);
    var osc = ctx.createOscillator();
    if (wave === 'tri') osc.type = 'triangle';
    else if (graph.waves[wave] && typeof osc.setPeriodicWave === 'function') osc.setPeriodicWave(graph.waves[wave]);
    else osc.type = 'square';
    var g = ctx.createGain();
    g.gain.value = 0;
    var peak = spec.vel === undefined ? 1 : spec.vel;
    var shape = spec.shape || 'hold';
    var end;
    var cleanup = null;
    if (spec.seq) {
      var t = start;
      for (var i = 0; i < spec.seq.length; i++) {
        var item = spec.seq[i];
        var d = item[1];
        anchor(osc.frequency, item[0], t);
        envelope(g.gain, t, d, item[4] === undefined ? peak : peak * item[4], item[3] || shape);
        t += d + (item[2] || 0);
      }
      end = t;
    } else {
      var dur = spec.dur;
      setFrequency(osc.frequency, spec, start, dur);
      if (spec.tremolo) tremoloEnvelope(g.gain, start, dur, peak, spec.tremolo.hz, spec.tremolo.depth);
      else envelope(g.gain, start, dur, peak, shape);
      end = start + dur;
    }
    if (spec.vibrato && osc.detune) {
      var lfo = ctx.createOscillator();
      lfo.type = 'sine';
      anchor(lfo.frequency, spec.vibrato.hz, start);
      var depth = makeGain(spec.vibrato.cents, null);
      lfo.connect(depth);
      depth.connect(osc.detune);
      lfo.start(start);
      lfo.stop(end + 0.02);
    } else if (spec.leadVibrato && osc.detune) {
      var vib = graph.vibDepth;
      vib.connect(osc.detune);
      cleanup = function () {
        try { vib.disconnect(osc.detune); } catch (e) { /* ignore */ }
      };
    }
    osc.connect(g);
    g.connect(dest);
    osc.start(start);
    osc.stop(end + 0.02);
    return { end: end, gain: g, source: osc, cleanup: cleanup };
  }

  // Noise: kind 'long' | 'short'.
  // spec: { at, dur, rate | rateFrom, rateTo, curve | rates: [[offset, rate], ...] | seq: [[rate, dur, gap]], vel, shape }
  function scheduleNoise(dest, kind, spec, t0) {
    var start = t0 + (spec.at || 0);
    var src = ctx.createBufferSource();
    src.buffer = graph.noise[kind] || graph.noise.long;
    src.loop = true;
    var g = ctx.createGain();
    g.gain.value = 0;
    var peak = spec.vel === undefined ? 1 : spec.vel;
    var shape = spec.shape || 'decay';
    var end;
    if (spec.seq) {
      var t = start;
      for (var i = 0; i < spec.seq.length; i++) {
        var item = spec.seq[i];
        anchor(src.playbackRate, item[0], t);
        envelope(g.gain, t, item[1], peak, shape);
        t += item[1] + (item[2] || 0);
      }
      end = t;
    } else {
      var dur = spec.dur;
      if (spec.rates) {
        for (var r = 0; r < spec.rates.length; r++) anchor(src.playbackRate, spec.rates[r][1], start + spec.rates[r][0]);
      } else if (spec.rateFrom !== undefined && spec.rateTo !== undefined) {
        anchor(src.playbackRate, spec.rateFrom, start);
        if (spec.curve === 'lin') src.playbackRate.linearRampToValueAtTime(spec.rateTo, start + dur);
        else src.playbackRate.exponentialRampToValueAtTime(spec.rateTo, start + dur);
      } else {
        anchor(src.playbackRate, spec.rate === undefined ? 1 : spec.rate, start);
      }
      envelope(g.gain, start, dur, peak, shape);
      end = start + dur;
    }
    src.connect(g);
    g.connect(dest);
    src.start(start);
    src.stop(end + 0.02);
    return { end: end, gain: g, source: src, cleanup: null };
  }

  // ===========================================================================================
  // 6. Sound effect recipes (DESIGN 15.2)
  // ===========================================================================================

  var N = {
    C4: f('C4'), C5: f('C5'), E5: f('E5'), G5: f('G5'), A5: f('A5'), B5: f('B5'),
    C6: f('C6'), D6: f('D6'), E6: f('E6'), G6: f('G6'), A6: f('A6'), B6: f('B6'),
    C7: f('C7'), D7: f('D7'), E7: f('E7'), G7: f('G7'),
    A4: f('A4'), G4: f('G4'), F4: f('F4'), E4: f('E4'), D4: f('D4'), D5: f('D5')
  };

  var keyOk = { root: 0, mode: 'major' };

  // key_ok climbs one step of the pentatonic scale per letter from the root above C5, and stops
  // climbing when the next step would go above C7, so long boss words never reach a piercing pitch.
  function keyOkSemis(step) {
    var scale = PENTATONIC[keyOk.mode] || PENTATONIC.major;
    var n = Math.max(0, Math.min(20, Math.floor(Number(step) || 0)));
    var semis = keyOk.root + scale[n % scale.length] + 12 * Math.floor(n / scale.length);
    while (n > 0 && semis > KEY_OK_TOP) {
      n--;
      semis = keyOk.root + scale[n % scale.length] + 12 * Math.floor(n / scale.length);
    }
    return semis;
  }

  function keyOkFreq(step) {
    return C5 * Math.pow(2, keyOkSemis(step) / 12);
  }

  function seqOf(freqs, dur, gap) {
    var out = [];
    for (var i = 0; i < freqs.length; i++) out.push([freqs[i], dur, gap || 0]);
    return out;
  }

  // The melodic reward sounds (word_clear, streak, checkpoint, one_up, ink_drop) are written in C major
  // and follow the key of a major section, as key_ok does (DESIGN 15.2): in section 2 (keyOk root 2,
  // the music in A major) word_clear plays D6 F#6 A6 D7. A root above 2 moves down an octave instead,
  // so the top notes stay at or below D7. Minor sections keep C major, which lies within their key
  // (E minor in the arena).
  function keyShift() {
    if (keyOk.mode !== 'major') return 1;
    var r = keyOk.root > 2 ? keyOk.root - 12 : keyOk.root;
    return Math.pow(2, r / 12);
  }

  function inKey(freqs) {
    var k = keyShift();
    var out = [];
    for (var i = 0; i < freqs.length; i++) out.push(freqs[i] * k);
    return out;
  }

  // Each recipe: { level: 'sfx' | 'key' | number, play: function (B, opts) } where B is the builder
  // of one voice: B.tone(wave, spec), B.noise(kind, spec), B.silence(seconds).
  var SFX = {
    // 45 ms P25 blip, linear decay; one pentatonic step higher per letter.
    key_ok: { level: 'key', play: function (B, o) {
      B.tone('p25', { freq: keyOkFreq(o.step), dur: 0.045, shape: 'decay' });
    } },
    // A low falling buzz and a short soft hiss: different in register and colour, at half the gain.
    key_bad: { level: GAINS.key * 0.5, play: function (B) {
      B.tone('p50', { from: 110, to: 82, curve: 'lin', dur: 0.09, shape: 'decay' });
      B.noise('long', { rate: 0.5, dur: 0.04, vel: 0.45 });
    } },
    lock_on: { level: 'key', play: function (B) {
      B.tone('p12', { seq: seqOf([N.E5, N.A5], 0.03) });
    } },
    lock_release: { level: 'key', play: function (B) {
      B.tone('p25', { seq: seqOf([N.A5, N.E5], 0.03) });
    } },
    // Rising major arpeggio to C7 (in the section's key), a quiet echo of the top note, and a metallic
    // sparkle.
    word_clear: { level: 'sfx', play: function (B) {
      var n = inKey([N.C6, N.E6, N.G6, N.C7]);
      B.tone('p25', { seq: seqOf(n, 0.035).concat([[n[3], 0.09, 0, 'exp', 0.35]]) });
      B.noise('short', { rate: 1, dur: 0.06, vel: 0.5 });
    } },
    clear_pop: { level: 'sfx', play: function (B) {
      B.tone('p50', { from: 200, to: 800, dur: 0.12 });
      B.noise('long', { at: 0.12, rate: 0.7, dur: 0.05 });
    } },
    clear_twang: { level: 'sfx', play: function (B) {
      B.tone('tri', { from: 660, to: 220, dur: 0.18, shape: 'exp', vibrato: { hz: 12, cents: 40 } });
    } },
    clear_bonk: { level: 'sfx', play: function (B) {
      B.tone('tri', { from: 150, to: 60, curve: 'lin', dur: 0.1, shape: 'decay' });
      B.noise('long', { rate: 0.3, dur: 0.03 });
    } },
    clear_crunch: { level: 'sfx', play: function (B) {
      B.noise('long', { rate: 0.6, dur: 0.08, vel: 1 });
      B.tone('tri', { from: 100, to: 50, curve: 'lin', dur: 0.08, shape: 'decay' });
    } },
    streak: { level: 'sfx', play: function (B) {
      B.tone('p25', { seq: seqOf(inKey([N.G5, N.C6, N.E6, N.G6, N.C7]), 0.05) });
      B.tone('p12', { seq: seqOf(inKey([N.E5, N.A5, N.C6, N.E6, N.A6]), 0.05), vel: 0.6 });
    } },
    jump: { level: 'sfx', play: function (B) {
      B.tone('p50', { from: 220, to: 660, dur: 0.14 });
    } },
    land: { level: 'sfx', play: function (B) {
      B.noise('long', { rate: 0.15, dur: 0.03 });
      B.tone('tri', { freq: 80, dur: 0.03, shape: 'decay' });
    } },
    slide: { level: 'sfx', play: function (B) {
      B.noise('long', { rateFrom: 1, rateTo: 0.1, dur: 0.16 });
    } },
    cue_jump: { level: 'sfx', play: function (B) {
      B.tone('p12', { seq: seqOf([N.C6, N.G6], 0.04) });
    } },
    cue_duck: { level: 'sfx', play: function (B) {
      B.tone('p12', { seq: seqOf([N.G6, N.C6], 0.04) });
    } },
    // A short rising fifth, one pentatonic step higher for each drop of a chain (opts.step 0 to 4).
    ink_drop: { level: 'sfx', play: function (B, o) {
      var step = Math.max(0, Math.min(4, Math.floor(Number(o.step) || 0)));
      var root = N.C6 * Math.pow(2, PENTATONIC.major[step] / 12);
      var n = inKey([root, root * Math.pow(2, 7 / 12)]);
      B.tone('p25', { seq: [[n[0], 0.03], [n[1], 0.09]] });
    } },
    crate_break: { level: 'sfx', play: function (B) {
      B.noise('long', { rate: 0.4, dur: 0.08 });
      B.tone('p25', { at: 0.08, seq: seqOf([N.C5, N.E5, N.G5], 0.03) });
    } },
    power_get: { level: 'sfx', play: function (B) {
      B.tone('p25', { seq: seqOf([N.C5, N.E5, N.G5, N.C6, N.E6, N.G6, N.C7], 0.04) });
      B.tone('p25', { at: 0.02, seq: seqOf([N.G5, N.B5, N.D6, N.G6, N.B6, N.D7, N.G7], 0.04), vel: 0.6 });
    } },
    shield_up: { level: 'sfx', play: function (B) {
      B.tone('tri', { freq: 440, dur: 0.3, vibrato: { hz: 8, cents: 77 } });   // 77 cents = 20 Hz at 440 Hz
    } },
    shield_break: { level: 'sfx', play: function (B) {
      B.tone('p12', { seq: seqOf([N.C7, N.G6, N.E6, N.C6, N.G5], 0.035) });
      B.noise('short', { rate: 1, dur: 0.12, vel: 0.6 });
    } },
    slow_on: { level: 'sfx', play: function (B) {
      B.tone('p50', { from: 880, to: 220, dur: 0.5 });
    } },
    slow_off: { level: 'sfx', play: function (B) {
      B.tone('p50', { from: 220, to: 880, dur: 0.3 });
    } },
    ink_blast: { level: 'sfx', play: function (B) {
      B.noise('long', { rateFrom: 1, rateTo: 0.1, dur: 0.6, shape: 'exp' });
      B.tone('tri', { from: 120, to: 40, dur: 0.4, shape: 'decay' });
    } },
    // Pairs of notes climbing C, G, C to a held E: a small fanfare.
    one_up: { level: 'sfx', play: function (B) {
      var n = inKey([N.C6, N.C6, N.G6, N.G6, N.C7, N.E7]);
      B.tone('p25', { seq: seqOf(n.slice(0, 5), 0.06, 0.01).concat([[n[5], 0.24]]) });
    } },
    hurt: { level: 'sfx', play: function (B) {
      B.tone('p50', { from: 400, to: 100, dur: 0.25, shape: 'decay' });
      B.noise('long', { rate: 0.5, dur: 0.1 });
    } },
    fall: { level: 'sfx', play: function (B) {
      B.tone('p25', { from: 800, to: 80, dur: 0.7 });
      B.noise('long', { at: 0.7, rate: 0.12, dur: 0.08 });
    } },
    rescue: { level: 'sfx', play: function (B) {
      B.tone('tri', { from: 220, to: 660, dur: 0.3 });
    } },
    checkpoint: { level: 'sfx', play: function (B) {
      var n = inKey([N.C6, N.G6, N.E6, N.C7, N.C4]);
      B.tone('p25', { seq: [[n[0], 0.12], [n[1], 0.12]] });
      B.tone('p25', { seq: [[n[2], 0.12], [n[3], 0.12]], vel: 0.7 });
      B.tone('tri', { freq: n[4], dur: 0.24, vel: 0.8 });
    } },
    warn: { level: 'sfx', play: function (B, o) {
      var table = { behind: 1760, above: 2093, below: 880, right: 1319 };
      var freq = table[o.variant] || 1319;
      B.tone('p12', { seq: [[freq, 0.05, 0.04], [freq, 0.05]] });
    } },
    urgent_tick: { level: 'sfx', play: function (B) {
      B.tone('p12', { freq: 988, dur: 0.02, shape: 'decay' });
    } },
    boss_rumble: { level: 'sfx', play: function (B) {
      B.tone('tri', { freq: 55, dur: 1.5, tremolo: { hz: 6, depth: 0.7 } });
      B.noise('long', { rate: 0.06, dur: 1.5, vel: 0.6, shape: 'hold' });
    } },
    boss_laugh: { level: 'sfx', play: function (B) {
      B.tone('p50', { seq: seqOf([N.A4, N.G4, N.F4, N.E4, N.D4], 0.05, 0.04) });
    } },
    boss_telegraph: { level: 'sfx', play: function (B, o) {
      var dur = typeof o.duration === 'number' && o.duration > 0 ? Math.min(o.duration, 6) : 1.0;
      var n = Math.max(1, Math.round(dur / 0.12));
      var seq = [];
      for (var i = 0; i < n; i++) seq.push([440, 0.06, 0.06]);
      B.tone('p12', { seq: seq });
    } },
    boss_throw: { level: 'sfx', play: function (B) {
      B.noise('long', { rateFrom: 0.2, rateTo: 1, dur: 0.1 });
    } },
    boss_stomp: { level: 'sfx', play: function (B) {
      B.noise('long', { rate: 0.1, dur: 0.12 });
      B.tone('tri', { freq: 70, dur: 0.12, shape: 'decay' });
    } },
    deflect: { level: 'sfx', play: function (B) {
      B.tone('p25', { from: 300, to: 1200, dur: 0.1 });
    } },
    boss_weak: { level: 'sfx', play: function (B) {
      var seq = [];
      for (var i = 0; i < 10; i++) seq.push([i % 2 === 0 ? N.B5 : N.C6, 0.03, 0]);
      B.tone('p12', { seq: seq });
    } },
    boss_hit: { level: 'sfx', play: function (B) {
      B.noise('long', { rate: 0.5, dur: 0.15 });
      B.tone('p50', { from: 160, to: 80, dur: 0.15, shape: 'decay' });
      B.tone('p12', { at: 0.15, freq: 1568, dur: 0.3, shape: 'exp', vel: 0.7 });
    } },
    boss_stun: { level: 'sfx', play: function (B) {
      B.tone('tri', { warble: { hz: 6, from: 600, to: 900 }, dur: 0.6 });
    } },
    boss_defeat: { level: 'sfx', play: function (B) {
      B.noise('long', { seq: [[1, 0.08, 0.04], [0.7, 0.08, 0.04], [0.5, 0.08, 0.04], [0.35, 0.08, 0.04], [0.25, 0.08, 0.04], [0.15, 0.08, 0.04]] });
      B.tone('p50', { from: 600, to: 60, dur: 0.72 });
      B.silence(0.5);
    } },
    ui_move: { level: 'sfx', play: function (B) {
      B.tone('p25', { freq: 660, dur: 0.025, shape: 'decay' });
    } },
    ui_select: { level: 'sfx', play: function (B) {
      B.tone('p25', { seq: [[880, 0.04], [1320, 0.06]] });
    } },
    ui_back: { level: 'sfx', play: function (B) {
      B.tone('p25', { seq: [[660, 0.04], [440, 0.06]] });
    } },
    pause: { level: 'sfx', play: function (B) {
      B.tone('p25', { seq: seqOf([N.E6, N.C6, N.E6, N.C6], 0.06) });
    } },
    tally_tick: { level: 'sfx', play: function (B) {
      B.tone('p12', { freq: 1568, dur: 0.015, shape: 'decay' });
    } },
    stamp: { level: 'sfx', play: function (B) {
      B.noise('long', { rate: 0.12, dur: 0.12 });
      B.tone('tri', { freq: 90, dur: 0.12, shape: 'decay' });
    } },
    count_tick: { level: 'sfx', play: function (B, o) {
      B.tone('p50', { freq: o.high ? 880 : 440, dur: 0.08 });
    } },
    // An octave leap from G5 to a held G6.
    start: { level: 'sfx', play: function (B) {
      B.tone('p50', { seq: [[N.G5, 0.07], [N.G6, 0.35]] });
    } }
  };

  // --- sound effect voices ---------------------------------------------------------------------

  var voices = [];
  var sfxEnabled = true;
  var musicEnabled = true;
  var sfxLog = [];
  var voiceOrder = 0;       // counts voice allocations, so that the earliest of one step is known
  var pendingSfx = [];      // sounds asked for later (opts.at), started from update: { name, opts }

  // Takeover priority (DESIGN 15.1). When every voice is busy, a new sound takes over the voice with the
  // lowest priority that is not above its own, the one allocated first among equals; when every voice
  // holds a more important sound, the new sound is not played. So the sounds that repeat all the time
  // never cut a reward: an extra life, a power-up, a streak or a cleared word.
  var PRIORITY = {
    key_ok: 0, key_bad: 0, lock_on: 0, lock_release: 0, ink_drop: 0, land: 0, slide: 0, urgent_tick: 0,
    tally_tick: 0, ui_move: 0,
    word_clear: 2, streak: 2, one_up: 2, power_get: 2, ink_blast: 2, shield_up: 2, checkpoint: 2,
    crate_break: 2, boss_hit: 2, boss_defeat: 2
  };

  function priorityOf(name) {
    return Object.prototype.hasOwnProperty.call(PRIORITY, name) ? PRIORITY[name] : 1;
  }

  function levelOf(recipe) {
    return recipe.level === 'key' ? GAINS.key : recipe.level === 'sfx' ? GAINS.sfx : recipe.level;
  }

  // Each sound effect gets a fresh voice gain at its level. A voice whose sound has not ended is
  // busy; when all are busy, one is taken over (see PRIORITY): its gain (constant until now) fades
  // out. Returns null when no voice may be taken.
  function takeVoice(now, level, pan, prio) {
    if (voices.length < SFX_VOICES) voices.push({ gain: null, level: 0, start: -1, end: -1, prio: 0, order: 0 });
    var pick = null;
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].end <= now) { pick = voices[i]; break; }
    }
    if (!pick) {
      for (var j = 0; j < voices.length; j++) {
        var v = voices[j];
        if (v.prio > prio) continue;
        if (!pick || v.prio < pick.prio || (v.prio === pick.prio && v.order < pick.order)) pick = v;
      }
      if (!pick) return null;
      if (pick.gain) {
        fadeOut(pick.gain.gain, pick.level, now, TAKEOVER_FADE);
        retire(pick.out || pick.gain, now + TAKEOVER_FADE + 0.05);
      }
    } else if (pick.gain) {
      retire(pick.out || pick.gain, now);
    }
    var out = graph.sfxBus;
    pick.out = null;
    if (pan && typeof ctx.createStereoPanner === 'function') {
      var panner = ctx.createStereoPanner();
      setParam(panner.pan, Math.max(-1, Math.min(1, pan)));
      panner.connect(graph.sfxBus);
      out = panner;
      pick.out = panner;
    }
    pick.gain = makeGain(level, out);
    pick.level = level;
    pick.start = now;
    pick.prio = prio;
    pick.order = ++voiceOrder;
    return pick;
  }

  // Plays a sound effect. Returns its end time on the audio clock, or 0 when nothing played. A sound
  // asked for later than the look-ahead (opts.at) takes its voice only when update() starts it, so it
  // does not hold a voice while it waits.
  function playSfx(name, opts) {
    var recipe = SFX[name];
    if (!recipe) {
      warnOnce('sfx:' + name, 'unknown sound effect "' + name + '"');
      return 0;
    }
    if (!ctx || !graph || !sfxEnabled) return 0;
    var o = opts || {};
    if (typeof o.at === 'number' && o.at > ctx.currentTime + LOOKAHEAD) {
      pendingSfx.push({ name: name, opts: o });
      return o.at;
    }
    return startSfx(name, recipe, o);
  }

  // Starts the waiting sounds whose time falls within the look-ahead.
  function startPending(now, horizon) {
    if (!pendingSfx.length) return;
    var due = [];
    var keep = [];
    for (var i = 0; i < pendingSfx.length; i++) {
      if (pendingSfx[i].opts.at <= now + horizon) due.push(pendingSfx[i]);
      else keep.push(pendingSfx[i]);
    }
    pendingSfx = keep;
    for (var k = 0; k < due.length; k++) {
      if (sfxEnabled && SFX[due[k].name]) startSfx(due[k].name, SFX[due[k].name], due[k].opts);
    }
  }

  function startSfx(name, recipe, o) {
    var now = ctx.currentTime;
    var t0 = typeof o.at === 'number' && o.at > now ? o.at : now + SFX_LEAD;
    var pan = typeof o.pan === 'number' ? o.pan : 0;
    var voice = takeVoice(now, levelOf(recipe), pan, priorityOf(name));
    if (!voice) return 0;
    var dest = voice.gain;
    var B = {
      end: t0,
      tone: function (wave, spec) {
        var r = scheduleTone(dest, wave, spec, t0);
        if (r.end > B.end) B.end = r.end;
        return r.end;
      },
      noise: function (kind, spec) {
        var r = scheduleNoise(dest, kind, spec, t0);
        if (r.end > B.end) B.end = r.end;
        return r.end;
      },
      silence: function (seconds) {
        B.end += seconds;
      }
    };
    recipe.play(B, o);
    voice.end = B.end;
    sfxLog.push(name);
    if (sfxLog.length > 64) sfxLog.shift();
    return B.end;
  }

  // ===========================================================================================
  // 7. The sequencer
  // ===========================================================================================

  var tempoScale = 1;

  // Peak level of each drum relative to the event velocity (used by the headroom check).
  var DRUM_LEVEL = Object.freeze({ k: 1, s: 0.9, h: 0.45, H: 0.7, x: 1 });

  var DRUMS = {
    k: function (dest, t, vel) { return scheduleNoise(dest, 'long', { rateFrom: 0.16, rateTo: 0.05, dur: 0.07, vel: vel * DRUM_LEVEL.k, shape: 'exp' }, t); },
    s: function (dest, t, vel) { return scheduleNoise(dest, 'long', { rate: 0.45, dur: 0.11, vel: vel * DRUM_LEVEL.s, shape: 'exp' }, t); },
    h: function (dest, t, vel) { return scheduleNoise(dest, 'long', { rate: 1, dur: 0.025, vel: vel * DRUM_LEVEL.h }, t); },
    H: function (dest, t, vel) { return scheduleNoise(dest, 'long', { rate: 1, dur: 0.045, vel: vel * DRUM_LEVEL.H }, t); },
    // Kick and snare in one noise hit: a low thump that switches to the snare's rate after 25 ms.
    x: function (dest, t, vel) { return scheduleNoise(dest, 'long', { rates: [[0, 0.12], [0.025, 0.45]], dur: 0.12, vel: vel * DRUM_LEVEL.x, shape: 'exp' }, t); }
  };

  // One sequencer plays one track on its own four channel gains. `getOut` returns the node the
  // channels feed (the loop's duck gain, or the music bus for jingles). `scaled` sequencers follow
  // the tempo scale of the Hourglass. `canLoop` is false for the jingle sequencer, which always
  // plays a track once.
  function makeSequencer(getOut, scaled, canLoop) {
    var s = {
      name: null, track: null, playing: false, paused: false,
      step: 0, nextTime: 0, endTime: 0,
      bpm: 120, transpose: 0, p2Octave: 0, pending: null, bassOnly: false,
      gains: null, live: [],
      ahead: []     // steps scheduled in the look-ahead window that have not started yet: { step, time }
    };

    function gainsReady() {
      if (s.gains) return;
      var out = getOut();
      s.gains = {
        p1: makeGain(GAINS.p1, out), p2: makeGain(GAINS.p2, out),
        tri: makeGain(GAINS.tri, out), noise: makeGain(GAINS.noise, out)
      };
    }

    function stepDur() {
      var scale = scaled ? tempoScale : 1;
      return 60 / (s.bpm * scale) / 4;
    }

    function loops() {
      return canLoop && s.track && s.track.loop;
    }

    // Silences every note that is sounding or scheduled: the channel gains fade to 0 and are
    // retired, the sources stop after the fade, and the next notes get new channel gains.
    function cut(now) {
      if (s.gains) {
        for (var c = 0; c < CHANNELS.length; c++) {
          var g = s.gains[CHANNELS[c]];
          fadeOut(g.gain, GAINS[CHANNELS[c]], now, CUT_FADE);
          retire(g, now + CUT_FADE + 0.05);
        }
        s.gains = null;
      }
      for (var i = 0; i < s.live.length; i++) {
        var note = s.live[i];
        if (note.end > now) stopSource(note.source, now + CUT_FADE + 0.005);
        if (note.cleanup) note.cleanup();
      }
      s.live.length = 0;
    }

    function prune(now) {
      while (s.ahead.length && s.ahead[0].time <= now) s.ahead.shift();
      if (!s.live.length) return;
      var keep = [];
      for (var i = 0; i < s.live.length; i++) {
        var note = s.live[i];
        if (note.end > now) keep.push(note);
        else if (note.cleanup) note.cleanup();
      }
      s.live = keep;
    }

    function applyPending() {
      var p = s.pending;
      s.pending = null;
      if (!p) return;
      if (typeof p.tempo === 'number' && p.tempo > 0) s.bpm = p.tempo;
      if (typeof p.transpose === 'number') s.transpose = p.transpose;
      if (typeof p.p2Octave === 'number') s.p2Octave = p.p2Octave;
    }

    function scheduleStep(step, t, dur) {
      if (!musicEnabled) return;
      var track = s.track;
      gainsReady();
      for (var c = 0; c < CHANNELS.length; c++) {
        var chName = CHANNELS[c];
        if (s.bassOnly && chName !== 'tri') continue;
        var ch = track.channels[chName];
        var events = ch.byStep[step];
        if (!events) continue;
        for (var i = 0; i < events.length; i++) {
          var ev = events[i];
          var note;
          if (chName === 'noise') {
            var drum = DRUMS[ev.drum];
            if (!drum) continue;
            note = drum(s.gains.noise, t, ev.vel * ch.vel);
          } else {
            var midi = ev.midi + s.transpose + (chName === 'p2' ? s.p2Octave : 0);
            var noteDur = Math.max(0.02, ev.len * dur * ch.gate);
            note = scheduleTone(s.gains[chName], ch.wave, {
              freq: midiToFreq(midi), dur: noteDur, vel: ev.vel * ch.vel, shape: 'hold',
              leadVibrato: ch.vibrato && noteDur > LEAD_VIBRATO_MIN
            }, t);
          }
          s.live.push(note);
        }
      }
    }

    s.start = function (name, opts, at) {
      var track = parseTrack(name);
      if (!track) return false;
      if (track.problems.length > 0) {
        warnOnce('track:' + name, 'track "' + name + '" has problems: ' + track.problems[0]);
      }
      var o = opts || {};
      var now = ctx.currentTime;
      cut(now);
      s.name = name;
      s.track = track;
      s.playing = true;
      s.paused = false;
      s.step = 0;
      s.bpm = typeof o.tempo === 'number' && o.tempo > 0 ? o.tempo : track.bpm;
      s.transpose = typeof o.transpose === 'number' ? o.transpose : 0;
      s.p2Octave = typeof o.p2Octave === 'number' ? o.p2Octave : 0;
      s.pending = null;
      s.ahead.length = 0;
      s.nextTime = typeof at === 'number' && at > now ? at : now + START_DELAY;
      s.endTime = 0;
      return true;
    };

    // Changes tempo, transpose or the pulse 2 octave at the next bar (step 0 counts as a bar, so
    // a change made before the first note is scheduled applies from the first note).
    s.change = function (opts) {
      var o = opts || {};
      var p = s.pending || {};
      if (typeof o.tempo === 'number' && o.tempo > 0) p.tempo = o.tempo;
      if (typeof o.transpose === 'number') p.transpose = o.transpose;
      if (typeof o.p2Octave === 'number') p.p2Octave = o.p2Octave;
      s.pending = p;
    };

    s.stop = function () {
      if (ctx) cut(ctx.currentTime);
      s.playing = false;
      s.paused = false;
      s.name = null;
      s.track = null;
      s.pending = null;
      s.ahead.length = 0;
    };

    // Stops at the current position: the notes scheduled ahead are cut, and the position goes back
    // to the first step that has not sounded yet. resume() continues from that step.
    s.pause = function () {
      if (!s.playing || s.paused) return;
      s.paused = true;
      if (!ctx) return;
      var now = ctx.currentTime;
      for (var i = 0; i < s.ahead.length; i++) {
        if (s.ahead[i].time > now) {
          s.step = s.ahead[i].step;
          break;
        }
      }
      s.ahead.length = 0;
      cut(now);
    };

    s.resume = function () {
      if (!s.playing || !s.paused) return;
      s.paused = false;
      s.nextTime = ctx.currentTime + START_DELAY;
    };

    s.cut = function () {
      if (ctx) cut(ctx.currentTime);
    };

    // Schedules every step that starts before now + horizon. A step whose time has already passed
    // (after a stalled frame) is skipped, so the music stays on its grid and no note is started
    // late with its attack already over.
    s.schedule = function (now, horizon) {
      prune(now);
      if (!s.playing || s.paused || !s.track) return;
      var total = s.track.totalSteps;
      if (now - s.nextTime > CATCH_UP) {
        s.ahead.length = 0;
        applyPending();
        var d0 = stepDur();
        var k = Math.floor((now - s.nextTime) / d0);
        s.nextTime += k * d0;
        if (loops()) {
          s.step = (s.step + k) % total;
        } else if (s.step + k >= total) {
          s.playing = false;
          s.endTime = s.nextTime;
          return;
        } else {
          s.step += k;
        }
      }
      var guard = 0;
      while (s.nextTime < now + horizon && guard++ < 4096) {
        if (s.step % s.track.stepsPerBar === 0 && s.pending) applyPending();
        var dur = stepDur();
        if (s.nextTime >= now) {
          scheduleStep(s.step, s.nextTime, dur);
          s.ahead.push({ step: s.step, time: s.nextTime });
        }
        s.step++;
        s.nextTime += dur;
        if (s.step >= total) {
          if (loops()) {
            s.step = 0;
          } else {
            s.playing = false;
            s.endTime = s.nextTime;
            break;
          }
        }
      }
    };

    // Length of the loaded track in seconds at its current tempo.
    s.length = function () {
      return s.track ? s.track.totalSteps * stepDur() : 0;
    };

    // Time left until a track that plays once ends, at its current tempo.
    s.remaining = function () {
      return s.playing && s.track ? (s.track.totalSteps - s.step) * stepDur() : 0;
    };

    return s;
  }

  var loopSeq = makeSequencer(function () { return graph.duck; }, true, true);
  var onceSeq = makeSequencer(function () { return graph.musicBus; }, false, false);
  var wantedLoop = null;    // music() requested before unlock
  var queuedLoop = null;    // a loop that starts when the victory or game over tune has finished

  // Ducks the loop to DUCK from now until `seconds` after t0, when a jingle's first note plays.
  // The duck is at DUCK before that first note.
  function duckLoop(t0, seconds) {
    var now = ctx.currentTime;
    var down = Math.max(t0, now + 0.01);
    graph.duckCurve.rampFrom(now, [[down, DUCK], [t0 + seconds, DUCK], [t0 + seconds + DUCK_OUT, 1]]);
  }

  function unduck() {
    if (!ctx || !graph) return;
    var now = ctx.currentTime;
    if (graph.duckCurve.valueAt(now) === 1 && graph.duckCurve.valueAt(now + 60) === 1) return;
    graph.duckCurve.rampFrom(now, [[now + 0.05, 1]]);
  }

  function playMusic(name, opts) {
    var o = opts || {};
    if (loopSeq.playing && loopSeq.name === name && !o.restart) {
      loopSeq.change(o);
      return;
    }
    loopSeq.start(name, o);
  }

  function playJingle(name, opts) {
    if (!onceSeq.start(name, opts)) return;
    duckLoop(onceSeq.nextTime, onceSeq.length());
  }

  // Tempo and channels back to normal (DESIGN 15.1 "Reset").
  function normalMusic() {
    tempoScale = 1;
    loopSeq.bassOnly = false;
  }

  // ===========================================================================================
  // 8. Event handlers (CONTRACT 7.1 to 7.3)
  // ===========================================================================================

  var screen = null;
  var trackNames = { level: null, boss: null };        // from the latest level:start
  var sectionMusic = { transpose: 0, tempo: null };     // from the latest section:enter
  var subscriptions = [];

  function trackKnown(name) {
    if (TRACK_NAMES.indexOf(name) !== -1) return true;
    warnOnce('track:' + name, 'unknown track "' + String(name) + '"');
    return false;
  }

  function sectionOpts() {
    var o = { transpose: sectionMusic.transpose };
    if (sectionMusic.tempo) o.tempo = sectionMusic.tempo;
    return o;
  }

  // Starts a loop unless it is already the one playing; then only its options change.
  function ensureLoop(name, opts) {
    if (!name || !trackKnown(name)) return;
    TG.Audio.music(name, opts || {});
  }

  // The results screen comes 4 s after the Baron's defeat, while the 10 s victory fanfare is still
  // playing (and Esc on game over goes there during the game over tune). The results loop then
  // waits for that tune to finish instead of cutting it off.
  function loopAfterOnce(name) {
    if (loopSeq.playing && loopSeq.track && !loopSeq.track.loop) {
      queuedLoop = name;
      return;
    }
    ensureLoop(name);
  }

  function startQueued(now) {
    if (!queuedLoop || loopSeq.playing || now < loopSeq.endTime) return;
    var name = queuedLoop;
    queuedLoop = null;
    playMusic(name, {});
  }

  function bossOpts() {
    var o = sectionOpts();
    try {
      var g = TG.Game;
      if (g && g.state && g.state.boss && g.state.boss.phase === 3) {
        o.tempo = 184;
        o.p2Octave = 12;
      }
    } catch (e) { /* no game state */ }
    return o;
  }

  function resetSection() {
    sectionMusic.transpose = 0;
    sectionMusic.tempo = null;
    keyOk.root = 0;
    keyOk.mode = 'major';
  }

  function onScreenChange(p) {
    var from = p ? p.from : null;
    var to = p ? p.to : null;
    screen = to;
    if (to === 'paused' || from === 'paused') playSfx('pause');
    if (to === 'paused') {
      loopSeq.pause();
      onceSeq.pause();
      return;
    }
    if (from === 'paused') {
      loopSeq.resume();
      if (to === 'results') {
        // QUIT from the pause menu: a jingle paused part-way is dropped, not finished over the results.
        onceSeq.stop();
        unduck();
      } else {
        onceSeq.resume();
        // A jingle that was paused part-way ducks the loop again for the rest of its length.
        if (ctx && graph && onceSeq.playing) duckLoop(onceSeq.nextTime, onceSeq.remaining());
      }
    }
    switch (to) {
      case 'boot':
        normalMusic();
        TG.Audio.music(null);
        onceSeq.stop();
        unduck();
        break;
      case 'title':
        normalMusic();
        resetSection();     // the logo's key sounds use C major pentatonic again
        ensureLoop('title');
        break;
      case 'difficultySelect':
      case 'howToPlay':
        normalMusic();
        ensureLoop('title');
        break;
      case 'playing':
        if (from !== 'lifeLost' && from !== 'paused') ensureLoop(trackNames.level, sectionOpts());
        break;
      case 'lifeLost':
        break;
      case 'bossIntro':
        TG.Audio.music(null);
        normalMusic();
        break;
      case 'boss':
        if (from !== 'lifeLost' && from !== 'paused') ensureLoop(trackNames.boss, bossOpts());
        break;
      case 'levelComplete':
        normalMusic();
        if (loopSeq.name !== 'victory') TG.Audio.music(null);
        break;
      case 'gameOver':
        // The music stops and the game over tune plays in full, whatever the level track was doing.
        normalMusic();
        TG.Audio.music(null);
        onceSeq.stop();
        unduck();
        if (ctx && graph) loopSeq.start('gameover', {});
        break;
      case 'results':
      case 'highScoreEntry':
        normalMusic();
        loopAfterOnce('results');
        break;
      default:
        break;
    }
  }

  function onLevelStart(p) {
    TG.Audio.setTempoScale(1);
    TG.Audio.setBassOnly(false);
    var m = p && p.music;
    if (m && typeof m === 'object') {
      trackNames.level = typeof m.level === 'string' ? m.level : null;
      trackNames.boss = typeof m.boss === 'string' ? m.boss : null;
    }
    // A fresh run starts from the first section; the section:enter that follows sets the rest.
    if (p && p.continued === false) resetSection();
    if (screen === 'playing') ensureLoop(trackNames.level, sectionOpts());
    if (p && p.continued === false) playSfx('start');
    TG.Audio.jingle('jingle_ready');
  }

  function onSectionEnter(p) {
    var m = p && p.music;
    if (m && typeof m === 'object') {
      sectionMusic.transpose = typeof m.transpose === 'number' ? m.transpose : 0;
      sectionMusic.tempo = typeof m.tempo === 'number' && m.tempo > 0 ? m.tempo : null;
      var k = m.keyOk;
      if (k && typeof k === 'object') {
        keyOk.root = typeof k.root === 'number' && isFinite(k.root) ? Math.max(-12, Math.min(12, Math.round(k.root))) : 0;
        keyOk.mode = k.mode === 'minor' ? 'minor' : 'major';
      } else {
        keyOk.root = 0;
        keyOk.mode = 'major';
      }
    }
    if (loopSeq.playing && (loopSeq.name === trackNames.level || loopSeq.name === trackNames.boss)) {
      loopSeq.change(sectionOpts());
    }
    // section:enter follows level:start in the same step, before any note of the ready jingle is
    // scheduled, so the jingle takes the section's key from its first bar.
    if (onceSeq.playing && onceSeq.step === 0) onceSeq.change({ transpose: sectionMusic.transpose });
  }

  var CRATE_BREAK_AT = 0.3;     // s after a crate's word: the crate lands and breaks (crate_break)
  var CRATE_GET_AT = 0.48;      // s after a crate's word: its power sound, once crate_break has ended
  var KEY_BAD_GAP = 0.02;       // s, a second key_bad within this is dropped
  var INK_CHAIN_GAP = 0.35;     // s, ink drops closer than this form a chain
  var lastKeyBad = -1;
  var lastInk = -1;
  var inkChain = 0;

  // The power sound of a crate (power_get, shield_up, one_up) plays after crate_break, as the item
  // reaches Pip, instead of on top of word_clear and the clear sound. Other sources play at once.
  function crateSfx(name, fromCrate) {
    if (fromCrate && ctx) playSfx(name, { at: ctx.currentTime + CRATE_GET_AT });
    else playSfx(name);
  }

  function onWordClear(p) {
    if (!p) return;
    if (p.cause === 'typed') playSfx('word_clear');
    if (p.kind === 'rock') {
      playSfx('deflect');
    } else if (p.family === 'pop') {
      playSfx('clear_pop');
    } else if (p.family === 'twang') {
      playSfx('clear_twang');
    } else if (p.family === 'bonk') {
      playSfx('clear_bonk');
    } else if (p.family === 'crunch') {
      playSfx('clear_crunch');
    }
    if (p.type === 'crate' && ctx) playSfx('crate_break', { at: ctx.currentTime + CRATE_BREAK_AT });
  }

  function onBossDefeat() {
    TG.Audio.music(null);
    var end = playSfx('boss_defeat');
    if (!ctx || !graph) return;
    var at = end > 0 ? end : ctx.currentTime + 1.22;
    loopSeq.start('victory', {}, at);
  }

  var HANDLERS = {
    'type:hit': function (p) {
      if (!p) return;
      if (p.complete === true && (p.kind === 'core' || p.kind === 'finisher')) playSfx('word_clear');
      else if (p.index > 0 && !p.complete) playSfx('key_ok', { step: p.index });
    },
    // The key that triggers auto-release can emit two type:miss (CONTRACT 4.7); two key_bad sounds on
    // the same sample would add up to twice the level, so the second is dropped.
    'type:miss': function () {
      if (ctx && lastKeyBad >= 0 && ctx.currentTime - lastKeyBad < KEY_BAD_GAP) return;
      if (ctx) lastKeyBad = ctx.currentTime;
      playSfx('key_bad');
    },
    'target:lock': function () { playSfx('lock_on'); },
    'target:release': function (p) {
      if (p && (p.reason === 'backspace' || p.reason === 'auto')) playSfx('lock_release');
    },
    'streak:change': function (p) {
      if (p && typeof p.mult === 'number' && typeof p.previousMult === 'number' && p.mult > p.previousMult) playSfx('streak');
    },
    'streak:milestone': function () { playSfx('streak'); },
    'screen:change': onScreenChange,
    'level:start': onLevelStart,
    'word:clear': onWordClear,
    'life:gain': function (p) { crateSfx('one_up', !!(p && p.cause === 'cap')); },
    'life:lost': function (p) {
      if (!(p && p.cause && p.cause.type === 'fall')) playSfx('hurt');
    },
    'shield:gain': function (p) { crateSfx('shield_up', !!(p && p.cause === 'crate')); },
    'shield:break': function () { playSfx('shield_break'); },
    'pickup:power': function (p) {
      if (!p) return;
      if (p.power === 'hourglass' || p.power === 'quill') crateSfx('power_get', true);
      else if (p.power === 'blast') playSfx('ink_blast');   // at once, with the blast
    },
    'power:start': function (p) {
      if (p && p.power === 'hourglass') {
        playSfx('slow_on');
        TG.Audio.setTempoScale(0.75);
      }
    },
    'power:end': function (p) {
      if (p && p.power === 'hourglass') {
        playSfx('slow_off');
        TG.Audio.setTempoScale(1);
      }
    },
    'hero:jump': function () { playSfx('jump'); },
    'hero:land': function () { playSfx('land'); },
    'hero:duck': function () { playSfx('slide'); },
    'hero:fall': function () { playSfx('fall'); },
    'hero:rescue': function () { playSfx('rescue'); },
    // Drops picked up in a quick row step up the scale, so a line of drops plays a rising run.
    'pickup:ink': function () {
      var now = ctx ? ctx.currentTime : 0;
      inkChain = lastInk >= 0 && now - lastInk < INK_CHAIN_GAP ? Math.min(inkChain + 1, 4) : 0;
      lastInk = now;
      playSfx('ink_drop', { step: inkChain });
    },
    'threat:warn': function (p) {
      var from = p && typeof p.from === 'string' ? p.from : 'right';
      var pan = from === 'behind' ? -0.7 : from === 'right' ? 0.7 : 0;
      playSfx('warn', { variant: from, pan: pan });
    },
    'attack:spawn': function (p) {
      if (p && p.kind === 'shock') playSfx('boss_stomp');
    },
    'section:enter': onSectionEnter,
    'checkpoint': function (p) {
      if (p && typeof p.index === 'number' && p.index > 0) {
        playSfx('checkpoint');
        TG.Audio.jingle('jingle_checkpoint');
      }
    },
    'hazard:cue': function (p) {
      if (!p || p.sound !== true) return;
      if (p.action === 'jump') playSfx('cue_jump');
      else if (p.action === 'duck') playSfx('cue_duck');
    },
    'boss:warning': function () {
      playSfx('boss_rumble');
      TG.Audio.setBassOnly(true);
    },
    'boss:enter': function () { playSfx('boss_rumble'); },
    'boss:attack': function (p) {
      if (p && (p.kind === 'shock' || p.kind === 'pick')) {
        playSfx('boss_telegraph', { duration: typeof p.telegraph === 'number' ? p.telegraph : 1.0 });
      }
    },
    'boss:throw': function () { playSfx('boss_throw'); },
    'boss:weakopen': function () {
      playSfx('boss_laugh');
      if (ctx) playSfx('boss_weak', { at: ctx.currentTime + 0.3 });
    },
    'boss:weakclose': function (p) {
      if (p && p.completed === false) playSfx('boss_laugh');
    },
    'boss:hit': function () { playSfx('boss_hit'); },
    'boss:phase': function (p) {
      if (p && p.phase === 3 && loopSeq.playing && loopSeq.name === trackNames.boss) {
        loopSeq.change({ tempo: 184, p2Octave: 12 });
      }
    },
    'boss:finisher': function () { playSfx('boss_stun'); },
    'boss:defeat': onBossDefeat,
    'ui:move': function () { playSfx('ui_move'); },
    'ui:select': function () { playSfx('ui_select'); },
    'ui:back': function () { playSfx('ui_back'); },
    'ui:count': function (p) { playSfx('count_tick', { high: !!(p && p.high) }); },
    'ui:tally': function () { playSfx('tally_tick'); },
    'ui:stamp': function () { playSfx('stamp'); },
    'ui:letter': function (p) { playSfx('key_ok', { step: p && typeof p.index === 'number' ? p.index : 0 }); }
  };

  // --- urgent tick -----------------------------------------------------------------------------

  var urgentAcc = URGENT_PERIOD;

  function anyUrgent() {
    var game = TG.Game;
    if (!game || !game.state) return false;
    var s = game.state;
    if (s.screen !== 'playing' && s.screen !== 'boss') return false;
    var list = s.entities;
    if (!list || typeof list.length !== 'number') return false;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e && e.urgent === true && e.dead !== true) return true;
    }
    return false;
  }

  function urgentUpdate(dt) {
    var urgent = false;
    try { urgent = anyUrgent(); } catch (e) { urgent = false; }
    if (!urgent) {
      urgentAcc = URGENT_PERIOD;
      return;
    }
    urgentAcc += dt;
    if (urgentAcc >= URGENT_PERIOD) {
      urgentAcc -= URGENT_PERIOD;
      if (urgentAcc > URGENT_PERIOD) urgentAcc = 0;
      playSfx('urgent_tick');
    }
  }

  // --- look-ahead ------------------------------------------------------------------------------
  // The sequencer schedules LOOKAHEAD ahead of the audio clock. When frames get long (a slow
  // machine, a busy tab), the look-ahead grows to cover the longest recent frame, up to
  // MAX_LOOKAHEAD, so that no step falls between two updates.

  var lastUpdateAt = null;
  var frameGap = 0;

  function lookahead(now) {
    var gap = lastUpdateAt === null ? 0 : Math.max(0, now - lastUpdateAt);
    lastUpdateAt = now;
    // A stall of many seconds counts as one long frame, so the look-ahead is back to normal soon after.
    frameGap = Math.min(MAX_LOOKAHEAD / FRAME_MARGIN, Math.max(gap, frameGap * FRAME_DECAY));
    return Math.min(MAX_LOOKAHEAD, Math.max(LOOKAHEAD, frameGap * FRAME_MARGIN));
  }

  // ===========================================================================================
  // 9. Public API
  // ===========================================================================================

  TG.Audio = {
    SFX: Object.freeze(SFX_NAMES.slice()),
    TRACKS: Object.freeze(TRACK_NAMES.slice()),

    // Subscribes to events. Creates no AudioContext. Reads the music and sfx settings.
    init: function () {
      for (var i = 0; i < subscriptions.length; i++) subscriptions[i]();
      subscriptions = [];
      var save = TG.Save;
      if (save && typeof save.getSetting === 'function') {
        try {
          musicEnabled = save.getSetting('music') !== false;
          sfxEnabled = save.getSetting('sfx') !== false;
        } catch (e) { /* defaults stay on */ }
      }
      var events = TG.Events;
      if (!events || typeof events.on !== 'function') return;
      var names = Object.keys(HANDLERS);
      for (var k = 0; k < names.length; k++) {
        subscriptions.push(events.on(names[k], HANDLERS[names[k]]));
      }
    },

    // Creates or resumes the AudioContext. Call from a key or pointer handler. Safe to repeat.
    unlock: function () {
      if (unavailable) return false;
      if (!ctx) {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (typeof AC !== 'function') {
          unavailable = true;
          return false;
        }
        var created = null;
        try {
          created = new AC();
          ctx = created;
          buildGraph();
        } catch (e) {
          if (created && typeof created.close === 'function') {
            try { created.close(); } catch (e2) { /* ignore */ }
          }
          ctx = null;
          graph = null;
          unavailable = true;
          warnOnce('context', 'AudioContext could not be created; the game runs without sound');
          return false;
        }
      }
      if (ctx.state !== 'running' && ctx.state !== 'closed' && typeof ctx.resume === 'function') {
        try {
          var p = ctx.resume();
          if (p && typeof p.catch === 'function') p.catch(function () {});
        } catch (e) { /* ignore */ }
      }
      if (wantedLoop) {
        var w = wantedLoop;
        wantedLoop = null;
        playMusic(w.name, w.opts);
      }
      return true;
    },

    // True once the AudioContext runs. A context made outside a user gesture stays suspended, and
    // TG.Main keeps calling unlock() from later keys and taps until it runs.
    isUnlocked: function () {
      return !!ctx && ctx.state === 'running';
    },

    // opts: { step, pan, duration }. No-op when locked or when sound effects are off.
    sfx: function (name, opts) {
      playSfx(name, opts);
    },

    // name: a track, or null to stop. opts: { transpose, tempo, restart }
    music: function (name, opts) {
      queuedLoop = null;
      if (name === null || name === undefined) {
        wantedLoop = null;
        loopSeq.stop();
        return;
      }
      if (!trackKnown(name)) return;
      if (!ctx || !graph) {
        wantedLoop = { name: name, opts: opts || {} };
        return;
      }
      playMusic(name, opts || {});
    },

    // Plays once; the loop is ducked to 30% while it plays.
    jingle: function (name) {
      if (!trackKnown(name)) return;
      if (!ctx || !graph) return;
      playJingle(name, { transpose: sectionMusic.transpose });
    },

    setTempoScale: function (factor) {
      var v = Number(factor);
      tempoScale = isFinite(v) && v > 0 ? v : 1;
    },

    setBassOnly: function (flag) {
      loopSeq.bassOnly = !!flag;
    },

    setEnabled: function (kind, flag) {
      if (kind === 'music') {
        musicEnabled = !!flag;
        if (!musicEnabled) {
          loopSeq.cut();
          onceSeq.cut();
        }
      } else if (kind === 'sfx') {
        sfxEnabled = !!flag;
      }
    },

    // Suspends the AudioContext. Does not touch the sequencer.
    suspend: function () {
      if (!ctx || typeof ctx.suspend !== 'function') return;
      try {
        var p = ctx.suspend();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } catch (e) { /* ignore */ }
    },

    // Resumes the AudioContext. No-op before unlock.
    resume: function () {
      if (!ctx || typeof ctx.resume !== 'function') return;
      try {
        var p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } catch (e) { /* ignore */ }
    },

    // Once per displayed frame: the sequencer look-ahead and the urgent tick. No timers.
    update: function (dt) {
      if (!ctx || !graph) return;
      var d = Number(dt);
      if (!isFinite(d) || d < 0) d = 0;
      var now = ctx.currentTime;
      var horizon = lookahead(now);
      startQueued(now);
      startPending(now, horizon);
      loopSeq.schedule(now, horizon);
      onceSeq.schedule(now, horizon);
      disconnectRetired(now);
      urgentUpdate(d);
    }
  };

  // Test-only view of private state. Nothing in the game reads this.
  TG.Audio._internals = {
    GAINS: GAINS,
    MUSIC_LEVEL: MUSIC_LEVEL,
    COMPRESSOR: COMPRESSOR,
    DUCK: DUCK,
    DRUM_LEVEL: DRUM_LEVEL,
    NOISE_AMP: NOISE_AMP,
    LOOKAHEAD: LOOKAHEAD,
    MAX_LOOKAHEAD: MAX_LOOKAHEAD,
    KEY_OK_TOP: KEY_OK_TOP,
    MUSIC: MUSIC,
    CHANNELS: CHANNELS,
    parse: parseTrack,
    keyPitchClasses: keyPitchClasses,
    noteToMidi: noteToMidi,
    keyOkFreq: keyOkFreq,
    keyOk: function () { return { root: keyOk.root, mode: keyOk.mode }; },
    tempoScale: function () { return tempoScale; },
    sfxLog: sfxLog,
    recipes: function () { return Object.keys(SFX); },
    levelOf: function (name) { return SFX[name] ? levelOf(SFX[name]) : null; },
    graph: function () { return graph; },
    retiredCount: function () { return retired.length; },
    trackLength: function (name) {
      var t = parseTrack(name);
      return t ? t.totalSteps * 60 / t.bpm / 4 : 0;
    },
    sequencer: function (which) {
      var s = which === 'once' ? onceSeq : loopSeq;
      return { name: s.name, playing: s.playing, paused: s.paused, step: s.step, nextTime: s.nextTime,
        bpm: s.bpm, transpose: s.transpose, p2Octave: s.p2Octave, bassOnly: s.bassOnly, live: s.live.length };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
