// Xaritalar. Koordinatalar: x - sharq, z - janub, y - tepaga. Birlik: metr.
//  0: "Sariq Hovli"  - 2 ta parallel 3 qavatli bino, o'rtada hovli, hovlida 4 ta yashik.
//  1: "Ochiq maydon" - binosiz katta maydon: yashiklar, konteynerlar, past devorlar, tepaliklar.
//  2: "Qishloq"      - 6 ta bir qavatli uy (tomiga chiqiladi), pichan, to'siq, quduq.
// Server ham, klient ham shu faylni ishlatadi (to'qnashuv va nur tekshiruvi uchun).
// Massivlar joyida to'ldiriladi (loadMap), shuning uchun import qilingan havolalar o'zgarmaydi.

export const BOXES = [];   // to'qnashadigan qutilar
export const DECOR = [];   // faqat ko'rinish uchun (to'qnashmaydi)
export const ARENA = { x: 31.4, z: 27.4 };
export const CRATES = [];
export const SPAWNS = [];
export const PICKUPS = [];
export const MAP = { id: -1 };
export const MAP_NAMES = ['Sariq Hovli', 'Ochiq maydon', 'Qishloq'];
export const MAP_DESC = ['2 ta 3 qavatli bino va hovli', 'Binosiz katta maydon, konteynerlar', 'Uylar, tomlar, pichan, hayvonlar'];
export const ANIMAL_SPAWNS = [];   // [{t: 0|1, x, z}]
export const MAP_COUNT = MAP_NAMES.length;

const FH = 4;       // qavat balandligi
const SLAB = 0.3;   // pol qalinligi

function mk(list, x0, y0, z0, x1, y1, z1, kind) {
  list.push({ minx: x0, miny: y0, minz: z0, maxx: x1, maxy: y1, maxz: z1, kind });
}

// ---- Bino (A holatida: z = -22 .. -12, x = -12 .. 12; old devor z=-12 hovliga qaraydi) ----
function row(len, pe, win, gap, n) {
  const a = [{ s: 0, e: pe, type: 'p' }];
  let p = pe;
  for (let i = 0; i < n; i++) {
    a.push({ s: p, e: p + win, type: 'w', i });
    p += win;
    if (i < n - 1) { a.push({ s: p, e: p + gap, type: 'p' }); p += gap; }
  }
  a.push({ s: p, e: len, type: 'p' });
  return a;
}

