/* ==========================================================
   APPXA free — UI logic (feed, lab, bento, generator, poll)
   ========================================================== */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const faDigits = (v) => String(v).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const store = {
    get(k, d) { try { const v = localStorage.getItem("appxa:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("appxa:" + k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------------- Toast ---------------- */
  let toastT;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("is-on"), 2200);
  }

  /* ---------------- Sound (Web Audio, synthesized) ---------------- */
  const Sound = {
    ctx: null, on: store.get("sound", false),
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    },
    blip(freq = 660, dur = 0.08, type = "sine", vol = 0.12) {
      if (!this.on) return;
      const c = this.ensure(); if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.5), c.currentTime + dur);
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g).connect(c.destination);
      o.start(); o.stop(c.currentTime + dur + 0.02);
    },
    whoosh() {
      if (!this.on) return;
      const c = this.ensure(); if (!c) return;
      const len = 0.45, buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = "bandpass";
      f.frequency.setValueAtTime(300, c.currentTime);
      f.frequency.exponentialRampToValueAtTime(2400, c.currentTime + len);
      const g = c.createGain(); g.gain.value = 0.25;
      src.connect(f).connect(g).connect(c.destination); src.start();
    },
    crack() {
      if (!this.on) return;
      const c = this.ensure(); if (!c) return;
      const len = 0.35, buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 900;
      const g = c.createGain(); g.gain.value = 0.35;
      src.connect(f).connect(g).connect(c.destination); src.start();
      this.blip(120, 0.25, "triangle", 0.2);
    },
    hum() {
      if (!this.on) return;
      const c = this.ensure(); if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(80, c.currentTime);
      o.frequency.linearRampToValueAtTime(220, c.currentTime + 0.6);
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.07, c.currentTime + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.7);
      const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700;
      o.connect(f).connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.75);
    }
  };
  window.APPXA = { Sound, toast, store, faDigits };

  const soundBtn = $("#soundToggle");
  soundBtn.setAttribute("aria-pressed", String(Sound.on));
  soundBtn.addEventListener("click", () => {
    Sound.on = !Sound.on;
    store.set("sound", Sound.on);
    soundBtn.setAttribute("aria-pressed", String(Sound.on));
    if (Sound.on) { Sound.ensure(); Sound.blip(880, 0.1); }
    toast(Sound.on ? "صدا روشن شد" : "صدا خاموش شد");
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("button, .chip, .seg label, .platforms span")) Sound.blip(720, 0.05, "sine", 0.05);
  });

  /* ---------------- Mode (carbon / paper) ---------------- */
  function setMode(m) {
    document.documentElement.dataset.mode = m;
    $$(".mode__btn").forEach((b) => b.classList.toggle("is-on", b.dataset.mode === m));
    $('meta[name="theme-color"]').setAttribute("content", m === "paper" ? "#FAF6F0" : "#0E0F12");
    store.set("mode", m);
    window.dispatchEvent(new CustomEvent("appxa:mode", { detail: m }));
    drawCard && drawCard();
  }
  $$(".mode__btn").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

  /* ---------------- Mobile nav ---------------- */
  const burger = $("#burger"), links = $(".nav__links");
  burger.addEventListener("click", () => {
    const o = links.classList.toggle("is-open");
    burger.classList.toggle("is-open", o);
  });
  $$(".nav__links > a").forEach((a) => a.addEventListener("click", () => {
    links.classList.remove("is-open"); burger.classList.remove("is-open");
  }));

  /* Active section highlight */
  const navMap = new Map($$(".nav__links > a").map((a) => [a.getAttribute("href").slice(1), a]));
  const secObs = new IntersectionObserver((ents) => {
    ents.forEach((en) => {
      if (en.isIntersecting) {
        navMap.forEach((a) => a.classList.remove("is-active"));
        const a = navMap.get(en.target.id); a && a.classList.add("is-active");
      }
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  navMap.forEach((_, id) => { const s = document.getElementById(id); s && secObs.observe(s); });

  /* ---------------- Counters ---------------- */
  function animateCount(el) {
    const target = +el.dataset.count; if (!target) return;
    const t0 = performance.now(), dur = 1600;
    (function step(t) {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt(Math.round(target * e));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }
  const cObs = new IntersectionObserver((ents) => ents.forEach((en) => {
    if (en.isIntersecting) { animateCount(en.target); cObs.unobserve(en.target); }
  }), { threshold: 0.4 });
  $$(".hero__stats [data-count]").forEach((el) => cObs.observe(el));

  /* ---------------- FEED DATA (from recent channel posts) ---------------- */
  const POSTS = [
    {
      id: "agent-desktop", date: "۱ روز پیش", order: 9, tags: ["ai", "github"], up: 12, down: 1, feature: true,
      title: 'پروژه ترند امروز: <span class="en">Vercel agent-desktop</span>',
      body: "اگه می‌خوای ایجنتت صفحه دسکتاپ رو ببینه: به‌جای گرفتن اسکرین‌شات، جای کلیدها و دکمه‌ها رو تشخیص می‌ده و خودش کامپیوتر رو کنترل می‌کنه. Computer-use CLI برای ایجنت‌های هوش مصنوعی.",
      url: "https://github.com/vercel-labs/agent-desktop"
    },
    {
      id: "zendot", date: "۱ روز پیش", order: 8, tags: ["github"], up: 18, down: 0,
      title: "ترندهای گیت‌هاب در یک سایت",
      body: "سایتی که ترندها و پروژه‌های برتر گیت‌هاب رو مرتب جمع می‌کنه؛ برای اینکه از هیچ ریپوی داغی جا نمونی.",
      url: "https://zendot.org/en"
    },
    {
      id: "mirrorsay", date: "۲ روز پیش", order: 7, tags: ["learn", "ai"], up: 29, down: 0,
      title: 'تقویت Speaking با <span class="en">MirrorSay</span>',
      body: "یه جمله می‌گی، مثل آینه تلفظ درستش رو برمی‌گردونه. بگو، بشنو یه نیتیو چطور می‌گه، دوباره بگو. اندروید و آیفون، رایگان.",
      url: "https://mirrorsay.com/en/"
    },
    {
      id: "word-atlas", date: "۳ روز پیش", order: 6, tags: ["learn", "github"], up: 55, down: 2, feature: true,
      title: 'Word Atlas فارسی: ۷۰۰۰ واژه انگلیسی',
      body: "فورک فارسی‌شده یه پروژه چینی که ایجنت حدود ۴ ساعته فارسی‌سازیش کرد. پیشرفتت لوکال تو مرورگر می‌مونه، بک‌آپ برای انتقال به دستگاه دیگه داره و نسخه آفلاین حدود ۷۰۰ مگه.",
      url: "https://appxa.github.io/word-atlas/"
    },
    {
      id: "discord-rust", date: "۴ روز پیش", order: 5, tags: ["news"], up: 38, down: 1,
      title: "دیسکورد از Electron به Rust کوچ می‌کنه",
      body: "اپ دسکتاپ دیسکورد بازنویسی می‌شه تا رم کمتری بخوره. Electron عملاً یه مرورگر داخل برنامه‌ست؛ با Rust انتظار می‌ره عملکرد خیلی بهتر بشه.",
      url: "https://t.me/s/APPXA"
    },
    {
      id: "discord-oil", date: "۴ روز پیش", order: 4, tags: ["news"], up: 64, down: 0,
      title: "«انگار با نفت کار می‌کنه»",
      body: "خلاصه نظر کانال درباره دیسکورد فعلی: سنگین‌تر از این نداریم. محبوب‌ترین پست هفته.",
      url: "https://t.me/s/APPXA"
    },
    {
      id: "geo-sleuth", date: "۵ روز پیش", order: 3, tags: ["osint", "ai", "github"], up: 14, down: 2,
      title: 'پیدا کردن محل هر عکس با <span class="en">geo-sleuth</span>',
      body: "شکل کوه‌ها، فاصله ستون‌های پل، سایه‌ها و درخت‌ها رو سرنخ می‌کنه، با OpenStreetMap مقایسه می‌کنه و مختصات و جهت دوربین رو با شواهد می‌ده. با Claude Code، Codex، Cursor و Gemini CLI.",
      url: "https://github.com/Oldcircle/geo-sleuth"
    },
    {
      id: "vultr", date: "۶ روز پیش", order: 2, tags: ["vps"], up: 21, down: 3,
      title: "۳۰۰ دلار اعتبار VPS رایگان برای یک ماه",
      body: "پروموی Vultr برای تست سرور. هشدار: نیاز به ثبت کارت واقعی داره، پس قبلش شرایط رو بخون.",
      url: "https://www.vultr.com/promo/try300"
    },
    {
      id: "agent-team", date: "۱ هفته پیش", order: 1, tags: ["ai"], up: 17, down: 1,
      title: "یک تیم از ایجنت‌ها",
      body: "به‌جای یه ایجنت تنها، چندتا ایجنت با نقش‌های جدا کنار هم کار می‌کنن؛ یکی برنامه می‌ریزه، یکی کد می‌زنه، یکی بررسی می‌کنه.",
      url: "https://t.me/s/APPXA"
    }
  ];
  const myReacts = store.get("reacts", {});

  const feedState = { tag: "all", q: "", sort: "new" };
  const feedGrid = $("#feedGrid"), feedEmpty = $("#feedEmpty");

  function postScore(p) {
    const r = myReacts[p.id];
    return { up: p.up + (r === "up" ? 1 : 0), down: p.down + (r === "down" ? 1 : 0) };
  }
  function stripHtml(s) { return s.replace(/<[^>]+>/g, ""); }

  function renderFeed() {
    const q = feedState.q.trim().toLowerCase();
    let list = POSTS.filter((p) =>
      (feedState.tag === "all" || p.tags.includes(feedState.tag)) &&
      (!q || (stripHtml(p.title) + " " + p.body + " " + p.tags.join(" ")).toLowerCase().includes(q))
    );
    list = list.slice().sort((a, b) =>
      feedState.sort === "top" ? postScore(b).up - postScore(a).up : b.order - a.order
    );
    feedGrid.innerHTML = "";
    feedEmpty.hidden = list.length > 0;
    list.forEach((p, i) => {
      const s = postScore(p);
      const el = document.createElement("article");
      el.className = "post" + (p.feature && feedState.tag === "all" && !q ? " post--feature" : "");
      el.style.animationDelay = i * 50 + "ms";
      el.innerHTML = `
        <div class="post__top">
          <div class="post__tags">${p.tags.map((t) => `<span class="post__tag">#${t}</span>`).join("")}</div>
          <span class="post__date">${p.date}</span>
        </div>
        <h3>${p.title}</h3>
        <p>${p.body}</p>
        <div class="post__foot">
          <div class="react">
            <button data-r="up" data-id="${p.id}" class="${myReacts[p.id] === "up" ? "is-on" : ""}" aria-label="پسندیدم">👍 <span class="num">${s.up}</span></button>
            <button data-r="down" data-id="${p.id}" class="${myReacts[p.id] === "down" ? "is-on" : ""}" aria-label="نپسندیدم">👎 <span class="num">${s.down}</span></button>
          </div>
          <a class="post__link" href="${p.url}" target="_blank" rel="noopener">لینک
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </a>
        </div>`;
      feedGrid.appendChild(el);
    });
  }
  feedGrid.addEventListener("click", (e) => {
    const b = e.target.closest(".react button"); if (!b) return;
    const id = b.dataset.id, r = b.dataset.r;
    myReacts[id] = myReacts[id] === r ? undefined : r;
    if (!myReacts[id]) delete myReacts[id];
    store.set("reacts", myReacts);
    renderFeed(); renderBoard();
  });
  $$("#filters .chip").forEach((c) => c.addEventListener("click", () => {
    $$("#filters .chip").forEach((x) => x.classList.toggle("is-on", x === c));
    feedState.tag = c.dataset.tag; renderFeed();
  }));
  $$(".sort .chip").forEach((c) => c.addEventListener("click", () => {
    $$(".sort .chip").forEach((x) => x.classList.toggle("is-on", x === c));
    feedState.sort = c.dataset.sort; renderFeed();
  }));
  let qT;
  $("#feedSearch").addEventListener("input", (e) => {
    clearTimeout(qT); qT = setTimeout(() => { feedState.q = e.target.value; renderFeed(); }, 140);
  });

  /* ---------------- Leaderboard ---------------- */
  function renderBoard() {
    const top = POSTS.slice().sort((a, b) => postScore(b).up - postScore(a).up).slice(0, 5);
    $("#board").innerHTML = top.map((p) =>
      `<li><a href="${p.url}" target="_blank" rel="noopener">${stripHtml(p.title)}</a><span class="num">👍 ${postScore(p).up}</span></li>`
    ).join("");
  }

  /* ---------------- LAB: App finder ---------------- */
  const TOOLS = [
    { name: '<span class="en">agent-desktop</span>', plain: "agent-desktop", need: ["ai", "dev"], plat: ["windows", "mac", "linux"], skill: 4, priv: 70, free: true, url: "https://github.com/vercel-labs/agent-desktop", why: "ایجنت رو قادر می‌کنه کامپیوتر رو کنترل کنه" },
    { name: '<span class="en">geo-sleuth</span>', plain: "geo-sleuth", need: ["osint", "ai"], plat: ["windows", "mac", "linux"], skill: 4, priv: 60, free: true, url: "https://github.com/Oldcircle/geo-sleuth", why: "مکان عکس رو با OpenStreetMap پیدا می‌کنه" },
    { name: '<span class="en">MirrorSay</span>', plain: "MirrorSay", need: ["learn", "ai"], plat: ["android", "ios", "web"], skill: 1, priv: 30, free: true, url: "https://mirrorsay.com/en/", why: "تمرین تلفظ مثل آینه، بدون دردسر" },
    { name: "Word Atlas فارسی", plain: "Word Atlas", need: ["learn"], plat: ["web", "android", "ios", "windows", "linux", "mac"], skill: 1, priv: 95, free: true, url: "https://appxa.github.io/word-atlas/", why: "۷۰۰۰ واژه، پیشرفت لوکال و نسخه آفلاین" },
    { name: '<span class="en">zendot</span> ترندیاب', plain: "zendot", need: ["dev", "ai"], plat: ["web"], skill: 2, priv: 40, free: true, url: "https://zendot.org/en", why: "ترندهای روز گیت‌هاب در یک نگاه" },
    { name: 'Vultr <span class="en">$300</span>', plain: "Vultr", need: ["server", "dev"], plat: ["web"], skill: 3, priv: 30, free: false, url: "https://www.vultr.com/promo/try300", why: "یک ماه VPS؛ ثبت کارت واقعی لازمه" },
    { name: "تیم ایجنت‌ها", plain: "Agent team", need: ["ai", "dev"], plat: ["windows", "mac", "linux", "web"], skill: 5, priv: 55, free: true, url: "https://t.me/s/APPXA", why: "چند ایجنت با نقش‌های جدا روی یک پروژه" },
    { name: "GitHub Pages + Cloudflare", plain: "Pages", need: ["server", "dev"], plat: ["web"], skill: 3, priv: 50, free: true, url: "https://github.com/appxa/word-atlas", why: "همون روشی که APPXA لینک دائمی ساخت" }
  ];
  const skillNames = ["", "تازه‌کار", "آشنا", "متوسط", "حرفه‌ای", "هکر"];

  function labCompute() {
    const plats = $$("#labPlatform input:checked").map((i) => i.value);
    const need = ($("#labNeed input:checked") || {}).value || "ai";
    const skill = +$("#rSkill").value, priv = +$("#rPriv").value, onlyFree = $("#tFree").checked;
    $("#oSkill").textContent = skillNames[skill];
    $("#oPriv").textContent = faDigits(priv) + "٪";

    const scored = TOOLS.map((t) => {
      let s = 0;
      if (t.need[0] === need) s += 45; else if (t.need.includes(need)) s += 28;
      const pHit = t.plat.filter((p) => plats.includes(p)).length;
      s += pHit ? Math.min(25, 12 + pHit * 5) : 0;
      s += Math.max(0, 15 - Math.abs(t.skill - skill) * 5);
      s += Math.max(0, 15 - Math.abs(t.priv - priv) / 6);
      if (onlyFree && !t.free) s -= 40;
      if (!plats.length) s -= 10;
      return { t, s: Math.max(0, Math.min(100, Math.round(s))) };
    }).sort((a, b) => b.s - a.s).slice(0, 4);

    const best = scored[0] ? scored[0].s : 0;
    const C = 314.16;
    $("#gaugeFg").style.strokeDashoffset = String(C - (C * best) / 100);
    const bEl = $("#labBest"), from = +bEl.textContent || 0, t0 = performance.now();
    (function step(t) {
      const p = Math.min(1, (t - t0) / 600);
      bEl.textContent = Math.round(from + (best - from) * p);
      if (p < 1) requestAnimationFrame(step);
    })(t0);

    $("#labSummary").textContent = !plats.length
      ? "حداقل یه دستگاه انتخاب کن تا پیشنهادها دقیق‌تر بشه."
      : best >= 80 ? `«${scored[0].t.plain}» دقیقاً همون چیزیه که لازم داری.`
      : best >= 55 ? "چندتا گزینه خوب پیدا شد؛ مقایسه‌شون کن."
      : "تطابق کامل نیست؛ فیلترها رو کمی شل‌تر کن.";

    $("#labList").innerHTML = scored.map((x, i) => `
      <li class="lab__item" style="animation-delay:${i * 60}ms">
        <span class="lab__rank">${faDigits(String(i + 1).padStart(2, "0"))}</span>
        <a href="${x.t.url}" target="_blank" rel="noopener">
          <span class="lab__name">${x.t.name}</span>
          <span class="lab__why">${x.t.why}</span>
        </a>
        <div><div class="lab__bar"><i style="width:${x.s}%"></i></div><div class="lab__score">${x.s}%</div></div>
      </li>`).join("");
  }
  $("#labForm").addEventListener("input", labCompute);
  $("#labForm").addEventListener("change", labCompute);

  /* ---------------- BENTO tabs & platforms ---------------- */
  $$("[data-tabs]").forEach((card) => {
    const tabs = $$(".tab", card), panes = $$(".pane", card);
    tabs.forEach((t) => t.addEventListener("click", () => {
      tabs.forEach((x) => x.classList.toggle("is-on", x === t));
      panes.forEach((p, i) => p.classList.toggle("is-on", i === +t.dataset.tab));
    }));
  });
  const PLAT = {
    android: "اپ‌های رایگان و ماد‌نشده، ابزارهای هوش مصنوعی موبایل و اپ‌های آموزش زبان مثل MirrorSay.",
    ios: "جایگزین‌های رایگان اپ‌های پولی آیفون و وب‌اپ‌هایی که بدون اپ‌استور کار می‌کنن.",
    windows: "ابزارهای سبک، ایجنت‌های دسکتاپ و خبرهایی مثل کوچ دیسکورد به Rust.",
    linux: "CLIها، پروژه‌های اوپن‌سورس و اسکریپت‌هایی که روی سرور هم اجرا می‌شن.",
    telegram: "ربات‌ها، ترفندهای تلگرام و خود کانال با ۲۹ هزار عضو.",
    github: "ترند روز، ریپوهای فارسی‌شده و لینک مستقیم ریلیزها.",
    web: "سایت‌هایی مثل zendot و Word Atlas که فقط یه مرورگر لازم دارن."
  };
  $$(".platforms span").forEach((s) => s.addEventListener("click", () => {
    $$(".platforms span").forEach((x) => x.classList.toggle("is-on", x === s));
    const d = $("#platDesc"); d.style.opacity = 0;
    setTimeout(() => { d.textContent = PLAT[s.dataset.p]; d.style.opacity = 1; }, 180);
  }));

  /* ---------------- CARD GENERATOR (canvas) ---------------- */
  const cv = $("#gCanvas"), cx = cv.getContext("2d");
  const COLORS = {
    brass: { a: "#D4A359", ink: "#1a1408" },
    vermilion: { a: "#E05A47", ink: "#1c0c09" },
    ivory: { a: "#F4F1EA", ink: "#161513" },
    sage: { a: "#7E9C84", ink: "#0f1711" }
  };
  let gColor = "brass";
  let memberNo = store.get("memberNo", 0) || Math.floor(1000 + Math.random() * 28178);
  store.set("memberNo", memberNo);

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function wrap(c, text, x, y, maxW, lh) {
    const words = text.split(" "); let line = "", lines = [];
    words.forEach((w) => {
      const t = line ? line + " " + w : w;
      if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    lines.forEach((l, i) => c.fillText(l, x, y + i * lh));
    return lines.length;
  }

  function drawCard() {
    if (!cx) return;
    const W = cv.width, H = cv.height, col = COLORS[gColor];
    const paper = document.documentElement.dataset.mode === "paper";
    const bg = paper ? "#FAF6F0" : "#0E0F12", surf = paper ? "#EFE8DC" : "#17191E";
    const ink = paper ? "#161513" : "#F4F1EA", ink2 = paper ? "#5C574F" : "#9E9A90";
    const name = ($("#gName").value || "کاربر APPXA").trim();
    const plat = $("#gPlat").value, motto = $("#gMotto").value;

    cx.clearRect(0, 0, W, H);
    cx.fillStyle = bg; cx.fillRect(0, 0, W, H);

    // grid
    cx.strokeStyle = paper ? "rgba(22,21,19,.06)" : "rgba(244,241,234,.05)"; cx.lineWidth = 2;
    for (let x = 0; x <= W; x += 60) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke(); }
    for (let y = 0; y <= H; y += 60) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }

    // big orbit
    cx.save(); cx.translate(W * 0.72, H * 0.33);
    for (let i = 0; i < 4; i++) {
      cx.beginPath(); cx.arc(0, 0, 120 + i * 70, 0, Math.PI * 2);
      cx.strokeStyle = i === 0 ? col.a : ink2; cx.globalAlpha = i === 0 ? 0.9 : 0.25;
      cx.setLineDash(i === 0 ? [] : [6, 14]); cx.lineWidth = i === 0 ? 6 : 2; cx.stroke();
    }
    cx.setLineDash([]); cx.globalAlpha = 1;
    const tiles = ["AI", "iOS", "Git", "TG", "Lnx", "Win"];
    tiles.forEach((t, i) => {
      const a = (i / tiles.length) * Math.PI * 2 - 0.5, r = 260;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      roundRect(cx, px - 42, py - 42, 84, 84, 20);
      cx.fillStyle = i % 2 ? surf : col.a; cx.fill();
      cx.fillStyle = i % 2 ? ink : col.ink;
      cx.font = "700 26px 'Bricolage Grotesque', sans-serif"; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillText(t, px, py + 2);
    });
    // core A mark
    roundRect(cx, -80, -80, 160, 160, 40); cx.fillStyle = surf; cx.fill();
    cx.strokeStyle = col.a; cx.lineWidth = 14; cx.lineCap = "round"; cx.lineJoin = "round";
    cx.beginPath(); cx.moveTo(-40, 45); cx.lineTo(0, -45); cx.lineTo(40, 45); cx.moveTo(-25, 15); cx.lineTo(25, 15); cx.stroke();
    cx.restore();

    // header
    cx.textBaseline = "alphabetic";
    cx.direction = "ltr"; cx.textAlign = "left";
    cx.fillStyle = ink; cx.font = "800 58px 'Bricolage Grotesque', sans-serif";
    cx.fillText("APPXA", 80, 120);
    const brandW = cx.measureText("APPXA").width;
    cx.fillStyle = ink2; cx.font = "500 40px 'Bricolage Grotesque', sans-serif";
    cx.fillText("free", 80 + brandW + 14, 120);
    cx.font = "600 26px 'JetBrains Mono', monospace"; cx.fillStyle = col.a;
    cx.fillText("MEMBER CARD", 80, 170);

    // body (RTL)
    cx.direction = "rtl"; cx.textAlign = "right";
    const R = W - 80;
    cx.fillStyle = ink2; cx.font = "600 34px Vazirmatn, sans-serif";
    cx.fillText("عضو رسمی گلچین‌های رایگان", R, 820);
    cx.fillStyle = ink; cx.font = "900 108px Vazirmatn, sans-serif";
    let nm = name; while (cx.measureText(nm).width > W - 160 && nm.length > 2) nm = nm.slice(0, -1);
    if (nm !== name) nm += "…";
    cx.fillText(nm, R, 950);

    cx.fillStyle = col.a; cx.font = "700 52px Lalezar, Vazirmatn, sans-serif";
    wrap(cx, "«" + motto + "»", R, 1050, W - 160, 70);

    // footer band
    roundRect(cx, 60, H - 210, W - 120, 150, 36); cx.fillStyle = surf; cx.fill();
    cx.fillStyle = ink2; cx.font = "600 26px Vazirmatn, sans-serif";
    cx.fillText("پلتفرم اصلی", R - 30, H - 150);
    cx.fillStyle = ink; cx.font = "700 44px 'Bricolage Grotesque', sans-serif";
    cx.direction = "ltr"; cx.textAlign = "right"; cx.fillText(plat, R - 30, H - 95);
    cx.textAlign = "left";
    cx.fillStyle = ink2; cx.font = "600 24px 'JetBrains Mono', monospace";
    cx.fillText("NO.", 100, H - 150);
    cx.fillStyle = col.a; cx.font = "600 48px 'JetBrains Mono', monospace";
    cx.fillText("#" + String(memberNo).padStart(5, "0"), 100, H - 95);
    cx.fillStyle = ink2; cx.font = "500 24px 'JetBrains Mono', monospace";
    cx.textAlign = "center"; cx.fillText("t.me/APPXA", W / 2, H - 22);
    cx.direction = "rtl";
  }

  ["input", "change"].forEach((ev) => $("#genForm").addEventListener(ev, drawCard));
  $$("#gColor .sw").forEach((s) => s.addEventListener("click", () => {
    $$("#gColor .sw").forEach((x) => x.classList.toggle("is-on", x === s));
    gColor = s.dataset.c; drawCard();
  }));
  $("#gShuffle").addEventListener("click", () => {
    memberNo = Math.floor(1000 + Math.random() * 28178); store.set("memberNo", memberNo); drawCard();
    Sound.blip(520, 0.12, "triangle");
  });
  $("#gDownload").addEventListener("click", () => {
    drawCard();
    cv.toBlob((b) => {
      if (!b) { toast("دانلود نشد؛ دوباره امتحان کن"); return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b); a.download = "appxa-member-" + memberNo + ".png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast("کارتت دانلود شد ✓"); Sound.blip(990, 0.15);
    }, "image/png");
  });

  /* ---------------- POLL ---------------- */
  const POLL = [
    { id: "ai", t: "ابزارهای هوش مصنوعی و ایجنت", base: 412 },
    { id: "gh", t: "پروژه‌های ترند گیت‌هاب", base: 287 },
    { id: "mob", t: "اپ‌های رایگان اندروید و iOS", base: 336 },
    { id: "learn", t: "آموزش زبان و یادگیری", base: 158 },
    { id: "vps", t: "سرور، VPS و هاست رایگان", base: 201 }
  ];
  let myVote = store.get("vote", null);
  function renderPoll() {
    const tot = POLL.reduce((s, o) => s + o.base + (myVote === o.id ? 1 : 0), 0);
    $("#pollTotal").textContent = fmt(tot);
    $("#pollOpts").innerHTML = POLL.map((o) => {
      const v = o.base + (myVote === o.id ? 1 : 0), pct = Math.round((v / tot) * 100);
      return `<button class="poll__opt ${myVote === o.id ? "is-mine" : ""}" data-id="${o.id}">
        <i style="width:${myVote ? pct : 0}%"></i><span>${o.t}</span><b>${myVote ? pct + "%" : ""}</b></button>`;
    }).join("");
  }
  $("#pollOpts").addEventListener("click", (e) => {
    const b = e.target.closest(".poll__opt"); if (!b) return;
    myVote = myVote === b.dataset.id ? null : b.dataset.id;
    store.set("vote", myVote); renderPoll();
    if (myVote) toast("رأیت ثبت شد");
  });

  /* ---------------- INIT ---------------- */
  renderFeed(); renderBoard(); labCompute(); renderPoll();
  setMode(store.get("mode", "carbon"));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawCard);
  setTimeout(drawCard, 1200);
})();
