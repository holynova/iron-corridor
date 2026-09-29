import Phaser from 'phaser';
import { LAYER, TANK_SIZE, TANK_RADIUS, BLOCK } from '../core/constants';
import { audioOf } from '../core/audio';
import { hasClearPath, isSpotFree, moveWithWalls, resolveCircle } from '../systems/collision';
import { blocksBody, cellAt, Cell, type Arena } from '../systems/arena';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from './Player';
import type { EnemyDef } from '../data/enemies';
import { headingOf } from './Player';

const FRAME = { up: 0, right: 1, down: 2, left: 3 };

type State = 'chase' | 'reposition' | 'wander';

export class Enemy {
  scene: GameScene;
  def: EnemyDef;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  angle = -Math.PI / 2;
  turretAngle = -Math.PI / 2;
  dead = false;
  isBoss = false;
  isElite = false;
  contactCooldown = 0;
  readonly radius: number;
  contactDamageValueCached: number;
  bulletDamage: number;
  fireInterval: number;
  hpRatio = 1;
  private sprite!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Image;
  private hpBar!: Phaser.GameObjects.Graphics;
  private state: State = 'chase';
  private fireTimer = 0;
  private burstLeft = 0;
  private burstTimer = 0;
  private slow = 0;
  private slowTimer = 0;
  private wanderAngle = 0;
  private wanderTimer = 0;
  private repathTimer = 0;
  private stuckTimer = 0;
  private lastX: number;
  private lastY: number;
  private throttleTarget = 1;
  private flashTimer = 0;
  private cannonOffset: number;
  private orbitDir = 1;
  private treadPhase = 0;
  private spawnAnim = 0.4;
  private heading: string = 'up';

