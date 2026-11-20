// Android back gesture / back button (Pete, 2026-11-20). The same file is in every Salsbury games app (src/app-back.js).
// Inside the game it does what the game's own back button does: games that use GH.backNav keep a history entry per
// screen or dialog (history.state.ghd), so going back in history runs the page's own back; a game can instead set
// window.SG_BACK() and return true when it handled the gesture. On the home page it asks before leaving the app.
(() => {
  const C = window.Capacitor;
  if (!C || !C.getPlatform || C.getPlatform() !== 'android') return;
  const App = C.Plugins && C.Plugins.App;
  if (!App || !App.addListener) return;

  let ask = null;
  function closeAsk() { if (ask) { ask.remove(); ask = null; } }
  function openAsk() {
    ask = document.createElement('div');
    ask.setAttribute('role', 'dialog'); ask.setAttribute('aria-modal', 'true'); ask.setAttribute('aria-label', 'Leave the game?');
    ask.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.6);font:600 18px/1.35 system-ui,sans-serif';
    ask.innerHTML = '<div style="background:#16213a;color:#fff;border:2px solid #3a5488;border-radius:18px;padding:22px 20px 18px;max-width:320px;width:100%;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.5)">'
      + '<div style="font-size:22px;font-weight:800;margin-bottom:18px">Leave the game?</div>'
      + '<div style="display:flex;gap:12px">'
      + '<button type="button" data-v="stay" style="flex:1;font:inherit;font-weight:800;padding:12px;border-radius:12px;border:0;background:#ffcf5a;color:#16213a">Stay</button>'
      + '<button type="button" data-v="leave" style="flex:1;font:inherit;font-weight:800;padding:12px;border-radius:12px;border:2px solid #6c84b8;background:transparent;color:#fff">Leave</button>'
      + '</div></div>';
    ask.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b && b.dataset.v === 'leave') { closeAsk(); App.exitApp(); }
      else if (b || e.target === ask) closeAsk();
    });
    document.body.appendChild(ask);
    ask.querySelector('[data-v="stay"]').focus({ preventScroll: true });
  }

  App.addListener('backButton', () => {
    if (ask) return closeAsk();
    try { if (typeof window.SG_BACK === 'function' && window.SG_BACK()) return; } catch (e) {}
    if (history.state && history.state.ghd > 0) return history.back();
    openAsk();
  });
})();
