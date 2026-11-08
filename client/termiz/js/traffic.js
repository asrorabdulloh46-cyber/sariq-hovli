// Termiz — jonli shahar: yo'llarda yuradigan mashinalar, ko'cha chetida to'xtagan mashinalar, piyodalar
import * as THREE from '../../vendor/three.module.min.js';
import { createCar, randomTrafficCar, getCarSpec, animateCar } from './cars.js';
import { makeHuman, animateHuman } from './chars.js';
import { rng, hashStr, clamp } from './util.js';
import { MOSQUE } from '../config.js';

const SPEED_BY_CLS = { 0: 5, 1: 7, 2: 9, 3: 11, 4: 12.5, 5: 14, 6: 16 };
const GRID = 80;
const key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);

class Graph {
  constructor() { this.nodes = new Map(); this.edges = []; this.cells = new Map(); }
  node(x, z) {
    const k = key(x, z); let n = this.nodes.get(k);
    if (!n) { n = { x, z, out: [] }; this.nodes.set(k, n); }
    return n;
  }
  edge(a, b, road, kind) {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    if (len < 0.3) return;
    const e = { a, b, len, dx: dx / len, dz: dz / len, road, hw: road.w / 2, cls: road.r, kind };
    a.out.push(e); this.edges.push(e);
  }
  index() {
    for (const n of this.nodes.values()) {
      if (!n.out.length) continue;
      const k = Math.floor(n.x / GRID) + ',' + Math.floor(n.z / GRID);
      let l = this.cells.get(k); if (!l) { l = []; this.cells.set(k, l); } l.push(n);
    }
  }
  // dairaviy halqadagi tasodifiy tugun
  randomNear(x, z, rmin, rmax, R) {
    const cr = Math.ceil(rmax / GRID);
    const cx = Math.floor(x / GRID), cz = Math.floor(z / GRID);
    for (let tries = 0; tries < 14; tries++) {
      const k = (cx + Math.floor((R() * 2 - 1) * cr)) + ',' + (cz + Math.floor((R() * 2 - 1) * cr));
      const l = this.cells.get(k); if (!l) continue;
      const n = l[Math.floor(R() * l.length)];
      const d = Math.hypot(n.x - x, n.z - z);
      if (d >= rmin && d <= rmax) return n;
    }
    return null;
  }
}

export class Traffic {
  constructor(scene, world, map, quality) {
    this.scene = scene; this.world = world; this.q = quality;
    this.R = rng(20260);
    this.carG = new Graph(); this.pedG = new Graph();
    this._buildGraphs(map);
    this.cars = []; this.peds = []; this.parked = new Map(); this.parkedChunks = new Map();
    this.root = new THREE.Group(); scene.add(this.root);
    this.t = 0; this._acc = 0; this._parkAcc = 0;
    this.map = map;
  }

  _buildGraphs(map) {
    const cg = this.carG, pg = this.pedG;
    for (const r of map.roads) {
      if (r.tu) continue;
      const c = r.coords;
      for (let i = 0; i < c.length - 1; i++) {
        const a = c[i], b = c[i + 1];
        if (r.r >= 1) {
          const na = cg.node(a[0], a[1]), nb = cg.node(b[0], b[1]);
          if (r.ow !== -1) cg.edge(na, nb, r, 'car');
          if (r.ow !== 1) cg.edge(nb, na, r, 'car');
        }
        // piyodalar: kichik yo'llar va yo'laklar
        const pa = pg.node(a[0], a[1]), pb = pg.node(b[0], b[1]);
        pg.edge(pa, pb, r, 'ped'); pg.edge(pb, pa, r, 'ped');
      }
    }
    cg.index(); pg.index();
  }

  // ── Mashina agenti ────────────────────────────────────────────────────────
  _laneOff(e) { return e.road.ow ? Math.min(1.2, e.hw * 0.3) : Math.max(1.4, e.hw * 0.5); }
  _lanePoint(e, s, out) {
    const off = this._laneOff(e);
    const rx = -e.dz, rz = e.dx;
    out.x = e.a.x + e.dx * s + rx * off; out.z = e.a.z + e.dz * s + rz * off;
  }
  _nextEdge(e, R) {
    const outs = e.b.out.filter(o => !(o.b === e.a && e.b.out.length > 1));
    if (!outs.length) return e.b.out[0] || null;
    // to'g'riga yurishni afzal ko'rish
    let best = null, bs = -9;
    for (const o of outs) { const sc = (o.dx * e.dx + o.dz * e.dz) + R() * 1.1; if (sc > bs) { bs = sc; best = o; } }
    return best;
  }

