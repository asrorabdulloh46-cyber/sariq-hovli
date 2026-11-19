// Server va klient birgalikda ishlatadigan konstantalar
export const NAMES = ['Tohir', 'Abdulatif', 'Asror', 'Muhammad', 'Sunnatulloh'];
export const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa'];
// Botlar (server boshqaradi): id = 5..12
export const BOT_NAMES = ['Bot Jasur', 'Bot Sardor', 'Bot Otabek', 'Bot Doniyor', 'Bot Farrux', 'Bot Bahodir', 'Bot Shoxrux', 'Bot Ulugbek'];
export const BOT_COLORS = ['#6d7b52', '#7a6a55', '#59656f', '#6b5b73', '#4f6b62', '#806848', '#5d6a7e', '#735a52'];
export const ALL_NAMES = [...NAMES, ...BOT_NAMES];
export const ALL_COLORS = [...COLORS, ...BOT_COLORS];
export const BOT0 = NAMES.length;           // birinchi bot id
export const isBot = (id) => id >= BOT0;
// Bot kuchi darajalari (o'yindan oldin tanlanadi)
export const BOT_LEVELS = [
  { name: 'Juda kuchsiz', desc: 'Sekin, ko\'p xato qiladi, zarari kam', dmg: 0.25, react: 1.4, err: 0.13, rate: 1.0, range: 32, hp: 60, speed: 0.6 },
  { name: 'Kuchsiz', desc: 'Oddiy raqib', dmg: 0.45, react: 0.95, err: 0.085, rate: 0.75, range: 45, hp: 80, speed: 0.75 },
  { name: 'O\'rtacha', desc: 'Yaxshi otadi', dmg: 0.7, react: 0.6, err: 0.05, rate: 0.5, range: 60, hp: 100, speed: 0.9 },
  { name: 'Kuchli', desc: 'Tez va aniq', dmg: 1.0, react: 0.35, err: 0.028, rate: 0.32, range: 80, hp: 120, speed: 1.0 },
];
export const BOT_COUNT = 8;

// O'yinchi o'lchamlari (metr)
export const R = 0.32;      // yarim kenglik
export const H = 1.75;      // bo'y
export const EYE = 1.62;    // ko'z balandligi
export const HC = 1.2;      // o'tirganda bo'y
export const PS = 1.2;      // o'yinchi modeli va zarba qutisi kattalashtirish koeffitsiyenti (fizika o'zgarmaydi)
export const AS = 1.3;      // hayvonlar kattalashtirish koeffitsiyenti
export const EYE_C = 1.1;   // o'tirganda ko'z balandligi
export const CROUCH_SPEED = 0.5;  // o'tirganda tezlik koeffitsiyenti
export const LOW_GRAV = 0.38;     // "Oy tortishishi" rejimida tortishish koeffitsiyenti

export const MAX_HP = 250;       // odam joni (tez o'lmasin)
export const RESPAWN_MS = 3000;
export const SPAWN_INV_MS = 2500;
export const ROUND_SEC = 300;     // 5 daqiqa
export const END_SEC = 14;        // raund oxiri natija ko'rsatish
export const KILL_LIMIT = 20;     // shuncha o'ldirgan yutadi
export const HEAD_MULT = 2;
export const PICKUP_HEAL = 100;
export const PICKUP_RESPAWN_MS = 25000;

// ---- Qurollar (tartibi: 1-5 tugmalar) ----
// pellets: bir o'qda nechta zarra (pompali), pen: devordan o'tish koeffitsiyenti (0 = o'tmaydi),
// price: do'kondagi narxi (0 = boshidan bor yoki bepul), start: boshida bormi
export const WEAPONS = [
  { id: 'pistol', name: 'Pistolet', dmg: 24, interval: 0.22, mag: 400, reload: 1.2,
    spread: 0.008, auto: false, range: 90, recoil: 0.010, speed: 1.0, zoom: 1.25, pellets: 1, pen: 0, price: 0, start: true },
  { id: 'rifle', name: 'Avtomat', dmg: 17, interval: 0.1, mag: 400, reload: 2.1,
    spread: 0.016, auto: true, range: 110, recoil: 0.0065, speed: 0.95, zoom: 1.5, pellets: 1, pen: 0, price: 0, start: true },
  { id: 'smg', name: 'Mini-avtomat', dmg: 12, interval: 0.068, mag: 400, reload: 1.7,
    spread: 0.022, auto: true, range: 70, recoil: 0.005, speed: 1.05, zoom: 1.35, pellets: 1, pen: 0, price: 0, start: false },
  { id: 'shotgun', name: 'Pompali', dmg: 9, interval: 0.8, mag: 400, reload: 2.4,
    spread: 0.05, auto: false, range: 38, recoil: 0.03, speed: 0.95, zoom: 1.2, pellets: 9, pen: 0, price: 0, start: false },
  { id: 'sniper', name: 'Snayper', dmg: 90, interval: 1.1, mag: 400, reload: 2.4,
    spread: 0.0015, hipSpread: 0.05, auto: false, range: 250, recoil: 0.035, speed: 0.85, zoom: 3, pellets: 1, pen: 0, price: 0, start: false },
];
export const W_SNIPER = 4, W_PISTOL = 0, W_RIFLE = 1;

// ---- Granatalar ----
export const GRENADES = [
  { id: 'frag', name: 'Granata', price: 0, fuse: 2.2 },
  { id: 'smoke', name: 'Tutun', price: 0, fuse: 1.6 },
  { id: 'flash', name: 'Flash', price: 0, fuse: 1.5 },
];
export const GREN_MAX = 99;      // 99 = cheksiz (ishlatilganda kamaymaydi)
export const FRAG_RADIUS = 6.5, FRAG_DMG = 115, FLASH_RADIUS = 28, SMOKE_SEC = 14;

// ---- Iqtisod ----
export const START_MONEY = 800, KILL_MONEY = 300, HEAD_BONUS = 100, REVENGE_BONUS = 150, MONEY_CAP = 9000;
export const ARMOR_PRICE = 0, HELMET_PRICE = 0, WIN_BONUS = 1000;
export const ARMOR_ABSORB = 0.5;    // zirh bor bo'lsa zarar yarmi zirhga ketadi
export const HELMET_HEAD = 0.55;    // dubulg'a: kallaga zarar koeffitsiyenti

// ---- O'yin rejimlari ----
export const MODES = [
  { id: 'klassik', name: 'Klassik', desc: 'Pul bilan qurol va granata sotib olasiz' },
  { id: 'snayper', name: 'Faqat snayper', desc: 'Hamma snayperda' },
  { id: 'pistolet', name: 'Faqat pistolet', desc: 'Hamma pistoletda' },
  { id: 'bitta', name: 'Bitta o\'q', desc: 'Bitta o\'q bitta o\'lim' },
  { id: 'oy', name: 'Oy tortishishi', desc: 'Juda baland sakraysiz' },
];

// ---- Hayvonlar (bot) ----
// t: 0 buqa, 1 cho'chqa
export const ANIMALS = [
  { id: 'bull', name: 'Buqa', hp: 150, half: 0.7, h: 1.5, rewardHp: 35, rewardMoney: 400,
    walk: 1.3, charge: 5.2, gore: 22, goreCd: 1.8, aggro: 8.5 },
  { id: 'pig', name: "Cho'chqa", hp: 60, half: 0.45, h: 0.85, rewardHp: 20, rewardMoney: 150,
    walk: 1.4, flee: 5.6 },
];
export const ANIMAL_RESPAWN_MS = 25000;
