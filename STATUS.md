# Project Status

Last updated: 2026-05-22 by Claude Code.

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

## Last Code Change (LinkedIn widget live-fix: widget not appearing on search-results pages)

All three LinkedIn job files were rewritten to fix a live test failure where no widget appeared on `https://www.linkedin.com/jobs/search-results/?currentJobId=...`.

**Root causes fixed:**
1. Parser relied on h1/h2/h3 for title — LinkedIn search-results renders the job title only as an `<a href="/jobs/view/{id}">` link, not a heading.
2. Single `checkAndRender()` call on load — LinkedIn's React app renders the job detail panel asynchronously after `document_idle`, so a single check always ran too early.
3. Buttons captured `job` at inject-time — if the widget was injected with null job data, buttons had no data even after extraction succeeded.
4. No try/catch around injection — any error silently stopped the widget from appearing.
5. No MutationObserver — couldn't detect when LinkedIn rendered the job detail panel.

**Fixes applied per file:**

`job-detector.js`:
- Regex changed from `\d+` to `[\w-]+` for `currentJobId` param (handles alphanumeric IDs).
- Checks `window.location.search` directly before full URL.
- DOM fallback broadened to include `[class*="job-details"]`, `[class*="jobs-unified-top-card"]`, `[class*="top-card__job-title"]`, `[data-job-id]`, `[class*="job-view-layout"]`.

`linkedin-parser.js`:
- Title extraction now uses job ID from URL to find `a[href*="/jobs/view/${jobId}"]` — the authoritative title link on search-results pages.
- Added `[class*="job-details-jobs-unified-top-card__*"]` selectors (modern LinkedIn class patterns).
- Fallback: scan all `a[href*="/jobs/view/"]` tags for a title-length string.
- Description: dedicated containers tried first; falls back to "About the job" body text parsing.

`job-widget.js`:
- `console.log('[Engram] LinkedIn widget script loaded')` placed OUTSIDE the IIFE — guaranteed to execute.
- `currentJob` is a module-level variable updated on every `checkAndRender()`. Buttons read from it, not a stale inject-time closure.
- `updateWidgetInfo()` updates info line without re-injection; uses `data-engram-info` attribute.
- `checkAndRender()` fully wrapped in try/catch; logs `[Engram] LinkedIn widget injection failed` on error.
- `bootstrap()`: immediate check + retries at 500ms, 1500ms, 3000ms.
- `startPolling()`: every 2s for up to 40s (MAX_POLLS=20), then switches to URL-change-only poll.
- `startMutationWatch()`: MutationObserver on `document.body` direct children, 500ms debounce.

**Required logs confirmed present:** `LinkedIn widget script loaded`, `LinkedIn detection tick`, `LinkedIn job context detected`, `LinkedIn extraction result`, `LinkedIn widget injected`, `LinkedIn widget updated`, `LinkedIn widget injection failed`.

**Syntax check:** `node --check` passed on all three files.

**Not yet live-tested in Firefox.** Verification steps in HANDOFF.md.

## Last Code Change (LinkedIn Job Search skeleton)

**New files** (untracked until first commit):
- `extension/platforms/jobs/job-detector.js` — sets `window.__engramJobs.detectJobPage()`. Detects LinkedIn job detail pages by URL pattern (`/jobs/view/{id}/`, `?currentJobId=`) and DOM fallback (h1 heading selectors). No network calls.
- `extension/platforms/jobs/linkedin-parser.js` — sets `window.__engramJobs.extractJob()`. Extracts `title`, `company`, `location`, `remoteStatus`, `salary`, `description`, `url`, `capturedAt` from the LinkedIn Jobs DOM using multiple selector fallbacks. Logs extraction result (fields only, no description text). No network calls.
- `extension/platforms/jobs/job-widget.js` — IIFE content script. Calls `detectJobPage()` and `extractJob()` on load and again on SPA URL changes (2-second polling). Injects a 228px fixed-position widget (bottom-right) in Engram's dark theme (#1a1a1a / #a78bfa). Widget has: Engram logo, job title·company info line, Save Job button, Copy AI Prompt button, status line, Close button. Save Job sends `ENGRAM_SAVE_JOB` to the background worker. Copy AI Prompt builds an 8-section structured evaluation prompt (legitimacy, red flags, remote quality, company credibility, salary, Canada newcomer fit, verify questions, recommendation) and copies it to clipboard. No external API calls.

