# Engram - Project Context for Claude Code

## What This Is

Engram is a Firefox and Chrome browser extension for preserving continuity in AI-assisted work sessions.
It watches for degradation in long chats and generates a handoff package so the user can continue in a fresh chat.

## Hackathon

- Scale Without Borders AI Hackathon
- Submission deadline: May 24, 2025, 11:59 PM EST
- Demo Day: May 27, 2025
- Submission platform: Devpost
- Judging criteria, 25% each: Problem and Impact, Technical Execution, Creativity and Innovation, Pitch and Demo

## Key Project Decisions

### Platforms

- MVP: Claude.ai is the priority.
- Planned: Gemini, with a stub already present.
- ChatGPT was not the original demo priority because no demo subscription was available.

### AI For Handoff Generation

- Gemini 1.5 Flash was the planned free-tier option.
- Do not rely on local models for the hackathon build.
- Avoid Gemini 2.5 Flash for this MVP because thinking-mode billing was a concern.

### Browser

- Firefox is the primary developer test browser.
- Preserve cross-browser architecture through `utils/compat.js`.

### Storage

- IndexedDB is used through `background/worker.js`.
- Each project is isolated by `projectId`.
- Global settings and templates are shared.

## Project Structure

```text
engram-extension/
  extension/
    manifest.json              # MV3, Firefox + Chrome
    utils/
      compat.js                # Browser/Chrome API shim
    platforms/
      base/parser.js           # Shared parser interface
      claude/parser.js         # Claude.ai DOM parser (MVP)
      gemini/parser.js         # Stub (TODO)
    background/
      worker.js                # Service worker, IndexedDB, handoff logic
    storage/
      storage.js               # Legacy IndexedDB wrapper; logic moved to worker.js
    popup/
      popup.html / .css / .js  # Extension UI
  README.md
```

## Current Status

- [x] Basic extension structure created.
- [x] Loads in Firefox without errors.
- [x] Background script runs.
- [ ] Fix the "No listener" issue between content script and background.
- [ ] Verify Claude.ai MutationObserver message capture.
- [ ] Implement Gemini parser.
- [ ] Integrate Gemini 1.5 Flash API for handoff generation.
- [ ] Finish popup UI.
- [ ] Create Devpost demo video.

## Known Issues

1. Firefox MV3: async IIFE + `return true` + `sendResponse` does not work in Firefox.
   Firefox expects either a Promise from an async listener or a synchronous `sendResponse`.
2. `browser.runtime.sendMessage` with a callback is not supported in Firefox; Promise style is required.
3. `compat.js` calls `_api.runtime.sendMessage(msg, callback)` when `_api === browser`, which is incorrect.

## Important Principles

- Lightweight monitoring with MutationObserver, not polling.
- Incremental processing; do not rescan the whole chat continuously.
- Project-isolated data storage.
- Handoff generation is one AI call when the user clicks the button, not continuous background work.

## Companion Tool

The local knowledge-base tool lives outside this repo at:

```text
C:\Users\temir\Documents\Web_Projects\AI_Knowledge_Base\
```

It contains `kb.py` and is separate from Engram.

## Product Positioning

Do not position Engram as cloning chats.
Position it as a continuity layer for AI-assisted workflows.

Slogan: "Keep the thread. Never lose context."
