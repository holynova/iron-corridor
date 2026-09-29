import Phaser from 'phaser';
import { VIEW, LAYER, COLORS } from '../core/constants';
import { PixelText } from '../ui/PixelText';
import { PixelCjk } from '../ui/PixelCjk';
import { audioOf } from '../core/audio';
import type { RunState } from '../systems/RunState';
import type { Upgrade } from '../data/upgrades';
import { RARITY_COLOR } from '../ui/rarity';

const W = VIEW.width;
const H = VIEW.height;

const RARITY_LABEL: Record<Upgrade['rarity'], string> = {
  common: '普通',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
};

export class DraftScene extends Phaser.Scene {
  private run!: RunState;
  private returnTo!: string;
  private cards: { container: Phaser.GameObjects.Container; upgrade: Upgrade; frame: Phaser.GameObjects.Graphics }[] = [];
  private index = 0;
  private resolve?: (id: string) => void;

  constructor() {
    super('draft');
  }

  init(data: { run: RunState; returnTo: string; resolve: (id: string) => void }) {
    this.run = data.run;
    this.returnTo = data.returnTo;
    this.resolve = data.resolve;
  }

  create() {
    this.cards = [];
    this.index = 0;
    const s = this;
    const audio = audioOf(this);
    audio.resume();
    audio.setIntensity(0.3);

    // the battlefield stays faintly visible behind the choice, the way the
    // console keeps the stage on screen while you pick a power-up
    this.add.rectangle(0, 0, W, H, 0x05080b, 0.9).setOrigin(0).setDepth(0).setInteractive();
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x1a2530, 0.5);
    for (let x = 0; x < W; x += 64) g.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 64) g.fillRect(0, y, W, 1);

    const isLevel = this.run.draftKind === 'levelup';
    new PixelCjk(this, W / 2, 128, isLevel ? '等级提升' : '突破奖励', {
      scale: 4, px: 14, color: isLevel ? COLORS.amber : COLORS.mint, depth: LAYER.ui, align: 'center',
    });
    new PixelText(this, W / 2, 168, isLevel ? `LV ${this.run.level}` : `DEPTH ${this.run.depth}`, {
      scale: 3, color: isLevel ? COLORS.amber : COLORS.mint, depth: LAYER.ui, align: 'center',
    });
    new PixelCjk(this, W / 2, 206, isLevel ? '选择一项强化以继续战斗' : '本层通关，选择一项强化进入下一深度', {
      scale: 1, px: 12, color: 0x8fa3b4, depth: LAYER.ui, align: 'center',
    });

    const owned = this.run.owned;
    const offers = this.run.offers.slice(0, 3);
    const cardW = 232;
    const cardH = 264;
    const gap = 28;
    const totalW = offers.length * cardW + (offers.length - 1) * gap;
    const startX = W / 2 - totalW / 2 + cardW / 2;
    const y = 404;

    offers.forEach((u, i) => {
      const cx = startX + i * (cardW + gap);
      const card = this.buildCard(u, cx, y, cardH, owned[u.id] ?? 0);
      card.container.setInteractive(
        new Phaser.Geom.Rectangle(-cardW / 2, -cardH / 2, cardW, cardH),
        Phaser.Geom.Rectangle.Contains,
      );
      card.container.on('pointerover', () => {
        this.index = i;
        this.highlight();
      });
      card.container.on('pointerdown', () => this.choose(i));
      this.cards.push(card);
      // entry animation
      card.container.setAlpha(0).setScale(0.85);
      this.tweens.add({
        targets: card.container,
        alpha: 1,
        scale: 1,
        delay: 90 * i,
        duration: 320,
        ease: 'Back.Out',
      });
    });

    const hint = new PixelText(this, W / 2, H - 34, 'A D SWITCH   SPACE CONFIRM   R RANDOM', {
      scale: 2, color: COLORS.steel, depth: LAYER.ui, align: 'center',
    });
    void hint;

    const kb = this.input.keyboard!;
    kb.on('keydown-LEFT', () => this.move(-1));
    kb.on('keydown-A', () => this.move(-1));
    kb.on('keydown-RIGHT', () => this.move(1));
    kb.on('keydown-D', () => this.move(1));
    kb.on('keydown-SPACE', () => this.choose(this.index));
    kb.on('keydown-ENTER', () => this.choose(this.index));
    kb.on('keydown-R', () => {
      const n = this.cards.length;
      if (n > 1) {
        let next = this.index;
        while (next === this.index) next = s.run.rng.int(0, n);
        this.index = next;
        this.highlight();
        audio.play('uiMove');
      }
    });
    kb.on('keydown-DOWN', () => this.choose(this.index));
    kb.on('keydown-S', () => this.choose(this.index));

    this.highlight();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      kb.removeAllListeners();
    });
  }

  private buildCard(
    u: Upgrade,
    x: number,
    y: number,
    h: number,
    stacks: number,
  ): { container: Phaser.GameObjects.Container; upgrade: Upgrade; frame: Phaser.GameObjects.Graphics } {
    const color = RARITY_COLOR[u.rarity];
    const c = this.add.container(x, y).setDepth(LAYER.ui);

    const g = this.add.graphics();
    c.add(g);

    const name = new PixelCjk(this, 0, -h / 2 + 74, u.name, {
      scale: 2, px: 12, color: COLORS.bone, depth: LAYER.ui, align: 'center',
    });
    const en = new PixelText(this, 0, -h / 2 + 106, u.nameEn, {
      scale: 1, color: 0x5d7285, depth: LAYER.ui, align: 'center',
    });
    const rarity = new PixelCjk(this, 0, -h / 2 + 132, RARITY_LABEL[u.rarity], {
      scale: 1, px: 11, color, depth: LAYER.ui, align: 'center',
    });
    const desc = new PixelCjk(this, 0, -h / 2 + 176, u.desc, {
      scale: 1, px: 11, color: 0xc7d5e0, depth: LAYER.ui, align: 'center',
    });
    c.add([name.container, en.container, rarity.container, desc.container]);

    if (stacks > 0) {
      const owned = new PixelCjk(this, 0, h / 2 - 76, `已持有 ${stacks} 层`, {
        scale: 1, px: 11, color: 0x7cc7ff, depth: LAYER.ui, align: 'center',
      });
      c.add(owned.container);
    }
    const key = new PixelText(this, 0, h / 2 - 30, `[${this.cards.length + 1}]`, {
      scale: 2, color: 0x3d5060, depth: LAYER.ui, align: 'center',
    });
    c.add(key.container);

    if (u.max > 1) {
      // stack pips instead of a smooth progress bar
      const pips = this.add.graphics();
      const total = u.max;
      const pw = 10;
      const gap = 5;
      const startX = -((total * pw + (total - 1) * gap) / 2);
      for (let i = 0; i < total; i++) {
        pips.fillStyle(i < stacks ? color : 0x2b3946, 1);
        pips.fillRect(x + startX + i * (pw + gap), y + h / 2 - 56, pw, 8);
      }
      c.add(pips);
    }

    return { container: c, upgrade: u, frame: g };
  }

  /** Card art is redrawn rather than tweened, so selection reads instantly. */
  private paintCard(card: { container: Phaser.GameObjects.Container; upgrade: Upgrade; frame: Phaser.GameObjects.Graphics }, selected: boolean) {
    const g = card.frame;
    const color = RARITY_COLOR[card.upgrade.rarity];
    const w = 232;
    const h = 264;
    g.clear();
    g.fillStyle(0x000000, 1);
    g.fillRect(-w / 2, -h / 2, w, h);
    g.lineStyle(2, selected ? color : 0x3c3c3c, 1);
    g.strokeRect(-w / 2, -h / 2, w, h);
    g.fillStyle(color, selected ? 0.16 : 0.07);
    g.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
    // header band
    g.fillStyle(color, 1);
    g.fillRect(-w / 2, -h / 2, w, 4);
    g.fillStyle(color, selected ? 1 : 0.5);
    g.fillRect(-w / 2, -h / 2 + 52, w, 2);
    if (selected) {
      // cursor block on the left, the way the console marks the current pick
      g.fillStyle(color, 1);
      g.fillRect(-w / 2 - 14, -h / 2 + 12, 8, 14);
      g.fillRect(-w / 2 - 12, -h / 2 + 34, 4, 4);
      g.fillRect(w / 2 + 6, -h / 2 + 12, 8, 14);
      g.fillRect(w / 2 + 8, -h / 2 + 34, 4, 4);
    }
  }

  private move(dir: number) {
    const n = this.cards.length;
    if (n === 0) return;
    this.index = (this.index + dir + n) % n;
    this.highlight();
    audioOf(this).play('uiMove');
  }

  private highlight() {
    this.cards.forEach((c, i) => {
      this.paintCard(c, i === this.index);
      c.container.setAlpha(i === this.index ? 1 : 0.7);
    });
  }

  private choose(i: number) {
    const card = this.cards[i];
    if (!card) return;
    audioOf(this).play('upgrade');
    const others = this.cards.filter((_, k) => k !== i);
    this.tweens.add({ targets: others.map((c) => c.container), alpha: 0, scale: 0.8, duration: 200 });
    this.tweens.add({
      targets: card.container,
      scale: 1.18,
      alpha: 0,
      duration: 280,
      ease: 'Cubic.In',
      onComplete: () => this.finish(card.upgrade.id),
    });
    // burst
    const burst = this.add.image(card.container.x, card.container.y, 'p_glow')
      .setDepth(LAYER.ui)
      .setScale(1)
      .setTint(RARITY_COLOR[card.upgrade.rarity])
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: burst, scale: 5, alpha: 0, duration: 420, onComplete: () => burst.destroy() });
  }

  private finish(id: string) {
    this.run.chooseUpgrade(id);
    this.resolve?.(id);
    this.scene.stop();
    this.scene.resume(this.returnTo);
    const back = this.scene.get(this.returnTo) as Phaser.Scene & { resumeFromDraft?: () => void };
    back.resumeFromDraft?.();
  }
}
