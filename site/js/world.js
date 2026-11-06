import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Seeded random + value noise
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(405131);

const PERM = new Uint8Array(512);
(function () {
  const p = [];
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();
function hash2(x, y) { return PERM[(PERM[x & 255] + y) & 511] / 255; }
function smooth(t) { return t * t * (3 - 2 * t); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  const u = smooth(xf), v = smooth(yf);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
function fbm(x, y, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f); f *= 2.03; amp *= 0.5; }
  return s;
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const WORLD_SIZE = 1200;
const ISLAND_R = 380;
const ROAD_W = 11;
const ROAD_PTS = 260;

function coastRadius(ang) {
  return ISLAND_R + 45 * vnoise(Math.cos(ang) * 2 + 10, Math.sin(ang) * 2 + 10)
    + 22 * vnoise(Math.cos(ang) * 5 + 3, Math.sin(ang) * 5 + 7);
}

// raw terrain without road blending
function rawHeight(x, z) {
  const d = Math.hypot(x, z);
  const ang = Math.atan2(z, x);
  const cr = coastRadius(ang);
  const t = d / cr; // 0 center .. 1 coast
  // base profile: plateau then beach falloff
  let base;
  if (t < 1) base = 4 + 10 * (1 - sstep(0.55, 1.0, t)) - 3.5 * sstep(0.85, 1.0, t);
  else base = 0.5 - (t - 1) * 60;
  base = Math.max(base, -25);
  // mountain in center (slightly offset)
  const mx = x + 40, mz = z - 30;
  const md = Math.hypot(mx, mz);
  const mountain = 82 * Math.exp(-(md * md) / (2 * 75 * 75)) * (0.85 + 0.25 * fbm(x * 0.02, z * 0.02, 3));
  // hills
  const hills = (fbm(x * 0.008 + 5, z * 0.008 + 9, 4) * 0.5 + 0.5) * 18 * (1 - sstep(0.75, 1.0, t));
  const detail = fbm(x * 0.05, z * 0.05, 3) * 1.4;
  let h = base + (t < 1.05 ? mountain + hills + detail * (1 - sstep(0.9, 1.05, t)) : 0);
  return h;
}

// ---------------------------------------------------------------------------
// Road construction
// ---------------------------------------------------------------------------
function buildRoad() {
  const ctrl = [];
  const N = 22;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    let r = 250 + 45 * vnoise(Math.cos(a) * 1.6 + 30, Math.sin(a) * 1.6 + 30);
    r = Math.min(r, coastRadius(a) - 70);
    ctrl.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');
  const pts = curve.getSpacedPoints(ROAD_PTS).slice(0, ROAD_PTS);
  // heights: smoothed terrain along path
  const raw = pts.map(p => Math.max(rawHeight(p.x, p.z), 2.5));
  const hs = raw.slice();
  for (let pass = 0; pass < 30; pass++) {
    const tmp = hs.slice();
    for (let i = 0; i < ROAD_PTS; i++) {
      let s = 0;
      for (let k = -3; k <= 3; k++) s += tmp[(i + k + ROAD_PTS) % ROAD_PTS];
      hs[i] = s / 7;
    }
  }
  return pts.map((p, i) => ({ x: p.x, z: p.z, y: hs[i] + 0.15 }));
}

export function createWorld(scene, renderer) {
  const road = buildRoad();
  const roadPath = road.map(p => ({ x: p.x, z: p.z }));
  // cumulative length
  const cum = [0];
  for (let i = 1; i <= ROAD_PTS; i++) {
    const a = road[i - 1], b = road[i % ROAD_PTS];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const totalLen = cum[ROAD_PTS];

  // spatial grid of road segments for nearest lookup
  const CELL = 30;
  const GN = Math.ceil(WORLD_SIZE / CELL);
  const grid = new Array(GN * GN);
  for (let i = 0; i < grid.length; i++) grid[i] = [];
  const cellOf = v => clamp(Math.floor((v + WORLD_SIZE / 2) / CELL), 0, GN - 1);
  const REACH = 48;
  for (let i = 0; i < ROAD_PTS; i++) {
    const a = road[i], b = road[(i + 1) % ROAD_PTS];
    const x0 = cellOf(Math.min(a.x, b.x) - REACH), x1 = cellOf(Math.max(a.x, b.x) + REACH);
    const z0 = cellOf(Math.min(a.z, b.z) - REACH), z1 = cellOf(Math.max(a.z, b.z) + REACH);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) grid[gz * GN + gx].push(i);
  }
  const nearRes = { d: 1e9, y: 0, seg: 0, t: 0 };
  function nearestRoad(x, z) {
    nearRes.d = 1e9;
    const list = grid[cellOf(z) * GN + cellOf(x)];
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      const a = road[i], b = road[(i + 1) % ROAD_PTS];
      const dx = b.x - a.x, dz = b.z - a.z;
      const L2 = dx * dx + dz * dz || 1;
      let t = ((x - a.x) * dx + (z - a.z) * dz) / L2;
      t = clamp(t, 0, 1);
      const px = a.x + dx * t, pz = a.z + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < nearRes.d) { nearRes.d = d; nearRes.y = a.y + (b.y - a.y) * t; nearRes.seg = i; nearRes.t = t; }
    }
    return nearRes;
  }

  function getHeightAt(x, z) {
    const h = rawHeight(x, z);
    const n = nearestRoad(x, z);
    if (n.d > 1e8) return h;
    const half = ROAD_W / 2;
    if (n.d <= half + 4) return n.y;
    const w = sstep(half + 4, half + 30, n.d);
    // shoulders slightly below road
    return lerp(n.y - 0.05, h, w);
  }
  function getSurfaceAt(x, z) {
    const n = nearestRoad(x, z);
    if (n.d <= ROAD_W / 2) return 'road';
    const h = getHeightAt(x, z);
    if (h < 0) return 'water';
    if (h < 2.2) return 'sand';
    const e = 1.5;
    const slope = Math.hypot(getHeightAt(x + e, z) - getHeightAt(x - e, z), getHeightAt(x, z + e) - getHeightAt(x, z - e)) / (2 * e);
    if (h > 45 || slope > 0.75) return 'rock';
    return 'grass';
  }
  function roadDir(i) {
    const a = road[(i - 1 + ROAD_PTS) % ROAD_PTS], b = road[(i + 1) % ROAD_PTS];
    return Math.atan2(b.x - a.x, b.z - a.z);
  }

  // checkpoints
  const checkpoints = [];
  for (let c = 0; c < 10; c++) {
    const target = (c / 10) * totalLen;
    let i = 0;
    while (i < ROAD_PTS - 1 && cum[i + 1] < target) i++;
    checkpoints.push({ x: road[i].x, z: road[i].z, heading: roadDir(i) });
  }
  // spawn ~15m before cp0
  let si = ROAD_PTS - 1, acc = 0;
  while (acc < 15) { const a = road[si], b = road[(si + 1) % ROAD_PTS]; acc += Math.hypot(b.x - a.x, b.z - a.z); si--; }
  si = (si + 1 + ROAD_PTS) % ROAD_PTS;
  const spawn = { x: road[si].x, z: road[si].z, heading: roadDir(si) };

  const colliders = [];
  const updaters = [];
  const isClear = (x, z, minRoad) => nearestRoad(x, z).d > minRoad;

  // ---------------------------------------------------------------------
  // Sky, lights, fog, environment
  // ---------------------------------------------------------------------
  const sky = new Sky();
  sky.scale.setScalar(3400);
  const su = sky.material.uniforms;
  su.turbidity.value = 4;
  su.rayleigh.value = 1.6;
  su.mieCoefficient.value = 0.004;
  su.mieDirectionalG.value = 0.82;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(62), THREE.MathUtils.degToRad(215));
  su.sunPosition.value.copy(sunDir);
  scene.add(sky);
  scene.fog = new THREE.Fog(0xbfdcea, 350, 1900);

  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const sky2 = new Sky(); sky2.scale.setScalar(100);
    Object.keys(su).forEach(k => { if (sky2.material.uniforms[k]) sky2.material.uniforms[k].value = su[k].value; });
    envScene.add(sky2);
    scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    pmrem.dispose();
  } catch (e) { console.warn('env failed', e); }

  renderer.toneMappingExposure = 0.8;
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6b8a4a, 0.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -120; sc.right = 120; sc.top = 120; sc.bottom = -120; sc.near = 1; sc.far = 600;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.08;
  scene.add(sun); scene.add(sun.target);

  // ---------------------------------------------------------------------
  // Terrain mesh
  // ---------------------------------------------------------------------
  const SEG = 200;
  const tGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEG, SEG);
  tGeo.rotateX(-Math.PI / 2);
  const tPos = tGeo.attributes.position;
  const tCol = new Float32Array(tPos.count * 3);
  const heightField = new Float32Array((SEG + 1) * (SEG + 1));
  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i), z = tPos.getZ(i);
    let h = getHeightAt(x, z);
    // sink terrain a little under the road ribbon so it never pokes through
    const rdist = nearestRoad(x, z).d;
    if (rdist < ROAD_W / 2 + 2) h -= 0.3;
    tPos.setY(i, h);
    heightField[i] = h;
  }
  tGeo.computeVertexNormals();
  const tNor = tGeo.attributes.normal;
  const cSand = new THREE.Color(0xe8d3a0), cWet = new THREE.Color(0xb59a68), cSea = new THREE.Color(0x7d8a6a);
  const cGrass = new THREE.Color(0x5f9a3a), cGrass2 = new THREE.Color(0x3f7d2c), cDry = new THREE.Color(0x9aa45a);
  const cRock = new THREE.Color(0x7a7066), cRock2 = new THREE.Color(0x5b534c), cDirt = new THREE.Color(0x8a7550);
  const tmpC = new THREE.Color();
  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i), z = tPos.getZ(i), h = tPos.getY(i);
    const ny = tNor.getY(i);
    const n1 = fbm(x * 0.03, z * 0.03, 3) * 0.5 + 0.5;
    const rd = nearestRoad(x, z).d;
    if (h < -0.3) tmpC.copy(cWet).lerp(cSea, sstep(-0.3, -12, h));
    else if (h < 2.4) tmpC.copy(cWet).lerp(cSand, sstep(-0.3, 1.0, h));
    else {
      tmpC.copy(cGrass).lerp(cGrass2, n1);
      tmpC.lerp(cDry, sstep(0.55, 0.85, fbm(x * 0.012 + 40, z * 0.012, 2) * 0.5 + 0.5) * 0.6);
      tmpC.lerp(cSand, 1 - sstep(2.4, 4.0, h));
      const rockiness = Math.max(sstep(0.86, 0.7, ny), sstep(38, 55, h));
      tmpC.lerp(n1 > 0.5 ? cRock : cRock2, rockiness);
    }
    if (rd < ROAD_W / 2 + 2.5 && h > 0) tmpC.lerp(cDirt, 0.75);
    tCol[i * 3] = tmpC.r; tCol[i * 3 + 1] = tmpC.g; tCol[i * 3 + 2] = tmpC.b;
  }
  tGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
  const terrain = new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ---------------------------------------------------------------------
  // Road mesh
  // ---------------------------------------------------------------------
  function makeRoadTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#3a3b3e'; g.fillRect(0, 0, 256, 512);
    const r2 = mulberry32(77);
    for (let i = 0; i < 9000; i++) {
      const v = 40 + r2() * 45 | 0;
      g.fillStyle = `rgba(${v},${v},${v + 3},${0.35 + r2() * 0.4})`;
      g.fillRect(r2() * 256, r2() * 512, 1 + r2() * 2, 1 + r2() * 2);
    }
    for (let i = 0; i < 6; i++) { // patches / cracks
      g.fillStyle = 'rgba(20,20,22,0.25)';
      g.beginPath(); g.ellipse(r2() * 256, r2() * 512, 10 + r2() * 30, 6 + r2() * 20, r2() * 3, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#e9e6dc';
    g.fillRect(10, 0, 7, 512); g.fillRect(239, 0, 7, 512);
    g.fillStyle = '#f2c43a';
    g.fillRect(124, 0, 8, 240);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const rPos = [], rUv = [], rIdx = [];
  const SUB = 3; // subdivide each segment for smoother ribbon
  let vIndex = 0;
  for (let i = 0; i <= ROAD_PTS; i++) {
    const p = road[i % ROAD_PTS];
    const hd = roadDir(i % ROAD_PTS);
    const rx = Math.cos(hd), rz = -Math.sin(hd); // right vector
    const half = ROAD_W / 2;
    for (let s = 0; s <= SUB; s++) {
      const u = s / SUB;
      const off = -half + u * ROAD_W;
      rPos.push(p.x + rx * off, p.y + 0.06, p.z + rz * off);
      rUv.push(u, cum[i] / 22);
    }
    if (i > 0) {
      const base = vIndex - (SUB + 1);
      for (let s = 0; s < SUB; s++) {
        const a = base + s, b = base + s + 1, c2 = vIndex + s, d = vIndex + s + 1;
        rIdx.push(a, c2, b, b, c2, d);
      }
    }
    vIndex += SUB + 1;
  }
  const rGeo = new THREE.BufferGeometry();
  rGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
  rGeo.setAttribute('uv', new THREE.Float32BufferAttribute(rUv, 2));
  rGeo.setIndex(rIdx);
  rGeo.computeVertexNormals();
  const roadMat = new THREE.MeshStandardMaterial({ map: makeRoadTexture(), roughness: 0.85, metalness: 0.02, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const roadMesh = new THREE.Mesh(rGeo, roadMat);
  roadMesh.receiveShadow = true;
  scene.add(roadMesh);

  // curbs on sharp bends (instanced alternating red/white blocks)
  {
    const curbGeo = new THREE.BoxGeometry(0.6, 0.18, 2.0);
    const curbMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    const list = [];
    for (let i = 0; i < ROAD_PTS; i++) {
      const d = Math.abs(((roadDir((i + 2) % ROAD_PTS) - roadDir((i - 2 + ROAD_PTS) % ROAD_PTS) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d > 0.09) list.push(i);
    }
    const curbs = new THREE.InstancedMesh(curbGeo, curbMat, list.length * 4);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc3 = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
    const red = new THREE.Color(0xd62828), white = new THREE.Color(0xf4f4f4);
    let k = 0;
    list.forEach(i => {
      const a = road[i], b = road[(i + 1) % ROAD_PTS];
      const hd = roadDir(i);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hd);
      const rx = Math.cos(hd), rz = -Math.sin(hd);
      for (let h2 = 0; h2 < 2; h2++) {
        const t = h2 * 0.5;
        const cx = a.x + (b.x - a.x) * t, cz = a.z + (b.z - a.z) * t, cy = a.y + (b.y - a.y) * t;
        for (const side of [-1, 1]) {
          const off = side * (ROAD_W / 2 + 0.25);
          pos.set(cx + rx * off, cy + 0.08, cz + rz * off);
          m.compose(pos, q, sc3);
          curbs.setMatrixAt(k, m);
          curbs.setColorAt(k, ((i * 2 + h2) % 2) ? red : white);
          k++;
        }
      }
    });
    curbs.count = k;
    curbs.receiveShadow = true;
    scene.add(curbs);
  }

  // start / finish checkered line
  {
    const c = document.createElement('canvas'); c.width = 256; c.height = 32;
    const g = c.getContext('2d');
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#fafafa'; g.fillRect(x * 16, y * 16, 16, 16);
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 1.4),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    sl.rotation.order = 'YXZ';
    sl.rotation.y = checkpoints[0].heading; sl.rotation.x = -Math.PI / 2;
    sl.position.set(checkpoints[0].x, getHeightAt(checkpoints[0].x, checkpoints[0].z) + 0.08, checkpoints[0].z);
    sl.receiveShadow = true;
    scene.add(sl);
  }

  // ---------------------------------------------------------------------
  // Water (height-field driven depth tint)
  // ---------------------------------------------------------------------
  const HF = 256;
  const hData = new Uint8Array(HF * HF * 4);
  for (let j = 0; j < HF; j++) for (let i = 0; i < HF; i++) {
    const x = (i / (HF - 1) - 0.5) * WORLD_SIZE, z = (j / (HF - 1) - 0.5) * WORLD_SIZE;
    const h = rawHeight(x, z);
    const depth = clamp(-h / 25, 0, 1); // 0 shallow .. 1 deep
    const above = h > 0 ? 255 : 0;
    const o = (j * HF + i) * 4;
    hData[o] = depth * 255; hData[o + 1] = above; hData[o + 2] = 0; hData[o + 3] = 255;
  }
  const depthTex = new THREE.DataTexture(hData, HF, HF, THREE.RGBAFormat);
  depthTex.magFilter = THREE.LinearFilter; depthTex.minFilter = THREE.LinearFilter;
  depthTex.needsUpdate = true;

  const waterUniforms = {
    uTime: { value: 0 },
    uDepth: { value: depthTex },
    uWorld: { value: WORLD_SIZE },
    uSunDir: { value: sunDir.clone().normalize() },
    uShallow: { value: new THREE.Color(0x3fe0d0) },
    uMid: { value: new THREE.Color(0x0f9bb4) },
    uDeep: { value: new THREE.Color(0x0a4f7a) },
    uFogColor: { value: scene.fog.color },
    uFogNear: { value: scene.fog.near },
    uFogFar: { value: scene.fog.far }
  };
  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: true,
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vViewDist;
      float wave(vec2 p, vec2 d, float f, float s, float a) { return a * sin(dot(p, d) * f + uTime * s); }
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec2 p = wp.xz;
        float h = wave(p, normalize(vec2(1.0, 0.3)), 0.08, 1.2, 0.18)
                + wave(p, normalize(vec2(-0.4, 1.0)), 0.13, 1.7, 0.10)
                + wave(p, normalize(vec2(0.7, -0.8)), 0.31, 2.6, 0.04);
        wp.y += h;
        float e = 0.5;
        vec2 px = p + vec2(e, 0.0), pz = p + vec2(0.0, e);
        float hx = wave(px, normalize(vec2(1.0, 0.3)), 0.08, 1.2, 0.18) + wave(px, normalize(vec2(-0.4, 1.0)), 0.13, 1.7, 0.10) + wave(px, normalize(vec2(0.7, -0.8)), 0.31, 2.6, 0.04);
        float hz = wave(pz, normalize(vec2(1.0, 0.3)), 0.08, 1.2, 0.18) + wave(pz, normalize(vec2(-0.4, 1.0)), 0.13, 1.7, 0.10) + wave(pz, normalize(vec2(0.7, -0.8)), 0.31, 2.6, 0.04);
        vNormalW = normalize(vec3(h - hx, e, h - hz));
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vViewDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform sampler2D uDepth;
      uniform float uWorld;
      uniform vec3 uSunDir, uShallow, uMid, uDeep, uFogColor;
      uniform float uFogNear, uFogFar;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vViewDist;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main() {
        vec2 uv = vWorld.xz / uWorld + 0.5;
        float depth = 1.0;
        float land = 0.0;
        if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
          vec4 d = texture2D(uDepth, uv);
          depth = d.r; land = d.g;
        }
        // detail normal ripples
        vec2 q = vWorld.xz * 0.35;
        float n1 = noise(q + uTime * 0.25) - 0.5, n2 = noise(q * 2.3 - uTime * 0.3) - 0.5;
        vec3 N = normalize(vNormalW + vec3(n1 * 0.25 + n2 * 0.12, 0.0, n2 * 0.25 - n1 * 0.12));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        vec3 col = mix(uShallow, uMid, smoothstep(0.0, 0.25, depth));
        col = mix(col, uDeep, smoothstep(0.25, 0.9, depth));
        vec3 skyCol = vec3(0.62, 0.80, 0.95);
        col = mix(col, skyCol, fres * 0.65);
        vec3 H = normalize(uSunDir + V);
        float spec = pow(max(dot(N, H), 0.0), 220.0) * 3.0;
        col += vec3(1.0, 0.95, 0.85) * spec;
        // shoreline foam
        float shore = 1.0 - smoothstep(0.0, 0.06, depth);
        float foamN = noise(vWorld.xz * 0.6 + vec2(uTime * 0.4, 0.0));
        float band = smoothstep(0.55, 0.95, sin(depth * 160.0 - uTime * 2.2) * 0.5 + 0.5);
        float foam = clamp(shore * (0.55 + 0.45 * band) * smoothstep(0.25, 0.65, foamN + shore * 0.4), 0.0, 1.0);
        foam = max(foam, land * 0.9);
        col = mix(col, vec3(0.96, 0.98, 1.0), foam * 0.85);
        float alpha = mix(0.55, 0.96, smoothstep(0.0, 0.35, depth));
        alpha = max(alpha, foam * 0.9);
        float fogF = smoothstep(uFogNear, uFogFar, vViewDist);
        col = mix(col, uFogColor, fogF);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000, 220, 220), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  water.renderOrder = 2;
  scene.add(water);

  // distant islands on the horizon
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5c7f5a, roughness: 1, flatShading: true });
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + rand() * 0.6;
      const r = 1300 + rand() * 500;
      const geo = new THREE.ConeGeometry(80 + rand() * 120, 40 + rand() * 90, 9, 3);
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) { p.setX(k, p.getX(k) * (0.85 + rand() * 0.3)); p.setZ(k, p.getZ(k) * (0.85 + rand() * 0.3)); }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.position.set(Math.cos(a) * r, 5, Math.sin(a) * r);
      m.scale.y = 0.7;
      scene.add(m);
    }
  }

  // ---------------------------------------------------------------------
  // Helpers for props
  // ---------------------------------------------------------------------
  const UP = new THREE.Vector3(0, 1, 0);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  const _e = new THREE.Euler();
  function slopeAt(x, z) {
    const e = 1.5;
    return Math.hypot(rawHeight(x + e, z) - rawHeight(x - e, z), rawHeight(x, z + e) - rawHeight(x, z - e)) / (2 * e);
  }
  const reserved = []; // {x,z,r} areas kept free of vegetation
  const isReserved = (x, z, pad = 0) => reserved.some(r => Math.hypot(x - r.x, z - r.z) < r.r + pad);
  function roadPoint(i, off) {
    const p = road[(i + ROAD_PTS) % ROAD_PTS];
    const hd = roadDir((i + ROAD_PTS) % ROAD_PTS);
    return { x: p.x + Math.cos(hd) * off, z: p.z - Math.sin(hd) * off, heading: hd, y: p.y };
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  const shadowAll = o => o.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });

  // ---------------------------------------------------------------------
  // Village (houses near the road)
  // ---------------------------------------------------------------------
  {
    const wallColors = [0xf4e1c1, 0xfbd38d, 0x9ad1d4, 0xf6a6a6, 0xffffff, 0xc7e59b, 0xf9e79f, 0xd7bde2];
    const roofColors = [0xb5442b, 0x8e3b2a, 0x2e6f8e, 0x5b4a3a, 0xc0662f];
    const winMat = new THREE.MeshStandardMaterial({ color: 0x24394a, roughness: 0.2, metalness: 0.4 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.8 });
    const centerIdx = Math.floor(ROAD_PTS * 0.32);
    let placed = 0;
    for (let k = 0; k < 16 && placed < 13; k++) {
      const side = k % 2 ? 1 : -1;
      const idx = centerIdx + (k >> 1) * 5 - 18;
      const off = side * (ROAD_W / 2 + 12 + rand() * 6);
      const rp = roadPoint(idx, off);
      const gh = getHeightAt(rp.x, rp.z);
      if (gh < 2.5 || slopeAt(rp.x, rp.z) > 0.45) continue;
      const w = 6 + rand() * 3, d = 6 + rand() * 3, hgt = 3.2 + rand() * 1.4;
      const g = new THREE.Group();
      const wallMat = new THREE.MeshStandardMaterial({ color: wallColors[(rand() * wallColors.length) | 0], roughness: 0.85 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, hgt + 2, d), wallMat);
      body.position.y = (hgt + 2) / 2 - 2;
      g.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2.4 + rand(), 4, 1),
        new THREE.MeshStandardMaterial({ color: roofColors[(rand() * roofColors.length) | 0], roughness: 0.7, flatShading: true }));
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
      roof.position.y = hgt + 1.2;
      g.add(roof);
      // door facing road (local -z faces road after rotation)
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.1), doorMat);
      door.position.set(0, 1.05, -d / 2 - 0.03);
      g.add(door);
      for (const wx of [-w / 2 + 1.3, w / 2 - 1.3]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 0.1), winMat);
        win.position.set(wx, 2.0, -d / 2 - 0.03); g.add(win);
        const win2 = win.clone(); win2.position.z = d / 2 + 0.03; g.add(win2);
      }
      // small chimney
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x8c8c8c }));
      ch.position.set(w * 0.25, hgt + 1.6, d * 0.15); g.add(ch);
      // face the road: door (-z) towards road center
      const toRoad = Math.atan2(-Math.cos(rp.heading) * side, Math.sin(rp.heading) * side);
      g.rotation.y = toRoad + Math.PI;
      g.position.set(rp.x, gh, rp.z);
      shadowAll(g);
      scene.add(g);
      const rr = Math.max(w, d) * 0.62;
      colliders.push({ x: rp.x, z: rp.z, r: rr });
      reserved.push({ x: rp.x, z: rp.z, r: rr + 3 });
      placed++;
    }
  }

  // ---------------------------------------------------------------------
  // Gas station
  // ---------------------------------------------------------------------
  {
    const idx = Math.floor(ROAD_PTS * 0.62);
    const side = -1;
    const rp = roadPoint(idx, side * (ROAD_W / 2 + 11));
    const gh = Math.max(getHeightAt(rp.x, rp.z), 2.5);
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(20, 2, 14), new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.9 }));
    slab.position.y = -0.85; g.add(slab);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });
    for (const px of [-7, 7]) for (const pz of [-4, 4]) {
      const pl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.5), pillarMat);
      pl.position.set(px, 2.6, pz); g.add(pl);
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(17, 0.8, 11), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    canopy.position.y = 5.4; g.add(canopy);
    const stripeTex = canvasTex(512, 64, (c, w, h) => {
      c.fillStyle = '#0a7d3b'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffffff'; c.fillRect(0, h * 0.42, w, h * 0.16);
      c.fillStyle = '#d7263d'; c.fillRect(0, h * 0.58, w, h * 0.12);
    });
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(17.1, 0.5, 11.1), new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.5 }));
    stripe.position.y = 5.2; g.add(stripe);
    const pumpMat = new THREE.MeshStandardMaterial({ color: 0x1565c0, roughness: 0.4 });
    const pumpTop = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x333333 });
    for (const px of [-3.5, 3.5]) {
      const pu = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.6), pumpMat);
      pu.position.set(px, 1.0, 0); g.add(pu);
      const sc2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.62), pumpTop);
      sc2.position.set(px, 1.6, 0); g.add(sc2);
      const island = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 3), new THREE.MeshStandardMaterial({ color: 0xf2c43a }));
      island.position.set(px, 0.12, 0); g.add(island);
    }
    const shop = new THREE.Mesh(new THREE.BoxGeometry(8, 3.6, 5), new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.8 }));
    shop.position.set(0, 1.8, 9); g.add(shop);
    const shopWin = new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, 0.1), new THREE.MeshStandardMaterial({ color: 0x9fd3ff, emissive: 0x224466, roughness: 0.1 }));
    shopWin.position.set(0, 1.9, 6.45); g.add(shopWin);
    // sign tower
    const signTex = canvasTex(512, 256, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0e8a45'); gr.addColorStop(1, '#075c2d');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#ffffff'; c.lineWidth = 10; c.strokeRect(8, 8, w - 16, h - 16);
      c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.direction = 'rtl';
      c.font = 'bold 92px Vazirmatn, Tahoma, sans-serif';
      c.fillText('پمپ بنزین', w / 2, h * 0.42);
      c.font = 'bold 40px Vazirmatn, Tahoma, sans-serif';
      c.fillStyle = '#ffe14a';
      c.fillText('بنزین معمولی · سوپر', w / 2, h * 0.78);
    });
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.35 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 2.5, 0.3), [pillarMat, pillarMat, pillarMat, pillarMat, signMat, signMat]);
    sign.position.set(-9, 7.5, -6); g.add(sign);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 7, 8), pillarMat);
    pole.position.set(-9, 3.2, -6); g.add(pole);
    // orient: local -z towards road
    g.rotation.y = Math.atan2(Math.cos(rp.heading) * side, -Math.sin(rp.heading) * side);
    g.position.set(rp.x, gh, rp.z);
    // compute world positions of colliders
    g.updateMatrixWorld(true);
    const addLocalCollider = (lx, lz, r) => {
      const v = new THREE.Vector3(lx, 0, lz).applyMatrix4(g.matrixWorld);
      colliders.push({ x: v.x, z: v.z, r });
    };
    for (const px of [-7, 7]) for (const pz of [-4, 4]) addLocalCollider(px, pz, 0.45);
    addLocalCollider(-3.5, 0, 0.8); addLocalCollider(3.5, 0, 0.8);
    addLocalCollider(-2.5, 9, 2.6); addLocalCollider(2.5, 9, 2.6);
    addLocalCollider(-9, -6, 0.35);
    reserved.push({ x: rp.x, z: rp.z, r: 16 });
    shadowAll(g);
    scene.add(g);
  }

  // ---------------------------------------------------------------------
  // Lighthouse on a coastal cliff
  // ---------------------------------------------------------------------
  let beamPivot = null;
  {
    let best = null;
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const r = coastRadius(a) - 22;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (nearestRoad(x, z).d < 40) continue;
      const h = getHeightAt(x, z);
      if (!best || h > best.h) best = { x, z, h, a };
    }
    if (best) {
      const g = new THREE.Group();
      const red = new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.6 });
      const white = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.8, 3, 16), new THREE.MeshStandardMaterial({ color: 0x8d8478, roughness: 1 }));
      base.position.y = 0.5; g.add(base);
      const segs = 6, segH = 3.2;
      for (let i = 0; i < segs; i++) {
        const r1 = 2.8 - i * 0.22, r0 = 2.8 - (i + 1) * 0.22;
        const s = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, segH, 20), i % 2 ? red : white);
        s.position.y = 2 + segH * (i + 0.5); g.add(s);
      }
      const topY = 2 + segH * segs;
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.35, 20), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      deck.position.y = topY + 0.15; g.add(deck);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2, 16),
        new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xffe08a, emissiveIntensity: 1.6, transparent: true, opacity: 0.85 }));
      glass.position.y = topY + 1.3; g.add(glass);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.6, 16), red);
      cap.position.y = topY + 3.1; g.add(cap);
      beamPivot = new THREE.Group();
      beamPivot.position.y = topY + 1.3;
      const beamGeo = new THREE.ConeGeometry(6, 70, 24, 1, true);
      beamGeo.translate(0, -35, 0);
      beamGeo.rotateZ(Math.PI / 2);
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
      const beam1 = new THREE.Mesh(beamGeo, beamMat);
      const beam2 = new THREE.Mesh(beamGeo, beamMat); beam2.rotation.y = Math.PI;
      beamPivot.add(beam1, beam2);
      g.add(beamPivot);
      g.position.set(best.x, best.h - 0.5, best.z);
      g.traverse(c => { if (c.isMesh && c.material !== beamMat) { c.castShadow = true; c.receiveShadow = true; } });
      scene.add(g);
      colliders.push({ x: best.x, z: best.z, r: 4.6 });
      reserved.push({ x: best.x, z: best.z, r: 9 });
    }
  }

  // ---------------------------------------------------------------------
  // Wooden pier
  // ---------------------------------------------------------------------
  {
    let a = 3.9, found = null;
    for (let tries = 0; tries < 60 && !found; tries++, a += 0.1) {
      // walk outward until height ~ 0.6
      for (let r = 200; r < 520; r += 2) {
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (rawHeight(x, z) < 0.8) { if (nearestRoad(x, z).d > 25) found = { x, z, a }; break; }
      }
    }
    if (found) {
      const g = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: 0x8b6a45, roughness: 0.9 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1 });
      const L = 46;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, L), wood);
      deck.position.set(0, 1.4, L / 2 - 4); g.add(deck);
      for (let i = 0; i < L; i += 1.1) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 0.9), i % 2.2 < 1.1 ? wood : dark);
        plank.position.set(0, 1.58, i - 4); g.add(plank);
      }
      const postGeo = new THREE.CylinderGeometry(0.16, 0.18, 6, 6);
      for (let i = 0; i <= L; i += 5) for (const sx of [-1.9, 1.9]) {
        const post = new THREE.Mesh(postGeo, dark); post.position.set(sx, -1.2, i - 4); g.add(post);
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 5), dark);
        rail.position.set(sx, 2.2, i - 4); g.add(rail);
      }
      for (const sx of [-1.9, 1.9]) {
        const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, L), wood); r2.position.set(sx, 2.75, L / 2 - 4); g.add(r2);
      }
      // little boat
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
      boat.add(hull);
      const bow = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.6, 4), hull.material);
      bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.scale.set(1, 1, 0.55);
      bow.position.z = 3.3; boat.add(bow);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 0.6), new THREE.MeshStandardMaterial({ color: 0x8b6a45 }));
      seat.position.y = 0.4; boat.add(seat);
      const stripeB = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 5), new THREE.MeshStandardMaterial({ color: 0x1e88e5 }));
      stripeB.position.y = 0.05; boat.add(stripeB);
      boat.position.set(4.5, 0.25, L - 12);
      g.add(boat);
      g.position.set(found.x, 0, found.z);
      g.rotation.y = Math.atan2(Math.cos(found.a), Math.sin(found.a));
      shadowAll(g);
      scene.add(g);
      updaters.push((dt, t) => { boat.position.y = 0.2 + Math.sin(t * 1.3) * 0.12; boat.rotation.z = Math.sin(t * 0.9) * 0.05; });
      reserved.push({ x: found.x, z: found.z, r: 8 });
    }
  }

  // ---------------------------------------------------------------------
  // Palm trees (instanced: trunk + fronds)
  // ---------------------------------------------------------------------
  {
    // trunk: curved segmented tube built from cylinders merged
    const trunkParts = [];
    const segs = 7, segLen = 1.25;
    let cx = 0, cy = 0;
    for (let i = 0; i < segs; i++) {
      const r0 = 0.28 - i * 0.022, r1 = 0.28 - (i + 1) * 0.022;
      const g = new THREE.CylinderGeometry(r1, r0 + 0.04, segLen, 7, 1);
      const bend = 0.06 * i;
      g.rotateZ(-bend);
      const nx = cx + Math.sin(bend) * segLen * 0.5, ny = cy + Math.cos(bend) * segLen * 0.5;
      g.translate(nx, ny, 0);
      cx = nx + Math.sin(bend) * segLen * 0.5; cy = ny + Math.cos(bend) * segLen * 0.5;
      trunkParts.push(g);
    }
    const topX = cx, topY = cy;
    const trunkGeo = mergeGeometries(trunkParts);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 });

    // fronds: bent strips
    const frondParts = [];
    const NF = 9;
    for (let f = 0; f < NF; f++) {
      const len = 4.2, wSeg = 8;
      const g = new THREE.PlaneGeometry(1.0, len, 2, wSeg);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const y = p.getY(k) + len / 2; // 0..len
        const t = y / len;
        let x = p.getX(k) * (1 - t * 0.85) * (0.6 + Math.sin(t * Math.PI) * 0.8);
        const droop = -Math.pow(t, 1.8) * 2.4;
        const fold = Math.abs(p.getX(k)) * 0.35;
        p.setXYZ(k, x, droop + fold, y * 0.95);
      }
      g.computeVertexNormals();
      g.rotateX(-0.25 - (f % 2) * 0.2);
      g.rotateY((f / NF) * Math.PI * 2 + rand() * 0.3);
      g.translate(topX, topY, 0);
      frondParts.push(g);
    }
    const coco = new THREE.SphereGeometry(0.22, 6, 5);
    const cocoParts = [];
    for (let i = 0; i < 3; i++) { const c = coco.clone(); c.translate(topX + Math.cos(i * 2.1) * 0.3, topY - 0.25, Math.sin(i * 2.1) * 0.3); cocoParts.push(c); }
    const frondGeo = mergeGeometries(frondParts);
    const frondMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
    const cocoGeo = mergeGeometries(cocoParts);
    const cocoMat = new THREE.MeshStandardMaterial({ color: 0x5a3d1e, roughness: 0.9 });

    const COUNT = 420;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, COUNT);
    const fronds = new THREE.InstancedMesh(frondGeo, frondMat, COUNT);
    const cocos = new THREE.InstancedMesh(cocoGeo, cocoMat, COUNT);
    const colTmp = new THREE.Color();
    let n = 0, guard = 0;
    while (n < COUNT && guard++ < 20000) {
      const a = rand() * Math.PI * 2;
      // bias toward beaches & lowlands
      const cr = coastRadius(a);
      const r = rand() < 0.55 ? cr * (0.82 + rand() * 0.17) : Math.sqrt(rand()) * cr * 0.95;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = getHeightAt(x, z);
      if (h < 0.9 || h > 40) continue;
      if (slopeAt(x, z) > 0.6) continue;
      if (!isClear(x, z, ROAD_W / 2 + 3)) continue;
      if (isReserved(x, z, 1)) continue;
      const s = 0.8 + rand() * 0.6;
      _q.setFromEuler(_e.set((rand() - 0.5) * 0.12, rand() * Math.PI * 2, (rand() - 0.5) * 0.12));
      _s.set(s, s * (0.9 + rand() * 0.3), s);
      _p.set(x, h - 0.2, z);
      _m.compose(_p, _q, _s);
      trunks.setMatrixAt(n, _m); fronds.setMatrixAt(n, _m); cocos.setMatrixAt(n, _m);
      colTmp.setHSL(0.27 + rand() * 0.06, 0.55 + rand() * 0.15, 0.3 + rand() * 0.12);
      fronds.setColorAt(n, colTmp);
      colliders.push({ x, z, r: 0.55 * s });
      n++;
    }
    trunks.count = fronds.count = cocos.count = n;
    for (const im of [trunks, fronds, cocos]) { im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; scene.add(im); }
  }

  // ---------------------------------------------------------------------
  // Bushes & flowers
  // ---------------------------------------------------------------------
  {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, k);
      v.multiplyScalar(0.8 + vnoise(v.x * 3 + 5, v.z * 3 + v.y * 2) * 0.25);
      p.setXYZ(k, v.x, v.y * 0.75, v.z);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    const COUNT = 280;
    const bushes = new THREE.InstancedMesh(geo, mat, COUNT);
    const c = new THREE.Color();
    let n = 0, guard = 0;
    while (n < COUNT && guard++ < 10000) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * coastRadius(a) * 0.95;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = getHeightAt(x, z);
      if (h < 2.5 || h > 45) continue;
      if (!isClear(x, z, ROAD_W / 2 + 2) || isReserved(x, z)) continue;
      const s = 0.6 + rand() * 1.1;
      _q.setFromAxisAngle(UP, rand() * 6.28);
      _s.set(s * (1 + rand() * 0.4), s, s * (1 + rand() * 0.4));
      _p.set(x, h + s * 0.3, z);
      _m.compose(_p, _q, _s);
      bushes.setMatrixAt(n, _m);
      if (rand() < 0.15) c.setHSL(rand() < 0.5 ? 0.95 : 0.08, 0.7, 0.55); // flowering
      else c.setHSL(0.25 + rand() * 0.08, 0.5, 0.22 + rand() * 0.12);
      bushes.setColorAt(n, c);
      n++;
    }
    bushes.count = n;
    bushes.castShadow = true; bushes.receiveShadow = true; bushes.frustumCulled = false;
    scene.add(bushes);
  }

  // ---------------------------------------------------------------------
  // Rocks
  // ---------------------------------------------------------------------
  {
    const geo = new THREE.DodecahedronGeometry(1, 1);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, k);
      v.multiplyScalar(0.75 + (vnoise(v.x * 2.1 + 9, v.y * 2.3 + v.z * 1.7) * 0.5 + 0.5) * 0.45);
      p.setXYZ(k, v.x, v.y * 0.7, v.z);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
    const COUNT = 220;
    const rocks = new THREE.InstancedMesh(geo, mat, COUNT);
    const c = new THREE.Color();
    let n = 0, guard = 0;
    while (n < COUNT && guard++ < 10000) {
      const a = rand() * Math.PI * 2;
      const cr = coastRadius(a);
      const r = rand() < 0.4 ? cr * (0.95 + rand() * 0.12) : Math.sqrt(rand()) * cr;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = getHeightAt(x, z);
      if (h < -2) continue;
      if (!isClear(x, z, ROAD_W / 2 + 4) || isReserved(x, z)) continue;
      const big = h > 30 || rand() < 0.2;
      const s = big ? 1.5 + rand() * 3.0 : 0.4 + rand() * 1.0;
      _q.setFromEuler(_e.set(rand() * 3, rand() * 6.28, rand() * 3));
      _s.set(s * (0.8 + rand() * 0.6), s * (0.6 + rand() * 0.5), s * (0.8 + rand() * 0.6));
      _p.set(x, h - s * 0.2, z);
      _m.compose(_p, _q, _s);
      rocks.setMatrixAt(n, _m);
      const v = 0.38 + rand() * 0.18;
      c.setRGB(v * 1.05, v, v * 0.92);
      rocks.setColorAt(n, c);
      if (s > 0.9) colliders.push({ x, z, r: s * 0.85 });
      n++;
    }
    rocks.count = n;
    rocks.castShadow = true; rocks.receiveShadow = true; rocks.frustumCulled = false;
    scene.add(rocks);
  }

  // ---------------------------------------------------------------------
  // Street lamps
  // ---------------------------------------------------------------------
  const lampBulbs = [];
  {
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 6, 8); poleGeo.translate(0, 3, 0);
    const armGeo = new THREE.BoxGeometry(0.1, 0.1, 1.6); armGeo.translate(0, 5.95, -0.75);
    const headGeo = new THREE.BoxGeometry(0.35, 0.18, 0.6); headGeo.translate(0, 5.85, -1.45);
    const metal = mergeGeometries([poleGeo, armGeo, headGeo]);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x4a5058, metalness: 0.6, roughness: 0.4 });
    const bulbGeo = new THREE.BoxGeometry(0.28, 0.05, 0.5); bulbGeo.translate(0, 5.74, -1.45);
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd27a, emissiveIntensity: 0.6 });
    const step = 8;
    const COUNT = Math.ceil(ROAD_PTS / step);
    const poles = new THREE.InstancedMesh(metal, lampMat, COUNT);
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, COUNT);
    let n = 0;
    for (let i = 0; i < ROAD_PTS; i += step) {
      const side = (i / step) % 2 ? 1 : -1;
      const rp = roadPoint(i, side * (ROAD_W / 2 + 1.6));
      if (rawHeight(rp.x, rp.z) < 0.5 || isReserved(rp.x, rp.z)) continue;
      const y = getHeightAt(rp.x, rp.z);
      // arm (-z local) points toward road center
      const rot = Math.atan2(Math.cos(rp.heading) * side, -Math.sin(rp.heading) * side);
      _q.setFromAxisAngle(UP, rot);
      _p.set(rp.x, y, rp.z); _s.set(1, 1, 1);
      _m.compose(_p, _q, _s);
      poles.setMatrixAt(n, _m); bulbs.setMatrixAt(n, _m);
      colliders.push({ x: rp.x, z: rp.z, r: 0.25 });
      n++;
    }
    poles.count = bulbs.count = n;
    poles.castShadow = true; poles.frustumCulled = false; bulbs.frustumCulled = false;
    scene.add(poles, bulbs);
    lampBulbs.push(bulbMat);
  }

  // ---------------------------------------------------------------------
  // Clouds
  // ---------------------------------------------------------------------
  const clouds = [];
  {
    const cloudTex = canvasTex(128, 128, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.85, fog: false });
    for (let i = 0; i < 26; i++) {
      const grp = new THREE.Group();
      const puffs = 5 + (rand() * 5 | 0);
      for (let k = 0; k < puffs; k++) {
        const sp = new THREE.Sprite(mat);
        const s = 40 + rand() * 50;
        sp.scale.set(s * 1.6, s, 1);
        sp.position.set((rand() - 0.5) * 90, (rand() - 0.5) * 12, (rand() - 0.5) * 40);
        grp.add(sp);
      }
      const a = rand() * Math.PI * 2, r = 150 + rand() * 900;
      grp.position.set(Math.cos(a) * r, 150 + rand() * 90, Math.sin(a) * r);
      grp.userData.speed = 3 + rand() * 4;
      scene.add(grp);
      clouds.push(grp);
    }
  }

  // ---------------------------------------------------------------------
  // Seagulls
  // ---------------------------------------------------------------------
  const gulls = [];
  {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.7, side: THREE.DoubleSide });
    const tipMat = new THREE.MeshStandardMaterial({ color: 0x333333, side: THREE.DoubleSide });
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, 0, 0, -0.25, 1.3, 0, -0.1, 0, 0, 0.25, 1.3, 0, -0.1, 1.3, 0, 0.12], 3));
    wingGeo.computeVertexNormals();
    const tipGeo = new THREE.BufferGeometry();
    tipGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, 0, 0, -0.1, 0.5, 0, -0.05], 3));
    tipGeo.computeVertexNormals();
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.6, 3, 6), bodyMat);
      body.rotation.x = Math.PI / 2; g.add(body);
      const wings = [];
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group();
        const w = new THREE.Mesh(wingGeo, bodyMat); w.scale.x = side;
        const t = new THREE.Mesh(tipGeo, tipMat); t.position.x = 1.3 * side; t.scale.x = side;
        pivot.add(w, t);
        pivot.userData.side = side;
        g.add(pivot); wings.push(pivot);
      }
      g.userData = {
        wings, cx: (rand() - 0.5) * 500, cz: (rand() - 0.5) * 500,
        radius: 30 + rand() * 60, h: 30 + rand() * 40, speed: (0.2 + rand() * 0.25) * (rand() < 0.5 ? -1 : 1),
        phase: rand() * 6.28, flap: 5 + rand() * 3
      };
      scene.add(g);
      gulls.push(g);
    }
  }

  // ---------------------------------------------------------------------
  // Update loop
  // ---------------------------------------------------------------------
  const sunOffset = sunDir.clone().multiplyScalar(250);
  const texel = 240 / 2048;
  function update(dt, elapsed, focus) {
    waterUniforms.uTime.value = elapsed;
    if (focus) {
      // snap to shadow texels to avoid shimmering
      const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
      sun.position.set(fx + sunOffset.x, focus.y + sunOffset.y, fz + sunOffset.z);
      sun.target.position.set(fx, focus.y, fz);
      sun.target.updateMatrixWorld();
    }
    if (beamPivot) beamPivot.rotation.y = elapsed * 0.9;
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 1200) c.position.x = -1200;
    }
    for (const g of gulls) {
      const u = g.userData;
      const a = u.phase + elapsed * u.speed;
      g.position.set(u.cx + Math.cos(a) * u.radius, u.h + Math.sin(elapsed * 0.5 + u.phase) * 4, u.cz + Math.sin(a) * u.radius);
      // tangent direction
      const tx = -Math.sin(a) * Math.sign(u.speed), tz = Math.cos(a) * Math.sign(u.speed);
      g.rotation.set(0, Math.atan2(tx, tz), -0.25 * Math.sign(u.speed));
      const flap = Math.sin(elapsed * u.flap + u.phase) * 0.6;
      for (const w of u.wings) w.rotation.z = flap * w.userData.side;
    }
    for (const f of updaters) f(dt, elapsed);
  }

  return {
    getHeightAt,
    getSurfaceAt,
    waterLevel: 0,
    worldSize: WORLD_SIZE,
    islandRadius: ISLAND_R,
    spawn,
    roadPath,
    roadWidth: ROAD_W,
    checkpoints,
    colliders,
    sun,
    update
  };
}
