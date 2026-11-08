// Termiz — 3D dunyo: bo'lakli (chunk) binolar, yo'llar, yo'laklar, daraxtlar, osmon, suv, to'qnashuv
import * as THREE from 'three';
import { Sky } from '../../vendor/addons/Sky.js';
import { CHUNK_SIZE, MOSQUE, QUALITY } from '../config.js';
import {
  MeshBuilder, addGeom, composeMatrix, rng, hashStr, clamp, lerp, smoothstep,
  normalizePoly, polyArea, pointInPoly, polyBBox, orientedBox, lin3,
} from './util.js';
import { TexLib } from './tex.js';
import { SHARED, createBuildingMaterial, createGroundMaterial, createFoliageMaterial } from './mat.js';
import { buildMosque } from './mosque.js';

// Atlas plitkalari (tartib mat.js dagi tileScales bilan mos)
const ATLAS = [
  'white_plaster_02', 'yellow_plaster', 'red_brick', 'yellow_brick',
  'whitewashed_brick', 'concrete_panels', 'white_sandstone_bricks', 'patterned_clay_plaster',
  'clay_roof_tiles_02', 'grey_roof_tiles', 'box_profile_metal_sheet', 'rough_concrete',
];
const T = { PLASTER: 0, YPLASTER: 1, RBRICK: 2, YBRICK: 3, WBRICK: 4, PANEL: 5, SAND: 6, CLAY: 7, RCLAY: 8, RGREY: 9, METAL: 10, CONC: 11 };
const EXTRA_TEX = ['asphalt_02', 'concrete_pavement', 'pavement_03', 'dry_ground_01', 'leafy_grass', 'rough_concrete', 'marble_tiles', 'sandy_gravel_02'];

const GRID = 24;               // to'qnashuv to'ri katagi (m)
const Y_ROAD = 0.03, Y_CURB = 0.15, Y_PATH = 0.05;

