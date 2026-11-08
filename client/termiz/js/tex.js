// Termiz — teksturalar kutubxonasi (Poly Haven CC0) + atlas yig'ish
import * as THREE from 'three';

const BASE = './assets/tex/';

function loadImage(url) {
  return new Promise((res) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = url;
  });
}

export class TexLib {
  constructor(renderer, opts = {}) {
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.normalMaps = opts.normalMaps !== false;
    this.imgs = new Map();
    this.onProgress = opts.onProgress || (() => {});
  }

  // Barcha kerakli rasmlarni oldindan yuklash
  async preload(names) {
    let done = 0;
    const total = names.length * (this.normalMaps ? 2 : 1);
    const jobs = [];
    for (const n of names) {
      jobs.push(loadImage(`${BASE}${n}_d.jpg`).then(im => { this.imgs.set(n + '_d', im); this.onProgress(++done, total); }));
      if (this.normalMaps) jobs.push(loadImage(`${BASE}${n}_n.jpg`).then(im => { this.imgs.set(n + '_n', im); this.onProgress(++done, total); }));
    }
    await Promise.all(jobs);
  }

  _tex(im, srgb, repeat = true) {
    const t = new THREE.Texture(im);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = this.aniso;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
    return t;
  }

  // Oddiy takrorlanuvchi tekstura (map + normalMap)
  get(name, repeat = [1, 1]) {
    const d = this.imgs.get(name + '_d');
    const out = { map: null, normalMap: null };
    if (d) { out.map = this._tex(d, true); out.map.repeat.set(repeat[0], repeat[1]); }
    const n = this.imgs.get(name + '_n');
    if (n && this.normalMaps) { out.normalMap = this._tex(n, false); out.normalMap.repeat.set(repeat[0], repeat[1]); }
    return out;
  }

  // Atlas (cols x rows plitka). Har plitka tileSize piksel
  atlas(names, cols, rows, tileSize = 512) {
    const mk = (suffix, fillColor) => {
      const cv = document.createElement('canvas');
      cv.width = cols * tileSize; cv.height = rows * tileSize;
      const c = cv.getContext('2d');
      c.fillStyle = fillColor; c.fillRect(0, 0, cv.width, cv.height);
      names.forEach((n, i) => {
        const im = this.imgs.get(n + suffix);
        if (!im) return;
        c.drawImage(im, (i % cols) * tileSize, Math.floor(i / cols) * tileSize, tileSize, tileSize);
      });
      return cv;
    };
    const dCv = mk('_d', '#b8a98c');
    const map = new THREE.CanvasTexture(dCv);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = this.aniso;
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter;
    let normalMap = null;
    if (this.normalMaps) {
      const nCv = mk('_n', 'rgb(128,128,255)');
      normalMap = new THREE.CanvasTexture(nCv);
      normalMap.colorSpace = THREE.NoColorSpace;
      normalMap.anisotropy = this.aniso;
      normalMap.wrapS = normalMap.wrapT = THREE.ClampToEdgeWrapping;
      normalMap.generateMipmaps = true; normalMap.minFilter = THREE.LinearMipmapLinearFilter;
    }
    return { map, normalMap, cols, rows };
  }
}

// ── Kodda chiziladigan teksturalar (Poly Haven'da yo'q narsalar) ──────────────
export function canvasTexture(size, draw, { repeat = true, srgb = true } = {}) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Firuza sirlangan koshin (dome va minoralar uchun)
export function tileTexture() {
  return canvasTexture(256, (c, s) => {
    const g = c.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#1d8fa0'); g.addColorStop(1, '#0f6f8c');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    // naqsh: romb va yulduzlar
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 2;
    const step = s / 4;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const cx = x * step + step / 2, cy = y * step + step / 2;
      c.beginPath();
      c.moveTo(cx, cy - step * 0.42); c.lineTo(cx + step * 0.42, cy); c.lineTo(cx, cy + step * 0.42); c.lineTo(cx - step * 0.42, cy); c.closePath();
      c.stroke();
      c.fillStyle = 'rgba(12,45,95,0.55)'; c.beginPath(); c.arc(cx, cy, step * 0.12, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(230,200,110,0.8)'; c.beginPath(); c.arc(cx, cy, step * 0.2, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.55)';
    }
    c.strokeStyle = 'rgba(10,40,80,0.5)'; c.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * step, 0); c.lineTo(i * step, s); c.stroke(); c.beginPath(); c.moveTo(0, i * step); c.lineTo(s, i * step); c.stroke(); }
  });
}

// Namoz gilami (yashil, safli)
export function carpetTexture() {
  return canvasTexture(256, (c, s) => {
    c.fillStyle = '#1f5a3a'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#e8d9a8'; c.fillRect(0, 0, s, 6); c.fillRect(0, s - 6, s, 6);
    // mehrob shaklli saf
    for (let i = 0; i < 2; i++) {
      const x0 = i * s / 2 + 8, w = s / 2 - 16;
      c.fillStyle = '#2a7a4e'; c.beginPath(); c.moveTo(x0, s - 12); c.lineTo(x0, 90); c.quadraticCurveTo(x0 + w / 2, 10, x0 + w, 90); c.lineTo(x0 + w, s - 12); c.closePath(); c.fill();
      c.strokeStyle = '#e8d9a8'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#e8d9a8'; c.beginPath(); c.arc(x0 + w / 2, 110, 10, 0, Math.PI * 2); c.fill();
    }
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`; c.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
  });
}

// Minora/gumbaz bezak chizig'i (gul-ornament)
export function bandTexture() {
  return canvasTexture(128, (c, s) => {
    c.fillStyle = '#d9c9a0'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#176f8d'; c.fillRect(0, s * 0.18, s, s * 0.64);
    c.strokeStyle = '#e9d28a'; c.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const cx = i * s / 4 + s / 8, cy = s / 2;
      c.beginPath(); c.moveTo(cx, cy - 16); c.lineTo(cx + 12, cy); c.lineTo(cx, cy + 16); c.lineTo(cx - 12, cy); c.closePath(); c.stroke();
    }
  });
}
