export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  muted = false;
  private unlocked = false;
  private metro = 0;
  private step = 0;
  private playing = false;
  private night = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.9;
  }

  unlock(): void {
    if (this.unlocked) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.9;
    master.connect(ctx.destination);
    const music = ctx.createGain();
    music.gain.value = 0.045;
    music.connect(master);
    this.ctx = ctx;
    this.master = master;
    this.music = music;
    this.unlocked = true;
    void ctx.resume();
  }

  setRunning(playing: boolean, night: boolean): void {
    this.playing = playing;
    this.night = night;
  }

  update(dt: number): void {
    if (!this.unlocked || !this.playing || this.muted || !this.ctx) return;
    this.metro += dt;
    const beat = this.night ? 0.46 : 0.3;
    const pattern = this.night ? [0, 3, 5, 3, 7, 5, 3, 0] : [0, 3, 7, 10, 7, 3, 12, 7];
    while (this.metro >= beat) {
      this.metro -= beat;
      const degree = pattern[this.step % pattern.length] ?? 0;
      this.step += 1;
      const base = this.night ? 196 : 262;
      this.tone(base * 2 ** (degree / 12), 0.16, "triangle", 0.08, this.music);
      if (this.step % 2 === 0) this.tone(this.night ? 98 : 131, 0.12, "sine", 0.05, this.music);
    }
  }

  jump(): void {
    this.tone(520, 0.09, "square", 0.05);
    this.tone(740, 0.07, "square", 0.03);
  }

  coin(combo: number): void {
    const f = 680 + Math.min(combo, 8) * 40;
    this.tone(f, 0.06, "square", 0.05);
    this.tone(f * 1.5, 0.08, "square", 0.04);
  }

  power(): void {
    this.tone(440, 0.08, "sawtooth", 0.04);
    this.tone(660, 0.1, "sawtooth", 0.04);
    this.tone(880, 0.14, "triangle", 0.05);
  }

  hit(): void {
    this.tone(140, 0.18, "sawtooth", 0.07);
    this.tone(70, 0.22, "square", 0.06);
  }

  over(): void {
    this.tone(392, 0.12, "triangle", 0.06);
    window.setTimeout(() => this.tone(330, 0.14, "triangle", 0.06), 120);
    window.setTimeout(() => this.tone(262, 0.22, "triangle", 0.07), 240);
  }

  ui(): void {
    this.tone(610, 0.05, "square", 0.03);
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gainValue: number,
    dest?: AudioNode | null,
  ): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(dest ?? this.master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }
}