function buildBuilding(rot) {
  const L = [], D = [];
  const T = 0.4;

  function wall(axis, f0, f1, start, iv, fy, doors, outSign) {
    for (const it of iv) {
      const a = start + it.s, b = start + it.e;
      const type = (it.type === 'w' && doors && doors.has(it.i)) ? 'd' : it.type;
      const seg = (y0, y1) => axis === 'x'
        ? mk(L, a, fy + y0, f0, b, fy + y1, f1, 'wall')
        : mk(L, f0, fy + y0, a, f1, fy + y1, b, 'wall');
      if (type === 'p') seg(0, FH);
      else if (type === 'w') {
        seg(0, 1.0); seg(2.8, FH);
        // deraza tokchasi (faqat ko'rinish)
        const o = outSign * 0.14;
        if (axis === 'x') {
          const z0 = outSign > 0 ? f1 : f0 + o;
          mk(D, a - 0.1, fy + 0.92, outSign > 0 ? f1 : f0 + o, b + 0.1, fy + 1.0, outSign > 0 ? f1 + o : f0, 'trim');
        } else {
          mk(D, outSign > 0 ? f1 : f0 + o, fy + 0.92, a - 0.1, outSign > 0 ? f1 + o : f0, fy + 1.0, b + 0.1, 'trim');
        }
      } else {
        seg(2.5, FH);
        // eshik usti soyabon (ko'rinish)
        const o = outSign * 0.9;
        if (axis === 'x') {
          mk(D, a - 0.2, fy + 2.5, outSign > 0 ? f1 : f0 + o, b + 0.2, fy + 2.62, outSign > 0 ? f1 + o : f0, 'awning');
        } else {
          mk(D, outSign > 0 ? f1 : f0 + o, fy + 2.5, a - 0.2, outSign > 0 ? f1 + o : f0, fy + 2.62, b + 0.2, 'awning');
        }
      }
    }
  }

  const rowX = row(24, 0.6, 1.8, 1.2, 8);   // old / orqa devor
  const rowZ = row(10, 1.1, 1.8, 1.2, 3);   // yon devorlar

  for (let f = 0; f < 3; f++) {
    const fy = f * FH;
    const g = f === 0;
    wall('x', -12.4, -12.0, -12, rowX, fy, g ? new Set([3, 4]) : null, +1);   // old (hovli tomon)
    wall('x', -22.0, -21.6, -12, rowX, fy, g ? new Set([6]) : null, -1);      // orqa
    wall('z', -12.0, -11.6, -22, rowZ, fy, g ? new Set([1]) : null, -1);      // g'arbiy yon
    wall('z', 11.6, 12.0, -22, rowZ, fy, g ? new Set([1]) : null, +1);        // sharqiy yon
  }

  // Polli (1-qavat, y=4): zina teshigi x = -8.6 .. -2.6 (g'arbda, orqa devor yonida)
  mk(L, -12, FH - SLAB, -19.6, 12, FH, -12, 'slab');
  mk(L, -12, FH - SLAB, -22, -8.6, FH, -19.6, 'slab');
  mk(L, -2.6, FH - SLAB, -22, 12, FH, -19.6, 'slab');
  // 2-qavat (y=8): zina teshigi x = 2.6 .. 8.6 (sharqda)
  mk(L, -12, 2 * FH - SLAB, -19.6, 12, 2 * FH, -12, 'slab');
  mk(L, -12, 2 * FH - SLAB, -22, 2.6, 2 * FH, -19.6, 'slab');
  mk(L, 8.6, 2 * FH - SLAB, -22, 12, 2 * FH, -19.6, 'slab');
  // tom
  mk(L, -12, 3 * FH - SLAB, -22, 12, 3 * FH, -12, 'slab');

  // Zinalar: 16 pog'ona, har biri 0.25 balandlik, 0.375 uzunlik (jami 6 m).
  // 1-zina: yerdan 1-qavatga, x=-8.6 dan -2.6 gacha ko'tariladi (oldida 3 m maydoncha bor)
  for (let i = 0; i < 16; i++) {
    const x0 = -8.6 + i * 0.375;
    mk(L, x0, 0, -21.6, x0 + 0.375, 0.25 * (i + 1), -19.6, 'stair');
  }
  // 2-zina: 1-qavatdan 2-qavatga, x=8.6 dan 2.6 gacha ko'tariladi
  for (let i = 0; i < 16; i++) {
    const x1 = 8.6 - i * 0.375;
    mk(L, x1 - 0.375, FH, -21.6, x1, FH + 0.25 * (i + 1), -19.6, 'stair');
  }

  // Tom bezaklari: parapet, suv baki, antenna
  const top = 3 * FH;
  mk(D, -12.15, top, -22.15, 12.15, top + 0.55, -21.85, 'trim');
  mk(D, -12.15, top, -12.15, 12.15, top + 0.55, -11.85, 'trim');
  mk(D, -12.15, top, -22.15, -11.85, top + 0.55, -11.85, 'trim');
  mk(D, 11.85, top, -22.15, 12.15, top + 0.55, -11.85, 'trim');
  mk(D, 3, top, -20, 5.2, top + 1.6, -17.8, 'tank');
  mk(D, -8, top, -16, -7.6, top + 3.2, -15.6, 'trim');

  // 180 gradusga burish (ikkinchi bino uchun)
  const tf = (b) => rot
    ? { minx: -b.maxx, miny: b.miny, minz: -b.maxz, maxx: -b.minx, maxy: b.maxy, maxz: -b.minz, kind: b.kind }
    : b;
  for (const b of L) BOXES.push(tf(b));
  for (const b of D) DECOR.push(tf(b));
}

