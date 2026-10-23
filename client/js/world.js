// Xarita ko'rinishi: teksturalar, binolar, hovli, osmon, tog'lar
import * as THREE from '../vendor/three.module.min.js';
import { BOXES, DECOR, PICKUPS, loadMap } from '../shared/map.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function canvasTex(size, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function speckle(g, size, rand, n, amt) {
  for (let i = 0; i < n; i++) {
    const x = rand() * size, y = rand() * size, s = 1 + rand() * 2.5;
    g.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${amt * rand()})` : `rgba(255,255,255,${amt * rand()})`;
    g.fillRect(x, y, s, s);
  }
}

function brickTex() {
  return canvasTex(256, (g, S) => {
    const rand = rng(11);
    g.fillStyle = '#ad8f58'; g.fillRect(0, 0, S, S);
    const bw = 64, bh = 32;
    for (let row = 0; row < 8; row++) {
      const off = (row % 2) * bw / 2;
      for (let col = -1; col < 5; col++) {
        const l = (rand() - 0.5) * 30;
        g.fillStyle = `rgb(${Math.round(218 + l)},${Math.round(184 + l * 0.9)},${Math.round(116 + l * 0.7)})`;
        g.fillRect(col * bw + off + 1.5, row * bh + 1.5, bw - 3, bh - 3);
      }
    }
    speckle(g, S, rand, 1800, 0.12);
  });
}

function groundTex() {
  return canvasTex(512, (g, S) => {
    const rand = rng(5);
    g.fillStyle = '#d6b25e'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) {
      const x = rand() * S, y = rand() * S, r = 25 + rand() * 70;
      const dark = rand() < 0.55;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, dark ? 'rgba(150,105,40,0.28)' : 'rgba(245,215,140,0.3)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    for (let i = 0; i < 220; i++) {
      const x = rand() * S, y = rand() * S, s = 1 + rand() * 3;
      g.fillStyle = `rgba(${90 + rand() * 60},${70 + rand() * 40},${30},${0.25 + rand() * 0.3})`;
      g.beginPath(); g.ellipse(x, y, s, s * 0.7, rand() * 3, 0, 6.3); g.fill();
    }
    speckle(g, S, rand, 5000, 0.1);
  });
}

function slabTex() {
  return canvasTex(256, (g, S) => {
    const rand = rng(23);
    g.fillStyle = '#c2b28e'; g.fillRect(0, 0, S, S);
    speckle(g, S, rand, 4000, 0.16);
    g.strokeStyle = 'rgba(90,75,50,0.55)'; g.lineWidth = 2;
    g.strokeRect(1, 1, S / 2 - 1, S / 2 - 1); g.strokeRect(S / 2 + 1, 1, S / 2 - 2, S / 2 - 1);
    g.strokeRect(1, S / 2 + 1, S / 2 - 1, S / 2 - 2); g.strokeRect(S / 2 + 1, S / 2 + 1, S / 2 - 2, S / 2 - 2);
  });
}

function crateTex() {
  return canvasTex(256, (g, S) => {
    const rand = rng(41);
    g.fillStyle = '#9c6c36'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) {
      const l = (rand() - 0.5) * 24;
      g.fillStyle = `rgb(${Math.round(166 + l)},${Math.round(116 + l * 0.8)},${Math.round(58 + l * 0.5)})`;
      g.fillRect(0, i * 64 + 2, S, 60);
      g.strokeStyle = 'rgba(60,35,10,0.35)';
      for (let k = 0; k < 6; k++) { g.beginPath(); const y = i * 64 + 6 + rand() * 52; g.moveTo(0, y); g.lineTo(S, y + (rand() - 0.5) * 6); g.stroke(); }
    }
    g.strokeStyle = '#6a4520'; g.lineWidth = 20; g.strokeRect(10, 10, S - 20, S - 20);
    g.lineWidth = 16; g.beginPath(); g.moveTo(14, 14); g.lineTo(S - 14, S - 14); g.moveTo(S - 14, 14); g.lineTo(14, S - 14); g.stroke();
    g.fillStyle = '#2b1c0a';
    for (const [x, y] of [[14, 14], [S - 14, 14], [14, S - 14], [S - 14, S - 14], [S / 2, S / 2]]) { g.beginPath(); g.arc(x, y, 4, 0, 6.3); g.fill(); }
    speckle(g, S, rand, 1500, 0.15);
  }, false);
}

function containerTex() {
  return canvasTex(256, (g, S) => {
    const rand = rng(61);
    g.fillStyle = '#d9d9d9'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 16; i++) {       // gofra qovurg'alar
      const x = i * (S / 16);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, 0, S / 32, S);
      g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(x + S / 32, 0, S / 64, S);
    }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, S, 10); g.fillRect(0, S - 10, S, 10);
    speckle(g, S, rand, 2500, 0.22);
    g.fillStyle = 'rgba(120,60,20,0.18)';
    for (let i = 0; i < 18; i++) { g.fillRect(rand() * S, rand() * S, 2 + rand() * 6, 8 + rand() * 30); }
  }, false);
}

function plasterTex() {
  return canvasTex(256, (g, S) => {
    const rand = rng(81);
    g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) {
      const x = rand() * S, y = rand() * S, r = 20 + rand() * 50;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rand() < 0.5 ? 'rgba(150,120,70,0.16)' : 'rgba(255,250,230,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(g, S, rand, 3000, 0.1);
    g.fillStyle = 'rgba(120,80,40,0.25)';                       // pastki namlik dog'i
    g.fillRect(0, S - 26, S, 26);
  });
}
function hayTex() {
  return canvasTex(128, (g, S) => {
    const rand = rng(91);
    g.fillStyle = '#d8b650'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = `rgba(${150 + rand() * 90},${110 + rand() * 70},${30 + rand() * 40},${0.4 + rand() * 0.4})`;
      g.lineWidth = 1 + rand() * 1.5; g.beginPath();
      const x = rand() * S, y = rand() * S; g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 30, y + (rand() - 0.5) * 8); g.stroke();
    }
    g.strokeStyle = 'rgba(80,50,20,0.7)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, S * 0.3); g.lineTo(S, S * 0.3); g.moveTo(0, S * 0.7); g.lineTo(S, S * 0.7); g.stroke();
  });
}
function plankTex() {
  return canvasTex(128, (g, S) => {
    const rand = rng(97);
    for (let i = 0; i < 4; i++) {
      const l = (rand() - 0.5) * 20;
      g.fillStyle = `rgb(${150 + l},${105 + l * 0.8},${62 + l * 0.5})`; g.fillRect(0, i * 32, S, 31);
      g.fillStyle = 'rgba(40,24,8,0.5)'; g.fillRect(0, i * 32 + 30, S, 2);
    }
    speckle(g, S, rand, 500, 0.14);
  });
}
function stoneTex() {
  return canvasTex(128, (g, S) => {
    const rand = rng(53);
    g.fillStyle = '#8d8a82'; g.fillRect(0, 0, S, S);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const l = (rand() - 0.5) * 36, o = (r % 2) * 16;
      g.fillStyle = `rgb(${140 + l},${136 + l},${126 + l})`; g.fillRect(c * 32 + o + 1, r * 32 + 1, 30, 30);
    }
    speckle(g, S, rand, 600, 0.14);
  });
}
function cloudTex() {
  return canvasTex(128, (g, S) => {
    for (let i = 0; i < 14; i++) {
      const x = 24 + Math.random() * 80, y = 54 + (Math.random() - 0.5) * 22, r = 16 + Math.random() * 22;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, false);
}
export function shadowTexture() {
  return canvasTex(64, (g, S) => {
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }, false);
}

// ---- Quti geometriyasi (UV dunyo koordinatalarida, vertex rang bilan soya) ----
const FACES = [
  { n: [1, 0, 0], v: (b) => [[b.maxx, b.miny, b.maxz], [b.maxx, b.miny, b.minz], [b.maxx, b.maxy, b.minz], [b.maxx, b.maxy, b.maxz]], uv: [2, 1], shade: 0.78 },
  { n: [-1, 0, 0], v: (b) => [[b.minx, b.miny, b.minz], [b.minx, b.miny, b.maxz], [b.minx, b.maxy, b.maxz], [b.minx, b.maxy, b.minz]], uv: [2, 1], shade: 0.78 },
  { n: [0, 1, 0], v: (b) => [[b.minx, b.maxy, b.maxz], [b.maxx, b.maxy, b.maxz], [b.maxx, b.maxy, b.minz], [b.minx, b.maxy, b.minz]], uv: [0, 2], shade: 1.0 },
  { n: [0, -1, 0], v: (b) => [[b.minx, b.miny, b.minz], [b.maxx, b.miny, b.minz], [b.maxx, b.miny, b.maxz], [b.minx, b.miny, b.maxz]], uv: [0, 2], shade: 0.6 },
  { n: [0, 0, 1], v: (b) => [[b.minx, b.miny, b.maxz], [b.maxx, b.miny, b.maxz], [b.maxx, b.maxy, b.maxz], [b.minx, b.maxy, b.maxz]], uv: [0, 1], shade: 0.9 },
  { n: [0, 0, -1], v: (b) => [[b.maxx, b.miny, b.minz], [b.minx, b.miny, b.minz], [b.minx, b.maxy, b.minz], [b.maxx, b.maxy, b.minz]], uv: [0, 1], shade: 0.9 },
];

function buildGeo(boxes, { tile = 2, color = [1, 1, 1], local = false, seed = 1, ao = true }) {
  const pos = [], nor = [], uvs = [], col = [], idx = [];
  const rand = rng(seed);
  let vi = 0;
  for (const b of boxes) {
    const tint = 0.95 + rand() * 0.1;
    const org = local ? [b.minx, b.miny, b.minz] : [0, 0, 0];
    const tl = local ? [b.maxx - b.minx, b.maxy - b.miny, b.maxz - b.minz] : [tile, tile, tile];
    for (const f of FACES) {
      const vs = f.v(b);
      for (const v of vs) {
        pos.push(v[0], v[1], v[2]); nor.push(f.n[0], f.n[1], f.n[2]);
        uvs.push((v[f.uv[0]] - org[f.uv[0]]) / tl[f.uv[0]], (v[f.uv[1]] - org[f.uv[1]]) / tl[f.uv[1]]);
        let s = f.shade * tint;
        if (ao && f.n[1] === 0) s *= 0.8 + 0.2 * Math.min(1, Math.max(0, v[1] / 2.5));
        col.push(color[0] * s, color[1] * s, color[2] * s);
      }
      idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function glowTex() {
  return canvasTex(128, (g, S) => {
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.25, 'rgba(255,240,170,0.7)'); gr.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }, false);
}

export function buildWorld() {
  const scene = new THREE.Scene();
  const FOG = 0xcfe6f6;   // doim ochiq, quyoshli havo
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.Fog(FOG, 110, 420);

  scene.add(new THREE.HemisphereLight(0xdcefff, 0xd9bd78, 1.2));
  const sun = new THREE.DirectionalLight(0xfff4d8, 1.85);
  sun.position.set(-40, 70, 25); scene.add(sun);

  const matBrick = new THREE.MeshLambertMaterial({ map: brickTex(), vertexColors: true });
  const matSlab = new THREE.MeshLambertMaterial({ map: slabTex(), vertexColors: true });
  const matCrate = new THREE.MeshLambertMaterial({ map: crateTex(), vertexColors: true });
  const matCont = new THREE.MeshLambertMaterial({ map: containerTex(), vertexColors: true });
  const matPlain = new THREE.MeshLambertMaterial({ vertexColors: true });
  const matPlaster = new THREE.MeshLambertMaterial({ map: plasterTex(), vertexColors: true });
  const matHay = new THREE.MeshLambertMaterial({ map: hayTex(), vertexColors: true });
  const matPlank = new THREE.MeshLambertMaterial({ map: plankTex(), vertexColors: true });
  const matStone = new THREE.MeshLambertMaterial({ map: stoneTex(), vertexColors: true });

  // har bir "kind" uchun: [material, geometriya sozlamalari]
  const KIND = {
    wall: [matBrick, { tile: 2, color: [1, 0.97, 0.9], seed: 3 }],
    perim: [matBrick, { tile: 2, color: [0.85, 0.78, 0.62], seed: 4 }],
    slab: [matSlab, { tile: 2, color: [1, 1, 1], seed: 5, ao: false }],
    stair: [matSlab, { tile: 2, color: [0.88, 0.85, 0.78], seed: 6, ao: false }],
    crate: [matCrate, { local: true, color: [1, 1, 1], seed: 7, ao: false }],
    lowwall: [matBrick, { tile: 2, color: [0.95, 0.88, 0.78], seed: 8, ao: false }],
    barrier: [matSlab, { tile: 2, color: [0.78, 0.78, 0.76], seed: 10, ao: false }],
    mound: [matPlain, { color: [0.8, 0.62, 0.32], seed: 12, ao: false }],
    cont0: [matCont, { local: true, color: [0.78, 0.25, 0.2], seed: 13, ao: false }],
    cont1: [matCont, { local: true, color: [0.22, 0.42, 0.7], seed: 14, ao: false }],
    cont2: [matCont, { local: true, color: [0.28, 0.55, 0.34], seed: 15, ao: false }],
    house: [matPlaster, { tile: 3, color: [1, 0.97, 0.9], seed: 16 }],
    roof: [matSlab, { tile: 2, color: [0.78, 0.5, 0.38], seed: 17, ao: false }],
    hay: [matHay, { local: true, color: [1, 1, 1], seed: 18, ao: false }],
    fence: [matPlank, { tile: 1.5, color: [1, 1, 1], seed: 19, ao: false }],
    well: [matStone, { tile: 1, color: [1, 1, 1], seed: 20, ao: false }],
  };
  const DECOR_COLOR = { trim: [0.46, 0.31, 0.18], awning: [0.62, 0.2, 0.17], tank: [0.5, 0.55, 0.58], roofedge: [0.55, 0.34, 0.26], wood: [0.45, 0.3, 0.16] };

  // xaritaga bog'liq qism (binolar, yashiklar, dori qutilari): xarita almashganda qayta quriladi
  const mapGroup = new THREE.Group(); scene.add(mapGroup);
  const api = { scene, pickups: [], mapId: -1 };
  const pickBase = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
  const pickCross = new THREE.MeshBasicMaterial({ color: 0x2e9e3e });
  const pickGeo = [new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.BoxGeometry(0.32, 0.1, 0.52), new THREE.BoxGeometry(0.1, 0.32, 0.52)];

  api.setMap = (id) => {
    id = loadMap(id);
    if (api.mapId === id) return id;
    api.mapId = id;
    for (const ch of [...mapGroup.children]) { mapGroup.remove(ch); if (ch.geometry && !pickGeo.includes(ch.geometry)) ch.geometry.dispose(); }
    for (const k of Object.keys(KIND)) {
      const list = BOXES.filter((b) => b.kind === k);
      if (list.length) mapGroup.add(new THREE.Mesh(buildGeo(list, KIND[k][1]), KIND[k][0]));
    }
    for (const k of Object.keys(DECOR_COLOR)) {
      const list = DECOR.filter((b) => b.kind === k);
      if (list.length) mapGroup.add(new THREE.Mesh(buildGeo(list, { color: DECOR_COLOR[k], seed: 9, ao: false }), matPlain));
    }
    // dori qutilari
    api.pickups = PICKUPS.map((pos) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(pickGeo[0], pickBase), new THREE.Mesh(pickGeo[1], pickCross), new THREE.Mesh(pickGeo[2], pickCross));
      g.position.set(pos.x, pos.y + 0.75, pos.z); g.userData.y0 = pos.y;
      mapGroup.add(g);
      return g;
    });
    return id;
  };

  // yer
  const gt = groundTex(); gt.repeat.set(60, 60);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(480, 480), new THREE.MeshLambertMaterial({ map: gt }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);

  // osmon
  const skyG = new THREE.SphereGeometry(400, 24, 14);
  const sc = [];
  const p = skyG.attributes.position;
  const top = new THREE.Color(0x2f86e8), hor = new THREE.Color(0xa8d4f5), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, p.getY(i) / 400);
    c.copy(hor).lerp(top, Math.pow(t, 0.5)); sc.push(c.r, c.g, c.b);
  }
  skyG.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  const sky = new THREE.Mesh(skyG, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -2; scene.add(sky);
  const sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  sunSpr.scale.set(170, 170, 1); sunSpr.position.set(-40, 70, 25).normalize().multiplyScalar(350); sunSpr.renderOrder = -1;
  scene.add(sunSpr);

  // yengil bulutlar (shamolda sekin suzadi)
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex(), fog: false, depthWrite: false, transparent: true, opacity: 0.9 });
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const sp = new THREE.Sprite(cloudMat);
    const a = (i / 9) * Math.PI * 2 + Math.random() * 0.5, e = 0.28 + Math.random() * 0.45;
    sp.userData = { a, e, sp: 0.004 + Math.random() * 0.004 };
    const w = 90 + Math.random() * 90; sp.scale.set(w, w * 0.4, 1); sp.renderOrder = -1;
    scene.add(sp); clouds.push(sp);
  }

  // uzoqdagi tog'lar
  const mr = rng(77);
  const mm = new THREE.MeshLambertMaterial({ color: 0xc9a066, flatShading: true });
  const mm2 = new THREE.MeshLambertMaterial({ color: 0xb98d56, flatShading: true });
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + mr() * 0.15, d = 190 + mr() * 50;
    const h = 22 + mr() * 50, r = 30 + mr() * 40;
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5 + Math.floor(mr() * 3)), mr() < 0.5 ? mm : mm2);
    m.position.set(Math.cos(a) * d, h / 2 - 1, Math.sin(a) * d); m.rotation.y = mr() * 6; scene.add(m);
  }

  api.sky = sky; api.sunSpr = sunSpr; api.clouds = clouds;
  api.update = (t, camPos) => {
    sky.position.copy(camPos);
    sunSpr.position.set(-40, 70, 25).normalize().multiplyScalar(350).add(camPos);
    for (const c of clouds) {
      const u = c.userData, a = u.a + t * u.sp;
      c.position.set(Math.cos(a) * 330 * Math.cos(u.e), 330 * Math.sin(u.e) + 20, Math.sin(a) * 330 * Math.cos(u.e)).add(camPos);
    }
  };
  api.setMap(0);
  return api;
}
