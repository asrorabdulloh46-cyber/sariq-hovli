// Termiz GTA — Asosiy klient (v2: masjid spawn, ismlar, sifatli qurol)
import * as THREE from '../vendor/three.module.min.js';
import {
  DEFAULT_SERVER, MAP_PATH, VIEW_DIST, FAR_CLIP, NEAR_CLIP,
  PLAYER_SPEED, PLAYER_SPRINT, PLAYER_H, GRAVITY, INTERP_MS, SEND_HZ,
  SPAWN_X, SPAWN_Z, SPAWN_RADIUS, PLAYER_NAMES,
} from './config.js';
import { World }    from './js/world.js';
import { Input }    from './js/input.js';
import { NPCManager } from './js/npcs.js';
import {
  BulletManager, WantedSystem, PoliceCar, WEAPONS,
  createCrosshair, animateCrosshair,
} from './js/combat.js';
import { Network }  from './js/net.js';
import * as Audio   from './js/audio.js';
import {
  newCar, stepCar, createCar, getCarSpec,
  CAR_IDS, CHEVROLET_IDS, PLAYER_COLORS, randomTrafficCar,
} from './js/cars.js';

// ── Yordamchilar ──────────────────────────────────────────────────────────────
const $   = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const lerpA = (a, b, t) => {
  let d = b - a;
  while (d >  Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (isTouch) document.body.classList.add('touch');

// ── LocalStorage ──────────────────────────────────────────────────────────────
const store = {
  get: (k, d) => { try { const v = localStorage.getItem('tz_' + k); return v == null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('tz_' + k, String(v)); } catch { } },
};

// ── O'yin holati ──────────────────────────────────────────────────────────────
const S = {
  phase: 'name',
  name: '', color: 0,
  // Piyoda
  px: SPAWN_X, py: 0, pz: SPAWN_Z,
  ph: 0, pitch: 0,
  vx: 0, vz: 0, vy: 0,
  onGround: true,
  // Mashina
  inCar: false, myCar: null, carId: null,
  // Qurol
  weaponIdx: 0,
  ammo: [Infinity, 60, 120],
  fireT: 0,
  fireHeld: false,   // avtomat uchun
  // HP
  hp: 100, maxHp: 100,
  // Online
  wsOK: false, myId: -1,
  remotes: new Map(),
  // Kamera
  camMode: 0,
  camPos: new THREE.Vector3(),
  camTarget: new THREE.Vector3(),
  // Vaqt
  lastSend: 0, lastFootstep: 0,
  // Recoil (kameraga ta'sir)
  recoilPitch: 0, recoilYaw: 0,
};

// ── Three.js ──────────────────────────────────────────────────────────────────
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !isTouch,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping      = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, NEAR_CLIP, FAR_CLIP);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

// ── Oyinchi meshlari ──────────────────────────────────────────────────────────
const SHIRT_COLORS = [0x2255aa, 0xaa2222, 0x228833, 0x996622, 0x663388];
const PANT_COLORS  = [0x222244, 0x442222, 0x224422, 0x333333, 0x444422];

function makePlayerMesh(colorIdx) {
  const col = PLAYER_COLORS[colorIdx % PLAYER_COLORS.length];
  const shirt = SHIRT_COLORS[colorIdx % SHIRT_COLORS.length];
  const pant  = PANT_COLORS[colorIdx  % PANT_COLORS.length];
  const g = new THREE.Group();
  // Oyoq
  const pantMat = new THREE.MeshLambertMaterial({ color: pant });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.75, 0.17), pantMat);
  legL.position.set(-0.13, 0.4, 0); g.add(legL);
  const legR = legL.clone(); legR.position.set(0.13, 0.4, 0); g.add(legR);
  // Tana
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.22), shirtMat);
  body.position.y = 1.08; g.add(body);
  // Qo'l
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.14), shirtMat);
  armL.position.set(-0.29, 1.0, 0); g.add(armL);
  const armR = armL.clone(); armR.position.set(0.29, 1.0, 0); g.add(armR);
  // Bosh
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xffbb88 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMat);
  head.position.y = 1.6; g.add(head);
  // Soch
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x1a0a00 });
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.12, 0.31), hairMat);
  hair.position.y = 1.76; g.add(hair);
  // Rang (belt/aksesuar)
  const beltMat = new THREE.MeshLambertMaterial({ color: col });
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.24), beltMat);
  belt.position.y = 0.83; g.add(belt);
  g.castShadow = true;
  return g;
}

