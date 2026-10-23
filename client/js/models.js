// Silliq 3D modellar: odam (ismi peshona bog'ichida va orqa yelkasida), qurollar, granatalar, buqa va cho'chqa.
// Hamma narsa kod bilan yaratiladi: kapsula, shar, silindr va yumaloq qirrali qutilar.
import * as THREE from '../vendor/three.module.min.js';
import { COLORS } from '../shared/consts.js';

// ---------------- Yordamchi: tekstura va geometriya ----------------
function tex(size, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function noise(g, S, n, a) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
    g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}
const woodTex = tex(128, (g, S) => {
  g.fillStyle = '#8a5528'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 30; i++) {
    g.strokeStyle = `rgba(${50 + Math.random() * 40},${25 + Math.random() * 20},8,${0.2 + Math.random() * 0.3})`;
    g.lineWidth = 1 + Math.random() * 2; g.beginPath();
    const y = Math.random() * S; g.moveTo(0, y); g.bezierCurveTo(S * 0.3, y + 6, S * 0.6, y - 6, S, y + 3); g.stroke();
  }
  noise(g, S, 300, 0.08);
});
const metalTex = tex(128, (g, S) => {
  g.fillStyle = '#7a8088'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`; g.fillRect(0, Math.random() * S, S, 1); }
  noise(g, S, 400, 0.07);
});
const darkTex = tex(128, (g, S) => {
  g.fillStyle = '#34373c'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(0, Math.random() * S, S, 1); }
  noise(g, S, 500, 0.1);
});
const fabricTex = tex(64, (g, S) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 1;
  for (let i = 0; i < S; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
  noise(g, S, 160, 0.06);
});
const camoTex = tex(128, (g, S) => {
  g.fillStyle = '#5b6045'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    g.fillStyle = ['#3f4430', '#74784f', '#4a3f2a'][i % 3];
    g.beginPath(); g.ellipse(Math.random() * S, Math.random() * S, 8 + Math.random() * 18, 5 + Math.random() * 12, Math.random() * 3, 0, 6.3); g.fill();
  }
  noise(g, S, 200, 0.06);
});

// Gun va kiyim materiallari
const phong = (o) => new THREE.MeshPhongMaterial({ shininess: 38, specular: 0x444444, ...o });
const matDark = phong({ map: darkTex });
const matMetal = phong({ map: metalTex, shininess: 70, specular: 0x777777 });
const matWood = phong({ map: woodTex, shininess: 18, specular: 0x222222 });
const matBlack = phong({ color: 0x17181a, shininess: 25 });
const matBrass = phong({ color: 0xc09a40, shininess: 80, specular: 0x886622 });
const matLens = new THREE.MeshBasicMaterial({ color: 0x77c0ff });
const matSkin = new THREE.MeshLambertMaterial({ color: 0xe0ac86 });
const matSkinD = new THREE.MeshLambertMaterial({ color: 0xcb916b });
const matPants = new THREE.MeshLambertMaterial({ map: camoTex });
const matVest = new THREE.MeshLambertMaterial({ color: 0x3b3f33, map: fabricTex });
const matBoot = new THREE.MeshLambertMaterial({ color: 0x2a1f17 });
const matGlove = new THREE.MeshLambertMaterial({ color: 0x1b1c1e });
const matHair = new THREE.MeshLambertMaterial({ color: 0x1d1510 });
const matSleeve = new THREE.MeshLambertMaterial({ color: 0x4a4f43, map: fabricTex });

const geoCache = new Map();
function geo(key, make) { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; }

// Yumaloq qirrali quti
function roundedBoxGeo(w, h, d, r) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const seg = (L) => Math.max(2, 2 * Math.round(L / (2 * Math.max(r, 0.004))) );
  const g = new THREE.BoxGeometry(w, h, d, Math.min(8, seg(w)), Math.min(8, seg(h)), Math.min(8, seg(d)));
  const p = g.attributes.position, n = g.attributes.normal;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  const v = new THREE.Vector3(), q = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    q.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    dir.copy(v).sub(q);
    if (dir.lengthSq() > 1e-12) { dir.normalize(); v.copy(q).addScaledVector(dir, r); n.setXYZ(i, dir.x, dir.y, dir.z); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}
function rb(w, h, d, x, y, z, mat, r = Math.min(w, h, d) * 0.3, rot) {
  const m = new THREE.Mesh(geo(`rb${w}_${h}_${d}_${r}`, () => roundedBoxGeo(w, h, d, r)), mat);
  m.position.set(x, y, z); if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  return m;
}
// z o'qi bo'ylab silindr (stvol, durbin): uzunligi len, radiusi r
function cz(r, len, x, y, z, mat, seg = 14) {
  const m = new THREE.Mesh(geo(`cz${r}_${len}`, () => new THREE.CylinderGeometry(r, r, len, seg, 1)), mat);
  m.rotation.x = Math.PI / 2; m.position.set(x, y, z); return m;
}
function sph(r, x, y, z, mat, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo(`sph${r}`, () => new THREE.SphereGeometry(r, 18, 14)), mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); return m;
}
function cap(r, len, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo(`cap${r}_${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 14)), mat);
  m.position.set(x, y, z); return m;
}
// ikki nuqta orasidagi kapsula (qo'l/oyoq bo'g'imi)
function limb(a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = Math.max(0.001, A.distanceTo(B) - 2 * r);
  const m = new THREE.Mesh(geo(`cap${r}_${len.toFixed(3)}`, () => new THREE.CapsuleGeometry(r, len, 6, 12)), mat);
  m.position.copy(A).lerp(B, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}


// ---- Optimallashtirish: bir xil materialli qattiq qismlarni bitta mesh'ga birlashtirish (draw call kamayadi) ----
function mergeMeshes(list, mat) {
  let nV = 0, nI = 0;
  for (const m of list) { nV += m.geometry.attributes.position.count; nI += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
  const pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), uv = new Float32Array(nV * 2), idx = new Uint32Array(nI);
  let vo = 0, io = 0;
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const m of list) {
    m.updateMatrix();
    const g = m.geometry, p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    nm.getNormalMatrix(m.matrix);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrix); pos.set([v.x, v.y, v.z], (vo + i) * 3);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (vo + i) * 3);
      if (u) uv.set([u.getX(i), u.getY(i)], (vo + i) * 2);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
    else for (let i = 0; i < p.count; i++) idx[io++] = vo + i;
    vo += p.count;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geom.setIndex(new THREE.BufferAttribute(idx, 1));
  geom.computeBoundingSphere();
  return new THREE.Mesh(geom, mat);
}
export function bakeGroup(group) {
  if (typeof window !== 'undefined' && window.__nobake) return group;
  const byMat = new Map();
  for (const ch of group.children.slice()) {
    if (ch.isMesh && !ch.userData.noMerge) {
      let e = byMat.get(ch.material); if (!e) { e = []; byMat.set(ch.material, e); }
      e.push(ch);
    } else if (ch.children && ch.children.length) bakeGroup(ch);
  }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    for (const m of list) group.remove(m);
    group.add(mergeMeshes(list, mat));
  }
  return group;
}

