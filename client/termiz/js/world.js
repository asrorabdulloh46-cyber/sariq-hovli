// Termiz — 3D dunyo: yer, yo'llar, binolar, daraxtlar, osmon
import * as THREE from '../../vendor/three.module.min.js';
import { CHUNK_SIZE, VIEW_DIST } from '../config.js';

// ── Procedural texture cache ─────────────────────────────────────────────────
const texCache = {};
function canvasTex(key, size, draw) {
  if (texCache[key]) return texCache[key];
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c2 = cv.getContext('2d'); draw(c2, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache[key] = t; return t;
}

function buildingTex(type) {
  return canvasTex(`bld_${type}`, 128, (c, s) => {
    // Devor rangi
    const walls = {
      apartments: '#c8bfa8', house: '#d4c8a0', commercial: '#8899aa',
      school: '#d4aa66', hospital: '#e8e4e0', government: '#b8a890',
      mosque: '#d4c48c', hotel: '#a8b8cc', yes: '#c0b89a', industrial: '#909090'
    };
    const col = walls[type] || walls.yes;
    c.fillStyle = col; c.fillRect(0, 0, s, s);
    // Derazalar
    c.fillStyle = 'rgba(140,180,220,0.7)';
    const ww = 10, wh = 14, gap = 20;
    for (let wy = 8; wy < s - wh; wy += gap) {
      for (let wx = 6; wx < s - ww; wx += gap) {
        c.fillRect(wx, wy, ww, wh);
        // Deraza chiziq
        c.strokeStyle = 'rgba(255,255,255,0.3)';
        c.lineWidth = 1; c.strokeRect(wx, wy, ww, wh);
      }
    }
    // Qoʻshimcha chiziqlar (gorizontal lenta)
    c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 2;
    for (let y = 0; y < s; y += 20) { c.beginPath(); c.moveTo(0,y); c.lineTo(s,y); c.stroke(); }
  });
}

function roadTex() {
  return canvasTex('road', 64, (c, s) => {
    c.fillStyle = '#3a3a3a'; c.fillRect(0, 0, s, s);
    // Chiziq
    c.strokeStyle = '#888'; c.lineWidth = 1; c.setLineDash([8, 8]);
    c.beginPath(); c.moveTo(s/2, 0); c.lineTo(s/2, s); c.stroke();
    c.setLineDash([]);
    // yon chiziqlari
    c.strokeStyle = '#fff'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(2, 0); c.lineTo(2, s); c.stroke();
    c.beginPath(); c.moveTo(s-2, 0); c.lineTo(s-2, s); c.stroke();
  });
}

function groundTex() {
  return canvasTex('ground', 128, (c, s) => {
    // Qum rangi (Termiz — issiq cho'l shahri)
    c.fillStyle = '#c8b888'; c.fillRect(0, 0, s, s);
    // Mayda tafsilot
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      const r = Math.random() * 2 + 0.5;
      const br = Math.floor(Math.random() * 20) - 10;
      c.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI*2); c.fill();
    }
  });
}

function grassTex() {
  return canvasTex('grass', 64, (c, s) => {
    c.fillStyle = '#6a9e44'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#5a8e34';
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      c.fillRect(x, y, 2, 4);
    }
  });
}

function waterTex() {
  return canvasTex('water', 64, (c, s) => {
    c.fillStyle = '#2a6080'; c.fillRect(0, 0, s, s);
    c.strokeStyle = 'rgba(100,180,220,0.4)'; c.lineWidth = 1;
    for (let y = 4; y < s; y += 8) {
      c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(s/4, y-2, 3*s/4, y+2, s, y); c.stroke();
    }
  });
}

function sidewalkTex() {
  return canvasTex('sidewalk', 32, (c, s) => {
    c.fillStyle = '#b8b0a0'; c.fillRect(0, 0, s, s);
    c.strokeStyle = 'rgba(0,0,0,0.15)'; c.lineWidth = 1;
    for (let x = 0; x < s; x += 8) { c.beginPath(); c.moveTo(x,0); c.lineTo(x,s); c.stroke(); }
    for (let y = 0; y < s; y += 8) { c.beginPath(); c.moveTo(0,y); c.lineTo(s,y); c.stroke(); }
  });
}

