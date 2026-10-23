// "Sariq Hovli" xaritasi: 2 ta parallel 3 qavatli bino, o'rtada hovli, hovlida 4 ta yashik.
// Koordinatalar: x - sharq, z - janub, y - tepaga. Birlik: metr.
// Server ham, klient ham shu faylni ishlatadi (to'qnashuv va nur tekshiruvi uchun).

export const BOXES = [];   // to'qnashadigan qutilar
export const DECOR = [];   // faqat ko'rinish uchun (to'qnashmaydi)
export const ARENA = { x: 31.4, z: 27.4 };

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

buildBuilding(false);   // shimoliy bino (z = -22..-12)
buildBuilding(true);    // janubiy bino (z = 12..22), 180 gradus burilgan

// Hovli o'rtasida 4 ta yashik (yashirinish uchun)
export const CRATES = [[-4.5, -3.2], [4.5, -3.2], [-4.5, 3.2], [4.5, 3.2]];
for (const [cx, cz] of CRATES) mk(BOXES, cx - 0.9, 0, cz - 0.9, cx + 0.9, 1.8, cz + 0.9, 'crate');

// Atrof devor (arena chegarasi)
mk(BOXES, -32.5, 0, -28.5, -31.5, 4, 28.5, 'perim');
mk(BOXES, 31.5, 0, -28.5, 32.5, 4, 28.5, 'perim');
mk(BOXES, -32.5, 0, -28.5, 32.5, 4, -27.5, 'perim');
mk(BOXES, -32.5, 0, 27.5, 32.5, 4, 28.5, 'perim');

// Tug'ilish nuqtalari (markazga qaragan)
const spawnXZ = [
  [-24, -4], [24, 4], [0, -8.5], [0, 8.5], [-9, 0], [9, 0],
  [-26, 12], [26, -12], [0, -17], [0, 17],
];
export const SPAWNS = spawnXZ.map(([x, z]) => ({ x, y: 0, z, yaw: Math.atan2(x, z) }));

// Dori qutilari (+50 HP)
export const PICKUPS = [
  { x: -26, y: 0, z: 0 }, { x: 26, y: 0, z: 0 },
  { x: 0, y: 4, z: -17 }, { x: 0, y: 4, z: 17 },
  { x: 0, y: 8, z: -17 }, { x: 0, y: 8, z: 17 },
];

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
