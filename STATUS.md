# Project Status

Last updated: 2026-05-22 by Codex.

## Snapshot

Engram is a browser extension MVP for preserving continuity across long AI-assisted work sessions. The current focus is the Claude.ai path: parse chat content, store it by project, show context health in the popup, and export a handoff prompt/package.

## Current State

- Base extension structure exists under `extension/`.
- `README.md` describes a Chrome MV3 development install flow.
- `CLAUDE.md` describes Firefox plus Chrome intent, Claude.ai as MVP priority, Gemini as a later/stub platform, and IndexedDB-backed project isolation.
- The app should remain scoped to the MVP until the Claude.ai demo path is solid.
- Firefox messaging has been stabilized in the current worktree by using Promise-based `browser.*` messaging paths while preserving Chrome callback paths.
- Claude parser now uses DOM MutationObserver capture as the primary path, targeting `[data-testid="user-message"]` for users and assistant action buttons for assistant containers.
- Claude parser now preserves repeated user messages as separate DOM messages, filters timestamp/date-only assistant candidates, removes internal thinking lines, and collapses doubled assistant text.
- Popup now renders `idleView` immediately on load and falls back to a visible Scan Chat state if `ENGRAM_GET_STATE` fails or returns null.
- Popup now keeps a completed local scan result visible when a later async `ENGRAM_GET_STATE` response is null/unavailable.

## Known Issues To Preserve

- Live Firefox extension testing is still needed with the extension loaded from `extension/`.
- `web-ext` is not installed locally; `npx web-ext lint` was attempted but blocked by sandbox/network safety.
- Firefox Promise-path messaging was verified with a local Node VM harness, not by clicking through a live Firefox profile.
- `utils/compat.js` is not currently loaded by `manifest.json`; active fixes were applied directly to the worker, popup, and Claude parser messaging paths.
- Claude.ai MutationObserver capture still needs manual Firefox verification against the live page after the DOM selector update.

## Last Code Change

- Updated `extension/platforms/claude/parser.js` message identity so DOM messages use stable per-node source keys instead of global `role:text` dedupe.
- Repeated user messages such as "привет", "хорошо", and "окей" should now count when they are separate DOM message nodes.
- Assistant timestamp/date-only candidates such as `14:02` and `21 мая` are filtered.
- Assistant internal/thinking lines containing `Thinking about` or `Deciphered` are skipped.
- Adjacent doubled assistant text such as `Привет!Привет!` and `Хорошо!Хорошо! 👍` is collapsed.
- Added popup render-race guards: `isScanning`, `hasLocalScanResult`, `lastRenderSource`, `renderDone()`, and `keepLocalScanResult()`.
- Scan Chat is disabled during scanning and re-enabled after completion/failure.
- If Scan Chat returns `ENGRAM_SCAN_COMPLETE`, the popup keeps `doneView` visible even if background state polling later fails.
- Added popup logs for scan started, scan completed, keeping local scan result, ignoring stale state response, and rendering done state.
- Updated `extension/popup/popup.js` so the popup always shows a visible idle fallback before async state loading.
- Added popup logs for load, state request/response, idle/done/error rendering, and Scan Chat clicks.
- If worker state is unavailable or unknown, the popup keeps the Scan Chat button visible and shows a small idle hint instead of staying blank.
- Updated `extension/platforms/claude/parser.js` so DOM mutations trigger message extraction and background sends.
- User messages are extracted from `[data-testid="user-message"]`.
- Assistant messages are inferred from `[data-testid="action-bar-copy"]` / `[data-testid="action-bar-retry"]` by walking up to a meaningful parent container, preferring containers with `group` in the class name.
- Added normalized role/text deduplication, assistant text cleanup, repeated-text collapse, and `[Engram]` debug logs for mutation, counts, extraction, duplicate skips, and sends.
- Stabilized runtime messaging between popup, Claude content script, and background worker.
- `extension/background/worker.js` now returns Promises for Firefox listeners and uses `sendResponse` only on the Chrome path.
- `extension/platforms/claude/parser.js` now returns a Promise for Firefox `ENGRAM_START_SCAN` and uses a small fire-and-forget send helper for storage/health messages.
- `extension/popup/popup.js` now wraps `runtime.sendMessage`, `tabs.query`, and `tabs.sendMessage` so Firefox uses Promise APIs and Chrome uses callbacks.
- No new durable product or architecture decision was made.

## Verification

- `node --check extension/background/worker.js`
- `node --check extension/platforms/claude/parser.js`
- `node --check extension/popup/popup.js`
- `git diff --check -- extension/background/worker.js extension/platforms/claude/parser.js extension/popup/popup.js`
- Local Node VM harness simulating Firefox MV3 `browser.*` Promise APIs passed for worker, parser, and popup messaging.
- Local Node VM harness for the Claude DOM parser passed: one user node, one duplicated assistant container, cleaned assistant text, and one background send with deduped messages.
- Local Node VM harness for the popup null-state fallback passed: with `ENGRAM_GET_STATE` returning null, `idleView` remained visible with a state-unavailable hint.
- Local Node VM harness for the popup scan/null-state race passed: after `ENGRAM_SCAN_COMPLETE`, a null state response no longer overwrote `doneView`.
- Local Node VM harness for parser count/cleanup passed: repeated user text counted twice, Russian date labels filtered, internal thinking removed, and doubled assistant text collapsed.

## Next Handoff Note

Next agent should load the extension in Firefox and confirm:

- Popup can request `ENGRAM_GET_STATE` from the background worker.
- Popup opens with the Scan Chat idle view visible, not just the header/platform row.
- Popup can send `ENGRAM_START_SCAN` to the Claude.ai content script and receive `ENGRAM_SCAN_COMPLETE`.
- Done view remains visible after scan completion even if state polling reports null/unavailable state.
- Content script can send `ENGRAM_NEW_MESSAGES` and `ENGRAM_HEALTH_UPDATE` to the background worker without "No listener" or closed-port errors.
- Claude content logs show user messages found, assistant candidates found, message extracted, duplicate skipped, and message sent to background while a Claude chat mutates.
- Counts in the tested Claude chat should be close to the visible conversation, with no timestamp/date labels counted as assistant messages.

After any future implementation change, update `STATUS.md`, `DECISIONS.md` when decisions change, and `TASKS.md` before committing.
