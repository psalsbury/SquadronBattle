#!/bin/bash
# Makes or refreshes the iPhone project (ios/) from www/: run ./build-www.sh first (REAL_ADS=1 for a store build).
# Capacitor 8 uses Swift Package Manager, so this runs on Linux; Codemagic builds the app on a Mac and sends it to
# TestFlight (codemagic.yaml at the repo root). Commit ios/ afterwards, including ios/App/App/public.
set -euo pipefail
cd "$(dirname "$0")"
export PATH=/opt/node/bin:$PATH
NAME='Squadron Battle'; BUNDLE='uk.salsbury.squadronbattle'; BG='#070B1C'
IOS_ADMOB_APP_ID='none'   # no adverts in this app
IOS_GOOGLE_CLIENT_ID=''  # Google Cloud > Credentials > iOS client for $BUNDLE (same value as in build-www.sh). Empty = Sign in with Apple only
VERSION=$(grep -o 'versionName "[^"]*"' android/app/build.gradle | cut -d'"' -f2) # same version as the Android app
TRACKING=''

# Sign in with Apple is switched on for the iPhone sync only, so the Android build is untouched.
cp capacitor.config.json .capacitor.config.android.json
trap 'mv .capacitor.config.android.json capacitor.config.json' EXIT
python3 -c "import json; c = json.load(open('capacitor.config.json')); c['plugins']['SocialLogin']['providers']['apple'] = True; json.dump(c, open('capacitor.config.json', 'w'), indent=2)"
[ -d ios ] || npx cap add ios
npx cap sync ios
mv .capacitor.config.android.json capacitor.config.json; trap - EXIT

python3 src/ios-setup.py "$NAME" "$BUNDLE" "$VERSION" "$IOS_ADMOB_APP_ID" "$IOS_GOOGLE_CLIENT_ID" "$TRACKING"
python3 src/make-ios-assets.py src/icons/square.svg "$BG" ios/App/App/Assets.xcassets
# Codemagic doesn't run build-www.sh (it needs the live site), so the built page and its config are committed.
sed -i '/^App\/App\/public$/d; /^App\/App\/capacitor.config.json$/d; /^App\/App\/config.xml$/d' ios/.gitignore
echo "iPhone project ready ($NAME $VERSION)"
