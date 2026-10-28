// Poyga — asosiy klient
import * as THREE from '../vendor/three.module.min.js';
import { TRACKS, ROAD_HALF } from './shared/track.js';
import { PHYS, newCar, stepCar, carPush, maxYaw, angDiff } from './shared/car.js';
import { NAMES, CARS, COLORS, MODES, ITEMS, DEFAULT_COLOR } from './shared/consts.js';
import { createCar, setCarEnv } from './js/cars.js';
import { makeEnvironment } from './js/util.js';
import { buildWorld, THEME_ENV } from './js/world.js';
import { Fx } from './js/fx.js';
import * as A from './js/audio.js';
import { Input } from './js/input.js';
import { DEFAULT_SERVER } from './config.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const qs = new URLSearchParams(location.search);
const isTouch = qs.get('touch') === '1' || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const cap = window.Capacitor;
const isNative = !!(cap && cap.getPlatform && cap.getPlatform() !== 'web') || location.protocol === 'file:' ||
  (location.hostname === 'localhost' && location.port === '' );
if (isTouch) document.body.classList.add('touch');

const STEP = 1 / 60;
const INTERP_MS = 130;
const F = { BRAKE: 1, NITRO: 2, DRIFT: 4, BOOST: 8, SLIP: 16, OFF: 32, HORN: 64, WRONG: 128 };

// ---------------- Sozlamalar ----------------
const store = {
  get(k, d) { try { const v = localStorage.getItem('pg_' + k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pg_' + k, String(v)); } catch { /* ignore */ } },
};
const settings = {
  steer: store.get('steer', 'btn'), tilt: parseFloat(store.get('tilt', '32')), inv: store.get('inv', '0') === '1', zero: parseFloat(store.get('zero', '0')),
  cam: parseInt(store.get('cam', '0'), 10) || 0, vol: parseFloat(store.get('vol', '0.9')), q: store.get('q', 'auto'),
  server: store.get('server', ''), name: store.get('name', ''),
};
function saveSettings() {
  store.set('steer', settings.steer); store.set('tilt', settings.tilt); store.set('inv', settings.inv ? 1 : 0); store.set('zero', settings.zero);
  store.set('cam', settings.cam); store.set('vol', settings.vol); store.set('q', settings.q); store.set('server', settings.server); store.set('name', settings.name);
}

// ---------------- Holat ----------------
const S = {
  phase: 'name',            // name | lobby | count | race | results
  wsOK: false, id: -1, name: '', srvPhase: 'lobby',
  lobby: null, trackIdx: 0, modeIdx: 0, laps: 3,
  spectate: false, specTarget: -1,
  cars: new Map(), carList: [],
  me: null, prev: null, acc: 0, meId: -1,
  snaps: [], lastSnap: null, snapMine: null,
  raceRT: 0, raceRTat: 0, goAt: 0, countShown: -1,
  item: -1, finished: false, fogUntil: 0, shieldUntil: 0, lastWrongBeep: 0,
  lastLap: 0, bestLap: 0, lapN: 0,
  shake: 0, camYaw: 0, camPos: new THREE.Vector3(), camInit: false, fov: 66, intro: 0,
  stuckT: 0, lastVf: 0, accS: 0, lastSend: 0, hornAt: 0, lastHit: 0, menuOpen: false, ready: false, pings: 0, ping: 0,
  results: null, resultsAt: 0, boardKey: '', toastT: 0, camMode: settings.cam,
};

// ---------------- Three.js ----------------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
let pixelRatio = 1, prMax = 1, prMin = 0.6;
function qualityParams() {
  const dpr = window.devicePixelRatio || 1;
  switch (settings.q) {
    case 'low': return { world: 0.5, pr: Math.min(dpr, 0.8), fx: 0.5, auto: false };
    case 'mid': return { world: 0.8, pr: Math.min(dpr, 1.1), fx: 0.8, auto: false };
    case 'high': return { world: 1, pr: Math.min(dpr, 1.75), fx: 1, auto: false };
    default: return isTouch ? { world: 0.8, pr: Math.min(dpr, 1.1), fx: 0.8, auto: true } : { world: 1, pr: Math.min(dpr, 1.5), fx: 1, auto: true };
  }
}
let QP = qualityParams();
function applyQuality() { QP = qualityParams(); prMax = QP.pr; pixelRatio = QP.pr; resize(); }
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  const bs = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (fx) fx.setScale(bs.y * 0.8);
}
let scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.4, 2600);
let world = null, fx = null, envTex = null;
let curTrack = null, worldKey = '';

function setTrack(idx, force = false, noCars = false) {
  const key = idx + ':' + settings.q;
  if (world && key === worldKey && !force) return;
  worldKey = key;
  S.trackIdx = idx; curTrack = TRACKS[idx];
  if (fx) { fx.dispose(); fx = null; }
  if (world) { world.dispose(); world = null; }
  if (envTex) { envTex.dispose(); envTex = null; }
  for (const c of S.cars.values()) disposeCar(c);
  S.cars.clear();
  scene = new THREE.Scene();
  envTex = makeEnvironment(renderer, THEME_ENV(curTrack.theme));
  scene.environment = envTex; setCarEnv(envTex);
  world = buildWorld(scene, curTrack, { quality: QP.world, env: envTex });
  fx = new Fx(scene, QP.fx); resize();
  mapCache = null;
  // mashinalarni qayta yaratamiz (muhit aksi uchun)
  if (S.carList.length && !noCars) buildCars(S.carList, true);
}

// ---------------- Mashinalar ----------------
const shadowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 3, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.62)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
})();
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });

function disposeCar(c) { scene.remove(c.model.root); c.model.root.traverse((o) => { if (o.geometry && o.geometry.type !== 'PlaneGeometry') o.geometry.dispose(); }); try { c.model.paint.dispose(); } catch { /* ignore */ } }
function buildCars(list, racing) {
  for (const c of S.cars.values()) disposeCar(c);
  S.cars.clear();
  S.carList = list;
  for (const it of list) {
    const model = createCar(CARS[it.id].id, COLORS[it.color].hex);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(CARS[it.id].wid * 1.9, CARS[it.id].len * 1.35), shadowMat);
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.045; blob.renderOrder = 1; model.root.add(blob);
    model.root.position.set(it.x, 0, it.z); model.root.rotation.y = it.h;
    scene.add(model.root);
    S.cars.set(it.id, { id: it.id, model, color: it.color, name: it.name, human: !!it.human, x: it.x, z: it.z, h: it.h, speed: 0, fl: 0, steer: 0, ph: it.h, rank: it.id + 1, lap: 0, fin: 0, shield: 0, vx: 0, vz: 0, smokeT: 0, prevH: it.h });
  }
  void racing;
}
function carShortName(c) { return c.human ? c.name : CARS[c.id].name + ' (bot)'; }

