// Procedurally synthesized sound effects (Web Audio API). No external audio files.
// The AudioContext is created on the first user gesture to satisfy browser autoplay rules.

const GUN_PROFILES = {
  //        noise len, lowpass, highpass, body freq, body len, gain, tail
  pistol: { len: 0.14, lp: 5200, hp: 500, body: 160, bodyLen: 0.07, gain: 0.85, tail: 0.18, crack: 0.5 },
  rifle: { len: 0.17, lp: 4200, hp: 250, body: 110, bodyLen: 0.09, gain: 1.0, tail: 0.3, crack: 0.65 },
  shotgun: { len: 0.32, lp: 2600, hp: 90, body: 70, bodyLen: 0.16, gain: 1.25, tail: 0.5, crack: 0.5 },
  sniper: { len: 0.4, lp: 6000, hp: 120, body: 60, bodyLen: 0.2, gain: 1.35, tail: 0.9, crack: 1.0 },
  smg: { len: 0.11, lp: 4800, hp: 400, body: 150, bodyLen: 0.06, gain: 0.8, tail: 0.2, crack: 0.45 },
  pdw: { len: 0.1, lp: 6200, hp: 600, body: 170, bodyLen: 0.05, gain: 0.75, tail: 0.18, crack: 0.6 },
  dmr: { len: 0.24, lp: 4800, hp: 160, body: 85, bodyLen: 0.13, gain: 1.15, tail: 0.55, crack: 0.85 },
  lmg: { len: 0.19, lp: 3800, hp: 200, body: 95, bodyLen: 0.1, gain: 1.05, tail: 0.35, crack: 0.6 },
  magnum: { len: 0.22, lp: 4000, hp: 150, body: 90, bodyLen: 0.12, gain: 1.2, tail: 0.45, crack: 0.8 },
  antimateriel: { len: 0.55, lp: 3200, hp: 50, body: 42, bodyLen: 0.3, gain: 1.5, tail: 1.2, crack: 1.0 },
};

export class AudioManager {
  constructor(volume = 0.7) {
    this.ctx = null;
    this.volume = volume;
    this.ready = false;
  }

  // Must be called from a user-gesture handler (e.g. the Play button click).
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // Shared white-noise buffer.
    const len = ctx.sampleRate * 1.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Simple reverb impulse for gunshot tails (outdoor slap-back feel).
    const rl = ctx.sampleRate * 1.2;
    this.impulse = ctx.createBuffer(2, rl, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = this.impulse.getChannelData(c);
      for (let i = 0; i < rl; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 3.2);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse;
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.22;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);
    this.ready = true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // Update listener from camera position/orientation each frame.
  updateListener(pos, forward, up) {
    if (!this.ready) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(pos.x, t);
      l.positionY.setValueAtTime(pos.y, t);
      l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(forward.x, t);
      l.forwardY.setValueAtTime(forward.y, t);
      l.forwardZ.setValueAtTime(forward.z, t);
      l.upX.setValueAtTime(up.x, t);
      l.upY.setValueAtTime(up.y, t);
      l.upZ.setValueAtTime(up.z, t);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  // Output node: direct to master, or through a 3D panner when a world position is given.
  _out(position, gain = 1, reverb = 0) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    if (position) {
      const p = ctx.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = 4;
      p.rolloffFactor = 1.1;
      p.maxDistance = 200;
      if (p.positionX) {
        p.positionX.value = position.x;
        p.positionY.value = position.y;
        p.positionZ.value = position.z;
      } else {
        p.setPosition(position.x, position.y, position.z);
      }
      g.connect(p);
      p.connect(this.master);
      if (reverb > 0) {
        const rg = ctx.createGain();
        rg.gain.value = reverb;
        p.connect(rg);
        rg.connect(this.reverb);
      }
    } else {
      g.connect(this.master);
      if (reverb > 0) {
        const rg = ctx.createGain();
        rg.gain.value = reverb;
        g.connect(rg);
        rg.connect(this.reverb);
      }
    }
    return g;
  }

