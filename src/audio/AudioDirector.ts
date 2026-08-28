import type { Combatant, MirrorType } from "../game/types";

type Side = Combatant["id"];

/**
 * Original, asset-free chamber score and foley synthesized in the browser.
 * Harpsichord-like plucks, glass harmonics, clockwork ticks and velvet-soft
 * impacts keep the enchanted manor identity consistent without external files.
 */
export class AudioDirector {
  private context?: AudioContext;
  private master?: GainNode;
  private musicBus?: GainNode;
  private sfxBus?: GainNode;
  private noise?: AudioBuffer;
  private nextStepAt = 0;
  private step = 0;
  private muted = false;
  private danger = 0;
  private active = true;

  unlock(): void {
    if (!this.context) this.createGraph();
    if (this.context?.state === "suspended") void this.context.resume();
  }

  toggleMuted(): boolean {
    this.unlock();
    this.muted = !this.muted;
    if (this.context && this.master) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(this.muted ? 0.0001 : 0.72, this.context.currentTime, 0.025);
    }
    return this.muted;
  }

  update(danger: number, active: boolean): void {
    this.danger = Math.max(0, Math.min(1, danger));
    this.active = active;
    const context = this.context;
    if (!context || context.state !== "running" || this.muted) return;

    if (this.nextStepAt < context.currentTime - 0.5) this.nextStepAt = context.currentTime;
    while (this.nextStepAt < context.currentTime + 0.12) {
      this.scheduleMusicStep(this.nextStepAt, this.step);
      this.step += 1;
      this.nextStepAt += 60 / (this.danger > 0.55 ? 108 : 90) / 3;
    }
  }

  roundStart(): void {
    const now = this.now();
    [0, 0.12, 0.24].forEach((delay, index) => this.tone([523.25, 659.25, 783.99][index], "sine", 0.045, 0.5, delay));
    this.tone(130.81, "triangle", 0.06, 0.85, 0.02);
    this.noiseBurst(now + 0.01, 0.035, 0.012, 5500);
  }

  fire(side: Side): void {
    const context = this.context;
    if (!context || !this.sfxBus) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const pan = context.createStereoPanner();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(side === "player" ? 392 : 329.63, now);
    oscillator.frequency.exponentialRampToValueAtTime(side === "player" ? 1567.98 : 1318.51, now + 0.19);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(2700, now + 0.19);
    pan.pan.value = side === "player" ? -0.28 : 0.28;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.23);
    oscillator.connect(filter).connect(gain).connect(pan).connect(this.sfxBus);
    oscillator.start(now);
    oscillator.stop(now + 0.25);
    this.noiseBurst(now, 0.12, 0.018, 3500, side === "player" ? -0.28 : 0.28);
    this.tone(side === "player" ? 783.99 : 659.25, "sine", 0.035, 0.32, 0.025, side === "player" ? -0.28 : 0.28);
  }

  ricochet(type: MirrorType, pan = 0): void {
    const tones: Record<MirrorType, number[]> = {
      STANDARD: [1046.5, 1567.98, 2093],
      SPLITTER: [659.25, 830.61, 987.77],
      EXPLOSIVE: [196, 146.83, 98],
    };
    const duration = type === "EXPLOSIVE" ? 0.28 : 0.13;
    tones[type].forEach((frequency, index) => {
      this.tone(frequency, index === 0 ? "sine" : "triangle", 0.065 / (index + 1), duration, index * 0.022, pan);
    });
    if (type === "SPLITTER") this.noiseBurst(this.now() + 0.015, 0.075, 0.012, 5200, pan);
  }

  hit(side: Side): void {
    const pan = side === "player" ? -0.35 : 0.35;
    this.tone(side === "player" ? 146.83 : 123.47, "triangle", 0.12, 0.28, 0, pan, 73.42);
    this.tone(side === "player" ? 440 : 392, "sine", 0.035, 0.18, 0.015, pan);
    this.noiseBurst(this.now(), 0.12, 0.045, 1100, pan);
  }

  explosion(pan = 0): void {
    const now = this.now();
    this.noiseBurst(now, 0.48, 0.12, 900, pan);
    this.tone(98, "sine", 0.17, 0.56, 0, pan, 49);
    [523.25, 659.25, 783.99].forEach((frequency, index) => this.tone(frequency, "sine", 0.03, 0.42, 0.025 + index * 0.035, pan));
  }

  wallImpact(): void {
    this.tone(164.81, "triangle", 0.028, 0.09, 0, 0, 123.47);
    this.noiseBurst(this.now(), 0.045, 0.018, 850);
  }

  end(won: boolean): void {
    this.active = false;
    this.chime(won ? [261.63, 329.63, 392, 523.25] : [392, 311.13, 246.94, 196], 0.075, 1.55);
  }

  private createGraph(): void {
    this.context = new AudioContext();
    const context = this.context;
    this.master = context.createGain();
    this.musicBus = context.createGain();
    this.sfxBus = context.createGain();
    const compressor = context.createDynamicsCompressor();
    this.master.gain.value = this.muted ? 0.0001 : 0.72;
    this.musicBus.gain.value = 0.23;
    this.sfxBus.gain.value = 0.82;
    compressor.threshold.value = -18;
    compressor.knee.value = 14;
    compressor.ratio.value = 5;
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(compressor).connect(context.destination);
    this.noise = this.makeNoiseBuffer(context);
    this.nextStepAt = context.currentTime;
  }

  private scheduleMusicStep(at: number, step: number): void {
    if (!this.active || !this.musicBus) return;
    // A clockwork C-minor chamber waltz: dry plucked melody, restrained bass and glass accents.
    const upper = [523.25, 587.33, 622.25, 659.25, 783.99, 830.61, 932.33, 1046.5];
    const melody = [0, 3, 5, 2, 4, 7, 6, 3, 1, 4, 5, 2, 0, 6, 4, 3, 2, 5];
    const phraseStep = Math.floor(step / 2);
    if (step % 2 === 0) {
      const frequency = upper[melody[phraseStep % melody.length]];
      this.musicTone(frequency, at, 0.13, step % 6 === 0 ? 0.044 : 0.028, "square");
      this.musicTone(frequency * 2, at, 0.2, 0.008, "sine");
    }
    if (step % 3 === 0) {
      const bass = [65.41, 77.78, 58.27, 73.42][Math.floor(step / 3) % 4];
      this.musicTone(bass, at, 0.55, 0.065, "triangle");
    }
    if (step % 3 !== 0) this.musicTone(step % 6 === 1 ? 261.63 : 311.13, at, 0.16, 0.015, "triangle");
    if (step % 6 === 5) this.noiseBurst(at, 0.025, 0.006, 4600, 0, this.musicBus);
    if (this.danger > 0.5 && step % 3 === 2) this.musicTone(1174.66 + this.danger * 220, at, 0.07, 0.012, "sine");
  }

  private musicTone(frequency: number, at: number, duration: number, volume: number, type: OscillatorType = "sine"): void {
    const context = this.context;
    if (!context || !this.musicBus) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    filter.type = "lowpass";
    filter.frequency.value = type === "square" ? 1450 + this.danger * 900 : 1050 + this.danger * 1400;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(filter).connect(gain).connect(this.musicBus);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  private tone(
    frequency: number,
    type: OscillatorType,
    volume: number,
    duration: number,
    delay = 0,
    pan = 0,
    endFrequency?: number,
  ): void {
    const context = this.context;
    if (!context || !this.sfxBus) return;
    const at = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain).connect(panner).connect(this.sfxBus);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  private chime(frequencies: number[], volume: number, duration: number): void {
    frequencies.forEach((frequency, index) => this.tone(frequency, "sine", volume, duration / 2, index * duration / frequencies.length));
  }

  private noiseBurst(at: number, duration: number, volume: number, cutoff: number, pan = 0, destination = this.sfxBus): void {
    const context = this.context;
    if (!context || !destination || !this.noise) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    source.buffer = this.noise;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain).connect(panner).connect(destination);
    source.start(at);
    source.stop(at + duration);
  }

  private makeNoiseBuffer(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    return buffer;
  }

  private now(): number {
    return this.context?.currentTime ?? 0;
  }
}
