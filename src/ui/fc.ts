import Phaser from 'phaser';
import { PixelText } from './PixelText';
import { PixelCjk, type PixelCjkOpts } from './PixelCjk';
import { COLORS } from '../core/constants';

/**
 * Console-style interface pieces.
 *
 * Everything here is deliberately hard-edged: square corners, a double border,
 * and a selection highlight that reads as a lit frame rather than a hover
 * shadow. That is the vocabulary the whole game is now drawn in, so the menus
 * and the battlefield speak the same language.
 */

export interface FrameOpts {
  fill?: number;
  border?: number;
  inner?: number;
  /** Draw the small square studs in each corner. */
  studs?: boolean;
}

/** Double-bordered panel with square corners. */
export function fcFrame(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: FrameOpts = {},
): Phaser.GameObjects.Container {
  const { fill = 0x0d0d14, border = COLORS.steel, inner = 0x3c3c3c, studs = true } = opts;
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(fill, 1);
  g.fillRect(-w / 2, -h / 2, w, h);
  g.lineStyle(2, border, 1);
  g.strokeRect(-w / 2, -h / 2, w, h);
  g.lineStyle(1, inner, 1);
  g.strokeRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8);
  if (studs) {
    g.fillStyle(border, 1);
    for (const [rx, ry] of [
      [-w / 2 + 9, -h / 2 + 9],
      [w / 2 - 9, -h / 2 + 9],
      [-w / 2 + 9, h / 2 - 9],
      [w / 2 - 9, h / 2 - 9],
    ] as const) {
      g.fillRect(rx - 2, ry - 2, 4, 4);
    }
  }
  c.add(g);
  return c;
}

export interface FcButtonOpts {
  width?: number;
  height?: number;
  scale?: number;
  accent?: number;
  onClick: () => void;
  /** Second line, drawn smaller under the label. */
  sub?: string;
  /** Render the label through the pixel CJK rasteriser instead of the 8x8 strip. */
  cjk?: boolean;
  cjkPx?: number;
  /** Shrink the label until it fits the button. Defaults to true. */
  fit?: boolean;
}

/**
 * A selectable menu entry. Selected entries get a lit border and a blinking
 * cursor block on the left, which is how the console marks the current choice.
 */
export class FcButton {
  container: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private label?: PixelText;
  private labelText = '';
  private labelScaleValue = 3;
  private labelCjk?: PixelCjk;
  private sub?: PixelCjk;
  private w: number;
  private h: number;
  private accent: number;
  private selected: boolean;
  private onClick: () => void;

