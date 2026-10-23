// SARIQ HOVLI - asosiy klient: tarmoq, boshqaruv, otish, HUD
import * as THREE from './vendor/three.module.min.js';
import { NAMES, COLORS, WEAPONS, EYE, MAX_HP, KILL_LIMIT, ROUND_SEC } from './shared/consts.js';
import { stepPlayer } from './shared/physics.js';
import { buildWorld } from './js/world.js';
import { createPlayerModel, makeGun } from './js/models.js';
import * as A from './js/audio.js';
import { DEFAULT_SERVER } from './config.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const qs = new URLSearchParams(location.search);
const isTouch = qs.get('touch') === '1' || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const cap = window.Capacitor;
const isNative = !!(cap && cap.getPlatform && cap.getPlatform() !== 'web') || location.protocol === 'file:' ||
  (location.hostname === 'localhost' && location.port === '');

// ---------------- Sozlamalar ----------------
const store = {
  get(k, d) { try { const v = localStorage.getItem('sh_' + k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sh_' + k, String(v)); } catch { /* ignore */ } },
};
const settings = {
  sens: parseFloat(store.get('sens', '1')),
  quality: store.get('quality', isTouch ? 'mid' : 'high'),
  stats: store.get('stats', '1') === '1',
  server: store.get('server', ''),
  name: store.get('name', ''),
};

// ---------------- Holat ----------------
const S = { phase: 'menu', name: null, id: -1, wsOK: false, taken: [], lobbyOK: false, killer: -1, ping: 0, fps: 0, auto: qs.get('auto') };
const me = {
  x: 0, y: 0, z: 0, vy: 0, onGround: true, yaw: 0, pitch: 0, hp: MAX_HP, alive: true, inv: false,
  w: 1, ammo: WEAPONS.map((w) => w.mag), reloading: false, reloadStart: 0, reloadEnd: 0,
  nextFire: 0, rs: 0, zoom: false, deadAt: 0, stepT: 0, swT: 0,
};
let roundPhase = 'play', roundLeft = ROUND_SEC, winners = [];
let snapPlayers = [];
const others = new Map();

// ---------------- Render ----------------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: !isTouch, powerPreference: 'high-performance' });
} catch (e) {
  $('status').textContent = 'WebGL ishlamayapti. Brauzerni yangilang.';
  throw e;
}
renderer.autoClear = false;
const world = buildWorld();
const scene = world.scene;
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 700);
camera.rotation.order = 'YXZ';
scene.add(camera);

const gunScene = new THREE.Scene();
gunScene.add(new THREE.HemisphereLight(0xdfeaff, 0xb59a60, 1.4));
const gl = new THREE.DirectionalLight(0xffffff, 1.1); gl.position.set(-1, 2, 1.5); gunScene.add(gl);
const gunCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);

function applyQuality() {
  const dpr = window.devicePixelRatio || 1;
  const q = { low: 0.6, mid: 0.85, high: Math.min(dpr, 2) }[settings.quality] || 0.85;
  renderer.setPixelRatio(Math.min(dpr, q));
  onResize();
}
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  gunCam.aspect = w / h; gunCam.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

// ---------------- Birinchi shaxs qurol modeli ----------------
function flashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.35, 'rgba(255,200,80,0.8)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,230,150,.9)'; g.lineWidth = 3;
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 31, 32 + Math.sin(a) * 31); g.stroke(); }
  return new THREE.CanvasTexture(c);
}
const flashTex = flashTexture();
const vm = { root: new THREE.Group(), guns: [], flashes: [], kick: 0, flashT: 0, bob: 0, sw: 1 };
gunScene.add(vm.root);
vm.root.scale.setScalar(0.72);
const VM_POS = [[0.16, -0.17, -0.36], [0.2, -0.2, -0.42], [0.19, -0.22, -0.4]];
{
  const skin = new THREE.MeshLambertMaterial({ color: 0xe0ac86 });
  WEAPONS.forEach((wd, i) => {
    const g = makeGun(wd.id);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.1), skin); hand.position.set(0, -0.02, 0.0); g.add(hand);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.4), new THREE.MeshLambertMaterial({ color: 0x4a4f57 }));
    sleeve.position.set(0.04, -0.1, 0.3); sleeve.rotation.x = 0.35; g.add(sleeve);
    if (i > 0) {
      const lh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.1), skin); lh.position.set(-0.02, -0.03, i === 1 ? -0.42 : -0.3); g.add(lh);
      const ls = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.4), sleeve.material); ls.position.set(-0.1, -0.12, i === 1 ? -0.2 : -0.1); ls.rotation.set(0.28, -0.3, 0); g.add(ls);
    }
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    f.position.set(...g.userData.muzzle); f.visible = false; g.add(f);
    g.visible = false; vm.root.add(g); vm.guns.push(g); vm.flashes.push(f);
  });
}
function setVmWeapon(i) {
  vm.guns.forEach((g, k) => { g.visible = k === i; });
  vm.root.position.set(...VM_POS[i]);
  vm.sw = 0;
}