// ── Parked mashinalar ─────────────────────────────────────────────────────────
let parkedCars = [];
function spawnParkedCars(map) {
  const rnd = () => Math.random();
  const roads = map.roads.filter(r => r.r >= 2);
  const count = Math.min(25, roads.length);
  for (let i = 0; i < count; i++) {
    const r = roads[Math.floor(rnd() * roads.length)];
    if (!r.coords || r.coords.length < 2) continue;
    const ci = Math.floor(rnd() * (r.coords.length - 1));
    const [x0, z0] = r.coords[ci];
    const [x1, z1] = r.coords[Math.min(ci + 1, r.coords.length - 1)];
    const t = rnd();
    const x = x0 + (x1 - x0) * t + (rnd() - 0.5) * (r.w * 0.4);
    const z = z0 + (z1 - z0) * t + (rnd() - 0.5) * (r.w * 0.4);
    const h = Math.atan2(x1 - x0, z1 - z0) + (rnd() - 0.5) * 0.2;
    const modelId = [...CHEVROLET_IDS, 'sedan', 'suv', 'van'][Math.floor(rnd() * 9)];
    const color = PLAYER_COLORS[Math.floor(rnd() * PLAYER_COLORS.length)];
    const car  = newCar(x, z, h, modelId);
    const mesh = createCar(modelId, color);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = h;
    mesh.castShadow = true;
    scene.add(mesh);
    parkedCars.push({ car, mesh, modelId, color, occupied: false });
  }
}

// ── Global modullar ───────────────────────────────────────────────────────────
let world = null, npcs = null, bullets = null, wanted = null, net = null;
let input = null, crosshair = null;
let policeCars = [];
let mapData = null;
let playerMesh = null;

// ── Minimap ───────────────────────────────────────────────────────────────────
const miniCanvas = $('minimap');
const mini2d = miniCanvas?.getContext('2d');

// ── Respawn global hook ───────────────────────────────────────────────────────
window._gameRespawn = () => respawn();

// ── O'yin boshlash ────────────────────────────────────────────────────────────
function startGame(name, colorIdx) {
  S.name = name; S.color = colorIdx;
  S.phase = 'play';
  $('namescreen').classList.add('hide');
  $('loading').classList.add('hide');
  $('hud').style.display = 'block';
  Audio.resume();
  Audio.startAmbient();

  playerMesh = makePlayerMesh(colorIdx);
  playerMesh.visible = true;
  scene.add(playerMesh);

  // Masjid yaqinida spawn
  const angle = Math.random() * Math.PI * 2;
  const dist  = Math.random() * SPAWN_RADIUS;
  S.px = SPAWN_X + Math.cos(angle) * dist;
  S.pz = SPAWN_Z + Math.sin(angle) * dist;
  S.py = PLAYER_H / 2;

  spawnParkedCars(mapData);

  // Crosshair
  crosshair = createCrosshair();

  // Network
  const serverUrl = store.get('server', DEFAULT_SERVER);
  net = new Network(serverUrl, handleNetMsg);
  net.connect();

  toast(`Xush kelibsiz, ${name}! E — mashinaga kirish. G — qurol. M — xarita.`);
  updateHUD();
}

