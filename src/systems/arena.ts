import { FIELD, BLOCK } from '../core/constants';
import type { Rng } from '../core/rng';

/**
 * Battlefield generation.
 *
 * The grid is a single 13x13 screen of 1-block cells, exactly like the
 * console original: everything is visible at once, there is no scrolling, and
 * passages are two blocks wide because a tank covers 2x2.
 */

export const enum Cell {
  Floor = 0,
  Brick = 1, // destructible
  Steel = 2, // indestructible
  Water = 3, // slows nothing, blocks movement
  Trees = 4, // blocks movement, bullets pass through
  Ice = 5, // slippery
  Oil = 6, // hazard, damages whatever sits in it
  Rubble = 7, // a brick that was shot through
  Base = 8, // the eagle
}

export interface Arena {
  cols: number;
  rows: number;
  cells: Uint8Array;
  rooms: Rect[];
  playerStart: { col: number; row: number };
  spawnPoints: { col: number; row: number }[];
  /** True when the eagle is still standing. */
  baseAlive: boolean;
}

export interface Rect {
  col: number;
  row: number;
  w: number;
  h: number;
}

export const COLS = FIELD;
export const ROWS = FIELD;

export function cellAt(a: Arena, col: number, row: number): Cell {
  if (col < 0 || row < 0 || col >= a.cols || row >= a.rows) return Cell.Steel;
  return a.cells[row * a.cols + col] as Cell;
}

export function setCell(a: Arena, col: number, row: number, v: Cell) {
  if (col < 0 || row < 0 || col >= a.cols || row >= a.rows) return;
  a.cells[row * a.cols + col] = v;
}

export function isWalkable(c: Cell): boolean {
  return c === Cell.Floor || c === Cell.Rubble || c === Cell.Ice || c === Cell.Oil;
}

/** Blocks a tank's body. */
export function blocksBody(c: Cell): boolean {
  return c === Cell.Brick || c === Cell.Steel || c === Cell.Water || c === Cell.Trees || c === Cell.Base;
}

/** Blocks a shell. Water and trees do not. */
export function blocksShot(c: Cell): boolean {
  return c === Cell.Brick || c === Cell.Steel || c === Cell.Base;
}

/** Blocks line of sight. Trees do not. */
export function blocksSight(c: Cell): boolean {
  return c === Cell.Brick || c === Cell.Steel || c === Cell.Base;
}

function carve(a: Arena, r: Rect) {
  for (let y = r.row; y < r.row + r.h; y++)
    for (let x = r.col; x < r.col + r.w; x++) setCell(a, x, y, Cell.Floor);
}

/** Two-block-wide L corridor between two cell centres. */
function corridor(a: Arena, from: { col: number; row: number }, to: { col: number; row: number }, rng: Rng) {
  let { col: x, row: y } = from;
  // a two-block-wide lane, stamped around the head of the path
  const stamp = () => {
    for (let oy = -1; oy <= 0; oy++)
      for (let ox = -1; ox <= 0; ox++) {
        if (x + ox >= 0 && y + oy >= 0 && x + ox < a.cols && y + oy < a.rows) setCell(a, x + ox, y + oy, Cell.Floor);
      }
  };
  stamp();
  const horizFirst = rng.bool();
  const goX = () => { while (x !== to.col) { x += Math.sign(to.col - x); stamp(); } };
  const goY = () => { while (y !== to.row) { y += Math.sign(to.row - y); stamp(); } };
  if (horizFirst) { goX(); goY(); } else { goY(); goX(); }
  stamp();
}

/** Punch a two-wide doorway through the wall between two rooms. */
function door(a: Arena, col: number, row: number, horizontal: boolean) {
  if (horizontal) {
    for (let dy = 0; dy <= 1; dy++) for (let dx = -1; dx <= 0; dx++) setCell(a, col + dx, row + dy, Cell.Floor);
  } else {
    for (let dy = -1; dy <= 0; dy++) for (let dx = 0; dx <= 1; dx++) setCell(a, col + dx, row + dy, Cell.Floor);
  }
}

/** BSP split of the field into blocks of rooms. */
function split(rng: Rng, area: Rect, depth: number, min: number, out: Rect[]) {
  const canX = area.w >= min * 2;
  const canY = area.h >= min * 2;
  if (depth <= 0 || (!canX && !canY)) {
    out.push(area);
    return;
  }
  const vertical = canX && (!canY || (area.w >= area.h ? true : rng.bool()));
  if (vertical) {
    const cut = rng.int(min, area.w - min + 1);
    split(rng, { ...area, w: cut }, depth - 1, min, out);
    split(rng, { ...area, col: area.col + cut, w: area.w - cut }, depth - 1, min, out);
  } else {
    const cut = rng.int(min, area.h - min + 1);
    split(rng, { ...area, h: cut }, depth - 1, min, out);
    split(rng, { ...area, row: area.row + cut, h: area.h - cut }, depth - 1, min, out);
  }
}