  _noise(dest, t, dur, { lp = 8000, hp = 20, bp = null, q = 1, gain = 1, attack = 0.002, rate = 1 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    let node = src;
    if (bp) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = bp; f.Q.value = q;
      node.connect(f); node = f;
    } else {
      const l = ctx.createBiquadFilter();
      l.type = 'lowpass'; l.frequency.value = lp;
      const h = ctx.createBiquadFilter();
      h.type = 'highpass'; h.frequency.value = hp;
      node.connect(l); l.connect(h); node = h;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    node.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    return { src, gain: g };
  }

  _tone(dest, t, dur, { freq = 440, endFreq = null, type = 'sine', gain = 0.5, attack = 0.003 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- weapons
  gunshot(type, position = null, volume = 1, suppressed = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    if (type === 'knife') return this.knifeSwing(position);
    if (type === 'energy') return this.energyShot(position, volume);
    if (type === 'launcher') return this.rocketLaunch(position);
    const p = GUN_PROFILES[type] || GUN_PROFILES.rifle;
    if (suppressed) {
      // Suppressed: muffled thump + mechanical clack, almost no crack or tail.
      const out = this._out(position, p.gain * volume * 0.45, 0.15);
      this._noise(out, t, 0.07, { lp: 1400, hp: 120, gain: 0.9 });
      this._tone(out, t, 0.05, { freq: p.body * 1.6, endFreq: p.body * 0.6, gain: 0.5 });
      this._noise(out, t + 0.012, 0.025, { bp: 3200, q: 4, gain: 0.5 });
      return;
    }
    const out = this._out(position, p.gain * volume, 0.6);
    const jitter = 0.94 + Math.random() * 0.12;
    // Sharp crack
    this._noise(out, t, 0.04, { hp: 2500, lp: 12000, gain: p.crack, attack: 0.0005 });
    // Main blast
    this._noise(out, t, p.len, { lp: p.lp * jitter, hp: p.hp, gain: 0.9, attack: 0.001 });
    // Low body thump
    this._tone(out, t, p.bodyLen, { freq: p.body * 2 * jitter, endFreq: p.body * 0.5, type: 'sine', gain: 0.9 });
    // Distant-sounding tail
    this._noise(out, t + 0.01, p.tail, { lp: 900, hp: 60, gain: 0.25, attack: 0.02 });
  }

  // Fictional energy weapon: synthetic zap with a falling pitch sweep.
  energyShot(position = null, volume = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(position, 0.5 * volume, 0.3);
    this._tone(out, t, 0.14, { freq: 1900, endFreq: 260, type: 'sawtooth', gain: 0.35 });
    this._tone(out, t, 0.1, { freq: 950, endFreq: 140, type: 'square', gain: 0.2 });
    this._noise(out, t, 0.06, { bp: 5000, q: 2, gain: 0.5 });
  }

  rocketLaunch(position = null) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(position, 1.0, 0.6);
    this._noise(out, t, 0.12, { lp: 3000, hp: 80, gain: 1 });
    const n = this._noise(out, t + 0.05, 1.2, { lp: 1600, hp: 200, gain: 0.6, attack: 0.05 });
    n.src.playbackRate.setValueAtTime(0.7, t);
    n.src.playbackRate.linearRampToValueAtTime(1.3, t + 1);
    this._tone(out, t, 0.25, { freq: 70, endFreq: 35, gain: 0.8 });
  }

  explosion(position = null) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(position, 1.4, 0.9);
    this._noise(out, t, 0.08, { hp: 1200, lp: 9000, gain: 1 });
    this._noise(out, t, 1.6, { lp: 700, hp: 25, gain: 1, attack: 0.005 });
    this._tone(out, t, 0.9, { freq: 60, endFreq: 22, gain: 1 });
    for (let i = 0; i < 6; i++) this._noise(out, t + 0.15 + Math.random() * 0.6, 0.05, { bp: 2000 + Math.random() * 2000, q: 3, gain: 0.25 }); // debris
  }

  throwWhoosh(position = null) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.35);
    const n = this._noise(out, t, 0.25, { bp: 900, q: 1.2, gain: 0.8, attack: 0.06 });
    n.src.playbackRate.setValueAtTime(0.7, t);
    n.src.playbackRate.linearRampToValueAtTime(1.5, t + 0.2);
  }

  pinPull() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.4);
    this._noise(out, t, 0.04, { bp: 4200, q: 6, gain: 1 });
    this._tone(out, t + 0.05, 0.12, { freq: 2600, endFreq: 2200, type: 'triangle', gain: 0.12 });
  }

  grenadeBounce(position, strength = 0.5) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(position, 0.3 + strength * 0.4);
    this._noise(out, t, 0.05, { bp: 2400 + Math.random() * 800, q: 5, gain: 1 });
    this._tone(out, t, 0.08, { freq: 1500 + Math.random() * 500, type: 'triangle', gain: 0.15 });
  }

  smokeHiss(position) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(position, 0.5);
    this._noise(out, t, 0.08, { bp: 1200, q: 2, gain: 0.8 });
    this._noise(out, t + 0.05, 3.5, { hp: 2500, lp: 9000, gain: 0.5, attack: 0.2 });
  }

  flashBang(position) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(position, 1.3, 0.8);
    this._noise(out, t, 0.25, { hp: 600, lp: 12000, gain: 1, attack: 0.001 });
    this._tone(out, t, 0.3, { freq: 90, endFreq: 40, gain: 0.8 });
  }

  // Tinnitus for the player after a nearby flashbang.
  ringing(seconds = 3, level = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.12 * level);
    this._tone(out, t, seconds, { freq: 3600, type: 'sine', gain: 1, attack: 0.05 });
  }

  stunPulse(position) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(position, 1.0, 0.6);
    this._tone(out, t, 0.6, { freq: 110, endFreq: 30, type: 'sawtooth', gain: 0.6 });
    this._noise(out, t, 0.4, { lp: 900, hp: 30, gain: 1 });
  }

  fireIgnite(position) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(position, 0.8, 0.3);
    this._noise(out, t, 0.6, { lp: 2500, hp: 100, gain: 1, attack: 0.03 });
    for (let i = 0; i < 20; i++) this._noise(out, t + 0.3 + Math.random() * 7, 0.04, { bp: 1500 + Math.random() * 2500, q: 2, gain: 0.35 }); // crackle
  }

  empZap(position, big = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(position, big ? 1.1 : 0.8, 0.5);
    this._tone(out, t, big ? 1.2 : 0.7, { freq: 2200, endFreq: 60, type: 'sawtooth', gain: 0.45 });
    this._tone(out, t, 0.4, { freq: 55, type: 'square', gain: 0.3 });
    for (let i = 0; i < 10; i++) this._noise(out, t + Math.random() * 0.6, 0.03, { bp: 5000, q: 4, gain: 0.6 });
  }

  sensorPing(position) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(position, 0.35);
    this._tone(out, t, 0.18, { freq: 1500, type: 'sine', gain: 0.5 });
    this._tone(out, t + 0.12, 0.18, { freq: 2000, type: 'sine', gain: 0.35 });
  }

  cameraAlarm(position) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(position, 0.5);
    for (let i = 0; i < 3; i++) this._tone(out, t + i * 0.22, 0.15, { freq: 1250, type: 'square', gain: 0.25 });
  }

  gearToggle(on) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.25);
    this._tone(out, t, on ? 0.35 : 0.15, { freq: on ? 6000 : 3000, endFreq: on ? 9000 : 1500, type: 'sine', gain: 0.15 });
    this._noise(out, t, 0.03, { bp: 2500, q: 5, gain: 0.6 });
  }

  medkit() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.35);
    this._noise(out, t, 0.3, { bp: 1800, q: 1, gain: 0.5, attack: 0.05 });
    this._tone(out, t + 0.3, 0.3, { freq: 880, endFreq: 1320, type: 'sine', gain: 0.25 });
  }

  overheat() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.4);
    this._noise(out, t, 1.4, { hp: 3000, lp: 9000, gain: 0.5, attack: 0.05 });
    this._tone(out, t, 0.4, { freq: 400, endFreq: 180, type: 'square', gain: 0.15 });
  }

  fireModeClick() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.35);
    this._noise(out, t, 0.03, { bp: 2800, q: 6, gain: 1 });
  }

  knifeSwing(position = null) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(position, 0.5);
    const n = this._noise(out, t, 0.18, { bp: 1800, q: 1.5, gain: 0.8, attack: 0.04 });
    n.src.playbackRate.setValueAtTime(0.6, t);
    n.src.playbackRate.linearRampToValueAtTime(1.6, t + 0.15);
  }

  knifeHit(position = null) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(position, 0.7);
    this._noise(out, t, 0.12, { lp: 1200, hp: 80, gain: 0.9 });
    this._tone(out, t, 0.1, { freq: 180, endFreq: 70, gain: 0.6 });
  }

  dryFire() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.5);
    this._noise(out, t, 0.03, { bp: 3200, q: 4, gain: 1 });
  }

  // Reload foley: clicks timed to the reload duration.
  reload(type, duration, position = null) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(position, 0.55);
    const click = (at, freq, g = 1) => {
      this._noise(out, t + at, 0.05, { bp: freq, q: 6, gain: g });
      this._tone(out, t + at, 0.04, { freq: freq * 0.5, type: 'square', gain: 0.08 * g });
    };
    if (type === 'shotgun-shell') {
      click(0.05, 1500, 0.7);
      click(0.18, 900, 0.5);
      return;
    }
    if (type === 'shotgun-pump') {
      this._noise(out, t, 0.09, { bp: 700, q: 3, gain: 0.9 });
      this._noise(out, t + 0.14, 0.09, { bp: 1100, q: 3, gain: 0.9 });
      return;
    }
    click(duration * 0.15, 1800, 0.9); // mag release
    this._noise(out, t + duration * 0.22, 0.12, { bp: 500, q: 2, gain: 0.4 }); // mag slide out
    click(duration * 0.62, 1200, 1); // mag in
    click(duration * 0.85, 2400, 0.9); // bolt / slide
    click(duration * 0.9, 1500, 0.6);
  }

  boltCycle(position = null) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.35;
    const out = this._out(position, 0.5);
    this._noise(out, t, 0.06, { bp: 1400, q: 5, gain: 1 });
    this._noise(out, t + 0.18, 0.06, { bp: 2200, q: 5, gain: 1 });
  }

  weaponSwitch() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.35);
    this._noise(out, t, 0.06, { bp: 2000, q: 3, gain: 0.8 });
    this._noise(out, t + 0.12, 0.05, { bp: 3000, q: 4, gain: 0.6 });
  }

  pickup() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.4);
    this._noise(out, t, 0.08, { bp: 1200, q: 3, gain: 1 });
    this._noise(out, t + 0.1, 0.06, { bp: 2600, q: 5, gain: 0.8 });
  }

  // ---------------------------------------------------------------- impacts & feedback
  impact(position, surface = 'concrete') {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(position, 0.35);
    if (surface === 'metal' || surface === 'roof' || surface === 'barrel') {
      this._noise(out, t, 0.08, { bp: 3500, q: 8, gain: 1 });
      this._tone(out, t, 0.15, { freq: 2200 + Math.random() * 800, type: 'triangle', gain: 0.12 });
    } else if (surface === 'crate') {
      this._noise(out, t, 0.07, { bp: 800, q: 2, gain: 1 });
    } else {
      this._noise(out, t, 0.06, { hp: 1500, lp: 7000, gain: 0.9 });
    }
  }

  fleshHit(position) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(position, 0.6);
    this._noise(out, t, 0.08, { lp: 900, hp: 100, gain: 1 });
  }

  hitMarker(headshot) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.25);
    if (headshot) {
      this._tone(out, t, 0.25, { freq: 1900, type: 'sine', gain: 0.6 });
      this._tone(out, t, 0.2, { freq: 2850, type: 'sine', gain: 0.2 });
    } else {
      this._noise(out, t, 0.03, { bp: 4000, q: 3, gain: 0.9 });
    }
  }

  playerHurt() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.5);
    this._noise(out, t, 0.12, { lp: 700, hp: 60, gain: 1 });
    this._tone(out, t, 0.18, { freq: 140, endFreq: 70, gain: 0.5 });
  }

  // Short vocal-like bark from a bot (alerted / hurt / death).
  voice(kind, position) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = this._out(position, kind === 'death' ? 0.5 : 0.35);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const base = 110 + Math.random() * 40;
    const dur = kind === 'death' ? 0.55 : kind === 'alert' ? 0.22 : 0.16;
    o.frequency.setValueAtTime(base * (kind === 'alert' ? 1.3 : 1.15), t);
    o.frequency.exponentialRampToValueAtTime(base * (kind === 'death' ? 0.55 : 0.85), t + dur);
    // Two formant filters for a crude "voice"
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 6;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 8;
    f1.frequency.setValueAtTime(kind === 'alert' ? 750 : 600, t);
    f1.frequency.linearRampToValueAtTime(450, t + dur);
    f2.frequency.setValueAtTime(1150, t);
    f2.frequency.linearRampToValueAtTime(900, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f1); o.connect(f2);
    f1.connect(g); f2.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- movement
  footstep(position = null, loud = true) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(position, loud ? 0.4 : 0.12);
    this._noise(out, t, 0.08, { lp: 700 + Math.random() * 400, hp: 60, gain: 1, rate: 0.8 + Math.random() * 0.4 });
    this._noise(out, t + 0.01, 0.04, { bp: 2500, q: 2, gain: 0.25 });
  }

  jump() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.2);
    this._noise(out, t, 0.12, { bp: 900, q: 1, gain: 0.7, attack: 0.03 });
  }

  land(intensity = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, Math.min(0.8, 0.3 + intensity * 0.04));
    this._noise(out, t, 0.12, { lp: 500, hp: 40, gain: 1 });
    this._tone(out, t, 0.1, { freq: 90, endFreq: 45, gain: 0.6 });
  }

  // ---------------------------------------------------------------- round flow
  roundStart() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.25);
    [0, 0.18, 0.36].forEach((d, i) => this._tone(out, t + d, 0.14, { freq: 660 + i * 220, type: 'square', gain: 0.25 }));
  }

  roundEnd(won) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.3);
    const notes = won ? [523, 659, 784, 1046] : [440, 392, 330, 262];
    notes.forEach((f, i) => this._tone(out, t + i * 0.16, 0.5, { freq: f, type: 'triangle', gain: 0.4 }));
  }

  // ---------------------------------------------------------------- mission / city
  _loop(filterType, freq, q, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    return { src, f, g };
  }

  // Continuous city ambience: traffic rumble, occasional horns, distant sirens at night.
  startAmbience(night = false) {
    if (!this.ready) return;
    this.stopAmbience();
    this.amb = [this._loop('lowpass', 260, 0.7, 0.09), this._loop('bandpass', 700, 0.6, 0.025)];
    this.ambTimer = setInterval(() => {
      if (!this.ready || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime;
      const pos = { x: (Math.random() - 0.5) * 220, y: 1, z: -78 + (Math.random() - 0.5) * 30 };
      if (Math.random() < 0.5) {
        const out = this._out(pos, 0.25);
        const f = 380 + Math.random() * 120;
        this._tone(out, t, 0.35, { freq: f, type: 'square', gain: 0.15 });
        this._tone(out, t, 0.35, { freq: f * 1.26, type: 'square', gain: 0.1 });
      } else if (night && Math.random() < 0.5) {
        const out = this._out({ x: (Math.random() - 0.5) * 600, y: 5, z: (Math.random() - 0.5) * 600 }, 0.35);
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        for (let i = 0; i < 6; i++) {
          o.frequency.setValueAtTime(700, t + i * 0.9);
          o.frequency.linearRampToValueAtTime(1050, t + i * 0.9 + 0.45);
          o.frequency.linearRampToValueAtTime(700, t + i * 0.9 + 0.9);
        }
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.12, t + 1);
        g.gain.linearRampToValueAtTime(0.0001, t + 5.4);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + 5.5);
      }
    }, 3500);
  }

  // Rain bed: a broadband hiss plus a low patter rumble, faded in and out.
  setRain(on) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    if (on && !this.rain) {
      this.rain = [this._loop('highpass', 1800, 0.5, 0), this._loop('lowpass', 420, 0.8, 0)];
      this.rain[0].g.gain.linearRampToValueAtTime(0.07, t + 1.5);
      this.rain[1].g.gain.linearRampToValueAtTime(0.05, t + 1.5);
    } else if (!on && this.rain) {
      for (const r of this.rain) { r.g.gain.linearRampToValueAtTime(0, t + 0.8); r.src.stop(t + 0.9); }
      this.rain = null;
    }
  }

  stopAmbience() {
    if (this.amb) for (const a of this.amb) { try { a.src.stop(); } catch { /* already stopped */ } }
    this.amb = null;
    clearInterval(this.ambTimer);
  }

  launchRoar() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.9, 0.4);
    const n = this._noise(out, t, 3.4, { lp: 900, hp: 40, gain: 1, attack: 0.4 });
    n.src.playbackRate.setValueAtTime(0.6, t);
    n.src.playbackRate.linearRampToValueAtTime(1.4, t + 3);
    this._tone(out, t, 2.8, { freq: 55, endFreq: 90, type: 'sawtooth', gain: 0.25, attack: 0.3 });
  }

  // Rushing air while in flight; level 0..1 (0 stops it).
  flightWind(level) {
    if (!this.ready) return;
    if (level <= 0) {
      if (this.wind) { this.wind.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2); const w = this.wind; setTimeout(() => { try { w.src.stop(); } catch { /* */ } }, 800); this.wind = null; }
      return;
    }
    if (!this.wind) this.wind = this._loop('bandpass', 500, 0.8, 0);
    const t = this.ctx.currentTime;
    this.wind.g.gain.setTargetAtTime(0.05 + level * 0.25, t, 0.1);
    this.wind.f.frequency.setTargetAtTime(300 + level * 1500, t, 0.2);
  }

  sonicBoom(mach) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, mach >= 10 ? 0.9 : 0.6, 0.5);
    this._tone(out, t, 0.25, { freq: 70, endFreq: 30, gain: 1 });
    this._tone(out, t + 0.12, 0.3, { freq: 60, endFreq: 25, gain: 0.8 });
    this._noise(out, t, 0.3, { lp: 600, hp: 30, gain: 0.8 });
  }

  impactBoom() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 1.2, 0.8);
    this._noise(out, t, 0.1, { hp: 1500, lp: 9000, gain: 1 });
    this._noise(out, t, 2.4, { lp: 500, hp: 20, gain: 1, attack: 0.01 });
    this._tone(out, t, 1.2, { freq: 48, endFreq: 18, gain: 1 });
  }

  clusterSplit() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.5);
    for (let i = 0; i < 6; i++) this._noise(out, t + i * 0.06, 0.08, { bp: 1400 + i * 200, q: 3, gain: 1 });
  }

  lockTone(kind) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.3);
    if (kind === 'acquire') [0, 0.2, 0.4].forEach((d) => this._tone(out, t + d, 0.08, { freq: 1300, type: 'square', gain: 0.25 }));
    else if (kind === 'locked') this._tone(out, t, 0.7, { freq: 1700, type: 'square', gain: 0.25 });
    else this._tone(out, t, 0.5, { freq: 900, endFreq: 300, type: 'square', gain: 0.25 });
  }

  drill(on) {
    if (!this.ready) return;
    if (!on) {
      if (this.drillLoop) { const d = this.drillLoop; d.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); setTimeout(() => { try { d.src.stop(); d.osc.stop(); } catch { /* */ } }, 600); this.drillLoop = null; }
      return;
    }
    if (this.drillLoop) return;
    const d = this._loop('bandpass', 420, 1.2, 0.35);
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 58;
    const og = this.ctx.createGain();
    og.gain.value = 0.06;
    osc.connect(og); og.connect(d.g);
    osc.start();
    d.osc = osc;
    this.drillLoop = d;
  }

  alarm() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.4);
    for (let i = 0; i < 4; i++) {
      this._tone(out, t + i * 0.6, 0.28, { freq: 880, type: 'sawtooth', gain: 0.3 });
      this._tone(out, t + i * 0.6 + 0.3, 0.28, { freq: 660, type: 'sawtooth', gain: 0.3 });
    }
  }

  intelChime() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.3);
    [880, 1320, 1760].forEach((f, i) => this._tone(out, t + i * 0.09, 0.25, { freq: f, type: 'sine', gain: 0.3 }));
  }

  uiClick() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._tone(this._out(null, 0.2), t, 0.05, { freq: 1200, type: 'square', gain: 0.2 });
  }
}
