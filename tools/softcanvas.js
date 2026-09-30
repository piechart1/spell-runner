// tools/softcanvas.js
// A software canvas for Node: it really draws, so that a picture can be written to a PNG and looked at.
// CONTRACT 13.2. No npm packages.
//
//   const soft = require('./tools/softcanvas');
//   const canvas = soft.createCanvas(384, 216);
//   const ctx = canvas.getContext('2d');
//   ctx.fillStyle = '#5c94fc';
//   ctx.fillRect(0, 0, 384, 216);
//   const rgba = canvas.toRGBA();              // Uint8ClampedArray, width * height * 4, a copy
//   require('./tools/png').write('out.png', canvas.width, canvas.height, rgba);
//
// The context implements the canvas subset of CONTRACT 13.2 and nothing else:
//
//   properties  fillStyle ('#rrggbb' only), imageSmoothingEnabled, globalAlpha (must stay 1), canvas
//   methods     fillRect, clearRect,
//               drawImage(canvas, dx, dy)
//               drawImage(canvas, dx, dy, dw, dh)
//               drawImage(canvas, sx, sy, sw, sh, dx, dy, dw, dh)      nearest neighbour, sizes above 0
//               save, restore, translate (whole pixels), setTransform(1, 0, 0, 1, 0, 0),
//               createImageData, getImageData, putImageData
//
// Anything else throws an Error that names the method or property, so a mistake is found at once:
//   - a method outside the subset (fillText, strokeRect, scale, rotate, clip, paths, gradients ...);
//   - a property outside the subset (strokeStyle, font, globalCompositeOperation ...), or a new property;
//   - a fillStyle that is not '#rrggbb', a globalAlpha other than 1;
//   - a coordinate or size that is not a whole number (the browser would blur it);
//   - drawImage with a negative size, or with scaling while imageSmoothingEnabled is true
//     (the browser would smooth it; set imageSmoothingEnabled = false first).
//
// As in a browser, setting canvas.width or canvas.height clears the picture and returns the context to
// its starting state (fillStyle '#000000', imageSmoothingEnabled true, no translation).
'use strict';

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

const WHERE = ' (tools/softcanvas.js implements only the canvas subset of CONTRACT 13.2)';

// Methods of CanvasRenderingContext2D that are outside the subset. Each throws when called.
const OUTSIDE_METHODS = [
  'arc', 'arcTo', 'beginPath', 'bezierCurveTo', 'clip', 'closePath', 'createConicGradient',
  'createLinearGradient', 'createPattern', 'createRadialGradient', 'drawFocusIfNeeded', 'ellipse', 'fill',
  'fillText', 'getContextAttributes', 'getLineDash', 'getTransform', 'isContextLost', 'isPointInPath',
  'isPointInStroke', 'lineTo', 'measureText', 'moveTo', 'quadraticCurveTo', 'rect', 'reset',
  'resetTransform', 'rotate', 'roundRect', 'scale', 'setLineDash', 'stroke', 'strokeRect', 'strokeText',
  'transform'
];

// Properties of CanvasRenderingContext2D that are outside the subset. Reading gives the browser's
// starting value; writing throws.
const OUTSIDE_PROPERTIES = {
  strokeStyle: '#000000', font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
  direction: 'ltr', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', miterLimit: 10, lineDashOffset: 0,
  shadowBlur: 0, shadowColor: 'rgba(0, 0, 0, 0)', shadowOffsetX: 0, shadowOffsetY: 0,
  globalCompositeOperation: 'source-over', filter: 'none', fontKerning: 'auto', letterSpacing: '0px',
  wordSpacing: '0px', fontStretch: 'normal', fontVariantCaps: 'normal', textRendering: 'auto'
};

// Properties that may be written and have no effect here or in a current browser.
const INERT_PROPERTIES = ['imageSmoothingQuality', 'mozImageSmoothingEnabled', 'webkitImageSmoothingEnabled',
  'msImageSmoothingEnabled', 'oImageSmoothingEnabled'];

const internals = new WeakMap();   // canvas -> { width, height, data, data32 }

function fail(message) {
  throw new Error('softcanvas: ' + message + WHERE);
}

