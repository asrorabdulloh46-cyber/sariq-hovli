// SARIQ HOVLI v3 - asosiy klient: tarmoq, boshqaruv, otish, HUD, do'kon, granata, hayvonlar
import * as THREE from './vendor/three.module.min.js';
import { NAMES, COLORS, WEAPONS, GRENADES, GREN_MAX, MODES, ANIMALS, EYE, EYE_C, CROUCH_SPEED, LOW_GRAV, MAX_HP, KILL_LIMIT,
  ROUND_SEC, ARMOR_PRICE, HELMET_PRICE, W_SNIPER } from './shared/consts.js';
import { MAP_NAMES, MAP_DESC, MAP_COUNT, raycastWorld } from './shared/map.js';
import { stepPlayer } from './shared/physics.js';
import { buildWorld, shadowTexture } from './js/world.js';
import { createPlayerModel, makeGun, makeFpArms, createAnimalModel } from './js/models.js';
import { createFx } from './js/fx.js';
import * as A from './js/audio.js';
import { DEFAULT_SERVER } from './config.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const qs = new URLSearchParams(location.search);
const isTouch = qs.get('touch') === '1' || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const cap = window.Capacitor;
const isNative = !!(cap && cap.getPlatform && cap.getPlatform() !== 'web') || location.protocol === 'file:' ||
  (location.hostname === 'localhost' && location.port === '');
if (isTouch) document.body.classList.add('touch');

// ---------------- Sozlamalar ----------------
const store = {
  get(k, d) { try { const v = localStorage.getItem('sh_' + k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sh_' + k, String(v)); } catch { /* ignore */ } },
};
const settings = {
  sens: parseFloat(store.get('sens', '1')),
  adsens: parseFloat(store.get('adsens', '0.8')),
  vol: parseFloat(store.get('vol', '1')),
  quality: store.get('quality', isTouch ? 'mid' : 'high'),
  stats: store.get('stats', '1') === '1',
  assist: store.get('assist', isTouch ? '1' : '0') === '1',
  radar: store.get('radar', '1') === '1',
  server: store.get('server', ''),
  name: store.get('name', ''),
};

// ---------------- Holat ----------------
const S = { phase: 'menu', name: null, id: -1, wsOK: false, taken: [], lobbyOK: false, killer: -1, ping: 0, fps: 0, auto: qs.get('auto'),
  mode: 0, want: -1, wmode: 0, mapNow: 0, tot: null, nemesis: -1, lastLobbyMap: -1 };
const me = {
  x: 0, y: 0, z: 0, vy: 0, onGround: true, yaw: 0, pitch: 0, hp: MAX_HP, alive: true, inv: false,
  w: 1, ammo: WEAPONS.map((w) => w.mag), own: WEAPONS.map((w) => !!w.start), reloading: false, reloadStart: 0, reloadEnd: 0,
  nextFire: 0, rs: 0, ads: false, adsT: 0, deadAt: 0, stepT: 0, eye: EYE, cr: 0, gs: 1,
  money: 0, armor: 0, helmet: 0, gren: [0, 0, 0], selG: 0, shopOpen: true, kbx: 0, kbz: 0, flashEnd: 0, flashDur: 0, assisting: false,
};
let roundPhase = 'play', roundLeft = ROUND_SEC, winners = [], nextMapId = null, nextModeId = null, crouchTog = false;
let snapPlayers = [];
const others = new Map();
const animals = new Map();
let recPend = 0, shake = 0;

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
const fx = createFx(scene);
function changeMap(id) {
  if (id === undefined || id === null || id === world.mapId) return;
  world.setMap(id);
  for (const o of others.values()) o.fresh = true;
  for (const a of animals.values()) a.fresh = true;
  fx.clear();
  if (S.phase === 'play' || S.phase === 'pause') toast('Xarita: ' + MAP_NAMES[world.mapId]);
}
function setMode(md) {
  if (md === undefined || md === null) return;
  S.mode = md; me.gs = md === 4 ? LOW_GRAV : 1; lastHud.goal = 0;
}
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 700);
camera.rotation.order = 'YXZ';
scene.add(camera);

const gunScene = new THREE.Scene();
gunScene.add(new THREE.HemisphereLight(0xdfeaff, 0xb59a60, 1.55));
const gl = new THREE.DirectionalLight(0xffffff, 1.2); gl.position.set(-1, 2, 1.5); gunScene.add(gl);
const gl2 = new THREE.DirectionalLight(0xffe2b0, 0.5); gl2.position.set(1.5, 0.5, 1); gunScene.add(gl2);
const gunCam = new THREE.PerspectiveCamera(58, 1, 0.01, 10);

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
const flashMatBase = new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
// qurol o'lchami, qo'lda ushlangan joy va mo'ljal holati
const VM = [
  { sc: 0.62, hip: [0.13, -0.15, -0.30], sight: 0.078, adsZ: -0.26 },   // pistolet
  { sc: 0.50, hip: [0.15, -0.17, -0.36], sight: 0.1, adsZ: -0.34 },     // avtomat
  { sc: 0.55, hip: [0.15, -0.16, -0.34], sight: 0.085, adsZ: -0.30 },   // mini-avtomat
  { sc: 0.48, hip: [0.15, -0.17, -0.38], sight: 0.07, adsZ: -0.34 },    // pompali
  { sc: 0.42, hip: [0.15, -0.18, -0.40], sight: 0.1, adsZ: -0.36 },     // snayper
];
const vm = { root: new THREE.Group(), guns: [], flashes: [], kick: 0, ks: 0, flashT: 0, sw: 1, thr: 0, swayX: 0, swayY: 0 };
gunScene.add(vm.root);
WEAPONS.forEach((wd, i) => {
  const holder = new THREE.Group();
  const g = makeGun(wd.id);
  holder.add(g); holder.add(makeFpArms(wd.id));
  const f = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), flashMatBase.clone());
  f.position.set(...g.userData.muzzle); f.visible = false; holder.add(f);
  holder.scale.setScalar(VM[i].sc);
  holder.visible = false; vm.root.add(holder); vm.guns.push(holder); vm.flashes.push(f);
});
function setVmWeapon(i) {
  vm.guns.forEach((g, k) => { g.visible = k === i; });
  vm.sw = 0;
}

// ---------------- Boshqa o'yinchilar ----------------
const shadowTex = shadowTexture();
const shadowGeo = new THREE.PlaneGeometry(1, 1);
function makeShadow(size) {
  const m = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; m.scale.set(size, size, 1); m.renderOrder = 1;
  return m;
}
function getOther(id) {
  let o = others.get(id);
  if (!o) {
    const model = createPlayerModel(id, NAMES[id]);
    scene.add(model.root);
    const sh = makeShadow(1.3); scene.add(sh);
    // o'qiga qarshi ko'rinadigan o't olish yorug'i
    const flashes = model.guns.map((g) => {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      f.scale.set(0.5, 0.5, 1); f.position.set(...g.userData.muzzle); f.visible = false; g.add(f); return f;
    });
    o = { id, model, shadow: sh, flashes, flashT: 0, lastShot: -1e9, tx: 0, ty: 0, tz: 0, tyaw: 0, tpitch: 0, hp: 100, alive: true, w: 1, dieT: 0, speed: 0, stepT: 0, fresh: true, cr: 0 };
    others.set(id, o);
  }
  return o;
}
function angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }

function updateOthers(dt, t) {
  const k = 1 - Math.exp(-dt * 16);
  for (const o of others.values()) {
    const r = o.model.root;
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
    m.setPitch(o.tpitch);
    o.flashT = Math.max(0, o.flashT - dt);
    o.flashes.forEach((f, i) => { f.visible = o.flashT > 0 && i === o.w; });
    o.shadow.position.set(r.position.x, r.position.y + 0.03, r.position.z);
    if (o.alive) {
      o.dieT = 0; r.visible = true; r.rotation.x = 0; o.shadow.visible = true;
      m.animate(o.speed, dt);
      m.setCrouch(o.cr, dt);
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
      r.visible = o.dieT < 3; o.shadow.visible = o.dieT < 3;
    }
  }
}
function stereoPan(x, z) {
  const dx = x - me.x, dz = z - me.z, l = Math.hypot(dx, dz) || 1;
  return clamp((dx * Math.cos(me.yaw) + dz * -Math.sin(me.yaw)) / l, -1, 1);
}
const distGain = (x, z, ref = 14) => clamp(1 / (1 + Math.hypot(x - me.x, z - me.z) / ref), 0.04, 1);

