/**
 * Engram — Browser Compatibility Shim
 * Normalizes Chrome and Firefox extension APIs into a single `ext` object.
 * Use `ext.*` everywhere instead of `chrome.*` or `browser.*`
 *
 * Chrome:  uses `chrome.*` with callbacks
 * Firefox: uses `browser.*` with Promises
 * This shim wraps both into a Promise-based API that works everywhere.
 */

const ext = (() => {
  // Firefox exposes `browser`, Chrome exposes `chrome`
  const _api = typeof browser !== "undefined" ? browser : chrome;

  return {
    // ── Runtime ────────────────────────────────────────────────────────────

    runtime: {
      sendMessage(msg) {
        // Firefox: browser.runtime.sendMessage returns a Promise — callback style is not supported.
        // Chrome: chrome.runtime.sendMessage uses callbacks.
        if (typeof browser !== "undefined") {
          return browser.runtime.sendMessage(msg);
        }
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(msg, (response) => {
            if (chrome.runtime.lastError) resolve(null);
            else resolve(response);
          });
        });
      },

      onMessage: _api.runtime.onMessage,
      lastError: _api.runtime.lastError,
      id: _api.runtime.id,
    },

    // ── Storage ────────────────────────────────────────────────────────────

    storage: _api.storage,

    // ── Tabs ───────────────────────────────────────────────────────────────

    tabs: _api.tabs,

    // ── Raw API access (escape hatch) ──────────────────────────────────────

    _raw: _api,
  };
})();

// Make globally available in content scripts and background
if (typeof window !== "undefined") window.__ext = ext;
if (typeof globalThis !== "undefined") globalThis.__ext = ext;

console.log("[Engram] compat.js loaded —", typeof browser !== "undefined" ? "Firefox" : "Chrome");
