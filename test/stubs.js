// test/stubs.js
// Node loader for the game files, with stubs for the browser (WP0). CONTRACT 10.1 and 13.2.
// No npm packages. Run tests from the project root: node test/<file>.js
//
//   const stubs = require('./stubs');
//   const env = stubs.load({ files: ['js/core.js', 'js/words.js'] });
//   const TG = env.TG;
//
// stubs.FILES            the 20 file paths of CONTRACT section 1, in load order, relative to the project root
// stubs.ROOT             absolute path of the project root
// stubs.plain(value)     a JSON copy of `value` made in the test's own realm
// stubs.load(options)    loads files into a fresh vm context and returns `env`
//
// Options of load (all optional):
//   files         list of paths relative to the project root, loaded in the order given. Default: stubs.FILES
//   allowMissing  default true: files that do not exist are skipped and listed in env.missing
//   storage       'memory' (default): working localStorage
//                 'none':   window.localStorage is undefined
//                 'throw':  reading window.localStorage throws, and so does every method of env.localStorage
//   constants     { NAME: value }: directly after js/core.js is loaded, TG.C is replaced by a frozen copy
//                 with these values. A name that TG.C does not have is an error
//   quiet         default true: console.warn and console.error are captured, not printed
//   canvas        'stub' (default): canvases count calls and draw nothing
//                 'soft': canvases are software canvases from tools/softcanvas.js and really draw
//
// env, as in CONTRACT 10.1:
//   TG, window, document, loaded, missing, storage, warnings, errors, listeners,
//   dispatch(type, init), dispatchTo(element, type, init), setHidden(flag), setSize(w, h),
//   raf, runFrame(ms), canvasCalls, audio { contexts, nodes, starts, suspends, resumes, advance(seconds) }
//   canvas                 the game canvas, document.getElementById('game') (CONTRACT 13.2)
//
// Extras that the contract does not require:
//   env.localStorage       the storage object itself in every mode (undefined for 'none'). With 'throw'
//                          it is the object whose methods throw
//   env.context            the vm context; env.run(code) evaluates code inside it
//   env.timers             callbacks passed to setTimeout and setInterval. Nothing runs by itself;
//                          env.runTimers() runs and clears them
//   env.audio.contexts[i].created    every node that context created, each with a `kind`
//                          ('oscillator', 'gain', 'bufferSource', ...), `started`, `stopped`, `startTime`
//   AudioParam stubs       `value` follows the latest scheduled value; `events` lists every scheduling call
//                          as { type, value, time }
//
// Values that come out of env.TG belong to another realm. Compare them by value
// (JSON.stringify, assert.deepEqual, or assert.deepStrictEqual(stubs.plain(a), b)), never with
// assert.deepStrictEqual or instanceof directly.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const util = require('util');

const ROOT = path.resolve(__dirname, '..');

const FILES = [
  'js/core.js',
  'js/words.js',
  'js/typing.js',
  'js/audio.js',
  'js/gfx.js',
  'js/font.js',
  'js/sprites-chars.js',
  'js/sprites-world.js',
  'js/input.js',
  'js/entities.js',
  'js/level.js',
  'js/boss.js',
  'js/levels/level1.js',
  'js/game.js',
  'js/effects.js',
  'js/hud.js',
  'js/render.js',
  'js/board.js',
  'js/ui.js',
  'js/main.js'
];

const GAME_W = 384;
const GAME_H = 216;

function plain(value) {
  if (value === undefined) return undefined;
  const text = JSON.stringify(value);
  return text === undefined ? undefined : JSON.parse(text);
}

// ---------------------------------------------------------------------------------------------
// Console capture
// ---------------------------------------------------------------------------------------------

function formatArgs(args) {
  return Array.prototype.map.call(args, function (a) {
    if (typeof a === 'string') return a;
    if (a && typeof a === 'object' && typeof a.message === 'string') {
      return (a.name ? a.name + ': ' : '') + a.message;
    }
    try {
      return util.inspect(a, { depth: 2, breakLength: Infinity });
    } catch (e) {
      return String(a);
    }
  }).join(' ');
}