// ---------------- Hayvonlar ----------------
function hpSpriteTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8; return c;
}
function getAnimal(id, type) {
  let a = animals.get(id);
  if (!a || a.type !== type) {
    if (a) { scene.remove(a.model); scene.remove(a.shadow); }
    const model = createAnimalModel(type);
    scene.add(model);
    const sh = makeShadow(type === 0 ? 2.6 : 1.4); scene.add(sh);
    const cv = hpSpriteTex(), tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    sp.scale.set(1.0, 0.125, 1); sp.position.set(0, type === 0 ? 2.1 : 1.15, 0); sp.visible = false; sp.renderOrder = 5; model.add(sp);
    a = { id, type, model, shadow: sh, hpSp: sp, hpCv: cv, hpTex: tex, tx: 0, tz: 0, tyaw: 0, st: 0, hp: 100, alive: true, dieT: 0, speed: 0, fresh: true, lastHp: 100, lastSt: 0, snd: 0 };
    animals.set(id, a);
  }
  return a;
}
function drawAnimalHp(a) {
  const g = a.hpCv.getContext('2d'); g.clearRect(0, 0, 64, 8);
  g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 0, 64, 8);
  g.fillStyle = a.hp > 50 ? '#7bd852' : a.hp > 25 ? '#ffb300' : '#ef5350'; g.fillRect(1, 1, 62 * a.hp / 100, 6);
  a.hpTex.needsUpdate = true;
}
function updateAnimals(dt, now) {
  const t = now / 1000, k = 1 - Math.exp(-dt * 12);
  for (const a of animals.values()) {
    const m = a.model;
    if (a.fresh) { m.position.set(a.tx, 0, a.tz); m.rotation.y = a.tyaw; a.fresh = false; }
    const px = m.position.x, pz = m.position.z;
    m.position.x += (a.tx - m.position.x) * k; m.position.z += (a.tz - m.position.z) * k;
    m.rotation.y += angDiff(m.rotation.y, a.tyaw) * (1 - Math.exp(-dt * 10));
    a.speed = Math.hypot(m.position.x - px, m.position.z - pz) / Math.max(dt, 1e-3);
    a.shadow.position.set(m.position.x, 0.03, m.position.z);
    if (a.alive) {
      a.dieT = 0; m.visible = true; a.shadow.visible = true;
      m.rotation.z += (0 - m.rotation.z) * Math.min(1, dt * 10);
      m.userData.animate(a.speed, a.st, dt, t);
      a.hpSp.visible = a.hp < 100;
    } else {
      a.dieT += dt; a.hpSp.visible = false;
      m.rotation.z += ((a.type === 0 ? 1.45 : 1.5) - m.rotation.z) * Math.min(1, dt * 5);
      m.userData.animate(0, 0, dt, t);
      m.visible = a.dieT < 4; a.shadow.visible = a.dieT < 4;
    }
  }
}
function onAnimalSnap(list) {
  const seen = new Set();
  for (const r of list) {
    const a = getAnimal(r[0], r[1]); seen.add(r[0]);
    const st = r[6], alive = st >= 0;
    if (alive && !a.alive) a.fresh = true;     // qayta tug'ildi
    a.tx = r[2]; a.tz = r[3]; a.tyaw = r[4];
    const hp = r[5];
    if (alive && hp < a.lastHp && a.alive) {   // zarar oldi
      const g = distGain(a.tx, a.tz, 16);
      if (a.type === 1) A.sPig(g, stereoPan(a.tx, a.tz)); else A.sBull(g * 0.6, stereoPan(a.tx, a.tz));
    }
    if (alive && a.type === 0 && st === 2 && a.lastSt !== 2 && Math.hypot(a.tx - me.x, a.tz - me.z) < 30) A.sBull(distGain(a.tx, a.tz, 12), stereoPan(a.tx, a.tz));
    a.alive = alive; a.st = Math.max(0, st); a.lastSt = st;
    if (hp !== a.hp || !alive) { a.hp = hp; drawAnimalHp(a); }
    a.lastHp = alive ? hp : 100;
    if (!alive) a.hp = 0;
  }
  for (const [id, a] of animals) if (!seen.has(id)) { scene.remove(a.model); scene.remove(a.shadow); animals.delete(id); }
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
    if ((S.phase === 'play' || S.phase === 'pause' || S.phase === 'shop') && S.name) send({ t: 'join', name: S.name });
    updatePlayBtn();
  };
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } onMsg(m); };
  ws.onclose = () => {
    S.wsOK = false; S.lobbyOK = false; updatePlayBtn();
    if (S.phase === 'play' || S.phase === 'pause' || S.phase === 'shop') $('conn').classList.remove('hide');
    else setStatus('Server bilan aloqa yo\'q. Qayta urinilmoqda…', true);
    reconnectT = setTimeout(connect, 1500);
  };
  ws.onerror = () => {};
}

function onCfg(m) {
  const prevW = S.want, prevM = S.wmode;
  S.want = m.want ?? S.want; S.wmode = m.wmode ?? S.wmode;
  if (m.map !== undefined) S.mapNow = m.map;
  if (m.mode !== undefined) S.modeNow = m.mode;
  renderCfg();
  if (S.phase === 'menu') { if (m.map !== undefined && m.map !== S.lastLobbyMap) { S.lastLobbyMap = m.map; changeMap(m.map); } }
  else if ((prevW !== S.want || prevM !== S.wmode) && S.id >= 0) {
    toast(`Keyingi raund: ${S.want < 0 ? 'xarita navbat bilan' : MAP_NAMES[S.want]} · ${MODES[S.wmode].name}`);
  }
}

function onMsg(m) {
  switch (m.t) {
    case 'lobby':
      S.taken = m.taken || []; S.lobbyOK = true; S.tot = m.tot || S.tot;
      buildNames(); updatePlayBtn(); setStatus(`Ulandi ✓  (o'yinda: ${S.taken.length}/5)`);
      onCfg({ map: m.map, want: m.want, mode: m.mode, wmode: m.wmode });
      if (S.auto && S.phase === 'menu') { const i = NAMES.indexOf(S.auto); if (i >= 0 && !S.taken.includes(i)) { S.name = NAMES[i]; join(); } }
      break;
    case 'cfg': onCfg(m); break;
    case 'welcome':
      S.id = m.id; S.name = m.name; $('conn').classList.add('hide'); $('err').textContent = '';
      changeMap(m.m); setMode(m.md);
      if (S.phase === 'menu') enterPlay();
      break;
    case 'err': $('err').textContent = m.m || 'Xato'; S.phase = (S.phase === 'play' || S.phase === 'shop') ? S.phase : 'menu'; send({ t: 'l' }); break;
    case 'respawn':
      changeMap(m.m); setMode(m.md);
      me.cr = 0; me.h = undefined; crouchTog = false; me.eye = EYE; $('bCrouch').classList.remove('on');
      me.x = m.x; me.y = m.y; me.z = m.z; me.vy = 0; me.onGround = true; me.yaw = m.yaw; me.pitch = 0; me.kbx = me.kbz = 0;
      me.rs = m.rs; me.alive = true; me.hp = MAX_HP; setAds(false); me.reloading = false; me.nextFire = 0; recPend = 0;
      $('dead').classList.add('hide'); S.killer = -1; S.killedBy = -1; S.selfKill = false;
      if (!m.first) A.sStart();
      lastHud.am = null;
      break;
    case 'a':
      me.ammo = m.a.slice(); if (m.own) me.own = m.own.map(Boolean);
      if (m.w !== undefined && m.w !== me.w) { me.w = m.w; setAds(false); setVmWeapon(m.w); }
      if (m.r && !me.reloading) startReloadLocal();
      if (!m.r) me.reloading = false;
      renderSlots(); lastHud.am = null;
      break;
    case 'st':
      me.money = m.money; me.armor = m.armor; me.helmet = m.helmet; me.gren = m.gren.slice(); me.own = m.own.map(Boolean); me.shopOpen = !!m.shop;
      renderSlots(); renderGrens(); lastHud.mo = null;
      if (S.phase === 'shop') { if (!me.shopOpen) closeShop(); else buildShop(); }
      break;
    case 'money':
      if (m.d > 0) { pop(`+$${m.d}`); if (m.why !== 'win') A.sCash(); }
      break;
    case 'msg': toast(m.m); if (/yetmaydi|yopiq|bor|ko'proq/.test(m.m)) A.sDeny(); break;
    case 'bought': A.sBuy(); break;
    case 's': onSnap(m); break;
    case 'shot': onShot(m); break;
    case 'hm': showHitMarker(m.h, m.k, m.d); break;
    case 'dmg': onDamage(m); break;
    case 'kb': me.kbx = m.vx; me.kbz = m.vz; shake = Math.max(shake, 0.5); A.sGore(); break;
    case 'heal': {
      const gain = Math.round(m.hp - me.hp); me.hp = m.hp; A.sHeal();
      if (m.an !== undefined) pop(`+${gain} HP`, true); else toast('+ Dori: HP ' + m.hp);
      break;
    }
    case 'flash': startFlash(m.dur); break;
    case 'gx': onGrenadeFx(m); break;
    case 'smoke': fx.smoke(m.x, m.y, m.z, m.dur); A.sSmoke(distGain(m.x, m.z, 20), stereoPan(m.x, m.z)); break;
    case 'kill': onKill(m); break;
    case 'akill': onAnimalKill(m); break;
    case 'end': winners = m.win || []; nextMapId = m.nm; nextModeId = m.nmd; S.endMsg = m; if (m.tot) S.tot = m.tot; showEnd(); break;
    case 'start': winners = []; changeMap(m.m); setMode(m.md); S.nemesis = -1; fx.clear(); $('endscreen').classList.add('hide'); toast('Yangi raund boshlandi!'); A.sStart(); break;
    case 'q': S.ping = Math.round(performance.now() - m.ts); break;
    default: break;
  }
}

function onSnap(m) {
  changeMap(m.m);
  if (m.md !== undefined && m.md !== S.mode) setMode(m.md);
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
    o.hp = p[6]; o.alive = !!p[7]; o.w = p[8]; o.cr = p[12] ? 1 : 0; o.armor = p[13];
    if (o.alive && !o.wasAlive) o.fresh = true;
    o.wasAlive = o.alive;
  }
  for (const [id, o] of others) if (!seen.has(id)) { scene.remove(o.model.root); scene.remove(o.shadow); others.delete(id); }
  if (m.an) onAnimalSnap(m.an);
  fx.syncGrenades(m.gr);
  updateScore();
}

