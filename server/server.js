// "Sariq Hovli" o'yin serveri: statik fayllar + WebSocket (/ws)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import {
  NAMES, WEAPONS, R, H, EYE, MAX_HP, RESPAWN_MS, SPAWN_INV_MS, ROUND_SEC, END_SEC,
  KILL_LIMIT, HEAD_MULT, PICKUP_HEAL, PICKUP_RESPAWN_MS,
} from '../client/shared/consts.js';
import { SPAWNS, PICKUPS, ARENA, raycastWorld, rayBox } from '../client/shared/map.js';

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
const players = new Array(NAMES.length).fill(null);          // id = NAMES indeksi
const stats = NAMES.map(() => ({ k: 0, d: 0 }));
const pickups = PICKUPS.map(() => ({ at: 0 }));              // at = qayta paydo bo'ladigan vaqt (0 = bor)
let phase = 'play';
let roundEnd = Date.now() + ROUND_S * 1000;
let endAt = 0;
let winners = [];

const now = () => Date.now();
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (v) => Math.round(v * 100) / 100;

function send(p, obj) {
  if (p && p.ws && p.ws.readyState === 1) { try { p.ws.send(JSON.stringify(obj)); } catch { /* ignore */ } }
}
function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const p of players) if (p && p.ws.readyState === 1) { try { p.ws.send(s); } catch { /* ignore */ } }
}

