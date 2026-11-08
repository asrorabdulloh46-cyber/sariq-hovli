// Termiz — odamlar: o'zbekcha kiyimdagi past-poligonli, animatsiyali insonlar
import * as THREE from '../../vendor/three.module.min.js';
import { MeshBuilder, addGeom, rng, lin3 } from './util.js';

const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 });
const SKINS = [0xf0c9a0, 0xe6b88a, 0xd9a272, 0xc58b5c, 0xb07a4e, 0xf4d6b4];
const HAIR = [0x16110d, 0x1d1510, 0x2b1d12, 0x3a2a1a, 0x0d0d0d];
const SHIRTS = [0xf2f2ee, 0x5b7fa8, 0x8aa0b4, 0xb8483c, 0x3f7a58, 0xd9c9a0, 0x6e6a8c, 0x2f3e55, 0xc99a3a, 0x9a8f80, 0x3a6e86];
const PANTS = [0x1b1b22, 0x2d3140, 0x3d352c, 0x4a4a52, 0x232a33, 0x5a5144];
const DRESS = [0xb3262e, 0x1f7a5c, 0x1a8bb5, 0x8a2b8f, 0xd08a1e, 0x2d4aa8, 0xc23a6a, 0x3a9a3a];
const SCARF = [0x1b1b1b, 0xf3efe6, 0x8a2b3a, 0x2a3f7a, 0x6a3a8a, 0x1f6a56, 0xc79a3a];