function onShot(m) {
  const mine = m.id === S.id;
  const ends = m.ps || [m.e];
  if (!mine) {
    const o = others.get(m.id);
    if (o) { o.flashT = 0.06; o.lastShot = performance.now(); }
    const d = Math.hypot(m.o[0] - me.x, m.o[1] - (me.y + me.eye), m.o[2] - me.z);
    A.sShot(WEAPONS[m.w].id, clamp(1 / (1 + d / 14), 0.05, 1), stereoPan(m.o[0], m.o[2]));
  }
  ends.forEach((e, i) => { fx.spawnTracer(m.o, e, mine); if (i < 4 || m.hit) fx.spawnPuff(e, !!m.hit && i < 3); });
}

function showHitMarker(head, kill, dmg) {
  const h = $('hitm'); h.className = 'on' + (kill ? ' kill' : head ? ' head' : '');
  clearTimeout(showHitMarker.t); showHitMarker.t = setTimeout(() => { h.className = ''; }, 140);
  if (kill) A.sKill(); else A.sHit(head);
  if (dmg > 0) pop(`-${dmg}`, false, head ? '#ff5a4a' : '#ffe082');
}

function onDamage(m) {
  me.hp = m.hp; A.sHurt(); shake = Math.max(shake, Math.min(0.6, m.d / 60));
  const f = $('dmgflash'); f.classList.add('on'); clearTimeout(onDamage.t); onDamage.t = setTimeout(() => f.classList.remove('on'), 60);
  const dx = m.fx - me.x, dz = m.fz - me.z;
  const fwd = dx * -Math.sin(me.yaw) + dz * -Math.cos(me.yaw);
  const rgt = dx * Math.cos(me.yaw) + dz * -Math.sin(me.yaw);
  const ang = Math.atan2(rgt, fwd) * 180 / Math.PI;
  const d = $('dmgdir'); d.style.transform = `rotate(${ang}deg)`; d.classList.add('on');
  clearTimeout(onDamage.t2); onDamage.t2 = setTimeout(() => d.classList.remove('on'), 80);
}

function onGrenadeFx(m) {
  const g = distGain(m.x, m.z, 22), pan = stereoPan(m.x, m.z);
  if (m.type === 0) {
    fx.explosion(m.x, m.y, m.z); A.sExplode(g, pan);
    const d = Math.hypot(m.x - me.x, m.y - (me.y + me.eye), m.z - me.z);
    shake = Math.max(shake, clamp(1.1 - d / 22, 0, 1));
  } else if (m.type === 2) { fx.flashBurst(m.x, m.y, m.z); A.sFlashBang(g, pan); }
}
function startFlash(dur) {
  if (!me.alive) return;
  const now = performance.now();
  me.flashDur = Math.max(dur * 1000, 200); me.flashEnd = now + me.flashDur;
  A.duck(dur); A.sRing(dur);
}

function nameSpan(id) { return `<span style="color:${COLORS[id]};font-weight:800">${NAMES[id]}</span>`; }
function addFeed(html) {
  const row = document.createElement('div'); row.innerHTML = html;
  const feed = $('feed'); feed.appendChild(row);
  while (feed.children.length > 5) feed.removeChild(feed.firstChild);
  setTimeout(() => row.remove(), 6500);
}
const STREAK_TXT = ['', '', 'IKKILANGAN!', 'UCHLANGAN!', "TO'RTLANGAN!", "QIRG'INBAROT!"];
function onKill(m) {
  const wname = m.g ? 'Granata 💥' : m.w >= 0 ? WEAPONS[m.w].name : '';
  let who;
  if (m.me) who = `${nameSpan(m.v)} o'zini portlatdi`;
  else if (m.k >= 0) who = `${nameSpan(m.k)} <span style="opacity:.8">[${wname}${m.h ? ' 🎯' : ''}]</span> ➜ ${nameSpan(m.v)}`;
  else if (m.an >= 0) who = `${m.an === 0 ? '🐂' : '🐖'} ${ANIMALS[m.an].name} ➜ ${nameSpan(m.v)}`;
  else who = `${nameSpan(m.v)} yiqildi`;
  addFeed(who + (m.rv ? ' <span style="color:#ff8a80">☠ qasos</span>' : ''));
  if (m.k >= 0 && !m.me && m.ks >= 3 && m.k !== S.id) addFeed(`<span style="color:#ffd54f">🔥 ${NAMES[m.k]}: ${m.ks} ta ketma-ket!</span>`);
  if (m.v === S.id) {
    S.killer = m.k >= 0 && !m.me ? m.k : -1; S.killedBy = m.an >= 0 ? m.an : -1; S.selfKill = !!m.me;
    if (m.k >= 0 && !m.me) S.nemesis = m.k;
    die(S.killer); setDeadBy();
  }
  if (m.k === S.id && !m.me) {
    if (m.v === S.nemesis) S.nemesis = -1;
    if (m.rv) bigMsg('☠ QASOS!', '#ff8a80');
    else if (m.ks >= 2) { bigMsg(STREAK_TXT[Math.min(5, m.ks)] + (m.ks > 5 ? ' x' + m.ks : ''), '#ffd54f'); A.sStreak(m.ks); }
  }
}
function onAnimalKill(m) {
  addFeed(`${nameSpan(m.k)} ➜ ${m.a === 0 ? '🐂' : '🐖'} ${ANIMALS[m.a].name}${m.g ? ' 💥' : ''}`);
  fx.spawnPuff([m.x, 0.8, m.z], true);
  if (m.k === S.id) { const d = ANIMALS[m.a]; pop(`+$${d.rewardMoney}`, false, '#9be564'); }
}
function setDeadBy() {
  let t = '';
  if (S.killer >= 0) t = `${nameSpan(S.killer)} sizni yiqitdi`;
  else if (S.killedBy >= 0) t = `${ANIMALS[S.killedBy].name} sizni suzdi`;
  else if (S.selfKill) t = "O'zingizni portlatdingiz";
  $('deadby').innerHTML = t;
}

