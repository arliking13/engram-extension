/**
 * Engram — Background Service Worker
 * Receives messages from content scripts, manages storage, handles handoff generation.
 * Storage class is loaded as a regular script before this file (see manifest scripts array).
 */

const storage   = new Storage();
const runtime   = typeof browser !== "undefined" ? browser.runtime   : chrome.runtime;
const storeApi  = typeof browser !== "undefined" ? browser.storage.local : chrome.storage.local;
const isFirefox = typeof browser !== "undefined";
const tabsApi   = typeof browser !== "undefined" ? browser.tabs : chrome.tabs;
const ACTIVE_SCAN_SESSIONS_KEY = "engram:runtime:activeScanSessions";
const runtimeStoreApi = (
  (typeof browser !== "undefined" && browser.storage && browser.storage.session) ? browser.storage.session :
  (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) ? chrome.storage.session :
  storeApi
);
const usesRuntimeSessionStorage = runtimeStoreApi !== storeApi;

function runtimeStoreGet(key) {
  if (isFirefox) return runtimeStoreApi.get(key);
  return new Promise((resolve) => runtimeStoreApi.get(key, resolve));
}

function runtimeStoreSet(obj) {
  if (isFirefox) return runtimeStoreApi.set(obj);
  return new Promise((resolve) => runtimeStoreApi.set(obj, resolve));
}

function runtimeStoreRemove(key) {
  if (isFirefox) return runtimeStoreApi.remove(key);
  return new Promise((resolve) => runtimeStoreApi.remove(key, resolve));
}

async function clearActiveScanSession(tabId, reason) {
  if (tabId === undefined || tabId === null) return;
  try {
    const stored = await runtimeStoreGet(ACTIVE_SCAN_SESSIONS_KEY);
    const sessions = (stored && stored[ACTIVE_SCAN_SESSIONS_KEY]) || {};
    if (!sessions[String(tabId)]) return;
    delete sessions[String(tabId)];
    await runtimeStoreSet({ [ACTIVE_SCAN_SESSIONS_KEY]: sessions });
    console.log("[Engram][BG] active session cleared", { tabId, reason });
  } catch (e) {
    console.warn("[Engram][BG] active scan session clear failed", e);
  }
}

async function getActiveScanSessions() {
  try {
    const stored = await runtimeStoreGet(ACTIVE_SCAN_SESSIONS_KEY);
    return (stored && stored[ACTIVE_SCAN_SESSIONS_KEY]) || {};
  } catch (_) {
    return {};
  }
}

async function setActiveScanSessions(sessions) {
  await runtimeStoreSet({ [ACTIVE_SCAN_SESSIONS_KEY]: sessions || {} });
}

function scanResultTotal(result) {
  return Number(result?.total ?? result?.stats?.total ?? result?.messages?.length ?? 0) || 0;
}

function activeSessionMatches(session, tabId, platform, snapshotKey) {
  return !!session &&
    Number(session.tabId) === Number(tabId) &&
    session.platform === platform &&
    session.snapshotKey === snapshotKey &&
    !!session.scanResult;
}

