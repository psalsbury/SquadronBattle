// Shared sound kit for the salsbury.uk games: everything is synthesised, nothing to download.
// SukSound(storageKey) returns { voice, hiss, chord, sample, prime, now(), graph(), muted, setMuted(m), toggle(), unlock(), bindMute(buttons, onChange) }.
// Sounds go through a compressor (so layers can be loud without clipping) with a little generated reverb for air.
// The audio context only starts after a tap or key press (browsers insist), and stays silent while muted.
(() => {
  let actx = null, bus = null, verb = null, noiseBuf = null;
  const shapers = {};
  function ctx() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
      const comp = actx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = .003; comp.release.value = .2;
      const master = actx.createGain(); master.gain.value = 1;
      comp.connect(master).connect(actx.destination);
      bus = actx.createGain(); bus.connect(comp);
      const len = Math.floor(actx.sampleRate * .9), ir = actx.createBuffer(2, len, actx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
      const conv = actx.createConvolver(); conv.buffer = ir;
      verb = actx.createGain(); verb.gain.value = .2; verb.connect(conv).connect(comp);
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function shaper(k) {
    if (!shapers[k]) { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } shapers[k] = c; }
    const w = actx.createWaveShaper(); w.curve = shapers[k]; w.oversample = '2x'; return w;
  }
  // o.dest: play into this node instead of the main bus (a separate chain built with graph(), like a music mix).
  // o.send: an extra node to feed (an effect built with graph(), such as an echo), as well as the main bus.
  function out(g, o) { g.connect(o.dest || bus); if (o.wet) { const w = actx.createGain(); w.gain.value = o.wet; g.connect(w).connect(verb); } if (o.send) g.connect(o.send); }

  window.SukSound = function (key) {
    let muted = false;
    try { muted = localStorage.getItem(key) === '1'; } catch {}
    const live = () => !muted && ctx();
    // One oscillator: type, start and end pitch, length, volume. o: delay, sweep, attack, hold, lp/lp1/q, vib/vibDepth, detune, drive, wet, send, dest
    function voice(type, f0, f1, dur, vol, o = {}) {
      if (!live()) return;
      try {
        const t = actx.currentTime + (o.delay || 0), osc = actx.createOscillator(), g = actx.createGain();
        osc.type = type; osc.detune.value = o.detune || 0; osc.frequency.setValueAtTime(f0, t);
        if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + (o.sweep || dur));
        if (o.vib) { const l = actx.createOscillator(), lg = actx.createGain(); l.frequency.value = o.vib; lg.gain.value = o.vibDepth || 10; l.connect(lg).connect(osc.frequency); l.start(t); l.stop(t + dur + .05); }
        const atk = o.attack || .005;
        g.gain.value = 0; // silent until the note starts (a distortion stage would otherwise leak a little offset)
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + atk);
        if (o.hold) g.gain.setValueAtTime(vol, t + atk + o.hold);
        g.gain.exponentialRampToValueAtTime(.0001, t + dur);
        let node = osc;
        if (o.lp) { const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(o.lp, t); if (o.lp1) f.frequency.exponentialRampToValueAtTime(o.lp1, t + dur); f.Q.value = o.q || .8; node.connect(f); node = f; }
        if (o.drive) node = node.connect(shaper(o.drive));
        node.connect(g); out(g, o); osc.start(t); osc.stop(t + dur + .05);
      } catch {}
    }
    // Filtered noise: length, volume, filter type (lowpass/highpass/bandpass), filter sweep f0 -> f1. o: delay, q, attack, drive, wet, send, dest
    function hiss(dur, vol, type, f0, f1, o = {}) {
      if (!live()) return;
      try {
        const t = actx.currentTime + (o.delay || 0), s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
        s.buffer = noiseBuf; s.loop = true; f.type = type; f.Q.value = o.q || .9;
        f.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
        const atk = o.attack || .003;
        g.gain.value = 0;
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + atk); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
        let node = s.connect(f); if (o.drive) node = node.connect(shaper(o.drive));
        node.connect(g); out(g, o); s.start(t, Math.random() * .5); s.stop(t + dur + .05);
      } catch {}
    }
    // A sound worked out once into a buffer (build(actx) returns an AudioBuffer), kept by key, then played like a recording.
    // o: rate (playback speed, also shifts the pitch), delay, lp (low-pass Hz), wet
    const bufs = {};
    function sample(key, build, vol, o = {}) {
      if (!live()) return;
      try {
        const b = bufs[key] || (bufs[key] = build(actx));
        const t = actx.currentTime + (o.delay || 0), s = actx.createBufferSource(), g = actx.createGain();
        s.buffer = b; s.playbackRate.value = o.rate || 1; g.gain.value = vol;
        let node = s;
        if (o.lp) { const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
        node.connect(g); out(g, o); s.start(t);
      } catch {}
    }
    // Builds the buffers ahead of time (call from a tap, so the first explosion doesn't stutter).
    const prime = (key, build) => { if (live() && !bufs[key]) try { bufs[key] = build(actx); } catch {} };
    const chord = (fs, dur, vol, o = {}) => fs.forEach((f, i) => voice(o.type || 'triangle', f, f, dur, vol, { ...o, delay: (o.delay || 0) + i * (o.gap || 0) }));
    const btns = [];
    const kit = {
      voice, hiss, chord, sample, prime,
      // The audio clock (delays are measured from it), and the context and main bus for building effects. Null/0 while silent.
      now: () => (live() ? actx.currentTime : 0),
      graph: () => (live() ? { ctx: actx, bus } : null),
      get muted() { return muted; },
      setMuted(m) {
        muted = !!m; try { localStorage.setItem(key, muted ? '1' : '0'); } catch {}
        btns.forEach(b => { b.textContent = muted ? '🔇' : '🔊'; b.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on'); });
        if (!muted) { ctx(); voice('triangle', 900, 600, .05, .2); }
      },
      toggle() { kit.setMuted(!muted); return muted; },
      unlock() { if (!muted) ctx(); },
      // Turns buttons into 🔊/🔇 toggles.
      bindMute(list, onChange) {
        for (const b of list) { if (!b) continue; btns.push(b); b.addEventListener('click', () => { kit.toggle(); onChange && onChange(muted); }); }
        btns.forEach(b => { b.textContent = muted ? '🔇' : '🔊'; b.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on'); });
      }
    };
    // Browsers only let audio start from a finished tap or click: on phones a finger touching down (pointerdown) doesn't count,
    // only lifting it (pointerup/touchend/click) does. So keep trying on each of these until the audio is actually running.
    const UNLOCK = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
    const first = () => { kit.unlock(); if (actx && actx.state === 'running') UNLOCK.forEach(ev => window.removeEventListener(ev, first, true)); };
    UNLOCK.forEach(ev => window.addEventListener(ev, first, true));
    return kit;
  };
})();
