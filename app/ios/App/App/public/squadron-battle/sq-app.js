// Loaded first in the app's copy of /squadron-battle/ (see build-www.sh). Gives lib/auth.js native sign-in
// (window.SUK_APP: Google on Android and iPhone, Sign in with Apple on iPhone), adds the privacy policy and
// delete-account links the stores require, and marks the page as running in the app. The app has no adverts.
(() => {
  const CFG0 = window.SQ_APP_CONFIG || {}; // written by build-www.sh: { ios: { googleClientId } }
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

  // ---------- Footer links the stores require: privacy policy, delete account ----------
  const PRIVACY_URL = 'https://salsbury.uk/squadron-battle/privacy.html';
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
      '<button type="button" id="deleteAccount" hidden>Delete my account</button></div>');
    offerDelete();
  });
})();
