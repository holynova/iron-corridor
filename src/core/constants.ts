/**
 * Field geometry.
 *
 * Everything is expressed in console-native units and scaled up by a single
 * integer factor, which is what keeps the pixel art crisp: one art pixel is
 * always `SCALE` screen pixels, never a fraction.
 */

/** Art pixels per on-screen pixel, inverted: one art pixel = SCALE screen px. */
export const SCALE = 6;

/** Battlefield grid, in blocks. A tank covers 2x2 blocks, as on the console. */
export const FIELD = 13;

/** On-screen size of one block: 8 art pixels x SCALE. */
export const BLOCK = 8 * SCALE; // 48

/** Battlefield extent in blocks. */
export const FIELD_BLOCKS = FIELD; // 13
export const ARENA_BLOCKS_W = FIELD;
export const ARENA_BLOCKS_H = FIELD;

/** Convenience: on-screen size of the whole battlefield. */
export const ARENA_W = FIELD * BLOCK; // 624
export const ARENA_H = FIELD * BLOCK;

/** Tank sprite is 2 blocks across. */
export const TANK_SIZE = 2 * BLOCK; // 96

/** A tank's collision circle, slightly inside the sprite. */
export const TANK_RADIUS = BLOCK * 0.86;

export const VIEW = {
  width: 800,
  height: 720,
} as const;

/** The battlefield is a fixed panel inside the viewport. */
export const FIELD_X = Math.round((VIEW.width - ARENA_W) / 2);
/**
 * The console gives the field almost the whole screen: a thin status row on
 * top and a narrow foot below. 624 + 72 + 24 lands exactly on 720.
 */
export const FIELD_Y = 72;

/** Status bar height above the field. */
export const HUD_H = FIELD_Y;

/** Foot strip below the field, for the dash gauge and key hints. */
export const FOOT_Y = FIELD_Y + ARENA_H;
export const FOOT_H = VIEW.height - FOOT_Y;

export const COLORS = {
  ink: 0x000000,
  panel: 0x101018,
  steel: 0x7c7c7c,
  bone: 0xfcfcfc,
  amber: 0xfcd424,
  rust: 0xe45820,
  mint: 0x58d854,
  brick: 0xa82400,
  water: 0x0058f8,
  leaf: 0x00a800,
  danger: 0xe45820,
} as const;

export const DEPTH = {
  max: 30,
  bossEvery: 5,
} as const;

/** Depth drives the palette that tints the frame, cool -> hot. */
export const DEPTH_TINT: number[] = [
  0xffffff, 0xfff4e2, 0xffe9c9, 0xffd9a8, 0xffc98c, 0xffb877, 0xffa668, 0xff9a5c,
  0xff8f55, 0xff8a5a, 0xff8460, 0xfe7f6a, 0xfd7c74, 0xfc7a7f, 0xfb7985, 0xfa788c,
  0xf87894, 0xf6799c, 0xf57aa5, 0xf47cae, 0xf37fb7, 0xf283c0, 0xf188c9, 0xf18dd2,
  0xf193db, 0xf29ae4, 0xf4a1ed, 0xf6a9f6, 0xf8b1ff, 0xfbbaff, 0xfec4ff, 0xffffff,
];

export const LAYER = {
  ground: 5,
  wall: 10,
  decal: 12,
  base: 14,
  pickup: 20,
  corpse: 30,
  spawn: 34,
  actor: 40,
  bullet: 50,
  fx: 60,
  ui: 80,
} as const;
