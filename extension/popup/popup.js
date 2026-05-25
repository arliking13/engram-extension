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
async function tryAIHandoff() {
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
    const messages = (scanResults?.messages || []).map(m => ({
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

function renderIdle(message = "Scan to analyze this chat", disabled = false) {
  console.log("[Engram] rendering idle state", message);
  lastRenderSource = "idle";
  showState("idle");

  const hint = document.querySelector("#idleView .idle-hint");
  const scanButton = $("btnScan");

  if (hint) hint.textContent = message;
  if (scanButton) scanButton.disabled = disabled;
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

function renderDone(source = "local") {
  if (!scanResults) return;

  console.log("[Engram] rendering done state", source);
  lastRenderSource = source;
  showState("done");

  $("userCount").textContent = scanResults.userCount || 0;
  $("aiCount").textContent = scanResults.aiCount || 0;
  $("totalCount").textContent = scanResults.total || 0;
  $("codeCount").textContent = scanResults.codeCount || 0;
  $("btnScan").disabled = false;

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
  if (!snapshot) return false;

  console.log("[Engram][Popup] hydrating from cached snapshot", {
    snapshotKey: snapshot.snapshotKey,
    healthScore: snapshot.healthScore,
    total: snapshot.stats && snapshot.stats.total,
    platform: snapshot.platform,
    scannedAt: snapshot.scannedAt,
  });

  scanResults = {
    _fromCachedSnapshot: true,
    chatId: snapshot.chatId || null,
    url: snapshot.sourceUrl || "",
    sourceTitle: snapshot.sourceTitle || "",
    sourcePlatform: snapshot.platform || "unknown",
    platform: snapshot.platform || "unknown",
    total: (snapshot.stats && snapshot.stats.total) || 0,
    userCount: (snapshot.stats && snapshot.stats.userCount) || 0,
    aiCount: (snapshot.stats && snapshot.stats.aiCount) || 0,
    codeCount: (snapshot.stats && snapshot.stats.codeCount) || 0,
    totalChars: (snapshot.stats && snapshot.stats.totalChars) || 0,
    messages: [],
  };

  lastHealthData = {
    score: snapshot.healthScore,
    health: snapshot.healthScore,
    healthLabel: snapshot.healthLabel || snapshot.statusLabel || getHealthDisplay(snapshot.healthScore).label,
    statusLabel: snapshot.statusLabel || snapshot.healthLabel || getHealthDisplay(snapshot.healthScore).label,
    migrationRisk: snapshot.migrationRisk || "",
    migrationRiskClass: getMigrationRiskClass(snapshot.migrationRisk),
    browserLoad: snapshot.browserLoad || "",
    action: snapshot.action || "",
    reasons: snapshot.reasons || [],
    pressure: {},
  };

  hasLocalScanResult = true;
  updateChatTitleEl(snapshot.sourceTitle || null);

  const ageMs = Date.now() - (snapshot.scannedAt || 0);
  renderDone("cached-snapshot");

  var statusBar = $("statusBar");
  if (statusBar && ageMs > 30 * 60 * 1000) {
    statusBar.textContent = "Showing data from " + Math.round(ageMs / 60000) + " min ago";
    statusBar.style.color = "";
  }

  return true;
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

  const snapshotKey = getHealthSnapshotKey(result);
  const obj = {
    platform,
    chatId:      result.chatId    || "unknown",
    snapshotKey,
    sourceUrl:   result.url       || "",
    sourceTitle: result.sourceTitle || "",
    scannedAt:   result.scannedAt || Date.now(),
    extractionStrategy: result.extractionStrategy || "",
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

  let writes;
  if (platform === "chatgpt") {
    writes = {
      "engramChatgptLatestScanResult":        obj,
      "engramChatgptLatestSnapshot":          obj,
      "engram:chatgpt:conversationSnapshot":  obj,
    };
  } else {
    writes = {
      "engramClaudeLatestScanResult":       obj,
      "engramClaudeLatestSnapshot":         obj,
      "engram:claude:conversationSnapshot": obj,
    };
  }

  try {
    await storageSet(writes);
    console.log(
      "[Engram] scan result persisted",
      `platform=${platform}`,
      `chatId=${obj.chatId}`,
      `messages=${msgs.length}`
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

function generateHandoffMarkdown(sr, hd) {
  const msgs = sr.messages || [];
  const recentMsgs = msgs.slice(-30);
  const allText = msgs.map(m => m.text || "").join("\n");

  const { filePaths, gitActivity, errorLines, todoLines } = extractTechnicalSignals(allText);

  // Recent context
  const contextSection = recentMsgs
    .filter(m => m.text && m.text.trim().length > 5)
    .map(m => {
      const role = m.role === "user" ? "**User**" : "**Assistant**";
      const text = m.text.length > 1000 ? m.text.slice(0, 1000) + "\n[...truncated]" : m.text;
      return `${role}: ${text}`;
    })
    .join("\n\n---\n\n");

  // Code blocks — last 5, capped at 800 chars each
  const allCode = msgs.flatMap(m => m.codeBlocks || []).filter(c => c.code.length > 30);
  const codeCountStat = sr.codeCount || 0;
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
  const totalKb = Math.round((sr.totalChars || 0) / 1000);
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
- **Platform:** ${getPlatformDisplayName(sr)}
- **Chat Title:** ${sr.sourceTitle || "Untitled chat"}
- **Chat ID:** ${sr.chatId || "unknown"}
- **URL:** ${sr.url || "unknown"}
- **Generated:** ${ts}

## Chat Health at Migration
- **Chat Health:** ${hd ? hd.score + "%" : "—"}
- **Migration Risk:** ${hd?.migrationRisk ?? "—"}
- **Browser Load:** ${hd?.browserLoad ?? "—"}
${hd?.reasons?.length ? "- **Reasons:**\n" + hd.reasons.map(r => `  - ${r}`).join("\n") + "\n" : ""}
- **Recommendation:** ${hd?.action ?? "—"}

## Captured Stats
- User messages: ${sr.userCount || 0}
- AI messages: ${sr.aiCount || 0}
- Total messages: ${sr.total || 0}
- Code blocks: ${sr.codeCount || 0}
- Total text: ~${totalKb}k characters
- Scan duration: ${sr.scanDuration != null ? sr.scanDuration + "ms" : "unknown"}

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

**Session context:** ${sr.total || 0} messages captured by Engram before migration. Health at migration: ${riskStr}.

Please acknowledge this handoff and confirm what we should focus on first.
`;
}

// ── Migration package generators ────────────────────────────────

function generateFullChatExport(sr) {
  const msgs = sr.messages || [];
  const ts = new Date().toISOString();
  const lines = [
    "# Full Chat Export",
    "",
    `- **Source:** ${getPlatformDisplayName(sr)}`,
    `- **Chat Title:** ${sr.sourceTitle || "Untitled chat"}`,
    `- **URL:** ${sr.url || "unknown"}`,
    `- **Generated:** ${ts}`,
    `- **Total messages:** ${sr.total || msgs.length}`,
    "",
    "## Messages",
    "",
  ];

  if (msgs.length === 0) {
    lines.push("_No messages captured._");
  } else {
    msgs.forEach((m, i) => {
      const role = m.role === "user" ? "**User**" : "**Assistant**";
      lines.push(`${role}: ${m.text || "_empty_"}`);
      if (i < msgs.length - 1) lines.push("", "---", "");
    });
  }

  return lines.join("\n");
}

function generateTechnicalSignalsMd(sr) {
  const msgs = sr.messages || [];
  const allText = msgs.map(m => m.text || "").join("\n");
  const { filePaths, gitActivity, errorLines, todoLines } = extractTechnicalSignals(allText);
  const ts = new Date().toISOString();

  const parts = [
    "# Technical Signals",
    "",
    "_Extracted deterministically from captured chat data. Not an AI summary._",
    "",
    `- **Generated:** ${ts}`,
    `- **Source:** ${sr.url || "unknown"}`,
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

- **Source:** ${getPlatformDisplayName(sr)}
- **Chat Title:** ${sr.sourceTitle || "Untitled chat"}
- **URL:** ${sr.url || "unknown"}
- **Chat Health:** ${hd ? hd.score + "%" : "—"} (${hd?.migrationRisk ?? "—"} risk)
- **Total messages:** ${sr.total || 0}
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

async function buildMigrationPackage(sr, hd, userFiles) {
  const zip = new window.ZipWriter();
  const datestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  zip.addText("README_START_HERE.md", generateReadme(sr, hd));
  zip.addText("handoff.md",           generateHandoffMarkdown(sr, hd));
  zip.addText("full-chat-export.md",  generateFullChatExport(sr));
  zip.addText("technical-signals.md", generateTechnicalSignalsMd(sr));

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
  const msgs = sr.messages || [];
  const manifest = {
    packageType: "engram-migration-package",
    version: 1,
    generatedAt: new Date().toISOString(),
    sourcePlatform: getPlatformId(sr),
    sourceTitle: sr.sourceTitle || null,
    sourceUrl: sr.url || "unknown",
    chatHealth: hd?.score ?? null,
    migrationRisk: hd?.migrationRisk ?? null,
    browserLoad: hd?.browserLoad ?? null,
    stats: {
      userMessages: sr.userCount || 0,
      aiMessages: sr.aiCount || 0,
      totalMessages: sr.total || msgs.length,
      codeBlocks: sr.codeCount || 0,
      totalChars: sr.totalChars || 0,
    },
    includedFiles: [
      { path: "README_START_HERE.md", type: "readme" },
      { path: "handoff.md",           type: "handoff" },
      { path: "full-chat-export.md",  type: "full-export" },
      { path: "technical-signals.md", type: "technical-signals" },
    ],
    userAddedFiles: userFilesMeta,
  };
  zip.addText("manifest.json", JSON.stringify(manifest, null, 2));

  return {
    blob:     zip.build(),
    filename: `engram-migration-package-${datestamp}.zip`,
  };
}

// ── Debug hook (no-op in production — toggle ENGRAM_VERBOSE_LOGS in parser.js) ──
window.__ENGRAM_DEBUG__ = {
  computeHealthFromScan,
  generateHandoffMarkdown,
  getLastScan:   () => scanResults,
  getLastHealth: () => lastHealthData,
};

// Load state from worker
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
  activePlatform = platform;
  console.log("[Engram] active tab detected", { tabId, url, platform });
  updatePlatformDisplay(platform);
  updateSettingsPlatforms(platform);

  // LinkedIn gets its own panel � skip all AI chat state logic
  if (platform === "linkedin") {
    showState("linkedin");
    loadLinkedInView();
    return;
  }

  if (!isScanning && !hasLocalScanResult) {
    if (platform === "other") {
      renderIdle("Open ChatGPT or Claude to scan a chat", true);
    } else {
      try {
        var stored = await storageGet([HEALTH_SNAPSHOT_KEY, HEALTH_SNAPSHOTS_BY_CHAT_KEY]);
        var byChat = (stored && stored[HEALTH_SNAPSHOTS_BY_CHAT_KEY]) || null;
        var lastSnap = (stored && stored[HEALTH_SNAPSHOT_KEY]) || null;
        var cachedSnap = findCachedSnapshot(url, byChat, lastSnap, platform);
        if (cachedSnap) {
          console.log("[Engram][Popup] hydrating from cache on open", { snapshotKey: cachedSnap.snapshotKey });
          renderFromCache(cachedSnap);
        } else {
          renderIdle("Scan to analyze this chat", false);
        }
      } catch (_) {
        renderIdle("Scan to analyze this chat", false);
      }
    }
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

// Scan button
on("btnScan", "click", async () => {
  console.log("[Engram] scan button clicked");
  console.log("[Engram] scan started");
  isScanning = true;
  hasLocalScanResult = false;
  scanResults = null;
  $("btnScan").disabled = true;
  showState("scanning");

  // Start scan in content script
  try {
    const tabs = await tabsQuery({ active: true, currentWindow: true });
    if (!tabs[0]) {
      isScanning = false;
      $("btnScan").disabled = false;
      renderError("No active tab found. Scan Chat is still available.");
      return;
    }

    _dpbg("sending ENGRAM_START_SCAN", { tabId: tabs[0].id, url: tabs[0].url, activePlatform });
    const response = await tabsSendMessage(tabs[0].id, { type: "ENGRAM_START_SCAN" });
    _dpbg("raw tabsSendMessage response", { type: response?.type, total: response?.total, partial: response?.partial, chatId: response?.chatId });
      if (!response) {
        isScanning = false;
        $("btnScan").disabled = false;
        renderError("Scan did not receive a response. Reload the page and try again.");
        return;
      }

      if (response.type === "ENGRAM_SCAN_COMPLETE") {
        console.log("[Engram] scan completed", response);
        _dpbg("scan-complete branch", { total: response.total, userCount: response.userCount, aiCount: response.aiCount, partial: response.partial, strategy: response.extractionStrategy });
        isScanning = false;
        hasLocalScanResult = true;
        scanResults = response;
        scanResults.chatId = response.chatId;

        updateChatTitleEl(response.sourceTitle || null);
        renderDone("scan-complete");
        persistScanResult(response);

        loadState(); // Refresh gauge
      }
  } catch (e) {
    isScanning = false;
    hasLocalScanResult = false;
    $("btnScan").disabled = false;
    renderError("Error starting scan. Reload the page and try again.");
  }
});

// Listen for scan progress
_api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ENGRAM_SCAN_PROGRESS") {
    $("scanCount").textContent = `⟳ Scanning... ${msg.count} messages found`;
    $("scanProgress").style.width = msg.percent + "%";
  }

  if (msg.type === "ENGRAM_SCAN_COMPLETE") {
    console.log("[Engram] scan completed", msg);
    isScanning = false;
    hasLocalScanResult = true;
    scanResults = msg;
    scanResults.chatId = msg.chatId;

    updateChatTitleEl(msg.sourceTitle || null);
    renderDone("scan-complete-message");
    persistScanResult(msg);

    loadState(); // Refresh gauge
  }
});

// Generate Handoff
on("btnHandoff", "click", async () => {
  const statusBar = $("statusBar");
  statusBar.textContent = "Generating handoff...";
  statusBar.style.color = "";

  // Try AI generation via configured endpoint first
  const aiSuccess = await tryAIHandoff();
  if (aiSuccess) return;

  // Generate locally from scan results (preferred path)
  if (scanResults && (scanResults.messages?.length || scanResults.total > 0)) {
    const markdown = generateHandoffMarkdown(scanResults, lastHealthData);
    try {
      await navigator.clipboard.writeText(markdown);
      statusBar.textContent = "✓ Handoff copied to clipboard!";
      statusBar.style.color = "#22c55e";
    } catch (e) {
      // Clipboard blocked — fall back to download
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `engram-handoff-${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
      statusBar.textContent = "✓ Handoff downloaded (clipboard blocked)";
      statusBar.style.color = "#22c55e";
    }
    clearStatusBarLater(statusBar.textContent, 4000);
    return;
  }

  // No local scan — try worker fallback
  console.log("[Engram] no local scan results, trying worker handoff");
  const res = await runtimeSendMessage({ type: "ENGRAM_GENERATE_HANDOFF" });
  if (!res) {
    statusBar.textContent = "Scan first to generate a handoff";
    clearStatusBarLater(statusBar.textContent, 3000);
    return;
  }
  if (res.error) {
    statusBar.textContent = res.error;
    return;
  }
  const prompt = res.continuationPrompt || res.handoff?.continuationPrompt;
  if (!prompt) {
    statusBar.textContent = "No handoff data — scan first";
    clearStatusBarLater(statusBar.textContent, 3000);
    return;
  }
  try {
    await navigator.clipboard.writeText(prompt);
    statusBar.textContent = "✓ Handoff copied to clipboard!";
    statusBar.style.color = "#22c55e";
    clearStatusBarLater(statusBar.textContent, 3000);
  } catch (e) {
    statusBar.textContent = "Clipboard blocked — see console";
    statusBar.style.color = "#ef4444";
  }
});

// Export Migration Package (immediate, no file picker)
on("btnExportPackage", "click", async () => {
  const statusBar = $("statusBar");

  if (!scanResults) {
    statusBar.textContent = "Scan first to export a migration package";
    statusBar.style.color = "";
    clearStatusBarLater(statusBar.textContent, 3000);
    return;
  }

  statusBar.textContent = "Building migration package...";
  statusBar.style.color = "";

  try {
    const { blob, filename } = await buildMigrationPackage(scanResults, lastHealthData, []);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    statusBar.textContent = "✓ Migration package downloaded";
    statusBar.style.color = "#22c55e";
    clearStatusBarLater(statusBar.textContent, 4000);
  } catch (e) {
    console.error("[Engram] package export failed", e);
    statusBar.textContent = "Package export failed";
    statusBar.style.color = "#ef4444";
  }
});

// Export Migration Package with Files (file picker first)
on("btnExportWithFiles", "click", async () => {
  const statusBar = $("statusBar");

  if (!scanResults) {
    statusBar.textContent = "Scan first to export a migration package";
    statusBar.style.color = "";
    clearStatusBarLater(statusBar.textContent, 3000);
    return;
  }

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
    statusBar.textContent = "No files selected — exporting package without attachments";
    statusBar.style.color = "";
  } else {
    statusBar.textContent = "Building migration package...";
    statusBar.style.color = "";
  }

  try {
    const { blob, filename } = await buildMigrationPackage(scanResults, lastHealthData, userFiles);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    statusBar.textContent = "✓ Migration package downloaded";
    statusBar.style.color = "#22c55e";
    clearStatusBarLater(statusBar.textContent, 4000);
  } catch (e) {
    console.error("[Engram] package export failed", e);
    statusBar.textContent = "Package export failed";
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
