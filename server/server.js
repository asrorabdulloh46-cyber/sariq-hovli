// "Sariq Hovli" o'yin serveri: statik fayllar + WebSocket (/ws)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import {
  NAMES, WEAPONS, GRENADES, GREN_MAX, FRAG_RADIUS, FRAG_DMG, FLASH_RADIUS, SMOKE_SEC,
  R, H, EYE, HC, EYE_C, MAX_HP, RESPAWN_MS, SPAWN_INV_MS, ROUND_SEC, END_SEC, KILL_LIMIT, HEAD_MULT,
  PICKUP_HEAL, PICKUP_RESPAWN_MS, START_MONEY, KILL_MONEY, HEAD_BONUS, REVENGE_BONUS, MONEY_CAP,
  ARMOR_PRICE, HELMET_PRICE, WIN_BONUS, ARMOR_ABSORB, HELMET_HEAD, MODES, ANIMALS, W_SNIPER, W_PISTOL, W_RIFLE,
} from '../client/shared/consts.js';
import {
  SPAWNS, PICKUPS, ARENA, MAP, MAP_COUNT, loadMap, raycastWorld, raycastWorldHit, rayBox,
} from '../client/shared/map.js';
import { stepGrenade } from '../client/shared/physics.js';
import { animals, resetAnimals, stepAnimals, damageAnimal, animalBox } from './animals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(__dirname, '..', 'client');
const PORT = parseInt(process.env.PORT || '3000', 10);
// (sinov uchun o'zgartirsa bo'ladi)
const ROUND_S = parseInt(process.env.ROUND_SEC || String(ROUND_SEC), 10);
const END_S = parseInt(process.env.END_SEC || String(END_SEC), 10);
const KILL_LIM = parseInt(process.env.KILL_LIMIT || String(KILL_LIMIT), 10);

// ---------------- Statik fayl serveri ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};
const httpServer = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (url === '/') url = '/index.html';
  const file = path.normalize(path.join(CLIENT_DIR, url));
  if (!file.startsWith(CLIENT_DIR)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

// ---------------- O'yin holati ----------------
const NW = WEAPONS.length;
const players = new Array(NAMES.length).fill(null);          // id = NAMES indeksi
const newStat = () => ({ k: 0, d: 0, hs: 0, dmg: 0, an: 0, gk: 0, smax: 0 });
const stats = NAMES.map(newStat);
const tot = NAMES.map(() => ({ w: 0, k: 0, d: 0 }));         // server ishlagan vaqt davomida jami
let pickups = [];
let grenades = [];
let gid = 1;
let phase = 'play';
let roundEnd = Date.now() + ROUND_S * 1000;
let endAt = 0;
let winners = [];
let medals = [];
let mode = 0, wantMode = 0, wantMap = -1, nextMap = 0;

const now = () => Date.now();
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function spawnAnimals() { resetAnimals(now()); if (process.env.NO_ANIMALS) animals.length = 0; }
function initMap(id) {
  loadMap(id);
  pickups = PICKUPS.map(() => ({ at: 0 }));
  spawnAnimals();
  grenades = [];
}
initMap(process.env.START_MAP ? parseInt(process.env.START_MAP, 10) : 0);
if (process.env.START_MODE) { mode = wantMode = parseInt(process.env.START_MODE, 10); }

function send(p, obj) {
  if (p && p.ws && p.ws.readyState === 1) { try { p.ws.send(JSON.stringify(obj)); } catch { /* ignore */ } }
}
function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const p of players) if (p && p.ws.readyState === 1) { try { p.ws.send(s); } catch { /* ignore */ } }
}
const joined = () => players.filter(Boolean);

function bestSpawn(selfId) {
  let best = SPAWNS[0], bestD = -1;
  for (const sp of SPAWNS) {
    let min = 1e9;
    for (const p of players) {
      if (!p || p.id === selfId || !p.alive) continue;
      const d = Math.hypot(p.x - sp.x, p.y - sp.y, p.z - sp.z) + Math.abs(p.y - sp.y) * 2;
      if (d < min) min = d;
    }
    for (const a of animals) {   // buqa yonida tug'ilmaslik uchun (u 1.8 marta yaqin deb hisoblanadi)
      if (!a.alive || a.t !== 0) continue;
      min = Math.min(min, Math.hypot(a.x - sp.x, a.z - sp.z) / 1.8);
    }
    min += Math.random() * 4;   // bir xil joyda tug'ilavermasin
    if (min > bestD) { bestD = min; best = sp; }
  }
  return best;
}