// ---------------- Tarmoq ----------------
let ws = null, reconnectT = 0;
function wsUrl() {
  let s = isNative ? (settings.server || DEFAULT_SERVER) : '';
  const q = qs.get('server'); if (q) s = q;
  if (!s) {
    if (isNative) return null;
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws2';
  }
  s = s.trim().replace(/\/+$/, '');
  if (/^wss?:\/\//.test(s)) { /* tayyor */ }
  else if (/^https:\/\//.test(s)) s = 'wss://' + s.slice(8);
  else if (/^http:\/\//.test(s)) s = 'ws://' + s.slice(7);
  else if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:|$)/.test(s)) s = 'ws://' + s;
  else s = 'wss://' + s;
  s = s.replace(/\/ws2?$/, '') + '/ws2';
  return s;
}
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function setStatus(t, err) { const e = $('status'); e.textContent = t; e.classList.toggle('err', !!err); }

function connect() {
  clearTimeout(reconnectT);
  const url = wsUrl();
  if (!url) { setStatus('Server manzilini kiriting va "Ulash" ni bosing', true); return; }
  if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(); } catch { /* ignore */ } }
  setStatus('Serverga ulanmoqda…');
  let sock;
  try { sock = new WebSocket(url); } catch { setStatus('Server manzili noto\'g\'ri', true); return; }
  ws = sock;
  ws.onopen = () => {
    S.wsOK = true; setStatus('Ulandi ✓'); $('conn').classList.add('hide');
    if (S.name) send({ t: 'join', name: S.name });
  };
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } onMsg(m); };
  ws.onclose = () => {
    S.wsOK = false;
    if (S.phase !== 'name') $('conn').classList.remove('hide'); else setStatus('Server bilan aloqa yo\'q. Qayta urinilmoqda…', true);
    reconnectT = setTimeout(connect, 1500);
  };
  ws.onerror = () => {};
}

function onMsg(m) {
  switch (m.t) {
    case 'lobby': onLobby(m); break;
    case 'welcome': onWelcome(m); break;
    case 'err': setStatus(m.m || 'Xato', true); if (S.phase === 'name') { S.name = ''; } break;
    case 'msg': toast(m.m); break;
    case 'count': onCount(m); break;
    case 'go': onGo(m); break;
    case 's': onSnap(m); break;
    case 'lap': onLap(m); break;
    case 'fin': onFin(m); break;
    case 'item': onItem(m); break;
    case 'fx': onFx(m); break;
    case 'reset': onReset(m); break;
    case 'horn': { const c = S.cars.get(m.id); if (c && m.id !== S.id) { const d = S.me ? Math.hypot(c.x - S.me.x, c.z - S.me.z) : 40; A.horn(d); } break; }
    case 'results': onResults(m); break;
    case 'q': S.ping = Math.round(performance.now() - m.ts); $('ping').textContent = S.ping + ' ms'; break;
    default: break;
  }
}

// ---------------- Ekranlar ----------------
const scr = { name: $('sName'), lobby: $('sLobby'), res: $('sRes'), set: $('sSet'), menu: $('sMenu') };
function showScreen(which) {
  for (const k of ['name', 'lobby', 'res']) scr[k].classList.toggle('hide', k !== which);
  const inGame = which === null;
  $('hud').classList.toggle('hide', which !== null);
  $('touch').classList.toggle('on', inGame && !S.spectate);
}

function toast(t, ms = 2200) {
  const e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(S.toastT); S.toastT = setTimeout(() => e.classList.remove('on'), ms);
}
let bannerT = 0;
function banner(html, cls = '', hold = false) {
  const b = $('banner'); b.className = ''; void b.offsetWidth; b.innerHTML = html;
  b.className = (hold ? 'hold ' : 'show ') + cls; clearTimeout(bannerT);
}
function bannerOff() { $('banner').className = ''; }

const fmt = (ms) => { if (!ms) return '—'; const t = Math.round(ms); const m = Math.floor(t / 60000), s = Math.floor(t / 1000) % 60, x = t % 1000; return m + ':' + String(s).padStart(2, '0') + '.' + String(x).padStart(3, '0'); };
const fmtS = (ms) => { const t = Math.max(0, Math.round(ms / 100) / 10), m = Math.floor(t / 60), s = (t % 60).toFixed(1); return m + ':' + (s.length < 4 ? '0' : '') + s; };

// ---- Ism tanlash ----
function buildNames() {
  const box = $('names'); box.innerHTML = '';
  NAMES.forEach((n, i) => {
    const b = document.createElement('button'); b.className = 'nb'; b.dataset.i = i;
    b.innerHTML = `<i class="sw" style="background:${COLORS[DEFAULT_COLOR[i]].hex};border:1px solid rgba(255,255,255,.5)"></i><b>${n}</b><span>${CARS[i].name}</span>`;
    b.onclick = () => { A.init(); chooseName(n); };
    box.appendChild(b);
  });
}
function updateNames() {
  const seats = S.lobby ? S.lobby.seats : [];
  document.querySelectorAll('#names .nb').forEach((b) => { const s = seats[+b.dataset.i]; b.classList.toggle('taken', !!(s && s.taken && +b.dataset.i !== S.id)); });
}
function chooseName(n) {
  if (!S.wsOK) { setStatus('Server bilan aloqa yo\'q', true); return; }
  S.name = n; settings.name = n; saveSettings();
  send({ t: 'join', name: n });
}

// ---- Kutish zali ----
function renderLobby() {
  const L = S.lobby; if (!L) return;
  const idx = S.id;
  // treklar
  const tc = $('tcards'); tc.innerHTML = '';
  const icons = { village: '🌾', desert: '🏜️', city: '🏙️' };
  TRACKS.forEach((t, i) => {
    const d = document.createElement('button'); d.className = 'tc' + (i === L.track ? ' sel' : '');
    const rec = i === L.track && L.rec ? `<div class="rec">Rekord<br><b>${fmt(L.rec.ms)}</b><br>${L.rec.name}</div>` : '';
    d.innerHTML = `<span class="ic">${icons[t.theme]}</span><div><b>${t.name}</b> <em class="km">${(t.L / 1000).toFixed(1)} km</em><span class="d">${t.desc}</span></div>${rec}`;
    d.onclick = () => { A.init(); A.click(); send({ t: 'cfg', track: i }); };
    tc.appendChild(d);
  });
  const md = $('modes'); md.innerHTML = '';
  MODES.forEach((m, i) => {
    const d = document.createElement('button'); d.className = 'md' + (i === L.mode ? ' sel' : '');
    d.innerHTML = `${m.name.replace(' poyga', '')}<small>${m.laps} aylana</small>`;
    d.onclick = () => { A.init(); A.click(); send({ t: 'cfg', mode: i }); };
    md.appendChild(d);
  });
  // rang
  const me = L.seats[idx];
  const taken = new Set(L.seats.filter((s, i) => i !== idx && s.taken).map((s) => s.color));
  $('mycar').innerHTML = `${NAMES[idx]} — ${CARS[idx].name} <span>· rangni tanla</span>`;
  const sw = $('swatches'); sw.innerHTML = '';
  COLORS.forEach((c, i) => {
    const d = document.createElement('button'); d.className = 'swc' + (me && me.color === i ? ' sel' : '') + (taken.has(i) ? ' taken' : ''); d.style.background = c.hex; d.title = c.name;
    d.onclick = () => { A.init(); A.click(); send({ t: 'cfg', color: i }); };
    sw.appendChild(d);
  });
  // o'yinchilar
  const st = $('seats'); st.innerHTML = '';
  L.seats.forEach((s, i) => {
    const r = document.createElement('div'); r.className = 'seat' + (i === idx ? ' me' : '');
    r.innerHTML = `<i class="dot" style="background:${COLORS[s.color].hex}"></i><span class="nm">${NAMES[i]} <small style="opacity:.65">· ${CARS[i].name}</small></span><span class="st">${s.taken ? (s.ready ? '' : 'online') : 'bot'}</span><span class="rd">${s.taken ? (s.ready ? '✅' : '⏳') : '🤖'}</span>`;
    st.appendChild(r);
  });
  // g'alabalar
  const w = L.wins || {}; const wl = NAMES.filter((n) => w[n]).sort((a, b) => w[b] - w[a]).map((n) => `${n}: ${w[n]}`).join(' · ');
  $('wins').innerHTML = `<h3>G'alabalar</h3>${wl || 'Hali yo\'q'}`;
  // tayyor tugmasi
  const rb = $('readyBtn'), inLobby = L.ph === 'lobby';
  rb.disabled = !inLobby; rb.style.opacity = inLobby ? 1 : 0.5;
  rb.textContent = !inLobby ? 'KUTING…' : (me && me.ready ? '✓ TAYYOR (bekor qilish)' : 'TAYYORMAN');
  rb.className = 'btn ' + (me && me.ready ? '' : 'ok');
  rb.style.minWidth = '210px';
  const waiting = L.seats.filter((s) => s.taken && !s.ready).map((s) => NAMES[s.id]);
  const bots = L.seats.filter((s) => !s.taken).length;
  $('linfo').innerHTML = !inLobby ? 'Hozir poyga yoki natijalar ketyapti. Tugagach kutish zaliga qaytasiz.'
    : (waiting.length ? `Kutilmoqda: <b>${waiting.join(', ')}</b><br>` : '') + `Hamma tayyor bo'lsa poyga boshlanadi. ${bots ? bots + ' ta joyga bot qo\'yiladi.' : ''}${L.by ? '<br>Oxirgi o\'zgartirgan: ' + L.by : ''}`;
  $('lconn').textContent = S.ping ? S.ping + ' ms' : '';
}

