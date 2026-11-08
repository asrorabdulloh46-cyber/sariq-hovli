// Termiz — Mashinalar: fizika + sifatli past-poligonli modellar (profil ekstruziyasi, g'ildirak, chiroq, davlat raqami)
import * as THREE from '../../vendor/three.module.min.js';

// ── Fizika ───────────────────────────────────────────────────────────────────
export const PHYS = {
  VMAX: 50, ACC: 17, BRAKE: 34, YAW: 1.55, DRAG: 0.9, SLIP: 0.012, HANDBRAKE_DRAG: 4,
};

export function newCar(x, z, h = 0, modelId = 'sedan') {
  return { x, z, h, vx: 0, vz: 0, yawRate: 0, onGround: true, modelId, color: 0xffffff, gear: 0 };
}

// h — burilish: oldinga (sin h, cos h). h ortsa — chapga buriladi, shuning uchun o'ngga rul (steer>0) h ni kamaytiradi.
export function stepCar(c, inp, dt) {
  const { VMAX, ACC, BRAKE, YAW, DRAG, SLIP, HANDBRAKE_DRAG } = PHYS;
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  const speed = c.vx * fx + c.vz * fz;
  const signS = speed >= -0.3 ? 1 : -1;
  let accel = 0;
  if (inp.gas > 0) accel = ACC * inp.gas * (1 - Math.max(0, speed) / (VMAX * 1.05));
  if (inp.brake > 0) {
    if (speed > 0.8) accel = -BRAKE * inp.brake;
    else accel = -ACC * 0.55 * inp.brake;          // orqaga yurish
  }
  if (!inp.gas && !inp.brake) accel = -DRAG * speed - Math.sign(speed) * 0.6;
  let ns = speed + accel * dt;
  if (!inp.gas && !inp.brake && Math.abs(ns) < 0.25) ns = 0;
  const newSpeed = Math.min(VMAX, Math.max(-VMAX * 0.3, ns));

  const grip = Math.min(1, Math.abs(speed) / 3.5);
  const hi = 1 / (1 + Math.abs(speed) / 22);                 // tez yurganda rul sezgirligi kamayadi
  const targetYaw = -inp.steer * YAW * grip * signS * (0.55 + 0.45 * hi);
  c.yawRate += (targetYaw - c.yawRate) * Math.min(1, dt * 8);
  if (inp.handbrake) c.yawRate *= 1 + HANDBRAKE_DRAG * dt;
  c.h += c.yawRate * dt;

  // yon tomonga sirpanish (yangi yo'nalishga nisbatan)
  const nfx = Math.sin(c.h), nfz = Math.cos(c.h);
  const rx = -nfz, rz = nfx;                                  // o'ng vektor (ekranda)
  const lat = c.vx * rx + c.vz * rz;
  const keep = inp.handbrake ? 0.55 : Math.max(0, 1 - 7 * dt);
  c.vx = nfx * newSpeed + rx * lat * keep;
  c.vz = nfz * newSpeed + rz * lat * keep;
  c.x += c.vx * dt; c.z += c.vz * dt;
}