// Lag kompensatsiya: har bir o'yinchining so'nggi ~1.5 soniyalik joylashuv tarixi
const HIST_MS = 1500;
function pushHist(p) {
  const t = now();
  p.hist.push({ t, x: p.x, y: p.y, z: p.z, cr: p.cr });
  while (p.hist.length > 2 && t - p.hist[0].t > HIST_MS) p.hist.shift();
}
function posAt(p, t) {
  const h = p.hist;
  if (!h.length || t >= h[h.length - 1].t) return { x: p.x, y: p.y, z: p.z, cr: p.cr };
  if (t <= h[0].t) return h[0];
  for (let i = h.length - 1; i > 0; i--) {
    if (h[i - 1].t <= t) {
      const a = h[i - 1], b = h[i], k = (t - a.t) / Math.max(1, b.t - a.t);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, cr: b.cr };
    }
  }
  return h[0];
}

// ---------- Qurol-yarog' ----------
function startOwn() {
  const own = WEAPONS.map(() => false);
  if (mode === 1) own[W_SNIPER] = true;
  else if (mode === 2) own[W_PISTOL] = true;
  else WEAPONS.forEach((w, i) => { if (w.start) own[i] = true; });
  return own;
}
function startWeapon() { return mode === 1 ? W_SNIPER : mode === 2 ? W_PISTOL : W_RIFLE; }
const shopOpen = () => mode === 0 || mode === 4;
function fullAmmo() { return WEAPONS.map((w) => w.mag); }

function resetLoadout(p) {
  p.own = startOwn(); p.w = startWeapon(); p.ammo = fullAmmo();
  p.armor = 0; p.helmet = 0; p.gren = [0, 0, 0]; p.reloadEnd = 0; p.nextFire = 0;
}
function sendSt(p) { send(p, { t: 'st', money: p.money, armor: Math.round(p.armor), helmet: p.helmet, gren: p.gren, own: p.own.map((v) => (v ? 1 : 0)), shop: shopOpen() ? 1 : 0 }); }
function sendAmmo(p) { send(p, { t: 'a', w: p.w, a: p.ammo, r: p.reloadEnd > now() ? 1 : 0, own: p.own.map((v) => (v ? 1 : 0)) }); }
function addMoney(p, n, why) {
  const before = p.money;
  p.money = clamp(p.money + n, 0, MONEY_CAP);
  if (p.money !== before) { send(p, { t: 'money', d: p.money - before, why }); sendSt(p); }
}

function respawn(p, first) {
  const sp = bestSpawn(p.id);
  p.x = sp.x; p.y = sp.y; p.z = sp.z; p.yaw = sp.yaw; p.pitch = 0;
  p.hp = MAX_HP; p.alive = true; p.cr = 0; p.rs = (p.rs || 0) + 1;
  resetLoadout(p);
  p.invUntil = now() + SPAWN_INV_MS;
  p.hist = []; pushHist(p); p.vh = 0; p.vv = 0; p.lastIn = 0;
  send(p, { t: 'respawn', x: sp.x, y: sp.y, z: sp.z, yaw: sp.yaw, rs: p.rs, first: !!first, m: MAP.id, md: mode });
  sendAmmo(p); sendSt(p);
}

function startReload(p) {
  const wd = WEAPONS[p.w];
  if (p.reloadEnd > now() || p.ammo[p.w] >= wd.mag) return;
  p.reloadEnd = now() + wd.reload * 1000;
  p.reloadW = p.w;
  sendAmmo(p);
}