function onLobby(m) {
  S.lobby = m;
  updateNames();
  if (S.phase === 'name') { maybeAutoJoin(); return; }
  if (S.phase === 'results' && m.ph === 'lobby') { toLobbyPhase(); }
  if (S.phase === 'lobby') {
    if (m.track !== S.trackIdx) setTrack(m.track);
    S.modeIdx = m.mode;
    syncLobbyCars();
    renderLobby();
  }
}
function maybeAutoJoin() {
  if (S.name || !settings.name || !NAMES.includes(settings.name)) return;
  if (!isNative && !qs.get('auto')) return;
  const i = NAMES.indexOf(settings.name), s = S.lobby && S.lobby.seats[i];
  if (s && !s.taken) chooseName(settings.name);
}
function syncLobbyCars() {
  if (!S.lobby || !curTrack) return;
  const list = S.lobby.seats.map((s, i) => { const g = curTrack.grid(i); return { id: i, x: g.x, z: g.z, h: g.h, color: s.color, name: NAMES[i], human: s.taken ? 1 : 0 }; });
  const sig = list.map((l) => l.color + ':' + l.human).join(',') + '|' + S.trackIdx;
  if (sig === S.lobbySig && S.cars.size === 5) return;
  S.lobbySig = sig;
  buildCars(list, false);
}
function toLobbyPhase() {
  S.phase = 'lobby'; S.spectate = false; S.me = null; S.finished = false; bannerOff();
  $('wrong').classList.add('hide'); setFx(false);
  A.silence(); A.dropEngines();
  if (S.lobby) { if (S.lobby.track !== S.trackIdx) setTrack(S.lobby.track); S.lobbySig = ''; syncLobbyCars(); }
  world && world.setBoxes(-1); world && world.setOils([]); fx && fx.clear();
  S.acc = 0; S.snaps = []; S.camInit = false;
  showScreen('lobby'); $('sRes').classList.add('hide'); renderLobby();
}

function onWelcome(m) {
  S.id = m.id; S.srvPhase = m.ph; S.name = NAMES[m.id];
  $('lwho').textContent = '· ' + NAMES[m.id];
  setStatus('');
  if (m.ph === 'lobby' || m.ph === 'results') {
    // natijalar ketayotgan bo'lsa ham zalga kiramiz (tayyor tugmasi lobbi qaytguncha o'chiq turadi)
    if (!world || (S.lobby && S.lobby.track !== S.trackIdx)) setTrack(S.lobby ? S.lobby.track : 0);
    toLobbyPhase();
  } else {
    S.spectate = true; S.meId = -1;      // poyga ketayotgan paytda qo'shildik: tomosha (server 'count' yuboradi)
  }
}

// ---------------- Poyga boshlanishi ----------------
function onCount(m) {
  if (m.late && S.srvPhase === 'results') return;
  setTrack(m.track, false, true);
  S.laps = m.laps; S.modeIdx = m.mode;
  S.spectate = !!m.late || !m.grid.some((g) => g.id === S.id && g.human);
  const list = m.grid.map((g) => ({ id: g.id, x: g.x, z: g.z, h: g.h, color: g.color, name: g.name, human: g.human }));
  buildCars(list, true);
  S.phase = 'count'; S.finished = false; S.item = -1; S.fogUntil = 0; S.shieldUntil = 0; S.lapN = 0; S.lastLap = 0; S.bestLap = 0;
  S.snaps = []; S.lastSnap = null; S.snapMine = null; S.countShown = -1; S.boardKey = ''; S.stuckT = 0;
  S.goAt = performance.now() + m.in; S.intro = 0; S.camInit = false; S.camMode = settings.cam;
  world.setBoxes(-1); world.setOils([]); fx.clear();
  if (!S.spectate) {
    const g = m.grid.find((x) => x.id === S.id);
    S.me = newCar(g.x, g.z, g.h); S.meId = S.id; S.prev = { x: g.x, z: g.z, h: g.h }; S.acc = 0;
  } else { S.me = null; S.meId = -1; }
  S.specTarget = -1;
  showScreen(null);
  $('spec').classList.toggle('hide', !S.spectate); $('hud').classList.toggle('spec', S.spectate);
  if (S.spectate) $('spec').textContent = 'Tomosha rejimi — kamerani almashtirish: C / 📷';
  $('lap').textContent = 'AYLANA 1/' + S.laps;
  $('posof').textContent = '/5'; updateItemUI();
  if (!m.late) { banner('TAYYORLANING<small>' + TRACKS[m.track].name + ' · ' + S.laps + ' aylana</small>', '', true); }
  A.init(); setFx(false);
}
function onGo(m) {
  S.phase = 'race'; S.goAt = 0;
  if (!m.late) { banner('YURING!', 'go'); A.beep(true); }
  else banner('Poyga ketyapti', '');
}
function setFx(on) { void on; }

// ---------------- Snapshot ----------------
function onSnap(m) {
  const now = performance.now();
  S.raceRT = m.rt; S.raceRTat = now;
  const byId = new Map();
  for (const p of m.p) byId.set(p[0], p);
  S.snaps.push({ t: now, p: byId });
  if (S.snaps.length > 12) S.snaps.shift();
  S.lastSnap = byId;
  const mine = byId.get(S.id); if (mine) S.snapMine = mine;
  world && world.setBoxes(m.bx);
  world && world.setOils(m.o);
  for (const p of m.p) {
    const c = S.cars.get(p[0]); if (!c) continue;
    c.rank = p[7]; c.lap = p[10]; c.fin = p[8]; c.shield = p[9]; c.human = !!p[11]; c.prog = p[6]; c.fl = p[5];
    c.model.setShield(!!p[9]);
  }
}

