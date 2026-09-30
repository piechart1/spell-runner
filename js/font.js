// js/font.js
// TG.Font: the 8x8 bitmap font (WP-C). CONTRACT 4.10, DESIGN 14.7.
//
// Every glyph is 8 rows of 8 characters ('#' = pixel, '.' = empty) and is drawn within the top-left
// 7x7 of its cell, so the last column and the last row of every cell are empty and letters never touch.
// Vertical strokes are 2 px wide throughout, which keeps the letters legible at 1x on a word plate.
//
// Glyphs are painted once per colour and scale onto an off-screen sheet (16 glyphs per row) and copied
// from there, so drawing text is one drawImage per character. Only the canvas subset of CONTRACT 13.2
// is used.
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  var CELL = 8;
  var SHEET_COLS = 16;
  var MAX_SCALE = 8;
  var INK = 0, WHITE = 4;

  var SYM = { UP: '^', DOWN: '_', LEFT: '<', RIGHT: '>', CHEV_UP: '{', CHEV_DOWN: '}',
    HEART: '@', STAR: '&', DROP: '$', BLOCK: '|', RETURN: '~' };

  var GLYPHS = {
    'A': ['..###...', '.##.##..', '##...##.', '##...##.', '#######.', '##...##.', '##...##.', '........'],
    'B': ['######..', '##...##.', '##...##.', '######..', '##...##.', '##...##.', '######..', '........'],
    'C': ['..####..', '.##..##.', '##......', '##......', '##......', '.##..##.', '..####..', '........'],
    'D': ['#####...', '##..##..', '##...##.', '##...##.', '##...##.', '##..##..', '#####...', '........'],
    'E': ['#######.', '##......', '##......', '######..', '##......', '##......', '#######.', '........'],
    'F': ['#######.', '##......', '##......', '######..', '##......', '##......', '##......', '........'],
    'G': ['..#####.', '.##.....', '##......', '##..###.', '##...##.', '.##..##.', '..#####.', '........'],
    'H': ['##...##.', '##...##.', '##...##.', '#######.', '##...##.', '##...##.', '##...##.', '........'],
    'I': ['.######.', '...##...', '...##...', '...##...', '...##...', '...##...', '.######.', '........'],
    'J': ['.....##.', '.....##.', '.....##.', '.....##.', '##...##.', '##...##.', '.#####..', '........'],
    'K': ['##...##.', '##..##..', '##.##...', '####....', '##.##...', '##..##..', '##...##.', '........'],
    'L': ['##......', '##......', '##......', '##......', '##......', '##......', '#######.', '........'],
    'M': ['##...##.', '###.###.', '#######.', '##.#.##.', '##...##.', '##...##.', '##...##.', '........'],
    'N': ['##...##.', '###..##.', '####.##.', '##.####.', '##..###.', '##...##.', '##...##.', '........'],
    'O': ['.#####..', '##...##.', '##...##.', '##...##.', '##...##.', '##...##.', '.#####..', '........'],
    'P': ['######..', '##...##.', '##...##.', '######..', '##......', '##......', '##......', '........'],
    'Q': ['.#####..', '##...##.', '##...##.', '##...##.', '##.#.##.', '##..##..', '.###.##.', '........'],
    'R': ['######..', '##...##.', '##...##.', '######..', '##.##...', '##..##..', '##...##.', '........'],
    'S': ['.#####..', '##...##.', '##......', '.#####..', '.....##.', '##...##.', '.#####..', '........'],
    'T': ['.######.', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...', '........'],
    'U': ['##...##.', '##...##.', '##...##.', '##...##.', '##...##.', '##...##.', '.#####..', '........'],
    'V': ['##...##.', '##...##.', '##...##.', '##...##.', '.##.##..', '..###...', '...#....', '........'],
    'W': ['##...##.', '##...##.', '##...##.', '##.#.##.', '#######.', '###.###.', '##...##.', '........'],
    'X': ['##...##.', '###.###.', '.#####..', '..###...', '.#####..', '###.###.', '##...##.', '........'],
    'Y': ['.##..##.', '.##..##.', '.##..##.', '..####..', '...##...', '...##...', '...##...', '........'],
    'Z': ['#######.', '....###.', '...###..', '..###...', '.###....', '###.....', '#######.', '........'],

    '0': ['..###...', '.##.##..', '##..###.', '##.#.##.', '###..##.', '.##.##..', '..###...', '........'],
    '1': ['...##...', '..###...', '...##...', '...##...', '...##...', '...##...', '.######.', '........'],
    '2': ['.#####..', '##...##.', '....###.', '..####..', '.####...', '###.....', '#######.', '........'],
    '3': ['.######.', '....##..', '...##...', '..####..', '.....##.', '##...##.', '.#####..', '........'],
    '4': ['...###..', '..####..', '.##.##..', '##..##..', '#######.', '....##..', '....##..', '........'],
    '5': ['######..', '##......', '######..', '.....##.', '.....##.', '##...##.', '.#####..', '........'],
    '6': ['..####..', '.##.....', '##......', '######..', '##...##.', '##...##.', '.#####..', '........'],
    '7': ['#######.', '.....##.', '....##..', '...##...', '..##....', '..##....', '..##....', '........'],
    '8': ['.####...', '##..##..', '##..##..', '.#####..', '##...##.', '##...##.', '.#####..', '........'],
    '9': ['.#####..', '##...##.', '##...##.', '.######.', '.....##.', '....##..', '.####...', '........'],

    ' ': ['........', '........', '........', '........', '........', '........', '........', '........'],
    '.': ['........', '........', '........', '........', '........', '..##....', '..##....', '........'],
    ',': ['........', '........', '........', '........', '..##....', '..##....', '.##.....', '........'],
    '!': ['...##...', '...##...', '...##...', '...##...', '...##...', '........', '...##...', '........'],
    '?': ['.#####..', '##...##.', '....###.', '...###..', '...##...', '........', '...##...', '........'],
    ':': ['........', '...##...', '...##...', '........', '...##...', '...##...', '........', '........'],
    ';': ['........', '...##...', '...##...', '........', '...##...', '...##...', '..##....', '........'],
    '\'': ['...##...', '...##...', '..##....', '........', '........', '........', '........', '........'],
    '"': ['.##.##..', '.##.##..', '.#..#...', '........', '........', '........', '........', '........'],
    '-': ['........', '........', '........', '.######.', '........', '........', '........', '........'],
    '+': ['........', '...##...', '...##...', '.######.', '...##...', '...##...', '........', '........'],
    '/': ['......#.', '.....##.', '....##..', '...##...', '..##....', '.##.....', '.#......', '........'],
    '%': ['.##...#.', '.##..##.', '....##..', '...##...', '..##....', '.##..##.', '.#...##.', '........'],
    '(': ['....##..', '...##...', '..##....', '..##....', '..##....', '...##...', '....##..', '........'],
    ')': ['..##....', '...##...', '....##..', '....##..', '....##..', '...##...', '..##....', '........'],
    '=': ['........', '........', '.######.', '........', '.######.', '........', '........', '........'],
    '*': ['...#....', '.#.#.#..', '..###...', '#######.', '..###...', '.#.#.#..', '...#....', '........'],
    '#': ['.##.##..', '.##.##..', '#######.', '.##.##..', '#######.', '.##.##..', '.##.##..', '........'],

    // Special glyphs, reached through TG.Font.SYM.
    '^': ['...#....', '..###...', '.#####..', '#######.', '..###...', '..###...', '..###...', '........'],   // UP
    '_': ['..###...', '..###...', '..###...', '#######.', '.#####..', '..###...', '...#....', '........'],   // DOWN
    '<': ['...#....', '..##....', '.######.', '#######.', '.######.', '..##....', '...#....', '........'],   // LEFT
    '>': ['...#....', '...##...', '######..', '#######.', '######..', '...##...', '...#....', '........'],   // RIGHT
    '{': ['........', '...#....', '..###...', '.#####..', '###.###.', '##...##.', '........', '........'],   // CHEV_UP
    '}': ['........', '##...##.', '###.###.', '.#####..', '..###...', '...#....', '........', '........'],   // CHEV_DOWN
    '@': ['.##.##..', '#######.', '#######.', '#######.', '.#####..', '..###...', '...#....', '........'],   // HEART
    '&': ['...#....', '..###...', '#######.', '.#####..', '..###...', '.##.##..', '.#...#..', '........'],   // STAR
    '$': ['...#....', '...#....', '..###...', '.#####..', '.#####..', '.#####..', '..###...', '........'],   // DROP
    '|': ['#######.', '#######.', '#######.', '#######.', '#######.', '#######.', '#######.', '........'],   // BLOCK
    '~': ['.....##.', '.....##.', '..#..##.', '.##..##.', '#######.', '.##.....', '..#.....', '........']    // RETURN
  };

  // Place of every glyph on the sheets.
  var ORDER = Object.keys(GLYPHS);
  var PLACE = {};
  for (var n = 0; n < ORDER.length; n++) PLACE[ORDER[n]] = n;
  var SHEET_ROWS = Math.ceil(ORDER.length / SHEET_COLS);

  var sheets = {};             // 'colour|scale' -> canvas
  var warned = {};

  function warnOnce(key, message) {
    if (warned[key]) return;
    warned[key] = true;
    if (typeof console !== 'undefined' && console && typeof console.warn === 'function') console.warn(message);
  }

  function isIndex(v) {
    return typeof v === 'number' && v >= 0 && v < TG.PAL.length && Math.floor(v) === v;
  }

  function wholeScale(v) {
    var s = Math.floor(Number(v));
    if (!(s >= 1)) return 1;
    return s > MAX_SCALE ? MAX_SCALE : s;
  }

  // The character whose glyph is drawn for ch: capitals for small letters, '?' for anything unknown.
  function glyphKey(ch) {
    var c = String(ch).charAt(0);
    if (Object.prototype.hasOwnProperty.call(GLYPHS, c)) return c;
    var up = c.toUpperCase();
    if (up.length === 1 && Object.prototype.hasOwnProperty.call(GLYPHS, up)) return up;
    return '?';
  }

  // TG.Font has no init function, so the sheet is made by the document of the canvas that is being
  // drawn on, or by root.document. This happens on the first draw call, never at load time.
  function makeCanvas(ctx, w, h) {
    var d = (ctx && ctx.canvas && ctx.canvas.ownerDocument) || root.document || null;
    if (!d || typeof d.createElement !== 'function') {
      warnOnce('font:nodoc', 'TG.Font: no document, so no text can be drawn');
      return null;
    }
    var canvas = d.createElement('canvas');
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    canvas.width = w;
    canvas.height = h;
    var c2 = canvas.getContext('2d');
    if (!c2) return null;
    c2.imageSmoothingEnabled = false;
    return canvas;
  }

  // rowColors: array of 8 palette indices, or null for one colour.
  function sheetFor(ctx, colorIndex, rowColors, scale) {
    var key = (rowColors ? 'r' + rowColors.join(',') : String(colorIndex)) + '|' + scale;
    if (Object.prototype.hasOwnProperty.call(sheets, key)) return sheets[key];
    var size = CELL * scale;
    var canvas = makeCanvas(ctx, SHEET_COLS * size, SHEET_ROWS * size);
    if (!canvas) return null;
    var c2 = canvas.getContext('2d');
    for (var g = 0; g < ORDER.length; g++) {
      var rows = GLYPHS[ORDER[g]];
      var ox = (g % SHEET_COLS) * size, oy = Math.floor(g / SHEET_COLS) * size;
      for (var y = 0; y < CELL; y++) {
        var row = rows[y];
        c2.fillStyle = TG.PAL[rowColors ? rowColors[y] : colorIndex];
        var start = -1;
        for (var x = 0; x <= CELL; x++) {
          var on = x < CELL && row.charAt(x) === '#';
          if (on && start < 0) start = x;
          if (!on && start >= 0) {
            c2.fillRect(ox + start * scale, oy + y * scale, (x - start) * scale, scale);
            start = -1;
          }
        }
      }
    }
    sheets[key] = canvas;
    return canvas;
  }

  function cleanRowColors(list) {
    if (!Array.isArray(list) || list.length === 0) return null;
    var out = [];
    for (var i = 0; i < CELL; i++) {
      var v = list[i < list.length ? i : list.length - 1];
      out.push(isIndex(v) ? v : WHITE);
    }
    return out;
  }

  function blit(ctx, sheet, key, x, y, scale) {
    var size = CELL * scale;
    var place = PLACE[key];
    ctx.drawImage(sheet, (place % SHEET_COLS) * size, Math.floor(place / SHEET_COLS) * size, size, size, x, y, size, size);
  }

  function drawRun(ctx, text, x, y, colorIndex, rowColors, scale) {
    var sheet = sheetFor(ctx, colorIndex, rowColors, scale);
    if (!sheet) return;
    var size = CELL * scale;
    for (var i = 0; i < text.length; i++) {
      var key = glyphKey(text.charAt(i));
      if (key !== ' ') blit(ctx, sheet, key, x + i * size, y, scale);
    }
  }

  TG.Font = {
    CELL: CELL,
    SYM: SYM,

    // True when ch has a glyph of its own (small letters count, because they are drawn as capitals).
    has: function (ch) {
      if (typeof ch !== 'string' || ch.length !== 1) return false;
      if (Object.prototype.hasOwnProperty.call(GLYPHS, ch)) return true;
      var up = ch.toUpperCase();
      return up.length === 1 && Object.prototype.hasOwnProperty.call(GLYPHS, up);
    },

    // text.length * 8 * (scale || 1)
    measure: function (text, scale) {
      return String(text === undefined || text === null ? '' : text).length * CELL * (scale ? wholeScale(scale) : 1);
    },

    // x, y: top-left of the first cell, floored.
    // opts: { color: index (default WHITE), scale: 1|2|4 (default 1), align: 'left'|'center'|'right',
    //         shadow: boolean (INK copy offset by scale px right and down), rowColors: [8 indices] }
    draw: function (ctx, text, x, y, opts) {
      if (!ctx || typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return;
      var str = String(text === undefined || text === null ? '' : text);
      if (str.length === 0) return;
      var o = opts || {};
      var scale = o.scale === undefined ? 1 : wholeScale(o.scale);
      var color = isIndex(o.color) ? o.color : WHITE;
      var rowColors = cleanRowColors(o.rowColors);
      var width = str.length * CELL * scale;
      var left = Math.floor(x);
      if (o.align === 'center') left = Math.floor(x) - Math.floor(width / 2);
      else if (o.align === 'right') left = Math.floor(x) - width;
      var top = Math.floor(y);
      if (o.shadow) drawRun(ctx, str, left + scale, top + scale, INK, null, scale);
      drawRun(ctx, str, left, top, color, rowColors, scale);
    },

    drawGlyph: function (ctx, ch, x, y, colorIndex, scale) {
      if (!ctx || typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return;
      var s = scale === undefined ? 1 : wholeScale(scale);
      var key = glyphKey(ch === undefined || ch === null || ch === '' ? ' ' : ch);
      if (key === ' ') return;
      var sheet = sheetFor(ctx, isIndex(colorIndex) ? colorIndex : WHITE, null, s);
      if (!sheet) return;
      blit(ctx, sheet, key, Math.floor(x), Math.floor(y), s);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
