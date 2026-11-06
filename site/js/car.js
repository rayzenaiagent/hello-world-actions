import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Saipa Pride 131 — procedural model + arcade physics
// Local space: car faces +Z, local +X = car's left side, Y up.
// Heading h: forward = (sin h, 0, cos h); right = (-cos h, 0, sin h).
// ---------------------------------------------------------------------------

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));

const WHEEL_R = 0.29;
const WHEEL_BASE = 2.3;
const TRACK = 1.36;
const HALF_WB = WHEEL_BASE / 2;
const HALF_TR = TRACK / 2;

const GEAR_TOP = [0, 38, 66, 98, 128, 158]; // km/h at ~6300 rpm per gear
const GEAR_ACC = [0, 4.6, 3.5, 2.6, 1.9, 1.35]; // m/s^2 at full throttle
const IDLE_RPM = 800, RED_RPM = 6500;
const MAX_KMH = 155, NITRO_KMH = 190, REV_KMH = 30;

const SURF = {
  road: { grip: 1.0, drag: 0.0, roll: 0.25 },
  grass: { grip: 0.75, drag: 1.3, roll: 0.6 },
  sand: { grip: 0.6, drag: 2.8, roll: 1.0 },
  rock: { grip: 0.85, drag: 0.6, roll: 0.45 },
  water: { grip: 0.35, drag: 7.0, roll: 2.0 }
};

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------
function makePlateTexture() {
  const c = document.createElement('canvas');
  c.width = 520; c.height = 116;
  const g = c.getContext('2d');
  // body
  g.fillStyle = '#fbfbf7';
  g.beginPath(); g.roundRect ? g.roundRect(2, 2, 516, 112, 10) : g.rect(2, 2, 516, 112); g.fill();
  g.lineWidth = 5; g.strokeStyle = '#111'; g.stroke();
  // blue strip (left)
  g.fillStyle = '#1d3f9a'; g.fillRect(6, 6, 70, 104);
  // flag
  g.fillStyle = '#239f40'; g.fillRect(16, 14, 50, 10);
  g.fillStyle = '#ffffff'; g.fillRect(16, 24, 50, 10);
  g.fillStyle = '#da0000'; g.fillRect(16, 34, 50, 10);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 17px Arial, sans-serif';
  g.fillText('I.R.', 41, 66);
  g.fillText('IRAN', 41, 90);
  // main number (Persian digits) : ۱۲ ب ۳۴۵
  g.fillStyle = '#111';
  g.font = 'bold 74px Vazirmatn, Tahoma, Arial, sans-serif';
  g.direction = 'ltr';
  g.fillText('۱۲', 128, 64);
  g.fillText('ب', 205, 60);
  g.fillText('۳۴۵', 312, 64);
  // province box
  g.lineWidth = 4; g.strokeStyle = '#111';
  g.beginPath(); g.moveTo(410, 6); g.lineTo(410, 110); g.stroke();
  g.font = 'bold 22px Vazirmatn, Tahoma, Arial, sans-serif';
  g.fillText('ایران', 462, 30);
  g.font = 'bold 54px Vazirmatn, Tahoma, Arial, sans-serif';
  g.fillText('۶۷', 462, 78);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeSoftTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function makeBadgeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = '#c9ccd1'; g.fillRect(0, 0, 128, 48);
  g.fillStyle = '#1b1b1b';
  g.font = 'bold 30px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('SAIPA', 64, 25);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
function extrudeProfile(points, width, mat, bevel = 0.035, holesFn) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.arc) s.absarc(p.arc[0], p.arc[1], p.arc[2], p.arc[3], p.arc[4], p.arc[5]);
    else s.lineTo(p[0], p[1]);
  }
  s.closePath();
  if (holesFn) holesFn(s);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel,
    bevelSegments: 3, curveSegments: 14
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  geo.rotateY(-Math.PI / 2); // shape x -> car z, extrusion -> car x
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  if (parent) parent.add(m);
  return m;
}

