// js/gfx.js
// TG.Gfx: sprite frames on cached off-screen canvases, and the plain drawing helpers (WP-C).
// CONTRACT 4.9, 6.1, 6.3 and 13.2.
//
// Only the canvas subset of CONTRACT 13.2 is used: fillStyle ('#rrggbb'), imageSmoothingEnabled,
// fillRect, drawImage with a canvas as the source, createImageData and putImageData.
//
// How a frame is drawn:
//   - The first time a frame is asked for, it is painted onto its own small canvas, with the remap
//     and the flip already applied, and kept under the key name|frame|remap|flipX.
//   - TG.Gfx.draw copies that canvas with the 3 argument form of drawImage, so the picture does not
//     depend on the smoothing setting of the destination context.
//   - For opts.scale above 1 an enlarged copy of the cached frame is kept as well (a private cache),
//     so scaled drawing is also a plain copy.
//
// Nothing here runs at load time. TG.Gfx.init(document) stores the document; canvases are made on
// first use. If init was never called, the first drawing call looks for root.document.
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  var CORAL = 26, INK = 0, WHITE = 4;
  var DITHER_TILE = 128;       // the dither pattern is drawn in tiles of this size (an even number)
  var MAX_SCALE = 8;

  var doc = null;              // the document given to init
  var frames = {};             // 'name|frame|remap|flipX' -> canvas (scale 1)
  var scaled = {};             // 'name|frame|remap|flipX|scale' -> canvas
  var placeholders = {};       // name -> canvas (scale 1)
  var dithers = {};            // colour index -> canvas of DITHER_TILE + 1 by DITHER_TILE
  var warned = {};             // warning key -> true

  function warnOnce(key, message) {
    if (warned[key]) return;
    warned[key] = true;
    if (typeof console !== 'undefined' && console && typeof console.warn === 'function') console.warn(message);
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isIndex(v) {
    return typeof v === 'number' && v >= 0 && v < TG.PAL.length && Math.floor(v) === v;
  }

  function colorOf(index) {
    return isIndex(index) ? TG.PAL[index] : TG.PAL[INK];
  }

  function wholeScale(v) {
    var s = Math.floor(Number(v));
    if (!(s >= 1)) return 1;
    return s > MAX_SCALE ? MAX_SCALE : s;
  }

  // A new canvas of w by h with smoothing turned off, or null when no document is available.
  function makeCanvas(w, h) {
    var d = doc || root.document || null;
    if (!d || typeof d.createElement !== 'function') {
      warnOnce('gfx:nodoc', 'TG.Gfx: no document, so no sprite can be drawn. Call TG.Gfx.init(document) first');
      return null;
    }
    var canvas = d.createElement('canvas');
    if (!canvas || typeof canvas.getContext !== 'function') {
      warnOnce('gfx:nocanvas', 'TG.Gfx: the document cannot make a canvas');
      return null;
    }
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    if (!ctx) {
      warnOnce('gfx:nocontext', 'TG.Gfx: the canvas has no 2D context');
      return null;
    }
    ctx.imageSmoothingEnabled = false;     // set after the size, because setting the size resets the context
    return canvas;
  }

  function definition(name) {
    return (TG.Sprites && typeof TG.Sprites.get === 'function') ? TG.Sprites.get(name) : null;
  }

  function manifestEntry(name) {
    var list = TG.Sprites && TG.Sprites.MANIFEST;
    if (!list) return null;
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }

  // { w, h, frames, ax, ay, fps, names, defined } or null.
  function lookup(name) {
    var def = definition(name);
    if (def) {
      return { w: def.w, h: def.h, frames: def.frames.length, ax: def.anchor[0], ay: def.anchor[1],
        fps: def.fps, names: def.names, defined: true };
    }
    var m = manifestEntry(name);
    if (m) {
      return { w: m.w, h: m.h, frames: m.frames, ax: m.ax, ay: m.ay, fps: m.fps || 0,
        names: m.names || [], defined: false };
    }
    return null;
  }

  function indexOfFrame(info, frame) {
    if (!info) return 0;
    if (typeof frame === 'number') {
      var n = Math.floor(frame);
      return (n >= 0 && n < info.frames) ? n : 0;
    }
    if (typeof frame === 'string' && info.names) {
      for (var i = 0; i < info.names.length; i++) if (info.names[i] === frame) return i;
    }
    return 0;
  }

  // The remap table for a name, or null. An unknown name warns once and is treated as no remap.
  function remapTable(remap) {
    if (remap === undefined || remap === null || remap === '') return null;
    var table = TG.Remaps ? TG.Remaps[remap] : null;
    if (!table || typeof table !== 'object') {
      warnOnce('gfx:remap:' + remap, 'TG.Gfx: there is no remap "' + remap + '"; the sprite is drawn without it');
      return null;
    }
    return table;
  }

  function remapIndex(index, table) {
    if (!table) return index;
    var to = index;
    if (hasOwn(table, String(index))) to = Number(table[String(index)]);
    else if (hasOwn(table, '*')) to = Number(table['*']);
    return isIndex(to) ? to : index;
  }

  // Paints one frame of a definition onto a new canvas. Rows are painted as runs of one colour.
  function paintFrame(def, index, table, flipX) {
    var canvas = makeCanvas(def.w, def.h);
    if (!canvas) return null;
    var ctx = canvas.getContext('2d');
    var rows = def.frames[index];
    var flip = !!flipX;
    if (rows && !Array.isArray(rows)) {          // { copy, flipX }
      if (rows.flipX) flip = !flip;
      rows = def.frames[rows.copy];
    }
    if (!Array.isArray(rows)) return canvas;
    var keys = TG.PAL_KEYS;
    var w = def.w, h = def.h;
    for (var y = 0; y < h; y++) {
      var row = String(rows[y] === undefined ? '' : rows[y]);
      var runStart = 0, runColor = -1;
      for (var x = 0; x <= w; x++) {
        var c = -1;
        if (x < w) {
          var ch = row.charAt(flip ? w - 1 - x : x);
          if (ch !== '' && ch !== '.') c = remapIndex(keys.indexOf(ch), table);
        }
        if (c !== runColor) {
          if (runColor >= 0) {
            ctx.fillStyle = TG.PAL[runColor];
            ctx.fillRect(runStart, y, x - runStart, 1);
          }
          runStart = x;
          runColor = c;
        }
      }
    }
    return canvas;
  }

  // The labelled box that stands for a sprite that is not defined.
  function paintPlaceholder(name, info) {
    var w = info ? info.w : 16, h = info ? info.h : 16;
    var canvas = makeCanvas(w, h);
    if (!canvas) return null;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = TG.PAL[INK];
    ctx.fillRect(0, 0, w, h);
    var label = String(name).slice(0, 2);
    if (TG.Font && typeof TG.Font.draw === 'function') {
      TG.Font.draw(ctx, label, Math.max(1, Math.floor((w - 15) / 2)), Math.max(1, Math.floor((h - 7) / 2)), { color: WHITE });
    }
    ctx.fillStyle = TG.PAL[CORAL];
    ctx.fillRect(0, 0, w, 1);
    ctx.fillRect(0, h - 1, w, 1);
    ctx.fillRect(0, 0, 1, h);
    ctx.fillRect(w - 1, 0, 1, h);
    return canvas;
  }

  function placeholderFor(name, info) {
    warnOnce('gfx:sprite:' + name, 'TG.Gfx: the sprite "' + name + '" is not defined; a placeholder is drawn');
    var key = String(name);
    if (!hasOwn(placeholders, key)) {
      var canvas = paintPlaceholder(name, info);
      if (!canvas) return null;
      placeholders[key] = canvas;
    }
    return placeholders[key];
  }

  // The cached canvas of one frame at scale 1, or the placeholder, or null without a document.
  function frameCanvas(name, frame, remap, flipX) {
    var def = definition(name);
    if (!def) return placeholderFor(name, lookup(name));
    var index = indexOfFrame(lookup(name), frame);
    var table = remapTable(remap);
    var key = name + '|' + index + '|' + (table ? remap : '') + '|' + (flipX ? 1 : 0);
    if (!hasOwn(frames, key)) {
      var canvas = paintFrame(def, index, table, flipX);
      if (!canvas) return null;
      frames[key] = canvas;
    }
    return frames[key];
  }

  // An enlarged copy of a cached canvas.
  function scaledCanvas(key, base, w, h, scale) {
    if (!hasOwn(scaled, key)) {
      var canvas = makeCanvas(w * scale, h * scale);
      if (!canvas) return null;
      canvas.getContext('2d').drawImage(base, 0, 0, w, h, 0, 0, w * scale, h * scale);
      scaled[key] = canvas;
    }
    return scaled[key];
  }

  // The checkerboard of one colour: pixel (i, j) is set when i + j is even.
  function ditherCanvas(colorIndex) {
    var key = String(colorIndex);
    if (!hasOwn(dithers, key)) {
      var w = DITHER_TILE + 1, h = DITHER_TILE;
      var canvas = makeCanvas(w, h);
      if (!canvas) return null;
      var ctx = canvas.getContext('2d');
      var hex = colorOf(colorIndex);
      var n = parseInt(hex.slice(1), 16);
      var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      var image = ctx.createImageData(w, h);
      var data = image.data;
      for (var j = 0; j < h; j++) {
        for (var i = (j & 1); i < w; i += 2) {
          var o = (j * w + i) * 4;
          data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
      dithers[key] = canvas;
    }
    return dithers[key];
  }

  function finite(v) {
    return typeof v === 'number' && isFinite(v);
  }

  TG.Gfx = {
    // doc: document. Stores the canvas factory. Builds nothing yet.
    init: function (d) {
      doc = d || null;
      warned = {};
      TG.Gfx.clearCache();
    },

    // '#rrggbb' from TG.PAL. An index outside 0..31 gives INK.
    color: function (index) {
      return colorOf(index);
    },

    has: function (name) {
      return definition(name) !== null;
    },

    // { w, h, frames, ax, ay, fps, names } from the definition, or from the manifest if the sprite is
    // not defined, or null if the name is in neither.
    info: function (name) {
      var i = lookup(name);
      if (!i) return null;
      return { w: i.w, h: i.h, frames: i.frames, ax: i.ax, ay: i.ay, fps: i.fps, names: i.names ? i.names.slice() : [] };
    },

    // frame: index or frame name; unknown -> 0.
    frameIndex: function (name, frame) {
      return indexOfFrame(lookup(name), frame);
    },

    // Cached off-screen canvas for one frame. opts: { remap, flipX }.
    // For a sprite that is not defined this is the placeholder canvas (and a warning, once per name).
    get: function (name, frame, opts) {
      var o = opts || {};
      return frameCanvas(name, frame, o.remap, !!o.flipX);
    },

    // Draws the frame so that the sprite's anchor lands on (floor(x), floor(y)).
    // opts: { flipX, remap, scale: 1|2|3|4, anchor: boolean (default true; false = x, y is the top-left corner) }
    draw: function (ctx, name, frame, x, y, opts) {
      if (!ctx || !finite(x) || !finite(y)) return;
      var o = opts || {};
      var flipX = !!o.flipX;
      var scale = o.scale === undefined ? 1 : wholeScale(o.scale);
      var info = lookup(name);
      var canvas = frameCanvas(name, frame, o.remap, flipX);
      if (!canvas) return;
      var w = info ? info.w : 16, h = info ? info.h : 16;
      if (scale !== 1) {
        var key;
        if (info && info.defined) {
          key = name + '|' + indexOfFrame(info, frame) + '|' + (remapTable(o.remap) ? o.remap : '') + '|' + (flipX ? 1 : 0) + '|' + scale;
        } else {
          key = '?' + name + '|' + scale;
        }
        canvas = scaledCanvas(key, canvas, w, h, scale);
        if (!canvas) return;
      }
      var ax = 0, ay = 0;
      if (o.anchor !== false && info) {
        ax = flipX ? w - info.ax : info.ax;
        ay = info.ay;
      }
      ctx.drawImage(canvas, Math.floor(x) - Math.floor(ax * scale), Math.floor(y) - Math.floor(ay * scale));
    },

    // Filled rectangle, floored.
    rect: function (ctx, x, y, w, h, colorIndex) {
      if (!ctx || !finite(x) || !finite(y) || !finite(w) || !finite(h)) return;
      var fw = Math.floor(w), fh = Math.floor(h);
      if (fw <= 0 || fh <= 0) return;
      ctx.fillStyle = colorOf(colorIndex);
      ctx.fillRect(Math.floor(x), Math.floor(y), fw, fh);
    },

    // 1 px outline rectangle, inside x, y, w, h.
    frame: function (ctx, x, y, w, h, colorIndex) {
      if (!ctx || !finite(x) || !finite(y) || !finite(w) || !finite(h)) return;
      var fx = Math.floor(x), fy = Math.floor(y), fw = Math.floor(w), fh = Math.floor(h);
      if (fw <= 0 || fh <= 0) return;
      ctx.fillStyle = colorOf(colorIndex);
      if (fw <= 2 || fh <= 2) {
        ctx.fillRect(fx, fy, fw, fh);
        return;
      }
      ctx.fillRect(fx, fy, fw, 1);
      ctx.fillRect(fx, fy + fh - 1, fw, 1);
      ctx.fillRect(fx, fy + 1, 1, fh - 2);
      ctx.fillRect(fx + fw - 1, fy + 1, 1, fh - 2);
    },

    // Checkerboard of single pixels. The pixel at (px, py) is painted when px + py + phase is even,
    // so two dithered areas that touch continue the same pattern, and phase 0 and 1 are the two halves.
    dither: function (ctx, x, y, w, h, colorIndex, phase) {
      if (!ctx || !finite(x) || !finite(y) || !finite(w) || !finite(h)) return;
      var fx = Math.floor(x), fy = Math.floor(y), fw = Math.floor(w), fh = Math.floor(h);
      if (fw <= 0 || fh <= 0) return;
      var pattern = ditherCanvas(colorIndex);
      if (!pattern) return;
      var p = phase ? 1 : 0;
      var sx = (((fx + fy + p) % 2) + 2) % 2;
      for (var ty = 0; ty < fh; ty += DITHER_TILE) {
        var th = Math.min(DITHER_TILE, fh - ty);
        for (var tx = 0; tx < fw; tx += DITHER_TILE) {
          var tw = Math.min(DITHER_TILE, fw - tx);
          ctx.drawImage(pattern, sx, 0, tw, th, fx + tx, fy + ty, tw, th);
        }
      }
    },

    // Forgets every cached canvas. The "warned once" marks are kept, so a missing sprite does not warn again.
    clearCache: function () {
      frames = {};
      scaled = {};
      placeholders = {};
      dithers = {};
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
