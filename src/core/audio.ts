import Phaser from 'phaser';

type SfxKey =
  | 'shoot'
  | 'shootHeavy'
  | 'shootLaser'
  | 'hit'
  | 'hitWall'
  | 'explode'
  | 'explodeBig'
  | 'pickup'
  | 'upgrade'
  | 'dash'
  | 'reload'
  | 'enemyShoot'
  | 'waveClear'
  | 'bossRoar'
  | 'playerHurt'
  | 'uiMove'
  | 'uiSelect'
  | 'powerUp'
  | 'gameOver'
  | 'step';

/**
 * Audio facade over Phaser's sound manager plus a small WebAudio chiptune
 * synthesiser used for the adaptive battle theme.
 */
export class AudioMan {
  private master: GainNode;
  private musicBus: GainNode;
  private sfxBus: GainNode;
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private musicTimer: number | null = null;
  private step = 0;
  private nextNoteTime = 0;
  private intensity = 0;
  private targetIntensity = 0;
  private running = false;
  private scale: number[] = [];
  private trackSeed = 0;

  constructor(_scene: Phaser.Scene) {
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(ctx.destination);

    this.applyVolumes();
    this.buildNoise();
  }

  private volumes() {
    const raw = localStorage.getItem('iron-corridor/meta/v1');
    let v = { master: 0.8, music: 0.5, sfx: 0.85 };
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { volumes?: typeof v };
        if (parsed.volumes) v = { ...v, ...parsed.volumes };
      } catch {
        /* keep defaults */
      }
    }
    return v;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const v = this.volumes();
    this.master.gain.value = v.master;
    this.musicBus.gain.value = v.music;
    this.sfxBus.gain.value = v.sfx;
  }

  private buildNoise() {
    const ctx = this.ctx;
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * 1.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  // ---------------------------------------------------------------- primitives

  private env(node: AudioNode, t: number, a: number, d: number, peak: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    node.connect(g);
    return g;
  }

  private tone(
    freq: number,
    t: number,
    dur: number,
    type: OscillatorType,
    peak: number,
    bus: GainNode,
    glideTo?: number,
  ) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t + dur);
    const g = this.env(osc, t, Math.min(0.012, dur * 0.2), dur, peak);
    g.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.06);
  }

  private noise(t: number, dur: number, peak: number, filterType: BiquadFilterType, freq: number, bus: GainNode, sweepTo?: number) {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t + dur);
    filter.Q.value = 1.1;
    src.connect(filter);
    const g = this.env(filter, t, 0.005, dur, peak);
    g.connect(bus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // --------------------------------------------------------------------- sfx

  play(key: SfxKey, detune = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + 0.001;
    const bus = this.sfxBus;
    const d = detune / 1200;

    switch (key) {
      case 'shoot': {
        this.tone(320 * (1 + d), t, 0.13, 'square', 0.22, bus, 70);
        this.noise(t, 0.1, 0.16, 'lowpass', 1800, bus, 300);
        break;
      }
      case 'shootHeavy': {
        this.tone(150 * (1 + d), t, 0.3, 'sawtooth', 0.3, bus, 38);
        this.noise(t, 0.26, 0.24, 'lowpass', 1100, bus, 140);
        break;
      }
      case 'shootLaser': {
        this.tone(1500 * (1 + d), t, 0.2, 'sawtooth', 0.16, bus, 260);
        this.tone(2400 * (1 + d), t, 0.14, 'sine', 0.1, bus, 500);
        break;
      }
      case 'enemyShoot': {
        this.tone(240 * (1 + d), t, 0.1, 'square', 0.13, bus, 90);
        break;
      }
      case 'hit': {
        this.noise(t, 0.11, 0.26, 'bandpass', 1300, bus, 500);
        this.tone(180, t, 0.09, 'square', 0.12, bus, 90);
        break;
      }
      case 'hitWall': {
        this.noise(t, 0.09, 0.2, 'highpass', 900, bus, 1800);
        break;
      }
      case 'explode': {
        this.noise(t, 0.42, 0.4, 'lowpass', 1500, bus, 90);
        this.tone(120, t, 0.34, 'sine', 0.24, bus, 34);
        break;
      }
      case 'explodeBig': {
        this.noise(t, 0.95, 0.5, 'lowpass', 1100, bus, 55);
        this.tone(88, t, 0.8, 'sine', 0.34, bus, 24);
        this.tone(150, t + 0.05, 0.5, 'sawtooth', 0.14, bus, 40);
        break;
      }
      case 'playerHurt': {
        this.tone(420, t, 0.2, 'sawtooth', 0.2, bus, 90);
        this.noise(t, 0.18, 0.18, 'bandpass', 700, bus, 200);
        break;
      }
      case 'dash': {
        this.noise(t, 0.2, 0.16, 'bandpass', 500, bus, 2600);
        break;
      }
      case 'reload': {
        this.tone(880, t, 0.06, 'square', 0.09, bus);
        this.tone(660, t + 0.06, 0.07, 'square', 0.08, bus);
        break;
      }
      case 'pickup': {
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.045, 0.11, 'triangle', 0.14, bus));
        break;
      }
      case 'upgrade': {
        [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, t + i * 0.055, 0.2, 'square', 0.1, bus));
        break;
      }
      case 'waveClear': {
        [523, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.09, 0.3, 'triangle', 0.15, bus));
        break;
      }
      case 'bossRoar': {
        this.tone(70, t, 1.2, 'sawtooth', 0.32, bus, 42);
        this.noise(t, 1.1, 0.22, 'lowpass', 700, bus, 120);
        this.tone(105, t + 0.1, 0.9, 'square', 0.14, bus, 60);
        break;
      }
      case 'gameOver': {
        [440, 392, 330, 262, 196].forEach((f, i) => this.tone(f, t + i * 0.16, 0.42, 'triangle', 0.16, bus));
        break;
      }
      case 'uiMove': {
        this.tone(660, t, 0.05, 'square', 0.07, bus);
        break;
      }
      case 'uiSelect': {
        this.tone(520, t, 0.06, 'square', 0.1, bus, 880);
        break;
      }
      case 'step': {
        this.noise(t, 0.07, 0.07, 'lowpass', 420, bus, 160);
        break;
      }
    }
  }

  // ------------------------------------------------------------------- music

  /** Choose a fresh minor-pentatonic seed so every run sounds different. */
  startMusic(seed: number) {
    if (!this.ctx || this.running) return;
    this.running = true;
    this.trackSeed = seed;
    const bases = [55, 58, 62, 65, 69];
    const root = bases[seed % bases.length];
    const scales = [
      [0, 3, 5, 7, 10],
      [0, 2, 3, 7, 8],
      [0, 3, 5, 6, 10],
      [0, 2, 5, 7, 9],
    ];
    const scale = scales[(seed >>> 3) % scales.length];
    this.scale = scale.map((s) => root * Math.pow(2, s / 12));
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.08;
    this.musicTimer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    this.running = false;
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  setIntensity(value: number) {
    this.targetIntensity = Phaser.Math.Clamp(value, 0, 1);
  }

  /** 0 = menu ambience, 0.5 = normal combat, 1 = boss. */
  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.running) return;
    this.intensity += (this.targetIntensity - this.intensity) * 0.06;
    const spb = 60 / 132 / 2; // eighth notes at ~132bpm
    while (this.nextNoteTime < ctx.currentTime + 0.2) {
      this.playStep(this.nextNoteTime, this.step, spb);
      this.nextNoteTime += spb;
      this.step++;
    }
  }

  private playStep(t: number, step: number, spb: number) {
    const bus = this.musicBus;
    const scale = this.scale;
    if (scale.length === 0) return;
    const bar = Math.floor(step / 8) % 8;
    const s = step % 8;
    const inten = this.intensity;

    // bass pulse
    if (s % 4 === 0) {
      const note = scale[(bar * 2) % scale.length] / 2;
      this.tone(note, t, spb * 1.6, 'triangle', 0.16 + inten * 0.08, bus);
    }
    // kick
    if (inten > 0.22 && (s === 0 || s === 3 || s === 6)) {
      this.tone(150, t, 0.16, 'sine', 0.28 * inten + 0.06, bus, 40);
    }
    // hats
    if (inten > 0.5 && s % 2 === 1) {
      this.noise(t, 0.04, 0.07 * inten, 'highpass', 6000, bus, 8000);
    }
    // arp — the melody layer, present from the menu onwards
    const pattern = [0, 2, 4, 2, 1, 3, 4, 3];
    const idx = pattern[(step + (this.trackSeed % 4)) % pattern.length];
    const mel = scale[idx % scale.length] * 2;
    const voice: OscillatorType = inten > 0.62 ? 'sawtooth' : 'square';
    const level = 0.055 + inten * 0.05;
    if (s % 2 === 0 || inten > 0.4) this.tone(mel, t, spb * 0.85, voice, level, bus);

    // boss layer: driving offbeat stabs
    if (inten > 0.78 && s % 4 === 2) {
      this.tone(scale[0] * 1, t, spb * 0.7, 'sawtooth', 0.09, bus);
      this.tone(scale[0] * 1.5, t, spb * 0.7, 'sawtooth', 0.06, bus);
    }
  }
}

let instance: AudioMan | null = null;

/** Called once from BootScene; every scene then reads the shared manager. */
export function registerAudio(scene: Phaser.Scene): AudioMan {
  if (!instance) instance = new AudioMan(scene);
  return instance;
}

export function audioOf(_scene?: Phaser.Scene): AudioMan {
  if (!instance) throw new Error('AudioMan used before registerAudio()');
  return instance;
}
