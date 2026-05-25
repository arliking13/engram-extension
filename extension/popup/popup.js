/**
 * Engram Popup — State Machine & UI Logic
 */

const $ = (id) => document.getElementById(id);
const _api = typeof browser !== "undefined" ? browser : chrome;
const isFirefox = typeof browser !== "undefined";

console.log("[Engram] popup loaded");

const ENGRAM_DEBUG_POPUP = false;
function _dpbg(...args) { if (ENGRAM_DEBUG_POPUP) console.log("[Engram][Popup][debug]", ...args); }

function on(id, eventName, handler) {
  const el = $(id);
  if (!el) {
    console.warn(`[Engram] popup element missing: #${id}`);
    return;
  }
  el.addEventListener(eventName, handler);
}

function runtimeSendMessage(message) {
  if (isFirefox) {
    return _api.runtime.sendMessage(message).catch(() => null);
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(response);
    });
  });
}

function tabsQuery(query) {
  if (isFirefox) return _api.tabs.query(query);

  return new Promise((resolve) => {
    chrome.tabs.query(query, resolve);
  });
}

function tabsCreate(createProperties) {
  if (isFirefox) return _api.tabs.create(createProperties);

  return new Promise((resolve) => {
    chrome.tabs.create(createProperties, resolve);
  });
}

function tabsSendMessage(tabId, message) {
  if (isFirefox) {
    return _api.tabs.sendMessage(tabId, message).catch(() => null);
  }

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(response);
    });
  });
}

function storageGet(key) {
  if (isFirefox) return _api.storage.local.get(key);
  return new Promise((resolve) => { chrome.storage.local.get(key, resolve); });
}

function storageSet(obj) {
  if (isFirefox) return _api.storage.local.set(obj);
  return new Promise((resolve) => { chrome.storage.local.set(obj, resolve); });
}

const ACTIVE_SCAN_SESSIONS_KEY = "engram:runtime:activeScanSessions";
const EXPORT_FRESH_SCAN_TIMEOUT_MS = 12000;

// TODO: Replace YOUR-VERCEL-APP with the real deployed Vercel URL before Demo Day.
const DEMO_HANDOFF_ENDPOINT = "https://YOUR-VERCEL-APP.vercel.app/api/handoff";
const ENGRAM_SITE_URL = "https://engram-blush-tau.vercel.app/";
const HEALTH_SNAPSHOT_KEY = "engramLastHealthSnapshot";
const HEALTH_SNAPSHOTS_BY_CHAT_KEY = "engramHealthSnapshotsByChatId";
const PLATFORM_LOGOS = {
  chatgpt: "../assets/platforms/chatgpt-logo.svg",
  claude: "../assets/platforms/claude-logo.svg",
};

function isDemoEndpointPlaceholder() {
  return DEMO_HANDOFF_ENDPOINT.includes("YOUR-VERCEL-APP");
}

// Settings
const DEFAULT_SETTINGS = {
  mode: "demo",
  customProvider: "openai",
  customApiKey: "",
  customEndpoint: "",
  showMiniHealthWidget: false,
  linkedInWidgetEnabled: true,
};
let engramSettings = { ...DEFAULT_SETTINGS };

async function loadSettings() {
  try {
    const stored = await storageGet("engramSettings");
    if (stored && stored.engramSettings) {
      engramSettings = { ...DEFAULT_SETTINGS, ...stored.engramSettings };
    }
    console.log("[Engram] settings loaded");
    applySettingsToUI();
  } catch (e) {
    console.log("[Engram] settings load failed, using defaults");
  }
}

function syncLinkedInToggles() {
  const isOn = engramSettings.linkedInWidgetEnabled !== false;
  ["btnLinkedInWidgetToggle", "btnLinkedInWidgetToggleMain"].forEach((id) => {
    const btn = $(id);
    if (!btn) return;
    btn.textContent = isOn ? "On" : "Off";
    btn.classList.toggle("on", isOn);
  });
}

function applySettingsToUI() {
  updateModeToggle(engramSettings.mode);

  const apiKeyInput      = $("inputApiKey");
  const customEndpointEl = $("inputCustomEndpoint");
  const providerSelect   = $("selectProvider");
  const panelDemo        = $("panelDemo");
  const panelCustom      = $("panelCustom");

  if (apiKeyInput)      apiKeyInput.value      = engramSettings.customApiKey   || "";
  if (customEndpointEl) customEndpointEl.value = engramSettings.customEndpoint || "";
  if (providerSelect)   providerSelect.value   = engramSettings.customProvider || "openai";

  if (panelDemo)   panelDemo.style.display   = engramSettings.mode === "demo"   ? "block" : "none";
  if (panelCustom) panelCustom.style.display = engramSettings.mode === "custom" ? "block" : "none";

  updateDemoStatus();

  const widgetToggle = $("btnWidgetToggle");
  if (widgetToggle) {
    const on = !!engramSettings.showMiniHealthWidget;
    widgetToggle.textContent = on ? "On" : "Off";
    widgetToggle.classList.toggle("on", on);
  }

  syncLinkedInToggles();
}

function updateModeToggle(mode) {
  const btnDemo   = $("btnModeDemo");
  const btnCustom = $("btnModeCustom");
  if (!btnDemo || !btnCustom) return;
  btnDemo.classList.toggle("active", mode === "demo");
  btnCustom.classList.toggle("active", mode === "custom");
}

function updateDemoStatus() {
  const statusEl = $("demoStatus");
  if (!statusEl) return;
  if (isDemoEndpointPlaceholder()) {
    statusEl.textContent = "Demo backend URL not connected yet.";
    statusEl.className = "settings-warning";
  } else {
    statusEl.textContent = "Connected to Engram demo backend.";
    statusEl.className = "settings-demo-ok";
  }
}

function openEngramSite() {
  tabsCreate({ url: ENGRAM_SITE_URL }).catch(() => {
    try {
      window.open(ENGRAM_SITE_URL, "_blank", "noopener,noreferrer");
    } catch (_) {}
  });
}

async function saveSettings() {
  const apiKeyInput      = $("inputApiKey");
  const customEndpointEl = $("inputCustomEndpoint");
  const providerSelect   = $("selectProvider");

  const next = {
    mode:                 engramSettings.mode,
    customProvider:       providerSelect   ? providerSelect.value           : "openai",
    customApiKey:         apiKeyInput      ? apiKeyInput.value              : "",
    customEndpoint:       customEndpointEl ? customEndpointEl.value.trim()  : "",
    showMiniHealthWidget: !!engramSettings.showMiniHealthWidget,
    linkedInWidgetEnabled: engramSettings.linkedInWidgetEnabled !== false,
  };

  // In Demo Mode, don't persist sensitive fields
  if (next.mode === "demo") {
    next.customApiKey   = "";
    next.customEndpoint = "";
  }

  try {
    await storageSet({ engramSettings: next });
    engramSettings = next;
    console.log("[Engram] settings saved");
    updateDemoStatus();

    const btn = $("btnSaveSettings");
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = "Saved ✓";
      btn.disabled = true;
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
    }
  } catch (e) {
    console.log("[Engram] settings save failed");
  }
}

// AI handoff via Vercel proxy — fails safely back to local export
async function tryAIHandoff(sourceScanResult = scanResults) {
  let endpoint;

  if (engramSettings.mode === "demo") {
    if (isDemoEndpointPlaceholder()) {
      console.log("[Engram] handoff generation fallback used");
      return false;
    }
    endpoint = DEMO_HANDOFF_ENDPOINT;
  } else {
    endpoint = engramSettings.customEndpoint;
    if (!endpoint) return false;
  }

  try {
    const messages = (sourceScanResult?.messages || []).map(m => ({
      role: m.role,
      text: m.text
    }));

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages })
    });

    if (!resp.ok) {
      console.log("[Engram] handoff generation fallback used");
      return false;
    }

    const data = await resp.json();
    const prompt = data.continuationPrompt || data.handoff;
    if (!prompt) {
      console.log("[Engram] handoff generation fallback used");
      return false;
    }

    await navigator.clipboard.writeText(prompt);
    $("statusBar").textContent = "✓ AI Handoff copied to clipboard!";
    $("statusBar").style.color = "#22c55e";
    clearStatusBarLater($("statusBar").textContent, 3000);
    return true;
  } catch (e) {
    console.log("[Engram] handoff generation fallback used");
    return false;
  }
}

// State machine
let currentState = "idle";
let scanResults = null;
let isScanning = false;
let hasLocalScanResult = false;
let lastRenderSource = "init";
let stateBeforeSettings = null;
let lastHealthData = null;
let statusClearTimer = null;
let lastHealthSnapshotSignature = "";
let activePlatform = "other";
let activeTabId = null;
let activeSnapshotKey = null;      // snapshotKey for the currently active tab
let _lastKnownSnapshotKey = null;  // detect SPA navigation between popup polls

function clearStatusBarLater(expectedText, ms = 3000, resetColor = false) {
  if (statusClearTimer) clearTimeout(statusClearTimer);
  statusClearTimer = setTimeout(() => {
    const statusBar = $("statusBar");
    if (!statusBar || statusBar.textContent !== expectedText) return;
    statusBar.textContent = "";
    if (resetColor) statusBar.style.color = "";
  }, ms);
}

function updateChatTitleEl(title) {
  const el = $("chatTitle");
  if (!el) return;
  const display = (title || "").trim();
  if (display) {
    el.textContent = display;
    el.title = display;
    el.classList.remove("no-title");
  } else {
    el.textContent = "";
    el.title = "";
    el.classList.add("no-title");
  }
}

function showState(state) {
  currentState = state;
  $("idleView").style.display     = state === "idle"     ? "block" : "none";
  $("scanningView").style.display = state === "scanning" ? "block" : "none";
  $("doneView").style.display     = state === "done"     ? "block" : "none";
  $("settingsView").style.display = state === "settings" ? "block" : "none";
  $("linkedinView").style.display = state === "linkedin" ? "block" : "none";
  updateSettingsButtonState(state === "settings");
}

function updateSettingsButtonState(isOpen) {
  const btn = $("btnSettings");
  if (!btn) return;
  btn.classList.toggle("settings-active", isOpen);
  btn.setAttribute("aria-pressed", isOpen ? "true" : "false");
  btn.setAttribute("aria-label", isOpen ? "Close settings" : "Open settings");
  btn.title = isOpen ? "Close settings" : "Settings";
}

function getMainPopupState() {
  if (stateBeforeSettings && stateBeforeSettings !== "settings") return stateBeforeSettings;
  if (scanResults) return "done";
  if (isScanning) return "scanning";
  return "idle";
}

function renderIdle(message = "Scan required", disabled = false, detail = "Scan this chat to start live tracking.") {
  console.log("[Engram] rendering idle state", message);
  lastRenderSource = "idle";
  showState("idle");
  if (disabled && detail === "Scan this chat to start live tracking.") detail = "";

  const hint = document.querySelector("#idleView .idle-hint");
  const scanButton = $("btnScan");

  if (hint) hint.textContent = message;
  if (hint) {
    let detailEl = $("idleScanDetail");
    if (!detailEl && hint.parentElement) {
      detailEl = document.createElement("div");
      detailEl.id = "idleScanDetail";
      detailEl.className = "idle-detail";
      hint.parentElement.insertBefore(detailEl, hint.nextSibling);
    }
    if (detailEl) {
      detailEl.textContent = detail || "";
      detailEl.style.display = detail ? "" : "none";
    }
  }
  if (scanButton) {
    scanButton.disabled = disabled;
    scanButton.textContent = "Scan";
  }
}

function renderError(message) {
  console.log("[Engram] rendering error state", message);
  if (isScanning || hasLocalScanResult) {
    console.log("[Engram] ignoring stale state response", {
      currentState,
      hasLocalScanResult,
      isScanning,
      message,
    });
    keepLocalScanResult();
    return;
  }

  renderIdle(message || "State unavailable. Scan Chat is still available.");
}


function getScanResultCounts(sr) {
  if (!sr) {
    return { userCount: 0, aiCount: 0, total: 0, codeCount: 0 };
  }

  const messages = Array.isArray(sr.messages) ? sr.messages : [];
  const displayMessages = Array.isArray(sr.displayMessages) ? sr.displayMessages : [];
  const rawMessages = Array.isArray(sr.rawMessages) ? sr.rawMessages : [];

  const bestMessages =
    messages.length ? messages :
    displayMessages.length ? displayMessages :
    rawMessages.length ? rawMessages :
    [];

  const roleOf = (m) =>
    String(m?.role || m?.author?.role || m?.sender || m?.type || "").toLowerCase();

  const userFromMessages = bestMessages.filter((m) =>
    /user|human/.test(roleOf(m))
  ).length;

  const aiFromMessages = bestMessages.filter((m) =>
    /assistant|ai|model|claude|chatgpt/.test(roleOf(m))
  ).length;

  const codeFromMessages = bestMessages
    .flatMap((m) => Array.isArray(m?.codeBlocks) ? m.codeBlocks : [])
    .length;

  const total =
    Number(sr.total ?? sr.stats?.total ?? sr.messageCount ?? sr.displayMessageCount) ||
    bestMessages.length ||
    userFromMessages + aiFromMessages ||
    0;

  const userCount =
    Number(sr.userCount ?? sr.stats?.userCount) ||
    userFromMessages ||
    0;

  const aiCount =
    Number(sr.aiCount ?? sr.assistantCount ?? sr.stats?.aiCount) ||
    aiFromMessages ||
    Math.max(0, total - userCount) ||
    0;

  const codeCount =
    Number(sr.codeCount ?? sr.stats?.codeCount) ||
    codeFromMessages ||
    0;

  return { userCount, aiCount, total, codeCount };
}

