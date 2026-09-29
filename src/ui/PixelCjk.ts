import Phaser from 'phaser';

/**
 * Pixelated CJK text.
 *
 * The 8x8 baked strip covers ASCII only, and the menus are written in Chinese.
 * Rather than fall back to a smooth system font -- which is exactly the thing
 * that makes a screen stop looking like a console game -- each string is
 * rasterised once into a 1-bit canvas at a small pixel size, then blown up by
 * an integer factor with nearest-neighbour filtering.
 *
 * The result has hard, chunky edges on the same grid as the rest of the art,
 * and costs one canvas per distinct string.
 */

const FAMILY = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

let textureSeq = 0;

/** Cache key: the rasterised result only depends on text, size and weight. */
const cache = new Map<string, HTMLCanvasElement>();

function raster(text: string, px: number, weight: number): HTMLCanvasElement {
  const key = `${px}|${weight}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `${weight} ${px}px ${FAMILY}`;
  const width = Math.max(1, Math.ceil(measure.measureText(text).width) + 2);
  const height = Math.ceil(px * 1.45);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.font = `${weight} ${px}px ${FAMILY}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 1, 0);

  // Threshold to one bit. Anti-aliased greys are what make rasterised CJK look
  // soft; keeping only fully covered pixels puts every stroke back on the grid.
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i + 3] >= 140;
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
    d[i + 3] = on ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);

  cache.set(key, canvas);
  return canvas;
}

export interface PixelCjkOpts {
  /** Integer upscale. The native pixel size is `px`. */
  scale?: number;
  /** Native raster size in CSS pixels. Smaller = chunkier. */
  px?: number;
  weight?: number;
  color?: number;
  depth?: number;
  align?: 'left' | 'center' | 'right';
  /** Drop shadow offset in scaled pixels, for readability over the field. */
  shadow?: boolean;
}

export class PixelCjk {
  container: Phaser.GameObjects.Container;
  private scene: Phaser.Scene;
  private img?: Phaser.GameObjects.Image;
  private shadow?: Phaser.GameObjects.Image;
  private opts: Required<PixelCjkOpts>;
  private text = '';

  constructor(scene: Phaser.Scene, x: number, y: number, content: string, opts: PixelCjkOpts = {}) {
    this.scene = scene;
    this.opts = {
      scale: opts.scale ?? 2,
      px: opts.px ?? 12,
      weight: opts.weight ?? 500,
      color: opts.color ?? 0xfcfcfc,
      depth: opts.depth ?? 80,
      align: opts.align ?? 'left',
      shadow: opts.shadow ?? false,
    };
    this.container = scene.add.container(x, y).setDepth(this.opts.depth).setScrollFactor(0);
    this.setText(content);
  }

  /** Measured size in scaled pixels, for callers that need to fit a box. */
  get displayWidth(): number {
    return this.img ? this.img.displayWidth : 0;
  }
  get displayHeight(): number {
    return this.img ? this.img.displayHeight : 0;
  }

  setText(content: string) {
    if (content === this.text && this.img) return this;
    this.text = content;
    this.img?.destroy();
    this.shadow?.destroy();
    this.img = undefined;
    this.shadow = undefined;
    if (!content) return this;

    const canvas = raster(content, this.opts.px, this.opts.weight);
    const key = `cjk:${textureSeq++}`;
    if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, canvas);
    const source = this.scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
    const width = source.width * this.opts.scale;
    const height = source.height * this.opts.scale;
    const ox = this.opts.align === 'center' ? -width / 2 : this.opts.align === 'right' ? -width : 0;
    // the raster is measured from the top of its own box, so centre it on the
    // same axis as the horizontal alignment
    const oy = -height / 2;

    const make = (dx: number, dy: number, tint: number) => {
      const im = this.scene.add
        .image(ox + dx, dy, key)
        .setOrigin(0, 0)
        .setScale(this.opts.scale)
        .setScrollFactor(0)
        .setTint(tint);
      this.container.add(im);
      return im;
    };

    if (this.opts.shadow) this.shadow = make(-this.opts.scale, oy - this.opts.scale, 0x000000);
    this.img = make(0, oy, this.opts.color);
    return this;
  }

  setScale(v: number) {
    this.opts.scale = Math.max(1, Math.round(v));
    const t = this.text;
    this.text = '';
    this.setText(t);
    return this;
  }

  setColor(color: number) {
    this.opts.color = color;
    this.img?.setTint(color);
    return this;
  }

  setAlpha(a: number) {
    this.container.setAlpha(a);
    return this;
  }

  setVisible(v: boolean) {
    this.container.setVisible(v);
    return this;
  }

  setPosition(x: number, y: number) {
    this.container.setPosition(x, y);
    return this;
  }

  setDepth(d: number) {
    this.opts.depth = d;
    this.container.setDepth(d);
    return this;
  }

  destroy() {
    this.img?.destroy();
    this.shadow?.destroy();
    this.container.destroy();
  }
}

export function pixelCjk(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  opts: PixelCjkOpts = {},
): PixelCjk {
  return new PixelCjk(scene, x, y, content, opts);
}