// ── Network xabarlari ─────────────────────────────────────────────────────────
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
        const mesh = makePlayerMesh(data.color || 0);
        scene.add(mesh);
        S.remotes.set(id, {
          mesh, hp: 100, inCar: false, carMesh: null,
          name: data.name || `Oʻyinchi${id}`,
        });
      }
      const r = S.remotes.get(id);
      const snap = net.getInterpolated(id, INTERP_MS);
      if (snap) {
        if (snap.inCar) {
          r.mesh.visible = false;
          if (!r.carMesh) {
            r.carMesh = createCar('sedan', PLAYER_COLORS[(data.color || 0) % PLAYER_COLORS.length]);
            scene.add(r.carMesh);
          }
          if (r.carMesh) {
            r.carMesh.position.set(snap.cx ?? snap.x, 0, snap.cz ?? snap.z);
            r.carMesh.rotation.y = snap.ch ?? snap.h;
            r.carMesh.visible = true;
          }
        } else {
          r.mesh.position.set(snap.x, 0, snap.z);
          r.mesh.rotation.y = snap.h;
          r.mesh.visible = true;
          if (r.carMesh) r.carMesh.visible = false;
        }
        r.hp = snap.hp ?? r.hp;
      }
    }
    // Ketgan o'yinchilar
    for (const [id, r] of S.remotes) {
      if (!msg.players[id]) {
        scene.remove(r.mesh);
        if (r.carMesh) scene.remove(r.carMesh);
        S.remotes.delete(id);
      }
    }
  } else if (msg.type === 'hit') {
    if (msg.target === S.myId) {
      S.hp = Math.max(0, S.hp - (msg.dmg || 10));
      Audio.playHit();
      // Ekran qizarishi
      flashScreen('#ff000044');
      if (S.hp <= 0) die();
    }
  } else if (msg.type === 'chat') {
    toast(`${msg.name}: ${msg.text}`);
  }
}

// ── Ekran flesh ───────────────────────────────────────────────────────────────
function flashScreen(color) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;inset:0;background:${color};pointer-events:none;z-index:70;animation:fadeout 0.3s forwards`;
  document.head.appendChild(Object.assign(document.createElement('style'), {
    textContent: '@keyframes fadeout{from{opacity:1}to{opacity:0}}'
  }));
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 350);
}

// ── O'lish / Qayta tug'ilish ──────────────────────────────────────────────────
function die() {
  S.phase = 'dead'; S.hp = 0;
  exitCar();
  updateHUD();
  flashScreen('#ff000099');
  window._onDead?.();
}

function respawn() {
  S.hp = S.maxHp; S.phase = 'play';
  const angle = Math.random() * Math.PI * 2;
  S.px = SPAWN_X + Math.cos(angle) * SPAWN_RADIUS * 0.5;
  S.pz = SPAWN_Z + Math.sin(angle) * SPAWN_RADIUS * 0.5;
  S.py = PLAYER_H / 2;
  S.vx = S.vz = S.vy = 0;
  S.recoilPitch = S.recoilYaw = 0;
  if (wanted) { wanted.level = 0; wanted.heatTimer = 0; }
  updateHUD();
  window._onAlive?.();
  toast('Qayta tirilding! Hakim at-Termiziy masjidi yaqinida.');
}

// ── Mashinaga kirish/chiqish ───────────────────────────────────────────────────
function enterCar() {
  let nearest = null, nearD = 5;
  for (const pc of parkedCars) {
    if (pc.occupied) continue;
    const d = Math.hypot(pc.car.x - S.px, pc.car.z - S.pz);
    if (d < nearD) { nearD = d; nearest = pc; }
  }
  if (!nearest) { toast('Yaqin atrofda mashina yo\'q'); return; }
  nearest.occupied = true;
  S.inCar = true; S.myCar = nearest; S.carId = nearest.modelId;
  input.inCar = true;
  playerMesh.visible = false;
  if (crosshair) crosshair.style.display = 'none';
  document.body.classList.add('inCar');
  Audio.playDoor();
  toast(`${getCarSpec(nearest.modelId).name} ga o'tirdingiz — E: chiqish`);
}

function exitCar() {
  if (!S.inCar || !S.myCar) return;
  const h = S.myCar.car.h;
  S.px = S.myCar.car.x + Math.cos(h) * 2.5;
  S.pz = S.myCar.car.z - Math.sin(h) * 2.5;
  S.py = PLAYER_H / 2;
  S.vx = S.vz = S.vy = 0;
  S.myCar.occupied = false; S.myCar = null; S.carId = null;
  S.inCar = false; input.inCar = false;
  playerMesh.visible = true;
  if (crosshair) crosshair.style.display = '';
  document.body.classList.remove('inCar');
  Audio.playDoor();
}