function markScanFreshness(result, freshnessState) {
  if (!result) return result;
  result.freshnessState = freshnessState;
  result.isCachedBaseline = false;
  result.needsRefresh = false;
  return result;
}

function renderDone(source = "local") {
  if (!scanResults) return;

  console.log("[Engram] rendering done state", source);
  lastRenderSource = source;
  showState("done");

  const counts = getScanResultCounts(scanResults);

  scanResults.userCount = counts.userCount;
  scanResults.aiCount = counts.aiCount;
  scanResults.total = counts.total;
  scanResults.codeCount = counts.codeCount;

  console.log("[Engram][Popup] render counts", {
    source,
    counts,
    rawTopLevel: {
      userCount: scanResults.userCount,
      aiCount: scanResults.aiCount,
      total: scanResults.total,
      codeCount: scanResults.codeCount,
    },
    stats: scanResults.stats || null,
    messages: Array.isArray(scanResults.messages) ? scanResults.messages.length : 0,
    displayMessages: Array.isArray(scanResults.displayMessages) ? scanResults.displayMessages.length : 0,
    rawMessages: Array.isArray(scanResults.rawMessages) ? scanResults.rawMessages.length : 0,
  });

  $("userCount").textContent = counts.userCount;
  $("aiCount").textContent = counts.aiCount;
  $("totalCount").textContent = counts.total;
  $("codeCount").textContent = counts.codeCount;
  $("btnScan").disabled = false;
  const _rescanBtn = $("btnRescan");
  if (_rescanBtn) {
    _rescanBtn.disabled = false;
    _rescanBtn.textContent = "Rescan";
    _rescanBtn.title = "Rescan this chat for updated message count";
  }

  if (scanResults._fromCachedSnapshot && lastHealthData) {
    updateGauge(lastHealthData.score);
    updateHealthPanel(lastHealthData);
  } else {
    const healthData = computeHealthFromScan(scanResults);
    lastHealthData = healthData;
    updateGauge(healthData.score);
    updateHealthPanel(healthData);
    saveHealthSnapshot(scanResults, healthData);
  }
}

function keepLocalScanResult() {
  if (!scanResults) return false;

  console.log("[Engram] keeping local scan result", {
    source: lastRenderSource,
    total: scanResults.total,
    chatId: scanResults.chatId,
  });
  renderDone("local-scan");
  return true;
}
function renderFromCache(snapshot) {
  console.log("[Engram][Popup] cached snapshot ignored for visible popup state", {
    snapshotKey: snapshot?.snapshotKey || null,
    platform: snapshot?.platform || null,
  });
  return false;
}

// Update speedometer gauge
function getMigrationRiskClass(risk) {
  switch (String(risk || "").toLowerCase()) {
    case "low":      return "risk-low";
    case "moderate": return "risk-medium";
    case "elevated": return "risk-high";
    case "critical": return "risk-critical";
    default:         return "";
  }
}

function getHealthDisplay(score) {
  if (score >= 90) {
    return { label: "Safe", color: "#22c55e", hint: "Safe to continue." };
  }
  if (score >= 75) {
    return { label: "Good", color: "#84cc16", hint: "Safe to continue." };
  }
  if (score >= 50) {
    return { label: "Fair", color: "#f59e0b", hint: "Prepare a handoff soon." };
  }
  if (score >= 25) {
    return { label: "Risky", color: "#f97316", hint: "Generate a handoff before continuing." };
  }
  return { label: "Critical", color: "#ef4444", hint: "Move to a fresh chat now." };
}

function updateGauge(score) {
  if (score === undefined) return;

  const needleGroup = $("gaugeNeedleGroup");
  const statusEl    = $("gaugeStatus");
  const hintEl      = $("gaugeHint");

  if (!needleGroup || !statusEl) return;

  // score 0 = critical = left (-90deg), score 100 = fresh = right (+90deg)
  const angle = -90 + (score / 100 * 180);
  needleGroup.style.transform = `rotate(${angle}deg)`;

  const { label, color, hint } = getHealthDisplay(score);

  statusEl.textContent = label;
  statusEl.style.color = color;
  if (hintEl) hintEl.textContent = hint;
}

function saveHealthSnapshot(sr, hd) {
  if (!sr || !hd) return;

  const healthDisplay = getHealthDisplay(hd.score);
  const snapshotKey = getHealthSnapshotKey(sr);
  const snapshot = {
    chatId: sr.chatId || null,
    snapshotKey,
    sourceUrl: sr.url || "",
    sourceTitle: sr.sourceTitle || "Untitled chat",
    platform: getPlatformId(sr),
    scannedAt: sr.scannedAt || Date.now(),

    healthScore: hd.score,
    healthLabel: healthDisplay.label,
    statusLabel: healthDisplay.label,
    healthColor: healthDisplay.color,
    migrationRisk: hd.migrationRisk,
    browserLoad: hd.browserLoad,
    action: hd.action,
    reasons: hd.reasons || [],

    stats: {
      userCount: sr.userCount || 0,
      aiCount: sr.aiCount || 0,
      total: sr.total || 0,
      codeCount: sr.codeCount || 0,
      totalChars: sr.totalChars || 0,
    },
  };

  const signature = [
    snapshotKey,
    snapshot.scannedAt,
    snapshot.healthScore,
    snapshot.healthLabel,
    snapshot.migrationRisk,
    snapshot.browserLoad,
    snapshot.stats.total,
    snapshot.stats.codeCount,
  ].join("|");
  if (signature === lastHealthSnapshotSignature) return;
  lastHealthSnapshotSignature = signature;

  storageGet(HEALTH_SNAPSHOTS_BY_CHAT_KEY)
    .then((stored) => {
      const existing = stored?.[HEALTH_SNAPSHOTS_BY_CHAT_KEY] || {};
      const nextMap = { ...existing, [snapshotKey]: snapshot };
      const limitedEntries = Object.entries(nextMap)
        .sort((a, b) => (b[1]?.scannedAt || 0) - (a[1]?.scannedAt || 0))
        .slice(0, 20);

      return storageSet({
        [HEALTH_SNAPSHOT_KEY]: snapshot,
        [HEALTH_SNAPSHOTS_BY_CHAT_KEY]: Object.fromEntries(limitedEntries),
      });
    })
    .catch(() => {
      return storageSet({ [HEALTH_SNAPSHOT_KEY]: snapshot });
    })
    .catch(() => {
    console.log("[Engram] health snapshot save failed");
  });
}

async function persistScanResult(result) {
  if (!result) return;
  const msgs = result.messages || [];
  if (msgs.length === 0) return; // never overwrite a stored snapshot with an empty result

  const platform = getPlatformId(result);
  if (platform !== "chatgpt" && platform !== "claude") return;

  // Use popup's computed snapshotKey (from URL) when chatId is unknown — fixes Claude's broken chatId
  let snapshotKey, definiteChatId;
  if (activeSnapshotKey && (result.chatId === "unknown" || !result.chatId)) {
    snapshotKey = activeSnapshotKey;
    definiteChatId = snapshotKey.startsWith("chat:") ? snapshotKey.slice(5) : (result.chatId || "unknown");
  } else {
    snapshotKey = getHealthSnapshotKey(result);
    definiteChatId = result.chatId || "unknown";
  }
  const obj = {
    platform,
    chatId:      definiteChatId,
    snapshotKey,
    sourceUrl:   result.url       || "",
    sourceTitle: result.sourceTitle || "",
    scannedAt:   result.scannedAt || Date.now(),
    extractionStrategy: result.extractionStrategy || "",
    baselineEstablished: true,
    baselineSource:      "manual_scan",
    stats: {
      total:      result.total      || msgs.length,
      userCount:  result.userCount  || 0,
      aiCount:    result.aiCount    || 0,
      codeCount:  result.codeCount  || 0,
      totalChars: result.totalChars || 0,
    },
    messages: msgs,
  };

  if (result.displayMessages && result.displayMessages.length > 0) {
    obj.displayMessages = result.displayMessages;
  }
  if (result.rawMessages && result.rawMessages.length > 0) {
    obj.rawMessages = result.rawMessages;
  }

  // Write to snapshotsByKey so live observer can verify baseline before persisting
  const byKeyKey = platform === "chatgpt" ? "engram:chatgpt:snapshotsByKey" : "engram:claude:snapshotsByKey";
  let snapshotsByKey = {};
  try {
    const stored = await storageGet(byKeyKey);
    snapshotsByKey = (stored && stored[byKeyKey]) || {};
  } catch (_) {}
  snapshotsByKey[snapshotKey] = obj;

  let writes;
  if (platform === "chatgpt") {
    writes = {
      "engramChatgptLatestScanResult":        obj,
      "engramChatgptLatestSnapshot":          obj,
      "engram:chatgpt:conversationSnapshot":  obj,
      [byKeyKey]:                             snapshotsByKey,
    };
  } else {
    writes = {
      "engramClaudeLatestScanResult":       obj,
      "engramClaudeLatestSnapshot":         obj,
      "engram:claude:conversationSnapshot": obj,
      [byKeyKey]:                           snapshotsByKey,
    };
  }

  try {
    await storageSet(writes);
    console.log(
      "[Engram] scan result persisted",
      `platform=${platform}`,
      `chatId=${obj.chatId}`,
      `messages=${msgs.length}`,
      "baselineEstablished=true"
    );
  } catch (e) {
    console.warn("[Engram] scan result persist failed", e);
  }
}

function normalizeHealthSnapshotUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  } catch (_) {
    return "";
  }
}

function snapshotMatchesPlatform(snapshot, platform) {
  if (!snapshot || !platform || platform === "other") return false;
  return getPlatformId({
    platform: snapshot.platform || snapshot.sourcePlatform || "",
    sourcePlatform: snapshot.platform || snapshot.sourcePlatform || "",
    url: snapshot.sourceUrl || snapshot.url || "",
  }) === platform;
}

function findCachedSnapshot(url, byChat, lastSnap, platform = detectPlatformFromUrl(url)) {
  var chatIdMatch = String(url || "").match(new RegExp("[/](?:c|chat)[/]([a-z0-9-]+)", "i"));
  if (chatIdMatch) {
    var key = "chat:" + chatIdMatch[1];
    if (byChat && byChat[key] && snapshotMatchesPlatform(byChat[key], platform)) return byChat[key];
  }
  var normalized = normalizeHealthSnapshotUrl(url);
  if (normalized && byChat) {
    var urlKey = "url:" + normalized;
    if (byChat[urlKey] && snapshotMatchesPlatform(byChat[urlKey], platform)) return byChat[urlKey];
  }
  if (lastSnap && snapshotMatchesPlatform(lastSnap, platform)) {
    var lastNorm = normalizeHealthSnapshotUrl(lastSnap.sourceUrl || "");
    if (lastNorm && normalized && lastNorm === normalized) return lastSnap;
    var chatId = chatIdMatch ? chatIdMatch[1] : "";
    if (chatId && lastSnap.chatId === chatId) return lastSnap;
  }
  return null;
}

function getHealthSnapshotKey(sr) {
  if (sr?.chatId && sr.chatId !== "unknown") return "chat:" + sr.chatId;
  const normalizedUrl = normalizeHealthSnapshotUrl(sr?.url || "");
  return normalizedUrl ? "url:" + normalizedUrl : "chat:unknown";
}

function getSnapshotKeyFromUrl(url = "") {
  const chatIdMatch = String(url || "").match(/[/](?:c|chat)[/]([a-z0-9-]+)/i);
  if (chatIdMatch) return "chat:" + chatIdMatch[1];
  const normalizedUrl = normalizeHealthSnapshotUrl(url);
  return normalizedUrl ? "url:" + normalizedUrl : "chat:unknown";
}

function getPlatformId(sr = {}) {
  const rawPlatform = String(sr.sourcePlatform || sr.platform || "").toLowerCase();
  const detectedFromUrl = detectPlatformFromUrl(sr.url || "");

  if (rawPlatform.includes("chatgpt") || rawPlatform.includes("openai") || detectedFromUrl === "chatgpt") {
    return "chatgpt";
  }

  if (rawPlatform.includes("claude") || detectedFromUrl === "claude") {
    return "claude";
  }

  if (rawPlatform.includes("gemini") || detectedFromUrl === "gemini") {
    return "gemini";
  }

  return "unknown";
}

