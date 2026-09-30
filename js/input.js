// js/input.js
// SPELL RUNNER input queue (WP-E). Defines TG.Input.
//
// Contract: docs/CONTRACT.md section 4.12. Design: docs/DESIGN.md section 2.
//
// TG.Input turns DOM key events, the on-screen JUMP and DUCK buttons and calls from the test bot into
// one queue of input events. It has no game logic: TG.Game (sim screens) and TG.UI (other screens)
// drain the queue and decide what each event means.
//
// Queue events:
//   { type: 'char', ch }     a letter a-z, lowercase
//   { type: 'down', key }    a key or button was pressed (queued once until it is released)
//   { type: 'up', key }      that key or button was released
// Key names: 'space', 'enter', 'up', 'down', 'left', 'right', 'esc', 'backspace', 'semicolon',
// 'jump', 'duck'. The last two come from the on-screen buttons and the bot.
//
// The queue itself is part of the simulation (CONTRACT 2.2 rule 4): nothing here reads the clock or
// uses randomness. DOM access happens only inside init and bindButton, which are called by TG.Main.
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  // Keys whose names translate directly from KeyboardEvent.key.
  var NAMED_KEYS = {
    'Enter': 'enter',
    'ArrowUp': 'up',
    'ArrowDown': 'down',
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'Escape': 'esc',
    'Backspace': 'backspace',
    // Old browsers (IE, early Edge) report these names.
    'Up': 'up',
    'Down': 'down',
    'Left': 'left',
    'Right': 'right',
    'Esc': 'esc'
  };

  // The most events kept when nothing drains the queue (for example when TG.UI is missing).
  // The oldest events are dropped first.
  var MAX_QUEUE = 256;

  var queue = [];
  var down = {};             // key name -> true while held
  var firstInputDone = false;

  function isLetter(ch) {
    return typeof ch === 'string' && ch.length === 1 && ch >= 'a' && ch <= 'z';
  }

  function push(event) {
    queue.push(event);
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  }

  // The key name of an event, ignoring modifier keys and auto-repeat. Used for keyup, so that a key
  // released while Ctrl is held is still released.
  function keyNameOf(e) {
    if (!e) return null;
    var k = e.key;
    if (typeof k === 'string' && k.length === 1 && /[a-zA-Z]/.test(k)) return null;
    if (k === ';' || k === ':') return 'semicolon';
    if (e.code === 'Semicolon') return 'semicolon';
    if (k === ' ' || k === 'Spacebar') return 'space';
    if (typeof k === 'string' && Object.prototype.hasOwnProperty.call(NAMED_KEYS, k)) return NAMED_KEYS[k];
    return null;
  }

  function callFirstInput() {
    if (firstInputDone) return;
    var fn = TG.Input.onFirstInput;
    if (typeof fn !== 'function') return;
    firstInputDone = true;
    try {
      fn();
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) console.error('TG.Input: onFirstInput threw', err);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // DOM handlers (attached by init)
  // ---------------------------------------------------------------------------------------------

  function onKeyDown(e) {
    callFirstInput();
    var t = TG.Input.translate(e);
    if (!t) return;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (e.repeat) return;                       // auto-repeat is dropped for keys as well as letters
    if (t.kind === 'char') TG.Input.typeChar(t.ch);
    else TG.Input.keyDown(t.key);
  }

  function onKeyUp(e) {
    var key = keyNameOf(e);
    if (!key) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && typeof e.preventDefault === 'function') e.preventDefault();
    TG.Input.keyUp(key);
  }

  function onBlur() {
    TG.Input.clear();
  }

  TG.Input = {
    // Settable: a function called once, on the first keydown or pointerdown (used to unlock audio).
    onFirstInput: null,

    // target: window. Adds keydown, keyup and blur listeners.
    init: function (target) {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
      target.addEventListener('keydown', onKeyDown);
      target.addEventListener('keyup', onKeyUp);
      target.addEventListener('blur', onBlur);
    },

    // key: 'jump' | 'duck'. The element never keeps keyboard focus.
    bindButton: function (element, key) {
      if (!element || typeof element.addEventListener !== 'function') return;
      if (key !== 'jump' && key !== 'duck') return;

      function drop(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof element.blur === 'function') element.blur();
      }
      function press(e) {
        drop(e);
        callFirstInput();
        TG.Input.keyDown(key);
      }
      function release(e) {
        drop(e);
        TG.Input.keyUp(key);
      }

      element.addEventListener('pointerdown', press);
      element.addEventListener('pointerup', release);
      element.addEventListener('pointercancel', release);
      element.addEventListener('pointerleave', release);
      // Keep the buttons out of the keyboard's way: no focus, no long-press menu on touch screens.
      element.addEventListener('focus', function () { if (typeof element.blur === 'function') element.blur(); });
      element.addEventListener('contextmenu', drop);
      if (typeof element.setAttribute === 'function') element.setAttribute('tabindex', '-1');
    },

    // Pure. e is a KeyboardEvent-like object.
    translate: function (e) {
      if (!e || typeof e !== 'object') return null;
      if (e.ctrlKey || e.metaKey || e.altKey) return null;
      var k = e.key;
      if (typeof k === 'string' && k.length === 1 && /[a-zA-Z]/.test(k)) {
        if (e.repeat) return null;
        return { kind: 'char', ch: k.toLowerCase() };
      }
      if (k === ';' || k === ':') return { kind: 'key', key: 'semicolon' };
      if (e.code === 'Semicolon') return { kind: 'key', key: 'semicolon' };
      // A letter key on a non-Latin layout (Cyrillic, Greek, Hebrew, Arabic and so on) cannot type the
      // English words, so the letter of the key's position on a QWERTY keyboard (e.code) is used
      // instead. Latin layouts already give a-z above and are not affected.
      if (typeof k === 'string' && k.length === 1 && k.charCodeAt(0) > 127 && typeof e.code === 'string' && /^Key[A-Z]$/.test(e.code)) {
        if (e.repeat) return null;
        return { kind: 'char', ch: e.code.charAt(3).toLowerCase() };
      }
      if (k === ' ' || k === 'Spacebar') return { kind: 'key', key: 'space' };
      if (typeof k === 'string' && Object.prototype.hasOwnProperty.call(NAMED_KEYS, k)) {
        return { kind: 'key', key: NAMED_KEYS[k] };
      }
      return null;
    },

    // Queues { type: 'char', ch }. ch is lowercased; anything outside a-z is dropped.
    typeChar: function (ch) {
      if (typeof ch !== 'string') return;
      var c = ch.toLowerCase();
      if (!isLetter(c)) return;
      push({ type: 'char', ch: c });
    },

    // Queues { type: 'down', key } unless that key is already down.
    keyDown: function (key) {
      if (typeof key !== 'string' || key === '') return;
      if (down[key] === true) return;
      down[key] = true;
      push({ type: 'down', key: key });
    },

    // Queues { type: 'up', key } if that key was down.
    keyUp: function (key) {
      if (down[key] !== true) return;
      delete down[key];
      push({ type: 'up', key: key });
    },

    isDown: function (key) {
      return down[key] === true;
    },

    // Returns the queue in order and empties it.
    drain: function () {
      var out = queue;
      queue = [];
      return out;
    },

    // Empties the queue and marks every key as up. Queues no events.
    clear: function () {
      queue = [];
      down = {};
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