// ── Otish ─────────────────────────────────────────────────────────────────────
function doShoot() {
  const w = WEAPONS[S.weaponIdx];
  if (!w.muzzle) {
    // Mushtlash
    if (npcs) npcs.hitNPC(S.px, S.pz, 2.5);
    if (wanted) wanted.addHeat(0.5);
    return;
  }
  if (S.ammo[S.weaponIdx] !== Infinity && S.ammo[S.weaponIdx] <= 0) {
    toast('O\'q tugadi!'); return;
  }
  if (S.ammo[S.weaponIdx] !== Infinity) S.ammo[S.weaponIdx]--;

  // Effektiv yo'nalish = kamera yo'nalishi + recoil
  const ph = S.ph + S.recoilYaw;
  const pitch = S.pitch + S.recoilPitch;
  const cosPitch = Math.cos(pitch);
  const dirX = Math.sin(ph) * cosPitch;
  const dirZ = Math.cos(ph) * cosPitch;

  const result = bullets?.fire(
    S.px + dirX * 0.3, S.py + 1.3, S.pz + dirZ * 0.3,
    dirX, dirZ, w.dmg, w.range, w.spread
  );

  if (result) {
    S.recoilPitch = Math.min(0.3, S.recoilPitch + w.recoilY);
    S.recoilYaw  += (Math.random() - 0.5) * w.recoilX * 2;
    if (bullets) bullets.applyRecoil(w.recoilY, (Math.random()-0.5)*w.recoilX);
  }
  if (wanted) wanted.addHeat(1);
}

// ── O'q tekshirish ────────────────────────────────────────────────────────────
function checkBulletHits() {
  if (!bullets) return;
  const targets = [...S.remotes.entries()].map(([id, r]) => ({
    id, x: r.mesh.position.x, z: r.mesh.position.z,
  }));
  const hits = bullets.checkHit(targets, 0.65);
  for (const h of hits) {
    net?.sendHit(h.target.id, h.dmg);
    if (wanted) wanted.addHeat(3);
    flashScreen('#ffff0022');
  }
}

// ── Politsiya yangilash ───────────────────────────────────────────────────────
function updatePolice(dt) {
  const level = wanted?.level ?? 0;
  const target = Math.min(level, 3);
  while (policeCars.length < target) {
    const a = Math.random() * Math.PI * 2;
    const d = 85 + Math.random() * 60;
    const sx = (S.inCar ? S.myCar.car.x : S.px) + Math.cos(a) * d;
    const sz = (S.inCar ? S.myCar.car.z : S.pz) + Math.sin(a) * d;
    policeCars.push(new PoliceCar(scene, sx, sz, a + Math.PI));
  }
  while (policeCars.length > target) policeCars.pop()?.dispose();

  const tx = S.inCar ? S.myCar.car.x : S.px;
  const tz = S.inCar ? S.myCar.car.z : S.pz;
  for (const pc of policeCars) {
    pc.update(dt, tx, tz);
    if (Math.hypot(pc.car.x - tx, pc.car.z - tz) < 3.5 && S.phase === 'play') {
      S.hp = Math.max(0, S.hp - 15 * dt);
      if (S.hp <= 0) die();
    }
  }
}

