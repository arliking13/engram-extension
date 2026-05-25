/**
 * Engram — Background Service Worker
 * Receives messages from content scripts, manages storage, handles handoff generation.
 */

import { Storage } from "../storage/storage.js";

const storage   = new Storage();
const runtime   = typeof browser !== "undefined" ? browser.runtime   : chrome.runtime;
const storeApi  = typeof browser !== "undefined" ? browser.storage.local : chrome.storage.local;
const isFirefox = typeof browser !== "undefined";

// ── Message Router ──────────────────────────────────────────────────────────

runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const response = routeMessage(msg, sender);
  if (!response) return false;

  if (isFirefox) {
    return response.catch((error) => ({ error: error.message || String(error) }));
  }

  response
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error.message || String(error) }));
  return true;
});

function routeMessage(msg, sender) {
  switch (msg.type) {
    case "ENGRAM_NEW_MESSAGES":
      return handleNewMessages(msg, sender);

    case "ENGRAM_HEALTH_UPDATE":
      return handleHealthUpdate(msg, sender);

    case "ENGRAM_SCAN_COMPLETE":
      return handleScanComplete(msg, sender);

    case "ENGRAM_GET_STATE":
      return handleGetState();

    case "ENGRAM_GENERATE_HANDOFF":
      return handleGenerateHandoff(msg);

    case "ENGRAM_NEW_PROJECT":
      return handleNewProject(msg);

    case "ENGRAM_LIST_PROJECTS":
      return handleListProjects();

    case "ENGRAM_SWITCH_PROJECT":
      return handleSwitchProject(msg);

    case "ENGRAM_SAVE_JOB":
      return handleSaveJob(msg);

    case "ENGRAM_GET_CHATGPT_SNAPSHOT":
      return handleGetChatGPTSnapshot(msg, sender);

    default:
      return null;
  }
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function handleNewMessages(msg, sender) {
  const session = await storage.getCurrentSession(sender.tab?.id);
  await storage.appendMessages(session.id, msg.messages);
  return { ok: true };
}

async function handleHealthUpdate(msg, sender) {
  const session = await storage.getCurrentSession(sender.tab?.id);
  await storage.updateHealth(session.id, {
    score: msg.score,
    label: msg.label,
    color: msg.color,
    signals: msg.signals,
    updatedAt: Date.now(),
  });
  return { ok: true };
}

async function handleScanComplete(msg, sender) {
  console.log(
    "[Engram][BG] received chat scan result",
    `platform=${msg.platform || "unknown"}`,
    `total=${msg.total || 0}`,
    `strategy=${msg.extractionStrategy || "unknown"}`,
    `tabId=${sender.tab?.id ?? "none"}`
  );
  const session = await storage.getCurrentSession(sender.tab?.id);
  if (msg.messages?.length) {
    await storage.appendMessages(session.id, msg.messages);
  }
  console.log("[Engram][BG] stored active tab state tabId=" + (sender.tab?.id ?? "none"));
  return { ok: true };
}

async function handleGetState() {
  const session = await storage.getActiveSession();
  const health = await storage.getHealth(session?.id);
  const messages = await storage.getMessages(session?.id);
  return { session, health, messageCount: messages.length };
}

async function handleGenerateHandoff(msg) {
  const session = await storage.getActiveSession();
  const messages = await storage.getMessages(session?.id);

  if (!messages.length) {
    return { error: "No messages to package" };
  }

  const handoff = buildHandoffPackage(messages, session);
  await storage.saveHandoff(session.id, handoff);
  return { handoff };
}

async function handleNewProject(msg) {
  const project = await storage.createProject(msg.name, msg.platform || "claude");
  return { project };
}

async function handleListProjects() {
  const projects = await storage.listProjects();
  return { projects };
}

async function handleSwitchProject(msg) {
  await storage.setActiveProject(msg.projectId);
  return { ok: true };
}

async function handleSaveJob(msg) {
  const job = msg.job;
  if (!job) return { error: "No job data provided" };

  const stored = await storeApi.get("engramSavedJobs");
  const jobs   = stored.engramSavedJobs || [];
  jobs.push({ ...job, savedAt: Date.now() });
  await storeApi.set({ engramSavedJobs: jobs });

  console.log("[Engram] job saved");
  return { ok: true };
}

// ── Handoff Builder ─────────────────────────────────────────────────────────

function buildHandoffPackage(messages, session) {
  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  const allCode = messages.flatMap((m) => m.codeBlocks || []).filter((c) => c.code.length > 30);
  const totalChars = messages.reduce((s, m) => s + (m.text?.length || 0), 0);

  const prompt = buildContinuationPrompt(messages, allCode, session, totalChars);

  return {
    id: crypto.randomUUID(),
    sessionId: session?.id,
    createdAt: Date.now(),
    stats: {
      totalMessages: messages.length,
      userMessages: userMessages.length,
      assistantMessages: assistantMessages.length,
      codeBlocks: allCode.length,
    },
    continuationPrompt: prompt,
    rawMessages: messages.slice(-20),
  };
}

function buildContinuationPrompt(messages, allCode, session, totalChars) {
  const ts = new Date().toISOString();
  const recentMsgs = messages.slice(-30);
  const totalKb = Math.round((totalChars || 0) / 1000);

  const contextSection = recentMsgs
    .filter(m => m.text && m.text.trim().length > 5)
    .map(m => {
      const role = m.role === "user" ? "**User**" : "**Assistant**";
      const text = m.text.length > 1000 ? m.text.slice(0, 1000) + "\n[...truncated]" : m.text;
      return `${role}: ${text}`;
    })
    .join("\n\n---\n\n");

  const recentCode = allCode.slice(-5);
  let codeSection;
  if (allCode.length === 0) {
    codeSection = "_No code blocks captured._";
  } else if (allCode.length > 5) {
    codeSection = `_${allCode.length} code blocks total. Most recent ${recentCode.length}:_\n\n` +
      recentCode.map(c => `\`\`\`${c.language || "text"}\n${c.code.slice(0, 800)}\n\`\`\``).join("\n\n");
  } else {
    codeSection = allCode.map(c => `\`\`\`${c.language || "text"}\n${c.code.slice(0, 800)}\n\`\`\``).join("\n\n");
  }

  return `# Engram Handoff

> Deterministic handoff generated by Engram. This is not an AI summary.
> It is based on captured chat data. Use it to continue this session in a fresh chat.

## Source
- **Generated:** ${ts}
- **Session ID:** ${session?.id || "unknown"}

## Captured Stats
- User messages: ${messages.filter(m => m.role === "user").length}
- AI messages: ${messages.filter(m => m.role === "assistant").length}
- Total messages: ${messages.length}
- Total text: ~${totalKb}k characters
- Code blocks: ${allCode.length}

## Recent Context
_Last ${recentMsgs.length} messages:_

${contextSection || "_No messages captured._"}

## Code Blocks

${codeSection}

## Continuation Prompt

You are continuing an existing AI-assisted work session. Use the handoff above as the source of truth. Preserve the project decisions, current state, constraints, and next actions. Do not assume missing facts. Ask for clarification if something is not present.

**Session context:** ${messages.length} messages captured by Engram before migration.

Please acknowledge this handoff and confirm what we should focus on first.
`;
}

// ── ChatGPT Network Capture ──────────────────────────────────────────────────
// Firefox-only: uses browser.webRequest.filterResponseData to read the full
// /backend-api/conversation/<id> response at the network level, before it
// reaches the page. This captures conversations that bypass window.fetch wraps
// (service workers, preloads, framework loaders).
//
// Response chunks are written back unchanged so ChatGPT is not affected.
// Snapshot is stored in memory and pushed to the content script via tabs.sendMessage.
// Content script can also pull via ENGRAM_GET_CHATGPT_SNAPSHOT if the push was missed.

const chatgptNetworkSnapshots = new Map(); // `${tabId}:${chatId}` and `tab:${tabId}`

function _cgTextFromPart(part) {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return "";
  if (typeof part.text === "string") return part.text;
  if (typeof part.content === "string") return part.content;
  return "";
}

function _cgTextFromContent(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content.parts)) return content.parts.map(_cgTextFromPart).filter(Boolean).join("\n");
  if (typeof content.text === "string") return content.text;
  if (Array.isArray(content)) return content.map(_cgTextFromPart).filter(Boolean).join("\n");
  return "";
}