// ── Yordamchi: yuza yuqoriga qaragan uchburchaklar ro'yxati ───────────────────
function triangulate(pts) {
  const v = pts.map(p => new THREE.Vector2(p[0], p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(v, []);
  for (const t of tris) {
    const a = pts[t[0]], b = pts[t[1]], c = pts[t[2]];
    const ny = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
    if (ny < 0) { const x = t[1]; t[1] = t[2]; t[2] = x; }
  }
  return tris;
}

// To'rtburchakni kerakli normal tomonga qaratib qo'shish. a..d: [x,y,z,u,v]
function Q(mb, a, b, c, d, nx, ny, nz, col, info) {
  const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
  const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
  const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
  if (cx * nx + cy * ny + cz * nz < 0) { const t = b; b = d; d = t; }
  const i = info || [0, 0, 0, 0];
  const r = col[0], g = col[1], bb = col[2];
  const ia = mb.v(a[0], a[1], a[2], nx, ny, nz, a[3], a[4], r, g, bb, 0, 0, i[0], i[1], i[2], i[3]);
  const ib = mb.v(b[0], b[1], b[2], nx, ny, nz, b[3], b[4], r, g, bb, 0, 0, i[0], i[1], i[2], i[3]);
  const ic = mb.v(c[0], c[1], c[2], nx, ny, nz, c[3], c[4], r, g, bb, 0, 0, i[0], i[1], i[2], i[3]);
  const id = mb.v(d[0], d[1], d[2], nx, ny, nz, d[3], d[4], r, g, bb, 0, 0, i[0], i[1], i[2], i[3]);
  mb.quad(ia, ib, ic, id);
}

function distPtSeg(px, pz, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - x0) * dx + (pz - z0) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = x0 + dx * t, qz = z0 + dz * t;
  return [Math.hypot(px - qx, pz - qz), qx, qz];
}

// Devor rang palitralari (sRGB hex)
const PLASTER_TINTS = [0xffffff, 0xf4ecd8, 0xf0e2bf, 0xe9d6b0, 0xf2d9d0, 0xdde6ec, 0xe4ecd6, 0xffffff];
const ROOF_TINTS = [0xffffff, 0xd8c8c0, 0xc0c8d0, 0xe0d0b8];

export class World {
  constructor(renderer, scene, mapData, opts = {}) {
    this.renderer = renderer; this.scene = scene; this.map = mapData;
    this.qname = opts.quality || 'mid';
    this.q = QUALITY[this.qname] || QUALITY.mid;
    this.viewDist = this.q.view;
    this.chunks = new Map();
    this.queue = [];
    this.buckets = new Map();
    this.cgrid = new Map();
    this.cols = [];
    this.roadGrid = new Map();
    this.zoneMeshes = [];
    this.time = opts.time ?? 11.0;
    this.timeSpeed = opts.timeSpeed ?? (1 / 60);   // o'yin soati / real soniya
    this.night = 0;
    this.root = new THREE.Group(); this.root.name = 'world';
    scene.add(this.root);
    this._envT = -999;
  }

  // ── Boshlash ───────────────────────────────────────────────────────────────
  async init(onProgress = () => {}) {
    const q = this.q;
    this.texLib = new TexLib(this.renderer, { normalMaps: q.normalMaps, onProgress: (d, t) => onProgress(0.05 + 0.4 * d / t, 'Teksturalar') });
    await this.texLib.preload([...ATLAS, ...EXTRA_TEX]);
    onProgress(0.46, 'Materiallar');
    const atlas = this.texLib.atlas(ATLAS, 4, 3, q.normalMaps ? 512 : 256);
    this.atlas = atlas;
    this.matBuilding = createBuildingMaterial(atlas, { windows: true, normalScale: 0.8 });
    const tl = (n, rep = [1, 1]) => this.texLib.get(n, rep);
    this.matRoad = new THREE.MeshStandardMaterial({ ...tl('asphalt_02'), roughness: 0.93, metalness: 0, vertexColors: true });
    if (this.matRoad.normalMap) this.matRoad.normalScale.set(0.6, 0.6);
    this.matWalk = new THREE.MeshStandardMaterial({ ...tl('pavement_03'), roughness: 0.9, vertexColors: true });
    this.matPath = new THREE.MeshStandardMaterial({ ...tl('concrete_pavement'), roughness: 0.92, vertexColors: true });
    this.matMark = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.matFoliage = createFoliageMaterial();
    this.matProp = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.25 });
    this.matLamp = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.matGlow = new THREE.MeshBasicMaterial({ map: this._glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, color: 0xffd9a0 });
    this.matGround = createGroundMaterial(tl('dry_ground_01'), { tint: 0xd8c8a4, scale: 1 / 7 });
    this.matGrass = createGroundMaterial(tl('leafy_grass'), { tint: 0xc9d79a, scale: 1 / 6 });
    this.matPlaza = createGroundMaterial(tl('marble_tiles'), { tint: 0xe6d9b8, scale: 1 / 4, rough: 0.8 });
    this.matInd = createGroundMaterial(tl('rough_concrete'), { tint: 0xbab4a8, scale: 1 / 5 });
    this.matDry = createGroundMaterial(tl('sandy_gravel_02'), { tint: 0xcfbf9a, scale: 1 / 5 });
    for (const m of [this.matGrass, this.matPlaza, this.matInd, this.matDry]) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1; }
    this.matWater = this._waterMaterial();
    this.matRoad.polygonOffset = true; this.matRoad.polygonOffsetFactor = -0.5; this.matRoad.polygonOffsetUnits = -0.5;

    onProgress(0.5, 'Xarita');
    this._indexMap();
    onProgress(0.6, 'Osmon');
    this._buildSky();
    this._buildGround();
    this._buildWater();
    onProgress(0.7, 'Masjid');
    this.mosque = buildMosque(this, this.texLib);
    this.root.add(this.mosque.group, this.mosque.extra);
    for (const c of this.mosque.colliders) this._addCollider(c);
    this._setTime(this.time, true);
  }

  // ── Xarita indekslash ─────────────────────────────────────────────────────
  _indexMap() {
    const CS = CHUNK_SIZE, m = this.map;
    const bk = (cx, cz) => { const k = cx + ',' + cz; let b = this.buckets.get(k); if (!b) { b = { b: [], s: [], z: [], p: [] }; this.buckets.set(k, b); } return b; };
    this.bk = bk;
    // Binolar
    for (const b of m.buildings) {
      if (b.id === MOSQUE.id || b.id === '733837868' || b.id === '733837869') continue;
      const pts = normalizePoly(b.coords);
      if (pts.length < 3) continue;
      const area = -polyArea(pts);
      if (area < 3.5) continue;
      b._pts = pts; b._area = area; b._bb = polyBBox(pts);
      bk(Math.floor(b.cx / CS), Math.floor(b.cz / CS)).b.push(b);
      if (b.h > 1.2) this._addCollider({ t: 0, pts, bb: b._bb });
    }
    // Yo'llar
    this.roadNames = new Map();
    for (const r of m.roads) {
      if (r.name) this.roadNames.set(r.id, r.name);
      if (r.tu) continue;
      const c = r.coords;
      for (let i = 0; i < c.length - 1; i++) {
        const mx = (c[i][0] + c[i + 1][0]) / 2, mz = (c[i][1] + c[i + 1][1]) / 2;
        bk(Math.floor(mx / CS), Math.floor(mz / CS)).s.push([r, i]);
        if (r.r >= 0 && !r.br) this._gridInsertRoad(r, i);
      }
    }
    // Zonalar (daraxt joylash uchun)
    for (const z of m.zones) {
      z._bb = polyBBox(z.coords);
      const mx = (z._bb[0] + z._bb[2]) / 2, mz = (z._bb[1] + z._bb[3]) / 2;
      if (z.zone === 'park' || z.zone === 'grass') {
        const w = z._bb[2] - z._bb[0], d = z._bb[3] - z._bb[1];
        if (w < 600 && d < 600) bk(Math.floor(mx / CS), Math.floor(mz / CS)).z.push(z);
      }
    }
    for (const p of m.pois) bk(Math.floor(p.x / CS), Math.floor(p.z / CS)).p.push(p);
  }

  _gridInsertRoad(r, i) {
    const a = r.coords[i], b = r.coords[i + 1];
    const hw = r.w / 2 + 0.4;
    const x0 = Math.min(a[0], b[0]) - hw, x1 = Math.max(a[0], b[0]) + hw, z0 = Math.min(a[1], b[1]) - hw, z1 = Math.max(a[1], b[1]) + hw;
    const seg = [a[0], a[1], b[0], b[1], hw, r.id];
    for (let gx = Math.floor(x0 / GRID); gx <= Math.floor(x1 / GRID); gx++)
      for (let gz = Math.floor(z0 / GRID); gz <= Math.floor(z1 / GRID); gz++) {
        const k = gx + ',' + gz; let l = this.roadGrid.get(k); if (!l) { l = []; this.roadGrid.set(k, l); } l.push(seg);
      }
  }
  // Nuqta boshqa (exId dan boshqa) yo'l asfaltida yotadimi?
  _onOtherRoad(x, z, exId, pad = 0) {
    const l = this.roadGrid.get(Math.floor(x / GRID) + ',' + Math.floor(z / GRID));
    if (!l) return false;
    for (const s of l) {
      if (s[5] === exId) continue;
      if (distPtSeg(x, z, s[0], s[1], s[2], s[3])[0] < s[4] + pad) return true;
    }
    return false;
  }
  _onAnyRoad(x, z, pad = 0) { return this._onOtherRoad(x, z, null, pad); }
  nearestRoadName(x, z) {
    let best = null, bd = 30;
    for (let gx = Math.floor(x / GRID) - 1; gx <= Math.floor(x / GRID) + 1; gx++) for (let gz = Math.floor(z / GRID) - 1; gz <= Math.floor(z / GRID) + 1; gz++) {
      const l = this.roadGrid.get(gx + ',' + gz); if (!l) continue;
      for (const s of l) { const d = distPtSeg(x, z, s[0], s[1], s[2], s[3])[0]; if (d < bd && this.roadNames.has(s[5])) { bd = d; best = this.roadNames.get(s[5]); } }
    }
    return best;
  }

  // ── To'qnashuv ────────────────────────────────────────────────────────────
  _addCollider(c) {
    let x0, x1, z0, z1;
    if (c.t === 0) { [x0, z0, x1, z1] = c.bb; }
    else if (c.t === 1) { x0 = c.x - c.r; x1 = c.x + c.r; z0 = c.z - c.r; z1 = c.z + c.r; }
    else { const h = (c.th || 0.3); x0 = Math.min(c.x0, c.x1) - h; x1 = Math.max(c.x0, c.x1) + h; z0 = Math.min(c.z0, c.z1) - h; z1 = Math.max(c.z0, c.z1) + h; }
    const idx = this.cols.length; this.cols.push(c);
    for (let gx = Math.floor(x0 / GRID); gx <= Math.floor(x1 / GRID); gx++)
      for (let gz = Math.floor(z0 / GRID); gz <= Math.floor(z1 / GRID); gz++) {
        const k = gx + ',' + gz; let l = this.cgrid.get(k); if (!l) { l = []; this.cgrid.set(k, l); } l.push(idx);
      }
  }
  _candidates(x, z, r) {
    const out = new Set();
    for (let gx = Math.floor((x - r) / GRID); gx <= Math.floor((x + r) / GRID); gx++)
      for (let gz = Math.floor((z - r) / GRID); gz <= Math.floor((z + r) / GRID); gz++) {
        const l = this.cgrid.get(gx + ',' + gz); if (l) for (const i of l) out.add(i);
      }
    return out;
  }
  // Doira (x,z,r) ni to'siqdan chiqarish. {hit,nx,nz,pen}
  _push(x, z, r) {
    let best = null;
    for (const i of this._candidates(x, z, r + 1)) {
      const c = this.cols[i];
      let d, qx, qz, inside = false;
      if (c.t === 1) { qx = c.x; qz = c.z; d = Math.hypot(x - qx, z - qz) - c.r; if (d >= r) continue; const L = Math.hypot(x - qx, z - qz) || 1; const pen = r - d; if (!best || pen > best.pen) best = { nx: (x - qx) / L, nz: (z - qz) / L, pen }; continue; }
      if (c.t === 2) {
        const [dd, ax, az] = distPtSeg(x, z, c.x0, c.z0, c.x1, c.z1);
        const lim = r + (c.th || 0.3);
        if (dd >= lim) continue;
        const L = dd || 1; const nx = dd > 1e-4 ? (x - ax) / L : 1, nz = dd > 1e-4 ? (z - az) / L : 0;
        const pen = lim - dd; if (!best || pen > best.pen) best = { nx, nz, pen };
        continue;
      }
      const bb = c.bb;
      if (x < bb[0] - r || x > bb[2] + r || z < bb[1] - r || z > bb[3] + r) continue;
      const pts = c.pts;
      let md = 1e9, mx = 0, mz = 0;
      for (let k = 0, n = pts.length; k < n; k++) {
        const p0 = pts[k], p1 = pts[(k + 1) % n];
        const [dd, ax, az] = distPtSeg(x, z, p0[0], p0[1], p1[0], p1[1]);
        if (dd < md) { md = dd; mx = ax; mz = az; }
      }
      inside = pointInPoly(x, z, pts);
      if (!inside && md >= r) continue;
      let nx, nz, pen;
      const L = md || 1;
      if (inside) { nx = (mx - x) / L; nz = (mz - z) / L; pen = md + r; }
      else { nx = (x - mx) / L; nz = (z - mz) / L; pen = r - md; }
      if (!best || pen > best.pen) best = { nx, nz, pen };
    }
    return best;
  }
  checkBuildingCollision(px, pz, r) {
    const b = this._push(px, pz, r);
    return b ? { hit: true, nx: b.nx, nz: b.nz, pen: b.pen } : { hit: false };
  }
  pushOut(x, z, r) {
    let hit = false;
    for (let it = 0; it < 4; it++) {
      const b = this._push(x, z, r);
      if (!b) break;
      hit = true; x += b.nx * (b.pen + 0.001); z += b.nz * (b.pen + 0.001);
    }
    return { x, z, hit };
  }
  insideSolid(x, z) {
    for (const i of this._candidates(x, z, 0.5)) {
      const c = this.cols[i];
      if (c.t === 0 && x >= c.bb[0] && x <= c.bb[2] && z >= c.bb[1] && z <= c.bb[3] && pointInPoly(x, z, c.pts)) return true;
    }
    return false;
  }
  // Nuqtadan nuqtaga to'siq bormi (o'q uchun)
  rayBlocked(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(d / 1.5));
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      if (this.insideSolid(x, z)) return [x, z];
    }
    return null;
  }
  getGroundY(x, z) { return this.mosque ? this.mosque.groundY(x, z) : 0; }

  // ── Osmon, yorug'lik ──────────────────────────────────────────────────────
  _buildSky() {
    const sc = this.scene;
    this.sky = new Sky();
    this.sky.scale.setScalar(this.viewDist * 1.6);
    this.sky.material.depthWrite = false;
    this.sky.frustumCulled = false;
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4.5; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    sc.add(this.sky);
    this.hemi = new THREE.HemisphereLight(0xbcd8ff, 0x8a7a5e, 0.7);
    sc.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    this.sun.target = new THREE.Object3D();
    sc.add(this.sun, this.sun.target);
    if (this.q.shadows) {
      this.sun.castShadow = true;
      const s = this.sun.shadow; s.mapSize.set(2048, 2048);
      const c = s.camera; c.left = -90; c.right = 90; c.top = 90; c.bottom = -90; c.near = 1; c.far = 420;
      s.bias = -0.0005; s.normalBias = 0.06;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    sc.fog = new THREE.Fog(0xc9dcec, this.viewDist * 0.55, this.viewDist * 1.0);
    this.sunDir = new THREE.Vector3(0.4, 0.8, 0.3);
    if (this.q.normalMaps) this.pmrem = new THREE.PMREMGenerator(this.renderer);
  }

  _setTime(t, force = false) {
    this.time = ((t % 24) + 24) % 24;
    const ph = (this.time - 6) / 24 * Math.PI * 2;
    const sy = Math.sin(ph);
    const dir = this.sunDir.set(Math.cos(ph) * 0.9, sy * 0.92 + 0.02, 0.38).normalize();
    this.night = smoothstep(0.12, -0.18, dir.y);
    SHARED.uNight.value = this.night;
    const day = smoothstep(-0.05, 0.35, dir.y);
    const dusk = 1 - Math.abs(clamp(dir.y / 0.35, -1, 1));       // gorizont yaqinida 1
    const mix3 = (a, b, c) => new THREE.Color(a).lerp(new THREE.Color(b), day).lerp(new THREE.Color(c), clamp(dusk * 0.9 * (1 - this.night * 0.6), 0, 1));
    const fogC = mix3(0x0a1020, 0xcadcee, 0xe9b98d);
    this.scene.fog.color.copy(fogC);
    this.sun.color.copy(new THREE.Color(0xffa860).lerp(new THREE.Color(0xfff3dc), smoothstep(0.05, 0.5, dir.y)));
    this.sun.intensity = 2.6 * smoothstep(-0.02, 0.3, dir.y);
    this.hemi.color.copy(mix3(0x1a2a52, 0xbfd9ff, 0xf0c8a0));
    this.hemi.groundColor.copy(mix3(0x101018, 0x93805e, 0x6a5a4a));
    this.hemi.intensity = lerp(0.28, 0.85, day);
    const su = this.sky.material.uniforms;
    su.sunPosition.value.copy(dir).multiplyScalar(1000);
    this.renderer.toneMappingExposure = lerp(0.55, 0.95, day);
    // lampalar va yorug' derazalar
    if (this.matLamp) { this.matLamp.color.setRGB(lerp(0.55, 1.6, this.night), lerp(0.55, 1.35, this.night), lerp(0.5, 0.95, this.night)); }
    if (this.matGlow) { this.matGlow.opacity = this.night * 0.75; }
    this.glowVisible = this.night > 0.02;
    // atrof muhit xaritasi (aks) — vaqti-vaqti bilan yangilanadi
    if (this.pmrem && (force || Math.abs(this.time - this._envT) > 0.6)) {
      this._envT = this.time;
      const es = new THREE.Scene(); const sk = new Sky(); sk.scale.setScalar(1000);
      const eu = sk.material.uniforms; for (const k in su) eu[k].value = (su[k].value && su[k].value.clone) ? su[k].value.clone() : su[k].value;
      es.add(sk);
      const rt = this.pmrem.fromScene(es, 0.02);
      if (this._envRT) this._envRT.dispose();
      this._envRT = rt; this.scene.environment = rt.texture;
      sk.geometry.dispose(); sk.material.dispose();
      for (const m of [this.matBuilding, this.matRoad, this.matWalk, this.matPath, this.matGround, this.matGrass, this.matPlaza, this.matInd, this.matDry, this.matFoliage]) if (m) m.envMapIntensity = 0.35;
      if (this.matWater) this.matWater.envMapIntensity = 1.4;
    }
  }
  setTime(t) { this._setTime(t, true); }

  _glowTex() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d'); const g = c.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // ── Yer ───────────────────────────────────────────────────────────────────
  _buildGround() {
    const S = this.viewDist * 2.4, N = 24;
    const g = new THREE.PlaneGeometry(S, S, N, N); g.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(g, this.matGround);
    this.ground.receiveShadow = this.q.shadows;
    this.ground.frustumCulled = false;
    this.root.add(this.ground);
  }

  _waterMaterial() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const c = cv.getContext('2d'); const id = c.createImageData(256, 256);
    const h = (x, y) => Math.sin(x * 0.09 * 2 * Math.PI / 6.28) * 0 + (Math.sin(x / 256 * 6.283 * 3) + Math.sin(y / 256 * 6.283 * 4 + 1) + Math.sin((x + y) / 256 * 6.283 * 5) * 0.6);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
      const i = (y * 256 + x) * 4; id.data[i] = 128 + dx * 22; id.data[i + 1] = 128 + dy * 22; id.data[i + 2] = 255; id.data[i + 3] = 255;
    }
    c.putImageData(id, 0, 0);
    const nm = new THREE.CanvasTexture(cv); nm.wrapS = nm.wrapT = THREE.RepeatWrapping; nm.repeat.set(1, 1);
    this.waterNormal = nm;
    return new THREE.MeshStandardMaterial({ color: 0x2f7388, roughness: 0.1, metalness: 0.0, normalMap: nm, normalScale: new THREE.Vector2(0.5, 0.5), transparent: true, opacity: 0.93 });
  }

  _buildWater() {
    const mb = new MeshBuilder();
    const zoneIds = new Set();
    for (const z of this.map.zones) {
      if (z.zone !== 'water') continue;
      zoneIds.add(z.id);
      const pts = normalizePoly(z.coords); if (pts.length < 3) continue;
      const tris = triangulate(pts);
      const base = mb.n;
      for (const p of pts) mb.v(p[0], 0.018, p[1], 0, 1, 0, p[0] / 12, p[1] / 12, 1, 1, 1);
      for (const t of tris) mb.tri(base + t[0], base + t[1], base + t[2]);
    }
    for (const w of this.map.waterways) {
      if (zoneIds.has(w.id)) continue;
      const hw = Math.max(1.2, (w.w || 4) / 2);
      const c = w.coords; if (c.length < 2) continue;
      const fake = { coords: c };
      this._prepRoad(fake);
      for (let i = 0; i < c.length - 1; i++) {
        const o = (k, s) => [c[k][0] + fake._m.mx[k] * fake._m.sc[k] * hw * s, 0.017, c[k][1] + fake._m.mz[k] * fake._m.sc[k] * hw * s];
        const a = o(i, 1), b = o(i, -1), d = o(i + 1, 1), e = o(i + 1, -1);
        const f = (p) => [p[0], p[1], p[2], p[0] / 12, p[2] / 12];
        Q(mb, f(a), f(b), f(e), f(d), 0, 1, 0, [1, 1, 1]);
      }
    }
    if (mb.empty) return;
    this.waterMesh = new THREE.Mesh(mb.build(), this.matWater);
    this.waterMesh.frustumCulled = false;
    this.root.add(this.waterMesh);
  }

  // ── Zonalar (park, sanoat, masjid maydoni): kerak bo'lganda quriladi ─────────
  _zoneMesh(z) {
    if (z._mesh !== undefined) return z._mesh;
    let mat = null, y = 0.012;
    switch (z.zone) {
      case 'grass': case 'park': case 'stadium': mat = this.matGrass; break;
      case 'industrial': mat = this.matInd; break;
      case 'religious': mat = this.matPlaza; y = 0.014; break;
      case 'cemetery': case 'military': mat = this.matDry; break;
      default: mat = null;
    }
    if (!mat || z.coords.length < 3) { z._mesh = null; return null; }
    const pts = normalizePoly(z.coords);
    const tris = triangulate(pts);
    const mb = new MeshBuilder();
    for (const p of pts) mb.v(p[0], y, p[1], 0, 1, 0, p[0] / 6, p[1] / 6, 1, 1, 1);
    for (const t of tris) mb.tri(t[0], t[1], t[2]);
    const mesh = new THREE.Mesh(mb.build(), mat);
    mesh.receiveShadow = this.q.shadows; mesh.visible = false;
    this.root.add(mesh);
    z._mesh = mesh;
    return mesh;
  }
  _updateZones(px, pz) {
    const R = this.viewDist + 40;
    for (const z of this.map.zones) {
      const bb = z._bb;
      const dx = Math.max(bb[0] - px, 0, px - bb[2]), dz = Math.max(bb[1] - pz, 0, pz - bb[3]);
      const near = dx * dx + dz * dz < R * R;
      if (near) { const m = this._zoneMesh(z); if (m) m.visible = true; }
      else if (z._mesh) z._mesh.visible = false;
    }
  }

  // ── Bo'laklarni boshqarish ────────────────────────────────────────────────
  updateChunks(px, pz) {
    const cs = CHUNK_SIZE, R = this.viewDist + cs * 0.7;
    const n = Math.ceil(R / cs) + 1;
    const ccx = Math.floor(px / cs), ccz = Math.floor(pz / cs);
    const want = [];
    for (let cx = ccx - n; cx <= ccx + n; cx++) for (let cz = ccz - n; cz <= ccz + n; cz++) {
      const wx = cx * cs + cs / 2, wz = cz * cs + cs / 2;
      const d = Math.hypot(wx - px, wz - pz);
      if (d > R) continue;
      want.push([d, cx, cz]);
    }
    want.sort((a, b) => a[0] - b[0]);
    const keep = new Set();
    this.queue.length = 0;
    for (const [, cx, cz] of want) {
      const k = cx + ',' + cz; keep.add(k);
      if (!this.chunks.has(k)) this.queue.push([cx, cz]);
    }
    for (const [k, ch] of this.chunks) {
      if (keep.has(k)) continue;
      // gisterezis: biroz uzoqroq saqlaymiz
      const [cx, cz] = k.split(',').map(Number);
      if (Math.hypot(cx * cs + cs / 2 - px, cz * cs + cs / 2 - pz) < R + cs) continue;
      this._disposeChunk(ch); this.chunks.delete(k);
    }
    this._updateZones(px, pz);
  }
  prewarm(px, pz, onProgress = () => {}) {
    this.updateChunks(px, pz);
    const total = Math.min(this.queue.length, 14);
    let i = 0;
    while (this.queue.length && i < total) { const [cx, cz] = this.queue.shift(); this._ensureChunk(cx, cz); onProgress(++i / total); }
  }
  _ensureChunk(cx, cz) {
    const k = cx + ',' + cz;
    if (this.chunks.has(k)) return;
    const ch = this._buildChunk(cx, cz);
    this.chunks.set(k, ch);
  }
  _disposeChunk(ch) {
    for (const m of ch.meshes) { this.root.remove(m); m.geometry.dispose(); }
  }

  update(dt, focus) {
    // vaqt
    if (this.timeSpeed) this._setTime(this.time + dt * this.timeSpeed);
    SHARED.uTime.value += dt;
    if (this.mosque) this.mosque.update(dt, this.night);
    if (this.waterNormal) { this.waterNormal.offset.x += dt * 0.012; this.waterNormal.offset.y += dt * 0.007; }
    // chunklarni navbat bilan qurish (kadrda bittadan)
    if (this.queue.length) { const [cx, cz] = this.queue.shift(); this._ensureChunk(cx, cz); }
    if (focus) {
      this.ground.position.set(Math.round(focus.x / 42) * 42, 0, Math.round(focus.z / 42) * 42);
      this.sky.position.set(focus.x, 0, focus.z);
      if (this.q.shadows) {
        const sc = this.sun.shadow.camera, step = 180 / 2048 * 4;
        const fx = Math.round(focus.x / step) * step, fz = Math.round(focus.z / step) * step;
        this.sun.target.position.set(fx, 0, fz);
        this.sun.position.set(fx + this.sunDir.x * 220, Math.max(40, this.sunDir.y * 220), fz + this.sunDir.z * 220);
        this.sun.target.updateMatrixWorld();
      } else {
        this.sun.target.position.set(focus.x, 0, focus.z);
        this.sun.position.set(focus.x + this.sunDir.x * 200, Math.max(20, this.sunDir.y * 200), focus.z + this.sunDir.z * 200);
      }
    }
    // faqat tunda lampa yog'dusi ko'rinsin
    for (const ch of this.chunks.values()) if (ch.glow) ch.glow.visible = this.glowVisible;
  }

  // ── Bo'lak qurish ─────────────────────────────────────────────────────────
  _buildChunk(cx, cz) {
    const bkt = this.buckets.get(cx + ',' + cz) || { b: [], s: [], z: [], p: [] };
    const mBld = new MeshBuilder(true), mRoad = new MeshBuilder(), mWalk = new MeshBuilder(), mPath = new MeshBuilder(), mMark = new MeshBuilder();
    const mTree = new MeshBuilder(), mProp = new MeshBuilder(), mLamp = new MeshBuilder(), mGlow = new MeshBuilder();
    const R = rng(hashStr('chunk' + cx + ',' + cz));
    const ctx = { cx, cz, R, mBld, mRoad, mWalk, mPath, mMark, mTree, mProp, mLamp, mGlow, lampAcc: new Map(), treeAcc: new Map() };

    for (const b of bkt.b) this._building(ctx, b);
    for (const [r, i] of bkt.s) this._roadSeg(ctx, r, i);
    for (const z of bkt.z) this._parkTrees(ctx, z);
    for (const p of bkt.p) this._poiProp(ctx, p);
    this._yardTrees(ctx, bkt.b);

    const meshes = [];
    const add = (mb, mat, shadow, recv = true) => {
      if (mb.empty) return null;
      const m = new THREE.Mesh(mb.build(), mat);
      m.castShadow = shadow && this.q.shadows; m.receiveShadow = recv && this.q.shadows;
      this.root.add(m); meshes.push(m); return m;
    };
    add(mBld, this.matBuilding, true);
    add(mRoad, this.matRoad, false);
    add(mWalk, this.matWalk, false);
    add(mPath, this.matPath, false);
    const mk = add(mMark, this.matMark, false); if (mk) mk.renderOrder = 1;
    add(mTree, this.matFoliage, true);
    add(mProp, this.matProp, true);
    add(mLamp, this.matLamp, false, false);
    const glow = add(mGlow, this.matGlow, false, false); if (glow) { glow.renderOrder = 2; glow.visible = this.glowVisible; }
    return { meshes, glow };
  }

  // ── Bino ──────────────────────────────────────────────────────────────────
  _building(ctx, b) {
    const mb = ctx.mBld;
    const pts = b._pts, n = pts.length;
    const rnd = rng(hashStr(String(b.id)));
    const seed = rnd() * 100;
    let type = b.type || 'yes';
    let h = Math.max(2.6, b.h || 3.2);
    const area = b._area;
    // Uslub tanlash
    let style;
    if (type === 'house' || type === 'detached' || type === 'residential') style = 'house';
    else if (type === 'apartments' || type === 'dormitory') style = 'apart';
    else if (['industrial', 'warehouse', 'garage', 'garages', 'shed', 'roof', 'construction', 'farm_auxiliary', 'service', 'hangar', 'barn'].includes(type)) style = 'ind';
    else if (['school', 'kindergarten', 'university', 'hospital', 'government', 'public', 'civic', 'college'].includes(type)) style = 'civic';
    else if (['commercial', 'retail', 'hotel', 'office', 'supermarket'].includes(type) || b.poi) style = 'shop';
    else { // 'yes' — umumiy
      if (h <= 4.4 && area < 260) style = 'house';
      else if (h >= 8.5) style = 'apart';
      else style = 'shop';
    }
    if (style === 'house') h = Math.max(h, 3.4);
    if (style === 'apart') h = Math.max(h, 9);
    let fh = style === 'house' ? 3.2 : style === 'apart' ? 3.0 : style === 'civic' ? 3.8 : style === 'shop' ? 3.6 : 4.5;
    const nFl = Math.max(1, Math.round(h / fh)); fh = h / nFl;
    // Devor tekstura, rang, deraza turi
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    let tile, tint, kind;
    switch (style) {
      case 'house': tile = pick([T.YPLASTER, T.YPLASTER, T.PLASTER, T.WBRICK, T.YBRICK, T.CLAY, T.PLASTER]); kind = 1; break;
      case 'apart': tile = pick([T.PANEL, T.YBRICK, T.WBRICK, T.RBRICK, T.PANEL]); kind = 2; break;
      case 'civic': tile = pick([T.WBRICK, T.SAND, T.PLASTER]); kind = 1; break;
      case 'shop': tile = pick([T.PLASTER, T.SAND, T.WBRICK, T.PANEL]); kind = 3; break;
      default: tile = T.METAL; kind = 0;
    }
    if (tile === T.PLASTER || tile === T.YPLASTER || tile === T.CLAY || tile === T.WBRICK) tint = lin3(pick(PLASTER_TINTS));
    else if (tile === T.PANEL) tint = lin3(pick([0xffffff, 0xe8e4dc, 0xd8dcdc]));
    else tint = [1, 1, 1];
    const v = 0.88 + rnd() * 0.12; tint = [tint[0] * v, tint[1] * v, tint[2] * v];
    const shopFlag = (style === 'shop' || (style === 'apart' && rnd() < 0.18)) ? 1 : 0;

    // Devorlar
    const wall = (y0, y1, kindW, flrBase = 0) => {
      for (let i = 0; i < n; i++) {
        const p0 = pts[i], p1 = pts[(i + 1) % n];
        const dx = p1[0] - p0[0], dz = p1[1] - p0[1], len = Math.hypot(dx, dz);
        if (len < 0.25) continue;
        const nx = -dz / len, nz = dx / len;
        const cells = kindW ? Math.max(1, Math.round(len / 3.3)) : 1;
        const wk = (kindW && len < 1.6) ? 0 : kindW;
        const c1a = y0 / fh, c1b = y1 / fh;
        const a = mb.v(p0[0], y0, p0[1], nx, 0, nz, 0, y0, tint[0], tint[1], tint[2], 0, c1a, tile, wk, seed, shopFlag);
        const bq = mb.v(p1[0], y0, p1[1], nx, 0, nz, len, y0, tint[0], tint[1], tint[2], cells, c1a, tile, wk, seed, shopFlag);
        const c = mb.v(p1[0], y1, p1[1], nx, 0, nz, len, y1, tint[0], tint[1], tint[2], cells, c1b, tile, wk, seed, shopFlag);
        const d = mb.v(p0[0], y1, p0[1], nx, 0, nz, 0, y1, tint[0], tint[1], tint[2], 0, c1b, tile, wk, seed, shopFlag);
        mb.quad(a, bq, c, d);
      }
    };
    wall(0, h, kind);

    // Tom
    const ob = orientedBox(pts);
    const rect = area / Math.max(1, ob.len * ob.wid);
    const gable = (style === 'house' || (style === 'ind' && area < 400)) && rect > 0.74 && ob.wid < 15 && ob.len < 45 && rnd() < (style === 'house' ? 0.7 : 0.9);
    const roofTile = style === 'ind' ? T.METAL : pick([T.RCLAY, T.RGREY, T.METAL, T.RCLAY]);
    const roofTint = lin3(pick(ROOF_TINTS));
    if (gable) {
      const ov = 0.45, rise = clamp(ob.wid * 0.3, 1.2, 3.0);
      const { ux, uz, vx, vz } = ob;
      const P = (u, vv, y) => [ux * u + vx * vv, y, uz * u + vz * vv];
      const u0 = ob.u0 - ov, u1 = ob.u1 + ov, v0 = ob.v0 - ov, v1 = ob.v1 + ov, vm = (ob.v0 + ob.v1) / 2;
      const info = [roofTile, 0, seed, 0];
      const slope = Math.hypot(v1 - vm, rise);
      const eave = h - 0.25;
      const mk = (a, b2, c, d, uvs) => {
        const nrm = (() => { const e1 = [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0]; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L; return ny < 0 ? [-nx, -ny, -nz] : [nx, ny, nz]; })();
        Q(mb, a, b2, c, d, nrm[0], nrm[1], nrm[2], roofTint, info);
      };
      const A = P(u0, v0, eave), B = P(u1, v0, eave), C = P(u1, vm, h + rise), D = P(u0, vm, h + rise);
      const E = P(u0, v1, eave), F = P(u1, v1, eave);
      const L = u1 - u0;
      mk([...A, 0, 0], [...B, L, 0], [...C, L, slope], [...D, 0, slope]);
      mk([...E, 0, 0], [...F, L, 0], [...C, L, slope], [...D, 0, slope]);
      // Gable uchlari (uchburchak)
      for (const [uu, sgn] of [[ob.u0, -1], [ob.u1, 1]]) {
        const p0 = P(uu, ob.v0, h), p1 = P(uu, ob.v1, h), p2 = P(uu, vm, h + rise);
        const nx = ux * sgn, nz = uz * sgn;
        const col = tint;
        const i0 = mb.v(p0[0], p0[1], p0[2], nx, 0, nz, 0, 0, col[0], col[1], col[2], 0, 0, tile, 0, seed, 0);
        const i1 = mb.v(p1[0], p1[1], p1[2], nx, 0, nz, ob.wid, 0, col[0], col[1], col[2], 0, 0, tile, 0, seed, 0);
        const i2 = mb.v(p2[0], p2[1], p2[2], nx, 0, nz, ob.wid / 2, rise, col[0], col[1], col[2], 0, 0, tile, 0, seed, 0);
        // normal yo'nalishiga moslab tartiblash
        const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
        const cr = [e1[1] * e2[2] - e1[2] * e2[1], 0, e1[0] * e2[1] - e1[1] * e2[0]];
        if (cr[0] * nx + cr[2] * nz >= 0) mb.tri(i0, i1, i2); else mb.tri(i0, i2, i1);
      }
    } else {
      // Tekis tom + parapet
      const par = style === 'ind' ? 0.0 : 0.5;
      if (par > 0) {
        const kw = 0;
        const hs = fh; // texture uchun
        // tashqi parapet
        for (let i = 0; i < n; i++) {
          const p0 = pts[i], p1 = pts[(i + 1) % n];
          const dx = p1[0] - p0[0], dz = p1[1] - p0[1], len = Math.hypot(dx, dz);
          if (len < 0.25) continue;
          const nx = -dz / len, nz = dx / len;
          const col = tint;
          const a = mb.v(p0[0], h, p0[1], nx, 0, nz, 0, h, col[0], col[1], col[2], 0, 0, tile, 0, seed, 0);
          const b2 = mb.v(p1[0], h, p1[1], nx, 0, nz, len, h, col[0], col[1], col[2], 0, 0, tile, 0, seed, 0);
          const c = mb.v(p1[0], h + par, p1[1], nx, 0, nz, len, h + par, col[0], col[1], col[2], 0, 0, tile, 0, seed, 0);
          const d = mb.v(p0[0], h + par, p0[1], nx, 0, nz, 0, h + par, col[0], col[1], col[2], 0, 0, tile, 0, seed, 0);
          mb.quad(a, b2, c, d);
          // ichki yuz (teskari)
          const a2 = mb.v(p0[0], h, p0[1], -nx, 0, -nz, 0, h, col[0] * 0.85, col[1] * 0.85, col[2] * 0.85, 0, 0, tile, 0, seed, 0);
          const b3 = mb.v(p1[0], h, p1[1], -nx, 0, -nz, len, h, col[0] * 0.85, col[1] * 0.85, col[2] * 0.85, 0, 0, tile, 0, seed, 0);
          const c3 = mb.v(p1[0], h + par, p1[1], -nx, 0, -nz, len, h + par, col[0] * 0.85, col[1] * 0.85, col[2] * 0.85, 0, 0, tile, 0, seed, 0);
          const d3 = mb.v(p0[0], h + par, p0[1], -nx, 0, -nz, 0, h + par, col[0] * 0.85, col[1] * 0.85, col[2] * 0.85, 0, 0, tile, 0, seed, 0);
          mb.quad(a2, d3, c3, b3);
          // parapet usti (yupqa)
          void kw; void hs;
        }
      }
      const tris = triangulate(pts);
      const base = mb.n;
      const rt = style === 'ind' ? T.METAL : (rnd() < 0.5 ? T.CONC : T.METAL);
      const rcol = style === 'ind' ? roofTint : [0.62 * roofTint[0], 0.62 * roofTint[1], 0.62 * roofTint[2]];
      for (const p of pts) mb.v(p[0], h, p[1], 0, 1, 0, p[0], p[1], rcol[0], rcol[1], rcol[2], 0, 0, rt, 0, seed, 0);
      for (const t of tris) mb.tri(base + t[0], base + t[1], base + t[2]);
      // Tom ustidagi tafsilotlar
      if (area > 120 && style !== 'ind') {
        const cnt = Math.min(3, 1 + Math.floor(area / 400));
        for (let k = 0; k < cnt; k++) {
          const u = lerp(ob.u0, ob.u1, 0.2 + rnd() * 0.6), vv = lerp(ob.v0, ob.v1, 0.25 + rnd() * 0.5);
          const x = ob.ux * u + ob.vx * vv, z = ob.uz * u + ob.vz * vv;
          const bw = 1.2 + rnd() * 1.4, bh = 0.9 + rnd() * 1.2;
          if (![[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([a, c]) => pointInPoly(x + a * bw, z + c * bw, pts))) continue;
          this._box(mb, x, h, z, bw, bh, bw * (0.8 + rnd() * 0.6), ob.ux, ob.uz, tint, T.CONC, seed);
        }
      }
    }
  }

  // Oddiy quti (tom jihozlari) — burilgan
  _box(mb, x, y, z, hw, hh, hd, ux, uz, col, tile, seed) {
    const vx = -uz, vz = ux;
    const C = (a, b) => [x + ux * a * hw + vx * b * hd, z + uz * a * hw + vz * b * hd];
    const c = [C(-1, -1), C(1, -1), C(1, 1), C(-1, 1)];
    const info = [tile, 0, seed, 0];
    for (let i = 0; i < 4; i++) {
      const p0 = c[i], p1 = c[(i + 1) % 4];
      const dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dx, dz);
      Q(mb, [p0[0], y, p0[1], 0, 0], [p1[0], y, p1[1], l, 0], [p1[0], y + hh, p1[1], l, hh], [p0[0], y + hh, p0[1], 0, hh], dz / l * -1, 0, dx / l, col, info);
    }
    Q(mb, [...c[0].slice(0, 1), y + hh, c[0][1], 0, 0], [c[1][0], y + hh, c[1][1], 1, 0], [c[2][0], y + hh, c[2][1], 1, 1], [c[3][0], y + hh, c[3][1], 0, 1], 0, 1, 0, col, info);
  }

  // ── Yo'l (bir segment) ────────────────────────────────────────────────────
  _prepRoad(r) {
    if (r._m) return;
    const c = r.coords, n = c.length;
    const sn = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = c[i + 1][0] - c[i][0], dz = c[i + 1][1] - c[i][1], l = Math.hypot(dx, dz) || 1;
      sn.push([-dz / l, dx / l]);
    }
    const mx = [], mz = [], sc = [];
    for (let k = 0; k < n; k++) {
      let ax, az, s = 1;
      if (k === 0) [ax, az] = sn[0] || [0, 1];
      else if (k === n - 1) [ax, az] = sn[n - 2];
      else {
        const sx = sn[k - 1][0] + sn[k][0], sz = sn[k - 1][1] + sn[k][1], L = Math.hypot(sx, sz);
        if (L < 0.2) { [ax, az] = sn[k]; }
        else { ax = sx / L; az = sz / L; s = 1 / Math.max(0.55, ax * sn[k][0] + az * sn[k][1]); }
      }
      mx.push(ax); mz.push(az); sc.push(Math.min(s, 2.0));
    }
    r._m = { mx, mz, sc, sn };
  }
  _off(r, k, o) {
    const m = r._m, c = r.coords[k];
    return [c[0] + m.mx[k] * m.sc[k] * o, c[1] + m.mz[k] * m.sc[k] * o];
  }

  _roadSeg(ctx, r, i) {
    if (r.r < 0) return this._footSeg(ctx, r, i);
    this._prepRoad(r);
    const hw = r.w / 2, c = r.coords;
    const cls = clamp(r.r, 0, 6);
    const y = (r.br ? 0.06 : Y_ROAD) + cls * 0.006;
    const shade = r.w < 4 ? 1.15 : 1.0;
    const col = [shade * 0.95, shade * 0.95, shade * 0.95];
    const uv = (p, yy) => [p[0], yy, p[1], p[0] / 3.5, p[1] / 3.5];
    const L0 = this._off(r, i, hw), R0 = this._off(r, i, -hw), L1 = this._off(r, i + 1, hw), R1 = this._off(r, i + 1, -hw);
    Q(ctx.mRoad, uv(L0, y), uv(R0, y), uv(R1, y), uv(L1, y), 0, 1, 0, col);
    const mx = (c[i][0] + c[i + 1][0]) / 2, mz = (c[i][1] + c[i + 1][1]) / 2;
    const segLen = Math.hypot(c[i + 1][0] - c[i][0], c[i + 1][1] - c[i][1]);

    // Yo'laklar
    const sw = r.br ? 0 : (cls >= 4 ? 2.6 : cls >= 2 ? 2.0 : cls === 1 ? 1.2 : 0);
    if (sw > 0 && !this._onOtherRoad(mx, mz, r.id, 0.2)) {
      for (const side of [1, -1]) {
        const o0 = hw * side, o1 = (hw + sw) * side;
        const a0 = this._off(r, i, o0), b0 = this._off(r, i, o1), a1 = this._off(r, i + 1, o0), b1 = this._off(r, i + 1, o1);
        const wcol = [0.9, 0.9, 0.9];
        const wv = (p, yy) => [p[0], yy, p[1], p[0] / 2.2, p[1] / 2.2];
        Q(ctx.mWalk, wv(a0, Y_CURB), wv(b0, Y_CURB), wv(b1, Y_CURB), wv(a1, Y_CURB), 0, 1, 0, wcol);
        // bordyur (yo'l tomondan)
        const nx = -r._m.sn[i][0] * side, nz = -r._m.sn[i][1] * side;
        const cv = (p, yy) => [p[0], yy, p[1], 0, 0];
        Q(ctx.mWalk, cv(a0, y), cv(a1, y), cv(a1, Y_CURB), cv(a0, Y_CURB), nx, 0, nz, [0.78, 0.78, 0.76]);
      }
    }

    // Chiziqlar
    if (!r.br && r.w >= 5 && !this._onOtherRoad(mx, mz, r.id, 1.5) && segLen > 3) {
      const ym = y + 0.012;
      const dir = r._m.sn[i];                 // chap normal
      const tx = -dir[1], tz = dir[0];         // yo'nalish (tangent)
      const white = [0.88, 0.88, 0.86], yel = [0.9, 0.72, 0.15];
      const strip = (o, w2, t0, t1, colr) => {
        const p0 = [c[i][0] + (c[i + 1][0] - c[i][0]) * t0, c[i][1] + (c[i + 1][1] - c[i][1]) * t0];
        const p1 = [c[i][0] + (c[i + 1][0] - c[i][0]) * t1, c[i][1] + (c[i + 1][1] - c[i][1]) * t1];
        const a = [p0[0] + dir[0] * (o + w2), ym, p0[1] + dir[1] * (o + w2), 0, 0], b = [p0[0] + dir[0] * (o - w2), ym, p0[1] + dir[1] * (o - w2), 0, 0];
        const d = [p1[0] + dir[0] * (o + w2), ym, p1[1] + dir[1] * (o + w2), 0, 0], e = [p1[0] + dir[0] * (o - w2), ym, p1[1] + dir[1] * (o - w2), 0, 0];
        Q(ctx.mMark, a, b, e, d, 0, 1, 0, colr);
      };
      // markaziy chiziq (ikki tomonlama) yoki lenta
      if (!r.ow) {
        if (r.w >= 7) { strip(0.14, 0.07, 0, 1, yel); strip(-0.14, 0.07, 0, 1, yel); }
        else {
          const dash = 3.0, gap = 4.0, per = dash + gap;
          const off0 = (hashStr(String(r.id)) % 7);
          for (let s = -off0; s < segLen; s += per) {
            const a0 = Math.max(0, s), a1 = Math.min(segLen, s + dash);
            if (a1 - a0 > 0.3) strip(0, 0.08, a0 / segLen, a1 / segLen, white);
          }
        }
      } else if (r.w >= 7) {
        const dash = 3.0, gap = 4.0, per = dash + gap;
        for (let s = 0; s < segLen; s += per) { const a0 = s, a1 = Math.min(segLen, s + dash); if (a1 - a0 > 0.3) strip(0, 0.08, a0 / segLen, a1 / segLen, white); }
      }
      // chetki chiziqlar
      if (r.w >= 7) { strip(hw - 0.45, 0.06, 0, 1, white); strip(-hw + 0.45, 0.06, 0, 1, white); }
      void tx; void tz;
    }

    // Chiroqlar va daraxtlar: bir marta har ~N metrda (segment boshida emas, yig'ilgan masofa bo'yicha)
    if (!r.br && cls >= 2 && r.w >= 6) this._streetFurniture(ctx, r, i, segLen, hw, sw);
  }

  _footSeg(ctx, r, i) {
    this._prepRoad(r);
    const hw = Math.max(1.0, r.w / 2), y = Y_PATH;
    const c = r.coords;
    const mx = (c[i][0] + c[i + 1][0]) / 2, mz = (c[i][1] + c[i + 1][1]) / 2;
    if (this._onAnyRoad(mx, mz, 0.5)) return;
    const L0 = this._off(r, i, hw), R0 = this._off(r, i, -hw), L1 = this._off(r, i + 1, hw), R1 = this._off(r, i + 1, -hw);
    const f = (p) => [p[0], y, p[1], p[0] / 2.5, p[1] / 2.5];
    Q(ctx.mPath, f(L0), f(R0), f(R1), f(L1), 0, 1, 0, [0.9, 0.88, 0.84]);
  }

  // ── Ko'cha jihozlari ──────────────────────────────────────────────────────
  _streetFurniture(ctx, r, i, segLen, hw, sw) {
    const c = r.coords;
    const key = r.id;
    let acc = ctx.lampAcc.get(key) ?? (r._cum?.[i]);
    if (!r._cum) {
      r._cum = [0];
      for (let k = 0; k < c.length - 1; k++) r._cum.push(r._cum[k] + Math.hypot(c[k + 1][0] - c[k][0], c[k + 1][1] - c[k][1]));
    }
    const start = r._cum[i], end = start + segLen;
    const step = 12;
    const R = ctx.R;
    const dir = r._m.sn[i];
    for (let s = Math.ceil(start / step) * step; s < end; s += step) {
      const t = (s - start) / segLen;
      const x = c[i][0] + (c[i + 1][0] - c[i][0]) * t, z = c[i][1] + (c[i + 1][1] - c[i][1]) * t;
      const idx = Math.round(s / step);
      for (const side of [1, -1]) {
        const o = (hw + (sw > 0 ? sw * 0.5 : 1.6) + (idx % 2 ? 0.4 : 0)) * side;
        const px = x + dir[0] * o, pz = z + dir[1] * o;
        if (this._onOtherRoad(px, pz, r.id, 1.0) || this.insideSolid(px, pz)) continue;
        const hsh = ((hashStr(r.id + ':' + idx + ':' + side) % 1000) / 1000);
        if ((idx + (side > 0 ? 0 : 1)) % 3 === 0 && r.r >= 3) this._lamp(ctx, px, pz, dir[0] * -side, dir[1] * -side);
        else if (hsh < 0.7 * this.q.trees) this._tree(ctx, px, pz, hsh, true);
      }
    }
    void R; void acc;
  }

  _lamp(ctx, x, z, ax, az) {
    const pole = lin3(0x3a3f45);
    const mp = ctx.mProp;
    const g = new THREE.CylinderGeometry(0.06, 0.09, 7.2, 6); g.translate(0, 3.6, 0);
    addGeom(mp, g, composeMatrix(x, 0, z), pole); g.dispose();
    // qo'l
    const arm = new THREE.BoxGeometry(0.08, 0.08, 1.6); arm.translate(0, 0, 0.8);
    const rot = Math.atan2(ax, az);
    addGeom(mp, arm, composeMatrix(x, 7.1, z, rot), pole); arm.dispose();
    const hx = x + ax * 1.5, hz = z + az * 1.5;
    const head = new THREE.BoxGeometry(0.34, 0.1, 0.7);
    addGeom(ctx.mLamp, head, composeMatrix(hx, 7.0, hz, rot), lin3(0xffffff)); head.dispose();
    // yerdagi yorug'lik dog'i (faqat tunda)
    const R = 7;
    Q(ctx.mGlow, [hx - R, 0.2, hz - R, 0, 0], [hx + R, 0.2, hz - R, 1, 0], [hx + R, 0.2, hz + R, 1, 1], [hx - R, 0.2, hz + R, 0, 1], 0, 1, 0, [1, 1, 1]);
    this._addCollider({ t: 1, x, z, r: 0.25 });
  }

  // ── Daraxt ────────────────────────────────────────────────────────────────
  _tree(ctx, x, z, h01, street = false) {
    const rnd = rng(Math.floor(h01 * 1e6) + Math.floor(x * 13) + Math.floor(z * 7));
    const kind = rnd() < 0.38 ? 'poplar' : 'chinar';
    const mt = ctx.mTree;
    const trunkCol = lin3(0x5a4630);
    const s = 0.85 + rnd() * 0.5;
    const lc = (base, v) => { const c = lin3(base); const k = 0.82 + v * 0.36; return [c[0] * k, c[1] * k, c[2] * k]; };
    const greens = [0x4a7a2c, 0x56852f, 0x3f6e28, 0x628a3a];
    const gbase = greens[Math.floor(rnd() * greens.length)];
    if (kind === 'poplar') {
      const hgt = 9 * s;
      const tr = new THREE.CylinderGeometry(0.1, 0.18, hgt * 0.35, 6); tr.translate(0, hgt * 0.175, 0);
      addGeom(mt, tr, composeMatrix(x, 0, z), trunkCol); tr.dispose();
      const bl = new THREE.IcosahedronGeometry(1, 1);
      const m = composeMatrix(x, hgt * 0.62, z, rnd() * 6.28, 0.9 * s, hgt * 0.42, 0.9 * s);
      addGeom(mt, bl, m, null, (i, p) => lc(gbase, clamp((p.y - hgt * 0.2) / hgt, 0, 1) * 0.7 + Math.sin(p.x * 3 + p.z * 5 + i) * 0.15)); bl.dispose();
    } else {
      const hgt = 5.2 * s;
      const tr = new THREE.CylinderGeometry(0.14, 0.25, hgt * 0.7, 6); tr.translate(0, hgt * 0.35, 0);
      addGeom(mt, tr, composeMatrix(x, 0, z), trunkCol); tr.dispose();
      const blobs = [[0, 0.0, 0, 2.2], [1.2, -0.3, 0.4, 1.7], [-1.0, -0.2, 0.8, 1.7], [0.2, 0.5, -1.1, 1.6], [0, 1.2, 0, 1.5]];
      for (const [bx, by, bz, br] of blobs) {
        const bl = new THREE.IcosahedronGeometry(1, 1);
        const m = composeMatrix(x + bx * s, hgt + by * s, z + bz * s, rnd() * 6.28, br * s, br * s * 0.85, br * s);
        addGeom(mt, bl, m, null, (i, p) => lc(gbase, clamp((p.y - hgt + 1.5) / 4, 0, 1) + Math.sin(p.x * 4 + p.z * 3 + i * 0.7) * 0.12)); bl.dispose();
      }
    }
    this._addCollider({ t: 1, x, z, r: 0.28 });
  }

  _parkTrees(ctx, z) {
    const bb = z._bb, area = (bb[2] - bb[0]) * (bb[3] - bb[1]);
    const cnt = Math.min(28, Math.floor(area / 1200 * this.q.trees));
    const rnd = rng(hashStr('pk' + z.id));
    const pts = z.coords;
    for (let k = 0, tries = 0; k < cnt && tries < cnt * 4; tries++) {
      const x = lerp(bb[0], bb[2], rnd()), zz = lerp(bb[1], bb[3], rnd());
      if (!pointInPoly(x, zz, pts)) continue;
      if (this._onAnyRoad(x, zz, 2) || this.insideSolid(x, zz)) continue;
      this._tree(ctx, x, zz, rnd(), false); k++;
    }
  }
  _yardTrees(ctx, blds) {
    for (const b of blds) {
      if (b._area < 40 || b._area > 420 || b.h > 7) continue;
      const rnd = rng(hashStr('yd' + b.id));
      if (rnd() > 0.55 * this.q.trees) continue;
      const a = rnd() * 6.28, d = Math.sqrt(b._area) * 0.5 + 3 + rnd() * 4;
      const x = b.cx + Math.cos(a) * d, z = b.cz + Math.sin(a) * d;
      if (this._onAnyRoad(x, z, 3) || this.insideSolid(x, z)) continue;
      this._tree(ctx, x, z, rnd(), false);
    }
  }

  // POI: avtobus bekati, yoqilg'i shaxobchasi tomi va h.k.
  _poiProp(ctx, p) {
    const mp = ctx.mProp;
    if (p.poi === 'bus') {
      const col = lin3(0x2a6fb0), post = lin3(0x444a50);
      const roof = new THREE.BoxGeometry(3.6, 0.1, 1.5); addGeom(mp, roof, composeMatrix(p.x, 2.5, p.z), col); roof.dispose();
      for (const sx of [-1.7, 1.7]) { const g = new THREE.BoxGeometry(0.08, 2.5, 0.08); addGeom(mp, g, composeMatrix(p.x + sx, 1.25, p.z - 0.6), post); g.dispose(); }
      const back = new THREE.BoxGeometry(3.4, 1.4, 0.05); addGeom(mp, back, composeMatrix(p.x, 1.6, p.z - 0.7), lin3(0x9fd0e8)); back.dispose();
      const bench = new THREE.BoxGeometry(2.6, 0.08, 0.45); addGeom(mp, bench, composeMatrix(p.x, 0.5, p.z - 0.4), lin3(0x8a6a44)); bench.dispose();
    }
  }

  dispose() {
    for (const ch of this.chunks.values()) this._disposeChunk(ch);
    this.chunks.clear();
    this.root.parent?.remove(this.root);
  }
}
