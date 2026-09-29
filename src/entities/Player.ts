import Phaser from 'phaser';
import { LAYER, TANK_SIZE, TANK_RADIUS, BLOCK } from '../core/constants';
import { audioOf } from '../core/audio';
import { moveWithWalls, resolveCircle } from '../systems/collision';
import { cellAt, Cell } from '../systems/arena';
import type { GameScene } from '../scenes/GameScene';
import type { RunState } from '../systems/RunState';

/** Frame offsets in the tank strip: 4 headings, then the same with frame B. */
const FRAME = { up: 0, right: 1, down: 2, left: 3 };

export type Heading = keyof typeof FRAME;

export function headingOf(angle: number): Heading {
  // sprite art points up, so the frame index follows the rotation directly
  const a = Phaser.Math.Angle.Wrap(angle);
  if (a > -Math.PI / 4 && a <= Math.PI / 4) return 'right';
  if (a > Math.PI / 4 && a <= (3 * Math.PI) / 4) return 'down';
  if (a > (3 * Math.PI) / 4 || a <= -(3 * Math.PI) / 4) return 'left';
  return 'up';
}

export class Player {
  scene: GameScene;
  run: RunState;

  hp: number;
  maxHp: number;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  angle = -Math.PI / 2;
  turretAngle = -Math.PI / 2;
  readonly radius = TANK_RADIUS;

  private sprite!: Phaser.GameObjects.Image;
  private shield!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Image;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private fireCooldown = 0;
  private recoil = 0;
  private treadPhase = 0;
  private treadTimer = 0;
  private invulnTimer = 0;
  private hurtCooldown = 0;
  private shieldTimer = 0;
  private dashTimer = 0;
  private dashCooldownTimers: number[] = [];
  private regenAcc = 0;
  private blink = 0;
  private muzzle!: Phaser.GameObjects.Image;
  private trackTimer = 0;
  private heading: string = 'up';

  constructor(scene: GameScene, run: RunState) {
    this.scene = scene;
    this.run = run;
    this.hp = run.hp;
    this.maxHp = run.stats.maxHp;
    const s = scene.arena.playerStart;
    this.x = s.col * BLOCK + BLOCK;
    this.y = s.row * BLOCK + BLOCK;

    this.shadow = scene.add
      .image(this.x, this.y, 'tank_player')
      .setDepth(LAYER.decal)
      .setDisplaySize(TANK_SIZE, TANK_SIZE)
      .setAlpha(0.3)
      .setTint(0x000000);
    this.sprite = scene.add
      .image(this.x, this.y, 'tank_player')
      .setDepth(LAYER.actor)
      .setDisplaySize(TANK_SIZE, TANK_SIZE);
    this.shield = scene.add
      .image(this.x, this.y, 'shield')
      .setDepth(LAYER.actor + 1)
      .setDisplaySize(TANK_SIZE, TANK_SIZE)
      .setVisible(false);
    this.muzzle = scene.add
      .image(this.x, this.y, 'p_glow')
      .setDepth(LAYER.fx)
      .setScale(0.5)
      .setAlpha(0)
      .setTint(0xfcfcfc)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.setupInput();
    this.resetDash();
  }

  get invulnerable(): boolean {
    return this.invulnTimer > 0;
  }

  /** Global hurt cooldown shared by shells and rams. */
  get hurtInvulnerable(): boolean {
    return this.shieldTimer > 0 || this.invulnTimer > 0 || this.hurtCooldown > 0;
  }

  dashReady(i: number): boolean {
    const t = this.dashCooldownTimers[i];
    return t === undefined || t <= 0;
  }

  dashProgress(i: number): number {
    const t = this.dashCooldownTimers[i];
    if (t === undefined || t <= 0) return 1;
    return Phaser.Math.Clamp(1 - t / Math.max(0.01, this.run.stats.dashCooldown), 0, 1);
  }

  dashCharges(): number {
    return this.run.stats.dashCharges;
  }

  private setupInput() {
    const kb = this.scene.input.keyboard!;
    this.keys = kb.addKeys({
      up: 'W', down: 'S', left: 'A', right: 'D',
      upAlt: 'UP', downAlt: 'DOWN', leftAlt: 'LEFT', rightAlt: 'RIGHT',
    }) as Record<string, Phaser.Input.Keyboard.Key>;
  }

  private resetDash() {
    this.dashCooldownTimers = new Array(this.run.stats.dashCharges).fill(0);
  }

  relocate(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
  }

