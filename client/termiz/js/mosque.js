// Termiz — Hakim at-Termiziy jome masjidi majmuasi (prosedural, Markaziy Osiyo uslubi)
// Mahalliy koordinatalar: x — qibla bo'ylab (+x = qibla, orqa devor), z — ko'ndalang, y — yuqoriga.
// Guruh dunyo koordinatasiga MOSQUE.cx/cz va burilish bilan joylanadi.
import * as THREE from 'three';
import { MOSQUE } from '../config.js';
import { MeshBuilder, composeMatrix, addGeom, lin3, smoothstep, clamp, rng, polyCentroid } from './util.js';
import { tileTexture, carpetTexture, bandTexture } from './tex.js';

const HX = MOSQUE.L / 2, HZ = MOSQUE.W / 2;     // zal yarim o'lchamlari
const WALL_H = 13, WALL_T = 1.4, POD_H = 0.6;
const POD = { x0: -52, x1: 48, z0: -38, z1: 38 };

// Yuz (4 uchli) — normalga qarab o'zi tartiblanadi; UV metrik
function face(mb, p, n, uvf, col = [1, 1, 1]) {
  const [a, b, c, d] = p;
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
  const q = (cx * n[0] + cy * n[1] + cz * n[2] < 0) ? [a, d, c, b] : [a, b, c, d];
  const ids = q.map(v => { const uv = uvf(v); return mb.v(v[0], v[1], v[2], n[0], n[1], n[2], uv[0], uv[1], col[0], col[1], col[2]); });
  mb.quad(ids[0], ids[1], ids[2], ids[3]);
}
function box(mb, x0, x1, y0, y1, z0, z1, s = 0.3, col = [1, 1, 1]) {
  const V = (x, y, z) => [x, y, z];
  const ux = (v) => [v[2] * s, v[1] * s], uz = (v) => [v[0] * s, v[1] * s], uy = (v) => [v[0] * s, v[2] * s];
  face(mb, [V(x1, y0, z0), V(x1, y0, z1), V(x1, y1, z1), V(x1, y1, z0)], [1, 0, 0], ux, col);
  face(mb, [V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0)], [-1, 0, 0], ux, col);
  face(mb, [V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1)], [0, 0, 1], uz, col);
  face(mb, [V(x0, y0, z0), V(x1, y0, z0), V(x1, y1, z0), V(x0, y1, z0)], [0, 0, -1], uz, col);
  face(mb, [V(x0, y1, z0), V(x1, y1, z0), V(x1, y1, z1), V(x0, y1, z1)], [0, 1, 0], uy, col);
  face(mb, [V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1)], [0, -1, 0], uy, col);
}

function archShape(w, h, r = w / 2) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(-w / 2, h - r); s.absarc(0, h - r, r, Math.PI, 0, true); s.lineTo(w / 2, 0); s.lineTo(-w / 2, 0);
  return s;
}

// Gumbaz profili (Temuriylar uslubidagi biroz bo'rtgan, uchi o'tkir)
function domeGeometry(R, H, seg = 56, ribs = 20, ribAmp = 0.035) {
  const pts = [];
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const r = R * Math.sqrt(Math.max(0, 1 - Math.pow(f, 2.3))) * (1 + 0.1 * Math.sin(Math.PI * Math.min(1, f * 1.15)));
    pts.push(new THREE.Vector2(Math.max(r, 0.001), H * f));
  }
  const g = new THREE.LatheGeometry(pts, seg);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), th = Math.atan2(z, x);
    const k = 1 + ribAmp * Math.cos(th * ribs);
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