// ---------------- Effektlar: iz (tracer) va chang ----------------
const tracers = [];
const tracerMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.9, depthWrite: false });
const unitBox = new THREE.BoxGeometry(1, 1, 1);
for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(unitBox, tracerMat.clone()); m.visible = false; scene.add(m); tracers.push({ m, life: 0 }); }
let trIdx = 0;
function spawnTracer(o, e, mine) {
  const t = tracers[trIdx++ % tracers.length];
  const a = new THREE.Vector3(...o), b = new THREE.Vector3(...e);
  const dir = b.clone().sub(a); const len = dir.length();
  if (len < 0.5) return;
  dir.normalize();
  if (!mine) a.addScaledVector(dir, 0.8).y -= 0.25; else a.addScaledVector(dir, 1.2).y -= 0.12;
  const l2 = a.distanceTo(b);
  t.m.position.copy(a).lerp(b, 0.5); t.m.scale.set(0.025, 0.025, l2); t.m.lookAt(b);
  t.m.visible = true; t.life = 0.09; t.m.material.opacity = 0.85;
}
function dustTexture(r, g, b) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${r},${g},${b},0.9)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
const dustTex = dustTexture(220, 190, 120), bloodTex = dustTexture(200, 30, 30);
const puffs = [];
for (let i = 0; i < 30; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false })); s.visible = false; scene.add(s); puffs.push({ s, life: 0, max: 0.5 });
}
let puffIdx = 0;
function spawnPuff(p, blood) {
  const o = puffs[puffIdx++ % puffs.length];
  o.s.material.map = blood ? bloodTex : dustTex; o.s.position.set(p[0], p[1], p[2]);
  o.life = o.max = blood ? 0.35 : 0.55; o.s.visible = true;
}

// ---------------- Boshqa o'yinchilar ----------------
function getOther(id) {
  let o = others.get(id);
  if (!o) {
    const model = createPlayerModel(id, NAMES[id]);
    scene.add(model.root);
    o = { id, model, tx: 0, ty: 0, tz: 0, tyaw: 0, tpitch: 0, hp: 100, alive: true, w: 1, dieT: 0, speed: 0, stepT: 0, fresh: true };
    others.set(id, o);
  }
  return o;
}
function angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }

function updateOthers(dt, t) {
  const k = 1 - Math.exp(-dt * 16);
  for (const o of others.values()) {
    const r = o.model.root;
    // yangi paydo bo'lgan yoki uzoqqa (qayta tug'ilish) siljigan o'yinchi: sirpanmasdan darhol o'sha joyga
    if (o.fresh || Math.hypot(o.tx - r.position.x, o.tz - r.position.z) > 6 || Math.abs(o.ty - r.position.y) > 6) {
      r.position.set(o.tx, o.ty, o.tz); r.rotation.y = o.tyaw; o.fresh = false;
    }
    const px = r.position.x, pz = r.position.z;
    r.position.x += (o.tx - r.position.x) * k;
    r.position.y += (o.ty - r.position.y) * k;
    r.position.z += (o.tz - r.position.z) * k;
    r.rotation.y += angDiff(r.rotation.y, o.tyaw) * k;
    o.speed = Math.hypot(r.position.x - px, r.position.z - pz) / Math.max(dt, 1e-3);
    const m = o.model;
    m.setWeapon(o.w);
    m.head.rotation.x = o.tpitch * 0.7;
    m.armR.rotation.x = 1.25 + o.tpitch * 0.9; m.armL.rotation.x = 1.3 + o.tpitch * 0.9;
    m.guns.forEach((g) => { g.rotation.x = o.tpitch * 0.9; });
    if (o.alive) {
      o.dieT = 0; r.visible = true; r.rotation.x = 0;
      m.animate(o.speed, dt);
      if (o.speed > 2.5 && Math.abs(r.position.y - o.ty) < 0.1) {
        o.stepT -= dt;
        if (o.stepT <= 0) {
          o.stepT = 0.4;
          const d = Math.hypot(r.position.x - me.x, r.position.z - me.z);
          if (d < 25) A.sStep(0.09 / (1 + d / 5), stereoPan(r.position.x, r.position.z));
        }
      }
    } else {
      o.dieT += dt;
      r.rotation.x = Math.min(1, o.dieT * 3) * (Math.PI / 2) * 0.95;
      m.animate(0, dt);
      r.visible = o.dieT < 3;
    }
  }
}
function stereoPan(x, z) {
  const dx = x - me.x, dz = z - me.z, l = Math.hypot(dx, dz) || 1;
  return clamp((dx * Math.cos(me.yaw) + dz * -Math.sin(me.yaw)) / l, -1, 1);
}