// ── Piyoda harakati ───────────────────────────────────────────────────────────
function updateFoot(dt) {
  const { move, sprint } = input;
  const spd = sprint ? PLAYER_SPRINT : PLAYER_SPEED;
  const sinH = Math.sin(S.ph), cosH = Math.cos(S.ph);
  const wx = sinH * move.fwd + cosH * move.side;
  const wz = cosH * move.fwd - sinH * move.side;
  const len = Math.hypot(wx, wz);
  const nx = len > 0.01 ? wx / len : 0;
  const nz = len > 0.01 ? wz / len : 0;

  S.vx = lerp(S.vx, nx * spd * Math.min(len, 1), Math.min(1, dt * 10));
  S.vz = lerp(S.vz, nz * spd * Math.min(len, 1), Math.min(1, dt * 10));

  if (input.jump && S.onGround) {
    S.vy = 6.5; S.onGround = false; Audio.playJump();
  }
  if (!S.onGround) S.vy -= GRAVITY * dt;

  S.px += S.vx * dt;
  S.py += S.vy * dt;
  S.pz += S.vz * dt;

  const groundY = world?.getGroundY(S.px, S.pz) ?? 0;
  if (S.py <= groundY + PLAYER_H / 2) {
    if (!S.onGround && S.vy < -2) Audio.playLand();
    S.py = groundY + PLAYER_H / 2;
    S.vy = 0; S.onGround = true;
  }

  // Bino to'qnashuvi
  const col = world?.checkBuildingCollision(S.px, S.pz, 0.4);
  if (col?.hit) {
    S.px += col.nx * 0.4; S.pz += col.nz * 0.4;
    S.vx *= 0.3; S.vz *= 0.3;
  }

  // Yurish yo'nalishi
  const mv = Math.hypot(S.vx, S.vz);
  if (mv > 0.3) S.ph = lerpA(S.ph, Math.atan2(S.vx, S.vz), dt * 10);

  // Kamera yaw/pitch (sichqon + joystick)
  const dy = input.consumeYaw(), dp = input.consumePitch();
  S.ph   -= dy;
  S.pitch = clamp(S.pitch - dp, -1.1, 0.4);

  // Recoil qaytishi
  S.recoilPitch = lerp(S.recoilPitch, 0, Math.min(1, dt * 14));
  S.recoilYaw   = lerp(S.recoilYaw,   0, Math.min(1, dt * 11));

  // Mesh
  if (playerMesh) {
    playerMesh.position.set(S.px, S.py - PLAYER_H / 2, S.pz);
    playerMesh.rotation.y = S.ph;
    if (mv > 0.3) {
      const bobY = Math.abs(Math.sin(performance.now() / 180)) * 0.05;
      playerMesh.position.y += bobY;
    }
  }

  // Qadam ovozi
  if (mv > 0.5 && S.onGround) {
    const now = performance.now();
    const interval = input.sprint ? 260 : 400;
    if (now - S.lastFootstep > interval) { Audio.playFootstep(); S.lastFootstep = now; }
  }
}

// ── Mashina harakati ──────────────────────────────────────────────────────────
function updateCar(dt) {
  if (!S.myCar) return;
  const c = S.myCar.car;
  const { car: cinp } = input;

  // Kamera burilishi mashina ichida
  const dy = input.consumeYaw(), dp = input.consumePitch();
  S.ph    -= dy;
  S.pitch  = clamp(S.pitch - dp, -0.6, 0.3);

  stepCar(c, { gas: cinp.gas, brake: cinp.brake, steer: cinp.steer, handbrake: cinp.handbrake }, dt);

  // Bino to'qnashuvi
  const col = world?.checkBuildingCollision(c.x, c.z, (getCarSpec(S.carId).w / 2) + 0.4);
  if (col?.hit) {
    const spd = Math.hypot(c.vx, c.vz);
    if (spd > 3) Audio.playCrash(spd);
    c.x += col.nx * 0.6; c.z += col.nz * 0.6;
    c.vx *= -0.25; c.vz *= -0.25;
    if (spd > 8 && wanted) wanted.addHeat(2);
  }

  // Chegaralar
  if (mapData) {
    const { minX, maxX, minZ, maxZ } = mapData.meta.bounds;
    if (c.x < minX) { c.x = minX; c.vx *= -0.5; }
    if (c.x > maxX) { c.x = maxX; c.vx *= -0.5; }
    if (c.z < minZ) { c.z = minZ; c.vz *= -0.5; }
    if (c.z > maxZ) { c.z = maxZ; c.vz *= -0.5; }
  }

  S.myCar.mesh.position.set(c.x, 0, c.z);
  S.myCar.mesh.rotation.y = c.h;
  S.px = c.x; S.pz = c.z; S.py = PLAYER_H / 2;
}