function perimeter(ax, az) {
  mk(BOXES, -ax - 1.1, 0, -az - 1.1, -ax - 0.1, 4, az + 1.1, 'perim');
  mk(BOXES, ax + 0.1, 0, -az - 1.1, ax + 1.1, 4, az + 1.1, 'perim');
  mk(BOXES, -ax - 1.1, 0, -az - 1.1, ax + 1.1, 4, -az - 0.1, 'perim');
  mk(BOXES, -ax - 1.1, 0, az + 0.1, ax + 1.1, 4, az + 1.1, 'perim');
}
function setSpawns(xz) { for (const [x, z] of xz) SPAWNS.push({ x, y: 0, z, yaw: Math.atan2(x, z) }); }

function buildHovli() {
  ARENA.x = 31.4; ARENA.z = 27.4;
  buildBuilding(false);   // shimoliy bino (z = -22..-12)
  buildBuilding(true);    // janubiy bino (z = 12..22), 180 gradus burilgan

  // Hovli o'rtasida 4 ta yashik (yashirinish uchun)
  CRATES.push([-4.5, -3.2], [4.5, -3.2], [-4.5, 3.2], [4.5, 3.2]);
  for (const [cx, cz] of CRATES) mk(BOXES, cx - 0.9, 0, cz - 0.9, cx + 0.9, 1.8, cz + 0.9, 'crate');
  perimeter(31.4, 27.4);

  // Tug'ilish nuqtalari (markazga qaragan)
  setSpawns([[-24, -4], [24, 4], [0, -8.5], [0, 8.5], [-9, 0], [9, 0], [-26, 12], [26, -12], [0, -17], [0, 17]]);
  // Dori qutilari (+50 HP)
  PICKUPS.push({ x: -26, y: 0, z: 0 }, { x: 26, y: 0, z: 0 }, { x: 0, y: 4, z: -17 }, { x: 0, y: 4, z: 17 },
    { x: 0, y: 8, z: -17 }, { x: 0, y: 8, z: 17 });
  ANIMAL_SPAWNS.push({ t: 0, x: -20, z: 0 }, { t: 0, x: 20, z: 0 }, { t: 1, x: 0, z: -7 }, { t: 1, x: 0, z: 7 });
}

