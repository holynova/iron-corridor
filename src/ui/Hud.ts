import Phaser from 'phaser';
import { VIEW, BLOCK, ARENA_H, FIELD_X, FIELD_Y, FOOT_Y, LAYER, COLORS } from '../core/constants';
import { PixelText } from './PixelText';
import { PixelCjk } from './PixelCjk';
import { getUpgrade } from '../data/upgrades';
import { fcFrame, FcList } from './fc';
import { audioOf } from '../core/audio';
import type { GameScene } from '../scenes/GameScene';
import type { RunState } from '../systems/RunState';
import { cellAt, Cell } from '../systems/arena';

const W = VIEW.width;
const H = VIEW.height;

/**
 * Status strip.
 *
 * Laid out like the console HUD: score and kills on the left, stage in the
 * middle, remaining enemies on the right — all in the bitmap font so it reads
 * as part of the machine rather than a web overlay. Chinese strings go through
 * the CJK rasteriser: the 8x8 strip is ASCII-only and silently drops them.
 */
export class Hud {
  private scene: GameScene;
  private run: RunState;

  private scoreText!: PixelText;
  private stageText!: PixelText;
  private waveText!: PixelText;
  private scrapText!: PixelText;
  private statusText!: PixelText;
  private killsText!: PixelText;
  private hpG!: Phaser.GameObjects.Graphics;
  private hpText!: PixelText;
  private dashG!: Phaser.GameObjects.Graphics;
  private minimap!: Phaser.GameObjects.Graphics;
  private miniTimer = 0;
  private bossBar!: Phaser.GameObjects.Graphics;
  private bossName!: PixelCjk;
  private bannerTitle!: PixelText;
  private bannerSub!: PixelCjk;
  private toastText!: PixelCjk;
  private hintText!: PixelText;
  private pauseLayer?: Phaser.GameObjects.Container;
  private waveTotal = 0;
  private waveIndex = 0;
  private waveProgress = 0;

  constructor(scene: GameScene) {
    this.scene = scene;
    this.run = scene.run;
    this.build();
    scene.time.delayedCall(9000, () => {
      this.scene.tweens.add({ targets: this.hintText.container, alpha: 0, duration: 900 });
    });
  }

  private build() {
    const s = this.scene;
    const g = s.add.graphics().setDepth(LAYER.ui - 3).setScrollFactor(0);
    g.fillStyle(0x101018, 1);
    g.fillRect(0, 0, W, FIELD_Y - 4);
    g.fillStyle(0x000000, 1);
    g.fillRect(0, FIELD_Y - 4, W, 4);
    g.lineStyle(2, 0x7c7c7c, 1);
    g.strokeRect(0, 0, W, FIELD_Y - 4);

    // foot strip
    g.fillStyle(0x101018, 1);
    g.fillRect(0, FOOT_Y + 4, W, VIEW.height - FOOT_Y - 4);
    g.fillStyle(0x000000, 1);
    g.fillRect(0, FOOT_Y, W, 4);

    // left column: score + kills. There are no spare lives: one hull, one run.
    this.scoreText = new PixelText(s, 16, 8, 'SCORE 0', { scale: 3, color: 0xfcfcfc, depth: LAYER.ui });
    this.killsText = new PixelText(s, 16, 40, 'KILLS 0', { scale: 2, color: 0xbcbcbc, depth: LAYER.ui });

    // centre: stage + wave + hull
    this.stageText = new PixelText(s, W / 2, 8, 'STAGE 1', {
      scale: 3, color: 0xfcd424, depth: LAYER.ui, align: 'center',
    });
    this.waveText = new PixelText(s, W / 2, 38, '', { scale: 2, color: 0xbcbcbc, depth: LAYER.ui, align: 'center' });
    this.hpG = s.add.graphics().setDepth(LAYER.ui).setScrollFactor(0);
    this.hpText = new PixelText(s, W / 2 - 100, 56, '', { scale: 1, color: 0xbcbcbc, depth: LAYER.ui, align: 'right' });

    // right column: scrap, level, enemies left
    this.scrapText = new PixelText(s, W - 16, 8, 'SCRAP 0', {
      scale: 3, color: 0xfcd424, depth: LAYER.ui, align: 'right',
    });
    this.statusText = new PixelText(s, W - 16, 40, 'LV 1', {
      scale: 2, color: 0xbcbcbc, depth: LAYER.ui, align: 'right',
    });

    // minimap sits under the status strip on the left margin
    this.minimap = s.add.graphics().setDepth(LAYER.ui).setScrollFactor(0);
    this.miniTimer = 0;

    // dash pips in the foot strip
    this.dashG = s.add.graphics().setDepth(LAYER.ui).setScrollFactor(0);

    // boss bar
    this.bossBar = s.add.graphics().setDepth(LAYER.ui).setScrollFactor(0).setVisible(false);
    this.bossName = new PixelCjk(s, W / 2, FIELD_Y + 18, '', {
      scale: 1, px: 14, color: 0xe45820, depth: LAYER.ui + 1, align: 'center',
    });
    this.bossName.container.setVisible(false);

    // banners
    this.bannerTitle = new PixelText(s, W / 2, H * 0.28, '', {
      scale: 6, color: 0xfcfcfc, depth: LAYER.ui + 2, align: 'center',
    });
    this.bannerSub = new PixelCjk(s, W / 2, H * 0.28 + 72, '', {
      scale: 2, px: 12, color: 0xfcd424, depth: LAYER.ui + 2, align: 'center',
    });
    this.toastText = new PixelCjk(s, W / 2, H * 0.18 + 12, '', {
      scale: 2, px: 12, color: 0x58d854, depth: LAYER.ui + 2, align: 'center',
    });
    const touchHint = window.matchMedia('(pointer: coarse)').matches;
    this.hintText = new PixelText(s, W / 2, FOOT_Y + 6, touchHint ? 'LEFT STICK MOVE   TOUCH RIGHT TO AIM AND FIRE' : 'WASD MOVE   MOUSE AIM   FIRE   SHIFT DASH   ESC PAUSE', {
      scale: 1, color: 0x7c7c7c, depth: LAYER.ui + 1, align: 'center',
    });
    // minimap legend, parked under the radar in the left margin
    const legendY = FIELD_Y + 10 + Math.min(FIELD_X - 10, ARENA_H - 260) + 14;
    new PixelCjk(s, FIELD_X / 2, legendY, '绿=你 白=敌', {
      scale: 1, px: 11, color: 0xbcbcbc, depth: LAYER.ui, align: 'center',
    });
    new PixelCjk(s, FIELD_X / 2, legendY + 16, '橙=首领', {
      scale: 1, px: 11, color: 0xbcbcbc, depth: LAYER.ui, align: 'center',
    });
  }