function makeConsole(env, quiet) {
  const real = console;
  return {
    log: function () { real.log.apply(real, arguments); },
    info: function () { real.info.apply(real, arguments); },
    debug: function () { real.debug.apply(real, arguments); },
    warn: function () {
      env.warnings.push(formatArgs(arguments));
      if (!quiet) real.warn.apply(real, arguments);
    },
    error: function () {
      env.errors.push(formatArgs(arguments));
      if (!quiet) real.error.apply(real, arguments);
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------

function makeEvent(type, init, target) {
  const event = {
    type: type,
    target: target || null,
    currentTarget: target || null,
    key: '',
    code: '',
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault: function () { event.defaultPrevented = true; },
    stopPropagation: function () { event.propagationStopped = true; },
    stopImmediatePropagation: function () { event.propagationStopped = true; event.immediateStopped = true; }
  };
  if (init && typeof init === 'object') {
    Object.keys(init).forEach(function (k) { event[k] = init[k]; });
  }
  return event;
}

function callListeners(list, event) {
  const queue = (list || []).slice();
  for (let i = 0; i < queue.length; i++) {
    if (event.immediateStopped) break;
    const fn = queue[i];
    if (typeof fn === 'function') fn(event);
    else if (fn && typeof fn.handleEvent === 'function') fn.handleEvent(event);
  }
}

// ---------------------------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------------------------

function px(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }
  return 0;
}

function makeClassList(el) {
  function names() {
    return String(el.className || '').split(/\s+/).filter(Boolean);
  }
  return {
    add: function () {
      const list = names();
      for (let i = 0; i < arguments.length; i++) if (list.indexOf(arguments[i]) === -1) list.push(String(arguments[i]));
      el.className = list.join(' ');
    },
    remove: function () {
      const drop = Array.prototype.slice.call(arguments).map(String);
      el.className = names().filter(function (n) { return drop.indexOf(n) === -1; }).join(' ');
    },
    toggle: function (name, force) {
      const has = names().indexOf(name) !== -1;
      const want = force === undefined ? !has : !!force;
      if (want) this.add(name); else this.remove(name);
      return want;
    },
    contains: function (name) {
      return names().indexOf(name) !== -1;
    },
    toString: function () { return names().join(' '); }
  };
}

// Adds the element interface to `el` (a new object, a stub canvas or a software canvas).
function decorateElement(state, el, tag, id) {
  el.tagName = String(tag || 'div').toUpperCase();
  el.nodeName = el.tagName;
  el.id = id || '';
  if (!el.style) el.style = {};
  el.className = '';
  el.classList = makeClassList(el);
  el.listeners = {};
  el.attributes = {};
  el.children = [];
  el.parentNode = null;
  el.textContent = '';
  el.innerHTML = '';
  el.hidden = false;
  el.dataset = {};

  el.addEventListener = function (type, fn) {
    if (!fn) return;
    const list = el.listeners[type] = el.listeners[type] || [];
    if (list.indexOf(fn) === -1) list.push(fn);
  };
  el.removeEventListener = function (type, fn) {
    const list = el.listeners[type];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i !== -1) list.splice(i, 1);
  };
  el.dispatchEvent = function (event) {
    if (!event.target) event.target = el;
    event.currentTarget = el;
    callListeners(el.listeners[event.type], event);
    return !event.defaultPrevented;
  };
  el.focus = function () { state.document.activeElement = el; };
  el.blur = function () {
    if (state.document.activeElement === el) state.document.activeElement = state.document.body;
  };
  el.getBoundingClientRect = function () {
    const left = px(el.style.left), top = px(el.style.top);
    const width = el.style.width !== undefined && el.style.width !== '' ? px(el.style.width)
      : (typeof el.width === 'number' ? el.width : 0);
    const height = el.style.height !== undefined && el.style.height !== '' ? px(el.style.height)
      : (typeof el.height === 'number' ? el.height : 0);
    return { x: left, y: top, left: left, top: top, width: width, height: height, right: left + width, bottom: top + height };
  };
  el.setAttribute = function (name, value) {
    el.attributes[name] = String(value);
    if (name === 'class') el.className = String(value);
    if (name === 'id') el.id = String(value);
    if ((name === 'width' || name === 'height') && el.tagName === 'CANVAS') el[name] = Number(value);
  };
  el.getAttribute = function (name) {
    if (Object.prototype.hasOwnProperty.call(el.attributes, name)) return el.attributes[name];
    if (name === 'id' && el.id) return el.id;
    if (name === 'class' && el.className) return el.className;
    return null;
  };
  el.hasAttribute = function (name) { return el.getAttribute(name) !== null; };
  el.removeAttribute = function (name) { delete el.attributes[name]; };
  el.appendChild = function (child) {
    if (child && typeof child === 'object') {
      if (el.children.indexOf(child) === -1) el.children.push(child);
      child.parentNode = el;
    }
    return child;
  };
  el.removeChild = function (child) {
    const i = el.children.indexOf(child);
    if (i !== -1) el.children.splice(i, 1);
    if (child && typeof child === 'object') child.parentNode = null;
    return child;
  };
  el.contains = function (other) { return other === el || el.children.indexOf(other) !== -1; };
  el.querySelector = function () { return null; };
  el.querySelectorAll = function () { return []; };
  el.setPointerCapture = function () {};
  el.releasePointerCapture = function () {};
  el.hasPointerCapture = function () { return false; };
  return el;
}

// ---------------------------------------------------------------------------------------------
// Canvas stub
// ---------------------------------------------------------------------------------------------

const CONTEXT_METHODS = [
  'arc', 'arcTo', 'beginPath', 'bezierCurveTo', 'clearRect', 'clip', 'closePath', 'createConicGradient',
  'createImageData', 'createLinearGradient', 'createPattern', 'createRadialGradient', 'drawFocusIfNeeded',
  'drawImage', 'ellipse', 'fill', 'fillRect', 'fillText', 'getContextAttributes', 'getImageData',
  'getLineDash', 'getTransform', 'isContextLost', 'isPointInPath', 'isPointInStroke', 'lineTo',
  'measureText', 'moveTo', 'putImageData', 'quadraticCurveTo', 'rect', 'reset', 'resetTransform', 'restore',
  'rotate', 'roundRect', 'save', 'scale', 'setLineDash', 'setTransform', 'stroke', 'strokeRect',
  'strokeText', 'transform', 'translate'
];

function imageData(w, h) {
  const width = Math.max(0, Math.floor(Math.abs(Number(w) || 0)));
  const height = Math.max(0, Math.floor(Math.abs(Number(h) || 0)));
  return { width: width, height: height, data: new Uint8ClampedArray(width * height * 4) };
}

function makeStubContext(state, canvas) {
  const ctx = {
    canvas: canvas,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: true,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineWidth: 1
  };
  const results = {
    getImageData: function (x, y, w, h) { return imageData(w, h); },
    createImageData: function (a, b) {
      return (a && typeof a === 'object') ? imageData(a.width, a.height) : imageData(a, b);
    },
    measureText: function () { return { width: 0 }; },
    createPattern: function () { return { setTransform: function () {} }; },
    createLinearGradient: function () { return { addColorStop: function () {} }; },
    createRadialGradient: function () { return { addColorStop: function () {} }; },
    createConicGradient: function () { return { addColorStop: function () {} }; },
    getLineDash: function () { return []; },
    getTransform: function () { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
    getContextAttributes: function () { return { alpha: true }; },
    isContextLost: function () { return false; },
    isPointInPath: function () { return false; },
    isPointInStroke: function () { return false; }
  };
  CONTEXT_METHODS.forEach(function (name) {
    const result = results[name];
    ctx[name] = function () {
      state.env.canvasCalls.count++;
      return result ? result.apply(null, arguments) : undefined;
    };
  });
  return ctx;
}

function makeCanvas(state, id, w, h) {
  let canvas;
  if (state.canvasMode === 'soft') {
    const soft = require('../tools/softcanvas');
    canvas = soft.createCanvas(w, h, { onCall: function () { state.env.canvasCalls.count++; } });
  } else {
    canvas = { width: w, height: h, style: {} };
    let ctx = null;
    canvas.getContext = function (type) {
      if (type !== '2d') return null;
      if (!ctx) ctx = makeStubContext(state, canvas);
      return ctx;
    };
    canvas.toDataURL = function () { return 'data:,'; };
  }
  decorateElement(state, canvas, 'canvas', id);
  return canvas;
}

// ---------------------------------------------------------------------------------------------
// Audio stub
// ---------------------------------------------------------------------------------------------

function makeParam(value) {
  const p = { value: value, defaultValue: value, events: [] };
  function schedule(type, keepValue) {
    return function (v, time, extra) {
      p.events.push({ type: type, value: v, time: time, extra: extra });
      if (!keepValue && typeof v === 'number') p.value = v;
      return p;
    };
  }
  p.setValueAtTime = schedule('setValueAtTime');
  p.linearRampToValueAtTime = schedule('linearRampToValueAtTime');
  p.exponentialRampToValueAtTime = schedule('exponentialRampToValueAtTime');
  p.setTargetAtTime = schedule('setTargetAtTime');
  p.setValueCurveAtTime = schedule('setValueCurveAtTime', true);
  p.cancelScheduledValues = function (time) {
    p.events.push({ type: 'cancelScheduledValues', value: undefined, time: time });
    return p;
  };
  p.cancelAndHoldAtTime = function (time) {
    p.events.push({ type: 'cancelAndHoldAtTime', value: undefined, time: time });
    return p;
  };
  return p;
}

function makeAudioContextClass(state) {
  const audio = state.env.audio;

  function makeNode(ctx, kind, params, fields) {
    const node = {
      kind: kind,
      context: ctx,
      connections: [],
      started: false,
      stopped: false,
      startTime: null,
      stopTime: null,
      onended: null,
      connect: function (target) {
        node.connections.push(target);
        return target;
      },
      disconnect: function (target) {
        if (target === undefined) node.connections.length = 0;
        else node.connections = node.connections.filter(function (t) { return t !== target; });
      },
      start: function (when) {
        audio.starts++;
        node.started = true;
        node.startTime = when === undefined ? ctx.currentTime : when;
      },
      stop: function (when) {
        node.stopped = true;
        node.stopTime = when === undefined ? ctx.currentTime : when;
      },
      addEventListener: function () {},
      removeEventListener: function () {}
    };
    Object.keys(params || {}).forEach(function (name) { node[name] = makeParam(params[name]); });
    Object.keys(fields || {}).forEach(function (name) { node[name] = fields[name]; });
    audio.nodes++;
    ctx.created.push(node);
    return node;
  }

  function StubAudioContext() {
    const ctx = this;
    ctx.currentTime = 0;
    ctx.sampleRate = 44100;
    ctx.state = 'running';
    ctx.baseLatency = 0;
    ctx.created = [];
    ctx.destination = {
      kind: 'destination', context: ctx, maxChannelCount: 2,
      connect: function (t) { return t; }, disconnect: function () {}
    };
    ctx.listener = {};
    audio.contexts.push(ctx);
  }

  StubAudioContext.prototype = {
    constructor: StubAudioContext,
    resume: function () {
      audio.resumes++;
      if (this.state !== 'closed') this.state = 'running';
      return Promise.resolve();
    },
    suspend: function () {
      audio.suspends++;
      if (this.state !== 'closed') this.state = 'suspended';
      return Promise.resolve();
    },
    close: function () {
      this.state = 'closed';
      return Promise.resolve();
    },
    addEventListener: function () {},
    removeEventListener: function () {},
    createOscillator: function () {
      const node = makeNode(this, 'oscillator', { frequency: 440, detune: 0 }, { type: 'sine', periodicWave: null });
      node.setPeriodicWave = function (wave) { node.periodicWave = wave; node.type = 'custom'; };
      return node;
    },
    createGain: function () {
      return makeNode(this, 'gain', { gain: 1 });
    },
    createBufferSource: function () {
      return makeNode(this, 'bufferSource', { playbackRate: 1, detune: 0 }, { buffer: null, loop: false, loopStart: 0, loopEnd: 0 });
    },
    createDynamicsCompressor: function () {
      return makeNode(this, 'dynamicsCompressor', { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 }, { reduction: 0 });
    },
    createStereoPanner: function () {
      return makeNode(this, 'stereoPanner', { pan: 0 });
    },
    createBiquadFilter: function () {
      return makeNode(this, 'biquadFilter', { frequency: 350, detune: 0, Q: 1, gain: 0 }, { type: 'lowpass' });
    },
    createDelay: function () {
      return makeNode(this, 'delay', { delayTime: 0 });
    },
    createConstantSource: function () {
      return makeNode(this, 'constantSource', { offset: 1 });
    },
    createWaveShaper: function () {
      return makeNode(this, 'waveShaper', {}, { curve: null, oversample: 'none' });
    },
    createBuffer: function (channels, length, sampleRate) {
      const n = Math.max(1, Math.floor(channels) || 1);
      const len = Math.max(0, Math.floor(length) || 0);
      const rate = sampleRate || 44100;
      const data = [];
      for (let i = 0; i < n; i++) data.push(new Float32Array(len));
      return {
        numberOfChannels: n,
        length: len,
        sampleRate: rate,
        duration: len / rate,
        getChannelData: function (channel) { return data[channel || 0]; },
        copyToChannel: function (source, channel) { data[channel || 0].set(source.subarray(0, len)); },
        copyFromChannel: function (target, channel) { target.set(data[channel || 0].subarray(0, target.length)); }
      };
    },
    createPeriodicWave: function (real, imag, options) {
      return { kind: 'periodicWave', real: real, imag: imag, options: options || null };
    }
  };

  return StubAudioContext;
}

// ---------------------------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------------------------

function makeMemoryStorage(map) {
  const s = {
    getItem: function (key) {
      const k = String(key);
      return map.has(k) ? map.get(k) : null;
    },
    setItem: function (key, value) { map.set(String(key), String(value)); },
    removeItem: function (key) { map.delete(String(key)); },
    clear: function () { map.clear(); },
    key: function (i) {
      const keys = Array.from(map.keys());
      return i >= 0 && i < keys.length ? keys[i] : null;
    }
  };
  Object.defineProperty(s, 'length', { get: function () { return map.size; }, enumerable: false });
  return s;
}

function makeThrowingStorage() {
  function blocked() {
    throw new Error('SecurityError: localStorage is blocked (stub, storage: "throw")');
  }
  const s = { getItem: blocked, setItem: blocked, removeItem: blocked, clear: blocked, key: blocked };
  Object.defineProperty(s, 'length', { get: blocked, enumerable: false });
  return s;
}

// ---------------------------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------------------------

function load(options) {
  const opts = options || {};
  const files = Array.isArray(opts.files) ? opts.files.slice() : FILES.slice();
  const allowMissing = opts.allowMissing !== false;
  const storageMode = opts.storage === undefined ? 'memory' : opts.storage;
  const canvasMode = opts.canvas === undefined ? 'stub' : opts.canvas;
  const quiet = opts.quiet !== false;
  const constants = opts.constants && typeof opts.constants === 'object' ? opts.constants : null;

  if (['memory', 'none', 'throw'].indexOf(storageMode) === -1) {
    throw new Error('stubs.load: storage must be "memory", "none" or "throw", got ' + JSON.stringify(storageMode));
  }
  if (['stub', 'soft'].indexOf(canvasMode) === -1) {
    throw new Error('stubs.load: canvas must be "stub" or "soft", got ' + JSON.stringify(canvasMode));
  }

  const env = {
    TG: undefined,
    window: null,
    document: null,
    loaded: [],
    missing: [],
    storage: undefined,
    localStorage: undefined,
    warnings: [],
    errors: [],
    listeners: {},
    raf: [],
    timers: [],
    canvasCalls: { count: 0 },
    canvas: null,
    audio: { contexts: [], nodes: 0, starts: 0, suspends: 0, resumes: 0, advance: null }
  };
  const state = { env: env, canvasMode: canvasMode, document: null };

  env.audio.advance = function (seconds) {
    const s = Number(seconds) || 0;
    env.audio.contexts.forEach(function (ctx) { ctx.currentTime += s; });
  };

  // --- window and document listeners -----------------------------------------------------------
  const records = [];          // { target, type, fn }
  function addListener(target, type, fn) {
    if (!fn) return;
    for (let i = 0; i < records.length; i++) {
      if (records[i].target === target && records[i].type === type && records[i].fn === fn) return;
    }
    records.push({ target: target, type: type, fn: fn });
    (env.listeners[type] = env.listeners[type] || []).push(fn);
  }
  function removeListener(target, type, fn) {
    for (let i = 0; i < records.length; i++) {
      if (records[i].target === target && records[i].type === type && records[i].fn === fn) {
        records.splice(i, 1);
        const list = env.listeners[type] || [];
        const j = list.indexOf(fn);
        if (j !== -1) list.splice(j, 1);
        return;
      }
    }
  }

  // --- document --------------------------------------------------------------------------------
  const elements = {};
  const doc = {
    hidden: false,
    visibilityState: 'visible',
    readyState: 'complete',
    title: '',
    activeElement: null,
    createElement: function (tag) {
      const t = String(tag || 'div').toLowerCase();
      if (t === 'canvas') return makeCanvas(state, '', 300, 150);
      return decorateElement(state, {}, t, '');
    },
    createTextNode: function (text) { return { nodeType: 3, textContent: String(text) }; },
    getElementById: function (id) {
      const key = String(id);
      if (!Object.prototype.hasOwnProperty.call(elements, key)) {
        if (key === 'game') elements[key] = makeCanvas(state, key, GAME_W, GAME_H);
        else elements[key] = decorateElement(state, {}, key.indexOf('btn-') === 0 ? 'button' : 'div', key);
      }
      return elements[key];
    },
    querySelector: function (selector) {
      const s = String(selector || '');
      return /^#[\w-]+$/.test(s) ? doc.getElementById(s.slice(1)) : null;
    },
    querySelectorAll: function () { return []; },
    addEventListener: function (type, fn) { addListener('document', type, fn); },
    removeEventListener: function (type, fn) { removeListener('document', type, fn); },
    hasFocus: function () { return true; }
  };
  state.document = doc;
  doc.body = decorateElement(state, {}, 'body', '');
  doc.head = decorateElement(state, {}, 'head', '');
  doc.documentElement = decorateElement(state, {}, 'html', '');
  doc.activeElement = doc.body;
  env.document = doc;

  // --- storage ---------------------------------------------------------------------------------
  if (storageMode === 'memory') {
    env.storage = new Map();
    env.localStorage = makeMemoryStorage(env.storage);
  } else if (storageMode === 'throw') {
    env.localStorage = makeThrowingStorage();
  }

  // --- the context -----------------------------------------------------------------------------
  // The vm context supplies Math, Date, JSON and the other language built-ins of its own realm.
  const sandbox = {};
  const context = vm.createContext(sandbox);
  const inner = vm.runInContext('this', context);

  // `window` is a thin proxy around the context's global object, so that reading window.localStorage
  // can throw (an accessor on a vm global does not). Everything else passes straight through:
  // window.TG and the global TG are the same property.
  const win = new Proxy(inner, {
    get: function (target, prop) {
      if (prop === 'localStorage' && storageMode === 'throw') {
        throw new Error('SecurityError: reading window.localStorage is blocked (stub, storage: "throw")');
      }
      return target[prop];
    },
    has: function (target, prop) {
      if (prop === 'localStorage' && storageMode === 'throw') return true;
      return prop in target;
    }
  });

  let rafId = 0;
  const rafIds = new Map();      // id -> callback
  let timerId = 0;

  sandbox.window = win;
  sandbox.self = win;
  sandbox.document = doc;
  sandbox.navigator = { userAgent: 'node', platform: 'node', language: 'en', languages: ['en'], maxTouchPoints: 0 };
  sandbox.location = { href: 'file:///index.html', protocol: 'file:', search: '', hash: '' };
  sandbox.console = makeConsole(env, quiet);
  sandbox.performance = { now: function () { return 0; } };
  sandbox.innerWidth = 1920;
  sandbox.innerHeight = 1080;
  sandbox.devicePixelRatio = 1;
  sandbox.addEventListener = function (type, fn) { addListener('window', type, fn); };
  sandbox.removeEventListener = function (type, fn) { removeListener('window', type, fn); };
  sandbox.focus = function () {};
  sandbox.blur = function () {};
  sandbox.matchMedia = function (query) {
    return { matches: false, media: String(query), addEventListener: function () {}, removeEventListener: function () {},
      addListener: function () {}, removeListener: function () {} };
  };
  sandbox.getComputedStyle = function (el) { return (el && el.style) || {}; };
  sandbox.requestAnimationFrame = function (fn) {
    rafId++;
    rafIds.set(rafId, fn);
    env.raf.push(fn);
    return rafId;
  };
  sandbox.cancelAnimationFrame = function (id) {
    const fn = rafIds.get(id);
    if (!fn) return;
    rafIds.delete(id);
    const i = env.raf.indexOf(fn);
    if (i !== -1) env.raf.splice(i, 1);
  };
  function addTimer(fn, ms, repeat) {
    timerId++;
    env.timers.push({ id: timerId, fn: fn, ms: Number(ms) || 0, repeat: repeat });
    return timerId;
  }
  function dropTimer(id) {
    for (let i = 0; i < env.timers.length; i++) {
      if (env.timers[i].id === id) { env.timers.splice(i, 1); return; }
    }
  }
  sandbox.setTimeout = function (fn, ms) { return addTimer(fn, ms, false); };
  sandbox.clearTimeout = dropTimer;
  sandbox.setInterval = function (fn, ms) { return addTimer(fn, ms, true); };
  sandbox.clearInterval = dropTimer;

  const AudioContextStub = makeAudioContextClass(state);
  sandbox.AudioContext = AudioContextStub;
  sandbox.webkitAudioContext = AudioContextStub;

  if (storageMode === 'memory') sandbox.localStorage = env.localStorage;

  env.window = win;
  env.context = context;
  env.run = function (code) { return vm.runInContext(String(code), context); };
  env.canvas = doc.getElementById('game');

  // --- env functions ---------------------------------------------------------------------------
  env.dispatch = function (type, init) {
    const event = makeEvent(type, init, win);
    callListeners(env.listeners[type], event);
    return event;
  };
  env.dispatchTo = function (element, type, init) {
    const event = makeEvent(type, init, element);
    callListeners(element && element.listeners ? element.listeners[type] : null, event);
    return event;
  };
  env.setHidden = function (flag) {
    doc.hidden = !!flag;
    doc.visibilityState = flag ? 'hidden' : 'visible';
  };
  env.setSize = function (w, h) {
    win.innerWidth = w;
    win.innerHeight = h;
  };
  env.runFrame = function (ms) {
    const queue = env.raf.splice(0, env.raf.length);
    rafIds.clear();
    for (let i = 0; i < queue.length; i++) queue[i](ms);
  };
  env.runTimers = function () {
    const queue = env.timers.splice(0, env.timers.length);
    for (let i = 0; i < queue.length; i++) if (typeof queue[i].fn === 'function') queue[i].fn();
  };

  // --- constants -------------------------------------------------------------------------------
  let constantsPending = constants !== null && Object.keys(constants).length > 0;
  function applyConstants(file) {
    if (!inner.TG || !inner.TG.C) {
      throw new Error('stubs.load: the constants option needs TG.C, which ' + file + ' did not define');
    }
    const unknown = Object.keys(constants).filter(function (k) {
      return !Object.prototype.hasOwnProperty.call(inner.TG.C, k);
    });
    if (unknown.length > 0) {
      throw new Error('stubs.load: constants names that TG.C does not have: ' + unknown.join(', '));
    }
    const text = JSON.stringify(constants);
    Object.keys(constants).forEach(function (k) {
      if (constants[k] === undefined || JSON.stringify(constants[k]) === undefined) {
        throw new Error('stubs.load: the constant ' + k + ' has no value that can be copied');
      }
    });
    // The copy is built inside the context, so that the new TG.C belongs to the same realm as the old one.
    vm.runInContext(
      '(function (json) {\n' +
      '  var over = JSON.parse(json), copy = {}, k;\n' +
      '  for (k in TG.C) if (Object.prototype.hasOwnProperty.call(TG.C, k)) copy[k] = TG.C[k];\n' +
      '  for (k in over) if (Object.prototype.hasOwnProperty.call(over, k)) copy[k] = over[k];\n' +
      '  function freeze(o) {\n' +
      '    if (o === null || typeof o !== "object" || Object.isFrozen(o)) return o;\n' +
      '    Object.freeze(o);\n' +
      '    Object.getOwnPropertyNames(o).forEach(function (n) { freeze(o[n]); });\n' +
      '    return o;\n' +
      '  }\n' +
      '  TG.C = freeze(copy);\n' +
      '})', context, { filename: 'stubs-constants.js' })(text);
    constantsPending = false;
  }

  // --- files -----------------------------------------------------------------------------------
  files.forEach(function (file) {
    const rel = String(file).replace(/\\/g, '/');
    const abs = path.resolve(ROOT, rel);
    if (!fs.existsSync(abs)) {
      if (!allowMissing) throw new Error('stubs.load: ' + rel + ' does not exist');
      env.missing.push(file);
      return;
    }
    const source = fs.readFileSync(abs, 'utf8');
    try {
      vm.runInContext(source, context, { filename: abs });
    } catch (e) {
      const message = e && e.message ? e.message : String(e);
      const error = new Error('stubs.load: ' + rel + ' failed to load: ' + message);
      error.cause = e;
      if (e && e.stack) error.stack = error.message + '\n' + String(e.stack);
      throw error;
    }
    env.loaded.push(file);
    if (constantsPending && path.basename(rel) === 'core.js') applyConstants(rel);
  });
  if (constantsPending) {
    if (inner.TG && inner.TG.C) applyConstants('the file list');
    else throw new Error('stubs.load: the constants option was given but no file defined TG.C');
  }

  env.TG = inner.TG;
  return env;
}

module.exports = { FILES, ROOT, plain, load };