// ── Modellar ─────────────────────────────────────────────────────────────────
// l — uzunlik, w — eni, h — balandligi; prof — kuzov shakli
const CAR_SPECS = {
  nexia:   { l: 4.35, w: 1.68, h: 1.42, name: 'Nexia',    prof: 'sedan', wr: 0.30 },
  cobalt:  { l: 4.50, w: 1.72, h: 1.48, name: 'Cobalt',   prof: 'sedan', wr: 0.31 },
  lacetti: { l: 4.50, w: 1.72, h: 1.46, name: 'Lacetti',  prof: 'sedan', wr: 0.31 },
  malibu:  { l: 4.85, w: 1.86, h: 1.46, name: 'Malibu',   prof: 'sedan', wr: 0.33 },
  damas:   { l: 3.25, w: 1.42, h: 1.80, name: 'Damas',    prof: 'van',   wr: 0.26 },
  matiz:   { l: 3.50, w: 1.50, h: 1.50, name: 'Matiz',    prof: 'hatch', wr: 0.26 },
  sedan:   { l: 4.60, w: 1.80, h: 1.45, name: 'Sedan',    prof: 'sedan', wr: 0.32 },
  suv:     { l: 4.90, w: 1.95, h: 1.75, name: 'SUV',      prof: 'suv',   wr: 0.38 },
  truck:   { l: 5.50, w: 2.00, h: 1.95, name: 'Yuk mashina', prof: 'van', wr: 0.38 },
  van:     { l: 4.80, w: 1.90, h: 1.88, name: 'Mikroavtobus', prof: 'van', wr: 0.34 },
  police:  { l: 4.60, w: 1.80, h: 1.48, name: 'Politsiya', prof: 'sedan', wr: 0.32 },
};
export const CAR_IDS = Object.keys(CAR_SPECS);
export const CHEVROLET_IDS = ['nexia', 'cobalt', 'lacetti', 'malibu', 'damas', 'matiz'];

// Normallashtirilgan profillar: kuzov (pastki qism) va kabina (to'rt burchak)
// u: -0.5 (orqa) .. 0.5 (old), v: 0..1 (balandlik)
const PROF = {
  sedan: { low: [[-0.495, 0.17], [-0.5, 0.27], [-0.5, 0.52], [-0.45, 0.58], [-0.30, 0.60], [0.26, 0.61], [0.40, 0.57], [0.49, 0.47], [0.5, 0.32], [0.485, 0.17]], cab: [[-0.30, 0.58], [-0.185, 1.0], [0.07, 1.0], [0.27, 0.59]], wb: [0.30, 0.30] },
  hatch: { low: [[-0.495, 0.17], [-0.5, 0.30], [-0.5, 0.62], [-0.46, 0.64], [0.28, 0.62], [0.41, 0.56], [0.49, 0.45], [0.5, 0.30], [0.485, 0.17]], cab: [[-0.45, 0.62], [-0.38, 1.0], [0.06, 1.0], [0.26, 0.62]], wb: [0.30, 0.30] },
  suv:   { low: [[-0.495, 0.18], [-0.5, 0.30], [-0.5, 0.64], [-0.44, 0.67], [0.30, 0.66], [0.43, 0.62], [0.5, 0.50], [0.5, 0.32], [0.485, 0.18]], cab: [[-0.46, 0.65], [-0.43, 1.0], [0.12, 1.0], [0.30, 0.66]], wb: [0.32, 0.30] },
  van:   { low: [[-0.495, 0.18], [-0.5, 0.30], [-0.5, 0.72], [0.28, 0.70], [0.40, 0.62], [0.5, 0.50], [0.5, 0.32], [0.485, 0.18]], cab: [[-0.5, 0.70], [-0.495, 1.0], [0.20, 1.0], [0.34, 0.68]], wb: [0.31, 0.29] },
};

// ── Umumiy materiallar ───────────────────────────────────────────────────────
const MAT = {
  glass: new THREE.MeshStandardMaterial({ color: 0x0c141c, roughness: 0.06, metalness: 0.85 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xbfc3c8, roughness: 0.28, metalness: 0.9 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.7 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd0d4d8, roughness: 0.2, metalness: 1 }),
  head: new THREE.MeshStandardMaterial({ color: 0xf6f2e0, emissive: 0xfff2c0, emissiveIntensity: 0.15, roughness: 0.2 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x8a0f0f, emissive: 0xff1a10, emissiveIntensity: 0.25, roughness: 0.3 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.45, metalness: 0.2 }),
  beam: null,
};
const PAINT = new Map();
function paint(color) {
  let m = PAINT.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.34, metalness: 0.55, envMapIntensity: 1.1 }); PAINT.set(color, m); }
  return m;
}
function glowTex() {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const c = cv.getContext('2d'); const g = c.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,240,200,0.9)'); g.addColorStop(1, 'rgba(255,240,200,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 128);
  const gx = c.createLinearGradient(0, 0, 64, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
  c.globalCompositeOperation = 'destination-out'; c.fillStyle = gx; c.fillRect(0, 0, 64, 128);
  return new THREE.CanvasTexture(cv);
}
MAT.beam = new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, side: THREE.DoubleSide });
export function setCarNight(n) {
  MAT.head.emissiveIntensity = 0.15 + n * 2.2;
  MAT.tail.emissiveIntensity = 0.25 + n * 0.9;
  MAT.beam.opacity = n * 0.55;
}