function onLap(m) {
  S.lapN = m.n; S.lastLap = m.ms; S.bestLap = m.best;
  if (m.n < S.laps) { banner(`AYLANA ${m.n + 1}/${S.laps}<small>${fmt(m.ms)}${m.ms <= m.best ? ' · eng yaxshi!' : ''}</small>`, ''); A.lap(); }
}
function onFin(m) {
  S.finished = true; A.finish();
  const c = S.snapMine ? S.snapMine[7] : 0;
  banner(`TUGADI!<small>${c ? c + '-o\'rin · ' : ''}${fmt(m.ms)}</small>`, 'go', true);
  setTimeout(() => { if (S.phase === 'race') bannerOff(); }, 3500);
}
function onItem(m) {
  S.item = m.i; updateItemUI(); A.pickup();
  toast(`${ITEMS[m.i].icon} ${ITEMS[m.i].name}`, 1600);
  if (curTrack && fx) { const b = curTrack.boxes[m.box]; if (b) fx.burst(b.x, 1.4, b.z, [1, 0.85, 0.2]); }
}
function updateItemUI() {
  const has = S.item >= 0, ic = has ? ITEMS[S.item].icon : '—';
  $('itemic').textContent = ic; $('item').classList.toggle('has', has);
  $('titemic').textContent = ic; $('titem').classList.toggle('has', has);
}
function onFx(m) {
  const now = performance.now();
  if (m.k === 'boost') { if (S.me) S.me.boost = m.ms / 1000; A.useBoost(); $('boostov').classList.add('on'); setTimeout(() => $('boostov').classList.remove('on'), m.ms); S.shake = Math.max(S.shake, 0.4); }
  else if (m.k === 'shield') { S.shieldUntil = now + m.ms; A.useShield(); $('shieldov').classList.add('on'); setTimeout(() => $('shieldov').classList.remove('on'), m.ms); }
  else if (m.k === 'shieldbreak') { S.shieldUntil = 0; A.shieldBreak(); $('shieldov').classList.remove('on'); toast('🛡️ Qalqon sizni saqladi!'); }
  else if (m.k === 'fog') { S.fogUntil = now + m.ms; $('fogov').classList.add('on'); A.fogSound(); toast('🌫️ Tuman! Ko\'zingiz tushmayapti'); setTimeout(() => { if (performance.now() >= S.fogUntil - 50) $('fogov').classList.remove('on'); }, m.ms); }
  else if (m.k === 'slip') { if (S.me) { S.me.slip = m.ms / 1000; S.me.slipDir = Math.random() < 0.5 ? -1 : 1; } A.slipSound(); toast('🛢️ Moy dog\'i! Sirpandingiz'); }
}
function onReset(m) {
  if (!S.me) return;
  const me = S.me; me.x = m.x; me.z = m.z; me.h = m.h; me.vx = me.vz = 0; me.steer = 0; me.slip = 0; me.boost = 0; me.qi = -1; me.vf = 0; me.vl = 0;
  S.prev = { x: m.x, z: m.z, h: m.h }; S.camInit = false; S.stuckT = 0; A.reset(); toast('Yo\'lga qaytarildi', 1200);
}

function onResults(m) {
  S.phase = 'results'; S.results = m; S.resultsAt = performance.now() + m.in;
  A.silence(); A.dropEngines(); bannerOff();
  $('wrong').classList.add('hide'); $('fogov').classList.remove('on'); $('boostov').classList.remove('on'); $('shieldov').classList.remove('on');
  const tb = $('rrows'); tb.innerHTML = '';
  const meRow = m.rows.find((r) => r.id === S.id);
  $('rtitle').textContent = meRow && meRow.pos === 1 && meRow.fin && !meRow.bot ? '🏆 SIZ G\'OLIBSIZ!' : 'NATIJALAR';
  $('rsub').textContent = `${TRACKS[m.track].name} · ${m.laps} aylana` + (m.reason === 'vaqt tugadi' ? ' · vaqt tugadi' : '');
  for (const r of m.rows) {
    const tr = document.createElement('tr'); if (r.id === S.id) tr.className = 'me';
    const nm = r.bot ? CARS[r.id].name + ' (bot)' : r.name;
    tr.innerHTML = `<td class="p">${r.pos}</td><td><i class="dot" style="background:${COLORS[r.color].hex}"></i> ${nm}</td><td>${r.fin ? fmt(r.ms) : 'tugatmadi · ' + Math.max(0, Math.round(r.prog / m.laps * 100)) + '%'}</td><td>${fmt(r.best)}</td>`;
    tb.appendChild(tr);
  }
  $('rnew').textContent = m.newRec ? `🏁 YANGI REKORD! ${NAMES[m.newRec.id]} — ${fmt(m.newRec.ms)}` : '';
  showScreen('res'); $('hud').classList.add('hide'); $('touch').classList.remove('on');
  $('sMenu').classList.add('hide'); S.menuOpen = false;
  S.spectate = false;
}

// ---------------- Kirish ----------------
const input = new Input((act) => onAction(act));
function applyInputSettings() { input.mode = settings.steer; input.tiltRange = settings.tilt; input.tiltInv = settings.inv; input.tiltZero = settings.zero; $('steer').classList.toggle('tilt', settings.steer === 'tilt' && input.tiltOK); }
function onAction(act) {
  A.init();
  const inRace = (S.phase === 'race' || S.phase === 'count');
  if (act === 'menu') { if (inRace) toggleMenu(); return; }
  if (!inRace) return;
  if (act === 'cam') {
    if (S.spectate) { cycleSpec(); return; }
    S.camMode = (S.camMode + 1) % 2; settings.cam = S.camMode; saveSettings(); toast(S.camMode ? '📷 Kapot kamerasi' : '📷 Orqadan kamera', 1000); return;
  }
  if (S.spectate) return;
  if (act === 'item') { if (S.item >= 0 && S.phase === 'race') { send({ t: 'use' }); S.item = -1; updateItemUI(); } }
  else if (act === 'horn') { const n = performance.now(); if (n - S.hornAt > 900) { S.hornAt = n; send({ t: 'horn' }); A.horn(0); } }
  else if (act === 'reset') { if (S.phase === 'race') send({ t: 'reset' }); }
  else if (act === 'mute') { settings.vol = settings.vol > 0 ? 0 : 0.9; A.setVolume(settings.vol); toast(settings.vol ? 'Ovoz yoqildi' : 'Ovoz o\'chirildi', 900); }
}
function cycleSpec() {
  const ids = [...S.cars.keys()]; if (!ids.length) return;
  const i = ids.indexOf(S.specTarget); S.specTarget = ids[(i + 1) % ids.length];
  toast('Kuzatilmoqda: ' + carShortName(S.cars.get(S.specTarget)), 1200);
}
function toggleMenu(force) {
  S.menuOpen = force !== undefined ? force : !S.menuOpen;
  $('sMenu').classList.toggle('hide', !S.menuOpen);
  if (S.menuOpen) input.releaseAll();
}

