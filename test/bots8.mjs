// 8 ta server boti: tug'iladi, yuradi, odamni otadi, o'lsa qayta tug'ilmaydi
import WebSocket from 'ws';
const URL = process.env.URL || 'ws://localhost:3123/ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
const ws = new WebSocket(URL); const ev = []; let snap = null, me = null;
ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 's') snap = m; else ev.push(m); if (m.t === 'respawn') me = m; });
await new Promise((r) => ws.on('open', r));
const send = (o) => ws.send(JSON.stringify(o));
send({ t: 'join', name: 'Asror' });
await sleep(600);
const bots0 = snap.p.filter((p) => p[0] >= 5);
ok(bots0.length === 8, `8 ta bot bor (${bots0.length})`);
ok(bots0.every((p) => p[7] === 1), 'hammasi tirik');
ok(snap.p.find((p) => p[0] === 0 || p[0] === 2)?.[14] === 250, 'odam joni 250');
const ys = bots0.map((p) => p[2]); console.log('   bot y:', ys.join(','));
// odam joyida turadi, input yuborib turadi
let t0 = Date.now(); let moved = 0;
const start = new Map(bots0.map((p) => [p[0], [p[1], p[3]]]));
while (Date.now() - t0 < 6000) { send({ t: 'in', rs: me.rs, x: me.x, y: me.y, z: me.z, yaw: 0, pitch: 0 }); await sleep(50); }
for (const p of snap.p.filter((q) => q[0] >= 5)) { const s0 = start.get(p[0]); if (Math.hypot(p[1] - s0[0], p[3] - s0[1]) > 1) moved++; }
ok(moved >= 4, `botlar yurdi (${moved}/8)`);
const shots = ev.filter((e) => e.t === 'shot' && e.id >= 5).length;
console.log('   bot o\'qlari:', shots, ' odamga zarar:', ev.filter((e) => e.t === 'dmg').map((e) => e.d).join(','));
// botni o'ldirish: botga qarab otamiz (snapdan pozitsiya)
const myId = ev.find((e) => e.t === 'welcome').id;
console.log('   men:', myId, me.x, me.y, me.z);
ws.close(); process.exit(fail ? 1 : 0);
