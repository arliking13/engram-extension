# ChatGPT Extraction — Diagnostic Methodology

_Created 2026-05-24. Mirrors the Claude extraction stabilization process._

---

## Current Real Page Diagnostic

Target URL:

```text
https://chatgpt.com/c/69f14514-61b0-83ea-bd79-bca1352b3d08
```

DOM diagnostic from the real ChatGPT page:

| Metric | Count |
|---|---:|
| allRoleNodes | 19 |
| visibleRoleNodes | 19 |
| hiddenRoleNodes | 0 |
| visibleUser | 16 |
| visibleAssistant | 3 |
| allUser | 16 |
| allAssistant | 3 |
| codeBlocks | 108 |
| markdownHits | 3 |
| proseHits | 3 |
| userTextHits | 11 |

Expected Engram scan result for this page:

| Metric | Expected |
|---|---:|
| userCount | 16 |
| aiCount | 3 |
| total | 19 |
| codeCount | 108 |
| messages.length | 19 |

Observed previous mismatch:

| Metric | Previous Engram | Expected |
|---|---:|---:|
| userCount | 13 | 16 |
| aiCount | 3 | 3 |
| total | 16 | 19 |
| codeCount | 108 | 108 |

Mismatch checklist:

- If DOM visible role count is 19 but Engram total is lower, check for parser-side skips after text extraction.
- If `visibleUser` is 16 but user extraction is lower, do not rely on `.whitespace-pre-wrap`; only 11 user nodes matched that selector in this diagnostic.
- Empty or short visible user role nodes still count as messages.
- Code blocks must be counted from each visible role node, not from a global document query.
- After SPA navigation, rerun the DOM count and scan result; the URL chat ID and role nodes must belong to the current chat only.

Scroll coverage audit from the same chat:

| Scroll position | visibleRoleNodes | user | assistant | scoped code |
|---:|---:|---:|---:|---:|
| 0 | 23 | 17 | 6 | 126 |
| 0.25 | 21 | 16 | 5 | 121 |
| 0.5 | 24 | 17 | 7 | 146 |
| 0.75 | 20 | 16 | 4 | 129 |
| 1 | 22 | 17 | 5 | 121 |

Conclusion: ChatGPT can virtualize/remount conversation DOM while scrolling. A single visible DOM position is not always the full conversation. Engram must not force-scroll the page during Scan Chat, so the current architecture is:

- Prefer a local page data-layer snapshot captured from ChatGPT's own `fetch` / `XMLHttpRequest` responses.
- Install `extension/platforms/chatgpt/page-bridge.js` at `document_start` with manifest `world: "MAIN"` so the bridge wraps the page's real fetch/XHR before `/backend-api/conversation/<chatId>` loads.
- Keep `extension/platforms/chatgpt/parser.js` in the isolated content-script world as the snapshot receiver, popup scan responder, visible DOM fallback, and mini-widget owner.
- Use `Response.clone()` before reading response bodies so ChatGPT's app behavior is not disturbed.
- Match captured snapshots to the current `/c/{chatId}` URL before using them.
- Fall back to the currently mounted visible `[data-message-author-role]` DOM nodes when no matching data-layer snapshot is available.
- Report `extractionStrategy: "chatgpt-data-layer"` for captured snapshots or `extractionStrategy: "visible-dom-fallback"` with `partial: true` for mounted DOM fallback.
- Bridge logs should show conversation endpoint URL, status, content type, response length, `mappingFound`, extracted message count, `snapshotPosted`, and content-script `sessionStored`.
- Page-world debug should be visible as `window.__ENGRAM_CHATGPT_BRIDGE_DEBUG__`.
- Session debug/snapshot keys should include `engram:chatgpt:bridgeDebug`, `engram:chatgpt:conversationSnapshot`, and, after the isolated parser receives the postMessage, `engramChatgptLatestSnapshot`.

No-scroll limitation:

- If the extension is loaded or enabled after ChatGPT already fetched the conversation, no data-layer snapshot may be available until the page is refreshed or performs another relevant fetch/XHR.
- In that case Engram intentionally returns a visible DOM fallback rather than moving the user's scroll position.

---

## Part 1 — Claude Extraction Methodology (Reference)

Documented from reading `extension/platforms/claude/parser.js`, `STATUS.md`, and `HANDOFF.md`.
This is the gold-standard methodology ChatGPT extraction must replicate.

### 1.1 DOM Selectors

| Role | Primary selector | Why |
|------|-----------------|-----|
| User | `[data-testid="user-message"]` | Stable Claude-specific attribute |
| Assistant | `[data-testid="action-bar-copy"]` / `[data-testid="action-bar-retry"]` → ancestor walk | No stable data-testid on assistant containers; inferred from always-present action buttons |

### 1.2 User Message Detection

Direct `querySelectorAll('[data-testid="user-message"]')`. One node = one user message.
No fallback needed — this selector is stable.

### 1.3 Assistant Message Detection

