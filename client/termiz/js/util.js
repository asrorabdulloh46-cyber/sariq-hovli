// Termiz — umumiy yordamchilar: tasodifiy son, geometriya, mesh yig'uvchi
import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerpAngle = (a, b, t) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

// Deterministik RNG (mulberry32) — barcha o'yinchilarda bir xil dunyo
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(x, z) {
  let h = (Math.imul(Math.floor(x * 7.13) | 0, 374761393) + Math.imul(Math.floor(z * 7.13) | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ── Ko'pburchak yordamchilari (x,z tekisligida) ──────────────────────────────
export function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
}
// Poligonni "soat strelkasi" (A<0) tartibiga keltirish: devor normallari tashqariga qaraydi
export function normalizePoly(coords) {
  let pts = coords.map(p => [p[0], p[1]]);
  const n = pts.length;
  if (n > 1 && pts[0][0] === pts[n - 1][0] && pts[0][1] === pts[n - 1][1]) pts.pop();
  if (polyArea(pts) > 0) pts.reverse();
  return pts;
}
export function pointInPoly(px, pz, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if (((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}
export function polyCentroid(pts) {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return [x / pts.length, z / pts.length];
}
export function polyBBox(pts) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return [x0, z0, x1, z1];
}
// Eng uzun qirra yo'nalishi bo'yicha yo'naltirilgan qutini topish
export function orientedBox(pts) {
  let best = 0, bi = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
    const l = Math.hypot(x1 - x0, z1 - z0);
    if (l > best) { best = l; bi = i; }
  }
  const [x0, z0] = pts[bi], [x1, z1] = pts[(bi + 1) % pts.length];
  const ux = (x1 - x0) / best, uz = (z1 - z0) / best;
  const vx = -uz, vz = ux;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, z] of pts) {
    const u = x * ux + z * uz, v = x * vx + z * vz;
    if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
  }
  return { ux, uz, vx, vz, u0, u1, v0, v1, len: u1 - u0, wid: v1 - v0 };
}

// ── Mesh yig'uvchi: ko'p obyektni bitta geometriyaga birlashtirish ──────────
// Atributlar: position(3) normal(3) uv(2) color(3) [+ ext(6): aCell(2), aInfo(4)]
export class MeshBuilder {
  constructor(ext = false) {
    this.ext = ext;
    this.pos = []; this.nor = []; this.uv = []; this.col = [];
    this.cell = []; this.info = [];
    this.idx = [];
    this.n = 0;
  }
  v(px, py, pz, nx, ny, nz, u, v, r = 1, g = 1, b = 1, c0 = 0, c1 = 0, i0 = 0, i1 = 0, i2 = 0, i3 = 0) {
    this.pos.push(px, py, pz); this.nor.push(nx, ny, nz); this.uv.push(u, v); this.col.push(r, g, b);
    if (this.ext) { this.cell.push(c0, c1); this.info.push(i0, i1, i2, i3); }
    return this.n++;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  get empty() { return this.n === 0; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.ext) {
      g.setAttribute('aCell', new THREE.Float32BufferAttribute(this.cell, 2));
      g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 4));
    }
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// Mavjud THREE.BufferGeometry ni (transform bilan) MeshBuilder ga qo'shish
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _nrm = new THREE.Vector3(), _nm = new THREE.Matrix3();
export function addGeom(mb, geom, matrix, color = null, colorFn = null) {
  const pos = geom.attributes.position, nor = geom.attributes.normal, uv = geom.attributes.uv;
  const idx = geom.index;
  _nm.getNormalMatrix(matrix);
  const base = mb.n;
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    _nrm.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
    let r = 1, g = 1, b = 1;
    if (colorFn) { const c = colorFn(i, _p); r = c[0]; g = c[1]; b = c[2]; }
    else if (color) { r = color[0]; g = color[1]; b = color[2]; }
    mb.v(_p.x, _p.y, _p.z, _nrm.x, _nrm.y, _nrm.z, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, r, g, b);
  }
  if (idx) { for (let i = 0; i < idx.count; i += 3) mb.tri(base + idx.getX(i), base + idx.getX(i + 1), base + idx.getX(i + 2)); }
  else { for (let i = 0; i < pos.count; i += 3) mb.tri(base + i, base + i + 1, base + i + 2); }
}
export function composeMatrix(x, y, z, rotY = 0, sx = 1, sy = sx, sz = sx) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
  return _m.clone().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
}
export function hex3(hex) { return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]; }
// sRGB hex → chiziqli rang (vertex colors uchun)
export function lin3(hex) {
  const c = hex3(hex).map(v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return c;
}