  /** Runs the entry's action, whether it came from a pointer or the keyboard. */
  activate() {
    this.onClick();
  }
  private cursor: Phaser.GameObjects.Rectangle;
  private blink?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, opts: FcButtonOpts) {
    this.w = opts.width ?? 300;
    this.h = opts.height ?? 44;
    this.accent = opts.accent ?? COLORS.amber;
    this.selected = false;

    this.container = scene.add.container(x, y).setScrollFactor(0);
    this.g = scene.add.graphics();
    this.cursor = scene.add
      .rectangle(-this.w / 2 - 14, 0, 8, 12, this.accent, 1)
      .setOrigin(0.5);
    this.labelText = text;
    this.labelScaleValue = opts.cjk ? 2 : opts.scale ?? 3;
    const labelOpts: PixelCjkOpts = { scale: this.labelScaleValue, px: 12, color: 0xfcfcfc, depth: 0, align: 'center' };
    if (opts.cjk) {
      this.labelCjk = new PixelCjk(scene, 0, 0, text, labelOpts);
      this.container.add([this.g, this.cursor, this.labelCjk.container]);
    } else {
      this.label = new PixelText(scene, 0, 0, text, {
        scale: this.labelScaleValue,
        color: 0xfcfcfc,
        depth: 0,
        align: 'center',
      });
      this.container.add([this.g, this.cursor, this.label.container]);
    }
    if (opts.sub) {
      this.sub = new PixelCjk(scene, 0, 8, opts.sub, { scale: 1, px: 11, color: 0xbcbcbc, depth: 0, align: 'center' });
      this.container.add(this.sub.container);
    }
    this.label?.container.setPosition(0, opts.sub ? -8 : 0);
    this.labelCjk?.setPosition(0, opts.sub ? -8 : 0);
    this.cursor.setVisible(false);
    if (opts.fit !== false) this.fitLabel();

    this.onClick = opts.onClick;
    const hit = scene.add.rectangle(0, 0, this.w, this.h, 0xffffff, 0).setInteractive({ useHandCursor: true });
    this.container.add(hit);
    hit.on('pointerover', () => scene.events.emit('fc-hover', this));
    hit.on('pointerdown', () => this.activate());

    this.redraw();
  }

  setSelected(v: boolean) {
    if (this.selected === v) return;
    this.selected = v;
    this.redraw();
    this.blink?.stop();
    if (v) {
      this.cursor.setVisible(true).setAlpha(1);
      this.blink = this.cursor.scene.tweens.add({
        targets: this.cursor,
        alpha: 0,
        duration: 380,
        yoyo: true,
        repeat: -1,
        ease: 'Linear',
      });
    } else {
      this.cursor.setVisible(false);
    }
  }

  /**
   * Long labels must not spill out of their box. The 8x8 strip has a known
   * advance; the CJK raster has to be measured. Either way the label shrinks
   * by whole steps so it stays on the pixel grid.
   */
  private fitLabel() {
    const inner = this.w - 44;
    for (let i = 0; i < 3; i++) {
      const width = this.labelCjk ? this.labelCjk.displayWidth : this.stripWidth();
      if (width === 0 || width <= inner) return;
      this.labelScaleValue = Math.max(1, this.labelScaleValue - 1);
      this.label?.setScale(this.labelScaleValue);
      this.labelCjk?.setScale(this.labelScaleValue);
    }
  }

  private stripWidth(): number {
    return [...this.labelText].length * 9 * this.labelScaleValue;
  }

  private redraw() {
    const g = this.g;
    g.clear();
    g.fillStyle(this.selected ? 0x1c1c2c : 0x101018, 1);
    g.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    g.lineStyle(2, this.selected ? this.accent : 0x3c3c3c, 1);
    g.strokeRect(-this.w / 2, -this.h / 2, this.w, this.h);
    if (this.selected) {
      g.fillStyle(this.accent, 0.14);
      g.fillRect(-this.w / 2 + 2, -this.h / 2 + 2, this.w - 4, this.h - 4);
    }
    this.label?.setColor(this.selected ? this.accent : 0xbcbcbc);
    this.labelCjk?.setColor(this.selected ? this.accent : 0xbcbcbc);
  }

  setSub(text: string) {
    this.sub?.setText(text);
    return this;
  }

  destroy() {
    this.blink?.stop();
    this.container.destroy();
  }
}

/**
 * A vertical list of entries with keyboard and pointer navigation, matching the
 * console's stage-select menus.
 */
export class FcList {
  index = 0;
  readonly buttons: FcButton[] = [];
  private onChange?: (i: number) => void;

  constructor(private scene: Phaser.Scene, private x: number, private y: number, private gap: number) {}

  add(text: string, onClick: () => void, opts: Omit<FcButtonOpts, 'onClick'> = {}): FcButton {
    const b = new FcButton(this.scene, this.x, this.y + this.buttons.length * this.gap, text, {
      ...opts,
      onClick,
    });
    b.setSelected(this.buttons.length === this.index);
    this.buttons.push(b);
    if (this.buttons.length === 1) this.scene.events.on('fc-hover', this.onHover, this);
    return b;
  }

  private onHover(target: FcButton) {
    const i = this.buttons.indexOf(target);
    if (i >= 0 && i !== this.index) this.moveTo(i);
  }

  moveTo(i: number) {
    if (!this.buttons.length) return;
    this.index = (i + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((b, k) => b.setSelected(k === this.index));
    this.onChange?.(this.index);
  }

  move(delta: number) {
    this.moveTo(this.index + delta);
  }

  confirm() {
    this.buttons[this.index]?.activate();
  }

  get selected(): FcButton | undefined {
    return this.buttons[this.index];
  }

  onChange_(fn: (i: number) => void) {
    this.onChange = fn;
  }
}

/** Full-screen black backdrop for the menu scenes. */
export function fcBackdrop(scene: Phaser.Scene, w: number, h: number, depth = 900): void {
  const g = scene.add.graphics().setDepth(depth).setScrollFactor(0);
  g.fillStyle(0x05060a, 1);
  g.fillRect(0, 0, w, h);
  // a faint scanline wash, the way a CRT dims a flat black
  g.fillStyle(0x0d0d18, 0.5);
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 2);
}