function _cgNormalizeNode(node) {
  const msg = (node && node.message) ? node.message : node;
  if (!msg || typeof msg !== "object") return null;
  const role = (msg.author && msg.author.role) || msg.role;
  if (role !== "user" && role !== "assistant") return null;
  const text = _cgTextFromContent(msg.content || msg).replace(/\r\n/g, "\n").trim();
  if (!text) return null;

  const codeBlocks = [];
  const re = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) {
    const code = (m[2] || "").trim();
    if (code) codeBlocks.push({ language: (m[1] || "unknown").trim() || "unknown", code });
  }

  return {
    role,
    text,
    codeBlocks,
    timestamp: msg.create_time ? Math.round(msg.create_time * 1000) : Date.now(),
    platform: "chatgpt",
  };
}

function _cgMessagesFromMapping(payload) {
  const mapping = payload.mapping;
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
    : Object.values(mapping).sort((a, b) => (a?.message?.create_time || 0) - (b?.message?.create_time || 0));

  return nodes.map(_cgNormalizeNode).filter(Boolean);
}

function _cgChatIdFromUrl(url) {
  try {
    const m = new URL(url).pathname.match(/\/backend-api\/conversation\/([a-z0-9-]+)/i);
    return m ? m[1] : "";
  } catch (_) { return ""; }
}