function getPlatformDisplayName(sr = {}) {
  const platformId = getPlatformId(sr);
  if (platformId === "chatgpt") return "ChatGPT";
  if (platformId === "claude") return "Claude.ai";
  return "Unknown";
}

function detectPlatformFromUrl(url = "") {
  const raw = String(url || "").toLowerCase();
  let host = "";

  try {
    host = new URL(raw).hostname;
  } catch (_) {
    host = raw;
  }

  if (host === "claude.ai" || host.endsWith(".claude.ai")) return "claude";
  if (host === "chatgpt.com" || host.endsWith(".chatgpt.com") ||
      host === "chat.openai.com" || host.endsWith(".chat.openai.com")) {
    return "chatgpt";
  }
  if (host === "gemini.google.com" || host.endsWith(".gemini.google.com")) return "gemini";
  if (host === "www.linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
  if (raw.includes("claude.ai")) return "claude";
  if (raw.includes("chatgpt.com") || raw.includes("chat.openai.com")) return "chatgpt";
  if (raw.includes("gemini.google.com")) return "gemini";
  if (raw.includes("linkedin.com")) return "linkedin";
  return "other";
}

function updatePlatformDisplay(platform) {
  const logoEl = $("platformLogo");
  const nameEl = $("platformName");
  if (!logoEl || !nameEl) return;

  const platformInfo = {
    claude:   { label: "CLAUDE",   color: "#fc5000", logo: PLATFORM_LOGOS.claude,  alt: "Claude logo" },
    chatgpt:  { label: "CHATGPT",  color: "#10a37f", logo: PLATFORM_LOGOS.chatgpt, alt: "ChatGPT logo" },
    linkedin: { label: "LINKEDIN", color: "#0a66c2", logo: "",                      alt: "" },
    other:    { label: "",         color: "#888",    logo: "",                      alt: "" },
  }[platform] || { label: "", color: "#888", logo: "", alt: "" };

  nameEl.textContent = platformInfo.label;
  nameEl.style.color = platformInfo.color;

  if (platformInfo.logo) {
    logoEl.src = platformInfo.logo;
    logoEl.alt = platformInfo.alt;
    logoEl.title = platformInfo.alt;
    logoEl.classList.add("is-visible");
  } else {
    logoEl.removeAttribute("src");
    logoEl.alt = "";
    logoEl.title = "";
    logoEl.classList.remove("is-visible");
  }
}

function installImageFallbacks() {
  document.querySelectorAll("img.platform-logo, img.settings-platform-logo").forEach((img) => {
    img.addEventListener("error", () => {
      img.classList.remove("is-visible");
      img.hidden = true;
    });
    img.addEventListener("load", () => {
      img.hidden = false;
    });
  });
}

function updateSettingsPlatforms(platform) {
  var chatgptBadge = $("badgeChatGPT");
  var claudeBadge  = $("badgeClaude");
  if (!chatgptBadge || !claudeBadge) return;

  chatgptBadge.className = "badge badge-available";
  chatgptBadge.textContent = "Available";
  claudeBadge.className = "badge badge-available";
  claudeBadge.textContent = "Available";

  if (platform === "chatgpt") {
    chatgptBadge.className = "badge badge-active";
    chatgptBadge.textContent = "Active";
  } else if (platform === "claude") {
    claudeBadge.className = "badge badge-active";
    claudeBadge.textContent = "Active";
  }
}

async function refreshActivePlatformFromTab() {
  try {
    const tabs = await tabsQuery({ active: true, currentWindow: true });
    const url = tabs && tabs[0] ? (tabs[0].url || "") : "";
    activePlatform = detectPlatformFromUrl(url);
    updatePlatformDisplay(activePlatform);
    updateSettingsPlatforms(activePlatform);
    return { url, platform: activePlatform };
  } catch (_) {
    activePlatform = "other";
    updatePlatformDisplay(activePlatform);
    updateSettingsPlatforms(activePlatform);
    return { url: "", platform: activePlatform };
  }
}

// ── Health computation ──────────────────────────────────────────

function computeHealthFromScan(sr) {
  const msgs = sr.messages || [];
  const totalMsgs   = sr.total     || msgs.length;
  const totalChars  = sr.totalChars  || msgs.reduce((s, m) => s + (m.text?.length || 0), 0);
  const codeCount   = sr.codeCount   || msgs.flatMap(m => m.codeBlocks || []).length;
  const scanDuration = sr.scanDuration || 0;
  const domSize     = sr.domSize     || 0;
  const renderedNodes = sr.renderedNodes || 0;
  const messageLengths = msgs.map(m => (m.text || "").length);
  const longestMessageChars =
    sr.longestMessageChars || (messageLengths.length ? Math.max(...messageLengths) : 0);
  const largeMessageCount =
    sr.largeMessageCount || messageLengths.filter(length => length >= 2000).length;
  const veryLargeMessageCount =
    sr.veryLargeMessageCount || messageLengths.filter(length => length >= 5000).length;
  const hugeMessageCount =
    sr.hugeMessageCount || messageLengths.filter(length => length >= 10000).length;
  const embeddedTranscriptDetected =
    !!(sr.embeddedTranscriptDetected || sr.likelyEmbeddedTranscript);

  const reasons = [];
  let pressure = 0;
  let chatSizePressure = 0;

  // Calibrated v5 migration pressure: cap-based, so isolated dense signals do
  // not over-penalize normal short chats.
  if (totalMsgs >= 150) {
    pressure += 26;
    chatSizePressure += 26;
    reasons.push("Very high message count");
  } else if (totalMsgs >= 80) {
    pressure += 18;
    chatSizePressure += 18;
    reasons.push("High message count");
  } else if (totalMsgs >= 40) {
    pressure += 10;
    chatSizePressure += 10;
    reasons.push("Moderate message count");
  } else if (totalMsgs >= 20) {
    pressure += 4;
    chatSizePressure += 4;
    reasons.push("Growing message count");
  }

  if (totalChars >= 100000) {
    pressure += 24;
    chatSizePressure += 24;
    reasons.push("Very large total text volume");
  } else if (totalChars >= 50000) {
    pressure += 16;
    chatSizePressure += 16;
    reasons.push("Large total text volume");
  } else if (totalChars >= 25000) {
    pressure += 8;
    chatSizePressure += 8;
    reasons.push("Moderate-high text volume");
  } else if (totalChars >= 10000) {
    const textPressure = totalMsgs >= 10 ? 8 : 5;
    pressure += textPressure;
    chatSizePressure += textPressure;
    reasons.push("Moderate text volume");
  } else if (totalChars >= 7000) {
    pressure += 5;
    chatSizePressure += 5;
    reasons.push("Moderate text volume");
  }

  if (codeCount >= 100) {
    pressure += 12;
    chatSizePressure += 12;
    reasons.push("Extremely code-heavy chat");
  } else if (codeCount >= 50) {
    pressure += 10;
    chatSizePressure += 10;
    reasons.push("Very code-heavy chat");
  } else if (codeCount >= 25) {
    pressure += 8;
    chatSizePressure += 8;
    reasons.push("Many code blocks");
  } else if (codeCount >= 10) {
    pressure += 6;
    chatSizePressure += 6;
    reasons.push("Several code blocks");
  } else if (codeCount >= 5) {
    pressure += 3;
    chatSizePressure += 3;
    reasons.push("Some code blocks");
  }

  if (longestMessageChars >= 20000) {
    pressure += 14;
    chatSizePressure += 14;
    reasons.push("Huge single-message payload");
  } else if (longestMessageChars >= 10000) {
    pressure += 10;
    chatSizePressure += 10;
    reasons.push("Very large single-message payload");
  } else if (longestMessageChars >= 5000) {
    pressure += 6;
    chatSizePressure += 6;
    reasons.push("Large single-message payload");
  }

  if (hugeMessageCount >= 1 && longestMessageChars < 10000) {
    pressure += 5;
    chatSizePressure += 5;
    reasons.push("Huge message detected");
  } else if (veryLargeMessageCount >= 1 && longestMessageChars < 5000) {
    pressure += 4;
    chatSizePressure += 4;
    reasons.push("Very large message detected");
  } else if (largeMessageCount >= 2 && longestMessageChars < 5000) {
    pressure += 3;
    chatSizePressure += 3;
    reasons.push("Multiple large messages detected");
  }

  if (embeddedTranscriptDetected) {
    pressure += 6;
    chatSizePressure += 6;
    reasons.push("Embedded transcript-like content detected");
  }

  const denseSignalCount = [
    totalMsgs < 10 && totalChars >= 7000,
    totalMsgs < 10 && codeCount >= 10,
    longestMessageChars >= 5000,
    veryLargeMessageCount >= 1,
    embeddedTranscriptDetected,
    codeCount >= 50,
    codeCount >= 100,
  ].filter(Boolean).length;

  if (denseSignalCount >= 2) {
    reasons.push("Dense content payload");
  }

  let score = Math.max(5, Math.min(100, 100 - pressure));

  if (totalMsgs < 10 && codeCount >= 10) score = Math.min(score, 86);
  if (longestMessageChars >= 5000) score = Math.min(score, 86);
  if (veryLargeMessageCount >= 1) score = Math.min(score, 86);
  if (denseSignalCount >= 2) score = Math.min(score, 84);
  if (embeddedTranscriptDetected) score = Math.min(score, 82);
  if (codeCount >= 50) score = Math.min(score, 78);
  if (codeCount >= 100) score = Math.min(score, 74);
  if (totalChars >= 30000 || longestMessageChars >= 20000) score = Math.min(score, 76);
  if (totalMsgs >= 150 || totalChars >= 100000) score = Math.min(score, 55);

  score = Math.round(score);

  // Continuity signals remain advisory reasons. They do not drive the v5 dense
  // content caps, but they can explain why a handoff may be useful.
  const userText = msgs.filter(m => m.role === "user").map(m => m.text || "").join(" ").toLowerCase();
  const correctionPhrases = [
    "actually,", "wait,", "no,", "instead,", "let's reset", "start over", "ignore that", "scratch that", "never mind",
  ];
  const correctionCount = correctionPhrases.reduce((n, p) => n + (userText.split(p).length - 1), 0);
  const continuityRiskPressure = Math.min(100, correctionCount >= 10 ? 40 : correctionCount >= 5 ? 25 : correctionCount >= 2 ? 10 : 0);

  let scanQualityPressure = 0;
  const emptyMsgs = msgs.filter(m => !m.text || m.text.trim().length < 2).length;
  if (emptyMsgs >= 3) scanQualityPressure += 50;
  else if (emptyMsgs >= 1) scanQualityPressure += 20;
  const missingRole = msgs.filter(m => !m.role).length;
  if (missingRole >= 1) scanQualityPressure += 30;
  scanQualityPressure = Math.min(100, scanQualityPressure);

  chatSizePressure = Math.min(100, chatSizePressure);

  // Browser load is intentionally separate from migration risk.
  let browserLoadPressure = 0;
  if (totalMsgs >= 250)      browserLoadPressure += 35;
  else if (totalMsgs >= 150) browserLoadPressure += 25;
  else if (totalMsgs >= 80)  browserLoadPressure += 10;
  if (codeCount >= 80)       browserLoadPressure += 30;
  else if (codeCount >= 30)  browserLoadPressure += 20;
  else if (codeCount >= 10)  browserLoadPressure += 10;
  if (scanDuration >= 1800)  browserLoadPressure += 25;
  else if (scanDuration >= 900) browserLoadPressure += 15;
  if (totalChars >= 200000)  browserLoadPressure += 25;
  else if (totalChars >= 80000) browserLoadPressure += 15;
  browserLoadPressure = Math.min(100, browserLoadPressure);

  let migrationRisk, migrationRiskClass;
  if (score >= 90)      { migrationRisk = "Low";       migrationRiskClass = "risk-low"; }
  else if (score >= 80) { migrationRisk = "Moderate";  migrationRiskClass = "risk-medium"; }
  else if (score >= 65) { migrationRisk = "Elevated";  migrationRiskClass = "risk-high"; }
  else                  { migrationRisk = "Critical";  migrationRiskClass = "risk-critical"; }

  let browserLoad;
  if (browserLoadPressure < 25)      browserLoad = "Smooth";
  else if (browserLoadPressure < 50) browserLoad = "Slightly Heavy";
  else if (browserLoadPressure < 75) browserLoad = "Heavy";
  else                               browserLoad = "Very Heavy";

  let action;
  if (score >= 90)      action = "Safe to continue";
  else if (score >= 80) action = "Safe for now, but consider handoff soon";
  else if (score >= 65) action = "Consider handoff soon";
  else                  action = "Create handoff before continuing";

  if (totalMsgs >= 120 || codeCount >= 30 || totalChars >= 50000 || migrationRisk === "Elevated" || migrationRisk === "Critical")
    reasons.push("Important details may be buried above");
  if (correctionCount >= 2)
    reasons.push("The conversation has changed direction several times");
  if (scanDuration >= 500)
    reasons.push("Engram took longer than usual to scan this chat");
  if (browserLoadPressure >= 25)
    reasons.push("The page is responding slower");
  if (emptyMsgs >= 1)
    reasons.push("Some messages may not have been captured cleanly");

  return {
    score,
    health: score,           // alias for debug consumers
    healthLabel: getHealthDisplay(score).label,
    statusLabel: getHealthDisplay(score).label,
    pressure: { chatSizePressure, continuityRiskPressure, scanQualityPressure, browserLoadPressure, denseSignalCount },
    migrationRisk,
    migrationRiskClass,
    browserLoad,
    action,
    recommendation: action,  // alias for debug consumers
    reasons: reasons.slice(0, 4),
  };
}

function updateHealthPanel(hd) {
  const panel = $("healthPanel");
  if (!panel || !hd) return;
  panel.style.display = "";

  const riskEl = $("migrationRisk");
  if (riskEl) {
    riskEl.textContent = hd.migrationRisk;
    riskEl.className = "health-v " + hd.migrationRiskClass;
  }

  const loadEl = $("browserLoad");
  if (loadEl) loadEl.textContent = hd.browserLoad;

  const reasonsEl = $("healthReasons");
  if (reasonsEl) {
    if (hd.reasons.length) {
      reasonsEl.innerHTML = "<ul>" + hd.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join("") + "</ul>";
      reasonsEl.style.display = "";
    } else {
      reasonsEl.style.display = "none";
    }
  }

  const actionEl = $("healthAction");
  if (actionEl) {
    actionEl.textContent = hd.action;
    let cls = "health-action";
    if (hd.score >= 90)      cls += " action-safe";
    else if (hd.score >= 80) cls += " action-soon";
    else if (hd.score >= 65) cls += " action-handoff";
    else                     cls += " action-move";
    actionEl.className = cls;
  }
}

function escapeHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function extractTechnicalSignals(allText) {
  const FILE_NOISE = /next.time.git|touches.it|crlf|lf.will/i;
  const GIT_NOISE  = /next.time.git|touches.it|crlf|lf.will/i;
  const TODO_NOISE = /continuation.instructions|next.tasks/i;

  const filePaths = [...new Set(
    (allText.match(/[a-zA-Z0-9_\-.]+\/[a-zA-Z0-9_\-./]+\.[a-z]{2,6}/g) || [])
      .filter(p => p.length >= 6 && !FILE_NOISE.test(p))
  )].slice(0, 10);
  const gitActivity = [...new Set(
    (allText.match(/(?:git |branch |checkout |commit )[a-zA-Z0-9_\-/]+/g) || [])
      .filter(g => !GIT_NOISE.test(g))
  )].slice(0, 5);
  const errorLines = [...new Set(
    (allText.match(/(?:Error|TypeError|SyntaxError|ReferenceError)[:\s][^\n]{5,80}/g) || [])
  )].slice(0, 5);
  const todoLines = [...new Set(
    (allText.match(/(?:TODO|FIXME|NEXT)[:\s][^\n]{5,100}/gi) || [])
      .filter(t => !TODO_NOISE.test(t))
  )].slice(0, 5);

  return { filePaths, gitActivity, errorLines, todoLines };
}

function normalizeExportRole(role) {
  const raw = String(role || "").toLowerCase();
  if (/user|human/.test(raw)) return "user";
  if (/assistant|ai|model|claude|chatgpt/.test(raw)) return "assistant";
  if (/system|tool|developer/.test(raw)) return raw.includes("developer") ? "system" : raw;
  return raw || "unknown";
}

function normalizeExportText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function collectExportAttachments(message) {
  const attachments = [];
  const sources = [
    message?.attachments,
    message?.files,
    message?.images,
    message?.uploads,
    message?.metadata?.attachments,
    message?.metadata?.files,
  ];

  sources.forEach((source) => {
    if (!Array.isArray(source)) return;
    source.forEach((item) => {
      if (!item) return;
      if (typeof item === "string") {
        attachments.push({ type: "file", name: item });
        return;
      }
      attachments.push({
        type: item.type || item.kind || item.mimeType || item.contentType || "file",
        name: item.name || item.filename || item.fileName || item.title || "",
        size: item.size || null,
      });
    });
  });

  const text = [
    message?.text,
    message?.rawText,
    message?.ariaLabel,
    message?.metadata?.label,
  ].map(v => String(v || "")).join(" ");

  if (!attachments.length && /attach|upload|file|image|pdf|document/i.test(text)) {
    attachments.push({ type: /image/i.test(text) ? "image" : "file", name: "" });
  }

  return attachments;
}

function attachmentOnlyPlaceholder(role, attachments) {
  if (role !== "user") return "[Non-text turn captured; content unavailable]";
  if (!attachments.length) return "[Non-text user turn captured; content unavailable]";

  const first = attachments[0] || {};
  const type = String(first.type || "").toLowerCase();
  const name = first.name ? ": " + first.name : "";
  if (type.includes("image")) return "[Attachment-only user turn: image uploaded" + name + "]";
  if (type.includes("file") || first.name) return "[Attachment-only user turn: file uploaded" + name + "]";
  return "[Attachment-only user turn: text unavailable]";
}

function normalizeExportCodeBlocks(message) {
  const blocks = Array.isArray(message?.codeBlocks) ? message.codeBlocks : [];
  return blocks
    .map((block) => ({
      language: String(block?.language || "text"),
      code: String(block?.code || "").trim(),
    }))
    .filter((block) => block.code);
}

function normalizeExportMessages(scanResult = {}) {
  const sourceMessages = Array.isArray(scanResult.messages) && scanResult.messages.length
    ? scanResult.messages
    : Array.isArray(scanResult.displayMessages) && scanResult.displayMessages.length
      ? scanResult.displayMessages
      : Array.isArray(scanResult.rawMessages) && scanResult.rawMessages.length
        ? scanResult.rawMessages
        : [];

  const normalized = [];
  let previousSignature = "";

  sourceMessages.forEach((message, sourceIndex) => {
    const role = normalizeExportRole(message?.role || message?.author?.role || message?.sender || message?.type);
    const attachments = collectExportAttachments(message);
    let text = normalizeExportText(message?.text ?? message?.content ?? message?.rawText ?? "");
    const codeBlocks = normalizeExportCodeBlocks(message);

    if (!text && (attachments.length || role === "user" || role === "unknown")) {
      text = attachmentOnlyPlaceholder(role, attachments);
    }
    if (!text && !codeBlocks.length) return;

    const attachmentSignature = attachments.map(a => [a.type || "", a.name || ""].join(":")).join(",");
    const codeSignature = codeBlocks.map(c => [c.language, c.code].join(":")).join("|");
    const signature = [
      role,
      text.replace(/\s+/g, " ").trim(),
      attachmentSignature,
      codeSignature,
    ].join("|");

    if (signature && signature === previousSignature) return;
    previousSignature = signature;

    normalized.push({
      ...message,
      role,
      text,
      attachments,
      codeBlocks,
      sourceIndex,
      exportIndex: normalized.length + 1,
    });
  });

  return normalized;
}

function getExportStats(messages) {
  const totalChars = messages.reduce((sum, message) => sum + String(message.text || "").length, 0);
  return {
    userCount: messages.filter(m => m.role === "user").length,
    aiCount: messages.filter(m => m.role === "assistant").length,
    systemCount: messages.filter(m => m.role === "system").length,
    unknownCount: messages.filter(m => !["user", "assistant", "system"].includes(m.role)).length,
    total: messages.length,
    codeCount: messages.reduce((sum, message) => sum + (message.codeBlocks || []).length, 0),
    totalChars,
  };
}

function withCanonicalExportMessages(scanResult = {}) {
  const messages = normalizeExportMessages(scanResult);
  const stats = getExportStats(messages);
  return {
    ...scanResult,
    messages,
    exportStats: stats,
    userCount: stats.userCount,
    aiCount: stats.aiCount,
    total: stats.total,
    codeCount: stats.codeCount,
    totalChars: stats.totalChars,
  };
}

function markdownFence(content, language = "text") {
  const text = String(content || "");
  const backtickRuns = text.match(/`+/g) || [];
  const longest = backtickRuns.reduce((max, run) => Math.max(max, run.length), 0);
  const fence = "`".repeat(Math.max(4, longest + 1));
  return fence + language + "\n" + text + "\n" + fence;
}

function formatExportMessageBlock(message, headingPrefix = "Message") {
  const index = String(message.exportIndex || 0).padStart(4, "0");
  const lines = [
    "## " + headingPrefix + " " + index,
    "",
    "Role: " + message.role,
    "Index: " + (message.exportIndex || 0),
  ];

  if (typeof message.sourceIndex === "number") {
    lines.push("Source index: " + (message.sourceIndex + 1));
  }
  if (message.attachments && message.attachments.length) {
    lines.push("Attachments:");
    message.attachments.forEach((attachment, i) => {
      const name = attachment.name ? " - " + attachment.name : "";
      lines.push("- " + (attachment.type || "file") + name + " (" + (i + 1) + ")");
    });
  }

  lines.push("", "Content:", markdownFence(message.text || "", "text"));

  if (message.codeBlocks && message.codeBlocks.length) {
    lines.push("", "Code blocks:");
    message.codeBlocks.forEach((block, i) => {
      lines.push("", "Code block " + (i + 1) + " (" + (block.language || "text") + "):");
      lines.push(markdownFence(block.code || "", block.language || "text"));
    });
  }

  return lines.join("\n");
}

function generateHandoffMarkdown(sr, hd) {
  const exportSr = sr.exportStats ? sr : withCanonicalExportMessages(sr);
  const msgs = exportSr.messages || [];
  const stats = exportSr.exportStats || getExportStats(msgs);
  const recentMsgs = msgs.slice(-30);
  const allText = msgs.map(m => m.text || "").join("\n");

  const { filePaths, gitActivity, errorLines, todoLines } = extractTechnicalSignals(allText);

  const contextSection = recentMsgs
    .map(m => formatExportMessageBlock({
      ...m,
      text: m.text && m.text.length > 1200 ? m.text.slice(0, 1200) + "\n[...truncated]" : m.text,
    }, "Recent Message"))
    .join("\n\n");

  // Code blocks — last 5, capped at 800 chars each
  const allCode = msgs.flatMap(m => m.codeBlocks || []).filter(c => c.code.length > 30);
  const codeCountStat = stats.codeCount || 0;
  let codeSection;
  if (allCode.length === 0 && codeCountStat > 0) {
    codeSection = `_${codeCountStat} code blocks detected, but detailed code block content was not available in the captured scan._`;
  } else if (allCode.length === 0) {
    codeSection = "_No code blocks captured._";
  } else if (allCode.length > 5) {
    const recent = allCode.slice(-5);
    codeSection = `_${allCode.length} code blocks total. Most recent ${recent.length}:_\n\n` +
      recent.map(c => `\`\`\`${c.language || "text"}\n${c.code.slice(0, 800)}\n\`\`\``).join("\n\n");
  } else {
    codeSection = allCode.map(c => `\`\`\`${c.language || "text"}\n${c.code.slice(0, 800)}\n\`\`\``).join("\n\n");
  }

  const ts = new Date().toISOString();
  const totalKb = Math.round((stats.totalChars || 0) / 1000);
  const riskStr = hd ? `${hd.score}% — ${hd.migrationRisk} risk` : "—";

  const signalsParts = [];
  if (filePaths.length)  signalsParts.push("**File paths:**\n" + filePaths.map(p => `- \`${p}\``).join("\n"));
  if (gitActivity.length) signalsParts.push("**Git activity:**\n" + gitActivity.map(g => `- ${g}`).join("\n"));
  if (errorLines.length)  signalsParts.push("**Errors seen:**\n" + errorLines.map(e => `- ${e}`).join("\n"));
  if (todoLines.length)   signalsParts.push("**TODOs / Next steps:**\n" + todoLines.map(t => `- ${t}`).join("\n"));
  const signalsSection = signalsParts.length ? signalsParts.join("\n\n") : "_No technical signals detected._";

  return `# Engram Handoff

> Deterministic handoff generated by Engram. This is not an AI summary.
> It is based on captured chat data. Use it to continue this session in a fresh chat.

## Source
- **Platform:** ${getPlatformDisplayName(exportSr)}
- **Chat Title:** ${exportSr.sourceTitle || "Untitled chat"}
- **Chat ID:** ${exportSr.chatId || "unknown"}
- **URL:** ${exportSr.url || "unknown"}
- **Generated:** ${ts}

## Chat Health at Migration
- **Chat Health:** ${hd ? hd.score + "%" : "—"}
- **Migration Risk:** ${hd?.migrationRisk ?? "—"}
- **Browser Load:** ${hd?.browserLoad ?? "—"}
${hd?.reasons?.length ? "- **Reasons:**\n" + hd.reasons.map(r => `  - ${r}`).join("\n") + "\n" : ""}
- **Recommendation:** ${hd?.action ?? "—"}

## Captured Stats
- User messages: ${stats.userCount || 0}
- AI messages: ${stats.aiCount || 0}
- System messages: ${stats.systemCount || 0}
- Unknown-role messages: ${stats.unknownCount || 0}
- Total messages: ${stats.total || 0}
- Code blocks: ${stats.codeCount || 0}
- Total text: ~${totalKb}k characters
- Scan duration: ${exportSr.scanDuration != null ? exportSr.scanDuration + "ms" : "unknown"}

## Recent Context
_Last ${recentMsgs.length} messages:_

${contextSection || "_No messages captured._"}

## Important Technical Signals

${signalsSection}

## Code Blocks

${codeSection}

## Continuation Prompt

Paste the following at the start of your new chat:

---

You are continuing an existing AI-assisted work session. Use the handoff below as the source of truth. Preserve the project decisions, current state, constraints, and next actions. Do not assume missing facts. Ask for clarification if something is not present.

**Session context:** ${stats.total || 0} messages captured by Engram before migration. Health at migration: ${riskStr}.

Please acknowledge this handoff and confirm what we should focus on first.
`;
}

// ── Migration package generators ────────────────────────────────

function generateFullChatExport(sr) {
  const exportSr = sr.exportStats ? sr : withCanonicalExportMessages(sr);
  const msgs = exportSr.messages || [];
  const stats = exportSr.exportStats || getExportStats(msgs);
  const ts = new Date().toISOString();
  const lines = [
    "# Full Chat Export",
    "",
    "_Parse-safe export. Each message uses numbered metadata plus fenced content so pasted handoffs inside user messages cannot be confused with export structure._",
    "",
    `- **Source:** ${getPlatformDisplayName(exportSr)}`,
    `- **Chat Title:** ${exportSr.sourceTitle || "Untitled chat"}`,
    `- **URL:** ${exportSr.url || "unknown"}`,
    `- **Generated:** ${ts}`,
    `- **Total messages:** ${stats.total || msgs.length}`,
    `- **User messages:** ${stats.userCount || 0}`,
    `- **AI messages:** ${stats.aiCount || 0}`,
    `- **Code blocks:** ${stats.codeCount || 0}`,
    "",
    "## Messages",
    "",
  ];

  if (msgs.length === 0) {
    lines.push("_No messages captured._");
  } else {
    msgs.forEach((m, i) => {
      lines.push(formatExportMessageBlock(m));
      if (i < msgs.length - 1) lines.push("");
    });
  }

  return lines.join("\n");
}

function generateTechnicalSignalsMd(sr) {
  const exportSr = sr.exportStats ? sr : withCanonicalExportMessages(sr);
  const msgs = exportSr.messages || [];
  const allText = msgs.map(m => m.text || "").join("\n");
  const { filePaths, gitActivity, errorLines, todoLines } = extractTechnicalSignals(allText);
  const ts = new Date().toISOString();

  const parts = [
    "# Technical Signals",
    "",
    "_Extracted deterministically from captured chat data. Not an AI summary._",
    "",
    `- **Generated:** ${ts}`,
    `- **Source:** ${exportSr.url || "unknown"}`,
  ];

  if (filePaths.length) {
    parts.push("", "## File Paths", "");
    filePaths.forEach(p => parts.push(`- \`${p}\``));
  }
  if (gitActivity.length) {
    parts.push("", "## Git Activity", "");
    gitActivity.forEach(g => parts.push(`- ${g}`));
  }
  if (errorLines.length) {
    parts.push("", "## Errors", "");
    errorLines.forEach(e => parts.push(`- ${e}`));
  }
  if (todoLines.length) {
    parts.push("", "## TODOs / Next Steps", "");
    todoLines.forEach(t => parts.push(`- ${t}`));
  }
  if (!filePaths.length && !gitActivity.length && !errorLines.length && !todoLines.length) {
    parts.push("", "_No technical signals detected._");
  }

  return parts.join("\n");
}

function generateReadme(sr, hd) {
  const exportSr = sr.exportStats ? sr : withCanonicalExportMessages(sr);
  const stats = exportSr.exportStats || getExportStats(exportSr.messages || []);
  const ts = new Date().toISOString();
  return `# Engram Migration Package — Start Here

This package was generated by **Engram** to help you continue an AI-assisted work session in a fresh chat.

## How to use this package

1. **Start with \`handoff.md\`** — paste it into your new AI chat to restore context.
2. **Use \`full-chat-export.md\` only if more detail is needed** — it contains the full captured conversation.
3. **Check \`technical-signals.md\`** for file paths, git commands, errors, and TODOs.
4. **Check \`attachments/user-added/\`** for any files you manually included.
5. If a referenced file is missing from the attachments, ask the user to upload it.

## Package summary

- **Source:** ${getPlatformDisplayName(exportSr)}
- **Chat Title:** ${exportSr.sourceTitle || "Untitled chat"}
- **URL:** ${exportSr.url || "unknown"}
- **Chat Health:** ${hd ? hd.score + "%" : "—"} (${hd?.migrationRisk ?? "—"} risk)
- **Total messages:** ${stats.total || 0}
- **User messages:** ${stats.userCount || 0}
- **AI messages:** ${stats.aiCount || 0}
- **Code blocks:** ${stats.codeCount || 0}
- **Generated:** ${ts}

## Files in this package

| File | Purpose |
|---|---|
| \`handoff.md\` | Main context for continuing the session |
| \`full-chat-export.md\` | Full captured conversation |
| \`technical-signals.md\` | File paths, git activity, errors, TODOs |
| \`manifest.json\` | Machine-readable package metadata |
| \`attachments/user-added/\` | Files you added manually |

---

_Generated by Engram — continuity layer for AI-assisted workflows._
`;
}

function rejectAfter(ms, message) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

async function getActiveExportContext() {
  const tabs = await tabsQuery({ active: true, currentWindow: true });
  const tab = tabs && tabs[0] ? tabs[0] : null;
  const url = tab?.url || "";
  const platform = detectPlatformFromUrl(url);
  const snapshotKey = getSnapshotKeyFromUrl(url);
  const chatId = snapshotKey.startsWith("chat:") ? snapshotKey.slice(5) : null;

  activeTabId = tab?.id ?? activeTabId;
  activePlatform = platform;
  activeSnapshotKey = snapshotKey;

  return {
    tab,
    tabId: tab?.id ?? null,
    url,
    platform,
    snapshotKey,
    chatId,
  };
}

function annotateExportScanResult(result, context, source) {
  const counts = getScanResultCounts(result);
  return {
    ...result,
    platform: result.platform || context.platform,
    chatId: result.chatId && result.chatId !== "unknown" ? result.chatId : (context.chatId || result.chatId || "unknown"),
    snapshotKey: context.snapshotKey,
    url: context.url || result.url || "",
    activeTabUrl: context.url || "",
    exportSource: source,
    userCount: counts.userCount,
    aiCount: counts.aiCount,
    total: counts.total,
    codeCount: counts.codeCount,
    totalChars: result.totalChars || (Array.isArray(result.messages)
      ? result.messages.reduce((sum, message) => sum + String(message?.text || "").length, 0)
      : 0),
  };
}

async function getFreshScanResultForExport(context) {
  if (!context?.tabId || (context.platform !== "chatgpt" && context.platform !== "claude")) {
    throw new Error("Fresh export scan is only available on ChatGPT or Claude.");
  }

  console.log("[Engram][Export] fresh scan requested", {
    platform: context.platform,
    tabId: context.tabId,
    chatId: context.chatId,
    snapshotKey: context.snapshotKey,
  });

  const response = await Promise.race([
    tabsSendMessage(context.tabId, { type: "ENGRAM_START_SCAN", mode: "export" }),
    rejectAfter(EXPORT_FRESH_SCAN_TIMEOUT_MS, "Fresh export scan timed out"),
  ]);

  if (!response || response.type !== "ENGRAM_SCAN_COMPLETE") {
    throw new Error(response?.error || "Fresh export scan did not return a scan result.");
  }

  const resultPlatform = getPlatformId(response);
  if (resultPlatform !== "unknown" && resultPlatform !== context.platform) {
    throw new Error("Fresh export scan returned a different platform.");
  }

  if (
    context.chatId &&
    response.chatId &&
    response.chatId !== "unknown" &&
    response.chatId !== context.chatId
  ) {
    throw new Error("Fresh export scan returned a different chat.");
  }

  const freshResult = annotateExportScanResult(response, context, "fresh-scan");
  const stats = getExportStats(normalizeExportMessages(freshResult));
  console.log("[Engram][Export] fresh scan completed", {
    platform: context.platform,
    chatId: freshResult.chatId,
    snapshotKey: context.snapshotKey,
    totalMessages: stats.total,
    userMessages: stats.userCount,
    aiMessages: stats.aiCount,
    source: "fresh-scan",
  });

  return freshResult;
}

async function getSavedScanResultForExport(context) {
  const platform = context.platform;
  if (platform !== "chatgpt" && platform !== "claude") return null;

  const keys = platform === "chatgpt"
    ? [
      "engramChatgptLatestScanResult",
      "engramChatgptLatestSnapshot",
      "engram:chatgpt:conversationSnapshot",
      "engram:chatgpt:snapshotsByKey",
    ]
    : [
      "engramClaudeLatestScanResult",
      "engramClaudeLatestSnapshot",
      "engram:claude:conversationSnapshot",
      "engram:claude:snapshotsByKey",
    ];

  let stored = {};
  try {
    stored = await storageGet(keys);
  } catch (_) {
    stored = {};
  }

  const byKey = stored[keys[3]] || {};
  if (context.snapshotKey && byKey[context.snapshotKey]) {
    return annotateExportScanResult(byKey[context.snapshotKey], context, "saved-snapshot");
  }

  const candidates = [stored[keys[0]], stored[keys[1]], stored[keys[2]]].filter(Boolean);
  const exact = candidates.find((candidate) => {
    const candidateKey = candidate.snapshotKey || getHealthSnapshotKey({
      chatId: candidate.chatId,
      url: candidate.sourceUrl || candidate.url || "",
    });
    return candidateKey === context.snapshotKey;
  });
  if (exact) return annotateExportScanResult(exact, context, "saved-snapshot");

  const fallback = candidates.find((candidate) => snapshotMatchesPlatform(candidate, platform));
  return fallback ? annotateExportScanResult(fallback, context, "fallback-snapshot") : null;
}

function getCanonicalMessageCount(scanResult) {
  return normalizeExportMessages(scanResult).length;
}

function getDomMessageCountHint(scanResult) {
  return Number(
    scanResult?.renderedNodes ||
    scanResult?.domMessages ||
    scanResult?.domMessageCount ||
    scanResult?.visibleMessages ||
    scanResult?.displayMessageCount ||
    0
  ) || 0;
}

function assertNotStaleExportSource(scanResult, context, lastSavedSnapshot) {
  const domMessages = getDomMessageCountHint(scanResult);
  const canonicalMessages = getCanonicalMessageCount(scanResult);
  const lastSavedMessages = lastSavedSnapshot ? getCanonicalMessageCount(lastSavedSnapshot) : 0;

  if (domMessages > canonicalMessages) {
    const details = {
      domMessages,
      canonicalMessages,
      lastSavedMessages,
      platform: context.platform,
      chatId: context.chatId,
      snapshotKey: context.snapshotKey,
    };
    console.error("[Engram][Export] ERROR stale export data", details);
    throw new Error("Package is stale: current chat has newer messages than the export source. Please scan again.");
  }
}

function logCanonicalExportSource(source, scanResult, context) {
  const stats = getExportStats(normalizeExportMessages(scanResult));
  console.log("[Engram][Export] canonical export source selected", {
    source,
    totalMessages: stats.total,
    userMessages: stats.userCount,
    aiMessages: stats.aiCount,
    chatId: scanResult.chatId || context.chatId,
    snapshotKey: context.snapshotKey,
  });
}

async function getCanonicalScanResultForExport(purpose) {
  const context = await getActiveExportContext();
  let savedSnapshot = null;
  let freshScanFailed = null;

  try {
    savedSnapshot = await getSavedScanResultForExport(context);
  } catch (_) {
    savedSnapshot = null;
  }

  try {
    const freshResult = await getFreshScanResultForExport(context);
    assertNotStaleExportSource(freshResult, context, savedSnapshot);
    const healthData = computeHealthFromScan(freshResult);
    await persistScanResult(freshResult);
    saveHealthSnapshot(freshResult, healthData);
    logCanonicalExportSource("fresh-scan", freshResult, context);
    return {
      scanResult: freshResult,
      healthData,
      context,
      source: "fresh-scan",
      warning: "",
      purpose,
    };
  } catch (error) {
    freshScanFailed = error;
    console.warn("[Engram][Export] WARNING fresh scan failed, falling back to saved snapshot", {
      reason: error?.message || String(error),
      platform: context.platform,
      chatId: context.chatId,
      snapshotKey: context.snapshotKey,
    });
  }

  const activeSession = await getActiveScanSession(context.tabId, context.platform, context.snapshotKey);
  if (activeSessionMatches(activeSession, context.platform, context.snapshotKey)) {
    const sessionResult = annotateExportScanResult(activeSession.scanResult, context, "active-session");
    assertNotStaleExportSource(sessionResult, context, savedSnapshot);
    const healthData = lastHealthData || computeHealthFromScan(sessionResult);
    logCanonicalExportSource("active-session", sessionResult, context);
    return {
      scanResult: sessionResult,
      healthData,
      context,
      source: "active-session",
      warning: "Fresh scan failed. Package may use the active scan session.",
      purpose,
    };
  }

  if (savedSnapshot) {
    assertNotStaleExportSource(savedSnapshot, context, savedSnapshot);
    const healthData = computeHealthFromScan(savedSnapshot);
    console.warn("[Engram][Export] stale snapshot fallback used", {
      reason: freshScanFailed?.message || "fresh scan unavailable",
      fallbackMessages: getCanonicalMessageCount(savedSnapshot),
      platform: context.platform,
      chatId: context.chatId,
      snapshotKey: context.snapshotKey,
    });
    logCanonicalExportSource(savedSnapshot.exportSource || "saved-snapshot", savedSnapshot, context);
    return {
      scanResult: savedSnapshot,
      healthData,
      context,
      source: savedSnapshot.exportSource || "saved-snapshot",
      warning: "Fresh scan failed. Package may use the last saved snapshot.",
      purpose,
    };
  }

  throw freshScanFailed || new Error("No scan data available for export.");
}

function validateMigrationPackageData(exportSr, manifest, handoffMd, fullChatMd, context) {
  const messages = exportSr.messages || [];
  const stats = exportSr.exportStats || getExportStats(messages);
  const fullBlocks = (fullChatMd.match(/^## Message \d{4}$/gm) || []).length;
  const hasText = messages.some((message) => String(message.text || "").trim().length > 0);
  const activeUrl = context?.url || exportSr.activeTabUrl || "";
  const sourceUrl = exportSr.url || "";
  const activeNormalized = normalizeHealthSnapshotUrl(activeUrl);
  const sourceNormalized = normalizeHealthSnapshotUrl(sourceUrl);

  const validation = {
    messageCount: messages.length,
    manifestMessages: manifest?.stats?.totalMessages || 0,
    handoffStatsMatch: handoffMd.includes("- Total messages: " + messages.length),
    fullChatBlocks: fullBlocks,
    totalChars: stats.totalChars || 0,
    sourceUrl,
    activeUrl,
  };

  const valid =
    messages.length > 0 &&
    manifest.stats.totalMessages === messages.length &&
    validation.handoffStatsMatch &&
    fullBlocks === messages.length &&
    (!hasText || stats.totalChars > 0) &&
    (!activeNormalized || !sourceNormalized || activeNormalized === sourceNormalized);

  if (!valid) {
    console.error("[Engram][Export] ERROR invalid package data", validation);
    throw new Error("Package export failed validation.");
  }
}

async function buildMigrationPackage(sr, hd, userFiles) {
  const zip = new window.ZipWriter();
  const datestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const exportSr = withCanonicalExportMessages(sr);
  const exportStats = exportSr.exportStats || getExportStats(exportSr.messages || []);
  const readmeMd = generateReadme(exportSr, hd);
  const handoffMd = generateHandoffMarkdown(exportSr, hd);
  const fullChatMd = generateFullChatExport(exportSr);
  const technicalSignalsMd = generateTechnicalSignalsMd(exportSr);

  // User-selected files
  const userFilesMeta = [];
  for (const file of userFiles) {
    const zipPath = `attachments/user-added/${file.name}`;
    await zip.addFile(zipPath, file);
    userFilesMeta.push({
      path: zipPath,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
    });
  }

  // Manifest
  const msgs = exportSr.messages || [];
  const manifest = {
    packageType: "engram-migration-package",
    version: 1,
    generatedAt: new Date().toISOString(),
    sourcePlatform: getPlatformId(exportSr),
    sourceTitle: exportSr.sourceTitle || null,
    sourceUrl: exportSr.url || "unknown",
    chatHealth: hd?.score ?? null,
    migrationRisk: hd?.migrationRisk ?? null,
    browserLoad: hd?.browserLoad ?? null,
    stats: {
      userMessages: exportStats.userCount || 0,
      aiMessages: exportStats.aiCount || 0,
      systemMessages: exportStats.systemCount || 0,
      unknownRoleMessages: exportStats.unknownCount || 0,
      totalMessages: exportStats.total || msgs.length,
      codeBlocks: exportStats.codeCount || 0,
      totalChars: exportStats.totalChars || 0,
    },
    canonicalExport: {
      messageCount: msgs.length,
      source: "normalizeExportMessages(scanResult)",
      parseSafeMarkdown: true,
    },
    includedFiles: [
      { path: "README_START_HERE.md", type: "readme" },
      { path: "handoff.md",           type: "handoff" },
      { path: "full-chat-export.md",  type: "full-export" },
      { path: "technical-signals.md", type: "technical-signals" },
    ],
    userAddedFiles: userFilesMeta,
  };

  validateMigrationPackageData(exportSr, manifest, handoffMd, fullChatMd, {
    url: exportSr.activeTabUrl || exportSr.url || "",
  });

  zip.addText("README_START_HERE.md", readmeMd);
  zip.addText("handoff.md",           handoffMd);
  zip.addText("full-chat-export.md",  fullChatMd);
  zip.addText("technical-signals.md", technicalSignalsMd);
  zip.addText("manifest.json", JSON.stringify(manifest, null, 2));

  return {
    blob:     zip.build(),
    filename: `engram-migration-package-${datestamp}.zip`,
    stats:    manifest.stats,
  };
}

// ── Debug hook (no-op in production — toggle ENGRAM_VERBOSE_LOGS in parser.js) ──
window.__ENGRAM_DEBUG__ = {
  computeHealthFromScan,
  generateHandoffMarkdown,
  getLastScan:   () => scanResults,
  getLastHealth: () => lastHealthData,
};

// Load state from active manual scan sessions only
async function getActiveScanSession(tabId, platform = activePlatform, snapshotKey = activeSnapshotKey) {
  if (tabId === undefined || tabId === null) return null;
  const response = await runtimeSendMessage({
    type: "ENGRAM_GET_ACTIVE_SCAN_SESSION",
    tabId,
    platform,
    snapshotKey,
  });
  return response?.hasActiveSession ? response.activeSession : null;
}

async function setActiveScanSession(tabId, session) {
  if (tabId === undefined || tabId === null || !session) return;
  await runtimeSendMessage({
    type: "ENGRAM_SET_ACTIVE_SCAN_SESSION",
    tabId,
    platform: session.platform,
    snapshotKey: session.snapshotKey,
    session,
  });
}

function activeSessionMatches(session, platform, snapshotKey) {
  return !!session &&
    session.platform === platform &&
    session.snapshotKey === snapshotKey &&
    !!session.scanResult;
}

async function loadState() {
  if (currentState === "settings") {
    console.log("[Engram] settings view kept during state refresh");
    return;
  }
  _dpbg("loadState called", { isScanning, hasLocalScanResult, currentState, scanTotal: scanResults?.total ?? null });
  console.log("[Engram] requesting state");

  let tabs = [];
  try {
    tabs = await tabsQuery({ active: true, currentWindow: true });
  } catch (e) {
    if (keepLocalScanResult()) return;
    renderError("Could not read active tab. Scan Chat is still available.");
    return;
  }

  if (!tabs[0]) {
    if (keepLocalScanResult()) return;
    renderError("No active tab found. Scan Chat is still available.");
    return;
  }

  const tabId = tabs[0].id;
  const url = tabs[0].url || "";

  const platform = detectPlatformFromUrl(url);
  activeTabId = tabId;
  activePlatform = platform;
  console.log("[Engram] active tab detected", { tabId, url, platform });

  // Compute snapshotKey for the active tab and detect SPA navigation
  {
    activeSnapshotKey = getSnapshotKeyFromUrl(url);
    console.log("[Engram][Popup] snapshotKey=" + activeSnapshotKey + " platform=" + platform);
    if (_lastKnownSnapshotKey !== null && activeSnapshotKey !== _lastKnownSnapshotKey) {
      console.log("[Engram][Popup] chat changed — resetting local state",
        { from: _lastKnownSnapshotKey, to: activeSnapshotKey });
      hasLocalScanResult = false;
      scanResults = null;
      isScanning = false;
    }
    _lastKnownSnapshotKey = activeSnapshotKey;
  }
  updatePlatformDisplay(platform);
  updateSettingsPlatforms(platform);

  // LinkedIn gets its own panel � skip all AI chat state logic
  if (platform === "linkedin") {
    showState("linkedin");
    loadLinkedInView();
    return;
  }

  if (platform === "other") {
    scanResults = null;
    hasLocalScanResult = false;
    updateChatTitleEl(null);
    renderIdle("Open ChatGPT or Claude to scan a chat", true, "");
    return;
  }

  if (!isScanning) {
    const activeSession = await getActiveScanSession(tabId);
    const hasActiveSession = activeSessionMatches(activeSession, platform, activeSnapshotKey);
    console.log("[Engram][Popup] active scan session check", {
      tabId,
      platform,
      snapshotKey: activeSnapshotKey,
      hasActiveSession,
      activeSessionSnapshotKey: activeSession?.snapshotKey || null,
    });

    if (!hasActiveSession) {
      scanResults = null;
      lastHealthData = null;
      hasLocalScanResult = false;
      updateChatTitleEl(null);
      console.log("[Engram][Popup] scan required: no active session", {
        tabId,
        platform,
        snapshotKey: activeSnapshotKey,
      });
      renderIdle("Scan required", false, "Scan this chat to start live tracking.");
      return;
    }

    scanResults = markScanFreshness(
      { ...activeSession.scanResult },
      activeSession.freshnessState || activeSession.scanResult?.freshnessState || "fresh"
    );
    hasLocalScanResult = true;
    updateChatTitleEl(scanResults.sourceTitle || null);
    console.log("[Engram][Popup] active scan session restored", {
      tabId,
      platform,
      snapshotKey: activeSnapshotKey,
      total: scanResults?.total || scanResults?.stats?.total || 0,
    });
    renderDone("active-session");
    return;
  }

  // Get data from worker
  runtimeSendMessage({ type: "ENGRAM_GET_STATE" }).then((res) => {
    console.log("[Engram] state response received", res);
    _dpbg("ENGRAM_GET_STATE response", { isScanning, hasLocalScanResult, currentState, sessionId: res?.session?.id ?? null, hasSession: !!res?.session });
    if (!res) {
      if (isScanning || hasLocalScanResult) {
        console.log("[Engram] ignoring stale state response", {
          reason: "null state",
          isScanning,
          hasLocalScanResult,
        });
        keepLocalScanResult();
        return;
      }

      if (platform === "other") {
        renderIdle("Open ChatGPT or Claude to scan a chat", true);
      } else {
        renderIdle("Scan to analyze this chat", false);
      }
      return;
    }

    const session = res.session;
    const health = res.health;

    // Update chat title — prefer scanned sourceTitle, fall back to session name
    updateChatTitleEl(scanResults?.sourceTitle || session?.name || null);

    // Determine view state
    if (platform === "other") {
      // Not on AI platform
      if (keepLocalScanResult()) return;
      renderIdle("Open ChatGPT or Claude to scan a chat", true);
    } else if (scanResults && scanResults.chatId === session?.id) {
      // Already scanned this chat
      renderDone("state-match");
    } else if (hasLocalScanResult) {
      console.log("[Engram] ignoring stale state response", {
        reason: "session mismatch or missing session",
        sessionId: session?.id,
        localChatId: scanResults?.chatId,
      });
      keepLocalScanResult();
    } else {
      _dpbg("else branch reached", { isScanning, hasLocalScanResult, hasSession: !!session });
      if (isScanning) return; // don't overwrite active scan state with unknown
      renderIdle(session ? "Scan to analyze this chat" : "State unknown. Scan Chat is still available.");
    }
  });
}

// Shared scan execution — called by both Scan and Rescan buttons
async function runScan() {
  console.log("[Engram] scan started");
  isScanning = true;
  hasLocalScanResult = false;
  scanResults = null;
  $("btnScan").disabled = true;
  const _rb = $("btnRescan");
  if (_rb) _rb.disabled = true;
  showState("scanning");

  try {
    const tabs = await tabsQuery({ active: true, currentWindow: true });
    if (!tabs[0]) {
      isScanning = false;
      $("btnScan").disabled = false;
      if (_rb) _rb.disabled = false;
      renderError("No active tab found. Scan Chat is still available.");
      return;
    }

    _dpbg("sending ENGRAM_START_SCAN", { tabId: tabs[0].id, url: tabs[0].url, activePlatform });
    const response = await tabsSendMessage(tabs[0].id, { type: "ENGRAM_START_SCAN" });
    _dpbg("raw tabsSendMessage response", { type: response?.type, total: response?.total, partial: response?.partial, chatId: response?.chatId });
    if (!response) {
      isScanning = false;
      $("btnScan").disabled = false;
      if (_rb) _rb.disabled = false;
      renderError("Scan did not receive a response. Reload the page and try again.");
      return;
    }

    if (response.type === "ENGRAM_SCAN_COMPLETE") {
      console.log("[Engram] scan completed", response);
      _dpbg("scan-complete branch", { total: response.total, userCount: response.userCount, aiCount: response.aiCount, partial: response.partial, strategy: response.extractionStrategy });
      isScanning = false;
      hasLocalScanResult = true;
      activeTabId = tabs[0].id;
      activePlatform = detectPlatformFromUrl(tabs[0].url || "");
      if (activePlatform === "other") activePlatform = getPlatformId(response);
      activeSnapshotKey = getSnapshotKeyFromUrl(tabs[0].url || response.url || "");
      scanResults = markScanFreshness(response, "fresh");
      scanResults.chatId = response.chatId;
      scanResults.snapshotKey = activeSnapshotKey;

      await setActiveScanSession(tabs[0].id, {
        platform: activePlatform,
        chatId: response.chatId || null,
        snapshotKey: activeSnapshotKey,
        startedAt: Date.now(),
        lastUpdatedAt: Date.now(),
        freshnessState: "fresh",
        scanResult: scanResults,
      });

      updateChatTitleEl(response.sourceTitle || null);
      renderDone("scan-complete");
      await persistScanResult(response);

      // Notify content script immediately so widget updates without a storage round-trip
      const _bePlatform = getPlatformId(response);
      const _beKey = activeSnapshotKey || getHealthSnapshotKey(response);
      const _beHd = lastHealthData;
      if (_bePlatform !== "other" && _beHd && tabs[0]) {
        const _beDisp = getHealthDisplay(_beHd.score);
        tabsSendMessage(tabs[0].id, {
          type: "ENGRAM_BASELINE_ESTABLISHED",
          platform: _bePlatform,
          snapshotKey: _beKey,
          sourceUrl: response.url || "",
          stats: {
            total: response.total || 0,
            userCount: response.userCount || 0,
            aiCount: response.aiCount || 0,
            codeCount: response.codeCount || 0,
            totalChars: response.totalChars || 0,
          },
          healthLabel: _beDisp.label,
          healthColor: _beDisp.color,
        }).catch(() => {});
        console.log("[Engram] ENGRAM_BASELINE_ESTABLISHED sent snapshotKey=" + _beKey);
      }

      loadState();
    }
  } catch (e) {
    isScanning = false;
    hasLocalScanResult = false;
    $("btnScan").disabled = false;
    if ($("btnRescan")) $("btnRescan").disabled = false;
    renderError("Error starting scan. Reload the page and try again.");
  }
}

// Scan button (idle view)
on("btnScan", "click", () => runScan());

// Rescan button (done view — always available after first scan)
on("btnRescan", "click", () => runScan());

// Listen for scan progress
_api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ENGRAM_ACTIVE_SCAN_SESSION_UPDATED") {
    if (msg.tabId !== activeTabId) return;
    if (msg.platform !== activePlatform) return;
    if (msg.snapshotKey !== activeSnapshotKey) return;
    scanResults = markScanFreshness(
      { ...(msg.scanResult || {}) },
      msg.scanResult?.baselineSource === "live_update_after_baseline" ? "live" : "fresh"
    );
    scanResults.snapshotKey = activeSnapshotKey;
    hasLocalScanResult = true;
    updateChatTitleEl(scanResults.sourceTitle || null);
    console.log("[Engram][Popup] live update rendered", {
      platform: activePlatform,
      snapshotKey: activeSnapshotKey,
      total: scanResults?.total || scanResults?.stats?.total || 0,
    });
    renderDone("live-update");
    return;
  }

  if (msg.type === "ENGRAM_SCAN_PROGRESS") {
    $("scanCount").textContent = `⟳ Scanning... ${msg.count} messages found`;
    $("scanProgress").style.width = msg.percent + "%";
  }

  if (msg.type === "ENGRAM_SCAN_COMPLETE") {
    (async () => {
      console.log("[Engram] scan completed", msg);
      isScanning = false;
      hasLocalScanResult = true;

      let tab = null;
      try {
        const tabs = await tabsQuery({ active: true, currentWindow: true });
        tab = tabs[0] || null;
      } catch (_) {}

      const tabId = tab?.id ?? activeTabId;
      const tabUrl = tab?.url || msg.url || "";
      activeTabId = tabId;
      activePlatform = detectPlatformFromUrl(tabUrl);
      if (activePlatform === "other") activePlatform = getPlatformId(msg);
      activeSnapshotKey = getSnapshotKeyFromUrl(tabUrl);

      scanResults = markScanFreshness(msg, "fresh");
      scanResults.chatId = msg.chatId;
      scanResults.snapshotKey = activeSnapshotKey;

      await setActiveScanSession(tabId, {
        platform: activePlatform,
        chatId: msg.chatId || null,
        snapshotKey: activeSnapshotKey,
        startedAt: Date.now(),
        lastUpdatedAt: Date.now(),
        freshnessState: "fresh",
        scanResult: scanResults,
      });

      updateChatTitleEl(msg.sourceTitle || null);
      renderDone("scan-complete-message");
      persistScanResult(msg);

      loadState(); // Refresh active session from runtime storage
    })();
  }
});

// Generate Handoff
on("btnHandoff", "click", async () => {
  const statusBar = $("statusBar");
  statusBar.textContent = "Refreshing chat before handoff...";
  statusBar.style.color = "";

  let exportSource;
  try {
    exportSource = await getCanonicalScanResultForExport("handoff");
    statusBar.textContent = exportSource.warning || "Generating handoff...";
    statusBar.style.color = exportSource.warning ? "#f59e0b" : "";
  } catch (e) {
    console.error("[Engram] handoff fresh export source failed", e);
    statusBar.textContent = e?.message || "Fresh scan failed. Please scan again.";
    statusBar.style.color = "#ef4444";
    return;
  }

  const exportScanResult = exportSource.scanResult;
  const exportHealthData = exportSource.healthData;

  // Try AI generation via configured endpoint first, using the fresh export source.
  const aiSuccess = await tryAIHandoff(exportScanResult);
  if (aiSuccess) return;

  // Generate locally from scan results (preferred path)
  if (exportScanResult && (exportScanResult.messages?.length || exportScanResult.total > 0)) {
    const markdown = generateHandoffMarkdown(exportScanResult, exportHealthData);
    try {
      await navigator.clipboard.writeText(markdown);
      statusBar.textContent = exportSource.warning || "Handoff copied to clipboard!";
      statusBar.style.color = exportSource.warning ? "#f59e0b" : "#22c55e";
    } catch (e) {
      // Clipboard blocked — fall back to download
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `engram-handoff-${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
      statusBar.textContent = exportSource.warning || "Handoff downloaded (clipboard blocked)";
      statusBar.style.color = exportSource.warning ? "#f59e0b" : "#22c55e";
    }
    clearStatusBarLater(statusBar.textContent, 4000);
    return;
  }
  statusBar.textContent = "No handoff data - scan first";
  clearStatusBarLater(statusBar.textContent, 3000);
  return;
});

// Export Migration Package (immediate, no file picker)
on("btnExportPackage", "click", async () => {
  const statusBar = $("statusBar");

  statusBar.textContent = "Refreshing chat before export...";
  statusBar.style.color = "";

  try {
    const exportSource = await getCanonicalScanResultForExport("package");
    statusBar.textContent = exportSource.warning || "Building migration package...";
    statusBar.style.color = exportSource.warning ? "#f59e0b" : "";
    const { blob, filename, stats } = await buildMigrationPackage(
      exportSource.scanResult,
      exportSource.healthData,
      []
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    statusBar.textContent = exportSource.warning || "Migration package downloaded";
    statusBar.style.color = exportSource.warning ? "#f59e0b" : "#22c55e";
    console.log("[Engram][Export] package downloaded", stats);
    clearStatusBarLater(statusBar.textContent, 4000);
  } catch (e) {
    console.error("[Engram] package export failed", e);
    statusBar.textContent = e?.message || "Package export failed";
    statusBar.style.color = "#ef4444";
  }
});

// Export Migration Package with Files (file picker first)
on("btnExportWithFiles", "click", async () => {
  const statusBar = $("statusBar");

  const fileInput = $("filePickerInput");
  fileInput.value = "";

  const userFiles = await new Promise((resolve) => {
    let settled = false;
    const settle = (files) => {
      if (settled) return;
      settled = true;
      fileInput.removeEventListener("change", onChange);
      fileInput.removeEventListener("cancel", onCancel);
      resolve(files);
    };
    const onChange = () => settle(Array.from(fileInput.files || []));
    const onCancel = () => settle([]);
    fileInput.addEventListener("change", onChange);
    fileInput.addEventListener("cancel", onCancel);
    fileInput.click();
  });

  if (userFiles.length === 0) {
    statusBar.textContent = "Refreshing chat before export...";
    statusBar.style.color = "";
  } else {
    statusBar.textContent = "Refreshing chat before export...";
    statusBar.style.color = "";
  }

  try {
    const exportSource = await getCanonicalScanResultForExport("package-with-files");
    statusBar.textContent = exportSource.warning || "Building migration package...";
    statusBar.style.color = exportSource.warning ? "#f59e0b" : "";
    const { blob, filename, stats } = await buildMigrationPackage(
      exportSource.scanResult,
      exportSource.healthData,
      userFiles
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    statusBar.textContent = exportSource.warning || "Migration package downloaded";
    statusBar.style.color = exportSource.warning ? "#f59e0b" : "#22c55e";
    console.log("[Engram][Export] package downloaded", stats);
    clearStatusBarLater(statusBar.textContent, 4000);
  } catch (e) {
    console.error("[Engram] package export failed", e);
    statusBar.textContent = e?.message || "Package export failed";
    statusBar.style.color = "#ef4444";
  }
});

// Settings
on("btnSettings", "click", async () => {
  if (currentState === "settings") {
    const target = getMainPopupState();
    stateBeforeSettings = null;
    showState(target);
    if (target !== "scanning") loadState();
    return;
  }

  stateBeforeSettings = currentState;
  showState("settings");
  loadSettings();
  await refreshActivePlatformFromTab();
});

// Website links
on("btnOpenWebsiteBrand", "click", openEngramSite);
on("btnOpenWebsiteMain", "click", openEngramSite);
on("btnOpenWebsiteSettings", "click", openEngramSite);

on("btnClearSettings", "click", () => {
  if (!confirm("Clear all captured data?")) return;
  scanResults = null;
  hasLocalScanResult = false;
  isScanning = false;
  stateBeforeSettings = null;
  runtimeSendMessage({ type: "ENGRAM_RESET_ALL" }).then(() => showState("idle"));
});

// Widget toggle — saves immediately on click
on("btnWidgetToggle", "click", async () => {
  engramSettings.showMiniHealthWidget = !engramSettings.showMiniHealthWidget;
  const btn = $("btnWidgetToggle");
  if (btn) {
    const on = !!engramSettings.showMiniHealthWidget;
    btn.textContent = on ? "On" : "Off";
    btn.classList.toggle("on", on);
  }
  try { await storageSet({ engramSettings }); } catch (_) {}
});

// LinkedIn widget toggles (Settings + main LinkedIn view) � saved immediately
async function toggleLinkedInWidget() {
  engramSettings.linkedInWidgetEnabled = engramSettings.linkedInWidgetEnabled !== false ? false : true;
  syncLinkedInToggles();
  try { await storageSet({ engramSettings }); } catch (_) {}
}

on("btnLinkedInWidgetToggle",     "click", toggleLinkedInWidget);
on("btnLinkedInWidgetToggleMain", "click", toggleLinkedInWidget);

// Export Chat
on("btnExport", "click", () => {
  if (!scanResults) return;

  const text = scanResults.messages
    ?.map(m => `[${m.role.toUpperCase()}] ${m.text}`)
    .join("\n\n") || "No messages captured";

  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `engram-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);

  const statusBar = $("statusBar");
  statusBar.textContent = "✓ Chat exported";
  statusBar.style.color = "#22c55e";
  clearStatusBarLater(statusBar.textContent, 3000, true);
});

// Clear
on("btnClear", "click", () => {
  if (!confirm("Clear current chat data?")) return;

  scanResults = null;
  hasLocalScanResult = false;
  isScanning = false;
  runtimeSendMessage({ type: "ENGRAM_RESET_ALL" }).then(() => showState("idle"));
});

// Mode toggle
on("btnModeDemo", "click", () => {
  engramSettings.mode = "demo";
  updateModeToggle("demo");
  $("panelDemo").style.display   = "block";
  $("panelCustom").style.display = "none";
  updateDemoStatus();
});

on("btnModeCustom", "click", () => {
  engramSettings.mode = "custom";
  updateModeToggle("custom");
  $("panelDemo").style.display   = "none";
  $("panelCustom").style.display = "block";
  updateDemoStatus();
});

// Save settings
on("btnSaveSettings", "click", saveSettings);

// -- LinkedIn helpers --------------------------------------------------------

async function refreshLinkedInCounts() {
  try {
    const stored = await storageGet("engramSavedJobs");
    const jobs = (stored && stored.engramSavedJobs) || [];
    const savedEl  = $("jobSavedCount");
    const queuedEl = $("jobQueuedCount");
    if (savedEl)  savedEl.textContent  = jobs.length;
    if (queuedEl) queuedEl.textContent = jobs.filter(function(j) { return j.queued !== false; }).length;
  } catch (_) {}
}

// -- LinkedIn Job Source -----------------------------------------------------

function _fillPopupAvatar(avEl, job) {
  avEl.innerHTML = "";
  if (job && job.companyLogoUrl) {
    const img = document.createElement("img");
    img.src = job.companyLogoUrl;
    Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover" });
    img.onerror = function () {
      this.remove();
      avEl.textContent = job.companyInitials || (job.company || "?").slice(0, 1).toUpperCase();
    };
    avEl.appendChild(img);
  } else if (job) {
    avEl.textContent = job.companyInitials || (job.company || "?").slice(0, 1).toUpperCase();
  }
}

async function loadLinkedInView() {
  try {
    const stored = await storageGet("engramSavedJobs");
    const jobs = (stored && stored.engramSavedJobs) || [];
    const queued = jobs.filter(function(j) { return j.queued !== false; }).length;
    const savedEl   = $("jobSavedCount");
    const queuedEl  = $("jobQueuedCount");
    const hintEl    = $("jobQueueHint");
    const buildBtn  = $("btnBuildJobPackage");
    if (savedEl)  savedEl.textContent  = jobs.length;
    if (queuedEl) queuedEl.textContent = queued;
    if (hintEl) {
      if (jobs.length === 0) {
        hintEl.textContent = "Save jobs using the Engram widget on LinkedIn pages.";
      } else if (queued === 0) {
        hintEl.textContent = "Open the archive to select jobs for your package.";
      } else {
        hintEl.textContent = queued + " job" + (queued === 1 ? "" : "s") + " queued for your AI package.";
      }
    }
    if (buildBtn) buildBtn.disabled = jobs.length === 0;

    try {
      const tabs = await tabsQuery({ active: true, currentWindow: true });
      if (tabs[0]) {
        const res = await tabsSendMessage(tabs[0].id, { type: "ENGRAM_GET_CURRENT_JOB" });
        const job = res && res.job && res.job.title ? res.job : null;

        const previewRow = $("jobPreviewRow");
        const infoEl     = $("currentJobInfo");

        if (job) {
          const avEl    = $("jobPrevAvatar");
          const titleEl = $("jobPrevTitle");
          const metaEl  = $("jobPrevMeta");
          if (avEl)    _fillPopupAvatar(avEl, job);
          if (titleEl) titleEl.textContent = job.title;
          if (metaEl)  metaEl.textContent  = [
            job.company,
            (job.remoteStatus && job.remoteStatus !== "Not specified") ? job.remoteStatus : "",
          ].filter(Boolean).join(" \xb7 ");
          if (previewRow) previewRow.style.display = "";
          if (infoEl)     infoEl.style.display     = "none";
        } else {
          if (previewRow) previewRow.style.display = "none";
          if (infoEl) {
            infoEl.style.display = "";
            infoEl.textContent   = "See Engram widget on the page";
            infoEl.classList.add("no-job");
          }
        }
      }
    } catch (_) {}

    syncLinkedInToggles();
  } catch (_) {}
}

function buildMultiJobPrompt(jobs) {
  const count   = jobs.length;
  const jobList = jobs.map(function (j, i) {
    const jobUrl = j.canonicalUrl || j.url || "Unknown";
    return [
      "### Job " + (i + 1) + ": " + (j.title || "Unknown") + " at " + (j.company || "Unknown"),
      "",
      "- **Location:** " + (j.location || "Unknown"),
      "- **Remote Status:** " + (j.remoteStatus || "Not specified"),
      "- **Salary:** " + (j.salary || "Not disclosed"),
      "- **URL:** " + jobUrl,
      "",
      "**Description:**",
      "",
      j.description ? j.description.slice(0, 2000) : "No description captured.",
    ].join("\n");
  }).join("\n\n---\n\n");

  return "# LinkedIn Job Search Analysis\n\n" +
    "I collected these LinkedIn jobs. Please compare the selected roles, identify strongest fit, " +
    "check red flags, map requirements to my skills/projects, suggest resume positioning, " +
    "and prepare application next steps.\n\n" +
    "Specifically provide:\n\n" +
    "1. **Ranking by overall fit** � Which roles are the strongest candidates?\n" +
    "2. **Red flags** � Any signs of scam, misleading requirements, or unrealistic expectations?\n" +
    "3. **Requirements mapping** � What skills and experience do these roles require?\n" +
    "4. **Resume positioning** � How should I position myself for each role?\n" +
    "5. **Application next steps** � Which jobs to prioritize and what to research before applying?\n" +
    "6. **Questions to ask recruiters** � What should I clarify for each role?\n\n" +
    "---\n\n" + jobList + "\n\n---\n" +
    "_Generated by Engram \xb7 " + new Date().toLocaleString() + "_\n";
}

function buildJobsMd(jobs) {
  var lines = [
    "# Saved Jobs", "",
    "_" + jobs.length + " job(s) \xb7 Generated by Engram \xb7 " + new Date().toISOString() + "_",
    "",
  ];
  jobs.forEach(function (j, i) {
    lines.push("## " + (i + 1) + ". " + escapeHtml(j.title || "Unknown") + " � " + escapeHtml(j.company || "Unknown"));
    lines.push("");
    if (j.location)     lines.push("- **Location:** " + j.location);
    if (j.remoteStatus) lines.push("- **Remote:** " + j.remoteStatus);
    if (j.salary)       lines.push("- **Salary:** " + j.salary);
    var jobUrl = j.canonicalUrl || j.url;
    if (jobUrl)         lines.push("- **URL:** " + jobUrl);
    if (j.description) {
      lines.push("", "**Description:**", "", j.description.slice(0, 2000));
    }
    lines.push("", "---", "");
  });
  return lines.join("\n");
}

function buildJobSearchHandoff(jobs) {
  var summary = jobs.map(function (j, i) {
    var jobUrl = j.canonicalUrl || j.url || "";
    return (i + 1) + ". **" + (j.title || "Unknown") + "** at **" + (j.company || "Unknown") +
      "** � " + (j.location || "Unknown") + " (" + (j.remoteStatus || "N/A") + ")" +
      (jobUrl ? " � " + jobUrl : "");
  }).join("\n");

  return "# Job Search Handoff\n\n" +
    "> Generated by Engram. Use this to continue your job search analysis in a new AI chat.\n\n" +
    "## Saved Jobs Summary\n\n" + summary + "\n\n" +
    "## How to Use\n\n" +
    "1. Start a new chat in ChatGPT or Claude.ai.\n" +
    "2. Paste the prompt from `ai-prompt.md` to begin the analysis.\n" +
    "3. Reference `jobs.md` for full job details.\n" +
    "4. Use `jobs.json` if you need machine-readable data.\n\n" +
    "_Generated: " + new Date().toISOString() + "_\n";
}

async function buildJobPackage() {
  var bar = $("jobStatusBar");
  try {
    var stored  = await storageGet("engramSavedJobs");
    var allJobs = (stored && stored.engramSavedJobs) || [];
    var jobs    = allJobs.filter(function(j) { return j.queued !== false; });

    if (!allJobs.length) {
      if (bar) { bar.textContent = "No saved jobs. Use the widget on LinkedIn pages."; bar.style.color = ""; }
      return;
    }

    if (!jobs.length) {
      if (bar) {
        bar.textContent = "Select at least one job in the archive for the package.";
        bar.style.color = "#f59e0b";
        clearStatusBarLater(bar.textContent, 4000, true);
      }
      return;
    }

    if (bar) { bar.textContent = "Building package�"; bar.style.color = ""; }

    var datestamp = new Date().toISOString().slice(0, 10);
    var zip = new window.ZipWriter();
    zip.addText("job-search-handoff.md", buildJobSearchHandoff(jobs));
    zip.addText("jobs.md",               buildJobsMd(jobs));
    zip.addText("jobs.json",             JSON.stringify(jobs, null, 2));
    zip.addText("ai-prompt.md",          buildMultiJobPrompt(jobs));

    var blob = zip.build();
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement("a");
    a.href     = url;
    a.download = "engram-job-package-" + datestamp + ".zip";
    a.click();
    URL.revokeObjectURL(url);

    if (bar) {
      bar.textContent = "? Job package downloaded";
      bar.style.color = "#22c55e";
      clearStatusBarLater(bar.textContent, 4000, true);
    }
  } catch (e) {
    console.error("[Engram] job package build failed", e);
    if (bar) { bar.textContent = "Package build failed"; bar.style.color = "#ef4444"; }
  }
}

async function copyJobPrompt() {
  var bar = $("jobStatusBar");
  try {
    var stored = await storageGet("engramSavedJobs");
    var jobs   = (stored && stored.engramSavedJobs) || [];

    if (!jobs.length) {
      if (bar) { bar.textContent = "No saved jobs yet."; bar.style.color = ""; }
      return;
    }

    await navigator.clipboard.writeText(buildMultiJobPrompt(jobs));
    if (bar) {
      bar.textContent = "? AI prompt copied!";
      bar.style.color = "#22c55e";
      clearStatusBarLater(bar.textContent, 3000, true);
    }
  } catch (e) {
    if (bar) { bar.textContent = "Copy failed"; bar.style.color = "#ef4444"; }
  }
}

on("btnBuildJobPackage", "click", buildJobPackage);
on("btnCopyJobPrompt",   "click", copyJobPrompt);

on("btnViewArchive", "click", () => {
  _api.tabs.create({ url: _api.runtime.getURL("jobs/archive.html") });
});

// Init
installImageFallbacks();
renderIdle();
loadSettings();
loadState();
setInterval(loadState, 3000);

// React to live scans arriving while the popup is open
try {
  const _onChanged = isFirefox ? browser.storage.onChanged : chrome.storage.onChanged;
  _onChanged.addListener((changes, area) => {
    (async () => {
    if (area !== "local" && area !== "session") return;
    if (currentState === "scanning" || currentState === "settings" || currentState === "linkedin") return;

    const liveKeys = ["engramChatgptLatestScanResult", "engramClaudeLatestScanResult"];
    const changedKey = liveKeys.find(k => k in changes);
    const activeSessionsChanged = ACTIVE_SCAN_SESSIONS_KEY in changes;
    if (!changedKey && !activeSessionsChanged) return;

    const activeSession = await getActiveScanSession(activeTabId);
    const hasActiveSession = activeSessionMatches(activeSession, activePlatform, activeSnapshotKey);
    console.log("[Engram][Popup] active scan session check", {
      tabId: activeTabId,
      platform: activePlatform,
      snapshotKey: activeSnapshotKey,
      hasActiveSession,
      activeSessionSnapshotKey: activeSession?.snapshotKey || null,
    });
    if (!hasActiveSession) {
      console.log("[Engram][Popup] scan required: no active session", {
        tabId: activeTabId,
        platform: activePlatform,
        snapshotKey: activeSnapshotKey,
      });
      return;
    }

    scanResults = markScanFreshness(
      { ...activeSession.scanResult },
      activeSession.scanResult?.baselineSource === "live_update_after_baseline" ? "live" : "fresh"
    );
    scanResults.snapshotKey = activeSnapshotKey;
    hasLocalScanResult = true;
    updateChatTitleEl(scanResults.sourceTitle || null);
    console.log("[Engram][Popup] live update rendered", {
      tabId: activeTabId,
      platform: activePlatform,
      snapshotKey: activeSnapshotKey,
      total: scanResults?.total || scanResults?.stats?.total || 0,
    });
    renderDone(scanResults.freshnessState === "live" ? "live-update" : "scan-complete");
    })();
  });
} catch (_) {}
