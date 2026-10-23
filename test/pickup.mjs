// Dori qutisi testi: Tohir Asrorga bitta o'q uzadi, Asror dori qutisiga boradi
import WebSocket from 'ws';
const URL = process.env.URL || 'ws://localhost:3000/ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function bot() {
  const b = { ws: new WebSocket(URL), rs: 0, ev: [], hp: 100 };
  b.ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'respawn') b.rs = m.rs; if (m.t === 's') { const me = m.p.find((p) => p[0] === b.id); if (me) b.hp = me[6]; } b.ev.push(m); });
  b.send = (o) => b.ws.send(JSON.stringify(o)); b.open = new Promise((r) => b.ws.on('open', r)); return b;
}
const a = bot(), v = bot(); a.id = 0; v.id = 2;
await Promise.all([a.open, v.open]);
a.send({ t: 'join', name: 'Tohir' }); v.send({ t: 'join', name: 'Asror' }); await sleep(400);
const place = (b, x, z) => b.send({ t: 'in', rs: b.rs, x, y: 0, z, yaw: 0, pitch: 0 });
a.send({ t: 'w', i: 0 });   // pistolet
for (let i = 0; i < 5; i++) { place(a, 0, -4); place(v, 0, -8); await sleep(50); }
await sleep(2700);
for (let i = 0; i < 3; i++) { place(a, 0, -4); place(v, 0, -8); await sleep(50); }
await sleep(400);
a.send({ t: 'shoot', yaw: 0, pitch: -0.1, z: false, ox: 0, oy: 1.62, oz: -4 });   // tanaga
await sleep(300);
for (let i = 0; i < 3; i++) { place(v, 0, -8); await sleep(50); }
const hpAfter = v.hp;
console.log('HP o\'qdan keyin:', hpAfter);
// dori qutisiga (-26, 0, 0)
for (let i = 0; i < 20; i++) { place(v, -26, 0); await sleep(50); }
await sleep(300);
const heal = v.ev.find((e) => e.t === 'heal');
console.log('HP qutidan keyin:', v.hp, heal ? '(heal xabari keldi)' : '(heal yo\'q)');
const ok = hpAfter < 100 && hpAfter > 0 && heal && v.hp > hpAfter;
console.log(ok ? 'OK   dori qutisi ishlayapti' : 'FAIL dori qutisi');
a.ws.close(); v.ws.close(); await sleep(100); process.exit(ok ? 0 : 1);
