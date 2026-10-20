// Squadron Battle: a vertical-scrolling shoot-'em-up for salsbury.uk.
// Six stages over the planet Veyra, each with a dive gate down to a cave where a captured pilot is held, and a boss.
// Touch controls follow the classic mobile shooters: drag anywhere and the ship moves with your finger (1x or 2x),
// the guns fire by themselves, and a button lets off a shock charge.
(() => {
'use strict';
const W = 360, H = 640, CH = 320, TAU = Math.PI * 2, STEP = 1 / 60;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
let inSimulation = false, dailyRandom = null;
const R = () => inSimulation && dailyRandom ? dailyRandom() : Math.random();
const rr = (a, b) => a + R() * (b - a);
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const wave = (g, ph, a1, p1, a2, p2) => a1 * Math.sin(g / p1 + ph) + a2 * Math.sin(g / p2 + ph * 1.7);
const FONT = '"Russo One","Exo 2",system-ui,sans-serif';

// ---------- Stages ----------
const STAGES = [
  { name: 'Veyra Fields', blurb: 'Farmland round the landing zone. The Kesh have dug in along the roads.', kind: 'fields', boss: 0 },
  { name: 'Glass Desert', blurb: 'Dunes, canyons and glass shards. Watch for gunships out of the sun.', kind: 'desert', boss: 1 },
  { name: 'Frost Shelf', blurb: 'Sea ice and cold water. Some Kesh can vanish here.', kind: 'ice', boss: 2 },
  { name: 'Spore Jungle', blurb: 'Glowing jungle full of swarms. Keep moving.', kind: 'jungle', boss: 3 },
  { name: 'Cinder Rift', blurb: 'Lava rivers and mines. Nearly at the Citadel.', kind: 'lava', boss: 4 },
  { name: 'Kesh Citadel', blurb: 'The Kesh home base. Bring everything you have.', kind: 'citadel', boss: 5 },
];
const WEAPONS = [
  { name: 'SCATTER', col: '#ffcc33', ink: '#3a2a00', l: 'S' },
  { name: 'LANCE', col: '#39d5ff', ink: '#00222e', l: 'L' },
  { name: 'TWIN', col: '#b98cff', ink: '#1e0b3a', l: 'T' },
  { name: 'ARC', col: '#5cf08a', ink: '#05301a', l: 'A' },
];
const DIFF = [
  { name: 'Cadet', bs: .72, rate: .6, extra: 0, hp: .85, mult: .5 },
  { name: 'Pilot', bs: 1, rate: 1, extra: 0, hp: 1, mult: 1 },
  { name: 'Ace', bs: 1.25, rate: 1.35, extra: 1, hp: 1.15, mult: 1.5 },
];
const LIVES_AT = [70000, 200000, 400000, 650000, 1000000];

// ---------- Saved settings ----------
const SAVE_KEY = 'squadron-battle-v1';
const save = { best: 0, reached: 0, diff: 1, music: 'on', ctrl: 'drag', sens: 1, follow: 'keep', helped: false, cleared: false };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch {}
const store = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} };

// ---------- Sound ----------
const snd = window.SukSound ? window.SukSound('squadron-battle-muted') : null;
let shotSoundAt = 0, hitSoundAt = 0, popSoundAt = 0, popVar = 0;
// Explosions are worked out sample by sample, once, then played back like recordings:
// a sharp crack, a roar of noise whose tone darkens as it dies away, a low rolling rumble that lingers,
// scattered crackles of debris, and a deep thud. Each size has a few variations so repeats don't sound identical.
function explosionBuffer(a, seed, dur, o) {
  const sr = a.sampleRate, n = Math.floor(sr * dur), buf = a.createBuffer(2, n, sr), r = rng(seed);
  for (let ch = 0; ch < 2; ch++) {
    const out = buf.getChannelData(ch), roar = new Float32Array(n), rumble = new Float32Array(n), debris = new Float32Array(n);
    let l1 = 0, l2 = 0, br = 0, b1 = 0, mod = 1, modT = 1;
    for (let i = 0; i < n; i++) {
      const t = i / sr, w = r() * 2 - 1;
      if (i % 512 === 0) modT = .55 + r() * .45; // the rumble rolls rather than fading smoothly
      mod += (modT - mod) * .004;
      const fc = 120 + o.bright * Math.exp(-t * o.darken), k = 1 - Math.exp(-TAU * fc / sr);
      l1 += k * (w - l1); l2 += k * (l1 - l2);
      const atk = Math.min(1, t / .006);
      roar[i] = l2 * atk * (Math.exp(-t / (dur * .13)) * .8 + Math.exp(-t / (dur * .35)) * .2) * mod;
      br = (br + .02 * w) / 1.02; b1 += .05 * (br - b1);
      rumble[i] = b1 * Math.min(1, t / .03) * Math.exp(-t / (dur * .32)) * mod;
    }
    for (let j = 0; j < o.debris; j++) { // little cracks and clatters as bits fly off
      const st = Math.floor(sr * (.03 + r() ** 1.8 * dur * .7)), len = Math.floor(sr * (.003 + r() * .012)), amp = (.3 + r() * .7) * Math.exp(-st / sr / (dur * .4));
      let f = 0; const kk = .2 + r() * .6;
      for (let i = 0; i < len && st + i < n; i++) { f += kk * ((r() * 2 - 1) - f); debris[st + i] += f * amp * Math.exp(-i / (len * .3)); }
    }
    const peak = arr => { let m = 1e-9; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(arr[i])); return m; };
    const pr = peak(roar), pu = peak(rumble), pd = peak(debris);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const crack = (r() * 2 - 1) * Math.exp(-t / .005);
      const thud = Math.sin(TAU * (o.thudHz * t - 8 * t * t)) * Math.min(1, t / .004) * Math.exp(-t / o.thudLen);
      out[i] = roar[i] / pr * o.roar + rumble[i] / pu * o.rumble + debris[i] / pd * o.debrisVol + crack * o.crack + thud * o.thud;
    }
    let m = 1e-9; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(out[i]));
    for (let i = 0; i < n; i++) out[i] *= .9 / m;
  }
  return buf;
}
const EXPLOSION = {
  small: v => a => explosionBuffer(a, 11 + v, 1, { bright: 2600, darken: 5, debris: 14, roar: .8, rumble: .55, debrisVol: .3, crack: .35, thud: .55, thudHz: 70, thudLen: .16 }),
  big: v => a => explosionBuffer(a, 21 + v, 2.2, { bright: 2200, darken: 3, debris: 40, roar: .85, rumble: .8, debrisVol: .35, crack: .4, thud: .8, thudHz: 55, thudLen: .3 }),
  huge: v => a => explosionBuffer(a, 31 + v, 3.2, { bright: 3000, darken: 1.8, debris: 70, roar: .9, rumble: 1, debrisVol: .35, crack: .45, thud: 1, thudHz: 45, thudLen: .45 }),
};
let priming = false;
const primeExplosions = () => {
  if (!snd || priming) return; priming = true;
  const jobs = [0, 1, 2].map(v => ['xs' + v, EXPLOSION.small(v)]).concat([0, 1].flatMap(v => [['xb' + v, EXPLOSION.big(v)], ['xh' + v, EXPLOSION.huge(v)]]));
  const next = () => { const j = jobs.shift(); if (!j) { priming = false; return; } snd.prime(j[0], j[1]); setTimeout(next, 16); };
  next();
};
// Guns and explosions are layered: a bright crack on top, a driven noise body, and a sine "thump" that drops in pitch for the bass.
const sfx = {
  shot(t) {
    if (!snd || t - shotSoundAt < .13) return; shotSoundAt = t;
    snd.voice('square', 980, 210, .08, .045, { lp: 2400, drive: 1.6, sweep: .06 });
    snd.voice('sine', 210, 55, .1, .16, { sweep: .07 });
    snd.hiss(.05, .05, 'bandpass', 3200, 1400, { q: 1.2 });
  },
  hit(t) {
    if (!snd || t - hitSoundAt < .07) return; hitSoundAt = t;
    snd.hiss(.06, .09, 'bandpass', 1900, 700, { q: 1, drive: 1.5 });
    snd.voice('triangle', 320, 110, .07, .08);
  },
  pop() {
    if (!snd || G.now - popSoundAt < .05) return; popSoundAt = G.now;
    snd.sample('xs' + (popVar = (popVar + 1) % 3), EXPLOSION.small(popVar), .75, { rate: rr(.88, 1.12) });
  },
  boom() { snd && snd.sample('xb' + Math.floor(R() * 2), EXPLOSION.big(Math.floor(R() * 2)), .95, { rate: rr(.9, 1.06), wet: .25 }); },
  pick() { snd && snd.chord([660, 880, 1320], .22, .1, { gap: .045 }); },
  power() { snd && snd.chord([523, 659, 784, 1047], .32, .12, { gap: .055, type: 'square', lp: 2600 }); },
  bomb() {
    if (!snd) return;
    snd.sample('xh0', EXPLOSION.huge(0), 1, { wet: .4 });
    snd.voice('sawtooth', 200, 40, 1.2, .12, { lp: 700 }); // the charge going off, under the blast
  },
  die() {
    if (!snd) return;
    snd.sample('xh1', EXPLOSION.huge(1), 1, { rate: 1.08, wet: .35 });
    snd.voice('sawtooth', 640, 60, .8, .14, { lp: 1400 });
  },
  warn() { if (!snd) return; for (let i = 0; i < 3; i++) snd.voice('square', 460, 320, .34, .1, { delay: i * .45, lp: 1600 }); },
  dive() { snd && snd.voice('sine', 900, 110, .9, .22, { vib: 11, vibDepth: 28 }); },
  rescue() { snd && snd.chord([392, 523, 659, 784, 1047], .55, .13, { gap: .08 }); },
  life() { snd && snd.chord([784, 988, 1175, 1568], .5, .13, { gap: .07, type: 'square', lp: 3000 }); },
  clear() { snd && snd.chord([523, 659, 784, 1047, 1319], .9, .12, { gap: .11, wet: .4 }); },
};
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };

// ---------- Title music ----------
// An original tune in the style of the Amiga shoot-'em-up title tracks. The hook is short, staccato notes with gaps,
// and every note echoes three times a dotted eighth apart (each repeat quieter and darker), so the echoes fill the gaps
// and make the rhythm. Under it: a hard-hitting synth drum kit (a kick with a click, a fat snare, claps in the chorus,
// synth-tom rolls into each section), a galloping octave bass and quiet chord arpeggios. The lead sits below the drums.
// Four bars of intro, then 16 bars on a loop: the hook in A minor, then a 3-3-2 chorus that lands on E to pull back round.
// It plays on the home page only, and only after the first tap or key press (browsers block sound before that).
// The melody sits an octave below the written notes (Pete, 2026-10-20). Notes are timed on the audio clock, and the
// echoes come from one shared delay line rather than extra notes, so it stays in time and light enough for phones.
const midi = s => 12 * (+s.slice(-1) + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[s[0]] + (s[1] === '#' ? 1 : 0);
const hz = m => 440 * 2 ** ((m - 69) / 12);
const CHORDS = { Am: [45, 57, 60, 64], F: [41, 53, 57, 60], C: [36, 52, 55, 60], G: [43, 55, 59, 62], E: [40, 52, 56, 59] };
// Each bar: chord, then the lead as note:length in sixteenths (16 per bar); '.' is a rest.
const SONG_INTRO = [['Am'], ['F'], ['C'], ['E']];
const SONG_LOOP = [
  // the hook
  ['Am', 'A4:2 .:1 C5:1 .:2 E5:2 .:2 A5:2 G5:2 E5:2'], ['F', 'F5:2 .:2 E5:2 C5:2 .:2 A4:2 C5:4'],
  ['C', 'G5:2 .:1 E5:1 .:2 C5:2 .:2 E5:2 G5:2 C6:2'], ['G', 'B5:4 A5:2 G5:2 D5:6 .:2'],
  ['Am', 'A4:2 .:1 C5:1 .:2 E5:2 .:2 A5:2 G5:2 E5:2'], ['F', 'F5:2 .:2 A5:2 C6:2 .:2 A5:2 F5:4'],
  ['C', 'E5:2 G5:2 C6:2 E6:2 D6:2 C6:2 B5:2 G5:2'], ['G', 'D6:6 B5:2 G5:4 .:4'],
  // the chorus
  ['F', 'C6:3 A5:3 F5:2 C6:3 A5:3 F5:2'], ['G', 'D6:3 B5:3 G5:2 D6:3 B5:3 G5:2'],
  ['Am', 'E6:3 C6:3 A5:2 E6:3 C6:3 A5:2'], ['Am', 'E6:2 D6:2 C6:2 B5:2 A5:8'],
  ['F', 'C6:3 A5:3 F5:2 C6:3 A5:3 F5:2'], ['G', 'D6:3 B5:3 G5:2 D6:3 B5:3 G5:2'],
  ['E', 'G#5:3 B5:3 E6:2 G#5:3 B5:3 E6:2'], ['E', 'E6:4 D6:2 B5:2 G#5:4 .:4'],
].map(([ch, lead]) => { // lead -> { step: [midi note, length] }, played an octave lower than written
  const at = {}; let p = 0;
  for (const tk of lead.split(' ')) { const [n, l] = tk.split(':'); if (n !== '.') at[p] = [midi(n) - 12, +l]; p += +l; }
  return [ch, at];
});
const music = (() => {
  const S = 60 / 136 / 4; // one sixteenth at 136 bpm
  const BASS = [0, null, 0, 12, null, 0, 12, null, 0, null, 0, 12, null, 7, 12, null]; // a galloping octave pattern
  let timer = 0, next = 0, step = 0, echo = null;
  // The lead's echo: a dotted-eighth delay feeding back on itself through a low-pass, so each repeat is about half as loud
  // and a little darker (.5, .28, .15, ...). Built once per audio context; voices reach it through their `send`.
  function echoIn() {
    const gr = snd.graph(); if (!gr) return null;
    if (echo && echo.ctx === gr.ctx) return echo.input;
    const a = gr.ctx, input = a.createGain(), dl = a.createDelay(1), tone = a.createBiquadFilter(), fb = a.createGain();
    input.gain.value = .5; dl.delayTime.value = 3 * S; tone.type = 'lowpass'; tone.frequency.value = 2200; fb.gain.value = .56;
    input.connect(dl); dl.connect(tone); tone.connect(fb).connect(dl); tone.connect(gr.bus);
    echo = { ctx: a, input };
    return input;
  }
  // The drum kit
  const kick = d => { snd.voice('sine', 190, 40, .3, .55, { delay: d, sweep: .08, drive: 1.4 }); snd.hiss(.012, .18, 'highpass', 3000, 3000, { delay: d }); };
  const snare = (d, v = 1) => {
    snd.hiss(.22, .28 * v, 'bandpass', 1900, 900, { delay: d, q: .6, drive: 2, wet: .25 });
    snd.hiss(.08, .12 * v, 'highpass', 6000, 6000, { delay: d });
    snd.voice('triangle', 260, 170, .12, .14 * v, { delay: d });
  };
  const clap = d => { for (let i = 0; i < 3; i++) snd.hiss(i < 2 ? .012 : .12, .14, 'bandpass', 1300, 1100, { delay: d + i * .011, q: 1.2, wet: .3 }); };
  const tom = (d, f) => snd.voice('sine', f, f * .45, .22, .32, { delay: d, sweep: .18, drive: 1.3 });
  const hat = (d, v) => snd.hiss(.03, v, 'highpass', 8000, 8000, { delay: d });
  function note(step, d) {
    const bar = step >> 4, s = step & 15, intro = bar < 4, lb = (bar - 4) % SONG_LOOP.length;
    const [ch, lead] = intro ? SONG_INTRO[bar] : SONG_LOOP[lb], c = CHORDS[ch], chorus = !intro && lb >= 8;
    const fill = intro ? bar === 3 : lb === 7 || lb === 15;
    // Drums: hats first, the kit from bar 3; four on the floor and claps in the chorus; a crash at the top of each section;
    // a synth-tom roll at the end of each section
    if (s % 2 === 0) hat(d, s % 4 ? .035 : .055); else if (chorus) hat(d, .018);
    if (s === 14 && !intro && !fill) snd.hiss(.16, .045, 'highpass', 6000, 6000, { delay: d }); // open hat
    if (!intro && s === 0 && (lb === 0 || lb === 8)) snd.hiss(1.3, .13, 'highpass', 5000, 2500, { delay: d, wet: .35 }); // crash
    if (!intro || bar >= 2) {
      if (fill && s >= 12) tom(d, [240, 190, 150, 115][s - 12]);
      else {
        if (chorus ? s % 4 === 0 : s === 0 || s === 3 || s === 8 || s === 10) kick(d);
        if (s === 4 || s === 12) { snare(d); if (chorus) clap(d); }
        if (!chorus && s === 15 && lb % 2) snare(d, .45); // a ghost note
      }
    }
    // Bass
    if (BASS[s] !== null) { const f = hz(c[0] + BASS[s]); snd.voice('sawtooth', f, f, S * 1.6, .1, { delay: d, lp: 1400, lp1: 300, q: 3 }); }
    // Arpeggio: up and down the chord, quietly
    { const f = hz([c[1], c[2], c[3], c[1] + 12, c[3], c[2]][s % 6] + 12); snd.voice('square', f, f, S * .8, intro ? .012 + bar * .003 : .016, { delay: d, lp: 2600 }); }
    // Lead: a plucky square with its three echoes, each a dotted eighth later, quieter and darker
    const ln = lead && lead[s];
    if (ln) {
      const f = hz(ln[0]), dur = Math.min(ln[1], 4) * S * .9, o = { attack: .006, hold: dur * .3, vib: 5.5, vibDepth: f * .006, send: echoIn() };
      snd.voice('square', f, f, dur, .05, { ...o, delay: d, lp: 4200, lp1: 1800 });
      snd.voice('sawtooth', f, f, dur, .018, { ...o, delay: d, detune: 8, lp: 3000 });
    }
  }
  function tick() {
    if (!snd || snd.muted) return;
    const now = snd.now(); if (!now) return; // the audio clock: the same one every note's delay is measured from
    if (next < now) next = now + .05; // after a stall, carry on from now rather than cram the missed notes in
    while (next < now + .25) { note(step++, next - now); next += S; }
  }
  return {
    start() { if (timer || !snd || snd.muted) return; step = 0; next = 0; timer = setInterval(tick, 40); tick(); },
    stop() { clearInterval(timer); timer = 0; },
  };
})();

// ---------- Terrain ----------
// The ground is drawn in chunks CH tall. Inside a chunk, y runs down the screen; g is the distance along the route,
// so roads and rivers drawn from g line up across chunk edges.
const caveL = g => 42 + wave(g, 1.3, 24, 140, 12, 47);
const caveR = g => 318 + wave(g, 4.1, 24, 160, 12, 53);
function band(c, k, fx, hw, fill) {
  c.beginPath();
  for (let y = -12; y <= CH + 12; y += 8) { const g = (k + 1) * CH - y; c.lineTo(fx(g) - hw(g), y); }
  for (let y = CH + 12; y >= -12; y -= 8) { const g = (k + 1) * CH - y; c.lineTo(fx(g) + hw(g), y); }
  c.closePath(); c.fillStyle = fill; c.fill();
}
function line(c, k, fx, col, w, dash) {
  c.beginPath();
  for (let y = -12; y <= CH + 12; y += 6) { const g = (k + 1) * CH - y; c.lineTo(fx(g), y); }
  c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []); c.stroke(); c.setLineDash([]);
}
function blob(c, x, y, r, n, rand) {
  c.beginPath();
  for (let i = 0; i < n; i++) { const a = i / n * TAU, rad = r * (.72 + rand() * .5); c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad * .85); }
  c.closePath();
}
const TERRAIN = {
  fields(c, k, r) {
    c.fillStyle = '#2c5229'; c.fillRect(0, 0, W, CH);
    const cols = ['#4f7f3a', '#5d8c3e', '#6f9a45', '#8aa84d', '#a69a52', '#7d6a40', '#447a37', '#94b35a'];
    for (let y = 0; y < CH;) {
      const h = Math.min(CH - y, 46 + r() * 50);
      for (let x = -r() * 30; x < W;) {
        const w = 52 + r() * 74;
        c.fillStyle = cols[Math.floor(r() * cols.length)]; c.fillRect(x + 2, y + 2, w - 4, h - 4);
        c.strokeStyle = 'rgba(0,0,0,.09)'; c.lineWidth = 1.4; c.beginPath();
        if (r() < .5) for (let i = x + 6; i < x + w - 4; i += 5) { c.moveTo(i, y + 4); c.lineTo(i, y + h - 4); }
        else for (let j = y + 6; j < y + h - 4; j += 5) { c.moveTo(x + 4, j); c.lineTo(x + w - 4, j); }
        c.stroke();
        x += w;
      }
      y += h;
    }
    for (let i = 0; i < 26; i++) { // hedgerow trees
      const x = r() * W, y = r() * CH, s = 3 + r() * 5;
      c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(x + 2, y + 2, s, 0, TAU); c.fill();
      c.fillStyle = '#25461f'; c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
      c.fillStyle = '#3d6d2f'; c.beginPath(); c.arc(x - s * .3, y - s * .3, s * .55, 0, TAU); c.fill();
    }
    const road = g => 180 + wave(g, .4, 105, 260, 28, 90);
    band(c, k, road, () => 10, '#3b3a33'); band(c, k, road, () => 8, '#6b6253'); line(c, k, road, '#e8dcae', 1.2, [8, 8]);
    for (let i = 0; i < 3; i++) { // farm buildings by the road
      const y = 30 + r() * (CH - 60), g = (k + 1) * CH - y, x = road(g) + (r() < .5 ? -28 : 20);
      c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x + 2, y + 2, 14, 10);
      c.fillStyle = '#9c5b3c'; c.fillRect(x, y, 14, 10); c.fillStyle = '#c47a52'; c.fillRect(x, y, 14, 4);
    }
  },
  desert(c, k, r) {
    c.fillStyle = '#c99a5b'; c.fillRect(0, 0, W, CH);
    for (let i = 0; i < 18; i++) {
      const y0 = r() * CH, a = 4 + r() * 8, p = 30 + r() * 40;
      c.strokeStyle = r() < .5 ? 'rgba(255,232,180,.28)' : 'rgba(120,76,36,.18)'; c.lineWidth = 3 + r() * 5;
      c.beginPath(); for (let x = -10; x <= W + 10; x += 10) c.lineTo(x, y0 + a * Math.sin(x / p + i)); c.stroke();
    }
    const can = g => 130 + wave(g, 2.2, 85, 300, 32, 110), hw = g => 22 + 9 * Math.sin(g / 70);
    band(c, k, can, g => hw(g) + 5, '#e6c08a'); band(c, k, can, hw, '#6b4026'); band(c, k, g => can(g) + 4, g => hw(g) * .5, '#47291a');
    for (let i = 0; i < 9; i++) {
      const x = r() * W, y = r() * CH, s = 5 + r() * 9;
      c.fillStyle = 'rgba(80,46,20,.35)'; blob(c, x + 3, y + 3, s, 7, r); c.fill();
      c.fillStyle = '#a87b49'; blob(c, x, y, s, 7, r); c.fill();
      c.fillStyle = 'rgba(255,230,190,.35)'; c.beginPath(); c.arc(x - s * .3, y - s * .3, s * .35, 0, TAU); c.fill();
    }
    for (let i = 0; i < 8; i++) { // glass shards
      const x = r() * W, y = r() * CH, s = 2 + r() * 4;
      c.fillStyle = 'rgba(170,250,255,.75)'; c.beginPath(); c.moveTo(x, y - s * 1.6); c.lineTo(x + s, y); c.lineTo(x, y + s * 1.2); c.lineTo(x - s, y); c.fill();
    }
  },
  ice(c, k, r) {
    c.fillStyle = '#1c4870'; c.fillRect(0, 0, W, CH);
    for (let i = 0; i < 30; i++) { c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(r() * W, r() * CH, 16 + r() * 30, 1.5); }
    const L = g => 110 + wave(g, .9, 50, 230, 18, 70), Rr = g => 255 + wave(g, 3.3, 45, 210, 16, 80);
    const side = (f, left) => { c.beginPath(); for (let y = -12; y <= CH + 12; y += 8) c.lineTo(f((k + 1) * CH - y), y); c.lineTo(left ? -10 : W + 10, CH + 12); c.lineTo(left ? -10 : W + 10, -12); c.closePath(); };
    c.fillStyle = '#93b9d6'; side(g => L(g) + 6, true); c.fill(); side(g => Rr(g) - 6, false); c.fill();
    c.fillStyle = '#dceaf4'; side(L, true); c.fill(); side(Rr, false); c.fill();
    c.strokeStyle = 'rgba(120,165,200,.6)'; c.lineWidth = 1;
    for (let i = 0; i < 14; i++) { const x = r() * W, y = r() * CH; c.beginPath(); c.moveTo(x, y); for (let j = 0; j < 4; j++) c.lineTo(x + rr(-14, 14) * (j + 1) * .6, y + rr(-10, 10) * (j + 1) * .6); c.stroke(); }
    for (let i = 0; i < 7; i++) { // floes in the channel
      const y = r() * CH, g = (k + 1) * CH - y, x = L(g) + 20 + r() * Math.max(10, Rr(g) - L(g) - 40), s = 5 + r() * 9;
      c.fillStyle = '#7fa6c4'; blob(c, x + 2, y + 2, s, 6, r); c.fill(); c.fillStyle = '#eef6fb'; blob(c, x, y, s, 6, r); c.fill();
    }
  },
  jungle(c, k, r) {
    c.fillStyle = '#14231a'; c.fillRect(0, 0, W, CH);
    const riv = g => 200 + wave(g, 5.1, 90, 280, 26, 95);
    band(c, k, riv, () => 20, '#0f5a57'); band(c, k, riv, () => 11, 'rgba(70,230,205,.55)');
    const cols = ['#21402a', '#2b5631', '#386a3a', '#1c3626', '#3f3359', '#2e4a2c'];
    for (let i = 0; i < 70; i++) {
      const x = r() * W, y = r() * CH, s = 8 + r() * 16, gg = (k + 1) * CH - y;
      if (Math.abs(x - riv(gg)) < 22) continue;
      c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.arc(x + 3, y + 3, s, 0, TAU); c.fill();
      c.fillStyle = cols[Math.floor(r() * cols.length)]; c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
      c.fillStyle = 'rgba(160,255,170,.08)'; c.beginPath(); c.arc(x - s * .3, y - s * .35, s * .55, 0, TAU); c.fill();
    }
    for (let i = 0; i < 14; i++) {
      const x = r() * W, y = r() * CH;
      c.fillStyle = 'rgba(255,79,216,.18)'; c.beginPath(); c.arc(x, y, 6, 0, TAU); c.fill();
      c.fillStyle = '#ff6fe0'; c.beginPath(); c.arc(x, y, 2.2, 0, TAU); c.fill();
    }
  },
  lava(c, k, r) {
    c.fillStyle = '#26140f'; c.fillRect(0, 0, W, CH);
    for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#33201a' : '#2d1a14'; blob(c, r() * W, r() * CH, 18 + r() * 26, 7, r); c.fill(); }
    c.strokeStyle = 'rgba(255,90,20,.35)'; c.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) { const x = r() * W, y = r() * CH; c.beginPath(); c.moveTo(x, y); for (let j = 1; j < 5; j++) c.lineTo(x + rr(-18, 18), y + j * rr(4, 10)); c.stroke(); }
    const lv = g => 170 + wave(g, 1.7, 110, 250, 30, 85);
    band(c, k, lv, () => 26, 'rgba(255,80,20,.22)'); band(c, k, lv, () => 15, '#e8480f'); band(c, k, lv, () => 8, '#ffa21f'); band(c, k, g => lv(g) + 2 * Math.sin(g / 9), () => 3, '#fff1a0');
    for (let i = 0; i < 20; i++) { c.fillStyle = 'rgba(255,170,60,.6)'; c.fillRect(r() * W, r() * CH, 1.6, 1.6); }
  },
  citadel(c, k, r) {
    c.fillStyle = '#1b2130'; c.fillRect(0, 0, W, CH);
    for (let y = 0; y < CH; y += 40) for (let x = 0; x < W; x += 45) {
      c.fillStyle = (x / 45 + y / 40) % 2 ? '#222a3b' : '#252e41'; c.fillRect(x + 1, y + 1, 43, 38);
      c.fillStyle = '#34405a'; c.fillRect(x + 1, y + 1, 43, 1.5); c.fillRect(x + 1, y + 1, 1.5, 38);
      c.fillStyle = '#121722'; c.fillRect(x + 1, y + 38, 43, 1.5); c.fillRect(x + 43, y + 1, 1.5, 38);
      if (r() < .12) { c.fillStyle = '#10141e'; for (let i = 0; i < 5; i++) c.fillRect(x + 8, y + 9 + i * 5, 29, 2.4); }
      if (r() < .06) { for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#e8b923' : '#1b1b1b'; c.fillRect(x + 4 + i * 6, y + 30, 6, 5); } }
    }
    const tr = g => 180 + wave(g, .2, 70, 300, 20, 120);
    band(c, k, tr, () => 24, '#0b0f19'); line(c, k, g => tr(g) - 20, 'rgba(57,213,255,.7)', 1.6, [10, 14]); line(c, k, g => tr(g) + 20, 'rgba(57,213,255,.7)', 1.6, [10, 14]);
    for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(255,70,140,.8)'; c.fillRect(r() * W, r() * CH, 2.5, 2.5); }
  },
  cave(c, k, r) {
    c.fillStyle = '#110d18'; c.fillRect(0, 0, W, CH);
    for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(160,130,220,.07)'; c.beginPath(); c.arc(r() * W, r() * CH, 2 + r() * 6, 0, TAU); c.fill(); }
    c.strokeStyle = 'rgba(164,107,255,.45)'; c.lineWidth = 1.3;
    for (let i = 0; i < 7; i++) { const x = 60 + r() * 240, y = r() * CH; c.beginPath(); c.moveTo(x, y); for (let j = 1; j < 6; j++) c.lineTo(x + rr(-14, 14), y + j * rr(6, 12)); c.stroke(); }
    const wall = (f, left) => { c.beginPath(); for (let y = -12; y <= CH + 12; y += 8) c.lineTo(f((k + 1) * CH - y), y); c.lineTo(left ? -10 : W + 10, CH + 12); c.lineTo(left ? -10 : W + 10, -12); c.closePath(); };
    c.fillStyle = '#4b3d66'; wall(g => caveL(g) + 3, true); c.fill(); wall(g => caveR(g) - 3, false); c.fill();
    c.fillStyle = '#2a2138'; wall(caveL, true); c.fill(); wall(caveR, false); c.fill();
    for (let i = 0; i < 10; i++) { // crystals in the walls
      const y = r() * CH, g = (k + 1) * CH - y, left = r() < .5, x = left ? caveL(g) - 10 - r() * 20 : caveR(g) + 10 + r() * 20;
      c.fillStyle = 'rgba(190,140,255,.25)'; c.beginPath(); c.arc(x, y, 7, 0, TAU); c.fill();
      c.fillStyle = '#c9a2ff'; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 3, y); c.lineTo(x, y + 5); c.lineTo(x - 3, y); c.fill();
    }
  },
};
function paintChunk(c, kind, k, seedBase) { TERRAIN[kind](c, k, rng(seedBase * 7919 + k * 104729 + 17)); }

