// Termiz — Audio engine (Poyga/audio.js dan moslashtirilgan)
let ctx = null;
let masterGain = null;
let _muted = false, _vol = 0.9;

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = _muted ? 0 : _vol;
    masterGain.connect(ctx.destination);
  }
  return ctx;
}

export function resume() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setVolume(v) {
  _vol = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = _muted ? 0 : _vol;
}

export function setMuted(m) {
  _muted = m;
  if (masterGain) masterGain.gain.value = _muted ? 0 : _vol;
}

function osc(freq, type, dur, vol = 0.3, env = { a: 0.01, r: dur * 0.7 }) {
  try {
    const c = getCtx(); const now = c.currentTime;
    const g = c.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(vol, now + env.a);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur); g.connect(masterGain);
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    o.connect(g); o.start(now); o.stop(now + dur + 0.05);
  } catch { /* ignore */ }
}

function noise(dur, vol = 0.15, freq = 400, q = 1) {
  try {
    const c = getCtx(); const now = c.currentTime;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const flt = c.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = freq; flt.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(flt); flt.connect(g); g.connect(masterGain); src.start(now); src.stop(now + dur + 0.05);
  } catch { /* ignore */ }
}

// ── Ovoz effektlari ──────────────────────────────────────────────────────────
export function playShot() {
  noise(0.08, 0.5, 300, 0.8);
  osc(80, 'sawtooth', 0.12, 0.2);
}

export function playHit() {
  noise(0.06, 0.4, 500, 1.2);
  osc(60, 'sawtooth', 0.08, 0.15);
}

export function playExplosion() {
  noise(0.5, 0.8, 100, 0.4);
  osc(55, 'sawtooth', 0.5, 0.3);
}

export function playCrash(speed) {
  const v = Math.min(1, speed / 20) * 0.5;
  noise(0.25, v, 200, 0.6);
  osc(100, 'sawtooth', 0.2, v * 0.3);
}

export function playDoor() {
  osc(600, 'square', 0.07, 0.08);
  osc(400, 'square', 0.07, 0.06);
}

export function playPoliceAlert() {
  osc(880, 'square', 0.15, 0.2);
  osc(1100, 'square', 0.15, 0.2);
}

export function playFootstep() {
  noise(0.05, 0.08, 180, 2);
}

export function playJump() {
  osc(220, 'sine', 0.15, 0.1);
  osc(440, 'sine', 0.08, 0.05);
}

export function playLand() {
  noise(0.1, 0.2, 100, 0.5);
}

export function playPickup() {
  osc(880, 'sine', 0.1, 0.15);
  osc(1100, 'sine', 0.08, 0.1);
}

// ── Mashina motori ────────────────────────────────────────────────────────────
export class EngineSound {
  constructor() {
    this.osc = null; this.gain = null; this.ready = false;
  }
  init() {
    try {
      const c = getCtx();
      this.gain = c.createGain(); this.gain.gain.value = 0; this.gain.connect(masterGain);
      this.osc = c.createOscillator(); this.osc.type = 'sawtooth'; this.osc.frequency.value = 80;
      this.osc.connect(this.gain); this.osc.start();
      this.ready = true;
    } catch { /* ignore */ }
  }
  update(rpm, vol) {
    if (!this.ready) this.init();
    if (!this.osc) return;
    try {
      const now = getCtx().currentTime;
      const freq = 60 + rpm * 0.5;
      this.osc.frequency.setTargetAtTime(freq, now, 0.05);
      this.gain.gain.setTargetAtTime(vol * 0.12, now, 0.05);
    } catch { /* ignore */ }
  }
  stop() {
    if (!this.osc) return;
    try { this.gain.gain.setTargetAtTime(0, getCtx().currentTime, 0.1); } catch { /* ignore */ }
  }
  dispose() {
    try { if (this.osc) this.osc.stop(); } catch { /* ignore */ }
    this.osc = null; this.gain = null; this.ready = false;
  }
}

// ── Muhit shovqini ────────────────────────────────────────────────────────────
let ambientNode = null;
export function startAmbient() {
  if (ambientNode) return;
  try {
    const c = getCtx(); const now = c.currentTime;
    // Shahar shovqini (past freq noise)
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 200;
    const g = c.createGain(); g.gain.value = 0.03;
    src.connect(flt); flt.connect(g); g.connect(masterGain);
    src.start(now);
    ambientNode = { src, stop: () => src.stop() };
  } catch { /* ignore */ }
}

export function stopAmbient() {
  if (!ambientNode) return;
  try { ambientNode.stop(); } catch { /* ignore */ }
  ambientNode = null;
}