**Modified files**:
- `extension/manifest.json` — added LinkedIn content scripts entry (matches `https://www.linkedin.com/jobs/*` and `https://*.linkedin.com/jobs/*`, loads all three job scripts, `run_at: document_idle`). Added matching host permissions.
- `extension/background/worker.js` — added `storeApi` constant (`browser.storage.local` / `chrome.storage.local`). Added `ENGRAM_SAVE_JOB` case to `routeMessage()`. Added `handleSaveJob()`: reads `engramSavedJobs` array from `storage.local`, appends the new job with `savedAt` timestamp, writes back. Logs `[Engram] job saved`.

**What was not changed**: `claude/parser.js`, `popup.js`, `popup.html`, `popup.css`, `settings`, or any existing Claude flow.

**Architecture note**: Job Search is a lightweight additive layer. Engram remains an AI chat continuity tool. The job workflow is: LinkedIn page → widget detects job → user copies AI analysis prompt → user pastes into Claude/GPT/Gemini → (future) Engram captures that AI session for continuity handoff.

**No external API calls** are made by this skeleton. All data stays local.

## Last Code Change (Settings: Demo Mode architecture simplification)

- `DEMO_HANDOFF_ENDPOINT` constant added to `popup.js`. Contains a placeholder URL (`YOUR-VERCEL-APP`). TODO comment marks it for replacement before Demo Day.
- `isDemoEndpointPlaceholder()` helper: returns true if the constant still contains the placeholder string. `tryAIHandoff()` checks this and falls back immediately without making a network call.
- Demo Mode no longer asks the user for a Vercel endpoint URL. The endpoint is baked into the extension constant. Users see only a status line: "Demo backend URL not connected yet." (amber) or "Connected to Engram demo backend." (green), set by `updateDemoStatus()`.
- `demoEndpoint` removed from `DEFAULT_SETTINGS` and all storage/settings logic. Demo Mode stores nothing sensitive.
- `checkDemoEndpointWarning()` removed; replaced by `updateDemoStatus()` which reads `isDemoEndpointPlaceholder()` only.
- `inputDemoEndpoint` element and its `input` event listener removed from HTML and JS.
- `demoEndpointWarning` element removed from HTML; replaced by `#demoStatus` div whose `className` is set dynamically.
- Custom Mode panel updated: provider is now a `<select>` element (Gemini / OpenAI) with id `selectProvider` instead of a static text value.
- Custom Mode panel now shows a warning note: "Your API key is stored locally on this device. For best security, use a restricted key or your own server-side proxy."
- API key placeholder updated from "Paste Gemini API key" to "Paste your API key" to match the multi-provider select.
- `saveSettings()` reads `selectProvider.value` for `customProvider`; clears `customApiKey` and `customEndpoint` when saving in Demo Mode (nothing sensitive stored in Demo).
- `tryAIHandoff()`: Demo path checks `isDemoEndpointPlaceholder()` first, logs fallback and returns false if true; otherwise calls `DEMO_HANDOFF_ENDPOINT`. Custom path uses `customEndpoint`; returns false if empty. All failure paths log `[Engram] handoff generation fallback used`.
- `DEFAULT_SETTINGS` now has `customProvider: "gemini"` instead of `provider: "gemini"`.
- Privacy note updated: "No API keys are stored in the extension."
- CSS additions: `.settings-demo-ok` (green status), `.settings-select` (cursor: pointer on select), `.settings-note-warn` (amber warning note with normal line-height).
- Settings view stability guard unchanged: `loadState()` returns early when `currentState === "settings"`.

## Last Code Change (Settings: AI Handoff Generation + stability)

