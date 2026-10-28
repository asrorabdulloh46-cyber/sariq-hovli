// Bot haydovchi: markaz chizig'idan "pure pursuit" bilan yuradi, burilishlarga qarab tezlikni rejalashtiradi.
import { PHYS, maxYaw } from './car.js';
import { ROAD_HALF } from './track.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function newBrain(skill = 0.95, lane = 0) {
  return { skill, lane, laneT: lane, laneUntil: 0, stuck: 0, rev: 0, tt: 0, useNitro: Math.random() < 0.8 };
}

// Burilishda ruxsat etilgan eng katta tezlik (egrilik k, 1/m)
function cornerSpeed(k) {
  k = Math.abs(k);
  if (k < 1e-5) return 999;
  const a = k / PHYS.YAW_REF, b = k, c = -0.84 * PHYS.YAW;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

export function aiInputs(c, brain, track, dt, others = []) {
  brain.tt += dt;
  const q = track.query(c.x, c.z, c.qi);
  const vf = c.vf != null ? c.vf : Math.hypot(c.vx, c.vz);
  // yo'lakni almashtirish (to'siq bo'lsa chetlab o'tish)
  let blocker = null;
  for (const o of others) {
    const dx = o.x - c.x, dz = o.z - c.z, f = dx * Math.sin(c.h) + dz * Math.cos(c.h), r = dx * -Math.cos(c.h) + dz * Math.sin(c.h);
    if (f > 2 && f < 15 + vf * 0.3 && Math.abs(r) < 3.1) { if (!blocker || f < blocker.f) blocker = { f, r }; }
  }
  if (blocker && brain.tt > brain.laneUntil) {
    const side = blocker.r > 0 ? -1 : 1;
    brain.laneT = clamp(q.lat + side * 4.2, -(ROAD_HALF - 2.6), ROAD_HALF - 2.6);
    brain.laneUntil = brain.tt + 1.2;
  } else if (brain.tt > brain.laneUntil + 1.5) brain.laneT = brain.lane;
  brain.curLane = (brain.curLane ?? brain.lane) + clamp(brain.laneT - (brain.curLane ?? brain.lane), -4 * dt, 4 * dt);

  // nishon nuqta
  const Ld = clamp(9 + vf * 0.55, 12, 42);
  const tp = track.at(q.s + Ld, brain.curLane);
  const dx = tp.x - c.x, dz = tp.z - c.z, Ld2 = Math.hypot(dx, dz) || 1;
  const hd = Math.atan2(dx, dz);
  let al = hd - c.h; al = Math.atan2(Math.sin(al), Math.cos(al));
  const curv = 2 * Math.sin(al) / Ld2;
  const need = vf * curv;                       // kerakli burilish tezligi (chapga musbat)
  const mx = Math.max(0.15, maxYaw(Math.max(vf, 6)));
  let steer = clamp(-need / mx, -1, 1);

  // tezlik rejasi
  let vT = 999;
  const N = track.N;
  for (let d = 0; d <= 110; d += track.DS * 2) {
    const i = (q.i + Math.round(d / track.DS)) % N;
    const kk = Math.max(Math.abs(track.CURV[i]), Math.abs(track.CURV[(i + 1) % N]), Math.abs(track.CURV[(i + N - 1) % N]));
    const vc = cornerSpeed(kk);
    vT = Math.min(vT, Math.sqrt(vc * vc + 2 * 26 * d));
  }
  vT = Math.min(vT, PHYS.VMAX * 1.0) * brain.skill;
  if (c.off) vT = Math.min(vT, 24);

  let gas = 0, brake = 0;
  if (vf < vT - 0.5) gas = clamp((vT - vf) / 3, 0.35, 1);
  else if (vf > vT + 2) brake = clamp((vf - vT) / 7, 0.3, 1);
  // sirpanish yoki katta burchak: gazni kamaytiramiz
  if (Math.abs(al) > 0.9 && vf > 12) { gas *= 0.4; }

  // nitro: to'g'ri yo'lda
  const ahead = track.curvAhead(q.i, 80);
  const nitro = brain.useNitro && c.nitro > 0.45 && ahead < 0.006 && brake === 0 && vf > 25 && !c.off;

  // tiqilib qolish
  if (vf < 1.5 && brain.tt > 4) brain.stuck += dt; else brain.stuck = 0;
  if (brain.stuck > 2.2 && brain.rev <= 0) brain.rev = 1.3;
  if (brain.rev > 0) {
    brain.rev -= dt;
    return { steer: -Math.sign(q.lat || 1) * 0.6 * -1, gas: 0, brake: 1, nitro: false, drift: false, stuck: brain.stuck };
  }
  return { steer, gas, brake, nitro, drift: false, stuck: brain.stuck };
}
