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

function isDemoEndpointPlaceholder() {
  return DEMO_HANDOFF_ENDPOINT.includes("YOUR-VERCEL-APP");
}

// Settings
const DEFAULT_SETTINGS = {
  mode: "demo",
  customProvider: "gemini",
  customApiKey: "",
  customEndpoint: ""
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

function applySettingsToUI() {
  updateModeToggle(engramSettings.mode);

  const apiKeyInput      = $("inputApiKey");
  const customEndpointEl = $("inputCustomEndpoint");
  const providerSelect   = $("selectProvider");
  const panelDemo        = $("panelDemo");
  const panelCustom      = $("panelCustom");

  if (apiKeyInput)      apiKeyInput.value      = engramSettings.customApiKey   || "";
  if (customEndpointEl) customEndpointEl.value = engramSettings.customEndpoint || "";
  if (providerSelect)   providerSelect.value   = engramSettings.customProvider || "gemini";

  if (panelDemo)   panelDemo.style.display   = engramSettings.mode === "demo"   ? "block" : "none";
  if (panelCustom) panelCustom.style.display = engramSettings.mode === "custom" ? "block" : "none";

  updateDemoStatus();
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

async function saveSettings() {
  const apiKeyInput      = $("inputApiKey");
  const customEndpointEl = $("inputCustomEndpoint");
  const providerSelect   = $("selectProvider");

  const next = {
    mode:           engramSettings.mode,
    customProvider: providerSelect   ? providerSelect.value           : "gemini",
    customApiKey:   apiKeyInput      ? apiKeyInput.value              : "",
    customEndpoint: customEndpointEl ? customEndpointEl.value.trim()  : ""
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
    setTimeout(() => { $("statusBar").textContent = ""; }, 3000);
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

function updateChatTitleEl(title) {
  const el = $("chatTitle");
  if (!el) return;
  const display = (title || "").trim();
  if (display) {
    el.textContent = display;
    el.title = display;
    el.classList.remove("no-title");
  } else {
    el.textContent = "Untitled chat";
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

  const healthData = computeHealthFromScan(scanResults);
  lastHealthData = healthData;
  updateGauge(healthData.score);
  updateHealthPanel(healthData);
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
  const statusEl    = $("gaugeStatus");
  const hintEl      = $("gaugeHint");

  if (!needleGroup || !statusEl) return;

  // score 0 = critical = left (-90deg), score 100 = fresh = right (+90deg)
  const angle = -90 + (score / 100 * 180);
  needleGroup.style.transform = `rotate(${angle}deg)`;

  let label, color, hint;
  if (score >= 75) {
    label = "Good";
    color = "#22c55e";
    hint  = "Safe to continue.";
  } else if (score >= 50) {
    label = "Fair";
    color = "#f59e0b";
    hint  = "Prepare a handoff soon.";
  } else if (score >= 25) {
    label = "Risky";
    color = "#f97316";
    hint  = "Generate a handoff before continuing.";
  } else {
    label = "Critical";
    color = "#ef4444";
    hint  = "Move to a fresh chat now.";
  }

  statusEl.textContent = label;
  statusEl.style.color = color;
  if (hintEl) hintEl.textContent = hint;
}

// ── Health computation ──────────────────────────────────────────

function computeHealthFromScan(sr) {
  const msgs = sr.messages || [];
  const totalMsgs   = sr.total     || msgs.length;
  const totalChars  = sr.totalChars  || msgs.reduce((s, m) => s + (m.text?.length || 0), 0);
  const codeCount   = sr.codeCount   || 0;
  const scanDuration = sr.scanDuration || 0;
  const domSize     = sr.domSize     || 0;
  const renderedNodes = sr.renderedNodes || 0;

  // 1. Chat Size Pressure (30%)
  let chatSizePressure = 0;
  if (totalMsgs >= 80)     chatSizePressure += 40;
  else if (totalMsgs >= 50) chatSizePressure += 25;
  else if (totalMsgs >= 30) chatSizePressure += 15;
  else if (totalMsgs >= 15) chatSizePressure += 5;

  if (totalChars >= 100000)     chatSizePressure += 40;
  else if (totalChars >= 50000) chatSizePressure += 25;
  else if (totalChars >= 20000) chatSizePressure += 10;

  if (codeCount >= 20)     chatSizePressure += 20;
  else if (codeCount >= 10) chatSizePressure += 10;
  else if (codeCount >= 5)  chatSizePressure += 5;
  chatSizePressure = Math.min(100, chatSizePressure);

  // 2. Scan Cost Pressure (20%)
  let scanCostPressure = 0;
  if (scanDuration >= 3000)     scanCostPressure += 50;
  else if (scanDuration >= 1500) scanCostPressure += 30;
  else if (scanDuration >= 500)  scanCostPressure += 15;
  const charsPerMsg = totalMsgs > 0 ? totalChars / totalMsgs : 0;
  if (charsPerMsg >= 3000)     scanCostPressure += 30;
  else if (charsPerMsg >= 1500) scanCostPressure += 15;
  else if (charsPerMsg >= 500)  scanCostPressure += 5;
  scanCostPressure = Math.min(100, scanCostPressure);

  // 3. Continuity Risk Pressure (15%)
  let continuityRiskPressure = 0;
  const userText = msgs.filter(m => m.role === "user").map(m => m.text || "").join(" ").toLowerCase();
  const correctionPhrases = [
    "actually,", "wait,", "no,", "instead,", "let's reset", "start over", "ignore that", "scratch that", "never mind",
    "ты не понял", "не так", "давай иначе", "снова", "ты усложняешь", "не то", "зачем ты", "мы же", "я уже говорил", "ты не ответил", "не выдумывай",
  ];
  const correctionCount = correctionPhrases.reduce((n, p) => n + (userText.split(p).length - 1), 0);
  if (correctionCount >= 10) continuityRiskPressure += 40;
  else if (correctionCount >= 5) continuityRiskPressure += 25;
  else if (correctionCount >= 2) continuityRiskPressure += 10;
  const gitCount = (userText.match(/\bgit\b|branch|commit|merge|rebase/g) || []).length;
  if (gitCount >= 10) continuityRiskPressure += 30;
  else if (gitCount >= 5) continuityRiskPressure += 15;
  const todoCount = (userText.match(/\btodo\b|next step|\bnext:/g) || []).length;
  if (todoCount >= 5) continuityRiskPressure += 20;
  else if (todoCount >= 2) continuityRiskPressure += 10;
  continuityRiskPressure = Math.min(100, continuityRiskPressure);

  // 4. Scan Quality Pressure (5%)
  let scanQualityPressure = 0;
  const emptyMsgs = msgs.filter(m => !m.text || m.text.trim().length < 2).length;
  if (emptyMsgs >= 3) scanQualityPressure += 50;
  else if (emptyMsgs >= 1) scanQualityPressure += 20;
  const missingRole = msgs.filter(m => !m.role).length;
  if (missingRole >= 1) scanQualityPressure += 30;
  scanQualityPressure = Math.min(100, scanQualityPressure);

  // 5. Browser Load Pressure (30%)
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

  const weightedPressure =
    chatSizePressure   * 0.30 +
    browserLoadPressure * 0.30 +
    scanCostPressure   * 0.20 +
    continuityRiskPressure * 0.15 +
    scanQualityPressure * 0.05;

  const score = Math.round(Math.max(0, Math.min(100, 100 - weightedPressure)));

  let migrationRisk, migrationRiskClass;
  if (score >= 75)      { migrationRisk = "Low";      migrationRiskClass = "risk-low"; }
  else if (score >= 55) { migrationRisk = "Medium";   migrationRiskClass = "risk-medium"; }
  else if (score >= 30) { migrationRisk = "High";     migrationRiskClass = "risk-high"; }
  else                  { migrationRisk = "Critical"; migrationRiskClass = "risk-critical"; }

  let browserLoad;
  if (browserLoadPressure < 25)      browserLoad = "Smooth";
  else if (browserLoadPressure < 50) browserLoad = "Slightly Heavy";
  else if (browserLoadPressure < 75) browserLoad = "Heavy";
  else                               browserLoad = "Very Heavy";

  let action;
  if (score >= 75)      action = "Safe to continue";
  else if (score >= 55) action = "Prepare a handoff soon";
  else if (score >= 30) action = "Generate a handoff before continuing";
  else                  action = "Move to a fresh chat now";

  const reasons = [];
  if (totalMsgs >= 15 && chatSizePressure >= 15) reasons.push("This chat is getting long");
  if (codeCount >= 5)                            reasons.push("There are many code blocks");
  if (totalChars >= 20000)                       reasons.push("Important details may be buried above");
  if (correctionCount >= 2)                      reasons.push("The conversation has changed direction several times");
  if (scanDuration >= 500)                       reasons.push("Engram took longer than usual to scan this chat");
  if (browserLoadPressure >= 25)                 reasons.push("The page is responding slower");
  if (emptyMsgs >= 1)                            reasons.push("Some messages may not have been captured cleanly");

  return {
    score,
    health: score,           // alias for debug consumers
    pressure: { chatSizePressure, scanCostPressure, continuityRiskPressure, scanQualityPressure, browserLoadPressure },
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
    if (hd.score >= 75)      cls += " action-safe";
    else if (hd.score >= 55) cls += " action-soon";
    else if (hd.score >= 30) cls += " action-handoff";
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
- **Platform:** Claude.ai
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
    `- **Source:** Claude.ai`,
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

- **Source:** Claude.ai
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
    sourcePlatform: sr.platform || "claude",
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

    // Update chat title — prefer scanned sourceTitle, fall back to session name
    updateChatTitleEl(scanResults?.sourceTitle || session?.name || null);

    // Determine view state
    if (platform === "other") {
      // Not on AI platform
      if (keepLocalScanResult()) return;
      renderIdle("Open Claude to scan this chat", true);
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

        updateChatTitleEl(response.sourceTitle || null);
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

    updateChatTitleEl(msg.sourceTitle || null);
    renderDone("scan-complete-message");

    loadState(); // Refresh gauge
  }
});

// Generate Handoff
$("btnHandoff").addEventListener("click", async () => {
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
    setTimeout(() => { statusBar.textContent = ""; }, 4000);
    return;
  }

  // No local scan — try worker fallback
  console.log("[Engram] no local scan results, trying worker handoff");
  const res = await runtimeSendMessage({ type: "ENGRAM_GENERATE_HANDOFF" });
  if (!res) {
    statusBar.textContent = "Scan first to generate a handoff";
    return;
  }
  if (res.error) {
    statusBar.textContent = res.error;
    return;
  }
  const prompt = res.continuationPrompt || res.handoff?.continuationPrompt;
  if (!prompt) {
    statusBar.textContent = "No handoff data — scan first";
    return;
  }
  try {
    await navigator.clipboard.writeText(prompt);
    statusBar.textContent = "✓ Handoff copied to clipboard!";
    statusBar.style.color = "#22c55e";
  } catch (e) {
    statusBar.textContent = "Clipboard blocked — see console";
    statusBar.style.color = "#ef4444";
  }
  setTimeout(() => { statusBar.textContent = ""; }, 3000);
});

// Export Migration Package (immediate, no file picker)
$("btnExportPackage").addEventListener("click", async () => {
  const statusBar = $("statusBar");

  if (!scanResults) {
    statusBar.textContent = "Scan first to export a migration package";
    statusBar.style.color = "";
    setTimeout(() => { statusBar.textContent = ""; }, 3000);
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
  } catch (e) {
    console.error("[Engram] package export failed", e);
    statusBar.textContent = "Package export failed";
    statusBar.style.color = "#ef4444";
  }

  setTimeout(() => { statusBar.textContent = ""; }, 4000);
});

// Export Migration Package with Files (file picker first)
$("btnExportWithFiles").addEventListener("click", async () => {
  const statusBar = $("statusBar");

  if (!scanResults) {
    statusBar.textContent = "Scan first to export a migration package";
    statusBar.style.color = "";
    setTimeout(() => { statusBar.textContent = ""; }, 3000);
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
  } catch (e) {
    console.error("[Engram] package export failed", e);
    statusBar.textContent = "Package export failed";
    statusBar.style.color = "#ef4444";
  }

  setTimeout(() => { statusBar.textContent = ""; }, 4000);
});

// Settings
$("btnSettings").addEventListener("click", () => {
  if (currentState === "settings") return;
  stateBeforeSettings = currentState;
  showState("settings");
  loadSettings();
});

$("btnBack").addEventListener("click", () => {
  // Never return to settings — compute a safe fallback if stateBeforeSettings is missing or corrupted
  const target = (stateBeforeSettings && stateBeforeSettings !== "settings")
    ? stateBeforeSettings
    : (scanResults ? "done" : isScanning ? "scanning" : "idle");
  showState(target);
});

$("btnClearSettings").addEventListener("click", () => {
  if (!confirm("Clear all captured data?")) return;
  scanResults = null;
  hasLocalScanResult = false;
  isScanning = false;
  stateBeforeSettings = null;
  runtimeSendMessage({ type: "ENGRAM_RESET_ALL" }).then(() => showState("idle"));
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

// Mode toggle
$("btnModeDemo").addEventListener("click", () => {
  engramSettings.mode = "demo";
  updateModeToggle("demo");
  $("panelDemo").style.display   = "block";
  $("panelCustom").style.display = "none";
  updateDemoStatus();
});

$("btnModeCustom").addEventListener("click", () => {
  engramSettings.mode = "custom";
  updateModeToggle("custom");
  $("panelDemo").style.display   = "none";
  $("panelCustom").style.display = "block";
  updateDemoStatus();
});

// Save settings
$("btnSaveSettings").addEventListener("click", saveSettings);

// Init
renderIdle();
loadSettings();
loadState();
setInterval(loadState, 3000);