// ---------------- Tarmoq ----------------
let ws = null, reconnectT = 0, pingT = 0, lastInSend = 0;
function wsUrl() {
  let s = isNative ? (settings.server || DEFAULT_SERVER) : '';
  const q = qs.get('server'); if (q) s = q;
  if (!s) {
    if (isNative) return null;
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }
  s = s.trim().replace(/\/+$/, '');
  if (/^wss?:\/\//.test(s)) { /* tayyor */ }
  else if (/^https:\/\//.test(s)) s = 'wss://' + s.slice(8);
  else if (/^http:\/\//.test(s)) s = 'ws://' + s.slice(7);
  else if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:|$)/.test(s)) s = 'ws://' + s;
  else s = 'wss://' + s;
  if (!/\/ws$/.test(s)) s += '/ws';
  return s;
}
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

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
    S.wsOK = true; setStatus('Ulandi ✓');
    if (S.phase === 'play' && S.name) send({ t: 'join', name: S.name });
    updatePlayBtn();
  };
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } onMsg(m); };
  ws.onclose = () => {
    S.wsOK = false; S.lobbyOK = false; updatePlayBtn();
    if (S.phase === 'play' || S.phase === 'pause') $('conn').classList.remove('hide');
    else setStatus('Server bilan aloqa yo\'q. Qayta urinilmoqda…', true);
    reconnectT = setTimeout(connect, 1500);
  };
  ws.onerror = () => {};
}

function onMsg(m) {
  switch (m.t) {
    case 'lobby': S.taken = m.taken || []; S.lobbyOK = true; buildNames(); updatePlayBtn(); setStatus(`Ulandi ✓  (o'yinda: ${S.taken.length}/5)`);
      if (S.auto && S.phase === 'menu') { const i = NAMES.indexOf(S.auto); if (i >= 0 && !S.taken.includes(i)) { S.name = NAMES[i]; join(); } }
      break;
    case 'welcome':
      S.id = m.id; S.name = m.name; $('conn').classList.add('hide'); $('err').textContent = '';
      if (S.phase !== 'play') enterPlay();
      break;
    case 'err': $('err').textContent = m.m || 'Xato'; S.phase = S.phase === 'play' ? 'play' : 'menu'; send({ t: 'l' }); break;
    case 'respawn':
      me.x = m.x; me.y = m.y; me.z = m.z; me.vy = 0; me.onGround = true; me.yaw = m.yaw; me.pitch = 0;
      me.rs = m.rs; me.alive = true; me.hp = MAX_HP; me.zoom = false; me.reloading = false; me.nextFire = 0;
      $('dead').classList.add('hide');
      if (!m.first) A.sStart();
      break;
    case 'a':
      me.ammo = m.a.slice();
      if (m.r && !me.reloading) startReloadLocal();
      if (!m.r) me.reloading = false;
      break;
    case 's': onSnap(m); break;
    case 'shot': onShot(m); break;
    case 'hm': showHitMarker(m.h, m.k); break;
    case 'dmg': onDamage(m); break;
    case 'heal': me.hp = m.hp; A.sHeal(); toast('+ Dori: HP ' + m.hp); break;
    case 'kill': onKill(m); break;
    case 'end': winners = m.win || []; showEnd(); break;
    case 'start': winners = []; $('endscreen').classList.add('hide'); toast('Yangi raund boshlandi!'); A.sStart(); break;
    case 'q': S.ping = Math.round(performance.now() - m.ts); break;
    default: break;
  }
}

function onSnap(m) {
  roundPhase = m.ph; roundLeft = m.rt; snapPlayers = m.p;
  if (m.pk) world.pickups.forEach((g, i) => { g.visible = !!m.pk[i]; });
  if (m.win) winners = m.win;
  const seen = new Set();
  for (const p of m.p) {
    const id = p[0]; seen.add(id);
    if (id === S.id) {
      me.hp = p[6]; me.inv = !!p[9];
      if (!p[7] && me.alive) die(S.killer);
      continue;
    }
    const o = getOther(id);
    o.tx = p[1]; o.ty = p[2]; o.tz = p[3]; o.tyaw = p[4]; o.tpitch = p[5];
    o.hp = p[6]; o.alive = !!p[7]; o.w = p[8];
  }
  for (const [id, o] of others) if (!seen.has(id)) { scene.remove(o.model.root); others.delete(id); }
  updateScore();
}

function onShot(m) {
  const mine = m.id === S.id;
  if (!mine) {
    spawnTracer(m.o, m.e, false);
    const d = Math.hypot(m.o[0] - me.x, m.o[1] - (me.y + EYE), m.o[2] - me.z);
    A.sShot(WEAPONS[m.w].id, clamp(1 / (1 + d / 14), 0.05, 1), stereoPan(m.o[0], m.o[2]));
  } else spawnTracer(m.o, m.e, true);
  spawnPuff(m.e, !!m.hit);
}

