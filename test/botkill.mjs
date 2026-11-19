// Botni o'ldirish: o'lgan bot qayta tug'ilmaydi
import WebSocket from 'ws';
const URL = process.env.URL || 'ws://localhost:3123/ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
const ws = new WebSocket(URL); const ev = []; let snap = null, me = null;
ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 's') snap = m; else ev.push(m); if (m.t === 'respawn') me = m; });
await new Promise((r) => ws.on('open', r));
const send = (o) => ws.send(JSON.stringify(o));
send({ t: 'join', name: 'Tohir' });
await sleep(800);
const bot = snap.p.find((p) => p[0] >= 5 && p[7]);
const id = bot[0];
let killed = false;
for (let i = 0; i < 80 && !killed; i++) {
  const b = snap.p.find((p) => p[0] === id);
  if (!b[7]) { killed = true; break; }
  const x = b[1] + 3, y = b[2], z = b[3];
  send({ t: 'in', rs: me.rs, x, y, z, yaw: Math.PI / 2, pitch: 0 });
  const dx = b[1] - x, dz = b[3] - z, dy = (b[2] + 1.2) - (y + 1.62);
  const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
  send({ t: 'shoot', yaw, pitch, ox: x, oy: y + 1.62, oz: z });
  await sleep(120);
}
ok(killed, `bot ${id} o'ldirildi`);
ok(ev.some((e) => e.t === 'kill' && e.v === id && e.rv === 0), 'kill xabari, qasos yo\'q');
await sleep(5000);
const b2 = snap.p.find((p) => p[0] === id);
ok(b2 && b2[7] === 0, 'bot 5 soniyadan keyin ham o\'lik (qayta tug\'ilmadi)');
ws.close(); process.exit(fail ? 1 : 0);
