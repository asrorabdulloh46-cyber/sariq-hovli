// Sinov uchun: bot berilgan joyga turadi (argv: name x z yaw seconds [shoot])
import WebSocket from 'ws';
const [name, x, z, yaw, secs, shoot] = process.argv.slice(2);
const ws = new WebSocket(process.env.URL || 'ws://localhost:3000/ws');
let rs = 0;
ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'respawn') rs = m.rs; });
ws.on('open', () => {
  ws.send(JSON.stringify({ t: 'join', name }));
  setInterval(() => ws.send(JSON.stringify({ t: 'in', rs, x: +x, y: 0, z: +z, yaw: +yaw, pitch: 0 })), 50);
  if (shoot) setInterval(() => ws.send(JSON.stringify({ t: 'shoot', yaw: +yaw, pitch: 0 })), 120);
  setTimeout(() => process.exit(0), (+secs) * 1000);
});
