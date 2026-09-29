import { Grid } from './pixel.mjs';

/**
 * Terrain blocks and effects.
 *
 * Every block is exactly 16x16 so one PNG per material tiles the whole map
 * with a single draw call. Shapes are built with primitives rather than typed
 * pixel by pixel, which keeps them landing exactly on the grid.
 */

const S = 8; // terrain blocks are 8x8 art pixels, matching the console grid
const T = 16; // tanks and one-off sprites are 16x16

/** Destructible brick: five courses of running bond with pale mortar. */
function brickPattern(g, y0, h, mortarDark = true) {
  const course = 2; // two-pixel courses, so 8x8 still reads as four rows of brick
  const joint = mortarDark ? 'O' : 'W';
  for (let y = y0; y < y0 + h; y++) {
    const row = Math.floor((y - y0) / course);
    const inCourse = (y - y0) % course === 0;
    const offset = row % 2 === 0 ? 0 : 2; // running bond
    for (let x = 0; x < S; x++) {
      let ch = (x + y) % 5 === 0 ? 'R' : 'r'; // faint tonal variation per brick
      if (inCourse) ch = joint;
      else if ((x + offset) % 4 === 0) ch = joint;
      g.set(x, y, ch);
    }
  }
}

export const BRICK = (() => {
  const g = new Grid(S, S);
  brickPattern(g, 0, S, true);
  return g;
})();

/** Lower half of a brick course, used when a wall is shot through from below. */
export const BRICK_HALF = (() => {
  const g = new Grid(S, S);
  // the top half of a wall that has been shot through from below
  brickPattern(g, 0, 4, true);
  g.fill(0, 4, S, S - 4, 'K');
  return g;
})();

/** Indestructible steel: bevelled plate with a lighter core and rivet corners. */
export const STEEL = (() => {
  const g = new Grid(S, S);
  g.fill(0, 0, S, S, 'G'); // body
  g.fill(0, 0, S, 1, 'L'); // top highlight
  g.fill(0, 0, 1, S, 'L'); // left highlight
  g.fill(0, S - 1, S, 1, 'D'); // bottom shadow
  g.fill(S - 1, 0, 1, S, 'D'); // right shadow
  g.fill(1, 1, S - 2, S - 2, 'D');
  g.fill(2, 2, S - 4, S - 4, 'G');
  // rivets catch the light, which is what sells the slab as armour
  for (const [rx, ry] of [[1, 1], [S - 3, 1], [1, S - 3], [S - 3, S - 3]]) g.set(rx, ry, 'L');
  g.fill(3, 3, 2, 2, 'L');
  return g;
})();

/** Water: deep blue with a scattered light ripple. */
function waterField(g, shift) {
  g.fill(0, 0, S, S, 'B');
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // a repeating diagonal-ish scatter, phase-shifted per frame
      const n = (x * 3 + y * 5 + shift) % 11;
      if (n === 0 || n === 1 || n === 6) g.set(x, y, 'b');
    }
  }
  return g;
}

export const WATER = waterField(new Grid(S, S), 0);
export const WATER_B = waterField(new Grid(S, S), 4);

/** Camouflage foliage: dense dither that reads as a solid green mass. */
export const TREES = (() => {
  const g = new Grid(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      // clumpy canopy: dark mass with lighter leaf clumps breaking the surface
      const clump = Math.sin(x * 1.7) + Math.cos(y * 1.9) + Math.sin((x + y) * 1.1);
      g.set(x, y, clump > 0.9 ? 'y' : clump < -0.9 ? 'E' : 'Y');
    }
  // a few dark gaps so the mass is not perfectly solid
  g.set(1, 2, 'E'); g.set(5, 1, 'E'); g.set(3, 6, 'E'); g.set(6, 5, 'E');
  return g;
})();