// ---------------- Qurollar ----------------
// Oldinga qaragan o'q -z, qo'l ushlaydigan joy (0,0,0). Qismlar z oralig'i bilan beriladi (uzilmasdan ulanadi).
const bx = (w, h, z0, z1, y, mat, r, rotX = 0, x = 0) => rb(w, h, Math.abs(z1 - z0), x, y, (z0 + z1) / 2, mat, r ?? Math.min(w, h) * 0.3, [rotX, 0, 0]);
const cy = (r, z0, z1, y, mat, x = 0, seg = 14) => cz(r, Math.abs(z1 - z0), x, y, (z0 + z1) / 2, mat, seg);
export function makeGun(id) {
  const g = new THREE.Group();
  if (id === 'pistol') {
    g.add(bx(0.032, 0.046, -0.2, 0.045, 0.05, matMetal, 0.013));          // sliding
    g.add(bx(0.03, 0.034, -0.17, 0.045, 0.014, matDark, 0.01));            // karkas
    g.add(bx(0.034, 0.11, -0.03, 0.04, -0.03, matDark, 0.014, -0.2));     // dasta
    g.add(bx(0.008, 0.03, -0.075, -0.067, -0.004, matBlack, 0.003));      // tepki himoyasi
    g.add(bx(0.008, 0.01, -0.075, -0.035, -0.02, matBlack, 0.003));
    g.add(cy(0.009, -0.215, -0.2, 0.052, matBlack));                     // stvol uchi
    g.add(bx(0.008, 0.012, -0.195, -0.185, 0.082, matBlack, 0.003));
    g.add(bx(0.022, 0.012, 0.03, 0.04, 0.08, matBlack, 0.003));
    g.userData.muzzle = [0, 0.052, -0.23];
  } else if (id === 'rifle') {
    g.add(bx(0.052, 0.076, -0.3, 0.08, 0.03, matDark, 0.016));            // korpus
    g.add(bx(0.046, 0.024, -0.3, 0.07, 0.072, matMetal, 0.008));          // qopqoq
    g.add(bx(0.042, 0.092, 0.07, 0.36, -0.012, matWood, 0.02, 0.07));     // qundoq
    g.add(bx(0.046, 0.118, 0.355, 0.378, -0.018, matBlack, 0.008, 0.07)); // qundoq plastinasi
    g.add(bx(0.038, 0.11, -0.03, 0.03, -0.04, matWood, 0.016, -0.3));      // dasta
    g.add(bx(0.036, 0.12, -0.21, -0.15, -0.05, matBlack, 0.014, 0.2));     // magazin 1
    g.add(bx(0.036, 0.1, -0.245, -0.185, -0.125, matBlack, 0.014, 0.45)); // magazin 2
    g.add(bx(0.056, 0.075, -0.58, -0.29, 0.02, matWood, 0.02));           // himoya (yog'och)
    g.add(cy(0.0105, -0.98, -0.57, 0.036, matMetal));                      // stvol
    g.add(cy(0.008, -0.78, -0.5, 0.066, matMetal));                        // gaz nayi
    g.add(cy(0.017, -1.0, -0.95, 0.036, matBlack));                        // alanga o'chirgich
    g.add(bx(0.008, 0.045, -0.93, -0.92, 0.075, matBlack, 0.003));         // old mushka
    g.add(bx(0.03, 0.02, -0.06, -0.05, 0.1, matBlack, 0.004));             // orqa mushka
    g.userData.muzzle = [0, 0.04, -1.03];
  } else if (id === 'smg') {
    g.add(bx(0.05, 0.07, -0.28, 0.1, 0.03, matDark, 0.014));
    g.add(bx(0.044, 0.02, -0.28, 0.1, 0.075, matMetal, 0.008));
    g.add(cy(0.022, -0.5, -0.27, 0.034, matDark));                         // qobiq
    g.add(cy(0.026, -0.56, -0.5, 0.034, matBlack));                        // pri'kladka
    g.add(bx(0.03, 0.1, -0.31, -0.25, -0.035, matBlack, 0.012));           // old dasta
    g.add(bx(0.034, 0.18, -0.125, -0.075, -0.085, matBlack, 0.013, 0.1));   // magazin
    g.add(bx(0.04, 0.105, -0.025, 0.03, -0.04, matDark, 0.014, -0.22));      // dasta
    g.add(bx(0.01, 0.012, 0.1, 0.3, 0.03, matMetal, 0.004, 0, 0.022));    // sim qundoq
    g.add(bx(0.01, 0.012, 0.1, 0.3, 0.03, matMetal, 0.004, 0, -0.022));
    g.add(bx(0.052, 0.075, 0.29, 0.315, 0.025, matBlack, 0.008));          // qundoq plastinasi
    g.add(bx(0.008, 0.035, -0.47, -0.46, 0.085, matBlack, 0.003));
    g.userData.muzzle = [0, 0.034, -0.58];
  } else if (id === 'shotgun') {
    g.add(bx(0.052, 0.07, -0.2, 0.13, 0.03, matDark, 0.016));              // korpus
    g.add(cy(0.0175, -0.92, -0.19, 0.04, matMetal));                       // stvol
    g.add(cy(0.0155, -0.82, -0.19, 0.008, matMetal));                      // magazin nayi
    g.add(bx(0.062, 0.05, -0.64, -0.42, 0.006, matWood, 0.02));            // nasos
    g.add(bx(0.045, 0.1, 0.12, 0.43, -0.014, matWood, 0.02, 0.05));        // qundoq
    g.add(bx(0.048, 0.112, 0.425, 0.445, -0.02, matBlack, 0.006, 0.05));
    g.add(bx(0.04, 0.105, -0.03, 0.03, -0.04, matWood, 0.016, -0.25));      // dasta
    g.add(cy(0.021, -0.94, -0.92, 0.04, matBlack));
    g.add(sph(0.007, 0, 0.066, -0.9, matBrass));                           // mushka
    g.add(bx(0.02, 0.012, -0.09, -0.04, 0.03, matBrass, 0.004, 0, 0.034)); // o'q chiqarish darchasi
    g.userData.muzzle = [0, 0.04, -0.96];
  } else {   // sniper
    g.add(bx(0.052, 0.085, -0.38, 0.14, 0.03, matDark, 0.016));            // korpus
    g.add(bx(0.048, 0.1, 0.13, 0.46, -0.014, matWood, 0.02, 0.05));        // qundoq
    g.add(bx(0.04, 0.03, 0.2, 0.42, 0.042, matBlack, 0.01));               // yonoq tayanchi
    g.add(bx(0.05, 0.06, -0.72, -0.37, 0.012, matWood, 0.018));             // himoya
    g.add(cy(0.014, -1.24, -0.71, 0.045, matMetal));                        // stvol
    g.add(cy(0.021, -1.31, -1.23, 0.045, matBlack));                        // tormoz
    g.add(bx(0.04, 0.1, -0.03, 0.03, -0.045, matDark, 0.014, -0.25));        // dasta
    g.add(bx(0.04, 0.06, -0.22, -0.1, -0.045, matBlack, 0.012));            // magazin
    { const bolt = cz(0.006, 0.07, 0.05, 0.05, 0.02, matMetal, 8); bolt.rotation.set(0, 0, Math.PI / 2); g.add(bolt); g.add(sph(0.014, 0.092, 0.05, 0.02, matBlack)); }
    g.add(cy(0.03, -0.3, 0.0, 0.125, matBlack));                            // optika
    g.add(cy(0.04, -0.4, -0.3, 0.125, matBlack));
    g.add(cy(0.035, -0.4, -0.392, 0.125, matLens));
    g.add(cy(0.034, 0.0, 0.07, 0.125, matBlack));
    g.add(bx(0.03, 0.05, -0.12, -0.08, 0.098, matMetal, 0.01));             // tayanchlar
    g.add(bx(0.03, 0.05, -0.28, -0.24, 0.098, matMetal, 0.01));
    for (const sx of [-1, 1]) { const leg = cz(0.006, 0.16, sx * 0.03, -0.03, -0.9, matMetal, 8); leg.rotation.set(0.9, 0, sx * 0.3); g.add(leg); }   // sirpanchiq
    g.userData.muzzle = [0, 0.045, -1.33];
  }
  return bakeGroup(g);
}