function bestSpawn(selfId) {
  let best = SPAWNS[0], bestD = -1;
  for (const sp of SPAWNS) {
    let min = 1e9;
    for (const p of players) {
      if (!p || p.id === selfId || !p.alive) continue;
      const d = Math.hypot(p.x - sp.x, p.y - sp.y + 0, p.z - sp.z) + Math.abs(p.y - sp.y) * 2;
      if (d < min) min = d;
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
  p.hist.push({ t, x: p.x, y: p.y, z: p.z });
  while (p.hist.length > 2 && t - p.hist[0].t > HIST_MS) p.hist.shift();
}
function posAt(p, t) {
  const h = p.hist;
  if (!h.length || t >= h[h.length - 1].t) return { x: p.x, y: p.y, z: p.z };
  if (t <= h[0].t) return h[0];
  for (let i = h.length - 1; i > 0; i--) {
    if (h[i - 1].t <= t) {
      const a = h[i - 1], b = h[i], k = (t - a.t) / Math.max(1, b.t - a.t);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
    }
  }
  return h[0];
}

function fullAmmo() { return WEAPONS.map((w) => w.mag); }

function respawn(p, first) {
  const sp = bestSpawn(p.id);
  p.x = sp.x; p.y = sp.y; p.z = sp.z; p.yaw = sp.yaw; p.pitch = 0;
  p.hp = MAX_HP; p.alive = true; p.rs = (p.rs || 0) + 1;
  p.ammo = fullAmmo(); p.reloadEnd = 0; p.nextFire = 0;
  p.invUntil = now() + SPAWN_INV_MS;
  p.hist = []; pushHist(p);
  send(p, { t: 'respawn', x: sp.x, y: sp.y, z: sp.z, yaw: sp.yaw, rs: p.rs, first: !!first });
  sendAmmo(p);
}

function sendAmmo(p) {
  send(p, { t: 'a', w: p.w, a: p.ammo, r: p.reloadEnd > now() ? 1 : 0 });
}

function startReload(p) {
  const wd = WEAPONS[p.w];
  if (p.reloadEnd > now() || p.ammo[p.w] >= wd.mag) return;
  p.reloadEnd = now() + wd.reload * 1000;
  p.reloadW = p.w;
  sendAmmo(p);
}

function endRound() {
  phase = 'end';
  endAt = now() + END_S * 1000;
  let max = 0;
  for (let i = 0; i < NAMES.length; i++) if (players[i] && stats[i].k > max) max = stats[i].k;
  winners = max > 0 ? NAMES.map((n, i) => (players[i] && stats[i].k === max ? i : -1)).filter((i) => i >= 0) : [];
  broadcast({ t: 'end', win: winners });
}

function startRound() {
  phase = 'play';
  roundEnd = now() + ROUND_S * 1000;
  for (const s of stats) { s.k = 0; s.d = 0; }
  for (const pk of pickups) pk.at = 0;
  for (const p of players) if (p) respawn(p, false);
  broadcast({ t: 'start' });
}

function handleShoot(p, msg) {
  const t = now();
  if (!p.alive || phase !== 'play') return;
  const wd = WEAPONS[p.w];
  if (p.reloadEnd > t) return;
  if (p.ammo[p.w] <= 0) { startReload(p); return; }
  if (t < p.nextFire) return;
  p.nextFire = t + wd.interval * 1000 - 25;
  p.ammo[p.w]--;
  p.invUntil = Math.min(p.invUntil, t);   // otganda spawn himoyasi tugaydi

  let ox = p.x, oy = p.y + EYE, oz = p.z;
  if (isNum(msg.ox) && isNum(msg.oy) && isNum(msg.oz) &&
      Math.hypot(msg.ox - p.x, msg.oy - (p.y + EYE), msg.oz - p.z) < 2.2) { ox = msg.ox; oy = msg.oy; oz = msg.oz; }

  let yaw = isNum(msg.yaw) ? msg.yaw : p.yaw;
  let pitch = isNum(msg.pitch) ? Math.max(-1.5, Math.min(1.5, msg.pitch)) : p.pitch;
  const sp = wd.hipSpread ? (msg.z ? wd.spread : wd.hipSpread) : wd.spread;
  const ang = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * sp;
  yaw += rad * Math.cos(ang); pitch += rad * Math.sin(ang);
  const cp = Math.cos(pitch);
  const dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;

  const tWorld = raycastWorld(ox, oy, oz, dx, dy, dz, wd.range);
  let victimY = 0;
  let bestT = tWorld, victim = null;
  // otuvchi ekranda ko'rgan paytga qaytamiz: ping (RTT) + interpolyatsiya kechikishi
  const rewind = Math.min(350, (p.rtt || 0) + 60);
  for (const v of players) {
    if (!v || v.id === p.id || !v.alive) continue;
    const vp = posAt(v, t - rewind);
    const bt = rayBox(ox, oy, oz, dx, dy, dz, {
      minx: vp.x - 0.34, miny: vp.y, minz: vp.z - 0.34, maxx: vp.x + 0.34, maxy: vp.y + H, maxz: vp.z + 0.34,
    });
    if (bt < bestT) { bestT = bt; victim = v; victimY = vp.y; }
  }
  const ex = ox + dx * bestT, ey = oy + dy * bestT, ez = oz + dz * bestT;
  broadcast({ t: 'shot', id: p.id, w: p.w, o: [r2(ox), r2(oy), r2(oz)], e: [r2(ex), r2(ey), r2(ez)], hit: victim ? 1 : 0 });

  if (victim && t >= victim.invUntil) {
    const head = ey >= victimY + 1.38;
    const dmg = Math.round(wd.dmg * (head ? HEAD_MULT : 1));
    victim.hp -= dmg;
    const kill = victim.hp <= 0;
    send(p, { t: 'hm', h: head ? 1 : 0, k: kill ? 1 : 0, d: dmg });
    send(victim, { t: 'dmg', fx: r2(p.x), fz: r2(p.z), d: dmg, hp: Math.max(0, victim.hp) });
    if (kill) {
      victim.hp = 0; victim.alive = false; victim.respawnAt = t + RESPAWN_MS;
      stats[p.id].k++; stats[victim.id].d++;
      broadcast({ t: 'kill', k: p.id, v: victim.id, w: p.w, h: head ? 1 : 0 });
      if (stats[p.id].k >= KILL_LIM && phase === 'play') endRound();
    }
  }
  if (p.ammo[p.w] <= 0) startReload(p); else sendAmmo(p);
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
        ammo: fullAmmo(), reloadEnd: 0, nextFire: 0, invUntil: 0, respawnAt: 0, rs: 0, lastSeen: now(), hist: [], rtt: 0 };
      ws.player = np; players[id] = np;
      respawn(np, true);
      send(np, { t: 'welcome', id, name: NAMES[id], ph: phase });
      sendAmmo(np);
      console.log(`[+] ${NAMES[id]} qo'shildi (${players.filter(Boolean).length}/5)`);
      break;
    }
    case 'in': {
      if (!p || !p.alive || msg.rs !== p.rs) return;
      if (isNum(msg.x) && isNum(msg.y) && isNum(msg.z)) {
        p.x = Math.max(-ARENA.x, Math.min(ARENA.x, msg.x));
        p.z = Math.max(-ARENA.z, Math.min(ARENA.z, msg.z));
        p.y = Math.max(0, Math.min(14, msg.y));
      }
      if (isNum(msg.yaw)) p.yaw = msg.yaw;
      if (isNum(msg.pitch)) p.pitch = Math.max(-1.5, Math.min(1.5, msg.pitch));
      pushHist(p);
      break;
    }
    case 'shoot': if (p) handleShoot(p, msg); break;
    case 'w': {
      if (!p || !p.alive) return;
      const i = msg.i | 0;
      if (i >= 0 && i < WEAPONS.length && i !== p.w) { p.w = i; p.reloadEnd = 0; p.nextFire = now() + 300; sendAmmo(p); }
      break;
    }
    case 'r': if (p && p.alive) startReload(p); break;
    case 'p':
      if (p && isNum(msg.rtt)) p.rtt = Math.max(0, Math.min(500, msg.rtt));
      send({ ws }, { t: 'q', ts: msg.ts });
      break;
    case 'l': send({ ws }, lobbyMsg()); break;
    default: break;
  }
}

// ---------------- Asosiy sikl (20 Hz) ----------------
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
    ph: phase,
    win: phase === 'end' ? winners : undefined,
    pk: pickups.map((pk) => (pk.at ? 0 : 1)),
    p: players.filter(Boolean).map((p) => [
      p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), Math.max(0, Math.round(p.hp)),
      p.alive ? 1 : 0, p.w, t < p.invUntil ? 1 : 0, stats[p.id].k, stats[p.id].d,
    ]),
  };
  broadcast(snap);
}, 50);

// ---------------- WebSocket ----------------
function lobbyMsg() {
  return { t: 'lobby', names: NAMES, taken: players.map((p, i) => (p && p.ws.readyState === 1 ? i : -1)).filter((i) => i >= 0) };
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
      console.log(`[-] ${p.name} chiqib ketdi (${players.filter(Boolean).length}/5)`);
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
