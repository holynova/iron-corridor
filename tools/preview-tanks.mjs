#!/usr/bin/env node
/** Renders a big preview of the tank set so the silhouette can be judged. */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Grid } from './pixel.mjs';
import { tankSet } from './sprites-tanks.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const HULLS = {
  player: { ol: 'O', md: 'o', lt: 't', hi: 'T', gun: 'N' },
  basic:  { ol: 'K', md: 'S', lt: 's', hi: 'W', gun: 'W' },
  fast:   { ol: 'K', md: 'L', lt: 'W', hi: 'W', gun: 'W' },
  power:  { ol: 'E', md: 'Y', lt: 'y', hi: 'W', gun: 'A' },
  armor:  { ol: 'K', md: 'C', lt: 'W', hi: 'W', gun: 'W' },
  boss:   { ol: 'K', md: 'P', lt: 'C', hi: 'W', gun: 'A' },
};

const Z = 10;
const NAMES = Object.keys(HULLS);
const W = 4 * 16 * Z + 5 * 4;
const H = NAMES.length * 16 * Z + (NAMES.length + 1) * 4;
const sheet = new Grid(W, H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) sheet.set(x, y, (x >> 4) % 2 === (y >> 4) % 2 ? 'D' : 'G');

NAMES.forEach((n, row) => {
  const s = tankSet(HULLS[n]);
  const set = [s.upA, s.rightA, s.downA, s.leftA];
  const oy = 4 + row * (16 * Z + 4);
  set.forEach((g, col) => {
    const ox = 4 + col * (16 * Z + 4);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const v = g.get(x, y);
        if (!v) continue;
        for (let sy = 0; sy < Z; sy++) for (let sx = 0; sx < Z; sx++) sheet.set(ox + x * Z + sx, oy + y * Z + sy, v);
      }
  });
});

sheet.save(join(ROOT, 'public', 'preview-tanks.png'));
console.log('tank preview written');
