// Salsbury games intro, shown once each time the app starts (apps only; build-www.sh puts it straight after <body>).
// The characters are sprite sheets drawn by each game's own code (render-sprites.mjs), so they match the games.
// window.SG_SPLASH (set before this script) = { dir, title: [a, b], colors: [a, b], shadows: [a, b], font }.
(() => {
  const CFG = window.SG_SPLASH || {}, DIR = CFG.dir || '/splash/';
  const root = document.getElementById('sgSplash');
  if (!root) return;
  let seen = false;
  try { seen = sessionStorage.getItem('sg-splash') === '1'; sessionStorage.setItem('sg-splash', '1'); } catch {}
  if (seen) { root.remove(); return; } // e.g. the page reloaded after deleting an account

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TOTAL = reduce ? 1.6 : 4.1, FADE = 0.45;
  root.innerHTML = '<canvas></canvas><div class="sg-logo"><span class="sg-mark">S</span><span class="sg-word">' +
    [...'Salsbury'].map(ch => `<span>${ch}</span>`).join('') + '<i></i>' + [...'games'].map(ch => `<span class="b">${ch}</span>`).join('') +
    '</span></div><div class="sg-presents"><div class="sg-pre">presents</div><div class="sg-title"></div></div>';
  const cv = root.querySelector('canvas'), c = cv.getContext('2d');
  const logo = root.querySelector('.sg-logo'), pres = root.querySelector('.sg-presents');
  if (CFG.title) {
    const t = pres.querySelector('.sg-title');
    t.innerHTML = CFG.title.map((w, i) => `<span style="color:${CFG.colors[i]};text-shadow:0 .09em 0 ${CFG.shadows[i]}">${w}</span>`).join(' ');
    if (CFG.font) t.style.fontFamily = CFG.font;
  } else pres.remove();

  // ---------- sprites ----------
  const META = { "graham": [187, 0.392, 0.839, 0.7], "bruce": [114, 0.5, 0.93, 0.7], "sisters": [193, 0.507, 0.973, 0.7],
    "betty": [317, 0.604, 0.571, 0.9], "trevor": [160, 0.225, 0.981, 0.8] }; // fw, ox, oy, loop (sprites.json)
  const FH = 200, N = 16, img = {};
  for (const id in META) { img[id] = new Image(); img[id].src = `${DIR}${id}.webp`; }
  // h = height on screen (as a share of the row size), ground-standing, left to right; the app's own star stands in front.
  const ROW = [['bruce', -0.36, 0.25], ['sisters', -0.18, 0.22], ['trevor', 0.22, 0.235], ['graham', 0.0, 0.27]];
  function sprite(id, x, y, h, t, flip) {
    const im = img[id], [fw, ox, oy, loop] = META[id];
    if (!im.complete || !im.naturalWidth) return;
    const f = Math.floor(((t % loop) + loop) % loop / loop * N) % N, k = h / FH;
    c.save(); c.translate(x, y); if (flip) c.scale(-1, 1);
    c.drawImage(im, f * fw, 0, fw, FH, -ox * fw * k, -oy * FH * k, fw * k, FH * k);
    c.restore();
  }

  // ---------- helpers ----------
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = k => 1 - Math.pow(1 - clamp(k), 3);
  const spring = k => { k = clamp(k); return k >= 1 ? 1 : 1 - Math.exp(-6 * k) * Math.cos(k * 11); };
  let W = 0, H = 0, dpr = 1;
  function size() {
    dpr = Math.min(2.5, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size(); addEventListener('resize', size);

  // twinkling stars (a nod to Halfsky's sky)
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const STARS = Array.from({ length: 70 }, () => ({ x: rnd(), y: rnd() * 0.75, r: 0.6 + rnd() * 1.4, p: rnd() * 6 }));
  // Fireworks (from Meteor Mayday): launched from the ground on the right, burst behind the logo
  const COLS = ['#ffd23f', '#ff8a4c', '#a9ded1', '#ff5a4a', '#9fb3ff', '#fbf3dc'];
  const SHOTS = [[1.15, -0.30, 0.20, 0], [1.45, 0.28, 0.16, 1], [1.8, 0.02, 0.10, 3], [2.25, -0.18, 0.13, 4], [2.6, 0.33, 0.24, 2]];
  const sparks = SHOTS.map(() => Array.from({ length: 34 }, (_, i) => ({ a: i / 34 * Math.PI * 2 + rnd() * 0.15, v: 0.75 + rnd() * 0.35 })));

  // ---------- layout ----------
  function layout() {
    const U = Math.min(W, H * (W > H ? 0.75 : 0.62), 560); // row size
    return { U, gy: H * (W > H ? 0.93 : 0.86), cx: W / 2, logoY: H * (W > H ? 0.24 : 0.30) };
  }

  // the DOM logo moves with the timeline
  function place(t, L) {
    // the S mark starts in the middle (where Android's launch screen left it), then rises into the logo
    const k = reduce ? 1 : ease((t - 0.15) / 0.55);
    const y = H / 2 + (L.logoY - H / 2) * k;
    logo.style.transform = `translate(-50%, ${y}px) translateY(-50%)`;
    logo.style.setProperty('--sg-k', k);
    const words = logo.querySelectorAll('.sg-word span');
    words.forEach((s, i) => { const q = reduce ? 1 : spring((t - 0.5 - i * 0.045) / 0.6); s.style.transform = `translateY(${(1 - q) * 0.9}em)`; s.style.opacity = clamp(q * 1.6); });
    if (pres.isConnected) {
      const p1 = reduce ? 1 : clamp((t - 2.0) / 0.35), p2 = reduce ? 1 : spring((t - 2.25) / 0.7);
      const lb = logo.getBoundingClientRect(); pres.style.top = `${lb.bottom + Math.min(W, H) * 0.02}px`;
      pres.querySelector('.sg-pre').style.opacity = p1;
      const ti = pres.querySelector('.sg-title'); ti.style.opacity = clamp(p2 * 2); ti.style.transform = `scale(${0.4 + 0.6 * p2}) rotate(${(1 - p2) * -8 - 2}deg)`;
    }
  }

  function frame(t) {
    const L = layout(), { U, gy, cx } = L;
    c.clearRect(0, 0, W, H);
    // sky glow
    const g = c.createRadialGradient(cx, L.logoY, 10, cx, L.logoY, Math.max(W, H) * 0.7);
    g.addColorStop(0, '#1b3150'); g.addColorStop(1, '#101c2c'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const fadeIn = reduce ? 1 : clamp(t / 0.6);
    for (const s of STARS) { c.globalAlpha = fadeIn * (0.35 + 0.45 * Math.sin(t * 2.2 + s.p) ** 2); c.fillStyle = '#e8f1ff'; c.beginPath(); c.arc(s.x * W, s.y * H, s.r, 0, 7); c.fill(); }
    c.globalAlpha = 1;

    // fireworks
    if (!reduce) SHOTS.forEach(([at, dx, hy, col], n) => {
      const sx = cx + U * 0.44, sy = gy, ex = cx + dx * U, ey = H * hy + L.logoY * 0.35;
      const k = (t - at) / 0.45;
      if (k > 0 && k < 1) { // rocket climbing, with a little tail
        const x = sx + (ex - sx) * ease(k), y = sy + (ey - sy) * ease(k);
        c.strokeStyle = 'rgba(255,220,150,.75)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x - (ex - sx) * 0.06, y + (sy - ey) * 0.08); c.stroke();
        c.fillStyle = '#fff6d0'; c.beginPath(); c.arc(x, y, 2.4, 0, 7); c.fill();
      }
      const b = t - at - 0.45;
      if (b > 0 && b < 1.3) {
        const r = U * 0.24 * ease(b / 0.9), r0 = U * 0.24 * ease((b - 0.12) / 0.9), a = clamp(1 - b / 1.3), drop = b * b * U * 0.05;
        c.fillStyle = c.strokeStyle = COLS[col]; c.lineCap = 'round';
        for (const s of sparks[n]) {
          const cs = Math.cos(s.a) * s.v, sn = Math.sin(s.a) * s.v, x = ex + cs * r, y = ey + sn * r + drop;
          c.globalAlpha = a * 0.55; c.lineWidth = 2.4; c.beginPath(); c.moveTo(ex + cs * r0, ey + sn * r0 + drop * 0.8); c.lineTo(x, y); c.stroke(); // streak
          c.globalAlpha = a * (0.7 + 0.3 * Math.sin(t * 30 + s.a * 9)); c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill();
        }
        if (b < 0.12) { c.globalAlpha = 1 - b / 0.12; c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, ey, U * 0.05, 0, 7); c.fill(); }
        c.globalAlpha = 1;
      }
    });

    // Biplane Betty flies across the top, waving her scarf
    if (!reduce) {
      const k = (t - 0.55) / 2.4;
      if (k > -0.1 && k < 1.1) {
        const x = -U * 0.3 + (W + U * 0.6) * k, y = H * 0.12 + Math.sin(k * 7) * U * 0.03;
        for (let i = 1; i <= 6; i++) { // smoke puffs
          const pk = k - i * 0.03; if (pk < 0) continue;
          c.globalAlpha = 0.18 * (1 - i / 7); c.fillStyle = '#dfe8f5';
          c.beginPath(); c.arc(-U * 0.3 + (W + U * 0.6) * pk - U * 0.09, H * 0.12 + Math.sin(pk * 7) * U * 0.03 + U * 0.01, U * (0.012 + i * 0.006), 0, 7); c.fill();
        }
        c.globalAlpha = 1; sprite('betty', x, y, U * 0.16, t);
      }
    }

    // the line-up, popping up from below one by one
    c.fillStyle = 'rgba(169,222,209,.10)'; c.beginPath(); c.ellipse(cx, gy + 4, U * 0.55, U * 0.035, 0, 0, 7); c.fill();
    ROW.forEach(([id, dx, h], i) => {
      const order = [0, 1, 3, 4, 2][i]; // pops up left to right; Graham is drawn last so he stands in front
      const q = reduce ? 1 : spring((t - 0.95 - order * 0.14) / 0.7);
      if (q <= 0) return;
      const x = cx + dx * U, y = gy + (1 - q) * U * 0.45;
      c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(x, gy + 2, U * 0.06 * clamp(q), U * 0.012, 0, 0, 7); c.fill();
      sprite(id, x, y, U * h, t + i * 0.13);
    });
  }

  // ---------- run ----------
  let start = 0, raf = 0, ending = 0;
  function finish(fast) {
    if (ending) return;
    ending = performance.now();
    root.style.transition = `opacity ${fast ? 0.2 : FADE}s ease`; root.style.opacity = 0;
    setTimeout(() => { cancelAnimationFrame(raf); root.remove(); removeEventListener('resize', size); }, (fast ? 0.2 : FADE) * 1000 + 50);
  }
  function tick(now) {
    if (!start) start = now;
    const t = (now - start) / 1000;
    place(t, layout()); frame(t);
    if (t >= TOTAL - FADE) finish(false);
    raf = requestAnimationFrame(tick);
  }
  root.addEventListener('pointerdown', () => finish(true));
  // never stay up for good, whatever happens
  setTimeout(() => finish(false), (TOTAL + 2) * 1000);
  raf = requestAnimationFrame(tick);
})();