function showHitMarker(head, kill) {
  const h = $('hitm'); h.className = 'on' + (kill ? ' kill' : head ? ' head' : '');
  clearTimeout(showHitMarker.t); showHitMarker.t = setTimeout(() => { h.className = ''; }, 140);
  if (kill) A.sKill(); else A.sHit(head);
}

function onDamage(m) {
  me.hp = m.hp; A.sHurt();
  const f = $('dmgflash'); f.classList.add('on'); clearTimeout(onDamage.t); onDamage.t = setTimeout(() => f.classList.remove('on'), 60);
  const dx = m.fx - me.x, dz = m.fz - me.z;
  const fwd = dx * -Math.sin(me.yaw) + dz * -Math.cos(me.yaw);
  const rgt = dx * Math.cos(me.yaw) + dz * -Math.sin(me.yaw);
  const ang = Math.atan2(rgt, fwd) * 180 / Math.PI;
  const d = $('dmgdir'); d.style.transform = `rotate(${ang}deg)`; d.classList.add('on');
  clearTimeout(onDamage.t2); onDamage.t2 = setTimeout(() => d.classList.remove('on'), 80);
}

function nameSpan(id) { return `<span style="color:${COLORS[id]};font-weight:800">${NAMES[id]}</span>`; }
function onKill(m) {
  const row = document.createElement('div');
  row.innerHTML = `${nameSpan(m.k)} <span style="opacity:.8">[${WEAPONS[m.w].name}${m.h ? ' 🎯' : ''}]</span> ➜ ${nameSpan(m.v)}`;
  const feed = $('feed'); feed.appendChild(row);
  while (feed.children.length > 5) feed.removeChild(feed.firstChild);
  setTimeout(() => row.remove(), 6000);
  if (m.v === S.id) { S.killer = m.k; die(m.k); }
}

function die(killer) {
  if (!me.alive) return;
  me.alive = false; me.deadAt = performance.now(); me.zoom = false; fireHeld = false;
  A.sDie();
  $('deadby').innerHTML = killer >= 0 ? `${nameSpan(killer)} sizni yiqitdi` : '';
  $('dead').classList.remove('hide');
}

function toast(txt) {
  const el = $('msg'); el.textContent = txt; el.style.opacity = 1;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.style.opacity = 0; }, 2000);
}

// ---------------- Menyu ----------------
function setStatus(t, warn) { const el = $('status'); el.textContent = t; el.style.color = warn ? '#ff9e80' : '#ffd56b'; }
function buildNames() {
  const box = $('names'); box.innerHTML = '';
  NAMES.forEach((n, i) => {
    const b = document.createElement('button');
    b.className = 'nb' + (S.name === n ? ' sel' : '') + (S.taken.includes(i) && S.phase !== 'play' ? ' taken' : '');
    b.style.background = COLORS[i]; b.textContent = n;
    b.onclick = () => { if (S.taken.includes(i)) return; S.name = n; store.set('name', n); buildNames(); updatePlayBtn(); };
    box.appendChild(b);
  });
}
function updatePlayBtn() {
  const i = NAMES.indexOf(S.name);
  $('play').disabled = !(S.wsOK && S.lobbyOK && i >= 0 && !S.taken.includes(i));
}
function join() {
  if (!S.name) return;
  A.initAudio();
  if (isTouch) { try { const el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); } catch { /* ignore */ } try { screen.orientation.lock('landscape').catch(() => {}); } catch { /* ignore */ } }
  $('err').textContent = '';
  send({ t: 'join', name: S.name });
}
function enterPlay() {
  S.phase = 'play';
  $('menu').classList.add('hide'); $('hud').classList.remove('hide');
  $('myname').textContent = S.name; $('myname').style.color = COLORS[S.id];
  setVmWeapon(me.w); buildSlots(); onResize();
  if (!isTouch) lockPointer();
}
function openPause() {
  if (S.phase !== 'play') return;
  S.phase = 'pause'; keys = {}; fireHeld = false; joy.x = joy.y = 0;
  $('menu').classList.remove('hide'); $('menu').classList.add('over');
  $('panelJoin').classList.add('hide'); $('panelPause').classList.remove('hide');
  $('sens2').value = settings.sens; $('qual2').value = settings.quality;
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* ignore */ }
}
function resume() {
  S.phase = 'play'; $('menu').classList.add('hide'); $('menu').classList.remove('over');
  if (!isTouch) lockPointer();
}
function leave() {
  send({ t: 'x' });
  S.phase = 'menu'; S.id = -1;
  if (ws) { ws.onclose = null; try { ws.close(); } catch { /* ignore */ } }
  for (const o of others.values()) scene.remove(o.model.root);
  others.clear();
  $('hud').classList.add('hide'); $('menu').classList.remove('hide', 'over');
  $('panelJoin').classList.remove('hide'); $('panelPause').classList.add('hide');
  $('dead').classList.add('hide'); $('endscreen').classList.add('hide');
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* ignore */ }
  me.alive = true; S.lobbyOK = false; updatePlayBtn();
  connect();
}