  _spawnCar(node, rndT = false) {
    if (!node || !node.out.length) return null;
    const R = this.R;
    const e = node.out[Math.floor(R() * node.out.length)];
    const { id, color } = randomTrafficCar(R);
    const mesh = createCar(id, color);
    const s = rndT ? R() * e.len * 0.8 : 0;
    const p = { x: 0, z: 0 }; this._lanePoint(e, s, p);
    const h = Math.atan2(e.dx, e.dz);
    mesh.position.set(p.x, 0.03, p.z); mesh.rotation.y = h;
    this.root.add(mesh);
    const base = (SPEED_BY_CLS[e.cls] ?? 8) * (0.85 + R() * 0.3);
    const a = { kind: 'car', x: p.x, z: p.z, h, speed: base * 0.6, vmax: base, vf: base / (SPEED_BY_CLS[e.cls] ?? 8), e, ne: this._nextEdge(e, R), s, mesh, id, color, wait: 0, steer: 0, stun: 0 };
    this.cars.push(a); return a;
  }

  _updateCar(a, dt, others) {
    const R = this.R;
    // Maqsad nuqta
    const L = clamp(a.speed * 0.9 + 4.5, 4.5, 13);
    const e = a.e;
    // joriy qirrada proyeksiya
    const rx = -e.dz, rz = e.dx;
    let s = (a.x - e.a.x) * e.dx + (a.z - e.a.z) * e.dz;
    if (s >= e.len - 0.3) {                      // keyingi qirraga o'tish
      const ne = a.ne || this._nextEdge(e, R);
      if (!ne) { a.speed = 0; return; }
      a.e = ne; a.ne = this._nextEdge(ne, R); a.s = 0;
      s = (a.x - ne.a.x) * ne.dx + (a.z - ne.a.z) * ne.dz;
    }
    const cur = a.e;
    let ts = s + L, tp = { x: 0, z: 0 };
    if (ts <= cur.len || !a.ne) { this._lanePoint(cur, Math.min(ts, cur.len), tp); }
    else { this._lanePoint(a.ne, Math.min(ts - cur.len, a.ne.len), tp); }
    const dxT = tp.x - a.x, dzT = tp.z - a.z;
    let dh = Math.atan2(dxT, dzT) - a.h;
    while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    // Tezlik cheklovi
    let target = (SPEED_BY_CLS[cur.cls] ?? 8) * a.vf;
    target *= 1 - 0.65 * Math.min(1, Math.abs(dh) / 0.9);
    const fx = Math.sin(a.h), fz = Math.cos(a.h);
    for (const o of others) {
      if (o === a) continue;
      const rxo = o.x - a.x, rzo = o.z - a.z;
      const ahead = rxo * fx + rzo * fz;
      if (ahead < 0.5 || ahead > 16) continue;
      const lat = Math.abs(rxo * fz - rzo * fx);
      if (lat > 2.0) continue;
      const gap = ahead - 5;
      target = Math.min(target, Math.max(0, gap * 0.9));
    }
    if (a.stun > 0) { a.stun -= dt; target = 0; }
    const acc = target > a.speed ? 3.2 : 8;
    a.speed += clamp(target - a.speed, -acc * dt, acc * dt);
    a.steer = clamp(dh * 1.4, -1, 1);
    const rmax = clamp(a.speed * 0.3 + 0.7, 0.7, 2.2);
    a.h += clamp(dh * 3, -rmax, rmax) * dt;
    a.x += Math.sin(a.h) * a.speed * dt; a.z += Math.cos(a.h) * a.speed * dt;
    void rx; void rz;
    a.mesh.position.set(a.x, 0.03, a.z); a.mesh.rotation.y = a.h;
    animateCar(a.mesh, dt, a.speed, -a.steer * 0.8, this.t);
  }

