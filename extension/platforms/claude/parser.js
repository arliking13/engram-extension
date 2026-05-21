/**
 * Engram — Claude.ai Parser (MVP)
 * Extracts messages and code blocks from claude.ai DOM.
 */

(function () {
  const base = window.__engram.base;

  const claude = Object.assign(Object.create(base), {
    platform: "claude",

    // Claude.ai DOM selectors (as of May 2025)
    // These may change — isolated here for easy updates
    SELECTORS: {
      messageContainer: '[data-testid="conversation-turn"]',
      humanMessage: '[data-testid="human-turn"]',
      assistantMessage: '[data-testid="assistant-turn"]',
      codeBlock: "pre code",
      // fallbacks
      fallbackMessages: ".font-claude-message, .human-turn, .assistant-turn",
    },

    getMessageNodes() {
      let nodes = document.querySelectorAll(this.SELECTORS.messageContainer);
      if (!nodes.length) {
        nodes = document.querySelectorAll(this.SELECTORS.fallbackMessages);
      }
      return Array.from(nodes);
    },

    extractMessage(node) {
      const isHuman =
        node.matches(this.SELECTORS.humanMessage) ||
        node.querySelector(this.SELECTORS.humanMessage) !== null ||
        node.getAttribute("data-testid")?.includes("human");

      const role = isHuman ? "user" : "assistant";

      // Extract plain text
      const text = node.innerText?.trim() || "";

      // Extract code blocks
      const codeBlocks = Array.from(node.querySelectorAll(this.SELECTORS.codeBlock)).map(
        (el) => ({
          language: el.className.replace("language-", "").trim() || "unknown",
          code: el.innerText?.trim() || "",
        })
      );

      return {
        role,
        text,
        codeBlocks,
        timestamp: Date.now(),
        platform: "claude",
      };
    },
  });

  window.__engram.platform = claude;

  // ── MutationObserver — incremental extraction ───────────────────────────

  let lastMessageCount = 0;

  function extractAndStore() {
    const nodes = claude.getMessageNodes();
    if (nodes.length === lastMessageCount) return;

    // Only process new messages (incremental)
    const newNodes = nodes.slice(lastMessageCount);
    lastMessageCount = nodes.length;

    const newMessages = newNodes.map((n) => claude.extractMessage(n));

    // Send to background worker via chrome.runtime
    if (newMessages.length > 0) {
      chrome.runtime.sendMessage({
        type: "ENGRAM_NEW_MESSAGES",
        platform: "claude",
        messages: newMessages,
        totalCount: nodes.length,
      });
    }

    // Health check on every update
    const signals = claude.getHealthSignals();
    const score = claude.computeHealthScore(signals);
    const { label, color } = claude.healthLabel(score);

    chrome.runtime.sendMessage({
      type: "ENGRAM_HEALTH_UPDATE",
      score,
      label,
      color,
      signals,
    });
  }

  // Start observing
  const observer = new MutationObserver(() => {
    extractAndStore();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial extraction on load
  extractAndStore();

  console.log("[Engram] Claude.ai parser active");
})();
