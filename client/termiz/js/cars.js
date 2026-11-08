// Termiz — Mashinalar (Poyga/cars.js dan moslashtirilgan)
import * as THREE from '../../vendor/three.module.min.js';

// ── Fizika konstantalari ─────────────────────────────────────────────────────
export const PHYS = {
  VMAX: 55,      // m/s (~200 km/h)
  ACC: 18,
  BRAKE: 35,
  YAW: 1.4,
  DRAG: 0.9,
  SLIP: 0.012,
  HANDBRAKE_DRAG: 4,
};

// ── Mashina holati (server bilan mos) ────────────────────────────────────────
export function newCar(x, z, h = 0, modelId = 0) {
  return {
    x, z, h,            // pozitsiya, burchak
    vx: 0, vz: 0,       // tezlik
    yawRate: 0,
    onGround: true,
    modelId,
    color: 0xffffff,
    gear: 0,            // 0=park, 1=forward, -1=reverse
  };
}

export function stepCar(c, inp, dt) {
  const { VMAX, ACC, BRAKE, YAW, DRAG, SLIP, HANDBRAKE_DRAG } = PHYS;
  const fwd = { x: Math.sin(c.h), z: Math.cos(c.h) };
  const speed = c.vx * fwd.x + c.vz * fwd.z;
  const signS = speed >= 0 ? 1 : -1;

  // Gas/brake
  let accel = 0;
  if (inp.gas   > 0) accel =  ACC * inp.gas;
  if (inp.brake > 0) {
    if (signS > 0 || speed < 0.5) accel = -BRAKE * inp.brake;
    else accel = -ACC * 0.6; // reverse
  }
  if (!inp.gas && !inp.brake) {
    accel = -DRAG * speed; // engine braking
  }

  const newSpeed = Math.min(VMAX, Math.max(-VMAX * 0.5, speed + accel * dt));

  // Rul
  const grip = Math.min(1, Math.abs(speed) / 4);
  const targetYaw = inp.steer * YAW * grip * signS;
  c.yawRate += (targetYaw - c.yawRate) * Math.min(1, dt * 8);
  if (inp.handbrake) {
    c.yawRate *= 1 + HANDBRAKE_DRAG * dt;
  }
  c.h += c.yawRate * dt;

  // Lateral slip
  const right = { x: Math.cos(c.h), z: -Math.sin(c.h) };
  const latSpeed = c.vx * right.x + c.vz * right.z;
  const slipFact = inp.handbrake ? 0.3 : (1 - SLIP * Math.abs(latSpeed) * dt);

  c.vx = fwd.x * newSpeed + right.x * latSpeed * slipFact;
  c.vz = fwd.z * newSpeed + right.z * latSpeed * slipFact;

  c.x += c.vx * dt;
  c.z += c.vz * dt;
}

// ── Mashina mesh'lari ─────────────────────────────────────────────────────────
const CAR_CACHE = {};

const CAR_SPECS = {
  // Chevrolet
  nexia:    { l: 4.4, w: 1.7, h: 1.45, name: "Nexia",    hue: 0 },
  cobalt:   { l: 4.6, w: 1.75, h: 1.5, name: "Cobalt",   hue: 20 },
  lacetti:  { l: 4.5, w: 1.72, h: 1.47, name: "Lacetti",  hue: 180 },
  malibu:   { l: 4.85, w: 1.85, h: 1.45, name: "Malibu",  hue: 220 },
  damas:    { l: 3.1, w: 1.4,  h: 1.75, name: "Damas",    hue: 60 },
  matiz:    { l: 3.5, w: 1.5,  h: 1.5,  name: "Matiz",    hue: 300 },
  // Global
  sedan:    { l: 4.6, w: 1.8,  h: 1.45, name: "Sedan",    hue: 0 },
  suv:      { l: 4.9, w: 1.95, h: 1.75, name: "SUV",      hue: 30 },
  truck:    { l: 5.5, w: 2.0,  h: 1.9,  name: "Truck",    hue: 200 },
  van:      { l: 4.8, w: 1.9,  h: 1.85, name: "Van",      hue: 120 },
  police:   { l: 4.6, w: 1.8,  h: 1.5,  name: "Politsiya",hue: 220 },
};

