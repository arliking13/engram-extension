# Project Status

Last updated: 2026-05-22 by Codex.

## Snapshot

Engram is a browser extension MVP for preserving continuity across long AI-assisted work sessions. The current focus is the Claude.ai path: parse chat content, store it by project, show context health in the popup, and export a handoff prompt/package.

## Current State

- Base extension structure exists under `extension/`.
- `README.md` describes a Chrome MV3 development install flow.
- `CLAUDE.md` describes Firefox plus Chrome intent, Claude.ai as MVP priority, Gemini as a later/stub platform, and IndexedDB-backed project isolation.
- The app should remain scoped to the MVP until the Claude.ai demo path is solid.

## Known Issues To Preserve

- Firefox MV3 messaging may have a listener mismatch or "No listener" failure between content script and background.
- Firefox expects Promise-style runtime messaging in places where callback-style messaging may currently be used.
- `utils/compat.js` may call `runtime.sendMessage(msg, callback)` even when using the Firefox `browser` API, which is likely incorrect.
- Claude.ai MutationObserver capture still needs verification against the live page.

## Last Documentation Change

Created project continuity files so Claude Code and Codex can share project memory safely:

- `AGENTS.md`
- `STATUS.md`
- `DECISIONS.md`
- `TASKS.md`

No source code changed.

## Verification

- Read `README.md`.
- Read `CLAUDE.md`.
- Created root documentation memory files only.

## Next Handoff Note

Next agent should inspect the extension source and git state, then work on the runtime messaging path before adding new features.

After any future implementation change, update `STATUS.md`, `DECISIONS.md` when decisions change, and `TASKS.md` before committing.