// ---------- Canvas and scale ----------
let cv = null, ctx = null, SC = 1, cssScale = 1;
const chunkCache = new Map();
function chunkCanvas(kind, seedBase, k) {
  const key = kind + ':' + seedBase + ':' + k;
  let cc = chunkCache.get(key);
  if (!cc) {
    cc = document.createElement('canvas'); cc.width = Math.ceil(W * SC); cc.height = Math.ceil(CH * SC) + 2;
    const c = cc.getContext('2d'); c.setTransform(SC, 0, 0, SC, 0, 0); paintChunk(c, kind, k, seedBase);
    chunkCache.set(key, cc);
  }
  return cc;
}

// ---------- Drawing helpers ----------
function glow(c, x, y, r, col, a) { c.globalAlpha = a; c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.globalAlpha = 1; }
function poly(c, pts, fill) { c.beginPath(); for (let i = 0; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = fill; c.fill(); }
function circ(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill(); }
function ell(c, x, y, rx, ry, fill) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = fill; c.fill(); }

// The player's ship: a twin-engine Veyra fighter. bank: -1..1 for leaning into a turn (the wing on the inside of the turn darkens).
function drawShip(c, x, y, bank = 0, s = 1, flame = true) {
  c.save(); c.translate(x, y); c.scale(s * (1 - Math.abs(bank) * .22), s);
  if (flame) {
    for (const ex of [-3.6, 3.6]) {
      const f = 8 + R() * 6;
      glow(c, ex, 15, 5.5, '#ff9a3c', .3);
      poly(c, [ex - 2.6, 11, ex + 2.6, 11, ex, 12 + f], '#ff8a2a'); poly(c, [ex - 1.6, 11, ex + 1.6, 11, ex, 11 + f * .65], '#ffe08a'); poly(c, [ex - .8, 11, ex + .8, 11, ex, 11 + f * .35], '#ffffff');
    }
  }
  const lit = '#c3d0ea', dim = '#8193b8', lw = bank > .15 ? lit : bank < -.15 ? dim : '#a9b8d8', rw = bank > .15 ? dim : bank < -.15 ? lit : '#a9b8d8';
  // wings: swept back, with orange tips and a darker leading-edge panel
  poly(c, [-3, -4, -17, 7, -17, 11, -4, 8], lw); poly(c, [3, -4, 17, 7, 17, 11, 4, 8], rw);
  poly(c, [-3, -4, -12, 4, -10, 4.5, -3, -1], 'rgba(40,55,95,.35)'); poly(c, [3, -4, 12, 4, 10, 4.5, 3, -1], 'rgba(40,55,95,.35)');
  poly(c, [-17, 7, -17, 11, -14, 10.3, -14, 5.5], '#ff8a3d'); poly(c, [17, 7, 17, 11, 14, 10.3, 14, 5.5], '#ff8a3d');
  // wing guns
  c.fillStyle = '#4d5d82'; c.fillRect(-11.6, -3, 1.6, 8); c.fillRect(10, -3, 1.6, 8);
  // engine pods and tail fins
  poly(c, [-6.5, 2, -1.5, 2, -1.8, 12, -6.2, 12], '#d9e2f5'); poly(c, [1.5, 2, 6.5, 2, 6.2, 12, 1.8, 12], '#d9e2f5');
  c.fillStyle = '#39465f'; c.fillRect(-5.8, 10.5, 3.6, 1.8); c.fillRect(2.2, 10.5, 3.6, 1.8);
  poly(c, [-6.5, 5, -9, 13, -6, 12], '#5d6f96'); poly(c, [6.5, 5, 9, 13, 6, 12], '#5d6f96');
  // fuselage with canards
  poly(c, [-3.5, -10, -7.5, -6, -7, -4.5, -3.5, -6], '#a9b8d8'); poly(c, [3.5, -10, 7.5, -6, 7, -4.5, 3.5, -6], '#a9b8d8');
  poly(c, [0, -21, 4, -11, 4.6, 6, 3, 10, -3, 10, -4.6, 6, -4, -11], '#f2f6ff');
  poly(c, [0, -21, 4, -11, 4.6, 6, 3, 10, 0, 10], 'rgba(40,60,120,.2)');
  c.strokeStyle = 'rgba(60,80,130,.35)'; c.lineWidth = .6; c.beginPath(); c.moveTo(-4.3, 1); c.lineTo(4.3, 1); c.moveTo(0, 2); c.lineTo(0, 9); c.stroke();
  c.fillStyle = '#ff8a3d'; c.fillRect(-.6, -19, 1.2, 4.5);
  // canopy
  ell(c, 0, -8, 2.5, 5.2, '#1b6f9a'); ell(c, 0, -8.4, 2.1, 4.6, '#39d5ff'); ell(c, -.8, -10, .8, 1.9, 'rgba(255,255,255,.85)');
  // wingtip lights
  if (flame && Math.floor(performance.now() / 400) % 2) { circ(c, -17, 9, 1, '#ff3d6e'); circ(c, 17, 9, 1, '#5cf08a'); }
  c.restore();
}
// Engine exhaust: a flickering flame, pointing up the screen by default (most Kesh fly down); ang turns it.
function exhaust(c, x, y, w, len, col, ang = 0) {
  const f = len * (.7 + R() * .5);
  c.save(); c.translate(x, y); c.rotate(ang);
  glow(c, 0, -f * .4, w * 1.5, col, .22);
  poly(c, [-w, 0, w, 0, 0, -f], col); poly(c, [-w * .45, 0, w * .45, 0, 0, -f * .55], '#fff');
  c.restore();
}
function canopy(c, x, y, rx, ry, col) { ell(c, x, y, rx, ry, col); ell(c, x - rx * .3, y - ry * .3, rx * .35, ry * .4, 'rgba(255,255,255,.6)'); }
const KESH = { dark: '#3d1d5e', mid: '#7a35b8', light: '#c98cff', eye: '#ff4f8b', metal: '#3a3350', steel: '#6c6588' };
// True for a moment just after a ground gun fires (its cooldown was just reset to period / rate), for the muzzle flash.
const shotFlash = (e, period) => e.cool > period / DIFF[G.diff].rate - .08;
const hitCol = (e, col) => e.flash > 0 ? '#ffffff' : col;

// ---------- Game state ----------
const G = {
  state: 'idle', si: 0, practice: false, mode: 'surf', d: 0, cd: 0, t: 0, ct: 0, tl: [], ti: 0, ctl: [], cti: 0,
  en: [], eb: [], ps: [], it: [], fx: [], txt: [], decals: [], clouds: [], form: {}, boss: null,
  score: 0, lives: 3, bombs: 3, livesGiven: 0, rescued: 0, rescuedRun: 0, deathsStage: 0, kills: 0, spawned: 0,
  speed: 42, banner: null, trans: null, fade: 0, flash: 0, shake: 0, bombFx: 0, now: 0, clearT: 0, overT: 0,
  gateDone: false, gateHint: 0, bossWarn: 0, diff: 1, continues: 0, runStart: 0, stageScore: 0, help: 0,
};
const P = { x: 180, y: 560, tx: 180, ty: 560, wt: 0, wl: 1, inv: 0, alive: true, respawn: 0, fireT: 0, bank: 0, vx: 0, dive: 0 };
const D = () => DIFF[G.diff];
const shake = a => { G.shake = Math.max(G.shake, a); };

function addScore(n, x, y, show) {
  const v = Math.round(n * D().mult / 10) * 10;
  G.score += v;
  if (show && x !== undefined) G.txt.push({ x, y, s: v.toLocaleString(), t: .9, col: '#fff' });
  while (G.livesGiven < LIVES_AT.length && G.score >= LIVES_AT[G.livesGiven]) {
    G.livesGiven++; G.lives = Math.min(9, G.lives + 1); sfx.life();
    G.txt.push({ x: P.x, y: P.y - 30, s: 'EXTRA SHIP', t: 1.6, col: '#5cf08a', big: true });
  }
}

// ---------- Particles ----------
function burst(x, y, n, cols, spd = 120, life = .6, size = 2.4) {
  for (let i = 0; i < n && G.fx.length < 420; i++) {
    const a = R() * TAU, v = spd * (.3 + R() * .9);
    G.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: life * (.5 + R() * .7), max: life, col: cols[i % cols.length], s: size * (.6 + R() * .8) });
  }
}
function explode(x, y, size = 1, ground = false) {
  burst(x, y, Math.round(10 + 14 * size), ['#fff4c2', '#ffb347', '#ff6a2a', '#ff3d6e'], 90 + 70 * size, .55 + .25 * size, 2 + size);
  if (ground) burst(x, y, 8, ['#2a2230', '#4a3f52'], 70, .7, 3);
  G.fx.push({ ring: true, x, y, r: 4, max: 18 + 26 * size, t: .35, life: .35 });
  if (size >= 1.4) { sfx.boom(); shake(4 + size * 2); } else sfx.pop();
}

// ---------- Enemy bullets ----------
function shoot(x, y, ang, spd, big) {
  if (y < -10 || y > H - 40) return;
  const v = spd * D().bs;
  G.eb.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: big ? 5.5 : 3.8, big });
}
const toP = (x, y) => Math.atan2(P.y - y, P.x - x);
function aimed(x, y, n, spread, spd = 150, big) { const a = toP(x, y); for (let i = 0; i < n; i++) shoot(x, y, a + (i - (n - 1) / 2) * spread, spd, big); }
function ring(x, y, n, spd = 120, off = R() * TAU, big) { for (let i = 0; i < n; i++) shoot(x, y, off + i / n * TAU, spd, big); }

