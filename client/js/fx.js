// Effektlar: o'q izi, chang, portlash, tutun, flash va uchib yurgan granatalar
import * as THREE from '../vendor/three.module.min.js';
import { makeGrenade } from './models.js';

function radTex(stops, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function puffTexture() {   // yumshoq dog'li tutun
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = S / 2 + (Math.random() - 0.5) * 44, y = S / 2 + (Math.random() - 0.5) * 44, r = 22 + Math.random() * 22;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createFx(scene) {
  const dustTex = radTex([[0, 'rgba(220,190,120,0.9)'], [1, 'rgba(220,190,120,0)']]);
  const bloodTex = radTex([[0, 'rgba(200,30,30,0.9)'], [1, 'rgba(200,30,30,0)']]);
  const fireTex = radTex([[0, 'rgba(255,255,230,1)'], [0.3, 'rgba(255,200,80,0.9)'], [0.65, 'rgba(255,100,20,0.5)'], [1, 'rgba(255,60,0,0)']]);
  const sparkTex = radTex([[0, 'rgba(255,255,200,1)'], [0.5, 'rgba(255,170,40,0.8)'], [1, 'rgba(255,100,0,0)']], 32);
  const whiteTex = radTex([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]);
  const smokeTex = puffTexture();

  // ---- O'q izlari ----
  const tracers = [];
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const trMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.9, depthWrite: false });
  for (let i = 0; i < 64; i++) { const m = new THREE.Mesh(unitBox, trMat.clone()); m.visible = false; scene.add(m); tracers.push({ m, life: 0 }); }
  let trIdx = 0;
  function spawnTracer(o, e, mine) {
    const t = tracers[trIdx++ % tracers.length];
    const a = new THREE.Vector3(...o), b = new THREE.Vector3(...e);
    const dir = b.clone().sub(a);
    if (dir.length() < 0.5) return;
    dir.normalize();
    if (!mine) a.addScaledVector(dir, 0.8).y -= 0.25; else a.addScaledVector(dir, 1.2).y -= 0.12;
    const l2 = a.distanceTo(b);
    t.m.position.copy(a).lerp(b, 0.5); t.m.scale.set(0.022, 0.022, l2); t.m.lookAt(b);
    t.m.visible = true; t.life = 0.09; t.m.material.opacity = 0.85;
  }

  // ---- Zarralar (oddiy va yorug' hovuz) ----
  function makePool(n, additive) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
      s.visible = false; scene.add(s);
      arr.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, s0: 1, s1: 1, a0: 1, drag: 0 });
    }
    return { arr, i: 0 };
  }
  const poolN = makePool(110, false), poolA = makePool(70, true);
  function emit(pool, o) {
    const p = pool.arr[pool.i++ % pool.arr.length];
    p.s.material.map = o.tex; p.s.material.color.set(o.color ?? 0xffffff);
    p.s.position.set(o.x, o.y, o.z);
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0; p.g = o.g || 0; p.drag = o.drag || 0;
    p.life = p.max = o.life; p.s0 = o.s0; p.s1 = o.s1; p.a0 = o.a0 ?? 1; p.rot = o.rot || 0;
    p.s.material.rotation = Math.random() * 6; p.s.visible = true; p.s.material.opacity = p.a0;
    p.s.scale.set(o.s0, o.s0, 1);
  }
  function spawnPuff(p, blood) {
    emit(poolN, { tex: blood ? bloodTex : dustTex, x: p[0], y: p[1], z: p[2], vy: 0.5, life: blood ? 0.35 : 0.55, s0: 0.25, s1: 1.15, a0: 0.75 });
  }

  // ---- Portlash ----
  function explosion(x, y, z) {
    emit(poolA, { tex: fireTex, x, y: y + 0.4, z, life: 0.45, s0: 2, s1: 11, a0: 1 });
    emit(poolA, { tex: whiteTex, x, y: y + 0.4, z, life: 0.14, s0: 4, s1: 9, a0: 1 });
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * 6.28, up = 2 + Math.random() * 7, sp = 3 + Math.random() * 8;
      emit(poolA, { tex: sparkTex, x, y: y + 0.4, z, vx: Math.cos(a) * sp, vy: up, vz: Math.sin(a) * sp, g: 16, life: 0.5 + Math.random() * 0.5, s0: 0.35, s1: 0.08, a0: 1 });
    }
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * 6.28, sp = 0.6 + Math.random() * 2;
      emit(poolN, { tex: smokeTex, color: 0x4a4540, x: x + Math.cos(a) * 0.8, y: y + 0.4 + Math.random() * 0.8, z: z + Math.sin(a) * 0.8,
        vx: Math.cos(a) * sp, vy: 1.2 + Math.random() * 1.6, vz: Math.sin(a) * sp, drag: 1.2, life: 1.8 + Math.random() * 0.9, s0: 1.8, s1: 6.5, a0: 0.8 });
    }
    for (let i = 0; i < 8; i++) {   // yer changi
      const a = Math.random() * 6.28, sp = 3 + Math.random() * 4;
      emit(poolN, { tex: dustTex, x, y: 0.3, z, vx: Math.cos(a) * sp, vy: 0.3, vz: Math.sin(a) * sp, drag: 2, life: 0.9, s0: 1, s1: 3.2, a0: 0.7 });
    }
  }
  function flashBurst(x, y, z) {
    emit(poolA, { tex: whiteTex, x, y, z, life: 0.28, s0: 1.5, s1: 14, a0: 1 });
    emit(poolA, { tex: whiteTex, x, y, z, life: 0.5, s0: 6, s1: 3, a0: 0.8 });
  }

  // ---- Tutun hajmi ----
  const smokes = [];
  function smoke(x, y, z, dur) {
    const sprites = [];
    for (let i = 0; i < 13; i++) {
      const m = new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, color: new THREE.Color().setHSL(0, 0, 0.62 + Math.random() * 0.18), opacity: 0 });
      const s = new THREE.Sprite(m); s.material.rotation = Math.random() * 6;
      const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 2.4;
      const off = [Math.cos(a) * r, 0.5 + Math.random() * 2.6, Math.sin(a) * r];
      s.position.set(x, y + 0.3, z); scene.add(s);
      sprites.push({ s, off, size: 3.8 + Math.random() * 2.2, ph: Math.random() * 6 });
    }
    smokes.push({ x, y, z, t: 0, dur: dur || 14, sprites });
  }

  // ---- Uchib yurgan granatalar ----
  const grens = new Map();
  function syncGrenades(list, mapChanged) {
    const seen = new Set();
    for (const g of list || []) {
      const id = g[0]; seen.add(id);
      let e = grens.get(id);
      if (!e) {
        const mesh = makeGrenade(g[1]); mesh.position.set(g[2], g[3], g[4]); scene.add(mesh);
        e = { mesh, spin: Math.random() * 6 }; grens.set(id, e);
      }
      e.tx = g[2]; e.ty = g[3]; e.tz = g[4];
    }
    for (const [id, e] of grens) if (!seen.has(id)) { scene.remove(e.mesh); grens.delete(id); }
  }

  function update(dt) {
    for (const t of tracers) if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.m.visible = false; else t.m.material.opacity = Math.min(0.85, t.life * 14); }
    for (const pool of [poolN, poolA]) for (const p of pool.arr) if (p.life > 0) {
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const k = 1 - p.life / p.max;
      if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.vz *= d; }
      p.vy -= p.g * dt;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      if (p.s.position.y < 0.05 && p.g) { p.s.position.y = 0.05; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; }
      const sz = p.s0 + (p.s1 - p.s0) * (p.g ? k : Math.sqrt(k));
      p.s.scale.set(sz, sz, 1);
      p.s.material.opacity = p.a0 * (1 - k) * (1 - k * 0.3);
    }
    for (let i = smokes.length - 1; i >= 0; i--) {
      const sm = smokes[i]; sm.t += dt;
      const grow = Math.min(1, sm.t / 1.1), fade = Math.min(1, Math.max(0, (sm.dur - sm.t) / 2.5)), fin = Math.min(1, sm.t / 0.4);
      for (const q of sm.sprites) {
        q.s.position.set(sm.x + q.off[0] * grow, sm.y + q.off[1] * grow + Math.sin(sm.t * 0.6 + q.ph) * 0.15, sm.z + q.off[2] * grow);
        const sz = q.size * (0.35 + 0.65 * grow); q.s.scale.set(sz, sz, 1);
        q.s.material.opacity = 0.9 * fade * fin; q.s.material.rotation += dt * 0.08;
      }
      if (sm.t >= sm.dur) { for (const q of sm.sprites) { scene.remove(q.s); q.s.material.dispose(); } smokes.splice(i, 1); }
    }
    const k = 1 - Math.exp(-dt * 22);
    for (const e of grens.values()) {
      const m = e.mesh;
      m.position.x += (e.tx - m.position.x) * k; m.position.y += (e.ty - m.position.y) * k; m.position.z += (e.tz - m.position.z) * k;
      e.spin += dt * 9; m.rotation.set(e.spin, e.spin * 0.7, 0);
    }
  }
  function clear() {
    for (const e of grens.values()) scene.remove(e.mesh);
    grens.clear();
    for (const sm of smokes) for (const q of sm.sprites) { scene.remove(q.s); q.s.material.dispose(); }
    smokes.length = 0;
    for (const pool of [poolN, poolA]) for (const p of pool.arr) { p.life = 0; p.s.visible = false; }
  }
  function smokeAt(x, y, z) {   // (x,y,z) nuqtani tutun qoplagan bo'lsa true (avto-nishon uchun)
    for (const sm of smokes) {
      const f = Math.min(1, sm.t / 1.1); if (f < 0.5 || sm.dur - sm.t < 1.5) continue;
      if (Math.hypot(x - sm.x, z - sm.z) < 2.6 && y < sm.y + 3.4) return true;
    }
    return false;
  }

  return { spawnTracer, spawnPuff, explosion, flashBurst, smoke, syncGrenades, update, clear, smokeAt };
}
