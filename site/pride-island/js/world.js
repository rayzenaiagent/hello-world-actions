import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

// ---------- helpers ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz;
}
function fbm(x, z, oct = 5) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += (vnoise(x * f, z * f) - 0.5) * 2 * amp; n += amp; amp *= 0.5; f *= 2.03; }
  return s / n;
}
function sm(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Simple merger of flat-shaded triangles with vertex colors
class Merger {
  constructor() { this.pos = []; this.col = []; }
  tri(a, b, c, color) {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) this.col.push(color.r, color.g, color.b);
  }
  quad(a, b, c, d, color) { this.tri(a, b, c, color); this.tri(a, c, d, color); }
  geo(g, color, mat) {
    let q = g.index ? g.toNonIndexed() : g.clone();
    if (mat) q.applyMatrix4(mat);
    const p = q.attributes.position.array;
    const c = new THREE.Color(color);
    for (let i = 0; i < p.length; i += 3) { this.pos.push(p[i], p[i + 1], p[i + 2]); this.col.push(c.r, c.g, c.b); }
    q.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function createWorld(scene) {
  const rand = mulberry32(1337);
  const SIZE = 1200, SEG = 256, STEP = SIZE / SEG, HALF = SIZE / 2, N = SEG + 1;
  const ROAD_W = 9;

  // ---------- base terrain function ----------
  const VX = -40, VZ = 30;
  function baseHeight(x, z) {
    const r = Math.hypot(x, z);
    const rEff = r + fbm(x * 0.006 + 11, z * 0.006 + 7, 4) * 45;
    let h = -4 + 10.5 * sm(455, 380, rEff);
    const inland = sm(410, 300, r);
    h += fbm(x * 0.012, z * 0.012, 5) * 5 * inland + 1.5 * inland;
    const dv = Math.hypot(x - VX, z - VZ);
    h += 58 * Math.exp(-Math.pow(dv / 105, 2)) * (0.85 + 0.3 * fbm(x * 0.03, z * 0.03, 3));
    h += fbm(x * 0.05, z * 0.05, 3) * 0.8 * inland;
    h -= 30 * sm(430, 560, r);
    return h;
  }

  // ---------- road curve ----------
  const ctrl = [];
  const NC = 14;
  for (let i = 0; i < NC; i++) {
    const a = (i / NC) * Math.PI * 2;
    const rr = 300 + Math.sin(i * 2.3 + 0.7) * 38 + Math.cos(i * 1.1) * 12 - (i % 4 === 1 ? 25 : 0);
    ctrl.push(new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr));
  }
  const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');
  const RS = 900;
  const rpts = curve.getSpacedPoints(RS).slice(0, RS);
  const rH = new Float32Array(RS);
  for (let i = 0; i < RS; i++) rH[i] = Math.max(1.2, baseHeight(rpts[i].x, rpts[i].z)) + 0.0;
  for (let pass = 0; pass < 3; pass++) {
    const tmp = new Float32Array(RS);
    for (let i = 0; i < RS; i++) {
      let s = 0;
      for (let k = -12; k <= 12; k++) s += rH[(i + k + RS) % RS];
      tmp[i] = s / 25;
    }
    rH.set(tmp);
  }

  // ---------- heightmap grid with road flattening ----------
  const grid = new Float32Array(N * N);
  const bestD = new Float32Array(N * N).fill(1e9);
  const bestH = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) grid[j * N + i] = baseHeight(-HALF + i * STEP, -HALF + j * STEP);
  const BLEND_R = 30, FLAT_R = 7.5;
  const reach = Math.ceil(BLEND_R / STEP) + 1;
  for (let s = 0; s < RS; s++) {
    const p = rpts[s];
    const ci = Math.round((p.x + HALF) / STEP), cj = Math.round((p.z + HALF) / STEP);
    for (let j = cj - reach; j <= cj + reach; j++) {
      if (j < 0 || j >= N) continue;
      for (let i = ci - reach; i <= ci + reach; i++) {
        if (i < 0 || i >= N) continue;
        const d = Math.hypot(-HALF + i * STEP - p.x, -HALF + j * STEP - p.z);
        const k = j * N + i;
        if (d < bestD[k]) { bestD[k] = d; bestH[k] = rH[s] + 0.06; }
      }
    }
  }
  for (let k = 0; k < N * N; k++) {
    const d = bestD[k];
    if (d < BLEND_R) {
      const w = 1 - sm(FLAT_R, BLEND_R, d);
      grid[k] = grid[k] + (bestH[k] - grid[k]) * w;
    }
  }

  const pier = { on: false, x: 0, z: 0, dx: 0, dz: 1, len: 48, hw: 1.7, y: 1.15 };
  function getHeightAt(x, z) {
    let fx = (x + HALF) / STEP, fz = (z + HALF) / STEP;
    if (fx < 0) fx = 0; else if (fx > SEG - 0.001) fx = SEG - 0.001;
    if (fz < 0) fz = 0; else if (fz > SEG - 0.001) fz = SEG - 0.001;
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j;
    const k = j * N + i;
    const a = grid[k], b = grid[k + 1], c = grid[k + N], d = grid[k + N + 1];
    const h = (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
    if (pier.on) {
      const dx = x - pier.x, dz = z - pier.z;
      const lz = dx * pier.dx + dz * pier.dz, lx = dx * pier.dz - dz * pier.dx;
      if (lz > 0 && lz < pier.len && lx > -pier.hw && lx < pier.hw && h < pier.y) return pier.y;
    }
    return h;
  }
  function getNormalAt(x, z) {
    const e = 0.8;
    const hx = getHeightAt(x + e, z) - getHeightAt(x - e, z);
    const hz = getHeightAt(x, z + e) - getHeightAt(x, z - e);
    return new THREE.Vector3(-hx, 2 * e, -hz).normalize();
  }
  function isWater(x, z) { return getHeightAt(x, z) < 0; }

  // road spatial hash
  const BK = 25, buckets = new Map();
  const bkey = (a, b) => a * 10007 + b;
  for (let s = 0; s < RS; s++) {
    const k = bkey(Math.floor(rpts[s].x / BK), Math.floor(rpts[s].z / BK));
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(s);
  }
  function roadDist(x, z) {
    const bx = Math.floor(x / BK), bz = Math.floor(z / BK);
    let best = 1e9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const arr = buckets.get(bkey(bx + a, bz + b));
      if (!arr) continue;
      for (let n = 0; n < arr.length; n++) {
        const p = rpts[arr[n]];
        const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (d < best) best = d;
      }
    }
    return Math.sqrt(best);
  }
  function isOnRoad(x, z) { return roadDist(x, z) <= ROAD_W * 0.5 + 0.3; }

  // ---------- terrain mesh ----------
  const tpos = new Float32Array(N * N * 3), tcol = new Float32Array(N * N * 3);
  const cSand = new THREE.Color(0xe3d3a0), cWet = new THREE.Color(0x9c8e66), cGrass = new THREE.Color(0x3f7a2a),
    cGrass2 = new THREE.Color(0x5f9a35), cRock = new THREE.Color(0x77706a), cDeep = new THREE.Color(0xb7a874);
  const tmpC = new THREE.Color();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = -HALF + i * STEP, z = -HALF + j * STEP, h = grid[k];
    tpos[k * 3] = x; tpos[k * 3 + 1] = h; tpos[k * 3 + 2] = z;
    const hl = grid[j * N + Math.max(0, i - 1)], hr = grid[j * N + Math.min(SEG, i + 1)];
    const hu = grid[Math.max(0, j - 1) * N + i], hd = grid[Math.min(SEG, j + 1) * N + i];
    const slope = Math.hypot(hr - hl, hd - hu) / (2 * STEP);
    const n = vnoise(x * 0.15, z * 0.15);
    if (h < 0) tmpC.copy(cDeep).lerp(cWet, 0.3);
    else if (h < 0.7) tmpC.copy(cWet).lerp(cSand, sm(0, 0.7, h));
    else {
      tmpC.copy(cSand).lerp(tmpC.copy(cGrass).lerp(cGrass2, vnoise(x * 0.02, z * 0.02) * 0.8 + n * 0.3), sm(1.6, 3.4, h + n * 0.6));
      const rockT = Math.max(sm(0.5, 0.9, slope), sm(32, 50, h + n * 4));
      if (rockT > 0) { const cc = tmpC.clone(); tmpC.copy(cc).lerp(cRock, rockT); }
    }
    const v = 0.93 + n * 0.12;
    tcol[k * 3] = tmpC.r * v; tcol[k * 3 + 1] = tmpC.g * v; tcol[k * 3 + 2] = tmpC.b * v;
  }
  const tidx = new Uint32Array(SEG * SEG * 6);
  let ti = 0;
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    tidx[ti++] = a; tidx[ti++] = c; tidx[ti++] = b;
    tidx[ti++] = b; tidx[ti++] = c; tidx[ti++] = d;
  }
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
  tgeo.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
  tgeo.setIndex(new THREE.BufferAttribute(tidx, 1));
  tgeo.computeVertexNormals();
  const terrain = new THREE.Mesh(tgeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ---------- road mesh ----------
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#3a3a3d'; cx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 2500; i++) {
    const g = 40 + Math.random() * 40;
    cx.fillStyle = `rgba(${g},${g},${g + 3},0.5)`;
    cx.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
  }
  cx.fillStyle = '#e8e8e8';
  cx.fillRect(6, 0, 4, 256); cx.fillRect(118, 0, 4, 256);
  cx.fillStyle = '#f2c230';
  cx.fillRect(61, 0, 6, 128);
  const roadTex = new THREE.CanvasTexture(cv);
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.colorSpace = THREE.SRGBColorSpace;
  roadTex.anisotropy = 4;
  {
    const pos = [], uv = [], idx = [];
    const hw = ROAD_W / 2;
    let len = 0;
    for (let s = 0; s <= RS; s++) {
      const i = s % RS, p = rpts[i], q = rpts[(i + 1) % RS], o = rpts[(i - 1 + RS) % RS];
      if (s > 0) len += Math.hypot(p.x - rpts[(s - 1) % RS].x, p.z - rpts[(s - 1) % RS].z);
      let tx = q.x - o.x, tz = q.z - o.z; const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
      const nx = tz, nz = -tx;
      const y = rH[i] + 0.07;
      pos.push(p.x - nx * hw, y, p.z - nz * hw, p.x + nx * hw, y, p.z + nz * hw);
      uv.push(0, len / 8, 1, len / 8);
      if (s < RS) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    // fix winding so normal faces up: verify
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    rg.setIndex(idx);
    rg.computeVertexNormals();
    if (rg.attributes.normal.array[1] < 0) {
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      rg.setIndex(idx); rg.computeVertexNormals();
    }
    const road = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ map: roadTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    road.receiveShadow = true;
    scene.add(road);
  }
  const roadPoints = curve.getSpacedPoints(200).slice(0, 200).map(p => ({ x: p.x, z: p.z }));
  const t0 = rpts[0], t1 = rpts[3];
  const spawn = { x: t0.x, z: t0.z, heading: Math.atan2(t1.x - t0.x, t1.z - t0.z) };

  // ---------- sky / fog / lights ----------
  const sky = new Sky();
  sky.scale.setScalar(8000);
  const su = sky.material.uniforms;
  su.turbidity.value = 4; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.85;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(140));
  su.sunPosition.value.copy(sunDir);
  scene.add(sky);
  const fogColor = new THREE.Color(0xaed4ee);
  scene.fog = new THREE.Fog(fogColor, 250, 1500);
  scene.background = fogColor;
  sky.material.fog = false;

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a50, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 500;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.5;
  sun.position.copy(sunDir).multiplyScalar(200);
  scene.add(sun); scene.add(sun.target);

  // ---------- ocean ----------
  const oceanMat = new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uSun: { value: sunDir.clone() },
      uShallow: { value: new THREE.Color(0x2fc6c0) },
      uDeep: { value: new THREE.Color(0x0a4a7c) },
      uSky: { value: new THREE.Color(0xa8d4f0) },
    }]),
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      float wave(vec2 p){
        return sin(p.x*0.045+uTime*0.9)*0.35+sin(p.y*0.06-uTime*0.7)*0.3+sin((p.x+p.y)*0.11+uTime*1.5)*0.15;
      }
      void main(){
        vec3 p = position;
        vec4 w = modelMatrix * vec4(p,1.0);
        w.y += wave(w.xz);
        vWorld = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSun, uShallow, uDeep, uSky;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main(){
        vec2 p = vWorld.xz;
        float dx = cos(p.x*0.045+uTime*0.9)*0.0158 + cos((p.x+p.y)*0.11+uTime*1.5)*0.0165 + sin(p.x*0.7+uTime*2.0)*0.02*cos(p.y*0.5-uTime*1.3);
        float dz = cos(p.y*0.06-uTime*0.7)*0.018 + cos((p.x+p.y)*0.11+uTime*1.5)*0.0165 + cos(p.y*0.8+uTime*1.7)*0.02*sin(p.x*0.6+uTime);
        vec3 n = normalize(vec3(-dx*8.0,1.0,-dz*8.0));
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n,v),0.0), 3.0);
        float r = length(vWorld.xz);
        float shore = smoothstep(520.0, 400.0, r);
        vec3 base = mix(uDeep, uShallow, shore*0.9);
        vec3 col = mix(base, uSky, clamp(fres*0.85+0.08,0.0,1.0));
        vec3 h = normalize(uSun+v);
        col += vec3(1.0,0.95,0.8)*pow(max(dot(n,h),0.0), 120.0)*1.2;
        float foam = smoothstep(0.55,1.0, sin(r*0.55 - uTime*1.6 + sin(p.x*0.05)*3.0)) * smoothstep(440.0,395.0,r)*smoothstep(380.0,410.0,r);
        col = mix(col, vec3(1.0), foam*0.35);
        float alpha = mix(0.82, 0.96, 1.0-shore);
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }`,
  });
  const oceanGeo = new THREE.PlaneGeometry(4000, 4000, 100, 100);
  oceanGeo.rotateX(-Math.PI / 2);
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.position.y = -0.1;
  ocean.renderOrder = 1;
  scene.add(ocean);

  // ---------- scenery helpers ----------
  const tooClose = (x, z, m) => roadDist(x, z) < ROAD_W / 2 + m;
  const placed = [];
  function freeSpot(minH, maxH, roadMargin, tries = 40) {
    for (let t = 0; t < tries; t++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 440;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = getHeightAt(x, z);
      if (h < minH || h > maxH) continue;
      if (tooClose(x, z, roadMargin)) continue;
      return { x, z, h };
    }
    return null;
  }
  function instanced(geo, mat, matrices, colors, shadow = true) {
    const m = new THREE.InstancedMesh(geo, mat, matrices.length);
    for (let i = 0; i < matrices.length; i++) {
      m.setMatrixAt(i, matrices[i]);
      if (colors) m.setColorAt(i, colors[i]);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = shadow; m.receiveShadow = false;
    m.frustumCulled = false;
    scene.add(m);
    return m;
  }
  const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const vcMatSide = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

  // ---------- palm trees ----------
  {
    // trunk: curved tapered cylinder along +Y bending toward +X
    const trunkG = new THREE.CylinderGeometry(0.16, 0.3, 1, 6, 6, true);
    trunkG.translate(0, 0.5, 0);
    const tp = trunkG.attributes.position;
    const H = 7;
    const trunkCol = [];
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i);
      tp.setX(i, tp.getX(i) + y * y * 1.1);
      tp.setY(i, y * H);
      const c = 0.85 + 0.15 * Math.sin(y * 40);
      trunkCol.push(0.42 * c, 0.3 * c, 0.2 * c);
    }
    trunkG.setAttribute('color', new THREE.Float32BufferAttribute(trunkCol, 3));
    trunkG.computeVertexNormals();
    // fronds: 7 curved leaf blades at the top
    const mg = new Merger();
    const topX = 1.1, topY = H;
    const leafA = new THREE.Color(0x2f8a2a), leafB = new THREE.Color(0x4fae3a);
    for (let f = 0; f < 8; f++) {
      const ang = (f / 8) * Math.PI * 2 + (f % 2) * 0.2;
      const dir = V(Math.cos(ang), 0, Math.sin(ang));
      const side = V(-dir.z, 0, dir.x);
      const segs = 5, L = 3.4;
      let prevL, prevR;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const w = 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.1)) * (1 - t * 0.6);
        const c = V(topX + dir.x * L * t, topY + 0.5 * Math.sin(t * 2.2) * 1.2 - t * t * 1.9, dir.z * L * t);
        const l = c.clone().addScaledVector(side, -w), r = c.clone().addScaledVector(side, w);
        c.y += 0.0;
        if (s > 0) mg.quad(prevL, prevR, r, l, (s % 2 ? leafA : leafB));
        prevL = l; prevR = r;
      }
    }
    const leafG = mg.build();
    const trunkM = [], leafM = [], leafC = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let count = 0, guard = 0;
    while (count < 400 && guard++ < 4000) {
      const p = freeSpot(0.9, 38, 5, 1);
      if (!p) continue;
      const nearBeach = p.h < 4;
      if (!nearBeach && rand() < 0.45) continue;
      q.setFromAxisAngle(up, rand() * Math.PI * 2);
      const s = 0.7 + rand() * 0.7;
      sv.set(s, s * (0.85 + rand() * 0.4), s);
      pv.set(p.x, p.h - 0.2, p.z);
      m4.compose(pv, q, sv);
      trunkM.push(m4.clone());
      leafM.push(m4.clone());
      leafC.push(new THREE.Color().setHSL(0.27 + rand() * 0.05, 0.6, 0.85 + rand() * 0.3));
      placed.push({ x: p.x, z: p.z, r: 1 });
      count++;
    }
    instanced(trunkG, vcMat, trunkM, null, true);
    instanced(leafG, vcMatSide, leafM, leafC, true);
  }

  // ---------- rocks ----------
  {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const n = 0.75 + vnoise(x * 2.1 + 5, z * 2.1 + y * 1.7) * 0.5;
      pa.setXYZ(i, x * n, y * n * 0.7, z * n);
    }
    g.computeVertexNormals();
    const ms = [], cs = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    let c = 0, guard = 0;
    while (c < 300 && guard++ < 3000) {
      const p = freeSpot(-0.3, 60, 6, 1);
      if (!p) continue;
      const s = 0.5 + Math.pow(rand(), 2.5) * 3.5;
      e.set(rand() * 0.4, rand() * 6.28, rand() * 0.4); q.setFromEuler(e);
      m4.compose(V(p.x, p.h + s * 0.15, p.z), q, V(s * (1 + rand() * 0.5), s, s * (1 + rand() * 0.5)));
      ms.push(m4.clone());
      const gr = 0.4 + rand() * 0.2;
      cs.push(new THREE.Color(gr, gr * 0.97, gr * 0.92));
      c++;
    }
    instanced(g, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), ms, cs, true);
  }

  // ---------- bushes ----------
  {
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.scale(1, 0.7, 1);
    const ms = [], cs = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    let c = 0, guard = 0;
    while (c < 250 && guard++ < 3000) {
      const p = freeSpot(1.5, 30, 4, 1);
      if (!p) continue;
      const s = 0.6 + rand() * 1.0;
      q.setFromAxisAngle(V(0, 1, 0), rand() * 6.28);
      m4.compose(V(p.x, p.h + s * 0.3, p.z), q, V(s * 1.3, s, s * 1.3));
      ms.push(m4.clone());
      cs.push(new THREE.Color().setHSL(0.25 + rand() * 0.07, 0.55, 0.22 + rand() * 0.12));
      c++;
    }
    instanced(g, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), ms, cs, true);
  }

  // ---------- houses / huts (one merged mesh) ----------
  {
    const mg = new Merger();
    const wallCols = [0xf0e2c0, 0xe8c9a0, 0xd9e6e0, 0xf3d6d0, 0xcfe0b8].map(c => new THREE.Color(c));
    const roofCols = [0xb5442f, 0x8a3b2a, 0x5b6b7a, 0xa0522d].map(c => new THREE.Color(c));
    const doorC = new THREE.Color(0x5a3a22), winC = new THREE.Color(0x35566e);
    let n = 0, guard = 0;
    while (n < 9 && guard++ < 600) {
      const s = Math.floor(rand() * RS);
      const p = rpts[s], q = rpts[(s + 3) % RS], o = rpts[(s + RS - 3) % RS];
      let tx = q.x - o.x, tz = q.z - o.z; const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
      const side = rand() < 0.5 ? 1 : -1;
      const off = 15 + rand() * 12;
      const x = p.x + tz * off * side, z = p.z - tx * off * side;
      const h = getHeightAt(x, z);
      if (h < 1.8 || h > 25) continue;
      if (roadDist(x, z) < 12) continue;
      const w = 5 + rand() * 3, d = 4 + rand() * 3, ht = 2.6 + rand() * 0.6;
      // slope check
      let flat = true;
      for (const [ox, oz] of [[w, d], [-w, d], [w, -d], [-w, -d]]) if (Math.abs(getHeightAt(x + ox, z + oz) - h) > 1.2) flat = false;
      if (!flat) continue;
      if (placed.some(pp => Math.hypot(pp.x - x, pp.z - z) < 9)) continue;
      const rot = Math.atan2(-tz * side, tx * side); // face the road
      const faceY = Math.atan2(tz * side * -1, tx * side * -1);
      const m = new THREE.Matrix4().compose(V(x, h - 0.5, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(-tz * side, tx * side)), V(1, 1, 1));
      const wc = wallCols[n % wallCols.length], rc = roofCols[n % roofCols.length];
      const bg = new THREE.BoxGeometry(w, ht + 0.5, d); bg.translate(0, (ht + 0.5) / 2, 0);
      mg.geo(bg, wc, m);
      // pyramid roof
      const rg = new THREE.ConeGeometry(Math.hypot(w, d) * 0.62, 1.8, 4, 1);
      rg.rotateY(Math.PI / 4 + Math.atan2(d, w) - Math.PI / 4 + 0);
      rg.scale(1, 1, 1);
      rg.translate(0, ht + 0.5 + 0.9, 0);
      mg.geo(rg, rc, m);
      // door + window on +Z... local face towards road is local -Z/+Z mix; place on +Z face
      const dg = new THREE.BoxGeometry(1.0, 1.9, 0.12); dg.translate(0, 0.95 + 0.0, d / 2 + 0.02);
      mg.geo(dg, doorC, m);
      const wg = new THREE.BoxGeometry(1.0, 0.9, 0.12); wg.translate(w / 3, 1.6, d / 2 + 0.02);
      mg.geo(wg, winC, m);
      placed.push({ x, z, r: 6 });
      n++;
    }
    const geo = mg.build();
    const mesh = new THREE.Mesh(geo, vcMat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // ---------- lighthouse ----------
  {
    let lx = 0, lz = 0, lh = 0, found = false;
    for (let k = 0; k < 40 && !found; k++) {
      const a = 2.4 + k * 0.157;
      for (let r = 440; r > 330; r -= 2) {
        const x = Math.cos(a) * r, z = Math.sin(a) * r, h = getHeightAt(x, z);
        if (h > 1.8) {
          if (roadDist(x, z) > 25 && getHeightAt(x + Math.cos(a) * 8, z + Math.sin(a) * 8) < h + 0.5) { lx = x; lz = z; lh = h; found = true; }
          break;
        }
      }
    }
    if (found) {
      const mg = new THREE.Group();
      const mgr = new Merger();
      const white = new THREE.Color(0xf4f4f0), red = new THREE.Color(0xc4302b), dark = new THREE.Color(0x2a2a2e), glass = new THREE.Color(0xffe9a0);
      const baseY = lh - 1;
      const seg = (r0, r1, y0, hgt, col) => { const g = new THREE.CylinderGeometry(r1, r0, hgt, 14); g.translate(0, y0 + hgt / 2, 0); mgr.geo(g, col, new THREE.Matrix4().makeTranslation(lx, baseY, lz)); };
      seg(4.2, 3.6, 0, 3, white);
      seg(3.5, 3.0, 3, 8, red);
      seg(3.0, 2.6, 11, 8, white);
      seg(2.6, 2.2, 19, 8, red);
      seg(3.6, 3.6, 27, 0.6, dark);
      seg(1.6, 1.6, 27.6, 2.4, glass);
      const cone = new THREE.ConeGeometry(2.2, 2.2, 14); cone.translate(0, 31.1, 0);
      mgr.geo(cone, dark, new THREE.Matrix4().makeTranslation(lx, baseY, lz));
      const mesh = new THREE.Mesh(mgr.build(), vcMat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
      placed.push({ x: lx, z: lz, r: 5 });
    }
  }

  // ---------- wooden pier ----------
  {
    let done = false;
    for (let k = 0; k < 60 && !done; k++) {
      const a = -0.6 + k * 0.1047;
      const dx = Math.cos(a), dz = Math.sin(a);
      let landR = -1;
      for (let r = 470; r > 330; r -= 1) {
        if (getHeightAt(dx * r, dz * r) > 1.3) { landR = r; break; }
      }
      if (landR < 0) continue;
      const sx = dx * (landR - 3), sz = dz * (landR - 3);
      if (roadDist(sx, sz) < 28 || roadDist(dx * (landR + 20), dz * (landR + 20)) < 28) continue;
      let ok = true;
      for (let t = 0; t < pier.len; t += 4) if (getHeightAt(sx + dx * t, sz + dz * t) > 6) ok = false;
      if (!ok) continue;
      pier.on = true; pier.x = sx; pier.z = sz; pier.dx = dx; pier.dz = dz; done = true;
    }
    if (pier.on) {
      const mgr = new Merger();
      const plank = new THREE.Color(0x8a6a44), plank2 = new THREE.Color(0x7a5b3a), post = new THREE.Color(0x4e3a26);
      const ang = Math.atan2(pier.dx, pier.dz); // local +Z along pier
      const base = new THREE.Matrix4().compose(V(pier.x, 0, pier.z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), ang), V(1, 1, 1));
      for (let t = 0; t < pier.len; t += 1) {
        const g = new THREE.BoxGeometry(pier.hw * 2, 0.18, 0.92); g.translate(0, pier.y - 0.09, t + 0.5);
        mgr.geo(g, (t % 2) ? plank : plank2, base);
      }
      for (let t = 1; t < pier.len; t += 4) for (const sx of [-1, 1]) {
        const g = new THREE.BoxGeometry(0.28, 3.4, 0.28); g.translate(sx * (pier.hw - 0.1), pier.y - 1.6, t);
        mgr.geo(g, post, base);
        const rl = new THREE.BoxGeometry(0.1, 0.1, 4.0); rl.translate(sx * (pier.hw - 0.1), pier.y + 0.9, t + 2);
        if (t + 4 < pier.len) mgr.geo(rl, post, base);
        const pp = new THREE.BoxGeometry(0.14, 1.0, 0.14); pp.translate(sx * (pier.hw - 0.1), pier.y + 0.4, t);
        mgr.geo(pp, post, base);
      }
      const mesh = new THREE.Mesh(mgr.build(), vcMat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }

  // sky follows camera; shadow follows camera
  sky.scale.setScalar(1400);
  const tgt = new THREE.Vector3();
  let time = 0;
  function update(dt, cameraPosition) {
    time += dt;
    oceanMat.uniforms.uTime.value = time;
    if (cameraPosition) {
      sky.position.copy(cameraPosition);
      tgt.set(Math.round(cameraPosition.x), Math.round(cameraPosition.y * 0 + getHeightAt(cameraPosition.x, cameraPosition.z)), Math.round(cameraPosition.z));
      sun.target.position.copy(tgt);
      sun.position.copy(tgt).addScaledVector(sunDir, 200);
      sun.target.updateMatrixWorld();
    }
  }

  return {
    getHeightAt, getNormalAt, isOnRoad, isWater,
    spawn, sun, radius: 450, roadPoints, update,
  };
}