// ---------- Zarar, o'lim ----------
// atk: o'ldiruvchi o'yinchi yoki null (hayvon/o'zi). info: { w, head, gren, an }
function applyDamage(v, dmg, head, atk, info) {
  const t = now();
  if (!v.alive || t < v.invUntil) return { dealt: 0, kill: false };
  if (head && v.helmet) dmg *= HELMET_HEAD;
  if (mode === 3 && atk && atk !== v) dmg = 200;
  let hpDmg = dmg;
  if (v.armor > 0) {
    const absorbed = Math.min(v.armor, dmg * ARMOR_ABSORB);
    v.armor -= absorbed; hpDmg = dmg - absorbed;
    if (v.armor <= 0) { v.armor = 0; v.helmet = 0; }
  }
  hpDmg = Math.round(hpDmg);
  v.hp -= hpDmg;
  const kill = v.hp <= 0;
  if (atk && atk !== v) stats[atk.id].dmg += hpDmg;
  send(v, { t: 'dmg', fx: r2(info.fx ?? (atk ? atk.x : v.x)), fz: r2(info.fz ?? (atk ? atk.z : v.z)), d: hpDmg, hp: Math.max(0, v.hp), ar: Math.round(v.armor) });
  if (kill) killPlayer(v, atk, info, head);
  return { dealt: hpDmg, kill };
}

function killPlayer(v, atk, info, head) {
  const t = now();
  v.hp = 0; v.alive = false; v.respawnAt = t + RESPAWN_MS;
  stats[v.id].d++; tot[v.id].d++;
  v.streak = 0;
  let ks = 0, rv = 0;
  const self = atk === v;
  if (atk && !self) {
    const s = stats[atk.id];
    s.k++; tot[atk.id].k++;
    if (head) s.hs++;
    if (info.gren) s.gk++;
    atk.streak = (atk.streak || 0) + 1; ks = atk.streak;
    if (atk.streak > s.smax) s.smax = atk.streak;
    if (atk.nemesis === v.id) { rv = 1; atk.nemesis = -1; }
    addMoney(atk, KILL_MONEY + (head ? HEAD_BONUS : 0) + (rv ? REVENGE_BONUS : 0), 'kill');
    v.nemesis = atk.id;
  } else v.nemesis = -1;
  broadcast({ t: 'kill', k: atk && !self ? atk.id : -1, v: v.id, w: info.w ?? -1, h: head ? 1 : 0, g: info.gren ? 1 : 0,
    an: info.an ?? -1, ks, rv, me: self ? 1 : 0 });
  if (atk && !self && stats[atk.id].k >= KILL_LIM && phase === 'play') endRound();
}

function animalKilledBy(p, a, info) {
  const def = ANIMALS[a.t];
  stats[p.id].an++;
  p.hp = Math.min(MAX_HP, p.hp + def.rewardHp);
  send(p, { t: 'heal', hp: p.hp, an: a.t });
  addMoney(p, def.rewardMoney, 'an');
  broadcast({ t: 'akill', k: p.id, a: a.t, w: info.w ?? -1, g: info.gren ? 1 : 0, x: r2(a.x), z: r2(a.z) });
}