Indirect: find all action buttons (copy/retry), then walk upward from each button until a
meaningful parent container is found. Preference for containers whose class name includes
`"group"`. Collected into a `seenContainers` WeakSet to deduplicate containers that share
the same button (multiple buttons in one response → still one container).

### 1.4 DOM-Node Source Keys

```js
const nodeSourceKeys = new WeakMap();  // DOM node → "role:N" string
let nextSourceKey = 1;

function sourceKeyForNode(role, node) {
  if (!nodeSourceKeys.has(node)) {
    nodeSourceKeys.set(node, `${role}:${nextSourceKey++}`);
  }
  return nodeSourceKeys.get(node);
}
```

Each DOM node gets exactly one key for its lifetime. If MutationObserver fires 10 times
during a response streaming in, the same assistant node gets the same key — it's never
double-counted. Keys survive across polling cycles.

### 1.5 Duplicate Text Handling

**Two independent dedup layers:**

1. **`sentMessageKeys` Set** (per-session): tracks `sourceKey || role:text` of every message
   already sent to the background worker. Prevents re-sending on repeat MutationObserver ticks.
   Operates on *sent messages only* — not on DOM extraction.

2. **`deduplicateMessages()`** for fetch-intercepted messages only: uses `role:text` as key
   because fetched messages have no DOM node identity.

**DOM extraction itself does NOT deduplicate by text.** Two `[data-testid="user-message"]`
nodes with identical text → two separate messages. This is intentional.

### 1.6 Repeated User Messages Preserved

Consequence of source keys: `"привет"` sent three times = three DOM nodes = three source
keys (`user:1`, `user:7`, `user:15`) = three messages in the output. The `sentMessageKeys`
dedup uses source keys (not text) for DOM messages, so all three are sent.

### 1.7 UI Garbage Filtering (Assistant Only)

```js
function cleanAssistantText(text) {
  return text
    .replace(/\bClaude responded:\s*/gi, "")     // header prefix
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => !/^(Copy|Retry)$/i.test(line))  // action button labels
    .filter(line => !/Thinking about|Deciphered/i.test(line))  // internal state
    .join("\n").trim();
}
```

Plus `collapseRepeatedText()` for "Привет!Привет!" → "Привет!".
Plus `isTimestampOrDateOnly()` to filter "14:02" or "21 мая" as assistant message candidates.

### 1.8 Code Block Counting

```js
Array.from(node.querySelectorAll("pre code")).map(el => ({
  language: el.className.replace("language-", "").trim() || "unknown",
  code: el.innerText?.trim() || ""
})).filter(b => b.code.length > 0)
```

Scoped to the specific message node — never scans across siblings.

### 1.9 MutationObserver + Fallback Polling

- **Primary**: `MutationObserver(document.body, { childList: true, subtree: true })`
- **Guard**: `isWidgetOnlyMutation()` — skips mutations where every changed node is inside
  `#engram-mini-health-widget` (prevents widget self-triggering extraction loops)
- **Fallback**: `setInterval(2000)` — catches late-rendered DOM that mutation missed
- Both paths call `captureDomMessages()` → `sendNewMessages()` → background worker

### 1.10 ENGRAM_START_SCAN → ENGRAM_SCAN_COMPLETE Contract

```
Popup                    Content Script           Background Worker
  │                           │                        │
  ├─ tabs.sendMessage ────────►│                        │
  │  { type: "ENGRAM_START_SCAN" }                      │
  │                           │                        │
  │                   performComprehensiveScan()        │
  │                           │                        │
  ◄──── Promise / sendResponse ┤                        │
  { type: "ENGRAM_SCAN_COMPLETE",                       │
    userCount, aiCount, total, codeCount,               │
    messages, chatId, sourceTitle,                      │
    scanDuration, totalChars, domSize,                  │
    renderedNodes, url, scannedAt }                     │
  │                           │                        │
  │                   runtime.sendMessage ─────────────►│
  │                   { type: "ENGRAM_NEW_MESSAGES" }   │
```

Firefox: content script returns `Promise.resolve(result)` from `onMessage` handler.
Chrome: content script calls `sendResponse(result)` and returns `true`.

### 1.11 Testing Methodology Used for Claude

From `HANDOFF.md` Verification section:
- **Node VM harness**: simulated DOM + browser APIs in Node.js (no real browser needed)
- Tests run: repeated user messages, Russian date filtering, doubled assistant text collapse
- Popup null-state race: confirmed `doneView` stayed after null `ENGRAM_GET_STATE`
- `node --check` syntax verification after every change
- Live Firefox validation AFTER all harness tests pass

**The sequence**: DOM analysis → hypothesis → Node VM harness → `node --check` → Firefox validation.

---

## Part 2 — ChatGPT Test Plan

Questions this methodology must answer before any further parser changes.

### 2.1 DOM Completeness

