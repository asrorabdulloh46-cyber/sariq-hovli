// Termiz — NPC: piyodalar, hayvonlar, traffic mashinalar (client-side, deterministik)
import * as THREE from '../../vendor/three.module.min.js';
import { newCar, stepCar, createCar, randomTrafficCar } from './cars.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ── Sodda LCG RNG ─────────────────────────────────────────────────────────────
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Piyoda ────────────────────────────────────────────────────────────────────
const PED_COLORS = [0xcc8844, 0x885522, 0xddaa66, 0x443322, 0xffccaa];
const PED_SPEED = 1.2;

function makePedMesh(color = 0xcc8844) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  // Tana
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.0, 6), mat);
  body.position.y = 0.9; g.add(body);
  // Bosh
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5),
    new THREE.MeshLambertMaterial({ color: 0xffbb88 }));
  head.position.y = 1.6; g.add(head);
  return g;
}

function makeAnimalMesh(type) {
  const g = new THREE.Group();
  if (type === 'dog') {
    const mat = new THREE.MeshLambertMaterial({ color: 0xaa8855 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.8), mat);
    body.position.y = 0.35; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat);
    head.position.set(0, 0.5, 0.45); g.add(head);
  } else { // cat
    const mat = new THREE.MeshLambertMaterial({ color: 0xddaa66 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.5), mat);
    body.position.y = 0.2; g.add(body);
  }
  return g;
}

// ── Traffic mashina ───────────────────────────────────────────────────────────
class TrafficCar {
  constructor(scene, rand, map, spawnX, spawnZ, angle) {
    const { id, color } = randomTrafficCar(rand);
    this.car = newCar(spawnX, spawnZ, angle, id);
    this.car.color = color;
    this.mesh = createCar(id, color);
    this.mesh.position.set(spawnX, 0, spawnZ);
    scene.add(this.mesh);
    this.scene = scene;
    this.map = map;

    // Marshrutni yo'l grafigidan olish
    this.path = [];
    this.pathIdx = 0;
    this.waitT = 0;
    this.speed = 6 + rand() * 8;
  }

  update(dt, playerX, playerZ) {
    // Oddiy forward movement along current heading
    if (this.waitT > 0) { this.waitT -= dt; return; }

    const c = this.car;
    const fwdX = Math.sin(c.h), fwdZ = Math.cos(c.h);
    c.x += fwdX * this.speed * dt;
    c.z += fwdZ * this.speed * dt;
    c.vx = fwdX * this.speed;
    c.vz = fwdZ * this.speed;

    // Bounds check → turn around
    const { minX, maxX, minZ, maxZ } = this.map.meta.bounds;
    if (c.x < minX || c.x > maxX || c.z < minZ || c.z > maxZ) {
      c.h += Math.PI + (Math.random() - 0.5) * 0.8;
    }

    this.mesh.position.set(c.x, 0, c.z);
    this.mesh.rotation.y = c.h;
  }

  dispose() {
    this.scene.remove(this.mesh);
  }
}

// ── NPC Manager ───────────────────────────────────────────────────────────────
const MAX_PEDS = 40;
const MAX_TRAFFIC = 25;
const MAX_ANIMALS = 15;
const SPAWN_RADIUS = 180;
const DESPAWN_RADIUS = 220;