// ---- 2-xarita: oddiy ochiq maydon (bino yo'q) ----
function buildMaydon() {
  ARENA.x = 36.4; ARENA.z = 30.4;
  perimeter(36.4, 30.4);
  // markazda "pinwheel": 4 ta past devor (1.3 m: tik turganda ko'rinasiz, o'tirsangiz yashirinasiz)
  mk(BOXES, -6.5, 0, -1.5, -1.5, 1.3, -1.0, 'lowwall');
  mk(BOXES, 1.0, 0, -6.5, 1.5, 1.3, -1.5, 'lowwall');
  mk(BOXES, 1.5, 0, 1.0, 6.5, 1.3, 1.5, 'lowwall');
  mk(BOXES, -1.5, 0, 1.5, -1.0, 1.3, 6.5, 'lowwall');
  // katta yashiklar (1.8 m)
  const cr = [[-14, -9], [14, 9], [-14, 9], [14, -9], [0, -17], [0, 17], [-18, -19], [18, 19], [-9, 14], [9, -14], [-27, 4], [27, -4]];
  for (const [cx, cz] of cr) { CRATES.push([cx, cz]); mk(BOXES, cx - 0.9, 0, cz - 0.9, cx + 0.9, 1.8, cz + 0.9, 'crate'); }
  // konteynerlar (6 x 2.4 x 2.6): turli rangda
  mk(BOXES, -22.2, 0, -9.0, -19.8, 2.6, -3.0, 'cont0');
  mk(BOXES, 19.8, 0, 3.0, 22.2, 2.6, 9.0, 'cont1');
  mk(BOXES, -11.0, 0, -22.2, -5.0, 2.6, -19.8, 'cont2');
  mk(BOXES, 5.0, 0, 19.8, 11.0, 2.6, 22.2, 'cont0');
  mk(BOXES, 19.8, 0, -17.0, 22.2, 2.6, -11.0, 'cont2');
  mk(BOXES, -22.2, 0, 11.0, -19.8, 2.6, 17.0, 'cont1');
  // beton to'siqlar (1.0 m)
  mk(BOXES, -10.5, 0, 7.0, -7.5, 1.0, 7.6, 'barrier');
  mk(BOXES, 7.5, 0, -7.6, 10.5, 1.0, -7.0, 'barrier');
  mk(BOXES, -30.0, 0, -1.8, -29.4, 1.0, 1.8, 'barrier');
  mk(BOXES, 29.4, 0, -1.8, 30.0, 1.0, 1.8, 'barrier');
  mk(BOXES, -3.0, 0, 24.4, 3.0, 1.0, 25.0, 'barrier');
  mk(BOXES, -3.0, 0, -25.0, 3.0, 1.0, -24.4, 'barrier');
  // qum tepaliklari (zina-zina, ustiga chiqsa bo'ladi, balandligi 1.0 m)
  for (const [mx, mz] of [[-27, -18], [27, 18]]) {
    for (let i = 0; i < 4; i++) {
      const h = 4.6 - i * 0.9;
      mk(BOXES, mx - h, 0, mz - h * 0.8, mx + h, 0.25 * (i + 1), mz + h * 0.8, 'mound');
    }
  }
  setSpawns([[-33, -25], [33, 25], [33, -25], [-33, 25], [0, -28], [0, 28], [-33, 0], [33, 0], [-16, 0], [16, 0]]);
  PICKUPS.push({ x: -17, y: 0, z: 0 }, { x: 17, y: 0, z: 0 }, { x: 0, y: 0, z: -12 }, { x: 0, y: 0, z: 12 },
    { x: -27, y: 1.0, z: -18 }, { x: 27, y: 1.0, z: 18 });
  ANIMAL_SPAWNS.push({ t: 0, x: -12, z: 4 }, { t: 0, x: 12, z: -4 }, { t: 1, x: -2, z: -12 }, { t: 1, x: 2, z: 12 });
}