// Davlat raqami (O'zbekiston): ko'k 'UZ' + "01 A 777 AA"
const PLATES = [];
function plate(i) {
  if (PLATES[i]) return PLATES[i];
  const letters = 'ABCDEKLMNPRSTXY';
  const num = ['01', '10', '30', '40', '60', '70', '75', '80'][i % 8] + ' ' + letters[(i * 7) % letters.length] + ' ' + String(100 + (i * 137) % 900) + ' ' + letters[(i * 3) % letters.length] + letters[(i * 5 + 1) % letters.length];
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = '#f4f4f0'; c.fillRect(0, 0, 256, 64);
  c.strokeStyle = '#111'; c.lineWidth = 4; c.strokeRect(2, 2, 252, 60);
  c.fillStyle = '#1b4fa0'; c.fillRect(6, 6, 38, 52);
  c.fillStyle = '#fff'; c.font = 'bold 18px sans-serif'; c.textAlign = 'center'; c.fillText('UZ', 25, 40);
  c.fillStyle = '#111'; c.font = 'bold 34px monospace'; c.fillText(num, 150, 45);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  PLATES[i] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
  return PLATES[i];
}

// ── Geometriya kesh ─────────────────────────────────────────────────────────
const GEO = {};
const _M = new THREE.Matrix4();
function toCar(geom, halfDepth) {   // shakl (x_s,y_s,z_s) → mashina (x=-z_s+d/2, y, z=x_s)
  _M.set(0, 0, -1, halfDepth, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
  geom.applyMatrix4(_M); geom.computeVertexNormals(); return geom;
}
function extrude(pts, width, bevel = 0.05) {
  const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
  const d = Math.max(0.05, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 2, curveSegments: 6 });
  return toCar(g, d / 2);
}
function buildGeos(id) {
  if (GEO[id]) return GEO[id];
  const s = CAR_SPECS[id] || CAR_SPECS.sedan, P = PROF[s.prof];
  const { l, w, h } = s;
  const pt = ([u, v]) => [u * l, v * h];
  // Kuzov: yuqori chiziq (orqa→old), pastki chiziq old→orqa (g'ildirak kamarlari bilan)
  const top = P.low.slice(0, P.low.length - 1).map(pt);
  const bottomFront = pt(P.low[P.low.length - 1]);
  const zf = l * P.wb[0], zr = -l * P.wb[1], ra = s.wr + 0.09, gy = 0.17 * h;
  const wheelArch = (zc) => { const a = []; for (let i = 0; i <= 10; i++) { const z = zc + ra - 2 * ra * i / 10; a.push([z, gy + Math.sqrt(Math.max(0, ra * ra - (z - zc) * (z - zc)))]); } return a; };
  const poly = [...top, bottomFront, ...wheelArch(zf), ...wheelArch(zr)];
  const body = extrude(poly, w * 0.93, 0.06);
  const c = P.cab.map(pt);
  const cabG = extrude(c, w * 0.86, 0.035);
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const reg = (s0, s1, t0, t1) => {
    const Pt = (ss, tt) => lerp2(lerp2(c[0], c[3], ss), lerp2(c[1], c[2], ss), tt);
    return [Pt(s0, t0), Pt(s1, t0), Pt(s1, t1), Pt(s0, t1)];
  };
  const pil = [];
  pil.push(extrude(reg(0.0, 0.16, 0.0, 1.0), w * 0.9, 0.03));                  // C ustun
  pil.push(extrude(reg(0.47, 0.53, 0.0, 1.0), w * 0.9, 0.03));                 // B ustun
  pil.push(extrude(reg(0.93, 1.0, 0.0, 1.0), w * 0.9, 0.03));                  // A ustun
  pil.push(extrude(reg(0.0, 1.0, 0.9, 1.0), w * 0.9, 0.04));                   // tom
  GEO[id] = { body, cab: cabG, pil, s, zf, zr };
  return GEO[id];
}

