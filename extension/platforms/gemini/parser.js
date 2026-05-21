/**
 * Engram — Gemini Parser (stub — TODO)
 * Placeholder for future Gemini support.
 */

(function () {
  const base = window.__engram.base;

  const gemini = Object.assign(Object.create(base), {
    platform: "gemini",

    SELECTORS: {
      messageContainer: "message-content",  // TODO: verify
      codeBlock: "pre code",
    },

    getMessageNodes() {
      // TODO: implement Gemini-specific DOM extraction
      return Array.from(document.querySelectorAll(this.SELECTORS.messageContainer));
    },

    extractMessage(node) {
      // TODO: implement
      return {
        role: "unknown",
        text: node.innerText?.trim() || "",
        codeBlocks: [],
        timestamp: Date.now(),
        platform: "gemini",
      };
    },
  });

  window.__engram.platform = gemini;
  console.log("[Engram] Gemini parser loaded (stub — not fully implemented)");
})();