  // ------------------------------------------------------------------ api

  setDepth(depth: number) {
    this.stageText.setText(`STAGE ${depth}`);
    this.waveTotal = 0;
    this.waveIndex = 0;
    this.waveProgress = 0;
    this.refreshWave();
  }

  setWave(total: number, index: number, progress: number) {
    this.waveTotal = total;
    this.waveIndex = index;
    this.waveProgress = progress;
    this.refreshWave();
  }

  private refreshWave() {
    const run = this.run;
    if (run.isBossDepth()) {
      this.waveText.setText(run.bossActive ? 'BOSS SECTOR' : 'INCOMING...');
      this.statusText.setText(run.bossActive ? `LV${run.level} BOSS` : `LV${run.level}`);
      return;
    }
    const remaining = Math.max(0, Math.round(this.waveTotal * (1 - this.waveProgress)));
    this.waveText.setText(`WAVE ${Math.max(1, this.waveIndex)} / 3`);
    this.statusText.setText(`LV${this.run.level} ENEMY ${remaining}`);
  }

  setBossHp(ratio: number) {
    const w = 300;
    const x = W / 2 - w / 2;
    const y = FIELD_Y + 34;
    const g = this.bossBar;
    g.clear();
    g.fillStyle(0x000000, 0.85);
    g.fillRect(x - 2, y - 2, w + 4, 14);
    g.fillStyle(0x3c1010, 1);
    g.fillRect(x, y, w, 10);
    g.fillStyle(0xe45820, 1);
    g.fillRect(x, y, w * Phaser.Math.Clamp(ratio, 0, 1), 10);
    g.fillStyle(0xfcd424, 0.4);
    g.fillRect(x, y, w * Phaser.Math.Clamp(ratio, 0, 1), 3);
  }

  showBoss(name?: string) {
    this.bossBar.setVisible(true);
    this.bossName.container.setVisible(true);
    if (name) this.bossName.setText(name);
    this.setBossHp(1);
  }

  hideBoss() {
    this.bossBar.setVisible(false).clear();
    this.bossName.container.setVisible(false);
  }

