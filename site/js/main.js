import * as THREE from 'three';
import { createWorld } from './world.js';
import { createPride } from './car.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------
const TOTAL_LAPS = 3;
const CHECKPOINT_RADIUS = 14;
const WATER_RESET_TIME = 2.5;
const BEST_KEY = 'prideIslandBest';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const loadingEl = document.getElementById('loading');
const appEl = document.getElementById('app');

function showLoadingError(err) {
  console.error(err);
  if (!loadingEl) return;
  loadingEl.classList.remove('hidden');
  loadingEl.style.display = '';
  loadingEl.style.opacity = '1';
  const spinner = loadingEl.querySelector('.loading-spinner');
  if (spinner) spinner.style.display = 'none';
  const text = loadingEl.querySelector('.loading-text');
  if (text) {
    text.style.direction = 'rtl';
    text.style.maxWidth = '90vw';
    text.style.whiteSpace = 'pre-wrap';
    text.textContent = 'خطا در بارگذاری بازی\nError: ' + (err && err.message ? err.message : String(err));
  }
}

function hideLoading() {
  if (!loadingEl) return;
  loadingEl.classList.add('hidden');
  loadingEl.style.transition = 'opacity 0.6s ease';
  loadingEl.style.opacity = '0';
  setTimeout(() => { loadingEl.style.display = 'none'; }, 700);
}

