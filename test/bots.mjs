// Server mantig'ini tekshirish: 3 ta bot ulanadi, bir-birini otadi
import WebSocket from 'ws';
import { NAMES } from '../client/shared/consts.js';

const URL = process.env.URL || 'ws://localhost:3000/ws';
let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bot(name) {
  const b = { name, ws: new WebSocket(URL), events: [], snap: null, rs: 0, me: null, errors: [], ammo: null };
  b.ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.t === 's') b.snap = m; else b.events.push(m);
    if (m.t === 'respawn') { b.rs = m.rs; b.me = m; }
    if (m.t === 'err') b.errors.push(m.m);
    if (m.t === 'a') b.ammo = m;
  });
  b.send = (o) => b.ws.send(JSON.stringify(o));
  b.open = new Promise((r) => b.ws.on('open', r));
  return b;
}

const a = bot('Tohir'), v = bot('Asror'), c = bot('Muhammad');
await Promise.all([a.open, v.open, c.open]);
const lobby = a.events.find((e) => e.t === 'lobby');
ok(lobby && lobby.names.length === 5, 'lobby xabari keldi');

a.send({ t: 'join', name: 'Tohir' }); v.send({ t: 'join', name: 'Asror' }); c.send({ t: 'join', name: 'Muhammad' });
await sleep(400);
ok(a.events.some((e) => e.t === 'welcome'), 'Tohir qo\'shildi');

// band ism
const d = bot('Tohir'); await d.open; d.send({ t: 'join', name: 'Tohir' }); await sleep(300);
ok(d.errors.length > 0, 'band ism rad etildi: ' + d.errors[0]);
d.ws.close();

// Joylashtiramiz: Tohir (0,0,-8) yaw=pi (faqat +z ga qaraydi), Asror (0,0,-12)... o'rtada devor yo'q (hovli)
function place(b, x, z, yaw) { b.send({ t: 'in', rs: b.rs, x, y: 0, z, yaw, pitch: 0 }); }
// Tohir z=-8 da, -z tomonga qaraydi (yaw=0), Asror z=-12 hovlida (devor z=-12.4 dan keyin boshlanadi)
for (let i = 0; i < 4; i++) { place(a, 0, -8, 0); place(v, 0, -11, 0); place(c, 20, 10, 0); await sleep(60); }
await sleep(100);
const pv = v.snap.p.find((p) => p[0] === 2);
ok(pv && Math.abs(pv[3] - -11) < 0.05, 'Asror pozitsiyasi serverda: ' + JSON.stringify(pv && pv.slice(1, 4)));

// spawn himoyasi tugasin
await sleep(2700);
for (let i = 0; i < 3; i++) { place(a, 0, -8, 0); place(v, 0, -11, 0); await sleep(60); }

// Tohir avtomatni otadi: Asror 3 m oldinda. Avtomat w=1 default
const t0 = Date.now();
let shots = 0;
while (Date.now() - t0 < 1500) {
  place(a, 0, -8, 0); place(v, 0, -11, 0);
  a.send({ t: 'shoot', yaw: 0, pitch: -0.0, z: false, ox: 0, oy: 1.62, oz: -8 });
  shots++;
  await sleep(100);
  if (a.events.some((e) => e.t === 'kill')) break;
}
await sleep(200);
const hm = a.events.filter((e) => e.t === 'hm');
const kill = a.events.find((e) => e.t === 'kill');
ok(hm.length > 0, `urilish bildirildi (${hm.length} ta hit marker)`);
ok(kill && kill.k === 0 && kill.v === 2, 'o\'ldirish hisoblandi: ' + JSON.stringify(kill));
ok(v.events.some((e) => e.t === 'dmg'), 'zarar olgan o\'yinchiga dmg xabari keldi');
ok(c.events.some((e) => e.t === 'shot'), 'uchinchi o\'yinchi ham otilishni ko\'rdi');
const me = a.snap.p.find((p) => p[0] === 0);
ok(me && me[10] === 1, 'hisob: Tohir 1 kill, snapshot: ' + JSON.stringify(me));

// devor orqali otib bo'lmaydi: Asror shimoliy bino ichida (z=-17), Tohir hovlida otadi (devorda deraza yo'q joy: x=0 ustun? x=0 pillar)
await sleep(3200);   // respawn
const rsA = v.events.filter((e) => e.t === 'respawn').length;
ok(rsA >= 2, 'Asror qayta tug\'ildi');
for (let i = 0; i < 4; i++) { place(a, 0, -8, 0); place(v, 0, -17, 0); await sleep(60); }
await sleep(2700);
for (let i = 0; i < 3; i++) { place(a, 0, -8, 0); place(v, 0, -17, 0); await sleep(60); }
const before = v.events.filter((e) => e.t === 'dmg').length;
for (let i = 0; i < 6; i++) { place(a, 0, -8, 0); place(v, 0, -17, 0); a.send({ t: 'shoot', yaw: 0, pitch: 0, z: false }); await sleep(130); }
ok(v.events.filter((e) => e.t === 'dmg').length === before, 'devor orqali (x=0 ustun) zarar bermadi');

// zaryad tugashi va qayta zaryadlash
for (let i = 0; i < 40; i++) { a.send({ t: 'shoot', yaw: 0, pitch: 0 }); await sleep(105); }
ok(a.ammo && a.ammo.r === 1 || a.events.some((e) => e.t === 'a' && e.r === 1), 'o\'q tugagach avtomatik qayta zaryadlash boshlandi');
await sleep(2300);
ok(a.ammo && a.ammo.a[1] === 30, 'qayta zaryadlandi: ' + JSON.stringify(a.ammo && a.ammo.a));

// ping
a.send({ t: 'p', ts: 123 }); await sleep(100);
ok(a.events.some((e) => e.t === 'q' && e.ts === 123), 'ping/pong ishlayapti');

for (const b of [a, v, c]) b.ws.close();
await sleep(200);
console.log(fail ? `${fail} ta test o'tmadi` : 'Server testlari o\'tdi');
process.exit(fail ? 1 : 0);
