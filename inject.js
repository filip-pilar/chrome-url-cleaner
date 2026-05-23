/**
 * inject.js — SPA navigation hook.
 * Runs in the MAIN world so it can patch the real history API used by the page.
 * Does NOT call __urlCleaner — it only dispatches a custom event that content.js
 * (ISOLATED world) listens for.
 *
 * Why MAIN world?
 * If this ran in the ISOLATED world, the patched pushState/replaceState would only
 * affect the extension's isolated JS context, not the page's own framework
 * (React Router, Vue Router, etc.). Running in MAIN world means the extension's
 * wrapper IS the history.pushState that the page calls.
 *
 * No infinite loop risk:
 * When content.js (ISOLATED world) responds to __urlcleaner_nav__ by calling
 * history.replaceState, it calls Chrome's isolated-world binding of replaceState —
 * NOT this MAIN-world wrapper. The two worlds have separate bindings.
 */
(function () {
  'use strict';

  // Guard: prevent double-installation (e.g. if Chrome evaluates the script twice).
  if (window.__urlCleanerInjected) return;
  window.__urlCleanerInjected = true;

  function dispatch() {
    window.dispatchEvent(new CustomEvent('__urlcleaner_nav__'));
  }

  // Preserve original methods before wrapping.
  const _pushState    = history.pushState.bind(history);
  const _replaceState = history.replaceState.bind(history);

  history.pushState = function (state, title, url) {
    const result = _pushState(state, title, url);
    dispatch();
    return result;
  };

  history.replaceState = function (state, title, url) {
    const result = _replaceState(state, title, url);
    dispatch();
    return result;
  };

  // Also catch browser back/forward navigation.
  window.addEventListener('popstate', dispatch);
})();
