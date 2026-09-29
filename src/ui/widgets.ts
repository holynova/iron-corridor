import Phaser from 'phaser';
import { COLORS } from '../core/constants';

export const FONT = '"KenneyFuture", "Kenney Blocks", "PingFang SC", "Microsoft YaHei", sans-serif';
export const FONT_SQUARE = '"Kenney Blocks", "KenneyMiniSquare", "PingFang SC", sans-serif';

export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  size = 20,
  color = '#e8eef3',
  opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {},
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, content, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    ...opts,
  });
  t.setResolution(Math.min(3, window.devicePixelRatio || 1) * 1.5);
  return t;
}

/** Bevelled metal panel used across every menu screen. */
export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill?: number; alpha?: number; accent?: number; radius?: number } = {},
): Phaser.GameObjects.Container {
  const { fill = 0x131b23, alpha = 0.96, accent = COLORS.amber, radius = 10 } = opts;
  const c = scene.add.container(x, y);
  const shadow = scene.add.graphics();
  shadow.fillStyle(0x000000, 0.45);
  shadow.fillRoundedRect(-w / 2 + 6, -h / 2 + 8, w, h, radius);
  const g = scene.add.graphics();
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
  g.lineStyle(2, accent, 0.5);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  // corner rivets
  g.fillStyle(accent, 0.55);
  const pad = 12;
  for (const [rx, ry] of [
    [-w / 2 + pad, -h / 2 + pad],
    [w / 2 - pad, -h / 2 + pad],
    [-w / 2 + pad, h / 2 - pad],
    [w / 2 - pad, h / 2 - pad],
  ] as const) {
    g.fillCircle(rx, ry, 2.6);
  }
  c.add([shadow, g]);
  return c;
}

export interface ButtonOpts {
  width?: number;
  height?: number;
  size?: number;
  accent?: number;
  onClick: () => void;
  enabled?: boolean;
  sub?: string;
}

export class Button {
  container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private subLabel?: Phaser.GameObjects.Text;
  private hovered = false;
  private w: number;
  private h: number;
  private accent: number;
  private enabledFlag: boolean;
  private onClick: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, label: string, opts: ButtonOpts) {
    this.w = opts.width ?? 340;
    this.h = opts.height ?? 62;
    this.accent = opts.accent ?? COLORS.amber;
    this.enabledFlag = opts.enabled ?? true;
    this.onClick = opts.onClick;

    this.bg = scene.add.graphics();
    this.label = text(scene, 0, opts.sub ? -8 : 0, label, opts.size ?? 24, '#ffffff', { align: 'center' }).setOrigin(0.5);
    this.container = scene.add.container(x, y, [this.bg, this.label]);
    if (opts.sub) {
      this.subLabel = text(scene, 0, 15, opts.sub, 13, '#8fa3b4', { align: 'center' }).setOrigin(0.5);
      this.container.add(this.subLabel);
    }
    this.container.setSize(this.w, this.h);
    this.container.setInteractive(
      new Phaser.Geom.Rectangle(-this.w / 2, -this.h / 2, this.w, this.h),
      Phaser.Geom.Rectangle.Contains,
    );
    this.container.on('pointerover', () => {
      this.hovered = true;
      this.draw();
      scene.tweens.add({ targets: this.container, scaleX: 1.03, scaleY: 1.03, duration: 110, ease: 'Cubic.Out' });
    });
    this.container.on('pointerout', () => {
      this.hovered = false;
      this.draw();
      scene.tweens.add({ targets: this.container, scaleX: 1, scaleY: 1, duration: 110, ease: 'Cubic.Out' });
    });
    this.container.on('pointerdown', () => {
      if (!this.enabledFlag) return;
      scene.tweens.add({ targets: this.container, scaleX: 0.97, scaleY: 0.97, duration: 70, yoyo: true });
      this.onClick();
    });
    this.draw();
  }

  setEnabled(v: boolean) {
    this.enabledFlag = v;
    this.draw();
  }

  setLabel(t: string) {
    this.label.setText(t);
  }

  setSub(t: string) {
    this.subLabel?.setText(t);
  }

  setAccent(c: number) {
    this.accent = c;
    this.draw();
  }

  private draw() {
    const g = this.bg;
    g.clear();
    const disabled = !this.enabledFlag;
    const a = disabled ? 0.28 : this.hovered ? 1 : 0.82;
    g.fillStyle(disabled ? 0x1b2229 : this.hovered ? 0x24313d : 0x1a232c, 1);
    g.fillRoundedRect(-this.w / 2, -this.h / 2, this.w, this.h, 8);
    g.lineStyle(2, this.accent, disabled ? 0.2 : a);
    g.strokeRoundedRect(-this.w / 2, -this.h / 2, this.w, this.h, 8);
    // left accent bar
    g.fillStyle(this.accent, disabled ? 0.2 : a);
    g.fillRoundedRect(-this.w / 2 + 4, -this.h / 2 + 8, 5, this.h - 16, 3);
    // scanline sheen
    g.fillStyle(0xffffff, this.hovered && !disabled ? 0.05 : 0.02);
    g.fillRoundedRect(-this.w / 2 + 12, -this.h / 2 + 3, this.w - 24, this.h * 0.4, 6);
    this.label.setAlpha(disabled ? 0.4 : 1);
    this.subLabel?.setAlpha(disabled ? 0.3 : 0.9);
  }

  destroy() {
    this.container.destroy();
  }
}

/** Full-screen dimmer used behind modal screens. */
export function scrim(scene: Phaser.Scene, alpha = 0.72, depth = 900): Phaser.GameObjects.Rectangle {
  const r = scene.add.rectangle(0, 0, 100000, 100000, 0x05080b, alpha).setOrigin(0);
  r.setDepth(depth).setScrollFactor(0).setInteractive();
  return r;
}

export function bar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  bg = 0x0d1319,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(bg, 0.85);
  g.fillRoundedRect(x, y, w, h, h / 2);
  g.fillStyle(color, 1);
  g.fillRoundedRect(x, y, w, h, h / 2);
  return g;
}
