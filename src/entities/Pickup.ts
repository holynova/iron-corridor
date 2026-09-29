import Phaser from 'phaser';
import { LAYER, BLOCK } from '../core/constants';
import { audioOf } from '../core/audio';
import { cellAt, Cell } from '../systems/arena';
import { isSpotFree } from '../systems/collision';
import type { GameScene } from '../scenes/GameScene';
import type { Player } from './Player';

export type PickupId = 'heal' | 'shield' | 'nuke' | 'freeze' | 'scrap' | 'weapon';

const ART: Record<PickupId, string> = {
  heal: 'pu_repair',
  shield: 'pu_shield',
  nuke: 'pu_nuke',
  freeze: 'pu_freeze',
  scrap: 'pu_scrap',
  weapon: 'pu_star',
};

const SIZE = 16 * 6;

export class Pickup {
  scene: GameScene;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  dead = false;
  premium: boolean;
  kind: PickupId;
  value = 0;
  private sprite: Phaser.GameObjects.Image;
  private bob = 0;
  private life = 20;
  private age = 0;

  constructor(
    scene: GameScene,
    x: number,
    y: number,
    kind: PickupId,
    premium: boolean,
    value = 0,
  ) {
    this.scene = scene;
    this.kind = kind;
    this.premium = premium;
    this.value = value;
    const spot = scene.nearestWalkable(x, y);
    this.x = spot.x;
    this.y = spot.y;
    this.vx = scene.run.rng.range(-40, 40);
    this.vy = scene.run.rng.range(-40, 40);

    this.sprite = scene.add
      .image(this.x, this.y, ART[kind])
      .setDepth(LAYER.pickup)
      .setDisplaySize(SIZE, SIZE);
    scene.tweens.add({ targets: this.sprite, scaleX: SIZE / 96 * 0.92, scaleY: SIZE / 96 * 0.92, duration: 480, yoyo: true, repeat: -1 });
  }

  update(dt: number) {
    if (this.dead) return;
    this.age += dt;
    this.life -= dt;
    this.bob += dt * 3.4;

    const player = this.scene.playerRef();
    const st = player.run.stats;
    const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    if (d < st.magnet) {
      const a = Math.atan2(player.y - this.y, player.x - this.x);
      const pull = 240 + (1 - Math.min(1, d / (BLOCK * 5))) * 460;
      this.vx = Phaser.Math.Linear(this.vx, Math.cos(a) * pull, Math.min(1, 7 * dt));
      this.vy = Phaser.Math.Linear(this.vy, Math.sin(a) * pull, Math.min(1, 7 * dt));
      if (d < this.scene.playerRef().radius + 10) {
        this.collect(player);
        return;
      }
    } else {
      this.vx *= 1 - Math.min(1, 3.4 * dt);
      this.vy *= 1 - Math.min(1, 3.4 * dt);
    }

    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    if (isSpotFree(this.scene.arenaRef(), nx, this.y, BLOCK * 0.4)) this.x = nx;
    else this.vx *= -0.4;
    if (isSpotFree(this.scene.arenaRef(), this.x, ny, BLOCK * 0.4)) this.y = ny;
    else this.vy *= -0.4;

    const bobY = Math.sin(this.bob) * 5;
    this.sprite.setPosition(this.x, this.y + bobY);

    if (this.life < 4) {
      const blink = Math.floor(this.age * 8) % 2 === 0;
      this.sprite.setAlpha(blink ? 1 : 0.3);
    }
    if (this.life <= 0) this.expire();
  }

  private collect(player: Player) {
    const run = this.scene.run;
    switch (this.kind) {
      case 'scrap': {
        const base = this.value > 0 ? this.value : this.premium ? 8 : 3;
        const amount = Math.max(1, Math.round(base * (1 + run.stats.scrapBonus)));
        run.scrap += amount;
        audioOf(this.scene).play('pickup');
        this.scene.floatText(player.x, player.y - 30, amount, 0xfcd424);
        break;
      }
      case 'heal': {
        const amount = this.premium ? 40 : 22;
        player.heal(amount);
        audioOf(this.scene).play('powerUp');
        this.scene.floatText(player.x, player.y - 30, amount, 0x58d854);
        break;
      }
      case 'shield':
        player.grantShield(9000);
        audioOf(this.scene).play('powerUp');
        this.scene.toast('护盾启动');
        break;
      case 'freeze':
        this.scene.freezeEnemies(3.2);
        audioOf(this.scene).play('powerUp');
        this.scene.toast('敌军冻结');
        break;
      case 'nuke':
        audioOf(this.scene).play('explodeBig');
        this.scene.blast(player.x, player.y, BLOCK * 9, 90, player.x, player.y);
        this.scene.shake(520, 0.02);
        break;
      case 'weapon':
        player.hp = Math.min(player.maxHp, player.hp + 8);
        audioOf(this.scene).play('powerUp');
        this.scene.toast('火力升级');
        break;
    }
    this.expire();
  }

  private expire() {
    if (this.dead) return;
    this.dead = true;
    this.sprite.destroy();
  }

  destroy() {
    this.expire();
  }
}

export { cellAt, Cell };
