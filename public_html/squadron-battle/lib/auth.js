// Sign-in and API helper (squadron-battle's own copy, so the game doesn't depend on the rest of salsbury.uk).
// The server is window.SUK_API if set (an app version sets it to the full https://salsbury.uk/api/index.php), else this site's /api/index.php.
window.SUK = (() => {
  const API = window.SUK_API || '/api/index.php';
  async function api(action, data, params) {
    const qs = new URLSearchParams({ action, ...(params || {}) });
    const opts = data === undefined
      ? { credentials: 'same-origin' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'salsbury' }, body: JSON.stringify(data) };
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

  async function signOut() {
    await api('logout', {});
    try { google.accounts.id.disableAutoSelect(); } catch {}
  }

  const date = t => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const firstName = n => String(n || '').split(' ')[0] || 'Player';

  return { api, signInButton, signOut, date, esc, firstName };
})();