// ---------- Enemies ----------
// Each kind: hp, r (hit radius), score, air (false = on the ground, moves with the scroll), up(e, dt), dr(c, e).
const sh = () => (1 + .16 * G.si) * D().hp;
const EK = {
  darter: { hp: 2, r: 10, score: 150, air: true,
    up(e, dt) { e.x = 180 - e.side * 125 * Math.cos(e.t * 1.05 + e.ph); e.y = -24 + 108 * e.t; if (e.fireAt && e.t > e.fireAt) { e.fireAt = 0; aimed(e.x, e.y, 1 + D().extra, .2); } },
    dr(c, e) { c.save(); c.translate(e.x, e.y); c.rotate(Math.sin(e.t * 1.05 + e.ph) * e.side * .5);
      exhaust(c, -3.5, -9, 1.8, 8, '#ff5ad8'); exhaust(c, 3.5, -9, 1.8, 8, '#ff5ad8');
      poly(c, [-3, 1, -14, -7, -14, -3, -5, 7], hitCol(e, KESH.mid)); poly(c, [3, 1, 14, -7, 14, -3, 5, 7], hitCol(e, KESH.mid));
      poly(c, [-14, -7, -14, -3, -12, -3, -12, -6], hitCol(e, KESH.light)); poly(c, [14, -7, 14, -3, 12, -3, 12, -6], hitCol(e, KESH.light));
      poly(c, [0, 14, 4.5, 4, 5, -9, -5, -9, -4.5, 4], hitCol(e, KESH.steel)); poly(c, [0, 14, 4.5, 4, 5, -9, 0, -9], hitCol(e, KESH.metal));
      canopy(c, 0, 3, 2, 4, KESH.eye); c.restore(); } },
  diver: { hp: 3, r: 11, score: 200, air: true,
    up(e, dt) {
      if (e.ph === 0) { e.y += 150 * dt; if (e.y >= e.stopY) { e.ph = 1; e.t = 0; } }
      else if (e.ph === 1) { if (e.t > .55) { e.ph = 2; aimed(e.x, e.y, 1 + D().extra, .25); e.vx = clamp((P.x - e.x) * .9, -150, 150); } }
      else { e.vy = Math.min(300, (e.vy || 40) + 500 * dt); e.x += e.vx * dt; e.y += e.vy * dt; }
    },
    dr(c, e) { c.save(); c.translate(e.x, e.y);
      exhaust(c, 0, -6, 2.4, 7, '#ff5ad8');
      c.fillStyle = hitCol(e, KESH.steel); c.fillRect(-11, -1.5, 22, 3);
      for (const sd of [-1, 1]) {
        c.save(); c.scale(sd, 1);
        poly(c, [9, -13, 15, -9, 16, 0, 15, 9, 9, 13, 10, 0], hitCol(e, KESH.dark));
        c.strokeStyle = hitCol(e, KESH.mid); c.lineWidth = 1; c.beginPath(); c.moveTo(10, 0); c.lineTo(16, 0); c.moveTo(9.5, -6); c.lineTo(15.5, -4.5); c.moveTo(9.5, 6); c.lineTo(15.5, 4.5); c.stroke();
        poly(c, [9, -13, 10, 0, 9, 13, 8, 0], hitCol(e, KESH.light)); c.restore();
      }
      circ(c, 0, 0, 7, hitCol(e, KESH.steel)); circ(c, 0, 0, 5.2, hitCol(e, KESH.metal));
      circ(c, 0, 2, 3, e.ph === 1 ? '#fff' : KESH.eye); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 6.2, Math.PI * 1.1, Math.PI * 1.6); c.stroke();
      c.restore(); } },
  weaver: { hp: 2, r: 10, score: 120, air: true,
    up(e, dt) { e.y += 95 * dt; e.x = e.x0 + 52 * Math.sin(e.t * 2.3 + e.ph); if (e.fireAt && e.y > e.fireAt) { e.fireAt = 0; aimed(e.x, e.y, 1, 0); } },
    dr(c, e) { c.save(); c.translate(e.x, e.y);
      ell(c, 0, 0, 12.5, 12.5, hitCol(e, KESH.metal)); ell(c, 0, 0, 11, 11, hitCol(e, KESH.steel));
      c.strokeStyle = hitCol(e, KESH.metal); c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.stroke();
      for (let i = 0; i < 6; i++) { const a = e.t * 5 + i * TAU / 6; circ(c, Math.cos(a) * 9.6, Math.sin(a) * 9.6, 1.5, i % 2 ? '#ff4f8b' : '#ffe36a'); }
      circ(c, 0, 0, 5.5, hitCol(e, KESH.mid)); circ(c, 0, 0, 4, hitCol(e, KESH.light)); ell(c, -1.3, -1.5, 1.5, 1.2, 'rgba(255,255,255,.7)'); circ(c, 0, 1, 1.6, KESH.eye);
      c.restore(); } },
  riser: { hp: 3, r: 10, score: 220, air: true,
    up(e, dt) { e.y -= 175 * dt; e.x = e.x0 + 24 * Math.sin(e.t * 3); if (!e.fired && e.y < P.y - 60) { e.fired = true; aimed(e.x, e.y, 1 + D().extra, .2); } if (e.y < -40) e.dead = true; },
    dr(c, e) { c.save(); c.translate(e.x, e.y);
      exhaust(c, 0, 9, 2.6, 11, '#ff6aa8', Math.PI);
      poly(c, [-3, -1, -13, 7, -12, 10, -3, 7], hitCol(e, '#8a3a5c')); poly(c, [3, -1, 13, 7, 12, 10, 3, 7], hitCol(e, '#8a3a5c'));
      poly(c, [-3, 4, -7, 11, -3, 9], hitCol(e, '#5a2440')); poly(c, [3, 4, 7, 11, 3, 9], hitCol(e, '#5a2440'));
      poly(c, [0, -14, 4, -3, 3.5, 9, -3.5, 9, -4, -3], hitCol(e, '#c86d95')); poly(c, [0, -14, 4, -3, 3.5, 9, 0, 9], hitCol(e, '#9c4a70'));
      canopy(c, 0, -4, 1.8, 3.4, '#fff2a0'); c.restore(); } },
  gunship: { hp: 26, r: 22, score: 1500, air: true, big: 1.6,
    up(e, dt) {
      if (e.ph === 0) { e.y += 90 * dt; if (e.y >= e.ty) { e.ph = 1; e.t = 0; } }
      else if (e.ph === 1) { e.x = e.x0 + 80 * Math.sin(e.t * .8); e.cool -= dt; if (e.cool <= 0) { e.cool = 1.35 / D().rate; aimed(e.x, e.y + 12, 3 + D().extra, .22); } if (e.t > 7) e.ph = 2; }
      else { e.y -= 70 * dt; if (e.y < -60) e.dead = true; }
    },
    dr(c, e) { c.save(); c.translate(e.x, e.y);
      exhaust(c, -18, -15, 3, 11, '#ff5ad8'); exhaust(c, 18, -15, 3, 11, '#ff5ad8'); exhaust(c, 0, -20, 2.5, 8, '#ff5ad8');
      poly(c, [-8, -10, -27, -3, -28, 8, -9, 9], hitCol(e, KESH.metal)); poly(c, [8, -10, 27, -3, 28, 8, 9, 9], hitCol(e, KESH.metal));
      poly(c, [-14, -6, -27, -1, -27, 2, -14, -2], hitCol(e, KESH.mid)); poly(c, [14, -6, 27, -1, 27, 2, 14, -2], hitCol(e, KESH.mid));
      for (const x of [-18, 18]) { ell(c, x, -2, 5, 13, hitCol(e, KESH.steel)); ell(c, x, -2, 2.5, 10, hitCol(e, KESH.metal)); circ(c, x, 9, 2, hitCol(e, KESH.light)); }
      poly(c, [0, 25, 8, 14, 10, -12, 6, -20, -6, -20, -10, -12, -8, 14], hitCol(e, KESH.steel));
      poly(c, [0, 25, 8, 14, 10, -12, 6, -20, 0, -20], hitCol(e, '#58516f'));
      c.strokeStyle = 'rgba(20,14,34,.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-8, 2); c.lineTo(8, 2); c.moveTo(-9, -10); c.lineTo(9, -10); c.moveTo(0, -20); c.lineTo(0, -12); c.stroke();
      canopy(c, 0, -5, 3.5, 5, KESH.light);
      circ(c, 0, 15, 4.5, KESH.dark); circ(c, 0, 15, 2.4, KESH.eye);
      if (Math.floor(e.t * 4) % 2) { circ(c, -27, 7, 1.8, '#ff3d6e'); circ(c, 27, 7, 1.8, '#5cf08a'); }
      c.restore(); } },
  freighter: { hp: 22, r: 22, score: 800, air: true, big: 1.4,
    up(e, dt) { e.x += e.vx * dt; e.y += 14 * dt; if (e.x < -90 || e.x > W + 90) e.dead = true; },
    dr(c, e) { c.save(); c.translate(e.x, e.y); if (e.vx < 0) c.scale(-1, 1); // the nose faces the way it's going
      exhaust(c, -30, -5, 3, 10, '#ffb347', -Math.PI / 2); exhaust(c, -30, 5, 3, 10, '#ffb347', -Math.PI / 2);
      c.fillStyle = hitCol(e, '#4f5770'); c.fillRect(-31, -9, 6, 18);
      c.fillStyle = hitCol(e, '#6f7892'); c.beginPath(); c.roundRect(-26, -13, 48, 26, 4); c.fill();
      c.fillStyle = hitCol(e, '#8e98b3'); c.fillRect(-26, -13, 48, 4);
      for (let i = -1; i <= 1; i++) { c.fillStyle = hitCol(e, ['#c0584a', '#4a8ac0', '#5fae5f'][i + 1]); c.fillRect(i * 14 - 6, -8, 12, 9); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(i * 14 - 6, -1, 12, 2); }
      for (let i = -4; i <= 3; i++) { c.fillStyle = i % 2 ? '#e8b923' : '#222'; c.fillRect(i * 6, 4, 6, 6); }
      poly(c, [22, -11, 33, -4, 33, 4, 22, 11], hitCol(e, '#8e98b3')); poly(c, [26, -6, 32, -2, 32, 2, 26, 6], '#9ff3ff');
      if (Math.floor(e.t * 3) % 2) circ(c, 0, -14, 2.2, '#5cf08a');
      c.restore(); } },
  mine: { hp: 4, r: 10, score: 300, air: true,
    up(e, dt) { e.y += 58 * dt; e.x += Math.sin(e.t * 1.3 + e.ph) * 14 * dt; },
    die(e) { ring(e.x, e.y, 8 + D().extra * 4, 115, e.t); },
    dr(c, e) { c.save(); c.translate(e.x, e.y); c.rotate(e.t * 1.6);
      for (let i = 0; i < 8; i++) { c.rotate(TAU / 8); poly(c, [-2, -8, 2, -8, 0, -14], hitCol(e, KESH.steel)); }
      circ(c, 0, 0, 9, hitCol(e, KESH.metal)); circ(c, 0, 0, 4 + Math.sin(e.t * 8), '#ff3d6e'); c.restore(); } },
  cloaker: { hp: 6, r: 13, score: 600, air: true,
    up(e, dt) {
      const cyc = e.t % 3.4; e.alpha = cyc < .6 ? cyc / .6 : cyc < 2.4 ? 1 : cyc < 3 ? 1 - (cyc - 2.4) / .6 : 0;
      if (cyc >= 1 && !e.shotThis) { e.shotThis = true; ring(e.x, e.y, 10 + D().extra * 4, 105); }
      if (cyc < .1 && e.t > 1) { e.shotThis = false; e.n = (e.n || 0) + 1; e.x = rr(50, W - 50); e.y = rr(70, 250); if (e.n > 2) e.dead = true; }
    },
    hittable: e => e.alpha > .6,
    dr(c, e) { if (e.alpha <= 0) return; c.save(); c.globalAlpha = e.alpha; c.translate(e.x, e.y);
      exhaust(c, -5, -6, 1.6, 6, '#9ff3ff'); exhaust(c, 5, -6, 1.6, 6, '#9ff3ff');
      const wing = [0, 15, 18, -3, 13, -8, 6, -4, 0, -11, -6, -4, -13, -8, -18, -3];
      poly(c, wing, hitCol(e, '#1f4a60'));
      c.strokeStyle = `rgba(159,243,255,${.5 + .3 * Math.sin(e.t * 6)})`; c.lineWidth = 1.2; c.beginPath(); for (let i = 0; i < wing.length; i += 2) c.lineTo(wing[i], wing[i + 1]); c.closePath(); c.stroke();
      poly(c, [0, 15, 6, -4, 0, -11], hitCol(e, '#2f6b8a'));
      canopy(c, 0, 2, 2.6, 5, '#9ff3ff'); circ(c, 0, 6, 1.6, KESH.eye);
      c.restore(); } },
  swarm: { hp: 1, r: 7, score: 60, air: true,
    up(e, dt) {
      if (e.t < 2.6) { const a = toP(e.x, e.y), cur = Math.atan2(e.vy, e.vx); let d = a - cur; d = Math.atan2(Math.sin(d), Math.cos(d)); const na = cur + clamp(d, -2.2 * dt, 2.2 * dt); e.vx = Math.cos(na) * 125; e.vy = Math.sin(na) * 125; }
      e.x += e.vx * dt; e.y += e.vy * dt;
    },
    dr(c, e) { c.save(); c.translate(e.x, e.y); c.rotate(Math.atan2(e.vy, e.vx) - Math.PI / 2);
      glow(c, 0, -5, 2.5 + R() * 1.5, '#ff6fd0', .5);
      poly(c, [0, 8, 6, -3, 3, -5, 0, -2, -3, -5, -6, -3], hitCol(e, '#b0408e')); poly(c, [0, 8, 2, -1, 0, -2, -2, -1], hitCol(e, '#ff9ae0'));
      circ(c, 0, 2, 1.4, '#ffe36a'); c.restore(); } },
  // Ground: they move with the scroll.
  turret: { hp: 7, r: 12, score: 300, air: false,
    up(e, dt) { e.ang = toP(e.x, e.y); e.cool -= dt; if (e.cool <= 0 && e.y > 20 && e.y < P.y - 70) { e.cool = 1.9 / D().rate; aimed(e.x, e.y, 1 + D().extra, .18, 140); } },
    dr(c, e) { c.save(); c.translate(e.x, e.y);
      poly(c, [-11, -16, 11, -16, 16, -11, 16, 11, 11, 16, -11, 16, -16, 11, -16, -11], 'rgba(0,0,0,.35)');
      poly(c, [-10, -14, 10, -14, 14, -10, 14, 10, 10, 14, -10, 14, -14, 10, -14, -10], '#2a2633');
      poly(c, [-9, -12, 9, -12, 12, -9, 12, 9, 9, 12, -9, 12, -12, 9, -12, -9], hitCol(e, '#4a4458'));
      for (const [bx, by] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) circ(c, bx, by, 1.2, '#7d7598');
      c.strokeStyle = '#6c6588'; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, 9, 0, TAU); c.stroke();
      c.rotate(e.ang - Math.PI / 2);
      if (shotFlash(e, 1.9)) { glow(c, 0, 24, 6, '#ffd08a', .7); circ(c, -2.5, 22, 2.5, '#fff3c0'); circ(c, 2.5, 22, 2.5, '#fff3c0'); }
      c.fillStyle = hitCol(e, '#1f1b28'); c.fillRect(-4, 2, 3, 19); c.fillRect(1, 2, 3, 19);
      c.fillStyle = hitCol(e, '#8d86a8'); c.fillRect(-4.5, 18, 4, 2.5); c.fillRect(.5, 18, 4, 2.5);
      circ(c, 0, 0, 7.5, hitCol(e, '#2a2638')); circ(c, 0, 0, 6.5, hitCol(e, KESH.mid)); circ(c, -1.5, -1.5, 3, hitCol(e, KESH.light));
      circ(c, 0, 2.5, 1.8, KESH.eye); c.restore(); } },
  tank: { hp: 6, r: 12, score: 350, air: false,
    up(e, dt) { e.x += e.vx * dt; if (e.x < 30 || e.x > W - 30) e.vx = -e.vx; e.ang = toP(e.x, e.y); e.cool -= dt; if (e.cool <= 0 && e.y > 20 && e.y < P.y - 70) { e.cool = 2.4 / D().rate; aimed(e.x, e.y, 1, 0, 150); } },
    dr(c, e) { c.save(); c.translate(e.x, e.y); // the hull faces the way it drives; the turret tracks you
      c.save(); if (e.vx < 0) c.scale(-1, 1);
      c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(-14, -10, 30, 24);
      c.fillStyle = '#17141c'; c.fillRect(-15, -13, 30, 7); c.fillRect(-15, 6, 30, 7);
      c.fillStyle = '#4a4458'; const off = (e.x * 1.2) % 5; for (let i = -1; i < 7; i++) { const xx = -15 + ((i * 5 - off) % 30 + 30) % 30; c.fillRect(xx, -13, 1.6, 7); c.fillRect(xx, 6, 1.6, 7); }
      c.fillStyle = hitCol(e, '#5c5040'); c.beginPath(); c.moveTo(-13, -7); c.lineTo(10, -7); c.lineTo(15, -3); c.lineTo(15, 3); c.lineTo(10, 7); c.lineTo(-13, 7); c.closePath(); c.fill();
      c.fillStyle = hitCol(e, '#7a6a50'); c.fillRect(-13, -7, 23, 3);
      c.fillStyle = '#2e281f'; for (let i = 0; i < 3; i++) c.fillRect(-12 + i * 2.5, -4, 1.2, 8);
      c.restore();
      c.rotate(e.ang - Math.PI / 2);
      if (shotFlash(e, 2.4)) { glow(c, 0, 19, 5, '#ffd08a', .7); circ(c, 0, 18, 2.6, '#fff3c0'); }
      c.fillStyle = hitCol(e, '#2e281f'); c.fillRect(-1.8, 0, 3.6, 16); c.fillRect(-2.6, 13, 5.2, 3);
      ell(c, 0, 0, 7, 6.5, hitCol(e, '#8a7a58')); ell(c, 0, -.5, 5.5, 5, hitCol(e, '#a08e66'));
      circ(c, -2, -2, 1.8, '#3a3226'); circ(c, 2.5, 1, 1, KESH.eye); c.restore(); } },
  bunker: { hp: 20, r: 19, score: 1200, air: false, big: 1.4,
    up(e, dt) { e.cool -= dt; if (e.cool <= 0 && e.y > 30 && e.y < P.y - 90) { e.cool = 2.6 / D().rate; aimed(e.x, e.y, 5 + D().extra * 2, .2, 130); } },
    dr(c, e) { c.save(); c.translate(e.x, e.y);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(-17, -15, 42, 40);
      poly(c, [-22, -22, 22, -22, 22, 22, -22, 22], '#2a2638');
      poly(c, [-22, -22, 22, -22, 15, -15, -15, -15], hitCol(e, '#7a7395')); poly(c, [-22, -22, -15, -15, -15, 15, -22, 22], hitCol(e, '#625b7a'));
      poly(c, [22, -22, 22, 22, 15, 15, 15, -15], hitCol(e, '#3f3a55')); poly(c, [-22, 22, -15, 15, 15, 15, 22, 22], hitCol(e, '#36314a'));
      c.fillStyle = hitCol(e, '#4c4760'); c.fillRect(-15, -15, 30, 30);
      c.strokeStyle = 'rgba(20,16,30,.5)'; c.lineWidth = 1; c.strokeRect(-11, -11, 22, 22);
      const fl = shotFlash(e, 2.6);
      for (let i = -2; i <= 2; i++) { c.fillStyle = '#16131c'; c.fillRect(i * 5 - 1.5, 13, 3, 11); if (fl) glow(c, i * 5, 26, 3.5, '#ffd08a', .8); }
      circ(c, 0, -2, 8.5, hitCol(e, KESH.metal)); circ(c, 0, -2, 7, hitCol(e, KESH.dark)); circ(c, 0, -2, 3 + Math.sin(e.t * 5), KESH.eye);
      for (const [bx, by] of [[-18, -18], [18, -18], [-18, 18], [18, 18]]) circ(c, bx, by, 1.3, '#8d86a8');
      if (Math.floor(e.t * 2) % 2) circ(c, 12, -12, 1.6, '#ff3d6e');
      c.restore(); } },
  cache: { hp: 3, r: 11, score: 100, air: false,
    die(e) { G.it.push({ k: 'gem', x: e.x, y: e.y, t: 0, r: 9 }); },
    dr(c, e) { c.save(); c.translate(e.x, e.y); // an armoured Kesh crystal store with a glass roof
      const oct = r => { const p = []; for (let i = 0; i < 8; i++) { const a = (i + .5) / 8 * TAU; p.push(Math.cos(a) * r, Math.sin(a) * r); } return p; };
      c.save(); c.translate(2, 3); poly(c, oct(15), 'rgba(0,0,0,.35)'); c.restore();
      poly(c, oct(15), '#2a2633'); poly(c, oct(13), hitCol(e, '#4a4458'));
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + TAU / 8; c.fillStyle = '#6c6588'; c.save(); c.rotate(a); c.fillRect(-2, -15, 4, 4); c.restore(); }
      circ(c, 0, 0, 9.5, '#0e2a22');
      poly(c, [-5, 5, -2.5, -7, 0, 5], hitCol(e, '#3fe0a0')); poly(c, [0, 6, 3.5, -8.5, 7, 6], hitCol(e, '#7dffc8')); poly(c, [-7.5, 6, -6.5, -2, -3, 6], hitCol(e, '#2fb880'));
      glow(c, 0, 0, 9.5, '#7dffc8', .12 + .1 * Math.sin(e.t * 4));
      c.strokeStyle = 'rgba(200,255,235,.35)'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 9.5, Math.PI * 1.1, Math.PI * 1.55); c.stroke();
      c.strokeStyle = '#6c6588'; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, 9.5, 0, TAU); c.stroke();
      if (Math.floor(e.t * 2) % 2) circ(c, 10, -6, 1.4, '#7dffc8');
      c.restore(); } },
  cage: { hp: 14, r: 16, score: 500, air: false, big: 1.2,
    die(e) { G.it.push({ k: 'pod', x: e.x, y: e.y, t: 0, r: 13 }); G.txt.push({ x: e.x, y: e.y - 26, s: 'PICK UP THE PILOT', t: 2, col: '#ffcc33' }); },
    dr(c, e) { c.save(); c.translate(e.x, e.y); // a Kesh holding cell: an armoured ring with a force field over the captured pilot
      circ(c, 2, 3, 21, 'rgba(0,0,0,.35)');
      circ(c, 0, 0, 20, '#1c1626'); circ(c, 0, 0, 18, hitCol(e, '#4a4458'));
      for (let i = 0; i < 6; i++) { c.save(); c.rotate(i / 6 * TAU); c.fillStyle = hitCol(e, '#2a2633'); c.fillRect(-3.5, -20, 7, 6); circ(c, 0, -17, 1.6, Math.floor(e.t * 4 + i) % 3 ? '#ff3d6e' : '#5b1f3a'); c.restore(); }
      circ(c, 0, 0, 13, '#0b0a14');
      // the pilot, in a white suit and helmet, waving
      ell(c, 0, 2, 5.5, 4, '#eef3ff'); c.fillStyle = '#ff8a3d'; c.fillRect(-5.5, 1.3, 11, 1.6);
      c.strokeStyle = '#eef3ff'; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); c.moveTo(4, 0); c.lineTo(8, -4 + 2 * Math.sin(e.t * 8)); c.stroke(); c.lineCap = 'butt';
      circ(c, 0, -3.5, 3.4, '#eef3ff'); ell(c, 0, -3, 2.3, 1.4, '#39d5ff');
      // force field: shimmering bars
      c.globalAlpha = .55 + .25 * Math.sin(e.t * 10); c.strokeStyle = hitCol(e, '#c98cff'); c.lineWidth = 1.6;
      for (let i = -9; i <= 9; i += 4.5) { const h = Math.sqrt(169 - i * i); c.beginPath(); c.moveTo(i, -h); c.lineTo(i, h); c.stroke(); }
      c.globalAlpha = .2; circ(c, 0, 0, 13, '#c98cff'); c.globalAlpha = 1;
      if (Math.floor(e.t * 3) % 2) circ(c, 0, -22, 2, '#ffcc33');
      c.restore(); } },
  gate: { hp: 0, r: 22, score: 0, air: false, nohit: true,
    up(e, dt) { if (!G.trans && P.alive && (e.lesson || P.inv < 2) && Math.hypot(P.x - e.x, P.y - e.y) < 22) startDive(e); },
    dr(c, e) { c.save(); c.translate(e.x, e.y); // a launch silo: hazard-striped collar, iris shutter, and guide lights chasing inwards
      const oct = r => { const p = []; for (let i = 0; i < 8; i++) { const a = (i + .5) / 8 * TAU; p.push(Math.cos(a) * r, Math.sin(a) * r); } return p; };
      c.save(); c.translate(3, 4); poly(c, oct(30), 'rgba(0,0,0,.4)'); c.restore();
      poly(c, oct(30), '#22202a'); poly(c, oct(28), '#4a4458');
      for (let i = 0; i < 8; i++) { c.save(); c.rotate((i + .5) / 8 * TAU); circ(c, 0, -26, 1.3, '#8d86a8'); c.restore(); }
      c.save(); c.rotate(e.t * .8); for (let i = 0; i < 16; i++) { c.rotate(TAU / 16); c.fillStyle = i % 2 ? '#ffcc33' : '#1a1a1a'; c.beginPath(); c.moveTo(-4.4, -24); c.lineTo(4.4, -24); c.lineTo(3.4, -19); c.lineTo(-3.4, -19); c.fill(); } c.restore();
      circ(c, 0, 0, 19, '#0a0a12');
      for (let i = 0; i < 3; i++) { const s = 1 - ((e.t * .9 + i / 3) % 1); c.globalAlpha = 1 - s * .6; c.strokeStyle = '#39d5ff'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 17 * s, 0, TAU); c.stroke(); }
      c.globalAlpha = 1;
      const open = .55 + .12 * Math.sin(e.t * 2); // iris blades, half open, breathing slightly
      for (let i = 0; i < 6; i++) { c.save(); c.rotate(i / 6 * TAU + e.t * .2); c.fillStyle = 'rgba(60,56,76,.9)'; c.beginPath(); c.moveTo(0, -19); c.lineTo(11 * (1 - open) + 5, -19 + 15 * (1 - open)); c.lineTo(-2, -19 + 4); c.fill(); c.restore(); }
      for (let i = 0; i < 8; i++) { const lit = Math.floor(e.t * 8) % 8 === i; c.save(); c.rotate(i / 8 * TAU); poly(c, [-2.2, -17.5, 2.2, -17.5, 0, -14.5], lit ? '#ffffff' : '#39d5ff'); c.restore(); }
      c.restore(); } },
};

function spawnEnemy(k, props) {
  const def = EK[k];
  const e = { k, x: 180, y: -30, t: 0, ph: 0, flash: 0, hp: def.hp * (def.nohit ? 1 : sh()), r: def.r, cool: rr(.4, 1.4), ang: Math.PI / 2, vx: 0, vy: 0, alpha: 1, ...props };
  e.maxHp = e.hp; G.en.push(e); if (!def.nohit && k !== 'cache') G.spawned++;
  return e;
}

// ---------- Waves ----------
function spawnWave(w, ev) {
  const side = ev.side || (R() < .5 ? -1 : 1);
  switch (w) {
    case 'darters': {
      const id = 'f' + Math.floor(R() * 1e9); G.form[id] = { left: 5, broken: false };
      const fire = G.diff > 0 || G.si > 1;
      for (let i = 0; i < 5; i++) spawnEnemy('darter', { side, form: id, t: -i * .26, ph: 0, x: -50, y: -50, fireAt: fire && R() < .3 + G.si * .06 ? rr(1.4, 2.6) : 0 });
      break;
    }
    case 'divers': { const n = 2 + (G.si > 2 ? 1 : 0), x0 = G.mode === 'cave' ? 100 : 60, span = G.mode === 'cave' ? 160 : 240; for (let i = 0; i < n; i++) spawnEnemy('diver', { x: x0 + (i + .5) * (span / n) + rr(-12, 12), y: -20 - i * 30, stopY: rr(110, 230) }); break; }
    case 'weavers': { const x0 = G.mode === 'cave' ? clamp(ev.x, 152, 208) : clamp(ev.x, 70, W - 70); for (let i = 0; i < 6; i++) spawnEnemy('weaver', { x0, x: x0, y: -20 - i * 34, ph: i * .5, fireAt: R() < .25 + G.si * .05 ? rr(140, 260) : 0 }); break; }
    case 'risers': { G.warnUp = { x: ev.x, t: .9 }; for (let i = 0; i < 3; i++) spawnEnemy('riser', { x0: ev.x + (i - 1) * 34, x: ev.x + (i - 1) * 34, y: H + 24, delay: .9 + i * .22 }); break; }
    case 'gunship': spawnEnemy('gunship', { x0: clamp(ev.x, 110, 250), x: clamp(ev.x, 110, 250), y: -40, ty: rr(90, 140) }); break;
    case 'freighter': spawnEnemy('freighter', { x: side < 0 ? -60 : W + 60, y: rr(80, 150), vx: side < 0 ? 46 : -46 }); break;
    case 'mines': for (let i = 0; i < 3; i++) spawnEnemy('mine', { x: clamp(ev.x + (i - 1) * 70, 30, W - 30), y: -20 - i * 40, ph: i }); break;
    case 'cloaker': spawnEnemy('cloaker', { x: rr(60, 300), y: rr(80, 220), alpha: 0 }); break;
    case 'swarm': for (let i = 0; i < 6 + G.si; i++) { const x = G.mode === 'cave' ? clamp(ev.x + rr(-40, 40), 100, 260) : clamp(ev.x + rr(-60, 60), 20, W - 20); spawnEnemy('swarm', { x, y: -20 - i * 16, vx: 0, vy: 125 }); } break;
    case 'turret': case 'tank': case 'bunker': case 'cache': case 'cage':
      spawnEnemy(w, { x: ev.x, y: -30, vx: w === 'tank' ? (R() < .5 ? -32 : 32) : 0 }); break;
    // Cave turrets sit by the wall, but never further out than the ship can reach anywhere in the cave (the walls snake about).
    case 'cturret': { const g = H + G.cd + 30, left = R() < .5; spawnEnemy('turret', { x: left ? Math.max(caveL(g) + 16, 84) : Math.min(caveR(g) - 16, 276), y: -30 }); break; }
    case 'gate': spawnEnemy('gate', { x: ev.x, y: -30 }); G.gateHint = 4; break;
    case 'boss': spawnBoss(BOSSES[STAGES[G.si].boss]); break;
    case 'cboss': spawnBoss(CAVE_BOSSES[G.si], true); break;
    case 'exit': startSurface(); break;
  }
}

// A stage's script is the same every time you play it, so it can be learned.
const POOLS = [
  [['weavers', 4], ['divers', 3], ['mines', 1], ['gunship', 1], ['risers', 1]],
  [['weavers', 3], ['divers', 3], ['risers', 2], ['gunship', 2], ['mines', 2]],
  [['weavers', 2], ['divers', 3], ['cloaker', 3], ['gunship', 2], ['risers', 2], ['mines', 1]],
  [['swarm', 4], ['divers', 2], ['weavers', 2], ['cloaker', 1], ['gunship', 2], ['risers', 2]],
  [['mines', 3], ['divers', 3], ['swarm', 2], ['gunship', 2], ['cloaker', 2], ['risers', 2], ['weavers', 1]],
  [['gunship', 3], ['divers', 3], ['swarm', 2], ['cloaker', 2], ['mines', 2], ['risers', 2], ['weavers', 2]],
];
const GROUND = [
  [['turret', 4], ['tank', 3], ['cache', 1], ['bunker', 1]],
  [['turret', 3], ['tank', 4], ['cache', 1], ['bunker', 1]],
  [['turret', 4], ['tank', 1], ['cache', 1], ['bunker', 2]],
  [['turret', 4], ['tank', 2], ['cache', 1], ['bunker', 2]],
  [['turret', 4], ['tank', 2], ['cache', 1], ['bunker', 2]],
  [['turret', 5], ['tank', 2], ['cache', 1], ['bunker', 3]],
];
const pickW = (pool, r) => { const tot = pool.reduce((s, p) => s + p[1], 0); let x = r() * tot; for (const p of pool) if ((x -= p[1]) < 0) return p[0]; return pool[0][0]; };
const STAGE_T = 92, GATE_T = 44;
function buildTimeline(si) {
  const r = rng((G.daily ? G.daily.seed : 5000) + si * 7919), ev = [];
  let t = 3;
  while (t < STAGE_T - 7) {
    let w = pickW(POOLS[si], r);
    if (w === 'gunship' && t < 18) w = 'weavers';
    if (Math.abs(t - GATE_T) > 3) ev.push({ t, w, x: 50 + r() * 260, side: r() < .5 ? -1 : 1 });
    t += (3.3 - si * .2) * (.75 + r() * .5);
  }
  for (const ft of [12, 40, 68]) ev.push({ t: ft + si * .7, w: 'freighter', side: r() < .5 ? -1 : 1 });
  for (let ft = 7; ft < STAGE_T - 6; ft += 16) ev.push({ t: ft, w: 'darters', side: r() < .5 ? -1 : 1 });
  for (let gt = 4; gt < STAGE_T - 5; gt += 1.9 - si * .1 + r() * .9) if (Math.abs(gt - GATE_T) > 2.5) ev.push({ t: gt, w: pickW(GROUND[si], r), x: 40 + r() * 280 });
  ev.push({ t: GATE_T, w: 'gate', x: 110 + r() * 140 });
  ev.push({ t: STAGE_T, w: 'boss' });
  return ev.sort((a, b) => a.t - b.t);
}
const CAVE_T = 30;
function buildCave(si) {
  const r = rng(9000 + si * 31), ev = [];
  for (let t = 2; t < CAVE_T - 3; t += 2.6 + r()) ev.push({ t, w: 'cturret' });
  for (let t = 3; t < CAVE_T - 4; t += 4.5 + r() * 2) ev.push({ t, w: r() < .5 ? 'swarm' : r() < .5 ? 'weavers' : 'divers', x: 100 + r() * 160 });
  [5, 11, 21].forEach(t => ev.push({ t, w: 'cache', x: 120 + r() * 120 }));
  ev.push({ t: 15, w: 'cage', x: 140 + r() * 80 });
  ev.push({ t: 9 + r() * 4, w: 'mines', x: 180 });
  ev.push({ t: CAVE_T, w: 'cboss' }); // the way back up is guarded; beating it takes you to the surface
  return ev.sort((a, b) => a.t - b.t);
}

// ---------- Bosses ----------
// Parts with guns; the core (core: true) is shielded until every other part is gone.
// Cave guardians: one per stage, at the end of each cave, in front of the way back up. Smaller than the stage bosses
// so they fit between the cave walls, and each built differently. Every part sits beside or in front of the core,
// never behind it, so it can always be shot; the core opens when the rest are gone.
const guardian = (name, look, accent, parts) => ({ name, look, accent, ty: 130, parts,
  move(b, t) { b.x = 180 + 26 * Math.sin(t * .6); b.y = b.ty + 8 * Math.sin(t * 1.2); } });