function loadBest() {
  try {
    const v = parseFloat(localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch (e) { return null; }
}
function saveBest(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Checkpoint gates
// ---------------------------------------------------------------------------
function makeCheckerTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  const s = 32;
  for (let y = 0; y < c.height / s; y++) {
    for (let x = 0; x < c.width / s; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#111111';
      g.fillRect(x * s, y * s, s, s);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeNumberTexture(label, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 6;
  g.strokeRect(6, 6, 244, 116);
  g.fillStyle = '#ffffff';
  g.font = 'bold 84px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 128, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function createGates(scene, world) {
  const gates = [];
  const checkerTex = makeCheckerTexture();
  const halfW = (world.roadWidth || 10) * 0.5 + 1.2;
  const postH = 7;

  world.checkpoints.forEach((cp, i) => {
    const isStart = i === 0;
    const group = new THREE.Group();
    const baseColor = isStart ? new THREE.Color(0xffffff) : new THREE.Color(0x35e0ff);

    const postMat = new THREE.MeshStandardMaterial({
      color: baseColor, emissive: baseColor.clone(), emissiveIntensity: 0.3,
      roughness: 0.4, metalness: 0.2, transparent: true, opacity: 0.85
    });
    const postGeo = new THREE.CylinderGeometry(0.35, 0.45, postH, 10);
    const left = new THREE.Mesh(postGeo, postMat);
    const right = new THREE.Mesh(postGeo, postMat);
    left.position.set(-halfW, postH / 2, 0);
    right.position.set(halfW, postH / 2, 0);
    left.castShadow = right.castShadow = true;
    group.add(left, right);

    // top banner
    const bannerMat = isStart
      ? new THREE.MeshStandardMaterial({ map: checkerTex, emissive: 0xffffff, emissiveMap: checkerTex, emissiveIntensity: 0.25, side: THREE.DoubleSide, roughness: 0.6 })
      : new THREE.MeshStandardMaterial({
          map: makeNumberTexture(String(i), '#0b86a8'), emissive: 0x35e0ff, emissiveIntensity: 0.35,
          side: THREE.DoubleSide, roughness: 0.6, transparent: true, opacity: 0.92
        });
    const banner = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 0.9, 1.6, 0.25), bannerMat);
    banner.position.set(0, postH + 0.2, 0);
    banner.castShadow = true;
    group.add(banner);

    // translucent energy curtain
    const curtainMat = new THREE.MeshBasicMaterial({
      color: baseColor, transparent: true, opacity: 0.1, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, postH - 0.6), curtainMat);
    curtain.position.set(0, (postH - 0.6) / 2 + 0.1, 0);
    group.add(curtain);

    // ground ring glow
    const ringMat = new THREE.MeshBasicMaterial({
      color: baseColor, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(CHECKPOINT_RADIUS - 1.2, CHECKPOINT_RADIUS, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    ring.visible = false;
    group.add(ring);

    const y = world.getHeightAt(cp.x, cp.z);
    group.position.set(cp.x, y, cp.z);
    group.rotation.y = cp.heading || 0;
    scene.add(group);

    gates.push({ group, postMat, bannerMat, curtainMat, ringMat, ring, isStart, baseColor, y });
  });

  // floating arrow + beam above the next checkpoint
  const marker = new THREE.Group();
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.95 });
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.2, 4), arrowMat);
  arrow.rotation.x = Math.PI; // point down
  arrow.position.y = 0;
  marker.add(arrow);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe14a, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 120, 12, 1, true), beamMat);
  beam.position.y = -60 - 2;
  marker.add(beam);
  scene.add(marker);

  function setNext(index, elapsed) {
    gates.forEach((gt, i) => {
      const active = i === index;
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 6);
      gt.postMat.emissiveIntensity = active ? 0.9 + pulse * 0.9 : 0.12;
      gt.postMat.opacity = active ? 0.95 : 0.55;
      gt.curtainMat.opacity = active ? 0.2 + pulse * 0.2 : 0.035;
      gt.ringMat.opacity = active ? 0.35 + pulse * 0.35 : 0;
      gt.ring.visible = active;
      if (gt.bannerMat.emissiveIntensity !== undefined) {
        gt.bannerMat.emissiveIntensity = active ? 0.6 + pulse * 0.6 : 0.1;
      }
    });
    const cp = world.checkpoints[index];
    if (cp) {
      const y = gates[index].y;
      marker.visible = true;
      marker.position.set(cp.x, y + 13 + Math.sin(elapsed * 3) * 0.8, cp.z);
      arrow.rotation.y = elapsed * 2;
    } else {
      marker.visible = false;
    }
  }

  return { gates, setNext };
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
function createInput(handlers) {
  const keys = new Set();
  let steerKb = 0;

  const prevent = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);

  window.addEventListener('keydown', (e) => {
    if (prevent.has(e.code)) e.preventDefault();
    if (e.repeat) { keys.add(e.code); return; }
    keys.add(e.code);
    switch (e.code) {
      case 'KeyC': handlers.onCamera && handlers.onCamera(); break;
      case 'KeyR': handlers.onReset && handlers.onReset(); break;
      case 'KeyL': handlers.onLights && handlers.onLights(); break;
      case 'KeyM': handlers.onMute && handlers.onMute(); break;
      case 'KeyH': handlers.onHorn && handlers.onHorn(true); break;
      case 'KeyP':
      case 'Escape': handlers.onPause && handlers.onPause(); break;
      default: break;
    }
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'KeyH') handlers.onHorn && handlers.onHorn(false);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    handlers.onHorn && handlers.onHorn(false);
  });

  const down = (...codes) => codes.some((c) => keys.has(c));

  function read(dt, touch) {
    const t = touch || {};
    const kbThrottle = down('KeyW', 'ArrowUp') ? 1 : 0;
    const kbBrake = down('KeyS', 'ArrowDown') ? 1 : 0;
    const target = (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0);

    // smooth keyboard steering: ramp toward target, faster return to center
    const returning = target === 0 || Math.sign(target) !== Math.sign(steerKb);
    const rate = target === 0 ? 7 : (returning ? 9 : 3.6);
    const delta = target - steerKb;
    const step = rate * dt;
    steerKb += clamp(delta, -step, step);

    const steer = clamp(steerKb + (t.steer || 0), -1, 1);
    return {
      throttle: clamp(Math.max(kbThrottle, t.throttle || 0), 0, 1),
      brake: clamp(Math.max(kbBrake, t.brake || 0), 0, 1),
      steer,
      handbrake: down('Space') || !!t.handbrake,
      nitro: down('ShiftLeft', 'ShiftRight') || !!t.nitro
    };
  }

  function any() { return keys.size > 0; }
  return { read, any, keys };
}

