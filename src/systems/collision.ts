import { BLOCK, ARENA_W, ARENA_H, TANK_RADIUS } from '../core/constants';
import { isWalkable, cellAt, blocksBody, type Arena } from './arena';

/**
 * Tank collision against the block grid.
 *
 * A tank covers 2x2 blocks, so it is modelled as a circle just under one
 * block wide: that keeps movement predictable while still letting it slide
 * along walls instead of sticking to them.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export function blocksAt(arena: Arena, col: number, row: number): boolean {
  return blocksBody(cellAt(arena, col, row));
}

/** Is a circle of `radius` free at this world position? */
export function isSpotFree(arena: Arena, x: number, y: number, radius: number): boolean {
  const c0 = Math.floor((x - radius) / BLOCK);
  const c1 = Math.floor((x + radius) / BLOCK);
  const r0 = Math.floor((y - radius) / BLOCK);
  const r1 = Math.floor((y + radius) / BLOCK);
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      if (!blocksAt(arena, c, r)) continue;
      const left = c * BLOCK;
      const top = r * BLOCK;
      const px = x < left ? left : x > left + BLOCK ? left + BLOCK : x;
      const py = y < top ? top : y > top + BLOCK ? top + BLOCK : y;
      const dx = x - px;
      const dy = y - py;
      if (dx * dx + dy * dy <= radius * radius) return false;
    }
  return true;
}

/** Push a circle out of every solid block it overlaps, shallowest axis first. */
export function resolveCircle(arena: Arena, pos: Vec2, radius: number): Vec2 {
  let { x, y } = pos;
  for (let pass = 0; pass < 3; pass++) {
    const c0 = Math.floor((x - radius) / BLOCK);
    const c1 = Math.floor((x + radius) / BLOCK);
    const r0 = Math.floor((y - radius) / BLOCK);
    const r1 = Math.floor((y + radius) / BLOCK);
    let bestDepth = 0;
    let bx = 0;
    let by = 0;
    let hit = false;

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!blocksAt(arena, c, r)) continue;
        const left = c * BLOCK;
        const top = r * BLOCK;
        const px = x < left ? left : x > left + BLOCK ? left + BLOCK : x;
        const py = y < top ? top : y > top + BLOCK ? top + BLOCK : y;
        const dx = x - px;
        const dy = y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 > radius * radius) continue;

        let nx: number;
        let ny: number;
        let depth: number;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          nx = dx / d;
          ny = dy / d;
          depth = radius - d;
        } else {
          const toL = x - left;
          const toR = left + BLOCK - x;
          const toT = y - top;
          const toB = top + BLOCK - y;
          const min = Math.min(toL, toR, toT, toB);
          nx = min === toL ? -1 : min === toR ? 1 : 0;
          ny = min === toT ? -1 : min === toB ? 1 : 0;
          depth = radius + min;
        }
        if (depth > bestDepth) {
          bestDepth = depth;
          bx = nx * depth;
          by = ny * depth;
          hit = true;
        }
      }
    }
    if (!hit) break;
    x += bx;
    y += by;
  }
  return {
    x: Math.min(ARENA_W - TANK_RADIUS, Math.max(TANK_RADIUS, x)),
    y: Math.min(ARENA_H - TANK_RADIUS, Math.max(TANK_RADIUS, y)),
  };
}

/** Axis-separated move so a tank pressed into a wall still glides along it. */
export function moveWithWalls(arena: Arena, pos: Vec2, dx: number, dy: number, radius = TANK_RADIUS): Vec2 {
  const afterX = resolveCircle(arena, { x: pos.x + dx, y: pos.y }, radius);
  const afterY = resolveCircle(arena, { x: afterX.x, y: pos.y + dy }, radius);
  return { x: afterX.x, y: afterY.y };
}

/** Unobstructed straight drive between two world points. */
export function hasClearPath(arena: Arena, ax: number, ay: number, bx: number, by: number, radius = 0): boolean {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(2, Math.ceil(dist / (BLOCK * 0.3)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!isSpotFree(arena, ax + (bx - ax) * t, ay + (by - ay) * t, Math.max(1, radius))) return false;
  }
  return true;
}

export function isGround(arena: Arena, x: number, y: number): boolean {
  return isWalkable(cellAt(arena, Math.floor(x / BLOCK), Math.floor(y / BLOCK)));
}