function die(killer) {
  if (!me.alive) return;
  me.alive = false; me.deadAt = performance.now(); setAds(false); fireHeld = false; recPend = 0;
  A.sDie();
  if (S.phase === 'shop') closeShop();
  S.killer = killer; setDeadBy();
  $('dead').classList.remove('hide');
}

function toast(txt) {
  const el = $('msg'); el.textContent = txt; el.style.opacity = 1;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.style.opacity = 0; }, 2200);
}
function bigMsg(txt, color) {
  const el = $('big'); el.textContent = txt; el.style.color = color || '#ffd54f';
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}
function pop(txt, hp, color) {
  const el = document.createElement('div'); el.className = 'pop' + (hp ? ' hp' : ''); el.textContent = txt;
  if (color) el.style.color = color;
  el.style.top = (Math.random() * 24 - 12) + 'px';
  $('pops').appendChild(el); setTimeout(() => el.remove(), 1400);
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
const MAP_COLORS = ['linear-gradient(135deg,#d9b66a,#8a6b2a)', 'linear-gradient(135deg,#d8c590,#7d9b58)', 'linear-gradient(135deg,#8cbc5c,#c2985a)'];
function renderCfg() {
  const mc = $('mapCards');
  if (mc) {
    mc.innerHTML = '';
    const items = [{ id: -1, t: 'Avto', d: 'Xaritalar navbat bilan almashadi', bg: 'linear-gradient(135deg,#6a8bd8,#d9b66a,#7aa85c)' }];
    for (let i = 0; i < MAP_COUNT; i++) items.push({ id: i, t: MAP_NAMES[i], d: MAP_DESC[i], bg: MAP_COLORS[i] });
    for (const it of items) {
      const d = document.createElement('div');
      d.className = 'opt' + (S.want === it.id ? ' sel' : '') + (it.id >= 0 && it.id === S.mapNow ? ' now' : '');
      d.innerHTML = `<div class="pv" style="background:${it.bg}"></div><div class="t">${it.t}</div><div class="d">${it.d}</div>`;
      d.onclick = () => { S.want = it.id; if (it.id >= 0 && S.phase === 'menu') { S.lastLobbyMap = it.id; changeMap(it.id); } send({ t: 'cfg', map: it.id, mode: S.wmode }); renderCfg(); };
      mc.appendChild(d);
    }
  }
  const mo = $('modeCards');
  if (mo) {
    mo.innerHTML = '';
    MODES.forEach((md, i) => {
      const d = document.createElement('div');
      d.className = 'opt' + (S.wmode === i ? ' sel' : '') + (S.modeNow === i ? ' now' : '');
      d.innerHTML = `<div class="t">${md.name}</div><div class="d">${md.desc}</div>`;
      d.onclick = () => { S.wmode = i; send({ t: 'cfg', map: S.want, mode: i }); renderCfg(); };
      mo.appendChild(d);
    });
  }
  $('mapLbl').textContent = S.want < 0 ? 'Avto' : MAP_NAMES[S.want];
  $('modeLbl').textContent = MODES[S.wmode].name;
}
let menuHome = 'panelJoin';
function showPanel(id) {
  for (const p of ['panelJoin', 'panelPause', 'pMap', 'pMode', 'pSet']) $(p).classList.toggle('hide', p !== id);
  $('sub').classList.toggle('hide', id !== 'panelJoin' && id !== 'panelPause');
  if (id === 'pSet') {
    $('sens').value = settings.sens; $('adsens').value = settings.adsens; $('vol').value = settings.vol; $('qual').value = settings.quality;
    $('assist').checked = settings.assist; $('fpsck').checked = settings.stats; $('radarck').checked = settings.radar;
  }
  if (id === 'pMap' || id === 'pMode') renderCfg();
}
document.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => showPanel(b.dataset.go); });
document.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => showPanel(menuHome); });

function join() {
  if (!S.name) return;
  A.initAudio(); A.setVolume(settings.vol);
  if (isTouch) { try { const el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); } catch { /* ignore */ } try { screen.orientation.lock('landscape').catch(() => {}); } catch { /* ignore */ } }
  $('err').textContent = '';
  send({ t: 'join', name: S.name });
}
function enterPlay() {
  S.phase = 'play'; menuHome = 'panelPause';
  $('menu').classList.add('hide'); $('hud').classList.remove('hide');
  $('myname').textContent = S.name; $('myname').style.color = COLORS[S.id];
  setVmWeapon(me.w); renderSlots(); renderGrens(); onResize(); lastHud = {};
  if (!isTouch) lockPointer();
  setTimeout(() => { if (S.phase === 'play' && me.shopOpen) toast(isTouch ? '🛒 tugmasi — do\'kon' : 'B — do\'kon'); }, 1200);
}
function openPause() {
  if (S.phase !== 'play') return;
  S.phase = 'pause'; keys = {}; fireHeld = false; joy.x = joy.y = 0;
  $('menu').classList.remove('hide'); $('menu').classList.add('over');
  menuHome = 'panelPause'; showPanel('panelPause');
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* ignore */ }
}
function resume() {
  S.phase = 'play'; $('menu').classList.add('hide'); $('menu').classList.remove('over');
  if (!isTouch) lockPointer();
}
function leave() {
  S.auto = null;
  send({ t: 'x' });
  S.phase = 'menu'; S.id = -1; menuHome = 'panelJoin';
  if (ws) { ws.onclose = null; try { ws.close(); } catch { /* ignore */ } }
  for (const o of others.values()) { scene.remove(o.model.root); scene.remove(o.shadow); }
  others.clear();
  for (const a of animals.values()) { scene.remove(a.model); scene.remove(a.shadow); }
  animals.clear(); fx.clear();
  $('hud').classList.add('hide'); $('menu').classList.remove('hide', 'over'); closeShopUi();
  showPanel('panelJoin');
  $('dead').classList.add('hide'); $('endscreen').classList.add('hide');
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* ignore */ }
  me.alive = true; S.lobbyOK = false; updatePlayBtn();
  connect();
}

// ---------------- Do'kon ----------------
const SHOP_ICONS = ['🔫', '🔫', '🔫', '🔫', '🎯'];
function buildShop() {
  const box = $('shopbox');
  const items = (arr) => arr.join('');
  const w = [2, 3, 4].map((i) => {
    const wd = WEAPONS[i], own = me.own[i], no = !own && me.money < wd.price;
    return `<div class="item${own ? ' own' : ''}${no ? ' no' : ''}" data-k="w" data-i="${i}"><div class="ic">${SHOP_ICONS[i]}</div><div class="nm">${wd.name}</div>
      <div class="ds">zarar ${wd.dmg}${wd.pellets > 1 ? '×' + wd.pellets : ''} · ${wd.mag} o'q</div><div class="pr">${own ? 'Sizda bor' : '$' + wd.price}</div></div>`;
  });
  const g = GRENADES.map((gd, i) => {
    const full = me.gren[i] >= GREN_MAX, no = !full && me.money < gd.price;
    return `<div class="item${full ? ' own' : ''}${no ? ' no' : ''}" data-k="g" data-i="${i}"><div class="ic">${['💣', '☁️', '✨'][i]}</div><div class="nm">${gd.name}</div>
      <div class="ds">${['portlash, 6.5 m', 'ko\'rishni to\'sadi', 'ko\'zni qamashtiradi'][i]}</div><div class="pr">$${gd.price} · ${me.gren[i]}/${GREN_MAX}</div></div>`;
  });
  const armOwn = me.armor >= 100, helOwn = !!me.helmet;
  const eq = [
    `<div class="item${armOwn ? ' own' : ''}${!armOwn && me.money < ARMOR_PRICE ? ' no' : ''}" data-k="armor"><div class="ic">🦺</div><div class="nm">Zirh</div><div class="ds">zararning yarmini yutadi</div><div class="pr">${armOwn ? 'To\'liq' : '$' + ARMOR_PRICE}</div></div>`,
    `<div class="item${helOwn ? ' own' : ''}${!helOwn && me.money < HELMET_PRICE ? ' no' : ''}" data-k="helmet"><div class="ic">⛑</div><div class="nm">Dubulg'a</div><div class="ds">kallaga zarar −45%</div><div class="pr">${helOwn ? 'Sizda bor' : '$' + HELMET_PRICE}</div></div>`,
  ];
  box.innerHTML = `<div class="shophead"><h2>🛒 Do'kon</h2><div id="shopmoney">$${me.money}</div><button class="ghost" id="shopclose">✕ ${isTouch ? '' : '(B)'}</button></div>
    <div class="shopgrid">${items(w)}${items(g)}${items(eq)}</div>`;
  box.querySelectorAll('.item').forEach((el) => {
    el.onclick = () => {
      const k = el.dataset.k, i = +el.dataset.i;
      send({ t: 'buy', k, i });
    };
  });
  $('shopclose').onclick = closeShop;
}
function openShop() {
  if (S.phase !== 'play' || !me.alive) return;
  if (!me.shopOpen) { toast('Do\'kon bu rejimda yopiq'); A.sDeny(); return; }
  S.phase = 'shop'; keys = {}; fireHeld = false; joy.x = joy.y = 0;
  buildShop(); $('shop').classList.remove('hide');
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* ignore */ }
}
function closeShopUi() { $('shop').classList.add('hide'); }
function closeShop() {
  if (S.phase !== 'shop') return;
  S.phase = 'play'; closeShopUi();
  if (!isTouch) lockPointer();
}