const pair = (dx, dy, r, hp, look, pats) => [{ dx: -dx, dy, r, hp, look, pats }, { dx, dy, r, hp, look, pats: pats.map(p => [p[0], p[1], (p[2] || 0) + .6]) }];
const CAVE_BOSSES = [
  guardian('TUNNEL WARDEN', 'driller', '#7a35b8', [...pair(54, 14, 13, 26, 'drill', [['aim1', 1.5]]),
    { dx: 0, dy: 36, r: 10, hp: 20, look: 'gun', pats: [['aim1', 1.9]] }, { dx: 0, dy: -2, r: 18, hp: 70, look: 'core', core: true, pats: [['ring', 2.6]] }]),
  guardian('SAND BORER', 'borer', '#c98a3a', [...pair(46, -12, 11, 24, 'gun', [['aim1', 1.3]]),
    { dx: 0, dy: 42, r: 14, hp: 30, look: 'cutter', pats: [['aim3', 2.1]] }, { dx: 0, dy: -16, r: 17, hp: 70, look: 'core', core: true, pats: [['fan5', 2], ['aim1', 1.6, .5]] }]),
  guardian('ICE DRILL', 'crystal', '#7fd6ff', [...pair(52, 0, 12, 26, 'shard', [['aim3', 1.9]]),
    { dx: 0, dy: 38, r: 11, hp: 20, look: 'shard', pats: [['aim1', 1.3]] }, { dx: 0, dy: -8, r: 18, hp: 70, look: 'core', core: true, pats: [['spiral', .14]] }]),
  guardian('ROOT HORROR', 'roots', '#d04fa8', [...pair(50, 8, 13, 26, 'sac', [['aim1', 1.2]]),
    { dx: 0, dy: 36, r: 11, hp: 22, look: 'maw', pats: [['swarm', 4.5]] }, { dx: 0, dy: -6, r: 19, hp: 70, look: 'core', core: true, pats: [['ring', 2.2], ['aim3', 1.8, .7]] }]),
  guardian('LAVA DIGGER', 'digger', '#ff6a1a', [...pair(58, 22, 13, 26, 'scoop', [['aim3', 1.6]]),
    { dx: 0, dy: 34, r: 10, hp: 20, look: 'gun', pats: [['stream', 2]] }, { dx: 0, dy: -6, r: 18, hp: 70, look: 'core', core: true, pats: [['spiral', .12], ['aim1', 1.4]] }]),
  guardian('CITADEL GATE', 'citadel', '#39d5ff', [...pair(60, -2, 13, 28, 'tower', [['aim3', 1.4]]),
    { dx: 0, dy: 30, r: 10, hp: 20, look: 'gun', pats: [['stream', 1.7]] }, { dx: 0, dy: -8, r: 18, hp: 70, look: 'core', core: true, pats: [['spiral', .1], ['ring', 2]] }]),
];
const BOSSES = [
  { name: 'THE WARDEN', look: 'warden', ty: 130,
    parts: [{ dx: -56, dy: 10, r: 15, hp: 42, look: 'gun', pats: [['aim3', 1.6]] }, { dx: 56, dy: 10, r: 15, hp: 42, look: 'gun', pats: [['aim3', 1.6, .8]] },
      { dx: 0, dy: -2, r: 21, hp: 90, look: 'core', core: true, pats: [['ring', 2.2], ['aim3', 1.2, .6]] }],
    move(b, t) { b.x = 180 + 75 * Math.sin(t * .5); b.y = b.ty + 10 * Math.sin(t * 1.3); } },
  { name: 'DUNE RAIDER', look: 'crawler', ty: 150,
    parts: [{ dx: -48, dy: -30, r: 12, hp: 32, look: 'gun', pats: [['aim1', 1.1]] }, { dx: 48, dy: -30, r: 12, hp: 32, look: 'gun', pats: [['aim1', 1.1, .5]] },
      { dx: -48, dy: 30, r: 12, hp: 32, look: 'gun', pats: [['aim1', 1.3, .3]] }, { dx: 48, dy: 30, r: 12, hp: 32, look: 'gun', pats: [['aim1', 1.3, .9]] },
      { dx: 0, dy: 0, r: 22, hp: 110, look: 'core', core: true, pats: [['fan5', 1.5], ['stream', 2.2, 1]] }],
    move(b, t) { b.x = 180 + 55 * Math.sin(t * .35); b.y = b.ty + 14 * Math.sin(t * .7); } },
  { name: 'FROST MANTIS', look: 'mantis', ty: 125,
    parts: [{ dx: -60, dy: 30, r: 15, hp: 48, look: 'claw', pats: [['fan5', 1.9]] }, { dx: 60, dy: 30, r: 15, hp: 48, look: 'claw', pats: [['fan5', 1.9, .95]] },
      { dx: -26, dy: -24, r: 10, hp: 30, look: 'gun', pats: [['aim1', 1.2]] }, { dx: 26, dy: -24, r: 10, hp: 30, look: 'gun', pats: [['aim1', 1.2, .6]] },
      { dx: 0, dy: -4, r: 20, hp: 120, look: 'core', core: true, pats: [['spiral', .11], ['aim3', 1.6]] }],
    move(b, t) {
      b.x = 180 + 60 * Math.sin(t * .45); b.y = b.ty + 8 * Math.sin(t * 1.1);
      const s = Math.sin(t * 1.3); b.parts[0].dx = -58 - 16 * s; b.parts[0].dy = 34 + 18 * Math.cos(t * 1.3); b.parts[1].dx = 58 + 16 * s; b.parts[1].dy = 34 - 18 * Math.cos(t * 1.3);
    } },
  { name: 'HIVE MOTHER', look: 'hive', ty: 140,
    parts: [{ dx: -62, dy: 16, r: 16, hp: 50, look: 'sac', pats: [['swarm', 4.2], ['ring', 3.1, 1.5]] }, { dx: 62, dy: 16, r: 16, hp: 50, look: 'sac', pats: [['swarm', 4.2, 2.1], ['ring', 3.1, 3]] },
      { dx: 0, dy: 50, r: 15, hp: 50, look: 'sac', pats: [['aim3', 1.7]] },
      { dx: 0, dy: -4, r: 24, hp: 130, look: 'core', core: true, pats: [['spiral', .1], ['aim3', 1.4], ['swarm', 5]] }],
    move(b, t) { b.x = 180 + 70 * Math.sin(t * .4); b.y = b.ty + 22 * Math.sin(t * .8); } },
  { name: 'MAGMA ENGINE', look: 'engine', ty: 150,
    parts: [0, 1, 2, 3, 4, 5].map(i => ({ dx: 0, dy: 0, r: 12, hp: 34, look: 'gun', pats: [['aim1', 1.7, i * .28]], orb: i }))
      .concat([{ dx: 0, dy: 0, r: 24, hp: 150, look: 'core', core: true, pats: [['ring', 1.4], ['aim3', 1.0, .5]] }]),
    move(b, t) {
      b.x = 180 + 40 * Math.sin(t * .5); b.y = b.ty + 10 * Math.sin(t * .9);
      for (const p of b.parts) if (p.orb !== undefined) { const a = t * .8 + p.orb / 6 * TAU; p.dx = Math.cos(a) * 64; p.dy = Math.sin(a) * 52; }
    } },
  { name: 'KESH DREADNOUGHT', look: 'dread', ty: 140,
    parts: [{ dx: -104, dy: 26, r: 15, hp: 55, look: 'cannon', pats: [['fan5', 1.8]] }, { dx: 104, dy: 26, r: 15, hp: 55, look: 'cannon', pats: [['fan5', 1.8, .9]] },
      { dx: -52, dy: -30, r: 12, hp: 45, look: 'gun', pats: [['stream', 1.4]] }, { dx: 52, dy: -30, r: 12, hp: 45, look: 'gun', pats: [['stream', 1.4, .7]] },
      { dx: -128, dy: -44, r: 14, hp: 45, look: 'hangar', pats: [['darters', 8]] }, { dx: 128, dy: -44, r: 14, hp: 45, look: 'hangar', pats: [['mines', 6, 3]] },
      { dx: 0, dy: 8, r: 28, hp: 190, look: 'core', core: true, pats: [['spiral', .09], ['ring', 1.7], ['aim3', 1.2, .4]] }],
    move(b, t) { b.x = 180 + 26 * Math.sin(t * .4); b.y = b.ty + 10 * Math.sin(t * .9); } },
];
function spawnBoss(def, cave = false) {
  const m = (1 + .12 * G.si) * D().hp;
  G.boss = { def, cave, x: 180, y: -150, ty: def.ty, t: 0, enter: 3, dying: 0, alive: true,
    parts: def.parts.map(p => ({ ...p, hp: p.hp * m, max: p.hp * m, alive: true, flash: 0, cool: p.pats.map(pt => (pt[2] || 0) + 1.2), spa: R() * TAU })) };
  G.bossWarn = 2.6; sfx.warn();
}
function bossFire(b, p, pat) {
  const x = b.x + p.dx, y = b.y + p.dy, ex = D().extra;
  switch (pat) {
    case 'aim1': aimed(x, y, 1 + ex, .18, 165); break;
    case 'aim3': aimed(x, y, 3 + ex, .2, 155); break;
    case 'fan5': aimed(x, y, 5 + ex * 2, .17, 140, true); break;
    case 'stream': { const a = toP(x, y); for (let i = 0; i < 4 + ex; i++) shoot(x, y, a, 120 + i * 22); break; }
    case 'ring': ring(x, y, 12 + ex * 4, 110, R() * TAU, true); break;
    case 'spiral': p.spa += .27; shoot(x, y, p.spa, 115); shoot(x, y, p.spa + Math.PI, 115); if (ex) shoot(x, y, p.spa + Math.PI / 2, 115); break;
    case 'swarm': for (let i = 0; i < 3; i++) spawnEnemy('swarm', { x: x + rr(-10, 10), y, vx: rr(-60, 60), vy: 100 }); break;
    case 'darters': spawnWave('darters', { side: R() < .5 ? -1 : 1 }); break;
    case 'mines': for (let i = 0; i < 2; i++) spawnEnemy('mine', { x: clamp(x + (i ? 40 : -40), 30, W - 30), y }); break;
  }
}
function coreOpen(b) { return b.parts.every(p => p.core || !p.alive) || b.t > 80; }
function updateBoss(dt) {
  const b = G.boss; if (!b) return;
  b.t += dt;
  if (b.dying > 0) {
    b.dying -= dt;
    if (R() < .35) explode(b.x + rr(-70, 70), b.y + rr(-40, 40), 1.2);
    if (b.dying <= 0) {
      explode(b.x, b.y, 3); G.flash = .8; buzz(120);
      if (b.cave) { G.boss = null; startSurface(); } else { G.boss = null; G.clearT = 2.6; }
    }
    return;
  }
  if (b.enter > 0) { b.enter -= dt; b.y += (b.ty - b.y) * Math.min(1, dt * 1.6); b.x += (180 - b.x) * dt; b.t = 0; return; }
  b.def.move(b, b.t);
  const open = coreOpen(b);
  for (const p of b.parts) {
    if (!p.alive) continue;
    p.flash = Math.max(0, p.flash - dt);
    if (p.core && !open) continue;
    p.pats.forEach((pt, i) => { p.cool[i] -= dt; if (p.cool[i] <= 0) { p.cool[i] += pt[1] / (pt[0] === 'spiral' ? 1 : D().rate); if (P.alive || R() < .3) bossFire(b, p, pt[0]); } });
  }
}
function hitBossPart(b, p, dmg) {
  if (p.core && !coreOpen(b)) { if (R() < .3) burst(b.x + p.dx, b.y + p.dy, 2, ['#9ff3ff'], 60, .2, 1.5); return false; }
  p.hp -= dmg; p.flash = .05;
  if (p.hp <= 0) {
    p.alive = false; explode(b.x + p.dx, b.y + p.dy, p.core ? 2.5 : 1.5); if (!p.core) addScore(2500, b.x + p.dx, b.y + p.dy, true);
    if (p.core) {
      b.dying = 2.4; b.parts.forEach(q => q.alive = false); G.eb.length = 0;
      addScore(b.cave ? 8000 + 4000 * G.si : 20000 + 10000 * G.si, b.x, b.y, true); sfx.clear();
    } else if (coreOpen(b)) G.txt.push({ x: b.x, y: b.y - 50, s: 'CORE EXPOSED', t: 1.6, col: '#ffcc33', big: true });
  }
  return true;
}
function drawBoss(c) {
  const b = G.boss; if (!b) return;
  const { x, y } = b, look = b.def.look, t = b.t, open = coreOpen(b);
  c.save();
  if (b.dying > 0) c.translate(rr(-3, 3), rr(-3, 3));
  // Body: every boss is a Kesh warship, nose down, engines at the back (top). Drawn round the gun and core positions.
  c.save(); c.translate(x, y);
  const lines = (pts, col, w = 1) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); for (let i = 0; i < pts.length; i += 4) { c.moveTo(pts[i], pts[i + 1]); c.lineTo(pts[i + 2], pts[i + 3]); } c.stroke(); };
  const blink = (px, py, k, on, off) => circ(c, px, py, 2.2, Math.floor(t * 3 + k) % 2 ? on : off);
  if (look === 'warden') { // battlecruiser with swept wings
    for (const ex of [-44, -20, 20, 44]) exhaust(c, ex, -32, 4.5, 18, '#ff5ad8');
    poly(c, [-98, 4, -72, -28, -24, -36, 24, -36, 72, -28, 98, 4, 66, 24, 24, 32, 0, 52, -24, 32, -66, 24], '#2c2740');
    poly(c, [-88, 2, -66, -22, -22, -29, 22, -29, 66, -22, 88, 2, 60, 18, 20, 25, 0, 42, -20, 25, -60, 18], '#4b4566');
    poly(c, [-86, 0, -64, -18, -30, -22, -40, -6], '#7a35b8'); poly(c, [86, 0, 64, -18, 30, -22, 40, -6], '#7a35b8');
    for (const sx of [-44, 44]) { ell(c, sx, -16, 8, 18, '#6c6588'); ell(c, sx, -16, 4, 14, '#3a3350'); }
    poly(c, [-16, -30, 16, -30, 12, 30, 0, 40, -12, 30], '#6c6588'); poly(c, [0, -30, 16, -30, 12, 30, 0, 40], '#58516f');
    lines([-60, 18, -22, -2, 60, 18, 22, -2, -80, -4, -50, -4, 80, -4, 50, -4], 'rgba(15,10,28,.6)');
    poly(c, [-5, 26, 5, 26, 3, 34, -3, 34], '#ff4f8b');
    for (let i = -3; i <= 3; i++) if (i) blink(i * 26, 22 - Math.abs(i) * 1.5, i, '#ff3d6e', '#5b1f3a');
  } else if (look === 'crawler') { // heavy armoured gunship skimming the dunes
    for (const ex of [-34, 0, 34]) exhaust(c, ex, -48, 6, 20, '#ffb347');
    poly(c, [-64, -40, -40, -50, 40, -50, 64, -40, 66, 36, 40, 54, -40, 54, -66, 36], '#3e3324');
    poly(c, [-58, -36, -36, -44, 36, -44, 58, -36, 60, 32, 36, 48, -36, 48, -60, 32], '#7d6a45');
    poly(c, [-58, -36, -36, -44, 36, -44, 58, -36, 50, -30, -50, -30], '#9c8658');
    for (const sx of [-1, 1]) { poly(c, [sx * 60, -20, sx * 80, -12, sx * 80, 14, sx * 60, 22], '#5c4d31'); poly(c, [sx * 80, -12, sx * 86, -6, sx * 86, 8, sx * 80, 14], '#3e3324'); }
    c.fillStyle = '#e8b923'; for (let i = -3; i <= 3; i++) { c.save(); c.translate(i * 14, 42); c.transform(1, 0, -.6, 1, 0, 0); c.fillRect(-4, -3, 8, 6); c.restore(); }
    lines([-60, 0, -36, 0, 60, 0, 36, 0, -24, -44, -24, -30, 24, -44, 24, -30], 'rgba(40,28,10,.6)', 1.2);
    for (const [bx, by, k] of [[-62, 34, 0], [62, 34, 1], [-62, -36, 1], [62, -36, 0]]) blink(bx, by, k, '#ff3d6e', '#4a2410');
  } else if (look === 'mantis') { // ice-blue hunter with two mechanical grabbing arms
    exhaust(c, -14, -40, 5, 16, '#9ff3ff'); exhaust(c, 14, -40, 5, 16, '#9ff3ff');
    for (const p of b.parts.slice(0, 2)) {
      if (!p.alive) continue;
      const sd = Math.sign(p.dx), jx = sd * 44, jy = -18 + (p.dy - 34) * .3;
      c.lineCap = 'round'; c.strokeStyle = '#2b4458'; c.lineWidth = 8; c.beginPath(); c.moveTo(sd * 26, -8); c.lineTo(jx, jy); c.lineTo(p.dx, p.dy - 8); c.stroke();
      c.strokeStyle = '#6fa8c8'; c.lineWidth = 3; c.stroke(); c.lineCap = 'butt';
      circ(c, jx, jy, 5.5, '#3d5e78'); circ(c, jx, jy, 2.5, '#9ff3ff');
    }
    poly(c, [-40, -14, -26, -34, -10, -38, 10, -38, 26, -34, 40, -14, 28, 6, 14, 38, 0, 58, -14, 38, -28, 6], '#24465c');
    poly(c, [-34, -14, -22, -30, 22, -30, 34, -14, 24, 4, 10, 34, 0, 50, -10, 34, -24, 4], '#3d7ea2');
    poly(c, [0, -30, 22, -30, 34, -14, 24, 4, 10, 34, 0, 50], '#336c8c');
    lines([-24, 4, 24, 4, -10, 34, 10, 34, 0, -30, 0, -20], 'rgba(10,30,45,.6)');
    canopy(c, 0, 24, 5, 10, '#9ff3ff');
    blink(-36, -14, 0, '#9ff3ff', '#1d3a4c'); blink(36, -14, 1, '#9ff3ff', '#1d3a4c');
  } else if (look === 'hive') { // carrier: a broad hull of launch bays that the swarm drones fly out of
    const pu = 1 + .03 * Math.sin(t * 3);
    for (const ex of [-54, -18, 18, 54]) exhaust(c, ex, -44, 5, 16, '#ff6fd0');
    poly(c, [-100, 10, -78, -30, -40, -46, 40, -46, 78, -30, 100, 10, 74, 40, 24, 54, 0, 72, -24, 54, -74, 40], '#2e1830');
    poly(c, [-90, 10, -70, -24, -36, -38, 36, -38, 70, -24, 90, 10, 66, 34, 20, 46, 0, 62, -20, 46, -66, 34], '#5c2a5e');
    c.strokeStyle = `rgba(255,111,208,${.35 + .2 * Math.sin(t * 3)})`; c.lineWidth = 2 * pu;
    c.beginPath(); c.moveTo(-84, 8); c.lineTo(-40, 0); c.lineTo(-20, -30); c.lineTo(20, -30); c.lineTo(40, 0); c.lineTo(84, 8); c.moveTo(-40, 0); c.lineTo(0, 30); c.lineTo(40, 0); c.stroke();
    for (const [bx, by] of [[-62, 16], [62, 16], [0, 50]]) { circ(c, bx, by, 22, '#2e1830'); circ(c, bx, by, 19, '#7a3a7c'); }
    for (let i = 0; i < 6; i++) blink(-75 + i * 30, -30, i, '#ff6fd0', '#3a1f3f');
  } else if (look === 'engine') { // reactor station: a hub with a ring track that its gun drones run round
    for (const sx of [-1, 1]) exhaust(c, sx * 30, -40, 4, 12, '#ff8a2a');
    c.strokeStyle = '#2a1a14'; c.lineWidth = 16; c.beginPath(); c.ellipse(0, 0, 64, 52, 0, 0, TAU); c.stroke();
    c.strokeStyle = '#5a3a2a'; c.lineWidth = 10; c.stroke();
    c.strokeStyle = '#ff6a1a'; c.lineWidth = 2; c.setLineDash([6, 8]); c.lineDashOffset = -t * 40; c.stroke(); c.setLineDash([]);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4; c.strokeStyle = '#3a2a22'; c.lineWidth = 6; c.beginPath(); c.moveTo(Math.cos(a) * 34, Math.sin(a) * 30); c.lineTo(Math.cos(a) * 60, Math.sin(a) * 48); c.stroke(); }
    c.save(); c.rotate(t * .3);
    poly(c, [0, -42, 36, -21, 36, 21, 0, 42, -36, 21, -36, -21], '#3a2a22'); poly(c, [0, -36, 31, -18, 31, 18, 0, 36, -31, 18, -31, -18], '#5a4030');
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.fillStyle = Math.floor(t * 4 + i) % 3 ? '#ff8a2a' : '#7a3010'; c.save(); c.rotate(a); c.fillRect(-4, -34, 8, 6); c.restore(); }
    c.restore();
  } else if (look === 'driller') { // cave guardian: an armoured mining machine with drill arms
    const ac = b.def.accent;
    for (const ex of [-22, 22]) exhaust(c, ex, -40, 4.5, 14, ac);
    for (const sd of [-1, 1]) { c.fillStyle = '#2a2633'; c.fillRect(sd * 54 - 9, -14, 18, 20); c.fillStyle = '#4a4458'; c.fillRect(sd > 0 ? 18 : -54, -6, 36, 10); }
    poly(c, [-38, -40, 38, -40, 50, -20, 50, 20, 30, 40, -30, 40, -50, 20, -50, -20], '#22202a');
    poly(c, [-34, -35, 34, -35, 45, -18, 45, 17, 27, 35, -27, 35, -45, 17, -45, -18], '#4b4566');
    poly(c, [-34, -35, 34, -35, 45, -18, -45, -18], '#625b7a');
    c.fillStyle = ac; c.fillRect(-45, -18, 90, 3);
    c.fillStyle = '#e8b923'; for (let i = -3; i <= 3; i++) { c.save(); c.translate(i * 11, 30); c.transform(1, 0, -.6, 1, 0, 0); c.fillRect(-3, -2.5, 6, 5); c.restore(); }
    lines([-45, 0, -24, 0, 45, 0, 24, 0], 'rgba(15,10,28,.6)');
    for (let i = -2; i <= 2; i++) blink(i * 15, -27, i, ac, '#22202a');
  } else if (look === 'borer') { // a segmented tunnelling machine with a cutter wheel on the front
    exhaust(c, -12, -54, 4, 12, '#ffb347'); exhaust(c, 12, -54, 4, 12, '#ffb347');
    for (const sd of [-1, 1]) { poly(c, [sd * 22, -26, sd * 56, -18, sd * 56, -6, sd * 22, -2], '#5c4d31'); poly(c, [sd * 56, -18, sd * 60, -14, sd * 60, -10, sd * 56, -6], '#3e3324'); }
    for (let i = 0; i < 5; i++) { const yy = -50 + i * 16, w = 30 - Math.abs(i - 2) * 3; c.fillStyle = '#3e3324'; c.beginPath(); c.roundRect(-w - 2, yy - 1, w * 2 + 4, 17, 6); c.fill(); c.fillStyle = i % 2 ? '#7d6a45' : '#9c8658'; c.beginPath(); c.roundRect(-w, yy, w * 2, 15, 5); c.fill(); }
    c.fillStyle = '#e8b923'; for (let i = -2; i <= 2; i++) c.fillRect(i * 9 - 3, -36, 6, 3);
    for (let i = 0; i < 4; i++) blink(-24 + i * 16, -44, i, '#ffb347', '#3e3324');
  } else if (look === 'crystal') { // a frozen crystal fortress
    const sh = (a, l, w, col) => { c.save(); c.rotate(a); poly(c, [-w, 0, 0, -l, w, 0], col); c.restore(); };
    for (let i = 0; i < 6; i++) sh(Math.PI / 6 + i * TAU / 6 + Math.PI, 56 + (i % 2) * 8, 8, '#2b5a78');
    poly(c, [0, -46, 40, -23, 40, 23, 0, 46, -40, 23, -40, -23], '#24465c');
    poly(c, [0, -40, 34, -20, 34, 20, 0, 40, -34, 20, -34, -20], '#4f94b8');
    poly(c, [0, -40, 34, -20, 0, 0, -34, -20], '#7fc4e4'); poly(c, [34, -20, 34, 20, 0, 40, 0, 0], '#3d7ea2');
    c.strokeStyle = `rgba(220,250,255,${.4 + .3 * Math.sin(t * 3)})`; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, -40); c.lineTo(34, -20); c.lineTo(34, 20); c.lineTo(0, 40); c.lineTo(-34, 20); c.lineTo(-34, -20); c.closePath(); c.stroke();
    for (let i = 0; i < 5; i++) { const a = t * .7 + i * TAU / 5; circ(c, Math.cos(a) * 30, Math.sin(a) * 30, 1.4, '#e8fbff'); }
  } else if (look === 'roots') { // a living growth with roots that writhe
    c.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * (.15 + i / 7 * .7) + Math.PI, l = 58 + (i % 3) * 8, w = Math.sin(t * 2.2 + i) * 10;
      const ex = Math.cos(a) * l, ey = Math.sin(a) * l * .8;
      c.strokeStyle = '#3a1f3f'; c.lineWidth = 7; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(ex * .5 + w, ey * .5 - w, ex, ey); c.stroke();
      c.strokeStyle = '#7a3a7c'; c.lineWidth = 3; c.stroke();
    }
    for (const sd of [-1, 1]) { c.strokeStyle = '#3a1f3f'; c.lineWidth = 6; c.beginPath(); c.moveTo(sd * 20, 20); c.quadraticCurveTo(sd * 36 + Math.sin(t * 3) * 6, 44, sd * 22, 58); c.stroke(); }
    c.lineCap = 'butt';
    const pu = 1 + .04 * Math.sin(t * 3);
    ell(c, 0, 4, 44 * pu, 38 * pu, '#2e1830'); ell(c, 0, 2, 39 * pu, 33 * pu, '#5c2a5e');
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .4; circ(c, Math.cos(a) * 26, 2 + Math.sin(a) * 22, 3.5, `rgba(255,111,208,${.4 + .3 * Math.sin(t * 4 + i)})`); }
  } else if (look === 'digger') { // a heavy excavator with scoop arms and a furnace inside
    for (const ex of [-26, 26]) exhaust(c, ex, -44, 5, 16, '#ff8a2a');
    for (const sd of [-1, 1]) {
      c.fillStyle = '#17141c'; c.fillRect(sd * 50 - 8, -40, 16, 56);
      c.fillStyle = '#4a3a30'; for (let i = 0; i < 7; i++) { const yy = -40 + ((i * 8 + t * 20) % 56); c.fillRect(sd * 50 - 8, yy, 16, 2); }
      c.strokeStyle = '#5a4030'; c.lineWidth = 7; c.beginPath(); c.moveTo(sd * 30, 4); c.lineTo(sd * 58, 14); c.stroke();
      circ(c, sd * 30, 4, 5, '#7a5a40');
    }
    c.fillStyle = '#2a1a14'; c.beginPath(); c.roundRect(-40, -42, 80, 76, 8); c.fill();
    c.fillStyle = '#5a4030'; c.beginPath(); c.roundRect(-35, -37, 70, 66, 6); c.fill();
    c.fillStyle = '#7a5a40'; c.fillRect(-35, -37, 70, 6);
    for (let i = 0; i < 4; i++) { const g = .5 + .5 * Math.sin(t * 5 + i); c.fillStyle = `rgba(255,${100 + 80 * g},30,${.6 + .4 * g})`; c.fillRect(-28 + i * 16, 20, 8, 5); }
    c.fillStyle = '#e8b923'; for (let i = -2; i <= 2; i++) { c.save(); c.translate(i * 12, -28); c.transform(1, 0, -.6, 1, 0, 0); c.fillRect(-3, -2, 6, 4); c.restore(); }
  } else if (look === 'citadel') { // a fortified gate with two gun towers and an energy barrier
    for (const ex of [-30, 0, 30]) exhaust(c, ex, -40, 4, 12, '#39d5ff');
    c.fillStyle = '#1f1c2c'; c.fillRect(-62, -36, 124, 62);
    c.fillStyle = '#3f3a55'; c.fillRect(-58, -32, 116, 54);
    c.fillStyle = '#57506e'; for (let i = -5; i <= 4; i++) if (i % 2 === 0) c.fillRect(i * 11 + 1, -42, 10, 10);
    c.fillStyle = '#2a2638'; c.beginPath(); c.moveTo(-22, 22); c.lineTo(-22, -6); c.arc(0, -6, 22, Math.PI, 0); c.lineTo(22, 22); c.fill();
    c.globalAlpha = .45 + .25 * Math.sin(t * 6); c.strokeStyle = '#39d5ff'; c.lineWidth = 1.5;
    for (let i = -16; i <= 16; i += 8) { c.beginPath(); c.moveTo(i, 22); c.lineTo(i, -2 - Math.sqrt(Math.max(0, 484 - i * i)) * .55); c.stroke(); }
    c.globalAlpha = 1;
    lines([-58, 0, -30, 0, 58, 0, 30, 0, -58, -16, -30, -16, 58, -16, 30, -16], 'rgba(10,8,20,.6)', 1.2);
    for (let i = -2; i <= 2; i++) blink(i * 22, -28, i, '#39d5ff', '#123a4a');
  } else if (look === 'dread') { // the Kesh flagship
    for (const ex of [-90, -54, -18, 18, 54, 90]) exhaust(c, ex, -66, 6, 22, '#ff5ad8');
    poly(c, [-156, -26, -126, -66, 126, -66, 156, -26, 136, 44, 60, 62, 0, 84, -60, 62, -136, 44], '#1f1c2c');
    poly(c, [-144, -26, -118, -58, 118, -58, 144, -26, 124, 38, 56, 54, 0, 74, -56, 54, -124, 38], '#3f3a55');
    poly(c, [-144, -26, -118, -58, -92, -58, -100, 30, -124, 38], '#4b4566'); poly(c, [144, -26, 118, -58, 92, -58, 100, 30, 124, 38], '#4b4566');
    poly(c, [-36, -58, 36, -58, 28, 40, 0, 66, -28, 40], '#57506e'); poly(c, [0, -58, 36, -58, 28, 40, 0, 66], '#4b4566');
    poly(c, [-24, -58, 24, -58, 18, -86, -18, -86], '#6c6588'); c.fillStyle = '#39d5ff'; c.fillRect(-14, -80, 28, 4);
    lines([-92, -40, -40, -40, 40, -40, 92, -40, -118, 0, -40, 0, 40, 0, 118, 0, -60, 54, -28, 40, 60, 54, 28, 40], 'rgba(10,8,20,.65)', 1.2);
    for (let i = -5; i <= 5; i++) circ(c, i * 22, -48, 2, Math.floor(t * 4 + i) % 3 ? '#39d5ff' : '#123a4a');
    poly(c, [-8, 60, 8, 60, 4, 72, -4, 72], '#ff4f8b');
  }
  c.restore();
  // Parts
  for (const p of b.parts) {
    const px = x + p.dx, py = y + p.dy;
    if (!p.alive) { circ(c, px, py, p.r * .8, '#1a1520'); continue; }
    const col = col2 => p.flash > 0 ? '#fff' : col2;
    if (p.core) {
      if (!open) { glow(c, px, py, p.r + 8, '#39d5ff', .25 + .1 * Math.sin(t * 6)); circ(c, px, py, p.r, '#2a3550'); circ(c, px, py, p.r * .55, '#4d6a9a'); }
      else { glow(c, px, py, p.r + 10, '#ff3d6e', .3 + .15 * Math.sin(t * 9)); circ(c, px, py, p.r, col('#7a1f45')); circ(c, px, py, p.r * .65, col('#ff3d6e')); circ(c, px, py, p.r * .3, '#fff0f5'); }
    } else if (p.look === 'gun') {
      const a = toP(px, py); circ(c, px, py, p.r + 3, '#1b1828'); circ(c, px, py, p.r, col('#5d5675')); circ(c, px, py, p.r * .75, col('#6c6588'));
      c.save(); c.translate(px, py); c.rotate(a - Math.PI / 2); c.fillStyle = col('#2a2638'); c.fillRect(-4.5, 0, 3.5, p.r + 8); c.fillRect(1, 0, 3.5, p.r + 8); c.restore(); circ(c, px, py, p.r * .4, KESH.eye);
    } else if (p.look === 'claw') { // mechanical pincers that open and close
      const o = .25 + .2 * Math.sin(t * 4 + p.dx);
      c.save(); c.translate(px, py); circ(c, 0, -8, 9, col('#3d5e78'));
      for (const sd of [-1, 1]) { c.save(); c.rotate(sd * o); poly(c, [sd * 2, -6, sd * 12, -4, sd * 11, 10, sd * 4, 20, sd * 6, 8], col('#6fa8c8')); c.restore(); }
      circ(c, 0, -8, 4.5, '#9ff3ff'); c.restore();
    } else if (p.look === 'sac') { // launch bay: a glowing hatch in an armoured ring
      const pu = 1 + .08 * Math.sin(t * 5 + p.dx); circ(c, px, py, p.r, col('#3a1f3f'));
      glow(c, px, py, p.r * .9 * pu, '#ff6fd0', .45); circ(c, px, py, p.r * .6 * pu, col('#ff6fd0'));
      c.strokeStyle = '#3a1f3f'; c.lineWidth = 2; c.beginPath(); c.moveTo(px - p.r * .6, py); c.lineTo(px + p.r * .6, py); c.moveTo(px, py - p.r * .6); c.lineTo(px, py + p.r * .6); c.stroke();
    } else if (p.look === 'drill') { // a spinning drill cone pointing at you
      c.save(); c.translate(px, py); circ(c, 0, -4, p.r, col('#3a3350')); circ(c, 0, -4, p.r * .6, col(b.def.accent || '#7a35b8'));
      poly(c, [-9, 2, 9, 2, 0, 26], col('#8d86a8'));
      c.strokeStyle = '#3a3350'; c.lineWidth = 1.4; c.beginPath(); for (let i = 0; i < 4; i++) { const f = ((t * 3 + i / 4) % 1); c.moveTo(-9 * (1 - f), 2 + 24 * f); c.lineTo(9 * (1 - f) * .6, 2 + 24 * f + 3); } c.stroke();
      circ(c, 0, -4, 3, KESH.eye); c.restore();
    } else if (p.look === 'cutter') { // a spinning saw wheel
      c.save(); c.translate(px, py); c.rotate(t * 6);
      for (let i = 0; i < 10; i++) { c.rotate(TAU / 10); poly(c, [-3, -p.r + 1, 3, -p.r + 1, 0, -p.r - 5], col('#c9c2a8')); }
      circ(c, 0, 0, p.r, col('#8d7a58')); circ(c, 0, 0, p.r * .55, col('#5c4d31'));
      c.strokeStyle = '#3e3324'; c.lineWidth = 2; for (let i = 0; i < 3; i++) { c.rotate(TAU / 3); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, p.r * .9); c.stroke(); }
      c.restore(); circ(c, px, py, 3, KESH.eye);
    } else if (p.look === 'shard') { // an ice crystal that fires
      c.save(); c.translate(px, py);
      poly(c, [0, p.r + 9, p.r * .8, 0, p.r * .45, -p.r - 4, -p.r * .45, -p.r - 4, -p.r * .8, 0], col('#9fe4ff'));
      poly(c, [0, p.r + 9, p.r * .8, 0, 0, -p.r * .2], col('#5fb4dc'));
      glow(c, 0, 0, p.r * .9, '#e8fbff', .25 + .15 * Math.sin(t * 5 + p.dx)); circ(c, 0, 1, 2.6, KESH.eye); c.restore();
    } else if (p.look === 'maw') { // a mouth that spits swarm drones
      const o = .5 + .5 * Math.sin(t * 3);
      circ(c, px, py, p.r + 2, col('#3a1f3f')); ell(c, px, py, p.r * .8, p.r * (.3 + .45 * o), '#12060f');
      for (let i = -2; i <= 2; i++) { poly(c, [px + i * 4 - 2, py - p.r * (.3 + .45 * o), px + i * 4 + 2, py - p.r * (.3 + .45 * o), px + i * 4, py - p.r * (.3 + .45 * o) + 4], '#f2e8d0'); poly(c, [px + i * 4 - 2, py + p.r * (.3 + .45 * o), px + i * 4 + 2, py + p.r * (.3 + .45 * o), px + i * 4, py + p.r * (.3 + .45 * o) - 4], '#f2e8d0'); }
    } else if (p.look === 'scoop') { // an excavator bucket with teeth and a gun in it
      c.save(); c.translate(px, py);
      c.fillStyle = col('#8a6a48'); c.beginPath(); c.moveTo(-p.r, -p.r * .6); c.lineTo(p.r, -p.r * .6); c.lineTo(p.r * .8, p.r * .8); c.lineTo(-p.r * .8, p.r * .8); c.fill();
      c.fillStyle = '#2a1a14'; c.fillRect(-p.r * .6, -p.r * .3, p.r * 1.2, p.r * .8);
      for (let i = -2; i <= 2; i++) poly(c, [i * 4.5 - 2, p.r * .8, i * 4.5 + 2, p.r * .8, i * 4.5, p.r * .8 + 5], '#c9c2a8');
      glow(c, 0, p.r * .1, 5, '#ff8a2a', .5); circ(c, 0, p.r * .1, 2.4, '#ffd08a'); c.restore();
    } else if (p.look === 'tower') { // a round gun tower on the gate
      circ(c, px, py, p.r + 3, '#1f1c2c'); circ(c, px, py, p.r, col('#57506e'));
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; c.fillStyle = col('#6c6588'); c.fillRect(px + Math.cos(a) * p.r - 2, py + Math.sin(a) * p.r - 2, 4, 4); }
      const a = toP(px, py); c.save(); c.translate(px, py); c.rotate(a - Math.PI / 2); c.fillStyle = col('#2a2638'); c.fillRect(-4.5, 0, 3.5, p.r + 8); c.fillRect(1, 0, 3.5, p.r + 8); c.restore();
      circ(c, px, py, p.r * .45, '#39d5ff');
    } else if (p.look === 'cannon') {
      c.fillStyle = col('#57506e'); c.beginPath(); c.roundRect(px - 15, py - 13, 30, 26, 5); c.fill(); c.fillStyle = '#1b1828'; c.fillRect(px - 8, py + 6, 6, 16); c.fillRect(px + 2, py + 6, 6, 16); circ(c, px, py - 3, 6, KESH.eye);
    } else if (p.look === 'hangar') {
      c.fillStyle = col('#4a4458'); c.beginPath(); c.roundRect(px - 17, py - 13, 34, 26, 4); c.fill(); c.fillStyle = '#0b0a10'; c.fillRect(px - 12, py - 2, 24, 13); c.fillStyle = 'rgba(255,204,51,.25)'; c.fillRect(px - 12, py + 8, 24, 3); for (let i = 0; i < 3; i++) circ(c, px - 8 + i * 8, py - 7, 1.6, Math.floor(t * 3 + i) % 2 ? '#ffcc33' : '#5a4a10');
    }
  }
  c.restore();
}

