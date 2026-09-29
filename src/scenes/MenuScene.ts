import Phaser from 'phaser';
import { VIEW, COLORS, LAYER } from '../core/constants';
import { PixelText } from '../ui/PixelText';
import { PixelCjk } from '../ui/PixelCjk';
import { fcBackdrop, fcFrame, FcButton, FcList } from '../ui/fc';
import { audioOf } from '../core/audio';
import { meta, saveMeta, META_UPGRADES, type MetaUpgradeDef } from '../core/meta';
import { Rng } from '../core/rng';
import { RunState } from '../systems/RunState';
import { randomSeed } from '../core/rng';
import { session } from '../session';

const W = VIEW.width;
const H = VIEW.height;

type Tab = 'play' | 'arsenal' | 'stats' | 'help';

export class MenuScene extends Phaser.Scene {
  private tab: Tab = 'play';
  private run: RunState | null = null;
  private seedInput = '';
  private seedLabel!: PixelCjk;
  private root!: Phaser.GameObjects.Container;
  private tabButtons: Record<Tab, FcButton> = {} as Record<Tab, FcButton>;
  private tabList!: FcList;
  private demoTime = 0;
  private tweenTanks: { x: number; y: number; a: number; img: Phaser.GameObjects.Image }[] = [];
  private startHandler!: (run: RunState) => void;
  private confirmReset = false;

  constructor() {
    super('menu');
  }

  init() {
    this.startHandler = (run) => session.launch(run);
  }

  create() {
    const audio = audioOf(this);
    audio.resume();
    audio.stopMusic();
    audio.startMusic((Date.now() / 1000) | 0);
    audio.setIntensity(0.16);

    this.buildBackdrop();
    this.buildTanks();
    this.bindKeys();

    this.root = this.add.container(0, 0).setDepth(LAYER.ui);
    this.buildHeader();
    this.buildTabs();
    this.buildBody();
  }

