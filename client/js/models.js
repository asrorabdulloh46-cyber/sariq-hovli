// O'yinchi modeli (ismi peshona bog'ichida va orqa yelkasida yozilgan) va qurol modellari
import * as THREE from '../vendor/three.module.min.js';
import { COLORS } from '../shared/consts.js';

const matDark = new THREE.MeshLambertMaterial({ color: 0x2b2d31 });
const matMetal = new THREE.MeshLambertMaterial({ color: 0x5a5f66 });
const matWood = new THREE.MeshLambertMaterial({ color: 0x7a4b22 });
const matSkin = new THREE.MeshLambertMaterial({ color: 0xe0ac86 });
const matPants = new THREE.MeshLambertMaterial({ color: 0x3b3f4a });
const matHair = new THREE.MeshLambertMaterial({ color: 0x1d1510 });
const matEye = new THREE.MeshBasicMaterial({ color: 0x111111 });
const geoBox = new THREE.BoxGeometry(1, 1, 1);

function bx(w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(geoBox, mat); m.scale.set(w, h, d); m.position.set(x, y, z); return m;
}

// Qurol: oldinga qaragan o'q -z, qo'l ushlaydigan joy (0,0,0)
export function makeGun(id) {
  const g = new THREE.Group();
  if (id === 'pistol') {
    g.add(bx(0.045, 0.06, 0.22, 0, 0.03, -0.09, matMetal));
    g.add(bx(0.04, 0.1, 0.05, 0, -0.035, 0.0, matDark));
    g.add(bx(0.02, 0.02, 0.05, 0, 0.03, -0.215, matDark));
    g.userData.muzzle = [0, 0.03, -0.25];
  } else if (id === 'rifle') {
    g.add(bx(0.06, 0.09, 0.5, 0, 0.03, -0.2, matDark));
    g.add(bx(0.05, 0.08, 0.2, 0, 0.0, 0.2, matWood));          // qo'ndoq
    g.add(bx(0.045, 0.15, 0.07, 0, -0.1, -0.12, matMetal));    // magazin
    g.add(bx(0.055, 0.06, 0.22, 0, -0.005, -0.5, matWood));    // tutqich
    g.add(bx(0.022, 0.022, 0.25, 0, 0.04, -0.7, matMetal));   // stvol
    g.add(bx(0.03, 0.03, 0.04, 0, 0.09, -0.12, matDark));      // mo'ljal
    g.userData.muzzle = [0, 0.04, -0.84];
  } else {
    g.add(bx(0.06, 0.1, 0.5, 0, 0.03, -0.15, matDark));
    g.add(bx(0.05, 0.1, 0.24, 0, -0.01, 0.25, matWood));
    g.add(bx(0.028, 0.028, 0.7, 0, 0.045, -0.7, matMetal));
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 10), matDark);
    sc.rotation.x = Math.PI / 2; sc.position.set(0, 0.13, -0.12); g.add(sc);
    g.add(bx(0.045, 0.045, 0.04, 0, 0.13, -0.26, matMetal));
    g.add(bx(0.04, 0.1, 0.05, 0, -0.08, -0.02, matDark));
    g.userData.muzzle = [0, 0.045, -1.07];
  }
  return g;
}

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

const GUN_IDS = ['pistol', 'rifle', 'sniper'];

export function createPlayerModel(id, name) {
  const color = COLORS[id];
  const matBody = new THREE.MeshLambertMaterial({ color });
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);

  // oyoqlar
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.1, 0.8, 0); legR.position.set(0.1, 0.8, 0);
  legL.add(bx(0.16, 0.8, 0.18, 0, -0.4, 0, matPants)); legR.add(bx(0.16, 0.8, 0.18, 0, -0.4, 0, matPants));
  body.add(legL, legR);
  // tana
  const torso = bx(0.5, 0.6, 0.26, 0, 1.1, 0, matBody); body.add(torso);
  // qo'llar (qurolni ushlab turadi)
  const armR = new THREE.Group(), armL = new THREE.Group();
  armR.position.set(0.31, 1.38, 0); armL.position.set(-0.31, 1.38, 0);
  for (const a of [armR, armL]) { a.add(bx(0.12, 0.5, 0.12, 0, -0.25, 0, matBody)); a.add(bx(0.1, 0.1, 0.1, 0, -0.55, 0, matSkin)); }
  armR.rotation.set(1.25, 0, -0.12); armL.rotation.set(1.3, 0, 0.5);
  body.add(armR, armL);
  // bosh
  const head = new THREE.Group(); head.position.set(0, 1.55, 0); body.add(head);
  head.add(bx(0.28, 0.28, 0.28, 0, 0, 0, matSkin));
  head.add(bx(0.3, 0.09, 0.3, 0, 0.1, 0.01, matHair));
  head.add(bx(0.3, 0.2, 0.08, 0, 0.0, 0.11, matHair));
  head.add(bx(0.045, 0.035, 0.01, -0.06, -0.01, -0.142, matEye));
  head.add(bx(0.045, 0.035, 0.01, 0.06, -0.01, -0.142, matEye));
  // PESHONA BOG'ICHI: ism old va orqa tomonda
  const bandMat = new THREE.MeshLambertMaterial({ color });
  head.add(bx(0.305, 0.085, 0.305, 0, 0.065, 0, bandMat));
  const bandTex = nameTexture(name, { bg: color, fg: '#fff', stroke: '#000', w: 256, h: 56 });
  const bandPlane = new THREE.MeshBasicMaterial({ map: bandTex });
  const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.08), bandPlane);
  pf.position.set(0, 0.065, -0.1535); pf.rotation.y = Math.PI; head.add(pf);
  const pb = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.08), bandPlane);
  pb.position.set(0, 0.065, 0.1535); head.add(pb);
  // ORQA YELKADA ISM
  const backTex = nameTexture(name, { bg: null, fg: '#fff', stroke: '#000', w: 256, h: 112 });
  const backPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.22),
    new THREE.MeshBasicMaterial({ map: backTex, transparent: true, depthWrite: false }));
  backPlane.position.set(0, 1.2, 0.1345); body.add(backPlane);

  // qurol (qo'lda)
  const holder = new THREE.Group(); holder.position.set(0.17, 1.2, -0.42); body.add(holder);
  const guns = GUN_IDS.map((gid) => { const g = makeGun(gid); g.visible = false; holder.add(g); return g; });

  const api = {
    root, body, legL, legR, armL, armR, head, guns, color, name, w: -1, phase: 0,
    setWeapon(i) { if (api.w === i) return; api.w = i; guns.forEach((g, k) => { g.visible = k === i; }); },
    animate(speed, dt) {
      api.phase += dt * Math.min(speed, 6) * 1.9;
      const s = speed > 0.3 ? Math.sin(api.phase) * 0.7 : 0;
      legL.rotation.x = s; legR.rotation.x = -s;
      body.position.y = speed > 0.3 ? Math.abs(Math.sin(api.phase)) * 0.03 : 0;
    },
  };
  api.setWeapon(1);
  return api;
}
