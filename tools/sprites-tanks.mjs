import { Grid } from './pixel.mjs';

/**
 * Tank bodies.
 *
 * Every tank is drawn once facing up and then rotated into the other three
 * headings, which guarantees all four orientations stay consistent — the same
 * trick the console hardware got for free from its tile grid.
 *
 * Layout of the 16x16 cell (rows 0-15 top to bottom, facing up):
 *   x7-8    gun barrel poking out of the nose
 *   x0-2    left tread      x13-15 right tread
 *   x3-12   hull, outlined, with a lit centre spine
 */
export function tankUp({ ol, md, lt, hi, gun }, frame) {
  const g = new Grid(16, 16);

  // --- gun: 2px barrel, 4px of it clear of the hull so facing is readable
  g.fill(7, 0, 2, 7, gun);
  g.set(7, 0, lt);
  g.set(7, 1, lt);
  g.set(8, 0, ol);
  g.set(8, 1, ol);

  // --- treads: dark column each side with a lit rung running down it
  g.fill(0, 3, 3, 13, ol);
  g.fill(13, 3, 3, 13, ol);
  const rungs = frame ? [5, 8, 11] : [4, 7, 10];
  for (const y of rungs) {
    g.fill(1, y, 1, 2, lt);
    g.fill(14, y, 1, 2, lt);
  }
  // tread shadow line so the column reads as round
  g.fill(2, 4, 1, 12, md);
  g.fill(13, 4, 1, 12, md);

  // --- hull: chamfered block, x3..x12
  g.fill(4, 4, 8, 12, md);
  g.fill(3, 5, 10, 10, md);
  // chamfer the four corners
  g.set(3, 4, 0); g.set(12, 4, 0);
  g.set(3, 15, 0); g.set(12, 15, 0);
  g.set(4, 4, ol); g.set(11, 4, ol);
  g.set(4, 15, ol); g.set(11, 15, ol);
  g.set(3, 5, ol); g.set(12, 5, ol);
  g.set(3, 14, ol); g.set(12, 14, ol);

  // --- outline
  g.rect(3, 4, 10, 12, ol);
  g.set(3, 4, 0);
  g.set(12, 4, 0);
  g.set(3, 15, 0);
  g.set(12, 15, 0);

  // --- lit centre cross: the detail that says "turret"
  g.fill(7, 6, 2, 8, lt);
  g.fill(5, 8, 6, 2, lt);
  g.fill(7, 7, 2, 2, hi);
  g.set(5, 8, hi);
  g.set(10, 9, hi);

  // --- nose and belly shading
  g.fill(5, 5, 6, 1, hi);
  g.fill(5, 14, 6, 1, ol);

  return g;
}

/** Direction order matches Phaser's rotation helpers: up, right, down, left. */
export function tankSet(pal) {
  const upA = tankUp(pal, 0);
  const upB = tankUp(pal, 1);
  return {
    // index 0..3 = up, right, down, left; index 4..7 = same, frame B
    upA, rightA: upA.rotateCW(), downA: upA.rotateCW().rotateCW(), leftA: upA.rotateCW().rotateCW().rotateCW(),
    upB, rightB: upB.rotateCW(), downB: upB.rotateCW().rotateCW(), leftB: upB.rotateCW().rotateCW().rotateCW(),
  };
}

/** Two-frame tread animation, laid out as a 2x2 sheet per direction. */
export function tankStrip(set) {
  const order = ['upA', 'rightA', 'downA', 'leftA', 'upB', 'rightB', 'downB', 'leftB'];
  const g = new Grid(16 * 4, 16 * 2);
  order.forEach((k, i) => {
    const src = set[k];
    src.blit(g, (i % 4) * 16, Math.floor(i / 4) * 16);
  });
  return g;
}

/**
 * The base the player has to defend: a bird emblem on a stepped plinth,
 * built from primitives so every row is guaranteed to land on the grid.
 */
export const EAGLE = (() => {
  const g = new Grid(16, 16);
  g.fill(2, 2, 12, 12, 'K'); // plinth outline
  g.fill(3, 3, 10, 10, 'W'); // light frame
  g.fill(4, 4, 8, 8, 'o'); // inner plate
  g.fill(4, 4, 8, 8, 'o');
  g.fill(5, 5, 6, 6, 'T'); // cream field for the emblem
  // wings
  g.fill(5, 6, 1, 3, 'K');
  g.fill(10, 6, 1, 3, 'K');
  g.fill(6, 7, 1, 1, 'K');
  g.fill(9, 7, 1, 1, 'K');
  // head + beak
  g.fill(7, 5, 2, 1, 'K');
  g.fill(7, 6, 1, 1, 'K');
  g.fill(8, 6, 1, 1, 'A');
  // body
  g.fill(6, 8, 4, 2, 'K');
  g.set(7, 7, 'K');
  g.set(8, 7, 'A');
  return g;
})();

/** Brick wall that surrounds the base. */
export const BASE_WALL = (() => {
  const g = new Grid(8, 8);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const joint = y % 2 === 0 || (x + (y >= 4 ? 2 : 0)) % 4 === 0;
      g.set(x, y, joint ? 'O' : (x + y) % 5 === 0 ? 'R' : 'r');
    }
  return g;
})();

/** Small life icon for the HUD: a tank seen head-on, 16x16 cell. */
export const LIFE_ICON = (() => {
  const g = new Grid(16, 16);
  g.fill(1, 2, 14, 11, 'O'); // tread block
  g.fill(2, 3, 12, 9, 'o');
  // lit rungs
  for (const y of [4, 6, 8, 10]) {
    g.fill(2, y, 1, 1, 't');
    g.fill(13, y, 1, 1, 't');
  }
  // hull
  g.fill(4, 3, 8, 8, 't');
  g.fill(4, 3, 8, 1, 'T');
  g.fill(7, 4, 2, 6, 'T'); // centre spine
  g.fill(7, 5, 2, 2, 'N'); // gun
  g.rect(1, 2, 14, 11, 'K');
  return g;
})();