  /**
   * One keyboard map for the whole menu. Tabs take left/right, space starts a
   * run, and digits are left to the seed field on the play tab.
   */
  private bindKeys() {
    const order: Tab[] = ['play', 'arsenal', 'stats', 'help'];
    // The key that closed the previous scene is still propagating when this
    // scene wakes, so ignore input until the player has actually let go.
    const readyAt = this.time.now + 250;
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.time.now < readyAt) return;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        this.setTab(order[(order.indexOf(this.tab) + 1) % order.length]);
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        this.setTab(order[(order.indexOf(this.tab) + order.length - 1) % order.length]);
      } else if (this.tab === 'play' && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        this.startRun();
      }
    });
  }

  // ------------------------------------------------------------------ visuals

  private buildBackdrop() {
    fcBackdrop(this, W, H, 0);
  }

  private buildTanks() {
    const rng = new Rng(12345);
    const keys = ['tank_player', 'tank_basic', 'tank_fast', 'tank_power', 'tank_armor', 'tank_boss'];
    for (let i = 0; i < 6; i++) {
      const img = this.add
        .image(rng.range(70, W - 70), rng.range(200, H - 90), keys[i % keys.length])
        .setOrigin(0.5, 0.5)
        .setScale(4.5)
        .setAlpha(rng.range(0.03, 0.07));
      this.tweenTanks.push({ x: img.x, y: img.y, a: rng.range(0, Math.PI * 2), img });
    }
  }

  private buildHeader() {
    const cx = W / 2;
    const title = new PixelCjk(this, cx, 46, '铁甲回廊', {
      scale: 3, px: 14, color: COLORS.amber, depth: LAYER.ui, align: 'center',
    });
    const sub = new PixelText(this, cx, 88, 'IRON CORRIDOR', {
      scale: 2, color: COLORS.bone, depth: LAYER.ui, align: 'center',
    });
    this.root.add([title.container, sub.container]);
  }

  private buildTabs() {
    const labels: [Tab, string][] = [
      ['play', '出击'],
      ['arsenal', '军械库'],
      ['stats', '战绩'],
      ['help', '说明'],
    ];
    const tabW = 176;
    const gap = 12;
    const startX = W / 2 - (labels.length * tabW + (labels.length - 1) * gap) / 2 + tabW / 2;

    this.tabList = new FcList(this, 0, 0, 0);
    labels.forEach(([tab, label], i) => {
      const b = new FcButton(this, startX + i * (tabW + gap), 132, label, {
        width: tabW,
        height: 40,
        cjk: true,
        scale: 2,
        onClick: () => {
          audioOf(this).play('uiSelect');
          this.setTab(tab);
        },
      });
      b.setSelected(tab === this.tab);
      this.tabButtons[tab] = b;
      this.tabList.buttons.push(b);
      this.root.add(b.container);
    });
    this.root.add(this.tabList.buttons.map((b) => b.container));
  }

  private setTab(tab: Tab) {
    this.tab = tab;
    this.confirmReset = false;
    for (const [k, b] of Object.entries(this.tabButtons)) b.setSelected(k === tab);
    this.buildBody();
  }

  private clearBody() {
    if (this.body) this.body.destroy(true);
  }
  private body?: Phaser.GameObjects.Container;

  private buildBody() {
    this.clearBody();
    const container = this.add.container(0, 0);
    this.root.add(container);
    this.body = container;
    // every tab shares the same window so switching does not shift the layout
    const frame = fcFrame(this, W / 2, 416, 736, 452, { border: 0x3c3c3c });
    container.add(frame);
    if (this.tab === 'play') this.buildPlay(container);
    else if (this.tab === 'arsenal') this.buildArsenal(container);
    else if (this.tab === 'stats') this.buildStats(container);
    else this.buildHelp(container);
  }

  // ------------------------------------------------------------------ play tab

  private buildPlay(c: Phaser.GameObjects.Container) {
    const m = meta();
    const cx = W / 2;

    const heading = new PixelCjk(this, cx, 222, '开始新的征程', {
      scale: 3, px: 13, color: COLORS.bone, depth: LAYER.ui, align: 'center',
    });
    c.add(heading.container);

    // seed row
    const seedY = 286;
    const seedLabel = new PixelCjk(this, cx - 300, seedY - 8, '种子', {
      scale: 1, px: 12, color: COLORS.steel, depth: LAYER.ui, align: 'left',
    });
    c.add(seedLabel.container);

    const box = this.add.graphics();
    box.fillStyle(0x000000, 1);
    box.fillRect(cx - 300, seedY - 12, 420, 34);
    box.lineStyle(2, 0x3c3c3c, 1);
    box.strokeRect(cx - 300, seedY - 12, 420, 34);
    c.add(box);

    this.seedLabel = new PixelCjk(this, cx - 300 + 8, seedY - 6, this.seedInput || '留空 = 随机', {
      scale: 1, px: 12, color: this.seedInput ? COLORS.bone : 0x4f6274, depth: LAYER.ui, align: 'left',
    });
    c.add(this.seedLabel.container);

    const reroll = new FcButton(this, cx + 160, seedY + 5, '重随', {
      width: 92, height: 34, cjk: true, onClick: () => {
        this.seedInput = String(randomSeed() % 100000);
        this.seedLabel.setText(this.seedInput).setColor(COLORS.bone);
        audioOf(this).play('uiMove');
      },
    });
    const clearSeed = new FcButton(this, cx + 264, seedY + 5, '清空', {
      width: 92, height: 34, cjk: true, accent: COLORS.steel, onClick: () => {
        this.seedInput = '';
        this.seedLabel.setText('留空 = 随机').setColor(0x4f6274);
        audioOf(this).play('uiMove');
      },
    });
    c.add([reroll.container, clearSeed.container]);

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.tab !== 'play' || !this.body) return;
      if (e.key === 'Backspace') this.seedInput = this.seedInput.slice(0, -1);
      else if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) this.seedInput += e.key;
      else return;
      this.seedLabel.setText(this.seedInput || '留空 = 随机');
      this.seedLabel.setColor(this.seedInput ? COLORS.bone : 0x4f6274);
    });

    const start = new FcButton(this, cx, 400, '进 入 回 廊', {
      width: 420, height: 64, cjk: true, onClick: () => this.startRun(),
    });
    start.container.setScale(1.25);
    c.add(start.container);

    const stats = new PixelCjk(this, cx, 470, `出击 ${m.runs} 次   ·   最深 ${m.bestDepth} 层   ·   最高击杀 ${m.bestKills}`, {
      scale: 1, px: 12, color: COLORS.steel, depth: LAYER.ui, align: 'center',
    });
    const scrap = new PixelCjk(this, cx, 502, `可用废料 ${m.scrap}`, {
      scale: 2, px: 12, color: COLORS.amber, depth: LAYER.ui, align: 'center',
    });
    c.add([stats.container, scrap.container]);

    const hint = new PixelText(this, cx, 556, 'ENTER START    A D SWITCH TAB', {
      scale: 2, color: 0x4f6274, depth: LAYER.ui, align: 'center',
    });
    c.add(hint.container);

  }

  private startRun() {
    const audio = audioOf(this);
    audio.play('uiSelect');
    const seed = this.seedInput ? Rng.fromString(this.seedInput).int(1, 0x7fffffff) : randomSeed();
    this.run = new RunState(seed);
    this.startHandler(this.run);
  }

  /** Label/value stack used by the stats tab. */
  private buildTally(
    target: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    value: string,
    color: number = COLORS.bone,
  ) {
    const l = new PixelCjk(this, x, y, label, { scale: 1, px: 12, color: COLORS.steel, depth: LAYER.ui, align: 'center' });
    const v = new PixelText(this, x, y + 22, value, { scale: 3, color, depth: LAYER.ui, align: 'center' });
    target.add([l.container, v.container]);
  }

  // ------------------------------------------------------------------ arsenal

  private buildArsenal(c: Phaser.GameObjects.Container) {
    const cx = W / 2;
    const m = meta();

    const head = new PixelCjk(this, cx - 336, 222, '军械库 · 永久强化', {
      scale: 2, px: 13, color: COLORS.bone, depth: LAYER.ui, align: 'left',
    });
    const scrap = new PixelCjk(this, cx + 336, 224, `废料 ${m.scrap}`, {
      scale: 2, px: 12, color: COLORS.amber, depth: LAYER.ui, align: 'right',
    });
    c.add([head.container, scrap.container]);

    const note = new PixelCjk(this, cx - 336, 256, '击杀敌人获取废料，升级永久生效并保存到本地。', {
      scale: 1, px: 12, color: 0x4f6274, depth: LAYER.ui, align: 'left',
    });
    c.add(note.container);

    // two columns, three rows: the grid has to fit inside the 736-wide window
    const perRow = 2;
    const cardW = 340;
    const cardH = 96;
    const gap = 16;
    const startY = 322;

    META_UPGRADES.forEach((def, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = cx - (cardW + gap) / 2 + col * (cardW + gap);
      const y = startY + row * (cardH + 12);
      const level = m.upgrades[def.id] ?? 0;
      const maxed = level >= def.max;
      const cost = def.cost(level);
      const afford = m.scrap >= cost && !maxed;
      this.metaCard(c, def, x, y, cardW, cardH, level, maxed, afford, cost);
    });
  }

  private metaCard(
    c: Phaser.GameObjects.Container,
    def: MetaUpgradeDef,
    x: number,
    y: number,
    w: number,
    h: number,
    level: number,
    maxed: boolean,
    afford: boolean,
    cost: number,
  ) {
    const accent = maxed ? COLORS.mint : afford ? COLORS.amber : 0x3c3c3c;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 1);
    g.fillRect(x - w / 2, y - h / 2, w, h);
    g.lineStyle(2, accent, maxed || afford ? 1 : 0.6);
    g.strokeRect(x - w / 2, y - h / 2, w, h);
    // level bar down the left edge
    g.fillStyle(accent, 1);
    g.fillRect(x - w / 2, y - h / 2 + 4, 4, h - 8);
    c.add(g);

    const name = new PixelCjk(this, x - w / 2 + 16, y - 32, def.name, {
      scale: 2, px: 12, color: COLORS.bone, depth: LAYER.ui, align: 'left',
    });
    const desc = new PixelCjk(this, x - w / 2 + 16, y - 2, def.desc(Math.min(level, def.max - 1)), {
      scale: 1, px: 11, color: 0x8fa3b4, depth: LAYER.ui, align: 'left',
    });
    c.add([name.container, desc.container]);

    // pips
    for (let i = 0; i < def.max; i++) {
      const px = x - w / 2 + 16 + i * 13;
      const filled = i < level;
      const pip = this.add.graphics();
      pip.fillStyle(filled ? COLORS.amber : 0x2b3946, 1);
      pip.fillRect(px, y + 24, 10, 8);
      c.add(pip);
    }

    const btn = new FcButton(this, x + w / 2 - 62, y, maxed ? 'MAX' : String(cost), {
      width: 108,
      height: 38,
      accent: maxed ? COLORS.mint : afford ? COLORS.amber : 0x3c3c3c,
      onClick: () => {
        const m2 = meta();
        const lvl = m2.upgrades[def.id] ?? 0;
        if (lvl >= def.max) return;
        const price = def.cost(lvl);
        if (m2.scrap < price) return;
        const upgrades = { ...m2.upgrades, [def.id]: lvl + 1 };
        saveMeta({ scrap: m2.scrap - price, upgrades });
        audioOf(this).play('upgrade');
        this.buildBody();
      },
    });
    c.add(btn.container);
  }

  // ------------------------------------------------------------------ stats

  private buildStats(c: Phaser.GameObjects.Container) {
    const m = meta();
    const cx = W / 2;

    const head = new PixelCjk(this, cx, 210, '战绩档案', {
      scale: 4, px: 13, color: COLORS.bone, depth: LAYER.ui, align: 'center',
    });
    c.add(head.container);

    const acc = m.totalShots > 0 ? m.totalHits / m.totalShots : 0;
    const grid: [string, string, number][] = [
      ['出击次数', String(m.runs), COLORS.bone],
      ['最深层数', String(m.bestDepth), COLORS.amber],
      ['单局最高击杀', String(m.bestKills), COLORS.bone],
      ['累计击杀', String(m.totalKills), COLORS.rust],
      ['累计射击', String(m.totalShots), COLORS.bone],
      ['总命中率', `${Math.round(acc * 100)}%`, COLORS.mint],
      ['累计游戏时间', formatTime(m.totalPlaytime), COLORS.bone],
      ['剩余废料', String(m.scrap), COLORS.amber],
    ];
    const startY = 268;
    grid.forEach((row, i) => {
      const col = i % 2;
      const r = Math.floor(i / 2);
      this.buildTally(c, cx - 184 + col * 368, startY + r * 62, row[0], row[1], row[2]);
    });

    const reset = new FcButton(this, cx, 590, this.confirmReset ? 'CONFIRM WIPE' : 'WIPE SAVE DATA', {
      width: 320, height: 44, accent: COLORS.rust, onClick: () => {
        if (!this.confirmReset) {
          this.confirmReset = true;
          reset.setSub('');
          this.buildBody();
          audioOf(this).play('uiMove');
          return;
        }
        localStorage.removeItem('iron-corridor/meta/v1');
        window.location.reload();
      },
    });
    c.add(reset.container);
  }

  // ------------------------------------------------------------------ help

  private buildHelp(c: Phaser.GameObjects.Container) {
    const cx = W / 2;

    const head = new PixelCjk(this, cx, 224, '操作与玩法', {
      scale: 3, px: 13, color: COLORS.bone, depth: LAYER.ui, align: 'center',
    });
    c.add(head.container);

    const keys: [string, string][] = [
      ['WASD', '驾驶战车'],
      ['MOUSE', '炮塔独立瞄准'],
      ['CLICK/SPACE', '开火（可按住连射）'],
      ['SHIFT/F', '冲刺，带短暂无敌'],
      ['WHEEL/QE', '切换武器'],
      ['ESC/P', '暂停'],
    ];
    keys.forEach(([k, v], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = cx - 344 + col * 360;
      const y = 284 + row * 46;
      const kt = new PixelText(this, x, y, k, { scale: 2, color: COLORS.amber, depth: LAYER.ui, align: 'left' });
      // the key column is fixed width so the descriptions line up
      const vt = new PixelCjk(this, x + 200, y, v, { scale: 1, px: 12, color: 0xc7d5e0, depth: LAYER.ui, align: 'left' });
      c.add([kt.container, vt.container]);
    });

    const rules: string[] = [
      '每层回廊随机生成，包含 3 波敌对装甲；每 5 层出现 BOSS「钢铁霸主」。',
      '击杀获得经验，升级与通关都会给出三选一强化，共 25 种，可叠加。',
      '木制掩体可被炮弹摧毁，金属掩体不可摧毁；油桶区会持续造成伤害。',
      '掉落物包含废料、修复包、护盾、原子弹与临时武器，靠近自动吸取。',
      '坦克被击毁即本局结束 —— 没有读档。永久强化只消耗废料。',
    ];
    rules.forEach((r, i) => {
      const t = new PixelCjk(this, cx - 344, 442 + i * 34, `· ${r}`, {
        scale: 1, px: 12, color: 0x8fa3b4, depth: LAYER.ui, align: 'left',
      });
      c.add(t.container);
    });
  }

  // ------------------------------------------------------------------ loop

  override update(_t: number, delta: number) {
    const dt = delta / 1000;
    this.demoTime += dt;
    for (const t of this.tweenTanks) {
      t.img.x += Math.cos(t.a) * 6 * dt;
      t.img.y += Math.sin(t.a) * 6 * dt;
      if (t.img.x < 30 || t.img.x > W - 30) t.a = Math.PI - t.a;
      if (t.img.y < 190 || t.img.y > H - 80) t.a = -t.a;
    }
  }
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