// ── Kamera ────────────────────────────────────────────────────────────────────
function updateCamera(dt) {
  const px = S.inCar ? S.myCar.car.x : S.px;
  const py = S.py;
  const pz = S.inCar ? S.myCar.car.z : S.pz;
  const ph = S.inCar ? S.myCar.car.h : S.ph;
  const pitch = S.pitch;

  if (S.camMode === 1) {
    // 1st person
    const ey = py + (S.inCar ? 0.6 : 0.6);
    camera.position.set(
      px + Math.sin(ph) * 0.15,
      ey,
      pz + Math.cos(ph) * 0.15,
    );
    const sinPH = Math.sin(ph), cosPH = Math.cos(ph);
    const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
    camera.lookAt(
      px + sinPH * 10 * cosPitch,
      ey + sinPitch * 5,
      pz + cosPH * 10 * cosPitch,
    );
  } else {
    // 3rd person — orqada yuqorida
    const dist   = S.inCar ? 7.5 : 5;
    const height = S.inCar ? 3.2 : 2.5;
    const sinPH = Math.sin(ph), cosPH = Math.cos(ph);
    const tx = px - sinPH * dist;
    const ty = py + height;
    const tz = pz - cosPH * dist;
    S.camPos.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt * 7));
    camera.position.copy(S.camPos);
    S.camTarget.lerp(new THREE.Vector3(px, py + 1, pz), Math.min(1, dt * 9));
    camera.lookAt(S.camTarget);
  }
}

// ── HUD yangilash ─────────────────────────────────────────────────────────────
function updateHUD() {
  const hpEl = $('hp');
  if (hpEl) { hpEl.textContent = `❤ ${Math.ceil(S.hp)}`; hpEl.style.color = S.hp < 30 ? '#ff4444' : '#ff8888'; }
  const wl = $('wantedlevel');
  if (wl) { const lv = wanted?.level ?? 0; wl.textContent = '★'.repeat(lv); wl.style.color = lv >= 3 ? '#ff3333' : '#ffaa00'; }
  const spd = $('speed');
  if (spd) {
    const v = S.inCar && S.myCar ? Math.hypot(S.myCar.car.vx, S.myCar.car.vz) : Math.hypot(S.vx, S.vz);
    spd.textContent = `${Math.round(v * 3.6)} km/h`;
  }
  const ammoEl = $('ammo');
  if (ammoEl) { const a = S.ammo[S.weaponIdx]; ammoEl.textContent = a === Infinity ? '∞' : a; }
  const wpnEl = $('weapon');
  if (wpnEl) wpnEl.textContent = WEAPONS[S.weaponIdx].name;
  const pingEl = $('ping');
  if (pingEl) pingEl.textContent = net?.pingMs ? `${net.pingMs}ms` : '';
  // Crosshair recoil
  if (crosshair) animateCrosshair(crosshair, bullets?.recoilPitch ?? 0);
}

