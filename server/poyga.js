// "Poyga" o'yin serveri: Sariq Hovli bilan bitta HTTP serverda, alohida WebSocket yo'lida (/ws2).
// Bir xona: kutish zali -> sanoq -> poyga -> natijalar -> kutish zali. Bo'sh joylarni botlar to'ldiradi.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import {
  NAMES, CARS, COLORS, DEFAULT_COLOR, MODES, ITEMS, COUNT_MS, GO_AT_MS, FINISH_WAIT_MS, RESULTS_MS,
  ITEM_RESPAWN_MS, OIL_LIFE_MS, SHIELD_MS, FOG_MS, SLIP_MS, BOOST_MS,
} from '../client/poyga/shared/consts.js';
import { TRACKS, WALL, newProgress, advanceProgress } from '../client/poyga/shared/track.js';
import { PHYS, newCar, stepCar, carPush } from '../client/poyga/shared/car.js';
import { newBrain, aiInputs } from '../client/poyga/shared/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATS_FILE = process.env.POYGA_STATS || path.join(__dirname, '..', 'data', 'poyga-stats.json');
const TICK_MS = 50;
const now = () => Date.now();
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Fl (flag) bitlari
const F_BRAKE = 1, F_NITRO = 2, F_DRIFT = 4, F_BOOST = 8, F_SLIP = 16, F_OFF = 32, F_HORN = 64, F_WRONG = 128;