// ---------------- Boshqa mashinalar (interpolatsiya) ----------------
function updateOthers(dt) {
  const now = performance.now(), rt = now - INTERP_MS;
  const sn = S.snaps; if (!sn.length) return;
  let a = null, b = null;
  for (let i = sn.length - 1; i >= 0; i--) { if (sn[i].t <= rt) { a = sn[i]; b = sn[i + 1] || null; break; } }
  if (!a) { a = sn[0]; b = null; }
  for (const [id, c] of S.cars) {
    if (id === S.meId && !S.spectate) continue;
    const pa = a.p.get(id); if (!pa) continue;
    const pb = b ? b.p.get(id) : null;
    let x, z, h, sp;
    if (pb && b.t > a.t) {
      const k = clamp((rt - a.t) / (b.t - a.t), 0, 1);
      x = lerp(pa[1], pb[1], k); z = lerp(pa[2], pb[2], k); h = pa[3] + angDiff(pb[3], pa[3]) * k; sp = lerp(pa[4], pb[4], k);
    } else {
      const ex = clamp((rt - a.t) / 1000, 0, 0.25); h = pa[3]; sp = pa[4];
      x = pa[1] + Math.sin(h) * sp * ex; z = pa[2] + Math.cos(h) * sp * ex;
    }
    const dh = angDiff(h, c.h);
    c.vx = (x - c.x) / Math.max(dt, 1e-3); c.vz = (z - c.z) / Math.max(dt, 1e-3);
    if (Math.hypot(c.vx, c.vz) > 130) { c.vx = Math.sin(h) * sp; c.vz = Math.cos(h) * sp; }
    c.x = x; c.z = z; c.h = h; c.speed = sp; c.fl = pa[5];
    const yawRate = dh / Math.max(dt, 1e-3);
    c.steer += (clamp(-yawRate / Math.max(0.25, maxYaw(sp)), -1, 1) - c.steer) * Math.min(1, dt * 8);
  }
}

// ---------------- Mashina vizuallari va effektlar ----------------
const _fw = new THREE.Vector3();
function carFx(c, dt, local, drive) {
  const spec = c.model.spec, L = spec.L, ax = spec.axle * L;
  const sh = Math.sin(c.h), ch = Math.cos(c.h);
  const lx = ch, lz = -sh;               // chap
  const sp = local ? Math.hypot(c.vx, c.vz) : c.speed;
  const fl = c.fl;
  const drifting = local ? c.drift : !!(fl & F.DRIFT);
  const off = local ? c.off : !!(fl & F.OFF);
  const braking = local ? drive.brake && c.vf > 22 : !!(fl & F.BRAKE) && sp > 22;
  const nitro = local ? (c.nOn || c.boost > 0) : !!(fl & (F.NITRO | F.BOOST));
  const slipping = local ? c.slip > 0 : !!(fl & F.SLIP);
  const sk = (drifting || braking || slipping) && !off && sp > 7;
  for (const s of [-1, 1]) {
    const wx = c.x - sh * ax + lx * s * spec.W * 0.4, wz = c.z - ch * ax + lz * s * spec.W * 0.4;
    fx.skid(c.id * 2 + (s > 0 ? 1 : 0), wx, wz, sk);
  }
  c.smokeT -= dt;
  if (c.smokeT <= 0) {
    if ((drifting || slipping) && sp > 9) { c.smokeT = 0.035; const s = Math.random() < 0.5 ? -1 : 1; fx.puff(c.x - sh * ax + lx * s * 0.7, c.z - ch * ax + lz * s * 0.7, c.vx || sh * sp, c.vz || ch * sp, 'smoke'); }
    else if (off && sp > 8) { c.smokeT = 0.03; const s = Math.random() < 0.5 ? -1 : 1; fx.puff(c.x - sh * ax + lx * s * 0.8, c.z - ch * ax + lz * s * 0.8, (c.vx || sh * sp), (c.vz || ch * sp), 'dust'); }
    else if (braking && sp > 30) { c.smokeT = 0.06; fx.puff(c.x - sh * ax, c.z - ch * ax, c.vx || 0, c.vz || 0, 'smoke'); }
  }
  c.model.setNitro(nitro);
  c.model.setBrake(local ? !!drive.brake : !!(fl & F.BRAKE));
  if (nitro) {
    const ex = c.x - sh * (L * 0.5 + 0.1) + lx * 0.38, ez = c.z - ch * (L * 0.5 + 0.1) + lz * 0.38;
    for (let i = 0; i < 2; i++) fx.flame(ex, 0.38, ez, -sh * 6, -ch * 6, !!(local ? c.boost > 0 : fl & F.BOOST));
  }
}

function placeCar(c, x, z, h, v, accel, lat, dt) {
  c.model.root.position.set(x, 0, z); c.model.root.rotation.y = h;
  c.model.update(v, c.steer, dt, accel, lat);
}

// ---------------- Fizika (mahalliy mashina) ----------------
function simStep(inp) {
  const me = S.me, track = curTrack;
  S.prev = { x: me.x, z: me.z, h: me.h };
  const racing = S.phase === 'race';
  const drive = racing ? inp : { steer: 0, gas: 0, brake: 0, nitro: false, drift: false };
  stepCar(me, drive, STEP, track);
  // boshqa mashinalar bilan to'qnashuv
  let impact = 0;
  for (const [id, c] of S.cars) {
    if (id === S.meId) continue;
    impact = Math.max(impact, carPush(me, { x: c.x, z: c.z, h: c.h, vx: c.vx, vz: c.vz }, c.human ? 0.6 : 1));
  }
  if (impact > 2.2 && performance.now() - S.lastHit > 250) {
    S.lastHit = performance.now(); A.thud(clamp(impact / 12, 0.3, 1)); S.shake = Math.max(S.shake, clamp(impact / 25, 0.1, 0.6));
    fx.spark(me.x, 0.6, me.z, me.vx, me.vz); fx.spark(me.x, 0.6, me.z, me.vx, me.vz);
  }
  if (me.hit > 2.5) {
    if (performance.now() - S.lastHit > 200) { S.lastHit = performance.now(); A.thud(clamp(me.hit / 14, 0.25, 1)); A.scrape(); S.shake = Math.max(S.shake, clamp(me.hit / 30, 0.1, 0.55)); $('hitflash').classList.add('on'); setTimeout(() => $('hitflash').classList.remove('on'), 60); for (let i = 0; i < 6; i++) fx.spark(me.x, 0.7, me.z, me.vx, me.vz); }
    me.hit = 0;
  } else me.hit = 0;
}

function sendPos(now) {
  if (S.phase !== 'race' || S.spectate || !S.me) return;
  if (now - S.lastSend < 48) return;
  S.lastSend = now;
  const m = S.me, inp = input.out;
  let fl = 0;
  if (inp.brake && m.vf > 1) fl |= F.BRAKE; if (m.nOn) fl |= F.NITRO; if (m.drift) fl |= F.DRIFT; if (m.boost > 0) fl |= F.BOOST; if (m.slip > 0) fl |= F.SLIP; if (m.off) fl |= F.OFF;
  const r = (v) => Math.round(v * 100) / 100;
  send({ t: 'p', x: r(m.x), z: r(m.z), h: Math.round(m.h * 1000) / 1000, vx: r(m.vx), vz: r(m.vz), fl });
}