function roofTex() {
  return canvasTex('roof', 32, (c, s) => {
    c.fillStyle = '#888070'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#706860'; c.fillRect(2,2,s-4,s-4);
  });
}

// ── Polygon extrusion (bino) ─────────────────────────────────────────────────
function buildingGeom(coords, h) {
  const n = coords.length;
  if (n < 3) return null;
  // Devor geometry: har qirra uchun rectangle
  const positions = [], normals = [], uvs = [], indices = [];
  let vIdx = 0;

  function addFace(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
    const nx = (by - ay), nz = -(bx - ax);
    const len = Math.hypot(nx, nz) || 1; const nnx = nx/len, nnz = nz/len;
    positions.push(ax,ay,az, bx,by,bz, cx,cy,cz, dx,dy,dz);
    normals.push(nnx,0,nnz, nnx,0,nnz, nnx,0,nnz, nnx,0,nnz);
    const uw = Math.hypot(bx-ax, bz-az);
    uvs.push(0,0, uw/4,0, uw/4,h/4, 0,h/4);
    indices.push(vIdx,vIdx+1,vIdx+2, vIdx,vIdx+2,vIdx+3);
    vIdx += 4;
  }

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [x0, z0] = coords[i], [x1, z1] = coords[j];
    addFace(x0, 0, z0, x1, 0, z1, x1, h, z1, x0, h, z0);
  }

  // Tep: ear clipping triangulation
  const topPts = coords.map(([x, z]) => ({ x, y: h, z }));
  const topIdx = earClip(topPts);
  const topStart = vIdx;
  for (const p of topPts) { positions.push(p.x, p.y, p.z); normals.push(0,1,0); uvs.push(p.x/8, p.z/8); vIdx++; }
  for (const ti of topIdx) indices.push(topStart + ti[0], topStart + ti[1], topStart + ti[2]);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3));
  geom.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs,       2));
  geom.setIndex(indices);
  return geom;
}

// Ear-clipping triangulation (simple convex fallback)
function earClip(pts) {
  const n = pts.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];
  // Simple fan triangulation (works for mostly-convex shapes)
  const tris = [];
  for (let i = 1; i < n - 1; i++) tris.push([0, i, i + 1]);
  return tris;
}

// ── Daraxt ────────────────────────────────────────────────────────────────────
let treeMesh = null;
function getTreeMesh() {
  if (treeMesh) return treeMesh;
  const g = new THREE.Group();
  // ustun
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.2, 2.5, 5),
    new THREE.MeshLambertMaterial({ color: 0x6b4c2a })
  );
  trunk.position.y = 1.25; g.add(trunk);
  // barg
  const foliage = new THREE.Mesh(
    new THREE.SphereGeometry(1.8, 6, 5),
    new THREE.MeshLambertMaterial({ color: 0x3a7a28 })
  );
  foliage.position.y = 3.6; g.add(foliage);
  treeMesh = g; return g;
}

// ── Chunk tizimi ─────────────────────────────────────────────────────────────
export class World {
  constructor(renderer, scene, mapData) {
    this.renderer = renderer;
    this.scene = scene;
    this.map = mapData;
    this.chunks = new Map(); // key → { mesh, x, z, used }
    this.groundMesh = null;
    this.roadMesh = null;
    this.waterMesh = null;
    this.zoneMeshes = [];
    this.poiMarkers = [];
    this.trees = [];
    this._buildMaterials();
    this._buildGround();
    this._buildRoads();
    this._buildZones();
    this._buildPOIMarkers();
    this._buildSky();
    this._buildLights();
  }