export function createPoyga() {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  const seats = NAMES.map((n, i) => ({ id: i, name: n, ws: null, color: DEFAULT_COLOR[i], ready: false }));
  let phase = 'lobby';
  let trackId = 0, modeId = 0, lastChanger = '';
  let track = TRACKS[0], laps = MODES[0].laps;
  let entries = [];            // poyga ishtirokchilari (5 ta)
  let startAt = 0, raceT0 = 0, resultsEnd = 0, firstFinishAt = 0, allFinAt = 0;
  let boxes = [];              // { until }
  let oils = [], oilId = 1;
  let lastTick = now();
  let stats = { records: {}, wins: {} };
  let saveT = null;

  try { const j = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); if (j && typeof j === 'object') stats = { records: j.records || {}, wins: j.wins || {} }; } catch { /* yangi */ }
  function saveStats() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try { fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true }); fs.writeFileSync(STATS_FILE, JSON.stringify(stats)); } catch { /* disk yozilmasa ham o'yin davom etadi */ }
    }, 500);
  }

  const humans = () => seats.filter((s) => s.ws && s.ws.readyState === 1);
  function send(ws, o) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(o)); } catch { /* ignore */ } } }
  function broadcast(o) { const s = JSON.stringify(o); for (const st of seats) if (st.ws && st.ws.readyState === 1) { try { st.ws.send(s); } catch { /* ignore */ } } }

  // ---------------- Kutish zali ----------------
  function lobbyMsg() {
    const rec = stats.records[TRACKS[trackId].id] || null;
    return {
      t: 'lobby', ph: phase, track: trackId, mode: modeId, by: lastChanger,
      seats: seats.map((s) => ({ id: s.id, taken: !!(s.ws && s.ws.readyState === 1), color: s.color, ready: s.ready })),
      rec, wins: stats.wins,
    };
  }
  const sendLobby = () => broadcast(lobbyMsg());

  function allReady() {
    const h = humans();
    return h.length > 0 && h.every((s) => s.ready);
  }

  // ---------------- Poyga boshlanishi ----------------
  function colorFor(i, used) {
    let c = DEFAULT_COLOR[i];
    if (used.has(c)) c = COLORS.findIndex((_, k) => !used.has(k));
    return c;
  }
  function startRace() {
    track = TRACKS[trackId]; laps = MODES[modeId].laps;
    const hs = humans();
    const used = new Set(hs.map((s) => s.color));
    // slotlar tasodifiy
    const order = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5);
    entries = seats.map((s) => {
      const human = !!(s.ws && s.ws.readyState === 1);
      let color = s.color;
      if (!human) { color = colorFor(s.id, used); used.add(color); }
      const e = {
        id: s.id, seat: s, human, name: human ? s.name : 'Bot · ' + CARS[s.id].name, color,
        slot: order[s.id], car: newCar(), pr: null, cum: 0, lap: 0, lapT0: 0, laps: [], best: 0, fin: 0, finT: 0, rank: 0,
        item: -1, shieldUntil: 0, slipUntil: 0, fogUntil: 0, hornAt: 0, resetAt: 0, lastP: 0, strikes: 0, wrongT: 0, wrong: 0, fl: 0,
        brain: human ? null : newBrain(0.84 + Math.random() * 0.09, (Math.random() * 2 - 1) * 3.2), nitroOn: false, gone: false, speed: 0,
      };
      const g = track.grid(e.slot);
      e.car = newCar(g.x, g.z, g.h); e.pr = newProgress(track, g.x, g.z);
      e.cum = e.pr.cum;
      return e;
    });
    boxes = track.boxes.map(() => ({ until: 0 }));
    oils = [];
    startAt = now() + COUNT_MS; raceT0 = 0; firstFinishAt = 0; allFinAt = 0;
    phase = 'count';
    for (const s of seats) s.ready = false;
    broadcast({
      t: 'count', in: COUNT_MS, goIn: COUNT_MS, track: trackId, laps, mode: modeId,
      grid: entries.map((e) => { const g = track.grid(e.slot); return { id: e.id, x: r2(g.x), z: r2(g.z), h: r3(g.h), human: e.human ? 1 : 0, color: e.color, name: e.name }; }),
    });
    console.log(`[poyga] poyga boshlandi: ${track.name}, ${laps} aylana, ${hs.length} odam + ${5 - hs.length} bot`);
  }

  function goRace() {
    phase = 'race'; raceT0 = now();
    for (const e of entries) { e.lapT0 = 0; e.lastP = raceT0; }
    broadcast({ t: 'go' });
  }

  // ---------------- Poyga davomida ----------------
  const eById = (id) => entries.find((e) => e.id === id);
  const raceTime = () => (phase === 'race' || phase === 'results' ? now() - raceT0 : now() - startAt);

  function ranking() {
    const list = entries.slice().sort((a, b) => {
      if (a.fin && b.fin) return a.finT - b.finT;
      if (a.fin) return -1; if (b.fin) return 1;
      return b.cum - a.cum;
    });
    list.forEach((e, i) => { e.rank = i + 1; });
    return list;
  }

  function trackProgress(e, t) {
    // lap va finish
    const lapIdx = Math.max(0, Math.floor(e.cum / track.L));
    if (!e.fin && lapIdx > e.lap) {
      const rt = t - raceT0;
      const lt = rt - e.lapT0; e.lapT0 = rt; e.laps.push(lt);
      if (!e.best || lt < e.best) e.best = lt;
      e.lap = lapIdx;
      if (e.human) send(e.seat.ws, { t: 'lap', n: lapIdx, ms: Math.round(lt), best: Math.round(e.best) });
    }
    if (!e.fin && e.cum >= laps * track.L) {
      e.fin = 1; e.finT = t - raceT0 - Math.round(((e.cum - laps * track.L) / Math.max(e.speed, 8)) * 1000);
      if (e.human && !firstFinishAt) firstFinishAt = t;
      if (e.human) send(e.seat.ws, { t: 'fin', ms: Math.round(e.finT) });
      if (e.brain) e.brain.skill = 0.55;
    }
  }

  function stepBots(dtTotal) {
    const bots = entries.filter((e) => !e.human);
    let rem = dtTotal;
    while (rem > 1e-6) {
      const dt = Math.min(rem, 1 / 60); rem -= dt;
      for (const e of bots) {
        const others = entries.filter((o) => o !== e).map((o) => o.car);
        const inp = aiInputs(e.car, e.brain, track, dt, others);
        stepCar(e.car, inp, dt, track);
        e.car.hit = 0;
        e.nitroOn = e.car.nOn;
        e.fl = (inp.brake > 0.3 ? F_BRAKE : 0) | (e.car.nOn ? F_NITRO : 0) | (e.car.drift ? F_DRIFT : 0) | (e.car.boost > 0 ? F_BOOST : 0) | (e.car.slip > 0 ? F_SLIP : 0);
        // bot qotib qolsa yo'lga qaytariladi
        if (inp.stuck > 6) { const p = track.at(e.pr.s, 0); e.car.x = p.x; e.car.z = p.z; e.car.h = p.h; e.car.vx = e.car.vz = 0; e.brain.stuck = 0; }
      }
      // mashinalar to'qnashuvi (botlar suriladi)
      for (const e of bots) for (const o of entries) if (o !== e) carPush(e.car, o.car, 0.5);
    }
    for (const e of bots) {
      const r = advanceProgress(track, e.pr, e.car.x, e.car.z);
      if (r.ok) e.cum = e.pr.cum;
      e.speed = Math.hypot(e.car.vx, e.car.vz);
    }
  }

  function chooseItem(e, rank) {
    const w = rank === 1 ? [10, 30, 0, 35] : rank <= 2 ? [25, 25, 20, 30] : [40, 20, 25, 15];
    let sum = w.reduce((a, b) => a + b, 0), r = Math.random() * sum;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
    return 0;
  }

  function checkBoxes(t) {
    const rk = ranking();
    for (const e of entries) {
      if (!e.human || e.item >= 0 || e.fin) continue;
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].until > t) continue;
        const b = track.boxes[i];
        if (Math.hypot(e.car.x - b.x, e.car.z - b.z) < 2.6) {
          boxes[i].until = t + ITEM_RESPAWN_MS;
          e.item = chooseItem(e, rk.indexOf(e) + 1);
          send(e.seat.ws, { t: 'item', i: e.item, box: i });
          break;
        }
      }
    }
  }

  function hitBy(e, kind, t) {
    // qalqon: bitta zarbani yutadi
    if (e.shieldUntil > t) { e.shieldUntil = 0; if (e.human) send(e.seat.ws, { t: 'fx', k: 'shieldbreak' }); return false; }
    if (kind === 'slip') {
      e.slipUntil = t + SLIP_MS + 1200;
      if (e.human) send(e.seat.ws, { t: 'fx', k: 'slip', ms: SLIP_MS });
      else { e.car.slip = SLIP_MS / 1000; e.car.slipDir = Math.random() < 0.5 ? -1 : 1; e.car.vx *= 0.6; e.car.vz *= 0.6; }
    } else if (kind === 'fog') {
      if (e.human) send(e.seat.ws, { t: 'fx', k: 'fog', ms: FOG_MS });
    }
    return true;
  }

  function checkOil(t) {
    oils = oils.filter((o) => o.until > t);
    for (let k = oils.length - 1; k >= 0; k--) {
      const o = oils[k];
      for (const e of entries) {
        if (e.slipUntil > t || e.fin) continue;
        if (e.id === o.owner && t - o.born < 2500) continue;
        if (Math.hypot(e.car.x - o.x, e.car.z - o.z) < 2.6) {
          hitBy(e, 'slip', t);
          oils.splice(k, 1);
          break;
        }
      }
    }
  }

  function useItem(e) {
    if (phase !== 'race' || e.item < 0) return;
    const t = now(), it = e.item; e.item = -1;
    if (it === 0) send(e.seat.ws, { t: 'fx', k: 'boost', ms: BOOST_MS });
    else if (it === 1) { e.shieldUntil = t + SHIELD_MS; send(e.seat.ws, { t: 'fx', k: 'shield', ms: SHIELD_MS }); }
    else if (it === 2) {
      let n = 0;
      for (const o of entries) if (o !== e && o.cum > e.cum && !o.fin) { hitBy(o, 'fog', t); n++; }
      if (!n) send(e.seat.ws, { t: 'msg', m: 'Oldingda hech kim yo\'q edi' });
    } else if (it === 3) {
      const c = e.car, fx = Math.sin(c.h), fz = Math.cos(c.h);
      oils.push({ id: oilId++, x: c.x - fx * 3.6, z: c.z - fz * 3.6, owner: e.id, born: t, until: t + OIL_LIFE_MS });
    }
  }

  function snapshot(t) {
    const rk = ranking();
    let bm = 0; for (let i = 0; i < boxes.length; i++) if (boxes[i].until <= t) bm |= (1 << i);
    return {
      t: 's', rt: Math.round(raceTime()), ph: phase, bx: bm,
      p: entries.map((e) => [
        e.id, r2(e.car.x), r2(e.car.z), r3(e.car.h), r2(e.speed || 0),
        e.fl | (e.hornAt > t ? F_HORN : 0), r3(e.cum / track.L), rk.indexOf(e) + 1, e.fin ? 1 : 0, e.shieldUntil > t ? 1 : 0, e.lap, e.human ? 1 : 0,
      ]),
      o: oils.map((o) => [o.id, r2(o.x), r2(o.z)]),
    };
  }

  function endRace(reason) {
    const rk = ranking();
    const rows = rk.map((e, i) => ({
      id: e.id, name: e.name, bot: e.human ? 0 : 1, color: e.color, pos: i + 1, fin: e.fin ? 1 : 0,
      ms: e.fin ? Math.round(e.finT) : 0, best: Math.round(e.best || 0), lap: e.lap, prog: r3(e.cum / track.L),
    }));
    // rekord va g'alabalar (faqat odamlar)
    let newRec = null;
    const w = rk[0];
    if (w && w.fin && w.human) { stats.wins[w.name] = (stats.wins[w.name] || 0) + 1; }
    for (const e of rk) {
      if (!e.human || !e.best) continue;
      const cur = stats.records[track.id];
      if (!cur || e.best < cur.ms) { stats.records[track.id] = { ms: Math.round(e.best), name: e.name }; newRec = { id: e.id, ms: Math.round(e.best) }; }
    }
    saveStats();
    phase = 'results'; resultsEnd = now() + RESULTS_MS;
    broadcast({ t: 'results', rows, track: trackId, laps, newRec, rec: stats.records[track.id] || null, wins: stats.wins, in: RESULTS_MS, reason });
    console.log(`[poyga] poyga tugadi (${reason}): g'olib ${w && w.name}`);
  }

  function toLobby() {
    phase = 'lobby'; entries = []; oils = [];
    for (const s of seats) s.ready = false;
    sendLobby();
  }

  // ---------------- Asosiy sikl ----------------
  function tick() {
    const t = now(), dt = Math.min(0.12, (t - lastTick) / 1000); lastTick = t;
    if (phase === 'lobby') {
      if (allReady()) startRace();
    } else if (phase === 'count') {
      if (humans().length === 0) { toLobby(); return; }
      if (t >= startAt) goRace();
    } else if (phase === 'race') {
      stepBots(dt);
      for (const e of entries) { if (e.human) e.speed = e.speed || 0; trackProgress(e, t); }
      checkBoxes(t); checkOil(t);
      broadcast(snapshot(t));
      const hs = entries.filter((e) => e.human && !e.gone);
      const liveHumans = humans().length;
      if (liveHumans === 0) { toLobby(); return; }
      const allFin = hs.length > 0 && hs.every((e) => e.fin || !e.seat.ws || e.seat.ws.readyState !== 1);
      if (allFin) {
        // odamlar tugatdi: botlarga ham tugatish uchun qisqa fursat (eng ko'pi bilan 7 soniya)
        if (!allFinAt) allFinAt = t;
        if (entries.every((e) => e.fin) || t - allFinAt > 7000) endRace('hamma tugatdi');
      }
      else if (firstFinishAt && t - firstFinishAt > FINISH_WAIT_MS) endRace('vaqt tugadi');
      else if (t - raceT0 > 14 * 60 * 1000) endRace('juda uzoq');
    } else if (phase === 'results') {
      if (t >= resultsEnd) toLobby();
    }
  }
  setInterval(tick, TICK_MS);

  // ---------------- Xabarlar ----------------
  function onPos(e, m) {
    if (phase !== 'race') return;
    const t = now();
    if (![m.x, m.z, m.h, m.vx, m.vz].every(isNum)) return;
    const dtMs = Math.max(10, t - (e.lastP || t));
    const maxMove = PHYS.VMAX * 1.5 * (dtMs / 1000) + 7;
    const c = e.car;
    const moved = Math.hypot(m.x - c.x, m.z - c.z);
    const bad = moved > maxMove || Math.hypot(m.vx, m.vz) > PHYS.VMAX * 1.7;
    e.lastP = t;
    if (bad) { e.strikes++; if (e.strikes <= 2 || t - e.resetAt > 1500) doReset(e, true); return; }
    // tashqi tekshiruv: devordan tashqarida bo'lmasin
    const q = track.query(m.x, m.z, e.pr.i);
    if (q.ad > WALL + 2) { doReset(e, true); return; }
    const prev = e.pr.cum;
    const r = advanceProgress(track, e.pr, m.x, m.z);
    if (!r.ok) { doReset(e, true); return; }
    e.cum = e.pr.cum;
    c.x = m.x; c.z = m.z; c.h = m.h; c.vx = m.vx; c.vz = m.vz;
    e.speed = Math.hypot(m.vx, m.vz);
    // teskari yo'nalish
    const fwd = m.vx * r.q.tx + m.vz * r.q.tz;
    if (fwd < -4) e.wrongT += dtMs; else e.wrongT = Math.max(0, e.wrongT - dtMs * 2);
    const wrong = e.wrongT > 1200;
    e.fl = (isNum(m.fl) ? (m.fl & (F_BRAKE | F_NITRO | F_DRIFT | F_BOOST | F_SLIP | F_OFF)) : 0) | (wrong ? F_WRONG : 0);
    void prev;
  }

  function doReset(e, forced) {
    const t = now();
    if (!forced && t - e.resetAt < 2000) return;
    e.resetAt = t;
    const p = track.at(e.pr.s, 0);
    e.car.x = p.x; e.car.z = p.z; e.car.h = p.h; e.car.vx = e.car.vz = 0;
    e.pr = newProgress(track, p.x, p.z); e.pr.cum = e.cum; e.pr.s = track.query(p.x, p.z, -1).s;
    e.lastP = t;
    send(e.seat.ws, { t: 'reset', x: r2(p.x), z: r2(p.z), h: r3(p.h) });
  }

  function onMessage(ws, text) {
    let m; try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const s = ws.seat;
    const t = now();
    switch (m.t) {
      case 'join': {
        const idx = NAMES.indexOf(m.name);
        if (idx < 0) return send(ws, { t: 'err', m: 'Noma\'lum ism' });
        const seat = seats[idx];
        if (seat.ws && seat.ws !== ws && seat.ws.readyState === 1) return send(ws, { t: 'err', m: 'Bu ism band' });
        if (ws.seat && ws.seat !== seat) { ws.seat.ws = null; ws.seat.ready = false; }
        seat.ws = ws; ws.seat = seat; seat.ready = false;
        console.log(`[poyga +] ${seat.name} (${humans().length}/5)`);
        send(ws, { t: 'welcome', id: idx, ph: phase });
        // poyga ketayotgan bo'lsa: tomosha qilish uchun holat
        if (phase !== 'lobby' && entries.length) {
          send(ws, { t: 'count', in: Math.max(0, startAt - t), track: trackId, laps, mode: modeId, late: 1,
            grid: entries.map((e) => { const g = track.grid(e.slot); return { id: e.id, x: r2(g.x), z: r2(g.z), h: r3(g.h), human: e.human ? 1 : 0, color: e.color, name: e.name }; }) });
          if (phase === 'race') send(ws, { t: 'go', late: 1 });
        }
        sendLobby();
        break;
      }
      case 'cfg': {
        if (!s) return;
        if (phase === 'lobby' && isNum(m.track) && m.track >= 0 && m.track < TRACKS.length) { trackId = m.track | 0; lastChanger = s.name; for (const x of seats) x.ready = false; }
        if (phase === 'lobby' && isNum(m.mode) && m.mode >= 0 && m.mode < MODES.length) { modeId = m.mode | 0; lastChanger = s.name; for (const x of seats) x.ready = false; }
        if (phase === 'lobby' && isNum(m.color) && m.color >= 0 && m.color < COLORS.length) {
          const c = m.color | 0;
          const clash = seats.some((x) => x !== s && x.ws && x.ws.readyState === 1 && x.color === c);
          if (clash) send(ws, { t: 'msg', m: 'Bu rangni boshqa o\'yinchi tanlagan' });
          else s.color = c;
        }
        sendLobby();
        break;
      }
      case 'ready':
        if (!s || phase !== 'lobby') return;
        s.ready = !!m.v; sendLobby();
        break;
      case 'p': {
        if (!s) return;
        const e = entries.find((x) => x.seat === s && x.human);
        if (e) onPos(e, m);
        break;
      }
      case 'use': { const e = s && entries.find((x) => x.seat === s && x.human); if (e) useItem(e); break; }
      case 'reset': { const e = s && entries.find((x) => x.seat === s && x.human); if (e && phase === 'race') doReset(e, false); break; }
      case 'horn': {
        const e = s && entries.find((x) => x.seat === s && x.human);
        if (e && t - e.hornAt > 900) { e.hornAt = t + 600; broadcast({ t: 'horn', id: e.id }); }
        break;
      }
      case 'q': send(ws, { t: 'q', ts: m.ts }); break;
      case 'l': // menyuga qaytish
        if (s) { s.ready = false; sendLobby(); }
        break;
      default: break;
    }
  }

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (d) => { try { onMessage(ws, d.toString()); } catch (err) { console.error('[poyga] xato:', err); } });
    ws.on('close', () => {
      const s = ws.seat;
      if (s && s.ws === ws) {
        s.ws = null; s.ready = false;
        const e = entries.find((x) => x.seat === s && x.human);
        if (e) {
          e.human = false; e.gone = true; e.brain = newBrain(0.8, 0); e.name = 'Bot · ' + CARS[e.id].name;
          e.car.vf = e.car.vx * Math.sin(e.car.h) + e.car.vz * Math.cos(e.car.h); e.car.steer = 0; e.car.qi = -1;
        }   // ketgan o'yinchi o'rniga bot yuradi
        console.log(`[poyga -] ${s.name} (${humans().length}/5)`);
        sendLobby();
      }
    });
    ws.on('error', () => {});
    send(ws, lobbyMsg());
  });
  setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    }
  }, 6000);

  return {
    handleUpgrade(req, socket, head) { wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req)); },
    _debug: () => ({ phase, entries, seats }),
  };
}
