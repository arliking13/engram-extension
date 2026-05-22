/**
 * Engram Popup — State Machine & UI Logic
 */

const $ = (id) => document.getElementById(id);
const _api = typeof browser !== "undefined" ? browser : chrome;
const isFirefox = typeof browser !== "undefined";

console.log("[Engram] popup loaded");

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

// State machine
let currentState = "idle";
let scanResults = null;
let isScanning = false;
let hasLocalScanResult = false;
let lastRenderSource = "init";

function showState(state) {
  currentState = state;
  $("idleView").style.display = state === "idle" ? "block" : "none";
  $("scanningView").style.display = state === "scanning" ? "block" : "none";
  $("doneView").style.display = state === "done" ? "block" : "none";
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

// Update speedometer gauge
function updateGauge(score) {
  if (score === undefined) return;

  const needleGroup = $("gaugeNeedleGroup");
  const statusEl = $("gaugeStatus");

  if (!needleGroup || !statusEl) return;

  // score 0 = critical = left (-90deg)
  // score 100 = fresh = right (+90deg)
  const angle = -90 + (score / 100 * 180);
  needleGroup.style.transform = `rotate(${angle}deg)`;

  let label, color;
  if (score >= 70) {
    label = "Fresh";
    color = "#22c55e";
  } else if (score >= 50) {
    label = "Getting long";
    color = "#f59e0b";
  } else if (score >= 30) {
    label = "Degrading";
    color = "#f97316";
  } else {
    label = "Needs handoff now";
    color = "#ef4444";
  }

  statusEl.textContent = label;
  statusEl.style.color = color;
}

// Load state from worker
async function loadState() {
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

  // Determine platform
  let platform = "other";
  if (url.includes("claude.ai")) platform = "claude";
  else if (url.includes("gemini.google.com")) platform = "gemini";

  // Update platform icon and name
  const iconEl = $("platformIcon");
  const nameEl = $("platformName");

  if (platform === "claude") {
    nameEl.textContent = "CLAUDE";
    nameEl.style.color = "#fc5000";
    iconEl.style.color = "#fc5000";
  } else if (platform === "gemini") {
    nameEl.textContent = "GEMINI";
    nameEl.style.color = "#524ae9";
    iconEl.style.color = "#524ae9";
  } else {
    nameEl.textContent = "—";
    nameEl.style.color = "#888";
    iconEl.style.color = "#888";
  }

  // Get data from worker
  runtimeSendMessage({ type: "ENGRAM_GET_STATE" }).then((res) => {
    console.log("[Engram] state response received", res);
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

      renderError("State unavailable. Scan Chat is still available.");
      return;
    }

    const session = res.session;
    const health = res.health;

    // Update chat title
    if (session?.name) {
      $("chatTitle").textContent = session.name.length > 20
        ? session.name.substring(0, 20) + "..."
        : session.name;
    }

    // Determine view state
    if (platform === "other") {
      // Not on AI platform
      if (keepLocalScanResult()) return;
      renderIdle("Open Claude to scan this chat", true);
    } else if (scanResults && scanResults.chatId === session?.id) {
      // Already scanned this chat
      renderDone("state-match");

      if (health?.score !== undefined) {
        updateGauge(health.score);
      }
    } else if (hasLocalScanResult) {
      console.log("[Engram] ignoring stale state response", {
        reason: "session mismatch or missing session",
        sessionId: session?.id,
        localChatId: scanResults?.chatId,
      });
      keepLocalScanResult();
    } else {
      // Not scanned yet
      renderIdle(session ? "Scan to analyze this chat" : "State unknown. Scan Chat is still available.");
    }
  });
}

// Scan button
$("btnScan").addEventListener("click", async () => {
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

    const response = await tabsSendMessage(tabs[0].id, { type: "ENGRAM_START_SCAN" });
      if (!response) {
        isScanning = false;
        $("btnScan").disabled = false;
        renderError("Scan did not receive a response. Reload Claude and try again.");
        return;
      }

      if (response.type === "ENGRAM_SCAN_COMPLETE") {
        console.log("[Engram] scan completed", response);
        isScanning = false;
        hasLocalScanResult = true;
        scanResults = response;
        scanResults.chatId = response.chatId;

        renderDone("scan-complete");

        loadState(); // Refresh gauge
      }
  } catch (e) {
    isScanning = false;
    hasLocalScanResult = false;
    $("btnScan").disabled = false;
    renderError("Error starting scan. Reload Claude and try again.");
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

    renderDone("scan-complete-message");

    loadState(); // Refresh gauge
  }
});

// Generate Handoff
$("btnHandoff").addEventListener("click", async () => {
  $("statusBar").textContent = "Generating handoff...";

  const res = await runtimeSendMessage({ type: "ENGRAM_GENERATE_HANDOFF" });
  if (!res) {
      $("statusBar").textContent = "Error generating handoff";
      return;
  }

    if (res.error) {
      $("statusBar").textContent = res.error;
      return;
    }

    const prompt = res.continuationPrompt || res.handoff?.continuationPrompt;
    if (!prompt) {
      $("statusBar").textContent = "No prompt generated";
      return;
    }

    // Copy to clipboard
    navigator.clipboard.writeText(prompt).then(() => {
      $("statusBar").textContent = "✓ Handoff copied to clipboard!";
      $("statusBar").style.color = "#22c55e";
      setTimeout(() => {
        $("statusBar").textContent = "";
      }, 3000);
    }).catch(() => {
      $("statusBar").textContent = "Clipboard blocked — see console";
      $("statusBar").style.color = "#ef4444";
    });
});

// Settings
$("btnSettings").addEventListener("click", () => {
  _api.runtime.openOptionsPage();
});

// Export
$("btnExport").addEventListener("click", () => {
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
});

// Clear
$("btnClear").addEventListener("click", () => {
  if (!confirm("Clear current chat data?")) return;

  scanResults = null;
  hasLocalScanResult = false;
  isScanning = false;
  runtimeSendMessage({ type: "ENGRAM_RESET_ALL" }).then(() => showState("idle"));
});

// Init
renderIdle();
loadState();
setInterval(loadState, 3000);
