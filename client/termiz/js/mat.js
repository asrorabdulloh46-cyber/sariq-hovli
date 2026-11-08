// Termiz — materiallar: atlas devor + proseduraviy derazalar (shader), yer, yo'l
import * as THREE from 'three';

// Hamma materiallar uchun umumiy uniformlar (vaqt, tun)
export const SHARED = {
  uNight: { value: 0 },
  uTime: { value: 0 },
};

// ── GLSL: deraza naqshlari ───────────────────────────────────────────────────
const GLSL_COMMON = /* glsl */`
uniform vec2 uAtlas;
uniform float uTS[12];
uniform float uNight;
uniform float uWin;
varying vec2 vCell; varying vec4 vInfo; varying vec3 vWPos; varying vec2 vWUv;

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

// kind: 1 uy, 2 ko'p qavatli, 3 vitrina, 4 arka (masjid), 5 tor tuynuk
// d<0 — deraza ichi. c — katak ichidagi koordinata (0..1)
float winSdf(vec2 c, float kind) {
  vec2 lo, hi;
  if (kind < 1.5)      { lo = vec2(0.30, 0.28); hi = vec2(0.70, 0.78); }
  else if (kind < 2.5) { lo = vec2(0.14, 0.30); hi = vec2(0.62, 0.84); }
  else if (kind < 3.5) { lo = vec2(0.04, 0.22); hi = vec2(0.96, 0.88); }
  else if (kind < 4.5) {
    float cy = 0.88 - 0.22;
    if (c.y > cy) return length(vec2(c.x - 0.5, c.y - cy)) - 0.22;
    return max(abs(c.x - 0.5) - 0.22, 0.10 - c.y);
  }
  else                 { lo = vec2(0.10, 0.66); hi = vec2(0.90, 0.80); }
  vec2 d = max(lo - c, c - hi);
  return max(d.x, d.y);
}
`;

const GLSL_MAP = /* glsl */`
float stl = floor(vInfo.x + 0.5);
vec2 tileXY = vec2(mod(stl, uAtlas.x), floor(stl / uAtlas.x));
vec2 mUv = vWUv * uTS[int(clamp(stl, 0.0, 11.0))];
vec2 aUv = (tileXY + fract(mUv) * 0.96 + 0.02) / uAtlas;
vec2 aDx = dFdx(mUv) * 0.96 / uAtlas;
vec2 aDy = dFdy(mUv) * 0.96 / uAtlas;
#ifdef USE_MAP
  vec4 sampledDiffuseColor = textureGrad(map, aUv, aDx, aDy);
  diffuseColor *= sampledDiffuseColor;
#endif
`;

const GLSL_COLOR = /* glsl */`
#include <color_fragment>
float winGlass = 0.0; vec3 winEmit = vec3(0.0); float winRough = 1.0;
{
  // Pastki qismi iflosroq (AO), yuqori qismi yengilroq
  float ao = mix(0.66, 1.0, smoothstep(0.0, 2.4, vWPos.y));
  diffuseColor.rgb *= ao;
  if (uWin > 0.5 && vInfo.y > 0.5) {
    float kind = vInfo.y;
    float fl = floor(vCell.y + 0.0001);
    if (fl < 0.5 && vInfo.w > 0.5) kind = 3.0;       // pastki qavat — do'kon vitrinasi
    vec2 cc = fract(vCell);
    vec2 cid = vec2(floor(vCell.x), fl);
    float rnd = hash12(cid + vInfo.z * 17.0);
    float rnd2 = hash12(cid * 1.7 + vInfo.z * 5.0 + 3.0);
    float d = winSdf(cc, kind);
    float fw = (kind > 3.5 && kind < 4.5) ? 0.045 : 0.035;
    float glassM = 1.0 - step(-fw, d);          // d < -fw
    float frameM = (1.0 - step(0.0, d)) - glassM;
    float revealM = (1.0 - smoothstep(0.0, 0.07, d)) * step(0.0, d);  // devor chuqurligi soyasi
    diffuseColor.rgb *= mix(1.0, 0.62, revealM);
    // Ko'p qavatli uy balkonlari
    if (kind > 1.5 && kind < 2.5) {
      float slab = 1.0 - step(0.075, cc.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55, slab);
      float rail = step(0.075, cc.y) * (1.0 - step(0.30, cc.y)) * step(0.06, cc.x) * (1.0 - step(0.94, cc.x));
      float bars = step(0.5, fract(cc.x * 14.0));
      float hasBalc = step(0.35, rnd2);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.17, 0.18), rail * bars * 0.55 * hasBalc);
    }
    // Eshik: pastki qavatda (uylar uchun)
    vec3 glassCol = mix(vec3(0.045, 0.075, 0.11), vec3(0.14, 0.2, 0.26), cc.y);
    float curtain = step(rnd, 0.26);
    float blinds = step(0.26, rnd) * step(rnd, 0.40);
    vec3 curtainCol = mix(vec3(0.62, 0.55, 0.42), vec3(0.45, 0.30, 0.22), step(0.5, rnd2));
    vec3 frameCol = (kind > 3.5 && kind < 4.5) ? vec3(0.06, 0.42, 0.56) : vec3(0.74, 0.74, 0.70);
    diffuseColor.rgb = mix(diffuseColor.rgb, frameCol, frameM);
    vec3 inner = glassCol;
    inner = mix(inner, curtainCol, curtain);
    inner = mix(inner, mix(glassCol, vec3(0.55, 0.52, 0.45), step(0.5, fract(cc.y * 9.0))), blinds);
    if (kind > 3.5 && kind < 4.5) {
      // Arka oynada ornament
      float orn = step(0.5, fract(cc.x * 12.0)) * step(0.5, fract(cc.y * 12.0));
      inner = mix(vec3(0.05, 0.28, 0.40), vec3(0.18, 0.6, 0.7), orn);
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, inner, glassM);
    winGlass = glassM * (1.0 - curtain) * (1.0 - blinds);
    // Tunda yoritilgan derazalar
    float lit = step(rnd2 * 0.9 + 0.05, uNight * 0.62) * glassM;
    winEmit = lit * mix(vec3(1.0, 0.78, 0.46), vec3(0.85, 0.92, 1.0), step(0.8, rnd)) * (0.55 + 0.6 * rnd);
    if (kind > 3.5 && kind < 4.5) winEmit = glassM * vec3(0.9, 0.78, 0.5) * uNight * 0.9;
  }
}
`;

