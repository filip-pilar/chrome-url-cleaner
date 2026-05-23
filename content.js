/**
 * content.js — Address bar cleaning + copy + paste interception.
 * Runs in the ISOLATED world. Depends on window.__urlCleaner from cleaner.js,
 * which is listed first in the manifest content_scripts entry for this world.
 *
 * Three mechanisms:
 *
 * 1. Address bar (Mechanism 1):
 *    On page load (document_start) and on every SPA navigation signalled by
 *    inject.js, reads window.location.href, cleans it, and calls
 *    history.replaceState to update the address bar without reloading.
 *    Result: the URL is already clean by the time the user copies from the bar.
 *
 * 2. Copy interception (Mechanism 2):
 *    Listens to the document 'copy' event. If the entire selection is a URL,
 *    cleans it and replaces the clipboard content. Surrounding text is left
 *    untouched (new URL() throws on non-pure-URL strings).
 *
 * 3. Paste interception (Mechanism 3):
 *    Listens to the document 'paste' event. If the content being pasted is a
 *    URL, cleans it before it lands. This covers the case where a website's
 *    "Copy link" button wrote a dirty URL to the clipboard programmatically
 *    (bypassing the copy event), and the user is now pasting it somewhere.
 *    Only fires when pasting into web page elements — cannot intercept pastes
 *    into Chrome's address bar or native Mac apps.
 */
(function () {
  'use strict';

  // ── Mechanism 1: Address bar cleaning ──────────────────────────────────────

  function cleanAddressBar() {
    const current = window.location.href;
    const cleaned = window.__urlCleaner(current);
    if (cleaned !== current) {
      // Calling history.replaceState here goes through Chrome's ISOLATED-world
      // native binding — not the MAIN-world wrapper in inject.js — so no
      // re-dispatch occurs and there is no infinite loop.
      history.replaceState(null, '', cleaned);
    }
  }

  // Run immediately at document_start for the initial page load.
  cleanAddressBar();

  // Run on every SPA navigation dispatched by inject.js (MAIN world).
  // setTimeout(..., 0) defers by one event loop turn so that location.href has
  // been updated by the framework before we read it. Without this defer, some
  // frameworks (Next.js, React Router) call pushState synchronously before
  // committing the new URL to location.href.
  window.addEventListener('__urlcleaner_nav__', function () {
    setTimeout(cleanAddressBar, 0);
  });

  // ── Mechanism 2: Copy event interception ───────────────────────────────────

  document.addEventListener('copy', function (e) {
    const selection = window.getSelection();
    if (!selection) return;

    const text = selection.toString().trim();
    if (!text) return;

    // Validate: only act when the entire selection is itself a parseable URL.
    // new URL() throws on "check out https://example.com/?utm=x here" or on
    // plain text — we leave those alone and let the native copy happen.
    let cleaned;
    try {
      new URL(text); // validate — throws if not a URL
      cleaned = window.__urlCleaner(text);
    } catch (_) {
      return; // not a URL; don't touch the clipboard
    }

    if (cleaned === text) return; // already clean; let native copy run normally

    e.preventDefault();
    e.clipboardData.setData('text/plain', cleaned);
  });

  // ── Mechanism 3: Paste event interception ──────────────────────────────────

  document.addEventListener('paste', function (e) {
    const text = e.clipboardData.getData('text/plain').trim();
    if (!text) return;

    // Only intercept when the pasted content is itself a pure URL.
    // Pasting mixed text (e.g. a sentence containing a URL) is left untouched.
    let cleaned;
    try {
      new URL(text); // validate — throws if not a URL
      cleaned = window.__urlCleaner(text);
    } catch (_) {
      return; // not a URL; don't interfere with the paste
    }

    if (cleaned === text) return; // already clean; let native paste run normally

    e.preventDefault();
    // Insert the cleaned URL at the cursor. execCommand('insertText') works for
    // <input>, <textarea>, and contenteditable elements (Gmail, Notion, Slack
    // web, etc.) and correctly triggers framework input events in most cases.
    document.execCommand('insertText', false, cleaned);
  });
})();
