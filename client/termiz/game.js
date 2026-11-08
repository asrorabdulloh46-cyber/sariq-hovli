// Termiz GTA — Asosiy klient (v3: real Termiz, Hakim at-Termiziy masjidi, jonli shahar)
import * as THREE from 'three';
import {
  DEFAULT_SERVER, MAP_PATH, NEAR_CLIP, PLAYER_SPEED, PLAYER_SPRINT, PLAYER_H, GRAVITY, INTERP_MS, SEND_HZ,
  SPAWN_X, SPAWN_Z, SPAWN_RADIUS, PLAYER_NAMES, MOSQUE, QUALITY,
} from './config.js';
import { World } from './js/world.js';
import { Input } from './js/input.js';
import { Traffic } from './js/traffic.js';
import { makeHuman, animateHuman, gunMesh } from './js/chars.js';
import { BulletManager, WantedSystem, PoliceCar, WEAPONS, createCrosshair, animateCrosshair } from './js/combat.js';
import { Network } from './js/net.js';
import * as Audio from './js/audio.js';
import { newCar, stepCar, createCar, getCarSpec, animateCar, setCarNight, PLAYER_COLORS } from './js/cars.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const lerpA = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
const QS = new URLSearchParams(location.search);

const isTouch = ('ontouchstart' in window || navigator.maxTouchPoints > 0) && !QS.has('desktop');
if (isTouch) document.body.classList.add('touch');

const store = {
  get: (k, d) => { try { const v = localStorage.getItem('tz_' + k); return v == null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('tz_' + k, String(v)); } catch { /* */ } },
};

// ── Sifat darajasi ───────────────────────────────────────────────────────────
let qName = QS.get('q') || store.get('q', '') || (isTouch ? 'mid' : 'high');
if (!QUALITY[qName]) qName = 'mid';
const Q = { ...QUALITY[qName], parkedR: 130 };

// ── O'yin holati ─────────────────────────────────────────────────────────────
const S = {
  phase: 'loading', name: '', color: 0,
  px: SPAWN_X, py: 0, pz: SPAWN_Z, gy: 0,
  ph: 2.0, pitch: 0.0, face: 2.0,
  vx: 0, vz: 0, vy: 0, onGround: true,
  inCar: false, myCar: null, carId: null,
  weaponIdx: 0, ammo: [Infinity, 60, 120], fireT: 0, fireHeld: false, fireQueued: false, lastShot: -9,
  hp: 100, maxHp: 100,
  wsOK: false, myId: -1, remotes: new Map(),
  camMode: 0, camOff: 0, camPitchCar: 0.12, camYaw: 0,
  lastSend: 0, lastFootstep: 0, recoilPitch: 0, recoilYaw: 0,
  speedShown: 0,
};

// ── Three.js ─────────────────────────────────────────────────────────────────
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
let pixelRatio = Math.min(window.devicePixelRatio || 1, Q.pixelRatio);
renderer.setPixelRatio(pixelRatio);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, NEAR_CLIP + 0.1, 1400);
camera.rotation.order = 'YXZ';
function resize() {
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200)); resize();

// ── Global modullar ──────────────────────────────────────────────────────────
let world = null, traffic = null, bullets = null, wanted = null, net = null, input = null, crosshair = null;
let playerMesh = null, gun = null, engine = null;
let policeCars = [];
let mapData = null;
const miniCanvas = $('minimap'), mini = miniCanvas?.getContext('2d');
window._gameRespawn = () => respawn();

const setLoad = (p, txt) => { const b = document.querySelector('#loadbar i'); if (b) b.style.width = Math.round(p * 100) + '%'; if (txt && $('loadtxt')) $('loadtxt').textContent = txt; };