// ---------------- HUD ----------------
const SHORT = ['Pistolet', 'Avtomat', 'Mini', 'Pompali', 'Snayper'];
function renderSlots() {
  const box = $('slots'); box.innerHTML = '';
  WEAPONS.forEach((w, i) => {
    if (!me.own[i]) return;
    const d = document.createElement('div'); d.className = 'slot' + (i === me.w ? ' act' : ''); d.dataset.i = i;
    d.innerHTML = `<b>${i + 1}</b>${SHORT[i]}`;
    d.addEventListener('click', () => selectWeapon(i));
    box.appendChild(d);
  });
}
function renderGrens() {
  const box = $('grens'); box.innerHTML = '';
  if (!me.shopOpen) return;
  GRENADES.forEach((g, i) => {
    const d = document.createElement('div'); d.className = 'chip' + (i === me.selG ? ' act' : '') + (me.gren[i] <= 0 ? ' zero' : ''); d.dataset.g = i;
    d.innerHTML = `${['💣', '☁️', '✨'][i]}<span>${me.gren[i]}</span>`;
    d.addEventListener('click', () => { me.selG = i; renderGrens(); });
    box.appendChild(d);
  });
}
function updateScore() {
  const rows = snapPlayers.slice().sort((a, b) => b[10] - a[10] || a[11] - b[11]);
  $('score').innerHTML = rows.map((p) =>
    `<div><span class="dot" style="background:${COLORS[p[0]]}"></span><span class="nm ${p[0] === S.id ? 'me' : ''}">${NAMES[p[0]]}</span><span class="kd">${p[10]} / ${p[11]}</span></div>`).join('');
}
let lastHud = {};
let crossGap = 8;
function updateHud(t, dt) {
  const mm = Math.floor(roundLeft / 60), ss = Math.floor(roundLeft % 60);
  const tm = roundPhase === 'end' ? 'Raund tugadi' : `${mm}:${String(ss).padStart(2, '0')}`;
  if (lastHud.tm !== tm) { $('timer').textContent = tm; lastHud.tm = tm; }
  if (!lastHud.goal) { $('goal').textContent = `${MODES[S.mode].name} · ${MAP_NAMES[world.mapId]} · ${KILL_LIMIT} ta o'ldirgan yutadi`; lastHud.goal = 1; }
  const hp = Math.max(0, Math.round(me.hp));
  if (lastHud.hp !== hp) {
    $('hpnum').textContent = hp; const f = $('hpfill'); f.style.width = hp + '%'; f.classList.toggle('low', hp <= 30); lastHud.hp = hp;
  }
  if (lastHud.ar !== me.armor) { $('arfill').style.width = me.armor + '%'; lastHud.ar = me.armor; }
  const mo = `${me.money}|${me.helmet}|${me.shopOpen}`;
  if (lastHud.mo !== mo) {
    $('money').textContent = me.shopOpen ? '$' + me.money : ''; $('helm').textContent = me.helmet ? '⛑' : '';
    $('arbar').style.visibility = me.shopOpen || me.armor > 0 ? 'visible' : 'hidden';
    $('bShop').classList.toggle('hide', !me.shopOpen); $('bGren').classList.toggle('hide', !me.shopOpen);
    renderGrens(); lastHud.mo = mo;
  }
  const wd = WEAPONS[me.w];
  const am = me.reloading ? '…' : me.ammo[me.w];
  if (lastHud.am !== am || lastHud.w !== me.w) {
    $('ammon').textContent = am; $('ammow').textContent = wd.name + ' / ' + wd.mag; lastHud.am = am; lastHud.w = me.w;
    document.querySelectorAll('.slot').forEach((s) => s.classList.toggle('act', +s.dataset.i === me.w));
  }
  $('inv').classList.toggle('hide', !(me.inv && me.alive));
  const rb = $('reloadbar');
  if (me.reloading && me.alive) {
    const p = clamp((t - me.reloadStart) / Math.max(1, me.reloadEnd - me.reloadStart), 0, 1);
    rb.style.opacity = 1; rb.firstElementChild.style.width = (p * 100) + '%';
  } else rb.style.opacity = 0;
  const scoped = me.w === W_SNIPER && me.adsT > 0.92;
  $('scope').classList.toggle('hide', !scoped);
  // nishon markazi: harakat/sakrash bilan kengayadi
  const ch = $('crosshair');
  ch.style.display = scoped ? 'none' : '';
  const vh = Math.hypot(me.vxl || 0, me.vzl || 0);
  let target = 6 + Math.min(1, vh / 5.4) * 8 + (me.onGround ? 0 : 12) + (me.cr ? -2 : 0) + (wd.hipSpread ? 12 : 0) + wd.spread * 220;
  target = me.adsT > 0.5 ? 1.5 + (wd.hipSpread ? 0 : 1) : target;
  crossGap += (target - crossGap) * Math.min(1, dt * 14);
  ch.style.setProperty('--g', crossGap.toFixed(1) + 'px');
  ch.classList.toggle('assist', me.assisting);
  // ekran qorayishi
  const fo = $('flashov');
  if (me.flashEnd > t) {
    const left = me.flashEnd - t, hold = me.flashDur * 0.35;
    fo.style.opacity = left > me.flashDur - hold ? 1 : clamp(left / (me.flashDur - hold), 0, 1);
  } else if (fo.style.opacity !== '0') fo.style.opacity = 0;
  if (!me.alive) {
    const left = Math.max(0, Math.ceil(3 - (t - me.deadAt) / 1000));
    $('deadcd').textContent = roundPhase === 'play' ? `Qayta tug'ilish: ${left}` : '';
  }
  if (settings.stats && t - (lastHud.st || 0) > 500) { $('stats').textContent = `${S.fps} FPS · ${S.ping} ms`; lastHud.st = t; }
  updateRevenge();
  if (settings.radar && t - (lastHud.rd || 0) > 60) { drawRadar(t); lastHud.rd = t; }
}
const _v3 = new THREE.Vector3();
function updateRevenge() {
  const el = $('rvmark');
  const o = S.nemesis >= 0 && me.alive ? others.get(S.nemesis) : null;
  if (!o || !o.alive || roundPhase !== 'play') { el.classList.add('hide'); return; }
  _v3.set(o.model.root.position.x, o.model.root.position.y + (o.cr ? 1.7 : 2.25), o.model.root.position.z).project(camera);
  if (_v3.z > 1 || Math.abs(_v3.x) > 1 || Math.abs(_v3.y) > 1) { el.classList.add('hide'); return; }
  el.classList.remove('hide');
  el.style.left = ((_v3.x * 0.5 + 0.5) * window.innerWidth) + 'px'; el.style.top = ((-_v3.y * 0.5 + 0.5) * window.innerHeight) + 'px';
}
function drawRadar(t) {
  const cv = $('radar'); if (cv.style.display === 'none') return;
  const g = cv.getContext('2d'), W = cv.width, c = W / 2, R = 40, sc = (c - 8) / R;
  g.clearRect(0, 0, W, W);
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1;
  g.beginPath(); g.arc(c, c, c * 0.5, 0, 6.3); g.stroke();
  g.beginPath(); g.moveTo(c, 4); g.lineTo(c, W - 4); g.moveTo(4, c); g.lineTo(W - 4, c); g.stroke();
  const rel = (x, z) => {
    const dx = x - me.x, dz = z - me.z;
    const f = dx * -Math.sin(me.yaw) + dz * -Math.cos(me.yaw), r = dx * Math.cos(me.yaw) + dz * -Math.sin(me.yaw);
    let px = r, py = -f; const L = Math.hypot(px, py);
    if (L > R) { px = px / L * R; py = py / L * R; }
    return [c + px * sc, c + py * sc, L > R];
  };
  for (const o of others.values()) {
    if (!o.alive) continue;
    const age = (t - o.lastShot) / 1000, nem = o.id === S.nemesis;
    if (age > 2.5 && !nem) continue;
    const [x, y, edge] = rel(o.model.root.position.x, o.model.root.position.z);
    const a = nem && age > 2.5 ? 0.55 : 1 - age / 2.5;
    g.globalAlpha = clamp(a, 0.2, 1);
    g.fillStyle = COLORS[o.id]; g.beginPath(); g.arc(x, y, edge ? 5 : 7, 0, 6.3); g.fill();
    if (nem) { g.strokeStyle = '#ff5a4a'; g.lineWidth = 3; g.stroke(); }
  }
  g.globalAlpha = 1;
  for (const a of animals.values()) {
    if (!a.alive || a.type !== 0) continue;
    if (Math.hypot(a.model.position.x - me.x, a.model.position.z - me.z) > 26) continue;
    const [x, y] = rel(a.model.position.x, a.model.position.z);
    g.fillStyle = '#8d5a3a'; g.strokeStyle = '#f0c27a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 6, y + 5); g.lineTo(x - 6, y + 5); g.closePath(); g.fill(); g.stroke();
  }
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(c, c - 9); g.lineTo(c + 6, c + 6); g.lineTo(c, c + 3); g.lineTo(c - 6, c + 6); g.closePath(); g.fill();
}
function showEnd() {
  closeShopUi();
  const rows = snapPlayers.slice().sort((a, b) => b[10] - a[10] || a[11] - b[11]);
  const w = winners.length ? winners.map((i) => NAMES[i]).join(' va ') : 'Hech kim';
  const tot = S.tot;
  const medals = (S.endMsg && S.endMsg.med) || [];
  $('endscreen').innerHTML = `<h2>🏆 G'olib: ${w}</h2>
    <div class="endwrap" style="display:flex;gap:18px;flex-wrap:wrap;justify-content:center;align-items:flex-start">
      <table><tr><th></th><th>O'LDIRDI</th><th>YIQILDI</th>${tot ? '<th>JAMI G\'ALABA</th>' : ''}</tr>${rows.map((p) =>
    `<tr class="${winners.includes(p[0]) ? 'w' : ''}"><td style="color:${COLORS[p[0]]};text-align:left">${NAMES[p[0]]}</td><td>${p[10]}</td><td>${p[11]}</td>${tot ? `<td>${tot[p[0]].w}</td>` : ''}</tr>`).join('')}</table>
      <div class="medals">${medals.map((md, i) => `<div class="medal" style="animation-delay:${0.25 * i}s"><b>🏅 ${md.t}</b><span style="color:${COLORS[md.id]};font-weight:800">${NAMES[md.id]}</span> · ${md.v}</div>`).join('')}</div>
    </div><div id="nextr" style="opacity:.85;font-size:13px;margin-top:6px"></div>`;
  $('endscreen').classList.remove('hide');
  if (medals.length) setTimeout(A.sMedal, 300);
}

