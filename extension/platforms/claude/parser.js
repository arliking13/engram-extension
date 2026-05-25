/**
 * Engram — Claude.ai Parser (MVP)
 * Captures Claude.ai messages from DOM mutations, with fetch interception as fallback only.
 */

(function () {
  const base = window.__engram.base;
  const runtime = typeof browser !== "undefined" ? browser.runtime : chrome.runtime;
  const isFirefox = typeof browser !== "undefined";

  const ENGRAM_VERBOSE_LOGS = false;
  const ENGRAM_WIDGET_ID = "engram-mini-health-widget";
  const ENGRAM_WIDGET_STYLE_ID = "engram-mini-health-style";
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
      if (!/[a-z\u0400-\u04ff0-9]/i.test(prefix)) continue;
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
    return /^\d{1,2}\s+(\u044f\u043d\u0432\u0430\u0440\u044f|\u0444\u0435\u0432\u0440\u0430\u043b\u044f|\u043c\u0430\u0440\u0442\u0430|\u0430\u043f\u0440\u0435\u043b\u044f|\u043c\u0430\u044f|\u0438\u044e\u043d\u044f|\u0438\u044e\u043b\u044f|\u0430\u0432\u0433\u0443\u0441\u0442\u0430|\u0441\u0435\u043d\u0442\u044f\u0431\u0440\u044f|\u043e\u043a\u0442\u044f\u0431\u0440\u044f|\u043d\u043e\u044f\u0431\u0440\u044f|\u0434\u0435\u043a\u0430\u0431\u0440\u044f)(?:\s+\d{4})?$/.test(normalized);
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
    if (msg.type === "ENGRAM_ACTIVE_SCAN_SESSION_UPDATED") {
      const currentKeys = _wCurrentSnapshotKeys();
      if (msg.platform === "claude" && msg.snapshotKey && currentKeys.includes(msg.snapshotKey)) {
        _wActiveSession = msg.activeSession || null;
        _wLastKey = "";
        console.log("[Engram][Widget] live update rendered", {
          platform: "claude",
          snapshotKey: msg.snapshotKey,
          total: msg.scanResult?.total || msg.scanResult?.stats?.total || 0,
        });
        if (_wEl) _wUpdate();
      }
      if (isFirefox) return Promise.resolve({ ok: true });
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === "ENGRAM_BASELINE_ESTABLISHED") {
      const snapshotKey = msg.snapshotKey;
      const currentKeys = _wCurrentSnapshotKeys();
      if (snapshotKey && currentKeys.includes(snapshotKey)) {
        console.log("[Engram][Claude] baseline established snapshotKey=" + snapshotKey);
        _wLastKey = "";
        if (_wEl) _wUpdate();
      }
      if (isFirefox) return Promise.resolve({ ok: true });
      sendResponse({ ok: true });
      return true;
    }

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
        sourceTitle: getChatTitle(),
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
      sourceTitle: getChatTitle(),
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
    const match = window.location.pathname.match(/\/(?:chat|c)\/([a-z0-9-]+)/i);
    return match ? match[1] : "unknown";
  }

  function getChatTitle() {
    // Try Claude.ai-specific DOM selectors for the conversation title
    const selectors = [
      '[data-testid="chat-menu-trigger"]',
      '[data-testid="conversation-name"]',
      'nav [aria-current="page"]',
      'nav [aria-selected="true"]',
      '.conversation-title',
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (!el) continue;
        const text = (el.innerText || el.textContent || "").trim();
        if (text && text.length > 1 && !/^claude$/i.test(text)) return text;
      } catch (_) {}
    }
    // Fallback: strip " - Claude" suffix from document.title
    const raw = (document.title || "").trim();
    if (raw) {
      const cleaned = raw.replace(/\s*[-–|]\s*claude.*$/i, "").trim();
      if (cleaned && cleaned.length > 1 && !/^claude$/i.test(cleaned)) return cleaned;
    }
    return null;
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
  let _loUserTimer     = null; // user_committed debounce
  let _loAiTimer       = null; // assistant_complete debounce
  let _liveLastSig     = "";   // per-snapshotKey dedup signature

  async function _livePersistClaude(liveReason) {
    const msgs = captureDomMessages();
    if (!msgs.length) return;
    if (liveReason === "assistant_complete" && !msgs.some(m => m.role === "assistant")) return;

    const chatId = getCurrentChatId();
    const snapshotKey = chatId && chatId !== "unknown"
      ? "chat:" + chatId
      : "url:" + _wNormalizeUrl(window.location.href);

    const last = msgs[msgs.length - 1];
    const sig  = snapshotKey + "|" + msgs.length + "|" + last.role + "|" +
                 (last.text || "").slice(0, 30) + "|" + (last.text || "").length;
    if (sig === _liveLastSig) {
      console.log("[Engram][Live][Claude] skipped duplicate signature snapshotKey=" + snapshotKey);
      return;
    }
    _liveLastSig = sig;

    const userCount  = msgs.filter(m => m.role === "user").length;
    const aiCount    = msgs.filter(m => m.role === "assistant").length;
    const codeCount  = msgs.flatMap(m => m.codeBlocks || []).length;
    const totalChars = msgs.reduce((s, m) => s + (m.text?.length || 0), 0);

    console.log("[Engram][Live] observer detected change", {
      platform: "claude",
      reason: liveReason,
      snapshotKey,
      total: msgs.length,
      userCount,
      aiCount,
      codeCount,
    });
    if (liveReason === "user_committed") {
      console.log("[Engram][Live][Claude] user_committed detected userCount=" + userCount + " total=" + msgs.length);
    } else {
      console.log("[Engram][Live][Claude] assistant_complete detected aiCount=" + aiCount + " total=" + msgs.length);
    }
    console.log("[Engram][Live][Claude] persisted reason=" + liveReason + " snapshotKey=" + snapshotKey + " messages=" + msgs.length);

    const liveMsg = {
      type:               "ENGRAM_LIVE_SCAN_COMPLETE",
      platform:           "claude",
      liveReason,
      messages:           msgs,
      chatId,
      snapshotKey,
      sourceUrl:          window.location.href,
      sourceTitle:        getChatTitle(),
      scannedAt:          Date.now(),
      total:              msgs.length,
      userCount,
      aiCount,
      codeCount,
      totalChars,
      extractionStrategy: "live-dom",
    };
    let resp = null;
    try {
      console.log("[Engram][Live] sending ENGRAM_LIVE_SCAN_COMPLETE", {
        platform: "claude",
        reason: liveReason,
        snapshotKey,
        total: msgs.length,
      });
      if (isFirefox) {
        resp = await runtime.sendMessage(liveMsg).catch(() => null);
      } else {
        resp = await new Promise((resolve) => {
          runtime.sendMessage(liveMsg, (r) => {
            void chrome.runtime.lastError;
            resolve(r || null);
          });
        });
      }
    } catch (_) {}

    if (!resp || !resp.hasActiveSession) {
      console.log("[Engram][Live][Claude] skipped widget update: no active session snapshotKey=" + snapshotKey);
      return;
    }
    // Update widget in-process — no storage round-trip needed
    _wActiveSession = resp.activeSession || null;
    _wLastKey = "";
    console.log("[Engram][Widget] live update rendered", {
      platform: "claude",
      snapshotKey,
      total: _wActiveSession?.scanResult?.total || _wActiveSession?.scanResult?.stats?.total || 0,
    });
    if (_wEl) _wUpdate();
  }

  function _scheduleLiveScan(reason) {
    if (reason === "user_committed") {
      if (_loUserTimer) { clearTimeout(_loUserTimer); }
      _loUserTimer = setTimeout(() => {
        _loUserTimer = null;
        _livePersistClaude("user_committed");
      }, 600);
    } else {
      if (_loAiTimer) { clearTimeout(_loAiTimer); }
      _loAiTimer = setTimeout(() => {
        _loAiTimer = null;
        _livePersistClaude("assistant_complete");
      }, 2000);
    }
  }

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

  function isWidgetNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    return node.id === ENGRAM_WIDGET_ID || !!node.closest?.("#" + ENGRAM_WIDGET_ID);
  }

  function isWidgetOnlyMutation(mutation) {
    if (isWidgetNode(mutation.target)) return true;

    const changedNodes = [
      ...Array.from(mutation.addedNodes || []),
      ...Array.from(mutation.removedNodes || []),
    ].filter((node) => node.nodeType === Node.ELEMENT_NODE);

    return changedNodes.length > 0 && changedNodes.every(isWidgetNode);
  }

  function handleDomMutation(mutations = []) {
    if (mutations.length && mutations.every(isWidgetOnlyMutation)) return;

    verboseLog("[Engram] mutation observed");
    const messages = captureDomMessages();
    sendNewMessages(messages);
    updateHealthSignals(messages);

    // Detect if this mutation introduced a new user message node
    let hasNewUserNode = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (
          (node.matches    && node.matches('[data-testid="user-message"]')) ||
          (node.querySelector && node.querySelector('[data-testid="user-message"]'))
        ) { hasNewUserNode = true; break; }
      }
      if (hasNewUserNode) break;
    }
    _scheduleLiveScan(hasNewUserNode ? "user_committed" : "assistant_complete");
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

  // ── Engram Mini Health Widget ─────────────────────────────────────────────
  // Safety: widget DOM is updated from its own 3s interval only — never from
  // MutationObserver. Drag uses pointer events + rAF; position persists to storage.

  const _wId   = ENGRAM_WIDGET_ID;
  const _wStId = ENGRAM_WIDGET_STYLE_ID;
  const _wStor = isFirefox ? browser.storage.local : chrome.storage.local;
  const _wIconUrl = isFirefox
    ? browser.runtime.getURL("assets/engram-icon.png")
    : chrome.runtime.getURL("assets/engram-icon.png");
  const _wLogoImg = "<img class='ew-icon' src='" + _wIconUrl + "' alt='' aria-hidden='true'" +
    " onerror=\"this.outerHTML='<span class=ew-icon-fb></span>'\">";

  let _wEl        = null;
  let _wEnabled   = false;
  let _wCollapsed = true;
  let _wLastKey   = "";
  let _wPos       = null;  // { left, top } in px, null = use CSS default (bottom/right)
  let _wSnapshot  = null;
  let _wSnapshotsByChatId = {};
  let _wActiveSession = null;

  // Drag state
  let _wDragging    = false;
  let _wDragMoved   = false;
  let _wDragStartX  = 0;
  let _wDragStartY  = 0;
  let _wDragElX     = 0;
  let _wDragElY     = 0;
  let _wClickTarget = null;
  let _wRafId       = null;
  const _wMargin    = 8;

  function _wClamp(left, top) {
    const w = _wEl ? (_wEl.offsetWidth  || 160) : 160;
    const h = _wEl ? (_wEl.offsetHeight || 40)  : 40;
    return {
      left: Math.max(_wMargin, Math.min(left, window.innerWidth  - w - _wMargin)),
      top:  Math.max(_wMargin, Math.min(top,  window.innerHeight - h - _wMargin)),
    };
  }

  function _wSavePos() {
    if (!_wPos) return;
    try {
      if (isFirefox) { _wStor.set({ engramWidgetPos: _wPos }).catch(() => {}); }
      else           { _wStor.set({ engramWidgetPos: _wPos }); }
    } catch (_) {}
  }

  function _wApplyPos(left, top) {
    if (!_wEl) return;
    const c = _wClamp(left, top);
    _wEl.style.left   = c.left + "px";
    _wEl.style.top    = c.top + "px";
    _wEl.style.right  = "auto";
    _wEl.style.bottom = "auto";
    _wPos = c;
  }

  function _wNormalizeUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.origin + parsed.pathname;
    } catch (_) {
      return "";
    }
  }

  function _wMatchesCurrentChat(snapshot) {
    if (!snapshot) return false;

    const currentChatId = getCurrentChatId();
    if (
      snapshot.chatId &&
      snapshot.chatId !== "unknown" &&
      currentChatId &&
      currentChatId !== "unknown"
    ) {
      return snapshot.chatId === currentChatId;
    }

    const savedUrl = _wNormalizeUrl(snapshot.sourceUrl || "");
    const currentUrl = _wNormalizeUrl(window.location.href);
    return !!savedUrl && savedUrl === currentUrl;
  }

  function _wCurrentSnapshotKeys() {
    const keys = [];
    const currentChatId = getCurrentChatId();
    if (currentChatId && currentChatId !== "unknown") keys.push("chat:" + currentChatId);

    const currentUrl = _wNormalizeUrl(window.location.href);
    if (currentUrl) keys.push("url:" + currentUrl);

    return keys;
  }

  function _wCurrentSnapshotKey() {
    return _wCurrentSnapshotKeys()[0] || "url:" + _wNormalizeUrl(window.location.href);
  }

  function _wRuntimeSend(message) {
    if (isFirefox) return runtime.sendMessage(message).catch(() => null);
    return new Promise((resolve) => {
      runtime.sendMessage(message, (response) => {
        void chrome.runtime.lastError;
        resolve(response || null);
      });
    });
  }

  async function _wRefreshActiveSession() {
    const snapshotKey = _wCurrentSnapshotKey();
    const response = await _wRuntimeSend({
      type: "ENGRAM_GET_ACTIVE_SCAN_SESSION",
      platform: "claude",
      snapshotKey,
    });
    const hasActiveSession = !!response?.hasActiveSession;
    console.log("[Engram][Widget] active scan session check", {
      platform: "claude",
      snapshotKey,
      hasActiveSession,
    });
    if (!hasActiveSession) {
      _wActiveSession = null;
      console.log("[Engram][Widget] scan required: no active session", {
        platform: "claude",
        snapshotKey,
      });
      return null;
    }
    _wActiveSession = response.activeSession || null;
    console.log("[Engram][Widget] rendered active session", {
      platform: "claude",
      snapshotKey,
      total: _wActiveSession?.scanResult?.total || _wActiveSession?.scanResult?.stats?.total || 0,
    });
    return _wActiveSession;
  }

  function _wFindExactSnapshot() {
    return _wActiveSession?.scanResult || null;
  }

  function _wSnapshotColor(label) {
    if (label === "Safe") return "#22c55e";
    if (label === "Good") return "#84cc16";
    if (label === "Fair") return "#f59e0b";
    if (label === "Risky") return "#f97316";
    return "#ef4444";
  }

  function _wFormatTime(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function _wLiveStatus(total, code) {
    if (total >= 250 || code >= 80) {
      return { label: "Critical", color: "#ef4444" };
    }
    if (total >= 120 || code >= 30) {
      return { label: "Risky", color: "#f97316" };
    }
    if (total >= 60 || code >= 10) {
      return { label: "Fair", color: "#f59e0b" };
    }
    return { label: "Safe", color: "#22c55e" };
  }

  function _wLiveStats() {
    const msgs = captureDomMessages();
    const total = msgs.length;
    if (!total) return { mode: "empty", hasData: false };

    const user = msgs.filter(m => m.role === "user").length;
    const ai = msgs.filter(m => m.role === "assistant").length;
    const code = msgs.flatMap(m => m.codeBlocks || []).length;
    const status = _wLiveStatus(total, code);

    return {
      mode: "live",
      hasData: true,
      total,
      user,
      ai,
      code,
      label: status.label,
      color: status.color,
      source: "Visible chat activity",
      accuracy: "Estimated",
      hint: "Full scan creates handoff-ready report.",
    };
  }

  function _wStats() {
    const exactSnapshot = _wFindExactSnapshot();
    if (!exactSnapshot) return { mode: "scan-needed", hasData: false };

    const stats = exactSnapshot.stats || {};
    const total = stats.total || exactSnapshot.total || 0;
    const code = stats.codeCount || exactSnapshot.codeCount || 0;
    const status = _wLiveStatus(total, code);
    const label = exactSnapshot.healthLabel || exactSnapshot.statusLabel || status.label;
    return {
      mode: "exact",
      hasData: true,
      total,
      user: stats.userCount || exactSnapshot.userCount || 0,
      ai: stats.aiCount || exactSnapshot.aiCount || 0,
      code,
      label,
      color: exactSnapshot.healthColor || status.color || _wSnapshotColor(label),
      risk: exactSnapshot.migrationRisk || "—",
      load: exactSnapshot.browserLoad || "—",
      source: "Active scan",
      time: _wFormatTime(exactSnapshot.scannedAt),
      scannedAt: exactSnapshot.scannedAt || 0,
    };
  }

  // _wRender: no onclick on compact row — toggle is handled by _wSetupDrag pointerup.
  // Only the close button keeps its own onclick (pointerdown guard excludes it from drag).
  function _wRender(st) {
    if (!_wEl) return;

    if (st.mode === "scan-needed" && _wCollapsed) {
      _wEl.innerHTML =
        "<div class='ew-row-compact' title='Click Scan Chat in the Engram popup for accurate results'>" +
          "<span class='ew-logo'>" + _wLogoImg + "Engram</span>" +
          "<span class='ew-dot'>&#xB7;</span>" +
          "<span class='ew-muted'>Scan required</span>" +
        "</div>";
      return;
    }

    if (st.mode === "scan-needed") {
      _wEl.innerHTML =
        "<div class='ew-head'>" +
          "<span class='ew-logo'>" + _wLogoImg + "Engram</span>" +
          "<button class='ew-close' title='Collapse'>&#x2212;</button>" +
        "</div>" +
        "<div class='ew-body'>" +
          "<div class='ew-hint ew-hint-expanded'>Not scanned. Click <b>Scan</b> in the Engram popup to start live tracking.</div>" +
        "</div>";
      _wEl.querySelector(".ew-close").onclick = _wToggle;
      return;
    }

    if (!st.hasData && _wCollapsed) {
      _wEl.innerHTML =
        "<div class='ew-row-compact'>" +
          "<span class='ew-logo'>" + _wLogoImg + "Engram</span>" +
          "<span class='ew-dot'>&#xB7;</span>" +
          "<span class='ew-muted'>Waiting for chat</span>" +
        "</div>";
      return;
    }

    if (!st.hasData) {
      _wEl.innerHTML =
        "<div class='ew-head'>" +
          "<span class='ew-logo'>" + _wLogoImg + "Engram</span>" +
          "<button class='ew-close' title='Collapse'>&#x2212;</button>" +
        "</div>" +
        "<div class='ew-body'>" +
          "<div class='ew-hint ew-hint-expanded'>No readable chat data yet.</div>" +
        "</div>";
      _wEl.querySelector(".ew-close").onclick = _wToggle;
      return;
    }

    if (st.mode === "live" && _wCollapsed) {
      _wEl.innerHTML =
        "<div class='ew-row-compact' title='Estimated from visible chat data. Click to expand'>" +
          "<span class='ew-logo'>" + _wLogoImg + "Engram</span>" +
          "<span class='ew-dot'>&#xB7;</span>" +
          "<span class='ew-badge' style='color:" + st.color + "'>" + st.label + "</span>" +
          "<span class='ew-dot'>&#xB7;</span>" +
          "<span class='ew-muted'>" + st.total + " msgs</span>" +
          "<span class='ew-dot'>&#xB7;</span>" +
          "<span class='ew-est'>est.</span>" +
        "</div>";
      return;
    }

    if (st.mode === "live") {
      _wEl.innerHTML =
        "<div class='ew-head'>" +
          "<span class='ew-logo'>" + _wLogoImg + "Engram</span>" +
          "<button class='ew-close' title='Collapse'>&#x2212;</button>" +
        "</div>" +
        "<div class='ew-body'>" +
          "<div class='ew-kv'><span class='ew-k'>Status</span>" +
            "<span class='ew-v' style='color:" + st.color + "'>" + st.label + "</span></div>" +
          "<div class='ew-subtle'>Based on visible chat activity</div>" +
          "<div class='ew-hr'></div>" +
          "<div class='ew-kv'><span class='ew-k'>Messages</span><span class='ew-v'>" + st.total + "</span></div>" +
          "<div class='ew-kv'><span class='ew-k'>Code blocks</span><span class='ew-v'>" + st.code + "</span></div>" +
          "<div class='ew-kv'><span class='ew-k'>Accuracy</span><span class='ew-v'>" + st.accuracy + "</span></div>" +
          "<div class='ew-hint ew-hint-expanded'>" + st.hint + "</div>" +
        "</div>";
      _wEl.querySelector(".ew-close").onclick = _wToggle;
      return;
    }

    if (_wCollapsed) {
      _wEl.innerHTML =
        "<div class='ew-row-compact' title='Click to expand'>" +
          "<span class='ew-logo'>" + _wLogoImg + "Engram</span>" +
          "<span class='ew-dot'>&#xB7;</span>" +
          "<span class='ew-badge' style='color:" + st.color + "'>" + st.label + "</span>" +
          "<span class='ew-dot'>&#xB7;</span>" +
          "<span class='ew-muted'>" + st.total + " msgs</span>" +
        "</div>";
      return;
    }

    _wEl.innerHTML =
      "<div class='ew-head'>" +
        "<span class='ew-logo'>" + _wLogoImg + "Engram</span>" +
        "<button class='ew-close' title='Collapse'>&#x2212;</button>" +
      "</div>" +
      "<div class='ew-body'>" +
        "<div class='ew-kv'><span class='ew-k'>Status</span>" +
          "<span class='ew-v' style='color:" + st.color + "'>" + st.label + "</span></div>" +
        "<div class='ew-kv'><span class='ew-k'>Risk</span><span class='ew-v'>" + st.risk + "</span></div>" +
        "<div class='ew-kv'><span class='ew-k'>Load</span><span class='ew-v'>" + st.load + "</span></div>" +
        "<div class='ew-hr'></div>" +
        "<div class='ew-kv'><span class='ew-k'>Messages</span><span class='ew-v'>" + st.total + "</span></div>" +
        "<div class='ew-kv'><span class='ew-k'>Code blocks</span><span class='ew-v'>" + st.code + "</span></div>" +
        "<div class='ew-kv'><span class='ew-k'>Accuracy</span><span class='ew-v'>Full scan</span></div>" +
        "<div class='ew-time'>Active scan: " + st.time + "</div>" +
      "</div>";
    _wEl.querySelector(".ew-close").onclick = _wToggle;
  }

  async function _wUpdate() {
    if (!_wEl) return;
    await _wRefreshActiveSession();
    const st  = _wStats();
    const key = st.hasData
      ? (st.mode + "|" + st.label + "|" + (st.risk || "") + "|" + (st.load || "") + "|" + st.total + "|" + st.user + "|" + st.ai + "|" + st.code + "|" + (st.scannedAt || "") + "|" + _wCollapsed)
      : ((st.mode || "empty") + "|" + _wCollapsed);
    if (key === _wLastKey) return;
    _wLastKey = key;
    _wRender(st);
    if (!_wDragging && _wPos) _wApplyPos(_wPos.left, _wPos.top);
  }

  function _wToggle() {
    _wCollapsed = !_wCollapsed;
    try {
      if (isFirefox) { _wStor.set({ engramWidgetCollapsed: _wCollapsed }).catch(() => {}); }
      else           { _wStor.set({ engramWidgetCollapsed: _wCollapsed }); }
    } catch (_) {}
    _wLastKey = "";
    _wUpdate();
  }

  function _wRemove() {
    if (_wEl) { _wEl.remove(); _wEl = null; }
    _wEnabled = false;
    _wLastKey = "";
    _wPos     = null;
    const s = document.getElementById(_wStId);
    if (s) s.remove();
  }

  function _wSetupDrag() {
    if (!_wEl) return;

    _wEl.addEventListener("pointerdown", (e) => {
      // Close button handles itself via onclick — don't capture it
      if (e.target.closest(".ew-close")) return;
      _wClickTarget = e.target;
      _wEl.setPointerCapture(e.pointerId);
      _wDragging   = true;
      _wDragMoved  = false;
      _wDragStartX = e.clientX;
      _wDragStartY = e.clientY;
      const rect   = _wEl.getBoundingClientRect();
      _wDragElX    = rect.left;
      _wDragElY    = rect.top;
      _wApplyPos(rect.left, rect.top);
      _wEl.style.cursor = "grabbing";
      e.preventDefault(); // prevent text selection; also suppresses click in Chrome
    });

    _wEl.addEventListener("pointermove", (e) => {
      if (!_wDragging) return;
      const dx = e.clientX - _wDragStartX;
      const dy = e.clientY - _wDragStartY;
      if (!_wDragMoved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return; // dead zone
      _wDragMoved = true;
      const nx = _wDragElX + dx;
      const ny = _wDragElY + dy;
      if (_wRafId) cancelAnimationFrame(_wRafId);
      _wRafId = requestAnimationFrame(() => {
        if (!_wEl) return;
        const c = _wClamp(nx, ny);
        _wEl.style.left   = c.left + "px";
        _wEl.style.top    = c.top + "px";
        _wEl.style.right  = "auto";
        _wEl.style.bottom = "auto";
        _wRafId = null;
      });
    });

    _wEl.addEventListener("pointerup", (e) => {
      if (!_wDragging) return;
      _wDragging = false;
      _wEl.style.cursor = "";
      if (_wRafId) { cancelAnimationFrame(_wRafId); _wRafId = null; }

      if (_wDragMoved) {
        // Persist final position
        const rect = _wEl.getBoundingClientRect();
        _wApplyPos(rect.left, rect.top);
        _wSavePos();
      } else {
        // Simple click — toggle unless user tapped inside expanded body content
        const inBody = _wClickTarget && _wClickTarget.closest(".ew-body");
        if (!inBody) _wToggle();
      }
    });

    _wEl.addEventListener("pointercancel", () => {
      _wDragging = false;
      _wEl.style.cursor = "";
      if (_wRafId) { cancelAnimationFrame(_wRafId); _wRafId = null; }
    });

    // Re-clamp if viewport shrinks after a drag-positioned widget
    window.addEventListener("resize", () => {
      if (!_wEl || !_wPos) return;
      _wApplyPos(_wPos.left, _wPos.top);
    });
  }

  function _wInject() {
    if (_wEl || document.getElementById(_wId)) return;

    const style = document.createElement("style");
    style.id = _wStId;
    style.textContent =
      "#" + _wId + "{position:fixed;bottom:80px;right:16px;z-index:2147483647;" +
      "font-family:'Satoshi-Variable',Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
      "background:rgba(11,11,11,0.92);border:1px solid rgba(245,245,245,0.12);border-radius:16px;" +
      "color:#f5f5f5;box-shadow:rgba(3,3,3,0.12) 0 12px 30px -4px;" +
      "backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);" +
      "box-sizing:border-box;width:max-content;max-width:260px;height:auto;resize:none;overflow:hidden;" +
      "user-select:none;touch-action:none;transition:opacity 0.2s;cursor:grab;}" +
      "#" + _wId + ":hover{opacity:1!important;}" +
      ".ew-row-compact{display:flex;align-items:center;gap:5px;padding:7px 11px;" +
        "border-radius:16px;font-size:12px;white-space:nowrap;}" +
      ".ew-row-compact:hover{background:rgba(168,129,254,0.08);}" +
      ".ew-logo{display:inline-flex;align-items:center;gap:4px;color:#a881fe;font-weight:750;font-size:11px;}" +
      ".ew-icon{display:block;width:13px;height:13px;object-fit:contain;flex-shrink:0;}" +
      ".ew-icon-fb{display:inline-block;width:10px;height:10px;background:rgba(168,129,254,0.8);border-radius:2px;flex-shrink:0;}" +
      ".ew-badge{font-weight:700;font-size:11px;}" +
      ".ew-est{color:#aeaeae;font-size:10px;font-weight:650;}" +
      ".ew-dot{color:#5f5f68;font-size:11px;}" +
      ".ew-muted{color:#aeaeae;font-size:11px;}" +
      ".ew-hint{color:#aeaeae;font-size:11px;line-height:1.4;}" +
      ".ew-hint-expanded{max-width:220px;}" +
      ".ew-subtle{color:#aeaeae;font-size:11px;line-height:1.35;}" +
      ".ew-head{display:flex;align-items:center;justify-content:space-between;" +
        "padding:8px 10px 6px;border-bottom:1px solid rgba(245,245,245,0.10);}" +
      ".ew-close{background:none;border:none;color:#aeaeae;cursor:pointer;" +
        "font-size:16px;padding:0 2px;line-height:1;font-family:inherit;transition:color 0.15s;}" +
      ".ew-close:hover{color:#f5f5f5;}" +
      ".ew-body{padding:7px 10px 9px;display:flex;flex-direction:column;gap:4px;}" +
      ".ew-kv{display:flex;align-items:center;gap:4px;}" +
      ".ew-k{color:#aeaeae;font-size:11px;min-width:64px;}" +
      ".ew-v{font-weight:700;font-size:11px;color:#f5f5f5;}" +
      ".ew-ml{margin-left:8px;}" +
      ".ew-hr{height:1px;background:rgba(245,245,245,0.10);margin:2px 0;}" +
      ".ew-time{color:#6f6f78;font-size:10px;margin-top:2px;}";
    document.head.appendChild(style);

    _wEl = document.createElement("div");
    _wEl.id = _wId;
    _wEl.style.opacity = "0.85";
    document.body.appendChild(_wEl);

    _wSetupDrag();

    // Read saved collapse state and position in a single storage call
    try {
      const keys = [
        "engramWidgetCollapsed",
        "engramWidgetPos",
      ];
      const cb = (result) => {
        if (result) {
          if ("engramWidgetCollapsed" in result) _wCollapsed = !!result.engramWidgetCollapsed;
          const pos = result.engramWidgetPos;
          if (pos && typeof pos.left === "number" && typeof pos.top === "number") {
            _wApplyPos(pos.left, pos.top);
          } else if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
            _wApplyPos(pos.x, pos.y);
          }
        }
        _wUpdate();
      };
      if (isFirefox) { _wStor.get(keys).then(cb).catch(() => _wUpdate()); }
      else           { _wStor.get(keys, cb); }
    } catch (_) { _wUpdate(); }
  }

  function _wBootstrap() {
    const cb = (result) => {
      _wEnabled = !!result?.engramSettings?.showMiniHealthWidget;
      if (_wEnabled) _wInject();
    };
    try {
      if (isFirefox) { _wStor.get("engramSettings").then(cb).catch(() => {}); }
      else           { _wStor.get("engramSettings", cb); }
    } catch (_) {}

    // React to settings changes while page is open
    try {
      const onChanged = isFirefox ? browser.storage.onChanged : chrome.storage.onChanged;
      onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes.engramSettings) return;
        const enabled = !!changes.engramSettings.newValue?.showMiniHealthWidget;
        if (enabled && !_wEl) { _wEnabled = true;  _wInject(); }
        if (!enabled && _wEl) { _wRemove(); }
      });
      onChanged.addListener((changes, area) => {
        if (area !== "local" && area !== "session") return;
        if (!changes["engram:runtime:activeScanSessions"]) return;
        _wLastKey = "";
        if (_wEl) _wUpdate();
      });
    } catch (_) {}
  }

  // Widget refresh on its own 3s tick — never called from MutationObserver
  let _wLastHref = window.location.href;
  setInterval(() => {
    if (window.location.href === _wLastHref) return;
    _wLastHref = window.location.href;
    _wActiveSession = null;
    _wLastKey = "";
    if (_wEnabled && _wEl) _wUpdate();
  }, 500);

  setInterval(() => { if (_wEnabled && _wEl) _wUpdate(); }, 3000);

  if (document.body) { _wBootstrap(); }
  else { document.addEventListener("DOMContentLoaded", _wBootstrap); }

})();