function pack(r, g, b, a) {
  return LITTLE_ENDIAN
    ? ((a << 24) | (b << 16) | (g << 8) | r) >>> 0
    : ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

const colorCache = new Map();      // '#rrggbb' as written -> packed colour

function parseColor(value) {
  const known = colorCache.get(value);
  if (known !== undefined) return known;
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    fail('fillStyle must be a string of the form #rrggbb, got ' + JSON.stringify(value));
  }
  const n = parseInt(value.slice(1), 16);
  const packed = pack((n >> 16) & 255, (n >> 8) & 255, n & 255, 255);
  colorCache.set(value, packed);
  return packed;
}

function whole(method, name, v) {
  if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v) {
    fail(method + '(): ' + name + ' must be a whole number, got ' + String(v));
  }
  return v;
}

function isSoftCanvas(obj) {
  return obj !== null && typeof obj === 'object' && internals.has(obj);
}

function toSize(name, v) {
  const n = Number(v);
  if (!isFinite(n) || n < 0) fail('canvas.' + name + ' must be a number of 0 or more, got ' + String(v));
  return Math.floor(n);
}

// options.onCall(methodName): called for every context method call (used by test/stubs.js to count).
function createCanvas(w, h, options) {
  const onCall = options && typeof options.onCall === 'function' ? options.onCall : null;
  const canvas = {};
  const store = { width: 0, height: 0, data: null, data32: null };
  let ctx = null;
  let resetContext = function () {};

  function allocate(width, height) {
    store.width = width;
    store.height = height;
    const buffer = new ArrayBuffer(width * height * 4);
    store.data = new Uint8ClampedArray(buffer);
    store.data32 = new Uint32Array(buffer);
    resetContext();
  }

  allocate(toSize('width', w === undefined ? 300 : w), toSize('height', h === undefined ? 150 : h));
  internals.set(canvas, store);

  Object.defineProperty(canvas, 'width', {
    enumerable: true,
    get: function () { return store.width; },
    set: function (v) { allocate(toSize('width', v), store.height); }
  });
  Object.defineProperty(canvas, 'height', {
    enumerable: true,
    get: function () { return store.height; },
    set: function (v) { allocate(store.width, toSize('height', v)); }
  });

  canvas.style = {};
  canvas.isSoftCanvas = true;

  // A copy of the pixels: width * height * 4 bytes, row by row from the top, not premultiplied.
  canvas.toRGBA = function () {
    return new Uint8ClampedArray(store.data);
  };

  canvas.getContext = function (type) {
    if (type !== '2d') return null;
    if (!ctx) ctx = createContext();
    return ctx;
  };

  function createContext() {
    const c = {};
    let fillStyle = '#000000';
    let fillColor = pack(0, 0, 0, 255);
    let smoothing = true;
    let tx = 0, ty = 0;
    let stack = [];
    const inert = {};

    resetContext = function () {
      fillStyle = '#000000';
      fillColor = pack(0, 0, 0, 255);
      smoothing = true;
      tx = 0;
      ty = 0;
      stack = [];
    };

    function count(name) {
      if (onCall) onCall(name);
    }

    // Fills the rectangle (already in canvas pixels) with one packed colour, clipped to the canvas.
    function fillPixels(x, y, w2, h2, color) {
      if (w2 < 0) { x += w2; w2 = -w2; }
      if (h2 < 0) { y += h2; h2 = -h2; }
      const x0 = Math.max(0, x), y0 = Math.max(0, y);
      const x1 = Math.min(store.width, x + w2), y1 = Math.min(store.height, y + h2);
      if (x1 <= x0 || y1 <= y0) return;
      const d = store.data32, W = store.width;
      for (let yy = y0; yy < y1; yy++) d.fill(color, yy * W + x0, yy * W + x1);
    }

    function blendPixel(d8, offset, src) {
      const sr = LITTLE_ENDIAN ? src & 255 : (src >>> 24) & 255;
      const sg = LITTLE_ENDIAN ? (src >>> 8) & 255 : (src >>> 16) & 255;
      const sb = LITTLE_ENDIAN ? (src >>> 16) & 255 : (src >>> 8) & 255;
      const sa = (LITTLE_ENDIAN ? (src >>> 24) & 255 : src & 255) / 255;
      const da = d8[offset + 3] / 255;
      const oa = sa + da * (1 - sa);
      if (oa <= 0) return;
      d8[offset] = Math.round((sr * sa + d8[offset] * da * (1 - sa)) / oa);
      d8[offset + 1] = Math.round((sg * sa + d8[offset + 1] * da * (1 - sa)) / oa);
      d8[offset + 2] = Math.round((sb * sa + d8[offset + 2] * da * (1 - sa)) / oa);
      d8[offset + 3] = Math.round(oa * 255);
    }

    Object.defineProperty(c, 'canvas', { enumerable: true, get: function () { return canvas; } });

    Object.defineProperty(c, 'fillStyle', {
      enumerable: true,
      get: function () { return fillStyle; },
      set: function (v) {
        fillColor = parseColor(v);
        fillStyle = v.toLowerCase();
      }
    });

    Object.defineProperty(c, 'globalAlpha', {
      enumerable: true,
      get: function () { return 1; },
      set: function (v) {
        if (v !== 1) fail('globalAlpha must stay 1, got ' + String(v));
      }
    });

    Object.defineProperty(c, 'imageSmoothingEnabled', {
      enumerable: true,
      get: function () { return smoothing; },
      set: function (v) { smoothing = !!v; }
    });

    INERT_PROPERTIES.forEach(function (name) {
      Object.defineProperty(c, name, {
        enumerable: false,
        get: function () { return inert[name]; },
        set: function (v) { inert[name] = v; }
      });
    });

    Object.keys(OUTSIDE_PROPERTIES).forEach(function (name) {
      Object.defineProperty(c, name, {
        enumerable: false,
        get: function () { return OUTSIDE_PROPERTIES[name]; },
        set: function () { fail('the property ' + name + ' is outside the subset'); }
      });
    });

    OUTSIDE_METHODS.forEach(function (name) {
      c[name] = function () { fail(name + '() is outside the subset'); };
    });

    c.fillRect = function (x, y, w2, h2) {
      count('fillRect');
      whole('fillRect', 'x', x); whole('fillRect', 'y', y); whole('fillRect', 'w', w2); whole('fillRect', 'h', h2);
      fillPixels(x + tx, y + ty, w2, h2, fillColor);
    };

    c.clearRect = function (x, y, w2, h2) {
      count('clearRect');
      whole('clearRect', 'x', x); whole('clearRect', 'y', y); whole('clearRect', 'w', w2); whole('clearRect', 'h', h2);
      fillPixels(x + tx, y + ty, w2, h2, 0);
    };

    c.drawImage = function (image) {
      count('drawImage');
      if (!isSoftCanvas(image)) {
        fail('drawImage(): the source must be a canvas made by tools/softcanvas.js');
      }
      const src = internals.get(image);
      if (src.width === 0 || src.height === 0) fail('drawImage(): the source canvas has no pixels (' + src.width + ' x ' + src.height + ')');

      let sx = 0, sy = 0, sw = src.width, sh = src.height, dx, dy, dw, dh;
      const n = arguments.length;
      if (n === 3) {
        dx = arguments[1]; dy = arguments[2]; dw = sw; dh = sh;
      } else if (n === 5) {
        dx = arguments[1]; dy = arguments[2]; dw = arguments[3]; dh = arguments[4];
      } else if (n === 9) {
        sx = arguments[1]; sy = arguments[2]; sw = arguments[3]; sh = arguments[4];
        dx = arguments[5]; dy = arguments[6]; dw = arguments[7]; dh = arguments[8];
      } else {
        fail('drawImage() takes 3, 5 or 9 arguments, got ' + n);
      }
      whole('drawImage', 'sx', sx); whole('drawImage', 'sy', sy); whole('drawImage', 'sw', sw); whole('drawImage', 'sh', sh);
      whole('drawImage', 'dx', dx); whole('drawImage', 'dy', dy); whole('drawImage', 'dw', dw); whole('drawImage', 'dh', dh);
      if (sw < 0 || sh < 0 || dw < 0 || dh < 0) {
        fail('drawImage(): sizes must be above 0, got source ' + sw + ' x ' + sh + ' and destination ' + dw + ' x ' + dh +
          '. A flipped sprite is made when its frame is cached, not with a negative size');
      }
      if (sw === 0 || sh === 0 || dw === 0 || dh === 0) return;     // nothing to paint, as in a browser
      const scaled = dw !== sw || dh !== sh;
      if (scaled && smoothing) {
        fail('drawImage(): scaling from ' + sw + ' x ' + sh + ' to ' + dw + ' x ' + dh +
          ' while imageSmoothingEnabled is true. Set imageSmoothingEnabled = false on this context first');
      }

      const W = store.width, H = store.height;
      const left = dx + tx, top = dy + ty;
      const i0 = Math.max(0, -left), i1 = Math.min(dw, W - left);
      const j0 = Math.max(0, -top), j1 = Math.min(dh, H - top);
      if (i1 <= i0 || j1 <= j0) return;

      // Drawing a canvas onto itself reads from a copy.
      const s32 = image === canvas ? new Uint32Array(src.data32) : src.data32;
      const d32 = store.data32, d8 = store.data;
      const SW = src.width, SH = src.height;

      if (!scaled) {
        // One source pixel for each destination pixel. Columns and rows outside the source are left out.
        const a0 = Math.max(i0, -sx), a1 = Math.min(i1, SW - sx);
        const b0 = Math.max(j0, -sy), b1 = Math.min(j1, SH - sy);
        for (let j = b0; j < b1; j++) {
          const srcRow = (sy + j) * SW + sx;
          const dstRow = (top + j) * W + left;
          for (let i = a0; i < a1; i++) {
            const p = s32[srcRow + i];
            const a = LITTLE_ENDIAN ? p >>> 24 : p & 255;
            if (a === 255) d32[dstRow + i] = p;
            else if (a !== 0) blendPixel(d8, (dstRow + i) * 4, p);
          }
        }
        return;
      }

      // Scaled: the source column for each destination column; -1 when it lies outside the source canvas.
      const cols = new Int32Array(i1 - i0);
      for (let i = i0; i < i1; i++) {
        const cx = sx + Math.floor((i + 0.5) * sw / dw);
        cols[i - i0] = (cx >= 0 && cx < SW) ? cx : -1;
      }

      for (let j = j0; j < j1; j++) {
        const cy = sy + Math.floor((j + 0.5) * sh / dh);
        if (cy < 0 || cy >= SH) continue;
        const srcRow = cy * SW;
        const dstRow = (top + j) * W + left;
        for (let i = i0; i < i1; i++) {
          const cx = cols[i - i0];
          if (cx < 0) continue;
          const p = s32[srcRow + cx];
          const a = LITTLE_ENDIAN ? p >>> 24 : p & 255;
          if (a === 255) d32[dstRow + i] = p;
          else if (a !== 0) blendPixel(d8, (dstRow + i) * 4, p);
        }
      }
    };

    c.save = function () {
      count('save');
      stack.push({ fillStyle: fillStyle, fillColor: fillColor, smoothing: smoothing, tx: tx, ty: ty });
    };

    c.restore = function () {
      count('restore');
      const s = stack.pop();
      if (!s) return;                 // nothing saved: no effect, as in a browser
      fillStyle = s.fillStyle;
      fillColor = s.fillColor;
      smoothing = s.smoothing;
      tx = s.tx;
      ty = s.ty;
    };

    c.translate = function (x, y) {
      count('translate');
      whole('translate', 'x', x); whole('translate', 'y', y);
      tx += x;
      ty += y;
    };

    c.setTransform = function (a, b, c2, d, e, f) {
      count('setTransform');
      if (arguments.length !== 6 || a !== 1 || b !== 0 || c2 !== 0 || d !== 1 || e !== 0 || f !== 0) {
        fail('setTransform(): only setTransform(1, 0, 0, 1, 0, 0) is in the subset, got (' +
          Array.prototype.slice.call(arguments).join(', ') + ')');
      }
      tx = 0;
      ty = 0;
    };

    c.createImageData = function (a, b) {
      count('createImageData');
      let w2, h2;
      if (a !== null && typeof a === 'object') {
        w2 = a.width; h2 = a.height;
      } else {
        w2 = Math.abs(whole('createImageData', 'width', a));
        h2 = Math.abs(whole('createImageData', 'height', b));
      }
      if (!(w2 > 0) || !(h2 > 0)) fail('createImageData(): width and height must not be 0');
      return { width: w2, height: h2, data: new Uint8ClampedArray(w2 * h2 * 4) };
    };

    // Reads canvas pixels. The translation does not apply, as in a browser.
    c.getImageData = function (x, y, w2, h2) {
      count('getImageData');
      whole('getImageData', 'x', x); whole('getImageData', 'y', y);
      whole('getImageData', 'w', w2); whole('getImageData', 'h', h2);
      if (w2 === 0 || h2 === 0) fail('getImageData(): width and height must not be 0');
      if (w2 < 0) { x += w2; w2 = -w2; }
      if (h2 < 0) { y += h2; h2 = -h2; }
      const out = new Uint8ClampedArray(w2 * h2 * 4);
      const W = store.width, H = store.height, d = store.data;
      for (let j = 0; j < h2; j++) {
        const yy = y + j;
        if (yy < 0 || yy >= H) continue;
        for (let i = 0; i < w2; i++) {
          const xx = x + i;
          if (xx < 0 || xx >= W) continue;
          const s = (yy * W + xx) * 4, o = (j * w2 + i) * 4;
          out[o] = d[s]; out[o + 1] = d[s + 1]; out[o + 2] = d[s + 2]; out[o + 3] = d[s + 3];
        }
      }
      return { width: w2, height: h2, data: out };
    };

    // Writes pixels as they are (no blending). The translation does not apply, as in a browser.
    c.putImageData = function (imageData, dx, dy, dirtyX, dirtyY, dirtyW, dirtyH) {
      count('putImageData');
      if (!imageData || typeof imageData !== 'object' || !imageData.data ||
          imageData.data.length !== imageData.width * imageData.height * 4) {
        fail('putImageData(): the first argument must be { width, height, data } with width * height * 4 bytes');
      }
      if (arguments.length !== 3 && arguments.length !== 7) {
        fail('putImageData() takes 3 or 7 arguments, got ' + arguments.length);
      }
      whole('putImageData', 'dx', dx); whole('putImageData', 'dy', dy);
      let rx = 0, ry = 0, rw = imageData.width, rh = imageData.height;
      if (arguments.length === 7) {
        rx = whole('putImageData', 'dirtyX', dirtyX); ry = whole('putImageData', 'dirtyY', dirtyY);
        rw = whole('putImageData', 'dirtyWidth', dirtyW); rh = whole('putImageData', 'dirtyHeight', dirtyH);
        if (rw < 0) { rx += rw; rw = -rw; }
        if (rh < 0) { ry += rh; rh = -rh; }
        if (rx < 0) { rw += rx; rx = 0; }
        if (ry < 0) { rh += ry; ry = 0; }
        if (rx + rw > imageData.width) rw = imageData.width - rx;
        if (ry + rh > imageData.height) rh = imageData.height - ry;
      }
      const W = store.width, H = store.height, d = store.data, s = imageData.data;
      for (let j = ry; j < ry + rh; j++) {
        const yy = dy + j;
        if (yy < 0 || yy >= H) continue;
        for (let i = rx; i < rx + rw; i++) {
          const xx = dx + i;
          if (xx < 0 || xx >= W) continue;
          const o = (yy * W + xx) * 4, p = (j * imageData.width + i) * 4;
          d[o] = s[p]; d[o + 1] = s[p + 1]; d[o + 2] = s[p + 2]; d[o + 3] = s[p + 3];
        }
      }
    };

    // A new property is a mistake (in strict mode code the assignment throws and names the property).
    Object.preventExtensions(c);
    return c;
  }

  return canvas;
}