function buildModel() {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = new THREE.Group(); // suspension-tilted group
  body.position.y = 0;
  root.add(body);

  const paint = new THREE.MeshPhysicalMaterial({ color: 0xf3f3ef, roughness: 0.32, metalness: 0.05, clearcoat: 1.0, clearcoatRoughness: 0.08 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.75, metalness: 0.0 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.18, metalness: 1.0 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1d2a33, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.62, clearcoat: 1, depthWrite: true });
  const interiorMat = new THREE.MeshStandardMaterial({ color: 0x3b3833, roughness: 0.95 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 1 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xf4f7ff, emissive: 0xfff4d6, emissiveIntensity: 0.15, roughness: 0.1, metalness: 0.3 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8a0d0d, emissive: 0xff1a1a, emissiveIntensity: 0.25, roughness: 0.25 });
  const amberMat = new THREE.MeshStandardMaterial({ color: 0xd98a12, emissive: 0xff9a1a, emissiveIntensity: 0.15, roughness: 0.3 });
  const reverseMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.25 });

  // ---- lower body: hood, beltline, trunk, wheel arches ----
  const yb = 0.30; // body bottom
  const archR = 0.39;
  const fz = HALF_WB, rz = -HALF_WB, wy = WHEEL_R;
  const ay = Math.sqrt(Math.max(0, archR * archR - (yb - wy) * (yb - wy)));
  const lower = [
    [-1.93, yb],
    [rz - ay, yb],
    { arc: [rz, wy, archR, Math.PI - Math.asin((yb - wy) / archR), Math.asin((yb - wy) / archR), true] },
    [fz - ay, yb],
    { arc: [fz, wy, archR, Math.PI - Math.asin((yb - wy) / archR), Math.asin((yb - wy) / archR), true] },
    [1.92, yb],
    [1.96, 0.5],
    [1.95, 0.7],
    [1.88, 0.79],
    [0.86, 0.885],
    [-1.33, 0.93],
    [-1.86, 0.92],
    [-1.95, 0.84],
    [-1.97, 0.55]
  ];
  const lowerBody = extrudeProfile(lower, 1.62, paint, 0.05);
  body.add(lowerBody);

  // ---- greenhouse (glass) ----
  const green = [
    [0.86, 0.87],
    [0.16, 1.34],
    [-0.92, 1.35],
    [-1.33, 0.92]
  ];
  const cabin = extrudeProfile(green, 1.40, glass, 0.03);
  cabin.castShadow = true;
  body.add(cabin);

  // roof panel
  const roofShape = [
    [0.2, 1.31], [0.12, 1.385], [-0.9, 1.395], [-0.98, 1.32]
  ];
  body.add(extrudeProfile(roofShape, 1.42, paint, 0.03));

  // pillars (A, B, C) on both sides
  for (const sx of [-1, 1]) {
    const x = sx * 0.695;
    // A pillar along windshield edge
    const aLen = Math.hypot(0.86 - 0.16, 1.34 - 0.87);
    const aP = box(0.07, 0.07, aLen + 0.05, paint, x, (0.87 + 1.34) / 2, (0.86 + 0.16) / 2, body);
    aP.rotation.x = Math.atan2(1.34 - 0.87, 0.86 - 0.16);
    // B pillar
    box(0.07, 0.44, 0.1, plastic, x, 1.12, -0.36, body);
    // C pillar (wide)
    const cLen = Math.hypot(-0.92 + 1.33, 1.35 - 0.92);
    const cP = box(0.075, 0.08, cLen + 0.05, paint, x, (0.92 + 1.35) / 2, (-0.92 - 1.33) / 2, body);
    cP.rotation.x = -Math.atan2(1.35 - 0.92, -0.92 + 1.33);
    const cFill = box(0.075, 0.3, 0.22, paint, x, 1.06, -1.08, body);
    cFill.rotation.x = -0.35;
    // window rubber line at beltline
    box(0.03, 0.03, 2.15, rubber, sx * 0.71, 0.905, -0.24, body);
  }

  // ---- bumpers ----
  box(1.66, 0.2, 0.16, plastic, 0, 0.46, 1.97, body);
  box(1.66, 0.2, 0.16, plastic, 0, 0.5, -1.98, body);
  // bumper corners wrap
  for (const sx of [-1, 1]) {
    box(0.08, 0.2, 0.32, plastic, sx * 0.8, 0.46, 1.86, body);
    box(0.08, 0.2, 0.32, plastic, sx * 0.8, 0.5, -1.86, body);
  }
  // side rub strips
  for (const sx of [-1, 1]) box(0.03, 0.06, 2.4, plastic, sx * 0.815, 0.6, -0.1, body);

  // ---- front: grille, badge, headlights, indicators ----
  box(0.74, 0.15, 0.04, plastic, 0, 0.69, 1.955, body);
  for (let i = 0; i < 3; i++) box(0.7, 0.012, 0.045, chrome, 0, 0.645 + i * 0.045, 1.962, body);
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.055), new THREE.MeshStandardMaterial({ map: makeBadgeTexture(), metalness: 0.6, roughness: 0.3 }));
  badge.position.set(0, 0.69, 1.985); body.add(badge);
  const headlights = [];
  for (const sx of [-1, 1]) {
    const hl = box(0.36, 0.15, 0.04, headMat, sx * 0.57, 0.69, 1.955, body);
    headlights.push(hl);
    box(0.38, 0.17, 0.035, chrome, sx * 0.57, 0.69, 1.948, body);
    box(0.1, 0.15, 0.04, amberMat, sx * 0.79, 0.69, 1.935, body); // corner indicator
    box(0.03, 0.04, 0.09, amberMat, sx * 0.815, 0.68, 1.45, body); // side repeater
  }

  // ---- rear: taillights, trunk lip, reverse lights ----
  for (const sx of [-1, 1]) {
    box(0.34, 0.15, 0.04, tailMat, sx * 0.56, 0.8, -1.965, body);
    box(0.1, 0.15, 0.04, amberMat, sx * 0.78, 0.8, -1.955, body);
    box(0.08, 0.15, 0.04, reverseMat, sx * 0.36, 0.8, -1.966, body);
  }
  box(0.6, 0.12, 0.03, plastic, 0, 0.8, -1.965, body); // panel between lights
  // exhaust pipe
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 10), chrome);
  pipe.rotation.x = Math.PI / 2; pipe.position.set(0.48, 0.3, -1.95); body.add(pipe);

  // ---- plates ----
  const plateTex = makePlateTexture();
  const plateMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.5 });
  const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.116), plateMat);
  pf.position.set(0, 0.46, 2.055); body.add(pf);
  const pr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.116), plateMat);
  pr.position.set(0, 0.64, -1.99); pr.rotation.y = Math.PI; body.add(pr);

  // ---- mirrors, door lines, handles ----
  for (const sx of [-1, 1]) {
    const arm = box(0.12, 0.04, 0.06, plastic, sx * 0.8, 0.95, 0.72, body);
    arm.castShadow = false;
    box(0.06, 0.11, 0.15, plastic, sx * 0.88, 0.97, 0.7, body);
    // door cuts
    for (const z of [0.78, -0.38, -1.22]) box(0.012, 0.5, 0.012, rubber, sx * 0.812, 0.62, z, body);
    box(0.012, 0.012, 2.0, rubber, sx * 0.812, 0.37, -0.22, body);
    // handles
    box(0.02, 0.03, 0.12, plastic, sx * 0.818, 0.8, 0.52, body);
    box(0.02, 0.03, 0.12, plastic, sx * 0.818, 0.8, -0.62, body);
    // mud flaps
    box(0.18, 0.2, 0.02, rubber, sx * 0.68, 0.3, -HALF_WB - 0.4, body);
  }
  // fuel cap
  box(0.015, 0.1, 0.1, paint, -0.814, 0.78, -1.35, body);

  // ---- interior ----
  box(1.3, 0.2, 0.3, interiorMat, 0, 0.92, 0.62, body); // dashboard
  for (const sx of [-1, 1]) {
    box(0.48, 0.12, 0.5, seatMat, sx * 0.33, 0.6, -0.1, body);
    const back = box(0.48, 0.55, 0.12, seatMat, sx * 0.33, 0.88, -0.38, body);
    back.rotation.x = -0.15;
    box(0.26, 0.15, 0.1, seatMat, sx * 0.33, 1.2, -0.44, body);
  }
  box(1.3, 0.12, 0.5, seatMat, 0, 0.6, -0.95, body);
  box(1.3, 0.5, 0.12, seatMat, 0, 0.88, -1.18, body);
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 8, 20), plastic);
  sw.position.set(0.33, 0.95, 0.42); sw.rotation.x = -0.5; body.add(sw);

  // antenna
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.9, 5), plastic);
  ant.position.set(-0.74, 1.3, 1.05); ant.rotation.x = -0.25; body.add(ant);

  // under-body shadow plane (fake AO)
  const aoTex = makeSoftTexture();
  const ao = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.6), new THREE.MeshBasicMaterial({ map: aoTex, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
  ao.rotation.x = -Math.PI / 2; ao.position.y = 0.03;
  ao.renderOrder = 1;
  root.add(ao);

  // ---- wheels ----
  const tyreGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.19, 24, 1);
  tyreGeo.rotateZ(Math.PI / 2);
  const sideWallGeo = new THREE.TorusGeometry(WHEEL_R - 0.04, 0.045, 8, 24);
  sideWallGeo.rotateY(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.2, 18);
  rimGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.04, 16);
  hubGeo.rotateZ(Math.PI / 2);
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.35 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x202022, roughness: 0.5, metalness: 0.2 });
  const wheels = [];
  const defs = [
    { x: HALF_TR, z: HALF_WB, front: true }, { x: -HALF_TR, z: HALF_WB, front: true },
    { x: HALF_TR, z: -HALF_WB, front: false }, { x: -HALF_TR, z: -HALF_WB, front: false }
  ];
  for (const d of defs) {
    const pivot = new THREE.Group();
    pivot.position.set(d.x, WHEEL_R, d.z);
    const spin = new THREE.Group();
    pivot.add(spin);
    const tyre = new THREE.Mesh(tyreGeo, rubber); tyre.castShadow = true; spin.add(tyre);
    const sideOut = Math.sign(d.x);
    for (const s of [-1, 1]) { const swm = new THREE.Mesh(sideWallGeo, rubber); swm.position.x = s * 0.085; spin.add(swm); }
    const rim = new THREE.Mesh(rimGeo, steelMat); spin.add(rim);
    const hub = new THREE.Mesh(hubGeo, hubMat); hub.position.x = sideOut * 0.1; spin.add(hub);
    // lug-nut marks so spin is visible
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      const lug = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.03), chrome);
      lug.position.set(sideOut * 0.122, Math.cos(a) * 0.06, Math.sin(a) * 0.06);
      spin.add(lug);
    }
    root.add(pivot);
    wheels.push({ pivot, spin, front: d.front, x: d.x, z: d.z, susp: 0 });
  }

  // ---- headlight spotlights (always present; intensity toggled) ----
  const spots = [];
  for (const sx of [-1, 1]) {
    const sl = new THREE.SpotLight(0xfff2d8, 0, 70, 0.45, 0.55, 1.3);
    sl.castShadow = false;
    sl.position.set(sx * 0.57, 0.7, 2.0);
    sl.target.position.set(sx * 0.4, 0, 18);
    body.add(sl); body.add(sl.target);
    spots.push(sl);
  }

  // ---- nitro flame ----
  const flameGeo = new THREE.ConeGeometry(0.09, 0.8, 12, 1, true);
  flameGeo.translate(0, 0.4, 0);
  flameGeo.rotateX(-Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.set(0.48, 0.3, -2.05);
  flame.visible = false;
  const flameCore = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  flameCore.scale.set(0.45, 0.45, 0.55);
  flame.add(flameCore);
  body.add(flame);

  root.traverse(o => { if (o.isMesh && o !== ao && o.material !== flameMat && o.material !== glass) { o.castShadow = true; } });
  ao.castShadow = false; flame.castShadow = false; flameCore.castShadow = false; badge.castShadow = false;

  return { root, body, wheels, spots, headMat, tailMat, reverseMat, flame, flameMat };
}

