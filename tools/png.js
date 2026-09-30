// tools/png.js
// PNG writer (and a small reader for tests) built on Node's zlib. No npm packages.
// CONTRACT 13.2.
//
//   const png = require('./tools/png');
//   const buffer = png.encode(width, height, rgba);      // rgba: width * height * 4 bytes, row by row from the top
//   png.write('out/picture.png', width, height, rgba);   // creates the folder if needed
//   const image = png.decode(buffer);                    // { width, height, rgba: Uint8ClampedArray }
//   const image2 = png.read('out/picture.png');
//
// encode writes 8-bit RGBA, not interlaced. decode reads what encode writes, and any other 8-bit
// RGBA or RGB PNG that is not interlaced.
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (function () {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBytes.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return out;
}

function checkSize(width, height, rgba) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('png: width and height must be positive whole numbers, got ' + width + ' x ' + height);
  }
  if (!rgba || typeof rgba.length !== 'number' || rgba.length !== width * height * 4) {
    throw new Error('png: expected ' + (width * height * 4) + ' bytes of RGBA for ' + width + ' x ' + height +
      ', got ' + (rgba ? rgba.length : rgba));
  }
}

// RGBA bytes to a PNG.
function encode(width, height, rgba) {
  checkSize(width, height, rgba);
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;                                   // filter type 0 (none)
    for (let x = 0; x < stride; x++) raw[rowStart + 1 + x] = rgba[y * stride + x];
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;      // bit depth
  header[9] = 6;      // colour type: RGBA
  header[10] = 0;     // compression
  header[11] = 0;     // filter method
  header[12] = 0;     // not interlaced

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function write(filePath, width, height, rgba) {
  const buffer = encode(width, height, rgba);
  const dir = path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return buffer.length;
}

// Splits a PNG into its chunks: [{ type, data, crcOk }]. Throws if the signature is wrong.
function chunks(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('png: the data does not start with the PNG signature');
  }
  const out = [];
  let pos = 8;
  while (pos + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    const crc = buffer.readUInt32BE(pos + 8 + length);
    out.push({ type: type, data: data, crcOk: crc32(buffer.subarray(pos + 4, pos + 8 + length)) === crc });
    pos += 12 + length;
    if (type === 'IEND') break;
  }
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// PNG to { width, height, rgba }.
function decode(buffer) {
  const list = chunks(buffer);
  let header = null;
  const parts = [];
  for (const c of list) {
    if (!c.crcOk) throw new Error('png: the checksum of chunk ' + c.type + ' is wrong');
    if (c.type === 'IHDR') header = c.data;
    if (c.type === 'IDAT') parts.push(c.data);
  }
  if (!header) throw new Error('png: no IHDR chunk');
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const depth = header[8], colour = header[9], interlace = header[12];
  if (depth !== 8 || (colour !== 6 && colour !== 2) || interlace !== 0) {
    throw new Error('png: only 8-bit RGB or RGBA without interlacing can be read (depth ' + depth +
      ', colour type ' + colour + ', interlace ' + interlace + ')');
  }
  const bpp = colour === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(parts));
  if (raw.length !== (stride + 1) * height) throw new Error('png: the image data has the wrong length');

  const rgba = new Uint8ClampedArray(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let r;
      switch (filter) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: r = v + paeth(a, b, c); break;
        default: throw new Error('png: unknown filter type ' + filter + ' in row ' + y);
      }
      line[x] = r & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      rgba[o] = line[x * bpp];
      rgba[o + 1] = line[x * bpp + 1];
      rgba[o + 2] = line[x * bpp + 2];
      rgba[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { width: width, height: height, rgba: rgba };
}

function read(filePath) {
  return decode(fs.readFileSync(filePath));
}

module.exports = { encode, write, decode, read, chunks, crc32 };
