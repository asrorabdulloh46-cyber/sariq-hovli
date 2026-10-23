// O'yinchi harakati va to'qnashuv (faqat klientda ishlaydi, server pozitsiyani klientdan oladi)
import { BOXES, ARENA } from './map.js';
import { R, H, HC } from './consts.js';

const EPS = 1e-4;
export const GRAVITY = 18;
export const JUMP_V = 6.6;
const STEP = 0.55;   // zinadan chiqish balandligi

export function collides(x, y, z, h = H) {
  const x0 = x - R, x1 = x + R, z0 = z - R, z1 = z + R, y1 = y + h;
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    if (x1 > b.minx + EPS && x0 < b.maxx - EPS && z1 > b.minz + EPS && z0 < b.maxz - EPS &&
        y1 > b.miny + EPS && y < b.maxy - EPS) return true;
  }
  return false;
}

// (x,z) ustunida, [y, y+H] oralig'ida bo'lgan qutilarning eng baland usti
function supportTop(x, y, z, h = H) {
  const x0 = x - R, x1 = x + R, z0 = z - R, z1 = z + R, y1 = y + h;
  let top = y;
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    if (x1 > b.minx + EPS && x0 < b.maxx - EPS && z1 > b.minz + EPS && z0 < b.maxz - EPS &&
        y1 > b.miny + EPS && y < b.maxy - EPS) {
      if (b.maxy > top) top = b.maxy;
    }
  }
  return top;
}

function moveAxis(s, dx, dz) {
  const nx = s.x + dx, nz = s.z + dz;
  const h = s.h || H;
  if (!collides(nx, s.y, nz, h)) { s.x = nx; s.z = nz; return; }
  if (s.onGround) {
    const ty = supportTop(nx, s.y, nz, h);
    if (ty - s.y <= STEP + EPS && !collides(nx, ty + 0.002, nz, h)) {
      s.x = nx; s.z = nz; s.y = ty + 0.002;
    }
  }
}

function stepOnce(s, vx, vz, jump, dt) {
  moveAxis(s, vx * dt, 0);
  moveAxis(s, 0, vz * dt);
  s.x = Math.max(-ARENA.x, Math.min(ARENA.x, s.x));
  s.z = Math.max(-ARENA.z, Math.min(ARENA.z, s.z));

  if (jump && s.onGround) { s.vy = JUMP_V; s.onGround = false; }
  s.vy -= GRAVITY * (s.gs || 1) * dt;
  if (s.vy < -40) s.vy = -40;
  let ny = s.y + s.vy * dt;
  s.onGround = false;

  if (s.vy <= 0) {
    let land = -Infinity;
    if (ny <= 0) land = 0;
    const x0 = s.x - R, x1 = s.x + R, z0 = s.z - R, z1 = s.z + R;
    for (let i = 0; i < BOXES.length; i++) {
      const b = BOXES[i];
      if (x1 > b.minx + EPS && x0 < b.maxx - EPS && z1 > b.minz + EPS && z0 < b.maxz - EPS) {
        if (b.maxy > ny && b.maxy <= s.y + 0.01 && b.maxy > land) land = b.maxy;
      }
    }
    if (land > -Infinity) { ny = land; s.vy = 0; s.onGround = true; }
  } else {
    if (collides(s.x, ny, s.z, s.h || H)) {
      let low = Infinity;
      const x0 = s.x - R, x1 = s.x + R, z0 = s.z - R, z1 = s.z + R;
      for (let i = 0; i < BOXES.length; i++) {
        const b = BOXES[i];
        if (x1 > b.minx + EPS && x0 < b.maxx - EPS && z1 > b.minz + EPS && z0 < b.maxz - EPS &&
            b.miny >= s.y + (s.h || H) - 0.02 && b.miny < low) low = b.miny;
      }
      ny = low < Infinity ? low - (s.h || H) - 0.002 : s.y;
      s.vy = 0;
    }
  }
  s.y = ny;
}

// s = { x, y, z, vy, onGround, h, cr }, vx/vz = istalgan tezlik (m/s), crouch = o'tirish
export function stepPlayer(s, vx, vz, jump, dt, crouch = false) {
  if (s.h === undefined) s.h = H;
  if (crouch) { s.h = HC; s.cr = 1; }
  else if (s.cr) {
    // tik turish: tepada to'siq bo'lmasa
    if (!collides(s.x, s.y, s.z, H)) { s.h = H; s.cr = 0; }
  }
  const n = Math.max(1, Math.ceil(dt / (1 / 90)));
  const h = dt / n;
  for (let i = 0; i < n; i++) stepOnce(s, vx, vz, i === 0 && jump, h);
}

// ---- Granata fizikasi: g = { x, y, z, vx, vy, vz } (metr, m/s). Qutilardan sakraydi ----
const GR = 0.11;
function gHit(x, y, z) {
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    if (x + GR > b.minx && x - GR < b.maxx && z + GR > b.minz && z - GR < b.maxz && y + GR > b.miny && y - GR < b.maxy) return true;
  }
  return false;
}
export function stepGrenade(g, dt) {
  const n = Math.max(1, Math.ceil(dt / (1 / 90))), h = dt / n;
  for (let i = 0; i < n; i++) {
    g.vy -= GRAVITY * h;
    let nx = g.x + g.vx * h;
    if (gHit(nx, g.y, g.z)) { g.vx *= -0.45; g.vz *= 0.8; nx = g.x; }
    g.x = nx;
    let nz = g.z + g.vz * h;
    if (gHit(g.x, g.y, nz)) { g.vz *= -0.45; g.vx *= 0.8; nz = g.z; }
    g.z = nz;
    let ny = g.y + g.vy * h;
    if (gHit(g.x, ny, g.z)) {
      g.vy *= -0.4; g.vx *= 0.86; g.vz *= 0.86;
      if (Math.abs(g.vy) < 0.8) g.vy = 0;
      ny = g.y;
    }
    if (ny < GR) { ny = GR; g.vy = Math.abs(g.vy) > 1 ? -g.vy * 0.4 : 0; g.vx *= 0.82; g.vz *= 0.82; }
    g.y = ny;
    if (Math.abs(g.x) > 90 || Math.abs(g.z) > 90) { g.vx = g.vz = 0; }
  }
}
