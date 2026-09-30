// js/main.js
// SPELL RUNNER bootstrap and main loop (WP-G). Defines TG.Main.
//
// Contract: docs/CONTRACT.md sections 4.21 and 13.1. Design: docs/DESIGN.md sections 2, 3.6, 14.1
// and 14.8.
//
// TG.Main.init() is the only entry point of the page (index.html calls it). It starts every other
// module in the order of CONTRACT 4.21, each call guarded so that a missing or failing module does
// not stop the others, then runs the loop:
//
//   frame(timestampMs)   requestAnimationFrame callback. Real time is added to an accumulator and
//                        fixed steps of TG.C.DT are taken from it, at most MAX_STEPS per frame. A frame
//                        longer than MAX_FRAME (a sleeping laptop, a background tab) throws the time
//                        away and pauses the game instead of running hundreds of steps. Then
//                        TG.Audio.update and one draw.
//   tick(dt)             one fixed step: TG.Game.step on sim screens, TG.UI.update on the others,
//                        then TG.Effects.update (not while paused) and TG.Hud.update.
//
// The page (index.html, css/style.css):
//   #stage      fills the window, INK; class buttons-side or buttons-below
//   #game       the 384 x 216 canvas, shown at the scale of layoutFor (CONTRACT 13.1)
//   #crt        the CRT overlay above the canvas (Tier 2); class crt-on on #stage shows it
//   #controls   holds #btn-duck and #btn-jump
// resize() works out the rectangles of the canvas and the two buttons in CSS px and sets them as
// inline styles; css/style.css gives everything its look.
//
// Keys. TG.Input listens on the window and calls preventDefault for every key the game uses
// (letters, Space, Enter, arrows, Esc, Backspace, semicolon). TG.Main adds a second keydown listener
// for keys the game does not use but the browser would act on: Tab (moves the keyboard focus away
// from the page), ' and / (quick find in Firefox), PageUp, PageDown, Home and End (scrolling).
// Combinations with Ctrl, Cmd or Alt are always left to the browser. The buttons never keep the
// focus (TG.Input.bindButton, plus mousedown here), so typing keeps working after a click.
//
// Boot screen. "PRESS ANY KEY" means any key or a click: a key that TG.Input does not queue (Shift,
// Tab, a digit ...) and a click outside the buttons are passed on as an Enter press through the
// public TG.Input API, so TG.UI still makes the change to the title screen.
//
// Audio starts only after the first key or click: TG.Input.onFirstInput calls TG.Audio.unlock, and
// a click anywhere on the page does the same. Until the AudioContext is running, every later key
// (except Esc), pointerdown, pointerup, touchend and click tries again, because a browser starts the
// context only inside a user gesture.
//
// Touch. A touch pointerdown before any keydown asks TG.UI to show that a keyboard is needed; the
// first keydown clears it. TG.UI also hears about focus changes (onFocusLost, onFocusGained), so that
// its countdowns stop while the window has no focus.
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  var INK_HEX = '#0f0f1b';
  var BUTTON = 64;                 // CSS px, width and height of the JUMP and DUCK buttons
  var STEP_TOLERANCE = 0.001;      // s: a step is taken when the accumulator is within this of DT

  // Keys the game does not use that the browser would act on (see the header).
  var BLOCKED_KEYS = { 'Tab': true, '\'': true, '/': true, 'PageUp': true, 'PageDown': true, 'Home': true, 'End': true };
  // Keys that do not count as "any key" on the boot screen.
  var NOT_ANY_KEY = { 'Control': true, 'Meta': true, 'Alt': true, 'AltGraph': true, 'OS': true, 'Fn': true,
    'Unidentified': true, 'Dead': true, 'Process': true };

  var win = null, doc = null;
  var canvas = null, ctx = null, stage = null, crtEl = null, btnJump = null, btnDuck = null;
  var started = false;
  var last = null;                 // timestamp of the previous frame, ms
  var acc = 0;                     // accumulated real time not yet simulated, s
  var layout = null;               // the latest layoutFor result
  var layoutDpr = null;            // the devicePixelRatio that layout was made for
  var crtShown = null;
  var keyboardSeen = false;        // a keydown has arrived (see the touch hint below)
  var reported = {};

  function report(where, err) {
    var key = where + ': ' + (err && err.message ? err.message : String(err));
    if (reported[key]) return;
    reported[key] = true;
    if (typeof console !== 'undefined' && console && console.error) console.error('TG.Main: ' + where + ' failed', err);
  }

  // Runs fn; an exception is reported once and does not stop the caller.
  function guard(where, fn) {
    try {
      return fn();
    } catch (e) {
      report(where, e);
      return undefined;
    }
  }

  function has(mod, fn) {
    return !!(TG[mod] && typeof TG[mod][fn] === 'function');
  }

  function screenName() {
    var s = TG.Game && TG.Game.state;
    return s && typeof s.screen === 'string' ? s.screen : null;
  }

  function C(name, fallback) {
    var v = TG.C ? TG.C[name] : undefined;
    return typeof v === 'number' && isFinite(v) ? v : fallback;
  }

  // ---------------------------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------------------------

  // CONTRACT 13.1. Pure.
  function layoutFor(winW, winH, dpr) {
    var B = C('BUTTON_SPACE', 72), GW = C('W', 384), GH = C('H', 216);
    var d = typeof dpr === 'number' && isFinite(dpr) && dpr > 0 ? dpr : 1;
    var w = Math.max(0, Number(winW) || 0);
    var h = Math.max(0, Number(winH) || 0);
    function snap(f) {
      return Math.floor(f * d + 1e-9) / d;
    }
    function result(scale, buttons) {
      return { scale: scale, cssW: GW * scale, cssH: GH * scale, buttons: buttons };
    }
    var s = snap(Math.min(w / GW, h / GH));
    if (s >= 2 && (w - GW * s) / 2 >= B) return result(s, 'side');
    var fit = Math.min(w / GW, (h - B) / GH);
    s = snap(fit);
    if (s >= 2) return result(s, 'below');
    // A short, wide window (a phone held sideways): the buttons at the sides may leave the canvas
    // larger than a strip under it does. The canvas must be at least as tall as a button.
    var sideFit = Math.min((w - 2 * B) / GW, h / GH);
    if (sideFit > fit && GH * sideFit >= BUTTON) return result(sideFit >= 2 ? snap(sideFit) : sideFit, 'side');
    return result(Math.max(0.25, fit), 'below');
  }

  // The rectangles (CSS px) of the canvas and the two buttons for a window, following CONTRACT 4.21:
  // 'side': the canvas is centred; each button is centred in its margin with its bottom edge level
  // with the bottom of the canvas. 'below': the canvas and a strip of BUTTON_SPACE px under it are
  // centred together; DUCK is at the left end of the strip and JUMP at the right end. Positions are
  // rounded to whole device pixels.
  function placement(winW, winH, L, dpr) {
    var B = C('BUTTON_SPACE', 72);
    var d = typeof dpr === 'number' && isFinite(dpr) && dpr > 0 ? dpr : 1;
    function px(v) {
      return Math.round(v * d) / d;
    }
    var cw = L.cssW, ch = L.cssH;
    var r = {};
    if (L.buttons === 'side') {
      var left = px((winW - cw) / 2);
      var top = px((winH - ch) / 2);
      var by = px(top + ch - BUTTON);
      r.canvas = { x: left, y: top, w: cw, h: ch };
      r.duck = { x: px(left / 2 - BUTTON / 2), y: by, w: BUTTON, h: BUTTON };
      var right = left + cw;
      r.jump = { x: px(right + (winW - right) / 2 - BUTTON / 2), y: by, w: BUTTON, h: BUTTON };
    } else {
      var left2 = px((winW - cw) / 2);
      var top2 = px(Math.max(0, (winH - ch - B) / 2));
      var by2 = px(top2 + ch + (B - BUTTON) / 2);
      r.canvas = { x: left2, y: top2, w: cw, h: ch };
      var dl = left2, jl = left2 + cw - BUTTON;
      if (cw < 2 * BUTTON + 8) {             // a tiny canvas: use the ends of the window instead
        dl = Math.max(0, left2 - BUTTON);
        jl = Math.min(winW - BUTTON, left2 + cw);
      }
      r.duck = { x: px(dl), y: by2, w: BUTTON, h: BUTTON };
      r.jump = { x: px(jl), y: by2, w: BUTTON, h: BUTTON };
    }
    return r;
  }

  function place(el, rect) {
    if (!el || !el.style) return;
    el.style.left = rect.x + 'px';
    el.style.top = rect.y + 'px';
    el.style.width = rect.w + 'px';
    el.style.height = rect.h + 'px';
  }

  function crtWanted() {
    var v = 'auto';
    try {
      if (has('Save', 'getSetting')) v = TG.Save.getSetting('crt');
    } catch (e) { v = 'auto'; }
    if (v === 'on') return true;
    if (v === 'off') return false;
    return !!(layout && layout.scale >= 3);         // auto: on when the scale is 3 or more (13.1)
  }

  function applyCrt(force) {
    var on = crtWanted();
    if (!force && on === crtShown) return;
    crtShown = on;
    if (stage && stage.classList) {
      if (on) stage.classList.add('crt-on');
      else stage.classList.remove('crt-on');
    }
  }

  function currentDpr() {
    return Number(win && win.devicePixelRatio) || 1;
  }

  function resize() {
    if (!win) return;
    var w = Number(win.innerWidth) || 0;
    var h = Number(win.innerHeight) || 0;
    var dpr = currentDpr();
    layoutDpr = dpr;
    layout = layoutFor(w, h, dpr);
    var r = placement(w, h, layout, dpr);
    place(canvas, r.canvas);
    place(crtEl, r.canvas);
    if (crtEl && crtEl.style) {
      // One scanline per game pixel row: the lower third of each row is darkened (DESIGN 14.8).
      crtEl.style.backgroundSize = '100% ' + layout.scale + 'px, 100% 100%';
    }
    place(btnDuck, r.duck);
    place(btnJump, r.jump);
    if (stage && stage.classList) {
      stage.classList.remove('buttons-side', 'buttons-below');
      stage.classList.add('buttons-' + layout.buttons);
    }
    applyCrt(true);
  }

  // ---------------------------------------------------------------------------------------------
  // Focus, keys and clicks
  // ---------------------------------------------------------------------------------------------

  // TG.Game.pause acts only on the play screens; TG.UI stops its own countdowns (the resume 3-2-1 and
  // the continue countdown), so that neither runs out while the player is in another window.
  function lostFocus() {
    if (has('Game', 'pause')) guard('TG.Game.pause', function () { TG.Game.pause(); });
    if (has('UI', 'onFocusLost')) guard('TG.UI.onFocusLost', function () { TG.UI.onFocusLost(); });
    if (has('Input', 'clear')) guard('TG.Input.clear', function () { TG.Input.clear(); });
    if (has('Audio', 'suspend')) guard('TG.Audio.suspend', function () { TG.Audio.suspend(); });
  }

  function gotFocus() {
    if (has('UI', 'onFocusGained')) guard('TG.UI.onFocusGained', function () { TG.UI.onFocusGained(); });
    if (has('Audio', 'resume')) guard('TG.Audio.resume', function () { TG.Audio.resume(); });
  }

  function onBlur() {
    lostFocus();
  }

  function onFocus() {
    gotFocus();
  }

  function onVisibility() {
    if (doc && doc.hidden) lostFocus();
    else gotFocus();
  }

  // Browsers let an AudioContext start only inside a user gesture, and not every first input is one
  // (Esc, a touch pointerdown). TG.Audio.isUnlocked() is true only once the context runs, so every
  // later key, click and tap tries again until it does.
  function unlockAudio() {
    if (!has('Audio', 'unlock')) return;
    if (has('Audio', 'isUnlocked') && TG.Audio.isUnlocked()) return;
    guard('TG.Audio.unlock', function () { TG.Audio.unlock(); });
  }

  // A touch screen with no keyboard seen yet: TG.UI shows that a keyboard is needed (DESIGN 2). The
  // first keydown clears it for good.
  function setKeyboardHint(flag) {
    if (has('UI', 'setKeyboardHint')) guard('TG.UI.setKeyboardHint', function () { TG.UI.setKeyboardHint(flag); });
  }

  // "Any key" on the boot screen, passed to TG.UI as an Enter press.
  function bootAnyInput() {
    if (screenName() !== 'boot' || !has('Input', 'keyDown') || !has('Input', 'keyUp')) return;
    TG.Input.keyDown('enter');
    TG.Input.keyUp('enter');
  }

  function onKeyDown(e) {
    if (!e || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (typeof k === 'string' && BLOCKED_KEYS[k] && typeof e.preventDefault === 'function') e.preventDefault();
    if (!keyboardSeen) {
      keyboardSeen = true;
      setKeyboardHint(false);
    }
    if (k !== 'Escape') unlockAudio();           // Esc is not a user gesture for the audio policy
    if (e.repeat || screenName() !== 'boot') return;
    if (typeof k !== 'string' || NOT_ANY_KEY[k] || /^F\d+$/.test(k)) return;
    var queued = has('Input', 'translate') ? TG.Input.translate(e) : null;
    if (!queued) bootAnyInput();
  }

  function isButton(target) {
    return !!target && (target === btnJump || target === btnDuck);
  }

  function onPointerDown(e) {
    unlockAudio();
    if (e && e.pointerType === 'touch' && !keyboardSeen) setKeyboardHint(true);
    if (e && isButton(e.target)) return;
    bootAnyInput();
  }

  // For touch, the gesture that may start audio is the end of the tap (pointerup, touchend), not
  // pointerdown; a click counts too.
  function onPointerEnd() {
    unlockAudio();
  }

  // The buttons must never take the keyboard focus (a focused button would take Space and Enter).
  function keepFocusOff(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
  }

  // ---------------------------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------------------------

  function tick(dt) {
    var s = TG.Game ? TG.Game.state : null;
    if (s && has('Game', 'isSimScreen') && TG.Game.isSimScreen(s.screen)) {
      if (has('Game', 'step')) guard('TG.Game.step', function () { TG.Game.step(dt); });
    } else if (has('UI', 'update')) {
      guard('TG.UI.update', function () { TG.UI.update(dt); });
    }
    s = TG.Game ? TG.Game.state : null;
    if ((!s || s.screen !== 'paused') && has('Effects', 'update')) {
      guard('TG.Effects.update', function () { TG.Effects.update(dt); });
    }
    if (has('Hud', 'update')) guard('TG.Hud.update', function () { TG.Hud.update(dt, s); });
  }

  // Fills the canvas with INK and lets TG.UI draw: used when TG.Render is missing or fails.
  function fallbackDraw(s) {
    if (!ctx) return;
    try {
      if (typeof ctx.setTransform === 'function') ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = INK_HEX;
      ctx.fillRect(0, 0, C('W', 384), C('H', 216));
      if (has('UI', 'draw')) TG.UI.draw(ctx, s);
    } catch (e) {
      report('drawing', e);
    }
  }

  function draw() {
    var s = TG.Game ? TG.Game.state : null;
    if (has('Render', 'draw')) {
      try {
        TG.Render.draw(s);
        return;
      } catch (e) {
        report('TG.Render.draw', e);
      }
    }
    fallbackDraw(s);
  }

  function frame(timestampMs) {
    if (started && win && typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(frame);
    // Moving the window to a screen with another pixel density changes devicePixelRatio without a
    // resize event, so the layout is checked here.
    if (layoutDpr !== null && currentDpr() !== layoutDpr) guard('resize', resize);
    var t = Number(timestampMs);
    if (!isFinite(t)) t = last === null ? 0 : last;
    var dt = last === null ? 0 : (t - last) / 1000;
    last = t;
    if (!(dt > 0)) dt = 0;
    var DT = C('DT', 1 / 60), maxSteps = C('MAX_STEPS', 5), maxFrame = C('MAX_FRAME', 0.25);
    if (dt > maxFrame) {
      // A long gap: throw the time away and pause, rather than running hundreds of steps.
      acc = 0;
      if (has('Game', 'pause')) guard('TG.Game.pause', function () { TG.Game.pause(); });
    } else {
      acc += dt;
      var n = 0;
      while (acc >= DT - STEP_TOLERANCE && n < maxSteps) {
        tick(DT);
        acc -= DT;
        n++;
      }
      if (acc > DT) acc = DT;                    // a slow machine runs slower, it does not fall behind
    }
    if (has('Audio', 'update')) guard('TG.Audio.update', function () { TG.Audio.update(Math.min(dt, maxFrame)); });
    applyCrt(false);
    draw();
  }

  // ---------------------------------------------------------------------------------------------
  // init
  // ---------------------------------------------------------------------------------------------

  function init() {
    if (started) return;                       // the page calls init once; a second call changes nothing
    win = root;
    doc = root.document || null;
    var byId = function (id) {
      return doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
    };

    // CONTRACT 4.21, in this order.
    if (has('Save', 'init')) guard('TG.Save.init', function () { TG.Save.init(win); });
    if (has('Save', 'load')) guard('TG.Save.load', function () { TG.Save.load(); });
    if (has('Gfx', 'init')) guard('TG.Gfx.init', function () { TG.Gfx.init(doc); });
    if (has('Audio', 'init')) guard('TG.Audio.init', function () { TG.Audio.init(); });
    if (has('Input', 'init')) guard('TG.Input.init', function () { TG.Input.init(win); });
    if (TG.Input) {
      guard('TG.Input.onFirstInput', function () {
        TG.Input.onFirstInput = function () {
          if (TG.Audio && typeof TG.Audio.unlock === 'function') TG.Audio.unlock();
        };
      });
    }
    stage = byId('stage');
    canvas = byId('game');
    crtEl = byId('crt');
    btnJump = byId('btn-jump');
    btnDuck = byId('btn-duck');
    if (has('Input', 'bindButton')) {
      guard('TG.Input.bindButton', function () {
        if (btnJump) TG.Input.bindButton(btnJump, 'jump');
        if (btnDuck) TG.Input.bindButton(btnDuck, 'duck');
      });
    }
    if (has('Effects', 'init')) guard('TG.Effects.init', function () { TG.Effects.init(); });
    if (has('Hud', 'init')) guard('TG.Hud.init', function () { TG.Hud.init(); });
    if (has('Render', 'init') && canvas) guard('TG.Render.init', function () { TG.Render.init(canvas); });
    if (canvas && typeof canvas.getContext === 'function') {
      guard('canvas', function () {
        ctx = canvas.getContext('2d');
        if (ctx) ctx.imageSmoothingEnabled = false;
      });
    }
    if (has('UI', 'init')) guard('TG.UI.init', function () { TG.UI.init(); });
    if (has('Game', 'init')) guard('TG.Game.init', function () { TG.Game.init(); });

    // Resize handling.
    guard('resize', resize);
    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('resize', function () { guard('resize', resize); });
      // Focus, blur and visibility handling.
      win.addEventListener('blur', onBlur);
      win.addEventListener('focus', onFocus);
      win.addEventListener('keydown', onKeyDown);
      win.addEventListener('pointerdown', onPointerDown);
      win.addEventListener('pointerup', onPointerEnd);
      win.addEventListener('touchend', onPointerEnd);
      win.addEventListener('click', onPointerEnd);
    }
    if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('visibilitychange', onVisibility);
    [btnJump, btnDuck].forEach(function (b) {
      if (b && typeof b.addEventListener === 'function') b.addEventListener('mousedown', keepFocusOff);
    });
    if (stage && typeof stage.addEventListener === 'function') stage.addEventListener('contextmenu', keepFocusOff);

    // First frame.
    started = true;
    last = null;
    acc = 0;
    if (win && typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(frame);
  }

  TG.Main = {
    init: function () {
      guard('init', init);
    },
    frame: function (timestampMs) {
      guard('frame', function () { frame(timestampMs); });
    },
    tick: function (dt) {
      tick(dt);
    },
    layoutFor: layoutFor,
    resize: function () {
      guard('resize', resize);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