// ---------------- HUD ----------------
function buildSlots() {
  const box = $('slots'); box.innerHTML = '';
  WEAPONS.forEach((w, i) => {
    const d = document.createElement('div'); d.className = 'slot'; d.dataset.i = i;
    d.innerHTML = `<b>${i + 1}</b>${w.name}`;
    d.addEventListener('click', () => selectWeapon(i));
    box.appendChild(d);
  });
}
function updateScore() {
  const rows = snapPlayers.slice().sort((a, b) => b[10] - a[10] || a[11] - b[11]);
  $('score').innerHTML = rows.map((p) =>
    `<div><span class="dot" style="background:${COLORS[p[0]]}"></span><span class="nm ${p[0] === S.id ? 'me' : ''}">${NAMES[p[0]]}</span><span class="kd">${p[10]} / ${p[11]}</span></div>`).join('');
}
let lastHud = {};
function updateHud(t) {
  const mm = Math.floor(roundLeft / 60), ss = Math.floor(roundLeft % 60);
  const tm = roundPhase === 'end' ? 'Raund tugadi' : `${mm}:${String(ss).padStart(2, '0')}`;
  if (lastHud.tm !== tm) { $('timer').textContent = tm; lastHud.tm = tm; }
  if (!lastHud.goal) { $('goal').textContent = `${KILL_LIMIT} ta o'ldirgan yutadi`; lastHud.goal = 1; }
  const hp = Math.max(0, Math.round(me.hp));
  if (lastHud.hp !== hp) {
    $('hpnum').textContent = hp; const f = $('hpfill'); f.style.width = hp + '%'; f.classList.toggle('low', hp <= 30); lastHud.hp = hp;
  }
  const wd = WEAPONS[me.w];
  const am = me.reloading ? '…' : me.ammo[me.w];
  if (lastHud.am !== am || lastHud.w !== me.w) { $('ammon').textContent = am; $('ammow').textContent = wd.name + ' / ∞'; lastHud.am = am; lastHud.w = me.w;
    document.querySelectorAll('.slot').forEach((s) => s.classList.toggle('act', +s.dataset.i === me.w));
    $('bZoom').classList.toggle('hide', !(isTouch && wd.zoom > 1)); }
  $('inv').classList.toggle('hide', !(me.inv && me.alive));
  // qayta zaryad chizig'i
  const rb = $('reloadbar');
  if (me.reloading && me.alive) {
    const p = clamp((t - me.reloadStart) / Math.max(1, me.reloadEnd - me.reloadStart), 0, 1);
    rb.style.opacity = 1; rb.firstElementChild.style.width = (p * 100) + '%';
  } else rb.style.opacity = 0;
  $('scope').classList.toggle('hide', !me.zoom);
  $('crosshair').style.display = me.zoom ? 'none' : '';
  if (!me.alive) {
    const left = Math.max(0, Math.ceil(3 - (t - me.deadAt) / 1000));
    $('deadcd').textContent = roundPhase === 'play' ? `Qayta tug'ilish: ${left}` : '';
  }
  if (S.stats && t - (lastHud.st || 0) > 500) { $('stats').textContent = `${S.fps} FPS · ${S.ping} ms`; lastHud.st = t; }
}
function showEnd() {
  const rows = snapPlayers.slice().sort((a, b) => b[10] - a[10] || a[11] - b[11]);
  const w = winners.length ? winners.map((i) => NAMES[i]).join(' va ') : 'Hech kim';
  $('endscreen').innerHTML = `<h2>🏆 G'olib: ${w}</h2><table>${rows.map((p) =>
    `<tr class="${winners.includes(p[0]) ? 'w' : ''}"><td style="color:${COLORS[p[0]]}">${NAMES[p[0]]}</td><td>${p[10]} o'ldirish</td><td>${p[11]} o'lim</td></tr>`).join('')}</table><div id="nextr" style="opacity:.8;font-size:13px"></div>`;
  $('endscreen').classList.remove('hide');
}