// ---------- Otish ----------
function handleShoot(p, msg) {
  const t = now();
  if (!p.alive || phase !== 'play') return;
  const wd = WEAPONS[p.w];
  if (!p.own[p.w]) return;
  if (p.reloadEnd > t) return;
  if (p.ammo[p.w] <= 0) { startReload(p); return; }
  if (t < p.nextFire) return;
  p.nextFire = t + wd.interval * 1000 - 25;
  p.ammo[p.w]--;
  p.invUntil = Math.min(p.invUntil, t);   // otganda spawn himoyasi tugaydi

  const eye = p.cr ? EYE_C : EYE;
  let ox = p.x, oy = p.y + eye, oz = p.z;
  if (isNum(msg.ox) && isNum(msg.oy) && isNum(msg.oz) &&
      Math.hypot(msg.ox - p.x, msg.oy - (p.y + eye), msg.oz - p.z) < 2.2) { ox = msg.ox; oy = msg.oy; oz = msg.oz; }

  const baseYaw = isNum(msg.yaw) ? msg.yaw : p.yaw;
  const basePitch = isNum(msg.pitch) ? clamp(msg.pitch, -1.5, 1.5) : p.pitch;
  // aniqlik: mo'ljal olganda yaxshi, yurganda/sakraganda yomon, o'tirganda yaxshi
  const ads = !!msg.z;
  let sp = wd.hipSpread ? (ads ? wd.spread : wd.hipSpread) : wd.spread * (ads ? 0.55 : 1);
  if (!(wd.hipSpread && ads)) {
    sp *= 1 + Math.min(1, (p.vh || 0) / 5.4) * 0.9;
    if ((p.vv || 0) > 1.3) sp *= 2.4;
    if (p.cr) sp *= 0.65;
  }

  const rewind = Math.min(350, (p.rtt || 0) + 60);   // otuvchi ekranda ko'rgan paytga qaytamiz
  const ends = [];
  const acc = new Map();   // nishon -> { v|a, dmg, head }
  let anyHit = false;
  for (let k = 0; k < wd.pellets; k++) {
    const ang = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * sp;
    const yaw = baseYaw + rad * Math.cos(ang), pitch = basePitch + rad * Math.sin(ang);
    const cp = Math.cos(pitch);
    const dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;

    const wh = raycastWorldHit(ox, oy, oz, dx, dy, dz, wd.range);
    const tFirst = wh.t;
    let tLimit = tFirst, tExit = 0, penMul = 1;
    // devordan o'tish (yupqa devor va polni o'qlar teshib o'tadi, zarar kamayadi)
    if (wd.pen > 0 && tFirst < wd.range && wh.thick <= 0.3 + wd.pen * 0.65) {
      tExit = tFirst + wh.thick + 0.02;
      const w2 = raycastWorldHit(ox + dx * tExit, oy + dy * tExit, oz + dz * tExit, dx, dy, dz, wd.range - tExit);
      tLimit = tExit + w2.t; penMul = wd.pen;
    }
    let bestT = Infinity, cand = null;
    const consider = (bt, mult, c) => {
      if (bt === Infinity || bt >= bestT) return;
      if (bt < tFirst || (penMul < 1 && bt > tExit && bt < tLimit)) { bestT = bt; cand = { ...c, mult: bt < tFirst ? 1 : penMul }; }
    };
    for (const v of players) {
      if (!v || v.id === p.id || !v.alive) continue;
      const vp = posAt(v, t - rewind);
      const vh = vp.cr ? HC : H;
      const bt = rayBox(ox, oy, oz, dx, dy, dz, { minx: vp.x - 0.34, miny: vp.y, minz: vp.z - 0.34, maxx: vp.x + 0.34, maxy: vp.y + vh, maxz: vp.z + 0.34 });
      consider(bt, 1, { v, vy: vp.y, vh });
    }
    for (const a of animals) {
      if (!a.alive) continue;
      consider(rayBox(ox, oy, oz, dx, dy, dz, animalBox(a)), 1, { a });
    }
    const endT = cand ? bestT : (penMul < 1 ? tLimit : tFirst);
    ends.push([r2(ox + dx * endT), r2(oy + dy * endT), r2(oz + dz * endT)]);
    if (cand) {
      anyHit = true;
      const ey = oy + dy * bestT;
      const key = cand.v ? 'p' + cand.v.id : 'a' + cand.a.id;
      let e = acc.get(key); if (!e) { e = { v: cand.v, a: cand.a, dmg: 0, head: false }; acc.set(key, e); }
      let head = false;
      if (cand.v) head = ey >= cand.vy + cand.vh * 0.79;
      e.dmg += wd.dmg * (head ? HEAD_MULT : 1) * cand.mult;
      if (head) e.head = true;
    }
  }
  broadcast({ t: 'shot', id: p.id, w: p.w, o: [r2(ox), r2(oy), r2(oz)], e: ends[0], ps: wd.pellets > 1 ? ends : undefined, hit: anyHit ? 1 : 0 });

  let hmHead = false, hmKill = false, hmDmg = 0, hmAny = false;
  for (const e of acc.values()) {
    if (e.v) {
      const r = applyDamage(e.v, e.dmg, e.head, p, { w: p.w, head: e.head });
      if (r.dealt > 0 || r.kill) { hmAny = true; hmDmg += r.dealt; if (e.head) hmHead = true; if (r.kill) hmKill = true; }
    } else {
      hmAny = true; hmDmg += e.dmg;
      if (damageAnimal(e.a, e.dmg, p.x, p.z, p.id, t)) { hmKill = true; animalKilledBy(p, e.a, { w: p.w }); }
    }
  }
  if (hmAny) send(p, { t: 'hm', h: hmHead ? 1 : 0, k: hmKill ? 1 : 0, d: Math.round(hmDmg) });
  if (p.ammo[p.w] <= 0) startReload(p); else sendAmmo(p);
}