  // ── Piyoda agenti ─────────────────────────────────────────────────────────
  _spawnPed(node, rndT = true) {
    if (!node || !node.out.length) return null;
    const R = this.R;
    const e = node.out[Math.floor(R() * node.out.length)];
    const mesh = makeHuman({ seed: Math.floor(R() * 1e9) });
    const s = rndT ? R() * e.len : 0;
    const side = R() < 0.5 ? 1 : -1;
    const a = { kind: 'ped', e, s, side, off: 0, speed: 1.0 + R() * 0.7, run: false, state: 'walk', timer: 0, mesh, x: 0, z: 0, h: 0, ne: null, hp: 40, fade: 0, jitter: (R() - 0.5) * 0.8 };
    this._pedOff(a);
    this._pedPos(a);
    mesh.position.set(a.x, 0, a.z); mesh.rotation.y = a.h;
    this.root.add(mesh);
    this.peds.push(a); return a;
  }
  _pedOff(a) {
    const e = a.e;
    a.off = e.cls >= 1 ? (e.hw + (e.cls >= 4 ? 1.7 : e.cls >= 2 ? 1.3 : 0.8)) * a.side + a.jitter : a.jitter * 0.8;
  }
  _pedPos(a) {
    const e = a.e, rx = -e.dz, rz = e.dx;
    a.x = e.a.x + e.dx * a.s + rx * a.off; a.z = e.a.z + e.dz * a.s + rz * a.off;
    a.h = Math.atan2(e.dx, e.dz);
  }
  _updatePed(a, dt, far, threat) {
    const u = a.mesh.userData;
    if (a.state === 'down') {
      u.fall = Math.min(1, u.fall + dt * 3);
      a.fade += dt;
      animateHuman(a.mesh, dt, 0);
      if (a.fade > 9) a.dead = true;
      return;
    }
    if (a.state === 'idle') {
      a.timer -= dt; if (a.timer <= 0) a.state = 'walk';
      if (!far) animateHuman(a.mesh, dt, 0);
      return;
    }
    let sp = a.speed;
    if (a.state === 'flee') { sp = 4.2; a.timer -= dt; if (a.timer <= 0) a.state = 'walk'; }
    // oldinga yurish
    a.s += sp * dt;
    if (a.s >= a.e.len) {
      const e = a.e, outs = e.b.out.filter(o => !(o.b === e.a && e.b.out.length > 1));
      const n = outs.length ? outs[Math.floor(this.R() * outs.length)] : e.b.out[0];
      if (!n) { a.dead = true; return; }
      a.s -= e.len; a.e = n;
      if (a.state === 'walk' && this.R() < 0.08) { a.state = 'idle'; a.timer = 2 + this.R() * 6; }
      this._pedOff(a);
    }
    this._pedPos(a);
    // yo'nalishga silliq burilish
    const cur = a.mesh.rotation.y; let d = a.h - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    a.mesh.rotation.y = cur + d * Math.min(1, dt * 7);
    a.mesh.position.set(a.x, this.world.getGroundY(a.x, a.z), a.z);
    if (!far) animateHuman(a.mesh, dt, sp, { run: a.state === 'flee' });
    void threat;
  }

  // ── Ko'chadagi to'xtagan mashinalar ────────────────────────────────────────
  _parkedSlots(cx, cz) {
    const k = cx + ',' + cz;
    let l = this.parkedChunks.get(k);
    if (l) return l;
    l = [];
    const bkt = this.world.buckets.get(k);
    if (bkt) {
      for (const [r, i] of bkt.s) {
        if (r.r < 1 || r.r > 4 || r.w < 6 || r.br || r.tu) continue;
        const a = r.coords[i], b = r.coords[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 9) continue;
        const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
        const hs = hashStr(r.id + ':' + i);
        const rr = rng(hs);
        for (let s = 5 + rr() * 8; s < len - 5; s += 14 + rr() * 22) {
          if (rr() > 0.42) continue;
          const side = rr() < 0.55 ? 1 : -1;
          const off = (r.w / 2 - 1.15) * side;
          const x = a[0] + dx * s - dz * off, z = a[1] + dz * s + dx * off;
          if (this.world.insideSolid(x, z)) continue;
          const h = Math.atan2(dx, dz) + (side > 0 ? 0 : Math.PI) + (rr() - 0.5) * 0.05;
          const { id, color } = randomTrafficCar(rr);
          l.push({ x, z, h, modelId: id, color, mesh: null, taken: false, id: hs + ':' + Math.floor(s) });
        }
      }
    }
    this.parkedChunks.set(k, l); return l;
  }