| # | Question | How to test |
|---|----------|-------------|
| Q1 | Does ChatGPT render ALL messages in DOM at once? | Probe D (scroll hydration) |
| Q2 | Does ChatGPT virtualize / unload older messages? | Probe D: count before/after scroll |
| Q3 | Does the DOM change as you scroll up? | Probe D: MutationObserver during scroll |
| Q4 | Do very long chats have partial DOM? | Manual: test with 50+ message chat |

### 2.2 Node Identity

| # | Question | How to test |
|---|----------|-------------|
| Q5 | Are aria-hidden duplicate nodes present? | Probe A field `ariaHiddenCount` |
| Q6 | Are alternate assistant response branches in DOM? | Probe A field `altResponseCount` |
| Q7 | Is `[data-message-author-role]` on the immediate content wrapper or an ancestor? | Probe B |
| Q8 | Is `data-message-id` also present and unique? | Probe B |

### 2.3 Selector Stability

| # | Question | How to test |
|---|----------|-------------|
| Q9 | Does `.markdown` match all assistant content elements? | Probe B selector hit rate |
| Q10 | Does `.whitespace-pre-wrap` match all user content elements? | Probe B selector hit rate |
| Q11 | Do fallback selectors `[class*='prose']`, `[class*='markdown']` help? | Probe B |
| Q12 | Are action bars (Copy, Thumbs up) children of the role node or siblings? | Probe B |

### 2.4 Text Accuracy

| # | Question | How to test |
|---|----------|-------------|
| Q13 | Does `contentEl.innerText` include action bar text? | Probe C: compare contentEl vs node text |
| Q14 | Are "ChatGPT said:" / "You said:" prefixes present? | Probe C: prefix detection |
| Q15 | Does the footer disclaimer ("ChatGPT can make mistakes") appear in text? | Probe C |

### 2.5 Code Blocks

| # | Question | How to test |
|---|----------|-------------|
| Q16 | Are code blocks scoped per assistant message or global? | Probe A code count per node |
| Q17 | Does `pre code` inside contentEl correctly scope code? | Probe C vs Probe A |

### 2.6 SPA Behavior

| # | Question | How to test |
|---|----------|-------------|
| Q18 | After switching chats, are old DOM nodes gone? | Probe E |
| Q19 | Does `getChatId()` correctly update after navigation? | Probe E: compare pathname |
| Q20 | Does `getChatTitle()` update after navigation? | Probe E: compare titles |

---

## Part 3 — Console Probes

**Rules**: Paste each probe into ChatGPT DevTools console (F12 → Console tab).
No full message content is printed. Only counts, lengths, hit rates, and metadata.

---

### Probe A — DOM Census

Paste into console. Run on: short chat, long chat, chat with code, after switching chats.

```javascript
// ── Probe A: Engram ChatGPT DOM Census ───────────────────────────────────
(function engramCensus() {
  const all = Array.from(document.querySelectorAll("[data-message-author-role]"));
  const ariaHidden = all.filter(n =>
    n.getAttribute("aria-hidden") === "true" ||
    !!n.closest("[aria-hidden='true']")
  );
  const visible = all.filter(n =>
    n.getAttribute("aria-hidden") !== "true" &&
    !n.closest("[aria-hidden='true']")
  );
  const user      = visible.filter(n => n.getAttribute("data-message-author-role") === "user");
  const assistant = visible.filter(n => n.getAttribute("data-message-author-role") === "assistant");
  const other     = visible.filter(n => {
    const r = n.getAttribute("data-message-author-role");
    return r !== "user" && r !== "assistant";
  });

  // Code blocks per role
  let userCode = 0, asstCode = 0;
  user.forEach(n => { userCode += n.querySelectorAll("pre code").length; });
  assistant.forEach(n => { asstCode += n.querySelectorAll("pre code").length; });

  // Text length distribution (all visible nodes)
  const lengths = visible.map(n => (n.innerText || "").trim().length);
  const totalLen = lengths.reduce((a, b) => a + b, 0);
  const minLen   = lengths.length ? Math.min(...lengths) : 0;
  const maxLen   = lengths.length ? Math.max(...lengths) : 0;
  const avgLen   = lengths.length ? Math.round(totalLen / lengths.length) : 0;
  const emptyCount = lengths.filter(l => l < 2).length;

  // Check data-message-id presence
  const withMsgId = visible.filter(n => n.hasAttribute("data-message-id")).length;

  // Alt response check (ChatGPT may render hidden alt branches)
  const articles = document.querySelectorAll("article[data-testid]");

  console.group("=== Engram ChatGPT DOM Census ===");
  console.log(`URL: ${window.location.href}`);
  console.log(`Chat ID (from URL): ${(window.location.pathname.match(/\/c\/([a-z0-9-]+)/i) || ["", "none"])[1]}`);
  console.log(`Page title: ${document.title}`);
  console.log("---");
  console.log(`Total [data-message-author-role] nodes : ${all.length}`);
  console.log(`  aria-hidden / invisible              : ${ariaHidden.length}`);
  console.log(`  visible (countable)                  : ${visible.length}`);
  console.log(`    role=user                          : ${user.length}`);
  console.log(`    role=assistant                     : ${assistant.length}`);
  console.log(`    role=other/unknown                 : ${other.length}`);
  console.log("---");
  console.log(`Code blocks in user nodes    : ${userCode}`);
  console.log(`Code blocks in asst nodes    : ${asstCode}`);
  console.log(`Total pre code elements      : ${document.querySelectorAll("pre code").length}`);
  console.log("---");
  console.log(`Nodes with data-message-id   : ${withMsgId} / ${visible.length}`);
  console.log(`article[data-testid] count   : ${articles.length}`);
  console.log("---");
  console.log(`Text lengths (all visible):  min=${minLen}  max=${maxLen}  avg=${avgLen}  total=${totalLen}`);
  console.log(`Empty/near-empty (<2 chars)  : ${emptyCount}`);
  console.groupEnd();
})();
```

