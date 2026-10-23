// Barcha tovushlar kod orqali yaratiladi (tashqi fayl kerak emas)
let actx = null, master = null, noiseBuf = null;

export function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = 0.8; master.connect(actx.destination);
    const len = actx.sampleRate;
    noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch { actx = null; }
}

function out(pan) {
  if (!actx.createStereoPanner) return master;
  const p = actx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); p.connect(master); return p;
}

function noise({ dur = 0.1, vol = 0.3, hp = 0, lp = 8000, pan = 0, delay = 0, decay = 1 }) {
  if (!actx) return;
  const t0 = actx.currentTime + delay;
  const src = actx.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur * decay);
  let node = src;
  if (hp > 0) { const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
  const l = actx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp; node.connect(l);
  l.connect(g); g.connect(out(pan));
  src.start(t0, Math.random() * 0.5, dur * 1.2 + 0.05);
}

function tone({ f0 = 440, f1 = f0, dur = 0.1, type = 'sine', vol = 0.2, pan = 0, delay = 0 }) {
  if (!actx) return;
  const t0 = actx.currentTime + delay;
  const o = actx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g); g.connect(out(pan));
  o.start(t0); o.stop(t0 + dur + 0.02);
}

export function setVolume(v) { if (master) master.gain.value = 0.8 * v; vol = v; }
let vol = 1;
export function duck(sec) {   // flash bomba: tovushlar susayadi
  if (!actx || !master) return;
  const t = actx.currentTime;
  master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t);
  master.gain.linearRampToValueAtTime(0.12 * vol, t + 0.05); master.gain.linearRampToValueAtTime(0.8 * vol, t + 0.2 + sec);
}

export function sShot(id, gain = 1, pan = 0) {
  if (!actx) return;
  const v = gain;
  if (id === 'smg') {
    noise({ dur: 0.07, vol: 0.45 * v, hp: 500, lp: 6500, pan });
    tone({ f0: 210, f1: 80, dur: 0.07, vol: 0.38 * v, pan, type: 'triangle' });
  } else if (id === 'shotgun') {
    noise({ dur: 0.35, vol: 0.9 * v, lp: 3000, pan });
    noise({ dur: 0.05, vol: 0.6 * v, hp: 1500, lp: 9000, pan });
    tone({ f0: 120, f1: 35, dur: 0.3, vol: 0.8 * v, pan, type: 'sine' });
    noise({ dur: 0.05, vol: 0.18, hp: 900, delay: 0.45 });
    tone({ f0: 500, f1: 260, dur: 0.05, type: 'square', vol: 0.1, delay: 0.62 });
  } else if (id === 'pistol') {
    noise({ dur: 0.12, vol: 0.55 * v, hp: 700, lp: 7000, pan });
    tone({ f0: 240, f1: 70, dur: 0.12, vol: 0.45 * v, pan, type: 'triangle' });
  } else if (id === 'rifle') {
    noise({ dur: 0.1, vol: 0.5 * v, hp: 250, lp: 4200, pan });
    tone({ f0: 160, f1: 55, dur: 0.1, vol: 0.5 * v, pan, type: 'triangle' });
  } else {
    noise({ dur: 0.6, vol: 0.9 * v, lp: 2000, pan, decay: 1 });
    noise({ dur: 0.07, vol: 0.7 * v, hp: 2500, lp: 9000, pan });
    tone({ f0: 100, f1: 30, dur: 0.5, vol: 0.9 * v, pan, type: 'sine' });
  }
}
export function sReload(id) {
  if (!actx) return;
  const s = id === 'sniper' ? 1.4 : id === 'pistol' ? 0.7 : id === 'shotgun' ? 1.2 : id === 'smg' ? 0.85 : 1;
  tone({ f0: 900, f1: 500, dur: 0.04, type: 'square', vol: 0.12 });
  noise({ dur: 0.08, vol: 0.12, hp: 1500, delay: 0.25 * s });
  tone({ f0: 600, f1: 300, dur: 0.05, type: 'square', vol: 0.14, delay: 0.55 * s });
  tone({ f0: 1100, f1: 700, dur: 0.04, type: 'square', vol: 0.14, delay: 0.9 * s });
}
export function sEmpty() { tone({ f0: 1400, f1: 900, dur: 0.03, type: 'square', vol: 0.1 }); }
export function sHit(head) {
  tone({ f0: head ? 1700 : 1200, f1: head ? 1300 : 800, dur: 0.06, vol: 0.25, type: 'sine' });
  if (head) tone({ f0: 2300, f1: 1800, dur: 0.07, vol: 0.2, delay: 0.05 });
}
export function sKill() {
  tone({ f0: 500, f1: 900, dur: 0.12, vol: 0.25, type: 'triangle' });
  tone({ f0: 900, f1: 1500, dur: 0.16, vol: 0.25, type: 'triangle', delay: 0.1 });
}
export function sHurt() {
  tone({ f0: 160, f1: 60, dur: 0.18, vol: 0.4, type: 'sawtooth' });
  noise({ dur: 0.1, vol: 0.25, lp: 1200 });
}
export function sDie() { tone({ f0: 300, f1: 40, dur: 0.6, vol: 0.4, type: 'sawtooth' }); }
export function sHeal() {
  tone({ f0: 600, f1: 600, dur: 0.1, vol: 0.2, type: 'triangle' });
  tone({ f0: 800, f1: 800, dur: 0.1, vol: 0.2, type: 'triangle', delay: 0.09 });
  tone({ f0: 1000, f1: 1000, dur: 0.16, vol: 0.2, type: 'triangle', delay: 0.18 });
}
export function sStep(vol = 0.08, pan = 0) { noise({ dur: 0.05, vol, lp: 700, hp: 80, pan }); }
export function sSwitch() { noise({ dur: 0.05, vol: 0.12, hp: 1000 }); tone({ f0: 500, f1: 350, dur: 0.05, type: 'square', vol: 0.08 }); }
export function sStart() {
  tone({ f0: 440, dur: 0.15, type: 'triangle', vol: 0.25 });
  tone({ f0: 660, dur: 0.25, type: 'triangle', vol: 0.25, delay: 0.15 });
}