// ---------- Granatalar ----------
function throwGrenade(p, msg) {
  const t = now();
  const i = msg.i | 0;
  if (!p.alive || phase !== 'play' || i < 0 || i >= GRENADES.length || p.gren[i] <= 0) return;
  if (t < (p.nextGren || 0)) return;
  p.nextGren = t + 700;
  p.gren[i]--;
  p.invUntil = Math.min(p.invUntil, t);
  const eye = p.cr ? EYE_C : EYE;
  const yaw = isNum(msg.yaw) ? msg.yaw : p.yaw;
  const pitch = isNum(msg.pitch) ? clamp(msg.pitch, -1.4, 1.4) : p.pitch;
  const cp = Math.cos(pitch);
  const dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
  const sp = 15;
  grenades.push({
    id: gid++, type: i, owner: p.id, x: p.x + dx * 0.5, y: p.y + eye - 0.1 + dy * 0.4, z: p.z + dz * 0.5,
    vx: dx * sp, vy: dy * sp + 3.2, vz: dz * sp, boom: t + GRENADES[i].fuse * 1000,
  });
  sendSt(p);
}

function los(x0, y0, z0, x1, y1, z1) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, d = Math.hypot(dx, dy, dz);
  if (d < 0.01) return true;
  return raycastWorld(x0, y0, z0, dx / d, dy / d, dz / d, d) >= d - 0.4;
}

function explode(g) {
  const t = now();
  const owner = players[g.owner];
  broadcast({ t: 'gx', type: g.type, x: r2(g.x), y: r2(g.y), z: r2(g.z) });
  if (g.type === 0) {
    for (const v of players) {
      if (!v || !v.alive) continue;
      const cy = v.y + (v.cr ? 0.6 : 0.9);
      const d = Math.hypot(v.x - g.x, cy - g.y, v.z - g.z);
      if (d > FRAG_RADIUS || !los(g.x, g.y + 0.25, g.z, v.x, cy, v.z)) continue;
      let dmg = Math.max(8, FRAG_DMG * (1 - d / FRAG_RADIUS));
      const self = owner && v.id === owner.id;
      if (self) dmg *= 0.6;
      applyDamage(v, dmg, false, owner || null, { w: -1, gren: true, fx: g.x, fz: g.z });
    }
    for (const a of animals) {
      if (!a.alive) continue;
      const d = Math.hypot(a.x - g.x, 0.5 - g.y, a.z - g.z);
      if (d > FRAG_RADIUS || !los(g.x, g.y + 0.25, g.z, a.x, 0.6, a.z)) continue;
      if (damageAnimal(a, Math.max(15, FRAG_DMG * 1.3 * (1 - d / FRAG_RADIUS)), g.x, g.z, g.owner, t) && owner) animalKilledBy(owner, a, { gren: true });
    }
  } else if (g.type === 2) {
    for (const v of players) {
      if (!v || !v.alive) continue;
      const ey = v.y + (v.cr ? EYE_C : EYE);
      const d = Math.hypot(v.x - g.x, ey - g.y, v.z - g.z);
      if (d > FLASH_RADIUS || !los(g.x, g.y, g.z, v.x, ey, v.z)) continue;
      const cp = Math.cos(v.pitch);
      const fx = -Math.sin(v.yaw) * cp, fy = Math.sin(v.pitch), fz = -Math.cos(v.yaw) * cp;
      const ux = (g.x - v.x) / (d || 1), uy = (g.y - ey) / (d || 1), uz = (g.z - v.z) / (d || 1);
      const face = clamp((fx * ux + fy * uy + fz * uz + 1) / 2, 0, 1);
      const dur = (0.5 + 3.8 * face * face) * (1 - 0.6 * d / FLASH_RADIUS);
      send(v, { t: 'flash', dur: r2(dur) });
    }
  } else {
    broadcast({ t: 'smoke', x: r2(g.x), y: r2(Math.max(0, g.y - 0.1)), z: r2(g.z), dur: SMOKE_SEC });
  }
}