  banner(title: string, sub = '') {
    this.bannerTitle.setText(title).setAlpha(1);
    this.bannerTitle.container.setScale(1.5);
    this.bannerSub.setText(sub).setAlpha(1);
    const s = this.scene;
    s.tweens.add({ targets: this.bannerTitle.container, scale: 1, duration: 300, ease: 'Back.Out' });
    s.tweens.add({ targets: [this.bannerTitle.container, this.bannerSub.container], alpha: 0, delay: 1500, duration: 500 });
  }

  toast(message: string) {
    this.toastText.setText(message).setAlpha(1);
    this.scene.tweens.add({ targets: this.toastText.container, alpha: 0, duration: 1300, ease: 'Cubic.Out' });
  }

  update(dt: number) {
    const run = this.run;
    const p = this.scene.playerRef();
    const ratio = Phaser.Math.Clamp(p.hp / run.stats.maxHp, 0, 1);

    this.scoreText.setText(`SCORE ${run.score}`);
    this.scrapText.setText(`SCRAP ${run.scrap}`);

    this.killsText.setText(`KILLS ${run.kills}`);

    // hull bar sits just under the wave counter
    const bw = 180;
    const bx = W / 2 - bw / 2;
    const g = this.hpG;
    g.clear();
    g.fillStyle(0x101018, 1);
    g.fillRect(bx - 2, 54, bw + 4, 14);
    g.fillStyle(0x3c1010, 1);
    g.fillRect(bx, 56, bw, 10);
    g.fillStyle(ratio > 0.5 ? 0x58d854 : ratio > 0.25 ? 0xfcd424 : 0xe45820, 1);
    g.fillRect(bx, 56, bw * ratio, 10);
    this.hpText.setText(`${Math.ceil(p.hp)}/${run.stats.maxHp}`);

    // dash charge pips, parked in the foot strip
    const dg = this.dashG;
    dg.clear();
    const total = run.stats.dashCharges;
    for (let i = 0; i < total; i++) {
      const x = 16 + i * 20;
      const y = FOOT_Y + 8;
      const ready = p.dashReady(i);
      dg.fillStyle(0x000000, 1);
      dg.fillRect(x - 2, y - 2, 18, 12);
      dg.fillStyle(ready ? 0x58d854 : 0x3c3c3c, 1);
      dg.fillRect(x, y, 14 * (ready ? 1 : p.dashProgress(i)), 8);
    }

    this.miniTimer -= dt;
    if (this.miniTimer <= 0) {
      this.miniTimer = 0.15;
      this.drawMinimap();
    }
  }

  /**
   * Small battlefield map, parked in the left margin where the console leaves
   * its spare black.
   */
  private drawMinimap() {
    const s = this.scene;
    const g = this.minimap;
    g.clear();
    // the console leaves no margin, but an 800px-wide screen does: the radar
    // lives in the dead strip beside the field so it never covers a tank
    const size = Math.min(FIELD_X - 10, ARENA_H - 260);
    const x = Math.round((FIELD_X - size) / 2);
    const y = FIELD_Y + 10;
    const arena = s.arenaRef();
    const cell = Math.max(1, Math.floor(size / Math.max(arena.cols, arena.rows)));
    const w = cell * arena.cols;
    const h = cell * arena.rows;
    const ox = x + (size - w) / 2;
    const oy = y + (size - h) / 2;

    g.fillStyle(0x101018, 1);
    g.fillRect(x - 4, y - 4, size + 8, size + 8);
    g.lineStyle(2, 0x3c3c3c, 1);
    g.strokeRect(x - 4, y - 4, size + 8, size + 8);
    g.fillStyle(0x000000, 1);
    g.fillRect(ox, oy, w, h);
    for (let r = 0; r < arena.rows; r++) {
      for (let c = 0; c < arena.cols; c++) {
        const v = cellAt(arena, c, r);
        if (v === Cell.Steel) g.fillStyle(0x5c5c5c, 1);
        else if (v === Cell.Brick) g.fillStyle(0x782c10, 1);
        else if (v === Cell.Water) g.fillStyle(0x1038a0, 1);
        else if (v === Cell.Trees) g.fillStyle(0x0a6a0a, 1);
        else if (v === Cell.Ice) g.fillStyle(0x3a5a6a, 1);
        else if (v === Cell.Oil) g.fillStyle(0x4a2a00, 1);
        else if (v === Cell.Base) g.fillStyle(0xfcd424, 1);
        else continue;
        g.fillRect(ox + c * cell, oy + r * cell, cell, cell);
      }
    }
    for (const e of s.enemiesList()) {
      if (e.dead) continue;
      const ex = ox + (e.x / (arena.cols * BLOCK)) * w;
      const ey = oy + (e.y / (arena.rows * BLOCK)) * h;
      if (e.isBoss) {
        g.fillStyle(0xe45820, 1);
        g.fillRect(ex - 2, ey - 2, 5, 5);
      } else if (e.isElite) {
        g.fillStyle(0xfcd424, 1);
        g.fillRect(ex - 1, ey - 1, 3, 3);
      } else {
        g.fillStyle(0xfcfcfc, 1);
        g.fillRect(ex, ey, 2, 2);
      }
    }
    const p = s.playerRef();
    const px = ox + (p.x / (arena.cols * BLOCK)) * w;
    const py = oy + (p.y / (arena.rows * BLOCK)) * h;
    g.fillStyle(0x58d854, 1);
    g.fillRect(px - 1, py - 1, 3, 3);
  }