**Expected output format (example):**
```
Total [data-message-author-role] nodes : 7
  aria-hidden / invisible              : 0
  visible (countable)                  : 7
    role=user                          : 3
    role=assistant                     : 4
    role=other/unknown                 : 0
Code blocks in asst nodes              : 2
```

---

### Probe B — Selector Comparison

Tests which selectors match and which don't. Identifies action bar placement.

```javascript
// ── Probe B: Engram Selector Comparison ─────────────────────────────────
(function engramSelectorComparison() {
  const visible = Array.from(document.querySelectorAll("[data-message-author-role]")).filter(n =>
    n.getAttribute("aria-hidden") !== "true" && !n.closest("[aria-hidden='true']")
  );

  // Per-node breakdown
  let mdHit = 0, proseHit = 0, mdClassHit = 0, wpwHit = 0, textBaseHit = 0;
  let asstFallback = 0, userFallback = 0;
  let actionInsideRole = 0, actionOutsideRole = 0;

  visible.forEach((node, i) => {
    const role = node.getAttribute("data-message-author-role");

    if (role === "assistant") {
      const md    = node.querySelector(".markdown");
      const prose = node.querySelector("[class*='prose']");
      const mdCls = node.querySelector("[class*='markdown']");
      const tb    = node.querySelector(".text-base");

      if (md)      mdHit++;
      else if (prose) proseHit++;
      else if (mdCls) mdClassHit++;
      else if (tb)    textBaseHit++;
      else            asstFallback++;

      // Are action buttons inside [data-message-author-role]?
      const hasButtonsInside = node.querySelector("button") !== null;
      if (hasButtonsInside) actionInsideRole++;
    }

    if (role === "user") {
      const wpw = node.querySelector(".whitespace-pre-wrap");
      const wpwCls = node.querySelector("[class*='whitespace-pre']");
      const tb  = node.querySelector(".text-base");

      if (wpw)     wpwHit++;
      else if (wpwCls) (wpwHit++); // counted together
      else if (tb) textBaseHit++;
      else         userFallback++;

      // Are action buttons inside [data-message-author-role]?
      if (node.querySelector("button")) actionInsideRole++;
    }
  });

  // Also check article-based strategy
  const articles = Array.from(document.querySelectorAll("article[data-testid]"));
  const articlesWithRole = articles.filter(a => a.querySelector("[data-message-author-role]"));
  const globalMarkdown   = document.querySelectorAll(".markdown").length;
  const globalProse      = document.querySelectorAll("[class*='prose']").length;
  const globalWpw        = document.querySelectorAll(".whitespace-pre-wrap").length;
  const globalPreCode    = document.querySelectorAll("pre code").length;

  // Check if action bars live outside the role node
  const allButtons = Array.from(document.querySelectorAll("button[aria-label]"));
  const copyBtns = allButtons.filter(b =>
    /copy/i.test(b.getAttribute("aria-label") || "")
  );
  copyBtns.forEach(btn => {
    if (btn.closest("[data-message-author-role]")) actionInsideRole++;
    else actionOutsideRole++;
  });

  console.group("=== Engram Selector Comparison ===");
  console.log("--- Assistant content selectors ---");
  console.log(`  .markdown matched              : ${mdHit}`);
  console.log(`  [class*='prose'] matched       : ${proseHit}`);
  console.log(`  [class*='markdown'] matched    : ${mdClassHit}`);
  console.log(`  .text-base matched             : ${textBaseHit}`);
  console.log(`  No match (full node fallback)  : ${asstFallback}`);
  console.log("--- User content selectors ---");
  console.log(`  .whitespace-pre-wrap matched   : ${wpwHit}`);
  console.log(`  No match (full node fallback)  : ${userFallback}`);
  console.log("--- Action bar location ---");
  console.log(`  buttons inside [data-message-author-role]: ${actionInsideRole}`);
  console.log(`  copy buttons outside role nodes          : ${actionOutsideRole}`);
  console.log("--- Article-based strategy ---");
  console.log(`  article[data-testid] count               : ${articles.length}`);
  console.log(`  articles with [data-message-author-role] : ${articlesWithRole.length}`);
  console.log("--- Global counts ---");
  console.log(`  .markdown total                : ${globalMarkdown}`);
  console.log(`  [class*='prose'] total         : ${globalProse}`);
  console.log(`  .whitespace-pre-wrap total     : ${globalWpw}`);
  console.log(`  pre code total                 : ${globalPreCode}`);
  console.groupEnd();
})();
```