  _buildMaterials() {
    const gt = groundTex(); gt.repeat.set(4, 4);
    this.matGround = new THREE.MeshLambertMaterial({ map: gt });
    const rt = roadTex(); rt.repeat.set(0.5, 0.5);
    this.matRoad = new THREE.MeshLambertMaterial({ map: rt, depthWrite: true });
    this.matSidewalk = new THREE.MeshLambertMaterial({ map: sidewalkTex() });
    this.matWall = {};
    for (const type of ['yes','house','apartments','commercial','school','hospital','government','mosque','hotel','industrial']) {
      const t = buildingTex(type); t.repeat.set(0.25, 0.25);
      this.matWall[type] = new THREE.MeshLambertMaterial({ map: t });
    }
    const rt2 = roofTex(); rt2.repeat.set(0.5, 0.5);
    this.matRoof = new THREE.MeshLambertMaterial({ map: rt2 });
    this.matWater = new THREE.MeshLambertMaterial({ map: waterTex(), transparent: true, opacity: 0.85 });
    this.matGrass = new THREE.MeshLambertMaterial({ map: grassTex() });
    this.matTree = new THREE.MeshLambertMaterial({ color: 0x3a7a28 });
  }

  _buildGround() {
    const { minX, maxX, minZ, maxZ } = this.map.meta.bounds;
    const W = maxX - minX, D = maxZ - minZ;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const gt = groundTex(); gt.repeat.set(W / 20, D / 20);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 400, D + 400),
      new THREE.MeshLambertMaterial({ map: gt })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, -0.02, cz);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.groundMesh = mesh;
  }

  _buildRoads() {
    // Barcha yo'llarni bitta geometry'ga qo'shib chiqamiz
    const positions = [], normals = [], uvs = [], indices = [];
    let vi = 0;
    const addRoadSeg = (x0, z0, x1, z1, halfW, yOff = 0) => {
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz); if (len < 0.1) return;
      const nx = -dz / len, nz = dx / len; // normal perpendicular
      const lx0 = x0 + nx * halfW, lz0 = z0 + nz * halfW;
      const rx0 = x0 - nx * halfW, rz0 = z0 - nz * halfW;
      const lx1 = x1 + nx * halfW, lz1 = z1 + nz * halfW;
      const rx1 = x1 - nx * halfW, rz1 = z1 - nz * halfW;
      const y = yOff;
      positions.push(rx0,y,rz0, lx0,y,lz0, lx1,y,lz1, rx1,y,rz1);
      normals.push(0,1,0, 0,1,0, 0,1,0, 0,1,0);
      uvs.push(0,0, 1,0, 1,len/8, 0,len/8);
      indices.push(vi,vi+1,vi+2, vi,vi+2,vi+3); vi += 4;
    };

    for (const r of this.map.roads) {
      if (r.r < 0) continue; // piyodalar yo'li yo'q
      const halfW = r.w / 2;
      const y = r.br ? 0.5 : (r.tu ? -0.3 : 0.02);
      for (let i = 0; i < r.coords.length - 1; i++) {
        const [x0,z0] = r.coords[i], [x1,z1] = r.coords[i+1];
        addRoadSeg(x0, z0, x1, z1, halfW, y);
      }
    }
    if (!positions.length) return;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    this.roadMesh = new THREE.Mesh(geom, this.matRoad);
    this.roadMesh.receiveShadow = true;
    this.scene.add(this.roadMesh);
  }

  _buildZones() {
    for (const z of this.map.zones) {
      let mat = this.matGrass;
      if (z.zone === 'water') mat = this.matWater;
      else if (z.zone === 'grass' || z.zone === 'park') mat = this.matGrass;
      else if (z.zone === 'cemetery' || z.zone === 'religious') mat = this.matGrass;
      else continue;

      const pts = z.coords;
      if (pts.length < 3) continue;
      const shape = new THREE.Shape();
      shape.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
      shape.closePath();
      const geom = new THREE.ShapeGeometry(shape);
      // ShapeGeometry is XY → rotate to XZ
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.01;
      this.scene.add(mesh);
      this.zoneMeshes.push(mesh);

      // Daraxtlar parklarda
      if (z.zone === 'park' || z.zone === 'grass') {
        const bbox = z.bbox;
        for (let attempt = 0; attempt < 10; attempt++) {
          const tx = bbox[0] + Math.random() * (bbox[2] - bbox[0]);
          const tz = bbox[1] + Math.random() * (bbox[3] - bbox[1]);
          if (!pointInPoly(tx, tz, pts)) continue;
          this._placeTree(tx, 0, tz);
        }
      }
    }
  }

  _placeTree(x, y, z) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 2, 5),
      new THREE.MeshLambertMaterial({ color: 0x6b4c2a })
    );
    trunk.position.set(x, y + 1, z);
    const foliage = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 5, 4),
      new THREE.MeshLambertMaterial({ color: 0x3a7a28 + Math.floor(Math.random() * 0x103010) })
    );
    foliage.position.set(x, y + 3.2, z);
    this.scene.add(trunk); this.scene.add(foliage);
    this.trees.push(trunk, foliage);
  }

  _buildPOIMarkers() {
    // POI belgisini 3D marker sifatida ko'rsatish
    const POI_COLORS = {
      mosque: 0x00cc88, market: 0xffaa00, hospital: 0xff4444,
      police: 0x2244ff, school: 0xffdd00, stadium: 0x00aaff,
      mall: 0xff66aa, hotel: 0xdd8822, fuel: 0xff8800,
      bank: 0x44dd44, food: 0xff9944, pharmacy: 0x22ddcc, bus: 0x88aaff
    };
    for (const p of this.map.pois) {
      const color = POI_COLORS[p.poi] || 0xffffff;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 4, 6),
        new THREE.MeshBasicMaterial({ color })
      );
      mesh.position.set(p.x, 2, p.z);
      this.scene.add(mesh);
      this.poiMarkers.push(mesh);
    }
  }

  _buildSky() {
    // Gradient osmon
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, VIEW_DIST * 0.6, VIEW_DIST);
  }

  _buildLights() {
    const ambient = new THREE.AmbientLight(0xfff5e0, 0.7);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfffde8, 1.4);
    sun.position.set(400, 600, 200);
    sun.castShadow = false; // performance uchun o'chirilgan
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xddeeff, 0.3);
    fill.position.set(-200, 100, -100); this.scene.add(fill);
  }

  // ── Chunk-based building renderer ──────────────────────────────────────────
  updateChunks(px, pz) {
    const cs = CHUNK_SIZE;
    const viewChunks = Math.ceil(VIEW_DIST / cs) + 1;
    const cx0 = Math.floor(px / cs) - viewChunks;
    const cz0 = Math.floor(pz / cs) - viewChunks;
    const cx1 = Math.floor(px / cs) + viewChunks;
    const cz1 = Math.floor(pz / cs) + viewChunks;

    // Eskiriganlarni belgilash
    for (const [key, ch] of this.chunks) ch.used = false;

    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const wx = cx * cs + cs / 2, wz = cz * cs + cs / 2;
        if (Math.hypot(wx - px, wz - pz) > VIEW_DIST + cs) continue;
        const key = `${cx},${cz}`;
        if (this.chunks.has(key)) { this.chunks.get(key).used = true; continue; }
        const mesh = this._buildChunk(cx, cz);
        if (mesh) { this.scene.add(mesh); this.chunks.set(key, { mesh, used: true }); }
        else this.chunks.set(key, { mesh: null, used: true });
      }
    }

    // Uzoqdagilarni o'chirish
    for (const [key, ch] of this.chunks) {
      if (!ch.used) {
        if (ch.mesh) { this.scene.remove(ch.mesh); ch.mesh.geometry?.dispose(); }
        this.chunks.delete(key);
      }
    }
  }

  _buildChunk(cx, cz) {
    const cs = CHUNK_SIZE;
    const minX = cx * cs, maxX = minX + cs;
    const minZ = cz * cs, maxZ = minZ + cs;

    const positions = [], normals = [], uvs = [], indices = [];
    const wallGroups = {}; // type → {positions, normals, uvs, indices}
    let vi = 0;

    // Binolarni qo'shish
    for (const b of this.map.buildings) {
      if (b.cx < minX || b.cx > maxX || b.cz < minZ || b.cz > maxZ) continue;
      const type = b.type || 'yes';
      if (!wallGroups[type]) wallGroups[type] = { positions: [], normals: [], uvs: [], indices: [], vi: 0 };
      const g = wallGroups[type];
      const pts = b.coords; const n = pts.length; const h = b.h;

      // Devorlar
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const [x0, z0] = pts[i], [x1, z1] = pts[j];
        const dx = x1 - x0, dz = z1 - z0;
        const len = Math.hypot(dx, dz); if (len < 0.1) continue;
        const nx = -dz / len, nz = dx / len;
        g.positions.push(x0,0,z0, x1,0,z1, x1,h,z1, x0,h,z0);
        g.normals.push(nx,0,nz, nx,0,nz, nx,0,nz, nx,0,nz);
        const uw = len / 4;
        g.uvs.push(0,0, uw,0, uw,h/4, 0,h/4);
        g.indices.push(g.vi, g.vi+1, g.vi+2, g.vi, g.vi+2, g.vi+3);
        g.vi += 4;
      }

      // Tep
      const topStart = g.vi;
      for (const [px2, pz2] of pts) {
        g.positions.push(px2, h, pz2);
        g.normals.push(0, 1, 0);
        g.uvs.push(px2/8, pz2/8);
        g.vi++;
      }
      for (let i = 1; i < n - 1; i++) {
        g.indices.push(topStart, topStart + i, topStart + i + 1);
      }
    }

    if (!Object.keys(wallGroups).length) return null;

    // Merged mesh yaratish
    const group = new THREE.Group();
    for (const [type, g] of Object.entries(wallGroups)) {
      if (!g.positions.length) continue;
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(g.positions, 3));
      geom.setAttribute('normal',   new THREE.Float32BufferAttribute(g.normals,   3));
      geom.setAttribute('uv',       new THREE.Float32BufferAttribute(g.uvs,       2));
      geom.setIndex(g.indices);
      const mat = this.matWall[type] || this.matWall['yes'];
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = false; mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }

  // Yo'l ustida harakat qilish uchun zamin balandligini qaytaradi
  getGroundY(x, z) {
    return 0;
  }

  // Bino bilan to'qnashuvni tekshirish
  checkBuildingCollision(px, pz, radius) {
    // Nearby buildings check (simplified AABB)
    for (const b of this.map.buildings) {
      const dx = b.cx - px, dz = b.cz - pz;
      if (Math.abs(dx) > 20 || Math.abs(dz) > 20) continue;
      // Polygon-circle test
      if (circleIntersectsPoly(px, pz, radius, b.coords)) {
        const pushDx = px - b.cx, pushDz = pz - b.cz;
        const len = Math.hypot(pushDx, pushDz) || 1;
        return { hit: true, nx: pushDx / len, nz: pushDz / len };
      }
    }
    return { hit: false };
  }

  update(dt) {
    // Water animation
    // (simplified — just fog update)
  }

  dispose() {
    for (const [, ch] of this.chunks) {
      if (ch.mesh) { this.scene.remove(ch.mesh); ch.mesh.geometry?.dispose(); }
    }
    this.chunks.clear();
    if (this.groundMesh) this.scene.remove(this.groundMesh);
    if (this.roadMesh)   this.scene.remove(this.roadMesh);
    for (const m of this.zoneMeshes) this.scene.remove(m);
    for (const m of this.poiMarkers) this.scene.remove(m);
    for (const m of this.trees)      this.scene.remove(m);
  }
}

// ── Yordamchi geometrik funksiyalar ──────────────────────────────────────────
function pointInPoly(px, pz, coords) {
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [xi, zi] = coords[i], [xj, zj] = coords[j];
    if (((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}

function circleIntersectsPoly(cx, cz, r, coords) {
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [ax, az] = coords[i], [bx, bz] = coords[j];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx*dx + dz*dz;
    if (len2 < 0.001) continue;
    let t = ((cx-ax)*dx + (cz-az)*dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const nx = ax + t*dx - cx, nz = az + t*dz - cz;
    if (nx*nx + nz*nz < r*r) return true;
  }
  return pointInPoly(cx, cz, coords);
}
