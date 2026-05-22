/**
 * Engram — Background Service Worker
 * Receives messages from content scripts, manages storage, handles handoff generation.
 */

import { Storage } from "../storage/storage.js";

const storage = new Storage();
const runtime = typeof browser !== "undefined" ? browser.runtime : chrome.runtime;
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

// ── Handoff Builder ─────────────────────────────────────────────────────────

function buildHandoffPackage(messages, session) {
  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter((m) => m.role === "assistant");

  // Collect all code blocks
  const allCode = messages
    .flatMap((m) => m.codeBlocks || [])
    .filter((c) => c.code.length > 50);

  // Latest code per "file" (detected by filename pattern in text)
  const codeVersions = {};
  messages.forEach((m) => {
    (m.codeBlocks || []).forEach((cb) => {
      const fileMatch = m.text?.match(/([a-zA-Z0-9_\-]+\.[a-z]{2,6})/);
      const key = fileMatch ? fileMatch[1] : `block_${cb.language}`;
      codeVersions[key] = cb.code; // last version wins
    });
  });

  // Build continuation prompt
  const prompt = buildContinuationPrompt(messages, codeVersions, session);

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
    codeVersions,
    continuationPrompt: prompt,
    rawMessages: messages.slice(-20), // last 20 for context
  };
}

function buildContinuationPrompt(messages, codeVersions, session) {
  const lastUserMessages = messages
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => `- ${m.text.slice(0, 200)}`)
    .join("\n");

  const codeSection = Object.entries(codeVersions)
    .map(([file, code]) => `### ${file}\n\`\`\`\n${code.slice(0, 500)}\n\`\`\``)
    .join("\n\n");

  return `# Engram Handoff — Session Continuation

## Context
This is a continuation of a previous AI session.
Session had ${messages.length} messages before migration.

## Recent User Intent
${lastUserMessages}

## Current Code State
${codeSection || "_No code blocks detected_"}

## Instructions
Continue from where we left off. The previous session was migrated due to context limits.
Focus on the most recent tasks. Do not re-explain completed work.
`;
}

console.log("[Engram] Background worker started");
