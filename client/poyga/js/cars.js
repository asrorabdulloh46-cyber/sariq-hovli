// 5 ta mashina modeli: Nexia 3, Nexia 2, Mercedes W211, Cobalt, Matiz.
// Hammasi silliq "loft" (kesimlar bo'yicha) shakllardan yig'iladi: kuzov, oynalar bloki, tom paneli; g'ildirak, chiroq va boshqa tafsilotlar alohida.
import * as THREE from '../../vendor/three.module.min.js';
import { curve, bakeGroup } from './util.js';

const sgn = (v) => (v < 0 ? -1 : 1);

// ---------- Loft ----------
function loftGeometry(stations, ring, { uv = false, phiStart = 0 } = {}) {
  const R = uv ? ring + 1 : ring, S = stations.length, pos = new Float32Array(S * R * 3), uvs = new Float32Array(S * R * 2);
  for (let i = 0; i < S; i++) {
    const st = stations[i];
    for (let k = 0; k < R; k++) {
      const phi = phiStart + (Math.PI * 2 * k) / ring;
      const c = Math.cos(phi), sn = Math.sin(phi), e = 2 / (st.n || 4);
      const px = sgn(c) * Math.pow(Math.abs(c), e), py = sgn(sn) * Math.pow(Math.abs(sn), e), yy = (py + 1) / 2;
      const o = (i * R + k) * 3;
      pos[o] = st.w * px * (1 - (st.tumble || 0) * yy);
      pos[o + 1] = st.yb + yy * (st.yt - st.yb);
      pos[o + 2] = st.z;
      uvs[(i * R + k) * 2] = k / ring; uvs[(i * R + k) * 2 + 1] = st.v !== undefined ? st.v : i / (S - 1);
    }
  }
  const idx = [], kmax = uv ? ring : R;
  for (let i = 0; i < S - 1; i++) {
    for (let k = 0; k < kmax; k++) {
      const k1 = uv ? k + 1 : (k + 1) % R;
      const a = i * R + k, b = i * R + k1, c = (i + 1) * R + k, d = (i + 1) * R + k1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- Texturalar ----------
const texCache = {};
function canvasTex(key, w, h, draw) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache[key] = t; return t;
}
function rimTexture() {
  return canvasTex('rim', 128, 128, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#15171a'; g.beginPath(); g.arc(c, c, c, 0, 6.3); g.fill();
    const grad = g.createRadialGradient(c, c, c * 0.2, c, c, c * 0.95);
    grad.addColorStop(0, '#e6e9ec'); grad.addColorStop(0.7, '#aeb4ba'); grad.addColorStop(1, '#6f757b');
    g.fillStyle = grad; g.beginPath(); g.arc(c, c, c * 0.94, 0, 6.3); g.fill();
    g.fillStyle = '#1b1e22';
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 + 0.3;
      g.beginPath(); g.moveTo(c + Math.cos(a - 0.5) * c * 0.38, c + Math.sin(a - 0.5) * c * 0.38);
      g.lineTo(c + Math.cos(a - 0.27) * c * 0.9, c + Math.sin(a - 0.27) * c * 0.9);
      g.arc(c, c, c * 0.9, a - 0.27, a + 0.27);
      g.lineTo(c + Math.cos(a + 0.5) * c * 0.38, c + Math.sin(a + 0.5) * c * 0.38);
      g.closePath(); g.fill();
    }
    g.fillStyle = '#d9dde0'; g.beginPath(); g.arc(c, c, c * 0.2, 0, 6.3); g.fill();
    g.fillStyle = '#3a3f44'; g.beginPath(); g.arc(c, c, c * 0.08, 0, 6.3); g.fill();
  });
}
function plateTexture(text) {
  return canvasTex('plate' + text, 256, 56, (g, w, h) => {
    g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1c1c1c'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#1b3f9b'; g.fillRect(6, 6, 30, h - 12);
    g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.fillText('UZ', 21, h / 2 + 4);
    g.fillStyle = '#111'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText(text, w / 2 + 14, h - 14);
  });
}