// ---------------- Kirish: klaviatura / sichqoncha ----------------
let keys = {}, fireHeld = false, fireLatch = false, jumpQ = false, lookDX = 0, lookDY = 0;
const joy = { x: 0, y: 0 };
function lockPointer() { try { const p = $('c').requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ } }
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && S.phase === 'play' && !isTouch) openPause(); });
function cycleGrenade() {
  for (let k = 1; k <= GRENADES.length; k++) { const i = (me.selG + k) % GRENADES.length; if (me.gren[i] > 0) { me.selG = i; break; } }
  renderGrens();
}
document.addEventListener('keydown', (e) => {
  if (S.phase === 'shop') { if (e.code === 'KeyB' || e.code === 'Escape') { closeShop(); e.preventDefault(); } return; }
  if (S.phase !== 'play') return;
  if (e.repeat && e.code !== 'Space') { e.preventDefault(); return; }
  keys[e.code] = true;
  if (e.code === 'Space') { jumpQ = true; e.preventDefault(); }
  else if (e.code === 'KeyR') doReload();
  else if (e.code >= 'Digit1' && e.code <= 'Digit5') selectWeapon(+e.code.slice(5) - 1);
  else if (e.code === 'KeyG') throwGrenade();
  else if (e.code === 'KeyQ') cycleGrenade();
  else if (e.code === 'KeyB') openShop();
  else if (e.code === 'Tab') e.preventDefault();
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });
document.addEventListener('mousemove', (e) => {
  if (S.phase === 'play' && document.pointerLockElement) { lookDX += e.movementX || 0; lookDY += e.movementY || 0; }
});
document.addEventListener('mousedown', (e) => {
  if (S.phase !== 'play' || isTouch) return;
  if (!document.pointerLockElement) { lockPointer(); return; }
  if (e.button === 0) { fireHeld = true; } else if (e.button === 2) setAds(true);
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) { fireHeld = false; fireLatch = false; } else if (e.button === 2) setAds(false); });
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('wheel', (e) => {
  if (S.phase !== 'play') return;
  const dir = e.deltaY > 0 ? 1 : -1;
  for (let k = 1; k <= WEAPONS.length; k++) { const i = (me.w + dir * k + WEAPONS.length * 2) % WEAPONS.length; if (me.own[i]) { selectWeapon(i); break; } }
}, { passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys = {}; fireHeld = false; } });

