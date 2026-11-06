// Pride Island UI: all DOM built inside #ui-root. Plain JS.
export function createUI(callbacks) {
  const cb = Object.assign({ onStart() {}, onResume() {}, onRestart() {}, onCameraToggle() {}, onReset() {}, onMuteToggle() {} }, callbacks || {});
  const root = document.getElementById('ui-root');
  root.innerHTML = '';
  const touchCapable = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const isTouch = () => touchCapable || window.matchMedia('(max-width: 760px)').matches;

  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };

  const fmt = (t) => {
    if (t === null || t === undefined || !isFinite(t)) return '--:--.---';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t * 1000) % 1000);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
  };

  // ---------- Start menu ----------
  const menu = el('div', 'overlay menu show');
  menu.innerHTML = `
    <div class="panel glass">
      <div class="title-fa">پراید جزیره</div>
      <div class="title-en">PRIDE ISLAND</div>
      <p class="desc">با پراید محبوبت دور جزیره‌ی استوایی رانندگی کن، از چک‌پوینت‌ها بگذر و رکورد بزن!<br><span class="en">Drive the legendary Pride around a tropical island.</span></p>
      <div class="race-info">🏁 مسابقه ۳ دوری <span class="en">3 laps</span></div>
      <ul class="controls">
        <li><kbd>W</kbd><kbd>↑</kbd><span>گاز <i>Gas</i></span></li>
        <li><kbd>S</kbd><kbd>↓</kbd><span>ترمز / دنده عقب <i>Brake</i></span></li>
        <li><kbd>A</kbd><kbd>D</kbd><kbd>←</kbd><kbd>→</kbd><span>فرمان <i>Steer</i></span></li>
        <li><kbd>Space</kbd><span>ترمز دستی <i>Handbrake</i></span></li>
        <li><kbd>Shift</kbd><span>نیترو <i>Nitro</i></span></li>
        <li><kbd>C</kbd><span>دوربین <i>Camera</i></span></li>
        <li><kbd>R</kbd><span>بازگشت به جاده <i>Reset</i></span></li>
        <li><kbd>H</kbd><span>بوق <i>Horn</i></span></li>
        <li><kbd>L</kbd><span>چراغ <i>Lights</i></span></li>
        <li><kbd>M</kbd><span>صدا <i>Mute</i></span></li>
        <li><kbd>P</kbd><kbd>Esc</kbd><span>توقف <i>Pause</i></span></li>
      </ul>
      <button class="btn big" data-act="start">شروع رانندگی</button>
    </div>`;
  const pause = el('div', 'overlay pause');
  pause.innerHTML = `
    <div class="panel glass small">
      <div class="title-fa sm">توقف</div><div class="title-en">PAUSED</div>
      <button class="btn" data-act="resume">ادامه</button>
      <button class="btn alt" data-act="restart">شروع دوباره</button>
      <button class="btn alt" data-act="mute">صدا روشن/خاموش</button>
    </div>`;
  const finish = el('div', 'overlay finish');
  finish.innerHTML = `
    <div class="panel glass small">
      <div class="title-fa sm">🏆 پایان مسابقه</div><div class="title-en">FINISH</div>
      <div class="res"><span>زمان کل <i>Total</i></span><b data-f="total">--</b></div>
      <div class="res"><span>بهترین دور <i>Best lap</i></span><b data-f="best">--</b></div>
      <button class="btn big" data-act="again">دوباره</button>
    </div>`;

  // ---------- HUD ----------
  const hud = el('div', 'hud');
  hud.innerHTML = `
    <div class="hud-tl glass">
      <div class="lap" data-h="lap">دور 1/3</div>
      <div class="row"><span>زمان دور</span><b data-h="lapTime">00:00.000</b></div>
      <div class="row"><span>بهترین</span><b data-h="best">--:--.---</b></div>
      <div class="row"><span>کل</span><b data-h="total">00:00.000</b></div>
      <div class="cp" data-h="cp">چک‌پوینت 0/10</div>
    </div>
    <div class="hud-tr"><canvas class="minimap" width="360" height="360"></canvas></div>
    <div class="hud-top glass">
      <div class="arrow" data-h="arrow"><svg viewBox="-20 -20 40 40"><path d="M0 -16 L12 12 L0 6 L-12 12 Z" fill="#ffd54a" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg></div>
      <b data-h="dist">0 m</b>
    </div>
    <div class="hud-br">
      <div class="nitro"><span class="nl">NITRO</span><div class="bar"><div class="fill" data-h="nitro"></div></div></div>
      <canvas class="speedo" width="240" height="240"></canvas>
    </div>
    <div class="toast" data-h="toast"></div>`;

  // ---------- Touch controls ----------
  const touch = el('div', 'touch');
  touch.innerHTML = `
    <div class="t-top">
      <button class="tb sm" data-t="camera">📷</button>
      <button class="tb sm" data-t="reset">↺</button>
      <button class="tb sm" data-t="pause">⏸</button>
    </div>
    <div class="t-left">
      <button class="tb" data-k="left">◀</button>
      <button class="tb" data-k="right">▶</button>
    </div>
    <div class="t-right">
      <button class="tb nit" data-k="nitro">N₂O</button>
      <button class="tb hb" data-k="handbrake">HB</button>
      <button class="tb brk" data-k="brake">ترمز</button>
      <button class="tb gas" data-k="gas">گاز</button>
    </div>`;

  root.append(hud, touch, menu, pause, finish);
  const $h = (n) => hud.querySelector(`[data-h="${n}"]`);
  const H = { lap: $h('lap'), lapTime: $h('lapTime'), best: $h('best'), total: $h('total'), cp: $h('cp'), arrow: $h('arrow'), dist: $h('dist'), nitro: $h('nitro'), toast: $h('toast') };
  const miniCv = hud.querySelector('.minimap');
  const mctx = miniCv.getContext('2d');
  const speedoCv = hud.querySelector('.speedo');
  const sctx = speedoCv.getContext('2d');

  // Hi-DPI speedo
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  speedoCv.width = speedoCv.height = Math.round(240 * dpr);
  const SP = speedoCv.width;

  // ---------- Buttons ----------
  const hide = (o) => o.classList.remove('show');
  const show = (o) => o.classList.add('show');
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'start') { hide(menu); root.classList.add('playing'); cb.onStart(); }
    else if (a === 'resume') { hide(pause); cb.onResume(); }
    else if (a === 'restart') { hide(pause); cb.onRestart(); }
    else if (a === 'again') { hide(finish); cb.onRestart(); }
    else if (a === 'mute') cb.onMuteToggle();
  });

  // ---------- Touch input ----------
  const keys = { left: false, right: false, gas: false, brake: false, nitro: false, handbrake: false };
  touch.querySelectorAll('[data-k]').forEach((b) => {
    const k = b.dataset.k;
    const set = (v) => { keys[k] = v; b.classList.toggle('down', v); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {} set(true); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, () => set(false)));
  });
  touch.querySelectorAll('[data-t]').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const t = b.dataset.t;
      if (t === 'camera') cb.onCameraToggle();
      else if (t === 'reset') cb.onReset();
      else if (t === 'pause') {
        // main.js owns pause state; emulate the P key press it already handles
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'p', code: 'KeyP', bubbles: true }));
      }
    });
  });
  ['touchmove', 'gesturestart', 'contextmenu'].forEach((ev) => touch.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));

  const applyTouchVisibility = () => root.classList.toggle('is-touch', isTouch());
  applyTouchVisibility();
  window.addEventListener('resize', applyTouchVisibility);

  // ---------- Minimap ----------
  let mapBmp = null, mapWS = 1200, mapPath = [], mapCps = [];
  const COLORS = { water: '#1e6fa8', sand: '#e6d49a', grass: '#4f9a45', rock: '#7d7a76', road: '#3a3a3e' };

  function setMap(o) {
    mapWS = o.worldSize || 1200;
    mapPath = o.roadPath || [];
    mapCps = o.checkpoints || [];
    const N = 256;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const img = g.createImageData(N, N);
    const rgb = {};
    for (const k in COLORS) {
      const v = parseInt(COLORS[k].slice(1), 16);
      rgb[k] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = ((i + 0.5) / N - 0.5) * mapWS;
        const z = ((j + 0.5) / N - 0.5) * mapWS;
        const col = rgb[o.sampler(x, z)] || rgb.water;
        const p = (j * N + i) * 4;
        img.data[p] = col[0]; img.data[p + 1] = col[1]; img.data[p + 2] = col[2]; img.data[p + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // road line on bitmap for crisp look
    g.strokeStyle = '#2b2b2f';
    g.lineWidth = 1.6;
    g.lineJoin = 'round';
    g.beginPath();
    mapPath.forEach((p, i) => {
      const px = (p.x / mapWS + 0.5) * N, py = (p.z / mapWS + 0.5) * N;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    });
    if (mapPath.length) g.closePath();
    g.stroke();
    mapBmp = c;
  }

  function drawMinimap(car, nextIdx, nextCp, time) {
    const S = miniCv.width, c = S / 2;
    const viewR = 230;
    const sc = c / viewR;
    mctx.clearRect(0, 0, S, S);
    mctx.save();
    mctx.beginPath();
    mctx.arc(c, c, c - 3, 0, Math.PI * 2);
    mctx.clip();
    mctx.fillStyle = COLORS.water;
    mctx.fillRect(0, 0, S, S);
    mctx.translate(c, c);
    mctx.rotate(car.heading - Math.PI);
    mctx.scale(sc, sc);
    mctx.translate(-car.x, -car.z);
    if (mapBmp) {
      mctx.imageSmoothingEnabled = true;
      mctx.drawImage(mapBmp, -mapWS / 2, -mapWS / 2, mapWS, mapWS);
    }
    // checkpoints
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    for (let i = 0; i < mapCps.length; i++) {
      const p = mapCps[i];
      const nx = i === nextIdx;
      mctx.beginPath();
      mctx.arc(p.x, p.z, (nx ? 9 + pulse * 6 : 5) , 0, Math.PI * 2);
      mctx.fillStyle = nx ? 'rgba(255,213,74,' + (0.6 + 0.4 * pulse) + ')' : 'rgba(255,255,255,.8)';
      mctx.fill();
      mctx.lineWidth = 1.5;
      mctx.strokeStyle = '#222';
      mctx.stroke();
    }
    // car arrow (drawn in world space, pointing along heading)
    mctx.translate(car.x, car.z);
    mctx.rotate(Math.PI - car.heading); // undo map rotation so arrow points up on screen
    mctx.scale(1 / sc, 1 / sc);
    mctx.beginPath();
    mctx.moveTo(0, -15); mctx.lineTo(10, 12); mctx.lineTo(0, 6); mctx.lineTo(-10, 12); mctx.closePath();
    mctx.fillStyle = '#ff3b30';
    mctx.fill();
    mctx.lineWidth = 2.5;
    mctx.strokeStyle = '#fff';
    mctx.stroke();
    mctx.restore();
    mctx.beginPath();
    mctx.arc(c, c, c - 3, 0, Math.PI * 2);
    mctx.lineWidth = 6;
    mctx.strokeStyle = 'rgba(255,255,255,.85)';
    mctx.stroke();
  }

  // ---------- Speedometer ----------
  let needle = 0, rpmSm = 800;
  const A0 = Math.PI * 0.75, SWEEP = Math.PI * 1.5;
  const MAXV = 200, MAXR = 7000;
  let speedoBase = null;

  function buildSpeedoBase() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = SP;
    const g = cv.getContext('2d');
    const u = SP / 240;
    g.scale(u, u);
    g.translate(120, 120);
    g.beginPath(); g.arc(0, 0, 118, 0, Math.PI * 2);
    const bg = g.createRadialGradient(0, 0, 20, 0, 0, 118);
    bg.addColorStop(0, 'rgba(18,26,34,.88)'); bg.addColorStop(1, 'rgba(6,10,16,.92)');
    g.fillStyle = bg; g.fill();
    g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke();
    // red zone
    g.beginPath(); g.arc(0, 0, 104, A0 + SWEEP * 0.85, A0 + SWEEP);
    g.lineWidth = 6; g.strokeStyle = '#e53935'; g.stroke();
    // ticks
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let v = 0; v <= MAXV; v += 10) {
      const a = A0 + (v / MAXV) * SWEEP;
      const major = v % 20 === 0;
      const r1 = 112, r2 = major ? 99 : 105;
      g.beginPath();
      g.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      g.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      g.lineWidth = major ? 2.4 : 1.2;
      g.strokeStyle = v >= 170 ? '#ff6e6a' : '#e8eef2';
      g.stroke();
      if (v % 40 === 0) {
        g.font = '600 12px Vazirmatn, sans-serif';
        g.fillStyle = '#fff';
        g.fillText(String(v), Math.cos(a) * 85, Math.sin(a) * 85);
      }
    }
    g.font = '10px Vazirmatn, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.fillText('km/h', 0, 52);
    speedoBase = cv;
  }

  function drawSpeedo(kmh, rpm, gear) {
    if (!speedoBase) buildSpeedoBase();
    needle += (Math.min(Math.abs(kmh), MAXV) - needle) * 0.18;
    rpmSm += (rpm - rpmSm) * 0.25;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, SP, SP);
    sctx.drawImage(speedoBase, 0, 0);
    const u = SP / 240;
    sctx.setTransform(u, 0, 0, u, 120 * u, 120 * u);
    // rpm arc
    const rf = Math.max(0, Math.min(1, rpmSm / MAXR));
    sctx.lineCap = 'round';
    sctx.lineWidth = 5;
    sctx.beginPath(); sctx.arc(0, 0, 66, A0, A0 + SWEEP);
    sctx.strokeStyle = 'rgba(255,255,255,.15)'; sctx.stroke();
    sctx.beginPath(); sctx.arc(0, 0, 66, A0, A0 + SWEEP * Math.min(rf, 0.857));
    sctx.strokeStyle = '#4fc3f7'; sctx.stroke();
    if (rf > 0.857) {
      sctx.beginPath(); sctx.arc(0, 0, 66, A0 + SWEEP * 0.857, A0 + SWEEP * rf);
      sctx.strokeStyle = '#ff3b30'; sctx.stroke();
    }
    sctx.lineCap = 'butt';
    // redline marker
    const ra = A0 + SWEEP * 0.857;
    sctx.beginPath();
    sctx.moveTo(Math.cos(ra) * 60, Math.sin(ra) * 60); sctx.lineTo(Math.cos(ra) * 72, Math.sin(ra) * 72);
    sctx.lineWidth = 2; sctx.strokeStyle = '#ff3b30'; sctx.stroke();
    // needle
    const na = A0 + (needle / MAXV) * SWEEP;
    sctx.save();
    sctx.rotate(na);
    sctx.shadowColor = 'rgba(255,60,40,.8)'; sctx.shadowBlur = 8;
    sctx.beginPath(); sctx.moveTo(-12, -2); sctx.lineTo(100, -0.8); sctx.lineTo(100, 0.8); sctx.lineTo(-12, 2); sctx.closePath();
    sctx.fillStyle = '#ff4a3d'; sctx.fill();
    sctx.restore();
    sctx.beginPath(); sctx.arc(0, 0, 5, 0, Math.PI * 2); sctx.fillStyle = '#ddd'; sctx.fill();
    // digital
    sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
    sctx.font = '700 34px Vazirmatn, sans-serif';
    sctx.fillStyle = '#fff';
    sctx.fillText(String(Math.round(Math.abs(kmh))), 0, 30);
    sctx.font = '700 18px Vazirmatn, sans-serif';
    sctx.fillStyle = gear === 'R' ? '#ff8a65' : '#ffd54a';
    sctx.fillText(String(gear), 0, -22);
  }

  // ---------- Update ----------
  const cache = {};
  const setText = (key, node, v) => { if (cache[key] !== v) { cache[key] = v; node.textContent = v; } };
  let nitroPrev = -1;

  function update(s) {
    const now = performance.now() / 1000;
    setText('lap', H.lap, 'دور ' + Math.min(s.lap, s.totalLaps) + '/' + s.totalLaps);
    setText('lapTime', H.lapTime, fmt(s.lapTime));
    setText('best', H.best, fmt(s.bestLap));
    setText('total', H.total, fmt(s.totalTime));
    setText('cp', H.cp, 'چک‌پوینت ' + s.checkpointIndex + '/' + s.checkpointCount);
    const n = Math.round(Math.max(0, Math.min(1, s.nitro)) * 100);
    if (n !== nitroPrev) {
      nitroPrev = n;
      H.nitro.style.width = n + '%';
      H.nitro.parentElement.classList.toggle('full', n >= 99);
    }
    const car = s.car, nc = s.nextCheckpoint;
    if (car && nc) {
      const dx = nc.x - car.x, dz = nc.z - car.z;
      const rel = Math.atan2(dx, dz) - car.heading;
      H.arrow.style.transform = 'rotate(' + (-rel * 180 / Math.PI).toFixed(1) + 'deg)';
      setText('dist', H.dist, Math.round(Math.hypot(dx, dz)) + ' m');
      drawMinimap(car, s.checkpointIndex % Math.max(1, s.checkpointCount), nc, now);
    }
    drawSpeedo(s.speedKmh, s.rpm, s.gear);
  }

  let toastTimer = 0;
  function showMessage(text, dur) {
    const t = H.toast;
    t.textContent = text;
    t.classList.remove('go');
    void t.offsetWidth;
    t.classList.add('go');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('go'), (dur || 1.5) * 1000);
  }

  function showPause(v) { v ? show(pause) : hide(pause); }
  function showFinish(r) {
    finish.querySelector('[data-f="total"]').textContent = fmt(r.totalTime);
    finish.querySelector('[data-f="best"]').textContent = fmt(r.bestLap);
    show(finish);
  }
  function hideMenus() { hide(menu); hide(pause); hide(finish); }
  function getTouchInput() {
    return {
      throttle: keys.gas ? 1 : 0,
      brake: keys.brake ? 1 : 0,
      steer: (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
      handbrake: keys.handbrake,
      nitro: keys.nitro,
    };
  }

  return { setMap, update, showMessage, showPause, showFinish, hideMenus, getTouchInput, isTouch };
}