function injectBuilding(shader, atlas, tileScales, windows) {
  shader.uniforms.uAtlas = { value: new THREE.Vector2(atlas.cols, atlas.rows) };
  shader.uniforms.uTS = { value: tileScales };
  shader.uniforms.uNight = SHARED.uNight;
  shader.uniforms.uWin = { value: windows ? 1 : 0 };

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
      attribute vec2 aCell; attribute vec4 aInfo;
      varying vec2 vCell; varying vec4 vInfo; varying vec3 vWPos; varying vec2 vWUv;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vCell = aCell; vInfo = aInfo; vWUv = uv;
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);

  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + GLSL_COMMON)
    .replace('#include <map_fragment>', GLSL_MAP)
    .replace('#include <color_fragment>', GLSL_COLOR)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.10, winGlass);`)
    .replace('#include <normal_fragment_maps>', `
      #ifdef USE_NORMALMAP_TANGENTSPACE
        vec3 mapN = textureGrad(normalMap, aUv, aDx, aDy).xyz * 2.0 - 1.0;
        mapN.xy *= normalScale * (1.0 - winGlass);
        normal = normalize(tbn * mapN);
      #endif`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += winEmit;`);
}

/**
 * Atlas asosidagi bino materiali.
 * tileScales: har bir atlas plitkasi uchun 1/metr (8 ta)
 */
export function createBuildingMaterial(atlas, { tileScales, windows = true, normalScale = 0.8, roughness = 0.92 } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: atlas.map, normalMap: atlas.normalMap || null,
    vertexColors: true, roughness, metalness: 0.0,
    normalScale: new THREE.Vector2(normalScale, normalScale),
  });
  const ts = tileScales || [0.25,0.25,0.45,0.45,0.4,0.3,0.4,0.3,0.5,0.5,0.4,0.3];
  m.onBeforeCompile = (shader) => injectBuilding(shader, atlas, ts, windows);
  m.customProgramCacheKey = () => 'bld' + (windows ? 'W' : 'R') + (atlas.normalMap ? 'N' : '');
  return m;
}

/**
 * Yer materiali: ikki masshtabli aralashtirish — takrorlanish sezilmaydi
 */
export function createGroundMaterial(tex, { tint = 0xffffff, rough = 0.97, scale = 1 / 6 } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: tex.map, normalMap: tex.normalMap || null, color: tint,
    roughness: rough, metalness: 0, normalScale: new THREE.Vector2(0.7, 0.7),
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGS = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGW; uniform float uGS;')
      .replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec2 gUv = vGW * uGS;
        vec4 gA = texture2D(map, gUv);
        vec4 gB = texture2D(map, gUv * 0.173 + vec2(0.31, 0.17));
        float gN = texture2D(map, gUv * 0.021 + vec2(0.7, 0.2)).g;
        float gM = smoothstep(0.38, 0.62, gN);
        vec4 sampledDiffuseColor = mix(gA, gB, gM);
        sampledDiffuseColor.rgb *= 0.86 + 0.28 * gN;
        diffuseColor *= sampledDiffuseColor;
      #endif`);
  };
  m.customProgramCacheKey = () => 'ground' + (tex.normalMap ? 'N' : '') + scale;
  return m;
}

// Ko'chat/gumbaz kabi yaproq materiallar uchun shamol effekti (yengil tebranish)
export function createFoliageMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float sw = clamp(transformed.y * 0.06, 0.0, 1.0);
        vec4 wp4 = modelMatrix * vec4(transformed, 1.0);
        transformed.x += sin(uTime * 1.3 + wp4.x * 0.31 + wp4.z * 0.17) * 0.07 * sw;
        transformed.z += cos(uTime * 1.1 + wp4.z * 0.29 + wp4.x * 0.13) * 0.07 * sw;`);
  };
  m.customProgramCacheKey = () => 'foliage';
  return m;
}
