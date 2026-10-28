// Trek dunyosi: yo'l, curb, to'siq, start darvozasi, sovg'a qutilari, osmon va manzara (qishloq / cho'l / shahar)
import * as THREE from '../../vendor/three.module.min.js';
import { rng } from './util.js';
import { ROAD_HALF, WALL } from '../shared/track.js';

// ---------- Canvas teksturalar ----------
function tex(w, h, draw, { repeat = null, aniso = 8, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function noiseFill(g, w, h, base, amp, n, sizeMax = 3) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const r = rng(7);
  for (let i = 0; i < n; i++) {
    const v = (r() - 0.5) * amp, s = 1 + r() * sizeMax;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${Math.min(0.5, v / 255)})` : `rgba(0,0,0,${Math.min(0.5, -v / 255)})`;
    g.fillRect(r() * w, r() * h, s, s);
  }
}

const THEMES = {
  village: {
    skyTop: '#3f86df', skyHor: '#cfe3f3', fog: '#cfe0ec', fogNear: 160, fogFar: 760, ground: '#6f8f3c', groundDark: '#5d7d30', shoulder: '#8a7a55',
    env: { top: '#4f8fe0', horizon: '#dbe9f5', ground: '#7b8a55' },
  },
  desert: {
    skyTop: '#3c8ee0', skyHor: '#f1e4c6', fog: '#eadcb9', fogNear: 200, fogFar: 900, ground: '#d6b673', groundDark: '#c9a460', shoulder: '#c8a566',
    env: { top: '#5a97e0', horizon: '#f2e6cb', ground: '#c9a867' },
  },
  city: {
    skyTop: '#3a7ddc', skyHor: '#d4e4f4', fog: '#c8d7e6', fogNear: 170, fogFar: 820, ground: '#a9a79d', groundDark: '#9a988e', shoulder: '#9a9c9e',
    env: { top: '#4f8be0', horizon: '#dfeaf5', ground: '#8a8d90' },
  },
};
export const THEME_ENV = (id) => THEMES[id].env;

function asphaltTexture() {
  return tex(256, 512, (g, w, h) => {
    noiseFill(g, w, h, '#3c3e42', 70, 5200, 2.2);
    // shina izlari
    for (const x of [0.3, 0.37, 0.63, 0.7]) { const gr = g.createLinearGradient((x - 0.03) * w, 0, (x + 0.03) * w, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.13)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect((x - 0.03) * w, 0, 0.06 * w, h); }
    // chekka chiziqlari
    g.fillStyle = '#e9e9e4';
    g.fillRect(w * 0.035, 0, w * 0.018, h); g.fillRect(w * 0.947, 0, w * 0.018, h);
    // o'rta chiziq (uzuq-uzuq)
    g.fillStyle = '#e9e1a0';
    g.fillRect(w * 0.492, 0, w * 0.016, h * 0.42);
    // yoriqlar
    g.strokeStyle = 'rgba(10,10,10,0.5)'; g.lineWidth = 1;
    const r = rng(3);
    for (let i = 0; i < 8; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 30; y += r() * 26; g.lineTo(x, y); } g.stroke(); }
  }, { aniso: 8 });
}
function curbTexture() {
  return tex(32, 64, (g, w, h) => { g.fillStyle = '#d62828'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f4f4f0'; g.fillRect(0, h / 2, w, h / 2); });
}
function wallTexture() {
  return tex(256, 64, (g, w, h) => {
    g.fillStyle = '#e9e9e6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8281e'; g.fillRect(0, h * 0.28, w / 2, h * 0.44);
    g.fillStyle = '#1b1b1b'; g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(w / 2 - 1, 0, 2, h); g.fillRect(0, 0, 2, h);
    noiseFill(g, w, h, 'rgba(0,0,0,0)', 40, 600, 2);
  });
}
function groundTexture(theme, big = 256) {
  return tex(big, big, (g, w, h) => {
    const th = THEMES[theme];
    noiseFill(g, w, h, th.ground, 60, 6000, 3);
    const r = rng(11);
    for (let i = 0; i < 40; i++) { g.fillStyle = th.groundDark + '55'; g.beginPath(); g.ellipse(r() * w, r() * h, 8 + r() * 24, 5 + r() * 14, r() * 3, 0, 6.3); g.fill(); }
    if (theme === 'village') for (let i = 0; i < 700; i++) { g.strokeStyle = `rgba(${40 + r() * 40},${90 + r() * 50},30,0.5)`; g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 3); g.stroke(); }
    if (theme === 'city') { g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1; for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }
  }, { repeat: [1, 1] });
}
function shoulderTexture(theme) {
  return tex(128, 128, (g, w, h) => {
    const base = theme === 'city' ? '#9b9d9f' : theme === 'desert' ? '#cdac6a' : '#7f9547';
    noiseFill(g, w, h, base, 60, 2400, 2.5);
    if (theme === 'city') { g.strokeStyle = 'rgba(0,0,0,0.2)'; for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }
  });
}
function bannerTexture() {
  return tex(1024, 128, (g, w, h) => {
    g.fillStyle = '#111'; g.fillRect(0, 0, w, h);
    const s = 16;
    for (let y = 0; y < 2; y++) for (let x = 0; x < w / s; x++) { g.fillStyle = (x + y) % 2 ? '#fff' : '#111'; g.fillRect(x * s, y * s, s, s); g.fillRect(x * s, h - (y + 1) * s, s, s); }
    g.fillStyle = '#f7d21c'; g.fillRect(0, 36, w, h - 72);
    g.fillStyle = '#111'; g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.fillText('START  ·  FINISH', w / 2, h / 2 + 20);
  });
}
function checkerTexture() {
  return tex(128, 32, (g, w, h) => { const s = 16; for (let y = 0; y < h / s; y++) for (let x = 0; x < w / s; x++) { g.fillStyle = (x + y) % 2 ? '#f2f2f2' : '#161616'; g.fillRect(x * s, y * s, s, s); } });
}
function gridTexture() {
  return tex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#f4f4f0'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20); g.clearRect(10, h - 14, w - 20, 8); }, { aniso: 4 });
}
function facadeTexture(seed, lit) {
  return tex(256, 256, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = '#c9ccd1'; g.fillRect(0, 0, w, h);
    noiseFill(g, w, h, '#c9ccd1', 30, 800, 2);
    const cols = 6, rows = 8, cw = w / cols, rh = h / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const on = r() < lit;
      g.fillStyle = on ? '#ffe9a6' : `rgb(${40 + r() * 25},${60 + r() * 30},${85 + r() * 40})`;
      g.fillRect(x * cw + cw * 0.18, y * rh + rh * 0.18, cw * 0.64, rh * 0.64);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x * cw + cw * 0.18, y * rh + rh * 0.18, cw * 0.64, rh * 0.18);
    }
  });
}
function houseTexture() {
  return tex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    noiseFill(g, w, h, '#f0f0f0', 20, 600, 2);
    g.fillStyle = '#42505e'; g.fillRect(w * 0.12, h * 0.38, w * 0.22, h * 0.26); g.fillRect(w * 0.66, h * 0.38, w * 0.22, h * 0.26);
    g.fillStyle = '#7b5230'; g.fillRect(w * 0.42, h * 0.52, w * 0.16, h * 0.48);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h * 0.94, w, h * 0.06);
  });
}
function shadowTex() {
  return tex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { srgb: false });
}
function questionTexture() {
  return tex(128, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ffd23f'); gr.addColorStop(1, '#ff7a1a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#fff'; g.font = 'bold 92px sans-serif'; g.textAlign = 'center'; g.fillText('?', w / 2, h * 0.78);
  });
}

// ---------- Geometriya yordamchilari ----------
function ribbon(track, latA, latB, y, vScale, vOff = 0) {
  const N = track.N, pos = new Float32Array((N + 1) * 2 * 3), uv = new Float32Array((N + 1) * 2 * 2), nor = new Float32Array((N + 1) * 2 * 3);
  for (let i = 0; i <= N; i++) {
    const k = i % N, tx = track.TX[k], tz = track.TZ[k], rx = -tz, rz = tx;
    for (let s = 0; s < 2; s++) {
      const lat = s === 0 ? latA : latB, o = (i * 2 + s);
      pos[o * 3] = track.X[k] + rx * lat; pos[o * 3 + 1] = y; pos[o * 3 + 2] = track.Z[k] + rz * lat;
      nor[o * 3 + 1] = 1;
      uv[o * 2] = s; uv[o * 2 + 1] = (i * track.DS) / vScale + vOff;
    }
  }
  const idx = [];
  for (let i = 0; i < N; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
function wallStrip(track, lat, h, vScale) {
  const N = track.N, pos = new Float32Array((N + 1) * 2 * 3), uv = new Float32Array((N + 1) * 2 * 2);
  for (let i = 0; i <= N; i++) {
    const k = i % N, rx = -track.TZ[k], rz = track.TX[k];
    for (let s = 0; s < 2; s++) {
      const o = i * 2 + s;
      pos[o * 3] = track.X[k] + rx * lat; pos[o * 3 + 1] = s === 0 ? 0 : h; pos[o * 3 + 2] = track.Z[k] + rz * lat;
      uv[o * 2] = (i * track.DS) / vScale; uv[o * 2 + 1] = s;
    }
  }
  const idx = [];
  for (let i = 0; i < N; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// bir nechta geometriyani birlashtirish (matritsa bilan)
function mergeGeos(parts) {
  let nV = 0, nI = 0;
  for (const { g } of parts) { nV += g.attributes.position.count; nI += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), uv = new Float32Array(nV * 2), idx = new Uint32Array(nI);
  let vo = 0, io = 0; const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const { g, m } of parts) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv; nm.getNormalMatrix(m);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m); pos.set([v.x, v.y, v.z], (vo + i) * 3);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (vo + i) * 3);
      if (u) uv.set([u.getX(i), u.getY(i)], (vo + i) * 2);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo; else for (let i = 0; i < p.count; i++) idx[io++] = vo + i;
    vo += p.count;
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.BufferAttribute(pos, 3)); r.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); r.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); r.setIndex(new THREE.BufferAttribute(idx, 1));
  return r;
}
const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

// Yo'lga eng yaqin masofa (tezlashtirilgan to'r)
function makeDist(track) {
  const cell = 40, map = new Map();
  for (let i = 0; i < track.N; i++) { const k = Math.floor(track.X[i] / cell) + ',' + Math.floor(track.Z[i] / cell); let a = map.get(k); if (!a) { a = []; map.set(k, a); } a.push(i); }
  return (x, z, maxR = 120) => {
    let best = 1e9; const cx = Math.floor(x / cell), cz = Math.floor(z / cell), R = Math.ceil(maxR / cell);
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const a = map.get((cx + dx) + ',' + (cz + dz)); if (!a) continue;
      for (const i of a) { const d = Math.hypot(x - track.X[i], z - track.Z[i]); if (d < best) best = d; }
    }
    return best;
  };
}

function instanced(geo, mat, items, { colors = null } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  const c = new THREE.Color();
  items.forEach((m, i) => { im.setMatrixAt(i, m); if (colors) { c.set(colors[i]); im.setColorAt(i, c); } });
  im.count = items.length; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.frustumCulled = false;
  return im;
}

// ================== Asosiy qurish ==================
export function buildWorld(scene, track, { quality = 1, env = null } = {}) {
  const th = THEMES[track.theme];
  const group = new THREE.Group(); scene.add(group);
  const disposables = [];
  const R = rng(track.id.length * 97 + track.N);
  const distTo = makeDist(track);

  scene.background = new THREE.Color(th.fog);
  scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);

  // bounding box
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < track.N; i++) { minX = Math.min(minX, track.X[i]); maxX = Math.max(maxX, track.X[i]); minZ = Math.min(minZ, track.Z[i]); maxZ = Math.max(maxZ, track.Z[i]); }
  const cxm = (minX + maxX) / 2, czm = (minZ + maxZ) / 2;

  // ---- yer ----
  const gt = groundTexture(track.theme); gt.repeat.set(220, 220);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 48, 48), new THREE.MeshStandardMaterial({ map: gt, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 6 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cxm, -0.12, czm); group.add(ground);

  // ---- yo'l va chekkalar ----
  const asp = asphaltTexture(); asp.wrapT = THREE.RepeatWrapping; asp.wrapS = THREE.ClampToEdgeWrapping;
  const road = new THREE.Mesh(ribbon(track, -ROAD_HALF, ROAD_HALF, 0.03, 16), new THREE.MeshStandardMaterial({ map: asp, roughness: 0.9, metalness: 0 }));
  group.add(road);
  const curbT = curbTexture(); curbT.wrapT = THREE.RepeatWrapping;
  const curbMat = new THREE.MeshStandardMaterial({ map: curbT, roughness: 0.8 });
  for (const sgn of [-1, 1]) {
    const a = sgn * ROAD_HALF, b = sgn * (ROAD_HALF + 1.1);
    group.add(new THREE.Mesh(ribbon(track, Math.min(a, b), Math.max(a, b), 0.045, 2), curbMat));
  }
  const shT = shoulderTexture(track.theme); shT.wrapS = shT.wrapT = THREE.RepeatWrapping;
  const shMat = new THREE.MeshStandardMaterial({ map: shT, roughness: 1 });
  for (const sgn of [-1, 1]) {
    const a = sgn * (ROAD_HALF + 1.1), b = sgn * (WALL + 0.2);
    const g = ribbon(track, Math.min(a, b), Math.max(a, b), 0.015, 6);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 1.0);
    group.add(new THREE.Mesh(g, shMat));
  }
  // ---- devorlar ----
  const wT = wallTexture(); wT.wrapS = THREE.RepeatWrapping;
  const wallMat = new THREE.MeshStandardMaterial({ map: wT, roughness: 0.85, side: THREE.DoubleSide });
  for (const sgn of [-1, 1]) group.add(new THREE.Mesh(wallStrip(track, sgn * (WALL + 0.15), 1.15, 8), wallMat));
  const capMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 });
  for (const sgn of [-1, 1]) {
    const cap = ribbon(track, sgn * (WALL + 0.15) - 0.25, sgn * (WALL + 0.15) + 0.25, 1.17, 8);
    group.add(new THREE.Mesh(cap, capMat));
  }

  // ---- start chizig'i, panjara, darvoza ----
  const p0 = track.at(0, 0);
  const chk = checkerTexture(); chk.wrapS = chk.wrapT = THREE.RepeatWrapping; chk.repeat.set(ROAD_HALF * 2 / 1, 1);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 1.4), new THREE.MeshBasicMaterial({ map: chk }));
  line.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); line.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p0.h));
  line.position.set(p0.x, 0.06, p0.z);
  group.add(line);
  const gridT = gridTexture();
  for (let k = 0; k < 5; k++) {
    const g = track.grid(k);
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.2), new THREE.MeshBasicMaterial({ map: gridT, transparent: true, depthWrite: false }));
    q.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); q.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), g.h));
    q.position.set(g.x, 0.055, g.z); group.add(q);
  }
  // darvoza
  const gate = new THREE.Group(); gate.position.set(p0.x, 0, p0.z); gate.rotation.y = p0.h; group.add(gate);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.5, metalness: 0.6 });
  for (const sgn of [-1, 1]) { const pole = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.2, 0.6), poleMat); pole.position.set(sgn * (ROAD_HALF + 1.3), 3.6, 0); gate.add(pole); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry((ROAD_HALF + 1.3) * 2 + 0.5, 1.9, 0.6), new THREE.MeshStandardMaterial({ map: bannerTexture(), roughness: 0.6 }));
  beam.position.set(0, 6.4, 0); gate.add(beam);
  // ---- soyalar (blob) ----
  const shT2 = shadowTex(); const blobMat = new THREE.MeshBasicMaterial({ map: shT2, transparent: true, depthWrite: false, opacity: 0.9 });

  // ---- sovg'a qutilari ----
  const qT = questionTexture();
  const boxGeo = new THREE.BoxGeometry(1.25, 1.25, 1.25);
  const boxMat = new THREE.MeshBasicMaterial({ map: qT, transparent: true, opacity: 0.92 });
  const boxMeshes = track.boxes.map((b) => { const m = new THREE.Mesh(boxGeo, boxMat); m.position.set(b.x, 1.2, b.z); group.add(m); return m; });
  let boxMask = -1;

  // ---- moy dog'lari ----
  const oilGroup = new THREE.Group(); group.add(oilGroup);
  const oilMat = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.92, envMap: env });
  const oilGeo = new THREE.CircleGeometry(2.0, 28);
  const oilMeshes = new Map();

  // ---- osmon ----
  const skyGeo = new THREE.SphereGeometry(1500, 24, 16);
  const skyCol = new Float32Array(skyGeo.attributes.position.count * 3), skyP = skyGeo.attributes.position, c3 = new THREE.Color(), top = new THREE.Color(th.skyTop), hor = new THREE.Color(th.skyHor);
  for (let i = 0; i < skyP.count; i++) { const y = skyP.getY(i) / 1500; c3.copy(hor).lerp(top, Math.pow(Math.max(0, y), 0.55)); if (y < 0) c3.copy(hor); skyCol.set([c3.r, c3.g, c3.b], i * 3); }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyCol, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10; scene.add(sky);
  const sunDir = new THREE.Vector3(-0.45, 0.65, 0.35).normalize();
  const sunMesh = new THREE.Mesh(new THREE.CircleGeometry(90, 28), new THREE.MeshBasicMaterial({ color: 0xfff6dc, fog: false, depthWrite: false, transparent: true, opacity: 0.95 }));
  sunMesh.position.copy(sunDir).multiplyScalar(1400); sunMesh.lookAt(0, 0, 0); sunMesh.renderOrder = -9; scene.add(sunMesh);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(260, 28), new THREE.MeshBasicMaterial({ map: shadowTex(), color: 0xfff1c8, fog: false, depthWrite: false, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending }));
  halo.position.copy(sunDir).multiplyScalar(1390); halo.lookAt(0, 0, 0); halo.renderOrder = -9; scene.add(halo);
  // bulutlar
  const cloudTex = tex(256, 128, (g, w, h) => { const r = rng(5); for (let i = 0; i < 26; i++) { const gr = g.createRadialGradient(0, 0, 2, 0, 0, 40 + r() * 20); const x = 60 + r() * 140, y = 50 + r() * 30; g.save(); g.translate(x, y); g.scale(1.6, 0.8); gr.addColorStop(0, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 60, 0, 6.3); g.fill(); g.restore(); } }, { srgb: true });
  const clouds = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(380 + R() * 300, 150 + R() * 70), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.7 }));
    const a = R() * Math.PI * 2, d = 800 + R() * 600;
    m.position.set(Math.cos(a) * d, 330 + R() * 260, Math.sin(a) * d); m.lookAt(0, 0, 0); m.renderOrder = -8; scene.add(m); clouds.push(m);
  }

  // ---- yorug'lik ----
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.3); sun.position.copy(sunDir).multiplyScalar(300); scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x8a7a5a, 1.05); scene.add(hemi);

  // ================== Manzara ==================
  const scenery = new THREE.Group(); group.add(scenery);
  const acceptable = (x, z, minD) => distTo(x, z, minD + 6) > minD;
  const placed = [];
  const free = (x, z, r) => { for (const p of placed) if (Math.hypot(p[0] - x, p[1] - z) < r + p[2]) return false; return true; };
  const bx0 = minX - 380, bx1 = maxX + 380, bz0 = minZ - 380, bz1 = maxZ + 380;
  function scatter(count, minD, r, extra = () => true, maxTry = 40) {
    const out = []; let tries = 0;
    while (out.length < count && tries < count * maxTry) {
      tries++;
      const x = bx0 + R() * (bx1 - bx0), z = bz0 + R() * (bz1 - bz0);
      if (!acceptable(x, z, minD) || !free(x, z, r) || !extra(x, z)) continue;
      placed.push([x, z, r]); out.push([x, z]);
    }
    return out;
  }
  const rangeD = (q) => Math.max(8, Math.round(q * quality));
  const blobs = [];
  const addBlob = (x, z, s, a = 1) => blobs.push(M4(x, 0.03, z, -Math.PI / 2, 0, 0, s, s, 1));

  const jitterColor = (base, v) => { const c = new THREE.Color(base); c.offsetHSL((R() - 0.5) * v, (R() - 0.5) * v * 0.6, (R() - 0.5) * v * 0.9); return '#' + c.getHexString(); };

  if (track.theme === 'village') {
    // uylar
    const geoBody = new THREE.BoxGeometry(1, 1, 1); geoBody.translate(0, 0.5, 0);
    const geoRoof = new THREE.ConeGeometry(0.78, 1, 4); geoRoof.rotateY(Math.PI / 4); geoRoof.translate(0, 0.5, 0);
    const bodyM = [], roofM = [], bodyC = [], roofC = [];
    const wallCols = ['#e6c98a', '#f1e3c0', '#c8d9e6', '#d9b48a', '#e9d4a6', '#c9d8b0'];
    for (const [x, z] of scatter(rangeD(46), 16, 9)) {
      const w = 6.5 + R() * 3.5, d = 6 + R() * 3, h = 3.2 + R() * 1.4, ry = Math.round(R() * 4) * Math.PI / 2 + (R() - 0.5) * 0.3;
      bodyM.push(M4(x, 0, z, 0, ry, 0, w, h, d)); bodyC.push(jitterColor(wallCols[(R() * wallCols.length) | 0], 0.06));
      const rh = 2.2 + R() * 0.8; roofM.push(M4(x, h, z, 0, ry, 0, w * 1.18, rh, d * 1.18)); roofC.push(jitterColor(['#b5532f', '#9c4326', '#7a5a3c', '#a05a30'][(R() * 4) | 0], 0.05));
      addBlob(x, z, Math.max(w, d) * 1.7);
    }
    const hm = new THREE.MeshStandardMaterial({ map: houseTexture(), roughness: 0.95 });
    scenery.add(instanced(geoBody, hm, bodyM, { colors: bodyC }));
    scenery.add(instanced(geoRoof, new THREE.MeshStandardMaterial({ roughness: 0.9 }), roofM, { colors: roofC }));
    // paxsa devorlari (past devor bo'laklari) yo'l bo'ylab
    // terak daraxtlari
    const trunkG = new THREE.CylinderGeometry(0.18, 0.28, 3.5, 6); trunkG.translate(0, 1.75, 0);
    const crownG = new THREE.IcosahedronGeometry(1, 1); crownG.scale(1.4, 4.2, 1.4); crownG.translate(0, 6.4, 0);
    const trunkM = [], crownM = [], crownC = [];
    for (const [x, z] of scatter(rangeD(260), 15, 3.2)) { const s = 0.8 + R() * 0.7; trunkM.push(M4(x, 0, z, 0, 0, 0, s, s, s)); crownM.push(M4(x, 0, z, 0, R() * 6, 0, s, s, s)); crownC.push(jitterColor(['#3f7a2e', '#4b8a34', '#356f2a', '#5a9a3c'][(R() * 4) | 0], 0.08)); addBlob(x, z, 5 * s); }
    scenery.add(instanced(trunkG, new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 }), trunkM));
    scenery.add(instanced(crownG, new THREE.MeshStandardMaterial({ roughness: 0.9 }), crownM, { colors: crownC }));
    // butalar
    const bushG = new THREE.IcosahedronGeometry(1, 1); bushG.scale(1.4, 0.9, 1.4); bushG.translate(0, 0.7, 0);
    const bushM = [], bushC = [];
    for (const [x, z] of scatter(rangeD(220), 11, 1.8)) { const s = 0.7 + R() * 0.9; bushM.push(M4(x, 0, z, 0, R() * 6, 0, s, s, s)); bushC.push(jitterColor('#4f8a3a', 0.12)); }
    scenery.add(instanced(bushG, new THREE.MeshStandardMaterial({ roughness: 1 }), bushM, { colors: bushC }));
    // pichan g'aramlari
    const hayG = new THREE.CylinderGeometry(1.0, 1.0, 1.3, 14); hayG.rotateZ(Math.PI / 2); hayG.translate(0, 0.65, 0);
    const hayM = []; for (const [x, z] of scatter(rangeD(44), 14, 2.5)) hayM.push(M4(x, 0, z, 0, R() * 6, 0, 1, 1, 1));
    scenery.add(instanced(hayG, new THREE.MeshStandardMaterial({ color: 0xd8b75a, roughness: 1 }), hayM));
    // uzoq tog'lar
    farRing(scenery, R, cxm, czm, 1050, 26, ['#6f8a5a', '#7c9a68', '#889a7a'], 1.0, 'hill');
    farRing(scenery, R, cxm, czm, 1500, 16, ['#8c9fb3', '#97aabd'], 2.2, 'peak');
  } else if (track.theme === 'desert') {
    const duneG = new THREE.SphereGeometry(1, 18, 10); duneG.scale(1, 0.2, 1.35);
    const duneM = [], duneC = [];
    for (let n = 0, tries = 0; n < rangeD(60) && tries < 4000; tries++) {
      const s = 22 + R() * 34, x = bx0 + R() * (bx1 - bx0), z = bz0 + R() * (bz1 - bz0);
      if (!acceptable(x, z, s * 1.5 + 16)) continue;
      n++; const sy = s * (0.8 + R() * 0.5);
      duneM.push(M4(x, -s * 0.03, z, 0, R() * 6, 0, s, sy, s)); duneC.push(jitterColor(['#d9ba7a', '#ceaa68', '#e0c488'][(R() * 3) | 0], 0.06));
    }
    scenery.add(instanced(duneG, new THREE.MeshStandardMaterial({ roughness: 1 }), duneM, { colors: duneC }));
    // kaktuslar (birlashtirilgan geometriya)
    const cactusG = mergeGeos([
      { g: new THREE.CylinderGeometry(0.28, 0.32, 3.4, 8), m: M4(0, 1.7, 0) },
      { g: new THREE.SphereGeometry(0.28, 8, 6), m: M4(0, 3.4, 0) },
      { g: new THREE.CylinderGeometry(0.17, 0.17, 1.1, 8), m: M4(0.62, 2.0, 0, 0, 0, Math.PI / 2) },
      { g: new THREE.CylinderGeometry(0.17, 0.17, 1.0, 8), m: M4(0.98, 2.5, 0) },
      { g: new THREE.CylinderGeometry(0.15, 0.15, 0.9, 8), m: M4(-0.55, 1.6, 0, 0, 0, Math.PI / 2) },
      { g: new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8), m: M4(-0.92, 2.0, 0) },
    ]);
    const cM = [], cC = [];
    for (const [x, z] of scatter(rangeD(120), 12, 2.5)) { const s = 0.8 + R() * 0.9; cM.push(M4(x, 0, z, 0, R() * 6, 0, s, s, s)); cC.push(jitterColor('#3f8450', 0.1)); addBlob(x, z, 3 * s); }
    scenery.add(instanced(cactusG, new THREE.MeshStandardMaterial({ roughness: 0.9 }), cM, { colors: cC }));
    // toshlar
    const rockG = new THREE.DodecahedronGeometry(1, 0); rockG.scale(1.2, 0.8, 1);
    const rM = [], rC = [];
    for (const [x, z] of scatter(rangeD(160), 11, 2.5)) { const s = 0.7 + R() * 2.4; rM.push(M4(x, s * 0.3, z, R(), R() * 6, R() * 0.4, s, s, s)); rC.push(jitterColor(['#8b7a66', '#9a8670', '#76665a'][(R() * 3) | 0], 0.06)); addBlob(x, z, 2.6 * s); }
    scenery.add(instanced(rockG, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), rM, { colors: rC }));
    // quruq butalar
    const shrubG = new THREE.IcosahedronGeometry(1, 0); shrubG.scale(1.3, 0.6, 1.3); shrubG.translate(0, 0.4, 0);
    const sM = [], sC = []; for (const [x, z] of scatter(rangeD(180), 10, 1.8)) { const s = 0.6 + R() * 0.8; sM.push(M4(x, 0, z, 0, R() * 6, 0, s, s, s)); sC.push(jitterColor('#9a8a4a', 0.12)); }
    scenery.add(instanced(shrubG, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), sM, { colors: sC }));
    // paxsa uylar
    const hG = new THREE.BoxGeometry(1, 1, 1); hG.translate(0, 0.5, 0);
    const hM = [], hC = []; for (const [x, z] of scatter(rangeD(16), 18, 8)) { const w = 6 + R() * 4, h = 3 + R() * 1.6; hM.push(M4(x, 0, z, 0, R() * 6, 0, w, h, w * (0.8 + R() * 0.4))); hC.push(jitterColor('#d3b27a', 0.05)); addBlob(x, z, w * 1.7); }
    scenery.add(instanced(hG, new THREE.MeshStandardMaterial({ map: houseTexture(), roughness: 1 }), hM, { colors: hC }));
    farRing(scenery, R, cxm, czm, 1100, 22, ['#b8895a', '#c39562', '#a97c52'], 1.2, 'mesa');
    farRing(scenery, R, cxm, czm, 1550, 14, ['#c9a07a', '#d2ab86'], 2.0, 'peak');
  } else {
    // shahar: binolar
    const sizes = [[14, 22, 14], [18, 34, 16], [22, 48, 18], [16, 62, 16], [26, 28, 20], [20, 76, 20], [30, 40, 24], [18, 18, 26]];
    const facs = [facadeTexture(21, 0.3), facadeTexture(22, 0.18), facadeTexture(23, 0.4)];
    const buckets = sizes.map(([w, h, d], i) => {
      const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
      const uv = g.attributes.uv, nrm = g.attributes.normal;
      for (let k = 0; k < uv.count; k++) { const ny = Math.abs(nrm.getY(k)), nx = Math.abs(nrm.getX(k)); const wd = nx > 0.5 ? d : w; if (ny > 0.5) uv.setXY(k, 0.1, 0.1); else uv.setXY(k, uv.getX(k) * wd / 11, uv.getY(k) * h / 11); }
      return { g, mats: [], cols: [], w, h, d, m: new THREE.MeshStandardMaterial({ map: facs[i % 3], roughness: 0.7, metalness: 0.1 }) };
    });
    for (const [x, z] of scatter(rangeD(110), 24, 22, () => true, 60)) {
      const b = buckets[(R() * buckets.length) | 0], ry = Math.round(R() * 2) * Math.PI / 2;
      b.mats.push(M4(x, 0, z, 0, ry, 0)); b.cols.push(jitterColor(['#ffffff', '#f3efe6', '#dfe6ee', '#efe2d2'][(R() * 4) | 0], 0.05)); addBlob(x, z, Math.max(b.w, b.d) * 1.6);
    }
    for (const b of buckets) { if (b.mats.length) scenery.add(instanced(b.g, b.m, b.mats, { colors: b.cols })); }
    // ko'cha chiroqlari
    const poleG = mergeGeos([
      { g: new THREE.CylinderGeometry(0.1, 0.14, 7.2, 8), m: M4(0, 3.6, 0) },
      { g: new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6), m: M4(0, 7.1, 0, 0, 0, Math.PI / 2 - 0.15) },
    ]);
    const headG = new THREE.BoxGeometry(0.9, 0.16, 0.34);
    const pM = [], hM = [];
    const step = Math.max(2, Math.round(34 / track.DS));
    for (let i = 0; i < track.N; i += step) for (const sgn of [-1, 1]) {
      const rx = -track.TZ[i], rz = track.TX[i], lat = sgn * (WALL + 1.6);
      const x = track.X[i] + rx * lat, z = track.Z[i] + rz * lat, ry = Math.atan2(-rx * sgn, -rz * sgn);
      pM.push(M4(x, 0, z, 0, ry + Math.PI / 2 * 0, 0));
      const ox = -rx * sgn * 1.1, oz = -rz * sgn * 1.1;
      hM.push(M4(x + ox * 1.0, 7.25, z + oz * 1.0, 0, Math.atan2(rx, rz), 0));
    }
    scenery.add(instanced(poleG, new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.6, metalness: 0.5 }), pM));
    scenery.add(instanced(headG, new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffe9a8, emissiveIntensity: 1.2 }), hM));
    // ko'cha daraxtlari
    const tt = new THREE.CylinderGeometry(0.15, 0.22, 2.4, 6); tt.translate(0, 1.2, 0);
    const tc = new THREE.IcosahedronGeometry(1.7, 1); tc.translate(0, 3.6, 0);
    const tM = [], tcM = [], tcC = [];
    for (let i = Math.round(10 / track.DS); i < track.N; i += Math.round(27 / track.DS)) for (const sgn of [-1, 1]) {
      const rx = -track.TZ[i], rz = track.TX[i], lat = sgn * (WALL + 4.0);
      tM.push(M4(track.X[i] + rx * lat, 0, track.Z[i] + rz * lat)); tcM.push(M4(track.X[i] + rx * lat, 0, track.Z[i] + rz * lat)); tcC.push(jitterColor('#4c8a3c', 0.1));
    }
    scenery.add(instanced(tt, new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 1 }), tM));
    scenery.add(instanced(tc, new THREE.MeshStandardMaterial({ roughness: 0.9 }), tcM, { colors: tcC }));
    // uzoq osmono'par
    farRing(scenery, R, cxm, czm, 1000, 34, ['#9fb0c4', '#8fa2b8', '#aab9cb'], 1.0, 'tower');
  }
  // soyalar
  if (blobs.length) { const bg = new THREE.PlaneGeometry(1, 1); const im = instanced(bg, blobMat, blobs); im.renderOrder = 1; scenery.add(im); }

  // ================== Ochiq API ==================
  const api = {
    group, sky, sun, hemi, theme: track.theme, track,
    update(t, camPos) {
      sky.position.copy(camPos); sunMesh.position.copy(camPos).addScaledVector(sunDir, 1400); halo.position.copy(camPos).addScaledVector(sunDir, 1390);
      for (const c of clouds) { c.position.x += 0.4 * 0.016; }
      boxMeshes.forEach((m, i) => { if (!m.visible) return; m.rotation.y = t * 1.6 + i; m.rotation.x = t * 0.9 + i * 0.5; m.position.y = 1.25 + Math.sin(t * 2.2 + i) * 0.18; });
    },
    setBoxes(mask) {
      if (mask === boxMask) return; boxMask = mask;
      boxMeshes.forEach((m, i) => { m.visible = !!(mask & (1 << i)); });
    },
    setOils(list) {
      const seen = new Set();
      for (const [id, x, z] of list) {
        seen.add(id);
        if (!oilMeshes.has(id)) { const m = new THREE.Mesh(oilGeo, oilMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.07, z); m.scale.set(1 + (id % 3) * 0.1, 0.85 + (id % 4) * 0.06, 1); oilGroup.add(m); oilMeshes.set(id, m); }
      }
      for (const [id, m] of oilMeshes) if (!seen.has(id)) { oilGroup.remove(m); oilMeshes.delete(id); }
    },
    sunDir,
    dispose() {
      scene.remove(group); scene.remove(sky); scene.remove(sunMesh); scene.remove(halo); scene.remove(sun); scene.remove(hemi);
      clouds.forEach((c) => scene.remove(c));
      const geos = new Set(), mats = new Set(), texs = new Set();
      const visit = (o) => { o.traverse((m) => { if (m.geometry) geos.add(m.geometry); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => { mats.add(x); for (const k of ['map', 'alphaMap']) if (x[k]) texs.add(x[k]); }); if (m.isInstancedMesh) m.dispose(); }); };
      visit(group); visit(sky); visit(sunMesh); visit(halo); clouds.forEach(visit);
      geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((t) => t.dispose());
    },
  };
  return api;
}

// Uzoqdagi tog'/tepalik/osmono'par halqasi
function farRing(parent, R, cx, cz, radius, n, colors, scale, kind) {
  let geo;
  if (kind === 'hill') { geo = new THREE.SphereGeometry(1, 14, 8); geo.scale(1, 0.32, 1); }
  else if (kind === 'peak') geo = new THREE.ConeGeometry(1, 1, 8);
  else if (kind === 'mesa') { geo = new THREE.CylinderGeometry(0.7, 1, 1, 10); }
  else { geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0); }
  const ms = [], cs = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.1, d = radius * (0.9 + R() * 0.25);
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (kind === 'hill') { const s = 120 + R() * 160; ms.push(M4(x, -4, z, 0, R() * 6, 0, s, s * (0.7 + R() * 0.6) * scale, s * 1.2)); }
    else if (kind === 'peak') { const s = 160 + R() * 200, h = (150 + R() * 220) * scale; ms.push(M4(x, h / 2 - 5, z, 0, R() * 6, 0, s, h, s)); }
    else if (kind === 'mesa') { const s = 90 + R() * 120, h = 50 + R() * 60; ms.push(M4(x, h / 2 - 3, z, 0, R() * 6, 0, s, h, s * 1.3)); }
    else { const w = 30 + R() * 40, h = 90 + R() * 200; ms.push(M4(x, -2, z, 0, R() * 6, 0, w, h, w)); }
    const c = new THREE.Color(colors[(R() * colors.length) | 0]); c.offsetHSL(0, 0, (R() - 0.5) * 0.06); cs.push('#' + c.getHexString());
  }
  parent.add(instanced(geo, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: kind !== 'hill' }), ms, { colors: cs }));
}
