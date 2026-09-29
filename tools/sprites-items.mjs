import { Grid } from './pixel.mjs';

/**
 * Power-up crates. Each is a 16x16 box with a pale frame, so a dropped item
 * reads as a physical object on the battlefield rather than a floating icon.
 */

function crate(draw, name) {
  const g = new Grid(16, 16);
  g.fill(2, 2, 12, 12, 'O');
  g.fill(3, 3, 10, 10, 'W');
  g.rect(2, 2, 12, 12, 'K');
  draw(g);
  void name;
  return g;
}

export const POWERUPS = {
  // star — faster gun, tougher shells
  star: crate((g) => {
    const pts = [
      [8, 4], [9, 7], [12, 7], [10, 9], [11, 12], [8, 10], [5, 12], [6, 9], [4, 7], [7, 7],
    ];
    for (const [x, y] of pts) g.set(x, y, 'A');
    g.fill(7, 8, 2, 2, 'A');
  }, 'star'),

  // grenade — clears the field
  nuke: crate((g) => {
    g.fill(6, 4, 4, 2, 'K');
    g.fill(5, 6, 6, 6, 'K');
    g.fill(6, 6, 4, 6, 'R');
    g.fill(7, 7, 2, 4, 'A');
    g.set(6, 5, 'K');
  }, 'nuke'),

  // shield — temporary invulnerability
  shield: crate((g) => {
    g.rect(5, 4, 6, 8, 'B');
    g.fill(7, 5, 2, 6, 'b');
    g.fill(5, 7, 6, 2, 'b');
    g.set(5, 4, 'W');
    g.set(10, 4, 'W');
  }, 'shield'),

  // freeze — halts every enemy on the field
  freeze: crate((g) => {
    for (let i = 0; i < 8; i++) {
      g.set(8, 8, 'W');
      for (let a = 0; a < 6; a++) {
        const ang = (a / 6) * Math.PI * 2;
        g.set(Math.round(8 + Math.cos(ang) * 3), Math.round(8 + Math.sin(ang) * 3), 'W');
        g.set(Math.round(8 + Math.cos(ang) * 4.5), Math.round(8 + Math.sin(ang) * 4.5), 'b');
      }
      break;
    }
    g.set(8, 8, 'W');
  }, 'freeze'),

  // upgrade — next gun tier
  upgrade: crate((g) => {
    g.fill(8, 4, 2, 8, 'A');
    g.fill(6, 6, 6, 4, 'A');
    g.set(6, 5, 'A');
    g.set(11, 5, 'A');
  }, 'upgrade'),

  // repair — patch the hull
  repair: crate((g) => {
    g.fill(4, 7, 8, 2, 'N');
    g.fill(7, 4, 2, 8, 'N');
    g.set(6, 6, 'W');
    g.set(9, 6, 'W');
  }, 'repair'),

  // scrap — meta-progression currency
  scrap: crate((g) => {
    g.fill(4, 5, 8, 6, 'A');
    g.rect(4, 5, 8, 6, 'o');
    g.fill(6, 7, 4, 2, 'o');
    g.set(5, 6, 'T');
  }, 'scrap'),
};

/** Maps the in-game pickup ids onto crate art. */
export const PICKUP_ART = {
  heal: POWERUPS.repair,
  shield: POWERUPS.shield,
  nuke: POWERUPS.nuke,
  freeze: POWERUPS.freeze,
  upgrade: POWERUPS.upgrade,
  weapon: POWERUPS.star,
  scrap: POWERUPS.scrap,
};