// Oyna bloki uchun alfa-xarita: oq = kuzov rangi (tom, ustunlar), qora = shaffof (oyna ostida qora shisha ko'rinadi)
function cabAlpha(id, sp) {
  return canvasTex('cab' + id, 1024, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const X = (phi) => ((phi + Math.PI / 2) / (Math.PI * 2)) * w;    // phi = -pi/2 (pastki) -> x=0
    const Y = (v) => (1 - v) * h;                                    // v: 0 = orqa
    g.fillStyle = '#fff';
    const [r0, r1] = sp.roofSkin, c = sp.cab;
    const vr0 = (r0 - c.u0) / (c.u1 - c.u0), vr1 = (r1 - c.u0) / (c.u1 - c.u0);
    // tom
    g.fillRect(X(0.95), Y(vr1), X(Math.PI - 0.95) - X(0.95), Y(vr0) - Y(vr1));
    // yon ustunlar va deraza ostki ramkasi (ikkala tomonda)
    const sides = [[-0.55, 0.95], [Math.PI - 0.95, Math.PI + 0.55]];
    const vb = ((c.u0 + c.u1) / 2 - c.u0) / (c.u1 - c.u0);
    for (const [a0, a1] of sides) {
      const x0 = X(a0), x1 = X(a1);
      g.fillRect(x0, Y(1), x1 - x0, Y(0.95) - Y(1));                      // A-ustun
      g.fillRect(x0, Y(vb + 0.025), x1 - x0, Y(vb - 0.025) - Y(vb + 0.025)); // B-ustun
      g.fillRect(x0, Y(sp.cabC || 0.1), x1 - x0, Y(0) - Y(sp.cabC || 0.1)); // C-ustun
    }
    // deraza ostki ramka
    g.fillRect(X(-0.55), 0, X(-0.12) - X(-0.55), h);
    g.fillRect(X(Math.PI + 0.12), 0, X(Math.PI + 0.55) - X(Math.PI + 0.12), h);
  });
}

// ---------- Materiallar (umumiy) ----------
let shared = null;
function sharedMats() {
  if (shared) return shared;
  shared = {
    glass: new THREE.MeshStandardMaterial({ color: 0x0c1117, roughness: 0.06, metalness: 0.9, envMapIntensity: 1.4 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x121314, roughness: 0.92, metalness: 0 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.55, metalness: 0.1 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.12, metalness: 1, envMapIntensity: 1.6 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xf4f6f8, emissive: 0xfff2d0, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.2 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xff9d1a, emissive: 0xff8a00, emissiveIntensity: 0.5, roughness: 0.3 }),
    seam: new THREE.MeshBasicMaterial({ color: 0x050607 }),
    well: new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.DoubleSide }),
    rim: new THREE.MeshStandardMaterial({ map: rimTexture(), roughness: 0.3, metalness: 0.7, transparent: false }),
    interior: new THREE.MeshStandardMaterial({ color: 0x1c1b19, roughness: 0.9 }),
    flame: new THREE.MeshBasicMaterial({ color: 0x59b8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    flameCore: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    shield: new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  };
  return shared;
}

// Aks ettirish xaritasi (barcha mashina materiallariga qo'llanadi)
let ENV = null;
export function setCarEnv(tex) { ENV = tex; const M = sharedMats(); for (const k of ['glass', 'chrome', 'lamp', 'rim', 'plastic']) { M[k].envMap = tex; M[k].needsUpdate = true; } }