// ── Minimap ───────────────────────────────────────────────────────────────────
function drawMinimap() {
  if (!mini2d || !mapData) return;
  const W = miniCanvas.width, H = miniCanvas.height;
  const { minX, maxX, minZ, maxZ } = mapData.meta.bounds;
  const scale = Math.min(W / (maxX - minX), H / (maxZ - minZ));
  const wx = x => (x - minX) * scale;
  const wz = z => (z - minZ) * scale;

  mini2d.clearRect(0, 0, W, H);
  mini2d.fillStyle = '#1a1a1a'; mini2d.fillRect(0, 0, W, H);

  // Yo'llar
  mini2d.strokeStyle = '#444'; mini2d.lineWidth = 0.8;
  for (const r of mapData.roads) {
    if (r.r < 1 || !r.coords) continue;
    mini2d.beginPath();
    for (let i = 0; i < r.coords.length; i++) {
      const [x, z] = r.coords[i];
      if (i === 0) mini2d.moveTo(wx(x), wz(z)); else mini2d.lineTo(wx(x), wz(z));
    }
    mini2d.stroke();
  }

  // Masjid belgisi
  for (const p of mapData.pois) {
    if (p.poi === 'mosque') {
      mini2d.fillStyle = '#00cc88';
      mini2d.fillRect(wx(p.x) - 2, wz(p.z) - 2, 4, 4);
    }
  }

  // Boshqa o'yinchilar
  for (const [, r] of S.remotes) {
    const mx = r.inCar ? (r.carMesh?.position.x ?? r.mesh.position.x) : r.mesh.position.x;
    const mz = r.inCar ? (r.carMesh?.position.z ?? r.mesh.position.z) : r.mesh.position.z;
    mini2d.fillStyle = '#44aaff';
    mini2d.beginPath(); mini2d.arc(wx(mx), wz(mz), 2.5, 0, Math.PI * 2); mini2d.fill();
  }

  // Politsiya
  mini2d.fillStyle = '#2244ff';
  for (const pc of policeCars) {
    mini2d.beginPath(); mini2d.arc(wx(pc.car.x), wz(pc.car.z), 2, 0, Math.PI * 2); mini2d.fill();
  }

  // Men
  const cx = wx(S.inCar ? S.myCar.car.x : S.px);
  const cz = wz(S.inCar ? S.myCar.car.z : S.pz);
  const h  = S.inCar ? S.myCar.car.h : S.ph;
  mini2d.fillStyle = '#ffcc00';
  mini2d.beginPath(); mini2d.arc(cx, cz, 3.5, 0, Math.PI * 2); mini2d.fill();
  mini2d.strokeStyle = '#ffcc00'; mini2d.lineWidth = 1.5;
  mini2d.beginPath(); mini2d.moveTo(cx, cz);
  mini2d.lineTo(cx + Math.sin(h) * 6, cz + Math.cos(h) * 6); mini2d.stroke();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let _toastT = null;
function toast(msg) {
  const el = $('toast'); if (!el) return;
  el.textContent = msg; el.classList.add('on');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.remove('on'), 3500);
}

// ── Asosiy loop ───────────────────────────────────────────────────────────────
let lastT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min((t - lastT) / 1000, 0.05); lastT = t;
  if (!world || S.phase === 'name') return;

  if (S.phase === 'play') {
    // Harakat
    if (S.inCar) { input.updateCar(); updateCar(dt); }
    else          { input.updateFoot(); updateFoot(dt); }

    // Avtomat otish
    const w = WEAPONS[S.weaponIdx];
    const now = performance.now();
    const canFire = !S.inCar && (now - S.fireT) > w.rate * 1000;
    if (canFire && (w.auto ? S.fireHeld : (S.fireHeld && S.fireT === 0))) {
      doShoot(); S.fireT = now;
    } else if (canFire && !w.auto && input.attack) {
      doShoot(); S.fireT = now; input.attack = false;
    }

    // Modular yangilashlar
    npcs?.update(dt, S.px, S.pz);
    wanted?.update(dt);
    bullets?.update(dt);
    updatePolice(dt);
    checkBulletHits();
  }

  // Kamera + render
  updateCamera(dt);
  world.updateChunks(S.inCar ? S.myCar.car.x : S.px, S.inCar ? S.myCar.car.z : S.pz);
  renderer.render(scene, camera);
  updateHUD();
  drawMinimap();

  // Network yuborish
  const now2 = performance.now();
  if (now2 - S.lastSend > 1000 / SEND_HZ && net?.connected) {
    const car = S.inCar ? S.myCar.car : null;
    net.sendPos(S.px, S.pz, S.ph, S.inCar, car?.x, car?.z, car?.h, S.hp, wanted?.level ?? 0);
    S.lastSend = now2;
  }
}

