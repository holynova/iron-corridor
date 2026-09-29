import Phaser from 'phaser';
import { registerAudio } from '../core/audio';


/** Generate the small procedural textures the game leans on for feedback. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload() {
    const bar = document.getElementById('boot-bar');
    const tip = document.getElementById('boot-tip');
    const stage = (p: number, text: string) => {
      if (bar) bar.style.width = `${Math.round(p * 100)}%`;
      if (tip) tip.textContent = text;
    };
    stage(0.02, '装载战场数据…');

    // Everything under assets/fc is baked by tools/gensprites.mjs
    const img = (key: string, file: string) => this.load.image(key, `assets/fc/${file}`);
    // tank strips are 4 headings x 2 tread frames, loaded as a sheet so a
    // plain frame index picks the right facing
    for (const h of ['player', 'basic', 'fast', 'power', 'armor', 'boss']) {
      this.load.spritesheet(`tank_${h}`, `assets/fc/tank_${h}.png`, {
        frameWidth: 16,
        frameHeight: 16,
      });
    }
    for (const t of ['brick', 'brickHalf', 'steel', 'water', 'trees', 'ice', 'oil']) {
      img(`t_${t}`, `t_${t}.png`);
    }
    img('eagle', 'eagle.png');
    img('base_wall', 'base_wall.png');
    img('life', 'life.png');
    img('bullet', 'bullet.png');
    img('spawn', 'spawn.png');
    img('shield', 'shield.png');
    for (let i = 0; i < 3; i++) img(`boom${i}`, `boom${i}.png`);
    for (const p of ['star', 'nuke', 'shield', 'freeze', 'upgrade', 'repair', 'scrap']) {
      img(`pu_${p}`, `pu_${p}.png`);
    }
    this.load.spritesheet('pxfont', 'assets/fc/font.png', { frameWidth: 8, frameHeight: 8 });

    // SFX
    const sfx = [
      'zap1', 'zap2', 'zapThreeToneDown', 'zapThreeToneUp', 'laser1', 'laser3', 'laser5', 'laser8',
      'powerUp1', 'powerUp2', 'powerUp3', 'powerUp8', 'threeTone1', 'threeTone2', 'highUp', 'highDown',
      'lowDown', 'phaserUp1', 'phaserDown1', 'pepSound1', 'pepSound2', 'spaceTrash1', 'tone1', 'twoTone1',
      'footstep00', 'footstep03', 'footstep05', 'metalPot1', 'metalPot3', 'chop', 'doorClose_1', 'doorOpen_2',
      'metalLatch', 'cloth2',
    ];
    for (const key of sfx) this.load.audio(key, `assets/audio/sfx/${key}.ogg`);

    this.load.on('progress', (p: number) => stage(0.05 + p * 0.9, p < 0.4 ? '铺设走廊…' : p < 0.8 ? '校准炮塔…' : '装填弹药…'));
    this.load.once('complete', () => stage(1, '就绪'));
  }

  create() {
    // the audio context is created here so every later scene shares one instance
    registerAudio(this);
    this.makeTextures();
    const err = document.getElementById('boot');
    if (err) {
      err.classList.add('hidden');
      window.setTimeout(() => err.remove(), 600);
    }
    this.scene.start('menu');
  }

  private makeTextures() {
    if (this.textures.exists('p_soft')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // soft round particle
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(16, 16, 16);
    g.generateTexture('p_soft', 32, 32);

    // hard dot for sparks / cores
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture('p_dot', 16, 16);

    // elongated spark
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 24, 4);
    g.generateTexture('p_spark', 24, 4);

    // ring for shockwaves
    g.clear();
    g.lineStyle(4, 0xffffff, 1);
    g.strokeCircle(32, 32, 28);
    g.generateTexture('p_ring', 64, 64);

    // filled glow disc
    g.clear();
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(32, 32, 30);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(32, 32, 12);
    g.generateTexture('p_glow', 64, 64);

    // 1px white for lines/rects
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture('px', 2, 2);

    // vignette
    const vg = this.make.graphics({ x: 0, y: 0 }, false);
    const size = 256;
    for (let i = 0; i < 22; i++) {
      const t = i / 22;
      vg.fillStyle(0x000000, 0.055 * (1 - t));
      vg.fillRect(0, 0, size, size);
      vg.fillRect(size - i * 2, 0, i * 2, size);
      vg.fillRect(0, size - i * 2, size, i * 2);
    }
    vg.generateTexture('vignette', size, size);
    vg.destroy();

    // 1x1 white for tint fills
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 1, 1);
    g.generateTexture('white1', 1, 1);

    g.destroy();
  }
}