// ---------- Player ----------
function fire() {
  const x = P.x, y = P.y - 14, L = P.wl, w = P.wt;
  const add = (vx, vy, o) => G.ps.push({ x: o && o.x !== undefined ? o.x : x, y: o && o.y !== undefined ? o.y : y, vx, vy, w, dmg: 1, r: 4, pierce: 0, ...o });
  if (w === 0) { // Scatter: a fan that widens with each level
    const sets = [[0], [-4, 4], [-10, 0, 10], [-16, -5, 5, 16], [-24, -12, 0, 12, 24]][L - 1];
    for (const deg of sets) { const a = -Math.PI / 2 + deg * Math.PI / 180; add(Math.cos(a) * 640, Math.sin(a) * 640, { x: x + deg * .3 }); }
  } else if (w === 1) { // Lance: fast needles that go through things
    const offs = [[0], [-5, 5], [-8, 0, 8], [-9, 0, 9], [-12, -4, 4, 12]][L - 1];
    for (const o of offs) add(0, -900, { x: x + o, dmg: L >= 4 ? 1.6 : 1.4, pierce: L >= 3 ? 2 : 1, r: 3 });
  } else if (w === 2) { // Twin: shoots forwards and backwards
    const f = [1, 2, 2, 3, 3][L - 1], bk = [1, 1, 2, 2, 3][L - 1];
    for (let i = 0; i < f; i++) { const o = (i - (f - 1) / 2) * 8, a = -Math.PI / 2 + o * .012; add(Math.cos(a) * 680, Math.sin(a) * 680, { x: x + o, dmg: 1.25, r: 4.5 }); }
    for (let i = 0; i < bk; i++) { const o = (i - (bk - 1) / 2) * 10, a = Math.PI / 2 + o * .02; add(Math.cos(a) * 560, Math.sin(a) * 560, { x: x + o, y: P.y + 12, dmg: 1.25, r: 4.5 }); }
  } else { // Arc: curling waves out to the sides
    const f = L >= 3 ? 2 : 1;
    for (let i = 0; i < f; i++) add(0, -700, { x: x + (f === 2 ? (i ? 5 : -5) : 0), dmg: 1.1 });
    G.arcFlip = !G.arcFlip;
    if (G.arcFlip || L >= 4) { const n = L >= 5 ? 2 : 1; for (let s = -1; s <= 1; s += 2) for (let i = 0; i < n; i++) add(s * (300 + i * 90), -40 - i * 60, { y: P.y - 4, curl: s, dmg: 1.3, r: 7, pierce: 1 }); }
  }
  sfx.shot(G.now); G.firedAt = G.now;
}
function die() {
  if (!P.alive || P.inv > 0 || G.trans) return; // safe while diving or surfacing
  P.alive = false; P.respawn = 1.5; G.deathsStage++;
  explode(P.x, P.y, 2.2); burst(P.x, P.y, 20, ['#eef3ff', '#39d5ff', '#ff8a3d'], 200, 1, 3); sfx.die(); buzz([60, 40, 120]); shake(10);
  G.lives--;
  if (G.lives < 0) { G.overT = 1.8; G.clearT = 0; return; } // out of ships: game over, even if the boss has just gone down
  P.wl = Math.max(1, P.wl - 1);
}
function respawn() {
  P.alive = true; P.inv = 2.6; P.x = P.tx = 180; P.y = P.ty = 560; G.bombs = Math.max(G.bombs, 2); G.eb.length = 0;
  if (G.mode === 'cave') { const g = H + G.cd - P.y; P.x = P.tx = (caveL(g) + caveR(g)) / 2; }
}
function useBomb() {
  if (G.state !== 'play' || !P.alive || G.bombs <= 0 || G.bombFx > 0 || G.trans) return;
  G.bombs--; G.bombFx = 1.1; G.flash = .5; P.inv = Math.max(P.inv, 1.4); sfx.bomb(); buzz(80); shake(8);
  for (const b of G.eb) burst(b.x, b.y, 1, ['#fff'], 40, .3, 2);
  G.eb.length = 0;
  for (const e of G.en) { if (EK[e.k].nohit || e.y < -20 || e.y > H + 20) continue; damage(e, 14); }
  if (G.boss && G.boss.enter <= 0 && !G.boss.dying) for (const p of G.boss.parts) if (p.alive) hitBossPart(G.boss, p, 9);
  updateBombBtn();
}

// ---------- Damage, items ----------
function damage(e, dmg) {
  const def = EK[e.k];
  if (def.nohit || e.dead) return;
  e.hp -= dmg; e.flash = .05;
  if (e.hp > 0) return;
  e.dead = true; if (e.k !== 'cache') G.kills++; // spawned leaves caches out too
  explode(e.x, e.y, def.big || (def.air ? .8 : 1), !def.air);
  if (!def.air) G.decals.push({ x: e.x, y: e.y, r: e.r * .9 });
  addScore(def.score, e.x, e.y, def.score >= 500);
  if (def.die) def.die(e);
  if (e.k === 'freighter') G.it.push({ k: 'cap', x: e.x, y: e.y, t: 0, r: 12, ci: Math.floor(R() * 4) });
  if (e.form) {
    const f = G.form[e.form]; f.left--;
    if (f.left === 0 && !f.broken) {
      G.it.push({ k: 'bomb', x: e.x, y: e.y, t: 0, r: 11 });
      G.txt.push({ x: e.x, y: e.y - 18, s: 'SQUADRON DOWN', t: 1.2, col: '#ffcc33' });
    }
  }
}
function collect(it) {
  if (it.k === 'cap') {
    const ci = podColour(it);
    if (ci === P.wt) { if (P.wl < 5) { P.wl++; G.txt.push({ x: P.x, y: P.y - 30, s: `${WEAPONS[ci].name} ${P.wl}`, t: 1.2, col: WEAPONS[ci].col, big: true }); } else addScore(2500, P.x, P.y - 30, true); }
    else { P.wt = ci; G.txt.push({ x: P.x, y: P.y - 30, s: `${WEAPONS[ci].name} ${P.wl}`, t: 1.2, col: WEAPONS[ci].col, big: true }); }
    sfx.power();
  } else if (it.k === 'bomb') {
    if (G.bombs < 6) { G.bombs++; G.txt.push({ x: P.x, y: P.y - 30, s: '+1 SHOCK CHARGE', t: 1.2, col: '#ff8a3d' }); } else addScore(2000, P.x, P.y - 30, true);
    sfx.pick(); updateBombBtn();
  } else if (it.k === 'gem') { // gems are points: they count towards extra ships
    G.gems++; addScore(1000); G.txt.push({ x: it.x, y: it.y - 18, s: `GEM +${gemPts().toLocaleString()} PTS`, t: 1.3, col: '#ffffff', big: true }); sfx.pick();
  }
  else if (it.k === 'pod') {
    G.rescued++; G.rescuedRun++; addScore(5000, it.x, it.y, true); sfx.rescue();
    G.txt.push({ x: 180, y: 300, s: 'PILOT RESCUED', t: 2.2, col: '#5cf08a', big: true });
  }
}

// ---------- Mode changes ----------
function startDive(gate) {
  G.gateDone = true; sfx.dive();
  G.trans = { t: 0, dur: 1.6, mid: false, gx: gate.x, gy: gate.y, then() {
    G.mode = 'cave'; G.cd = 0; G.ct = 0; G.cspeed = 54; G.ctl = buildCave(G.si); G.cti = 0;
    G.en = []; G.eb = []; G.ps = []; G.it = []; G.decals = [];
    P.x = P.tx = 180; P.y = P.ty = 560; P.inv = 1.5;
    G.banner = { text: 'UNDERGROUND', sub: 'Find the captured pilot', t: 2.2 };
  } };
}
function startSurface() {
  G.trans = { t: 0, dur: 1.4, mid: false, then() {
    G.mode = 'surf'; G.en = []; G.eb = []; G.ps = []; G.it = []; G.decals = [];
    P.x = P.tx = 180; P.y = P.ty = 560; P.inv = 1.5;
    G.banner = { text: 'BACK ON THE SURFACE', sub: '', t: 1.6 };
  } };
}

// ---------- Run and stage flow ----------
function newRun(si, practice) {
  G.si = si; G.practice = practice; G.score = 0; G.lives = 3; G.bombs = 3; G.livesGiven = 0; G.rescuedRun = 0; G.diff = save.diff; G.continues = 0; G.runStart = Date.now();
  P.wt = 0; P.wl = 1;
  startStage(si);
}
function startStage(si) {
  Object.assign(G, { si, mode: 'surf', d: 0, cd: 0, t: 0, ct: 0, tl: buildTimeline(si), ti: 0, en: [], eb: [], ps: [], it: [], fx: [], txt: [], decals: [], form: {}, boss: null,
    deathsStage: 0, kills: 0, spawned: 0, speed: 42, trans: null, fade: 1, flash: 0, bombFx: 0, clearT: 0, overT: 0, gateDone: false, gateHint: 0, bossWarn: 0, rescued: 0, gems: 0, stageScore: G.score, warnUp: null, shield: false });
  G.banner = { text: `STAGE ${si + 1}`, sub: STAGES[si].name, t: 2.8 };
  G.clouds = Array.from({ length: 5 }, () => ({ x: R() * W, y: R() * H, r: rr(50, 110), a: rr(.05, .12) }));
  chunkCache.clear();
  Object.assign(P, { x: 180, y: 560, tx: 180, ty: 560, inv: 2, alive: true, respawn: 0, fireT: 0, bank: 0, dive: 0 });
  if (!save.helped) G.help = 5;
  if (si > save.reached) { save.reached = si; store(); }
  G.state = 'play'; hideOver(); updateBombBtn();
}

// ---------- Update ----------
const keys = {};
const inp = { id: null, lx: 0, ly: 0, ox: 0, oy: 0, dx: 0, dy: 0 };
function update(dt) {
  G.now += dt;
  const surf = G.mode === 'surf';
  // Scrolling and the script
  if (!G.trans || !G.trans.mid) {
    if (G.boss) G.speed += (16 - G.speed) * dt;
    if (surf) {
      G.d += G.speed * dt;
      if (!G.boss && G.clearT <= 0) { G.t += dt; while (G.ti < G.tl.length && G.tl[G.ti].t <= G.t) { const ev = G.tl[G.ti++]; spawnWave(ev.w, ev); } }
    } else {
      G.cspeed += ((G.boss ? 18 : 54) - G.cspeed) * dt; G.cd += G.cspeed * dt; G.ct += dt;
      while (G.cti < G.ctl.length && G.ctl[G.cti].t <= G.ct) { const ev = G.ctl[G.cti++]; spawnWave(ev.w, ev); }
    }
  }
  const spd = surf ? G.speed : G.cspeed;
  // Transitions (diving into the cave and coming back up)
  if (G.trans) {
    const tr = G.trans; tr.t += dt;
    const half = tr.dur / 2;
    G.fade = tr.t < half ? tr.t / half : Math.max(0, 1 - (tr.t - half) / half);
    if (tr.gx !== undefined && tr.t < half) { P.x += (tr.gx - P.x) * Math.min(1, dt * 6); P.y += (tr.gy - P.y) * Math.min(1, dt * 6); P.dive = tr.t / half; }
    if (!tr.mid && tr.t >= half) { tr.mid = true; tr.then(); P.dive = 0; }
    if (tr.t >= tr.dur) { G.trans = null; G.fade = 0; }
  } else if (G.fade > 0) G.fade = Math.max(0, G.fade - dt * 1.5);
  // Player
  if (P.alive && !(G.trans && !G.trans.mid)) {
    const kx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0), ky = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
    if (kx || ky) { const n = kx && ky ? .7071 : 1; P.tx = P.x + kx * n * 250 * dt; P.ty = P.y + ky * n * 250 * dt; }
    if (save.ctrl === 'pad' && inp.id !== null) {
      const m = Math.hypot(inp.dx, inp.dy), k = Math.min(1, m / 46) / (m || 1);
      P.tx = P.x + inp.dx * k * 270 * dt; P.ty = P.y + inp.dy * k * 270 * dt;
    }
    let lo = 14, hi = W - 14;
    if (!surf) { const g = H + G.cd - P.y; lo = caveL(g) + 16; hi = caveR(g) - 16; }
    if (!Number.isFinite(P.tx) || !Number.isFinite(P.ty)) { P.tx = P.x; P.ty = P.y; }
    P.tx = clamp(P.tx, lo, hi); P.ty = clamp(P.ty, 60, H - 26);
    const ox = P.x;
    if (save.follow === 'amiga' && save.ctrl === 'drag' && !(kx || ky)) { // the ship chases the finger at its own top speed
      const dx = P.tx - P.x, dy = P.ty - P.y, m = Math.hypot(dx, dy), max = 300 * dt;
      if (m > max) { P.x += dx / m * max; P.y += dy / m * max; } else { P.x = P.tx; P.y = P.ty; }
    } else { P.x = P.tx; P.y = P.ty; }
    P.x = clamp(P.x, lo, hi);
    P.vx = (P.x - ox) / dt; P.bank += (clamp(P.vx / 260, -1, 1) - P.bank) * Math.min(1, dt * 10);
    P.inv = Math.max(0, P.inv - dt);
    if (!G.trans && G.clearT <= 0) { P.fireT -= dt; while (P.fireT <= 0) { P.fireT += P.wt === 1 ? .085 : .1; fire(); } }
  } else if (!P.alive && G.overT <= 0) { P.respawn -= dt; if (P.respawn <= 0) respawn(); }
  if (G.help > 0) G.help -= dt;
  // Player shots
  for (const s of G.ps) {
    if (s.curl) { s.vx *= 1 - 2.6 * dt; s.vy -= 900 * dt; }
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.y < -20 || s.y > H + 20 || s.x < -20 || s.x > W + 20) s.gone = true;
  }
  // Enemies
  for (const e of G.en) {
    e.flash = Math.max(0, e.flash - dt);
    if (e.delay > 0) { e.delay -= dt; continue; }
    e.t += dt;
    const def = EK[e.k];
    if (!def.air) e.y += spd * dt;
    if (def.up && e.t >= 0) def.up(e, dt);
    if (e.y > H + 70 || e.x < -100 || e.x > W + 100 || e.y < -260) { if (!e.dead) { e.dead = true; e.escaped = true; if (e.form && G.form[e.form]) G.form[e.form].broken = true; } }
    if (def.air && P.alive && P.inv <= 0 && !G.trans && !def.nohit && e.t >= 0 && (!def.hittable || def.hittable(e)) && Math.hypot(e.x - P.x, e.y - P.y) < e.r * .8 + 5) { damage(e, 6); die(); }
  }
  // Shots against enemies and the boss
  for (const s of G.ps) {
    if (s.gone) continue;
    for (const e of G.en) {
      if (e.dead || e.t < 0 || e.delay > 0) continue;
      const def = EK[e.k]; if (def.nohit || (def.hittable && !def.hittable(e))) continue;
      if (Math.abs(e.x - s.x) > e.r + s.r || Math.abs(e.y - s.y) > e.r + s.r + 6) continue;
      if (s.hit && s.hit.has(e)) continue;
      damage(e, s.dmg); sfx.hit(G.now);
      if (s.pierce > 0) { s.pierce--; (s.hit ||= new Set()).add(e); } else { s.gone = true; burst(s.x, s.y, 4, [WEAPONS[s.w].col, '#ffffff'], 80, .22, 1.8); break; }
    }
    const b = G.boss;
    if (!s.gone && b && b.enter <= 0 && !b.dying) for (const p of b.parts) {
      if (!p.alive || Math.hypot(b.x + p.dx - s.x, b.y + p.dy - s.y) > p.r + s.r) continue;
      if (s.hit && s.hit.has(p)) continue;
      hitBossPart(b, p, s.dmg);
      if (s.pierce > 0) { s.pierce--; (s.hit ||= new Set()).add(p); } else { s.gone = true; burst(s.x, s.y, 4, [WEAPONS[s.w].col, '#ffffff'], 80, .22, 1.8); break; }
    }
  }
  G.ps = G.ps.filter(s => !s.gone);
  G.en = G.en.filter(e => !e.dead);
  updateBoss(dt);
  // The boss's body is solid too
  const b = G.boss;
  if (b && P.alive && P.inv <= 0 && !G.trans && b.enter <= 0 && !b.dying) for (const p of b.parts) if (p.alive && Math.hypot(b.x + p.dx - P.x, b.y + p.dy - P.y) < p.r + 4) die();
  // Enemy bullets
  for (const e of G.eb) {
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (!(e.y > -20 && e.y < H + 20 && e.x > -20 && e.x < W + 20)) e.gone = true; // also drops NaN
    else if (P.alive && P.inv <= 0 && !G.trans && Math.abs(e.x - P.x) < 9 && Math.abs(e.y - P.y) < 9 && Math.hypot(e.x - P.x, e.y - P.y) < e.r + 3.2) { e.gone = true; die(); }
  }
  G.eb = G.eb.filter(e => !e.gone);
  // Items
  for (const it of G.it) {
    it.t += dt; it.y += (it.k === 'pod' ? 34 : 44) * dt; it.x += Math.sin(it.t * 2) * 18 * dt; it.x = clamp(it.x, 16, W - 16);
    if (P.alive && Math.hypot(it.x - P.x, it.y - P.y) < it.r + 14) { it.gone = true; collect(it); }
    if (it.y > H + 30) it.gone = true;
  }
  G.it = G.it.filter(i => !i.gone);
  // Effects
  for (const f of G.fx) { f.t -= dt; if (!f.ring) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 1 - 2 * dt; f.vy *= 1 - 2 * dt; } }
  G.fx = G.fx.filter(f => f.t > 0);
  for (const t of G.txt) { t.t -= dt; t.y -= 26 * dt; }
  G.txt = G.txt.filter(t => t.t > 0);
  for (const d of G.decals) d.y += spd * dt;
  G.decals = G.decals.filter(d => d.y < H + 30).slice(-30);
  for (const cl of G.clouds) { cl.y += spd * 1.7 * dt; if (cl.y - cl.r > H) { cl.y = -cl.r - R() * 200; cl.x = R() * W; } }
  if (G.warnUp) { G.warnUp.t -= dt; if (G.warnUp.t <= 0) G.warnUp = null; }
  if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
  G.gateHint = Math.max(0, G.gateHint - dt); G.bossWarn = Math.max(0, G.bossWarn - dt);
  G.flash = Math.max(0, G.flash - dt * 1.6); G.shake = Math.max(0, G.shake - dt * 20); G.bombFx = Math.max(0, G.bombFx - dt);
  // End of stage / run
  if (G.clearT > 0) { G.clearT -= dt; if (G.clearT <= 0) stageCleared(); }
  if (G.overT > 0) { G.overT -= dt; if (G.overT <= 0) gameOver(); }
}