function broadcastActiveScanSessionUpdated(tabId, activeSession) {
  if (!activeSession) return;
  const message = {
    type: "ENGRAM_ACTIVE_SCAN_SESSION_UPDATED",
    tabId,
    platform: activeSession.platform,
    snapshotKey: activeSession.snapshotKey,
    activeSession,
    scanResult: activeSession.scanResult,
  };

  try {
    const p = runtime.sendMessage(message);
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (_) {}

  try {
    const p = tabsApi.sendMessage(tabId, message);
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (_) {}
}

if (!usesRuntimeSessionStorage) {
  runtimeStoreRemove(ACTIVE_SCAN_SESSIONS_KEY).catch(() => {});
}

try {
  tabsApi.onUpdated.addListener((tabId, changeInfo) => {
    if (!changeInfo.url) return;
    clearActiveScanSession(tabId, "tab-url-changed");
  });
  tabsApi.onRemoved.addListener((tabId) => {
    clearActiveScanSession(tabId, "tab-removed");
  });
} catch (_) {}

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

    case "ENGRAM_LIVE_SCAN_COMPLETE":
      return handleLiveScanComplete(msg, sender);

    case "ENGRAM_GET_ACTIVE_SCAN_SESSION":
      return handleGetActiveScanSession(msg, sender);

    case "ENGRAM_SET_ACTIVE_SCAN_SESSION":
      return handleSetActiveScanSession(msg, sender);

    case "ENGRAM_CLEAR_ACTIVE_SCAN_SESSION":
      return handleClearActiveScanSession(msg, sender);

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

async function handleGetActiveScanSession(msg, sender) {
  const tabId = msg.tabId ?? sender.tab?.id;
  const platform = msg.platform;
  const snapshotKey = msg.snapshotKey;
  const sessions = await getActiveScanSessions();
  const session = sessions[String(tabId)] || null;
  const hasActiveSession = activeSessionMatches(session, tabId, platform, snapshotKey);
  return {
    ok: true,
    hasActiveSession,
    activeSession: hasActiveSession ? session : null,
    scanResult: hasActiveSession ? session.scanResult : null,
  };
}

async function handleSetActiveScanSession(msg, sender) {
  const tabId = msg.tabId ?? sender.tab?.id;
  const session = msg.session || {};
  const scanResult = session.scanResult || msg.scanResult;
  const platform = session.platform || msg.platform || scanResult?.platform;
  const snapshotKey = session.snapshotKey || msg.snapshotKey || scanResult?.snapshotKey;
  if (tabId === undefined || tabId === null || !platform || !snapshotKey || !scanResult) {
    return { ok: false, error: "missing active scan session fields" };
  }

  const now = Date.now();
  const nextSession = {
    tabId,
    platform,
    chatId: session.chatId || msg.chatId || scanResult.chatId || null,
    snapshotKey,
    sourceUrl: session.sourceUrl || msg.sourceUrl || scanResult.url || scanResult.sourceUrl || "",
    startedAt: session.startedAt || now,
    lastUpdatedAt: now,
    scanResult: {
      ...scanResult,
      platform,
      snapshotKey,
    },
  };

  const sessions = await getActiveScanSessions();
  sessions[String(tabId)] = nextSession;
  await setActiveScanSessions(sessions);
  console.log("[Engram][BG] active session set", {
    tabId,
    platform,
    snapshotKey,
    total: scanResultTotal(nextSession.scanResult),
  });
  broadcastActiveScanSessionUpdated(tabId, nextSession);

  return {
    ok: true,
    hasActiveSession: true,
    activeSession: nextSession,
    scanResult: nextSession.scanResult,
  };
}

async function handleClearActiveScanSession(msg, sender) {
  const tabId = msg.tabId ?? sender.tab?.id;
  await clearActiveScanSession(tabId, msg.reason || "explicit");
  return { ok: true, hasActiveSession: false };
}

async function handleLiveScanComplete(msg, sender) {
  const msgs = msg.messages || [];
  if (!msgs.length) return { ok: true };
  const platform = msg.platform;
  if (platform !== "chatgpt" && platform !== "claude") return { ok: true };
  const tabId = sender.tab?.id ?? msg.tabId;
  const chatId = msg.chatId || "unknown";
  const snapshotKey = msg.snapshotKey || ((chatId && chatId !== "unknown")
    ? "chat:" + chatId
    : "url:" + String(msg.sourceUrl || "").split("?")[0]);

  console.log("[Engram][BG] live update received", {
    tabId,
    platform: msg.platform,
    snapshotKey: msg.snapshotKey,
    total: msg.total,
    messages: Array.isArray(msg.messages) ? msg.messages.length : 0,
  });

  const activeSessions = await getActiveScanSessions();
  const activeSession = activeSessions[String(tabId)] || null;
  console.log("[Engram][BG] active session lookup for live update", {
    tabId,
    platform,
    incomingSnapshotKey: msg.snapshotKey,
    activeSnapshotKey: activeSession?.snapshotKey || null,
    hasActiveSession: !!activeSession,
  });
  if (!activeSessionMatches(activeSession, tabId, platform, snapshotKey)) {
    console.log("[Engram][BG] live update ignored: no matching active session", {
      tabId,
      platform,
      incomingSnapshotKey: msg.snapshotKey,
      activeSnapshotKey: activeSession?.snapshotKey || null,
    });
    return { ok: true, hasActiveSession: false, baselineEstablished: false };
  }

  // Per-conversation storage keyed by snapshotKey (allows multi-tab isolation)
  const byKeyStorageKey = platform === "chatgpt"
    ? "engram:chatgpt:snapshotsByKey"
    : "engram:claude:snapshotsByKey";
  let snapshotsByKey = {};
  try {
    const existing = await storeApi.get(byKeyStorageKey);
    snapshotsByKey = (existing && existing[byKeyStorageKey]) || {};
  } catch (_) {}

  const _liveBestMessages = (snapshot) => {
    if (Array.isArray(snapshot?.messages) && snapshot.messages.length) return snapshot.messages;
    if (Array.isArray(snapshot?.displayMessages) && snapshot.displayMessages.length) return snapshot.displayMessages;
    if (Array.isArray(snapshot?.rawMessages) && snapshot.rawMessages.length) return snapshot.rawMessages;
    return [];
  };

  const _existingMessages = _liveBestMessages(activeSession.scanResult);
  const _existingTotal = Number(
    activeSession.scanResult?.stats?.total ??
    activeSession.scanResult?.total ??
    activeSession.scanResult?.messageCount ??
    activeSession.scanResult?.displayMessageCount ??
    _existingMessages.length ??
    0
  ) || 0;

  const _incomingTotal = Number(
    msg.total ??
    msg.displayMessageCount ??
    msgs.length ??
    0
  ) || 0;
  const oldTotal = _existingTotal;
  const mergeMessages = (existingMessages, incomingMessages) => {
    const merged = Array.isArray(existingMessages) ? existingMessages.slice() : [];
    const seen = new Set(merged.map((m) => [
      String(m?.role || ""),
      String(m?.text || "").trim(),
    ].join("|")));
    (Array.isArray(incomingMessages) ? incomingMessages : []).forEach((m) => {
      const key = [
        String(m?.role || ""),
        String(m?.text || "").trim(),
      ].join("|");
      if (!String(m?.text || "").trim() || seen.has(key)) return;
      seen.add(key);
      merged.push(m);
    });
    return merged;
  };

  let effectiveMessages = msgs;
  if (_existingTotal > 0 && _incomingTotal > 0 && _incomingTotal < _existingTotal) {
    const mergedMessages = mergeMessages(_existingMessages, msgs);
    if (mergedMessages.length <= _existingTotal) {
      console.log(
        "[Engram][BG] live scan ignored: partial snapshot would shrink baseline",
        `platform=${platform}`,
        `reason=${msg.liveReason}`,
        `snapshotKey=${snapshotKey}`,
        `incoming=${_incomingTotal}`,
        `existing=${_existingTotal}`
      );

      return {
        ok: true,
        baselineEstablished: true,
        hasActiveSession: true,
        ignored: true,
        reason: "partial_live_snapshot_no_new_messages",
        incomingTotal: _incomingTotal,
        existingTotal: _existingTotal,
        activeSession,
        scanResult: activeSession.scanResult,
      };
    }

    effectiveMessages = mergedMessages;
    console.log("[Engram][BG] live partial snapshot merged into active session", {
      tabId,
      platform,
      snapshotKey,
      incomingTotal: _incomingTotal,
      oldTotal: _existingTotal,
      newTotal: effectiveMessages.length,
    });
  }

  const obj = {
    platform, chatId, snapshotKey,
    sourceUrl:    msg.sourceUrl    || "",
    sourceTitle:  msg.sourceTitle  || "",
    scannedAt:    msg.scannedAt    || Date.now(),
    liveReason:   msg.liveReason   || "live",
    extractionStrategy: msg.extractionStrategy || "live-dom",
    baselineEstablished: true,
    baselineSource:      "live_update_after_baseline",
    stats: {
      total:      effectiveMessages.length,
      userCount:  effectiveMessages.filter((m) => m.role === "user").length,
      aiCount:    effectiveMessages.filter((m) => m.role === "assistant").length,
      codeCount:  effectiveMessages.flatMap((m) => Array.isArray(m.codeBlocks) ? m.codeBlocks : []).length,
      totalChars: effectiveMessages.reduce((sum, m) => sum + String(m.text || "").length, 0),
    },
    messages: effectiveMessages,
  };
  if (Array.isArray(msg.displayMessages) && msg.displayMessages.length) obj.displayMessages = msg.displayMessages;
  if (Array.isArray(msg.rawMessages)     && msg.rawMessages.length)     obj.rawMessages     = msg.rawMessages;

  activeSessions[String(tabId)] = {
    ...activeSession,
    tabId,
    platform,
    chatId,
    snapshotKey,
    sourceUrl: obj.sourceUrl,
    lastUpdatedAt: Date.now(),
    scanResult: obj,
  };
  await setActiveScanSessions(activeSessions);
  console.log("[Engram][BG] live update applied to active session", {
    tabId,
    platform,
    snapshotKey,
    oldTotal,
    newTotal: scanResultTotal(obj),
  });
  broadcastActiveScanSessionUpdated(tabId, activeSessions[String(tabId)]);

  snapshotsByKey[snapshotKey] = obj;

  const writes = platform === "chatgpt" ? {
    "engramChatgptLatestScanResult":         obj,
    "engramChatgptLatestSnapshot":           obj,
    "engram:chatgpt:conversationSnapshot":   obj,
    [byKeyStorageKey]:                       snapshotsByKey,
  } : {
    "engramClaudeLatestScanResult":          obj,
    "engramClaudeLatestSnapshot":            obj,
    "engram:claude:conversationSnapshot":    obj,
    [byKeyStorageKey]:                       snapshotsByKey,
  };
  await storeApi.set(writes);
  console.log("[Engram][BG] live scan persisted", `platform=${platform}`, `reason=${msg.liveReason}`, `snapshotKey=${snapshotKey}`, `messages=${msgs.length}`);
  return {
    ok: true,
    hasActiveSession: true,
    baselineEstablished: true,
    activeSession: activeSessions[String(tabId)],
    scanResult: obj,
  };
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

function _extractLinkedInSourceId(url) {
  const s = String(url || "");
  let m = s.match(/\/jobs\/view\/([\w-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]currentJobId=([\w-]+)/);
  if (m) return m[1];
  return null;
}

function _canonicalJobUrl(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname.replace(/\/$/, "");
  } catch (_) {
    return String(url || "").split("?")[0];
  }
}

async function _updateLogoCache(job) {
  if (!job || !job.companyLogoUrl || !job.company) return;
  try {
    const stored = await storeApi.get("engramCompanyLogoCache");
    const cache  = (stored && stored.engramCompanyLogoCache) || {};
    const key    = job.company.toLowerCase().trim();
    cache[key] = {
      company:         job.company,
      companyLogoUrl:  job.companyLogoUrl,
      companyInitials: job.companyInitials || null,
      updatedAt:       Date.now(),
    };
    await storeApi.set({ engramCompanyLogoCache: cache });
  } catch (e) {
    console.warn("[Engram] logo cache update failed", e);
  }
}

async function handleSaveJob(msg) {
  const job = msg.job;
  if (!job) {
    console.error("[Engram] handleSaveJob: no job in message", msg);
    return { error: "No job data provided" };
  }

  let stored, jobs;
  try {
    stored = await storeApi.get("engramSavedJobs");
    jobs   = stored.engramSavedJobs || [];
  } catch (e) {
    console.error("[Engram] handleSaveJob: storage read failed", e);
    return { error: "Storage read failed: " + String(e) };
  }

  const sourceJobId  = _extractLinkedInSourceId(job.url || "");
  const canonicalUrl = sourceJobId
    ? "https://www.linkedin.com/jobs/view/" + sourceJobId + "/"
    : _canonicalJobUrl(job.url || "");

  const jobId = sourceJobId
    ? ("li:" + sourceJobId)
    : ("url:" + canonicalUrl);

  const idx = jobs.findIndex(j => j.id === jobId);
  if (idx !== -1) {
    const ex = jobs[idx];
    jobs[idx] = {
      ...ex,
      title:           job.title           || ex.title,
      company:         job.company         || ex.company,
      location:        job.location        || ex.location,
      remoteStatus:    job.remoteStatus    || ex.remoteStatus,
      salary:          job.salary          || ex.salary,
      description:     job.description     || ex.description,
      companyLogoUrl:  job.companyLogoUrl  || ex.companyLogoUrl  || null,
      companyInitials: job.companyInitials || ex.companyInitials || null,
      canonicalUrl,
      updatedAt:       Date.now(),
    };
    try {
      await storeApi.set({ engramSavedJobs: jobs });
    } catch (e) {
      console.error("[Engram] handleSaveJob: storage write failed", e);
      return { error: "Storage write failed: " + String(e) };
    }
    await _updateLogoCache(job);
    console.log("[Engram] job updated (dedup)", jobId);
    return { ok: true, id: jobId, isNew: false, savedCount: jobs.length };
  }

  const newJob = {
    id:              jobId,
    source:          "linkedin",
    sourceJobId:     sourceJobId || null,
    title:           job.title           || null,
    company:         job.company         || null,
    location:        job.location        || null,
    remoteStatus:    job.remoteStatus    || null,
    salary:          job.salary          || null,
    description:     job.description     || null,
    companyLogoUrl:  job.companyLogoUrl  || null,
    companyInitials: job.companyInitials || null,
    url:             job.url             || null,
    canonicalUrl,
    capturedAt:      job.capturedAt      || Date.now(),
    updatedAt:       Date.now(),
    queued:          true,
    usedInPackages:  [],
    notes:           "",
  };
  jobs.push(newJob);
  try {
    await storeApi.set({ engramSavedJobs: jobs });
  } catch (e) {
    console.error("[Engram] handleSaveJob: storage write failed", e);
    return { error: "Storage write failed: " + String(e) };
  }
  await _updateLogoCache(job);
  console.log("[Engram] job saved", jobId, "total:", jobs.length);
  return { ok: true, id: jobId, isNew: true, savedCount: jobs.length };
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
