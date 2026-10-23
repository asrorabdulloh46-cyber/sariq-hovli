// Lag kompensatsiya testi: nishon harakatlanadi, otuvchi 260 ms oldingi joyiga qaratadi (RTT=200 ms)
import WebSocket from 'ws';
const URL = process.env.URL || 'ws://localhost:3000/ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function bot(name) {
  const b = { ws: new WebSocket(URL), rs: 0, ev: [] };
  b.ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'respawn') b.rs = m.rs; b.ev.push(m); });
  b.send = (o) => b.ws.send(JSON.stringify(o));
  b.open = new Promise((r) => b.ws.on('open', r));
  b.name = name; return b;
}
const a = bot('Tohir'), v = bot('Asror');
await Promise.all([a.open, v.open]);
a.send({ t: 'join', name: 'Tohir' }); v.send({ t: 'join', name: 'Asror' });
await sleep(400);
a.send({ t: 'p', ts: 1, rtt: 200 });
const place = (b, x, z, yaw) => b.send({ t: 'in', rs: b.rs, x, y: 0, z, yaw, pitch: 0 });
for (let i = 0; i < 5; i++) { place(a, 0, 0, 0); place(v, -2, -8, 0); await sleep(50); }
await sleep(2700);   // spawn himoyasi tugasin
// Asror x = -2 -> +4 ga 5 m/s tezlikda yuguradi, 33 ms oralig'ida yuboradi
const t0 = Date.now(); const xv = (ms) => -2 + 5 * Math.max(0, ms) / 1000;
let shot = false, hits = 0, tries = 0;
while (Date.now() - t0 < 1100) {
  const el = Date.now() - t0;
  place(a, 0, 0, 0); place(v, xv(el), -8, 0);
  if (el > 350 && el < 1000 && el % 100 < 40 && tries < 8) {
    tries++;
    const tx = xv(el - 260);      // otuvchi ko'rayotgan (kechikkan) joy
    a.send({ t: 'shoot', yaw: Math.atan2(-tx, 8), pitch: 0, z: false, ox: 0, oy: 1.62, oz: 0 });
    await sleep(100); continue;
  }
  await sleep(33);
}
await sleep(300);
hits = a.ev.filter((e) => e.t === 'hm').length;
console.log(`otishlar: ${tries}, tegdi: ${hits}`);
const ok = hits >= 2;
console.log(ok ? 'OK   lag kompensatsiya ishlayapti' : 'FAIL lag kompensatsiya ishlamadi');
a.ws.close(); v.ws.close(); await sleep(100);
process.exit(ok ? 0 : 1);
