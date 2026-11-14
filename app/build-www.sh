#!/bin/bash
# Copies the live Squadron Battle page from salsbury.uk into www/ for the Android and iPhone apps and adapts it:
# API calls go to https://salsbury.uk (window.SUK_API; sent natively by CapacitorHttp, so no CORS), no service
# worker, web-app manifest or website invitation gate, and the app shim (window.SUK_APP: native Google sign-in, plus
# Sign in with Apple on iPhone) loads before lib/auth.js. The app has no adverts.
set -euo pipefail
SITE=${SITE:-/var/www/salsbury.uk}
cd "$(dirname "$0")"
# iPhone: Google's iOS OAuth client for uk.salsbury.squadronbattle (Google Cloud > Credentials, project salsbury-uk).
# Empty until Pete creates it: then the iPhone app offers Sign in with Apple only. Same value in sync-ios.sh, and add
# it to google_app_client_ids in /var/lib/salsbury-uk/config.php.
IOS_GOOGLE_CLIENT_ID=''

rm -rf www && mkdir -p www/squadron-battle
cp "$SITE"/squadron-battle/{index.html,game.js,icon-192.png,icon-512.png} www/squadron-battle/
cp -r "$SITE"/squadron-battle/lib www/squadron-battle/ # the game's own copies of the shared files and its fonts
cp src/sq-app.js src/sq-app.css www/squadron-battle/
cp -r src/splash www/splash && rm -f www/splash/render-sprites.mjs www/splash/sprites.json # the Salsbury games intro

python3 - "$IOS_GOOGLE_CLIENT_ID" <<'PY'
import sys
igid, = sys.argv[1:]
def patch(path, subs):
    s = open(path).read()
    for old, new in subs:
        if old not in s: sys.exit(f'build-www: "{old}" not found in {path}; the page changed, update build-www.sh')
        s = s.replace(old, new)
    open(path, 'w').write(s)

patch('www/squadron-battle/index.html', [
    ('<link rel="manifest" href="/squadron-battle/manifest.webmanifest">\n', ''),
    ('<link rel="apple-touch-icon" href="/squadron-battle/apple-touch-icon.png">\n', ''),
    ('<script src="/assets/play-gate.js?v=1" defer></script>\n', ''), # website-only invitation gate (apps are open)
    ('<script src="/squadron-battle/lib/auth.js',
     '<link rel="stylesheet" href="/squadron-battle/sq-app.css">\n'
     f'<script>window.SQ_APP_CONFIG = {{ ios: {{ googleClientId: "{igid}" }} }};</script>\n'
     '<script>window.SUK_API = "https://salsbury.uk/api/index.php";</script>\n'
     '<script src="/squadron-battle/sq-app.js"></script>\n<script src="/squadron-battle/lib/auth.js'),
    # the Salsbury games intro (src/splash): covers the page from the first paint, once per app start
    ('</head>\n<body data-screen="menu">\n',
     '<link rel="preload" href="/splash/sora-700-latin.woff2" as="font" type="font/woff2" crossorigin>\n'
     '<link rel="stylesheet" href="/splash/splash.css">\n</head>\n<body data-screen="menu">\n<div id="sgSplash" aria-hidden="true"></div>\n'
     "<script>window.SG_SPLASH = { dir: '/splash/', title: ['Squadron', 'Battle'], colors: ['#39d5ff', '#ff8a3d'], shadows: ['#0d5f7a', '#8a3a0c'] };</script>\n"
     '<script src="/splash/splash.js"></script>\n'),
    ('<script src="game.js', '<script src="/squadron-battle/game.js'), # the page moves to the root (below)
])
patch('www/squadron-battle/game.js', [
    ("sw: '/squadron-battle/sw.js', ", ''),
])
PY
# The game is the app's start page. Capacitor serves www/index.html for every path without a file extension.
mv www/squadron-battle/index.html www/index.html
echo "www built"