/** Ice: pale sheet with a diagonal glint. */
export const ICE = (() => {
  const g = new Grid(S, S);
  g.fill(0, 0, S, S, 'I');
  for (let i = 2; i < 14; i++) g.set(i, i - 1, 'W');
  g.set(2, 2, 'W');
  g.set(3, 3, 'W');
  return g;
})();

/** Scorched oil pool: the hazard tiles. */
export const OIL = (() => {
  const g = new Grid(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (x - 7.5) / 8;
      const dy = (y - 7.5) / 8;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0.98) continue;
      let ch = 'K'; // the slick itself is nearly black
      if (d > 0.78) ch = 'O'; // rim catches a little light
      else if (d > 0.6 && (x + y) % 3 === 0) ch = 'O';
      else if (d < 0.3 && (x * 3 + y * 5) % 4 === 0) ch = 'o'; // faint sheen
      g.set(x, y, ch);
    }
  return g;
})();

/* ------------------------------------------------------------------ effects */

/** Shell: bright core with a warm halo, pointing up. */
export const BULLET = (() => {
  const g = new Grid(8, 8);
  g.fill(3, 0, 2, 8, 'W');
  g.set(3, 2, 'P2'); g.set(4, 2, 'P2');
  g.fill(3, 7, 2, 1, 'A');
  return g;
})();

/** Spawn tell: the blinking marker above an incoming tank. */
export const SPAWN = (() => {
  const g = new Grid(T, T);
  // a four-point star that blinks, the way the console telegraphs a spawn
  for (let i = 0; i < T; i++) {
    const d = 7 - Math.abs(i - 7.5);
    const r = d >= 4 ? 1 : 0;
    for (let k = -r; k <= r; k++) {
      g.set(i, 7 + k, 'W');
      g.set(7 + k, i, 'W');
    }
  }
  g.fill(6, 6, 4, 4, 'W');
  g.fill(7, 7, 2, 2, 'P2');
  return g;
})();

/** Shield bubble drawn around the player while invulnerable. */
export const SHIELD = (() => {
  const g = new Grid(16, 16);
  // a broken ring: eight bright plates with gaps at the corners
  const draw = (x, y, w, h) => {
    g.fill(x, y, w, h, 'W');
    g.fill(x + 1, y + 1, w - 2, h - 2, 'P2');
  };
  draw(0, 0, 5, 2); draw(11, 0, 5, 2);
  draw(0, 14, 5, 2); draw(11, 14, 5, 2);
  draw(0, 3, 2, 10); draw(14, 3, 2, 10);
  return g;
})();

/** Three-frame burst: a small star, a big star, then scattered sparks. */
function burst(g, mode) {
  if (mode === 0) {
    // first frame: a tight white flash
    g.fill(5, 1, 6, 14, 'A');
    g.fill(1, 5, 14, 6, 'A');
    g.fill(4, 4, 8, 8, 'W');
    g.fill(6, 6, 4, 4, 'P2');
  } else if (mode === 1) {
    // second frame: the fireball opens out into a ring
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const dx = (x - 7.5) / 7.6, dy = (y - 7.5) / 7.6;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1) continue;
        if (d > 0.78) g.set(x, y, 'F');
        else if (d > 0.42) g.set(x, y, 'A');
        else if (d > 0.2) g.set(x, y, 'R');
        else g.set(x, y, 'W');
      }
    // spikes thrown out along the axes
    g.fill(7, 0, 2, 3, 'F'); g.fill(7, 13, 2, 3, 'F');
    g.fill(0, 7, 3, 2, 'F'); g.fill(13, 7, 3, 2, 'F');
  } else {
    // third frame: cooling embers scattered outward
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        if (d > 7) continue;
        const n = (x * 7 + y * 5) % 11;
        if (n < 2) g.set(x, y, 'F');
        else if (n === 2) g.set(x, y, 'A');
        else if (n === 3) g.set(x, y, 'R');
      }
  }
  return g;
}

export const EXPLOSION = [0, 1, 2].map((m) => burst(new Grid(T, T), m));
