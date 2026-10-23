import { BOXES, DECOR, SPAWNS } from '../client/shared/map.js';
import { stepPlayer, collides } from '../client/shared/physics.js';
let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
console.log('boxes', BOXES.length, 'decor', DECOR.length);

// spawn nuqtalari to'qnashmasligi kerak
ok(SPAWNS.every(s => !collides(s.x, s.y + 0.01, s.z)), 'barcha spawnlar bo\'sh');

function run(s, vx, vz, secs, jumpAt = -1) {
  const dt = 1 / 60;
  for (let i = 0; i < secs * 60; i++) stepPlayer(s, vx, vz, i === jumpAt, dt);
}

// 1) 1-qavatga zina (shimoliy bino, g'arbiy zina)
let s = { x: -10.5, y: 0, z: -20.6, vy: 0, onGround: true };
run(s, 4, 0, 3.0);
ok(Math.abs(s.y - 4) < 0.05 && s.x > -2.6, `1-qavatga chiqdi: y=${s.y.toFixed(2)} x=${s.x.toFixed(2)}`);

// 2) 1-qavat bo'ylab sharqqa yurib, ikkinchi zinadan 2-qavatga
s.z = -20.6;
run(s, 4, 0, 1.5);                      // sharqqa
ok(s.y > 3.95 && s.y < 4.05, `1-qavat poli ustida y=${s.y.toFixed(2)} x=${s.x.toFixed(2)}`);
// zina boshlanishi x=5.6..11.6, ikkinchi zina sharq chetidan g'arbga ko'tariladi
s.x = 10.5; s.z = -20.6; s.y = 4; s.vy = 0; s.onGround = true;
run(s, -4, 0, 3.0);
ok(Math.abs(s.y - 8) < 0.05, `2-qavatga chiqdi: y=${s.y.toFixed(2)} x=${s.x.toFixed(2)}`);

// 3) Deraza orqali o'tib bo'lmaydi (old devor z=-12.4..-12, deraza x=-2.4..-0.6 emas - 2-qavat polida)
s = { x: 0.0, y: 0, z: -11, vy: 0, onGround: true };   // hovlida, devor oldida (x=0 ustun)
run(s, 0, -4, 1.5);
ok(s.z > -12.1, `ustun to'sdi: z=${s.z.toFixed(2)}`);
// 4) Eshik orqali kirish (ground floor, x ~ -1.5)
s = { x: -1.5, y: 0, z: -11, vy: 0, onGround: true };
run(s, 0, -4, 1.5);
ok(s.z < -13, `eshikdan kirdi: z=${s.z.toFixed(2)}`);
// 5) Deraza tokchasiga sakrash (x=-1.5 eshik, deraza x=-7.5 ga yaqin: deraza i=1: 1.8*..)
s = { x: -9.9, y: 0, z: -11, vy: 0, onGround: true }; // deraza i=1: s=0.6+1.8+1.2=3.6 -> x=-8.4..-6.6 ; i=0: -11.4..-9.6
run(s, 0, -4, 0.15, 3);
// 6) Yashikka chiqib bo'lmaydi
s = { x: -4.5, y: 0, z: -1.0, vy: 0, onGround: true };
run(s, 0, -4, 0.8, 5);
ok(s.y < 0.3 && s.z >= -2.0, `yashik: y=${s.y.toFixed(2)} z=${s.z.toFixed(2)}`);
// 7) Arena chegarasidan chiqolmaydi
s = { x: 30, y: 0, z: 0, vy: 0, onGround: true };
run(s, 6, 0, 3);
ok(s.x <= 31.5, `arena chegarasi: x=${s.x.toFixed(2)}`);
// 8) Sakrash balandligi
s = { x: 20, y: 0, z: 0, vy: 0, onGround: true };
let maxY = 0; for (let i = 0; i < 120; i++) { stepPlayer(s, 0, 0, i === 0, 1/60); maxY = Math.max(maxY, s.y); }
ok(maxY > 1.1 && maxY < 1.4, `sakrash balandligi ${maxY.toFixed(2)} m`);
console.log(fail ? `${fail} ta test o'tmadi` : 'Hamma testlar o\'tdi');
process.exit(fail ? 1 : 0);