// ---------- Render ----------
function drawTerrain(c) {
  const kind = G.mode === 'cave' ? 'cave' : STAGES[G.si].kind, seed = G.mode === 'cave' ? 100 + G.si : G.si, d = G.mode === 'cave' ? G.cd : G.d;
  const k0 = Math.floor(d / CH), k1 = Math.floor((H + d) / CH);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  for (let k = k0; k <= k1; k++) { const top = H + d - (k + 1) * CH; c.drawImage(chunkCanvas(kind, seed, k), 0, Math.round(top * SC)); }
  c.restore();
  for (const key of chunkCache.keys()) { const kk = +key.split(':')[2]; if (kk < k0 - 1 && key.startsWith(kind + ':' + seed + ':')) chunkCache.delete(key); }
}
let cloudImg = null;
function cloudSprite() {
  if (cloudImg) return cloudImg;
  cloudImg = document.createElement('canvas'); cloudImg.width = cloudImg.height = 128;
  const c = cloudImg.getContext('2d'), g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.6, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128); return cloudImg;
}
// Enemy bullets: a dark rim so they show up on bright ground (desert, ice), a pulsing glow, a short trail, and a hot centre.
// Small ones are pink energy; big ones are orange fireballs.
function drawEnemyBullet(c, b) {
  const pu = 1 + .12 * Math.sin(G.now * 18 + b.x * .1), sp = Math.hypot(b.vx || 0, b.vy || 0) || 1, tx = -(b.vx || 0) / sp, ty = -(b.vy || 0) / sp;
  const [glo, body, rim, core] = b.big ? ['#ff9a2a', '#ff6a1a', '#5a1a00', '#fff3c0'] : ['#ff3d8b', '#ff4fa0', '#4a0020', '#ffffff'];
  c.globalAlpha = .35; c.fillStyle = body; c.beginPath(); c.moveTo(b.x + ty * b.r * .8, b.y - tx * b.r * .8); c.lineTo(b.x + tx * b.r * 3.2, b.y + ty * b.r * 3.2); c.lineTo(b.x - ty * b.r * .8, b.y + tx * b.r * .8); c.fill(); c.globalAlpha = 1;
  glow(c, b.x, b.y, b.r * 2.1 * pu, glo, .28);
  circ(c, b.x, b.y, b.r + 1.1, rim); circ(c, b.x, b.y, b.r, body);
  if (b.big) circ(c, b.x - b.r * .2, b.y - b.r * .2, b.r * .62, '#ffb347');
  circ(c, b.x - b.r * .15, b.y - b.r * .15, b.r * .42 * pu, core);
}
// Player shots are drawn along their direction of travel, with a fading trail, a coloured body and a white-hot core.
// They grow a little with each weapon level.
function drawShot(c, s) {
  const col = WEAPONS[s.w].col, k = 1 + ((P.wl || 1) - 1) * .07;
  c.save(); c.translate(s.x, s.y); c.rotate(Math.atan2(s.vy ?? -1, s.vx ?? 0)); c.scale(k, k); // +x is forwards
  if (s.w === 0) { // Scatter: plasma bolts
    c.globalAlpha = .4; poly(c, [1, -2, -15, 0, 1, 2], col); c.globalAlpha = .25; ell(c, 0, 0, 8, 4.5, col); c.globalAlpha = 1;
    ell(c, 0, 0, 5.5, 2.6, col); ell(c, 1, 0, 3.4, 1.3, '#fff8d8');
  } else if (s.w === 1) { // Lance: laser needles with a long streak
    c.globalAlpha = .3; c.fillStyle = col; c.fillRect(-34, -2.2, 34, 4.4); c.globalAlpha = .55; c.fillRect(-20, -1.4, 20, 2.8); c.globalAlpha = 1;
    c.fillStyle = col; c.fillRect(-12, -1.5, 24, 3); c.fillStyle = '#e8fbff'; c.fillRect(-10, -.6, 21, 1.2);
    glow(c, 12, 0, 3.5, '#ffffff', .6);
  } else if (s.w === 2) { // Twin: spinning energy orbs
    c.globalAlpha = .35; poly(c, [0, -3.5, -14, 0, 0, 3.5], col); c.globalAlpha = 1;
    glow(c, 0, 0, 8.5, col, .3); circ(c, 0, 0, 4.4, col); circ(c, .6, 0, 2.2, '#fff');
    c.rotate(G.now * 14); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.1; c.beginPath(); c.arc(0, 0, 6.2, 0, Math.PI * .7); c.moveTo(-6.2, 0); c.arc(0, 0, 6.2, Math.PI, Math.PI * 1.7); c.stroke();
  } else if (s.curl) { // Arc: crescent waves
    c.rotate(Math.PI / 2); c.lineCap = 'round';
    c.strokeStyle = col; c.globalAlpha = .25; c.lineWidth = 8; c.beginPath(); c.arc(0, 4, 7.5, Math.PI * 1.12, Math.PI * 1.88); c.stroke();
    c.globalAlpha = .35; c.lineWidth = 2; c.beginPath(); c.arc(0, 9, 7.5, Math.PI * 1.2, Math.PI * 1.8); c.stroke(); c.globalAlpha = 1;
    c.lineWidth = 3.4; c.beginPath(); c.arc(0, 4, 7.5, Math.PI * 1.12, Math.PI * 1.88); c.stroke();
    c.strokeStyle = '#efffef'; c.lineWidth = 1.3; c.stroke(); c.lineCap = 'butt';
  } else { // Arc: forward darts
    c.globalAlpha = .4; poly(c, [0, -2.2, -14, 0, 0, 2.2], col); c.globalAlpha = 1;
    poly(c, [7, 0, -2, -3.4, 0, 0, -2, 3.4], col); poly(c, [5, 0, -.5, -1.4, 0, 0, -.5, 1.4], '#efffef');
  }
  c.restore();
}
// Every pickup has its own colour, shape and name tag: weapon pods are rounded capsules in their weapon's colour,
// shock charges are red discs with a lightning bolt, gems are white diamonds, and pilots are white escape pods.
const ITEM_TAG = { bomb: ['SHOCK', '#ff4d4d'], pod: ['PILOT', '#eef3ff'] };
const gemPts = () => Math.round(1000 * D().mult / 10) * 10; // what a gem adds to the score on this difficulty
function drawItem(c, it) {
  const bob = Math.sin(it.t * 4) * 1.5, y = it.y + bob;
  let tag, tagCol;
  if (it.k === 'cap') {
    const ci = podColour(it), wp = WEAPONS[ci];
    glow(c, it.x, it.y, 24, wp.col, .35 + .12 * Math.sin(it.t * 8));
    c.save(); c.translate(it.x, y);
    c.fillStyle = '#fff'; c.beginPath(); c.roundRect(-15.5, -11.5, 31, 23, 11.5); c.fill();
    c.fillStyle = wp.col; c.beginPath(); c.roundRect(-14, -10, 28, 20, 10); c.fill();
    c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(-9, -8, 18, 3);
    c.fillStyle = wp.ink; c.font = `15px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(wp.l, 0, 1.5); c.restore();
    const left = it.lockedCi !== undefined ? 1.5 : 1.5 - (it.t % 1.5); c.save(); c.strokeStyle = wp.col; c.lineWidth = 2; c.beginPath(); c.arc(it.x,y,20,-Math.PI/2,-Math.PI/2+TAU*left/1.5); c.stroke(); c.restore();
    tag = ci === P.wt ? (P.wl < 5 ? 'UPGRADE ' + wp.name + ' +' + 1 : wp.name + ' MAX') : 'SWITCH TO ' + wp.name; tagCol = wp.col;
  } else if (it.k === 'bomb') {
    glow(c, it.x, it.y, 20, '#ff3030', .35); circ(c, it.x, y, 12.5, '#fff'); circ(c, it.x, y, 11, '#e0201f'); circ(c, it.x, y, 7.5, '#ff6a5a');
    c.save(); c.translate(it.x, y); poly(c, [2, -9, -5, 1, -.5, 1, -2, 9, 5, -1.5, .5, -1.5], '#fff3a0'); c.restore();
    [tag, tagCol] = ITEM_TAG.bomb;
  } else if (it.k === 'gem') {
    const sx = Math.cos(it.t * 5); glow(c, it.x, it.y, 15, '#ffffff', .35);
    c.save(); c.translate(it.x, y); c.scale(Math.abs(sx) * .8 + .2, 1); poly(c, [0, -11, 9, -2, 0, 11, -9, -2], '#cfe0ff'); poly(c, [0, -11, 9, -2, 0, -2], '#ffffff'); c.restore();
    if (Math.floor(it.t * 3) % 2) { c.fillStyle = '#fff'; c.fillRect(it.x + 7, y - 11, 2, 6); c.fillRect(it.x + 5, y - 9, 6, 2); }
    tag = `+${gemPts().toLocaleString()} PTS`; tagCol = '#ffffff';
  } else if (it.k === 'pod') {
    glow(c, it.x, it.y, 22, '#5cf08a', .25 + .15 * Math.sin(it.t * 6));
    ell(c, it.x, y, 12, 9, '#eef3ff'); c.fillStyle = '#ff8a3d'; c.fillRect(it.x - 12, y - 1.5, 24, 3); circ(c, it.x, y - 9, 2.4, Math.floor(it.t * 4) % 2 ? '#5cf08a' : '#1f5a32');
    [tag, tagCol] = ITEM_TAG.pod;
  }
  if (tag) text(c, tag, it.x, y + (it.k === 'cap' ? 24 : 21), 10, tagCol);
}
function text(c, s, x, y, size, col, align = 'center', stroke = true) {
  c.font = `${size}px ${FONT}`; c.textAlign = align; c.textBaseline = 'middle';
  if (stroke) { c.lineWidth = Math.max(2.5, size / 5); c.strokeStyle = 'rgba(5,8,20,.85)'; c.lineJoin = 'round'; c.strokeText(s, x, y); }
  c.fillStyle = col; c.fillText(s, x, y);
}
function render() {
  const c = ctx;
  c.setTransform(SC, 0, 0, SC, 0, 0);
  c.save();
  if (G.shake > 0) c.translate(rr(-1, 1) * G.shake * .5, rr(-1, 1) * G.shake * .5);
  drawTerrain(c);
  const surf = G.mode === 'surf';
  for (const dcl of G.decals) { ell(c, dcl.x, dcl.y, dcl.r * 1.2, dcl.r, 'rgba(20,14,10,.55)'); ell(c, dcl.x, dcl.y, dcl.r * .6, dcl.r * .5, 'rgba(0,0,0,.4)'); }
  for (const e of G.en) if (!EK[e.k].air) EK[e.k].dr(c, e);
  // Shadows of the planes on the ground
  if (surf) {
    c.globalAlpha = .22; c.fillStyle = '#000';
    for (const e of G.en) if (EK[e.k].air && e.t >= 0 && !(e.delay > 0) && e.alpha > .3) { c.beginPath(); c.ellipse(e.x + 14, e.y + 22, e.r * .9, e.r * .6, 0, 0, TAU); c.fill(); }
    if (P.alive) { c.beginPath(); c.ellipse(P.x + 16, P.y + 26, 10, 8, 0, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
  }
  for (const it of G.it) drawItem(c, it);
  for (const s of G.ps) drawShot(c, s);
  if (G.boss) drawBoss(c);
  for (const e of G.en) if (EK[e.k].air && !(e.delay > 0) && e.t >= 0) EK[e.k].dr(c, e);
  if (P.alive) {
    const s = 1 - P.dive * .7;
    if (!(P.inv > 0 && Math.floor(G.now * 14) % 2)) {
      drawShip(c, P.x, P.y, P.bank, s);
      if (G.now - (G.firedAt || -1) < .05 && s > .5) { // muzzle flashes at the nose and wing guns, in the weapon's colour
        const col = WEAPONS[P.wt].col, sx = 1 - Math.abs(P.bank) * .22;
        for (const [dx, dy, r] of [[0, -22, 3.4], [-10.8 * sx, -4, 2.4], [10.8 * sx, -4, 2.4]]) { glow(c, P.x + dx, P.y + dy, r * 2, col, .45); circ(c, P.x + dx, P.y + dy, r * .55, '#fff'); }
      }
    }
    if (P.inv > 0 && P.inv < 2.7) { c.strokeStyle = `rgba(57,213,255,${.25 + .2 * Math.sin(G.now * 12)})`; c.lineWidth = 1.5; c.beginPath(); c.arc(P.x, P.y, 20, 0, TAU); c.stroke(); }
  }
  for (const f of G.fx) {
    if (f.ring) { const k = 1 - f.t / f.life; c.strokeStyle = `rgba(255,230,180,${1 - k})`; c.lineWidth = 3 * (1 - k) + .5; c.beginPath(); c.arc(f.x, f.y, f.r + (f.max - f.r) * k, 0, TAU); c.stroke(); }
    else { c.globalAlpha = Math.min(1, f.t / f.max * 2); c.fillStyle = f.col; c.fillRect(f.x - f.s / 2, f.y - f.s / 2, f.s, f.s); }
  }
  c.globalAlpha = 1;
  for (const b of G.eb) drawEnemyBullet(c, b);
  if (surf && STAGES[G.si].kind !== 'citadel') { const img = cloudSprite(); for (const cl of G.clouds) { c.globalAlpha = cl.a; c.drawImage(img, cl.x - cl.r, cl.y - cl.r * .7, cl.r * 2, cl.r * 1.4); } c.globalAlpha = 1; }
  if (G.bombFx > 0) { const k = 1 - G.bombFx / 1.1; c.strokeStyle = `rgba(255,220,160,${1 - k})`; c.lineWidth = 18 * (1 - k) + 2; c.beginPath(); c.arc(P.x, P.y, 30 + k * 520, 0, TAU); c.stroke(); }
  c.restore();
  if (G.flash > 0) { c.fillStyle = `rgba(255,255,255,${Math.min(.8, G.flash)})`; c.fillRect(0, 0, W, H); }
  if (G.fade > 0) { c.fillStyle = `rgba(4,4,10,${G.fade})`; c.fillRect(0, 0, W, H); }
  drawHUD(c);
}
function drawHUD(c) {
  // Stage progress along the top
  if (G.mode === 'surf') {
    const k = clamp(G.t / STAGE_T, 0, 1);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, W, 3); c.fillStyle = '#39d5ff'; c.fillRect(0, 0, W * k, 3);
    if (!G.gateDone) { c.fillStyle = '#ffcc33'; c.fillRect(W * GATE_T / STAGE_T - 1.5, 0, 3, 5); }
    c.fillStyle = '#ff3d6e'; c.fillRect(W - 3, 0, 3, 5);
  }
  text(c, String(G.score).padStart(7, '0'), 10, 18, 15, '#fff', 'left');
  text(c, 'HI ' + Math.max(save.best, G.score).toLocaleString(), 180, 18, 11, '#9fb0d8');
  for (let i = 0; i < Math.min(G.lives, 6); i++) drawShip(c, 16 + i * 15, 40, 0, .42, false);
  if (G.practice) text(c, G.training ? 'FLIGHT SCHOOL' : G.daily ? 'DAILY SORTIE' : 'PRACTICE', 180, 34, 10, '#ffcc33');
  // Weapon
  const wp = WEAPONS[P.wt];
  c.fillStyle = 'rgba(5,8,20,.6)'; c.beginPath(); c.roundRect(8, H - 30, 118, 22, 11); c.fill();
  circ(c, 20, H - 19, 6, wp.col); text(c, wp.name, 31, H - 19, 11, wp.col, 'left', false);
  for (let i = 0; i < 5; i++) { c.fillStyle = i < P.wl ? wp.col : 'rgba(255,255,255,.18)'; c.fillRect(88 + i * 7, H - 24, 5, 10); }
  // Boss health
  const b = G.boss;
  if (b && b.enter <= 0 && !b.dying) {
    const tot = b.parts.reduce((s, p) => s + p.max, 0), left = b.parts.reduce((s, p) => s + (p.alive ? Math.max(0, p.hp) : 0), 0);
    text(c, b.def.name, 180, 56, 11, '#ffb0c8');
    c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(60, 64, 240, 5); c.fillStyle = '#ff3d6e'; c.fillRect(60, 64, 240 * left / tot, 5);
  }
  if (G.bossWarn > 0 && Math.floor(G.bossWarn * 4) % 2) { text(c, 'WARNING', 180, 250, 34, '#ff3d6e'); text(c, (G.boss ? G.boss.def.name : '') + ' APPROACHING', 180, 286, 13, '#ffd0dc'); }
  if (G.gateHint > 0) { const g = G.en.find(e => e.k === 'gate'); if (g && g.y > 0) { const a = .6 + .4 * Math.sin(G.now * 8); c.globalAlpha = a; text(c, 'DIVE GATE', g.x, g.y - 40, 12, '#ffcc33'); text(c, '▼', g.x, g.y - 28, 12, '#ffcc33'); c.globalAlpha = 1; } }
  if (G.warnUp) { const a = Math.floor(G.warnUp.t * 8) % 2; if (a) { text(c, '▲', G.warnUp.x, H - 50, 20, '#ff6aa8'); text(c, 'BEHIND', G.warnUp.x, H - 70, 10, '#ff6aa8'); } }
  if (G.banner) { const a = Math.min(1, G.banner.t * 2); c.globalAlpha = a; text(c, G.banner.text, 180, 260, 30, '#fff'); if (G.banner.sub) text(c, G.banner.sub.toUpperCase(), 180, 294, 14, '#39d5ff'); c.globalAlpha = 1; }
  for (const t of G.txt) { c.globalAlpha = Math.min(1, t.t * 2); text(c, t.s, t.x, t.y, t.big ? 15 : 11, t.col); }
  c.globalAlpha = 1;
  if (G.help > 0 && G.state === 'play') {
    c.globalAlpha = Math.min(1, G.help);
    c.fillStyle = 'rgba(5,8,20,.75)'; c.beginPath(); c.roundRect(40, 380, 280, 72, 14); c.fill();
    text(c, save.ctrl === 'pad' ? 'Touch and push to steer' : 'Drag anywhere to fly', 180, 404, 15, '#fff', 'center', false);
    text(c, 'Your guns fire by themselves', 180, 428, 12, '#9fb0d8', 'center', false);
    c.globalAlpha = 1;
  }
  if (save.ctrl === 'pad' && inp.id !== null && G.state === 'play') {
    const rc = cv.getBoundingClientRect(), ox = (inp.ox - rc.left) / cssScale, oy = (inp.oy - rc.top) / cssScale;
    const m = Math.hypot(inp.dx, inp.dy), k = Math.min(46, m) / (m || 1);
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2; c.beginPath(); c.arc(ox, oy, 46, 0, TAU); c.stroke();
    circ(c, ox + inp.dx * k, oy + inp.dy * k, 16, 'rgba(255,255,255,.3)');
  }
}

// ---------- Poster art (home page, icons, share card) ----------
function poster(canvas, w, h, opts = {}) {
  const c = canvas.getContext('2d'), s = Math.max(w / W, h / H);
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
  c.save(); c.translate((w - W * s) / 2, (h - H * s) / 2); c.scale(s, s);
  const kind = opts.kind || 'fields';
  for (let k = 0; k < 3; k++) { c.save(); c.translate(0, H - (k + 1) * CH); paintChunk(c, kind, k + 3, opts.seed || 0); c.restore(); }
  c.fillStyle = 'rgba(5,10,30,.18)'; c.fillRect(0, 0, W, H);
  const r = rng(42);
  const fakeE = (x, y, extra) => ({ x, y, t: r() * 3, ph: 0, side: 1, flash: 0, alpha: 1, ang: Math.PI / 2, cool: 1, ...extra });
  if (opts.bare) { /* ground only */ } else if (!opts.icon) {
    EK.turret.dr(c, fakeE(84, 210, { ang: 1.2 }));
    EK.cache.dr(c, fakeE(290, 330));
    EK.gate.dr(c, fakeE(110, 420, { t: .4 }));
    c.globalAlpha = .22; c.fillStyle = '#000'; c.beginPath(); c.ellipse(196, 556, 12, 9, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
    EK.gunship.dr(c, fakeE(214, 130, { t: .3 }));
    for (let i = 0; i < 5; i++) EK.darter.dr(c, fakeE(60 + i * 26, 260 - i * 22, { t: .4 + i * .3 }));
    EK.freighter.dr(c, fakeE(290, 220, { vx: -40 }));
    for (let i = 0; i < 8; i++) drawEnemyBullet(c, { x: 150 + i * 14, y: 330 + Math.sin(i) * 20, r: 3.8 });
    drawItem(c, { k: 'cap', x: 250, y: 410, t: .2, ci: 1, r: 12 });
    for (let i = 0; i < 6; i++) drawShot(c, { w: 0, x: 180 + (i % 3 - 1) * 10, y: 480 - i * 40 });
    c.globalAlpha = .9; circ(c, 214, 150, 26, 'rgba(255,180,80,.25)'); c.globalAlpha = 1;
    burstStatic(c, 70, 160);
    drawShip(c, 180, 530, -.2, 1.6);
  } else { // app icon: your ship firing up at a Kesh gunship. opts.icon === 'mask' keeps it inside the maskable safe zone.
    if (opts.icon === 'mask') { c.translate(180, 320); c.scale(.8, .8); c.translate(-180, -320); }
    c.save(); c.translate(180, 228); c.scale(1.9, 1.9); EK.gunship.dr(c, fakeE(0, 0, { t: .3 })); c.restore();
    c.save(); c.translate(180, 322); c.scale(1.9, 1.9); for (const [dx, dy] of [[-5, -12], [5, -12], [-5, 8], [5, 8]]) drawShot(c, { w: 0, x: dx, y: dy }); c.restore();
    c.globalAlpha = .22; c.fillStyle = '#000'; c.beginPath(); c.ellipse(196, 428, 38, 28, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
    drawShip(c, 180, 404, 0, 3.8);
  }
  c.restore();
}
function burstStatic(c, x, y) { const r = rng(7); for (let i = 0; i < 26; i++) { const a = r() * TAU, d = r() * 26; c.fillStyle = ['#fff4c2', '#ffb347', '#ff6a2a', '#ff3d6e'][i % 4]; c.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 3, 3); } glow(c, x, y, 16, '#ffd08a', .5); }
// Home-page stage cards: an action shot from each stage, with its own enemies, your ship firing, incoming fire,
// an explosion, and a colour grade for the setting (sunlit fields, hot desert, cold ice, glowing jungle, lava, the Citadel).
const STAGE_SCENES = [
  { wt: 0, grade: ['rgba(255,220,140,.5)', 'rgba(60,140,80,.3)'], scene(E, X) {
    E('turret', 296, 104); E('tank', 74, 128, { vx: 30 });
    [[58, 34], [90, 46], [122, 56], [154, 62]].forEach(([x, y], i) => E('darter', x, y, { t: .4 + i * .3 }));
    X(186, 36, 1); } },
  { wt: 1, grade: ['rgba(255,190,90,.55)', 'rgba(255,120,40,.3)'], scene(E, X, B) {
    E('tank', 64, 76, { vx: 30 }); E('tank', 300, 120, { vx: -30 }); E('gunship', 246, 46, { t: .3 });
    for (let i = 0; i < 5; i++) B(246 + (i - 2) * 9, 70 + Math.abs(i - 2) * 4, (i - 2) * .17 + 2.2, true);
    X(70, 70, 1.2); } },
  { wt: 2, grade: ['rgba(170,230,255,.5)', 'rgba(60,120,200,.35)'], scene(E, X, B) {
    E('bunker', 304, 120); E('cloaker', 96, 44, { t: 1 }); E('diver', 232, 36, { ph: 1 }); E('diver', 286, 62);
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; B(96 + Math.cos(a) * (20 + i), 44 + Math.sin(a) * (20 + i), a); }
    X(232, 36, 1); } },
  { wt: 3, grade: ['rgba(120,255,160,.4)', 'rgba(200,60,200,.3)'], scene(E, X) {
    for (let i = 0; i < 8; i++) E('swarm', 90 + (i % 4) * 26 + (i > 3 ? 13 : 0), 30 + Math.floor(i / 4) * 24, { vx: 40 - i * 10, vy: 100, t: i * .2 });
    E('weaver', 292, 50, { t: .7 }); E('turret', 40, 118);
    X(150, 40, 1); } },
  { wt: 1, grade: ['rgba(255,110,40,.55)', 'rgba(120,20,20,.35)'], scene(E, X, B) {
    E('mine', 70, 52, { t: 1 }); E('mine', 300, 84, { t: 2 }); E('gunship', 214, 40, { t: .3 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + .2; B(140 + Math.cos(a) * 26, 30 + Math.sin(a) * 26, a, true); }
    X(140, 30, 1.3); } },
  { wt: 0, grade: ['rgba(190,120,255,.45)', 'rgba(57,213,255,.3)'], scene(E, X, B, boss) {
    boss(180, 12, .55); E('darter', 46, 86, { t: .5 }); E('darter', 316, 76, { t: 1.2, side: -1 });
    for (let i = 0; i < 7; i++) B(120 + i * 20, 66 + Math.sin(i) * 10, Math.PI / 2 + (i - 3) * .12, i % 2 === 0);
    X(124, 30, 1); } },
];
function stageArt(canvas, si) {
  const Z = 1.25, OX = (W - W / Z) / 2, OY = 12; // zoomed in a little on the action
  const c = canvas.getContext('2d'), w = canvas.width, s = w / W * Z, sc = STAGE_SCENES[si], r = rng(77 + si * 13);
  const px = 196, py = 130; // your ship
  c.save(); c.scale(s, s); c.translate(-OX, -OY);
  paintChunk(c, STAGES[si].kind, 6, si);
  c.fillStyle = 'rgba(5,10,30,.12)'; c.fillRect(0, 0, W, CH);
  const E = (k, x, y, extra = {}) => {
    const e = { k, x, y, t: r() * 3, ph: 0, side: 1, flash: 0, alpha: 1, ang: Math.atan2(py - y, px - x), cool: 0, vx: 40, vy: 100, ...extra };
    if (EK[k].air) { c.globalAlpha = .22; ell(c, x + 12, y + 18, EK[k].r, 7, '#000'); c.globalAlpha = 1; }
    EK[k].dr(c, e);
  };
  const X = (x, y, size) => { c.save(); c.translate(x, y); c.scale(size, size); burstStatic(c, 0, 0); c.restore(); c.globalAlpha = .5; c.strokeStyle = '#fff4c2'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 22 * size, 0, TAU); c.stroke(); c.globalAlpha = 1; };
  const B = (x, y, a, big) => drawEnemyBullet(c, { x, y, vx: Math.cos(a), vy: Math.sin(a), r: big ? 5 : 3.6, big });
  const boss = (x, y, k) => {
    const def = BOSSES[STAGES[si].boss], b = { def, x: 0, y: 0, t: 1, dying: 0, enter: 0, alive: true, parts: def.parts.map(p => ({ ...p, alive: true, flash: 0 })) };
    const keep = G.boss; G.boss = b; c.save(); c.translate(x, y); c.scale(k, k); drawBoss(c); c.restore(); G.boss = keep;
  };
  sc.scene(E, X, B, boss);
  // your ship, firing
  for (let i = 0; i < 6; i++) for (const dx of [-6, 6]) drawShot(c, { w: sc.wt, x: px + dx, y: py - 26 - i * 22, vx: 0, vy: -1 });
  c.globalAlpha = .22; ell(c, px + 16, py + 22, 13, 10, '#000'); c.globalAlpha = 1;
  drawShip(c, px, py, -.25, 1.25);
  glow(c, px, py - 28, 7, WEAPONS[sc.wt].col, .5); circ(c, px, py - 28, 2, '#fff');
  // colour grade and vignette
  const vh = canvas.height / s;
  c.translate(OX, OY);
  c.globalCompositeOperation = 'soft-light';
  const g = c.createLinearGradient(0, 0, 0, vh); g.addColorStop(0, sc.grade[0]); g.addColorStop(1, sc.grade[1]);
  c.fillStyle = g; c.fillRect(0, 0, W, vh);
  c.globalCompositeOperation = 'source-over';
  const v = c.createRadialGradient(W / 2, vh / 2, vh * .4, W / 2, vh / 2, W * .62); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,10,.45)');
  c.fillStyle = v; c.fillRect(0, 0, W, vh);
  c.restore();
}
window.SQArt = { poster, stageArt, drawShip, STAGES };

// =====================================================================================
// Page glue. Everything below needs the game page.
if (!$('cv')) return;
cv = $('cv'); ctx = cv.getContext('2d');
const frame = $('frame'), gameEl = $('game'), menu = $('menu'), over = $('over'), bombBtn = $('bombBtn');
let me = null, clientId = '';

function fit() {
  const bw = gameEl.clientWidth, bh = gameEl.clientHeight;
  const cw = Math.max(200, Math.min(bw, bh * W / H)), ch = cw * H / W;
  frame.style.width = cw + 'px'; frame.style.height = ch + 'px';
  cssScale = cw / W;
  const nsc = Math.min(3, cw * Math.min(window.devicePixelRatio || 1, 2.5) / W);
  if (Math.abs(nsc - SC) > .01) { SC = nsc; cv.width = Math.round(W * SC); cv.height = Math.round(H * SC); chunkCache.clear(); }
}
window.addEventListener('resize', () => { if (!gameEl.hidden) { fit(); render(); } });

// ---------- Loop ----------
let raf = 0, last = 0, acc = 0;
function loop(ts) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(.1, (ts - last) / 1000 || 0); last = ts;
  if (G.state === 'play') { acc += dt; let n = 0; while (acc >= STEP && n++ < 6) { update(STEP); acc -= STEP; } if (n >= 6) acc = 0; }
  render();
}

// ---------- Input ----------
// Drag: the ship moves the same distance as your finger (or twice as far at 2x), wherever you touch. The finger never covers the ship.
gameEl.addEventListener('pointerdown', e => {
  if (e.target.closest('button, .over')) return;
  if (inp.id !== null) return;
  inp.id = e.pointerId; inp.lx = inp.ox = e.clientX; inp.ly = inp.oy = e.clientY; inp.dx = inp.dy = 0;
  try { gameEl.setPointerCapture(e.pointerId); } catch {}
  if (G.help > 0 && G.state === 'play') { save.helped = true; store(); G.help = Math.min(G.help, .6); }
  e.preventDefault();
});
gameEl.addEventListener('pointermove', e => {
  if (e.pointerId !== inp.id) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  const lastE = evs.length ? evs[evs.length - 1] : e;
  const dx = (lastE.clientX - inp.lx) / cssScale, dy = (lastE.clientY - inp.ly) / cssScale;
  inp.lx = lastE.clientX; inp.ly = lastE.clientY;
  if (save.ctrl === 'pad') { inp.dx = (lastE.clientX - inp.ox) / cssScale; inp.dy = (lastE.clientY - inp.oy) / cssScale; return; }
  if (G.state !== 'play' || !P.alive || (G.trans && !G.trans.mid)) return;
  P.tx += dx * save.sens; P.ty += dy * save.sens;
});
const endPointer = e => { if (e.pointerId === inp.id) { inp.id = null; inp.dx = inp.dy = 0; } };
gameEl.addEventListener('pointerup', endPointer); gameEl.addEventListener('pointercancel', endPointer);
gameEl.addEventListener('contextmenu', e => e.preventDefault());
bombBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); useBomb(); });
$('pauseBtn').addEventListener('click', () => G.state === 'play' ? pause() : G.state === 'paused' && resume());
window.addEventListener('keydown', e => {
  if (gameEl.hidden || document.querySelector('.gh-modal:not([hidden])')) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if ((e.code === 'Space' || e.code === 'KeyX' || e.code === 'KeyB') && !e.repeat) useBomb();
  if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) { if (G.state === 'play') pause(); else if (G.state === 'paused') resume(); }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (G.state === 'play') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') pause(); });

function updateBombBtn() { bombBtn.querySelector('b').textContent = G.bombs; bombBtn.classList.toggle('empty', G.bombs <= 0); }

// ---------- Overlays ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
function showOver(html, cls) { over.className = 'over ' + (cls || ''); over.innerHTML = html; over.hidden = false; const b = over.querySelector('.btn.primary') || over.querySelector('button'); if (b) b.focus({ preventScroll: true }); }
function hideOver() { over.hidden = true; over.innerHTML = ''; }
function controlsHtml() {
  const seg = (name, val, opts) => `<div class="seg" role="radiogroup" data-set="${name}">${opts.map(([v, l]) => `<button type="button" role="radio" aria-checked="${String(val) === String(v)}" data-v="${v}">${l}</button>`).join('')}</div>`;
  return `${snd ? `<div class="setrow"><span>Sound</span>${seg('sound', snd.muted ? 'off' : 'on', [['on', 'On'], ['off', 'Off']])}</div>` : ''}
    <div class="setrow"><span>Controls</span>${seg('ctrl', save.ctrl, [['drag', 'Drag'], ['pad', 'Joypad']])}</div>
    <div class="setrow" ${save.ctrl === 'pad' ? 'hidden' : ''}><span>Drag speed</span>${seg('sens', save.sens, [[1, '1×'], [2, '2×']])}</div>
    <div class="setrow" ${save.ctrl === 'pad' ? 'hidden' : ''}><span>Ship</span>${seg('follow', save.follow, [['keep', 'Keeps up'], ['amiga', 'Amiga speed']])}</div>`;
}
function bindSegs(root, after) {
  root.querySelectorAll('[data-set]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
    const k = g.dataset.set; let v = b.dataset.v; if (k === 'sens' || k === 'diff') v = +v;
    if (k === 'sound') { snd.setMuted(v === 'off'); syncMusic(); after && after(); return; }
    save[k] = v; store(); after && after();
  }));
}
function pause() {
  if (G.state !== 'play') return;
  G.state = 'paused'; for (const k in keys) keys[k] = false; inp.id = null;
  const draw = () => { showOver(`<h2>Paused</h2><div class="settings">${controlsHtml()}</div><div class="row"><button class="btn" type="button" id="oQuit">Quit</button><button class="btn primary" type="button" id="oResume">Resume</button></div>`, 'pausebox');
    $('oResume').onclick = resume; $('oQuit').onclick = quitToMenu; bindSegs(over, draw); };
  draw();
}
function resume() { if (G.state !== 'paused') return; hideOver(); G.state = 'play'; last = performance.now(); acc = 0; }
function stageCleared() {
  const si = G.si, bonusMiss = G.deathsStage === 0 ? 10000 : 0, kills = G.spawned ? Math.min(100, Math.round(G.kills / G.spawned * 100)) : 0, killBonus = kills * 100;
  addScore(bonusMiss + killBonus);
  recordClear();
  G.state = 'clear';
  const last6 = si === STAGES.length - 1;
  if (si + 1 > save.reached && !last6) { save.reached = si + 1; store(); }
  const rows = [['Shot down', `${kills}%`, killBonus], ['No ships lost', G.deathsStage === 0 ? 'Yes' : 'No', bonusMiss], ['Captured pilot', G.rescued ? 'Rescued' : 'Not found', null], ['Gems', G.gems ? `${G.gems} = ${(G.gems * gemPts()).toLocaleString()} pts` : 'None', null]];
  const tbl = `<table class="tally">${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2] === null ? '' : r[2] ? '+' + Math.round(r[2] * D().mult).toLocaleString() : '–'}</td></tr>`).join('')}</table>`;
  if (last6) { finishRun(true); return; }
  showOver(`<p class="kicker">Stage ${si + 1} clear</p><h2>${esc(STAGES[si].name)}</h2>${tbl}<p class="big">${G.score.toLocaleString()}</p>
    <div class="row"><button class="btn primary" type="button" id="oNext">Stage ${si + 2}: ${esc(STAGES[si + 1].name)}</button></div>`, 'win');
  $('oNext').onclick = () => startStage(si + 1);
}
function gameOver() { finishRun(false); }
async function finishRun(won) {
  G.state = won ? 'won' : 'over';
  const best = G.score > save.best && !G.practice;
  if (!G.practice) { if (best) save.best = G.score; if (won) save.cleared = true; store(); }
  const canSave = !G.practice && G.score > 0;
  const submit = canSave && me ? SUK.api('sq_score', { score: G.score, stage: G.si + 1, diff: G.diff, rescued: G.rescuedRun, won: won ? 1 : 0, secs: Math.round((Date.now() - G.runStart) / 1000) }).then(() => 'Saved to the leaderboard.').catch(e => e.message) : null;
  const cont = !won && !G.practice;
  showOver(`<p class="kicker">${won ? 'The Kesh are beaten' : G.practice ? 'Practice over' : 'Game over'}</p>
    <h2>${won ? 'Veyra is free!' : best ? 'New best!' : 'Squadron lost'}</h2>
    <p class="big">${G.score.toLocaleString()}</p>
    <p>${won ? `You rescued ${G.rescuedRun} of 6 captured pilots.` : `Reached stage ${G.si + 1}: ${esc(STAGES[G.si].name)}. Pilots rescued: ${G.rescuedRun}.`}</p>
    <p class="saved" id="oSaved">${canSave ? (me ? 'Saving…' : 'Sign in on the home page to put your scores on the leaderboard.') : G.practice ? 'Practice runs don\'t go on the leaderboard.' : ''}</p>
    <div class="row">${cont ? `<button class="btn" type="button" id="oCont">Continue here</button>` : ''}<button class="btn" type="button" id="oHome">Home</button><button class="btn primary" type="button" id="oAgain">${G.practice ? 'Try again' : 'Play again'}</button></div>
    ${cont ? '<p class="fine">Continuing starts this stage again with 3 ships, and your score goes back to 0.</p>' : ''}`, won ? 'win' : 'lose');
  $('oHome').onclick = quitToMenu;
  $('oAgain').onclick = () => G.practice ? newRun(G.si, true) : newRun(0, false);
  if (cont) $('oCont').onclick = () => { const si = G.si; G.score = 0; G.lives = 3; G.bombs = 3; G.livesGiven = 0; G.continues++; P.wl = Math.max(1, P.wl); startStage(si); };
  if (submit) { const msg = await submit; const el = $('oSaved'); if (el) el.textContent = msg; loadBoard(); }
}