  // ------------------------------------------------------------------ pause

  setPaused(v: boolean) {
    if (v) this.showPause();
    else this.hidePause();
  }

  showPause() {
    if (this.pauseLayer) return;
    const s = this.scene;
    audioOf(s).play('uiSelect');
    const c = s.add.container(0, 0).setDepth(900).setScrollFactor(0);
    c.add(s.add.rectangle(0, 0, W, H, 0x000000, 0.86).setOrigin(0).setInteractive().setScrollFactor(0));

    const frame = fcFrame(s, W / 2, H / 2, 460, 400, { border: COLORS.amber });
    frame.setScrollFactor(0);
    c.add(frame);

    const title = new PixelText(s, W / 2, H / 2 - 152, 'PAUSE', {
      scale: 5, color: COLORS.amber, depth: 901, align: 'center',
    });
    const sub = new PixelText(s, W / 2, H / 2 - 108, `DEPTH ${this.run.depth}   SCORE ${this.run.score}`, {
      scale: 2, color: COLORS.bone, depth: 901, align: 'center',
    });
    const owned = Object.entries(this.run.owned).sort((a, b) => b[1] - a[1]);
    const buildLine = owned.length
      ? owned
          .slice(0, 4)
          .map(([id, n]) => `${getUpgrade(id)?.name ?? id}${n > 1 ? `×${n}` : ''}`)
          .join('  ') + (owned.length > 4 ? `  等共 ${owned.length} 种` : '')
      : '暂无';
    const build = new PixelCjk(s, W / 2, H / 2 - 64, `本局强化：${buildLine}`, {
      scale: 1, px: 11, color: 0x8fa3b4, depth: 901, align: 'center',
    });
    const hint = new PixelText(s, W / 2, H / 2 + 160, 'UP DOWN SELECT   SPACE CONFIRM', {
      scale: 2, color: COLORS.steel, depth: 901, align: 'center',
    });
    c.add([title.container, sub.container, build.container, hint.container]);

    const list = new FcList(s, W / 2, H / 2 + 8, 56);
    list.add('RESUME', () => {
      audioOf(s).play('uiSelect');
      s.events.emit('resume-game');
    }, { width: 320, height: 46 });
    const muteBtn = list.add(audioOf(s).isMuted() ? 'UNMUTE' : 'MUTE', () => {
      const muted = audioOf(s).toggleMuted();
      muteBtn.setText(muted ? 'UNMUTE' : 'MUTE');
      audioOf(s).play('uiSelect');
    }, { width: 320, height: 46 });
    // Abandoning forfeits the run and its scrap, so it asks twice.
    let confirmAbandon = false;
    const abandonBtn = list.add('ABANDON RUN', () => {
      if (!confirmAbandon) {
        confirmAbandon = true;
        abandonBtn.setText('CONFIRM ABANDON');
        sub.setText('ABANDONING LOSES THIS RUN');
        audioOf(s).play('uiMove');
        return;
      }
      audioOf(s).play('uiSelect');
      this.run.finish('dead');
      s.events.emit('quit-to-menu');
    }, { width: 320, height: 46, accent: COLORS.rust });
    for (const b of list.buttons) c.add(b.container);

    // one shared selection for pointer and keyboard
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') list.move(-1);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') list.move(1);
      else if (e.code === 'Space' || e.code === 'Enter') list.confirm();
    };
    s.input.keyboard?.on('keydown', onKey);
    this.pauseLayer = c;
    c.once('destroy', () => {
      s.input.keyboard?.off('keydown', onKey);
      list.destroy();
    });
  }

  hidePause() {
    if (!this.pauseLayer) return;
    this.pauseLayer.destroy(true);
    this.pauseLayer = undefined;
  }
}
