// Mashina fizikasi (arcade): BARCHA mashinalar uchun bir xil. Server (botlar) va klient (o'yinchi) bir xil kodni ishlatadi.
import { ROAD_HALF, WALL } from './track.js';

export const PHYS = {
  VMAX: 64,            // m/s (tezlik chegarasi; haqiqiy yuqori tezlik ~56 m/s = 200 km/h)
  ACC: 22, BRAKE: 40, REV_ACC: 14, REV_MAX: 13,
  ROLL: 1.6, AERO: 0.0004,
  YAW: 1.7, YAW_REF: 30,         // burilish tezligi: YAW/(1+v/YAW_REF)
  STEER_UP: 4.5, STEER_DOWN: 7.5,
  GRIP: 8, GRIP_DRIFT: 1.9, GRIP_OFF: 4.5, GRIP_SLIP: 1.0,
  RADIUS: 1.05, CAR_HALF: 1.05,  // to'qnashuv doiralari: markazdan ±CAR_HALF
  NITRO_USE: 0.28, NITRO_V: 1.2, NITRO_A: 1.55,
  BOOST_V: 1.16, BOOST_A: 1.9,
  OFF_V: 0.6,
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export function newCar(x = 0, z = 0, h = 0) {
  return { x, z, h, vx: 0, vz: 0, steer: 0, nitro: 0.4, nOn: false, drift: false, boost: 0, slip: 0, slipDir: 1, off: false, hit: 0, vf: 0, vl: 0, qi: -1, lat: 0, sprs: 0 };
}

// Eng katta burilish tezligi (rad/s) v tezlikda
export function maxYaw(v) { v = Math.abs(v); return PHYS.YAW / (1 + v / PHYS.YAW_REF) * Math.min(1, v / 6); }

export function stepCar(c, inp, dt, track) {
  const P = PHYS;
  if (c.boost > 0) c.boost = Math.max(0, c.boost - dt);
  if (c.slip > 0) c.slip = Math.max(0, c.slip - dt);
  const slipping = c.slip > 0;
  const stIn = slipping ? 0 : clamp(inp.steer || 0, -1, 1);
  const gas = slipping ? 0 : clamp(inp.gas || 0, 0, 1);
  const brk = slipping ? 0 : clamp(inp.brake || 0, 0, 1);

  // rul silliqlanishi
  const rate = (Math.abs(stIn) > Math.abs(c.steer) && (stIn * c.steer >= 0)) ? P.STEER_UP : P.STEER_DOWN;
  c.steer += clamp(stIn - c.steer, -rate * dt, rate * dt);

  let fx = Math.sin(c.h), fz = Math.cos(c.h);
  let vf = c.vx * fx + c.vz * fz;

  // drift
  c.drift = !slipping && vf > 14 && (!!inp.drift || (brk > 0.3 && Math.abs(c.steer) > 0.5 && vf > 20));

  // burilish (musbat rul = o'ngga = h kamayadi)
  let yaw = c.steer * maxYaw(vf);
  if (vf < -0.5) yaw = -yaw;
  if (c.drift) yaw *= 1.3;
  c.h -= yaw * dt;
  if (slipping) c.h += c.slipDir * 6.0 * dt * Math.min(1, c.slip / 0.5 + 0.3);

  fx = Math.sin(c.h); fz = Math.cos(c.h);
  const rx = -Math.cos(c.h), rz = Math.sin(c.h);
  vf = c.vx * fx + c.vz * fz;
  let vl = c.vx * rx + c.vz * rz;

  // yon tomonga sirpanish
  const grip = slipping ? P.GRIP_SLIP : c.drift ? P.GRIP_DRIFT : c.off ? P.GRIP_OFF : P.GRIP;
  vl *= Math.exp(-grip * dt);

  // bo'ylama kuch
  const nitroOn = !!inp.nitro && c.nitro > 0.01 && !slipping && vf > -2;
  c.nOn = nitroOn;
  const vmax = P.VMAX * (nitroOn ? P.NITRO_V : 1) * (c.boost > 0 ? P.BOOST_V : 1) * (c.off ? P.OFF_V : 1);
  let acc = 0;
  if (gas > 0) {
    acc = P.ACC * gas * (nitroOn ? P.NITRO_A : 1) * (c.boost > 0 ? P.BOOST_A : 1) * (1 - Math.max(0, vf) / vmax);
    if (acc < -26) acc = -26;
  } else if (nitroOn) {
    acc = P.ACC * 0.6 * P.NITRO_A * (1 - Math.max(0, vf) / vmax);
  }
  if (vf > 0.3) acc -= P.ROLL + P.AERO * vf * vf; else if (vf < -0.3) acc += P.ROLL + P.AERO * vf * vf;
  if (brk > 0) {
    if (vf > 0.8) acc -= P.BRAKE * brk;
    else acc -= P.REV_ACC * brk * Math.max(0, 1 + vf / P.REV_MAX);
  }
  if (c.off) acc -= vf * 0.35;
  if (c.drift) acc -= 3;
  const vf0 = vf;
  vf += acc * dt;
  if (gas === 0 && brk === 0 && !nitroOn && Math.abs(vf) < 0.35) vf = 0;
  else if (brk > 0 && vf0 > 0 && vf < 0 && gas === 0) vf = 0;   // tormoz orqaga ketkizmaydi (to'xtagach alohida bosiladi)
  if (vf < -P.REV_MAX) vf = -P.REV_MAX;

  // nitro hisobi
  if (nitroOn) c.nitro = Math.max(0, c.nitro - P.NITRO_USE * dt);
  else c.nitro = Math.min(1, c.nitro + 0.012 * dt);
  if (c.drift && Math.abs(vl) > 2.5) c.nitro = Math.min(1, c.nitro + 0.16 * dt * Math.min(1, Math.abs(vl) / 6));

  c.vx = fx * vf + rx * vl; c.vz = fz * vf + rz * vl;
  c.x += c.vx * dt; c.z += c.vz * dt;

  // yo'l va devor
  const q = track.query(c.x, c.z, c.qi);
  c.qi = q.i; c.lat = q.lat;
  c.off = q.ad > ROAD_HALF + 0.2;
  const lim = WALL - P.RADIUS;
  if (q.ad > lim) {
    const side = Math.sign(q.lat) || 1, nx = q.rx * side, nz = q.rz * side;   // tashqariga normal
    const over = q.ad - lim;
    c.x -= nx * over; c.z -= nz * over;
    const vn = c.vx * nx + c.vz * nz;
    if (vn > 0) {
      const sp = Math.hypot(c.vx, c.vz);
      const ratio = vn / (sp + 0.1);
      c.vx -= 1.2 * vn * nx; c.vz -= 1.2 * vn * nz;
      const keep = 1 - 0.5 * ratio;
      c.vx *= keep; c.vz *= keep;
      c.hit = Math.max(c.hit, vn);
      // burun devor bo'ylab burilsin
      const ta = Math.atan2(q.tx, q.tz) + (vf < 0 ? Math.PI : 0);
      c.h += angDiff(ta, c.h) * Math.min(1, 4 * dt);
    }
  }
  c.vf = vf; c.vl = vl;
  return c;
}

// Ikki mashina to'qnashuvi: faqat `c` ni suradi (`o` ning x,z,h,vx,vz). Zarba kuchini qaytaradi.
export function carPush(c, o, share = 0.5) {
  const H = PHYS.CAR_HALF, R2 = PHYS.RADIUS * 2;
  const cf = [Math.sin(c.h), Math.cos(c.h)], of = [Math.sin(o.h), Math.cos(o.h)];
  let best = null;
  for (const a of [-H, H]) for (const b of [-H, H]) {
    const ax = c.x + cf[0] * a, az = c.z + cf[1] * a, bx = o.x + of[0] * b, bz = o.z + of[1] * b;
    const dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz);
    if (d < R2 && (!best || d < best.d)) best = { d, dx, dz };
  }
  if (!best) return 0;
  const d = best.d || 0.01;
  const nx = best.dx / d, nz = best.dz / d, over = R2 - d;
  c.x += nx * over * share; c.z += nz * over * share;
  const rvx = c.vx - (o.vx || 0), rvz = c.vz - (o.vz || 0);
  const vn = rvx * nx + rvz * nz;
  if (vn < 0) { const j = -(1 + 0.25) * vn * 0.5; c.vx += nx * j; c.vz += nz * j; return -vn; }
  return 0;
}
