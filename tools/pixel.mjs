/**
 * Minimal PNG writer + pixel-grid helper.
 *
 * Only depends on Node's built-in zlib, so the sprite pipeline adds no
 * dependencies to the project.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * A fresh console-flavoured ramp. Values are chosen to sit in the same tonal
 * relationships as 8-bit era hardware, deliberately not copied from any one
 * commercial cartridge.
 */
export const PAL = {
  '.': null, // transparent
  K: 0x000000, // black
  D: 0x3c3c3c, // dark grey
  G: 0x7c7c7c, // mid grey
  L: 0xbcbcbc, // light grey
  W: 0xfcfcfc, // white
  O: 0x603000, // dark brown
  o: 0xa05818, // brown
  T: 0xfce0a8, // cream
  t: 0xd89c3c, // amber
  R: 0xa82400, // brick red
  r: 0xe45820, // bright brick
  N: 0xfc7460, // coral
  B: 0x0058f8, // water deep
  b: 0x3cbcfc, // water light
  Y: 0x00a800, // foliage
  y: 0x58d854, // foliage light
  E: 0x005800, // foliage dark
  C: 0xf8b8f8, // pink
  P: 0x9c5cf4, // violet
  A: 0xfcd424, // bright yellow
  S: 0x5890a4, // steel teal
  s: 0x9cccd4, // steel teal light
  I: 0xbcfcfc, // ice
  F: 0xf87800, // flame
  P2: 0xfcfce4, // pale
};

const KEYS = Object.keys(PAL);
const INDEX = new Map(KEYS.map((k, i) => [k, i]));

/** Palette char -> index, with the same error reporting as Grid.ascii. */
function resolve(ch) {
  const i = INDEX.get(ch);
  if (i === undefined) throw new Error(`unknown pixel char '${ch}'`);
  return i;
}

/* ---------------------------------------------------------------------- PNG */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function writePng(path, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png);
}

/* -------------------------------------------------------------------- Grid */

export class Grid {
  constructor(w, h, px) {
    this.w = w;
    this.h = h;
    this.px = px ?? new Uint8Array(w * h);
  }

  /** Build from ASCII art, one character per pixel. */
  static ascii(rows, name = 'sprite') {
    const h = rows.length;
    const w = rows[0].length;
    rows.forEach((r, y) => {
      if (r.length !== w) throw new Error(`${name}: row ${y} width ${r.length}, expected ${w}\n  "${r}"`);
    });
    const g = new Grid(w, h);
    rows.forEach((r, y) => {
      for (let x = 0; x < w; x++) {
        const i = INDEX.get(r[x]);
        if (i === undefined) throw new Error(`${name}: unknown pixel char '${r[x]}' at ${x},${y}`);
        g.px[y * w + x] = i;
      }
    });
    return g;
  }

  static filled(w, h, ch) {
    const g = new Grid(w, h);
    g.fill(0, 0, w, h, ch);
    return g;
  }

  clone() {
    return new Grid(this.w, this.h, this.px.slice());
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.px[y * this.w + x];
  }

  set(x, y, v) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    this.px[y * this.w + x] = typeof v === 'string' ? resolve(v) : v;
    return this;
  }

  fill(x, y, w, h, ch) {
    const v = resolve(ch);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, v);
    return this;
  }

  rect(x, y, w, h, ch) {
    this.fill(x, y, w, 1, ch);
    this.fill(x, y + h - 1, w, 1, ch);
    this.fill(x, y, 1, h, ch);
    this.fill(x + w - 1, y, 1, h, ch);
    return this;
  }

  /** Nearest-neighbour rotation, 90 degrees clockwise. */
  rotateCW() {
    const g = new Grid(this.h, this.w);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) g.set(this.h - 1 - y, x, this.get(x, y));
    return g;
  }

  flipX() {
    const g = this.clone();
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w / 2; x++) {
        const a = this.get(x, y);
        g.set(x, y, this.get(this.w - 1 - x, y));
        g.set(this.w - 1 - x, y, a);
      }
    return g;
  }

  /** Replace one palette character with another. */
  swap(from, to) {
    const f = INDEX.get(from);
    const t = INDEX.get(to);
    for (let i = 0; i < this.px.length; i++) if (this.px[i] === f) this.px[i] = t;
    return this;
  }

  blit(dst, ox, oy) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const v = this.get(x, y);
      if (v) dst.set(ox + x, oy + y, v);
    }
    return dst;
  }

  /** Horizontally adjacent copies, for tween-free animation strips. */
  strip(frames) {
    const out = new Grid(this.w * frames.length, this.h);
    frames.forEach((f, i) => f.blit(out, i * this.w, 0));
    return out;
  }

  toRgba() {
    const buf = Buffer.alloc(this.w * this.h * 4);
    for (let i = 0; i < this.w * this.h; i++) {
      const c = PAL[KEYS[this.px[i]]];
      if (c == null) continue;
      buf[i * 4] = (c >> 16) & 0xff;
      buf[i * 4 + 1] = (c >> 8) & 0xff;
      buf[i * 4 + 2] = c & 0xff;
      buf[i * 4 + 3] = 0xff;
    }
    return buf;
  }

  save(path) {
    writePng(path, this.w, this.h, this.toRgba());
  }

  /** Rows as hex colour strings — handy for debugging in the console. */
  dump() {
    const out = [];
    for (let y = 0; y < this.h; y++) {
      let line = '';
      for (let x = 0; x < this.w; x++) {
        const c = PAL[KEYS[this.get(x, y)]];
        line += c == null ? ' ' : c.toString(16).padStart(6, '0') + ' ';
      }
      out.push(line);
    }
    return out.join('\n');
  }
}