// Birinchi shaxs qo'llari: o'ng qo'l (tepki) va chap qo'l (ushlagich), qurol koordinatasida
const FP_HANDS = {
  pistol: { r: [0, -0.045, 0.02], l: [-0.03, -0.085, 0.01] },
  rifle: { r: [0, -0.1, 0.0], l: [0, -0.015, -0.44] },
  smg: { r: [0, -0.085, 0.005], l: [0, -0.1, -0.28] },
  shotgun: { r: [0, -0.09, 0.0], l: [0, -0.015, -0.52] },
  sniper: { r: [0, -0.09, 0.0], l: [0, -0.02, -0.55] },
};
export function makeFpArms(id) {
  const g = new THREE.Group();
  const h = FP_HANDS[id];
  const mkHand = (p, flip) => {
    const hand = rb(0.075, 0.085, 0.11, p[0], p[1], p[2], matGlove, 0.028);
    g.add(hand);
    g.add(sph(0.026, p[0] + (flip ? 0.03 : -0.03), p[1] + 0.03, p[2] - 0.045, matGlove));   // bosh barmoq
  };
  mkHand(h.r, false); mkHand(h.l, true);
  g.add(limb([h.r[0] + 0.01, h.r[1] - 0.02, h.r[2] + 0.07], [0.4, -0.6, 0.55], 0.05, matSleeve));
  g.add(limb([h.l[0] - 0.01, h.l[1] - 0.02, h.l[2] + 0.06], [-0.55, -0.45, 0.35], 0.05, matSleeve));
  return bakeGroup(g);
}