export function generateArena(rng: Rng, depth: number): Arena {
  const arena: Arena = {
    cols: COLS,
    rows: ROWS,
    // brick is the default mass: everything that is not carved out later stays
    // destructible, and only the rim is armoured
    cells: new Uint8Array(COLS * ROWS).fill(Cell.Brick),
    rooms: [],
    playerStart: { col: 4, row: ROWS - 2 },
    spawnPoints: [],
    baseAlive: true,
  };

  // ---------------------------------------------------------------- rooms
  // Regions tile the field; each becomes an inset room, and the leftover is
  // the one-block wall that separates neighbours.
  const regions: Rect[] = [];
  split(rng, { col: 1, row: 1, w: COLS - 2, h: ROWS - 2 }, 3, 4, regions);
  const rooms: Rect[] = regions
    .filter((r) => r.w >= 3 && r.h >= 3)
    .map((r) => ({
      col: r.col + (r.w >= 5 ? 1 : 0),
      row: r.row + (r.h >= 5 ? 1 : 0),
      w: r.w >= 5 ? r.w - 2 : r.w,
      h: r.h >= 5 ? r.h - 2 : r.h,
    }));
  arena.rooms = rooms;
  for (const r of rooms) carve(arena, r);

  const centres = rooms.map((r) => ({ col: r.col + Math.floor(r.w / 2), row: r.row + Math.floor(r.h / 2) }));

  // ------------------------------------------------------------- passages
  // Rooms whose walls touch get a punched door; the rest are linked by
  // two-wide corridors so the whole field stays reachable.
  const linked = new Set([0]);
  const waiting = rooms.map((_, i) => i).slice(1);
  const cand: [number, number][] = [];
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      const gx = Math.max(0, Math.max(b.col - (a.col + a.w), a.col - (b.col + b.w)));
      const gy = Math.max(0, Math.max(b.row - (a.row + a.h), a.row - (b.row + b.h)));
      if (gx + gy <= 1) cand.push([i, j]);
    }
  rng.shuffle(cand);
  for (const [i, j] of cand) {
    const a = rooms[i];
    const b = rooms[j];
    if (Math.abs(b.row - a.row) < Math.min(a.h, b.h)) door(arena, b.col - 1, Math.floor((a.row + b.row) / 2), true);
    else if (Math.abs(b.col - a.col) < Math.min(a.w, b.w)) door(arena, Math.floor((a.col + b.col) / 2), b.row - 1, false);
    if (waiting.includes(j)) waiting.splice(waiting.indexOf(j), 1);
    if (!linked.has(j)) linked.add(j);
  }
  let guard = 0;
  while (waiting.length && guard++ < 20) {
    let ba = 0;
    let bb = waiting[0];
    let bd = Infinity;
    for (const a of linked)
      for (const b of waiting) {
        const d = Math.abs(centres[a].col - centres[b].col) + Math.abs(centres[a].row - centres[b].row);
        if (d < bd) { bd = d; ba = a; bb = b; }
      }
    corridor(arena, centres[ba], centres[bb], rng);
    waiting.splice(waiting.indexOf(bb), 1);
    linked.add(bb);
  }
  // a couple of loops so the layout is not a pure tree
  for (let i = 0; i < 2 && rooms.length > 2; i++) {
    const a = rng.int(0, rooms.length);
    const b = rng.int(0, rooms.length);
    if (a === b) continue;
    if (rng.bool(0.5)) corridor(arena, centres[a], centres[b], rng);
    else {
      const A = rooms[a];
      const B = rooms[b];
      if (Math.abs(B.row - A.row) < Math.min(A.h, B.h)) door(arena, B.col - 1, Math.floor((A.row + B.row) / 2), true);
      else if (Math.abs(B.col - A.col) < Math.min(A.w, B.w)) door(arena, Math.floor((A.col + B.col) / 2), B.row - 1, false);
    }
  }

  // ----------------------------------------------------------------- rim
  // The one-block steel border is the last thing the console lets you shoot,
  // and it is what keeps tanks on the screen.
  for (let i = 0; i < COLS; i++) {
    setCell(arena, i, 0, Cell.Steel);
    setCell(arena, i, ROWS - 1, Cell.Steel);
  }
  for (let i = 0; i < ROWS; i++) {
    setCell(arena, 0, i, Cell.Steel);
    setCell(arena, COLS - 1, i, Cell.Steel);
  }

  // ------------------------------------------------------------------ base
  // The eagle sits dead centre of the bottom wall, boxed in by brick.
  const baseCol = Math.floor(COLS / 2) - 1;
  const baseRow = ROWS - 2;
  setCell(arena, baseCol, baseRow, Cell.Base);
  setCell(arena, baseCol + 1, baseRow, Cell.Base);
  setCell(arena, baseCol, baseRow - 1, Cell.Steel);
  setCell(arena, baseCol + 1, baseRow - 1, Cell.Steel);
  // brick nest on both flanks
  for (let i = 0; i < 2; i++) {
    setCell(arena, baseCol - 1 - i, baseRow, Cell.Brick);
    setCell(arena, baseCol + 2 + i, baseRow, Cell.Brick);
    setCell(arena, baseCol - 1 - i, baseRow - 1, Cell.Brick);
    setCell(arena, baseCol + 2 + i, baseRow - 1, Cell.Brick);
  }

  // ---------------------------------------------------------- player start
  // Two blocks up from the bottom wall, on the left — where the console puts you.
  let start = { col: 4, row: ROWS - 2 };
  for (let col = 1; col < COLS - 1; col++) {
    if (isWalkable(cellAt(arena, col, ROWS - 2)) && isWalkable(cellAt(arena, col + 1, ROWS - 2))) {
      start = { col, row: ROWS - 2 };
      break;
    }
  }
  arena.playerStart = start;

  // ------------------------------------------------------------- dressing
  // Scatter cover with depth, but never seal a room shut: each candidate is
  // rejected if it would leave any walkable cell unreachable.
  for (let attempt = 0; attempt < 34 + depth * 4; attempt++) {
    const col = rng.int(1, COLS - 2);
    const row = rng.int(1, ROWS - 3);
    if (cellAt(arena, col, row) !== Cell.Floor) continue;
    // keep the spawn lanes and the base approach clear
    if (row >= ROWS - 3) continue;
    if (col >= start.col - 1 && col <= start.col + 2 && row >= start.row - 2) continue;
    if (Math.abs(col - baseCol) <= 2 && row >= ROWS - 4) continue;

    const roll = rng.next();
    let put: Cell;
    if (roll < 0.5) put = Cell.Brick;
    else if (roll < 0.58) put = Cell.Steel;
    else if (roll < 0.7) put = Cell.Water;
    else if (roll < 0.82) put = Cell.Trees;
    else if (roll < 0.9) put = Cell.Ice;
    else if (depth >= 3) put = Cell.Oil;
    else continue;

    setCell(arena, col, row, put);
    if (!isConnected(arena)) {
      setCell(arena, col, row, Cell.Floor);
    }
  }

  // --------------------------------------------------------------- spawns
  const pts: { col: number; row: number }[] = [];
  for (let row = 0; row < ROWS - 2; row++)
    for (let col = 0; col < COLS; col++) {
      if (!isWalkable(cellAt(arena, col, row))) continue;
      const far = Math.hypot(col - start.col, row - start.row) > 6;
      const top = row <= 3;
      if (far || top) pts.push({ col, row });
    }
  rng.shuffle(pts);
  arena.spawnPoints = pts.slice(0, 24);
  // the top three rows are the classic drop-in zone
  for (let col = 1; col + 1 < COLS; col += 2) {
    for (let row = 0; row < 2; row++) {
      if (isWalkable(cellAt(arena, col, row)) && isWalkable(cellAt(arena, col + 1, row))) {
        arena.spawnPoints.push({ col, row });
      }
    }
  }
  // fall back to any walkable cell if generation got paranoid
  if (arena.spawnPoints.length < 6) {
    for (let row = 0; row < ROWS - 2 && arena.spawnPoints.length < 12; row++)
      for (let col = 0; col < COLS && arena.spawnPoints.length < 12; col++)
        if (isWalkable(cellAt(arena, col, row))) arena.spawnPoints.push({ col, row });
  }

  return arena;
}

