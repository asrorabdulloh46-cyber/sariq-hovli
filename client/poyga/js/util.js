import * as THREE from '../../vendor/three.module.min.js';

export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Monoton kubik interpolyatsiya (PCHIP): points = [[x, y], ...] x o'sib boradi
export function curve(points) {
  const n = points.length, xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// Bir xil materialli bevosita bola mesh'larni bitta geometriyaga birlashtiradi (draw call kamayadi)
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
  const byMat = new Map();
  for (const ch of group.children.slice()) {
    if (ch.isMesh && !ch.userData.noMerge && ch.geometry.attributes.normal) {
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

// Aks ettirish uchun muhit xaritasi (osmon + quyosh + yorug' panellar)
export function makeEnvironment(renderer, opts = {}) {
  const top = new THREE.Color(opts.top || '#4f8fe0'), hor = new THREE.Color(opts.horizon || '#d9e8f5'), gnd = new THREE.Color(opts.ground || '#8a8068');
  const s = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 32, 20);
  const col = new Float32Array(geo.attributes.position.count * 3), p = geo.attributes.position, c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 50;
    if (y >= 0) c.copy(hor).lerp(top, Math.pow(y, 0.6)); else c.copy(hor).lerp(gnd, Math.min(1, -y * 3));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  s.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 12, 9) }));
  sun.position.set(-22, 30, 18); s.add(sun);
  for (const [x, y, z, w, h, k] of [[30, 14, 0, 18, 6, 3.2], [-30, 10, -14, 14, 5, 2.4], [0, 40, -10, 24, 8, 2.2], [0, 8, 40, 26, 4, 1.6]]) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    q.position.set(x, y, z); q.lookAt(0, 0, 0); s.add(q);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.03);
  pm.dispose();
  geo.dispose();
  return rt.texture;
}