// ---- Umumiy devor qurish: ochiqliklar (deraza/eshik) bilan ----
// axis 'x': devor x bo'ylab (z = f0..f1 qalinlik); axis 'z': devor z bo'ylab (x = f0..f1)
function wallRun(axis, f0, f1, a0, a1, H, ops, kind, outSign) {
  const seg = (s, e, y0, y1) => {
    if (e - s < 0.01) return;
    if (axis === 'x') mk(BOXES, s, y0, f0, e, y1, f1, kind); else mk(BOXES, f0, y0, s, f1, y1, e, kind);
  };
  let cur = a0;
  for (const o of ops.slice().sort((p, q) => p.s - q.s)) {
    const s = a0 + o.s, e = a0 + o.e;
    seg(cur, s, 0, H);
    if (o.type === 'w') { seg(s, e, 0, 1.0); seg(s, e, 2.3, H); }
    else { seg(s, e, 2.2, H); }
    cur = e;
  }
  seg(cur, a1, 0, H);
}
// uzunligi L bo'lgan devor uchun ochiqliklar: 'door' o'rtada eshik + derazalar, 'win' faqat derazalar
function openings(L, kind) {
  const ops = [];
  const wins = Math.max(1, Math.floor((L - 1.5) / 3.0));
  const slot = L / wins;
  for (let i = 0; i < wins; i++) {
    const c = slot * (i + 0.5);
    const isDoor = kind === 'door' && i === Math.floor((wins - 1) / 2);
    const w = isDoor ? 1.7 : 1.6;
    ops.push({ s: c - w / 2, e: c + w / 2, type: isDoor ? 'd' : 'w' });
  }
  return ops;
}
const HH = 2.9;   // uy devori balandligi (tom ustki yuzi 3.2)
function house(x0, z0, x1, z1, sides, stair) {
  const T = 0.35;
  const lx = x1 - x0, lz = z1 - z0;
  wallRun('x', z0, z0 + T, x0, x1, HH, sides.n === 'solid' ? [] : openings(lx, sides.n), 'house', -1);
  wallRun('x', z1 - T, z1, x0, x1, HH, sides.s === 'solid' ? [] : openings(lx, sides.s), 'house', +1);
  wallRun('z', x0, x0 + T, z0 + T, z1 - T, HH, sides.w === 'solid' ? [] : openings(lz - 2 * T, sides.w), 'house', -1);
  wallRun('z', x1 - T, x1, z0 + T, z1 - T, HH, sides.e === 'solid' ? [] : openings(lz - 2 * T, sides.e), 'house', +1);
  mk(BOXES, x0, HH, z0, x1, 3.2, z1, 'roof');                         // tom
  // tom parapeti (zina tomonidan tashqari), past devor
  const PH = 3.2 + 1.25;
  if (stair.side !== 'n') mk(BOXES, x0, 3.2, z0, x1, PH, z0 + 0.25, 'lowwall');
  if (stair.side !== 's') mk(BOXES, x0, 3.2, z1 - 0.25, x1, PH, z1, 'lowwall');
  mk(BOXES, x0, 3.2, z0 + 0.25, x0 + 0.25, PH, z1 - 0.25, 'lowwall');
  mk(BOXES, x1 - 0.25, 3.2, z0 + 0.25, x1, PH, z1 - 0.25, 'lowwall');
  // tashqi zina (devor bo'ylab sharqqa ko'tariladi): 12 pog'ona x 0.45 m, har biri 0.25 baland
  for (let i = 0; i < 12; i++) {
    const sx = x0 + 0.6 + i * 0.45;
    if (stair.side === 'n') mk(BOXES, sx, 0, z0 - 1.7, sx + 0.45, 0.25 * (i + 1), z0, 'stair');
    else mk(BOXES, sx, 0, z1, sx + 0.45, 0.25 * (i + 1), z1 + 1.7, 'stair');
  }
  // eshik usti soyabon va tom chetlari (ko'rinish)
  mk(DECOR, x0 - 0.15, 3.2, z0 - 0.15, x1 + 0.15, 3.32, z1 + 0.15, 'roofedge');
}

function buildQishloq() {
  ARENA.x = 35.4; ARENA.z = 28.4;
  perimeter(35.4, 28.4);
  // uylar: (x0,z0,x1,z1), eshikli tomonlar, zina tomoni
  house(-28, -22, -18, -15, { n: 'win', s: 'door', w: 'win', e: 'door' }, { side: 'n' });
  house(-6, -25, 4, -18, { n: 'win', s: 'door', w: 'door', e: 'win' }, { side: 'n' });
  house(16, -20, 26, -13, { n: 'win', s: 'door', w: 'door', e: 'win' }, { side: 'n' });
  house(-27, 11, -17, 18, { n: 'door', s: 'win', w: 'win', e: 'door' }, { side: 's' });
  house(-3, 13, 7, 20, { n: 'door', s: 'win', w: 'win', e: 'door' }, { side: 's' });
  house(17, 12, 27, 19, { n: 'door', s: 'win', w: 'door', e: 'win' }, { side: 's' });
  // quduq (markazda)
  mk(BOXES, -1.0, 0, -1.0, 1.0, 1.0, 1.0, 'well');
  mk(DECOR, -0.9, 1.0, -0.9, -0.75, 2.2, -0.75, 'wood'); mk(DECOR, 0.75, 1.0, 0.75, 0.9, 2.2, 0.9, 'wood');
  mk(DECOR, -1.0, 2.2, -1.0, 1.0, 2.3, 1.0, 'wood');
  // pichan bog'lamlari
  for (const [hx, hz, w, d] of [[-10, -3, 1.6, 1.2], [10, 2, 1.6, 1.2], [-12, 6, 1.2, 1.6], [12, -6, 1.2, 1.6], [0, -9, 2.0, 1.2], [3, 8.5, 1.2, 2.0], [-30, -5, 1.6, 1.2], [30, 6, 1.6, 1.2]])
    mk(BOXES, hx - w / 2, 0, hz - d / 2, hx + w / 2, 1.1, hz + d / 2, 'hay');
  // yog'och to'siqlar (1.25 m: o'tirib yashirinsa bo'ladi)
  for (const [fx0, fz0, fx1, fz1] of [[-16, -9, -9, -8.7], [8, 9, 15, 9.3], [-22, 2, -21.7, 8], [21.7, -8, 22, -2], [-8, -12, -7.7, -6], [7.7, 5, 8, 11]])
    mk(BOXES, fx0, 0, fz0, fx1, 1.25, fz1, 'fence');
  // yashiklar
  for (const [cx, cz] of [[-14, 0], [14, -2], [-4, -3.5], [5, 4], [-23, -10], [23, 7]]) {
    CRATES.push([cx, cz]); mk(BOXES, cx - 0.9, 0, cz - 0.9, cx + 0.9, 1.8, cz + 0.9, 'crate');
  }
  setSpawns([[-33, -26], [33, 26], [33, -26], [-33, 26], [10, -27], [0, 27], [-33, 3], [33, -3], [-12, 0], [12, 0]]);
  PICKUPS.push({ x: -22, y: 0, z: -3 }, { x: 22, y: 0, z: 3 }, { x: 0, y: 0, z: -14 }, { x: 0, y: 0, z: 9 },
    { x: -23, y: 3.2, z: -18.5 }, { x: 22, y: 3.2, z: 15.5 });
  ANIMAL_SPAWNS.push({ t: 0, x: -8, z: 3 }, { t: 0, x: 9, z: -4 }, { t: 1, x: 2, z: -6 }, { t: 1, x: -5, z: 9 });
}