export const CAR_IDS = Object.keys(CAR_SPECS);
export const CHEVROLET_IDS = ['nexia','cobalt','lacetti','malibu','damas','matiz'];

function makeCarBody(spec, color) {
  const { l, w, h } = spec;
  const group = new THREE.Group();

  // Asosiy tana
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.6, l), bodyMat);
  body.position.y = h * 0.35; group.add(body);

  // Kabina
  const cabMat = new THREE.MeshLambertMaterial({ color: 0x222233 });
  const cab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, h * 0.42, l * 0.55), bodyMat);
  cab.position.set(0, h * 0.65 + h * 0.42 * 0.5, l * 0.02); group.add(cab);

  // Oynalar
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.5 });
  const wind = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.82, h * 0.35), glassMat);
  wind.position.set(0, h * 0.78, l * 0.55 * 0.49); wind.rotation.y = Math.PI; group.add(wind);
  const rear = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.82, h * 0.3), glassMat);
  rear.position.set(0, h * 0.78, -l * 0.55 * 0.49); group.add(rear);

  // G'ildiraklar
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const rimMat   = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
  const wR = h * 0.18, wW = w * 0.1;
  const positions = [
    [w * 0.5, 0, l * 0.33], [-w * 0.5, 0, l * 0.33],
    [w * 0.5, 0,-l * 0.33], [-w * 0.5, 0,-l * 0.33],
  ];
  for (const [wx, wy, wz] of positions) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wR, wR, wW, 10), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, wR, wz);
    group.add(wheel);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(wR * 0.6, wR * 0.6, wW * 1.05, 6), rimMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(wx, wR, wz);
    group.add(rim);
  }

  // Faralar
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffee });
  for (const sx of [-1, 1]) {
    const hlight = new THREE.Mesh(new THREE.BoxGeometry(w * 0.1, h * 0.07, 0.04), lightMat);
    hlight.position.set(sx * w * 0.38, h * 0.42, l / 2); group.add(hlight);
    const tlight = new THREE.Mesh(new THREE.BoxGeometry(w * 0.1, h * 0.06, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xff3300 }));
    tlight.position.set(sx * w * 0.38, h * 0.42, -l / 2); group.add(tlight);
  }

  // Politsiya — special
  if (spec === CAR_SPECS.police) {
    const lightBar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.12, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x222266 }));
    lightBar.position.set(0, h + 0.06, 0); group.add(lightBar);
    for (const [sx, col] of [[-1, 0xff0000],[1, 0x0000ff]]) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4),
        new THREE.MeshBasicMaterial({ color: col }));
      fl.position.set(sx * w * 0.3, h + 0.1, 0); group.add(fl);
    }
  }

  return group;
}

export function createCar(modelId, colorHex = 0xffffff) {
  const key = `${modelId}_${colorHex}`;
  const spec = CAR_SPECS[modelId] || CAR_SPECS.sedan;
  // Har bir mashina o'z nusxasi bo'lishi kerak (clone emas — to'g'ridan yasaymiz)
  return makeCarBody(spec, colorHex);
}

export function getCarSpec(modelId) {
  return CAR_SPECS[modelId] || CAR_SPECS.sedan;
}

// ── Random traffic car ────────────────────────────────────────────────────────
const TRAFFIC_COLORS = [0xcc3333, 0x3355cc, 0x44aa44, 0xcccccc, 0xaaaaaa, 0xeecc44, 0x222222, 0xffffff];
export function randomTrafficCar(rng) {
  const id = CAR_IDS[Math.floor(rng() * (CAR_IDS.length - 2))]; // -2: police excluded
  const color = TRAFFIC_COLORS[Math.floor(rng() * TRAFFIC_COLORS.length)];
  return { id, color };
}

// ── Mashina rang to'plami ─────────────────────────────────────────────────────
export const PLAYER_COLORS = [
  0xff3300, 0x0055ff, 0x00aa44, 0xffcc00, 0xaa00ff,
  0xff6600, 0x00ccff, 0xffffff, 0x222222,
];
