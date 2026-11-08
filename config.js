// Termiz GTA — konfiguratsiya
export const DEFAULT_SERVER = typeof window !== 'undefined'
  ? (window.location.hostname === 'localhost' ? 'ws://localhost:3000/ws3' : `wss://${window.location.hostname}/ws3`)
  : 'wss://sariq-hovli.onrender.com/ws3';

export const MAP_PATH = './data/map.json';
export const CHUNK_SIZE = 250;    // metr
export const VIEW_DIST  = 650;    // ko'rish masofasi (metr)
export const FAR_CLIP   = 800;
export const NEAR_CLIP  = 0.3;

export const PLAYER_SPEED  = 5.0;   // m/s yurish
export const PLAYER_SPRINT = 10.0;  // m/s yugurish
export const PLAYER_H      = 1.75;  // balandlik
export const GRAVITY       = 20;

export const INTERP_MS = 130;
export const SEND_HZ   = 24;        // ms oralig'i: 1000/SEND_HZ ≈ 42ms

export const WANTED_LEVELS = 5;
export const POLICE_RESPONSE_TIME = [0, 15, 8, 5, 3, 2]; // seconds per level

// Sariq Hovlidan kelgan ismlar
export const PLAYER_NAMES = ['Tohir', 'Abdulatif', 'Asror', 'Muhammad', 'Sunnatulloh'];

// Spawn nuqtasi — Hakim at-Termiziy jome masjidi yaqinida
export const SPAWN_X = 2264.1;
export const SPAWN_Z = -1221.3;
export const SPAWN_RADIUS = 30; // metr