// ---------- Do'kon ----------
function buy(p, msg) {
  if (!p.alive || phase !== 'play' || !shopOpen()) return send(p, { t: 'msg', m: 'Do\'kon hozir yopiq' });
  const k = msg.k;
  const tell = (m) => send(p, { t: 'msg', m });
  if (k === 'w') {
    const i = msg.i | 0, wd = WEAPONS[i];
    if (!wd || wd.price <= 0) return;
    if (p.own[i]) return tell(wd.name + ' allaqachon bor');
    if (p.money < wd.price) return tell('Pul yetmaydi');
    p.money -= wd.price; p.own[i] = true; p.ammo[i] = wd.mag; p.w = i; p.reloadEnd = 0; p.nextFire = now() + 300;
    tell(wd.name + ' sotib olindi'); sendAmmo(p);
  } else if (k === 'g') {
    const i = msg.i | 0, g = GRENADES[i];
    if (!g) return;
    if (p.gren[i] >= GREN_MAX) return tell(g.name + ': ko\'proq ko\'tara olmaysiz');
    if (p.money < g.price) return tell('Pul yetmaydi');
    p.money -= g.price; p.gren[i]++; tell(g.name + ' sotib olindi');
  } else if (k === 'armor') {
    if (p.armor >= 100) return tell('Zirh to\'liq');
    if (p.money < ARMOR_PRICE) return tell('Pul yetmaydi');
    p.money -= ARMOR_PRICE; p.armor = 100; tell('Zirh sotib olindi');
  } else if (k === 'helmet') {
    if (p.helmet) return tell('Dubulg\'a bor');
    if (p.money < HELMET_PRICE) return tell('Pul yetmaydi');
    p.money -= HELMET_PRICE; p.helmet = 1; tell('Dubulg\'a sotib olindi');
  } else return;
  send(p, { t: 'bought' });
  sendSt(p);
}

// ---------- Raund ----------
const MEDALS = [
  ['hs', 'Kalla ovchisi'], ['dmg', 'Eng ko\'p zarar'], ['smax', 'Qirg\'inbarot'], ['an', 'Chorvador'],
  ['gk', 'Granatachi'], ['d', 'Eng ko\'p yiqilgan'],
];
function computeNextMap() { return wantMap >= 0 ? wantMap : (MAP.id + 1) % MAP_COUNT; }

function endRound() {
  phase = 'end';
  endAt = now() + END_S * 1000;
  let max = 0;
  for (let i = 0; i < NAMES.length; i++) if (players[i] && stats[i].k > max) max = stats[i].k;
  winners = max > 0 ? NAMES.map((n, i) => (players[i] && stats[i].k === max ? i : -1)).filter((i) => i >= 0) : [];
  for (const w of winners) { tot[w].w++; if (players[w]) addMoney(players[w], WIN_BONUS, 'win'); }
  medals = [];
  for (const [key, title] of MEDALS) {
    let best = -1, bv = 0;
    for (let i = 0; i < NAMES.length; i++) if (players[i] && stats[i][key] > bv) { bv = stats[i][key]; best = i; }
    if (best >= 0) medals.push({ t: title, id: best, v: Math.round(bv) });
  }
  nextMap = computeNextMap();
  broadcast({ t: 'end', win: winners, nm: nextMap, nmd: wantMode, med: medals, tot });
}

function startRound() {
  phase = 'play';
  roundEnd = now() + ROUND_S * 1000;
  mode = wantMode;
  nextMap = computeNextMap();
  if (nextMap !== MAP.id) initMap(nextMap); else { for (const pk of pickups) pk.at = 0; spawnAnimals(); grenades = []; }
  for (let i = 0; i < stats.length; i++) stats[i] = newStat();
  for (const p of players) if (p) { p.money = Math.max(START_MONEY, p.money); p.streak = 0; p.nemesis = -1; respawn(p, false); }
  broadcast({ t: 'start', m: MAP.id, md: mode });
}

function cfgMsg() { return { t: 'cfg', map: MAP.id, want: wantMap, mode, wmode: wantMode }; }

