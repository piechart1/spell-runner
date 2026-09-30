// tools/sheet.js
// Draws sprite frames into a labelled grid and writes it as a PNG, so that pixel art can be looked at
// without a browser. CONTRACT 13.2. No npm packages.
//
//   node tools/sheet.js --out <file.png> [--scale 4] [--filter <text>] [--owner C|D]
//                       [--remap <name>] [--bg <palette index>] [--width <px>] [--files <a.js,b.js>]
//
//   --out      the PNG to write (folders are created)
//   --scale    size of one sprite pixel in the picture, 1 to 16. Default 4
//   --filter   draw only sprites whose name contains this text. Several texts may be given with commas:
//              --filter hero,en_  draws every sprite whose name contains "hero" or "en_"
//   --owner    draw only sprites of this owner (C or D)
//   --remap    apply this entry of TG.Remaps to every frame (for example white, gold, sunset, dusk)
//   --bg       palette index (0 to 31) behind the frames. Default 7 (SKY)
//   --width    the picture wraps to a new row of sprites at this width. Default 1024
//   --files    sprite files to load after js/core.js, relative to the project root.
//              Default: js/sprites-chars.js,js/sprites-world.js (whichever exist)
//
// It loads js/core.js and the sprite files through test/stubs.js and reads the sprite data directly
// (CONTRACT 6.1). It does not need gfx.js or font.js; the labels use the small font in this file.
//
// What the picture shows, for each sprite: its name, then "WxH  A ax,ay  fps  owner", then every frame
// on the background colour inside a thin border, with "index:name" under each frame. The CORAL marks
// on the border show the anchor (its x on the top and bottom edge, its y on the left and right edge);
// a mark is left out when that coordinate of the anchor lies outside the frame.
//
// As a module:
//   const sheet = require('./tools/sheet');
//   const picture = sheet.render(TG, { scale: 4, filter: 'hero', owner: 'C', remap: 'gold', bg: 7, width: 1024 });
//   // picture: { width, height, rgba, sprites, frames, cells: [{ sprite, index, name, x, y, w, h }] }
//   // cells give the place of every frame in the picture, in picture pixels.
//   sheet.framePixels(def, index)   -> rows of palette indices (-1 = transparent), copies and flips resolved
'use strict';

const path = require('path');
const soft = require('./softcanvas');
const png = require('./png');

const DEFAULT_FILES = ['js/sprites-chars.js', 'js/sprites-world.js'];

const USAGE = 'usage: node tools/sheet.js --out <file.png> [--scale 4] [--filter <text>] [--owner C|D] ' +
  '[--remap <name>] [--bg <palette index>] [--width <px>] [--files <a.js,b.js>]';

// ---------------------------------------------------------------------------------------------
// The label font: 5 x 7 pixels in a cell of 6 x 8. Lowercase letters are drawn as capitals.
// ---------------------------------------------------------------------------------------------

const GLYPH_W = 5, GLYPH_H = 7, CELL_W = 6, CELL_H = 8;

const FONT = {
  'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....']
};

function textWidth(text, scale) {
  return String(text).length * CELL_W * (scale || 1);
}

