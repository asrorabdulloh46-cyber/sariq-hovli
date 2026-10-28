// Effektlar: tutun/chang/uchqun zarralari, shina izlari
import * as THREE from '../../vendor/three.module.min.js';

const VERT = `
attribute float size; attribute vec4 col;
varying vec4 vCol;
uniform float scale;
void main(){
  vCol = col;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = size * scale / max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying vec4 vCol;
void main(){
  vec2 d = gl_PointCoord - 0.5; float r = dot(d,d)*4.0;
  float a = smoothstep(1.0, 0.15, r) * vCol.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol.rgb, a);
}`;

class Pool {
  constructor(scene, max, additive, scaleRef) {
    this.max = max; this.n = 0; this.head = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.c0 = new Float32Array(max * 4); this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('col', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { scale: { value: 600 } };
    const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points);
    for (let i = 0; i < max; i++) { this.life[i] = 0; this.age[i] = 1; this.size[i] = 0; }
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag = 1.5, grav = 0) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life; this.age[i] = 0; this.s0[i] = s0; this.s1[i] = s1; this.c0.set([r, g, b, a], i * 4); this.drag[i] = drag; this.grav[i] = grav;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const L = this.life[i]; if (this.age[i] >= L) { this.size[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      this.age[i] += dt; const k = Math.min(1, this.age[i] / L);
      const d = Math.exp(-this.drag[i] * dt), i3 = i * 3;
      this.vel[i3] *= d; this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.05) { this.pos[i3 + 1] = 0.05; this.vel[i3 + 1] = Math.abs(this.vel[i3 + 1]) * 0.3; }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      const fade = k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88;
      this.col[i * 4] = this.c0[i * 4]; this.col[i * 4 + 1] = this.c0[i * 4 + 1]; this.col[i * 4 + 2] = this.c0[i * 4 + 2]; this.col[i * 4 + 3] = this.c0[i * 4 + 3] * fade;
    }
    const g = this.points.geometry; g.attributes.position.needsUpdate = true; g.attributes.col.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }
  clear() { this.age.fill(1); this.size.fill(0); this.col.fill(0); }
  dispose() { this.points.parent && this.points.parent.remove(this.points); this.points.geometry.dispose(); this.points.material.dispose(); }
}

export class Fx {
  constructor(scene, quality = 1) {
    this.scene = scene; this.q = quality;
    this.smoke = new Pool(scene, Math.round(500 * quality), false);
    this.glow = new Pool(scene, Math.round(260 * quality), true);
    // shina izlari: halqa bufer
    this.maxSeg = Math.round(520 * Math.min(1, quality + 0.3));
    const pos = new Float32Array(this.maxSeg * 4 * 3), al = new Float32Array(this.maxSeg * 4);
    const idx = new Uint16Array(this.maxSeg * 6);
    for (let i = 0; i < this.maxSeg; i++) { const a = i * 4; idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('a', new THREE.BufferAttribute(al, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: 'attribute float a; varying float vA; void main(){ vA=a; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.02,0.02,0.02,vA*0.62); }',
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.skidMesh = new THREE.Mesh(g, m); this.skidMesh.frustumCulled = false; this.skidMesh.renderOrder = 2; scene.add(this.skidMesh);
    this.skidPos = pos; this.skidA = al; this.skidHead = 0; this.last = new Map();
  }
  setScale(h) { this.smoke.uniforms.scale.value = h * 0.9; this.glow.uniforms.scale.value = h * 0.9; }
  // g'ildirak izi (key: har g'ildirak uchun)
  skid(key, x, z, on, w = 0.28) {
    const p = this.last.get(key);
    if (!on) { if (p) this.last.delete(key); return; }
    if (p) {
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.35) return;
      if (d > 6) { this.last.set(key, { x, z }); return; }
      const nx = -dz / d * w * 0.5, nz = dx / d * w * 0.5, a = this.skidHead * 4, P = this.skidPos, Y = 0.075;
      P.set([p.x - nx, Y, p.z - nz, p.x + nx, Y, p.z + nz, x - nx, Y, z - nz, x + nx, Y, z + nz], a * 3);
      this.skidA[a] = this.skidA[a + 1] = this.skidA[a + 2] = this.skidA[a + 3] = 1;
      this.skidHead = (this.skidHead + 1) % this.maxSeg;
      const g = this.skidMesh.geometry; g.attributes.position.needsUpdate = true; g.attributes.a.needsUpdate = true;
    }
    this.last.set(key, { x, z });
  }
  // tutun (drift) / chang (yo'ldan tashqari)
  puff(x, z, vx, vz, kind = 'smoke') {
    const r = Math.random;
    if (kind === 'dust') this.smoke.emit(x, 0.3, z, vx * 0.3 + (r() - 0.5) * 2, 0.8 + r(), vz * 0.3 + (r() - 0.5) * 2, 0.9 + r() * 0.5, 0.8, 3.4, 0.78, 0.66, 0.44, 0.5, 2.2, -0.3);
    else this.smoke.emit(x, 0.25, z, vx * 0.15 + (r() - 0.5) * 1.4, 0.6 + r() * 0.8, vz * 0.15 + (r() - 0.5) * 1.4, 0.9 + r() * 0.5, 0.6, 3.0, 0.86, 0.86, 0.88, 0.5, 2.0, -0.2);
  }
  spark(x, y, z, vx, vz) {
    const r = Math.random;
    this.glow.emit(x, y, z, vx * 0.2 + (r() - 0.5) * 6, 1 + r() * 3, vz * 0.2 + (r() - 0.5) * 6, 0.25 + r() * 0.25, 0.25, 0.05, 1, 0.8, 0.35, 1, 1, 9);
  }
  flame(x, y, z, vx, vz, boost) {
    const r = Math.random;
    this.glow.emit(x, y, z, vx * 0.9 + (r() - 0.5) * 0.6, (r() - 0.5) * 0.5, vz * 0.9 + (r() - 0.5) * 0.6, 0.22 + r() * 0.12, 0.7, 0.1, boost ? 0.45 : 1, boost ? 0.7 : 0.55, boost ? 1 : 0.15, 0.9, 4, 0);
  }
  burst(x, y, z, color) { // quti olish / to'qnashuv
    const r = Math.random;
    for (let i = 0; i < 14; i++) this.glow.emit(x, y, z, (r() - 0.5) * 9, 1 + r() * 5, (r() - 0.5) * 9, 0.4 + r() * 0.3, 0.45, 0.05, color[0], color[1], color[2], 1, 1.2, 8);
  }
  update(dt) { this.smoke.update(dt); this.glow.update(dt); }
  clear() {
    this.smoke.clear(); this.glow.clear(); this.skidA.fill(0); this.skidMesh.geometry.attributes.a.needsUpdate = true; this.last.clear();
  }
  dispose() {
    this.smoke.dispose(); this.glow.dispose(); this.scene.remove(this.skidMesh); this.skidMesh.geometry.dispose(); this.skidMesh.material.dispose();
  }
}