export class NPCManager {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.rand = rng(42);
    this.peds = [];
    this.animals = [];
    this.traffic = [];
    this.pedMeshPool = [];
    this._t = 0;
  }

  update(dt, px, pz) {
    this._t += dt;

    // Piyodalar
    this._updatePeds(dt, px, pz);
    // Hayvonlar
    this._updateAnimals(dt, px, pz);
    // Traffic
    this._updateTraffic(dt, px, pz);

    // Spawn
    if (this._t % 2 < dt) {
      if (this.peds.length < MAX_PEDS) this._spawnPed(px, pz);
      if (this.animals.length < MAX_ANIMALS && this.rand() < 0.3) this._spawnAnimal(px, pz);
      if (this.traffic.length < MAX_TRAFFIC) this._spawnTraffic(px, pz);
    }
  }

  _spawnPed(px, pz) {
    const angle = this.rand() * Math.PI * 2;
    const dist  = 60 + this.rand() * (SPAWN_RADIUS - 60);
    const x = px + Math.cos(angle) * dist;
    const z = pz + Math.sin(angle) * dist;
    const color = PED_COLORS[Math.floor(this.rand() * PED_COLORS.length)];
    const mesh = makePedMesh(color);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const dir = this.rand() * Math.PI * 2;
    this.peds.push({ mesh, x, z, dir, speed: PED_SPEED * (0.7 + this.rand() * 0.6), t: 0 });
  }

  _spawnAnimal(px, pz) {
    const angle = this.rand() * Math.PI * 2;
    const dist  = 40 + this.rand() * 100;
    const x = px + Math.cos(angle) * dist;
    const z = pz + Math.sin(angle) * dist;
    const type = this.rand() < 0.6 ? 'dog' : 'cat';
    const mesh = makeAnimalMesh(type);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const dir = this.rand() * Math.PI * 2;
    this.animals.push({ mesh, x, z, dir, speed: 1.5 + this.rand() * 1.5, t: 0, type, pauseT: 0 });
  }

  _spawnTraffic(px, pz) {
    // Yaqin yo'lda spawn qilish
    const angle = this.rand() * Math.PI * 2;
    const dist  = 80 + this.rand() * (SPAWN_RADIUS - 80);
    const x = px + Math.cos(angle) * dist;
    const z = pz + Math.sin(angle) * dist;
    const dir = this.rand() * Math.PI * 2;
    const tc = new TrafficCar(this.scene, this.rand, this.map, x, z, dir);
    this.traffic.push(tc);
  }

  _updatePeds(dt, px, pz) {
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      p.t += dt;
      // Yo'nalishni vaqti-vaqti bilan o'zgartirish
      if ((p.t % 4) < dt) {
        p.dir += (Math.random() - 0.5) * 1.2;
      }
      p.x += Math.sin(p.dir) * p.speed * dt;
      p.z += Math.cos(p.dir) * p.speed * dt;
      // Yurish animatsiyasi (body bob)
      p.mesh.position.set(p.x, Math.abs(Math.sin(p.t * 4)) * 0.04, p.z);
      p.mesh.rotation.y = p.dir;

      // Despawn
      if (Math.hypot(p.x - px, p.z - pz) > DESPAWN_RADIUS) {
        this.scene.remove(p.mesh);
        this.peds.splice(i, 1);
      }
    }
  }

  _updateAnimals(dt, px, pz) {
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      a.t += dt;
      if (a.pauseT > 0) { a.pauseT -= dt; }
      else {
        if ((a.t % 3) < dt) {
          if (Math.random() < 0.3) a.pauseT = 1 + Math.random() * 2;
          else a.dir += (Math.random() - 0.5) * 2;
        }
        a.x += Math.sin(a.dir) * a.speed * dt;
        a.z += Math.cos(a.dir) * a.speed * dt;
        a.mesh.position.set(a.x, 0, a.z);
        a.mesh.rotation.y = a.dir;
      }
      if (Math.hypot(a.x - px, a.z - pz) > DESPAWN_RADIUS) {
        this.scene.remove(a.mesh);
        this.animals.splice(i, 1);
      }
    }
  }

  _updateTraffic(dt, px, pz) {
    for (let i = this.traffic.length - 1; i >= 0; i--) {
      const tc = this.traffic[i];
      tc.update(dt, px, pz);
      const { x, z } = tc.car;
      if (Math.hypot(x - px, z - pz) > DESPAWN_RADIUS) {
        tc.dispose();
        this.traffic.splice(i, 1);
      }
    }
  }

  // NPC-ga otish
  hitNPC(x, z, radius) {
    for (const p of this.peds) {
      if (Math.hypot(p.x - x, p.z - z) < radius) {
        // Qochib ketish
        p.dir = Math.atan2(p.x - x, p.z - z);
        p.speed = PED_SPEED * 2.5;
        return true;
      }
    }
    return false;
  }

  dispose() {
    for (const p of this.peds)   { this.scene.remove(p.mesh); }
    for (const a of this.animals){ this.scene.remove(a.mesh); }
    for (const t of this.traffic){ t.dispose(); }
    this.peds = []; this.animals = []; this.traffic = [];
  }
}