// Draws text with its top-left corner at x, y. color: '#rrggbb'.
function drawText(ctx, text, x, y, color, scale) {
  const s = scale || 1;
  const str = String(text).toUpperCase();
  ctx.fillStyle = color;
  for (let i = 0; i < str.length; i++) {
    const glyph = FONT[str.charAt(i)] || FONT['?'];
    for (let gy = 0; gy < GLYPH_H; gy++) {
      const row = glyph[gy];
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if (row.charAt(gx) === '#') ctx.fillRect(x + (i * CELL_W + gx) * s, y + gy * s, s, s);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Sprite data
// ---------------------------------------------------------------------------------------------

const PAL_KEYS = '0123456789abcdefghijklmnopqrstuv';

// Rows of palette indices for one frame; -1 is transparent. A frame given as { copy, flipX } is resolved.
function framePixels(def, index) {
  let frame = def.frames[index];
  let flip = false;
  let guard = 0;
  while (frame && !Array.isArray(frame) && typeof frame === 'object') {
    if (frame.flipX) flip = !flip;
    frame = def.frames[frame.copy];
    if (++guard > def.frames.length) throw new Error('sheet: frame ' + index + ' copies in a circle');
  }
  if (!Array.isArray(frame)) throw new Error('sheet: frame ' + index + ' has no pixel data');
  const rows = [];
  for (let y = 0; y < def.h; y++) {
    const text = String(frame[y] === undefined ? '' : frame[y]);
    const row = [];
    for (let x = 0; x < def.w; x++) {
      const ch = text.charAt(flip ? def.w - 1 - x : x);
      row.push(ch === '' || ch === '.' ? -1 : PAL_KEYS.indexOf(ch));
    }
    rows.push(row);
  }
  return rows;
}

function applyRemap(index, table) {
  if (!table || index < 0) return index;
  if (Object.prototype.hasOwnProperty.call(table, String(index))) return Number(table[String(index)]);
  if (Object.prototype.hasOwnProperty.call(table, '*')) return Number(table['*']);
  return index;
}

// ---------------------------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------------------------

function selectNames(TG, options) {
  const filters = String(options.filter === undefined || options.filter === null ? '' : options.filter)
    .split(',').map(function (f) { return f.trim(); }).filter(Boolean);
  return TG.Sprites.names().filter(function (name) {
    const def = TG.Sprites.get(name);
    if (options.owner && def.owner !== options.owner) return false;
    if (filters.length === 0) return true;
    return filters.some(function (f) { return name.indexOf(f) !== -1; });
  });
}

function render(TG, options) {
  const opts = options || {};
  const scale = opts.scale === undefined ? 4 : Number(opts.scale);
  const bg = opts.bg === undefined ? 7 : Number(opts.bg);
  const maxWidth = opts.width === undefined ? 1024 : Number(opts.width);
  if (!Number.isInteger(scale) || scale < 1 || scale > 16) throw new Error('sheet: scale must be a whole number from 1 to 16, got ' + opts.scale);
  if (!Number.isInteger(bg) || bg < 0 || bg > 31) throw new Error('sheet: bg must be a palette index from 0 to 31, got ' + opts.bg);
  if (!Number.isInteger(maxWidth) || maxWidth < 64) throw new Error('sheet: width must be a whole number of 64 or more, got ' + opts.width);
  if (!TG || !TG.Sprites || !TG.PAL) throw new Error('sheet: TG.Sprites and TG.PAL are needed (load js/core.js first)');

  let remap = null;
  if (opts.remap !== undefined && opts.remap !== null && opts.remap !== '') {
    remap = TG.Remaps ? TG.Remaps[opts.remap] : null;
    if (!remap) {
      const known = TG.Remaps ? Object.keys(TG.Remaps) : [];
      throw new Error('sheet: there is no remap "' + opts.remap + '". Defined remaps: ' + (known.length ? known.join(', ') : 'none'));
    }
  }

  const names = selectNames(TG, opts);
  if (names.length === 0) throw new Error('sheet: no defined sprite matches (filter ' + JSON.stringify(opts.filter || '') +
    ', owner ' + JSON.stringify(opts.owner || 'any') + ', ' + TG.Sprites.names().length + ' sprites defined)');

  const PAL = TG.PAL;
  const PAGE = PAL[1], TITLE = PAL[4], META = PAL[3], BORDER = PAL[2], MARK = PAL[26], BACK = PAL[bg];
  const MARGIN = 8, GAP = 8, BLOCK_GAP_X = 16, BLOCK_GAP_Y = 14;
  const TITLE_SCALE = 2;
  const TITLE_H = CELL_H * TITLE_SCALE, META_H = CELL_H, LABEL_H = CELL_H;

  // Measure every block.
  const blocks = names.map(function (name) {
    const def = TG.Sprites.get(name);
    const cw = def.w * scale, ch = def.h * scale;
    const frames = def.frames.map(function (f, i) {
      const label = i + ':' + def.names[i];
      return { index: i, name: def.names[i], label: label, pitch: Math.max(cw + 2, textWidth(label, 1)) + GAP };
    });
    const rowW = frames.reduce(function (a, f) { return a + f.pitch; }, 0) - GAP;
    const meta = def.w + 'x' + def.h + '  A ' + def.anchor[0] + ',' + def.anchor[1] + '  ' + def.fps + 'FPS  ' + def.owner +
      (remap ? '  REMAP ' + opts.remap : '');
    const width = Math.max(rowW, textWidth(name, TITLE_SCALE), textWidth(meta, 1));
    const height = TITLE_H + 2 + META_H + 4 + (ch + 2) + 3 + LABEL_H;
    return { name: name, def: def, frames: frames, meta: meta, width: width, height: height, cw: cw, ch: ch };
  });

  // Flow the blocks into rows.
  let x = MARGIN, y = MARGIN, rowH = 0, pageW = 0;
  blocks.forEach(function (b) {
    if (x > MARGIN && x + b.width + MARGIN > maxWidth) {
      x = MARGIN;
      y += rowH + BLOCK_GAP_Y;
      rowH = 0;
    }
    b.x = x;
    b.y = y;
    x += b.width + BLOCK_GAP_X;
    rowH = Math.max(rowH, b.height);
    pageW = Math.max(pageW, b.x + b.width + MARGIN);
  });
  const pageH = y + rowH + MARGIN;

  const canvas = soft.createCanvas(pageW, pageH);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PAGE;
  ctx.fillRect(0, 0, pageW, pageH);

  const cells = [];
  let frameCount = 0;
  blocks.forEach(function (b) {
    drawText(ctx, b.name, b.x, b.y, TITLE, TITLE_SCALE);
    drawText(ctx, b.meta, b.x, b.y + TITLE_H + 2, META, 1);
    const top = b.y + TITLE_H + 2 + META_H + 4;       // top of the border
    let fx = b.x;
    b.frames.forEach(function (f) {
      const cx = fx + 1, cy = top + 1;                // top-left of the frame itself
      ctx.fillStyle = BORDER;
      ctx.fillRect(fx, top, b.cw + 2, b.ch + 2);
      ctx.fillStyle = BACK;
      ctx.fillRect(cx, cy, b.cw, b.ch);

      const rows = framePixels(b.def, f.index);
      for (let py = 0; py < b.def.h; py++) {
        for (let px = 0; px < b.def.w; px++) {
          const index = applyRemap(rows[py][px], remap);
          if (index < 0) continue;
          if (!PAL[index]) throw new Error('sheet: ' + b.name + ' frame ' + f.index + ' uses palette index ' + index + ', which does not exist');
          ctx.fillStyle = PAL[index];
          ctx.fillRect(cx + px * scale, cy + py * scale, scale, scale);
        }
      }

      // Anchor marks: 3 px along the border and 3 px across it (the border and 2 px outside it),
      // centred on the anchor. They never cover a pixel of the frame.
      const ax = b.def.anchor[0], ay = b.def.anchor[1];
      ctx.fillStyle = MARK;
      if (ax >= 0 && ax <= b.def.w) {
        const mx = cx + Math.floor(ax * scale) - 1;
        ctx.fillRect(mx, top - 2, 3, 3);
        ctx.fillRect(mx, top + b.ch + 1, 3, 3);
      }
      if (ay >= 0 && ay <= b.def.h) {
        const my = cy + Math.floor(ay * scale) - 1;
        ctx.fillRect(fx - 2, my, 3, 3);
        ctx.fillRect(fx + b.cw + 1, my, 3, 3);
      }

      drawText(ctx, f.label, fx, top + b.ch + 2 + 3, META, 1);
      cells.push({ sprite: b.name, index: f.index, name: f.name, x: cx, y: cy, w: b.cw, h: b.ch });
      frameCount++;
      fx += f.pitch;
    });
  });

  return {
    width: pageW,
    height: pageH,
    rgba: canvas.toRGBA(),
    sprites: blocks.length,
    frames: frameCount,
    names: names,
    cells: cells,
    scale: scale
  };
}

// ---------------------------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const known = ['out', 'scale', 'filter', 'owner', 'remap', 'bg', 'width', 'files'];
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      out.help = true;
      continue;
    }
    if (a.indexOf('--') !== 0) throw new Error('unexpected argument "' + a + '"');
    let name = a.slice(2), value;
    const eq = name.indexOf('=');
    if (eq !== -1) {
      value = name.slice(eq + 1);
      name = name.slice(0, eq);
    } else {
      value = argv[++i];
    }
    if (known.indexOf(name) === -1) throw new Error('unknown option --' + name);
    if (value === undefined) throw new Error('the option --' + name + ' needs a value');
    out[name] = value;
  }
  return out;
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error('sheet: ' + e.message);
    console.error(USAGE);
    return 1;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (!args.out) {
    console.error('sheet: --out <file.png> is needed');
    console.error(USAGE);
    return 1;
  }
  if (args.owner !== undefined && args.owner !== 'C' && args.owner !== 'D') {
    console.error('sheet: --owner must be C or D');
    return 1;
  }

  const stubs = require('../test/stubs');
  const files = ['js/core.js'].concat(args.files ? args.files.split(',').map(function (f) { return f.trim(); }).filter(Boolean) : DEFAULT_FILES);
  let env;
  try {
    env = stubs.load({ files: files });
  } catch (e) {
    console.error('sheet: the files could not be loaded.');
    console.error(e.message);
    return 2;
  }
  if (!env.TG || !env.TG.Sprites) {
    console.error('sheet: js/core.js did not load (loaded: ' + env.loaded.join(', ') + ')');
    return 2;
  }
  if (env.missing.length > 0) console.log('sheet: not present and skipped: ' + env.missing.join(', '));
  env.warnings.forEach(function (w) { console.log('sheet: warning while loading: ' + w); });

  let picture;
  try {
    picture = render(env.TG, {
      scale: args.scale === undefined ? undefined : Number(args.scale),
      bg: args.bg === undefined ? undefined : Number(args.bg),
      width: args.width === undefined ? undefined : Number(args.width),
      filter: args.filter,
      owner: args.owner,
      remap: args.remap
    });
  } catch (e) {
    console.error(e.message);
    return 1;
  }

  const bytes = png.write(args.out, picture.width, picture.height, picture.rgba);
  console.log('sheet: ' + picture.sprites + ' sprites, ' + picture.frames + ' frames, ' + picture.width + ' x ' + picture.height +
    ' px, ' + bytes + ' bytes -> ' + path.resolve(args.out));

  // What the manifest still expects, for the owner asked for (or for both).
  const missing = env.TG.Sprites.missing(args.owner);
  if (missing.length > 0) {
    console.log('sheet: in the manifest' + (args.owner ? ' for owner ' + args.owner : '') + ' but not defined, or defined with another size or frame count (' +
      missing.length + '): ' + missing.join(' '));
  }
  const manifestNames = env.TG.Sprites.MANIFEST.map(function (m) { return m.name; });
  const extra = picture.names.filter(function (n) { return manifestNames.indexOf(n) === -1; });
  if (extra.length > 0) console.log('sheet: drawn but not in the manifest: ' + extra.join(' '));
  return 0;
}

module.exports = { render, framePixels, drawText, textWidth, main, FONT, CELL_W, CELL_H, DEFAULT_FILES };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