const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
function put(mb, geo, x, y, z, col, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, colorFn = null) {
  _e.set(rx, 0, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  addGeom(mb, geo, _m, col, colorFn);
}
const G = {
  cyl: (r0, r1, h, n = 8) => new THREE.CylinderGeometry(r0, r1, h, n),
  sph: (r, n = 10) => new THREE.SphereGeometry(r, n, Math.max(6, n - 2)),
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
};

/**
 * Inson yasash.
 * o: {seed, kind:'man'|'woman'|'elder'|'child'|'youth', shirt, pants}
 * Guruh ichida: userData.rig = {hipL, hipR, kneeL, kneeR, shL, shR, elL, elR, root}
 */
export function makeHuman(o = {}) {
  const R = rng((o.seed ?? Math.floor(Math.random() * 1e9)) >>> 0);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const kind = o.kind || pick(['man', 'man', 'man', 'youth', 'woman', 'woman', 'elder', 'child']);
  const skin = lin3(o.skin ?? pick(SKINS));
  const hair = lin3(pick(HAIR));
  const shirtC = o.shirt ?? pick(SHIRTS), pantC = o.pants ?? pick(PANTS);
  const shirt = lin3(shirtC), pants = lin3(pantC), shoe = lin3(pick([0x161616, 0x2a1a10, 0x3a3a40, 0x5a5a5a]));
  const female = kind === 'woman';
  const scale = kind === 'child' ? 0.68 : kind === 'youth' ? 0.93 : kind === 'woman' ? 0.95 : 1 + (R() - 0.5) * 0.08;

  const root = new THREE.Group();
  const body = new THREE.Group(); body.scale.setScalar(scale); root.add(body);

  const dressC = lin3(pick(DRESS)), scarfC = lin3(pick(SCARF));
  const robe = kind === 'elder' || (kind === 'man' && R() < 0.14);
  const robeC = lin3(pick([0x2f6a3e, 0x6a2f2f, 0x2f3f6a, 0x7a6a3a, 0x20202a]));
  const jacket = kind === 'man' && !robe && R() < 0.35;
  const jacketC = lin3(pick([0x1e1f26, 0x2a3345, 0x3a332c, 0x40454f]));

  // ── Tana + bosh (bitta mesh) ───────────────────────────────────────────────
  const T = new MeshBuilder();
  const topC = female ? dressC : robe ? robeC : jacket ? jacketC : shirt;
  // gavda
  put(T, G.box(0.36, 0.56, 0.2), 0, 1.2, 0, topC);
  put(T, G.box(0.34, 0.14, 0.2), 0, 0.97, 0, female ? dressC : (robe ? robeC : pants));   // belbog'
  // yelka silliqligi
  put(T, G.cyl(0.075, 0.075, 0.38, 8), 0, 1.44, 0, topC, 1, 1, 1, 0, Math.PI / 2);
  // bo'yin
  put(T, G.cyl(0.045, 0.05, 0.09, 8), 0, 1.54, 0, skin);
  // bosh
  put(T, G.sph(0.105, 12), 0, 1.65, 0, skin, 0.92, 1.12, 1.0);
  put(T, G.sph(0.016, 6), 0, 1.64, 0.105, skin, 1, 1.4, 1.2);             // burun
  put(T, G.sph(0.012, 5), -0.04, 1.675, 0.098, lin3(0x111111)); put(T, G.sph(0.012, 5), 0.04, 1.675, 0.098, lin3(0x111111)); // ko'zlar
  if (female) {
    // ro'mol + uzun ko'ylak
    put(T, G.sph(0.125, 12), 0, 1.665, -0.015, scarfC, 0.98, 1.12, 1.06);
    put(T, G.cyl(0.055, 0.16, 0.5, 10), 0, 1.38, -0.02, scarfC);
    put(T, G.cyl(0.2, 0.34, 0.94, 14), 0, 0.5, 0, dressC);
    put(T, G.sph(0.085, 8), 0, 1.65, 0.075, skin, 1.0, 1.2, 0.6);  // yuz ochiq
  } else {
    put(T, G.sph(0.108, 10), 0, 1.69, -0.012, hair, 0.96, 0.68, 1.0);   // soch
    const hat = (kind === 'elder' || kind === 'man' || kind === 'youth') && R() < (robe ? 0.9 : 0.4);
    if (hat) {
      const dp = lin3(pick([0x0e0e10, 0x0e0e10, 0x1a3a2a]));
      put(T, G.sph(0.112, 12), 0, 1.7, 0, dp, 1, 0.55, 1);
      put(T, G.cyl(0.11, 0.11, 0.028, 12), 0, 1.68, 0, lin3(0xf2f0e8));          // oq naqsh belbog'i
      put(T, G.cyl(0.113, 0.113, 0.02, 12), 0, 1.7, 0, dp);
    }
    if (kind === 'elder' && R() < 0.8) put(T, G.sph(0.09, 8), 0, 1.58, 0.045, lin3(0xe6e3dc), 0.95, 0.8, 0.8);       // soqol
    else if (kind === 'man' && R() < 0.2) put(T, G.sph(0.09, 8), 0, 1.585, 0.05, hair, 0.9, 0.55, 0.7);
  }
  if (robe) {
    // chopon: tizzagacha, yo'l-yo'l
    put(T, G.cyl(0.2, 0.27, 0.78, 14), 0, 0.64, 0, robeC, 1, 1, 1, 0, 0, (i, p) => { const k = Math.floor((Math.atan2(p.x, p.z) + Math.PI) / (Math.PI * 2) * 16) % 2; return k ? robeC : [robeC[0] * 0.55 + 0.1, robeC[1] * 0.55 + 0.08, robeC[2] * 0.55]; });
    put(T, G.cyl(0.215, 0.215, 0.07, 14), 0, 0.98, 0, lin3(0xd8b050));            // belbog'
  } else if (jacket) {
    put(T, G.box(0.38, 0.28, 0.22), 0, 0.96, 0, jacketC);
  }
  const torso = new THREE.Mesh(T.build(), MAT); torso.castShadow = true; body.add(torso);

  // ── Oyoqlar va qo'llar ─────────────────────────────────────────────────────
  const legC = female || robe ? (female ? dressC : robeC) : pants;
  const makeLeg = (sx) => {
    const hip = new THREE.Group(); hip.position.set(sx * 0.1, 0.93, 0); body.add(hip);
    const th = new MeshBuilder(); put(th, G.cyl(0.085, 0.07, 0.46, 8), 0, -0.22, 0, female ? skin : legC);
    const m1 = new THREE.Mesh(th.build(), MAT); m1.castShadow = true; hip.add(m1);
    const knee = new THREE.Group(); knee.position.y = -0.45; hip.add(knee);
    const sh = new MeshBuilder();
    put(sh, G.cyl(0.07, 0.052, 0.44, 8), 0, -0.22, 0, female ? skin : legC);
    put(sh, G.box(0.1, 0.07, 0.25), 0, -0.455, 0.05, shoe);
    const m2 = new THREE.Mesh(sh.build(), MAT); m2.castShadow = true; knee.add(m2);
    return { hip, knee };
  };
  const makeArm = (sx) => {
    const sho = new THREE.Group(); sho.position.set(sx * 0.225, 1.43, 0); body.add(sho);
    const ua = new MeshBuilder(); put(ua, G.cyl(0.058, 0.05, 0.3, 8), 0, -0.14, 0, (jacket || robe || kind !== 'woman') ? topC : skin);
    put(ua, G.sph(0.06, 8), 0, 0.0, 0, topC);
    const m1 = new THREE.Mesh(ua.build(), MAT); m1.castShadow = true; sho.add(m1);
    const el = new THREE.Group(); el.position.y = -0.29; sho.add(el);
    const fa = new MeshBuilder(); put(fa, G.cyl(0.05, 0.04, 0.26, 8), 0, -0.13, 0, (jacket || robe || kind !== 'woman') ? topC : skin);
    put(fa, G.sph(0.045, 8), 0, -0.29, 0, skin);
    const m2 = new THREE.Mesh(fa.build(), MAT); m2.castShadow = true; el.add(m2);
    return { sho, el };
  };
  const L = makeLeg(-1), Rr = makeLeg(1), AL = makeArm(-1), AR = makeArm(1);
  root.userData.rig = { hipL: L.hip, kneeL: L.knee, hipR: Rr.hip, kneeR: Rr.knee, shL: AL.sho, elL: AL.el, shR: AR.sho, elR: AR.el, body };
  root.userData.phase = R() * 6.28;
  root.userData.kind = kind;
  root.userData.scale = scale;
  root.userData.fall = 0;
  root.userData.holdGun = false;
  return root;
}

// Qurol modeli (o'ng qo'lga)
let _gunGeo = null;
export function gunMesh() {
  if (!_gunGeo) {
    const mb = new MeshBuilder();
    put(mb, G.box(0.05, 0.13, 0.24), 0, 0.0, 0.1, lin3(0x2a2a2e));
    put(mb, G.box(0.05, 0.16, 0.06), 0, -0.1, 0.02, lin3(0x1a1a1c));
    _gunGeo = mb.build();
  }
  const m = new THREE.Mesh(_gunGeo, MAT); m.castShadow = true; return m;
}

// Yurish animatsiyasi. speed — m/s; dt — soniya
export function animateHuman(g, dt, speed, opt = {}) {
  const u = g.userData, r = u.rig; if (!r) return;
  const fall = u.fall || 0;
  if (fall > 0) {                                       // yiqilgan
    const k = Math.min(1, fall);
    g.rotation.x = -Math.PI / 2 * k; r.body.position.y = 0.0;
    g.position.y = 0.14 * k;
    r.hipL.rotation.x = r.hipR.rotation.x = 0.2; r.kneeL.rotation.x = r.kneeR.rotation.x = 0.2;
    r.shL.rotation.z = -0.6; r.shR.rotation.z = 0.6;
    return;
  }
  g.rotation.x = 0;
  const run = opt.run ? 1 : 0;
  const sp = Math.min(speed, 9);
  u.phase += dt * sp * (4.4 - run * 1.6);
  const amp = Math.min(1, sp / 1.6) * (0.5 + run * 0.45);
  const p = u.phase, s1 = Math.sin(p), s2 = Math.sin(p + Math.PI);
  r.hipL.rotation.x = -s1 * amp * 0.95; r.hipR.rotation.x = -s2 * amp * 0.95;
  r.kneeL.rotation.x = Math.max(0, Math.sin(p - 1.1)) * amp * 1.5 + run * 0.12;
  r.kneeR.rotation.x = Math.max(0, Math.sin(p + Math.PI - 1.1)) * amp * 1.5 + run * 0.12;
  const aamp = amp * (0.8 + run * 0.3);
  if (u.holdGun) {
    r.shR.rotation.x = -1.35; r.elR.rotation.x = -0.15; r.shR.rotation.z = -0.05;
    r.shL.rotation.x = -s2 * aamp * 0.5; r.elL.rotation.x = -0.25 - Math.abs(s2) * 0.3 * aamp;
  } else {
    r.shL.rotation.x = s1 * aamp * 0.8; r.shR.rotation.x = s2 * aamp * 0.8;
    r.elL.rotation.x = -0.2 - Math.max(0, s1) * aamp * 0.7 - run * 0.8; r.elR.rotation.x = -0.2 - Math.max(0, s2) * aamp * 0.7 - run * 0.8;
    r.shL.rotation.z = 0.05; r.shR.rotation.z = -0.05;
  }
  // nafas olish / yurishda tana tebranishi
  const bob = Math.abs(Math.cos(p)) * 0.035 * Math.min(1, sp / 1.6) * (1 + run * 0.6);
  r.body.position.y = bob + Math.sin(performance.now() / 900 + p) * 0.004 * (1 - Math.min(1, sp));
  r.body.rotation.x = run * 0.12 * Math.min(1, sp / 6);
}
