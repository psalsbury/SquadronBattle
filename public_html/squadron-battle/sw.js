// Squadron Battle service worker: makes the game installable and playable offline.
// Pages load from the network first (so updates show straight away) and fall back to the cache offline.
// Scripts, icons and fonts come from the cache and refresh in the background. The API (leaderboard) is never cached.
const CACHE = 'sq-v20';
const PRECACHE = ['/squadron-battle/', 'game.js?v=20', '/assets/auth.js?v=3', '/assets/game-home.js?v=2', '/assets/game-home.css?v=mobile-3', '/assets/sfx.js?v=5', 'icon-192.png', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('sq-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  const ours = url.origin === self.location.origin && (url.pathname.startsWith('/squadron-battle/') || url.pathname.startsWith('/assets/'));
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!ours && !fonts) return; // the API and everything else go straight to the network
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; }) // never cache an error page over the game
      .catch(() => caches.match(req).then(r => r || caches.match('/squadron-battle/'))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req);
    const fresh = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || fresh;
  }));
});