- Added settings guard at the top of `loadState()`: if `currentState === "settings"`, returns immediately and logs `[Engram] settings view kept during state refresh`. The 3-second polling interval can no longer overwrite the settings view while the user is editing it.
- Added `storageGet` / `storageSet` helpers that use Promise-based `browser.storage.local` on Firefox and callback-wrapped `chrome.storage.local` on Chrome, consistent with the existing messaging helpers.
- Added `DEFAULT_SETTINGS` (`mode: "demo"`, `provider: "gemini"`, empty endpoints/key) and runtime `engramSettings` object.
- Added `loadSettings()`: reads `engramSettings` from `browser.storage.local`, merges with defaults, calls `applySettingsToUI()`. Called on init and when the settings view opens.
- Added `applySettingsToUI()`, `updateModeToggle()`, `checkDemoEndpointWarning()`, `saveSettings()` in `popup.js`.
- Added `tryAIHandoff()`: if a Demo or Custom endpoint is configured, POSTs `{ messages }` to it and copies the returned `continuationPrompt` to clipboard. Returns `false` on any failure (missing endpoint, HTTP error, JSON parse failure, clipboard error) so the caller falls back to the existing local export flow.
- Updated `btnHandoff` click handler: tries `tryAIHandoff()` first; only proceeds to the existing `ENGRAM_GENERATE_HANDOFF` worker message if AI generation returns false.
- Added `btnModeDemo` / `btnModeCustom` click handlers and `btnSaveSettings` / `inputDemoEndpoint` event listeners.
- `btnSettings` click now calls `loadSettings()` in addition to `showState("settings")`.
- `btnTestConnection` added to HTML as a disabled placeholder (tooltip: "Set a Demo endpoint and save to enable").
- Added AI Handoff Generation section to `settingsView` in `popup.html`: description note, Mode toggle (Demo/Custom), Demo panel (Vercel endpoint URL input + proxy note + missing-endpoint warning div), Custom panel (Provider row + API key password input + optional endpoint input), Save + Test action row.
- Updated Privacy note to be accurate: "Conversation data is stored locally. In Demo Mode, messages are sent to your configured Vercel proxy to generate handoffs."
- Added CSS for `.mode-toggle`, `.mode-btn`, `.mode-btn.active`, `.settings-input-group`, `.settings-input-label`, `.settings-input`, `.settings-warning`, `.settings-action-row`, `.btn-sm`.
- Logs added: `[Engram] settings loaded`, `[Engram] settings saved`, `[Engram] settings view kept during state refresh`, `[Engram] demo endpoint missing`, `[Engram] handoff generation fallback used`. API keys and endpoint secrets are never logged.

## Last Code Change (UI Polish + Settings)

- Rewrote `extension/popup/popup.html`: added Settings view (`#settingsView`) as a 4th state; moved ⚙ button from action-buttons row to the header as a compact icon; removed the non-functional 🕘 History stub button; wrapped idle content in `.idle-content` for centred layout; added `#gaugeHint` div below gauge status for contextual health description.
- Rewrote `extension/popup/popup.css`: introduced CSS custom properties (`--bg`, `--surface`, `--border`, `--accent`, etc.) for consistent theming; added `.btn-icon`, `.btn-back`, `.btn-block`, `.btn-danger`, `.badge`, `.badge-active`, `.badge-soon`, `.settings-section`, `.settings-row`, `.settings-note`, `.settings-danger-row`, `.gauge-hint`, `.idle-content`, `.idle-icon`, `.stat + .stat` divider, shimmer animation on progress bar; improved button disabled state, ghost hover, and stat card layout.
- Updated `extension/popup/popup.js`: added `stateBeforeSettings` variable; extended `showState()` to handle `"settings"`; changed `btnSettings` click to show settings view (instead of `openOptionsPage`); added `btnBack` handler to restore prior state; added `btnClearSettings` handler with same reset logic as `btnClear`; extended `updateGauge()` to populate `#gaugeHint` with a plain-language recommendation per health tier.
- No new durable product or architecture decisions made.

## Verification (UI Polish pass)

- `node --check extension/popup/popup.js` passed.
- `git diff --check` clean (LF/CRLF warning only, no whitespace errors).
- All existing IDs referenced by popup.js are present in new HTML: `btnScan`, `btnHandoff`, `btnExport`, `btnClear`, `btnSettings`, `btnBack`, `btnClearSettings`, `idleView`, `scanningView`, `doneView`, `settingsView`, `scanCount`, `scanProgress`, `userCount`, `aiCount`, `totalCount`, `codeCount`, `gaugeNeedleGroup`, `gaugeStatus`, `gaugeHint`, `statusBar`, `platformIcon`, `platformName`, `chatTitle`.
- No changes to `worker.js`, `parser.js`, `manifest.json`, or storage logic.

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