// ---------------- Kirish: klaviatura / sichqoncha ----------------
let keys = {}, fireHeld = false, fireLatch = false, jumpQ = false, lookDX = 0, lookDY = 0;
const joy = { x: 0, y: 0 };
function lockPointer() { try { const p = $('c').requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ } }
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && S.phase === 'play' && !isTouch) openPause(); });
document.addEventListener('keydown', (e) => {
  if (S.phase !== 'play') return;
  if (e.repeat && e.code !== 'Space') { e.preventDefault(); return; }
  keys[e.code] = true;
  if (e.code === 'Space') { jumpQ = true; e.preventDefault(); }
  else if (e.code === 'KeyR') doReload();
  else if (e.code === 'Digit1') selectWeapon(0);
  else if (e.code === 'Digit2') selectWeapon(1);
  else if (e.code === 'Digit3') selectWeapon(2);
  else if (e.code === 'Tab') e.preventDefault();
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });
document.addEventListener('mousemove', (e) => {
  if (S.phase === 'play' && document.pointerLockElement) { lookDX += e.movementX || 0; lookDY += e.movementY || 0; }
});
document.addEventListener('mousedown', (e) => {
  if (S.phase !== 'play' || isTouch) return;
  if (!document.pointerLockElement) { lockPointer(); return; }
  if (e.button === 0) { fireHeld = true; } else if (e.button === 2) toggleZoom();
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) { fireHeld = false; fireLatch = false; } });
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('wheel', (e) => {
  if (S.phase !== 'play') return;
  selectWeapon((me.w + (e.deltaY > 0 ? 1 : 2)) % 3);
}, { passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys = {}; fireHeld = false; } });