// ---------- Screens ----------
function showGame() {
  menu.hidden = true; gameEl.hidden = false; document.body.dataset.screen = 'game'; window.scrollTo(0, 0);
  fit(); last = performance.now(); acc = 0;
  if (!raf) raf = requestAnimationFrame(loop);
}
function quitToMenu() {
  G.state = 'idle'; hideOver(); gameEl.hidden = true; menu.hidden = false; document.body.dataset.screen = 'menu';
  cancelAnimationFrame(raf); raf = 0; renderMenu();
}
function play(si, practice) { snd && snd.unlock(); primeExplosions(); music.stop(); showGame(); newRun(si, practice); }
// Title music: plays while the home page is showing, once there's been a tap, unless sound or music is off.
let tapped = false;
function syncMusic() { if (tapped && save.music !== 'off' && !menu.hidden && !document.hidden && snd && !snd.muted) music.start(); else music.stop(); }
const firstTap = e => { tapped = true; if (!e.target.closest || !e.target.closest('#playBtn, .stage-card')) syncMusic(); };
window.addEventListener('pointerdown', firstTap, true); window.addEventListener('keydown', firstTap, true);
document.addEventListener('visibilitychange', syncMusic);

// ---------- Home page ----------
function renderMenu() {
  $('bestNote').textContent = save.best ? `Your best: ${save.best.toLocaleString()}` : '';
  const grid = $('stageCards');
  grid.innerHTML = STAGES.map((s, i) => {
    const open = i <= save.reached;
    return `<button class="stage-card" type="button" data-stage="${i}" ${open ? '' : 'disabled'}><canvas width="640" height="300" aria-hidden="true"></canvas>${open ? '' : '<span class="sc-lock">🔒 Locked</span>'}
      <span class="sc-body"><span class="sc-n">Stage ${i + 1}</span><span class="sc-name">${esc(s.name)}</span><span class="sc-blurb">${open ? esc(s.blurb) : 'Reach this stage to practise it.'}</span>
      <span class="sc-meta">${open ? (i === 0 ? 'Practise' : 'Practise ▸') : '🔒 Locked'}</span></span></button>`;
  }).join('');
  grid.querySelectorAll('.stage-card').forEach(b => { stageArt(b.querySelector('canvas'), +b.dataset.stage); b.onclick = () => play(+b.dataset.stage, true); });
  const st = $('pilotSettings');
  st.innerHTML = `<div class="setrow"><span>Difficulty</span><div class="seg" data-set="diff">${DIFF.map((d, i) => `<button type="button" role="radio" aria-checked="${save.diff === i}" data-v="${i}">${d.name}</button>`).join('')}</div></div>
    <p class="fine">${['Cadet: slower, fewer bullets. Scores count half.', 'Pilot: the game as it was meant to be played.', 'Ace: faster bullets and more of them. Scores count one and a half times.'][save.diff]}</p>${controlsHtml()}
    <div class="setrow"><span>Title music</span><div class="seg" role="radiogroup" data-set="music">${[['on', 'On'], ['off', 'Off']].map(([v, l]) => `<button type="button" role="radio" aria-checked="${save.music === v}" data-v="${v}">${l}</button>`).join('')}</div></div>
    <p class="fine">${save.ctrl === 'pad' ? 'Joypad: touch anywhere and push your thumb the way you want to fly.' : `Drag anywhere on the screen: the ship moves ${save.sens === 2 ? 'twice as far as' : 'exactly as far as'} your finger, so your finger never hides it. ${save.follow === 'amiga' ? 'Amiga speed: the ship has a top speed, like the original.' : ''}`}</p>`;
  bindSegs(st, renderMenu);
  syncMusic();
}
function drawMenuArt() { const a = $('menuArt'), r = a.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); a.width = Math.round(r.width * dpr); a.height = Math.round(r.height * dpr); poster(a, a.width, a.height); }

// ---------- Leaderboard ----------
const PERIODS = [['day', 'Today'], ['week', 'This week'], ['month', 'This month'], ['all', 'All time']];
let board = null, period = 'week';
async function loadBoard() {
  try { board = await SUK.api('sq_board'); } catch { board = null; }
  if (board) { me = board.user; clientId = board.google_client_id || ''; }
  drawBoard();
  return board;
}
function drawBoard() {
  const list = $('lbList'), tabs = $('lbTabs');
  tabs.innerHTML = PERIODS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === period}" data-p="${k}">${l}</button>`).join('');
  tabs.querySelectorAll('button').forEach(b => b.onclick = () => { period = b.dataset.p; drawBoard(); });
  if (!board) { list.innerHTML = '<li class="lb-empty">The leaderboard couldn\'t load.</li>'; return; }
  const rows = board.boards[period] || [];
  list.innerHTML = rows.length ? rows.map((r, i) => `<li class="${me && r.id === me.id ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="lb-av">${r.picture ? `<img src="${esc(r.picture)}" alt="" referrerpolicy="no-referrer">` : esc((r.name || '?')[0])}</span><span class="lb-nm">${esc(SUK.firstName(r.name))}</span><span class="lb-cl">Stage ${r.stage} · ${DIFF[r.diff] ? DIFF[r.diff].name : ''}</span><span class="lb-st">${r.score.toLocaleString()}</span></li>`).join('')
    : '<li class="lb-empty">No scores yet. Be the first!</li>';
  const mine = board.mine && board.mine[period];
  $('lbMe').innerHTML = me ? (mine ? `<p class="fine">Your best ${PERIODS.find(p => p[0] === period)[1].toLowerCase()}: <b>${mine.best.toLocaleString()}</b>, ranked ${mine.rank}.</p>` : '<p class="fine">No score from you yet for this period.</p>')
    : '<p class="fine">Sign in (top right) to get on the leaderboard.</p>';
}

// ---------- Fleet line-up ----------
// /squadron-battle/#ships shows every Kesh ship, enlarged and animated, so the designs can be looked over together.
// #bosses does the same for the six bosses, and #guardians for the cave guardians.
function bossGallery(defs = BOSSES, title = 'KESH BOSSES') {
  menu.hidden = true; gameEl.hidden = false; document.body.dataset.screen = 'game'; fit();
  $('pauseBtn').hidden = bombBtn.hidden = true;
  const bs = defs.map(def => ({ def, x: 0, y: 0, ty: 0, t: 0, dying: 0, alive: true, parts: def.parts.map(p => ({ ...p, alive: true, flash: 0 })) }));
  const t0 = performance.now();
  const draw = () => {
    if (gameEl.hidden) return; requestAnimationFrame(draw);
    const c = ctx, t = (performance.now() - t0) / 1000; c.setTransform(SC, 0, 0, SC, 0, 0);
    c.fillStyle = '#0a1024'; c.fillRect(0, 0, W, H);
    text(c, title, W / 2, 70, 20, '#39d5ff');
    bs.forEach((b, i) => {
      const cx = 92 + (i % 2) * 176, cy = 170 + Math.floor(i / 2) * 165, sc = b.def.look === 'dread' ? .5 : .72;
      b.t = t; b.def.move(b, t); b.x = b.y = 0; G.boss = b;
      c.save(); c.translate(cx, cy); c.scale(sc, sc); drawBoss(c); c.restore();
      text(c, b.def.name, cx, cy + 70, 12, '#eaf0ff');
    });
    G.boss = null;
  };
  draw();
}
function shipGallery() {
  menu.hidden = true; gameEl.hidden = false; document.body.dataset.screen = 'game'; fit();
  $('pauseBtn').hidden = bombBtn.hidden = true;
  const list = [['darter', 'Darter', 2], ['diver', 'Diver', 2], ['weaver', 'Saucer', 2], ['riser', 'Riser', 2], ['cloaker', 'Cloaker', 2], ['swarm', 'Swarm drone', 2.4],
    ['mine', 'Mine', 2], ['gunship', 'Gunship', 1.3], ['freighter', 'Freighter', 1.2], ['turret', 'Gun turret', 1.7], ['tank', 'Tank', 1.8], ['bunker', 'Bunker', 1.4], ['cache', 'Crystal cache', 2], ['cage', 'Pilot cell', 1.7], ['gate', 'Dive gate', 1.4]];
  const es = list.map(([k]) => ({ k, x: 0, y: 0, t: 0, ph: 0, side: 1, flash: 0, alpha: 1, ang: Math.PI / 2, cool: 1, vx: 40, vy: 100 }));
  const t0 = performance.now();
  const draw = () => {
    if (gameEl.hidden) return; requestAnimationFrame(draw);
    const c = ctx, t = (performance.now() - t0) / 1000; c.setTransform(SC, 0, 0, SC, 0, 0);
    c.fillStyle = '#0a1024'; c.fillRect(0, 0, W, H);
    text(c, 'THE KESH FLEET', W / 2, 62, 20, '#39d5ff');
    list.forEach(([k, name, sc], i) => {
      const cx = 62 + (i % 3) * 118, cy = 120 + Math.floor(i / 3) * 108, e = es[i]; e.t = t; e.x = k === 'tank' ? t * 20 : 0;
      c.save(); c.translate(cx, cy); c.scale(sc, sc); if (k === 'tank') c.translate(-e.x, 0); EK[k].dr(c, e); c.restore();
      text(c, name, cx, cy + 44, 12, '#eaf0ff');
    });
  };
  draw();
}

