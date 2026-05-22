/**
 * Engram — Options Page
 */

const _storage = (() => {
  if (typeof browser !== "undefined") {
    return {
      get: (keys) => browser.storage.local.get(keys),
      set: (items) => browser.storage.local.set(items),
    };
  }
  return {
    get: (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve)),
    set: (items) => new Promise((resolve) => chrome.storage.local.set(items, resolve)),
  };
})();

const modeRadios = document.querySelectorAll("input[name='mode']");
const keySection = document.getElementById("keySection");
const apiKeyInput = document.getElementById("apiKey");
const btnToggleKey = document.getElementById("btnToggleKey");
const btnSave = document.getElementById("btnSave");
const statusEl = document.getElementById("status");

function getSelectedMode() {
  return document.querySelector("input[name='mode']:checked")?.value || "demo";
}

function applyMode(mode) {
  document.getElementById("optDemo").classList.toggle("selected", mode === "demo");
  document.getElementById("optOwnKey").classList.toggle("selected", mode === "own-key");
  keySection.classList.toggle("visible", mode === "own-key");
}

modeRadios.forEach((radio) => {
  radio.addEventListener("change", () => applyMode(radio.value));
});

btnToggleKey.addEventListener("click", () => {
  const isPassword = apiKeyInput.type === "password";
  apiKeyInput.type = isPassword ? "text" : "password";
  btnToggleKey.textContent = isPassword ? "Hide" : "Show";
});

btnSave.addEventListener("click", async () => {
  const mode = getSelectedMode();
  const apiKey = apiKeyInput.value.trim();

  if (mode === "own-key" && !apiKey) {
    showStatus("Enter your Gemini API key first.", "error");
    return;
  }

  await _storage.set({ handoffMode: mode, geminiApiKey: apiKey });
  showStatus("Settings saved.", "success");
});

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
  setTimeout(() => { statusEl.textContent = ""; statusEl.className = "status"; }, 3000);
}

async function loadSettings() {
  const data = await _storage.get(["handoffMode", "geminiApiKey"]);
  const mode = data.handoffMode || "demo";

  const radio = document.querySelector(`input[name='mode'][value='${mode}']`);
  if (radio) radio.checked = true;

  apiKeyInput.value = data.geminiApiKey || "";
  applyMode(mode);
}

loadSettings();
