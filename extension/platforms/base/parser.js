/**
 * Engram — Base Parser Interface
 * Every platform parser must implement this contract.
 * platforms/claude/parser.js and platforms/gemini/parser.js extend this.
 */

window.__engram = window.__engram || {};

window.__engram.base = {
  platform: "unknown",

  /**
   * Extract a single message node into a structured object.
   * @param {Element} node
   * @returns {{ role, text, codeBlocks, timestamp }}
   */
  extractMessage(node) {
    throw new Error("extractMessage() must be implemented by platform parser");
  },

  /**
   * Return all current message nodes on the page.
   * @returns {Element[]}
   */
  getMessageNodes() {
    throw new Error("getMessageNodes() must be implemented by platform parser");
  },

  /**
   * Return a health signal object for the current session.
   * @returns {{ messageCount, textLength, codeBlockCount, domSize }}
   */
  getHealthSignals() {
    const nodes = this.getMessageNodes();
    const textLength = document.body.innerText?.length || 0;
    const codeBlocks = document.querySelectorAll("pre, code").length;
    const domSize = document.querySelectorAll("*").length;

    return {
      messageCount: nodes.length,
      textLength,
      codeBlockCount: codeBlocks,
      domSize,
    };
  },

  /**
   * Compute a health score 0–100 based on signals.
   */
  computeHealthScore(signals) {
    const { messageCount, textLength, domSize } = signals;

    let score = 100;

    // message count penalty
    if (messageCount > 40) score -= 20;
    else if (messageCount > 25) score -= 10;
    else if (messageCount > 15) score -= 5;

    // text length penalty (~chars)
    if (textLength > 80000) score -= 30;
    else if (textLength > 40000) score -= 15;
    else if (textLength > 20000) score -= 5;

    // DOM size penalty
    if (domSize > 8000) score -= 20;
    else if (domSize > 4000) score -= 10;

    return Math.max(0, Math.min(100, score));
  },

  /**
   * Health label from score.
   */
  healthLabel(score) {
    if (score >= 70) return { label: "Healthy", color: "#22c55e" };
    if (score >= 50) return { label: "Warning", color: "#f59e0b" };
    if (score >= 30) return { label: "Degrading", color: "#f97316" };
    return { label: "Critical", color: "#ef4444" };
  },
};

console.log("[Engram] base parser loaded");
