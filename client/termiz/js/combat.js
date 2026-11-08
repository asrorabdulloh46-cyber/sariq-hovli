// Termiz — Jang tizimi: qurollar, o'q, wanted level (yaxshilangan v2)
import * as THREE from '../../vendor/three.module.min.js';
import * as Audio from './audio.js';

// ── Qurol ta'riflari (sifatli) ───────────────────────────────────────────────
export const WEAPONS = [
  {
    id: 0, name: 'Mushtlash', range: 2.5, dmg: 25, rate: 0.6,
    ammo: Infinity, auto: false, spread: 0, recoilY: 0, recoilX: 0,
    color: 0xff8800, muzzle: false,
  },
  {
    id: 1, name: "To'pponcha", range: 55, dmg: 38, rate: 0.45,
    ammo: 60, auto: false, spread: 0.015, recoilY: 0.025, recoilX: 0.008,
    color: 0xaaaaaa, muzzle: true, bulletCount: 1,
  },
  {
    id: 2, name: 'AK avtomat', range: 110, dmg: 22, rate: 0.095,
    ammo: 120, auto: true, spread: 0.028, recoilY: 0.018, recoilX: 0.010,
    color: 0x777766, muzzle: true, bulletCount: 1,
  },
];

const lerp  = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ── Qon effekti (canvas texture) ────────────────────────────────────────────
function makeBloodTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  for (let i = 0; i < 20; i++) {
    const x = 20 + Math.random() * 24, y = 20 + Math.random() * 24;
    const r = 2 + Math.random() * 7;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = `rgba(${120 + Math.floor(Math.random()*80)},0,0,${0.5+Math.random()*0.5})`;
    c.fill();
  }
  return new THREE.CanvasTexture(cv);
}
const BLOOD_TEX = makeBloodTex();

// ── Muzzle flash mesh ────────────────────────────────────────────────────────
function makeMuzzleFlash() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16,16,0,16,16,16);
  g.addColorStop(0, 'rgba(255,240,100,1)');
  g.addColorStop(0.4, 'rgba(255,160,30,0.8)');
  g.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,32,32);
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.4),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  mesh.visible = false;
  return mesh;
}

// ── Wanted level logikasi ────────────────────────────────────────────────────
export class WantedSystem {
  constructor() {
    this.level = 0;
    this.heatTimer = 0;
    this.cooldown  = 0;
    this.flashT    = 0;
  }

  addHeat(amount) {
    this.heatTimer += amount;
    const newLevel = Math.min(5, Math.floor(this.heatTimer / 20));
    if (newLevel > this.level) {
      this.level = newLevel;
      Audio.playPoliceAlert();
    }
    this.cooldown = 20 + this.level * 10;
  }

  update(dt) {
    this.flashT += dt;
    if (this.level === 0) return;
    if (this.cooldown > 0) {
      this.cooldown -= dt;
    } else {
      this.heatTimer = Math.max(0, this.heatTimer - dt * 2);
      const newLevel = Math.max(0, Math.min(5, Math.floor(this.heatTimer / 20)));
      this.level = newLevel;
    }
  }

  shouldChase() { return this.level >= 1; }
  get flashing() { return this.level > 0 && Math.sin(this.flashT * 8) > 0; }
}

