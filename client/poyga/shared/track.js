// Treklar: yopiq spline (markaz chizig'i), yo'l kengligi, so'rovlar (eng yaqin nuqta, progress).
// Server va klient bir xil kodni ishlatadi.
export const ROAD_HALF = 7.5;    // yo'l yarim kengligi (m)
export const WALL = 12.5;        // devor markazdan shuncha uzoqda
export const SPACING = 2;        // nuqtalar orasidagi masofa (m)

function dist2(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

// Centripetal Catmull-Rom (Barry-Goldman)
function crSeg(p0, p1, p2, p3, t) {
  const a = 0.5;
  const t0 = 0, t1 = t0 + Math.pow(dist2(p0, p1), a) || 1e-4, t2 = t1 + Math.pow(dist2(p1, p2), a) || 1e-4, t3 = t2 + Math.pow(dist2(p2, p3), a) || 1e-4;
  const u = t1 + (t2 - t1) * t;
  const lerp = (pa, pb, ta, tb) => [pa[0] * (tb - u) / (tb - ta) + pb[0] * (u - ta) / (tb - ta), pa[1] * (tb - u) / (tb - ta) + pb[1] * (u - ta) / (tb - ta)];
  const A1 = lerp(p0, p1, t0, t1), A2 = lerp(p1, p2, t1, t2), A3 = lerp(p2, p3, t2, t3);
  const B1 = lerp(A1, A2, t0, t2), B2 = lerp(A2, A3, t1, t3);
  return lerp(B1, B2, t1, t2);
}

export const TRACK_DEFS = [
  {
    id: 'qishloq', name: 'Qishloq yo\'li', desc: 'Uylar, daraxtlar, silliq S-burilishlar',
    theme: 'village',
    pts: [[0, 0], [140, 0], [260, -30], [350, 30], [370, 130], [310, 200], [210, 215], [170, 280], [220, 350], [320, 385], [330, 470], [250, 520], [130, 500], [60, 430], [-30, 400], [-120, 430], [-200, 380], [-210, 290], [-140, 230], [-150, 150], [-245, 100], [-245, 5], [-135, -45]],
  },
  {
    id: 'chol', name: 'Cho\'l yo\'li', desc: 'Keng yo\'l, uzun to\'g\'ri uchastkalar va qum tepaliklari',
    theme: 'desert',
    pts: [[0, 0], [250, 0], [500, 0], [640, 60], [660, 170], [580, 240], [450, 230], [405, 300], [470, 385], [592, 428], [585, 525], [440, 560], [260, 520], [200, 430], [100, 400], [-20, 440], [-130, 400], [-175, 300], [-195, 200], [-170, 110], [-140, 40]],
  },
  {
    id: 'shahar', name: 'Shahar aylanasi', desc: 'Binolar orasidagi burchaklar va chiroqlar',
    theme: 'city',
    pts: [[0, 0], [150, 0], [270, 0], [330, 40], [340, 120], [300, 170], [220, 180], [170, 215], [160, 290], [200, 340], [290, 360], [345, 400], [350, 480], [300, 540], [200, 550], [140, 510], [110, 440], [60, 400], [-20, 410], [-70, 470], [-140, 490], [-200, 450], [-210, 370], [-160, 310], [-80, 290], [-40, 240], [-50, 160], [-110, 110], [-120, 40], [-80, 0]],
  },
];

export function buildTrack(def) {
  const P = def.pts, n = P.length;
  // zich nuqtalar
  const dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i + n - 1) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let k = 0; k < 60; k++) dense.push(crSeg(p0, p1, p2, p3, k / 60));
  }
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) cum.push(cum[i - 1] + dist2(dense[i % dense.length], dense[i - 1]));
  const total = cum[dense.length];
  const N = Math.round(total / SPACING), DS = total / N;
  const X = new Float64Array(N), Z = new Float64Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * DS;
    while (j < dense.length - 1 && cum[j + 1] < s) j++;
    const a = dense[j], b = dense[(j + 1) % dense.length];
    const f = (s - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
    X[i] = a[0] + (b[0] - a[0]) * f; Z[i] = a[1] + (b[1] - a[1]) * f;
  }
  const TX = new Float64Array(N), TZ = new Float64Array(N), CURV = new Float64Array(N), HEAD = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i + N - 1) % N, b = (i + 1) % N;
    let dx = X[b] - X[a], dz = Z[b] - Z[a]; const l = Math.hypot(dx, dz) || 1;
    TX[i] = dx / l; TZ[i] = dz / l; HEAD[i] = Math.atan2(TX[i], TZ[i]);
  }
  for (let i = 0; i < N; i++) {
    const a = (i + N - 2) % N, b = (i + 2) % N;
    const cr = TX[a] * TZ[b] - TZ[a] * TX[b], dt = TX[a] * TX[b] + TZ[a] * TZ[b];
    CURV[i] = Math.atan2(cr, dt) / (4 * DS);   // 1/m, ishorasi bilan (musbat: o'ngga/chapga)
  }
  const L = N * DS;
  const wrapS = (s) => ((s % L) + L) % L;

  const T = {
    def, id: def.id, name: def.name, desc: def.desc, theme: def.theme,
    N, DS, L, X, Z, TX, TZ, HEAD, CURV, roadHalf: ROAD_HALF, wall: WALL,
    // nuqta s (arc length) va lateral (musbat: o'ng) bo'yicha joy
    at(s, lat = 0) {
      s = wrapS(s); const f = s / DS, i = Math.floor(f) % N, k = f - Math.floor(f), j2 = (i + 1) % N;
      const cx = X[i] + (X[j2] - X[i]) * k, cz = Z[i] + (Z[j2] - Z[i]) * k;
      let tx = TX[i] + (TX[j2] - TX[i]) * k, tz = TZ[i] + (TZ[j2] - TZ[i]) * k; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      return { x: cx - tz * lat, z: cz + tx * lat, h: Math.atan2(tx, tz), cx, cz, tx, tz };
    },
    // eng yaqin markaz nuqtasi (hint: oldingi indeks)
    query(x, z, hint = -1) {
      let bi = -1, bd = Infinity;
      const scan = (i) => { const dx = x - X[i], dz = z - Z[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } };
      if (hint >= 0) {
        for (let k = -32; k <= 32; k++) scan(((hint + k) % N + N) % N);
        if (bd > 30 * 30) { bd = Infinity; for (let i = 0; i < N; i++) scan(i); }
      } else for (let i = 0; i < N; i++) scan(i);
      // ikki qo'shni segmentga proyeksiya
      let best = null;
      for (let sgn = -1; sgn <= 0; sgn++) {
        const a = ((bi + sgn) % N + N) % N, b = (a + 1) % N;
        const sx = X[b] - X[a], sz = Z[b] - Z[a], l2 = sx * sx + sz * sz || 1;
        let t = ((x - X[a]) * sx + (z - Z[a]) * sz) / l2; t = Math.max(0, Math.min(1, t));
        const cx = X[a] + sx * t, cz = Z[a] + sz * t, d2 = (x - cx) ** 2 + (z - cz) ** 2;
        if (!best || d2 < best.d2) best = { a, t, cx, cz, d2 };
      }
      const a = best.a, b = (a + 1) % N;
      let tx = TX[a] + (TX[b] - TX[a]) * best.t, tz = TZ[a] + (TZ[b] - TZ[a]) * best.t; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const rx = -tz, rz = tx;
      const lat = (x - best.cx) * rx + (z - best.cz) * rz;
      return { i: best.t > 0.5 ? b : a, seg: a, s: (a + best.t) * DS, cx: best.cx, cz: best.cz, tx, tz, rx, rz, lat, ad: Math.abs(lat), dist: Math.sqrt(best.d2) };
    },
    // start to'ri: k = 0..4 (start chizig'idan orqada, 2 qatorli)
    grid(k) {
      const row = Math.floor(k / 2), col = k % 2;
      const p = T.at(-7 - row * 8.5, col === 0 ? -3.2 : 3.2);
      return { x: p.x, z: p.z, h: p.h, s: -7 - row * 8.5 };
    },
    curvAhead(i, dist) { // keyingi `dist` metrdagi eng katta |egrilik|
      let m = 0; const k = Math.ceil(dist / DS);
      for (let q = 0; q <= k; q++) m = Math.max(m, Math.abs(CURV[(i + q) % N]));
      return m;
    },
  };
  // sovg'a qutilari: har ~L/7 da, 3 tadan yo'l bo'ylab
  T.boxes = [];
  const groups = 7;
  for (let g = 0; g < groups; g++) {
    const s = ((g + 0.5) / groups) * L;
    for (const lat of [-4, 0, 4]) { const p = T.at(s, lat); T.boxes.push({ x: p.x, z: p.z, s, lat }); }
  }
  return T;
}

export const TRACKS = TRACK_DEFS.map(buildTrack);

// Progress kuzatuvchi: yig'ilgan masofa (start chizig'idan o'tgach 0 dan boshlanadi; startda manfiy)
export function newProgress(track, x, z) {
  const q = track.query(x, z, -1);
  let s = q.s; if (s > track.L / 2) s -= track.L;     // start chizig'idan oldin: manfiy
  return { i: q.i, s: q.s, cum: s, maxCum: s, wrong: 0 };
}
export function advanceProgress(track, pr, x, z) {
  const q = track.query(x, z, pr.i);
  let d = q.s - pr.s; const L = track.L;
  if (d > L / 2) d -= L; else if (d < -L / 2) d += L;
  if (Math.abs(d) > 70) return { ok: false, q };     // sakrab ketish: rad etiladi
  pr.i = q.i; pr.s = q.s; pr.cum += d;
  if (pr.cum > pr.maxCum) pr.maxCum = pr.cum;
  return { ok: true, q, d };
}