// ---------------------------------------------------------------------------
// Particle pool (smoke / dust / splash / exhaust)
// ---------------------------------------------------------------------------
function createParticles(scene, count) {
  const tex = makeSoftTexture();
  const items = [];
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.visible = false;
    sp.renderOrder = 3;
    scene.add(sp);
    items.push({ sp, mat, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 0.5, s1: 2, a0: 0.5 });
  }
  let cursor = 0;
  return {
    emit(x, y, z, vx, vy, vz, color, life, s0, s1, a0) {
      const p = items[cursor];
      cursor = (cursor + 1) % count;
      p.sp.position.set(x, y, z);
      p.vx = vx; p.vy = vy; p.vz = vz;
      p.mat.color.setHex(color);
      p.life = 0; p.max = life; p.s0 = s0; p.s1 = s1; p.a0 = a0;
      p.sp.visible = true;
      p.sp.scale.setScalar(s0);
      p.mat.opacity = a0;
    },
    update(dt) {
      for (const p of items) {
        if (!p.sp.visible) continue;
        p.life += dt;
        const t = p.life / p.max;
        if (t >= 1) { p.sp.visible = false; continue; }
        p.sp.position.x += p.vx * dt;
        p.sp.position.y += p.vy * dt;
        p.sp.position.z += p.vz * dt;
        p.vx *= 1 - 1.8 * dt; p.vz *= 1 - 1.8 * dt; p.vy *= 1 - 0.8 * dt;
        p.sp.scale.setScalar(lerp(p.s0, p.s1, Math.sqrt(t)));
        p.mat.opacity = p.a0 * (1 - t) * Math.min(1, t * 8);
      }
    },
    clear() { for (const p of items) { p.sp.visible = false; } }
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------
export function createPride(scene) {
  const M = buildModel();
  const mesh = M.root;
  scene.add(mesh);
  const particles = createParticles(scene, 110);

  const vel = new THREE.Vector2(0, 0); // world-space horizontal velocity (x, z)
  const fwdV = new THREE.Vector3();
  let lastWorld = null;
  let steerAngle = 0, yawRate = 0, vy = 0, lastGroundY = 0, grounded = true;
  let rpmSmooth = IDLE_RPM, shiftTimer = 0, curGear = 1;
  let pitchVis = 0, rollVis = 0, suspPitch = 0, suspRoll = 0;
  let longAcc = 0, latAcc = 0;
  let exhaustTimer = 0, emitTimer = 0, lightsOn = false, nitroOn = false;
  let reversing = false;

  const car = {
    mesh,
    position: mesh.position,
    heading: 0,
    speed: 0,
    gear: 'N',
    rpm: IDLE_RPM,
    nitro: 1,
    skid: 0,
    lastImpact: 0,
    surface: 'road',
    inWater: false,
    braking: false,

    getSpeedKmh() { return this.speed * 3.6; },
    getForward() { return fwdV.set(Math.sin(this.heading), 0, Math.cos(this.heading)); },

    setHeadlights(on) {
      lightsOn = !!on;
      for (const s of M.spots) s.intensity = lightsOn ? 160 : 0;
      M.headMat.emissiveIntensity = lightsOn ? 3.0 : 0.15;
    },

    reset(spawn) {
      const sp = spawn || { x: 0, z: 0, heading: 0 };
      this.heading = sp.heading || 0;
      const y = lastWorld ? lastWorld.getHeightAt(sp.x, sp.z) : 2;
      mesh.position.set(sp.x, y, sp.z);
      vel.set(0, 0);
      this.speed = 0; this.nitro = 1; this.skid = 0; this.lastImpact = 0;
      this.inWater = false; this.braking = false; this.gear = 'N'; this.rpm = IDLE_RPM;
      steerAngle = 0; yawRate = 0; vy = 0; lastGroundY = y; grounded = true;
      rpmSmooth = IDLE_RPM; curGear = 1; reversing = false;
      pitchVis = rollVis = suspPitch = suspRoll = 0;
      mesh.rotation.set(0, this.heading, 0);
      M.body.rotation.set(0, 0, 0);
      particles.clear();
    },

    update(dt, input, world) {
      if (!(dt > 0)) return;
      const firstWorld = !lastWorld && world;
      lastWorld = world || lastWorld;
      if (firstWorld) { // snap to ground the first time we know the world
        const gy = world.getHeightAt(mesh.position.x, mesh.position.z);
        if (mesh.position.y < gy || mesh.position.y > gy + 3) mesh.position.y = gy;
        lastGroundY = gy;
      }
      const inp = input || {};
      const throttle = clamp(+inp.throttle || 0, 0, 1);
      const brake = clamp(+inp.brake || 0, 0, 1);
      const steerIn = clamp(+inp.steer || 0, -1, 1);
      const handbrake = !!inp.handbrake;
      const wantNitro = !!inp.nitro;
      this.lastImpact = 0;

      const pos = mesh.position;
      let h = this.heading;
      let fx = Math.sin(h), fz = Math.cos(h);
      let rx = -Math.cos(h), rz = Math.sin(h);

      // ---- surface ----
      const surface = world ? world.getSurfaceAt(pos.x, pos.z) : 'road';
      this.surface = surface;
      const S = SURF[surface] || SURF.grass;
      const groundHere = world ? world.getHeightAt(pos.x, pos.z) : 0;
      this.inWater = surface === 'water' && groundHere < -0.45;
      const grip = grounded ? S.grip : 0.05;

      let vF = vel.x * fx + vel.y * fz;
      let vR = vel.x * rx + vel.y * rz;
      const kmh = Math.abs(vF) * 3.6;

      // ---- gear / reverse logic ----
      if (vF < 0.6 && vF > -0.6 && brake > 0.2 && throttle < 0.1) reversing = true;
      if (throttle > 0.1 && vF > -0.6) reversing = false;

      // ---- nitro ----
      nitroOn = wantNitro && this.nitro > 0.01 && !reversing && throttle > 0.05 && grounded;
      if (nitroOn) this.nitro = Math.max(0, this.nitro - dt / 4);
      else this.nitro = Math.min(1, this.nitro + dt / 28);

      // ---- longitudinal forces ----
      let acc = 0;
      this.braking = false;
      if (!reversing) {
        // auto gearbox
        let target = 1;
        while (target < 5 && kmh > GEAR_TOP[target] * 0.93) target++;
        if (target !== curGear && shiftTimer <= 0) {
          if (target > curGear) { curGear++; shiftTimer = 0.28; }
          else if (kmh < GEAR_TOP[curGear - 1] * 0.78) { curGear--; shiftTimer = 0.15; }
        }
        shiftTimer -= dt;
        const torque = 0.78 + 0.22 * Math.sin(clamp(rpmSmooth / RED_RPM, 0, 1) * Math.PI);
        const gearAcc = GEAR_ACC[curGear] * torque * (shiftTimer > 0.1 ? 0.25 : 1);
        if (vF >= -0.6) acc += throttle * gearAcc * (0.55 + 0.45 * grip);
        if (nitroOn) acc += 5.5;
        if (vF > 0.3 && brake > 0) { acc -= brake * 10.5 * (0.45 + 0.55 * grip); this.braking = true; }
        if (vF < -0.6 && throttle > 0) { acc += throttle * 9; this.braking = true; }
      } else {
        curGear = 1;
        if (vF > -REV_KMH / 3.6) acc -= brake * 3.2 * (0.55 + 0.45 * grip);
        if (vF < -0.3 && throttle > 0) { acc += throttle * 10; this.braking = true; }
      }
      // engine braking / rolling / aero / surface drag
      const sgn = Math.sign(vF);
      let resist = S.roll * 0.4 + S.drag * Math.abs(vF) / 15 + 0.00072 * vF * vF;
      if (throttle < 0.05 && !reversing) resist += 0.8;
      if (handbrake) { resist += 3.5; this.braking = true; }
      if (!grounded) resist = 0.02 * vF * vF * 0.01;
      if (Math.abs(vF) > 0.05) {
        const dv = resist * dt;
        vF = Math.abs(vF) <= dv && Math.abs(acc) < 0.01 ? 0 : vF - sgn * dv;
      }
      if (grounded) vF += acc * dt;
      // speed caps
      const cap = (nitroOn ? NITRO_KMH : MAX_KMH) / 3.6;
      if (vF > cap) vF = damp(vF, cap, 3, dt);
      if (vF < -REV_KMH / 3.6) vF = -REV_KMH / 3.6;
      if (this.inWater) { vF = clamp(vF, -2.5, 3.5); vR *= 0.9; }
      if (!reversing && throttle < 0.05 && brake > 0 && Math.abs(vF) < 0.3) vF = 0;

      // ---- steering ----
      const spd = Math.abs(vF);
      const maxSteer = lerp(0.62, 0.11, clamp(spd / 42, 0, 1));
      const steerTarget = steerIn * maxSteer;
      steerAngle = damp(steerAngle, steerTarget, Math.abs(steerTarget) > Math.abs(steerAngle) ? 9 : 12, dt);

      // ---- yaw ----
      let yawTarget = grounded ? -(vF / WHEEL_BASE) * Math.tan(steerAngle) : yawRate * 0.98;
      if (handbrake && spd > 4) yawTarget *= 1.55;
      yawRate = damp(yawRate, yawTarget, grounded ? 8 * (0.6 + 0.4 * grip) : 1, dt);
      h += yawRate * dt;
      this.heading = h;
      const nfx = Math.sin(h), nfz = Math.cos(h);
      const nrx = -Math.cos(h), nrz = Math.sin(h);
      // re-project world velocity onto rotated axes
      const wx = fx * vF + rx * vR, wz = fz * vF + rz * vR;
      vF = wx * nfx + wz * nfz;
      vR = wx * nrx + wz * nrz;
      fx = nfx; fz = nfz; rx = nrx; rz = nrz;

      // ---- lateral friction (allows drifting) ----
      let latGrip = 15 * grip;
      if (handbrake) latGrip *= 0.22;
      if (!grounded) latGrip = 0.3;
      const prevVR = vR;
      const dvR = Math.min(Math.abs(vR), latGrip * dt);
      vR -= Math.sign(vR) * dvR;
      // part of lateral momentum converts into forward when drifting (feels nicer)
      if (handbrake) vF -= Math.sign(vF) * Math.abs(prevVR - vR) * 0.15;
      latAcc = damp(latAcc, vF * yawRate, 6, dt);

      // ---- skid amount ----
      let skid = clamp((Math.abs(vR) - 1.2) / 5, 0, 1);
      if (handbrake && spd > 3) skid = Math.max(skid, clamp(spd / 18, 0.35, 1));
      if (this.braking && spd > 12 && brake > 0.8 && surface === 'road') skid = Math.max(skid, 0.35);
      if (!reversing && throttle > 0.9 && kmh < 18 && curGear === 1 && surface === 'road') skid = Math.max(skid, 0.45);
      if (!grounded || this.inWater) skid = 0;
      this.skid = damp(this.skid, skid, 10, dt);

      // ---- integrate position ----
      vel.set(fx * vF + rx * vR, fz * vF + rz * vR);
      pos.x += vel.x * dt;
      pos.z += vel.y * dt;

      // ---- collisions ----
      if (world && world.colliders) {
        const cols = world.colliders;
        for (let c = 0; c < 2; c++) {
          const off = c === 0 ? 1.05 : -1.05;
          const R = 0.92;
          for (let i = 0; i < cols.length; i++) {
            const o = cols[i];
            const cx = pos.x + fx * off, cz = pos.z + fz * off;
            const dx = cx - o.x, dz = cz - o.z;
            const minD = o.r + R;
            if (Math.abs(dx) > minD || Math.abs(dz) > minD) continue;
            const d2 = dx * dx + dz * dz;
            if (d2 >= minD * minD) continue;
            const d = Math.sqrt(d2) || 0.001;
            const nx = dx / d, nz = dz / d;
            const pen = minD - d;
            pos.x += nx * pen; pos.z += nz * pen;
            const vn = vel.x * nx + vel.y * nz;
            if (vn < 0) {
              vel.x -= nx * vn * 1.35; vel.y -= nz * vn * 1.35;
              vel.multiplyScalar(0.82);
              this.lastImpact = Math.max(this.lastImpact, clamp(-vn / 18, 0, 1));
            }
          }
        }
        // re-derive components after collision response
        vF = vel.x * fx + vel.y * fz;
        vR = vel.x * rx + vel.y * rz;
      }
      // world bounds
      const lim = (world && world.worldSize ? world.worldSize / 2 : 600) - 8;
      if (pos.x > lim) { pos.x = lim; vel.x = Math.min(vel.x, 0); }
      if (pos.x < -lim) { pos.x = -lim; vel.x = Math.max(vel.x, 0); }
      if (pos.z > lim) { pos.z = lim; vel.y = Math.min(vel.y, 0); }
      if (pos.z < -lim) { pos.z = -lim; vel.y = Math.max(vel.y, 0); }
      vF = vel.x * fx + vel.y * fz;
      this.speed = vF;

      // ---- terrain following / airtime ----
      const lx = -rx, lz = -rz; // local +X (left) in world
      let hFL = 0, hFR = 0, hRL = 0, hRR = 0;
      if (world) {
        hFL = world.getHeightAt(pos.x + fx * HALF_WB + lx * HALF_TR, pos.z + fz * HALF_WB + lz * HALF_TR);
        hFR = world.getHeightAt(pos.x + fx * HALF_WB - lx * HALF_TR, pos.z + fz * HALF_WB - lz * HALF_TR);
        hRL = world.getHeightAt(pos.x - fx * HALF_WB + lx * HALF_TR, pos.z - fz * HALF_WB + lz * HALF_TR);
        hRR = world.getHeightAt(pos.x - fx * HALF_WB - lx * HALF_TR, pos.z - fz * HALF_WB - lz * HALF_TR);
      }
      // in deep water the little Pride half-floats instead of sinking to the seabed
      const groundY = Math.max((hFL + hFR + hRL + hRR) / 4, -0.75);
      const groundVel = clamp((groundY - lastGroundY) / dt, -30, 30);
      lastGroundY = groundY;
      vy -= 22 * dt;
      pos.y += vy * dt;
      if (pos.y <= groundY) {
        if (!grounded && vy < -7) this.lastImpact = Math.max(this.lastImpact, clamp((-vy - 7) / 14, 0, 0.8));
        pos.y = groundY;
        vy = clamp(groundVel, -25, 8.5);
        grounded = true;
      } else {
        grounded = pos.y - groundY < 0.08;
      }

      const terrPitch = -Math.atan2((hFL + hFR) / 2 - (hRL + hRR) / 2, WHEEL_BASE);
      const terrRoll = Math.atan2((hFL + hRL) / 2 - (hFR + hRR) / 2, TRACK);
      if (grounded) {
        pitchVis = damp(pitchVis, terrPitch, 14, dt);
        rollVis = damp(rollVis, terrRoll, 14, dt);
      } else {
        pitchVis = damp(pitchVis, pitchVis + 0.15 * dt, 2, dt); // slight nose drop in air
      }
      mesh.rotation.set(pitchVis, h, rollVis, 'YXZ');

      // suspension visual on body
      longAcc = damp(longAcc, grounded ? acc - (this.braking ? 4 : 0) : 0, 6, dt);
      suspPitch = damp(suspPitch, clamp(-longAcc * 0.009, -0.06, 0.06), 8, dt);
      suspRoll = damp(suspRoll, clamp(latAcc * 0.0065, -0.07, 0.07), 7, dt);
      M.body.rotation.set(suspPitch, 0, suspRoll);
      M.body.position.y = Math.abs(suspPitch) * 0.3;

      // ---- wheels ----
      const spin = (vF / WHEEL_R) * dt;
      const rearSpin = (skid > 0.4 && throttle > 0.9 && kmh < 18) ? spin + 0.6 : spin;
      for (const w of M.wheels) {
        w.spin.rotation.x += w.front ? spin : (handbrake && spd > 2 ? 0 : rearSpin);
        if (w.front) w.pivot.rotation.y = -steerAngle;
      }

      // ---- rpm / gear display ----
      let rpmTarget;
      if (reversing) rpmTarget = IDLE_RPM + (kmh / REV_KMH) * 4200 + brake * 400;
      else if (kmh < 6 && curGear === 1) rpmTarget = IDLE_RPM + throttle * 3200 + kmh * 150;
      else rpmTarget = clamp(kmh / GEAR_TOP[curGear] * 6300, 1100, 6900) + throttle * 250;
      if (!grounded) rpmTarget = clamp(rpmTarget + throttle * 1500, IDLE_RPM, 6900);
      if (this.skid > 0.5 && throttle > 0.5) rpmTarget += 600;
      rpmSmooth = damp(rpmSmooth, clamp(rpmTarget, IDLE_RPM, 7000), shiftTimer > 0 ? 18 : 9, dt);
      this.rpm = rpmSmooth;
      if (reversing && (vF < -0.2 || brake > 0.2)) this.gear = 'R';
      else if (kmh < 0.8 && throttle < 0.05) this.gear = 'N';
      else this.gear = curGear;

      // ---- lights ----
      M.tailMat.emissiveIntensity = this.braking ? 2.6 : (lightsOn ? 0.9 : 0.25);
      M.reverseMat.emissiveIntensity = this.gear === 'R' ? 1.6 : 0;

      // ---- nitro flame ----
      M.flame.visible = nitroOn;
      if (nitroOn) {
        const f = 0.8 + Math.random() * 0.5;
        M.flame.scale.set(f, f, 0.8 + Math.random() * 0.9);
        M.flameMat.opacity = 0.6 + Math.random() * 0.35;
      }

      // ---- particles ----
      emitTimer += dt;
      exhaustTimer += dt;
      if (emitTimer > 0.03) {
        emitTimer = 0;
        const rearX = pos.x - fx * HALF_WB, rearZ = pos.z - fz * HALF_WB;
        const sideVX = vel.x * 0.15, sideVZ = vel.y * 0.15;
        if (this.skid > 0.3 && surface === 'road') {
          for (const s of [-1, 1]) {
            particles.emit(rearX + lx * HALF_TR * s + (Math.random() - 0.5) * 0.3, pos.y + 0.25, rearZ + lz * HALF_TR * s + (Math.random() - 0.5) * 0.3,
              sideVX + (Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 0.6, sideVZ + (Math.random() - 0.5) * 1.2,
              0xdedede, 1.6 + Math.random() * 0.8, 0.6, 3.6, 0.42 * this.skid + 0.1);
          }
        } else if ((surface === 'sand' || surface === 'grass' || surface === 'rock') && spd > 6 && grounded) {
          const col = surface === 'sand' ? 0xe3cf9a : surface === 'grass' ? 0x9c8a5a : 0xa89a88;
          const a = clamp(spd / 30, 0.15, 0.5) * (surface === 'grass' ? 0.6 : 1);
          for (const s of [-1, 1]) {
            particles.emit(rearX + lx * HALF_TR * s, pos.y + 0.2, rearZ + lz * HALF_TR * s,
              sideVX + (Math.random() - 0.5) * 2, 0.6 + Math.random() * 0.8, sideVZ + (Math.random() - 0.5) * 2,
              col, 1.2 + Math.random() * 0.6, 0.5, 3.0, a);
          }
        }
        if (this.inWater && spd > 0.6) {
          for (let k = 0; k < 2; k++) {
            particles.emit(pos.x + fx * 1.9 + (Math.random() - 0.5) * 1.6, 0.2, pos.z + fz * 1.9 + (Math.random() - 0.5) * 1.6,
              (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3,
              0xeaf6ff, 0.7, 0.4, 1.8, 0.75);
          }
        }
        if (nitroOn) {
          const ex = pos.x - fx * 2.15 - lx * 0.48 * -1, ez = pos.z - fz * 2.15 - lz * 0.48 * -1;
          particles.emit(ex, pos.y + 0.3, ez, -fx * 3, 0.3, -fz * 3, 0x7cc4ff, 0.35, 0.3, 0.9, 0.55);
        }
      }
      if (exhaustTimer > (throttle > 0.5 ? 0.09 : 0.35) && spd < 8 && !this.inWater) {
        exhaustTimer = 0;
        // exhaust pipe is on local +X (0.48) side at rear
        const ex = pos.x - fx * 2.05 + lx * 0.48, ez = pos.z - fz * 2.05 + lz * 0.48;
        particles.emit(ex, pos.y + 0.3, ez, -fx * 0.8 + (Math.random() - 0.5) * 0.3, 0.35, -fz * 0.8 + (Math.random() - 0.5) * 0.3,
          0x9a9a9a, 1.1, 0.18, 0.9, throttle > 0.5 ? 0.3 : 0.16);
      }
      particles.update(dt);
    }
  };

  car.reset({ x: 0, z: 0, heading: 0 });
  return car;
}
