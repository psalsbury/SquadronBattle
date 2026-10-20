// Shared parts of every game's home page (see game-home.css): the sign-in chip, dialogs and the Install app button.
// Needs lib/auth.js first.
window.GH = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Dialogs ----------
  // A dialog is a .gh-modal element; anything inside with [data-close] closes it, so do Escape and a click outside the sheet.
  let lastFocus = null;
  function open(id) {
    const m = $(id); if (!m) return;
    lastFocus = document.activeElement;
    m.hidden = false;
    const f = m.querySelector('[data-close]') || m.querySelector('button');
    if (f) f.focus({ preventScroll: true });
  }
  function close(id) {
    const m = typeof id === 'string' ? $(id) : id; if (!m || m.hidden) return;
    m.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  document.addEventListener('click', e => {
    const m = e.target.closest('.gh-modal'); if (!m) return;
    if (e.target === m || e.target.closest('[data-close]')) close(m);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const m = [...document.querySelectorAll('.gh-modal')].reverse().find(x => !x.hidden);
    if (m) { e.stopImmediatePropagation(); e.preventDefault(); close(m); }
  }, true);

  // ---------- Sign-in chip ----------
  // Signed in: picture, first name, Sign out. Signed out: a Sign in button that opens a small dialog with Google's button.
  // Signing in or out reloads the page, so every game picks up the new account the same way.
  function account(el, { user, clientId, guestNote, why, onSignOut } = {}) {
    if (!el) return;
    if (user) {
      el.innerHTML = `${user.picture ? `<img src="${esc(user.picture)}" alt="" referrerpolicy="no-referrer">` : ''}<span class="gh-who">${esc(SUK.firstName(user.name))}</span>
        <button class="gh-btn small" type="button">Sign out</button>`;
      el.querySelector('button').onclick = async () => { try { if (onSignOut) await onSignOut(); } catch {} try { await SUK.signOut(); } catch {} location.reload(); };
      return;
    }
    if (!clientId) { el.innerHTML = guestNote ? `<span>${esc(guestNote)}</span>` : ''; return; }
    el.innerHTML = `${guestNote ? `<span class="gh-who">${esc(guestNote)}</span>` : ''}<button class="gh-btn small" type="button">Sign in</button>`;
    el.querySelector('button').onclick = () => {
      let m = $('ghSignIn');
      if (!m) {
        m = document.createElement('div');
        m.className = 'gh-modal'; m.id = 'ghSignIn'; m.hidden = true;
        m.innerHTML = `<div class="gh-sheet" role="dialog" aria-modal="true" aria-labelledby="ghSignInT">
          <div class="gh-sheet-head"><h2 id="ghSignInT">Sign in</h2><button class="gh-icon" type="button" data-close aria-label="Close">✕</button></div>
          <p>${esc(why || 'Sign in with Google to get on the leaderboard and keep your progress on every device.')}</p>
          <div id="ghSignInBtn" style="min-height:44px"></div><p class="gh-err" id="ghSignInErr" hidden></p></div>`;
        (el.closest('.gh') || document.body).append(m);
        SUK.signInButton($('ghSignInBtn'), clientId, () => location.reload(), err => { const p = $('ghSignInErr'); p.textContent = err.message; p.hidden = false; });
      }
      open('ghSignIn');
    };
  }

  // ---------- Installable app ----------
  // btn: the Install app button (hidden until the browser offers to install). tip: the iPhone Home Screen tip.
  function install({ btn, tip, tipKey, sw, scope, onPrompt }) {
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    document.body.classList.toggle('standalone', standalone); // inside the app there's no games site to go back to
    if (sw && 'serviceWorker' in navigator) navigator.serviceWorker.register(sw, { scope }).catch(() => {});
    let evt = null;
    const b = $(btn);
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); evt = e; if (b) b.hidden = false; });
    window.addEventListener('appinstalled', () => { evt = null; if (b) b.hidden = true; });
    if (b) b.addEventListener('click', async () => {
      if (!evt) return;
      if (onPrompt) onPrompt();
      evt.prompt();
      try { await evt.userChoice; } catch {}
      evt = null; b.hidden = true;
    });
    // iPhone and iPad have no install button, so show the Home Screen steps once until dismissed.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let done = false; try { done = localStorage.getItem(tipKey) === '1'; } catch {}
    const t = $(tip);
    if (t && isIOS && !standalone && !done) {
      t.hidden = false;
      const x = t.querySelector('button');
      if (x) x.addEventListener('click', () => { t.hidden = true; try { localStorage.setItem(tipKey, '1'); } catch {} });
    }
    return { standalone, isIOS };
  }

  // ---------- Back button / Android back gesture ----------
  // Screens and dialogs inside a page get browser history entries, so the back gesture (which otherwise closes an
  // installed app) does exactly what the page's own back links do: close a dialog, leave a game, and so on.
  // depth(): how deep the page is now (0 = its home screen). back(): what the page's back link does from there.
  // Open .gh-modal dialogs count one deeper and are closed first. Screens switch by toggling [hidden], so a
  // MutationObserver notices every change and keeps the history depth in step without touching each screen change.
  function backNav({ depth, back }) {
    let pending = false;
    const topModal = () => [...document.querySelectorAll('.gh-modal')].reverse().find(m => !m.hidden);
    const want = () => depth() + (topModal() ? 1 : 0);
    const have = () => (history.state && history.state.ghd) || 0;
    function sync() {
      if (pending) return;
      const w = want(), h = have();
      if (w > h) for (let i = h + 1; i <= w; i++) history.pushState({ ...(history.state || {}), ghd: i }, '');
      else if (w < h) { pending = true; history.go(w - h); } // the page went back itself: drop the entries it used
    }
    window.addEventListener('popstate', () => {
      pending = false;
      const target = have();
      for (let guard = 0; guard < 8 && want() > target; guard++) {
        const before = want(), m = topModal();
        if (m) close(m); else back();
        if (want() >= before) break; // nothing more this page can go back to
      }
      sync();
    });
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['hidden'], subtree: true });
    sync();
  }

  // For pages that move between screens with #hash links (Wordsmiths): a back link pointing at the screen we just came
  // from goes back in history instead of adding a new entry, so the back gesture afterwards doesn't return to the game.
  function hashBackLinks(selector) {
    const norm = h => (h === '#' ? '' : h);
    const trail = [norm(location.hash)];
    window.addEventListener('hashchange', () => {
      const h = norm(location.hash);
      if (trail.length > 1 && trail[trail.length - 2] === h) trail.pop(); else trail.push(h);
    });
    document.addEventListener('click', e => {
      const a = e.target.closest(selector); if (!a) return;
      const h = norm(new URL(a.href, location.href).hash);
      if (trail.length > 1 && trail[trail.length - 2] === h) { e.preventDefault(); history.back(); }
    });
  }

  return { open, close, account, install, backNav, hashBackLinks, esc };
})();