  _updateParked(px, pz) {
    const R = this.q.parkedR ?? 130, cs = 200;
    const cx0 = Math.floor((px - R) / cs), cx1 = Math.floor((px + R) / cs), cz0 = Math.floor((pz - R) / cs), cz1 = Math.floor((pz + R) / cs);
    const near = [];
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) for (const s of this._parkedSlots(cx, cz)) {
      if (s.taken) continue;
      const d = Math.hypot(s.x - px, s.z - pz); if (d < R) near.push([d, s]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const keep = new Set();
    for (let i = 0; i < near.length && i < this.q.parked; i++) {
      const s = near[i][1]; keep.add(s);
      if (!s.mesh) { s.mesh = createCar(s.modelId, s.color); s.mesh.position.set(s.x, 0.03, s.z); s.mesh.rotation.y = s.h; this.root.add(s.mesh); this.parked.set(s, true); }
    }
    for (const s of [...this.parked.keys()]) {
      if (s.persistent) continue;
      if (!keep.has(s)) { if (s.mesh) { this.root.remove(s.mesh); s.mesh = null; } this.parked.delete(s); }
    }
  }

  // ── Umumiy yangilash ──────────────────────────────────────────────────────
  populate(px, pz) {
    for (let i = 0; i < this.q.traffic; i++) this._spawnCar(this.carG.randomNear(px, pz, 40, this.q.view * 0.8, this.R), true);
    for (let i = 0; i < this.q.peds; i++) this._spawnPedNear(px, pz, 20, this.q.view * 0.6);
    this._updateParked(px, pz);
  }
  _spawnPedNear(px, pz, rmin, rmax) {
    // 40% — masjid maydonida
    const R = this.R;
    let n = null;
    if (R() < 0.4) n = this.pedG.randomNear(MOSQUE.cx, MOSQUE.cz, 10, 140, R);
    if (!n || Math.hypot(n.x - px, n.z - pz) > rmax) n = this.pedG.randomNear(px, pz, rmin, rmax, R);
    return this._spawnPed(n, true);
  }

  update(dt, px, pz, veh) {
    this.t += dt;
    const view = this.q.view;
    // Mashinalar
    const obst = this.cars.slice();
    if (veh) obst.push({ x: veh.x, z: veh.z }); else obst.push({ x: px, z: pz });
    for (const [s] of this.parked) { if (s.mesh && !s.taken && Math.hypot(s.x - px, s.z - pz) < 40) { /* to'xtaganlar to'siq emas */ } }
    for (const a of this.cars) this._updateCar(a, dt, obst);
    // Piyodalar
    for (const a of this.peds) {
      const far = Math.hypot(a.x - px, a.z - pz) > 90;
      this._updatePed(a, dt, far);
    }
    // Uzoqdagilarni olib tashlash
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const a = this.cars[i];
      if (Math.hypot(a.x - px, a.z - pz) > view * 1.15) { this.root.remove(a.mesh); this.cars.splice(i, 1); }
    }
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const a = this.peds[i];
      if (a.dead || Math.hypot(a.x - px, a.z - pz) > view * 0.9) { this.root.remove(a.mesh); this.peds.splice(i, 1); }
    }
    this._acc += dt;
    if (this._acc > 0.6) {
      this._acc = 0;
      if (this.cars.length < this.q.traffic) this._spawnCar(this.carG.randomNear(px, pz, view * 0.5, view * 0.85, this.R), false);
      if (this.peds.length < this.q.peds) this._spawnPedNear(px, pz, view * 0.25, view * 0.7);
    }
    this._parkAcc += dt;
    if (this._parkAcc > 0.7) { this._parkAcc = 0; this._updateParked(px, pz); }
  }

  // ── O'zaro ta'sir ─────────────────────────────────────────────────────────
  _killPed(a) { a.state = 'down'; a.mesh.userData.fall = 0.01; a.fade = 0; }
  hitNPC(x, z, r, dmg = 40) {
    let best = null, bd = r;
    for (const a of this.peds) { if (a.state === 'down') continue; const d = Math.hypot(a.x - x, a.z - z); if (d < bd) { bd = d; best = a; } }
    if (!best) return null;
    best.hp -= dmg;
    if (best.hp <= 0) this._killPed(best);
    else { best.state = 'flee'; best.timer = 6; }
    return { x: best.x, z: best.z, killed: best.state === 'down' };
  }
  hitByCar(x, z, r, speed) {
    let n = 0;
    for (const a of this.peds) {
      if (a.state === 'down') continue;
      if (Math.hypot(a.x - x, a.z - z) < r) { this._killPed(a); n++; }
    }
    return n;
  }
  scare(x, z, r) {
    for (const a of this.peds) {
      if (a.state === 'down') continue;
      if (Math.hypot(a.x - x, a.z - z) < r) { a.state = 'flee'; a.timer = 6; }
    }
  }
  // Bullet bilan to'g'ridan-to'g'ri tekshirish uchun (o'q koordinatalari)
  pedTargets() { return this.peds.filter(a => a.state !== 'down').map(a => ({ x: a.x, z: a.z, ref: a })); }
  damagePed(a, dmg) { a.hp -= dmg; if (a.hp <= 0) this._killPed(a); else { a.state = 'flee'; a.timer = 6; } }

  // Mashinaga kirish uchun eng yaqin
  nearestEnterable(x, z, maxd = 4.5) {
    let best = null, bd = maxd;
    for (const s of this.parked.keys()) {
      if (s.taken || !s.mesh) continue;
      const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = { kind: 'parked', ref: s, x: s.x, z: s.z, h: s.h, modelId: s.modelId, color: s.color }; }
    }
    for (const a of this.cars) {
      const d = Math.hypot(a.x - x, a.z - z); if (d < bd) { bd = d; best = { kind: 'traffic', ref: a, x: a.x, z: a.z, h: a.h, modelId: a.id, color: a.color }; }
    }
    return best;
  }
  take(rec) {
    if (rec.kind === 'parked') { rec.ref.taken = true; if (rec.ref.mesh) { this.root.remove(rec.ref.mesh); rec.ref.mesh = null; } this.parked.delete(rec.ref); }
    else { const i = this.cars.indexOf(rec.ref); if (i >= 0) { this.root.remove(rec.ref.mesh); this.cars.splice(i, 1); } }
  }
  // O'yinchi mashinadan chiqqanda — mashina joyida qoladi
  drop(car, mesh, modelId, color) {
    const s = { x: car.x, z: car.z, h: car.h, modelId, color, mesh, taken: false, persistent: true, id: 'drop' + Math.random() };
    this.root.add(mesh); mesh.position.set(car.x, 0.03, car.z); mesh.rotation.y = car.h;
    this.parked.set(s, true);
  }
  // Piyoda to'qnashuvi: to'xtagan mashinalar
  pushOut(x, z, r) {
    let hit = false;
    for (const s of this.parked.keys()) {
      if (!s.mesh || Math.abs(s.x - x) > 4 || Math.abs(s.z - z) > 4) continue;
      const sp = getCarSpec(s.modelId), hl = sp.l / 2 - 0.5, hw = sp.w / 2;
      const fx = Math.sin(s.h), fz = Math.cos(s.h);
      for (let i = -1; i <= 1; i++) {
        const cx = s.x + fx * hl * i * 0.9, cz = s.z + fz * hl * i * 0.9;
        const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz), rr = r + hw;
        if (d < rr) { const k = (rr - d) / (d || 1); x += dx * k; z += dz * k; hit = true; }
      }
    }
    return { x, z, hit };
  }
  // Haydalayotgan mashina to'qnashuvi (trafik va to'xtaganlar). Qaytaradi: zarba tezligi
  collideCar(c, spec) {
    let impact = 0;
    const test = (ox, oz, ospec, ovx, ovz, tag) => {
      const dx = c.x - ox, dz = c.z - oz;
      if (Math.abs(dx) > 6 || Math.abs(dz) > 6) return;
      const rr = (spec.w + ospec.w) * 0.5 + 0.5 + (spec.l + ospec.l) * 0.06;
      const d = Math.hypot(dx, dz);
      if (d < rr) {
        const nx = dx / (d || 1), nz = dz / (d || 1), k = rr - d;
        c.x += nx * k; c.z += nz * k;
        const rv = (c.vx - ovx) * nx + (c.vz - ovz) * nz;
        if (rv < 0) { c.vx -= nx * rv * 1.4; c.vz -= nz * rv * 1.4; impact = Math.max(impact, -rv); }
        if (tag) tag.stun = 2.5;
      }
    };
    for (const s of this.parked.keys()) if (s.mesh) { const sp = getCarSpec(s.modelId); for (const i of [-0.7, 0, 0.7]) test(s.x + Math.sin(s.h) * sp.l * 0.3 * i, s.z + Math.cos(s.h) * sp.l * 0.3 * i, sp, 0, 0, null); }
    for (const a of this.cars) { const sp = getCarSpec(a.id); test(a.x, a.z, sp, Math.sin(a.h) * a.speed, Math.cos(a.h) * a.speed, a); }
    return impact;
  }
}
