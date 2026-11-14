// Sign-in and API helper (squadron-battle's own copy, so the game doesn't depend on the rest of salsbury.uk).
// The server is window.SUK_API if set (an app version sets it to the full https://salsbury.uk/api/index.php), else this site's /api/index.php.
// Inside an app, window.SUK_APP (set by the app's own script before this one) signs in natively:
// { google(clientId) -> Google ID token, or null if the player cancelled; apple(clientId) -> { token, name } or null
// (iPhone only); signOut() }. Either sign-in may be missing. The app keeps the sign-in token
// the server gives it (sent back as X-Suk-Token) instead of the website's cookie.
window.SUK = (() => {
  const API = window.SUK_API || '/api/index.php';
  const APP = window.SUK_APP || null;
  const token = {
    get() { try { return localStorage.getItem('suk-token') || ''; } catch { return ''; } },
    set(t) { try { t ? localStorage.setItem('suk-token', t) : localStorage.removeItem('suk-token'); } catch {} }
  };
  async function api(action, data, params) {
    const qs = new URLSearchParams({ action, ...(params || {}) });
    const headers = data === undefined ? {} : { 'Content-Type': 'application/json', 'X-Requested-With': 'salsbury' };
    if (APP) { headers['X-Suk-Client'] = 'app'; const t = token.get(); if (t) headers['X-Suk-Token'] = t; }
    const opts = data === undefined
      ? { credentials: 'same-origin', headers }
      : { method: 'POST', credentials: 'same-origin', headers, body: JSON.stringify(data) };
    let res;
    try { res = await fetch(API + '?' + qs, opts); }
    catch { throw new Error('Could not reach salsbury.uk. Check your connection and try again.'); }
    let body = null;
    try { body = await res.json(); } catch {}
    if (!res.ok) {
      const err = new Error((body && body.error) || 'The server did not respond properly. Try again.');
      err.status = res.status;
      throw err;
    }
    // Only these replies carry the sign-in token ('token' means other things in some games' replies).
    if (APP && body && typeof body.token === 'string' && ['login', 'login_apple', 'guest'].includes(action)) token.set(body.token);
    return body;
  }

  let gis = null;
  function loadGoogle() {
    return gis ||= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { gis = null; reject(new Error('Google sign-in could not load. Check your connection.')); };
      document.head.append(s);
    });
  }

  // Renders Google's sign-in button into el. onDone gets the signed-in user.
  async function signInButton(el, clientId, onDone, onError, look) {
    if (!clientId) { el.innerHTML = '<p class="note">Google sign-in is being set up. Check back soon.</p>'; return; }
    if (APP) { appButton(el, clientId, onDone, onError); return; }
    try { await loadGoogle(); } catch (e) { onError(e); return; }
    google.accounts.id.initialize({
      client_id: clientId,
      ux_mode: 'popup',
      callback: async r => {
        try { const d = await api('login', { credential: r.credential }); onDone(d.user); }
        catch (e) { onError(e); }
      }
    });
    // These pages use color-scheme:dark, and Google's button iframe is a light page, so the browser paints it an opaque
    // white box. A light scheme on the container (the iframe inherits it) keeps the frame transparent.
    el.style.colorScheme = 'light';
    google.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', ...(look || {}) });
  }

  // In an app: our own buttons that open the phone's own sign-in. Google (Google's dark style) when the app offers it,
  // and Sign in with Apple on iPhone (Apple's black style; Apple requires it next to Google). APP.google / APP.apple
  // are set by the app's own script; either may be missing.
  function appButton(el, clientId, onDone, onError) {
    if (!document.getElementById('suk-gbtn-css')) document.head.insertAdjacentHTML('beforeend', `<style id="suk-gbtn-css">
      .suk-gbtn{display:inline-flex;align-items:center;gap:10px;height:40px;padding:0 16px 0 12px;border-radius:20px;border:1px solid #8e918f;
        background:#131314;color:#e3e3e3;font:500 14px/1 Roboto,Arial,sans-serif;cursor:pointer;white-space:nowrap}
      .suk-gbtn:disabled{opacity:.6}.suk-gbtn svg{width:20px;height:20px;flex:none}
      .suk-abtn{background:#000;color:#fff;border-color:#000;font:600 15px/1 -apple-system,system-ui,sans-serif}
      .suk-abtn svg{fill:#fff;width:17px;height:20px}
      .suk-btns{display:inline-flex;flex-direction:column;align-items:stretch;gap:10px}</style>`);
    const GOOGLE = `<button type="button" class="suk-gbtn" data-p="google"><svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>Sign in with Google</button>`;
    const APPLE = `<button type="button" class="suk-gbtn suk-abtn" data-p="apple"><svg viewBox="0 0 17 20" aria-hidden="true">
      <path d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2.1-.9-3.4-.9C3.5 4.8 1.9 5.8 1 7.4c-1.9 3.2-.5 8 1.3 10.6.9 1.3 1.9 2.7 3.3 2.6 1.3-.1 1.8-.9 3.4-.9s2 .9 3.4.8c1.4 0 2.3-1.3 3.2-2.6 1-1.5 1.4-2.9 1.4-3-.1 0-2.9-1.1-2.9-4.3zM11.5 3c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z"/>
      </svg>Sign in with Apple</button>`;
    el.innerHTML = `<div class="suk-btns">${APP.apple ? APPLE : ''}${APP.google ? GOOGLE : ''}</div>`;
    el.querySelectorAll('button').forEach(b => b.onclick = async () => {
      const all = el.querySelectorAll('button');
      all.forEach(x => x.disabled = true);
      try {
        if (b.dataset.p === 'apple') {
          const r = await APP.apple(clientId); // { token, name } or null if the player cancelled
          if (r) { const d = await api('login_apple', { token: r.token, name: r.name || '' }); onDone(d.user); }
        } else {
          const credential = await APP.google(clientId);
          if (credential) { const d = await api('login', { credential }); onDone(d.user); }
        }
      } catch (e) { onError(e); }
      finally { all.forEach(x => x.disabled = false); }
    });
  }

  async function signOut() {
    try { await api('logout', {}); }
    finally { if (APP) { token.set(''); try { await APP.signOut(); } catch {} } }
    try { google.accounts.id.disableAutoSelect(); } catch {}
  }

  // Deletes the player's account and everything in it (the app stores require this inside the app).
  async function deleteAccount() {
    const d = await api('delete_account', { confirm: true });
    if (APP) { token.set(''); try { await APP.signOut(); } catch {} }
    return d;
  }

  const date = t => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const firstName = n => String(n || '').split(' ')[0] || 'Player';

  return { api, signInButton, signOut, deleteAccount, inApp: !!APP, date, esc, firstName };
})();