// ---------- Mashina tavsifi ----------
// u: 0 = orqa, 1 = old. top/bot/hw: kuzov (tub) profili; cab: oynalar bloki tom chizig'i
const SPECS = {
  nexia3: {
    L: 4.5, W: 1.78, wheelR: 0.335, axle: 0.315, plate: '01 N 303',
    top: [[0, 0.80], [0.04, 0.93], [0.16, 0.99], [0.3, 0.98], [0.5, 0.96], [0.68, 0.945], [0.84, 0.87], [0.95, 0.78], [1, 0.70]],
    bot: [[0, 0.36], [0.07, 0.27], [0.5, 0.25], [0.93, 0.27], [1, 0.36]],
    hw: [[0, 0.84], [0.1, 0.885], [0.5, 0.89], [0.9, 0.875], [1, 0.83]],
    cab: { u0: 0.14, u1: 0.70, roof: [[0.14, 0.97], [0.22, 1.20], [0.32, 1.42], [0.42, 1.465], [0.53, 1.45], [0.62, 1.30], [0.70, 0.96]], w: 0.78, tumble: 0.34, n: 3.2 },
    roofSkin: [0.3, 0.55],
    head: 'swept', tail: 'sweep', grille: 'twotier', plan: 4,
  },
  nexia2: {
    L: 4.35, W: 1.7, wheelR: 0.31, axle: 0.315, plate: '01 A 777',
    top: [[0, 0.78], [0.04, 0.92], [0.2, 0.96], [0.5, 0.95], [0.7, 0.94], [0.88, 0.88], [0.97, 0.80], [1, 0.75]],
    bot: [[0, 0.36], [0.06, 0.27], [0.5, 0.25], [0.94, 0.27], [1, 0.34]],
    hw: [[0, 0.8], [0.08, 0.84], [0.5, 0.85], [0.92, 0.84], [1, 0.8]],
    cab: { u0: 0.13, u1: 0.71, roof: [[0.13, 0.97], [0.18, 1.30], [0.26, 1.43], [0.45, 1.45], [0.58, 1.41], [0.71, 0.96]], w: 0.8, tumble: 0.3, n: 3.6 },
    roofSkin: [0.28, 0.54],
    head: 'rect', tail: 'rect', grille: 'bars', plan: 5,
  },
  w211: {
    L: 4.85, W: 1.82, wheelR: 0.355, axle: 0.318, plate: '01 E 211',
    top: [[0, 0.84], [0.05, 0.965], [0.2, 1.005], [0.45, 0.985], [0.64, 0.965], [0.8, 0.92], [0.93, 0.86], [1, 0.76]],
    bot: [[0, 0.37], [0.06, 0.27], [0.5, 0.24], [0.94, 0.27], [1, 0.35]],
    hw: [[0, 0.85], [0.1, 0.9], [0.5, 0.91], [0.9, 0.89], [1, 0.84]],
    cab: { u0: 0.1, u1: 0.67, roof: [[0.1, 0.99], [0.18, 1.2], [0.28, 1.39], [0.4, 1.445], [0.52, 1.43], [0.6, 1.31], [0.67, 0.99]], w: 0.76, tumble: 0.36, n: 3.0 },
    roofSkin: [0.26, 0.56],
    head: 'quad', tail: 'sweep', grille: 'oval', plan: 4,
  },
  cobalt: {
    L: 4.5, W: 1.74, wheelR: 0.33, axle: 0.312, plate: '01 K 505',
    top: [[0, 0.9], [0.05, 1.0], [0.2, 1.025], [0.5, 0.975], [0.7, 0.95], [0.85, 0.88], [0.96, 0.8], [1, 0.73]],
    bot: [[0, 0.36], [0.07, 0.27], [0.5, 0.25], [0.93, 0.27], [1, 0.35]],
    hw: [[0, 0.84], [0.1, 0.875], [0.5, 0.87], [0.9, 0.86], [1, 0.82]],
    cab: { u0: 0.15, u1: 0.70, roof: [[0.15, 1.0], [0.22, 1.22], [0.33, 1.43], [0.44, 1.46], [0.54, 1.42], [0.63, 1.28], [0.70, 0.97]], w: 0.77, tumble: 0.33, n: 3.2 },
    roofSkin: [0.3, 0.54],
    head: 'wide', tail: 'wide', grille: 'split', plan: 4,
  },
  matiz: {
    L: 3.65, W: 1.6, wheelR: 0.29, axle: 0.32, plate: '01 M 007',
    top: [[0, 0.8], [0.05, 0.9], [0.2, 0.92], [0.5, 0.93], [0.72, 0.91], [0.86, 0.85], [0.96, 0.77], [1, 0.67]],
    bot: [[0, 0.36], [0.07, 0.27], [0.5, 0.25], [0.93, 0.27], [1, 0.34]],
    hw: [[0, 0.74], [0.1, 0.78], [0.5, 0.8], [0.9, 0.78], [1, 0.74]],
    cab: { u0: 0.05, u1: 0.69, roof: [[0.05, 1.0], [0.08, 1.26], [0.14, 1.5], [0.3, 1.58], [0.5, 1.57], [0.6, 1.44], [0.69, 0.96]], w: 0.8, tumble: 0.26, n: 3.4 },
    roofSkin: [0.16, 0.56],
    head: 'round', tail: 'tall', grille: 'small', plan: 4,
  },
};

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m;
}
function roundedBox(w, h, d, r, mat) {
  // yumaloq qirrali quti (RoundedBoxGeometry'siz): kesimli kapsula
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3), p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    const cx = Math.max(-hx, Math.min(hx, v.x)), cy = Math.max(-hy, Math.min(hy, v.y)), cz = Math.max(-hz, Math.min(hz, v.z));
    const dx = v.x - cx, dy = v.y - cy, dz = v.z - cz, l = Math.hypot(dx, dy, dz) || 1;
    p.setXYZ(i, cx + dx / l * r, cy + dy / l * r, cz + dz / l * r);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

