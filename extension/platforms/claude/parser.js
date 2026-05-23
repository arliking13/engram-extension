/**
 * Engram — Claude.ai Parser (MVP)
 * Captures Claude.ai messages from DOM mutations, with fetch interception as fallback only.
 */

(function () {
  const base = window.__engram.base;
  const runtime = typeof browser !== "undefined" ? browser.runtime : chrome.runtime;
  const isFirefox = typeof browser !== "undefined";

  const ENGRAM_VERBOSE_LOGS = false;
  const verboseLog = (...args) => {
    if (ENGRAM_VERBOSE_LOGS) console.debug(...args);
  };

  // Storage for captured messages
  let capturedMessages = [];
  let interceptedMessages = [];
  const sentMessageKeys = new Set();
  const nodeSourceKeys = new WeakMap();
  let nextSourceKey = 1;
  let isScanning = false;

  // ── Fetch Interception ──────────────────────────────────────────────────

  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const [resource] = args;
    const url = typeof resource === "string" ? resource : resource?.url;

    return originalFetch.apply(this, args).then(async (response) => {
      // Clone response to inspect it
      const cloned = response.clone();

      // Intercept conversation messages from Claude API
      if (url?.includes("/api/conversations/") || url?.includes("messages")) {
        try {
          const data = await cloned.json();

          // Extract messages from API response
          if (data.messages && Array.isArray(data.messages)) {
            const apiMessages = data.messages.map((msg) => ({
              role: msg.role === "user" ? "user" : "assistant",
              text: msg.content?.[0]?.text || "",
              codeBlocks: extractCodeFromText(msg.content?.[0]?.text || ""),
              timestamp: msg.created_at || Date.now(),
              platform: "claude",
            }));

            interceptedMessages = deduplicateMessages([...interceptedMessages, ...apiMessages]);
          }
        } catch (e) {
          // Not JSON or parse error, continue
        }
      }

      return response;
    });
  };

  function extractCodeFromText(text) {
    const codeBlocks = [];
    const codeRegex = /```(\w*)\n([\s\S]*?)```/g;
    let match;

    while ((match = codeRegex.exec(text)) !== null) {
      codeBlocks.push({
        language: match[1] || "unknown",
        code: match[2].trim(),
      });
    }

    return codeBlocks;
  }

  function deduplicateMessages(messages) {
    const seen = new Set();
    return messages.filter((msg) => {
      const key = messageKey(msg);
      if (seen.has(key)) {
        verboseLog("[Engram] duplicate skipped", msg.role);
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function messageKey(message) {
    return message.sourceKey || `${message.role}:${normalizeText(message.text)}`;
  }

  function sourceKeyForNode(role, node) {
    if (!nodeSourceKeys.has(node)) {
      nodeSourceKeys.set(node, `${role}:${nextSourceKey}`);
      nextSourceKey += 1;
    }

    return nodeSourceKeys.get(node);
  }

  function getNodeText(node) {
    return (node?.innerText || node?.textContent || "").trim();
  }

  function cleanAssistantText(text) {
    let skippedInternal = false;
    let cleaned = (text || "")
      .replace(/\bClaude responded:\s*/gi, "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => !/^(Copy|Retry)$/i.test(line))
      .filter((line) => {
        const isInternal = /Thinking about|Deciphered/i.test(line);
        if (isInternal) skippedInternal = true;
        return !isInternal;
      })
      .join("\n")
      .trim();

    if (skippedInternal) {
      verboseLog("[Engram] skipped internal thinking");
    }

    cleaned = collapseRepeatedText(cleaned);
    return cleaned;
  }

  function collapseRepeatedText(text) {
    const trimmed = (text || "").trim();
    const lines = trimmed.split(/\n+/).map((line) => line.trim()).filter(Boolean);

    if (lines.length > 1 && lines.length % 2 === 0) {
      const half = lines.length / 2;
      const first = normalizeText(lines.slice(0, half).join("\n"));
      const second = normalizeText(lines.slice(half).join("\n"));
      if (first && first === second) {
        verboseLog("[Engram] cleaned duplicate text");
        return lines.slice(0, half).join("\n");
      }
    }

    const words = normalizeText(trimmed).split(" ").filter(Boolean);
    if (words.length > 1 && words.length % 2 === 0) {
      const half = words.length / 2;
      const first = words.slice(0, half).join(" ");
      const second = words.slice(half).join(" ");
      if (first && first === second) {
        verboseLog("[Engram] cleaned duplicate text");
        return first;
      }
    }

    return collapseAdjacentDuplicatePrefix(trimmed);
  }

  function collapseAdjacentDuplicatePrefix(text) {
    const normalized = normalizeText(text);
    if (!normalized) return text;

    for (let i = 2; i <= Math.floor(normalized.length / 2); i += 1) {
      const prefix = normalized.slice(0, i);
      if (!/[a-zа-яё0-9]/i.test(prefix)) continue;
      if (!normalized.startsWith(prefix + prefix)) continue;

      const rest = normalized.slice(i * 2).trim();
      verboseLog("[Engram] cleaned duplicate text");
      return rest ? `${prefix} ${rest}`.trim() : prefix;
    }

    return text;
  }

  function isMeaningfulText(text) {
    const normalized = normalizeText(text);
    return normalized.length >= 2;
  }

  function isTimestampOrDateOnly(text) {
    const normalized = normalizeText(text).toLowerCase();
    if (/^\d{1,2}:\d{2}$/.test(normalized)) return true;
    return /^\d{1,2}\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+\d{4})?$/.test(normalized);
  }

  const claude = Object.assign(Object.create(base), {
    platform: "claude",

    // Claude.ai DOM selectors (as of May 2025)
    SELECTORS: {
      userMessage: '[data-testid="user-message"]',
      assistantActions: '[data-testid="action-bar-copy"], [data-testid="action-bar-retry"]',
      messageContainer: '[data-testid="conversation-turn"]',
      humanMessage: '[data-testid="human-turn"]',
      assistantMessage: '[data-testid="assistant-turn"]',
      codeBlock: "pre code",
      fallbackMessages: ".font-claude-message, .human-turn, .assistant-turn",
    },

    getMessageNodes() {
      const userNodes = Array.from(document.querySelectorAll(this.SELECTORS.userMessage));
      const assistantNodes = this.getAssistantContainers();
      return [...userNodes, ...assistantNodes];
    },

    getAssistantContainers() {
      const actionButtons = Array.from(document.querySelectorAll(this.SELECTORS.assistantActions));
      const containers = [];
      const seenContainers = new Set();

      actionButtons.forEach((button) => {
        const container = this.findAssistantContainer(button);
        if (!container || seenContainers.has(container)) return;

        seenContainers.add(container);
        containers.push(container);
      });

      verboseLog("[Engram] assistant candidates found", containers.length);
      return containers;
    },

    findAssistantContainer(actionButton) {
      let node = actionButton.parentElement;
      let fallback = null;

      while (node && node !== document.body) {
        const text = cleanAssistantText(getNodeText(node));
        const className = node.getAttribute("class") || String(node.className || "");
        const hasGroupClass = className.includes("group");

        if (isMeaningfulText(text)) {
          if (hasGroupClass) return node;
          fallback = fallback || node;
        }

        node = node.parentElement;
      }

      return fallback;
    },

    extractMessage(node) {
      const isUser = node.matches(this.SELECTORS.userMessage);
      const role = isUser ? "user" : "assistant";

      // Extract plain text
      const rawText = getNodeText(node);
      const text = role === "assistant" ? cleanAssistantText(rawText) : rawText;

      // Extract code blocks
      const codeBlocks = Array.from(node.querySelectorAll(this.SELECTORS.codeBlock)).map(
        (el) => ({
          language: el.className.replace("language-", "").trim() || "unknown",
          code: el.innerText?.trim() || "",
        })
      );

      const message = {
        role,
        text,
        codeBlocks,
        timestamp: Date.now(),
        platform: "claude",
        sourceKey: sourceKeyForNode(role, node),
      };

      verboseLog("[Engram] message extracted", role, normalizeText(text).slice(0, 100));
      return message;
    },

    getAllMessages() {
      if (capturedMessages.length) return capturedMessages;
      const domMessages = this.getMessageNodeMessages();
      return domMessages.length ? domMessages : interceptedMessages;
    },

    getMessageNodeMessages() {
      const userNodes = Array.from(document.querySelectorAll(this.SELECTORS.userMessage));
      const assistantNodes = this.getAssistantContainers();
      const nodes = [...userNodes, ...assistantNodes];
      const messages = [];

      verboseLog("[Engram] user messages found", userNodes.length);

      nodes.sort((a, b) => {
        if (a === b) return 0;
        return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
      });

      nodes.forEach((node) => {
        const message = this.extractMessage(node);
        if (!normalizeText(message.text)) return;

        if (message.role === "assistant" && isTimestampOrDateOnly(message.text)) {
          verboseLog("[Engram] filtered timestamp", message.text);
          return;
        }

        messages.push(message);
      });

      return messages;
    },

    getHealthSignals() {
      const allMessages = this.getAllMessages();
      const codeBlocks = allMessages.flatMap((m) => m.codeBlocks || []);

      return {
        messageCount: allMessages.length,
        textLength: allMessages.reduce((sum, m) => sum + m.text.length, 0),
        codeBlockCount: codeBlocks.length,
        domSize: document.querySelectorAll("*").length,
      };
    },
  });

  window.__engram.platform = claude;

  // ── Message Handlers ───────────────────────────────────────────────────

  runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "ENGRAM_START_SCAN") {
      const response = performComprehensiveScan();

      if (isFirefox) {
        return response.catch((error) => ({ error: error.message || String(error) }));
      }

      response
        .then(sendResponse)
        .catch((error) => sendResponse({ error: error.message || String(error) }));
      return true;
    }
  });

  async function performComprehensiveScan() {
    isScanning = true;
    const t0 = performance.now();

    // Get all messages from DOM first, with fetch interception as fallback.
    const allMessages = captureDomMessages();
    const scanDuration = Math.round(performance.now() - t0);

    const domSize = document.querySelectorAll("*").length;
    const renderedNodes = document.querySelectorAll(
      '[data-testid="conversation-turn"], [data-testid="human-turn"], [data-testid="assistant-turn"]'
    ).length;

    if (allMessages.length === 0) {
      isScanning = false;
      return {
        type: "ENGRAM_SCAN_COMPLETE",
        userCount: 0,
        aiCount: 0,
        total: 0,
        codeCount: 0,
        messages: [],
        chatId: getCurrentChatId(),
        scanDuration,
        totalChars: 0,
        domSize,
        renderedNodes,
        url: window.location.href,
        scannedAt: Date.now(),
      };
    }

    // Count messages by role
    const userMessages = allMessages.filter((m) => m.role === "user");
    const aiMessages = allMessages.filter((m) => m.role === "assistant");
    const codeBlocks = allMessages.flatMap((m) => m.codeBlocks || []);
    const totalChars = allMessages.reduce((sum, m) => sum + (m.text?.length || 0), 0);

    // Send completion status
    isScanning = false;
    const scanResult = {
      type: "ENGRAM_SCAN_COMPLETE",
      userCount: userMessages.length,
      aiCount: aiMessages.length,
      total: allMessages.length,
      codeCount: codeBlocks.length,
      messages: allMessages,
      chatId: getCurrentChatId(),
      scanDuration,
      totalChars,
      domSize,
      renderedNodes,
      url: window.location.href,
      scannedAt: Date.now(),
    };

    sendNewMessages(allMessages);

    return scanResult;
  }

  function getCurrentChatId() {
    // Extract chat ID from URL or generate from title
    const match = window.location.pathname.match(/\/c\/([a-z0-9]+)/i);
    return match ? match[1] : "unknown";
  }

  function sendRuntimeMessage(message) {
    if (isFirefox) {
      runtime.sendMessage(message).catch(() => {});
      return;
    }

    runtime.sendMessage(message, () => {
      // Touch lastError so Chrome does not log unchecked errors for fire-and-forget messages.
      void chrome.runtime.lastError;
    });
  }

  // ── Continuous Health Monitoring ─────────────────────────────────────────

  function captureDomMessages() {
    capturedMessages = claude.getMessageNodeMessages();
    return capturedMessages.length ? capturedMessages : interceptedMessages;
  }

  function sendNewMessages(messages) {
    const newMessages = [];

    messages.forEach((message) => {
      const key = messageKey(message);
      if (sentMessageKeys.has(key)) {
        verboseLog("[Engram] duplicate skipped", message.role);
        return;
      }

      sentMessageKeys.add(key);
      newMessages.push(message);
    });

    if (!newMessages.length) return;

    sendRuntimeMessage({
      type: "ENGRAM_NEW_MESSAGES",
      platform: "claude",
      messages: newMessages,
      totalCount: messages.length,
    });

    verboseLog("[Engram] message sent to background", newMessages.length);
  }

  let lastMessageCount = 0;

  function updateHealthSignals(messages) {
    const allMessages = messages || claude.getAllMessages();
    if (allMessages.length === lastMessageCount) return;

    lastMessageCount = allMessages.length;

    // Health check
    const signals = claude.getHealthSignals();
    const score = claude.computeHealthScore(signals);
    const { label, color } = claude.healthLabel(score);

    sendRuntimeMessage({
      type: "ENGRAM_HEALTH_UPDATE",
      score,
      label,
      color,
      signals,
    });
  }

  function handleDomMutation() {
    verboseLog("[Engram] mutation observed");
    const messages = captureDomMessages();
    sendNewMessages(messages);
    updateHealthSignals(messages);
  }

  // Poll is only a fallback for late-rendered DOM; MutationObserver is primary.
  setInterval(() => {
    const messages = captureDomMessages();
    sendNewMessages(messages);
    updateHealthSignals(messages);
  }, 2000);

  // Primary capture path: Claude DOM mutations.
  const observer = new MutationObserver(handleDomMutation);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial DOM capture.
  handleDomMutation();

  verboseLog("[Engram] Claude.ai parser active with DOM mutation capture");
})();
