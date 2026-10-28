// Poyga o'yini: server va klient birgalikda ishlatadigan konstantalar
export const NAMES = ['Tohir', 'Abdulatif', 'Asror', 'Muhammad', 'Sunnatulloh'];

// Har bir o'yinchining mashinasi (NAMES tartibida)
export const CARS = [
  { id: 'nexia3', name: 'Nexia 3', len: 4.5, wid: 1.78 },
  { id: 'nexia2', name: 'Nexia 2', len: 4.35, wid: 1.7 },
  { id: 'w211', name: 'Mercedes W211', len: 4.85, wid: 1.82 },
  { id: 'cobalt', name: 'Cobalt', len: 4.5, wid: 1.74 },
  { id: 'matiz', name: 'Matiz', len: 3.65, wid: 1.6 },
];

// 5 ta rang
export const COLORS = [
  { id: 'oq', name: 'Oq', hex: '#f1f1ee' },
  { id: 'kulrang', name: 'Kulrang', hex: '#8b9096' },
  { id: 'qora', name: 'Qora', hex: '#17191c' },
  { id: 'yashil', name: 'Yashil', hex: '#1d8a3a' },
  { id: 'sariq', name: 'Sariq', hex: '#f3c40b' },
];
// Boshlang'ich rang (NAMES tartibida): Tohir oq, Abdulatif kulrang, Asror qora, Muhammad sariq, Sunnatulloh yashil
export const DEFAULT_COLOR = [0, 1, 2, 4, 3];

export const MODES = [
  { id: 'oddiy', name: 'Oddiy poyga', laps: 3 },
  { id: 'qisqa', name: 'Qisqa poyga', laps: 1 },
  { id: 'uzun', name: 'Uzun poyga', laps: 5 },
];

// Sovg'alar
export const ITEMS = [
  { id: 'boost', name: 'Tezlashtirish', icon: '🚀' },
  { id: 'shield', name: 'Qalqon', icon: '🛡️' },
  { id: 'fog', name: 'Tuman', icon: '🌫️' },
  { id: 'oil', name: 'Moy dog\'i', icon: '🛢️' },
];

export const MAX_PLAYERS = 5;
export const COUNT_MS = 6000;        // start oldidan sanoq (oxirgi 3 soniyasi 3-2-1)
export const GO_AT_MS = 3000;        // sanoqning shuncha mS qismida 3-2-1 boshlanadi
export const FINISH_WAIT_MS = 45000; // birinchi odam tugatgach qolganlarga vaqt
export const RESULTS_MS = 16000;
export const ITEM_RESPAWN_MS = 7000;
export const OIL_LIFE_MS = 22000;
export const SHIELD_MS = 15000;
export const FOG_MS = 4500;
export const SLIP_MS = 1500;
export const BOOST_MS = 2200;
