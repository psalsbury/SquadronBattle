// Squadron Battle service worker: makes the game installable and playable offline.
// Pages load from the network first (so updates show straight away) and fall back to the cache offline.
// Scripts, icons and fonts come from the cache and refresh in the background. The API (leaderboard) is never cached.
const CACHE = 'sq-lib-1';
const PRECACHE = ['/squadron-battle/', '/squadron-battle/lib/fonts.css?v=1', 'game.js?v=25', '/squadron-battle/lib/auth.js?v=1', '/squadron-battle/lib/game-home.js?v=1', '/squadron-battle/lib/game-home.css?v=1', '/squadron-battle/lib/sfx.js?v=1', 'icon-192.png', 'manifest.webmanifest'];

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
  const ours = url.origin === self.location.origin && url.pathname.startsWith('/squadron-battle/'); // everything the game needs is in its own folder
  if (!ours) return; // the API and everything else go straight to the network
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

