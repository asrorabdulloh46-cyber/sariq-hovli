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

export function sShot(id, gain = 1, pan = 0) {
  if (!actx) return;
  const v = gain;
  if (id === 'pistol') {
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
  const s = id === 'sniper' ? 1.4 : id === 'pistol' ? 0.7 : 1;
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
