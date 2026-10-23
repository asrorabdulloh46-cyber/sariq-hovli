// Server va klient birgalikda ishlatadigan konstantalar
export const NAMES = ['Tohir', 'Abdulatif', 'Asror', 'Muhammad', 'Sunnatulloh'];
export const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa'];

// O'yinchi o'lchamlari (metr)
export const R = 0.32;      // yarim kenglik
export const H = 1.75;      // bo'y
export const EYE = 1.62;    // ko'z balandligi
export const HC = 1.2;      // o'tirganda bo'y
export const EYE_C = 1.1;   // o'tirganda ko'z balandligi
export const CROUCH_SPEED = 0.5;  // o'tirganda tezlik koeffitsiyenti
export const LOW_GRAV = 0.38;     // "Oy tortishishi" rejimida tortishish koeffitsiyenti

export const MAX_HP = 100;
export const RESPAWN_MS = 3000;
export const SPAWN_INV_MS = 2500;
export const ROUND_SEC = 300;     // 5 daqiqa
export const END_SEC = 14;        // raund oxiri natija ko'rsatish
export const KILL_LIMIT = 20;     // shuncha o'ldirgan yutadi
export const HEAD_MULT = 2;
export const PICKUP_HEAL = 50;
export const PICKUP_RESPAWN_MS = 25000;

// ---- Qurollar (tartibi: 1-5 tugmalar) ----
// pellets: bir o'qda nechta zarra (pompali), pen: devordan o'tish koeffitsiyenti (0 = o'tmaydi),
// price: do'kondagi narxi (0 = boshidan bor yoki bepul), start: boshida bormi
export const WEAPONS = [
  { id: 'pistol', name: 'Pistolet', dmg: 24, interval: 0.22, mag: 20, reload: 1.2,
    spread: 0.008, auto: false, range: 90, recoil: 0.010, speed: 1.0, zoom: 1.25, pellets: 1, pen: 0, price: 0, start: true },
  { id: 'rifle', name: 'Avtomat', dmg: 17, interval: 0.1, mag: 60, reload: 2.1,
    spread: 0.016, auto: true, range: 110, recoil: 0.0065, speed: 0.95, zoom: 1.5, pellets: 1, pen: 0.5, price: 0, start: true },
  { id: 'smg', name: 'Mini-avtomat', dmg: 12, interval: 0.068, mag: 50, reload: 1.7,
    spread: 0.022, auto: true, range: 70, recoil: 0.005, speed: 1.05, zoom: 1.35, pellets: 1, pen: 0, price: 500, start: false },
  { id: 'shotgun', name: 'Pompali', dmg: 9, interval: 0.8, mag: 12, reload: 2.4,
    spread: 0.05, auto: false, range: 38, recoil: 0.03, speed: 0.95, zoom: 1.2, pellets: 9, pen: 0, price: 900, start: false },
  { id: 'sniper', name: 'Snayper', dmg: 90, interval: 1.1, mag: 10, reload: 2.4,
    spread: 0.0015, hipSpread: 0.05, auto: false, range: 250, recoil: 0.035, speed: 0.85, zoom: 3, pellets: 1, pen: 0.7, price: 1700, start: false },
];
export const W_SNIPER = 4, W_PISTOL = 0, W_RIFLE = 1;

// ---- Granatalar ----
export const GRENADES = [
  { id: 'frag', name: 'Granata', price: 300, fuse: 2.2 },
  { id: 'smoke', name: 'Tutun', price: 200, fuse: 1.6 },
  { id: 'flash', name: 'Flash', price: 200, fuse: 1.5 },
];
export const GREN_MAX = 2;
export const FRAG_RADIUS = 6.5, FRAG_DMG = 115, FLASH_RADIUS = 28, SMOKE_SEC = 14;

// ---- Iqtisod ----
export const START_MONEY = 800, KILL_MONEY = 300, HEAD_BONUS = 100, REVENGE_BONUS = 150, MONEY_CAP = 9000;
export const ARMOR_PRICE = 600, HELMET_PRICE = 350, WIN_BONUS = 1000;
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