function toast(msg) {
  const el = $('toast'); if (!el) return;
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('on'), 3600);
}
function flashScreen(color) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;inset:0;background:${color};pointer-events:none;z-index:70;transition:opacity .35s;opacity:1`;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '0'; });
  setTimeout(() => el.remove(), 450);
}

// ── Odamlar ──────────────────────────────────────────────────────────────────
const SHIRT_COLORS = [0xb3262e, 0x1d5fd0, 0x14914a, 0xe6b800, 0x7a1fcf, 0xe0600a, 0xf0f0f0, 0x222222];
function makePlayerMesh(colorIdx, seed) {
  const m = makeHuman({ seed: seed ?? (colorIdx * 7919 + 13), kind: 'man', shirt: SHIRT_COLORS[colorIdx % SHIRT_COLORS.length] });
  return m;
}

// ── O'yin boshlash ───────────────────────────────────────────────────────────
function spawnPoint() {
  const a = Math.random() * Math.PI * 2, d = Math.random() * SPAWN_RADIUS;
  let x = SPAWN_X + Math.cos(a) * d, z = SPAWN_Z + Math.sin(a) * d;
  const p = world.pushOut(x, z, 0.5); return [p.x, p.z];
}

function startGame(name, colorIdx) {
  S.name = name; S.color = colorIdx; S.phase = 'play';
  $('namescreen').classList.add('hide'); $('loading').classList.add('hide'); $('hud').style.display = 'block';
  Audio.resume(); Audio.startAmbient();

  playerMesh = makePlayerMesh(colorIdx);
  gun = gunMesh(); gun.visible = false;
  playerMesh.userData.rig.shR.add(gun); gun.position.set(0.02, -0.52, 0.05); gun.rotation.set(Math.PI / 2, 0, 0);
  scene.add(playerMesh);

  const [x, z] = spawnPoint();
  S.px = x; S.pz = z; S.gy = world.getGroundY(x, z); S.py = S.gy;
  S.ph = S.face = Math.atan2(MOSQUE.qx, MOSQUE.qz); S.pitch = 0.02;
  if (QS.has('x')) { S.px = parseFloat(QS.get('x')); S.pz = parseFloat(QS.get('z')); }
  if (QS.has('yaw')) S.ph = S.face = parseFloat(QS.get('yaw'));

  world.updateChunks(S.px, S.pz);
  traffic.populate(S.px, S.pz);
  crosshair = createCrosshair(); crosshair.style.display = 'none';

  net = new Network(store.get('server', DEFAULT_SERVER), handleNetMsg);
  if (!QS.has('offline')) net.connect();

  toast(isTouch ? `Xush kelibsiz, ${name}! Chap — yurish, oʻng — qarash. 🚗 — mashinaga kirish` : `Xush kelibsiz, ${name}! E — mashina, F — otish, G — qurol, M — xarita`);
  updateHUD();
}

// ── Tarmoq ───────────────────────────────────────────────────────────────────
function makeTag(name) {
  const el = document.createElement('div'); el.className = 'nametag'; el.textContent = name; document.body.appendChild(el); return el;
}
function handleNetMsg(msg) {
  if (msg.type === 'welcome') {
    S.myId = msg.id; S.wsOK = true;
    net.send({ type: 'join', name: S.name, color: S.color });
    toast(`Server bilan ulandi (ID ${msg.id})`);
  } else if (msg.type === 'close') {
    S.wsOK = false; toast('Aloqa uzildi, qayta urinmoqda…');
  } else if (msg.type === 'p') {
    for (const [idStr, data] of Object.entries(msg.players)) {
      const id = parseInt(idStr);
      if (id === S.myId) continue;
      if (!S.remotes.has(id)) {
        const mesh = makePlayerMesh(data.color || 0, id * 101 + 7); scene.add(mesh);
        S.remotes.set(id, { mesh, hp: 100, inCar: false, carMesh: null, name: data.name || `Oʻyinchi${id}`, tag: makeTag(data.name || `Oʻyinchi${id}`), lx: 0, lz: 0, speed: 0, color: data.color || 0 });
      }
      const r = S.remotes.get(id);
      if (data.name && r.name !== data.name) { r.name = data.name; r.tag.textContent = data.name; }
      const snap = net.getInterpolated(id, INTERP_MS);
      if (!snap) continue;
      r.inCar = !!snap.inCar;
      if (snap.inCar) {
        r.mesh.visible = false;
        if (!r.carMesh) { r.carMesh = createCar('sedan', PLAYER_COLORS[(data.color || 0) % PLAYER_COLORS.length]); scene.add(r.carMesh); r.cx = snap.cx ?? snap.x; r.cz = snap.cz ?? snap.z; }
        const nx = snap.cx ?? snap.x, nz = snap.cz ?? snap.z;
        r.speed = Math.hypot(nx - r.cx, nz - r.cz) * SEND_HZ; r.cx = nx; r.cz = nz;
        r.carMesh.position.set(nx, 0.03, nz); r.carMesh.rotation.y = snap.ch ?? snap.h; r.carMesh.visible = true;
      } else {
        if (r.carMesh) r.carMesh.visible = false;
        r.speed = Math.hypot(snap.x - r.lx, snap.z - r.lz) * SEND_HZ; r.lx = snap.x; r.lz = snap.z;
        r.mesh.position.set(snap.x, world.getGroundY(snap.x, snap.z), snap.z);
        r.mesh.rotation.y = snap.h; r.mesh.visible = true;
      }
      r.hp = snap.hp ?? r.hp;
    }
    for (const [id, r] of S.remotes) if (!msg.players[id]) { scene.remove(r.mesh); if (r.carMesh) scene.remove(r.carMesh); r.tag.remove(); S.remotes.delete(id); }
  } else if (msg.type === 'hit') {
    if (msg.target === S.myId) {
      S.hp = Math.max(0, S.hp - (msg.dmg || 10)); Audio.playHit(); flashScreen('rgba(255,0,0,.25)');
      if (S.hp <= 0) die();
    }
  } else if (msg.type === 'chat') toast(`${msg.name}: ${msg.text}`);
}

// ── O'lim / qayta tug'ilish ──────────────────────────────────────────────────
function die() {
  if (S.phase === 'dead') return;
  S.phase = 'dead'; S.hp = 0; exitCar(true);
  if (playerMesh) playerMesh.userData.fall = 0.01;
  updateHUD(); flashScreen('rgba(160,0,0,.55)'); window._onDead?.();
}
function respawn() {
  S.hp = S.maxHp; S.phase = 'play';
  const [x, z] = spawnPoint(); S.px = x; S.pz = z; S.gy = world.getGroundY(x, z); S.py = S.gy;
  S.vx = S.vz = S.vy = 0; S.recoilPitch = S.recoilYaw = 0;
  if (playerMesh) { playerMesh.userData.fall = 0; playerMesh.rotation.x = 0; playerMesh.position.y = 0; }
  if (wanted) { wanted.level = 0; wanted.heatTimer = 0; }
  updateHUD(); window._onAlive?.();
  toast('Qayta tirildingiz — Hakim at-Termiziy masjidi maydoni');
}

// ── Mashina ──────────────────────────────────────────────────────────────────
function enterCar() {
  const rec = traffic.nearestEnterable(S.px, S.pz, 4.8);
  if (!rec) { toast('Yaqin atrofda mashina yoʻq'); return; }
  const mesh = rec.ref.mesh || createCar(rec.modelId, rec.color);
  const car = newCar(rec.x, rec.z, rec.h, rec.modelId);
  if (rec.kind === 'traffic') { car.vx = Math.sin(rec.h) * rec.ref.speed; car.vz = Math.cos(rec.h) * rec.ref.speed; wanted?.addHeat(4); }
  traffic.take(rec);
  mesh.rotation.order = 'YXZ'; scene.add(mesh); mesh.position.set(car.x, 0.03, car.z); mesh.rotation.y = car.h;
  S.myCar = { car, mesh, modelId: rec.modelId, color: rec.color, bank: 0, pitchA: 0 };
  S.inCar = true; S.carId = rec.modelId; input.inCar = true;
  playerMesh.visible = false; if (crosshair) crosshair.style.display = 'none';
  document.body.classList.add('inCar'); Audio.playDoor();
  S.camOff = 0; S.camYaw = car.h;
  engine = engine || new Audio.EngineSound();
  toast(`${getCarSpec(rec.modelId).name} — E: chiqish`);
}
function exitCar(silent = false) {
  if (!S.inCar || !S.myCar) return;
  const { car, mesh, modelId, color } = S.myCar, sp = getCarSpec(modelId);
  const h = car.h, off = sp.w / 2 + 0.9;
  let x = car.x + Math.cos(h) * off, z = car.z - Math.sin(h) * off;
  const p = world.pushOut(x, z, 0.5); S.px = p.x; S.pz = p.z;
  S.gy = world.getGroundY(S.px, S.pz); S.py = S.gy; S.vx = S.vz = S.vy = 0;
  car.vx *= 0.2; car.vz *= 0.2;
  traffic.drop(car, mesh, modelId, color);
  mesh.rotation.z = 0; mesh.rotation.x = 0;
  S.myCar = null; S.carId = null; S.inCar = false; input.inCar = false;
  playerMesh.visible = true; document.body.classList.remove('inCar');
  S.face = S.ph = lerpA(S.ph, h, 1);
  engine?.stop(); if (!silent) Audio.playDoor();
}

// ── Otish ────────────────────────────────────────────────────────────────────
const _fwd = new THREE.Vector3();
function aimDir(ox, oy, oz) {
  camera.getWorldDirection(_fwd);
  const tx = camera.position.x + _fwd.x * 60, ty = camera.position.y + _fwd.y * 60, tz = camera.position.z + _fwd.z * 60;
  let dx = tx - ox, dy = ty - oy, dz = tz - oz; const L = Math.hypot(dx, dy, dz) || 1;
  return [dx / L, dy / L, dz / L];
}
function doShoot() {
  const w = WEAPONS[S.weaponIdx];
  S.lastShot = performance.now() / 1000;
  const fx = Math.sin(S.ph), fz = Math.cos(S.ph);
  if (!w.muzzle) {                                       // mushtlash
    const hit = traffic.hitNPC(S.px + fx * 0.9, S.pz + fz * 0.9, 1.5, 30);
    if (hit) { wanted?.addHeat(1); Audio.playHit(); }
    for (const [id, r] of S.remotes) {
      const p = r.mesh.position; if (Math.hypot(p.x - (S.px + fx * 0.9), p.z - (S.pz + fz * 0.9)) < 1.3) net?.sendHit(id, w.dmg);
    }
    playerMesh.userData.punch = 0.25;
    return;
  }
  if (S.ammo[S.weaponIdx] !== Infinity && S.ammo[S.weaponIdx] <= 0) { toast('Oʻq tugadi!'); S.fireHeld = false; return; }
  if (S.ammo[S.weaponIdx] !== Infinity) S.ammo[S.weaponIdx]--;
  const rx = -fz, rz = fx;
  const ox = S.px + fx * 0.55 + rx * 0.22, oy = S.py + 1.28, oz = S.pz + fz * 0.55 + rz * 0.22;
  const [dx, dy, dz] = aimDir(ox, oy, oz);
  const hxz = Math.hypot(dx, dz) || 1;
  const res = bullets?.fire(ox, oy, oz, dx, dz, w.dmg, w.range, w.spread, dy / hxz);
  if (res) {
    S.recoilPitch = Math.min(0.3, S.recoilPitch + w.recoilY);
    S.recoilYaw += (Math.random() - 0.5) * w.recoilX * 2;
  }
  traffic.scare(S.px, S.pz, 30);
  wanted?.addHeat(1);
}
function checkBulletHits() {
  if (!bullets) return;
  const targets = [...S.remotes.entries()].map(([id, r]) => ({ id, x: r.mesh.position.x, z: r.mesh.position.z }));
  for (const h of bullets.checkHit(targets, 0.62)) { net?.sendHit(h.target.id, h.dmg); flashScreen('rgba(255,255,0,.08)'); }
  const peds = traffic.pedTargets();
  for (const h of bullets.checkHit(peds, 0.6)) { traffic.damagePed(h.target.ref, h.dmg); wanted?.addHeat(3); }
}

// ── Politsiya ────────────────────────────────────────────────────────────────
function updatePolice(dt) {
  const level = wanted?.level ?? 0, target = Math.min(level, 3);
  const tx = S.inCar ? S.myCar.car.x : S.px, tz = S.inCar ? S.myCar.car.z : S.pz;
  while (policeCars.length < target) {
    const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 60;
    policeCars.push(new PoliceCar(scene, tx + Math.cos(a) * d, tz + Math.sin(a) * d, a + Math.PI));
    Audio.playPoliceAlert?.();
  }
  while (policeCars.length > target) policeCars.pop()?.dispose();
  for (const pc of policeCars) {
    pc.update(dt, tx, tz, world);
    if (Math.hypot(pc.car.x - tx, pc.car.z - tz) < 3.2 && S.phase === 'play' && !S.inCar) { S.hp = Math.max(0, S.hp - 12 * dt); if (S.hp <= 0) die(); }
  }
}

// ── Piyoda harakat ───────────────────────────────────────────────────────────
function updateFoot(dt) {
  // Kamera aylantirish
  S.ph -= input.consumeYaw();
  S.pitch = clamp(S.pitch - input.consumePitch(), -0.95, 0.6);
  const { move } = input;
  const sprint = input.sprint && move.fwd > -0.3;
  const spd = sprint ? PLAYER_SPRINT : PLAYER_SPEED;
  const sinH = Math.sin(S.ph), cosH = Math.cos(S.ph);
  // oldinga = (sin, cos), o'ng = (-cos, sin)
  let wx = sinH * move.fwd - cosH * move.side, wz = cosH * move.fwd + sinH * move.side;
  const len = Math.hypot(wx, wz);
  if (len > 1) { wx /= len; wz /= len; }
  const mag = Math.min(1, Math.hypot(move.fwd, move.side));
  const k = Math.min(1, dt * (S.onGround ? 11 : 3));
  S.vx = lerp(S.vx, (len > 0.01 ? wx / Math.max(len, 1) * Math.min(len, 1) : 0) * spd, k);
  S.vz = lerp(S.vz, (len > 0.01 ? wz / Math.max(len, 1) * Math.min(len, 1) : 0) * spd, k);
  void mag;

  if (input.jump && S.onGround && S.phase === 'play') { S.vy = 6.4; S.onGround = false; Audio.playJump(); }
  if (!S.onGround) S.vy -= GRAVITY * dt;
  let nx = S.px + S.vx * dt, nz = S.pz + S.vz * dt;
  let p = world.pushOut(nx, nz, 0.38); nx = p.x; nz = p.z;
  p = traffic.pushOut(nx, nz, 0.38); nx = p.x; nz = p.z;
  S.px = nx; S.pz = nz;
  S.py += S.vy * dt;
  const gh = world.getGroundY(S.px, S.pz);
  if (S.onGround) S.gy = lerp(S.gy, gh, Math.min(1, dt * 14));
  else S.gy = gh;
  if (S.py <= S.gy) {
    if (!S.onGround && S.vy < -3) Audio.playLand();
    S.py = S.gy; S.vy = 0; S.onGround = true;
  } else if (S.onGround && S.py > S.gy + 0.15) S.onGround = false;
  if (S.onGround) S.py = S.gy;

  const mv = Math.hypot(S.vx, S.vz);
  // Gavda yo'nalishi: harakat tomoniga yoki (otishda) kameraga
  const aiming = performance.now() / 1000 - S.lastShot < 0.8 || S.fireHeld;
  if (aiming && WEAPONS[S.weaponIdx].muzzle) S.face = lerpA(S.face, S.ph, Math.min(1, dt * 16));
  else if (mv > 0.4) S.face = lerpA(S.face, Math.atan2(S.vx, S.vz), Math.min(1, dt * 12));
  S.recoilPitch = lerp(S.recoilPitch, 0, Math.min(1, dt * 14));
  S.recoilYaw = lerp(S.recoilYaw, 0, Math.min(1, dt * 11));

  if (playerMesh) {
    playerMesh.position.set(S.px, S.py, S.pz);
    playerMesh.rotation.y = S.face;
    const u = playerMesh.userData;
    if (u.punch > 0) u.punch -= dt;
    u.holdGun = S.weaponIdx > 0; gun.visible = u.holdGun;
    if (u.punch > 0) { u.holdGun = false; u.rig.shR.rotation.x = -1.5; }
    animateHuman(playerMesh, dt, S.onGround ? mv : mv * 0.5, { run: sprint && mv > 5 });
    if (u.punch > 0) u.rig.shR.rotation.x = -1.5 + (u.punch / 0.25) * 0.9;
  }
  if (mv > 0.8 && S.onGround) {
    const now = performance.now(), interval = sprint ? 270 : 420;
    if (now - S.lastFootstep > interval) { Audio.playFootstep(); S.lastFootstep = now; }
  }
}

// ── Mashina haydash ──────────────────────────────────────────────────────────
function updateCar(dt) {
  const mc = S.myCar; if (!mc) return;
  const c = mc.car, spec = getCarSpec(mc.modelId), cin = input.car;
  // Qarash burchagi (kamera)
  const dy = input.consumeYaw(), dp = input.consumePitch();
  if (dy || dp) { S.camOff -= dy; S.camPitchCar = clamp(S.camPitchCar - dp, -0.15, 0.7); S.camHold = 2.5; }
  S.camHold = Math.max(0, (S.camHold || 0) - dt);
  if (S.camHold <= 0) { S.camOff = lerp(S.camOff, 0, Math.min(1, dt * 2.2)); S.camPitchCar = lerp(S.camPitchCar, 0.12, Math.min(1, dt * 2)); }
  S.camOff = clamp(S.camOff, -Math.PI, Math.PI);

  stepCar(c, { gas: cin.gas, brake: cin.brake, steer: cin.steer, handbrake: cin.handbrake }, dt);

  // To'qnashuvlar: bino/daraxt (3 doira), boshqa mashinalar
  const fx = Math.sin(c.h), fz = Math.cos(c.h), rad = spec.w / 2 + 0.12;
  let ox = c.x, oz = c.z, sx = 0, sz = 0, hit = false;
  for (const o of [-0.3, 0, 0.3]) {
    const px = c.x + fx * spec.l * o, pz = c.z + fz * spec.l * o;
    const p = world.pushOut(px, pz, rad);
    if (p.hit) { sx += p.x - px; sz += p.z - pz; hit = true; }
  }
  if (hit) {
    c.x += sx * 0.8; c.z += sz * 0.8;
    const sl = Math.hypot(sx, sz) || 1, nx = sx / sl, nz = sz / sl;
    const vn = c.vx * nx + c.vz * nz;
    if (vn < 0) {
      const spd = -vn;
      c.vx -= nx * vn * 1.35; c.vz -= nz * vn * 1.35;
      if (spd > 3.5) { Audio.playCrash(spd); if (spd > 9) { wanted?.addHeat(2); S.hp = Math.max(0, S.hp - (spd - 9) * 1.2); if (S.hp <= 0) die(); } }
    }
  }
  const imp = traffic.collideCar(c, spec);
  if (imp > 3) { Audio.playCrash(imp); wanted?.addHeat(3); if (imp > 10) { S.hp = Math.max(0, S.hp - (imp - 10) * 1.0); if (S.hp <= 0) die(); } }
  void ox; void oz;
  // Piyodalarni urish
  const spd = c.vx * fx + c.vz * fz;
  if (Math.abs(spd) > 4) { const n = traffic.hitByCar(c.x + fx * spec.l * 0.45, c.z + fz * spec.l * 0.45, 1.5, spd); if (n) { wanted?.addHeat(8 * n); Audio.playHit(); } }

  const { minX, maxX, minZ, maxZ } = mapData.meta.bounds;
  if (c.x < minX) { c.x = minX; c.vx *= -0.5; } if (c.x > maxX) { c.x = maxX; c.vx *= -0.5; }
  if (c.z < minZ) { c.z = minZ; c.vz *= -0.5; } if (c.z > maxZ) { c.z = maxZ; c.vz *= -0.5; }

  // Mesh + egilish effekti
  const lat = c.vx * -fz + c.vz * fx;                                // o'ng tomonga tezlik
  mc.bank = lerp(mc.bank, clamp(-c.yawRate * spd * 0.012 + lat * 0.01, -0.07, 0.07), Math.min(1, dt * 6));
  const accel = (spd - (mc.lastSpd ?? spd)) / Math.max(dt, 1e-3); mc.lastSpd = spd;
  mc.pitchA = lerp(mc.pitchA, clamp(accel * 0.0025, -0.04, 0.04), Math.min(1, dt * 5));
  mc.mesh.position.set(c.x, 0.03 + world.getGroundY(c.x, c.z), c.z);
  mc.mesh.rotation.set(-mc.pitchA, c.h, mc.bank, 'YXZ');
  animateCar(mc.mesh, dt, spd, cin.steer, performance.now() / 1000);
  S.px = c.x; S.pz = c.z; S.py = 0; S.gy = 0;
  engine?.update(80 + Math.abs(spd) * 22 + cin.gas * 60, Math.min(1, 0.35 + Math.abs(spd) / 25));
}

// ── Kamera ───────────────────────────────────────────────────────────────────
const _cp = new THREE.Vector3(), _ct = new THREE.Vector3();
function updateCamera(dt) {
  let fov = 68;
  if (S.inCar && S.myCar) {
    const c = S.myCar.car, sp = Math.hypot(c.vx, c.vz);
    S.camYaw = lerpA(S.camYaw, c.h, Math.min(1, dt * (S.camHold > 0 ? 0 : 3.2)));
    const yaw = S.camYaw + S.camOff, pitch = S.camPitchCar;
    fov += Math.min(16, sp * 0.35);
    if (S.camMode === 1) {
      const fx = Math.sin(c.h), fz = Math.cos(c.h);
      camera.position.set(c.x + fx * 0.25, 1.2, c.z + fz * 0.25);
      camera.rotation.set(-(pitch - 0.12) * 0.8, c.h + S.camOff + Math.PI, 0, 'YXZ'); camera.rotation.y = c.h + S.camOff + Math.PI;
      camera.rotation.y = c.h + S.camOff + Math.PI;
      // three: kamera -z ga qaraydi; (sin h, cos h) yo'nalishi uchun rotation.y = h + PI
    } else {
      const dist = 7.4 + sp * 0.07, hgt = 1.9 + pitch * 7;
      const tx = c.x - Math.sin(yaw) * dist, tz = c.z - Math.cos(yaw) * dist;
      _cp.set(tx, 0.6 + hgt, tz);
      camera.position.lerp(_cp, Math.min(1, dt * 9));
      if (camera.position.distanceTo(_cp) > 15) camera.position.copy(_cp);
      _ct.set(c.x + Math.sin(c.h) * 3, 1.0, c.z + Math.cos(c.h) * 3);
      camera.lookAt(_ct);
    }
  } else {
    const pitch = S.pitch;
    const headY = S.py + 1.55;
    if (S.camMode === 1) {
      camera.position.set(S.px + Math.sin(S.face) * 0.12, S.py + 1.62, S.pz + Math.cos(S.face) * 0.12);
      camera.rotation.set(pitch, S.ph + Math.PI, 0, 'YXZ');
      playerMesh.visible = false;
    } else {
      if (playerMesh && S.phase !== 'dead') playerMesh.visible = true;
      const dist = 4.3, el = 0.2 - pitch * 0.85;
      const cosE = Math.cos(el);
      // yelka usti: o'ngga biroz
      const rx = -Math.cos(S.ph), rz = Math.sin(S.ph);
      const ox = S.px + rx * 0.45, oz = S.pz + rz * 0.45;
      let d = dist;
      // devor orqasiga o'tib ketmasin
      for (let i = 0; i < 6; i++) {
        const cx = ox - Math.sin(S.ph) * cosE * d, cz = oz - Math.cos(S.ph) * cosE * d;
        if (!world.insideSolid(cx, cz)) break; d *= 0.72;
      }
      d = Math.max(d, 0.9);
      const cy = Math.max(0.35, headY + Math.sin(el) * d);
      camera.position.set(ox - Math.sin(S.ph) * cosE * d, cy, oz - Math.cos(S.ph) * cosE * d);
      // nishon — kamera oldida uzoqdagi nuqta
      const cp = Math.cos(pitch + S.recoilPitch);
      camera.lookAt(camera.position.x + Math.sin(S.ph + S.recoilYaw) * cp * 30, camera.position.y + Math.sin(pitch + S.recoilPitch) * 30, camera.position.z + Math.cos(S.ph + S.recoilYaw) * cp * 30);
    }
    fov += input.sprint && Math.hypot(S.vx, S.vz) > 5 ? 4 : 0;
  }
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 5)); camera.updateProjectionMatrix(); }
}

// ── HUD ──────────────────────────────────────────────────────────────────────
let _hudT = 0;
function updateHUD() {
  const hpEl = $('hp'); if (hpEl) { hpEl.textContent = `❤ ${Math.ceil(S.hp)}`; hpEl.style.color = S.hp < 30 ? '#ff6a5a' : '#ffd0c8'; }
  const bar = document.querySelector('#hpbar i'); if (bar) bar.style.width = clamp(S.hp / S.maxHp * 100, 0, 100) + '%';
  const wl = $('wantedlevel'); if (wl) { const lv = wanted?.level ?? 0; wl.textContent = '★'.repeat(lv); }
  const spd = $('speed');
  if (spd) { const v = S.inCar && S.myCar ? Math.hypot(S.myCar.car.vx, S.myCar.car.vz) : 0; S.speedShown = lerp(S.speedShown, v, 0.3); spd.textContent = `${Math.round(S.speedShown * 3.6)} km/h`; }
  const a = S.ammo[S.weaponIdx]; const ammoEl = $('ammo'); if (ammoEl) ammoEl.textContent = a === Infinity ? '∞' : a;
  const wp = $('weapon'); if (wp) wp.textContent = WEAPONS[S.weaponIdx].name;
  const pingEl = $('ping'); if (pingEl) pingEl.textContent = net?.pingMs ? `${net.pingMs} ms` : '';
  if (crosshair) { crosshair.style.display = (!S.inCar && S.weaponIdx > 0 && S.phase === 'play' && S.camMode === 0) || (S.camMode === 1 && !S.inCar) ? '' : 'none'; animateCrosshair(crosshair, bullets?.recoilPitch ?? 0); }
}
function updateSlowHUD() {
  if (!world) return;
  const x = S.px, z = S.pz;
  const hh = Math.floor(world.time), mm = Math.floor((world.time % 1) * 60);
  const clk = $('clock'); if (clk) clk.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  let place = null, sub = '';
  if (Math.hypot(x - MOSQUE.cx, z - MOSQUE.cz) < 130) place = 'Hakim at-Termiziy masjidi';
  const rn = world.nearestRoadName(x, z);
  if (rn) { if (place) sub = rn; else place = rn; }
  const pl = $('place'); if (pl) pl.innerHTML = place ? `${place}${sub ? `<small>${sub}</small>` : '<small>Termiz</small>'}` : 'Termiz';
}

// ── Minimap (aylanuvchi, yuqori = qaragan tomon) ─────────────────────────────
const ZONE_COL = { grass: '#35553a', park: '#3b6a40', water: '#2f6f9a', religious: '#6b6a58', industrial: '#4a4a4c', cemetery: '#3f4a3a', stadium: '#3d6a45' };
function drawMinimap() {
  if (!mini || !world) return;
  const W = miniCanvas.width, H = miniCanvas.height, cx = W / 2, cy = H / 2;
  const inCar = S.inCar && S.myCar;
  const px = inCar ? S.myCar.car.x : S.px, pz = inCar ? S.myCar.car.z : S.pz;
  const h = inCar ? S.myCar.car.h : S.ph;
  const spd = inCar ? Math.hypot(S.myCar.car.vx, S.myCar.car.vz) : 0;
  const range = 200 + Math.min(spd, 30) * 5;               // metr (radius)
  const sc = (W / 2) / range;
  const sn = Math.sin(h), cs = Math.cos(h);
  const X = (x, z) => { const dx = x - px, dz = z - pz; return cx + (-dx * cs + dz * sn) * sc; };
  const Y = (x, z) => { const dx = x - px, dz = z - pz; return cy - (dx * sn + dz * cs) * sc; };
  mini.fillStyle = '#26323a'; mini.fillRect(0, 0, W, H);
  // zonalar
  for (const zn of mapData.zones) {
    const col = ZONE_COL[zn.zone]; if (!col) continue;
    const bb = zn._bb; if (bb[0] > px + range * 1.5 || bb[2] < px - range * 1.5 || bb[1] > pz + range * 1.5 || bb[3] < pz - range * 1.5) continue;
    mini.fillStyle = col; mini.beginPath();
    zn.coords.forEach(([x, z], i) => { if (i) mini.lineTo(X(x, z), Y(x, z)); else mini.moveTo(X(x, z), Y(x, z)); });
    mini.closePath(); mini.fill();
  }
  // masjid maydoni (qum rang)
  // yo'llar
  const cs0 = 200, c0x = Math.floor((px - range) / cs0), c1x = Math.floor((px + range) / cs0), c0z = Math.floor((pz - range) / cs0), c1z = Math.floor((pz + range) / cs0);
  const roadsW = [[], [], []];                       // kichik, o'rta, katta
  const bl = [];
  for (let gx = c0x; gx <= c1x; gx++) for (let gz = c0z; gz <= c1z; gz++) {
    const b = world.buckets.get(gx + ',' + gz); if (!b) continue;
    for (const [r, i] of b.s) { const k = r.r >= 4 ? 2 : r.r >= 2 ? 1 : 0; roadsW[k].push([r, i]); }
    for (const bb of b.b) bl.push(bb);
  }
  mini.lineCap = 'round'; mini.lineJoin = 'round';
  const widths = [Math.max(1.5, 3 * sc * 2.4), Math.max(2.5, 6 * sc * 2), Math.max(4, 9 * sc * 2)];
  const colors = ['#6e747b', '#aeb4ba', '#e8dcb0'];
  for (let k = 0; k < 3; k++) {
    mini.strokeStyle = colors[k]; mini.lineWidth = widths[k]; mini.beginPath();
    for (const [r, i] of roadsW[k]) { const a = r.coords[i], b2 = r.coords[i + 1]; mini.moveTo(X(a[0], a[1]), Y(a[0], a[1])); mini.lineTo(X(b2[0], b2[1]), Y(b2[0], b2[1])); }
    mini.stroke();
  }
  // binolar
  mini.fillStyle = '#4b5660'; mini.strokeStyle = '#38424b'; mini.lineWidth = 1;
  mini.beginPath();
  for (const b of bl) { const p = b._pts; if (!p) continue; p.forEach(([x, z], i) => { if (i) mini.lineTo(X(x, z), Y(x, z)); else mini.moveTo(X(x, z), Y(x, z)); }); mini.closePath(); }
  mini.fill(); mini.stroke();
  // masjid
  { const mx = X(MOSQUE.cx, MOSQUE.cz), my = Y(MOSQUE.cx, MOSQUE.cz);
    mini.save(); mini.translate(mx, my); mini.rotate(-h + Math.atan2(MOSQUE.qx, MOSQUE.qz) * 0 + 0);
    mini.fillStyle = '#d9c38a'; const a = Math.atan2(-MOSQUE.qz, MOSQUE.qx);
    mini.rotate(-(Math.atan2(MOSQUE.qx, MOSQUE.qz) - h) + Math.PI / 2 * 0);
    mini.fillRect(-MOSQUE.W / 2 * sc, -MOSQUE.L / 2 * sc, MOSQUE.W * sc, MOSQUE.L * sc);
    mini.restore(); void a;
    mini.fillStyle = '#25b6c4'; mini.beginPath(); mini.arc(mx, my, Math.max(4, 12 * sc), 0, 7); mini.fill(); }
  // politsiya
  for (const pc of policeCars) { mini.fillStyle = '#3366ff'; mini.beginPath(); mini.arc(X(pc.car.x, pc.car.z), Y(pc.car.x, pc.car.z), 5, 0, 7); mini.fill(); }
  // boshqa o'yinchilar
  for (const [, r] of S.remotes) {
    const p = r.inCar && r.carMesh ? r.carMesh.position : r.mesh.position;
    let rx = X(p.x, p.z), ry = Y(p.x, p.z);
    const dx = rx - cx, dy = ry - cy, d = Math.hypot(dx, dy), lim = W / 2 - 10;
    if (d > lim) { rx = cx + dx / d * lim; ry = cy + dy / d * lim; }
    mini.fillStyle = '#41b0ff'; mini.strokeStyle = '#fff'; mini.lineWidth = 2; mini.beginPath(); mini.arc(rx, ry, 6, 0, 7); mini.fill(); mini.stroke();
  }
  // men (strelka)
  mini.save(); mini.translate(cx, cy);
  mini.fillStyle = '#ffd24a'; mini.strokeStyle = '#1a1200'; mini.lineWidth = 2;
  mini.beginPath(); mini.moveTo(0, -11); mini.lineTo(8, 9); mini.lineTo(0, 4); mini.lineTo(-8, 9); mini.closePath(); mini.fill(); mini.stroke();
  mini.restore();
  // shimol belgisi
  const nEl = $('compass'); if (nEl) { nEl.style.left = (50 + Math.sin(h) * 41) + '%'; nEl.style.top = (50 - Math.cos(h) * 41) + '%'; nEl.style.transform = 'translate(-50%,-50%)'; }
}

function drawBigMap() {
  const cv = $('bigmap'); if (!cv || !mapData) return;
  const c = cv.getContext('2d'), W = cv.width, H = cv.height;
  const px = S.inCar ? S.myCar.car.x : S.px, pz = S.inCar ? S.myCar.car.z : S.pz;
  const range = 1600, sc = (W / 2) / range;
  const X = x => W / 2 - (x - px) * sc, Y = z => H / 2 - (z - pz) * sc;     // shimol tepada, g'arb o'ngda emas: x g'arbga o'sadi → chap-o'ng teskari
  const XX = x => W / 2 + (x - px) * sc * -1;
  void X;
  c.fillStyle = '#26323a'; c.fillRect(0, 0, W, H);
  for (const zn of mapData.zones) { const col = ZONE_COL[zn.zone]; if (!col) continue; const bb = zn._bb; if (bb[0] > px + range * 2 || bb[2] < px - range * 2 || bb[1] > pz + range * 2 || bb[3] < pz - range * 2) continue; c.fillStyle = col; c.beginPath(); zn.coords.forEach(([x, z], i) => { if (i) c.lineTo(XX(x), Y(z)); else c.moveTo(XX(x), Y(z)); }); c.closePath(); c.fill(); }
  for (const r of mapData.roads) {
    if (r.r < 2) continue; const a = r.coords[0]; if (Math.abs(a[0] - px) > range * 1.6 || Math.abs(a[1] - pz) > range * 1.6) continue;
    c.strokeStyle = r.r >= 4 ? '#e8dcb0' : '#aeb4ba'; c.lineWidth = r.r >= 4 ? 3 : 1.6; c.beginPath();
    r.coords.forEach(([x, z], i) => { if (i) c.lineTo(XX(x), Y(z)); else c.moveTo(XX(x), Y(z)); }); c.stroke();
  }
  c.fillStyle = '#25b6c4'; c.beginPath(); c.arc(XX(MOSQUE.cx), Y(MOSQUE.cz), 6, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.font = '12px sans-serif'; c.fillText('Hakim at-Termiziy', XX(MOSQUE.cx) + 9, Y(MOSQUE.cz) + 4);
  for (const [, r] of S.remotes) { const p = r.mesh.position; c.fillStyle = '#41b0ff'; c.beginPath(); c.arc(XX(p.x), Y(p.z), 5, 0, 7); c.fill(); }
  c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(W / 2, H / 2, 6, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.fillText('N ↑', 10, 18);
}

// Boshqa o'yinchilar ismi
const _v = new THREE.Vector3();
function updateTags() {
  for (const [, r] of S.remotes) {
    const p = r.inCar && r.carMesh ? r.carMesh.position : r.mesh.position;
    _v.set(p.x, p.y + (r.inCar ? 2.0 : 2.1), p.z).project(camera);
    const d = camera.position.distanceTo(p);
    const vis = _v.z < 1 && _v.z > -1 && d < 80;
    r.tag.style.display = vis ? '' : 'none';
    if (vis) { r.tag.style.left = ((_v.x + 1) / 2 * innerWidth) + 'px'; r.tag.style.top = ((1 - _v.y) / 2 * innerHeight) + 'px'; r.tag.style.opacity = String(clamp(1.4 - d / 80, 0.3, 1)); }
  }
}

// Remote o'yinchilar animatsiyasi
function animateRemotes(dt) {
  for (const [, r] of S.remotes) {
    if (r.inCar && r.carMesh) animateCar(r.carMesh, dt, r.speed, 0, performance.now() / 1000);
    else animateHuman(r.mesh, dt, r.speed, { run: r.speed > 5.5 });
  }
}

// ── Asosiy sikl ──────────────────────────────────────────────────────────────
let lastT = 0, fpsAcc = 0, fpsN = 0, fpsT = 0, frame = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dtRaw = (t - lastT) / 1000; lastT = t;
  const dt = Math.min(dtRaw, 0.05);
  if (!world || S.phase === 'loading' || S.phase === 'name') {
    if (world && S.phase === 'name') { world.update(dt, { x: SPAWN_X, z: SPAWN_Z }); orbitIdle(t / 1000); renderer.render(scene, camera); }
    return;
  }
  frame++;
  if (S.phase === 'play') {
    if (S.inCar) { input.updateCar(); updateCar(dt); } else { input.updateFoot(); updateFoot(dt); }
    const w = WEAPONS[S.weaponIdx], now = performance.now();
    if (!S.inCar && (now - S.fireT) > w.rate * 1000) {
      if (w.auto && S.fireHeld) { doShoot(); S.fireT = now; }
      else if (S.fireQueued) { doShoot(); S.fireT = now; S.fireQueued = false; }
    }
    if (S.fireQueued && (now - S.fireT) > 400) S.fireQueued = false;
    traffic.update(dt, S.px, S.pz, S.inCar ? S.myCar.car : null);
    wanted?.update(dt);
    bullets?.update(dt, world);
    updatePolice(dt);
    checkBulletHits();
  } else if (S.phase === 'dead') {
    animateHuman(playerMesh, dt, 0);
    bullets?.update(dt, world);
    traffic.update(dt, S.px, S.pz, null);
  }
  world.updateChunks(S.px, S.pz);
  world.update(dt, { x: S.px, z: S.pz });
  setCarNight(world.night);
  updateCamera(dt);
  animateRemotes(dt);
  renderer.render(scene, camera);
  updateHUD(); updateTags();
  _hudT += dt; if (_hudT > 0.05) { drawMinimap(); } if (_hudT > 0.5) { _hudT = 0; updateSlowHUD(); }

  // Adaptiv piksel zichligi
  fpsAcc += dtRaw; fpsN++;
  if (fpsAcc > 2.5) {
    const fps = fpsN / fpsAcc; fpsAcc = fpsN = 0;
    const maxPR = Math.min(window.devicePixelRatio || 1, Q.pixelRatio);
    if (fps < 26 && pixelRatio > 0.7) { pixelRatio = Math.max(0.7, pixelRatio - 0.2); resize(); }
    else if (fps > 54 && pixelRatio < maxPR - 0.05) { pixelRatio = Math.min(maxPR, pixelRatio + 0.1); resize(); }
    window.__fps = Math.round(fps);
  }

  const now2 = performance.now();
  if (net?.connected && now2 - S.lastSend > 1000 / SEND_HZ) {
    const car = S.inCar ? S.myCar.car : null;
    net.sendPos(S.px, S.pz, S.inCar ? S.myCar.car.h : S.face, S.inCar, car?.x, car?.z, car?.h, S.hp, wanted?.level ?? 0);
    S.lastSend = now2;
  }
}

// Ism ekrani orqasida sekin aylanuvchi kamera
function orbitIdle(t) {
  const a = t * 0.08 + 2.2, R = 95;
  camera.position.set(MOSQUE.cx - Math.sin(a) * R, 26, MOSQUE.cz - Math.cos(a) * R);
  camera.lookAt(MOSQUE.cx, 12, MOSQUE.cz);
}

// ── Kirish (input) ───────────────────────────────────────────────────────────
input = new Input((act) => {
  if (S.phase === 'dead') { if (act === 'respawn') respawn(); return; }
  if (S.phase !== 'play') return;
  if (act === 'interact') { S.inCar ? exitCar() : enterCar(); }
  else if (act === 'jump') { if (!S.inCar && S.onGround) { S.vy = 6.4; S.onGround = false; Audio.playJump(); } }
  else if (act === 'attack_start') { S.fireHeld = true; S.fireQueued = true; Audio.resume(); }
  else if (act === 'attack_stop') { S.fireHeld = false; }
  else if (act === 'weapon0') { S.weaponIdx = 0; updateHUD(); }
  else if (act === 'weapon1') { S.weaponIdx = 1; updateHUD(); }
  else if (act === 'weapon2') { S.weaponIdx = 2; updateHUD(); }
  else if (act === 'nextweapon') { S.weaponIdx = (S.weaponIdx + 1) % WEAPONS.length; updateHUD(); }
  else if (act === 'cam') { S.camMode = (S.camMode + 1) % 2; if (playerMesh && !S.inCar) playerMesh.visible = S.camMode === 0; }
  else if (act === 'map') { const mv = $('mapview'); mv?.classList.toggle('on'); if (mv?.classList.contains('on')) drawBigMap(); }
  else if (act === 'horn') { Audio.playPoliceAlert?.(); }
  else if (act === 'chat') { const cb = $('chatbox'); cb?.classList.toggle('on'); if (cb?.classList.contains('on')) $('chatinput')?.focus(); }
});
$('chatinput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) net?.sendChat(v); e.target.value = ''; $('chatbox').classList.remove('on'); e.target.blur(); }
  e.stopPropagation();
});

// ── Ism ekrani ───────────────────────────────────────────────────────────────
if ($('nameinput')) $('nameinput').value = store.get('name', '');
if ($('colorsel')) $('colorsel').value = store.get('color', '0');
if ($('nameinput') && PLAYER_NAMES.length) $('nameinput').placeholder = PLAYER_NAMES[Math.floor(Math.random() * PLAYER_NAMES.length)];
$('startbtn')?.addEventListener('click', () => {
  let name = $('nameinput')?.value?.trim() || PLAYER_NAMES[Math.floor(Math.random() * PLAYER_NAMES.length)];
  const colorIdx = parseInt($('colorsel')?.value || '0');
  store.set('name', name); store.set('color', colorIdx);
  if (document.documentElement.requestFullscreen && isTouch) document.documentElement.requestFullscreen().catch(() => {});
  startGame(name, colorIdx); Audio.resume();
});
$('respawnbtn')?.addEventListener('click', () => respawn());

// ── Yuklash ──────────────────────────────────────────────────────────────────
(async () => {
  try {
    setLoad(0.02, 'Xarita yuklanmoqda…');
    mapData = await (await fetch(MAP_PATH)).json();
    world = new World(renderer, scene, mapData, { quality: qName, time: QS.has('t') ? parseFloat(QS.get('t')) : 10.5, timeSpeed: QS.has('t') ? 0 : 1 / 60 });
    await world.init((p, txt) => setLoad(p * 0.85, txt ? txt + '…' : null));
    traffic = new Traffic(scene, world, mapData, Q);
    bullets = new BulletManager(scene); wanted = new WantedSystem();
    setLoad(0.9, 'Shahar qurilmoqda…');
    await new Promise(r => setTimeout(r, 30));
    world.prewarm(SPAWN_X, SPAWN_Z, (p) => setLoad(0.9 + p * 0.1, 'Shahar qurilmoqda…'));
    world.updateChunks(SPAWN_X, SPAWN_Z);
    S.phase = 'name';
    $('loading').classList.add('hide'); $('namescreen').classList.remove('hide');
    requestAnimationFrame(loop);
    console.log(`Termiz: ${mapData.buildings.length} bino, ${mapData.roads.length} yo'l, sifat=${qName}`);
    window.__dbg = { S, world, traffic, scene, camera, renderer, startGame };
    if (QS.has('autostart')) { startGame(QS.get('name') || 'Test', 0); }
  } catch (err) {
    console.error('Yuklanmadi:', err);
    if ($('loadtxt')) $('loadtxt').textContent = 'Xato: ' + (err.message || err);
  }
})();
