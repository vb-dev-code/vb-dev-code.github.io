// ==UserScript==
// @name         Newsstand: NYT auto-redeem
// @namespace    https://vb-dev-code.github.io/newsstand/
// @version      1.0.0
// @description  On NYT's pass-redemption page, fills the gift code from the URL and clicks Redeem — the same click you'd make by hand. Companion to the Newsstand pass manager.
// @match        https://www.nytimes.com/subscription/redeem*
// @match        https://nytimes.com/subscription/redeem*
// @run-at       document-idle
// @grant        none
// @updateURL    https://vb-dev-code.github.io/newsstand/nyt-autoredeem.user.js
// @downloadURL  https://vb-dev-code.github.io/newsstand/nyt-autoredeem.user.js
// ==/UserScript==
(() => {
  "use strict";
  // One click per tab session: redeeming twice is harmless but re-clicking on
  // every React re-render is not a behavior we want to ship.
  const ONCE = "newsstand-autoredeem";
  if (sessionStorage.getItem(ONCE)) return;

  const params = new URLSearchParams(location.search);
  const code = params.get("gift_code") || params.get("code") || "";

  const tryRedeem = () => {
    const input = document.querySelector('input[data-testid="input-code"], form input[name="code"]');
    const btn = document.querySelector('button[data-testid="btn-redeem"]');
    if (!input || !btn) return false;
    if (!input.value && code) {
      // The input is React-controlled: set the value through the prototype
      // setter and fire an input event so React's form state sees it.
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(input, code);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (!input.value) return false; // no code in the URL or the field — nothing to click with
    sessionStorage.setItem(ONCE, String(Date.now()));
    btn.click();
    return true;
  };

  if (tryRedeem()) return;
  // The form may hydrate after document-idle, and the page may fill the code
  // itself without touching the DOM — watch mutations AND poll briefly, then
  // stand down.
  const stop = () => { mo.disconnect(); clearInterval(timer); };
  const mo = new MutationObserver(() => { if (tryRedeem()) stop(); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  const timer = setInterval(() => { if (tryRedeem()) stop(); }, 1000);
  setTimeout(stop, 30000);
})();
