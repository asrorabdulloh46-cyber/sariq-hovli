// Poyga tovushlari: hammasi Web Audio bilan sintez qilinadi (tashqi fayl yo'q)
let ctx = null, master = null, noiseBuf = null, vol = 1, muted = false;
let wind = null, squeal = null, rumble = null, engines = [];
const cleanup = [];

export function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return true; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return false; }
  master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // doimiy ishlaydigan qatlamlar
  wind = loopNoise('lowpass', 500, 0.7);
  squeal = loopNoise('bandpass', 1900, 7);
  rumble = loopNoise('lowpass', 160, 0.8);
  return true;
}
export function setVolume(v) { vol = v; if (master) master.gain.value = muted ? 0 : v; }
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : vol; }
export function resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }
export function ok() { return !!ctx; }

function loopNoise(type, f, q) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(flt); flt.connect(g); g.connect(master); src.start();
  return { src, flt, g };
}

// ---- Dvigatel ----
// kind: 0 = o'zimizniki, 1 = boshqalar (past sifat, masofaga qarab)
export class Engine {
  constructor(local) {
    this.local = local; this.on = false;
    if (!ctx) return;
    const out = ctx.createGain(); out.gain.value = 0;
    this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 1.2;
    this.lp = lp;
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    this.o3 = ctx.createOscillator(); this.o3.type = 'sine';
    const g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain();
    g1.gain.value = 0.5; g2.gain.value = local ? 0.2 : 0.12; g3.gain.value = 0.5;
    this.o1.connect(g1); this.o2.connect(g2); this.o3.connect(g3);
    g1.connect(lp); g2.connect(lp); g3.connect(lp);
    lp.connect(out); if (this.pan) { out.connect(this.pan); this.pan.connect(master); } else out.connect(master);
    this.out = out;
    this.o1.start(); this.o2.start(); this.o3.start(); this.on = true;
    this.rpm = 900; this.gear = 0;
  }
  // speed m/s, throttle 0..1, boost (nitro)
  set(speed, throttle, nitro, gain = 1, pan = 0) {
    if (!this.on) return;
    const t = ctx.currentTime;
    // vites: tezlikka qarab 5 ta pog'ona
    const v = Math.abs(speed), ratios = [0, 11, 20, 31, 43, 64];
    let gi = 1; while (gi < 5 && v > ratios[gi]) gi++;
    const lo = ratios[gi - 1], hi = ratios[gi];
    const f = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    const rpm = 1000 + f * 5200 + (gi === 1 ? 0 : 900 * (gi / 5));
    const target = Math.min(7600, rpm + throttle * 350 + (nitro ? 500 : 0));
    this.rpm += (target - this.rpm) * 0.35;
    const hz = this.rpm / 60 * (this.local ? 2 : 2);   // 4-silindrli: 2 silkish / aylanish
    const base = hz * 1.0;
    this.o1.frequency.setTargetAtTime(base, t, 0.04); this.o2.frequency.setTargetAtTime(base * 0.5, t, 0.04); this.o3.frequency.setTargetAtTime(base * 0.25, t, 0.04);
    this.lp.frequency.setTargetAtTime(500 + this.rpm * 0.45 + throttle * 700, t, 0.06);
    this.out.gain.setTargetAtTime((0.07 + 0.09 * throttle + (nitro ? 0.04 : 0)) * gain * (this.local ? 1 : 0.8), t, 0.05);
    if (this.pan) this.pan.pan.setTargetAtTime(pan, t, 0.08);
  }
  mute() { if (this.on) this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.05); }
  stop() { if (!this.on) return; this.on = false; try { this.o1.stop(); this.o2.stop(); this.o3.stop(); } catch { /* ignore */ } try { this.out.disconnect(); } catch { /* ignore */ } }
}

