import Phaser from 'phaser';
import { LAYER, TANK_RADIUS, BLOCK } from '../core/constants';
import { audioOf } from '../core/audio';
import { isSpotFree } from '../systems/collision';
import { cellAt, Cell } from '../systems/arena';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from './Player';
import type { Enemy } from './Enemy';

export interface BulletOpts {
  x: number;
  y: number;
  angle: number;
  speed: number;
  damage: number;
  pierce: number;
  color: number;
  fromPlayer: boolean;
  crit?: boolean;
  blast?: number;
  blastRadius?: number;
  /** extra shells fanned out by the split-barrel upgrade */
  extra?: number;
  /** total spread angle in degrees for those extra shells */
  spread?: number;
}

const SIZE = 8 * 6; // 8 art pixels at the field scale

export class Bullet {
  scene: GameScene;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  damage: number;
  pierce: number;
  color: number;
  crit: boolean;
  blast: number;
  blastRadius: number;
  fromPlayer: boolean;
  dead = false;
  private age = 0;
  private life = 1.1;
  private sprite: Phaser.GameObjects.Image;
  private hitSet = new Set<Enemy | Player>();
  private firstContact = true;

  constructor(scene: GameScene, o: BulletOpts) {
    this.scene = scene;
    this.x = o.x;
    this.y = o.y;
    this.angle = o.angle;
    this.speed = o.speed;
    this.vx = Math.cos(o.angle) * o.speed;
    this.vy = Math.sin(o.angle) * o.speed;
    this.damage = o.damage;
    this.pierce = o.pierce;
    this.color = o.color;
    this.crit = o.crit ?? false;
    this.blast = o.blast ?? 0;
    this.blastRadius = o.blastRadius ?? 0;
    this.fromPlayer = o.fromPlayer;
    this.life = o.fromPlayer ? 0.85 : 1.4;

    this.sprite = scene.add
      .image(this.x, this.y, 'bullet')
      .setDepth(LAYER.bullet)
      .setDisplaySize(o.fromPlayer ? SIZE : SIZE * 0.85, o.fromPlayer ? SIZE : SIZE * 0.85)
      .setRotation(this.angle - Math.PI / 2)
      .setTint(o.color)
      .setBlendMode(Phaser.BlendModes.ADD);

    // extra shells from the multi-barrel upgrade
    const extra = o.extra ?? 0;
    const spread = ((o.spread ?? 0) * Math.PI) / 180;
    for (let i = 0; i < extra; i++) {
      const a = this.angle + spread * (i % 2 === 0 ? 1 : -1) * (Math.floor(i / 2) + 1);
      scene.spawnPlayerBullet({
        x: o.x,
        y: o.y,
        angle: a,
        speed: o.speed,
        damage: o.damage,
        pierce: o.pierce,
        color: o.color,
        crit: o.crit,
        blast: o.blast,
        blastRadius: o.blastRadius,
      });
    }
  }

  update(dt: number) {
    if (this.dead) return;
    this.age += dt;
    if (this.age > this.life) {
      this.expire();
      return;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const arena = this.scene.arenaRef();
    if (this.x < 0 || this.y < 0 || this.x > arena.cols * BLOCK || this.y > arena.rows * BLOCK) {
      this.expire();
      return;
    }

    // terrain
    const cell = cellAt(arena, Math.floor(this.x / BLOCK), Math.floor(this.y / BLOCK));
    if (this.blocks(cell)) {
      if (this.fromPlayer && cell === Cell.Brick) this.scene.damageBrickAt(this.x, this.y);
      audioOf(this.scene).play('hitWall');
      this.scene.spawnDebris(this.x, this.y, 4);
      if (this.blast > 0) this.scene.blast(this.x, this.y, this.blastRadius, this.damage * 0.9, this.x, this.y);
      this.expire(true);
      return;
    }

    if (this.fromPlayer) {
      for (const e of this.scene.enemiesList()) {
        if (e.dead || this.hitSet.has(e)) continue;
        if (Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y) > e.radius + SIZE * 0.35) continue;
        this.hitSet.add(e);
        this.onEnemy(e);
        if (this.dead) return;
      }
    } else {
      const p = this.scene.playerRef();
      if (p.hp > 0 && Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) < p.radius + SIZE * 0.3) {
        this.onPlayer(p);
      }
    }
  }

  private blocks(cell: Cell): boolean {
    return cell === Cell.Brick || cell === Cell.Steel || cell === Cell.Base;
  }

  private onEnemy(e: Enemy) {
    if (this.firstContact) this.scene.run.shotsHit++;
    audioOf(this.scene).play('hit');
    this.scene.spawnDebris(this.x, this.y, 4);
    this.scene.damageEnemy(e, this.damage, this.crit, this.x, this.y);
    if (this.blast > 0) this.scene.blast(this.x, this.y, this.blastRadius, this.damage * 0.85, this.x, this.y);
    if (this.pierce > 0) {
      this.pierce--;
      this.damage *= 0.85;
    } else {
      this.expire();
    }
  }

  private onPlayer(p: Player) {
    if (p.hurtInvulnerable) {
      this.expire();
      return;
    }
    this.scene.damagePlayer(this.damage, this.x, this.y);
    const st = p.run.stats;
    if (st.thorns > 0) {
      const src = this.scene.enemiesList().find((e) => !e.dead && Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y) < BLOCK * 4);
      if (src) this.scene.damageEnemy(src, this.damage * st.thorns, false, p.x, p.y);
    }
    this.expire();
  }

  private expire(atWall = false) {
    if (this.dead) return;
    this.dead = true;
    if (!atWall) {
      for (let i = 0; i < 5; i++) {
        const a = this.angle + Math.PI + this.scene.run.rng.range(-0.9, 0.9);
        const s = this.scene.add
          .image(this.x, this.y, 'p_spark')
          .setDepth(LAYER.fx)
          .setScale(0.6, 0.3)
          .setRotation(a)
          .setTint(this.color)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({
          targets: s,
          x: s.x + Math.cos(a) * 36,
          y: s.y + Math.sin(a) * 36,
          alpha: 0,
          duration: 180,
          onComplete: () => s.destroy(),
        });
      }
    }
    this.sprite.destroy();
  }

  destroy() {
    this.sprite.destroy();
  }
}

export { isSpotFree, TANK_RADIUS };
