/**
 * Engram — ChatGPT Parser
 * Extracts conversation messages from chatgpt.com and chat.openai.com.
 *
 * Self-contained: does not depend on platforms/base/parser.js.
 * Responds to ENGRAM_START_SCAN with ENGRAM_SCAN_COMPLETE in the same
 * schema used by the Claude parser so all existing popup/handoff/ZIP
 * logic works without modification.
 *
 * Mini Health Widget is ported from the Claude parser with only two
 * ChatGPT-specific substitutions:
 *   captureDomMessages() → extractMessages()
 *   getCurrentChatId()   → getChatId()
 */

(function () {
  "use strict";

  const runtime  = typeof browser !== "undefined" ? browser.runtime : chrome.runtime;
  const isFirefox = typeof browser !== "undefined";

  const ENGRAM_WIDGET_ID       = "engram-mini-health-widget";
  const ENGRAM_WIDGET_STYLE_ID = "engram-mini-health-style";
  const CHATGPT_BRIDGE_SOURCE  = "engram-chatgpt-bridge";
  const CHATGPT_BRIDGE_EVENT   = "conversation-snapshot";
  const CHATGPT_LEGACY_EVENT   = "ENGRAM_CHATGPT_DATA_LAYER";
  const CHATGPT_SESSION_KEY    = "engramChatgptLatestSnapshot";
  const CHATGPT_PAGE_SESSION_KEY = "engram:chatgpt:conversationSnapshot";
  const CHATGPT_SESSION_LIMIT  = 2 * 1024 * 1024;

  let latestDataLayerSnapshot  = null;
  let latestBGNetworkSnapshot  = null;
  let _chatDirty               = false; // true when DOM has new messages since last accepted snapshot
  let _snapshotBaselineAt      = null;  // capturedAt of last accepted snapshot for current chat
  let _freshSnapInFlight       = null;  // { chatId, promise, cancel } | null — deduped in-flight fetch

  console.log("[Engram][ChatGPT] parser loaded");
  // Startup diagnostic: always logged so about:debugging confirms injection
  {
    const _startChatId = (location.pathname.match(/\/c\/([a-z0-9-]+)/i) || [])[1] || "none";
    const _startPage   = _startChatId !== "none" ? "conversation" : "other";
    console.log(
      "[Engram][ChatGPT] startup",
      "href=" + location.href,
      "chatId=" + _startChatId,
      "page=" + _startPage
    );
  }

  // Debug flag — set to true locally to enable verbose scan diagnostics.
  // Must remain false in committed code to avoid console spam.
  const ENGRAM_DEBUG_CHATGPT = false;
  function _dbg(...args) { if (ENGRAM_DEBUG_CHATGPT) console.log("[Engram][ChatGPT][debug]", ...args); }

  // ── Text helpers ──────────────────────────────────────────────────────────

  function isVisibleRoleNode(node) {
    if (node.getAttribute("aria-hidden") === "true") return false;
    if (node.closest("[aria-hidden='true']")) return false;
    if (typeof node.getClientRects === "function" && node.getClientRects().length === 0) return false;
    return true;
  }

  // Single-word / short-phrase button labels that appear in ChatGPT action
  // bars. Only filtered when we fall back to reading the full role node
  // (i.e. when the specific content element selector did not match).
  const _UI_NOISE_LINES = new Set([
    "copy", "copy code", "edit", "edited",
    "thumbs up", "thumbs down", "good response", "bad response",
    "regenerate", "read aloud", "share", "more",
    "stop generating", "continue generating", "retry",
  ]);

  function cleanMessageText(rawText) {
    if (!rawText) return "";
    // Strip "ChatGPT said:" / "You said:" prefixes added by some UI modes
    let text = rawText
      .replace(/^ChatGPT said:\s*/i, "")
      .replace(/^You said:\s*/i, "");
    // Strip the ChatGPT footer disclaimer that trails every assistant message
    text = text.replace(/\s*ChatGPT can make mistakes[^]*$/i, "");
    // Drop lines that are pure action-bar button labels
    const lines = text.split("\n").filter((line) => {
      const lower = line.trim().toLowerCase();
      return lower.length > 0 && !_UI_NOISE_LINES.has(lower);
    });
    return lines.join("\n").trim();
  }

  // ── Code block extraction ─────────────────────────────────────────────────

  function extractCodeBlocks(node) {
    return Array.from(node.querySelectorAll("pre code")).map((el) => {
      const langMatch = el.className.match(/language-(\S+)/);
      const language  = langMatch ? langMatch[1] : "unknown";
      const code      = (el.innerText || el.textContent || "").trim();
      return { language, code };
    }).filter((b) => b.code.length > 0);
  }

  function extractCodeBlocksFromText(text) {
    const blocks = [];
    const re = /```([^\n`]*)\n?([\s\S]*?)```/g;
    let match;
    while ((match = re.exec(text || ""))) {
      const code = (match[2] || "").trim();
      if (!code) continue;
      blocks.push({
        language: (match[1] || "unknown").trim() || "unknown",
        code,
      });
    }
    return blocks;
  }

  // â”€â”€ ChatGPT data-layer bridge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  // ChatGPT virtualizes conversation DOM while scrolling. To avoid moving the
  // user's viewport, Engram also listens for conversation JSON already fetched
  // by the page. If the page data is unavailable, scan falls back to mounted
  // visible DOM nodes.

  function normalizeBridgeMessages(rawMessages) {
    if (!Array.isArray(rawMessages)) return [];

    return rawMessages
      .map((msg) => {
        const role = msg?.role === "assistant" ? "assistant" : msg?.role === "user" ? "user" : "";
        if (!role) return null;
        const text = typeof msg.text === "string" ? msg.text : "";
        return {
          role,
          text,
          codeBlocks: Array.isArray(msg.codeBlocks) ? msg.codeBlocks : extractCodeBlocksFromText(text),
          timestamp: msg.timestamp || Date.now(),
          platform: "chatgpt",
        };
      })
      .filter(Boolean);
  }

  function snapshotMatchesCurrentChat(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.messages) || !snapshot.messages.length) return false;

    const currentChatId = getChatId();
    const snapshotChatId = (snapshot.chatId || "").trim();
    if (currentChatId !== "unknown" && snapshotChatId) {
      return snapshotChatId === currentChatId;
    }

    try {
      const currentUrl = new URL(window.location.href);
      const sourceUrl = new URL(snapshot.pageUrl || snapshot.sourceUrl || window.location.href);
      return currentUrl.origin === sourceUrl.origin && currentUrl.pathname === sourceUrl.pathname;
    } catch (_) {
      return false;
    }
  }

  function persistDataLayerSnapshot(snapshot) {
    latestDataLayerSnapshot = snapshot;
    let stored = false;

    try {
      const encoded = JSON.stringify(snapshot);
      if (encoded.length <= CHATGPT_SESSION_LIMIT) {
        sessionStorage.setItem(CHATGPT_SESSION_KEY, encoded);
        stored = true;
      } else {
        sessionStorage.removeItem(CHATGPT_SESSION_KEY);
        console.log("[Engram][ChatGPT] data-layer snapshot kept in memory only; too large for sessionStorage");
      }
    } catch (err) {
      console.warn("[Engram][ChatGPT] could not persist data-layer snapshot", err);
    }

    return stored;
  }

  function readSnapshotFromSession(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn("[Engram][ChatGPT] could not read data-layer snapshot", err);
      return null;
    }
  }

  function getMatchingDataLayerSnapshot() {
    if (snapshotMatchesCurrentChat(latestDataLayerSnapshot)) {
      return latestDataLayerSnapshot;
    }

    for (const key of [CHATGPT_SESSION_KEY, CHATGPT_PAGE_SESSION_KEY]) {
      const snapshot = readSnapshotFromSession(key);
      if (snapshotMatchesCurrentChat(snapshot)) {
        latestDataLayerSnapshot = snapshot;
        return snapshot;
      }
    }

    return null;
  }

  function handleBridgeMessage(event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== CHATGPT_BRIDGE_SOURCE) return;
    if (data.type !== CHATGPT_BRIDGE_EVENT && data.type !== CHATGPT_LEGACY_EVENT) return;

    const bridgeSnapshot = data.snapshot || data;
    const messages = normalizeBridgeMessages(bridgeSnapshot.messages || data.messages);
    if (!messages.length) return;

    const snapshot = {
      chatId: data.chatId || bridgeSnapshot.chatId || "unknown",
      sourceTitle: bridgeSnapshot.title || data.title || null,
      pageUrl: bridgeSnapshot.pageUrl || data.pageUrl || window.location.href,
      sourceUrl: bridgeSnapshot.sourceUrl || data.sourceUrl || "",
      capturedAt: bridgeSnapshot.capturedAt || data.capturedAt || Date.now(),
      messages,
    };

    const stored = persistDataLayerSnapshot(snapshot);
    // Set baseline so dirty observer knows initial hydration is done for this chat
    if (snapshotMatchesCurrentChat(snapshot)) {
      _snapshotBaselineAt = snapshot.capturedAt;
    }
    console.log(
      "[Engram][ChatGPT] data-layer snapshot captured:",
      `chat=${snapshot.chatId}`,
      `messages=${messages.length}`,
      `source=${snapshot.sourceUrl || "unknown"}`,
      `sessionStored=${stored ? "yes" : "no"}`
    );
  }

  if (!window.__ENGRAM_CHATGPT_CONTENT_BRIDGE__) {
    window.__ENGRAM_CHATGPT_CONTENT_BRIDGE__ = true;
    window.addEventListener("message", handleBridgeMessage);
    console.log("[Engram][ChatGPT] listening for page-world bridge snapshots");
  }

  // ── Dirty-state tracking ──────────────────────────────────────────────────
  // _chatDirty is set by:
  //   1. MutationObserver: a [data-message-author-role] node was added since last accepted snapshot
  //   2. Hash check in performScan: visible last-message differs from snapshot's last message
  // Cleared when a fresh snapshot is accepted.

  const SNAPSHOT_RECENT_MS  = 5 * 60 * 1000; // 5 min — beyond this, always re-fetch regardless of dirty
  const HYDRATION_GRACE_MS  = 5_000;         // ignore DOM mutations within 5 s of snapshot acceptance

  function isSnapshotRecent(snapshot) {
    if (!snapshot?.capturedAt) return false;
    return (Date.now() - snapshot.capturedAt) < SNAPSHOT_RECENT_MS;
  }

  // Fingerprint of the last non-empty message in an array (first+last 40 chars + length).
  function _lastMsgFingerprint(messages) {
    if (!Array.isArray(messages)) return "";
    for (let i = messages.length - 1; i >= 0; i--) {
      const t = (messages[i]?.text || "").trim();
      if (t.length > 0) return t.slice(0, 40) + "|" + t.slice(-40) + "|" + t.length;
    }
    return "";
  }

  // Fingerprint of the last visible [data-message-author-role] node in the DOM.
  function _visibleLastMsgFingerprint() {
    const nodes = document.querySelectorAll("[data-message-author-role]");
    if (!nodes.length) return "";
    const last = nodes[nodes.length - 1];
    const role = last.getAttribute("data-message-author-role");
    if (role !== "user" && role !== "assistant") return "";
    const contentEl = getContentElement(role, last);
    const rawText = contentEl
      ? (contentEl.innerText || contentEl.textContent || "").trim()
      : cleanMessageText((last.innerText || last.textContent || "").trim());
    return rawText.slice(0, 40) + "|" + rawText.slice(-40) + "|" + rawText.length;
  }

  // Adaptive timeout based on how large the cached snapshot already is.
  // When no cache exists, fall back to visible DOM node count as a size proxy.
  function _adaptiveTimeout(cachedSnap, domNodeCount) {
    const rawCount   = cachedSnap?.messages?.length || 0;
    const totalChars = Array.isArray(cachedSnap?.messages)
      ? cachedSnap.messages.reduce((s, m) => s + (m.text?.length || 0), 0)
      : 0;
    if (rawCount >= 300 || totalChars >= 300_000) return 20_000; // huge
    if (rawCount >= 80  || totalChars >= 80_000)  return 10_000; // medium
    if (!cachedSnap) {
      const dn = domNodeCount || 0;
      if (dn >= 200) return 20_000; // heavy DOM, no prior cache
      if (dn >= 100) return 10_000;
    }
    return 4_000; // small
  }

  // MutationObserver: mark dirty when a new [data-message-author-role] node appears.
  // Only fires after an accepted snapshot baseline exists AND the hydration grace
  // window has elapsed — this prevents initial ChatGPT DOM hydration from
  // immediately marking the chat dirty and forcing an unnecessary network fetch.
  function _startDirtyObserver() {
    const target = document.body || document.documentElement;
    if (!target) {
      document.addEventListener("DOMContentLoaded", () => _startDirtyObserver(), { once: true });
      return;
    }
    let _hydrationLogDone = false;
    const observer = new MutationObserver((mutations) => {
      if (_chatDirty) return;
      // No accepted snapshot yet, or within the hydration grace window: ignore
      if (!_snapshotBaselineAt || Date.now() < _snapshotBaselineAt + HYDRATION_GRACE_MS) {
        if (!_hydrationLogDone) {
          _hydrationLogDone = true;
          const reason = !_snapshotBaselineAt ? "no-snapshot-baseline" : "hydration-window";
          console.log("[Engram][ChatGPT] dirty ignored during initial render reason=" + reason);
        }
        return;
      }
      _hydrationLogDone = false; // reset so next hydration period logs once
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (
            (node.matches && node.matches("[data-message-author-role]")) ||
            (node.querySelector && node.querySelector("[data-message-author-role]"))
          ) {
            _chatDirty = true;
            console.log("[Engram][ChatGPT] chat marked dirty reason=dom-mutation");
            return;
          }
        }
      }
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  // ── Content element selection ─────────────────────────────────────────────
  //
  // Returns the tightest content container inside a [data-message-author-role]
  // node so that action-bar text (Copy, Edit, Thumbs up/down, Regenerate …)
  // which lives in sibling elements is never included in the extracted text.
  // Returns null when no specific content element is found — the caller then
  // uses the full role node with cleanMessageText() applied.

  function getContentElement(role, roleNode) {
    if (role === "user") {
      return (
        roleNode.querySelector(".whitespace-pre-wrap")          ||
        roleNode.querySelector("[class*='whitespace-pre-wrap']") ||
        null
      );
    }
    // Assistant: prose / markdown container
    return (
      roleNode.querySelector(".markdown")          ||
      roleNode.querySelector("[class*='prose']")   ||
      roleNode.querySelector("[class*='markdown']") ||
      null
    );
  }

  // ── Message extraction ────────────────────────────────────────────────────
  //
  // Single strategy: [data-message-author-role] direct query + DOM-position
  // sort. Article-based selectors (article[data-testid]) are intentionally
  // avoided — ChatGPT changes element types and testid values frequently,
  // while data-message-author-role has been stable across DOM revisions.

  function extractMessages() {
    // Count contract: every visible user/assistant role node is one Engram
    // message. Text extraction quality must not decide whether a visible role
    // node exists as a message.
    const roleNodes = Array.from(
      document.querySelectorAll("[data-message-author-role]")
    );

    console.log("[Engram][ChatGPT] extraction strategy: role-attr-direct");
    console.log("[Engram][ChatGPT] candidates found:", roleNodes.length);

    // Sort top-to-bottom = ascending DOM order = chronological
    roleNodes.sort((a, b) => {
      if (a === b) return 0;
      return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });

    const messages  = [];
    const seenNodes = new WeakSet();

    for (const node of roleNodes) {
      // Deduplicate — same DOM node should never appear twice
      if (seenNodes.has(node)) continue;
      seenNodes.add(node);

      const role = node.getAttribute("data-message-author-role");
      if (role !== "user" && role !== "assistant") continue;

      // Skip hidden / alternate message versions ChatGPT renders for a11y.
      if (!isVisibleRoleNode(node)) continue;

      const contentEl = getContentElement(role, node);

      let rawText;
      if (contentEl) {
        // Preferred path: specific content element excludes action bar naturally
        rawText = (contentEl.innerText || contentEl.textContent || "").trim();
      } else {
        // Fallback: read the whole role node but strip button-label noise
        rawText = (node.innerText || node.textContent || "").trim();
      }

      const cleanedText = cleanMessageText(rawText);
      const codeBlocks = extractCodeBlocks(node);
      messages.push({
        role,
        text:       cleanedText,
        codeBlocks,
        timestamp:  Date.now(),
        platform:   "chatgpt",
      });
    }
    const userCount = messages.filter((m) => m.role === "user").length;
    const aiCount   = messages.filter((m) => m.role === "assistant").length;
    const codeCount = messages.flatMap((m) => m.codeBlocks).length;
    console.log(
      `[Engram][ChatGPT] messages extracted: user=${userCount} ai=${aiCount} total=${messages.length} code=${codeCount}`
    );

    return messages;
  }

  // ── Chat metadata ─────────────────────────────────────────────────────────

  function getChatId() {
    const match = window.location.pathname.match(/\/c\/([a-z0-9-]+)/i);
    return match ? match[1] : "unknown";
  }

  function getChatTitle() {
    const sidebarSelectors = [
      '[aria-current="page"]',
      '[aria-selected="true"]',
      'nav [data-active="true"]',
    ];
    for (const sel of sidebarSelectors) {
      try {
        const el = document.querySelector(sel);
        if (!el) continue;
        const t = (el.innerText || el.textContent || "").trim();
        if (t && t.length > 1 && !/^chatgpt$/i.test(t)) return t;
      } catch (_) {}
    }
    const raw = (document.title || "").trim();
    if (raw) {
      const cleaned = raw.replace(/\s*[-–|]\s*ChatGPT\s*$/i, "").trim();
      if (cleaned && cleaned.length > 1 && !/^chatgpt$/i.test(cleaned)) return cleaned;
    }
    return null;
  }

  // ── Content metadata ──────────────────────────────────────────────────────
  // Optional extra fields appended to ENGRAM_SCAN_COMPLETE.
  // These help popup.js surface content-density issues that DOM message count
  // alone misses (e.g. a single message containing a pasted transcript).
  // All fields are optional — Claude parser does not send them; popup handles
  // their absence with || 0 / || false fallbacks.

  function computeContentMetadata(messages) {
    if (!messages.length) return {};

    const lens = messages.map((m) => (m.text || "").length);
    const longestMessageChars = Math.max(...lens);
    const averageMessageChars = Math.round(lens.reduce((a, b) => a + b, 0) / lens.length);
    const largeMessageCount   = lens.filter((l) => l >= 2000).length;
    const veryLargeMessageCount = lens.filter((l) => l >= 5000).length;
    const hugeMessageCount = lens.filter((l) => l >= 10000).length;

    // Embedded transcript: any message with 3+ repeated speaker-turn markers.
    // Matches: "User:", "**User**:", "Assistant:", "**Assistant**:", "ChatGPT:", "Human:", "AI:"
    const TURN_MARKER = /(?:^|\n)\s*\*{0,2}(?:User|Assistant|Human|AI|ChatGPT)\*{0,2}\s*:/gim;
    let embeddedTranscriptDetected = false;
    let estimatedLogicalTurns = 0;

    for (const msg of messages) {
      const m = (msg.text || "").match(TURN_MARKER);
      if (m && m.length >= 3) {
        embeddedTranscriptDetected = true;
        estimatedLogicalTurns += m.length;
      }
    }

    const result = {
      longestMessageChars,
      averageMessageChars,
      largeMessageCount,
      veryLargeMessageCount,
      hugeMessageCount,
      embeddedTranscriptDetected,
      likelyEmbeddedTranscript: embeddedTranscriptDetected,
    };
    if (embeddedTranscriptDetected && estimatedLogicalTurns > 0) {
      result.estimatedLogicalTurns = estimatedLogicalTurns;
    }
    return result;
  }

  // ── Fresh snapshot helpers ────────────────────────────────────────────────
  //
  // _ensureFreshFetch posts a "fetch-conversation" to the page-world bridge and
  // returns a promise that resolves when a fresh matching snapshot arrives.
  // The promise has NO built-in timeout — callers race it against _timeoutPromise.
  // Multiple callers for the same chatId reuse the same in-flight promise (dedupe).
  // The background fetch continues even after the caller's soft budget expires.

  function _timeoutPromise(ms) {
    return new Promise((resolve) => setTimeout(() => resolve(null), ms));
  }

  // Interactive soft budget: how long to wait before returning cached/DOM result.
  // The background fetch keeps running after this expires.
  // When no cache exists, DOM node count proxies the chat size so heavy chats
  // get enough time for the API fetch to complete instead of falling back to a
  // partial virtualized-DOM extraction.
  function _softBudget(cachedSnap, domNodeCount) {
    const rawCount   = cachedSnap?.messages?.length || 0;
    const totalChars = Array.isArray(cachedSnap?.messages)
      ? cachedSnap.messages.reduce((s, m) => s + (m.text?.length || 0), 0) : 0;
    if (rawCount >= 300 || totalChars >= 300_000) return 18_000; // huge: allow long wait
    if (rawCount >= 80  || totalChars >= 80_000)  return 1_500;  // medium: 1.5 s
    if (!cachedSnap) {
      // No prior snapshot — use DOM node count as size proxy for first-scan heavy chats.
      // 800 ms was too short for heavy chats where API fetch takes 1-5 s.
      const dn = domNodeCount || 0;
      if (dn >= 200) return 12_000; // huge DOM → long wait
      if (dn >= 100) return  6_000; // large DOM → moderate wait
    }
    return 800; // small: 0.8 s
  }

  function _ensureFreshFetch(chatId) {
    if (!chatId || chatId === "unknown") return Promise.resolve(null);

    // Dedupe: reuse in-flight promise for the same chatId
    if (_freshSnapInFlight && _freshSnapInFlight.chatId === chatId) {
      console.log("[Engram][ChatGPT] reusing in-flight fresh snapshot chat=" + chatId);
      return _freshSnapInFlight.promise;
    }

    // Cancel any stale in-flight for a different chatId
    if (_freshSnapInFlight) {
      _freshSnapInFlight.cancel();
      _freshSnapInFlight = null;
    }

    const requestedAt = Date.now();
    let cancelled = false;
    let resolveSnap;
    const promise = new Promise((resolve) => { resolveSnap = resolve; });

    function onFreshMessage(event) {
      if (cancelled) { window.removeEventListener("message", onFreshMessage); return; }
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== CHATGPT_BRIDGE_SOURCE) return;
      if (data.type !== CHATGPT_BRIDGE_EVENT && data.type !== CHATGPT_LEGACY_EVENT) return;

      // handleBridgeMessage (registered first) has already updated latestDataLayerSnapshot
      const snap         = latestDataLayerSnapshot;
      const snapChatId   = snap?.chatId || "unknown";
      const snapRaw      = snap?.messages?.length ?? 0;
      const snapCaptured = snap?.capturedAt || 0;

      console.log(
        "[Engram][ChatGPT] fresh snapshot candidate received",
        `chat=${snapChatId}`, `raw=${snapRaw}`,
        `capturedAt=${snapCaptured}`, `requestedAt=${requestedAt}`
      );

      if (!snap || !snapshotMatchesCurrentChat(snap)) {
        console.log("[Engram][ChatGPT] fresh snapshot rejected reason=chat-mismatch");
        return;
      }
      if (snapCaptured < requestedAt) {
        console.log(
          "[Engram][ChatGPT] fresh snapshot rejected reason=stale-capturedAt",
          `capturedAt=${snapCaptured} < requestedAt=${requestedAt}`
        );
        return;
      }

      window.removeEventListener("message", onFreshMessage);
      if (_freshSnapInFlight?.chatId === chatId) _freshSnapInFlight = null;
      _chatDirty = false;
      _snapshotBaselineAt = snap.capturedAt;
      console.log("[Engram][ChatGPT] fresh snapshot accepted; dirty=false");
      resolveSnap(snap);
    }

    window.addEventListener("message", onFreshMessage);
    _freshSnapInFlight = { chatId, promise, cancel: () => { cancelled = true; } };
    window.postMessage({ source: "engram-content-script", type: "fetch-conversation", chatId }, "*");
    console.log("[Engram][ChatGPT] fresh snapshot refresh started in background");

    return promise;
  }

  // ── Scan ──────────────────────────────────────────────────────────────────

  async function performScan(mode) {
    const isExport = (mode === "export");
    console.log("[Engram][ChatGPT] scan requested");
    const t0 = performance.now();

    let extractionStrategy  = "visible-dom-fallback";
    let partial             = true;
    let messages;
    let dataLayerSnapshot   = null; // hoisted so the return object can always reference it

    // Tier 1: background network snapshot (filterResponseData — most complete)
    let bgSnapshot = latestBGNetworkSnapshot;
    if (!bgSnapshot || !snapshotMatchesCurrentChat(bgSnapshot)) {
      try {
        const r = await runtime.sendMessage({
          type: "ENGRAM_GET_CHATGPT_SNAPSHOT",
          chatId: getChatId(),
        });
        if (r?.snapshot && snapshotMatchesCurrentChat(r.snapshot)) {
          bgSnapshot = r.snapshot;
          latestBGNetworkSnapshot = bgSnapshot;
        }
      } catch (_) {}
    }

    _dbg("tier1 BG snapshot", { available: !!bgSnapshot, matches: bgSnapshot ? snapshotMatchesCurrentChat(bgSnapshot) : false,
      chatId: bgSnapshot?.chatId, msgs: bgSnapshot?.messages?.length });

    if (bgSnapshot && snapshotMatchesCurrentChat(bgSnapshot)) {
      messages = bgSnapshot.messages;
      extractionStrategy = "chatgpt-background-network";
      partial = false;
      console.log(
        "[Engram][ChatGPT] using background network snapshot:",
        `messages=${messages.length}`,
        `chatId=${bgSnapshot.chatId}`
      );
    } else {
      // ── Tier 2 / 3: data-layer snapshot or DOM fallback ──────────────────
      const freshChatId   = getChatId();
      const cachedSnap    = getMatchingDataLayerSnapshot();
      // Compute DOM node count here so _softBudget/_adaptiveTimeout can use it
      // to size the wait budget for heavy first-scan chats (no cache available).
      const domNodeCount  = document.querySelectorAll("[data-message-author-role]").length;

      // Hash-based dirty check
      if (!_chatDirty && cachedSnap) {
        const snapFp = _lastMsgFingerprint(cachedSnap.messages);
        const domFp  = _visibleLastMsgFingerprint();
        if (snapFp && domFp && snapFp !== domFp) {
          _chatDirty = true;
          console.log("[Engram][ChatGPT] chat marked dirty reason=last-msg-hash-mismatch");
        }
      }

      const snapshotIsRecent = isSnapshotRecent(cachedSnap);
      const needFresh        = _chatDirty || !snapshotIsRecent;
      const baseTimeoutMs    = _adaptiveTimeout(cachedSnap, domNodeCount);
      const softBudgetMs     = _softBudget(cachedSnap, domNodeCount);
      const waitBudgetMs     = isExport ? baseTimeoutMs : softBudgetMs;
      const tierLabel        = baseTimeoutMs >= 15_000 ? "huge" : baseTimeoutMs >= 8_000 ? "medium" : "small";

      console.log(
        "[Engram][ChatGPT] scan",
        `mode=${isExport ? "export" : "interactive"}`,
        `dirty=${_chatDirty}`,
        `recent=${snapshotIsRecent}`,
        `tier=${tierLabel}`,
        `domNodes=${domNodeCount}`,
        `softBudget=${softBudgetMs}ms`,
        `hardTimeout=${baseTimeoutMs}ms`
      );
      _dbg("scan start", { chatId: freshChatId, url: location.href, mode: isExport ? "export" : "interactive",
        domNodes: domNodeCount, cachedSnap: !!cachedSnap, dirty: _chatDirty, recent: snapshotIsRecent });

      if (!needFresh) {
        // Clean + recent: use immediately, no network fetch
        if (cachedSnap) {
          dataLayerSnapshot = cachedSnap;
          messages = cachedSnap.messages;
          extractionStrategy = "chatgpt-data-layer";
          partial = false;
          console.log("[Engram][ChatGPT] fast scan using cached snapshot");
          _dbg("source=data-layer-cache", { msgs: messages.length });
        } else {
          messages = extractMessages();
          console.log("[Engram][ChatGPT] fast scan using visible DOM bootstrap");
          _dbg("source=dom-fast", { msgs: messages.length });
        }
      } else {
        if (!isExport && !cachedSnap && domNodeCount < 100) {
          // Interactive, no prior cache, small visible DOM.
          // Extract DOM first for fast response on small/short chats.
          messages = extractMessages();
          console.log("[Engram][ChatGPT] fast scan using visible DOM bootstrap");
          _dbg("source=dom-fast-attempt", { msgs: messages.length, domNodes: domNodeCount });

          if (messages.length === 0 && freshChatId !== "unknown") {
            // DOM returned nothing but chatId is valid — heavy chat whose DOM hasn't
            // rendered yet (SPA hydration lag) or whose initial fetch was served by a
            // service worker before the page-bridge loaded.
            // Trigger an explicit API fetch and wait for the real snapshot instead of
            // returning a zero-count partial that would show incorrect health in the popup.
            const zeroDomBudget = 10_000;
            console.log(
              "[Engram][ChatGPT] DOM=0 with valid chatId — awaiting fresh snapshot",
              `chat=${freshChatId}`, `budget=${zeroDomBudget}ms`
            );
            _dbg("zero-dom-rescue start", { chatId: freshChatId, budget: zeroDomBudget });
            const freshSnap = await Promise.race([
              _ensureFreshFetch(freshChatId),
              _timeoutPromise(zeroDomBudget),
            ]);
            if (freshSnap) {
              dataLayerSnapshot = freshSnap;
              messages = freshSnap.messages;
              extractionStrategy = "chatgpt-data-layer";
              partial = false;
              console.log("[Engram][ChatGPT] zero-DOM rescue: fresh snapshot msgs=" + messages.length);
              _dbg("zero-dom-rescue resolved", { msgs: messages.length });
            } else {
              // Last chance: session storage may have been updated while we waited
              dataLayerSnapshot = getMatchingDataLayerSnapshot();
              if (dataLayerSnapshot) {
                messages = dataLayerSnapshot.messages;
                extractionStrategy = "chatgpt-data-layer";
                partial = false;
                console.log("[Engram][ChatGPT] zero-DOM rescue: session snapshot found msgs=" + messages.length);
                _dbg("zero-dom-rescue session", { msgs: messages.length });
              } else {
                console.log("[Engram][ChatGPT] zero-DOM rescue timed out — likely genuine new/empty chat");
                _dbg("zero-dom-rescue timeout", { budget: zeroDomBudget });
              }
            }
          } else if (freshChatId !== "unknown") {
            _ensureFreshFetch(freshChatId); // pre-warm for next scan
          }
        } else {
          // Race fresh fetch against budget.
          // Interactive: soft budget (returns cached/DOM if expires; fetch continues).
          // Export: hard timeout (waits longer for correctness).
          console.log(`[Engram][ChatGPT] requesting fresh conversation snapshot for scan chat=${freshChatId}`);
          _dbg("fresh-fetch start", { chatId: freshChatId, budget: waitBudgetMs, domNodes: domNodeCount });
          let freshSnap = null;
          if (freshChatId !== "unknown") {
            freshSnap = await Promise.race([
              _ensureFreshFetch(freshChatId),
              _timeoutPromise(waitBudgetMs),
            ]);
          }

          if (freshSnap) {
            console.log(
              "[Engram][ChatGPT] fresh conversation snapshot received:",
              `raw=${freshSnap.messages?.length}`, `capturedAt=${freshSnap.capturedAt}`
            );
            _dbg("fresh-fetch resolved", { msgs: freshSnap.messages?.length });
          } else if (isExport) {
            console.log("[Engram][ChatGPT] fresh snapshot timeout; using cached snapshot");
            _dbg("fresh-fetch hard-timeout", { budget: waitBudgetMs });
          } else {
            console.log("[Engram][ChatGPT] fresh snapshot soft timeout; using cached/dom result");
            _dbg("fresh-fetch soft-timeout", { budget: waitBudgetMs, domNodes: domNodeCount });
          }

          // Tier 2: page-bridge snapshot (fresh if fetch resolved, cached otherwise)
          dataLayerSnapshot = getMatchingDataLayerSnapshot();
          if (dataLayerSnapshot) {
            messages = dataLayerSnapshot.messages;
            extractionStrategy = "chatgpt-data-layer";
            partial = false;
            console.log(
              "[Engram][ChatGPT] using data-layer snapshot:",
              `messages=${messages.length}`, `capturedAt=${dataLayerSnapshot.capturedAt || "unknown"}`
            );
            _dbg("source=data-layer", { msgs: messages.length });
          } else {
            // Tier 3: visible DOM fallback (incomplete for virtualized heavy chats)
            messages = extractMessages();
            console.log("[Engram][ChatGPT] no snapshot available; using visible DOM fallback (partial)");
            _dbg("source=dom-fallback", { msgs: messages.length, domNodes: domNodeCount });
          }
        }
      }
    }

    const scanDuration = Math.round(performance.now() - t0);

    // Pass 1: filter structural/null nodes (empty text AND no code blocks).
    const rawNodeCount   = messages.length;
    const rawMessages    = messages; // preserve all active-chain nodes
    const afterEmpty     = messages.filter((m) => {
      const hasText = (m.text || "").trim().length > 0;
      const hasCode = Array.isArray(m.codeBlocks) && m.codeBlocks.length > 0;
      return hasText || hasCode;
    });
    const filteredOutEmpty = rawNodeCount - afterEmpty.length;

    // Pass 2: filter assistant tool-call JSON blobs.
    // These are assistant turns whose text is a JSON object whose top-level
    // keys are internal ChatGPT tool dispatch keys (not user-visible content).
    const TOOL_KEYS = new Set([
      "search_query", "open", "click", "find", "screenshot", "image_query",
      "product_query", "finance", "weather", "sports", "calculator", "time",
      "response_length", "ref_id",
    ]);
    const displayMessages = afterEmpty.filter((m) => {
      if (m.role !== "assistant") return true;
      const trimmed = (m.text || "").trim();
      if (!trimmed.startsWith("{")) return true;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return !Object.keys(parsed).some((k) => TOOL_KEYS.has(k));
        }
      } catch (_) {}
      return true;
    });
    const filteredOutToolJson = afterEmpty.length - displayMessages.length;

    if (filteredOutEmpty > 0 || filteredOutToolJson > 0) {
      console.log(`[Engram][ChatGPT] data-layer raw nodes: ${rawNodeCount}`);
      console.log(`[Engram][ChatGPT] filtered display messages: ${displayMessages.length}`);
      if (filteredOutEmpty    > 0) console.log(`[Engram][ChatGPT] filtered out empty: ${filteredOutEmpty}`);
      if (filteredOutToolJson > 0) console.log(`[Engram][ChatGPT] filtered out tool json: ${filteredOutToolJson}`);
    }

    const userMessages  = displayMessages.filter((m) => m.role === "user");
    const aiMessages    = displayMessages.filter((m) => m.role === "assistant");
    const codeBlocks    = displayMessages.flatMap((m) => m.codeBlocks || []);
    const totalChars    = displayMessages.reduce((sum, m) => sum + (m.text?.length || 0), 0);
    const renderedNodes = document.querySelectorAll("[data-message-author-role]").length;
    const contentMeta   = computeContentMetadata(displayMessages);
    const currentChatId = getChatId();

    console.log(
      `[Engram][ChatGPT] scan complete: user=${userMessages.length} ai=${aiMessages.length}` +
      ` total=${displayMessages.length} code=${codeBlocks.length} chars=${totalChars} ms=${scanDuration}` +
      (rawNodeCount > displayMessages.length ? ` raw=${rawNodeCount}` : "") +
      (contentMeta.embeddedTranscriptDetected ? " [transcript-detected]" : "") +
      (contentMeta.largeMessageCount ? ` large-msgs=${contentMeta.largeMessageCount}` : "")
    );

    return {
      type:         "ENGRAM_SCAN_COMPLETE",
      userCount:    userMessages.length,
      aiCount:      aiMessages.length,
      total:        displayMessages.length,
      codeCount:    codeBlocks.length,
      messages:     displayMessages,
      displayMessages,
      displayMessageCount: displayMessages.length,
      rawMessages,
      rawNodeCount,
      filteredOutEmpty,
      filteredOutToolJson,
      chatId:       currentChatId !== "unknown" ? currentChatId : dataLayerSnapshot?.chatId || "unknown",
      sourceTitle:  dataLayerSnapshot?.sourceTitle || getChatTitle(),
      scanDuration,
      totalChars,
      domSize:      document.querySelectorAll("*").length,
      renderedNodes,
      url:          window.location.href,
      scannedAt:    Date.now(),
      platform:     "chatgpt",
      extractionStrategy,
      partial,
      dataLayerSnapshotAvailable: Boolean(dataLayerSnapshot),
      dataLayerCapturedAt: dataLayerSnapshot?.capturedAt || null,
      dataLayerSourceUrl:  dataLayerSnapshot?.sourceUrl || null,
      ...contentMeta,
    };
  }

  // ── Message handler ───────────────────────────────────────────────────────

  runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Background push: network-captured conversation snapshot
    if (msg.type === "ENGRAM_CHATGPT_BG_SNAPSHOT") {
      if (msg.snapshot) {
        latestBGNetworkSnapshot = msg.snapshot;
        console.log(
          "[Engram][ChatGPT] background network snapshot received:",
          `chatId=${msg.snapshot.chatId}`,
          `messages=${msg.snapshot.messages?.length}`
        );
      }
      if (isFirefox) return Promise.resolve({ ok: true });
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type !== "ENGRAM_START_SCAN") return;

    const scanMode = msg.mode || "interactive";
    _dbg("ENGRAM_START_SCAN received", { mode: scanMode, url: location.href, chatId: getChatId() });
    const response = Promise.resolve()
      .then(() => performScan(scanMode))
      .then((result) => {
        console.log(
          "[Engram][ChatGPT] sending messages to background:",
          `total=${result.total}`,
          `strategy=${result.extractionStrategy}`,
          `partial=${result.partial}`
        );
        return result;
      })
      .then((result) => {
        console.log("[Engram][ChatGPT] background send success");
        return result;
      })
      .catch((err) => {
        console.error("[Engram][ChatGPT] background send failed:", err.message || String(err));
        return {
          type: "ENGRAM_SCAN_COMPLETE",
          userCount: 0, aiCount: 0, total: 0, codeCount: 0,
          messages: [], chatId: "unknown", sourceTitle: null,
          scanDuration: 0, totalChars: 0, domSize: 0, renderedNodes: 0,
          url: window.location.href, scannedAt: Date.now(), platform: "chatgpt",
          extractionStrategy: "chatgpt-scan-error",
          error: err.message || String(err),
        };
      });

    if (isFirefox) {
      return response;
    }

    response.then(sendResponse);
    return true;
  });

  // ── Mini Health Widget ────────────────────────────────────────────────────
  // Ported from platforms/claude/parser.js.
  // Two ChatGPT-specific substitutions only:
  //   captureDomMessages() → extractMessages()
  //   getCurrentChatId()   → getChatId()
  // Everything else (CSS, HTML, drag, storage, lifecycle) is identical.

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
  let _wPos       = null;
  let _wSnapshot  = null;
  let _wSnapshotsByChatId = {};

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

    const currentChatId = getChatId();   // ChatGPT: getChatId() not getCurrentChatId()
    if (
      snapshot.chatId &&
      snapshot.chatId !== "unknown" &&
      currentChatId &&
      currentChatId !== "unknown"
    ) {
      return snapshot.chatId === currentChatId;
    }

    const savedUrl   = _wNormalizeUrl(snapshot.sourceUrl || "");
    const currentUrl = _wNormalizeUrl(window.location.href);
    return !!savedUrl && savedUrl === currentUrl;
  }

  function _wCurrentSnapshotKeys() {
    const keys = [];
    const currentChatId = getChatId();   // ChatGPT: getChatId()
    if (currentChatId && currentChatId !== "unknown") keys.push("chat:" + currentChatId);

    const currentUrl = _wNormalizeUrl(window.location.href);
    if (currentUrl) keys.push("url:" + currentUrl);

    return keys;
  }

  function _wFindExactSnapshot() {
    const keys = _wCurrentSnapshotKeys();
    for (const key of keys) {
      if (_wSnapshotsByChatId[key] && _wMatchesCurrentChat(_wSnapshotsByChatId[key])) {
        return _wSnapshotsByChatId[key];
      }
    }
    return _wMatchesCurrentChat(_wSnapshot) ? _wSnapshot : null;
  }

  function _wSnapshotColor(label) {
    if (label === "Safe")  return "#22c55e";
    if (label === "Good")  return "#84cc16";
    if (label === "Fair")  return "#f59e0b";
    if (label === "Risky") return "#f97316";
    return "#ef4444";
  }

  function _wFormatTime(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function _wLiveStatus(total, code) {
    if (total >= 250 || code >= 80)  return { label: "Critical", color: "#ef4444" };
    if (total >= 120 || code >= 30)  return { label: "Risky",    color: "#f97316" };
    if (total >= 60  || code >= 10)  return { label: "Fair",     color: "#f59e0b" };
    return { label: "Safe", color: "#22c55e" };
  }

  function _wLiveStats() {
    const msgs = extractMessages();    // ChatGPT: extractMessages() not captureDomMessages()
    const total = msgs.length;
    if (!total) return { mode: "empty", hasData: false };

    const user   = msgs.filter(m => m.role === "user").length;
    const ai     = msgs.filter(m => m.role === "assistant").length;
    const code   = msgs.flatMap(m => m.codeBlocks || []).length;
    const status = _wLiveStatus(total, code);

    return {
      mode:     "live",
      hasData:  true,
      total, user, ai, code,
      label:    status.label,
      color:    status.color,
      source:   "Visible chat activity",
      accuracy: "Estimated",
      hint:     "Full scan creates handoff-ready report.",
    };
  }

  function _wStats() {
    const exactSnapshot = _wFindExactSnapshot();
    if (!exactSnapshot) return _wLiveStats();

    const stats = exactSnapshot.stats || {};
    const label = exactSnapshot.healthLabel || exactSnapshot.statusLabel || "Not scanned";
    return {
      mode:     "exact",
      hasData:  true,
      total:    stats.total     || 0,
      user:     stats.userCount || 0,
      ai:       stats.aiCount   || 0,
      code:     stats.codeCount || 0,
      label,
      color:    exactSnapshot.healthColor || _wSnapshotColor(label),
      risk:     exactSnapshot.migrationRisk || "—",
      load:     exactSnapshot.browserLoad   || "—",
      source:   "Last scan",
      time:     _wFormatTime(exactSnapshot.scannedAt),
      scannedAt: exactSnapshot.scannedAt || 0,
    };
  }

  function _wRender(st) {
    if (!_wEl) return;

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
        "<div class='ew-time'>Last scan: " + st.time + "</div>" +
      "</div>";
    _wEl.querySelector(".ew-close").onclick = _wToggle;
  }

  function _wUpdate() {
    if (!_wEl) return;
    const st  = _wStats();
    const key = st.hasData
      ? (st.mode + "|" + st.label + "|" + (st.risk || "") + "|" + (st.load || "") + "|" + st.total + "|" + st.user + "|" + st.ai + "|" + st.code + "|" + (st.scannedAt || "") + "|" + _wCollapsed)
      : ("empty|" + _wCollapsed);
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
      e.preventDefault();
    });

    _wEl.addEventListener("pointermove", (e) => {
      if (!_wDragging) return;
      const dx = e.clientX - _wDragStartX;
      const dy = e.clientY - _wDragStartY;
      if (!_wDragMoved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
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
        const rect = _wEl.getBoundingClientRect();
        _wApplyPos(rect.left, rect.top);
        _wSavePos();
      } else {
        const inBody = _wClickTarget && _wClickTarget.closest(".ew-body");
        if (!inBody) _wToggle();
      }
    });

    _wEl.addEventListener("pointercancel", () => {
      _wDragging = false;
      _wEl.style.cursor = "";
      if (_wRafId) { cancelAnimationFrame(_wRafId); _wRafId = null; }
    });

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

    try {
      const keys = [
        "engramWidgetCollapsed",
        "engramWidgetPos",
        "engramLastHealthSnapshot",
        "engramHealthSnapshotsByChatId",
      ];
      const cb = (result) => {
        if (result) {
          if ("engramWidgetCollapsed" in result) _wCollapsed = !!result.engramWidgetCollapsed;
          if ("engramLastHealthSnapshot" in result) _wSnapshot = result.engramLastHealthSnapshot || null;
          if ("engramHealthSnapshotsByChatId" in result) {
            _wSnapshotsByChatId = result.engramHealthSnapshotsByChatId || {};
          }
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

    try {
      const onChanged = isFirefox ? browser.storage.onChanged : chrome.storage.onChanged;
      onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes.engramSettings) return;
        const enabled = !!changes.engramSettings.newValue?.showMiniHealthWidget;
        if (enabled && !_wEl)  { _wEnabled = true; _wInject(); }
        if (!enabled && _wEl)  { _wRemove(); }
      });
      onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        let changed = false;
        if (changes.engramLastHealthSnapshot) {
          _wSnapshot = changes.engramLastHealthSnapshot.newValue || null;
          changed = true;
        }
        if (changes.engramHealthSnapshotsByChatId) {
          _wSnapshotsByChatId = changes.engramHealthSnapshotsByChatId.newValue || {};
          changed = true;
        }
        if (!changed) return;
        _wLastKey = "";
        if (_wEl) _wUpdate();
      });
    } catch (_) {}
  }

  // SPA navigation detection: ChatGPT switches chats via pushState without a full reload.
  // Poll every 500 ms; reset stale snapshot state when the URL changes.
  let _lastHref = location.href;
  setInterval(() => {
    const currentHref = location.href;
    if (currentHref === _lastHref) return;
    _lastHref = currentHref;
    latestBGNetworkSnapshot = null;  // stale — new chat needs fresh capture
    _chatDirty              = false; // new chat starts clean; MO re-arms automatically
    _snapshotBaselineAt     = null;  // reset so dirty observer ignores initial hydration
    if (_freshSnapInFlight) { _freshSnapInFlight.cancel(); _freshSnapInFlight = null; }
    _wLastKey = "";
    console.log(
      "[Engram][ChatGPT] SPA navigation detected",
      "chatId=" + getChatId(),
      "href=" + currentHref
    );
  }, 500);

  // Widget health tick: re-inject if React's reconciler removed the widget node.
  setInterval(() => {
    if (!_wEnabled) return;
    if (_wEl && !document.contains(_wEl)) {
      // Widget was removed from DOM (SPA re-render); clear reference so _wInject recreates it.
      _wEl = null;
    }
    if (!_wEl) {
      _wInject();
    } else {
      _wUpdate();
    }
  }, 3000);

  if (document.body) { _wBootstrap(); }
  else { document.addEventListener("DOMContentLoaded", _wBootstrap); }

  _startDirtyObserver();

})();