// Muhit: shamol, shina g'ichirlashi, yo'l (chang) shovqini
export function ambient(speed, slip, offroad, nitro) {
  if (!ctx) return;
  const t = ctx.currentTime, v = Math.min(1, speed / 60);
  wind.g.gain.setTargetAtTime(0.01 + v * v * 0.16 + (nitro ? 0.05 : 0), t, 0.1);
  wind.flt.frequency.setTargetAtTime(300 + v * 1400, t, 0.1);
  squeal.g.gain.setTargetAtTime(slip * 0.11, t, 0.04);
  squeal.flt.frequency.setTargetAtTime(1500 + slip * 700 + v * 400, t, 0.06);
  rumble.g.gain.setTargetAtTime(offroad ? 0.18 * Math.min(1, speed / 25) : 0.015 * v, t, 0.06);
}
export function silence() { if (!ctx) return; const t = ctx.currentTime; for (const n of [wind, squeal, rumble]) n.g.gain.setTargetAtTime(0, t, 0.05); engines.forEach((e) => e.mute()); }

// ---- Qisqa effektlar ----
function env(g, t, a, d, peak) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(freq, dur, type = 'sine', peak = 0.2, when = 0, slide = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  env(g, t, 0.01, dur, peak); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function burst(type, f, q, dur, peak, when = 0, sweep = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when, s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t); if (sweep) flt.frequency.exponentialRampToValueAtTime(Math.max(40, f + sweep), t + dur); flt.Q.value = q;
  const g = ctx.createGain(); env(g, t, 0.01, dur, peak);
  s.connect(flt); flt.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
export function beep(go) { if (go) { tone(880, 0.55, 'square', 0.16); tone(1320, 0.55, 'sine', 0.1); } else tone(520, 0.2, 'square', 0.13); }
export function thud(power = 1) { burst('lowpass', 420, 0.8, 0.22, 0.4 * power); tone(90, 0.18, 'sine', 0.35 * power, 0, -50); }
export function scrape() { burst('bandpass', 2400, 2, 0.18, 0.1); }
export function nitro() { burst('highpass', 600, 0.7, 0.9, 0.22, 0, 3500); tone(180, 0.6, 'sawtooth', 0.08, 0, 500); }
export function horn(dist = 0, pan = 0) {
  if (!ctx) return; const k = Math.max(0, 1 - dist / 120); if (k <= 0.02) return;
  const t = ctx.currentTime; const g = ctx.createGain(); env(g, t, 0.02, 0.45, 0.14 * k);
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = o2.type = 'square'; o1.frequency.value = 415; o2.frequency.value = 523;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
  o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master); o1.start(t); o2.start(t); o1.stop(t + 0.55); o2.stop(t + 0.55);
}
export function pickup() { tone(660, 0.12, 'triangle', 0.16); tone(990, 0.18, 'triangle', 0.14, 0.08); }
export function useBoost() { nitro(); }
export function useShield() { tone(500, 0.35, 'sine', 0.14, 0, 500); tone(1000, 0.3, 'triangle', 0.08, 0.05); }
export function shieldBreak() { burst('highpass', 1200, 1, 0.3, 0.2); tone(900, 0.3, 'sine', 0.12, 0, -700); }
export function slipSound() { burst('bandpass', 1800, 3, 0.7, 0.14, 0, -1200); tone(240, 0.5, 'sawtooth', 0.06, 0, -100); }
export function fogSound() { tone(300, 0.5, 'sine', 0.1, 0, -150); tone(200, 0.6, 'sine', 0.08, 0.1, -100); }
export function lap() { tone(784, 0.12, 'triangle', 0.15); tone(1175, 0.22, 'triangle', 0.15, 0.1); }
export function finish() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, i * 0.12)); }
export function wrong() { tone(300, 0.15, 'square', 0.08); tone(300, 0.15, 'square', 0.08, 0.2); }
export function click() { tone(700, 0.05, 'square', 0.05); }
export function reset() { tone(300, 0.25, 'sine', 0.14, 0, 500); }

// boshqa mashinalar dvigateli (eng yaqin bir nechtasi)
export function getEngine(i) { if (!ctx) return null; if (!engines[i]) engines[i] = new Engine(i === 0); return engines[i]; }
export function dropEngines() { engines.forEach((e) => e.stop()); engines = []; }
export function cleanupAll() { dropEngines(); cleanup.forEach((f) => f()); }