// Xaritani almashtirish: massivlar tozalanib, qayta to'ldiriladi
export function loadMap(id) {
  id = ((id | 0) % MAP_COUNT + MAP_COUNT) % MAP_COUNT;
  BOXES.length = 0; DECOR.length = 0; CRATES.length = 0; SPAWNS.length = 0; PICKUPS.length = 0; ANIMAL_SPAWNS.length = 0;
  MAP.id = id;
  if (id === 0) buildHovli(); else if (id === 1) buildMaydon(); else buildQishloq();
  return id;
}
loadMap(0);

// ---- Nur (ray) tekshiruvi ----
export function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < b.minx || ox > b.maxx) return Infinity; }
  else {
    let t1 = (b.minx - ox) / dx, t2 = (b.maxx - ox) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < b.miny || oy > b.maxy) return Infinity; }
  else {
    let t1 = (b.miny - oy) / dy, t2 = (b.maxy - oy) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < b.minz || oz > b.maxz) return Infinity; }
  else {
    let t1 = (b.minz - oz) / dz, t2 = (b.maxz - oz) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// nurning qutiga kirish va chiqish masofalari ([tmin, tmax]) yoki null
export function rayBoxRange(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz], lo = [b.minx, b.miny, b.minz], hi = [b.maxx, b.maxy, b.maxz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return null; }
    else {
      let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return [tmin, tmax];
}

// Dunyo bilan eng yaqin kesishish: { t, thick } (thick = o'sha devorning nur bo'ylab qalinligi, yer bo'lsa Infinity)
export function raycastWorldHit(ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT, thick = Infinity;
  for (let i = 0; i < BOXES.length; i++) {
    const r = rayBoxRange(ox, oy, oz, dx, dy, dz, BOXES[i]);
    if (r && r[0] < best) { best = r[0]; thick = r[1] - r[0]; }
  }
  if (dy < 0) { const t = -oy / dy; if (t > 0 && t < best) { best = t; thick = Infinity; } }
  return { t: best, thick };
}

// Dunyo (devor, pol, yer) bilan eng yaqin kesishish masofasi
export function raycastWorld(ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT;
  for (let i = 0; i < BOXES.length; i++) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, BOXES[i]);
    if (t < best) best = t;
  }
  if (dy < 0) { const t = -oy / dy; if (t > 0 && t < best) best = t; }
  return best;
}
