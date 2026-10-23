// Hayvonlar (buqa va cho'chqa): maydonda erkin yuradi. Buqa yaqin kelganni suzadi, cho'chqa o'qdan qochadi.
import { BOXES, ARENA, ANIMAL_SPAWNS } from '../client/shared/map.js';
import { ANIMALS, ANIMAL_RESPAWN_MS } from '../client/shared/consts.js';

export const animals = [];

// (x,z) markazli, r radiusli doira yerdagi to'siqqa tegadimi (pastki zinalar 0.35 gacha o'tiladi)
function blocked(x, z, r) {
  if (Math.abs(x) > ARENA.x - 0.6 || Math.abs(z) > ARENA.z - 0.6) return true;
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    if (b.maxy > 0.35 && b.miny < 1.3 && x + r > b.minx && x - r < b.maxx && z + r > b.minz && z - r < b.maxz) return true;
  }
  return false;
}

export function resetAnimals(now) {
  animals.length = 0;
  ANIMAL_SPAWNS.forEach((sp, i) => {
    const def = ANIMALS[sp.t];
    animals.push({
      id: i, t: sp.t, x: sp.x, z: sp.z, yaw: Math.random() * 6.28, hp: def.hp, alive: true, respawnAt: 0,
      st: 0, tx: sp.x, tz: sp.z, idleUntil: now + 500 + Math.random() * 2500, stuck: 0,
      fleeUntil: 0, fx: 0, fz: 0, cd: 0, angry: -1, angryUntil: 0, home: sp,
    });
  });
}

export function animalBox(a) {
  const d = ANIMALS[a.t];
  return { minx: a.x - d.half, miny: 0, minz: a.z - d.half, maxx: a.x + d.half, maxy: d.h, maxz: a.z + d.half };
}

// qaysi tomonga qarasa shunday "yaw": oldinga = (-sin(yaw), -cos(yaw))
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
function turn(a, want, rate, dt) {
  let d = (want - a.yaw) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  const k = Math.max(-rate * dt, Math.min(rate * dt, d));
  a.yaw += k;
  return Math.abs(d - k);
}
function moveForward(a, speed, dt, r) {
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  const nx = a.x + fx * speed * dt, nz = a.z + fz * speed * dt;
  let moved = false;
  if (!blocked(nx, a.z, r)) { a.x = nx; moved = true; }
  if (!blocked(a.x, nz, r)) { a.z = nz; moved = true; }
  if (!moved) a.stuck += dt; else a.stuck = Math.max(0, a.stuck - dt * 2);
  return moved;
}
function pickTarget(a, r) {
  for (let i = 0; i < 12; i++) {
    const ang = Math.random() * Math.PI * 2, dist = 4 + Math.random() * 9;
    const tx = a.x + Math.cos(ang) * dist, tz = a.z + Math.sin(ang) * dist;
    if (!blocked(tx, tz, r + 0.3)) { a.tx = tx; a.tz = tz; return; }
  }
  a.tx = a.home.x; a.tz = a.home.z;
}

// players: massiv; onGore(player, animal, dirx, dirz) buqa suzganda chaqiriladi
export function stepAnimals(dt, now, players, onGore) {
  for (const a of animals) {
    const def = ANIMALS[a.t];
    if (!a.alive) {
      if (now >= a.respawnAt) {
        // qayta paydo bo'lish: o'yinchilardan uzoqroq nuqta
        let best = a.home, bd = -1;
        for (const sp of ANIMAL_SPAWNS) {
          let m = 1e9;
          for (const p of players) if (p && p.alive) m = Math.min(m, Math.hypot(p.x - sp.x, p.z - sp.z));
          m += Math.random() * 3;
          if (m > bd) { bd = m; best = sp; }
        }
        a.x = best.x + (Math.random() - 0.5); a.z = best.z + (Math.random() - 0.5);
        if (blocked(a.x, a.z, def.half)) { a.x = best.x; a.z = best.z; }
        a.hp = def.hp; a.alive = true; a.st = 0; a.angry = -1; a.fleeUntil = 0; a.cd = 0;
      }
      continue;
    }
    if (a.cd > 0) a.cd -= dt;

    if (a.t === 0) {
      // ---- BUQA ----
      let target = null, td = 1e9;
      for (const p of players) {
        if (!p || !p.alive || now < p.invUntil) continue;
        const d = Math.hypot(p.x - a.x, p.z - a.z);
        const inRange = d < def.aggro || (a.angry === p.id && now < a.angryUntil && d < def.aggro * 1.6);
        if (inRange && Math.abs(p.y) < 1.4 && d < td) { td = d; target = p; }
      }
      if (target && a.cd <= 0) {
        a.st = 2;
        const diff = turn(a, yawTo(target.x - a.x, target.z - a.z), 5.5, dt);
        moveForward(a, def.charge * (diff < 1.0 ? 1 : 0.25), dt, def.half);
        if (td < 1.25 + def.half * 0.4) {
          a.cd = def.goreCd; a.st = 3;
          const L = Math.hypot(target.x - a.x, target.z - a.z) || 1;
          onGore(target, a, (target.x - a.x) / L, (target.z - a.z) / L);
        }
        continue;
      }
      if (a.cd > 0) {   // suzgandan keyin biroz orqaga chekinadi
        a.st = 3;
        if (target) { turn(a, yawTo(target.x - a.x, target.z - a.z), 3, dt); moveForward(a, -1.5, dt, def.half); }
        continue;
      }
    } else {
      // ---- CHO'CHQA: o'q tekkandan keyin qochadi ----
      if (now < a.fleeUntil) {
        a.st = 2;
        const diff = turn(a, yawTo(a.x - a.fx, a.z - a.fz) + Math.sin(now / 300) * 0.4, 6, dt);
        const moved = moveForward(a, def.flee * (diff < 1.2 ? 1 : 0.3), dt, def.half);
        if (!moved && a.stuck > 0.3) { a.yaw += 1.5 + Math.random(); a.stuck = 0; }
        continue;
      }
    }

    // ---- Umumiy: kezish ----
    if (a.st === 2 || a.st === 3) { a.st = 0; a.idleUntil = now + 800; }
    if (a.st === 0) {
      if (now >= a.idleUntil) { pickTarget(a, def.half); a.st = 1; a.stuck = 0; }
    } else {
      const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
      if (d < 0.7 || a.stuck > 0.7) { a.st = 0; a.stuck = 0; a.idleUntil = now + 1500 + Math.random() * 3500; }
      else {
        const diff = turn(a, yawTo(dx, dz), 2.6, dt);
        moveForward(a, def.walk * (diff < 0.8 ? 1 : 0.2), dt, def.half);
      }
    }
  }
}

// hayvonga zarar. Qaytaradi: true = o'ldi
export function damageAnimal(a, dmg, fromX, fromZ, byId, now) {
  if (!a.alive) return false;
  a.hp -= dmg;
  if (a.t === 1) { a.fleeUntil = now + 3500; a.fx = fromX; a.fz = fromZ; }
  else { a.angry = byId; a.angryUntil = now + 9000; }
  if (a.hp <= 0) { a.hp = 0; a.alive = false; a.respawnAt = now + ANIMAL_RESPAWN_MS; a.st = 0; return true; }
  return false;
}