  heal(amount: number) {
    if (amount <= 0) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  markHurt() {
    this.hurtCooldown = 0.5;
  }

  grantShield(ms = 7000) {
    this.shieldTimer = Math.max(this.shieldTimer, ms / 1000);
  }

  private get fireInterval(): number {
    const st = this.run.stats;
    let rate = st.fireRate;
    if (st.overdrive > 0 && this.hp / this.maxHp < 0.4) rate *= Math.max(0.4, 1 - st.overdrive);
    return Math.max(0.08, rate);
  }

  // ------------------------------------------------------------------ update

  update(dt: number, aim: { x: number; y: number }) {
    const st = this.run.stats;
    this.maxHp = st.maxHp;
    if (this.hp > this.maxHp) this.hp = this.maxHp;

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    this.shieldTimer = Math.max(0, this.shieldTimer - dt);
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.recoil = Math.max(0, this.recoil - dt * 6);

    while (this.dashCooldownTimers.length < st.dashCharges) this.dashCooldownTimers.push(0);
    for (let i = 0; i < this.dashCooldownTimers.length; i++) {
      this.dashCooldownTimers[i] = Math.max(0, this.dashCooldownTimers[i] - dt);
    }

    if (st.regen > 0 && this.hp > 0) {
      this.regenAcc += st.regen * dt;
      if (this.regenAcc >= 1) {
        const whole = Math.floor(this.regenAcc);
        this.regenAcc -= whole;
        this.hp = Math.min(this.maxHp, this.hp + whole);
      }
    }

    // ---- drive
    const k = this.keys;
    let mx = (k.right.isDown || k.rightAlt.isDown ? 1 : 0) - (k.left.isDown || k.leftAlt.isDown ? 1 : 0);
    let my = (k.down.isDown || k.downAlt.isDown ? 1 : 0) - (k.up.isDown || k.upAlt.isDown ? 1 : 0);
    const mag = Math.hypot(mx, my);
    if (mag > 0) {
      mx /= mag;
      my /= mag;
    }

    const dashing = this.dashTimer > 0;
    const speed = dashing ? st.speed * 3 : st.speed;
    const accel = mag > 0 ? 16 : 12;
    this.vx = Phaser.Math.Linear(this.vx, mx * speed, Math.min(1, accel * dt));
    this.vy = Phaser.Math.Linear(this.vy, my * speed, Math.min(1, accel * dt));
    if (dashing) {
      this.vx = mx * speed;
      this.vy = my * speed;
    }

    const moved = moveWithWalls(this.scene.arenaRef(), { x: this.x, y: this.y }, this.vx * dt, this.vy * dt, this.radius);
    this.x = moved.x;
    this.y = moved.y;

    // body-to-body push against enemies
    for (const e of this.scene.enemiesList()) {
      if (e.dead) continue;
      const dx = this.x - e.x;
      const dy = this.y - e.y;
      const d = Math.hypot(dx, dy);
      const min = this.radius + e.radius;
      if (d >= min || d === 0) continue;
      const push = ((min - d) / min) * min;
      this.x += (dx / d) * push * 0.5;
      this.y += (dy / d) * push * 0.5;
      e.x -= (dx / d) * push * 0.4;
      e.y -= (dy / d) * push * 0.4;
      if (!e.contactCooldown) {
        e.contactCooldown = 1;
        this.markHurt();
        this.scene.damagePlayer(e.contactDamageValue(), e.x, e.y);
      }
    }
    const fixed = resolveCircle(this.scene.arenaRef(), { x: this.x, y: this.y }, this.radius);
    this.x = fixed.x;
    this.y = fixed.y;

    if (mag > 0) this.angle = Phaser.Math.Angle.RotateTo(this.angle, Math.atan2(my, mx), 14 * dt);
    this.turretAngle = Phaser.Math.Angle.RotateTo(this.turretAngle, Math.atan2(aim.y - this.y, aim.x - this.x), 0.55);

    // ---- tread marks
    const moving = Math.hypot(this.vx, this.vy) > 30;
    if (moving) {
      this.treadPhase += dt * 9;
      this.treadTimer -= dt;
      if (this.treadTimer <= 0) {
        this.treadTimer = 0.16;
        audioOf(this.scene).play('step', this.scene.run.rng.int(-3, 3));
        this.dropTread();
      }
    }

    this.syncVisuals(dt, moving);
  }

  // ------------------------------------------------------------------ combat

  tryFire() {
    if (this.scene.run.phase !== 'active' || this.hp <= 0) return;
    if (this.fireCooldown > 0) return;
    const st = this.run.stats;
    this.fireCooldown = this.fireInterval;
    this.recoil = 1;

    const muzzleDist = this.radius + 10;
    const baseAngle = this.aimAssist(this.turretAngle, 0.14);
    const crit = this.scene.run.rng.bool(st.critChance);
    const dmg = st.damage * (crit ? st.critMult : 1);
    const color = crit ? 0xfcd424 : 0xfce0a8;

    this.scene.spawnPlayerBullet({
      x: this.x + Math.cos(baseAngle) * muzzleDist,
      y: this.y + Math.sin(baseAngle) * muzzleDist,
      angle: baseAngle,
      speed: 760,
      damage: dmg,
      pierce: st.pierce,
      color,
      crit,
      blast: st.explosiveShells > 0 ? 1 : 0,
      blastRadius: st.blastRadius,
      extra: Math.max(0, st.bulletsPerShot - 1),
      spread: st.spread,
    });

    this.vx -= Math.cos(baseAngle) * 60;
    this.vy -= Math.sin(baseAngle) * 60;

    this.muzzle
      .setPosition(this.x + Math.cos(baseAngle) * muzzleDist, this.y + Math.sin(baseAngle) * muzzleDist)
      .setAlpha(0.9)
      .setScale(0.4)
      .setTint(color);
    this.scene.tweens.add({ targets: this.muzzle, alpha: 0, scale: 0.75, duration: 110 });

    audioOf(this.scene).play('shoot', this.scene.run.rng.int(-2, 2));
  }

  tryDash() {
    if (this.scene.run.phase !== 'active') return;
    if (this.dashTimer > 0.14) return;
    const idx = this.dashCooldownTimers.findIndex((t) => t <= 0);
    if (idx === -1) return;
    this.dashCooldownTimers[idx] = this.run.stats.dashCooldown;

    const k = this.keys;
    let dx = (k.right.isDown || k.rightAlt.isDown ? 1 : 0) - (k.left.isDown || k.leftAlt.isDown ? 1 : 0);
    let dy = (k.down.isDown || k.downAlt.isDown ? 1 : 0) - (k.up.isDown || k.upAlt.isDown ? 1 : 0);
    if (dx === 0 && dy === 0) {
      dx = Math.cos(this.angle);
      dy = Math.sin(this.angle);
    }
    const m = Math.hypot(dx, dy) || 1;
    this.vx = (dx / m) * this.run.stats.speed * 3;
    this.vy = (dy / m) * this.run.stats.speed * 3;
    this.dashTimer = 0.22;
    this.invulnTimer = this.run.stats.dashInvuln;
    this.recoil = 0.6;
    audioOf(this.scene).play('dash');

    for (let i = 0; i < 4; i++) {
      const g = this.scene.add
        .image(this.x, this.y, 'tank_player')
        .setDepth(LAYER.actor - 1)
        .setDisplaySize(TANK_SIZE, TANK_SIZE)
        .setAlpha(0.4)
        .setTint(0xbcfcfc);
      this.scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
    }
  }

  /** Nudge the barrel toward a target in a narrow cone so strafing tanks die. */
  private aimAssist(angle: number, cone: number): number {
    let best: { x: number; y: number } | null = null;
    let bestErr = cone;
    for (const e of this.scene.enemiesList()) {
      if (e.dead) continue;
      const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
      if (d > 620) continue;
      const err = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(e.y - this.y, e.x - this.x) - angle));
      if (err < bestErr) {
        bestErr = err;
        best = e;
      }
    }
    if (!best) return angle;
    return Phaser.Math.Angle.RotateTo(angle, Math.atan2(best.y - this.y, best.x - this.x), 0.55);
  }

  // ------------------------------------------------------------------ visuals

  private dropTread() {
    const back = this.heading;
    const off = BLOCK * 0.22;
    const dx = back === 'left' ? -off : back === 'right' ? off : 0;
    const dy = back === 'up' ? -off : back === 'down' ? off : 0;
    const img = this.scene.add
      .image(this.x + dx, this.y + dy, 't_oil')
      .setDepth(LAYER.decal)
      .setDisplaySize(BLOCK, BLOCK)
      .setAlpha(0.22)
      .setTint(0x605040);
    this.scene.tweens.add({ targets: img, alpha: 0, duration: 2200, onComplete: () => img.destroy() });
  }

  private syncVisuals(dt: number, moving: boolean) {
    this.heading = headingOf(this.angle);
    // one texel of the strip is a whole tank, so the frame is chosen by index
    const frameB = moving ? Math.floor(this.treadPhase) % 2 : 0;
    const idx = FRAME[this.heading as keyof typeof FRAME] + frameB * 4;
    this.sprite.setTexture('tank_player');
    this.sprite.setFrame(idx);
    this.sprite.setPosition(this.x, this.y);
    this.shadow.setPosition(this.x, this.y).setVisible(this.shieldTimer <= 0);
    this.shield.setPosition(this.x, this.y).setVisible(this.shieldTimer > 0);

    // invulnerability blink, console style
    this.blink += dt;
    const on = this.invulnTimer <= 0 || Math.floor(this.blink * 14) % 2 === 0;
    this.sprite.setVisible(on);
    this.sprite.setAlpha(this.shieldTimer > 0 ? 0.85 : 1);

    // recoil: nudge the hull back along the barrel
    if (this.recoil > 0) {
      const k = this.recoil * 3;
      this.sprite.x -= Math.cos(this.turretAngle) * k;
      this.sprite.y -= Math.sin(this.turretAngle) * k;
    }

    this.trackTimer -= dt;
    if (moving && this.trackTimer <= 0) {
      this.trackTimer = 0.1;
    }
  }

  /** Facing, exposed so the HUD can mirror it. */
  facing(): Heading {
    return this.heading as Heading;
  }

  onCell(): Cell {
    return cellAt(this.scene.arenaRef(), Math.floor(this.x / BLOCK), Math.floor(this.y / BLOCK));
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
    this.shield.destroy();
    this.muzzle.destroy();
  }
}
