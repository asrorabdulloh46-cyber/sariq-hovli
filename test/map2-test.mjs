import { BOXES, SPAWNS, PICKUPS, ARENA, loadMap, MAP_COUNT , buildGrid } from '../client/shared/map.js';
import { stepPlayer, collides } from '../client/shared/physics.js';
import { H, HC, PS } from '../client/shared/consts.js';
let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
const run = (s, vx, vz, secs, cr = false) => { for (let i = 0; i < secs * 60; i++) stepPlayer(s, vx, vz, false, 1 / 60, cr); };

for (let id = 0; id < MAP_COUNT; id++) {
  loadMap(id);
  ok(SPAWNS.length >= 10 && SPAWNS.every((s) => !collides(s.x, s.y + 0.01, s.z)), `xarita ${id}: spawnlar bo'sh (${SPAWNS.length})`);
  ok(SPAWNS.every((s) => Math.abs(s.x) < ARENA.x && Math.abs(s.z) < ARENA.z), `xarita ${id}: spawnlar arena ichida`);
  ok(PICKUPS.every((p) => !collides(p.x, p.y + 0.01, p.z)), `xarita ${id}: dori qutilari bo'sh joyda`);
}

loadMap(1);
// tepalikka chiqish
let s = { x: -27, y: 0, z: -12, vy: 0, onGround: true };
run(s, 0, -4, 1.5);
ok(Math.abs(s.y - 1.0) < 0.05, `tepalik ustiga chiqdi y=${s.y.toFixed(2)}`);
// konteynerdan o'tib bo'lmaydi
s = { x: -26, y: 0, z: -6, vy: 0, onGround: true };
run(s, 4, 0, 2);
ok(s.x < -22.2 + 0.0, `konteyner to'sib turibdi x=${s.x.toFixed(2)}`);
// o'tirish: balandlik va past devor
s = { x: -4, y: 0, z: -3, vy: 0, onGround: true };
run(s, 0, 0, 0.2, true);
ok(s.cr === 1 && Math.abs(s.h - HC) < 1e-9, `o'tirdi h=${s.h}`);
run(s, 0, 0, 0.2, false);
ok(!s.cr && s.h === H, `turdi h=${s.h}`);
// past shift ostida o'tirgan holda turib bo'lmaydi
BOXES.push({ minx: -5, miny: 1.4, minz: -4, maxx: 0, maxy: 1.6, maxz: -2, kind: 'test' }); buildGrid();
s = { x: -3, y: 0, z: -3, vy: 0, onGround: true };
run(s, 0, 0, 0.2, true);
run(s, 0, 0, 0.3, false);
ok(s.cr === 1, `shift ostida turolmadi (h=${s.h})`);
s.x = 3; // chiqib olamiz
BOXES.pop();
run(s, 0, 0, 0.3, false);
ok(!s.cr, 'ochiq joyda turdi');
// o'tirgan holda past devor (1.2) ostida/ortida ko'rinmaslik: bo'y < devor
ok(HC * PS < 1.5, `o'tirganda zarba qutisi (${(HC * PS).toFixed(2)}) past devordan (1.5) past`);
console.log(fail ? `${fail} XATO` : 'HAMMASI OK');
process.exit(fail ? 1 : 0);