export function buildMosque(world, tex) {
  const group = new THREE.Group(); group.name = 'mosque';
  const th = Math.atan2(-MOSQUE.qz, MOSQUE.qx);
  group.position.set(MOSQUE.cx, 0, MOSQUE.cz);
  group.rotation.y = th;
  const colliders = [];
  const cth = Math.cos(th), sth = Math.sin(th);
  // mahalliy (a,b) -> dunyo (x,z):  x = cx + a*cos + b*sin ; z = cz - a*sin + b*cos
  const wp = (a, b) => [MOSQUE.cx + a * cth + b * sth, MOSQUE.cz - a * sth + b * cth];
  const seg = (a0, b0, a1, b1, t = 0.8) => { const p = wp(a0, b0), q = wp(a1, b1); colliders.push({ t: 2, x0: p[0], z0: p[1], x1: q[0], z1: q[1], th: t }); };
  const circ = (a, b, r) => { const p = wp(a, b); colliders.push({ t: 1, x: p[0], z: p[1], r }); };

  // ── Materiallar ───────────────────────────────────────────────────────────
  const clone = (t, rx, ry) => { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(rx, ry); c.needsUpdate = true; return c; };
  const stoneT = tex.get('white_sandstone_bricks'), marbleT = tex.get('marble_tiles'), pavT = tex.get('concrete_pavement');
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    stone: std({ map: stoneT.map, normalMap: stoneT.normalMap, color: 0xffffff, roughness: 0.92, vertexColors: true, side: THREE.DoubleSide }),
    stoneIn: std({ map: stoneT.map, color: 0xfff0d0, roughness: 0.9, vertexColors: true, emissive: 0x3a3022, side: THREE.DoubleSide }),
    marble: std({ map: marbleT.map, normalMap: marbleT.normalMap, color: 0xf4eee0, roughness: 0.35, metalness: 0.0, vertexColors: true, emissive: 0x2a2620 }),
    carpet: std({ map: carpetTexture(), roughness: 1, vertexColors: true, emissive: 0x10281a }),
    tile: std({ map: tileTexture(), roughness: 0.28, metalness: 0.1, vertexColors: true, side: THREE.DoubleSide }),
    dome: std({ map: tileTexture(), roughness: 0.25, metalness: 0.15, side: THREE.DoubleSide, emissive: 0x06303a }),
    band: std({ map: bandTexture(), roughness: 0.5 }),
    stoneP: std({ map: stoneT.map, normalMap: stoneT.normalMap, color: 0xfff4dc, roughness: 0.9 }),
    gold: std({ color: 0xd9ac3a, roughness: 0.3, metalness: 0.85 }),
    wood: std({ color: 0x6a4126, roughness: 0.7, vertexColors: true }),
    glass: std({ color: 0x101c2c, roughness: 0.08, metalness: 0.2, emissive: 0xffc070, emissiveIntensity: 0 }),
    frame: std({ color: 0x1590a8, roughness: 0.4, vertexColors: true }),
    lampE: new THREE.MeshBasicMaterial({ color: 0xffe2a0 }),
    water: std({ color: 0x3aa0c0, roughness: 0.05, transparent: true, opacity: 0.85 }),
    hedge: std({ color: 0x2f5a24, roughness: 1 }),
  };
  M.dome.map.repeat.set(10, 4); M.dome.map.wrapS = M.dome.map.wrapT = THREE.RepeatWrapping;
  M.band.map.wrapS = M.band.map.wrapT = THREE.RepeatWrapping; M.band.map.repeat.set(6, 1);
  const cream = lin3(0xf6ecd2), creamD = lin3(0xe2d4b0), white = [1, 1, 1], turq = lin3(0x1d97ae);

  const mbStone = new MeshBuilder(), mbIn = new MeshBuilder(), mbMarble = new MeshBuilder(), mbCarpet = new MeshBuilder();
  const mbTile = new MeshBuilder(), mbWood = new MeshBuilder(), mbGlass = new MeshBuilder(), mbFrame = new MeshBuilder();

  // ── Podium + zinapoya ─────────────────────────────────────────────────────
  box(mbStone, POD.x0, POD.x1, 0, POD_H, POD.z0, POD.z1, 0.3, cream);
  // old zinapoyalar (kirish maydoniga)
  for (let i = 0; i < 3; i++) box(mbStone, POD.x0 - 1.2 * (i + 1), POD.x0, 0, POD_H * (1 - (i + 1) / 4 * 0.9), -14, 14, 0.3, cream);

  // ── Zal devorlari (eshik oraliqlari bilan) ────────────────────────────────
  const wallBox = (x0, x1, z0, z1) => { box(mbStone, x0, x1, 0, WALL_H, z0, z1, 0.28, cream); };
  const DOOR_F = 3.6;                         // old eshik yarim kengligi
  // old devor
  wallBox(-HX - WALL_T / 2, -HX + WALL_T / 2, -HZ, -DOOR_F); wallBox(-HX - WALL_T / 2, -HX + WALL_T / 2, DOOR_F, HZ);
  box(mbStone, -HX - WALL_T / 2, -HX + WALL_T / 2, 9, WALL_H, -DOOR_F, DOOR_F, 0.28, cream);   // eshik ustidagi to'sin
  seg(-HX, -HZ, -HX, -DOOR_F, 0.9); seg(-HX, DOOR_F, -HX, HZ, 0.9);
  // orqa (qibla) devor
  wallBox(HX - WALL_T / 2, HX + WALL_T / 2, -HZ, HZ); seg(HX, -HZ, HX, HZ, 0.9);
  // yon devorlar, eshiklar x∈[-28,-24]
  for (const sgn of [-1, 1]) {
    const z = sgn * HZ;
    wallBox(-HX, -28, z - WALL_T / 2, z + WALL_T / 2); wallBox(-24, HX, z - WALL_T / 2, z + WALL_T / 2);
    box(mbStone, -28, -24, 7, WALL_H, z - WALL_T / 2, z + WALL_T / 2, 0.28, cream);
    seg(-HX, z, -28, z, 0.9); seg(-24, z, HX, z, 0.9);
  }
  // tom plitasi + parapet
  box(mbStone, -HX - 0.5, HX + 0.5, WALL_H, WALL_H + 0.6, -HZ - 0.5, HZ + 0.5, 0.28, cream);
  const mer = new MeshBuilder();
  for (let x = -HX - 0.3; x < HX; x += 2.6) for (const z of [-HZ - 0.3, HZ + 0.1]) box(mer, x, x + 1.3, WALL_H + 0.6, WALL_H + 1.7, z, z + 0.4, 0.3, creamD);
  for (let z = -HZ; z < HZ; z += 2.6) for (const x of [-HX - 0.3, HX - 0.1]) box(mer, x, x + 0.4, WALL_H + 0.6, WALL_H + 1.7, z, z + 1.3, 0.3, creamD);
  // gumbaz ostidagi "poyabzal" belbog'i (turquoise lenta)
  const strip = (x0, x1, z0, z1) => box(mbTile, x0, x1, 10.4, 11.0, z0, z1, 0.6, white);
  strip(-HX - 0.75, -HX - 0.7, -HZ, HZ); strip(HX + 0.7, HX + 0.75, -HZ, HZ);

  // ── Deraza dekorlari (kamar) ──────────────────────────────────────────────
  const winShape = archShape(2.6, 5.4), frameShape = archShape(3.3, 6.1);
  const winG = new THREE.ShapeGeometry(winShape, 10), frG = new THREE.ShapeGeometry(frameShape, 10);
  const addWin = (x, z, nx, nz, y0) => {
    const rot = Math.atan2(nx, nz);
    const o = 0.04;
    addGeom(mbFrame, frG, composeMatrix(x + nx * o, y0 - 0.35, z + nz * o, rot), turq);
    addGeom(mbGlass, winG, composeMatrix(x + nx * (o + 0.03), y0, z + nz * (o + 0.03), rot), white);
  };
  const lowW = new THREE.ShapeGeometry(archShape(1.7, 3.0), 8), lowF = new THREE.ShapeGeometry(archShape(2.2, 3.5), 8);
  const addLow = (x, z, nx, nz) => {
    const rot = Math.atan2(nx, nz);
    addGeom(mbFrame, lowF, composeMatrix(x + nx * 0.04, 1.35, z + nz * 0.04, rot), turq);
    addGeom(mbGlass, lowW, composeMatrix(x + nx * 0.07, 1.6, z + nz * 0.07, rot), white);
  };
  const o = WALL_T / 2;
  // old va orqa devor
  for (let z = -HZ + 3.5; z < HZ - 2; z += 4.7) {
    if (Math.abs(z) > 4.5) { addWin(-HX - o, z, -1, 0, 5.8); addLow(-HX - o, z, -1, 0); }
    if (Math.abs(z) > 6) { addWin(HX + o, z, 1, 0, 5.8); addLow(HX + o, z, 1, 0); }
  }
  // yon devorlar
  for (const sgn of [-1, 1]) for (let x = -HX + 4; x < HX - 2; x += 4.7) {
    if (x > -31 && x < -21) continue;
    addWin(x, sgn * (HZ + o), 0, sgn, 5.8); addLow(x, sgn * (HZ + o), 0, sgn);
  }
  // ichki tomondagi derazalar (faqat shisha) — yon va orqa
  for (const sgn of [-1, 1]) for (let x = -HX + 4; x < HX - 2; x += 4.7) {
    if (x > -31 && x < -21) continue;
    const rot = Math.atan2(0, -sgn);
    addGeom(mbGlass, winG, composeMatrix(x, 5.8, sgn * (HZ - o - 0.04), rot), white);
  }

  // ── Pishtaq (kirish portali) ──────────────────────────────────────────────
  {
    const PW = 10, PH = 21, DEP = 4.4, OW = 3.9, OH = 12.2;
    const sh = new THREE.Shape();
    sh.moveTo(-PW, 0); sh.lineTo(PW, 0); sh.lineTo(PW, PH); sh.lineTo(-PW, PH); sh.lineTo(-PW, 0);
    const hole = new THREE.Path();
    hole.moveTo(-OW, POD_H); hole.lineTo(-OW, OH - OW); hole.absarc(0, OH - OW, OW, Math.PI, 0, true); hole.lineTo(OW, POD_H); hole.lineTo(-OW, POD_H);
    sh.holes.push(hole);
    const eg = new THREE.ExtrudeGeometry(sh, { depth: DEP, bevelEnabled: false, curveSegments: 20 });
    const Mx = new THREE.Matrix4().set(0, 0, -1, -HX - WALL_T / 2, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
    eg.applyMatrix4(Mx);
    // UVni metrik qilib qoldiramiz (ExtrudeGeometry o'zi metrik beradi)
    const pt = new MeshBuilder();
    addGeom(pt, eg, new THREE.Matrix4(), cream);
    // kamar atrofi — firuza koshin lentasi
    const bandOut = archShape(2 * OW + 2.6, OH + 1.3, OW + 1.3);
    const bandHole = archShape(2 * OW, OH, OW); bandOut.holes.push(new THREE.Path(bandHole.getPoints(20).reverse()));
    const bg = new THREE.ShapeGeometry(bandOut, 20);
    addGeom(mbTile, bg, composeMatrix(-HX - WALL_T / 2 - DEP - 0.03, POD_H, 0, -Math.PI / 2), white);
    // kamar ichidagi chuqurlik: eshik yuzasidagi koshin panel
    const inner = new THREE.ShapeGeometry(archShape(2 * OW, OH, OW), 20);
    // yuqori bezak: koshin to'rtburchak panel
    face(mbTile, [[-HX - WALL_T / 2 - DEP - 0.04, 13.2, -PW + 1.2], [-HX - WALL_T / 2 - DEP - 0.04, 13.2, -OW - 1.6], [-HX - WALL_T / 2 - DEP - 0.04, 19.6, -OW - 1.6], [-HX - WALL_T / 2 - DEP - 0.04, 19.6, -PW + 1.2]], [-1, 0, 0], (v) => [v[2] * 0.5, v[1] * 0.5], white);
    face(mbTile, [[-HX - WALL_T / 2 - DEP - 0.04, 13.2, OW + 1.6], [-HX - WALL_T / 2 - DEP - 0.04, 13.2, PW - 1.2], [-HX - WALL_T / 2 - DEP - 0.04, 19.6, PW - 1.2], [-HX - WALL_T / 2 - DEP - 0.04, 19.6, OW + 1.6]], [-1, 0, 0], (v) => [v[2] * 0.5, v[1] * 0.5], white);
    inner.dispose();
    group.add(new THREE.Mesh(pt.build(), M.stone));
    // yuqori merlonlar
    for (let z = -PW; z < PW; z += 2.5) box(mer, -HX - WALL_T / 2 - DEP, -HX - WALL_T / 2, PH, PH + 0.9, z, z + 1.3, 0.3, creamD);
    // portal minoracha (burchaklarda)
    for (const sz of [-PW + 0.6, PW - 0.6]) {
      const cyl = new THREE.CylinderGeometry(1.0, 1.15, 5, 12); addGeom(mbStone, cyl, composeMatrix(-HX - WALL_T / 2 - DEP / 2, PH + 2.5, sz), cream);
      const cone = new THREE.ConeGeometry(1.25, 2.4, 12); const cm = new MeshBuilder(); addGeom(cm, cone, composeMatrix(-HX - WALL_T / 2 - DEP / 2, PH + 6.2, sz), white);
      group.add(new THREE.Mesh(cm.build(), M.dome));
      cyl.dispose(); cone.dispose();
    }
    // Zinapoya bilan eshik oldi ramp (kolliderlar)
    seg(-HX - 2.2, -PW, -HX - 2.2, -OW - 0.4, 2.2); seg(-HX - 2.2, OW + 0.4, -HX - 2.2, PW, 2.2);
    eg.dispose(); bg.dispose();
  }

  // ── Mehrob burni (orqa devor tashqarisida) ─────────────────────────────────
  box(mbStone, HX + WALL_T / 2, HX + WALL_T / 2 + 3.4, 0, 15, -5.5, 5.5, 0.28, cream);
  seg(HX + 1.6, -5.5, HX + 1.6, 5.5, 2.0);
  { const cone = new THREE.ConeGeometry(4.6, 4, 14); const cm = new MeshBuilder(); addGeom(cm, cone, composeMatrix(HX + WALL_T / 2 + 1.7, 17, 0), white); group.add(new THREE.Mesh(cm.build(), M.dome)); cone.dispose(); }

  // ── Gumbazlar ─────────────────────────────────────────────────────────────
  const domes = new THREE.Group(); group.add(domes);
  const addDome = (x, z, y, R, H, drumH, drumR, ribs) => {
    const dr = new THREE.CylinderGeometry(drumR, drumR + 0.3, drumH, 20);
    const dm = new THREE.Mesh(dr, M.band); dm.position.set(x, y + drumH / 2, z); domes.add(dm);
    const g = domeGeometry(R, H, 56, ribs);
    const m = new THREE.Mesh(g, M.dome); m.position.set(x, y + drumH, z); domes.add(m);
    // oltin shpil
    const sp = new THREE.CylinderGeometry(0.06, 0.12, 3.6, 8); const s1 = new THREE.Mesh(sp, M.gold); s1.position.set(x, y + drumH + H + 1.5, z); domes.add(s1);
    const ball = new THREE.SphereGeometry(0.42, 12, 8); const s2 = new THREE.Mesh(ball, M.gold); s2.position.set(x, y + drumH + H + 0.4, z); domes.add(s2);
    const b2 = new THREE.Mesh(ball, M.gold); b2.scale.setScalar(0.7); b2.position.set(x, y + drumH + H + 2.2, z); domes.add(b2);
  };
  const ROOF = WALL_H + 0.6;
  addDome(0, 0, ROOF, 12.6, 15, 6.5, 11.8, 24);
  // burchak gumbazlari
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addDome(sx * 28, sz * 19, ROOF, 5.2, 6.2, 2.6, 4.7, 16);
  // markaziy gumbaz ostidagi yordamchi kichik gumbazlar (old va orqa o'rtada)
  addDome(-25, 0, ROOF, 4.2, 5, 2, 3.8, 14); addDome(25, 0, ROOF, 4.2, 5, 2, 3.8, 14);
  // gumbaz barabanidagi deraza belbog'i (kamar derazalar)
  {
    const wg = new THREE.ShapeGeometry(archShape(1.5, 3.4), 8), fg = new THREE.ShapeGeometry(archShape(1.9, 3.9), 8);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, R = 11.85;
      const nx = Math.cos(a), nz = Math.sin(a), rot = Math.atan2(nx, nz);
      addGeom(mbFrame, fg, composeMatrix(nx * R, ROOF + 1.4, nz * R, rot), turq);
      addGeom(mbGlass, wg, composeMatrix(nx * (R + 0.03), ROOF + 1.7, nz * (R + 0.03), rot), white);
    }
    wg.dispose(); fg.dispose();
  }

  // ── Minoralar (OSM dagi 2 ta "Minora" o'rnida) ─────────────────────────────
  const minaretIds = ['733837868', '733837869'];
  const mpos = [];
  for (const b of world.map.buildings) {
    if (!minaretIds.includes(b.id)) continue;
    const c = polyCentroid(b.coords);
    const dx = c[0] - MOSQUE.cx, dz = c[1] - MOSQUE.cz;
    const a = dx * MOSQUE.qx + dz * MOSQUE.qz, bb = dx * MOSQUE.sx + dz * MOSQUE.sz;
    mpos.push([a, bb]);
  }
  if (mpos.length < 2) mpos.push([-11, 40.5], [-10, -41.5]);
  const addMinaret = ([ax, az]) => {
    const g = new THREE.Group(); g.position.set(ax, 0, az); group.add(g);
    const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    const mbm = new MeshBuilder();
    box(mbm, -2.9, 2.9, 0, 5.2, -2.9, 2.9, 0.28, cream);
    box(mbm, -3.1, 3.1, 5.0, 5.5, -3.1, 3.1, 0.28, creamD);
    g.add(new THREE.Mesh(mbm.build(), M.stone));
    const shaft = mk(new THREE.CylinderGeometry(1.9, 2.25, 14, 24), M.band, 0, 12.5, 0); shaft.material = M.band;
    mk(new THREE.CylinderGeometry(2.7, 2.7, 0.7, 24), M.stoneP, 0, 19.6, 0);
    mk(new THREE.CylinderGeometry(2.6, 1.7, 1.4, 24), M.dome, 0, 18.6, 0);
    mk(new THREE.CylinderGeometry(2.8, 2.8, 0.15, 24), M.gold, 0, 20.0, 0);
    mk(new THREE.CylinderGeometry(1.5, 1.7, 9, 24), M.dome, 0, 24.5, 0);
    mk(new THREE.CylinderGeometry(2.2, 2.2, 0.5, 24), M.stoneP, 0, 29.2, 0);
    mk(new THREE.CylinderGeometry(2.2, 1.3, 0.9, 24), M.dome, 0, 28.5, 0);
    mk(new THREE.CylinderGeometry(1.15, 1.15, 5, 16), M.stoneP, 0, 32, 0);
    mk(new THREE.ConeGeometry(1.6, 4.4, 20), M.dome, 0, 36.7, 0);
    mk(new THREE.SphereGeometry(0.4, 10, 8), M.gold, 0, 39.1, 0);
    mk(new THREE.CylinderGeometry(0.05, 0.1, 2.4, 6), M.gold, 0, 40.2, 0);
    // tepadagi kamar teshiklar
    const wg = new THREE.ShapeGeometry(archShape(0.9, 2.4), 8); const wm = new MeshBuilder();
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; addGeom(wm, wg, composeMatrix(Math.cos(a) * 1.17, 29.6, Math.sin(a) * 1.17, Math.atan2(Math.cos(a), Math.sin(a))), white); }
    g.add(new THREE.Mesh(wm.build(), M.glass));
    wg.dispose();
    circ(ax, az, 3.3);
  };
  mpos.forEach(addMinaret);

  // ── Ichki makon ───────────────────────────────────────────────────────────
  // Marmar pol + gilam
  face(mbMarble, [[-HX + 0.7, POD_H + 0.02, -HZ + 0.7], [HX - 0.7, POD_H + 0.02, -HZ + 0.7], [HX - 0.7, POD_H + 0.02, HZ - 0.7], [-HX + 0.7, POD_H + 0.02, HZ - 0.7]], [0, 1, 0], (v) => [v[0] / 3, v[2] / 3], white);
  face(mbCarpet, [[-HX + 2, POD_H + 0.05, -HZ + 2], [HX - 2, POD_H + 0.05, -HZ + 2], [HX - 2, POD_H + 0.05, HZ - 2], [-HX + 2, POD_H + 0.05, HZ - 2]], [0, 1, 0], (v) => [v[2] / 3.2, v[0] / 4.4], [0.95, 0.95, 0.95]);
  // Shift (ichki)
  face(mbIn, [[-HX + 0.7, WALL_H - 0.02, -HZ + 0.7], [HX - 0.7, WALL_H - 0.02, -HZ + 0.7], [HX - 0.7, WALL_H - 0.02, HZ - 0.7], [-HX + 0.7, WALL_H - 0.02, HZ - 0.7]], [0, -1, 0], (v) => [v[0] / 3, v[2] / 3], [0.9, 0.85, 0.7]);
  // ichki devor koshin belbog'i (3 m gacha)
  const wain = (a0, b0, a1, b1, nx, nz) => face(mbTile, [[a0, POD_H, b0], [a1, POD_H, b1], [a1, 3.2, b1], [a0, 3.2, b0]], [nx, 0, nz], (v) => [(v[0] + v[2]) * 0.4, v[1] * 0.4], [0.92, 0.95, 0.95]);
  wain(HX - 0.72, -HZ + 0.7, HX - 0.72, HZ - 0.7, -1, 0);
  wain(-HX + 0.72, -HZ + 0.7, -HX + 0.72, HZ - 0.7, 1, 0);
  wain(-HX + 0.7, -HZ + 0.72, HX - 0.7, -HZ + 0.72, 0, 1);
  wain(-HX + 0.7, HZ - 0.72, HX - 0.7, HZ - 0.72, 0, -1);
  // Mehrob
  {
    const x = HX - 0.75;
    const ar = new THREE.ShapeGeometry(archShape(4.8, 8.2), 14), arF = new THREE.ShapeGeometry(archShape(6.2, 9.4), 14);
    addGeom(mbFrame, arF, composeMatrix(x - 0.02, POD_H, 0, -Math.PI / 2), [0.9, 0.7, 0.2]);
    addGeom(mbTile, ar, composeMatrix(x - 0.05, POD_H + 0.1, 0, -Math.PI / 2), white);
    // mehrob ichidagi oltin kamar
    const ar2 = new THREE.ShapeGeometry(archShape(2.6, 5.4), 14);
    const gm = new MeshBuilder(); addGeom(gm, ar2, composeMatrix(x - 0.08, POD_H + 0.2, 0, -Math.PI / 2), white);
    group.add(new THREE.Mesh(gm.build(), M.gold));
    ar.dispose(); arF.dispose(); ar2.dispose();
    // Minbar (yog'och)
    const bx = HX - 3.4, bz = 6.2;
    for (let i = 0; i < 6; i++) box(mbWood, bx - i * 0.0, bx + 1.6, POD_H, POD_H + 0.5 + i * 0.55, bz + 0.0 + (5 - i) * 0.0 - 0.0, bz + 1.6 - (5 - i) * 0.0, 1, [0.9, 0.85, 0.8]);
    box(mbWood, bx - 1.0, bx + 1.6, POD_H, POD_H + 0.5, bz - 0.2, bz + 1.8, 1, [0.9, 0.85, 0.8]);
    box(mbWood, bx - 2.2, bx - 1.0, POD_H, POD_H + 1.0, bz - 0.2, bz + 1.8, 1, [0.9, 0.85, 0.8]);
    box(mbWood, bx - 3.4, bx - 2.2, POD_H, POD_H + 1.6, bz - 0.2, bz + 1.8, 1, [0.9, 0.85, 0.8]);
    box(mbWood, bx - 4.6, bx - 3.4, POD_H, POD_H + 2.2, bz - 0.2, bz + 1.8, 1, [0.9, 0.85, 0.8]);
    circ(bx - 1, bz + 0.8, 2.6);
  }
  // Ustunlar
  const cols = new MeshBuilder();
  const placeCol = (x, z, r, hgt) => {
    const cyl = new THREE.CylinderGeometry(r, r * 1.12, hgt, 14); addGeom(cols, cyl, composeMatrix(x, POD_H + hgt / 2, z), cream); cyl.dispose();
    box(cols, x - r * 1.9, x + r * 1.9, POD_H + hgt - 0.5, POD_H + hgt + 0.3, z - r * 1.9, z + r * 1.9, 0.5, creamD);
    box(cols, x - r * 1.4, x + r * 1.4, POD_H, POD_H + 0.5, z - r * 1.4, z + r * 1.4, 0.5, creamD);
    circ(x, z, r * 1.25);
  };
  for (const x of [-30, -16, 16, 30]) for (const z of [-22, 22]) placeCol(x, z, 0.7, WALL_H - POD_H - 0.3);
  for (const x of [-18, 18]) for (const z of [-11, 11]) placeCol(x, z, 1.0, WALL_H - POD_H - 0.3);
  // Qandillar (lyustralar)
  const chand = new THREE.Group(); group.add(chand);
  const chPos = [[0, 0], [-16, 0], [16, 0], [-28, 12], [-28, -12], [28, 12], [28, -12], [0, 18], [0, -18]];
  for (const [x, z] of chPos) {
    const g = new THREE.Group(); g.position.set(x, 9.6, z);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.5, 4), M.gold); chain.position.y = 1.9; g.add(chain);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.07, 6, 20), M.gold); ring.rotation.x = Math.PI / 2; g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 6, 16), M.gold); ring2.rotation.x = Math.PI / 2; ring2.position.y = -0.5; g.add(ring2);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), M.lampE); b.position.set(Math.cos(a) * 1.2, 0.05, Math.sin(a) * 1.2); g.add(b); }
    chand.add(g);
  }

  // ── Gumbaz ichi (osti ko'rinadi) ───────────────────────────────────────────
  // Gumbaz materiali DoubleSide — ichki tomoni ham firuza koshin

  // ── Hovuz-favvora (old maydonda) ───────────────────────────────────────────
  const FX = -70, FZ = 0;
  {
    const prof = [new THREE.Vector2(0.01, 0), new THREE.Vector2(5.6, 0), new THREE.Vector2(5.6, 0.7), new THREE.Vector2(5.2, 0.7), new THREE.Vector2(5.2, 0.4), new THREE.Vector2(0.01, 0.4)];
    const lg = new THREE.LatheGeometry(prof, 36);
    const fb = new MeshBuilder(); addGeom(fb, lg, composeMatrix(FX, 0.02, FZ), cream); lg.dispose();
    group.add(new THREE.Mesh(fb.build(), M.stoneP));
    const wd = new THREE.Mesh(new THREE.CircleGeometry(5.2, 36), M.water); wd.rotation.x = -Math.PI / 2; wd.position.set(FX, 0.62, FZ); group.add(wd);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 1.8, 10), M.stoneP); col.position.set(FX, 0.9, FZ); group.add(col);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 0.7, 0.5, 16), M.stoneP); bowl.position.set(FX, 1.9, FZ); group.add(bowl);
    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.5, 4.2, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xcfeaf5, transparent: true, opacity: 0.35, roughness: 0.1 }));
    jet.position.set(FX, 4.2, FZ); jet.rotation.x = Math.PI; group.add(jet);
    circ(FX, FZ, 5.9);
  }

  // ── Sahn: gazonlar, to'siqlar, skameykalar ────────────────────────────────
  const mbLawn = new MeshBuilder(), mbHedge = new MeshBuilder();
  const lawn = (x0, x1, z0, z1) => {
    face(mbLawn, [[x0, 0.035, z0], [x1, 0.035, z0], [x1, 0.035, z1], [x0, 0.035, z1]], [0, 1, 0], (v) => [v[0] / 6, v[2] / 6], white);
    const hc = 0.6;
    box(mbHedge, x0, x1, 0, hc, z0 - 0.35, z0, 1, white); box(mbHedge, x0, x1, 0, hc, z1, z1 + 0.35, 1, white);
    box(mbHedge, x0 - 0.35, x0, 0, hc, z0 - 0.35, z1 + 0.35, 1, white); box(mbHedge, x1, x1 + 0.35, 0, hc, z0 - 0.35, z1 + 0.35, 1, white);
  };
  for (const s of [-1, 1]) { lawn(-98, -78, s * 12, s * 36); lawn(-62, -49, s * 12, s * 36); lawn(-76, -62, s * 22, s * 36); }
  // Zal yon tomonlaridagi gulzor
  for (const s of [-1, 1]) lawn(-30, 30, s * 42, s * 56);

  // Skameykalar (guruh ichida)
  const bn = new MeshBuilder();
  const bench = (x, z, rot) => {
    const m = composeMatrix(x, 0, z, rot);
    const seat = new THREE.BoxGeometry(1.8, 0.08, 0.5); seat.translate(0, 0.5, 0);
    const back = new THREE.BoxGeometry(1.8, 0.45, 0.06); back.translate(0, 0.78, -0.22);
    const l1 = new THREE.BoxGeometry(0.08, 0.5, 0.45); l1.translate(-0.8, 0.25, 0); const l2 = l1.clone(); l2.translate(1.6, 0, 0);
    for (const g of [seat, back]) { addGeom(bn, g, m, lin3(0x7a5a3a)); g.dispose(); }
    for (const g of [l1, l2]) { addGeom(bn, g, m, lin3(0x2f3236)); g.dispose(); }
  };
  for (const s of [-1, 1]) for (const x of [-92, -84, -68, -56]) bench(x, s * 10.5, s > 0 ? Math.PI : 0);

  // ── Daraxtlar va chiroqlar (dunyo koordinatalarida, alohida mesh) ──────────
  const ctx = { mTree: new MeshBuilder(), mProp: new MeshBuilder(), mLamp: new MeshBuilder(), mGlow: new MeshBuilder() };
  const r2 = rng(777);
  const tree = (a, b) => { const p = wp(a, b); world._tree(ctx, p[0], p[1], r2(), false); };
  for (let x = -96; x <= -50; x += 7.5) for (const s of [-1, 1]) tree(x, s * 40 + (r2() - 0.5) * 2);
  for (let z = -34; z <= 34; z += 9) { tree(-102, z + (r2() - 0.5) * 2); }
  for (const s of [-1, 1]) for (let x = -20; x <= 40; x += 10) tree(x, s * 60 + (r2() - 0.5) * 3);
  for (let i = 0; i < 18; i++) tree(-30 + r2() * 90, (r2() < 0.5 ? -1 : 1) * (70 + r2() * 50));
  for (const s of [-1, 1]) for (let x = -94; x <= -52; x += 14) {
    const p = wp(x, s * 7.5); const q = wp(x, s * 6);
    world._lamp(ctx, p[0], p[1], q[0] - p[0], q[1] - p[1]);
  }

  // ── Mesh'larni yig'ish ────────────────────────────────────────────────────
  const addMesh = (mb, mat, shadow = true, recv = true) => {
    if (mb.empty) return null;
    const m = new THREE.Mesh(mb.build(), mat); m.castShadow = shadow && world.q.shadows; m.receiveShadow = recv && world.q.shadows; group.add(m); return m;
  };
  addMesh(mbStone, M.stone); addMesh(mer, M.stone); addMesh(mbIn, M.stoneIn, false); addMesh(mbMarble, M.marble, false);
  addMesh(mbCarpet, M.carpet, false); addMesh(mbTile, M.tile, false); addMesh(mbWood, M.wood); addMesh(mbGlass, M.glass, false, false);
  addMesh(mbFrame, M.frame, false, false); addMesh(cols, M.stoneIn); addMesh(bn, world.matProp);
  const lm = addMesh(mbLawn, world.matGrass, false); const hm = addMesh(mbHedge, M.hedge, false);
  void lm; void hm;
  for (const ch of domes.children) { ch.castShadow = world.q.shadows; }

  // Dunyo koordinatalaridagi qismlar
  const extra = new THREE.Group();
  const addW = (mb, mat, shadow = true) => { if (mb.empty) return null; const m = new THREE.Mesh(mb.build(), mat); m.castShadow = shadow && world.q.shadows; extra.add(m); return m; };
  addW(ctx.mTree, world.matFoliage); addW(ctx.mProp, world.matProp); addW(ctx.mLamp, world.matLamp, false);
  const gl = addW(ctx.mGlow, world.matGlow, false); if (gl) gl.renderOrder = 2;

  // Tunda derazalar va qandillar porlasin
  function update(dt, night) {
    M.glass.emissiveIntensity = night * 1.6;
    M.lampE.color.setRGB(1, 0.78 + 0.1 * (1 - night), 0.45 + 0.35 * (1 - night)).multiplyScalar(0.6 + night * 0.9);
  }

  // Podium balandligi (zinapoya silliq ko'tarilishi)
  function groundY(x, z) {
    const dx = x - MOSQUE.cx, dz = z - MOSQUE.cz;
    const a = dx * MOSQUE.qx + dz * MOSQUE.qz, b = dx * MOSQUE.sx + dz * MOSQUE.sz;
    const e = Math.min(a - POD.x0, POD.x1 - a, b - POD.z0, POD.z1 - b);
    if (e <= 0) return 0;
    return POD_H * smoothstep(0, 2.6, e);
  }

  return { group, extra, colliders, groundY, update, spawn: wp(-78, 0), wp };
}