const wheelGeos = {};
function wheelGeo(r, wd) {
  const k = r.toFixed(2) + wd.toFixed(2);
  if (wheelGeos[k]) return wheelGeos[k];
  const tire = new THREE.CylinderGeometry(r, r, wd, 18).rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(r * 0.64, r * 0.64, wd * 1.03, 12).rotateZ(Math.PI / 2);
  // 5 ta spitsa (ko'rinish)
  const hub = new THREE.CylinderGeometry(r * 0.2, r * 0.2, wd * 1.1, 8).rotateZ(Math.PI / 2);
  return (wheelGeos[k] = { tire, rim, hub });
}
const boxG = new THREE.BoxGeometry(1, 1, 1);
const planeG = new THREE.PlaneGeometry(1, 1);

function makeCarBody(id, color) {
  const G = buildGeos(id), s = G.s;
  const { l, w, h } = s;
  const group = new THREE.Group();
  const isPolice = id === 'police';
  const pmat = paint(isPolice ? 0xf2f4f8 : color);
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; group.add(m); return m; };
  add(G.body, pmat, 0, 0, 0);
  add(G.cab, MAT.glass, 0, 0, 0);
  for (const p of G.pil) add(p, pmat, 0, 0, 0);

  const bx = (mat, sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(boxG, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); group.add(m); return m; };
  const P = PROF[s.prof];
  const frontZ = l / 2, rearZ = -l / 2;
  // Bamperlar, panjara, faralar
  bx(MAT.trim, w * 0.97, 0.16, 0.12, 0, 0.30, frontZ - 0.02);
  bx(MAT.trim, w * 0.97, 0.16, 0.12, 0, 0.30, rearZ + 0.02);
  bx(MAT.trim, w * 0.5, 0.12 * h, 0.05, 0, h * 0.44, frontZ + 0.01);            // panjara
  for (const sx of [-1, 1]) {
    bx(MAT.head, w * 0.2, 0.1, 0.06, sx * w * 0.36, h * 0.46, frontZ + 0.02);
    bx(MAT.tail, w * 0.2, 0.1, 0.06, sx * w * 0.38, h * 0.50, rearZ - 0.02);
    // ko'zgular
    bx(pmat, 0.16, 0.1, 0.1, sx * (w * 0.5 + 0.04), h * 0.64, l * (P.cab[3][0] - 0.05));
    // eshik tutqichlari
    bx(MAT.chrome, 0.03, 0.03, 0.14, sx * (w * 0.49), h * 0.55, -l * 0.02);
  }
  // Davlat raqamlari
  const pi = Math.abs(Math.floor(color * 7 + l * 31)) % 6;
  const pf = new THREE.Mesh(planeG, plate(pi)); pf.scale.set(0.5, 0.125, 1); pf.position.set(0, 0.42, frontZ + 0.035); group.add(pf);
  const pr = new THREE.Mesh(planeG, plate(pi + 3)); pr.scale.set(0.5, 0.125, 1); pr.rotation.y = Math.PI; pr.position.set(0, 0.46, rearZ - 0.035); group.add(pr);

  // G'ildiraklar
  const wr = s.wr, wd = 0.22;
  const wg = wheelGeo(wr, wd);
  const wheels = [];
  for (const [zc, front] of [[G.zf, true], [G.zr, false]]) for (const sx of [-1, 1]) {
    const steer = new THREE.Group(); steer.position.set(sx * (w / 2 - wd * 0.42), wr, zc);
    const spin = new THREE.Group(); steer.add(spin);
    spin.add(new THREE.Mesh(wg.tire, MAT.tire), new THREE.Mesh(wg.rim, MAT.rim), new THREE.Mesh(wg.hub, MAT.chrome));
    group.add(steer); wheels.push({ steer, spin, front });
  }
  // Fara nuri (tunda yerda yorug' dog')
  const beam = new THREE.Mesh(planeG, MAT.beam); beam.rotation.x = -Math.PI / 2; beam.scale.set(w * 2.4, 16, 1); beam.position.set(0, 0.12, frontZ + 8.5);
  beam.renderOrder = 3; group.add(beam);

  // Politsiya: ko'k chiziq + mayoq
  if (isPolice) {
    const blue = new THREE.MeshStandardMaterial({ color: 0x1b3f9e, roughness: 0.4 });
    for (const sx of [-1, 1]) bx(blue, 0.02, h * 0.14, l * 0.62, sx * (w / 2 + 0.035), h * 0.42, -l * 0.02);
    bx(MAT.trim, w * 0.7, 0.07, 0.34, 0, h + 0.07, -l * 0.04);
    const red = new THREE.MeshBasicMaterial({ color: 0xff2200 }), bl = new THREE.MeshBasicMaterial({ color: 0x1144ff });
    bx(red, w * 0.32, 0.1, 0.3, -w * 0.18, h + 0.13, -l * 0.04); bx(bl, w * 0.32, 0.1, 0.3, w * 0.18, h + 0.13, -l * 0.04);
    group.userData.siren = [red, bl];
  }
  group.userData.wheels = wheels;
  group.userData.wr = wr;
  group.userData.spec = s;
  group.userData.yaw = 0;
  return group;
}