// ---- v3: granata, hayvonlar, pul ----
export function sExplode(gain = 1, pan = 0) {
  if (!actx) return;
  noise({ dur: 1.1, vol: 1.0 * gain, lp: 1400, pan });
  noise({ dur: 0.18, vol: 0.8 * gain, hp: 600, lp: 8000, pan });
  tone({ f0: 90, f1: 24, dur: 0.9, vol: 1.0 * gain, pan, type: 'sine' });
  tone({ f0: 55, f1: 20, dur: 1.2, vol: 0.7 * gain, pan, type: 'triangle', delay: 0.04 });
}
export function sFlashBang(gain = 1, pan = 0) {
  if (!actx) return;
  noise({ dur: 0.25, vol: 0.9 * gain, hp: 1200, lp: 12000, pan });
  tone({ f0: 3000, f1: 2600, dur: 0.2, vol: 0.4 * gain, pan, type: 'square' });
}
export function sRing(sec) {
  if (!actx) return;
  tone({ f0: 4200, f1: 3900, dur: Math.min(5, 0.8 + sec), vol: 0.07, type: 'sine' });
}
export function sSmoke(gain = 1, pan = 0) {
  if (!actx) return;
  noise({ dur: 1.0, vol: 0.35 * gain, hp: 800, lp: 5000, pan, decay: 1 });
  tone({ f0: 300, f1: 120, dur: 0.15, vol: 0.2 * gain, pan, type: 'triangle' });
}
export function sThrow() { noise({ dur: 0.12, vol: 0.14, hp: 500, lp: 3000 }); }
export function sBull(gain = 1, pan = 0) {
  if (!actx) return;
  tone({ f0: 110, f1: 70, dur: 0.55, vol: 0.5 * gain, pan, type: 'sawtooth' });
  tone({ f0: 117, f1: 76, dur: 0.55, vol: 0.4 * gain, pan, type: 'square' });
  noise({ dur: 0.4, vol: 0.18 * gain, lp: 700, pan });
}
export function sPig(gain = 1, pan = 0) {
  if (!actx) return;
  tone({ f0: 900, f1: 1500, dur: 0.1, vol: 0.28 * gain, pan, type: 'sawtooth' });
  tone({ f0: 1500, f1: 700, dur: 0.18, vol: 0.28 * gain, pan, type: 'sawtooth', delay: 0.09 });
  tone({ f0: 800, f1: 1300, dur: 0.08, vol: 0.22 * gain, pan, type: 'sawtooth', delay: 0.26 });
}
export function sGore() {
  tone({ f0: 90, f1: 35, dur: 0.25, vol: 0.7, type: 'sine' });
  noise({ dur: 0.12, vol: 0.4, lp: 900 });
}
export function sCash() {
  tone({ f0: 1568, f1: 1568, dur: 0.07, vol: 0.18, type: 'triangle' });
  tone({ f0: 2093, f1: 2093, dur: 0.18, vol: 0.2, type: 'triangle', delay: 0.07 });
}
export function sBuy() {
  noise({ dur: 0.05, vol: 0.12, hp: 2000 });
  tone({ f0: 700, f1: 700, dur: 0.06, vol: 0.18, type: 'square' });
  tone({ f0: 1050, f1: 1050, dur: 0.12, vol: 0.18, type: 'square', delay: 0.07 });
}
export function sDeny() { tone({ f0: 200, f1: 150, dur: 0.14, vol: 0.2, type: 'square' }); }
export function sStreak(n = 2) {
  for (let i = 0; i < Math.min(5, n); i++) tone({ f0: 600 + i * 150, f1: 700 + i * 150, dur: 0.1, vol: 0.22, type: 'triangle', delay: i * 0.07 });
}
export function sMedal() {
  tone({ f0: 784, dur: 0.12, type: 'triangle', vol: 0.22 });
  tone({ f0: 988, dur: 0.12, type: 'triangle', vol: 0.22, delay: 0.12 });
  tone({ f0: 1319, dur: 0.3, type: 'triangle', vol: 0.24, delay: 0.24 });
}