// ---------- Missions, flight school and personal achievements ----------
// This block is embedded in game.js, before init(). Its simulation uses the
// existing fixed-step loop; rendering never consumes the daily random stream.
let dailyData = null, dailyLoading = false;
save.records ||= {}; save.dailyBests ||= {}; save.radio ??= 'on';
const RADIO = {
  rescue: ['Pilot: "You took the scenic route."', 'Pilot: "Next time I am taking the bus."'],
  formation: ['Command: "That was a very short formation flight."', 'Command: "Five down. Excellent paperwork."'],
  emptyShock: ['Command: "An expensive way to frighten a cloud."'],
  death: ['Command: "We needed that aircraft back."', 'Command: "A landing is usually slower."'],
  core: ['Command: "Shield down. The glowing bit is the hint."'],
  boss: ['Command: "That will not buff out."'],
};
function radio(kind, force = false) {
  if (save.radio === 'off' || G.training || (!force && G.radio && G.radio.left > 0)) return;
  const lines = RADIO[kind];
  if (lines) G.radio = { text: lines[(G.radioCount = (G.radioCount || 0) + 1) % lines.length], left: 5 };
}
function podColour(it) { return it.lockedCi ?? Math.floor(it.t / 1.5 + it.ci) % 4; }
function recordKey() { return G.diff + ':' + G.si; }
function recordClear() {
  if (G.training || G.daily) return;
  const key = recordKey(), old = save.records[key] || {};
  const earned = { rescue: G.rescued > 0, clean: G.deathsStage === 0, formation: G.formations > 0 };
  const score = G.score - G.stageScore;
  save.records[key] = {
    rescue: !!(old.rescue || earned.rescue), clean: !!(old.clean || earned.clean), formation: !!(old.formation || earned.formation),
    score: Math.max(old.score || 0, score), seconds: Math.min(old.seconds || Infinity, Math.round(G.stageActive)),
    formations: Math.max(old.formations || 0, G.formations), clears: (old.clears || 0) + 1,
  };
  G.earned = earned; store();
}
function medalHtml(si, diff = save.diff) {
  const r = save.records[diff + ':' + si] || {};
  return [['rescue','Rescue','Rescue the captured pilot'],['clean','No losses','Clear without losing a ship'],['formation','Formation','Destroy a complete five-ship formation']]
    .map(([key,label,hint]) => `<span class="medal ${r[key] ? 'earned' : ''}" title="${hint}">${r[key] ? '★' : '☆'} ${label}</span>`).join('');
}
function medalSummary() {
  const r = save.records[recordKey()]; if (!r) return '';
  const remaining = [!r.rescue && 'rescue the pilot', !r.clean && 'lose no ships', !r.formation && 'clear a whole formation'].filter(Boolean);
  return `<div class="mission-records"><div class="medals">${medalHtml(G.si,G.diff)}</div><p class="fine">Best stage score: ${r.score.toLocaleString()} · Fastest clear: ${r.seconds}s</p><p class="fine">${remaining.length ? 'Next medals: ' + remaining.join('; ') + '.' : 'All three stage medals earned.'}</p></div>`;
}

// Six encounters that change tactics rather than only changing the scenery.
const ENCOUNTERS = [
  ['ANTI-AIR BATTERY','Silence the three guns before they fill the sky.'],
  ['DESERT CONVOY','Intercept the moving armoured column.'],
  ['FROST AMBUSH','Watch the charge glow. Cloaked hunters reveal before firing.'],
  ['SPORE NESTS','Destroy the nests to stop the swarms.'],
  ['RIFT VENTS','Glowing vents warn before each eruption.'],
  ['SHIELD GENERATOR','Destroy the generator to remove the Citadel shield.'],
];
EK.frostHunter = { ...EK.cloaker,
  up(e, dt) { const ph = e.t % 4; e.alpha = ph < 1.4 ? .12 : 1; e.y += 16 * dt; if (ph >= 2.3 && !e.fired) { e.fired=true; aimed(e.x,e.y,3,.24,130); } if(ph < .2)e.fired=false; },
  hittable: e => e.alpha > .6,
  dr(c,e) { EK.cloaker.dr(c,e); if(e.t%4 >= 1.4 && e.t%4 < 2.3){c.strokeStyle='#9ff3ff';c.lineWidth=2;c.beginPath();c.arc(e.x,e.y,19,0,TAU);c.stroke();} },
};
EK.nest = { hp: 22, r: 20, score: 1800, air: false, big: 1.5,
  up(e,dt) { e.cool-=dt; if(e.cool<=0 && e.y>20 && e.y<340){e.cool=3.2;for(let i=0;i<3;i++)spawnEnemy('swarm',{x:e.x+(i-1)*12,y:e.y,vx:(i-1)*35,vy:100});} },
  dr(c,e) { for(let i=0;i<6;i++){const a=i*TAU/6;circ(c,e.x+Math.cos(a)*12,e.y+Math.sin(a)*10,8,hitCol(e,'#7c477d'));}circ(c,e.x,e.y,12,hitCol(e,'#61c871'));circ(c,e.x,e.y,5,'#f7e884'); },
};
EK.vent = { hp: 12, r: 16, score: 1200, air:false,
  up(e,dt) { e.cool-=dt;if(e.cool<=0&&e.y>20&&e.y<P.y-80){e.cool=3;for(let i=-1;i<=1;i++)shoot(e.x,e.y,Math.PI/2+i*.26,130,true);} },
  dr(c,e) { ell(c,e.x,e.y,19,13,'#332329');ell(c,e.x,e.y,13,8,hitCol(e,e.cool<1?'#ffe072':'#d74925'));if(e.cool<1){c.strokeStyle='#ffc35a';c.lineWidth=2;c.beginPath();c.arc(e.x,e.y,22+Math.sin(e.t*9)*3,0,TAU);c.stroke();} },
};
EK.generator = { hp:32,r:22,score:3000,air:false,big:1.7,
  up(e,dt) {e.y=Math.min(e.y,G.boss?250:145);}, // below the Dreadnought once it arrives
  dr(c,e) {c.fillStyle=hitCol(e,'#4e477e');c.fillRect(e.x-19,e.y-18,38,36);circ(c,e.x,e.y,12,'#39d5ff');c.strokeStyle='#9ff3ff';c.lineWidth=2;c.beginPath();c.arc(e.x,e.y,27+Math.sin(e.t*4)*3,0,TAU);c.stroke();text(c,'SHIELD',e.x,e.y+35,10,'#9ff3ff');},
};
function encounter() {
  const [name,tip]=ENCOUNTERS[G.si];G.encounterDone=true;G.encounterTitle={text:name,tip,left:5};
  if(G.si===0)for(const x of [70,180,290])spawnEnemy('turret',{x,y:-25,cool:2.6});
  if(G.si===1)for(let i=0;i<4;i++)spawnEnemy('tank',{x:60+i*65,y:-25-i*48,vx:i%2?32:-32,hp:11});
  if(G.si===2)for(let i=0;i<3;i++)spawnEnemy('frostHunter',{x:65+i*115,y:40+i*35,alpha:.12,t:i*.7});
  if(G.si===3)for(const x of [90,270])spawnEnemy('nest',{x,y:-20,cool:2.4});
  if(G.si===4)for(const x of [70,290])spawnEnemy('vent',{x,y:-20,cool:2});
  if(G.si===5){G.shield=true;spawnEnemy('generator',{x:180,y:-25});}
}
// The Citadel shield only covers the surface. It stays up until the generator is destroyed, even across a dive.
const shieldUp=()=>G.shield&&G.mode==='surf';
const originalCoreOpen=coreOpen;
coreOpen=function(b){return !shieldUp()&&originalCoreOpen(b);};
const originalDamage=damage;
damage=function(e,dmg){
  if(e.k!=='generator'&&!EK[e.k].air&&shieldUp()&&!G.training){burst(e.x,e.y,2,['#9ff3ff'],30,.15,1);return;}
  const alive=!e.dead;originalDamage(e,dmg);
  if(alive&&e.dead&&e.form&&G.form[e.form]?.left===0&&!G.form[e.form].broken){G.formations++;radio('formation');}
  if(alive&&e.dead&&e.k==='generator')G.shield=false,G.encounterTitle={text:'SHIELD DOWN',tip:'The Citadel is vulnerable.',left:3};
};
const originalDrawBoss=drawBoss;
drawBoss=function(c){
  originalDrawBoss(c);const b=G.boss;if(!b||b.dying||b.enter>0)return;
  const open=coreOpen(b);
  for(const p of b.parts){if(!p.alive)continue;
    const charging=p.pats.some((pt,i)=>pt[1]>=.8&&p.cool?.[i]>0&&p.cool[i]<.65);
    c.save();c.strokeStyle=p.core&&!open?'#9fb0d8':charging?'#ffb347':'#5cf08a';c.lineWidth=charging?3:1.5;
    if(p.core&&!open)c.setLineDash([3,4]);c.beginPath();c.arc(b.x+p.dx,b.y+p.dy,p.r+5+(charging?Math.sin(G.now*16)*2:0),0,TAU);c.stroke();
    if(charging)text(c,'CHARGING',b.x+p.dx,b.y+p.dy-p.r-12,8,'#ffd596');c.restore();
  }
};

// The lesson waits for steering, a pickup, SHOCK and a dive gate in that order.
const LESSONS = [
  ['Move your ship','Drag anywhere, or use the arrow keys.'],
  ['Collect the yellow weapon pod','Fly into it to upgrade your automatic guns.'],
  ['Clear the bullets with SHOCK','Tap SHOCK, or press Space.'],
  ['Enter the striped dive gate','Fly into the centre of the gate.'],
];
function lessonStep(step) {
  G.training.step=step;G.training.time=0;G.en=[];G.eb=[];G.it=[];G.ps=[];
  if(step===1)G.it.push({k:'cap',x:180,y:Math.min(440,P.y-50),t:0,r:12,ci:0,lockedCi:0,lesson:true});
  if(step===2)for(let i=0;i<7;i++)G.eb.push({x:55+i*40,y:240,vx:0,vy:0,r:4});
  if(step===3)spawnEnemy('gate',{x:180,y:Math.min(430,P.y-70),lesson:true});
}
function beginTraining(){play(0,true);G.training={step:0,time:0,startX:P.x,startY:P.y};G.tl=[];G.help=0;G.banner=null;P.inv=0;G.bombs=3;$('trainingSkip').hidden=false;lessonStep(0);}
function completeTraining(skipped=false){
  save.trainingDone=true;store();G.training=null;$('trainingSkip').hidden=true;G.state='clear';
  showOver(`<h2>${skipped?'Ready to fly?':'Flight school complete'}</h2><p>${skipped?'You can replay flight school from the home page.':'You can steer, upgrade, use SHOCK and dive to rescue pilots.'}</p><div class="row"><button class="btn" id="lessonHome">Home</button><button class="btn primary" id="lessonPlay">Start campaign</button></div>`,'win');
  $('lessonHome').onclick=quitToMenu;$('lessonPlay').onclick=()=>play(0,false);
}
const originalCollect=collect;
collect=function(it){originalCollect(it);if(it.k==='pod')radio('rescue');if(G.training?.step===1&&it.k==='cap')lessonStep(2);};
const originalBomb=useBomb;
useBomb=function(){
  const before=G.bombs,empty=G.eb.length===0&&!G.en.some(e=>!EK[e.k].nohit&&e.y>0&&e.y<H)&&!G.boss;
  originalBomb();if(G.bombs<before){if(empty)radio('emptyShock');if(G.training?.step===2)lessonStep(3);}
};
const originalDie=die;
die=function(){if(G.training)return;const was=P.alive;originalDie();if(was&&!P.alive)radio('death');};
const originalDive=startDive;
startDive=function(gate){if(G.training){if(G.training.step===3)completeTraining();return;}originalDive(gate);};

// Daily sorties have their own server-issued configuration and score table.
function dailyTimeline(cfg){
  const r=rng(cfg.seed),ev=[];
  if(cfg.type==='boss'){ev.push({t:3,w:'boss'});return ev;}
  for(let t=2;t<119;t+=3.5){ev.push({t,w:pickW(POOLS[cfg.stage],r),x:60+r()*240,side:r()<.5?-1:1});}
  for(let t=7;t<115;t+=12)ev.push({t,w:'freighter',side:r()<.5?-1:1});
  for(let t=5;t<115;t+=7)ev.push({t,w:'darters',side:r()<.5?-1:1});
  return ev.sort((a,b)=>a.t-b.t);
}
async function loadDaily(){
  if(dailyLoading)return;dailyLoading=true;
  try{dailyData=await SUK.api('sq_daily');}catch{dailyData=null;}finally{dailyLoading=false;renderDaily();}
}
function renderDaily(){
  const el=$('dailyMission');if(!el)return;
  if(!dailyData){el.innerHTML='<h2>Daily sortie</h2><p class="fine">Connect to load today’s two-minute mission.</p><div class="row"><button class="btn" id="dailyRetry">Retry connection</button><button class="btn" id="flightSchool">Flight school</button></div>';$('dailyRetry').onclick=loadDaily;$('flightSchool').onclick=beginTraining;return;}
  const c=dailyData.mission,best=save.dailyBests[c.day]||0;
  el.innerHTML=`<div class="mission-head"><div><p class="fine">DAILY SORTIE · ${esc(c.day)}</p><h2>${esc(c.title)}</h2></div><span class="mission-time">2 MIN</span></div><p>${esc(c.description)}</p><p class="fine">${esc(STAGES[c.stage].name)} · Pilot difficulty · ${WEAPONS[c.weapon].name} level 3 · Same flight plan for everyone.</p><div class="row"><button class="btn primary" id="dailyPlay">${best?'Fly again':'Fly today’s sortie'}</button><button class="btn" id="flightSchool">Flight school</button></div><p class="fine">${best?'Your best on this device: '+best.toLocaleString()+'. ':''}Resets at midnight UK time. ${me?'Your best submitted score ranks below.':'Sign in before flying to join the daily leaderboard.'}</p><ol class="daily-board">${dailyData.rows.length?dailyData.rows.map((r,i)=>`<li><span>${i+1}. ${esc(SUK.firstName(r.name))}</span><b>${r.score.toLocaleString()}</b></li>`).join(''):'<li>No scores yet. Take the first sortie.</li>'}</ol>${dailyData.mine?`<p class="fine">Your daily rank: ${dailyData.mine.rank} · Best: ${dailyData.mine.score.toLocaleString()}</p>`:''}<p class="fine" id="dailyStatus" role="status"></p>`;
  $('dailyPlay').onclick=beginDaily;$('flightSchool').onclick=beginTraining;
}
async function beginDaily(e){
  // Started from the menu (#dailyPlay) or the results screen's Fly again (#dailyAgain): disable that button, and report a
  // failure where the player is looking.
  const btn=e?.currentTarget||$('dailyPlay'),again=btn&&btn.id==='dailyAgain';if(btn)btn.disabled=true;
  if(again){const el=$('dailySaved');if(el)el.textContent='Starting a new sortie…';}
  try{
    const result=await SUK.api('sq_daily_start',{}),cfg=result.mission;
    const reached=save.reached;
    snd&&snd.unlock();primeExplosions();music.stop();showGame();newRun(cfg.stage,true);save.reached=reached;store();
    G.daily={...cfg,token:result.token,active:0,bosses:0,finished:false};G.training=null;
    dailyRandom=rng(cfg.seed);inSimulation=true;
    try{G.diff=1;P.wt=cfg.weapon;P.wl=3;startStage(cfg.stage);G.tl=dailyTimeline(cfg);G.help=0;G.banner={text:'DAILY SORTIE',sub:cfg.title,t:2.4};
      if(cfg.type==='rescue')dailyCave();
    }finally{inSimulation=false;}
  }catch(err){const el=$(again?'dailySaved':'dailyStatus');if(el)el.textContent=err.message||'The mission could not start. Try again.';}finally{if(btn)btn.disabled=false;}
}
function dailyCave(){
  G.mode='cave';G.cd=0;G.ct=0;G.cspeed=54;G.ctl=buildCave(G.si);G.cti=0;G.en=[];G.eb=[];G.ps=[];G.it=[];G.boss=null;
  P.x=P.tx=180;P.y=P.ty=560;P.inv=2;
}
const originalSurface=startSurface;
startSurface=function(){if(G.daily?.type==='rescue'){G.daily.bosses++;dailyCave();return;}originalSurface();
  const then=G.trans.then;G.trans.then=()=>{then();if(G.shield)spawnEnemy('generator',{x:180,y:-25});}; // the generator is still there
};
async function finishDaily(survived){
  const d=G.daily;if(!d||d.finished)return;d.finished=true;G.state='clear';
  save.dailyBests[d.day]=Math.max(save.dailyBests[d.day]||0,G.score);store();
  showOver(`<p class="kicker">Daily sortie · ${esc(d.day)}</p><h2>${survived?'Sortie complete':'Sortie ended'}</h2><p class="big">${G.score.toLocaleString()}</p><p>${Math.floor(d.active)} / 120 seconds · ${G.rescuedRun} pilots rescued · ${d.bosses} bosses defeated</p><p id="dailySaved" class="fine" role="status">${d.token?'Saving your daily score…':'Saved on this device. Sign in before the next flight to join the daily leaderboard.'}</p><div class="row"><button class="btn" id="dailyHome">Home</button><button class="btn primary" id="dailyAgain">Fly again</button></div>`,'win');
  $('dailyHome').onclick=quitToMenu;$('dailyAgain').onclick=beginDaily;
  if(d.token){try{const result=await SUK.api('sq_daily_submit',{token:d.token,score:G.score,secs:Math.min(120,Math.floor(d.active)),rescued:G.rescuedRun,bosses:d.bosses});const el=$('dailySaved');if(el)el.textContent='Daily best saved. Your rank: '+result.rank+'.';}catch(e){const el=$('dailySaved');if(el)el.textContent=e.message||'Score could not be saved.';}}
  loadDaily();
}

const originalNewRun=newRun;
newRun=function(si,practice){G.daily=null;G.training=null;dailyRandom=null;$('trainingSkip').hidden=true;originalNewRun(si,practice);};
const originalStartStage=startStage;
startStage=function(si){
  const reached=save.reached;originalStartStage(si);
  if(G.daily||G.training){save.reached=reached;store();}
  G.formations=0;G.stageActive=0;G.encounterDone=false;G.encounterTitle=null;G.earned=null;G.radio=null;G.radioCount=0;
};
const originalUpdate=update;
update=function(dt){
  inSimulation=!!G.daily;
  try{
    if(G.daily&&!G.daily.finished){G.daily.active=Math.min(120,G.daily.active+dt);if(G.daily.active>=120){finishDaily(true);return;}}
    G.stageActive=(G.stageActive||0)+dt;
    if(G.radio)G.radio.left=Math.max(0,G.radio.left-dt);
    if(G.encounterTitle)G.encounterTitle.left-=dt;
    if(G.training){
      const tr=G.training;tr.time+=dt;P.inv=0;G.tl=[];
      if(tr.step===0&&Math.hypot(P.x-tr.startX,P.y-tr.startY)>25)lessonStep(1);
      if(tr.step===1){for(const it of G.it)if(it.lesson)it.y=Math.min(it.y,500);}
      if(tr.step===3)for(const e of G.en)if(e.lesson)e.y=Math.min(e.y,480);
    }
    for(const it of G.it)if(it.k==='cap'&&!it.lesson){if(Math.hypot(it.x-P.x,it.y-P.y)<58){it.lockedCi??=podColour(it);}else delete it.lockedCi;}
    if(!G.daily&&!G.training&&G.mode==='surf'&&!G.encounterDone&&G.t>=24)encounter();
    originalUpdate(dt);
    const b=G.boss;if(b&&b.enter<=0&&!b.dying&&coreOpen(b)&&!b.openAnnounced){b.openAnnounced=true;radio('core',true);}
    if(G.daily?.type==='rescue'&&G.clearT>0)G.clearT=0;
  }finally{inSimulation=false;}
};
const originalStageCleared=stageCleared;
stageCleared=function(){
  if(G.daily){G.daily.bosses++;G.clearT=0;G.boss=null;spawnBoss(BOSSES[(G.si+G.daily.bosses)%6]);return;}
  originalStageCleared();
  if(G.si!==STAGES.length-1)over.insertAdjacentHTML('beforeend',medalSummary());
};
const originalHitBossPart=hitBossPart;
hitBossPart=function(b,p,dmg){const dying=b.dying;const hit=originalHitBossPart(b,p,dmg);if(!dying&&b.dying)radio('boss',true);return hit;};
const originalFinishRun=finishRun;
finishRun=async function(won){
  if(G.daily)return finishDaily(false);
  if(G.training)return completeTraining(true);
  const pending=originalFinishRun(won);if(won)over.insertAdjacentHTML('beforeend',medalSummary());return pending;
};
const originalQuit=quitToMenu;
quitToMenu=function(){G.training=null;G.daily=null;dailyRandom=null;$('trainingSkip').hidden=true;originalQuit();loadDaily();};
const originalControlsHtml=controlsHtml;
controlsHtml=function(){return originalControlsHtml()+`<div class="setrow"><span>Radio chatter</span><div class="seg" role="radiogroup" data-set="radio">${[['on','On'],['off','Off']].map(([v,label])=>`<button type="button" role="radio" aria-checked="${save.radio===v}" data-v="${v}">${label}</button>`).join('')}</div></div>`;};
const originalRenderMenu=renderMenu;
renderMenu=function(){
  originalRenderMenu();renderDaily();
  $('stageCards').querySelectorAll('.stage-card').forEach((b,i)=>{
    b.querySelector('.sc-body').insertAdjacentHTML('beforeend',`<span class="medals">${medalHtml(i)}</span>`);
    const r=save.records[save.diff+':'+i];if(r)b.querySelector('.sc-body').insertAdjacentHTML('beforeend',`<span class="fine">Best ${r.score.toLocaleString()} · ${r.seconds}s fastest</span>`);
  });
};
function featureHUD(c){
  if(G.daily){text(c,Math.max(0,120-Math.floor(G.daily.active))+'s · '+G.daily.title,180,82,11,'#ffcc33');}
  if(G.training){const lesson=LESSONS[G.training.step];c.fillStyle='rgba(5,8,20,.86)';c.fillRect(14,82,332,58);text(c,lesson[0],180,100,12,'#ffcc33');text(c,lesson[1],180,121,10,'#eaf0ff');}
  if(G.encounterTitle?.left>0){text(c,G.encounterTitle.text,180,88,13,'#ffcc33');const words=G.encounterTitle.tip.split(' ');let line='',y=108;for(const w of words){if((line+w).length>43){text(c,line.trim(),180,y,9,'#fff');y+=14;line='';}line+=w+' ';}text(c,line.trim(),180,y,9,'#fff');}
  if(G.radio?.left>0&&save.radio!=='off'&&!G.training){
    const ry=P.y>H/2?(G.boss||G.daily?94:74):H-105;c.fillStyle='rgba(5,8,20,.82)';c.beginPath();c.roundRect(10,ry,340,40,8);c.fill();
    const words=G.radio.text.split(' ');let lines=[''];for(const word of words){const i=lines.length-1;if((lines[i]+word).length>43)lines.push(word+' ');else lines[i]+=word+' ';}lines.slice(0,2).forEach((s,i)=>text(c,s.trim(),180,ry+12+i*15,10,'#e1f4ff'));
  }
  if(G.boss&&!G.boss.dying&&G.boss.enter<=0)text(c,coreOpen(G.boss)?'CORE EXPOSED':shieldUp()?'DESTROY THE SHIELD GENERATOR':'DESTROY THE GREEN-RINGED GUNS',180,77,9,coreOpen(G.boss)?'#5cf08a':'#eaf0ff');
}
const originalDrawHUD=drawHUD;
drawHUD=function(c){originalDrawHUD(c);featureHUD(c);};
// Keep the original hook useful for deterministic automated play-throughs.
function featureTestHook(){return {beginTraining,lessonStep,completeTraining,beginDaily,finishDaily,encounter,collect,damage,recordClear,podColour,coreOpen,spawnBoss,stageCleared,gameOver,finishRun,drawItem,drawBoss,dailyTimeline,loadDaily,getDaily:()=>dailyData,radio};}

// ---------- Start up ----------
async function init() {
  if (snd) snd.bindMute(document.querySelectorAll('[data-mute]'), () => { syncMusic(); if (!menu.hidden) renderMenu(); });
  GH.install({ btn: 'installBtn', tip: 'iosInstall', tipKey: 'squadron-ios-tip', sw: '/squadron-battle/sw.js', scope: '/squadron-battle/' });
  GH.backNav({ depth: () => gameEl.hidden ? 0 : 1, back: () => { if (G.state === 'play') pause(); else quitToMenu(); } });
  $('playBtn').onclick = () => save.trainingDone ? play(0,false) : beginTraining();
  $('trainingSkip').onclick = () => completeTraining(true);
  loadDaily();
  $('ghHowBtn').onclick = () => GH.open('ghHow');
  $('ghBoardBtn').onclick = () => { GH.open('ghBoard'); loadBoard(); };
  renderMenu();
  try { await document.fonts.load(`16px ${FONT}`); } catch {}
  drawMenuArt(); window.addEventListener('resize', () => { if (!menu.hidden) drawMenuArt(); });
  if (location.hash === '#ships') shipGallery();
  if (location.hash === '#bosses') bossGallery();
  if (location.hash === '#guardians') bossGallery(CAVE_BOSSES, 'CAVE GUARDIANS');
  $('playBtn').disabled = false;
  const b = await loadBoard();
  GH.account($('acct'), { user: me, clientId, why: 'Sign in with Google to put your scores on the Squadron Battle leaderboard.' });
  if (!b) GH.account($('acct'), {});
  renderDaily();
}
init();

// Test hook (used by the automated play-through).
window.__sq = { G, P, save, play, update, render, useBomb, startStage, BOSSES, STAGES, EK, quitToMenu, pause, resume, features: featureTestHook(), setInv(v) { P.inv = v; } };
})();

