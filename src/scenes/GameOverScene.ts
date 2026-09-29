import Phaser from 'phaser';
import { VIEW, COLORS, LAYER } from '../core/constants';
import { PixelText } from '../ui/PixelText';
import { PixelCjk } from '../ui/PixelCjk';
import { fcBackdrop, fcFrame, FcList } from '../ui/fc';
import { audioOf } from '../core/audio';
import { saveMeta, meta } from '../core/meta';
import type { RunState } from '../systems/RunState';

const W = VIEW.width;
const H = VIEW.height;

export class GameOverScene extends Phaser.Scene {
  private run!: RunState;
  private victory!: boolean;
  private onRestart!: () => void;
  private onMenu!: () => void;

  constructor() {
    super('gameover');
  }

  init(data: { run: RunState; victory: boolean; onRestart: () => void; onMenu: () => void }) {
    this.run = data.run;
    this.victory = data.victory;
    this.onRestart = data.onRestart;
    this.onMenu = data.onMenu;
  }

  create() {
    const audio = audioOf(this);
    audio.resume();
    audio.setIntensity(0.08);

    // persist meta progression
    const m = meta();
    const earned = this.run.scrap;
    saveMeta({
      runs: m.runs + 1,
      bestDepth: Math.max(m.bestDepth, this.run.depth),
      bestKills: Math.max(m.bestKills, this.run.kills),
      totalKills: m.totalKills + this.run.kills,
      totalShots: m.totalShots + this.run.shotsFired,
      totalHits: m.totalHits + this.run.shotsHit,
      totalPlaytime: m.totalPlaytime + this.run.elapsed,
      scrap: m.scrap + earned,
    });

    fcBackdrop(this, W, H, 0);

    const accent = this.victory ? COLORS.mint : COLORS.rust;
    // the frame is a standalone backdrop: everything else is positioned in
    // screen space, so it must not be parented to this container
    fcFrame(this, W / 2, H / 2, 720, 596, { border: accent }).setDepth(LAYER.ui);

    new PixelCjk(this, W / 2, 118, this.victory ? '通关' : '战损报告', {
      scale: 4, px: 14, color: accent, depth: LAYER.ui + 1, align: 'center',
    });
    new PixelCjk(this, W / 2, 166, this.victory
      ? '你穿透了全部 30 层回廊，钢铁洪流在你面前停下了。'
      : `在第 ${this.run.depth} 层的走廊里，你的战车停止了轰鸣。`, {
      scale: 1, px: 12, color: 0x8fa3b4, depth: LAYER.ui + 1, align: 'center',
    });

    // stats grid: label left, value right, on a shared baseline
    const stats: [string, string][] = [
      ['抵达深度', String(this.run.depth)],
      ['击杀数', String(this.run.kills)],
      ['最终得分', String(this.run.score)],
      ['拾取废料', String(this.run.scrap)],
      ['命中率', `${Math.round(this.run.accuracy * 100)}%`],
      ['存活时间', formatTime(this.run.elapsed)],
      ['造成伤害', String(Math.round(this.run.damageDealt))],
      ['承受伤害', String(Math.round(this.run.damageTaken))],
    ];
    const rule = this.add.graphics().setDepth(LAYER.ui);
    rule.fillStyle(0x3c3c3c, 1);
    rule.fillRect(W / 2 - 320, 196, 640, 2);
    stats.forEach(([k, v], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = W / 2 - 320 + col * 330;
      const y = 214 + row * 44;
      const kt = new PixelCjk(this, x, y, k, { scale: 1, px: 12, color: COLORS.steel, depth: LAYER.ui + 1, align: 'left' });
      const vt = new PixelText(this, x + 290, y - 2, v, { scale: 2, color: COLORS.bone, depth: LAYER.ui + 1, align: 'right' });
      void kt;
      void vt;
    });

    // build summary
    const owned = Object.entries(this.run.owned).sort((a, b) => b[1] - a[1]).slice(0, 8);
    new PixelCjk(this, W / 2, 396, '本局强化', {
      scale: 2, px: 12, color: COLORS.steel, depth: LAYER.ui + 1, align: 'center',
    });
    new PixelCjk(
      this, W / 2, 432,
      owned.length
        ? owned.map(([id, n]) => `${UPGRADE_NAMES[id] ?? id}${n > 1 ? ` ×${n}` : ''}`).join('   ')
        : '（无）',
      { scale: 1, px: 12, color: 0xc7d5e0, depth: LAYER.ui + 1, align: 'center' },
    );

    new PixelCjk(this, W / 2, 474, `获得废料 +${this.run.scrap}  ·  可在军械库兑换永久强化`, {
      scale: 2, px: 12, color: COLORS.amber, depth: LAYER.ui + 1, align: 'center',
    });

    const list = new FcList(this, W / 2, 552, 64);
    list.add('再次出击', () => {
      audio.play('uiSelect');
      this.scene.stop();
      this.onRestart();
    }, { width: 300, height: 50, cjk: true });
    list.add('返回主菜单', () => {
      audio.play('uiSelect');
      this.scene.stop();
      this.onMenu();
    }, { width: 300, height: 50, cjk: true, accent: COLORS.rust });
    // the buttons live in the scene root, so they need a depth of their own
    for (const b of list.buttons) b.container.setDepth(LAYER.ui + 1);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') list.move(-1);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') list.move(1);
      else if (e.code === 'Space' || e.code === 'Enter') list.confirm();
      else if (e.code === 'KeyR') { this.scene.stop(); this.onRestart(); }
      else if (e.code === 'Escape') { this.scene.stop(); this.onMenu(); }
    };
    this.input.keyboard?.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
  }
}

const UPGRADE_NAMES: Record<string, string> = {
  caliber: '大口径', loader: '快速装填', engine: '推进器', hull: '焊接装甲', muzzle: '膛线加速',
  magnet: '磁力吸盘', regen: '纳米修复', salvage: '拾荒者', thorns: '尖刺装甲', multishot: '分裂炮管',
  spread: '霰弹', pierce: '穿甲弹', blast: '高爆弹', ricochet: '跳弹', homing: '追踪弹头',
  crit: '弱点分析', critmult: '穿甲弱点', dash: '冲刺充能', dashcharges: '双段推进', invuln: '相位护盾',
  lifesteal: '虹吸涂层', overdrive: '背水一战', slowaura: '履带碾压', timeslow: '残像引擎', chain: '连锁反应',
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