// ---------- Yasash ----------
export function createCar(carId, colorHex) {
  const sp = SPECS[carId], M = sharedMats();
  const L = sp.L, W = sp.W, hw0 = W / 2;
  const root = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.28, metalness: 0.45, envMapIntensity: 1.1, envMap: ENV });
  const brake = new THREE.MeshStandardMaterial({ color: 0xa30000, emissive: 0xff1010, emissiveIntensity: 0.35, roughness: 0.3 });
  const body = new THREE.Group(); root.add(body);       // kuzov (tebranish uchun)
  const fTop = curve(sp.top), fBot = curve(sp.bot), fHw = curve(sp.hw);
  // planformni hisobga olgan yarim kenglik (u: 0 orqa .. 1 old)
  const wAt = (u) => { const t = Math.abs(2 * (u - 0.5)); return fHw(u) * Math.pow(Math.max(0, 1 - Math.pow(t, sp.plan)), 1 / sp.plan); };
  const slopeAt = (u) => Math.atan2(wAt(u - 0.012) - wAt(u + 0.012), 0.024 * L);   // old tomon torayish burchagi (musbat)

  // --- kuzov (tub) ---
  const stations = [];
  const NS = 34;
  for (let i = 0; i <= NS; i++) {
    const u = 0.5 - 0.5 * Math.cos(Math.PI * i / NS);   // chetlarda zichroq
    const z = (u - 0.5) * L;
    const t = Math.abs(2 * z / L);
    const plan = Math.pow(Math.max(0, 1 - Math.pow(t, sp.plan)), 1 / sp.plan);
    stations.push({ z, yb: fBot(u), yt: fTop(u), w: Math.max(0.001, fHw(u) * plan), n: 4.2 });
  }
  const tub = new THREE.Mesh(loftGeometry(stations, 22), paint);
  body.add(tub);

  // --- oynalar bloki ---
  const cab = sp.cab, fRoof = curve(cab.roof);
  const cabSt = [];
  const NC = 28;
  for (let i = 0; i <= NC; i++) {
    const t = 0.5 - 0.5 * Math.cos(Math.PI * i / NC);
    const u = cab.u0 + (cab.u1 - cab.u0) * t;
    const z = (u - 0.5) * L;
    const belt = fTop(u) - 0.05;
    const yt = Math.max(belt + 0.002, fRoof(u));
    const k = Math.min(1, (yt - belt) / 0.06);
    const sEnd = Math.min(1, Math.min(t, 1 - t) / 0.03), close = Math.sqrt(1 - (1 - sEnd) * (1 - sEnd));   // uchlari yopiladi
    cabSt.push({ z, yb: belt, yt, w: Math.max(0.001, fHw(u) * cab.w * (0.35 + 0.65 * Math.sqrt(k)) * close), n: cab.n, tumble: cab.tumble, v: t });
  }
  const glass = new THREE.Mesh(loftGeometry(cabSt, 24, { uv: true, phiStart: -Math.PI / 2 }), M.glass);
  body.add(glass);
  const skinSt = cabSt.map((s2) => ({ ...s2, w: s2.w * 1.006, yt: s2.yt + 0.006, yb: s2.yb }));
  const skinMat = paint.clone(); skinMat.alphaMap = cabAlpha(carId, sp); skinMat.alphaTest = 0.5; skinMat.transparent = false;
  const skin = new THREE.Mesh(loftGeometry(skinSt, 24, { uv: true, phiStart: -Math.PI / 2 }), skinMat);
  skin.userData.noMerge = true; body.add(skin);
  // salon (oynadan ko'rinadi)
  const seatY = 0.78;
  const cabMid = ((cab.u0 + cab.u1) / 2 - 0.5) * L;
  for (const sx of [-0.36, 0.36]) body.add(box(0.42, 0.34, 0.12, M.interior, sx, seatY + 0.28, cabMid - 0.18));
  body.add(box(W * 0.62, 0.05, 1.2, M.interior, 0, seatY, cabMid + 0.02));

  // --- bamperlar, ostki qism ---
  const frontZ = L / 2, rearZ = -L / 2;
  const fb = roundedBox(W * 0.9, 0.17, 0.18, 0.06, M.plastic); fb.position.set(0, 0.45, frontZ - 0.07); body.add(fb);
  const rb = roundedBox(W * 0.9, 0.17, 0.16, 0.06, M.plastic); rb.position.set(0, 0.45, rearZ + 0.06); body.add(rb);
  for (const side of [-1, 1]) {
    const sk = roundedBox(0.06, 0.1, L * 0.52, 0.03, M.plastic); sk.position.set(side * (fHw(0.5) - 0.02), 0.34, 0); body.add(sk);
  }

  // --- grill ---
  const gy = 0.6, gz = frontZ - 0.02;
  if (sp.grille === 'twotier') {
    const g1 = roundedBox(0.78, 0.1, 0.05, 0.02, M.plastic); g1.position.set(0, gy + 0.08, gz); body.add(g1);
    const g2 = roundedBox(0.64, 0.08, 0.05, 0.02, M.plastic); g2.position.set(0, gy - 0.06, gz + 0.01); body.add(g2);
    const c1 = roundedBox(0.84, 0.025, 0.055, 0.01, M.chrome); c1.position.set(0, gy + 0.145, gz); body.add(c1);
    const c2 = roundedBox(0.2, 0.05, 0.06, 0.02, M.chrome); c2.position.set(0, gy + 0.02, gz + 0.02); body.add(c2);
  } else if (sp.grille === 'bars') {
    const g = roundedBox(0.84, 0.2, 0.05, 0.02, M.plastic); g.position.set(0, gy + 0.02, gz); body.add(g);
    for (let i = 0; i < 4; i++) { const b = roundedBox(0.82, 0.02, 0.055, 0.008, M.chrome); b.position.set(0, gy - 0.05 + i * 0.045, gz + 0.005); body.add(b); }
  } else if (sp.grille === 'oval') {
    const g = roundedBox(0.7, 0.24, 0.05, 0.1, M.plastic); g.position.set(0, gy + 0.05, gz); body.add(g);
    const fr = roundedBox(0.76, 0.28, 0.04, 0.12, M.chrome); fr.position.set(0, gy + 0.05, gz - 0.012); body.add(fr);
    for (let i = 0; i < 3; i++) { const b = roundedBox(0.62, 0.018, 0.055, 0.006, M.chrome); b.position.set(0, gy + 0.0 + i * 0.05, gz + 0.012); body.add(b); }
    const em = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), M.chrome); em.position.set(0, gy + 0.2, gz - 0.02); em.rotation.x = -0.25; body.add(em);
  } else if (sp.grille === 'split') {
    for (const sx of [-0.2, 0.2]) { const g = roundedBox(0.34, 0.14, 0.05, 0.03, M.plastic); g.position.set(sx, gy + 0.03, gz); body.add(g); }
    const bar = roundedBox(0.84, 0.03, 0.055, 0.012, M.chrome); bar.position.set(0, gy + 0.1, gz + 0.005); body.add(bar);
    const gold = roundedBox(0.16, 0.05, 0.06, 0.02, new THREE.MeshStandardMaterial({ color: 0xc9a54a, metalness: 1, roughness: 0.25 })); gold.position.set(0, gy + 0.03, gz + 0.015); body.add(gold);
  } else {
    const g = roundedBox(0.42, 0.12, 0.05, 0.03, M.plastic); g.position.set(0, gy + 0.03, gz); body.add(g);
    const c = roundedBox(0.46, 0.02, 0.055, 0.008, M.chrome); c.position.set(0, gy + 0.1, gz); body.add(c);
  }
  // pastki havo olgich
  const vent = roundedBox(W * 0.52, 0.07, 0.05, 0.02, M.plastic); vent.position.set(0, 0.47, frontZ + 0.005); body.add(vent);

  // --- faralar ---
  const uH = 0.945, hy = fTop(uH) - 0.07, hz = (uH - 0.5) * L, hang = slopeAt(uH);
  for (const side of [-1, 1]) {
    const edge = wAt(uH);
    const put = (m, inset, dy = 0, dz = 0) => { m.position.set(side * (edge - inset), hy + dy, hz + dz); m.rotation.y = side * hang; body.add(m); return m; };
    if (sp.head === 'swept') {
      put(roundedBox(0.4, 0.12, 0.17, 0.05, M.lamp), 0.2); put(roundedBox(0.1, 0.045, 0.08, 0.02, M.amber), 0.08, -0.07, -0.03);
    } else if (sp.head === 'rect') {
      put(roundedBox(0.34, 0.16, 0.12, 0.03, M.lamp), 0.2); put(roundedBox(0.12, 0.05, 0.08, 0.015, M.amber), 0.2, -0.12, 0.0);
    } else if (sp.head === 'quad') {
      put(roundedBox(0.2, 0.12, 0.12, 0.05, M.lamp), 0.34); put(roundedBox(0.2, 0.12, 0.12, 0.05, M.lamp), 0.12, 0, -0.02);
      put(roundedBox(0.08, 0.04, 0.07, 0.015, M.amber), 0.1, -0.08, -0.03);
    } else if (sp.head === 'wide') {
      put(roundedBox(0.5, 0.11, 0.14, 0.05, M.lamp), 0.28); put(roundedBox(0.08, 0.04, 0.07, 0.015, M.amber), 0.08, -0.07, -0.02);
    } else {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 14), M.lamp); l.scale.set(1, 0.95, 0.55); put(l, 0.19);
      put(roundedBox(0.07, 0.04, 0.05, 0.012, M.amber), 0.07, -0.1, -0.02);
    }
  }
  // --- orqa chiroqlar (tormoz bilan yonadi) ---
  const uT = 0.055, tz = (uT - 0.5) * L, tang = Math.atan2(wAt(uT + 0.012) - wAt(uT - 0.012), 0.024 * L);
  for (const side of [-1, 1]) {
    const edge = wAt(uT), ty = fTop(uT) - 0.075;
    const put = (m, inset, dy = 0, dz = 0) => { m.position.set(side * (edge - inset), ty + dy, tz + dz); m.rotation.y = -side * tang; body.add(m); return m; };
    if (sp.tail === 'sweep') put(roundedBox(0.34, 0.12, 0.1, 0.04, brake), 0.2);
    else if (sp.tail === 'rect') put(roundedBox(0.3, 0.15, 0.09, 0.03, brake), 0.2);
    else if (sp.tail === 'wide') put(roundedBox(0.5, 0.11, 0.09, 0.04, brake), 0.28);
    else if (sp.tail === 'tall') put(roundedBox(0.14, 0.32, 0.09, 0.05, brake), 0.1, 0.17, 0.1);
  }
  // --- davlat raqami ---
  const plateMat = new THREE.MeshBasicMaterial({ map: plateTexture(sp.plate) });
  const pr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.11), plateMat); pr.position.set(0, 0.62, rearZ - 0.002); pr.rotation.y = Math.PI; body.add(pr);
  const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.11), plateMat); pf.position.set(0, 0.5, frontZ + 0.006); body.add(pf);

  // --- ko'zgular, eshik chiziqlari, tutqichlar ---
  for (const side of [-1, 1]) {
    const um = cab.u1 - 0.02, mx = side * (fHw(um) * cab.w * 0.97 + 0.06), mz = (um - 0.5) * L - 0.12;
    const mirror = roundedBox(0.1, 0.085, 0.15, 0.03, paint); mirror.position.set(mx, fTop(um) + 0.07, mz); mirror.rotation.y = side * 0.2; body.add(mirror);
    const sideX = side * (fHw(0.5) * 0.992);
    for (const uu of [cab.u0 + 0.03, (cab.u0 + cab.u1) / 2, cab.u1 - 0.04]) {
      const seam = box(0.012, 0.42, 0.012, M.seam, sideX, 0.62, (uu - 0.5) * L); body.add(seam);
    }
    for (const uu of [(cab.u0 + cab.u1) / 2 - 0.07, (cab.u0 + cab.u1) / 2 + 0.17]) {
      const hdl = roundedBox(0.03, 0.03, 0.13, 0.01, M.chrome); hdl.position.set(sideX + side * 0.004, 0.86, (uu - 0.5) * L); body.add(hdl);
    }
  }
  // egzoz
  const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10), M.chrome); ex.rotation.x = Math.PI / 2; ex.position.set(side0(hw0), 0.34, rearZ - 0.03); body.add(ex);
  function side0(h) { return h * 0.5; }

  // --- g'ildiraklar ---
  const wheels = [];
  const wr = sp.wheelR, tw = 0.23;
  for (const sz of [1, -1]) {
    for (const sx of [1, -1]) {
      const wx = sx * (fHw(sz > 0 ? 0.8 : 0.2) - 0.095), wz = sz * sp.axle * L;
      const g = new THREE.Group(); g.position.set(wx, wr, wz);
      const spin = new THREE.Group(); g.add(spin);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, tw, 28), M.tire); tire.rotation.z = Math.PI / 2; spin.add(tire);
      const shoulder = new THREE.Mesh(new THREE.TorusGeometry(wr - 0.02, 0.03, 8, 28), M.tire); shoulder.rotation.y = Math.PI / 2; shoulder.position.x = sx * tw / 2; spin.add(shoulder);
      const rim = new THREE.Mesh(new THREE.CircleGeometry(wr * 0.74, 28), M.rim); rim.rotation.y = sx * Math.PI / 2; rim.position.x = sx * (tw / 2 + 0.004); spin.add(rim);
      root.add(g);
      // g'ildirak o'rni (qora) va qanot chetlari
      const well = new THREE.Mesh(new THREE.CircleGeometry(wr + 0.07, 28), M.well); well.rotation.y = sx * Math.PI / 2; well.position.set(wx + sx * (-0.04), wr, wz); root.add(well);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(wr + 0.075, 0.032, 8, 28, Math.PI), paint); lip.rotation.y = Math.PI / 2; lip.position.set(wx + sx * 0.12, wr, wz); root.add(lip);
      wheels.push({ group: g, spin, front: sz > 0, side: sx, r: wr });
    }
  }
  // soyalash uchun alohida guruh (oyna bloki va tom) — kapot kamerasida yashiriladi
  const cabinGroup = new THREE.Group(); cabinGroup.add(glass); cabinGroup.add(skin);
  body.remove(glass); body.remove(skin); body.add(cabinGroup);

  // --- nitro alangasi ---
  const flames = new THREE.Group();
  for (const sx of [side0(hw0)]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1.4, 12, 1, true), M.flame); f.rotation.x = -Math.PI / 2; f.position.set(sx, 0.34, rearZ - 0.75);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.8, 10, 1, true), M.flameCore); c.rotation.x = -Math.PI / 2; c.position.set(sx, 0.34, rearZ - 0.45);
    f.userData.noMerge = c.userData.noMerge = true; flames.add(f, c);
  }
  flames.visible = false; root.add(flames);

  // --- qalqon pufagi ---
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 14), M.shield); shield.scale.set(W * 0.75, 1.05, L * 0.62); shield.position.set(0, 0.8, 0); shield.visible = false; shield.userData.noMerge = true; root.add(shield);

  // faqat kuzov guruhi ichidagi mesh'larni birlashtiramiz
  bakeGroup(body);

  let spinA = 0, bodyRoll = 0, bodyPitch = 0, brakeOn = false;
  const api = {
    root, body, paint, wheels, cabinGroup, flames, shield, spec: sp, brakeMat: brake,
    setColor(hex) { paint.color.set(hex); skinMat.color.set(hex); },
    setBrake(on) { if (on === brakeOn) return; brakeOn = on; brake.emissiveIntensity = on ? 2.2 : 0.35; brake.color.setHex(on ? 0xff2222 : 0xa30000); },
    setNitro(on) { flames.visible = on; if (on) { const k = 0.8 + Math.random() * 0.5; flames.scale.set(1, 1, k); } },
    setShield(on) { shield.visible = on; },
    setCabin(v) { cabinGroup.visible = v; },
    // v: tezlik (m/s), steer: -1..1 (o'ng musbat), roll/pitch ixtiyoriy
    update(v, steer, dt, accel = 0, lat = 0) {
      spinA += v * dt / wr;
      for (const w of wheels) { w.spin.rotation.x = spinA; if (w.front) w.group.rotation.y = -steer * 0.45; }
      // kuzov: burilishda yonga, tezlanishda orqaga/oldinga og'adi
      const tr = THREE.MathUtils.clamp(lat * 0.012, -0.07, 0.07), tp = THREE.MathUtils.clamp(-accel * 0.0025, -0.05, 0.05);
      bodyRoll += (tr - bodyRoll) * Math.min(1, dt * 7); bodyPitch += (tp - bodyPitch) * Math.min(1, dt * 7);
      body.rotation.z = bodyRoll; body.rotation.x = bodyPitch;
    },
  };
  return api;
}

export const CAR_IDS = Object.keys(SPECS);
