import Phaser from 'phaser';
import { FONT_ORDER } from '../data/fontMap';

/**
 * Bitmap text.
 *
 * The HUD is drawn from a baked 8x8 glyph strip rather than a browser font, so
 * every character lands on the same pixel grid as the rest of the game. One
 * texture holds the whole character set; each letter is a frame of it.
 */

const FRAME_W = 8;

let stripReady = false;

/** Preload the glyph strip once, before the first scene needs it. */
export function loadPixelText(scene: Phaser.Scene) {
  if (stripReady) return;
  if (scene.textures.exists('pxfont')) {
    stripReady = true;
    return;
  }
  scene.load.image('pxfont', 'assets/fc/font.png');
  scene.load.once('complete', () => {
    stripReady = true;
  });
  // the strip is tiny; load it synchronously-ish by adding it to the queue
  if (scene.load.textureManager.exists('pxfont')) stripReady = true;
}

export interface PixelTextOpts {
  scale?: number;
  color?: number;
  depth?: number;
  align?: 'left' | 'center' | 'right';
  shadow?: boolean;
  spacing?: number;
}

export class PixelText {
  container: Phaser.GameObjects.Container;
  private letters: { img: Phaser.GameObjects.Image; ch: string }[] = [];
  private currentText = '';
  private opts: Required<PixelTextOpts>;

  constructor(scene: Phaser.Scene, x: number, y: number, content: string, opts: PixelTextOpts = {}) {
    this.opts = {
      scale: opts.scale ?? 3,
      color: opts.color ?? 0xfcfcfc,
      depth: opts.depth ?? 80,
      align: opts.align ?? 'left',
      shadow: opts.shadow ?? false,
      spacing: opts.spacing ?? 1,
    };
    // the camera is offset to place the field inside its bezel, so HUD text
    // must opt out of scrolling entirely
    this.container = scene.add.container(x, y).setDepth(this.opts.depth).setScrollFactor(0);
    this.setText(content);
  }

  setText(content: string) {
    this.currentText = content;
    const { scale, spacing } = this.opts;
    for (const l of this.letters) l.img.destroy();
    this.letters = [];
    const upper = content.toUpperCase();
    let cursor = 0;
    for (const ch of upper) {
      const idx = (FONT_ORDER as readonly string[]).indexOf(ch);
      if (idx < 0) {
        cursor += (FRAME_W + spacing) * scale;
        continue;
      }
      const img = this.container.scene.add
        .image(cursor, 0, 'pxfont')
        .setOrigin(0, 0)
        .setFrame(idx)
        .setScale(scale)
        .setScrollFactor(0)
        .setTint(this.opts.color);
      this.container.add(img);
      this.letters.push({ img, ch });
      cursor += (FRAME_W + spacing) * scale;
    }
    if (this.opts.align !== 'left') {
      const total = cursor - spacing * scale;
      const shift = this.opts.align === 'center' ? -total / 2 : -total;
      for (const l of this.letters) l.img.x += shift;
    }
    return this;
  }

  setScale(v: number) {
    this.opts.scale = v;
    const text = this.currentText;
    this.letters = [];
    if (text) this.setText(text);
    return this;
  }

  setColor(color: number) {
    this.opts.color = color;
    for (const l of this.letters) l.img.setTint(color);
  }

  setVisible(v: boolean) {
    this.container.setVisible(v);
  }

  setPosition(x: number, y: number) {
    this.container.setPosition(x, y);
    return this;
  }

  setAlpha(a: number) {
    this.container.setAlpha(a);
  }

  destroy() {
    this.container.destroy();
  }
}

/** Convenience: draw a string and keep a handle for later edits. */
export function pixelText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  opts: PixelTextOpts = {},
): PixelText {
  return new PixelText(scene, x, y, content, opts);
}