// ── O'q menejeri (sifatli) ───────────────────────────────────────────────────
export class BulletManager {
  constructor(scene) {
    this.scene = scene;
    this.bullets = [];
    this.bloodDecals = [];
    // O'q geometriyasi (uzun silindr — realistik ko'rinish)
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xffee44 });
    this.bulletGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.18, 4);
    this.bulletGeom.rotateX(Math.PI / 2); // old tomonni ko'rsatish
    // Muzzle flash
    this.muzzleFlash = makeMuzzleFlash();
    scene.add(this.muzzleFlash);
    // Recoil holati
    this.recoilPitch = 0;
    this.recoilYaw   = 0;
  }

  // ox, oy, oz — total nuqta; dirX, dirZ — yo'nalish
  fire(ox, oy, oz, dirX, dirZ, dmg, range, spread = 0, dirY = 0) {
    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len, nz = dirZ / len;

    // Tarqalish (spread)
    const sx = (Math.random() - 0.5) * spread * 2;
    const sz = (Math.random() - 0.5) * spread * 2;

    const mesh = new THREE.Mesh(this.bulletGeom, this.bulletMat);
    mesh.position.set(ox, oy, oz);

    // Yo'nalish rotatsiyasi
    const angle = Math.atan2(nx + sx, nz + sz);
    mesh.rotation.y = angle;
    mesh.rotation.x = -Math.asin(Math.max(-1, Math.min(1, dirY)));
    this.scene.add(mesh);

    this.bullets.push({
      mesh,
      x: ox, y: oy, z: oz,
      vx: (nx + sx) * 90,
      vy: dirY * 90 + (Math.random() - 0.5) * spread * 90,
      vz: (nz + sz) * 90,
      dmg, life: range / 90,
      startX: ox, startZ: oz,
    });

    // Muzzle flash
    this.muzzleFlash.position.set(ox + nx * 0.5, oy, oz + nz * 0.5);
    this.muzzleFlash.lookAt(ox - nx, oy, oz - nz);
    this.muzzleFlash.visible = true;
    this.muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.5);
    setTimeout(() => { if (this.muzzleFlash) this.muzzleFlash.visible = false; }, 50);

    Audio.playShot();
    return { recoilPitch: WEAPONS[1]?.recoilY ?? 0.02, recoilYaw: (Math.random()-0.5)*0.012 };
  }

  // Qon decal qo'shish
  _addBloodDecal(x, z) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6 + Math.random() * 0.4, 0.6 + Math.random() * 0.4),
      new THREE.MeshBasicMaterial({ map: BLOOD_TEX, transparent: true, depthWrite: false })
    );
    mesh.position.set(x, 0.02, z);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    this.scene.add(mesh);
    this.bloodDecals.push({ mesh, life: 15 });
    // Juda ko'p bo'lsa eskisini o'chir
    if (this.bloodDecals.length > 30) {
      const old = this.bloodDecals.shift();
      this.scene.remove(old.mesh);
    }
  }

  update(dt, world) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const px = b.x, pz = b.z;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.vy -= 2.0 * dt; // yengil tushish
      b.life -= dt;
      b.mesh.position.set(b.x, b.y, b.z);
      const blocked = world && b.y < 14 && world.rayBlocked(px, pz, b.x, b.z);
      if (b.life <= 0 || b.y < 0 || blocked) {
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
      }
    }
    // Recoil qaytishi
    this.recoilPitch = lerp(this.recoilPitch, 0, Math.min(1, dt * 15));
    this.recoilYaw   = lerp(this.recoilYaw,   0, Math.min(1, dt * 12));
  }

  checkHit(targets, radius = 0.6) {
    const hits = [];
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (b.y > 2.2 || b.y < 0.05) continue;
      for (const t of targets) {
        const tx = typeof t.x === 'number' ? t.x : (t.position?.x ?? 0);
        const tz = typeof t.z === 'number' ? t.z : (t.position?.z ?? 0);
        if (Math.hypot(b.x - tx, b.z - tz) < radius) {
          hits.push({ target: t, dmg: b.dmg });
          this._addBloodDecal(b.x, b.z);
          this.scene.remove(b.mesh);
          this.bullets.splice(i, 1);
          Audio.playHit();
          break;
        }
      }
    }
    return hits;
  }

  applyRecoil(pitch, yaw) {
    this.recoilPitch += pitch;
    this.recoilYaw   += yaw;
  }

  dispose() {
    for (const b of this.bullets) this.scene.remove(b.mesh);
    this.bullets = [];
    this.scene.remove(this.muzzleFlash);
  }
}

// ── Politsiya mashinasi ───────────────────────────────────────────────────────
import { newCar, stepCar, createCar, animateCar } from './cars.js';

export class PoliceCar {
  constructor(scene, x, z, h = 0) {
    this.scene = scene;
    this.car = newCar(x, z, h, 'police');
    this.mesh = createCar('police', 0x1a3a99);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.hp = 100;
    this._lightT = 0;
    this._siren = null;
    this._chaseMode = 'approach'; // approach | ram | circle
  }

  update(dt, targetX, targetZ, world) {
    const c = this.car;
    this._lightT += dt;

    const dx = targetX - c.x, dz = targetZ - c.z;
    const dist = Math.hypot(dx, dz);
    const targetH = Math.atan2(dx, dz);

    // Yo'nalish farqi
    let dh = targetH - c.h;
    while (dh >  Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;

    // Asta burilish
    c.h += clamp(dh, -2.5 * dt, 2.5 * dt);

    const inp = {
      gas:        dist > 6  ? 1 : 0,
      brake:      dist < 10 ? 0.6 : 0,
      steer:      0,
      handbrake:  false,
    };
    stepCar(c, inp, dt);

    if (world) {
      const p = world.pushOut(c.x, c.z, 1.6);
      if (p.hit) { c.x = p.x; c.z = p.z; c.vx *= 0.3; c.vz *= 0.3; }
    }
    this.mesh.position.set(c.x, 0.03, c.z);
    this.mesh.rotation.y = c.h;
    animateCar(this.mesh, dt, c.vx * Math.sin(c.h) + c.vz * Math.cos(c.h), 0, this._lightT);
  }

  dispose() {
    this.scene.remove(this.mesh);
  }
}

// ── Nishon (Crosshair) SVG ────────────────────────────────────────────────────
export function createCrosshair() {
  const el = document.createElement('div');
  el.id = 'crosshair';
  el.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    pointer-events:none;z-index:60;transition:transform 0.08s;
  `;
  el.innerHTML = `<svg width="30" height="30" viewBox="0 0 30 30" fill="none">
    <line x1="15" y1="4"  x2="15" y2="12" stroke="white" stroke-width="1.5" opacity="0.9"/>
    <line x1="15" y1="18" x2="15" y2="26" stroke="white" stroke-width="1.5" opacity="0.9"/>
    <line x1="4"  y1="15" x2="12" y2="15" stroke="white" stroke-width="1.5" opacity="0.9"/>
    <line x1="18" y1="15" x2="26" y2="15" stroke="white" stroke-width="1.5" opacity="0.9"/>
    <circle cx="15" cy="15" r="2" fill="white" opacity="0.8"/>
  </svg>`;
  document.body.appendChild(el);
  return el;
}

export function animateCrosshair(el, recoilPitch) {
  if (!el) return;
  const scale = 1 + recoilPitch * 15;
  el.style.transform = `translate(-50%,-50%) scale(${scale.toFixed(2)})`;
}