/** Flood fill from the player start; used to reject sealing placements. */
function isConnected(a: Arena): boolean {
  const start = a.playerStart;
  const seen = new Uint8Array(a.cols * a.rows);
  const q: number[] = [start.row * a.cols + start.col];
  seen[q[0]] = 1;
  let total = 0;
  for (let y = 0; y < a.rows; y++) for (let x = 0; x < a.cols; x++) if (isWalkable(cellAt(a, x, y))) total++;
  let reached = 1;
  while (q.length) {
    const cur = q.pop()!;
    const cx = cur % a.cols;
    const cy = (cur - cx) / a.cols;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= a.cols || ny >= a.rows) continue;
      const i = ny * a.cols + nx;
      if (seen[i] || !isWalkable(cellAt(a, nx, ny))) continue;
      seen[i] = 1;
      reached++;
      q.push(i);
    }
  }
  return reached === total;
}

export function baseCell(arena: Arena): { col: number; row: number } {
  return { col: Math.floor(arena.cols / 2) - 1, row: arena.rows - 2 };
}

/** Centre of a cell in world pixels. */
export function cellCentre(col: number, row: number): { x: number; y: number } {
  return { x: col * BLOCK + BLOCK / 2, y: row * BLOCK + BLOCK / 2 };
}

/** Straight-line visibility test between two world points. */
export function hasLineOfSight(arena: Arena, ax: number, ay: number, bx: number, by: number): boolean {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / (BLOCK * 0.4));
  if (steps <= 0) return true;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const col = Math.floor((ax + (bx - ax) * t) / BLOCK);
    const row = Math.floor((ay + (by - ay) * t) / BLOCK);
    if (blocksSight(cellAt(arena, col, row))) return false;
  }
  return true;
}