function _cgProcessResponse(text, sourceUrl, tabId) {
  const trimmed = (text || "").trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return;

  let payload;
  try {
    payload = JSON.parse(trimmed);
  } catch (err) {
    console.warn("[Engram][ChatGPT][BG] JSON parse failed:", err.message || err);
    return;
  }

  const messages    = _cgMessagesFromMapping(payload);
  const mappingFound    = !!payload.mapping;
  const currentNodeFound = !!(payload.current_node || payload.currentNode);
  const chatId      = payload.conversation_id || payload.id || _cgChatIdFromUrl(sourceUrl) || "unknown";
  const userCount   = messages.filter(m => m.role === "user").length;
  const aiCount     = messages.filter(m => m.role === "assistant").length;
  const codeCount   = messages.flatMap(m => m.codeBlocks || []).length;
  const totalChars  = messages.reduce((s, m) => s + (m.text?.length || 0), 0);

  console.log(
    "[Engram][ChatGPT][BG] mappingFound=" + mappingFound +
    " currentNodeFound=" + currentNodeFound +
    " messages=" + messages.length +
    " codeCount=" + codeCount
  );

  if (!messages.length) return;

  const snapshot = {
    chatId, sourceUrl, capturedAt: Date.now(),
    messages, userCount, aiCount, codeCount, totalChars,
    extractionStrategy: "chatgpt-background-network",
    partial: false,
  };

  chatgptNetworkSnapshots.set(tabId + ":" + chatId, snapshot);
  chatgptNetworkSnapshots.set("tab:" + tabId, snapshot);

  const tabsApi = isFirefox ? browser.tabs : chrome.tabs;
  tabsApi.sendMessage(tabId, { type: "ENGRAM_CHATGPT_BG_SNAPSHOT", snapshot })
    .then(() => {
      console.log("[Engram][ChatGPT][BG] snapshot sent to tab", tabId,
        "chatId=" + chatId, "messages=" + messages.length);
    })
    .catch((err) => {
      console.log("[Engram][ChatGPT][BG] tab message failed:", err.message || String(err));
    });
}

async function handleGetChatGPTSnapshot(msg, sender) {
  const tabId = sender.tab?.id;
  if (tabId == null || tabId < 0) return { snapshot: null };

  if (msg.chatId && msg.chatId !== "unknown") {
    const snap = chatgptNetworkSnapshots.get(tabId + ":" + msg.chatId);
    if (snap) return { snapshot: snap };
  }

  return { snapshot: chatgptNetworkSnapshots.get("tab:" + tabId) || null };
}

function setupChatGPTNetworkCapture() {
  const webReqApi = isFirefox ? browser.webRequest
    : (typeof chrome !== "undefined" ? chrome.webRequest : null);

  if (!webReqApi?.filterResponseData) {
    console.log("[Engram][ChatGPT][BG] filterResponseData unavailable; network capture disabled");
    return;
  }

  console.log("[Engram][ChatGPT][BG] filterResponseData available");

  try {
    webReqApi.onBeforeRequest.addListener(
      (details) => {
        // Skip sub-paths like /textdocs and extension-internal requests
        if (/\/backend-api\/conversation\/[a-z0-9-]+\//i.test(details.url)) return {};
        if (details.tabId < 0) return {};

        console.log("[Engram][ChatGPT][BG] conversation response filter attached:", details.url);

        const filter  = webReqApi.filterResponseData(details.requestId);
        const decoder = new TextDecoder("utf-8");
        const chunks  = [];

        filter.ondata = (event) => {
          chunks.push(decoder.decode(event.data, { stream: true }));
          filter.write(event.data);
        };

        filter.onstop = () => {
          const tail = decoder.decode();
          if (tail) chunks.push(tail);
          filter.disconnect();

          const text = chunks.join("");
          console.log("[Engram][ChatGPT][BG] response complete length=" + text.length);

          try {
            _cgProcessResponse(text, details.url, details.tabId);
          } catch (err) {
            console.warn("[Engram][ChatGPT][BG] processing failed:", err.message || err);
          }
        };

        filter.onerror = () => {
          console.warn("[Engram][ChatGPT][BG] filter error for", details.url);
        };

        return {};
      },
      {
        urls: [
          "https://chatgpt.com/backend-api/conversation/*",
          "https://chat.openai.com/backend-api/conversation/*",
        ],
      },
      ["blocking"]
    );
  } catch (err) {
    console.warn("[Engram][ChatGPT][BG] failed to register webRequest listener:", err.message || err);
  }
}

setupChatGPTNetworkCapture();

console.log("[Engram] Background worker started");
