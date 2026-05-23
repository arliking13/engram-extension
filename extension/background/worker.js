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
  const session = await storage.getCurrentSession(sender.tab?.id);
  if (msg.messages?.length) {
    await storage.appendMessages(session.id, msg.messages);
  }
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

console.log("[Engram] Background worker started");
