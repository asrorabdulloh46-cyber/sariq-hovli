// Server va klient birgalikda ishlatadigan konstantalar
export const NAMES = ['Tohir', 'Abdulatif', 'Asror', 'Muhammad', 'Sunnatulloh'];
export const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa'];

// O'yinchi o'lchamlari (metr)
export const R = 0.32;      // yarim kenglik
export const H = 1.75;      // bo'y
export const EYE = 1.62;    // ko'z balandligi

export const MAX_HP = 100;
export const RESPAWN_MS = 3000;
export const SPAWN_INV_MS = 2500;
export const ROUND_SEC = 300;     // 5 daqiqa
export const END_SEC = 12;        // raund oxiri natija ko'rsatish
export const KILL_LIMIT = 20;     // shuncha o'ldirgan yutadi
export const HEAD_MULT = 2;
export const PICKUP_HEAL = 50;
export const PICKUP_RESPAWN_MS = 25000;

// 3 xil qurol
export const WEAPONS = [
  { id: 'pistol', name: 'Pistolet', dmg: 26, interval: 0.24, mag: 12, reload: 1.3,
    spread: 0.010, auto: false, range: 90, recoil: 0.014, speed: 1.0, zoom: 1 },
  { id: 'rifle', name: 'Avtomat', dmg: 17, interval: 0.095, mag: 30, reload: 2.0,
    spread: 0.020, auto: true, range: 110, recoil: 0.007, speed: 0.95, zoom: 1 },
  { id: 'sniper', name: 'Snayper', dmg: 85, interval: 1.2, mag: 5, reload: 2.4,
    spread: 0.0015, hipSpread: 0.05, auto: false, range: 250, recoil: 0.05, speed: 0.85, zoom: 3 },
];