// ---------------- Granatalar ----------------
export function makeGrenade(type) {
  const g = new THREE.Group();
  if (type === 0) {
    g.add(new THREE.Mesh(geo('gfrag', () => new THREE.SphereGeometry(0.05, 16, 12)), phong({ color: 0x4d5a34 })));
    g.add(cz(0.016, 0.03, 0, 0.055, 0, matMetal));
    g.add(rb(0.012, 0.01, 0.05, 0.02, 0.066, 0, matMetal, 0.004));
  } else if (type === 1) {
    g.add(new THREE.Mesh(geo('gsmoke', () => new THREE.CylinderGeometry(0.036, 0.036, 0.13, 14)), phong({ color: 0x8e9499 })));
    { const band = new THREE.Mesh(geo('gsmoke2', () => new THREE.CylinderGeometry(0.037, 0.037, 0.02, 14)), phong({ color: 0x3a8a4a })); band.position.y = 0.02; g.add(band); }
    g.add(rb(0.012, 0.01, 0.05, 0.02, 0.075, 0, matMetal, 0.004));
  } else {
    g.add(new THREE.Mesh(geo('gflash', () => new THREE.CylinderGeometry(0.034, 0.034, 0.12, 14)), phong({ color: 0x3a3f46 })));
    { const band = new THREE.Mesh(geo('gflash2', () => new THREE.CylinderGeometry(0.035, 0.035, 0.025, 14)), phong({ color: 0xf2f2f2 })); band.position.y = 0.015; g.add(band); }
    g.add(rb(0.012, 0.01, 0.05, 0.02, 0.07, 0, matMetal, 0.004));
  }
  return g;
}