function setConfig(msg) {
  if (isNum(msg.map) && msg.map >= -1 && msg.map < MAP_COUNT) wantMap = msg.map | 0;
  if (isNum(msg.mode) && msg.mode >= 0 && msg.mode < MODES.length) wantMode = msg.mode | 0;
  const changed = (wantMap >= 0 && wantMap !== MAP.id) || wantMode !== mode;
  if (joined().length <= 1 && changed) { startRound(); }       // faqat bitta o'yinchi bo'lsa darhol
  else if (phase === 'end') nextMap = computeNextMap();
  broadcastAll(cfgMsg());
}
function broadcastAll(obj) {
  const s = JSON.stringify(obj);
  for (const ws of wss.clients) if (ws.readyState === 1) { try { ws.send(s); } catch { /* ignore */ } }
}

function onMessage(ws, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (!msg || typeof msg.t !== 'string') return;
  const p = ws.player;
  if (p) p.lastSeen = now();

  switch (msg.t) {
    case 'join': {
      const id = NAMES.indexOf(msg.name);
      if (id < 0) return send({ ws }, { t: 'err', m: 'Noto\'g\'ri ism' });
      const ex = players[id];
      if (ex && ex.ws !== ws && ex.ws.readyState === 1 && now() - ex.lastSeen < 4000) {
        return send({ ws }, { t: 'err', m: `${NAMES[id]} ismi band` });
      }
      if (ex && ex.ws !== ws) { try { ex.ws.terminate(); } catch { /* ignore */ } }
      if (ws.player && ws.player.id !== id) { players[ws.player.id] = null; }
      const np = { id, ws, name: NAMES[id], x: 0, y: 0, z: 0, yaw: 0, pitch: 0, hp: MAX_HP, alive: true, w: 1,
        ammo: fullAmmo(), own: startOwn(), reloadEnd: 0, nextFire: 0, invUntil: 0, respawnAt: 0, rs: 0,
        lastSeen: now(), hist: [], rtt: 0, cr: 0, money: START_MONEY, armor: 0, helmet: 0, gren: [0, 0, 0],
        streak: 0, nemesis: -1, vh: 0, vv: 0, lastIn: 0 };
      ws.player = np; players[id] = np;
      respawn(np, true);
      send(np, { t: 'welcome', id, name: NAMES[id], ph: phase, m: MAP.id, md: mode });
      sendAmmo(np);
      console.log(`[+] ${NAMES[id]} qo'shildi (${joined().length}/5)`);
      break;
    }
    case 'in': {
      if (!p || !p.alive || msg.rs !== p.rs) return;
      const t = now();
      if (isNum(msg.x) && isNum(msg.y) && isNum(msg.z)) {
        const nx = clamp(msg.x, -ARENA.x, ARENA.x), nz = clamp(msg.z, -ARENA.z, ARENA.z), ny = clamp(msg.y, 0, 26);
        if (p.lastIn && t - p.lastIn > 5 && t - p.lastIn < 500) {
          const dt = (t - p.lastIn) / 1000;
          const sp = Math.min(12, Math.hypot(nx - p.x, nz - p.z) / dt), vv = Math.min(30, Math.abs(ny - p.y) / dt);
          p.vh = p.vh * 0.6 + sp * 0.4; p.vv = p.vv * 0.6 + vv * 0.4;
        }
        p.lastIn = t;
        p.x = nx; p.z = nz; p.y = ny;
      }
      p.cr = msg.cr ? 1 : 0;
      if (isNum(msg.yaw)) p.yaw = msg.yaw;
      if (isNum(msg.pitch)) p.pitch = clamp(msg.pitch, -1.5, 1.5);
      pushHist(p);
      break;
    }
    case 'shoot': if (p) handleShoot(p, msg); break;
    case 'g': if (p) throwGrenade(p, msg); break;
    case 'buy': if (p) buy(p, msg); break;
    case 'cfg': setConfig(msg); break;
    case 'w': {
      if (!p || !p.alive) return;
      const i = msg.i | 0;
      if (i >= 0 && i < NW && i !== p.w && p.own[i]) { p.w = i; p.reloadEnd = 0; p.nextFire = now() + 300; sendAmmo(p); }
      break;
    }
    case 'r': if (p && p.alive) startReload(p); break;
    case 'p':
      if (p && isNum(msg.rtt)) p.rtt = clamp(msg.rtt, 0, 500);
      send({ ws }, { t: 'q', ts: msg.ts });
      break;
    case 'l': send({ ws }, lobbyMsg()); break;
    default: break;
  }
}