**Interpret results:**
- If `asstFallback > 0`: `.markdown` / `prose` selectors miss some assistant nodes → content extraction falls to full node → risk of button text in output
- If `actionInsideRole > 0`: action buttons are inside the role node → using `contentEl` is essential (do NOT fall back to `roleNode.innerText`)
- If `articles < visible`: article-based strategy would miss messages → Strategy A was wrong to use

---

### Probe C — Parser Mirror

Exact replica of `extension/platforms/chatgpt/parser.js` extraction logic.
Prints totals only. Use this to confirm Engram and manual DOM agree.

```javascript
// ── Probe C: Engram Parser Mirror ────────────────────────────────────────
// Mirrors extension/platforms/chatgpt/parser.js extractMessages() exactly.
// Prints only counts and metadata — no message content.
(function engramParserMirror() {
  // -- helpers (same as parser) --
  const _UI_NOISE_LINES = new Set([
    "copy", "copy code", "edit", "edited",
    "thumbs up", "thumbs down", "good response", "bad response",
    "regenerate", "read aloud", "share", "more",
    "stop generating", "continue generating", "retry",
  ]);

  function cleanMessageText(rawText) {
    if (!rawText) return "";
    let text = rawText
      .replace(/^ChatGPT said:\s*/i, "")
      .replace(/^You said:\s*/i, "");
    text = text.replace(/\s*ChatGPT can make mistakes[^]*$/i, "");
    const lines = text.split("\n").filter(line => {
      const lower = line.trim().toLowerCase();
      return lower.length > 0 && !_UI_NOISE_LINES.has(lower);
    });
    return lines.join("\n").trim();
  }

  function getContentElement(role, roleNode) {
    if (role === "user") {
      return roleNode.querySelector(".whitespace-pre-wrap") ||
             roleNode.querySelector("[class*='whitespace-pre-wrap']") ||
             null;
    }
    return roleNode.querySelector(".markdown") ||
           roleNode.querySelector("[class*='prose']") ||
           roleNode.querySelector("[class*='markdown']") ||
           null;
  }

  function extractCodeBlocks(node) {
    return Array.from(node.querySelectorAll("pre code")).filter(el =>
      (el.innerText || el.textContent || "").trim().length > 0
    );
  }

  // -- extraction (same as parser) --
  const roleNodes = Array.from(document.querySelectorAll("[data-message-author-role]"));
  roleNodes.sort((a, b) => {
    if (a === b) return 0;
    return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
  });

  const seenNodes = new WeakSet();
  const extracted = [];
  let skippedAriaHidden = 0, skippedNoRects = 0, skippedOtherRole = 0;
  let usingContentEl = 0, usingFallbackNode = 0;
  let totalRawLen = 0, totalCleanLen = 0;
  let noiseCleaned = 0;

  for (const node of roleNodes) {
    if (seenNodes.has(node)) continue;
    seenNodes.add(node);

    const role = node.getAttribute("data-message-author-role");
    if (role !== "user" && role !== "assistant") { skippedOtherRole++; continue; }

    if (node.getAttribute("aria-hidden") === "true" ||
        node.closest("[aria-hidden='true']")) {
      skippedAriaHidden++;
      continue;
    }
    if (typeof node.getClientRects === "function" && node.getClientRects().length === 0) {
      skippedNoRects++;
      continue;
    }

    const contentEl = getContentElement(role, node);
    let rawText;
    if (contentEl) {
      rawText = (contentEl.innerText || contentEl.textContent || "").trim();
      usingContentEl++;
    } else {
      rawText = (node.innerText || node.textContent || "").trim();
      usingFallbackNode++;
    }

    const cleanedText = cleanMessageText(rawText);
    totalRawLen   += rawText.length;
    totalCleanLen += cleanedText.length;
    if (rawText.length !== cleanedText.length) noiseCleaned++;

    const codeBlocks = extractCodeBlocks(node);

    extracted.push({ role, textLen: cleanedText.length, codeCount: codeBlocks.length });
  }

  const userMsgs  = extracted.filter(m => m.role === "user");
  const asstMsgs  = extracted.filter(m => m.role === "assistant");
  const codeTotal = extracted.reduce((s, m) => s + m.codeCount, 0);
  const charTotal = extracted.reduce((s, m) => s + m.textLen, 0);

  console.group("=== Engram Parser Mirror (matches parser.js) ===");
  console.log(`URL: ${window.location.href}`);
  console.log(`--- Extraction results ---`);
  console.log(`  user messages      : ${userMsgs.length}`);
  console.log(`  assistant messages : ${asstMsgs.length}`);
  console.log(`  total messages     : ${extracted.length}`);
  console.log(`  code blocks        : ${codeTotal}`);
  console.log(`  total chars        : ${charTotal}`);
  console.log(`--- Node decisions ---`);
  console.log(`  used contentEl     : ${usingContentEl}`);
  console.log(`  used fallback node : ${usingFallbackNode}`);
  console.log(`  noise cleaned      : ${noiseCleaned} nodes had text removed by cleanMessageText`);
  console.log(`--- Skipped ---`);
  console.log(`  aria-hidden nodes  : ${skippedAriaHidden}`);
  console.log(`  no client rects    : ${skippedNoRects}`);
  console.log(`  non-user/asst role : ${skippedOtherRole}`);
  console.log(`--- Text size ---`);
  console.log(`  raw chars total    : ${totalRawLen}`);
  console.log(`  clean chars total  : ${totalCleanLen}`);
  console.log(`  chars removed      : ${totalRawLen - totalCleanLen}`);
  console.groupEnd();

  return { user: userMsgs.length, assistant: asstMsgs.length,
           total: extracted.length, code: codeTotal, chars: charTotal };
})();
```

