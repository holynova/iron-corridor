import { BLOCK } from '../core/constants';
import { isWalkable, cellAt, type Arena } from './arena';

/**
 * Breadth-first distance field over the block grid, rebuilt from the player a
 * few times a second. Enemies walk down the gradient, which is what lets them
 * route around brick instead of grinding into it.
 */
export class FlowField {
  private arena: Arena;
  private dist: Int16Array;
  private queue: Int32Array;

  constructor(arena: Arena) {
    this.arena = arena;
    this.dist = new Int16Array(arena.cols * arena.rows);
    this.queue = new Int32Array(arena.cols * arena.rows);
  }

  at(col: number, row: number): number {
    if (col < 0 || row < 0 || col >= this.arena.cols || row >= this.arena.rows) return 32767;
    return this.dist[row * this.arena.cols + col];
  }

  rebuild(wx: number, wy: number): void {
    const { cols, rows } = this.arena;
    this.dist.fill(32767);
    let col = clamp(Math.floor(wx / BLOCK), 0, cols - 1);
    let row = clamp(Math.floor(wy / BLOCK), 0, rows - 1);

    let start = row * cols + col;
    if (!isWalkable(this.arena.cells[start] as never)) {
      const alt = this.nearestWalkable(col, row);
      if (alt < 0) return;
      start = alt;
    }

    let head = 0;
    let tail = 0;
    this.queue[tail++] = start;
    this.dist[start] = 0;
    while (head < tail) {
      const cur = this.queue[head++];
      const d = this.dist[cur];
      if (d > 120) continue;
      const cx = cur % cols;
      const cy = (cur - cx) / cols;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (this.dist[ni] !== 32767) continue;
        if (!isWalkable(cellAt(this.arena, nx, ny))) continue;
        this.dist[ni] = d + 1;
        this.queue[tail++] = ni;
      }
    }
  }

  private nearestWalkable(col: number, row: number): number {
    const { cols, rows } = this.arena;
    for (let r = 1; r < 6; r++)
      for (let oy = -r; oy <= r; oy++)
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          const c = col + ox;
          const y = row + oy;
          if (c < 0 || y < 0 || c >= cols || y >= rows) continue;
          const i = y * cols + c;
          if (isWalkable(this.arena.cells[i] as never)) return i;
        }
    return -1;
  }

  /** Steering direction toward the goal, sampled from the eight neighbours. */
  direction(wx: number, wy: number): Vec2 | null {
    const { cols, rows } = this.arena;
    const cx = clamp(Math.floor(wx / BLOCK), 0, cols - 1);
    const cy = clamp(Math.floor(wy / BLOCK), 0, rows - 1);
    let best = this.at(cx, cy);
    let bestAngle: number | null = null;

    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue;
        const v = this.at(cx + ox, cy + oy);
        if (v >= best) continue;
        best = v;
        // aim at the shared edge midpoint so tanks hug corners less
        const tx = (cx + ox) * BLOCK + BLOCK / 2 - (ox === 0 ? 0 : ox > 0 ? -BLOCK * 0.3 : BLOCK * 0.3);
        const ty = (cy + oy) * BLOCK + BLOCK / 2 - (oy === 0 ? 0 : oy > 0 ? -BLOCK * 0.3 : BLOCK * 0.3);
        const dx = tx - wx;
        const dy = ty - wy;
        const m = Math.hypot(dx, dy);
        if (m > 1e-3) bestAngle = Math.atan2(dy / m, dx / m);
      }
    }
    if (bestAngle === null) return null;
    return { x: Math.cos(bestAngle), y: Math.sin(bestAngle) };
  }

  reachable(wx: number, wy: number): boolean {
    return this.at(Math.floor(wx / BLOCK), Math.floor(wy / BLOCK)) < 32767;
  }
}

interface Vec2 {
  x: number;
  y: number;
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
