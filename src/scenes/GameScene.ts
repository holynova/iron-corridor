import Phaser from 'phaser';
import { VIEW, BLOCK, ARENA_W, ARENA_H, FIELD_X, FIELD_Y, LAYER, DEPTH_TINT } from '../core/constants';
import { Rng } from '../core/rng';
import { Cell, cellAt, generateArena, hasLineOfSight, baseCell, type Arena } from '../systems/arena';
import { isSpotFree, resolveCircle } from '../systems/collision';
import { FlowField } from '../systems/flowfield';
import { RunState } from '../systems/RunState';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Bullet, type BulletOpts } from '../entities/Bullet';
import { Pickup, type PickupId } from '../entities/Pickup';
import { ENEMIES, enemyPool, scaledStats, type EnemyDef } from '../data/enemies';
import { audioOf } from '../core/audio';
import { Hud } from '../ui/Hud';
import { PixelText } from '../ui/PixelText';

export interface GameCallbacks {
  onRunEnd: (run: RunState, victory: boolean) => void;
  onDraft: (run: RunState) => void;
}

const TERRAIN: Record<string, string> = {
  [Cell.Brick]: 't_brick',
  [Cell.Rubble]: 't_brickHalf',
  [Cell.Steel]: 't_steel',
  [Cell.Water]: 't_water',
  [Cell.Trees]: 't_trees',
  [Cell.Ice]: 't_ice',
  [Cell.Oil]: 't_oil',
};

export class GameScene extends Phaser.Scene {
  run!: RunState;
  arena!: Arena;
  player!: Player;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private enemyBullets: Bullet[] = [];
  private pickups: Pickup[] = [];
  private hud!: Hud;
  private flow!: FlowField;
  private flowTimer = 0;
  private spawnQueue: { kind: EnemyDef['kind']; at: number; elite: boolean }[] = [];
  private waveTotal = 0;
  private waveSpawned = 0;
  private waveTimer = 0;
  private waveState: 'idle' | 'incoming' | 'clearing' | 'interlude' | 'boss' = 'idle';
  private interludeTime = 0;
  private cb!: GameCallbacks;
  private arenaLayer!: Phaser.GameObjects.Container;
  private waterTiles: Phaser.GameObjects.Image[] = [];
  private pointerHeld = false;
  private spaceHeld = false;
  private bossPending = false;
  private hazardTick = 0;
  private freezeTimer = 0;
  private vignette!: Phaser.GameObjects.Image;
  private shakeTime = 0;

  constructor() {
    super('game');
  }

  init(data: { run: RunState; callbacks: GameCallbacks }) {
    this.run = data.run;
    this.cb = data.callbacks;
  }

  create() {
    const audio = audioOf(this);
    this.physics.world.setBounds(0, 0, ARENA_W, ARENA_H);
    this.cameras.main.setBackgroundColor(0x000000);
    // the whole battlefield is on screen at once, exactly like the console.
    // world (0,0) is the top-left of the field, so the camera is pulled back
    // by the frame's inset to place it inside the bezel.
    this.cameras.main.setScroll(-FIELD_X, -FIELD_Y);

    this.buildFrame();
    this.buildArena();
    this.player = new Player(this, this.run);
    this.hud = new Hud(this);
    this.hud.setDepth(this.run.depth);

    this.vignette = this.add
      .image(0, 0, 'vignette')
      .setDisplaySize(VIEW.width + 200, VIEW.height + 200)
      .setTint(0xe45820)
      .setAlpha(0)
      .setDepth(LAYER.ui - 2)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.setupInput();
    audio.resume();
    audio.startMusic(this.run.seed);
    audio.setIntensity(0.25);

    this.events.on('resume-game', () => {
      if (this.run.phase === 'paused') this.togglePause();
    }, this);
    this.events.on('quit-to-menu', () => session_menu(), this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      audio.stopMusic();
    });

