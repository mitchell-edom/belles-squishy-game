class AudioSynthesizer {
  constructor() {
    this.ctx = null;
    this.noiseBuffer = null;
    this.enabled = true;
    this.userInteracted = false;
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.userInteracted = true;

      // Pre-generate a reusable 1-second white-noise buffer once to avoid per-sound allocations
      const bufferSize = this.ctx.sampleRate;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    } catch (e) {
      console.warn('Web Audio API is not supported in this browser:', e);
    }
  }

  toggle(enabled) {
    this.enabled = enabled;
  }

  getContext() {
    if (!this.enabled || !this.userInteracted) return null;
    this.init();
    const ctx = this.ctx;
    if (!ctx) return null;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  playBoing() {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.3);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  playSplat() {
    const ctx = this.getContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const duration = 0.35;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(50, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + duration);
  }

  playGrab() {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.setValueAtTime(750, now + 0.04);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  playCheer() {
    const ctx = this.getContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const duration = 0.6;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.0;
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.linearRampToValueAtTime(1100, now + 0.15);
    filter.frequency.exponentialRampToValueAtTime(600, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const beep = ctx.createOscillator();
    beep.type = 'sine';
    beep.frequency.setValueAtTime(523.25, now); // C5
    beep.frequency.exponentialRampToValueAtTime(1046.50, now + 0.25); // C6
    const beepGain = ctx.createGain();
    beepGain.gain.setValueAtTime(0.04, now);
    beepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    beep.connect(beepGain);
    beepGain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + duration);
    beep.start(now);
    beep.stop(now + 0.25);
  }
}

export const gameAudio = new AudioSynthesizer();
