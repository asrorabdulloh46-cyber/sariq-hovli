// O'yinchi harakati va to'qnashuv (faqat klientda ishlaydi, server pozitsiyani klientdan oladi)
import { BOXES, ARENA } from './map.js';
import { R, H } from './consts.js';

const EPS = 1e-4;
export const GRAVITY = 18;
export const JUMP_V = 6.6;
const STEP = 0.55;   // zinadan chiqish balandligi

export function collides(x, y, z) {
  const x0 = x - R, x1 = x + R, z0 = z - R, z1 = z + R, y1 = y + H;
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    if (x1 > b.minx + EPS && x0 < b.maxx - EPS && z1 > b.minz + EPS && z0 < b.maxz - EPS &&
        y1 > b.miny + EPS && y < b.maxy - EPS) return true;
  }
  return false;
}

// (x,z) ustunida, [y, y+H] oralig'ida bo'lgan qutilarning eng baland usti
function supportTop(x, y, z) {
  const x0 = x - R, x1 = x + R, z0 = z - R, z1 = z + R, y1 = y + H;
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
  if (!collides(nx, s.y, nz)) { s.x = nx; s.z = nz; return; }
  if (s.onGround) {
    const ty = supportTop(nx, s.y, nz);
    if (ty - s.y <= STEP + EPS && !collides(nx, ty + 0.002, nz)) {
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
  s.vy -= GRAVITY * dt;
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
    if (collides(s.x, ny, s.z)) {
      let low = Infinity;
      const x0 = s.x - R, x1 = s.x + R, z0 = s.z - R, z1 = s.z + R;
      for (let i = 0; i < BOXES.length; i++) {
        const b = BOXES[i];
        if (x1 > b.minx + EPS && x0 < b.maxx - EPS && z1 > b.minz + EPS && z0 < b.maxz - EPS &&
            b.miny >= s.y + H - 0.02 && b.miny < low) low = b.miny;
      }
      ny = low < Infinity ? low - H - 0.002 : s.y;
      s.vy = 0;
    }
  }
  s.y = ny;
}

// s = { x, y, z, vy, onGround }, vx/vz = istalgan tezlik (m/s)
export function stepPlayer(s, vx, vz, jump, dt) {
  const n = Math.max(1, Math.ceil(dt / (1 / 90)));
  const h = dt / n;
  for (let i = 0; i < n; i++) stepOnce(s, vx, vz, i === 0 && jump, h);
}