// ---------------- Kamera ----------------
const _v = new THREE.Vector3(), _l = new THREE.Vector3();
function followTarget() {
  if (!S.spectate) return S.cars.get(S.meId);
  let t = S.specTarget >= 0 ? S.cars.get(S.specTarget) : null;
  if (!t) { for (const c of S.cars.values()) if (c.rank === 1) t = c; if (!t) t = S.cars.get(0); }
  return t;
}
function updateCamera(dt, now) {
  const t = followTarget();
  if (S.phase === 'name' || S.phase === 'lobby' || S.phase === 'results' || !t) { orbitCamera(now, t || S.cars.get(Math.max(0, S.id))); return; }
  const local = !S.spectate;
  const px = local ? lerp(S.prev.x, S.me.x, S.acc / STEP) : t.x, pz = local ? lerp(S.prev.z, S.me.z, S.acc / STEP) : t.z;
  const ph = local ? S.prev.h + angDiff(S.me.h, S.prev.h) * (S.acc / STEP) : t.h;
  const sp = local ? Math.hypot(S.me.vx, S.me.vz) : t.speed;
  const nitro = local ? (S.me.nOn || S.me.boost > 0) : !!(t.fl & (F.NITRO | F.BOOST));
  // intro: start oldidagi aylanma kamera
  const remain = S.phase === 'count' ? Math.max(0, S.goAt - now) : 0;
  if (S.phase === 'count' && remain > 2600) {
    S.intro = clamp(1 - (remain - 2600) / 3400, 0, 1);
    const a = ph + Math.PI * (0.75 - 0.75 * S.intro) + 0.9, r = lerp(9, 7.6, S.intro), hgt = lerp(3.2, 2.6, S.intro);
    camera.position.set(px + Math.sin(a) * r, hgt, pz + Math.cos(a) * r); camera.lookAt(px, 1.0, pz);
    camera.fov = 60; camera.updateProjectionMatrix(); S.camInit = false; S.camYaw = ph; S.camPos.copy(camera.position);
    return;
  }
  // yo'nalish
  let ty = ph;
  if (local && sp > 8 && !S.camMode) {
    const vy = Math.atan2(S.me.vx, S.me.vz);
    ty = ph + angDiff(vy, ph) * 0.45;
  }
  if (!S.camInit) { S.camYaw = ty; S.camInit = true; S.camPos.set(px - Math.sin(ty) * 6.8, 2.6, pz - Math.cos(ty) * 6.8); }
  const hood = S.camMode === 1 && local;
  S.camYaw += angDiff(ty, S.camYaw) * Math.min(1, dt * (hood ? 30 : 5.5));
  const fwx = Math.sin(S.camYaw), fwz = Math.cos(S.camYaw);
  let fovT;
  if (hood) {
    camera.position.set(px + Math.sin(ph) * 0.35, 1.18, pz + Math.cos(ph) * 0.35);
    _l.set(px + Math.sin(S.camYaw) * 30, 1.05, pz + Math.cos(S.camYaw) * 30);
    fovT = 74 + Math.min(10, sp * 0.14) + (nitro ? 6 : 0);
  } else {
    const dist = 6.6 + Math.min(1.8, sp * 0.03), hgt = 2.35 + Math.min(0.5, sp * 0.008);
    _v.set(px - fwx * dist, hgt, pz - fwz * dist);
    S.camPos.lerp(_v, Math.min(1, dt * 14)); // yumshoq ergashish
    // kamerani mashinaga juda yaqinlashib ketmasligi uchun minimal masofa
    const dx = S.camPos.x - px, dz = S.camPos.z - pz, d = Math.hypot(dx, dz);
    if (d < 4.8) { S.camPos.x = px + dx / (d || 1) * 4.8; S.camPos.z = pz + dz / (d || 1) * 4.8; }
    camera.position.copy(S.camPos);
    _l.set(px + fwx * 5.5, 1.15, pz + fwz * 5.5);
    fovT = 64 + Math.min(14, sp * 0.19) + (nitro ? 7 : 0);
  }
  S.fov += (fovT - S.fov) * Math.min(1, dt * 5);
  if (S.shake > 0.001) {
    const s = S.shake; camera.position.x += (Math.random() - 0.5) * s * 0.5; camera.position.y += (Math.random() - 0.5) * s * 0.35; camera.position.z += (Math.random() - 0.5) * s * 0.5; S.shake *= Math.exp(-dt * 6);
  }
  if (nitro && sp > 30) { camera.position.x += (Math.random() - 0.5) * 0.04; camera.position.y += (Math.random() - 0.5) * 0.03; }
  camera.lookAt(_l);
  if (Math.abs(camera.fov - S.fov) > 0.05) { camera.fov = S.fov; camera.updateProjectionMatrix(); }
}
function orbitCamera(now, t) {
  const g = curTrack ? curTrack.grid(0) : { x: 0, z: 0, h: 0 };
  let cx = g.x, cz = g.z; if (t) { cx = t.x; cz = t.z; }
  const a = now * 0.00021 + 0.6, r = S.phase === 'results' ? 10 : 9.5;
  camera.position.set(cx + Math.sin(a) * r, 2.7 + Math.sin(a * 1.3) * 0.5, cz + Math.cos(a) * r);
  camera.lookAt(cx, 0.9, cz);
  if (Math.abs(camera.fov - 52) > 0.1) { camera.fov = 52; camera.updateProjectionMatrix(); }
}