// ---------------- Yozuv teksturalari ----------------
export function nameTexture(text, { bg = null, fg = '#fff', stroke = '#000', w = 256, h = 64, bold = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  let fs = h * 0.78;
  g.font = `${bold ? '800' : '500'} ${fs}px system-ui,Arial,sans-serif`;
  while (g.measureText(text).width > w - 14 && fs > 8) { fs -= 2; g.font = `${bold ? '800' : '500'} ${fs}px system-ui,Arial,sans-serif`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (stroke) { g.lineWidth = Math.max(3, h * 0.09); g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(text, w / 2, h / 2 + 2); }
  g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Bosh: sferik, yuz tekstura bilan (yuz -z tomonda, ya'ni u = 0.75)
function faceTexture() {
  const W = 512, Hh = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  g.fillStyle = '#e0ac86'; g.fillRect(0, 0, W, Hh);
  const cx = W * 0.75;
  const gr = g.createRadialGradient(cx, 134, 6, cx, 134, 80);
  gr.addColorStop(0, 'rgba(255,214,184,0.5)'); gr.addColorStop(1, 'rgba(224,172,134,0)');
  g.fillStyle = gr; g.fillRect(cx - 90, 40, 180, 190);
  { const bgd = g.createRadialGradient(cx, 168, 4, cx, 168, 46); bgd.addColorStop(0, 'rgba(70,40,20,0.16)'); bgd.addColorStop(1, 'rgba(70,40,20,0)'); g.fillStyle = bgd; g.fillRect(cx - 60, 120, 120, 100); }   // soqol soyasi
  for (const s of [-1, 1]) {
    const ex = cx + s * 30;
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ex, 118, 13, 8, 0, 0, 6.3); g.fill();
    g.fillStyle = '#4a3220'; g.beginPath(); g.arc(ex + s * -1, 118, 6.5, 0, 6.3); g.fill();
    g.fillStyle = '#0a0a0a'; g.beginPath(); g.arc(ex + s * -1, 118, 3.2, 0, 6.3); g.fill();
    g.fillStyle = '#fff'; g.fillRect(ex + s * -1 - 3, 114, 2, 2);
    g.strokeStyle = '#2a1a10'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath();            // qosh
    g.moveTo(ex - 14, 102 + (s > 0 ? 2 : 0)); g.lineTo(ex + 14, 99 + (s > 0 ? 0 : 3)); g.stroke();
    g.strokeStyle = 'rgba(120,70,40,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(ex, 124, 14, 0.2, 2.9); g.stroke();
  }
  g.fillStyle = 'rgba(150,90,60,0.55)'; g.beginPath(); g.ellipse(cx, 146, 7, 9, 0, 0, 6.3); g.fill();   // burun
  g.fillStyle = 'rgba(100,60,40,0.55)'; g.beginPath(); g.ellipse(cx - 5, 154, 2.5, 2, 0, 0, 6.3); g.ellipse(cx + 5, 154, 2.5, 2, 0, 0, 6.3); g.fill();
  g.strokeStyle = '#7a3a2c'; g.lineWidth = 3.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - 14, 172); g.quadraticCurveTo(cx, 177, cx + 14, 172); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture() });
const GUN_IDS = ['pistol', 'rifle', 'smg', 'shotgun', 'sniper'];


// ---- Qo'l IK: ikki bo'g'imli (yelka-tirsak-qo'l). T: qo'l maqsadi yelka koordinatasida ----
const L1 = 0.30, L2 = 0.335, DOWN = new THREE.Vector3(0, -1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function solveArm(T, side) {
  const u = T.clone(); let d = u.length(); u.normalize();
  d = clamp(d, Math.abs(L1 - L2) + 0.03, L1 + L2 - 0.012);
  const A = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const hint = new THREE.Vector3(side * 0.7, -1, 0.15);
  const p = hint.sub(u.clone().multiplyScalar(hint.dot(u))).normalize();
  const E = u.clone().multiplyScalar(L1 * Math.cos(A)).addScaledVector(p, L1 * Math.sin(A));
  const sh = new THREE.Quaternion().setFromUnitVectors(DOWN, E.clone().normalize());
  const f = u.clone().multiplyScalar(d).sub(E).normalize().applyQuaternion(sh.clone().invert());
  const el = new THREE.Quaternion().setFromUnitVectors(DOWN, f);
  return { sh, el };
}
// uchinchi shaxs: qurolni tutish joyi (aim guruhi koordinatasida) va masshtab
const TPS_HOLD = {
  pistol: { pos: [0.07, -0.12, -0.3], s: 1.0 },
  rifle: { pos: [0.12, -0.1, -0.18], s: 0.85 },
  smg: { pos: [0.1, -0.1, -0.2], s: 0.9 },
  shotgun: { pos: [0.12, -0.1, -0.18], s: 0.85 },
  sniper: { pos: [0.12, -0.1, -0.16], s: 0.8 },
};

// ---------------- Odam ----------------
export function createPlayerModel(id, name) {
  const color = COLORS[id];
  const matBody = new THREE.MeshLambertMaterial({ color, map: fabricTex });
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);

  // oyoqlar: son + boldir (tizza bukiladi), etik
  function makeLeg(x) {
    const hip = new THREE.Group(); hip.position.set(x, 0.82, 0);
    hip.add(cap(0.088, 0.3, matPants, 0, -0.2, 0));
    const knee = new THREE.Group(); knee.position.set(0, -0.4, 0); hip.add(knee);
    knee.add(cap(0.068, 0.28, matPants, 0, -0.19, 0));
    knee.add(sph(0.07, 0, 0, -0.02, matPants));
    knee.add(rb(0.12, 0.13, 0.27, 0, -0.355, -0.04, matBoot, 0.04));
    knee.add(rb(0.125, 0.03, 0.28, 0, -0.395, -0.04, matBlack, 0.01));
    return { hip, knee };
  }
  const L = makeLeg(-0.105), Rg = makeLeg(0.105);
  const legL = L.hip, legR = Rg.hip;
  body.add(legL, legR);

  // tana
  const upper = new THREE.Group(); upper.position.set(0, 0.82, 0); body.add(upper);
  const pelvis = sph(0.15, 0, 0.02, 0, matPants, 1.25, 0.9, 0.95); upper.add(pelvis);
  const belly = cap(0.145, 0.1, matBody, 0, 0.17, 0); belly.scale.set(1.12, 1, 0.8); upper.add(belly);
  const chest = cap(0.19, 0.12, matBody, 0, 0.42, 0); chest.scale.set(1.2, 1, 0.78); upper.add(chest);
  const belt = new THREE.Mesh(geo('belt', () => new THREE.CylinderGeometry(0.17, 0.17, 0.055, 22)), matBlack);
  belt.scale.set(1.14, 1, 0.82); belt.position.y = 0.06; upper.add(belt);
  upper.add(rb(0.05, 0.04, 0.012, 0, 0.06, -0.152, matBrass, 0.008));
  // jilet: old va orqa plastinalar, cho'ntaklar
  upper.add(rb(0.35, 0.27, 0.07, 0, 0.4, -0.125, matVest, 0.032));
  upper.add(rb(0.11, 0.09, 0.05, -0.1, 0.27, -0.16, matVest, 0.02)); upper.add(rb(0.11, 0.09, 0.05, 0.1, 0.27, -0.16, matVest, 0.02));
  upper.add(rb(0.35, 0.18, 0.07, 0, 0.27, 0.125, matVest, 0.032));
  upper.add(sph(0.068, -0.272, 0.6, 0, matVest, 1, 0.8, 1.1)); upper.add(sph(0.068, 0.272, 0.6, 0, matVest, 1, 0.8, 1.1));
  upper.add(cap(0.045, 0.04, matSkinD, 0, 0.68, 0));                       // bo'yin

  // qo'llar: yelka + tirsak (aim guruhi ichida; qurol ushlash uchun IK bilan sozlanadi)
  const aim = new THREE.Group(); aim.position.set(0, 0.6, 0); upper.add(aim);
  function makeArm(x) {
    const a = new THREE.Group(); a.position.set(x, 0, 0);
    a.add(cap(0.058, 0.18, matBody, 0, -0.15, 0));
    const elbow = new THREE.Group(); elbow.position.set(0, -0.3, 0); a.add(elbow);
    elbow.add(sph(0.056, 0, 0, 0, matSleeve));
    elbow.add(cap(0.05, 0.16, matSleeve, 0, -0.15, 0));
    elbow.add(rb(0.075, 0.1, 0.09, 0, -0.335, 0, matGlove, 0.028));
    aim.add(a);
    return { a, elbow };
  }
  const AR = makeArm(0.285), AL = makeArm(-0.285);
  const armR = AR.a, armL = AL.a;

  // bosh (sfera, yuz teksturasi)
  const head = new THREE.Group(); head.position.set(0, 0.815, 0); head.scale.setScalar(1.12); upper.add(head);
  const hm = new THREE.Mesh(geo('head', () => new THREE.SphereGeometry(0.125, 26, 20)), faceMat);
  hm.scale.set(0.94, 1.1, 1.0); head.add(hm);
  const hair = new THREE.Mesh(geo('hair', () => new THREE.SphereGeometry(0.134, 26, 16, 0, Math.PI * 2, 0, 1.72)), matHair);
  hair.scale.set(0.96, 1.1, 1.04); hair.rotation.x = 0.32; head.add(hair);
  head.add(sph(0.026, -0.12, -0.005, 0.0, matSkinD, 0.6, 1.1, 0.9)); head.add(sph(0.026, 0.12, -0.005, 0.0, matSkinD, 0.6, 1.1, 0.9));   // quloqlar

  // PESHONA BOG'ICHI: ism old va orqa tomonda (silindr atrofida)
  const bw = 512, bh = 64;
  const bc = document.createElement('canvas'); bc.width = bw; bc.height = bh;
  const bg = bc.getContext('2d');
  bg.fillStyle = color; bg.fillRect(0, 0, bw, bh);
  bg.fillStyle = 'rgba(0,0,0,0.18)'; bg.fillRect(0, 0, bw, 5); bg.fillRect(0, bh - 5, bw, 5);
  let fs = 46;
  bg.font = `800 ${fs}px system-ui,Arial,sans-serif`;
  while (bg.measureText(name).width > 190 && fs > 10) { fs -= 2; bg.font = `800 ${fs}px system-ui,Arial,sans-serif`; }
  bg.textAlign = 'center'; bg.textBaseline = 'middle'; bg.lineJoin = 'round'; bg.lineWidth = 6; bg.strokeStyle = '#000'; bg.fillStyle = '#fff';
  for (const tx of [0, bw / 2, bw]) { bg.strokeText(name, tx, bh / 2 + 2); bg.fillText(name, tx, bh / 2 + 2); }   // u=0.5: old (-z), u=0/1: orqa (+z)
  const bandTex = new THREE.CanvasTexture(bc); bandTex.colorSpace = THREE.SRGBColorSpace; bandTex.anisotropy = 4;
  const band = new THREE.Mesh(geo('band', () => new THREE.CylinderGeometry(0.139, 0.139, 0.052, 30, 1, true)), new THREE.MeshBasicMaterial({ map: bandTex, side: THREE.DoubleSide }));
  band.scale.set(0.97, 1, 1.03); band.position.y = 0.05; head.add(band);
  const tailMat = new THREE.MeshLambertMaterial({ color });
  head.add(cap(0.014, 0.1, tailMat, 0.03, -0.02, 0.17).rotateX(0.3));          // bog'ich uchlari
  head.add(cap(0.012, 0.08, tailMat, -0.02, -0.04, 0.175).rotateX(0.2));

  // ORQA YELKADA ISM: orqa tomonni egilib o'rab turadi
  const backTex = nameTexture(name, { bg: null, fg: '#fff', stroke: '#000', w: 320, h: 96 });
  const back = new THREE.Mesh(
    geo('backarc', () => new THREE.CylinderGeometry(0.2, 0.2, 0.15, 24, 1, true, -0.95, 1.9)),
    new THREE.MeshBasicMaterial({ map: backTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  back.scale.set(1.225, 1, 0.8); back.position.y = 0.52; upper.add(back);

  // qurol (qo'lda): aim guruhi ichida, qo'llar uni IK bilan ushlaydi
  const holder = new THREE.Group(); aim.add(holder);
  const guns = GUN_IDS.map((gid) => { const g = makeGun(gid); g.visible = false; holder.add(g); return g; });
  const poses = GUN_IDS.map((gid, i) => {
    const P = TPS_HOLD[gid], h = FP_HANDS[gid];
    const at = (o) => new THREE.Vector3(P.pos[0] + o[0] * P.s, P.pos[1] + o[1] * P.s, P.pos[2] + o[2] * P.s);
    const R = solveArm(at(h.r).sub(new THREE.Vector3(0.285, 0, 0)), 1), Lq = solveArm(at(h.l).sub(new THREE.Vector3(-0.285, 0, 0)), -1);
    return { R, L: Lq };
  });

  // soya (oyoq ostida yumshoq dog')
  const api = {
    root, body, upper, aim, legL, legR, armL, armR, head, guns, color, name, w: -1, phase: 0, cr: 0,
    setWeapon(i) {
      if (api.w === i) return; api.w = i;
      guns.forEach((g, k) => { g.visible = k === i; });
      const P = TPS_HOLD[GUN_IDS[i]]; holder.position.set(...P.pos); holder.scale.setScalar(P.s);
      const q = poses[i];
      armR.quaternion.copy(q.R.sh); AR.elbow.quaternion.copy(q.R.el); armL.quaternion.copy(q.L.sh); AL.elbow.quaternion.copy(q.L.el);
    },
    pv: 0,
    applyAim() { const p = clamp(api.pv, -1.2, 1.2); aim.rotation.x = p * 0.9 + 0.3 * api.cr; head.rotation.x = p * 0.7 + 0.2 * api.cr; },
    setPitch(p) { api.pv = p; api.applyAim(); },
    // o'tirish: 0..1 ga silliq o'tadi
    setCrouch(target, dt) {
      api.cr += (target - api.cr) * Math.min(1, dt * 12);
      upper.rotation.x = -0.28 * api.cr;
      upper.position.z = -0.1 * api.cr;
      api.applyAim();
    },
    animate(speed, dt) {
      api.phase += dt * Math.min(speed, 6) * 1.9;
      const moving = speed > 0.3, k = 1 - api.cr;
      const s = moving ? Math.sin(api.phase) * 0.7 * k : 0;
      legL.rotation.x = s - 1.35 * api.cr; legR.rotation.x = -s - 1.35 * api.cr;
      L.knee.rotation.x = (moving ? Math.max(0, -s) * 0.9 * k : 0) + 1.8 * api.cr;
      Rg.knee.rotation.x = (moving ? Math.max(0, s) * 0.9 * k : 0) + 1.8 * api.cr;
      body.position.y = (moving ? Math.abs(Math.sin(api.phase)) * 0.03 * k : 0) - 0.4 * api.cr;
    },
  };
  bakeGroup(root);
  api.setWeapon(1);
  return api;
}

// ---------------- Hayvonlar ----------------
const matBull = new THREE.MeshLambertMaterial({ color: 0x5a3a28 });
const matBullD = new THREE.MeshLambertMaterial({ color: 0x3b2619 });
const matHorn = new THREE.MeshLambertMaterial({ color: 0xf0e6cf });
const matHoof = new THREE.MeshLambertMaterial({ color: 0x1d1612 });
const matPig = new THREE.MeshLambertMaterial({ color: 0xf0a8b4 });
const matPigD = new THREE.MeshLambertMaterial({ color: 0xd98694 });
const matEyeB = new THREE.MeshBasicMaterial({ color: 0x120a06 });
const matEyeAngry = new THREE.MeshBasicMaterial({ color: 0xff2a10 });

function legPair(root, mat, hoof, x, z, r, len, top) {
  const leg = new THREE.Group(); leg.position.set(x, top, z); root.add(leg);
  leg.add(cap(r, len, mat, 0, -(len / 2 + r), 0));
  leg.add(rb(r * 2.1, 0.07, r * 2.4, 0, -(len + r * 2) + 0.02, -0.01, hoof, 0.02));
  return leg;
}

export function createAnimalModel(type) {
  const root = new THREE.Group();
  if (type === 0) {
    // BUQA (uzunligi ~2.1 m, bo'yi 1.5 m)
    const body = cap(0.46, 0.7, matBull, 0, 1.0, 0.05); body.rotation.x = Math.PI / 2; body.scale.set(1, 1, 1.0); root.add(body);
    const hump = sph(0.38, 0, 1.36, -0.45, matBull, 1.05, 0.85, 1.1); root.add(hump);
    const belly = sph(0.3, 0, 0.78, 0.15, matBullD, 1.3, 0.7, 1.9); root.add(belly);
    const neck = cap(0.3, 0.18, matBull, 0, 1.1, -0.82); neck.rotation.x = -1.1; root.add(neck);
    const headG = new THREE.Group(); headG.position.set(0, 1.0, -1.08); root.add(headG);
    headG.add(rb(0.4, 0.4, 0.48, 0, 0, -0.08, matBullD, 0.14));
    headG.add(rb(0.3, 0.26, 0.22, 0, -0.1, -0.36, matBull, 0.1));
    headG.add(sph(0.045, -0.09, -0.12, -0.46, matHoof)); headG.add(sph(0.045, 0.09, -0.12, -0.46, matHoof));
    const ring = new THREE.Mesh(geo('nring', () => new THREE.TorusGeometry(0.05, 0.01, 8, 16)), phong({ color: 0xc9a74a }));
    ring.position.set(0, -0.2, -0.47); headG.add(ring);
    const eyes = [sph(0.03, -0.17, 0.07, -0.26, matEyeB), sph(0.03, 0.17, 0.07, -0.26, matEyeB)]; eyes.forEach((e) => { e.userData.noMerge = true; headG.add(e); });
    for (const s of [-1, 1]) {   // shoxlar: egilgan, uchi oq
      const h1 = new THREE.Mesh(geo('horn1', () => new THREE.ConeGeometry(0.06, 0.42, 12)), matHorn);
      h1.position.set(s * 0.26, 0.22, -0.05); h1.rotation.z = -s * 1.0; h1.rotation.x = -0.35; headG.add(h1);
      const h2 = new THREE.Mesh(geo('horn2', () => new THREE.ConeGeometry(0.035, 0.28, 10)), matHorn);
      h2.position.set(s * 0.47, 0.42, -0.12); h2.rotation.z = -s * 0.25; h2.rotation.x = -0.5; headG.add(h2);
      headG.add(sph(0.06, s * 0.24, 0.08, 0.1, matBullD, 0.6, 1.2, 0.6).translateX(s * 0.14).translateY(0.0));   // quloq
    }
    const legs = [legPair(root, matBull, matHoof, -0.26, -0.55, 0.095, 0.5, 0.78), legPair(root, matBull, matHoof, 0.26, -0.55, 0.095, 0.5, 0.78),
      legPair(root, matBull, matHoof, -0.26, 0.6, 0.1, 0.48, 0.8), legPair(root, matBull, matHoof, 0.26, 0.6, 0.1, 0.48, 0.8)];
    const tail = new THREE.Group(); tail.position.set(0, 1.12, 0.95); root.add(tail);
    tail.add(cap(0.025, 0.5, matBullD, 0, -0.3, 0.05)); tail.add(sph(0.06, 0, -0.62, 0.05, matBullD, 0.8, 1.6, 0.8));
    root.userData = { headG, legs, tail, eyes };
    root.scale.setScalar(1.0);
  } else {
    // CHO'CHQA (uzunligi ~1.1 m, bo'yi 0.7 m)
    const body = cap(0.26, 0.38, matPig, 0, 0.5, 0.02); body.rotation.x = Math.PI / 2; root.add(body);
    const headG = new THREE.Group(); headG.position.set(0, 0.52, -0.52); root.add(headG);
    headG.add(sph(0.2, 0, 0, 0, matPig));
    const snout = new THREE.Mesh(geo('snout', () => new THREE.CylinderGeometry(0.09, 0.1, 0.12, 14)), matPigD);
    snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.04, -0.2); headG.add(snout);
    headG.add(sph(0.014, -0.035, -0.04, -0.265, matEyeB)); headG.add(sph(0.014, 0.035, -0.04, -0.265, matEyeB));
    const eyes = [sph(0.028, -0.115, 0.06, -0.14, matEyeB), sph(0.028, 0.115, 0.06, -0.14, matEyeB)]; eyes.forEach((e) => { e.userData.noMerge = true; headG.add(e); });
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(geo('pear', () => new THREE.ConeGeometry(0.075, 0.15, 3)), matPigD);
      ear.position.set(s * 0.13, 0.17, -0.02); ear.rotation.set(0.5, 0, -s * 0.6); headG.add(ear);
    }
    const legs = [legPair(root, matPig, matHoof, -0.16, -0.3, 0.055, 0.14, 0.3), legPair(root, matPig, matHoof, 0.16, -0.3, 0.055, 0.14, 0.3),
      legPair(root, matPig, matHoof, -0.16, 0.34, 0.058, 0.14, 0.3), legPair(root, matPig, matHoof, 0.16, 0.34, 0.058, 0.14, 0.3)];
    const tail = new THREE.Group(); tail.position.set(0, 0.55, 0.62); root.add(tail);
    const curl = new THREE.Mesh(geo('pcurl', () => new THREE.TorusGeometry(0.05, 0.014, 8, 14, 4.6)), matPigD);
    curl.rotation.y = Math.PI / 2; tail.add(curl);
    root.userData = { headG, legs, tail, eyes };
  }
  bakeGroup(root);
  const u = root.userData;
  u.phase = Math.random() * 6; u.type = type;
  // soya
  // animatsiya: speed (m/s), st (0 turibdi, 1 yuradi, 2 yuguradi/hujum, 3 suzdi), dt
  root.userData.animate = (speed, st, dt, t) => {
    u.phase += dt * Math.min(speed, 8) * (u.type === 0 ? 1.7 : 3.2);
    const sw = (speed > 0.2 ? Math.sin(u.phase) : 0) * (st === 2 ? 0.8 : 0.5);
    u.legs[0].rotation.x = sw; u.legs[3].rotation.x = sw; u.legs[1].rotation.x = -sw; u.legs[2].rotation.x = -sw;
    u.tail.rotation.z = Math.sin(t * (st === 2 ? 9 : 3) + u.phase) * 0.35;
    if (u.type === 0) {
      const lower = st === 2 ? 0.55 : 0, toss = st === 3 ? -0.7 : 0;
      u.headG.rotation.x += ((lower + toss) - u.headG.rotation.x) * Math.min(1, dt * 10);
      u.eyes.forEach((e) => { e.material = st === 2 || st === 3 ? matEyeAngry : matEyeB; });
      root.position.y = (speed > 0.2 ? Math.abs(Math.sin(u.phase)) * 0.03 : 0);
    } else {
      u.headG.rotation.x = Math.sin(t * 4 + u.phase) * 0.05 + (st === 2 ? -0.1 : 0);
      u.headG.rotation.y = speed < 0.2 ? Math.sin(t * 1.3 + u.phase) * 0.25 : 0;
      root.position.y = (speed > 0.2 ? Math.abs(Math.sin(u.phase * 1.2)) * 0.04 : 0);
    }
  };
  return root;
}
