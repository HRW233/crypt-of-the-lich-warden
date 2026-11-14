'use strict';

/* ------------------------------------------------------------------ *
 * sound.js - tiny Web Audio synth for all retro SFX                  *
 * ------------------------------------------------------------------ */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuf = null;
    this._last = Object.create(null);
    this.volume = 0.34;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    } catch (err) {
      this.ctx = null;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /* Rate-limits a sound so 300 bullets cannot blow out the mix. */
  _gate(name, gap) {
    const t = this.ctx ? this.ctx.currentTime : 0;
    const last = this._last[name] || 0;
    if (t - last < gap) return false;
    this._last[name] = t;
    return true;
  }

  tone(freq, freq2, dur, type = 'square', gain = 0.2, delay = 0, detune = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (detune) o.detune.setValueAtTime(detune, t0);
    if (freq2 && freq2 !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  noise(dur, gain, from, to, type = 'lowpass', delay = 0) {
    if (!this.ctx || this.muted || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
    f.Q.value = 1.1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  /* ------------------------------ SFX ------------------------------ */

  shoot() {
    if (!this._gate('shoot', 0.035)) return;
    this.tone(1040, 420, 0.075, 'square', 0.055);
    this.tone(1400, 700, 0.05, 'triangle', 0.026);
  }

  graze() {
    if (!this._gate('graze', 0.045)) return;
    this.tone(1750, 2500, 0.045, 'sine', 0.045);
  }

  hit() {
    if (!this._gate('hit', 0.03)) return;
    this.tone(260, 130, 0.05, 'square', 0.05);
  }

  enemyDeath() {
    if (!this._gate('death', 0.04)) return;
    this.noise(0.24, 0.16, 1600, 160);
    this.tone(200, 55, 0.22, 'sawtooth', 0.09);
  }

  explode() {
    if (!this._gate('explode', 0.06)) return;
    this.noise(0.5, 0.24, 2400, 90);
    this.tone(110, 32, 0.45, 'sine', 0.2);
    this.tone(220, 60, 0.2, 'square', 0.07);
  }

  dash() {
    if (!this._gate('dash', 0.08)) return;
    this.noise(0.2, 0.13, 500, 2200, 'bandpass');
    this.tone(420, 150, 0.18, 'sine', 0.07);
  }

  hurt() {
    this.noise(0.28, 0.18, 900, 120);
    this.tone(180, 60, 0.3, 'sawtooth', 0.16);
  }

  lock() {
    this.tone(180, 460, 0.16, 'square', 0.1);
    this.tone(90, 60, 0.22, 'sawtooth', 0.08);
  }

  unlock() {
    this.tone(460, 180, 0.16, 'square', 0.08);
  }

  clear() {
    const notes = [523, 659, 784];
    notes.forEach((n, i) => this.tone(n, n, 0.13, 'square', 0.075, i * 0.08));
  }

  upgrade() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this.tone(n, n, 0.16, 'triangle', 0.09, i * 0.07));
  }

  chest() {
    this.noise(0.18, 0.1, 1400, 500, 'bandpass');
    [440, 587, 880].forEach((n, i) => this.tone(n, n, 0.18, 'square', 0.07, 0.05 + i * 0.09));
  }

  descend() {
    this.tone(220, 880, 0.5, 'triangle', 0.1);
    this.tone(110, 440, 0.6, 'sine', 0.08, 0.05);
    this.noise(0.5, 0.08, 1400, 300, 'bandpass');
  }

  bossRoar() {
    this.tone(70, 38, 0.9, 'sawtooth', 0.16);
    this.tone(140, 60, 0.8, 'square', 0.06);
    this.noise(0.9, 0.12, 700, 90);
  }

  bossShift() {
    this.tone(300, 120, 0.5, 'sawtooth', 0.11);
    this.noise(0.5, 0.12, 2200, 300, 'bandpass');
  }

  select() {
    this.tone(880, 1320, 0.06, 'square', 0.05);
  }

  start() {
    [392, 523, 659, 880].forEach((n, i) => this.tone(n, n, 0.16, 'triangle', 0.09, i * 0.06));
  }

  gameOver() {
    [392, 330, 262, 196].forEach((n, i) => this.tone(n, n * 0.9, 0.34, 'sawtooth', 0.1, i * 0.17));
    this.noise(0.7, 0.1, 700, 80);
  }

  victory() {
    [523, 659, 784, 1046, 1318].forEach((n, i) => this.tone(n, n, 0.36, 'square', 0.09, i * 0.13));
  }
}