// ---------------- HUD ----------------
let mapCache = null, mapT = null;
function buildMap() {
  const tr = curTrack; if (!tr) return;
  const c = document.createElement('canvas'); c.width = c.height = 224; const g = c.getContext('2d');
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < tr.N; i++) { x0 = Math.min(x0, tr.X[i]); x1 = Math.max(x1, tr.X[i]); z0 = Math.min(z0, tr.Z[i]); z1 = Math.max(z1, tr.Z[i]); }
  const pad = 20, sc = (224 - pad * 2) / Math.max(x1 - x0, z1 - z0), ox = (224 - (x1 - x0) * sc) / 2, oz = (224 - (z1 - z0) * sc) / 2;
  // karta: yuqoriga = +z, chapga = +x emas, shuning uchun x ni teskari (bu yerda +x chap): ekran x = (x1 - x)
  const mx = (x) => ox + (x1 - x) * sc, my = (z) => 224 - (oz + (z - z0) * sc);
  g.lineCap = g.lineJoin = 'round';
  g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 11; g.beginPath(); for (let i = 0; i <= tr.N; i += 2) { const k = i % tr.N; if (i === 0) g.moveTo(mx(tr.X[k]), my(tr.Z[k])); else g.lineTo(mx(tr.X[k]), my(tr.Z[k])); } g.closePath(); g.stroke();
  g.strokeStyle = '#d9dde3'; g.lineWidth = 7; g.stroke();
  const p0 = tr.at(0, 0); g.fillStyle = '#ffc400'; g.beginPath(); g.arc(mx(p0.x), my(p0.z), 6, 0, 6.3); g.fill();
  mapCache = { img: c, mx, my };
}
function drawMap() {
  if (!curTrack) return;
  if (!mapCache) buildMap();
  const cv = $('mini'), g = cv.getContext('2d');
  g.clearRect(0, 0, 224, 224); g.drawImage(mapCache.img, 0, 0);
  const { mx, my } = mapCache;
  for (const c of S.cars.values()) {
    if (c.id === S.meId && !S.spectate) continue;
    g.fillStyle = COLORS[c.color].hex; g.strokeStyle = '#000'; g.lineWidth = 2.5; g.beginPath(); g.arc(mx(c.x), my(c.z), 7, 0, 6.3); g.stroke(); g.fill();
  }
  if (S.me && !S.spectate) {
    const c = S.cars.get(S.meId);
    g.fillStyle = c ? COLORS[c.color].hex : '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.arc(mx(S.me.x), my(S.me.z), 9, 0, 6.3); g.stroke(); g.fill();
  }
}
let hudT = 0;
function updateHud(now) {
  if (now - hudT < 66) return; hudT = now;
  const me = S.me, spectate = S.spectate;
  const c = spectate ? followTarget() : null;
  const speed = spectate ? (c ? c.speed : 0) : (me ? Math.hypot(me.vx, me.vz) : 0);
  $('spd').firstChild.nodeValue = Math.round(speed * 3.6);
  if (me && !spectate) { $('nfill').style.width = Math.round(me.nitro * 100) + '%'; $('nbar').classList.toggle('on', me.nOn || me.boost > 0); }
  const sm = S.snapMine;
  if (sm && !spectate) {
    $('posn').textContent = sm[7]; const lp = Math.min(S.laps, sm[10] + 1); $('lap').textContent = `AYLANA ${S.finished ? S.laps : lp}/${S.laps}`;
  } else if (spectate && c) { $('posn').textContent = c.rank; $('lap').textContent = `AYLANA ${Math.min(S.laps, c.lap + 1)}/${S.laps}`; }
  let rt = 0;
  if (S.phase === 'race') rt = S.raceRT + (performance.now() - S.raceRTat);
  $('time').textContent = fmtS(rt);
  $('lapinfo').textContent = S.lastLap ? `oxirgi ${fmt(S.lastLap)} · eng yaxshi ${fmt(S.bestLap)}` : '';
  // tartib jadvali
  const rows = [...S.cars.values()].sort((a, b) => a.rank - b.rank);
  const key = rows.map((r) => r.id + ':' + r.rank).join(',') + (spectate ? 's' : '');
  if (key !== S.boardKey) {
    S.boardKey = key; const bd = $('board'); bd.innerHTML = '';
    for (const r of rows) { const d = document.createElement('div'); if (r.id === S.meId && !spectate) d.className = 'me'; d.innerHTML = `<span class="n">${r.rank}</span><i class="dot" style="background:${COLORS[r.color].hex}"></i><span class="nm">${carShortName(r)}${r.fin ? ' 🏁' : ''}</span>`; bd.appendChild(d); }
  }
  // teskari yo'nalish
  const wrong = sm && (sm[5] & F.WRONG) && S.phase === 'race' && !spectate && !S.finished;
  $('wrong').classList.toggle('hide', !wrong);
  if (wrong && now - S.lastWrongBeep > 1500) { S.lastWrongBeep = now; A.wrong(); }
  // tezlik chiziqlari
  const sl = clamp((speed - 38) / 30, 0, 1) * 0.55 + (me && (me.nOn || me.boost > 0) ? 0.35 : 0);
  $('sl').style.opacity = String(clamp(sl, 0, 0.8));
  // tiklash maslahati
  if (S.phase === 'race' && me && !spectate && !S.finished) {
    if (speed < 1.5 && S.phase === 'race') S.stuckT += 0.066; else S.stuckT = 0;
    if (S.stuckT > 4 && S.stuckT < 4.1) toast(isTouch ? 'Qiyin bo\'lsa ↩ tugmasi yo\'lga qaytaradi' : 'Qiyin bo\'lsa R — yo\'lga qaytaradi', 2600);
  }
  // sanoq
  if (S.phase === 'count') {
    const remain = S.goAt - now;
    const n = remain <= 3000 ? Math.ceil(remain / 1000) : 99;
    if (n <= 3 && n >= 1 && n !== S.countShown) { S.countShown = n; banner(String(n), '', false); A.beep(false); }
  }
  if (S.phase === 'results') { const left = Math.max(0, Math.ceil((S.resultsAt - now) / 1000)); $('rback').textContent = `Kutish zaliga qaytish: ${left} s`; }
  $('steer').classList.toggle('tilt', input.mode === 'tilt' && input.tiltOK);
  drawMap();
}

// ---------------- Audio yangilash ----------------
function updateAudio(now) {
  if (!A.ok()) return;
  const racing = S.phase === 'race' || S.phase === 'count';
  if (!racing || document.hidden) { A.silence(); return; }
  const target = S.spectate ? followTarget() : null;
  const me = S.me;
  const speed = me && !S.spectate ? Math.hypot(me.vx, me.vz) : (target ? target.speed : 0);
  const e0 = A.getEngine(0);
  if (e0) e0.set(speed, S.phase === 'race' ? (input.out.gas || (me && me.nOn) ? 1 : 0.1) : (input.out.gas ? 0.9 : 0.1), me ? me.nOn : false, 1, 0);
  if (me && !S.spectate) {
    const slip = (me.drift ? clamp(Math.abs(me.vl) / 7, 0, 1) : 0) + (me.slip > 0 ? 0.8 : 0) + (input.out.brake && me.vf > 22 ? 0.5 : 0);
    A.ambient(speed, clamp(slip, 0, 1), me.off, me.nOn || me.boost > 0);
  } else A.ambient(speed * 0.5, 0, false, false);
  // boshqa dvigatellar: eng yaqin 3 ta
  const ref = S.spectate ? (target || { x: 0, z: 0 }) : me;
  if (ref) {
    const near = [...S.cars.values()].filter((c) => c.id !== S.meId || S.spectate).map((c) => ({ c, d: Math.hypot(c.x - ref.x, c.z - ref.z) })).filter((o) => o.c !== target).sort((a, b) => a.d - b.d).slice(0, 3);
    near.forEach((o, i) => {
      const en = A.getEngine(i + 1); if (!en) return;
      const g = clamp(1 - o.d / 70, 0, 1);
      // chap/o'ng: kameraga nisbatan
      const dx = o.c.x - camera.position.x, dz = o.c.z - camera.position.z, yaw = S.camYaw;
      const side = clamp(-(dx * Math.cos(yaw) - dz * Math.sin(yaw)) / 25, -1, 1);
      en.set(o.c.speed, 0.7, !!(o.c.fl & F.NITRO), g * g, side);
    });
  }
}

