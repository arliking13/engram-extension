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

  console.log("[Engram][ChatGPT] parser loaded");

  // ── Text helpers ──────────────────────────────────────────────────────────

  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function isMeaningful(text) {
    return normalizeText(text).length >= 2;
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

      // Skip hidden / alternate message versions ChatGPT renders for a11y
      if (node.getAttribute("aria-hidden") === "true") continue;
      if (node.closest("[aria-hidden='true']")) continue;

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
      if (!isMeaningful(cleanedText)) continue;

      // Extract code blocks from the content element if found, otherwise
      // from the role node — do not scan the whole article to avoid picking
      // up code from a neighbouring message.
      const codeSource = contentEl || node;

      messages.push({
        role,
        text:       cleanedText,
        codeBlocks: extractCodeBlocks(codeSource),
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

  // ── Scan ──────────────────────────────────────────────────────────────────

  function performScan() {
    console.log("[Engram][ChatGPT] scan requested");
    const t0 = performance.now();

    const messages     = extractMessages();
    const scanDuration = Math.round(performance.now() - t0);

    const userMessages  = messages.filter((m) => m.role === "user");
    const aiMessages    = messages.filter((m) => m.role === "assistant");
    const codeBlocks    = messages.flatMap((m) => m.codeBlocks || []);
    const totalChars    = messages.reduce((sum, m) => sum + (m.text?.length || 0), 0);
    const renderedNodes = document.querySelectorAll("[data-message-author-role]").length;
    const contentMeta   = computeContentMetadata(messages);

    console.log(
      `[Engram][ChatGPT] scan complete: user=${userMessages.length} ai=${aiMessages.length}` +
      ` total=${messages.length} code=${codeBlocks.length} chars=${totalChars} ms=${scanDuration}` +
      (contentMeta.embeddedTranscriptDetected ? " [transcript-detected]" : "") +
      (contentMeta.largeMessageCount ? ` large-msgs=${contentMeta.largeMessageCount}` : "")
    );

    return {
      type:         "ENGRAM_SCAN_COMPLETE",
      userCount:    userMessages.length,
      aiCount:      aiMessages.length,
      total:        messages.length,
      codeCount:    codeBlocks.length,
      messages,
      chatId:       getChatId(),
      sourceTitle:  getChatTitle(),
      scanDuration,
      totalChars,
      domSize:      document.querySelectorAll("*").length,
      renderedNodes,
      url:          window.location.href,
      scannedAt:    Date.now(),
      platform:     "chatgpt",
      ...contentMeta,
    };
  }

  // ── Message handler ───────────────────────────────────────────────────────

  runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "ENGRAM_START_SCAN") return;

    let result;
    try {
      result = performScan();
      console.log("[Engram][ChatGPT] sent messages to background:", result.total);
    } catch (err) {
      result = {
        type: "ENGRAM_SCAN_COMPLETE",
        userCount: 0, aiCount: 0, total: 0, codeCount: 0,
        messages: [], chatId: "unknown", sourceTitle: null,
        scanDuration: 0, totalChars: 0, domSize: 0, renderedNodes: 0,
        url: window.location.href, scannedAt: Date.now(), platform: "chatgpt",
        error: err.message || String(err),
      };
    }

    const response = Promise.resolve(result);

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

  // Widget refresh on its own 3s tick
  setInterval(() => { if (_wEnabled && _wEl) _wUpdate(); }, 3000);

  if (document.body) { _wBootstrap(); }
  else { document.addEventListener("DOMContentLoaded", _wBootstrap); }

})();