// ---------------------------------------------------------------------------
// Camera rig
// ---------------------------------------------------------------------------
const CAM_MODES = ['chase', 'far', 'hood', 'side'];

function createCameraRig(camera, world) {
  const rig = {
    mode: 0,
    snap: true,
    heading: 0,
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    fov: 65,
    shake: 0,
    sideSign: 1,
    tmpA: new THREE.Vector3(),
    tmpB: new THREE.Vector3(),
    tmpC: new THREE.Vector3()
  };

  function groundY(x, z) {
    const h = world.getHeightAt(x, z);
    return Math.max(h, 0) + 1.5;
  }

  rig.cycle = function () {
    rig.mode = (rig.mode + 1) % CAM_MODES.length;
    rig.snap = true;
    rig.sideSign = Math.random() < 0.5 ? 1 : -1;
    return CAM_MODES[rig.mode];
  };

  rig.addShake = function (amount) {
    rig.shake = Math.min(1.2, rig.shake + amount);
  };

  rig.updateMenu = function (dt, elapsed, car) {
    const cx = car.position.x, cz = car.position.z;
    const a = elapsed * 0.16 + 0.8;
    const radius = 30 + Math.sin(elapsed * 0.11) * 8;
    const px = cx + Math.sin(a) * radius;
    const pz = cz + Math.cos(a) * radius;
    const py = Math.max(car.position.y, world.getHeightAt(px, pz)) + 7 + Math.sin(elapsed * 0.2) * 2.5;
    camera.position.set(px, Math.max(py, groundY(px, pz)), pz);
    rig.look.set(cx, car.position.y + 1.1, cz);
    camera.lookAt(rig.look);
    rig.fov = damp(rig.fov, 55, 3, dt);
    if (Math.abs(camera.fov - rig.fov) > 0.01) {
      camera.fov = rig.fov;
      camera.updateProjectionMatrix();
    }
    rig.snap = true;
  };

  rig.update = function (dt, elapsed, car, nitroActive) {
    const speedKmh = Math.abs(car.getSpeedKmh ? car.getSpeedKmh() : (car.speed || 0) * 3.6);
    const speedN = clamp(speedKmh / 160, 0, 1);
    const carH = car.heading || 0;
    const px = car.position.x, py = car.position.y, pz = car.position.z;

    // lagging heading (gives a bit of "swing" in turns)
    if (rig.snap) rig.heading = carH;
    else rig.heading += angleDiff(rig.heading, carH) * (1 - Math.exp(-(rig.mode === 1 ? 2.6 : 3.4) * dt));

    const ch = rig.heading;
    const fx = Math.sin(ch), fz = Math.cos(ch);
    const cfx = Math.sin(carH), cfz = Math.cos(carH);
    const desired = rig.tmpA;
    const lookT = rig.tmpB;
    let posLambda = 9;
    let lookLambda = 10;
    let baseFov = 65;

    switch (rig.mode) {
      case 0: { // chase
        const dist = 6.4 + speedN * 1.6;
        const h = 2.5 + speedN * 0.5;
        desired.set(px - fx * dist, py + h, pz - fz * dist);
        const ahead = 5 + speedN * 8;
        lookT.set(px + cfx * ahead, py + 1.2, pz + cfz * ahead);
        baseFov = 65;
        break;
      }
      case 1: { // far chase
        const dist = 13 + speedN * 4;
        const h = 6 + speedN * 1.5;
        desired.set(px - fx * dist, py + h, pz - fz * dist);
        const ahead = 8 + speedN * 10;
        lookT.set(px + cfx * ahead, py + 1.0, pz + cfz * ahead);
        posLambda = 6;
        baseFov = 62;
        break;
      }
      case 2: { // hood / bumper
        desired.set(px + cfx * 0.9, py + 1.12, pz + cfz * 0.9);
        lookT.set(px + cfx * 30, py + 1.0, pz + cfz * 30);
        posLambda = 60;
        lookLambda = 14;
        baseFov = 74;
        break;
      }
      default: { // cinematic side
        const rx = Math.cos(carH) * rig.sideSign;
        const rz = -Math.sin(carH) * rig.sideSign;
        const lead = 4 + speedN * 6;
        desired.set(px + rx * 11 + cfx * lead, py + 2.6, pz + rz * 11 + cfz * lead);
        lookT.set(px + cfx * 1.5, py + 1.0, pz + cfz * 1.5);
        posLambda = 4.5;
        lookLambda = 7;
        baseFov = 55;
        break;
      }
    }

    // keep above terrain
    desired.y = Math.max(desired.y, groundY(desired.x, desired.z));

    if (rig.snap) {
      rig.pos.copy(desired);
      rig.look.copy(lookT);
      rig.fov = baseFov;
      rig.snap = false;
    } else {
      const kp = 1 - Math.exp(-posLambda * dt);
      const kl = 1 - Math.exp(-lookLambda * dt);
      rig.pos.lerp(desired, kp);
      rig.look.lerp(lookT, kl);
    }
    // never let the smoothed position sink under the ground
    rig.pos.y = Math.max(rig.pos.y, groundY(rig.pos.x, rig.pos.z));

    // FOV widening
    const targetFov = baseFov + speedN * 16 + (nitroActive ? 9 : 0);
    rig.fov = damp(rig.fov, targetFov, 4, dt);

    // shake
    rig.shake = Math.max(0, rig.shake - dt * 2.2);
    let shakeAmt = rig.shake * 0.5;
    if (nitroActive) shakeAmt += 0.035;
    shakeAmt += speedN * 0.006;
    if (rig.mode === 2) shakeAmt *= 0.6;

    camera.position.copy(rig.pos);
    camera.lookAt(rig.look);
    if (shakeAmt > 0.0005) {
      camera.position.x += (Math.random() - 0.5) * shakeAmt;
      camera.position.y += (Math.random() - 0.5) * shakeAmt;
      camera.position.z += (Math.random() - 0.5) * shakeAmt;
      camera.rotation.z += (Math.random() - 0.5) * shakeAmt * 0.05;
    }
    if (Math.abs(camera.fov - rig.fov) > 0.01) {
      camera.fov = rig.fov;
      camera.updateProjectionMatrix();
    }
  };

  return rig;
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------
function startGame() {
  // Renderer ---------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  appEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 3000);
  camera.position.set(0, 20, 0);
  scene.add(camera);

  // Modules ----------------------------------------------------------------
  const world = createWorld(scene, renderer);
  const car = createPride(scene);
  car.reset(world.spawn);
  const audio = createAudio();

  let game; // forward reference for UI callbacks
  const ui = createUI({
    onStart: () => game.beginRace(),
    onResume: () => game.setPaused(false),
    onRestart: () => game.beginRace(),
    onCameraToggle: () => game.cycleCamera(),
    onReset: () => game.resetToRoad(false),
    onMuteToggle: () => game.toggleMute()
  });

  ui.setMap({
    worldSize: world.worldSize,
    sampler: world.getSurfaceAt,
    roadPath: world.roadPath,
    checkpoints: world.checkpoints
  });

  const gates = createGates(scene, world);
  const rig = createCameraRig(camera, world);

  // State ------------------------------------------------------------------
  const cpCount = world.checkpoints.length;
  const S = {
    phase: 'menu', // menu | countdown | racing | finished
    paused: false,
    userMuted: false,
    lights: false,
    lap: 1,
    nextCp: 1 % Math.max(1, cpCount),
    lapTime: 0,
    totalTime: 0,
    bestLap: loadBest(),
    countdown: 0,
    countdownStep: -1,
    waterTime: 0,
    elapsed: 0,
    horn: false,
    kbHornHeld: false
  };

  const input = createInput({
    onCamera: () => game.cycleCamera(),
    onReset: () => game.resetToRoad(false),
    onLights: () => {
      S.lights = !S.lights;
      if (car.setHeadlights) car.setHeadlights(S.lights);
    },
    onMute: () => game.toggleMute(),
    onHorn: (on) => {
      S.horn = on && !S.paused;
      if (audio.setHorn) audio.setHorn(S.horn);
    },
    onPause: () => {
      if (S.phase === 'countdown' || S.phase === 'racing') game.setPaused(!S.paused);
    }
  });

  const idleInput = { throttle: 0, brake: 1, steer: 0, handbrake: true, nitro: false };
  const tmpV = new THREE.Vector3();

  game = {
    cycleCamera() { rig.cycle(); },

    toggleMute() {
      S.userMuted = !S.userMuted;
      if (audio.setMuted) audio.setMuted(S.userMuted || S.paused);
    },

    setPaused(p) {
      if (p === S.paused) return;
      if (p && !(S.phase === 'countdown' || S.phase === 'racing')) return;
      S.paused = p;
      if (p && S.horn) { S.horn = false; if (audio.setHorn) audio.setHorn(false); }
      if (audio.setMuted) audio.setMuted(S.userMuted || p);
      if (ui.showPause) ui.showPause(p);
      lastTime = performance.now();
    },

    resetToRoad(auto) {
      const path = world.roadPath;
      if (!path || path.length < 2) { car.reset(world.spawn); rig.snap = true; return; }
      const cx = car.position.x, cz = car.position.z;
      let best = 0, bestD = Infinity;
      for (let i = 0; i < path.length; i++) {
        const dx = path[i].x - cx, dz = path[i].z - cz;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
      const a = path[best];
      const b = path[(best + 2) % path.length];
      const heading = Math.atan2(b.x - a.x, b.z - a.z);
      car.reset({ x: a.x, z: a.z, heading });
      rig.snap = true;
      S.waterTime = 0;
      if (auto && ui.showMessage) ui.showMessage('برگشت به جاده', 1.6);
    },

    beginRace() {
      if (audio.start) audio.start();
      if (audio.setMuted) audio.setMuted(S.userMuted);
      S.paused = false;
      if (ui.hideMenus) ui.hideMenus();
      car.reset(world.spawn);
      rig.snap = true;
      S.phase = 'countdown';
      S.lap = 1;
      S.nextCp = cpCount > 1 ? 1 : 0;
      S.lapTime = 0;
      S.totalTime = 0;
      S.countdown = 0;
      S.countdownStep = -1;
      S.waterTime = 0;
      S.bestLap = loadBest();
    },

    finishRace() {
      S.phase = 'finished';
      if (ui.showFinish) ui.showFinish({ totalTime: S.totalTime, bestLap: S.bestLap });
    }
  };

  // Race logic --------------------------------------------------------------
  function updateRace(dt) {
    if (S.phase === 'countdown') {
      const prev = S.countdownStep;
      S.countdown += dt;
      const step = Math.floor(S.countdown);
      if (step !== prev && step <= 3) {
        S.countdownStep = step;
        const labels = ['3', '2', '1', 'برو!'];
        if (ui.showMessage) ui.showMessage(labels[step], step === 3 ? 1.0 : 0.9);
      }
      if (S.countdown >= 3) {
        S.phase = 'racing';
        S.lapTime = 0;
        S.totalTime = 0;
      }
      return;
    }
    if (S.phase !== 'racing') return;

    S.lapTime += dt;
    S.totalTime += dt;

    const cp = world.checkpoints[S.nextCp];
    if (!cp) return;
    const dx = car.position.x - cp.x;
    const dz = car.position.z - cp.z;
    if (dx * dx + dz * dz > CHECKPOINT_RADIUS * CHECKPOINT_RADIUS) return;

    if (S.nextCp === 0) {
      // lap complete
      const lapTime = S.lapTime;
      if (S.bestLap === null || lapTime < S.bestLap) {
        S.bestLap = lapTime;
        saveBest(lapTime);
      }
      if (audio.playLap) audio.playLap();
      if (S.lap >= TOTAL_LAPS) {
        game.finishRace();
        return;
      }
      S.lap += 1;
      S.lapTime = 0;
      S.nextCp = cpCount > 1 ? 1 : 0;
      if (ui.showMessage) {
        ui.showMessage(S.lap === TOTAL_LAPS ? 'دور آخر!' : 'دور ' + S.lap, 2);
      }
    } else {
      if (audio.playCheckpoint) audio.playCheckpoint();
      if (ui.showMessage) ui.showMessage('چک‌پوینت!', 1);
      S.nextCp = (S.nextCp + 1) % cpCount;
    }
  }

  // Resize / visibility ------------------------------------------------------
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (S.phase === 'racing' || S.phase === 'countdown') game.setPaused(true);
      if (S.horn) { S.horn = false; if (audio.setHorn) audio.setHorn(false); }
    }
    lastTime = performance.now();
  });

  // Main loop ----------------------------------------------------------------
  let lastTime = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 1 / 30);

    if (S.paused) {
      renderer.render(scene, camera);
      return;
    }

    S.elapsed += dt;

    // input
    const touch = ui.getTouchInput ? ui.getTouchInput() : null;
    let drive;
    if (S.phase === 'racing') drive = input.read(dt, touch);
    else {
      input.read(dt, null); // keep keyboard smoothing state alive
      drive = S.phase === 'finished'
        ? { throttle: 0, brake: 0.6, steer: 0, handbrake: false, nitro: false }
        : idleInput;
    }

    // simulation
    car.update(dt, drive, world);
    if (world.update) world.update(dt, S.elapsed, car.position);

    // water auto-reset
    if (car.inWater) S.waterTime += dt; else S.waterTime = 0;
    if (S.waterTime > WATER_RESET_TIME) game.resetToRoad(true);

    updateRace(dt);

    // crash feedback
    const impact = car.lastImpact || 0;
    if (impact > 0.15) {
      if (audio.playCrash) audio.playCrash(clamp(impact, 0, 1));
      rig.addShake(impact * 0.9);
    }

    const nitroActive = !!(drive.nitro && (car.nitro || 0) > 0.02 && Math.abs(car.speed || 0) > 3);

    // audio
    if (audio.update) {
      audio.update({
        rpm: car.rpm,
        throttle: drive.throttle,
        speedKmh: car.getSpeedKmh ? car.getSpeedKmh() : Math.abs(car.speed || 0) * 3.6,
        skid: car.skid || 0,
        nitro: nitroActive,
        surface: car.surface,
        inWater: !!car.inWater
      });
    }

    // gates
    gates.setNext(S.nextCp, S.elapsed);

    // camera
    if (S.phase === 'menu') rig.updateMenu(dt, S.elapsed, car);
    else rig.update(dt, S.elapsed, car, nitroActive);

    // ui
    const nextCpObj = world.checkpoints[S.nextCp] || world.checkpoints[0] || { x: 0, z: 0 };
    ui.update({
      speedKmh: car.getSpeedKmh ? Math.abs(car.getSpeedKmh()) : Math.abs(car.speed || 0) * 3.6,
      rpm: car.rpm,
      gear: car.gear,
      nitro: car.nitro || 0,
      lap: Math.min(S.lap, TOTAL_LAPS),
      totalLaps: TOTAL_LAPS,
      lapTime: S.lapTime,
      bestLap: S.bestLap,
      totalTime: S.totalTime,
      checkpointIndex: S.nextCp === 0 ? cpCount : S.nextCp,
      checkpointCount: cpCount,
      car: { x: car.position.x, z: car.position.z, heading: car.heading },
      nextCheckpoint: { x: nextCpObj.x, z: nextCpObj.z }
    });

    renderer.render(scene, camera);
  }

  // Initial state
  if (car.setHeadlights) car.setHeadlights(false);
  if (world.update) world.update(0.016, 0, car.position);
  gates.setNext(S.nextCp, 0);
  rig.updateMenu(0.016, 0, car);
  renderer.render(scene, camera);

  requestAnimationFrame((t) => { lastTime = t; frame(t); });

  // debug handle
  window.__pride = { scene, camera, renderer, world, car, ui, audio, state: S };
  void tmpV;
}

try {
  startGame();
  hideLoading();
} catch (err) {
  showLoadingError(err);
}
