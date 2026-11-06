// audio.js - Pride Island procedural audio (pure Web Audio API, no files, no three.js)
// Exports createAudio() -> { start, update, playCheckpoint, playLap, playCrash, setHorn, setMuted, isMuted }

export function createAudio() {
  const MASTER_VOLUME = 0.8;

  let ctx = null;          // AudioContext (created lazily in start())
  let master = null;       // master gain (mute control)
  let compressor = null;   // dynamics compressor to avoid clipping
  let noiseBuffer = null;  // shared white-noise buffer
  let started = false;
  let muted = false;
  let lastCrashTime = -10;
  let ambientTimer = null;

  // Node bundles for the continuous layers
  const engine = {};
  const fx = {};
  let horn = null;

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  /** Soft-clipping curve for the engine waveshaper. */
  function makeDistortionCurve(amount) {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
    return curve;
  }

  /** Create the one shared white-noise buffer (3 seconds, mono). */
  function createNoiseBuffer() {
    const len = Math.floor(ctx.sampleRate * 3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Looping noise source starting at a random offset (decorrelates layers). */
  function makeNoiseSource() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    src.start(0, Math.random() * 2.5);
    return src;
  }

  function makeGain(value) {
    const g = ctx.createGain();
    g.gain.value = value;
    return g;
  }

  function makeFilter(type, freq, q) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q === undefined ? 0.707 : q;
    return f;
  }

  function makeOsc(type, freq) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start();
    return o;
  }

  /** One enveloped tone for UI jingles. */
  function tone(freq, when, dur, type, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    g.connect(master);
    o.start(when);
    o.stop(when + dur + 0.05);
  }

  /** One-shot noise burst through a filter with exponential decay. */
  function noiseBurst(when, dur, vol, type, f0, f1, q) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filt = makeFilter(type, f0, q);
    filt.frequency.setValueAtTime(f0, when);
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(when, Math.random() * 2);
    src.stop(when + dur + 0.05);
  }

  // ----------------------------------------------------------- engine layer
  function buildEngine() {
    // Three oscillators: saw + detuned square + saw sub-octave
    engine.osc1 = makeOsc('sawtooth', 60);
    engine.osc2 = makeOsc('square', 60);
    engine.osc3 = makeOsc('sawtooth', 30);
    engine.osc2.detune.value = 9;
    engine.osc3.detune.value = -6;

    const mix1 = makeGain(0.5);
    const mix2 = makeGain(0.28);
    const mix3 = makeGain(0.4);

    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(3.2);
    shaper.oversample = '2x';

    engine.lowpass = makeFilter('lowpass', 600, 1.4);

    // Firing roughness: amplitude wobble at the firing frequency
    engine.rough = makeGain(0.85);
    engine.lfo = makeOsc('sine', 27);
    engine.lfoDepth = makeGain(0.18);
    engine.lfo.connect(engine.lfoDepth);
    engine.lfoDepth.connect(engine.rough.gain);

    engine.gain = makeGain(0.0);

    engine.osc1.connect(mix1);
    engine.osc2.connect(mix2);
    engine.osc3.connect(mix3);
    mix1.connect(shaper);
    mix2.connect(shaper);
    mix3.connect(shaper);
    shaper.connect(engine.lowpass);
    engine.lowpass.connect(engine.rough);
    engine.rough.connect(engine.gain);
    engine.gain.connect(master);

    // Intake / mechanical rumble noise
    engine.noise = makeNoiseSource();
    engine.noiseFilter = makeFilter('lowpass', 300, 0.9);
    engine.noiseGain = makeGain(0.0);
    engine.noise.connect(engine.noiseFilter);
    engine.noiseFilter.connect(engine.noiseGain);
    engine.noiseGain.connect(master);
  }

  // --------------------------------------------------- tyre / wind / fx layers
  function buildEffects() {
    // Tyre squeal (asphalt): bandpassed noise with frequency wobble
    fx.squeal = makeNoiseSource();
    fx.squealFilter = makeFilter('bandpass', 1800, 7);
    fx.squealGain = makeGain(0.0);
    fx.squealLfo = makeOsc('sine', 9);
    fx.squealLfoDepth = makeGain(140);
    fx.squealLfo.connect(fx.squealLfoDepth);
    fx.squealLfoDepth.connect(fx.squealFilter.frequency);
    fx.squeal.connect(fx.squealFilter);
    fx.squealFilter.connect(fx.squealGain);
    fx.squealGain.connect(master);

    // Gritty off-road rumble (sand / grass / rock)
    fx.grit = makeNoiseSource();
    fx.gritFilter = makeFilter('lowpass', 600, 0.8);
    fx.gritGain = makeGain(0.0);
    fx.grit.connect(fx.gritFilter);
    fx.gritFilter.connect(fx.gritGain);
    fx.gritGain.connect(master);

    // Wind: rises with speed
    fx.wind = makeNoiseSource();
    fx.windFilter = makeFilter('bandpass', 500, 0.6);
    fx.windGain = makeGain(0.0);
    fx.wind.connect(fx.windFilter);
    fx.windFilter.connect(fx.windGain);
    fx.windGain.connect(master);

    // Water splash
    fx.water = makeNoiseSource();
    fx.waterBand = makeFilter('bandpass', 1100, 0.5);
    fx.waterHigh = makeFilter('highpass', 400, 0.7);
    fx.waterGain = makeGain(0.0);
    fx.waterLfo = makeOsc('sine', 3.3);
    fx.waterLfoDepth = makeGain(0.04);
    fx.waterLfo.connect(fx.waterLfoDepth);
    fx.waterLfoDepth.connect(fx.waterGain.gain);
    fx.water.connect(fx.waterBand);
    fx.waterBand.connect(fx.waterHigh);
    fx.waterHigh.connect(fx.waterGain);
    fx.waterGain.connect(master);

    // Nitro: whoosh + high hiss
    fx.nitro = makeNoiseSource();
    fx.nitroFilter = makeFilter('bandpass', 700, 0.9);
    fx.nitroGain = makeGain(0.0);
    fx.nitro.connect(fx.nitroFilter);
    fx.nitroFilter.connect(fx.nitroGain);
    fx.nitroGain.connect(master);

    fx.hiss = makeNoiseSource();
    fx.hissFilter = makeFilter('highpass', 5200, 0.7);
    fx.hissGain = makeGain(0.0);
    fx.hiss.connect(fx.hissFilter);
    fx.hissFilter.connect(fx.hissGain);
    fx.hissGain.connect(master);
  }

  // ------------------------------------------------------------ ambient layer
  function buildAmbient() {
    // Two slowly modulated lowpassed noise beds = ocean waves
    const defs = [
      { cutoff: 520, rate: 0.11, base: 0.055, depth: 0.045 },
      { cutoff: 900, rate: 0.071, base: 0.03, depth: 0.025 }
    ];
    fx.waves = defs.map((d) => {
      const src = makeNoiseSource();
      const filt = makeFilter('lowpass', d.cutoff, 0.5);
      const g = makeGain(d.base);
      const lfo = makeOsc('sine', d.rate);
      const depth = makeGain(d.depth);
      const filtDepth = makeGain(d.cutoff * 0.4);
      lfo.connect(depth);
      depth.connect(g.gain);
      lfo.connect(filtDepth);
      filtDepth.connect(filt.frequency);
      src.connect(filt);
      filt.connect(g);
      g.connect(master);
      return { src, filt, g, lfo };
    });
    scheduleAmbientBird(4000 + Math.random() * 4000);
  }

  /** A seagull-like "kee-ow" call: glissando with vibrato. */
  function seagullCall(when, pitch) {
    const notes = 2 + Math.floor(Math.random() * 3);
    let t = when;
    for (let i = 0; i < notes; i++) {
      const dur = 0.28 + Math.random() * 0.14;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      const f0 = pitch * (0.95 + Math.random() * 0.1);
      o.frequency.setValueAtTime(f0 * 0.8, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.25, t + dur * 0.3);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + dur);
      const vib = ctx.createOscillator();
      vib.frequency.value = 30 + Math.random() * 12;
      const vibDepth = makeGain(40);
      vib.connect(vibDepth);
      vibDepth.connect(o.frequency);
      const bp = makeFilter('bandpass', f0 * 1.2, 2.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(bp);
      bp.connect(g);
      g.connect(master);
      o.start(t);
      vib.start(t);
      o.stop(t + dur + 0.05);
      vib.stop(t + dur + 0.05);
      t += dur + 0.06 + Math.random() * 0.08;
    }
  }

  /** A quick tropical bird chirp sequence. */
  function birdChirp(when) {
    const count = 3 + Math.floor(Math.random() * 4);
    const base = 2800 + Math.random() * 1800;
    let t = when;
    for (let i = 0; i < count; i++) {
      const dur = 0.06 + Math.random() * 0.05;
      const o = ctx.createOscillator();
      o.type = 'sine';
      const up = Math.random() < 0.5;
      const f0 = base * (0.9 + Math.random() * 0.25);
      o.frequency.setValueAtTime(up ? f0 : f0 * 1.35, t);
      o.frequency.exponentialRampToValueAtTime(up ? f0 * 1.35 : f0, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.025, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + dur + 0.05);
      t += dur + 0.05 + Math.random() * 0.05;
    }
  }

  function scheduleAmbientBird(delayMs) {
    clearTimeout(ambientTimer);
    ambientTimer = setTimeout(() => {
      if (ctx && ctx.state === 'running' && !muted) {
        const now = ctx.currentTime + 0.05;
        if (Math.random() < 0.55) seagullCall(now, 1500 + Math.random() * 700);
        else birdChirp(now);
      }
      scheduleAmbientBird(3500 + Math.random() * 9000);
    }, delayMs);
  }

  // -------------------------------------------------------------- horn
  function hornOn() {
    if (horn) return;
    const t = ctx.currentTime;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'square';
    o2.type = 'square';
    o1.frequency.value = 402;
    o2.frequency.value = 503;
    const bp = makeFilter('bandpass', 850, 0.8);
    const lp = makeFilter('lowpass', 2400, 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.03);
    o1.connect(bp);
    o2.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    g.connect(master);
    o1.start(t);
    o2.start(t);
    horn = { o1, o2, g };
  }

  function hornOff() {
    if (!horn) return;
    const h = horn;
    horn = null;
    const t = ctx.currentTime;
    h.g.gain.cancelScheduledValues(t);
    h.g.gain.setValueAtTime(Math.max(h.g.gain.value, 0.0001), t);
    h.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    h.o1.stop(t + 0.1);
    h.o2.stop(t + 0.1);
    h.o2.onended = () => {
      try { h.g.disconnect(); } catch (e) { /* already disconnected */ }
    };
  }

  // ------------------------------------------------------------ public API
  function start() {
    if (!started) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
      } catch (e) {
        ctx = null;
        return;
      }
      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 18;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.2;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_VOLUME;
      master.connect(compressor);
      compressor.connect(ctx.destination);

      noiseBuffer = createNoiseBuffer();
      buildEngine();
      buildEffects();
      buildAmbient();
      started = true;
    }
    if (ctx && ctx.state === 'suspended') {
      const p = ctx.resume();
      if (p && p.catch) p.catch(() => {});
    }
  }

  function update(s) {
    if (!started || !ctx || !s) return;
    const t = ctx.currentTime;
    const rpm = clamp(num(s.rpm, 800), 800, 7000);
    const throttle = clamp(num(s.throttle, 0), 0, 1);
    const speedKmh = Math.abs(num(s.speedKmh, 0));
    const skid = clamp(num(s.skid, 0), 0, 1);
    const nitro = !!s.nitro;
    const surface = s.surface || 'road';
    const inWater = !!s.inWater;
    const rpmN = (rpm - 800) / 6200;
    const TC = 0.05;

    // --- Engine: firing frequency of a 4-cyl 4-stroke = rpm/60*2, scaled up
    // so the fundamental stays audible on small speakers.
    const fire = (rpm / 60) * 2 * 1.5;
    engine.osc1.frequency.setTargetAtTime(fire, t, 0.03);
    engine.osc2.frequency.setTargetAtTime(fire, t, 0.03);
    engine.osc3.frequency.setTargetAtTime(fire * 0.5, t, 0.03);
    engine.lfo.frequency.setTargetAtTime(fire * 0.5, t, 0.05);
    const cutoff = 380 + rpmN * 1500 + throttle * 1700 + (nitro ? 500 : 0);
    engine.lowpass.frequency.setTargetAtTime(cutoff, t, 0.06);
    engine.lowpass.Q.setTargetAtTime(1.0 + throttle * 1.6, t, 0.1);
    engine.lfoDepth.gain.setTargetAtTime(0.1 + (1 - throttle) * 0.16, t, 0.1);
    const engGain = (0.07 + throttle * 0.1 + rpmN * 0.05) * (inWater ? 0.6 : 1);
    engine.gain.gain.setTargetAtTime(engGain, t, TC);
    engine.noiseFilter.frequency.setTargetAtTime(220 + rpmN * 700 + throttle * 500, t, 0.08);
    engine.noiseGain.gain.setTargetAtTime(0.03 + throttle * 0.09 + rpmN * 0.03, t, 0.08);

    // --- Skid: squeal on tarmac, gritty rumble off-road
    const onRoad = surface === 'road';
    const slipping = skid > 0.05 && speedKmh > 5 && !inWater;
    const squealAmt = onRoad && slipping ? skid : 0;
    fx.squealGain.gain.setTargetAtTime(squealAmt * 0.16, t, 0.04);
    fx.squealFilter.frequency.setTargetAtTime(1300 + Math.min(speedKmh, 140) * 8 + skid * 300, t, 0.1);
    fx.squealLfo.frequency.setTargetAtTime(7 + skid * 6, t, 0.2);

    const offRoad = !onRoad && surface !== 'water' && !inWater;
    const gritAmt = offRoad ? clamp(speedKmh / 90, 0, 1) * 0.6 + (slipping ? skid * 0.4 : 0) : 0;
    fx.gritGain.gain.setTargetAtTime(gritAmt * 0.2, t, 0.06);
    const gritBase = surface === 'sand' ? 900 : surface === 'rock' ? 1400 : 650;
    fx.gritFilter.frequency.setTargetAtTime(gritBase + speedKmh * 4, t, 0.1);

    // --- Wind
    const windN = clamp(speedKmh / 160, 0, 1);
    fx.windGain.gain.setTargetAtTime(windN * windN * 0.17, t, 0.15);
    fx.windFilter.frequency.setTargetAtTime(350 + windN * 1300, t, 0.15);

    // --- Water splash
    const splash = inWater ? clamp(speedKmh / 40, 0.12, 1) : 0;
    fx.waterGain.gain.setTargetAtTime(splash * 0.2, t, 0.08);
    fx.waterBand.frequency.setTargetAtTime(800 + splash * 1400, t, 0.1);

    // --- Nitro
    fx.nitroGain.gain.setTargetAtTime(nitro ? 0.2 : 0, t, nitro ? 0.08 : 0.2);
    fx.nitroFilter.frequency.setTargetAtTime(nitro ? 900 + rpmN * 900 : 500, t, 0.15);
    fx.hissGain.gain.setTargetAtTime(nitro ? 0.06 : 0, t, nitro ? 0.06 : 0.15);
  }

  function playCheckpoint() {
    if (!started || !ctx) return;
    const t = ctx.currentTime + 0.01;
    // Pleasant two-note chime (E6 -> A6) with a soft octave shimmer
    tone(659.25, t, 0.45, 'sine', 0.2);
    tone(1318.5, t, 0.3, 'sine', 0.05);
    tone(880, t + 0.12, 0.6, 'sine', 0.22);
    tone(1760, t + 0.12, 0.4, 'sine', 0.05);
  }

  function playLap() {
    if (!started || !ctx) return;
    const t = ctx.currentTime + 0.01;
    // Rising major arpeggio C5 E5 G5 C6 E6
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      const last = i === notes.length - 1;
      tone(f, t + i * 0.09, last ? 0.9 : 0.35, 'triangle', 0.2);
      tone(f * 2, t + i * 0.09, last ? 0.6 : 0.2, 'sine', 0.045);
    });
  }

  function playCrash(intensity) {
    if (!started || !ctx) return;
    const t = ctx.currentTime;
    // Rate limit so continuous scraping does not machine-gun the sound
    if (t - lastCrashTime < 0.18) return;
    const k = clamp(num(intensity, 0.5), 0, 1);
    if (k < 0.02) return;
    lastCrashTime = t;

    // Low sine thump: pitch drop
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(40 + 110 * k, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.28);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 + 0.65 * k, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3 + 0.25 * k);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + 0.7);

    // Noise crunch
    noiseBurst(t, 0.12 + 0.35 * k, 0.15 + 0.5 * k, 'lowpass', 3500 + 2000 * k, 300, 0.8);
    // Metallic rattle for harder hits
    if (k > 0.45) noiseBurst(t + 0.02, 0.2, 0.12 * k, 'bandpass', 2600, 1200, 3);
  }

  function setHorn(on) {
    if (!started || !ctx) return;
    if (on) hornOn();
    else hornOff();
  }

  function setMuted(m) {
    muted = !!m;
    if (!started || !ctx) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(muted ? 0 : MASTER_VOLUME, t + 0.12);
  }

  function isMuted() {
    return muted;
  }

  return { start, update, playCheckpoint, playLap, playCrash, setHorn, setMuted, isMuted };
}