// ── Input handler ─────────────────────────────────────────────────────────────
input = new Input((act) => {
  if (S.phase === 'dead') {
    if (act === 'respawn') respawn();
    return;
  }
  if (S.phase !== 'play') return;

  if (act === 'interact')   { S.inCar ? exitCar() : enterCar(); }
  else if (act === 'jump')  { if (!S.inCar && S.onGround) { S.vy = 6.5; S.onGround = false; Audio.playJump(); } }
  else if (act === 'attack_tap') { S.fireHeld = true; setTimeout(() => { S.fireHeld = false; }, 120); }
  else if (act === 'attack_start') { S.fireHeld = true; }
  else if (act === 'attack_stop')  { S.fireHeld = false; }
  else if (act === 'weapon0')  { S.weaponIdx = 0; updateHUD(); }
  else if (act === 'weapon1')  { S.weaponIdx = 1; updateHUD(); }
  else if (act === 'weapon2')  { S.weaponIdx = 2; updateHUD(); }
  else if (act === 'nextweapon') { S.weaponIdx = (S.weaponIdx + 1) % WEAPONS.length; updateHUD(); }
  else if (act === 'cam')      { S.camMode = (S.camMode + 1) % 2; }
  else if (act === 'map')      { $('mapview')?.classList.toggle('on'); }
});

// Klaviatura: G — qurol, R — qayta, V — kamera, T — chat
window.addEventListener('keydown', e => {
  if (e.key === 'g' || e.key === 'G') { S.weaponIdx = (S.weaponIdx + 1) % WEAPONS.length; updateHUD(); }
  if (e.key === 'r' || e.key === 'R') { if (S.phase === 'dead') respawn(); }
  if (e.key === 'v' || e.key === 'V') { S.camMode = (S.camMode + 1) % 2; }
  if (e.key === 'm' || e.key === 'M') { $('mapview')?.classList.toggle('on'); }
  // Avtomat uchun sichqon ushlab turish
  if (e.key === 'f' || e.key === 'F') S.fireHeld = true;
});
window.addEventListener('keyup', e => {
  if (e.key === 'f' || e.key === 'F') S.fireHeld = false;
});
// Sichqon chap tugmasi bosib turish = avtomat otish
window.addEventListener('mousedown', e => { if (e.button === 0 && S.phase === 'play' && !S.inCar) S.fireHeld = true; });
window.addEventListener('mouseup',   e => { if (e.button === 0) S.fireHeld = false; });

// ── Ism ekrani ────────────────────────────────────────────────────────────────
const savedName = store.get('name', '');
const savedColor = parseInt(store.get('color', '0'));
if ($('nameinput')) $('nameinput').value = savedName;
if ($('colorsel') && savedColor >= 0) $('colorsel').value = String(savedColor);

// Ismlar ro'yxatini placeholderga qo'shish
if ($('nameinput') && PLAYER_NAMES.length) {
  $('nameinput').placeholder = PLAYER_NAMES[Math.floor(Math.random() * PLAYER_NAMES.length)];
}

$('startbtn')?.addEventListener('click', () => {
  let name = $('nameinput')?.value?.trim();
  if (!name) name = PLAYER_NAMES[Math.floor(Math.random() * PLAYER_NAMES.length)];
  const colorIdx = parseInt($('colorsel')?.value || '0');
  store.set('name', name); store.set('color', colorIdx);
  startGame(name, colorIdx);
  Audio.resume();
});

// Respawn tugmasi (HTML)
$('respawnbtn')?.addEventListener('click', () => respawn());

// ── Xarita yuklanishi ─────────────────────────────────────────────────────────
fetch(MAP_PATH)
  .then(r => r.json())
  .then(data => {
    mapData = data;
    $('loading').classList.add('hide');
    $('namescreen').classList.remove('hide');

    world   = new World(renderer, scene, mapData);
    npcs    = new NPCManager(scene, mapData);
    bullets = new BulletManager(scene);
    wanted  = new WantedSystem();

    requestAnimationFrame(loop);
    console.log(`Termiz xaritasi yuklandi: ${data.buildings.length} bino, ${data.roads.length} yo'l`);
  })
  .catch(err => {
    console.error('Xarita yuklanmadi:', err);
    if ($('loadtxt')) $('loadtxt').textContent = 'Xarita yuklanmadi: ' + err.message;
  });