// ---------------- Kirish: sensorli ekran ----------------
const touches = new Map();
let joyTouch = null;
function btnDown(id) {
  if (id === 'bFire') { fireHeld = true; }
  else if (id === 'bJump') jumpQ = true;
  else if (id === 'bReload') doReload();
  else if (id === 'bZoom') toggleZoom();
  else if (id === 'bMenu') openPause();
}
function btnUp(id) { if (id === 'bFire') { fireHeld = false; fireLatch = false; } }
if (isTouch) {
  $('touch').classList.remove('hide');
  $('helpPC').classList.add('hide'); $('helpTouch').classList.remove('hide');
  document.addEventListener('touchstart', (e) => {
    if (S.phase !== 'play') return;
    for (const t of e.changedTouches) {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const btn = el && el.closest ? el.closest('.tb') : null;
      const slot = el && el.closest ? el.closest('.slot') : null;
      if (slot) { selectWeapon(+slot.dataset.i); touches.set(t.identifier, { type: 'none' }); continue; }
      if (btn) {
        touches.set(t.identifier, { type: 'btn', id: btn.id, lx: t.clientX, ly: t.clientY });
        btn.classList.add('down'); btnDown(btn.id);
      } else if (t.clientX < window.innerWidth * 0.42 && joyTouch === null) {
        joyTouch = t.identifier;
        const jb = $('joyBase'); jb.style.left = t.clientX + 'px'; jb.style.top = t.clientY + 'px'; jb.style.opacity = 1;
        touches.set(t.identifier, { type: 'joy', sx: t.clientX, sy: t.clientY });
      } else touches.set(t.identifier, { type: 'look', lx: t.clientX, ly: t.clientY });
    }
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (S.phase !== 'play') return;
    for (const t of e.changedTouches) {
      const o = touches.get(t.identifier); if (!o) continue;
      if (o.type === 'joy') {
        let dx = t.clientX - o.sx, dy = t.clientY - o.sy; const L = Math.hypot(dx, dy), R = 55;
        if (L > R) { dx = dx / L * R; dy = dy / L * R; }
        joy.x = dx / R; joy.y = dy / R;
        $('joyKnob').style.transform = `translate(${dx}px,${dy}px)`;
      } else if (o.type === 'look' || (o.type === 'btn' && o.id === 'bFire')) {
        lookDX += (t.clientX - o.lx) * 1.0; lookDY += (t.clientY - o.ly) * 1.0; o.lx = t.clientX; o.ly = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const endT = (e) => {
    for (const t of e.changedTouches) {
      const o = touches.get(t.identifier); if (!o) continue;
      if (o.type === 'joy') { joyTouch = null; joy.x = joy.y = 0; $('joyKnob').style.transform = ''; $('joyBase').style.opacity = 0; }
      if (o.type === 'btn') { btnUp(o.id); const b = $(o.id); if (b) b.classList.remove('down'); }
      touches.delete(t.identifier);
    }
    if (S.phase === 'play') e.preventDefault();
  };
  document.addEventListener('touchend', endT, { passive: false });
  document.addEventListener('touchcancel', endT, { passive: false });
}

// ---------------- Qurol mantig'i ----------------
function selectWeapon(i) {
  if (!me.alive || i === me.w || S.phase !== 'play') return;
  me.w = i; me.zoom = false; me.reloading = false; me.nextFire = performance.now() + 300; fireLatch = true;
  setVmWeapon(i); A.sSwitch(); send({ t: 'w', i });
}
function startReloadLocal() {
  const wd = WEAPONS[me.w];
  me.reloading = true; me.reloadStart = performance.now(); me.reloadEnd = me.reloadStart + wd.reload * 1000; me.zoom = false;
  A.sReload(wd.id);
}
function doReload() {
  if (!me.alive || me.reloading || S.phase !== 'play') return;
  const wd = WEAPONS[me.w];
  if (me.ammo[me.w] >= wd.mag) return;
  startReloadLocal(); send({ t: 'r' });
}
function toggleZoom() {
  if (!me.alive || me.reloading) return;
  if (WEAPONS[me.w].zoom > 1) me.zoom = !me.zoom;
}
function tryFire(t) {
  if (!me.alive || roundPhase !== 'play' || me.reloading || t < me.nextFire) return;
  const wd = WEAPONS[me.w];
  if (me.ammo[me.w] <= 0) { if (!fireLatch) A.sEmpty(); fireLatch = true; doReload(); return; }
  if (!wd.auto && fireLatch) return;
  fireLatch = true;
  me.nextFire = t + wd.interval * 1000;
  me.ammo[me.w]--;
  const o = [me.x, me.y + EYE, me.z];
  send({ t: 'shoot', yaw: me.yaw, pitch: me.pitch, z: me.zoom, ox: +o[0].toFixed(2), oy: +o[1].toFixed(2), oz: +o[2].toFixed(2) });
  A.sShot(wd.id, 0.9, 0);
  vm.kick = 1; vm.flashT = 0.05;
  const k = me.zoom ? 0.3 : 1;
  me.pitch = clamp(me.pitch + wd.recoil * k, -1.45, 1.45); me.yaw += (Math.random() - 0.5) * wd.recoil * 0.7 * k;
}

// ---------------- Asosiy sikl ----------------
let lastT = performance.now(), fpsAcc = 0, fpsN = 0, fov = 75, bobT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  fpsAcc += dt; fpsN++; if (fpsAcc >= 1) { S.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  const active = S.phase === 'play' || S.phase === 'pause';

  if (active) {
    updateLocal(dt, now);
    updateOthers(dt, now);
    updateEffects(dt, now);
    updateHud(now);
  }
  // dori qutilari aylanishi
  const tt = now / 1000;
  world.pickups.forEach((g, i) => { g.rotation.y = tt * 1.5 + i; g.position.y = (i < 2 ? 0 : i < 4 ? 4 : 8) + 0.75 + Math.sin(tt * 2 + i) * 0.08; });
  world.sky.position.copy(camera.position); world.sunSpr.position.set(-40, 70, 25).normalize().multiplyScalar(350).add(camera.position);

  renderer.clear();
  if (!active) {   // menyuda: hovli bo'ylab aylanuvchi kamera
    const a = tt * 0.12;
    camera.position.set(Math.sin(a) * 30, 9, Math.cos(a) * 30); camera.rotation.set(-0.22, a, 0);
    camera.fov = 70; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    return;
  }
  renderer.render(scene, camera);
  if (me.alive && !me.zoom) { renderer.clearDepth(); renderer.render(gunScene, gunCam); }
}

function updateLocal(dt, now) {
  const wd = WEAPONS[me.w];
  const playing = S.phase === 'play';
  // qarash
  const zf = me.zoom ? 1 / wd.zoom : 1;
  const sens = settings.sens * (isTouch ? 0.0042 : 0.0022) * zf;
  if (playing && me.alive) {
    me.yaw -= lookDX * sens; me.pitch = clamp(me.pitch - lookDY * sens, -1.45, 1.45);
  }
  lookDX = lookDY = 0;

  // harakat
  if (me.alive) {
    let ix = 0, iz = 0;
    if (playing) {
      ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
      iz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
    }
    const L = Math.hypot(ix, iz); if (L > 1) { ix /= L; iz /= L; }
    const sp = 5.4 * wd.speed * (me.zoom ? 0.6 : 1);
    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
    const vx = (fx * iz + rx * ix) * sp, vz = (fz * iz + rz * ix) * sp;
    const jump = jumpQ && playing; jumpQ = false;
    const wasGround = me.onGround;
    stepPlayer(me, vx, vz, jump, dt);
    if (me.onGround && Math.hypot(vx, vz) > 1) {
      me.stepT -= dt; if (me.stepT <= 0) { me.stepT = 0.38; A.sStep(0.06); }
    }
    if (me.onGround && !wasGround) A.sStep(0.12);
    bobT += dt * Math.hypot(vx, vz) * 1.7;
    // otish
    if (playing && fireHeld) tryFire(now);
    if (!fireHeld) fireLatch = false;
    if (me.reloading && now >= me.reloadEnd + 400) me.reloading = false;   // server xabari kelmasa ham tiqilib qolmasin
  } else jumpQ = false;

  // tarmoqqa yuborish (30 Hz)
  if (now - lastInSend > 33 && ws && ws.readyState === 1 && me.alive) {
    lastInSend = now;
    ws.send(`{"t":"in","rs":${me.rs},"x":${me.x.toFixed(3)},"y":${me.y.toFixed(3)},"z":${me.z.toFixed(3)},"yaw":${me.yaw.toFixed(4)},"pitch":${me.pitch.toFixed(4)}}`);
  }
  if (now - pingT > 2000 && ws && ws.readyState === 1) { pingT = now; send({ t: 'p', ts: now, rtt: S.ping }); }

  // kamera
  const targetFov = me.zoom ? 75 / wd.zoom : 75;
  fov += (targetFov - fov) * Math.min(1, dt * 14);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (me.alive) {
    camera.position.set(me.x, me.y + EYE, me.z);
    camera.rotation.set(me.pitch, me.yaw, 0);
  } else {
    const k = Math.min(1, (now - me.deadAt) / 500);
    camera.position.set(me.x, me.y + EYE - 1.0 * k, me.z);
    camera.rotation.set(me.pitch * (1 - k) - 0.2 * k, me.yaw, 0.7 * k);
  }
}

function updateEffects(dt, now) {
  // birinchi shaxs quroli
  vm.kick = Math.max(0, vm.kick - dt * 9);
  vm.sw = Math.min(1, vm.sw + dt * 5);
  vm.flashT = Math.max(0, vm.flashT - dt);
  vm.flashes.forEach((f, i) => { f.visible = i === me.w && vm.flashT > 0; if (f.visible) { f.rotation.z = Math.random() * 6; const s = 0.7 + Math.random() * 0.6; f.scale.set(s, s, 1); } });
  const base = VM_POS[me.w];
  const bobx = Math.sin(bobT) * 0.006, boby = Math.abs(Math.cos(bobT)) * 0.006;
  let rl = 0;
  if (me.reloading) { const p = clamp((now - me.reloadStart) / Math.max(1, me.reloadEnd - me.reloadStart), 0, 1); rl = Math.sin(p * Math.PI); }
  vm.root.position.set(base[0] + bobx, base[1] + boby - (1 - vm.sw) * 0.3 - rl * 0.16, base[2] + vm.kick * 0.05);
  vm.root.rotation.set(vm.kick * 0.1 + rl * 0.5, 0, rl * -0.3);

  for (const t of tracers) if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.m.visible = false; else t.m.material.opacity = Math.min(0.85, t.life * 14); }
  for (const p of puffs) if (p.life > 0) {
    p.life -= dt; const k = 1 - p.life / p.max;
    if (p.life <= 0) p.s.visible = false;
    else { const s = 0.25 + k * 0.9; p.s.scale.set(s, s, 1); p.s.material.opacity = 0.75 * (1 - k); p.s.position.y += dt * 0.5; }
  }
  const nr = $('nextr'); if (nr && roundPhase === 'end') nr.textContent = `Keyingi raund ${Math.ceil(roundLeft)} soniyadan keyin`;
}

// ---------------- Ishga tushirish ----------------
buildNames();
$('sens').value = settings.sens; $('qual').value = settings.quality; $('fpsck').checked = settings.stats;
$('sens').oninput = (e) => { settings.sens = parseFloat(e.target.value); store.set('sens', settings.sens); };
$('sens2').oninput = $('sens').oninput;
$('qual').onchange = (e) => { settings.quality = e.target.value; store.set('quality', settings.quality); applyQuality(); };
$('qual2').onchange = $('qual').onchange;
$('fpsck').onchange = (e) => { settings.stats = e.target.checked; store.set('stats', settings.stats ? '1' : '0'); if (!settings.stats) $('stats').textContent = ''; };
S.stats = settings.stats; Object.defineProperty(S, 'stats', { get: () => settings.stats });
$('play').onclick = join;
$('resume').onclick = resume;
$('leave').onclick = leave;
if (isNative || qs.get('server')) {
  $('srvrow').classList.remove('hide');
  $('srv').value = qs.get('server') || settings.server || DEFAULT_SERVER;
  $('srvok').onclick = () => { settings.server = $('srv').value.trim(); store.set('server', settings.server); connect(); };
}
if (S.name === null && settings.name && NAMES.includes(settings.name)) S.name = settings.name;
buildNames();
applyQuality();
setVmWeapon(1);
connect();
// menyudagi tanlov: serverdan "band" ismlar ro'yxatini yangilab turamiz
setInterval(() => { if (S.phase === 'menu' && ws && ws.readyState === 1) send({ t: 'l' }); }, 3000);
requestAnimationFrame(frame);
window.__game = { S, me, others, send, setFire(v) { fireHeld = v; if (!v) fireLatch = false; }, selectWeapon, doReload, get ws() { return ws; }, scene, camera, renderer };
