/**
 * Engram — Popup Script
 */

const $ = (id) => document.getElementById(id);

async function loadState() {
  chrome.runtime.sendMessage({ type: "ENGRAM_GET_STATE" }, (res) => {
    if (chrome.runtime.lastError || !res) return;

    const { session, health, messageCount } = res;

    // Project name
    $("projectName").textContent = session?.name || "No active project";

    // Message count
    $("msgCount").textContent = messageCount || 0;

    // Health
    if (health) {
      const score = health.score ?? 100;
      const bar = $("healthBar");
      bar.style.width = `${score}%`;
      bar.style.background = health.color || "#22c55e";
      $("healthLabel").textContent = health.label || "Healthy";
      $("healthScore").textContent = `${score}%`;
    }
  });
}

// Generate handoff
$("btnHandoff").addEventListener("click", () => {
  $("statusBar").textContent = "Generating handoff...";
  chrome.runtime.sendMessage({ type: "ENGRAM_GENERATE_HANDOFF" }, (res) => {
    if (chrome.runtime.lastError || !res) {
      $("statusBar").textContent = "Error generating handoff";
      return;
    }
    if (res.error) {
      $("statusBar").textContent = res.error;
      return;
    }

    const { handoff } = res;

    // Copy continuation prompt to clipboard
    navigator.clipboard
      .writeText(handoff.continuationPrompt)
      .then(() => {
        $("statusBar").textContent = "✓ Handoff copied to clipboard!";
        $("handoffCount").textContent =
          parseInt($("handoffCount").textContent || "0") + 1;
        setTimeout(() => ($("statusBar").textContent = ""), 3000);
      })
      .catch(() => {
        $("statusBar").textContent = "Clipboard blocked — see console";
      });
  });
});

// New project
$("btnNewProject").addEventListener("click", () => {
  const name = prompt("Project name:");
  if (!name?.trim()) return;

  chrome.runtime.sendMessage(
    { type: "ENGRAM_NEW_PROJECT", name: name.trim() },
    (res) => {
      if (res?.project) {
        $("projectName").textContent = res.project.name;
        $("statusBar").textContent = `✓ Project "${res.project.name}" created`;
        setTimeout(() => ($("statusBar").textContent = ""), 3000);
      }
    }
  );
});

// Init
loadState();