export function createCar(modelId, colorHex = 0xffffff) {
  return makeCarBody(CAR_SPECS[modelId] ? modelId : 'sedan', colorHex);
}
export function getCarSpec(modelId) { return CAR_SPECS[modelId] || CAR_SPECS.sedan; }

// g'ildirak aylanishi, rul, mayoq
export function animateCar(group, dt, speed, steer = 0, time = 0) {
  const u = group.userData; if (!u.wheels) return;
  u.yaw += (-steer * 0.5 - u.yaw) * Math.min(1, dt * 10);
  for (const w of u.wheels) {
    w.spin.rotation.x += speed * dt / u.wr;
    if (w.front) w.steer.rotation.y = u.yaw;
  }
  if (u.siren) {
    const on = Math.sin(time * 14) > 0;
    u.siren[0].color.setHex(on ? 0xff2200 : 0x330500);
    u.siren[1].color.setHex(on ? 0x061040 : 0x1a55ff);
  }
}

// ── Tasodifiy transport ──────────────────────────────────────────────────────
const TRAFFIC_COLORS = [0xf2f2f2, 0xf2f2f2, 0xcfd3d6, 0x2a2e33, 0x1a1a1c, 0x8c1c1c, 0x1c4a8c, 0x6f7479, 0x0f6a3a, 0xe3c34a, 0xa6682a];
export function randomTrafficCar(rng) {
  const pool = ['nexia', 'nexia', 'cobalt', 'cobalt', 'lacetti', 'lacetti', 'malibu', 'damas', 'damas', 'matiz', 'sedan', 'suv', 'van'];
  const id = pool[Math.floor(rng() * pool.length)];
  const color = TRAFFIC_COLORS[Math.floor(rng() * TRAFFIC_COLORS.length)];
  return { id, color };
}

export const PLAYER_COLORS = [
  0xd01c1c, 0x1d5fd0, 0x14914a, 0xe6b800, 0x7a1fcf, 0xe0600a, 0x20b8d8, 0xf0f0f0, 0x1c1c1c,
];
