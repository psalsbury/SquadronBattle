// Renders looping sprite sheets of characters from salsbury.uk games, using each game's own drawing code.
// usage: PW_DIR=<folder with node_modules/playwright-core> /opt/node/bin/node render-sprites.mjs <outdir>  (then copy the
// .webp files and the numbers in sprites.json into splash.js META). Draws from the LIVE games at salsbury.uk.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire((process.env.PW_DIR || '/tmp/claude-0/-root/6dd80ef2-90b6-42ec-93bd-26bd00b22d86/scratchpad/tools') + '/');
const { chromium } = require('playwright-core');
const OUT = process.argv[2];
const N = 16, H_OUT = 200; // frames per loop, sheet height in px
const CHARS = [
  { id: 'graham', page: 'gangster-graham', expose: '{ drawBarry, THEMES }', loop: 0.7,
    draw: `(c, t) => { const X = window.__spr; X.drawBarry(c, { x: 0, floor: 0 }, { mode: 'win', win: 'floss', t, facing: 1, aim: -0.25, kick: 0, look: 0, bored: 0, idle: 0, nervous: 0 }, t, X.THEMES[0]); }` },
  { id: 'bruce', page: 'boomerang-bruce', loop: 0.7,
    draw: `(c, t) => { window.BBThemes.drawBruce(c, 0, 0, { face: 1, t, mode: 'win' }, t, { scale: 1, holding: true }); }` },
  { id: 'sisters', page: 'big-adventure', loop: 0.7,
    draw: `(c, t) => { window.ART.duo(c, 0, 0, 1, { pose: 'cheer', t }); }` },
  { id: 'betty', page: 'biplane-betty', expose: '{ drawPlane }', loop: 0.9,
    draw: `(c, t) => { window.__spr.drawPlane(c, 0, 0, -0.08 + Math.sin(t * 2 * Math.PI / 0.9) * 0.05, t, false); }` },
  { id: 'trevor', page: 'trickshot-trevor', expose: '{ drawTrevor }', loop: 0.8,
    draw: `(c, t) => { c.scale(40, 40); const w = Math.sin(t * 2 * Math.PI / 0.8); window.__spr.drawTrevor(c, 'garden', { mood: 'happy', swing: 0.5 + 0.45 * w, wave: 0.5 + 0.5 * w, capUp: 0 }, t); }` },
];
const b = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'] });
const meta = {};
for (const ch of CHARS) {
  const page = await b.newPage({ viewport: { width: 800, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  if (ch.expose) await page.route(`**/${ch.page}/game.js*`, async r => {
    const res = await r.fetch(); let s = await res.text();
    const i = s.lastIndexOf('})();');
    s = s.slice(0, i) + `window.__spr = ${ch.expose};\n` + s.slice(i);
    await r.fulfill({ response: res, body: s });
  });
  await page.goto(`https://salsbury.uk/${ch.page}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const res = await page.evaluate(async ({ N, H_OUT, loop, draw }) => {
    await document.fonts.ready;
    const fn = eval(draw), S = 600, OX = 300, OY = 420, K = 3; // draw big, then crop + scale down
    const frames = [];
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let i = 0; i < N; i++) {
      const cv = document.createElement('canvas'); cv.width = cv.height = S * 2; const c = cv.getContext('2d');
      c.translate(OX * 2, OY * 2); c.scale(K, K);
      fn(c, (i / N) * loop + 0.0001);
      const d = c.getImageData(0, 0, cv.width, cv.height).data;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      frames.push(cv);
    }
    x0 -= 2; y0 -= 2; x1 += 2; y1 += 2;
    const w = x1 - x0, h = y1 - y0, k = H_OUT / h, fw = Math.ceil(w * k);
    const sheet = document.createElement('canvas'); sheet.width = fw * N; sheet.height = H_OUT;
    const sc = sheet.getContext('2d'); sc.imageSmoothingQuality = 'high';
    frames.forEach((f, i) => sc.drawImage(f, x0, y0, w, h, i * fw, 0, fw, H_OUT));
    // where the character's feet/origin sit inside a frame, as fractions
    return { url: sheet.toDataURL('image/webp', 0.86), fw, fh: H_OUT, n: N, loop, ox: (OX * 2 - x0) / w, oy: (OY * 2 - y0) / h };
  }, { N, H_OUT, loop: ch.loop, draw: ch.draw });
  fs.writeFileSync(`${OUT}/${ch.id}.webp`, Buffer.from(res.url.split(',')[1], 'base64'));
  delete res.url; meta[ch.id] = res;
  console.log(ch.id, JSON.stringify(res), errs.slice(0, 3));
  await page.close();
}
fs.writeFileSync(`${OUT}/sprites.json`, JSON.stringify(meta, null, 1));
await b.close();
