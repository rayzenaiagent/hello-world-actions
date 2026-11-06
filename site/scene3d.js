/* ==========================================================
   APPXA free — interactive Three.js stage
   8 platform tiles orbiting an "A" core. Tools: launch / vortex / shatter / reset
   ========================================================== */
(function () {
  "use strict";
  const canvas = document.getElementById("scene");
  const wrap = document.getElementById("stageWrap");
  const fallback = document.getElementById("fallback");
  const A = window.APPXA || { Sound: { blip() {}, whoosh() {}, crack() {}, hum() {} }, toast() {} };

  function hasWebGL() {
    try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); }
    catch (e) { return false; }
  }
  if (typeof THREE === "undefined" || !hasWebGL()) {
    canvas.style.display = "none"; fallback.hidden = false; return;
  }

  /* ---------------- Renderer ---------------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  camera.position.set(0, 4, 15);

  /* ---------------- Theme palette ---------------- */
  const THEMES = {
    carbon: { fog: 0x0e0f12, floor: 0x15171b, core: 0x1e2127, brass: 0xd4a359, verm: 0xe05a47, ivory: 0xf4f1ea, pewter: 0x9e9a90, sage: 0x7e9c84, hemiSky: 0xf4f1ea, hemiGround: 0x101114, exposure: 1.05 },
    paper:  { fog: 0xfaf6f0, floor: 0xefe8dc, core: 0x2a2724, brass: 0xb9822f, verm: 0xd93829, ivory: 0xfaf6f0, pewter: 0x5c574f, sage: 0x2d6a4f, hemiSky: 0xffffff, hemiGround: 0xd9cfbf, exposure: 1.15 }
  };
  let theme = THEMES[document.documentElement.dataset.mode === "paper" ? "paper" : "carbon"];
  scene.fog = new THREE.Fog(theme.fog, 18, 42);

  /* ---------------- Lights (3-point + hemi) ---------------- */
  const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1dc, 1.6);
  key.position.set(6, 11, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -10; key.shadow.camera.right = 10;
  key.shadow.camera.top = 10; key.shadow.camera.bottom = -10;
  key.shadow.camera.near = 1; key.shadow.camera.far = 40;
  key.shadow.bias = -0.0005; key.shadow.radius = 4;
  scene.add(key);
  const rimWarm = new THREE.SpotLight(0xe0903f, 2.2, 40, Math.PI / 5, 0.6, 1.5);
  rimWarm.position.set(-9, 6, -6); scene.add(rimWarm);
  const rimCool = new THREE.PointLight(0x9fb6d6, 0.9, 30, 2);
  rimCool.position.set(8, 2, -8); scene.add(rimCool);
  const coreGlow = new THREE.PointLight(theme.brass, 1.2, 9, 2);
  coreGlow.position.set(0, 0.5, 0); scene.add(coreGlow);

  /* ---------------- Floor ---------------- */
  const floorMat = new THREE.MeshPhysicalMaterial({ color: theme.floor, roughness: 0.85, metalness: 0.0, clearcoat: 0.15 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2.6; floor.receiveShadow = true;
  scene.add(floor);

  const ringGroup = new THREE.Group(); scene.add(ringGroup);
  const ringLineMat = new THREE.LineBasicMaterial({ color: theme.pewter, transparent: true, opacity: 0.28 });
  [3.2, 5.0, 6.8].forEach((r, i) => {
    const pts = [];
    for (let k = 0; k <= 128; k++) { const a = (k / 128) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const l = i === 1 ? new THREE.Line(g, ringLineMat) : new THREE.LineLoop(g, ringLineMat);
    if (i !== 1) l.computeLineDistances && l.computeLineDistances();
    l.position.y = -0.2; ringGroup.add(l);
  });

  /* ---------------- Rounded box geometry ---------------- */
  function roundedBox(w, h, d, r, seg) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const g = new THREE.ExtrudeGeometry(s, { depth: d - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.9, bevelSegments: seg || 4, curveSegments: 10 });
    g.center(); return g;
  }

  /* ---------------- Label textures ---------------- */
  function labelTexture(text, sub, bg, fg) {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const x = c.getContext("2d");
    x.fillStyle = bg; x.fillRect(0, 0, 256, 256);
    x.fillStyle = fg; x.textAlign = "center"; x.textBaseline = "middle";
    x.font = "800 " + (text.length > 4 ? 62 : 84) + "px 'Bricolage Grotesque', 'Segoe UI', sans-serif";
    x.fillText(text, 128, 116);
    x.globalAlpha = 0.65; x.font = "600 26px 'JetBrains Mono', monospace";
    x.fillText(sub, 128, 190);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return t;
  }

  /* ---------------- Core "A" ---------------- */
  const core = new THREE.Group(); scene.add(core);
  const coreMat = new THREE.MeshPhysicalMaterial({ color: theme.core, roughness: 0.28, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 });
  const coreBox = new THREE.Mesh(roundedBox(2.4, 2.4, 2.4, 0.45, 6), coreMat);
  coreBox.castShadow = true; coreBox.receiveShadow = true; core.add(coreBox);

  const brassMat = new THREE.MeshPhysicalMaterial({ color: theme.brass, roughness: 0.22, metalness: 0.9, clearcoat: 0.6 });
  const aShape = new THREE.Shape();
  // stylized "A" outline
  aShape.moveTo(-0.85, -0.8); aShape.lineTo(-0.15, 0.85); aShape.lineTo(0.15, 0.85); aShape.lineTo(0.85, -0.8);
  aShape.lineTo(0.5, -0.8); aShape.lineTo(0.32, -0.38); aShape.lineTo(-0.32, -0.38); aShape.lineTo(-0.5, -0.8); aShape.closePath();
  const hole = new THREE.Path(); hole.moveTo(-0.2, -0.1); hole.lineTo(0, 0.4); hole.lineTo(0.2, -0.1); hole.closePath();
  aShape.holes.push(hole);
  const aGeo = new THREE.ExtrudeGeometry(aShape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 3 });
  aGeo.center();
  [[0, 0, 1.25, 0], [0, 0, -1.25, Math.PI], [1.25, 0, 0, Math.PI / 2], [-1.25, 0, 0, -Math.PI / 2]].forEach(([x, y, z, ry]) => {
    const m = new THREE.Mesh(aGeo, brassMat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; core.add(m);
  });
  // glass shell
  const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transmission: 0.92, transparent: true, opacity: 0.28, thickness: 0.6, clearcoat: 1 });
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(2.35, 2), shellMat);
  core.add(shell);
  const shellWire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.38, 1)),
    new THREE.LineBasicMaterial({ color: theme.brass, transparent: true, opacity: 0.25 }));
  core.add(shellWire);
  core.userData = { isCore: true };

  /* ---------------- Platform tiles ---------------- */
  const TILES = [
    { t: "AI", s: "FREE AI", fa: "هوش مصنوعی رایگان", d: "ایجنت‌ها، CLIها و مهارت‌های هوش مصنوعی که هزینه اشتراک ندارن.", c: "brass" },
    { t: "And", s: "ANDROID", fa: "اندروید", d: "اپ‌های رایگان، ابزار و جایگزین‌های اوپن‌سورس برای گوشی.", c: "ivory" },
    { t: "iOS", s: "APPLE", fa: "آیفون و iOS", d: "اپ‌ها و وب‌اپ‌های رایگان آیفون، مثل MirrorSay.", c: "verm" },
    { t: "Win", s: "WINDOWS", fa: "ویندوز", d: "نرم‌افزارهای سبک، ایجنت دسکتاپ و خبرهای اپ‌های دسکتاپ.", c: "pewter" },
    { t: "Lnx", s: "LINUX", fa: "لینوکس", d: "CLI، سرور و پروژه‌هایی که روی هر دیسترو اجرا می‌شن.", c: "brass" },
    { t: "TG", s: "TELEGRAM", fa: "تلگرام", d: "ترفندها و ربات‌ها — و خود کانال با ۲۹ هزار عضو.", c: "ivory" },
    { t: "Git", s: "GITHUB", fa: "گیت‌هاب", d: "ترند روز و ریپوهای فارسی‌شده مثل Word Atlas.", c: "verm" },
    { t: "VPS", s: "SERVERS", fa: "سرور و VPS", d: "اعتبارهای رایگان سرور، با هشدارهای شفاف.", c: "sage" }
  ];
  const tiles = [];
  const tileGeo = roundedBox(1.25, 1.25, 0.42, 0.16, 4);
  const faceGeo = new THREE.PlaneGeometry(0.98, 0.98);

  function matFor(cKey) {
    const col = theme[cKey];
    return new THREE.MeshPhysicalMaterial({ color: col, roughness: cKey === "brass" ? 0.25 : 0.4, metalness: cKey === "brass" ? 0.8 : 0.05, clearcoat: 1, clearcoatRoughness: 0.2 });
  }
  function faceColors(cKey) {
    const dark = cKey === "ivory";
    return { bg: dark ? "#ece7dd" : "#" + new THREE.Color(theme[cKey]).getHexString(), fg: dark ? "#161513" : (cKey === "pewter" || cKey === "sage" ? "#F4F1EA" : "#141210") };
  }

  TILES.forEach((d, i) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(tileGeo, matFor(d.c)); body.castShadow = true; body.receiveShadow = true;
    const fc = faceColors(d.c);
    const face = new THREE.Mesh(faceGeo, new THREE.MeshPhysicalMaterial({ map: labelTexture(d.t, d.s, fc.bg, fc.fg), roughness: 0.45, clearcoat: 0.8 }));
    face.position.z = 0.215;
    const back = face.clone(); back.rotation.y = Math.PI; back.position.z = -0.215;
    g.add(body, face, back);
    const angle = (i / TILES.length) * Math.PI * 2;
    g.userData = {
      i, data: d, body, face, back,
      angle, radius: 5, baseY: Math.sin(i * 1.3) * 0.4,
      mode: "orbit", // orbit | flying | returning | broken
      vel: new THREE.Vector3(), spin: new THREE.Vector3(),
      hover: 0, scale: 1, brokenT: 0
    };
    scene.add(g); tiles.push(g);
  });

  /* ---------------- Dust particles ---------------- */
  const P = 700;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(P * 3), pSeed = new Float32Array(P);
  for (let i = 0; i < P; i++) {
    const r = 3 + Math.random() * 14, a = Math.random() * Math.PI * 2;
    pPos[i * 3] = Math.cos(a) * r; pPos[i * 3 + 1] = -2 + Math.random() * 9; pPos[i * 3 + 2] = Math.sin(a) * r;
    pSeed[i] = Math.random() * 10;
  }
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const dotTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.4, "rgba(255,255,255,.5)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();
  const pMat = new THREE.PointsMaterial({ size: 0.07, map: dotTex, color: theme.brass, transparent: true, opacity: 0.55, depthWrite: false });
  const dust = new THREE.Points(pGeo, pMat); scene.add(dust);

  /* ---------------- Fragments & shockwaves ---------------- */
  const fragments = [];
  const fragGeos = [new THREE.TetrahedronGeometry(0.18), new THREE.BoxGeometry(0.22, 0.22, 0.12), new THREE.OctahedronGeometry(0.15)];
  function spawnFragments(pos, cKey, n) {
    const m = matFor(cKey);
    for (let k = 0; k < n; k++) {
      const f = new THREE.Mesh(fragGeos[k % 3], m);
      f.position.copy(pos); f.castShadow = true;
      f.userData = {
        vel: new THREE.Vector3((Math.random() - 0.5) * 9, Math.random() * 7 + 2, (Math.random() - 0.5) * 9),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        life: 2.6 + Math.random() * 1.2
      };
      scene.add(f); fragments.push(f);
    }
  }
  const waves = [];
  function shockwave(pos, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.45, 64),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    m.position.copy(pos); m.lookAt(camera.position); m.userData.t = 0;
    scene.add(m); waves.push(m);
    const g = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.32, 64),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    g.rotation.x = -Math.PI / 2; g.position.set(pos.x, floor.position.y + 0.02, pos.z); g.userData.t = 0; g.userData.ground = true;
    scene.add(g); waves.push(g);
  }

  /* ---------------- Camera presets ---------------- */
  const CAMS = {
    orbit: { r: 15, h: 4.2, fov: 38, auto: 0.08 },
    close: { r: 8.5, h: 1.6, fov: 42, auto: 0.04 },
    top: { r: 3, h: 17, fov: 40, auto: 0.05 },
    slow: { r: 13, h: 3, fov: 34, auto: 0.03 }
  };
  let camKey = "orbit", timeScale = 1, targetTimeScale = 1;
  const camState = { theta: 0.3, phiOffset: 0, r: 15, h: 4.2, fov: 38 };
  const drag = { active: false, moved: 0, x: 0, y: 0, vx: 0 };
  let shake = 0;
  const lookAt = new THREE.Vector3(0, 0.2, 0);

  document.querySelectorAll("[data-cam]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-cam]").forEach((x) => x.classList.toggle("is-on", x === b));
    camKey = b.dataset.cam; targetTimeScale = camKey === "slow" ? 0.22 : 1;
    A.Sound.whoosh();
  }));

  /* ---------------- Tools ---------------- */
  let tool = "launch", vortexT = 0, launches = 0;
  const mLaunch = document.getElementById("mLaunch"), mFrag = document.getElementById("mFrag"), mFps = document.getElementById("mFps");
  document.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.tool === "reset") { resetAll(); return; }
    document.querySelectorAll("[data-tool]").forEach((x) => x.classList.toggle("is-on", x === b));
    tool = b.dataset.tool;
    if (tool === "vortex") { vortexT = 2.6; A.Sound.hum(); shake = 0.15; }
  }));

  function resetAll() {
    tiles.forEach((t) => {
      const u = t.userData;
      if (u.mode === "broken") { t.visible = true; u.scale = 0.01; }
      u.mode = "returning"; u.vel.set(0, 0, 0);
    });
    fragments.splice(0).forEach((f) => scene.remove(f));
    A.Sound.whoosh(); A.toast("همه کاشی‌ها برگشتن سر جاشون");
  }

  /* ---------------- Info panel ---------------- */
  const info = document.getElementById("tileInfo");
  function showInfo(d) {
    info.innerHTML = `<small dir="ltr">${d.s}</small><strong>${d.fa}</strong><p>${d.d}</p>`;
    info.classList.remove("flash"); void info.offsetWidth; info.classList.add("flash");
  }

  /* ---------------- Raycasting ---------------- */
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(-9, -9);
  let hovered = null;
  function setMouse(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }
  function pick() {
    ray.setFromCamera(mouse, camera);
    const objs = [];
    tiles.forEach((t) => { if (t.visible) objs.push(t.userData.body, t.userData.face, t.userData.back); });
    objs.push(coreBox, shell);
    const hit = ray.intersectObjects(objs, false)[0];
    if (!hit) return null;
    if (hit.object === coreBox || hit.object === shell) return { core: true, point: hit.point };
    return { tile: hit.object.parent, point: hit.point };
  }

  function act(h) {
    if (h.core) {
      shockwave(core.position.clone(), theme.brass); shake = 0.35; A.Sound.crack();
      core.userData.pulse = 1;
      tiles.forEach((t) => {
        const u = t.userData; if (u.mode !== "orbit") return;
        const dir = t.position.clone().normalize();
        u.mode = "flying"; u.vel.copy(dir.multiplyScalar(7)).add(new THREE.Vector3(0, 5, 0));
        u.spin.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      });
      launches += tiles.length; mLaunch.textContent = launches;
      info.innerHTML = "<small>CORE</small><strong>APPXA free</strong><p>هسته کانال: همه‌چیز رایگان، همه‌چیز گلچین‌شده.</p>";
      return;
    }
    const t = h.tile, u = t.userData;
    showInfo(u.data);
    if (tool === "launch" && u.mode === "orbit") {
      const dir = t.position.clone().sub(camera.position).normalize();
      u.mode = "flying";
      u.vel.copy(dir.multiplyScalar(6)).add(new THREE.Vector3(0, 8, 0));
      u.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      launches++; mLaunch.textContent = launches;
      shockwave(t.position.clone(), theme[u.data.c]); shake = 0.18; A.Sound.whoosh();
    } else if (tool === "shatter" && u.mode !== "broken") {
      spawnFragments(t.position.clone(), u.data.c, 26);
      shockwave(t.position.clone(), theme.verm);
      t.visible = false; u.mode = "broken"; u.brokenT = 4.5; shake = 0.4; A.Sound.crack();
    } else if (tool === "vortex") {
      vortexT = 2.2; A.Sound.hum(); shake = 0.12;
    } else {
      A.Sound.blip(500, 0.08, "triangle");
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag.active = true; drag.moved = 0; drag.x = e.clientX; drag.y = e.clientY;
    canvas.classList.add("is-grabbing"); setMouse(e);
  });
  canvas.addEventListener("pointermove", (e) => {
    setMouse(e);
    if (drag.active) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.vx = dx * 0.005; camState.theta -= dx * 0.006;
      camState.phiOffset = Math.max(-2.5, Math.min(5, camState.phiOffset + dy * 0.02));
      drag.x = e.clientX; drag.y = e.clientY;
    }
  });
  const endDrag = (e) => {
    if (!drag.active) return;
    drag.active = false; canvas.classList.remove("is-grabbing");
    if (drag.moved < 6) { setMouse(e); const h = pick(); if (h) act(h); }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", () => { drag.active = false; canvas.classList.remove("is-grabbing"); });
  canvas.addEventListener("pointerleave", () => { mouse.set(-9, -9); });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    CAMS[camKey].r = Math.max(6, Math.min(24, CAMS[camKey].r + e.deltaY * 0.01));
  }, { passive: false });

  /* ---------------- Theme switch ---------------- */
  window.addEventListener("appxa:mode", (e) => {
    theme = THEMES[e.detail === "paper" ? "paper" : "carbon"];
    scene.fog.color.setHex(theme.fog);
    floorMat.color.setHex(theme.floor);
    coreMat.color.setHex(theme.core);
    brassMat.color.setHex(theme.brass);
    hemi.color.setHex(theme.hemiSky); hemi.groundColor.setHex(theme.hemiGround);
    ringLineMat.color.setHex(theme.pewter);
    pMat.color.setHex(theme.brass);
    coreGlow.color.setHex(theme.brass);
    shellWire.material.color.setHex(theme.brass);
    renderer.toneMappingExposure = theme.exposure;
    tiles.forEach((t) => {
      const u = t.userData; u.body.material.color.setHex(theme[u.data.c]);
      const fc = faceColors(u.data.c);
      const tex = labelTexture(u.data.t, u.data.s, fc.bg, fc.fg);
      u.face.material.map.dispose(); u.face.material.map = tex; u.face.material.needsUpdate = true;
      u.back.material = u.face.material;
    });
  });

  /* ---------------- Resize ---------------- */
  function resize() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(wrap); resize();

  /* ---------------- Visibility (pause offscreen) ---------------- */
  let visible = true;
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; }, { threshold: 0.01 }).observe(wrap);

  /* ---------------- Loop ---------------- */
  const clock = new THREE.Clock();
  let simT = 0, fpsAcc = 0, fpsN = 0;
  const tmp = new THREE.Vector3(), target = new THREE.Vector3();
  const G = -14;

  function tick() {
    requestAnimationFrame(tick);
    const rawDt = Math.min(clock.getDelta(), 0.05);
    fpsAcc += rawDt; fpsN++;
    if (fpsAcc > 0.5) { mFps.textContent = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; mFrag.textContent = fragments.length; }
    if (!visible) return;

    timeScale += (targetTimeScale - timeScale) * Math.min(1, rawDt * 4);
    const dt = rawDt * timeScale;
    simT += dt;

    /* camera */
    const C = CAMS[camKey];
    if (!drag.active) camState.theta += C.auto * dt + drag.vx * 0.9, drag.vx *= 0.92;
    camState.r += (C.r - camState.r) * Math.min(1, rawDt * 2.5);
    camState.h += (C.h + camState.phiOffset - camState.h) * Math.min(1, rawDt * 2.5);
    camState.fov += (C.fov - camState.fov) * Math.min(1, rawDt * 2.5);
    if (!drag.active) camState.phiOffset *= 0.985;
    camera.position.set(Math.sin(camState.theta) * camState.r, camState.h, Math.cos(camState.theta) * camState.r);
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake;
      shake = Math.max(0, shake - rawDt * 1.2);
    }
    camera.fov = camState.fov; camera.updateProjectionMatrix();
    camera.lookAt(lookAt);

    /* core */
    core.rotation.y += dt * 0.35;
    core.position.y = Math.sin(simT * 1.2) * 0.18;
    shell.rotation.y -= dt * 0.2; shellWire.rotation.x += dt * 0.1;
    const pulse = core.userData.pulse || 0;
    core.scale.setScalar(1 + pulse * 0.18);
    core.userData.pulse = Math.max(0, pulse - rawDt * 2);
    coreGlow.intensity = 1.2 + pulse * 3 + Math.sin(simT * 2) * 0.2;

    /* vortex */
    if (vortexT > 0) vortexT -= dt;
    const vort = vortexT > 0 ? Math.min(1, vortexT) : 0;

    /* hover detection */
    if (!drag.active) {
      const h = mouse.x > -2 ? pick() : null;
      const nh = h && h.tile ? h.tile : null;
      if (nh !== hovered) { hovered = nh; if (hovered) A.Sound.blip(1100, 0.03, "sine", 0.03); }
      canvas.style.cursor = h ? "pointer" : "grab";
    }

    /* tiles */
    tiles.forEach((t) => {
      const u = t.userData;
      u.angle += dt * (0.22 + vort * 2.2);
      const r = u.radius - vort * 2.6;
      target.set(Math.cos(u.angle) * r, u.baseY + Math.sin(simT * 1.5 + u.i) * 0.25 + vort * Math.sin(u.angle * 3) * 0.8, Math.sin(u.angle) * r);
      u.hover += ((hovered === t ? 1 : 0) - u.hover) * Math.min(1, rawDt * 8);

      if (u.mode === "orbit") {
        t.position.lerp(target, Math.min(1, dt * 4));
        tmp.copy(camera.position); tmp.y = t.position.y;
        t.lookAt(tmp);
        t.rotateY(Math.sin(simT + u.i) * 0.25 + vort * simT * 3);
        t.rotateX(Math.sin(simT * 0.7 + u.i) * 0.08);
        t.position.y += u.hover * 0.3;
        u.scale += (1 + u.hover * 0.15 - u.scale) * Math.min(1, rawDt * 8);
      } else if (u.mode === "flying") {
        u.vel.y += G * dt;
        t.position.addScaledVector(u.vel, dt);
        t.rotation.x += u.spin.x * dt; t.rotation.y += u.spin.y * dt; t.rotation.z += u.spin.z * dt;
        if (t.position.y < floor.position.y + 0.65) {
          t.position.y = floor.position.y + 0.65;
          u.vel.y *= -0.45; u.vel.x *= 0.7; u.vel.z *= 0.7; u.spin.multiplyScalar(0.6);
          if (Math.abs(u.vel.y) > 1.5) A.Sound.blip(180 + Math.random() * 80, 0.06, "triangle", 0.08);
          if (Math.abs(u.vel.y) < 0.9) { u.mode = "returning"; }
        }
        if (t.position.length() > 22) u.mode = "returning";
      } else if (u.mode === "returning") {
        t.position.lerp(target, Math.min(1, dt * 2.2));
        t.quaternion.slerp(new THREE.Quaternion(), Math.min(1, dt * 3));
        u.scale += (1 - u.scale) * Math.min(1, dt * 4);
        if (t.position.distanceTo(target) < 0.08) u.mode = "orbit";
      } else if (u.mode === "broken") {
        u.brokenT -= dt;
        if (u.brokenT <= 0) {
          t.visible = true; u.scale = 0.01; u.mode = "returning";
          t.position.copy(target).setY(target.y + 3);
          A.Sound.blip(760, 0.14, "sine", 0.08);
        }
      }
      t.scale.setScalar(Math.max(0.01, u.scale));
    });

    /* fragments */
    for (let i = fragments.length - 1; i >= 0; i--) {
      const f = fragments[i], u = f.userData;
      u.vel.y += G * dt; f.position.addScaledVector(u.vel, dt);
      f.rotation.x += u.spin.x * dt; f.rotation.y += u.spin.y * dt;
      if (f.position.y < floor.position.y + 0.1) { f.position.y = floor.position.y + 0.1; u.vel.y *= -0.35; u.vel.x *= 0.75; u.vel.z *= 0.75; u.spin.multiplyScalar(0.7); }
      u.life -= dt;
      if (u.life < 0.6) f.scale.setScalar(Math.max(0.001, u.life / 0.6));
      if (u.life <= 0) { scene.remove(f); fragments.splice(i, 1); }
    }

    /* waves */
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i]; w.userData.t += dt;
      const k = w.userData.t;
      w.scale.setScalar(1 + k * (w.userData.ground ? 14 : 9));
      w.material.opacity = Math.max(0, (w.userData.ground ? 0.6 : 0.85) * (1 - k / 0.9));
      if (k > 0.9) { scene.remove(w); w.geometry.dispose(); w.material.dispose(); waves.splice(i, 1); }
    }

    /* dust */
    const arr = pGeo.attributes.position.array;
    for (let i = 0; i < P; i++) {
      arr[i * 3 + 1] += Math.sin(simT + pSeed[i]) * 0.002 + 0.002;
      if (arr[i * 3 + 1] > 7) arr[i * 3 + 1] = -2;
      if (vort) {
        const x = arr[i * 3], z = arr[i * 3 + 2], a = 0.02 * vort;
        arr[i * 3] = x * Math.cos(a) - z * Math.sin(a); arr[i * 3 + 2] = x * Math.sin(a) + z * Math.cos(a);
      }
    }
    pGeo.attributes.position.needsUpdate = true;
    dust.rotation.y += dt * 0.02;
    ringGroup.rotation.y -= dt * 0.05;

    renderer.render(scene, camera);
  }
  tick();

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => window.dispatchEvent(new CustomEvent("appxa:mode", { detail: document.documentElement.dataset.mode })));
})();
