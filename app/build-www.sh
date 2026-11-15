#!/bin/bash
# Copies the live Squadron Battle page from salsbury.uk into www/ for the Android and iPhone apps and adapts it:
# API calls go to https://salsbury.uk (window.SUK_API; sent natively by CapacitorHttp, so no CORS), no service
# worker, web-app manifest or website invitation gate, and the app shim (window.SUK_APP: native Google sign-in, plus
# Sign in with Apple on iPhone) loads before lib/auth.js, plus window.SQApp: a rewarded advert for the one extra ship
# per game and the one-off Full game purchase (stages 3 to 6).
# REAL_ADS=1 ./build-www.sh uses the real AdMob ad units (fill in REAL_* below first); otherwise Google's test units.
set -euo pipefail
SITE=${SITE:-/var/www/salsbury.uk}
cd "$(dirname "$0")"
# iPhone: Google's iOS OAuth client for uk.salsbury.squadronbattle (Google Cloud > Credentials, project salsbury-uk).
# Empty until Pete creates it: then the iPhone app offers Sign in with Apple only. Same value in sync-ios.sh, and add
# it to google_app_client_ids in /var/lib/salsbury-uk/config.php.
IOS_GOOGLE_CLIENT_ID=''
# Real AdMob rewarded units for the "Squadron Battle" AdMob apps (Android and iOS). Empty until Pete creates them.
REAL_REWARDED=''
IOS_REAL_REWARDED=''
PRODUCT_ID='full_game' # Play Console > Monetise > In-app products and App Store Connect: one-off product with this ID
IOS_TEST_RW='ca-app-pub-3940256099942544/1712485313'
if [ "${REAL_ADS:-}" = 1 ]; then
  [ -n "$REAL_REWARDED" ] || { echo 'build-www: set REAL_REWARDED first' >&2; exit 1; }
  RW=$REAL_REWARDED; TESTING=false
  if [ -n "$IOS_REAL_REWARDED" ]; then IRW=$IOS_REAL_REWARDED; ITESTING=false
  else echo 'build-www: no iPhone advert unit yet, so the iPhone build uses test adverts' >&2; IRW=$IOS_TEST_RW; ITESTING=true; fi
else RW='ca-app-pub-3940256099942544/5224354917'; TESTING=true; IRW=$IOS_TEST_RW; ITESTING=true; fi

rm -rf www && mkdir -p www/squadron-battle
cp "$SITE"/squadron-battle/{index.html,game.js,icon-192.png,icon-512.png} www/squadron-battle/
cp -r "$SITE"/squadron-battle/lib www/squadron-battle/ # the game's own copies of the shared files and its fonts
cp src/sq-app.js src/sq-app.css www/squadron-battle/
cp -r src/splash www/splash && rm -f www/splash/render-sprites.mjs www/splash/sprites.json # the Salsbury games intro

python3 - "$IOS_GOOGLE_CLIENT_ID" "$RW" "$TESTING" "$PRODUCT_ID" "$IRW" "$ITESTING" <<'PY'
import sys
igid, rw, testing, product, irw, itesting = sys.argv[1:]
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
     f'<script>window.SQ_APP_CONFIG = {{ rewardedId: "{rw}", testing: {testing}, productId: "{product}", '
     f'ios: {{ rewardedId: "{irw}", testing: {itesting}, googleClientId: "{igid}" }} }};</script>\n'
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
echo "www built ($([ "$TESTING" = true ] && echo test || echo REAL) ads)"