// ---------------- Asosiy sikl ----------------
let lastT = performance.now(), emaDt = 16, slowN = 0, fastN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = (now - lastT) / 1000, dt = Math.min(0.05, rdt); lastT = now;
  if (!world || !curTrack) return;
  // sifatni avtomatik sozlash
  if (QP.auto) {
    emaDt = emaDt * 0.95 + dt * 1000 * 0.05;
    if (emaDt > 24) { slowN++; fastN = 0; } else if (emaDt < 15) { fastN++; slowN = 0; } else { slowN = fastN = 0; }
    if (slowN > 70 && pixelRatio > prMin) { pixelRatio = Math.max(prMin, pixelRatio - 0.15); resize(); slowN = 0; }
    else if (fastN > 400 && pixelRatio < prMax) { pixelRatio = Math.min(prMax, pixelRatio + 0.1); resize(); fastN = 0; }
  }
  const inp = input.update();
  const play = S.phase === 'race' || S.phase === 'count' || S.phase === 'results';
  input.enabled = (S.phase === 'race' || S.phase === 'count') && !S.menuOpen;
  if (S.menuOpen) { inp.gas = inp.brake = 0; inp.steer = 0; inp.nitro = inp.drift = false; }

  // boshqalar
  if (play || S.phase === 'lobby') { if (S.snaps.length && play) updateOthers(dt); }
  // mahalliy fizika
  if (S.me && !S.spectate && play) {
    S.acc += Math.min(0.1, rdt); let n = 0;
    while (S.acc >= STEP && n < 7) { simStep(inp); S.acc -= STEP; n++; }
    if (n === 7) S.acc = 0;
    sendPos(now);
  }
  // vizual joylashtirish
  if (S.me && !S.spectate && play) {
    const c = S.cars.get(S.meId), m = S.me, a = S.acc / STEP;
    const x = lerp(S.prev.x, m.x, a), z = lerp(S.prev.z, m.z, a), h = S.prev.h + angDiff(m.h, S.prev.h) * a;
    if (c) {
      const ac = (m.vf - S.lastVf) / Math.max(dt, 0.001); S.lastVf = m.vf; S.accS += (clamp(ac, -60, 60) - S.accS) * Math.min(1, dt * 6);
      c.x = x; c.z = z; c.h = h; c.vx = m.vx; c.vz = m.vz; c.steer = m.steer; c.speed = Math.hypot(m.vx, m.vz); c.fl = 0;
      c.drift = m.drift; c.off = m.off; c.nOn = m.nOn; c.boost = m.boost; c.slip = m.slip; c.vf = m.vf;
      placeCar(c, x, z, h, m.vf, S.accS, m.steer * Math.max(0, m.vf) * 0.5, dt);
      c.model.setCabin(!(S.camMode === 1 && S.phase !== 'results'));
      if (fx) carFx(c, dt, true, inp);
    }
  } else if (S.phase === 'lobby') {
    for (const c of S.cars.values()) c.model.update(0, 0, dt);
  }
  if (play) {
    for (const [id, c] of S.cars) {
      if (id === S.meId && !S.spectate) continue;
      c.model.setCabin(true);
      const acc = 0;
      placeCar(c, c.x, c.z, c.h, c.speed, acc, c.steer * c.speed * 0.5, dt);
      if (fx) carFx(c, dt, false, null);
    }
  }
  // dvigatel ovozi uchun qo'shimcha
  updateCamera(dt, now);
  if (fx) fx.update(dt);
  world.update(now / 1000, camera.position);
  // kutish zalida natija ekranida mashinalar tinch turadi
  updateHud(now);
  updateAudio(now);
  renderer.render(scene, camera);
}

// ---------------- Sozlamalar oynasi ----------------
function bindSettings() {
  const seg = (id, get, set) => {
    const el = $(id); const sync = () => el.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', String(get()) === b.dataset.v));
    el.querySelectorAll('button').forEach((b) => { b.onclick = () => { set(b.dataset.v); saveSettings(); sync(); A.click(); }; }); sync(); return sync;
  };
  const sSteer = seg('setSteer', () => settings.steer, (v) => { settings.steer = v; applyInputSettings(); toggleTiltRows(); });
  seg('setCam', () => settings.cam, (v) => { settings.cam = +v; S.camMode = +v; });
  seg('setQ', () => settings.q, (v) => { settings.q = v; applyQuality(); if (curTrack) setTrack(S.trackIdx, true); if (S.phase === 'lobby') { S.lobbySig = ''; syncLobbyCars(); } });
  const tr = $('setTiltS'); tr.value = settings.tilt; tr.oninput = () => { settings.tilt = +tr.value; applyInputSettings(); saveSettings(); };
  const vol = $('setVol'); vol.value = settings.vol; vol.oninput = () => { settings.vol = +vol.value; A.setVolume(settings.vol); saveSettings(); };
  $('setInv').onclick = () => { settings.inv = !settings.inv; applyInputSettings(); saveSettings(); $('setInv').classList.toggle('sel', settings.inv); };
  $('setInv').classList.toggle('sel', settings.inv);
  $('setCal').onclick = () => { if (!input.tiltOK) { toast('Egish sensori topilmadi'); return; } settings.zero = input.calibrate(); applyInputSettings(); saveSettings(); $('setCal').textContent = 'Nol belgilandi ✓'; setTimeout(() => { $('setCal').textContent = 'Nol: hozirgi'; }, 1500); };
  const srv = $('setSrv'); srv.value = settings.server || DEFAULT_SERVER;
  $('rowSrv').classList.toggle('hide', !isNative);
  const toggleTiltRows = () => { $('rowTilt').classList.toggle('hide', settings.steer !== 'tilt'); $('rowTilt2').classList.toggle('hide', settings.steer !== 'tilt'); };
  toggleTiltRows(); void sSteer;
  $('setOk').onclick = () => {
    const v = srv.value.trim();
    if (isNative && v !== (settings.server || DEFAULT_SERVER)) { settings.server = v; saveSettings(); $('sSet').classList.add('hide'); connect(); }
    $('sSet').classList.add('hide'); A.init(); A.click();
    if (S.menuOpen) { /* menyu ochiq qoladi */ }
  };
  const open = () => { $('sSet').classList.remove('hide'); input.releaseAll(); };
  $('nameSet').onclick = open; $('lset').onclick = open; $('mSet').onclick = open;
  $('mResume').onclick = () => toggleMenu(false);
  $('mLeave').onclick = () => { toggleMenu(false); S.spectate = true; S.me = null; $('touch').classList.remove('on'); $('spec').classList.remove('hide'); $('hud').classList.add('spec'); $('spec').textContent = 'Tomosha rejimi — poyga tugashini kuting'; send({ t: 'l' }); try { ws.close(); } catch { /* ignore */ } };
  $('lname').onclick = () => { S.name = ''; settings.name = ''; saveSettings(); S.id = -1; try { ws.close(); } catch { /* ignore */ } S.phase = 'name'; showScreen('name'); updateNames(); };
  $('readyBtn').onclick = () => { A.init(); const me = S.lobby && S.lobby.seats[S.id]; send({ t: 'ready', v: me && me.ready ? 0 : 1 }); A.click(); };
  $('srvBtn').onclick = () => { settings.server = $('srv').value.trim(); saveSettings(); connect(); };
  if (isNative && !DEFAULT_SERVER) { $('srvrow').classList.remove('hide'); $('srv').value = settings.server; }
  if (qs.get('server')) { $('srvrow').classList.remove('hide'); $('srv').value = qs.get('server'); }
}

// ---------------- Ishga tushirish ----------------
function boot() {
  buildNames(); bindSettings(); applyQuality(); applyInputSettings();
  A.setVolume(settings.vol);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  document.addEventListener('pointerdown', () => A.init(), { once: false, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { A.silence(); input.releaseAll(); } else A.resume(); });
  setTrack(0);
  // menyu fonida boshlang'ich mashinalar
  const list = []; for (let i = 0; i < 5; i++) { const g = curTrack.grid(i); list.push({ id: i, x: g.x, z: g.z, h: g.h, color: DEFAULT_COLOR[i], name: NAMES[i], human: 0 }); }
  buildCars(list, false);
  showScreen('name');
  connect();
  setInterval(() => { if (S.wsOK) send({ t: 'q', ts: performance.now() }); }, 2500);
  requestAnimationFrame(frame);
  window.__poyga = { S, input, settings, send, onMsg, get world() { return world; }, get fx() { return fx; }, scene: () => scene, camera, renderer };
}
boot();