    this.startDepth();
    this.hud.banner(`DEPTH ${this.run.depth}`, this.run.isBossDepth() ? 'WARNING' : '清除所有敌方单位');
  }

  /** Static bezel: a steel frame around the battlefield plus a status strip. */
  private buildFrame() {
    const g = this.add.graphics().setDepth(LAYER.ground - 2);
    g.fillStyle(0x0d0d14, 1);
    g.fillRect(0, 0, VIEW.width, VIEW.height);
    g.fillStyle(0x000000, 1);
    g.fillRect(FIELD_X, FIELD_Y, ARENA_W, ARENA_H);
    // double outline, like the console's playfield border
    g.lineStyle(2, 0x7c7c7c, 1);
    g.strokeRect(FIELD_X - 3, FIELD_Y - 3, ARENA_W + 6, ARENA_H + 6);
    g.lineStyle(1, 0xfcfcfc, 0.5);
    g.strokeRect(FIELD_X - 6, FIELD_Y - 6, ARENA_W + 12, ARENA_H + 12);
    // corner studs
    g.fillStyle(0xbcbcbc, 1);
    for (const [x, y] of [
      [FIELD_X - 3, FIELD_Y - 3], [FIELD_X + ARENA_W + 3, FIELD_Y - 3],
      [FIELD_X - 3, FIELD_Y + ARENA_H + 3], [FIELD_X + ARENA_W + 3, FIELD_Y + ARENA_H + 3],
    ]) g.fillRect(x - 2, y - 2, 4, 4);
  }

  // ------------------------------------------------------------------ arena

  private buildArena() {
    this.arenaLayer?.destroy(true);
    this.arenaLayer = this.add.container(0, 0).setDepth(LAYER.ground);
    this.waterTiles = [];

    this.arena = generateArena(this.run.rng, this.run.depth);
    this.flow = new FlowField(this.arena);
    this.flowTimer = 0;

    const rnd = new Rng(this.run.seed ^ (this.run.depth * 2654435761));
    const depthTint = DEPTH_TINT[Math.min(DEPTH_TINT.length - 1, this.run.depth)];

    // water is one tiled sprite per run of water rows; keep it cheap
    for (let y = 0; y < this.arena.rows; y++) {
      for (let x = 0; x < this.arena.cols; x++) {
        const c = cellAt(this.arena, x, y);
        const tex = TERRAIN[c];
        if (!tex) continue;
        if (c === Cell.Water && rnd.bool(0.85)) {
          // batch: leave a sparse checker of water sprites so we can animate
          if ((x + y) % 2 === 0) continue;
        }
        const img = this.add
          .image(x * BLOCK, y * BLOCK, tex)
          .setOrigin(0)
          .setDepth(LAYER.ground + 1)
          .setDisplaySize(BLOCK, BLOCK);
        if (c === Cell.Water) {
          img.setAlpha(0.92);
          this.waterTiles.push(img);
          this.tweens.add({ targets: img, alpha: 0.72, duration: 620, yoyo: true, repeat: -1, delay: rnd.range(0, 300) });
        }
        if (c === Cell.Steel) img.setTint(0xd8d8d8);
        if (c === Cell.Brick) img.setTint(0xf0d8c0);
        if (c === Cell.Ice) img.setAlpha(0.8);
        if (c === Cell.Trees) img.setAlpha(0.95);
        void depthTint;
        this.arenaLayer.add(img);
      }
    }

    // the eagle and its brick nest
    const base = baseCell(this.arena);
    for (const off of [0, 1]) {
      const wall = this.add
        .image((base.col + off) * BLOCK, (base.row - 1) * BLOCK, 't_steel')
        .setOrigin(0)
        .setDisplaySize(BLOCK, BLOCK)
        .setDepth(LAYER.base);
      this.arenaLayer.add(wall);
    }
    this.eagle = this.add
      .image((base.col + 0.5) * BLOCK, (base.row + 0.5) * BLOCK, 'eagle')
      .setDisplaySize(BLOCK * 2, BLOCK * 2)
      .setDepth(LAYER.base + 1);
    this.arenaLayer.add(this.eagle);
  }

  private eagle!: Phaser.GameObjects.Image;

  // ------------------------------------------------------------------ input

  private setupInput() {
    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', () => this.togglePause());
    kb.on('keydown-P', () => this.togglePause());
    this.pointerHeld = false;
    this.input.on('pointerdown', () => {
      this.pointerHeld = true;
      this.player?.tryFire();
    });
    this.input.on('pointerup', () => {
      this.pointerHeld = false;
    });
    this.input.on('pointerupoutside', () => {
      this.pointerHeld = false;
    });
    this.game.events.on(Phaser.Core.Events.BLUR, () => {
      this.pointerHeld = false;
      this.spaceHeld = false;
    });
    kb.on('keydown-SPACE', () => {
      this.spaceHeld = true;
      this.player?.tryFire();
    });
    kb.on('keyup-SPACE', () => {
      this.spaceHeld = false;
    });
    kb.on('keydown-SHIFT', () => this.player?.tryDash());
    kb.on('keydown-F', () => this.player?.tryDash());
  }

  togglePause() {
    if (this.run.phase === 'draft' || this.run.phase === 'dead' || this.run.phase === 'victory') return;
    if (this.run.phase === 'paused') {
      this.run.phase = 'active';
      this.hud.setPaused(false);
    } else {
      this.run.phase = 'paused';
      this.hud.setPaused(true);
    }
  }

  // ------------------------------------------------------------------ depth

  startDepth() {
    this.buildArena();
    for (const e of this.enemies) e.destroy();
    this.enemies = [];
    for (const b of this.bullets) b.destroy();
    this.bullets = [];
    for (const eb of this.enemyBullets) eb.destroy();
    this.enemyBullets = [];
    for (const p of this.pickups) p.destroy();
    this.pickups = [];
    this.spawnQueue = [];
    this.waveState = 'idle';
    this.waveTotal = 0;
    this.waveSpawned = 0;
    this.waveTimer = 0;
    this.run.bossActive = false;
    this.bossPending = false;
    this.run.draftQueue = [];
    this.run.draftKind = 'none';

    const s = this.arena.playerStart;
    this.player.relocate(s.col * BLOCK + BLOCK, s.row * BLOCK + BLOCK);
    this.player.hp = Math.min(this.run.stats.maxHp, this.player.hp + this.run.repairOnDepth);
    this.hud.hideBoss();

    if (this.run.isBossDepth()) this.queueBoss();
    else {
      this.waveState = 'interlude';
      this.interludeTime = 2.2;
    }
  }

  private beginWave(index: number) {
    this.run.wave = index;
    const depth = this.run.depth;
    const isElite = depth >= 4 && index % 2 === 0;
    const count = Math.min(20, Math.round(3 + depth * 0.85 + index * 1.6 + (isElite ? 2 : 0)));
    this.waveTotal = count;
    this.waveSpawned = 0;
    this.waveState = 'incoming';
    this.spawnQueue = [];
    const pool = enemyPool(depth);
    for (let i = 0; i < count; i++) {
      const def = this.pickEnemyKind(pool);
      this.spawnQueue.push({ kind: def.kind, at: i * Math.max(0.5, 1.1 - depth * 0.02), elite: isElite && i % 4 === 0 });
    }
    this.waveTimer = 0;
    this.hud.setWave(count, index, 1);
    this.hud.banner(`WAVE ${index}`, `${count} 辆敌对单位`);
  }

  private pickEnemyKind(pool: EnemyDef[]): EnemyDef {
    const total = pool.reduce((a, e) => a + e.weight, 0);
    let r = this.run.rng.next() * total;
    for (const e of pool) {
      r -= e.weight;
      if (r <= 0) return e;
    }
    return pool[pool.length - 1];
  }

  private queueBoss() {
    this.waveState = 'boss';
    this.bossPending = true;
    const audio = audioOf(this);
    audio.play('bossRoar');
    audio.setIntensity(1);
    this.hud.banner('WARNING', '钢铁霸主出现');
    this.time.delayedCall(1400, () => {
      const spot = this.pickSpawnPoint(BLOCK * 8) ?? this.pickSpawnPoint(0);
      if (spot) this.spawnEnemy('boss', spot.x, spot.y, false);
      this.bossPending = false;
    });
  }

  // ------------------------------------------------------------------ loop

  override update(_t: number, delta: number) {
    const dt = Math.min(48, delta) / 1000;
    if (this.run.phase === 'dead' || this.run.phase === 'victory' || this.run.phase === 'draft') return;

    this.run.elapsed = (performance.now() - this.run.startedAt) / 1000;
    this.player.update(dt, this.aimPoint());
    this.rebuildFlow(dt);
    if (this.pointerHeld || this.spaceHeld) this.player.tryFire();
    this.applySlowAura();
    this.updateHazards(dt);

    if (this.freezeTimer > 0) {
      this.freezeTimer -= dt;
    } else {
      for (const e of this.enemies) e.update(dt, this.player);
    }
    this.separate(dt);
    for (const b of this.bullets) b.update(dt);
    for (const b of this.enemyBullets) b.update(dt);
    for (const p of this.pickups) p.update(dt);

    this.cull();
    this.updateWaves(dt);
    this.hud.update(dt);
    this.updateScreenEffects(dt);
    this.trackShake(dt);

    if (this.player.hp <= 0) this.onPlayerDeath();
  }

  private aimPoint(): { x: number; y: number } {
    const p = this.input.activePointer;
    // the pointer is in screen space; the field sits inside a fixed panel
    return { x: p.x - FIELD_X, y: p.y - FIELD_Y };
  }

  private rebuildFlow(dt: number) {
    this.flowTimer -= dt;
    if (this.flowTimer > 0) return;
    this.flowTimer = 0.25;
    this.flow.rebuild(this.player.x, this.player.y);
  }

  flowField(): FlowField {
    return this.flow;
  }

  private applySlowAura() {
    const aura = this.run.stats.slowAura;
    if (aura <= 0) return;
    for (const e of this.enemies) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      e.setSlow(d < BLOCK * 4 ? aura : 0);
    }
  }

  private updateHazards(dt: number) {
    this.hazardTick -= dt;
    if (this.hazardTick > 0) return;
    this.hazardTick = 0.6;
    const c = this.cellAtPlayer();
    if (c === Cell.Oil) {
      this.damagePlayer(3, this.player.x, this.player.y);
      for (let i = 0; i < 2; i++) {
        const f = this.add
          .image(this.player.x + this.run.rng.range(-16, 16), this.player.y + this.run.rng.range(-16, 16), 'p_glow')
          .setDepth(LAYER.fx)
          .setScale(0.2)
          .setTint(0xf87800)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: f, alpha: 0, scale: 0.6, y: f.y - 30, duration: 420, onComplete: () => f.destroy() });
      }
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (cellAt(this.arena, Math.floor(e.x / BLOCK), Math.floor(e.y / BLOCK)) === Cell.Oil) {
        this.damageEnemy(e, 4, false, e.x, e.y - 8);
      }
    }
  }

  private cellAtPlayer(): Cell {
    return cellAt(this.arena, Math.floor(this.player.x / BLOCK), Math.floor(this.player.y / BLOCK));
  }

  /** Soft separation so tanks never stack into one blob. */
  private separate(dt: number) {
    const n = this.enemies.length;
    for (let i = 0; i < n; i++) {
      const a = this.enemies[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.enemies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = BLOCK * 1.7;
        const d2 = dx * dx + dy * dy;
        if (d2 > min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = ((min - d) / min) * BLOCK * 0.9;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push * 0.5;
        a.y -= ny * push * 0.5;
        b.x += nx * push * 0.5;
        b.y += ny * push * 0.5;
      }
    }
    void dt;
  }

  private updateWaves(dt: number) {
    const audio = audioOf(this);
    if (this.waveState === 'interlude') {
      this.interludeTime -= dt;
      audio.setIntensity(0.25);
      if (this.interludeTime <= 0) this.beginWave(this.run.wave + 1);
    } else if (this.waveState === 'incoming') {
      this.waveTimer += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].at <= this.waveTimer) {
        const s = this.spawnQueue.shift()!;
        const spot = this.pickSpawnPoint(0);
        if (spot) this.spawnEnemy(s.kind, spot.x, spot.y, s.elite);
        this.waveSpawned++;
      }
      if (!this.spawnQueue.length) this.waveState = 'clearing';
    } else if (this.waveState === 'clearing') {
      const remaining = this.enemies.length;
      const progress = 1 - remaining / Math.max(1, this.waveTotal);
      this.hud.setWave(this.waveTotal, this.run.wave, progress);
      audio.setIntensity(0.35 + progress * 0.35);
      if (remaining === 0) {
        audio.play('waveClear');
        if (this.run.wave >= 3) {
          this.onDepthCleared();
        } else {
          this.waveState = 'interlude';
          this.interludeTime = 2.6;
          this.dropReward();
          this.player.heal(Math.round(this.run.stats.maxHp * 0.08));
          this.hud.toast('补给已投放');
        }
      }
    } else if (this.waveState === 'boss') {
      if (this.bossPending) return;
      if (!this.enemies.some((e) => e.isBoss)) this.onDepthCleared();
    }
  }

  private onDepthCleared() {
    this.waveState = 'idle';
    const audio = audioOf(this);
    audio.play('waveClear');
    this.hud.banner('DEPTH CLEAR', '选择一项强化');
    if (this.run.depth >= 30) {
      this.run.finish('victory');
      this.cb.onRunEnd(this.run, true);
      return;
    }
    this.time.delayedCall(650, () => {
      this.run.pendingDepths++;
      this.run.enqueueDraft('blessing');
      this.pumpDrafts();
    });
  }

  private pumpDrafts() {
    if (this.run.phase === 'dead' || this.run.phase === 'victory' || this.run.phase === 'draft') return;
    if (this.run.draftKind !== 'none') return;
    if (!this.run.openNextDraft(3)) {
      if (this.run.pendingDepths > 0 && this.waveState === 'idle') {
        this.run.pendingDepths = 0;
        this.advanceDepth();
      }
      return;
    }
    this.cb.onDraft(this.run);
  }

  /**
   * Called by the draft overlay once the player has picked. The overlay only
   * knows how to apply the choice; deciding whether that opens another draft,
   * advances the depth, or drops straight back into the fight is ours.
   */
  resumeFromDraft() {
    if (this.run.phase === 'dead' || this.run.phase === 'victory') return;
    this.pumpDrafts();
  }

  advanceDepth() {
    this.run.nextDepth();
    this.hud.setDepth(this.run.depth);
    this.startDepth();
  }

  private onPlayerDeath() {
    if (this.run.phase === 'dead') return;
    this.run.finish('dead');
    audioOf(this).play('gameOver');
    audioOf(this).setIntensity(0.1);
    this.shake(600, 0.02);
    this.time.delayedCall(1200, () => this.cb.onRunEnd(this.run, false));
  }

  // ------------------------------------------------------------------ spawning

  private pickSpawnPoint(minDist: number): { x: number; y: number } | null {
    const pts = this.arena.spawnPoints.filter((p) => this.flow.reachable(p.col * BLOCK + BLOCK, p.row * BLOCK + BLOCK));
    if (!pts.length) return null;
    const p = this.player;
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 10; i++) {
      const cell = pts[this.run.rng.int(0, pts.length)];
      const x = cell.col * BLOCK + BLOCK;
      const y = cell.row * BLOCK + BLOCK;
      const d = Phaser.Math.Distance.Between(x, y, p.x, p.y);
      if (d < minDist) continue;
      const score = d + this.run.rng.range(0, BLOCK * 6);
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
    if (!best) {
      const cell = pts[this.run.rng.int(0, pts.length)];
      return { x: cell.col * BLOCK + BLOCK, y: cell.row * BLOCK + BLOCK };
    }
    return best;
  }

  spawnEnemy(kind: string, x: number, y: number, elite: boolean) {
    const def = ENEMIES[kind as keyof typeof ENEMIES] ?? ENEMIES.scout;
    const e = new Enemy(this, def, scaledStats(def, this.run.depth), x, y, elite);
    this.enemies.push(e);
    if (kind === 'boss') {
      this.run.bossActive = true;
      this.run.bossHp = e.maxHp;
      this.run.bossName = def.name;
      this.hud.showBoss(def.name);
    }
    return e;
  }

  // ------------------------------------------------------------------ combat api

  arenaRef(): Arena {
    return this.arena;
  }

  spawnPlayerBullet(o: Omit<BulletOpts, 'fromPlayer'>) {
    const b = new Bullet(this, {
      ...o,
      fromPlayer: true,
      x: o.x, y: o.y, angle: o.angle, speed: o.speed, damage: o.damage,
      pierce: o.pierce, color: o.color, crit: o.crit, blast: o.blast,
    });
    this.bullets.push(b);
    this.run.shotsFired++;
    return b;
  }

  spawnEnemyBullet(o: { x: number; y: number; angle: number; speed: number; damage: number; color: number }) {
    const b = new Bullet(this, { ...o, pierce: 0, fromPlayer: false });
    this.enemyBullets.push(b);
    return b;
  }

  private cull() {
    for (let i = this.bullets.length - 1; i >= 0; i--) if (this.bullets[i].dead) this.bullets.splice(i, 1);
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) if (this.enemyBullets[i].dead) this.enemyBullets.splice(i, 1);
    for (let i = this.pickups.length - 1; i >= 0; i--) if (this.pickups[i].dead) this.pickups.splice(i, 1);
  }

  enemiesList(): Enemy[] {
    return this.enemies;
  }

  playerRef(): Player {
    return this.player;
  }

  freezeEnemies(seconds: number) {
    this.freezeTimer = seconds;
  }

  // ------------------------------------------------------------------ damage

  damagePlayer(amount: number, _sx: number, _sy: number) {
    if (this.run.phase !== 'active') return;
    if (this.player.hurtInvulnerable) return;
    this.player.markHurt();
    this.player.hp -= amount;
    this.run.damageTaken += amount;
    audioOf(this).play('playerHurt');
    this.shake(180, 0.012);
    this.flashDamage();
    if (this.player.hp <= 0) this.onPlayerDeath();
  }

  damageEnemy(e: Enemy, amount: number, crit: boolean, fromX: number, fromY: number) {
    if (e.dead) return;
    e.hp -= amount;
    this.run.damageDealt += amount;
    e.flash(crit);
    this.floatText(e.x, e.y - BLOCK * 0.8, Math.round(amount), crit ? 0xfcd424 : 0xfcfcfc, crit);
    if (e.isBoss) {
      this.run.bossHp = Math.max(0, e.hp);
      this.hud.setBossHp(e.hp / e.maxHp);
    }
    const ang = Math.atan2(e.y - fromY, e.x - fromX);
    e.x += Math.cos(ang) * 6;
    e.y += Math.sin(ang) * 6;
    if (e.hp <= 0) this.killEnemy(e, crit);
  }

  killEnemy(e: Enemy, crit: boolean) {
    if (e.dead) return;
    e.dead = true;
    this.run.kills++;
    this.run.score += e.def.score;
    const scrap = this.run.addScrap(e.def.scrap);
    audioOf(this).play(e.isBoss ? 'explodeBig' : 'explode');
    this.shake(e.isBoss ? 700 : 130, e.isBoss ? 0.024 : 0.006);
    this.spawnExplosion(e.x, e.y, e.isBoss ? 1.6 : 1);
    this.spawnScrap(e.x, e.y, scrap, e.isBoss);

    if (this.run.stats.lifesteal > 0 && this.run.rng.bool(this.run.stats.lifesteal)) this.player.heal(2);
    if (crit && this.run.stats.critChain > 0) {
      for (const other of this.enemies) {
        if (other === e || other.dead) continue;
        if (Phaser.Math.Distance.Between(e.x, e.y, other.x, other.y) < BLOCK * 2.5) {
          this.damageEnemy(other, e.maxHp * 0.1 * this.run.stats.critChain, false, e.x, e.y);
        }
      }
    }
    if (this.run.stats.timeSlowOnKill > 0 && this.run.rng.bool(this.run.stats.timeSlowOnKill)) {
      this.applyTimeSlow(1.2);
    }

    if (e.isBoss) {
      this.run.bossActive = false;
      this.hud.hideBoss();
      this.dropReward(true);
    } else if (e.isElite) {
      const pool: PickupId[] = ['weapon', 'heal', 'shield', 'nuke'];
      this.spawnPickup(e.x, e.y, true, this.run.rng.pick(pool));
    }

    if (this.run.grantXp(e.def.xp)) {
      this.hud.toast(`等级提升 · LV${this.run.level}`);
      this.run.enqueueDraft('levelup');
      this.time.delayedCall(260, () => this.pumpDrafts());
    }

    e.destroy();
    this.enemies = this.enemies.filter((x) => x !== e);
  }

  private dropReward(big = false) {
    const n = big ? 3 : 2;
    for (let i = 0; i < n; i++) {
      this.spawnPickup(
        this.player.x + this.run.rng.range(-BLOCK * 2, BLOCK * 2),
        this.player.y + this.run.rng.range(-BLOCK * 2, BLOCK * 2),
        big,
      );
    }
    if (big) this.player.heal(Math.round(this.run.stats.maxHp * 0.35));
  }

  spawnPickup(x: number, y: number, premium = false, force: PickupId | null = null, value = 0): Pickup {
    const kinds: [PickupId, number][] = premium
      ? [['heal', 3], ['scrap', 4], ['nuke', 1.2], ['shield', 1.4]]
      : [['scrap', 7], ['heal', 3], ['shield', 0.9], ['nuke', 0.5], ['freeze', 0.7]];
    const total = kinds.reduce((a, k) => a + k[1], 0);
    let r = this.run.rng.next() * total;
    let kind: PickupId = 'scrap';
    if (force) {
      kind = force;
    } else {
      for (const [k, w] of kinds) {
        r -= w;
        if (r <= 0) {
          kind = k;
          break;
        }
      }
    }
    const p = new Pickup(this, x, y, kind, premium, value);
    this.pickups.push(p);
    return p;
  }

  private spawnScrap(x: number, y: number, amount: number, big: boolean) {
    if (amount <= 0) return;
    if (big) {
      this.spawnPickup(x, y, false, 'scrap', amount);
      for (let i = 0; i < 3; i++) {
        this.spawnPickup(
          x + this.run.rng.range(-BLOCK, BLOCK),
          y + this.run.rng.range(-BLOCK, BLOCK),
          false,
          'scrap',
          Math.ceil(amount / 4),
        );
      }
      return;
    }
    const count = Math.min(3, 1 + Math.floor(amount / 4));
    const each = Math.max(1, Math.ceil(amount / count));
    for (let i = 0; i < count; i++) {
      this.spawnPickup(
        x + this.run.rng.range(-BLOCK, BLOCK),
        y + this.run.rng.range(-BLOCK, BLOCK),
        false,
        'scrap',
        each,
      );
    }
  }

  // ------------------------------------------------------------------ terrain

  isSolidAt(x: number, y: number): boolean {
    const c = cellAt(this.arena, Math.floor(x / BLOCK), Math.floor(y / BLOCK));
    return c === Cell.Steel || c === Cell.Base;
  }

  /** Chip away at brick, one block at a time. */
  damageBrickAt(x: number, y: number) {
    const col = Math.floor(x / BLOCK);
    const row = Math.floor(y / BLOCK);
    if (cellAt(this.arena, col, row) !== Cell.Brick) return;
    setCellSafe(this.arena, col, row, Cell.Rubble);
    this.refreshCell(col, row);
  }

  private refreshCell(col: number, row: number) {
    const c = cellAt(this.arena, col, row);
    if (c === Cell.Floor) return;
    const img = this.add
      .image(col * BLOCK, row * BLOCK, TERRAIN[c])
      .setOrigin(0)
      .setDepth(LAYER.ground + 1)
      .setDisplaySize(BLOCK, BLOCK);
    this.arenaLayer.add(img);
  }

  los(ax: number, ay: number, bx: number, by: number): boolean {
    return hasLineOfSight(this.arena, ax, ay, bx, by);
  }

  nearestWalkable(x: number, y: number): { x: number; y: number } {
    if (isSpotFree(this.arena, x, y, BLOCK * 0.85)) return { x, y };
    for (let r = 1; r < 7; r++) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          const nx = x + ox * BLOCK;
          const ny = y + oy * BLOCK;
          if (isSpotFree(this.arena, nx, ny, BLOCK * 0.85)) return { x: nx, y: ny };
        }
      }
    }
    const f = resolveCircle(this.arena, { x, y }, BLOCK * 0.85);
    return f;
  }

  // ------------------------------------------------------------------ effects

  spawnExplosion(x: number, y: number, scale = 1) {
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 70, () => {
        if (!this.scene.isActive()) return;
        const img = this.add
          .image(x, y, `boom${i}`)
          .setDepth(LAYER.fx)
          .setDisplaySize(BLOCK * 2 * scale, BLOCK * 2 * scale)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAngle(this.run.rng.range(0, 90));
        this.tweens.add({
          targets: img,
          alpha: 0,
          scale: img.scale * 1.5,
          duration: 180 + i * 60,
          onComplete: () => img.destroy(),
        });
      });
    }
    const s = this.add
      .image(x, y, 'smokeGrey2')
      .setDepth(LAYER.fx)
      .setDisplaySize(BLOCK * 3 * scale, BLOCK * 3 * scale)
      .setAlpha(0.5);
    this.tweens.add({ targets: s, alpha: 0, scale: s.scale * 1.6, duration: 600, onComplete: () => s.destroy() });
  }

  spawnDebris(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      const p = this.add
        .image(x, y, 'p_dot')
        .setDepth(LAYER.fx)
        .setScale(this.run.rng.range(0.2, 0.5))
        .setTint(this.run.rng.pick([0xa82400, 0xe45820, 0x7c7c7c]));
      this.tweens.add({
        targets: p,
        x: x + this.run.rng.range(-40, 40),
        y: y + this.run.rng.range(-40, 40),
        alpha: 0,
        duration: this.run.rng.range(200, 420),
        onComplete: () => p.destroy(),
      });
    }
  }

  floatText(x: number, y: number, value: number, color: number, big = false) {
    const t = new PixelText(this, x, y, `${value}`, {
      scale: big ? 4 : 3,
      color,
      depth: LAYER.fx + 5,
    });
    this.tweens.add({ targets: t.container, y: y - 40, alpha: 0, duration: 520, ease: 'Cubic.Out', onComplete: () => t.destroy() });
  }

  toast(message: string) {
    this.hud.toast(message);
  }

  applyTimeSlow(seconds: number) {
    this.physics.world.timeScale = 0.4;
    this.time.timeScale = 0.5;
    this.tweens.timeScale = 0.6;
    this.time.delayedCall(seconds * 1000, () => {
      this.physics.world.timeScale = 1;
      this.time.timeScale = 1;
      this.tweens.timeScale = 1;
    });
  }

  blast(x: number, y: number, radius: number, damage: number, fromX: number, fromY: number) {
    const ring = this.add
      .image(x, y, 'p_ring')
      .setDepth(LAYER.fx)
      .setScale(radius / 64)
      .setTint(0xfcd424)
      .setAlpha(0.9);
    this.tweens.add({ targets: ring, scale: radius / 26, alpha: 0, duration: 280, onComplete: () => ring.destroy() });
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (d > radius + e.radius) continue;
      const falloff = 1 - Phaser.Math.Clamp(d / (radius + e.radius), 0, 1) * 0.6;
      this.damageEnemy(e, damage * falloff, false, fromX, fromY);
    }
    this.spawnExplosion(x, y, 0.8);
  }

  shake(duration: number, intensity: number) {
    this.cameras.main.shake(duration, intensity);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  private trackShake(dt: number) {
    this.shakeTime = Math.max(0, this.shakeTime - dt * 1000);
  }

  private flashDamage() {
    const flash = this.add
      .rectangle(0, 0, VIEW.width, VIEW.height, 0xe45820, 0.16)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(LAYER.ui - 2);
    this.tweens.add({ targets: flash, alpha: 0, duration: 240, onComplete: () => flash.destroy() });
  }

  private updateScreenEffects(dt: number) {
    const ratio = this.player.hp / this.run.stats.maxHp;
    const want = ratio < 0.35 ? (0.35 - ratio) * 1.4 : 0;
    this.lowHpPulse += dt * 5;
    const target = want > 0 ? want * (0.8 + Math.sin(this.lowHpPulse) * 0.2) : 0;
    this.vignette.setAlpha(Phaser.Math.Linear(this.vignette.alpha, target, 0.1));
  }
  private lowHpPulse = 0;
}

function setCellSafe(arena: Arena, col: number, row: number, v: Cell) {
  arena.cells[row * arena.cols + col] = v;
}

function session_menu() {
  // resolved by main.ts; kept as a hook so the scene does not import the game
  (window as unknown as { __ironMenu?: () => void }).__ironMenu?.();
}

export { PixelText };