// ---------------- Kirish: sensorli ekran ----------------
const touches = new Map();
let joyTouch = null;
function btnDown(id) {
  if (id === 'bFire') { fireHeld = true; }
  else if (id === 'bJump') jumpQ = true;
  else if (id === 'bCrouch') { crouchTog = !crouchTog; $('bCrouch').classList.toggle('on', crouchTog); }
  else if (id === 'bReload') doReload();
  else if (id === 'bAim') setAds(!me.ads);
  else if (id === 'bGren') throwGrenade();
  else if (id === 'bShop') openShop();
  else if (id === 'bMenu') openPause();
}
function btnUp(id) { if (id === 'bFire') { fireHeld = false; fireLatch = false; } }
const FIRE_DEADZONE = 20;   // OTISH tugmasini bosganda barmoq biroz siljisa nishon surilmaydi
if (isTouch) {
  $('touch').classList.remove('hide');
  $('helpPC').classList.add('hide'); $('helpTouch').classList.remove('hide');
  document.addEventListener('touchstart', (e) => {
    if (S.phase !== 'play') return;
    for (const t of e.changedTouches) {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const btn = el && el.closest ? el.closest('.tb') : null;
      const slot = el && el.closest ? el.closest('.slot') : null;
      const chip = el && el.closest ? el.closest('.chip') : null;
      if (slot) { selectWeapon(+slot.dataset.i); touches.set(t.identifier, { type: 'none' }); continue; }
      if (chip) { me.selG = +chip.dataset.g; renderGrens(); touches.set(t.identifier, { type: 'none' }); continue; }
      if (btn) {
        touches.set(t.identifier, { type: 'btn', id: btn.id, sx: t.clientX, sy: t.clientY, lx: t.clientX, ly: t.clientY, moved: false });
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
      } else if (o.type === 'look') {
        lookDX += t.clientX - o.lx; lookDY += t.clientY - o.ly; o.lx = t.clientX; o.ly = t.clientY;
      } else if (o.type === 'btn' && o.id === 'bFire') {
        // o'lik zona: avval barmoq 20 px dan ko'p siljimaguncha nishon qimirlamaydi
        if (!o.moved) {
          if (Math.hypot(t.clientX - o.sx, t.clientY - o.sy) > FIRE_DEADZONE) { o.moved = true; o.lx = t.clientX; o.ly = t.clientY; }
        } else {
          lookDX += (t.clientX - o.lx) * 0.85; lookDY += (t.clientY - o.ly) * 0.85; o.lx = t.clientX; o.ly = t.clientY;
        }
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
function setAds(v) {
  me.ads = !!v && me.alive && !me.reloading;
  $('bAim').classList.toggle('on', me.ads);
}
function selectWeapon(i) {
  if (!me.alive || i === me.w || (S.phase !== 'play') || !me.own[i]) return;
  me.w = i; setAds(false); me.reloading = false; me.nextFire = performance.now() + 300; fireLatch = true; recPend = 0;
  setVmWeapon(i); A.sSwitch(); send({ t: 'w', i }); lastHud.w = null; renderSlots();
}
function startReloadLocal() {
  const wd = WEAPONS[me.w];
  me.reloading = true; me.reloadStart = performance.now(); me.reloadEnd = me.reloadStart + wd.reload * 1000; setAds(false);
  A.sReload(wd.id);
}
function doReload() {
  if (!me.alive || me.reloading || S.phase !== 'play') return;
  const wd = WEAPONS[me.w];
  if (me.ammo[me.w] >= wd.mag) return;
  startReloadLocal(); send({ t: 'r' });
}
function throwGrenade() {
  if (!me.alive || S.phase !== 'play' || roundPhase !== 'play' || !me.shopOpen) return;
  if (me.gren[me.selG] <= 0) {
    const i = me.gren.findIndex((c) => c > 0);
    if (i < 0) { toast('Granata yo\'q — do\'kondan oling'); A.sDeny(); return; }
    me.selG = i;
  }
  const i = me.selG;
  me.gren[i]--; renderGrens(); vm.thr = 1;
  send({ t: 'g', i, yaw: +me.yaw.toFixed(4), pitch: +me.pitch.toFixed(4) });
  A.sThrow();
}
function tryFire(t) {
  if (!me.alive || roundPhase !== 'play' || me.reloading || t < me.nextFire || !me.own[me.w]) return;
  const wd = WEAPONS[me.w];
  if (me.ammo[me.w] <= 0) { if (!fireLatch) A.sEmpty(); fireLatch = true; doReload(); return; }
  if (!wd.auto && fireLatch) return;
  fireLatch = true;
  me.nextFire = t + wd.interval * 1000;
  me.ammo[me.w]--;
  const o = [me.x, me.y + me.eye, me.z];
  send({ t: 'shoot', yaw: me.yaw, pitch: me.pitch, z: me.ads, ox: +o[0].toFixed(2), oy: +o[1].toFixed(2), oz: +o[2].toFixed(2) });
  A.sShot(wd.id, 0.9, 0);
  vm.kick = Math.min(1.5, vm.kick + 0.75); vm.flashT = 0.045;
  // zarba silliq: kamera asta-sekin ko'tariladi (sakrab ketmaydi), yon tomonga tasodifiy siljish yo'q
  recPend += wd.recoil * (me.ads ? 0.45 : 0.8) * (me.cr ? 0.7 : 1);
}

// ---------------- Avto-nishon yordami ----------------
function aimAssist(dt) {
  me.assisting = false;
  if (!settings.assist || !me.alive || !(fireHeld || me.ads)) return;
  const cone = me.ads ? 0.075 : 0.055;
  const ex = me.x, ey = me.y + me.eye, ez = me.z;
  let best = null, bd = cone;
  const test = (cx, cy, cz, tag) => {
    const dx = cx - ex, dy = cy - ey, dz = cz - ez, hd = Math.hypot(dx, dz), d = Math.hypot(hd, dy);
    if (d > 70 || d < 1) return;
    const yawT = Math.atan2(-dx, -dz), pitchT = Math.atan2(dy, hd);
    const err = Math.hypot(angDiff(me.yaw, yawT) * Math.cos(me.pitch), pitchT - me.pitch);
    if (err >= bd) return;
    if (raycastWorld(ex, ey, ez, dx / d, dy / d, dz / d, d) < d - 0.6) return;
    if (fx.smokeAt(cx, cy, cz)) return;
    bd = err; best = { yawT, pitchT, tag };
  };
  for (const o of others.values()) if (o.alive) test(o.model.root.position.x, o.model.root.position.y + (o.cr ? 0.85 : 1.3), o.model.root.position.z);
  for (const a of animals.values()) if (a.alive) test(a.model.position.x, a.type === 0 ? 1.0 : 0.5, a.model.position.z);
  if (!best) return;
  me.assisting = true;
  const k = Math.min(1, dt * (me.ads ? 7 : 4.5));
  me.yaw += angDiff(me.yaw, best.yawT) * k;
  me.pitch = clamp(me.pitch + (best.pitchT - me.pitch) * k, -1.45, 1.45);
}

// ---------------- Asosiy sikl ----------------
let lastT = performance.now(), fpsAcc = 0, fpsN = 0, fov = 75, bobT = 0;
const MENU_CAM = [{ r: 30, h: 9, p: -0.22 }, { r: 44, h: 12, p: -0.25 }, { r: 29, h: 10, p: -0.24 }];
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  fpsAcc += dt; fpsN++; if (fpsAcc >= 1) { S.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  const active = S.phase === 'play' || S.phase === 'pause' || S.phase === 'shop';
  const tt = now / 1000;

  if (active) {
    updateLocal(dt, now);
    updateOthers(dt, now);
    updateAnimals(dt, now);
    updateEffects(dt, now);
    updateHud(now, dt);
  }
  fx.update(dt);
  world.pickups.forEach((g, i) => { g.rotation.y = tt * 1.5 + i; g.position.y = (g.userData.y0 || 0) + 0.75 + Math.sin(tt * 2 + i) * 0.08; });

  renderer.clear();
  if (!active) {   // menyuda: xarita bo'ylab aylanuvchi kamera
    const a = tt * 0.12, mc = MENU_CAM[world.mapId] || MENU_CAM[0];
    camera.position.set(Math.sin(a) * mc.r, mc.h, Math.cos(a) * mc.r); camera.rotation.set(mc.p, a, 0);
    camera.fov = 70; camera.updateProjectionMatrix();
    world.update(tt, camera.position);
    renderer.render(scene, camera);
    return;
  }
  world.update(tt, camera.position);
  renderer.render(scene, camera);
  if (me.alive && !(me.w === W_SNIPER && me.adsT > 0.92) && me.flashEnd < now) { renderer.clearDepth(); renderer.render(gunScene, gunCam); }
}

function updateLocal(dt, now) {
  const wd = WEAPONS[me.w];
  const playing = S.phase === 'play';
  me.adsT += ((me.ads ? 1 : 0) - me.adsT) * Math.min(1, dt * 13);
  if (Math.abs(me.adsT - (me.ads ? 1 : 0)) < 0.002) me.adsT = me.ads ? 1 : 0;
  // qarash
  const zf = 1 + (1 / wd.zoom - 1) * me.adsT;
  const sens = settings.sens * (isTouch ? 0.0042 : 0.0022) * zf * (me.adsT > 0.5 ? settings.adsens / 0.8 : 1);
  if (playing && me.alive) {
    me.yaw -= lookDX * sens; me.pitch = clamp(me.pitch - lookDY * sens, -1.45, 1.45);
    vm.swayX = clamp(vm.swayX + lookDX * 0.00035, -0.05, 0.05); vm.swayY = clamp(vm.swayY + lookDY * 0.00035, -0.05, 0.05);
  }
  lookDX = lookDY = 0;
  // zarbaning silliq ta'siri
  if (recPend > 0) { const a = recPend * Math.min(1, dt * 16); recPend -= a; me.pitch = clamp(me.pitch + a, -1.45, 1.45); }
  if (playing) aimAssist(dt); else me.assisting = false;

  // harakat
  if (me.alive) {
    let ix = 0, iz = 0;
    if (playing) {
      ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
      iz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
    }
    const L = Math.hypot(ix, iz); if (L > 1) { ix /= L; iz /= L; }
    const wantCr = playing && (keys.KeyC || keys.ControlLeft || keys.ControlRight || crouchTog);
    const sp = 5.4 * wd.speed * (1 - (me.w === W_SNIPER ? 0.4 : 0.22) * me.adsT) * (me.cr ? CROUCH_SPEED : 1);
    const fx_ = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
    let vx = (fx_ * iz + rx * ix) * sp, vz = (fz * iz + rz * ix) * sp;
    me.vxl = vx; me.vzl = vz;
    // buqaning zarbasidan siltanish
    if (me.kbx || me.kbz) {
      vx += me.kbx; vz += me.kbz;
      const d = Math.exp(-dt * 5.5); me.kbx *= d; me.kbz *= d;
      if (Math.hypot(me.kbx, me.kbz) < 0.2) me.kbx = me.kbz = 0;
    }
    const jump = jumpQ && playing; jumpQ = false;
    const wasGround = me.onGround;
    stepPlayer(me, vx, vz, jump, dt, !!wantCr);
    me.cr = me.cr ? 1 : 0;
    me.eye += ((me.cr ? EYE_C : EYE) - me.eye) * Math.min(1, dt * 14);
    if (me.onGround && Math.hypot(vx, vz) > 1) {
      me.stepT -= dt; if (me.stepT <= 0) { me.stepT = 0.38; A.sStep(0.06); }
    }
    if (me.onGround && !wasGround) A.sStep(0.12);
    bobT += dt * Math.hypot(vx, vz) * 1.7;
    // otish
    if (playing && fireHeld) tryFire(now);
    if (!fireHeld) fireLatch = false;
    if (me.reloading && now >= me.reloadEnd + 400) me.reloading = false;   // server xabari kelmasa ham tiqilib qolmasin
  } else { jumpQ = false; me.vxl = me.vzl = 0; }

  // tarmoqqa yuborish (30 Hz)
  if (now - lastInSend > 33 && ws && ws.readyState === 1 && me.alive) {
    lastInSend = now;
    ws.send(`{"t":"in","rs":${me.rs},"x":${me.x.toFixed(3)},"y":${me.y.toFixed(3)},"z":${me.z.toFixed(3)},"yaw":${me.yaw.toFixed(4)},"pitch":${me.pitch.toFixed(4)},"cr":${me.cr}}`);
  }
  if (now - pingT > 2000 && ws && ws.readyState === 1) { pingT = now; send({ t: 'p', ts: now, rtt: S.ping }); }

  // kamera
  const targetFov = 75 / (1 + (wd.zoom - 1) * me.adsT);
  fov += (targetFov - fov) * Math.min(1, dt * 16);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  shake = Math.max(0, shake - dt * 2.4);
  const sh = shake * shake * 0.05;
  if (me.alive) {
    camera.position.set(me.x, me.y + me.eye, me.z);
    camera.rotation.set(me.pitch + (sh ? (Math.random() - 0.5) * sh : 0), me.yaw + (sh ? (Math.random() - 0.5) * sh : 0), 0);
  } else {
    const killer = S.killer >= 0 ? others.get(S.killer) : null;
    const k = Math.min(1, (now - me.deadAt) / 500);
    camera.position.set(me.x, me.y + me.eye - 0.9 * k, me.z);
    if (killer && killer.alive && now - me.deadAt < 2900) {
      // o'ldirgan o'yinchiga qarab turadi va uni kuzatadi
      const kp = killer.model.root.position;
      camera.lookAt(kp.x, kp.y + (killer.cr ? 0.9 : 1.35), kp.z);
      camera.rotation.z = 0.25 * k;
    } else {
      camera.rotation.set(me.pitch * (1 - k) - 0.2 * k, me.yaw, 0.7 * k);
    }
  }
}

function updateEffects(dt, now) {
  // birinchi shaxs quroli: hamma harakat silliq (spring/exponential)
  const i = me.w, V = VM[i];
  vm.kick = Math.max(0, vm.kick - dt * 7);
  vm.ks += (vm.kick - vm.ks) * Math.min(1, dt * 26);
  vm.sw = Math.min(1, vm.sw + dt * 4.5);
  vm.flashT = Math.max(0, vm.flashT - dt);
  vm.thr = Math.max(0, vm.thr - dt * 3.2);
  vm.swayX *= Math.exp(-dt * 9); vm.swayY *= Math.exp(-dt * 9);
  vm.flashes.forEach((f, k) => { f.visible = k === i && vm.flashT > 0 && me.adsT < 0.9; if (f.visible) { f.rotation.z = Math.random() * 6; const s = 0.8 + Math.random() * 0.4; f.scale.set(s, s, 1); } });
  const a = me.adsT, e = a * a * (3 - 2 * a);                    // yumshoq o'tish
  const spd = Math.min(1, Math.hypot(me.vxl || 0, me.vzl || 0) / 5);
  const bobx = Math.sin(bobT) * 0.005 * spd * (1 - e), boby = Math.abs(Math.cos(bobT)) * 0.005 * spd * (1 - e);
  let rl = 0;
  if (me.reloading) { const p = clamp((now - me.reloadStart) / Math.max(1, me.reloadEnd - me.reloadStart), 0, 1); rl = Math.sin(p * Math.PI); }
  const kk = vm.ks * (0.45 + wd_k(i)) * (1 - e * 0.5);
  const hx = V.hip[0] * (1 - e), hy = V.hip[1] * (1 - e) + -(V.sight * V.sc + 0.004) * e, hz = V.hip[2] * (1 - e) + V.adsZ * e;
  const tx = hx + bobx - vm.swayX * 0.5, ty = hy + boby + vm.swayY * 0.4 - (1 - vm.sw) * 0.28 - rl * 0.15 - vm.thr * 0.12, tz = hz + kk * 0.018;
  vm.root.position.set(tx, ty, tz);
  vm.root.rotation.set(kk * 0.032 + rl * 0.5 + vm.thr * 0.5, -vm.swayX * 0.6, rl * -0.3);

  const nr = $('nextr'); if (nr && roundPhase === 'end') nr.textContent = `Keyingi raund ${Math.ceil(roundLeft)} soniyadan keyin` +
    (nextMapId !== null && nextMapId !== undefined ? ` · xarita: ${MAP_NAMES[nextMapId]}` : '') + (nextModeId !== null && nextModeId !== undefined ? ` · rejim: ${MODES[nextModeId].name}` : '');
}
const wd_k = (i) => 0.3 + WEAPONS[i].recoil * 20;

// ---------------- Ishga tushirish ----------------
buildNames();
$('sens').oninput = (e) => { settings.sens = parseFloat(e.target.value); store.set('sens', settings.sens); };
$('adsens').oninput = (e) => { settings.adsens = parseFloat(e.target.value); store.set('adsens', settings.adsens); };
$('vol').oninput = (e) => { settings.vol = parseFloat(e.target.value); store.set('vol', settings.vol); A.setVolume(settings.vol); };
$('qual').onchange = (e) => { settings.quality = e.target.value; store.set('quality', settings.quality); applyQuality(); };
$('assist').onchange = (e) => { settings.assist = e.target.checked; store.set('assist', settings.assist ? '1' : '0'); };
$('radarck').onchange = (e) => { settings.radar = e.target.checked; store.set('radar', settings.radar ? '1' : '0'); $('radar').style.display = settings.radar ? '' : 'none'; };
$('fpsck').onchange = (e) => { settings.stats = e.target.checked; store.set('stats', settings.stats ? '1' : '0'); if (!settings.stats) $('stats').textContent = ''; };
$('radar').style.display = settings.radar ? '' : 'none';
$('play').onclick = join;
$('resume').onclick = resume;
$('leave').onclick = leave;
if (isNative || qs.get('server')) {
  $('srvrow').classList.remove('hide');
  $('srv').value = qs.get('server') || settings.server || DEFAULT_SERVER;
  $('srvok').onclick = () => { settings.server = $('srv').value.trim(); store.set('server', settings.server); connect(); };
}
if (S.name === null && settings.name && NAMES.includes(settings.name)) S.name = settings.name;
if (isNative && !S.auto && settings.name && NAMES.includes(settings.name)) S.auto = settings.name; // APK: oxirgi ism bilan o'zi kiradi
buildNames();
renderCfg();
applyQuality();
setVmWeapon(1);
connect();
// menyudagi tanlov: serverdan "band" ismlar ro'yxatini yangilab turamiz
setInterval(() => { if (S.phase === 'menu' && ws && ws.readyState === 1) send({ t: 'l' }); }, 3000);
requestAnimationFrame(frame);
window.__game = { S, me, others, animals, world, fx, send, setFire(v) { fireHeld = v; if (!v) fireLatch = false; }, selectWeapon, setW(i) { me.w = i; me.own[i] = true; setVmWeapon(i); lastHud.w = null; }, doReload, openShop, closeShop, throwGrenade, setAds,
  get ws() { return ws; }, scene, camera, renderer, vm, settings };
