/**
 * Engram — ChatGPT Page-World Bridge
 *
 * Runs in the page/main world at document_start so it can wrap ChatGPT's own
 * fetch/XHR calls before the app loads conversation data. This file must not
 * use extension APIs.
 */

(function () {
  "use strict";

  if (window.__ENGRAM_CHATGPT_PAGE_BRIDGE__) return;
  window.__ENGRAM_CHATGPT_PAGE_BRIDGE__ = true;

  const SOURCE = "engram-chatgpt-bridge";
  const EVENT = "conversation-snapshot";
  const DEBUG_KEY = "engram:chatgpt:bridgeDebug";
  const SNAPSHOT_KEY = "engram:chatgpt:conversationSnapshot";
  const SEEN_URL_LIMIT = 40;

  const debug = {
    installedAt: Date.now(),
    fetchWrapped: false,
    xhrWrapped: false,
    seenUrls: [],
    conversationResponsesSeen: 0,
    lastConversationUrl: "",
    lastStatus: null,
    lastContentType: "",
    lastResponseLength: 0,
    mappingFound: false,
    currentNodeFound: false,
    extractedMessages: 0,
    snapshotPosted: false,
    lastError: "",
  };

  window.__ENGRAM_CHATGPT_BRIDGE_DEBUG__ = debug;

  function saveDebug() {
    try {
      sessionStorage.setItem(DEBUG_KEY, JSON.stringify({
        ...debug,
        seenUrls: debug.seenUrls.slice(-SEEN_URL_LIMIT),
      }));
    } catch (_) {}
  }

  function updateDebug(patch) {
    Object.assign(debug, patch);
    saveDebug();
  }

  function rememberUrl(url) {
    if (!url) return;
    debug.seenUrls.push(url);
    if (debug.seenUrls.length > SEEN_URL_LIMIT) {
      debug.seenUrls.splice(0, debug.seenUrls.length - SEEN_URL_LIMIT);
    }
    saveDebug();
  }

  function cleanText(value) {
    return String(value || "").replace(/\r\n/g, "\n").trim();
  }

  function absoluteUrl(url) {
    try {
      return new URL(url || "", location.href).href;
    } catch (_) {
      return String(url || "");
    }
  }

  function getChatIdFromUrl(url) {
    try {
      const match = new URL(url || "", location.href).pathname.match(/\/c\/([a-z0-9-]+)/i);
      return match ? match[1] : "";
    } catch (_) {
      return "";
    }
  }

  function isConversationEndpoint(url) {
    try {
      return /\/backend-api\/conversation\/[a-z0-9-]+/i.test(new URL(url || "", location.href).pathname);
    } catch (_) {
      return /\/backend-api\/conversation\/[a-z0-9-]+/i.test(String(url || ""));
    }
  }

  function textFromPart(part) {
    if (typeof part === "string") return part;
    if (!part || typeof part !== "object") return "";
    if (typeof part.text === "string") return part.text;
    if (typeof part.content === "string") return part.content;
    if (typeof part.name === "string" && typeof part.size === "number") return `[File: ${part.name}]`;
    return "";
  }

  function textFromContent(content) {
    if (!content) return "";
    if (typeof content === "string") return content;
    if (Array.isArray(content.parts)) return content.parts.map(textFromPart).filter(Boolean).join("\n");
    if (typeof content.text === "string") return content.text;
    if (Array.isArray(content)) return content.map(textFromPart).filter(Boolean).join("\n");
    return "";
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

  function normalizeMessage(message) {
    const source = message && message.message ? message.message : message;
    if (!source || typeof source !== "object") return null;
    const role = source.author && source.author.role ? source.author.role : source.role;
    if (role !== "user" && role !== "assistant") return null;

    const text = cleanText(textFromContent(source.content || source));
    return {
      id: source.id || message.id || "",
      role,
      text,
      codeBlocks: extractCodeBlocksFromText(text),
      timestamp: source.create_time ? Math.round(source.create_time * 1000) : Date.now(),
    };
  }

  function fromMapping(payload) {
    const mapping = payload && payload.mapping;
    if (!mapping || typeof mapping !== "object") return [];

    const chain = [];
    let nodeId = payload.current_node || payload.currentNode || "";
    const seen = new Set();
    while (nodeId && mapping[nodeId] && !seen.has(nodeId)) {
      seen.add(nodeId);
      chain.push(mapping[nodeId]);
      nodeId = mapping[nodeId].parent;
    }

    const nodes = chain.length
      ? chain.reverse()
      : Object.values(mapping).sort((a, b) => {
          const at = a?.message?.create_time || 0;
          const bt = b?.message?.create_time || 0;
          return at - bt;
        });

    return nodes.map(normalizeMessage).filter(Boolean);
  }

  function fromMessagesArray(payload) {
    if (!payload || !Array.isArray(payload.messages)) return [];
    return payload.messages.map(normalizeMessage).filter(Boolean);
  }

  function findBestConversation(payload, depth, seen) {
    if (!payload || typeof payload !== "object" || depth > 7 || seen.has(payload)) {
      return { messages: [], chatId: "" };
    }
    seen.add(payload);

    let best = { messages: [], chatId: "" };
    const mappingMessages = fromMapping(payload);
    if (mappingMessages.length > best.messages.length) {
      best = {
        messages: mappingMessages,
        chatId: payload.conversation_id || payload.conversationId || payload.id || "",
      };
    }

    const arrayMessages = fromMessagesArray(payload);
    if (arrayMessages.length > best.messages.length) {
      best = {
        messages: arrayMessages,
        chatId: payload.conversation_id || payload.conversationId || payload.id || "",
      };
    }

    for (const value of Object.values(payload)) {
      if (!value || typeof value !== "object") continue;
      const child = findBestConversation(value, depth + 1, seen);
      if (child.messages.length > best.messages.length) best = child;
    }

    return best;
  }

  function hasMappingPayload(payload, depth, seen) {
    if (!payload || typeof payload !== "object" || depth > 7 || seen.has(payload)) return false;
    seen.add(payload);
    if (payload.mapping && typeof payload.mapping === "object") return true;
    return Object.values(payload).some((value) =>
      value && typeof value === "object" && hasMappingPayload(value, depth + 1, seen)
    );
  }

  function hasCurrentNode(payload, depth, seen) {
    if (!payload || typeof payload !== "object" || depth > 7 || seen.has(payload)) return false;
    seen.add(payload);
    if (payload.current_node || payload.currentNode) return true;
    return Object.values(payload).some((value) =>
      value && typeof value === "object" && hasCurrentNode(value, depth + 1, seen)
    );
  }

  function publishSnapshot(payload, sourceUrl) {
    const best = findBestConversation(payload, 0, new WeakSet());
    const mappingFound = hasMappingPayload(payload, 0, new WeakSet());
    const currentNodeFound = hasCurrentNode(payload, 0, new WeakSet());
    const chatId = best.chatId || getChatIdFromUrl(sourceUrl) || getChatIdFromUrl(location.href) || "unknown";

    updateDebug({
      mappingFound,
      currentNodeFound,
      extractedMessages: best.messages.length,
    });

    if (!best.messages.length) {
      return { posted: false, messages: 0, chatId, mappingFound, currentNodeFound };
    }

    const snapshot = {
      chatId,
      sourceUrl,
      pageUrl: location.href,
      title: document.title || "",
      capturedAt: Date.now(),
      messages: best.messages,
    };

    let stored = false;
    try {
      sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
      stored = true;
    } catch (err) {
      updateDebug({ lastError: `snapshot storage failed: ${err.message || String(err)}` });
    }

    window.postMessage({
      source: SOURCE,
      type: EVENT,
      chatId,
      snapshot,
      debug: { ...debug, snapshotStored: stored },
    }, "*");

    updateDebug({
      snapshotPosted: true,
      extractedMessages: best.messages.length,
    });

    return { posted: true, messages: best.messages.length, chatId, mappingFound, currentNodeFound };
  }

  function inspectText(text, sourceUrl, contentType, status) {
    if (!text || text.length < 2) return;

    const trimmed = text.trim();
    const conversationEndpoint = isConversationEndpoint(sourceUrl);
    const looksJson = trimmed[0] === "{" || trimmed[0] === "[";
    const looksSse = trimmed.includes("\ndata:") || trimmed.startsWith("data:");
    const likelyUrl = /conversation|thread|backend-api/i.test(sourceUrl || "");
    const allowedType = /json|event-stream/i.test(contentType || "") || likelyUrl;
    if (!looksJson && !looksSse && !allowedType) return;

    if (conversationEndpoint) {
      updateDebug({
        conversationResponsesSeen: debug.conversationResponsesSeen + 1,
        lastConversationUrl: sourceUrl,
        lastStatus: status || null,
        lastContentType: contentType || "",
        lastResponseLength: text.length,
      });
      console.log(
        "[Engram][ChatGPT] intercepted conversation endpoint:",
        sourceUrl,
        `status=${status || "unknown"}`,
        `contentType=${contentType || "unknown"}`,
        `length=${text.length}`
      );
    }

    if (looksSse) {
      let posted = false;
      let mappingFound = false;
      let currentNodeFound = false;
      let messages = 0;
      trimmed.split(/\n+/).forEach((line) => {
        const match = line.match(/^data:\s*(.*)$/);
        if (!match || !match[1] || match[1] === "[DONE]") return;
        try {
          const result = publishSnapshot(JSON.parse(match[1]), sourceUrl);
          posted = posted || result.posted;
          mappingFound = mappingFound || result.mappingFound;
          currentNodeFound = currentNodeFound || result.currentNodeFound;
          messages = Math.max(messages, result.messages || 0);
        } catch (err) {
          updateDebug({ lastError: err.message || String(err) });
        }
      });
      if (conversationEndpoint) {
        console.log(
          "[Engram][ChatGPT] conversation SSE parsed:",
          `mappingFound=${mappingFound ? "yes" : "no"}`,
          `currentNodeFound=${currentNodeFound ? "yes" : "no"}`,
          `messages=${messages}`,
          `snapshotPosted=${posted ? "yes" : "no"}`
        );
      }
      return;
    }

    try {
      const result = publishSnapshot(JSON.parse(trimmed), sourceUrl);
      if (conversationEndpoint) {
        console.log(
          "[Engram][ChatGPT] conversation JSON parsed:",
          `mappingFound=${result.mappingFound ? "yes" : "no"}`,
          `currentNodeFound=${result.currentNodeFound ? "yes" : "no"}`,
          `messages=${result.messages || 0}`,
          `snapshotPosted=${result.posted ? "yes" : "no"}`
        );
      }
    } catch (err) {
      updateDebug({ lastError: err.message || String(err) });
      if (conversationEndpoint) {
        console.warn("[Engram][ChatGPT] conversation JSON parse failed", err);
      }
    }
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function patchedFetch(input, init) {
      return originalFetch.apply(this, arguments).then((response) => {
        try {
          const inputUrl = typeof input === "string" ? input : input && input.url ? input.url : "";
          const sourceUrl = absoluteUrl(response.url || inputUrl);
          rememberUrl(sourceUrl);

          const contentType = response.headers && response.headers.get ? response.headers.get("content-type") : "";
          const likelyPayload = isConversationEndpoint(sourceUrl) ||
            /json|event-stream/i.test(contentType || "") ||
            /conversation|thread|backend-api/i.test(sourceUrl || "");

          if (likelyPayload) {
            response.clone().text().then((text) =>
              inspectText(text, sourceUrl, contentType, response.status)
            ).catch((err) => updateDebug({ lastError: err.message || String(err) }));
          }
        } catch (err) {
          updateDebug({ lastError: err.message || String(err) });
        }
        return response;
      });
    };
    updateDebug({ fetchWrapped: true });
  }

  const xhrProto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (xhrProto) {
    const originalOpen = xhrProto.open;
    const originalSend = xhrProto.send;
    xhrProto.open = function patchedOpen(method, url) {
      this.__engramUrl = absoluteUrl(url || "");
      rememberUrl(this.__engramUrl);
      return originalOpen.apply(this, arguments);
    };
    xhrProto.send = function patchedSend() {
      try {
        this.addEventListener("loadend", function () {
          try {
            const sourceUrl = absoluteUrl(this.responseURL || this.__engramUrl || "");
            rememberUrl(sourceUrl);
            const contentType = this.getResponseHeader ? this.getResponseHeader("content-type") : "";
            if (typeof this.responseText === "string") {
              inspectText(this.responseText, sourceUrl, contentType, this.status);
            }
          } catch (err) {
            updateDebug({ lastError: err.message || String(err) });
          }
        });
      } catch (err) {
        updateDebug({ lastError: err.message || String(err) });
      }
      return originalSend.apply(this, arguments);
    };
    updateDebug({ xhrWrapped: true });
  }

  // Listen for content-script requests to fetch a fresh conversation snapshot on demand.
  // window.fetch is already patchedFetch here, so calling it automatically routes the
  // response through inspectText → publishSnapshot → window.postMessage, giving the
  // content script a fresh snapshot without any extra decoding logic.
  window.addEventListener("message", (event) => {
    try {
      if (!event.data || event.data.source !== "engram-content-script") return;
      if (event.data.type !== "fetch-conversation") return;
      const chatId = event.data.chatId;
      if (!chatId || chatId === "unknown") return;
      console.log("[Engram][ChatGPT] page bridge fetch-conversation request received chat=" + chatId);

      const url = location.origin + "/backend-api/conversation/" + chatId;
      console.log("[Engram][ChatGPT] page bridge fresh fetch started chat=" + chatId);

      // Use originalFetch directly so the response bypasses the fetch wrapper's
      // response.clone().text() path (which is fine for automatic interception but
      // can race/abort on huge responses). We read the text ourselves and call
      // inspectText manually, then publishSnapshot fires window.postMessage.
      originalFetch(url)
        .then((response) => {
          console.log(
            "[Engram][ChatGPT] page bridge fresh fetch response chat=" + chatId +
            " status=" + response.status
          );
          return response.text();
        })
        .then((text) => {
          console.log(
            "[Engram][ChatGPT] page bridge inspectText start chat=" + chatId +
            " length=" + text.length
          );
          inspectText(text, url, "application/json", 200);
          // inspectText → publishSnapshot posts window.postMessage with snapshot.
          // Log the message count from latestDataLayerSnapshot is not available here,
          // but publishSnapshot itself logs extractedMessages to debug.
          console.log("[Engram][ChatGPT] page bridge publishSnapshot done chat=" + chatId);
        })
        .catch((err) => {
          console.warn(
            "[Engram][ChatGPT] page bridge fresh fetch error chat=" + chatId +
            " error=" + (err && err.message ? err.message : String(err))
          );
        });
    } catch (err) {
      console.warn("[Engram][ChatGPT] page bridge fetch-conversation handler error:", err);
    }
  });

  saveDebug();
  console.log("[Engram][ChatGPT] page-world bridge installed at document_start");
})();