// ---------------- Asosiy sikl (20 Hz) ----------------
const DT = 0.05;
setInterval(() => {
  const t = now();
  if (phase === 'play' && t >= roundEnd) endRound();
  else if (phase === 'end' && t >= endAt) startRound();

  for (const p of players) {
    if (!p) continue;
    if (!p.alive && phase === 'play' && t >= p.respawnAt) respawn(p, false);
    if (p.reloadEnd && t >= p.reloadEnd) {
      p.ammo[p.reloadW ?? p.w] = WEAPONS[p.reloadW ?? p.w].mag;
      p.reloadEnd = 0; sendAmmo(p);
    }
  }
  // granatalar
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    stepGrenade(g, DT);
    if (t >= g.boom) { grenades.splice(i, 1); explode(g); }
  }
  // hayvonlar
  if (phase === 'play') {
    stepAnimals(DT, t, players, (victim, a, dx, dz) => {
      applyDamage(victim, ANIMALS[a.t].gore, false, null, { an: a.t, fx: a.x, fz: a.z });
      send(victim, { t: 'kb', vx: r2(dx * 9), vz: r2(dz * 9), a: a.id });
    });
  }
  // dori qutilari
  for (let i = 0; i < pickups.length; i++) {
    const pk = pickups[i], pos = PICKUPS[i];
    if (pk.at && t >= pk.at) pk.at = 0;
    if (pk.at) continue;
    for (const p of players) {
      if (!p || !p.alive || p.hp >= MAX_HP) continue;
      if (Math.hypot(p.x - pos.x, p.z - pos.z) < 1.3 && Math.abs(p.y - pos.y) < 1.5) {
        p.hp = Math.min(MAX_HP, p.hp + PICKUP_HEAL);
        pk.at = t + PICKUP_RESPAWN_MS;
        send(p, { t: 'heal', hp: p.hp });
        break;
      }
    }
  }
  const snap = {
    t: 's',
    rt: Math.max(0, Math.round((phase === 'play' ? roundEnd - t : endAt - t) / 100) / 10),
    ph: phase, m: MAP.id, md: mode,
    win: phase === 'end' ? winners : undefined,
    pk: pickups.map((pk) => (pk.at ? 0 : 1)),
    p: players.filter(Boolean).map((p) => [
      p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), Math.max(0, Math.round(p.hp)),
      p.alive ? 1 : 0, p.w, t < p.invUntil ? 1 : 0, stats[p.id].k, stats[p.id].d, p.cr ? 1 : 0, p.armor > 0 ? 1 : 0,
    ]),
    an: animals.map((a) => [a.id, a.t, r2(a.x), r2(a.z), r2(a.yaw), Math.round((100 * a.hp) / ANIMALS[a.t].hp), a.alive ? a.st : -1]),
    gr: grenades.map((g) => [g.id, g.type, r2(g.x), r2(g.y), r2(g.z)]),
  };
  broadcast(snap);
}, 50);

// ---------------- WebSocket ----------------
function lobbyMsg() {
  return {
    t: 'lobby', names: NAMES, taken: players.map((p, i) => (p && p.ws.readyState === 1 ? i : -1)).filter((i) => i >= 0),
    map: MAP.id, want: wantMap, mode, wmode: wantMode, tot,
  };
}
const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 4096 });
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => onMessage(ws, data.toString()));
  ws.on('close', () => {
    const p = ws.player;
    if (p && players[p.id] === p) {
      players[p.id] = null;
      console.log(`[-] ${p.name} chiqib ketdi (${joined().length}/5)`);
    }
  });
  ws.on('error', () => {});
  send({ ws }, lobbyMsg());
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { /* ignore */ }
  }
}, 6000);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Sariq Hovli serveri ishga tushdi: http://localhost:${PORT}`);
});