  constructor(
    scene: GameScene,
    def: EnemyDef,
    stats: { hp: number; bulletDamage: number; contactDamage: number; fireInterval: number },
    x: number,
    y: number,
    elite: boolean,
  ) {
    this.scene = scene;
    this.def = def;
    this.isBoss = def.kind === 'boss';
    this.isElite = elite && !this.isBoss;
    this.hp = Math.round(stats.hp * (this.isElite ? 2.1 : 1));
    this.maxHp = this.hp;
    // every tank covers 2x2 blocks, whatever its class
    this.radius = TANK_RADIUS;
    this.x = x;
    this.y = y;
    this.lastX = x;
    this.lastY = y;
    this.contactDamageValueCached = stats.contactDamage * (this.isElite ? 1.2 : 1);
    this.bulletDamage = stats.bulletDamage * (this.isElite ? 1.15 : 1);
    this.fireInterval = stats.fireInterval * (this.isElite ? 0.85 : 1);
    this.wanderAngle = scene.run.rng.range(0, Math.PI * 2);
    this.orbitDir = scene.run.rng.bool() ? 1 : -1;
    this.cannonOffset = this.radius + 8;

    this.shadow = scene.add
      .image(x, y, `tank_${def.hull}`)
      .setDepth(LAYER.decal)
      .setDisplaySize(TANK_SIZE, TANK_SIZE)
      .setAlpha(0.32)
      .setTint(0x000000);
    this.sprite = scene.add
      .image(x, y, `tank_${def.hull}`)
      .setDepth(LAYER.actor)
      .setDisplaySize(TANK_SIZE, TANK_SIZE);
    this.hpBar = scene.add.graphics().setDepth(LAYER.actor + 2);

    // elite ring, drawn as an additive halo under the hull
    if (this.isElite) {
      const aura = scene.add
        .image(x, y, 'p_ring')
        .setDepth(LAYER.actor - 1)
        .setScale(TANK_SIZE / 64)
        .setAlpha(0.55)
        .setTint(0xfcd424)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: aura, alpha: 0.9, duration: 640, yoyo: true, repeat: -1 });
    }

    // spawn tell
    const tel = scene.add
      .image(x, y, 'spawn')
      .setDepth(LAYER.spawn)
      .setDisplaySize(TANK_SIZE, TANK_SIZE)
      .setAlpha(0.9);
    scene.tweens.add({
      targets: tel,
      scale: { from: 0.5, to: 1 },
      alpha: 0,
      duration: 460,
      onComplete: () => tel.destroy(),
    });
  }

  contactDamageValue(): number {
    return this.contactDamageValueCached;
  }

  setSlow(amount: number) {
    this.slow = Math.max(this.slow, amount);
    this.slowTimer = 0.4;
  }

  flash(crit: boolean) {
    this.flashTimer = crit ? 0.2 : 0.12;
  }

  // ------------------------------------------------------------------ ai

  update(dt: number, player: Player) {
    if (this.dead) return;
    this.contactCooldown = Math.max(0, this.contactCooldown - dt);
    this.slowTimer -= dt;
    if (this.slowTimer <= 0) this.slow = 0;
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.spawnAnim = Math.max(0, this.spawnAnim - dt);
    if (this.spawnAnim > 0) {
      this.sprite.setAlpha(0.45);
      return;
    }
    this.sprite.setAlpha(1);

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const los = this.scene.los(this.x, this.y, player.x, player.y);

    // straight at the player when the way is clear, otherwise down the flow
    let gx = nx;
    let gy = ny;
    if (!this.directRoute()) {
      const dir = this.scene.flowField().direction(this.x, this.y);
      if (dir) {
        gx = dir.x;
        gy = dir.y;
      }
    }

    this.decide(dt, dist, los, player);
    this.steer(dt, gx, gy, dist);
    this.tryShoot(dt, dist, los, nx, ny);
    this.integrate(dt);
    this.syncVisuals(dt);
  }

  private directRoute(): boolean {
    const p = this.scene.playerRef();
    return hasClearPath(this.scene.arenaRef(), this.x, this.y, p.x, p.y, this.radius * 0.7);
  }

  private decide(dt: number, dist: number, los: boolean, player: Player) {
    const def = this.def;
    this.repathTimer -= dt;
    if (this.repathTimer <= 0) {
      this.repathTimer = 0.5 + this.scene.run.rng.next() * 0.6;
      if (this.state === 'chase' && dist > def.preferredRange * 1.25) {
        this.state = this.scene.run.rng.weighted([
          ['chase', 45],
          ['reposition', 40],
          ['wander', 15],
        ]);
      }
    }
    if (this.state === 'chase' && dist < def.preferredRange * 0.5 && def.behaviour !== 'rush') {
      this.state = 'reposition';
    } else if (this.state === 'reposition' && dist > def.preferredRange * 1.25) {
      this.state = 'chase';
    } else if (this.state === 'wander') {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0 || !los) {
        this.wanderTimer = 1.2 + this.scene.run.rng.next() * 1.4;
        this.wanderAngle = Math.atan2(player.y - this.y, player.x - this.x) + this.scene.run.rng.range(-0.9, 0.9);
        this.state = 'chase';
      }
    }
  }

  /**
   * Steering works on a desired velocity vector. Mixing radial and tangential
   * terms by adding angles is what made the earlier build drift off-target.
   */
  private steer(dt: number, nx: number, ny: number, dist: number) {
    const def = this.def;
    let vx = nx;
    let vy = ny;
    let throttle = 1;

    const tanX = -ny * this.orbitDir;
    const tanY = nx * this.orbitDir;

    switch (def.behaviour) {
      case 'hold':
        throttle = 0;
        break;
      case 'snipe': {
        if (dist < def.preferredRange * 0.55) {
          vx = -nx;
          vy = -ny;
        } else if (dist > def.range * 0.9) {
          vx = nx;
          vy = ny;
        } else {
          const bias = (dist - def.preferredRange) / Math.max(1, def.preferredRange);
          vx = nx * bias + tanX * 0.9;
          vy = ny * bias + tanY * 0.9;
          throttle = 0.6;
        }
        if (this.scene.run.rng.bool(dt * 0.2)) this.orbitDir *= -1;
        break;
      }
      case 'strafe': {
        const bias = Phaser.Math.Clamp((dist - def.preferredRange) / (BLOCK * 3), -1.2, 1.2);
        vx = nx * bias + tanX;
        vy = ny * bias + tanY;
        if (this.scene.run.rng.bool(dt * 0.22)) this.orbitDir *= -1;
        throttle = dist < def.preferredRange * 0.45 ? 1 : 0.9;
        break;
      }
      case 'rush':
        vx = nx;
        vy = ny;
        if (!this.clearAhead(1)) {
          vx += tanX * 0.8;
          vy += tanY * 0.8;
        }
        break;
      case 'swarm': {
        const wob = Math.sin(this.scene.time.now / 220 + this.wanderAngle) * 0.5;
        vx = nx + -ny * wob;
        vy = ny + nx * wob;
        break;
      }
      case 'chase':
        break;
    }

    if (this.state === 'reposition') {
      vx = -nx * 0.7 + tanX * 1.1;
      vy = -ny * 0.7 + tanY * 1.1;
      throttle = 1;
    } else if (this.state === 'wander') {
      vx = Math.cos(this.wanderAngle);
      vy = Math.sin(this.wanderAngle);
      throttle = 0.55;
    }
    if (def.behaviour === 'rush' && this.state === 'chase') {
      vx = nx;
      vy = ny;
      throttle = 1;
    }

    const m = Math.hypot(vx, vy);
    let angle = m > 1e-4 ? Math.atan2(vy / m, vx / m) : this.angle;
    if (throttle > 0 && !this.clearAhead(1.2)) angle = this.probeAngle(angle);

    this.angle = Phaser.Math.Angle.RotateTo(this.angle, angle, def.turnRate * dt);
    this.throttleTarget = throttle;
  }

  private clearAhead(mult: number): boolean {
    const ax = this.x + Math.cos(this.angle) * this.radius * mult;
    const ay = this.y + Math.sin(this.angle) * this.radius * mult;
    return isSpotFree(this.scene.arenaRef(), ax, ay, this.radius * 0.8);
  }

  private probeAngle(base: number): number {
    for (const off of [0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
      const a = base + off;
      const ax = this.x + Math.cos(a) * this.radius * 1.5;
      const ay = this.y + Math.sin(a) * this.radius * 1.5;
      if (isSpotFree(this.scene.arenaRef(), ax, ay, this.radius * 0.8)) return a;
    }
    return base + Math.PI;
  }

  private tryShoot(dt: number, dist: number, los: boolean, nx: number, ny: number) {
    this.turretAngle = Phaser.Math.Angle.RotateTo(
      this.turretAngle,
      Math.atan2(ny, nx),
      this.def.turnRate * 1.6 * dt,
    );
    this.fireTimer -= dt;

    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.burstTimer = 0.14;
        this.burstLeft--;
        this.shoot();
      }
      return;
    }
    if (this.fireTimer > 0 || !los) return;
    if (dist > this.def.range) return;
    if (Math.abs(Phaser.Math.Angle.Wrap(this.turretAngle - Math.atan2(ny, nx))) > 0.22) return;
    if (dist < BLOCK * 1.6 && this.def.behaviour !== 'rush') return;

    this.burstLeft = Math.max(1, this.def.burst + (this.isElite ? 2 : 0));
    this.burstTimer = 0;
    this.fireTimer = this.fireInterval * this.scene.run.rng.range(0.85, 1.3);
  }

  private shoot() {
    const mx = this.x + Math.cos(this.turretAngle) * this.cannonOffset;
    const my = this.y + Math.sin(this.turretAngle) * this.cannonOffset;
    const inaccuracy = this.def.behaviour === 'snipe' ? 0.015 : 0.07;
    const angle = this.turretAngle + this.scene.run.rng.range(-inaccuracy, inaccuracy);
    this.scene.spawnEnemyBullet({
      x: mx,
      y: my,
      angle,
      speed: this.def.bulletSpeed,
      damage: this.bulletDamage,
      color: this.def.bulletColor,
    });
    this.vx -= Math.cos(angle) * 40;
    this.vy -= Math.sin(angle) * 40;
    audioOf(this.scene).play('enemyShoot', this.scene.run.rng.int(-4, 4));
    const f = this.scene.add
      .image(mx, my, 'p_glow')
      .setDepth(LAYER.bullet)
      .setScale(0.2)
      .setTint(this.def.bulletColor)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: f, alpha: 0, scale: 0.45, duration: 100, onComplete: () => f.destroy() });
  }

  private integrate(dt: number) {
    const target = this.def.speed * (1 - this.slow) * (this.throttleTarget > 0 ? 1 : 0);
    this.vx = Phaser.Math.Linear(this.vx, Math.cos(this.angle) * target, Math.min(1, 6 * dt));
    this.vy = Phaser.Math.Linear(this.vy, Math.sin(this.angle) * target, Math.min(1, 6 * dt));

    const moved = moveWithWalls(this.scene.arenaRef(), { x: this.x, y: this.y }, this.vx * dt, this.vy * dt, this.radius);
    this.x = moved.x;
    this.y = moved.y;

    // water and mud slow a tank down even though they do not block it
    const cell = cellAt(this.scene.arenaRef(), Math.floor(this.x / BLOCK), Math.floor(this.y / BLOCK));
    if (cell === Cell.Water) {
      this.vx *= 0.9;
      this.vy *= 0.9;
    }

    this.stuckTimer += dt;
    if (this.stuckTimer > 0.4) {
      if (Math.hypot(this.x - this.lastX, this.y - this.lastY) < 2 && this.def.speed > 0) {
        this.wanderAngle = this.angle + this.scene.run.rng.pick([Math.PI / 2, -Math.PI / 2, Math.PI]);
        this.state = 'wander';
        this.angle = this.wanderAngle;
        if (!isSpotFree(this.scene.arenaRef(), this.x, this.y, this.radius * 0.8)) {
          const spot = this.scene.nearestWalkable(this.x, this.y);
          const f = resolveCircle(this.scene.arenaRef(), spot, this.radius);
          this.x = f.x;
          this.y = f.y;
        }
      }
      this.lastX = this.x;
      this.lastY = this.y;
      this.stuckTimer = 0;
    }
    this.hpRatio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
  }

  private syncVisuals(dt: number) {
    const moving = Math.hypot(this.vx, this.vy) > 24;
    if (moving) this.treadPhase += dt * 9;
    this.heading = headingOf(this.angle);
    const idx = FRAME[this.heading as keyof typeof FRAME] + (moving ? Math.floor(this.treadPhase) % 2 : 0) * 4;
    this.sprite.setFrame(idx);
    this.sprite.setPosition(this.x, this.y);
    if (this.flashTimer <= 0) this.sprite.clearTint();
    this.shadow.setPosition(this.x, this.y).setVisible(this.flashTimer <= 0);

    const g = this.hpBar;
    g.clear();
    if (this.hpRatio >= 0.999 && !this.isElite) return;
    const w = TANK_SIZE * 0.8;
    const y = this.y - this.radius - 14;
    g.fillStyle(0x000000, 0.85);
    g.fillRect(this.x - w / 2 - 1, y - 1, w + 2, 8);
    g.fillStyle(this.isElite ? 0xfcd424 : 0xe45820, 1);
    g.fillRect(this.x - w / 2, y, w * this.hpRatio, 6);
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
    this.hpBar.destroy();
  }
}

export { blocksBody };
export type { Arena };