**This probe is the ground truth.** Its output should exactly match the Engram popup scan counts.
If they differ, the pipeline (popup.js or worker.js) is transforming the data.

---

### Probe D — Scroll Hydration

Tests whether scrolling up the conversation loads more DOM nodes.

```javascript
// ── Probe D: Engram Scroll Hydration Probe ───────────────────────────────
// Must be run while viewing a long conversation (20+ messages).
// Does NOT send messages. Does NOT interact with UI controls.
// WAIT 1-2 seconds between each step before re-running.
(async function engramScrollHydration() {
  function countRoleNodes() {
    return {
      total:     document.querySelectorAll("[data-message-author-role]").length,
      user:      document.querySelectorAll('[data-message-author-role="user"]').length,
      assistant: document.querySelectorAll('[data-message-author-role="assistant"]').length,
      articles:  document.querySelectorAll("article[data-testid]").length,
    };
  }

  // Find the conversation scroll container
  function findScrollContainer() {
    // Common ChatGPT containers (try several)
    const candidates = [
      document.querySelector("[data-testid='conversation-turns']"),
      document.querySelector("main .overflow-y-auto"),
      document.querySelector("main [class*='overflow-y-auto']"),
      document.querySelector(".flex-1.overflow-hidden"),
      document.querySelector("main"),
    ].filter(Boolean);

    // Pick the one with the most scroll height
    return candidates.reduce((best, el) =>
      el.scrollHeight > (best?.scrollHeight || 0) ? el : best, null);
  }

  const before = countRoleNodes();
  const container = findScrollContainer();

  console.group("=== Engram Scroll Hydration Probe ===");
  console.log(`Container found: ${container ? container.tagName + (container.className ? '.' + container.className.split(' ').slice(0,2).join('.') : '') : "none"}`);
  console.log(`Scroll container: scrollHeight=${container?.scrollHeight} scrollTop=${container?.scrollTop}`);
  console.log("--- BEFORE scroll ---");
  console.log(`  role nodes total : ${before.total}`);
  console.log(`  user             : ${before.user}`);
  console.log(`  assistant        : ${before.assistant}`);
  console.log(`  articles         : ${before.articles}`);
  console.log("--- Scrolling up 3 steps... (watch for changes) ---");

  if (!container) {
    console.warn("No scroll container found. Scroll manually and re-run countRoleNodes() below.");
    console.groupEnd();
    return;
  }

  const originalScrollTop = container.scrollTop;

  // Observe DOM changes during scroll
  let newNodesDetected = 0;
  const mo = new MutationObserver(muts => {
    muts.forEach(m => {
      m.addedNodes.forEach(n => {
        if (n.nodeType === Node.ELEMENT_NODE) {
          const count = (n.matches("[data-message-author-role]") ? 1 : 0) +
                        n.querySelectorAll("[data-message-author-role]").length;
          newNodesDetected += count;
        }
      });
    });
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // Scroll up in 3 steps
  const steps = [
    container.scrollHeight * 0.5,
    container.scrollHeight * 0.25,
    0,
  ];

  for (const targetScroll of steps) {
    container.scrollTop = targetScroll;
    await new Promise(r => setTimeout(r, 1200));
    const mid = countRoleNodes();
    console.log(`After scroll to ${Math.round(targetScroll)}px: total=${mid.total} user=${mid.user} asst=${mid.assistant}`);
  }

  await new Promise(r => setTimeout(r, 500));
  mo.disconnect();

  const after = countRoleNodes();
  console.log("--- AFTER scrolling ---");
  console.log(`  role nodes total : ${after.total}`);
  console.log(`  user             : ${after.user}`);
  console.log(`  assistant        : ${after.assistant}`);
  console.log(`  new nodes via MO : ${newNodesDetected}`);
  console.log("--- Verdict ---");
  if (after.total > before.total) {
    console.warn(`⚠ HYDRATION CONFIRMED: ${after.total - before.total} new nodes appeared after scrolling.`);
    console.warn("   ChatGPT virtualizes messages. Engram scan must scroll to hydrate first.");
  } else {
    console.log(`✓ NO HYDRATION: node count unchanged (${before.total} → ${after.total}). DOM is complete.`);
  }

  // Restore scroll position
  container.scrollTop = originalScrollTop;
  console.log(`Scroll restored to original position (${originalScrollTop}px).`);
  console.groupEnd();
})();
```

