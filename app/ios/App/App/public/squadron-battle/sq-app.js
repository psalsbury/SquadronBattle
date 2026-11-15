// Loaded first in the app's copy of /squadron-battle/ (see build-www.sh). Gives lib/auth.js native sign-in
// (window.SUK_APP: Google on Android and iPhone, Sign in with Apple on iPhone), adds the privacy policy and
// delete-account links the stores require, marks the page as running in the app, and gives the game window.SQApp:
// a rewarded advert (AdMob) for the one extra ship per game, and the one-off "Full game" purchase (stages 3 to 6).
// game.js only switches these on when window.SQApp exists, so the website is never affected.
(() => {
  const CFG0 = window.SQ_APP_CONFIG || {}; // written by build-www.sh: { rewardedId, testing, productId, ios: { rewardedId, testing, googleClientId } }
  const IOS = !!(window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'ios');
  const CFG = IOS ? Object.assign({}, CFG0, CFG0.ios) : CFG0;
  document.documentElement.classList.add('in-app');
  const plugins = (window.Capacitor && window.Capacitor.Plugins) || {};

  // ---------- Google sign-in (same as Halfsky) ----------
  // The ID token is issued for the website's Google client (clientId, from the server), so the server checks it the
  // same way as the website's. Google only allows it once this app's package name and signing certificate are
  // registered in the same Google Cloud project.
  const Social = plugins.SocialLogin;
  if (Social) {
    // Android: Credential Manager with the website's client ID. iPhone: Google's iOS SDK needs the app's own iOS
    // client (CFG.googleClientId; until it exists the Google button is left out) and asks for an ID token for the
    // website's client. Sign in with Apple (iPhone only) gives an Apple ID token the server checks against this app's
    // bundle ID. Apple only sends the name the first time someone signs in, so it goes along to the server then.
    let gInit = null, aInit = null;
    const cancelled = e => e && (e.code === 'USER_CANCELLED' || /cancel|1001/i.test(e.message || ''));
    window.SUK_APP = {
      google: (!IOS || CFG.googleClientId) ? async clientId => {
        await (gInit ||= Social.initialize({ google: IOS ? { iOSClientId: CFG.googleClientId, iOSServerClientId: clientId } : { webClientId: clientId } })
          .catch(e => { gInit = null; throw e; }));
        try {
          return (await Social.login({ provider: 'google', options: {} })).result.idToken;
        } catch (e) {
          if (cancelled(e)) return null;
          const msg = (e && e.message) || '';
          console.warn('Google sign-in', msg);
          if (/no credential/i.test(msg)) throw new Error('Add a Google account to this phone in Settings, then try again.');
          throw new Error(`Google sign-in didn't work (${msg || 'unknown error'}). Try again.`);
        }
      } : null,
      apple: IOS ? async () => {
        await (aInit ||= Social.initialize({ apple: { clientId: 'uk.salsbury.squadronbattle' } }).catch(e => { aInit = null; throw e; }));
        try {
          const r = (await Social.login({ provider: 'apple', options: { scopes: ['name', 'email'] } })).result;
          const p = r.profile || {};
          return { token: r.idToken, name: [p.givenName, p.familyName].filter(Boolean).join(' ') };
        } catch (e) {
          if (cancelled(e)) return null;
          console.warn('Apple sign-in', e && e.message);
          throw new Error(`Sign in with Apple didn't work (${(e && e.message) || 'unknown error'}). Try again.`);
        }
      } : null,
      // Forget the chosen account, so the next sign-in offers the account picker again.
      signOut: () => Promise.all([
        gInit ? Social.logout({ provider: 'google' }).catch(() => {}) : null,
        aInit ? Social.logout({ provider: 'apple' }).catch(() => {}) : null
      ])
    };
  }

  // ---------- Footer links Play requires: privacy policy, privacy choices, delete account ----------
  const PRIVACY_URL = 'https://salsbury.uk/squadron-battle/privacy.html';
  let choicesFn = null; // set once the consent check says UK/EU players need a way to change their choices
  function showChoices() {
    const b = document.getElementById('privacyChoices');
    if (b && choicesFn) { b.hidden = false; b.onclick = choicesFn; }
  }
  async function offerDelete() {
    const b = document.getElementById('deleteAccount');
    if (!b || !window.SUK) return;
    try { if (!(await SUK.api('me')).user) return; } catch { return; }
    b.hidden = false;
    b.onclick = async () => {
      if (!confirm('Delete your salsbury.uk account?\n\nThis removes your name, email and picture, and your scores and progress ' +
        'in every salsbury.uk game. It can\'t be undone. Your progress on this phone stays.')) return;
      try { await SUK.deleteAccount(); alert('Your account has been deleted.'); location.reload(); }
      catch (e) { alert(e.message); }
    };
  }
  document.addEventListener('DOMContentLoaded', () => {
    const foot = document.querySelector('.gh-foot');
    if (!foot) return;
    foot.insertAdjacentHTML('beforeend', `<div class="app-links"><a href="${PRIVACY_URL}">Privacy policy</a>` +
      '<button type="button" id="privacyChoices" hidden>Privacy choices</button>' +
      '<button type="button" id="deleteAccount" hidden>Delete my account</button></div>');
    showChoices();
    offerDelete();
  });

  const AdMob = plugins.AdMob, Buy = plugins.NativePurchases;
  if (!AdMob || !CFG.rewardedId) return; // e.g. opened in a desktop browser while testing: the page behaves like the website

  // ---------- Full game purchase (Google Play Billing, one-off "inapp" product) ----------
  // Ownership is cached on the phone so it works offline, and checked with Google Play at every start (a refund
  // takes it away again). Bought on one phone, it comes back on another with Restore purchase.
  const OWN_KEY = 'sq-full-game';
  let owned = localStorage.getItem(OWN_KEY) === '1', price = '';
  const listeners = [];
  function setOwned(v) {
    if (v === owned) return;
    owned = v;
    try { v ? localStorage.setItem(OWN_KEY, '1') : localStorage.removeItem(OWN_KEY); } catch {}
    listeners.forEach(f => { try { f(owned); } catch (e) { console.warn(e); } });
  }
  const isMine = p => p && p.productIdentifier === CFG.productId && (p.purchaseState === undefined || String(p.purchaseState) === '1');
  async function checkPurchases() {
    if (!Buy) return owned;
    try {
      const { purchases } = await Buy.getPurchases({ productType: 'inapp' });
      setOwned((purchases || []).some(isMine));
    } catch (e) { console.warn('purchases', e); } // offline: keep what's cached
    return owned;
  }
  const changed = () => listeners.forEach(f => { try { f(owned); } catch {} });
  if (Buy) {
    (async () => {
      try {
        const { products } = await Buy.getProducts({ productIdentifiers: [CFG.productId], productType: 'inapp' });
        if (products && products[0] && products[0].priceString) { price = products[0].priceString; changed(); }
      } catch (e) { console.warn('product', e); }
      await checkPurchases();
    })();
    // A payment that was pending (e.g. cash at a shop) completes later.
    try { Buy.addListener('transactionUpdated', t => { if (isMine(t)) setOwned(true); }); } catch {}
  }

  // ---------- Adverts ----------
  let canAds = true; // false only once the consent check says ads can't be requested
  let why = '';
  const within = (p, ms, msg) => {
    let t;
    return Promise.race([p, new Promise(r => { t = setTimeout(() => { if (msg) why = msg; r(false); }, ms); })]).finally(() => clearTimeout(t));
  };
  // Capacitor's addListener returns the handle itself in the app, not a promise (the npm docs say promise), so
  // Promise.resolve() handles both.
  const listen = (ev, fn) => AdMob.addListener(ev, fn);
  const unlisten = subs => subs.forEach(p => Promise.resolve(p).then(h => h.remove()).catch(() => {}));

  let rLoaded = false, rLoading = null, lastEarly = false;
  function loadRewarded() {
    if (rLoaded) return Promise.resolve(true);
    return rLoading ||= AdMob.prepareRewardVideoAd({ adId: CFG.rewardedId, isTesting: CFG.testing })
      .then(() => (rLoaded = true), e => { why = `The advert didn't load (${(e && e.message) || 'no fill'}). Check your connection and try again.`; return false; })
      .finally(() => { rLoading = null; });
  }

  let iLoaded = false, iLoading = null, setUp = false; // setUp: consent (and on iPhone the tracking question) done
  function loadInterstitial() {
    if (!setUp || owned || iLoaded || iLoading || !CFG.interstitialId) return;
    iLoading = AdMob.prepareInterstitial({ adId: CFG.interstitialId, isTesting: CFG.testing })
      .then(() => { iLoaded = true; }, e => console.warn('interstitial load', e))
      .finally(() => { iLoading = null; });
  }

  const ready = (async () => {
    try {
      await AdMob.initialize({ initializeForTesting: CFG.testing });
      // UK/EU players get Google's consent message (set up in AdMob > Privacy & messaging) before any advert.
      let info = await AdMob.requestConsentInfo();
      if (info.status === 'REQUIRED' && info.isConsentFormAvailable) info = await AdMob.showConsentForm();
      canAds = info.canRequestAds !== false;
      // iPhone: Apple's "Allow tracking?" question (App Tracking Transparency), asked once, after Google's consent
      // message. Saying no still allows adverts; they just aren't personalised with the advertising ID.
      if (IOS) {
        try { if ((await AdMob.trackingAuthorizationStatus()).status === 'notDetermined') await AdMob.requestTrackingAuthorization(); }
        catch (e) { console.warn('tracking question', e); }
      }
      if (info.privacyOptionsRequirementStatus === 'REQUIRED') {
        choicesFn = async () => {
          try { await AdMob.showPrivacyOptionsForm(); canAds = (await AdMob.requestConsentInfo()).canRequestAds !== false; }
          catch (e) { console.warn('privacy options', e); }
          if (canAds) { loadRewarded(); loadInterstitial(); }
        };
        showChoices();
      }
    } catch (e) { console.warn('AdMob setup', e); }
    setUp = true;
    if (canAds) { loadRewarded(); loadInterstitial(); }
  })();

  window.SQApp = {
    owned: () => owned,
    price: () => price,
    onChange(fn) { listeners.push(fn); },
    // { ok, msg }: msg is empty when the player just closed Google Play's sheet.
    async buy() {
      if (!Buy) return { ok: false, msg: 'Purchases aren\'t available on this phone.' };
      try {
        const t = await Buy.purchaseProduct({ productIdentifier: CFG.productId, productType: 'inapp', quantity: 1 });
        if (t && t.purchaseState !== undefined && String(t.purchaseState) !== '1')
          return { ok: false, msg: `Your payment is pending. Stages 3 to 6 open as soon as ${IOS ? 'the App Store' : 'Google Play'} confirms it.` };
        setOwned(true);
        return { ok: true };
      } catch (e) {
        const msg = (e && (e.message || e.code)) || '';
        if (/cancel/i.test(msg)) return { ok: false, msg: '' };
        if (/already/i.test(msg) && await checkPurchases()) return { ok: true };
        console.warn('purchase', msg);
        return { ok: false, msg: `The purchase didn't go through (${msg || 'unknown error'}).` };
      }
    },
    async restore() {
      if (!Buy) return false;
      try { await Buy.restorePurchases(); } catch (e) { console.warn('restore', e); }
      return checkPurchases();
    },

    // Between games. Never waits for one to load: if none is ready the game just carries on (and one loads for next
    // time). Resolves true if an advert was shown. No advert unit set = never.
    async interstitial() {
      if (owned || !canAds || !CFG.interstitialId) return false;
      if ((await within(ready.then(() => true), 1500)) === false) return false;
      if (!iLoaded) { loadInterstitial(); return false; }
      iLoaded = false;
      let finish;
      const done = new Promise(r => { finish = r; });
      const subs = [listen('interstitialAdDismissed', () => finish(true)), listen('interstitialAdFailedToShow', () => finish(false))];
      await Promise.all(subs);
      AdMob.showInterstitial().catch(() => finish(false));
      const shown = await within(done, 90000); // a stuck advert never blocks the game for good
      unlisten(subs);
      loadInterstitial();
      return !!shown;
    },
    available: () => canAds,
    whyNot: () => why,
    closedEarly: () => lastEarly, // true if the last advert was shown but closed before the reward
    // Resolves true only if the player watched to the reward. showRewardVideoAd() resolves only when the reward is
    // earned, and some networks send the reward just after the advert closes, so: count the reward whenever it
    // arrives, and finish once the advert has closed plus a short grace period, or straight away if it couldn't show.
    async rewarded() {
      why = ''; lastEarly = false;
      if ((await within(ready.then(() => true), 20000, 'Adverts are still starting up. Try again in a moment.')) === false) return false;
      why = '';
      if (!canAds) { why = 'Adverts are switched off by your privacy choices.'; return false; }
      if (!(await within(loadRewarded(), 12000, 'The advert is taking too long to load. Check your connection and try again.'))) return false;
      let earned = false, closed = false, finish;
      const done = new Promise(r => { finish = r; });
      const subs = [
        listen('onRewardedVideoAdReward', () => { earned = true; if (closed) finish(); }),
        listen('onRewardedVideoAdDismissed', () => { closed = true; if (earned) finish(); else setTimeout(finish, 2000); }),
        listen('onRewardedVideoAdFailedToShow', e => { why = `The advert couldn't be shown (${(e && e.message) || 'unknown error'}).`; finish(); }),
      ];
      await Promise.all(subs); // listeners must be in place before the advert can fire them
      rLoaded = false;
      AdMob.showRewardVideoAd().then(() => { earned = true; if (closed) finish(); },
        e => { why = `The advert couldn't be shown (${(e && e.message) || 'not ready'}).`; finish(); });
      await done;
      unlisten(subs);
      loadRewarded();
      if (!earned && !why) { why = 'The advert closed before the end. Watch it to the end for the reward.'; lastEarly = true; }
      return earned;
    }
  };
})();
