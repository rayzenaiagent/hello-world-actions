import * as THREE from 'three';
import { createWorld } from './world.js';
import { createPride } from './car.js';
import { CarController } from './physics.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;

function showError(err) {
  console.error(err);
  const l = $('loading');
  if (l) {
    l.classList.remove('hidden');
    l.textContent = 'خطا در بارگذاری: ' + (err && err.message ? err.message : err);
  }
}

async function boot() {
  const app = $('app') || document.body;

  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 3000);
  camera.position.set(0, 5, -10);

  // ---------- World, car, controller ----------
  const world = createWorld(scene);
  const car = createPride({ color: 0xf2f2f2 });
  scene.add(car.group);
  const controller = new CarController(car, world);

  // Place at spawn (controller.reset is expected to do so; fall back otherwise)
  try { controller.reset(); } catch (e) { console.warn(e); }
  if (car.group && world.spawn && car.group.position.lengthSq() === 0) {
    car.group.position.set(world.spawn.x, world.getHeightAt(world.spawn.x, world.spawn.z), world.spawn.z);
    car.group.rotation.y = world.spawn.heading || 0;
  }

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // ---------- Helpers to read controller safely ----------
  const getPos = () => {
    const p = controller.position;
    if (p && typeof p.x === 'number') return { x: p.x, y: typeof p.y === 'number' ? p.y : car.group.position.y, z: p.z };
    return { x: car.group.position.x, y: car.group.position.y, z: car.group.position.z };
  };
  const getHeading = () => (typeof controller.heading === 'number' ? controller.heading : car.group.rotation.y);
  const getSpeedKmh = () => {
    if (typeof controller.speedKmh === 'number') return Math.abs(controller.speedKmh);
    if (typeof controller.speed === 'number') return Math.abs(controller.speed) * 3.6;
    return 0;
  };

  // ---------- Input ----------
  const keys = Object.create(null);
  const touch = { left: false, right: false, gas: false, brake: false };
  let lightsOn = false;
  let muted = false;
  let camMode = 0; // 0 chase, 1 hood, 2 cinematic
  const camNames = ['دنبال‌کننده', 'کاپوت', 'سینمایی'];
  let started = false;

  function toast(text, ms = 2600) {
    const m = $('message');
    if (!m) return;
    m.textContent = text;
    m.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => m.classList.remove('show'), ms);
  }

  function snapCamera() { camState.init = false; }

  function doReset(announce = true) {
    controller.reset();
    snapCamera();
    if (announce) toast('پراید رو ریست کردی');
  }
  function cycleCamera() {
    camMode = (camMode + 1) % 3;
    snapCamera();
    toast('دوربین: ' + camNames[camMode], 1400);
  }
  function toggleLights() {
    lightsOn = !lightsOn;
    if (car.setHeadlights) car.setHeadlights(lightsOn);
  }
  function toggleMute() {
    muted = !muted;
    audio.setMuted(muted);
    const b = $('btn-mute');
    if (b) b.textContent = muted ? '🔇' : '🔊';
  }

  const preventKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
  window.addEventListener('keydown', (e) => {
    if (preventKeys.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys[e.code] = true;
    if (!started) return;
    switch (e.code) {
      case 'KeyR': doReset(); break;
      case 'KeyC': cycleCamera(); break;
      case 'KeyL': toggleLights(); break;
      case 'KeyM': toggleMute(); break;
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; for (const k in touch) touch[k] = false; });

  function bindHold(id, key) {
    const el = $(id);
    if (!el) return;
    const on = (e) => { e.preventDefault(); touch[key] = true; try { el.setPointerCapture(e.pointerId); } catch (_) {} };
    const off = (e) => { e.preventDefault(); touch[key] = false; };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  function bindTap(id, fn) {
    const el = $(id);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); if (started) fn(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  bindHold('btn-left', 'left');
  bindHold('btn-right', 'right');
  bindHold('btn-gas', 'gas');
  bindHold('btn-brake', 'brake');
  bindTap('btn-reset', () => doReset());
  bindTap('btn-camera', cycleCamera);
  bindTap('btn-lights', toggleLights);
  bindTap('btn-mute', toggleMute);
  if (isTouch) {
    const t = $('touch');
    if (t) { t.classList.add('show', 'visible'); t.style.display = t.style.display || ''; }
  }

  let steerValue = 0;
  const input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  function updateInput(dt) {
    const left = keys.KeyA || keys.ArrowLeft || touch.left;
    const right = keys.KeyD || keys.ArrowRight || touch.right;
    const gas = keys.KeyW || keys.ArrowUp || touch.gas;
    const brk = keys.KeyS || keys.ArrowDown || touch.brake;
    const target = (left ? 1 : 0) - (right ? 1 : 0); // +steer = left (turn toward +X when heading +Z)
    const speedFactor = clamp(getSpeedKmh() / 120, 0, 1);
    const rate = target === 0 ? 6.0 : (3.2 - 1.4 * speedFactor);
    const diff = target - steerValue;
    const step = rate * dt;
    steerValue = Math.abs(diff) <= step ? target : steerValue + Math.sign(diff) * step;
    input.steer = steerValue;
    input.throttle = gas ? 1 : 0;
    input.brake = brk ? 1 : 0;
    input.handbrake = !!keys.Space;
  }

  // ---------- Audio ----------
  const audio = (() => {
    let ctx = null, master, osc1, osc2, lp, engGain, noise, noiseGain, noiseBP;
    let mutedFlag = false;
    function start() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = mutedFlag ? 0 : 0.5;
        master.connect(ctx.destination);
        lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 400;
        lp.Q.value = 1.2;
        engGain = ctx.createGain();
        engGain.gain.value = 0.18;
        osc1 = ctx.createOscillator(); osc1.type = 'sawtooth'; osc1.frequency.value = 50;
        osc2 = ctx.createOscillator(); osc2.type = 'square'; osc2.frequency.value = 25;
        const g2 = ctx.createGain(); g2.gain.value = 0.5;
        osc1.connect(lp); osc2.connect(g2); g2.connect(lp);
        lp.connect(engGain); engGain.connect(master);
        osc1.start(); osc2.start();
        // screech noise
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
        noiseBP = ctx.createBiquadFilter(); noiseBP.type = 'bandpass'; noiseBP.frequency.value = 1800; noiseBP.Q.value = 2.5;
        noiseGain = ctx.createGain(); noiseGain.gain.value = 0;
        noise.connect(noiseBP); noiseBP.connect(noiseGain); noiseGain.connect(master);
        noise.start();
      } catch (e) { console.warn('Audio init failed', e); ctx = null; }
    }
    function update(rpm, throttle, screech, speedKmh) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const r = clamp(rpm || 900, 600, 8000);
      const f = 18 + r * 0.028; // ~35..240 Hz
      osc1.frequency.setTargetAtTime(f, t, 0.05);
      osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      lp.frequency.setTargetAtTime(250 + r * 0.22 + throttle * 500, t, 0.08);
      engGain.gain.setTargetAtTime(0.12 + throttle * 0.1, t, 0.1);
      noiseGain.gain.setTargetAtTime(clamp(screech, 0, 1) * 0.25, t, 0.05);
      noiseBP.frequency.setTargetAtTime(1500 + speedKmh * 8, t, 0.1);
    }
    function setMuted(m) {
      mutedFlag = m;
      if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.03);
    }
    return { start, update, setMuted };
  })();

  // ---------- Cameras ----------
  const camState = {
    init: false,
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    heading: 0,
    fov: 65,
    orbit: 0,
  };
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();

  function damp(cur, target, lambda, dt) { return cur + (target - cur) * (1 - Math.exp(-lambda * dt)); }
  function angleDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function updateCamera(dt) {
    const p = getPos();
    const h = getHeading();
    const kmh = getSpeedKmh();
    let targetFov = 65;

    if (!camState.init) {
      camState.heading = h;
      camState.init = true;
      camState.snap = true;
    }

    if (camMode === 0) {
      camState.heading += angleDiff(camState.heading, h) * (1 - Math.exp(-3.5 * dt));
      const ch = camState.heading;
      const dist = 7.5 + clamp(kmh / 150, 0, 1) * 2.0;
      const desired = tmpV.set(p.x - Math.sin(ch) * dist, p.y + 3.0 + clamp(kmh / 200, 0, 1) * 0.5, p.z - Math.cos(ch) * dist);
      if (camState.snap) { camState.pos.copy(desired); camState.snap = false; }
      else {
        const k = 1 - Math.exp(-6 * dt);
        camState.pos.lerp(desired, k);
      }
      camState.look.set(p.x + Math.sin(h) * 4, p.y + 1.2, p.z + Math.cos(h) * 4);
      targetFov = 62 + clamp(kmh / 160, 0, 1) * 22;
    } else if (camMode === 1) {
      // hood / driver view
      const local = tmpV.set(0, 1.15, 0.5);
      if (car.group) { car.group.updateMatrixWorld(true); car.group.localToWorld(local); }
      else local.set(p.x, p.y + 1.15, p.z);
      camState.pos.copy(local);
      const fwd = tmpV2.set(0, 1.1, 12);
      if (car.group) car.group.localToWorld(fwd);
      else fwd.set(p.x + Math.sin(h) * 12, p.y + 1.1, p.z + Math.cos(h) * 12);
      camState.look.copy(fwd);
      targetFov = 70 + clamp(kmh / 160, 0, 1) * 12;
      camState.snap = false;
    } else {
      camState.orbit += dt * 0.25;
      const r = 9 + Math.sin(camState.orbit * 0.7) * 2;
      const a = h + Math.PI * 0.75 + camState.orbit;
      const desired = tmpV.set(p.x + Math.sin(a) * r, p.y + 2.6 + Math.sin(camState.orbit * 1.3) * 0.8, p.z + Math.cos(a) * r);
      if (camState.snap) { camState.pos.copy(desired); camState.snap = false; }
      else camState.pos.lerp(desired, 1 - Math.exp(-3 * dt));
      camState.look.set(p.x, p.y + 0.9, p.z);
      targetFov = 55;
    }

    // never below terrain + 1
    if (world.getHeightAt) {
      const minY = world.getHeightAt(camState.pos.x, camState.pos.z) + 1;
      if (camState.pos.y < minY) camState.pos.y = minY;
    }
    camera.position.copy(camState.pos);
    camera.lookAt(camState.look);

    camState.fov = damp(camState.fov, targetFov, 4, dt);
    if (Math.abs(camera.fov - camState.fov) > 0.01) {
      camera.fov = camState.fov;
      camera.updateProjectionMatrix();
    }
  }

  // ---------- HUD ----------
  const elSpeed = $('speed-value');
  const elUnit = $('speed-unit');
  const elGear = $('gear');
  if (elUnit) elUnit.textContent = 'km/h';
  let lastSpeedTxt = '', lastGearTxt = '';

  const mm = $('minimap');
  const mmCtx = mm ? mm.getContext('2d') : null;
  const MM = mm ? mm.width : 180;
  let mmStatic = null;
  const worldR = world.radius || 600;
  const mmScale = (MM / 2 - 6) / worldR;
  function buildMinimapStatic() {
    if (!mm) return;
    mmStatic = document.createElement('canvas');
    mmStatic.width = mmStatic.height = MM;
    const c = mmStatic.getContext('2d');
    const cx = MM / 2;
    c.fillStyle = 'rgba(20,90,140,0.85)';
    c.beginPath(); c.arc(cx, cx, MM / 2 - 1, 0, Math.PI * 2); c.fill();
    // island
    c.fillStyle = '#d8c58a';
    c.beginPath(); c.arc(cx, cx, worldR * mmScale, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5a9a4a';
    c.beginPath(); c.arc(cx, cx, worldR * mmScale * 0.85, 0, Math.PI * 2); c.fill();
    // road
    const rp = world.roadPoints;
    if (rp && rp.length > 1) {
      c.strokeStyle = '#3a3a3a';
      c.lineWidth = 3;
      c.lineJoin = 'round';
      c.beginPath();
      rp.forEach((pt, i) => {
        const x = cx + pt.x * mmScale, y = cx - pt.z * mmScale;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      });
      c.stroke();
    }
  }
  buildMinimapStatic();

  function drawMinimap() {
    if (!mmCtx || !mmStatic) return;
    mmCtx.clearRect(0, 0, MM, MM);
    mmCtx.save();
    mmCtx.beginPath(); mmCtx.arc(MM / 2, MM / 2, MM / 2 - 1, 0, Math.PI * 2); mmCtx.clip();
    mmCtx.drawImage(mmStatic, 0, 0);
    const p = getPos();
    const h = getHeading();
    const x = MM / 2 + p.x * mmScale;
    const y = MM / 2 - p.z * mmScale;
    mmCtx.translate(x, y);
    // heading: world forward (sin h, cos h) -> canvas (sin h, -cos h); angle from up = h
    mmCtx.rotate(h);
    mmCtx.fillStyle = '#ff3b30';
    mmCtx.strokeStyle = '#fff';
    mmCtx.lineWidth = 1.5;
    mmCtx.beginPath();
    mmCtx.moveTo(0, -7); mmCtx.lineTo(5, 6); mmCtx.lineTo(0, 3); mmCtx.lineTo(-5, 6); mmCtx.closePath();
    mmCtx.fill(); mmCtx.stroke();
    mmCtx.restore();
  }

  function updateHud() {
    const s = String(Math.round(getSpeedKmh()));
    if (elSpeed && s !== lastSpeedTxt) { elSpeed.textContent = s; lastSpeedTxt = s; }
    const g = String(controller.gear !== undefined ? controller.gear : 'N');
    if (elGear && g !== lastGearTxt) { elGear.textContent = g; lastGearTxt = g; }
  }

  // ---------- Game loop ----------
  const clock = new THREE.Clock();
  let mmTimer = 0;
  let prevPos = getPos();
  let lateralSmooth = 0;
  let waterCooldown = 0;
  let brakeLightsOn = false;

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (started) {
      updateInput(dt);
      controller.update(dt, input);

      // brake lights
      const bl = input.brake > 0 || input.handbrake;
      if (bl !== brakeLightsOn) { brakeLightsOn = bl; if (car.setBrakeLights) car.setBrakeLights(bl); }

      // water
      waterCooldown -= dt;
      if (controller.inWater && waterCooldown <= 0) {
        waterCooldown = 3;
        toast('افتادی تو آب! برگشتی سر جاده', 3200);
        doReset(false);
      }

      // lateral slip estimate for screech
      const p = getPos();
      const h = getHeading();
      let lateral = 0;
      if (dt > 0) {
        const vx = (p.x - prevPos.x) / dt, vz = (p.z - prevPos.z) / dt;
        lateral = Math.abs(vx * Math.cos(h) - vz * Math.sin(h));
        if (lateral > 40) lateral = 0; // teleport/reset
      }
      prevPos = p;
      lateralSmooth += (lateral - lateralSmooth) * Math.min(1, dt * 8);
      const speedKmh = getSpeedKmh();
      let screech = clamp((lateralSmooth - 2.5) / 6, 0, 1);
      if (input.handbrake && speedKmh > 20) screech = Math.max(screech, 0.7);
      if (typeof controller.drifting === 'boolean' && controller.drifting) screech = Math.max(screech, 0.6);
      if (controller.onRoad === false && speedKmh > 10) screech *= 0.5;
      audio.update(typeof controller.rpm === 'number' ? controller.rpm : 900, input.throttle, screech, speedKmh);

      updateHud();
      mmTimer += dt;
      if (mmTimer >= 1 / 15) { mmTimer = 0; drawMinimap(); }
    }

    updateCamera(dt);
    world.update(dt, camera.position);
    renderer.render(scene, camera);
  }

  // ---------- Start flow ----------
  const loading = $('loading');
  const startScreen = $('start-screen');
  const hud = $('hud');
  if (loading) loading.classList.add('hidden');
  if (startScreen) { startScreen.classList.remove('hidden'); startScreen.style.display = ''; }
  if (hud) hud.classList.add('hidden');

  const startBtn = $('start-btn');
  const begin = () => {
    if (started) return;
    started = true;
    if (startScreen) startScreen.classList.add('hidden');
    if (hud) hud.classList.remove('hidden');
    audio.start();
    audio.setMuted(muted);
    clock.getDelta();
    snapCamera();
    toast('به جزیره خوش اومدی!', 3500);
    const help = $('help');
    if (help && !help.classList.contains('show') && !isTouch) help.classList.add('show');
  };
  if (startBtn) startBtn.addEventListener('click', begin);

  // render idle (cinematic) behind start screen
  camMode = 2;
  frame();
  const origBegin = begin;
  if (startBtn) {
    startBtn.addEventListener('click', () => { camMode = 0; snapCamera(); });
  }
  void origBegin;
}

try {
  boot().catch(showError);
} catch (e) {
  showError(e);
}
