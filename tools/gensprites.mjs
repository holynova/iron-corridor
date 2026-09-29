#!/usr/bin/env node
/**
 * Bakes every FC-style sprite to public/assets/fc/*.png.
 *
 *   node tools/gensprites.mjs            -> write PNGs
 *   node tools/gensprites.mjs --preview  -> also write a labelled contact sheet
 *
 * The art is authored in this repo as ASCII pixel maps (see tools/pixel.mjs).
 * Nothing is traced or ripped; it is original work in the same 8-bit idiom.
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Grid, PAL } from './pixel.mjs';
import { tankSet, tankStrip, EAGLE, BASE_WALL, LIFE_ICON } from './sprites-tanks.mjs';
import {
  BRICK, BRICK_HALF, STEEL, WATER, WATER_B, TREES, ICE, OIL,
  BULLET, EXPLOSION, SPAWN, SHIELD,
} from './sprites-world.mjs';
import { fontStrip, writeFontMap } from './sprites-font.mjs';
import { POWERUPS } from './sprites-items.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/assets/fc');

/** Hull / tread / highlight / glow / gun colour sets per unit class. */
const HULLS = {
  // the console's own cast: the player's tank is the only yellow one on screen,
  // and the four enemy types are grey, silver, red and green
  player: { ol: 'K', md: 'A', lt: 't', hi: 'W', gun: 'F' },
  basic:  { ol: 'K', md: 'G', lt: 'L', hi: 'W', gun: 'W' },
  fast:   { ol: 'K', md: 'L', lt: 'W', hi: 'W', gun: 'W' },
  power:  { ol: 'K', md: 'r', lt: 'N', hi: 'W', gun: 'A' },
  armor:  { ol: 'K', md: 'Y', lt: 'y', hi: 'W', gun: 'A' },
  boss:   { ol: 'K', md: 'P', lt: 'C', hi: 'W', gun: 'A' },
};

function build() {
  const manifest = {};

  // --- tanks: 4 directions x 2 tread frames in one 64x32 strip
  for (const [name, pal] of Object.entries(HULLS)) {
    tankStrip(tankSet(pal)).save(join(OUT, `tank_${name}.png`));
    manifest[`tank_${name}`] = { w: 64, h: 32, frameW: 16, frameH: 16 };
  }

  // --- terrain
  const terrain = { brick: BRICK, brickHalf: BRICK_HALF, steel: STEEL, water: WATER, trees: TREES, ice: ICE, oil: OIL };
  for (const [k, g] of Object.entries(terrain)) {
    g.save(join(OUT, `t_${k}.png`));
    manifest[`t_${k}`] = { w: 16, h: 16 };
  }
  // animated water needs a second frame
  WATER_B.save(join(OUT, 't_water2.png'));
  manifest.t_water2 = { w: 16, h: 16 };

  // --- structures
  EAGLE.save(join(OUT, 'eagle.png'));
  BASE_WALL.save(join(OUT, 'base_wall.png'));
  LIFE_ICON.save(join(OUT, 'life.png'));
  manifest.eagle = { w: 16, h: 16 };
  manifest.base_wall = { w: 16, h: 16 };
  manifest.life = { w: 16, h: 16 };

  // --- effects
  BULLET.save(join(OUT, 'bullet.png'));
  SPAWN.save(join(OUT, 'spawn.png'));
  SHIELD.save(join(OUT, 'shield.png'));
  EXPLOSION.forEach((f, i) => f.save(join(OUT, `boom${i}.png`)));
  manifest.bullet = { w: 8, h: 8 };
  manifest.spawn = { w: 16, h: 16 };
  manifest.shield = { w: 16, h: 16 };
  manifest.boom = { w: 16, h: 16, frames: 3 };

  // --- items
  for (const [k, g] of Object.entries(POWERUPS)) {
    g.save(join(OUT, `pu_${k}.png`));
    manifest[`pu_${k}`] = { w: 16, h: 16 };
  }

  // --- font strip
  const f = fontStrip();
  f.save(join(OUT, 'font.png'));
  writeFontMap(join(ROOT, 'src/data/fontMap.ts'));
  manifest.font = { w: f.w, h: 8, frameW: 8, frameH: 8 };

  return manifest;
}

/* ------------------------------------------------------------------ preview */

function preview(manifest) {
  const SCALE = 4;
  const PAD = 8;
  const LABELS = [
    ['tank_player', 'PLAYER'], ['tank_basic', 'BASIC'], ['tank_fast', 'FAST'],
    ['tank_power', 'POWER'], ['tank_armor', 'ARMOR'], ['tank_boss', 'BOSS'],
  ];
  const TILES = [
    ['t_brick', 'BRICK'], ['t_brickHalf', 'BRICK/2'], ['t_steel', 'STEEL'],
    ['t_water', 'WATER'], ['t_trees', 'TREES'], ['t_ice', 'ICE'],
    ['t_oil', 'OIL'], ['eagle', 'EAGLE'], ['base_wall', 'BASE WALL'], ['life', 'LIFE'],
  ];
  const ITEMS = Object.keys(POWERUPS).map((k) => [`pu_${k}`, k.toUpperCase()]);

  const cellW = 16 * SCALE;
  const cols = 10;
  const rows = Math.ceil((LABELS.length * 2 + TILES.length + ITEMS.length * 2 + 6) / cols);
  const W = cols * (cellW + PAD) + PAD;
  const H = rows * (cellW + PAD) + PAD;
  const sheet = new Grid(W, H);
  // dark checkerboard background so transparency is visible
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) sheet.set(x, y, (x >> 3) % 2 === (y >> 3) % 2 ? 'D' : 'G');

  let i = 0;
  const place = (grid) => {
    const cx = PAD + (i % cols) * (cellW + PAD);
    const cy = PAD + Math.floor(i / cols) * (cellW + PAD);
    i++;
    for (let y = 0; y < grid.h; y++)
      for (let x = 0; x < grid.w; x++) {
        const v = grid.get(x, y);
        if (!v) continue;
        for (let sy = 0; sy < SCALE; sy++)
          for (let sx = 0; sx < SCALE; sx++) sheet.set(cx + x * SCALE + sx, cy + y * SCALE + sy, v);
      }
  };

  const reload = (name) => Grid.fromAscii([]);
  for (const [k] of LABELS) { void k; }

  // rebuild the same grids rather than decoding PNGs
  for (const [, pal] of Object.entries(HULLS)) {
    const s = tankSet(pal);
    place(s.upA); place(s.rightA);
    place(s.downA); place(s.leftA);
  }
  for (const [k, g] of Object.entries({ brick: BRICK, brickHalf: BRICK_HALF, steel: STEEL, water: WATER, trees: TREES, ice: ICE, oil: OIL, eagle: EAGLE, base: BASE_WALL, life: LIFE_ICON })) {
    void k;
    place(g);
  }
  place(SPAWN);
  place(SHIELD);
  EXPLOSION.forEach(place);
  BULLET.save && (() => { place(BULLET); })();
  for (const g of Object.values(POWERUPS)) place(g);

  sheet.save(join(OUT, '..', '..', 'preview-sheet.png'));
  void reload;
  void manifest;
}

const manifest = build();
console.log('sprites written:', Object.keys(manifest).length);
if (process.argv.includes('--preview')) {
  preview(manifest);
  console.log('preview written');
}