**Interpretation:**
- If count unchanged → ChatGPT renders all messages at once → current scan-on-demand is correct
- If count grows → ChatGPT virtualizes → Engram needs a scroll-hydration "Deep Scan" path (requires explicit user approval before implementing)

---

### Probe E — Conversation Switch Validation

Manual steps (cannot be fully automated — requires user action to switch chats).

**Step 1**: Run Probe A on Chat A. Record counts.
**Step 2**: Run Probe C on Chat A. Record mirror totals.
**Step 3**: Click Engram popup → Scan Chat on Chat A. Record popup totals.
**Step 4**: Switch to Chat B (click a different chat in the sidebar).
**Step 5**: Wait 1 second. Run this snippet:

```javascript
// ── Probe E step: After switching to Chat B ───────────────────────────────
(function engramAfterSwitch() {
  const nodes = document.querySelectorAll("[data-message-author-role]");
  const chatId = (window.location.pathname.match(/\/c\/([a-z0-9-]+)/i) || ["","none"])[1];

  // Find title from sidebar
  let sidebarTitle = null;
  for (const sel of ['[aria-current="page"]', '[aria-selected="true"]', 'nav [data-active="true"]']) {
    const el = document.querySelector(sel);
    if (el) { sidebarTitle = (el.innerText || el.textContent || "").trim().slice(0, 60) || null; break; }
  }
  const docTitle = (document.title || "").replace(/\s*-\s*ChatGPT\s*$/i, "").trim().slice(0, 60);

  console.group("=== Probe E: After Conversation Switch ===");
  console.log(`New URL: ${window.location.href}`);
  console.log(`New chatId: ${chatId}`);
  console.log(`Sidebar title (first 60): ${sidebarTitle || "(not found)"}`);
  console.log(`document.title (stripped): ${docTitle}`);
  console.log(`[data-message-author-role] count: ${nodes.length}`);
  console.log(`  user:      ${[...nodes].filter(n=>n.getAttribute("data-message-author-role")==="user").length}`);
  console.log(`  assistant: ${[...nodes].filter(n=>n.getAttribute("data-message-author-role")==="assistant").length}`);
  console.groupEnd();
})();
```

**What to verify:**
- `chatId` changed from Chat A's ID to Chat B's ID
- Node counts reflect Chat B, not Chat A (no stale nodes)
- `sidebarTitle` or `docTitle` shows Chat B's title
- Then run Scan Chat again and confirm popup shows Chat B data, not Chat A data

---

## Part 4 — Comparison Framework

After running all probes, fill in this table:

| Metric | Probe A (DOM) | Probe C (Mirror) | Engram Scan | Match? |
|--------|--------------|-----------------|-------------|--------|
| User messages | | | | |
| Assistant messages | | | | |
| Total messages | | | | |
| Code blocks | | | | |
| Total chars | | | | |

**Match rules:**
- Probe A == Probe C → Parser correctly mirrors DOM
- Probe C == Engram Scan → Pipeline (popup/worker) doesn't corrupt the data
- Probe A != Probe C → Parser misses DOM nodes (parser bug)
- Probe C == Engram Scan but Probe A > Probe C → Expected if scroll hydration needed or aria-hidden filtering
- Probe A == Engram Scan but both < visible count → ChatGPT DOM limitation (virtualization)

---

## Part 5 — Decision Tree

```
Run Probe D first: does scrolling reveal new nodes?
│
├─ YES → ChatGPT DOM limitation (virtualization)
│        → Do NOT patch parser further yet
│        → Add accuracy label: "Visible messages only" in scan result
│        → Document as future Deep Scan feature
│        → Propose to user before implementing scroll-hydration
│
└─ NO → All messages are in DOM at once → continue below
        │
        Run Probe A vs Probe C comparison
        │
        ├─ Probe A == Probe C → Parser correctly mirrors DOM
        │                      → No parser change needed
        │                      → Check if Probe C == Engram Scan
        │                      │
        │                      ├─ YES → Pipeline is correct. Zero bugs.
        │                      └─ NO  → Pipeline bug in popup.js or worker.js
        │                             → Check popup scan response handling
        │
        └─ Probe A > Probe C → Parser misses nodes
                              → Identify which nodes are missed:
                                 aria-hidden? wrong role? no client rects?
                              → Update chatgpt/parser.js to fix only the missed case
                              → Re-run Probe C to confirm fix
```

