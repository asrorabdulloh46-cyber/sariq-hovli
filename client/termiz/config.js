// Termiz GTA — konfiguratsiya
export const DEFAULT_SERVER = typeof window !== 'undefined'
  ? (window.location.hostname === 'localhost' ? 'ws://localhost:3000/ws3' : `wss://${window.location.hostname}/ws3`)
  : 'wss://sariq-hovli.onrender.com/ws3';

export const MAP_PATH = './data/map.json';
export const CHUNK_SIZE = 200;    // metr
export const VIEW_DIST  = 560;    // ko'rish masofasi (metr)
export const FAR_CLIP   = 900;
export const NEAR_CLIP  = 0.25;

export const PLAYER_SPEED  = 4.6;   // m/s yurish
export const PLAYER_SPRINT = 8.4;   // m/s yugurish
export const PLAYER_H      = 1.75;  // balandlik
export const GRAVITY       = 22;

export const INTERP_MS = 130;
export const SEND_HZ   = 20;

export const WANTED_LEVELS = 5;
export const POLICE_RESPONSE_TIME = [0, 15, 8, 5, 3, 2];

// Sariq Hovlidan kelgan ismlar
export const PLAYER_NAMES = ['Tohir', 'Abdulatif', 'Asror', 'Muhammad', 'Sunnatulloh'];

// ── Hakim at-Termiziy jome masjidi ────────────────────────────────────────────
// Dunyo koordinatalari: x — g'arbga, z — shimolga (OSM proyeksiyasi).
// Bino 80.5 x 58.9 m, uzun o'qi qibla tomonga (Termizdan qibla ~244°).
export const MOSQUE = {
  cx: 2252.4, cz: -1215.5,          // markaz
  qx: 0.9045, qz: -0.4266,          // qibla yo'nalishi (birlik vektor)
  sx: 0.4266, sz: 0.9045,           // qiblaga ko'ndalang (o'ng tomon)
  L: 80.5,    W: 58.9,              // qibla bo'ylab uzunlik, eni
  id: '690451603',
};
// Spawn: masjid kirish tomonidagi maydon (qibla teskarisiga 78 m)
export const SPAWN_X = MOSQUE.cx - MOSQUE.qx * 78;
export const SPAWN_Z = MOSQUE.cz - MOSQUE.qz * 78;
export const SPAWN_RADIUS = 8;

// Sifat sozlamalari (touch → 'mid', kompyuter → 'high')
export const QUALITY = {
  low:  { pixelRatio: 1.0, shadows: false, normalMaps: false, peds: 8,  traffic: 6,  parked: 10, view: 360, trees: 0.5 },
  mid:  { pixelRatio: 1.5, shadows: false, normalMaps: true,  peds: 16, traffic: 10, parked: 18, view: 480, trees: 0.8 },
  high: { pixelRatio: 2.0, shadows: true,  normalMaps: true,  peds: 28, traffic: 18, parked: 30, view: 560, trees: 1.0 },
};