// Enlarges RGBA pixels by a whole factor, nearest neighbour. Returns { width, height, rgba }.
function scaleRGBA(rgba, width, height, factor) {
  if (!Number.isInteger(factor) || factor < 1) throw new Error('softcanvas: scaleRGBA needs a whole factor of 1 or more, got ' + factor);
  if (!rgba || rgba.length !== width * height * 4) throw new Error('softcanvas: scaleRGBA expected ' + (width * height * 4) + ' bytes');
  const W = width * factor, H = height * factor;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sy = Math.floor(y / factor);
    for (let x = 0; x < W; x++) {
      const s = (sy * width + Math.floor(x / factor)) * 4, o = (y * W + x) * 4;
      out[o] = rgba[s]; out[o + 1] = rgba[s + 1]; out[o + 2] = rgba[s + 2]; out[o + 3] = rgba[s + 3];
    }
  }
  return { width: W, height: H, rgba: out };
}

module.exports = {
  createCanvas,
  isSoftCanvas,
  scaleRGBA,
  SUBSET_METHODS: ['fillRect', 'clearRect', 'drawImage', 'save', 'restore', 'translate', 'setTransform',
    'createImageData', 'getImageData', 'putImageData'],
  OUTSIDE_METHODS: OUTSIDE_METHODS.slice()
};