---

## Part 6 — Node VM Test Harness Template

For offline verification without a real browser (mirrors Claude's harness methodology):

```javascript
// Save as test/chatgpt-parser-harness.js
// Run with: node test/chatgpt-parser-harness.js

const { JSDOM } = require("jsdom");  // npm install jsdom

// Build a minimal mock DOM representing a ChatGPT conversation
const html = `
<div id="app">
  <div data-message-author-role="user" data-message-id="u1">
    <div class="whitespace-pre-wrap">Hello, can you help me?</div>
  </div>
  <div data-message-author-role="assistant" data-message-id="a1">
    <div class="markdown prose">
      <p>Sure, here is a solution:</p>
      <pre><code class="language-python">print("hello")</code></pre>
    </div>
    <div class="action-bar">
      <button>Copy</button>
      <button>Thumbs up</button>
    </div>
  </div>
  <div data-message-author-role="user" data-message-id="u2">
    <div class="whitespace-pre-wrap">Hello, can you help me?</div>
  </div>
  <div data-message-author-role="assistant" data-message-id="a2" aria-hidden="true">
    <div class="markdown prose">Hidden alt response</div>
  </div>
</div>
`;

const dom = new JSDOM(html);
global.document = dom.window.document;
global.Node = dom.window.Node;

// Paste extractMessages() here and run
// Expected:
//   user messages      : 2  (both "Hello, can you help me?" preserved — no text dedup)
//   assistant messages : 1  (aria-hidden one skipped)
//   code blocks        : 1
//   fallback nodes     : 0  (all matched contentEl)
```

**Key test cases to verify:**
1. Repeated user message → counted twice (no text dedup)
2. aria-hidden assistant → skipped
3. Action bar buttons → excluded from text
4. Code block scoped to assistant content element
5. "ChatGPT said:" prefix → stripped
6. "Copy" line in fallback text → stripped

---

## Part 7 — Current Parser State (as of 2026-05-24)

File: `extension/platforms/chatgpt/parser.js`

**Strategy**: No-scroll ChatGPT extraction. `platforms/chatgpt/page-bridge.js` runs at `document_start` in the page/main world, installs a fetch/XHR bridge, and Popup Scan Chat first tries a locally captured page data-layer snapshot from ChatGPT responses before falling back to visible `[data-message-author-role]` DOM nodes.
Article-based Strategy A was removed (it silently truncated on partial matches).

**Content element selection**:
- User: `.whitespace-pre-wrap` → `[class*='whitespace-pre-wrap']` → null (fallback)
- Assistant: `.markdown` → `[class*='prose']` → `[class*='markdown']` → null (fallback)
- When null: full roleNode text + `cleanMessageText()` strips noise lines

**Guards**:
- `aria-hidden="true"` and `closest([aria-hidden])` → skipped
- nodes with no client rects → skipped
- `WeakSet` dedup → same DOM node never processed twice
- `cleanMessageText()` → strips "ChatGPT said:", "You said:", footer disclaimer, button-label lines
- Empty or short cleaned text is preserved; visible role node identity determines message count.

**Code blocks**: extracted from the visible role node (never global document scope)

**Extraction metadata returned with `ENGRAM_SCAN_COMPLETE`**:
- `extractionStrategy`
- `partial`
- `dataLayerSnapshotAvailable`
- `dataLayerCapturedAt`
- `dataLayerSourceUrl`

**Logs emitted**:
```
[Engram][ChatGPT] parser loaded
[Engram][ChatGPT] page-world bridge installed at document_start
[Engram][ChatGPT] listening for page-world bridge snapshots
[Engram][ChatGPT] intercepted conversation endpoint: https://chatgpt.com/backend-api/conversation/... status=200 contentType=application/json length=N
[Engram][ChatGPT] conversation JSON parsed: mappingFound=yes currentNodeFound=yes messages=N snapshotPosted=yes
[Engram][ChatGPT] data-layer snapshot captured: chat=... messages=N source=... sessionStored=yes
[Engram][ChatGPT] using data-layer snapshot: messages=N capturedAt=...
[Engram][ChatGPT] no matching data-layer snapshot; using visible DOM fallback
[Engram][ChatGPT] extraction strategy: role-attr-direct
[Engram][ChatGPT] candidates found: N
[Engram][ChatGPT] messages extracted: user=X ai=Y total=Z code=W
[Engram][ChatGPT] scan complete: user=X ai=Y total=Z code=W chars=C ms=M
```

**Known open questions** (answer with probes above):
- Q1: Is all conversation content in DOM at once? (Probe D)
- Q2: Are `.markdown`/`.whitespace-pre-wrap` present in real production DOM? (Probe B hit rate)
- Q3: Are action buttons inside `[data-message-author-role]`? (Probe B action bar location)
- Q4: Does `cleanMessageText()` remove too much real content? (Probe C `noiseCleaned` count)
