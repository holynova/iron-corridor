import { Rng, randomSeed } from '../core/rng';
import { baseStats, draftUpgrades, getUpgrade, type PlayerStats, type Upgrade } from '../data/upgrades';
import { meta } from '../core/meta';
import { DEPTH } from '../core/constants';

export type RunPhase = 'active' | 'draft' | 'dead' | 'paused' | 'victory';

export class RunState {
  readonly seed: number;
  readonly rng: Rng;
  depth = 1;
  wave = 0;
  phase: RunPhase = 'active';
  /** run-scoped accumulators */
  kills = 0;
  score = 0;
  scrap = 0;
  xp = 0;
  level = 1;
  xpNext = 18;
  shotsFired = 0;
  shotsHit = 0;
  startedAt = 0;
  elapsed = 0;
  /** upgrade stacks */
  readonly owned: Record<string, number> = {};
  stats: PlayerStats;
  hp: number;
  /** pending draft offers */
  offers: Upgrade[] = [];
  draftKind: 'levelup' | 'blessing' | 'none' = 'none';
  /** drafts earned but not yet shown; they queue up one at a time */
  draftQueue: ('levelup' | 'blessing')[] = [];
  pendingDepths = 0;
  /** remaining lives, shown as tank icons in the status strip */
  lives = 3;
  bossActive = false;
  bossHp = 0;
  bossName = '';
  damageDealt = 0;
  damageTaken = 0;

  constructor(seed = randomSeed()) {
    this.seed = seed >>> 0 || 1;
    this.rng = new Rng(this.seed);
    this.stats = baseStats();
    const m = meta();
    this.stats.maxHp += m.upgrades.hull ? m.upgrades.hull * 20 : 0;
    this.stats.damage += m.upgrades.barrel ? m.upgrades.barrel * 2 : 0;
    if (m.upgrades.loader) this.stats.fireRate *= Math.pow(0.93, m.upgrades.loader);
    if (m.upgrades.engine) this.stats.speed *= 1 + m.upgrades.engine * 0.04;
    if (m.upgrades.salvage) this.stats.scrapBonus += m.upgrades.salvage * 0.2;
    this.hp = this.stats.maxHp;
    this.startedAt = performance.now();
  }

  get repairOnDepth(): number {
    const lvl = meta().upgrades.repair ?? 0;
    return lvl > 0 ? this.stats.maxHp * 0.06 * lvl : 0;
  }

  get accuracy(): number {
    return this.shotsFired === 0 ? 0 : this.shotsHit / this.shotsFired;
  }

  get damageMult(): number {
    return 1 + (this.depth - 1) * 0.06;
  }

  addUpgrade(u: Upgrade): void {
    this.owned[u.id] = (this.owned[u.id] ?? 0) + 1;
    const beforeMax = this.stats.maxHp;
    u.apply(this.stats);
    if (this.stats.maxHp > beforeMax) this.hp += this.stats.maxHp - beforeMax;
    this.hp = Math.min(this.hp, this.stats.maxHp);
  }

  grantXp(amount: number): boolean {
    this.xp += amount;
    let leveled = false;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = Math.round(this.xpNext * 1.32 + 8);
      leveled = true;
    }
    return leveled;
  }

  addScrap(base: number): number {
    const amount = Math.max(1, Math.round(base * (1 + this.stats.scrapBonus)));
    this.scrap += amount;
    return amount;
  }

  /** Queue a draft. Several can be pending at once (multi-level kills). */
  enqueueDraft(kind: 'levelup' | 'blessing'): void {
    this.draftQueue.push(kind);
  }

  /**
   * Show the next queued draft. Returns false when the queue is empty or
   * nothing is left to offer, in which case the caller should move on.
   */
  openNextDraft(count = 3): boolean {
    if (this.draftKind !== 'none') return true;
    while (this.draftQueue.length) {
      const kind = this.draftQueue.shift()!;
      const offers = draftUpgrades(this.rng, this.owned, count, this.depth);
      if (!offers.length) continue;
      this.offers = offers;
      this.draftKind = kind;
      this.phase = 'draft';
      return true;
    }
    return false;
  }

  get hasPendingDrafts(): boolean {
    return this.draftQueue.length > 0;
  }

  chooseUpgrade(id: string): void {
    const u = getUpgrade(id);
    if (u) this.addUpgrade(u);
    this.offers = [];
    this.draftKind = 'none';
    this.phase = 'active';
  }

  nextDepth(): void {
    this.depth++;
    this.wave = 0;
    this.bossActive = false;
  }

  isBossDepth(): boolean {
    return this.depth % DEPTH.bossEvery === 0;
  }

  finish(reason: 'dead' | 'victory'): void {
    this.phase = reason;
    this.elapsed = (performance.now() - this.startedAt) / 1000;
  }
}
